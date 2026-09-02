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
    return key;
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

// 排名历史：遍历 rankingTimeline 每个节点重算排名（与 getCurrentRank 同口径）
function paBuildRankSeries(playerName) {
    const series = [];
    if (!Array.isArray(rankingTimeline)) return series;
    for (const t of rankingTimeline) {
        if (!t || !t.data || !t.data.length) continue;
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
        case 'lead100': return L.pa_gap_leading + ' ≥100';
        case 'lead50': return L.pa_gap_leading + ' 50–99';
        case 'lead1': return L.pa_gap_leading + ' 1–49';
        case 'behind1': return L.pa_gap_behind + ' 0–49';
        case 'behind50': return L.pa_gap_behind + ' 50–99';
        case 'behind100': return L.pa_gap_behind + ' ≥100';
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

// ---------- HTML 构建 ----------

function renderPlayerAnalytics(playerName, records) {
    const container = document.getElementById('playerAnalyticsBody');
    if (!container) return;
    destroyPlayerAnalytics();

    const all = records || computePlayerMatchRecords(playerName);
    const matches = all.filter(r => !r.isBonus).sort((a, b) => a.date.localeCompare(b.date));
    if (!matches.length && !all.length) { container.innerHTML = ''; return; }

    const rankSeries = paBuildRankSeries(playerName);
    const typeStats = paBuildTypeStats(matches);
    const gapBands = paBuildGapStats(matches);
    const gapTotal = gapBands.reduce((s, b) => s + b.wins + b.losses, 0);
    const monthly = paBuildMonthlyStats(matches);
    const form = paBuildFormStats(matches);
    const seasonRows = paBuildSeasonStats(all);
    // 积分来源构成：与积分趋势图同口径的每日回放（带类型分解）
    const sortedLogDaily = [...scoreLogData].sort((a, b) => a['日期'].localeCompare(b['日期']));
    const startScoresDaily = initialScoresData ? { ...initialScoresData.initialScores } : {};
    const dailyFull = computeDailyScoreHistory(playerName, sortedLogDaily, startScoresDaily, true);
    const source = paBuildSourceFromDaily(dailyFull);

    const L = i18n[currentLang];
    let html = '';
    html += '<div class="pa-section-header">' + L.pa_section_title + '</div>';
    html += '<div class="pa-grid">';

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
            html += '<span class="pa-type-name">' + escapeHtml(String(t.type)) + '</span>';
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
        if (form.last10.length) {
            for (const isWin of form.last10) {
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
            html += '<tr><td>' + escapeHtml(String(r.label)) + '</td><td>' + r.total + '</td><td>' + r.wins + '-' + r.losses + '</td><td>' + (r.rate == null ? '-' : r.rate + '%') + '</td><td class="' + nc + '">' + ns + r.net.toFixed(1) + '</td><td>' + (r.peak == null ? '-' : r.peak.toFixed(1)) + '</td></tr>';
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

    html += '</div>';
    container.innerHTML = html;

    // 渲染图表
    if (rankSeries.length >= 2) paRenderRankChart(rankSeries);
    if (typeStats.length) paRenderTypeChart(typeStats);
    if (gapTotal > 0) paRenderGapChart(gapBands);
    if (monthly && monthly.totals.length) paRenderMonthlyChart(monthly);
    if (matches.length && form.rolling.length >= 2) paRenderFormChart(form);
    if (source.snapshots.length >= 2) paRenderSourceChart(source);
}

// ---------- 图表渲染 ----------

function paRenderRankChart(series) {
    const canvas = document.getElementById('paRankChart');
    if (!canvas) return;
    const t = paChartTheme();
    const lineColor = (personalChartSettings && personalChartSettings.colors && personalChartSettings.colors.line) || '#4da3ff';
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
        plugins: [createSeasonBoundaryPlugin(series, t.isDark)]
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

function paRenderSourceChart(source) {
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
                    callbacks: {
                        title: items => paShortDate(snapshots[items[0].dataIndex].time),
                        label: function(item) {
                            const k = item.datasetIndex;
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
        plugins: [createSeasonBoundaryPlugin(snapshots, t.isDark)]
    }));
}
