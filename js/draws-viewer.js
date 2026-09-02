/* ========================================
   draws-viewer.js - 网格吸附抽签表观众端渲染引擎
   ======================================== */

let currentDrawsData = null;
let viewerZoom = 1;
let viewerMinZoom = 0.3;         // 最小缩放 = 恰好展示所有卡片列
let viewerPanX = 0, viewerPanY = 0;
let isPanning = false, panStart = { x: 0, y: 0 };
let viewerGrid = null;
let viewerRafId = null;          // requestAnimationFrame ID for smooth updates

/**
 * 解析比分字符串, 返回 { p1Score, p2Score }
 */
function parseScore(scoreStr) {
    if (!scoreStr) return { p1Score: null, p2Score: null };
    const parts = scoreStr.split('-');
    if (parts.length === 2) {
        return { p1Score: parseInt(parts[0]) || 0, p2Score: parseInt(parts[1]) || 0 };
    }
    return { p1Score: null, p2Score: null };
}

/**
 * 根据球员姓名长度自动计算最佳 cellWidth
 */
function calcAutoCellWidth(cards, minW, maxW) {
    let maxLen = 3;
    cards.forEach(c => {
        if (c.player1 && c.player1.length > maxLen) maxLen = c.player1.length;
        if (c.player2 && c.player2.length > maxLen) maxLen = c.player2.length;
    });
    // 中文字符约占 14px，英文约占 8px，取混合估算 ~11px/char + padding
    const estW = maxLen * 11 + 56;
    return Math.max(minW, Math.min(maxW, Math.round(estW / 5) * 5));
}

/**
 * 初始化抽签表查看器
 */
function initDrawsViewer(containerId, draws) {
    currentDrawsData = draws;
    const container = document.getElementById(containerId);
    if (!container || !draws) return;

    if (draws.version !== 2) {
        container.innerHTML = renderLegacyBracket(draws);
        return;
    }

    // Auto-size if grid.autoSize is true
    const grid = draws.grid || {};
    if (grid.autoSize) {
        grid.cellWidth = calcAutoCellWidth(draws.cards || [], 120, 300);
        grid.cellHeight = Math.max(56, Math.round(grid.cellWidth * 0.38));
        draws.grid = grid;
    }

    renderGridViewer(container, draws);
}

/**
 * 渲染网格视图
 */
function renderGridViewer(container, draws) {
    const grid = draws.grid || { cols: 7, rows: 20, cellWidth: 180, cellHeight: 64 };
    viewerGrid = grid;
    const cards = draws.cards || [];
    const connections = draws.connections || [];

    // Calculate canvas size
    const canvasWidth = grid.cols * grid.cellWidth + 160;
    const canvasHeight = grid.rows * grid.cellHeight + 80;
    const paddingX = 80;
    const paddingY = 40;

    container.innerHTML = '';

    // Wrapper
    const wrapper = document.createElement('div');
    wrapper.className = 'draws-viewer-wrapper';

    // Title bar — only zoom tools, no size controls
    if (draws.title) {
        const _L = (typeof i18n !== 'undefined' && i18n[currentLang]) || {};
        const titleBar = document.createElement('div');
        titleBar.className = 'draws-viewer-title-bar';
        titleBar.innerHTML = `
            <h2 class="draws-viewer-title">${escapeHtml(draws.title)}</h2>
            <div class="draws-viewer-tools">
                <button class="dv-tool-btn" id="dvFullscreen" title="${_L.dv_fullscreen || '全屏显示 (网页内)'}"><i class="fa-solid fa-maximize"></i></button>
                <span class="dv-tool-sep">|</span>
                <button class="dv-tool-btn" id="dvZoomOut" title="${_L.dv_zoom_out || '缩小'}"><i class="fa-solid fa-magnifying-glass-minus"></i></button>
                <button class="dv-tool-btn" id="dvZoomIn" title="${_L.dv_zoom_in || '放大'}"><i class="fa-solid fa-magnifying-glass-plus"></i></button>
                <button class="dv-tool-btn" id="dvZoomFit" title="${_L.dv_zoom_fit || '适应内容'}"><i class="fa-solid fa-expand"></i></button>
                <button class="dv-tool-btn" id="dvZoomReset" title="${_L.dv_zoom_reset || '重置视图'}"><i class="fa-solid fa-arrows-to-circle"></i></button>
            </div>
        `;
        wrapper.appendChild(titleBar);
    }

    // Canvas viewport (scrollable area)
    const viewport = document.createElement('div');
    viewport.className = 'draws-viewer-viewport';
    viewport.id = 'dvViewport';

    // Transform layer
    const transformLayer = document.createElement('div');
    transformLayer.className = 'draws-viewer-transform';
    transformLayer.id = 'dvTransform';

    // SVG connections layer
    const svgNS = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(svgNS, 'svg');
    svg.setAttribute('class', 'draws-viewer-svg');
    svg.setAttribute('width', canvasWidth + paddingX * 2);
    svg.setAttribute('height', canvasHeight + paddingY * 2);
    svg.style.position = 'absolute';
    svg.style.top = '0';
    svg.style.left = '0';
    svg.style.pointerEvents = 'none';
    svg.style.zIndex = '1';
    svg.style.overflow = 'visible';

    // Draw connection lines
    const cardMap = {};
    cards.forEach(c => { cardMap[c.id] = c; });

    connections.forEach(conn => {
        const fromCard = cardMap[conn.from];
        const toCard = cardMap[conn.to];
        if (!fromCard || !toCard) return;

        const fromX = paddingX + fromCard.col * grid.cellWidth + grid.cellWidth;
        const fromY = paddingY + fromCard.row * grid.cellHeight + grid.cellHeight / 2;
        const toX = paddingX + toCard.col * grid.cellWidth;
        const toY = paddingY + toCard.row * grid.cellHeight + grid.cellHeight / 2;

        const path = document.createElementNS(svgNS, 'path');
        const midX = (fromX + toX) / 2;
        const d = `M ${fromX} ${fromY} C ${midX} ${fromY}, ${midX} ${toY}, ${toX} ${toY}`;
        path.setAttribute('d', d);
        path.setAttribute('class', 'dv-connection-line');
        svg.appendChild(path);

        // Arrow at destination
        const arrowSize = 7;
        const arrow = document.createElementNS(svgNS, 'polygon');
        arrow.setAttribute('points', `${toX - 1},${toY - arrowSize} ${toX + arrowSize * 2},${toY} ${toX - 1},${toY + arrowSize}`);
        arrow.setAttribute('class', 'dv-connection-arrow');
        svg.appendChild(arrow);
    });

    transformLayer.appendChild(svg);

    // Grid background — very subtle
    const gridBg = document.createElement('div');
    gridBg.className = 'draws-viewer-grid-bg';
    gridBg.style.width = (canvasWidth + paddingX * 2) + 'px';
    gridBg.style.height = (canvasHeight + paddingY * 2) + 'px';
    gridBg.style.position = 'absolute';
    gridBg.style.top = '0';
    gridBg.style.left = '0';
    gridBg.style.zIndex = '0';
    gridBg.style.backgroundImage = `
        linear-gradient(rgba(128,128,128,0.025) 1px, transparent 1px),
        linear-gradient(90deg, rgba(128,128,128,0.025) 1px, transparent 1px)
    `;
    gridBg.style.backgroundSize = `${grid.cellWidth}px ${grid.cellHeight}px`;
    gridBg.style.backgroundPosition = `${paddingX}px ${paddingY}px`;
    transformLayer.appendChild(gridBg);

    // Cards layer
    const cardsLayer = document.createElement('div');
    cardsLayer.className = 'draws-viewer-cards-layer';
    cardsLayer.style.position = 'absolute';
    cardsLayer.style.top = '0';
    cardsLayer.style.left = '0';
    cardsLayer.style.width = (canvasWidth + paddingX * 2) + 'px';
    cardsLayer.style.height = (canvasHeight + paddingY * 2) + 'px';
    cardsLayer.style.zIndex = '2';

    cards.forEach(card => {
        const cardEl = document.createElement('div');
        cardEl.className = 'dv-card';
        if (card.isChampion) cardEl.classList.add('dv-card-champion');

        const x = paddingX + card.col * grid.cellWidth + 4;
        const y = paddingY + card.row * grid.cellHeight + 4;
        const w = grid.cellWidth - 8;
        const h = grid.cellHeight - 8;

        cardEl.style.left = x + 'px';
        cardEl.style.top = y + 'px';
        cardEl.style.width = w + 'px';
        cardEl.style.minHeight = h + 'px';

        const p1Name = card.player1 || '—';
        const p2Name = card.player2 || '';
        const score = card.score || '';
        const winner = card.winner;
        const p1Won = winner === 1;
        const p2Won = winner === 2;
        const scores = parseScore(score);

        if (card.isChampion) {
            cardEl.innerHTML = `
                <div class="dv-card-champion-icon"><i class="fa-solid fa-crown"></i></div>
                <div class="dv-card-player dv-card-winner-name">${escapeHtml(p1Name)}</div>
                <div class="dv-card-champion-label">CHAMPION</div>
            `;
        } else if (!p2Name || p2Name === '轮空') {
            cardEl.innerHTML = `
                <div class="dv-card-player ${p1Won ? 'dv-winner' : ''}">
                    <span class="dv-player-name">${escapeHtml(p1Name)}</span>
                    ${scores.p1Score !== null ? `<span class="dv-player-score ${p1Won ? 'dv-score-win' : 'dv-score-loss'}">${scores.p1Score}</span>` : ''}
                </div>
                <div class="dv-card-bye">— BYE —</div>
            `;
        } else {
            cardEl.innerHTML = `
                <div class="dv-card-player ${p1Won ? 'dv-winner' : (p2Won ? 'dv-loser' : '')}">
                    <span class="dv-player-name">${escapeHtml(p1Name)}</span>
                    ${scores.p1Score !== null ? `<span class="dv-player-score ${p1Won ? 'dv-score-win' : 'dv-score-loss'}">${scores.p1Score}</span>` : ''}
                </div>
                <div class="dv-card-vs"></div>
                <div class="dv-card-player ${p2Won ? 'dv-winner' : (p1Won ? 'dv-loser' : '')}">
                    <span class="dv-player-name">${escapeHtml(p2Name)}</span>
                    ${scores.p2Score !== null ? `<span class="dv-player-score ${p2Won ? 'dv-score-win' : 'dv-score-loss'}">${scores.p2Score}</span>` : ''}
                </div>
            `;
        }

        // Subtle total score badge (bottom-right)
        if (score && !card.isChampion && p2Name && p2Name !== '轮空') {
            const scoreTag = document.createElement('div');
            scoreTag.className = 'dv-card-score-tag';
            scoreTag.textContent = score;
            cardEl.appendChild(scoreTag);
        }

        cardsLayer.appendChild(cardEl);
    });

    transformLayer.appendChild(cardsLayer);

    // Round labels
    const roundsMap = {};
    cards.forEach(card => {
        if (!roundsMap[card.col]) roundsMap[card.col] = { col: card.col, minRow: card.row, maxRow: card.row, cards: [] };
        const r = roundsMap[card.col];
        r.minRow = Math.min(r.minRow, card.row);
        r.maxRow = Math.max(r.maxRow, card.row);
        r.cards.push(card);
    });

    const defaultRoundLabels = ['第一轮', '第二轮', '1/4决赛', '半决赛', '决赛', '冠军'];
    const customLabels = draws.roundLabels || {};
    Object.values(roundsMap).forEach((r, i) => {
        const label = document.createElement('div');
        label.className = 'dv-round-label';
        // 优先使用自定义表头（按列索引），否则使用默认表头
        const colKey = String(r.col);
        label.textContent = customLabels[colKey] || defaultRoundLabels[i] || `第${i + 1}轮`;
        label.style.position = 'absolute';
        label.style.left = (paddingX + r.col * grid.cellWidth + grid.cellWidth / 2) + 'px';
        label.style.top = (paddingY - 28) + 'px';
        label.style.transform = 'translateX(-50%)';
        label.style.zIndex = '3';
        transformLayer.appendChild(label);
    });

    viewport.appendChild(transformLayer);
    wrapper.appendChild(viewport);
    container.appendChild(wrapper);

    // Legend
    const legend = document.createElement('div');
    legend.className = 'dv-legend';
    legend.innerHTML = `
        <span class="dv-legend-item"><span class="dv-legend-dot dv-legend-win"></span> 胜者</span>
        <span class="dv-legend-item"><span class="dv-legend-dot dv-legend-loss"></span> 负者</span>
        <span class="dv-legend-item"><span class="dv-legend-line"></span> 晋级路径</span>
    `;
    container.appendChild(legend);

    // Bind zoom/pan controls
    bindViewerControls(viewport, transformLayer, draws);
}

/**
 * 计算"恰好展示所有卡片列"的最小缩放
 */
function calcMinZoom(viewport, draws) {
    const cards = draws.cards || [];
    const grid = draws.grid || { cellWidth: 180, cols: 7 };
    const paddingX = 80;
    let maxCol = 0;
    cards.forEach(c => { if (c.col > maxCol) maxCol = c.col; });
    const contentW = (maxCol + 1) * grid.cellWidth + paddingX * 2 + 20;
    const vw = viewport.clientWidth;
    return Math.min(1.0, (vw - 16) / contentW);
}

/**
 * 绑定查看器缩放/平移控件
 */
function bindViewerControls(viewport, transformLayer, draws) {
    // --- 计算并锁定最小缩放 ---
    viewerMinZoom = calcMinZoom(viewport, draws);
    viewerZoom = viewerMinZoom;
    viewerPanX = 0;
    viewerPanY = 0;

    const zoomIn = document.getElementById('dvZoomIn');
    const zoomOut = document.getElementById('dvZoomOut');
    const zoomFit = document.getElementById('dvZoomFit');
    const zoomReset = document.getElementById('dvZoomReset');
    const fullscreenBtn = document.getElementById('dvFullscreen');

    // --- Fullscreen toggle ---
    if (fullscreenBtn) {
        fullscreenBtn.addEventListener('click', () => {
            const wrapper = viewport.closest('.draws-viewer-container') || viewport.closest('.draws-viewer-wrapper')?.parentElement;
            if (!wrapper) return;
            const isFS = wrapper.classList.toggle('dv-fullscreen');
            fullscreenBtn.innerHTML = isFS
                ? '<i class="fa-solid fa-minimize"></i>'
                : '<i class="fa-solid fa-maximize"></i>';
            if (isFS) {
                document.body.style.overflow = 'hidden';
            } else {
                document.body.style.overflow = '';
            }
            setTimeout(() => { if (zoomFit) zoomFit.click(); }, 200);
        });
    }

    // GPU 加速
    transformLayer.style.willChange = 'transform';

    function applyTransform() {
        if (viewerRafId) return; // debounce via rAF
        viewerRafId = requestAnimationFrame(() => {
            viewerRafId = null;
            transformLayer.style.transform = `translate(${viewerPanX}px, ${viewerPanY}px) scale(${viewerZoom})`;
            transformLayer.style.transformOrigin = '0 0';
        });
    }

    function clampZoom(z) {
        return Math.max(viewerMinZoom, Math.min(2.5, z));
    }

    // --- 初始适应 ---
    function doFit() {
        const cards = draws.cards || [];
        const grid = draws.grid || { cellWidth: 180, cellHeight: 64, cols: 7 };
        const paddingX = 80;
        let maxCol = 0, maxRow = 0;
        cards.forEach(c => { if (c.col > maxCol) maxCol = c.col; if (c.row > maxRow) maxRow = c.row; });
        const contentW = (maxCol + 1) * grid.cellWidth + paddingX * 2 + 40;
        const contentH = (maxRow + 1) * grid.cellHeight + 100;

        const vw = viewport.clientWidth;
        const vh = viewport.clientHeight;
        const scaleX = (vw - 16) / contentW;
        const scaleY = (vh - 16) / contentH;
        viewerZoom = clampZoom(Math.min(scaleX, scaleY));
        viewerPanX = Math.max(0, (vw - contentW * viewerZoom) / 2);
        viewerPanY = Math.max(0, (vh - contentH * viewerZoom) / 2);
        applyTransform();
    }

    // 初始 fit
    doFit();

    // --- 按钮 ---
    if (zoomIn) zoomIn.addEventListener('click', () => {
        viewerZoom = clampZoom(viewerZoom * 1.25);
        applyTransform();
    });
    if (zoomOut) zoomOut.addEventListener('click', () => {
        viewerZoom = clampZoom(viewerZoom / 1.25);
        applyTransform();
    });
    if (zoomFit) zoomFit.addEventListener('click', doFit);
    if (zoomReset) zoomReset.addEventListener('click', () => {
        viewerZoom = viewerMinZoom;
        viewerPanX = 0;
        viewerPanY = 0;
        applyTransform();
    });

    // --- 滚轮缩放 (流畅) ---
    viewport.addEventListener('wheel', (e) => {
        e.preventDefault();
        const rect = viewport.getBoundingClientRect();
        const mx = e.clientX - rect.left;
        const my = e.clientY - rect.top;

        const factor = e.deltaY > 0 ? 0.9 : 1.1;
        const newZoom = clampZoom(viewerZoom * factor);

        // Zoom toward cursor
        const scaleChange = newZoom / viewerZoom;
        viewerPanX = mx - scaleChange * (mx - viewerPanX);
        viewerPanY = my - scaleChange * (my - viewerPanY);
        viewerZoom = newZoom;
        applyTransform();
    }, { passive: false });

    // --- 拖拽平移 (无黏着感) ---
    viewport.addEventListener('mousedown', (e) => {
        if (e.target.closest('.dv-card') || e.target.closest('.dv-tool-btn')) return;
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

    // --- 触摸支持 ---
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

    viewport.addEventListener('touchend', () => {
        isPanning = false;
        touchStartDist = 0;
    });
}

/**
 * 兼容旧版数据渲染（fallback）
 */
function renderLegacyBracket(draws) {
    if (!draws || !draws.rounds || !draws.rounds.length) return '<p class="draws-empty">暂无对阵数据</p>';

    let html = '';
    if (draws.title) {
        html += `<h3 class="draws-title">${escapeHtml(draws.title)}</h3>`;
    }

    draws.rounds.forEach((round) => {
        html += `<div class="draws-round">`;
        html += `<h4 class="draws-round-name">${escapeHtml(round.name)}</h4>`;
        if (round.matches && round.matches.length) {
            html += `<div class="draws-matches">`;
            round.matches.forEach(m => {
                const p1 = m.player1 && typeof m.player1 === 'object' ? m.player1.name : (m.player1 || '—');
                const p2 = m.player2 && typeof m.player2 === 'object' ? m.player2.name : (m.player2 || '—');
                const p1Won = m.winner === 1;
                const p2Won = m.winner === 2;
                html += `<div class="draws-match glass-card">`;
                html += `<div class="draws-match-players">`;
                html += `<span class="draws-player ${p1Won ? 'draws-winner' : ''}">${escapeHtml(p1)}</span>`;
                if (p2 && p2 !== '—') {
                    html += `<span class="draws-vs">VS</span>`;
                    html += `<span class="draws-player ${p2Won ? 'draws-winner' : ''}">${escapeHtml(p2)}</span>`;
                }
                html += `</div>`;
                if (m.score) {
                    html += `<div class="draws-match-score">${escapeHtml(m.score)}</div>`;
                }
                html += `</div>`;
            });
            html += `</div>`;
        }
        html += `</div>`;
    });

    return html;
}

// Export for direct page usage
window.initDrawsViewer = initDrawsViewer;
