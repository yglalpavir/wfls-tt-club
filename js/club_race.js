/* ========================================
   club_race.js - 排名动态竞速 Bar Chart Race（Top 15）
   复刻 wtt_dataviz_extra.js 中的竞速实现，使用社团系列数据
   ======================================== */

const CLUB_RACE_TOP_N = 15;
// 球员配色：黄金角色相步进 + 中低饱和度，保证相邻球员色差大且不刺眼
const CLUB_RACE_HUE_STEP = 137.508;  // 黄金角（度）
const CLUB_RACE_SATURATION = 50;     // 饱和度 %
const CLUB_RACE_LIGHTNESS = 55;      // 亮度 %
const CLUB_RACE_FRAME_MS = 700;
const CLUB_RACE_BAR_MIN_PCT = 8;  // 横轴最低刻度对应的条形宽度（%），使横轴不从 0 开始

let clubBarRace = {
    initialized: false,
    playing: false,
    timer: null,
    rafId: null,
    frameIndex: 0,
    speed: 1,
    cache: new Map(),
    playerColors: {},
    rowMap: new Map(),
    rowHeight: 32,
    lastTs: null
};

// HSL -> 十六进制颜色（h: 0-360, s/l: 0-100）
function clubHslToHex(h, s, l) {
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

// 为每位球员分配稳定颜色（按姓名排序后黄金角色相步进，排名变化时颜色不变）
function clubBuildRacePlayerColors() {
    const names = getAllPlayers().slice().sort((a, b) => a.localeCompare(b, 'zh-Hans-CN'));
    const colors = {};
    names.forEach((name, i) => {
        colors[name] = clubHslToHex(i * CLUB_RACE_HUE_STEP, CLUB_RACE_SATURATION, CLUB_RACE_LIGHTNESS);
    });
    return colors;
}

// 懒缓存：按需计算某一帧的 Top 15 数据
// 完整积分映射 = 快照数据 + 赛季继承起始积分兜底；首次参赛前的球员自动隐去
function clubGetRaceFrame(frameIndex) {
    if (clubBarRace.cache.has(frameIndex)) return clubBarRace.cache.get(frameIndex);
    const entry = rankingTimeline[frameIndex];
    if (!entry) return null;

    const scoreMap = {};
    for (const p of (entry.data || [])) {
        if (p['姓名'] != null) scoreMap[p['姓名']] = p['当前积分'] || 0;
    }
    if (seasonsData && seasonsData.length > 0 && entry.season) {
        const season = seasonsData.find(s => s.label === entry.season);
        if (season) {
            const idx = seasonsData.indexOf(season);
            if (idx >= 0) {
                const startScores = getSeasonStartScores(idx);
                for (const [name, score] of Object.entries(startScores)) {
                    if (!(name in scoreMap)) scoreMap[name] = score;
                }
            }
        }
    }
    if (initialScoresData && initialScoresData.initialScores) {
        for (const [name, score] of Object.entries(initialScoresData.initialScores)) {
            if (!(name in scoreMap)) scoreMap[name] = score;
        }
    }

    const firstAppearance = getClubFirstAppearanceDate();
    const items = [];
    for (const [name, score] of Object.entries(scoreMap)) {
        const fd = firstAppearance[name];
        if (fd && entry.time && entry.time < fd) continue;
        items.push({ name, score: Number(score) || 0 });
    }
    items.sort((a, b) => b.score - a.score);

    const frame = { label: getNodeDisplayLabel(entry) || '', items: items.slice(0, CLUB_RACE_TOP_N) };
    clubBarRace.cache.set(frameIndex, frame);
    return frame;
}

function clubCreateRaceRow(item) {
    const row = document.createElement('div');
    row.className = 'bar-race-row';
    row.setAttribute('data-name', item.name);
    row.innerHTML =
        '<span class="bar-race-rank"></span>' +
        '<span class="bar-race-name" title="' + escapeHtml(item.name) + '">' +
            '<span class="bar-race-name-text">' + escapeHtml(item.name) + '</span>' +
        '</span>' +
        '<span class="bar-race-track">' +
            '<span class="bar-race-fill"></span>' +
            '<span class="bar-race-value"></span>' +
        '</span>';
    row.style.opacity = '0';
    return row;
}

function clubUpdateRaceRow(row, item, rank, maxScore, minScore) {
    const rankEl = row.querySelector('.bar-race-rank');
    const fillEl = row.querySelector('.bar-race-fill');
    const valueEl = row.querySelector('.bar-race-value');
    if (rankEl) {
        rankEl.textContent = rank + 1;
        rankEl.classList.toggle('top1', rank === 0);
        rankEl.classList.toggle('top2', rank === 1);
        rankEl.classList.toggle('top3', rank === 2);
    }
    if (fillEl) {
        let pct;
        if (maxScore > minScore) {
            pct = CLUB_RACE_BAR_MIN_PCT + (item.score - minScore) / (maxScore - minScore) * (100 - CLUB_RACE_BAR_MIN_PCT);
        } else {
            pct = 100;
        }
        const color = clubBarRace.playerColors[item.name] || '#4da3ff';
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
function clubReadRaceRowHeight() {
    const container = document.getElementById('clubBarRaceContainer');
    if (!container) return;
    const v = getComputedStyle(container).getPropertyValue('--bar-race-row-h');
    const n = parseFloat(v);
    if (n > 0) clubBarRace.rowHeight = n;
}

// 渲染横坐标轴刻度（按当前显示分数范围，在 8%–100% 条宽区间内取 5 个刻度）
function clubRenderRaceAxis(axisEl, minScore, maxScore) {
    if (!axisEl) return;
    const tickPcts = [8, 31, 54, 77, 100];
    axisEl.innerHTML = tickPcts.map(pct => {
        const value = maxScore > minScore
            ? minScore + (pct - CLUB_RACE_BAR_MIN_PCT) / (100 - CLUB_RACE_BAR_MIN_PCT) * (maxScore - minScore)
            : maxScore;
        return '<span class="bar-race-tick" style="left:' + pct + '%;">' + value.toFixed(0) + '</span>';
    }).join('');
}

// 根据当前显示分数排序并定位所有行（每帧调用，直接设置 transform/width，无 CSS 过渡）
// 升入行从榜单底端之外上滑入场；离场行从原位向下滑过底端后移除（层级压低避免与活跃行交叠突兀）
function clubRenderRacePositions() {
    const container = document.getElementById('clubBarRaceContainer');
    if (!container) return;

    const rowH = clubBarRace.rowHeight || 32;
    const all = Array.from(clubBarRace.rowMap.values());
    const active = all.filter(st => !st.leaving);
    active.sort((a, b) => b.score - a.score);

    container.style.height = (active.length * rowH) + 'px';

    const minScore = active.length ? active[active.length - 1].score : 0;
    const maxScore = active.length ? active[0].score : 0;
    const axisEl = document.getElementById('clubRaceScaleLabel');
    if (axisEl) {
        if (active.length) clubRenderRaceAxis(axisEl, minScore, maxScore);
        else axisEl.innerHTML = '';
    }

    const exitBaseY = (active.length + 1) * rowH;
    for (const st of all) {
        if (!st.leaving) continue;
        const startY = st.exitStartY != null ? st.exitStartY : (st.lastY != null ? st.lastY : exitBaseY);
        const targetY = Math.max(startY, exitBaseY);
        const t = st.exitProgress * st.exitProgress; // ease-in，模拟下坠加速
        const y = startY + (targetY - startY) * t;
        st.lastY = y;
        st.row.style.transform = 'translateY(' + y + 'px)';
        st.row.style.opacity = st.opacity;
        st.row.style.zIndex = '1';
    }

    let rankIndex = 0;
    for (const st of active) {
        const offset = st.enterOffset || 0;
        const y = (rankIndex + offset) * rowH;
        st.lastY = y;
        st.row.style.transform = 'translateY(' + y + 'px)';
        st.row.style.opacity = st.opacity;
        st.row.style.zIndex = '2';
        clubUpdateRaceRow(st.row, { name: st.name, score: st.score }, rankIndex, maxScore, minScore);
        rankIndex++;
    }
}

// 移除已经滑出榜单底端的离场行
function clubRaceRemoveLeftovers() {
    for (const [name, st] of Array.from(clubBarRace.rowMap)) {
        if (st.leaving && st.exitProgress >= 1 && st.opacity <= 0.01) {
            st.row.remove();
            clubBarRace.rowMap.delete(name);
        }
    }
}

// 设置目标帧：更新每个球员的目标分数，并启动连续插值动画
function clubSetRaceFrame(frameIndex, animate = true) {
    const container = document.getElementById('clubBarRaceContainer');
    if (!container || !rankingTimeline.length) return;
    const frame = clubGetRaceFrame(frameIndex);
    if (!frame) return;

    clubBarRace.frameIndex = frameIndex;
    dataVizExtraState.raceFrameIndex = frameIndex;
    const slider = document.getElementById('clubRaceSlider');
    if (slider) slider.value = frameIndex;
    const dateLabel = document.getElementById('clubRaceDateLabel');
    if (dateLabel) dateLabel.textContent = frame.label;

    clubReadRaceRowHeight();

    const rowCount = frame.items.length;
    const rowH = clubBarRace.rowHeight || 32;
    const activeNames = new Set();
    let itemIndex = 0;
    for (const item of frame.items) {
        activeNames.add(item.name);
        let st = clubBarRace.rowMap.get(item.name);
        const wasLeaving = st ? st.leaving : false;
        if (!st) {
            const row = clubCreateRaceRow(item);
            container.appendChild(row);
            st = {
                name: item.name,
                row,
                score: item.score,
                targetScore: item.score,
                opacity: 0,
                leaving: false,
                // 从榜单底端之外升入：初始偏移 = 底边到目标槽位的行距（固定时长滑入）
                enterOffset: animate ? Math.max(1, rowCount - itemIndex) : 0,
                enterTotal: 0,
                exitProgress: 0,
                exitStartY: null,
                lastY: null
            };
            st.enterTotal = st.enterOffset;
            clubBarRace.rowMap.set(item.name, st);
        } else if (wasLeaving) {
            // 离场途中被重新激活：从当前位置平滑归位，避免瞬移
            st.exitProgress = 0;
            st.exitStartY = null;
            if (animate && st.lastY != null) {
                st.enterOffset = Math.max(0, st.lastY / rowH - itemIndex);
            } else {
                st.enterOffset = 0;
            }
            st.enterTotal = st.enterOffset;
        }
        st.targetScore = item.score;
        st.leaving = false;
        itemIndex++;
    }

    for (const [name, st] of clubBarRace.rowMap) {
        if (!activeNames.has(name) && !st.leaving) {
            st.leaving = true;
            st.targetScore = st.score;
            st.exitProgress = 0;
            st.exitStartY = st.lastY;   // 从当前所在位置开始下滑
        }
    }

    if (!animate) {
        for (const st of clubBarRace.rowMap.values()) {
            st.score = st.targetScore;
            st.enterOffset = 0;
            st.enterTotal = 0;
            st.exitProgress = 1;
            st.opacity = st.leaving ? 0 : 1;
            st.row.style.opacity = st.opacity;
        }
        clubRenderRacePositions();
        clubRaceRemoveLeftovers();
        return;
    }

    if (clubBarRace.rafId == null) {
        clubBarRace.lastTs = null;
        clubBarRace.rafId = requestAnimationFrame(clubRaceTick);
    }
}

// 连续动画循环：分数指数趋近目标，排名/条长随每帧重算
function clubRaceTick(ts) {
    let needsAnotherFrame = false;
    if (clubBarRace.lastTs == null) {
        clubBarRace.lastTs = ts;
        needsAnotherFrame = true;
    }
    const dt = Math.min(64, Math.max(0, ts - clubBarRace.lastTs));
    clubBarRace.lastTs = ts;

    const scoreSmoothing = 1 - Math.exp(-dt / 220);   // 时间常数 ~220ms，分数过渡更绵长顺滑
    const fadeInRate = dt / 180;
    const fadeOutRate = dt / 300;                     // 与下滑时长同步的轻微淡出
    const exitStep = dt / 320;                        // 掉出榜单底端的下滑进度

    for (const st of clubBarRace.rowMap.values()) {
        if (st.leaving) {
            st.exitProgress = Math.min(1, st.exitProgress + exitStep);
            st.opacity = Math.max(0, st.opacity - fadeOutRate);
            st.row.style.opacity = st.opacity;
            if (st.exitProgress < 1 || st.opacity > 0.01) needsAnotherFrame = true;
        } else {
            if (st.opacity < 1) {
                st.opacity = Math.min(1, st.opacity + fadeInRate);
                st.row.style.opacity = st.opacity;
                if (st.opacity < 1) needsAnotherFrame = true;
            }
            if (st.enterOffset > 0) {
                // 固定时长滑入：无论从底端攀爬多少行，入场耗时一致
                const step = Math.max(1, st.enterTotal) * dt / 360;
                st.enterOffset = Math.max(0, st.enterOffset - step);
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

    clubRenderRacePositions();
    clubRaceRemoveLeftovers();

    if (needsAnotherFrame) {
        clubBarRace.rafId = requestAnimationFrame(clubRaceTick);
    } else {
        clubBarRace.rafId = null;
    }
}

function clubRaceSyncPlayButton() {
    const btn = document.getElementById('clubRacePlayBtn');
    if (!btn) return;
    const key = clubBarRace.playing ? 'data_viz_race_pause' : 'data_viz_race_play';
    const icon = clubBarRace.playing ? 'fa-pause' : 'fa-play';
    btn.innerHTML = '<i class="fa-solid ' + icon + '"></i> <span data-i18n="' + key + '">' + escapeHtml(i18n[currentLang][key]) + '</span>';
}

function clubRaceAdvance() {
    const max = rankingTimeline.length - 1;
    clubBarRace.frameIndex = clubBarRace.frameIndex >= max ? 0 : clubBarRace.frameIndex + 1;
    clubSetRaceFrame(clubBarRace.frameIndex, true);
}

function clubRaceStartTimer() {
    if (clubBarRace.timer) { clearInterval(clubBarRace.timer); clubBarRace.timer = null; }
    clubBarRace.timer = setInterval(clubRaceAdvance, Math.max(120, CLUB_RACE_FRAME_MS / clubBarRace.speed));
}

function clubRaceStartPlay() {
    if (clubBarRace.playing) return;
    clubBarRace.playing = true;
    clubRaceSyncPlayButton();
    clubRaceStartTimer();
}

function clubRaceStopPlay() {
    if (!clubBarRace.playing && !clubBarRace.timer) return;
    clubBarRace.playing = false;
    if (clubBarRace.timer) { clearInterval(clubBarRace.timer); clubBarRace.timer = null; }
    clubRaceSyncPlayButton();
}

function initClubBarRace() {
    const container = document.getElementById('clubBarRaceContainer');
    const slider = document.getElementById('clubRaceSlider');
    const playBtn = document.getElementById('clubRacePlayBtn');
    const speedSelect = document.getElementById('clubRaceSpeedSelect');
    if (!container || !slider || !playBtn) return;
    if (!rankingTimeline || !rankingTimeline.length) return;

    clubBarRace.initialized = true;
    clubBarRace.playerColors = clubBuildRacePlayerColors();
    clubBarRace.speed = parseFloat(speedSelect && speedSelect.value) || 1;
    clubBarRace.frameIndex = (dataVizExtraState.raceFrameIndex > 0)
        ? Math.min(dataVizExtraState.raceFrameIndex, rankingTimeline.length - 1)
        : rankingTimeline.length - 1;
    slider.max = rankingTimeline.length - 1;
    slider.value = clubBarRace.frameIndex;

    slider.addEventListener('input', () => {
        clubRaceStopPlay();
        clubBarRace.frameIndex = clampInt(slider.value, 0, rankingTimeline.length - 1);
        clubSetRaceFrame(clubBarRace.frameIndex, true);
    });
    playBtn.addEventListener('click', () => {
        if (clubBarRace.playing) clubRaceStopPlay();
        else clubRaceStartPlay();
    });
    speedSelect?.addEventListener('change', () => {
        clubBarRace.speed = parseFloat(speedSelect.value) || 1;
        if (clubBarRace.playing) clubRaceStartTimer();
    });

    // 响应窗口大小变化：行高由 CSS 变量控制，变化后重新读取并重排
    let resizeTimer = null;
    window.addEventListener('resize', () => {
        clearTimeout(resizeTimer);
        resizeTimer = setTimeout(() => {
            clubReadRaceRowHeight();
            clubRenderRacePositions();
        }, 150);
    });

    clubSetRaceFrame(clubBarRace.frameIndex, false);
}
