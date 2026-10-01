/* ========================================
   club_race.js - 排名动态竞速 Bar Chart Race（Top 15）
   复刻 wtt_dataviz_extra.js 中的竞速实现，使用社团系列数据
   动画核心：单一 RAF 连续时钟推进时间线；行分数按帧率无关的时间常数 τ
   指数平滑趋近目标帧值（ease-out，无旧版定时器跳帧造成的冲刺-停滞脉冲感）
   播放到最后一个节点（实时积分）自动停止，手动重播时再回绕到第 0 帧
   ======================================== */

const CLUB_RACE_TOP_N = 15;
// 球员配色：黄金角色相步进 + 中低饱和度，保证相邻球员色差大且不刺眼
const CLUB_RACE_HUE_STEP = 137.508;  // 黄金角（度）
const CLUB_RACE_SATURATION = 50;     // 饱和度 %
const CLUB_RACE_LIGHTNESS = 55;      // 亮度 %
const CLUB_RACE_FRAME_MS = 700;
// 横轴刻度：候选步长阶梯，全部是 50 的倍数 —— 于是轴的两端（轨道 0% 与 100% 位置）
// 以及中间每一格都落在 50 分的整数倍上；跨度变宽时自动升到更粗的步长，避免刻度挤成一团
const CLUB_RACE_STEP_LADDER = [50, 100, 150, 200, 250, 300, 400, 500];
const CLUB_RACE_MIN_BAR_PCT = 2;     // 条长保底（%）：分数正好等于轴左端时宽度不会归零
const CLUB_RACE_MIN_TICK_PX = 36;    // 单个刻度至少要占的像素宽，用来按屏幕宽度定刻度数量上限
const CLUB_RACE_MIN_TICKS = 3;
const CLUB_RACE_MAX_TICKS = 12;

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
    tauMs: 224,            // 指数平滑时间常数 τ（随速度档缩放，帧率无关）
    cache: new Map(),
    playerColors: {},
    rowMap: new Map(),
    rowHeight: 32,
    trackPx: 0,             // 条形轨道的实测像素宽（决定刻度数量上限），init/resize 时刷新
    axisMin: null,          // 显示中的轴域（连续量，朝 50 倍数目标域缓动；静止时精确落在倍数上）
    axisMax: null,
    axisMoving: false,      // 轴域是否仍在缓动（决定动画循环要不要续帧）
    lastTs: null,
    axisTicks: null,       // 复用的坐标轴刻度 span，数量随轴域步长变化，避免每帧重建 innerHTML
    activeCount: -1        // 上次渲染的活跃行数，避免每帧写容器高度
};

function clubRaceClampNum(v, lo, hi) { return v < lo ? lo : (v > hi ? hi : v); }

// 按当前速度档推导进出场时长与平滑时间常数，保证各速度档下过渡节奏一致
function clubRaceComputeDurations() {
    const seg = CLUB_RACE_FRAME_MS / Math.max(0.01, clubBarRace.speed);
    clubBarRace.enterMs = clubRaceClampNum(seg * 0.7, 180, 600);
    clubBarRace.fadeInMs = clubRaceClampNum(seg * 0.4, 120, 320);
    clubBarRace.fadeOutMs = clubRaceClampNum(seg * 0.6, 160, 480);
    clubBarRace.exitMs = clubRaceClampNum(seg * 0.85, 240, 700);
    clubBarRace.tauMs = clubRaceClampNum(seg * 0.32, 80, 320);
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
        '<span class="bar-race-name" title="' + escapeHtml(playerDisplayName(item.name)) + '">' +
            '<span class="bar-race-name-text">' + escapeHtml(playerDisplayName(item.name)) + '</span>' +
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
// 条长按当前横轴域做线性映射：轴左端即 0%，条长与分数真实对应，不再随榜单自动拉伸
function clubUpdateRaceRow(st, rank, axis) {
    if (st.lastRank !== rank) {
        st.lastRank = rank;
        st.rankEl.textContent = rank + 1;
        st.rankEl.classList.toggle('top1', rank === 0);
        st.rankEl.classList.toggle('top2', rank === 1);
        st.rankEl.classList.toggle('top3', rank === 2);
    }
    // 写法同时兜住 NaN：!(NaN > k) 为真，会落回保底宽度
    let pct = (st.score - axis.min) / (axis.max - axis.min) * 100;
    if (!(pct > CLUB_RACE_MIN_BAR_PCT)) pct = CLUB_RACE_MIN_BAR_PCT;
    else if (pct > 100) pct = 100;
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

// 读取条形轨道的实测像素宽：窄屏刻度更密会挤在一起，用它算出刻度数量上限
function clubReadRaceTrackWidth() {
    const container = document.getElementById('clubBarRaceContainer');
    if (!container) return;
    const track = container.querySelector('.bar-race-track');
    if (!track) return;
    const w = track.getBoundingClientRect().width;
    if (w > 0) clubBarRace.trackPx = w;
}

// 刻度数量上限 = 轨道能容纳的刻度数，钳在 [MIN_TICKS, MAX_TICKS]
function clubRaceMaxTicks() {
    const px = clubBarRace.trackPx > 0 ? clubBarRace.trackPx : 600;
    return clampInt(Math.floor(px / CLUB_RACE_MIN_TICK_PX) + 1, CLUB_RACE_MIN_TICKS, CLUB_RACE_MAX_TICKS);
}

// 按当前画面第 1 名 / 末名的分数域求横轴：两端与中间每格都落在 50 分的整数倍上
// 从阶梯里挑第一个刻度数不超上限的步长；都超了就用最粗的那个（刻度最少）
function clubComputeRaceAxis(minScore, maxScore) {
    const maxTicks = clubRaceMaxTicks();
    let fallback = null;
    for (let i = 0; i < CLUB_RACE_STEP_LADDER.length; i++) {
        const step = CLUB_RACE_STEP_LADDER[i];
        const lo = Math.floor(minScore / step) * step;
        const hi = Math.ceil((maxScore - 1e-6) / step) * step;
        if (hi <= lo) continue;                 // 分数跨度不足一格，跳过
        const axis = { min: lo, max: hi, step, count: Math.round((hi - lo) / step) + 1 };
        fallback = axis;                         // 循环跑完时保留的是最粗步长
        if (axis.count <= maxTicks) return axis;
    }
    if (fallback) return fallback;
    // 所有行分数相同：造一个 50 分宽的最小合法轴域，保证两端仍是 50 的倍数
    const lo = Math.floor(minScore / 50) * 50;
    return { min: lo, max: lo + 50, step: 50, count: 2 };
}

// 显示中的轴域是连续量，朝「50 倍数目标域」缓动，而不是每帧直接吸附：
// 直接吸附会让轴域每跨过一个 50 边界就整张图瞬间缩放一次（条宽随之跳变），观感是一跳一跳。
// 收敛后轴域精确落在 50 的整数倍上，刻度首尾也精确压在 0% / 100%。
// smooth 与分数用的是同一个帧率无关系数，各速度档的节奏自动保持一致。
function clubEaseAxis(target, animate, smooth) {
    const B = clubBarRace;
    if (B.axisMin == null || B.axisMax == null || !animate) {
        B.axisMin = target.min;
        B.axisMax = target.max;
        B.axisMoving = false;
        return { min: B.axisMin, max: B.axisMax, step: target.step, count: target.count };
    }
    B.axisMin += (target.min - B.axisMin) * smooth;
    B.axisMax += (target.max - B.axisMax) * smooth;
    // 半个点以内直接吸附，保证一定收敛、不留下永远微动的长尾
    if (Math.abs(target.min - B.axisMin) < 0.5) B.axisMin = target.min;
    if (Math.abs(target.max - B.axisMax) < 0.5) B.axisMax = target.max;
    B.axisMoving = Math.abs(target.min - B.axisMin) > 0.001 || Math.abs(target.max - B.axisMax) > 0.001;
    return { min: B.axisMin, max: B.axisMax, step: target.step, count: target.count };
}

// 刻度 span 池：数量随轴域步长增减，之后仅更新文本与位置
function clubEnsureRaceTicks(axisEl, count) {
    let t = clubBarRace.axisTicks;
    if (!t || t.axisEl !== axisEl || !t.spans[0] || !t.spans[0].isConnected) {
        axisEl.textContent = '';
        t = { axisEl, spans: [] };
        clubBarRace.axisTicks = t;
    }
    while (t.spans.length > count) t.spans.pop().remove();
    while (t.spans.length < count) {
        const s = document.createElement('span');
        s.className = 'bar-race-tick';
        s._left = null;
        s._txt = null;
        // 新增刻度从左邻位置起步，再滑到自己的槽位，避免凭空弹出
        s._pos = t.spans.length > 0 ? t.spans[t.spans.length - 1]._pos : 0;
        t.spans.push(s);
        axisEl.appendChild(s);
    }
    return t;
}

// 渲染横坐标轴刻度
// 刻度值恒为 step（50 的倍数）的整数倍：base 取显示轴域左端最近的 step 倍数，
//   静止时 axis.min 正好等于 base，首刻度精确落在 0%、末刻度精确落在 100%。
// 刻度位置由显示轴域换算，并各自缓动到目标槽位 —— 刻度数量/步长变化时是滑过去而不是瞬间重排。
function clubRenderRaceAxis(axisEl, axis, animate, smooth) {
    if (!axisEl) return;
    const n = axis.count;
    const t = clubEnsureRaceTicks(axisEl, n);
    const span = axis.max - axis.min;
    const base = Math.round(axis.min / axis.step) * axis.step;
    let moving = false;
    for (let i = 0; i < n; i++) {
        const s = t.spans[i];
        const target = span > 0 ? (base + i * axis.step - axis.min) / span * 100 : 0;
        if (!animate) {
            s._pos = target;
        } else {
            s._pos += (target - s._pos) * smooth;
            if (Math.abs(target - s._pos) < 0.01) s._pos = target;   // 收敛后吸附，避免长尾微动
            else moving = true;
        }
        const left = s._pos.toFixed(2) + '%';
        if (left !== s._left) { s._left = left; s.style.left = left; }
        const txt = String(base + i * axis.step);
        if (txt !== s._txt) { s._txt = txt; s.textContent = txt; }
    }
    // 刻度位置的收敛阈值比轴域更紧，轴停了但刻度还在滑时也要续帧，否则会冻结在半路
    if (moving) clubBarRace.axisMoving = true;
}

// 根据当前显示分数排序并定位所有行（仅写发生变化的样式，无 CSS 过渡）
// 升入行从榜单底端之外上滑入场；离场行从原位向下滑过底端后移除（层级压低避免与活跃行交叠突兀）
// animate=false 时轴域与刻度直接就位（初始化 / 语言切换 / 窗口缩放），不做缓动
function clubRenderRacePositions(animate, smooth) {
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
    // 行首次建好后才量得到轨道宽度，用它定刻度数量上限（只量一次，之后靠 resize 刷新）
    if (!clubBarRace.trackPx) clubReadRaceTrackWidth();
    // 吸附值只是目标，实际渲染用缓动中的轴域，避免每跨一个 50 边界就整图瞬间缩放
    const axis = active.length
        ? clubEaseAxis(clubComputeRaceAxis(minScore, maxScore), animate, smooth)
        : null;
    const axisEl = document.getElementById('clubRaceScaleLabel');
    if (axisEl) {
        if (axis) clubRenderRaceAxis(axisEl, axis, animate, smooth);
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
        clubUpdateRaceRow(st, rankIndex, axis);
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
    if (slider) { slider.value = frameIndex; setRangeFill(slider); }
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
            clubRenderRacePositions(false);
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
// 行分数按时间常数 τ 指数趋近目标帧值（帧率无关的 ease-out，目标切换处速度连续、无折角）
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
                // 末帧收尾：自动停止播放（不回绕循环），分数指数收敛到实时积分后静止
                B.playing = false;
                B.playClock = CLUB_RACE_FRAME_MS;
                clubRaceSyncPlayButton();
                break;
            }
            const prevIndex = B.frameIndex;
            B.frameIndex += 1;
            B.playClock -= CLUB_RACE_FRAME_MS;
            clubApplyRaceMembership(B.frameIndex, true, prevIndex);
        }
        busy = true;
    }

    // 指数平滑系数：1 - e^(-dt/τ)，帧率无关；dt=0 时为 0（同帧双次 rAF 不空转）
    const smooth = B.tauMs > 0 ? 1 - Math.exp(-dt / B.tauMs) : 1;
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
        // 指数趋近目标帧分数；收敛阈值内吸附，避免长尾微动导致 RAF 常驻
        const diff = st.endScore - st.score;
        if (Math.abs(diff) < 0.05) {
            if (st.score !== st.endScore) st.score = st.endScore;
        } else {
            st.score += diff * smooth;
            busy = true;
        }
    }

    clubRenderRacePositions(true, smooth);
    clubRaceRemoveLeftovers();
    // 分数收敛后轴域可能还在缓动，续帧直到轴也停稳，避免留下半截的轴
    if (clubBarRace.axisMoving) busy = true;

    if (busy || B.playing) {
        B.rafId = requestAnimationFrame(clubRaceTick);
    } else {
        B.rafId = null;
        B.lastTs = null;
    }
}

/* 语言切换刷新行内姓名标签（行 DOM 按 name 缓存复用，切语言时须原地更新） */
function clubRaceRefreshNameLabels() {
    const B = clubBarRace;
    if (!B || !B.rowMap) return;
    for (const st of B.rowMap.values()) {
        const nameEl = st.row && st.row.querySelector('.bar-race-name');
        if (!nameEl) continue;
        nameEl.title = playerDisplayName(st.name);
        const txtEl = nameEl.querySelector('.bar-race-name-text');
        if (txtEl) txtEl.textContent = playerDisplayName(st.name);
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
        // 从静止开播：立即进入下一段（处于末尾则回绕到第 0 帧重新播放）
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

    // 响应窗口大小变化：行高由 CSS 变量控制、刻度数量受轨道宽度约束，变化后重新读取并重排
    let resizeTimer = null;
    window.addEventListener('resize', () => {
        clubBarRace.trackPx = 0;        // 立刻作废旧轨道宽，下一帧渲染就会重测，刻度密度不会用错档
        clearTimeout(resizeTimer);
        resizeTimer = setTimeout(() => {
            clubReadRaceRowHeight();
            clubRenderRacePositions(false);
        }, 150);
    });

    // 回到前台时重置时间戳，避免后台节流产生大步进跳变
    document.addEventListener('visibilitychange', () => {
        if (!document.hidden) clubBarRace.lastTs = null;
    });

    clubSetRaceFrame(clubBarRace.frameIndex, false);
}
