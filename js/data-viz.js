/* ========================================
   data-viz.js - 数据可视化
   ======================================== */

let pointsTrendChart = null, rankStreamChart = null;
const CHART_COLORS = ['#4da3ff','#ff6b6b','#52c41a','#f5c542','#ff9f43','#a55eea','#26de81','#fd79a8','#45b7d1','#f78fb3','#3dc1d3','#e66767','#778beb','#f5cd79','#cf6a87','#786fa6','#f8a5c2','#63cdda','#ea8685','#596275'];
const STREAM_COLORS = ['#4da3ff','#52c41a','#ff9f43','#a55eea','#26de81','#ff6b6b','#45b7d1','#f5c542','#778beb','#fd79a8','#3dc1d3','#f78fb3','#63cdda','#e66767','#f5cd79','#cf6a87','#786fa6','#f8a5c2','#ea8685','#596275'];

function initDataViz() {
    console.log('[DataViz] 开始初始化，rankingTimeline 长度:', rankingTimeline.length, 'scoreLogData 长度:', scoreLogData.length);
    
    if (!document.getElementById('pointsTrendChart')) {
        console.warn('[DataViz] 页面上找不到 pointsTrendChart 元素');
        return;
    }
    
    if (!rankingTimeline || rankingTimeline.length === 0) {
        console.error('[DataViz] rankingTimeline 为空，排名数据未加载成功');
        document.getElementById('playerCheckboxList').innerHTML = '<div style="padding:20px;color:var(--accent-red);">❌ 排名数据加载失败，请刷新页面重试</div>';
        return;
    }
    
    const players = getAllPlayers();
    if (!players.length) {
        console.error('[DataViz] getAllPlayers() 返回空数组');
        document.getElementById('playerCheckboxList').innerHTML = '<div style="padding:20px;color:var(--accent-red);">❌ 无法获取球员列表</div>';
        return;
    }
    
    console.log('[DataViz] 成功获取球员列表:', players.length, '人');
    renderPlayerCheckboxes(); 
    renderCompareSelects();
    renderPersonalPlayerSelect();
    const dp = players.slice(0, Math.min(5, players.length));
    const defaultDataCount = parseInt(document.getElementById('pointsTrendDataCount')?.value) || 20;
    renderPointsTrend(dp, defaultDataCount); 
    const defaultStreamCount = parseInt(document.getElementById('streamDataCount')?.value) || 20;
    renderRankStream(Math.min(10, players.length), defaultStreamCount);
    
    // 事件监听
    document.getElementById('applyPointsTrend')?.addEventListener('click', () => { 
        const sel = getSelectedPlayers(); 
        if (!sel.length) { alert('请至少选择一名球员'); return; } 
        if (sel.length > 15) { alert('最多选择15名球员'); return; } 
        const dc = parseInt(document.getElementById('pointsTrendDataCount')?.value) || 20;
        renderPointsTrend(sel, dc); 
    });
    document.getElementById('pointsTrendDataCount')?.addEventListener('change', () => {
        const sel = getSelectedPlayers();
        if (!sel.length) { sel.push(...players.slice(0, Math.min(5, players.length))); }
        const dc = parseInt(document.getElementById('pointsTrendDataCount')?.value) || 20;
        renderPointsTrend(sel, dc);
    });
    document.getElementById('topNSelect')?.addEventListener('change', e => {
        let v = parseInt(e.target.value);
        if (isNaN(v) || v < 1) v = 1;
        if (v > 20) v = 20;
        e.target.value = v;
        const dc = parseInt(document.getElementById('streamDataCount')?.value) || 20;
        renderRankStream(v, dc);
    });
    document.getElementById('streamDataCount')?.addEventListener('change', () => {
        const topN = parseInt(document.getElementById('topNSelect')?.value) || 10;
        const dc = parseInt(document.getElementById('streamDataCount')?.value) || 20;
        renderRankStream(topN, dc);
    });
    document.getElementById('applyCompare')?.addEventListener('click', () => { 
        const pa = document.getElementById('playerASelect')?.value, pb = document.getElementById('playerBSelect')?.value; 
        if (!pa || !pb) { alert('请选择两名球员'); return; } 
        if (pa === pb) { alert('请选择不同的球员'); return; } 
        renderComparison(pa, pb); 
    });
    document.getElementById('applyPersonalStats')?.addEventListener('click', () => {
        const p = document.getElementById('personalPlayerSelect')?.value;
        if (!p) { alert('请选择一名球员'); return; }
        renderPersonalStats(p);
    });
    console.log('[DataViz] 初始化完成');

    // 响应窗口大小变化，重绘图表
    let resizeTimeout;
    window.addEventListener('resize', () => {
        clearTimeout(resizeTimeout);
        resizeTimeout = setTimeout(() => {
            const sel = getSelectedPlayers();
            const dc = parseInt(document.getElementById('pointsTrendDataCount')?.value) || 20;
            if (sel.length && pointsTrendChart) renderPointsTrend(sel, dc);
            const topN = parseInt(document.getElementById('topNSelect')?.value) || 10;
            const sdc = parseInt(document.getElementById('streamDataCount')?.value) || 20;
            if (rankStreamChart) renderRankStream(topN, sdc);
        }, 300);
    });
}
function getAllPlayers() { 
    const playerSet = new Set();
    
    // 1. 从 ranking timeline 的所有快照中收集球员
    if (rankingTimeline && rankingTimeline.length) {
        for (const t of rankingTimeline) {
            if (t.data && t.data.length) {
                for (const p of t.data) {
                    if (p['姓名']) playerSet.add(p['姓名']);
                }
            }
        }
    }
    
    // 2. 从初始积分中收集球员（含无比赛记录的球员）
    if (initialScoresData && initialScoresData.initialScores) {
        for (const name of Object.keys(initialScoresData.initialScores)) {
            if (name) playerSet.add(name);
        }
    }
    
    // 3. 从 score log 中收集球员
    if (scoreLogData && scoreLogData.length) {
        for (const r of scoreLogData) {
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
        console.warn('[DataViz] getAllPlayers: 未找到任何球员');
    }
    return players; 
}
function getSelectedPlayers() { return Array.from(document.querySelectorAll('#playerCheckboxList input[type="checkbox"]:checked')).map(cb => cb.value); }
function renderPlayerCheckboxes() { 
    const container = document.getElementById('playerCheckboxList'); 
    if (!container) return; 
    
    const players = getAllPlayers();
    if (!players.length) {
        container.innerHTML = '<div style="padding:20px;text-align:center;color:var(--text-muted);">暂无球员数据</div>';
        return;
    }
    
    // 获取最后一个非空快照的数据用于显示积分
    let cd = [];
    for (let i = rankingTimeline.length - 1; i >= 0; i--) {
        if (rankingTimeline[i].data && rankingTimeline[i].data.length > 0) {
            cd = rankingTimeline[i].data;
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
function renderCompareSelects() { 
    const players = getAllPlayers();
    if (!players.length) {
        console.warn('[DataViz] renderCompareSelects: 球员列表为空');
        return;
    }
    
    const opts = players.map(p => `<option value="${p}">${p}</option>`).join(''); 
    const sa = document.getElementById('playerASelect'), 
          sb = document.getElementById('playerBSelect'); 
    if (sa) sa.innerHTML = '<option value="">-- 选择球员 --</option>' + opts; 
    if (sb) sb.innerHTML = '<option value="">-- 选择球员 --</option>' + opts; 
    console.log('[DataViz] renderCompareSelects: 已加载', players.length, '名球员');
}
function renderPointsTrend(playerNames, dataCount) { const canvas = document.getElementById('pointsTrendChart'); if (!canvas || !rankingTimeline.length) return; if (pointsTrendChart) { pointsTrendChart.destroy(); pointsTrendChart = null; } dataCount = Math.max(2, Math.min(dataCount || 20, rankingTimeline.length)); const slicedTimeline = rankingTimeline.slice(-dataCount); const isMobile = window.innerWidth <= 768; const labels = slicedTimeline.map(t => t.label); const datasets = playerNames.map((name, idx) => { const data = slicedTimeline.map(t => { const p = t.data.find(x => x['姓名'] === name); return p ? p['当前积分'] : null; }); return { label:name, data, borderColor:CHART_COLORS[idx%CHART_COLORS.length], backgroundColor:CHART_COLORS[idx%CHART_COLORS.length]+'20', borderWidth:isMobile?2:2.5, pointRadius:isMobile?2:4, pointHoverRadius:isMobile?5:7, tension:0.3, fill:false, spanGaps:true }; }); try { pointsTrendChart = new Chart(canvas, { type:'line', data:{labels,datasets}, options:{ responsive:true, maintainAspectRatio:false, interaction:{ intersect:false, mode:'index' }, plugins:{ legend:{ position:'bottom', labels:{ usePointStyle:true, padding:isMobile?10:20, font:{ size:isMobile?10:12, family:"'Poppins', sans-serif" }, boxWidth:isMobile?10:12 } }, tooltip:{ backgroundColor:'rgba(26,29,40,0.9)', titleFont:{ size:isMobile?11:13 }, bodyFont:{ size:isMobile?10:12 }, padding:isMobile?8:12, cornerRadius:8 } }, scales:{ x:{ grid:{ color:'rgba(128,128,128,0.1)' }, ticks:{ font:{ size:isMobile?9:11 }, maxRotation:isMobile?45:0 } }, y:{ beginAtZero:false, grid:{ color:'rgba(128,128,128,0.1)' }, ticks:{ font:{ size:isMobile?9:11 } }, title:{ display:true, text:currentLang==='zh'?'积分':'Points', font:{ size:isMobile?10:12 } } } } } }); } catch(err) { console.error('积分趋势图失败', err); } }
function renderRankStream(topN, dataCount) { 
    const canvas = document.getElementById('rankStreamChart'); 
    if (!canvas || !rankingTimeline.length) return; 
    if (rankStreamChart) { rankStreamChart.destroy(); rankStreamChart = null; } 
    
    dataCount = Math.max(2, Math.min(dataCount || 20, rankingTimeline.length));
    const slicedTimeline = rankingTimeline.slice(-dataCount);
    const isMobile = window.innerWidth <= 768;
    const labels = slicedTimeline.map(t => t.label); 
    
    // 查找最后一个非空快照来获取顶级球员
    let lastNonEmptySnapshot = null;
    for (let i = slicedTimeline.length - 1; i >= 0; i--) {
        if (slicedTimeline[i].data && slicedTimeline[i].data.length > 0) {
            lastNonEmptySnapshot = slicedTimeline[i];
            break;
        }
    }
    
    if (!lastNonEmptySnapshot) {
        console.error('[DataViz] renderRankStream: 没有找到非空快照');
        return;
    }
    
    topN = Math.max(1, Math.min(topN, 20, (lastNonEmptySnapshot.data || []).length));
    const topPlayers = (lastNonEmptySnapshot.data || []).slice(0, topN).map(p => p['姓名']); const textColor = getComputedStyle(document.body).getPropertyValue('--text-primary').trim() || '#1a1a2e'; const datasets = topPlayers.map((name, idx) => { const data = slicedTimeline.map(t => { const ri = t.data.findIndex(x => x['姓名'] === name); return ri >= 0 ? ri + 1 : null; }); const color = STREAM_COLORS[idx%STREAM_COLORS.length]; return { label:name, data, borderColor:color, backgroundColor:color+'25', borderWidth:isMobile?1.5:2, pointRadius:isMobile?2:3, pointHoverRadius:isMobile?4:6, tension:0.4, fill:true, spanGaps:true }; }); try { rankStreamChart = new Chart(canvas, { type:'line', data:{labels,datasets}, options:{ responsive:true, maintainAspectRatio:false, interaction:{ intersect:false, mode:'index' }, plugins:{ legend:{ position:'bottom', labels:{ usePointStyle:true, padding:isMobile?8:16, font:{ size:isMobile?9:11, family:"'Poppins', sans-serif" }, color:textColor, boxWidth:isMobile?10:12 } }, tooltip:{ backgroundColor:'rgba(26,29,40,0.9)', titleFont:{ size:isMobile?11:13 }, bodyFont:{ size:isMobile?10:12 }, padding:isMobile?8:12, cornerRadius:8, callbacks:{ label:ctx => `${ctx.dataset.label}: 第${ctx.raw}名` } } }, scales:{ x:{ grid:{ color:'rgba(128,128,128,0.1)' }, ticks:{ font:{ size:isMobile?9:11 }, maxRotation:isMobile?45:0 } }, y:{ reverse:true, min:1, max:topN, grid:{ color:'rgba(128,128,128,0.1)' }, ticks:{ font:{ size:isMobile?9:11 }, stepSize:1 }, title:{ display:true, text:currentLang==='zh'?'排名':'Rank', font:{ size:isMobile?10:12 } } } } } }); } catch(err) { console.error('排名河流图失败', err); } }

// 计算球员近期状态分（最近10场比赛的积分变化总和）
function calcFormScore(playerName) {
    if (!scoreLogData || !scoreLogData.length) return 0;
    const playerMatches = scoreLogData
        .filter(r => isMatchRecord(r) && (r['胜者'] === playerName || r['负者'] === playerName))
        .sort((a, b) => a['日期'].localeCompare(b['日期']));
    if (!playerMatches.length) return 0;
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
    return totalChange;
}

// 计算预测胜率（基于Elo + 交手 + 状态的三因子模型，无交手时退化为二因子）
function calcPredictedWinRate(rA, rB, aWins, bWins, fA, fB) {
    const pElo = 1 / (1 + Math.pow(10, (rB - rA) / 400));
    const k = 0.02;
    const pForm = 1 / (1 + Math.exp(-k * (fA - fB)));
    if (aWins + bWins === 0) return 0.7 * pElo + 0.3 * pForm;
    const pH2H = (aWins + 2) / (aWins + bWins + 4);
    return 0.6 * pElo + 0.2 * pH2H + 0.2 * pForm;
}

function renderComparison(playerA, playerB) { 
    const container = document.getElementById('compareResult'); 
    if (!container) return; 
    
    // 获取最后一个非空快照的数据
    let lastNonEmptySnapshot = null;
    for (let i = rankingTimeline.length - 1; i >= 0; i--) {
        if (rankingTimeline[i].data && rankingTimeline[i].data.length > 0) {
            lastNonEmptySnapshot = rankingTimeline[i];
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
    const recent = h2h.length ? h2h[h2h.length-1] : null; const aWinRate = total > 0 ? ((aW/total)*100).toFixed(1)+'%' : '-', bWinRate = total > 0 ? ((bW/total)*100).toFixed(1)+'%' : '-';
    // 计算预测胜率
    const rA = ad ? ad['当前积分'] : 1300, rB = bd ? bd['当前积分'] : 1300;
    const fA = calcFormScore(playerA), fB = calcFormScore(playerB);
    const predA = (calcPredictedWinRate(rA, rB, aW, bW, fA, fB) * 100).toFixed(1);
    const predB = (calcPredictedWinRate(rB, rA, bW, aW, fB, fA) * 100).toFixed(1);
    let html = `<div class="compare-summary"><div class="compare-player-col"><div class="compare-player-name">${playerA}</div><div class="compare-player-stat">当前积分: <strong>${ad?ad['当前积分']:'-'}</strong></div><div class="compare-player-stat">交手胜率: <strong>${aWinRate}</strong></div><div class="compare-player-stat">预测胜率: <strong>${predA}%</strong></div></div><div class="compare-divider">VS</div><div class="compare-player-col"><div class="compare-player-name">${playerB}</div><div class="compare-player-stat">当前积分: <strong>${bd?bd['当前积分']:'-'}</strong></div><div class="compare-player-stat">交手胜率: <strong>${bWinRate}</strong></div><div class="compare-player-stat">预测胜率: <strong>${predB}%</strong></div></div></div>`; if (total > 0) { html += `<div style="text-align:center;margin-bottom:16px;"><span style="font-weight:600;">总交手: ${total} 场</span> | <span style="color:#52c41a;">${playerA} ${aW} 胜</span> | <span style="color:#52c41a;">${playerB} ${bW} 胜</span>${recent?` | 最近: ${recent['日期']} (胜者: ${recent['胜者']})`:''}</div><div class="compare-h2h-wrapper"><table class="compare-h2h-table"><thead><tr><th>日期</th><th>类型</th><th>胜者</th><th>${playerA} 积分变动</th><th>${playerB} 积分变动</th></tr></thead><tbody>`; const scores = {}; if (initialScoresData) Object.assign(scores, initialScoresData.initialScores); const sortedLog = [...scoreLogData].sort((a,b) => a['日期'].localeCompare(b['日期'])); for (const m of sortedLog) { if (isMatchRecord(m)) { const w = m['胜者'], l = m['负者']; if (!scores[w]) scores[w] = 1300; if (!scores[l]) scores[l] = 1300; const wg = calcMatchPoints(w, l, m['类型'], m['日期'], m['日期'], scores); if ((w === playerA && l === playerB) || (w === playerB && l === playerA)) { const aIsW = w === playerA; const aChange = aIsW ? wg : -(wg * 0.8); const bChange = aIsW ? -(wg * 0.8) : wg; html += `<tr><td>${m['日期']}</td><td>${m['类型']}</td><td>${w}</td><td class="${aIsW?'win-highlight':'loss-highlight'}">${aChange>0?'+':''}${aChange.toFixed(1)}</td><td class="${!aIsW?'win-highlight':'loss-highlight'}">${bChange>0?'+':''}${bChange.toFixed(1)}</td></tr>`; } scores[w] = Math.max(SCORE_FLOOR, scores[w] + wg); scores[l] = Math.max(SCORE_FLOOR, scores[l] - wg * 0.8); } else if (isBonusRecord(m)) { const target = m['对象']; const bonus = parseFloat(m['分数']) || 0; if (!scores[target]) scores[target] = 1300; scores[target] = Math.max(SCORE_FLOOR, scores[target] + bonus); } } html += '</tbody></table></div>'; } else { html += '<div class="compare-placeholder"><i class="fa-solid fa-circle-info"></i><p>暂无交手记录</p></div>'; } container.innerHTML = html; }
// ========================================
// 个人数据板块
// ========================================

function renderPersonalPlayerSelect() {
    const players = getAllPlayers();
    const sel = document.getElementById('personalPlayerSelect');
    if (!sel) return;
    const opts = players.map(p => `<option value="${p}">${p}</option>`).join('');
    sel.innerHTML = '<option value="">-- 选择球员 --</option>' + opts;
}

function getApproxScoreAtDate(playerName, targetDate, sortedLog, startScores, beforeMatch) {
    const sc = { ...startScores };
    for (const r of sortedLog) {
        if (beforeMatch ? (r['日期'] >= targetDate) : (r['日期'] > targetDate)) break;
        if (isMatchRecord(r)) {
            const w = r['胜者'], l = r['负者'];
            if (!sc[w]) sc[w] = 1300;
            if (!sc[l]) sc[l] = 1300;
            const wg = calcMatchPoints(w, l, r['类型'], r['日期'], r['日期'], sc);
            sc[w] = Math.max(SCORE_FLOOR, sc[w] + wg);
            sc[l] = Math.max(SCORE_FLOOR, sc[l] - wg * 0.8);
        } else if (isBonusRecord(r)) {
            const t = r['对象'];
            const b = parseFloat(r['分数']) || 0;
            if (!sc[t]) sc[t] = 1300;
            sc[t] = Math.max(SCORE_FLOOR, sc[t] + b);
        }
    }
    return Math.round(sc[playerName] || 1300);
}

function renderPersonalStats(playerName) {
    const container = document.getElementById('personalResult');
    if (!container) return;

    if (!scoreLogData || !scoreLogData.length) {
        container.innerHTML = '<div class="compare-placeholder"><p>暂无比赛数据</p></div>';
        return;
    }

    const sortedLog = [...scoreLogData].sort((a, b) => a['日期'].localeCompare(b['日期']));
    const allMatches = sortedLog.filter(r => isMatchRecord(r) && (r['胜者'] === playerName || r['负者'] === playerName));
    const totalMatches = allMatches.length;
    const wins = allMatches.filter(r => r['胜者'] === playerName).length;
    const losses = totalMatches - wins;

    const allPlayers = getAllPlayers();
    let percentile = 0;
    if (allPlayers.length > 1) {
        let cd = [];
        for (let i = rankingTimeline.length - 1; i >= 0; i--) {
            if (rankingTimeline[i].data && rankingTimeline[i].data.length > 0) {
                cd = rankingTimeline[i].data;
                break;
            }
        }
        const myData = cd.find(p => p['姓名'] === playerName);
        if (myData) {
            const myPts = myData['当前积分'];
            const others = cd.filter(p => p['姓名'] !== playerName);
            const below = others.filter(p => p['当前积分'] < myPts).length;
            percentile = others.length > 0 ? (below / others.length * 100) : 0;
        }
    }

    const startScores = initialScoresData ? { ...initialScoresData.initialScores } : {};
    const oppStats = {};
    for (const r of allMatches) {
        const opp = r['胜者'] === playerName ? r['负者'] : r['胜者'];
        const isWin = r['胜者'] === playerName;
        if (!oppStats[opp]) {
            oppStats[opp] = { wins: 0, losses: 0, lastDate: r['日期'], lastWinDate: '', preWinScore: 0, preMatchScore: 0, curScore: 0 };
        }
        if (isWin) { oppStats[opp].wins++; if (r['日期'] >= (oppStats[opp].lastWinDate || '')) oppStats[opp].lastWinDate = r['日期']; }
        else oppStats[opp].losses++;
        if (r['日期'] >= oppStats[opp].lastDate) {
            oppStats[opp].lastDate = r['日期'];
        }
    }

    // 获取最后一个非空快照的数据，用于获取对手当前积分
    let currentCd = [];
    for (let i = rankingTimeline.length - 1; i >= 0; i--) {
        if (rankingTimeline[i].data && rankingTimeline[i].data.length > 0) {
            currentCd = rankingTimeline[i].data;
            break;
        }
    }

    // 计算对手各项分数：比赛时分数（胜利/PK用）和当前分数（福星/苦主用）
    for (const opp in oppStats) {
        const s = oppStats[opp];
        // 比赛时分数：模拟到比赛日期（含当天），即截至显示日期的积分
        if (s.lastWinDate) s.preWinScore = getApproxScoreAtDate(opp, s.lastWinDate, sortedLog, startScores, false);
        s.preMatchScore = getApproxScoreAtDate(opp, s.lastDate, sortedLog, startScores, false);
        // 当前积分
        const oppCur = currentCd.find(p => p['姓名'] === opp);
        s.curScore = oppCur ? oppCur['当前积分'] : getApproxScoreAtDate(opp, s.lastDate, sortedLog, startScores, false);
    }

    const scores = { ...startScores };
    const oppPointsGained = {};
    const oppPointsLost = {};
    for (const r of sortedLog) {
        if (!isMatchRecord(r)) {
            if (isBonusRecord(r)) {
                const t = r['对象'];
                const b = parseFloat(r['分数']) || 0;
                if (!scores[t]) scores[t] = 1300;
                scores[t] = Math.max(SCORE_FLOOR, scores[t] + b);
            }
            continue;
        }
        const w = r['胜者'], l = r['负者'];
        if (!scores[w]) scores[w] = 1300;
        if (!scores[l]) scores[l] = 1300;
        const wg = calcMatchPoints(w, l, r['类型'], r['日期'], r['日期'], scores);
        if (w === playerName) {
            oppPointsGained[l] = (oppPointsGained[l] || 0) + wg;
            oppPointsLost[l] = (oppPointsLost[l] || 0) + wg * 0.8;
        } else if (l === playerName) {
            oppPointsLost[w] = (oppPointsLost[w] || 0) + wg;
            oppPointsGained[w] = (oppPointsGained[w] || 0) + wg * 0.8;
        }
        scores[w] = Math.max(SCORE_FLOOR, scores[w] + wg);
        scores[l] = Math.max(SCORE_FLOOR, scores[l] - wg * 0.8);
    }

    const beatenOpps = Object.entries(oppStats)
        .filter(([_, s]) => s.wins > 0)
        .sort((a, b) => b[1].preWinScore - a[1].preWinScore)
        .slice(0, 3);

    const frequentOpps = Object.entries(oppStats)
        .sort((a, b) => b[1].preMatchScore - a[1].preMatchScore)
        .slice(0, 3);

    const luckyStars = Object.entries(oppStats)
        .map(([name, s]) => {
            const gained = oppPointsGained[name] || 0;
            const lost = oppPointsLost[name] || 0;
            return { name, wins: s.wins, losses: s.losses, curScore: s.curScore, gained, lost, net: gained - lost };
        })
        .filter(x => x.wins + x.losses > 0 && x.net > 0)
        .sort((a, b) => b.net - a.net)
        .slice(0, 3);

    const nemeses = Object.entries(oppStats)
        .map(([name, s]) => {
            const gained = oppPointsGained[name] || 0;
            const lost = oppPointsLost[name] || 0;
            return { name, wins: s.wins, losses: s.losses, curScore: s.curScore, gained, lost, net: gained - lost };
        })
        .filter(x => x.wins + x.losses > 0 && x.net < 0)
        .sort((a, b) => a.net - b.net)
        .slice(0, 3);

    function fmtDate(ds) {
        const d = new Date(ds + 'T00:00:00');
        return d.getFullYear() + '年' + (d.getMonth()+1) + '月' + d.getDate() + '日';
    }

    let html = '';
    html += '<div class="personal-overview">';
    html += '<div class="personal-overview-item"><span class="personal-overview-num">' + totalMatches + '</span><span class="personal-overview-label">总场次</span></div>';
    html += '<div class="personal-overview-item win"><span class="personal-overview-num">' + wins + '</span><span class="personal-overview-label">获胜</span></div>';
    html += '<div class="personal-overview-item loss"><span class="personal-overview-num">' + losses + '</span><span class="personal-overview-label">失利</span></div>';
    html += '<div class="personal-overview-item"><span class="personal-overview-num">' + percentile.toFixed(2) + '%</span><span class="personal-overview-label">积分超过</span></div>';
    html += '</div>';

    html += '<div class="personal-summary-text">';
    html += '<strong>' + playerName + '</strong>共进行了<strong>' + totalMatches + '</strong>盘单打比赛，其中获胜<strong>' + wins + '</strong>盘，失利<strong>' + losses + '</strong>盘。';
    html += '<strong>' + playerName + '</strong>的积分超过了本校<strong>' + percentile.toFixed(2) + '%</strong>的乒乓球选手。';
    html += '</div>';

    html += '<div class="personal-cards-grid">';

    html += '<div class="personal-card victory-card">';
    html += '<div class="personal-card-header"><i class="fa-solid fa-trophy"></i> 胜利 · 曾战胜的前三名</div>';
    if (beatenOpps.length === 0) {
        html += '<div class="personal-card-empty">暂无</div>';
    } else {
        html += '<div class="personal-card-list">';
        beatenOpps.forEach(([name, s], i) => {
            html += '<div class="personal-card-item">';
            html += '<span class="personal-card-rank">' + (i+1) + '</span>';
            html += '<span class="personal-card-name">' + name + '<span class="personal-card-score">(' + s.preWinScore + ')</span></span>';
            html += '<span class="personal-card-date">' + fmtDate(s.lastWinDate) + '</span>';
            html += '</div>';
        });
        html += '</div>';
    }
    html += '</div>';

    html += '<div class="personal-card pk-card">';
    html += '<div class="personal-card-header"><i class="fa-solid fa-hand-fist"></i> PK · 曾交手的前三名</div>';
    if (frequentOpps.length === 0) {
        html += '<div class="personal-card-empty">暂无</div>';
    } else {
        html += '<div class="personal-card-list">';
        frequentOpps.forEach(([name, s], i) => {
            html += '<div class="personal-card-item">';
            html += '<span class="personal-card-rank">' + (i+1) + '</span>';
            html += '<span class="personal-card-name">' + name + '<span class="personal-card-score">(' + s.preMatchScore + ')</span></span>';
            html += '<span class="personal-card-date">' + fmtDate(s.lastDate) + '</span>';
            html += '</div>';
        });
        html += '</div>';
    }
    html += '</div>';

    html += '<div class="personal-card lucky-card">';
    html += '<div class="personal-card-header"><i class="fa-solid fa-star"></i> 福星</div>';
    if (luckyStars.length === 0) {
        html += '<div class="personal-card-empty">暂无</div>';
    } else {
        html += '<div class="personal-card-list">';
        luckyStars.forEach((x, i) => {
            const totalGames = x.wins + x.losses;
            const wr = totalGames > 0 ? ((x.wins / totalGames) * 100).toFixed(0) : 0;
            html += '<div class="personal-card-item">';
            html += '<span class="personal-card-rank">' + (i+1) + '</span>';
            html += '<span class="personal-card-name">' + x.name + '<span class="personal-card-score">(' + x.curScore + ')</span></span>';
            html += '<span class="personal-card-sub">' + x.wins + '胜' + x.losses + '负 胜率:' + wr + '%</span>';
            html += '</div>';
        });
        html += '</div>';
    }
    html += '</div>';

    html += '<div class="personal-card nemesis-card">';
    html += '<div class="personal-card-header"><i class="fa-solid fa-skull"></i> 苦主</div>';
    if (nemeses.length === 0) {
        html += '<div class="personal-card-empty">暂无</div>';
    } else {
        html += '<div class="personal-card-list">';
        nemeses.forEach((x, i) => {
            const totalGames = x.wins + x.losses;
            const wr = totalGames > 0 ? ((x.wins / totalGames) * 100).toFixed(0) : 0;
            html += '<div class="personal-card-item">';
            html += '<span class="personal-card-rank">' + (i+1) + '</span>';
            html += '<span class="personal-card-name">' + x.name + '<span class="personal-card-score">(' + x.curScore + ')</span></span>';
            html += '<span class="personal-card-sub">' + x.wins + '胜' + x.losses + '负 胜率:' + wr + '%</span>';
            html += '</div>';
        });
        html += '</div>';
    }
    html += '</div>';

    html += '</div>';
    container.innerHTML = html;
}
