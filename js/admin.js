/* ========================================
   admin.js - 后台数据可视化仪表盘
   展示 WTT 各模块数据量与核心数据概览
   ======================================== */

// ========================================
// 数据文件路径配置
// ========================================
const DATA_PATHS = {
    // 核心数据
    core: {
        players:      "data/players.json",
        members:      "data/_legacy/members.json",
        news:         "data/news/index.json",
        competitions: "data/competitions/index.json",
        scoreLog:     "data/score-log.json",
        seasons:      "data/seasons.json",
        qa:           "data/qa/index.json",
        changelog:    "data/changelog.json",
        draws:        "data/draws.json",
        playerTags:   "data/_legacy/player-tags.json",
        about:        "data/about.json",
        initialScores:"data/_legacy/initial-scores.json",
        eventCoeff:   "data/event-coefficient.json",
    },
    // WTT 各分项（按年分文件存储，记录经 manifest.json 清单聚合加载，此处 path 为分项目录）
    wttDisc: {
        ms: { label:"男单 MS", color:"#007bff", path:"wtt_data/ms/" },
        ws: { label:"女单 WS", color:"#e83e8c", path:"wtt_data/ws/" },
        wd: { label:"女双 WD", color:"#6f42c1", path:"wtt_data/wd/" },
        md: { label:"男双 MD", color:"#28a745", path:"wtt_data/md/" },
        xd: { label:"混双 XD", color:"#fd7e14", path:"wtt_data/xd/" },
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
    loadAllData();
});

function initTheme() {
    // admin 页不加载 common.js，这里内置同款安全垫片（Safari 隐私模式兜底）
    const store = {
        get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
        set(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* 忽略 */ } }
    };
    const st = store.get("wfls-tt-theme");
    if (st === "dark") {
        document.documentElement.classList.add("dark-mode");
        $("themeToggle").innerHTML = '<i class="fa-solid fa-sun"></i>';
    }
    $("themeToggle").addEventListener("click", () => {
        document.documentElement.classList.toggle("dark-mode");
        const isDark = document.documentElement.classList.contains("dark-mode");
        store.set("wfls-tt-theme", isDark ? "dark" : "light");
        $("themeToggle").innerHTML = isDark ? '<i class="fa-solid fa-sun"></i>' : '<i class="fa-solid fa-moon"></i>';
        // 重绘图表以适应暗色主题
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
        if (chips) chips.innerHTML = '<span class="chip"><i class="fa-solid fa-spinner fa-spin"></i>正在重新加载…</span>';
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

    // initial-scores 统计 (core - key is "initialScores" from DATA_PATHS.core)
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
    container.appendChild(secTitle("fa-solid fa-gauge-high", "数据总览"));

    const overviewCards = [
        { icon:"fa-solid fa-table-list", label:"WTT 比赛记录", value:stats.wttGrandTotal, sub:"五单项合计", cls:"accent-blue" },
        { icon:"fa-solid fa-users", label:"WTT 选手总数", value:stats.wttPlayers, sub:"初始积分在册选手", cls:"accent-purple" },
        { icon:"fa-solid fa-calendar-days", label:"WTT 赛季数", value:stats.wttSeasons, sub:"赛季管理", cls:"accent-green" },
        { icon:"fa-solid fa-ranking-star", label:"WTT 赛事类型", value:stats.wttEventTypes, sub:"不同级别赛事", cls:"accent-warning" },
        { icon:"fa-solid fa-id-card", label:"球员档案", value:stats.corePlayers, sub:"统一球员数据", cls:"accent-info" },
        { icon:"fa-solid fa-newspaper", label:"新闻 / 赛事", value:(stats.coreNews + stats.coreCompetitions),
          sub:`新闻 ${stats.coreNews}${stats.coreNewsHidden ? "(隐藏"+stats.coreNewsHidden+")" : ""} · 赛事 ${stats.coreCompetitions}${stats.coreCompetitionsHidden ? "(隐藏"+stats.coreCompetitionsHidden+")" : ""}`, cls:"accent-danger" },
    ];
    container.appendChild(createKpiRow(overviewCards));

    // ========== 第二部分：WTT 分项卡片（含占比条）==========
    container.appendChild(secTitle("fa-solid fa-layer-group", "WTT 五项模块数据量",
        null, `共 ${stats.wttDiscTotal.toLocaleString()} 条记录`));

    const discGrid = document.createElement("div");
    discGrid.className = "disc-grid";
    for (const disc of DISC_KEYS) {
        const cfg = DATA_PATHS.wttDisc[disc];
        const st = stats.wttDiscStats[disc];
        const hasRealData = st.entries > 0;
        const share = stats.wttDiscTotal > 0 ? (st.entries / stats.wttDiscTotal) * 100 : 0;
        const templateNote = (!hasRealData && st.rawEntries > 0)
            ? '<div class="disc-warn"><i class="fa-solid fa-triangle-exclamation"></i> 仅有模板数据</div>' : "";
        const card = document.createElement("div");
        card.className = "disc-card fade-in" + (hasRealData ? "" : " is-empty");
        card.style.setProperty("--dc", cfg.color);
        card.innerHTML = `
            <div class="disc-head">
                <div class="disc-glyph">${disc.toUpperCase()}</div>
                <div class="disc-name">${escHtml(cfg.label)}
                    <small>${hasRealData ? escHtml(st.dateFrom) + " ~ " + escHtml(st.dateTo) : "暂无真实数据"}</small>
                </div>
            </div>
            <div class="disc-main-val"><b data-count="${st.entries}">${st.entries.toLocaleString()}</b><span>比赛记录</span></div>
            <div class="disc-meta-row"><span>独特选手 <b>${st.uniquePlayers}</b></span><span>占全部记录 <b>${share.toFixed(1)}%</b></span></div>
            <div class="disc-share-track"><div class="disc-share-fill" data-w="${share.toFixed(1)}"></div></div>
            ${templateNote}
        `;
        discGrid.appendChild(card);
    }
    container.appendChild(discGrid);

    // ========== 第三部分：可视化图表 ==========
    container.appendChild(secTitle("fa-solid fa-chart-line", "WTT 数据分布"));

    // 历年趋势（通栏）
    const trendPanel = document.createElement("div");
    trendPanel.className = "panel fade-in";
    trendPanel.style.marginBottom = "18px";
    trendPanel.innerHTML = `
        <div class="panel-header">
            <span class="panel-title"><i class="fa-solid fa-chart-column"></i> 历年比赛记录趋势（按分项堆叠）</span>
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
            <span class="panel-title"><i class="fa-solid fa-chart-simple"></i> 五单项比赛记录数</span>
            <span class="panel-note">条</span>
        </div>
        <div class="panel-pad"><div class="chart-box"><canvas id="chartDiscBar"></canvas></div></div>`;
    const box2 = document.createElement("div");
    box2.className = "panel fade-in";
    box2.innerHTML = `
        <div class="panel-header">
            <span class="panel-title"><i class="fa-solid fa-chart-pie"></i> 赛事类型占比（全部分项）</span>
        </div>
        <div class="panel-pad"><div class="chart-box"><canvas id="chartEventPie"></canvas></div></div>`;
    chartsGrid.appendChild(box1);
    chartsGrid.appendChild(box2);
    container.appendChild(chartsGrid);

    // ========== 第四部分：TOP 选手 + 赛事类型明细 ==========
    container.appendChild(secTitle("fa-solid fa-list-check", "记录构成与活跃选手"));

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
                        <div class="rank-sub">胜 ${p.wins.toLocaleString()} · 负 ${p.losses.toLocaleString()}</div>
                    </div>
                    <div class="rank-val">${p.total.toLocaleString()}</div>
                </div>`;
        });
    } else {
        rankRows = '<tr><td colspan="3" class="empty-cell">暂无数据</td></tr>';
    }
    rankPanel.innerHTML = `
        <div class="panel-header">
            <span class="panel-title"><i class="fa-solid fa-fire"></i> 最活跃选手 TOP ${Math.max(stats.wttTopPlayers.length, 1)}</span>
            <span class="panel-note">按出场场次（胜+负）</span>
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
            <td><span class="dot" style="background:${color};"></span>${escHtml(type)}</td>
            <td class="num-cell">${count.toLocaleString()}</td>
            <td class="num-cell">${pct}%</td>
            <td style="width:150px;"><div class="mini-bar"><div class="mini-bar-fill" style="width:${barPct}%;background:${color};"></div></div></td>
        </tr>`;
    });
    eventPanel.innerHTML = `
        <div class="panel-header">
            <span class="panel-title"><i class="fa-solid fa-table"></i> 赛事类型明细</span>
            <span class="panel-note">总计 ${stats.wttDiscTotal.toLocaleString()} 条</span>
        </div>
        <div class="table-wrap">
            <table class="tbl">
                <thead><tr><th style="width:44px;">#</th><th>赛事类型</th><th style="text-align:right;width:90px;">记录数</th><th style="text-align:right;width:80px;">占比</th><th style="width:150px;">分布</th></tr></thead>
                <tbody>${eventRows || '<tr><td colspan="5" class="empty-cell">暂无数据</td></tr>'}</tbody>
            </table>
        </div>`;
    detailGrid.appendChild(eventPanel);
    container.appendChild(detailGrid);

    // ========== 第五部分：核心数据文件明细（卡片墙）==========
    const warnPill = txt => `<span class="pill pill-warn">${escHtml(txt)}</span>`;
    const CORE_FILES = [
        { name:"players.json", icon:"fa-id-card", count:stats.corePlayers, unit:"位球员档案", cls:"f-blue" },
        { name:"members.json", icon:"fa-users", count:stats.coreMembers, unit:"位成员", cls:"f-green" },
        { name:"news/", icon:"fa-newspaper", count:stats.coreNews, unit:"篇新闻", cls:"f-danger",
          warn:(stats.coreNewsHidden ? warnPill("隐藏 " + stats.coreNewsHidden) : "") + (stats.coreNewsHiddenVersions ? warnPill("隐藏版本 " + stats.coreNewsHiddenVersions) : "") },
        { name:"competitions/", icon:"fa-trophy", count:stats.coreCompetitions, unit:"场赛事", cls:"f-purple",
          warn:(stats.coreCompetitionsHidden ? warnPill("隐藏 " + stats.coreCompetitionsHidden) : "") + (stats.coreCompetitionsHiddenVersions ? warnPill("隐藏版本 " + stats.coreCompetitionsHiddenVersions) : "") },
        { name:"score-log.json", icon:"fa-table-list", count:stats.coreScoreLog, unit:"条比赛记录", cls:"f-info" },
        { name:"seasons.json", icon:"fa-calendar-days", count:stats.coreSeasons, unit:"个赛季", cls:"f-green" },
        { name:"qa/", icon:"fa-circle-question", count:stats.coreQa, unit:"条问答", cls:"f-info",
          warn:(stats.coreQaHidden ? warnPill("隐藏 " + stats.coreQaHidden) : "") + (stats.coreQaHiddenVersions ? warnPill("隐藏版本 " + stats.coreQaHiddenVersions) : "") },
        { name:"changelog.json", icon:"fa-clock-rotate-left", count:stats.coreChangelog, unit:"条更新日志", cls:"f-green" },
        { name:"draws.json", icon:"fa-diagram-project", count:stats.coreDraws, unit:"张对阵表", cls:"f-purple" },
        { name:"initial-scores.json", icon:"fa-chart-simple", count:stats.coreInitPlayers, unit:"位球员 (legacy)", cls:"f-warning" },
        { name:"event-coefficient.json", icon:"fa-weight-scale", count:stats.coreEventTypes, unit:"种赛事类型", cls:"f-warning" },
        { name:"player-tags.json", icon:"fa-tags", count:stats.playerTagCount, unit:`位球员 · ${stats.uniqueTags} 种标签`, cls:"f-purple" },
        { name:"about.json", icon:"fa-circle-info", count:stats.aboutLastUpdated, unit:"最近更新", cls:"f-blue" },
    ];

    container.appendChild(secTitle("fa-solid fa-database", "核心数据文件明细",
        null, `data/ 目录 · ${CORE_FILES.length} 个文件`));

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
            <div class="file-val">${isNum ? f.count.toLocaleString() : `<span class="file-date">${escHtml(String(f.count))}</span>`}<span class="file-unit">${escHtml(f.unit)}</span></div>
            ${isNum ? `<div class="mini-bar"><div class="mini-bar-fill" style="width:${relPct.toFixed(1)}%;background:var(--fc);"></div></div>
            <div class="file-foot"><span>占核心总量 ${sharePct}%</span><span>${f.warn || ""}</span></div>`
            : `<div class="file-foot"><span>元数据文件</span><span>${f.warn || ""}</span></div>`}
        </div>`;
    }).join("");
    container.appendChild(fileGrid);

    // ========== 第六部分：赛季管理概览 ==========
    container.appendChild(secTitle("fa-solid fa-calendar-days", "赛季管理概览"));

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
                <td>${escHtml(s.label||"")}</td>
                <td class="mono muted">${escHtml(s.startDate||"")} ~ ${escHtml(s.endDate||"")}</td>
                <td>${visPill(s.visible)}</td>
            </tr>`;
        });
        wttSeasonBodyHtml += `<tr class="tbl-group">
            <td colspan="4" style="color:${cfg.color};">
                <i class="fa-solid fa-table-tennis-paddle-ball"></i> ${escHtml(cfg.label)}
                <span style="font-weight:400;color:var(--dash-text-muted);font-size:0.7rem;margin-left:6px;">${discSeasons.length} 个赛季</span>
            </td>
        </tr>`;
        wttSeasonBodyHtml += discRows || `<tr><td colspan="4" class="empty-cell">暂无数据</td></tr>`;
    }
    wttSeasonPanel.innerHTML = `
        <div class="panel-header">
            <span class="panel-title"><i class="fa-solid fa-globe"></i> WTT 赛季（按分项）</span>
            <span class="panel-note">${stats.wttSeasons} 个赛季</span>
        </div>
        <div class="table-wrap">
            <table class="tbl">
                <thead><tr><th>ID</th><th>名称</th><th>日期范围</th><th style="width:88px;">状态</th></tr></thead>
                <tbody>${wttSeasonBodyHtml || '<tr><td colspan="4" class="empty-cell">暂无数据</td></tr>'}</tbody>
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
                <td>${escHtml(s.label||"")}</td>
                <td class="mono muted">${escHtml(s.startDate||"")} ~ ${escHtml(s.endDate||"")}</td>
                <td>${visPill(s.visible)}</td>
            </tr>`;
        });
    }
    coreSeasonPanel.innerHTML = `
        <div class="panel-header">
            <span class="panel-title"><i class="fa-solid fa-school"></i> 社团赛季</span>
            <span class="panel-note">${stats.coreSeasons} 个赛季</span>
        </div>
        <div class="table-wrap">
            <table class="tbl">
                <thead><tr><th>ID</th><th>名称</th><th>日期范围</th><th style="width:88px;">状态</th></tr></thead>
                <tbody>${coreSeasonRows || '<tr><td colspan="4" class="empty-cell">暂无数据</td></tr>'}</tbody>
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
        <span class="chip"><i class="fa-solid fa-bolt"></i>加载耗时 ${escHtml(String(loadTime))}s</span>
        <span class="chip"><i class="fa-regular fa-clock"></i>${escHtml(new Date().toLocaleString("zh-CN"))}</span>
        <span class="chip"><i class="fa-solid fa-calendar-days"></i>${escHtml(stats.wttDateFrom)} ~ ${escHtml(stats.wttDateTo)}</span>
        <span class="chip"><i class="fa-solid fa-database"></i>WTT 记录 ${stats.wttGrandTotal.toLocaleString()} 条</span>`;
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
        ? '<span class="pill pill-on"><i class="fa-solid fa-eye"></i>可见</span>'
        : '<span class="pill pill-off"><i class="fa-solid fa-eye-slash"></i>隐藏</span>';
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
            label: DATA_PATHS.wttDisc[d].label,
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
                            label: c => ` ${c.dataset.label}: ${c.raw.toLocaleString()} 条`,
                            footer: items => "合计 " + items.reduce((a, b) => a + b.raw, 0).toLocaleString() + " 条"
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
                labels: DISC_KEYS.map(d => DATA_PATHS.wttDisc[d].label.split(" ")[1] || DATA_PATHS.wttDisc[d].label),
                datasets: [{
                    label: "比赛记录数",
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
                                return c.raw.toLocaleString() + " 条 · 占比 " + ((c.raw / total) * 100).toFixed(1) + "%";
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
            const eventLabels = eventEntries.map(e => e[0]);
            const eventData = eventEntries.map(e => e[1]);
            const eventColors = eventLabels.map(l => EVENT_COLORS[l] || "#8a97ab");
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
                    ctx.fillText("总记录", x, y + 13);
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
                                    return ` ${c.raw.toLocaleString()} 条 (${pct}%)`;
                                }
                            }
                        })
                    }
                }
            }));
        } else {
            ctx2.closest(".chart-box").innerHTML = '<div class="empty-cell">暂无数据</div>';
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
