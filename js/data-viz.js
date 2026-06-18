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
    const dp = players.slice(0, Math.min(5, players.length));
    renderPointsTrend(dp); 
    renderRankStream(Math.min(10, players.length));
    
    // 事件监听
    document.getElementById('applyPointsTrend')?.addEventListener('click', () => { 
        const sel = getSelectedPlayers(); 
        if (!sel.length) { alert('请至少选择一名球员'); return; } 
        if (sel.length > 15) { alert('最多选择15名球员'); return; } 
        renderPointsTrend(sel); 
    });
    document.getElementById('topNSelect')?.addEventListener('change', e => renderRankStream(parseInt(e.target.value)));
    document.getElementById('applyCompare')?.addEventListener('click', () => { 
        const pa = document.getElementById('playerASelect')?.value, pb = document.getElementById('playerBSelect')?.value; 
        if (!pa || !pb) { alert('请选择两名球员'); return; } 
        if (pa === pb) { alert('请选择不同的球员'); return; } 
        renderComparison(pa, pb); 
    });
    console.log('[DataViz] 初始化完成');

    // 响应窗口大小变化，重绘图表
    let resizeTimeout;
    window.addEventListener('resize', () => {
        clearTimeout(resizeTimeout);
        resizeTimeout = setTimeout(() => {
            const sel = getSelectedPlayers();
            if (sel.length && pointsTrendChart) renderPointsTrend(sel);
            const topN = parseInt(document.getElementById('topNSelect')?.value || '10');
            if (rankStreamChart) renderRankStream(topN);
        }, 300);
    });
}
function getAllPlayers() { 
    if (!rankingTimeline || !rankingTimeline.length) {
        console.warn('[DataViz] rankingTimeline 不存在或为空');
        return []; 
    }
    
    // 查找最后一个非空的快照，而不是最后一个快照
    let lastNonEmptySnapshot = null;
    for (let i = rankingTimeline.length - 1; i >= 0; i--) {
        if (rankingTimeline[i].data && rankingTimeline[i].data.length > 0) {
            lastNonEmptySnapshot = rankingTimeline[i];
            console.log('[DataViz] 找到最后一个非空快照:', lastNonEmptySnapshot.label, '数据长度:', lastNonEmptySnapshot.data.length);
            break;
        }
    }
    
    if (!lastNonEmptySnapshot) {
        console.error('[DataViz] 没有找到包含数据的快照');
        return []; 
    }
    
    return lastNonEmptySnapshot.data.map(p => p['姓名']); 
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
function renderPointsTrend(playerNames) { const canvas = document.getElementById('pointsTrendChart'); if (!canvas || !rankingTimeline.length) return; if (pointsTrendChart) { pointsTrendChart.destroy(); pointsTrendChart = null; } const isMobile = window.innerWidth <= 768; const labels = rankingTimeline.map(t => t.label); const datasets = playerNames.map((name, idx) => { const data = rankingTimeline.map(t => { const p = t.data.find(x => x['姓名'] === name); return p ? p['当前积分'] : null; }); return { label:name, data, borderColor:CHART_COLORS[idx%CHART_COLORS.length], backgroundColor:CHART_COLORS[idx%CHART_COLORS.length]+'20', borderWidth:isMobile?2:2.5, pointRadius:isMobile?2:4, pointHoverRadius:isMobile?5:7, tension:0.3, fill:false, spanGaps:true }; }); try { pointsTrendChart = new Chart(canvas, { type:'line', data:{labels,datasets}, options:{ responsive:true, maintainAspectRatio:false, interaction:{ intersect:false, mode:'index' }, plugins:{ legend:{ position:'bottom', labels:{ usePointStyle:true, padding:isMobile?10:20, font:{ size:isMobile?10:12, family:"'Poppins', sans-serif" }, boxWidth:isMobile?10:12 } }, tooltip:{ backgroundColor:'rgba(26,29,40,0.9)', titleFont:{ size:isMobile?11:13 }, bodyFont:{ size:isMobile?10:12 }, padding:isMobile?8:12, cornerRadius:8 } }, scales:{ x:{ grid:{ color:'rgba(128,128,128,0.1)' }, ticks:{ font:{ size:isMobile?9:11 }, maxRotation:isMobile?45:0 } }, y:{ beginAtZero:false, grid:{ color:'rgba(128,128,128,0.1)' }, ticks:{ font:{ size:isMobile?9:11 } }, title:{ display:true, text:currentLang==='zh'?'积分':'Points', font:{ size:isMobile?10:12 } } } } } }); } catch(err) { console.error('积分趋势图失败', err); } }
function renderRankStream(topN) { 
    const canvas = document.getElementById('rankStreamChart'); 
    if (!canvas || !rankingTimeline.length) return; 
    if (rankStreamChart) { rankStreamChart.destroy(); rankStreamChart = null; } 
    
    const isMobile = window.innerWidth <= 768;
    const labels = rankingTimeline.map(t => t.label); 
    
    // 查找最后一个非空快照来获取顶级球员
    let lastNonEmptySnapshot = null;
    for (let i = rankingTimeline.length - 1; i >= 0; i--) {
        if (rankingTimeline[i].data && rankingTimeline[i].data.length > 0) {
            lastNonEmptySnapshot = rankingTimeline[i];
            break;
        }
    }
    
    if (!lastNonEmptySnapshot) {
        console.error('[DataViz] renderRankStream: 没有找到非空快照');
        return;
    }
    
    const topPlayers = (lastNonEmptySnapshot.data || []).slice(0, topN).map(p => p['姓名']); const textColor = getComputedStyle(document.body).getPropertyValue('--text-primary').trim() || '#1a1a2e'; const datasets = topPlayers.map((name, idx) => { const data = rankingTimeline.map(t => { const ri = t.data.findIndex(x => x['姓名'] === name); return ri >= 0 ? ri + 1 : null; }); const color = STREAM_COLORS[idx%STREAM_COLORS.length]; return { label:name, data, borderColor:color, backgroundColor:color+'25', borderWidth:isMobile?1.5:2, pointRadius:isMobile?2:3, pointHoverRadius:isMobile?4:6, tension:0.4, fill:true, spanGaps:true }; }); try { rankStreamChart = new Chart(canvas, { type:'line', data:{labels,datasets}, options:{ responsive:true, maintainAspectRatio:false, interaction:{ intersect:false, mode:'index' }, plugins:{ legend:{ position:'bottom', labels:{ usePointStyle:true, padding:isMobile?8:16, font:{ size:isMobile?9:11, family:"'Poppins', sans-serif" }, color:textColor, boxWidth:isMobile?10:12 } }, tooltip:{ backgroundColor:'rgba(26,29,40,0.9)', titleFont:{ size:isMobile?11:13 }, bodyFont:{ size:isMobile?10:12 }, padding:isMobile?8:12, cornerRadius:8, callbacks:{ label:ctx => `${ctx.dataset.label}: 第${ctx.raw}名` } } }, scales:{ x:{ grid:{ color:'rgba(128,128,128,0.1)' }, ticks:{ font:{ size:isMobile?9:11 }, maxRotation:isMobile?45:0 } }, y:{ reverse:true, min:1, max:topN, grid:{ color:'rgba(128,128,128,0.1)' }, ticks:{ font:{ size:isMobile?9:11 }, stepSize:1 }, title:{ display:true, text:currentLang==='zh'?'排名':'Rank', font:{ size:isMobile?10:12 } } } } } }); } catch(err) { console.error('排名河流图失败', err); } }
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
    const recent = h2h.length ? h2h[h2h.length-1] : null; const aWinRate = total > 0 ? ((aW/total)*100).toFixed(1)+'%' : '-', bWinRate = total > 0 ? ((bW/total)*100).toFixed(1)+'%' : '-'; let html = `<div class="compare-summary"><div class="compare-player-col"><div class="compare-player-name">${playerA}</div><div class="compare-player-stat">当前积分: <strong>${ad?ad['当前积分']:'-'}</strong></div><div class="compare-player-stat">交手胜率: <strong>${aWinRate}</strong></div></div><div class="compare-divider">VS</div><div class="compare-player-col"><div class="compare-player-name">${playerB}</div><div class="compare-player-stat">当前积分: <strong>${bd?bd['当前积分']:'-'}</strong></div><div class="compare-player-stat">交手胜率: <strong>${bWinRate}</strong></div></div></div>`; if (total > 0) { html += `<div style="text-align:center;margin-bottom:16px;"><span style="font-weight:600;">总交手: ${total} 场</span> | <span style="color:#52c41a;">${playerA} ${aW} 胜</span> | <span style="color:#52c41a;">${playerB} ${bW} 胜</span>${recent?` | 最近: ${recent['日期']} (胜者: ${recent['胜者']})`:''}</div><div class="compare-h2h-wrapper"><table class="compare-h2h-table"><thead><tr><th>日期</th><th>类型</th><th>胜者</th><th>${playerA} 积分变动</th><th>${playerB} 积分变动</th></tr></thead><tbody>`; const scores = {}; if (initialScoresData) Object.assign(scores, initialScoresData.initialScores); const sortedLog = [...scoreLogData].sort((a,b) => a['日期'].localeCompare(b['日期'])); for (const m of sortedLog) { if (isMatchRecord(m)) { const w = m['胜者'], l = m['负者']; if (!scores[w]) scores[w] = 1500; if (!scores[l]) scores[l] = 1500; const wg = calcMatchPoints(w, l, m['类型'], m['日期'], m['日期'], scores); if ((w === playerA && l === playerB) || (w === playerB && l === playerA)) { const aIsW = w === playerA; const aChange = aIsW ? wg : -(wg * 0.8); const bChange = aIsW ? -(wg * 0.8) : wg; html += `<tr><td>${m['日期']}</td><td>${m['类型']}</td><td>${w}</td><td class="${aIsW?'win-highlight':'loss-highlight'}">${aChange>0?'+':''}${aChange.toFixed(1)}</td><td class="${!aIsW?'win-highlight':'loss-highlight'}">${bChange>0?'+':''}${bChange.toFixed(1)}</td></tr>`; } scores[w] = Math.max(SCORE_FLOOR, scores[w] + wg); scores[l] = Math.max(SCORE_FLOOR, scores[l] - wg * 0.8); } else if (isBonusRecord(m)) { const target = m['对象']; const bonus = parseFloat(m['分数']) || 0; if (!scores[target]) scores[target] = 1500; scores[target] = Math.max(SCORE_FLOOR, scores[target] + bonus); } } html += '</tbody></table></div>'; } else { html += '<div class="compare-placeholder"><i class="fa-solid fa-circle-info"></i><p>暂无交手记录</p></div>'; } container.innerHTML = html; }