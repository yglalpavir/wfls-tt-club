/* ========================================
   wtt_personal_stats.js - WTT 个人数据页面
   球员索引页：下拉搜索 + 卡片栅格，点击卡片跳转个人页
   （完整统计渲染复用 wttRenderPersonalStats，见 wtt_player.js）
   ======================================== */

let wttPersonalChartSettings = null;  // 折线图设置（wtt_player.js 个人页使用）

// 注：wttScoreLogData 等共享变量已在 wtt_common.js 中声明（let），无需重复声明

// ============ 数据加载 ============

/**
 * 在加载过程中显示进度提示
 * @param {string} msg - 进度文字
 */
function wttPSShowProgress(msg) {
    wttMountLoading('wttPersonalResult', msg);
}

async function wttLoadRankingDataForPersonal() {
    const containerId = 'wttPersonalResult';
    const setP = (pct, detail, main) => wttSetLoadingProgress(containerId, pct, detail, main);

    wttMountLoading(containerId, i18n[currentLang].wtt_prepare);
    setP(wttLoadPhasePct('download', 0, 1), i18n[currentLang].wtt_prepare);
    await new Promise(r => setTimeout(r, 0));

    try {
        // settings 先行，其余数据文件并行下载（每个文件完成即推进进度条）
        await wttLoadSettingsAndFiles(true, (done, total, label) => {
            setP(wttLoadPhasePct('download', done + 1, total + 1),
                 i18n[currentLang].wtt_downloading.replace('{label}', label).replace('{i}', String(done + 1)).replace('{total}', String(total + 1)).replace('{file}', label));
        });

        // flat1300 模式不需要 initialScoresData
        const isFlat = wttSettings && wttSettings.scoreMode === 'flat1300';
        if (!isFlat && !wttInitialScoresData) throw new Error('WTT initial-scores 加载失败');
        if (!wttEventCoefficients || !wttSeasonsData) throw new Error('WTT数据加载失败');

        // 异步分块计算（带进度回调）
        setP(wttLoadPhasePct('calc', 0, 1), '', i18n[currentLang].wtt_calculating);
        wttRankingTimeline = await wttCalculateAllRankingsAsync((current, total, label, phase) => {
            setP(wttLoadPhasePct(phase || 'calc', current, total),
                 (label ? label + ' · ' : '') + i18n[currentLang].wtt_snapshot.replace('{current}', current).replace('{total}', total));
        });

        // 加载完成，恢复占位文字（随后 initWttPersonalStats 渲染卡片索引；计时器随内容替换自清理）
        const el = document.getElementById(containerId);
        if (el) {
            el.innerHTML = `<div class="compare-placeholder">
                <i class="fa-solid fa-user-chart"></i>
                <p>${i18n[currentLang].wtt_ps_placeholder}</p>
            </div>`;
        }

        return true;
    } catch(e) {
        console.error('WttPersonalStats: 排名计算失败', e);
        wttRankingTimeline = [];
        const el = document.getElementById('wttPersonalResult');
        if (el) {
            el.innerHTML = '<div style="padding:20px;color:var(--accent-red);text-align:center;">❌ ' + i18n[currentLang].wtt_error_fail + '</div>';
        }
        return false;
    }
}

// ============ 辅助函数 ============

function wttGetAllPlayersForPersonal() {
    const playerSet = new Set();

    if (wttRankingTimeline && wttRankingTimeline.length) {
        for (const t of wttRankingTimeline) {
            if (t.data && t.data.length) {
                for (const p of t.data) {
                    if (p['姓名']) playerSet.add(p['姓名']);
                }
            }
        }
    }

    if (wttInitialScoresData && wttInitialScoresData.initialScores) {
        for (const name of Object.keys(wttInitialScoresData.initialScores)) {
            if (name) playerSet.add(name);
        }
    }

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
        console.warn('[WttPersonalStats] wttGetAllPlayers: 未找到任何球员');
    }
    return players;
}

// ============ 球员搜索栏功能 ============

let wttPlayerSearchData = []; // { name, score, rank, matches, wins } 数组，按积分降序

/**
 * 模糊匹配函数（包含匹配 + 字符顺序匹配）
 * @param {string} query - 搜索关键词
 * @param {string} name - 球员名称
 * @returns {{ matched: boolean, score: number, matchType: string }}
 */
function wttFuzzyMatch(query, name) {
    if (!query || !name) return { matched: false, score: 0 };
    const q = query.toLowerCase().trim();
    const n = name.toLowerCase();

    // 子串包含匹配（最高优先级）
    const idx = n.indexOf(q);
    if (idx !== -1) {
        return { matched: true, score: 1000 - idx, matchType: 'substring' };
    }

    // 字符顺序匹配（fuzzy）
    let qi = 0;
    for (let i = 0; i < n.length && qi < q.length; i++) {
        if (n[i] === q[qi]) qi++;
    }
    if (qi === q.length) {
        return { matched: true, score: 500, matchType: 'fuzzy' };
    }

    return { matched: false, score: 0 };
}

/**
 * 构建球员搜索数据缓存（含积分排序）
 */
function wttBuildPlayerSearchData() {
    const players = wttGetAllPlayersForPersonal();

    // 切换到 WTT 全局数据以使用 getSeasonStartScores（异常安全，自动恢复）
    const { scoreMap, rankMap, matchCount, winCount } = wttWithDataContext(() => {
    // 最近一个非空快照：当前积分与排名（不活跃球员使用赛季继承起始积分）
    const scoreMap = {};
    const rankMap = {};
    let cd = [];
    for (let i = wttRankingTimeline.length - 1; i >= 0; i--) {
        if (wttRankingTimeline[i].data && wttRankingTimeline[i].data.length > 0) {
            cd = wttRankingTimeline[i].data;
            break;
        }
    }
    [...cd].sort((a, b) => (b['当前积分'] || 0) - (a['当前积分'] || 0))
        .forEach((p, i) => { scoreMap[p['姓名']] = p['当前积分']; rankMap[p['姓名']] = i + 1; });
    if (seasonsData && seasonsData.length > 0) {
        let currentSeasonIdx = seasonsData.length - 1;
        for (let i = wttRankingTimeline.length - 1; i >= 0; i--) {
            if (wttRankingTimeline[i].season) {
                const s = seasonsData.find(s => s.label === wttRankingTimeline[i].season);
                if (s) { currentSeasonIdx = seasonsData.indexOf(s); break; }
            }
        }
        const startScores = getSeasonStartScores(currentSeasonIdx);
        for (const [name, score] of Object.entries(startScores)) {
            if (!(name in scoreMap)) scoreMap[name] = score;
        }
    }
    if (initialScoresData && initialScoresData.initialScores) {
        for (const [name, score] of Object.entries(initialScoresData.initialScores)) {
            if (!(name in scoreMap)) scoreMap[name] = score;
        }
    }

    // 场次/胜场统计（单次遍历比赛记录）
    const matchCount = {}, winCount = {};
    if (wttScoreLogData && wttScoreLogData.length) {
        for (const r of wttScoreLogData) {
            if (isMatchRecord(r)) {
                if (r['胜者']) { matchCount[r['胜者']] = (matchCount[r['胜者']] || 0) + 1; winCount[r['胜者']] = (winCount[r['胜者']] || 0) + 1; }
                if (r['负者']) matchCount[r['负者']] = (matchCount[r['负者']] || 0) + 1;
            }
        }
    }

    return { scoreMap, rankMap, matchCount, winCount };
    });

    wttPlayerSearchData = [...players]
        .map(name => ({
            name,
            score: scoreMap[name] || 0,
            rank: rankMap[name] ?? '-',
            matches: matchCount[name] || 0,
            wins: winCount[name] || 0
        }))
        .sort((a, b) => b.score - a.score);
}

/**
 * 高亮匹配文本（返回 HTML）
 * @param {string} text - 球员名原文
 * @param {string} query - 搜索关键词
 * @returns {string} 高亮后的 HTML
 */
function wttHighlightMatch(text, query) {
    if (!query || !query.trim()) return text;
    const q = query.toLowerCase().trim();
    const lower = text.toLowerCase();

    // 子串匹配高亮
    const idx = lower.indexOf(q);
    if (idx !== -1) {
        return text.slice(0, idx)
            + '<span class="match-highlight">' + text.slice(idx, idx + q.length) + '</span>'
            + text.slice(idx + q.length);
    }

    // 字符顺序匹配高亮（逐个字符标记）
    let result = '';
    let qi = 0;
    for (let i = 0; i < text.length; i++) {
        if (qi < q.length && lower[i] === q[qi]) {
            result += '<span class="match-highlight">' + text[i] + '</span>';
            qi++;
        } else {
            result += text[i];
        }
    }
    return result;
}

/**
 * 渲染下拉列表
 * @param {Array} filteredPlayers - 过滤后的球员数据
 * @param {string} query - 当前搜索词（用于高亮）
 */
function wttRenderPlayerDropdown(filteredPlayers, query) {
    const list = document.getElementById('wttPersonalPlayerList');
    const dropdown = document.getElementById('wttPersonalPlayerDropdown');
    if (!list) return;

    if (!filteredPlayers || filteredPlayers.length === 0) {
        list.innerHTML = '<div class="player-search-no-results"><i class="fa-solid fa-user-slash"></i>' + i18n[currentLang].wtt_ps_nomatch + '</div>';
        dropdown.classList.add('active');
        return;
    }

    list.innerHTML = filteredPlayers.map((p, i) => {
        const pNameSafe = escapeHtml(String(p.name || ''));
        const displayName = query ? wttHighlightMatch(pNameSafe, query) : pNameSafe;
        return '<button type="button" class="player-search-item' + (i === 0 ? ' highlighted' : '') + '" data-value="' + pNameSafe + '" data-index="' + i + '">'
            + displayName
            + '<span class="player-score">' + Math.round(p.score) + '</span>'
            + '</button>';
    }).join('');

    dropdown.classList.add('active');
}

/**
 * 关闭下拉列表
 */
function wttClosePlayerDropdown() {
    const dropdown = document.getElementById('wttPersonalPlayerDropdown');
    if (dropdown) dropdown.classList.remove('active');
}

/**
 * 选中球员（填入搜索框并过滤卡片栅格）
 * @param {string} playerName
 */
function wttSelectPlayer(playerName) {
    const searchInput = document.getElementById('wttPersonalPlayerSearch');
    if (!searchInput) return;

    searchInput.value = playerName;
    wttClosePlayerDropdown();
    wttRenderPlayerIndex(true);
}

/**
 * 初始化球员搜索组件（替代原来的 wttRenderPersonalPlayerSelect）
 */
function wttInitPersonalPlayerSearch() {
    const container = document.getElementById('wttPersonalPlayerSearchContainer');
    const searchInput = document.getElementById('wttPersonalPlayerSearch');
    const clearBtn = document.getElementById('wttPersonalPlayerSearchClear');
    const dropdown = document.getElementById('wttPersonalPlayerDropdown');
    if (!container || !searchInput || !dropdown) return;

    // 构建球员数据缓存
    wttBuildPlayerSearchData();

    let highlightedIndex = -1;
    let currentFiltered = [];

    /**
     * 执行过滤并更新下拉
     */
    function doFilter() {
        const q = searchInput.value;
        if (!q || !q.trim()) {
            currentFiltered = wttPlayerSearchData;
            highlightedIndex = currentFiltered.length > 0 ? 0 : -1;
            wttRenderPlayerDropdown(currentFiltered, '');
            clearBtn.style.display = 'none';
            return;
        }

        clearBtn.style.display = 'flex';

        // 与卡片栅格共用同一次全量模糊匹配（见 wttFuzzyFilterAll）
        const matches = wttFuzzyFilterAll(q);
        currentFiltered = matches.map(x => ({ name: x.p.name, score: x.p.score, matchScore: x.matchScore, matchType: x.matchType }));
        highlightedIndex = currentFiltered.length > 0 ? 0 : -1;
        wttRenderPlayerDropdown(currentFiltered, q);
    }

    // 输入事件 → 防抖后过滤下拉 + 卡片栅格
    // （全量模糊匹配 + 栅格重建在低性能设备上开销大，逐键触发会明显卡顿）
    let wttSearchDebounce = null;
    searchInput.addEventListener('input', function () {
        clearTimeout(wttSearchDebounce);
        wttSearchDebounce = setTimeout(function () {
            doFilter();
            wttRenderPlayerIndex(true);
        }, 200);
    });

    // 聚焦事件 → 展开下拉
    searchInput.addEventListener('focus', function onFocus() {
        if (!searchInput.value) {
            currentFiltered = wttPlayerSearchData;
            highlightedIndex = currentFiltered.length > 0 ? 0 : -1;
            wttRenderPlayerDropdown(currentFiltered, '');
        } else {
            doFilter();
        }
    });

    // 键盘导航
    searchInput.addEventListener('keydown', function onKeydown(e) {
        const items = dropdown.querySelectorAll('.player-search-item');
        if (!items.length) return;

        if (e.key === 'ArrowDown') {
            e.preventDefault();
            const next = Math.min(highlightedIndex + 1, items.length - 1);
            items.forEach(function (el) { el.classList.remove('highlighted'); });
            items[next].classList.add('highlighted');
            items[next].scrollIntoView({ block: 'nearest' });
            highlightedIndex = next;
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            const prev = Math.max(highlightedIndex - 1, 0);
            items.forEach(function (el) { el.classList.remove('highlighted'); });
            items[prev].classList.add('highlighted');
            items[prev].scrollIntoView({ block: 'nearest' });
            highlightedIndex = prev;
        } else if (e.key === 'Enter') {
            e.preventDefault();
            const highlighted = dropdown.querySelector('.player-search-item.highlighted');
            if (highlighted) {
                wttSelectPlayer(highlighted.dataset.value);
                clearBtn.style.display = 'flex';
            }
        } else if (e.key === 'Escape') {
            wttClosePlayerDropdown();
        }
    });

    // 点击列表项（事件委托）
    dropdown.addEventListener('click', function onDropdownClick(e) {
        var item = e.target.closest('.player-search-item');
        if (item) {
            wttSelectPlayer(item.dataset.value);
            clearBtn.style.display = 'flex';
        }
    });

    // 清除按钮
    clearBtn.addEventListener('click', function onClear() {
        searchInput.value = '';
        clearBtn.style.display = 'none';
        searchInput.focus();
        currentFiltered = wttPlayerSearchData;
        highlightedIndex = currentFiltered.length > 0 ? 0 : -1;
        wttRenderPlayerDropdown(currentFiltered, '');
        wttRenderPlayerIndex(true);
    });

    // 点击外部关闭下拉
    document.addEventListener('click', function onDocClick(e) {
        if (!container.contains(e.target)) {
            wttClosePlayerDropdown();
        }
    });

    console.log('[WttPersonalStats] 球员搜索栏初始化完成，球员数:', wttPlayerSearchData.length);
}

// ============ 球员卡片索引（复刻 personal-stats.js 卡片栅格） ============

const WTT_INDEX_PAGE_SIZE = 200;
let wttIndexShown = WTT_INDEX_PAGE_SIZE;

/**
 * 对全部球员做一次模糊匹配并按（匹配度 → 积分）排序。
 * 搜索下拉与卡片栅格共用同一份结果，避免同一次输入重复全量匹配。
 * @returns [{ p, matchScore, matchType }]
 */
function wttFuzzyFilterAll(q) {
    const matches = [];
    for (const p of wttPlayerSearchData) {
        const m = wttFuzzyMatch(q, p.name);
        if (m.matched) matches.push({ p, matchScore: m.score, matchType: m.matchType });
    }
    matches.sort((a, b) => (b.matchScore - a.matchScore) || (b.p.score - a.p.score));
    return matches;
}

/**
 * 渲染单张球员卡片（协会旗标 + 积分/排名/场次/胜率）
 */
function wttPlayerIndexCardHtml(p) {
    const lang = i18n[currentLang] || i18n.zh;
    const safeName = escapeHtml(String(p.name || ''));
    const assoc = typeof wttGetPlayerAssoc === 'function' ? wttGetPlayerAssoc(p.name) : null;
    let assocHtml = '';
    if (assoc && assoc.assoc) {
        const flagCls = wttAssocFlagClass(assoc.assoc);
        if (flagCls) {
            assocHtml = '<span class="player-index-assoc" title="' + escapeHtml(String(assoc.country || assoc.assoc)) + '"><span class="' + flagCls + '"></span></span>';
        }
    }
    const wr = p.matches > 0 ? Math.round(p.wins / p.matches * 100) + '%' : '0%';
    return `<div class="player-index-card glass-card clickable" data-name="${safeName}">
        <div class="player-index-head">
            <h3 class="player-index-name">${safeName}</h3>
            ${assocHtml}
        </div>
        <div class="player-index-stats">
            <span title="${lang.wtt_ov_current}"><i class="fa-solid fa-gem"></i> ${Math.round(p.score)}</span>
            <span title="${lang.wtt_axis_rank}"><i class="fa-solid fa-medal"></i> ${p.rank === '-' ? '-' : '#' + p.rank}</span>
            <span title="${lang.wtt_ov_total}"><i class="fa-solid fa-table-tennis-paddle-ball"></i> ${p.matches}</span>
            <span title="${lang.wtt_ov_percentile}"><i class="fa-solid fa-bullseye"></i> ${wr}</span>
        </div>
    </div>`;
}

/**
 * 渲染球员卡片栅格（无关键词时按积分降序分页展示，支持"显示更多"）
 * @param {boolean} resetPage - 是否重置分页（新搜索/选中/清除时为 true）
 */
function wttRenderPlayerIndex(resetPage) {
    const container = document.getElementById('wttPersonalResult');
    if (!container || !wttPlayerSearchData.length) return;

    if (resetPage) wttIndexShown = WTT_INDEX_PAGE_SIZE;

    const searchInput = document.getElementById('wttPersonalPlayerSearch');
    const q = (searchInput ? searchInput.value : '').trim();
    const lang = i18n[currentLang] || i18n.zh;

    // 过滤 + 排序（匹配度 → 积分），与下拉搜索共用 wttFuzzyFilterAll 的单次匹配
    let list;
    if (q) {
        list = wttFuzzyFilterAll(q).map(x => x.p);
    } else {
        list = wttPlayerSearchData;
    }

    if (!list.length) {
        container.innerHTML = '<div class="compare-placeholder"><i class="fa-solid fa-user-large-slash"></i><p>' + lang.personal_stats_no_match + '</p></div>';
        return;
    }

    const shown = q ? list : list.slice(0, wttIndexShown);
    const countText = q
        ? lang.personal_stats_player_count.replace('{shown}', shown.length).replace('{total}', wttPlayerSearchData.length)
        : lang.personal_stats_player_count_total.replace('{total}', wttPlayerSearchData.length);

    let html = '<div class="player-index-count">' + countText + '</div>';
    html += '<div class="player-index-grid">' + shown.map(wttPlayerIndexCardHtml).join('') + '</div>';
    if (!q && list.length > shown.length) {
        html += '<div style="text-align:center;margin-top:18px;"><button type="button" class="btn btn-secondary btn-sm" id="wttIndexLoadMore"><i class="fa-solid fa-chevron-down"></i> ' + lang.wtt_ps_load_more + '</button></div>';
    }
    container.innerHTML = html;

    const moreBtn = document.getElementById('wttIndexLoadMore');
    if (moreBtn) {
        moreBtn.addEventListener('click', function () {
            wttIndexShown += WTT_INDEX_PAGE_SIZE;
            wttRenderPlayerIndex(false);
        });
    }

    container.querySelectorAll('.player-index-card.clickable').forEach(function (card) {
        card.addEventListener('click', function () {
            var name = card.getAttribute('data-name');
            if (name) window.location.href = wttPlayerPageUrl(name);
        });
    });
}

// 同一渲染批次内（同一 sortedLog 引用）按 球员|日期|口径 记忆化，
// 避免对手卡片对每位对手重复整赛季重放
const _wttApproxScoreCache = new Map();
function wttGetApproxScoreAtDate(playerName, targetDate, sortedLog, startScores, beforeMatch) {
    const ck = (sortedLog === scoreLogData ? 'cur' : 'x') + '|' + playerName + '|' + targetDate + '|' + (beforeMatch ? 'b' : 'a');
    if (_wttApproxScoreCache.has(ck)) return _wttApproxScoreCache.get(ck);
    const _ret = _wttGetApproxScoreAtDateImpl(playerName, targetDate, sortedLog, startScores, beforeMatch);
    if (_wttApproxScoreCache.size > 8000) _wttApproxScoreCache.clear();
    _wttApproxScoreCache.set(ck, _ret);
    return _ret;
}
function _wttGetApproxScoreAtDateImpl(playerName, targetDate, sortedLog, startScores, beforeMatch) {
    // 找到目标日期所在的赛季，使用赛季继承起始积分
    let effectiveStartScores = { ...startScores };
    let seasonStartDate = '';
    if (seasonsData && seasonsData.length > 0) {
        let seasonIdx = -1;
        for (let si = 0; si < seasonsData.length; si++) {
            if (targetDate >= seasonsData[si].startDate && targetDate <= seasonsData[si].endDate) {
                seasonIdx = si; break;
            }
        }
        if (seasonIdx === -1 && targetDate > seasonsData[seasonsData.length - 1].endDate) {
            seasonIdx = seasonsData.length - 1;
        }
        if (seasonIdx >= 0) {
            effectiveStartScores = getSeasonStartScores(seasonIdx);
            seasonStartDate = seasonsData[seasonIdx].startDate;
        }
    }

    const sc = { ...effectiveStartScores };
    for (const r of sortedLog) {
        // 跳过赛季开始前的记录
        if (seasonStartDate && r['日期'] < seasonStartDate) continue;
        if (beforeMatch ? (r['日期'] >= targetDate) : (r['日期'] > targetDate)) break;
        if (isMatchRecord(r)) {
            const w = r['胜者'], l = r['负者'];
            if (!sc[w]) sc[w] = DEFAULT_INITIAL_SCORE;
            if (!sc[l]) sc[l] = DEFAULT_INITIAL_SCORE;
            const wg = calcMatchPoints(w, l, r['类型'], r['日期'], r['日期'], sc, r['赛制']);
            sc[w] = Math.max(SCORE_FLOOR, sc[w] + wg);
            sc[l] = Math.max(SCORE_FLOOR, sc[l] - wg * LOSER_POINT_MULTIPLIER);
        } else if (isBonusRecord(r)) {
            const t = r['对象'];
            const b = parseFloat(r['分数']) || 0;
            if (!sc[t]) sc[t] = DEFAULT_INITIAL_SCORE;
            sc[t] = Math.max(SCORE_FLOOR, sc[t] + b);
        }
    }
    return Math.round(sc[playerName] || DEFAULT_INITIAL_SCORE);
}

// ============ 主渲染函数 ============

function wttRenderPersonalStats(playerName, containerId) {
    const container = document.getElementById(containerId || 'wttPersonalResult');
    if (!container) return;

    // 切换到 WTT 全局数据（异常安全，自动恢复）
    wttWithDataContext(() => {

    if (!scoreLogData || !scoreLogData.length) {
        container.innerHTML = '<div class="compare-placeholder"><p>' + i18n[currentLang].wtt_ps_nodata + '</p></div>';
        return;
    }

    const sortedLog = [...scoreLogData].sort((a, b) => a['日期'].localeCompare(b['日期']));
    const allMatches = sortedLog.filter(r => isMatchRecord(r) && (r['胜者'] === playerName || r['负者'] === playerName));
    const totalMatches = allMatches.length;
    const wins = allMatches.filter(r => r['胜者'] === playerName).length;
    const losses = totalMatches - wins;

    const allPlayers = wttGetAllPlayersForPersonal();
    let percentile = 0, maxScore = 0, bestRank = Infinity;
    const scoreHistory = []; // { label, score, rank }
    if (allPlayers.length > 1) {
        let cd = [];
        for (let i = wttRankingTimeline.length - 1; i >= 0; i--) {
            if (wttRankingTimeline[i].data && wttRankingTimeline[i].data.length > 0) {
                cd = wttRankingTimeline[i].data;
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

        // 注意：球员首次参赛前不纳入统计
        const firstAppearance = getWttFirstAppearanceDate();
        const playerFirstDate = firstAppearance[playerName] || '';
        for (const t of wttRankingTimeline) {
            if (!t.data || !t.data.length) continue;
            // 赛季初始积分节点非比赛产生，不进入走势/最高分统计
            if (t.isInitial) continue;
            // 跳过球员首次参赛前的快照
            if (playerFirstDate && t.time && t.time < playerFirstDate) continue;
            const me = t.data.find(p => p['姓名'] === playerName);
            if (!me) continue;
            const score = Math.round(me['当前积分']);
            if (score > maxScore) maxScore = score;
            const sorted = [...t.data].sort((a, b) => b['当前积分'] - a['当前积分']);
            let rank = 1;
            for (let i = 0; i < sorted.length; i++) {
                if (i > 0 && sorted[i]['当前积分'] < sorted[i - 1]['当前积分']) rank = i + 1;
                if (sorted[i]['姓名'] === playerName) break;
            }
            if (!t.isInitial && rank < bestRank) bestRank = rank;
            scoreHistory.push({
                label: t.label || t.time,
                time: t.time,
                score: score,
                rank: rank
            });
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

    let currentCd = [];
    for (let i = wttRankingTimeline.length - 1; i >= 0; i--) {
        if (wttRankingTimeline[i].data && wttRankingTimeline[i].data.length > 0) {
            currentCd = wttRankingTimeline[i].data;
            break;
        }
    }

    const curMine = currentCd.find(p => p['姓名'] === playerName);
    const curScoreDisp = curMine && curMine['当前积分'] != null ? (typeof curMine['当前积分'] === 'number' ? curMine['当前积分'].toFixed(1) : curMine['当前积分']) : '-';

    // 计算对手各项分数（已通过 wttGetApproxScoreAtDate 处理赛季继承）
    for (const opp in oppStats) {
        const s = oppStats[opp];
        if (s.lastWinDate) s.preWinScore = wttGetApproxScoreAtDate(opp, s.lastWinDate, sortedLog, startScores, false);
        s.preMatchScore = wttGetApproxScoreAtDate(opp, s.lastDate, sortedLog, startScores, false);
        const oppCur = currentCd.find(p => p['姓名'] === opp);
        s.curScore = oppCur ? oppCur['当前积分'] : wttGetApproxScoreAtDate(opp, s.lastDate, sortedLog, startScores, false);
    }

    // 使用赛季感知的积分状态来计算对手得分/失分
    const scores = {};
    let currentSeasonIdx = -1;
    if (seasonsData && seasonsData.length > 0 && allMatches.length > 0) {
        const firstMatchDate = allMatches[0]['日期'];
        for (let si = 0; si < seasonsData.length; si++) {
            if (firstMatchDate >= seasonsData[si].startDate && firstMatchDate <= seasonsData[si].endDate) {
                currentSeasonIdx = si; break;
            }
        }
        if (currentSeasonIdx === -1 && firstMatchDate > seasonsData[seasonsData.length - 1].endDate) {
            currentSeasonIdx = seasonsData.length - 1;
        }
        if (currentSeasonIdx >= 0) {
            const inheritedScores = getSeasonStartScores(currentSeasonIdx);
            Object.assign(scores, inheritedScores);
        }
    }
    if (Object.keys(scores).length === 0) {
        Object.assign(scores, startScores);
    }

    const oppPointsGained = {};
    const oppPointsLost = {};
    for (const r of sortedLog) {
        // 检查是否跨越赛季边界，应用50%继承
        if (seasonsData && seasonsData.length > 0 && currentSeasonIdx >= 0) {
            const nextSeasonIdx = currentSeasonIdx + 1;
            if (nextSeasonIdx < seasonsData.length && r['日期'] >= seasonsData[nextSeasonIdx].startDate) {
                const seasonEnd = seasonsData[currentSeasonIdx].endDate;
                const endScores = calculateEndScores(sortedLog, getSeasonStartScores(currentSeasonIdx), seasonsData[currentSeasonIdx].startDate, seasonEnd);
                const inherited = {};
                const ss = getSeasonStartScores(currentSeasonIdx);
                for (const n in ss) { const es = endScores[n] || ss[n]; inherited[n] = ss[n] + (es - ss[n]) * 0.5; }
                for (const n in initialScoresData.initialScores) { if (!inherited[n]) inherited[n] = initialScoresData.initialScores[n]; }
                for (const n in scores) { scores[n] = inherited[n] || scores[n]; }
                for (const n in inherited) { if (!(n in scores)) scores[n] = inherited[n]; }
                currentSeasonIdx = nextSeasonIdx;
            }
        }

        if (!isMatchRecord(r)) {
            if (isBonusRecord(r)) {
                const t = r['对象'];
                const b = parseFloat(r['分数']) || 0;
                if (!scores[t]) scores[t] = DEFAULT_INITIAL_SCORE;
                scores[t] = Math.max(SCORE_FLOOR, scores[t] + b);
            }
            continue;
        }
        const w = r['胜者'], l = r['负者'];
        if (!scores[w]) scores[w] = DEFAULT_INITIAL_SCORE;
        if (!scores[l]) scores[l] = DEFAULT_INITIAL_SCORE;
        const wg = calcMatchPoints(w, l, r['类型'], r['日期'], r['日期'], scores, r['赛制']);
        if (w === playerName) {
            oppPointsGained[l] = (oppPointsGained[l] || 0) + wg;
            oppPointsLost[l] = (oppPointsLost[l] || 0) + wg * LOSER_POINT_MULTIPLIER;
        } else if (l === playerName) {
            oppPointsLost[w] = (oppPointsLost[w] || 0) + wg;
            oppPointsGained[w] = (oppPointsGained[w] || 0) + wg * LOSER_POINT_MULTIPLIER;
        }
        scores[w] = Math.max(SCORE_FLOOR, scores[w] + wg);
        scores[l] = Math.max(SCORE_FLOOR, scores[l] - wg * LOSER_POINT_MULTIPLIER);
    }

    const beatenOpps = Object.entries(oppStats)
        .filter(([_, s]) => s.wins > 0)
        .sort((a, b) => b[1].preWinScore - a[1].preWinScore)
        .slice(0, 3);

    const frequentOpps = Object.entries(oppStats)
        .sort((a, b) => b[1].preMatchScore - a[1].preMatchScore)
        .slice(0, 3);

    // 福星：胜率最高的对手（玩家对其战绩最好）
    const luckyStars = Object.entries(oppStats)
        .map(([name, s]) => {
            const total = s.wins + s.losses;
            const wr = total > 0 ? s.wins / total : 0;
            return { name, wins: s.wins, losses: s.losses, curScore: s.curScore, winRate: wr, total };
        })
        .filter(x => x.total > 0 && x.wins > 0)
        .sort((a, b) => b.winRate - a.winRate || b.total - a.total)
        .slice(0, 3);

    // 苦主：胜率最低的对手（玩家对其战绩最差）
    const nemeses = Object.entries(oppStats)
        .map(([name, s]) => {
            const total = s.wins + s.losses;
            const wr = total > 0 ? s.wins / total : 0;
            return { name, wins: s.wins, losses: s.losses, curScore: s.curScore, winRate: wr, total };
        })
        .filter(x => x.total > 0 && x.losses > 0)
        .sort((a, b) => a.winRate - b.winRate || b.total - a.total)
        .slice(0, 3);

    function fmtDate(ds) {
        const d = new Date(ds + 'T00:00:00');
        if (currentLang === 'en') {
            return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
        }
        return d.getFullYear() + '年' + (d.getMonth() + 1) + '月' + d.getDate() + '日';
    }

    let html = '';
    html += '<div class="personal-overview">';
    html += '<div class="personal-overview-item"><span class="personal-overview-num">' + totalMatches + '</span><span class="personal-overview-label">' + i18n[currentLang].wtt_ov_total + '</span></div>';
    html += '<div class="personal-overview-item win"><span class="personal-overview-num">' + wins + '</span><span class="personal-overview-label">' + i18n[currentLang].wtt_ov_wins + '</span></div>';
    html += '<div class="personal-overview-item loss"><span class="personal-overview-num">' + losses + '</span><span class="personal-overview-label">' + i18n[currentLang].wtt_ov_losses + '</span></div>';
    html += '<div class="personal-overview-item"><span class="personal-overview-num">' + (totalMatches > 0 ? Math.round(wins / totalMatches * 100) : 0) + '%</span><span class="personal-overview-label">' + i18n[currentLang].wtt_ov_percentile + '</span></div>';
    html += '<div class="personal-overview-item"><span class="personal-overview-num">' + curScoreDisp + '</span><span class="personal-overview-label">' + i18n[currentLang].wtt_ov_current + '</span></div>';
    html += '<div class="personal-overview-item best"><span class="personal-overview-num">' + maxScore + '</span><span class="personal-overview-label">' + i18n[currentLang].wtt_ov_max + '</span></div>';
    html += '<div class="personal-overview-item best"><span class="personal-overview-num">#' + (bestRank === Infinity ? '-' : bestRank) + '</span><span class="personal-overview-label">' + i18n[currentLang].wtt_ov_bestrank + '</span></div>';
    html += '</div>';

    html += '<div class="personal-summary-text">';
    const psSum1 = i18n[currentLang].wtt_ps_sum1
        .replace('{player}', '<strong>' + escapeHtml(playerName) + '</strong>')
        .replace('{total}', '<strong>' + totalMatches + '</strong>')
        .replace('{wins}', '<strong>' + wins + '</strong>')
        .replace('{losses}', '<strong>' + losses + '</strong>');
    html += psSum1;
    html += '<br>';
    html += i18n[currentLang].wtt_ps_sum2.replace('{player}', '<strong>' + escapeHtml(playerName) + '</strong>').replace('{percent}', '<strong>' + (totalMatches > 0 ? Math.round(wins / totalMatches * 100) : 0) + '</strong>');
    html += '</div>';

    // === 积分变化折线图 ===
    const dailyScoreHistory = computeWttDailyScoreHistory(playerName, sortedLog, startScores);

    if (dailyScoreHistory.length > 1 || scoreHistory.length > 1) {
        html += '<div class="personal-chart-section">';
        html += '<div class="personal-chart-header">';
        html += '<span><i class="fa-solid fa-chart-line"></i> ' + i18n[currentLang].wtt_ps_trend + '</span>';
        html += '<div class="personal-chart-granularity">';
        html += '<button class="granularity-btn active" data-gran="day">' + i18n[currentLang].wtt_ps_day + '</button>';
        html += '<button class="granularity-btn" data-gran="week">' + i18n[currentLang].wtt_ps_week + '</button>';
        html += '<button class="granularity-btn" data-gran="snapshot">' + i18n[currentLang].wtt_ps_snapshot + '</button>';
        html += '</div>';
        html += '</div>';
        html += '<div class="personal-chart-wrapper"><canvas id="wttPersonalScoreChart"></canvas></div>';
        html += '</div>';
    }

    html += '<div class="personal-cards-grid">';

    html += '<div class="personal-card victory-card">';
    html += '<div class="personal-card-header"><i class="fa-solid fa-trophy"></i> ' + i18n[currentLang].wtt_victory_card + '</div>';
    if (beatenOpps.length === 0) {
        html += '<div class="personal-card-empty">' + i18n[currentLang].wtt_empty + '</div>';
    } else {
        html += '<div class="personal-card-list">';
        beatenOpps.forEach(([name, s], i) => {
            html += '<div class="personal-card-item">';
            html += '<span class="personal-card-rank">' + (i + 1) + '</span>';
            html += '<span class="personal-card-name">' + escapeHtml(String(name || '')) + '<span class="personal-card-score">(' + escapeHtml(String(s.preWinScore)) + ')</span></span>';
            html += '<span class="personal-card-date">' + fmtDate(s.lastWinDate) + '</span>';
            html += '</div>';
        });
        html += '</div>';
    }
    html += '</div>';

    html += '<div class="personal-card pk-card">';
    html += '<div class="personal-card-header"><i class="fa-solid fa-hand-fist"></i> ' + i18n[currentLang].wtt_pk_card + '</div>';
    if (frequentOpps.length === 0) {
        html += '<div class="personal-card-empty">' + i18n[currentLang].wtt_empty + '</div>';
    } else {
        html += '<div class="personal-card-list">';
        frequentOpps.forEach(([name, s], i) => {
            html += '<div class="personal-card-item">';
            html += '<span class="personal-card-rank">' + (i + 1) + '</span>';
            html += '<span class="personal-card-name">' + escapeHtml(String(name || '')) + '<span class="personal-card-score">(' + escapeHtml(String(s.preMatchScore)) + ')</span></span>';
            html += '<span class="personal-card-date">' + fmtDate(s.lastDate) + '</span>';
            html += '</div>';
        });
        html += '</div>';
    }
    html += '</div>';

    html += '<div class="personal-card lucky-card">';
    html += '<div class="personal-card-header"><i class="fa-solid fa-star"></i> ' + i18n[currentLang].wtt_lucky_card + '</div>';
    if (luckyStars.length === 0) {
        html += '<div class="personal-card-empty">' + i18n[currentLang].wtt_empty + '</div>';
    } else {
        html += '<div class="personal-card-list">';
        luckyStars.forEach((x, i) => {
            const totalGames = x.wins + x.losses;
            const wr = totalGames > 0 ? ((x.wins / totalGames) * 100).toFixed(0) : 0;
            html += '<div class="personal-card-item">';
            html += '<span class="personal-card-rank">' + (i + 1) + '</span>';
            html += '<span class="personal-card-name">' + escapeHtml(String(x.name || '')) + '<span class="personal-card-score">(' + escapeHtml(String(x.curScore)) + ')</span></span>';
            html += '<span class="personal-card-sub">' + i18n[currentLang].wtt_sub_wl.replace('{wins}', x.wins).replace('{losses}', x.losses).replace('{rate}', wr) + '</span>';
            html += '</div>';
        });
        html += '</div>';
    }
    html += '</div>';

    html += '<div class="personal-card nemesis-card">';
    html += '<div class="personal-card-header"><i class="fa-solid fa-skull"></i> ' + i18n[currentLang].wtt_nemesis_card + '</div>';
    if (nemeses.length === 0) {
        html += '<div class="personal-card-empty">' + i18n[currentLang].wtt_empty + '</div>';
    } else {
        html += '<div class="personal-card-list">';
        nemeses.forEach((x, i) => {
            const totalGames = x.wins + x.losses;
            const wr = totalGames > 0 ? ((x.wins / totalGames) * 100).toFixed(0) : 0;
            html += '<div class="personal-card-item">';
            html += '<span class="personal-card-rank">' + (i + 1) + '</span>';
            html += '<span class="personal-card-name">' + escapeHtml(String(x.name || '')) + '<span class="personal-card-score">(' + escapeHtml(String(x.curScore)) + ')</span></span>';
            html += '<span class="personal-card-sub">' + i18n[currentLang].wtt_sub_wl.replace('{wins}', x.wins).replace('{losses}', x.losses).replace('{rate}', wr) + '</span>';
            html += '</div>';
        });
        html += '</div>';
    }
    html += '</div>';

    html += '</div>';
    container.innerHTML = html;

    // 渲染积分变化折线图
    if (dailyScoreHistory.length > 1 || scoreHistory.length > 1) {
        renderWttPersonalScoreChart(dailyScoreHistory, scoreHistory);

        const granularityBtns = container.querySelectorAll('.granularity-btn');
        granularityBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                granularityBtns.forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                renderWttPersonalScoreChart(dailyScoreHistory, scoreHistory);
            });
        });
    }

    });
}

// ============ 积分历史计算 ============

// 本地时区 YYYY-MM-DD（时间戳→日期串必须走本地时区；toISOString 是 UTC，
// 在 UTC+8 会把"本地午夜"标成前一天，导致日线图整体偏移、跨赛季切换晚一天）
function wttLocalDateStr(t) { const d = new Date(t); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }

function computeWttDailyScoreHistory(playerName, sortedLog, startScores) {
    const history = [];
    if (!sortedLog.length) return history;

    let startDate = sortedLog[0]['日期'];
    for (const r of sortedLog) {
        if ((isMatchRecord(r) && (r['胜者'] === playerName || r['负者'] === playerName)) ||
            (isBonusRecord(r) && r['对象'] === playerName)) {
            startDate = r['日期'];
            break;
        }
    }
    const now = new Date();
    const today = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0') + '-' + String(now.getDate()).padStart(2, '0');

    // 预建时间衰减查找表
    const DECAY_LUT_MAX = 3000;
    const decayLUT = new Float64Array(DECAY_LUT_MAX);
    for (let i = 0; i < DECAY_LUT_MAX; i++) decayLUT[i] = Math.pow(2, -i / HALF_LIFE_DAYS);
    const getDecay = (dayDiff) => dayDiff < DECAY_LUT_MAX ? decayLUT[dayDiff] : Math.pow(2, -dayDiff / HALF_LIFE_DAYS);

    const matchRecs = [];
    const bonusRecs = [];
    for (const r of sortedLog) {
        const time = new Date(r['日期'] + 'T00:00:00').getTime();
        if (isMatchRecord(r)) matchRecs.push({ time, date: r['日期'], winner: r['胜者'], loser: r['负者'], type: r['类型'] });
        else if (isBonusRecord(r)) bonusRecs.push({ time, date: r['日期'], target: r['对象'], amount: parseFloat(r['分数']) || 0 });
    }

    // 预计算每个赛季的继承起始积分
    const seasonStartScoresMap = [];
    if (seasonsData && seasonsData.length > 0) {
        for (let si = 0; si < seasonsData.length; si++) seasonStartScoresMap.push(getSeasonStartScores(si));
    }

    function seasonOf(dateStr) {
        if (seasonsData && seasonsData.length > 0) {
            for (let si = 0; si < seasonsData.length; si++) {
                const s = seasonsData[si];
                if (dateStr >= s.startDate && dateStr <= s.endDate) return si;
            }
            if (dateStr > seasonsData[seasonsData.length - 1].endDate) return seasonsData.length - 1;
            return -1;
        }
        return -1;
    }

    // 🔥 性能重写：
    // 旧实现从球员首秀日起逐日"克隆千人大对象 + 全量重放所有比赛"，O(天数 × 记录数)，
    // 对 ms 类目（2002 年起）约等于上亿次迭代，页面明显卡顿。
    // 现在：从首秀日起逐日推进，比赛/加分指针单调前进、赛季指针单调切换
    // （跨赛季时按该赛季继承积分重置后快进），O(天数 + 记录数)，展示完整历史。
    const endTime = new Date(today + 'T00:00:00').getTime();
    const startTime = new Date(startDate + 'T00:00:00').getTime();
    const winStartTime = startTime;   // 从首秀日起完整渲染（按日/按周）

    let curTime = winStartTime;
    let curDateStr = wttLocalDateStr(curTime);
    let seasonIdx = seasonOf(curDateStr);
    let seasonStartDate = seasonIdx >= 0 ? seasonsData[seasonIdx].startDate : startDate;
    let sc = (seasonIdx >= 0 && seasonStartScoresMap[seasonIdx]) ? { ...seasonStartScoresMap[seasonIdx] } : { ...startScores };
    let mi = 0, bi = 0;

    function applyEventsUpTo(snapTime) {
        while (mi < matchRecs.length && matchRecs[mi].time <= snapTime) {
            const m = matchRecs[mi];
            if (!(seasonIdx >= 0 && m.date < seasonStartDate)) {
                const w = m.winner, l = m.loser;
                if (sc[w] === undefined) sc[w] = DEFAULT_INITIAL_SCORE;
                if (sc[l] === undefined) sc[l] = DEFAULT_INITIAL_SCORE;
                const dayDiff = Math.floor((snapTime - m.time) / 86400000);
                const tw = SCORE_TIME_DECAY_ENABLED ? getDecay(dayDiff) : 1;
                const base = getBaseScore((sc[w] || DEFAULT_INITIAL_SCORE) - (sc[l] || DEFAULT_INITIAL_SCORE));
                const coeff = getEventCoefficient(m.type);
                const wg = base * coeff * tw;
                sc[w] = Math.max(SCORE_FLOOR, sc[w] + wg);
                sc[l] = Math.max(SCORE_FLOOR, sc[l] - wg * LOSER_POINT_MULTIPLIER);
            }
            mi++;
        }
        while (bi < bonusRecs.length && bonusRecs[bi].time <= snapTime) {
            const b = bonusRecs[bi];
            if (!(seasonIdx >= 0 && b.date < seasonStartDate)) {
                if (sc[b.target] === undefined) sc[b.target] = DEFAULT_INITIAL_SCORE;
                sc[b.target] = Math.max(SCORE_FLOOR, sc[b.target] + b.amount);
            }
            bi++;
        }
    }

    while (curTime <= endTime) {
        curDateStr = wttLocalDateStr(curTime);
        // 跨赛季：重置为该赛季继承积分，并跳过赛季开始前的事件
        const si = seasonOf(curDateStr);
        if (si !== seasonIdx) {
            seasonIdx = si;
            seasonStartDate = si >= 0 ? seasonsData[si].startDate : startDate;
            sc = (si >= 0 && seasonStartScoresMap[si]) ? { ...seasonStartScoresMap[si] } : { ...startScores };
            const sStartTime = new Date(seasonStartDate + 'T00:00:00').getTime();
            while (mi < matchRecs.length && matchRecs[mi].time < sStartTime) mi++;
            while (bi < bonusRecs.length && bonusRecs[bi].time < sStartTime) bi++;
        }
        applyEventsUpTo(curTime);

        history.push({
            time: curDateStr,
            label: formatWttDateShort(curDateStr),
            score: Math.round((sc[playerName] || DEFAULT_INITIAL_SCORE) * 10) / 10
        });
        curTime += 86400000;
    }

    return history;
}

function aggregateWttWeekly(dailyHistory) {
    if (!dailyHistory.length) return [];
    const weekly = [];
    let currentWeek = null;
    let lastOfWeek = null;

    for (const entry of dailyHistory) {
        const d = new Date(entry.time + 'T00:00:00');
        const day = d.getDay();
        const monday = new Date(d);
        monday.setDate(d.getDate() - (day === 0 ? 6 : day - 1));
        const weekKey = monday.getFullYear() + '-' + String(monday.getMonth() + 1).padStart(2, '0') + '-' + String(monday.getDate()).padStart(2, '0');

        if (weekKey !== currentWeek) {
            if (lastOfWeek) weekly.push(lastOfWeek);
            currentWeek = weekKey;
        }
        lastOfWeek = {
            time: entry.time,
            label: entry.label,
            score: entry.score,
            weekLabel: formatWttWeekLabel(entry.time)
        };
    }
    if (lastOfWeek) weekly.push(lastOfWeek);
    return weekly;
}

function formatWttDateShort(ds) {
    const d = new Date(ds + 'T00:00:00');
    return (d.getMonth() + 1) + '/' + d.getDate();
}

function formatWttWeekLabel(ds) {
    const d = new Date(ds + 'T00:00:00');
    const day = d.getDay();
    const monday = new Date(d);
    monday.setDate(d.getDate() - (day === 0 ? 6 : day - 1));
    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);
    return (monday.getMonth() + 1) + '/' + monday.getDate() + '-' + (sunday.getMonth() + 1) + '/' + sunday.getDate();
}

// ============ 折线图渲染 ============

function renderWttPersonalScoreChart(dailyHistory, snapshotHistory) {
    const canvas = document.getElementById('wttPersonalScoreChart');
    if (!canvas) return;

    const activeBtn = document.querySelector('.granularity-btn.active');
    const granularity = activeBtn ? activeBtn.getAttribute('data-gran') : 'day';

    let dataPoints;
    if (granularity === 'day') {
        dataPoints = dailyHistory;
    } else if (granularity === 'week') {
        dataPoints = aggregateWttWeekly(dailyHistory);
    } else {
        dataPoints = snapshotHistory;
    }

    if (!dataPoints || dataPoints.length < 2) return;

    const existingChart = Chart.getChart(canvas);
    if (existingChart) existingChart.destroy();

    const isDark = (typeof isDarkTheme === 'function' ? isDarkTheme() : false);
    const gridColor = isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)';
    const textColor = isDark ? '#aeb4c2' : '#4a5568';

    const labels = dataPoints.map(s => {
        if (granularity === 'week' && s.weekLabel) return s.weekLabel;
        return s.label || s.time;
    });
    const scores = dataPoints.map(s => s.score);

    const dataLen = dataPoints.length;
    const s = wttPersonalChartSettings;
    const cfg = (s && s[granularity]) ? s[granularity] : {};
    const colors = (s && s.colors) ? s.colors : {};

    const tension = cfg.tension != null ? cfg.tension : 0.1;

    const denseThreshold = cfg.denseThreshold || Infinity;
    const pointRadius = dataLen > denseThreshold
        ? (cfg.pointRadiusDense != null ? cfg.pointRadiusDense : 0)
        : (cfg.pointRadius != null ? cfg.pointRadius : 3);
    const pointHoverExtra = cfg.pointHoverExtra != null ? cfg.pointHoverExtra : 3;

    const borderWidth = dataLen > denseThreshold
        ? (cfg.borderWidthDense != null ? cfg.borderWidthDense : (cfg.borderWidth || 2))
        : (cfg.borderWidth != null ? cfg.borderWidth : 2);

    const largeThreshold = cfg.largeThreshold || Infinity;
    const maxTicksLimit = dataLen > largeThreshold
        ? (cfg.maxTicksLarge != null ? cfg.maxTicksLarge : (cfg.maxTicks || 15))
        : (cfg.maxTicks != null ? cfg.maxTicks : 15);

    const lineColor = colors.line || '#4da3ff';
    const fillColor = isDark ? (colors.fillDark || 'rgba(77, 163, 255, 0.1)') : (colors.fillLight || 'rgba(0, 123, 255, 0.08)');
    const ptBorderColor = colors.pointBorder || lineColor;
    const ptBorderWidth = colors.pointBorderWidth != null ? colors.pointBorderWidth : 0;

    // === 构建赛季边界虚线标注 ===
    const seasonBoundaries = [];
    if (seasonsData && seasonsData.length > 1) {
        for (let i = 0; i < seasonsData.length - 1; i++) {
            const boundaryDate = seasonsData[i].endDate;
            let idx = -1;
            for (let j = 0; j < dataPoints.length; j++) {
                if (dataPoints[j].time <= boundaryDate) idx = j;
                else break;
            }
            if (idx >= 0 && idx < dataPoints.length - 1) {
                seasonBoundaries.push({
                    idx: idx,
                    label: seasonsData[i + 1].label
                });
            }
        }
    }

    new Chart(canvas, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [{
                label: i18n[currentLang].wtt_axis_points,
                data: scores,
                borderColor: lineColor,
                backgroundColor: fillColor,
                borderWidth: borderWidth,
                pointBackgroundColor: lineColor,
                pointBorderColor: ptBorderColor,
                pointBorderWidth: ptBorderWidth,
                pointRadius: pointRadius,
                pointHoverRadius: pointRadius + pointHoverExtra,
                tension: tension,
                fill: true
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: {
                intersect: false,
                mode: 'index'
            },
            plugins: {
                legend: { display: false },
                tooltip: {
                    backgroundColor: isDark ? '#2a2e3d' : '#fff',
                    titleColor: isDark ? '#e4e6ed' : '#1a1a2e',
                    bodyColor: isDark ? '#aeb4c2' : '#4a5568',
                    borderColor: isDark ? 'rgba(255,255,255,0.12)' : '#e2e8f0',
                    borderWidth: 1,
                    padding: 12,
                    displayColors: false,
                    callbacks: {
                        title: function(items) {
                            const idx = items[0].dataIndex;
                            const dp = dataPoints[idx];
                            if (granularity === 'week' && dp.weekLabel) return dp.weekLabel;
                            return dp.label || dp.time;
                        },
                        label: function(item) {
                            const idx = item.dataIndex;
                            const dp = dataPoints[idx];
                            let txt = i18n[currentLang].wtt_tooltip_points.replace('{score}', dp.score);
                            if (dp.rank) txt += ' ' + i18n[currentLang].wtt_tooltip_rank.replace('{rank}', dp.rank);
                            return txt;
                        }
                    }
                }
            },
            scales: {
                x: {
                    grid: { color: gridColor },
                    ticks: { color: textColor, font: { size: 10 }, maxRotation: granularity === 'day' ? 60 : 45, autoSkip: true, maxTicksLimit: maxTicksLimit }
                },
                y: {
                    grid: { color: gridColor },
                    ticks: { color: textColor, font: { size: 11 } },
                    beginAtZero: false
                }
            }
        },
        plugins: [{
            id: 'seasonBoundaries',
            afterDraw: function(chart) {
                if (!seasonBoundaries.length) return;
                const ctx = chart.ctx;
                const meta = chart.getDatasetMeta(0);
                const chartArea = chart.chartArea;
                const topY = chartArea.top;
                const bottomY = chartArea.bottom;

                ctx.save();
                for (const b of seasonBoundaries) {
                    const point = meta.data[b.idx];
                    if (!point) continue;
                    const x = point.x;
                    if (x < chartArea.left || x > chartArea.right) continue;

                    ctx.beginPath();
                    ctx.setLineDash([6, 4]);
                    ctx.strokeStyle = isDark ? 'rgba(200,200,200,0.45)' : 'rgba(100,100,100,0.4)';
                    ctx.lineWidth = 1;
                    ctx.moveTo(x, topY);
                    ctx.lineTo(x, bottomY);
                    ctx.stroke();

                    ctx.setLineDash([]);
                    ctx.fillStyle = isDark ? 'rgba(200,200,200,0.7)' : 'rgba(80,80,80,0.7)';
                    ctx.font = '10px "Poppins", "Microsoft YaHei", sans-serif';
                    ctx.textAlign = 'center';
                    ctx.fillText(b.label, x, topY + 12);
                }
                ctx.restore();
            }
        }]
    });
}

// ============ 折线图设置加载 ============

async function loadWttPersonalChartSettings() {
    try {
        const resp = await fetch('data/personal-stats-chart-settings.json');
        if (!resp.ok) throw new Error('HTTP ' + resp.status);
        wttPersonalChartSettings = await resp.json();
        console.log('[WttPersonalStats] 折线图设置加载完成');
    } catch (e) {
        console.warn('[WttPersonalStats] 折线图设置加载失败，使用默认值', e);
        wttPersonalChartSettings = null;
    }
}

// ============ 初始化 ============

function initWttPersonalStats() {
    console.log('[WttPersonalStats] 开始初始化，wttRankingTimeline 长度:', wttRankingTimeline.length);

    if (!document.getElementById('wttPersonalPlayerSearchContainer')) {
        console.warn('[WttPersonalStats] 页面上找不到 wttPersonalPlayerSearchContainer 元素');
        return;
    }

    if (!wttRankingTimeline || wttRankingTimeline.length === 0) {
        console.error('[WttPersonalStats] wttRankingTimeline 为空');
        return;
    }

    // 初始化搜索组件并渲染球员卡片索引
    wttInitPersonalPlayerSearch();
    wttRenderPlayerIndex(true);

    console.log('[WttPersonalStats] 初始化完成');
}

// 语言切换时重渲染个人数据界面（覆盖 wtt_common.js 中的同名函数）
function wttReapplyI18n() {
    wttUpdatePageCategoryDisplay();
    const searchInput = document.getElementById('wttPersonalPlayerSearch');
    if (searchInput) searchInput.placeholder = i18n[currentLang].wtt_ps_search_ph;
    if (document.getElementById('wttPersonalResult') && wttPlayerSearchData.length) {
        wttRenderPlayerIndex(false);
    }
}
