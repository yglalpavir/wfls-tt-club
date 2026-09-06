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
    const statusHtml = `<span class="player-status-chip ${player.status === 'active' ? 'active' : 'alumni'}"><i class="fa-solid fa-circle"></i> ${player.status === 'active' ? i18n[currentLang].pp_status_active : i18n[currentLang].pp_status_alumni}</span>`;
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
                const wg = calcMatchPoints(w, l, r['类型'], r['日期'], getTodayStr(), scores, r['赛制']);
                const rawGain = calcRawPoints(w, l, r['类型'], scores, r['赛制']);
                if (w === playerName || l === playerName) {
                    const isWin = w === playerName;
                    const pre = scores[playerName];
                    const oppPre = scores[isWin ? l : w];
                    const rawChange = isWin ? rawGain : -rawGain * LOSER_POINT_MULTIPLIER;
                    const change = isWin ? wg : -wg * LOSER_POINT_MULTIPLIER;
                    rows.push({ date: r['日期'], type: r['类型'], opp: isWin ? l : w, isWin: isWin, isBonus: false, pre: pre, oppPre: oppPre, rawChange: rawChange, change: change, post: pre + change });
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

// 计算球员全部比赛记录（逐赛季回放，含赛季继承），返回按日期倒序 rows
// records 可选传入已算好的结果，避免同一页内重复回放
function renderPlayerMatchTable(playerName, records) {
    const container = document.getElementById('playerMatchTable');
    if (!container) return;
    const rows = records || computePlayerMatchRecords(playerName);
    if (!rows.length) { container.innerHTML = ''; return; }

    const rowsHtml = rows.map(r => {
        if (r.isBonus) {
            const cc = r.change >= 0 ? 'score-change-positive' : 'score-change-negative';
            const sign = r.change >= 0 ? '+' : '';
            return `<tr><td>${escapeHtml(r.date)}</td><td>${escapeHtml(r.type)}</td><td>-</td><td class="result-win">${i18n[currentLang].score_type_bonus}</td><td>${r.pre.toFixed(1)}</td><td class="${cc}">${sign}${r.change.toFixed(1)}</td><td>${r.post.toFixed(1)}</td></tr>`;
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
        renderPlayerExportButton();
        renderPlayerHeader(player);

        content.innerHTML += '<div id="playerStatsBody"></div><div id="playerAnalyticsBody"></div><div id="playerMatchTable"></div>';
        const matchRecords = computePlayerMatchRecords(player.name);
        renderPersonalStats(player.name, 'playerStatsBody');
        renderPlayerAnalytics(player.name, matchRecords);
        renderPlayerMatchTable(player.name, matchRecords);
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
    destroyPlayerAnalytics();
    document.title = ppCurrentPlayer.name + ' - ' + i18n[currentLang].personal_stats_page_title;
    content.innerHTML = '';
    renderPlayerNavSwitch(ppCurrentPlayer);
    renderPlayerExportButton();
    renderPlayerHeader(ppCurrentPlayer);
    content.innerHTML += '<div id="playerStatsBody"></div><div id="playerAnalyticsBody"></div><div id="playerMatchTable"></div>';
    const matchRecords = computePlayerMatchRecords(ppCurrentPlayer.name);
    renderPersonalStats(ppCurrentPlayer.name, 'playerStatsBody');
    renderPlayerAnalytics(ppCurrentPlayer.name, matchRecords);
    renderPlayerMatchTable(ppCurrentPlayer.name, matchRecords);
}

/* ---- 战绩卡导出（foreignObject 截取整页可视化内容，复用 common.js 的导出工具函数） ---- */

// 构建离屏导出节点：资料卡 + 总览/走势/对手卡 + 全部分析图表（不含比赛明细表与交互控件）
function buildPlayerExportNode(player) {
    const profileEl = document.querySelector('#playerDetailContent .player-profile');
    const statsEl = document.getElementById('playerStatsBody');
    const analyticsEl = document.getElementById('playerAnalyticsBody');
    if (!profileEl || !statsEl || !statsEl.innerHTML.trim()) return null;
    const L = i18n[currentLang] || {};

    const wrap = document.createElement('div');
    wrap.setAttribute('aria-hidden', 'true');
    wrap.style.cssText = 'position:fixed;left:0;top:0;z-index:-1;width:900px;box-sizing:border-box;padding:30px 34px 24px;background:var(--bg-white);border:1px solid var(--border-color);border-radius:18px;color:var(--text-primary);font-family:"Poppins","Noto Sans SC","Microsoft YaHei",sans-serif;';

    const head = document.createElement('div');
    head.style.cssText = 'display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;';
    head.innerHTML = '<span style="font-size:18px;font-weight:700;color:var(--primary-blue);">' + escapeHtml(L.pp_card_title || '个人战绩卡') + '</span>'
        + '<span style="font-size:13px;font-weight:600;color:var(--text-muted);">WFLS TT Club</span>';
    wrap.appendChild(head);

    const content = document.createElement('div');
    content.innerHTML = profileEl.innerHTML + (statsEl.innerHTML || '') + (analyticsEl ? analyticsEl.innerHTML : '');
    // 中和 glass-card 的毛玻璃外观（离屏节点自带卡片底），只保留卡片边框
    content.querySelectorAll('.glass-card').forEach(el => {
        el.style.background = 'transparent';
        el.style.backdropFilter = 'none';
        el.style.webkitBackdropFilter = 'none';
        el.style.boxShadow = 'none';
    });
    // 粒度切换等交互控件不进入导出图
    content.querySelectorAll('.personal-chart-granularity').forEach(el => el.remove());
    // html2canvas 会把 flex 居中的小圆点文字画到容器左下角——导出前用 canvas 预渲染成图片绕开
    content.querySelectorAll('.pa-form-dot').forEach(dot => {
        try {
            const cs = getComputedStyle(dot);
            const size = Math.round(parseFloat(cs.width)) || 22;
            const cv = document.createElement('canvas');
            cv.width = size * 3; cv.height = size * 3;
            const c2 = cv.getContext('2d');
            c2.scale(3, 3);
            c2.beginPath(); c2.arc(size / 2, size / 2, size / 2, 0, Math.PI * 2);
            c2.fillStyle = cs.backgroundColor && cs.backgroundColor !== 'rgba(0, 0, 0, 0)' ? cs.backgroundColor : '#52c41a';
            c2.fill();
            c2.fillStyle = cs.color || '#fff';
            c2.font = `${cs.fontWeight} ${parseFloat(cs.fontSize)}px ${cs.fontFamily}`;
            c2.textAlign = 'center'; c2.textBaseline = 'middle';
            c2.fillText(dot.textContent.trim(), size / 2, size / 2 + 0.5);
            const img = document.createElement('img');
            img.src = cv.toDataURL('image/png');
            img.style.cssText = `display:inline-block;width:${size}px;height:${size}px;`;
            dot.replaceWith(img);
        } catch (e) { /* 替换失败时保留原节点 */ }
    });
    // 图表容器定高会裁剪克隆出的图片，改为随内容自适应
    content.querySelectorAll('.pa-chart-box, .pa-donut-box, .pa-spark-box, .personal-chart-wrapper').forEach(el => { el.style.height = 'auto'; el.style.maxHeight = 'none'; });
    // Chart.js 画布位图无法随 innerHTML 克隆，逐个转为 <img>（与源文档顺序一一对应）
    // 后台标签页 rAF 会被节流导致图表尚未绘制，导出前先强制同步重绘
    const srcCanvases = Array.from(document.querySelectorAll('#playerStatsBody canvas, #playerAnalyticsBody canvas'));
    const dstCanvases = content.querySelectorAll('canvas');
    srcCanvases.forEach((src, i) => {
        const dst = dstCanvases[i];
        if (!dst) return;
        try {
            const ch = (window.Chart && Chart.getChart) ? Chart.getChart(src) : null;
            if (ch) { try { ch.update('none'); } catch (e) { /* 已销毁的实例忽略 */ } try { if (typeof ch.draw === 'function') ch.draw(); } catch (e) { /* 已由 update 同步绘制 */ } }
            const img = document.createElement('img');
            img.src = src.toDataURL('image/png');
            img.style.cssText = 'display:block;width:100%;height:auto;';
            dst.replaceWith(img);
        } catch (e) { /* 画布已被销毁等异常时跳过该图 */ }
    });
    wrap.appendChild(content);

    const url = location.origin + location.pathname.replace(/[^/]*$/, '') + 'player.html?uid=' + encodeURIComponent(String(player.uid));
    const d = new Date(); const pd = n => String(n).padStart(2, '0');
    const stamp = `${d.getFullYear()}-${pd(d.getMonth() + 1)}-${pd(d.getDate())} ${pd(d.getHours())}:${pd(d.getMinutes())}`;
    const foot = document.createElement('div');
    foot.style.cssText = 'display:flex;justify-content:space-between;align-items:center;gap:20px;margin-top:24px;padding-top:14px;border-top:1px solid var(--border-color);font-size:11px;color:var(--text-muted);';
    foot.innerHTML = '<span style="color:var(--primary-blue);font-weight:600;word-break:break-all;">' + escapeHtml(url) + '</span>'
        + '<span style="white-space:nowrap;">' + escapeHtml(L.export_gen || '') + ' ' + stamp + '</span>';
    wrap.appendChild(foot);
    return wrap;
}

async function exportPlayerShareCard() {
    const player = ppCurrentPlayer;
    if (!player) return;
    const node = buildPlayerExportNode(player);
    if (!node) return;
    const btn = document.getElementById('playerExportBtn');
    const L = i18n[currentLang] || {};
    const origHtml = btn ? btn.innerHTML : '';
    if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> <span>' + escapeHtml(L.pp_export_btn || '') + '</span>'; }
    try {
        document.body.appendChild(node);
        await exportDomNodeAsImage(node, { filenameBase: 'wfls-player-' + player.uid });
    } catch (err) {
        console.error('[PlayerPage] 战绩卡导出失败', err);
        alert(L.pp_export_fail || L.img_export_fail || '图片导出失败，请重试');
    } finally {
        if (node.parentNode) node.parentNode.removeChild(node);
        if (btn) { btn.disabled = false; btn.innerHTML = origHtml; }
    }
}

function renderPlayerExportButton() {
    const top = document.querySelector('.player-page-top');
    if (!top) return;
    let btn = document.getElementById('playerExportBtn');
    if (!btn) {
        btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'btn btn-sm btn-primary';
        btn.id = 'playerExportBtn';
        btn.addEventListener('click', exportPlayerShareCard);
        top.appendChild(btn);
    }
    btn.innerHTML = '<i class="fa-solid fa-image" aria-hidden="true"></i> <span data-i18n="pp_export_btn">' + escapeHtml(i18n[currentLang].pp_export_btn || '导出图片') + '</span>';
}