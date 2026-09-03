/* ========================================
   draws-editor.js - 对阵表可视化编辑器
   配合 draws-editor.html 与 js/draws-core.js 使用。
   工作流：加载 data/draws.json → 可视化编辑 → 导出/复制 → 替换仓库内
   data/draws.json 并提交（纯静态站，无后端）。
   ======================================== */

// ===== 状态 =====
let edDraws = [];              // 归一化 v3 对象数组
let edCurrent = -1;            // 当前编辑索引
let edSelected = null;         // 选中卡片 id
let edMode = 'select';         // select | connect
let edConnectFrom = null;      // 连线起点卡 id
let edZoom = 1;
let edUndoStack = [], edRedoStack = [];
let edBaseline = '[]';         // 与导出内容对比判断脏状态
let edPlayers = [];
let edCompetitions = [];
let edPendingUndo = null;      // 文本输入过程中的撤销快照
let edDrag = null;             // 画布拖拽状态
let edPan = null;              // 画布平移状态
let edToastTimer = null;

const $ = id => document.getElementById(id);
const LS_KEY = 'wfls-draws-editor.v1';

// ===== 工具 =====

function edToast(msg, isErr) {
    const el = $('statMsg');
    if (!el) return;
    el.textContent = msg;
    el.style.color = isErr ? 'var(--accent-red)' : 'var(--primary-blue)';
    clearTimeout(edToastTimer);
    edToastTimer = setTimeout(() => { el.textContent = ''; }, 3500);
}

function currentDraw() { return (edCurrent >= 0 && edCurrent < edDraws.length) ? edDraws[edCurrent] : null; }

function selectedCard() {
    const d = currentDraw();
    if (!d || !edSelected) return null;
    return d.cards.find(c => c.id === edSelected) || null;
}

// 文本输入的撤销：首个 input 时快照，change 时入栈
function beginInput() { if (edPendingUndo === null) edPendingUndo = dcSerializeDraws(edDraws); }
function endInput() {
    if (edPendingUndo !== null) {
        edUndoStack.push(edPendingUndo);
        if (edUndoStack.length > 50) edUndoStack.shift();
        edRedoStack = [];
        edPendingUndo = null;
        updateUndoButtons();
        afterChange();
    }
}
function pushUndo() {
    edUndoStack.push(dcSerializeDraws(edDraws));
    if (edUndoStack.length > 50) edUndoStack.shift();
    edRedoStack = [];
    edPendingUndo = null;
    updateUndoButtons();
}
function updateUndoButtons() {
    $('btnUndo').disabled = !edUndoStack.length;
    $('btnRedo').disabled = !edRedoStack.length;
}

// 修改后的统一收口：重绘画布 + 状态 + 脏标记 + 自动保存
function afterChange() {
    renderCanvas();
    updateStatus();
    markDirty();
    scheduleAutosave();
    updateSelectionButtons();
}

// 依据选中态切换「删除选中」按钮可用性
function updateSelectionButtons() {
    $('btnDeleteCard').disabled = !edSelected;
}

function markDirty() {
    const now = dcSerializeDraws(edDraws);
    $('statDirty').style.display = (now !== edBaseline) ? '' : 'none';
}

function scheduleAutosave() {
    clearTimeout(window._edSaveTimer);
    window._edSaveTimer = setTimeout(() => {
        try { localStorage.setItem(LS_KEY, JSON.stringify({ savedAt: new Date().toISOString(), draws: JSON.parse(dcSerializeDraws(edDraws)) })); } catch (e) { /* 隐私模式等 */ }
    }, 400);
}

function setPlayerField(card, slot, patch) {
    const key = slot === 1 ? 'player1' : 'player2';
    const base = card[key] && typeof card[key] === 'object' ? card[key] : {};
    const next = Object.assign({}, base, patch);
    if (!next.name) { card[key] = null; return; }
    if (next.seed === '' || next.seed == null) delete next.seed;
    if (!next.note) delete next.note;
    if (!next.desc) delete next.desc;
    card[key] = next;
}

// ===== 初始化 =====

document.addEventListener('DOMContentLoaded', init);

async function init() {
    initTheme();
    bindTopbar();
    bindToolbar();
    bindInspector();
    bindSettings();
    bindModals();
    bindKeyboard();

    try {
        const [draws, players, comps] = await Promise.all([
            fetch('data/draws.json').then(r => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); }),
            fetch('data/players.json').then(r => r.json()).catch(() => null),
            fetch('data/competitions/index.json').then(r => r.json()).catch(() => []),
        ]);
        edDraws = (Array.isArray(draws) ? draws : []).map(dcNormalizeDraw).filter(Boolean);
        edPlayers = ((players && players.players) || []).map(p => p && p.name).filter(Boolean);
        edCompetitions = (Array.isArray(comps) ? comps : []).map(c => ({ id: c.id, title: c.title }));
    } catch (e) {
        edToast('加载 data/draws.json 失败 —— 请通过本地 HTTP 服务器打开（勿用 file://）', true);
    }

    // 自动恢复上次未导出的编辑内容（静默，导出前可随时用「导入」还原仓库版本）
    try {
        const saved = localStorage.getItem(LS_KEY);
        if (saved) {
            const parsed = JSON.parse(saved);
            if (parsed && Array.isArray(parsed.draws) && parsed.draws.length) {
                const restored = parsed.draws.map(dcNormalizeDraw).filter(Boolean);
                if (restored.length) {
                    edDraws = restored;
                    const when = (parsed.savedAt || '').replace('T', ' ').slice(0, 16);
                    setTimeout(() => edToast('已恢复 ' + (when || '上次') + ' 未导出的编辑内容；如需仓库版本请用「导入」'), 300);
                }
            }
        }
    } catch (e) { /* ignore */ }

    edBaseline = dcSerializeDraws(edDraws);
    if (edCurrent < 0 && edDraws.length) edCurrent = 0;

    refreshCompetitionOptions();
    refreshPlayerList();
    refreshDrawSelect();
    renderAll();
}

function initTheme() {
    let dark = false;
    try {
        dark = localStorage.getItem('wfls-tt-theme') === 'dark';
    } catch (e) { /* ignore */ }
    if (dark) $('themeToggle').innerHTML = '<i class="fa-solid fa-sun"></i>';
    $('themeToggle').addEventListener('click', () => {
        document.documentElement.classList.toggle('dark-mode');
        const isDark = document.documentElement.classList.contains('dark-mode');
        try { localStorage.setItem('wfls-tt-theme', isDark ? 'dark' : 'light'); } catch (e) { /* ignore */ }
        $('themeToggle').innerHTML = isDark ? '<i class="fa-solid fa-sun"></i>' : '<i class="fa-solid fa-moon"></i>';
    });
}

// ===== 顶栏 =====

function bindTopbar() {
    $('drawSelect').addEventListener('change', e => {
        selectDraw(parseInt(e.target.value, 10));
    });
    $('btnNewDraw').addEventListener('click', () => {
        pushUndo();
        const id = dcNewId('d', edDraws.map(d => d.id));
        edDraws.push(dcNormalizeDraw({ id, title: '新对阵表', competitionId: null, cards: [], connections: [] }));
        selectDraw(edDraws.length - 1);
        afterChange();
        edToast('已新建 ' + id + '，可从模板生成或手动添加卡片');
    });
    $('btnDuplicateDraw').addEventListener('click', () => {
        const d = currentDraw();
        if (!d) return edToast('没有可复制的对阵表', true);
        pushUndo();
        const clone = dcNormalizeDraw(JSON.parse(JSON.stringify(dcCleanDraw(d))));
        clone.id = dcNewId('d', edDraws.map(x => x.id));
        clone.title = (d.title || '未命名') + '（副本）';
        edDraws.push(clone);
        selectDraw(edDraws.length - 1);
        afterChange();
        edToast('已复制为 ' + clone.id);
    });
    $('btnDeleteDraw').addEventListener('click', () => {
        const d = currentDraw();
        if (!d) return;
        if (!confirm('确定删除「' + (d.title || d.id) + '」？此操作可撤销。')) return;
        pushUndo();
        edDraws.splice(edCurrent, 1);
        edCurrent = Math.min(edCurrent, edDraws.length - 1);
        edSelected = null;
        refreshDrawSelect();
        renderAll();
        afterChange();
    });
    $('btnUndo').addEventListener('click', doUndo);
    $('btnRedo').addEventListener('click', doRedo);
    $('btnValidate').addEventListener('click', showValidate);
    $('btnDownload').addEventListener('click', downloadDraws);
    $('btnCopyAll').addEventListener('click', copyAll);
    $('btnImport').addEventListener('click', () => { $('importText').value = ''; $('importModal').style.display = 'flex'; });
}

function doUndo() {
    if (!edUndoStack.length) return;
    edRedoStack.push(dcSerializeDraws(edDraws));
    const snap = edUndoStack.pop();
    applySnapshot(snap);
    edToast('已撤销');
}

function doRedo() {
    if (!edRedoStack.length) return;
    edUndoStack.push(dcSerializeDraws(edDraws));
    const snap = edRedoStack.pop();
    applySnapshot(snap);
    edToast('已重做');
}

function applySnapshot(json) {
    edDraws = JSON.parse(json).map(dcNormalizeDraw).filter(Boolean);
    if (edCurrent >= edDraws.length) edCurrent = edDraws.length - 1;
    const d = currentDraw();
    if (edSelected && (!d || !d.cards.some(c => c.id === edSelected))) edSelected = null;
    edConnectFrom = null;
    refreshDrawSelect();
    renderAll();
    markDirty();
    scheduleAutosave();
}

function selectDraw(idx) {
    edCurrent = idx;
    edSelected = null;
    edConnectFrom = null;
    refreshDrawSelect();
    renderAll();
}

function refreshDrawSelect() {
    const sel = $('drawSelect');
    sel.innerHTML = edDraws.map((d, i) =>
        '<option value="' + i + '"' + (i === edCurrent ? ' selected' : '') + '>' + dcEsc((d.id || '?') + ' · ' + (d.title || '未命名')) + '</option>'
    ).join('');
    if (!edDraws.length) sel.innerHTML = '<option>（无对阵表）</option>';
}

function refreshCompetitionOptions() {
    const html = '<option value="">（不关联）</option>' + edCompetitions.map(c =>
        '<option value="' + dcEsc(c.id) + '">' + dcEsc(c.id + ' · ' + (c.title || '')) + '</option>').join('');
    $('fCompetition').innerHTML = html;
    $('tplCompetition').innerHTML = html;
}

function refreshPlayerList() {
    $('playerList').innerHTML = edPlayers.map(n => '<option value="' + dcEsc(n) + '"></option>').join('');
}

// ===== 画布渲染 =====

function svgEl(tag, attrs) {
    const el = document.createElementNS('http://www.w3.org/2000/svg', tag);
    for (const k in attrs) el.setAttribute(k, attrs[k]);
    return el;
}

function renderCanvas() {
    const draw = currentDraw();
    const layer = $('canvasLayer');
    layer.innerHTML = '';
    if (!draw) {
        layer.innerHTML = '<div style="padding:90px 30px;text-align:center;color:var(--text-muted);font-size:0.85rem;">没有对阵表。点击顶栏 <i class="fa-solid fa-plus"></i> 新建，或用 <i class="fa-solid fa-wand-magic-sparkles"></i> 从模板生成。</div>';
        $('zoomVal').textContent = '—';
        return;
    }
    const layout = dcComputeLayout(draw);

    // 外层按 zoom 扩展占位，内层 transform 缩放
    layer.style.width = Math.max(layout.canvasW * edZoom, 100) + 'px';
    layer.style.height = Math.max(layout.canvasH * edZoom, 100) + 'px';

    const inner = document.createElement('div');
    inner.className = 'de-inner';
    inner.style.width = layout.canvasW + 'px';
    inner.style.height = layout.canvasH + 'px';
    inner.style.transform = 'scale(' + edZoom + ')';

    // 网格底纹
    const bg = document.createElement('div');
    bg.className = 'de-grid-bg';
    bg.style.cssText = 'position:absolute;top:0;left:0;width:100%;height:100%;' +
        'background-size:' + layout.cellW + 'px ' + layout.cellH + 'px;' +
        'background-position:' + layout.padX + 'px ' + layout.padY + 'px;';
    inner.appendChild(bg);

    // 连线 SVG
    const svg = svgEl('svg', { 'class': 'de-svg', width: layout.canvasW, height: layout.canvasH });
    svg.style.cssText = 'position:absolute;top:0;left:0;overflow:visible;z-index:1;';
    const cardMap = {};
    draw.cards.forEach(c => { cardMap[c.id] = c; });
    (draw.connections || []).forEach((cn, idx) => {
        const fp = layout.positions[cn.from], tp = layout.positions[cn.to];
        if (!fp || !tp || !cardMap[cn.from] || !cardMap[cn.to]) return;
        const a = dcAnchorPoint(fp, layout.cardW, layout.cardH, cn.fromSide || 'right');
        const b = dcAnchorPoint(tp, layout.cardW, layout.cardH, cn.toSide || 'left');
        const path = svgEl('path', {
            d: dcConnectionPath(a, b, cn.fromSide || 'right', cn.toSide || 'left'),
            'class': 'de-connection', 'data-conn-idx': idx
        });
        svg.appendChild(path);
        svg.appendChild(svgEl('polygon', {
            points: dcArrowPoints(b, cn.toSide || 'left'),
            'class': 'de-connection-arrow', 'data-conn-idx': idx
        }));
    });
    inner.appendChild(svg);

    // 卡片
    draw.cards.forEach(card => {
        const pos = layout.positions[card.id];
        if (!pos) return;
        inner.appendChild(buildEdCard(card, pos, layout, draw));
    });

    layer.appendChild(inner);
    $('zoomVal').textContent = Math.round(edZoom * 100) + '%';
}

function buildEdCard(card, pos, layout, draw) {
    const el = document.createElement('div');
    el.className = 'de-card';
    el.dataset.cardId = card.id;
    el.style.left = pos.x + 'px';
    el.style.top = pos.y + 'px';
    el.style.width = layout.cardW + 'px';
    el.style.minHeight = layout.cardH + 'px';
    if (edSelected === card.id) el.classList.add('de-card-selected');
    if (edConnectFrom === card.id) el.classList.add('de-card-connect-source');

    const type = card.type || 'match';
    if (type === 'note') {
        el.classList.add('de-card-note');
        const t = document.createElement('div');
        t.className = 'de-card-note-text';
        t.textContent = card.text || '';
        el.appendChild(t);
        return el;
    }
    if (type === 'champion') {
        el.classList.add('de-card-champion');
        el.innerHTML =
            '<div class="de-card-icon"><i class="fa-solid fa-crown"></i></div>' +
            '<div class="de-card-pname">' + dcEsc(dcPlayerName(card.player1) || '？') + '</div>' +
            '<div class="de-card-clabel">' + dcEsc(card.label || '冠军') + '</div>';
        return el;
    }

    const status = dcMatchStatus(card);
    if (status === 'scheduled') el.classList.add('de-card-scheduled');
    if (status === 'live') el.classList.add('de-card-live');

    const p1 = card.player1, p2 = card.player2;
    const scores = dcParseScore(card.score) || [null, null];
    const w = card.winner;

    function row(p, score, won, lost) {
        let html = '';
        if (p && p.seed != null && p.seed !== '') html += '<span class="dv-player-seed">' + dcEsc(String(p.seed)) + '</span>';
        html += '<span style="flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + dcEsc(p ? p.name : '待定') + '</span>';
        if (p && p.note) html += '<span class="dv-player-note">' + dcEsc(p.note) + '</span>';
        if (score != null) html += '<span class="de-score" style="' + (won ? '' : 'background:rgba(255,77,79,0.1);color:#cf1322;') + '">' + score + '</span>';
        return html;
    }

    if (!p2) {
        const r1 = document.createElement('div');
        r1.className = 'de-card-player' + (w === 1 ? ' de-winner' : '');
        r1.innerHTML = row(p1, scores[0], w === 1, w === 2);
        el.appendChild(r1);
        const bye = document.createElement('div');
        bye.className = 'de-card-bye';
        bye.textContent = '— BYE —';
        el.appendChild(bye);
    } else {
        const r1 = document.createElement('div');
        r1.className = 'de-card-player' + (w === 1 ? ' de-winner' : (w === 2 ? ' de-loser' : ''));
        r1.innerHTML = row(p1, scores[0], w === 1, w === 2);
        const vs = document.createElement('div');
        vs.className = 'de-card-vs';
        const r2 = document.createElement('div');
        r2.className = 'de-card-player' + (w === 2 ? ' de-winner' : (w === 1 ? ' de-loser' : ''));
        r2.innerHTML = row(p2, scores[1], w === 2, w === 1);
        el.appendChild(r1); el.appendChild(vs); el.appendChild(r2);
    }

    if (status === 'live') {
        const b = document.createElement('span');
        b.className = 'dv-status-badge dv-status-live';
        b.innerHTML = '<span class="dv-live-dot"></span>LIVE';
        el.appendChild(b);
    } else if (status === 'scheduled') {
        const b = document.createElement('span');
        b.className = 'dv-status-badge dv-status-scheduled';
        b.innerHTML = '<i class="fa-regular fa-clock"></i>待赛';
        el.appendChild(b);
    } else if (card.score && p2) {
        const b = document.createElement('span');
        b.className = 'de-card-score-badge';
        b.textContent = card.score;
        el.appendChild(b);
    }
    return el;
}

// ===== 画布交互（选择 / 拖拽 / 连线 / 平移 / 缩放）=====

function bindToolbar() {
    // 模式
    $('modeSelect').addEventListener('click', () => setMode('select'));
    $('modeConnect').addEventListener('click', () => setMode('connect'));
    // 添加卡片
    $('btnAddMatch').addEventListener('click', () => addCard('match'));
    $('btnAddBye').addEventListener('click', () => addCard('bye'));
    $('btnAddChampion').addEventListener('click', () => addCard('champion'));
    $('btnAddNote').addEventListener('click', () => addCard('note'));
    $('btnDeleteCard').addEventListener('click', deleteSelectedCard);
    $('btnDupCard').addEventListener('click', duplicateSelectedCard);
    $('btnAutoArrange').addEventListener('click', () => {
        const d = currentDraw();
        if (!d || !d.cards.length) return edToast('画布为空', true);
        pushUndo();
        dcAutoArrange(d);
        renderAll();
        afterChange();
        edToast('已按轮次规整排布');
    });
    $('btnPropagate').addEventListener('click', () => {
        const d = currentDraw();
        if (!d) return;
        pushUndo();
        const r = dcPropagateWinners(d);
        renderAll();
        afterChange();
        edToast(r.assigned ? ('已填充 ' + r.assigned + ' 个空位') : '没有可传播的胜者（需要已完赛卡片与连线）', !r.assigned);
        if (r.conflicts) edToast(r.conflicts + ' 个目标位冲突，请手动检查', true);
    });
    // 缩放
    $('btnZoomIn').addEventListener('click', () => setZoom(edZoom * 1.2));
    $('btnZoomOut').addEventListener('click', () => setZoom(edZoom / 1.2));
    $('btnZoomFit').addEventListener('click', zoomFit);

    bindCanvas();
}

function setMode(mode) {
    edMode = mode;
    edConnectFrom = null;
    $('modeSelect').classList.toggle('de-btn-active', mode === 'select');
    $('modeConnect').classList.toggle('de-btn-active', mode === 'connect');
    $('modeIndicator').textContent = mode === 'select' ? '选择模式' : '连线模式：点起点 → 点终点';
    $('modeIndicator').classList.toggle('de-mode-connect', mode === 'connect');
    renderCanvas();
}

function setZoom(z) {
    edZoom = Math.max(0.25, Math.min(2, z));
    renderCanvas();
}

function zoomFit() {
    const draw = currentDraw();
    if (!draw) return;
    const layout = dcComputeLayout(draw);
    const wrap = $('canvasWrapper');
    const z = Math.min((wrap.clientWidth - 30) / Math.max(layout.canvasW, 1), (wrap.clientHeight - 30) / Math.max(layout.canvasH, 1), 1.5);
    setZoom(Math.max(0.25, z));
}

function bindCanvas() {
    const wrapper = $('canvasWrapper');

    // 卡片拖拽 / 点击（事件委托）
    wrapper.addEventListener('mousedown', e => {
        const cardEl = e.target.closest('.de-card');
        if (cardEl && (edMode === 'select' || edMode === 'connect')) {
            const draw = currentDraw();
            const card = draw && draw.cards.find(c => c.id === cardEl.dataset.cardId);
            if (!card) return;
            const layout = dcComputeLayout(draw);
            const pos = layout.positions[card.id];
            edDrag = {
                id: card.id, el: cardEl, startPos: pos, layout,
                sx: e.clientX, sy: e.clientY, moved: false,
                snapshot: dcSerializeDraws(edDraws),
                canDrag: edMode === 'select' && draw.layout !== 'auto'
            };
            e.preventDefault();
            return;
        }
        // 空白区平移
        if (!cardEl) {
            edPan = { sx: e.clientX, sy: e.clientY, sl: wrapper.scrollLeft, st: wrapper.scrollTop };
        }
    });

    window.addEventListener('mousemove', e => {
        if (edDrag) {
            const dx = (e.clientX - edDrag.sx) / edZoom;
            const dy = (e.clientY - edDrag.sy) / edZoom;
            if (Math.abs(dx) + Math.abs(dy) > 4) edDrag.moved = true;
            if (edDrag.moved && edDrag.canDrag) {
                edDrag.el.style.left = (edDrag.startPos.x + dx) + 'px';
                edDrag.el.style.top = (edDrag.startPos.y + dy) + 'px';
                edDrag.el.classList.add('de-card-dragging');
            }
        } else if (edPan) {
            wrapper.scrollLeft = edPan.sl - (e.clientX - edPan.sx);
            wrapper.scrollTop = edPan.st - (e.clientY - edPan.sy);
        }
    });

    window.addEventListener('mouseup', e => {
        if (edDrag) {
            const { id, moved, canDrag, layout, startPos } = edDrag;
            if (moved && canDrag) {
                const card = currentDraw().cards.find(c => c.id === id);
                if (card) {
                    const dx = (e.clientX - edDrag.sx) / edZoom;
                    const dy = (e.clientY - edDrag.sy) / edZoom;
                    const nx = startPos.x + dx, ny = startPos.y + dy;
                    const col = Math.max(0, Math.round((nx - layout.padX - layout.gap / 2) / layout.cellW));
                    const row = Math.max(0, Math.round((ny - layout.padY - layout.gap / 2) / layout.cellH));
                    if (col !== card.col || row !== card.row) {
                        edUndoStack.push(edDrag.snapshot);
                        if (edUndoStack.length > 50) edUndoStack.shift();
                        edRedoStack = [];
                        updateUndoButtons();
                        card.col = col;
                        card.row = row;
                        if (card.round == null) card.round = col;
                        afterChange();
                    } else {
                        renderCanvas();
                    }
                } else {
                    renderCanvas();
                }
            } else {
                // 视为点击
                onCardClick(id, e);
                if (moved && !canDrag && edMode === 'select') edToast('自动布局模式下不可拖拽，可切换为手动网格', true);
                renderCanvas();
            }
            edDrag = null;
        }
        edPan = null;
    });

    // 点击连线删除
    $('canvasLayer').addEventListener('click', e => {
        const connEl = e.target.closest('[data-conn-idx]');
        if (!connEl) return;
        const draw = currentDraw();
        if (!draw) return;
        const idx = parseInt(connEl.dataset.connIdx, 10);
        const cn = (draw.connections || [])[idx];
        if (!cn) return;
        if (!confirm('删除连线 ' + cn.from + ' → ' + cn.to + ' ？')) return;
        pushUndo();
        draw.connections.splice(idx, 1);
        afterChange();
        renderInspector();
    });
}

function onCardClick(id) {
    const draw = currentDraw();
    if (!draw) return;
    if (edMode === 'connect') {
        if (!edConnectFrom) {
            edConnectFrom = id;
            edToast('已选起点 ' + id + '，点击目标卡片完成连线（再次点击起点取消）');
            renderCanvas();
            return;
        }
        if (edConnectFrom === id) {
            edConnectFrom = null;
            renderCanvas();
            return;
        }
        pushUndo();
        draw.connections = draw.connections || [];
        const exists = draw.connections.some(cn => cn.from === edConnectFrom && cn.to === id);
        if (exists) {
            edToast('连线已存在', true);
        } else {
            draw.connections.push({ from: edConnectFrom, to: id, fromSide: 'right', toSide: 'left' });
            edToast('已连线 ' + edConnectFrom + ' → ' + id);
        }
        edConnectFrom = null;
        edSelected = id;
        renderAll();
        afterChange();
        return;
    }
    edSelected = id;
    renderCanvas();
    renderInspector();
    updateSelectionButtons();
}

function addCard(type) {
    const draw = currentDraw();
    if (!draw) return edToast('请先新建或选择一张对阵表', true);
    pushUndo();
    const id = dcNewId('m', draw.cards.map(c => c.id));
    const card = { id, type: type === 'match' ? 'match' : type, col: 0, row: 0 };
    let maxCol = -1;
    draw.cards.forEach(c => { if ((c.col || 0) > maxCol) maxCol = c.col || 0; });
    card.col = Math.max(0, maxCol);
    const rowsInCol = draw.cards.filter(c => (c.col || 0) === card.col).map(c => c.row || 0);
    card.row = rowsInCol.length ? Math.max.apply(null, rowsInCol) + 2 : 0;
    if (type === 'champion') card.label = '冠军';
    if (type === 'note') card.text = '备注';
    draw.cards.push(card);
    edSelected = id;
    renderAll();
    afterChange();
}

function deleteSelectedCard() {
    const draw = currentDraw();
    const card = selectedCard();
    if (!draw || !card) return;
    if (!confirm('删除卡片 ' + card.id + ' 及其连线？')) return;
    pushUndo();
    draw.cards = draw.cards.filter(c => c.id !== card.id);
    draw.connections = (draw.connections || []).filter(cn => cn.from !== card.id && cn.to !== card.id);
    edSelected = null;
    renderAll();
    afterChange();
}

function duplicateSelectedCard() {
    const draw = currentDraw();
    const card = selectedCard();
    if (!draw || !card) return;
    pushUndo();
    const clone = dcCleanCard(card);
    clone.id = dcNewId('m', draw.cards.map(c => c.id));
    clone.row = (card.row || 0) + 1;
    draw.cards.push(dcNormalizeCard(clone, false));
    edSelected = clone.id;
    renderAll();
    afterChange();
}

// ===== 检查器 =====

function bindInspector() {
    const on = (id, ev, fn) => $(id).addEventListener(ev, fn);

    // 文本类：input 实时更新 + change 入撤销栈
    const bindText = (id, apply) => {
        on(id, 'input', e => { beginInput(); const c = selectedCard(); if (c) { apply(c, e.target.value); renderCanvas(); updateStatus(); markDirty(); scheduleAutosave(); } });
        on(id, 'change', endInput);
    };

    bindText('fP1', (c, v) => setPlayerField(c, 1, { name: v.trim() }));
    bindText('fP2', (c, v) => setPlayerField(c, 2, { name: v.trim() }));
    bindText('fP1Seed', (c, v) => setPlayerField(c, 1, { seed: v }));
    bindText('fP2Seed', (c, v) => setPlayerField(c, 2, { seed: v }));
    bindText('fP1Note', (c, v) => setPlayerField(c, 1, { note: v.trim() }));
    bindText('fP2Note', (c, v) => setPlayerField(c, 2, { note: v.trim() }));
    bindText('fScore', (c, v) => { c.score = v.trim(); });
    bindText('fGames', (c, v) => {
        const games = v.split('\n').map(s => s.trim()).filter(Boolean);
        if (games.length) c.games = games; else delete c.games;
    });
    bindText('fTime', (c, v) => { if (v.trim()) c.time = v.trim(); else delete c.time; });
    bindText('fVenue', (c, v) => { if (v.trim()) c.venue = v.trim(); else delete c.venue; });
    bindText('fCardNote', (c, v) => { if (v.trim()) c.note = v.trim(); else delete c.note; });
    bindText('fChampPlayer', (c, v) => setPlayerField(c, 1, { name: v.trim() }));
    bindText('fChampLabel', (c, v) => { c.label = v.trim(); });
    bindText('fNoteText', (c, v) => { c.text = v; });
    bindText('fCol', (c, v) => { const n = parseInt(v, 10); if (n >= 0) { c.col = n; c.round = n; } });
    bindText('fRow', (c, v) => { const n = parseInt(v, 10); if (n >= 0) c.row = n; });

    // 离散控件：pushUndo 后应用
    on('fStatus', 'change', e => {
        const c = selectedCard(); if (!c) return;
        pushUndo();
        if (e.target.value) c.status = e.target.value; else delete c.status;
        renderCanvas(); updateStatus(); markDirty(); scheduleAutosave();
    });

    // 类型切换
    $('typeSwitch').addEventListener('click', e => {
        const btn = e.target.closest('button[data-type]');
        const c = selectedCard();
        if (!btn || !c) return;
        pushUndo();
        const t = btn.dataset.type;
        if (t === 'champion' && !c.label) c.label = '冠军';
        if (t === 'note' && !c.text) c.text = '备注';
        if (t !== 'champion') delete c.isChampion;
        c.type = t;
        renderAll();
        afterChange();
    });

    // 胜者切换
    $('winnerSwitch').addEventListener('click', e => {
        const btn = e.target.closest('button[data-w]');
        const c = selectedCard();
        if (!btn || !c) return;
        pushUndo();
        const w = parseInt(btn.dataset.w, 10);
        if (w === 0) c.winner = 0; else c.winner = w;
        renderCanvas(); renderInspector(); updateStatus(); markDirty(); scheduleAutosave();
    });
}

function renderInspector() {
    const card = selectedCard();
    $('inspectorEmpty').style.display = card ? 'none' : '';
    $('inspectorBody').style.display = card ? '' : 'none';
    if (!card) return;
    $('insCardId').textContent = card.id;
    const type = card.type || 'match';

    // 类型按钮
    $('typeSwitch').querySelectorAll('button').forEach(b => b.classList.toggle('active', b.dataset.type === type));

    // 分组显隐
    const isMatch = type === 'match' || type === 'bye';
    $('fieldsMatch').style.display = isMatch ? '' : 'none';
    $('fieldsChampion').style.display = type === 'champion' ? '' : 'none';
    $('fieldsNote').style.display = type === 'note' ? '' : 'none';
    $('fieldsMeta').style.display = (type === 'match' || type === 'bye') ? '' : 'none';
    const p2Field = $('fP2').closest('.ed-field');
    const p2Row = $('fP2Seed').closest('.ed-field-row');
    if (p2Field) p2Field.style.display = type === 'bye' ? 'none' : '';
    if (p2Row) p2Row.style.display = type === 'bye' ? 'none' : '';

    // 字段值
    $('fP1').value = card.player1 ? card.player1.name : '';
    $('fP2').value = card.player2 ? card.player2.name : '';
    $('fP1Seed').value = card.player1 && card.player1.seed != null ? card.player1.seed : '';
    $('fP2Seed').value = card.player2 && card.player2.seed != null ? card.player2.seed : '';
    $('fP1Note').value = card.player1 && card.player1.note ? card.player1.note : '';
    $('fP2Note').value = card.player2 && card.player2.note ? card.player2.note : '';
    $('fScore').value = card.score || '';
    $('fGames').value = (card.games || []).join('\n');
    $('fStatus').value = card.status || '';
    $('fTime').value = card.time || '';
    $('fVenue').value = card.venue || '';
    $('fCardNote').value = card.note || '';
    $('fChampPlayer').value = card.player1 ? card.player1.name : '';
    $('fChampLabel').value = card.label || '';
    $('fNoteText').value = card.text || '';
    $('fCol').value = card.col != null ? card.col : '';
    $('fRow').value = card.row != null ? card.row : '';

    // 胜者按钮
    $('winnerSwitch').querySelectorAll('button').forEach(b => {
        b.classList.remove('active-w1', 'active-w2', 'active-w0');
        const w = parseInt(b.dataset.w, 10);
        if (card.winner === w) b.classList.add(w === 1 ? 'active-w1' : w === 2 ? 'active-w2' : 'active-w0');
    });

    // 连线列表
    const draw = currentDraw();
    const incoming = (draw.connections || []).filter(cn => cn.to === card.id);
    const outgoing = (draw.connections || []).filter(cn => cn.from === card.id);
    let html = '';
    incoming.forEach(cn => {
        html += '<li><span><i class="fa-solid fa-arrow-right-long" style="color:var(--primary-blue);"></i> 来自 ' + dcEsc(cn.from) + '</span><button class="ed-conn-del" data-del-conn="' + dcEsc(cn.from) + '|' + dcEsc(cn.to) + '" title="删除连线"><i class="fa-solid fa-xmark"></i></button></li>';
    });
    outgoing.forEach(cn => {
        html += '<li><span>去向 ' + dcEsc(cn.to) + ' <i class="fa-solid fa-arrow-right-long" style="color:var(--text-muted);"></i></span><button class="ed-conn-del" data-del-conn="' + dcEsc(cn.from) + '|' + dcEsc(cn.to) + '" title="删除连线"><i class="fa-solid fa-xmark"></i></button></li>';
    });
    if (!html) html = '<li style="color:var(--text-muted);">无连线 — 可用顶部「连线模式」建立</li>';
    $('connList').innerHTML = html;
    $('connList').querySelectorAll('[data-del-conn]').forEach(btn => {
        btn.addEventListener('click', () => {
            const [from, to] = btn.dataset.delConn.split('|');
            const d = currentDraw();
            if (!d) return;
            pushUndo();
            d.connections = d.connections.filter(cn => !(cn.from === from && cn.to === to));
            renderInspector();
            afterChange();
        });
    });
}

// ===== 左侧设置面板 =====

function bindSettings() {
    const on = (id, ev, fn) => $(id).addEventListener(ev, fn);
    const bindText = (id, apply) => {
        on(id, 'input', e => { beginInput(); const d = currentDraw(); if (d) { apply(d, e.target.value); markDirty(); scheduleAutosave(); } });
        on(id, 'change', endInput);
    };
    bindText('fDrawId', (d, v) => { d.id = v.trim(); refreshDrawSelect(); });
    bindText('fTitle', (d, v) => { d.title = v; refreshDrawSelect(); });
    bindText('fSubtitle', (d, v) => { if (v.trim()) d.subtitle = v; else delete d.subtitle; });
    on('fCompetition', 'change', e => {
        const d = currentDraw(); if (!d) return;
        pushUndo();
        if (e.target.value) d.competitionId = e.target.value; else d.competitionId = null;
        markDirty(); scheduleAutosave();
    });
    on('fLayout', 'change', e => {
        const d = currentDraw(); if (!d) return;
        pushUndo();
        d.layout = e.target.value;
        renderAll(); afterChange();
    });
    const bindGrid = (id, key) => on(id, 'change', e => {
        const d = currentDraw(); if (!d) return;
        pushUndo();
        const n = parseInt(e.target.value, 10);
        if (Number.isFinite(n) && n >= 0) d.grid[key] = n;
        renderAll(); afterChange();
    });
    bindGrid('fCellW', 'cellWidth');
    bindGrid('fCellH', 'cellHeight');
    bindGrid('fGap', 'gap');
    bindGrid('fPadX', 'padX');
    bindGrid('fPadY', 'padY');

    on('fAccent', 'input', e => {
        const d = currentDraw(); if (!d) return;
        d.theme.accent = e.target.value;
        renderCanvas(); markDirty(); scheduleAutosave();
    });
    on('fShowSeeds', 'change', e => {
        const d = currentDraw(); if (!d) return;
        pushUndo();
        d.theme.showSeeds = e.target.checked;
        markDirty(); scheduleAutosave();
    });
    on('fShowLegend', 'change', e => {
        const d = currentDraw(); if (!d) return;
        pushUndo();
        d.theme.showLegend = e.target.checked;
        markDirty(); scheduleAutosave();
    });
    on('btnResetTheme', 'click', () => {
        const d = currentDraw(); if (!d) return;
        pushUndo();
        d.theme = Object.assign({}, DC_DEFAULT_THEME);
        renderAll(); afterChange();
    });
    on('btnAddRoundLabel', 'click', () => {
        const d = currentDraw(); if (!d) return;
        pushUndo();
        d.roundLabels = d.roundLabels || {};
        let col = 0;
        while (d.roundLabels[String(col)] != null && col < 50) col++;
        d.roundLabels[String(col)] = '';
        renderSettings();
        markDirty(); scheduleAutosave();
    });
}

function renderSettings() {
    const d = currentDraw();
    const disabled = !d;
    ['fDrawId', 'fTitle', 'fSubtitle', 'fCompetition', 'fLayout', 'fCellW', 'fCellH', 'fGap', 'fPadX', 'fPadY', 'fAccent', 'fShowSeeds', 'fShowLegend', 'btnAddRoundLabel', 'btnAutoArrange'].forEach(id => { $(id).disabled = disabled; });
    if (!d) { $('roundLabelsBox').innerHTML = ''; return; }
    $('fDrawId').value = d.id || '';
    $('fTitle').value = d.title || '';
    $('fSubtitle').value = d.subtitle || '';
    $('fCompetition').value = d.competitionId || '';
    $('fLayout').value = d.layout || 'grid';
    $('fCellW').value = d.grid.cellWidth;
    $('fCellH').value = d.grid.cellHeight;
    $('fGap').value = d.grid.gap != null ? d.grid.gap : 8;
    $('fPadX').value = d.grid.padX != null ? d.grid.padX : 80;
    $('fPadY').value = d.grid.padY != null ? d.grid.padY : 56;
    $('fAccent').value = d.theme.accent || '#4da3ff';
    $('fShowSeeds').checked = d.theme.showSeeds !== false;
    $('fShowLegend').checked = d.theme.showLegend !== false;

    // 轮次标签行
    const box = $('roundLabelsBox');
    const labels = d.roundLabels || {};
    const cols = Object.keys(labels).sort((a, b) => (parseInt(a, 10) || 0) - (parseInt(b, 10) || 0));
    box.innerHTML = cols.map(col =>
        '<div class="ed-round-row">' +
        '<span class="col-no">列 ' + dcEsc(col) + '</span>' +
        '<input type="text" data-round-col="' + dcEsc(col) + '" value="' + dcEsc(labels[col]) + '" placeholder="第' + (parseInt(col, 10) + 1) + '轮">' +
        '<button class="ed-round-del" data-round-del="' + dcEsc(col) + '" title="删除"><i class="fa-solid fa-xmark"></i></button>' +
        '</div>').join('') || '<p class="ed-hint">暂无自定义标签，查看器将使用默认轮次名。</p>';

    box.querySelectorAll('input[data-round-col]').forEach(inp => {
        inp.addEventListener('focus', beginInput);
        inp.addEventListener('input', () => {
            beginInput();
            const dd = currentDraw(); if (!dd) return;
            dd.roundLabels = dd.roundLabels || {};
            dd.roundLabels[inp.dataset.roundCol] = inp.value;
            markDirty(); scheduleAutosave();
        });
        inp.addEventListener('blur', endInput);
        inp.addEventListener('change', endInput);
    });
    box.querySelectorAll('[data-round-del]').forEach(btn => {
        btn.addEventListener('click', () => {
            const dd = currentDraw(); if (!dd) return;
            pushUndo();
            delete dd.roundLabels[btn.dataset.roundDel];
            renderSettings();
            afterChange();
        });
    });
}

// ===== 状态栏 / 校验 =====

function updateStatus() {
    const d = currentDraw();
    if (!d) {
        $('statCardCount').textContent = '0 卡片';
        $('statConnCount').textContent = '0 连线';
        $('statProgress').textContent = '';
        return;
    }
    const s = dcDrawStats(d);
    $('statCardCount').textContent = s.cards + ' 卡片';
    $('statConnCount').textContent = (d.connections || []).length + ' 连线';
    $('statProgress').textContent = s.matches ? ('比赛 ' + s.finished + '/' + s.matches + ' 已完赛' + (s.live ? ' · ' + s.live + ' 进行中' : '')) : '';
}

function showValidate() {
    const compIds = edCompetitions.map(c => c.id);
    let totalErr = 0, totalWarn = 0;
    let html = '';
    if (!edDraws.length) html = '<p class="ed-hint">当前没有对阵表。</p>';
    edDraws.forEach(d => {
        const v = dcValidateDraw(d, compIds);
        totalErr += v.errors.length;
        totalWarn += v.warnings.length;
        html += '<div style="margin-bottom:10px;"><b style="font-size:0.84rem;">' + dcEsc((d.id || '?') + ' · ' + (d.title || '')) + '</b>';
        if (!v.errors.length && !v.warnings.length) html += '<span style="color:#16a34a;font-size:0.78rem;"> ✓ 通过</span>';
        html += '<ul style="margin:6px 0 0 18px;font-size:0.78rem;line-height:1.7;">';
        v.errors.forEach(e => { html += '<li style="color:var(--accent-red);">错误：' + dcEsc(e) + '</li>'; });
        v.warnings.forEach(w => { html += '<li style="color:#b45309;">警告：' + dcEsc(w) + '</li>'; });
        html += '</ul></div>';
    });
    openInfoModal('校验结果（' + totalErr + ' 错误 / ' + totalWarn + ' 警告）', html);
}

function openInfoModal(title, bodyHtml) {
    let overlay = $('infoModal');
    if (!overlay) {
        overlay = document.createElement('div');
        overlay.id = 'infoModal';
        overlay.className = 'de-modal-overlay';
        overlay.style.display = 'none';
        overlay.innerHTML = '<div class="de-modal"><div class="de-modal-title"><i class="fa-solid fa-clipboard-check"></i> <span id="infoModalTitle"></span></div><div class="de-modal-body" id="infoModalBody"></div><div class="de-modal-footer"><button class="de-btn de-btn-primary" id="infoModalClose">关闭</button></div></div>';
        document.body.appendChild(overlay);
        overlay.addEventListener('click', e => { if (e.target === overlay) overlay.style.display = 'none'; });
        $('infoModalClose').addEventListener('click', () => { overlay.style.display = 'none'; });
    }
    $('infoModalTitle').textContent = title;
    $('infoModalBody').innerHTML = bodyHtml;
    overlay.style.display = 'flex';
}

// ===== 模板 =====

function bindModals() {
    // 模板弹窗
    $('btnTemplate').addEventListener('click', () => {
        if (!edDraws.length && edCurrent < 0) { /* 允许在空状态下生成第一张 */ }
        $('templateModal').style.display = 'flex';
    });
    $('tplCancel').addEventListener('click', () => { $('templateModal').style.display = 'none'; });
    $('tplType').addEventListener('change', e => {
        const single = e.target.value === 'single';
        $('tplEntriesRow').style.display = single ? '' : 'none';
        $('tplThirdRow').style.display = single ? '' : 'none';
        $('tplGroupsRow').style.display = single ? 'none' : '';
        $('tplKoRow').style.display = single ? 'none' : '';
    });
    $('tplGenerate').addEventListener('click', generateFromTemplate);
    templateModalEscapable();

    // JSON 弹窗
    $('btnJson').addEventListener('click', () => {
        const d = currentDraw();
        $('jsonText').value = d ? dcSerializeDraws([d]) : '[]';
        $('jsonModal').style.display = 'flex';
    });
    $('jsonClose').addEventListener('click', () => { $('jsonModal').style.display = 'none'; });
    $('jsonCopy').addEventListener('click', () => {
        navigator.clipboard.writeText($('jsonText').value)
            .then(() => edToast('已复制 JSON'))
            .catch(() => edToast('复制失败，请手动选择文本', true));
    });
    $('jsonApply').addEventListener('click', () => {
        try {
            const parsed = JSON.parse($('jsonText').value);
            pushUndo();
            if (Array.isArray(parsed)) {
                edDraws = parsed.map(dcNormalizeDraw).filter(Boolean);
                edCurrent = 0;
                edToast('已替换全部 ' + edDraws.length + ' 张对阵表');
            } else {
                const nd = dcNormalizeDraw(parsed);
                if (!nd) throw new Error('无效对象');
                if (edCurrent < 0) { edDraws.push(nd); edCurrent = edDraws.length - 1; }
                else edDraws[edCurrent] = nd;
                edToast('已应用当前对阵表');
            }
            edSelected = null;
            refreshDrawSelect();
            renderAll();
            afterChange();
            $('jsonModal').style.display = 'none';
        } catch (e) {
            edToast('JSON 解析失败：' + e.message, true);
        }
    });

    // 导入弹窗
    $('importCancel').addEventListener('click', () => { $('importModal').style.display = 'none'; });
    $('importFile').addEventListener('change', e => {
        $('importFileInput').style.display = e.target.checked ? '' : 'none';
    });
    $('importFileInput').addEventListener('change', e => {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = () => { $('importText').value = reader.result; };
        reader.readAsText(file, 'utf-8');
    });
    $('importApply').addEventListener('click', () => {
        try {
            const parsed = JSON.parse($('importText').value);
            pushUndo();
            if (Array.isArray(parsed)) {
                edDraws = parsed.map(dcNormalizeDraw).filter(Boolean);
                edCurrent = 0;
                edToast('已导入 ' + edDraws.length + ' 张对阵表');
            } else {
                const nd = dcNormalizeDraw(parsed);
                if (!nd) throw new Error('无效对象');
                nd.id = dcNewId('d', edDraws.map(x => x.id));
                edDraws.push(nd);
                edCurrent = edDraws.length - 1;
                edToast('已追加为 ' + nd.id);
            }
            edSelected = null;
            refreshDrawSelect();
            renderAll();
            afterChange();
            $('importModal').style.display = 'none';
        } catch (e) {
            edToast('导入失败：' + e.message, true);
        }
    });
}

function templateModalEscapable() {
    ['templateModal', 'jsonModal', 'importModal'].forEach(id => {
        const el = $(id);
        el.addEventListener('mousedown', e => { if (e.target === el) el.style.display = 'none'; });
    });
}

function generateFromTemplate() {
    const type = $('tplType').value;
    const title = $('tplTitle').value.trim() || '新对阵表';
    const competitionId = $('tplCompetition').value || null;
    pushUndo();
    let draw = null;
    try {
        if (type === 'single') {
            const entries = $('tplEntries').value.split('\n').map(s => s.trim()).filter(Boolean);
            if (!entries.length) { edToast('请填写参赛名单', true); edUndoStack.pop(); return; }
            draw = dcTemplateSingleElim({
                title, competitionId, entries,
                thirdPlace: $('tplThird').checked,
                id: dcNewId('d', edDraws.map(x => x.id))
            });
        } else {
            const groups = $('tplGroups').value.split('\n').map(line => {
                const m = line.split(/[:：]/);
                if (m.length < 2) return null;
                const name = m[0].trim();
                const players = m.slice(1).join('：').split(/[、,，]/).map(s => s.trim()).filter(Boolean);
                return name && players.length ? { name, players } : null;
            }).filter(Boolean);
            if (!groups.length) { edToast('请按「组名: 选手1、选手2」格式填写分组', true); edUndoStack.pop(); return; }
            draw = dcTemplateGroups({
                title, competitionId, groups,
                knockout: $('tplKo').checked,
                advancePerGroup: 1,
                id: dcNewId('d', edDraws.map(x => x.id))
            });
        }
    } catch (e) {
        edUndoStack.pop();
        edToast('模板生成失败：' + e.message, true);
        return;
    }
    edDraws.push(dcNormalizeDraw(draw));
    selectDraw(edDraws.length - 1);
    afterChange();
    $('templateModal').style.display = 'none';
    setTimeout(zoomFit, 60);
    edToast('模板已生成 ' + draw.id + '，可继续微调');
}

// ===== 导出 =====

function buildExport() {
    edDraws.forEach(d => {
        let maxCol = 0, maxRow = 0;
        (d.cards || []).forEach(c => {
            if (c.col != null) maxCol = Math.max(maxCol, c.col);
            if (c.row != null) maxRow = Math.max(maxRow, c.row);
        });
        d.grid.cols = maxCol + 1;
        d.grid.rows = maxRow + 1;
    });
    return dcSerializeDraws(edDraws);
}

function downloadDraws() {
    const json = buildExport();
    const blob = new Blob([json], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'draws.json';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    edBaseline = json;
    markDirty();
    edToast('已下载 draws.json —— 请用它替换仓库中的 data/draws.json 并提交');
}

function copyAll() {
    const json = buildExport();
    navigator.clipboard.writeText(json)
        .then(() => { edBaseline = json; markDirty(); edToast('已复制全部 draws.json 到剪贴板'); })
        .catch(() => edToast('复制失败，请用 JSON 面板手动复制', true));
}

// ===== 键盘 =====

function bindKeyboard() {
    document.addEventListener('keydown', e => {
        const tag = (e.target.tagName || '').toLowerCase();
        const typing = tag === 'input' || tag === 'textarea' || tag === 'select';
        if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key.toLowerCase() === 'z') {
            if (typing) return;
            e.preventDefault(); doUndo(); return;
        }
        if ((e.ctrlKey || e.metaKey) && (e.key.toLowerCase() === 'y' || (e.shiftKey && e.key.toLowerCase() === 'z'))) {
            if (typing) return;
            e.preventDefault(); doRedo(); return;
        }
        if ((e.key === 'Delete' || e.key === 'Backspace') && !typing && edSelected) {
            e.preventDefault();
            deleteSelectedCard();
            return;
        }
        if (e.key === 'Escape') {
            ['templateModal', 'jsonModal', 'importModal', 'infoModal'].forEach(id => { const el = $(id); if (el) el.style.display = 'none'; });
            if (edMode === 'connect' && edConnectFrom) { edConnectFrom = null; renderCanvas(); }
        }
    });
    window.addEventListener('beforeunload', e => {
        if (dcSerializeDraws(edDraws) !== edBaseline) {
            e.preventDefault();
            e.returnValue = '';
        }
    });
}

// ===== 总渲染 =====

function renderAll() {
    renderCanvas();
    renderInspector();
    renderSettings();
    updateStatus();
    updateUndoButtons();
    updateSelectionButtons();
}
