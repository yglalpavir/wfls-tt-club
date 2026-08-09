/* ========================================
   personal-stats.js - 个人数据页面
   ======================================== */

let selectedTags = [];
let personalChartSettings = null;  // 折线图设置（从 data/personal-stats-chart-settings.json 加载）

// 标签合并规则：显示标签 → 包含的原始标签（满足任一即匹配）
const TAG_MERGE_RULES = {
    '社长/副社长': ['26-27年社长', '26-27年副社长', '25-26年社长', '25-26年副社长', '24-25年副社长']
};

function getAllOriginalTags() {
    const tagSet = new Set();
    if (playerTagsData && playerTagsData.players) {
        for (const name of Object.keys(playerTagsData.players)) {
            const tags = playerTagsData.players[name].tags || [];
            tags.forEach(t => tagSet.add(t));
        }
    }
    return Array.from(tagSet).sort();
}

function getDisplayTags() {
    const allOriginal = getAllOriginalTags();
    const covered = new Set();
    const displayTags = [];

    // 先添加合并标签
    for (const [displayTag, originals] of Object.entries(TAG_MERGE_RULES)) {
        displayTags.push(displayTag);
        originals.forEach(t => covered.add(t));
    }

    // 再添加未被合并的独立标签
    for (const tag of allOriginal) {
        if (!covered.has(tag)) displayTags.push(tag);
    }

    return displayTags.sort((a, b) => {
        const aIsMerged = !!TAG_MERGE_RULES[a];
        const bIsMerged = !!TAG_MERGE_RULES[b];
        if (aIsMerged && !bIsMerged) return -1;
        if (!aIsMerged && bIsMerged) return 1;
        return a.localeCompare(b, 'zh');
    });
}

function expandTag(displayTag) {
    return TAG_MERGE_RULES[displayTag] || [displayTag];
}

function playerHasTag(playerName, displayTag) {
    const pt = (playerTagsData && playerTagsData.players && playerTagsData.players[playerName] && playerTagsData.players[playerName].tags) || [];
    const originals = expandTag(displayTag);
    return originals.some(ot => pt.includes(ot));
}

function getPlayersByTags(tags) {
    const all = getAllPlayersForPersonal();
    if (!tags || tags.length === 0) return all;
    if (!playerTagsData || !playerTagsData.players) return all;
    return all.filter(name => tags.every(displayTag => playerHasTag(name, displayTag)));
}

function getTagPlayerCount(displayTag) {
    const all = getAllPlayersForPersonal();
    if (!playerTagsData || !playerTagsData.players) return 0;
    return all.filter(name => playerHasTag(name, displayTag)).length;
}

function renderTagFilters() {
    const container = document.getElementById('tagFilterList');
    if (!container) return;
    const lang = i18n[currentLang] || i18n.zh;
    const displayTags = getDisplayTags();
    if (!displayTags.length) {
        container.innerHTML = `<span style="font-size:0.75rem;color:var(--text-muted);">${lang.personal_stats_no_tags}</span>`;
        return;
    }

    const activeCount = getPlayersByTags(selectedTags).length;

    container.innerHTML = displayTags.map(tag => {
        const isActive = selectedTags.includes(tag);
        const count = getTagPlayerCount(tag);
        const isMerged = !!TAG_MERGE_RULES[tag];
        const mergedClass = isMerged ? ' merged' : '';
        return `<span class="tag-filter-badge${isActive ? ' active' : ''}${mergedClass}" data-tag="${escapeHtml(String(tag))}">
            ${escapeHtml(String(tag))}<span class="tag-filter-count">${count}</span>
        </span>`;
    }).join('');

    // 更新标签栏标题，显示匹配人数
    const label = document.querySelector('.tag-filter-section > label');
    if (label) {
        if (selectedTags.length > 0) {
            label.innerHTML = `<i class="fa-solid fa-tags"></i> ${lang.personal_stats_filter_label} <span class="tag-match-count">${lang.personal_stats_tag_count.replace('{n}', activeCount)}</span>`;
        } else {
            label.innerHTML = `<i class="fa-solid fa-tags"></i> ${lang.personal_stats_filter_label}`;
        }
    }

    container.querySelectorAll('.tag-filter-badge').forEach(badge => {
        badge.addEventListener('click', () => {
            const tag = badge.getAttribute('data-tag');
            const idx = selectedTags.indexOf(tag);
            if (idx >= 0) {
                selectedTags.splice(idx, 1);
            } else {
                selectedTags.push(tag);
            }
            renderTagFilters();
            renderPlayerIndex();
        });
    });
}

function getAllPlayersForPersonal() {
    const playerSet = new Set();

    // 1. 从 ranking timeline 的所有快照中收集球员
    if (rankingTimeline && rankingTimeline.length) {
        for (const t of rankingTimeline) {
            if (t.data && t.data.length) {
                for (const p of t.data) {
                    if (p['姓名']) playerSet.add(p['姓名']);
                }
            }
        }
    }

    // 2. 从初始积分中收集球员（含无比赛记录的球员）
    if (initialScoresData && initialScoresData.initialScores) {
        for (const name of Object.keys(initialScoresData.initialScores)) {
            if (name) playerSet.add(name);
        }
    }

    // 3. 从 score log 中收集球员
    if (scoreLogData && scoreLogData.length) {
        for (const r of scoreLogData) {
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
        console.warn('[PersonalStats] getAllPlayers: 未找到任何球员');
    }
    return players;
}

// ===== 拼音搜索支持（pinyin-pro + 模糊匹配）=====
const pinyinCache = {};

function getPlayerPinyin(text) {
    if (!text) return { full: '', fullSpaced: '', initial: '' };
    const cacheKey = 'zh:' + text;
    if (pinyinCache[cacheKey]) return pinyinCache[cacheKey];
    let full = '', fullSpaced = '', initial = '';
    if (typeof window.pinyinPro !== 'undefined' && window.pinyinPro.pinyin) {
        try {
            const arr = window.pinyinPro.pinyin(text, { toneType: 'none', type: 'array', nonZh: 'consecutive' });
            const segs = arr.map(s => String(s).trim()).filter(Boolean);
            full = segs.join('').toLowerCase();
            fullSpaced = segs.join(' ').toLowerCase();
            initial = segs.map(s => String(s.charAt(0))).join('').toLowerCase();
        } catch (e) { /* ignore */ }
    }
    const result = { full, fullSpaced, initial };
    pinyinCache[cacheKey] = result;
    return result;
}

function playerSearchKeys(name, p) {
    const keys = new Set();
    if (name) keys.add(String(name).trim().toLowerCase());
    if (p) {
        if (p.uid != null) keys.add(String(p.uid));
        (p.aliases || []).forEach(a => { if (a) keys.add(String(a).trim().toLowerCase()); });
        (p.tags || []).forEach(t => { if (t) keys.add(String(t).trim().toLowerCase()); });
    }
    const namesToConvert = [name].concat(p ? (p.aliases || []) : []);
    for (const n of namesToConvert) {
        if (!n) continue;
        const py = getPlayerPinyin(n);
        if (py.full) keys.add('py:' + py.full);
        if (py.fullSpaced) keys.add('py:' + py.fullSpaced);
        if (py.initial) keys.add('pyi:' + py.initial);
    }
    return Array.from(keys).filter(Boolean);
}

function isSubsequenceMatch(a, target) {
    let qi = 0;
    for (let ti = 0; ti < target.length && qi < a.length; ti++) {
        if (a[qi] === target[ti]) qi++;
    }
    return qi === a.length;
}

function playerSearchRawKey(k) {
    if (k.startsWith('py:')) return k.slice(3);
    if (k.startsWith('pyi:')) return k.slice(4);
    return k;
}

/**
 * 计算球员搜索匹配分数（0 = 不匹配）。
 * 支持：姓名/别名/编号/标签 的完全匹配、前缀、包含；拼音全拼/首字母；模糊子序列。
 */
function playerSearchScore(name, p, q) {
    if (!q) return -1;
    const keys = playerSearchKeys(name, p);
    const ql = q.toLowerCase();
    let best = 0;
    for (const k of keys) {
        const rawKey = playerSearchRawKey(k);
        if (!rawKey) continue;
        if (rawKey === ql) best = Math.max(best, 100);
        else if (rawKey.startsWith(ql)) best = Math.max(best, 80);
        else if (rawKey.includes(ql)) best = Math.max(best, 60);
        else if (rawKey.endsWith(ql)) best = Math.max(best, 45);
        else if (ql.length >= 2 && isSubsequenceMatch(ql, rawKey)) best = Math.max(best, 25);
    }
    return best;
}

// ===== 总览页：球员列表卡片 =====
function getRankSnapshotMap() {
    const rankMap = {}, rowMap = {};
    let cd = [];
    for (let i = rankingTimeline.length - 1; i >= 0; i--) {
        if (rankingTimeline[i].data && rankingTimeline[i].data.length > 0) { cd = rankingTimeline[i].data; break; }
    }
    const sorted = [...cd].sort((a, b) => (b['当前积分'] || 0) - (a['当前积分'] || 0));
    sorted.forEach((p, i) => { rankMap[p['姓名']] = i + 1; rowMap[p['姓名']] = p; });
    // 不活跃球员：使用当前赛季继承起始积分
    if (seasonsData && seasonsData.length > 0) {
        let seasonIdx = seasonsData.length - 1;
        for (let i = rankingTimeline.length - 1; i >= 0; i--) {
            if (rankingTimeline[i].season) {
                const s = seasonsData.find(s2 => s2.label === rankingTimeline[i].season);
                if (s) { seasonIdx = seasonsData.indexOf(s); break; }
            }
        }
        const startScores = getSeasonStartScores(seasonIdx);
        for (const [name, score] of Object.entries(startScores)) {
            if (!(name in rowMap)) { rowMap[name] = { '姓名': name, '当前积分': score, '总场次': 0, '胜率': '0%' }; if (!(name in rankMap)) rankMap[name] = '-'; }
        }
    }
    if (initialScoresData && initialScoresData.initialScores) {
        for (const [name, score] of Object.entries(initialScoresData.initialScores)) {
            if (!(name in rowMap)) { rowMap[name] = { '姓名': name, '当前积分': score, '总场次': 0, '胜率': '0%' }; rankMap[name] = '-'; }
        }
    }
    return { rankMap, rowMap };
}

function playerIndexCardHtml(entry) {
    const { name, player, row, rank, matchCount } = entry;
    const tags = (player && player.tags) || [];
    const tagHtml = tags.slice(0, 3).map(t => `<span class="personal-tag-badge" style="font-size:0.68rem;padding:2px 8px;">${escapeHtml(String(t))}</span>`).join('');
    const tagMore = tags.length > 3 ? `<span class="personal-tag-badge" style="font-size:0.68rem;padding:2px 8px;">+${tags.length - 3}</span>` : '';
    const pts = row && row['当前积分'] != null ? (typeof row['当前积分'] === 'number' ? row['当前积分'].toFixed(1) : row['当前积分']) : '-';
    const matches = row && row['总场次'] != null ? row['总场次'] : matchCount;
    const wr = row && row['胜率'] ? row['胜率'] : '0%';
    const linked = player && player.uid != null;
    return `<div class="player-index-card glass-card${linked ? ' clickable' : ''}" data-uid="${player ? escapeHtml(String(player.uid)) : ''}" data-name="${escapeHtml(String(name))}">
        <div class="player-index-head">
            <h3 class="player-index-name">${escapeHtml(String(name))}</h3>
            ${player && player.uid != null ? `<span class="player-index-uid">#${escapeHtml(String(player.uid))}</span>` : ''}
        </div>
        <div class="player-index-tags">${tagHtml}${tagMore}</div>
        <div class="player-index-stats">
            <span title="${i18n[currentLang].wtt_ov_current}"><i class="fa-solid fa-gem"></i> ${pts}</span>
            <span title="${i18n[currentLang].wtt_ov_bestrank}"><i class="fa-solid fa-medal"></i> ${rank === '-' ? '-' : '#' + rank}</span>
            <span title="${i18n[currentLang].wtt_ov_total}"><i class="fa-solid fa-table-tennis-paddle-ball"></i> ${matches}</span>
            <span title="${i18n[currentLang].wtt_ov_percentile}"><i class="fa-solid fa-bullseye"></i> ${wr}</span>
        </div>
    </div>`;
}

function renderPlayerIndex() {
    const container = document.getElementById('personalResult');
    if (!container) return;
    const searchInput = document.getElementById('playerSearchInput');
    const q = (searchInput ? searchInput.value : '').trim().toLowerCase();

    const { rankMap, rowMap } = getRankSnapshotMap();
    let names = getPlayersByTags(selectedTags);

    // 搜索匹配：模糊 + 拼音，权重打分后优先展示高匹配球员
    let searchScores = null;
    if (q) {
        searchScores = new Map();
        names.forEach(n => {
            const score = playerSearchScore(n, getPlayerByName(n), q);
            if (score > 0) searchScores.set(n, score);
        });
        names = Array.from(searchScores.keys());
    }

    const sorted = [...names].sort((a, b) => {
        if (searchScores) {
            const da = searchScores.get(a), db = searchScores.get(b);
            if (da !== db) return (db || 0) - (da || 0);
        }
        const pa = rowMap[a] && rowMap[a]['当前积分'], pb = rowMap[b] && rowMap[b]['当前积分'];
        return ((pb || -Infinity) - (pa || -Infinity)) || String(a).localeCompare(String(b), 'zh');
    });

    const countEl = document.getElementById('playerIndexCount');
    const lang = i18n[currentLang] || i18n.zh;
    if (countEl) {
        const total = getAllPlayersForPersonal().length;
        countEl.textContent = q || selectedTags.length > 0
            ? lang.personal_stats_player_count.replace('{shown}', sorted.length).replace('{total}', total)
            : lang.personal_stats_player_count_total.replace('{total}', total);
    }

    if (!sorted.length) {
        container.innerHTML = `<div class="compare-placeholder"><i class="fa-solid fa-user-large-slash"></i><p>${lang.personal_stats_no_match}</p></div>`;
        return;
    }
    container.innerHTML = '<div class="player-index-grid">' + sorted.map(n => playerIndexCardHtml({
        name: n,
        player: getPlayerByName(n),
        row: rowMap[n] || null,
        rank: rankMap[n] ?? '-',
        matchCount: rowMap[n] ? rowMap[n]['总场次'] : 0
    })).join('') + '</div>';

    container.querySelectorAll('.player-index-card.clickable').forEach(card => {
        card.addEventListener('click', () => {
            const uid = card.getAttribute('data-uid');
            if (uid) window.location.href = 'player.html?uid=' + uid;
        });
    });
}

function getApproxScoreAtDate(playerName, targetDate, sortedLog, startScores, beforeMatch) {
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
    // 构建赛季内 [seasonStartDate, targetDate] 的批次定格索引
    playerTypeBatches = buildPlayerTypeBatches(sortedLog.filter(r => (!seasonStartDate || r['日期'] >= seasonStartDate) && r['日期'] <= targetDate));
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
            sc[l] = Math.max(SCORE_FLOOR, sc[l] - wg * 0.8);
        } else if (isBonusRecord(r)) {
            const t = r['对象'];
            const b = parseFloat(r['分数']) || 0;
            if (!sc[t]) sc[t] = DEFAULT_INITIAL_SCORE;
            sc[t] = Math.max(SCORE_FLOOR, sc[t] + b);
        }
    }
    return Math.round(sc[playerName] || DEFAULT_INITIAL_SCORE);
}

function renderPersonalStats(playerName, containerId) {
    const container = document.getElementById(containerId || 'personalResult');
    if (!container) return;

    if (!scoreLogData || !scoreLogData.length) {
        container.innerHTML = `<div class="compare-placeholder"><p>${i18n[currentLang].personal_stats_no_data}</p></div>`;
        return;
    }

    const sortedLog = [...scoreLogData].sort((a, b) => a['日期'].localeCompare(b['日期']));
    const allMatches = sortedLog.filter(r => isMatchRecord(r) && (r['胜者'] === playerName || r['负者'] === playerName));
    const totalMatches = allMatches.length;
    const wins = allMatches.filter(r => r['胜者'] === playerName).length;
    const losses = totalMatches - wins;

    const allPlayers = getAllPlayersForPersonal();
    let percentile = 0, maxScore = 0, bestRank = Infinity;
    const scoreHistory = []; // { label, score, rank }
    if (allPlayers.length > 1) {
        let cd = [];
        for (let i = rankingTimeline.length - 1; i >= 0; i--) {
            if (rankingTimeline[i].data && rankingTimeline[i].data.length > 0) {
                cd = rankingTimeline[i].data;
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

        // 遍历所有快照，计算最高积分、最高排名和积分历史
        // 注意：球员首次参赛前不纳入统计
        const firstAppearance = getClubFirstAppearanceDate();
        const playerFirstDate = firstAppearance[playerName] || '';
        for (const t of rankingTimeline) {
            if (!t.data || !t.data.length) continue;
            // 跳过球员首次参赛前的快照
            if (playerFirstDate && t.time && t.time < playerFirstDate) continue;
            const me = t.data.find(p => p['姓名'] === playerName);
            if (!me) continue;
            const score = Math.round(me['当前积分']);
            if (score > maxScore) maxScore = score;
            // 排名：按积分降序，同分同名
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

    // 获取最后一个非空快照的数据，用于获取对手当前积分
    let currentCd = [];
    for (let i = rankingTimeline.length - 1; i >= 0; i--) {
        if (rankingTimeline[i].data && rankingTimeline[i].data.length > 0) {
            currentCd = rankingTimeline[i].data;
            break;
        }
    }

    const curMine = currentCd.find(p => p['姓名'] === playerName);
    const curScoreDisp = curMine && curMine['当前积分'] != null ? (typeof curMine['当前积分'] === 'number' ? curMine['当前积分'].toFixed(1) : curMine['当前积分']) : '-';

    // 计算对手各项分数（已通过 getApproxScoreAtDate 处理赛季继承）
    for (const opp in oppStats) {
        const s = oppStats[opp];
        if (s.lastWinDate) s.preWinScore = getApproxScoreAtDate(opp, s.lastWinDate, sortedLog, startScores, false);
        s.preMatchScore = getApproxScoreAtDate(opp, s.lastDate, sortedLog, startScores, false);
        const oppCur = currentCd.find(p => p['姓名'] === opp);
        s.curScore = oppCur ? oppCur['当前积分'] : getApproxScoreAtDate(opp, s.lastDate, sortedLog, startScores, false);
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
    // 对手积分变动属展示型指标：用全量日志构建批次定格索引
    playerTypeBatches = buildPlayerTypeBatches(sortedLog);
    for (const r of sortedLog) {
        // 检查是否跨越赛季边界，应用50%继承
        if (seasonsData && seasonsData.length > 0 && currentSeasonIdx >= 0) {
            const nextSeasonIdx = currentSeasonIdx + 1;
            if (nextSeasonIdx < seasonsData.length && r['日期'] >= seasonsData[nextSeasonIdx].startDate) {
                // 跨越到下一个赛季：计算当前赛季末积分，应用50%继承
                const seasonEnd = seasonsData[currentSeasonIdx].endDate;
                const endScores = calculateEndScores(sortedLog, getSeasonStartScores(currentSeasonIdx), seasonsData[currentSeasonIdx].startDate, seasonEnd);
                const inherited = {};
                const ss = getSeasonStartScores(currentSeasonIdx);
                for (const n in ss) { const es = endScores[n] || ss[n]; inherited[n] = ss[n] + (es - ss[n]) * 0.5; }
                for (const n in initialScoresData.initialScores) { if (!inherited[n]) inherited[n] = initialScoresData.initialScores[n]; }
                // 更新 scores 为继承后的积分
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
            oppPointsLost[l] = (oppPointsLost[l] || 0) + wg * 0.8;
        } else if (l === playerName) {
            oppPointsLost[w] = (oppPointsLost[w] || 0) + wg;
            oppPointsGained[w] = (oppPointsGained[w] || 0) + wg * 0.8;
        }
        scores[w] = Math.max(SCORE_FLOOR, scores[w] + wg);
        scores[l] = Math.max(SCORE_FLOOR, scores[l] - wg * 0.8);
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
        .filter(x => x.total > 0 && x.wins > 0)
        .sort((a, b) => b.winRate - a.winRate || b.total - a.total)
        .slice(0, 3);

    // 苦主：胜率最低的对手（玩家对其战绩最差）
    const nemeses = Object.entries(oppStats)
        .map(([name, s]) => {
            const total = s.wins + s.losses;
            const wr = total > 0 ? s.wins / total : 0;
            return { name, wins: s.wins, losses: s.losses, curScore: s.curScore, winRate: wr, total };
        })
        .filter(x => x.total > 0 && x.losses > 0)
        .sort((a, b) => a.winRate - b.winRate || b.total - a.total)
        .slice(0, 3);

    function fmtDate(ds) {
        const d = new Date(ds + 'T00:00:00');
        const y = d.getFullYear(), m = d.getMonth()+1, day = d.getDate();
        if (currentLang === 'en') {
            const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
            return months[m-1] + ' ' + day + ', ' + y;
        }
        return y + '年' + m + '月' + day + '日';
    }

    let html = '';
    html += '<div class="personal-overview">';
    html += '<div class="personal-overview-item"><span class="personal-overview-num">' + totalMatches + '</span><span class="personal-overview-label">' + i18n[currentLang].wtt_ov_total + '</span></div>';
    html += '<div class="personal-overview-item win"><span class="personal-overview-num">' + wins + '</span><span class="personal-overview-label">' + i18n[currentLang].wtt_ov_wins + '</span></div>';
    html += '<div class="personal-overview-item loss"><span class="personal-overview-num">' + losses + '</span><span class="personal-overview-label">' + i18n[currentLang].wtt_ov_losses + '</span></div>';
    html += '<div class="personal-overview-item"><span class="personal-overview-num">' + (totalMatches > 0 ? Math.round(wins / totalMatches * 100) : 0) + '%</span><span class="personal-overview-label">' + i18n[currentLang].wtt_ov_percentile + '</span></div>';
    html += '<div class="personal-overview-item"><span class="personal-overview-num">' + curScoreDisp + '</span><span class="personal-overview-label">' + i18n[currentLang].wtt_ov_current + '</span></div>';
    html += '<div class="personal-overview-item best"><span class="personal-overview-num">' + maxScore + '</span><span class="personal-overview-label">' + i18n[currentLang].wtt_ov_max + '</span></div>';
    html += '<div class="personal-overview-item best"><span class="personal-overview-num">#' + (bestRank === Infinity ? '-' : bestRank) + '</span><span class="personal-overview-label">' + i18n[currentLang].wtt_ov_bestrank + '</span></div>';
    html += '</div>';

    html += '<div class="personal-summary-text">';
    html += i18n[currentLang].wtt_ps_sum1.replace('{player}', '<strong>' + playerName + '</strong>').replace('{total}', '<strong>' + totalMatches + '</strong>').replace('{wins}', '<strong>' + wins + '</strong>').replace('{losses}', '<strong>' + losses + '</strong>');
    html += i18n[currentLang].wtt_ps_sum2.replace('{player}', '<strong>' + playerName + '</strong>').replace('{percent}', '<strong>' + (totalMatches > 0 ? Math.round(wins / totalMatches * 100) : 0) + '</strong>');
    html += '</div>';

    // === 积分变化折线图 ===
    // 计算每日积分历史
    const dailyScoreHistory = computeDailyScoreHistory(playerName, sortedLog, startScores);

    if (dailyScoreHistory.length > 1 || scoreHistory.length > 1) {
        html += '<div class="personal-chart-section">';
        html += '<div class="personal-chart-header">';
        html += '<span><i class="fa-solid fa-chart-line"></i> ' + i18n[currentLang].wtt_ps_trend + '</span>';
        html += '<div class="personal-chart-granularity">';
        html += '<button class="granularity-btn active" data-gran="day">' + i18n[currentLang].wtt_ps_day + '</button>';
        html += '<button class="granularity-btn" data-gran="week">' + i18n[currentLang].wtt_ps_week + '</button>';
        html += '<button class="granularity-btn" data-gran="snapshot">' + i18n[currentLang].wtt_ps_snapshot + '</button>';
        html += '</div>';
        html += '</div>';
        html += '<div class="personal-chart-wrapper"><canvas id="personalScoreChart"></canvas></div>';
        html += '</div>';
    }

    // === 自定义标签和荣誉 ===
    const playerTagInfo = (playerTagsData && playerTagsData.players && playerTagsData.players[playerName]) || null;
    const playerTags = playerTagInfo ? (playerTagInfo.tags || []) : [];
    const playerHonors = playerTagInfo ? (playerTagInfo.honors || []) : [];
    if (playerTags.length > 0 || playerHonors.length > 0) {
        html += '<div class="personal-tags-honors">';
        if (playerTags.length > 0) {
            html += '<div class="personal-tags-section">';
            html += '<span class="personal-tags-label"><i class="fa-solid fa-tags"></i> ' + i18n[currentLang].pp_tags_label + '</span>';
            playerTags.forEach(tag => {
                html += '<span class="personal-tag-badge">' + tag + '</span>';
            });
            html += '</div>';
        }
        if (playerHonors.length > 0) {
            html += '<div class="personal-honors-section">';
            html += '<span class="personal-honors-label"><i class="fa-solid fa-medal"></i> ' + i18n[currentLang].pp_honors_label + '</span>';
            playerHonors.forEach((honor, i) => {
                html += '<span class="personal-honor-badge">';
                if (i === 0) html += '<i class="fa-solid fa-crown"></i> ';
                html += honor + '</span>';
            });
            html += '</div>';
        }
        html += '</div>';
    }

    html += '<div class="personal-cards-grid">';

    html += '<div class="personal-card victory-card">';
    html += '<div class="personal-card-header"><i class="fa-solid fa-trophy"></i> ' + i18n[currentLang].wtt_victory_card + '</div>';
    if (beatenOpps.length === 0) {
        html += '<div class="personal-card-empty">' + i18n[currentLang].wtt_empty + '</div>';
    } else {
        html += '<div class="personal-card-list">';
        beatenOpps.forEach(([name, s], i) => {
            html += '<div class="personal-card-item">';
            html += '<span class="personal-card-rank">' + (i+1) + '</span>';
            html += '<span class="personal-card-name">' + linkPlayerName(name) + '<span class="personal-card-score">(' + s.preWinScore + ')</span></span>';
            html += '<span class="personal-card-date">' + fmtDate(s.lastWinDate) + '</span>';
            html += '</div>';
        });
        html += '</div>';
    }
    html += '</div>';

    html += '<div class="personal-card pk-card">';
    html += '<div class="personal-card-header"><i class="fa-solid fa-hand-fist"></i> ' + i18n[currentLang].wtt_pk_card + '</div>';
    if (frequentOpps.length === 0) {
        html += '<div class="personal-card-empty">' + i18n[currentLang].wtt_empty + '</div>';
    } else {
        html += '<div class="personal-card-list">';
        frequentOpps.forEach(([name, s], i) => {
            html += '<div class="personal-card-item">';
            html += '<span class="personal-card-rank">' + (i+1) + '</span>';
            html += '<span class="personal-card-name">' + linkPlayerName(name) + '<span class="personal-card-score">(' + s.preMatchScore + ')</span></span>';
            html += '<span class="personal-card-date">' + fmtDate(s.lastDate) + '</span>';
            html += '</div>';
        });
        html += '</div>';
    }
    html += '</div>';

    html += '<div class="personal-card lucky-card">';
    html += '<div class="personal-card-header"><i class="fa-solid fa-star"></i> ' + i18n[currentLang].wtt_lucky_card + '</div>';
    if (luckyStars.length === 0) {
        html += '<div class="personal-card-empty">' + i18n[currentLang].wtt_empty + '</div>';
    } else {
        html += '<div class="personal-card-list">';
        luckyStars.forEach((x, i) => {
            const totalGames = x.wins + x.losses;
            const wr = totalGames > 0 ? ((x.wins / totalGames) * 100).toFixed(0) : 0;
            html += '<div class="personal-card-item">';
            html += '<span class="personal-card-rank">' + (i+1) + '</span>';
            html += '<span class="personal-card-name">' + linkPlayerName(x.name) + '<span class="personal-card-score">(' + x.curScore + ')</span></span>';
            html += '<span class="personal-card-sub">' + i18n[currentLang].wtt_sub_wl.replace('{wins}', x.wins).replace('{losses}', x.losses).replace('{rate}', wr) + '</span>';
            html += '</div>';
        });
        html += '</div>';
    }
    html += '</div>';

    html += '<div class="personal-card nemesis-card">';
    html += '<div class="personal-card-header"><i class="fa-solid fa-skull"></i> ' + i18n[currentLang].wtt_nemesis_card + '</div>';
    if (nemeses.length === 0) {
        html += '<div class="personal-card-empty">' + i18n[currentLang].wtt_empty + '</div>';
    } else {
        html += '<div class="personal-card-list">';
        nemeses.forEach((x, i) => {
            const totalGames = x.wins + x.losses;
            const wr = totalGames > 0 ? ((x.wins / totalGames) * 100).toFixed(0) : 0;
            html += '<div class="personal-card-item">';
            html += '<span class="personal-card-rank">' + (i+1) + '</span>';
            html += '<span class="personal-card-name">' + linkPlayerName(x.name) + '<span class="personal-card-score">(' + x.curScore + ')</span></span>';
            html += '<span class="personal-card-sub">' + i18n[currentLang].wtt_sub_wl.replace('{wins}', x.wins).replace('{losses}', x.losses).replace('{rate}', wr) + '</span>';
            html += '</div>';
        });
        html += '</div>';
    }
    html += '</div>';

    html += '</div>';
    container.innerHTML = html;

    // 渲染积分变化折线图
    if (dailyScoreHistory.length > 1 || scoreHistory.length > 1) {
        renderPersonalScoreChart(dailyScoreHistory, scoreHistory);

        // 绑定粒度切换按钮
        const granularityBtns = container.querySelectorAll('.granularity-btn');
        granularityBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                granularityBtns.forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                renderPersonalScoreChart(dailyScoreHistory, scoreHistory);
            });
        });
    }
}

/**
 * 计算球员每日积分历史（从起始日至今日，每天一个数据点）
 * 使用快照日期作为 calcMatchPoints 的 snapshotDate，正确体现时间衰减
 *
 * 优化策略：
 * - 预解析所有日期为时间戳，避免循环内重复 new Date()
 * - 预建时间衰减查找表 (LUT)，避免循环内重复 Math.pow()
 * - 分离赛事记录和加分记录，各自独立索引推进
 */
function computeDailyScoreHistory(playerName, sortedLog, startScores) {
    const history = [];
    if (sortedLog.length === 0) return history;

    // ---- 确定起始日期：球员首次出现的日期 ----
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

    // ---- 预建时间衰减查找表 (dayDiff → timeWeight) ----
    const DECAY_LUT_MAX = 3000;
    const decayLUT = new Float64Array(DECAY_LUT_MAX);
    for (let i = 0; i < DECAY_LUT_MAX; i++) {
        decayLUT[i] = Math.pow(2, -i / HALF_LIFE_DAYS);
    }
    const getDecay = (dayDiff) => dayDiff < DECAY_LUT_MAX ? decayLUT[dayDiff] : Math.pow(2, -dayDiff / HALF_LIFE_DAYS);

    // ---- 预解析赛事记录和加分记录 ----
    const matchRecs = [];   // { time, date, winner, loser, type }
    const bonusRecs = [];   // { time, date, target, amount }

    for (const r of sortedLog) {
        const time = new Date(r['日期'] + 'T00:00:00').getTime();
        if (isMatchRecord(r)) {
            matchRecs.push({ time, date: r['日期'], winner: r['胜者'], loser: r['负者'], type: r['类型'] });
        } else if (isBonusRecord(r)) {
            bonusRecs.push({ time, date: r['日期'], target: r['对象'], amount: parseFloat(r['分数']) || 0 });
        }
    }

    // ---- 生成从起始日到今日的所有日期 ----
    const allDates = [];
    let cur = new Date(startDate + 'T00:00:00');
    const endDate = new Date(today + 'T00:00:00');
    while (cur <= endDate) {
        allDates.push({ str: cur.getFullYear() + '-' + String(cur.getMonth() + 1).padStart(2, '0') + '-' + String(cur.getDate()).padStart(2, '0'), time: cur.getTime() });
        cur.setDate(cur.getDate() + 1);
    }

    // ---- 逐日计算积分（考虑赛季积分继承） ----
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
            // 如果日期在所有赛季之后，使用最后一个赛季并延伸
            if (seasonIdx === -1 && dateStr > seasonsData[seasonsData.length - 1].endDate) {
                seasonIdx = seasonsData.length - 1;
            }
            // 如果日期在所有赛季之前，使用初始积分
        }

        // 确定起始积分和赛季范围
        let sc;
        let seasonStartDate, seasonEndDate;
        if (seasonIdx >= 0 && seasonStartScoresMap[seasonIdx]) {
            // 有赛季：使用该赛季的继承起始积分
            sc = { ...seasonStartScoresMap[seasonIdx] };
            seasonStartDate = seasonsData[seasonIdx].startDate;
            seasonEndDate = dateStr; // 截止到当前日期
        } else {
            // 无赛季或日期在第一个赛季之前：使用原始初始积分
            sc = { ...startScores };
            seasonStartDate = startDate;
            seasonEndDate = dateStr;
        }

        let mi = 0, bi = 0;

        // 构建赛季内 [seasonStartDate, dateStr] 的批次定格索引（每赛季清零 + 时间截断定格）
        playerTypeBatches = buildPlayerTypeBatches(matchRecs
            .filter(r => (!seasonStartDate || r.date >= seasonStartDate) && r.date <= dateStr)
            .map(r => ({ '胜者': r.winner, '负者': r.loser, '类型': r.type, '日期': r.date })));

        // 只处理赛季内的赛事记录（从赛季开始到当前日期）
        while (mi < matchRecs.length && matchRecs[mi].time <= snapTime) {
            const m = matchRecs[mi];
            // 跳过赛季开始前的记录
            if (seasonIdx >= 0 && m.date < seasonStartDate) { mi++; continue; }

            const w = m.winner, l = m.loser;
            if (sc[w] === undefined) sc[w] = DEFAULT_INITIAL_SCORE;
            if (sc[l] === undefined) sc[l] = DEFAULT_INITIAL_SCORE;

            const base = getBaseScore((sc[w] || DEFAULT_INITIAL_SCORE) - (sc[l] || DEFAULT_INITIAL_SCORE));
            const coeff = getEventCoefficient(m.type);
            const tw = getFreezeWeight(w, m.type, m.date, dateStr);
            const wg = base * coeff * tw;

            sc[w] = Math.max(SCORE_FLOOR, sc[w] + wg);
            sc[l] = Math.max(SCORE_FLOOR, sc[l] - wg * 0.8);
            mi++;
        }

        // 处理所有 <= 当日的加分记录（加分不随时间衰减）
        while (bi < bonusRecs.length && bonusRecs[bi].time <= snapTime) {
            const b = bonusRecs[bi];
            // 跳过赛季开始前的记录
            if (seasonIdx >= 0 && b.date < seasonStartDate) { bi++; continue; }
            if (sc[b.target] === undefined) sc[b.target] = DEFAULT_INITIAL_SCORE;
            sc[b.target] = Math.max(SCORE_FLOOR, sc[b.target] + b.amount);
            bi++;
        }

        history.push({
            time: dateStr,
            label: formatDateShort(dateStr),
            score: Math.round((sc[playerName] || DEFAULT_INITIAL_SCORE) * 10) / 10
        });
    }

    return history;
}

/**
 * 将每日数据聚合为每周数据（取每周最后一天）
 */
function aggregateWeekly(dailyHistory) {
    if (!dailyHistory.length) return [];
    const weekly = [];
    let currentWeek = null;
    let lastOfWeek = null;

    for (const entry of dailyHistory) {
        const d = new Date(entry.time + 'T00:00:00');
        // ISO week: 周一~周日
        const day = d.getDay(); // 0=Sun
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
            weekLabel: formatWeekLabel(entry.time)
        };
    }
    if (lastOfWeek) weekly.push(lastOfWeek);
    return weekly;
}

function formatDateShort(ds) {
    const d = new Date(ds + 'T00:00:00');
    return (d.getMonth() + 1) + '/' + d.getDate();
}

function formatWeekLabel(ds) {
    const d = new Date(ds + 'T00:00:00');
    const day = d.getDay();
    const monday = new Date(d);
    monday.setDate(d.getDate() - (day === 0 ? 6 : day - 1));
    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);
    return (monday.getMonth() + 1) + '/' + monday.getDate() + '-' + (sunday.getMonth() + 1) + '/' + sunday.getDate();
}

function renderPersonalScoreChart(dailyHistory, snapshotHistory) {
    const canvas = document.getElementById('personalScoreChart');
    if (!canvas) return;

    // 读取当前选中的粒度
    const activeBtn = document.querySelector('.granularity-btn.active');
    const granularity = activeBtn ? activeBtn.getAttribute('data-gran') : 'day';

    let dataPoints;
    if (granularity === 'day') {
        dataPoints = dailyHistory;
    } else if (granularity === 'week') {
        dataPoints = aggregateWeekly(dailyHistory);
    } else {
        // snapshot: 使用排名快照数据，过滤掉初始快照（无排名信息的）
        dataPoints = snapshotHistory;
    }

    if (!dataPoints || dataPoints.length < 2) return;

    // 销毁旧图表
    const existingChart = Chart.getChart(canvas);
    if (existingChart) existingChart.destroy();

    const isDark = document.body.classList.contains('dark-mode');
    const gridColor = isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)';
    const textColor = isDark ? '#aeb4c2' : '#4a5568';

    // 短标签
    const labels = dataPoints.map(s => {
        if (granularity === 'week' && s.weekLabel) return s.weekLabel;
        return s.label || s.time;
    });
    const scores = dataPoints.map(s => s.score);

    // 根据粒度和数据量调整参数
    const dataLen = dataPoints.length;
    const s = personalChartSettings;  // 快捷引用
    const cfg = (s && s[granularity]) ? s[granularity] : {};
    const colors = (s && s.colors) ? s.colors : {};

    // 平滑度
    const tension = cfg.tension != null ? cfg.tension : 0.1;

    // 数据点半径（支持密集模式）
    const denseThreshold = cfg.denseThreshold || Infinity;
    const pointRadius = dataLen > denseThreshold
        ? (cfg.pointRadiusDense != null ? cfg.pointRadiusDense : 0)
        : (cfg.pointRadius != null ? cfg.pointRadius : 3);
    const pointHoverExtra = cfg.pointHoverExtra != null ? cfg.pointHoverExtra : 3;

    // 线宽（支持密集模式）
    const borderWidth = dataLen > denseThreshold
        ? (cfg.borderWidthDense != null ? cfg.borderWidthDense : (cfg.borderWidth || 2))
        : (cfg.borderWidth != null ? cfg.borderWidth : 2);

    // X 轴刻度上限（支持大量数据模式）
    const largeThreshold = cfg.largeThreshold || Infinity;
    const maxTicksLimit = dataLen > largeThreshold
        ? (cfg.maxTicksLarge != null ? cfg.maxTicksLarge : (cfg.maxTicks || 15))
        : (cfg.maxTicks != null ? cfg.maxTicks : 15);

    // 颜色
    const lineColor = colors.line || '#4da3ff';
    const fillColor = isDark ? (colors.fillDark || 'rgba(77, 163, 255, 0.1)') : (colors.fillLight || 'rgba(0, 123, 255, 0.08)');
    const ptBorderColor = colors.pointBorder || lineColor;
    const ptBorderWidth = colors.pointBorderWidth != null ? colors.pointBorderWidth : 0;

    // === 构建赛季边界虚线标注 ===
    const seasonBoundaries = [];
    if (seasonsData && seasonsData.length > 1) {
        for (let i = 0; i < seasonsData.length - 1; i++) {
            const boundaryDate = seasonsData[i].endDate;
            // 找到边界日期所在的最后一个数据点索引
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
                label: i18n[currentLang].wtt_axis_points,
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
                            let txt = i18n[currentLang].wtt_tooltip_points.replace('{score}', dp.score);
                            if (dp.rank) txt += ' ' + i18n[currentLang].wtt_tooltip_rank.replace('{rank}', dp.rank);
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

                    // 虚线
                    ctx.beginPath();
                    ctx.setLineDash([6, 4]);
                    ctx.strokeStyle = isDark ? 'rgba(200,200,200,0.45)' : 'rgba(100,100,100,0.4)';
                    ctx.lineWidth = 1;
                    ctx.moveTo(x, topY);
                    ctx.lineTo(x, bottomY);
                    ctx.stroke();

                    // 赛季标签
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

async function loadPersonalChartSettings() {
    try {
        personalChartSettings = await (await fetch('data/personal-stats-chart-settings.json')).json();
        console.log('[PersonalStats] 折线图设置加载完成');
    } catch (e) {
        console.warn('[PersonalStats] 折线图设置加载失败，使用默认值', e);
        personalChartSettings = null;
    }
}

async function initPersonalStats() {
    console.log('[PersonalStats] 开始初始化');

    if (!document.getElementById('personalResult')) {
        console.warn('[PersonalStats] 页面上找不到 personalResult 元素');
        return;
    }

    try {
        await loadPersonalChartSettings();

        const si = document.getElementById('playerSearchInput');
        if (si) si.placeholder = i18n[currentLang].personal_stats_search_ph;

        renderTagFilters();
        renderPlayerIndex();

        si?.addEventListener('input', () => { renderPlayerIndex(); });
    } catch (e) {
        console.error('[PersonalStats] 初始化失败', e);
        const c = document.getElementById('personalResult');
        if (c) c.innerHTML = `<div class="compare-placeholder"><i class="fa-solid fa-triangle-exclamation"></i><p>${i18n[currentLang].personal_stats_load_fail}</p></div>`;
    }

    console.log('[PersonalStats] 初始化完成');
}

/**
 * 语言切换时重新渲染个人数据页面（含搜索框占位符、标签筛选、球员索引）
 */
function reapplyPersonalStats() {
    if (!document.getElementById('personalResult')) return;
    const si = document.getElementById('playerSearchInput');
    if (si) si.placeholder = i18n[currentLang].personal_stats_search_ph;
    renderTagFilters();
    renderPlayerIndex();
}
