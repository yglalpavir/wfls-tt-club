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

/* ---- 战绩卡导出（Canvas 手绘，复用 common.js 的排行导出工具函数） ---- */

function ppAlpha(hex, a) {
    const h = String(hex || '').replace('#', '');
    if (h.length !== 6) return hex;
    return 'rgba(' + parseInt(h.slice(0, 2), 16) + ',' + parseInt(h.slice(2, 4), 16) + ',' + parseInt(h.slice(4, 6), 16) + ',' + a + ')';
}

function ppChipStyle(C, kind) {
    if (kind === 'tag') return { bg: C.pale, fg: C.accent };
    if (kind === 'honor' || kind === 'role') return { bg: ppAlpha(C.gold, 0.14), fg: C.gold };
    if (kind === 'status-active') return { bg: ppAlpha(C.green, 0.14), fg: C.green };
    return { bg: ppAlpha(C.muted, 0.14), fg: C.sub };
}

// chips 按宽度折行；返回 [{text, kind, w}] 二维数组
function ppChipRows(ctx, chips, maxW, gap) {
    const rows = [];
    let row = [], x = 0;
    for (const c of chips) {
        const w = Math.ceil(ctx.measureText(c.text).width) + 20;
        if (row.length && x + gap + w > maxW) { rows.push(row); row = []; x = 0; }
        if (row.length) x += gap;
        row.push({ text: c.text, kind: c.kind, w: w });
        x += w;
    }
    if (row.length) rows.push(row);
    return rows;
}

function buildPlayerShareCardCanvas(player, data) {
    const cs = getComputedStyle(document.body);
    const v = n => (cs.getPropertyValue(n) || '').trim();
    const C = {
        bg: v('--bg-white') || '#ffffff',
        soft: v('--bg-lighter') || '#f1f5f9',
        pale: v('--primary-pale') || '#e6f2ff',
        accent: v('--primary-blue') || '#007bff',
        text: v('--text-primary') || '#1a1a2e',
        sub: v('--text-secondary') || '#4a5568',
        muted: v('--text-muted') || '#8899aa',
        border: v('--border-color') || '#e2e8f0',
        green: v('--accent-green') || '#52c41a',
        gold: v('--accent-gold') || '#f0a500'
    };
    const L = i18n[currentLang];
    const FONT = "'Poppins','Noto Sans SC','Microsoft YaHei',sans-serif";

    const W = 720, pad = 36, inset = 6, innerW = W - pad * 2;

    // ---- 数据 ----
    const wr = data.totalMatches > 0 ? Math.round(data.wins / data.totalMatches * 100) + '%' : '0%';
    const lastSnap = data.scoreHistory.length ? data.scoreHistory[data.scoreHistory.length - 1] : null;
    const curRank = lastSnap ? lastSnap.rank : null;
    const cells = [
        { label: L.wtt_ov_current, value: String(data.curScoreDisp), color: C.accent },
        { label: L.pp_card_cur_rank, value: curRank ? '#' + curRank : '-', color: C.gold },
        { label: L.wtt_ov_total, value: String(data.totalMatches), color: C.text },
        { label: L.wtt_ov_percentile, value: wr, color: C.green },
        { label: L.wtt_ov_max, value: String(data.maxScore), color: C.text },
        { label: L.wtt_ov_bestrank, value: data.bestRank === Infinity ? '-' : '#' + data.bestRank, color: C.gold }
    ];

    // 走势序列：优先每日积分，不足时回退快照序列
    let series = data.dailyScoreHistory.map(p => ({ label: p.label, score: p.score }));
    if (series.length < 2) series = data.scoreHistory.map(p => ({ label: p.label, score: p.score }));
    const hasChart = series.length >= 2;
    if (series.length > 80) {
        const step = Math.ceil(series.length / 80);
        const ds = [];
        for (let i = 0; i < series.length; i += step) ds.push(series[i]);
        if (ds[ds.length - 1] !== series[series.length - 1]) ds.push(series[series.length - 1]);
        series = ds;
    }

    // chips：状态 / 角色 / 标签 / 荣誉（超出一行自动折行，最多两行）
    const chips = [{ text: player.status === 'active' ? L.pp_status_active : L.pp_status_alumni, kind: player.status === 'active' ? 'status-active' : 'status-alumni' }];
    if (player.role) chips.push({ text: String(player.role), kind: 'role' });
    (player.tags || []).forEach(t => chips.push({ text: String(t), kind: 'tag' }));
    (player.honors || []).forEach(h => chips.push({ text: String(h), kind: 'honor' }));
    if (chips.length > 10) {
        const rest = chips.length - 9;
        chips.length = 9;
        chips.push({ text: '+' + rest, kind: 'tag' });
    }

    // ---- 布局测量 ----
    const mctx = document.createElement('canvas').getContext('2d');
    mctx.font = `600 12px ${FONT}`;
    const chipGap = 8, chipH = 24, chipRowGap = 8;
    const chipRows = ppChipRows(mctx, chips, innerW - inset * 2, chipGap);

    const headH = 26, divGap = 20, nameRowH = 40;
    const chipBlockH = chipRows.length ? chipRows.length * chipH + (chipRows.length - 1) * chipRowGap + 14 : 0;
    const gridCellH = 74, gridGap = 8, gridH = gridCellH * 2 + gridGap;
    const chartBlockH = hasChart ? 20 + 84 + 22 : 0;
    const footBlockH = 14 + 18 + 16;
    const H = pad + headH + divGap + nameRowH + chipBlockH + gridH + chartBlockH + footBlockH + pad;

    // ---- 绘制 ----
    const scale = Math.min(3, Math.max(2, window.devicePixelRatio || 2));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(W * scale); canvas.height = Math.round(H * scale);
    const ctx = canvas.getContext('2d');
    ctx.scale(scale, scale);
    ctx.textBaseline = 'middle';

    _rankImgRoundRect(ctx, 0.5, 0.5, W - 1, H - 1, 20);
    ctx.fillStyle = C.bg; ctx.fill();
    ctx.strokeStyle = C.border; ctx.lineWidth = 1; ctx.stroke();

    let y = pad;

    // 头部
    ctx.font = `700 18px ${FONT}`; ctx.fillStyle = C.accent; ctx.textAlign = 'left';
    ctx.fillText(L.pp_card_title || '个人战绩卡', pad + inset, y + 13);
    ctx.font = `600 12px ${FONT}`; ctx.fillStyle = C.muted; ctx.textAlign = 'right';
    ctx.fillText('WFLS TT Club', W - pad - inset, y + 13);
    y += headH;
    ctx.strokeStyle = C.border;
    ctx.beginPath(); ctx.moveTo(pad, y + 6.5); ctx.lineTo(W - pad, y + 6.5); ctx.stroke();
    y += divGap;

    // 姓名 + UID
    ctx.textAlign = 'left';
    ctx.font = `800 26px ${FONT}`; ctx.fillStyle = C.text;
    const nameText = String(player.name || '-');
    ctx.fillText(nameText, pad + inset, y + nameRowH / 2);
    const nameW = Math.ceil(ctx.measureText(nameText).width);
    ctx.font = `600 13px ${FONT}`; ctx.fillStyle = C.muted;
    ctx.fillText('#' + String(player.uid), pad + inset + nameW + 10, y + nameRowH / 2 + 2);
    y += nameRowH;

    // chips
    if (chipRows.length) {
        y += 4;
        chipRows.forEach((row, ri) => {
            let x = pad + inset;
            for (const c of row) {
                const st = ppChipStyle(C, c.kind);
                _rankImgRoundRect(ctx, x, y, c.w, chipH, chipH / 2);
                ctx.fillStyle = st.bg; ctx.fill();
                ctx.font = `600 12px ${FONT}`; ctx.fillStyle = st.fg; ctx.textAlign = 'left';
                ctx.fillText(c.text, x + 10, y + chipH / 2 + 0.5);
                x += c.w + chipGap;
            }
            y += chipH;
            if (ri < chipRows.length - 1) y += chipRowGap;
        });
        y += 14;
    }

    // 数据格 2×3
    const gridTop = y;
    const colW = (innerW - inset * 2 - gridGap * 2) / 3;
    cells.forEach((cell, i) => {
        const r = Math.floor(i / 3), c = i % 3;
        const x = pad + inset + c * (colW + gridGap);
        const cy = gridTop + r * (gridCellH + gridGap);
        _rankImgRoundRect(ctx, x, cy, colW, gridCellH, 12);
        ctx.fillStyle = C.soft; ctx.fill();
        ctx.font = `800 22px ${FONT}`; ctx.fillStyle = cell.color; ctx.textAlign = 'center';
        ctx.fillText(cell.value, x + colW / 2, cy + gridCellH / 2 - 8);
        ctx.font = `500 11px ${FONT}`; ctx.fillStyle = C.muted;
        ctx.fillText(cell.label, x + colW / 2, cy + gridCellH / 2 + 16);
    });
    y = gridTop + gridH;

    // 积分走势
    if (hasChart) {
        y += 20;
        const plotH = 84;
        const x0 = pad + inset + 2, x1 = W - pad - inset - 2;
        const vals = series.map(p => p.score);
        const vmin = Math.min.apply(null, vals), vmax = Math.max.apply(null, vals);
        const span = (vmax - vmin) || 1;
        const px = i => x0 + (x1 - x0) * (i / (series.length - 1));
        const py = s => (y + plotH - 6) - (plotH - 18) * ((s - vmin) / span);
        ctx.beginPath();
        series.forEach((p, i) => { const X = px(i), Y = py(p.score); i ? ctx.lineTo(X, Y) : ctx.moveTo(X, Y); });
        ctx.lineTo(px(series.length - 1), y + plotH); ctx.lineTo(x0, y + plotH); ctx.closePath();
        ctx.fillStyle = ppAlpha(C.accent, 0.12); ctx.fill();
        ctx.beginPath();
        series.forEach((p, i) => { const X = px(i), Y = py(p.score); i ? ctx.lineTo(X, Y) : ctx.moveTo(X, Y); });
        ctx.strokeStyle = C.accent; ctx.lineWidth = 2; ctx.lineJoin = 'round'; ctx.stroke();
        const lx = px(series.length - 1), ly = py(series[series.length - 1].score);
        ctx.beginPath(); ctx.arc(lx, ly, 3.5, 0, Math.PI * 2);
        ctx.fillStyle = C.accent; ctx.fill();
        ctx.beginPath(); ctx.arc(lx, ly, 3.5, 0, Math.PI * 2);
        ctx.strokeStyle = C.bg; ctx.lineWidth = 1.5; ctx.stroke();
        ctx.font = `500 10px ${FONT}`; ctx.fillStyle = C.muted;
        ctx.textAlign = 'left';
        ctx.fillText(String(Math.round(vmax)), x0, y + 8);
        ctx.fillText(String(Math.round(vmin)), x0, y + plotH - 8);
        ctx.fillText(series[0].label, x0, y + plotH + 14);
        ctx.textAlign = 'right';
        ctx.fillText(series[series.length - 1].label, x1, y + plotH + 14);
        y += 84 + 22;
    }

    // 页脚
    const url = location.origin + location.pathname.replace(/[^/]*$/, '') + 'player.html?uid=' + encodeURIComponent(String(player.uid));
    const d = new Date(); const pd = n => String(n).padStart(2, '0');
    const stamp = `${d.getFullYear()}-${pd(d.getMonth() + 1)}-${pd(d.getDate())} ${pd(d.getHours())}:${pd(d.getMinutes())}`;
    y += 14;
    ctx.strokeStyle = C.border;
    ctx.beginPath(); ctx.moveTo(pad, y + 0.5); ctx.lineTo(W - pad, y + 0.5); ctx.stroke();
    y += 18;
    ctx.font = `500 11px ${FONT}`; ctx.textAlign = 'left'; ctx.fillStyle = C.accent;
    ctx.fillText(url, pad, y + 6);
    ctx.textAlign = 'right'; ctx.fillStyle = C.muted;
    ctx.fillText(`${L.export_gen || ''} ${stamp}`.trim(), W - pad, y + 6);

    return canvas;
}

async function exportPlayerShareCard() {
    const player = ppCurrentPlayer;
    if (!player) return;
    const data = computePersonalStatsData(player.name);
    if (!data) { alert(i18n[currentLang].personal_stats_no_data || ''); return; }
    const btn = document.getElementById('playerExportBtn');
    const L = i18n[currentLang] || {};
    const origHtml = btn ? btn.innerHTML : '';
    if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> <span>' + escapeHtml(L.pp_export_btn || '') + '</span>'; }
    try {
        if (document.fonts && document.fonts.ready) { try { await document.fonts.ready; } catch (e) { /* 字体就绪探测失败时直接渲染 */ } }
        // 让按钮的 loading 态先绘制
        await new Promise(r => setTimeout(r, 30));
        const canvas = buildPlayerShareCardCanvas(player, data);
        const blob = _rankImgDataUrlToBlob(canvas.toDataURL('image/png'));
        _downloadRankImageBlob(blob, buildExportFileName('wfls-player-' + player.uid));
    } catch (err) {
        console.error('[PlayerPage] 战绩卡导出失败', err);
        alert(L.pp_export_fail || L.img_export_fail || '图片导出失败，请重试');
    } finally {
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