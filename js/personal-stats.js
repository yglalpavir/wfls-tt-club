/* ========================================
   personal-stats.js - 个人数据页面
   ======================================== */

let selectedTags = [];

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
    const displayTags = getDisplayTags();
    if (!displayTags.length) {
        container.innerHTML = '<span style="font-size:0.75rem;color:var(--text-muted);">暂无标签数据</span>';
        return;
    }

    const activeCount = getPlayersByTags(selectedTags).length;

    container.innerHTML = displayTags.map(tag => {
        const isActive = selectedTags.includes(tag);
        const count = getTagPlayerCount(tag);
        const isMerged = !!TAG_MERGE_RULES[tag];
        const mergedClass = isMerged ? ' merged' : '';
        return `<span class="tag-filter-badge${isActive ? ' active' : ''}${mergedClass}" data-tag="${tag}">
            ${tag}<span class="tag-filter-count">${count}</span>
        </span>`;
    }).join('');

    // 更新标签栏标题，显示匹配人数
    const label = document.querySelector('.tag-filter-section > label');
    if (label) {
        if (selectedTags.length > 0) {
            label.innerHTML = `<i class="fa-solid fa-tags"></i> 按标签筛选 <span class="tag-match-count">${activeCount}人</span>`;
        } else {
            label.innerHTML = `<i class="fa-solid fa-tags"></i> 按标签筛选`;
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
            renderPersonalPlayerSelect();
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

function renderPersonalPlayerSelect() {
    const players = getPlayersByTags(selectedTags);
    const sel = document.getElementById('personalPlayerSelect');
    if (!sel) return;
    const opts = players.map(p => `<option value="${p}">${p}</option>`).join('');
    sel.innerHTML = '<option value="">-- 选择球员 --</option>' + opts;

    const label = sel.parentElement.querySelector('label');
    if (label) {
        if (selectedTags.length > 0) {
            label.innerHTML = `选择球员 <span class="tag-match-count">${players.length}人</span>`;
        } else {
            label.innerHTML = `选择球员 <span class="tag-match-count">${players.length}人</span>`;
        }
    }
}

function getApproxScoreAtDate(playerName, targetDate, sortedLog, startScores, beforeMatch) {
    const sc = { ...startScores };
    for (const r of sortedLog) {
        if (beforeMatch ? (r['日期'] >= targetDate) : (r['日期'] > targetDate)) break;
        if (isMatchRecord(r)) {
            const w = r['胜者'], l = r['负者'];
            if (!sc[w]) sc[w] = 1300;
            if (!sc[l]) sc[l] = 1300;
            const wg = calcMatchPoints(w, l, r['类型'], r['日期'], r['日期'], sc);
            sc[w] = Math.max(SCORE_FLOOR, sc[w] + wg);
            sc[l] = Math.max(SCORE_FLOOR, sc[l] - wg * 0.8);
        } else if (isBonusRecord(r)) {
            const t = r['对象'];
            const b = parseFloat(r['分数']) || 0;
            if (!sc[t]) sc[t] = 1300;
            sc[t] = Math.max(SCORE_FLOOR, sc[t] + b);
        }
    }
    return Math.round(sc[playerName] || 1300);
}

function renderPersonalStats(playerName) {
    const container = document.getElementById('personalResult');
    if (!container) return;

    if (!scoreLogData || !scoreLogData.length) {
        container.innerHTML = '<div class="compare-placeholder"><p>暂无比赛数据</p></div>';
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
        for (const t of rankingTimeline) {
            if (!t.data || !t.data.length) continue;
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

    // 计算对手各项分数
    for (const opp in oppStats) {
        const s = oppStats[opp];
        if (s.lastWinDate) s.preWinScore = getApproxScoreAtDate(opp, s.lastWinDate, sortedLog, startScores, false);
        s.preMatchScore = getApproxScoreAtDate(opp, s.lastDate, sortedLog, startScores, false);
        const oppCur = currentCd.find(p => p['姓名'] === opp);
        s.curScore = oppCur ? oppCur['当前积分'] : getApproxScoreAtDate(opp, s.lastDate, sortedLog, startScores, false);
    }

    const scores = { ...startScores };
    const oppPointsGained = {};
    const oppPointsLost = {};
    for (const r of sortedLog) {
        if (!isMatchRecord(r)) {
            if (isBonusRecord(r)) {
                const t = r['对象'];
                const b = parseFloat(r['分数']) || 0;
                if (!scores[t]) scores[t] = 1300;
                scores[t] = Math.max(SCORE_FLOOR, scores[t] + b);
            }
            continue;
        }
        const w = r['胜者'], l = r['负者'];
        if (!scores[w]) scores[w] = 1300;
        if (!scores[l]) scores[l] = 1300;
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

    const luckyStars = Object.entries(oppStats)
        .map(([name, s]) => {
            const gained = oppPointsGained[name] || 0;
            const lost = oppPointsLost[name] || 0;
            return { name, wins: s.wins, losses: s.losses, curScore: s.curScore, gained, lost, net: gained - lost };
        })
        .filter(x => x.wins + x.losses > 0 && x.net > 0)
        .sort((a, b) => b.net - a.net)
        .slice(0, 3);

    const nemeses = Object.entries(oppStats)
        .map(([name, s]) => {
            const gained = oppPointsGained[name] || 0;
            const lost = oppPointsLost[name] || 0;
            return { name, wins: s.wins, losses: s.losses, curScore: s.curScore, gained, lost, net: gained - lost };
        })
        .filter(x => x.wins + x.losses > 0 && x.net < 0)
        .sort((a, b) => a.net - b.net)
        .slice(0, 3);

    function fmtDate(ds) {
        const d = new Date(ds + 'T00:00:00');
        return d.getFullYear() + '年' + (d.getMonth()+1) + '月' + d.getDate() + '日';
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
    html += '<strong>' + playerName + '</strong>的积分超过了本校<strong>' + percentile.toFixed(2) + '%</strong>的乒乓球选手。';
    html += '</div>';

    // === 积分变化折线图 ===
    // 计算每日积分历史
    const dailyScoreHistory = computeDailyScoreHistory(playerName, sortedLog, startScores);

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
            html += '<span class="personal-tags-label"><i class="fa-solid fa-tags"></i> 标签</span>';
            playerTags.forEach(tag => {
                html += '<span class="personal-tag-badge">' + tag + '</span>';
            });
            html += '</div>';
        }
        if (playerHonors.length > 0) {
            html += '<div class="personal-honors-section">';
            html += '<span class="personal-honors-label"><i class="fa-solid fa-medal"></i> 荣誉</span>';
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
    html += '<div class="personal-card-header"><i class="fa-solid fa-trophy"></i> 胜利 · 曾战胜的前三名</div>';
    if (beatenOpps.length === 0) {
        html += '<div class="personal-card-empty">暂无</div>';
    } else {
        html += '<div class="personal-card-list">';
        beatenOpps.forEach(([name, s], i) => {
            html += '<div class="personal-card-item">';
            html += '<span class="personal-card-rank">' + (i+1) + '</span>';
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
            html += '<span class="personal-card-rank">' + (i+1) + '</span>';
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
            html += '<span class="personal-card-rank">' + (i+1) + '</span>';
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
            html += '<span class="personal-card-rank">' + (i+1) + '</span>';
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
 * 计算球员每日积分历史（从 score log 逐日模拟）
 */
function computeDailyScoreHistory(playerName, sortedLog, startScores) {
    const history = [];
    const sc = { ...startScores };
    // 收集所有有比赛的日期并排序
    const dateSet = new Set();
    for (const r of sortedLog) dateSet.add(r['日期']);
    const dates = Array.from(dateSet).sort();

    if (dates.length === 0) return history;

    let logIdx = 0;
    for (const date of dates) {
        // 处理当天所有记录
        while (logIdx < sortedLog.length && sortedLog[logIdx]['日期'] === date) {
            const r = sortedLog[logIdx];
            if (isMatchRecord(r)) {
                const w = r['胜者'], l = r['负者'];
                if (!sc[w]) sc[w] = 1300;
                if (!sc[l]) sc[l] = 1300;
                const wg = calcMatchPoints(w, l, r['类型'], r['日期'], r['日期'], sc);
                sc[w] = Math.max(SCORE_FLOOR, sc[w] + wg);
                sc[l] = Math.max(SCORE_FLOOR, sc[l] - wg * 0.8);
            } else if (isBonusRecord(r)) {
                const t = r['对象'];
                const b = parseFloat(r['分数']) || 0;
                if (!sc[t]) sc[t] = 1300;
                sc[t] = Math.max(SCORE_FLOOR, sc[t] + b);
            }
            logIdx++;
        }
        const score = Math.round(sc[playerName] || 1300);
        history.push({
            time: date,
            label: formatDateShort(date),
            score: score
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
        const weekKey = monday.toISOString().split('T')[0];

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

    // 根据粒度调整张力：天=低平滑，周=中平滑，快照=高平滑
    const tensionMap = { day: 0.05, week: 0.2, snapshot: 0.35 };
    const tension = tensionMap[granularity] || 0.1;

    // 天级数据点较多，减小点大小
    const pointRadiusMap = { day: 2, week: 3, snapshot: 4 };
    const pointRadius = pointRadiusMap[granularity] || 3;

    // 天级线宽稍细
    const borderWidthMap = { day: 1.8, week: 2.2, snapshot: 2.5 };
    const borderWidth = borderWidthMap[granularity] || 2;

    new Chart(canvas, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [{
                label: '积分',
                data: scores,
                borderColor: '#4da3ff',
                backgroundColor: isDark ? 'rgba(77, 163, 255, 0.1)' : 'rgba(0, 123, 255, 0.08)',
                borderWidth: borderWidth,
                pointBackgroundColor: '#4da3ff',
                pointBorderColor: '#fff',
                pointBorderWidth: 1.5,
                pointRadius: pointRadius,
                pointHoverRadius: pointRadius + 3,
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
                    ticks: { color: textColor, font: { size: 10 }, maxRotation: granularity === 'day' ? 60 : 45, autoSkip: true, maxTicksLimit: granularity === 'day' ? 20 : 15 }
                },
                y: {
                    grid: { color: gridColor },
                    ticks: { color: textColor, font: { size: 11 } },
                    beginAtZero: false
                }
            }
        }
    });
}

function initPersonalStats() {
    console.log('[PersonalStats] 开始初始化');

    if (!document.getElementById('personalPlayerSelect')) {
        console.warn('[PersonalStats] 页面上找不到 personalPlayerSelect 元素');
        return;
    }

    renderTagFilters();
    renderPersonalPlayerSelect();

    document.getElementById('applyPersonalStats')?.addEventListener('click', () => {
        const p = document.getElementById('personalPlayerSelect')?.value;
        if (!p) { alert('请选择一名球员'); return; }
        renderPersonalStats(p);
    });

    console.log('[PersonalStats] 初始化完成');
}
