/* ========================================
   wtt_assoc.js - WTT 协会数据页
   功能：数据概览 / 协会实力总榜 / 排名变迁图 / 协会对抗矩阵
   依赖：common.js score-engine.js wtt_common.js Chart.js
   入口：wtt_hub.html 分类卡片「协会数据」→ wtt_assoc.html?cat={id}
   ======================================== */

// ============ 图表配色 ============

const WTA_CHART_COLORS = ['#4da3ff', '#ff6b6b', '#52c41a', '#f5c542', '#ff9f43', '#a55eea', '#26de81', '#fd79a8'];

// ============ 页面状态与缓存 ============

const wtaState = {
    ready: false,
    snapshotIdx: -1,     // 当前查看的时间快照索引
    topN: 50,            // TOP-N 统计列
    bumpCodes: [],       // 变迁图选中的协会代码
    bumpCount: 30,       // 变迁图数据点数量
    matrixTopN: 10,      // 对抗矩阵规模
    expandedAssoc: null  // 当前展开明细的协会代码
};

let wtaBumpChart = null;
let wtaListCache = new Map();     // idx -> 实力榜列表（含完整球员数组）
let wtaRankMapCache = new Map();  // idx -> Map(姓名 -> 全球排名)
let wtaH2HCache = null;           // { wins: {A:{B:n}}, total: {A:{B:n}} }

// 前五加权权重（与 wtt_dataviz_extra.js 的 WTT_ASSOC_WEIGHTS 保持一致）
const WTA_ASSOC_WEIGHTS = [0.4, 0.3, 0.15, 0.1, 0.05];

// ============ 数据辅助（本页独立实现，避免整包引入 dataviz_extra） ============

function wtaShorten(name) {
    const s = String(name || '');
    return s.length > 14 ? s.slice(0, 12) + '…' : s;
}

function wtaSeasonByLabel(label) {
    if (!label || !wttSeasonsData || !wttSeasonsData.length) return null;
    return wttSeasonsData.find(s => s.label === label) || null;
}

// 返回某赛季内有比赛记录的球员集合；无赛季/无数据时返回 null（不过滤）
function wtaSeasonActivePlayers(season) {
    if (!season || !wttScoreLogData || !wttScoreLogData.length) return null;
    const active = new Set();
    for (const r of wttScoreLogData) {
        if (!isMatchRecord(r)) continue;
        const d = r['日期'];
        if (d && d >= season.startDate && d <= season.endDate) {
            if (r['胜者']) active.add(r['胜者']);
            if (r['负者']) active.add(r['负者']);
        }
    }
    return active;
}

// 收集全部球员名：时间线快照 + 初始积分 + 比赛记录（双打项目为组合名）
function wtaCollectPlayers() {
    const set = new Set();
    if (wttRankingTimeline && wttRankingTimeline.length) {
        for (const t of wttRankingTimeline) {
            if (t.data && t.data.length) for (const p of t.data) if (p['姓名']) set.add(p['姓名']);
        }
    }
    if (wttInitialScoresData && wttInitialScoresData.initialScores) {
        for (const n of Object.keys(wttInitialScoresData.initialScores)) if (n) set.add(n);
    }
    if (wttScoreLogData && wttScoreLogData.length) {
        for (const r of wttScoreLogData) {
            if (isMatchRecord(r)) {
                if (r['胜者']) set.add(r['胜者']);
                if (r['负者']) set.add(r['负者']);
            } else if (isBonusRecord(r) && r['对象']) {
                set.add(r['对象']);
            }
        }
    }
    return Array.from(set);
}

// 代码 -> [球员名...]（仅含能匹配到协会籍的球员）
function wtaAssocPlayerMap() {
    const map = {};
    for (const name of wtaCollectPlayers()) {
        const a = wttGetPlayerAssoc(name);
        if (!a || !a.assoc) continue;
        const code = String(a.assoc).toUpperCase();
        if (!map[code]) map[code] = [];
        map[code].push(name);
    }
    return map;
}

// 代码 -> 国家/地区名（缺省回退代码）
function wtaCountryMap() {
    const m = {};
    if (wttPlayerAssocData) {
        for (const v of Object.values(wttPlayerAssocData)) {
            if (v && v.assoc) {
                const code = String(v.assoc).toUpperCase();
                if (!m[code]) m[code] = v.country || v.assoc;
            }
        }
    }
    return m;
}

// 由按积分降序的球员数组计算协会实力分（前五加权，不足5人按可用权重归一化并惩罚）
function wtaStrengthFromScores(sortedPlayers) {
    if (!sortedPlayers || !sortedPlayers.length) return 0;
    const top = sortedPlayers.slice(0, 5);
    let num = 0, den = 0;
    for (let i = 0; i < top.length; i++) {
        num += top[i].score * WTA_ASSOC_WEIGHTS[i];
        den += WTA_ASSOC_WEIGHTS[i];
    }
    let strength = den > 0 ? num / den : 0;
    if (strength > 0 && top.length < 5) {
        strength *= Math.pow(0.95, 5 - top.length);
    }
    return strength;
}

// 某快照的完整 姓名->积分 映射（快照数据 + 赛季继承 + 初始分兜底）
function wtaBuildSnapshotScoreMap(entry) {
    const scores = {};
    for (const p of (entry && entry.data) || []) {
        if (p['姓名'] != null) scores[p['姓名']] = p['当前积分'] || 0;
    }
    wttWithDataContext(() => {
        if (wttSeasonsData && wttSeasonsData.length > 0 && entry && entry.season) {
            const season = wttSeasonsData.find(s => s.label === entry.season);
            if (season) {
                const idx = wttSeasonsData.indexOf(season);
                if (idx >= 0) {
                    const startScores = getSeasonStartScores(idx);
                    for (const [name, score] of Object.entries(startScores)) {
                        if (!(name in scores)) scores[name] = score;
                    }
                }
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

// 计算某快照的协会实力榜（缓存）。列表项含完整球员数组供明细展开复用。
function wtaComputeListAt(idx) {
    if (wtaListCache.has(idx)) return wtaListCache.get(idx);
    const entry = wttRankingTimeline[idx];
    let list = [];
    if (entry && wttPlayerAssocData) {
        const scoreMap = wtaBuildSnapshotScoreMap(entry);
        const assocPlayers = wtaAssocPlayerMap();
        const countryMap = wtaCountryMap();
        const season = entry.season ? wtaSeasonByLabel(entry.season) : null;
        const activeThisSeason = wtaSeasonActivePlayers(season);
        const filterActive = activeThisSeason && activeThisSeason.size > 0
            ? name => activeThisSeason.has(name)
            : () => true;
        // flat1300 模式下，尚未出场的组合概念上持有基础分（引擎首战时懒赋值 DEFAULT_INITIAL_SCORE）
        const fallbackScore = (wttSettings && wttSettings.scoreMode === 'flat1300')
            ? DEFAULT_INITIAL_SCORE : 0;
        for (const [code, players] of Object.entries(assocPlayers)) {
            const scored = players
                .filter(filterActive)
                .map(name => ({ name, score: (scoreMap[name] != null) ? scoreMap[name] : fallbackScore }))
                .sort((a, b) => b.score - a.score);
            list.push({
                assoc: code,
                country: countryMap[code] || code,
                score: wtaStrengthFromScores(scored),
                top5: scored.slice(0, 5),
                players: scored,
                count: scored.length
            });
        }
        // 隐去该时间节点下实力分为 0 的协会（无活跃球员或全员零分）
        list = list.filter(a => a.score > 0);
        list.sort((a, b) => b.score - a.score);
    }
    wtaListCache.set(idx, list);
    return list;
}

// 某快照的全球排名映射（姓名 -> 名次）
// 仅统计该时间节点下活跃的球员（当季有比赛记录），已退役的不活跃球员不占排名席位
function wtaGlobalRankMapAt(idx) {
    if (wtaRankMapCache.has(idx)) return wtaRankMapCache.get(idx);
    const entry = wttRankingTimeline[idx];
    const scoreMap = wtaBuildSnapshotScoreMap(entry);
    const season = entry && entry.season ? wtaSeasonByLabel(entry.season) : null;
    const active = wtaSeasonActivePlayers(season);
    let names = Object.keys(scoreMap);
    if (active && active.size > 0) names = names.filter(n => active.has(n));
    const arr = names.map(n => ({ name: n, score: scoreMap[n] }));
    arr.sort((a, b) => b.score - a.score);
    const m = new Map();
    arr.forEach((p, i) => m.set(p.name, i + 1));
    wtaRankMapCache.set(idx, m);
    return m;
}

// ============ 数据加载（统一进度条模式） ============

async function wtaLoadData() {
    const mountId = 'wttAssocLoading';
    function setP(pct, detail, main) { wttSetLoadingProgress(mountId, pct, detail, main); }
    wttMountLoading(mountId, i18n[currentLang].wtt_prepare);
    setP(wttLoadPhasePct('download', 0, 1), '', i18n[currentLang].wtt_prepare);

    try {
        await new Promise(r => setTimeout(r, 0));

        // settings 先行，其余文件并行下载（含 assoc.json）
        await wttLoadSettingsAndFiles(true, (done, total, label) => {
            setP(wttLoadPhasePct('download', done + 1, total + 1),
                i18n[currentLang].wtt_downloading.replace('{label}', label).replace('{i}', String(done + 1)).replace('{total}', String(total + 1)).replace('{file}', label));
        });

        const isFlat = wttSettings && wttSettings.scoreMode === 'flat1300';
        if (!isFlat && !wttInitialScoresData) throw new Error('initial-scores 加载失败');
        if (!wttEventCoefficients || !wttSeasonsData) throw new Error('核心数据加载失败');

        // 异步分块计算排名时间线
        setP(wttLoadPhasePct('calc', 0, 1), '', i18n[currentLang].wtt_calculating);
        wttRankingTimeline = await wttCalculateAllRankingsAsync((current, total, label, phase) => {
            setP(wttLoadPhasePct(phase || 'calc', current, total),
                (label ? label + ' · ' : '') + i18n[currentLang].wtt_snapshot.replace('{current}', current).replace('{total}', total));
        });
        if (!wttRankingTimeline || !wttRankingTimeline.length) throw new Error('排名计算结果为空');

        wttStopLoadingTimer(mountId);
        const el = document.getElementById(mountId);
        if (el) el.innerHTML = '';
        return true;
    } catch (e) {
        console.error('[WttAssoc] 数据加载失败', e);
        wttStopLoadingTimer(mountId);
        const el = document.getElementById(mountId);
        if (el) el.innerHTML = '<div style="padding:16px;text-align:center;color:var(--accent-red);">❌ ' + escapeHtml(i18n[currentLang].wtt_error_fail || '加载失败') + '</div>';
        return false;
    }
}

// ============ ① 数据概览 ============

function wtaRenderOverview() {
    const elAssocs = document.getElementById('wtaStatAssocs');
    const elPlayers = document.getElementById('wtaStatPlayers');
    const elCountries = document.getElementById('wtaStatCountries');
    const elLeader = document.getElementById('wtaStatLeader');
    const elSub = document.getElementById('wtaStatLeaderSub');
    if (!elAssocs || !elPlayers || !elCountries || !elLeader) return;

    if (!wttPlayerAssocData || !wttRankingTimeline.length) {
        elAssocs.textContent = elPlayers.textContent = elCountries.textContent = '-';
        elLeader.textContent = '-';
        if (elSub) elSub.textContent = '';
        return;
    }

    const list = wtaComputeListAt(wtaState.snapshotIdx >= 0 ? wtaState.snapshotIdx : wttRankingTimeline.length - 1);
    elAssocs.textContent = list.length;
    elPlayers.textContent = list.reduce((s, a) => s + a.count, 0);
    elCountries.textContent = new Set(list.map(a => a.country)).size;

    const top = list[0];
    if (top) {
        const cls = wttAssocFlagClass(top.assoc);
        const flag = cls ? `<span class="player-flag ${cls}" title="${escapeHtml(top.assoc)}"></span>` : '';
        elLeader.innerHTML = flag + escapeHtml(top.country);
        if (elSub) elSub.textContent = top.score.toFixed(1);
    } else {
        elLeader.textContent = '-';
        if (elSub) elSub.textContent = '';
    }
}

// ============ ② 协会实力总榜 ============

function wtaFillSnapshotSelect() {
    const sel = document.getElementById('wttAssocSnapshotSelect');
    if (!sel || !wttRankingTimeline.length) return;
    const cur = sel.value;
    sel.innerHTML = '';
    for (let i = wttRankingTimeline.length - 1; i >= 0; i--) {
        const opt = document.createElement('option');
        opt.value = String(i);
        opt.textContent = wttRankingTimeline[i].label;
        sel.appendChild(opt);
    }
    sel.disabled = false;
    sel.value = (cur !== '') ? cur : String(wtaState.snapshotIdx);
    if (sel.selectedIndex < 0) sel.value = String(wtaState.snapshotIdx);
}

function wtaTrendBadge(cur, prevMap) {
    const prev = prevMap.get(cur.assoc);
    if (prev === undefined) return '<span class="rank-new">NEW</span>';
    const d = cur.score - prev;
    if (d > 0.05) return `<span class="rank-change rank-up">▲${d.toFixed(1)}</span>`;
    if (d < -0.05) return `<span class="rank-change rank-down">▼${Math.abs(d).toFixed(1)}</span>`;
    return '<span class="rank-same">-</span>';
}

function wtaFlagSpan(code, title) {
    const cls = wttAssocFlagClass(code);
    return cls ? `<span class="player-flag ${cls}" title="${escapeHtml(title)}"></span>` : '';
}

function wtaRenderRankingTable() {
    const tb = document.getElementById('wttAssocRankBody');
    if (!tb) return;
    const colInTop = document.getElementById('wtaColInTop');
    if (colInTop) colInTop.textContent = (i18n[currentLang].wtt_assoc_col_in_top || 'TOP{n}').replace('{n}', wtaState.topN);

    if (!wttPlayerAssocData) {
        tb.innerHTML = `<tr><td colspan="7" style="text-align:center;padding:36px;color:var(--text-muted);">${escapeHtml(i18n[currentLang].wtt_assoc_no_data_hint)}</td></tr>`;
        ['wttAssocSnapshotSelect', 'wttAssocTopNInput'].forEach(id => { const el = document.getElementById(id); if (el) el.disabled = true; });
        return;
    }

    const idx = Math.max(0, Math.min(wtaState.snapshotIdx, wttRankingTimeline.length - 1));
    const list = wtaComputeListAt(idx);
    if (!list.length) {
        tb.innerHTML = `<tr><td colspan="7" style="text-align:center;padding:36px;color:var(--text-muted);">${escapeHtml(i18n[currentLang].wtt_no_data)}</td></tr>`;
        return;
    }

    const prevMap = new Map();
    if (idx > 0) {
        for (const a of wtaComputeListAt(idx - 1)) prevMap.set(a.assoc, a.score);
    }
    const rankMap = wtaGlobalRankMapAt(idx);
    const topLimit = Math.min(wtaState.topN, rankMap.size);

    tb.innerHTML = list.map((a, i) => {
        const inTop = a.players.filter(p => (rankMap.get(p.name) || Infinity) <= topLimit).length;
        const leader = a.top5[0];
        const leaderHtml = leader
            ? `${wttLinkPlayerName(wtaShorten(leader.name))}<span class="rank-same" style="margin-left:6px;">${leader.score.toFixed(1)}</span>`
            : '<span class="rank-same">-</span>';
        const medalCls = i < 3 ? ` wta-rank-${i + 1}` : '';
        return `
        <tr class="main-row${medalCls}" data-assoc="${escapeHtml(a.assoc)}">
            <td>${i + 1}</td>
            <td style="text-align:left;">${wtaFlagSpan(a.assoc, a.assoc)}<strong>${escapeHtml(a.country)}</strong> <span class="rank-same">${escapeHtml(a.assoc)}</span></td>
            <td><strong>${a.score.toFixed(1)}</strong></td>
            <td>${wtaTrendBadge(a, prevMap)}</td>
            <td>${a.count}</td>
            <td style="text-align:left;">${leaderHtml}</td>
            <td>${inTop}</td>
        </tr>
        <tr class="wta-detail-row" data-for="${escapeHtml(a.assoc)}" style="display:none;"><td colspan="7"></td></tr>`;
    }).join('');

    // 恢复展开状态
    if (wtaState.expandedAssoc) wtaToggleDetail(wtaState.expandedAssoc, true);
}

function wtaBuildSquadHtml(a, idx) {
    const lang = i18n[currentLang];
    if (!a.players.length) {
        return `<div class="wta-squad-box"><div class="compare-placeholder"><p>${escapeHtml(lang.wtt_assoc_sq_empty)}</p></div></div>`;
    }
    const rankMap = wtaGlobalRankMapAt(idx);
    const entry = wttRankingTimeline[idx];
    const infoByName = {};
    ((entry && entry.data) || []).forEach((p, i) => {
        infoByName[p['姓名']] = { m: p['总场次'], wr: p['胜率'] };
    });

    const rows = a.players.map((p, j) => {
        const info = infoByName[p.name] || {};
        let wr = info.wr;
        if (wr === '#DIV/0!' || wr === '-') wr = '0%';
        const gRank = rankMap.has(p.name) ? rankMap.get(p.name) : '-';
        return `<tr>
            <td>${j + 1}</td>
            <td class="name-cell">${wttLinkPlayerName(p.name)}</td>
            <td><strong>${p.score.toFixed(1)}</strong></td>
            <td>${info.m != null ? info.m : '-'}</td>
            <td>${wr != null ? escapeHtml(String(wr)) : '-'}</td>
            <td>${gRank}</td>
        </tr>`;
    }).join('');

    return `<div class="wta-squad-box">
        <div class="wta-squad-title">${wtaFlagSpan(a.assoc, a.assoc)}${escapeHtml(a.country)} · ${escapeHtml(a.assoc)}
            <span class="rank-same">(${lang.wtt_assoc_stat_players}: ${a.players.length})</span>
        </div>
        <div class="wta-squad-scroll">
            <table class="wta-squad-table">
                <thead><tr>
                    <th>#</th>
                    <th style="text-align:left;">${escapeHtml(lang.rank_col_name || 'Player')}</th>
                    <th>${escapeHtml(lang.wtt_assoc_sq_points)}</th>
                    <th>${escapeHtml(lang.wtt_assoc_sq_matches)}</th>
                    <th>${escapeHtml(lang.wtt_assoc_sq_winrate)}</th>
                    <th>${escapeHtml(lang.wtt_assoc_sq_global_rank)}</th>
                </tr></thead>
                <tbody>${rows}</tbody>
            </table>
        </div>
    </div>`;
}

function wtaToggleDetail(assoc, forceOpen) {
    const tb = document.getElementById('wttAssocRankBody');
    if (!tb) return;
    const idx = Math.max(0, Math.min(wtaState.snapshotIdx, wttRankingTimeline.length - 1));
    const list = wtaComputeListAt(idx);
    const a = list.find(x => x.assoc === assoc);
    const detailRow = tb.querySelector(`tr.wta-detail-row[data-for="${CSS.escape(assoc)}"]`);
    const mainRow = tb.querySelector(`tr.main-row[data-assoc="${CSS.escape(assoc)}"]`);
    if (!detailRow || !mainRow || !a) return;

    const isOpen = detailRow.style.display !== 'none';
    if (isOpen && !forceOpen) {
        detailRow.style.display = 'none';
        mainRow.classList.remove('expanded');
        if (wtaState.expandedAssoc === assoc) wtaState.expandedAssoc = null;
        return;
    }
    // 手风琴模式：先收起其他行
    tb.querySelectorAll('tr.wta-detail-row').forEach(r => { r.style.display = 'none'; });
    tb.querySelectorAll('tr.main-row.expanded').forEach(r => r.classList.remove('expanded'));
    detailRow.querySelector('td').innerHTML = wtaBuildSquadHtml(a, idx);
    detailRow.style.display = '';
    mainRow.classList.add('expanded');
    wtaState.expandedAssoc = assoc;
}

// ============ ③ 协会排名变迁（Bump 折线） ============

function wtaRenderBumpControls() {
    const container = document.getElementById('wttAssocBumpList');
    const btn = document.getElementById('wttAssocBumpApply');
    if (!container) return;
    if (!wttPlayerAssocData) {
        container.innerHTML = `<div style="padding:20px;text-align:center;color:var(--text-muted);font-size:.85rem;">${escapeHtml(i18n[currentLang].wtt_assoc_no_data_hint)}</div>`;
        if (btn) btn.disabled = true;
        return;
    }
    if (btn) btn.disabled = false;

    const list = wtaComputeListAt(wtaState.snapshotIdx);
    const selected = new Set(wtaState.bumpCodes);
    container.innerHTML = list.map((a, i) => {
        const checked = selected.size ? selected.has(a.assoc) : (i < 6);
        return `<label class="player-checkbox-item ${checked ? 'checked' : ''}">
            <input type="checkbox" value="${escapeHtml(a.assoc)}" ${checked ? 'checked' : ''}>
            <span class="assoc-checkbox-label">${wtaFlagSpan(a.assoc, a.assoc)}<span>${escapeHtml(a.country)}</span></span>
            <span class="player-rank">#${i + 1}</span>
        </label>`;
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

function wtaRenderBumpChart() {
    const canvas = document.getElementById('wttAssocBumpChart');
    if (!canvas || !wttRankingTimeline.length) return;
    if (wtaBumpChart) { wtaBumpChart.destroy(); wtaBumpChart = null; }

    const codes = wtaState.bumpCodes;
    if (!codes.length) return;

    const total = wttRankingTimeline.length;
    const n = Math.max(2, Math.min(wtaState.bumpCount || 30, total));
    const start = total - n;

    const labels = [];
    const rankByCode = {};
    codes.forEach(c => { rankByCode[c] = []; });
    for (let i = start; i < total; i++) {
        const order = wtaComputeListAt(i).map(a => a.assoc);
        labels.push(wttRankingTimeline[i].label);
        const pos = {};
        order.forEach((c, j) => { pos[c] = j + 1; });
        for (const c of codes) rankByCode[c].push(pos[c] != null ? pos[c] : null);
    }

    const isMobile = window.innerWidth <= 768;
    const countryMap = wtaCountryMap();
    const datasets = codes.map((code, i) => ({
        label: countryMap[code] || code,
        data: rankByCode[code],
        borderColor: WTA_CHART_COLORS[i % WTA_CHART_COLORS.length],
        backgroundColor: WTA_CHART_COLORS[i % WTA_CHART_COLORS.length] + '25',
        borderWidth: isMobile ? 1.5 : 2,
        pointRadius: isMobile ? 2 : 3,
        pointHoverRadius: isMobile ? 4 : 6,
        tension: 0.35, fill: false, spanGaps: true
    }));

    let maxRank = 5;
    for (const c of codes) {
        for (const v of rankByCode[c]) if (v != null && v > maxRank) maxRank = v;
    }

    try {
        wtaBumpChart = new Chart(canvas, {
            type: 'line',
            data: { labels, datasets },
            options: {
                responsive: true, maintainAspectRatio: false,
                interaction: { intersect: false, mode: 'nearest', axis: 'x' },
                plugins: {
                    legend: { position: 'bottom', labels: { usePointStyle: true, padding: isMobile ? 10 : 16, font: { size: isMobile ? 10 : 11, family: "'Poppins', sans-serif" }, boxWidth: isMobile ? 11 : 12 } },
                    tooltip: {
                        backgroundColor: 'rgba(26,29,40,0.9)', titleFont: { size: isMobile ? 12 : 13 }, bodyFont: { size: isMobile ? 11 : 12 }, padding: isMobile ? 8 : 12, cornerRadius: 8,
                        callbacks: {
                            title: items => (items[0] && items[0].label) || '',
                            label: ctx => ctx.raw == null ? `${ctx.dataset.label}: -` : `${ctx.dataset.label}: ${(i18n[currentLang].wtt_rank_suffix || '#{n}').replace('{n}', ctx.raw)}`
                        }
                    }
                },
                scales: {
                    x: { grid: { color: 'rgba(128,128,128,0.1)' }, ticks: { font: { size: isMobile ? 10 : 11 }, maxRotation: isMobile ? 45 : 0, autoSkip: true, maxTicksLimit: isMobile ? 8 : 14 } },
                    y: {
                        reverse: true, min: 1, suggestedMax: maxRank + 1,
                        grid: { color: 'rgba(128,128,128,0.1)' },
                        ticks: { precision: 0, stepSize: maxRank > 16 ? 2 : 1, font: { size: isMobile ? 10 : 11 }, callback: v => '#' + v }
                    }
                }
            }
        });
    } catch (err) { console.error('[WttAssoc] 排名变迁图渲染失败', err); }
}

// ============ ④ 协会对抗矩阵 ============

function wtaComputeH2H() {
    if (wtaH2HCache) return wtaH2HCache;
    const wins = {}, totals = {};
    if (wttScoreLogData && wttScoreLogData.length) {
        for (const r of wttScoreLogData) {
            if (!isMatchRecord(r)) continue;
            const wa = wttGetPlayerAssoc(r['胜者']);
            const la = wttGetPlayerAssoc(r['负者']);
            if (!wa || !la) continue;
            const wc = String(wa.assoc).toUpperCase();
            const lc = String(la.assoc).toUpperCase();
            if (!wc || !lc || wc === lc) continue;
            if (!totals[wc]) totals[wc] = {};
            if (!totals[lc]) totals[lc] = {};
            if (!wins[wc]) wins[wc] = {};
            totals[wc][lc] = (totals[wc][lc] || 0) + 1;
            totals[lc][wc] = (totals[lc][wc] || 0) + 1;
            wins[wc][lc] = (wins[wc][lc] || 0) + 1;
        }
    }
    wtaH2HCache = { wins, totals };
    return wtaH2HCache;
}

function wtaRenderMatrix() {
    const wrap = document.getElementById('wttAssocMatrixWrap');
    if (!wrap) return;
    if (!wttPlayerAssocData || !wttRankingTimeline.length) {
        wrap.innerHTML = `<div class="compare-placeholder"><p>${escapeHtml(i18n[currentLang].wtt_assoc_no_data_hint)}</p></div>`;
        return;
    }

    const latest = wtaComputeListAt(Math.max(0, Math.min(wtaState.snapshotIdx, wttRankingTimeline.length - 1)));
    const n = Math.max(3, Math.min(wtaState.matrixTopN || 10, 25, latest.length));
    const codes = latest.slice(0, n).map(a => a.assoc);
    const nameOf = {};
    latest.forEach(a => { nameOf[a.assoc] = a.country; });

    const { wins, totals } = wtaComputeH2H();
    const tpl = i18n[currentLang].wtt_assoc_matrix_cell || '{a} vs {b}';

    let html = '<table class="wta-matrix"><thead><tr><th></th>';
    html += codes.map(c => `<th title="${escapeHtml(nameOf[c] || c)}">${escapeHtml(c)}</th>`).join('');
    html += '</tr></thead><tbody>';

    for (const rc of codes) {
        html += `<tr><th title="${escapeHtml(nameOf[rc] || rc)}">${wtaFlagSpan(rc, rc)}${escapeHtml(rc)}</th>`;
        for (const cc of codes) {
            if (rc === cc) { html += '<td class="diag">—</td>'; continue; }
            const tot = (totals[rc] && totals[rc][cc]) || 0;
            const w = (wins[rc] && wins[rc][cc]) || 0;
            if (!tot) { html += '<td class="cell-empty">·</td>'; continue; }
            const rate = w / tot;
            const pct = Math.round(rate * 100);
            const alpha = (0.08 + 0.64 * rate).toFixed(3);
            const tip = tpl.replace('{a}', nameOf[rc] || rc).replace('{b}', nameOf[cc] || cc).replace('{r}', pct).replace('{n}', tot);
            html += `<td class="cell-val" style="background:rgba(77,163,255,${alpha});" title="${escapeHtml(tip)}">${pct}%</td>`;
        }
        html += '</tr>';
    }
    html += '</tbody></table>';
    wrap.innerHTML = html;

    const legend = document.getElementById('wttAssocMatrixLegend');
    if (legend) legend.style.display = 'flex';
}

// ============ 总渲染与初始化 ============

function wtaRenderAll() {
    wtaFillSnapshotSelect();
    wtaRenderOverview();
    wtaRenderRankingTable();
    wtaRenderBumpControls();
    wtaRenderBumpChart();
    wtaRenderMatrix();
}

function wtaBindEvents() {
    const sel = document.getElementById('wttAssocSnapshotSelect');
    if (sel) {
        sel.addEventListener('change', () => {
            const v = parseInt(sel.value, 10);
            if (isNaN(v) || v < 0 || v >= wttRankingTimeline.length) return;
            wtaState.snapshotIdx = v;
            wtaState.expandedAssoc = null;
            wtaRenderOverview();
            wtaRenderRankingTable();
            wtaRenderMatrix();
        });
    }

    const topN = document.getElementById('wttAssocTopNInput');
    if (topN) {
        topN.addEventListener('change', () => {
            let v = parseInt(topN.value, 10);
            if (isNaN(v) || v < 5) v = 5;
            if (v > 500) v = 500;
            topN.value = v;
            wtaState.topN = v;
            wtaRenderRankingTable();
        });
    }

    const applyBtn = document.getElementById('wttAssocBumpApply');
    if (applyBtn) {
        applyBtn.addEventListener('click', () => {
            const codes = Array.from(document.querySelectorAll('#wttAssocBumpList input[type="checkbox"]:checked')).map(cb => cb.value);
            if (!codes.length) { alert(i18n[currentLang].wtt_alert_select_assoc || '请至少选择一个协会'); return; }
            if (codes.length > 8) { alert(i18n[currentLang].wtt_alert_max_assoc || '最多选择8个协会'); return; }
            wtaState.bumpCodes = codes;
            wtaRenderBumpChart();
        });
    }

    const bumpCount = document.getElementById('wttAssocBumpCount');
    if (bumpCount) {
        bumpCount.addEventListener('change', () => {
            let v = parseInt(bumpCount.value, 10);
            if (isNaN(v) || v < 2) v = 2;
            if (v > 500) v = 500;
            if (wttRankingTimeline.length) v = Math.min(v, wttRankingTimeline.length);
            bumpCount.value = v;
            wtaState.bumpCount = v;
            wtaRenderBumpChart();
        });
    }

    const matrixTopN = document.getElementById('wttAssocMatrixTopN');
    if (matrixTopN) {
        matrixTopN.addEventListener('change', () => {
            let v = parseInt(matrixTopN.value, 10);
            if (isNaN(v) || v < 3) v = 3;
            if (v > 25) v = 25;
            matrixTopN.value = v;
            wtaState.matrixTopN = v;
            wtaRenderMatrix();
        });
    }

    const tb = document.getElementById('wttAssocRankBody');
    if (tb) {
        tb.addEventListener('click', e => {
            if (e.target.closest('a')) return;  // 球员链接点击不触发展开
            const tr = e.target.closest('tr.main-row');
            if (!tr || !tb.contains(tr)) return;
            wtaToggleDetail(tr.getAttribute('data-assoc'));
        });
    }
}

function initWttAssocPage() {
    if (!document.getElementById('wttAssocRankBody')) return;
    wtaBindEvents();

    // 初始分输入框默认值同步到状态
    const topN = document.getElementById('wttAssocTopNInput');
    if (topN && parseInt(topN.value, 10) >= 5) wtaState.topN = parseInt(topN.value, 10);
    const mc = document.getElementById('wttAssocMatrixTopN');
    if (mc && parseInt(mc.value, 10) >= 3) wtaState.matrixTopN = parseInt(mc.value, 10);
    const bc = document.getElementById('wttAssocBumpCount');
    if (bc && parseInt(bc.value, 10) >= 2) wtaState.bumpCount = parseInt(bc.value, 10);

    wtaLoadData().then(ok => {
        if (!ok || !wttRankingTimeline.length) return;
        wtaState.ready = true;
        wtaState.snapshotIdx = wttRankingTimeline.length - 1;
        if (bc) bc.max = Math.max(2, wttRankingTimeline.length);
        // 变迁图默认选中当前实力榜前六的协会
        const initialList = wtaComputeListAt(wtaState.snapshotIdx);
        if (!wtaState.bumpCodes.length && initialList.length) {
            wtaState.bumpCodes = initialList.slice(0, Math.min(6, initialList.length)).map(a => a.assoc);
        }
        wtaRenderAll();
    });
}

// 语言切换钩子（覆盖 wtt_common.js 中的同名函数）
function wttReapplyI18n() {
    wttUpdatePageCategoryDisplay();
    if (!wtaState.ready) return;
    wtaRenderAll();
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initWttAssocPage);
} else {
    initWttAssocPage();
}
