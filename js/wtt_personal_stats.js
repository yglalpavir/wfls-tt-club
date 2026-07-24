/* ========================================
   wtt_personal_stats.js - WTT 个人数据页面
   复刻 personal-stats.js，使用 WTT 系列数据
   ======================================== */

let wttPersonalChartSettings = null;  // 折线图设置

// 注：wttScoreLogData 等共享变量已在 wtt_common.js 中声明（let），无需重复声明

// ============ 数据加载 ============

/**
 * 在加载过程中显示进度提示
 * @param {string} msg - 进度文字
 */
function wttPSShowProgress(msg) {
    const el = document.getElementById('wttPersonalResult');
    if (!el) return;
    el.innerHTML = `<div style="display:flex;flex-direction:column;align-items:center;justify-content:center;padding:40px 20px;color:var(--text-secondary);">
        <div class="wtt-spinner" style="width:32px;height:32px;border:3px solid var(--border-color);border-top-color:var(--accent-blue);border-radius:50%;animation:wttSpin 0.8s linear infinite;margin-bottom:12px;"></div>
        <p style="font-size:0.9rem;margin:0;">${msg || '加载数据中...'}</p>
    </div>`;
}

async function wttLoadRankingDataForPersonal() {
    // 显示加载进度
    wttPSShowProgress('准备下载数据文件...');

    try {
        // 🔥 逐个加载数据文件，显示详细进度
        const dataFiles = [
            { name: 'score-log (按赛季)',   loader: wttLoadScoreLog,          label: '比赛记录' },
            { name: 'initial-scores.json',   loader: wttLoadInitialScores,     label: '初始积分' },
            { name: 'settings.json',         loader: wttLoadSettings,          label: '项目设置' },
            { name: 'event-coefficient.json',loader: wttLoadEventCoefficients, label: '赛事系数' },
            { name: 'seasons.json',          loader: wttLoadSeasons,           label: '赛季配置' }
        ];

        for (let i = 0; i < dataFiles.length; i++) {
            const f = dataFiles[i];
            wttPSShowProgress(`正在下载 ${f.label} (${i + 1}/${dataFiles.length}): ${f.name}`);
            // yield 到浏览器，确保 UI 更新
            await new Promise(r => setTimeout(r, 0));
            await f.loader();
        }

        // flat1300 模式不需要 initialScoresData
        const isFlat = wttSettings && wttSettings.scoreMode === 'flat1300';
        if (!isFlat && !wttInitialScoresData) throw new Error('WTT initial-scores 加载失败');
        if (!wttEventCoefficients || !wttSeasonsData) throw new Error('WTT数据加载失败');

        // 更新进度为计算排名
        wttPSShowProgress('正在计算排名积分...');

        // 异步分块计算（带进度回调）
        wttRankingTimeline = await wttCalculateAllRankingsAsync((current, total, label) => {
            wttPSShowProgress(`${label || ''} · 快照 ${current}/${total}`);
        });

        // 加载完成，恢复占位文字
        const el = document.getElementById('wttPersonalResult');
        if (el) {
            el.innerHTML = `<div class="compare-placeholder">
                <i class="fa-solid fa-user-chart"></i>
                <p>选择一名球员查看个人数据</p>
            </div>`;
        }

        return true;
    } catch(e) {
        console.error('WttPersonalStats: 排名计算失败', e);
        wttRankingTimeline = [];
        const el = document.getElementById('wttPersonalResult');
        if (el) {
            el.innerHTML = '<div style="padding:20px;color:var(--accent-red);text-align:center;">❌ WTT排名数据加载失败，请刷新页面重试</div>';
        }
        return false;
    }
}

// ============ 辅助函数 ============

function wttGetAllPlayersForPersonal() {
    const playerSet = new Set();

    if (wttRankingTimeline && wttRankingTimeline.length) {
        for (const t of wttRankingTimeline) {
            if (t.data && t.data.length) {
                for (const p of t.data) {
                    if (p['姓名']) playerSet.add(p['姓名']);
                }
            }
        }
    }

    if (wttInitialScoresData && wttInitialScoresData.initialScores) {
        for (const name of Object.keys(wttInitialScoresData.initialScores)) {
            if (name) playerSet.add(name);
        }
    }

    if (wttScoreLogData && wttScoreLogData.length) {
        for (const r of wttScoreLogData) {
            if (isMatchRecord(r)) {
                if (r['胜者']) playerSet.add(r['胜者']);
                if (r['负者']) playerSet.add(r['负者']);
            } else if (isBonusRecord(r)) {
                if (r['对象']) playerSet.add(r['对象']);
            }
        }
    }

    const players = Array.from(playerSet);
    if (!players.length) {
        console.warn('[WttPersonalStats] wttGetAllPlayers: 未找到任何球员');
    }
    return players;
}

function wttRenderPersonalPlayerSelect() {
    const players = wttGetAllPlayersForPersonal();
    const sel = document.getElementById('wttPersonalPlayerSelect');
    if (!sel) return;

    // 切换到 WTT 全局数据以使用 getSeasonStartScores
    const origScoreLog = scoreLogData;
    const origInitial = initialScoresData;
    const origEvent = eventCoefficients;
    const origSeasons = seasonsData;
    scoreLogData = wttScoreLogData;
    initialScoresData = (typeof wttGetInitialScoresDataForEngine === 'function') ? wttGetInitialScoresDataForEngine() : wttInitialScoresData;
    eventCoefficients = wttEventCoefficients;
    seasonsData = wttSeasonsData;

    // 按当前赛季积分降序排列（不活跃球员使用赛季继承起始积分）
    const scoreMap = {};
    let cd = [];
    for (let i = wttRankingTimeline.length - 1; i >= 0; i--) {
        if (wttRankingTimeline[i].data && wttRankingTimeline[i].data.length > 0) {
            cd = wttRankingTimeline[i].data;
            break;
        }
    }
    for (const p of cd) { scoreMap[p['姓名']] = p['当前积分']; }
    if (seasonsData && seasonsData.length > 0) {
        let currentSeasonIdx = seasonsData.length - 1;
        for (let i = wttRankingTimeline.length - 1; i >= 0; i--) {
            if (wttRankingTimeline[i].season) {
                const s = seasonsData.find(s => s.label === wttRankingTimeline[i].season);
                if (s) { currentSeasonIdx = seasonsData.indexOf(s); break; }
            }
        }
        const startScores = getSeasonStartScores(currentSeasonIdx);
        for (const [name, score] of Object.entries(startScores)) {
            if (!(name in scoreMap)) scoreMap[name] = score;
        }
    }
    if (initialScoresData && initialScoresData.initialScores) {
        for (const [name, score] of Object.entries(initialScoresData.initialScores)) {
            if (!(name in scoreMap)) scoreMap[name] = score;
        }
    }

    // 恢复全局数据
    scoreLogData = origScoreLog;
    initialScoresData = origInitial;
    eventCoefficients = origEvent;
    seasonsData = origSeasons;

    const sortedPlayers = [...players].sort((a, b) => (scoreMap[b] || 0) - (scoreMap[a] || 0));

    const opts = sortedPlayers.map(p => `<option value="${p}">${p}</option>`).join('');
    sel.innerHTML = '<option value="">-- 选择球员 --</option>' + opts;
}

function wttGetApproxScoreAtDate(playerName, targetDate, sortedLog, startScores, beforeMatch) {
    // 找到目标日期所在的赛季，使用赛季继承起始积分
    let effectiveStartScores = { ...startScores };
    let seasonStartDate = '';
    if (seasonsData && seasonsData.length > 0) {
        let seasonIdx = -1;
        for (let si = 0; si < seasonsData.length; si++) {
            if (targetDate >= seasonsData[si].startDate && targetDate <= seasonsData[si].endDate) {
                seasonIdx = si; break;
            }
        }
        if (seasonIdx === -1 && targetDate > seasonsData[seasonsData.length - 1].endDate) {
            seasonIdx = seasonsData.length - 1;
        }
        if (seasonIdx >= 0) {
            effectiveStartScores = getSeasonStartScores(seasonIdx);
            seasonStartDate = seasonsData[seasonIdx].startDate;
        }
    }

    const sc = { ...effectiveStartScores };
    for (const r of sortedLog) {
        // 跳过赛季开始前的记录
        if (seasonStartDate && r['日期'] < seasonStartDate) continue;
        if (beforeMatch ? (r['日期'] >= targetDate) : (r['日期'] > targetDate)) break;
        if (isMatchRecord(r)) {
            const w = r['胜者'], l = r['负者'];
            if (!sc[w]) sc[w] = DEFAULT_INITIAL_SCORE;
            if (!sc[l]) sc[l] = DEFAULT_INITIAL_SCORE;
            const wg = calcMatchPoints(w, l, r['类型'], r['日期'], r['日期'], sc);
            sc[w] = Math.max(SCORE_FLOOR, sc[w] + wg);
            sc[l] = Math.max(SCORE_FLOOR, sc[l] - wg * LOSER_POINT_MULTIPLIER);
        } else if (isBonusRecord(r)) {
            const t = r['对象'];
            const b = parseFloat(r['分数']) || 0;
            if (!sc[t]) sc[t] = DEFAULT_INITIAL_SCORE;
            sc[t] = Math.max(SCORE_FLOOR, sc[t] + b);
        }
    }
    return Math.round(sc[playerName] || DEFAULT_INITIAL_SCORE);
}

// ============ 主渲染函数 ============

function wttRenderPersonalStats(playerName) {
    const container = document.getElementById('wttPersonalResult');
    if (!container) return;

    // 切换到 WTT 全局数据
    const origScoreLog = scoreLogData;
    const origInitial = initialScoresData;
    const origEvent = eventCoefficients;
    const origSeasons = seasonsData;

    scoreLogData = wttScoreLogData;
    initialScoresData = (typeof wttGetInitialScoresDataForEngine === 'function') ? wttGetInitialScoresDataForEngine() : wttInitialScoresData;
    eventCoefficients = wttEventCoefficients;
    seasonsData = wttSeasonsData;

    if (!scoreLogData || !scoreLogData.length) {
        container.innerHTML = '<div class="compare-placeholder"><p>暂无比赛数据</p></div>';
        scoreLogData = origScoreLog; initialScoresData = origInitial;
        eventCoefficients = origEvent; seasonsData = origSeasons;
        return;
    }

    const sortedLog = [...scoreLogData].sort((a, b) => a['日期'].localeCompare(b['日期']));
    const allMatches = sortedLog.filter(r => isMatchRecord(r) && (r['胜者'] === playerName || r['负者'] === playerName));
    const totalMatches = allMatches.length;
    const wins = allMatches.filter(r => r['胜者'] === playerName).length;
    const losses = totalMatches - wins;

    const allPlayers = wttGetAllPlayersForPersonal();
    let percentile = 0, maxScore = 0, bestRank = Infinity;
    const scoreHistory = []; // { label, score, rank }
    if (allPlayers.length > 1) {
        let cd = [];
        for (let i = wttRankingTimeline.length - 1; i >= 0; i--) {
            if (wttRankingTimeline[i].data && wttRankingTimeline[i].data.length > 0) {
                cd = wttRankingTimeline[i].data;
                break;
            }
        }
        const myData = cd.find(p => p['姓名'] === playerName);
        if (myData) {
            const myPts = myData['当前积分'];
            const others = cd.filter(p => p['姓名'] !== playerName);
            const below = others.filter(p => p['当前积分'] < myPts).length;
            percentile = others.length > 0 ? (below / others.length * 100) : 0;
        }

        // 注意：球员首次参赛前不纳入统计
        const firstAppearance = getWttFirstAppearanceDate();
        const playerFirstDate = firstAppearance[playerName] || '';
        for (const t of wttRankingTimeline) {
            if (!t.data || !t.data.length) continue;
            // 跳过球员首次参赛前的快照
            if (playerFirstDate && t.time && t.time < playerFirstDate) continue;
            const me = t.data.find(p => p['姓名'] === playerName);
            if (!me) continue;
            const score = Math.round(me['当前积分']);
            if (score > maxScore) maxScore = score;
            const sorted = [...t.data].sort((a, b) => b['当前积分'] - a['当前积分']);
            let rank = 1;
            for (let i = 0; i < sorted.length; i++) {
                if (i > 0 && sorted[i]['当前积分'] < sorted[i - 1]['当前积分']) rank = i + 1;
                if (sorted[i]['姓名'] === playerName) break;
            }
            if (!t.isInitial && rank < bestRank) bestRank = rank;
            scoreHistory.push({
                label: t.label || t.time,
                time: t.time,
                score: score,
                rank: rank
            });
        }
    }

    const startScores = initialScoresData ? { ...initialScoresData.initialScores } : {};
    const oppStats = {};
    for (const r of allMatches) {
        const opp = r['胜者'] === playerName ? r['负者'] : r['胜者'];
        const isWin = r['胜者'] === playerName;
        if (!oppStats[opp]) {
            oppStats[opp] = { wins: 0, losses: 0, lastDate: r['日期'], lastWinDate: '', preWinScore: 0, preMatchScore: 0, curScore: 0 };
        }
        if (isWin) { oppStats[opp].wins++; if (r['日期'] >= (oppStats[opp].lastWinDate || '')) oppStats[opp].lastWinDate = r['日期']; }
        else oppStats[opp].losses++;
        if (r['日期'] >= oppStats[opp].lastDate) {
            oppStats[opp].lastDate = r['日期'];
        }
    }

    let currentCd = [];
    for (let i = wttRankingTimeline.length - 1; i >= 0; i--) {
        if (wttRankingTimeline[i].data && wttRankingTimeline[i].data.length > 0) {
            currentCd = wttRankingTimeline[i].data;
            break;
        }
    }

    // 计算对手各项分数（已通过 wttGetApproxScoreAtDate 处理赛季继承）
    for (const opp in oppStats) {
        const s = oppStats[opp];
        if (s.lastWinDate) s.preWinScore = wttGetApproxScoreAtDate(opp, s.lastWinDate, sortedLog, startScores, false);
        s.preMatchScore = wttGetApproxScoreAtDate(opp, s.lastDate, sortedLog, startScores, false);
        const oppCur = currentCd.find(p => p['姓名'] === opp);
        s.curScore = oppCur ? oppCur['当前积分'] : wttGetApproxScoreAtDate(opp, s.lastDate, sortedLog, startScores, false);
    }

    // 使用赛季感知的积分状态来计算对手得分/失分
    const scores = {};
    let currentSeasonIdx = -1;
    if (seasonsData && seasonsData.length > 0 && allMatches.length > 0) {
        const firstMatchDate = allMatches[0]['日期'];
        for (let si = 0; si < seasonsData.length; si++) {
            if (firstMatchDate >= seasonsData[si].startDate && firstMatchDate <= seasonsData[si].endDate) {
                currentSeasonIdx = si; break;
            }
        }
        if (currentSeasonIdx === -1 && firstMatchDate > seasonsData[seasonsData.length - 1].endDate) {
            currentSeasonIdx = seasonsData.length - 1;
        }
        if (currentSeasonIdx >= 0) {
            const inheritedScores = getSeasonStartScores(currentSeasonIdx);
            Object.assign(scores, inheritedScores);
        }
    }
    if (Object.keys(scores).length === 0) {
        Object.assign(scores, startScores);
    }

    const oppPointsGained = {};
    const oppPointsLost = {};
    for (const r of sortedLog) {
        // 检查是否跨越赛季边界，应用50%继承
        if (seasonsData && seasonsData.length > 0 && currentSeasonIdx >= 0) {
            const nextSeasonIdx = currentSeasonIdx + 1;
            if (nextSeasonIdx < seasonsData.length && r['日期'] >= seasonsData[nextSeasonIdx].startDate) {
                const seasonEnd = seasonsData[currentSeasonIdx].endDate;
                const endScores = calculateEndScores(sortedLog, getSeasonStartScores(currentSeasonIdx), seasonsData[currentSeasonIdx].startDate, seasonEnd);
                const inherited = {};
                const ss = getSeasonStartScores(currentSeasonIdx);
                for (const n in ss) { const es = endScores[n] || ss[n]; inherited[n] = ss[n] + (es - ss[n]) * 0.5; }
                for (const n in initialScoresData.initialScores) { if (!inherited[n]) inherited[n] = initialScoresData.initialScores[n]; }
                for (const n in scores) { scores[n] = inherited[n] || scores[n]; }
                for (const n in inherited) { if (!(n in scores)) scores[n] = inherited[n]; }
                currentSeasonIdx = nextSeasonIdx;
            }
        }

        if (!isMatchRecord(r)) {
            if (isBonusRecord(r)) {
                const t = r['对象'];
                const b = parseFloat(r['分数']) || 0;
                if (!scores[t]) scores[t] = DEFAULT_INITIAL_SCORE;
                scores[t] = Math.max(SCORE_FLOOR, scores[t] + b);
            }
            continue;
        }
        const w = r['胜者'], l = r['负者'];
        if (!scores[w]) scores[w] = DEFAULT_INITIAL_SCORE;
        if (!scores[l]) scores[l] = DEFAULT_INITIAL_SCORE;
        const wg = calcMatchPoints(w, l, r['类型'], r['日期'], r['日期'], scores);
        if (w === playerName) {
            oppPointsGained[l] = (oppPointsGained[l] || 0) + wg;
            oppPointsLost[l] = (oppPointsLost[l] || 0) + wg * LOSER_POINT_MULTIPLIER;
        } else if (l === playerName) {
            oppPointsLost[w] = (oppPointsLost[w] || 0) + wg;
            oppPointsGained[w] = (oppPointsGained[w] || 0) + wg * LOSER_POINT_MULTIPLIER;
        }
        scores[w] = Math.max(SCORE_FLOOR, scores[w] + wg);
        scores[l] = Math.max(SCORE_FLOOR, scores[l] - wg * LOSER_POINT_MULTIPLIER);
    }

    const beatenOpps = Object.entries(oppStats)
        .filter(([_, s]) => s.wins > 0)
        .sort((a, b) => b[1].preWinScore - a[1].preWinScore)
        .slice(0, 3);

    const frequentOpps = Object.entries(oppStats)
        .sort((a, b) => b[1].preMatchScore - a[1].preMatchScore)
        .slice(0, 3);

    // 福星：胜率最高的对手（玩家对其战绩最好）
    const luckyStars = Object.entries(oppStats)
        .map(([name, s]) => {
            const total = s.wins + s.losses;
            const wr = total > 0 ? s.wins / total : 0;
            return { name, wins: s.wins, losses: s.losses, curScore: s.curScore, winRate: wr, total };
        })
        .filter(x => x.total > 0)
        .sort((a, b) => b.winRate - a.winRate || b.total - a.total)
        .slice(0, 3);

    // 苦主：胜率最低的对手（玩家对其战绩最差）
    const nemeses = Object.entries(oppStats)
        .map(([name, s]) => {
            const total = s.wins + s.losses;
            const wr = total > 0 ? s.wins / total : 0;
            return { name, wins: s.wins, losses: s.losses, curScore: s.curScore, winRate: wr, total };
        })
        .filter(x => x.total > 0)
        .sort((a, b) => a.winRate - b.winRate || b.total - a.total)
        .slice(0, 3);

    function fmtDate(ds) {
        const d = new Date(ds + 'T00:00:00');
        return d.getFullYear() + '年' + (d.getMonth() + 1) + '月' + d.getDate() + '日';
    }

    let html = '';
    html += '<div class="personal-overview">';
    html += '<div class="personal-overview-item"><span class="personal-overview-num">' + totalMatches + '</span><span class="personal-overview-label">总场次</span></div>';
    html += '<div class="personal-overview-item win"><span class="personal-overview-num">' + wins + '</span><span class="personal-overview-label">获胜</span></div>';
    html += '<div class="personal-overview-item loss"><span class="personal-overview-num">' + losses + '</span><span class="personal-overview-label">失利</span></div>';
    html += '<div class="personal-overview-item"><span class="personal-overview-num">' + percentile.toFixed(2) + '%</span><span class="personal-overview-label">积分超过</span></div>';
    html += '<div class="personal-overview-item best"><span class="personal-overview-num">' + maxScore + '</span><span class="personal-overview-label">最高积分</span></div>';
    html += '<div class="personal-overview-item best"><span class="personal-overview-num">#' + (bestRank === Infinity ? '-' : bestRank) + '</span><span class="personal-overview-label">最高排名</span></div>';
    html += '</div>';

    html += '<div class="personal-summary-text">';
    html += '<strong>' + playerName + '</strong>共进行了<strong>' + totalMatches + '</strong>盘单打比赛，其中获胜<strong>' + wins + '</strong>盘，失利<strong>' + losses + '</strong>盘。';
    html += '<strong>' + playerName + '</strong>的积分超过了全部<strong>' + percentile.toFixed(2) + '%</strong>的选手。';
    html += '</div>';

    // === 积分变化折线图 ===
    const dailyScoreHistory = computeWttDailyScoreHistory(playerName, sortedLog, startScores);

    if (dailyScoreHistory.length > 1 || scoreHistory.length > 1) {
        html += '<div class="personal-chart-section">';
        html += '<div class="personal-chart-header">';
        html += '<span><i class="fa-solid fa-chart-line"></i> 积分变化趋势</span>';
        html += '<div class="personal-chart-granularity">';
        html += '<button class="granularity-btn active" data-gran="day">按天</button>';
        html += '<button class="granularity-btn" data-gran="week">按周</button>';
        html += '<button class="granularity-btn" data-gran="snapshot">快照</button>';
        html += '</div>';
        html += '</div>';
        html += '<div class="personal-chart-wrapper"><canvas id="wttPersonalScoreChart"></canvas></div>';
        html += '</div>';
    }

    html += '<div class="personal-cards-grid">';

    html += '<div class="personal-card victory-card">';
    html += '<div class="personal-card-header"><i class="fa-solid fa-trophy"></i> 胜利 · 曾战胜的前三名</div>';
    if (beatenOpps.length === 0) {
        html += '<div class="personal-card-empty">暂无</div>';
    } else {
        html += '<div class="personal-card-list">';
        beatenOpps.forEach(([name, s], i) => {
            html += '<div class="personal-card-item">';
            html += '<span class="personal-card-rank">' + (i + 1) + '</span>';
            html += '<span class="personal-card-name">' + name + '<span class="personal-card-score">(' + s.preWinScore + ')</span></span>';
            html += '<span class="personal-card-date">' + fmtDate(s.lastWinDate) + '</span>';
            html += '</div>';
        });
        html += '</div>';
    }
    html += '</div>';

    html += '<div class="personal-card pk-card">';
    html += '<div class="personal-card-header"><i class="fa-solid fa-hand-fist"></i> PK · 曾交手的前三名</div>';
    if (frequentOpps.length === 0) {
        html += '<div class="personal-card-empty">暂无</div>';
    } else {
        html += '<div class="personal-card-list">';
        frequentOpps.forEach(([name, s], i) => {
            html += '<div class="personal-card-item">';
            html += '<span class="personal-card-rank">' + (i + 1) + '</span>';
            html += '<span class="personal-card-name">' + name + '<span class="personal-card-score">(' + s.preMatchScore + ')</span></span>';
            html += '<span class="personal-card-date">' + fmtDate(s.lastDate) + '</span>';
            html += '</div>';
        });
        html += '</div>';
    }
    html += '</div>';

    html += '<div class="personal-card lucky-card">';
    html += '<div class="personal-card-header"><i class="fa-solid fa-star"></i> 福星</div>';
    if (luckyStars.length === 0) {
        html += '<div class="personal-card-empty">暂无</div>';
    } else {
        html += '<div class="personal-card-list">';
        luckyStars.forEach((x, i) => {
            const totalGames = x.wins + x.losses;
            const wr = totalGames > 0 ? ((x.wins / totalGames) * 100).toFixed(0) : 0;
            html += '<div class="personal-card-item">';
            html += '<span class="personal-card-rank">' + (i + 1) + '</span>';
            html += '<span class="personal-card-name">' + x.name + '<span class="personal-card-score">(' + x.curScore + ')</span></span>';
            html += '<span class="personal-card-sub">' + x.wins + '胜' + x.losses + '负 胜率:' + wr + '%</span>';
            html += '</div>';
        });
        html += '</div>';
    }
    html += '</div>';

    html += '<div class="personal-card nemesis-card">';
    html += '<div class="personal-card-header"><i class="fa-solid fa-skull"></i> 苦主</div>';
    if (nemeses.length === 0) {
        html += '<div class="personal-card-empty">暂无</div>';
    } else {
        html += '<div class="personal-card-list">';
        nemeses.forEach((x, i) => {
            const totalGames = x.wins + x.losses;
            const wr = totalGames > 0 ? ((x.wins / totalGames) * 100).toFixed(0) : 0;
            html += '<div class="personal-card-item">';
            html += '<span class="personal-card-rank">' + (i + 1) + '</span>';
            html += '<span class="personal-card-name">' + x.name + '<span class="personal-card-score">(' + x.curScore + ')</span></span>';
            html += '<span class="personal-card-sub">' + x.wins + '胜' + x.losses + '负 胜率:' + wr + '%</span>';
            html += '</div>';
        });
        html += '</div>';
    }
    html += '</div>';

    html += '</div>';
    container.innerHTML = html;

    // 渲染积分变化折线图
    if (dailyScoreHistory.length > 1 || scoreHistory.length > 1) {
        renderWttPersonalScoreChart(dailyScoreHistory, scoreHistory);

        const granularityBtns = container.querySelectorAll('.granularity-btn');
        granularityBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                granularityBtns.forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                renderWttPersonalScoreChart(dailyScoreHistory, scoreHistory);
            });
        });
    }

    // 恢复全局数据
    scoreLogData = origScoreLog;
    initialScoresData = origInitial;
    eventCoefficients = origEvent;
    seasonsData = origSeasons;
}

// ============ 积分历史计算 ============

function computeWttDailyScoreHistory(playerName, sortedLog, startScores) {
    const history = [];
    if (sortedLog.length === 0) return history;

    let startDate = sortedLog[0]['日期'];
    for (const r of sortedLog) {
        if ((isMatchRecord(r) && (r['胜者'] === playerName || r['负者'] === playerName)) ||
            (isBonusRecord(r) && r['对象'] === playerName)) {
            startDate = r['日期'];
            break;
        }
    }
    const now = new Date();
    const today = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0') + '-' + String(now.getDate()).padStart(2, '0');

    // 预建时间衰减查找表
    const DECAY_LUT_MAX = 3000;
    const decayLUT = new Float64Array(DECAY_LUT_MAX);
    for (let i = 0; i < DECAY_LUT_MAX; i++) {
        decayLUT[i] = Math.pow(2, -i / HALF_LIFE_DAYS);
    }
    const getDecay = (dayDiff) => dayDiff < DECAY_LUT_MAX ? decayLUT[dayDiff] : Math.pow(2, -dayDiff / HALF_LIFE_DAYS);

    const matchRecs = [];
    const bonusRecs = [];

    for (const r of sortedLog) {
        const time = new Date(r['日期'] + 'T00:00:00').getTime();
        if (isMatchRecord(r)) {
            matchRecs.push({ time, date: r['日期'], winner: r['胜者'], loser: r['负者'], type: r['类型'] });
        } else if (isBonusRecord(r)) {
            bonusRecs.push({ time, date: r['日期'], target: r['对象'], amount: parseFloat(r['分数']) || 0 });
        }
    }

    const allDates = [];
    let cur = new Date(startDate + 'T00:00:00');
    const endDate = new Date(today + 'T00:00:00');
    while (cur <= endDate) {
        allDates.push({ str: cur.getFullYear() + '-' + String(cur.getMonth() + 1).padStart(2, '0') + '-' + String(cur.getDate()).padStart(2, '0'), time: cur.getTime() });
        cur.setDate(cur.getDate() + 1);
    }

    // 预计算每个赛季的继承起始积分
    const seasonStartScoresMap = [];
    if (seasonsData && seasonsData.length > 0) {
        for (let si = 0; si < seasonsData.length; si++) {
            seasonStartScoresMap.push(getSeasonStartScores(si));
        }
    }

    for (const { str: dateStr, time: snapTime } of allDates) {
        // 找到当前日期所属的赛季
        let seasonIdx = -1;
        if (seasonsData && seasonsData.length > 0) {
            for (let si = 0; si < seasonsData.length; si++) {
                const s = seasonsData[si];
                if (dateStr >= s.startDate && dateStr <= s.endDate) {
                    seasonIdx = si;
                    break;
                }
            }
            if (seasonIdx === -1 && dateStr > seasonsData[seasonsData.length - 1].endDate) {
                seasonIdx = seasonsData.length - 1;
            }
        }

        let sc;
        let seasonStartDate;
        if (seasonIdx >= 0 && seasonStartScoresMap[seasonIdx]) {
            sc = { ...seasonStartScoresMap[seasonIdx] };
            seasonStartDate = seasonsData[seasonIdx].startDate;
        } else {
            sc = { ...startScores };
            seasonStartDate = startDate;
        }

        let mi = 0, bi = 0;

        while (mi < matchRecs.length && matchRecs[mi].time <= snapTime) {
            const m = matchRecs[mi];
            if (seasonIdx >= 0 && m.date < seasonStartDate) { mi++; continue; }

            const w = m.winner, l = m.loser;
            if (sc[w] === undefined) sc[w] = DEFAULT_INITIAL_SCORE;
            if (sc[l] === undefined) sc[l] = DEFAULT_INITIAL_SCORE;

            const dayDiff = Math.floor((snapTime - m.time) / 86400000);
            const tw = SCORE_TIME_DECAY_ENABLED ? getDecay(dayDiff) : 1;
            const base = getBaseScore((sc[w] || DEFAULT_INITIAL_SCORE) - (sc[l] || DEFAULT_INITIAL_SCORE));
            const coeff = getEventCoefficient(m.type);
            const wg = base * coeff * tw;

            sc[w] = Math.max(SCORE_FLOOR, sc[w] + wg);
            sc[l] = Math.max(SCORE_FLOOR, sc[l] - wg * LOSER_POINT_MULTIPLIER);
            mi++;
        }

        while (bi < bonusRecs.length && bonusRecs[bi].time <= snapTime) {
            const b = bonusRecs[bi];
            if (seasonIdx >= 0 && b.date < seasonStartDate) { bi++; continue; }
            if (sc[b.target] === undefined) sc[b.target] = DEFAULT_INITIAL_SCORE;
            sc[b.target] = Math.max(SCORE_FLOOR, sc[b.target] + b.amount);
            bi++;
        }

        history.push({
            time: dateStr,
            label: formatWttDateShort(dateStr),
            score: Math.round((sc[playerName] || DEFAULT_INITIAL_SCORE) * 10) / 10
        });
    }

    return history;
}

function aggregateWttWeekly(dailyHistory) {
    if (!dailyHistory.length) return [];
    const weekly = [];
    let currentWeek = null;
    let lastOfWeek = null;

    for (const entry of dailyHistory) {
        const d = new Date(entry.time + 'T00:00:00');
        const day = d.getDay();
        const monday = new Date(d);
        monday.setDate(d.getDate() - (day === 0 ? 6 : day - 1));
        const weekKey = monday.getFullYear() + '-' + String(monday.getMonth() + 1).padStart(2, '0') + '-' + String(monday.getDate()).padStart(2, '0');

        if (weekKey !== currentWeek) {
            if (lastOfWeek) weekly.push(lastOfWeek);
            currentWeek = weekKey;
        }
        lastOfWeek = {
            time: entry.time,
            label: entry.label,
            score: entry.score,
            weekLabel: formatWttWeekLabel(entry.time)
        };
    }
    if (lastOfWeek) weekly.push(lastOfWeek);
    return weekly;
}

function formatWttDateShort(ds) {
    const d = new Date(ds + 'T00:00:00');
    return (d.getMonth() + 1) + '/' + d.getDate();
}

function formatWttWeekLabel(ds) {
    const d = new Date(ds + 'T00:00:00');
    const day = d.getDay();
    const monday = new Date(d);
    monday.setDate(d.getDate() - (day === 0 ? 6 : day - 1));
    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);
    return (monday.getMonth() + 1) + '/' + monday.getDate() + '-' + (sunday.getMonth() + 1) + '/' + sunday.getDate();
}

// ============ 折线图渲染 ============

function renderWttPersonalScoreChart(dailyHistory, snapshotHistory) {
    const canvas = document.getElementById('wttPersonalScoreChart');
    if (!canvas) return;

    const activeBtn = document.querySelector('.granularity-btn.active');
    const granularity = activeBtn ? activeBtn.getAttribute('data-gran') : 'day';

    let dataPoints;
    if (granularity === 'day') {
        dataPoints = dailyHistory;
    } else if (granularity === 'week') {
        dataPoints = aggregateWttWeekly(dailyHistory);
    } else {
        dataPoints = snapshotHistory;
    }

    if (!dataPoints || dataPoints.length < 2) return;

    const existingChart = Chart.getChart(canvas);
    if (existingChart) existingChart.destroy();

    const isDark = document.body.classList.contains('dark-mode');
    const gridColor = isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)';
    const textColor = isDark ? '#aeb4c2' : '#4a5568';

    const labels = dataPoints.map(s => {
        if (granularity === 'week' && s.weekLabel) return s.weekLabel;
        return s.label || s.time;
    });
    const scores = dataPoints.map(s => s.score);

    const dataLen = dataPoints.length;
    const s = wttPersonalChartSettings;
    const cfg = (s && s[granularity]) ? s[granularity] : {};
    const colors = (s && s.colors) ? s.colors : {};

    const tension = cfg.tension != null ? cfg.tension : 0.1;

    const denseThreshold = cfg.denseThreshold || Infinity;
    const pointRadius = dataLen > denseThreshold
        ? (cfg.pointRadiusDense != null ? cfg.pointRadiusDense : 0)
        : (cfg.pointRadius != null ? cfg.pointRadius : 3);
    const pointHoverExtra = cfg.pointHoverExtra != null ? cfg.pointHoverExtra : 3;

    const borderWidth = dataLen > denseThreshold
        ? (cfg.borderWidthDense != null ? cfg.borderWidthDense : (cfg.borderWidth || 2))
        : (cfg.borderWidth != null ? cfg.borderWidth : 2);

    const largeThreshold = cfg.largeThreshold || Infinity;
    const maxTicksLimit = dataLen > largeThreshold
        ? (cfg.maxTicksLarge != null ? cfg.maxTicksLarge : (cfg.maxTicks || 15))
        : (cfg.maxTicks != null ? cfg.maxTicks : 15);

    const lineColor = colors.line || '#4da3ff';
    const fillColor = isDark ? (colors.fillDark || 'rgba(77, 163, 255, 0.1)') : (colors.fillLight || 'rgba(0, 123, 255, 0.08)');
    const ptBorderColor = colors.pointBorder || lineColor;
    const ptBorderWidth = colors.pointBorderWidth != null ? colors.pointBorderWidth : 0;

    // === 构建赛季边界虚线标注 ===
    const seasonBoundaries = [];
    if (seasonsData && seasonsData.length > 1) {
        for (let i = 0; i < seasonsData.length - 1; i++) {
            const boundaryDate = seasonsData[i].endDate;
            let idx = -1;
            for (let j = 0; j < dataPoints.length; j++) {
                if (dataPoints[j].time <= boundaryDate) idx = j;
                else break;
            }
            if (idx >= 0 && idx < dataPoints.length - 1) {
                seasonBoundaries.push({
                    idx: idx,
                    label: seasonsData[i + 1].label
                });
            }
        }
    }

    new Chart(canvas, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [{
                label: '积分',
                data: scores,
                borderColor: lineColor,
                backgroundColor: fillColor,
                borderWidth: borderWidth,
                pointBackgroundColor: lineColor,
                pointBorderColor: ptBorderColor,
                pointBorderWidth: ptBorderWidth,
                pointRadius: pointRadius,
                pointHoverRadius: pointRadius + pointHoverExtra,
                tension: tension,
                fill: true
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: {
                intersect: false,
                mode: 'index'
            },
            plugins: {
                legend: { display: false },
                tooltip: {
                    backgroundColor: isDark ? '#2a2e3d' : '#fff',
                    titleColor: isDark ? '#e4e6ed' : '#1a1a2e',
                    bodyColor: isDark ? '#aeb4c2' : '#4a5568',
                    borderColor: isDark ? 'rgba(255,255,255,0.12)' : '#e2e8f0',
                    borderWidth: 1,
                    padding: 12,
                    displayColors: false,
                    callbacks: {
                        title: function(items) {
                            const idx = items[0].dataIndex;
                            const dp = dataPoints[idx];
                            if (granularity === 'week' && dp.weekLabel) return dp.weekLabel;
                            return dp.label || dp.time;
                        },
                        label: function(item) {
                            const idx = item.dataIndex;
                            const dp = dataPoints[idx];
                            let txt = '积分: ' + dp.score;
                            if (dp.rank) txt += ' | 排名: #' + dp.rank;
                            return txt;
                        }
                    }
                }
            },
            scales: {
                x: {
                    grid: { color: gridColor },
                    ticks: { color: textColor, font: { size: 10 }, maxRotation: granularity === 'day' ? 60 : 45, autoSkip: true, maxTicksLimit: maxTicksLimit }
                },
                y: {
                    grid: { color: gridColor },
                    ticks: { color: textColor, font: { size: 11 } },
                    beginAtZero: false
                }
            }
        },
        plugins: [{
            id: 'seasonBoundaries',
            afterDraw: function(chart) {
                if (!seasonBoundaries.length) return;
                const ctx = chart.ctx;
                const meta = chart.getDatasetMeta(0);
                const chartArea = chart.chartArea;
                const topY = chartArea.top;
                const bottomY = chartArea.bottom;

                ctx.save();
                for (const b of seasonBoundaries) {
                    const point = meta.data[b.idx];
                    if (!point) continue;
                    const x = point.x;
                    if (x < chartArea.left || x > chartArea.right) continue;

                    ctx.beginPath();
                    ctx.setLineDash([6, 4]);
                    ctx.strokeStyle = isDark ? 'rgba(200,200,200,0.45)' : 'rgba(100,100,100,0.4)';
                    ctx.lineWidth = 1;
                    ctx.moveTo(x, topY);
                    ctx.lineTo(x, bottomY);
                    ctx.stroke();

                    ctx.setLineDash([]);
                    ctx.fillStyle = isDark ? 'rgba(200,200,200,0.7)' : 'rgba(80,80,80,0.7)';
                    ctx.font = '10px "Poppins", "Microsoft YaHei", sans-serif';
                    ctx.textAlign = 'center';
                    ctx.fillText(b.label, x, topY + 12);
                }
                ctx.restore();
            }
        }]
    });
}

// ============ 折线图设置加载 ============

async function loadWttPersonalChartSettings() {
    try {
        wttPersonalChartSettings = await (await fetch('data/personal-stats-chart-settings.json')).json();
        console.log('[WttPersonalStats] 折线图设置加载完成');
    } catch (e) {
        console.warn('[WttPersonalStats] 折线图设置加载失败，使用默认值', e);
        wttPersonalChartSettings = null;
    }
}

// ============ 初始化 ============

function initWttPersonalStats() {
    console.log('[WttPersonalStats] 开始初始化，wttRankingTimeline 长度:', wttRankingTimeline.length);

    if (!document.getElementById('wttPersonalPlayerSelect')) {
        console.warn('[WttPersonalStats] 页面上找不到 wttPersonalPlayerSelect 元素');
        return;
    }

    if (!wttRankingTimeline || wttRankingTimeline.length === 0) {
        console.error('[WttPersonalStats] wttRankingTimeline 为空');
        return;
    }

    loadWttPersonalChartSettings().then(() => {
        wttRenderPersonalPlayerSelect();

        document.getElementById('applyWttPersonalStats')?.addEventListener('click', () => {
            const p = document.getElementById('wttPersonalPlayerSelect')?.value;
            if (!p) { alert('请选择一名球员'); return; }
            wttRenderPersonalStats(p);
        });

        console.log('[WttPersonalStats] 初始化完成');
    });
}
