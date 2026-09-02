/* ========================================
   wtt_dataviz_extra.js - WTT 数据可视化扩展板块
   复刻 data-viz-extra.js，使用 WTT 系列数据
   ======================================== */

let wttRecordBarChart = null, wttEfficiencyScatterChart = null, wttMatchFrequencyChart = null, wttScoreDistributionChart = null;
let wttAssocTrendChart = null, wttAssocTop5Chart = null;
let wttDataVizExtraState = { recordTopN: 10, efficiencyTopN: 15, heatmapTopN: 8, heatmapMode: 'wins', freqBucket: 'week', freqCount: 24, distBins: 10, assocTrendCount: 20, assocTrendStart: '', assocTrendEnd: '', assocTop5TopN: 8, raceFrameIndex: 0 };

// ============ 通用辅助（WTT 页未加载 data-viz-extra.js，需自带） ============

function shortenPlayerName(name) {
    const s = String(name);
    return s.length > 14 ? s.slice(0, 12) + '…' : s;
}

function buildFrequencyBuckets(records, bucketType) {
    const buckets = new Map();
    function keyOf(dateStr) {
        const d = new Date(dateStr + 'T00:00:00');
        if (isNaN(d)) return null;
        if (bucketType === 'month') {
            return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
        }
        const day = d.getDay() || 7;
        const monday = new Date(d);
        monday.setDate(d.getDate() - (day - 1));
        return monday.getFullYear() + '-' + String(monday.getMonth() + 1).padStart(2, '0') + '-' + String(monday.getDate()).padStart(2, '0');
    }
    function labelOf(key) {
        if (bucketType === 'month') {
            const [y, m] = key.split('-');
            const _L = i18n[currentLang] || {};
            return (_L.chart_axis_ym_tpl || '{y}年{m}月').replace('{y}', y).replace('{m}', String(parseInt(m)));
        }
        const d = new Date(key + 'T00:00:00');
        return (d.getMonth() + 1) + '月' + d.getDate() + '日';
    }
    for (const r of records) {
        const k = keyOf(r['日期']);
        if (!k) continue;
        if (!buckets.has(k)) buckets.set(k, { label: labelOf(k), types: {} });
        const b = buckets.get(k);
        b.types[r['类型']] = (b.types[r['类型']] || 0) + 1;
    }
    return Array.from(buckets.entries())
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map(([k, v]) => v);
}

// ============ 数据辅助 ============

function wttBuildCurrentScoreMap() {
    const scores = {};
    let cd = [];
    for (let i = wttRankingTimeline.length - 1; i >= 0; i--) {
        if (wttRankingTimeline[i].data && wttRankingTimeline[i].data.length > 0) {
            cd = wttRankingTimeline[i].data;
            break;
        }
    }
    for (const p of cd) { scores[p['姓名']] = p['当前积分']; }

    // 不活跃球员：使用当前赛季的继承起始积分（在 WTT 数据上下文中计算）
    wttWithDataContext(() => {
        if (wttSeasonsData && wttSeasonsData.length > 0) {
            let currentSeasonIdx = wttSeasonsData.length - 1;
            for (let i = wttRankingTimeline.length - 1; i >= 0; i--) {
                if (wttRankingTimeline[i].season) {
                    const s = wttSeasonsData.find(s2 => s2.label === wttRankingTimeline[i].season);
                    if (s) { currentSeasonIdx = wttSeasonsData.indexOf(s); break; }
                }
            }
            const startScores = getSeasonStartScores(currentSeasonIdx);
            for (const [name, score] of Object.entries(startScores)) {
                if (!(name in scores)) scores[name] = score;
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

function wttBuildRecordStats(playerNames) {
    const stats = {};
    for (const n of playerNames) stats[n] = { wins: 0, losses: 0, total: 0 };
    if (!wttScoreLogData) return stats;
    for (const r of wttScoreLogData) {
        if (!isMatchRecord(r)) continue;
        const w = r['胜者'], l = r['负者'];
        if (w && stats[w]) { stats[w].wins++; stats[w].total++; }
        if (l && stats[l]) { stats[l].losses++; stats[l].total++; }
    }
    return stats;
}

// ============ 协会籍辅助 ============

const WTT_ASSOC_WEIGHTS = [0.4, 0.3, 0.15, 0.1, 0.05];

function wttBuildAssocCountryMap() {
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

// 按标签在 wttSeasonsData 中查找赛季对象
function wttGetSeasonByLabel(label) {
    if (!label || !wttSeasonsData || !wttSeasonsData.length) return null;
    return wttSeasonsData.find(s => s.label === label) || null;
}

// 定位当前赛季：优先取排名时间线最后一条记录的赛季标签，其次取 seasons 列表最后一项
function wttGetCurrentSeason() {
    if (!wttSeasonsData || !wttSeasonsData.length) return null;
    if (wttRankingTimeline && wttRankingTimeline.length) {
        for (let i = wttRankingTimeline.length - 1; i >= 0; i--) {
            if (wttRankingTimeline[i] && wttRankingTimeline[i].season) {
                const s = wttGetSeasonByLabel(wttRankingTimeline[i].season);
                if (s) return s;
            }
        }
    }
    return wttSeasonsData[wttSeasonsData.length - 1];
}

// 返回某赛季 [startDate, endDate] 内有过比赛记录的球员集合（无赛季时返回 null，表示不过滤）
function wttGetSeasonActivePlayers(season) {
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

// 由按积分降序的球员数组计算协会实力分（前五加权，不足5人按可用权重归一化）
// 协会人数 n < 5 时，实力分额外乘以 0.95^(5-n)，避免单名高排名球员撑起小协会排名
function wttAssocStrengthFromScores(sortedPlayers) {
    if (!sortedPlayers || !sortedPlayers.length) return 0;
    const top = sortedPlayers.slice(0, 5);
    let num = 0, den = 0;
    for (let i = 0; i < top.length; i++) {
        num += top[i].score * WTT_ASSOC_WEIGHTS[i];
        den += WTT_ASSOC_WEIGHTS[i];
    }
    let strength = den > 0 ? num / den : 0;
    if (strength > 0 && top.length < 5) {
        strength *= Math.pow(0.95, 5 - top.length);
    }
    return strength;
}

// 给定一个快照，返回完整 姓名->积分 映射（活跃 + 赛季继承 + 初始分兜底）
function wttBuildSnapshotScoreMap(entry) {
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

// 代码 -> [球员名...]（仅包含能在 assoc.json 中匹配到的球员）
function wttBuildAssocPlayerMap() {
    const map = {};
    for (const name of wttGetAllPlayers()) {
        const a = wttGetPlayerAssoc(name);
        if (!a || !a.assoc) continue;
        const code = String(a.assoc).toUpperCase();
        if (!map[code]) map[code] = [];
        map[code].push(name);
    }
    return map;
}

// 由某时刻的完整积分映射计算各协会实力分，返回按分数降序的列表
// season 可选：历史快照传入其所属赛季；缺省时保持现状用当前赛季
function wttComputeAssocStrengthList(scoreMap, season) {
    const assocPlayers = wttBuildAssocPlayerMap();
    const countryMap = wttBuildAssocCountryMap();
    // 不计算该赛季无比赛数据的球员
    const activeThisSeason = wttGetSeasonActivePlayers(season !== undefined ? season : wttGetCurrentSeason());
    const filterActive = activeThisSeason && activeThisSeason.size > 0
        ? name => activeThisSeason.has(name)
        : () => true;
    const list = [];
    for (const [code, players] of Object.entries(assocPlayers)) {
        const scored = players
            .filter(filterActive)
            .map(name => ({ name, score: (scoreMap && scoreMap[name] != null) ? scoreMap[name] : 0 }))
            .sort((a, b) => b.score - a.score);
        const top5 = scored.slice(0, 5);
        const score = wttAssocStrengthFromScores(scored);
        list.push({ assoc: code, country: countryMap[code] || code, score, top5, count: scored.length });
    }
    list.sort((a, b) => b.score - a.score);
    return list;
}

// 旗帜图例
function wttRenderAssocFlagLegend(containerId, items) {
    const el = document.getElementById(containerId);
    if (!el) return;
    if (!items || !items.length) { el.innerHTML = ''; return; }
    el.innerHTML = items.map(it => {
        const cls = wttAssocFlagClass(it.assoc);
        const flag = cls ? `<span class="player-flag ${cls}"></span>` : '';
        return `<span class="flag-legend-item" title="${escapeHtml(it.assoc)}">${flag}<span>${escapeHtml(it.country || it.assoc)}</span></span>`;
    }).join('');
}

// ============ 初始化 ============

function initWttDataVizExtra() {
    if (!document.getElementById('wttRecordBarChart')) return;
    if (!wttRankingTimeline || wttRankingTimeline.length === 0) return;

    const players = wttGetAllPlayers();
    if (!players.length) return;

    wttDataVizExtraState.recordTopN = parseInt(document.getElementById('wttRecordTopN')?.value) || 10;
    wttDataVizExtraState.efficiencyTopN = parseInt(document.getElementById('wttEfficiencyTopN')?.value) || 15;
    wttDataVizExtraState.heatmapTopN = parseInt(document.getElementById('wttHeatmapTopN')?.value) || 8;
    wttDataVizExtraState.heatmapMode = document.getElementById('wttHeatmapModeSelect')?.value === 'rate' ? 'rate' : 'wins';
    wttDataVizExtraState.distBins = parseInt(document.getElementById('wttDistBinCount')?.value) || 10;
    wttDataVizExtraState.assocTrendCount = parseInt(document.getElementById('wttAssocTrendCount')?.value) || 20;
    wttDataVizExtraState.assocTrendStart = document.getElementById('wttAssocTrendStart')?.value || '';
    wttDataVizExtraState.assocTrendEnd = document.getElementById('wttAssocTrendEnd')?.value || '';
    wttDataVizExtraState.assocTop5TopN = parseInt(document.getElementById('wttAssocTop5TopN')?.value) || 8;
    wttRenderRecordBar(wttDataVizExtraState.recordTopN);
    wttRenderEfficiencyScatter(wttDataVizExtraState.efficiencyTopN);
    wttRenderH2hHeatmap(wttDataVizExtraState.heatmapTopN);
    wttRenderMatchFrequency(wttDataVizExtraState.freqBucket, wttDataVizExtraState.freqCount);
    wttRenderScoreDistribution(wttDataVizExtraState.distBins);
    wttRenderAssocCheckboxes();
    wttRenderAssocTrend(wttGetSelectedAssocs(), wttDataVizExtraState.assocTrendCount, wttDataVizExtraState.assocTrendStart, wttDataVizExtraState.assocTrendEnd);
    wttRenderAssocTop5(wttDataVizExtraState.assocTop5TopN);

    document.getElementById('wttRecordTopN')?.addEventListener('change', () => {
        const v = wttClampInt(document.getElementById('wttRecordTopN').value, 1, 50);
        document.getElementById('wttRecordTopN').value = v;
        wttDataVizExtraState.recordTopN = v;
        wttRenderRecordBar(v);
    });
    document.getElementById('wttEfficiencyTopN')?.addEventListener('change', () => {
        const v = wttClampInt(document.getElementById('wttEfficiencyTopN').value, 1, 100);
        document.getElementById('wttEfficiencyTopN').value = v;
        wttDataVizExtraState.efficiencyTopN = v;
        wttRenderEfficiencyScatter(v);
    });
    document.getElementById('wttHeatmapModeSelect')?.addEventListener('change', e => {
        wttDataVizExtraState.heatmapMode = e.target.value === 'rate' ? 'rate' : 'wins';
        wttRenderH2hHeatmap(wttDataVizExtraState.heatmapTopN);
    });
    document.getElementById('wttHeatmapTopN')?.addEventListener('change', () => {
        const v = wttClampInt(document.getElementById('wttHeatmapTopN').value, 2, 20);
        document.getElementById('wttHeatmapTopN').value = v;
        wttDataVizExtraState.heatmapTopN = v;
        wttRenderH2hHeatmap(v);
    });
    document.getElementById('wttFreqBucketSelect')?.addEventListener('change', e => {
        wttDataVizExtraState.freqBucket = e.target.value;
        wttRenderMatchFrequency(e.target.value, wttDataVizExtraState.freqCount);
    });
    document.getElementById('wttFreqDataCount')?.addEventListener('change', () => {
        const v = wttClampInt(document.getElementById('wttFreqDataCount').value, 2, 200);
        document.getElementById('wttFreqDataCount').value = v;
        wttDataVizExtraState.freqCount = v;
        wttRenderMatchFrequency(wttDataVizExtraState.freqBucket, v);
    });
    document.getElementById('wttDistBinCount')?.addEventListener('change', () => {
        const v = wttClampInt(document.getElementById('wttDistBinCount').value, 4, 30);
        document.getElementById('wttDistBinCount').value = v;
        wttDataVizExtraState.distBins = v;
        wttRenderScoreDistribution(v);
    });
    document.getElementById('wttApplyAssocTrend')?.addEventListener('click', () => {
        const sel = wttGetSelectedAssocs();
        if (!sel.length) { alert(i18n[currentLang].wtt_alert_select_assoc); return; }
        if (sel.length > 8) { alert(i18n[currentLang].wtt_alert_max_assoc); return; }
        const dc = parseInt(document.getElementById('wttAssocTrendCount')?.value) || 20;
        wttDataVizExtraState.assocTrendCount = dc;
        wttRenderAssocTrend(sel, dc, wttDataVizExtraState.assocTrendStart, wttDataVizExtraState.assocTrendEnd);
    });
    document.getElementById('wttAssocTrendCount')?.addEventListener('change', () => {
        const sel = wttGetSelectedAssocs();
        const dc = parseInt(document.getElementById('wttAssocTrendCount')?.value) || 20;
        wttDataVizExtraState.assocTrendCount = dc;
        if (sel.length) wttRenderAssocTrend(sel, dc, wttDataVizExtraState.assocTrendStart, wttDataVizExtraState.assocTrendEnd);
    });
    const syncTrendRangeMode = () => {
        const cnt = document.getElementById('wttAssocTrendCount');
        if (cnt) cnt.disabled = !!(wttDataVizExtraState.assocTrendStart || wttDataVizExtraState.assocTrendEnd);
    };
    const trFirst = wttRankingTimeline[0]?.time || '', trLast = wttRankingTimeline[wttRankingTimeline.length - 1]?.time || '';
    ['wttAssocTrendStart', 'wttAssocTrendEnd'].forEach(id => {
        const el = document.getElementById(id);
        if (el && trFirst) { el.min = trFirst; el.max = trLast; }
        el?.addEventListener('change', () => {
            wttDataVizExtraState.assocTrendStart = document.getElementById('wttAssocTrendStart')?.value || '';
            wttDataVizExtraState.assocTrendEnd = document.getElementById('wttAssocTrendEnd')?.value || '';
            syncTrendRangeMode();
            const sel = wttGetSelectedAssocs();
            if (sel.length) wttRenderAssocTrend(sel, wttDataVizExtraState.assocTrendCount, wttDataVizExtraState.assocTrendStart, wttDataVizExtraState.assocTrendEnd);
        });
    });
    syncTrendRangeMode();
    document.getElementById('wttAssocTop5TopN')?.addEventListener('change', () => {
        const v = wttClampInt(document.getElementById('wttAssocTop5TopN').value, 1, 66);
        document.getElementById('wttAssocTop5TopN').value = v;
        wttDataVizExtraState.assocTop5TopN = v;
        wttRenderAssocTop5(v);
    });

    wttInitBarRace();
}

function wttClampInt(v, min, max) {
    let n = parseInt(v);
    if (isNaN(n)) n = min;
    if (n < min) n = min;
    if (n > max) n = max;
    return n;
}

// ============ Bar Chart Race（排名动态竞速 Top 20） ============

const WTT_RACE_TOP_N = 20;
// 协会配色：黄金角色相步进 + 中低饱和度，保证相邻协会色差大且不刺眼
const WTT_RACE_HUE_STEP = 137.508;  // 黄金角（度）
const WTT_RACE_SATURATION = 50;     // 饱和度 %（中低，避免过高）
const WTT_RACE_LIGHTNESS = 55;      // 亮度 %
const WTT_RACE_UNKNOWN_COLOR = '#94a3b8';
const WTT_RACE_FRAME_MS = 700;
const WTT_RACE_BAR_MIN_PCT = 8;  // 横轴最低刻度对应的条形宽度（%），使横轴不从 0 开始

const WTT_RACE_TICK_PCTS = [8, 31, 54, 77, 100];

let wttBarRace = {
    initialized: false,
    playing: false,
    rafId: null,
    frameIndex: 0,
    playClock: 0,          // 当前帧段内累计时长（ms，已含速度倍率）；达到 FRAME_MS 即段完成
    speed: 1,
    enterMs: 400,          // 入场滑入时长（随速度档缩放）
    fadeInMs: 200,         // 入场淡入时长
    fadeOutMs: 350,        // 离场淡出时长
    exitMs: 550,           // 离场下滑时长
    cache: new Map(),
    assocColors: {},
    rowMap: new Map(),
    rowHeight: 32,
    lastTs: null,
    axisTicks: null,       // 复用的坐标轴刻度 span，避免每帧重建 innerHTML
    activeCount: -1        // 上次渲染的活跃行数，避免每帧写容器高度
};

function wttRaceClampNum(v, lo, hi) { return v < lo ? lo : (v > hi ? hi : v); }

// 按当前速度档推导进出场时长，保证各速度档下过渡节奏一致
function wttRaceComputeDurations() {
    const seg = WTT_RACE_FRAME_MS / Math.max(0.01, wttBarRace.speed);
    wttBarRace.enterMs = wttRaceClampNum(seg * 0.7, 180, 600);
    wttBarRace.fadeInMs = wttRaceClampNum(seg * 0.4, 120, 320);
    wttBarRace.fadeOutMs = wttRaceClampNum(seg * 0.6, 160, 480);
    wttBarRace.exitMs = wttRaceClampNum(seg * 0.85, 240, 700);
}

// HSL -> 十六进制颜色（h: 0-360, s/l: 0-100）
function wttHslToHex(h, s, l) {
    h = ((h % 360) + 360) % 360;
    s = Math.max(0, Math.min(100, s)) / 100;
    l = Math.max(0, Math.min(100, l)) / 100;
    const c = (1 - Math.abs(2 * l - 1)) * s;
    const x = c * (1 - Math.abs((h / 60) % 2 - 1));
    const m = l - c / 2;
    let r = 0, g = 0, b = 0;
    if (h < 60) { r = c; g = x; b = 0; }
    else if (h < 120) { r = x; g = c; b = 0; }
    else if (h < 180) { r = 0; g = c; b = x; }
    else if (h < 240) { r = 0; g = x; b = c; }
    else if (h < 300) { r = x; g = 0; b = c; }
    else { r = c; g = 0; b = x; }
    const toHex = v => Math.round((v + m) * 255).toString(16).padStart(2, '0');
    return '#' + toHex(r) + toHex(g) + toHex(b);
}

// 收集全部协会代码并分配稳定颜色（按协会分层设色）
// 按黄金角色相分配，相邻协会色相相差约 137.5°，饱和度/亮度统一控制
function wttBuildBarRaceAssocColors() {
    const codes = new Set();
    for (const name of wttGetAllPlayers()) {
        const a = wttGetPlayerAssoc(name);
        if (a && a.assoc) codes.add(String(a.assoc).toUpperCase());
    }
    const colors = {};
    Array.from(codes).sort().forEach((code, i) => {
        colors[code] = wttHslToHex(i * WTT_RACE_HUE_STEP, WTT_RACE_SATURATION, WTT_RACE_LIGHTNESS);
    });
    return colors;
}

// 懒缓存：按需计算某一帧的 Top 20 数据（含积分、协会、旗帜）
// 该帧所属赛季无比赛数据的球员自动隐去，有比赛数据的赛季正常显示
// byName 保存未截断前的全部分数，供新晋行从「榜外分数」平滑生长
function wttGetBarRaceFrame(frameIndex) {
    if (wttBarRace.cache.has(frameIndex)) return wttBarRace.cache.get(frameIndex);
    const entry = wttRankingTimeline[frameIndex];
    if (!entry) return null;
    const season = wttGetSeasonByLabel(entry.season);
    const seasonActive = wttGetSeasonActivePlayers(season);
    const filterActive = seasonActive && seasonActive.size > 0
        ? name => seasonActive.has(name)
        : () => true;
    const scoreMap = wttBuildSnapshotScoreMap(entry);
    const sorted = Object.keys(scoreMap)
        .filter(filterActive)
        .map(name => {
            const a = wttGetPlayerAssoc(name);
            const code = a && a.assoc ? String(a.assoc).toUpperCase() : '';
            return {
                name,
                score: Number(scoreMap[name]) || 0,
                assoc: code,
                country: (a && a.country) ? a.country : code,
                flagClass: code ? wttAssocFlagClass(code) : ''
            };
        })
        .sort((a, b) => b.score - a.score);
    const byName = new Map();
    for (const it of sorted) byName.set(it.name, it.score);
    const frame = { label: entry.label || '', items: sorted.slice(0, WTT_RACE_TOP_N), byName };
    wttBarRace.cache.set(frameIndex, frame);
    return frame;
}

function wttCreateBarRaceRow(item) {
    const row = document.createElement('div');
    row.className = 'bar-race-row';
    row.setAttribute('data-name', item.name);
    row.innerHTML =
        '<span class="bar-race-rank"></span>' +
        '<span class="bar-race-name" title="' + escapeHtml(item.name) + '">' +
            (item.flagClass ? '<span class="player-flag ' + item.flagClass + '"></span>' : '') +
            '<span class="bar-race-name-text">' + escapeHtml(item.name) + '</span>' +
        '</span>' +
        '<span class="bar-race-track">' +
            '<span class="bar-race-fill"></span>' +
            '<span class="bar-race-value"></span>' +
        '</span>';
    row.style.opacity = '0';
    row.style.zIndex = '2';
    return row;
}

// 行颜色仅在映射变化时写入（初始化或主题/语言重载后刷新一次）
function wttApplyBarRaceRowColor(st) {
    const color = wttBarRace.assocColors[st.colorKey] || WTT_RACE_UNKNOWN_COLOR;
    if (color === st.lastColor) return;
    st.lastColor = color;
    st.fillEl.style.background = color;
    st.valueEl.style.color = color;
}

// 更新行内容（脏检查：仅写发生变化的 DOM 属性，元素引用已在创建时缓存）
function wttUpdateBarRaceRow(st, rank, maxScore, minScore) {
    if (st.lastRank !== rank) {
        st.lastRank = rank;
        st.rankEl.textContent = rank + 1;
        st.rankEl.classList.toggle('top1', rank === 0);
        st.rankEl.classList.toggle('top2', rank === 1);
        st.rankEl.classList.toggle('top3', rank === 2);
    }
    let pct;
    if (maxScore > minScore) {
        pct = WTT_RACE_BAR_MIN_PCT + (st.score - minScore) / (maxScore - minScore) * (100 - WTT_RACE_BAR_MIN_PCT);
    } else {
        pct = 100;
    }
    if (!(Math.abs(pct - st.lastPct) < 0.03)) {
        st.lastPct = pct;
        const s = pct.toFixed(2) + '%';
        st.fillEl.style.width = s;
        st.valueEl.style.left = s;
    }
    const txt = st.score.toFixed(1);
    if (txt !== st.lastTxt) {
        st.lastTxt = txt;
        st.valueEl.textContent = txt;
    }
}

// 读取 CSS 变量中的行高（含行间距）
function wttReadBarRaceRowHeight() {
    const container = document.getElementById('wttBarRaceContainer');
    if (!container) return;
    const v = getComputedStyle(container).getPropertyValue('--bar-race-row-h');
    const n = parseFloat(v);
    if (n > 0) wttBarRace.rowHeight = n;
}

// 坐标轴刻度只创建一次，之后仅更新文本（位置固定不变）
function wttEnsureBarRaceTicks(axisEl) {
    let t = wttBarRace.axisTicks;
    if (t && t.axisEl === axisEl && t.spans[0] && t.spans[0].isConnected) return t;
    axisEl.textContent = '';
    const frag = document.createDocumentFragment();
    const spans = WTT_RACE_TICK_PCTS.map(p => {
        const s = document.createElement('span');
        s.className = 'bar-race-tick';
        s.style.left = p + '%';
        frag.appendChild(s);
        return s;
    });
    axisEl.appendChild(frag);
    t = { axisEl, spans, vals: new Array(WTT_RACE_TICK_PCTS.length).fill(null) };
    wttBarRace.axisTicks = t;
    return t;
}

// 渲染横坐标轴刻度（按当前显示分数范围，在 8%–100% 条宽区间内取 5 个刻度）
function wttRenderBarRaceAxis(axisEl, minScore, maxScore) {
    if (!axisEl) return;
    const t = wttEnsureBarRaceTicks(axisEl);
    for (let i = 0; i < WTT_RACE_TICK_PCTS.length; i++) {
        const pct = WTT_RACE_TICK_PCTS[i];
        const value = maxScore > minScore
            ? minScore + (pct - WTT_RACE_BAR_MIN_PCT) / (100 - WTT_RACE_BAR_MIN_PCT) * (maxScore - minScore)
            : maxScore;
        const txt = value.toFixed(0);
        if (txt !== t.vals[i]) {
            t.vals[i] = txt;
            t.spans[i].textContent = txt;
        }
    }
}

// 根据当前显示分数排序并定位所有行（仅写发生变化的样式，无 CSS 过渡）
// 升入行从榜单底端之外上滑入场；离场行从原位向下滑过底端后移除（层级压低避免与活跃行交叠突兀）
function wttRenderBarRacePositions() {
    const container = document.getElementById('wttBarRaceContainer');
    if (!container) return;

    const rowH = wttBarRace.rowHeight || 32;
    const all = Array.from(wttBarRace.rowMap.values());
    const active = all.filter(st => !st.leaving);
    active.sort((a, b) => b.score - a.score);

    if (active.length !== wttBarRace.activeCount) {
        wttBarRace.activeCount = active.length;
        container.style.height = (active.length * rowH) + 'px';
    }

    const minScore = active.length ? active[active.length - 1].score : 0;
    const maxScore = active.length ? active[0].score : 0;
    const axisEl = document.getElementById('wttRaceScaleLabel');
    if (axisEl) {
        if (active.length) wttRenderBarRaceAxis(axisEl, minScore, maxScore);
        else if (wttBarRace.axisTicks) { axisEl.textContent = ''; wttBarRace.axisTicks = null; }
    }

    const exitBaseY = (active.length + 1) * rowH;
    for (const st of all) {
        if (!st.leaving) continue;
        const startY = st.exitStartY != null ? st.exitStartY : (st.lastY != null ? st.lastY : exitBaseY);
        const targetY = Math.max(startY, exitBaseY);
        const t = st.exitProgress * st.exitProgress; // ease-in，模拟下坠加速
        const y = startY + (targetY - startY) * t;
        st.lastY = y;
        if (st.lastWriteY == null || !(Math.abs(y - st.lastWriteY) < 0.02)) {
            st.lastWriteY = y;
            st.row.style.transform = 'translate3d(0,' + y.toFixed(2) + 'px,0)';
        }
        if (Math.abs(st.opacity - st.lastWriteOpacity) > 0.004) {
            st.lastWriteOpacity = st.opacity;
            st.row.style.opacity = st.opacity.toFixed(3);
        }
    }

    let rankIndex = 0;
    for (const st of active) {
        const y = (rankIndex + (st.enterOffset || 0)) * rowH;
        st.lastY = y;
        if (st.lastWriteY == null || !(Math.abs(y - st.lastWriteY) < 0.02)) {
            st.lastWriteY = y;
            st.row.style.transform = 'translate3d(0,' + y.toFixed(2) + 'px,0)';
        }
        if (Math.abs(st.opacity - st.lastWriteOpacity) > 0.004) {
            st.lastWriteOpacity = st.opacity;
            st.row.style.opacity = st.opacity.toFixed(3);
        }
        wttApplyBarRaceRowColor(st);
        wttUpdateBarRaceRow(st, rankIndex, maxScore, minScore);
        rankIndex++;
    }
}

// 移除已经滑出榜单底端的离场行
function wttBarRaceRemoveLeftovers() {
    for (const [name, st] of Array.from(wttBarRace.rowMap)) {
        if (st.leaving && st.exitProgress >= 1 && st.opacity <= 0.01) {
            st.row.remove();
            wttBarRace.rowMap.delete(name);
        }
    }
}

// 将榜单成员同步到目标帧：
// 新晋行创建/复活并从底端滑入（起点分数取上一帧的榜外分数，使条长随之生长）；
// 掉榜行标记离场；已有行的本段起点固定为其当前显示分数，被打断也不跳变
function wttApplyBarRaceMembership(frameIndex, animate, prevIndex) {
    const container = document.getElementById('wttBarRaceContainer');
    if (!container) return false;

    wttReadBarRaceRowHeight();
    const frame = wttGetBarRaceFrame(frameIndex);
    if (!frame) return false;
    const prevFrame = (animate && prevIndex != null && prevIndex !== frameIndex)
        ? wttGetBarRaceFrame(prevIndex) : null;

    wttBarRace.frameIndex = frameIndex;
    wttDataVizExtraState.raceFrameIndex = frameIndex;
    const slider = document.getElementById('wttRaceSlider');
    if (slider) slider.value = frameIndex;
    const dateLabel = document.getElementById('wttRaceDateLabel');
    if (dateLabel) dateLabel.textContent = frame.label;

    const rowCount = frame.items.length;
    const rowH = wttBarRace.rowHeight || 32;
    const activeNames = new Set();
    let itemIndex = 0;
    for (const item of frame.items) {
        activeNames.add(item.name);
        let st = wttBarRace.rowMap.get(item.name);
        const wasLeaving = st ? st.leaving : false;
        const isNew = !st;
        if (isNew) {
            const row = wttCreateBarRaceRow(item);
            container.appendChild(row);
            st = {
                name: item.name,
                row,
                rankEl: row.querySelector('.bar-race-rank'),
                fillEl: row.querySelector('.bar-race-fill'),
                valueEl: row.querySelector('.bar-race-value'),
                colorKey: item.assoc,
                lastRank: -1,
                lastPct: -99,
                lastTxt: '',
                lastColor: '',
                startScore: item.score,
                endScore: item.score,
                score: item.score,
                opacity: 0,
                lastWriteOpacity: -1,
                leaving: false,
                // 从榜单底端之外升入：初始偏移 = 底边到目标槽位的行距（固定时长滑入）
                enterOffset: animate ? Math.max(1, rowCount - itemIndex) : 0,
                enterTotal: 0,
                exitProgress: 0,
                exitStartY: null,
                lastY: null,
                lastWriteY: null
            };
            st.enterTotal = st.enterOffset;
            wttApplyBarRaceRowColor(st);
            wttBarRace.rowMap.set(item.name, st);
        } else if (wasLeaving) {
            // 离场途中被重新激活：从当前位置平滑归位，避免瞬移
            st.leaving = false;
            st.exitProgress = 0;
            st.exitStartY = null;
            if (animate && st.lastY != null) {
                st.enterOffset = Math.max(0, st.lastY / rowH - itemIndex);
            } else {
                st.enterOffset = 0;
            }
            st.enterTotal = st.enterOffset;
            st.row.style.zIndex = '2';
        }
        st.endScore = item.score;
        if (isNew) {
            st.startScore = (prevFrame && prevFrame.byName.has(item.name))
                ? prevFrame.byName.get(item.name)
                : item.score;
            st.score = st.startScore;
        } else {
            // 起点 = 当前显示分数：无论在何处打断都无缝衔接
            st.startScore = st.score;
        }
        itemIndex++;
    }

    for (const [name, st] of wttBarRace.rowMap) {
        if (!activeNames.has(name) && !st.leaving) {
            st.leaving = true;
            st.exitProgress = 0;
            st.exitStartY = st.lastY;   // 从当前所在位置开始下滑
            st.row.style.zIndex = '1';
        }
    }
    return true;
}

function wttBarRaceEnsureRaf() {
    if (wttBarRace.rafId == null) {
        wttBarRace.lastTs = null;
        wttBarRace.rafId = requestAnimationFrame(wttBarRaceTick);
    }
}

function wttBarRaceCancelRaf() {
    if (wttBarRace.rafId != null) {
        cancelAnimationFrame(wttBarRace.rafId);
        wttBarRace.rafId = null;
    }
    wttBarRace.lastTs = null;
}

// 设置目标帧（手动拖动滑块与外部调用入口）：
// 以当前画面为起点，在一段时长内匀速过渡到该帧
function wttSetBarRaceFrame(frameIndex, animate = true) {
    const B = wttBarRace;
    if (!wttRankingTimeline.length) return;

    if (!animate) {
        B.playing = false;
        if (wttApplyBarRaceMembership(frameIndex, false, frameIndex)) {
            B.playClock = WTT_RACE_FRAME_MS;   // 段完成态，画面静止在该帧
            const frame = wttGetBarRaceFrame(frameIndex);
            for (const st of B.rowMap.values()) {
                st.enterOffset = 0;
                st.enterTotal = 0;
                st.lastWriteOpacity = -1;      // 强制重写透明度
                if (st.leaving) {
                    st.exitProgress = 1;
                    st.opacity = 0;
                } else {
                    const target = frame.byName.has(st.name) ? frame.byName.get(st.name) : st.score;
                    st.startScore = target;
                    st.endScore = target;
                    st.score = target;
                    st.opacity = 1;
                }
            }
            wttRenderBarRacePositions();
            wttBarRaceRemoveLeftovers();
        }
        wttBarRaceCancelRaf();
        return;
    }

    const prevIndex = B.frameIndex;
    B.playing = false;
    B.playClock = 0;
    wttApplyBarRaceMembership(frameIndex, true, prevIndex);
    wttBarRaceSyncPlayButton();
    wttBarRaceEnsureRaf();
}

// 连续动画循环：playClock 按 dt×speed 推进，跨过整帧时切换目标并处理进出场；
// 行分数在段内线性插值 —— 全程匀速运动，无「冲刺-停滞」节奏
function wttBarRaceTick(ts) {
    const B = wttBarRace;
    let busy = false;

    if (B.lastTs == null) B.lastTs = ts;
    const dt = Math.min(64, Math.max(0, ts - B.lastTs));
    B.lastTs = ts;

    // ---- 时间线时钟推进 ----
    if (B.playing || B.playClock < WTT_RACE_FRAME_MS) {
        B.playClock += dt * B.speed;
        let guard = 0;
        while (B.playClock >= WTT_RACE_FRAME_MS && guard++ < 6) {
            if (!B.playing) { B.playClock = WTT_RACE_FRAME_MS; break; } // 暂停后把当前段收尾
            if (B.frameIndex >= wttRankingTimeline.length - 1) {
                // 循环回绕：硬切回第 0 帧（如视频循环）
                B.frameIndex = 0;
                B.playClock = WTT_RACE_FRAME_MS;
                wttApplyBarRaceMembership(0, true, wttRankingTimeline.length - 1);
                break;
            }
            const prevIndex = B.frameIndex;
            B.frameIndex += 1;
            B.playClock -= WTT_RACE_FRAME_MS;
            wttApplyBarRaceMembership(B.frameIndex, true, prevIndex);
        }
        busy = true;
    }

    const blend = Math.min(1, B.playClock / WTT_RACE_FRAME_MS);
    const fadeInStep = dt / B.fadeInMs;
    const fadeOutStep = dt / B.fadeOutMs;
    const exitStep = dt / B.exitMs;

    for (const st of B.rowMap.values()) {
        if (st.leaving) {
            st.exitProgress = Math.min(1, st.exitProgress + exitStep);
            st.opacity = Math.max(0, st.opacity - fadeOutStep);
            if (st.exitProgress < 1 || st.opacity > 0.01) busy = true;
            continue;
        }
        if (st.opacity < 1) {
            st.opacity = Math.min(1, st.opacity + fadeInStep);
            if (st.opacity < 1) busy = true;
        }
        if (st.enterOffset > 0) {
            // 固定时长滑入：无论从底端攀爬多少行，入场耗时一致
            const step = Math.max(1, st.enterTotal) * dt / B.enterMs;
            st.enterOffset = Math.max(0, st.enterOffset - step);
            busy = true;
        }
        if (blend >= 1) {
            if (st.score !== st.endScore) st.score = st.endScore;
        } else {
            st.score = st.startScore + (st.endScore - st.startScore) * blend;
            busy = true;
        }
    }

    wttRenderBarRacePositions();
    wttBarRaceRemoveLeftovers();

    if (busy || B.playing) {
        B.rafId = requestAnimationFrame(wttBarRaceTick);
    } else {
        B.rafId = null;
        B.lastTs = null;
    }
}

function wttBarRaceSyncPlayButton() {
    const btn = document.getElementById('wttRacePlayBtn');
    if (!btn) return;
    const key = wttBarRace.playing ? 'wtt_race_pause' : 'wtt_race_play';
    const icon = wttBarRace.playing ? 'fa-pause' : 'fa-play';
    btn.innerHTML = '<i class="fa-solid ' + icon + '"></i> <span data-i18n="' + key + '">' + escapeHtml(i18n[currentLang][key]) + '</span>';
}

function wttBarRaceStartPlay() {
    const B = wttBarRace;
    if (B.playing) return;
    B.playing = true;
    if (B.playClock >= WTT_RACE_FRAME_MS) {
        // 从静止开播：立即进入下一段（处于末尾则回绕到第 0 帧）
        const prevIndex = B.frameIndex;
        if (prevIndex >= wttRankingTimeline.length - 1) {
            B.frameIndex = 0;
            B.playClock = WTT_RACE_FRAME_MS;
            wttApplyBarRaceMembership(0, true, prevIndex);
        } else {
            B.frameIndex = prevIndex + 1;
            B.playClock = 0;
            wttApplyBarRaceMembership(B.frameIndex, true, prevIndex);
        }
    }
    wttBarRaceSyncPlayButton();
    wttBarRaceEnsureRaf();
}

// 暂停不打断动画：当前段继续播完，画面自然停在整帧上
function wttBarRaceStopPlay() {
    if (!wttBarRace.playing) return;
    wttBarRace.playing = false;
    wttBarRaceSyncPlayButton();
}

function wttInitBarRace() {
    const container = document.getElementById('wttBarRaceContainer');
    const slider = document.getElementById('wttRaceSlider');
    const playBtn = document.getElementById('wttRacePlayBtn');
    const speedSelect = document.getElementById('wttRaceSpeedSelect');
    if (!container || !slider || !playBtn) return;
    if (!wttRankingTimeline || !wttRankingTimeline.length) return;

    wttBarRace.initialized = true;
    wttBarRace.assocColors = wttBuildBarRaceAssocColors();
    wttBarRace.speed = parseFloat(speedSelect && speedSelect.value) || 1;
    wttRaceComputeDurations();
    wttBarRace.frameIndex = (wttDataVizExtraState.raceFrameIndex > 0)
        ? Math.min(wttDataVizExtraState.raceFrameIndex, wttRankingTimeline.length - 1)
        : wttRankingTimeline.length - 1;
    slider.max = wttRankingTimeline.length - 1;
    slider.value = wttBarRace.frameIndex;

    slider.addEventListener('input', () => {
        wttBarRaceStopPlay();
        wttSetBarRaceFrame(wttClampInt(slider.value, 0, wttRankingTimeline.length - 1), true);
    });
    playBtn.addEventListener('click', () => {
        if (wttBarRace.playing) wttBarRaceStopPlay();
        else wttBarRaceStartPlay();
    });
    speedSelect?.addEventListener('change', () => {
        wttBarRace.speed = parseFloat(speedSelect.value) || 1;
        wttRaceComputeDurations();
    });

    // 响应窗口大小变化：行高由 CSS 变量控制，变化后重新读取并重排
    let resizeTimer = null;
    window.addEventListener('resize', () => {
        clearTimeout(resizeTimer);
        resizeTimer = setTimeout(() => {
            wttReadBarRaceRowHeight();
            wttRenderBarRacePositions();
        }, 150);
    });

    // 回到前台时重置时间戳，避免后台节流产生大步进跳变
    document.addEventListener('visibilitychange', () => {
        if (!document.hidden) wttBarRace.lastTs = null;
    });

    wttSetBarRaceFrame(wttBarRace.frameIndex, false);
}

// ============ 战绩统计条形图 ============

function wttRenderRecordBar(topN) {
    const canvas = document.getElementById('wttRecordBarChart');
    if (!canvas) return;
    if (wttRecordBarChart) { wttRecordBarChart.destroy(); wttRecordBarChart = null; }
    const isMobile = window.innerWidth <= 768;
    const allPlayers = wttGetAllPlayers();
    const stats = wttBuildRecordStats(allPlayers);
    const sorted = allPlayers
        .filter(n => stats[n].total > 0)
        .sort((a, b) => stats[b].total - stats[a].total)
        .slice(0, topN);
    if (!sorted.length) return;

    const labels = sorted.map(n => shortenPlayerName(n));
    const wins = sorted.map(n => stats[n].wins);
    const losses = sorted.map(n => stats[n].losses);
    const fullNames = sorted;

    try {
        wttRecordBarChart = new Chart(canvas, {
            type: 'bar',
            data: {
                labels,
                datasets: [
                    { label: i18n[currentLang].wtt_win || i18n[currentLang].data_viz_win, data: wins, backgroundColor: '#52c41a', borderRadius: 4 },
                    { label: i18n[currentLang].wtt_loss, data: losses, backgroundColor: '#ff6b6b', borderRadius: 4 }
                ]
            },
            options: {
                responsive: true, maintainAspectRatio: false,
                indexAxis: 'y',
                interaction: { intersect: false, mode: 'index' },
                plugins: {
                    legend: { position: 'bottom', labels: { usePointStyle: true, padding: isMobile ? 10 : 16, font: { size: isMobile ? 10 : 11, family: "'Poppins', sans-serif" }, boxWidth: isMobile ? 11 : 12 } },
                    tooltip: {
                        backgroundColor: 'rgba(26,29,40,0.9)', titleFont: { size: isMobile ? 12 : 13 }, bodyFont: { size: isMobile ? 11 : 12 }, padding: isMobile ? 8 : 12, cornerRadius: 8,
                        callbacks: { title: items => fullNames[items[0]?.dataIndex] || '', label: ctx => `${ctx.dataset.label}: ${ctx.raw}${(i18n[currentLang] || {}).chart_matches_suffix || ' 场'}` }
                    }
                },
                scales: {
                    x: { beginAtZero: true, grid: { color: 'rgba(128,128,128,0.1)' }, ticks: { font: { size: isMobile ? 10 : 11 } }, title: { display: true, text: i18n[currentLang].wtt_axis_matches || i18n[currentLang].wtt_axis_points, font: { size: isMobile ? 11 : 12 } } },
                    y: { grid: { display: false }, ticks: { font: { size: isMobile ? 10 : 11 } } }
                }
            }
        });
    } catch (err) { console.error('WTT战绩条形图失败', err); }
}

// ============ 效率散点图 ============

function wttRenderEfficiencyScatter(topN) {
    const canvas = document.getElementById('wttEfficiencyScatterChart');
    if (!canvas) return;
    if (wttEfficiencyScatterChart) { wttEfficiencyScatterChart.destroy(); wttEfficiencyScatterChart = null; }
    const isMobile = window.innerWidth <= 768;
    const allPlayers = wttGetAllPlayers();
    const scoreMap = wttBuildCurrentScoreMap();
    const stats = wttBuildRecordStats(allPlayers);

    const data = allPlayers
        .filter(n => (stats[n] && stats[n].total > 0))
        .sort((a, b) => (scoreMap[b] || 0) - (scoreMap[a] || 0))
        .slice(0, topN)
        .map(n => {
            const st = stats[n];
            const wr = st.total > 0 ? (st.wins / st.total) * 100 : 0;
            const r = Math.max(4, Math.min(26, 4 + (wr / 100) * 22));
            return { x: st.total, y: scoreMap[n] || 0, r, player: n, winRate: Math.round(wr * 10) / 10, form: Math.round(wttCalcFormScore(n) * 10) / 10 };
        });
    if (!data.length) return;

    try {
        wttEfficiencyScatterChart = new Chart(canvas, {
            type: 'bubble',
            data: {
                datasets: [{
                    label: i18n[currentLang].wtt_axis_players || i18n[currentLang].wtt_select_player, data,
                    backgroundColor: data.map(() => WTT_CHART_COLORS[0] + '50'),
                    borderColor: WTT_CHART_COLORS[0], borderWidth: isMobile ? 1 : 1.5,
                    hoverBackgroundColor: WTT_CHART_COLORS[0]
                }]
            },
            options: {
                responsive: true, maintainAspectRatio: false,
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        backgroundColor: 'rgba(26,29,40,0.9)', titleFont: { size: isMobile ? 12 : 13 }, bodyFont: { size: isMobile ? 11 : 12 }, padding: isMobile ? 8 : 12, cornerRadius: 8,
                        callbacks: {
                            title: ctx => ctx[0]?.raw?.player || '',
                            label: ctx => {
                                const d = ctx.raw;
                                return [
                                    (i18n[currentLang].wtt_axis_matches || i18n[currentLang].wtt_axis_points) + ': ' + d.x,
                                    (i18n[currentLang].wtt_pts_norm || i18n[currentLang].wtt_axis_points) + ': ' + d.y,
                                    i18n[currentLang].wtt_winrate + ': ' + d.winRate + '%',
                                    i18n[currentLang].wtt_form + ': ' + d.form
                                ].join('  |  ');
                            }
                        }
                    }
                },
                scales: {
                    x: { title: { display: true, text: i18n[currentLang].wtt_axis_matches || i18n[currentLang].wtt_axis_points, font: { size: isMobile ? 11 : 12 } }, grid: { color: 'rgba(128,128,128,0.1)' }, ticks: { font: { size: isMobile ? 10 : 11 } } },
                    y: { title: { display: true, text: i18n[currentLang].wtt_pts_norm || i18n[currentLang].wtt_axis_points, font: { size: isMobile ? 11 : 12 } }, grid: { color: 'rgba(128,128,128,0.1)' }, ticks: { font: { size: isMobile ? 10 : 11 } } }
                }
            }
        });
    } catch (err) { console.error('WTT效率散点图失败', err); }
}

// ============ 交手热力矩阵 ============

function wttRenderH2hHeatmap(topN) {
    const container = document.getElementById('wttH2hHeatmapContainer');
    if (!container) return;
    const allPlayers = wttGetAllPlayers();
    const scoreMap = wttBuildCurrentScoreMap();
    const sortedPlayers = [...allPlayers].sort((a, b) => (scoreMap[b] || 0) - (scoreMap[a] || 0)).slice(0, topN);
    if (sortedPlayers.length < 2) {
        container.innerHTML = '<div class="compare-placeholder"><p>' + i18n[currentLang].wtt_no_data + '</p></div>';
        return;
    }

    // 交手矩阵：wins[row][col] = row 球员胜 col 球员的场次（初始化为 0）
    const matrix = {};
    for (const n of sortedPlayers) matrix[n] = {};
    let maxWins = 0, anyMatch = false;
    if (wttScoreLogData) {
        for (const r of wttScoreLogData) {
            if (!isMatchRecord(r)) continue;
            const w = r['胜者'], l = r['负者'];
            if (!w || !l || !matrix[w] || !matrix[l]) continue;
            matrix[w][l] = (matrix[w][l] || 0) + 1;
            if (matrix[w][l] > maxWins) maxWins = matrix[w][l];
            anyMatch = true;
        }
    }
    if (!anyMatch) {
        container.innerHTML = '<div class="compare-placeholder"><i class="fa-solid fa-people-arrows"></i><p>' + i18n[currentLang].wtt_no_h2h + '</p></div>';
        return;
    }
    maxWins = maxWins || 1;
    const rateMode = wttDataVizExtraState.heatmapMode === 'rate';

    // 列头：正立缩短名，避免竖排导致错位
    const header = sortedPlayers.map(n => `<th class="h2h-col-label" title="${escapeHtml(n)}">${escapeHtml(shortenPlayerName(n))}</th>`).join('');
    let body = '';
    sortedPlayers.forEach(row => {
        body += `<tr><td class="h2h-row-label" title="${escapeHtml(row)}">${escapeHtml(shortenPlayerName(row))}</td>`;
        sortedPlayers.forEach(col => {
            if (row === col) {
                body += `<td class="h2h-cell h2h-diag" title="${escapeHtml(row)}"></td>`;
                return;
            }
            const wins = matrix[row][col] || 0;
            const losses = matrix[col][row] || 0;
            const meets = wins + losses;
            let bg, text, tip;
            if (rateMode) {
                // 胜率模式：以 50% 为分界的红蓝双色标度（蓝=占优，红=劣势）
                if (!meets) {
                    bg = 'rgba(128,128,128,0.06)';
                    text = '-';
                    tip = `${row} → ${col} | ${i18n[currentLang].wtt_total}: 0`;
                } else {
                    const rate = (wins / meets) * 100;
                    text = Math.round(rate) + '%';
                    if (rate >= 50) {
                        bg = `rgba(77,163,255,${(0.12 + ((rate - 50) / 50) * 0.88).toFixed(2)})`;
                    } else {
                        bg = `rgba(255,107,107,${(0.12 + ((50 - rate) / 50) * 0.88).toFixed(2)})`;
                    }
                    tip = i18n[currentLang].wtt_heatmap_cell_rate
                        .replace('{winner}', row).replace('{loser}', col).replace('{r}', rate.toFixed(1)).replace('{n}', meets)
                        + ` | ${i18n[currentLang].wtt_win || i18n[currentLang].data_viz_win}: ${wins} | ${i18n[currentLang].wtt_loss}: ${losses}`;
                }
            } else {
                const alpha = wins / maxWins;
                bg = wins > 0 ? `rgba(77,163,255,${(0.12 + alpha * 0.88).toFixed(2)})` : 'rgba(128,128,128,0.06)';
                text = wins;
                tip = i18n[currentLang].wtt_heatmap_cell
                    .replace('{winner}', row).replace('{loser}', col).replace('{n}', wins)
                    + ` | ${i18n[currentLang].wtt_loss}: ${losses} | ${i18n[currentLang].wtt_total}: ${meets}`;
            }
            body += `<td class="h2h-cell" data-row="${escapeHtml(row)}" data-col="${escapeHtml(col)}" style="background:${bg};" title="${escapeHtml(tip)}">${text}</td>`;
        });
        body += '</tr>';
    });

    // 颜色说明
    const legend = rateMode
        ? `<div class="h2h-legend"><span class="h2h-legend-label">${escapeHtml(i18n[currentLang].wtt_heatmap_hint_rate)}</span>` +
          `<span class="h2h-legend-bar"><b style="margin-left:0;margin-right:4px;">0%</b><i style="background:rgba(255,107,107,0.9);"></i><i style="background:rgba(255,107,107,0.35);"></i><i style="background:rgba(128,128,128,0.10);"></i><i style="background:rgba(77,163,255,0.35);"></i><i style="background:rgba(77,163,255,0.9);"></i><b>100%</b></span></div>`
        : `<div class="h2h-legend"><span class="h2h-legend-label">${escapeHtml(i18n[currentLang].wtt_heatmap_hint)}</span>` +
          `<span class="h2h-legend-bar"><i style="background:rgba(128,128,128,0.06);"></i><i style="background:rgba(77,163,255,0.3);"></i><i style="background:rgba(77,163,255,0.6);"></i><i style="background:rgba(77,163,255,0.9);"></i><b>${maxWins}</b></span></div>`;

    container.innerHTML = `<div class="h2h-heatmap-wrapper"><table class="h2h-heatmap-table"><thead><tr><th class="h2h-corner"></th>${header}</tr></thead><tbody>${body}</tbody></table>${legend}</div>`;

    // 悬停高亮镜像格：光标停在 A-B 时，B-A 同样突出
    const tbl = container.querySelector('.h2h-heatmap-table');
    if (tbl) {
        const cellMap = {};
        tbl.querySelectorAll('.h2h-cell[data-row]').forEach(cell => {
            cellMap[cell.getAttribute('data-row') + '\n' + cell.getAttribute('data-col')] = cell;
        });
        const clearMirror = () => {
            const prev = tbl.querySelector('.h2h-mirror-hover');
            if (prev) prev.classList.remove('h2h-mirror-hover');
        };
        tbl.addEventListener('mouseover', (e) => {
            clearMirror();
            const cell = e.target.closest('.h2h-cell[data-row]');
            if (!cell) return;
            const mirror = cellMap[(cell.getAttribute('data-col') || '') + '\n' + (cell.getAttribute('data-row') || '')];
            if (mirror && mirror !== cell) mirror.classList.add('h2h-mirror-hover');
        });
        tbl.addEventListener('mouseleave', clearMirror);
    }
}

// ============ 比赛频次时间轴 ============

function wttRenderMatchFrequency(bucketType, count) {
    const canvas = document.getElementById('wttMatchFrequencyChart');
    if (!canvas) return;
    if (wttMatchFrequencyChart) { wttMatchFrequencyChart.destroy(); wttMatchFrequencyChart = null; }
    const isMobile = window.innerWidth <= 768;

    const records = (wttScoreLogData || []).filter(isMatchRecord);
    if (!records.length) return;
    let buckets = buildFrequencyBuckets(records, bucketType);
    if (buckets.length > count) buckets = buckets.slice(-count);

    const typeTotals = {};
    for (const b of buckets) {
        for (const [t, c] of Object.entries(b.types)) typeTotals[t] = (typeTotals[t] || 0) + c;
    }
    const sortedTypes = Object.entries(typeTotals).sort((a, b) => b[1] - a[1]);
    const mainTypes = sortedTypes.slice(0, 4).map(x => x[0]);
    const otherLabel = i18n[currentLang].wtt_other;

    const labels = buckets.map(b => b.label);
    const datasets = mainTypes.map((t, idx) => {
        return { label: t, data: buckets.map(b => b.types[t] || 0), backgroundColor: WTT_CHART_COLORS[idx % WTT_CHART_COLORS.length], stack: 'freq' };
    });
    if (sortedTypes.length > 4) {
        datasets.push({
            label: otherLabel,
            data: buckets.map(b => {
                let sum = 0;
                for (const [t, c] of Object.entries(b.types)) if (!mainTypes.includes(t)) sum += c;
                return sum;
            }),
            backgroundColor: WTT_CHART_COLORS[6 % WTT_CHART_COLORS.length],
            stack: 'freq'
        });
    }

    try {
        wttMatchFrequencyChart = new Chart(canvas, {
            type: 'bar',
            data: { labels, datasets },
            options: {
                responsive: true, maintainAspectRatio: false,
                plugins: {
                    legend: { position: 'bottom', labels: { usePointStyle: true, padding: isMobile ? 10 : 16, font: { size: isMobile ? 10 : 11, family: "'Poppins', sans-serif" }, boxWidth: isMobile ? 11 : 12 } },
                    tooltip: { backgroundColor: 'rgba(26,29,40,0.9)', titleFont: { size: isMobile ? 12 : 13 }, bodyFont: { size: isMobile ? 11 : 12 }, padding: isMobile ? 8 : 12, cornerRadius: 8, callbacks: { label: ctx => `${ctx.dataset.label}: ${ctx.raw}${(i18n[currentLang] || {}).chart_matches_suffix || ' 场'}` } }
                },
                scales: {
                    x: { stacked: true, grid: { color: 'rgba(128,128,128,0.1)' }, ticks: { font: { size: isMobile ? 10 : 11 }, maxRotation: isMobile ? 45 : 0 } },
                    y: { stacked: true, beginAtZero: true, grid: { color: 'rgba(128,128,128,0.1)' }, ticks: { font: { size: isMobile ? 10 : 11 } }, title: { display: true, text: i18n[currentLang].wtt_axis_matches || i18n[currentLang].wtt_axis_points, font: { size: isMobile ? 11 : 12 } } }
                }
            }
        });
    } catch (err) { console.error('WTT比赛频次时间轴失败', err); }
}

// ============ 积分区间分布 ============

// 柱顶数值标签插件：无需悬停即在每根柱形上方显示人数（0 值不显示）
const wttDistValueLabelPlugin = {
    id: 'distValueLabels',
    afterDatasetsDraw(chart, args, opts) {
        const meta = chart.getDatasetMeta(0);
        const data = chart.data.datasets[0] && chart.data.datasets[0].data;
        if (!meta || !data) return;
        const isDark = (typeof isDarkTheme === 'function' ? isDarkTheme() : false);
        const ctx = chart.ctx;
        ctx.save();
        ctx.fillStyle = isDark ? '#aeb4c2' : '#4a5568';
        ctx.font = ((opts && opts.fontSize) || 10) + 'px "Poppins", "Microsoft YaHei", sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'bottom';
        meta.data.forEach((bar, i) => {
            const v = data[i];
            if (!v) return;
            ctx.fillText(String(v), bar.x, bar.y - 3);
        });
        ctx.restore();
    }
};

function wttRenderScoreDistribution(bins) {
    const canvas = document.getElementById('wttScoreDistributionChart');
    if (!canvas) return;
    if (wttScoreDistributionChart) { wttScoreDistributionChart.destroy(); wttScoreDistributionChart = null; }
    const isMobile = window.innerWidth <= 768;
    const scoreMap = wttBuildCurrentScoreMap();
    const scores = Object.values(scoreMap);
    if (!scores.length) return;

    let min = Math.min(...scores), max = Math.max(...scores);
    if (min === max) { min -= 50; max += 50; }
    bins = wttClampInt(bins, 4, 30);
    const rawStep = (max - min) / bins;
    const mag = Math.pow(10, Math.floor(Math.log10(rawStep)));
    let step = Math.ceil(rawStep / mag) * mag;
    const start = Math.floor(min / step) * step;
    const end = Math.ceil(max / step) * step;

    const counts = new Array(Math.max(1, Math.round((end - start) / step))).fill(0);
    const labels = [];
    for (let s = start; s < end; s += step) {
        const lo = s, hi = s + step;
        labels.push(lo.toFixed(0) + '–' + hi.toFixed(0));
        const idx = (s - start) / step;
        counts[idx] = scores.filter(v => v >= lo && v < hi).length;
    }
    counts[counts.length - 1] = scores.filter(v => v >= end - step && v <= max).length;

    try {
        wttScoreDistributionChart = new Chart(canvas, {
            type: 'bar',
            data: {
                labels,
                datasets: [{ label: i18n[currentLang].wtt_axis_count || i18n[currentLang].wtt_axis_points, data: counts, backgroundColor: WTT_CHART_COLORS[0] + '90', borderRadius: 4 }]
            },
            options: {
                responsive: true, maintainAspectRatio: false,
                plugins: {
                    distValueLabels: { fontSize: isMobile ? 9 : 10 },
                    legend: { display: false },
                    tooltip: { backgroundColor: 'rgba(26,29,40,0.9)', titleFont: { size: isMobile ? 12 : 13 }, bodyFont: { size: isMobile ? 11 : 12 }, padding: isMobile ? 8 : 12, cornerRadius: 8, callbacks: { label: ctx => (i18n[currentLang].wtt_axis_count || i18n[currentLang].wtt_axis_points) + ': ' + ctx.raw } }
                },
                scales: {
                    x: { grid: { color: 'rgba(128,128,128,0.1)' }, ticks: { font: { size: isMobile ? 10 : 11 }, maxRotation: isMobile ? 45 : 0 } },
                    y: { beginAtZero: true, grace: '12%', grid: { color: 'rgba(128,128,128,0.1)' }, ticks: { font: { size: isMobile ? 10 : 11 } }, title: { display: true, text: i18n[currentLang].wtt_axis_count || i18n[currentLang].wtt_axis_points, font: { size: isMobile ? 11 : 12 } } }
                }
            },
            plugins: [wttDistValueLabelPlugin]
        });
    } catch (err) { console.error('WTT积分区间分布失败', err); }
}

// ============ 协会积分趋势（折线） ============

function wttRenderAssocCheckboxes() {
    const container = document.getElementById('wttAssocCheckboxList');
    if (!container) return;
    if (!wttPlayerAssocData) {
        container.innerHTML = '<div style="padding:20px;text-align:center;color:var(--text-muted);">' + i18n[currentLang].wtt_no_data + '</div>';
        return;
    }
    const list = wttComputeAssocStrengthList(wttBuildCurrentScoreMap());
    if (!list.length) {
        container.innerHTML = '<div style="padding:20px;text-align:center;color:var(--text-muted);">' + i18n[currentLang].wtt_no_data + '</div>';
        return;
    }
    container.innerHTML = list.map((a, i) => {
        const checked = i < 8 ? 'checked' : '';
        const cls = wttAssocFlagClass(a.assoc);
        const flag = cls ? `<span class="player-flag ${cls}"></span>` : '';
        return `<label class="player-checkbox-item ${i < 8 ? 'checked' : ''}"><input type="checkbox" value="${escapeHtml(a.assoc)}" ${checked}>` +
            `<span class="assoc-checkbox-label">${flag}${escapeHtml(a.country || a.assoc)}</span>` +
            `<span class="player-rank">${a.score.toFixed(1)}</span></label>`;
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

function wttGetSelectedAssocs() {
    return Array.from(document.querySelectorAll('#wttAssocCheckboxList input[type="checkbox"]:checked')).map(cb => cb.value);
}

function wttRenderAssocTrend(assocCodes, dataCount, startDate, endDate) {
    const canvas = document.getElementById('wttAssocTrendChart');
    if (!canvas || !wttRankingTimeline.length) return;
    if (wttAssocTrendChart) { wttAssocTrendChart.destroy(); wttAssocTrendChart = null; }
    if (!assocCodes || !assocCodes.length) return;

    let sliced;
    if (startDate && endDate && startDate > endDate) { const tmp = startDate; startDate = endDate; endDate = tmp; }
    if (startDate || endDate) {
        sliced = wttRankingTimeline.filter(t => t.time &&
            (!startDate || t.time >= startDate) && (!endDate || t.time <= endDate));
    } else {
        dataCount = Math.max(2, Math.min(dataCount || 20, wttRankingTimeline.length));
        sliced = wttRankingTimeline.slice(-dataCount);
    }
    if (!sliced.length) return;
    const isMobile = window.innerWidth <= 768;
    const countryMap = wttBuildAssocCountryMap();

    const labels = sliced.map(t => t.label);
    const strengthByAssoc = {};
    for (const code of assocCodes) strengthByAssoc[code] = [];
    for (const t of sliced) {
        const scoreMap = wttBuildSnapshotScoreMap(t);
        const list = wttComputeAssocStrengthList(scoreMap, wttGetSeasonByLabel(t.season));
        const m = {};
        for (const a of list) m[a.assoc] = a.score;
        for (const code of assocCodes) strengthByAssoc[code].push(m[code] != null ? m[code] : null);
    }

    const datasets = assocCodes.map((code, idx) => ({
        label: countryMap[code] || code,
        data: strengthByAssoc[code],
        borderColor: WTT_CHART_COLORS[idx % WTT_CHART_COLORS.length],
        backgroundColor: WTT_CHART_COLORS[idx % WTT_CHART_COLORS.length] + '20',
        borderWidth: isMobile ? 1.5 : 2,
        pointRadius: isMobile ? 2 : 3,
        pointHoverRadius: isMobile ? 4 : 6,
        tension: 0.3, fill: false, spanGaps: true
    }));

    try {
        wttAssocTrendChart = new Chart(canvas, {
            type: 'line', data: { labels, datasets },
            options: {
                responsive: true, maintainAspectRatio: false,
                interaction: { intersect: false, mode: 'index' },
                plugins: {
                    legend: { position: 'bottom', display: !isMobile, labels: { usePointStyle: true, padding: isMobile ? 10 : 16, font: { size: isMobile ? 10 : 11, family: "'Poppins', sans-serif" }, boxWidth: isMobile ? 11 : 12 } },
                    tooltip: { backgroundColor: 'rgba(26,29,40,0.9)', titleFont: { size: isMobile ? 12 : 13 }, bodyFont: { size: isMobile ? 11 : 12 }, padding: isMobile ? 8 : 12, cornerRadius: 8, itemSort: (a, b) => (b.parsed.y ?? -Infinity) - (a.parsed.y ?? -Infinity), callbacks: { label: ctx => `${ctx.dataset.label}: ${ctx.raw == null ? '-' : ctx.raw.toFixed(1)}` } }
                },
                scales: {
                    x: { grid: { color: 'rgba(128,128,128,0.1)' }, ticks: { font: { size: isMobile ? 10 : 11 }, maxRotation: isMobile ? 45 : 0 } },
                    y: { beginAtZero: false, grid: { color: 'rgba(128,128,128,0.1)' }, ticks: { font: { size: isMobile ? 10 : 11 } }, title: { display: true, text: i18n[currentLang].wtt_assoc_strength_axis, font: { size: isMobile ? 11 : 12 } } }
                }
            }
        });
    } catch (err) { console.error('WTT协会积分趋势失败', err); }
}

// ============ 协会前五球员（分组柱状） ============

function wttRenderAssocTop5(topN) {
    const canvas = document.getElementById('wttAssocTop5Chart');
    const legendEl = document.getElementById('wttAssocTop5Legend');
    if (!canvas) return;
    if (wttAssocTop5Chart) { wttAssocTop5Chart.destroy(); wttAssocTop5Chart = null; }
    if (!wttPlayerAssocData) {
        if (legendEl) legendEl.innerHTML = '<div class="compare-placeholder"><p>' + i18n[currentLang].wtt_no_data + '</p></div>';
        return;
    }
    const isMobile = window.innerWidth <= 768;
    const list = wttComputeAssocStrengthList(wttBuildCurrentScoreMap()).slice(0, topN);
    if (!list.length) {
        if (legendEl) legendEl.innerHTML = '<div class="compare-placeholder"><p>' + i18n[currentLang].wtt_no_data + '</p></div>';
        return;
    }

    const labels = list.map(a => a.country || a.assoc);
    const rankColors = ['#4da3ff', '#6fb7ff', '#90cbff', '#b1dfff', '#d2efff'];
    const datasets = [0, 1, 2, 3, 4].map(rank => ({
        label: i18n[currentLang].wtt_assoc_rank_n.replace('{n}', rank + 1),
        data: list.map(a => (a.top5[rank] ? a.top5[rank].score : 0)),
        backgroundColor: rankColors[rank],
        borderRadius: 4
    }));

    try {
        wttAssocTop5Chart = new Chart(canvas, {
            type: 'bar',
            data: { labels, datasets },
            options: {
                responsive: true, maintainAspectRatio: false,
                interaction: { intersect: false, mode: 'index' },
                plugins: {
                    legend: { position: 'bottom', labels: { usePointStyle: true, padding: isMobile ? 10 : 16, font: { size: isMobile ? 10 : 11, family: "'Poppins', sans-serif" }, boxWidth: isMobile ? 11 : 12 } },
                    tooltip: {
                        backgroundColor: 'rgba(26,29,40,0.9)', titleFont: { size: isMobile ? 12 : 13 }, bodyFont: { size: isMobile ? 11 : 12 }, padding: isMobile ? 8 : 12, cornerRadius: 8,
                        callbacks: {
                            title: items => {
                                const a = items[0] && list[items[0].dataIndex];
                                if (!a) return '';
                                return (a.country || a.assoc) + ' · ' + i18n[currentLang].wtt_assoc_players_count.replace('{n}', a.count);
                            },
                            label: ctx => {
                                const a = list[ctx.dataIndex];
                                const p = a && a.top5[ctx.datasetIndex];
                                const rankLabel = i18n[currentLang].wtt_assoc_rank_n.replace('{n}', ctx.datasetIndex + 1);
                                return p ? `${rankLabel} ${p.name}: ${p.score.toFixed(1)}` : `${rankLabel}: -`;
                            }
                        }
                    }
                },
                scales: {
                    x: { grid: { color: 'rgba(128,128,128,0.1)' }, ticks: { font: { size: isMobile ? 9 : 10 }, maxRotation: isMobile ? 45 : 0 } },
                    y: { beginAtZero: false, grid: { color: 'rgba(128,128,128,0.1)' }, ticks: { font: { size: isMobile ? 10 : 11 } }, title: { display: true, text: i18n[currentLang].wtt_axis_points, font: { size: isMobile ? 11 : 12 } } }
                }
            }
        });
    } catch (err) { console.error('WTT协会前五柱状图失败', err); }

    wttRenderAssocFlagLegend('wttAssocTop5Legend', list.map(a => ({ assoc: a.assoc, country: a.country })));
}

// ============ 语言切换重绘 ============

function wttReapplyDataVizExtra() {
    if (!document.getElementById('wttRecordBarChart')) return;
    wttRenderRecordBar(wttDataVizExtraState.recordTopN);
    wttRenderEfficiencyScatter(wttDataVizExtraState.efficiencyTopN);
    wttRenderH2hHeatmap(wttDataVizExtraState.heatmapTopN);
    wttRenderMatchFrequency(wttDataVizExtraState.freqBucket, wttDataVizExtraState.freqCount);
    wttRenderScoreDistribution(wttDataVizExtraState.distBins);
    const assocSel = wttGetSelectedAssocs();
    if (assocSel.length) wttRenderAssocTrend(assocSel, wttDataVizExtraState.assocTrendCount, wttDataVizExtraState.assocTrendStart, wttDataVizExtraState.assocTrendEnd);
    wttRenderAssocTop5(wttDataVizExtraState.assocTop5TopN);
    if (wttBarRace.initialized) {
        wttBarRace.assocColors = wttBuildBarRaceAssocColors();
        wttBarRaceSyncPlayButton();
        wttSetBarRaceFrame(wttDataVizExtraState.raceFrameIndex, false);
    }
}
