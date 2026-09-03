/* ========================================
   draws-viewer.js - 对阵表观众端渲染引擎 (v3)
   特性: 网格/自动布局 · 状态徽标(进行中/待赛) · 逐局比分弹窗
         选手搜索与晋级路径高亮 · 悬停连线高亮 · 缩放/平移/全屏 · 触屏支持
   数据模型见 js/draws-core.js；v2 旧数据在内存中自动升级渲染。
   ======================================== */

let currentDrawsData = null;
let viewerZoom = 1;
let viewerMinZoom = 0.2;
let viewerPanX = 0, viewerPanY = 0;
let isPanning = false, panStart = { x: 0, y: 0 };
let viewerRafId = null;
let _dvSearchToken = 0;   // 防止异步渲染竞态

/**
 * 初始化对阵表查看器（对外入口，保持与旧版一致的签名）
 */
function initDrawsViewer(containerId, draws) {
    const container = document.getElementById(containerId);
    const model = dcNormalizeDraw(draws);
    if (!container || !model) return;
    currentDrawsData = model;
    renderGridViewer(container, model);
}

// ---------- 卡片 DOM ----------

function dvBuildCardEl(card, pos, layout, draws) {
    const theme = draws.theme || {};
    const el = document.createElement('div');
    el.className = 'dv-card dv-type-' + (card.type || 'match');
    el.dataset.cardId = card.id;
    el.style.left = pos.x + 'px';
    el.style.top = pos.y + 'px';
    el.style.width = pos.w + 'px';
    el.style.minHeight = pos.h + 'px';

    if (theme.accent) el.style.setProperty('--dv-accent', theme.accent);

    if (card.type === 'note') {
        el.classList.add('dv-card-note');
        el.innerHTML = '<div class="dv-card-note-text">' + dcEsc(card.text || '') + '</div>';
        return el;
    }

    if (card.type === 'champion') {
        el.classList.add('dv-card-champion');
        const p = card.player1;
        el.innerHTML =
            '<div class="dv-card-champion-icon"><i class="fa-solid fa-crown"></i></div>' +
            '<div class="dv-card-player dv-card-winner-name">' + dvPlayerHtml(p) + '</div>' +
            '<div class="dv-card-champion-label">' + dcEsc(card.label || dcT('dv_champion', '冠军')) + '</div>';
        return el;
    }

    const status = dcMatchStatus(card);
    if (status === 'live') el.classList.add('dv-card-live');
    else if (status === 'scheduled') el.classList.add('dv-card-scheduled');

    const p1 = card.player1, p2 = card.player2;
    const scores = dcParseScore(card.score) || [null, null];
    const winner = card.winner;
    const p1Won = winner === 1, p2Won = winner === 2;
    const isBye = !p2;

    let html = '';
    if (isBye) {
        html += '<div class="dv-card-player ' + (p1Won ? 'dv-winner' : '') + '">' + dvPlayerHtml(p1, scores[0], p1Won) + '</div>';
        html += '<div class="dv-card-bye">— BYE —</div>';
    } else {
        html += '<div class="dv-card-player ' + (p1Won ? 'dv-winner' : (p2Won ? 'dv-loser' : '')) + '">' + dvPlayerHtml(p1, scores[0], p1Won) + '</div>';
        html += '<div class="dv-card-vs"></div>';
        html += '<div class="dv-card-player ' + (p2Won ? 'dv-winner' : (p1Won ? 'dv-loser' : '')) + '">' + dvPlayerHtml(p2, scores[1], p2Won) + '</div>';
    }
    // 状态徽标
    if (status === 'live') html += '<div class="dv-status-badge dv-status-live"><span class="dv-live-dot"></span>LIVE</div>';
    else if (status === 'scheduled') html += '<div class="dv-status-badge dv-status-scheduled"><i class="fa-regular fa-clock"></i>' + dcT('dv_status_scheduled', '待赛') + '</div>';
    // 总比分角标
    else if (card.score && !isBye) html += '<div class="dv-card-score-tag">' + dcEsc(card.score) + '</div>';

    el.innerHTML = html;

    // 可点击展开详情（有附加信息或逐局比分时）
    if (card.games && card.games.length) el.classList.add('dv-has-detail');
    return el;
}

function dvPlayerHtml(p, score, won) {
    if (!p) return '<span class="dv-player-name dv-tbd">' + dcT('dv_tbd', '待定') + '</span>' + (score != null ? '<span class="dv-player-score ' + (won ? 'dv-score-win' : 'dv-score-loss') + '">' + score + '</span>' : '');
    let html = '<span class="dv-player-name">' + dcEsc(p.name) + '</span>';
    if (p.seed != null && p.seed !== '') {
        html = '<span class="dv-player-seed">' + dcEsc(String(p.seed)) + '</span>' + html;
    }
    if (p.note) html += '<span class="dv-player-note" title="' + dcEsc(p.note) + '">' + dcEsc(p.note) + '</span>';
    if (score != null) html += '<span class="dv-player-score ' + (won ? 'dv-score-win' : 'dv-score-loss') + '">' + score + '</span>';
    return html;
}

// ---------- 详情弹窗 ----------

function dvShowCardPopover(card, anchorEl, container, layout, draws) {
    dvHideCardPopover();
    const pop = document.createElement('div');
    pop.className = 'dv-popover';
    pop.id = 'dvPopover';

    let html = '';
    if (card.type === 'champion') {
        html += '<div class="dv-popover-title"><i class="fa-solid fa-crown"></i> ' + dcEsc(card.label || '冠军') + '</div>';
        html += '<div class="dv-popover-champ">' + dcEsc(dcPlayerName(card.player1)) + '</div>';
    } else if (card.type === 'note') {
        html += '<div class="dv-popover-note">' + dcEsc(card.text || '') + '</div>';
    } else {
        const p1 = dcPlayerName(card.player1) || dcT('dv_tbd', '待定');
        const p2 = dcPlayerName(card.player2);
        html += '<div class="dv-popover-title">' + dcEsc(p1) + (p2 ? ' <span class="dv-popover-vs">vs</span> ' + dcEsc(p2) : ' <span class="dv-popover-vs">· BYE</span>') + '</div>';
        const status = dcMatchStatus(card);
        if (status === 'live') html += '<div class="dv-popover-status dv-status-live"><span class="dv-live-dot"></span>' + dcT('dv_status_live', '比赛进行中') + '</div>';
        else if (status === 'scheduled') html += '<div class="dv-popover-status dv-status-scheduled"><i class="fa-regular fa-clock"></i> ' + dcT('dv_status_scheduled', '待赛') + '</div>';
        if (card.games && card.games.length) {
            html += '<div class="dv-popover-games">';
            card.games.forEach((g, i) => {
                const s = dcParseScore(g);
                let cls = '';
                if (s && card.winner) cls = ((card.winner === 1) === (s[0] > s[1])) ? 'dv-g-win' : 'dv-g-loss';
                html += '<span class="dv-popover-game ' + cls + '">' + dcEsc(g) + '</span>';
            });
            html += '</div>';
        }
        if (card.score) html += '<div class="dv-popover-score">' + dcT('dv_total_score', '总比分') + '：' + dcEsc(card.score) + '</div>';
        const metas = [];
        if (card.time) metas.push('<span><i class="fa-regular fa-clock"></i> ' + dcEsc(card.time) + '</span>');
        if (card.venue) metas.push('<span><i class="fa-solid fa-location-dot"></i> ' + dcEsc(card.venue) + '</span>');
        if (metas.length) html += '<div class="dv-popover-meta">' + metas.join('') + '</div>';
        if (card.note) html += '<div class="dv-popover-note">' + dcEsc(card.note) + '</div>';
        if (!card.games && !card.time && !card.venue && !card.note && status !== 'scheduled' && status !== 'live') {
            pop.classList.add('dv-popover-min');
        }
    }
    pop.innerHTML = html + '<button class="dv-popover-close" aria-label="close"><i class="fa-solid fa-xmark"></i></button>';

    container.appendChild(pop);
    // 定位：锚点卡片右下方，越界则翻转
    const vw = container.clientWidth, vh = container.clientHeight;
    const rect = anchorEl.getBoundingClientRect();
    const base = container.getBoundingClientRect();
    let left = rect.right - base.left + 10, top = rect.top - base.top;
    requestAnimationFrame(() => {
        const pw = pop.offsetWidth, ph = pop.offsetHeight;
        if (left + pw > vw - 8) left = Math.max(8, rect.left - base.left - pw - 10);
        if (top + ph > vh - 8) top = Math.max(8, vh - ph - 8);
        pop.style.left = left + 'px';
        pop.style.top = top + 'px';
        pop.classList.add('dv-popover-show');
    });
    pop.querySelector('.dv-popover-close').addEventListener('click', e => { e.stopPropagation(); dvHideCardPopover(); });
}

function dvHideCardPopover() {
    const old = document.getElementById('dvPopover');
    if (old) old.remove();
}

// ---------- 主渲染 ----------

function renderGridViewer(container, draws) {
    const layout = dcComputeLayout(draws);
    const cards = draws.cards || [];
    const connections = draws.connections || [];
    const cardMap = {};
    cards.forEach(c => { cardMap[c.id] = c; });

    container.innerHTML = '';

    const wrapper = document.createElement('div');
    wrapper.className = 'draws-viewer-wrapper';

    // ---- 工具栏 ----
    const titleBar = document.createElement('div');
    titleBar.className = 'draws-viewer-title-bar';
    const tools = [];
    tools.push('<div class="dv-search-box">' +
        '<i class="fa-solid fa-magnifying-glass"></i>' +
        '<input type="text" id="dvSearch" placeholder="' + dcT('dv_search_placeholder', '搜索选手 / 队伍，高亮晋级路径') + '">' +
        '<button id="dvSearchClear" class="dv-search-clear" style="display:none;"><i class="fa-solid fa-xmark"></i></button></div>');
    tools.push('<span class="dv-tool-sep">|</span>' +
        '<button class="dv-tool-btn" id="dvZoomOut" title="' + dcT('dv_zoom_out', '缩小') + '"><i class="fa-solid fa-magnifying-glass-minus"></i></button>' +
        '<button class="dv-tool-btn" id="dvZoomIn" title="' + dcT('dv_zoom_in', '放大') + '"><i class="fa-solid fa-magnifying-glass-plus"></i></button>' +
        '<button class="dv-tool-btn" id="dvZoomFit" title="' + dcT('dv_zoom_fit', '适应内容') + '"><i class="fa-solid fa-expand"></i></button>' +
        '<button class="dv-tool-btn" id="dvZoomReset" title="' + dcT('dv_zoom_reset', '重置视图') + '"><i class="fa-solid fa-arrows-to-circle"></i></button>' +
        '<button class="dv-tool-btn" id="dvFullscreen" title="' + dcT('dv_fullscreen', '全屏显示 (网页内)') + '"><i class="fa-solid fa-maximize"></i></button>');
    titleBar.innerHTML =
        '<div class="dv-title-main">' +
        (draws.title ? '<h2 class="draws-viewer-title">' + dcEsc(draws.title) + '</h2>' : '') +
        (draws.subtitle ? '<p class="draws-viewer-subtitle">' + dcEsc(draws.subtitle) + '</p>' : '') +
        '</div>' +
        '<div class="draws-viewer-tools">' + tools.join('') + '</div>';
    wrapper.appendChild(titleBar);

    // ---- 画布 ----
    const viewport = document.createElement('div');
    viewport.className = 'draws-viewer-viewport';
    viewport.id = 'dvViewport';
    viewport.tabIndex = 0;

    const transformLayer = document.createElement('div');
    transformLayer.className = 'draws-viewer-transform';
    transformLayer.id = 'dvTransform';
    transformLayer.style.willChange = 'transform';

    const svgNS = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(svgNS, 'svg');
    svg.setAttribute('class', 'draws-viewer-svg');
    svg.setAttribute('width', layout.canvasW);
    svg.setAttribute('height', layout.canvasH);
    svg.style.overflow = 'visible';

    const connGroup = document.createElementNS(svgNS, 'g');
    connGroup.setAttribute('class', 'dv-conn-group');
    connections.forEach((conn, idx) => {
        const fromCard = cardMap[conn.from], toCard = cardMap[conn.to];
        const fp = layout.positions[conn.from], tp = layout.positions[conn.to];
        if (!fromCard || !toCard || !fp || !tp) return;
        const a = dcAnchorPoint(fp, layout.cardW, layout.cardH, conn.fromSide || 'right');
        const b = dcAnchorPoint(tp, layout.cardW, layout.cardH, conn.toSide || 'left');
        const path = document.createElementNS(svgNS, 'path');
        path.setAttribute('d', dcConnectionPath(a, b, conn.fromSide || 'right', conn.toSide || 'left'));
        path.setAttribute('class', 'dv-connection-line');
        path.dataset.connIndex = idx;
        connGroup.appendChild(path);
        const arrow = document.createElementNS(svgNS, 'polygon');
        arrow.setAttribute('points', dcArrowPoints(b, conn.toSide || 'left'));
        arrow.setAttribute('class', 'dv-connection-arrow');
        arrow.dataset.connIndex = idx;
        connGroup.appendChild(arrow);
    });
    svg.appendChild(connGroup);
    transformLayer.appendChild(svg);

    // 网格底纹
    const gridBg = document.createElement('div');
    gridBg.className = 'draws-viewer-grid-bg';
    gridBg.style.width = layout.canvasW + 'px';
    gridBg.style.height = layout.canvasH + 'px';
    gridBg.style.backgroundSize = layout.cellW + 'px ' + layout.cellH + 'px';
    gridBg.style.backgroundPosition = layout.padX + 'px ' + layout.padY + 'px';
    transformLayer.appendChild(gridBg);

    // 卡片层
    const cardsLayer = document.createElement('div');
    cardsLayer.className = 'draws-viewer-cards-layer';
    cardsLayer.style.width = layout.canvasW + 'px';
    cardsLayer.style.height = layout.canvasH + 'px';
    cards.forEach(card => {
        const pos = layout.positions[card.id];
        if (!pos) return;
        const el = dvBuildCardEl(card, { x: pos.x, y: pos.y, w: layout.cardW, h: layout.cardH }, layout, draws);
        el.dataset.cardId = card.id;
        cardsLayer.appendChild(el);
    });
    transformLayer.appendChild(cardsLayer);

    // 轮次标签
    const roundsMap = {};
    cards.forEach(card => {
        const col = card.col != null ? card.col : (card.round != null ? card.round : 0);
        if (!roundsMap[col]) roundsMap[col] = true;
    });
    const customLabels = draws.roundLabels || {};
    const defaultRoundLabels = [dcT('dv_round_1', '第一轮'), dcT('dv_round_2', '第二轮'), '1/4决赛', dcT('dv_semis', '半决赛'), dcT('dv_final', '决赛')];
    Object.keys(roundsMap).map(Number).sort((a, b) => a - b).forEach((col, i) => {
        const label = document.createElement('div');
        label.className = 'dv-round-label';
        label.textContent = customLabels[String(col)] || defaultRoundLabels[i] || (dcT('dv_round_n', '第{n}轮').replace('{n}', i + 1));
        label.style.left = (layout.padX + col * layout.cellW + layout.cellW / 2) + 'px';
        label.style.top = (layout.padY - 30) + 'px';
        transformLayer.appendChild(label);
    });

    viewport.appendChild(transformLayer);
    wrapper.appendChild(viewport);

    // 图例
    if ((draws.theme || {}).showLegend !== false) {
        const legend = document.createElement('div');
        legend.className = 'dv-legend';
        legend.innerHTML =
            '<span class="dv-legend-item"><span class="dv-legend-dot dv-legend-win"></span> ' + dcT('dv_legend_win', '胜者') + '</span>' +
            '<span class="dv-legend-item"><span class="dv-legend-dot dv-legend-loss"></span> ' + dcT('dv_legend_loss', '负者') + '</span>' +
            '<span class="dv-legend-item"><span class="dv-legend-dot dv-legend-live"></span> ' + dcT('dv_legend_live', '进行中') + '</span>' +
            '<span class="dv-legend-item"><span class="dv-legend-dot dv-legend-pending"></span> ' + dcT('dv_legend_pending', '待赛') + '</span>' +
            '<span class="dv-legend-item"><span class="dv-legend-line"></span> ' + dcT('dv_legend_path', '晋级路径') + '</span>';
        wrapper.appendChild(legend);
    }

    container.appendChild(wrapper);

    bindViewerControls(viewport, transformLayer, draws, layout);
    bindViewerSearch(wrapper, draws);
    bindCardInteractions(cardsLayer, viewport, draws);
}

// ---------- 交互：缩放 / 平移 ----------

function bindViewerControls(viewport, transformLayer, draws, layout) {
    viewerMinZoom = Math.min(1.0, (viewport.clientWidth - 16) / Math.max(layout.canvasW, 1));
    viewerMinZoom = Math.max(viewerMinZoom, 0.15);
    viewerZoom = viewerMinZoom;
    viewerPanX = 0; viewerPanY = 0;
    _dvSearchToken++;

    function applyTransform() {
        if (viewerRafId) return;
        viewerRafId = requestAnimationFrame(() => {
            viewerRafId = null;
            transformLayer.style.transformOrigin = '0 0';
            transformLayer.style.transform = 'translate(' + viewerPanX + 'px, ' + viewerPanY + 'px) scale(' + viewerZoom + ')';
        });
    }
    function clampZoom(z) { return Math.max(viewerMinZoom, Math.min(2.5, z)); }

    function doFit() {
        const vw = viewport.clientWidth, vh = viewport.clientHeight;
        const scale = clampZoom(Math.min((vw - 16) / Math.max(layout.canvasW, 1), (vh - 16) / Math.max(layout.canvasH, 1)));
        viewerZoom = scale;
        viewerPanX = Math.max(0, (vw - layout.canvasW * scale) / 2);
        viewerPanY = Math.max(0, (vh - layout.canvasH * scale) / 2);
        applyTransform();
    }
    doFit();

    const $id = id => document.getElementById(id);
    const zoomIn = $id('dvZoomIn'), zoomOut = $id('dvZoomOut'), zoomFit = $id('dvZoomFit'),
        zoomReset = $id('dvZoomReset'), fullscreenBtn = $id('dvFullscreen');

    if (fullscreenBtn) fullscreenBtn.addEventListener('click', () => {
        const wrap = viewport.closest('.draws-viewer-wrapper');
        if (!wrap) return;
        const isFS = wrap.classList.toggle('dv-fullscreen');
        fullscreenBtn.innerHTML = isFS ? '<i class="fa-solid fa-minimize"></i>' : '<i class="fa-solid fa-maximize"></i>';
        document.body.style.overflow = isFS ? 'hidden' : '';
        setTimeout(() => { doFit(); }, 200);
    });
    if (zoomIn) zoomIn.addEventListener('click', () => { viewerZoom = clampZoom(viewerZoom * 1.25); applyTransform(); });
    if (zoomOut) zoomOut.addEventListener('click', () => { viewerZoom = clampZoom(viewerZoom / 1.25); applyTransform(); });
    if (zoomFit) zoomFit.addEventListener('click', doFit);
    if (zoomReset) zoomReset.addEventListener('click', () => { viewerZoom = viewerMinZoom; viewerPanX = 0; viewerPanY = 0; applyTransform(); });

    // 滚轮缩放（指向光标）
    viewport.addEventListener('wheel', (e) => {
        e.preventDefault();
        const rect = viewport.getBoundingClientRect();
        const mx = e.clientX - rect.left, my = e.clientY - rect.top;
        const factor = e.deltaY > 0 ? 0.9 : 1.1;
        const newZoom = clampZoom(viewerZoom * factor);
        const sc = newZoom / viewerZoom;
        viewerPanX = mx - sc * (mx - viewerPanX);
        viewerPanY = my - sc * (my - viewerPanY);
        viewerZoom = newZoom;
        applyTransform();
    }, { passive: false });

    // 拖拽平移
    viewport.addEventListener('mousedown', (e) => {
        if (e.target.closest('.dv-card') || e.target.closest('.dv-popover') || e.target.closest('.dv-tool-btn')) return;
        e.preventDefault();
        isPanning = true;
        panStart = { x: e.clientX - viewerPanX, y: e.clientY - viewerPanY };
        viewport.style.cursor = 'grabbing';
        viewport.style.userSelect = 'none';
    });
    window.addEventListener('mousemove', (e) => {
        if (!isPanning) return;
        viewerPanX = e.clientX - panStart.x;
        viewerPanY = e.clientY - panStart.y;
        applyTransform();
    });
    window.addEventListener('mouseup', () => {
        if (!isPanning) return;
        isPanning = false;
        viewport.style.cursor = '';
        viewport.style.userSelect = '';
    });

    // 触屏：单指平移 / 双指缩放
    let touchStartDist = 0, touchStartZoom = 1;
    viewport.addEventListener('touchstart', (e) => {
        if (e.touches.length === 2) {
            const dx = e.touches[0].clientX - e.touches[1].clientX;
            const dy = e.touches[0].clientY - e.touches[1].clientY;
            touchStartDist = Math.hypot(dx, dy);
            touchStartZoom = viewerZoom;
        } else if (e.touches.length === 1) {
            isPanning = true;
            panStart = { x: e.touches[0].clientX - viewerPanX, y: e.touches[0].clientY - viewerPanY };
        }
    }, { passive: false });
    viewport.addEventListener('touchmove', (e) => {
        if (e.touches.length === 2) {
            const dx = e.touches[0].clientX - e.touches[1].clientX;
            const dy = e.touches[0].clientY - e.touches[1].clientY;
            const dist = Math.hypot(dx, dy);
            if (touchStartDist > 10) {
                viewerZoom = clampZoom(touchStartZoom * (dist / touchStartDist));
                applyTransform();
            }
        } else if (e.touches.length === 1 && isPanning) {
            viewerPanX = e.touches[0].clientX - panStart.x;
            viewerPanY = e.touches[0].clientY - panStart.y;
            applyTransform();
        }
    }, { passive: false });
    viewport.addEventListener('touchend', () => { isPanning = false; touchStartDist = 0; });

    // 键盘: +/- 缩放, 0 适应, 方向键平移
    viewport.addEventListener('keydown', (e) => {
        const step = 60;
        if (e.key === '+' || e.key === '=') { viewerZoom = clampZoom(viewerZoom * 1.2); applyTransform(); }
        else if (e.key === '-' || e.key === '_') { viewerZoom = clampZoom(viewerZoom / 1.2); applyTransform(); }
        else if (e.key === '0') { doFit(); }
        else if (e.key === 'ArrowLeft') { viewerPanX += step; applyTransform(); }
        else if (e.key === 'ArrowRight') { viewerPanX -= step; applyTransform(); }
        else if (e.key === 'ArrowUp') { viewerPanY += step; applyTransform(); }
        else if (e.key === 'ArrowDown') { viewerPanY -= step; applyTransform(); }
        else return;
        e.preventDefault();
    });
}

// ---------- 交互：搜索与路径高亮 ----------

function bindViewerSearch(wrapper, draws) {
    const input = wrapper.querySelector('#dvSearch');
    const clearBtn = wrapper.querySelector('#dvSearchClear');
    if (!input) return;
    let timer = null;
    input.addEventListener('input', () => {
        clearTimeout(timer);
        timer = setTimeout(() => applyViewerHighlight(wrapper, draws, input.value.trim()), 160);
    });
    input.addEventListener('keydown', e => {
        if (e.key === 'Escape') { input.value = ''; applyViewerHighlight(wrapper, draws, ''); input.blur(); }
        e.stopPropagation();
    });
    if (clearBtn) clearBtn.addEventListener('click', () => { input.value = ''; applyViewerHighlight(wrapper, draws, ''); input.focus(); });
}

function applyViewerHighlight(wrapper, draws, query) {
    const token = ++_dvSearchToken;
    const clearBtn = wrapper.querySelector('#dvSearchClear');
    if (clearBtn) clearBtn.style.display = query ? '' : 'none';

    const cardsLayer = wrapper.querySelector('.draws-viewer-cards-layer');
    const svg = wrapper.querySelector('.draws-viewer-svg');
    if (!cardsLayer || !svg) return;
    const cardEls = {};
    cardsLayer.querySelectorAll('.dv-card').forEach(el => { cardEls[el.dataset.cardId] = el; });
    const connEls = {};
    svg.querySelectorAll('[data-conn-index]').forEach(el => {
        const i = el.dataset.connIndex;
        (connEls[i] = connEls[i] || []).push(el);
    });
    const connections = draws.connections || [];

    cardsLayer.querySelectorAll('.dv-card').forEach(el => el.classList.remove('dv-hl', 'dv-hl-path', 'dv-dim'));
    svg.querySelectorAll('.dv-connection-line').forEach(el => el.classList.remove('dv-hl', 'dv-hl-path', 'dv-dim'));
    svg.querySelectorAll('.dv-connection-arrow').forEach(el => el.classList.remove('dv-hl', 'dv-hl-path', 'dv-dim'));

    if (!query) return;

    const q = query.toLowerCase();
    // 命中的卡片
    const hitIds = new Set();
    (draws.cards || []).forEach(c => {
        const names = [dcPlayerName(c.player1), dcPlayerName(c.player2), c.text || '', c.note || ''].join(' ').toLowerCase();
        if (names.includes(q)) hitIds.add(c.id);
    });
    if (!hitIds.size) return;

    // 晋级路径：从命中卡片沿连线向后传播
    const pathIds = new Set(hitIds);
    let grew = true;
    while (grew) {
        grew = false;
        connections.forEach((cn, idx) => {
            if (pathIds.has(cn.from) && !pathIds.has(cn.to)) { pathIds.add(cn.to); grew = true; }
        });
    }
    // 相关连线：两端都在路径中
    const relConns = new Set();
    connections.forEach((cn, idx) => {
        if (pathIds.has(cn.from) && pathIds.has(cn.to)) relConns.add(String(idx));
    });

    requestAnimationFrame(() => {
        if (token !== _dvSearchToken) return; // 已被更新的搜索覆盖
        (draws.cards || []).forEach(c => {
            const el = cardEls[c.id];
            if (!el) return;
            if (hitIds.has(c.id)) el.classList.add('dv-hl');
            else if (pathIds.has(c.id)) el.classList.add('dv-hl-path');
            else el.classList.add('dv-dim');
        });
        connections.forEach((cn, idx) => {
            const els = connEls[String(idx)];
            if (!els) return;
            if (relConns.has(String(idx))) els.forEach(el => el.classList.add('dv-hl-path'));
            else els.forEach(el => el.classList.add('dv-dim'));
        });
    });
}

// ---------- 交互：卡片点击详情 / 悬停连线高亮 ----------

function bindCardInteractions(cardsLayer, viewport, draws) {
    const svg = viewport.querySelector('.draws-viewer-svg');
    const connIndexByCards = new Map();
    (draws.connections || []).forEach((cn, idx) => {
        if (!connIndexByCards.has(cn.from)) connIndexByCards.set(cn.from, []);
        if (!connIndexByCards.has(cn.to)) connIndexByCards.set(cn.to, []);
        connIndexByCards.get(cn.from).push(idx);
        connIndexByCards.get(cn.to).push(idx);
    });

    const cardMap = {};
    (draws.cards || []).forEach(c => { cardMap[c.id] = c; });

    let hoverCardId = null;

    function highlightConns(cardId, on) {
        if (!svg) return;
        const idxs = connIndexByCards.get(cardId) || [];
        idxs.forEach(i => {
            svg.querySelectorAll('[data-conn-index="' + i + '"]').forEach(el => el.classList.toggle('dv-hl', !!on));
        });
        if (on && cardId) {
            const el = cardsLayer.querySelector('.dv-card[data-card-id="' + cardId + '"]');
            if (el) el.classList.add('dv-hover');
        } else if (cardId) {
            const el = cardsLayer.querySelector('.dv-card[data-card-id="' + cardId + '"]');
            if (el) el.classList.remove('dv-hover');
        }
    }

    cardsLayer.addEventListener('mouseover', (e) => {
        const cardEl = e.target.closest('.dv-card');
        const id = cardEl ? cardEl.dataset.cardId : null;
        if (id === hoverCardId) return;
        if (hoverCardId) highlightConns(hoverCardId, false);
        hoverCardId = id;
        if (id) highlightConns(id, true);
    });
    cardsLayer.addEventListener('mouseleave', () => {
        if (hoverCardId) { highlightConns(hoverCardId, false); hoverCardId = null; }
    });

    cardsLayer.addEventListener('click', (e) => {
        const cardEl = e.target.closest('.dv-card');
        if (!cardEl) { dvHideCardPopover(); return; }
        const card = cardMap[cardEl.dataset.cardId];
        if (!card) return;
        const pop = document.getElementById('dvPopover');
        if (pop && pop.dataset.cardId === card.id) { dvHideCardPopover(); return; }
        dvHideCardPopover();
        dvShowCardPopover(card, cardEl, viewport);
        const newPop = document.getElementById('dvPopover');
        if (newPop) newPop.dataset.cardId = card.id;
    });

    // 点击空白处关闭弹窗
    viewport.addEventListener('mousedown', (e) => {
        if (!e.target.closest('.dv-card') && !e.target.closest('.dv-popover')) dvHideCardPopover();
    });
}

window.initDrawsViewer = initDrawsViewer;
