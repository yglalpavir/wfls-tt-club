/* ========================================
   club_race.js - 排名动态竞速 Bar Chart Race（Top 15）
   复刻 wtt_dataviz_extra.js 中的竞速实现，使用社团系列数据
   动画核心：单一 RAF 连续时钟在相邻时间点之间匀速插值，
   消除旧版「定时器跳帧 + 指数趋近」造成的冲刺-停滞脉冲感
   ======================================== */

const CLUB_RACE_TOP_N = 15;
// 球员配色：黄金角色相步进 + 中低饱和度，保证相邻球员色差大且不刺眼
const CLUB_RACE_HUE_STEP = 137.508;  // 黄金角（度）
const CLUB_RACE_SATURATION = 50;     // 饱和度 %
const CLUB_RACE_LIGHTNESS = 55;      // 亮度 %
const CLUB_RACE_FRAME_MS = 700;
const CLUB_RACE_BAR_MIN_PCT = 8;     // 横轴最低刻度对应的条形宽度（%），使横轴不从 0 开始
const CLUB_RACE_TICK_PCTS = [8, 31, 54, 77, 100];

let clubBarRace = {
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
    playerColors: {},
    rowMap: new Map(),
    rowHeight: 32,
    lastTs: null,
    axisTicks: null,       // 复用的坐标轴刻度 span，避免每帧重建 innerHTML
    activeCount: -1        // 上次渲染的活跃行数，避免每帧写容器高度
};

function clubRaceClampNum(v, lo, hi) { return v < lo ? lo : (v > hi ? hi : v); }

// 按当前速度档推导进出场时长，保证各速度档下过渡节奏一致
function clubRaceComputeDurations() {
    const seg = CLUB_RACE_FRAME_MS / Math.max(0.01, clubBarRace.speed);
    clubBarRace.enterMs = clubRaceClampNum(seg * 0.7, 180, 600);
    clubBarRace.fadeInMs = clubRaceClampNum(seg * 0.4, 120, 320);
    clubBarRace.fadeOutMs = clubRaceClampNum(seg * 0.6, 160, 480);
    clubBarRace.exitMs = clubRaceClampNum(seg * 0.85, 240, 700);
}

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
// byName 保存未截断前的全部分数，供新晋行从「榜外分数」平滑生长
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

    const byName = new Map();
    for (const it of items) byName.set(it.name, it.score);

    const frame = { label: getNodeDisplayLabel(entry) || '', items: items.slice(0, CLUB_RACE_TOP_N), byName };
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
    row.style.zIndex = '2';
    return row;
}

// 行颜色仅在映射变化时写入（初始化或主题/语言重载后刷新一次）
function clubApplyRowColor(st) {
    const color = clubBarRace.playerColors[st.colorKey] || '#4da3ff';
    if (color === st.lastColor) return;
    st.lastColor = color;
    st.fillEl.style.background = color;
    st.valueEl.style.color = color;
}

// 更新行内容（脏检查：仅写发生变化的 DOM 属性，元素引用已在创建时缓存）
function clubUpdateRaceRow(st, rank, maxScore, minScore) {
    if (st.lastRank !== rank) {
        st.lastRank = rank;
        st.rankEl.textContent = rank + 1;
        st.rankEl.classList.toggle('top1', rank === 0);
        st.rankEl.classList.toggle('top2', rank === 1);
        st.rankEl.classList.toggle('top3', rank === 2);
    }
    let pct;
    if (maxScore > minScore) {
        pct = CLUB_RACE_BAR_MIN_PCT + (st.score - minScore) / (maxScore - minScore) * (100 - CLUB_RACE_BAR_MIN_PCT);
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
function clubReadRaceRowHeight() {
    const container = document.getElementById('clubBarRaceContainer');
    if (!container) return;
    const v = getComputedStyle(container).getPropertyValue('--bar-race-row-h');
    const n = parseFloat(v);
    if (n > 0) clubBarRace.rowHeight = n;
}

// 坐标轴刻度只创建一次，之后仅更新文本（位置固定不变）
function clubEnsureRaceTicks(axisEl) {
    let t = clubBarRace.axisTicks;
    if (t && t.axisEl === axisEl && t.spans[0] && t.spans[0].isConnected) return t;
    axisEl.textContent = '';
    const frag = document.createDocumentFragment();
    const spans = CLUB_RACE_TICK_PCTS.map(p => {
        const s = document.createElement('span');
        s.className = 'bar-race-tick';
        s.style.left = p + '%';
        frag.appendChild(s);
        return s;
    });
    axisEl.appendChild(frag);
    t = { axisEl, spans, vals: new Array(CLUB_RACE_TICK_PCTS.length).fill(null) };
    clubBarRace.axisTicks = t;
    return t;
}

// 渲染横坐标轴刻度（按当前显示分数范围，在 8%–100% 条宽区间内取 5 个刻度）
function clubRenderRaceAxis(axisEl, minScore, maxScore) {
    if (!axisEl) return;
    const t = clubEnsureRaceTicks(axisEl);
    for (let i = 0; i < CLUB_RACE_TICK_PCTS.length; i++) {
        const pct = CLUB_RACE_TICK_PCTS[i];
        const value = maxScore > minScore
            ? minScore + (pct - CLUB_RACE_BAR_MIN_PCT) / (100 - CLUB_RACE_BAR_MIN_PCT) * (maxScore - minScore)
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
function clubRenderRacePositions() {
    const container = document.getElementById('clubBarRaceContainer');
    if (!container) return;

    const rowH = clubBarRace.rowHeight || 32;
    const all = Array.from(clubBarRace.rowMap.values());
    const active = all.filter(st => !st.leaving);
    active.sort((a, b) => b.score - a.score);

    if (active.length !== clubBarRace.activeCount) {
        clubBarRace.activeCount = active.length;
        container.style.height = (active.length * rowH) + 'px';
    }

    const minScore = active.length ? active[active.length - 1].score : 0;
    const maxScore = active.length ? active[0].score : 0;
    const axisEl = document.getElementById('clubRaceScaleLabel');
    if (axisEl) {
        if (active.length) clubRenderRaceAxis(axisEl, minScore, maxScore);
        else if (clubBarRace.axisTicks) { axisEl.textContent = ''; clubBarRace.axisTicks = null; }
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
        clubApplyRowColor(st);
        clubUpdateRaceRow(st, rankIndex, maxScore, minScore);
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

// 将榜单成员同步到目标帧：
// 新晋行创建/复活并从底端滑入（起点分数取上一帧的榜外分数，使条长随之生长）；
// 掉榜行标记离场；已有行的本段起点固定为其当前显示分数，被打断也不跳变
function clubApplyRaceMembership(frameIndex, animate, prevIndex) {
    const container = document.getElementById('clubBarRaceContainer');
    if (!container) return false;

    clubReadRaceRowHeight();
    const frame = clubGetRaceFrame(frameIndex);
    if (!frame) return false;
    const prevFrame = (animate && prevIndex != null && prevIndex !== frameIndex)
        ? clubGetRaceFrame(prevIndex) : null;

    clubBarRace.frameIndex = frameIndex;
    dataVizExtraState.raceFrameIndex = frameIndex;
    const slider = document.getElementById('clubRaceSlider');
    if (slider) slider.value = frameIndex;
    const dateLabel = document.getElementById('clubRaceDateLabel');
    if (dateLabel) dateLabel.textContent = frame.label;

    const rowCount = frame.items.length;
    const rowH = clubBarRace.rowHeight || 32;
    const activeNames = new Set();
    let itemIndex = 0;
    for (const item of frame.items) {
        activeNames.add(item.name);
        let st = clubBarRace.rowMap.get(item.name);
        const wasLeaving = st ? st.leaving : false;
        const isNew = !st;
        if (isNew) {
            const row = clubCreateRaceRow(item);
            container.appendChild(row);
            st = {
                name: item.name,
                row,
                rankEl: row.querySelector('.bar-race-rank'),
                fillEl: row.querySelector('.bar-race-fill'),
                valueEl: row.querySelector('.bar-race-value'),
                colorKey: item.name,
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
            clubApplyRowColor(st);
            clubBarRace.rowMap.set(item.name, st);
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

    for (const [name, st] of clubBarRace.rowMap) {
        if (!activeNames.has(name) && !st.leaving) {
            st.leaving = true;
            st.exitProgress = 0;
            st.exitStartY = st.lastY;   // 从当前所在位置开始下滑
            st.row.style.zIndex = '1';
        }
    }
    return true;
}

function clubRaceEnsureRaf() {
    if (clubBarRace.rafId == null) {
        clubBarRace.lastTs = null;
        clubBarRace.rafId = requestAnimationFrame(clubRaceTick);
    }
}

function clubRaceCancelRaf() {
    if (clubBarRace.rafId != null) {
        cancelAnimationFrame(clubBarRace.rafId);
        clubBarRace.rafId = null;
    }
    clubBarRace.lastTs = null;
}

// 设置目标帧（手动拖动滑块与外部调用入口）：
// 以当前画面为起点，在一段时长内匀速过渡到该帧
function clubSetRaceFrame(frameIndex, animate = true) {
    const B = clubBarRace;
    if (!rankingTimeline.length) return;

    if (!animate) {
        B.playing = false;
        if (clubApplyRaceMembership(frameIndex, false, frameIndex)) {
            B.playClock = CLUB_RACE_FRAME_MS;   // 段完成态，画面静止在该帧
            const frame = clubGetRaceFrame(frameIndex);
            for (const st of B.rowMap.values()) {
                st.enterOffset = 0;
                st.enterTotal = 0;
                st.lastWriteOpacity = -1;       // 强制重写透明度
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
            clubRenderRacePositions();
            clubRaceRemoveLeftovers();
        }
        clubRaceCancelRaf();
        return;
    }

    const prevIndex = B.frameIndex;
    B.playing = false;
    B.playClock = 0;
    clubApplyRaceMembership(frameIndex, true, prevIndex);
    clubRaceSyncPlayButton();
    clubRaceEnsureRaf();
}

// 连续动画循环：playClock 按 dt×speed 推进，跨过整帧时切换目标并处理进出场；
// 行分数在段内线性插值 —— 全程匀速运动，无「冲刺-停滞」节奏
function clubRaceTick(ts) {
    const B = clubBarRace;
    let busy = false;

    if (B.lastTs == null) B.lastTs = ts;
    const dt = Math.min(64, Math.max(0, ts - B.lastTs));
    B.lastTs = ts;

    // ---- 时间线时钟推进 ----
    if (B.playing || B.playClock < CLUB_RACE_FRAME_MS) {
        B.playClock += dt * B.speed;
        let guard = 0;
        while (B.playClock >= CLUB_RACE_FRAME_MS && guard++ < 6) {
            if (!B.playing) { B.playClock = CLUB_RACE_FRAME_MS; break; } // 暂停后把当前段收尾
            if (B.frameIndex >= rankingTimeline.length - 1) {
                // 循环回绕：硬切回第 0 帧（如视频循环）
                B.frameIndex = 0;
                B.playClock = CLUB_RACE_FRAME_MS;
                clubApplyRaceMembership(0, true, rankingTimeline.length - 1);
                break;
            }
            const prevIndex = B.frameIndex;
            B.frameIndex += 1;
            B.playClock -= CLUB_RACE_FRAME_MS;
            clubApplyRaceMembership(B.frameIndex, true, prevIndex);
        }
        busy = true;
    }

    const blend = Math.min(1, B.playClock / CLUB_RACE_FRAME_MS);
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

    clubRenderRacePositions();
    clubRaceRemoveLeftovers();

    if (busy || B.playing) {
        B.rafId = requestAnimationFrame(clubRaceTick);
    } else {
        B.rafId = null;
        B.lastTs = null;
    }
}

function clubRaceSyncPlayButton() {
    const btn = document.getElementById('clubRacePlayBtn');
    if (!btn) return;
    const key = clubBarRace.playing ? 'data_viz_race_pause' : 'data_viz_race_play';
    const icon = clubBarRace.playing ? 'fa-pause' : 'fa-play';
    btn.innerHTML = '<i class="fa-solid ' + icon + '"></i> <span data-i18n="' + key + '">' + escapeHtml(i18n[currentLang][key]) + '</span>';
}

function clubRaceStartPlay() {
    const B = clubBarRace;
    if (B.playing) return;
    B.playing = true;
    if (B.playClock >= CLUB_RACE_FRAME_MS) {
        // 从静止开播：立即进入下一段（处于末尾则回绕到第 0 帧）
        const prevIndex = B.frameIndex;
        if (prevIndex >= rankingTimeline.length - 1) {
            B.frameIndex = 0;
            B.playClock = CLUB_RACE_FRAME_MS;
            clubApplyRaceMembership(0, true, prevIndex);
        } else {
            B.frameIndex = prevIndex + 1;
            B.playClock = 0;
            clubApplyRaceMembership(B.frameIndex, true, prevIndex);
        }
    }
    clubRaceSyncPlayButton();
    clubRaceEnsureRaf();
}

// 暂停不打断动画：当前段继续播完，画面自然停在整帧上
function clubRaceStopPlay() {
    if (!clubBarRace.playing) return;
    clubBarRace.playing = false;
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
    clubRaceComputeDurations();
    clubBarRace.frameIndex = (dataVizExtraState.raceFrameIndex > 0)
        ? Math.min(dataVizExtraState.raceFrameIndex, rankingTimeline.length - 1)
        : rankingTimeline.length - 1;
    slider.max = rankingTimeline.length - 1;
    slider.value = clubBarRace.frameIndex;

    slider.addEventListener('input', () => {
        clubRaceStopPlay();
        clubSetRaceFrame(clampInt(slider.value, 0, rankingTimeline.length - 1), true);
    });
    playBtn.addEventListener('click', () => {
        if (clubBarRace.playing) clubRaceStopPlay();
        else clubRaceStartPlay();
    });
    speedSelect?.addEventListener('change', () => {
        clubBarRace.speed = parseFloat(speedSelect.value) || 1;
        clubRaceComputeDurations();
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

    // 回到前台时重置时间戳，避免后台节流产生大步进跳变
    document.addEventListener('visibilitychange', () => {
        if (!document.hidden) clubBarRace.lastTs = null;
    });

    clubSetRaceFrame(clubBarRace.frameIndex, false);
}
