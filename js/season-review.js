/* ========================================
   season-review.js - 赛季总结页（season-review.html）
   数据口径全部复用 score-engine：排名时间线（赛季首末节点）、赛季起始分（getSeasonStartScores）、
   原始得分（calcRawPoints）、活跃球员（getActivePlayers），与排行榜/积分明细弹窗保持一致。
   页面派发：main.js initPage 通过 #seasonReviewBody 标记调用 initSeasonReview()。
   ======================================== */

let srState = { seasonIndex: -1, ready: false, loading: false };
let srChart = null;

/* WTT 模式：wtt_season_review.html 在本脚本加载前设 window.SR_WTT_MODE = true。
   club 全局与 WTT 全局的差异集中在三处，逐一分支：
   ① 时间线（swap 集合不含它）② 数据加载 ③ 球员链接；
   seasonsData/scoreLogData/eventCoefficients/引擎常量由 wttWithDataContext 在渲染期临时切换。 */
const SR_WTT = typeof window.SR_WTT_MODE !== 'undefined' && !!window.SR_WTT_MODE;

function srTimeline() { return SR_WTT ? wttRankingTimeline : rankingTimeline; }

function srPlayerLink(name) {
    /* WTT 复用站点规范链接（uid + 缓存；双打对组按站点惯例整体为一个身份） */
    if (SR_WTT) { return (typeof wttLinkPlayerName === 'function') ? wttLinkPlayerName(name) : escapeHtml(String(name)); }
    return linkPlayerName(name);
}

/* 渲染统一入口：WTT 模式下在数据上下文内同步渲染（swap 集合内的全局指向 WTT 数据） */
function srRenderInContext(si) {
    if (SR_WTT && typeof wttWithDataContext === 'function') { wttWithDataContext(() => renderSeasonReview(si)); }
    else { renderSeasonReview(si); }
}

async function srLoadData() {
    if (SR_WTT && typeof wttLoadSettingsAndFiles === 'function') {
        wttDetectCategory();
        await wttLoadSettingsAndFiles(true, null);
        wttRankingTimeline = (await wttCalculateAllRankingsAsync(null)) || [];
        return wttRankingTimeline.length > 0;
    }
    return loadRankingDataForViz();
}

const SR_WINS_NEEDED = { bo3: 2, bo5: 3, bo7: 4 };
const SR_GAME_SCORE_RE = /^(\d{1,2})\s*[-:：]\s*(\d{1,2})$/;

function srLoadingHtml() {
    return `<div style="text-align:center;padding:60px 0;">
        <div class="wtt-spinner" style="width:36px;height:36px;border:3px solid var(--border-color);border-top-color:var(--accent-blue);border-radius:50%;animation:wttSpin 0.8s linear infinite;margin:0 auto 12px;"></div>
        <p style="color:var(--text-secondary);">${i18n[currentLang].sr_loading}</p>
    </div>`;
}

async function initSeasonReview() {
    const body = document.getElementById('seasonReviewBody');
    if (!body || srState.ready || srState.loading) return;
    srState.loading = true;
    body.innerHTML = srLoadingHtml();
    const ok = await srLoadData();
    srState.loading = false;
    if (!ok) { showRankingLoadFail('seasonReviewBody'); return; }
    srState.ready = true;

    // 初始赛季：URL ?season=<id|标签> 优先；否则当前赛季（超出最后赛季时与引擎口径一致回退最后一个赛季）
    const today = getTodayStr();
    let si = -1;
    const want = new URLSearchParams(window.location.search).get('season');
    const srInit = () => {
        const sel = document.getElementById('srSeasonSelect');
        // 快照当前赛季清单（WTT 模式下 change 触发时 swap 已恢复，不能再引用 seasonsData）
        const seasonIds = seasonsData.map(s => String(s.id || ''));
        if (sel) {
            sel.innerHTML = seasonsData.map((s, i) => `<option value="${i}">${escapeHtml(String(s.label || s.id || i))}</option>`).join('');
            sel.addEventListener('change', () => {
                srRenderInContext(parseInt(sel.value, 10));
                // 深链同步：?season=<id> 可直接分享某个赛季的总结
                const cur = seasonIds[parseInt(sel.value, 10)];
                if (cur) {
                    try { history.replaceState(null, '', '?season=' + encodeURIComponent(cur) + window.location.hash); } catch (e) {}
                }
            });
        }
        if (want) {
            si = seasonsData.findIndex(s => s.id === want || String(s.label) === want);
            if (si < 0) si = seasonsData.findIndex(s => (s.id || '').startsWith(want));
        }
        if (si < 0) si = seasonsData.findIndex(s => today >= s.startDate && today <= s.endDate);
        if (si < 0) si = seasonsData.length - 1;
        if (sel) sel.value = String(si);
    };
    if (SR_WTT && typeof wttWithDataContext === 'function') { wttWithDataContext(srInit); }
    else { srInit(); }
    srRenderInContext(si);
}

/* 语言切换整体重渲染（setLanguage 探测 seasonReviewReapplyI18n） */
function seasonReviewReapplyI18n() {
    if (!srState.ready || srState.seasonIndex < 0) return;
    srRenderInContext(srState.seasonIndex);
}

/* ---- 小工具 ---- */
function srDeltaText(v) { return (v > 0 ? '+' : '') + v.toFixed(1); }
function srDeltaCell(v) { const c = v > 0 ? 'sr-delta-pos' : (v < 0 ? 'sr-delta-neg' : ''); return `<td class="${c}">${srDeltaText(v)}</td>`; }
function srRankDeltaHtml(d) { if (d > 0) return `<span class="rank-change rank-up">▲${d}</span>`; if (d < 0) return `<span class="rank-change rank-down">▼${Math.abs(d)}</span>`; return '<span class="rank-same">-</span>'; }
function srTableHtml(headers, rowsHtml, maxHeight) {
    return `<div class="score-detail-table-wrapper sr-scroll" style="max-height:${maxHeight || 360}px;"><table class="score-detail-table"><thead><tr>${headers.map(h => `<th>${h}</th>`).join('')}</tr></thead><tbody>${rowsHtml}</tbody></table></div>`;
}

/* ---- 连胜/出勤：当季窗口内逐场统计（同日多场为正常录入，按文件顺序计） ---- */
function srComputeStreaks(windowMatches) {
    const per = {};
    const rec = name => { if (!per[name]) per[name] = { seq: [], wins: 0, losses: 0 }; return per[name]; };
    windowMatches.forEach(r => {
        const w = rec(r['胜者']), l = rec(r['负者']);
        w.seq.push(true); w.wins++;
        l.seq.push(false); l.losses++;
    });
    const out = {};
    for (const name in per) {
        let max = 0, cur = 0;
        per[name].seq.forEach(win => { cur = win ? cur + 1 : 0; if (cur > max) max = cur; });
        let tail = 0;
        for (let i = per[name].seq.length - 1; i >= 0 && per[name].seq[i]; i--) tail++;
        out[name] = { max, tail, wins: per[name].wins, losses: per[name].losses };
    }
    return out;
}

/* ---- 局分亮点（依赖记录携带「局分」，胜者视角逐局） ---- */
function srComputeGameStats(windowMatches) {
    const defaultFormats = (eventCoefficients && typeof eventCoefficients['默认赛制'] === 'object' && eventCoefficients['默认赛制']) || {};
    const games = windowMatches.filter(r => Array.isArray(r['局分']) && r['局分'].length);
    let deciding = 0, comeback = 0, maxMargin = 0, maxMarginGame = '';
    games.forEach(r => {
        const fmtRaw = r['赛制'] && r['赛制'] !== 'default' ? r['赛制'] : (defaultFormats[r['类型']] || '');
        const needed = SR_WINS_NEEDED[String(fmtRaw).toLowerCase()];
        const parsed = [];
        for (const g of r['局分']) {
            const m = SR_GAME_SCORE_RE.exec(String(g).trim());
            if (m && m[1] !== m[2]) parsed.push([+m[1], +m[2]]);
        }
        if (needed && parsed.length === needed * 2 - 1) deciding++;
        let w = 0, l = 0, trail2 = false;
        for (const [a, b] of parsed) { if (a > b) w++; else l++; if (l - w >= 2) { trail2 = true; break; } }
        if (trail2) comeback++;
        for (const [a, b] of parsed) { const mg = Math.abs(a - b); if (mg > maxMargin) { maxMargin = mg; maxMarginGame = `${a}-${b}`; } }
    });
    return { games, deciding, comeback, maxMargin, maxMarginGame };
}

/* ---- 单遍重放：单场原始得分之最 + 加分调整前后积分（口径同 ranking.js renderScoreDetail） ---- */
function srReplaySeason(si, end, sortedWindow) {
    const prevBatches = playerTypeBatches;
    if (SCORE_TIME_DECAY_ENABLED !== false) playerTypeBatches = buildPlayerTypeBatches(sortedWindow);
    const scores = { ...getSeasonStartScores(si) };
    let best = null;
    const bonusRows = [];
    for (const r of sortedWindow) {
        if (isBonusRecord(r)) {
            const t = r['对象'], b = parseFloat(r['分数']) || 0;
            if (!scores[t]) scores[t] = DEFAULT_INITIAL_SCORE;
            bonusRows.push({ date: r['日期'], target: t, amount: b, pre: scores[t] });
            scores[t] = Math.max(SCORE_FLOOR, scores[t] + b);
        } else if (isMatchRecord(r)) {
            const w = r['胜者'], l = r['负者'];
            if (!scores[w]) scores[w] = DEFAULT_INITIAL_SCORE;
            if (!scores[l]) scores[l] = DEFAULT_INITIAL_SCORE;
            const rawGain = calcRawPoints(w, l, r['类型'], scores, r['赛制']);
            if (!best || rawGain > best.rawGain) best = { rawGain, w, l, type: r['类型'], date: r['日期'], gap: Math.round(Math.abs(scores[w] - scores[l])) };
            const wg = calcMatchPoints(w, l, r['类型'], r['日期'], end, scores, r['赛制']);
            scores[w] = Math.max(SCORE_FLOOR, scores[w] + wg);
            scores[l] = Math.max(SCORE_FLOOR, scores[l] - wg * LOSER_POINT_MULTIPLIER);
        }
    }
    playerTypeBatches = prevBatches;
    return { best, bonusRows };
}

function destroySrChart() {
    const canvas = document.getElementById('srDeltaChart');
    if (canvas && window.Chart && Chart.getChart) { const c = Chart.getChart(canvas); if (c) c.destroy(); }
    srChart = null;
}

function renderSrDeltaChart(deltaRows) {
    const canvas = document.getElementById('srDeltaChart');
    if (!canvas || typeof Chart === 'undefined' || !deltaRows.length) return;
    destroySrChart();
    // 取绝对值变化最大的 10 人，升序排布使涨幅最大者居顶
    const top = [...deltaRows].sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta)).slice(0, 10).sort((a, b) => a.delta - b.delta);
    srChart = new Chart(canvas, {
        type: 'bar',
        data: {
            labels: top.map(r => r.name),
            datasets: [{
                data: top.map(r => r.delta),
                backgroundColor: top.map(r => r.delta >= 0 ? 'rgba(34,197,94,.55)' : 'rgba(239,68,68,.55)'),
                borderColor: top.map(r => r.delta >= 0 ? 'rgba(22,163,74,1)' : 'rgba(220,38,38,1)'),
                borderWidth: 1, borderRadius: 6
            }]
        },
        options: {
            indexAxis: 'y', responsive: true, maintainAspectRatio: false,
            plugins: { legend: { display: false }, tooltip: { callbacks: { label: ctx => ' ' + srDeltaText(ctx.parsed.x) } } },
            scales: { x: { grid: { color: 'rgba(128,128,128,.15)' } }, y: { grid: { display: false } } }
        }
    });
}

function renderSeasonReview(si) {
    const body = document.getElementById('seasonReviewBody');
    const season = seasonsData[si];
    if (!body || !season) return;
    srState.seasonIndex = si;
    const L = i18n[currentLang];
    document.title = SR_WTT ? L.wtt_sr_page_title : L.sr_page_title;

    const today = getTodayStr();
    const end = today < season.startDate ? season.startDate : (today < season.endDate ? today : season.endDate);
    const ongoing = today >= season.startDate && today <= season.endDate;

    const metaEl = document.getElementById('srSeasonMeta');
    if (metaEl) metaEl.innerHTML = `${escapeHtml(season.startDate)} ~ ${escapeHtml(season.endDate)}${ongoing ? ` <span class="sr-ongoing-badge"><i class="fa-solid fa-circle-play"></i>${L.sr_ongoing_badge}</span>` : ''}`;

    const windowMatches = scoreLogData.filter(r => isMatchRecord(r) && r['日期'] >= season.startDate && r['日期'] <= end);
    const windowBonus = scoreLogData.filter(r => isBonusRecord(r) && r['日期'] >= season.startDate && r['日期'] <= end);

    if (!windowMatches.length && !windowBonus.length) {
        destroySrChart();
        body.innerHTML = `<div class="compare-placeholder glass-card"><i class="fa-solid fa-table-tennis-paddle-ball"></i><p>${L.sr_no_data}</p></div>`;
        return;
    }

    const sortedWindow = [...windowMatches, ...windowBonus].sort((a, b) => a['日期'].localeCompare(b['日期']));

    // KPI：参与人数口径与引擎一致（getActivePlayers）
    const players = getActivePlayers(sortedWindow, season.startDate, end);
    const typeCount = {};
    windowMatches.forEach(r => { typeCount[r['类型']] = (typeCount[r['类型']] || 0) + 1; });

    // 时间线节点：本季初始节点 vs 末节点（进行中赛季末节点为实时积分）
    const seasonNodes = srTimeline().filter(n => n.season === season.label);
    const initialNode = seasonNodes.find(n => n.isInitial) || seasonNodes[0];
    const endNode = seasonNodes[seasonNodes.length - 1];

    // 积分变化：以末节点行集合为准（初节点含全员、快照/实时节点仅含当季活跃球员）
    let deltaRows = [];
    if (initialNode && endNode && endNode !== initialNode) {
        const startMap = {}, startRank = {};
        initialNode.data.forEach((p, i) => { startMap[p['姓名']] = p['当前积分']; startRank[p['姓名']] = i + 1; });
        deltaRows = endNode.data.map((p, i) => ({
            name: p['姓名'],
            endPts: p['当前积分'] || 0,
            delta: startMap[p['姓名']] != null ? Math.round(((p['当前积分'] || 0) - startMap[p['姓名']]) * 10) / 10 : 0,
            rankDelta: startRank[p['姓名']] != null ? startRank[p['姓名']] - (i + 1) : 0
        }));
        deltaRows.sort((a, b) => b.delta - a.delta);
    }

    const streaks = srComputeStreaks(windowMatches);
    const bestBonus = srReplaySeason(si, end, sortedWindow);
    const gameStats = srComputeGameStats(windowMatches);

    /* --- 积分变化榜 --- */
    let pointsHtml = '';
    if (deltaRows.length) {
        const rowsHtml = deltaRows.map(r => `<tr><td>${srPlayerLink(r.name)}</td><td>${r.endPts.toFixed(1)}</td>${srDeltaCell(r.delta)}<td>${srRankDeltaHtml(r.rankDelta)}</td></tr>`).join('');
        pointsHtml = `
            <div class="personal-card glass-card sr-card">
                <div class="sr-card-header"><i class="fa-solid fa-chart-line"></i><h3>${L.sr_points_title}</h3></div>
                <p class="sr-card-desc">${L.sr_points_desc}${endNode.isRealtime ? ` · ${L.sr_realtime_note}` : ''}</p>
                ${srTableHtml([L.rank_col_name || '姓名', L.sr_col_end_points, L.sr_col_delta, L.sr_col_rank_delta], rowsHtml)}
                <div class="sr-chart-box"><canvas id="srDeltaChart" aria-label="${L.sr_points_title}"></canvas></div>
            </div>`;
    }

    /* --- 连胜榜 / 出勤榜 --- */
    const streakEntries = Object.entries(streaks).sort((a, b) => b[1].max - a[1].max || b[1].wins - a[1].wins);
    const streakHtml = `
        <div class="personal-card glass-card sr-card">
            <div class="sr-card-header"><i class="fa-solid fa-fire"></i><h3>${L.sr_streak_title}</h3></div>
            ${srTableHtml([L.rank_col_name || '姓名', L.sr_col_max_streak, L.sr_col_record, L.sr_col_cur],
                streakEntries.map(([name, s]) => `<tr><td>${srPlayerLink(name)}</td><td class="sr-delta-pos">${s.max}</td><td>${s.wins}-${s.losses}</td><td>${s.tail > 0 ? L.sr_cur_streak.replace('{n}', s.tail) : L.sr_cur_loss}</td></tr>`).join(''))}
        </div>`;
    const attendEntries = Object.entries(streaks).sort((a, b) => (b[1].wins + b[1].losses) - (a[1].wins + a[1].losses));
    const attendHtml = `
        <div class="personal-card glass-card sr-card">
            <div class="sr-card-header"><i class="fa-solid fa-user-check"></i><h3>${L.sr_attend_title}</h3></div>
            ${srTableHtml([L.rank_col_name || '姓名', L.sr_col_matches, L.sr_col_wins, L.sr_col_losses, L.sr_col_winrate],
                attendEntries.map(([name, s]) => { const total = s.wins + s.losses; return `<tr><td>${srPlayerLink(name)}</td><td>${total}</td><td class="sr-delta-pos">${s.wins}</td><td class="sr-delta-neg">${s.losses}</td><td>${Math.round(s.wins / total * 100)}%</td></tr>`; }).join(''))}
        </div>`;

    /* --- 单场得分之最 --- */
    let bestHtml = '';
    if (bestBonus.best) {
        const b = bestBonus.best;
        bestHtml = `
            <div class="personal-card glass-card sr-card">
                <div class="sr-card-header"><i class="fa-solid fa-trophy"></i><h3>${L.sr_best_title}</h3></div>
                <p class="sr-card-desc">${L.sr_best_desc}</p>
                <div class="sr-best-line">
                    <span class="sr-best-score">+${b.rawGain.toFixed(1)}</span>
                    <span>${srPlayerLink(b.w)} <i class="fa-solid fa-arrow-right-long" style="color:var(--text-tertiary);"></i> ${srPlayerLink(b.l)}</span>
                    <span class="sr-best-meta">${escapeHtml(b.date)} · ${escapeHtml(b.type)} · ${L.sr_best_gap} ${b.gap}</span>
                </div>
            </div>`;
    }

    /* --- 局分亮点 --- */
    let gamesHtml = '';
    if (gameStats.games.length) {
        const listHtml = [...gameStats.games].reverse().map(r => `<tr><td>${escapeHtml(r['日期'])}</td><td>${escapeHtml(r['类型'])}</td><td>${srPlayerLink(r['胜者'])} ${i18n[currentLang].score_result_win} ${srPlayerLink(r['负者'])}</td><td>${r['比分'] ? escapeHtml(r['比分']) : '-'}</td><td title="${L.sb_games_label}：${escapeHtml(r['局分'].join(' '))}">${escapeHtml(r['局分'].join(' '))}</td></tr>`).join('');
        gamesHtml = `
            <div class="personal-card glass-card sr-card">
                <div class="sr-card-header"><i class="fa-solid fa-table-cells-large"></i><h3>${L.sr_games_title}</h3></div>
                <div class="sr-games-stats">
                    <div class="sr-game-stat"><b>${gameStats.games.length}</b><span>${L.sr_games_count}</span></div>
                    <div class="sr-game-stat"><b>${gameStats.deciding}</b><span>${L.sr_deciding}</span></div>
                    <div class="sr-game-stat"><b>${gameStats.comeback}</b><span>${L.sr_comeback}</span></div>
                    <div class="sr-game-stat"><b>${gameStats.maxMargin || '-'}</b><span>${L.sr_max_margin}${gameStats.maxMarginGame ? ' (' + gameStats.maxMarginGame + ')' : ''}</span></div>
                </div>
                ${srTableHtml([L.score_col_date, L.score_col_type, L.rank_col_name, L.score_col_score, L.sb_games_label], listHtml)}
            </div>`;
    } else {
        gamesHtml = `
            <div class="personal-card glass-card sr-card">
                <div class="sr-card-header"><i class="fa-solid fa-table-cells-large"></i><h3>${L.sr_games_title}</h3></div>
                <div class="sr-placeholder">${L.sr_games_none}</div>
            </div>`;
    }

    /* --- 积分调整审计（俱乐部治理专属，WTT 模式不渲染） --- */
    let bonusHtml = '';
    if (SR_WTT) {
        bonusHtml = '';
    } else if (bestBonus.bonusRows.length) {
        const rows = [...bestBonus.bonusRows].reverse();
        const net = Math.round(rows.reduce((s, r) => s + r.amount, 0) * 10) / 10;
        const targets = [...new Set(rows.map(r => r.target))];
        const perPlayer = {};
        rows.forEach(r => { perPlayer[r.target] = Math.round(((perPlayer[r.target] || 0) + r.amount) * 10) / 10; });
        const rowsHtml = rows.map(r => {
            const amt = r.amount >= 0 ? 'sr-delta-pos' : 'sr-delta-neg';
            const sign = r.amount >= 0 ? '+' : '';
            return `<tr><td>${escapeHtml(r.date)}</td><td>${srPlayerLink(r.target)}</td><td class="${amt}">${sign}${r.amount.toFixed(1)}</td><td>${r.pre.toFixed(1)}</td></tr>`;
        }).join('');
        const summaryChips = Object.entries(perPlayer).sort((a, b) => b[1] - a[1]).map(([name, v]) => `<span class="sr-type-badge">${srPlayerLink(name)} <strong class="${v >= 0 ? 'sr-delta-pos' : 'sr-delta-neg'}">${srDeltaText(v)}</strong></span>`).join('');
        bonusHtml = `
            <div class="personal-card glass-card sr-card">
                <div class="sr-card-header"><i class="fa-solid fa-scale-balanced"></i><h3>${L.sr_bonus_title}</h3></div>
                <p class="sr-card-desc">${L.sr_bonus_desc}</p>
                <p class="sr-bonus-summary">${L.sr_bonus_summary.replace('{n}', rows.length).replace('{net}', srDeltaText(net)).replace('{m}', targets.length)}</p>
                ${srTableHtml([L.score_col_date, L.sr_col_target, L.sr_col_amount, L.sr_col_pre], rowsHtml + `<tr class="sr-bonus-total"><td>${L.sr_bonus_total}</td><td>${targets.length} ${L.sr_kpi_players}</td><td class="${net >= 0 ? 'sr-delta-pos' : 'sr-delta-neg'}">${srDeltaText(net)}</td><td>-</td></tr>`)}
                <div class="sr-types" style="margin:12px 0 0;">${summaryChips}</div>
            </div>`;
    } else {
        bonusHtml = `
            <div class="personal-card glass-card sr-card">
                <div class="sr-card-header"><i class="fa-solid fa-scale-balanced"></i><h3>${L.sr_bonus_title}</h3></div>
                <div class="sr-placeholder">${L.sr_bonus_none}</div>
            </div>`;
    }

    // KPI 第 3/4 项按模式区分：club=积分调整/赛事类型；wtt=赛事数/月度快照
    const kpiBonus = SR_WTT
        ? `<div class="sr-kpi glass-card"><i class="fa-solid fa-trophy"></i><div><div class="sr-kpi-value">${Object.keys(typeCount).length}</div><div class="sr-kpi-label">${L.sr_kpi_events}</div></div></div>`
        : `<div class="sr-kpi glass-card"><i class="fa-solid fa-plus-minus"></i><div><div class="sr-kpi-value">${windowBonus.length}</div><div class="sr-kpi-label">${L.sr_kpi_bonus}</div></div></div>`;
    const kpiTypes = SR_WTT
        ? `<div class="sr-kpi glass-card"><i class="fa-solid fa-shapes"></i><div><div class="sr-kpi-value">${Math.max(0, seasonNodes.filter(n => !n.isInitial).length)}</div><div class="sr-kpi-label">${L.sr_kpi_snapshots}</div></div></div>`
        : `<div class="sr-kpi glass-card"><i class="fa-solid fa-shapes"></i><div><div class="sr-kpi-value">${Object.keys(typeCount).length}</div><div class="sr-kpi-label">${L.sr_kpi_types}</div></div></div>`;

    body.innerHTML = `
        <div id="srReport">
            <div class="sr-kpi-row">
                <div class="sr-kpi glass-card"><i class="fa-solid fa-table-tennis-paddle-ball"></i><div><div class="sr-kpi-value">${windowMatches.length}</div><div class="sr-kpi-label">${L.sr_kpi_matches}</div></div></div>
                <div class="sr-kpi glass-card"><i class="fa-solid fa-users"></i><div><div class="sr-kpi-value">${players.size}</div><div class="sr-kpi-label">${L.sr_kpi_players}</div></div></div>
                ${kpiBonus}
                ${kpiTypes}
            </div>
            ${Object.keys(typeCount).length ? `<div class="sr-types">${Object.entries(typeCount).sort((a, b) => b[1] - a[1]).map(([t, n]) => `<span class="sr-type-badge">${escapeHtml(t)} <strong>×${n}</strong></span>`).join('')}</div>` : ''}
            ${pointsHtml}
            <div class="sr-grid-2">${streakHtml}${attendHtml}</div>
            ${bestHtml}
            ${gamesHtml}
            ${bonusHtml}
        </div>`;

    renderSrDeltaChart(deltaRows);
}
