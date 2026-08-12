/* ========================================
   wtt_dataviz_extra.js - WTT 数据可视化扩展板块
   复刻 data-viz-extra.js，使用 WTT 系列数据
   ======================================== */

let wttRecordBarChart = null, wttEfficiencyScatterChart = null, wttMatchFrequencyChart = null, wttScoreDistributionChart = null;
let wttDataVizExtraState = { recordTopN: 10, efficiencyTopN: 15, heatmapTopN: 8, freqBucket: 'week', freqCount: 24, distBins: 10 };

// ============ 通用辅助（WTT 页未加载 data-viz-extra.js，需自带） ============

function shortenPlayerName(name) {
    const s = String(name);
    return s.length > 14 ? s.slice(0, 12) + '…' : s;
}

function buildFrequencyBuckets(records, bucketType) {
    const buckets = new Map();
    function keyOf(dateStr) {
        const d = new Date(dateStr + 'T00:00:00');
        if (isNaN(d)) return null;
        if (bucketType === 'month') {
            return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
        }
        const day = d.getDay() || 7;
        const monday = new Date(d);
        monday.setDate(d.getDate() - (day - 1));
        return monday.getFullYear() + '-' + String(monday.getMonth() + 1).padStart(2, '0') + '-' + String(monday.getDate()).padStart(2, '0');
    }
    function labelOf(key) {
        if (bucketType === 'month') {
            const [y, m] = key.split('-');
            return y + '年' + parseInt(m) + '月';
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

// ============ 数据辅助 ============

function wttBuildCurrentScoreMap() {
    const scores = {};
    let cd = [];
    for (let i = wttRankingTimeline.length - 1; i >= 0; i--) {
        if (wttRankingTimeline[i].data && wttRankingTimeline[i].data.length > 0) {
            cd = wttRankingTimeline[i].data;
            break;
        }
    }
    for (const p of cd) { scores[p['姓名']] = p['当前积分']; }

    // 不活跃球员：使用当前赛季的继承起始积分（在 WTT 数据上下文中计算）
    wttWithDataContext(() => {
        if (wttSeasonsData && wttSeasonsData.length > 0) {
            let currentSeasonIdx = wttSeasonsData.length - 1;
            for (let i = wttRankingTimeline.length - 1; i >= 0; i--) {
                if (wttRankingTimeline[i].season) {
                    const s = wttSeasonsData.find(s2 => s2.label === wttRankingTimeline[i].season);
                    if (s) { currentSeasonIdx = wttSeasonsData.indexOf(s); break; }
                }
            }
            const startScores = getSeasonStartScores(currentSeasonIdx);
            for (const [name, score] of Object.entries(startScores)) {
                if (!(name in scores)) scores[name] = score;
            }
        }
        const effInit = wttGetInitialScoresDataForEngine();
        if (effInit && effInit.initialScores) {
            for (const [name, score] of Object.entries(effInit.initialScores)) {
                if (!(name in scores)) scores[name] = score;
            }
        }
    });
    return scores;
}

function wttBuildRecordStats(playerNames) {
    const stats = {};
    for (const n of playerNames) stats[n] = { wins: 0, losses: 0, total: 0 };
    if (!wttScoreLogData) return stats;
    for (const r of wttScoreLogData) {
        if (!isMatchRecord(r)) continue;
        const w = r['胜者'], l = r['负者'];
        if (w && stats[w]) { stats[w].wins++; stats[w].total++; }
        if (l && stats[l]) { stats[l].losses++; stats[l].total++; }
    }
    return stats;
}

// ============ 初始化 ============

function initWttDataVizExtra() {
    if (!document.getElementById('wttRecordBarChart')) return;
    if (!wttRankingTimeline || wttRankingTimeline.length === 0) return;

    const players = wttGetAllPlayers();
    if (!players.length) return;

    wttDataVizExtraState.recordTopN = parseInt(document.getElementById('wttRecordTopN')?.value) || 10;
    wttDataVizExtraState.efficiencyTopN = parseInt(document.getElementById('wttEfficiencyTopN')?.value) || 15;
    wttDataVizExtraState.heatmapTopN = parseInt(document.getElementById('wttHeatmapTopN')?.value) || 8;
    wttDataVizExtraState.distBins = parseInt(document.getElementById('wttDistBinCount')?.value) || 10;
    wttRenderRecordBar(wttDataVizExtraState.recordTopN);
    wttRenderEfficiencyScatter(wttDataVizExtraState.efficiencyTopN);
    wttRenderH2hHeatmap(wttDataVizExtraState.heatmapTopN);
    wttRenderMatchFrequency(wttDataVizExtraState.freqBucket, wttDataVizExtraState.freqCount);
    wttRenderScoreDistribution(wttDataVizExtraState.distBins);

    document.getElementById('wttRecordTopN')?.addEventListener('change', () => {
        const v = wttClampInt(document.getElementById('wttRecordTopN').value, 1, 50);
        document.getElementById('wttRecordTopN').value = v;
        wttDataVizExtraState.recordTopN = v;
        wttRenderRecordBar(v);
    });
    document.getElementById('wttEfficiencyTopN')?.addEventListener('change', () => {
        const v = wttClampInt(document.getElementById('wttEfficiencyTopN').value, 1, 100);
        document.getElementById('wttEfficiencyTopN').value = v;
        wttDataVizExtraState.efficiencyTopN = v;
        wttRenderEfficiencyScatter(v);
    });
    document.getElementById('wttHeatmapTopN')?.addEventListener('change', () => {
        const v = wttClampInt(document.getElementById('wttHeatmapTopN').value, 2, 20);
        document.getElementById('wttHeatmapTopN').value = v;
        wttDataVizExtraState.heatmapTopN = v;
        wttRenderH2hHeatmap(v);
    });
    document.getElementById('wttFreqBucketSelect')?.addEventListener('change', e => {
        wttDataVizExtraState.freqBucket = e.target.value;
        wttRenderMatchFrequency(e.target.value, wttDataVizExtraState.freqCount);
    });
    document.getElementById('wttFreqDataCount')?.addEventListener('change', () => {
        const v = wttClampInt(document.getElementById('wttFreqDataCount').value, 2, 200);
        document.getElementById('wttFreqDataCount').value = v;
        wttDataVizExtraState.freqCount = v;
        wttRenderMatchFrequency(wttDataVizExtraState.freqBucket, v);
    });
    document.getElementById('wttDistBinCount')?.addEventListener('change', () => {
        const v = wttClampInt(document.getElementById('wttDistBinCount').value, 4, 30);
        document.getElementById('wttDistBinCount').value = v;
        wttDataVizExtraState.distBins = v;
        wttRenderScoreDistribution(v);
    });
}

function wttClampInt(v, min, max) {
    let n = parseInt(v);
    if (isNaN(n)) n = min;
    if (n < min) n = min;
    if (n > max) n = max;
    return n;
}

// ============ 战绩统计条形图 ============

function wttRenderRecordBar(topN) {
    const canvas = document.getElementById('wttRecordBarChart');
    if (!canvas) return;
    if (wttRecordBarChart) { wttRecordBarChart.destroy(); wttRecordBarChart = null; }
    const isMobile = window.innerWidth <= 768;
    const allPlayers = wttGetAllPlayers();
    const stats = wttBuildRecordStats(allPlayers);
    const sorted = allPlayers
        .filter(n => stats[n].total > 0)
        .sort((a, b) => stats[b].total - stats[a].total)
        .slice(0, topN);
    if (!sorted.length) return;

    const labels = sorted.map(n => shortenPlayerName(n));
    const wins = sorted.map(n => stats[n].wins);
    const losses = sorted.map(n => stats[n].losses);
    const fullNames = sorted;

    try {
        wttRecordBarChart = new Chart(canvas, {
            type: 'bar',
            data: {
                labels,
                datasets: [
                    { label: i18n[currentLang].wtt_win || i18n[currentLang].data_viz_win, data: wins, backgroundColor: '#52c41a', borderRadius: 4 },
                    { label: i18n[currentLang].wtt_loss, data: losses, backgroundColor: '#ff6b6b', borderRadius: 4 }
                ]
            },
            options: {
                responsive: true, maintainAspectRatio: false,
                indexAxis: 'y',
                interaction: { intersect: false, mode: 'index' },
                plugins: {
                    legend: { position: 'bottom', labels: { usePointStyle: true, padding: isMobile ? 8 : 16, font: { size: isMobile ? 9 : 11, family: "'Poppins', sans-serif" }, boxWidth: isMobile ? 10 : 12 } },
                    tooltip: {
                        backgroundColor: 'rgba(26,29,40,0.9)', titleFont: { size: isMobile ? 11 : 13 }, bodyFont: { size: isMobile ? 10 : 12 }, padding: isMobile ? 8 : 12, cornerRadius: 8,
                        callbacks: { title: items => fullNames[items[0]?.dataIndex] || '', label: ctx => `${ctx.dataset.label}: ${ctx.raw} 场` }
                    }
                },
                scales: {
                    x: { beginAtZero: true, grid: { color: 'rgba(128,128,128,0.1)' }, ticks: { font: { size: isMobile ? 9 : 11 } }, title: { display: true, text: i18n[currentLang].wtt_axis_matches || i18n[currentLang].wtt_axis_points, font: { size: isMobile ? 10 : 12 } } },
                    y: { grid: { display: false }, ticks: { font: { size: isMobile ? 9 : 11 } } }
                }
            }
        });
    } catch (err) { console.error('WTT战绩条形图失败', err); }
}

// ============ 效率散点图 ============

function wttRenderEfficiencyScatter(topN) {
    const canvas = document.getElementById('wttEfficiencyScatterChart');
    if (!canvas) return;
    if (wttEfficiencyScatterChart) { wttEfficiencyScatterChart.destroy(); wttEfficiencyScatterChart = null; }
    const isMobile = window.innerWidth <= 768;
    const allPlayers = wttGetAllPlayers();
    const scoreMap = wttBuildCurrentScoreMap();
    const stats = wttBuildRecordStats(allPlayers);

    const data = allPlayers
        .filter(n => (stats[n] && stats[n].total > 0))
        .sort((a, b) => (scoreMap[b] || 0) - (scoreMap[a] || 0))
        .slice(0, topN)
        .map(n => {
            const st = stats[n];
            const wr = st.total > 0 ? (st.wins / st.total) * 100 : 0;
            const r = Math.max(4, Math.min(26, 4 + (wr / 100) * 22));
            return { x: st.total, y: scoreMap[n] || 0, r, player: n, winRate: Math.round(wr * 10) / 10, form: Math.round(wttCalcFormScore(n) * 10) / 10 };
        });
    if (!data.length) return;

    try {
        wttEfficiencyScatterChart = new Chart(canvas, {
            type: 'bubble',
            data: {
                datasets: [{
                    label: i18n[currentLang].wtt_axis_players || i18n[currentLang].wtt_select_player, data,
                    backgroundColor: data.map(() => WTT_CHART_COLORS[0] + '50'),
                    borderColor: WTT_CHART_COLORS[0], borderWidth: isMobile ? 1 : 1.5,
                    hoverBackgroundColor: WTT_CHART_COLORS[0]
                }]
            },
            options: {
                responsive: true, maintainAspectRatio: false,
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        backgroundColor: 'rgba(26,29,40,0.9)', titleFont: { size: isMobile ? 11 : 13 }, bodyFont: { size: isMobile ? 10 : 12 }, padding: isMobile ? 8 : 12, cornerRadius: 8,
                        callbacks: {
                            title: ctx => ctx[0]?.raw?.player || '',
                            label: ctx => {
                                const d = ctx.raw;
                                return [
                                    (i18n[currentLang].wtt_axis_matches || i18n[currentLang].wtt_axis_points) + ': ' + d.x,
                                    (i18n[currentLang].wtt_pts_norm || i18n[currentLang].wtt_axis_points) + ': ' + d.y,
                                    i18n[currentLang].wtt_winrate + ': ' + d.winRate + '%',
                                    i18n[currentLang].wtt_form + ': ' + d.form
                                ].join('  |  ');
                            }
                        }
                    }
                },
                scales: {
                    x: { title: { display: true, text: i18n[currentLang].wtt_axis_matches || i18n[currentLang].wtt_axis_points, font: { size: isMobile ? 10 : 12 } }, grid: { color: 'rgba(128,128,128,0.1)' }, ticks: { font: { size: isMobile ? 9 : 11 } } },
                    y: { title: { display: true, text: i18n[currentLang].wtt_pts_norm || i18n[currentLang].wtt_axis_points, font: { size: isMobile ? 10 : 12 } }, grid: { color: 'rgba(128,128,128,0.1)' }, ticks: { font: { size: isMobile ? 9 : 11 } } }
                }
            }
        });
    } catch (err) { console.error('WTT效率散点图失败', err); }
}

// ============ 交手热力矩阵 ============

function wttRenderH2hHeatmap(topN) {
    const container = document.getElementById('wttH2hHeatmapContainer');
    if (!container) return;
    const allPlayers = wttGetAllPlayers();
    const scoreMap = wttBuildCurrentScoreMap();
    const sortedPlayers = [...allPlayers].sort((a, b) => (scoreMap[b] || 0) - (scoreMap[a] || 0)).slice(0, topN);
    if (sortedPlayers.length < 2) {
        container.innerHTML = '<div class="compare-placeholder"><p>' + i18n[currentLang].wtt_no_data + '</p></div>';
        return;
    }

    // 交手矩阵：wins[row][col] = row 球员胜 col 球员的场次（初始化为 0）
    const matrix = {};
    for (const n of sortedPlayers) matrix[n] = {};
    let maxWins = 0, anyMatch = false;
    if (wttScoreLogData) {
        for (const r of wttScoreLogData) {
            if (!isMatchRecord(r)) continue;
            const w = r['胜者'], l = r['负者'];
            if (!w || !l || !matrix[w] || !matrix[l]) continue;
            matrix[w][l] = (matrix[w][l] || 0) + 1;
            if (matrix[w][l] > maxWins) maxWins = matrix[w][l];
            anyMatch = true;
        }
    }
    if (!anyMatch) {
        container.innerHTML = '<div class="compare-placeholder"><i class="fa-solid fa-people-arrows"></i><p>' + i18n[currentLang].wtt_no_h2h + '</p></div>';
        return;
    }
    maxWins = maxWins || 1;

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
            const alpha = wins / maxWins;
            const bg = wins > 0 ? `rgba(77,163,255,${(0.12 + alpha * 0.88).toFixed(2)})` : 'rgba(128,128,128,0.06)';
            const tip = i18n[currentLang].wtt_heatmap_cell
                .replace('{winner}', row).replace('{loser}', col).replace('{n}', wins)
                + ` | ${i18n[currentLang].wtt_loss}: ${losses} | ${i18n[currentLang].wtt_total}: ${meets}`;
            body += `<td class="h2h-cell" style="background:${bg};" title="${escapeHtml(tip)}">${wins}</td>`;
        });
        body += '</tr>';
    });

    // 颜色说明
    const legend = `<div class="h2h-legend"><span class="h2h-legend-label">${escapeHtml(i18n[currentLang].wtt_heatmap_hint)}</span>` +
        `<span class="h2h-legend-bar"><i style="background:rgba(128,128,128,0.06);"></i><i style="background:rgba(77,163,255,0.3);"></i><i style="background:rgba(77,163,255,0.6);"></i><i style="background:rgba(77,163,255,0.9);"></i><b>${maxWins}</b></span></div>`;

    container.innerHTML = `<div class="h2h-heatmap-wrapper"><table class="h2h-heatmap-table"><thead><tr><th class="h2h-corner"></th>${header}</tr></thead><tbody>${body}</tbody></table>${legend}</div>`;
}

// ============ 比赛频次时间轴 ============

function wttRenderMatchFrequency(bucketType, count) {
    const canvas = document.getElementById('wttMatchFrequencyChart');
    if (!canvas) return;
    if (wttMatchFrequencyChart) { wttMatchFrequencyChart.destroy(); wttMatchFrequencyChart = null; }
    const isMobile = window.innerWidth <= 768;

    const records = (wttScoreLogData || []).filter(isMatchRecord);
    if (!records.length) return;
    let buckets = buildFrequencyBuckets(records, bucketType);
    if (buckets.length > count) buckets = buckets.slice(-count);

    const typeTotals = {};
    for (const b of buckets) {
        for (const [t, c] of Object.entries(b.types)) typeTotals[t] = (typeTotals[t] || 0) + c;
    }
    const sortedTypes = Object.entries(typeTotals).sort((a, b) => b[1] - a[1]);
    const mainTypes = sortedTypes.slice(0, 4).map(x => x[0]);
    const otherLabel = i18n[currentLang].wtt_other;

    const labels = buckets.map(b => b.label);
    const datasets = mainTypes.map((t, idx) => {
        return { label: t, data: buckets.map(b => b.types[t] || 0), backgroundColor: WTT_CHART_COLORS[idx % WTT_CHART_COLORS.length], stack: 'freq' };
    });
    if (sortedTypes.length > 4) {
        datasets.push({
            label: otherLabel,
            data: buckets.map(b => {
                let sum = 0;
                for (const [t, c] of Object.entries(b.types)) if (!mainTypes.includes(t)) sum += c;
                return sum;
            }),
            backgroundColor: WTT_CHART_COLORS[6 % WTT_CHART_COLORS.length],
            stack: 'freq'
        });
    }

    try {
        wttMatchFrequencyChart = new Chart(canvas, {
            type: 'bar',
            data: { labels, datasets },
            options: {
                responsive: true, maintainAspectRatio: false,
                plugins: {
                    legend: { position: 'bottom', labels: { usePointStyle: true, padding: isMobile ? 8 : 16, font: { size: isMobile ? 9 : 11, family: "'Poppins', sans-serif" }, boxWidth: isMobile ? 10 : 12 } },
                    tooltip: { backgroundColor: 'rgba(26,29,40,0.9)', titleFont: { size: isMobile ? 11 : 13 }, bodyFont: { size: isMobile ? 10 : 12 }, padding: isMobile ? 8 : 12, cornerRadius: 8, callbacks: { label: ctx => `${ctx.dataset.label}: ${ctx.raw} 场` } }
                },
                scales: {
                    x: { stacked: true, grid: { color: 'rgba(128,128,128,0.1)' }, ticks: { font: { size: isMobile ? 9 : 11 }, maxRotation: isMobile ? 45 : 0 } },
                    y: { stacked: true, beginAtZero: true, grid: { color: 'rgba(128,128,128,0.1)' }, ticks: { font: { size: isMobile ? 9 : 11 } }, title: { display: true, text: i18n[currentLang].wtt_axis_matches || i18n[currentLang].wtt_axis_points, font: { size: isMobile ? 10 : 12 } } }
                }
            }
        });
    } catch (err) { console.error('WTT比赛频次时间轴失败', err); }
}

// ============ 积分区间分布 ============

function wttRenderScoreDistribution(bins) {
    const canvas = document.getElementById('wttScoreDistributionChart');
    if (!canvas) return;
    if (wttScoreDistributionChart) { wttScoreDistributionChart.destroy(); wttScoreDistributionChart = null; }
    const isMobile = window.innerWidth <= 768;
    const scoreMap = wttBuildCurrentScoreMap();
    const scores = Object.values(scoreMap);
    if (!scores.length) return;

    let min = Math.min(...scores), max = Math.max(...scores);
    if (min === max) { min -= 50; max += 50; }
    bins = wttClampInt(bins, 4, 30);
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
    counts[counts.length - 1] = scores.filter(v => v >= end - step && v <= max).length;

    try {
        wttScoreDistributionChart = new Chart(canvas, {
            type: 'bar',
            data: {
                labels,
                datasets: [{ label: i18n[currentLang].wtt_axis_count || i18n[currentLang].wtt_axis_points, data: counts, backgroundColor: WTT_CHART_COLORS[0] + '90', borderRadius: 4 }]
            },
            options: {
                responsive: true, maintainAspectRatio: false,
                plugins: {
                    legend: { display: false },
                    tooltip: { backgroundColor: 'rgba(26,29,40,0.9)', titleFont: { size: isMobile ? 11 : 13 }, bodyFont: { size: isMobile ? 10 : 12 }, padding: isMobile ? 8 : 12, cornerRadius: 8, callbacks: { label: ctx => (i18n[currentLang].wtt_axis_count || i18n[currentLang].wtt_axis_points) + ': ' + ctx.raw } }
                },
                scales: {
                    x: { grid: { color: 'rgba(128,128,128,0.1)' }, ticks: { font: { size: isMobile ? 9 : 11 }, maxRotation: isMobile ? 45 : 0 } },
                    y: { beginAtZero: true, grid: { color: 'rgba(128,128,128,0.1)' }, ticks: { font: { size: isMobile ? 9 : 11 } }, title: { display: true, text: i18n[currentLang].wtt_axis_count || i18n[currentLang].wtt_axis_points, font: { size: isMobile ? 10 : 12 } } }
                }
            }
        });
    } catch (err) { console.error('WTT积分区间分布失败', err); }
}

// ============ 语言切换重绘 ============

function wttReapplyDataVizExtra() {
    if (!document.getElementById('wttRecordBarChart')) return;
    wttRenderRecordBar(wttDataVizExtraState.recordTopN);
    wttRenderEfficiencyScatter(wttDataVizExtraState.efficiencyTopN);
    wttRenderH2hHeatmap(wttDataVizExtraState.heatmapTopN);
    wttRenderMatchFrequency(wttDataVizExtraState.freqBucket, wttDataVizExtraState.freqCount);
    wttRenderScoreDistribution(wttDataVizExtraState.distBins);
}
