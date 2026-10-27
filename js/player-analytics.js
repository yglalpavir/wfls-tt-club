/* ========================================
   player-analytics.js - 球员个人页深度数据分析
   依赖（按加载顺序）: Chart.js / common.js / score-engine.js / personal-stats.js / player-page.js
   仅用于 player.html，由 initPlayerPage / reapplyPlayerPage 调用
   模块：排名走势 / 赛事类型分布 / 实力差胜负 / 月度活跃度 / 竞技状态 / 赛季对比 / 积分来源构成
   ======================================== */

// 当前页所有分析图表实例，重建前统一销毁，避免 Chart.js 实例泄漏
let paActiveCharts = [];

function destroyPlayerAnalytics() {
    for (const c of paActiveCharts) {
        try { c.destroy(); } catch (e) { /* canvas 已被移除时忽略 */ }
    }
    paActiveCharts = [];
}

function paTrackChart(chart) {
    paActiveCharts.push(chart);
    return chart;
}

// ---------- 主题与配色 ----------

function paChartTheme() {
    const isDark = (typeof isDarkTheme === 'function' ? isDarkTheme() : false);
    return {
        isDark: isDark,
        grid: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)',
        text: isDark ? '#aeb4c2' : '#4a5568',
        win: isDark ? '#73d13d' : '#52c41a',
        loss: isDark ? '#ff6b6b' : '#ff4d4f',
        tooltip: {
            backgroundColor: isDark ? '#2a2e3d' : '#fff',
            titleColor: isDark ? '#e4e6ed' : '#1a1a2e',
            bodyColor: isDark ? '#aeb4c2' : '#4a5568',
            borderColor: isDark ? 'rgba(255,255,255,0.12)' : '#e2e8f0',
            borderWidth: 1,
            padding: 10,
            displayColors: false
        }
    };
}

const PA_TYPE_COLORS = {
    '普通': '#4da3ff',
    '排位赛': '#9b6dff',
    '挑战赛': '#ff9f43',
    '校乒联赛': '#2dd4bf',
    '十二强赛': '#f472b6',
    '校乒赛团体': '#fbbf24',
    '校乒赛单打': '#2fbf71'
};
const PA_FALLBACK_COLORS = ['#4da3ff', '#9b6dff', '#ff9f43', '#2dd4bf', '#f472b6', '#fbbf24', '#2fbf71'];
// 每日类型分解中加分记录的固定 key（渲染时再取本地化文案）
const PA_BONUS_KEY = '__bonus';
// 摘要条中赛季继承残差的固定颜色
const PA_INHERIT_COLOR = '#52525b';

function paTypeColor(key, idx) {
    if (key === PA_BONUS_KEY) return '#eab308';
    if (PA_TYPE_COLORS[key]) return PA_TYPE_COLORS[key];
    return PA_FALLBACK_COLORS[idx % PA_FALLBACK_COLORS.length];
}

function paTypeLabel(key) {
    if (key === PA_BONUS_KEY) return i18n[currentLang].score_type_bonus;
    // 赛事类型是数据键，显示层查 ev_* 词典（颜色映射仍按原中文键工作）
    return (typeof eventTypeLabel === 'function') ? eventTypeLabel(key) : key;
}

function paAlpha(hex, a) {
    const h = hex.replace('#', '');
    return 'rgba(' + parseInt(h.slice(0, 2), 16) + ',' + parseInt(h.slice(2, 4), 16) + ',' + parseInt(h.slice(4, 6), 16) + ',' + a + ')';
}

function paFormatMonth(ds) {
    const y = ds.slice(0, 4), m = parseInt(ds.slice(5, 7), 10);
    return i18n[currentLang].chart_axis_ym_tpl.replace('{y}', y).replace('{m}', m);
}

function paShortDate(ds) {
    const d = new Date(ds + 'T00:00:00');
    return (d.getMonth() + 1) + '/' + d.getDate();
}

// ---------- 数据计算 ----------

// 排名历史：遍历排名时间线每个节点重算排名
// timeline 可选：WTT 页传入 wttRankingTimeline，缺省用俱乐部全局 rankingTimeline
function paBuildRankSeries(playerName, timeline) {
    const tl = timeline || (typeof rankingTimeline !== 'undefined' ? rankingTimeline : []);
    const series = [];
    if (!Array.isArray(tl)) return series;
    for (const t of tl) {
        if (!t || !t.data || !t.data.length) continue;
        // 赛季初始积分节点非比赛产生，不进入排名走势
        if (t.isInitial) continue;
        const sorted = [...t.data].sort((a, b) => (b['当前积分'] || 0) - (a['当前积分'] || 0));
        const idx = sorted.findIndex(p => p['姓名'] === playerName);
        if (idx < 0) continue;
        series.push({ time: t.time, label: getNodeDisplayLabel(t), rank: idx + 1 });
    }
    return series;
}

// 赛事类型分布（不含 bonus）
function paBuildTypeStats(matches) {
    const map = new Map();
    for (const m of matches) {
        if (!map.has(m.type)) map.set(m.type, { type: m.type, total: 0, wins: 0 });
        const s = map.get(m.type);
        s.total++;
        if (m.isWin) s.wins++;
    }
    return [...map.values()].sort((a, b) => b.total - a.total);
}

// 实力差分档：gap = 对手赛前分 - 我方赛前分，正数=对手更强（我方落后）
const PA_GAP_BANDS = [
    { min: -Infinity, max: -100, labelKey: 'lead100' },
    { min: -100, max: -50, labelKey: 'lead50' },
    { min: -50, max: 0, labelKey: 'lead1' },
    { min: 0, max: 50, labelKey: 'behind1' },
    { min: 50, max: 100, labelKey: 'behind50' },
    { min: 100, max: Infinity, labelKey: 'behind100' }
];

function paGapBandLabel(key) {
    const L = i18n[currentLang];
    switch (key) {
        case 'lead100': return L.pa_gap_self_strong + ' ≥100';
        case 'lead50': return L.pa_gap_self_strong + ' 50–99';
        case 'lead1': return L.pa_gap_self_slight + ' 1–49';
        case 'behind1': return L.pa_gap_opp_slight + ' 0–49';
        case 'behind50': return L.pa_gap_opp_strong + ' 50–99';
        case 'behind100': return L.pa_gap_opp_strong + ' ≥100';
    }
    return key;
}

function paBuildGapStats(matches) {
    const bands = PA_GAP_BANDS.map(() => ({ wins: 0, losses: 0 }));
    for (const m of matches) {
        if (m.oppPre == null || m.pre == null) continue;
        const gap = m.oppPre - m.pre;
        for (let i = 0; i < PA_GAP_BANDS.length; i++) {
            const b = PA_GAP_BANDS[i];
            if (gap >= b.min && gap < b.max) {
                if (m.isWin) bands[i].wins++; else bands[i].losses++;
                break;
            }
        }
    }
    return bands;
}

// 月度活跃度：从首场到末场逐月补零
function paBuildMonthlyStats(matches) {
    if (!matches.length) return null;
    const key = ds => ds.slice(0, 7);
    const first = key(matches[0].date), last = key(matches[matches.length - 1].date);
    const months = [];
    let y = parseInt(first.slice(0, 4), 10), m = parseInt(first.slice(5, 7), 10);
    const ey = parseInt(last.slice(0, 4), 10), em = parseInt(last.slice(5, 7), 10);
    while (y < ey || (y === ey && m <= em)) {
        months.push(y + '-' + String(m).padStart(2, '0'));
        m++;
        if (m > 12) { m = 1; y++; }
    }
    const stats = new Map(months.map(k => [k, { total: 0, wins: 0 }]));
    for (const mt of matches) {
        const s = stats.get(key(mt.date));
        if (!s) continue;
        s.total++;
        if (mt.isWin) s.wins++;
    }
    return {
        labels: months,
        totals: months.map(k => stats.get(k).total),
        rates: months.map(k => {
            const s = stats.get(k);
            return s.total ? Math.round(s.wins / s.total * 100) : null;
        })
    };
}

// 竞技状态：连胜连败 + 近10场 + 滚动10场胜率
function paBuildFormStats(matches) {
    let curType = null, curLen = 0;
    for (let i = matches.length - 1; i >= 0; i--) {
        if (curType === null) { curType = matches[i].isWin; curLen = 1; }
        else if (matches[i].isWin === curType) curLen++;
        else break;
    }
    let maxW = 0, maxL = 0, runW = 0, runL = 0, wins = 0;
    const rolling = [];
    for (let i = 0; i < matches.length; i++) {
        if (matches[i].isWin) { runW++; runL = 0; wins++; if (runW > maxW) maxW = runW; }
        else { runL++; runW = 0; if (runL > maxL) maxL = runL; }
        const start = Math.max(0, i - 9);
        let w = 0;
        for (let j = start; j <= i; j++) if (matches[j].isWin) w++;
        rolling.push({ date: matches[i].date, rate: Math.round(w / (i - start + 1) * 100) });
    }
    return {
        curType: curType,
        curLen: curLen,
        maxW: maxW,
        maxL: maxL,
        last10: matches.slice(-10).map(m => m.isWin),
        rolling: rolling,
        overallRate: matches.length ? Math.round(wins / matches.length * 100) : 0
    };
}

// 赛季对比：含 bonus 的净积分变化与赛季最高分
function paBuildSeasonStats(allRecords) {
    const seasons = (seasonsData && seasonsData.length) ? seasonsData : [];
    const rows = [];
    for (const season of seasons) {
        const recs = allRecords.filter(r => r.date >= season.startDate && r.date <= season.endDate);
        if (!recs.length) continue;
        const matches = recs.filter(r => !r.isBonus);
        const wins = matches.filter(r => r.isWin).length;
        const losses = matches.length - wins;
        let peak = -Infinity;
        for (const r of recs) {
            if (r.pre != null && r.pre > peak) peak = r.pre;
            if (r.post != null && r.post > peak) peak = r.post;
        }
        // allRecords 按日期倒序，改用时间正序确定赛季首末条目
        const chrono = [...recs].sort((a, b) => a.date.localeCompare(b.date));
        const first = chrono[0], last = chrono[chrono.length - 1];
        const net = (last.post || 0) - (first.pre || 0);
        rows.push({
            label: season.label,
            total: matches.length,
            wins: wins,
            losses: losses,
            rate: matches.length ? Math.round(wins / matches.length * 100) : null,
            net: net,
            peak: peak === -Infinity ? null : peak
        });
    }
    return rows;
}

// 积分来源构成：基于每日积分历史的类型分解
// 图表每个数据点 = 赛季基准分（含继承）+ 当季各类型贡献（按当日衰减），堆叠总和恒等于当日积分
// 摘要条 = 生涯口径：初始分 + 各类型生涯累计（各赛季末衰减值求和）+ 赛季继承残差 = 总积分
function paBuildSourceFromDaily(dailyFull) {
    const typeSet = new Set();
    let hasBonus = false;
    for (const d of dailyFull) {
        for (const k of Object.keys(d.typeSums || {})) {
            if (k === PA_BONUS_KEY) { hasBonus = true; continue; }
            typeSet.add(k);
        }
    }
    // 累计贡献幅度大的类型排在栈底
    const last = dailyFull[dailyFull.length - 1];
    const types = [...typeSet].sort((a, b) => Math.abs((last.typeSums[b] || 0)) - Math.abs((last.typeSums[a] || 0)));
    // 生涯累计：每个赛季结束时（基准分变化的前一天）冻结当季各类型贡献
    const initial = dailyFull[0].baseline || 0;
    const lifetime = {};
    let prev = null;
    for (const d of dailyFull) {
        if (prev && d.baseline !== prev.baseline) {
            for (const k in prev.typeSums) lifetime[k] = (lifetime[k] || 0) + prev.typeSums[k];
        }
        prev = d;
    }
    if (prev) {
        for (const k in prev.typeSums) lifetime[k] = (lifetime[k] || 0) + prev.typeSums[k];
    }
    // 赛季继承残差：保证 初始分 + 各项累计 = 当前积分
    let sumAll = initial;
    for (const k in lifetime) sumAll += lifetime[k];
    const inherit = (last.score || 0) - sumAll;
    return { types: types, hasBonus: hasBonus, snapshots: dailyFull, initial: initial, lifetime: lifetime, inherit: inherit };
}

// 积分流向聚合（桑基图数据源）：按对手汇总本人视角的积分收支
// 口径 = 收支口径 + 衰减至今日：流入 = 我赢该对手各场所得（change>0）之和，
// 流出 = 我输该对手各场所失（|change|）之和，与比赛明细表「调整」列同源可直接对账。
// matches 行来自 computePlayerMatchRecords / wttPpComputeMatchRecords（双打配对串不会
// 等于球员名，行天然只含单打）；bonus 从全量行另计，仅作脚注不画入图。
function paBuildFlowData(matches, allRows) {
    const map = new Map();
    let bonus = 0;
    if (Array.isArray(allRows)) {
        for (const r of allRows) if (r.isBonus) bonus += (r.change || 0);
    }
    for (const r of matches) {
        if (r.isBonus || !r.opp || r.opp === '-') continue;
        let s = map.get(r.opp);
        if (!s) {
            s = { opp: r.opp, wins: 0, losses: 0, inflow: 0, outflow: 0, lastDate: '' };
            map.set(r.opp, s);
        }
        if (r.isWin) { s.wins++; s.inflow += (r.change || 0); }
        else { s.losses++; s.outflow += Math.abs(r.change || 0); }
        if (r.date > s.lastDate) s.lastDate = r.date;
    }
    if (!map.size) return null;
    const opps = [...map.values()];
    let totalIn = 0, totalOut = 0;
    for (const s of opps) { totalIn += s.inflow; totalOut += s.outflow; }
    if (totalIn <= 0 && totalOut <= 0) return null;
    return { opps: opps, totalIn: totalIn, totalOut: totalOut, bonus: bonus };
}

// ---------- HTML 构建 ----------

// ---------- 数据计算 ----------

// 计算全部分析数据（语言无关，可缓存复用；WTT 页需在 wttWithDataContext 内调用）
function paComputeAnalyticsData(playerName, records, opts) {
    opts = opts || {};
    const all = records || computePlayerMatchRecords(playerName);
    const matches = all.filter(r => !r.isBonus).sort((a, b) => a.date.localeCompare(b.date));
    const rankSeries = paBuildRankSeries(playerName, opts.timeline);
    // 积分来源构成：与积分趋势图同口径的每日回放（带类型分解）
    const sortedLogDaily = [...scoreLogData].sort((a, b) => a['日期'].localeCompare(b['日期']));
    const startScoresDaily = initialScoresData ? { ...initialScoresData.initialScores } : {};
    const dailyFull = computeDailyScoreHistory(playerName, sortedLogDaily, startScoresDaily, true);
    const source = paBuildSourceFromDaily(dailyFull);
    const gapBands = paBuildGapStats(matches);
    return {
        all: all,
        matches: matches,
        rankSeries: rankSeries,
        rankBoundaries: paFindSeasonBoundaries(rankSeries),
        typeStats: paBuildTypeStats(matches),
        gapBands: gapBands,
        gapTotal: gapBands.reduce((s, b) => s + b.wins + b.losses, 0),
        monthly: paBuildMonthlyStats(matches),
        form: paBuildFormStats(matches),
        seasonRows: paBuildSeasonStats(all),
        source: source,
        sourceBoundaries: paFindSeasonBoundaries(source.snapshots),
        flow: paBuildFlowData(matches, all)
    };
}

function renderPlayerAnalytics(playerName, records, opts) {
    const container = document.getElementById('playerAnalyticsBody');
    if (!container) return;
    destroyPlayerAnalytics();
    opts = opts || {};
    // opts.data 可传入缓存的计算结果（语言切换重渲时避免重复重型计算）
    const data = opts.data || paComputeAnalyticsData(playerName, records, opts);
    const all = data.all, matches = data.matches;
    if (!matches.length && !all.length) { container.innerHTML = ''; return; }

    const { rankSeries, typeStats, gapBands, gapTotal, monthly, form, seasonRows, source, flow } = data;

    // 六维战力雷达（通栏总览卡；club/WTT 双模式由 opts.wttMode 标记，capability-radar.js 提供）
    const crIsWtt = !!(opts && opts.wttMode);
    const crRadar = crIsWtt
        ? (typeof computeWttRadar === 'function' ? computeWttRadar(playerName) : null)
        : (typeof computeClubRadar === 'function' ? computeClubRadar(playerName) : null);

    const L = i18n[currentLang];
    let html = '';
    html += '<div class="pa-section-header">' + L.pa_section_title + '</div>';
    html += '<div class="pa-grid">';
    if (crRadar && typeof crAnalyticsCardHtml === 'function') html += crAnalyticsCardHtml(playerName, crRadar, crIsWtt);

    // 1. 排名走势（通栏）
    if (rankSeries.length >= 2) {
        html += '<div class="pa-card glass-card pa-span-2">';
        html += '<div class="personal-card-header">' + L.pa_rank_title + '</div>';
        html += '<div class="pa-chart-box"><canvas id="paRankChart"></canvas></div>';
        html += '</div>';
    }

    // 2. 赛事类型分布（半栏）
    if (typeStats.length) {
        html += '<div class="pa-card glass-card">';
        html += '<div class="personal-card-header">' + L.pa_type_title + '</div>';
        html += '<div class="pa-type-body">';
        html += '<div class="pa-donut-box"><canvas id="paTypeChart"></canvas></div>';
        html += '<div class="pa-type-legend">';
        for (const t of typeStats) {
            const rate = t.total ? Math.round(t.wins / t.total * 100) : 0;
            const idx = typeStats.indexOf(t);
            html += '<div class="pa-type-legend-item">';
            html += '<span class="pa-dot" style="background:' + paTypeColor(t.type, idx) + '"></span>';
            html += '<span class="pa-type-name">' + escapeHtml(paTypeLabel(t.type)) + '</span>';
            html += '<span class="pa-type-stat">' + L.wtt_sub_wl.replace('{wins}', t.wins).replace('{losses}', t.total - t.wins).replace('{rate}', rate) + '</span>';
            html += '</div>';
        }
        html += '</div>';
        html += '</div>';
        html += '</div>';
    }

    // 3. 实力差胜负分析（半栏）
    if (gapTotal > 0) {
        html += '<div class="pa-card glass-card">';
        html += '<div class="personal-card-header">' + L.pa_gap_title + '</div>';
        html += '<div class="pa-chart-box pa-chart-box-sm"><canvas id="paGapChart"></canvas></div>';
        html += '<div class="pa-card-hint">' + L.pa_gap_hint + '</div>';
        html += '</div>';
    }

    // 4. 月度活跃度（通栏）
    if (monthly && monthly.totals.length) {
        html += '<div class="pa-card glass-card pa-span-2">';
        html += '<div class="personal-card-header">' + L.pa_monthly_title + '</div>';
        html += '<div class="pa-chart-box"><canvas id="paMonthlyChart"></canvas></div>';
        html += '</div>';
    }

    // 5. 竞技状态（半栏）
    if (matches.length) {
        html += '<div class="pa-card glass-card">';
        html += '<div class="personal-card-header">' + L.pa_form_title + '</div>';
        html += '<div class="pa-form-body">';
        const curText = form.curLen > 0
            ? (form.curType ? L.pa_form_now_w.replace('{n}', form.curLen) : L.pa_form_now_l.replace('{n}', form.curLen))
            : '';
        html += '<div class="pa-form-top">';
        if (curText) html += '<span class="pa-form-streak ' + (form.curType ? 'win' : 'loss') + '">' + curText + '</span>';
        html += '<span class="pa-form-rate">' + L.pa_form_overall + ' <strong>' + form.overallRate + '%</strong></span>';
        html += '</div>';
        html += '<div class="pa-form-stats">';
        html += '<span>' + L.pa_form_max_w + ' <strong class="pa-text-win">' + form.maxW + '</strong></span>';
        html += '<span>' + L.pa_form_max_l + ' <strong class="pa-text-loss">' + form.maxL + '</strong></span>';
        html += '</div>';
        html += '<div class="pa-form-last10"><span class="pa-form-label">' + L.pa_form_last10 + '</span><span class="pa-form-dots">';
        // 最新一场排在最左：与连胜口径（自最新一场回溯）及下方比赛明细的倒序一致
        if (form.last10.length) {
            for (const isWin of [...form.last10].reverse()) {
                html += '<span class="pa-form-dot ' + (isWin ? 'w' : 'l') + '">' + (isWin ? i18n[currentLang].score_result_win : i18n[currentLang].score_result_loss) + '</span>';
            }
        } else {
            html += '<span class="pa-card-empty">' + L.wtt_empty + '</span>';
        }
        html += '</span></div>';
        if (form.rolling.length >= 2) {
            html += '<div class="pa-form-spark"><span class="pa-form-label">' + L.pa_form_rolling + '</span>';
            html += '<div class="pa-spark-box"><canvas id="paFormChart"></canvas></div></div>';
        }
        html += '</div>';
        html += '</div>';
    }

    // 6. 赛季对比（半栏）
    if (seasonRows.length) {
        html += '<div class="pa-card glass-card">';
        html += '<div class="personal-card-header">' + L.pa_season_title + '</div>';
        html += '<div class="pa-season-table-wrapper"><table class="pa-season-table">';
        html += '<thead><tr><th>' + L.pa_season_col + '</th><th>' + L.pa_season_matches + '</th><th>' + L.pa_season_wl + '</th><th>' + L.pa_season_rate + '</th><th>' + L.pa_season_net + '</th><th>' + L.pa_season_peak + '</th></tr></thead>';
        html += '<tbody>';
        let tTotal = 0, tWins = 0, tLosses = 0;
        for (const r of seasonRows) {
            tTotal += r.total; tWins += r.wins; tLosses += r.losses;
            const nc = r.net >= 0 ? 'pa-text-win' : 'pa-text-loss';
            const ns = r.net >= 0 ? '+' : '';
            html += '<tr><td>' + escapeHtml((typeof seasonLabel === 'function') ? seasonLabel(r.label) : String(r.label)) + '</td><td>' + r.total + '</td><td>' + r.wins + '-' + r.losses + '</td><td>' + (r.rate == null ? '-' : r.rate + '%') + '</td><td class="' + nc + '">' + ns + r.net.toFixed(1) + '</td><td>' + (r.peak == null ? '-' : r.peak.toFixed(1)) + '</td></tr>';
        }
        const tRate = tTotal ? Math.round(tWins / tTotal * 100) : null;
        html += '<tr class="pa-season-total"><td>' + L.pa_season_total + '</td><td>' + tTotal + '</td><td>' + tWins + '-' + tLosses + '</td><td>' + (tRate == null ? '-' : tRate + '%') + '</td><td>-</td><td>-</td></tr>';
        html += '</tbody></table></div>';
        html += '<div class="pa-card-hint">' + L.pa_season_hint + '</div>';
        html += '</div>';
    }

    // 7. 积分来源构成（通栏）：堆叠面积图，总和 = 积分曲线
    if (source.snapshots.length >= 2) {
        const lastDay = source.snapshots[source.snapshots.length - 1];
        html += '<div class="pa-card glass-card pa-span-2">';
        html += '<div class="personal-card-header">' + L.pa_source_title + '</div>';
        html += '<div class="pa-chart-box"><canvas id="paSourceChart"></canvas></div>';
        html += '<div class="pa-source-strip">';
        html += '<span class="pa-source-chip"><span class="pa-dot" style="background:' + PA_BASELINE_COLOR + '"></span><span class="pa-source-name">' + L.pa_source_initial + '</span><span>' + source.initial.toFixed(1) + '</span></span>';
        for (let i = 0; i < source.types.length; i++) {
            const key = source.types[i];
            const net = source.lifetime[key] || 0;
            const cls = net >= 0 ? 'pa-text-win' : 'pa-text-loss';
            const sign = net >= 0 ? '+' : '';
            html += '<span class="pa-source-chip"><span class="pa-dot" style="background:' + paTypeColor(key, i) + '"></span><span class="pa-source-name">' + escapeHtml(paTypeLabel(key)) + '</span><span class="' + cls + '">' + sign + net.toFixed(1) + '</span></span>';
        }
        if (source.hasBonus) {
            const bonus = source.lifetime[PA_BONUS_KEY] || 0;
            const cls = bonus >= 0 ? 'pa-text-win' : 'pa-text-loss';
            const sign = bonus >= 0 ? '+' : '';
            html += '<span class="pa-source-chip"><span class="pa-dot" style="background:' + paTypeColor(PA_BONUS_KEY, 0) + '"></span><span class="pa-source-name">' + escapeHtml(paTypeLabel(PA_BONUS_KEY)) + '</span><span class="' + cls + '">' + sign + bonus.toFixed(1) + '</span></span>';
        }
        if (Math.abs(source.inherit) >= 0.05) {
            html += '<span class="pa-source-chip"><span class="pa-dot" style="background:' + PA_INHERIT_COLOR + '"></span><span class="pa-source-name">' + L.pa_source_inherit + '</span><span>' + source.inherit.toFixed(1) + '</span></span>';
        }
        html += '<span class="pa-source-chip pa-source-total">' + L.pa_source_total + '<span>' + (lastDay.score || 0).toFixed(1) + '</span></span>';
        html += '</div>';
        html += '<div class="pa-card-hint">' + L.pa_source_hint + '</div>';
        html += '</div>';
    }

    // 8. 积分流向（通栏）：桑基图 —— 左列=流入来源（我赢过的对手），右列=流出去向（赢过我的对手）
    if (flow) {
        const skTheme = paChartTheme();
        const net = flow.totalIn - flow.totalOut;
        html += '<div class="pa-card glass-card pa-span-2">';
        html += '<div class="personal-card-header">' + L.pa_flow_title + '</div>';
        html += '<div class="pa-sankey-box"><canvas id="paFlowSankey"></canvas><div class="pa-sankey-tip" role="tooltip"></div></div>';
        html += '<div class="pa-source-strip">';
        html += '<span class="pa-source-chip"><span class="pa-dot" style="background:' + skTheme.win + '"></span><span class="pa-source-name">' + L.pa_flow_in + '</span><span class="pa-text-win">+' + flow.totalIn.toFixed(1) + '</span></span>';
        html += '<span class="pa-source-chip"><span class="pa-dot" style="background:' + skTheme.loss + '"></span><span class="pa-source-name">' + L.pa_flow_out + '</span><span class="pa-text-loss">-' + flow.totalOut.toFixed(1) + '</span></span>';
        if (Math.abs(flow.bonus) >= 0.05) {
            html += '<span class="pa-source-chip">' + L.pa_flow_bonus.replace('{v}', (flow.bonus >= 0 ? '+' : '-') + Math.abs(flow.bonus).toFixed(1)) + '</span>';
        }
        html += '<span class="pa-source-chip pa-source-total">' + L.pa_flow_net + '<span class="' + (net >= 0 ? 'pa-text-win' : 'pa-text-loss') + '">' + (net >= 0 ? '+' : '-') + Math.abs(net).toFixed(1) + '</span></span>';
        html += '</div>';
        html += '<div class="pa-card-hint">' + L.pa_flow_hint + '</div>';
        html += '</div>';
    }

    html += '</div>';
    container.innerHTML = html;

    // 渲染图表
    if (crRadar && typeof crMountAnalyticsRadar === 'function') crMountAnalyticsRadar(playerName, crRadar, crIsWtt);
    if (rankSeries.length >= 2) paRenderRankChart(rankSeries, data.rankBoundaries);
    if (typeStats.length) paRenderTypeChart(typeStats);
    if (gapTotal > 0) paRenderGapChart(gapBands);
    if (monthly && monthly.totals.length) paRenderMonthlyChart(monthly);
    if (matches.length && form.rolling.length >= 2) paRenderFormChart(form);
    if (source.snapshots.length >= 2) paRenderSourceChart(source, data.sourceBoundaries);
    if (flow) paRenderFlowSankey(flow, playerName, { wttMode: crIsWtt });
}

// ---------- 图表渲染 ----------

function paRenderRankChart(series, boundaries) {
    const canvas = document.getElementById('paRankChart');
    if (!canvas) return;
    const t = paChartTheme();
    // WTT 页优先用 WTT 图表设置，俱乐部页用 club 设置，均未加载时用默认色
    const chartCfg = (typeof wttPersonalChartSettings !== 'undefined' && wttPersonalChartSettings)
        ? wttPersonalChartSettings
        : (typeof personalChartSettings !== 'undefined' ? personalChartSettings : null);
    const lineColor = (chartCfg && chartCfg.colors && chartCfg.colors.line) || '#4da3ff';
    paTrackChart(new Chart(canvas, {
        type: 'line',
        data: {
            labels: series.map(s => s.label),
            datasets: [{
                label: i18n[currentLang].pa_rank_axis,
                data: series.map(s => s.rank),
                borderColor: lineColor,
                backgroundColor: paAlpha(lineColor, 0.12),
                borderWidth: 2,
                pointBackgroundColor: lineColor,
                pointRadius: 3,
                pointHoverRadius: 6,
                tension: 0.3,
                fill: true
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: { intersect: false, mode: 'index' },
            plugins: {
                legend: { display: false },
                tooltip: Object.assign({}, t.tooltip, {
                    callbacks: {
                        label: function(item) {
                            const s = series[item.dataIndex];
                            return i18n[currentLang].pa_rank_axis + ': #' + s.rank;
                        }
                    }
                })
            },
            scales: {
                x: {
                    grid: { color: t.grid },
                    ticks: { color: t.text, font: { size: 10 }, maxRotation: 45, autoSkip: true, maxTicksLimit: 12 }
                },
                y: {
                    reverse: true,
                    min: 1,
                    grid: { color: t.grid },
                    ticks: { color: t.text, font: { size: 11 }, precision: 0, callback: v => '#' + v }
                }
            }
        },
        plugins: [createSeasonBoundaryPlugin(series, t.isDark, boundaries)]
    }));
}

// 环形图中心文字插件
function paDoughnutCenterPlugin(total, unit, color) {
    return {
        id: 'paDoughnutCenter',
        afterDraw(chart) {
            if (chart.config.type !== 'doughnut') return;
            const { ctx, chartArea } = chart;
            const x = (chartArea.left + chartArea.right) / 2;
            const y = (chartArea.top + chartArea.bottom) / 2;
            ctx.save();
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillStyle = color;
            ctx.font = '700 22px "Poppins", "Microsoft YaHei", sans-serif';
            ctx.fillText(String(total), x, y - 8);
            ctx.font = '11px "Poppins", "Microsoft YaHei", sans-serif';
            ctx.fillText(unit, x, y + 13);
            ctx.restore();
        }
    };
}

function paRenderTypeChart(typeStats) {
    const canvas = document.getElementById('paTypeChart');
    if (!canvas) return;
    const t = paChartTheme();
    const total = typeStats.reduce((s, x) => s + x.total, 0);
    paTrackChart(new Chart(canvas, {
        type: 'doughnut',
        data: {
            labels: typeStats.map(x => x.type),
            datasets: [{
                data: typeStats.map(x => x.total),
                backgroundColor: typeStats.map((x, i) => paTypeColor(x.type, i)),
                borderColor: t.isDark ? '#1e2230' : '#ffffff',
                borderWidth: 2,
                hoverOffset: 6
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            cutout: '62%',
            plugins: {
                legend: { display: false },
                tooltip: Object.assign({}, t.tooltip, {
                    callbacks: {
                        label: function(item) {
                            const s = typeStats[item.dataIndex];
                            const rate = s.total ? Math.round(s.wins / s.total * 100) : 0;
                            return i18n[currentLang].pa_type_wr.replace('{r}', rate) + ' (' + s.wins + '-' + (s.total - s.wins) + ')';
                        }
                    }
                })
            }
        },
        plugins: [paDoughnutCenterPlugin(total, i18n[currentLang].pa_type_center_unit, t.text)]
    }));
}

function paRenderGapChart(bands) {
    const canvas = document.getElementById('paGapChart');
    if (!canvas) return;
    const t = paChartTheme();
    const L = i18n[currentLang];
    // 显示顺序：领先≥100 在最上，落后≥100 在最下
    const ordered = [...bands].reverse();
    const labels = ordered.map((_, i) => paGapBandLabel(PA_GAP_BANDS[PA_GAP_BANDS.length - 1 - i].labelKey));
    paTrackChart(new Chart(canvas, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [
                {
                    label: L.pa_gap_wins,
                    data: ordered.map(b => b.wins),
                    backgroundColor: paAlpha(t.win, 0.75),
                    borderRadius: 3,
                    barPercentage: 0.72
                },
                {
                    label: L.pa_gap_losses,
                    data: ordered.map(b => -b.losses),
                    backgroundColor: paAlpha(t.loss, 0.75),
                    borderRadius: 3,
                    barPercentage: 0.72
                }
            ]
        },
        options: {
            indexAxis: 'y',
            responsive: true,
            maintainAspectRatio: false,
            interaction: { intersect: false, mode: 'index' },
            plugins: {
                legend: {
                    display: true,
                    position: 'top',
                    labels: { color: t.text, boxWidth: 12, boxHeight: 12, font: { size: 11 } }
                },
                tooltip: Object.assign({}, t.tooltip, {
                    displayColors: true,
                    callbacks: {
                        label: function(item) {
                            const band = ordered[item.dataIndex];
                            const total = band.wins + band.losses;
                            const rate = total ? Math.round(band.wins / total * 100) : 0;
                            if (item.datasetIndex === 0) return L.pa_gap_wins + ': ' + band.wins;
                            return L.pa_gap_losses + ': ' + band.losses;
                        },
                        afterBody: function(items) {
                            const band = ordered[items[0].dataIndex];
                            const total = band.wins + band.losses;
                            if (!total) return '';
                            return L.pa_gap_wr.replace('{r}', Math.round(band.wins / total * 100));
                        }
                    }
                })
            },
            scales: {
                x: {
                    stacked: true,
                    grid: { color: t.grid },
                    ticks: { color: t.text, font: { size: 10 }, precision: 0, callback: v => Math.abs(v) }
                },
                y: {
                    stacked: true,
                    grid: { display: false },
                    ticks: { color: t.text, font: { size: 10 } }
                }
            }
        }
    }));
}

function paRenderMonthlyChart(monthly) {
    const canvas = document.getElementById('paMonthlyChart');
    if (!canvas) return;
    const t = paChartTheme();
    const L = i18n[currentLang];
    paTrackChart(new Chart(canvas, {
        type: 'bar',
        data: {
            labels: monthly.labels.map(paFormatMonth),
            datasets: [
                {
                    type: 'bar',
                    label: L.pa_monthly_matches,
                    data: monthly.totals,
                    backgroundColor: paAlpha('#4da3ff', 0.55),
                    borderRadius: 4,
                    yAxisID: 'y'
                },
                {
                    type: 'line',
                    label: L.pa_monthly_winrate,
                    data: monthly.rates,
                    borderColor: t.win,
                    backgroundColor: t.win,
                    borderWidth: 2,
                    pointRadius: 2.5,
                    pointHoverRadius: 5,
                    tension: 0.3,
                    spanGaps: true,
                    yAxisID: 'y1'
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: { intersect: false, mode: 'index' },
            plugins: {
                legend: {
                    display: true,
                    position: 'top',
                    labels: { color: t.text, boxWidth: 12, boxHeight: 12, font: { size: 11 } }
                },
                tooltip: Object.assign({}, t.tooltip, {
                    displayColors: true,
                    callbacks: {
                        label: function(item) {
                            if (item.datasetIndex === 0) return L.pa_monthly_matches + ': ' + item.parsed.y;
                            return L.pa_monthly_winrate + ': ' + item.parsed.y + '%';
                        }
                    }
                })
            },
            scales: {
                x: {
                    grid: { color: t.grid },
                    ticks: { color: t.text, font: { size: 10 }, maxRotation: 45, autoSkip: true, maxTicksLimit: 16 }
                },
                y: {
                    beginAtZero: true,
                    grid: { color: t.grid },
                    ticks: { color: t.text, font: { size: 10 }, precision: 0 }
                },
                y1: {
                    position: 'right',
                    min: 0,
                    max: 100,
                    grid: { drawOnChartArea: false },
                    ticks: { color: t.text, font: { size: 10 }, callback: v => v + '%' }
                }
            }
        }
    }));
}

function paRenderFormChart(form) {
    const canvas = document.getElementById('paFormChart');
    if (!canvas) return;
    const t = paChartTheme();
    const rolling = form.rolling;
    paTrackChart(new Chart(canvas, {
        type: 'line',
        data: {
            labels: rolling.map(r => r.date),
            datasets: [{
                data: rolling.map(r => r.rate),
                borderColor: t.win,
                backgroundColor: paAlpha(t.win, 0.12),
                borderWidth: 2,
                pointRadius: 0,
                pointHoverRadius: 4,
                tension: 0.3,
                fill: true
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: { intersect: false, mode: 'index' },
            plugins: {
                legend: { display: false },
                tooltip: Object.assign({}, t.tooltip, {
                    callbacks: {
                        title: items => paShortDate(rolling[items[0].dataIndex].date),
                        label: item => i18n[currentLang].pa_form_rolling + ': ' + item.parsed.y + '%'
                    }
                })
            },
            scales: {
                x: { display: false },
                y: {
                    min: 0,
                    max: 100,
                    grid: {
                        color: ctx => ctx.tick && ctx.tick.value === 50
                            ? (t.isDark ? 'rgba(255,255,255,0.25)' : 'rgba(0,0,0,0.2)')
                            : t.grid
                    },
                    ticks: { color: t.text, font: { size: 9 }, stepSize: 50, callback: v => v + '%' }
                }
            }
        }
    }));
}

// 积分来源构成中基准分层的固定颜色
const PA_BASELINE_COLOR = '#8a90a0';

function paRenderSourceChart(source, boundaries) {
    const canvas = document.getElementById('paSourceChart');
    if (!canvas) return;
    const t = paChartTheme();
    // 堆叠面积图：Chart.js 原生 stacked 对负值层会分堆到零轴以下，无法保证堆顶 = 积分曲线，
    // 因此这里自行计算累计堆叠位置：数据集 k 直接存「前 k 层之和」，fill 指向上一层。
    // 各层线条自下而上相加，顶层恒等于当日积分，与衰减/赛季继承/负值无关。
    const snapshots = source.snapshots;
    const layers = [{
        label: i18n[currentLang].pa_source_baseline,
        color: PA_BASELINE_COLOR,
        alpha: 0.30,
        values: snapshots.map(s => s.baseline || 0)
    }];
    source.types.forEach((key, i) => {
        layers.push({
            label: paTypeLabel(key),
            color: paTypeColor(key, i),
            alpha: 0.45,
            values: snapshots.map(s => s.typeSums[key] != null ? s.typeSums[key] : 0)
        });
    });
    if (source.hasBonus) {
        layers.push({
            label: paTypeLabel(PA_BONUS_KEY),
            color: paTypeColor(PA_BONUS_KEY, 0),
            alpha: 0.45,
            values: snapshots.map(s => s.typeSums[PA_BONUS_KEY] != null ? s.typeSums[PA_BONUS_KEY] : 0)
        });
    }
    const cum = [];
    layers.forEach((layer, k) => {
        if (k === 0) { cum.push(layer.values.slice()); return; }
        cum.push(layer.values.map((v, i) => cum[k - 1][i] + v));
    });
    const datasets = layers.map((layer, k) => ({
        label: layer.label,
        data: cum[k],
        borderColor: layer.color,
        backgroundColor: paAlpha(layer.color, layer.alpha),
        borderWidth: 1,
        pointRadius: 0,
        pointHoverRadius: 0,
        tension: 0.15,
        fill: k === 0 ? 'origin' : k - 1
    }));
    // 叠加积分变化曲线（粗黑线）：与积分趋势图同源的权威参照，
    // 各层堆叠的顶层轮廓应与其完全重合，肉眼即可校验"堆叠总和 = 积分曲线"
    const scoreIdx = datasets.length;
    datasets.push({
        label: i18n[currentLang].pa_source_total,
        data: snapshots.map(s => s.score || 0),
        borderColor: t.isDark ? '#e4e6ed' : '#1a1a2e',
        backgroundColor: 'transparent',
        borderWidth: 3.5,
        pointRadius: 0,
        pointHoverRadius: 3,
        tension: 0.15,
        fill: false,
        // 更小的 order = 绘制在最上层，且图例中排在首位
        order: -1
    });
    paTrackChart(new Chart(canvas, {
        type: 'line',
        data: {
            labels: snapshots.map(s => s.label || s.time),
            datasets: datasets
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: { intersect: false, mode: 'index' },
            plugins: {
                legend: {
                    display: true,
                    position: 'top',
                    labels: { color: t.text, boxWidth: 12, boxHeight: 12, font: { size: 11 } }
                },
                tooltip: Object.assign({}, t.tooltip, {
                    displayColors: true,
                    // 积分总曲线不在逐层明细中重复展示，另见 afterBody
                    filter: function(item) { return item.datasetIndex < scoreIdx; },
                    callbacks: {
                        title: items => paShortDate(snapshots[items[0].dataIndex].time),
                        label: function(item) {
                            const k = item.datasetIndex;
                            if (k >= layers.length) {
                                return i18n[currentLang].pa_source_total + ': ' + (snapshots[item.dataIndex].score || 0).toFixed(1);
                            }
                            // 显示该层自身的贡献 = 累计值 − 上一层累计值
                            const v = k === 0 ? item.parsed.y : cum[k][item.dataIndex] - cum[k - 1][item.dataIndex];
                            const sign = v >= 0 ? '+' : '';
                            return item.dataset.label + ': ' + (k === 0 ? '' : sign) + v.toFixed(1);
                        },
                        afterBody: function(items) {
                            const day = snapshots[items[0].dataIndex];
                            return i18n[currentLang].pa_source_total + ': ' + (day.score || 0).toFixed(1);
                        }
                    }
                })
            },
            scales: {
                x: {
                    grid: { color: t.grid },
                    ticks: { color: t.text, font: { size: 10 }, maxRotation: 45, autoSkip: true, maxTicksLimit: 12 }
                },
                y: {
                    beginAtZero: false,
                    grid: { color: t.grid },
                    ticks: { color: t.text, font: { size: 10 } }
                }
            }
        },
        plugins: [createSeasonBoundaryPlugin(snapshots, t.isDark, boundaries)]
    }));
}

// ---------- 积分流向桑基图（手绘 canvas，无第三方依赖；club / WTT 双模式通用） ----------
// 左列 = 流入来源（我赢过的对手，流带宽度 = 从该对手处赢得的衰减后积分合计）
// 中列 = 本人节点；右列 = 流出去向（赢过我的对手，流带宽度 = 输给该对手的衰减后积分合计）。
// 每个对手的流值恒等于比赛明细表中该对手各行「调整」列之和。本人节点占满绘图高度，
// 小的一侧下方留白即净盈余。交互：悬停高亮 + 浮动 tooltip；点击对手跳其档案页。
// 动效：入场时流带从对手端向本人节点错峰「接通」（裁剪擦除），随后常驻流光粒子沿
// 流带中心线定向流动（离屏 / 后台标签页 / prefers-reduced-motion 时自动停）。

const PA_FLOW_MAX_NODES = 8;    // 每侧最多展开的对手数，其余合并为「其他」
const PA_FLOW_MIN_NODE_H = 10;  // 节点最小可读高度（px）
const PA_FLOW_NODE_W = 13;      // 对手节点条宽（px）
const PA_FLOW_GAP = 4;          // 相邻节点间距（px）
const PA_FLOW_HOVER_MS = 180;   // 悬停高亮/淡出的过渡时长
const PA_FLOW_ENTRY_MS = 560;   // 入场动画单体时长
const PA_FLOW_ENTRY_STAGGER = 45; // 入场逐节点错峰间隔
const PA_FLOW_TRAVERSE_MS = 2600; // 流光粒子横穿一条流带的基准耗时

const PA_FLOW_EASE = t => 1 - Math.pow(1 - Math.max(0, Math.min(1, t)), 3); // ease-out-cubic

let paFlowState = null;         // { flow, playerName, wttMode, hover, geom, anim }
let paFlowResizeBound = false;
let paFlowResizeTimer = null;
let paFlowThemeObserver = null;
let paFlowRaf = 0;
let paFlowEntryKey = null;      // 上次播放入场动画的 球员|语言，避免语言切换反复重播
let paFlowInView = true;        // 画布是否在视口内（IntersectionObserver 维护；离屏即停流光循环）
let paFlowIo = null;
let paFlowIoCanvas = null;

function paFlowPrefersReducedMotion() {
    try { return !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches); }
    catch (e) { return false; }
}

function paFlowCssVar(name, fallback) {
    try {
        const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
        return v || fallback;
    } catch (e) { return fallback; }
}

// 对手档案页地址（查不到档案返回 null → 节点不可点击）
function paFlowOppUrl(opp, wttMode) {
    try {
        if (wttMode) return (typeof wttPlayerPageUrl === 'function') ? wttPlayerPageUrl(opp) : null;
        const p = (typeof getPlayerByName === 'function') ? getPlayerByName(opp) : null;
        return (p && p.uid != null) ? 'player.html?uid=' + encodeURIComponent(String(p.uid)) : null;
    } catch (e) { return null; }
}

function paFlowLabel(name) {
    return (typeof playerDisplayName === 'function') ? playerDisplayName(name) : String(name);
}

// 每侧布局：按流值降序取前 PA_FLOW_MAX_NODES 个，其余合并为「其他」节点（ref=null，不可点击）
function paFlowLayoutSide(opps, valueKey) {
    const sorted = opps.filter(s => s[valueKey] > 0).sort((a, b) => b[valueKey] - a[valueKey]);
    const nodes = sorted.slice(0, PA_FLOW_MAX_NODES)
        .map(s => ({ key: s.opp, label: paFlowLabel(s.opp), value: s[valueKey], ref: s }));
    const rest = sorted.slice(PA_FLOW_MAX_NODES);
    if (rest.length) {
        nodes.push({
            key: '__others__',
            label: i18n[currentLang].pa_flow_others.replace('{n}', rest.length),
            value: rest.reduce((a, s) => a + s[valueKey], 0),
            ref: null
        });
    }
    return nodes;
}

function paFlowEllipsis(ctx, text, maxW) {
    if (maxW <= 0 || ctx.measureText(text).width <= maxW) return text;
    while (text.length > 1 && ctx.measureText(text + '…').width > maxW) text = text.slice(0, -1);
    return text + '…';
}

function paFlowRoundRect(ctx, x, y, w, h, r) {
    const rr = Math.max(0, Math.min(r, w / 2, h / 2));
    ctx.beginPath();
    ctx.moveTo(x + rr, y);
    ctx.arcTo(x + w, y, x + w, y + h, rr);
    ctx.arcTo(x + w, y + h, x, y + h, rr);
    ctx.arcTo(x, y + h, x, y, rr);
    ctx.arcTo(x, y, x + w, y, rr);
    ctx.closePath();
}

// 颜色 → [r,g,b]，支持 #rgb / #rrggbb / rgb(...)（CSS 变量可能给出场RGB形式）
function paFlowRgb(color) {
    const s = String(color).trim();
    if (s.charAt(0) === '#') {
        const h = s.slice(1);
        if (h.length === 3) return [parseInt(h.charAt(0) + h.charAt(0), 16), parseInt(h.charAt(1) + h.charAt(1), 16), parseInt(h.charAt(2) + h.charAt(2), 16)];
        return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
    }
    const m = s.match(/\d+(\.\d+)?/g);
    return m ? [Number(m[0]), Number(m[1] || 0), Number(m[2] || 0)] : [59, 130, 246];
}

// 两色线性插值 + 透明度（流带双色渐变 / 粒子提亮用）
function paFlowMixA(c1, c2, t, a) {
    const p = paFlowRgb(c1), q = paFlowRgb(c2);
    const k = Math.max(0, Math.min(1, t));
    return 'rgba(' + Math.round(p[0] + (q[0] - p[0]) * k) + ',' + Math.round(p[1] + (q[1] - p[1]) * k) + ',' + Math.round(p[2] + (q[2] - p[2]) * k) + ',' + a + ')';
}

// 流带中心线取点（控制点同 ribbonPath），流光粒子沿它行进；本图两端同高，曲线退化为水平线
function paFlowBezierAt(x1, yc1, x2, yc2, t) {
    const cx = (x1 + x2) / 2, mt = 1 - t, a = mt * mt * mt, b = 3 * mt * mt * t, c = 3 * mt * t * t, d = t * t * t;
    return { x: a * x1 + (b + c) * cx + d * x2, y: a * yc1 + b * yc1 + c * yc2 + d * yc2 };
}

function paDrawFlowSankey() {
    const canvas = document.getElementById('paFlowSankey');
    if (!canvas || !paFlowState || !paFlowState.flow) return;
    const host = canvas.parentNode;
    const W = host.clientWidth, H = host.clientHeight;
    if (W < 60 || H < 60) return;
    const dpr = window.devicePixelRatio || 1;
    const bw = Math.round(W * dpr), bh = Math.round(H * dpr);
    if (canvas.width !== bw || canvas.height !== bh) { canvas.width = bw; canvas.height = bh; }
    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);

    const { flow, playerName } = paFlowState;
    const hover = paFlowState.hover || null; // 目标态快照 {kind, key}；过渡期间与 anim.hoverFrom 插值
    const th = paChartTheme();
    const L = i18n[currentLang];
    const accent = paFlowCssVar('--primary-blue', th.isDark ? '#5aa2ff' : '#3b82f6');
    const strongC = paFlowCssVar('--text-primary', th.isDark ? '#e4e6ed' : '#1a1a2e');
    const mutedC = paFlowCssVar('--text-muted', th.isDark ? '#8b90a0' : '#94a3b8');
    const family = getComputedStyle(document.body).fontFamily || 'sans-serif';
    const compact = W < 560;
    const nameFont = (compact ? 11 : 12) + 'px ' + family;
    const valFont = (compact ? 9.5 : 10.5) + 'px ' + family;

    // ---- 动效状态：入场错峰擦除接入 + 悬停 180ms 缓动 + 常驻流光粒子（尊重 prefers-reduced-motion）----
    const anim = paFlowState.anim || {};
    const reduceMotion = paFlowPrefersReducedMotion();
    const now = (typeof performance !== 'undefined' ? performance.now() : Date.now());
    const hoverT = reduceMotion ? 1 : PA_FLOW_EASE((now - (anim.hoverStart || 0)) / PA_FLOW_HOVER_MS);
    const mix = (a, b) => a + (b - a) * hoverT;
    const entryOn = !!anim.entry && !reduceMotion;
    const entryE = idx => entryOn ? PA_FLOW_EASE((now - anim.entry.start - 60 - idx * PA_FLOW_ENTRY_STAGGER) / PA_FLOW_ENTRY_MS) : 1;
    const trunkE = entryOn ? PA_FLOW_EASE((now - anim.entry.start) / PA_FLOW_ENTRY_MS) : 1;
    // 各状态下「对手节点端 / 本人节点端」的流带透明度（ECharts 惯例：基态淡、emphasis 浓、blur 更淡）
    function ribbonAlphas(o, kind, snap) {
        const isH = !!snap && snap.kind === kind && snap.key === o.node.key;
        const dim = !!snap && snap.kind !== 'trunk' && !isH;
        return isH ? { node: 0.85, trunk: 0.5 } : dim ? { node: 0.06, trunk: 0.03 } : { node: 0.42, trunk: 0.18 };
    }
    function nodeAlpha(o, kind, snap) {
        const isH = !!snap && snap.kind === kind && snap.key === o.node.key;
        const dim = !!snap && snap.kind !== 'trunk' && !isH;
        return isH ? 1 : dim ? 0.3 : 0.9;
    }
    function isDim(o, kind, snap) {
        return !!snap && snap.kind !== 'trunk' && !(snap.kind === kind && snap.key === o.node.key);
    }

    // ---- 几何布局 ----
    const inNodes = paFlowLayoutSide(flow.opps, 'inflow');
    const outNodes = paFlowLayoutSide(flow.opps, 'outflow');
    const padTop = 30, padBottom = 6;
    const plotTop = padTop, plotH = H - padTop - padBottom;
    if (plotH < 40) return;
    const trunkW = compact ? 18 : 24;
    const trunkX = (W - trunkW) / 2;
    const scale = plotH / Math.max(flow.totalIn, flow.totalOut, 1e-9);

    // 标签槽宽 = 名字宽 + 数值宽 + 余量，按可用空间钳制
    const signed = (kind, v) => (kind === 'in' ? '+' : '-') + v.toFixed(1);
    ctx.font = valFont;
    let valW = 0;
    for (const n of inNodes) valW = Math.max(valW, ctx.measureText(signed('in', n.value)).width);
    for (const n of outNodes) valW = Math.max(valW, ctx.measureText(signed('out', n.value)).width);
    ctx.font = nameFont;
    let nameWMax = 0;
    for (const n of inNodes.concat(outNodes)) nameWMax = Math.max(nameWMax, ctx.measureText(n.label).width);
    const gutMax = compact ? 110 : 150, gutMin = compact ? 52 : 64;
    const maxGutter = Math.max(30, (W - trunkW) / 2 - PA_FLOW_NODE_W - 28);
    const gutter = Math.max(gutMin, Math.min(gutMax, nameWMax + valW + 16, maxGutter));
    const nodeW = PA_FLOW_NODE_W;
    const lx = gutter + 4;             // 左列节点条 x
    const rx = W - gutter - 4 - nodeW; // 右列节点条 x

    // 节点高度 ∝ 流值（设最小可读高度；放不下时整体等比压缩）
    function stack(nodes) {
        const hs = nodes.map(n => Math.max(n.value * scale, PA_FLOW_MIN_NODE_H));
        const gaps = PA_FLOW_GAP * Math.max(0, nodes.length - 1);
        const sum = hs.reduce((a, b) => a + b, 0);
        if (sum + gaps > plotH && sum > 0) {
            const k = (plotH - gaps) / sum;
            for (let i = 0; i < hs.length; i++) hs[i] *= k;
        }
        let y = plotTop;
        return nodes.map((n, i) => {
            const o = { node: n, y: y, h: hs[i], cy: y + hs[i] / 2, path: null, idx: i };
            y += hs[i] + PA_FLOW_GAP;
            return o;
        });
    }
    const inLaid = stack(inNodes);
    const outLaid = stack(outNodes);
    // 桑基流带与源节点同序同高，直接 attaching 到本人节点两侧的同一纵坐标
    paFlowState.geom = {
        W: W, H: H, dpr: dpr, lx: lx, rx: rx, nodeW: nodeW,
        trunkX: trunkX, trunkW: trunkW, plotTop: plotTop, plotH: plotH,
        inLaid: inLaid, outLaid: outLaid
    };

    // ---- 流带 ----
    function ribbonPath(x1, yc1, h, x2, yc2) {
        const p = new Path2D();
        const hh = h / 2, cx = (x1 + x2) / 2;
        p.moveTo(x1, yc1 - hh);
        p.bezierCurveTo(cx, yc1 - hh, cx, yc2 - hh, x2, yc2 - hh);
        p.lineTo(x2, yc2 + hh);
        p.bezierCurveTo(cx, yc2 + hh, cx, yc1 + hh, x1, yc1 + hh);
        p.closePath();
        return p;
    }
    function drawSide(laid, kind) {
        const baseC = kind === 'in' ? th.win : th.loss;
        const x1 = kind === 'in' ? lx + nodeW : trunkX + trunkW;
        const x2 = kind === 'in' ? trunkX : rx;
        const nodeEnd = kind === 'in' ? 0 : 1; // 渐变 0/1 端中「对手节点」所在端
        for (const o of laid) {
            const e = entryE(o.idx);
            o.path = ribbonPath(x1, o.cy, o.h, x2, o.cy);
            o.rx1 = x1; o.rx2 = x2; // 中心线端点留给流光粒子
            if (e <= 0) continue;
            // 双色渐变（对手语义色 → 本人主题色，ECharts/d3-sankey 惯例）：方向与胜负语义都可读
            const s0 = ribbonAlphas(o, kind, anim.hoverFrom);
            const s1 = ribbonAlphas(o, kind, hover);
            const ea = Math.min(1, e * 1.8); // 擦除扫过的同时颜色基本到位
            const aNode = mix(s0.node, s1.node) * ea;
            const aTrunk = mix(s0.trunk, s1.trunk) * ea;
            const g = ctx.createLinearGradient(x1, 0, x2, 0);
            g.addColorStop(nodeEnd, paFlowMixA(baseC, accent, 0, aNode));
            g.addColorStop(1 - nodeEnd, paFlowMixA(baseC, accent, 0.9, aTrunk));
            // 入场：流带从对手端向本人端逐段「接通」（裁剪擦除），而非整条淡入
            if (entryOn && e < 1) {
                const xe = x1 + (x2 - x1) * e;
                ctx.save();
                ctx.beginPath();
                ctx.rect(Math.min(x1, xe), plotTop - 6, Math.max(1, Math.abs(xe - x1)), plotH + 12);
                ctx.clip();
                ctx.fillStyle = g;
                ctx.fill(o.path);
                ctx.restore();
            } else {
                ctx.fillStyle = g;
                ctx.fill(o.path);
            }
        }
    }
    drawSide(inLaid, 'in');
    drawSide(outLaid, 'out');

    // ---- 流光粒子：沿流带中心线从对手端流向本人端（流入）或反向（流出），方向即积分流向 ----
    // 相位是 now 的纯函数（无累计状态），重排 / 切主题 / 回后台再回前台都不漂移。
    function drawParticles(laid, kind) {
        if (reduceMotion) return;
        const baseC = kind === 'in' ? th.win : th.loss;
        const litC = '#ffffff';
        for (const o of laid) {
            const e = entryE(o.idx);
            if (e < 0.55 || !o.path) continue;
            const s0 = ribbonAlphas(o, kind, anim.hoverFrom);
            const s1 = ribbonAlphas(o, kind, hover);
            const emph = Math.max(0, Math.min(2, mix(s0.node, s1.node) / 0.42)); // 基态 1 / 悬停≈2 / 淡出→0
            const a = 0.4 * emph * Math.min(1, (e - 0.55) / 0.45);
            if (a <= 0.015) continue;
            const r = Math.max(1.1, Math.min(2.6, o.h * 0.13));
            const cnt = o.h >= 30 ? 3 : o.h >= 15 ? 2 : 1;
            ctx.save();
            ctx.clip(o.path);
            for (let k = 0; k < cnt; k++) {
                const seed = (o.idx * 0.618 + (kind === 'in' ? 0.13 : 0.71) + k * 0.377) % 1;
                const trav = PA_FLOW_TRAVERSE_MS * (0.85 + 0.3 * ((seed * 7.31) % 1));
                const t = ((now + seed * trav) / trav) % 1;
                const head = paFlowBezierAt(o.rx1, o.cy, o.rx2, o.cy, t);
                const tail = paFlowBezierAt(o.rx1, o.cy, o.rx2, o.cy, Math.max(0, t - 0.055));
                // 彗尾（圆头短线）+ 亮核，颜色向白提亮保证明暗两主题下都可见
                ctx.strokeStyle = paFlowMixA(baseC, litC, th.isDark ? 0.6 : 0.42, a * 0.55);
                ctx.lineWidth = r * 1.7;
                ctx.lineCap = 'round';
                ctx.beginPath();
                ctx.moveTo(tail.x, tail.y);
                ctx.lineTo(head.x, head.y);
                ctx.stroke();
                ctx.fillStyle = paFlowMixA(baseC, litC, th.isDark ? 0.55 : 0.38, a);
                ctx.beginPath();
                ctx.arc(head.x, head.y, r, 0, Math.PI * 2);
                ctx.fill();
            }
            ctx.restore();
        }
    }
    drawParticles(inLaid, 'in');
    drawParticles(outLaid, 'out');

    // ---- 本人节点（竖向渐变；入场从中心长出，悬停时辉光）----
    if (trunkE > 0) {
        const tw = Math.max(2, trunkW * (entryOn ? 0.35 + 0.65 * trunkE : 1));
        const tx0 = trunkX + (trunkW - tw) / 2;
        ctx.save();
        ctx.globalAlpha = trunkE;
        if (hover && hover.kind === 'trunk') {
            ctx.shadowColor = paAlpha(accent, 0.55);
            ctx.shadowBlur = 18;
        }
        const tg = ctx.createLinearGradient(0, plotTop, 0, plotTop + plotH);
        tg.addColorStop(0, paAlpha(accent, 0.95));
        tg.addColorStop(1, paAlpha(accent, 0.68));
        paFlowRoundRect(ctx, tx0, plotTop, tw, plotH, 5);
        ctx.fillStyle = tg;
        ctx.fill();
        ctx.restore();
    }
    function drawNodes(laid, kind, x) {
        const baseC = kind === 'in' ? th.win : th.loss;
        const growLeft = kind === 'out'; // 增宽一律朝主干一侧，流带接缝不动
        for (const o of laid) {
            const e = entryE(o.idx);
            if (e <= 0) continue;
            const a = mix(nodeAlpha(o, kind, anim.hoverFrom), nodeAlpha(o, kind, hover)) * e;
            const isH = !!hover && hover.kind === kind && hover.key === o.node.key;
            const isH0 = !!anim.hoverFrom && anim.hoverFrom.kind === kind && anim.hoverFrom.key === o.node.key;
            const gw = mix(isH0 ? 3 : 0, isH ? 3 : 0); // 悬停节点微增宽，与流带 180ms 缓动同步
            // 节点纵向微移入场（10px → 0），与流带擦除错峰呼应
            const dy = entryOn ? (1 - e) * 10 : 0;
            ctx.save();
            if (isH) {
                ctx.shadowColor = paAlpha(baseC, 0.6);
                ctx.shadowBlur = 10;
            }
            const ng = ctx.createLinearGradient(0, o.y + dy, 0, o.y + dy + o.h);
            ng.addColorStop(0, paAlpha(baseC, Math.min(1, a)));
            ng.addColorStop(1, paAlpha(baseC, Math.min(1, a) * 0.74));
            paFlowRoundRect(ctx, growLeft ? x - gw : x, o.y + dy, nodeW + gw, o.h, 3);
            ctx.fillStyle = ng;
            ctx.fill();
            ctx.restore();
        }
    }
    drawNodes(inLaid, 'in', lx);
    drawNodes(outLaid, 'out', rx);

    // ---- 标签（名字 + 带符号数值）----
    ctx.textBaseline = 'middle';
    function drawLabels(laid, kind, x) {
        const valC = kind === 'in' ? th.win : th.loss;
        const right = kind === 'in'; // 左列标签在节点左侧右对齐；右列镜像
        for (const o of laid) {
            const e = entryE(o.idx);
            if (e <= 0) continue;
            const isH = !!hover && hover.kind === kind && hover.key === o.node.key;
            const dim = isDim(o, kind, hover);
            // 标签透明度跟随过渡（淡化态 0.5），颜色取目标态
            const a = mix(isDim(o, kind, anim.hoverFrom) ? 0.5 : 1, dim ? 0.5 : 1) * e;
            const vx = right ? x - 8 : x + nodeW + 8;
            const nx = right ? vx - valW - 6 : vx + valW + 6;
            ctx.font = '600 ' + valFont;
            ctx.textAlign = right ? 'right' : 'left';
            ctx.globalAlpha = a;
            ctx.fillStyle = dim ? mutedC : valC;
            ctx.fillText(signed(kind, o.node.value), vx, o.cy);
            ctx.font = nameFont;
            ctx.fillStyle = dim ? mutedC : (isH ? strongC : th.text);
            ctx.fillText(paFlowEllipsis(ctx, o.node.label, gutter - valW - 16), nx, o.cy);
            ctx.globalAlpha = 1;
        }
    }
    drawLabels(inLaid, 'in', lx);
    drawLabels(outLaid, 'out', rx);

    // ---- 空侧提示 ----
    ctx.font = (compact ? 10 : 11) + 'px ' + family;
    ctx.textAlign = 'center';
    ctx.globalAlpha = trunkE;
    ctx.fillStyle = mutedC;
    if (!inLaid.length) ctx.fillText(L.pa_flow_empty_in, (lx + trunkX) / 2, plotTop + plotH / 2);
    if (!outLaid.length) ctx.fillText(L.pa_flow_empty_out, (trunkX + trunkW + rx) / 2, plotTop + plotH / 2);

    // ---- 列头（色条呼应流入/流出语义色）----
    ctx.font = '700 ' + (compact ? 10 : 11) + 'px ' + family;
    ctx.fillStyle = mutedC;
    ctx.fillText(L.pa_flow_in, lx + nodeW / 2, padTop - 13);
    ctx.fillText(L.pa_flow_out, rx + nodeW / 2, padTop - 13);
    ctx.fillStyle = paAlpha(th.win, 0.9);
    ctx.fillRect(lx + nodeW / 2 - 9, padTop - 6, 18, 2);
    ctx.fillStyle = paAlpha(th.loss, 0.9);
    ctx.fillRect(rx + nodeW / 2 - 9, padTop - 6, 18, 2);
    ctx.font = '700 ' + (compact ? 12 : 13) + 'px ' + family;
    ctx.fillStyle = strongC;
    ctx.globalAlpha = trunkE;
    ctx.fillText(paFlowEllipsis(ctx, paFlowLabel(playerName), Math.min(260, W * 0.5)), W / 2, padTop - 12);
    ctx.globalAlpha = 1;
}

// ---- 交互（几何状态来自 paDrawFlowSankey 保存的 paFlowState.geom）----

function paFlowHitTest(mx, my) {
    const g = paFlowState && paFlowState.geom;
    const canvas = document.getElementById('paFlowSankey');
    if (!g || !canvas) return null;
    // 节点条优先（视觉最上层），然后本人节点，最后流带
    const sides = [['in', g.inLaid, g.lx], ['out', g.outLaid, g.rx]];
    for (const s of sides) {
        for (const o of s[1]) {
            if (mx >= s[2] && mx <= s[2] + g.nodeW && my >= o.y && my <= o.y + o.h) {
                return { kind: s[0], node: o.node, laid: o };
            }
        }
    }
    if (mx >= g.trunkX && mx <= g.trunkX + g.trunkW && my >= g.plotTop && my <= g.plotTop + g.plotH) {
        return { kind: 'trunk', node: null, laid: null };
    }
    // 流带：Path2D 命中检测需在绘制变换（dpr 缩放）下以设备坐标传点
    const ctx = canvas.getContext('2d');
    ctx.save();
    ctx.setTransform(g.dpr, 0, 0, g.dpr, 0, 0);
    let hit = null;
    outer: for (const s of sides) {
        for (const o of s[1]) {
            if (o.path && ctx.isPointInPath(o.path, mx * g.dpr, my * g.dpr)) {
                hit = { kind: s[0], node: o.node, laid: o };
                break outer;
            }
        }
    }
    ctx.restore();
    return hit;
}

function paFlowHideTip() {
    const tip = document.querySelector('#paFlowSankey ~ .pa-sankey-tip');
    if (tip) tip.classList.remove('show');
}

function paFlowShowTip(hit, mx, my) {
    const g = paFlowState && paFlowState.geom;
    const canvas = document.getElementById('paFlowSankey');
    const tip = canvas ? canvas.parentNode.querySelector('.pa-sankey-tip') : null;
    if (!g || !tip) return;
    const L = i18n[currentLang];
    const flow = paFlowState.flow, playerName = paFlowState.playerName;
    let html = '';
    if (hit.kind === 'trunk') {
        const net = flow.totalIn - flow.totalOut;
        html += '<div class="pa-sk-tip-title">' + escapeHtml(paFlowLabel(playerName)) + '</div>';
        html += '<div class="pa-sk-tip-line">' + L.pa_flow_tip_in_sum.replace('{v}', flow.totalIn.toFixed(1)) + '</div>';
        html += '<div class="pa-sk-tip-line">' + L.pa_flow_tip_out_sum.replace('{v}', flow.totalOut.toFixed(1)) + '</div>';
        html += '<div class="pa-sk-tip-line">' + L.pa_flow_net + ' ' + (net >= 0 ? '+' : '-') + Math.abs(net).toFixed(1) + '</div>';
    } else {
        const n = hit.node;
        html += '<div class="pa-sk-tip-title">' + escapeHtml(n.label) + '</div>';
        if (n.ref) {
            html += '<div class="pa-sk-tip-line">' + L.pa_flow_tip_wl.replace('{w}', n.ref.wins).replace('{l}', n.ref.losses) + '</div>';
            html += '<div class="pa-sk-tip-line">' + (hit.kind === 'in' ? L.pa_flow_tip_in : L.pa_flow_tip_out).replace('{v}', n.value.toFixed(1)) + '</div>';
            if (n.ref.lastDate) html += '<div class="pa-sk-tip-line">' + L.pa_flow_tip_last.replace('{d}', escapeHtml(n.ref.lastDate)) + '</div>';
        } else {
            html += '<div class="pa-sk-tip-line">' + (hit.kind === 'in' ? L.pa_flow_tip_in : L.pa_flow_tip_out).replace('{v}', n.value.toFixed(1)) + '</div>';
        }
    }
    tip.innerHTML = html;
    tip.classList.add('show');
    const tw = tip.offsetWidth, thh = tip.offsetHeight;
    let tx = mx + 14, ty = my - thh / 2;
    if (tx + tw > g.W - 4) tx = mx - tw - 14;
    if (tx < 4) tx = 4;
    if (ty + thh > g.H - 4) ty = g.H - thh - 4;
    if (ty < 4) ty = 4;
    tip.style.left = tx + 'px';
    tip.style.top = ty + 'px';
}

// ---- 动效驱动：rAF 循环重绘；入场/悬停过渡结束后由流光粒子接管（画布在视口内时），全部条件不满足即停 ----

// 流光粒子是否继续驱动重绘：离屏 / 后台标签页 / 减少动态 / 画布已卸载 时停表省电
function paFlowParticlesWanted() {
    if (!paFlowInView || typeof requestAnimationFrame !== 'function' || document.hidden) return false;
    if (paFlowPrefersReducedMotion()) return false;
    return !!paFlowState && !!document.getElementById('paFlowSankey');
}

function paFlowTick() {
    paFlowRaf = 0;
    const st = paFlowState;
    if (!st || !st.anim) return;
    const now = (typeof performance !== 'undefined' ? performance.now() : Date.now());
    const maxStagger = 60 + 2 * (PA_FLOW_MAX_NODES + 1) * PA_FLOW_ENTRY_STAGGER;
    if (st.anim.entry && now - st.anim.entry.start > maxStagger + PA_FLOW_ENTRY_MS) st.anim.entry = null;
    if (st.anim.hoverStart && now - st.anim.hoverStart >= PA_FLOW_HOVER_MS) st.anim.hoverStart = 0;
    paDrawFlowSankey();
    if (st.anim.entry || st.anim.hoverStart || paFlowParticlesWanted()) {
        paFlowRaf = requestAnimationFrame(paFlowTick);
    }
}

function paFlowRepaint() {
    if (paFlowPrefersReducedMotion() || typeof requestAnimationFrame !== 'function') {
        // 减少动态：跳过过渡，直接落到最终态
        if (paFlowState && paFlowState.anim) { paFlowState.anim.entry = null; paFlowState.anim.hoverStart = 0; }
        paDrawFlowSankey();
        return;
    }
    if (paFlowRaf) return;
    paFlowRaf = requestAnimationFrame(paFlowTick);
}

function paRenderFlowSankey(flow, playerName, opts) {
    opts = opts || {};
    const entryKey = playerName; // 同一球员只播一次入场；语言切换整页重渲不重播
    const doEntry = entryKey !== paFlowEntryKey;
    paFlowEntryKey = entryKey;
    paFlowState = {
        flow: flow, playerName: playerName, wttMode: !!opts.wttMode,
        hover: null, geom: null,
        anim: { entry: doEntry ? { start: (typeof performance !== 'undefined' ? performance.now() : Date.now()) } : null, hoverFrom: null, hoverStart: 0 }
    };
    paDrawFlowSankey();
    paFlowRepaint();
    // 兜底：页面在后台时 rAF 会被暂停，超时后直接落到最终态，
    // 避免用户切回标签页时看到停留在半程的空帧
    setTimeout(function () {
        if (paFlowState && paFlowState.anim && paFlowState.anim.entry) {
            paFlowState.anim.entry = null;
            paDrawFlowSankey();
        }
    }, 2600);
    const canvas = document.getElementById('paFlowSankey');
    if (canvas) {
        canvas.addEventListener('mousemove', function (e) {
            if (!paFlowState || !paFlowState.geom) return;
            const r = canvas.getBoundingClientRect();
            const mx = e.clientX - r.left, my = e.clientY - r.top;
            const hit = paFlowHitTest(mx, my);
            const newKey = hit ? hit.kind + '\u0000' + (hit.node ? hit.node.key : '') : '';
            const oldKey = paFlowState.hover ? paFlowState.hover.kind + '\u0000' + (paFlowState.hover.key || '') : '';
            if (newKey !== oldKey) {
                // 高亮/淡出走 180ms 缓动，而非瞬时切换
                paFlowState.anim.hoverFrom = paFlowState.hover;
                paFlowState.hover = hit ? { kind: hit.kind, key: hit.node ? hit.node.key : null } : null;
                paFlowState.anim.hoverStart = (typeof performance !== 'undefined' ? performance.now() : Date.now());
                paFlowRepaint();
            }
            const clickable = hit && hit.node && hit.node.ref && paFlowOppUrl(hit.node.ref.opp, paFlowState.wttMode);
            canvas.style.cursor = clickable ? 'pointer' : 'default';
            if (hit) paFlowShowTip(hit, mx, my); else paFlowHideTip();
        });
        canvas.addEventListener('mouseleave', function () {
            if (!paFlowState) return;
            if (paFlowState.hover) {
                paFlowState.anim.hoverFrom = paFlowState.hover;
                paFlowState.anim.hoverStart = (typeof performance !== 'undefined' ? performance.now() : Date.now());
            }
            paFlowState.hover = null;
            paFlowHideTip();
            paFlowRepaint();
        });
        canvas.addEventListener('click', function (e) {
            if (!paFlowState || !paFlowState.geom) return;
            const r = canvas.getBoundingClientRect();
            const hit = paFlowHitTest(e.clientX - r.left, e.clientY - r.top);
            if (hit && hit.node && hit.node.ref) {
                const url = paFlowOppUrl(hit.node.ref.opp, paFlowState.wttMode);
                if (url) window.location.href = url;
            }
        });
    }
    // 视口外停流光循环，滚回来自动恢复（观察器只绑一次，随重渲换新画布）
    if (!paFlowIo && window.IntersectionObserver) {
        paFlowIo = new IntersectionObserver(function (entries) {
            const vis = entries.some(function (en) { return en.isIntersecting; });
            paFlowInView = vis;
            if (vis) paFlowRepaint();
        }, { threshold: 0.02 });
    }
    if (paFlowIo && canvas) {
        if (paFlowIoCanvas && paFlowIoCanvas !== canvas) paFlowIo.unobserve(paFlowIoCanvas);
        paFlowIo.observe(canvas);
        paFlowIoCanvas = canvas;
    }
    // 容器宽度变了才重画（手机转屏 / 侧栏收起），纯几何调整
    if (!paFlowResizeBound) {
        paFlowResizeBound = true;
        window.addEventListener('resize', function () {
            if (paFlowResizeTimer) clearTimeout(paFlowResizeTimer);
            paFlowResizeTimer = setTimeout(function () {
                const c = document.getElementById('paFlowSankey');
                if (!c || !paFlowState || !paFlowState.geom) return;
                if (Math.abs(c.parentNode.clientWidth - paFlowState.geom.W) < 24) return;
                paDrawFlowSankey();
            }, 160);
        });
    }
    // 主题切换只改 <html> 的 class，画布配色要跟着重画
    if (!paFlowThemeObserver && window.MutationObserver) {
        paFlowThemeObserver = new MutationObserver(function () {
            if (document.getElementById('paFlowSankey') && paFlowState) paDrawFlowSankey();
        });
        paFlowThemeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    }
}
