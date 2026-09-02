/* ========================================
   wtt_player.js - WTT 球员个人主页（一人一页）
   入口: wtt_player.html?cat=ms&uid=ms-xxx 或 ?cat=ms&player=名字
   复刻 player-page.js，使用 WTT 系列数据
   ======================================== */

let wttCurrentPlayer = null;      // 当前球员名（语言切换时重渲染用）
let wttPpOrderedPlayers = [];     // 按当前积分降序的球员列表（上/下一名导航）

// ============ 数据加载 ============

function wttPpShowProgress(msg) {
    wttMountLoading('wttPlayerDetailContent', msg);
}

async function wttLoadRankingDataForPlayer() {
    const containerId = 'wttPlayerDetailContent';
    const setP = (pct, detail, main) => wttSetLoadingProgress(containerId, pct, detail, main);

    wttPpShowProgress(i18n[currentLang].wtt_prepare);
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

        return true;
    } catch (e) {
        console.error('WttPlayerPage: 排名计算失败', e);
        wttRankingTimeline = [];
        const el = document.getElementById('wttPlayerDetailContent');
        if (el) {
            el.innerHTML = '<div style="padding:20px;color:var(--accent-red);text-align:center;">❌ ' + i18n[currentLang].wtt_error_fail + '</div>';
        }
        return false;
    }
}

// ============ 辅助函数 ============

// 最近一个有数据的快照中的球员行
function wttPpLatestSnapshotRow(playerName) {
    for (let i = wttRankingTimeline.length - 1; i >= 0; i--) {
        const t = wttRankingTimeline[i];
        if (t && t.data && t.data.length) {
            const row = t.data.find(p => p['姓名'] === playerName);
            if (row) return { row: row, label: getNodeDisplayLabel(t), time: t.time };
        }
    }
    return null;
}

// 最近快照中的当前排名
function wttPpCurrentRank(playerName) {
    for (let i = wttRankingTimeline.length - 1; i >= 0; i--) {
        const t = wttRankingTimeline[i];
        if (t && t.data && t.data.length) {
            const sorted = [...t.data].sort((a, b) => (b['当前积分'] || 0) - (a['当前积分'] || 0));
            const idx = sorted.findIndex(p => p['姓名'] === playerName);
            if (idx >= 0) return idx + 1;
        }
    }
    return null;
}

// 按当前积分降序排列全部球员，供上一位/下一位导航
function wttPpBuildOrderedList() {
    const scoreMap = {};
    for (let i = wttRankingTimeline.length - 1; i >= 0; i--) {
        const t = wttRankingTimeline[i];
        if (t && t.data && t.data.length) {
            for (const p of t.data) scoreMap[p['姓名']] = p['当前积分'];
            break;
        }
    }
    const names = wttCollectWttPlayerNames();
    return [...names].sort((a, b) => ((scoreMap[b] == null ? -1 : scoreMap[b]) - (scoreMap[a] == null ? -1 : scoreMap[a])) || String(a).localeCompare(String(b), 'zh'));
}

// ============ 渲染 ============

function wttPpRenderNavSwitch(playerName) {
    const container = document.getElementById('wttPlayerNavSwitch');
    if (!container) return;
    const ordered = wttPpOrderedPlayers;
    const idx = ordered.indexOf(playerName);
    const prev = idx > 0 ? ordered[idx - 1] : null;
    const next = idx >= 0 && idx < ordered.length - 1 ? ordered[idx + 1] : null;
    let html = '';
    if (prev) html += `<a class="btn btn-sm player-nav-btn" href="${wttPlayerPageUrl(prev)}" title="${escapeHtml(String(prev))}"><i class="fa-solid fa-chevron-left"></i> ${i18n[currentLang].pp_prev_player}</a>`;
    html += `<span class="player-nav-count">${idx >= 0 ? idx + 1 : '-'} / ${ordered.length}</span>`;
    if (next) html += `<a class="btn btn-sm player-nav-btn" href="${wttPlayerPageUrl(next)}" title="${escapeHtml(String(next))}">${i18n[currentLang].pp_next_player} <i class="fa-solid fa-chevron-right"></i></a>`;
    container.innerHTML = html;
}

function wttPpRenderHeader(playerName) {
    const snap = wttPpLatestSnapshotRow(playerName);
    const rank = wttPpCurrentRank(playerName);
    const row = snap ? snap.row : null;
    const curScore = row && row['当前积分'] != null ? (typeof row['当前积分'] === 'number' ? row['当前积分'].toFixed(1) : row['当前积分']) : '-';
    const info = wttGetCategoryInfo();
    const assoc = wttGetPlayerAssoc(playerName);

    const header = document.createElement('div');
    header.className = 'player-profile glass-card';
    header.innerHTML = `
        <div class="player-profile-info">
            <div class="player-profile-title">
                <h2>${escapeHtml(String(playerName))}</h2>
                <span class="player-index-uid" style="color:${info.color};border-color:${info.color};">
                    <i class="fa-solid fa-tag"></i> ${escapeHtml(wttGetCategoryDisplayName())}
                </span>
            </div>
            <div class="player-profile-meta">
                <span class="player-score-chip"><i class="fa-solid fa-gem"></i> ${i18n[currentLang].rank_col_points} ${curScore}</span>
                <span class="player-score-chip"><i class="fa-solid fa-medal"></i> ${rank ? '#' + rank : '-'}</span>
                ${assoc ? `<span class="player-score-chip" title="${escapeHtml(i18n[currentLang].wtt_pp_assoc)}"><i class="fa-solid fa-earth-asia"></i> ${escapeHtml(assoc.assoc)}${assoc.country ? ' · ' + escapeHtml(assoc.country) : ''}</span>` : ''}
                ${snap ? `<span class="player-score-chip"><i class="fa-solid fa-clock"></i> ${escapeHtml(String(snap.label))}</span>` : ''}
            </div>
        </div>
    `;
    document.getElementById('wttPlayerDetailContent').appendChild(header);
}

// 计算球员全部比赛记录（逐赛季回放，含赛季继承），返回按日期倒序 rows
function wttPpComputeMatchRecords(playerName) {
    return wttWithDataContext(() => {
        const sortedLog = [...wttScoreLogData].sort((a, b) => a['日期'].localeCompare(b['日期']));
        const rows = [];
        const seasons = (wttSeasonsData && wttSeasonsData.length) ? wttSeasonsData : [];
        for (let si = 0; si < seasons.length; si++) {
            const season = seasons[si];
            const startScores = getSeasonStartScores(si);
            const scores = { ...startScores };
            const windowLog = sortedLog.filter(r => r['日期'] >= season.startDate && r['日期'] <= season.endDate);
            for (const r of windowLog) {
                if (isBonusRecord(r)) {
                    const t = r['对象'], b = parseFloat(r['分数']) || 0;
                    if (!scores[t]) scores[t] = DEFAULT_INITIAL_SCORE;
                    if (t === playerName) {
                        rows.push({ date: r['日期'], type: i18n[currentLang].score_type_bonus, opp: '-', isWin: true, isBonus: true, pre: scores[t], change: b, post: scores[t] + b });
                    }
                    scores[t] = Math.max(SCORE_FLOOR, scores[t] + b);
                } else if (isMatchRecord(r)) {
                    const w = r['胜者'], l = r['负者'];
                    if (!scores[w]) scores[w] = DEFAULT_INITIAL_SCORE;
                    if (!scores[l]) scores[l] = DEFAULT_INITIAL_SCORE;
                    const wg = calcMatchPoints(w, l, r['类型'], r['日期'], r['日期'], scores, r['赛制']);
                    const rawGain = calcRawPoints(w, l, r['类型'], scores, r['赛制']);
                    if (w === playerName || l === playerName) {
                        const isWin = w === playerName;
                        const pre = scores[playerName];
                        const rawChange = isWin ? rawGain : -rawGain * LOSER_POINT_MULTIPLIER;
                        const change = isWin ? wg : -wg * LOSER_POINT_MULTIPLIER;
                        rows.push({ date: r['日期'], type: r['类型'], opp: isWin ? l : w, isWin: isWin, isBonus: false, pre: pre, rawChange: rawChange, change: change, post: pre + change });
                    }
                    scores[w] = Math.max(SCORE_FLOOR, scores[w] + wg);
                    scores[l] = Math.max(SCORE_FLOOR, scores[l] - wg * LOSER_POINT_MULTIPLIER);
                }
            }
        }
        rows.sort((a, b) => b.date.localeCompare(a.date));
        return rows;
    });
}

function wttPpRenderMatchTable(playerName) {
    const container = document.getElementById('wttPpMatchTable');
    if (!container) return;
    const rows = wttPpComputeMatchRecords(playerName);
    if (!rows.length) { container.innerHTML = ''; return; }

    const rowsHtml = rows.map(r => {
        if (r.isBonus) {
            const cc = r.change >= 0 ? 'score-change-positive' : 'score-change-negative';
            const sign = r.change >= 0 ? '+' : '';
            return `<tr><td>${escapeHtml(r.date)}</td><td>${escapeHtml(r.type)}</td><td>-</td><td class="result-win">${i18n[currentLang].wtt_bonus}</td><td>${r.pre.toFixed(1)}</td><td class="${cc}">${sign}${r.change.toFixed(1)}</td><td>${r.post.toFixed(1)}</td></tr>`;
        }
        const res = r.isWin ? '<td class="result-win">' + i18n[currentLang].score_result_win + '</td>' : '<td class="result-loss">' + i18n[currentLang].score_result_loss + '</td>';
        const signRaw = r.rawChange >= 0 ? '+' : '';
        const cc = r.change >= 0 ? 'score-change-positive' : 'score-change-negative';
        return `<tr><td>${escapeHtml(r.date)}</td><td>${escapeHtml(r.type)}</td><td>${wttLinkPlayerName(r.opp)}</td>${res}<td>${r.pre.toFixed(1)}</td><td class="${cc}">${signRaw}${r.rawChange.toFixed(1)}</td><td>${r.post.toFixed(1)}</td></tr>`;
    }).join('');

    container.innerHTML = `
        <div class="personal-card glass-card match-list-card">
            <div class="personal-card-header"><i class="fa-solid fa-table-list"></i> ${i18n[currentLang].pp_all_records} <span class="tag-match-count">${i18n[currentLang].pp_matches_count.replace('{n}', rows.length)}</span></div>
            <div class="score-detail-table-wrapper" style="max-height:420px;">
                <table class="score-detail-table">
                    <thead><tr><th>${i18n[currentLang].score_col_date}</th><th>${i18n[currentLang].score_col_type}</th><th>${i18n[currentLang].score_col_opponent}</th><th>${i18n[currentLang].score_col_result}</th><th>${i18n[currentLang].pp_col_before}</th><th>${i18n[currentLang].pp_col_change}</th><th>${i18n[currentLang].pp_col_after}</th></tr></thead>
                    <tbody>${rowsHtml}</tbody>
                </table>
            </div>
        </div>`;
}

async function initWttPlayerPage() {
    const content = document.getElementById('wttPlayerDetailContent');
    if (!content) return;
    try {
        await wttLoadRankingDataForPlayer();
        if (!wttRankingTimeline || !wttRankingTimeline.length) return;

        const playerName = wttResolvePlayerParam();
        if (!playerName) {
            content.innerHTML = `<div class="compare-placeholder"><i class="fa-solid fa-user-xmark"></i><p>${i18n[currentLang].wtt_pp_no_player}</p><a href="wtt_personal_stats.html" class="btn btn-sm btn-primary" style="margin-top:14px;">${i18n[currentLang].wtt_pp_back}</a></div>`;
            return;
        }

        // 校验球员存在于当前项目
        wttPpOrderedPlayers = wttPpBuildOrderedList();
        if (wttPpOrderedPlayers.indexOf(playerName) === -1) {
            content.innerHTML = `<div class="compare-placeholder"><i class="fa-solid fa-user-xmark"></i><p>${i18n[currentLang].wtt_pp_no_player} (${escapeHtml(String(playerName))})</p><a href="wtt_personal_stats.html" class="btn btn-sm btn-primary" style="margin-top:14px;">${i18n[currentLang].wtt_pp_back}</a></div>`;
            return;
        }

        wttCurrentPlayer = playerName;
        document.title = playerName + ' · ' + wttGetCategoryDisplayName() + ' | WFLS Table Tennis Club';

        await loadWttPersonalChartSettings();

        content.innerHTML = '';
        wttPpRenderNavSwitch(playerName);
        wttPpRenderHeader(playerName);

        content.innerHTML += '<div id="wttPpStatsBody"></div><div id="wttPpMatchTable"></div>';
        wttRenderPersonalStats(playerName, 'wttPpStatsBody');
        wttPpRenderMatchTable(playerName);
        console.log('[WttPlayerPage] 初始化完成:', playerName);
    } catch (e) {
        console.error('[WttPlayerPage] 初始化失败', e);
        content.innerHTML = `<div class="compare-placeholder"><i class="fa-solid fa-triangle-exclamation"></i><p>${i18n[currentLang].wtt_pp_load_fail}</p><button class="btn btn-sm btn-primary" style="margin-top:14px;" onclick="location.reload()">${i18n[currentLang].wtt_pp_refresh}</button></div>`;
    }
}

// 语言切换时重渲染个人页（覆盖 wtt_common.js 中的同名函数）
function wttReapplyI18n() {
    wttUpdatePageCategoryDisplay();
    if (!wttCurrentPlayer) return;
    const content = document.getElementById('wttPlayerDetailContent');
    if (!content) return;
    const canvas = document.getElementById('wttPersonalScoreChart');
    if (canvas && window.Chart && Chart.getChart) {
        const existing = Chart.getChart(canvas);
        if (existing) existing.destroy();
    }
    document.title = wttCurrentPlayer + ' · ' + wttGetCategoryDisplayName() + ' | WFLS Table Tennis Club';
    content.innerHTML = '';
    wttPpRenderNavSwitch(wttCurrentPlayer);
    wttPpRenderHeader(wttCurrentPlayer);
    content.innerHTML += '<div id="wttPpStatsBody"></div><div id="wttPpMatchTable"></div>';
    wttRenderPersonalStats(wttCurrentPlayer, 'wttPpStatsBody');
    wttPpRenderMatchTable(wttCurrentPlayer);
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initWttPlayerPage);
} else {
    initWttPlayerPage();
}