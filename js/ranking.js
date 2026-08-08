/* ========================================
   ranking.js - 排名系统 + 积分明细（修复赛季继承）
   ======================================== */

let currentScoreContext = { player: '', snapshotDate: '' };

if (scoreDetailClose && scoreDetailModal) { scoreDetailClose.addEventListener('click', () => closeModal(scoreDetailModal)); scoreDetailModal.addEventListener('click', e => { if (e.target === scoreDetailModal) closeModal(scoreDetailModal); }); }
document.addEventListener('keydown', e => { if (e.key === 'Escape' && scoreDetailModal && scoreDetailModal.classList.contains('active')) closeModal(scoreDetailModal); });

function showScoreDetail(playerName, snapshotDate) {
    if (!scoreDetailModal || !scoreDetailBody) return;
    currentScoreContext = { player: playerName, snapshotDate: snapshotDate || (rankingTimeline[currentTimeIndex]?.time || '') };
    scoreDetailTitle.textContent = `${playerName} - ${i18n[currentLang].score_detail_title}（${rankingTimeline[currentTimeIndex]?.label || ''}）`;
    renderScoreDetail();
    adjustModalSize();
    openModal(scoreDetailModal);
}
function adjustModalSize() { if (!scoreDetailModal) return; scoreDetailModal.classList.remove('content-fit'); setTimeout(() => { const tw = scoreDetailModal.querySelector('.score-detail-table-wrapper'), tb = scoreDetailModal.querySelector('.score-detail-table'); if (tw && tb && tb.scrollWidth <= tw.clientWidth + 2 && tb.scrollHeight <= tw.clientHeight + 2) scoreDetailModal.classList.add('content-fit'); }, 100); }

function renderScoreDetail() {
    if (!scoreDetailBody) return;
    const player = currentScoreContext.player;
    const snapshotDate = currentScoreContext.snapshotDate;
    if (!player || !snapshotDate) return;

    // 找到快照日期所在的赛季
    const currentSeason = getSeasonForDate(snapshotDate);
    if (!currentSeason) return;

    // 找到该赛季的索引
    const seasonIndex = seasonsData.indexOf(currentSeason);
    
    // 获取该赛季的初始积分（考虑继承）
    const seasonStartScores = getSeasonStartScores(seasonIndex);

    // 只获取当前赛季内的比赛记录（从赛季开始到快照日期）
    let records = scoreLogData.filter(r =>
        r['日期'] >= currentSeason.startDate &&
        r['日期'] <= snapshotDate &&
        ((isMatchRecord(r) && (r['胜者'] === player || r['负者'] === player)) ||
         (isBonusRecord(r) && r['对象'] === player))
    );
    records.sort((a, b) => a['日期'].localeCompare(b['日期']));

    if (!records.length) { scoreDetailBody.innerHTML = '<tr><td colspan="7" style="text-align:center;padding:20px;">暂无记录</td></tr>'; setTimeout(() => { if (scoreDetailModal) scoreDetailModal.classList.add('content-fit'); }, 100); return; }

    // 从赛季初始积分开始计算
    const scores = { ...seasonStartScores };
    const allRecords = [...scoreLogData].sort((a, b) => a['日期'].localeCompare(b['日期']));
    const recordsWithScores = [];
    // 构建赛季内 [赛季开始日, 快照日] 的批次定格索引
    playerTypeBatches = buildPlayerTypeBatches(allRecords.filter(r => r['日期'] >= currentSeason.startDate && r['日期'] <= snapshotDate));

    for (const record of allRecords) {
        // 只处理当前赛季开始到快照日期之间的记录
        if (record['日期'] < currentSeason.startDate || record['日期'] > snapshotDate) continue;

        if (isMatchRecord(record)) {
            const w = record['胜者'], l = record['负者'];
            if (!scores[w]) scores[w] = DEFAULT_INITIAL_SCORE; if (!scores[l]) scores[l] = DEFAULT_INITIAL_SCORE;
            const decayedGain = calcMatchPoints(w, l, record['类型'], record['日期'], snapshotDate, scores);
            const rawGain = calcRawPoints(w, l, record['类型'], scores);
            if (record['胜者'] === player || record['负者'] === player) {
                const isWinner = record['胜者'] === player;
                const rawChange = isWinner ? rawGain : -(rawGain * 0.8);
                const decayedChange = isWinner ? decayedGain : -(decayedGain * 0.8);
                const scoreBefore = scores[player];
                const scoreAfter = scoreBefore + decayedChange;
                recordsWithScores.push({ date: record['日期'], type: record['类型'], opponent: isWinner ? record['负者'] : record['胜者'], isWinner, isBonus: false, scoreBefore, rawChange, decayedChange, scoreAfter });
            }
            scores[w] = Math.max(SCORE_FLOOR, scores[w] + decayedGain);
            scores[l] = Math.max(SCORE_FLOOR, scores[l] - decayedGain * 0.8);
        } else if (isBonusRecord(record) && record['对象'] === player) {
            const bonus = parseFloat(record['分数']) || 0;
            if (!scores[player]) scores[player] = DEFAULT_INITIAL_SCORE;
            recordsWithScores.push({ date: record['日期'], type: i18n[currentLang].score_type_bonus, opponent: '-', isWinner: true, isBonus: true, scoreBefore: scores[player], rawChange: bonus, decayedChange: bonus, scoreAfter: scores[player] + bonus });
            scores[player] = Math.max(SCORE_FLOOR, scores[player] + bonus);
        } else if (isBonusRecord(record)) {
            const target = record['对象']; const bonus = parseFloat(record['分数']) || 0;
            if (!scores[target]) scores[target] = DEFAULT_INITIAL_SCORE;
            scores[target] = Math.max(SCORE_FLOOR, scores[target] + bonus);
        }
    }

    recordsWithScores.reverse();
    scoreDetailBody.innerHTML = recordsWithScores.map(r => {
        if (r.isBonus) { const cc = r.decayedChange >= 0 ? 'score-change-positive' : 'score-change-negative'; const sign = r.decayedChange >= 0 ? '+' : ''; return `<tr><td>${escapeHtml(r.date)}</td><td>${escapeHtml(r.type)}</td><td>-</td><td class="result-win">加分</td><td>${r.scoreBefore.toFixed(1)}</td><td class="${cc}">${sign}${r.decayedChange.toFixed(1)}</td><td>${r.scoreAfter.toFixed(1)}</td></tr>`; }
        const res = r.isWinner ? i18n[currentLang].score_result_win : i18n[currentLang].score_result_loss;
        const rc = r.isWinner ? 'result-win' : 'result-loss';
        const cc = r.decayedChange >= 0 ? 'score-change-positive' : 'score-change-negative';
        const signRaw = r.rawChange >= 0 ? '+' : '';
        const signDecayed = r.decayedChange >= 0 ? '+' : '';
        const changeDisplay = `${signRaw}${r.rawChange.toFixed(1)}（${signDecayed}${r.decayedChange.toFixed(1)}）`;
        return `<tr><td>${escapeHtml(r.date)}</td><td>${escapeHtml(r.type)}</td><td>${escapeHtml(r.opponent)}</td><td class="${rc}">${res}</td><td>${r.scoreBefore.toFixed(1)}</td><td class="${cc}">${changeDisplay}</td><td>${r.scoreAfter.toFixed(1)}</td></tr>`;
    }).join('');
    setTimeout(adjustModalSize, 150);
}

async function loadRankingData() {
    const tb = document.getElementById('rankingFullBody');
    if (!tb) return;

    // 显示加载进度
    function updateProgress(msg) {
        if (tb) {
            tb.innerHTML = `<tr><td colspan="7" style="text-align:center;padding:40px;">
                <div class="wtt-spinner" style="width:36px;height:36px;border:3px solid var(--border-color);border-top-color:var(--accent-blue);border-radius:50%;animation:wttSpin 0.8s linear infinite;margin:0 auto 12px;"></div>
                <p style="color:var(--text-secondary);">正在加载排名数据...</p>
                <p class="wtt-progress-text" style="font-size:0.8rem;color:var(--text-tertiary);margin-top:4px;">${msg}</p>
            </td></tr>`;
        }
    }

    updateProgress('准备下载数据文件...');

    try {
        // 逐个加载数据文件，显示详细进度
        const dataFiles = [
            { name: 'score-log.json',        loader: loadScoreLogData,      label: '比赛记录' },
            { name: 'initial-scores.json',   loader: loadInitialScores,     label: '初始积分' },
            { name: 'event-coefficient.json',loader: loadEventCoefficients, label: '赛事系数' },
            { name: 'decay-config.json',     loader: loadDecayConfig,       label: '衰减配置' },
            { name: 'seasons.json',          loader: loadSeasons,           label: '赛季配置' }
        ];

        for (let i = 0; i < dataFiles.length; i++) {
            const f = dataFiles[i];
            updateProgress(`正在下载 ${f.label} (${i + 1}/${dataFiles.length}): ${f.name}`);
            await new Promise(r => setTimeout(r, 0));
            await f.loader();
        }

        if (!initialScoresData || !eventCoefficients || !seasonsData) throw new Error('数据加载失败');

        updateProgress('正在计算排名积分（此过程可能较慢，请耐心等待）...');
        await new Promise(r => setTimeout(r, 0));

        // 同步计算（club数据量小，不需要分块异步）
        rankingTimeline = calculateAllRankingsWithSeasons(scoreLogData, initialScoresData.initialScores, seasonsData);
        const rt = calculateRealtimeRanking();
        if (rt) rankingTimeline.push(rt);
        currentTimeIndex = rankingTimeline.length - 1;
        currentSortKey = '当前积分';
        currentSortDir = 'desc';
        renderTimeNodeList();
        updateRankingDisplay();
        setupSortListeners();
    } catch(e) {
        console.error('排名计算失败', e);
        tb.innerHTML = '<tr><td colspan="7" style="text-align:center;padding:40px;color:var(--accent-red);">无法计算排名数据</td></tr>';
    }
}

function renderTimeNodeList() { const list = document.getElementById('timeNodeList'), lbl = document.getElementById('currentTimeLabel'); if (!list || !rankingTimeline.length) return; list.innerHTML = '';

    // 分离实时积分节点和普通节点
    const realtimeNodes = [], regularNodes = [];
    rankingTimeline.forEach((n, i) => { if (n.isRealtime) realtimeNodes.push({ ...n, index: i }); else regularNodes.push({ ...n, index: i }); });

    // 渲染实时积分节点（置于最顶部）
    realtimeNodes.forEach(n => {
        const rli = document.createElement('li');
        rli.className = `realtime-group`;
        rli.innerHTML = `<div class="realtime-header"><i class="fa-solid fa-clock"></i><span class="realtime-label">${i18n[currentLang].rank_realtime_header}</span></div><ul class="season-node-list"><li class="time-node-item realtime-node ${n.index===currentTimeIndex?'active':''}" data-index="${n.index}"><span class="node-dot"></span>${n.label}<span class="node-count">${n.data.length}人</span></li></ul>`;
        list.appendChild(rli);
        rli.querySelector('.time-node-item').addEventListener('click', () => {
            currentTimeIndex = parseInt(rli.querySelector('.time-node-item').getAttribute('data-index'));
            currentSortKey = '当前积分'; currentSortDir = 'desc';
            updateRankingDisplay(); renderTimeNodeList();
        });
    });

    // 渲染赛季分组
    const seasons = {};
    regularNodes.forEach((n, i) => { const s = n.season || '默认赛季'; if (!seasons[s]) seasons[s] = []; seasons[s].push({ ...n, index: n.index }); });
    Object.entries(seasons).forEach(([season, nodes]) => { const sli = document.createElement('li'); sli.className = 'season-group'; sli.innerHTML = `<div class="season-header"><i class="fa-solid fa-chevron-down season-arrow"></i><span class="season-label">${season}</span><span class="season-count">${nodes.length}个节点</span></div><ul class="season-node-list">${nodes.map(n => `<li class="time-node-item ${n.index===currentTimeIndex?'active':''} ${n.isInitial?'initial-node':''}" data-index="${n.index}"><span class="node-dot"></span>${n.label}<span class="node-count">${n.data.length}人</span></li>`).join('')}</ul>`; list.appendChild(sli); sli.querySelector('.season-header').addEventListener('click', () => sli.classList.toggle('collapsed')); sli.querySelectorAll('.time-node-item').forEach(item => { item.addEventListener('click', () => { currentTimeIndex = parseInt(item.getAttribute('data-index')); currentSortKey = '当前积分'; currentSortDir = 'desc'; updateRankingDisplay(); renderTimeNodeList(); }); }); });
    // 折叠非当前赛季的时间节点
    const curSeason = rankingTimeline[currentTimeIndex]?.season;
    if (curSeason) {
        list.querySelectorAll('.season-group').forEach(sg => {
            if (sg.querySelector('.season-label')?.textContent !== curSeason) {
                sg.classList.add('collapsed');
            }
        });
    }
    if (lbl && rankingTimeline[currentTimeIndex]) lbl.textContent = rankingTimeline[currentTimeIndex].label;
}
function calculateRankChanges(cd, pd, isInitial) { if (!pd || isInitial) return cd.map((p, i) => ({ ...p, rank: i+1, change: 0, changeType: 'new', pointsChange: 0, pointsChangeType: 'new' })); const prm = {}, ppm = {}; pd.forEach((p, i) => { prm[p['姓名']] = i+1; ppm[p['姓名']] = p['当前积分'] || 0; }); return cd.map((p, i) => { const cr = i+1, pr = prm[p['姓名']], pp = ppm[p['姓名']], cp = p['当前积分'] || 0; let rc = 0, rct = 'new'; if (pr === undefined) rct = 'new'; else { rc = pr - cr; if (rc > 0) rct = 'up'; else if (rc < 0) rct = 'down'; else rct = 'same'; } let pc = 0, pct = 'new'; if (pp === undefined) pct = 'new'; else { pc = cp - pp; if (pc > 0.05) pct = 'up'; else if (pc < -0.05) pct = 'down'; else pct = 'same'; } return { ...p, rank: cr, change: rc, changeType: rct, pointsChange: pc, pointsChangeType: pct }; }); }
function updateRankingDisplay() { if (!rankingTimeline.length || !rankingTimeline[currentTimeIndex]) return; const cn = rankingTimeline[currentTimeIndex], pn = currentTimeIndex > 0 ? rankingTimeline[currentTimeIndex-1] : null; currentDisplayData = calculateRankChanges(cn.data, pn ? pn.data : null, cn.isInitial); currentDisplayData = sortDisplayData(currentSortKey, currentSortDir); renderRankingTable(currentDisplayData); const ind = document.getElementById('sortIndicator'); if (ind) ind.textContent = `${currentSortKey}${currentSortDir==='desc'?'降序':'升序'}`; updateSortHeaderHighlight(); const lbl = document.getElementById('currentTimeLabel'); if (lbl) lbl.textContent = cn.label; }
function sortDisplayData(key, dir) { return [...currentDisplayData].sort((a, b) => { let va, vb; if (key === '胜率') { va = parseWinRate(a['胜率']); vb = parseWinRate(b['胜率']); } else if (key === '姓名') return dir === 'asc' ? (a['姓名']||'').localeCompare(b['姓名']||'', 'zh') : (b['姓名']||'').localeCompare(a['姓名']||'', 'zh'); else if (key === 'rank') { va = a.rank || 0; vb = b.rank || 0; } else if (key === '变化') { va = a.change || 0; vb = b.change || 0; } else if (key === '积分变化') { va = a.pointsChange || 0; vb = b.pointsChange || 0; } else { va = a[key] || 0; vb = b[key] || 0; } return va < vb ? (dir === 'asc' ? -1 : 1) : va > vb ? (dir === 'asc' ? 1 : -1) : 0; }); }
function renderRankingTable(data) { const tb = document.getElementById('rankingFullBody'); if (!tb) return; if (!data || !data.length) { tb.innerHTML = '<tr><td colspan="7" style="text-align:center;padding:40px;">暂无排名数据</td></tr>'; return; } tb.innerHTML = ''; const currentSnapshotDate = rankingTimeline[currentTimeIndex]?.time || ''; data.forEach((p, i) => { const tr = document.createElement('tr'); const wr = p['胜率'] || '0%', wd = wr === '#DIV/0!' || wr === '-' ? '0%' : wr; let ch = '', pch = ''; if (p.changeType === 'up') ch = `<span class="rank-change rank-up">▲${Math.abs(p.change)}</span>`; else if (p.changeType === 'down') ch = `<span class="rank-change rank-down">▼${Math.abs(p.change)}</span>`; else if (p.changeType === 'new') ch = '<span class="rank-new">NEW</span>'; else ch = '<span class="rank-same">-</span>'; if (p.pointsChangeType === 'up') pch = `<span class="rank-change rank-up">▲${Math.abs(p.pointsChange).toFixed(1)}</span>`; else if (p.pointsChangeType === 'down') pch = `<span class="rank-change rank-down">▼${Math.abs(p.pointsChange).toFixed(1)}</span>`; else if (p.pointsChangeType === 'new') pch = '<span class="rank-new">NEW</span>'; else pch = '<span class="rank-same">-</span>'; const pn = String(p['姓名'] || '-'); const pnSafe = escapeHtml(pn); const sds = escapeHtml(currentSnapshotDate || ''); const nc = (scoreLogData.length > 0) ? `<span class="player-name-link" onclick="showScoreDetail('${pnSafe}','${sds}')" title="点击查看积分明细">${pnSafe}</span>` : pnSafe; tr.innerHTML = `<td>${i+1}</td><td>${nc}</td><td><strong>${(p['当前积分'] || 0).toFixed(1)}</strong></td><td>${pch}</td><td>${ch}</td><td>${p['总场次'] || 0}</td><td>${wd}</td>`; tb.appendChild(tr); }); }
function updateSortHeaderHighlight() { document.querySelectorAll('.ranking-table-full th.sortable').forEach(th => { th.classList.remove('active-sort'); if (th.getAttribute('data-sort') === currentSortKey) th.classList.add('active-sort'); }); }
function setupSortListeners() { document.querySelectorAll('.ranking-table-full th.sortable').forEach(th => { const nt = th.cloneNode(true); th.parentNode.replaceChild(nt, th); nt.addEventListener('click', () => { const key = nt.getAttribute('data-sort'); currentSortDir = key === currentSortKey ? (currentSortDir === 'desc' ? 'asc' : 'desc') : 'desc'; currentSortKey = key; currentDisplayData = sortDisplayData(key, currentSortDir); renderRankingTable(currentDisplayData); updateSortHeaderHighlight(); document.querySelectorAll('.ranking-table-full th.sortable').forEach(h => { const a = h.querySelector('.sort-arrow'); if (a) a.innerHTML = ''; }); const ar = nt.querySelector('.sort-arrow'); if (ar) ar.innerHTML = currentSortDir === 'desc' ? '&#9660;' : '&#9650;'; nt.classList.add('active-sort'); document.getElementById('sortIndicator').textContent = `${key}${currentSortDir === 'desc' ? '降序' : '升序'}`; }); }); }