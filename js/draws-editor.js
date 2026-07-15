/* ========================================
   draws-editor.js - 管理员可视化抽签表编辑器
   网格吸附 · 自由拖拽 · 连接线绘制
   ======================================== */

// ========================================
// 全局状态
// ========================================
let editorDrawsData = null;
let editorGrid = { cols: 7, rows: 32, cellWidth: 180, cellHeight: 64 };
let editorCards = [];
let editorConnections = [];
let editorCardMap = {};
let editorRoundLabels = {};          // 自定义表头 { "0": "第一轮", "1": "第二轮", ... }
let editorSelectedCard = null;
let editorSelectedCards = new Set();   // Ctrl+框选多选
let editorConnectionMode = false;
let editorConnectionSource = null;
let editorDragCard = null;
let editorDragOffset = { x: 0, y: 0 };
let editorNextCardId = 1;
let editorDirty = false;
let editorCanvasScale = 1;
let editorContainerId = '';
let editorIsFullscreen = false;
let editorUserZoomed = false;   // 用户手动调过缩放后，不再 autoFit 覆盖

// DOM refs (set on init)
let edCanvas, edSvg, edCardsLayer, edGridBg;
let edStatusBar;
let edPadX = 100, edPadY = 50;  // stored for reuse

/**
 * 解析比分字符串
 */
function parseScoreEd(scoreStr) {
    if (!scoreStr) return { p1Score: null, p2Score: null };
    const parts = scoreStr.split('-');
    if (parts.length === 2) {
        return { p1Score: parseInt(parts[0]) || 0, p2Score: parseInt(parts[1]) || 0 };
    }
    return { p1Score: null, p2Score: null };
}

/**
 * 初始化编辑器
 */
function initDrawsEditor(containerId, drawsData) {
    const container = document.getElementById(containerId);
    if (!container) return;
    editorContainerId = containerId;

    // Load existing data or create new
    if (drawsData && drawsData.version === 2) {
        editorDrawsData = JSON.parse(JSON.stringify(drawsData));
        editorGrid = editorDrawsData.grid || { cols: 7, rows: 32, cellWidth: 180, cellHeight: 64 };
        editorCards = editorDrawsData.cards || [];
        editorConnections = editorDrawsData.connections || [];
        editorRoundLabels = editorDrawsData.roundLabels || {};
    } else {
        editorDrawsData = {
            id: 'd' + Date.now(),
            competitionId: '',
            title: '新建抽签表',
            version: 2,
            grid: editorGrid,
            cards: [],
            connections: [],
            roundLabels: {}
        };
        editorCards = [];
        editorConnections = [];
        editorRoundLabels = {};
    }

    buildCardMap();
    editorNextCardId = editorCards.length > 0
        ? Math.max(...editorCards.map(c => parseInt(c.id.replace('m', '')) || 0)) + 1
        : 1;
    editorDirty = false;

    renderEditorUI(container);
}

function buildCardMap() {
    editorCardMap = {};
    editorCards.forEach(c => { editorCardMap[c.id] = c; });
}

/**
 * 渲染编辑器UI
 */
function renderEditorUI(container) {
    const totalW = editorGrid.cols * editorGrid.cellWidth + 200;
    const totalH = editorGrid.rows * editorGrid.cellHeight + 100;
    edPadX = 100;
    edPadY = 50;
    const padX = edPadX, padY = edPadY;

    container.innerHTML = '';

    // Toolbar
    const toolbar = document.createElement('div');
    toolbar.className = 'de-toolbar';
    toolbar.innerHTML = `
        <div class="de-toolbar-left">
            <button class="de-btn de-btn-primary" id="deAddCard"><i class="fa-solid fa-plus"></i> 添加卡片</button>
            <button class="de-btn" id="deConnectMode"><i class="fa-solid fa-arrow-right-arrow-left"></i> 连线模式</button>
            <button class="de-btn de-btn-danger" id="deDeleteSelected" disabled><i class="fa-solid fa-trash-can"></i> 删除选中</button>
            <span class="de-separator">|</span>
            <button class="de-btn" id="deFullscreen" title="全屏编辑 (网页内)"><i class="fa-solid fa-maximize"></i></button>
        </div>
        <div class="de-toolbar-center">
            <button class="de-btn de-btn-sm" id="deZoomOut" title="缩小 (或 Ctrl+滚轮)"><i class="fa-solid fa-magnifying-glass-minus"></i></button>
            <span class="de-zoom-val" id="deZoomVal">100%</span>
            <button class="de-btn de-btn-sm" id="deZoomIn" title="放大 (或 Ctrl+滚轮)"><i class="fa-solid fa-magnifying-glass-plus"></i></button>
            <button class="de-btn de-btn-sm" id="deZoomFit" title="适应窗口"><i class="fa-solid fa-expand"></i></button>
            <span class="de-separator">|</span>
            <span class="de-mode-indicator" id="deModeLabel">🖱 拖拽模式 (Alt+拖拽=框选, Ctrl+滚轮=缩放)</span>
        </div>
        <div class="de-toolbar-right">
            <label class="de-grid-label">网格:</label>
            <input type="number" class="de-grid-input" id="deGridCols" value="${editorGrid.cols}" min="1" max="20" title="列数">
            <span class="de-grid-x">×</span>
            <input type="number" class="de-grid-input" id="deGridRows" value="${editorGrid.rows}" min="1" max="60" title="行数">
            <label class="de-grid-label">单元:</label>
            <input type="number" class="de-grid-input de-grid-input-sm" id="deCellW" value="${editorGrid.cellWidth}" min="80" max="400" title="单元宽度(px)">
            <span class="de-grid-x">×</span>
            <input type="number" class="de-grid-input de-grid-input-sm" id="deCellH" value="${editorGrid.cellHeight}" min="40" max="200" title="单元高度(px)">
            <label class="de-check-label" style="margin-left:6px;" title="开启后查看器自动根据名字长度调节卡片宽度">
                <input type="checkbox" id="deAutoSize" ${editorGrid.autoSize ? 'checked' : ''}>
                <span style="font-size:0.73rem;white-space:nowrap;">自动</span>
            </label>
            <button class="de-btn de-btn-sm" id="deApplyGrid">应用</button>
            <span class="de-separator">|</span>
            <button class="de-btn de-btn-sm" id="deEditLabels" title="自定义各列表头名称"><i class="fa-solid fa-tags"></i> 表头</button>
        </div>
    `;
    container.appendChild(toolbar);

    // Main editor area
    const editorArea = document.createElement('div');
    editorArea.className = 'de-area';
    editorArea.id = 'deArea';

    // Canvas wrapper
    const canvasWrapper = document.createElement('div');
    canvasWrapper.className = 'de-canvas-wrapper';
    canvasWrapper.id = 'deCanvasWrapper';

    // Resize handle (bottom edge drag)
    const resizeHandle = document.createElement('div');
    resizeHandle.className = 'de-resize-handle';
    resizeHandle.id = 'deResizeHandle';
    resizeHandle.title = '拖动调整画布高度';

    // Transform layer
    const transformLayer = document.createElement('div');
    transformLayer.className = 'de-transform-layer';
    transformLayer.id = 'deTransformLayer';
    transformLayer.style.width = (totalW + padX * 2) + 'px';
    transformLayer.style.height = (totalH + padY * 2) + 'px';

    // SVG connections
    const svgNS = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(svgNS, 'svg');
    svg.setAttribute('class', 'de-svg');
    svg.setAttribute('width', totalW + padX * 2);
    svg.setAttribute('height', totalH + padY * 2);
    svg.style.position = 'absolute';
    svg.style.top = '0';
    svg.style.left = '0';
    svg.style.zIndex = '1';
    svg.style.pointerEvents = 'none';
    svg.style.overflow = 'visible';
    edSvg = svg;

    // Grid background
    edGridBg = document.createElement('div');
    edGridBg.className = 'de-grid-bg';
    edGridBg.style.width = (totalW + padX * 2) + 'px';
    edGridBg.style.height = (totalH + padY * 2) + 'px';
    edGridBg.style.position = 'absolute';
    edGridBg.style.top = '0';
    edGridBg.style.left = '0';
    edGridBg.style.zIndex = '0';
    updateGridBg(padX, padY);

    // Cards layer
    edCardsLayer = document.createElement('div');
    edCardsLayer.className = 'de-cards-layer';
    edCardsLayer.id = 'deCardsLayer';
    edCardsLayer.style.position = 'absolute';
    edCardsLayer.style.top = '0';
    edCardsLayer.style.left = '0';
    edCardsLayer.style.width = (totalW + padX * 2) + 'px';
    edCardsLayer.style.height = (totalH + padY * 2) + 'px';
    edCardsLayer.style.zIndex = '2';

    transformLayer.appendChild(svg);
    transformLayer.appendChild(edGridBg);
    transformLayer.appendChild(edCardsLayer);
    canvasWrapper.appendChild(transformLayer);
    editorArea.appendChild(canvasWrapper);
    container.appendChild(editorArea);

    // Resize handle
    container.appendChild(resizeHandle);

    edCanvas = canvasWrapper;

    // Status bar
    edStatusBar = document.createElement('div');
    edStatusBar.className = 'de-statusbar';
    edStatusBar.id = 'deStatusBar';
    edStatusBar.innerHTML = `
        <span>卡片: <strong>${editorCards.length}</strong></span>
        <span>连线: <strong>${editorConnections.length}</strong></span>
        <span>网格: ${editorGrid.cols}×${editorGrid.rows} (${editorGrid.cellWidth}×${editorGrid.cellHeight}px)</span>
        <span class="de-dirty-indicator" id="deDirtyIndicator" style="display:none;">● 未保存</span>
    `;
    container.appendChild(edStatusBar);

    // Render cards
    renderAllCards(padX, padY);
    renderAllConnections(padX, padY);

    // Bind events
    bindEditorEvents(padX, padY);

    // Bind resize handle
    bindResizeHandle(canvasWrapper, resizeHandle);

    // Auto-scale to fit
    setTimeout(() => autoFitCanvas(), 400);
}

function updateGridBg(padX, padY) {
    edGridBg.style.backgroundImage = `
        linear-gradient(rgba(99,102,241,0.06) 1px, transparent 1px),
        linear-gradient(90deg, rgba(99,102,241,0.06) 1px, transparent 1px)
    `;
    edGridBg.style.backgroundSize = `${editorGrid.cellWidth}px ${editorGrid.cellHeight}px`;
    edGridBg.style.backgroundPosition = `${padX}px ${padY}px`;
}

/**
 * 渲染所有卡片
 */
function renderAllCards(padX, padY) {
    edCardsLayer.innerHTML = '';
    buildCardMap();

    editorCards.forEach(card => {
        const el = createCardElement(card, padX, padY);
        edCardsLayer.appendChild(el);
    });
}

function createCardElement(card, padX, padY) {
    const el = document.createElement('div');
    el.className = 'de-card';
    el.dataset.cardId = card.id;
    if (card.isChampion) el.classList.add('de-card-champion');
    if (editorSelectedCard === card.id) el.classList.add('de-card-selected');

    const x = padX + card.col * editorGrid.cellWidth + 4;
    const y = padY + card.row * editorGrid.cellHeight + 4;
    const w = editorGrid.cellWidth - 8;
    const h = editorGrid.cellHeight - 8;

    el.style.left = x + 'px';
    el.style.top = y + 'px';
    el.style.width = w + 'px';
    el.style.minHeight = h + 'px';

    const p1 = card.player1 || '选手A';
    const p2 = card.player2 || '';
    const score = card.score || '';
    const winner = card.winner;
    const scores = parseScoreEd(score);

    if (card.isChampion) {
        el.innerHTML = `
            <div class="de-card-icon"><i class="fa-solid fa-crown"></i></div>
            <div class="de-card-pname">${escapeHtml(p1)}</div>
            <div class="de-card-clabel">CHAMPION</div>
        `;
    } else {
        let inner = '';
        if (!p2 || p2 === '轮空') {
            inner = `
                <div class="de-card-player ${winner === 1 ? 'de-winner' : ''}">
                    <span>${escapeHtml(p1)}</span>
                    ${scores.p1Score !== null ? `<span class="de-score">${scores.p1Score}</span>` : ''}
                </div>
                <div class="de-card-bye">— BYE —</div>
            `;
        } else {
            inner = `
                <div class="de-card-player ${winner === 1 ? 'de-winner' : (winner === 2 ? 'de-loser' : '')}">
                    <span>${escapeHtml(p1)}</span>
                    ${scores.p1Score !== null ? `<span class="de-score">${scores.p1Score}</span>` : ''}
                </div>
                <div class="de-card-vs"></div>
                <div class="de-card-player ${winner === 2 ? 'de-winner' : (winner === 1 ? 'de-loser' : '')}">
                    <span>${escapeHtml(p2)}</span>
                    ${scores.p2Score !== null ? `<span class="de-score">${scores.p2Score}</span>` : ''}
                </div>
            `;
            if (score) {
                inner += `<div class="de-card-score-badge">${escapeHtml(score)}</div>`;
            }
        }
        el.innerHTML = inner;
    }

    return el;
}

/**
 * 渲染所有连线
 */
function renderAllConnections(padX, padY) {
    edSvg.innerHTML = '';

    editorConnections.forEach(conn => {
        const fromCard = editorCardMap[conn.from];
        const toCard = editorCardMap[conn.to];
        if (!fromCard || !toCard) return;

        const fromX = padX + fromCard.col * editorGrid.cellWidth + editorGrid.cellWidth - 4;
        const fromY = padY + fromCard.row * editorGrid.cellHeight + editorGrid.cellHeight / 2;
        const toX = padX + toCard.col * editorGrid.cellWidth + 4;
        const toY = padY + toCard.row * editorGrid.cellHeight + editorGrid.cellHeight / 2;

        const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        const midX = (fromX + toX) / 2;
        const d = `M ${fromX} ${fromY} C ${midX} ${fromY}, ${midX} ${toY}, ${toX} ${toY}`;
        path.setAttribute('d', d);
        path.setAttribute('class', 'de-connection');
        path.setAttribute('data-conn', `${conn.from}->${conn.to}`);
        path.style.pointerEvents = 'stroke';
        path.style.cursor = 'pointer';

        // Click to delete connection
        path.addEventListener('click', (e) => {
            e.stopPropagation();
            if (confirm(`删除连线 ${conn.from} → ${conn.to}？`)) {
                editorConnections = editorConnections.filter(c => !(c.from === conn.from && c.to === conn.to));
                editorDirty = true;
                renderAllConnections(padX, padY);
                updateStatusBar();
            }
        });

        edSvg.appendChild(path);

        // Arrow
        const arrow = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
        arrow.setAttribute('points', `${toX},${toY - 5} ${toX + 10},${toY} ${toX},${toY + 5}`);
        arrow.setAttribute('class', 'de-connection-arrow');
        edSvg.appendChild(arrow);
    });
}

/**
 * 绑定编辑器事件
 */
function bindEditorEvents(padX, padY) {
    // --- Zoom controls ---
    document.getElementById('deZoomIn')?.addEventListener('click', editorZoomIn);
    document.getElementById('deZoomOut')?.addEventListener('click', editorZoomOut);
    document.getElementById('deZoomFit')?.addEventListener('click', autoFitCanvas);

    // --- Fullscreen toggle ---
    document.getElementById('deFullscreen')?.addEventListener('click', toggleEditorFullscreen);

    // --- Ctrl+滚轮缩放 ---
    edCanvas.addEventListener('wheel', (e) => {
        if (!e.ctrlKey && !e.metaKey) return;
        e.preventDefault();
        if (e.deltaY > 0) editorZoomOut();
        else editorZoomIn();
    }, { passive: false });

    // Add card button
    document.getElementById('deAddCard').addEventListener('click', () => {
        openCardEditModal(null, padX, padY);
    });

    // Connect mode toggle
    const connectBtn = document.getElementById('deConnectMode');
    connectBtn.addEventListener('click', () => {
        editorConnectionMode = !editorConnectionMode;
        editorConnectionSource = null;
        editorSelectedCard = null;
        editorSelectedCards.clear();
        connectBtn.classList.toggle('de-btn-active', editorConnectionMode);
        document.getElementById('deModeLabel').textContent = editorConnectionMode
            ? '🔗 连线模式 — 点击起始卡片'
            : '🖱 拖拽模式 (Alt+拖拽=框选, Ctrl+滚轮=缩放)';
        document.getElementById('deModeLabel').className = 'de-mode-indicator' + (editorConnectionMode ? ' de-mode-connect' : '');
        refreshCardSelection(padX, padY);
    });

    // Delete selected
    document.getElementById('deDeleteSelected').addEventListener('click', () => {
        deleteSelectedCards(padX, padY);
    });

    // Edit round labels
    document.getElementById('deEditLabels')?.addEventListener('click', () => {
        openRoundLabelsModal();
    });

    // Apply grid settings
    document.getElementById('deApplyGrid').addEventListener('click', () => {
        const newCols = parseInt(document.getElementById('deGridCols').value) || editorGrid.cols;
        const newRows = parseInt(document.getElementById('deGridRows').value) || editorGrid.rows;
        const newCW = parseInt(document.getElementById('deCellW').value) || editorGrid.cellWidth;
        const newCH = parseInt(document.getElementById('deCellH').value) || editorGrid.cellHeight;
        const autoSizeCheck = document.getElementById('deAutoSize');
        const newAutoSize = autoSizeCheck ? autoSizeCheck.checked : false;

        if (newCols < editorGrid.cols) {
            const maxCol = newCols - 1;
            const clipped = editorCards.filter(c => c.col > maxCol);
            if (clipped.length > 0) {
                if (!confirm(`缩小列数将导致 ${clipped.length} 张超出范围的卡片被移除，确定继续？`)) return;
                editorCards = editorCards.filter(c => c.col <= maxCol);
                editorConnections = editorConnections.filter(c => {
                    const fc = editorCardMap[c.from];
                    const tc = editorCardMap[c.to];
                    return fc && fc.col <= maxCol && tc && tc.col <= maxCol;
                });
            }
        }

        editorGrid.cols = newCols;
        editorGrid.rows = newRows;
        editorGrid.cellWidth = newCW;
        editorGrid.cellHeight = newCH;
        editorGrid.autoSize = newAutoSize;
        editorDirty = true;
        buildCardMap();
        rebuildEditor(editorContainerId);
    });

    // --- Canvas click (deselect / connection target) ---
    edCardsLayer.addEventListener('click', (e) => {
        if (e.altKey) return; // skip if Alt was used for box-select
        const cardEl = e.target.closest('.de-card');
        if (!cardEl) {
            if (editorConnectionMode) {
                editorConnectionSource = null;
                document.getElementById('deModeLabel').textContent = '🔗 连线模式 — 点击起始卡片';
            } else {
                editorSelectedCard = null;
                editorSelectedCards.clear();
                refreshCardSelection(padX, padY);
            }
            return;
        }

        const cardId = cardEl.dataset.cardId;

        if (editorConnectionMode) {
            if (!editorConnectionSource) {
                editorConnectionSource = cardId;
                document.getElementById('deModeLabel').textContent = `🔗 连线模式 — 已选起点: ${cardId}，点击目标卡片`;
                cardEl.classList.add('de-card-connect-source');
            } else if (editorConnectionSource !== cardId) {
                const alreadyExists = editorConnections.some(c =>
                    c.from === editorConnectionSource && c.to === cardId
                );
                if (!alreadyExists) {
                    editorConnections.push({
                        from: editorConnectionSource, to: cardId,
                        fromSide: 'right', toSide: 'left'
                    });
                    editorDirty = true;
                }
                editorConnectionSource = null;
                document.getElementById('deModeLabel').textContent = '🔗 连线模式 — 点击起始卡片';
                renderAllConnections(padX, padY);
                updateStatusBar();
                refreshCardSelection(padX, padY);
            }
        } else {
            editorSelectedCard = cardId;
            editorSelectedCards.clear();
            refreshCardSelection(padX, padY);
            if (e.detail === 2) {
                const card = editorCardMap[cardId];
                if (card) openCardEditModal(card, padX, padY);
            }
        }
    });

    // --- Card drag (no Ctrl) ---
    let dragStartX = 0, dragStartY = 0;
    let dragOrigCol = 0, dragOrigRow = 0;
    let isDragging = false;

    edCardsLayer.addEventListener('mousedown', (e) => {
        if (editorConnectionMode) return;
        if (e.button !== 0) return;

        // Alt+拖拽 = 框选
        if (e.altKey) {
            startBoxSelect(e, padX, padY);
            return;
        }

        const cardEl = e.target.closest('.de-card');
        if (!cardEl) return;

        const cardId = cardEl.dataset.cardId;
        editorSelectedCard = cardId;
        editorSelectedCards.clear();
        refreshCardSelection(padX, padY);

        const card = editorCardMap[cardId];
        if (!card) return;

        isDragging = true;
        dragStartX = e.clientX;
        dragStartY = e.clientY;
        dragOrigCol = card.col;
        dragOrigRow = card.row;

        cardEl.classList.add('de-card-dragging');
        cardEl.style.zIndex = '100';
        e.preventDefault();
    });

    window.addEventListener('mousemove', (e) => {
        // Box select
        if (boxSelecting) {
            updateBoxSelect(e);
            return;
        }
        if (!isDragging) return;
        const cardEl = edCardsLayer.querySelector('.de-card-dragging');
        if (!cardEl) return;

        const dx = e.clientX - dragStartX;
        const dy = e.clientY - dragStartY;
        const cardId = cardEl.dataset.cardId;
        const card = editorCardMap[cardId];
        if (!card) return;

        const origX = padX + dragOrigCol * editorGrid.cellWidth + 4;
        const origY = padY + dragOrigRow * editorGrid.cellHeight + 4;
        cardEl.style.left = (origX + dx) + 'px';
        cardEl.style.top = (origY + dy) + 'px';
    });

    window.addEventListener('mouseup', (e) => {
        // Box select end
        if (boxSelecting) {
            endBoxSelect(e);
            return;
        }
        if (!isDragging) return;
        isDragging = false;

        const cardEl = edCardsLayer.querySelector('.de-card-dragging');
        if (!cardEl) return;
        cardEl.classList.remove('de-card-dragging');
        cardEl.style.zIndex = '';

        const cardId = cardEl.dataset.cardId;
        const card = editorCardMap[cardId];
        if (!card) return;

        const dx = e.clientX - dragStartX;
        const dy = e.clientY - dragStartY;
        const origCenterX = padX + dragOrigCol * editorGrid.cellWidth + editorGrid.cellWidth / 2;
        const origCenterY = padY + dragOrigRow * editorGrid.cellHeight + editorGrid.cellHeight / 2;
        const newCenterX = origCenterX + dx;
        const newCenterY = origCenterY + dy;
        const newCol = Math.round((newCenterX - padX - editorGrid.cellWidth / 2) / editorGrid.cellWidth);
        const newRow = Math.round((newCenterY - padY - editorGrid.cellHeight / 2) / editorGrid.cellHeight);
        const clampedCol = Math.max(0, Math.min(editorGrid.cols - 1, newCol));
        const clampedRow = Math.max(0, Math.min(editorGrid.rows - 1, newRow));

        if (clampedCol !== card.col || clampedRow !== card.row) {
            card.col = clampedCol;
            card.row = clampedRow;
            editorDirty = true;
        }
        renderAllCards(padX, padY);
        renderAllConnections(padX, padY);
        updateStatusBar();
        editorSelectedCard = cardId;
        refreshCardSelection(padX, padY);
    });

    // --- Keyboard shortcuts ---
    document.addEventListener('keydown', (e) => {
        if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT') return;

        // Delete — works for single or multi-select
        if (e.key === 'Delete' || e.key === 'Backspace') {
            e.preventDefault();
            deleteSelectedCards(padX, padY);
            return;
        }

        // Arrow keys for single selected card
        if (!editorSelectedCard) return;
        // Don't move if multiple are selected
        if (editorSelectedCards.size > 1) return;

        const card = editorCardMap[editorSelectedCard];
        if (!card) return;

        let moved = false;
        switch (e.key) {
            case 'ArrowUp': card.row = Math.max(0, card.row - 1); moved = true; break;
            case 'ArrowDown': card.row = Math.min(editorGrid.rows - 1, card.row + 1); moved = true; break;
            case 'ArrowLeft': card.col = Math.max(0, card.col - 1); moved = true; break;
            case 'ArrowRight': card.col = Math.min(editorGrid.cols - 1, card.col + 1); moved = true; break;
            case 'Enter':
                openCardEditModal(card, padX, padY);
                break;
        }
        if (moved) {
            editorDirty = true;
            renderAllCards(padX, padY);
            renderAllConnections(padX, padY);
            updateStatusBar();
        }
    });
}

// ========================================
// 多选 & 框选 & 删除
// ========================================

function deleteSelectedCards(padX, padY) {
    const idsToDelete = new Set();
    if (editorSelectedCard) idsToDelete.add(editorSelectedCard);
    editorSelectedCards.forEach(id => idsToDelete.add(id));

    if (idsToDelete.size === 0) return;
    const label = idsToDelete.size === 1
        ? `卡片 "${[...idsToDelete][0]}"`
        : `${idsToDelete.size} 张卡片`;
    if (!confirm(`确定要删除 ${label} 及其相关连线吗？`)) return;

    idsToDelete.forEach(id => {
        editorCards = editorCards.filter(c => c.id !== id);
        editorConnections = editorConnections.filter(c => c.from !== id && c.to !== id);
    });
    editorSelectedCard = null;
    editorSelectedCards.clear();
    editorDirty = true;
    renderAllCards(padX, padY);
    renderAllConnections(padX, padY);
    updateStatusBar();
    refreshCardSelection(padX, padY);
}

// --- 框选 ---
let boxSelecting = false;
let boxStartX = 0, boxStartY = 0;
let boxEl = null;

function getBoxSelectDiv() {
    if (!boxEl) {
        boxEl = document.createElement('div');
        boxEl.className = 'de-box-select';
        boxEl.style.cssText = 'position:fixed;border:2px dashed #007bff;background:rgba(0,123,255,0.08);pointer-events:none;z-index:9999;display:none;';
        document.body.appendChild(boxEl);
    }
    return boxEl;
}

function startBoxSelect(e, padX, padY) {
    if (editorConnectionMode) return;
    boxSelecting = true;
    boxStartX = e.clientX;
    boxStartY = e.clientY;
    const box = getBoxSelectDiv();
    box.style.display = 'block';
    box.style.left = boxStartX + 'px';
    box.style.top = boxStartY + 'px';
    box.style.width = '0px';
    box.style.height = '0px';
    e.preventDefault();
}

function updateBoxSelect(e) {
    const box = getBoxSelectDiv();
    const x1 = Math.min(boxStartX, e.clientX);
    const y1 = Math.min(boxStartY, e.clientY);
    const x2 = Math.max(boxStartX, e.clientX);
    const y2 = Math.max(boxStartY, e.clientY);
    box.style.left = x1 + 'px';
    box.style.top = y1 + 'px';
    box.style.width = (x2 - x1) + 'px';
    box.style.height = (y2 - y1) + 'px';
}

function endBoxSelect(e) {
    boxSelecting = false;
    const box = getBoxSelectDiv();
    box.style.display = 'none';

    const x1 = Math.min(boxStartX, e.clientX);
    const y1 = Math.min(boxStartY, e.clientY);
    const x2 = Math.max(boxStartX, e.clientX);
    const y2 = Math.max(boxStartY, e.clientY);

    // Too small = ignore
    if (x2 - x1 < 8 && y2 - y1 < 8) {
        editorSelectedCard = null;
        editorSelectedCards.clear();
        refreshCardSelection(edPadX, edPadY);
        return;
    }

    // Find cards intersecting the selection rect
    editorSelectedCard = null;
    editorSelectedCards.clear();
    const allCardEls = edCardsLayer.querySelectorAll('.de-card');
    allCardEls.forEach(el => {
        const rect = el.getBoundingClientRect();
        if (rect.right > x1 && rect.left < x2 && rect.bottom > y1 && rect.top < y2) {
            const cid = el.dataset.cardId;
            if (cid) {
                if (!editorSelectedCard) editorSelectedCard = cid;
                editorSelectedCards.add(cid);
            }
        }
    });
    refreshCardSelection(edPadX, edPadY);
}

// ========================================
// 全屏切换
// ========================================

function toggleEditorFullscreen() {
    const container = document.getElementById(editorContainerId);
    if (!container) return;
    editorIsFullscreen = !editorIsFullscreen;

    if (editorIsFullscreen) {
        container._fsOrig = {
            position: container.style.position || '',
            top: container.style.top || '',
            left: container.style.left || '',
            width: container.style.width || '',
            height: container.style.height || '',
            zIndex: container.style.zIndex || '',
            background: container.style.background || '',
            borderRadius: container.style.borderRadius || '',
            padding: container.style.padding || ''
        };
        container.style.position = 'fixed';
        container.style.top = '0';
        container.style.left = '0';
        container.style.width = '100vw';
        container.style.height = '100vh';
        container.style.zIndex = '9998';
        container.style.background = 'var(--admin-bg)';
        container.style.borderRadius = '0';
        container.style.padding = '12px';
        document.body.style.overflow = 'hidden';
        document.getElementById('deFullscreen').innerHTML = '<i class="fa-solid fa-minimize"></i>';
    } else {
        const orig = container._fsOrig || {};
        Object.keys(orig).forEach(k => { container.style[k] = orig[k]; });
        document.body.style.overflow = '';
        document.getElementById('deFullscreen').innerHTML = '<i class="fa-solid fa-maximize"></i>';
    }

    // 全屏切换后强制重新适配
    editorUserZoomed = false;
    setTimeout(() => autoFitCanvas(), 300);
}

function refreshCardSelection(padX, padY) {
    const allCards = edCardsLayer.querySelectorAll('.de-card');
    allCards.forEach(el => {
        el.classList.remove('de-card-selected', 'de-card-connect-source', 'de-card-multi-selected');
        const cid = el.dataset.cardId;
        if (cid === editorSelectedCard) {
            el.classList.add('de-card-selected');
        }
        if (editorSelectedCards.has(cid) && cid !== editorSelectedCard) {
            el.classList.add('de-card-multi-selected');
        }
        if (cid === editorConnectionSource) {
            el.classList.add('de-card-connect-source');
        }
    });

    const hasSelection = !!editorSelectedCard || editorSelectedCards.size > 0;
    document.getElementById('deDeleteSelected').disabled = !hasSelection;
}

function updateStatusBar() {
    if (!edStatusBar) return;
    edStatusBar.innerHTML = `
        <span>卡片: <strong>${editorCards.length}</strong></span>
        <span>连线: <strong>${editorConnections.length}</strong></span>
        <span>网格: ${editorGrid.cols}×${editorGrid.rows} (${editorGrid.cellWidth}×${editorGrid.cellHeight}px)</span>
        <span class="de-dirty-indicator" style="display:${editorDirty ? 'inline' : 'none'};">● 未保存</span>
    `;
}

/**
 * 卡片编辑弹窗
 */
function openCardEditModal(card, padX, padY) {
    const isNew = !card;
    const editCard = card || {
        id: 'm' + editorNextCardId,
        col: Math.floor(editorGrid.cols / 2),
        row: Math.floor(editorGrid.rows / 2),
        player1: '',
        player2: '',
        score: '',
        winner: 0,
        isChampion: false
    };

    const overlay = document.createElement('div');
    overlay.className = 'de-modal-overlay';
    overlay.innerHTML = `
        <div class="de-modal glass-card">
            <h3 class="de-modal-title">
                <i class="fa-solid ${isNew ? 'fa-plus' : 'fa-pen-to-square'}"></i>
                ${isNew ? '添加比赛卡片' : '编辑卡片: ' + escapeHtml(editCard.id)}
            </h3>
            <div class="de-modal-body">
                <div class="de-form-row">
                    <label class="de-form-label">卡片ID</label>
                    <input type="text" class="de-form-input" id="deEditId" value="${escapeHtml(editCard.id)}" ${!isNew ? 'readonly' : ''}>
                </div>
                <div class="de-form-row de-form-row-2col">
                    <div>
                        <label class="de-form-label">网格列</label>
                        <input type="number" class="de-form-input" id="deEditCol" value="${editCard.col}" min="0" max="${editorGrid.cols - 1}">
                    </div>
                    <div>
                        <label class="de-form-label">网格行</label>
                        <input type="number" class="de-form-input" id="deEditRow" value="${editCard.row}" min="0" max="${editorGrid.rows - 1}">
                    </div>
                </div>
                <div class="de-form-row">
                    <label class="de-form-label">选手1</label>
                    <input type="text" class="de-form-input" id="deEditP1" value="${escapeHtml(editCard.player1 || '')}" placeholder="选手姓名或「轮空」">
                </div>
                <div class="de-form-row">
                    <label class="de-form-label">选手2</label>
                    <input type="text" class="de-form-input" id="deEditP2" value="${escapeHtml(editCard.player2 || '')}" placeholder="留空表示轮空/冠军展示">
                </div>
                <div class="de-form-row">
                    <label class="de-form-label">比分</label>
                    <input type="text" class="de-form-input" id="deEditScore" value="${escapeHtml(editCard.score || '')}" placeholder="如 3-2">
                </div>
                <div class="de-form-row de-form-row-2col">
                    <div>
                        <label class="de-form-label">胜者</label>
                        <select class="de-form-input" id="deEditWinner">
                            <option value="0" ${editCard.winner === 0 ? 'selected' : ''}>未定</option>
                            <option value="1" ${editCard.winner === 1 ? 'selected' : ''}>选手1</option>
                            <option value="2" ${editCard.winner === 2 ? 'selected' : ''}>选手2</option>
                        </select>
                    </div>
                    <div class="de-form-check">
                        <label class="de-form-label">&nbsp;</label>
                        <label class="de-check-label">
                            <input type="checkbox" id="deEditChampion" ${editCard.isChampion ? 'checked' : ''}>
                            <span>冠军展示卡片</span>
                        </label>
                    </div>
                </div>
            </div>
            <div class="de-modal-footer">
                <button class="de-btn" id="deEditCancel">取消</button>
                <button class="de-btn de-btn-primary" id="deEditSave">
                    <i class="fa-solid fa-check"></i> ${isNew ? '添加' : '保存'}
                </button>
            </div>
        </div>
    `;
    document.body.appendChild(overlay);

    const closeModal = () => {
        document.body.removeChild(overlay);
    };

    overlay.addEventListener('click', (e) => {
        if (e.target === overlay) closeModal();
    });

    document.getElementById('deEditCancel').addEventListener('click', closeModal);

    document.getElementById('deEditSave').addEventListener('click', () => {
        const id = document.getElementById('deEditId').value.trim();
        const col = parseInt(document.getElementById('deEditCol').value) || 0;
        const row = parseInt(document.getElementById('deEditRow').value) || 0;
        const p1 = document.getElementById('deEditP1').value.trim();
        const p2 = document.getElementById('deEditP2').value.trim();
        const score = document.getElementById('deEditScore').value.trim();
        const winner = parseInt(document.getElementById('deEditWinner').value);
        const isChampion = document.getElementById('deEditChampion').checked;

        if (!id) { alert('请输入卡片ID'); return; }
        if (!p1) { alert('请输入选手1姓名'); return; }

        const newCard = {
            id: id,
            col: Math.max(0, Math.min(editorGrid.cols - 1, col)),
            row: Math.max(0, Math.min(editorGrid.rows - 1, row)),
            player1: p1,
            player2: p2,
            score: score,
            winner: winner,
            isChampion: isChampion
        };

        if (isNew) {
            // Check duplicate ID
            if (editorCardMap[id]) { alert('卡片ID已存在！'); return; }
            editorCards.push(newCard);
            editorNextCardId = Math.max(editorNextCardId, parseInt(id.replace('m', '')) || 0) + 1;
        } else {
            // Update existing - handle ID change
            const idx = editorCards.findIndex(c => c.id === editCard.id);
            if (idx >= 0) {
                if (id !== editCard.id) {
                    if (editorCardMap[id]) { alert('新卡片ID已存在！'); return; }
                    // Update connections
                    editorConnections.forEach(c => {
                        if (c.from === editCard.id) c.from = id;
                        if (c.to === editCard.id) c.to = id;
                    });
                }
                editorCards[idx] = newCard;
            }
        }

        editorDirty = true;
        closeModal();
        buildCardMap();
        renderAllCards(padX, padY);
        renderAllConnections(padX, padY);
        updateStatusBar();
        editorSelectedCard = id;
        refreshCardSelection(padX, padY);
    });
}

/**
 * 表头标签编辑弹窗
 */
function openRoundLabelsModal() {
    // 收集当前使用的列
    const usedCols = new Set();
    editorCards.forEach(c => usedCols.add(c.col));
    const sortedCols = Array.from(usedCols).sort((a, b) => a - b);

    const defaultLabels = ['第一轮', '第二轮', '1/4决赛', '半决赛', '决赛', '冠军'];

    const overlay = document.createElement('div');
    overlay.className = 'de-modal-overlay';
    
    let rowsHtml = sortedCols.map((col, i) => {
        const currentVal = editorRoundLabels[String(col)] || '';
        const placeholder = defaultLabels[i] || `第${i + 1}轮`;
        return `
            <div class="de-form-row">
                <label class="de-form-label">第 ${col} 列表头</label>
                <input type="text" class="de-form-input de-round-label-input" 
                       data-col="${col}" 
                       value="${escapeHtml(currentVal)}" 
                       placeholder="${escapeHtml(placeholder)}">
            </div>
        `;
    }).join('');

    if (sortedCols.length === 0) {
        rowsHtml = '<p style="text-align:center;color:var(--text-muted);padding:20px;">暂无卡片，请先添加卡片后再设置表头</p>';
    }

    overlay.innerHTML = `
        <div class="de-modal glass-card" style="max-width:480px;">
            <h3 class="de-modal-title">
                <i class="fa-solid fa-tags"></i> 自定义表头
            </h3>
            <div class="de-modal-body">
                <p style="font-size:0.8rem;color:var(--text-secondary);margin-bottom:12px;">
                    为每列设置自定义表头名称。留空则使用默认名称。
                </p>
                ${rowsHtml}
            </div>
            <div class="de-modal-footer">
                <button class="de-btn" id="deLabelsReset">
                    <i class="fa-solid fa-undo"></i> 重置全部
                </button>
                <button class="de-btn" id="deLabelsCancel">取消</button>
                <button class="de-btn de-btn-primary" id="deLabelsSave">
                    <i class="fa-solid fa-check"></i> 保存
                </button>
            </div>
        </div>
    `;
    document.body.appendChild(overlay);

    const closeModal = () => {
        document.body.removeChild(overlay);
    };

    overlay.addEventListener('click', (e) => {
        if (e.target === overlay) closeModal();
    });

    document.getElementById('deLabelsCancel').addEventListener('click', closeModal);

    document.getElementById('deLabelsReset').addEventListener('click', () => {
        editorRoundLabels = {};
        editorDirty = true;
        updateStatusBar();
        closeModal();
    });

    document.getElementById('deLabelsSave').addEventListener('click', () => {
        const inputs = overlay.querySelectorAll('.de-round-label-input');
        const newLabels = {};
        inputs.forEach(input => {
            const col = input.dataset.col;
            const val = input.value.trim();
            if (val) {
                newLabels[col] = val;
            }
        });
        editorRoundLabels = newLabels;
        editorDirty = true;
        updateStatusBar();
        closeModal();
    });
}

/**
 * 绑定画布底部拖拽调整大小
 */
function bindResizeHandle(canvasWrapper, handle) {
    let resizing = false;
    let startY = 0;
    let startH = 0;
    const MIN_H = 300;
    const MAX_H = 8000; // 几乎无上限

    handle.addEventListener('mousedown', (e) => {
        e.preventDefault();
        resizing = true;
        startY = e.clientY;
        startH = canvasWrapper.offsetHeight;
        handle.classList.add('de-resize-active');
        document.body.style.cursor = 'ns-resize';
        document.body.style.userSelect = 'none';
    });

    window.addEventListener('mousemove', (e) => {
        if (!resizing) return;
        const dy = e.clientY - startY;
        const newH = Math.max(MIN_H, Math.min(MAX_H, startH + dy));
        canvasWrapper.style.height = newH + 'px';
        canvasWrapper.style.minHeight = newH + 'px';
        // Update auto-fit when done (only if user hasn't manually zoomed)
        if (typeof autoFitCanvas === 'function' && !editorUserZoomed) {
            clearTimeout(canvasWrapper._resizeTimer);
            canvasWrapper._resizeTimer = setTimeout(() => autoFitCanvas(), 250);
        }
    });

    window.addEventListener('mouseup', () => {
        if (!resizing) return;
        resizing = false;
        handle.classList.remove('de-resize-active');
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
        // Final auto-fit (only if user hasn't manually zoomed)
        if (typeof autoFitCanvas === 'function' && !editorUserZoomed) {
            setTimeout(() => autoFitCanvas(), 200);
        }
    });

    // Touch support
    handle.addEventListener('touchstart', (e) => {
        e.preventDefault();
        resizing = true;
        startY = e.touches[0].clientY;
        startH = canvasWrapper.offsetHeight;
        handle.classList.add('de-resize-active');
    });

    window.addEventListener('touchmove', (e) => {
        if (!resizing) return;
        const dy = e.touches[0].clientY - startY;
        const newH = Math.max(MIN_H, Math.min(MAX_H, startH + dy));
        canvasWrapper.style.height = newH + 'px';
        canvasWrapper.style.minHeight = newH + 'px';
    });

    window.addEventListener('touchend', () => {
        if (!resizing) return;
        resizing = false;
        handle.classList.remove('de-resize-active');
        if (typeof autoFitCanvas === 'function' && !editorUserZoomed) {
            setTimeout(() => autoFitCanvas(), 200);
        }
    });
}

/**
 * 自动缩放画布以适应视口 — 仅在初始加载/全屏/手动点fit时调用
 */
function autoFitCanvas() {
    const wrapper = edCanvas;
    if (!wrapper) return;
    const layer = document.getElementById('deTransformLayer');
    if (!layer) return;

    // 防抖：等 wrapper 有有效尺寸再算
    const ww = wrapper.clientWidth;
    const wh = wrapper.clientHeight;
    if (ww < 80 || wh < 80) {
        // 尺寸还没就绪，延迟重试一次
        setTimeout(() => autoFitCanvas(), 200);
        return;
    }

    const wrapperW = ww - 20;
    const wrapperH = wh - 20;
    const contentW = parseFloat(layer.style.width) || 1500;
    const contentH = parseFloat(layer.style.height) || 2200;

    const scaleX = wrapperW / contentW;
    const scaleY = wrapperH / contentH;
    // 下锁 0.30（30%），上锁 2.5
    editorCanvasScale = Math.max(0.30, Math.min(scaleX, scaleY, 2.5));
    editorUserZoomed = false;
    applyEditorScale();
    updateZoomLabel();
}

function applyEditorScale() {
    const layer = document.getElementById('deTransformLayer');
    if (!layer) return;
    // 二次保障：缩放值不正常时拒绝应用
    if (editorCanvasScale < 0.15 || editorCanvasScale > 3.0 || isNaN(editorCanvasScale)) {
        editorCanvasScale = 0.5;
    }
    layer.style.transform = `scale(${editorCanvasScale})`;
    layer.style.transformOrigin = '0 0';
}

function updateZoomLabel() {
    const label = document.getElementById('deZoomVal');
    if (label) label.textContent = Math.round(editorCanvasScale * 100) + '%';
}

function editorZoomIn() {
    editorCanvasScale = Math.min(2.5, editorCanvasScale * 1.2);
    editorUserZoomed = true;
    applyEditorScale();
    updateZoomLabel();
}

function editorZoomOut() {
    editorCanvasScale = Math.max(0.30, editorCanvasScale / 1.2);
    editorUserZoomed = true;
    applyEditorScale();
    updateZoomLabel();
}

/**
 * 重建编辑器（网格改变后）
 */
function rebuildEditor(containerId) {
    const container = document.getElementById(containerId);
    if (!container) return;
    renderEditorUI(container);
}

/**
 * 获取编辑器JSON数据
 */
function getEditorDrawsData() {
    if (!editorDrawsData) return null;
    return {
        id: editorDrawsData.id,
        competitionId: editorDrawsData.competitionId,
        title: editorDrawsData.title,
        version: 2,
        grid: { ...editorGrid },
        cards: editorCards.map(c => ({ ...c })),
        connections: editorConnections.map(c => ({ ...c })),
        roundLabels: { ...editorRoundLabels }
    };
}

/**
 * 设置编辑器元数据
 */
function setEditorMeta(title, competitionId) {
    if (editorDrawsData) {
        editorDrawsData.title = title || editorDrawsData.title;
        editorDrawsData.competitionId = competitionId || editorDrawsData.competitionId;
        editorDirty = true;
        updateStatusBar();
    }
}

/**
 * 检查是否有未保存更改
 */
function isEditorDirty() {
    return editorDirty;
}

/**
 * 标记已保存
 */
function markEditorClean() {
    editorDirty = false;
    updateStatusBar();
}

function escapeHtml(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

// Export for admin integration
window.initDrawsEditor = initDrawsEditor;
window.getEditorDrawsData = getEditorDrawsData;
window.setEditorMeta = setEditorMeta;
window.isEditorDirty = isEditorDirty;
window.markEditorClean = markEditorClean;
window.rebuildEditor = rebuildEditor;
