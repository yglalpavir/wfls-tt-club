/* ========================================
   wtt_dataviz.js - WTT 数据可视化
   复刻 data-viz.js，使用 WTT 系列数据
   ======================================== */

let wttPointsTrendChart = null, wttRankStreamChart = null;
const WTT_CHART_COLORS = ['#4da3ff','#ff6b6b','#52c41a','#f5c542','#ff9f43','#a55eea','#26de81','#fd79a8','#45b7d1','#f78fb3','#3dc1d3','#e66767','#778beb','#f5cd79','#cf6a87','#786fa6','#f8a5c2','#63cdda','#ea8685','#596275'];
const WTT_STREAM_COLORS = ['#4da3ff','#52c41a','#ff9f43','#a55eea','#26de81','#ff6b6b','#45b7d1','#f5c542','#778beb','#fd79a8','#3dc1d3','#f78fb3','#63cdda','#e66767','#f5cd79','#cf6a87','#786fa6','#f8a5c2','#ea8685','#596275'];

// ============ WTT 数据加载 ============

async function wttLoadRankingDataForViz() {
    try {
        await Promise.all([
            wttLoadInitialScores(),
            wttLoadEventCoefficients(),
            wttLoadSeasons(),
            wttLoadScoreLog()
        ]);
        if (!wttInitialScoresData || !wttEventCoefficients || !wttSeasonsData) throw new Error('WTT数据加载失败');

        // 计算 WTT 排名时间线（切换到 WTT 全局数据）
        const origScoreLog = scoreLogData;
        const origInitial = initialScoresData;
        const origEvent = eventCoefficients;
        const origSeasons = seasonsData;

        scoreLogData = wttScoreLogData;
        initialScoresData = wttInitialScoresData;
        eventCoefficients = wttEventCoefficients;
        seasonsData = wttSeasonsData;

        wttRankingTimeline = calculateAllRankingsWithSeasons(scoreLogData, initialScoresData.initialScores, seasonsData);
        const rt = calculateRealtimeRanking();
        if (rt) wttRankingTimeline.push(rt);

        // 恢复全局数据
        scoreLogData = origScoreLog;
        initialScoresData = origInitial;
        eventCoefficients = origEvent;
        seasonsData = origSeasons;

        return true;
    } catch(e) {
        console.error('WttDataViz: 排名计算失败', e);
        wttRankingTimeline = [];
        return false;
    }
}

// 加载 WTT 数据文件（复用 wtt_ranking.js 中的函数签名）
function wttLoadInitialScores() {
    return fetch('wtt_data/wtt_initial-scores.json').then(r => r.json()).then(d => { wttInitialScoresData = d; return true; }).catch(e => { console.error('WTT initial-scores 加载失败', e); return false; });
}
function wttLoadEventCoefficients() {
    return fetch('wtt_data/wtt_event-coefficient.json').then(r => r.json()).then(d => { wttEventCoefficients = d; return true; }).catch(e => { console.error('WTT event-coefficient 加载失败', e); return false; });
}
function wttLoadSeasons() {
    return fetch('wtt_data/wtt_seasons.json').then(r => r.json()).then(d => { wttSeasonsData = d.filter(s => s.visible !== false); return true; }).catch(e => { wttSeasonsData = []; return false; });
}
function wttLoadScoreLog() {
    return fetch('wtt_data/wtt_score-log.json').then(r => r.json()).then(d => { wttScoreLogData = d; }).catch(e => { wttScoreLogData = []; });
}

// 桥接变量（如果 wtt_ranking.js 先加载了，则复用）
if (typeof wttScoreLogData === 'undefined') var wttScoreLogData = [];
if (typeof wttInitialScoresData === 'undefined') var wttInitialScoresData = null;
if (typeof wttEventCoefficients === 'undefined') var wttEventCoefficients = null;
if (typeof wttSeasonsData === 'undefined') var wttSeasonsData = null;
if (typeof wttRankingTimeline === 'undefined') var wttRankingTimeline = [];

// ============ 初始化 ============

function initWttDataViz() {
    console.log('[WttDataViz] 开始初始化，wttRankingTimeline 长度:', wttRankingTimeline.length, 'wttScoreLogData 长度:', wttScoreLogData.length);

    if (!document.getElementById('wttPointsTrendChart')) {
        console.warn('[WttDataViz] 页面上找不到 wttPointsTrendChart 元素');
        return;
    }

    if (!wttRankingTimeline || wttRankingTimeline.length === 0) {
        console.error('[WttDataViz] wttRankingTimeline 为空，排名数据未加载成功');
        document.getElementById('wttPlayerCheckboxList').innerHTML = '<div style="padding:20px;color:var(--accent-red);">❌ WTT排名数据加载失败，请刷新页面重试</div>';
        return;
    }

    const players = wttGetAllPlayers();
    if (!players.length) {
        console.error('[WttDataViz] wttGetAllPlayers() 返回空数组');
        document.getElementById('wttPlayerCheckboxList').innerHTML = '<div style="padding:20px;color:var(--accent-red);">❌ 无法获取球员列表</div>';
        return;
    }

    console.log('[WttDataViz] 成功获取球员列表:', players.length, '人');
    wttRenderPlayerCheckboxes();
    wttRenderCompareSelects();
    const dp = players.slice(0, Math.min(5, players.length));
    const defaultDataCount = parseInt(document.getElementById('wttPointsTrendDataCount')?.value) || 20;
    wttRenderPointsTrend(dp, defaultDataCount);
    const defaultStreamCount = parseInt(document.getElementById('wttStreamDataCount')?.value) || 20;
    wttRenderRankStream(Math.min(10, players.length), defaultStreamCount);

    // 事件监听
    document.getElementById('wttApplyPointsTrend')?.addEventListener('click', () => {
        const sel = wttGetSelectedPlayers();
        if (!sel.length) { alert('请至少选择一名球员'); return; }
        if (sel.length > 15) { alert('最多选择15名球员'); return; }
        const dc = parseInt(document.getElementById('wttPointsTrendDataCount')?.value) || 20;
        wttRenderPointsTrend(sel, dc);
    });
    document.getElementById('wttPointsTrendDataCount')?.addEventListener('change', () => {
        const sel = wttGetSelectedPlayers();
        if (!sel.length) { sel.push(...players.slice(0, Math.min(5, players.length))); }
        const dc = parseInt(document.getElementById('wttPointsTrendDataCount')?.value) || 20;
        wttRenderPointsTrend(sel, dc);
    });
    document.getElementById('wttTopNSelect')?.addEventListener('change', e => {
        let v = parseInt(e.target.value);
        if (isNaN(v) || v < 1) v = 1;
        if (v > 20) v = 20;
        e.target.value = v;
        const dc = parseInt(document.getElementById('wttStreamDataCount')?.value) || 20;
        wttRenderRankStream(v, dc);
    });
    document.getElementById('wttStreamDataCount')?.addEventListener('change', () => {
        const topN = parseInt(document.getElementById('wttTopNSelect')?.value) || 10;
        const dc = parseInt(document.getElementById('wttStreamDataCount')?.value) || 20;
        wttRenderRankStream(topN, dc);
    });
    document.getElementById('wttApplyCompare')?.addEventListener('click', () => {
        const pa = document.getElementById('wttPlayerASelect')?.value, pb = document.getElementById('wttPlayerBSelect')?.value;
        if (!pa || !pb) { alert('请选择两名球员'); return; }
        if (pa === pb) { alert('请选择不同的球员'); return; }
        wttRenderComparison(pa, pb);
    });
    console.log('[WttDataViz] 初始化完成');

    // 响应窗口大小变化，重绘图表
    let resizeTimeout;
    window.addEventListener('resize', () => {
        clearTimeout(resizeTimeout);
        resizeTimeout = setTimeout(() => {
            const sel = wttGetSelectedPlayers();
            const dc = parseInt(document.getElementById('wttPointsTrendDataCount')?.value) || 20;
            if (sel.length && wttPointsTrendChart) wttRenderPointsTrend(sel, dc);
            const topN = parseInt(document.getElementById('wttTopNSelect')?.value) || 10;
            const sdc = parseInt(document.getElementById('wttStreamDataCount')?.value) || 20;
            if (wttRankStreamChart) wttRenderRankStream(topN, sdc);
        }, 300);
    });
}

// ============ 辅助函数 ============

function wttGetAllPlayers() {
    const playerSet = new Set();

    // 1. 从 ranking timeline 的所有快照中收集球员
    if (wttRankingTimeline && wttRankingTimeline.length) {
        for (const t of wttRankingTimeline) {
            if (t.data && t.data.length) {
                for (const p of t.data) {
                    if (p['姓名']) playerSet.add(p['姓名']);
                }
            }
        }
    }

    // 2. 从初始积分中收集球员（含无比赛记录的球员）
    if (wttInitialScoresData && wttInitialScoresData.initialScores) {
        for (const name of Object.keys(wttInitialScoresData.initialScores)) {
            if (name) playerSet.add(name);
        }
    }

    // 3. 从 score log 中收集球员
    if (wttScoreLogData && wttScoreLogData.length) {
        for (const r of wttScoreLogData) {
            if (isMatchRecord(r)) {
                if (r['胜者']) playerSet.add(r['胜者']);
                if (r['负者']) playerSet.add(r['负者']);
            } else if (isBonusRecord(r)) {
                if (r['对象']) playerSet.add(r['对象']);
            }
        }
    }

    const players = Array.from(playerSet);
    if (!players.length) {
        console.warn('[WttDataViz] wttGetAllPlayers: 未找到任何球员');
    }
    return players;
}

function wttGetSelectedPlayers() {
    return Array.from(document.querySelectorAll('#wttPlayerCheckboxList input[type="checkbox"]:checked')).map(cb => cb.value);
}

// ============ 球员选择复选框 ============

function wttRenderPlayerCheckboxes() {
    const container = document.getElementById('wttPlayerCheckboxList');
    if (!container) return;

    const players = wttGetAllPlayers();
    if (!players.length) {
        container.innerHTML = '<div style="padding:20px;text-align:center;color:var(--text-muted);">暂无球员数据</div>';
        return;
    }

    let cd = [];
    for (let i = wttRankingTimeline.length - 1; i >= 0; i--) {
        if (wttRankingTimeline[i].data && wttRankingTimeline[i].data.length > 0) {
            cd = wttRankingTimeline[i].data;
            break;
        }
    }

    container.innerHTML = players.map((name, i) => {
        const checked = i < 5 ? 'checked' : '';
        const p = cd.find(x => x['姓名'] === name);
        const pts = p ? p['当前积分'] : '-';
        return `<label class="player-checkbox-item ${i<5?'checked':''}"><input type="checkbox" value="${name}" ${checked}><span>${name}</span><span class="player-rank">${pts}</span></label>`;
    }).join('');

    container.querySelectorAll('.player-checkbox-item').forEach(item => {
        item.addEventListener('click', e => {
            if (e.target.tagName === 'INPUT') return;
            const cb = item.querySelector('input');
            cb.checked = !cb.checked;
            item.classList.toggle('checked', cb.checked);
        });
    });
}

function wttRenderCompareSelects() {
    const players = wttGetAllPlayers();
    if (!players.length) return;
    const opts = players.map(p => `<option value="${p}">${p}</option>`).join('');
    const sa = document.getElementById('wttPlayerASelect'), sb = document.getElementById('wttPlayerBSelect');
    if (sa) sa.innerHTML = '<option value="">-- 选择球员 --</option>' + opts;
    if (sb) sb.innerHTML = '<option value="">-- 选择球员 --</option>' + opts;
}

// ============ 积分趋势图 ============

function wttRenderPointsTrend(playerNames, dataCount) {
    const canvas = document.getElementById('wttPointsTrendChart');
    if (!canvas || !wttRankingTimeline.length) return;
    if (wttPointsTrendChart) { wttPointsTrendChart.destroy(); wttPointsTrendChart = null; }

    // 取最近 dataCount 个数据点
    dataCount = Math.max(2, Math.min(dataCount || 20, wttRankingTimeline.length));
    const slicedTimeline = wttRankingTimeline.slice(-dataCount);

    const isMobile = window.innerWidth <= 768;
    const labels = slicedTimeline.map(t => t.label);
    const datasets = playerNames.map((name, idx) => {
        const data = slicedTimeline.map(t => {
            const p = t.data.find(x => x['姓名'] === name);
            return p ? p['当前积分'] : null;
        });
        return {
            label: name, data,
            borderColor: WTT_CHART_COLORS[idx % WTT_CHART_COLORS.length],
            backgroundColor: WTT_CHART_COLORS[idx % WTT_CHART_COLORS.length] + '20',
            borderWidth: isMobile ? 2 : 2.5,
            pointRadius: isMobile ? 2 : 4,
            pointHoverRadius: isMobile ? 5 : 7,
            tension: 0.3, fill: false, spanGaps: true
        };
    });

    try {
        wttPointsTrendChart = new Chart(canvas, {
            type: 'line', data: { labels, datasets },
            options: {
                responsive: true, maintainAspectRatio: false,
                interaction: { intersect: false, mode: 'index' },
                plugins: {
                    legend: {
                        position: 'bottom',
                        labels: { usePointStyle: true, padding: isMobile ? 10 : 20, font: { size: isMobile ? 10 : 12, family: "'Poppins', sans-serif" }, boxWidth: isMobile ? 10 : 12 }
                    },
                    tooltip: { backgroundColor: 'rgba(26,29,40,0.9)', titleFont: { size: isMobile ? 11 : 13 }, bodyFont: { size: isMobile ? 10 : 12 }, padding: isMobile ? 8 : 12, cornerRadius: 8 }
                },
                scales: {
                    x: { grid: { color: 'rgba(128,128,128,0.1)' }, ticks: { font: { size: isMobile ? 9 : 11 }, maxRotation: isMobile ? 45 : 0 } },
                    y: { beginAtZero: false, grid: { color: 'rgba(128,128,128,0.1)' }, ticks: { font: { size: isMobile ? 9 : 11 } }, title: { display: true, text: '积分', font: { size: isMobile ? 10 : 12 } } }
                }
            }
        });
    } catch(err) { console.error('WTT积分趋势图失败', err); }
}

// ============ 排名河流图 ============

function wttRenderRankStream(topN, dataCount) {
    const canvas = document.getElementById('wttRankStreamChart');
    if (!canvas || !wttRankingTimeline.length) return;
    if (wttRankStreamChart) { wttRankStreamChart.destroy(); wttRankStreamChart = null; }

    // 取最近 dataCount 个数据点
    dataCount = Math.max(2, Math.min(dataCount || 20, wttRankingTimeline.length));
    const slicedTimeline = wttRankingTimeline.slice(-dataCount);

    const isMobile = window.innerWidth <= 768;
    const labels = slicedTimeline.map(t => t.label);

    // 使用最后一个切片快照确定 top 球员
    let lastNonEmptySnapshot = null;
    for (let i = slicedTimeline.length - 1; i >= 0; i--) {
        if (slicedTimeline[i].data && slicedTimeline[i].data.length > 0) {
            lastNonEmptySnapshot = slicedTimeline[i];
            break;
        }
    }
    if (!lastNonEmptySnapshot) return;

    topN = Math.max(1, Math.min(topN, 20, (lastNonEmptySnapshot.data || []).length));
    const topPlayers = (lastNonEmptySnapshot.data || []).slice(0, topN).map(p => p['姓名']);
    const textColor = getComputedStyle(document.body).getPropertyValue('--text-primary').trim() || '#1a1a2e';
    const datasets = topPlayers.map((name, idx) => {
        const data = slicedTimeline.map(t => {
            const ri = t.data.findIndex(x => x['姓名'] === name);
            return ri >= 0 ? ri + 1 : null;
        });
        const color = WTT_STREAM_COLORS[idx % WTT_STREAM_COLORS.length];
        return {
            label: name, data,
            borderColor: color, backgroundColor: color + '25',
            borderWidth: isMobile ? 1.5 : 2,
            pointRadius: isMobile ? 2 : 3,
            pointHoverRadius: isMobile ? 4 : 6,
            tension: 0.4, fill: true, spanGaps: true
        };
    });

    try {
        wttRankStreamChart = new Chart(canvas, {
            type: 'line', data: { labels, datasets },
            options: {
                responsive: true, maintainAspectRatio: false,
                interaction: { intersect: false, mode: 'index' },
                plugins: {
                    legend: {
                        position: 'bottom',
                        labels: { usePointStyle: true, padding: isMobile ? 8 : 16, font: { size: isMobile ? 9 : 11, family: "'Poppins', sans-serif" }, color: textColor, boxWidth: isMobile ? 10 : 12 }
                    },
                    tooltip: {
                        backgroundColor: 'rgba(26,29,40,0.9)', titleFont: { size: isMobile ? 11 : 13 }, bodyFont: { size: isMobile ? 10 : 12 }, padding: isMobile ? 8 : 12, cornerRadius: 8,
                        callbacks: { label: ctx => `${ctx.dataset.label}: 第${ctx.raw}名` }
                    }
                },
                scales: {
                    x: { grid: { color: 'rgba(128,128,128,0.1)' }, ticks: { font: { size: isMobile ? 9 : 11 }, maxRotation: isMobile ? 45 : 0 } },
                    y: { reverse: true, min: 1, max: topN, grid: { color: 'rgba(128,128,128,0.1)' }, ticks: { font: { size: isMobile ? 9 : 11 }, stepSize: 1 }, title: { display: true, text: '排名', font: { size: isMobile ? 10 : 12 } } }
                }
            }
        });
    } catch(err) { console.error('WTT排名河流图失败', err); }
}

// ============ 球员对比 ============

// 计算 WTT 球员近期状态分（最近10场比赛的积分变化总和）
function wttCalcFormScore(playerName) {
    if (!wttScoreLogData || !wttScoreLogData.length) return 0;

    // 切换到 WTT 全局数据
    const origScoreLog = scoreLogData;
    const origInitial = initialScoresData;
    const origEvent = eventCoefficients;
    const origSeasons = seasonsData;

    scoreLogData = wttScoreLogData;
    initialScoresData = wttInitialScoresData;
    eventCoefficients = wttEventCoefficients;
    seasonsData = wttSeasonsData;

    const playerMatches = scoreLogData
        .filter(r => isMatchRecord(r) && (r['胜者'] === playerName || r['负者'] === playerName))
        .sort((a, b) => a['日期'].localeCompare(b['日期']));

    if (!playerMatches.length) {
        scoreLogData = origScoreLog; initialScoresData = origInitial;
        eventCoefficients = origEvent; seasonsData = origSeasons;
        return 0;
    }

    const recentMatches = playerMatches.slice(-10);
    const scores = {};
    if (initialScoresData) Object.assign(scores, initialScoresData.initialScores);

    const sortedLog = [...scoreLogData].sort((a, b) => a['日期'].localeCompare(b['日期']));
    const firstRecentDate = recentMatches[0]['日期'];

    for (const m of sortedLog) {
        if (m['日期'] >= firstRecentDate) break;
        if (isMatchRecord(m)) {
            const w = m['胜者'], l = m['负者'];
            if (!scores[w]) scores[w] = 1300;
            if (!scores[l]) scores[l] = 1300;
            const wg = calcRawPoints(w, l, m['类型'], scores);
            scores[w] = Math.max(SCORE_FLOOR, scores[w] + wg);
            scores[l] = Math.max(SCORE_FLOOR, scores[l] - wg * 0.8);
        } else if (isBonusRecord(m)) {
            const target = m['对象'];
            const bonus = parseFloat(m['分数']) || 0;
            if (!scores[target]) scores[target] = 1300;
            scores[target] = Math.max(SCORE_FLOOR, scores[target] + bonus);
        }
    }

    let totalChange = 0;
    for (const m of recentMatches) {
        const w = m['胜者'], l = m['负者'];
        if (!scores[w]) scores[w] = 1300;
        if (!scores[l]) scores[l] = 1300;
        const rawPoints = calcRawPoints(w, l, m['类型'], scores);
        if (w === playerName) {
            totalChange += rawPoints;
            scores[w] = Math.max(SCORE_FLOOR, scores[w] + rawPoints);
            scores[l] = Math.max(SCORE_FLOOR, scores[l] - rawPoints * 0.8);
        } else {
            totalChange -= rawPoints * 0.8;
            scores[w] = Math.max(SCORE_FLOOR, scores[w] + rawPoints);
            scores[l] = Math.max(SCORE_FLOOR, scores[l] - rawPoints * 0.8);
        }
    }

    scoreLogData = origScoreLog; initialScoresData = origInitial;
    eventCoefficients = origEvent; seasonsData = origSeasons;
    return totalChange;
}

function wttCalcPredictedWinRate(rA, rB, aWins, bWins, fA, fB) {
    const pElo = 1 / (1 + Math.pow(10, (rB - rA) / 400));
    const k = 0.02;
    const pForm = 1 / (1 + Math.exp(-k * (fA - fB)));
    if (aWins + bWins === 0) return 0.7 * pElo + 0.3 * pForm;
    const pH2H = (aWins + 2) / (aWins + bWins + 4);
    return 0.6 * pElo + 0.2 * pH2H + 0.2 * pForm;
}

function wttRenderComparison(playerA, playerB) {
    const container = document.getElementById('wttCompareResult');
    if (!container) return;

    // 切换到 WTT 全局数据
    const origScoreLog = scoreLogData;
    const origInitial = initialScoresData;
    const origEvent = eventCoefficients;
    const origSeasons = seasonsData;

    scoreLogData = wttScoreLogData;
    initialScoresData = wttInitialScoresData;
    eventCoefficients = wttEventCoefficients;
    seasonsData = wttSeasonsData;

    let lastNonEmptySnapshot = null;
    for (let i = wttRankingTimeline.length - 1; i >= 0; i--) {
        if (wttRankingTimeline[i].data && wttRankingTimeline[i].data.length > 0) {
            lastNonEmptySnapshot = wttRankingTimeline[i];
            break;
        }
    }

    const cd = lastNonEmptySnapshot?.data || [];
    const ad = cd.find(p => p['姓名'] === playerA),
          bd = cd.find(p => p['姓名'] === playerB);
    const h2h = scoreLogData.filter(r => isMatchRecord(r) && ((r['胜者'] === playerA && r['负者'] === playerB) || (r['胜者'] === playerB && r['负者'] === playerA)));
    const aW = h2h.filter(r => r['胜者'] === playerA).length,
          bW = h2h.filter(r => r['胜者'] === playerB).length,
          total = h2h.length;
    const recent = h2h.length ? h2h[h2h.length - 1] : null;
    const aWinRate = total > 0 ? ((aW / total) * 100).toFixed(1) + '%' : '-',
          bWinRate = total > 0 ? ((bW / total) * 100).toFixed(1) + '%' : '-';

    const rA = ad ? ad['当前积分'] : 1300, rB = bd ? bd['当前积分'] : 1300;
    const fA = wttCalcFormScore(playerA), fB = wttCalcFormScore(playerB);
    const predA = (wttCalcPredictedWinRate(rA, rB, aW, bW, fA, fB) * 100).toFixed(1);
    const predB = (wttCalcPredictedWinRate(rB, rA, bW, aW, fB, fA) * 100).toFixed(1);

    let html = `<div class="compare-summary">
        <div class="compare-player-col">
            <div class="compare-player-name">${playerA}</div>
            <div class="compare-player-stat">当前积分: <strong>${ad ? ad['当前积分'] : '-'}</strong></div>
            <div class="compare-player-stat">交手胜率: <strong>${aWinRate}</strong></div>
            <div class="compare-player-stat">预测胜率: <strong>${predA}%</strong></div>
        </div>
        <div class="compare-divider">VS</div>
        <div class="compare-player-col">
            <div class="compare-player-name">${playerB}</div>
            <div class="compare-player-stat">当前积分: <strong>${bd ? bd['当前积分'] : '-'}</strong></div>
            <div class="compare-player-stat">交手胜率: <strong>${bWinRate}</strong></div>
            <div class="compare-player-stat">预测胜率: <strong>${predB}%</strong></div>
        </div>
    </div>`;

    if (total > 0) {
        html += `<div style="text-align:center;margin-bottom:16px;">
            <span style="font-weight:600;">总交手: ${total} 场</span> |
            <span style="color:#52c41a;">${playerA} ${aW} 胜</span> |
            <span style="color:#52c41a;">${playerB} ${bW} 胜</span>
            ${recent ? ` | 最近: ${recent['日期']} (胜者: ${recent['胜者']})` : ''}
        </div>
        <div class="compare-h2h-wrapper">
            <table class="compare-h2h-table">
                <thead><tr><th>日期</th><th>类型</th><th>胜者</th><th>${playerA} 积分变动</th><th>${playerB} 积分变动</th></tr></thead>
                <tbody>`;

        const scores = {};
        if (initialScoresData) Object.assign(scores, initialScoresData.initialScores);
        const sortedLog = [...scoreLogData].sort((a, b) => a['日期'].localeCompare(b['日期']));

        for (const m of sortedLog) {
            if (!isMatchRecord(m)) continue;
            const w = m['胜者'], l = m['负者'];
            if ((w !== playerA || l !== playerB) && (w !== playerB || l !== playerA)) continue;
            if (!scores[w]) scores[w] = 1300;
            if (!scores[l]) scores[l] = 1300;
            const wg = calcMatchPoints(w, l, m['类型'], m['日期'], m['日期'], scores);
            const aIsW = w === playerA;
            const aChange = aIsW ? wg : -(wg * 0.8);
            const bChange = aIsW ? -(wg * 0.8) : wg;
            html += `<tr>
                <td>${m['日期']}</td><td>${m['类型']}</td><td>${w}</td>
                <td class="${aIsW ? 'win-highlight' : 'loss-highlight'}">${aChange > 0 ? '+' : ''}${aChange.toFixed(1)}</td>
                <td class="${!aIsW ? 'win-highlight' : 'loss-highlight'}">${bChange > 0 ? '+' : ''}${bChange.toFixed(1)}</td>
            </tr>`;
            scores[w] = Math.max(SCORE_FLOOR, scores[w] + wg);
            scores[l] = Math.max(SCORE_FLOOR, scores[l] - wg * 0.8);
        }
        html += '</tbody></table></div>';
    } else {
        html += '<div class="compare-placeholder"><p>暂无交手记录</p></div>';
    }

    container.innerHTML = html;

    scoreLogData = origScoreLog; initialScoresData = origInitial;
    eventCoefficients = origEvent; seasonsData = origSeasons;
}
