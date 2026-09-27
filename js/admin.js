/* ========================================
   admin.js - 后台数据可视化仪表盘
   展示 WTT 各模块数据量与核心数据概览
   ======================================== */

// ========================================
// i18n 辅助（字典在 js/common.js，key 缺失时回退中文原文）
// ========================================
function aT(key, zh) {
    try {
        if (typeof i18n !== "undefined" && typeof currentLang !== "undefined" && i18n[currentLang] && i18n[currentLang][key] != null) return i18n[currentLang][key];
    } catch (e) { /* ignore */ }
    return zh;
}
function aF(tpl, vars) {
    return String(tpl == null ? "" : tpl).replace(/\{(\w+)\}/g, (m, k) => (vars && vars[k] != null ? vars[k] : m));
}
// WTT 赛事类型：走 common.js 的 WTT 映射表（EVENT_TYPE_KEY_MAP 只覆盖社团赛事，套错会回落中文）
function eventLabel(v) {
    try { if (typeof wttEventTypeLabel === "function") return wttEventTypeLabel(v); } catch (e) { /* ignore */ }
    try { if (typeof eventTypeLabel === "function") return eventTypeLabel(v); } catch (e) { /* ignore */ }
    return v;
}
// 赛季名称：社团赛季标签（如「2026年春季学期」）是数据键，经 seasonLabel() 显示层翻译
function seasonName(v) {
    try { if (typeof seasonLabel === "function") return seasonLabel(v); } catch (e) { /* ignore */ }
    return v;
}
function adminLocale() { return (typeof currentLang !== "undefined" && currentLang === "en") ? "en-US" : "zh-CN"; }
function discLabel(d) {
    const cfg = DATA_PATHS.wttDisc[d];
    if (!cfg) return d;
    return aT(cfg.labelKey, cfg.label);
}

// ========================================
// 数据文件路径配置
// ========================================
const DATA_PATHS = {
    // 核心数据
    // members / playerTags / initialScores 已退役 data/_legacy/ 扁平文件，由 players.json 派生（见 loadAllData）
    core: {
        players:      "data/players.json",
        news:         "data/news/index.json",
        competitions: "data/competitions/index.json",
        scoreLog:     "data/score-log.json",
        seasons:      "data/seasons.json",
        qa:           "data/qa/index.json",
        changelog:    "data/changelog.json",
        draws:        "data/draws.json",
        about:        "data/about.json",
        eventCoeff:   "data/event-coefficient.json",
    },
    // WTT 各分项（按年分文件存储，记录经 manifest.json 清单聚合加载，此处 path 为分项目录）
    wttDisc: {
        ms: { label:"男单 MS", labelKey:"adm_disc_ms", color:"#007bff", path:"wtt_data/ms/" },
        ws: { label:"女单 WS", labelKey:"adm_disc_ws", color:"#e83e8c", path:"wtt_data/ws/" },
        wd: { label:"女双 WD", labelKey:"adm_disc_wd", color:"#6f42c1", path:"wtt_data/wd/" },
        md: { label:"男双 MD", labelKey:"adm_disc_md", color:"#28a745", path:"wtt_data/md/" },
        xd: { label:"混双 XD", labelKey:"adm_disc_xd", color:"#fd7e14", path:"wtt_data/xd/" },
    }
};

// WTT 赛事类型颜色映射
const EVENT_COLORS = {
    "常规挑战赛":"#17a2b8",
    "球星挑战赛":"#007bff",
    "冠军赛":"#6f42c1",
    "总决赛":"#e83e8c",
    "大满贯":"#fd7e14",
    "世界杯":"#dc3545",
    "世乒赛":"#ffc107",
    "奥运会":"#28a745",
    "奥运会团体":"#20c997",
    "世乒赛团体":"#ffc107",
    "世界杯团体":"#e35d6a",
    "全运会":"#20c997",
    "洲杯赛":"#6c5ce7",
    "洲锦赛":"#a29bfe",
    "洲锦赛团体":"#a29bfe",
    "亚运会":"#8e44ad",
    "亚运会团体":"#8e44ad",
    "德甲联赛":"#e17055",
    "德甲联赛半决赛":"#e17055",
    "德甲联赛决赛":"#d63031",
    "欧冠团体":"#0984e3",
    "乒超联赛":"#00b894",
    "T联赛":"#fdcb6e",
    "全日锦":"#fd79a8",
    "ittf公开赛":"#00cec9",
    "支线赛":"#74b9ff",
};

// ========================================
// 全局状态
// ========================================
let allData = {};
let charts = [];
let lastStats = null;
let lastRenderArgs = null;   // 供 adminReapplyI18n 重绘仪表盘

// ========================================
// DOM 引用
// ========================================
const $ = (id) => document.getElementById(id);

// ========================================
// 初始化
// ========================================
document.addEventListener("DOMContentLoaded", () => {
    initTheme();
    bindEvents();
    // admin.html 里的内联脚本（待审核提交 / 记分录入）先于 common.js 执行，
    // 请求提前失败时会用中文兜底文案渲染；挂载完成后按当前语言补一次重绘
    adminReapplyI18n();
    loadAllData();
});

function initTheme() {
    // common.js 已负责主题切换与图标（本页只接管图表重绘，避免双重 toggle 抵消）
    $("themeToggle").addEventListener("click", () => {
        setTimeout(() => destroyCharts(), 100);
        setTimeout(() => renderCharts(lastStats), 200);
    });
}

function bindEvents() {
    $("refreshBtn").addEventListener("click", (e) => {
        const btn = e.currentTarget;
        if (btn.dataset.busy === "1") return;
        btn.dataset.busy = "1";
        btn.disabled = true;
        btn.querySelector("i").classList.add("spinning");
        const chips = $("heroChips");
        if (chips) chips.innerHTML = `<span class="chip"><i class="fa-solid fa-spinner fa-spin"></i>${escHtml(aT("adm_chips_reloading", "正在重新加载…"))}</span>`;
        allData = {};
        destroyCharts();
        $("dashboardContent").style.display = "none";
        $("loadingView").style.display = "";
        loadAllData().finally(() => {
            btn.dataset.busy = "0";
            btn.disabled = false;
            btn.querySelector("i").classList.remove("spinning");
        });
    });
}

// ========================================
// 数据加载
// ========================================
async function loadAllData() {
    const startTime = performance.now();

    // 并行加载所有数据
    const promises = [];

    // 核心数据
    for (const [key, path] of Object.entries(DATA_PATHS.core)) {
        promises.push(fetchJson(path).then(d => ({ key, data:d, group:"core" })).catch(() => ({ key, data:null, group:"core" })));
    }

    // WTT 分项辅助数据（seasons/initial-scores/event-coefficient，各分项目录下）
    for (const [disc, cfg] of Object.entries(DATA_PATHS.wttDisc)) {
        const baseDir = cfg.path.replace(/\/+$/, "");
        // 加载 seasons.json
        promises.push(
            fetchJson(baseDir + "/seasons.json")
                .then(d => ({ key: "disc_"+disc+"_seasons", data:d, group:"wttDiscAux", disc }))
                .catch(() => ({ key: "disc_"+disc+"_seasons", data:[], group:"wttDiscAux", disc }))
        );
        // 加载 initial-scores.json
        promises.push(
            fetchJson(baseDir + "/initial-scores.json")
                .then(d => ({ key: "disc_"+disc+"_init", data:d, group:"wttDiscAux", disc }))
                .catch(() => ({ key: "disc_"+disc+"_init", data:null, group:"wttDiscAux", disc }))
        );
        // 加载 event-coefficient.json
        promises.push(
            fetchJson(baseDir + "/event-coefficient.json")
                .then(d => ({ key: "disc_"+disc+"_coeff", data:d, group:"wttDiscAux", disc }))
                .catch(() => ({ key: "disc_"+disc+"_coeff", data:{}, group:"wttDiscAux", disc }))
        );
    }

    // WTT 分项 score-log 数据 - 优先读取 manifest.json 中的真实文件清单，回退到内置年度后缀
    // 各分项可能的年度文件后缀（manifest 缺失时的回退）
    const discYearSuffixes = {
        ms: ["2001-wtt","2002-wtt","2014-wtt","2015-wtt","2016-wtt","2017-wtt","2018-wtt","2019-wtt","2020-wtt","2021-wtt","2022-wtt","2023-wtt","2024-wtt","2025-wtt","2026-wtt"],
        ws: ["2001-ws","2002-ws","2018-ws","2019-ws","2020-ws","2021-ws","2022-ws","2023-ws","2024-ws","2025-ws","2026-ws"],
        wd: ["2002-wtt","2018-wtt","2019-wtt","2020-wtt","2021-wtt","2022-wtt","2023-wtt","2024-wtt","2025-wtt","2026-wtt"],
        md: ["2002-wtt","2018-wtt","2019-wtt","2020-wtt","2021-wtt","2022-wtt","2023-wtt","2024-wtt","2025-wtt","2026-wtt"],
        xd: ["2021-wtt","2023-wtt","2024-wtt","2025-wtt","2026-wtt"],
    };
    for (const [disc, cfg] of Object.entries(DATA_PATHS.wttDisc)) {
        // 依据 manifest.json 解析该分项真实存在的年度文件并加载；manifest 不可用时回退到内置后缀
        const baseDir = cfg.path.replace(/\/+$/, "");
        const manifestPromise = fetchJson(baseDir + "/manifest.json")
            .then(manifest => {
                const names = Array.isArray(manifest) ? manifest
                            : (manifest && Array.isArray(manifest.scoreFiles) ? manifest.scoreFiles
                            : (manifest && Array.isArray(manifest.scoreLogs) ? manifest.scoreLogs : []));
                return names.filter(n => typeof n === "string" && n.startsWith("score-log-") && n.endsWith(".json"));
            })
            .then(files => {
                const paths = (files && files.length)
                    ? files.map(name => baseDir + "/" + name)
                    : (discYearSuffixes[disc] || []).map(sfx => baseDir + "/score-log-" + sfx + ".json");
                return Promise.all(paths.map(p => fetchJson(p).catch(() => [])));
            })
            .then(arrays => ({ key:"disc_"+disc+"_yr", data: arrays.flat(), group:"wttDiscYear", disc }))
            .catch(() => ({ key:"disc_"+disc+"_yr", data: [], group:"wttDiscYear", disc }));
        promises.push(manifestPromise);
    }

    const results = await Promise.all(promises);

    // 初始化分项数据数组
    const discData = { ms:[], ws:[], wd:[], md:[], xd:[] };

    for (const r of results) {
        if (!r) continue;
        if (r.group === "wttDiscYear") {
            // 合并年度分文件
            if (Array.isArray(r.data)) {
                discData[r.disc] = discData[r.disc].concat(r.data);
            }
        } else {
            allData[r.key] = r.data;
        }
    }

    // 将合并后的分项数据存回 allData (去重)
    for (const disc of Object.keys(discData)) {
        // 去重：按 JSON 字符串去重
        const seen = new Set();
        const deduped = [];
        for (const entry of discData[disc]) {
            const key = JSON.stringify(entry);
            if (!seen.has(key)) {
                seen.add(key);
                deduped.push(entry);
            }
        }
        allData["disc_"+disc] = deduped;
    }

    // 旧版扁平文件（data/_legacy/）已退役：members / playerTags / initialScores 由 players.json 派生
    if (allData.players && Array.isArray(allData.players.players)) {
        const players = allData.players.players;
        allData.members = players.filter(p => p && p.role).map(p => ({ name: p.name, uid: p.uid, role: p.role, description: p.description, qq: p.qq }));
        const tagMap = {};
        for (const p of players) {
            if (!p || !p.name) continue;
            if ((p.tags && p.tags.length) || (p.honors && p.honors.length)) tagMap[p.name] = p.tags || [];
        }
        allData.playerTags = tagMap;
        const initScores = {};
        for (const p of players) {
            if (!p || !p.name) continue;
            const n = Number(p.initialScore);
            initScores[p.name] = Number.isFinite(n) ? n : 1300;  // 与 common.js 的 DEFAULT_INITIAL_SCORE 一致
        }
        allData.initialScores = { baseDate: allData.players.baseDate || '2026-03-01', initialScores: initScores };
    }

    const elapsed = ((performance.now() - startTime) / 1000).toFixed(1);

    // 隐藏历史版本计数（index.json 为元数据，需读各条目 history 清单）
    const hiddenVersions = await loadHiddenVersionCounts();

    // 渲染仪表盘
    renderDashboard(elapsed, hiddenVersions);

    $("loadingView").style.display = "none";
    $("dashboardContent").style.display = "";
}

async function loadHiddenVersionCounts() {
    const counts = { news: 0, competitions: 0, qa: 0 };
    const dirMap = { news: "news", competitions: "competitions", qa: "qa" };
    const jobs = [];
    for (const [key, dir] of Object.entries(dirMap)) {
        const list = allData[key] || [];
        for (const it of list) {
            if (!it || it.id == null) continue;
            const id = String(it.id);
            jobs.push(fetchJson(`data/${dir}/${encodeURIComponent(id)}/${encodeURIComponent(id)}.history.json`)
                .then(m => { if (Array.isArray(m)) counts[key] += m.filter(x => x && x.visible === false).length; })
                .catch(() => {}));
        }
    }
    await Promise.all(jobs);
    return counts;
}

async function fetchJson(path) {
    const resp = await fetch(path);
    if (!resp.ok) throw new Error("HTTP "+resp.status);
    return resp.json();
}

// 判断是否为真实数据（非模板/占位符）
function isRealEntry(r) {
    if (!r || typeof r !== "object") return false;
    const date = r["日期"];
    if (!date || date === "_template_" || String(date).startsWith("_")) return false;
    const winner = r["胜者"];
    const loser = r["负者"];
    const obj = r["对象"];
    // 跳过占位符选手名
    const isPlaceholder = (s) => s && (String(s).startsWith("_placeholder_") || String(s).startsWith("_template_"));
    if (isPlaceholder(winner) || isPlaceholder(loser) || isPlaceholder(obj)) return false;
    return true;
}

// 统计前台隐藏条目（visible === false）
function countHidden(arr) {
    if (!Array.isArray(arr)) return 0;
    return arr.filter(i => i && i.visible === false).length;
}

// 统计条目中被隐藏的历史版本快照（history[].visible === false）
function countHiddenVersions(arr) {
    if (!Array.isArray(arr)) return 0;
    let n = 0;
    arr.forEach(i => {
        if (!i || !Array.isArray(i.history)) return;
        i.history.forEach(h => { if (h && typeof h === 'object' && h.visible === false) n++; });
    });
    return n;
}

// ========================================
// 统计计算
// ========================================
function computeStats() {
    const s = {};

    // --- 核心数据统计 ---
    s.corePlayers = (allData.players && Array.isArray(allData.players.players)) ? allData.players.players.length : 0;
    s.coreMembers = Array.isArray(allData.members) ? allData.members.length : 0;
    s.coreNews = Array.isArray(allData.news) ? allData.news.length : 0;
    s.coreNewsHidden = countHidden(allData.news);
    s.coreNewsHiddenVersions = countHiddenVersions(allData.news);
    s.coreCompetitions = Array.isArray(allData.competitions) ? allData.competitions.length : 0;
    s.coreCompetitionsHidden = countHidden(allData.competitions);
    s.coreCompetitionsHiddenVersions = countHiddenVersions(allData.competitions);
    s.coreScoreLog = Array.isArray(allData.scoreLog) ? allData.scoreLog.length : 0;
    s.coreQa = Array.isArray(allData.qa) ? allData.qa.length : 0;
    s.coreQaHidden = countHidden(allData.qa);
    s.coreQaHiddenVersions = countHiddenVersions(allData.qa);
    s.coreChangelog = Array.isArray(allData.changelog) ? allData.changelog.length : 0;
    s.coreDraws = Array.isArray(allData.draws) ? allData.draws.length : 0;
    s.coreSeasons = Array.isArray(allData.seasons) ? allData.seasons.length : 0;

    // about
    s.aboutLastUpdated = (allData.about && allData.about.lastUpdated) ? allData.about.lastUpdated : "N/A";

    // player-tags 统计
    if (allData.playerTags && typeof allData.playerTags === "object") {
        // playerTags is like { "playerName": ["tag1","tag2"], ... }
        s.playerTagCount = Object.keys(allData.playerTags).length;
        const allTags = new Set();
        Object.values(allData.playerTags).forEach(tags => {
            if (Array.isArray(tags)) tags.forEach(t => allTags.add(t));
        });
        s.uniqueTags = allTags.size;
    } else {
        s.playerTagCount = 0;
        s.uniqueTags = 0;
    }

    // initial-scores 统计（由 players.json 派生，见 loadAllData）
    if (allData.initialScores && allData.initialScores.initialScores && typeof allData.initialScores.initialScores === "object") {
        s.coreInitPlayers = Object.keys(allData.initialScores.initialScores).length;
    } else {
        s.coreInitPlayers = 0;
    }

    // event-coefficient 统计（仅统计数值型键，排除「赛制系数」「默认赛制」等保留键）
    if (allData.eventCoeff && typeof allData.eventCoeff === "object") {
        s.coreEventTypes = Object.keys(allData.eventCoeff).filter(function (k) { return typeof allData.eventCoeff[k] === "number"; }).length;
    } else {
        s.coreEventTypes = 0;
    }

    // --- WTT 主数据统计（从各分项聚合计算，不再依赖旧版扁平文件）---
    const discKeys = ["ms","ws","wd","md","xd"];

    // WTT 赛季数（聚合各分项的可见赛季，去重）
    const allWttSeasons = new Map();
    s.wttSeasonsPerDisc = {};
    for (const disc of discKeys) {
        const seasonsData = allData["disc_"+disc+"_seasons"];
        if (Array.isArray(seasonsData)) {
            seasonsData.forEach(s => {
                if (s && s.id && !allWttSeasons.has(s.id)) {
                    allWttSeasons.set(s.id, s);
                }
            });
        }
        s.wttSeasonsPerDisc[disc] = Array.isArray(seasonsData) ? seasonsData : [];
    }
    s.wttSeasons = allWttSeasons.size;
    // 保存聚合后的赛季列表供渲染使用
    s.wttSeasonsList = Array.from(allWttSeasons.values());

    // WTT 选手数（聚合各分项 initial-scores 中的不重复选手）
    const allWttPlayers = new Set();
    for (const disc of discKeys) {
        const initData = allData["disc_"+disc+"_init"];
        if (initData && initData.initialScores && typeof initData.initialScores === "object") {
            Object.keys(initData.initialScores).forEach(p => allWttPlayers.add(p));
        }
    }
    s.wttPlayers = allWttPlayers.size;

    // WTT 赛事类型数（聚合各分项 event-coefficient 中的不重复赛事类型）
    const allWttEventTypes = new Set();
    for (const disc of discKeys) {
        const coeffData = allData["disc_"+disc+"_coeff"];
        if (coeffData && typeof coeffData === "object") {
            Object.keys(coeffData).forEach(t => allWttEventTypes.add(t));
        }
    }
    s.wttEventTypes = allWttEventTypes.size;

    // WTT score log 统计（从各分项聚合）
    // 日期范围与独特选手
    s.wttDateFrom = "N/A";
    s.wttDateTo = "N/A";
    s.wttUniquePlayers = 0;
    s.wttByEvent = {};
    const allDiscDates = [];
    const allDiscPlayers = new Set();
    for (const disc of discKeys) {
        const data = allData["disc_"+disc];
        if (Array.isArray(data)) {
            const realEntries = data.filter(isRealEntry);
            realEntries.forEach(r => {
                if (r["日期"]) allDiscDates.push(r["日期"]);
                if (r["胜者"]) allDiscPlayers.add(r["胜者"]);
                if (r["负者"]) allDiscPlayers.add(r["负者"]);
                const t = r["类型"] || "未知";
                s.wttByEvent[t] = (s.wttByEvent[t] || 0) + 1;
            });
        }
    }
    if (allDiscDates.length > 0) {
        allDiscDates.sort();
        s.wttDateFrom = allDiscDates[0];
        s.wttDateTo = allDiscDates[allDiscDates.length - 1];
        s.wttUniquePlayers = allDiscPlayers.size;
    }

    // --- WTT 各分项统计 ---
    s.wttDiscStats = {};
    for (const disc of discKeys) {
        const dataKey = "disc_"+disc;
        const data = allData[dataKey];
        const rawEntries = Array.isArray(data) ? data.length : 0;
        const realEntries = Array.isArray(data) ? data.filter(isRealEntry) : [];
        const entries = realEntries.length;

        let uniquePlayers = 0;
        let dateFrom = "N/A";
        let dateTo = "N/A";
        let byEvent = {};

        if (realEntries.length > 0) {
            const dates = realEntries.map(r => r["日期"]).filter(Boolean).sort();
            dateFrom = dates[0] || "N/A";
            dateTo = dates[dates.length-1] || "N/A";
            const players = new Set();
            realEntries.forEach(r => {
                if (r["胜者"]) players.add(r["胜者"]);
                if (r["负者"]) players.add(r["负者"]);
            });
            uniquePlayers = players.size;
            realEntries.forEach(r => {
                const t = r["类型"] || "未知";
                byEvent[t] = (byEvent[t] || 0) + 1;
            });
        }

        s.wttDiscStats[disc] = {
            entries,
            rawEntries,
            uniquePlayers,
            dateFrom,
            dateTo,
            byEvent,
        };
    }

    // 总分项总记录数（即全部 WTT 比赛记录总数）
    s.wttDiscTotal = discKeys.reduce((sum, d) => sum + s.wttDiscStats[d].entries, 0);

    // --- 全部 WTT 数据总计（各分项合计即为总数，不再与旧版主表重复计算）---
    s.wttGrandTotal = s.wttDiscTotal;

    // --- 年度 × 分项 记录矩阵（用于历年趋势图）---
    s.wttYearly = {};
    s.wttYears = [];
    const yearly = {};

    // --- 选手出场统计（胜+负，跨分项聚合，用于 TOP 榜）---
    const playerMap = new Map();
    for (const disc of discKeys) {
        const data = allData["disc_" + disc];
        if (!Array.isArray(data)) continue;
        for (const r of data) {
            if (!isRealEntry(r)) continue;
            const dt = r["日期"];
            if (typeof dt === "string" && /^\d{4}/.test(dt)) {
                const y = dt.slice(0, 4);
                if (!yearly[y]) yearly[y] = { ms:0, ws:0, wd:0, md:0, xd:0 };
                yearly[y][disc]++;
            }
            const w = r["胜者"], l = r["负者"];
            if (w) {
                let o = playerMap.get(w);
                if (!o) { o = { name:w, wins:0, losses:0 }; playerMap.set(w, o); }
                o.wins++;
            }
            if (l) {
                let o = playerMap.get(l);
                if (!o) { o = { name:l, wins:0, losses:0 }; playerMap.set(l, o); }
                o.losses++;
            }
        }
    }
    s.wttYears = Object.keys(yearly).sort();
    s.wttYearly = yearly;
    s.wttTopPlayers = Array.from(playerMap.values())
        .map(o => ({ name:o.name, wins:o.wins, losses:o.losses, total:o.wins + o.losses }))
        .sort((a, b) => b.total - a.total)
        .slice(0, 10);

    return s;
}

// ========================================
// 仪表盘渲染
// ========================================
const DISC_KEYS = ["ms", "ws", "wd", "md", "xd"];

function renderDashboard(loadTime, hiddenVersions) {
    const stats = computeStats();
    lastStats = stats;
    lastRenderArgs = { loadTime, hiddenVersions };
    if (hiddenVersions) {
        stats.coreNewsHiddenVersions = hiddenVersions.news;
        stats.coreCompetitionsHiddenVersions = hiddenVersions.competitions;
        stats.coreQaHiddenVersions = hiddenVersions.qa;
    }
    const container = $("dashboardContent");
    container.innerHTML = "";

    // ========== 页头元信息 chips（标题与操作按钮为静态页头）==========
    updateHeroChips(loadTime, stats);

    // ========== 第一部分：KPI 概览卡片 ==========
    container.appendChild(secTitle("fa-solid fa-gauge-high", aT("adm_sec_overview", "数据总览")));

    const hiddenSuffix = n => n ? aF(aT("adm_hidden_suffix", "(隐藏{n})"), { n }) : "";
    const overviewCards = [
        { icon:"fa-solid fa-table-list", label:aT("adm_kpi_wtt_records", "WTT 比赛记录"), value:stats.wttGrandTotal, sub:aT("adm_kpi_wtt_records_sub", "五单项合计"), cls:"accent-blue" },
        { icon:"fa-solid fa-users", label:aT("adm_kpi_wtt_players", "WTT 选手总数"), value:stats.wttPlayers, sub:aT("adm_kpi_wtt_players_sub", "初始积分在册选手"), cls:"accent-purple" },
        { icon:"fa-solid fa-calendar-days", label:aT("adm_kpi_wtt_seasons", "WTT 赛季数"), value:stats.wttSeasons, sub:aT("adm_kpi_wtt_seasons_sub", "赛季管理"), cls:"accent-green" },
        { icon:"fa-solid fa-ranking-star", label:aT("adm_kpi_wtt_events", "WTT 赛事类型"), value:stats.wttEventTypes, sub:aT("adm_kpi_wtt_events_sub", "不同级别赛事"), cls:"accent-warning" },
        { icon:"fa-solid fa-id-card", label:aT("adm_kpi_players", "球员档案"), value:stats.corePlayers, sub:aT("adm_kpi_players_sub", "统一球员数据"), cls:"accent-info" },
        { icon:"fa-solid fa-newspaper", label:aT("adm_kpi_news_comp", "新闻 / 赛事"), value:(stats.coreNews + stats.coreCompetitions),
          sub:aF(aT("adm_kpi_news_comp_sub", "新闻 {n}{nh} · 赛事 {m}{mh}"), { n: stats.coreNews, nh: hiddenSuffix(stats.coreNewsHidden), m: stats.coreCompetitions, mh: hiddenSuffix(stats.coreCompetitionsHidden) }), cls:"accent-danger" },
    ];
    container.appendChild(createKpiRow(overviewCards));

    // ========== 第二部分：WTT 分项卡片（含占比条）==========
    container.appendChild(secTitle("fa-solid fa-layer-group", aT("adm_sec_disc", "WTT 五项模块数据量"),
        null, aF(aT("adm_total_records", "共 {n} 条记录"), { n: stats.wttDiscTotal.toLocaleString(adminLocale()) })));

    const discGrid = document.createElement("div");
    discGrid.className = "disc-grid";
    for (const disc of DISC_KEYS) {
        const cfg = DATA_PATHS.wttDisc[disc];
        const st = stats.wttDiscStats[disc];
        const hasRealData = st.entries > 0;
        const share = stats.wttDiscTotal > 0 ? (st.entries / stats.wttDiscTotal) * 100 : 0;
        const templateNote = (!hasRealData && st.rawEntries > 0)
            ? `<div class="disc-warn"><i class="fa-solid fa-triangle-exclamation"></i> ${escHtml(aT("adm_disc_template", "仅有模板数据"))}</div>` : "";
        const card = document.createElement("div");
        card.className = "disc-card fade-in" + (hasRealData ? "" : " is-empty");
        card.style.setProperty("--dc", cfg.color);
        card.innerHTML = `
            <div class="disc-head">
                <div class="disc-glyph">${disc.toUpperCase()}</div>
                <div class="disc-name">${escHtml(discLabel(disc))}
                    <small>${hasRealData ? escHtml(st.dateFrom) + " ~ " + escHtml(st.dateTo) : escHtml(aT("adm_disc_no_real", "暂无真实数据"))}</small>
                </div>
            </div>
            <div class="disc-main-val"><b data-count="${st.entries}">${st.entries.toLocaleString(adminLocale())}</b><span>${escHtml(aT("adm_unit_matches", "比赛记录"))}</span></div>
            <div class="disc-meta-row"><span>${escHtml(aT("adm_unique_players", "独特选手"))} <b>${st.uniquePlayers}</b></span><span>${escHtml(aT("adm_share_of_total", "占全部记录"))} <b>${share.toFixed(1)}%</b></span></div>
            <div class="disc-share-track"><div class="disc-share-fill" data-w="${share.toFixed(1)}"></div></div>
            ${templateNote}
        `;
        discGrid.appendChild(card);
    }
    container.appendChild(discGrid);

    // ========== 第三部分：可视化图表 ==========
    container.appendChild(secTitle("fa-solid fa-chart-line", aT("adm_sec_charts", "WTT 数据分布")));

    // 历年趋势（通栏）
    const trendPanel = document.createElement("div");
    trendPanel.className = "panel fade-in";
    trendPanel.style.marginBottom = "18px";
    trendPanel.innerHTML = `
        <div class="panel-header">
            <span class="panel-title"><i class="fa-solid fa-chart-column"></i> ${escHtml(aT("adm_chart_trend", "历年比赛记录趋势（按分项堆叠）"))}</span>
            <span class="panel-note">${stats.wttYears.length ? stats.wttYears[0] + " – " + stats.wttYears[stats.wttYears.length-1] : ""}</span>
        </div>
        <div class="panel-pad"><div class="chart-box tall"><canvas id="chartTrend"></canvas></div></div>`;
    container.appendChild(trendPanel);

    // 分项对比 + 赛事类型占比
    const chartsGrid = document.createElement("div");
    chartsGrid.className = "grid grid-2";
    const box1 = document.createElement("div");
    box1.className = "panel fade-in";
    box1.innerHTML = `
        <div class="panel-header">
            <span class="panel-title"><i class="fa-solid fa-chart-simple"></i> ${escHtml(aT("adm_chart_disc", "五单项比赛记录数"))}</span>
            <span class="panel-note">${escHtml(aT("adm_note_unit", "条"))}</span>
        </div>
        <div class="panel-pad"><div class="chart-box"><canvas id="chartDiscBar"></canvas></div></div>`;
    const box2 = document.createElement("div");
    box2.className = "panel fade-in";
    box2.innerHTML = `
        <div class="panel-header">
            <span class="panel-title"><i class="fa-solid fa-chart-pie"></i> ${escHtml(aT("adm_chart_pie", "赛事类型占比（全部分项）"))}</span>
        </div>
        <div class="panel-pad"><div class="chart-box"><canvas id="chartEventPie"></canvas></div></div>`;
    chartsGrid.appendChild(box1);
    chartsGrid.appendChild(box2);
    container.appendChild(chartsGrid);

    // ========== 第四部分：TOP 选手 + 赛事类型明细 ==========
    container.appendChild(secTitle("fa-solid fa-list-check", aT("adm_sec_records", "记录构成与活跃选手")));

    const detailGrid = document.createElement("div");
    detailGrid.className = "grid grid-detail";

    // TOP 选手面板
    const rankPanel = document.createElement("div");
    rankPanel.className = "panel fade-in";
    let rankRows = "";
    if (stats.wttTopPlayers.length > 0) {
        const maxVal = stats.wttTopPlayers[0].total || 1;
        stats.wttTopPlayers.forEach((p, i) => {
            const pct = ((p.total / maxVal) * 100).toFixed(1);
            rankRows += `
                <div class="rank-row">
                    <div class="rank-no r${i+1}">${i+1}</div>
                    <div class="rank-body">
                        <div class="rank-name">${escHtml(p.name)}</div>
                        <div class="rank-track"><div class="rank-fill" style="width:${pct}%"></div></div>
                        <div class="rank-sub">${escHtml(aF(aT("adm_rank_wl", "胜 {w} · 负 {l}"), { w: p.wins.toLocaleString(adminLocale()), l: p.losses.toLocaleString(adminLocale()) }))}</div>
                    </div>
                    <div class="rank-val">${p.total.toLocaleString(adminLocale())}</div>
                </div>`;
        });
    } else {
        rankRows = `<tr><td colspan="3" class="empty-cell">${escHtml(aT("data_viz_no_data", "暂无数据"))}</td></tr>`;
    }
    rankPanel.innerHTML = `
        <div class="panel-header">
            <span class="panel-title"><i class="fa-solid fa-fire"></i> ${escHtml(aF(aT("adm_top_players", "最活跃选手 TOP {n}"), { n: Math.max(stats.wttTopPlayers.length, 1) }))}</span>
            <span class="panel-note">${escHtml(aT("adm_top_note", "按出场场次（胜+负）"))}</span>
        </div>
        <div class="panel-pad">${rankRows.startsWith("<tr") ? `<table class="tbl"><tbody>${rankRows}</tbody></table>` : rankRows}</div>`;
    detailGrid.appendChild(rankPanel);

    // 赛事类型分布表
    const eventPanel = document.createElement("div");
    eventPanel.className = "panel fade-in";
    const eventTypes = Object.entries(stats.wttByEvent).sort((a,b) => b[1] - a[1]);
    const maxEvent = eventTypes.length ? eventTypes[0][1] : 1;
    let eventRows = "";
    eventTypes.forEach(([type, count], i) => {
        const color = EVENT_COLORS[type] || "#8a97ab";
        const pct = stats.wttDiscTotal > 0 ? ((count / stats.wttDiscTotal) * 100).toFixed(1) : "0";
        const barPct = ((count / maxEvent) * 100).toFixed(1);
        eventRows += `<tr>
            <td class="muted mono">${i+1}</td>
            <td><span class="dot" style="background:${color};"></span>${escHtml(eventLabel(type))}</td>
            <td class="num-cell">${count.toLocaleString(adminLocale())}</td>
            <td class="num-cell">${pct}%</td>
            <td style="width:150px;"><div class="mini-bar"><div class="mini-bar-fill" style="width:${barPct}%;background:${color};"></div></div></td>
        </tr>`;
    });
    eventPanel.innerHTML = `
        <div class="panel-header">
            <span class="panel-title"><i class="fa-solid fa-table"></i> ${escHtml(aT("adm_event_detail", "赛事类型明细"))}</span>
            <span class="panel-note">${escHtml(aF(aT("adm_event_total", "总计 {n} 条"), { n: stats.wttDiscTotal.toLocaleString(adminLocale()) }))}</span>
        </div>
        <div class="table-wrap">
            <table class="tbl">
                <thead><tr><th style="width:44px;">#</th><th>${escHtml(aT("adm_th_event", "赛事类型"))}</th><th style="text-align:right;width:90px;">${escHtml(aT("adm_th_records", "记录数"))}</th><th style="text-align:right;width:80px;">${escHtml(aT("adm_th_share", "占比"))}</th><th style="width:150px;">${escHtml(aT("adm_th_dist", "分布"))}</th></tr></thead>
                <tbody>${eventRows || `<tr><td colspan="5" class="empty-cell">${escHtml(aT("data_viz_no_data", "暂无数据"))}</td></tr>`}</tbody>
            </table>
        </div>`;
    detailGrid.appendChild(eventPanel);
    container.appendChild(detailGrid);

    // ========== 第五部分：核心数据文件明细（卡片墙）==========
    const warnPill = txt => `<span class="pill pill-warn">${escHtml(txt)}</span>`;
    const derivedSuffix = aT("adm_derived", "（派生）");
    const CORE_FILES = [
        { name:"players.json", icon:"fa-id-card", count:stats.corePlayers, unit:aT("adm_unit_player_profiles", "位球员档案"), cls:"f-blue" },
        { name:"members" + derivedSuffix, icon:"fa-users", count:stats.coreMembers, unit:aT("adm_unit_members", "位成员"), cls:"f-green" },
        { name:"news/", icon:"fa-newspaper", count:stats.coreNews, unit:aT("adm_unit_news", "篇新闻"), cls:"f-danger",
          warn:(stats.coreNewsHidden ? warnPill(aF(aT("adm_pill_hidden", "隐藏 {n}"), { n: stats.coreNewsHidden })) : "") + (stats.coreNewsHiddenVersions ? warnPill(aF(aT("adm_pill_hidden_versions", "隐藏版本 {n}"), { n: stats.coreNewsHiddenVersions })) : "") },
        { name:"competitions/", icon:"fa-trophy", count:stats.coreCompetitions, unit:aT("adm_unit_competitions", "场赛事"), cls:"f-purple",
          warn:(stats.coreCompetitionsHidden ? warnPill(aF(aT("adm_pill_hidden", "隐藏 {n}"), { n: stats.coreCompetitionsHidden })) : "") + (stats.coreCompetitionsHiddenVersions ? warnPill(aF(aT("adm_pill_hidden_versions", "隐藏版本 {n}"), { n: stats.coreCompetitionsHiddenVersions })) : "") },
        { name:"score-log.json", icon:"fa-table-list", count:stats.coreScoreLog, unit:aT("adm_unit_match_records", "条比赛记录"), cls:"f-info" },
        { name:"seasons.json", icon:"fa-calendar-days", count:stats.coreSeasons, unit:aT("adm_unit_seasons", "个赛季"), cls:"f-green" },
        { name:"qa/", icon:"fa-circle-question", count:stats.coreQa, unit:aT("adm_unit_qa", "条问答"), cls:"f-info",
          warn:(stats.coreQaHidden ? warnPill(aF(aT("adm_pill_hidden", "隐藏 {n}"), { n: stats.coreQaHidden })) : "") + (stats.coreQaHiddenVersions ? warnPill(aF(aT("adm_pill_hidden_versions", "隐藏版本 {n}"), { n: stats.coreQaHiddenVersions })) : "") },
        { name:"changelog.json", icon:"fa-clock-rotate-left", count:stats.coreChangelog, unit:aT("adm_unit_changelog", "条更新日志"), cls:"f-green" },
        { name:"draws.json", icon:"fa-diagram-project", count:stats.coreDraws, unit:aT("adm_unit_draws", "张对阵表"), cls:"f-purple" },
        { name:"initial-scores" + derivedSuffix, icon:"fa-chart-simple", count:stats.coreInitPlayers, unit:aT("adm_unit_players", "位球员"), cls:"f-warning" },
        { name:"event-coefficient.json", icon:"fa-weight-scale", count:stats.coreEventTypes, unit:aT("adm_unit_event_types", "种赛事类型"), cls:"f-warning" },
        { name:"player-tags" + derivedSuffix, icon:"fa-tags", count:stats.playerTagCount, unit:aF(aT("adm_unit_tags", "位球员 · {n} 种标签"), { n: stats.uniqueTags }), cls:"f-purple" },
        { name:"about.json", icon:"fa-circle-info", count:stats.aboutLastUpdated, unit:aT("adm_unit_updated", "最近更新"), cls:"f-blue" },
    ];

    container.appendChild(secTitle("fa-solid fa-database", aT("adm_sec_files", "核心数据文件明细"),
        null, aF(aT("adm_files_sub", "data/ 目录 · {n} 个文件"), { n: CORE_FILES.length })));

    const maxCount = Math.max(...CORE_FILES.filter(f => typeof f.count === "number").map(f => f.count), 1);
    const totalCount = CORE_FILES.reduce((a, f) => a + (typeof f.count === "number" ? f.count : 0), 0);

    const fileGrid = document.createElement("div");
    fileGrid.className = "file-grid";
    fileGrid.innerHTML = CORE_FILES.map((f, i) => {
        const isNum = typeof f.count === "number";
        const relPct = isNum ? Math.max((f.count / maxCount) * 100, 2) : 0;
        const sharePct = isNum && totalCount > 0 ? ((f.count / totalCount) * 100).toFixed(1) : "";
        return `
        <div class="file-card fade-in ${f.cls}" style="animation-delay:${Math.min(i * 40, 320)}ms">
            <div class="file-head">
                <span class="file-icon"><i class="fa-solid ${f.icon}"></i></span>
                <span class="file-name">${escHtml(f.name)}</span>
            </div>
            <div class="file-val">${isNum ? f.count.toLocaleString(adminLocale()) : `<span class="file-date">${escHtml(String(f.count))}</span>`}<span class="file-unit">${escHtml(f.unit)}</span></div>
            ${isNum ? `<div class="mini-bar"><div class="mini-bar-fill" style="width:${relPct.toFixed(1)}%;background:var(--fc);"></div></div>
            <div class="file-foot"><span>${escHtml(aF(aT("adm_share_total", "占核心总量 {p}%"), { p: sharePct }))}</span><span>${f.warn || ""}</span></div>`
            : `<div class="file-foot"><span>${escHtml(aT("adm_meta_file", "元数据文件"))}</span><span>${f.warn || ""}</span></div>`}
        </div>`;
    }).join("");
    container.appendChild(fileGrid);

    // ========== 第六部分：赛季管理概览 ==========
    container.appendChild(secTitle("fa-solid fa-calendar-days", aT("adm_sec_seasons", "赛季管理概览")));

    const seasonsGrid = document.createElement("div");
    seasonsGrid.className = "grid grid-2";

    // WTT 赛季 - 按分项分组展示
    const wttSeasonPanel = document.createElement("div");
    wttSeasonPanel.className = "panel fade-in";
    let wttSeasonBodyHtml = "";
    for (const disc of DISC_KEYS) {
        const cfg = DATA_PATHS.wttDisc[disc];
        const discSeasons = stats.wttSeasonsPerDisc[disc] || [];
        let discRows = "";
        discSeasons.forEach(s => {
            discRows += `<tr>
                <td><span class="mono">${escHtml(s.id||"")}</span></td>
                <td>${escHtml(seasonName(s.label||""))}</td>
                <td class="mono muted">${escHtml(s.startDate||"")} ~ ${escHtml(s.endDate||"")}</td>
                <td>${visPill(s.visible)}</td>
            </tr>`;
        });
        wttSeasonBodyHtml += `<tr class="tbl-group">
            <td colspan="4" style="color:${cfg.color};">
                <i class="fa-solid fa-table-tennis-paddle-ball"></i> ${escHtml(discLabel(disc))}
                <span style="font-weight:400;color:var(--dash-text-muted);font-size:0.7rem;margin-left:6px;">${escHtml(aF(aT("adm_seasons_count", "{n} 个赛季"), { n: discSeasons.length }))}</span>
            </td>
        </tr>`;
        wttSeasonBodyHtml += discRows || `<tr><td colspan="4" class="empty-cell">${escHtml(aT("data_viz_no_data", "暂无数据"))}</td></tr>`;
    }
    wttSeasonPanel.innerHTML = `
        <div class="panel-header">
            <span class="panel-title"><i class="fa-solid fa-globe"></i> ${escHtml(aT("adm_wtt_seasons_panel", "WTT 赛季（按分项）"))}</span>
            <span class="panel-note">${escHtml(aF(aT("adm_seasons_count", "{n} 个赛季"), { n: stats.wttSeasons }))}</span>
        </div>
        <div class="table-wrap">
            <table class="tbl">
                <thead><tr><th>ID</th><th>${escHtml(aT("adm_th_name", "名称"))}</th><th>${escHtml(aT("adm_th_dates", "日期范围"))}</th><th style="width:88px;">${escHtml(aT("adm_th_status", "状态"))}</th></tr></thead>
                <tbody>${wttSeasonBodyHtml || `<tr><td colspan="4" class="empty-cell">${escHtml(aT("data_viz_no_data", "暂无数据"))}</td></tr>`}</tbody>
            </table>
        </div>`;
    seasonsGrid.appendChild(wttSeasonPanel);

    // 社团赛季
    const coreSeasonPanel = document.createElement("div");
    coreSeasonPanel.className = "panel fade-in";
    let coreSeasonRows = "";
    if (Array.isArray(allData.seasons)) {
        allData.seasons.forEach(s => {
            coreSeasonRows += `<tr>
                <td><span class="mono">${escHtml(s.id||"")}</span></td>
                <td>${escHtml(seasonName(s.label||""))}</td>
                <td class="mono muted">${escHtml(s.startDate||"")} ~ ${escHtml(s.endDate||"")}</td>
                <td>${visPill(s.visible)}</td>
            </tr>`;
        });
    }
    coreSeasonPanel.innerHTML = `
        <div class="panel-header">
            <span class="panel-title"><i class="fa-solid fa-school"></i> ${escHtml(aT("adm_core_seasons_panel", "社团赛季"))}</span>
            <span class="panel-note">${escHtml(aF(aT("adm_seasons_count", "{n} 个赛季"), { n: stats.coreSeasons }))}</span>
        </div>
        <div class="table-wrap">
            <table class="tbl">
                <thead><tr><th>ID</th><th>${escHtml(aT("adm_th_name", "名称"))}</th><th>${escHtml(aT("adm_th_dates", "日期范围"))}</th><th style="width:88px;">${escHtml(aT("adm_th_status", "状态"))}</th></tr></thead>
                <tbody>${coreSeasonRows || `<tr><td colspan="4" class="empty-cell">${escHtml(aT("data_viz_no_data", "暂无数据"))}</td></tr>`}</tbody>
            </table>
        </div>`;
    seasonsGrid.appendChild(coreSeasonPanel);
    container.appendChild(seasonsGrid);

    // ========== 入场动画 & 图表 ==========
    requestAnimationFrame(() => {
        animateCountUps(container);
        growShareBars(container);
        renderCharts(stats);
    });
}

// ---------- 渲染辅助 ----------
function updateHeroChips(loadTime, stats) {
    const box = $("heroChips");
    if (!box) return;
    box.innerHTML = `
        <span class="chip"><i class="fa-solid fa-bolt"></i>${escHtml(aF(aT("adm_chip_load", "加载耗时 {t}s"), { t: String(loadTime) }))}</span>
        <span class="chip"><i class="fa-regular fa-clock"></i>${escHtml(new Date().toLocaleString(adminLocale()))}</span>
        <span class="chip"><i class="fa-solid fa-calendar-days"></i>${escHtml(stats.wttDateFrom)} ~ ${escHtml(stats.wttDateTo)}</span>
        <span class="chip"><i class="fa-solid fa-database"></i>${escHtml(aF(aT("adm_chip_records", "WTT 记录 {n} 条"), { n: stats.wttGrandTotal.toLocaleString(adminLocale()) }))}</span>`;
}

function secTitle(iconClass, text, badge, sub) {
    const div = document.createElement("div");
    div.className = "sec-title";
    div.innerHTML = `<i class="${iconClass}" style="color:var(--primary-blue);font-size:0.95rem;"></i>${escHtml(text)}`;
    if (badge) {
        const b = document.createElement("span");
        b.className = "badge";
        b.textContent = badge;
        div.appendChild(b);
    }
    if (sub) {
        const s = document.createElement("span");
        s.className = "sec-sub";
        s.textContent = sub;
        div.appendChild(s);
    }
    return div;
}

function createKpiRow(cards) {
    const row = document.createElement("div");
    row.className = "kpi-grid";
    cards.forEach(c => {
        const card = document.createElement("div");
        card.className = "kpi-card " + c.cls;
        card.innerHTML = `
            <div class="kpi-top">
                <div class="kpi-icon"><i class="${c.icon}"></i></div>
            </div>
            <div class="kpi-label">${escHtml(c.label)}</div>
            <div class="kpi-value" data-target="${typeof c.value === "number" ? c.value : ""}">${typeof c.value === "number" ? c.value.toLocaleString() : escHtml(c.value)}</div>
            <div class="kpi-sub"><i class="fa-solid fa-angle-right"></i>${c.sub}</div>
        `;
        row.appendChild(card);
    });
    return row;
}

// 数字滚动动画
function animateCountUps(root) {
    const reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    root.querySelectorAll(".kpi-value[data-target]").forEach(el => {
        const target = parseFloat(el.dataset.target);
        if (!isFinite(target)) return;
        if (reduce) { el.textContent = target.toLocaleString(); return; }
        const dur = 900;
        const t0 = performance.now();
        const step = now => {
            const p = Math.min((now - t0) / dur, 1);
            const eased = 1 - Math.pow(1 - p, 3);
            el.textContent = Math.round(target * eased).toLocaleString();
            if (p < 1) requestAnimationFrame(step);
            else el.textContent = target.toLocaleString();
        };
        el.textContent = "0";
        requestAnimationFrame(step);
    });
}

// 分项占比条入场动画
function growShareBars(root) {
    requestAnimationFrame(() => {
        root.querySelectorAll(".disc-share-fill[data-w]").forEach(bar => {
            bar.style.width = bar.dataset.w + "%";
        });
    });
}

// 可见性状态 pill
function visPill(visible) {
    return visible
        ? `<span class="pill pill-on"><i class="fa-solid fa-eye"></i>${escHtml(aT("adm_vis_on", "可见"))}</span>`
        : `<span class="pill pill-off"><i class="fa-solid fa-eye-slash"></i>${escHtml(aT("adm_vis_off", "隐藏"))}</span>`;
}

// ========================================
// 图表渲染
// ========================================
function chartTheme() {
    const isDark = document.documentElement.classList.contains("dark-mode");
    return {
        isDark,
        tick: isDark ? "#aab3c5" : "#48566d",
        muted: isDark ? "#67718a" : "#8a97ab",
        grid: isDark ? "#262e41" : "#e9eef5",
        tooltipBg: isDark ? "#1f2534" : "#ffffff",
        tooltipText: isDark ? "#e6e9f2" : "#16213a",
        tooltipBorder: isDark ? "#262e41" : "#e5eaf1",
    };
}

function baseTooltip(t) {
    return {
        backgroundColor: t.tooltipBg,
        titleColor: t.tooltipText,
        bodyColor: t.tooltipText,
        borderColor: t.tooltipBorder,
        borderWidth: 1,
        padding: 10,
        cornerRadius: 10,
        displayColors: true,
        boxPadding: 4,
        titleFont: { family:"'Noto Sans SC',sans-serif", weight:"600" },
        bodyFont: { family:"'JetBrains Mono','Noto Sans SC',monospace", size:11 },
    };
}

function renderCharts(statsOverride) {
    const stats = statsOverride || computeStats();
    if (!stats) return;
    destroyCharts();
    if (typeof Chart === "undefined") return;

    const t = chartTheme();

    // --- 图表1: 历年趋势（按分项堆叠柱状图）---
    const ctxTrend = document.getElementById("chartTrend");
    if (ctxTrend && stats.wttYears.length > 0) {
        const datasets = DISC_KEYS.map(d => ({
            label: discLabel(d),
            data: stats.wttYears.map(y => (stats.wttYearly[y] || {})[d] || 0),
            backgroundColor: DATA_PATHS.wttDisc[d].color + "d0",
            hoverBackgroundColor: DATA_PATHS.wttDisc[d].color,
            stack: "wtt",
            borderRadius: 3,
            maxBarThickness: 36,
            borderSkipped: false,
        }));
        charts.push(new Chart(ctxTrend, {
            type: "bar",
            data: { labels: stats.wttYears, datasets },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                interaction: { mode: "index", intersect: false },
                animation: { duration: 800, easing: "easeOutQuart" },
                plugins: {
                    legend: {
                        position: "bottom",
                        labels: {
                            color: t.tick, usePointStyle: true, pointStyle: "circle",
                            boxWidth: 7, boxHeight: 7, padding: 16,
                            font: { size: 11, family: "'Noto Sans SC',sans-serif" }
                        }
                    },
                    tooltip: Object.assign(baseTooltip(t), {
                        callbacks: {
                            label: c => aF(aT("adm_tip_records", "{l}: {v} 条"), { l: c.dataset.label, v: c.raw.toLocaleString(adminLocale()) }),
                            footer: items => aF(aT("adm_tip_total", "合计 {n} 条"), { n: items.reduce((a, b) => a + b.raw, 0).toLocaleString(adminLocale()) })
                        },
                        footerColor: t.muted,
                    })
                },
                scales: {
                    x: {
                        stacked: true,
                        ticks: { color: t.tick, font: { family:"'JetBrains Mono',monospace", size:10 }, maxRotation: 60, autoSkip: true },
                        grid: { display: false }
                    },
                    y: {
                        stacked: true,
                        beginAtZero: true,
                        grace: "4%",
                        ticks: { color: t.tick, font: { family:"'JetBrains Mono',monospace", size:10 } },
                        grid: { color: t.grid }
                    }
                }
            }
        }));
    }

    // --- 图表2: 五单项对比柱状图 ---
    const ctx1 = document.getElementById("chartDiscBar");
    if (ctx1) {
        const discData = DISC_KEYS.map(d => stats.wttDiscStats[d].entries);
        const discColors = DISC_KEYS.map(d => DATA_PATHS.wttDisc[d].color);
        charts.push(new Chart(ctx1, {
            type: "bar",
            data: {
                labels: DISC_KEYS.map(d => discLabel(d).split(" ").pop() || discLabel(d)),
                datasets: [{
                    label: aT("adm_axis_records", "比赛记录数"),
                    data: discData,
                    backgroundColor: discColors.map(c => c + "b3"),
                    hoverBackgroundColor: discColors,
                    borderColor: discColors,
                    borderWidth: 0,
                    borderRadius: 9,
                    maxBarThickness: 52,
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                animation: { duration: 800, easing: "easeOutQuart" },
                plugins: {
                    legend: { display: false },
                    tooltip: Object.assign(baseTooltip(t), {
                        displayColors: false,
                        callbacks: {
                            label: c => {
                                const total = stats.wttDiscTotal || 1;
                                return aF(aT("adm_tip_share", "{v} 条 · 占比 {p}%"), { v: c.raw.toLocaleString(adminLocale()), p: ((c.raw / total) * 100).toFixed(1) });
                            }
                        }
                    })
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        grace: "8%",
                        ticks: { color: t.tick, font: { family:"'JetBrains Mono',monospace", size:10 } },
                        grid: { color: t.grid }
                    },
                    x: {
                        ticks: { color: t.tick, font: { family:"'Noto Sans SC',sans-serif", size:11 } },
                        grid: { display: false }
                    }
                }
            }
        }));
    }

    // --- 图表3: 赛事类型占比环形图（中心显示总数）---
    const ctx2 = document.getElementById("chartEventPie");
    if (ctx2) {
        const eventEntries = Object.entries(stats.wttByEvent).sort((a,b) => b[1] - a[1]);
        if (eventEntries.length > 0) {
            const eventLabels = eventEntries.map(e => eventLabel(e[0]));
            const eventData = eventEntries.map(e => e[1]);
            const eventColors = eventEntries.map(e => EVENT_COLORS[e[0]] || "#8a97ab");
            const grandTotal = eventData.reduce((a,b) => a+b, 0);
            const centerTotal = {
                id: "centerTotal",
                afterDraw(chart) {
                    const meta = chart.getDatasetMeta(0);
                    if (!meta.data.length) return;
                    const { x, y } = meta.data[0];
                    const ctx = chart.ctx;
                    ctx.save();
                    ctx.textAlign = "center";
                    ctx.textBaseline = "middle";
                    ctx.font = "800 22px Poppins, sans-serif";
                    ctx.fillStyle = t.isDark ? "#e6e9f2" : "#16213a";
                    ctx.fillText(grandTotal.toLocaleString(), x, y - 8);
                    ctx.font = "500 11px 'Noto Sans SC', sans-serif";
                    ctx.fillStyle = t.muted;
                    ctx.fillText(aT("adm_chart_center", "总记录"), x, y + 13);
                    ctx.restore();
                }
            };
            charts.push(new Chart(ctx2, {
                type: "doughnut",
                data: {
                    labels: eventLabels,
                    datasets: [{
                        data: eventData,
                        backgroundColor: eventColors.map(c => c + "cc"),
                        hoverBackgroundColor: eventColors,
                        borderColor: t.isDark ? "#191e2b" : "#ffffff",
                        borderWidth: 2,
                        hoverOffset: 8,
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    cutout: "64%",
                    animation: { duration: 800, easing: "easeOutQuart" },
                    plugins: {
                        centerTotal,
                        legend: {
                            position: "bottom",
                            labels: {
                                color: t.tick,
                                padding: 14,
                                boxWidth: 9,
                                usePointStyle: true,
                                pointStyle: "circle",
                                font: { size: 10.5, family: "'Noto Sans SC',sans-serif" },
                                generateLabels: function(chart) {
                                    const data = chart.data;
                                    return data.labels.map((label, i) => ({
                                        text: label + " (" + data.datasets[0].data[i].toLocaleString() + ")",
                                        fillStyle: data.datasets[0].backgroundColor[i],
                                        strokeStyle: "transparent",
                                        lineWidth: 0,
                                        hidden: false,
                                        index: i,
                                    }));
                                }
                            }
                        },
                        tooltip: Object.assign(baseTooltip(t), {
                            callbacks: {
                                label: c => {
                                    const total = c.dataset.data.reduce((a,b) => a+b, 0);
                                    const pct = ((c.raw / total) * 100).toFixed(1);
                                    return aF(aT("adm_tip_records_pct", "{v} 条 ({p}%)"), { v: c.raw.toLocaleString(adminLocale()), p: pct });
                                }
                            }
                        })
                    }
                }
            }));
        } else {
            ctx2.closest(".chart-box").innerHTML = `<div class="empty-cell">${escHtml(aT("data_viz_no_data", "暂无数据"))}</div>`;
        }
    }
}

function destroyCharts() {
    charts.forEach(c => { try { c.destroy(); } catch(e) {} });
    charts = [];
}

// ========================================
// 工具函数
// ========================================
function escHtml(str) {
    const div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
}

// ========================================
// 语言切换钩子（common.js setLanguage 探测函数名：adminReapplyI18n）
// ========================================
function adminReapplyI18n() {
    if (typeof window.__admReapplyPending === "function") window.__admReapplyPending();
    if (typeof window.__admReapplySe === "function") window.__admReapplySe();
    if (!lastRenderArgs || !lastStats) return;
    destroyCharts();
    renderDashboard(lastRenderArgs.loadTime, lastRenderArgs.hiddenVersions);
}
