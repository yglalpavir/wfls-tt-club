/* ========================================
   wtt_ranking.js - WTT 国际乒联积分排名（彩蛋页面）
   复用 score-engine.js 核心计算逻辑
   ======================================== */

// 注意：wttScoreLogData、wttInitialScoresData 等共享变量由 wtt_common.js 声明
// 本文件仅声明 wtt_ranking.js 独有的局部变量

// 桥接：让 main.js 中的 initPage() 调用 WTT 版本的加载（覆盖 wtt_common.js 中的版本）
function loadRankingData() { return wttLoadRankingData(); }

// 桥接：让 score-engine.js 的函数使用 WTT 数据
function getWttActiveData() {
    return {
        get scoreLogData() { return wttScoreLogData; },
        get initialScoresData() { return wttInitialScoresData; },
        get eventCoefficients() { return wttEventCoefficients; },
        get seasonsData() { return wttSeasonsData; }
    };
}

// 封装计算：使用 wttWithDataContext 自动切换全局数据 → 计算 → 恢复
// 覆盖 wtt_common.js 中的同名函数
function wttCalculateAllRankings() {
    wttApplyNameNormalization();
    return wttWithDataContext(() => {
        const effScores = wttGetEffectiveInitialScores();
        console.log(`[WTT Ranking] 计算模式: ${wttSettings?.scoreMode || 'initial'}, initialScores 键数: ${Object.keys(effScores).length}`);
        const timeline = calculateAllRankingsWithSeasons(wttScoreLogData, effScores, wttSeasonsData);
        const rt = calculateRealtimeRanking();
        if (rt) timeline.push(rt);
        return timeline;
    });
}

function wttCalculateRealtimeRanking() {
    wttApplyNameNormalization();
    return wttWithDataContext(() => calculateRealtimeRanking());
}

// 为 WTT 封装 getSeasonStartScores
function wttGetSeasonStartScores(seasonIndex) {
    return wttWithDataContext(() => getSeasonStartScores(seasonIndex));
}

// 显示积分明细
function wttShowScoreDetail(playerName, snapshotDate) {
    const modal = document.getElementById('scoreDetailModal');
    const body = document.getElementById('scoreDetailBody');
    const title = document.getElementById('scoreDetailTitle');
    if (!modal || !body) return;

    wttCurrentScoreContext = {
        player: playerName,
        snapshotDate: snapshotDate || (wttRankingTimeline[wttCurrentTimeIndex]?.time || '')
    };
    title.textContent = `${playerName} - ${i18n[currentLang].score_detail_title}（${wttRankingTimeline[wttCurrentTimeIndex]?.label || ''}）`;
    wttRenderScoreDetail();
    wttAdjustModalSize();
    openModal(modal);
}

function wttAdjustModalSize() {
    const modal = document.getElementById('scoreDetailModal');
    if (!modal) return;
    modal.classList.remove('content-fit');
    setTimeout(() => {
        const tw = modal.querySelector('.score-detail-table-wrapper');
        const tb = modal.querySelector('.score-detail-table');
        if (tw && tb && tb.scrollWidth <= tw.clientWidth + 2 && tb.scrollHeight <= tw.clientHeight + 2) {
            modal.classList.add('content-fit');
        }
    }, 100);
}

function wttRenderScoreDetail() {
    const body = document.getElementById('scoreDetailBody');
    if (!body) return;

    const player = wttCurrentScoreContext.player;
    const snapshotDate = wttCurrentScoreContext.snapshotDate;
    if (!player || !snapshotDate) return;

    // 切换全局数据
    const origScoreLog = scoreLogData;
    const origInitial = initialScoresData;
    const origEvent = eventCoefficients;
    const origSeasons = seasonsData;

    scoreLogData = wttScoreLogData;
    initialScoresData = (typeof wttGetInitialScoresDataForEngine === 'function') ? wttGetInitialScoresDataForEngine() : wttInitialScoresData;
    eventCoefficients = wttEventCoefficients;
    seasonsData = wttSeasonsData;

    // 找到快照日期所在的赛季
    const currentSeason = getSeasonForDate(snapshotDate);
    const noRecordsHtml = '<tr><td colspan="7" style="text-align:center;padding:20px;">' + i18n[currentLang].wtt_no_records + '</td></tr>';
    if (!currentSeason) {
        body.innerHTML = noRecordsHtml;
        setTimeout(() => { const m = document.getElementById('scoreDetailModal'); if (m) m.classList.add('content-fit'); }, 100);
        scoreLogData = origScoreLog; initialScoresData = origInitial;
        eventCoefficients = origEvent; seasonsData = origSeasons;
        return;
    }

    const seasonIndex = seasonsData.indexOf(currentSeason);
    const seasonStartScores = getSeasonStartScores(seasonIndex);

    let records = scoreLogData.filter(r =>
        r['日期'] >= currentSeason.startDate &&
        r['日期'] <= snapshotDate &&
        ((isMatchRecord(r) && (r['胜者'] === player || r['负者'] === player)) ||
         (isBonusRecord(r) && r['对象'] === player))
    );
    records.sort((a, b) => a['日期'].localeCompare(b['日期']));

    if (!records.length) {
        body.innerHTML = noRecordsHtml;
        setTimeout(() => { const m = document.getElementById('scoreDetailModal'); if (m) m.classList.add('content-fit'); }, 100);
        scoreLogData = origScoreLog; initialScoresData = origInitial;
        eventCoefficients = origEvent; seasonsData = origSeasons;
        return;
    }

    const scores = { ...seasonStartScores };
    const allRecords = [...scoreLogData].sort((a, b) => a['日期'].localeCompare(b['日期']));
    const recordsWithScores = [];

    for (const record of allRecords) {
        if (record['日期'] < currentSeason.startDate || record['日期'] > snapshotDate) continue;

        if (isMatchRecord(record)) {
            const w = record['胜者'], l = record['负者'];
            if (!scores[w]) scores[w] = DEFAULT_INITIAL_SCORE; if (!scores[l]) scores[l] = DEFAULT_INITIAL_SCORE;
            const decayedGain = calcMatchPoints(w, l, record['类型'], record['日期'], record['日期'], scores);
            const rawGain = calcRawPoints(w, l, record['类型'], scores);
            if (record['胜者'] === player || record['负者'] === player) {
                const isWinner = record['胜者'] === player;
                const rawChange = isWinner ? rawGain : -(rawGain * LOSER_POINT_MULTIPLIER);
                const decayedChange = isWinner ? decayedGain : -(decayedGain * LOSER_POINT_MULTIPLIER);
                const scoreBefore = scores[player];
                const scoreAfter = scoreBefore + decayedChange;
                recordsWithScores.push({
                    date: record['日期'], type: record['类型'],
                    opponent: isWinner ? record['负者'] : record['胜者'],
                    isWinner, isBonus: false,
                    scoreBefore, rawChange, decayedChange, scoreAfter
                });
            }
            scores[w] = Math.max(SCORE_FLOOR, scores[w] + decayedGain);
            scores[l] = Math.max(SCORE_FLOOR, scores[l] - decayedGain * LOSER_POINT_MULTIPLIER);
        } else if (isBonusRecord(record) && record['对象'] === player) {
            const bonus = parseFloat(record['分数']) || 0;
            if (!scores[player]) scores[player] = DEFAULT_INITIAL_SCORE;
            recordsWithScores.push({
                date: record['日期'], type: i18n[currentLang].wtt_bonus, opponent: '-',
                isWinner: true, isBonus: true,
                scoreBefore: scores[player], rawChange: bonus, decayedChange: bonus,
                scoreAfter: scores[player] + bonus
            });
            scores[player] = Math.max(SCORE_FLOOR, scores[player] + bonus);
        } else if (isBonusRecord(record)) {
            const target = record['对象'];
            const bonus = parseFloat(record['分数']) || 0;
            if (!scores[target]) scores[target] = DEFAULT_INITIAL_SCORE;
            scores[target] = Math.max(SCORE_FLOOR, scores[target] + bonus);
        }
    }

    recordsWithScores.reverse();
    body.innerHTML = recordsWithScores.map(r => {
        if (r.isBonus) {
            const cc = r.decayedChange >= 0 ? 'score-change-positive' : 'score-change-negative';
            const sign = r.decayedChange >= 0 ? '+' : '';
            return `<tr><td>${escapeHtml(r.date)}</td><td>${escapeHtml(r.type)}</td><td>-</td><td class="result-win">${escapeHtml(i18n[currentLang].wtt_bonus)}</td><td>${r.scoreBefore.toFixed(1)}</td><td class="${cc}">${sign}${r.decayedChange.toFixed(1)}</td><td>${r.scoreAfter.toFixed(1)}</td></tr>`;
        }
        const res = r.isWinner ? i18n[currentLang].score_result_win : i18n[currentLang].score_result_loss;
        const rc = r.isWinner ? 'result-win' : 'result-loss';
        const cc = r.decayedChange >= 0 ? 'score-change-positive' : 'score-change-negative';
        const signRaw = r.rawChange >= 0 ? '+' : '';
        const signDecayed = r.decayedChange >= 0 ? '+' : '';
        const changeDisplay = `${signRaw}${r.rawChange.toFixed(1)}（${signDecayed}${r.decayedChange.toFixed(1)}）`;
        return `<tr><td>${escapeHtml(r.date)}</td><td>${escapeHtml(r.type)}</td><td>${escapeHtml(r.opponent)}</td><td class="${rc}">${res}</td><td>${r.scoreBefore.toFixed(1)}</td><td class="${cc}">${changeDisplay}</td><td>${r.scoreAfter.toFixed(1)}</td></tr>`;
    }).join('');

    scoreLogData = origScoreLog; initialScoresData = origInitial;
    eventCoefficients = origEvent; seasonsData = origSeasons;

    setTimeout(wttAdjustModalSize, 150);
}

// 加载并渲染（异步分块计算，不阻塞 UI；骨架屏 + 进度条 + 已用时）
async function wttLoadRankingData() {
    if (wttInitialized) return;
    wttInitialized = true;
    const tb = document.getElementById('rankingFullBody');
    if (!tb) return;

    // 骨架屏占位行（与表头 7 列一致）
    tb.innerHTML = wttSkeletonRowsHtml(8, 7);

    // 表格上方插入紧凑进度条行（进度 + 百分比 + 详情 + 已用时）
    let prog = document.getElementById('wttRankingLoadProgress');
    if (!prog) {
        const table = tb.closest('table');
        if (table && table.parentNode) {
            prog = document.createElement('div');
            prog.id = 'wttRankingLoadProgress';
            table.parentNode.insertBefore(prog, table);
        }
    }
    if (prog) {
        prog.innerHTML = wttLoadingBlockHtml(i18n[currentLang].wtt_loading, { compact: true });
        wttStartLoadingTimer(prog);
    }
    const setP = (pct, detail, main) => { if (prog) wttSetLoadingProgress(prog, pct, detail, main); };

    try {
        setP(wttLoadPhasePct('download', 0, 1), i18n[currentLang].wtt_prepare);
        await new Promise(r => setTimeout(r, 0));

        // settings 先行，其余数据文件并行下载（每个文件完成即推进进度条）
        await wttLoadSettingsAndFiles(true, (done, total, label) => {
            setP(wttLoadPhasePct('download', done + 1, total + 1),
                 i18n[currentLang].wtt_downloading.replace('{label}', label).replace('{i}', String(done + 1)).replace('{total}', String(total + 1)).replace('{file}', label));
        });

        // flat1300 模式不需要 initialScoresData
        const isFlat = wttSettings && wttSettings.scoreMode === 'flat1300';
        if (!isFlat && !wttInitialScoresData) throw new Error('WTT initial-scores 加载失败');
        if (!wttEventCoefficients || !wttSeasonsData) throw new Error('WTT数据加载失败');

        // 异步分块计算（每快照 yield 到浏览器，保持 UI 响应）
        setP(wttLoadPhasePct('calc', 0, 1), '', i18n[currentLang].wtt_calculating);
        wttRankingTimeline = await wttCalculateAllRankingsAsync((current, total, label) => {
            setP(wttLoadPhasePct('calc', current, total),
                 (label ? label + ' · ' : '') + i18n[currentLang].wtt_snapshot.replace('{current}', current).replace('{total}', total));
        });

        // 移除进度条并渲染真实数据（骨架屏随之被真实行替换）
        wttStopLoadingTimer(prog);
        if (prog) prog.remove();

        wttCurrentTimeIndex = wttRankingTimeline.length - 1;
        wttCurrentSortKey = '当前积分';
        wttCurrentSortDir = 'desc';

        wttRenderTimeNodeList();
        wttUpdateRankingDisplay();
        wttSetupSortListeners();
    } catch (e) {
        console.error('WTT排名计算失败', e);
        wttStopLoadingTimer(prog);
        if (prog) prog.remove();
        if (tb) tb.innerHTML = '<tr><td colspan="7" style="text-align:center;padding:40px;color:var(--accent-red);">' + i18n[currentLang].wtt_cant_compute + '</td></tr>';
    }
}

function wttRenderTimeNodeList() {
    const list = document.getElementById('timeNodeList');
    const lbl = document.getElementById('currentTimeLabel');
    if (!list || !wttRankingTimeline.length) return;
    list.innerHTML = '';

    const realtimeNodes = [], regularNodes = [];
    wttRankingTimeline.forEach((n, i) => {
        if (n.isRealtime) realtimeNodes.push({ ...n, index: i });
        else regularNodes.push({ ...n, index: i });
    });

    // 实时积分节点
    realtimeNodes.forEach(n => {
        const rli = document.createElement('li');
        rli.className = 'realtime-group';
        rli.innerHTML = `<div class="realtime-header"><i class="fa-solid fa-clock"></i><span class="realtime-label">${i18n[currentLang].rank_realtime_header}</span></div><ul class="season-node-list"><li class="time-node-item realtime-node ${n.index === wttCurrentTimeIndex ? 'active' : ''}" data-index="${n.index}"><span class="node-dot"></span>${n.label}<span class="node-count">${i18n[currentLang].wtt_ppl.replace('{n}', n.data.length)}</span></li></ul>`;
        list.appendChild(rli);
        rli.querySelector('.time-node-item').addEventListener('click', () => {
            wttCurrentTimeIndex = parseInt(rli.querySelector('.time-node-item').getAttribute('data-index'));
            wttCurrentSortKey = '当前积分'; wttCurrentSortDir = 'desc';
            wttUpdateRankingDisplay(); wttRenderTimeNodeList();
        });
    });

    // 赛季分组
    const seasons = {};
    regularNodes.forEach((n) => {
        const s = n.season || i18n[currentLang].wtt_default_season;
        if (!seasons[s]) seasons[s] = [];
        seasons[s].push({ ...n, index: n.index });
    });

    Object.entries(seasons).forEach(([season, nodes]) => {
        const sli = document.createElement('li');
        sli.className = 'season-group';
        sli.innerHTML = `<div class="season-header"><i class="fa-solid fa-chevron-down season-arrow"></i><span class="season-label">${season}</span><span class="season-count">${i18n[currentLang].wtt_node_count.replace('{n}', nodes.length)}</span></div><ul class="season-node-list">${nodes.map(n => `<li class="time-node-item ${n.index === wttCurrentTimeIndex ? 'active' : ''} ${n.isInitial ? 'initial-node' : ''}" data-index="${n.index}"><span class="node-dot"></span>${n.label}<span class="node-count">${i18n[currentLang].wtt_ppl.replace('{n}', n.data.length)}</span></li>`).join('')}</ul>`;
        list.appendChild(sli);
        sli.querySelector('.season-header').addEventListener('click', () => sli.classList.toggle('collapsed'));
        sli.querySelectorAll('.time-node-item').forEach(item => {
            item.addEventListener('click', () => {
                wttCurrentTimeIndex = parseInt(item.getAttribute('data-index'));
                wttCurrentSortKey = '当前积分'; wttCurrentSortDir = 'desc';
                wttUpdateRankingDisplay(); wttRenderTimeNodeList();
            });
        });
    });

    // 折叠非当前赛季的时间节点
    const curSeason = wttRankingTimeline[wttCurrentTimeIndex]?.season;
    if (curSeason) {
        list.querySelectorAll('.season-group').forEach(sg => {
            if (sg.querySelector('.season-label')?.textContent !== curSeason) {
                sg.classList.add('collapsed');
            }
        });
    }

    if (lbl && wttRankingTimeline[wttCurrentTimeIndex]) {
        lbl.textContent = wttRankingTimeline[wttCurrentTimeIndex].label;
    }
}

function wttCalculateRankChanges(cd, pd, isInitial) {
    if (!pd || isInitial) {
        return cd.map((p, i) => ({
            ...p, rank: i + 1, change: 0, changeType: 'new',
            pointsChange: 0, pointsChangeType: 'new'
        }));
    }
    const prm = {}, ppm = {};
    pd.forEach((p, i) => { prm[p['姓名']] = i + 1; ppm[p['姓名']] = p['当前积分'] || 0; });
    return cd.map((p, i) => {
        const cr = i + 1, pr = prm[p['姓名']], pp = ppm[p['姓名']], cp = p['当前积分'] || 0;
        let rc = 0, rct = 'new';
        if (pr === undefined) rct = 'new';
        else { rc = pr - cr; if (rc > 0) rct = 'up'; else if (rc < 0) rct = 'down'; else rct = 'same'; }
        let pc = 0, pct = 'new';
        if (pp === undefined) pct = 'new';
        else { pc = cp - pp; if (pc > 0.05) pct = 'up'; else if (pc < -0.05) pct = 'down'; else pct = 'same'; }
        return { ...p, rank: cr, change: rc, changeType: rct, pointsChange: pc, pointsChangeType: pct };
    });
}

function wttSortKeyLabel(key) {
    return i18n[currentLang]['rank_col_' + ({ rank: 'rank', '姓名': 'name', '当前积分': 'points', '积分变化': 'points_change', '变化': 'change', '总场次': 'matches', '胜率': 'winrate' }[key] || key)] || key;
}

function wttUpdateRankingDisplay() {
    if (!wttRankingTimeline.length || !wttRankingTimeline[wttCurrentTimeIndex]) return;
    const cn = wttRankingTimeline[wttCurrentTimeIndex];
    const pn = wttCurrentTimeIndex > 0 ? wttRankingTimeline[wttCurrentTimeIndex - 1] : null;
    wttCurrentDisplayData = wttCalculateRankChanges(cn.data, pn ? pn.data : null, cn.isInitial);
    wttCurrentDisplayData = wttSortDisplayData(wttCurrentSortKey, wttCurrentSortDir);
    wttRenderRankingTable(wttCurrentDisplayData);
    const ind = document.getElementById('sortIndicator');
    if (ind) ind.textContent = `${wttSortKeyLabel(wttCurrentSortKey)}${wttCurrentSortDir === 'desc' ? i18n[currentLang].sort_desc : i18n[currentLang].sort_asc}`;
    wttUpdateSortHeaderHighlight();
    const lbl = document.getElementById('currentTimeLabel');
    if (lbl) lbl.textContent = cn.label;
}

function wttSortDisplayData(key, dir) {
    return [...wttCurrentDisplayData].sort((a, b) => {
        let va, vb;
        if (key === '胜率') { va = parseWinRate(a['胜率']); vb = parseWinRate(b['胜率']); }
        else if (key === '姓名') return dir === 'asc' ? (a['姓名'] || '').localeCompare(b['姓名'] || '', 'zh') : (b['姓名'] || '').localeCompare(a['姓名'] || '', 'zh');
        else if (key === 'rank') { va = a.rank || 0; vb = b.rank || 0; }
        else if (key === '变化') { va = a.change || 0; vb = b.change || 0; }
        else if (key === '积分变化') { va = a.pointsChange || 0; vb = b.pointsChange || 0; }
        else { va = a[key] || 0; vb = b[key] || 0; }
        return va < vb ? (dir === 'asc' ? -1 : 1) : va > vb ? (dir === 'asc' ? 1 : -1) : 0;
    });
}

function wttRenderRankingTable(data) {
    const tb = document.getElementById('rankingFullBody');
    if (!tb) return;
    if (!data || !data.length) {
        tb.innerHTML = '<tr><td colspan="7" style="text-align:center;padding:40px;">' + i18n[currentLang].wtt_no_data + '</td></tr>';
        return;
    }
    tb.innerHTML = '';
    const currentSnapshotDate = wttRankingTimeline[wttCurrentTimeIndex]?.time || '';

    data.forEach((p, i) => {
        const tr = document.createElement('tr');
        const wr = p['胜率'] || '0%';
        const wd = wr === '#DIV/0!' || wr === '-' ? '0%' : wr;

        let ch = '', pch = '';
        if (p.changeType === 'up') ch = `<span class="rank-change rank-up">▲${Math.abs(p.change)}</span>`;
        else if (p.changeType === 'down') ch = `<span class="rank-change rank-down">▼${Math.abs(p.change)}</span>`;
        else if (p.changeType === 'new') ch = '<span class="rank-new">NEW</span>';
        else ch = '<span class="rank-same">-</span>';

        if (p.pointsChangeType === 'up') pch = `<span class="rank-change rank-up">▲${Math.abs(p.pointsChange).toFixed(1)}</span>`;
        else if (p.pointsChangeType === 'down') pch = `<span class="rank-change rank-down">▼${Math.abs(p.pointsChange).toFixed(1)}</span>`;
        else if (p.pointsChangeType === 'new') pch = '<span class="rank-new">NEW</span>';
        else pch = '<span class="rank-same">-</span>';

        const pn = String(p['姓名'] || '-');
        const pnSafe = escapeHtml(pn);
        const sds = escapeHtml(currentSnapshotDate || '');
        const flagHtml = (function () {
            const a = wttGetPlayerAssoc(pn);
            const cls = a ? wttAssocFlagClass(a.assoc) : '';
            if (!cls) return '';
            return `<span class="player-flag ${cls}" title="${escapeHtml(a.assoc)}${a.country ? ' · ' + escapeHtml(a.country) : ''}"></span> `;
        })();
        const nc = (wttScoreLogData.length > 0)
            ? flagHtml + wttLinkPlayerName(pn) + ` <button class="score-detail-icon" onclick="wttShowScoreDetail('${pnSafe}','${sds}')" title="${escapeHtml(i18n[currentLang].wtt_click_detail)}"><i class="fa-solid fa-receipt"></i></button>`
            : flagHtml + pnSafe;

        tr.innerHTML = `<td>${i + 1}</td><td>${nc}</td><td><strong>${(p['当前积分'] || 0).toFixed(1)}</strong></td><td>${pch}</td><td>${ch}</td><td>${p['总场次'] || 0}</td><td>${wd}</td>`;
        tb.appendChild(tr);
    });
}

function wttUpdateSortHeaderHighlight() {
    document.querySelectorAll('.ranking-table-full th.sortable').forEach(th => {
        th.classList.remove('active-sort');
        if (th.getAttribute('data-sort') === wttCurrentSortKey) th.classList.add('active-sort');
    });
}

function wttSetupSortListeners() {
    document.querySelectorAll('.ranking-table-full th.sortable').forEach(th => {
        const nt = th.cloneNode(true);
        th.parentNode.replaceChild(nt, th);
        nt.addEventListener('click', () => {
            const key = nt.getAttribute('data-sort');
            wttCurrentSortDir = key === wttCurrentSortKey ? (wttCurrentSortDir === 'desc' ? 'asc' : 'desc') : 'desc';
            wttCurrentSortKey = key;
            wttCurrentDisplayData = wttSortDisplayData(key, wttCurrentSortDir);
            wttRenderRankingTable(wttCurrentDisplayData);
            wttUpdateSortHeaderHighlight();
            document.querySelectorAll('.ranking-table-full th.sortable').forEach(h => {
                const a = h.querySelector('.sort-arrow');
                if (a) a.innerHTML = '';
            });
            const ar = nt.querySelector('.sort-arrow');
            if (ar) ar.innerHTML = wttCurrentSortDir === 'desc' ? '&#9660;' : '&#9650;';
            nt.classList.add('active-sort');
            const ind = document.getElementById('sortIndicator');
            if (ind) ind.textContent = `${wttSortKeyLabel(key)}${wttCurrentSortDir === 'desc' ? i18n[currentLang].sort_desc : i18n[currentLang].sort_asc}`;
        });
    });
}

// 初始化：绑定事件并启动数据加载
// 使用 readyState 检查确保在 DOM 就绪后执行（兼容脚本在 DOMContentLoaded 之后运行的情况）
function wttInitRankingPage() {
    // 绑定明细模态框事件
    const scoreDetailModal = document.getElementById('scoreDetailModal');
    const scoreDetailClose = document.getElementById('scoreDetailClose');
    if (scoreDetailClose && scoreDetailModal) {
        scoreDetailClose.addEventListener('click', () => closeModal(scoreDetailModal));
        scoreDetailModal.addEventListener('click', e => {
            if (e.target === scoreDetailModal) closeModal(scoreDetailModal);
        });
    }
    document.addEventListener('keydown', e => {
        if (e.key === 'Escape' && scoreDetailModal && scoreDetailModal.classList.contains('active')) {
            closeModal(scoreDetailModal);
        }
    });

    wttLoadRankingData();
}

// 语言切换时重渲染排名界面（覆盖 wtt_common.js 中的同名函数）
function wttReapplyI18n() {
    wttUpdatePageCategoryDisplay();
    if (!wttRankingTimeline || !wttRankingTimeline.length) return;
    wttRenderTimeNodeList();
    wttUpdateRankingDisplay();
    wttUpdateScoreDetailIfOpen();
}

function wttUpdateCategoryDisplay() {
    const catEl = document.getElementById('wttCatName');
    if (catEl) {
        const info = wttGetCategoryInfo();
        catEl.textContent = (typeof currentLang !== 'undefined' && currentLang === 'en' && info.nameEn) ? info.nameEn : info.name;
        catEl.style.color = info.color;
    }
}

function wttUpdateScoreDetailIfOpen() {
    const modal = document.getElementById('scoreDetailModal');
    if (modal && modal.classList.contains('active') && wttCurrentScoreContext && wttCurrentScoreContext.player) {
        wttRenderScoreDetail();
    }
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', wttInitRankingPage);
} else {
    // DOM 已经就绪，立即执行
    wttInitRankingPage();
}
