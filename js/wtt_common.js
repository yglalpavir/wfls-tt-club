/* ========================================
   wtt_common.js - WTT 五项目通用数据加载模块
   支持: MS(男子单打) WS(女子单打) MD(男子双打) WD(女子双打) XD(混合双打)

   使用方法：
     1. 在 HTML 中通过 URL 参数 ?cat=ms 指定项目
     2. 或调用 setWttCategory('ms') 手动设置
     3. 然后使用 wttLoadAllData() 加载数据
   ======================================== */

// ============ 五项目定义 ============

const WTT_CATEGORIES = {
    ms: { id: 'ms', name: '男子单打', nameEn: "Men's Singles",    icon: '👤',   color: '#4da3ff', desc: 'Men\'s Singles ranking & stats' },
    ws: { id: 'ws', name: '女子单打', nameEn: "Women's Singles",  icon: '👩',   color: '#ff6b6b', desc: 'Women\'s Singles ranking & stats' },
    md: { id: 'md', name: '男子双打', nameEn: "Men's Doubles",    icon: '👥',   color: '#52c41a', desc: 'Men\'s Doubles ranking & stats' },
    wd: { id: 'wd', name: '女子双打', nameEn: "Women's Doubles",  icon: '👩‍👩', color: '#f5c542', desc: 'Women\'s Doubles ranking & stats' },
    xd: { id: 'xd', name: '混合双打', nameEn: 'Mixed Doubles',    icon: '💑',   color: '#a55eea', desc: 'Mixed Doubles ranking & stats' }
};

// ============ 当前项目状态 ============

let wttCurrentCategory = 'ms';  // 默认男子单打
let wttScoreLogData = [];
let wttInitialScoresData = null;
let wttSettings = null;  // 项目设置（scoreMode 等）
let wttEventCoefficients = null;
let wttSeasonsData = null;
let wttRankingTimeline = [];
let wttCurrentTimeIndex = 0;
let wttCurrentDisplayData = [];
let wttCurrentSortKey = '当前积分';
let wttCurrentSortDir = 'desc';
let wttCurrentScoreContext = { player: '', snapshotDate: '' };
let wttInitialized = false;

// ============ 项目切换 ============

/**
 * 从 URL 参数或默认值设置当前项目
 */
function wttDetectCategory() {
    const params = new URLSearchParams(window.location.search);
    const cat = params.get('cat');
    if (cat && WTT_CATEGORIES[cat]) {
        wttCurrentCategory = cat;
    }
    return wttCurrentCategory;
}

/**
 * 手动切换项目
 */
function setWttCategory(cat) {
    if (WTT_CATEGORIES[cat]) {
        wttCurrentCategory = cat;
        // 更新 URL 参数（不刷新页面）
        const url = new URL(window.location);
        url.searchParams.set('cat', cat);
        window.history.replaceState({}, '', url);
    }
}

/**
 * 获取当前项目的数据目录路径
 */
function wttGetDataPath(filename) {
    return `wtt_data/${wttCurrentCategory}/${filename}`;
}

// ============ 数据加载 ============

/**
 * 严格校验一条记录是否为有效的比赛/加分记录
 * 排除：无日期、日期以_开头、包含 _placeholder 占位符的记录
 */
function wttIsValidRecord(r) {
    // 必须有日期且为有效字符串，不能以 _ 开头（模板注释标记）
    if (!r['日期'] || typeof r['日期'] !== 'string' || r['日期'].startsWith('_')) return false;

    // 辅助：检查选手名是否为占位符
    function isPlaceholder(name) {
        if (!name || typeof name !== 'string') return true;  // 无名 = 无效
        if (name.startsWith('_placeholder') || name.startsWith('_template')) return true;
        return false;
    }

    // 比赛记录：必须有 胜者+负者，且都不是占位符
    if (r['胜者'] && r['负者']) {
        if (isPlaceholder(r['胜者']) || isPlaceholder(r['负者'])) return false;
        return true;
    }

    // 加分记录：类型必须是"比赛结果加分"且有对象，且对象不是占位符
    if (r['类型'] === '比赛结果加分' && r['对象']) {
        if (isPlaceholder(r['对象'])) return false;
        return true;
    }

    return false;
}

function wttLoadScoreLog() {
    // 🔥 优先尝试按赛季拆分的文件（每个赛季的 score-log 小很多，加载更快）
    return wttLoadScoreLogFromSeasonFiles().catch(() => {
        // 回退到原始的单文件
        return fetch(wttGetDataPath('score-log.json'))
            .then(r => r.json())
            .then(d => {
                wttScoreLogData = d.filter(wttIsValidRecord);
                clearFirstAppearanceCache();
            });
    }).catch(e => {
        console.error(`WTT[${wttCurrentCategory}] score-log 加载失败`, e);
        wttScoreLogData = [];
    });
}

/**
 * 尝试从按赛季拆分的文件中加载 score log
 * 文件名格式: score-log-{seasonId}.json（如 score-log-2021-wtt.json）
 */
async function wttLoadScoreLogFromSeasonFiles() {
    // 根据当前 category 构建可能的赛季 ID 列表
    // MS 使用 "wtt" 后缀（历史原因），其他项目使用对应字母
    const years = ['2021', '2022', '2023', '2024', '2025', '2026'];
    let seasonIds;
    if (wttCurrentCategory === 'ms') {
        // MS 的赛季 ID 后缀为 "wtt"（因为最初只有男子单打）
        seasonIds = years.map(y => `${y}-wtt`);
    } else {
        // 其他项目的赛季 ID 后缀与 category 相同（如 ws → 2021-ws）
        seasonIds = years.map(y => `${y}-${wttCurrentCategory}`);
    }

    const allRecords = [];
    let foundAny = false;

    // 逐个尝试加载每个赛季文件
    for (const seasonId of seasonIds) {
        try {
            const resp = await fetch(wttGetDataPath(`score-log-${seasonId}.json`));
            if (resp.ok) {
                const data = await resp.json();
                if (Array.isArray(data) && data.length > 0) {
                    allRecords.push(...data);
                    foundAny = true;
                }
            }
        } catch (e) {
            // 该赛季文件不存在，跳过
        }
    }

    if (!foundAny) {
        throw new Error('No season files found, fall back to single file');
    }

    console.log(`WTT[${wttCurrentCategory}] 从 ${seasonIds.filter(() => true).length} 个赛季文件中加载了 ${allRecords.length} 条记录`);
    wttScoreLogData = allRecords.filter(wttIsValidRecord);
    clearFirstAppearanceCache();
}

function wttLoadInitialScores() {
    return fetch(wttGetDataPath('initial-scores.json'))
        .then(r => r.json())
        .then(d => {
            wttInitialScoresData = d;
            return true;
        })
        .catch(e => { console.error(`WTT[${wttCurrentCategory}] initial-scores 加载失败`, e); return false; });
}

function wttLoadSettings() {
    return fetch(wttGetDataPath('settings.json'))
        .then(r => r.json())
        .then(d => {
            wttSettings = d;
            // 应用自定义 baseScore（如未配置则保持默认 1300）
            if (d.baseScore && typeof d.baseScore === 'number') {
                DEFAULT_INITIAL_SCORE = d.baseScore;
            }
            console.log(`WTT[${wttCurrentCategory}] 设置加载成功, scoreMode: ${d.scoreMode || 'initial'}, baseScore: ${DEFAULT_INITIAL_SCORE}`);
            return true;
        })
        .catch(e => {
            // settings.json 不存在时使用默认值
            wttSettings = { scoreMode: 'initial', baseScore: 1300 };
            DEFAULT_INITIAL_SCORE = 1300;
            console.warn(`WTT[${wttCurrentCategory}] settings.json 未找到，使用默认设置 (scoreMode: initial, baseScore: 1300)`);
            return true;
        });
}

/**
 * 获取当前模式下的有效初始分数
 * 'initial' 模式：使用 initial-scores.json 的数据
 * 'flat1300' 模式：返回空对象，score-engine 会自动给每位球员使用 DEFAULT_INITIAL_SCORE（可在 settings.json 中配置 baseScore）
 */
function wttGetEffectiveInitialScores() {
    if (wttSettings && wttSettings.scoreMode === 'flat1300') {
        console.log(`[WTT ${wttCurrentCategory}] 🔄 使用 flat1300 模式：所有球员初始分 = ${DEFAULT_INITIAL_SCORE}`);
        return {};
    }
    const count = wttInitialScoresData && wttInitialScoresData.initialScores ? Object.keys(wttInitialScoresData.initialScores).length : 0;
    console.log(`[WTT ${wttCurrentCategory}] 📋 使用 initial-scores.json 模式：${count} 名球员有预设初始分`);
    return wttInitialScoresData ? wttInitialScoresData.initialScores : {};
}

/**
 * 获取适配 score-engine 全局变量格式的 initialScoresData 对象
 * 供需要手动切换全局变量的模块使用
 */
function wttGetInitialScoresDataForEngine() {
    const effScores = wttGetEffectiveInitialScores();
    return { initialScores: effScores, baseDate: wttInitialScoresData?.baseDate || '2020-12-31' };
}

function wttLoadEventCoefficients() {
    return fetch(wttGetDataPath('event-coefficient.json'))
        .then(r => r.json())
        .then(d => {
            wttEventCoefficients = d;
            return true;
        })
        .catch(e => { console.error(`WTT[${wttCurrentCategory}] event-coefficient 加载失败`, e); return false; });
}

function wttLoadSeasons() {
    return fetch(wttGetDataPath('seasons.json'))
        .then(r => r.json())
        .then(d => {
            wttSeasonsData = d.filter(s => s.visible !== false);
            return true;
        })
        .catch(e => { wttSeasonsData = []; return false; });
}

/**
 * 加载当前项目的全部数据
 * 返回 true/false 表示是否加载成功
 */
async function wttLoadAllData() {
    try {
        await Promise.all([
            wttLoadInitialScores(),
            wttLoadSettings(),
            wttLoadEventCoefficients(),
            wttLoadSeasons(),
            wttLoadScoreLog()
        ]);
        // flat1300 模式不需要 initialScoresData
        const isFlat = wttSettings && wttSettings.scoreMode === 'flat1300';
        if (!isFlat && !wttInitialScoresData) {
            throw new Error('initial-scores.json 加载失败');
        }
        if (!wttEventCoefficients || !wttSeasonsData) {
            throw new Error('核心数据加载失败');
        }
        return true;
    } catch (e) {
        console.error(`WTT[${wttCurrentCategory}] 数据加载失败`, e);
        return false;
    }
}

// ============ 排名计算（封装全局变量切换） ============

/**
 * 在 WTT 数据上下文中执行计算
 * 临时切换到 WTT 全局变量，执行 fn()，然后恢复
 * 支持同步和异步回调
 */
function wttWithDataContext(fn) {
    const origScoreLog = (typeof scoreLogData !== 'undefined') ? scoreLogData : undefined;
    const origInitial = (typeof initialScoresData !== 'undefined') ? initialScoresData : undefined;
    const origEvent = (typeof eventCoefficients !== 'undefined') ? eventCoefficients : undefined;
    const origSeasons = (typeof seasonsData !== 'undefined') ? seasonsData : undefined;
    const origDefaultScore = DEFAULT_INITIAL_SCORE;

    // 切换到 WTT 数据
    if (typeof scoreLogData !== 'undefined') scoreLogData = wttScoreLogData;
    // flat1300 模式：使用空的 initialScores，DEFAULT_INITIAL_SCORE 已在 wttLoadSettings 中设置
    if (typeof initialScoresData !== 'undefined') initialScoresData = wttGetInitialScoresDataForEngine();
    if (typeof eventCoefficients !== 'undefined') eventCoefficients = wttEventCoefficients;
    if (typeof seasonsData !== 'undefined') seasonsData = wttSeasonsData;

    let result;
    try {
        result = fn();
    } finally {
        // 恢复原数据（如果 fn 返回 Promise，这里恢复可能过早；异步版本见下方）
        if (!(result && typeof result.then === 'function')) {
            if (origScoreLog !== undefined) scoreLogData = origScoreLog;
            if (origInitial !== undefined) initialScoresData = origInitial;
            if (origEvent !== undefined) eventCoefficients = origEvent;
            if (origSeasons !== undefined) seasonsData = origSeasons;
            DEFAULT_INITIAL_SCORE = origDefaultScore;
        }
    }
    return result;
}

/**
 * 异步版本：在 WTT 数据上下文中执行异步计算
 */
async function wttWithDataContextAsync(fn) {
    const origScoreLog = (typeof scoreLogData !== 'undefined') ? scoreLogData : undefined;
    const origInitial = (typeof initialScoresData !== 'undefined') ? initialScoresData : undefined;
    const origEvent = (typeof eventCoefficients !== 'undefined') ? eventCoefficients : undefined;
    const origSeasons = (typeof seasonsData !== 'undefined') ? seasonsData : undefined;
    const origDefaultScore = DEFAULT_INITIAL_SCORE;

    if (typeof scoreLogData !== 'undefined') scoreLogData = wttScoreLogData;
    // flat1300 模式：使用空的 initialScores，DEFAULT_INITIAL_SCORE 已在 wttLoadSettings 中设置
    if (typeof initialScoresData !== 'undefined') initialScoresData = wttGetInitialScoresDataForEngine();
    if (typeof eventCoefficients !== 'undefined') eventCoefficients = wttEventCoefficients;
    if (typeof seasonsData !== 'undefined') seasonsData = wttSeasonsData;

    try {
        return await fn();
    } finally {
        if (origScoreLog !== undefined) scoreLogData = origScoreLog;
        if (origInitial !== undefined) initialScoresData = origInitial;
        if (origEvent !== undefined) eventCoefficients = origEvent;
        if (origSeasons !== undefined) seasonsData = origSeasons;
        DEFAULT_INITIAL_SCORE = origDefaultScore;
    }
}

/**
 * 异步分块计算 WTT 排名时间线（🔥 性能优化版）
 * 使用 score-engine.js 的 calculateAllRankingsWithSeasonsAsync
 * 每个快照 yield 到浏览器，保持 UI 流畅响应
 * @param {function} onProgress - 进度回调 (current, total, message)
 */
async function wttCalculateAllRankingsAsync(onProgress) {
    return wttWithDataContextAsync(async () => {
        const effScores = wttGetEffectiveInitialScores();
        const timeline = await calculateAllRankingsWithSeasonsAsync(
            wttScoreLogData,
            effScores,
            wttSeasonsData,
            onProgress,
            1  // 🔥 每个快照后都 yield（之前是 2，导致 UI 长时间冻结）
        );
        // 🔥 实时排名计算前先 yield 并报告进度
        if (onProgress) {
            const totalSnapshots = wttSeasonsData.reduce((sum, s) => sum + s.snapshotDates.filter(d => d > s.startDate).length, wttSeasonsData.length);
            onProgress(totalSnapshots + 1, totalSnapshots + 1, '实时积分');
        }
        await new Promise(r => setTimeout(r, 0));
        // 实时排名
        const rt = calculateRealtimeRanking();
        if (rt) timeline.push(rt);
        return timeline;
    });
}

/**
 * 同步版本（兼容旧代码调用，在支持异步的地方请用 wttCalculateAllRankingsAsync）
 */
function wttCalculateAllRankings() {
    return wttWithDataContext(() => {
        const effScores = wttGetEffectiveInitialScores();
        const timeline = calculateAllRankingsWithSeasons(
            wttScoreLogData,
            effScores,
            wttSeasonsData
        );
        const rt = calculateRealtimeRanking();
        if (rt) timeline.push(rt);
        return timeline;
    });
}

// ============ 加载状态 UI ============

/**
 * 在指定容器中显示加载动画
 * @param {string} containerId - 容器元素 ID
 * @param {string} message - 加载提示文字
 */
function wttShowLoading(containerId, message) {
    const el = document.getElementById(containerId);
    if (!el) return;
    el.innerHTML = `<div style="display:flex;flex-direction:column;align-items:center;justify-content:center;padding:60px 20px;color:var(--text-secondary);">
        <div class="wtt-spinner" style="width:40px;height:40px;border:3px solid var(--border-color);border-top-color:var(--accent-blue);border-radius:50%;animation:wttSpin 0.8s linear infinite;margin-bottom:16px;"></div>
        <p style="font-size:0.95rem;">${message || '加载数据中...'}</p>
        <p class="wtt-progress-text" style="font-size:0.8rem;margin-top:4px;color:var(--text-tertiary);"></p>
    </div>`;
}

/**
 * 更新加载进度文字
 */
function wttUpdateProgress(containerId, text) {
    const el = document.querySelector(`#${containerId} .wtt-progress-text`);
    if (el) el.textContent = text;
}

/**
 * 注入旋转动画关键帧（如果页面还没有）
 */
(function injectSpinnerStyle() {
    if (document.getElementById('wtt-spinner-style')) return;
    const style = document.createElement('style');
    style.id = 'wtt-spinner-style';
    style.textContent = '@keyframes wttSpin { to { transform: rotate(360deg); } }';
    document.head.appendChild(style);
})();

// ============ 获取当前项目信息 ============

function wttGetCategoryInfo() {
    return WTT_CATEGORIES[wttCurrentCategory] || WTT_CATEGORIES['ms'];
}

/**
 * 获取所有有数据的项目列表（用于 hub 页面判断哪些项目已就绪）
 */
async function wttCheckCategoryStatus() {
    const statuses = {};
    for (const [id, info] of Object.entries(WTT_CATEGORIES)) {
        try {
            const resp = await fetch(`wtt_data/${id}/score-log.json`);
            if (!resp.ok) { statuses[id] = 'empty'; continue; }
            const data = await resp.json();
            const realRecords = data.filter(wttIsValidRecord);
            statuses[id] = realRecords.length > 0 ? 'ready' : 'template';
        } catch (e) {
            statuses[id] = 'empty';
        }
    }
    return statuses;
}

// ============ 向后兼容的桥接函数 ============
// 保留旧函数名以确保现有代码不报错

// 注意：如果 wtt_ranking.js 已加载，它会覆盖 loadRankingData() 为异步版本（带进度条）
// 此版本作为回退：如果 wtt_ranking.js 未加载，则使用异步分块计算避免 UI 冻结
function loadRankingData() {
    return wttLoadAllData().then(async () => {
        if (typeof wttCalculateAllRankingsAsync === 'function') {
            // 使用异步分块计算（不阻塞 UI，但没有进度回调因为不知道容器）
            wttRankingTimeline = await wttCalculateAllRankingsAsync(
                wttScoreLogData,
                wttGetEffectiveInitialScores(),
                wttSeasonsData,
                null,  // 无进度回调（回退路径无法确定 DOM 容器）
                5      // 每 5 个快照 yield 一次
            );
        } else {
            wttRankingTimeline = wttCalculateAllRankings();
        }
        return wttRankingTimeline;
    });
}

// 供其他模块使用的旧函数名（回退版本，通常被 wtt_ranking.js 覆盖）
function wttLoadRankingDataLegacy() {
    return loadRankingData();
}

// ============ 初始化 ============

/**
 * 页面加载时自动检测项目并初始化
 */
wttDetectCategory();
console.log(`[WTT Common] 当前项目: ${wttCurrentCategory} (${WTT_CATEGORIES[wttCurrentCategory].name})`);

/**
 * 更新页面上的项目名称显示（Hero 标题中的 <span id="wttCatName">）
 */
function wttUpdatePageCategoryDisplay() {
    const catEl = document.getElementById('wttCatName');
    if (catEl) {
        const info = wttGetCategoryInfo();
        catEl.textContent = info.name;
        catEl.style.color = info.color;
    }
}

// 页面加载后自动更新显示
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        wttUpdatePageCategoryDisplay();
        wttPatchInternalLinks();
    });
} else {
    wttUpdatePageCategoryDisplay();
    wttPatchInternalLinks();
}

/**
 * 自动给 WTT 内部链接（wtt_*.html）追加 ?cat= 参数
 */
function wttPatchInternalLinks() {
    const cat = wttCurrentCategory;
    document.querySelectorAll('a[href]').forEach(a => {
        const href = a.getAttribute('href');
        if (!href) return;
        // 匹配 wtt_*.html 的内部链接
        if (href.match(/^wtt_\w+\.html$/)) {
            try {
                // 使用当前页面完整 URL 作为基准解析相对路径
                // 在 file:/// 和 GitHub Pages 子目录下都能正确解析
                const url = new URL(href, window.location.href);
                if (!url.searchParams.has('cat')) {
                    url.searchParams.set('cat', cat);
                    a.setAttribute('href', url.pathname + url.search);
                }
            } catch (e) {
                // file:// 等不支持 URL 解析的环境——手动拼接
                const sep = href.includes('?') ? '&' : '?';
                a.setAttribute('href', href + sep + 'cat=' + cat);
            }
        }
        // wtt_hub.html 不需要 cat 参数
    });
}
