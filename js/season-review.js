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
/* 展示名：club 模式切英文时用 players.json 拼音；WTT 球员不在此档案体系，保持原名 */
function srPlayerDisplayName(name) { return SR_WTT ? name : playerDisplayName(name); }

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
        else if (!needed && parsed.length) {
            // 无赛制信息（WTT 记录无赛制字段、类型无默认赛制映射）：
            // 回退为「胜方恰多赢一局」判定打满，bo3/bo5/bo7 均成立
            let gw = 0, gl = 0;
            for (const [a, b] of parsed) { if (a > b) gw++; else gl++; }
            if (gw === gl + 1) deciding++;
        }
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
            const { wGain: wg, lLoss: wl } = calcMatchPointsDual(w, l, r['类型'], r['日期'], end, scores, r['赛制']);
            scores[w] = Math.max(SCORE_FLOOR, scores[w] + wg);
            scores[l] = Math.max(SCORE_FLOOR, scores[l] - wl);
        }
    }
    playerTypeBatches = prevBatches;
    return { best, bonusRows };
}

/* ---- 按日积分走势：逐比赛日取「截至当日的实时口径」积分作折线。
   俱乐部模式逐日重放（复用 replaySeasonWindowToSnapshot，衰减/定格随当日窗口）；
   WTT/非衰减模式权重恒 1，单趟增量重放（与引擎 incremental 快照路径同口径）。
   结果矩阵在渲染期（WTT 数据上下文内）一次算好，选人交互只读、不再触碰引擎全局。 ---- */
const SR_DAILY_COLORS = ['#4da3ff', '#ff6b6b', '#52c41a', '#f5c542', '#ff9f43', '#a55eea', '#26de81', '#fd79a8', '#45b7d1', '#f78fb3'];
const SR_DAILY_MAX = 10;
let srDailyData = null;
let srDailySelected = null;   // 姓名数组；换赛季重置，语言切换保留
let srDailySeasonKey = '';
let srDailyHintTimer = null;
let srDailyChartInstance = null;

function srComputeDailySeries(si, season, end, sortedWindow) {
    if (!sortedWindow.length) return null;
    const startScores = getSeasonStartScores(si);
    const baseline = {};
    for (const n in startScores) baseline[n] = Math.round(startScores[n] * 10) / 10;
    const baseOf = n => (baseline[n] != null ? baseline[n] : DEFAULT_INITIAL_SCORE);

    const dates = [...new Set(sortedWindow.map(r => r['日期']))].sort();
    const labels = [i18n[currentLang].sr_daily_start, ...dates];
    const activeNames = [...getActivePlayers(sortedWindow, season.startDate, end)];
    if (!activeNames.length) return null;
    const series = {};
    // 序列长度与 labels 对齐：第 0 位是「赛季初」锚点（赛季初即有积分者取其起始分，中途加入者为 null）
    activeNames.forEach(n => {
        series[n] = new Array(labels.length).fill(null);
        if (baseline[n] != null) series[n][0] = baseline[n];
    });
    const fill = (name, k, score) => { series[name][k + 1] = Math.round(score * 10) / 10; };

    if (SCORE_TIME_DECAY_ENABLED === false) {
        const sc = { ...startScores }, seen = new Set();
        let k = 0;
        const capture = () => { for (const n of seen) fill(n, k, sc[n]); };
        for (const r of sortedWindow) {
            while (k < dates.length && dates[k] < r['日期']) { capture(); k++; }
            if (isMatchRecord(r)) {
                const w = r['胜者'], l = r['负者'];
                if (sc[w] == null) sc[w] = DEFAULT_INITIAL_SCORE;
                if (sc[l] == null) sc[l] = DEFAULT_INITIAL_SCORE;
                const { wGain: wg, lLoss: wl } = calcMatchPointsDual(w, l, r['类型'], r['日期'], r['日期'], sc, r['赛制']);
                sc[w] = Math.max(SCORE_FLOOR, sc[w] + wg);
                sc[l] = Math.max(SCORE_FLOOR, sc[l] - wl);
                seen.add(w); seen.add(l);
            } else if (isBonusRecord(r)) {
                const t = r['对象'], b = parseFloat(r['分数']) || 0;
                if (sc[t] == null) sc[t] = DEFAULT_INITIAL_SCORE;
                sc[t] = Math.max(SCORE_FLOOR, sc[t] + b);
                seen.add(t);
            }
        }
        while (k < dates.length) { capture(); k++; }
    } else {
        const prevBatches = playerTypeBatches;
        for (let k = 0; k < dates.length; k++) {
            const rows = replaySeasonWindowToSnapshot(sortedWindow, startScores, season, dates[k], {});
            const rowMap = {};
            for (const p of rows) rowMap[p['姓名']] = p['当前积分'];
            for (const n of activeNames) if (rowMap[n] != null) fill(n, k, rowMap[n]);
        }
        playerTypeBatches = prevBatches;
    }

    // 排序：期末相对赛季初的 |Δ| 降序（默认勾选与选人列表顺序都依赖它）
    const finalDelta = n => { const a = series[n]; for (let i = a.length - 1; i >= 0; i--) if (a[i] != null) return Math.round((a[i] - baseOf(n)) * 10) / 10; return 0; };
    const order = activeNames.sort((a, b) => Math.abs(finalDelta(b)) - Math.abs(finalDelta(a)) || finalDelta(b) - finalDelta(a) || String(a).localeCompare(String(b), 'zh'));
    return { labels, series, order, finalDelta };
}

function srBuildDailyCardHtml(data) {
    if (!data || typeof Chart === 'undefined' || !data.order.length) return '';
    const L = i18n[currentLang];
    const chips = data.order.map(n => `<button type="button" class="sr-chip" data-name="${escapeHtml(n)}" aria-pressed="false"><span class="sr-chip-dot"></span>${escapeHtml(srPlayerDisplayName(n))}</button>`).join('');
    return `
        <div class="personal-card glass-card sr-card">
            <div class="sr-card-header"><i class="fa-solid fa-chart-line"></i><h3>${L.sr_daily_title}</h3><span class="sr-daily-count" id="srDailyCount"></span></div>
            <p class="sr-card-desc">${L.sr_daily_desc}</p>
            <div class="sr-daily-toolbar">
                ${data.order.length > 20 ? `<input type="text" id="srDailySearch" class="sr-daily-search" placeholder="${L.sr_daily_search}" autocomplete="off">` : ''}
                <button type="button" id="srDailyClear" class="sr-daily-clear">${L.sr_daily_clear}</button>
            </div>
            <div class="sr-daily-chips" id="srDailyChips">${chips}</div>
            <p class="sr-daily-hint" id="srDailyHint" hidden>${L.sr_daily_max}</p>
            <div class="sr-placeholder" id="srDailyEmpty" hidden>${L.sr_daily_empty}</div>
            <div class="sr-chart-box" id="srDailyChartBox"><canvas id="srDailyChart" aria-label="${L.sr_daily_title}"></canvas></div>
        </div>`;
}

function srShowDailyHint() {
    const el = document.getElementById('srDailyHint');
    if (!el) return;
    el.hidden = false;
    clearTimeout(srDailyHintTimer);
    srDailyHintTimer = setTimeout(() => { el.hidden = true; }, 2200);
}

function srToggleDailyPlayer(name) {
    if (!srDailyData || !name) return;
    if (!Array.isArray(srDailySelected)) srDailySelected = [];
    const i = srDailySelected.indexOf(name);
    if (i >= 0) srDailySelected.splice(i, 1);
    else {
        if (srDailySelected.length >= SR_DAILY_MAX) { srShowDailyHint(); return; }
        srDailySelected.push(name);
    }
    srUpdateDailyUI();
}

function srUpdateDailyUI() {
    if (!srDailyData) return;
    const chipsEl = document.getElementById('srDailyChips');
    if (!chipsEl) return;
    const sel = Array.isArray(srDailySelected) ? srDailySelected : [];
    const selSet = new Set(sel);
    // chip 选中态与配色跟随曲线颜色，方便与图例对照
    chipsEl.querySelectorAll('.sr-chip').forEach(btn => {
        const name = btn.dataset.name, on = selSet.has(name);
        btn.setAttribute('aria-pressed', on ? 'true' : 'false');
        const dot = btn.querySelector('.sr-chip-dot');
        if (on) {
            const c = SR_DAILY_COLORS[sel.indexOf(name) % SR_DAILY_COLORS.length];
            if (dot) dot.style.background = c;
            btn.style.borderColor = c;
            btn.style.background = c + '1a';
        } else {
            if (dot) dot.style.background = '';
            btn.style.borderColor = '';
            btn.style.background = '';
        }
    });
    const countEl = document.getElementById('srDailyCount');
    if (countEl) countEl.textContent = `${sel.length}/${SR_DAILY_MAX}`;
    const emptyEl = document.getElementById('srDailyEmpty');
    const box = document.getElementById('srDailyChartBox');
    if (emptyEl && box) { emptyEl.hidden = sel.length > 0; box.style.display = sel.length > 0 ? '' : 'none'; }
    srRenderDailyChart();
}

function srRenderDailyChart() {
    const canvas = document.getElementById('srDailyChart');
    if (!canvas || typeof Chart === 'undefined' || !srDailyData) return;
    if (srDailyChartInstance) { try { srDailyChartInstance.destroy(); } catch (e) {} srDailyChartInstance = null; }
    if (window.Chart && Chart.getChart) { const c = Chart.getChart(canvas); if (c) c.destroy(); }
    const sel = Array.isArray(srDailySelected) ? srDailySelected : [];
    if (!sel.length) return;
    const L = i18n[currentLang];
    const datasets = sel.map((name, idx) => {
        const c = SR_DAILY_COLORS[idx % SR_DAILY_COLORS.length];
        return {
            label: srPlayerDisplayName(name),
            data: srDailyData.series[name] || [],
            borderColor: c, backgroundColor: c + '20',
            borderWidth: 2, pointRadius: 0, pointHoverRadius: 4,
            tension: 0, spanGaps: true, fill: false
        };
    });
    new Chart(canvas, {
        type: 'line',
        data: { labels: srDailyData.labels, datasets },
        options: {
            responsive: true, maintainAspectRatio: false,
            interaction: { intersect: false, mode: 'index' },
            plugins: {
                legend: { position: 'bottom', labels: { usePointStyle: true, boxWidth: 8, padding: 12, font: { size: 11 } } },
                tooltip: {
                    filter: item => item.raw != null,
                    callbacks: {
                        label: ctx => (ctx.parsed.y == null) ? null : ` ${ctx.dataset.label}: ${ctx.parsed.y.toFixed(1)}`
                    }
                }
            },
            scales: {
                x: { grid: { color: 'rgba(128,128,128,.1)' }, ticks: { maxRotation: 45, autoSkip: true, maxTicksLimit: 12, font: { size: 10 } } },
                y: {
                    beginAtZero: false,
                    grid: { color: 'rgba(128,128,128,.1)' },
                    ticks: { font: { size: 10 }, callback: v => Math.round(v) },
                    title: { display: true, text: L.sr_daily_axis, font: { size: 11 } }
                }
            }
        }
    });
    srDailyChartInstance = Chart.getChart(canvas);
}

function srInitDailyUI(data) {
    srDailyData = data;
    const chipsEl = document.getElementById('srDailyChips');
    if (!chipsEl || !data) return;
    if (!Array.isArray(srDailySelected) || !srDailySelected.length) srDailySelected = data.order.slice(0, 5);
    srDailySelected = srDailySelected.filter(n => data.series[n]);
    if (!srDailySelected.length) srDailySelected = data.order.slice(0, Math.min(5, data.order.length));
    chipsEl.addEventListener('click', e => {
        const btn = e.target.closest('.sr-chip');
        if (btn) srToggleDailyPlayer(btn.dataset.name);
    });
    const searchEl = document.getElementById('srDailySearch');
    if (searchEl) searchEl.addEventListener('input', () => {
        const q = searchEl.value.trim().toLowerCase();
        chipsEl.querySelectorAll('.sr-chip').forEach(btn => {
            const hit = btn.dataset.name.toLowerCase().includes(q) || srPlayerDisplayName(btn.dataset.name).toLowerCase().includes(q);
            btn.style.display = (!q || hit) ? '' : 'none';
        });
    });
    const clearEl = document.getElementById('srDailyClear');
    if (clearEl) clearEl.addEventListener('click', () => { srDailySelected = []; srUpdateDailyUI(); });
    srUpdateDailyUI();
}

function destroySrChart() {
    /* srChart / srDailyChartInstance 持有实例引用：body.innerHTML 重建后旧 canvas 已脱离
       文档，按 id 反查会漏掉旧实例，这里先用引用销毁，再兜底反查当前文档里的画布 */
    if (srChart) { try { srChart.destroy(); } catch (e) {} srChart = null; }
    if (srDailyChartInstance) { try { srDailyChartInstance.destroy(); } catch (e) {} srDailyChartInstance = null; }
    const canvas = document.getElementById('srDeltaChart');
    if (canvas && window.Chart && Chart.getChart) { const c = Chart.getChart(canvas); if (c) c.destroy(); }
    const dailyCanvas = document.getElementById('srDailyChart');
    if (dailyCanvas && window.Chart && Chart.getChart) { const c = Chart.getChart(dailyCanvas); if (c) c.destroy(); }
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
            labels: top.map(r => srPlayerDisplayName(r.name)),
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
    // 按日图表的选人状态：换赛季重置，同赛季重渲染（如语言切换）保留
    const srSeasonKey = String(season.id || season.label || si);
    if (srDailySeasonKey !== srSeasonKey) { srDailySeasonKey = srSeasonKey; srDailySelected = null; }
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
        srDailyData = null;
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
    const srDaily = srComputeDailySeries(si, season, end, sortedWindow);

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
            ${srBuildDailyCardHtml(srDaily)}
            <div class="sr-grid-2">${streakHtml}${attendHtml}</div>
            ${bestHtml}
            ${gamesHtml}
            ${bonusHtml}
        </div>`;

    renderSrDeltaChart(deltaRows);
    srInitDailyUI(srDaily);
}
