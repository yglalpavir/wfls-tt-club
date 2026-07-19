/* ========================================
   score-engine.js - 积分计算核心（性能优化版）
   ======================================== */

function isMatchRecord(record) { return record['胜者'] && record['负者']; }
function isBonusRecord(record) { return record['类型'] === '比赛结果加分' && record['对象']; }

function getBaseScore(gap) { const ag = Math.abs(gap); if (gap >= 0) { if (ag <= 49) return 30; if (ag <= 99) return 24; if (ag <= 149) return 20; if (ag <= 199) return 16; if (ag <= 299) return 12; if (ag <= 399) return 8; return 4; } if (ag <= 49) return 30; if (ag <= 99) return 36; if (ag <= 149) return 42; if (ag <= 199) return 48; if (ag <= 299) return 54; if (ag <= 399) return 60; return 66; }
function getEventCoefficient(et) { if (!eventCoefficients) return 0.2; return eventCoefficients[et] || 0.2; }
function getTimeWeight(matchDate, snapshotDate) { const mt = new Date(matchDate + 'T00:00:00').getTime(), st = new Date(snapshotDate + 'T00:00:00').getTime(); const dd = (st - mt) / 86400000; if (dd < 0) return 0; return Math.pow(2, -dd / HALF_LIFE_DAYS); }
function calcMatchPoints(winner, loser, eventType, matchDate, snapshotDate, currentScores) { const wScore = currentScores[winner] || DEFAULT_INITIAL_SCORE, lScore = currentScores[loser] || DEFAULT_INITIAL_SCORE; return getBaseScore(wScore - lScore) * getEventCoefficient(eventType) * getTimeWeight(matchDate, snapshotDate); }
function calcRawPoints(winner, loser, eventType, currentScores) { const wScore = currentScores[winner] || DEFAULT_INITIAL_SCORE, lScore = currentScores[loser] || DEFAULT_INITIAL_SCORE; return getBaseScore(wScore - lScore) * getEventCoefficient(eventType); }

function getActivePlayers(sortedLog, startDate, endDate) { const ap = new Set(); sortedLog.forEach(r => { if (r['日期'] < startDate || r['日期'] > endDate) return; if (isMatchRecord(r)) { ap.add(r['胜者']); ap.add(r['负者']); } else if (isBonusRecord(r)) { ap.add(r['对象']); } }); return ap; }

// ============ 🔥 性能优化：球员比赛预索引 ============

/**
 * 构建球员比赛索引，避免每次快照都对全量数据做 filter
 * 返回 { playerName: [{date, isWin}, ...] }，每个球员的数组按日期排序
 * 同时返回按日期排序的全量日志（避免重复排序）
 */
function buildPlayerMatchIndex(scoreLog) {
    const sortedLog = [...scoreLog].sort((a, b) => a['日期'].localeCompare(b['日期']));
    const playerMatches = {};  // player -> [{date, isWin}, ...]

    for (const r of sortedLog) {
        if (!isMatchRecord(r)) continue;
        const date = r['日期'];
        const w = r['胜者'], l = r['负者'];

        if (!playerMatches[w]) playerMatches[w] = [];
        playerMatches[w].push({ date, isWin: true });

        if (!playerMatches[l]) playerMatches[l] = [];
        playerMatches[l].push({ date, isWin: false });
    }

    return { sortedLog, playerMatches };
}

/**
 * 从预建索引中快速获取球员在日期范围内的比赛统计
 * @returns { totalMatches, wins, winRate }
 */
function getPlayerStatsFromIndex(playerMatches, playerName, startDate, endDate) {
    const matches = playerMatches[playerName];
    if (!matches || !matches.length) return { totalMatches: 0, wins: 0, winRate: '0%' };

    let total = 0, wins = 0;
    for (const m of matches) {
        if (m.date < startDate) continue;
        if (m.date > endDate) break;  // 数组已按日期排序，可以提前退出
        total++;
        if (m.isWin) wins++;
    }
    return {
        totalMatches: total,
        wins: wins,
        winRate: total ? Math.round((wins / total) * 100) + '%' : '0%'
    };
}

// 获取每位球员的首次参赛日期（基于 score log）
// 返回 { playerName: 'YYYY-MM-DD', ... }
function getPlayerFirstAppearanceDate(scoreLog) {
    const firstDate = {};
    for (const r of scoreLog) {
        const date = r['日期'];
        if (isMatchRecord(r)) {
            if (!firstDate[r['胜者']] || date < firstDate[r['胜者']]) firstDate[r['胜者']] = date;
            if (!firstDate[r['负者']] || date < firstDate[r['负者']]) firstDate[r['负者']] = date;
        } else if (isBonusRecord(r)) {
            if (!firstDate[r['对象']] || date < firstDate[r['对象']]) firstDate[r['对象']] = date;
        }
    }
    return firstDate;
}

// 俱乐部数据的首次参赛日期缓存
let _clubFirstAppearanceCache = null;
function getClubFirstAppearanceDate() {
    if (_clubFirstAppearanceCache) return _clubFirstAppearanceCache;
    _clubFirstAppearanceCache = getPlayerFirstAppearanceDate(scoreLogData || []);
    return _clubFirstAppearanceCache;
}

// WTT 数据的首次参赛日期缓存
let _wttFirstAppearanceCache = null;
function getWttFirstAppearanceDate() {
    if (_wttFirstAppearanceCache) return _wttFirstAppearanceCache;
    _wttFirstAppearanceCache = getPlayerFirstAppearanceDate(
        (typeof wttScoreLogData !== 'undefined' && wttScoreLogData) ? wttScoreLogData : []
    );
    return _wttFirstAppearanceCache;
}

// 清除首次参赛日期缓存（数据重新加载时调用）
function clearFirstAppearanceCache() {
    _clubFirstAppearanceCache = null;
    _wttFirstAppearanceCache = null;
}

/**
 * 🔥 性能优化版：使用预建索引计算排名时间线
 * 原来 O(S×D×P×L) → 现在 O(S×D×(L+P))
 */
function calculateAllRankingsWithSeasons(scoreLog, initialScores, seasons) {
    const { sortedLog, playerMatches } = buildPlayerMatchIndex(scoreLog);
    const allRankings = [];
    let seasonStartScores = { ...initialScores };
    let currentScores = { ...initialScores };

    seasons.forEach((season, seasonIndex) => {
        // 赛季继承逻辑
        if (seasonIndex > 0) {
            const ps = seasons[seasonIndex - 1];
            const pes = calculateEndScores(sortedLog, seasonStartScores, ps.startDate, ps.endDate);
            const is2 = {};
            // 🔧 遍历所有在上一赛季有过比赛的球员（而不仅是 seasonStartScores），
            // 确保 flat1300 模式下新球员也能被正确继承
            const allPrevPlayers = new Set([...Object.keys(seasonStartScores), ...Object.keys(pes)]);
            for (const n of allPrevPlayers) {
                const ss = seasonStartScores[n] || DEFAULT_INITIAL_SCORE;
                const es = pes[n] || ss;
                is2[n] = ss + (es - ss) * 0.5;
            }
            for (const n in initialScores) {
                if (!is2[n]) is2[n] = initialScores[n];
            }
            currentScores = is2;
            seasonStartScores = { ...is2 };
        }

        // 赛季初排名
        const id = Object.entries(currentScores)
            .sort((a, b) => b[1] - a[1])
            .map(([n, pt]) => ({
                '姓名': n,
                '当前积分': Math.round(pt * 10) / 10,
                '总场次': 0,
                '胜率': '0%'
            }));
        allRankings.push({
            time: season.startDate,
            label: i18n[currentLang].season_initial_label.replace('{season}', season.label),
            season: season.label,
            isInitial: true,
            data: id
        });

        // 每个快照日期
        season.snapshotDates.forEach(sd => {
            if (sd <= season.startDate) return;

            // 计算积分（这部分仍需遍历全量 log，但只需一次）
            const sc = { ...currentScores };
            sortedLog.forEach(r => {
                if (r['日期'] < season.startDate || r['日期'] > sd) return;
                if (isMatchRecord(r)) {
                    const w = r['胜者'], l = r['负者'];
                    if (!sc[w]) sc[w] = DEFAULT_INITIAL_SCORE;
                    if (!sc[l]) sc[l] = DEFAULT_INITIAL_SCORE;
                    const wg = calcMatchPoints(w, l, r['类型'], r['日期'], sd, sc);
                    sc[w] = Math.max(SCORE_FLOOR, sc[w] + wg);
                    sc[l] = Math.max(SCORE_FLOOR, sc[l] - wg * 0.8);
                } else if (isBonusRecord(r)) {
                    const t = r['对象'];
                    const b = parseFloat(r['分数']) || 0;
                    if (!sc[t]) sc[t] = DEFAULT_INITIAL_SCORE;
                    sc[t] = Math.max(SCORE_FLOOR, sc[t] + b);
                }
            });

            const sap = getActivePlayers(sortedLog, season.startDate, sd);

            // 🔥 使用预建索引快速获取球员统计，不再 filter 全量数据
            const sp = Object.entries(sc)
                .filter(([n]) => sap.has(n))
                .sort((a, b) => b[1] - a[1])
                .map(([n, pt]) => {
                    const stats = getPlayerStatsFromIndex(playerMatches, n, season.startDate, sd);
                    return {
                        '姓名': n,
                        '当前积分': Math.round(pt * 10) / 10,
                        '总场次': stats.totalMatches,
                        '胜率': stats.winRate
                    };
                });
            allRankings.push({
                time: sd,
                label: formatSnapshotLabel(sd),
                season: season.label,
                isInitial: false,
                data: sp
            });
        });

        // 赛季末积分
        currentScores = calculateEndScores(sortedLog, currentScores, season.startDate, season.endDate);
    });
    return allRankings;
}

/**
 * 🔥 异步分块计算版本 — 不仅赛季间 yield，赛季内每 N 个快照也 yield
 * @param {function} onProgress - 进度回调 (current, total, message)
 * @param {number} chunkSize - 每个 chunk 处理多少个快照后 yield（默认 3）
 */
async function calculateAllRankingsWithSeasonsAsync(scoreLog, initialScores, seasons, onProgress, chunkSize) {
    chunkSize = chunkSize || 3;
    const { sortedLog, playerMatches } = buildPlayerMatchIndex(scoreLog);
    const allRankings = [];
    let seasonStartScores = { ...initialScores };
    let currentScores = { ...initialScores };

    // 计算总快照数用于进度
    let totalSnapshots = seasons.length;  // 赛季初节点
    seasons.forEach(s => totalSnapshots += s.snapshotDates.filter(d => d > s.startDate).length);
    let processedSnapshots = 0;

    for (let seasonIndex = 0; seasonIndex < seasons.length; seasonIndex++) {
        const season = seasons[seasonIndex];

        // 赛季继承逻辑
        if (seasonIndex > 0) {
            const ps = seasons[seasonIndex - 1];
            const pes = calculateEndScores(sortedLog, seasonStartScores, ps.startDate, ps.endDate);
            const is2 = {};
            // 🔧 遍历所有在上一赛季有过比赛的球员（而不仅是 seasonStartScores），
            // 确保 flat1300 模式下新球员也能被正确继承
            const allPrevPlayers = new Set([...Object.keys(seasonStartScores), ...Object.keys(pes)]);
            for (const n of allPrevPlayers) {
                const ss = seasonStartScores[n] || DEFAULT_INITIAL_SCORE;
                const es = pes[n] || ss;
                is2[n] = ss + (es - ss) * 0.5;
            }
            for (const n in initialScores) {
                if (!is2[n]) is2[n] = initialScores[n];
            }
            currentScores = is2;
            seasonStartScores = { ...is2 };
        }

        // 赛季初排名
        const id = Object.entries(currentScores)
            .sort((a, b) => b[1] - a[1])
            .map(([n, pt]) => ({
                '姓名': n,
                '当前积分': Math.round(pt * 10) / 10,
                '总场次': 0,
                '胜率': '0%'
            }));
        allRankings.push({
            time: season.startDate,
            label: i18n[currentLang].season_initial_label.replace('{season}', season.label),
            season: season.label,
            isInitial: true,
            data: id
        });
        processedSnapshots++;
        if (onProgress) onProgress(processedSnapshots, totalSnapshots, season.label);

        // 每个快照日期（分块处理）
        const validSnapshots = season.snapshotDates.filter(d => d > season.startDate);
        for (let i = 0; i < validSnapshots.length; i++) {
            const sd = validSnapshots[i];

            // 计算积分
            const sc = { ...currentScores };
            sortedLog.forEach(r => {
                if (r['日期'] < season.startDate || r['日期'] > sd) return;
                if (isMatchRecord(r)) {
                    const w = r['胜者'], l = r['负者'];
                    if (!sc[w]) sc[w] = DEFAULT_INITIAL_SCORE;
                    if (!sc[l]) sc[l] = DEFAULT_INITIAL_SCORE;
                    const wg = calcMatchPoints(w, l, r['类型'], r['日期'], sd, sc);
                    sc[w] = Math.max(SCORE_FLOOR, sc[w] + wg);
                    sc[l] = Math.max(SCORE_FLOOR, sc[l] - wg * 0.8);
                } else if (isBonusRecord(r)) {
                    const t = r['对象'];
                    const b = parseFloat(r['分数']) || 0;
                    if (!sc[t]) sc[t] = DEFAULT_INITIAL_SCORE;
                    sc[t] = Math.max(SCORE_FLOOR, sc[t] + b);
                }
            });

            const sap = getActivePlayers(sortedLog, season.startDate, sd);

            // 使用预建索引
            const sp = Object.entries(sc)
                .filter(([n]) => sap.has(n))
                .sort((a, b) => b[1] - a[1])
                .map(([n, pt]) => {
                    const stats = getPlayerStatsFromIndex(playerMatches, n, season.startDate, sd);
                    return {
                        '姓名': n,
                        '当前积分': Math.round(pt * 10) / 10,
                        '总场次': stats.totalMatches,
                        '胜率': stats.winRate
                    };
                });
            allRankings.push({
                time: sd,
                label: formatSnapshotLabel(sd),
                season: season.label,
                isInitial: false,
                data: sp
            });
            processedSnapshots++;
            if (onProgress) onProgress(processedSnapshots, totalSnapshots, season.label);

            // 🔥 每个快照后都 yield 到浏览器，保持 UI 响应
            if (i < validSnapshots.length - 1) {
                await new Promise(r => setTimeout(r, 0));
            }
        }

        // 🔥 赛季末计算前先 yield，避免长时间冻结
        await new Promise(r => setTimeout(r, 0));
        // 赛季末积分
        currentScores = calculateEndScores(sortedLog, currentScores, season.startDate, season.endDate);

        // 🔥 赛季间 yield
        if (seasonIndex < seasons.length - 1) {
            await new Promise(r => setTimeout(r, 0));
        }
    }

    return allRankings;
}

function calculateEndScores(sl, ss, sst, sen) { const sc={...ss}; sl.forEach(r=>{ if(r['日期']<sst||r['日期']>sen)return; if(isMatchRecord(r)){const w=r['胜者'],l=r['负者'];if(!sc[w])sc[w]=DEFAULT_INITIAL_SCORE;if(!sc[l])sc[l]=DEFAULT_INITIAL_SCORE;const wg=calcMatchPoints(w,l,r['类型'],r['日期'],sen,sc);sc[w]=Math.max(SCORE_FLOOR,sc[w]+wg);sc[l]=Math.max(SCORE_FLOOR,sc[l]-wg*0.8);}else if(isBonusRecord(r)){const t=r['对象'];const b=parseFloat(r['分数'])||0;if(!sc[t])sc[t]=DEFAULT_INITIAL_SCORE;sc[t]=Math.max(SCORE_FLOOR,sc[t]+b);} }); return sc; }
function formatSnapshotLabel(ds) { const d = new Date(ds + 'T00:00:00'); return `${d.getFullYear()}年${d.getMonth()+1}月${d.getDate()}日`; }

// 获取快照日期所在的赛季
function getSeasonForDate(snapshotDate) {
    if (!seasonsData) return null;
    for (const season of seasonsData) {
        if (snapshotDate >= season.startDate && snapshotDate <= season.endDate) return season;
    }
    return seasonsData.length > 0 ? seasonsData[seasonsData.length-1] : null;
}

// 获取某赛季的初始积分（考虑继承）
function getSeasonStartScores(seasonIndex) {
    if (!initialScoresData || !seasonsData) return { ...initialScoresData.initialScores };
    if (seasonIndex <= 0) return { ...initialScoresData.initialScores };
    const sortedLog = [...scoreLogData].sort((a, b) => a['日期'].localeCompare(b['日期']));
    let startScores = { ...initialScoresData.initialScores };
    for (let i = 0; i < seasonIndex; i++) {
        const season = seasonsData[i];
        // 计算该赛季末积分
        const endScores = calculateEndScores(sortedLog, startScores, season.startDate, season.endDate);
        // 50% 继承规则：赛季初积分 + (赛季末 - 赛季初) * 0.5
        const inherited = {};
        const allPrev = new Set([...Object.keys(startScores), ...Object.keys(endScores)]);
        for (const n of allPrev) { const ss = startScores[n] || DEFAULT_INITIAL_SCORE; const es = endScores[n] || ss; inherited[n] = ss + (es - ss) * 0.5; }
        for (const n in initialScoresData.initialScores) { if (!inherited[n]) inherited[n] = initialScoresData.initialScores[n]; }
        startScores = inherited;
    }
    return { ...startScores };
}

// 计算实时积分（按当前日期快照）
function calculateRealtimeRanking() {
    if (!scoreLogData || !initialScoresData || !seasonsData || !seasonsData.length) return null;
    const d = new Date();
    const today = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
    const sortedLog = [...scoreLogData].sort((a, b) => a['日期'].localeCompare(b['日期']));

    // 找到今天所在的赛季（若今天已超出所有赛季，使用最后一个赛季并延伸至今天）
    let activeSeason = null, seasonIndex = -1;
    for (let i = 0; i < seasonsData.length; i++) {
        if (today >= seasonsData[i].startDate && today <= seasonsData[i].endDate) {
            activeSeason = seasonsData[i]; seasonIndex = i; break;
        }
    }
    if (!activeSeason) {
        activeSeason = seasonsData[seasonsData.length - 1];
        seasonIndex = seasonsData.length - 1;
    }

    // 计算赛季起始积分（含继承）
    let currentScores = { ...initialScoresData.initialScores };
    let seasonStartScores = { ...initialScoresData.initialScores };
    for (let i = 0; i <= seasonIndex; i++) {
        const season = seasonsData[i];
        if (i > 0) {
            const prevSeason = seasonsData[i - 1];
            const prevEndScores = calculateEndScores(sortedLog, seasonStartScores, prevSeason.startDate, prevSeason.endDate);
            const inherited = {};
            const allPrevRt = new Set([...Object.keys(seasonStartScores), ...Object.keys(prevEndScores)]);
            for (const n of allPrevRt) { const ss = seasonStartScores[n] || DEFAULT_INITIAL_SCORE; const es = prevEndScores[n] || ss; inherited[n] = ss + (es - ss) * 0.5; }
            for (const n in initialScoresData.initialScores) { if (!inherited[n]) inherited[n] = initialScoresData.initialScores[n]; }
            currentScores = inherited; seasonStartScores = { ...inherited };
        }
        if (i < seasonIndex) { currentScores = calculateEndScores(sortedLog, currentScores, season.startDate, season.endDate); }
    }

    // 从当前赛季初计算到今天的积分
    const sc = { ...currentScores };
    const effectiveEnd = today < activeSeason.startDate ? activeSeason.startDate : today;
    sortedLog.forEach(r => {
        if (r['日期'] < activeSeason.startDate || r['日期'] > effectiveEnd) return;
        if (isMatchRecord(r)) {
            const w = r['胜者'], l = r['负者'];
            if (!sc[w]) sc[w] = DEFAULT_INITIAL_SCORE; if (!sc[l]) sc[l] = DEFAULT_INITIAL_SCORE;
            const wg = calcMatchPoints(w, l, r['类型'], r['日期'], effectiveEnd, sc);
            sc[w] = Math.max(SCORE_FLOOR, sc[w] + wg);
            sc[l] = Math.max(SCORE_FLOOR, sc[l] - wg * 0.8);
        } else if (isBonusRecord(r)) {
            const t = r['对象']; const b = parseFloat(r['分数']) || 0;
            if (!sc[t]) sc[t] = DEFAULT_INITIAL_SCORE;
            sc[t] = Math.max(SCORE_FLOOR, sc[t] + b);
        }
    });

    const activeStart = activeSeason.startDate;
    const sap = getActivePlayers(sortedLog, activeStart, effectiveEnd);
    const sp = Object.entries(sc).filter(([n]) => sap.size === 0 || sap.has(n)).sort((a, b) => b[1] - a[1]).map(([n, pt]) => ({
        '姓名': n, '当前积分': Math.round(pt * 10) / 10,
        '总场次': sortedLog.filter(r => isMatchRecord(r) && r['日期'] >= activeStart && r['日期'] <= effectiveEnd && (r['胜者'] === n || r['负者'] === n)).length,
        '胜率': (() => { const ms = sortedLog.filter(r => isMatchRecord(r) && r['日期'] >= activeStart && r['日期'] <= effectiveEnd && (r['胜者'] === n || r['负者'] === n)); if (!ms.length) return '0%'; return Math.round((ms.filter(r => r['胜者'] === n).length / ms.length) * 100) + '%'; })()
    }));

    return { time: today, label: i18n[currentLang].rank_realtime_label, season: activeSeason.label, isInitial: false, isRealtime: true, data: sp };
}

async function loadInitialScores() { try { initialScoresData = await (await fetch('data/initial-scores.json')).json(); return true; } catch(e) { console.error('initial-scores.json 加载失败', e); return false; } }
async function loadEventCoefficients() { try { eventCoefficients = await (await fetch('data/event-coefficient.json')).json(); return true; } catch(e) { console.error('event-coefficient.json 加载失败', e); return false; } }
async function loadSeasons() { try { seasonsData = (await (await fetch('data/seasons.json')).json()).filter(s => s.visible !== false); return true; } catch(e) { console.error('seasons.json 加载失败', e); seasonsData = []; return false; } }
async function loadScoreLogData() { try { scoreLogData = await (await fetch('data/score-log.json')).json(); clearFirstAppearanceCache(); } catch(e) { scoreLogData = []; } }
async function loadScoreLogForViz() { try { scoreLogData = await (await fetch('data/score-log.json')).json(); clearFirstAppearanceCache(); return true; } catch(e) { scoreLogData = []; return true; } }