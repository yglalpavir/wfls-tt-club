/* ========================================
   wtt_ranking.js - WTT 国际乒联积分排名（彩蛋页面）
   复用 score-engine.js 核心计算逻辑
   ======================================== */

// WTT 专用全局状态
let wttScoreLogData = [];
let wttInitialScoresData = null;
let wttEventCoefficients = null;
let wttSeasonsData = null;
let wttRankingTimeline = [];
let wttCurrentTimeIndex = 0;
let wttCurrentDisplayData = [];
let wttCurrentSortKey = '当前积分';
let wttCurrentSortDir = 'desc';
let wttCurrentScoreContext = { player: '', snapshotDate: '' };
let wttInitialized = false;

// 桥接：让 main.js 中的 initPage() 调用 WTT 版本的加载
function loadRankingData() { return wttLoadRankingData(); }

// 覆盖全局变量以复用 score-engine.js 的函数
function wttLoadInitialScores() { return fetch('wtt_data/wtt_initial-scores.json').then(r => r.json()).then(d => { wttInitialScoresData = d; return true; }).catch(e => { console.error('WTT initial-scores 加载失败', e); return false; }); }
function wttLoadEventCoefficients() { return fetch('wtt_data/wtt_event-coefficient.json').then(r => r.json()).then(d => { wttEventCoefficients = d; return true; }).catch(e => { console.error('WTT event-coefficient 加载失败', e); return false; }); }
function wttLoadSeasons() { return fetch('wtt_data/wtt_seasons.json').then(r => r.json()).then(d => { wttSeasonsData = d; return true; }).catch(e => { wttSeasonsData = []; return false; }); }
function wttLoadScoreLog() { return fetch('wtt_data/wtt_score-log.json').then(r => r.json()).then(d => { wttScoreLogData = d; }).catch(e => { wttScoreLogData = []; }); }

// 桥接：让 score-engine.js 的函数使用 WTT 数据
function getWttActiveData() {
    return {
        get scoreLogData() { return wttScoreLogData; },
        get initialScoresData() { return wttInitialScoresData; },
        get eventCoefficients() { return wttEventCoefficients; },
        get seasonsData() { return wttSeasonsData; }
    };
}

// 封装计算：切换全局数据 → 计算 → 恢复
function wttCalculateAllRankings() {
    const origScoreLog = scoreLogData;
    const origInitial = initialScoresData;
    const origEvent = eventCoefficients;
    const origSeasons = seasonsData;

    scoreLogData = wttScoreLogData;
    initialScoresData = wttInitialScoresData;
    eventCoefficients = wttEventCoefficients;
    seasonsData = wttSeasonsData;

    const sortedLog = [...scoreLogData].sort((a, b) => a['日期'].localeCompare(b['日期']));
    const timeline = calculateAllRankingsWithSeasons(
        scoreLogData,
        initialScoresData.initialScores,
        seasonsData
    );
    // 计算实时积分
    const rt = wttCalculateRealtimeRanking();
    if (rt) timeline.push(rt);

    scoreLogData = origScoreLog;
    initialScoresData = origInitial;
    eventCoefficients = origEvent;
    seasonsData = origSeasons;

    return timeline;
}

function wttCalculateRealtimeRanking() {
    const origScoreLog = scoreLogData;
    const origInitial = initialScoresData;
    const origEvent = eventCoefficients;
    const origSeasons = seasonsData;

    scoreLogData = wttScoreLogData;
    initialScoresData = wttInitialScoresData;
    eventCoefficients = wttEventCoefficients;
    seasonsData = wttSeasonsData;

    const result = calculateRealtimeRanking();

    scoreLogData = origScoreLog;
    initialScoresData = origInitial;
    eventCoefficients = origEvent;
    seasonsData = origSeasons;

    return result;
}

// 为 WTT 封装 getSeasonStartScores
function wttGetSeasonStartScores(seasonIndex) {
    const origScoreLog = scoreLogData;
    const origInitial = initialScoresData;
    const origEvent = eventCoefficients;
    const origSeasons = seasonsData;

    scoreLogData = wttScoreLogData;
    initialScoresData = wttInitialScoresData;
    eventCoefficients = wttEventCoefficients;
    seasonsData = wttSeasonsData;

    const result = getSeasonStartScores(seasonIndex);

    scoreLogData = origScoreLog;
    initialScoresData = origInitial;
    eventCoefficients = origEvent;
    seasonsData = origSeasons;

    return result;
}

// 显示积分明细
function wttShowScoreDetail(playerName, snapshotDate) {
    const modal = document.getElementById('scoreDetailModal');
    const body = document.getElementById('scoreDetailBody');
    const title = document.getElementById('scoreDetailTitle');
    if (!modal || !body || window.innerWidth < 1200) return;

    wttCurrentScoreContext = {
        player: playerName,
        snapshotDate: snapshotDate || (wttRankingTimeline[wttCurrentTimeIndex]?.time || '')
    };
    title.textContent = `${playerName} - 积分明细（${wttRankingTimeline[wttCurrentTimeIndex]?.label || ''}）`;
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
    initialScoresData = wttInitialScoresData;
    eventCoefficients = wttEventCoefficients;
    seasonsData = wttSeasonsData;

    // 找到快照日期所在的赛季
    const currentSeason = getSeasonForDate(snapshotDate);
    if (!currentSeason) {
        body.innerHTML = '<tr><td colspan="7" style="text-align:center;padding:20px;">暂无记录</td></tr>';
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
        body.innerHTML = '<tr><td colspan="7" style="text-align:center;padding:20px;">暂无记录</td></tr>';
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
            if (!scores[w]) scores[w] = 1300; if (!scores[l]) scores[l] = 1300;
            const decayedGain = calcMatchPoints(w, l, record['类型'], record['日期'], snapshotDate, scores);
            const rawGain = calcRawPoints(w, l, record['类型'], scores);
            if (record['胜者'] === player || record['负者'] === player) {
                const isWinner = record['胜者'] === player;
                const rawChange = isWinner ? rawGain : -(rawGain * 0.8);
                const decayedChange = isWinner ? decayedGain : -(decayedGain * 0.8);
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
            scores[l] = Math.max(SCORE_FLOOR, scores[l] - decayedGain * 0.8);
        } else if (isBonusRecord(record) && record['对象'] === player) {
            const bonus = parseFloat(record['分数']) || 0;
            if (!scores[player]) scores[player] = 1300;
            recordsWithScores.push({
                date: record['日期'], type: '加分', opponent: '-',
                isWinner: true, isBonus: true,
                scoreBefore: scores[player], rawChange: bonus, decayedChange: bonus,
                scoreAfter: scores[player] + bonus
            });
            scores[player] = Math.max(SCORE_FLOOR, scores[player] + bonus);
        } else if (isBonusRecord(record)) {
            const target = record['对象'];
            const bonus = parseFloat(record['分数']) || 0;
            if (!scores[target]) scores[target] = 1300;
            scores[target] = Math.max(SCORE_FLOOR, scores[target] + bonus);
        }
    }

    recordsWithScores.reverse();
    body.innerHTML = recordsWithScores.map(r => {
        if (r.isBonus) {
            const cc = r.decayedChange >= 0 ? 'score-change-positive' : 'score-change-negative';
            const sign = r.decayedChange >= 0 ? '+' : '';
            return `<tr><td>${r.date}</td><td>${r.type}</td><td>-</td><td class="result-win">加分</td><td>${r.scoreBefore.toFixed(1)}</td><td class="${cc}">${sign}${r.decayedChange.toFixed(1)}</td><td>${r.scoreAfter.toFixed(1)}</td></tr>`;
        }
        const res = r.isWinner ? '胜' : '负';
        const rc = r.isWinner ? 'result-win' : 'result-loss';
        const cc = r.decayedChange >= 0 ? 'score-change-positive' : 'score-change-negative';
        const signRaw = r.rawChange >= 0 ? '+' : '';
        const signDecayed = r.decayedChange >= 0 ? '+' : '';
        const changeDisplay = `${signRaw}${r.rawChange.toFixed(1)}（${signDecayed}${r.decayedChange.toFixed(1)}）`;
        return `<tr><td>${r.date}</td><td>${r.type}</td><td>${r.opponent}</td><td class="${rc}">${res}</td><td>${r.scoreBefore.toFixed(1)}</td><td class="${cc}">${changeDisplay}</td><td>${r.scoreAfter.toFixed(1)}</td></tr>`;
    }).join('');

    scoreLogData = origScoreLog; initialScoresData = origInitial;
    eventCoefficients = origEvent; seasonsData = origSeasons;

    setTimeout(wttAdjustModalSize, 150);
}

// 加载并渲染
async function wttLoadRankingData() {
    if (wttInitialized) return;
    wttInitialized = true;
    const tb = document.getElementById('rankingFullBody');
    if (!tb) return;

    try {
        await Promise.all([wttLoadInitialScores(), wttLoadEventCoefficients(), wttLoadSeasons(), wttLoadScoreLog()]);
        if (!wttInitialScoresData || !wttEventCoefficients || !wttSeasonsData) throw new Error('WTT数据加载失败');

        wttRankingTimeline = wttCalculateAllRankings();
        wttCurrentTimeIndex = wttRankingTimeline.length - 1;
        wttCurrentSortKey = '当前积分';
        wttCurrentSortDir = 'desc';

        wttRenderTimeNodeList();
        wttUpdateRankingDisplay();
        wttSetupSortListeners();
    } catch (e) {
        console.error('WTT排名计算失败', e);
        tb.innerHTML = '<tr><td colspan="7" style="text-align:center;padding:40px;color:var(--accent-red);">无法计算WTT排名数据</td></tr>';
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
        rli.innerHTML = `<div class="realtime-header"><i class="fa-solid fa-clock"></i><span class="realtime-label">实时积分</span></div><ul class="season-node-list"><li class="time-node-item realtime-node ${n.index === wttCurrentTimeIndex ? 'active' : ''}" data-index="${n.index}"><span class="node-dot"></span>${n.label}<span class="node-count">${n.data.length}人</span></li></ul>`;
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
        const s = n.season || '默认赛季';
        if (!seasons[s]) seasons[s] = [];
        seasons[s].push({ ...n, index: n.index });
    });

    Object.entries(seasons).forEach(([season, nodes]) => {
        const sli = document.createElement('li');
        sli.className = 'season-group';
        sli.innerHTML = `<div class="season-header"><i class="fa-solid fa-chevron-down season-arrow"></i><span class="season-label">${season}</span><span class="season-count">${nodes.length}个节点</span></div><ul class="season-node-list">${nodes.map(n => `<li class="time-node-item ${n.index === wttCurrentTimeIndex ? 'active' : ''} ${n.isInitial ? 'initial-node' : ''}" data-index="${n.index}"><span class="node-dot"></span>${n.label}<span class="node-count">${n.data.length}人</span></li>`).join('')}</ul>`;
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

function wttUpdateRankingDisplay() {
    if (!wttRankingTimeline.length || !wttRankingTimeline[wttCurrentTimeIndex]) return;
    const cn = wttRankingTimeline[wttCurrentTimeIndex];
    const pn = wttCurrentTimeIndex > 0 ? wttRankingTimeline[wttCurrentTimeIndex - 1] : null;
    wttCurrentDisplayData = wttCalculateRankChanges(cn.data, pn ? pn.data : null, cn.isInitial);
    wttCurrentDisplayData = wttSortDisplayData(wttCurrentSortKey, wttCurrentSortDir);
    wttRenderRankingTable(wttCurrentDisplayData);
    const ind = document.getElementById('sortIndicator');
    if (ind) ind.textContent = `${wttCurrentSortKey}${wttCurrentSortDir === 'desc' ? '降序' : '升序'}`;
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
        tb.innerHTML = '<tr><td colspan="7" style="text-align:center;padding:40px;">暂无排名数据</td></tr>';
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

        const pn = p['姓名'] || '-';
        const nc = (window.innerWidth >= 1200 && wttScoreLogData.length > 0)
            ? `<span class="player-name-link" onclick="wttShowScoreDetail('${pn}','${currentSnapshotDate}')" title="点击查看积分明细">${pn}</span>`
            : pn;

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
            if (ind) ind.textContent = `${key}${wttCurrentSortDir === 'desc' ? '降序' : '升序'}`;
        });
    });
}

// 初始化
document.addEventListener('DOMContentLoaded', () => {
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
});
