/* ========================================
   wtt_dataviz_extra.js - WTT 数据可视化扩展板块
   复刻 data-viz-extra.js，使用 WTT 系列数据
   ======================================== */

let wttRecordBarChart = null, wttEfficiencyScatterChart = null, wttMatchFrequencyChart = null, wttScoreDistributionChart = null;
let wttAssocTrendChart = null, wttAssocTop5Chart = null;
let wttDataVizExtraState = { recordTopN: 10, efficiencyTopN: 15, heatmapTopN: 8, freqBucket: 'week', freqCount: 24, distBins: 10, assocTrendCount: 20, assocTop5TopN: 8, raceFrameIndex: 0 };

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
            return y + '年' + parseInt(m) + '月';
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
function wttComputeAssocStrengthList(scoreMap) {
    const assocPlayers = wttBuildAssocPlayerMap();
    const countryMap = wttBuildAssocCountryMap();
    // 不计算本赛季无比赛数据的球员
    const activeThisSeason = wttGetSeasonActivePlayers(wttGetCurrentSeason());
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
    wttDataVizExtraState.distBins = parseInt(document.getElementById('wttDistBinCount')?.value) || 10;
    wttDataVizExtraState.assocTrendCount = parseInt(document.getElementById('wttAssocTrendCount')?.value) || 20;
    wttDataVizExtraState.assocTop5TopN = parseInt(document.getElementById('wttAssocTop5TopN')?.value) || 8;
    wttRenderRecordBar(wttDataVizExtraState.recordTopN);
    wttRenderEfficiencyScatter(wttDataVizExtraState.efficiencyTopN);
    wttRenderH2hHeatmap(wttDataVizExtraState.heatmapTopN);
    wttRenderMatchFrequency(wttDataVizExtraState.freqBucket, wttDataVizExtraState.freqCount);
    wttRenderScoreDistribution(wttDataVizExtraState.distBins);
    wttRenderAssocCheckboxes();
    wttRenderAssocTrend(wttGetSelectedAssocs(), wttDataVizExtraState.assocTrendCount);
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
        wttRenderAssocTrend(sel, dc);
    });
    document.getElementById('wttAssocTrendCount')?.addEventListener('change', () => {
        const sel = wttGetSelectedAssocs();
        const dc = parseInt(document.getElementById('wttAssocTrendCount')?.value) || 20;
        wttDataVizExtraState.assocTrendCount = dc;
        if (sel.length) wttRenderAssocTrend(sel, dc);
    });
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

let wttBarRace = {
    initialized: false,
    playing: false,
    timer: null,
    rafId: null,
    frameIndex: 0,
    speed: 1,
    cache: new Map(),
    assocColors: {},
    rowMap: new Map(),
    rowHeight: 32,
    lastTs: null
};

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
    const items = Object.keys(scoreMap)
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
        .sort((a, b) => b.score - a.score)
        .slice(0, WTT_RACE_TOP_N);
    const frame = { label: entry.label || '', items };
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
    return row;
}

function wttUpdateBarRaceRow(row, item, rank, maxScore, minScore) {
    const rankEl = row.querySelector('.bar-race-rank');
    const fillEl = row.querySelector('.bar-race-fill');
    const valueEl = row.querySelector('.bar-race-value');
    const nameTextEl = row.querySelector('.bar-race-name-text');
    if (rankEl) {
        rankEl.textContent = rank + 1;
        rankEl.classList.toggle('top1', rank === 0);
        rankEl.classList.toggle('top2', rank === 1);
        rankEl.classList.toggle('top3', rank === 2);
    }
    if (nameTextEl) nameTextEl.textContent = item.name;
    if (fillEl) {
        let pct;
        if (maxScore > minScore) {
            pct = WTT_RACE_BAR_MIN_PCT + (item.score - minScore) / (maxScore - minScore) * (100 - WTT_RACE_BAR_MIN_PCT);
        } else {
            pct = 100;
        }
        const color = wttBarRace.assocColors[item.assoc] || WTT_RACE_UNKNOWN_COLOR;
        fillEl.style.width = pct.toFixed(2) + '%';
        fillEl.style.background = color;
        if (valueEl) {
            valueEl.textContent = item.score.toFixed(1);
            valueEl.style.left = pct.toFixed(2) + '%';
            valueEl.style.color = color;
        }
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

// 渲染横坐标轴刻度（按当前显示分数范围，在 8%–100% 条宽区间内取 5 个刻度）
function wttRenderBarRaceAxis(axisEl, minScore, maxScore) {
    if (!axisEl) return;
    const tickPcts = [8, 31, 54, 77, 100];
    axisEl.innerHTML = tickPcts.map(pct => {
        const value = maxScore > minScore
            ? minScore + (pct - WTT_RACE_BAR_MIN_PCT) / (100 - WTT_RACE_BAR_MIN_PCT) * (maxScore - minScore)
            : maxScore;
        return '<span class="bar-race-tick" style="left:' + pct + '%;">' + value.toFixed(0) + '</span>';
    }).join('');
}

// 根据当前显示分数排序并定位所有行（每帧调用，直接设置 transform/width，无 CSS 过渡）
function wttRenderBarRacePositions() {
    const container = document.getElementById('wttBarRaceContainer');
    if (!container) return;

    const active = Array.from(wttBarRace.rowMap.values()).filter(st => !st.leaving);
    active.sort((a, b) => b.score - a.score);

    const rowH = wttBarRace.rowHeight || 32;
    container.style.height = (active.length * rowH) + 'px';

    const minScore = active.length ? active[active.length - 1].score : 0;
    const maxScore = active.length ? active[0].score : 0;
    const axisEl = document.getElementById('wttRaceScaleLabel');
    if (axisEl) {
        if (active.length) wttRenderBarRaceAxis(axisEl, minScore, maxScore);
        else axisEl.innerHTML = '';
    }

    active.forEach((st, i) => {
        const offset = st.enterOffset || 0;
        st.row.style.transform = 'translateY(' + ((i + offset) * rowH) + 'px)';
        st.row.style.opacity = st.opacity;
        wttUpdateBarRaceRow(st.row, { name: st.name, score: st.score, assoc: st.assoc }, i, maxScore, minScore);
    });
}

// 移除已经淡出的离场行
function wttBarRaceRemoveLeftovers() {
    for (const [name, st] of Array.from(wttBarRace.rowMap)) {
        if (st.leaving && st.opacity <= 0.01) {
            st.row.remove();
            wttBarRace.rowMap.delete(name);
        }
    }
}

// 设置目标帧：更新每个球员的目标分数，并启动连续插值动画
function wttSetBarRaceFrame(frameIndex, animate = true) {
    const container = document.getElementById('wttBarRaceContainer');
    if (!container || !wttRankingTimeline.length) return;
    const frame = wttGetBarRaceFrame(frameIndex);
    if (!frame) return;

    wttBarRace.frameIndex = frameIndex;
    wttDataVizExtraState.raceFrameIndex = frameIndex;
    const slider = document.getElementById('wttRaceSlider');
    if (slider) slider.value = frameIndex;
    const dateLabel = document.getElementById('wttRaceDateLabel');
    if (dateLabel) dateLabel.textContent = frame.label;

    wttReadBarRaceRowHeight();

    const activeNames = new Set();
    for (const item of frame.items) {
        activeNames.add(item.name);
        let st = wttBarRace.rowMap.get(item.name);
        if (!st) {
            const row = wttCreateBarRaceRow(item);
            container.appendChild(row);
            st = {
                name: item.name,
                row,
                score: item.score,
                targetScore: item.score,
                opacity: 0,
                leaving: false,
                assoc: item.assoc,
                enterOffset: animate ? 1.2 : 0
            };
            wttBarRace.rowMap.set(item.name, st);
        }
        st.targetScore = item.score;
        st.leaving = false;
    }

    for (const [name, st] of wttBarRace.rowMap) {
        if (!activeNames.has(name) && !st.leaving) {
            st.leaving = true;
            st.targetScore = st.score;
        }
    }

    if (!animate) {
        for (const st of wttBarRace.rowMap.values()) {
            st.score = st.targetScore;
            st.opacity = st.leaving ? 0 : 1;
            st.row.style.opacity = st.opacity;
        }
        wttRenderBarRacePositions();
        wttBarRaceRemoveLeftovers();
        return;
    }

    if (wttBarRace.rafId == null) {
        wttBarRace.lastTs = null;
        wttBarRace.rafId = requestAnimationFrame(wttBarRaceTick);
    }
}

// 连续动画循环：分数指数趋近目标，排名/条长随每帧重算
function wttBarRaceTick(ts) {
    let needsAnotherFrame = false;
    if (wttBarRace.lastTs == null) {
        wttBarRace.lastTs = ts;
        needsAnotherFrame = true;
    }
    const dt = Math.min(64, Math.max(0, ts - wttBarRace.lastTs));
    wttBarRace.lastTs = ts;

    const scoreSmoothing = 1 - Math.exp(-dt / 220);   // 时间常数 ~220ms，分数过渡更绵长顺滑
    const fadeInRate = dt / 180;
    const fadeOutRate = dt / 220;

    for (const st of wttBarRace.rowMap.values()) {
        if (st.leaving) {
            st.opacity = Math.max(0, st.opacity - fadeOutRate);
            st.row.style.opacity = st.opacity;
            if (st.opacity > 0.01) needsAnotherFrame = true;
        } else {
            if (st.opacity < 1) {
                st.opacity = Math.min(1, st.opacity + fadeInRate);
                st.row.style.opacity = st.opacity;
                if (st.opacity < 1) needsAnotherFrame = true;
            }
            if (st.enterOffset > 0) {
                st.enterOffset = Math.max(0, st.enterOffset - dt / 260);
                needsAnotherFrame = true;
            }
            const diff = st.targetScore - st.score;
            if (Math.abs(diff) > 0.05) {
                st.score += diff * scoreSmoothing;
                if (Math.abs(st.targetScore - st.score) < 0.05) st.score = st.targetScore;
                needsAnotherFrame = true;
            }
        }
    }

    wttRenderBarRacePositions();
    wttBarRaceRemoveLeftovers();

    if (needsAnotherFrame) {
        wttBarRace.rafId = requestAnimationFrame(wttBarRaceTick);
    } else {
        wttBarRace.rafId = null;
    }
}

function wttBarRaceSyncPlayButton() {
    const btn = document.getElementById('wttRacePlayBtn');
    if (!btn) return;
    const key = wttBarRace.playing ? 'wtt_race_pause' : 'wtt_race_play';
    const icon = wttBarRace.playing ? 'fa-pause' : 'fa-play';
    btn.innerHTML = '<i class="fa-solid ' + icon + '"></i> <span data-i18n="' + key + '">' + escapeHtml(i18n[currentLang][key]) + '</span>';
}

function wttBarRaceAdvance() {
    const max = wttRankingTimeline.length - 1;
    wttBarRace.frameIndex = wttBarRace.frameIndex >= max ? 0 : wttBarRace.frameIndex + 1;
    wttSetBarRaceFrame(wttBarRace.frameIndex, true);
}

function wttBarRaceStartTimer() {
    if (wttBarRace.timer) { clearInterval(wttBarRace.timer); wttBarRace.timer = null; }
    wttBarRace.timer = setInterval(wttBarRaceAdvance, Math.max(120, WTT_RACE_FRAME_MS / wttBarRace.speed));
}

function wttBarRaceStartPlay() {
    if (wttBarRace.playing) return;
    wttBarRace.playing = true;
    wttBarRaceSyncPlayButton();
    wttBarRaceStartTimer();
}

function wttBarRaceStopPlay() {
    if (!wttBarRace.playing && !wttBarRace.timer) return;
    wttBarRace.playing = false;
    if (wttBarRace.timer) { clearInterval(wttBarRace.timer); wttBarRace.timer = null; }
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
    wttBarRace.frameIndex = (wttDataVizExtraState.raceFrameIndex > 0)
        ? Math.min(wttDataVizExtraState.raceFrameIndex, wttRankingTimeline.length - 1)
        : wttRankingTimeline.length - 1;
    slider.max = wttRankingTimeline.length - 1;
    slider.value = wttBarRace.frameIndex;

    slider.addEventListener('input', () => {
        wttBarRaceStopPlay();
        wttBarRace.frameIndex = wttClampInt(slider.value, 0, wttRankingTimeline.length - 1);
        wttSetBarRaceFrame(wttBarRace.frameIndex, true);
    });
    playBtn.addEventListener('click', () => {
        if (wttBarRace.playing) wttBarRaceStopPlay();
        else wttBarRaceStartPlay();
    });
    speedSelect?.addEventListener('change', () => {
        wttBarRace.speed = parseFloat(speedSelect.value) || 1;
        if (wttBarRace.playing) wttBarRaceStartTimer();
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
                        callbacks: { title: items => fullNames[items[0]?.dataIndex] || '', label: ctx => `${ctx.dataset.label}: ${ctx.raw} 场` }
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
            const alpha = wins / maxWins;
            const bg = wins > 0 ? `rgba(77,163,255,${(0.12 + alpha * 0.88).toFixed(2)})` : 'rgba(128,128,128,0.06)';
            const tip = i18n[currentLang].wtt_heatmap_cell
                .replace('{winner}', row).replace('{loser}', col).replace('{n}', wins)
                + ` | ${i18n[currentLang].wtt_loss}: ${losses} | ${i18n[currentLang].wtt_total}: ${meets}`;
            body += `<td class="h2h-cell" data-row="${escapeHtml(row)}" data-col="${escapeHtml(col)}" style="background:${bg};" title="${escapeHtml(tip)}">${wins}</td>`;
        });
        body += '</tr>';
    });

    // 颜色说明
    const legend = `<div class="h2h-legend"><span class="h2h-legend-label">${escapeHtml(i18n[currentLang].wtt_heatmap_hint)}</span>` +
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
                    tooltip: { backgroundColor: 'rgba(26,29,40,0.9)', titleFont: { size: isMobile ? 12 : 13 }, bodyFont: { size: isMobile ? 11 : 12 }, padding: isMobile ? 8 : 12, cornerRadius: 8, callbacks: { label: ctx => `${ctx.dataset.label}: ${ctx.raw} 场` } }
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
        const isDark = document.body.classList.contains('dark-mode');
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

function wttRenderAssocTrend(assocCodes, dataCount) {
    const canvas = document.getElementById('wttAssocTrendChart');
    if (!canvas || !wttRankingTimeline.length) return;
    if (wttAssocTrendChart) { wttAssocTrendChart.destroy(); wttAssocTrendChart = null; }
    if (!assocCodes || !assocCodes.length) return;

    dataCount = Math.max(2, Math.min(dataCount || 20, wttRankingTimeline.length));
    const sliced = wttRankingTimeline.slice(-dataCount);
    const isMobile = window.innerWidth <= 768;
    const countryMap = wttBuildAssocCountryMap();

    const labels = sliced.map(t => t.label);
    const strengthByAssoc = {};
    for (const code of assocCodes) strengthByAssoc[code] = [];
    for (const t of sliced) {
        const scoreMap = wttBuildSnapshotScoreMap(t);
        const list = wttComputeAssocStrengthList(scoreMap);
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
                    legend: { position: 'bottom', labels: { usePointStyle: true, padding: isMobile ? 10 : 16, font: { size: isMobile ? 10 : 11, family: "'Poppins', sans-serif" }, boxWidth: isMobile ? 11 : 12 } },
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
    if (assocSel.length) wttRenderAssocTrend(assocSel, wttDataVizExtraState.assocTrendCount);
    wttRenderAssocTop5(wttDataVizExtraState.assocTop5TopN);
    if (wttBarRace.initialized) {
        wttBarRace.assocColors = wttBuildBarRaceAssocColors();
        wttBarRaceSyncPlayButton();
        wttSetBarRaceFrame(wttDataVizExtraState.raceFrameIndex, false);
    }
}
