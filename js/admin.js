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
    // WTT 各分项
    wttDisc: {
        ms: { label:"男单 MS", color:"#007bff", path:"wtt_data/ms/score-log.json" },
        ws: { label:"女单 WS", color:"#e83e8c", path:"wtt_data/ws/score-log.json" },
        wd: { label:"女双 WD", color:"#6f42c1", path:"wtt_data/wd/score-log.json" },
        md: { label:"男双 MD", color:"#28a745", path:"wtt_data/md/score-log.json" },
        xd: { label:"混双 XD", color:"#fd7e14", path:"wtt_data/xd/score-log.json" },
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
    const st = localStorage.getItem("wfls-tt-theme");
    if (st === "dark") {
        document.body.classList.add("dark-mode");
        $("themeToggle").innerHTML = '<i class="fa-solid fa-sun"></i>';
    }
    $("themeToggle").addEventListener("click", () => {
        document.body.classList.toggle("dark-mode");
        const isDark = document.body.classList.contains("dark-mode");
        localStorage.setItem("wfls-tt-theme", isDark ? "dark" : "light");
        $("themeToggle").innerHTML = isDark ? '<i class="fa-solid fa-sun"></i>' : '<i class="fa-solid fa-moon"></i>';
        // 重绘图表以适应暗色主题
        setTimeout(() => destroyCharts(), 100);
        setTimeout(() => renderCharts(), 200);
    });
}

function bindEvents() {
    $("refreshBtn").addEventListener("click", () => {
        allData = {};
        destroyCharts();
        $("dashboardContent").style.display = "none";
        $("loadingView").style.display = "";
        loadAllData();
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

    // WTT 分项数据 - 加载主文件 + 年度分文件 + 辅助数据（seasons/initial-scores/event-coefficient）
    // 为每个分项加载全部数据文件
    for (const [disc, cfg] of Object.entries(DATA_PATHS.wttDisc)) {
        const baseDir = cfg.path.replace("/score-log.json", "");
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
        // 加载主 score-log.json
        promises.push(fetchJson(cfg.path).then(d => ({ key:"disc_"+disc, data:d, group:"wttDisc", disc })).catch(() => ({ key:"disc_"+disc, data:[], group:"wttDisc", disc })));
        // 依据 manifest.json 解析该分项真实存在的年度文件并加载；manifest 不可用时回退到内置后缀
        const baseDir = cfg.path.replace("/score-log.json", "");
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
        if (r.group === "wttDisc") {
            allData[r.key] = r.data;
            // 合并主数据
            if (Array.isArray(r.data)) {
                discData[r.disc] = discData[r.disc].concat(r.data);
            }
        } else if (r.group === "wttDiscYear") {
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

    // event-coefficient 统计
    if (allData.eventCoeff && typeof allData.eventCoeff === "object") {
        s.coreEventTypes = Object.keys(allData.eventCoeff).length;
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

    return s;
}

// ========================================
// 仪表盘渲染
// ========================================
function renderDashboard(loadTime, hiddenVersions) {
    const stats = computeStats();
    if (hiddenVersions) {
        stats.coreNewsHiddenVersions = hiddenVersions.news;
        stats.coreCompetitionsHiddenVersions = hiddenVersions.competitions;
        stats.coreQaHiddenVersions = hiddenVersions.qa;
    }
    const container = $("dashboardContent");
    container.innerHTML = "";

    // 更新时间
    const updatedDiv = document.createElement("div");
    updatedDiv.className = "dash-updated";
    updatedDiv.textContent = "数据加载完成 · 耗时 "+loadTime+"s · 更新于 "+new Date().toLocaleString("zh-CN");
    container.appendChild(updatedDiv);

    // ========== 第一部分：概览卡片 ==========
    container.appendChild(createSectionTitle("fa-solid fa-gauge-high", "数据总览"));

    const overviewCards = [
        { icon:"fa-solid fa-table-list", label:"WTT 比赛记录", value:stats.wttGrandTotal, sub:"五单项合计", cls:"accent-blue" },
        { icon:"fa-solid fa-users", label:"WTT 选手总数", value:stats.wttPlayers, sub:"初始积分在册选手", cls:"accent-purple" },
        { icon:"fa-solid fa-calendar-days", label:"WTT 赛季数", value:stats.wttSeasons, sub:"赛季管理", cls:"accent-green" },
        { icon:"fa-solid fa-weight-scale", label:"WTT 赛事类型", value:stats.wttEventTypes, sub:"不同级别赛事", cls:"accent-warning" },
        { icon:"fa-solid fa-id-card", label:"球员档案", value:stats.corePlayers, sub:"统一球员数据", cls:"accent-info" },
        { icon:"fa-solid fa-newspaper", label:"新闻/赛事", value:(stats.coreNews + stats.coreCompetitions), sub:"新闻:"+stats.coreNews+(stats.coreNewsHidden?"(隐藏"+stats.coreNewsHidden+")":"")+" · 赛事:"+stats.coreCompetitions+(stats.coreCompetitionsHidden?"(隐藏"+stats.coreCompetitionsHidden+")":""), cls:"accent-danger" },
    ];
    container.appendChild(createCardsRow(overviewCards));

    // ========== 第二部分：WTT 分项详情 ==========
    container.appendChild(createSectionTitle("fa-solid fa-layer-group", "WTT 五项模块数据量", "共 "+stats.wttDiscTotal+" 条"));

    const discGrid = document.createElement("div");
    discGrid.className = "dash-discipline-grid";

    const discKeys = ["ms","ws","wd","md","xd"];
    for (const disc of discKeys) {
        const cfg = DATA_PATHS.wttDisc[disc];
        const st = stats.wttDiscStats[disc];
        const hasRealData = st.entries > 0;
        const templateNote = (!hasRealData && st.rawEntries > 0) ? '<div style="font-size:0.65rem;color:var(--dash-warning);margin-top:6px;text-align:center;"><i class="fa-solid fa-triangle-exclamation"></i> 仅有模板数据</div>' : '';
        const card = document.createElement("div");
        card.className = "dash-disc-card";
        card.style.opacity = hasRealData ? "1" : "0.55";
        card.innerHTML = `
            <div class="disc-header">
                <div class="disc-icon" style="background:${cfg.color};">${disc.toUpperCase()}</div>
                <div class="disc-name">${cfg.label}<small>${hasRealData ? st.dateFrom+' ~ '+st.dateTo : '暂无真实数据'}</small></div>
            </div>
            <div class="disc-stats">
                <div class="disc-stat">
                    <div class="disc-stat-val">${st.entries.toLocaleString()}</div>
                    <div class="disc-stat-label">比赛记录</div>
                </div>
                <div class="disc-stat">
                    <div class="disc-stat-val">${st.uniquePlayers}</div>
                    <div class="disc-stat-label">独特选手</div>
                </div>
            </div>
            ${templateNote}
        `;
        discGrid.appendChild(card);
    }
    container.appendChild(discGrid);

    // ========== 第三部分：分项数据可视化 ==========
    container.appendChild(createSectionTitle("fa-solid fa-chart-bar", "WTT 数据分布"));

    const chartsRow = document.createElement("div");
    chartsRow.className = "dash-charts-row";
    chartsRow.id = "chartsRow";
    container.appendChild(chartsRow);

    // ========== 第四部分：赛事类型分布表（聚合所有分项）==========
    container.appendChild(createSectionTitle("fa-solid fa-list-check", "WTT 赛事类型分布（全部分项）"));

    const eventPanel = document.createElement("div");
    eventPanel.className = "dash-panel";
    const eventTypes = Object.entries(stats.wttByEvent).sort((a,b) => b[1] - a[1]);
    let eventRows = "";
    eventTypes.forEach(([type, count], i) => {
        const color = EVENT_COLORS[type] || "#6c757d";
        const pct = stats.wttDiscTotal > 0 ? ((count / stats.wttDiscTotal) * 100).toFixed(1) : 0;
        eventRows += `<tr>
            <td>${i+1}</td>
            <td><span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:${color};margin-right:6px;"></span>${escHtml(type)}</td>
            <td class="num-cell">${count.toLocaleString()}</td>
            <td class="num-cell">${pct}%</td>
            <td style="width:120px;"><div style="height:6px;border-radius:3px;background:${color};width:${pct}%;min-width:2px;"></div></td>
        </tr>`;
    });
    eventPanel.innerHTML = `
        <div class="dash-panel-header">
            <span class="dash-panel-title"><i class="fa-solid fa-table"></i> 赛事类型明细</span>
            <span style="font-size:0.78rem;color:var(--dash-text-muted);">总计 ${stats.wttDiscTotal.toLocaleString()} 条</span>
        </div>
        <div class="dash-table-wrap">
            <table class="dash-table">
                <thead><tr><th style="width:40px;">#</th><th>赛事类型</th><th style="width:100px;">记录数</th><th style="width:80px;">占比</th><th style="width:120px;"></th></tr></thead>
                <tbody>${eventRows || '<tr><td colspan="5" class="dash-empty">暂无数据</td></tr>'}</tbody>
            </table>
        </div>`;
    container.appendChild(eventPanel);

    // ========== 第五部分：核心数据明细表 ==========
    container.appendChild(createSectionTitle("fa-solid fa-database", "核心数据文件明细"));

    const corePanel = document.createElement("div");
    corePanel.className = "dash-panel";
    const coreRows = [
        { name:"players.json", icon:"fa-id-card", count:stats.corePlayers, unit:"位球员档案" },
        { name:"members.json", icon:"fa-users", count:stats.coreMembers, unit:"位成员" },
        { name:"news/", icon:"fa-newspaper", count:stats.coreNews, unit:"篇新闻（独立文件+index.json）" + (stats.coreNewsHidden ? `，隐藏 ${stats.coreNewsHidden} 篇` : "") + (stats.coreNewsHiddenVersions ? `，隐藏版本 ${stats.coreNewsHiddenVersions} 个` : "") },
        { name:"competitions/", icon:"fa-trophy", count:stats.coreCompetitions, unit:"场赛事（独立文件+index.json）" + (stats.coreCompetitionsHidden ? `，隐藏 ${stats.coreCompetitionsHidden} 场` : "") + (stats.coreCompetitionsHiddenVersions ? `，隐藏版本 ${stats.coreCompetitionsHiddenVersions} 个` : "") },
        { name:"score-log.json", icon:"fa-table-list", count:stats.coreScoreLog, unit:"条比赛记录" },
        { name:"seasons.json", icon:"fa-calendar-days", count:stats.coreSeasons, unit:"个赛季" },
        { name:"qa/", icon:"fa-circle-question", count:stats.coreQa, unit:"条问答（独立文件+index.json）" + (stats.coreQaHidden ? `，隐藏 ${stats.coreQaHidden} 条` : "") + (stats.coreQaHiddenVersions ? `，隐藏版本 ${stats.coreQaHiddenVersions} 个` : "") },
        { name:"changelog.json", icon:"fa-clock-rotate-left", count:stats.coreChangelog, unit:"条更新日志" },
        { name:"draws.json", icon:"fa-diagram-project", count:stats.coreDraws, unit:"张对阵表" },
        { name:"initial-scores.json", icon:"fa-chart-simple", count:stats.coreInitPlayers, unit:"位球员(legacy)" },
        { name:"event-coefficient.json", icon:"fa-weight-scale", count:stats.coreEventTypes, unit:"种赛事类型" },
        { name:"player-tags.json", icon:"fa-tags", count:stats.playerTagCount, unit:"位球员 · "+stats.uniqueTags+" 种标签" },
        { name:"about.json", icon:"fa-circle-info", count:stats.aboutLastUpdated, unit:"" },
    ];
    let coreTableRows = "";
    coreRows.forEach(r => {
        const val = typeof r.count === "number" ? r.count.toLocaleString() : r.count;
        coreTableRows += `<tr>
            <td><i class="fa-solid ${r.icon}" style="color:var(--primary-blue);width:18px;"></i> <span class="mono">${r.name}</span></td>
            <td class="num-cell">${val}</td>
            <td style="color:var(--dash-text-muted);">${r.unit}</td>
        </tr>`;
    });
    corePanel.innerHTML = `
        <div class="dash-panel-header">
            <span class="dash-panel-title"><i class="fa-solid fa-table"></i> 核心文件清单</span>
        </div>
        <div class="dash-table-wrap">
            <table class="dash-table">
                <thead><tr><th>文件名</th><th style="width:100px;">数据量</th><th style="width:120px;">单位</th></tr></thead>
                <tbody>${coreTableRows}</tbody>
            </table>
        </div>`;
    container.appendChild(corePanel);

    // ========== 第六部分：WTT 赛季 & 核心赛季 ==========
    container.appendChild(createSectionTitle("fa-solid fa-calendar-days", "赛季管理概览"));

    const seasonsGrid = document.createElement("div");
    seasonsGrid.className = "dash-charts-row";

    // WTT 赛季 - 按分项类型展示
    const wttSeasonPanel = document.createElement("div");
    wttSeasonPanel.className = "dash-panel";
    let wttSeasonBodyHtml = "";
    const discKeys2 = ["ms","ws","md","wd","xd"];
    for (const disc of discKeys2) {
        const cfg = DATA_PATHS.wttDisc[disc];
        const discSeasons = stats.wttSeasonsPerDisc[disc] || [];
        let discRows = "";
        if (discSeasons.length > 0) {
            discSeasons.forEach(s => {
                discRows += `<tr>
                    <td><span class="mono">${escHtml(s.id||"")}</span></td>
                    <td>${escHtml(s.label||"")}</td>
                    <td class="mono">${escHtml(s.startDate||"")} ~ ${escHtml(s.endDate||"")}</td>
                    <td>${s.visible ? '<span style="color:var(--dash-success);">✅ 可见</span>' : '<span style="color:var(--dash-text-muted);">❌ 隐藏</span>'}</td>
                </tr>`;
            });
        }
        const discColor = cfg ? cfg.color : "#6c757d";
        wttSeasonBodyHtml += `<tr style="background:var(--dash-bg);">
            <td colspan="4" style="padding:8px 14px;font-weight:700;font-size:0.82rem;color:${discColor};font-family:'Poppins',sans-serif;">
                <i class="fa-solid fa-table-tennis-paddle-ball"></i> ${cfg ? cfg.label : disc.toUpperCase()}
                <span style="font-weight:400;color:var(--dash-text-muted);font-size:0.7rem;margin-left:6px;">${discSeasons.length} 个赛季</span>
            </td>
        </tr>`;
        if (discRows) {
            wttSeasonBodyHtml += discRows;
        } else {
            wttSeasonBodyHtml += `<tr><td colspan="4" class="dash-empty">暂无数据</td></tr>`;
        }
    }
    wttSeasonPanel.innerHTML = `
        <div class="dash-panel-header">
            <span class="dash-panel-title"><i class="fa-solid fa-globe"></i> WTT 赛季（按分项）</span>
            <span style="font-size:0.78rem;color:var(--dash-text-muted);">${stats.wttSeasons} 个赛季</span>
        </div>
        <div class="dash-table-wrap">
            <table class="dash-table">
                <thead><tr><th>ID</th><th>名称</th><th>日期范围</th><th>状态</th></tr></thead>
                <tbody>${wttSeasonBodyHtml || '<tr><td colspan="4" class="dash-empty">暂无数据</td></tr>'}</tbody>
            </table>
        </div>`;
    seasonsGrid.appendChild(wttSeasonPanel);

    // 核心赛季
    const coreSeasonPanel = document.createElement("div");
    coreSeasonPanel.className = "dash-panel";
    let coreSeasonRows = "";
    if (Array.isArray(allData.seasons) && allData.seasons.length > 0) {
        allData.seasons.forEach(s => {
            coreSeasonRows += `<tr>
                <td><span class="mono">${escHtml(s.id||"")}</span></td>
                <td>${escHtml(s.label||"")}</td>
                <td class="mono">${escHtml(s.startDate||"")} ~ ${escHtml(s.endDate||"")}</td>
                <td>${s.visible ? '<span style="color:var(--dash-success);">✅ 可见</span>' : '<span style="color:var(--dash-text-muted);">❌ 隐藏</span>'}</td>
            </tr>`;
        });
    }
    coreSeasonPanel.innerHTML = `
        <div class="dash-panel-header">
            <span class="dash-panel-title"><i class="fa-solid fa-school"></i> 社团赛季</span>
            <span style="font-size:0.78rem;color:var(--dash-text-muted);">${stats.coreSeasons} 个赛季</span>
        </div>
        <div class="dash-table-wrap">
            <table class="dash-table">
                <thead><tr><th>ID</th><th>名称</th><th>日期范围</th><th>状态</th></tr></thead>
                <tbody>${coreSeasonRows || '<tr><td colspan="4" class="dash-empty">暂无数据</td></tr>'}</tbody>
            </table>
        </div>`;
    seasonsGrid.appendChild(coreSeasonPanel);
    container.appendChild(seasonsGrid);

    // ========== 渲染图表 ==========
    setTimeout(() => renderCharts(stats), 100);
}

function createSectionTitle(iconClass, text, badge) {
    const div = document.createElement("div");
    div.className = "dash-section-title";
    div.innerHTML = `<i class="${iconClass}"></i> ${text}`;
    if (badge) {
        const b = document.createElement("span");
        b.className = "badge";
        b.textContent = badge;
        div.appendChild(b);
    }
    return div;
}

function createCardsRow(cards) {
    const row = document.createElement("div");
    row.className = "dash-cards";
    cards.forEach(c => {
        const card = document.createElement("div");
        card.className = "dash-card "+c.cls;
        card.innerHTML = `
            <div class="card-accent-bar"></div>
            <div class="card-icon"><i class="${c.icon}"></i></div>
            <div class="card-label">${c.label}</div>
            <div class="card-value">${typeof c.value === "number" ? c.value.toLocaleString() : c.value}</div>
            <div class="card-sub">${c.sub}</div>
        `;
        row.appendChild(card);
    });
    return row;
}

// ========================================
// 图表渲染
// ========================================
function renderCharts(statsOverride) {
    const stats = statsOverride || computeStats();
    const chartsRow = $("chartsRow");
    if (!chartsRow) return;

    // 清除旧图表
    destroyCharts();
    chartsRow.innerHTML = "";

    // --- 图表1: 五项数据量对比柱状图 ---
    const box1 = document.createElement("div");
    box1.className = "dash-chart-box";
    box1.innerHTML = '<div class="dash-panel-title" style="margin-bottom:12px;"><i class="fa-solid fa-chart-column"></i> 五单项比赛记录数</div><canvas id="chartDiscBar"></canvas>';
    chartsRow.appendChild(box1);

    // --- 图表2: 主表赛事类型分布饼图 ---
    const box2 = document.createElement("div");
    box2.className = "dash-chart-box";
    box2.innerHTML = '<div class="dash-panel-title" style="margin-bottom:12px;"><i class="fa-solid fa-chart-pie"></i> WTT 赛事类型占比（全部分项）</div><canvas id="chartEventPie"></canvas>';
    chartsRow.appendChild(box2);

    setTimeout(() => {
        // 柱状图
        const discKeys = ["ms","ws","wd","md","xd"];
        const discLabels = discKeys.map(d => DATA_PATHS.wttDisc[d].label);
        const discData = discKeys.map(d => stats.wttDiscStats[d].entries);
        const discColors = discKeys.map(d => DATA_PATHS.wttDisc[d].color);

        const ctx1 = document.getElementById("chartDiscBar");
        if (ctx1) {
            const isDark = document.body.classList.contains("dark-mode");
            const chart1 = new Chart(ctx1, {
                type: "bar",
                data: {
                    labels: discLabels,
                    datasets: [{
                        label: "比赛记录数",
                        data: discData,
                        backgroundColor: discColors.map(c => c+"99"),
                        borderColor: discColors,
                        borderWidth: 2,
                        borderRadius: 8,
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        legend: { display: false },
                        tooltip: { callbacks: { label: ctx => ctx.raw.toLocaleString()+" 条" } }
                    },
                    scales: {
                        y: {
                            beginAtZero: true,
                            ticks: { color: isDark ? "#aeb4c2" : "#4a5568" },
                            grid: { color: isDark ? "#2a2e3d" : "#e2e8f0" }
                        },
                        x: {
                            ticks: { color: isDark ? "#aeb4c2" : "#4a5568" },
                            grid: { display: false }
                        }
                    }
                }
            });
            charts.push(chart1);
        }

        // 饼图
        const ctx2 = document.getElementById("chartEventPie");
        if (ctx2) {
            const isDark = document.body.classList.contains("dark-mode");
            const eventEntries = Object.entries(stats.wttByEvent).sort((a,b) => b[1] - a[1]);
            const eventLabels = eventEntries.map(e => e[0]);
            const eventData = eventEntries.map(e => e[1]);
            const eventColors = eventLabels.map(l => EVENT_COLORS[l] || "#6c757d");

            const chart2 = new Chart(ctx2, {
                type: "doughnut",
                data: {
                    labels: eventLabels,
                    datasets: [{
                        data: eventData,
                        backgroundColor: eventColors.map(c => c+"cc"),
                        borderColor: eventColors,
                        borderWidth: 2,
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        legend: {
                            position: "bottom",
                            labels: {
                                color: isDark ? "#aeb4c2" : "#4a5568",
                                padding: 16,
                                font: { size: 11, family: "'Noto Sans SC',sans-serif" },
                                generateLabels: function(chart) {
                                    const data = chart.data;
                                    return data.labels.map((label, i) => ({
                                        text: label + " (" + data.datasets[0].data[i].toLocaleString() + ")",
                                        fillStyle: data.datasets[0].backgroundColor[i],
                                        strokeStyle: data.datasets[0].borderColor[i],
                                        lineWidth: 1,
                                        hidden: false,
                                        index: i,
                                    }));
                                }
                            }
                        },
                        tooltip: {
                            callbacks: {
                                label: ctx => {
                                    const total = ctx.dataset.data.reduce((a,b) => a+b, 0);
                                    const pct = ((ctx.raw / total) * 100).toFixed(1);
                                    return ctx.raw.toLocaleString()+" 条 ("+pct+"%)";
                                }
                            }
                        }
                    }
                }
            });
            charts.push(chart2);
        }
    }, 200);
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
