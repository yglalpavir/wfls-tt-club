/* ========================================
   ranking.js - 排名系统 + 积分明细（修复赛季继承）
   ======================================== */

let currentScoreContext = { player: '', snapshotDate: '' };

/* ===== 单打/双打双口径状态 =====
   两套时间线一次算好存 modeTimelines，切换零请求；
   singlesLogData/doublesLogData 为口径过滤后的日志（scoreLogData 全局保持全量，
   口径内计算一律经 withScoreContext 临时换血，见 renderScoreDetail / loadRankingData） */
let rankingMode = 'singles';
const modeTimelines = { singles: [], doubles: [] };
let singlesLogData = [];
let doublesLogData = [];
let doublesInitialScoresData = null;   // { initialScores: {组合串: 首赛日两人单打分平均} }

/* 比分列仅在该球员窗口内存在含「比分/局分」的记录时显示（存量旧数据无比分，避免空列） */
function toggleScoreDetailScoreCol(show) { const th = document.getElementById('scoreDetailScoreHead'); if (th) th.style.display = show ? '' : 'none'; }

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
    scoreDetailTitle.textContent = `${playerDisplayName(playerName)} - ${i18n[currentLang].score_detail_title}（${getNodeDisplayLabel(rankingTimeline[currentTimeIndex])}）`;
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
    // 单双打口径分离：getSeasonStartScores / playerTypeBatches / scoreLogData 都读全局，
    // 双打明细（组合行）与含双打数据后的单打明细都必须在对应口径上下文中重放
    const replay = () => renderScoreDetailReplay(player, snapshotDate);
    if (rankingMode === 'doubles') withScoreContext(doublesLogData, doublesInitialScoresData, replay);
    else if (doublesLogData.length) withScoreContext(singlesLogData, undefined, replay);
    else replay();
}

function renderScoreDetailReplay(player, snapshotDate) {
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

    if (!records.length) { toggleScoreDetailScoreCol(false); scoreDetailBody.innerHTML = `<tr><td colspan="7" style="text-align:center;padding:20px;">${i18n[currentLang].rank_no_records}</td></tr>`; setTimeout(() => { if (scoreDetailModal) scoreDetailModal.classList.add('content-fit'); }, 100); return; }

    // 从赛季初始积分开始计算
    const scores = { ...seasonStartScores };
    const allRecords = [...scoreLogData].sort((a, b) => a['日期'].localeCompare(b['日期']));
    const matchOccMap = computeMatchOccurrenceMap(allRecords);
    const recordsWithScores = [];
    // 构建赛季内 [赛季开始日, 快照日] 的批次定格索引
    playerTypeBatches = buildPlayerTypeBatches(allRecords.filter(r => r['日期'] >= currentSeason.startDate && r['日期'] <= snapshotDate));

    for (const record of allRecords) {
        // 只处理当前赛季开始到快照日期之间的记录
        if (record['日期'] < currentSeason.startDate || record['日期'] > snapshotDate) continue;

        if (isMatchRecord(record)) {
            const w = record['胜者'], l = record['负者'];
            if (!scores[w]) scores[w] = DEFAULT_INITIAL_SCORE; if (!scores[l]) scores[l] = DEFAULT_INITIAL_SCORE;
            const decayedDual = calcMatchPointsDual(w, l, record['类型'], record['日期'], snapshotDate, scores, record['赛制']);
            const decayedGain = decayedDual.wGain, decayedLoss = decayedDual.lLoss;
            const rawGain = calcRawPoints(w, l, record['类型'], scores, record['赛制']);
            if (record['胜者'] === player || record['负者'] === player) {
                const isWinner = record['胜者'] === player;
                const rawChange = isWinner ? rawGain : -(rawGain * LOSER_POINT_MULTIPLIER);
                const decayedChange = isWinner ? decayedGain : -decayedLoss;
                const scoreBefore = scores[player];
                const scoreAfter = scoreBefore + decayedChange;
                recordsWithScores.push({ date: record['日期'], type: record['类型'], opponent: isWinner ? record['负者'] : record['胜者'], isWinner, isBonus: false, scoreBefore, rawChange, decayedChange, scoreAfter, score: record['比分'] || null, games: Array.isArray(record['局分']) ? record['局分'] : null, n: matchOccMap.get(record) || 1 });
            }
            scores[w] = Math.max(SCORE_FLOOR, scores[w] + decayedGain);
            scores[l] = Math.max(SCORE_FLOOR, scores[l] - decayedLoss);
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
    const hasScore = recordsWithScores.some(r => !r.isBonus && (r.score || (r.games && r.games.length)));
    toggleScoreDetailScoreCol(hasScore);
    scoreDetailBody.innerHTML = recordsWithScores.map(r => {
        if (r.isBonus) { const cc = r.decayedChange >= 0 ? 'score-change-positive' : 'score-change-negative'; const sign = r.decayedChange >= 0 ? '+' : ''; return `<tr><td>${escapeHtml(r.date)}</td><td>${escapeHtml(r.type)}</td><td>-</td><td class="result-win">${i18n[currentLang].rank_add_short}</td>${hasScore ? '<td></td>' : ''}<td>${r.scoreBefore.toFixed(1)}</td><td class="${cc}">${sign}${r.decayedChange.toFixed(1)}</td><td>${r.scoreAfter.toFixed(1)}</td></tr>`; }
        const res = r.isWinner ? i18n[currentLang].score_result_win : i18n[currentLang].score_result_loss;
        const rc = r.isWinner ? 'result-win' : 'result-loss';
        const cc = r.decayedChange >= 0 ? 'score-change-positive' : 'score-change-negative';
        const signRaw = r.rawChange >= 0 ? '+' : '';
        const signDecayed = r.decayedChange >= 0 ? '+' : '';
        const changeDisplay = `${signRaw}${r.rawChange.toFixed(1)}（${signDecayed}${r.decayedChange.toFixed(1)}）`;
        const mdUrl = escapeHtml(buildMatchDetailUrl(r.date, r.type, r.isWinner ? player : r.opponent, r.isWinner ? r.opponent : player, r.n));
        /* 比分/局分存储为胜者视角：负行按球员视角展示（对调数字、局序不变）；对手名可点（双打组合逐成员链接） */
        const gamesView = playerViewGames(r.games, r.isWinner);
        const scoreCell = hasScore ? `<td${gamesView && gamesView.length ? ` title="${i18n[currentLang].sb_games_label || '局分'}：${escapeHtml(gamesView.join(' '))}"` : ''}>${r.score ? escapeHtml(playerViewScore(r.score, r.isWinner)) : '-'}</td>` : '';
        return `<tr><td><a class="player-name-link" href="${mdUrl}">${escapeHtml(r.date)}</a></td><td>${escapeHtml(r.type)}</td><td>${linkPlayerSide(r.opponent)}</td><td class="${rc}">${res}</td>${scoreCell}<td>${r.scoreBefore.toFixed(1)}</td><td class="${cc}">${changeDisplay}</td><td>${r.scoreAfter.toFixed(1)}</td></tr>`;
    }).join('');
    setTimeout(adjustModalSize, 150);
}

/* 语言切换整体重渲染（setLanguage 探测）：排名表 + 已打开的积分明细弹窗 */
function rankingReapplyI18n() {
    if (!document.getElementById('rankingFullBody')) return;
    if (dataLoaded && rankingTimeline.length) updateRankingDisplay();
    if (scoreDetailModal && scoreDetailModal.classList.contains('active') && currentScoreContext.player) showScoreDetail(currentScoreContext.player, currentScoreContext.snapshotDate);
    const si = document.getElementById('mrankSearch');
    if (si) si.placeholder = i18n[currentLang].mrank_search_ph || '';
    document.querySelectorAll('.sheet-close').forEach(b => b.setAttribute('aria-label', i18n[currentLang].mrank_close || ''));
    mrankSyncSortBtn();
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

        // ===== 单打/双打双口径（同步计算，club数据量小，不需要分块异步）=====
        // 单打口径 = 全量日志减去双打记录（组合串不得混入单打榜）；无双打数据时保持原引用，回归零漂移。
        // 引擎内部 getSeasonStartScores 读全局 scoreLogData/initialScoresData，口径内计算一律包 withScoreContext。
        doublesLogData = scoreLogData.filter(isDoublesRecord);
        singlesLogData = doublesLogData.length ? scoreLogData.filter(r => !isDoublesRecord(r)) : scoreLogData;
        const computeTimeline = (log, initialScores) => {
            const t = calculateAllRankingsWithSeasons(log, initialScores, seasonsData);
            const rt = calculateRealtimeRanking();
            if (rt) t.push(rt);
            return t;
        };
        modeTimelines.singles = doublesLogData.length
            ? withScoreContext(singlesLogData, undefined, () => computeTimeline(singlesLogData, initialScoresData.initialScores))
            : computeTimeline(singlesLogData, initialScoresData.initialScores);
        if (doublesLogData.length) {
            // 组合初始分必须在单打上下文中计算（重放到各组合首赛日取两人单打分平均）
            const pairInitials = withScoreContext(singlesLogData, undefined, () => buildDoublesInitialScores(doublesLogData));
            doublesInitialScoresData = { initialScores: pairInitials };
            modeTimelines.doubles = withScoreContext(doublesLogData, doublesInitialScoresData, () => computeTimeline(doublesLogData, pairInitials));
        } else {
            modeTimelines.doubles = [];
        }
        rankingMode = 'singles';
        rankingTimeline = modeTimelines.singles;
        currentTimeIndex = rankingTimeline.length - 1;
        currentSortKey = '当前积分';
        currentSortDir = 'desc';
        setupSortListeners();
        setupMobileSortControls();
        setupRankTableExport();
        setupModeToggle();
        setupMobileRanking();
        // ?mode=doubles 直达双打榜（setRankingMode 内部会重渲染侧栏 + 表格）
        if (new URLSearchParams(window.location.search).get('mode') === 'doubles') setRankingMode('doubles', true);
        else { renderTimeNodeList(); updateRankingDisplay(); }
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

function renderTimeNodeList() { const list = document.getElementById('timeNodeList'), lbl = document.getElementById('currentTimeLabel'); if (!list) return; if (!rankingTimeline.length) { list.innerHTML = ''; if (lbl) lbl.textContent = rankingMode === 'doubles' ? i18n[currentLang].rank_mode_doubles : ''; return; } list.innerHTML = '';

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
    mrankSyncMeta();
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
/* ===== 单打/双打模式切换 ===== */
function setRankingMode(mode, force) {
    if (mode !== 'singles' && mode !== 'doubles') mode = 'singles';
    if (mode === rankingMode && !force) return;
    rankingMode = mode;
    rankingTimeline = modeTimelines[mode] || [];
    currentTimeIndex = rankingTimeline.length ? rankingTimeline.length - 1 : 0;
    currentSortKey = '当前积分'; currentSortDir = 'desc';
    document.querySelectorAll('.ranking-mode-btn').forEach(b => {
        const on = b.dataset.mode === mode;
        b.classList.toggle('active', on);
        b.setAttribute('aria-selected', on ? 'true' : 'false');
    });
    const url = new URL(window.location.href);
    if (mode === 'doubles') url.searchParams.set('mode', 'doubles'); else url.searchParams.delete('mode');
    try { history.replaceState(null, '', url); } catch (e) { /* file:// 等受限环境忽略 */ }
    renderTimeNodeList();
    updateRankingDisplay();
}
function setupModeToggle() {
    document.querySelectorAll('.ranking-mode-btn').forEach(btn => {
        if (btn._modeBound) return;
        btn._modeBound = true;
        btn.addEventListener('click', () => setRankingMode(btn.dataset.mode));
    });
}
/* 双打模式尚无记录时的空状态（updateRankingDisplay 空时间线兜底，语言切换也会走到） */
function renderDoublesEmptyState() {
    const tb = document.getElementById('rankingFullBody');
    if (!tb || rankingMode !== 'doubles') return;
    tb.innerHTML = `<tr><td colspan="7" style="text-align:center;padding:48px 20px;color:var(--text-secondary);">${escapeHtml(i18n[currentLang].rank_doubles_empty)}</td></tr>`;
    const lbl = document.getElementById('currentTimeLabel');
    if (lbl) lbl.textContent = i18n[currentLang].rank_mode_doubles;
    renderMobileRanking(null);
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
function updateRankingDisplay() { if (!rankingTimeline.length || !rankingTimeline[currentTimeIndex]) { renderDoublesEmptyState(); return; } const cn = rankingTimeline[currentTimeIndex], pn = currentTimeIndex > 0 ? rankingTimeline[currentTimeIndex-1] : null; currentDisplayData = calculateRankChanges(cn.data, pn ? pn.data : null, cn.isInitial); currentDisplayData = sortDisplayData(currentSortKey, currentSortDir); renderRankingTable(currentDisplayData); const ind = document.getElementById('sortIndicator'); if (ind) ind.textContent = `${sortKeyLabel(currentSortKey)} ${currentSortDir==='desc'?i18n[currentLang].sort_desc:i18n[currentLang].sort_asc}`; updateSortHeaderHighlight(); const lbl = document.getElementById('currentTimeLabel'); if (lbl) lbl.textContent = getNodeDisplayLabel(cn); syncMobileSortControls(false); }
function sortDisplayData(key, dir) { return [...currentDisplayData].sort((a, b) => { let va, vb; if (key === '胜率') { va = parseWinRate(a['胜率']); vb = parseWinRate(b['胜率']); } else if (key === '姓名') return dir === 'asc' ? (a['姓名']||'').localeCompare(b['姓名']||'', 'zh') : (b['姓名']||'').localeCompare(a['姓名']||'', 'zh'); else if (key === 'rank') { va = a.rank || 0; vb = b.rank || 0; } else if (key === '变化') { va = a.change || 0; vb = b.change || 0; } else if (key === '积分变化') { va = a.pointsChange || 0; vb = b.pointsChange || 0; } else { va = a[key] || 0; vb = b[key] || 0; } return va < vb ? (dir === 'asc' ? -1 : 1) : va > vb ? (dir === 'asc' ? 1 : -1) : 0; }); }
function renderRankingTable(data) { const tb = document.getElementById('rankingFullBody'); if (!tb) return; renderMobileRanking(data); mrankSyncMeta(); const L = i18n[currentLang] || {}; if (!data || !data.length) { tb.innerHTML = `<tr><td colspan="7" style="text-align:center;padding:40px;">${i18n[currentLang].rank_no_data}</td></tr>`; return; } tb.innerHTML = ''; const currentSnapshotDate = rankingTimeline[currentTimeIndex]?.time || ''; data.forEach((p, i) => { const tr = document.createElement('tr'); const wr = p['胜率'] || '0%', wd = wr === '#DIV/0!' || wr === '-' ? '0%' : wr; let ch = '', pch = ''; if (p.changeType === 'up') ch = `<span class="rank-change rank-up">▲${Math.abs(p.change)}</span>`; else if (p.changeType === 'down') ch = `<span class="rank-change rank-down">▼${Math.abs(p.change)}</span>`; else if (p.changeType === 'new') ch = '<span class="rank-new">NEW</span>'; else ch = '<span class="rank-same">-</span>'; if (p.pointsChangeType === 'up') pch = `<span class="rank-change rank-up">▲${Math.abs(p.pointsChange).toFixed(1)}</span>`; else if (p.pointsChangeType === 'down') pch = `<span class="rank-change rank-down">▼${Math.abs(p.pointsChange).toFixed(1)}</span>`; else if (p.pointsChangeType === 'new') pch = '<span class="rank-new">NEW</span>'; else pch = '<span class="rank-same">-</span>'; const pn = String(p['姓名'] || '-'); const pnSafe = escapeHtml(pn); const pnShow = escapeHtml(playerDisplayName(pn)); const sds = escapeHtml(currentSnapshotDate || ''); const pairParts = splitPairNames(pn); let nc;
if (pairParts) {
    /* 双打组合行：逐成员链个人页（组合无独立档案），收据按钮打开组合积分明细 */
    nc = pairParts.map(m => { const mu = getUidForPlayerName(m); const ms = escapeHtml(playerDisplayName(m)); return mu != null ? `<a class="player-name-link" href="player.html?uid=${mu}" title="${L.rank_view_player_page}">${ms}</a>` : ms; }).join('<span class="pair-name-sep">/</span>');
} else {
    const uid = getUidForPlayerName(pn); nc = pnShow; if (uid != null) { nc = `<a class="player-name-link" href="player.html?uid=${uid}" title="${L.rank_view_player_page}">${pnShow}</a>`; } else if (scoreLogData.length > 0) { nc = `<span class="player-name-link" role="button" tabindex="0" data-player="${pnSafe}" data-snapshot="${sds}" title="${L.rank_click_detail}">${pnShow}</span>`; }
}
if (scoreLogData.length > 0) nc += ` <button class="score-detail-icon" type="button" data-player="${pnSafe}" data-snapshot="${sds}" title="${L.score_detail_title}"><i class="fa-solid fa-receipt"></i></button>`; tr.innerHTML = `<td>${p.rank || i + 1}</td><td>${nc}</td><td><strong>${(p['当前积分'] || 0).toFixed(1)}</strong></td><td data-label="${i18n[currentLang].rank_col_points_change}">${pch}</td><td data-label="${i18n[currentLang].rank_col_change}">${ch}</td><td data-label="${i18n[currentLang].rank_col_matches}">${p['总场次'] || 0}</td><td data-label="${i18n[currentLang].rank_col_winrate}">${wd}</td>`; tb.appendChild(tr); }); }
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
        /* 积分/排名变化列的对比基准 = 时间线上前一节点；赛季初始节点或首节点无基准（变化列全 NEW），不附日期 */
        const prevNode = (cn && currentTimeIndex > 0 && !cn.isInitial) ? rankingTimeline[currentTimeIndex - 1] : null;
        if (prevNode) subtitle += ` · ${i18n[currentLang].rank_export_delta_ref.replace('{date}', getNodeDisplayLabel(prevNode))}`;
        const isDbl = rankingMode === 'doubles';
        exportRankTableAsImage(rows, { title: (i18n[currentLang].rank_title || '') + (isDbl ? ` · ${i18n[currentLang].rank_mode_doubles}` : ''), subtitle, filenameBase: isDbl ? 'wfls-points-table-doubles' : 'wfls-points-table' });
    };
    btn.addEventListener('click', () => doExport(null));
    attachRankExportMenu(btn, doExport);
    /* 移动端表头行的第二个导出按钮（图标版）：同一 doExport + 菜单（幂等守卫防重复挂） */
    const mbtn = document.getElementById('mrankExportBtn');
    if (mbtn) { mbtn.addEventListener('click', () => doExport(null)); attachRankExportMenu(mbtn, doExport); }
}
/* 语言切换时同步下拉文案与卡片标签 */
if (typeof updateRankingHeaders === 'function') {
    const _origUpdateRankingHeaders = updateRankingHeaders;
    updateRankingHeaders = function () { _origUpdateRankingHeaders(); if (typeof currentDisplayData !== 'undefined' && currentDisplayData && currentDisplayData.length && rankingTimeline[currentTimeIndex]) renderRankingTable(currentDisplayData); syncMobileSortControls(); const ind = document.getElementById('sortIndicator'); if (ind) ind.textContent = `${sortKeyLabel(currentSortKey)} ${currentSortDir === 'desc' ? i18n[currentLang].sort_desc : i18n[currentLang].sort_asc}`; };
}

/* 语言切换时同步下拉文案与卡片标签 */
if (typeof updateRankingHeaders === 'function') {
    const _origUpdateRankingHeaders = updateRankingHeaders;
    updateRankingHeaders = function () { _origUpdateRankingHeaders(); if (typeof currentDisplayData !== 'undefined' && currentDisplayData && currentDisplayData.length && rankingTimeline[currentTimeIndex]) renderRankingTable(currentDisplayData); syncMobileSortControls(); const ind = document.getElementById('sortIndicator'); if (ind) ind.textContent = `${sortKeyLabel(currentSortKey)} ${currentSortDir === 'desc' ? i18n[currentLang].sort_desc : i18n[currentLang].sort_asc}`; };
}

/* ===== 移动端排行榜（≤768px；与表格同数据源双渲染，显隐由 CSS 控制）=====
   卡片 = 名次徽章 + 姓名（组合逐成员链个人页）+ 大积分 + 趋势；
   整卡点击打开积分明细弹窗（复用 showScoreDetail）；前三名 Podium 特殊卡 */
let mrankSearchQuery = '';
const mrankOpenCards = new Set();   // 展开中的卡片（按球员/组合名记忆，重渲染后保持展开态）

function mrankChangeHtml(type, val, isPoints) {
    if (type === 'up') return `<span class="rank-change rank-up">▲${isPoints ? Math.abs(val).toFixed(1) : Math.abs(val)}</span>`;
    if (type === 'down') return `<span class="rank-change rank-down">▼${isPoints ? Math.abs(val).toFixed(1) : Math.abs(val)}</span>`;
    if (type === 'new') return '<span class="rank-new">NEW</span>';
    return '';
}

/* 姓名单元格：与表格同逻辑（组合逐成员链个人页 / 单人链档案 / 无档案纯文本）。
   整卡点击已委托打开明细，名字内不再重复挂 data-player，避免双触发 */
function mrankNameHtml(pn, L) {
    const pairParts = splitPairNames(pn);
    if (pairParts) {
        return pairParts.map(m => { const mu = getUidForPlayerName(m); const ms = escapeHtml(playerDisplayName(m)); return mu != null ? `<a class="player-name-link" href="player.html?uid=${mu}" title="${L.rank_view_player_page}">${ms}</a>` : ms; }).join('<span class="pair-name-sep">/</span>');
    }
    const uid = getUidForPlayerName(pn);
    const shown = escapeHtml(playerDisplayName(pn));
    if (uid != null) return `<a class="player-name-link" href="player.html?uid=${uid}" title="${L.rank_view_player_page}">${shown}</a>`;
    return shown;
}

function mrankCardHtml(p, sds, L) {
    const pn = String(p['姓名'] || '-');
    const wr = p['胜率'] || '0%'; const wd = wr === '#DIV/0!' || wr === '-' ? '0%' : wr;
    const pch = mrankChangeHtml(p.pointsChangeType, p.pointsChange, true);
    const pts = (p['当前积分'] || 0).toFixed(1);
    const rank = p.rank || 0;
    const rankCls = rank === 1 ? ' r1' : rank === 2 ? ' r2' : rank === 3 ? ' r3' : '';
    const open = mrankOpenCards.has(pn);
    const pnSafe = escapeHtml(pn);
    const aria = `${playerDisplayName(pn)} ${pts}`;
    return `<div class="mrank-card${open ? ' open' : ''}" data-mrank-player="${pnSafe}" data-mrank-snapshot="${sds}">
        <div class="mrank-head" role="button" tabindex="0" aria-expanded="${open}" aria-label="${escapeHtml(aria)}">
            <span class="mrank-rank${rankCls}">${rank || '·'}</span>
            <span class="mrank-name">${mrankNameHtml(pn, L)}</span>
            <span class="mrank-stat">${p['总场次'] || 0}</span>
            <span class="mrank-stat">${wd}</span>
            <span class="mrank-stat">${pch || '-'}</span>
            <span class="mrank-pts">${pts}</span>
            <i class="fa-solid fa-chevron-down mrank-chev" aria-hidden="true"></i>
        </div>
        <div class="mrank-x">
            <button type="button" class="mrank-detail-link" data-player="${pnSafe}" data-snapshot="${sds}"><i class="fa-solid fa-receipt" aria-hidden="true"></i> ${L.mrank_expand_detail}</button>
        </div>
    </div>`;
}

function renderMobileRanking(data) {
    const board = document.getElementById('mrankBoard');
    if (!board) return;
    const L = i18n[currentLang] || {};
    if (!data || !data.length) {
        board.innerHTML = `<div class="mrank-empty">${escapeHtml(rankingMode === 'doubles' ? i18n[currentLang].rank_doubles_empty : i18n[currentLang].rank_no_data)}</div>`;
        return;
    }
    const sds = escapeHtml(rankingTimeline[currentTimeIndex]?.time || '');
    const q = mrankSearchQuery.trim().toLowerCase();
    /* 模糊搜索（与个人数据页同款 playerSearchScore）：姓名/别名/编号/拼音全拼/首字母/字符顺序子序列；
       双打组合取两名成员的最高分 */
    const rows = q ? data.filter(p => {
        const pn = String(p['姓名'] || '');
        if (playerSearchScore(pn, getPlayerByName(pn), q) > 0) return true;
        const parts = splitPairNames(pn);
        return parts ? parts.some(m => playerSearchScore(m, getPlayerByName(m), q) > 0) : false;
    }) : data;
    if (!rows.length) { board.innerHTML = `<div class="mrank-empty">${escapeHtml(i18n[currentLang].mrank_no_result)}</div>`; return; }
    board.innerHTML = rows.map(p => mrankCardHtml(p, sds, L)).join('');
}

/* 节点条 + 副标题同步（替代 chips）：bar 显示当前节点名（实时节点带 LIVE 脉冲点），
   副标题居中显示「n 人 · 当前排序」 */
function mrankSyncMeta() {
    const node = rankingTimeline[currentTimeIndex];
    const barLabel = document.getElementById('mrankNodeBarLabel');
    const bar = document.getElementById('mrankNodeBar');
    if (node) {
        /* 人数并入节点条 label（原独立副标题行已移除）；排序态由列头高亮表达 */
        const n = node.data ? node.data.length : 0;
        if (barLabel) barLabel.textContent = `${i18n[currentLang].rank_sidebar_title}${currentLang === 'en' ? ': ' : '：'}${getNodeDisplayLabel(node)} · ${i18n[currentLang].rank_ppl.replace('{n}', n)}`;
        if (bar) bar.classList.toggle('is-live', !!node.isRealtime);
    }
    mrankSyncSortBtn();
}

/* 列头排序状态同步（亚运 Rk ⇅ / Total ⇅ 同款：当前排序列高亮 + 方向箭头） */
function mrankSyncSortBtn() {
    document.querySelectorAll('.mrank-col-sort').forEach(btn => {
        const active = btn.dataset.key === currentSortKey;
        btn.classList.toggle('active', active);
        btn.setAttribute('aria-sort', active ? (currentSortDir === 'desc' ? 'descending' : 'ascending') : 'none');
        const ic = btn.querySelector('i');
        if (ic) {
            ic.className = `fa-solid fa-caret-${currentSortDir === 'desc' ? 'down' : 'up'}`;
            ic.style.visibility = active ? 'visible' : 'hidden';
        }
    });
}

/* 时间线抽屉内容：实时节点置顶 + 赛季分组（非当前赛季折叠），与桌面侧栏同结构 */
function mrankBuildNodeSheet() {
    const body = document.getElementById('mrankNodeSheetBody');
    if (!body) return;
    const L = i18n[currentLang] || {};
    if (!rankingTimeline.length) { body.innerHTML = `<div class="mrank-empty">${escapeHtml(i18n[currentLang].rank_no_data)}</div>`; return; }
    const realtime = [], regular = [];
    rankingTimeline.forEach((n, i) => (n.isRealtime ? realtime : regular).push({ ...n, index: i }));
    const nodeBtn = n => `<button type="button" class="time-node-item${n.index === currentTimeIndex ? ' active' : ''}${n.isInitial ? ' initial-node' : ''}" data-index="${n.index}"><span class="node-dot"></span>${escapeHtml(getNodeDisplayLabel(n))}<span class="node-count">${i18n[currentLang].rank_ppl.replace('{n}', n.data.length)}</span></button>`;
    let html = '';
    realtime.forEach(n => { html += `<div class="realtime-group"><div class="realtime-header"><i class="fa-solid fa-clock"></i><span class="realtime-label">${L.rank_realtime_header}</span></div><ul class="season-node-list">${nodeBtn(n)}</ul></div>`; });
    const seasons = {};
    regular.forEach(n => { const s = n.season || L.wtt_default_season; (seasons[s] = seasons[s] || []).push(n); });
    const curSeason = rankingTimeline[currentTimeIndex]?.season;
    Object.entries(seasons).forEach(([season, nodes]) => {
        const collapsed = season !== curSeason ? ' collapsed' : '';
        html += `<div class="season-group${collapsed}"><div class="season-header"><i class="fa-solid fa-chevron-down season-arrow"></i><span class="season-label">${escapeHtml(season)}</span><span class="season-count">${L.rank_node_count.replace('{n}', nodes.length)}</span></div><ul class="season-node-list">${nodes.map(nodeBtn).join('')}</ul></div>`;
    });
    body.innerHTML = html;
}

function mrankOpenSheet(ov) { if (!ov) return; ov.classList.add('active'); document.body.style.overflow = 'hidden'; const c = ov.querySelector('.sheet-close'); if (c) try { c.focus(); } catch (e) { /* 忽略 */ } }
function mrankCloseSheet(ov) {
    if (!ov) return;
    ov.classList.remove('active');
    if (!document.querySelector('.sheet-overlay.active') && !(scoreDetailModal && scoreDetailModal.classList.contains('active'))) document.body.style.overflow = '';
}

/* 事件绑定（loadRankingData 时一次；DOM 常驻，用 _bound 防重复） */
function setupMobileRanking() {
    const search = document.getElementById('mrankSearch');
    if (search && !search._bound) {
        search._bound = true;
        search.addEventListener('input', () => { mrankSearchQuery = search.value || ''; renderMobileRanking(currentDisplayData); });
    }
    const searchClear = document.getElementById('mrankSearchClear');
    if (searchClear && !searchClear._bound) {
        searchClear._bound = true;
        searchClear.addEventListener('click', () => { const s = document.getElementById('mrankSearch'); if (s) s.value = ''; mrankSearchQuery = ''; renderMobileRanking(currentDisplayData); });
    }
    /* 列头直排（亚运表头同款）：点列 = 按该列排序；同列再点 = 升降切换 */
    document.querySelectorAll('.mrank-col-sort').forEach(btn => {
        if (btn._bound) return;
        btn._bound = true;
        btn.addEventListener('click', () => {
            const key = btn.dataset.key;
            if (currentSortKey === key) currentSortDir = currentSortDir === 'desc' ? 'asc' : 'desc';
            else { currentSortKey = key; currentSortDir = 'desc'; }
            applyMobileSort();
        });
    });
    const nodeBar = document.getElementById('mrankNodeBar'), nodeSheet = document.getElementById('mrankNodeSheet');
    if (nodeBar && nodeSheet && !nodeBar._bound) { nodeBar._bound = true; nodeBar.addEventListener('click', () => { mrankBuildNodeSheet(); mrankOpenSheet(nodeSheet); }); }
    if (nodeSheet && !nodeSheet._bound) {
        nodeSheet._bound = true;
        nodeSheet.addEventListener('click', e => { if (e.target === nodeSheet) mrankCloseSheet(nodeSheet); });
        nodeSheet.querySelector('.sheet-close')?.addEventListener('click', () => mrankCloseSheet(nodeSheet));
    }
    const nodeBody = document.getElementById('mrankNodeSheetBody');
    if (nodeBody && !nodeBody._bound) {
        nodeBody._bound = true;
        nodeBody.addEventListener('click', e => {
            const hdr = e.target.closest('.season-header');
            if (hdr) { hdr.closest('.season-group')?.classList.toggle('collapsed'); return; }
            const item = e.target.closest('.time-node-item');
            if (!item) return;
            currentTimeIndex = parseInt(item.getAttribute('data-index'), 10);
            currentSortKey = '当前积分'; currentSortDir = 'desc';
            mrankCloseSheet(nodeSheet);
            updateRankingDisplay(); renderTimeNodeList();
        });
    }
    const board = document.getElementById('mrankBoard');
    if (board && !board._bound) {
        board._bound = true;
        /* 手风琴展开/收起：点卡头切换（a 链接正常跳转；明细按钮走 document 级 data-player 委托） */
        const toggle = e => {
            const head = e.target.closest('.mrank-head');
            if (!head || e.target.closest('a')) return;
            if (e.type === 'keydown' && e.key !== 'Enter' && e.key !== ' ') return;
            e.preventDefault();
            const card = head.closest('.mrank-card');
            if (!card) return;
            const pn = card.dataset.mrankPlayer;
            const willOpen = !card.classList.contains('open');
            card.classList.toggle('open', willOpen);
            head.setAttribute('aria-expanded', willOpen ? 'true' : 'false');
            if (willOpen) mrankOpenCards.add(pn); else mrankOpenCards.delete(pn);
        };
        board.addEventListener('click', toggle);
        board.addEventListener('keydown', toggle);
    }
    if (!document.body._mrankEsc) {
        document.body._mrankEsc = true;
        document.addEventListener('keydown', e => { if (e.key !== 'Escape') return; document.querySelectorAll('.sheet-overlay.active').forEach(ov => mrankCloseSheet(ov)); });
    }
    /* 首屏加载即同步移动端文案（setLanguage 仅在切换时触发 reapply，初始化需自行补齐） */
    const L0 = i18n[currentLang] || {};
    if (search) search.placeholder = L0.mrank_search_ph || '';
    document.querySelectorAll('.sheet-close').forEach(b => b.setAttribute('aria-label', L0.mrank_close || ''));
    mrankSyncSortBtn();
}