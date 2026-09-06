/* ========================================
   ranking.js - 排名系统 + 积分明细（修复赛季继承）
   ======================================== */

let currentScoreContext = { player: '', snapshotDate: '' };

if (scoreDetailClose && scoreDetailModal) { scoreDetailClose.addEventListener('click', () => closeModal(scoreDetailModal)); scoreDetailModal.addEventListener('click', e => { if (e.target === scoreDetailModal) closeModal(scoreDetailModal); }); }
document.addEventListener('keydown', e => { if (e.key === 'Escape' && scoreDetailModal && scoreDetailModal.classList.contains('active')) closeModal(scoreDetailModal); });

/* 积分明细入口统一走事件委托（避免内联 onclick 拼接球员名） */
function handleScoreDetailTrigger(e) {
    const el = e.target.closest('[data-player][data-snapshot]');
    if (!el || el.tagName === 'A') return;
    if (e.type === 'keydown' && e.key !== 'Enter' && e.key !== ' ') return;
    if (e.type === 'keydown') e.preventDefault();
    showScoreDetail(el.dataset.player, el.dataset.snapshot);
}
document.addEventListener('click', handleScoreDetailTrigger);
document.addEventListener('keydown', handleScoreDetailTrigger);

function showScoreDetail(playerName, snapshotDate) {
    if (!scoreDetailModal || !scoreDetailBody) return;
    currentScoreContext = { player: playerName, snapshotDate: snapshotDate || (rankingTimeline[currentTimeIndex]?.time || '') };
    scoreDetailTitle.textContent = `${playerName} - ${i18n[currentLang].score_detail_title}（${getNodeDisplayLabel(rankingTimeline[currentTimeIndex])}）`;
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

    if (!records.length) { scoreDetailBody.innerHTML = `<tr><td colspan="7" style="text-align:center;padding:20px;">${i18n[currentLang].rank_no_records}</td></tr>`; setTimeout(() => { if (scoreDetailModal) scoreDetailModal.classList.add('content-fit'); }, 100); return; }

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
            const decayedGain = calcMatchPoints(w, l, record['类型'], record['日期'], snapshotDate, scores, record['赛制']);
            const rawGain = calcRawPoints(w, l, record['类型'], scores, record['赛制']);
            if (record['胜者'] === player || record['负者'] === player) {
                const isWinner = record['胜者'] === player;
                const rawChange = isWinner ? rawGain : -(rawGain * LOSER_POINT_MULTIPLIER);
                const decayedChange = isWinner ? decayedGain : -(decayedGain * LOSER_POINT_MULTIPLIER);
                const scoreBefore = scores[player];
                const scoreAfter = scoreBefore + decayedChange;
                recordsWithScores.push({ date: record['日期'], type: record['类型'], opponent: isWinner ? record['负者'] : record['胜者'], isWinner, isBonus: false, scoreBefore, rawChange, decayedChange, scoreAfter });
            }
            scores[w] = Math.max(SCORE_FLOOR, scores[w] + decayedGain);
            scores[l] = Math.max(SCORE_FLOOR, scores[l] - decayedGain * LOSER_POINT_MULTIPLIER);
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
        if (r.isBonus) { const cc = r.decayedChange >= 0 ? 'score-change-positive' : 'score-change-negative'; const sign = r.decayedChange >= 0 ? '+' : ''; return `<tr><td>${escapeHtml(r.date)}</td><td>${escapeHtml(r.type)}</td><td>-</td><td class="result-win">${i18n[currentLang].rank_add_short}</td><td>${r.scoreBefore.toFixed(1)}</td><td class="${cc}">${sign}${r.decayedChange.toFixed(1)}</td><td>${r.scoreAfter.toFixed(1)}</td></tr>`; }
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
                <p style="color:var(--text-secondary);">${i18n[currentLang].rank_loading}</p>
                <p class="wtt-progress-text" style="font-size:0.8rem;color:var(--text-tertiary);margin-top:4px;">${msg}</p>
            </td></tr>`;
        }
    }

    updateProgress(i18n[currentLang].rank_prepare);

    try {
        // 两波并行下载（替代原 6 文件纯串行 await，省去叠加的请求往返）：
        // 波1：players / event-coefficient / decay-config / seasons 互不依赖，全部并行；
        // 波2：score-log（normalizeScoreLog 依赖 players 建立的 nameIndex 做别名归一）
        //      与 initial-scores（loadInitialScores 读取 playersData）都依赖波1的 players，
        //      但两者之间无依赖，可并行。
        const L = i18n[currentLang];
        const wave1 = [
            { name: 'players.json',          loader: loadPlayers,           label: L.data_viz_file_players },
            { name: 'event-coefficient.json',loader: loadEventCoefficients, label: L.data_viz_file_event },
            { name: 'decay-config.json',     loader: loadDecayConfig,       label: L.data_viz_file_decay },
            { name: 'seasons.json',          loader: loadSeasons,           label: L.data_viz_file_season }
        ];
        const wave2 = [
            { name: 'score-log.json',        loader: loadScoreLogData,      label: L.data_viz_file_matches },
            { name: 'initial-scores.json',   loader: loadInitialScores,     label: L.data_viz_file_initial }
        ];
        const totalFiles = wave1.length + wave2.length;
        let doneFiles = 0;
        const runWave = wave => Promise.all(wave.map(async f => {
            const ok = await f.loader();
            doneFiles++;
            updateProgress(i18n[currentLang].rank_download_file.replace('{label}', f.label).replace('{i}', doneFiles).replace('{total}', totalFiles).replace('{file}', f.name));
            return { f, ok };
        }));
        const r1 = await runWave(wave1);
        const r2 = await runWave(wave2);
        const failed = r1.concat(r2).find(r => r.ok === false);
        if (failed) throw new Error(`${failed.f.label}（${failed.f.name}）加载失败`);

        if (!initialScoresData || !eventCoefficients || !seasonsData) throw new Error('数据加载失败');

        updateProgress(i18n[currentLang].rank_calculating);
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
        setupMobileSortControls();
        setupRankTableExport();
        renderSeasonExpiryNotice();
    } catch(e) {
        console.error('排名计算失败', e);
        // 错误 + 重试按钮（原来只有一行红字，访客只能手动刷新页面）
        tb.innerHTML = '';
        const tr = document.createElement('tr');
        const td = document.createElement('td');
        td.colSpan = 7;
        td.style.cssText = 'text-align:center;padding:40px;';
        td.innerHTML = `<p style="color:var(--accent-red);font-weight:600;">${i18n[currentLang].rank_calc_fail}</p>`;
        const btn = document.createElement('button');
        btn.className = 'btn btn-sm btn-primary';
        btn.style.marginTop = '12px';
        btn.textContent = i18n[currentLang].detail_retry;
        btn.addEventListener('click', () => loadRankingData());
        td.appendChild(btn);
        tr.appendChild(td);
        tb.appendChild(tr);
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
        rli.innerHTML = `<div class="realtime-header"><i class="fa-solid fa-clock"></i><span class="realtime-label">${i18n[currentLang].rank_realtime_header}</span></div><ul class="season-node-list"><li class="time-node-item realtime-node${n.index===currentTimeIndex?' active':''}" role="button" tabindex="0" data-index="${n.index}"><span class="node-dot"></span>${getNodeDisplayLabel(n)}<span class="node-count">${i18n[currentLang].rank_ppl.replace('{n}', n.data.length)}</span></li></ul>`;
        list.appendChild(rli);
        rli.querySelector('.time-node-item').addEventListener('click', () => {
            currentTimeIndex = parseInt(rli.querySelector('.time-node-item').getAttribute('data-index'), 10);
            currentSortKey = '当前积分'; currentSortDir = 'desc';
            updateRankingDisplay(); renderTimeNodeList();
        });
    });

    // 渲染赛季分组
    const seasons = {};
    regularNodes.forEach((n, i) => { const s = n.season || i18n[currentLang].wtt_default_season; if (!seasons[s]) seasons[s] = []; seasons[s].push({ ...n, index: n.index }); });
    Object.entries(seasons).forEach(([season, nodes]) => { const sli = document.createElement('li'); sli.className = 'season-group'; sli.innerHTML = `<div class="season-header"><i class="fa-solid fa-chevron-down season-arrow"></i><span class="season-label">${season}</span><span class="season-count">${i18n[currentLang].rank_node_count.replace('{n}', nodes.length)}</span></div><ul class="season-node-list">${nodes.map(n => `<li class="time-node-item${n.index===currentTimeIndex?' active':''}${n.isInitial?' initial-node':''}" role="button" tabindex="0" data-index="${n.index}"><span class="node-dot"></span>${getNodeDisplayLabel(n)}<span class="node-count">${i18n[currentLang].rank_ppl.replace('{n}', n.data.length)}</span></li>`).join('')}</ul>`; list.appendChild(sli); sli.querySelector('.season-header').addEventListener('click', () => sli.classList.toggle('collapsed')); sli.querySelectorAll('.time-node-item').forEach(item => { item.addEventListener('click', () => { currentTimeIndex = parseInt(item.getAttribute('data-index'), 10); currentSortKey = '当前积分'; currentSortDir = 'desc'; updateRankingDisplay(); renderTimeNodeList(); }); }); });
    // 折叠非当前赛季的时间节点
    const curSeason = rankingTimeline[currentTimeIndex]?.season;
    if (curSeason) {
        list.querySelectorAll('.season-group').forEach(sg => {
            if (sg.querySelector('.season-label')?.textContent !== curSeason) {
                sg.classList.add('collapsed');
            }
        });
    }
    if (lbl && rankingTimeline[currentTimeIndex]) lbl.textContent = getNodeDisplayLabel(rankingTimeline[currentTimeIndex]);
    if (!list._kbdBound) {
        list._kbdBound = true;
        list.addEventListener('keydown', e => {
            if (e.key !== 'Enter' && e.key !== ' ') return;
            const item = e.target.closest('.time-node-item');
            if (!item) return;
            e.preventDefault();
            currentTimeIndex = parseInt(item.getAttribute('data-index'), 10);
            currentSortKey = '当前积分'; currentSortDir = 'desc';
            updateRankingDisplay(); renderTimeNodeList();
        });
    }
}
function calculateRankChanges(cd, pd, isInitial) {
    const cur = assignTiedRanks(cd);
    if (!pd || isInitial) return cur.map(p => ({ ...p, change: 0, changeType: 'new', pointsChange: 0, pointsChangeType: 'new' }));
    const prm = {}, ppm = {};
    assignTiedRanks(pd).forEach(p => { prm[p['姓名']] = p.rank; ppm[p['姓名']] = p['当前积分'] || 0; });
    return cur.map(p => {
        const cr = p.rank, pr = prm[p['姓名']], pp = ppm[p['姓名']], cp = p['当前积分'] || 0;
        let rc = 0, rct = 'new';
        if (pr === undefined) rct = 'new';
        else { rc = pr - cr; if (rc > 0) rct = 'up'; else if (rc < 0) rct = 'down'; else rct = 'same'; }
        let pc = 0, pct = 'new';
        if (pp === undefined) pct = 'new';
        else { pc = cp - pp; if (pc > 0.05) pct = 'up'; else if (pc < -0.05) pct = 'down'; else pct = 'same'; }
        return { ...p, rank: cr, change: rc, changeType: rct, pointsChange: pc, pointsChangeType: pct };
    });
}

/* 当前日期超出最后赛季时显示口径提示（引擎会把超范围日期回退到最后赛季） */
function renderSeasonExpiryNotice() {
    const old = document.getElementById('seasonExpiredNotice');
    if (old) old.remove();
    if (!seasonsData || !seasonsData.length) return;
    const today = new Date();
    const tzToday = new Date(today.getTime() - today.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
    const last = seasonsData[seasonsData.length - 1];
    if (tzToday <= last.endDate) return;
    const tb = document.getElementById('rankingFullBody');
    if (!tb) return;
    const host = tb.closest('table') || document.getElementById('rankingFullTable') || tb;
    const div = document.createElement('div');
    div.id = 'seasonExpiredNotice';
    div.style.cssText = 'margin:0 0 16px;padding:12px 16px;border-left:3px solid var(--accent-gold,#f0a500);font-size:0.85rem;color:var(--text-secondary);border-radius:6px;background:var(--card-bg,rgba(255,255,255,0.04));';
    div.textContent = i18n[currentLang].rank_season_expired.replace('{date}', last.endDate);
    host.parentNode.insertBefore(div, host);
}
function updateRankingDisplay() { if (!rankingTimeline.length || !rankingTimeline[currentTimeIndex]) return; const cn = rankingTimeline[currentTimeIndex], pn = currentTimeIndex > 0 ? rankingTimeline[currentTimeIndex-1] : null; currentDisplayData = calculateRankChanges(cn.data, pn ? pn.data : null, cn.isInitial); currentDisplayData = sortDisplayData(currentSortKey, currentSortDir); renderRankingTable(currentDisplayData); const ind = document.getElementById('sortIndicator'); if (ind) ind.textContent = `${sortKeyLabel(currentSortKey)} ${currentSortDir==='desc'?i18n[currentLang].sort_desc:i18n[currentLang].sort_asc}`; updateSortHeaderHighlight(); const lbl = document.getElementById('currentTimeLabel'); if (lbl) lbl.textContent = getNodeDisplayLabel(cn); syncMobileSortControls(false); }
function sortDisplayData(key, dir) { return [...currentDisplayData].sort((a, b) => { let va, vb; if (key === '胜率') { va = parseWinRate(a['胜率']); vb = parseWinRate(b['胜率']); } else if (key === '姓名') return dir === 'asc' ? (a['姓名']||'').localeCompare(b['姓名']||'', 'zh') : (b['姓名']||'').localeCompare(a['姓名']||'', 'zh'); else if (key === 'rank') { va = a.rank || 0; vb = b.rank || 0; } else if (key === '变化') { va = a.change || 0; vb = b.change || 0; } else if (key === '积分变化') { va = a.pointsChange || 0; vb = b.pointsChange || 0; } else { va = a[key] || 0; vb = b[key] || 0; } return va < vb ? (dir === 'asc' ? -1 : 1) : va > vb ? (dir === 'asc' ? 1 : -1) : 0; }); }
function renderRankingTable(data) { const tb = document.getElementById('rankingFullBody'); if (!tb) return; const L = i18n[currentLang] || {}; if (!data || !data.length) { tb.innerHTML = `<tr><td colspan="7" style="text-align:center;padding:40px;">${i18n[currentLang].rank_no_data}</td></tr>`; return; } tb.innerHTML = ''; const currentSnapshotDate = rankingTimeline[currentTimeIndex]?.time || ''; data.forEach((p, i) => { const tr = document.createElement('tr'); const wr = p['胜率'] || '0%', wd = wr === '#DIV/0!' || wr === '-' ? '0%' : wr; let ch = '', pch = ''; if (p.changeType === 'up') ch = `<span class="rank-change rank-up">▲${Math.abs(p.change)}</span>`; else if (p.changeType === 'down') ch = `<span class="rank-change rank-down">▼${Math.abs(p.change)}</span>`; else if (p.changeType === 'new') ch = '<span class="rank-new">NEW</span>'; else ch = '<span class="rank-same">-</span>'; if (p.pointsChangeType === 'up') pch = `<span class="rank-change rank-up">▲${Math.abs(p.pointsChange).toFixed(1)}</span>`; else if (p.pointsChangeType === 'down') pch = `<span class="rank-change rank-down">▼${Math.abs(p.pointsChange).toFixed(1)}</span>`; else if (p.pointsChangeType === 'new') pch = '<span class="rank-new">NEW</span>'; else pch = '<span class="rank-same">-</span>'; const pn = String(p['姓名'] || '-'); const pnSafe = escapeHtml(pn); const sds = escapeHtml(currentSnapshotDate || ''); const uid = getUidForPlayerName(pn); let nc = pnSafe; if (uid != null) { nc = `<a class="player-name-link" href="player.html?uid=${uid}" title="${L.rank_view_player_page}">${pnSafe}</a>`; } else if (scoreLogData.length > 0) { nc = `<span class="player-name-link" role="button" tabindex="0" data-player="${pnSafe}" data-snapshot="${sds}" title="${L.rank_click_detail}">${pnSafe}</span>`; } if (scoreLogData.length > 0) nc += ` <button class="score-detail-icon" type="button" data-player="${pnSafe}" data-snapshot="${sds}" title="${L.score_detail_title}"><i class="fa-solid fa-receipt"></i></button>`; tr.innerHTML = `<td>${p.rank || i + 1}</td><td>${nc}</td><td><strong>${(p['当前积分'] || 0).toFixed(1)}</strong></td><td data-label="${i18n[currentLang].rank_col_points_change}">${pch}</td><td data-label="${i18n[currentLang].rank_col_change}">${ch}</td><td data-label="${i18n[currentLang].rank_col_matches}">${p['总场次'] || 0}</td><td data-label="${i18n[currentLang].rank_col_winrate}">${wd}</td>`; tb.appendChild(tr); }); }
function updateSortHeaderHighlight() { document.querySelectorAll('.ranking-table-full th.sortable').forEach(th => { th.classList.remove('active-sort'); if (th.getAttribute('data-sort') === currentSortKey) th.classList.add('active-sort'); }); }
function setupSortListeners() { document.querySelectorAll('.ranking-table-full th.sortable').forEach(th => { const nt = th.cloneNode(true); th.parentNode.replaceChild(nt, th); nt.addEventListener('click', () => { const key = nt.getAttribute('data-sort'); currentSortDir = key === currentSortKey ? (currentSortDir === 'desc' ? 'asc' : 'desc') : 'desc'; currentSortKey = key; currentDisplayData = sortDisplayData(key, currentSortDir); renderRankingTable(currentDisplayData); updateSortHeaderHighlight(); document.querySelectorAll('.ranking-table-full th.sortable').forEach(h => { const a = h.querySelector('.sort-arrow'); if (a) a.innerHTML = ''; }); const ar = nt.querySelector('.sort-arrow'); if (ar) ar.innerHTML = currentSortDir === 'desc' ? '&#9660;' : '&#9650;'; nt.classList.add('active-sort'); document.getElementById('sortIndicator').textContent = `${sortKeyLabel(key)} ${currentSortDir === 'desc' ? i18n[currentLang].sort_desc : i18n[currentLang].sort_asc}`; syncMobileSortControls(false); }); }); }

/* ---- 移动端排序控件（卡片视图下替代表头排序）---- */
const MOBILE_SORT_KEYS = [['rank', 'rank_col_rank'], ['姓名', 'rank_col_name'], ['当前积分', 'rank_col_points'], ['积分变化', 'rank_col_points_change'], ['变化', 'rank_col_change'], ['总场次', 'rank_col_matches'], ['胜率', 'rank_col_winrate']];
/* 排序字段 → i18n 显示名（排序指示符等处不能直接显示原始字段键） */
function sortKeyLabel(key) { const m = MOBILE_SORT_KEYS.find(([v]) => v === key); return m ? (i18n[currentLang][m[1]] || key) : key; }
function syncMobileSortControls(rebuild) {
    const sel = document.getElementById('mobileSortSelect'), dir = document.getElementById('mobileSortDir');
    if (!sel || !dir) return;
    if (rebuild !== false) sel.innerHTML = MOBILE_SORT_KEYS.map(([v, k]) => `<option value="${v}">${i18n[currentLang][k]}</option>`).join('');
    if ([...sel.options].some(o => o.value === currentSortKey)) sel.value = currentSortKey;
    dir.innerHTML = currentSortDir === 'desc' ? '&#9660;' : '&#9650;';
}
function applyMobileSort() {
    currentDisplayData = sortDisplayData(currentSortKey, currentSortDir);
    renderRankingTable(currentDisplayData);
    updateSortHeaderHighlight();
    const ind = document.getElementById('sortIndicator');
    if (ind) ind.textContent = `${sortKeyLabel(currentSortKey)} ${currentSortDir === 'desc' ? i18n[currentLang].sort_desc : i18n[currentLang].sort_asc}`;
}
function setupMobileSortControls() {
    const sel = document.getElementById('mobileSortSelect'), dir = document.getElementById('mobileSortDir');
    if (!sel || !dir) return;
    syncMobileSortControls();
    sel.addEventListener('change', () => { currentSortKey = sel.value; applyMobileSort(); syncMobileSortControls(false); });
    dir.addEventListener('click', () => {
        currentSortDir = currentSortDir === 'desc' ? 'asc' : 'desc';
        applyMobileSort();
        document.querySelectorAll('.ranking-table-full th.sortable .sort-arrow').forEach(a => { a.innerHTML = ''; });
        const active = document.querySelector(`.ranking-table-full th.sortable[data-sort="${currentSortKey}"]`);
        if (active) { const ar = active.querySelector('.sort-arrow'); if (ar) ar.innerHTML = currentSortDir === 'desc' ? '&#9660;' : '&#9650;'; }
        syncMobileSortControls(false);
    });
}
/* ---- 积分数据表导出为图片（跨平台） ---- */
function setupRankTableExport() {
    const btn = document.getElementById('exportRankBtn');
    if (!btn) return;
    const doExport = limit => {
        if (!currentDisplayData || !currentDisplayData.length || !rankingTimeline.length) return;
        const cn = rankingTimeline[currentTimeIndex];
        let rows = currentDisplayData;
        let subtitle = `${cn?.label || ''} · ${document.getElementById('sortIndicator')?.textContent || ''}`.replace(/^ · /, '');
        let filenameBase = 'wfls-points-table';
        if (limit) {
            /* 按实际名次截取（同分并列者一并保留），保证导出图片中 # 列与真实排名一致 */
            rows = [...currentDisplayData].filter(p => p.rank && p.rank <= limit).sort((a, b) => (a.rank || 0) - (b.rank || 0));
            subtitle += ` · ${i18n[currentLang].rank_export_top_sub.replace('{n}', limit)}`;
            filenameBase += `-top${limit}`;
        }
        exportRankTableAsImage(rows, { title: i18n[currentLang].rank_title, subtitle, filenameBase });
    };
    btn.addEventListener('click', () => doExport(null));
    attachRankExportMenu(btn, doExport);
}
/* 语言切换时同步下拉文案与卡片标签 */
if (typeof updateRankingHeaders === 'function') {
    const _origUpdateRankingHeaders = updateRankingHeaders;
    updateRankingHeaders = function () { _origUpdateRankingHeaders(); if (typeof currentDisplayData !== 'undefined' && currentDisplayData && currentDisplayData.length && rankingTimeline[currentTimeIndex]) renderRankingTable(currentDisplayData); syncMobileSortControls(); const ind = document.getElementById('sortIndicator'); if (ind) ind.textContent = `${sortKeyLabel(currentSortKey)} ${currentSortDir === 'desc' ? i18n[currentLang].sort_desc : i18n[currentLang].sort_asc}`; };
}