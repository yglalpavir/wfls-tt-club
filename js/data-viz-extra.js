/* ========================================
   data-viz-extra.js - 数据可视化扩展板块
   战绩统计 / 效率散点 / 交手热力矩阵 / 比赛频次时间轴 / 积分区间分布
   ======================================== */

let recordBarChart = null, efficiencyScatterChart = null, matchFrequencyChart = null, scoreDistributionChart = null;
let dataVizExtraState = { recordTopN: 10, efficiencyTopN: 15, heatmapTopN: 8, heatmapMode: 'wins', freqBucket: 'week', freqCount: 24, distBins: 10, raceFrameIndex: 0 };

const RECORD_WIN_COLOR = '#52c41a';
const RECORD_LOSS_COLOR = '#ff6b6b';

// ============ 数据辅助 ============

function buildRecordStats(playerNames) {
    const stats = {};
    for (const n of playerNames) stats[n] = { wins: 0, losses: 0, total: 0 };
    if (!scoreLogData) return stats;
    for (const r of scoreLogData) {
        if (!isMatchRecord(r)) continue;
        const w = r['胜者'], l = r['负者'];
        if (w && stats[w]) { stats[w].wins++; stats[w].total++; }
        if (l && stats[l]) { stats[l].losses++; stats[l].total++; }
    }
    return stats;
}

// ============ 初始化 ============

function initDataVizExtra() {
    if (!document.getElementById('recordBarChart')) return;
    if (!rankingTimeline || rankingTimeline.length === 0) return;

    const players = getAllPlayers();
    if (!players.length) return;

    // 默认渲染
    dataVizExtraState.recordTopN = parseInt(document.getElementById('recordTopN')?.value) || 10;
    dataVizExtraState.efficiencyTopN = parseInt(document.getElementById('efficiencyTopN')?.value) || 15;
    dataVizExtraState.heatmapTopN = parseInt(document.getElementById('heatmapTopN')?.value) || 8;
    dataVizExtraState.heatmapMode = document.getElementById('heatmapModeSelect')?.value === 'rate' ? 'rate' : 'wins';
    dataVizExtraState.distBins = parseInt(document.getElementById('distBinCount')?.value) || 10;
    renderRecordBar(dataVizExtraState.recordTopN);
    renderEfficiencyScatter(dataVizExtraState.efficiencyTopN);
    renderH2hHeatmap(dataVizExtraState.heatmapTopN);
    renderMatchFrequency(dataVizExtraState.freqBucket, dataVizExtraState.freqCount);
    renderScoreDistribution(dataVizExtraState.distBins);
    initClubBarRace();

    // 事件监听
    document.getElementById('heatmapModeSelect')?.addEventListener('change', e => {
        dataVizExtraState.heatmapMode = e.target.value === 'rate' ? 'rate' : 'wins';
        renderH2hHeatmap(dataVizExtraState.heatmapTopN);
    });
    document.getElementById('recordTopN')?.addEventListener('change', () => {
        const v = clampInt(document.getElementById('recordTopN').value, 1, 50);
        document.getElementById('recordTopN').value = v;
        dataVizExtraState.recordTopN = v;
        renderRecordBar(v);
    });
    document.getElementById('efficiencyTopN')?.addEventListener('change', () => {
        const v = clampInt(document.getElementById('efficiencyTopN').value, 1, 100);
        document.getElementById('efficiencyTopN').value = v;
        dataVizExtraState.efficiencyTopN = v;
        renderEfficiencyScatter(v);
    });
    document.getElementById('heatmapTopN')?.addEventListener('change', () => {
        const v = clampInt(document.getElementById('heatmapTopN').value, 2, 20);
        document.getElementById('heatmapTopN').value = v;
        dataVizExtraState.heatmapTopN = v;
        renderH2hHeatmap(v);
    });
    document.getElementById('freqBucketSelect')?.addEventListener('change', e => {
        dataVizExtraState.freqBucket = e.target.value;
        renderMatchFrequency(e.target.value, dataVizExtraState.freqCount);
    });
    document.getElementById('freqDataCount')?.addEventListener('change', () => {
        const v = clampInt(document.getElementById('freqDataCount').value, 2, 200);
        document.getElementById('freqDataCount').value = v;
        dataVizExtraState.freqCount = v;
        renderMatchFrequency(dataVizExtraState.freqBucket, v);
    });
    document.getElementById('distBinCount')?.addEventListener('change', () => {
        const v = clampInt(document.getElementById('distBinCount').value, 4, 30);
        document.getElementById('distBinCount').value = v;
        dataVizExtraState.distBins = v;
        renderScoreDistribution(v);
    });
}

function clampInt(v, min, max) {
    let n = parseInt(v);
    if (isNaN(n)) n = min;
    if (n < min) n = min;
    if (n > max) n = max;
    return n;
}

// ============ 战绩统计条形图 ============

function renderRecordBar(topN) {
    const canvas = document.getElementById('recordBarChart');
    if (!canvas) return;
    if (recordBarChart) { recordBarChart.destroy(); recordBarChart = null; }
    const isMobile = window.innerWidth <= 768;
    const allPlayers = getAllPlayers();
    const stats = buildRecordStats(allPlayers);
    const sorted = allPlayers
        .filter(n => stats[n].total > 0)
        .sort((a, b) => stats[b].total - stats[a].total)
        .slice(0, topN);
    if (!sorted.length) return;

    const labels = sorted.map(n => shortenPlayerName(n));
    const wins = sorted.map(n => stats[n].wins);
    const losses = sorted.map(n => stats[n].losses);
    const totals = sorted.map(n => stats[n].total);
    const fullNames = sorted;

    try {
        recordBarChart = new Chart(canvas, {
            type: 'bar',
            data: {
                labels,
                datasets: [
                    { label: i18n[currentLang].data_viz_win, data: wins, backgroundColor: RECORD_WIN_COLOR, borderRadius: 4 },
                    { label: i18n[currentLang].data_viz_loss, data: losses, backgroundColor: RECORD_LOSS_COLOR, borderRadius: 4 }
                ]
            },
            options: {
                responsive: true, maintainAspectRatio: false,
                indexAxis: 'y',
                interaction: { intersect: false, mode: 'index' },
                plugins: {
                    legend: { position: 'bottom', labels: { usePointStyle: true, padding: isMobile ? 10 : 16, font: { size: isMobile ? 10 : 11, family: "'Poppins', sans-serif" }, boxWidth: isMobile ? 11 : 12 } },
                    tooltip: {
                        backgroundColor: 'rgba(26,29,40,0.9)', titleFont: { size: isMobile ? 12 : 13 }, bodyFont: { size: isMobile ? 11 : 12 }, padding: isMobile ? 8 : 12, cornerRadius: 8,
                        callbacks: {
                            title: items => fullNames[items[0]?.dataIndex] || '',
                            label: ctx => `${ctx.dataset.label}: ${ctx.raw}${(i18n[currentLang] || {}).chart_matches_suffix || ' 场'}`
                        }
                    }
                },
                scales: {
                    x: { beginAtZero: true, grid: { color: 'rgba(128,128,128,0.1)' }, ticks: { font: { size: isMobile ? 10 : 11 } }, title: { display: true, text: i18n[currentLang].data_viz_axis_matches, font: { size: isMobile ? 11 : 12 } } },
                    y: { grid: { display: false }, ticks: { font: { size: isMobile ? 10 : 11 } } }
                }
            }
        });
    } catch (err) { console.error('战绩条形图失败', err); }
}

// ============ 效率散点图 ============

function renderEfficiencyScatter(topN) {
    const canvas = document.getElementById('efficiencyScatterChart');
    if (!canvas) return;
    if (efficiencyScatterChart) { efficiencyScatterChart.destroy(); efficiencyScatterChart = null; }
    const isMobile = window.innerWidth <= 768;
    const allPlayers = getAllPlayers();
    const scoreMap = getCurrentSeasonFallbackScores();
    const stats = buildRecordStats(allPlayers);

    const data = allPlayers
        .filter(n => (stats[n] && stats[n].total > 0))
        .sort((a, b) => (scoreMap[b] || 0) - (scoreMap[a] || 0))
        .slice(0, topN)
        .map(n => {
            const st = stats[n];
            const wr = st.total > 0 ? (st.wins / st.total) * 100 : 0;
            const r = Math.max(4, Math.min(26, 4 + (wr / 100) * 22));
            return { x: st.total, y: scoreMap[n] || 0, r, player: n, winRate: Math.round(wr * 10) / 10, form: Math.round(calcFormScore(n) * 10) / 10 };
        });
    if (!data.length) return;

    try {
        efficiencyScatterChart = new Chart(canvas, {
            type: 'bubble',
            data: {
                datasets: [{
                    label: i18n[currentLang].data_viz_axis_players, data,
                    backgroundColor: data.map(() => CHART_COLORS[0] + '50'),
                    borderColor: CHART_COLORS[0], borderWidth: isMobile ? 1 : 1.5,
                    hoverBackgroundColor: CHART_COLORS[0]
                }]
            },
            options: {
                responsive: true, maintainAspectRatio: false,
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        backgroundColor: 'rgba(26,29,40,0.9)', titleFont: { size: isMobile ? 12 : 13 }, bodyFont: { size: isMobile ? 11 : 12 }, padding: isMobile ? 8 : 12, cornerRadius: 8,
                        callbacks: {
                            title: ctx => ctx[0]?.raw?.player || '',
                            label: ctx => {
                                const d = ctx.raw;
                                return [
                                    i18n[currentLang].data_viz_axis_matches + ': ' + d.x,
                                    i18n[currentLang].data_viz_pts_norm + ': ' + d.y,
                                    i18n[currentLang].data_viz_winrate + ': ' + d.winRate + '%',
                                    i18n[currentLang].data_viz_form + ': ' + d.form
                                ].join('  |  ');
                            }
                        }
                    }
                },
                scales: {
                    x: { title: { display: true, text: i18n[currentLang].data_viz_axis_matches, font: { size: isMobile ? 11 : 12 } }, grid: { color: 'rgba(128,128,128,0.1)' }, ticks: { font: { size: isMobile ? 10 : 11 } } },
                    y: { title: { display: true, text: i18n[currentLang].data_viz_pts_norm, font: { size: isMobile ? 11 : 12 } }, grid: { color: 'rgba(128,128,128,0.1)' }, ticks: { font: { size: isMobile ? 10 : 11 } } }
                }
            }
        });
    } catch (err) { console.error('效率散点图失败', err); }
}

// ============ 交手热力矩阵 ============

function renderH2hHeatmap(topN) {
    const container = document.getElementById('h2hHeatmapContainer');
    if (!container) return;
    const allPlayers = getAllPlayers();
    const scoreMap = getCurrentSeasonFallbackScores();
    const sortedPlayers = [...allPlayers].sort((a, b) => (scoreMap[b] || 0) - (scoreMap[a] || 0)).slice(0, topN);
    if (sortedPlayers.length < 2) {
        container.innerHTML = '<div class="compare-placeholder"><p>' + i18n[currentLang].data_viz_no_data + '</p></div>';
        return;
    }

    // 交手矩阵：wins[row][col] = row 球员胜 col 球员的场次（初始化为 0）
    const matrix = {};
    for (const n of sortedPlayers) matrix[n] = {};
    let maxWins = 0, anyMatch = false;
    if (scoreLogData) {
        for (const r of scoreLogData) {
            if (!isMatchRecord(r)) continue;
            const w = r['胜者'], l = r['负者'];
            if (!w || !l || !matrix[w] || !matrix[l]) continue;
            matrix[w][l] = (matrix[w][l] || 0) + 1;
            if (matrix[w][l] > maxWins) maxWins = matrix[w][l];
            anyMatch = true;
        }
    }
    if (!anyMatch) {
        container.innerHTML = '<div class="compare-placeholder"><i class="fa-solid fa-people-arrows"></i><p>' + i18n[currentLang].data_viz_no_h2h + '</p></div>';
        return;
    }
    maxWins = maxWins || 1;
    const rateMode = dataVizExtraState.heatmapMode === 'rate';

    // 列头：正立缩短名，避免竖排导致错位
    const header = sortedPlayers.map(n => `<th class="h2h-col-label" title="${escapeHtml(n)}">${escapeHtml(shortenPlayerName(n))}</th>`).join('');
    let body = '';
    sortedPlayers.forEach(row => {
        body += `<tr><td class="h2h-row-label" title="${escapeHtml(row)}">${escapeHtml(shortenPlayerName(row))}</td>`;
        sortedPlayers.forEach(col => {
            if (row === col) {
                body += `<td class="h2h-cell h2h-diag" title="${escapeHtml(row)}"></td>`;
                return;
            }
            const wins = matrix[row][col] || 0;
            const losses = matrix[col][row] || 0;
            const meets = wins + losses;
            let bg, text, tip;
            if (rateMode) {
                // 胜率模式：以 50% 为分界的红蓝双色标度（蓝=占优，红=劣势）
                if (!meets) {
                    bg = 'rgba(128,128,128,0.06)';
                    text = '-';
                    tip = `${row} → ${col} | ${i18n[currentLang].data_viz_total}: 0`;
                } else {
                    const rate = (wins / meets) * 100;
                    text = Math.round(rate) + '%';
                    if (rate >= 50) {
                        bg = `rgba(77,163,255,${(0.12 + ((rate - 50) / 50) * 0.88).toFixed(2)})`;
                    } else {
                        bg = `rgba(255,107,107,${(0.12 + ((50 - rate) / 50) * 0.88).toFixed(2)})`;
                    }
                    tip = i18n[currentLang].data_viz_heatmap_cell_rate
                        .replace('{winner}', row).replace('{loser}', col).replace('{r}', rate.toFixed(1)).replace('{n}', meets)
                        + ` | ${i18n[currentLang].data_viz_win}: ${wins} | ${i18n[currentLang].data_viz_loss}: ${losses}`;
                }
            } else {
                const alpha = wins / maxWins;
                bg = wins > 0 ? `rgba(77,163,255,${(0.12 + alpha * 0.88).toFixed(2)})` : 'rgba(128,128,128,0.06)';
                text = wins;
                tip = i18n[currentLang].data_viz_heatmap_cell
                    .replace('{winner}', row).replace('{loser}', col).replace('{n}', wins)
                    + ` | ${i18n[currentLang].data_viz_loss}: ${losses} | ${i18n[currentLang].data_viz_total}: ${meets}`;
            }
            body += `<td class="h2h-cell" data-row="${escapeHtml(row)}" data-col="${escapeHtml(col)}" style="background:${bg};" title="${escapeHtml(tip)}">${text}</td>`;
        });
        body += '</tr>';
    });

    // 颜色说明
    const legend = rateMode
        ? `<div class="h2h-legend"><span class="h2h-legend-label">${escapeHtml(i18n[currentLang].data_viz_heatmap_hint_rate)}</span>` +
          `<span class="h2h-legend-bar"><b style="margin-left:0;margin-right:4px;">0%</b><i style="background:rgba(255,107,107,0.9);"></i><i style="background:rgba(255,107,107,0.35);"></i><i style="background:rgba(128,128,128,0.10);"></i><i style="background:rgba(77,163,255,0.35);"></i><i style="background:rgba(77,163,255,0.9);"></i><b>100%</b></span></div>`
        : `<div class="h2h-legend"><span class="h2h-legend-label">${escapeHtml(i18n[currentLang].data_viz_heatmap_hint)}</span>` +
          `<span class="h2h-legend-bar"><i style="background:rgba(128,128,128,0.06);"></i><i style="background:rgba(77,163,255,0.3);"></i><i style="background:rgba(77,163,255,0.6);"></i><i style="background:rgba(77,163,255,0.9);"></i><b>${maxWins}</b></span></div>`;

    container.innerHTML = `<div class="h2h-heatmap-wrapper"><table class="h2h-heatmap-table"><thead><tr><th class="h2h-corner"></th>${header}</tr></thead><tbody>${body}</tbody></table>${legend}</div>`;

    // 悬停高亮镜像格：光标停在 A-B 时，B-A 同样突出
    const tbl = container.querySelector('.h2h-heatmap-table');
    if (tbl) {
        const cellMap = {};
        tbl.querySelectorAll('.h2h-cell[data-row]').forEach(cell => {
            cellMap[cell.getAttribute('data-row') + '\n' + cell.getAttribute('data-col')] = cell;
        });
        const clearMirror = () => {
            const prev = tbl.querySelector('.h2h-mirror-hover');
            if (prev) prev.classList.remove('h2h-mirror-hover');
        };
        tbl.addEventListener('mouseover', (e) => {
            clearMirror();
            const cell = e.target.closest('.h2h-cell[data-row]');
            if (!cell) return;
            const mirror = cellMap[(cell.getAttribute('data-col') || '') + '\n' + (cell.getAttribute('data-row') || '')];
            if (mirror && mirror !== cell) mirror.classList.add('h2h-mirror-hover');
        });
        tbl.addEventListener('mouseleave', clearMirror);
    }
}

// ============ 比赛频次时间轴 ============

function buildFrequencyBuckets(records, bucketType) {
    // records: match records（含 日期/类型）
    const buckets = new Map(); // key -> { label, types: {} }
    function keyOf(dateStr) {
        const d = new Date(dateStr + 'T00:00:00');
        if (isNaN(d)) return null;
        if (bucketType === 'month') {
            return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
        }
        // week：周一为一周开始
        const day = d.getDay() || 7;
        const monday = new Date(d);
        monday.setDate(d.getDate() - (day - 1));
        return monday.getFullYear() + '-' + String(monday.getMonth() + 1).padStart(2, '0') + '-' + String(monday.getDate()).padStart(2, '0');
    }
    function labelOf(key) {
        if (bucketType === 'month') {
            const [y, m] = key.split('-');
            const _L = i18n[currentLang] || {};
            return (_L.chart_axis_ym_tpl || '{y}年{m}月').replace('{y}', y).replace('{m}', String(parseInt(m)));
        }
        const d = new Date(key + 'T00:00:00');
        return (d.getMonth() + 1) + '月' + d.getDate() + '日';
    }
    for (const r of records) {
        const k = keyOf(r['日期']);
        if (!k) continue;
        if (!buckets.has(k)) buckets.set(k, { label: labelOf(k), types: {} });
        const b = buckets.get(k);
        b.types[r['类型']] = (b.types[r['类型']] || 0) + 1;
    }
    return Array.from(buckets.entries())
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map(([k, v]) => v);
}

function renderMatchFrequency(bucketType, count) {
    const canvas = document.getElementById('matchFrequencyChart');
    if (!canvas) return;
    if (matchFrequencyChart) { matchFrequencyChart.destroy(); matchFrequencyChart = null; }
    const isMobile = window.innerWidth <= 768;

    const records = (scoreLogData || []).filter(isMatchRecord);
    if (!records.length) return;
    let buckets = buildFrequencyBuckets(records, bucketType);
    if (buckets.length > count) buckets = buckets.slice(-count);

    // 按总场次取前 4 类，其余归为"其他"
    const typeTotals = {};
    for (const b of buckets) {
        for (const [t, c] of Object.entries(b.types)) typeTotals[t] = (typeTotals[t] || 0) + c;
    }
    const sortedTypes = Object.entries(typeTotals).sort((a, b) => b[1] - a[1]);
    const mainTypes = sortedTypes.slice(0, 4).map(x => x[0]);
    const otherLabel = i18n[currentLang].data_viz_other;

    const labels = buckets.map(b => b.label);
    const datasets = mainTypes.map((t, idx) => {
        return {
            label: t,
            data: buckets.map(b => b.types[t] || 0),
            backgroundColor: CHART_COLORS[idx % CHART_COLORS.length],
            stack: 'freq'
        };
    });
    if (sortedTypes.length > 4) {
        datasets.push({
            label: otherLabel,
            data: buckets.map(b => {
                let sum = 0;
                for (const [t, c] of Object.entries(b.types)) if (!mainTypes.includes(t)) sum += c;
                return sum;
            }),
            backgroundColor: CHART_COLORS[6 % CHART_COLORS.length],
            stack: 'freq'
        });
    }

    try {
        matchFrequencyChart = new Chart(canvas, {
            type: 'bar',
            data: { labels, datasets },
            options: {
                responsive: true, maintainAspectRatio: false,
                plugins: {
                    legend: { position: 'bottom', labels: { usePointStyle: true, padding: isMobile ? 10 : 16, font: { size: isMobile ? 10 : 11, family: "'Poppins', sans-serif" }, boxWidth: isMobile ? 11 : 12 } },
                    tooltip: { backgroundColor: 'rgba(26,29,40,0.9)', titleFont: { size: isMobile ? 12 : 13 }, bodyFont: { size: isMobile ? 11 : 12 }, padding: isMobile ? 8 : 12, cornerRadius: 8, callbacks: { label: ctx => `${ctx.dataset.label}: ${ctx.raw}${(i18n[currentLang] || {}).chart_matches_suffix || ' 场'}` } }
                },
                scales: {
                    x: { stacked: true, grid: { color: 'rgba(128,128,128,0.1)' }, ticks: { font: { size: isMobile ? 10 : 11 }, maxRotation: isMobile ? 45 : 0 } },
                    y: { stacked: true, beginAtZero: true, grid: { color: 'rgba(128,128,128,0.1)' }, ticks: { font: { size: isMobile ? 10 : 11 } }, title: { display: true, text: i18n[currentLang].data_viz_axis_matches, font: { size: isMobile ? 11 : 12 } } }
                }
            }
        });
    } catch (err) { console.error('比赛频次时间轴失败', err); }
}

// ============ 积分区间分布 ============

// 柱顶数值标签插件：无需悬停即在每根柱形上方显示人数（0 值不显示）
const distValueLabelPlugin = {
    id: 'distValueLabels',
    afterDatasetsDraw(chart, args, opts) {
        const meta = chart.getDatasetMeta(0);
        const data = chart.data.datasets[0] && chart.data.datasets[0].data;
        if (!meta || !data) return;
        const isDark = (typeof isDarkTheme === 'function' ? isDarkTheme() : false);
        const ctx = chart.ctx;
        ctx.save();
        ctx.fillStyle = isDark ? '#aeb4c2' : '#4a5568';
        ctx.font = ((opts && opts.fontSize) || 10) + 'px "Poppins", "Microsoft YaHei", sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'bottom';
        meta.data.forEach((bar, i) => {
            const v = data[i];
            if (!v) return;
            ctx.fillText(String(v), bar.x, bar.y - 3);
        });
        ctx.restore();
    }
};

function renderScoreDistribution(bins) {
    const canvas = document.getElementById('scoreDistributionChart');
    if (!canvas) return;
    if (scoreDistributionChart) { scoreDistributionChart.destroy(); scoreDistributionChart = null; }
    const isMobile = window.innerWidth <= 768;
    const scoreMap = getCurrentSeasonFallbackScores();
    const scores = Object.values(scoreMap);
    if (!scores.length) return;

    let min = Math.min(...scores), max = Math.max(...scores);
    if (min === max) { min -= 50; max += 50; }
    bins = clampInt(bins, 4, 30);
    const rawStep = (max - min) / bins;
    const mag = Math.pow(10, Math.floor(Math.log10(rawStep)));
    let step = Math.ceil(rawStep / mag) * mag;
    const start = Math.floor(min / step) * step;
    const end = Math.ceil(max / step) * step;

    const counts = new Array(Math.max(1, Math.round((end - start) / step))).fill(0);
    const labels = [];
    for (let s = start; s < end; s += step) {
        const lo = s, hi = s + step;
        labels.push(lo.toFixed(0) + '–' + hi.toFixed(0));
        const idx = (s - start) / step;
        counts[idx] = scores.filter(v => v >= lo && v < hi).length;
    }
    // 确保最后一个区间的最大值也包含
    counts[counts.length - 1] = scores.filter(v => v >= end - step && v <= max).length;

    try {
        scoreDistributionChart = new Chart(canvas, {
            type: 'bar',
            data: {
                labels,
                datasets: [{ label: i18n[currentLang].data_viz_axis_count, data: counts, backgroundColor: CHART_COLORS[0] + '90', borderRadius: 4 }]
            },
            options: {
                responsive: true, maintainAspectRatio: false,
                plugins: {
                    distValueLabels: { fontSize: isMobile ? 9 : 10 },
                    legend: { display: false },
                    tooltip: { backgroundColor: 'rgba(26,29,40,0.9)', titleFont: { size: isMobile ? 12 : 13 }, bodyFont: { size: isMobile ? 11 : 12 }, padding: isMobile ? 8 : 12, cornerRadius: 8, callbacks: { label: ctx => i18n[currentLang].data_viz_axis_count + ': ' + ctx.raw } }
                },
                scales: {
                    x: { grid: { color: 'rgba(128,128,128,0.1)' }, ticks: { font: { size: isMobile ? 10 : 11 }, maxRotation: isMobile ? 45 : 0 } },
                    y: { beginAtZero: true, grace: '12%', grid: { color: 'rgba(128,128,128,0.1)' }, ticks: { font: { size: isMobile ? 10 : 11 } }, title: { display: true, text: i18n[currentLang].data_viz_axis_count, font: { size: isMobile ? 11 : 12 } } }
                }
            },
            plugins: [distValueLabelPlugin]
        });
    } catch (err) { console.error('积分区间分布失败', err); }
}

// ============ 语言切换重绘 ============

function dataVizReapplyI18n() {
    if (!document.getElementById('recordBarChart')) return;
    renderRecordBar(dataVizExtraState.recordTopN);
    renderEfficiencyScatter(dataVizExtraState.efficiencyTopN);
    renderH2hHeatmap(dataVizExtraState.heatmapTopN);
    renderMatchFrequency(dataVizExtraState.freqBucket, dataVizExtraState.freqCount);
    renderScoreDistribution(dataVizExtraState.distBins);
    if (typeof clubBarRace !== 'undefined' && clubBarRace.initialized) {
        clubBarRace.playerColors = clubBuildRacePlayerColors();
        clubRaceSyncPlayButton();
        clubSetRaceFrame(dataVizExtraState.raceFrameIndex, false);
    }
}

// ============ 辅助 ============

function shortenPlayerName(name) {
    const s = String(name);
    return s.length > 14 ? s.slice(0, 12) + '…' : s;
}
