/* ========================================
   capability-radar.js — 六维战力雷达（纯展示层，不参与积分计算）
   依赖（按加载顺序）: Chart.js / common.js / score-engine.js
   （WTT 页面另需 wtt_common.js；各函数在运行时按 typeof 探测，club 页缺 WTT 全局不报错）

   六轴（每轴 0–100，clamp 区间与缺省值见 CR_AXES）：
     ① 胜率统治力  全部正式对局（含双打、拆成员归属）胜率
     ② 高阶赛制力  只统计 bo5/bo7（club 读「赛制」字段，缺失按类型默认赛制；
                   WTT 无赛制字段，由「比分」首字符反推 3-x→bo5、4-x→bo7，截断样本）
     ③ 大赛含金量  club：四类大赛类型白名单；WTT：event-coefficient 系数 ≥ 1.2
     ④ 强敌对抗力  对手「该场开赛前回放积分」≥ 阈值（club 2000 / WTT 1800）的对局
                   club 赛前分 = buildPreMatchBasisTable（比赛当日口径，双打看对方成员）；
                   WTT 赛前分 = 单遍回放的双方 pre（双打分项看对方 pair 实体分）
     ⑤ 定格保值率（club）  r = min(1.10, 快照积分 ÷ 无衰减全额)，score = r×75 + min(25, 场次×0.4)
        巅峰保持率（WTT）   r = min(1.10, 当前分 ÷ 生涯峰值分)，公式骨架同上
        （WTT 关闭时间衰减 ⇒ 定格保值率恒 1，故替换为巅峰保持率）
     ⑥ 局分终结力  零封胜场（比分 3-0/2-0/4-0）/ 全部胜场 ×80 + min(25, 胜场×0.8)
   综合战力指数 = round(六维均值)，档位 S+ ≥80 / S 70-79 / A 60-69 / B <60
   口径全文见 docs/tech/capability-radar.md
   ======================================== */

const CR_CONFIG = {
    club: { elite: 2000, majorTypes: ['校乒赛单打', '校乒赛团体', '十二强赛', '校乒联赛'] },
    wtt: { elite: 1800, majorMinCoeff: 1.2 }
};
// 数据集配色（与 data-viz.js CHART_COLORS 前三色一致；本文件需独立于 data-viz 页可用）
const CR_DATASET_COLORS = ['#4da3ff', '#ff6b6b', '#52c41a'];
const CR_GRADE_COLORS = { 'S+': '#f5c542', 'S': '#a55eea', 'A': '#4da3ff', 'B': '#596275' };

function crClamp(v, lo, hi) { return Math.min(hi, Math.max(lo, v)); }
// 全轴放缩（2026-10-25 站长定稿）：公式原始分 [0,100] 线性映射到 [30,100]——0 分记 30，满分记 100
function crRescale(raw) { return crClamp(Math.round(30 + crClamp(raw, 0, 100) * 0.7), 30, 100); }
// 第⑤维（WTT 巅峰保持率）r 的放缩区间（站长定稿 2026-10-26）：r=0.80 记 30（低于亦记 30），r=1.00 记 100（高于亦记 100），
// 区间内按对数曲线 raw = 100 × ln(1 + (r−0.80)) ÷ ln(1 + 0.20)（与社团⑤天数的对数形式同构）
// 实测 ms 分项 r 分布：中位 0.951 / p25 0.972 / p90 0.893 / min 0.811（≥10 场的 987 人）——0.80 锚点下几乎无人托底
const CR_R_FLOOR = 0.80, CR_R_CAP = 1.00;
// 第⑤维（社团积极度）：对数放缩——参赛最多者记满分，其余按 log(1+天数)/log(1+最多天数) 比例，最低 30
let _crClubMaxDays = null;   // { log, asOf, value }
function crClubMaxMatchDays(asOf) {
    if (_crClubMaxDays && _crClubMaxDays.log === scoreLogData && _crClubMaxDays.asOf === asOf) return _crClubMaxDays.value;
    const daySets = new Map();
    for (const r of scoreLogData) {
        if (!isMatchRecord(r)) continue;
        if (asOf && r['日期'] > asOf) continue;
        const p = crRecordParticipants(r);
        for (const n of p.winners.concat(p.losers)) {
            let s = daySets.get(n);
            if (!s) { s = new Set(); daySets.set(n, s); }
            s.add(r['日期']);
        }
    }
    let max = 0;
    for (const s of daySets.values()) if (s.size > max) max = s.size;
    _crClubMaxDays = { log: scoreLogData, asOf: asOf, value: max };
    return max;
}
function crGradeOf(composite) { return composite >= 80 ? 'S+' : (composite >= 70 ? 'S' : (composite >= 60 ? 'A' : 'B')); }
function crComposite(axes) { return Math.round(axes.reduce((s, a) => s + a.score, 0) / axes.length); }

// 双打拆成员：{ winners: [成员], losers: [成员] }；单打原样单元素
function crRecordParticipants(r) {
    const split = (typeof splitPairNames === 'function') ? splitPairNames : null;
    const w = split ? split(r['胜者']) : null;
    const l = split ? split(r['负者']) : null;
    return { winners: w || [r['胜者']], losers: l || [r['负者']] };
}
// 赛制：显式字段优先，缺失回退 event-coefficient「默认赛制」映射
function crFormatOf(r) {
    let f = r['赛制'];
    if (!f || f === 'default') f = (typeof typeDefaultFormats !== 'undefined' && typeDefaultFormats) ? typeDefaultFormats[r['类型']] : null;
    return f ? String(f).trim().toLowerCase() : null;
}
function crIsSweepScore(r) { return /^[234]-0$/.test(String(r['比分'] || '').trim()); }
function crAlpha(hex, a) {
    const h = String(hex).replace('#', '');
    if (h.length !== 6) return hex;
    return 'rgba(' + parseInt(h.slice(0, 2), 16) + ',' + parseInt(h.slice(2, 4), 16) + ',' + parseInt(h.slice(4, 6), 16) + ',' + a + ')';
}

// ============ 社团（club）计算 ============

// 全量日志的单/双拆分（按 scoreLogData 引用缓存，保证引擎表缓存键稳定命中）
let _crClubSplit = null;   // { log, singles, doubles }
function crSplitClubLog() {
    if (typeof scoreLogData === 'undefined' || !Array.isArray(scoreLogData) || !scoreLogData.length) return { log: null, singles: [], doubles: [] };
    if (_crClubSplit && _crClubSplit.log === scoreLogData) return _crClubSplit;
    const hasDoubles = (typeof isDoublesRecord === 'function');
    const doubles = hasDoubles ? scoreLogData.filter(isDoublesRecord) : [];
    const singles = doubles.length ? scoreLogData.filter(r => !isDoublesRecord(r)) : scoreLogData;
    _crClubSplit = { log: scoreLogData, singles: singles, doubles: doubles };
    return _crClubSplit;
}

/**
 * 社团侧六维雷达。
 * @param {string} playerName 球员姓名（单打名，双打记录按成员归属）
 * @param {string} [asOfDate] 快照日 YYYY-MM-DD（默认今天）
 * @returns {{mode:'club', axes:Array, composite:number, grade:string}|null}
 */
function computeClubRadar(playerName, asOfDate) {
    if (typeof scoreLogData === 'undefined' || !scoreLogData || !scoreLogData.length) return null;
    const asOf = asOfDate || (typeof getTodayStr === 'function' ? getTodayStr() : '');
    const cfg = CR_CONFIG.club;

    // ①②③⑤⑥：全量记录扫描（含双打，pair 胜负拆记到两名成员）；⑤按参赛的比赛日数
    let tot = 0, win = 0, longTot = 0, longWin = 0, majorTot = 0, majorWin = 0, sweeps = 0, scoredWin = 0;
    const partDays = new Set();
    for (const r of scoreLogData) {
        if (!isMatchRecord(r)) continue;
        if (asOf && r['日期'] > asOf) continue;
        const p = crRecordParticipants(r);
        const inW = p.winners.indexOf(playerName) >= 0;
        const inL = p.losers.indexOf(playerName) >= 0;
        if (!inW && !inL) continue;
        tot++;
        partDays.add(r['日期']);
        if (inW) {
            win++;
            if (r['比分']) scoredWin++;          // ⑥分母：有比分的胜场（未录入比分的横扫不记证据）
            if (crIsSweepScore(r)) sweeps++;
        }
        const f = crFormatOf(r);
        if (f === 'bo5' || f === 'bo7') { longTot++; if (inW) longWin++; }
        if (cfg.majorTypes.indexOf(r['类型']) >= 0) { majorTot++; if (inW) majorWin++; }
    }

    // ④：引擎回放（单打上下文；强敌判定要扫全量记录，双打看对方成员）
    const split = crSplitClubLog();
    let eliteTot = 0, eliteWin = 0;
    if (typeof withScoreContext === 'function') {
        const fullLog = scoreLogData;
        withScoreContext(split.singles, undefined, () => {
            const preTable = (typeof buildPreMatchBasisTable === 'function') ? buildPreMatchBasisTable(split.singles, split.doubles) : null;
            if (preTable) {
                for (const r of fullLog) {
                    if (!isMatchRecord(r) || (asOf && r['日期'] > asOf)) continue;
                    const pp = crRecordParticipants(r);
                    const inW = pp.winners.indexOf(playerName) >= 0;
                    const inL = pp.losers.indexOf(playerName) >= 0;
                    if (!inW && !inL) continue;
                    const cap = preTable.get(r);
                    if (!cap) continue;
                    let oppElite = false;
                    if (cap.members) {          // 双打：对方任一成员的单打赛前分 ≥ 阈值
                        const oppSide = inW ? pp.losers : pp.winners;
                        oppElite = oppSide.some(n => typeof cap.members[n] === 'number' && cap.members[n] >= cfg.elite);
                    } else {
                        const oppPre = inW ? cap.lPre : cap.wPre;
                        oppElite = typeof oppPre === 'number' && oppPre >= cfg.elite;
                    }
                    if (oppElite) { eliteTot++; if (inW) eliteWin++; }
                }
            }
        });
    }

    const axes = [
        { key: 'win',    score: tot > 0 ? crRescale(win / tot * 100) : 30, n: tot, w: win, isDefault: tot === 0 },
        { key: 'format', score: longTot > 0 ? crRescale(longWin / longTot * 100) : 30, n: longTot, w: longWin, isDefault: longTot === 0 },
        { key: 'major',  score: majorTot > 0 ? crRescale(majorWin / majorTot * 100 + Math.min(20, majorTot * 2)) : 30, n: majorTot, w: majorWin, isDefault: majorTot === 0 },
        { key: 'elite',  score: eliteTot > 0 ? crRescale(eliteWin / eliteTot * 90 + Math.min(25, eliteWin * 3)) : 30, n: eliteTot, w: eliteWin, threshold: cfg.elite, isDefault: eliteTot === 0 },
        { key: 'retain', score: partDays.size > 0 ? crRescale(100 * Math.log(1 + partDays.size) / Math.log(1 + crClubMaxMatchDays(asOf))) : 30, n: partDays.size, isDefault: partDays.size === 0 },
        { key: 'close',  score: scoredWin > 0 ? crRescale(sweeps / scoredWin * 80 + Math.min(25, win * 0.8)) : 30, n: scoredWin, w: sweeps, isDefault: scoredWin === 0 }
    ];
    const composite = crComposite(axes);
    return { mode: 'club', axes: axes, composite: composite, grade: crGradeOf(composite) };
}

// ============ WTT 计算 ============

// 单遍回放聚合（按 wttScoreLogData 引用缓存；切换分项/重载数据自动失效）
let _crWttAgg = null;   // { log, result: { byName, finalMap } }
function crWttBuildRadarAggregates() {
    if (typeof wttWithDataContext !== 'function' || typeof wttScoreLogData === 'undefined' || !Array.isArray(wttScoreLogData) || !wttScoreLogData.length) return null;
    if (_crWttAgg && _crWttAgg.log === wttScoreLogData) return _crWttAgg.result;
    const th = CR_CONFIG.wtt.elite;
    const result = wttWithDataContext(function () {
        const sortedLog = getSortedScoreLog(wttScoreLogData);
        const seasons = (typeof wttSeasonsData !== 'undefined' && Array.isArray(wttSeasonsData) && wttSeasonsData.length) ? wttSeasonsData : [];
        const agg = {};
        const ensure = function (n) {
            if (!agg[n]) agg[n] = { tot: 0, win: 0, longTot: 0, longWin: 0, majorTot: 0, majorWin: 0, eliteTot: 0, eliteWin: 0, sweep: 0, scoredWin: 0, peak: -Infinity };
            return agg[n];
        };
        let si = -1, scores = null;
        const bump = function (n) { const a = ensure(n); const v = scores[n]; if (typeof v === 'number' && v > a.peak) a.peak = v; };
        for (const r of sortedLog) {
            const d = r['日期'];
            // 赛季指针（与 wtt_player.js#wttPpComputeMatchRecords 完全一致）
            if (si >= 0 && seasons.length && d > seasons[si].endDate) { si = -1; scores = null; }
            if (si < 0 && seasons.length && d >= seasons[0].startDate) {
                while (si + 1 < seasons.length && d > seasons[si + 1].endDate) si++;
                if (si + 1 < seasons.length && d >= seasons[si + 1].startDate) { si++; scores = Object.assign({}, getSeasonStartScores(si)); }
            }
            if (si < 0 || !scores) continue;
            if (isBonusRecord(r)) {
                const t = r['对象'], b = parseFloat(r['分数']) || 0;
                if (!scores[t]) scores[t] = DEFAULT_INITIAL_SCORE;
                scores[t] = Math.max(SCORE_FLOOR, scores[t] + b);
                bump(t);
                continue;
            }
            if (!isMatchRecord(r)) continue;
            const w = r['胜者'], l = r['负者'];
            if (!scores[w]) scores[w] = DEFAULT_INITIAL_SCORE;
            if (!scores[l]) scores[l] = DEFAULT_INITIAL_SCORE;
            bump(w); bump(l);                       // 赛前峰值（首场的初始/继承分）
            const wPre = scores[w], lPre = scores[l];
            const sc = r['比分'] ? String(r['比分']).trim() : '';
            const isLong = /^[34]-/.test(sc);       // 3-x→bo5、4-x→bo7（WTT 无赛制字段，由比分反推）
            const isSweep = /^[234]-0$/.test(sc);
            const isMajor = getEventCoefficient(r['类型']) >= CR_CONFIG.wtt.majorMinCoeff;
            const aw = ensure(w), al = ensure(l);
            aw.tot++; aw.win++;
            al.tot++;
            if (isLong) { aw.longTot++; aw.longWin++; al.longTot++; }
            if (isMajor) { aw.majorTot++; aw.majorWin++; al.majorTot++; }
            if (lPre >= th) { aw.eliteTot++; aw.eliteWin++; }   // 胜方打的是 1800+ 对手
            if (wPre >= th) { al.eliteTot++; }                  // 负方打的是 1800+ 对手（未赢）
            if (isSweep) aw.sweep++;
            if (sc) aw.scoredWin++;                 // ⑥分母：有比分的胜场
            const wg = calcMatchPoints(w, l, r['类型'], r['日期'], r['日期'], scores, r['赛制']);
            scores[w] = Math.max(SCORE_FLOOR, scores[w] + wg);
            scores[l] = Math.max(SCORE_FLOOR, scores[l] - wg * LOSER_POINT_MULTIPLIER);
            bump(w); bump(l);                       // 赛后峰值
        }
        return { byName: agg, finalMap: scores || {} };
    });
    _crWttAgg = { log: wttScoreLogData, result: result };
    return result;
}

/**
 * WTT 侧六维雷达（当前分项宇宙；双打分项的 subject 是 pair 实体名）。
 * 第⑤维为「巅峰保持率」= 当前分 ÷ 生涯峰值分（WTT 无衰减，定格保值率恒 1 无信息量）。
 * @param {string} subject 球员（或双打组合）名
 */
function computeWttRadar(subject) {
    const data = crWttBuildRadarAggregates();
    if (!data) return null;
    const a = data.byName[subject];
    const finalRaw = data.finalMap[subject];
    if (!a && typeof finalRaw !== 'number') return null;
    const agg = a || { tot: 0, win: 0, longTot: 0, longWin: 0, majorTot: 0, majorWin: 0, eliteTot: 0, eliteWin: 0, sweep: 0, scoredWin: 0, peak: -Infinity };
    const finalScore = (typeof finalRaw === 'number') ? finalRaw : (typeof DEFAULT_INITIAL_SCORE !== 'undefined' ? DEFAULT_INITIAL_SCORE : 1500);
    const peak = isFinite(agg.peak) ? Math.max(agg.peak, finalScore) : finalScore;
    const r5 = peak > 0 ? Math.min(1.10, finalScore / peak) : 1.00;
    const th = CR_CONFIG.wtt.elite;

    const axes = [
        { key: 'win',    score: agg.tot > 0 ? crRescale(agg.win / agg.tot * 100) : 30, n: agg.tot, w: agg.win, isDefault: agg.tot === 0 },
        { key: 'format', score: agg.longTot > 0 ? crRescale(agg.longWin / agg.longTot * 100) : 30, n: agg.longTot, w: agg.longWin, isDefault: agg.longTot === 0, censored: true },
        { key: 'major',  score: agg.majorTot > 0 ? crRescale(agg.majorWin / agg.majorTot * 100 + Math.min(20, agg.majorTot * 2)) : 30, n: agg.majorTot, w: agg.majorWin, isDefault: agg.majorTot === 0 },
        { key: 'elite',  score: agg.eliteTot > 0 ? crRescale(agg.eliteWin / agg.eliteTot * 90 + Math.min(25, agg.eliteWin * 3)) : 30, n: agg.eliteTot, w: agg.eliteWin, threshold: th, isDefault: agg.eliteTot === 0 },
        { key: 'retain', score: crRescale(100 * Math.log(1 + Math.max(r5, CR_R_FLOOR) - CR_R_FLOOR) / Math.log(1 + CR_R_CAP - CR_R_FLOOR)), n: agg.tot, ratio: r5 },
        { key: 'close',  score: agg.scoredWin > 0 ? crRescale(agg.sweep / agg.scoredWin * 80 + Math.min(25, agg.win * 0.8)) : 30, n: agg.scoredWin, w: agg.sweep, isDefault: agg.scoredWin === 0, censored: true }
    ];
    const composite = crComposite(axes);
    return { mode: 'wtt', axes: axes, composite: composite, grade: crGradeOf(composite) };
}

// ============ i18n 文案 ============

function crAxisShortLabels(wttMode) {
    const L = i18n[currentLang];
    return [L.radar_ax1_short, L.radar_ax2_short, L.radar_ax3_short, L.radar_ax4_short,
        (wttMode ? L.radar_ax5_short_wtt : L.radar_ax5_short_club), L.radar_ax6_short];
}
function crAxisFullLabel(idx, wttMode) {
    const L = i18n[currentLang];
    const keys = ['radar_ax1_full', 'radar_ax2_full', 'radar_ax3_full', 'radar_ax4_full',
        (wttMode ? 'radar_ax5_full_wtt' : 'radar_ax5_full_club'), 'radar_ax6_full'];
    return L[keys[idx]] || '';
}
function crAxisTip(idx, wttMode, threshold) {
    const L = i18n[currentLang];
    let key = 'radar_tip_ax' + (idx + 1);
    if (idx === 4) key = wttMode ? 'radar_tip_ax5_wtt' : 'radar_tip_ax5_club';
    let txt = L[key] || '';
    if (idx === 3 && threshold != null) txt = txt.replace('{th}', threshold);
    return txt;
}
// 轴样本明细（tooltip / 行 title 用）：{w}胜/{t}场 等
function crAxisDetail(radar, idx) {
    const L = i18n[currentLang];
    const ax = radar.axes[idx];
    switch (ax.key) {
        case 'win': return L.radar_d1.replace('{w}', ax.w).replace('{t}', ax.n);
        case 'format': return L.radar_d2.replace('{w}', ax.w).replace('{t}', ax.n);
        case 'major': return L.radar_d3.replace('{w}', ax.w).replace('{t}', ax.n);
        case 'elite': return L.radar_d4.replace('{w}', ax.w).replace('{t}', ax.n).replace('{th}', ax.threshold);
        case 'retain': return radar.mode === 'wtt'
            ? L.radar_d5_wtt.replace('{r}', ax.ratio.toFixed(2)).replace('{t}', ax.n)
            : L.radar_d5_club.replace('{t}', ax.n);
        case 'close': return L.radar_d6.replace('{s}', ax.w).replace('{w}', ax.n);
    }
    return '';
}

// ============ 渲染 ============

let crActiveCharts = new Map();   // canvas 元素 → { chart, subjects, opts }
let crThemeObserver = null;

function crReducedMotion() { return !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches); }
function crChartTheme() {
    const isDark = (typeof isDarkTheme === 'function') ? isDarkTheme() : false;
    return {
        isDark: isDark,
        grid: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)',
        text: isDark ? '#aeb4c2' : '#4a5568',
        tooltip: {
            backgroundColor: isDark ? '#2a2e3d' : '#fff',
            titleColor: isDark ? '#e4e6ed' : '#1a1a2e',
            bodyColor: isDark ? '#aeb4c2' : '#4a5568',
            borderColor: isDark ? 'rgba(255,255,255,0.12)' : '#e2e8f0',
            borderWidth: 1,
            padding: 10,
            cornerRadius: 8
        }
    };
}
// 主题切换即时换色（沿用 data-scale.js 的 MutationObserver 模式，update('none') 不做动画）
function crEnsureThemeObserver() {
    if (crThemeObserver || typeof MutationObserver === 'undefined') return;
    crThemeObserver = new MutationObserver(function () {
        const t = crChartTheme();
        for (const [canvas, entry] of crActiveCharts) {
            if (!canvas.isConnected) { crActiveCharts.delete(canvas); continue; }
            const chart = entry.chart;
            chart.options.plugins.tooltip = Object.assign({}, chart.options.plugins.tooltip, t.tooltip);
            if (chart.options.scales && chart.options.scales.r) {
                chart.options.scales.r.grid.color = t.grid;
                chart.options.scales.r.angleLines.color = t.grid;
                chart.options.scales.r.pointLabels.color = t.text;
            }
            chart.update('none');
        }
    });
    crThemeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
}

/**
 * 渲染雷达图（销毁旧实例后新建；登记进主题观察表）。
 * @param {HTMLCanvasElement} canvas
 * @param {Array} subjects [{ name, color, radar }]（radar = computeClubRadar/computeWttRadar 结果）
 * @param {object} [opts] { wttMode }
 * @returns {Chart|null}
 */
function renderRadarChart(canvas, subjects, opts) {
    if (!canvas || typeof Chart === 'undefined' || !subjects || !subjects.length) return null;
    opts = opts || {};
    const wttMode = !!opts.wttMode;
    const existing = Chart.getChart(canvas);
    if (existing) existing.destroy();
    const t = crChartTheme();
    const isMobile = window.innerWidth <= 768;
    const labels = crAxisShortLabels(wttMode);
    const datasets = subjects.map(function (s) {
        return {
            label: s.name,
            data: s.radar.axes.map(function (a) { return a.score; }),
            borderColor: s.color,
            backgroundColor: crAlpha(s.color, 0.16),
            borderWidth: 2,
            tension: 0,                       // 直线边：六边形轮廓，不做曲线插值
            pointBackgroundColor: s.color,
            pointBorderColor: s.color,
            pointRadius: isMobile ? 2.5 : 3,
            pointHoverRadius: isMobile ? 4 : 5,
            fill: true,
            _crColor: s.color
        };
    });
    const chart = new Chart(canvas, {
        type: 'radar',
        data: { labels: labels, datasets: datasets },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            animation: crReducedMotion() ? false : { duration: 700, easing: 'easeOutQuart' },
            plugins: {
                legend: { display: false },   // 图例走页面 chips
                tooltip: Object.assign({}, t.tooltip, {
                    displayColors: true,
                    callbacks: {
                        title: function (items) { return crAxisFullLabel(items[0].dataIndex, wttMode); },
                        label: function (item) {
                            return subjects[item.datasetIndex].name + ': ' + subjects[item.datasetIndex].radar.axes[item.dataIndex].score;
                        },
                        afterBody: function (items) {
                            const lines = [];
                            for (const it of items) lines.push(subjects[it.datasetIndex].name + ' · ' + crAxisDetail(subjects[it.datasetIndex].radar, it.dataIndex));
                            const ax0 = subjects[items[0].datasetIndex].radar.axes[items[0].dataIndex];
                            lines.push('');
                            lines.push(crAxisTip(items[0].dataIndex, wttMode, ax0.threshold));
                            if (ax0.censored) lines.push(i18n[currentLang].radar_tip_wtt_censored);
                            return lines;
                        }
                    }
                })
            },
            scales: {
                r: {
                    min: 0, max: 100,
                    ticks: { display: false, stepSize: 20 },
                    grid: { color: t.grid },
                    angleLines: { color: t.grid },
                    pointLabels: { color: t.text, font: { size: isMobile ? 10 : 12, weight: 600 } }
                }
            }
        }
    });
    crActiveCharts.set(canvas, { chart: chart, subjects: subjects, opts: opts });
    crEnsureThemeObserver();
    return chart;
}

// 明细行 ↔ 雷达联动：hover/focus .cr-axis-row[data-axis] 高亮对应轴点并弹 tooltip
function crBindAxisRows(scope, canvas, subjects) {
    const chart = (typeof Chart !== 'undefined' && Chart.getChart) ? Chart.getChart(canvas) : null;
    if (!chart || !scope) return;
    const rows = scope.querySelectorAll('[data-axis]');
    const highlight = function (row, on) {
        const idx = parseInt(row.getAttribute('data-axis'), 10);
        if (isNaN(idx)) return;
        const actives = [];
        subjects.forEach(function (s, ds) {
            if (chart.isDatasetVisible(ds)) actives.push({ datasetIndex: ds, index: idx });
        });
        if (on && actives.length) {
            chart.setActiveElements(actives);
            const el = chart.getDatasetMeta(0).data[idx];
            chart.tooltip.setActiveElements(actives, el ? { x: el.x, y: el.y } : undefined);
        } else {
            chart.setActiveElements([]);
            chart.tooltip.setActiveElements([], { x: 0, y: 0 });
        }
        chart.update();
    };
    rows.forEach(function (row) {
        row.addEventListener('mouseenter', function () { highlight(row, true); });
        row.addEventListener('mouseleave', function () { highlight(row, false); });
        row.addEventListener('focus', function () { highlight(row, true); });
        row.addEventListener('blur', function () { highlight(row, false); });
    });
}

// 徽章（S+/S/A/B · 指数）：样式内联自 CR_GRADE_COLORS，title 给出构成算式
function crGradeBadgeHtml(radar, small) {
    const color = CR_GRADE_COLORS[radar.grade] || CR_GRADE_COLORS.B;
    const L = i18n[currentLang];
    const title = L.radar_composite + ' = ' + radar.axes.map(function (a) { return a.score; }).join(' + ') + ' ÷ 6 ≈ ' + radar.composite;
    return '<span class="cr-grade-badge' + (small ? ' cr-grade-badge-sm' : '') + '" style="color:' + color +
        ';background:' + crAlpha(color, 0.14) + ';border-color:' + crAlpha(color, 0.45) +
        '" title="' + escapeHtml(title) + '">' + escapeHtml(radar.grade) + ' · ' + radar.composite + '</span>';
}

// ============ 挂载点 A：个人主页 pa-card（player-analytics.js 调用，club/WTT 双模式）============

function crAnalyticsCardHtml(playerName, radar, wttMode) {
    const L = i18n[currentLang];
    const labels = crAxisShortLabels(wttMode);
    let html = '<div class="pa-card glass-card pa-span-2 cr-card">';
    html += '<div class="cr-card-head"><div class="personal-card-header"><i class="fa-solid fa-chart-simple"></i> ' + L.radar_title + '</div>' + crGradeBadgeHtml(radar) + '</div>';
    html += '<div class="cr-body">';
    html += '<div class="cr-chart-box"><canvas id="paRadarChart"></canvas></div>';
    html += '<div class="cr-axis-list">';
    radar.axes.forEach(function (ax, i) {
        const detail = crAxisDetail(radar, i);
        const tip = crAxisTip(i, wttMode, ax.threshold);
        html += '<div class="cr-axis-row' + (ax.isDefault ? ' cr-axis-default' : '') + '" data-axis="' + i + '" tabindex="0" title="' + escapeHtml(detail + '\n' + tip) + '">';
        html += '<span class="cr-axis-name">' + escapeHtml(labels[i]) + '</span>';
        html += '<span class="cr-bar"><span class="cr-bar-fill" style="width:' + ax.score + '%"></span></span>';
        html += '<span class="cr-axis-score">' + ax.score + '</span>';
        html += '<span class="cr-axis-n">n=' + ax.n;
        if (ax.isDefault) html += ' · ' + escapeHtml(L.radar_sample_insufficient);
        if (ax.censored) html += ' <i class="fa-solid fa-circle-info" title="' + escapeHtml(L.radar_tip_wtt_censored) + '"></i>';
        html += '</span>';
        html += '</div>';
    });
    html += '</div></div>';
    html += '<div class="pa-card-hint">' + (wttMode ? L.radar_hint_wtt : L.radar_hint_club) + '</div>';
    html += '</div>';
    return html;
}

function crMountAnalyticsRadar(playerName, radar, wttMode) {
    const canvas = document.getElementById('paRadarChart');
    if (!canvas) return;
    const disp = (typeof playerDisplayName === 'function') ? playerDisplayName(playerName) : playerName;
    const chart = renderRadarChart(canvas, [{ name: disp, color: CR_DATASET_COLORS[0], radar: radar }], { wttMode: wttMode });
    if (!chart) return;
    if (typeof paTrackChart === 'function') paTrackChart(chart);   // 纳入 player-analytics 的销毁链
    const card = canvas.closest ? canvas.closest('.cr-card') : null;
    crBindAxisRows(card || canvas.parentElement, canvas, [{ name: disp, radar: radar }]);
}

// ============ 挂载点 B：社团数据大屏 独立雷达区块（data_viz.html 静态区块 + data-viz.js 触发）============

let crVizRadarPair = null;   // 最近一次渲染的 [A, B|null]（语言切换重渲用）

function crVizRadarPlaceholder() {
    return '<div class="compare-placeholder"><i class="fa-solid fa-chart-simple"></i><p>' +
        escapeHtml(i18n[currentLang].radar_pick_players) + '</p></div>';
}

function crRenderVizRadarInto(wrap, subjects) {
    const L = i18n[currentLang];
    const two = subjects.length >= 2;
    let html = '<div class="cr-body cr-body-compare">';
    html += '<div class="cr-chart-box"><canvas id="crRadarChart"></canvas></div>';
    html += '<div class="cr-compare-side" id="crRadarSide">';
    html += '<div class="cr-duel-chips">' + crChipsHtml(subjects) + '</div>';
    if (two) {
        html += '<table class="cr-diff-table"><thead><tr><th></th>';
        subjects.forEach(function (s) { html += '<th>' + escapeHtml(s.name) + '</th>'; });
        html += '<th>' + L.radar_diff_col + '</th></tr></thead><tbody>';
        const labels = crAxisShortLabels(false);
        const rA = subjects[0].radar, rB = subjects[1].radar;
        rA.axes.forEach(function (ax, i) {
            const diff = ax.score - rB.axes[i].score;
            html += '<tr class="cr-diff-row" data-axis="' + i + '" tabindex="0">';
            html += '<td class="cr-axis-name">' + escapeHtml(labels[i]) + '</td>';
            html += '<td>' + ax.score + '</td><td>' + rB.axes[i].score + '</td>';
            html += '<td class="' + (diff > 0 ? 'cr-diff-pos' : (diff < 0 ? 'cr-diff-neg' : '')) + '">' + (diff > 0 ? '+' : '') + diff + '</td>';
            html += '</tr>';
        });
        html += '</tbody></table>';
    }
    html += '</div></div>';
    wrap.innerHTML = html;
    const canvas = document.getElementById('crRadarChart');
    renderRadarChart(canvas, subjects, { wttMode: false });
    const side = document.getElementById('crRadarSide');
    crBindChips(side, canvas);
    crBindAxisRows(side, canvas, subjects);
}

/** 渲染独立雷达区块；playerB 可空（单人均可）。 */
function crMountVizRadar(playerA, playerB) {
    const wrap = document.getElementById('crRadarResult');
    if (!wrap) return;
    if (typeof computeClubRadar !== 'function') return;
    const names = [playerA, playerB].filter(Boolean);
    if (!names.length) { crVizRadarPair = null; wrap.innerHTML = crVizRadarPlaceholder(); return; }
    const subjects = names.map(function (n, i) {
        return { name: (typeof playerDisplayName === 'function') ? playerDisplayName(n) : n, color: CR_DATASET_COLORS[i], radar: computeClubRadar(n) };
    }).filter(function (s) { return s.radar; });
    if (!subjects.length) { crVizRadarPair = null; wrap.innerHTML = crVizRadarPlaceholder(); return; }
    crVizRadarPair = names;
    crRenderVizRadarInto(wrap, subjects);
}

/** 初始默认：实时榜前 2 名自动渲染（语言无关，存中文原始名）。 */
function crInitVizRadar() {
    const a = document.getElementById('crRadarPlayerA');
    if (!a || typeof computeClubRadar !== 'function') return;
    let pair = null;
    const tl = (typeof rankingTimeline !== 'undefined') ? rankingTimeline : null;
    if (tl && tl.length) {
        for (let i = tl.length - 1; i >= 0 && !pair; i--) {
            if (tl[i].data && tl[i].data.length >= 2) pair = [tl[i].data[0]['姓名'], tl[i].data[1]['姓名']];
        }
    }
    if (!pair) pair = [a.options.length > 1 ? a.options[1].value : ''];
    a.value = pair[0] || '';
    const b = document.getElementById('crRadarPlayerB');
    if (b) b.value = pair[1] || '';
    crMountVizRadar(pair[0], pair[1] || '');
}

/** 语言切换重渲（dataVizMainReapplyI18n 调用）。 */
function crRerenderVizRadar() {
    if (!crVizRadarPair || !document.getElementById('crRadarResult')) return;
    crMountVizRadar(crVizRadarPair[0], crVizRadarPair[1] || '');
}

// chips（点击显隐 / hover 聚焦）——对比区与 WTT 雷达对决共用
function crChipsHtml(subjects) {
    return subjects.map(function (s, i) {
        return '<button type="button" class="cr-chip" data-ds="' + i + '" style="--cr-c:' + s.color + '">' +
            '<span class="cr-chip-dot"></span><span class="cr-chip-name">' + escapeHtml(s.name) + '</span>' +
            crGradeBadgeHtml(s.radar, true) + '</button>';
    }).join('');
}
function crDimOthers(chart, activeDs, dim) {
    chart.data.datasets.forEach(function (d, i) {
        if (i === activeDs || !d._crColor) return;
        d.borderColor = dim ? crAlpha(d._crColor, 0.25) : d._crColor;
        d.backgroundColor = dim ? crAlpha(d._crColor, 0.04) : crAlpha(d._crColor, 0.16);
    });
    chart.update('none');
}
function crBindChips(container, canvas) {
    const chart = (typeof Chart !== 'undefined' && Chart.getChart) ? Chart.getChart(canvas) : null;
    if (!chart || !container) return;
    container.querySelectorAll('.cr-chip[data-ds]').forEach(function (btn) {
        const ds = parseInt(btn.getAttribute('data-ds'), 10);
        btn.addEventListener('click', function () {
            const vis = chart.isDatasetVisible(ds);
            chart.setDatasetVisibility(ds, !vis);
            btn.classList.toggle('cr-chip-off', vis);
            chart.update();
        });
        btn.addEventListener('mouseenter', function () { crDimOthers(chart, ds, true); });
        btn.addEventListener('mouseleave', function () { crDimOthers(chart, ds, false); });
    });
}

// ============ 挂载点 C：WTT 数据大屏 独立雷达区块（wtt_dataviz.html 静态区块 + wtt_dataviz.js 触发）============
// 与社团 data_viz 的独立雷达区块同构：A/B 双下拉 + VS + 对比按钮，渲染 chart + chips + 六轴差值表

let wttVizRadarPair = null;   // 最近一次渲染的 [A, B|null]（语言切换重渲用）

function wttVizRadarPlaceholder() {
    return '<div class="compare-placeholder"><i class="fa-solid fa-chart-simple"></i><p>' +
        escapeHtml(i18n[currentLang].radar_pick_players) + '</p></div>';
}

/** 渲染独立雷达区块；playerB 可空（单人均可）。 */
function wttMountVizRadar(playerA, playerB) {
    const wrap = document.getElementById('wttRadarResult');
    if (!wrap) return;
    if (typeof computeWttRadar !== 'function') return;
    const names = [playerA, playerB].filter(Boolean);
    if (!names.length) { wttVizRadarPair = null; wrap.innerHTML = wttVizRadarPlaceholder(); return; }
    const subjects = names.map(function (n, i) {
        return { name: n, color: CR_DATASET_COLORS[i], radar: computeWttRadar(n) };
    }).filter(function (s) { return s.radar; });
    if (!subjects.length) { wttVizRadarPair = null; wrap.innerHTML = wttVizRadarPlaceholder(); return; }
    wttVizRadarPair = names;
    const L = i18n[currentLang];
    const two = subjects.length >= 2;
    let html = '<div class="cr-body cr-body-compare">';
    html += '<div class="cr-chart-box"><canvas id="wttRadarChart"></canvas></div>';
    html += '<div class="cr-compare-side" id="wttRadarSide">';
    html += '<div class="cr-duel-chips">' + crChipsHtml(subjects) + '</div>';
    if (two) {
        html += '<table class="cr-diff-table"><thead><tr><th></th>';
        subjects.forEach(function (s) { html += '<th>' + escapeHtml(s.name) + '</th>'; });
        html += '<th>' + L.radar_diff_col + '</th></tr></thead><tbody>';
        const labels = crAxisShortLabels(true);
        const rA = subjects[0].radar, rB = subjects[1].radar;
        rA.axes.forEach(function (ax, i) {
            const diff = ax.score - rB.axes[i].score;
            html += '<tr class="cr-diff-row" data-axis="' + i + '" tabindex="0">';
            html += '<td class="cr-axis-name">' + escapeHtml(labels[i]) + '</td>';
            html += '<td>' + ax.score + '</td><td>' + rB.axes[i].score + '</td>';
            html += '<td class="' + (diff > 0 ? 'cr-diff-pos' : (diff < 0 ? 'cr-diff-neg' : '')) + '">' + (diff > 0 ? '+' : '') + diff + '</td>';
            html += '</tr>';
        });
        html += '</tbody></table>';
    }
    html += '<div class="pa-card-hint" style="text-align:left;">' + L.radar_hint_wtt + '</div>';
    html += '</div></div>';
    wrap.innerHTML = html;
    const canvas = document.getElementById('wttRadarChart');
    renderRadarChart(canvas, subjects, { wttMode: true });
    const side = document.getElementById('wttRadarSide');
    crBindChips(side, canvas);
    crBindAxisRows(side, canvas, subjects);
}

/** 初始默认：实时榜前 2 名自动渲染。 */
function wttInitVizRadar() {
    const a = document.getElementById('wttRadarPlayerA');
    if (!a || typeof computeWttRadar !== 'function') return;
    let pair = null;
    const tl = (typeof wttRankingTimeline !== 'undefined' && wttRankingTimeline && wttRankingTimeline.length) ? wttRankingTimeline : null;
    if (tl) {
        for (let i = tl.length - 1; i >= 0 && !pair; i--) {
            if (tl[i].data && tl[i].data.length >= 2) pair = [tl[i].data[0]['姓名'], tl[i].data[1]['姓名']];
        }
    }
    if (!pair) pair = [a.options.length > 1 ? a.options[1].value : ''];
    a.value = pair[0] || '';
    const b = document.getElementById('wttRadarPlayerB');
    if (b) b.value = pair[1] || '';
    wttMountVizRadar(pair[0], pair[1] || '');
}

/** 语言切换重渲（wtt_dataviz.js 的 wttReapplyI18n 调用）。 */
function wttRerenderVizRadar() {
    if (!wttVizRadarPair || !document.getElementById('wttRadarResult')) return;
    wttMountVizRadar(wttVizRadarPair[0], wttVizRadarPair[1] || '');
}
