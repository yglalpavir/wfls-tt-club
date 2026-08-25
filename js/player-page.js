/* ========================================
   player-page.js - 球员个人主页（一人一页）
   入口: player.html?uid=10000
   ======================================== */

let ppCurrentPlayer = null;

// 最近一个有数据的快照中的球员行
function getLatestSnapshotRow(playerName) {
    for (let i = rankingTimeline.length - 1; i >= 0; i--) {
        const t = rankingTimeline[i];
        if (t && t.data && t.data.length) {
            const row = t.data.find(p => p['姓名'] === playerName);
            if (row) return { row: row, label: getNodeDisplayLabel(t), time: t.time };
        }
    }
    return null;
}

// 最近快照中的当前排名
function getCurrentRank(playerName) {
    for (let i = rankingTimeline.length - 1; i >= 0; i--) {
        const t = rankingTimeline[i];
        if (t && t.data && t.data.length) {
            const sorted = [...t.data].sort((a, b) => (b['当前积分'] || 0) - (a['当前积分'] || 0));
            const idx = sorted.findIndex(p => p['姓名'] === playerName);
            if (idx >= 0) return idx + 1;
        }
    }
    return null;
}

// 按当前积分（无数据时按初始积分）排序全部球员，供上一位/下一位导航
function getOrderedPlayerList() {
    const scoreMap = {};
    for (let i = rankingTimeline.length - 1; i >= 0; i--) {
        const t = rankingTimeline[i];
        if (t && t.data && t.data.length) {
            for (const p of t.data) scoreMap[p['姓名']] = p['当前积分'];
            break;
        }
    }
    const initial = (initialScoresData && initialScoresData.initialScores) || {};
    const names = getAllPlayersForPersonal();
    for (const n of names) {
        if (scoreMap[n] == null && initial[n] != null) scoreMap[n] = initial[n];
    }
    return [...names].sort((a, b) => (scoreMap[b] || -1) - (scoreMap[a] || -1) || String(a).localeCompare(String(b), 'zh'));
}

function renderPlayerNavSwitch(player) {
    const container = document.getElementById('playerNavSwitch');
    if (!container) return;
    const ordered = getOrderedPlayerList();
    let idx = -1;
    for (let i = 0; i < ordered.length; i++) {
        const p = getPlayerByName(ordered[i]);
        if (p && p.uid === player.uid) { idx = i; break; }
    }
    const prev = idx > 0 ? getPlayerByName(ordered[idx - 1]) : null;
    const next = idx >= 0 && idx < ordered.length - 1 ? getPlayerByName(ordered[idx + 1]) : null;
    let html = '';
    if (prev) html += `<a class="btn btn-sm player-nav-btn" href="player.html?uid=${prev.uid}" title="${escapeHtml(String(prev.name))}"><i class="fa-solid fa-chevron-left"></i> ${i18n[currentLang].pp_prev_player}</a>`;
    html += `<span class="player-nav-count">${idx >= 0 ? idx + 1 : '-'} / ${ordered.length}</span>`;
    if (next) html += `<a class="btn btn-sm player-nav-btn" href="player.html?uid=${next.uid}" title="${escapeHtml(String(next.name))}">${i18n[currentLang].pp_next_player} <i class="fa-solid fa-chevron-right"></i></a>`;
    container.innerHTML = html;
}

function renderPlayerHeader(player) {
    const content = document.getElementById('playerDetailContent');
    const snap = getLatestSnapshotRow(player.name);
    const rank = getCurrentRank(player.name);
    const row = snap ? snap.row : null;
    const curScore = row && row['当前积分'] != null ? (typeof row['当前积分'] === 'number' ? row['当前积分'].toFixed(1) : row['当前积分']) : '-';
    const roleHtml = player.role ? `<span class="player-role-chip"><i class="fa-solid fa-user-tie"></i> ${escapeHtml(String(player.role))}</span>` : '';
    const statusHtml = currentLang === 'en' ? `<span class="player-status-chip ${player.status === 'active' ? 'active' : 'alumni'}"><i class="fa-solid fa-circle"></i> ${player.status === 'active' ? i18n[currentLang].pp_status_active : i18n[currentLang].pp_status_alumni}</span>` : '';
    const tagsHtml = (player.tags || []).map(t => `<span class="personal-tag-badge">${escapeHtml(String(t))}</span>`).join('');
    const honorsHtml = (player.honors || []).map(h => `<span class="personal-honor-badge"><i class="fa-solid fa-medal"></i> ${escapeHtml(String(h))}</span>`).join('');

    const header = document.createElement('div');
    header.className = 'player-profile glass-card';
    header.innerHTML = `
        <div class="player-profile-info">
            <div class="player-profile-title">
                <h1>${escapeHtml(String(player.name))}</h1>
                <span class="player-index-uid">#${escapeHtml(String(player.uid))}</span>
                ${statusHtml}
            </div>
            <div class="player-profile-meta">
                ${roleHtml}
                <span class="player-score-chip"><i class="fa-solid fa-gem"></i> ${i18n[currentLang].rank_col_points} ${curScore}</span>
                <span class="player-score-chip"><i class="fa-solid fa-medal"></i> ${rank ? '#' + rank : '-'}</span>
                ${snap ? `<span class="player-score-chip"><i class="fa-solid fa-clock"></i> ${escapeHtml(String(snap.label))}</span>` : ''}
            </div>
            ${tagsHtml ? '<div class="player-profile-tags">' + tagsHtml + '</div>' : ''}
            ${honorsHtml ? '<div class="player-profile-honors">' + honorsHtml + '</div>' : ''}
        </div>
    `;
    content.appendChild(header);
}

// 计算球员全部比赛记录（逐赛季回放，含赛季继承），返回按日期倒序 rows
function computePlayerMatchRecords(playerName) {
    const sortedLog = [...scoreLogData].sort((a, b) => a['日期'].localeCompare(b['日期']));
    const rows = [];
    const seasons = (seasonsData && seasonsData.length) ? seasonsData : [];
    for (let si = 0; si < seasons.length; si++) {
        const season = seasons[si];
        const startScores = getSeasonStartScores(si);
        const scores = { ...startScores };
        const windowLog = sortedLog.filter(r => r['日期'] >= season.startDate && r['日期'] <= season.endDate);
        const prevBatches = playerTypeBatches;
        playerTypeBatches = buildPlayerTypeBatches(windowLog);
        for (const r of windowLog) {
            if (isBonusRecord(r)) {
                const t = r['对象'], b = parseFloat(r['分数']) || 0;
                if (!scores[t]) scores[t] = DEFAULT_INITIAL_SCORE;
                if (t === playerName) {
                    rows.push({ date: r['日期'], type: i18n[currentLang].score_type_bonus, opp: '-', isWin: true, isBonus: true, pre: scores[t], change: b, post: scores[t] + b });
                }
                scores[t] = Math.max(SCORE_FLOOR, scores[t] + b);
            } else if (isMatchRecord(r)) {
                const w = r['胜者'], l = r['负者'];
                if (!scores[w]) scores[w] = DEFAULT_INITIAL_SCORE;
                if (!scores[l]) scores[l] = DEFAULT_INITIAL_SCORE;
                const wg = calcMatchPoints(w, l, r['类型'], r['日期'], r['日期'], scores);
                const rawGain = calcRawPoints(w, l, r['类型'], scores);
                if (w === playerName || l === playerName) {
                    const isWin = w === playerName;
                    const pre = scores[playerName];
                    const rawChange = isWin ? rawGain : -rawGain * LOSER_POINT_MULTIPLIER;
                    const change = isWin ? wg : -wg * LOSER_POINT_MULTIPLIER;
                    rows.push({ date: r['日期'], type: r['类型'], opp: isWin ? l : w, isWin: isWin, isBonus: false, pre: pre, rawChange: rawChange, change: change, post: pre + change });
                }
                scores[w] = Math.max(SCORE_FLOOR, scores[w] + wg);
                scores[l] = Math.max(SCORE_FLOOR, scores[l] - wg * LOSER_POINT_MULTIPLIER);
            }
        }
        playerTypeBatches = prevBatches;
    }
    rows.sort((a, b) => b.date.localeCompare(a.date));
    return rows;
}

function renderPlayerMatchTable(playerName) {
    const container = document.getElementById('playerMatchTable');
    if (!container) return;
    const rows = computePlayerMatchRecords(playerName);
    if (!rows.length) { container.innerHTML = ''; return; }

    const rowsHtml = rows.map(r => {
        if (r.isBonus) {
            const cc = r.change >= 0 ? 'score-change-positive' : 'score-change-negative';
            const sign = r.change >= 0 ? '+' : '';
            return `<tr><td>${escapeHtml(r.date)}</td><td>${escapeHtml(r.type)}</td><td>-</td><td class="result-win">${i18n[currentLang].wtt_bonus}</td><td>${r.pre.toFixed(1)}</td><td class="${cc}">${sign}${r.change.toFixed(1)}</td><td>${r.post.toFixed(1)}</td></tr>`;
        }
        const res = r.isWin ? '<td class="result-win">' + i18n[currentLang].score_result_win + '</td>' : '<td class="result-loss">' + i18n[currentLang].score_result_loss + '</td>';
        const signRaw = r.rawChange >= 0 ? '+' : '';
        const signDec = r.change >= 0 ? '+' : '';
        const cc = r.change >= 0 ? 'score-change-positive' : 'score-change-negative';
        return `<tr><td>${escapeHtml(r.date)}</td><td>${escapeHtml(r.type)}</td><td>${linkPlayerName(r.opp)}</td>${res}<td>${r.pre.toFixed(1)}</td><td class="${cc}">${signRaw}${r.rawChange.toFixed(1)}<span class="decayed-note">（${signDec}${r.change.toFixed(1)}）</span></td><td>${r.post.toFixed(1)}</td></tr>`;
    }).join('');

    container.innerHTML = `
        <div class="personal-card glass-card match-list-card">
            <div class="personal-card-header"><i class="fa-solid fa-table-list"></i> ${i18n[currentLang].pp_all_records} <span class="tag-match-count">${i18n[currentLang].pp_matches_count.replace('{n}', rows.length)}</span></div>
            <div class="score-detail-table-wrapper" style="max-height:420px;">
                <table class="score-detail-table">
                    <thead><tr><th>${i18n[currentLang].score_col_date}</th><th>${i18n[currentLang].score_col_type}</th><th>${i18n[currentLang].score_col_opponent}</th><th>${i18n[currentLang].score_col_result}</th><th>${i18n[currentLang].pp_col_before}</th><th>${i18n[currentLang].pp_col_change}</th><th>${i18n[currentLang].pp_col_after}</th></tr></thead>
                    <tbody>${rowsHtml}</tbody>
                </table>
            </div>
        </div>`;
}

async function initPlayerPage() {
    const content = document.getElementById('playerDetailContent');
    if (!content) return;
    try {
        await loadPersonalChartSettings();

        const uid = new URLSearchParams(window.location.search).get('uid');
        const player = uid != null ? getPlayerByUid(uid) : null;
        if (!player) {
            content.innerHTML = `<div class="compare-placeholder"><i class="fa-solid fa-user-xmark"></i><p>${i18n[currentLang].pp_no_player} (uid: ${escapeHtml(String(uid || '-'))})</p><a href="personal_stats.html" class="btn btn-sm btn-primary" style="margin-top:14px;">${i18n[currentLang].pp_back_index}</a></div>`;
            return;
        }

        document.title = player.name + ' - ' + i18n[currentLang].personal_stats_page_title;

        ppCurrentPlayer = player;
        content.innerHTML = '';
        renderPlayerNavSwitch(player);
        renderPlayerHeader(player);

        content.innerHTML += '<div id="playerStatsBody"></div><div id="playerMatchTable"></div>';
        renderPersonalStats(player.name, 'playerStatsBody');
        renderPlayerMatchTable(player.name);
        console.log('[PlayerPage] 初始化完成:', player.name, '#' + player.uid);
    } catch (e) {
        console.error('[PlayerPage] 初始化失败', e);
        content.innerHTML = `<div class="compare-placeholder"><i class="fa-solid fa-triangle-exclamation"></i><p>${i18n[currentLang].pp_load_fail}</p><button class="btn btn-sm btn-primary" style="margin-top:14px;" onclick="location.reload()">${i18n[currentLang].pp_refresh}</button></div>`;
    }
}

function reapplyPlayerPage() {
    if (!ppCurrentPlayer) return;
    const content = document.getElementById('playerDetailContent');
    if (!content) return;
    const canvas = document.getElementById('personalScoreChart');
    if (canvas && window.Chart && Chart.getChart) {
        const existing = Chart.getChart(canvas);
        if (existing) existing.destroy();
    }
    document.title = ppCurrentPlayer.name + ' - ' + i18n[currentLang].personal_stats_page_title;
    content.innerHTML = '';
    renderPlayerNavSwitch(ppCurrentPlayer);
    renderPlayerHeader(ppCurrentPlayer);
    content.innerHTML += '<div id="playerStatsBody"></div><div id="playerMatchTable"></div>';
    renderPersonalStats(ppCurrentPlayer.name, 'playerStatsBody');
    renderPlayerMatchTable(ppCurrentPlayer.name);
}