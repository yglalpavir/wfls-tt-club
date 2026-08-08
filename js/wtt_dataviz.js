/* ========================================
   wtt_dataviz.js - WTT 数据可视化
   复刻 data-viz.js，使用 WTT 系列数据
   ======================================== */

let wttPointsTrendChart = null, wttRankStreamChart = null;
let wttCurrentCompare = null;  // 当前对比的球员对（语言切换时重渲染用）
let wttDataVizSettings = null;  // 折线图设置（从 data/data_viz-settings.json 加载）
const WTT_CHART_COLORS = ['#4da3ff','#ff6b6b','#52c41a','#f5c542','#ff9f43','#a55eea','#26de81','#fd79a8','#45b7d1','#f78fb3','#3dc1d3','#e66767','#778beb','#f5cd79','#cf6a87','#786fa6','#f8a5c2','#63cdda','#ea8685','#596275'];
const WTT_STREAM_COLORS = ['#4da3ff','#52c41a','#ff9f43','#a55eea','#26de81','#ff6b6b','#45b7d1','#f5c542','#778beb','#fd79a8','#3dc1d3','#f78fb3','#63cdda','#e66767','#f5cd79','#cf6a87','#786fa6','#f8a5c2','#ea8685','#596275'];

/**
 * 根据数据点数量从 settings tiers 中匹配最佳参数档位
 */
function wttGetDataVizTier(dataCount) {
    const tiers = (wttDataVizSettings && wttDataVizSettings.tiers) ? wttDataVizSettings.tiers : [
        { maxPoints: 12, tension: 0.35, pointRadius: 5, pointHoverExtra: 4, borderWidth: 2.5 },
        { maxPoints: 24, tension: 0.30, pointRadius: 4, pointHoverExtra: 3, borderWidth: 2.5 },
        { maxPoints: 48, tension: 0.20, pointRadius: 3, pointHoverExtra: 3, borderWidth: 2.2 },
        { maxPoints: 96, tension: 0.12, pointRadius: 2, pointHoverExtra: 2, borderWidth: 2.0 },
        { maxPoints: 200, tension: 0.06, pointRadius: 1, pointHoverExtra: 2, borderWidth: 1.8 },
        { maxPoints: 999, tension: 0.03, pointRadius: 0, pointHoverExtra: 2, borderWidth: 1.5 }
    ];
    for (const t of tiers) {
        if (dataCount <= t.maxPoints) return t;
    }
    return tiers[tiers.length - 1];
}

async function wttLoadDataVizSettings() {
    try {
        wttDataVizSettings = await (await fetch('data/data_viz-settings.json')).json();
        console.log('[WttDataViz] 折线图设置加载完成');
    } catch (e) {
        console.warn('[WttDataViz] 折线图设置加载失败，使用内置默认值', e);
        wttDataVizSettings = null;
    }
}

// ============ WTT 数据加载 ============

/**
 * 在加载过程中显示进度提示
 * @param {string} containerId - 显示加载进度的容器 ID
 * @param {string} msg - 进度文字
 */
function wttVizShowProgress(containerId, msg) {
    const el = document.getElementById(containerId);
    if (!el) return;
    el.innerHTML = `<div style="display:flex;flex-direction:column;align-items:center;justify-content:center;padding:40px 20px;color:var(--text-secondary);">
        <div class="wtt-spinner" style="width:32px;height:32px;border:3px solid var(--border-color);border-top-color:var(--accent-blue);border-radius:50%;animation:wttSpin 0.8s linear infinite;margin-bottom:12px;"></div>
        <p style="font-size:0.9rem;margin:0;">${msg || i18n[currentLang].wtt_loading}</p>
    </div>`;
}

async function wttLoadRankingDataForViz() {
    // 🔥 同时在球员列表和图表区域显示加载进度
    const progressContainer = document.getElementById('wttPlayerCheckboxList');
    const chartContainer = document.querySelector('#wttPointsTrendChart')?.parentElement;

    function showProgress(msg) {
        // 球员列表区域
        if (progressContainer) {
            wttVizShowProgress('wttPlayerCheckboxList', msg);
        }
        // 图表区域也显示（双重保障）
        if (chartContainer && !chartContainer.querySelector('.wtt-loading-overlay')) {
            const overlay = document.createElement('div');
            overlay.className = 'wtt-loading-overlay';
            overlay.innerHTML = `<div style="display:flex;flex-direction:column;align-items:center;justify-content:center;height:100%;min-height:300px;color:var(--text-secondary);">
                <div class="wtt-spinner" style="width:36px;height:36px;border:3px solid var(--border-color);border-top-color:var(--accent-blue);border-radius:50%;animation:wttSpin 0.8s linear infinite;margin-bottom:12px;"></div>
                <p style="font-size:0.95rem;margin:0;" class="wtt-chart-progress-text">${msg || i18n[currentLang].wtt_loading}</p>
            </div>`;
            overlay.style.cssText = 'position:absolute;top:0;left:0;right:0;bottom:0;z-index:10;display:flex;';
            chartContainer.style.position = 'relative';
            chartContainer.appendChild(overlay);
        } else if (chartContainer) {
            const textEl = chartContainer.querySelector('.wtt-chart-progress-text');
            if (textEl) textEl.textContent = msg;
        }
    }

    function hideChartOverlay() {
        if (chartContainer) {
            const overlay = chartContainer.querySelector('.wtt-loading-overlay');
            if (overlay) overlay.remove();
        }
    }

    showProgress(i18n[currentLang].wtt_prepare);
    console.log('[WttDataViz] 开始加载数据...');

    try {
        // 🔥 逐个加载数据文件，显示详细进度
        // 先加载 settings.json 以判断是否需要 initial-scores
        showProgress(i18n[currentLang].wtt_downloading.replace('{label}', 'settings').replace('{i}', '1').replace('{total}', '5').replace('{file}', 'settings.json'));
        await new Promise(r => setTimeout(r, 0));
        await wttLoadSettings();

        // flat1300 模式下跳过 initial-scores 加载
        const needsInitScores = !wttSettings || wttSettings.scoreMode !== 'flat1300';

        const dataFiles = [
            { name: 'score-log (按赛季)',   loader: wttLoadScoreLog,          label: i18n[currentLang].wtt_file_matches },
        ];
        if (needsInitScores) {
            dataFiles.push({ name: 'initial-scores.json', loader: wttLoadInitialScores, label: i18n[currentLang].wtt_file_initial });
        }
        dataFiles.push(
            { name: 'event-coefficient.json',loader: wttLoadEventCoefficients, label: i18n[currentLang].wtt_file_event },
            { name: 'seasons.json',          loader: wttLoadSeasons,           label: i18n[currentLang].wtt_file_season }
        );

        for (let i = 0; i < dataFiles.length; i++) {
            const f = dataFiles[i];
            const total = dataFiles.length;
            showProgress(i18n[currentLang].wtt_downloading.replace('{label}', f.label).replace('{i}', i + 1).replace('{total}', total).replace('{file}', f.name));
            // yield 到浏览器，确保 UI 更新
            await new Promise(r => setTimeout(r, 0));
            await f.loader();
        }

        // flat1300 模式不需要 initialScoresData
        const isFlat = wttSettings && wttSettings.scoreMode === 'flat1300';
        if (!isFlat && !wttInitialScoresData) throw new Error('WTT initial-scores 加载失败');
        if (!wttEventCoefficients || !wttSeasonsData) throw new Error('WTT数据加载失败');

        // 更新进度为计算排名
        showProgress(i18n[currentLang].wtt_calculating);

        // 异步分块计算（带进度回调）
        wttRankingTimeline = await wttCalculateAllRankingsAsync((current, total, label) => {
            showProgress(i18n[currentLang].wtt_snapshot.replace('{current}', current).replace('{total}', total));
        });

        // 加载完成，清理图表区的 loading overlay
        hideChartOverlay();
        return true;
    } catch(e) {
        console.error('WttDataViz: 排名计算失败', e);
        wttRankingTimeline = [];
        hideChartOverlay();
        if (progressContainer) {
            progressContainer.innerHTML = '<div style="padding:20px;color:var(--accent-red);">❌ ' + i18n[currentLang].wtt_error_fail + '</div>';
        }
        return false;
    }
}

// 数据加载由 wtt_common.js 提供（分类目录：wtt_data/{category}/）
// 共享变量（wttScoreLogData 等）由 wtt_common.js 声明

// ============ 初始化 ============

function initWttDataViz() {
    console.log('[WttDataViz] 开始初始化，wttRankingTimeline 长度:', wttRankingTimeline.length, 'wttScoreLogData 长度:', wttScoreLogData.length);

    if (!document.getElementById('wttPointsTrendChart')) {
        console.warn('[WttDataViz] 页面上找不到 wttPointsTrendChart 元素');
        return;
    }

    if (!wttRankingTimeline || wttRankingTimeline.length === 0) {
        console.error('[WttDataViz] wttRankingTimeline 为空，排名数据未加载成功');
        console.error('[WttDataViz] wttRankingTimeline 为空，排名数据未加载成功');
        document.getElementById('wttPlayerCheckboxList').innerHTML = '<div style="padding:20px;color:var(--accent-red);">❌ ' + i18n[currentLang].wtt_error_fail + '</div>';
        return;
    }

    const players = wttGetAllPlayers();
    if (!players.length) {
        console.error('[WttDataViz] wttGetAllPlayers() 返回空数组');
        document.getElementById('wttPlayerCheckboxList').innerHTML = '<div style="padding:20px;color:var(--accent-red);">❌ ' + i18n[currentLang].wtt_no_players + '</div>';
        return;
    }

    // 🔥 按实时积分降序排列
    const wttLastSnapshot = wttRankingTimeline[wttRankingTimeline.length - 1];
    const wttScoreMap = {};
    if (wttLastSnapshot && wttLastSnapshot.data) {
        for (const p of wttLastSnapshot.data) {
            wttScoreMap[p['姓名']] = p['当前积分'];
        }
    }
    players.sort((a, b) => (wttScoreMap[b] || 0) - (wttScoreMap[a] || 0));

    console.log('[WttDataViz] 成功获取球员列表:', players.length, '人');
    wttLoadDataVizSettings().then(() => {
        wttRenderPlayerCheckboxes();
        wttRenderCompareSelects();
        const dp = players.slice(0, Math.min(8, players.length));
        const defaultDataCount = parseInt(document.getElementById('wttPointsTrendDataCount')?.value) || 20;
        wttRenderPointsTrend(dp, defaultDataCount);
        const defaultStreamCount = parseInt(document.getElementById('wttStreamDataCount')?.value) || 20;
        wttRenderRankStream(Math.min(10, players.length), defaultStreamCount);

        // 事件监听
    document.getElementById('wttApplyPointsTrend')?.addEventListener('click', () => {
        const sel = wttGetSelectedPlayers();
        if (!sel.length) { alert(i18n[currentLang].wtt_alert_select_one); return; }
        if (sel.length > 15) { alert(i18n[currentLang].wtt_alert_max); return; }
        const dc = parseInt(document.getElementById('wttPointsTrendDataCount')?.value) || 20;
        wttRenderPointsTrend(sel, dc);
    });
    document.getElementById('wttPointsTrendDataCount')?.addEventListener('change', () => {
        const sel = wttGetSelectedPlayers();
        if (!sel.length) { sel.push(...players.slice(0, Math.min(8, players.length))); }
        const dc = parseInt(document.getElementById('wttPointsTrendDataCount')?.value) || 20;
        wttRenderPointsTrend(sel, dc);
    });
    document.getElementById('wttTopNSelect')?.addEventListener('change', e => {
        let v = parseInt(e.target.value);
        if (isNaN(v) || v < 1) v = 1;
        if (v > 20) v = 20;
        e.target.value = v;
        const dc = parseInt(document.getElementById('wttStreamDataCount')?.value) || 20;
        wttRenderRankStream(v, dc);
    });
    document.getElementById('wttStreamDataCount')?.addEventListener('change', () => {
        const topN = parseInt(document.getElementById('wttTopNSelect')?.value) || 10;
        const dc = parseInt(document.getElementById('wttStreamDataCount')?.value) || 20;
        wttRenderRankStream(topN, dc);
    });
    document.getElementById('wttApplyCompare')?.addEventListener('click', () => {
        const pa = document.getElementById('wttPlayerASelect')?.value, pb = document.getElementById('wttPlayerBSelect')?.value;
        if (!pa || !pb) { alert(i18n[currentLang].wtt_alert_two); return; }
        if (pa === pb) { alert(i18n[currentLang].wtt_alert_diff); return; }
        wttCurrentCompare = { a: pa, b: pb };
        wttRenderComparison(pa, pb);
    });
    console.log('[WttDataViz] 初始化完成');
    });  // ← 关闭 wttLoadDataVizSettings().then()

    // 响应窗口大小变化，重绘图表
    let resizeTimeout;
    window.addEventListener('resize', () => {
        clearTimeout(resizeTimeout);
        resizeTimeout = setTimeout(() => {
            const sel = wttGetSelectedPlayers();
            const dc = parseInt(document.getElementById('wttPointsTrendDataCount')?.value) || 20;
            if (sel.length && wttPointsTrendChart) wttRenderPointsTrend(sel, dc);
            const topN = parseInt(document.getElementById('wttTopNSelect')?.value) || 10;
            const sdc = parseInt(document.getElementById('wttStreamDataCount')?.value) || 20;
            if (wttRankStreamChart) wttRenderRankStream(topN, sdc);
        }, 300);
    });
}

// ============ 辅助函数 ============

function wttGetAllPlayers() {
    const playerSet = new Set();

    // 1. 从 ranking timeline 的所有快照中收集球员
    if (wttRankingTimeline && wttRankingTimeline.length) {
        for (const t of wttRankingTimeline) {
            if (t.data && t.data.length) {
                for (const p of t.data) {
                    if (p['姓名']) playerSet.add(p['姓名']);
                }
            }
        }
    }

    // 2. 从初始积分中收集球员（含无比赛记录的球员）
    if (wttInitialScoresData && wttInitialScoresData.initialScores) {
        for (const name of Object.keys(wttInitialScoresData.initialScores)) {
            if (name) playerSet.add(name);
        }
    }

    // 3. 从 score log 中收集球员
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
        console.warn('[WttDataViz] wttGetAllPlayers: 未找到任何球员');
    }
    return players;
}

function wttGetSelectedPlayers() {
    return Array.from(document.querySelectorAll('#wttPlayerCheckboxList input[type="checkbox"]:checked')).map(cb => cb.value);
}

// ============ 球员选择复选框 ============

function wttRenderPlayerCheckboxes() {
    const container = document.getElementById('wttPlayerCheckboxList');
    if (!container) return;

    const players = wttGetAllPlayers();
    if (!players.length) {
        container.innerHTML = '<div style="padding:20px;text-align:center;color:var(--text-muted);">' + i18n[currentLang].wtt_no_players + '</div>';
        return;
    }

    // 切换到 WTT 全局数据以使用 getSeasonStartScores
    const origScoreLog = scoreLogData;
    const origInitial = initialScoresData;
    const origEvent = eventCoefficients;
    const origSeasons = seasonsData;
    scoreLogData = wttScoreLogData;
    initialScoresData = (typeof wttGetInitialScoresDataForEngine === 'function') ? wttGetInitialScoresDataForEngine() : wttInitialScoresData;
    eventCoefficients = wttEventCoefficients;
    seasonsData = wttSeasonsData;

    // 构建积分查找表（含不活跃球员，使用赛季继承起始积分）
    const scoreMap = {};
    let cd = [];
    for (let i = wttRankingTimeline.length - 1; i >= 0; i--) {
        if (wttRankingTimeline[i].data && wttRankingTimeline[i].data.length > 0) {
            cd = wttRankingTimeline[i].data;
            break;
        }
    }
    for (const p of cd) { scoreMap[p['姓名']] = p['当前积分']; }
    // 不活跃球员：使用当前赛季的继承起始积分
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

    // 恢复全局数据
    scoreLogData = origScoreLog;
    initialScoresData = origInitial;
    eventCoefficients = origEvent;
    seasonsData = origSeasons;

    // 按积分降序排列
    const sortedPlayers = [...players].sort((a, b) => (scoreMap[b] || 0) - (scoreMap[a] || 0));

    container.innerHTML = sortedPlayers.map((name, i) => {
        const checked = i < 8 ? 'checked' : '';
        const pts = scoreMap[name] !== undefined ? scoreMap[name].toFixed(1) : '-';
        return `<label class="player-checkbox-item ${i<5?'checked':''}"><input type="checkbox" value="${escapeHtml(String(name))}" ${checked}><span>${escapeHtml(String(name))}</span><span class="player-rank">${pts}</span></label>`;
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

function wttRenderCompareSelects() {
    const players = wttGetAllPlayers();
    if (!players.length) return;

    // 切换到 WTT 全局数据
    const origScoreLog = scoreLogData;
    const origInitial = initialScoresData;
    const origEvent = eventCoefficients;
    const origSeasons = seasonsData;
    scoreLogData = wttScoreLogData;
    initialScoresData = (typeof wttGetInitialScoresDataForEngine === 'function') ? wttGetInitialScoresDataForEngine() : wttInitialScoresData;
    eventCoefficients = wttEventCoefficients;
    seasonsData = wttSeasonsData;

    // 构建积分查找表（含不活跃球员）并排序
    const scoreMap = {};
    let cd = [];
    for (let i = wttRankingTimeline.length - 1; i >= 0; i--) {
        if (wttRankingTimeline[i].data && wttRankingTimeline[i].data.length > 0) {
            cd = wttRankingTimeline[i].data;
            break;
        }
    }
    for (const p of cd) { scoreMap[p['姓名']] = p['当前积分']; }
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

    // 恢复全局数据
    scoreLogData = origScoreLog;
    initialScoresData = origInitial;
    eventCoefficients = origEvent;
    seasonsData = origSeasons;

    const sortedPlayers = [...players].sort((a, b) => (scoreMap[b] || 0) - (scoreMap[a] || 0));

    const opts = sortedPlayers.map(p => `<option value="${escapeHtml(String(p))}">${escapeHtml(String(p))}</option>`).join('');
    const ph = i18n[currentLang].wtt_select_player;
    const sa = document.getElementById('wttPlayerASelect'), sb = document.getElementById('wttPlayerBSelect');
    if (sa) sa.innerHTML = `<option value="">${ph}</option>` + opts;
    if (sb) sb.innerHTML = `<option value="">${ph}</option>` + opts;
}

// ============ 积分趋势图 ============

// 获取球员在某个WTT快照时点的积分（含无比赛记录的球员）
// 注意：球员首次参赛前不纳入统计，返回 null
function wttGetPlayerScoreAtSnapshot(playerName, timelineEntry) {
    const p = timelineEntry.data.find(x => x['姓名'] === playerName);
    if (p) return p['当前积分'];

    // 检查快照日期是否在球员首次参赛之前
    const firstAppearance = getWttFirstAppearanceDate();
    const playerFirstDate = firstAppearance[playerName];
    if (playerFirstDate && timelineEntry.time && timelineEntry.time < playerFirstDate) {
        return null;
    }

    // 切换到 WTT 全局数据，确保 getSeasonStartScores 使用正确的数据源
    const origScoreLog = scoreLogData;
    const origInitial = initialScoresData;
    const origEvent = eventCoefficients;
    const origSeasons = seasonsData;
    scoreLogData = wttScoreLogData;
    initialScoresData = (typeof wttGetInitialScoresDataForEngine === 'function') ? wttGetInitialScoresDataForEngine() : wttInitialScoresData;
    eventCoefficients = wttEventCoefficients;
    seasonsData = wttSeasonsData;

    let result = null;
    if (seasonsData && seasonsData.length > 0 && timelineEntry.season) {
        const season = seasonsData.find(s => s.label === timelineEntry.season);
        if (season) {
            const seasonIdx = seasonsData.indexOf(season);
            if (seasonIdx >= 0) {
                const startScores = getSeasonStartScores(seasonIdx);
                if (startScores[playerName] !== undefined) result = startScores[playerName];
            }
        }
    }
    if (result === null && initialScoresData && initialScoresData.initialScores && initialScoresData.initialScores[playerName] !== undefined) {
        result = initialScoresData.initialScores[playerName];
    }

    // 恢复全局数据
    scoreLogData = origScoreLog;
    initialScoresData = origInitial;
    eventCoefficients = origEvent;
    seasonsData = origSeasons;

    return result;
}

// 获取球员在某个WTT快照时点的排名（含无比赛记录的球员）
// 注意：球员首次参赛前不纳入统计，返回 null
function wttGetPlayerRankAtSnapshot(playerName, timelineEntry) {
    // 检查快照日期是否在球员首次参赛之前
    const firstAppearance = getWttFirstAppearanceDate();
    const playerFirstDate = firstAppearance[playerName];
    if (playerFirstDate && timelineEntry.time && timelineEntry.time < playerFirstDate) {
        return null;
    }

    const allScores = [];
    const seen = new Set();
    for (const p of timelineEntry.data) {
        allScores.push({ name: p['姓名'], score: p['当前积分'] });
        seen.add(p['姓名']);
    }

    // 切换到 WTT 全局数据，确保 getSeasonStartScores 使用正确的数据源
    const origScoreLog = scoreLogData;
    const origInitial = initialScoresData;
    const origEvent = eventCoefficients;
    const origSeasons = seasonsData;
    scoreLogData = wttScoreLogData;
    initialScoresData = (typeof wttGetInitialScoresDataForEngine === 'function') ? wttGetInitialScoresDataForEngine() : wttInitialScoresData;
    eventCoefficients = wttEventCoefficients;
    seasonsData = wttSeasonsData;

    if (seasonsData && seasonsData.length > 0 && timelineEntry.season) {
        const season = seasonsData.find(s => s.label === timelineEntry.season);
        if (season) {
            const seasonIdx = seasonsData.indexOf(season);
            if (seasonIdx >= 0) {
                const startScores = getSeasonStartScores(seasonIdx);
                for (const [name, score] of Object.entries(startScores)) {
                    if (!seen.has(name)) { allScores.push({ name, score }); seen.add(name); }
                }
            }
        }
    }

    // 恢复全局数据
    scoreLogData = origScoreLog;
    initialScoresData = origInitial;
    eventCoefficients = origEvent;
    seasonsData = origSeasons;

    allScores.sort((a, b) => b.score - a.score);
    const idx = allScores.findIndex(x => x.name === playerName);
    return idx >= 0 ? idx + 1 : null;
}

function wttRenderPointsTrend(playerNames, dataCount) {
    const canvas = document.getElementById('wttPointsTrendChart');
    if (!canvas || !wttRankingTimeline.length) return;
    if (wttPointsTrendChart) { wttPointsTrendChart.destroy(); wttPointsTrendChart = null; }

    dataCount = Math.max(2, Math.min(dataCount || 20, wttRankingTimeline.length));
    const slicedTimeline = wttRankingTimeline.slice(-dataCount);

    const isMobile = window.innerWidth <= 768;
    const mobileScale = (wttDataVizSettings && wttDataVizSettings.mobile) ? wttDataVizSettings.mobile : { pointRadiusScale: 0.5, borderWidthScale: 0.8, pointHoverExtraScale: 0.7 };

    // 🔥 根据数据点数量匹配最佳参数档位
    const tier = wttGetDataVizTier(dataCount);
    const tension = tier.tension;
    const pointRadius = isMobile
        ? Math.round(tier.pointRadius * (mobileScale.pointRadiusScale || 0.5))
        : tier.pointRadius;
    const pointHoverRadius = pointRadius + (isMobile
        ? Math.round(tier.pointHoverExtra * (mobileScale.pointHoverExtraScale || 0.7))
        : tier.pointHoverExtra);
    const borderWidth = isMobile
        ? tier.borderWidth * (mobileScale.borderWidthScale || 0.8)
        : tier.borderWidth;

    const labels = slicedTimeline.map(t => t.label);
    const datasets = playerNames.map((name, idx) => {
        const data = slicedTimeline.map(t => wttGetPlayerScoreAtSnapshot(name, t));
        return {
            label: name, data,
            borderColor: WTT_CHART_COLORS[idx % WTT_CHART_COLORS.length],
            backgroundColor: WTT_CHART_COLORS[idx % WTT_CHART_COLORS.length] + '20',
            borderWidth: borderWidth,
            pointRadius: pointRadius,
            pointHoverRadius: pointHoverRadius,
            tension: tension,
            fill: false, spanGaps: true
        };
    });

    try {
        wttPointsTrendChart = new Chart(canvas, {
            type: 'line', data: { labels, datasets },
            options: {
                responsive: true, maintainAspectRatio: false,
                interaction: { intersect: false, mode: 'index' },
                plugins: {
                    legend: {
                        position: 'bottom',
                        labels: { usePointStyle: true, padding: isMobile ? 10 : 20, font: { size: isMobile ? 10 : 12, family: "'Poppins', sans-serif" }, boxWidth: isMobile ? 10 : 12 }
                    },
                    tooltip: { backgroundColor: 'rgba(26,29,40,0.9)', titleFont: { size: isMobile ? 11 : 13 }, bodyFont: { size: isMobile ? 10 : 12 }, padding: isMobile ? 8 : 12, cornerRadius: 8, itemSort: (a, b) => (b.parsed.y ?? -Infinity) - (a.parsed.y ?? -Infinity), callbacks: { label: ctx => `${ctx.dataset.label}: ${ctx.raw.toFixed(1)}` } }
                },
                scales: {
                    x: { grid: { color: 'rgba(128,128,128,0.1)' }, ticks: { font: { size: isMobile ? 9 : 11 }, maxRotation: isMobile ? 45 : 0 } },
                    y: { beginAtZero: false, grid: { color: 'rgba(128,128,128,0.1)' }, ticks: { font: { size: isMobile ? 9 : 11 } }, title: { display: true, text: i18n[currentLang].wtt_axis_points, font: { size: isMobile ? 10 : 12 } } }
                }
            }
        });
    } catch(err) { console.error('WTT积分趋势图失败', err); }
}

// ============ 排名河流图 ============

function wttRenderRankStream(topN, dataCount) {
    const canvas = document.getElementById('wttRankStreamChart');
    if (!canvas || !wttRankingTimeline.length) return;
    if (wttRankStreamChart) { wttRankStreamChart.destroy(); wttRankStreamChart = null; }

    // 取最近 dataCount 个数据点
    dataCount = Math.max(2, Math.min(dataCount || 20, wttRankingTimeline.length));
    const slicedTimeline = wttRankingTimeline.slice(-dataCount);

    const isMobile = window.innerWidth <= 768;
    const labels = slicedTimeline.map(t => t.label);

    // 使用最后一个切片快照确定 top 球员
    let lastNonEmptySnapshot = null;
    for (let i = slicedTimeline.length - 1; i >= 0; i--) {
        if (slicedTimeline[i].data && slicedTimeline[i].data.length > 0) {
            lastNonEmptySnapshot = slicedTimeline[i];
            break;
        }
    }
    if (!lastNonEmptySnapshot) return;

    // 获取所有球员（含不活跃的）在最后一个快照的排名来确定 top N
    const allWttPlayers = wttGetAllPlayers();
    const lastSnapshotRanks = allWttPlayers.map(name => ({
        name,
        rank: wttGetPlayerRankAtSnapshot(name, lastNonEmptySnapshot)
    })).filter(x => x.rank !== null).sort((a, b) => a.rank - b.rank);

    topN = Math.max(1, Math.min(topN, 20, allWttPlayers.length));
    const topPlayers = lastSnapshotRanks.slice(0, topN).map(p => p.name);
    const textColor = getComputedStyle(document.body).getPropertyValue('--text-primary').trim() || '#1a1a2e';
    const datasets = topPlayers.map((name, idx) => {
        const data = slicedTimeline.map(t => wttGetPlayerRankAtSnapshot(name, t));
        const color = WTT_STREAM_COLORS[idx % WTT_STREAM_COLORS.length];
        return {
            label: name, data,
            borderColor: color, backgroundColor: color + '25',
            borderWidth: isMobile ? 1.5 : 2,
            pointRadius: isMobile ? 2 : 3,
            pointHoverRadius: isMobile ? 4 : 6,
            tension: 0.4, fill: true, spanGaps: true
        };
    });

    try {
        wttRankStreamChart = new Chart(canvas, {
            type: 'line', data: { labels, datasets },
            options: {
                responsive: true, maintainAspectRatio: false,
                interaction: { intersect: false, mode: 'index' },
                plugins: {
                    legend: {
                        position: 'bottom',
                        labels: { usePointStyle: true, padding: isMobile ? 8 : 16, font: { size: isMobile ? 9 : 11, family: "'Poppins', sans-serif" }, color: textColor, boxWidth: isMobile ? 10 : 12 }
                    },
                    tooltip: {
                        backgroundColor: 'rgba(26,29,40,0.9)', titleFont: { size: isMobile ? 11 : 13 }, bodyFont: { size: isMobile ? 10 : 12 }, padding: isMobile ? 8 : 12, cornerRadius: 8,
                        itemSort: (a, b) => (a.parsed.y ?? Infinity) - (b.parsed.y ?? Infinity),
                        callbacks: { label: ctx => `${ctx.dataset.label}: ${i18n[currentLang].wtt_rank_suffix.replace('{n}', ctx.raw)}` }
                    }
                },
                scales: {
                    x: { grid: { color: 'rgba(128,128,128,0.1)' }, ticks: { font: { size: isMobile ? 9 : 11 }, maxRotation: isMobile ? 45 : 0 } },
                    y: { reverse: true, min: 1, max: topN, grid: { color: 'rgba(128,128,128,0.1)' }, ticks: { font: { size: isMobile ? 9 : 11 }, stepSize: 1 }, title: { display: true, text: i18n[currentLang].wtt_axis_rank, font: { size: isMobile ? 10 : 12 } } }
                }
            }
        });
    } catch(err) { console.error('WTT排名河流图失败', err); }
}

// ============ 球员对比 ============

// 计算 WTT 球员近期状态分（最近10场比赛的积分变化总和）
function wttCalcFormScore(playerName) {
    if (!wttScoreLogData || !wttScoreLogData.length) return 0;

    // 切换到 WTT 全局数据
    const origScoreLog = scoreLogData;
    const origInitial = initialScoresData;
    const origEvent = eventCoefficients;
    const origSeasons = seasonsData;

    scoreLogData = wttScoreLogData;
    initialScoresData = (typeof wttGetInitialScoresDataForEngine === 'function') ? wttGetInitialScoresDataForEngine() : wttInitialScoresData;
    eventCoefficients = wttEventCoefficients;
    seasonsData = wttSeasonsData;

    const playerMatches = scoreLogData
        .filter(r => isMatchRecord(r) && (r['胜者'] === playerName || r['负者'] === playerName))
        .sort((a, b) => a['日期'].localeCompare(b['日期']));

    if (!playerMatches.length) {
        scoreLogData = origScoreLog; initialScoresData = origInitial;
        eventCoefficients = origEvent; seasonsData = origSeasons;
        return 0;
    }

    const recentMatches = playerMatches.slice(-10);
    const firstRecentDate = recentMatches[0]['日期'];

    // 使用赛季感知的起始积分
    const scores = {};
    let seasonStartDate = '';
    if (seasonsData && seasonsData.length > 0) {
        let seasonIdx = -1;
        for (let si = 0; si < seasonsData.length; si++) {
            if (firstRecentDate >= seasonsData[si].startDate && firstRecentDate <= seasonsData[si].endDate) {
                seasonIdx = si; break;
            }
        }
        if (seasonIdx === -1 && firstRecentDate > seasonsData[seasonsData.length - 1].endDate) {
            seasonIdx = seasonsData.length - 1;
        }
        if (seasonIdx >= 0) {
            const inheritedScores = getSeasonStartScores(seasonIdx);
            Object.assign(scores, inheritedScores);
            seasonStartDate = seasonsData[seasonIdx].startDate;
        }
    }
    if (Object.keys(scores).length === 0 && initialScoresData) {
        Object.assign(scores, initialScoresData.initialScores);
    }

    const sortedLog = [...scoreLogData].sort((a, b) => a['日期'].localeCompare(b['日期']));

    for (const m of sortedLog) {
        if (m['日期'] >= firstRecentDate) break;
        // 跳过赛季开始前的记录
        if (seasonStartDate && m['日期'] < seasonStartDate) continue;
        if (isMatchRecord(m)) {
            const w = m['胜者'], l = m['负者'];
            if (!scores[w]) scores[w] = DEFAULT_INITIAL_SCORE;
            if (!scores[l]) scores[l] = DEFAULT_INITIAL_SCORE;
            const wg = calcRawPoints(w, l, m['类型'], scores);
            scores[w] = Math.max(SCORE_FLOOR, scores[w] + wg);
            scores[l] = Math.max(SCORE_FLOOR, scores[l] - wg * LOSER_POINT_MULTIPLIER);
        } else if (isBonusRecord(m)) {
            const target = m['对象'];
            const bonus = parseFloat(m['分数']) || 0;
            if (!scores[target]) scores[target] = DEFAULT_INITIAL_SCORE;
            scores[target] = Math.max(SCORE_FLOOR, scores[target] + bonus);
        }
    }

    let totalChange = 0;
    for (const m of recentMatches) {
        const w = m['胜者'], l = m['负者'];
        if (!scores[w]) scores[w] = DEFAULT_INITIAL_SCORE;
        if (!scores[l]) scores[l] = DEFAULT_INITIAL_SCORE;
        const rawPoints = calcRawPoints(w, l, m['类型'], scores);
        if (w === playerName) {
            totalChange += rawPoints;
            scores[w] = Math.max(SCORE_FLOOR, scores[w] + rawPoints);
            scores[l] = Math.max(SCORE_FLOOR, scores[l] - rawPoints * LOSER_POINT_MULTIPLIER);
        } else {
            totalChange -= rawPoints * LOSER_POINT_MULTIPLIER;
            scores[w] = Math.max(SCORE_FLOOR, scores[w] + rawPoints);
            scores[l] = Math.max(SCORE_FLOOR, scores[l] - rawPoints * LOSER_POINT_MULTIPLIER);
        }
    }

    scoreLogData = origScoreLog; initialScoresData = origInitial;
    eventCoefficients = origEvent; seasonsData = origSeasons;
    return totalChange;
}

function wttCalcPredictedWinRate(rA, rB, aWins, bWins, fA, fB) {
    const pElo = 1 / (1 + Math.pow(10, (rB - rA) / 400));
    const k = 0.02;
    const pForm = 1 / (1 + Math.exp(-k * (fA - fB)));
    if (aWins + bWins === 0) return 0.7 * pElo + 0.3 * pForm;
    const pH2H = (aWins + 2) / (aWins + bWins + 4);
    return 0.6 * pElo + 0.2 * pH2H + 0.2 * pForm;
}

function wttRenderComparison(playerA, playerB) {
    const container = document.getElementById('wttCompareResult');
    if (!container) return;

    // 切换到 WTT 全局数据
    const origScoreLog = scoreLogData;
    const origInitial = initialScoresData;
    const origEvent = eventCoefficients;
    const origSeasons = seasonsData;

    scoreLogData = wttScoreLogData;
    initialScoresData = (typeof wttGetInitialScoresDataForEngine === 'function') ? wttGetInitialScoresDataForEngine() : wttInitialScoresData;
    eventCoefficients = wttEventCoefficients;
    seasonsData = wttSeasonsData;

    let lastNonEmptySnapshot = null;
    for (let i = wttRankingTimeline.length - 1; i >= 0; i--) {
        if (wttRankingTimeline[i].data && wttRankingTimeline[i].data.length > 0) {
            lastNonEmptySnapshot = wttRankingTimeline[i];
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
    const recent = h2h.length ? h2h[h2h.length - 1] : null;
    const aWinRate = total > 0 ? ((aW / total) * 100).toFixed(1) + '%' : '-',
          bWinRate = total > 0 ? ((bW / total) * 100).toFixed(1) + '%' : '-';

    const rA = ad ? ad['当前积分'] : DEFAULT_INITIAL_SCORE, rB = bd ? bd['当前积分'] : DEFAULT_INITIAL_SCORE;
    const fA = wttCalcFormScore(playerA), fB = wttCalcFormScore(playerB);
    const predA = (wttCalcPredictedWinRate(rA, rB, aW, bW, fA, fB) * 100).toFixed(1);
    const predB = (wttCalcPredictedWinRate(rB, rA, bW, aW, fB, fA) * 100).toFixed(1);

    let html = `<div class="compare-summary">
        <div class="compare-player-col">
            <div class="compare-player-name">${playerA}</div>
            <div class="compare-player-stat">${i18n[currentLang].wtt_cur_score}: <strong>${ad ? ad['当前积分'].toFixed(1) : '-'}</strong></div>
            <div class="compare-player-stat">${i18n[currentLang].wtt_h2h_rate}: <strong>${aWinRate}</strong></div>
            <div class="compare-player-stat">${i18n[currentLang].wtt_pred_rate}: <strong>${predA}%</strong></div>
        </div>
        <div class="compare-divider">VS</div>
        <div class="compare-player-col">
            <div class="compare-player-name">${playerB}</div>
            <div class="compare-player-stat">${i18n[currentLang].wtt_cur_score}: <strong>${bd ? bd['当前积分'].toFixed(1) : '-'}</strong></div>
            <div class="compare-player-stat">${i18n[currentLang].wtt_h2h_rate}: <strong>${bWinRate}</strong></div>
            <div class="compare-player-stat">${i18n[currentLang].wtt_pred_rate}: <strong>${predB}%</strong></div>
        </div>
    </div>`;

    if (total > 0) {
        html += `<div style="text-align:center;margin-bottom:16px;">
            <span style="font-weight:600;">${i18n[currentLang].wtt_total_h2h.replace('{n}', total)}</span> |
            <span style="color:#52c41a;">${i18n[currentLang].wtt_wins.replace('{player}', playerA).replace('{n}', aW)}</span> |
            <span style="color:#52c41a;">${i18n[currentLang].wtt_wins.replace('{player}', playerB).replace('{n}', bW)}</span>
            ${recent ? ` | ${i18n[currentLang].wtt_recent.replace('{date}', recent['日期']).replace('{winner}', recent['胜者'])}` : ''}
        </div>
        <div class="compare-h2h-wrapper">
            <table class="compare-h2h-table">
                <thead><tr><th>${i18n[currentLang].score_col_date}</th><th>${i18n[currentLang].score_col_type}</th><th>${i18n[currentLang].wtt_winner}</th><th>${i18n[currentLang].wtt_pts_change.replace('{player}', playerA)}</th><th>${i18n[currentLang].wtt_pts_change.replace('{player}', playerB)}</th></tr></thead>
                <tbody>`;

        const scores = {};
        // 使用赛季感知的起始积分
        if (seasonsData && seasonsData.length > 0 && h2h.length > 0) {
            const firstH2hDate = h2h[0]['日期'];
            let seasonIdx = -1;
            for (let si = 0; si < seasonsData.length; si++) {
                if (firstH2hDate >= seasonsData[si].startDate && firstH2hDate <= seasonsData[si].endDate) { seasonIdx = si; break; }
            }
            if (seasonIdx === -1 && firstH2hDate > seasonsData[seasonsData.length - 1].endDate) { seasonIdx = seasonsData.length - 1; }
            if (seasonIdx >= 0) { const inheritedScores = getSeasonStartScores(seasonIdx); Object.assign(scores, inheritedScores); }
        }
        if (Object.keys(scores).length === 0 && initialScoresData) Object.assign(scores, initialScoresData.initialScores);
        const sortedLog = [...scoreLogData].sort((a, b) => a['日期'].localeCompare(b['日期']));

        // 确定赛季起始日期，跳过之前的记录
        const h2hSeasonStart = (seasonsData && seasonsData.length > 0 && h2h.length > 0) ? (() => { const d = h2h[0]['日期']; for (const s of seasonsData) { if (d >= s.startDate && d <= s.endDate) return s.startDate; } return seasonsData[seasonsData.length - 1].startDate; })() : '';

        for (const m of sortedLog) {
            if (h2hSeasonStart && m['日期'] < h2hSeasonStart) continue;
            if (!isMatchRecord(m)) continue;
            const w = m['胜者'], l = m['负者'];
            if ((w !== playerA || l !== playerB) && (w !== playerB || l !== playerA)) continue;
            if (!scores[w]) scores[w] = DEFAULT_INITIAL_SCORE;
            if (!scores[l]) scores[l] = DEFAULT_INITIAL_SCORE;
            const wg = calcMatchPoints(w, l, m['类型'], m['日期'], m['日期'], scores);
            const aIsW = w === playerA;
            const aChange = aIsW ? wg : -(wg * LOSER_POINT_MULTIPLIER);
            const bChange = aIsW ? -(wg * LOSER_POINT_MULTIPLIER) : wg;
            html += `<tr>
                <td>${escapeHtml(m['日期'])}</td><td>${escapeHtml(m['类型'])}</td><td>${escapeHtml(w)}</td>
                <td class="${aIsW ? 'win-highlight' : 'loss-highlight'}">${aChange > 0 ? '+' : ''}${aChange.toFixed(1)}</td>
                <td class="${!aIsW ? 'win-highlight' : 'loss-highlight'}">${bChange > 0 ? '+' : ''}${bChange.toFixed(1)}</td>
            </tr>`;
            scores[w] = Math.max(SCORE_FLOOR, scores[w] + wg);
            scores[l] = Math.max(SCORE_FLOOR, scores[l] - wg * LOSER_POINT_MULTIPLIER);
        }
        html += '</tbody></table></div>';
    } else {
        html += '<div class="compare-placeholder"><p>' + i18n[currentLang].wtt_no_h2h + '</p></div>';
    }

    container.innerHTML = html;

    scoreLogData = origScoreLog; initialScoresData = origInitial;
    eventCoefficients = origEvent; seasonsData = origSeasons;
}

// 语言切换时重绘图表（覆盖 wtt_common.js 中的同名函数）
function wttReapplyI18n() {
    wttUpdatePageCategoryDisplay();
    const sel = wttGetSelectedPlayers();
    const dc = parseInt(document.getElementById('wttPointsTrendDataCount')?.value) || 20;
    if (sel.length) wttRenderPointsTrend(sel, dc);
    const topN = parseInt(document.getElementById('wttTopNSelect')?.value) || 10;
    const sdc = parseInt(document.getElementById('wttStreamDataCount')?.value) || 20;
    if (wttRankStreamChart) wttRenderRankStream(topN, sdc);
    wttUpdateCompareBox();
}

function wttUpdateCompareBox() {
    const container = document.getElementById('wttCompareResult');
    if (!container || !wttCurrentCompare) return;
    wttRenderComparison(wttCurrentCompare.a, wttCurrentCompare.b);
}
