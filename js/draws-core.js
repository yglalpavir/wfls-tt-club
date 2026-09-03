/* ========================================
   draws-core.js - 对阵表共享核心库
   v3 数据模型 · 归一化 · 布局计算 · 校验 · 模板生成 · 序列化
   用户端 draws-viewer.js 与编辑端 draws-editor.js 共用，
   修改数据模型 / 几何规则只改这里。
   依赖: 无硬依赖（可选借用页面的 escapeHtml / i18n / currentLang）
   ======================================== */

const DRAWS_VERSION = 3;

// v3 网格与主题默认值（与 v2 渲染几何保持一致：padX 80 / padY 40 / gap 8）
const DC_DEFAULT_GRID = { cols: 8, rows: 24, cellWidth: 200, cellHeight: 68, gap: 8, padX: 80, padY: 40 };
const DC_DEFAULT_THEME = { accent: '', cardStyle: 'classic', showSeeds: true, showTimes: true, showLegend: true };

// ---------- 小工具 ----------

function _dcNum(v, def) { const n = Number(v); return Number.isFinite(n) ? n : def; }

function dcEsc(str) {
    if (typeof escapeHtml === 'function') return escapeHtml(str);
    return String(str == null ? '' : str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

// 读取站点 i18n（common.js），缺失时回退中文
function dcT(key, fallback) {
    try {
        if (typeof i18n !== 'undefined' && typeof currentLang !== 'undefined' && i18n[currentLang] && i18n[currentLang][key]) return i18n[currentLang][key];
    } catch (e) { /* ignore */ }
    return fallback;
}

function dcParseScore(scoreStr) {
    if (!scoreStr && scoreStr !== 0) return null;
    const parts = String(scoreStr).split('-');
    if (parts.length === 2) {
        const a = parseInt(parts[0], 10), b = parseInt(parts[1], 10);
        if (Number.isFinite(a) && Number.isFinite(b)) return [a, b];
    }
    return null;
}

function dcNewId(prefix, existing, startAt) {
    const used = new Set(existing || []);
    let i = startAt || 1;
    while (used.has(prefix + i)) i++;
    return prefix + i;
}

// ---------- 选手字段归一化 ----------
// v3 中 player1/player2 支持两种形态：
//   "姓名"  或  { "name": "姓名", "seed": 1, "note": "弃赛", "desc": "A组第1" }
// 统一归一化为对象（name 必有）。

// 解析旧式 "姓名(1)(弃赛)" 字符串 → 结构化对象
function dcParsePlayerName(raw) {
    let name = String(raw == null ? '' : raw).trim();
    let seed = null;
    const notes = [];
    let m;
    while ((m = name.match(/^(.+?)\s*[（(]([^()（）]+)[)）]\s*$/))) {
        const tag = m[2].trim();
        if (seed === null && /^\d+$/.test(tag)) seed = parseInt(tag, 10);
        else notes.unshift(tag);
        name = m[1].trim();
    }
    const p = { name };
    if (seed !== null) p.seed = seed;
    if (notes.length) p.note = notes.join('，');
    return p;
}

function dcNormalizePlayer(p) {
    if (p == null || p === '') return null;
    if (typeof p === 'object') {
        const name = String(p.name || '').trim();
        if (!name) return null;
        const out = { name };
        if (p.seed != null && p.seed !== '') out.seed = p.seed;
        if (p.note) out.note = String(p.note);
        if (p.desc) out.desc = String(p.desc);
        return out;
    }
    const parsed = dcParsePlayerName(p);
    return parsed.name ? parsed : null;
}

function dcPlayerName(p) { return p ? (typeof p === 'object' ? p.name : String(p)) : ''; }

// ---------- 卡片 / 抽签表归一化（v2 → v3 内存形态）----------

function dcNormalizeCard(c, fromLegacy) {
    if (!c || typeof c !== 'object') return null;
    const card = Object.assign({}, c);
    if (fromLegacy) {
        if (card.isChampion) card.type = 'champion';
        else if (!card.player2 || card.player2 === '轮空') card.type = 'bye';
        else card.type = 'match';
    } else {
        card.type = card.type || (card.isChampion ? 'champion' : 'match');
    }
    card.player1 = dcNormalizePlayer(card.player1);
    card.player2 = dcNormalizePlayer(card.player2);
    if (card.type === 'champion' && !card.label) card.label = '冠军';
    if (card.round == null && card.col != null) card.round = card.col;
    return card;
}

function dcNormalizeDraw(raw) {
    if (!raw || typeof raw !== 'object') return null;
    const fromLegacy = (parseInt(raw.version, 10) || 0) < DRAWS_VERSION;
    const d = Object.assign({}, raw);
    d.version = DRAWS_VERSION;
    d.grid = Object.assign({}, DC_DEFAULT_GRID, d.grid || {});
    d.theme = Object.assign({}, DC_DEFAULT_THEME, d.theme || {});
    if (d.layout !== 'auto') d.layout = 'grid';
    if (Array.isArray(d.roundLabels)) {
        const rl = {};
        d.roundLabels.forEach((t, i) => { if (t) rl[String(i)] = t; });
        d.roundLabels = rl;
    }
    d.cards = (d.cards || []).map(c => dcNormalizeCard(c, fromLegacy)).filter(Boolean);
    d.connections = (d.connections || []).filter(cn => cn && cn.from && cn.to)
        .map(cn => Object.assign({ fromSide: 'right', toSide: 'left' }, cn));
    return d;
}

// ---------- 状态推断 ----------

function dcMatchStatus(card) {
    if (!card) return 'scheduled';
    if (card.type === 'match' || card.type === 'bye') {
        if (card.status === 'live' || card.status === 'scheduled' || card.status === 'final') return card.status;
        if (card.score || (card.games && card.games.length)) return 'final';
        if (card.winner === 1 || card.winner === 2) return 'final';
        return 'scheduled';
    }
    return null;
}

// ---------- 布局计算 ----------
// 与 v2 几何完全兼容: x = padX + col*cellWidth + gap/2, 卡片宽 = cellWidth - gap
// layout === 'auto' 或卡片缺 col/row 时，按 round/order 分列堆叠并垂直居中。

function dcComputeLayout(draw) {
    const grid = draw.grid || DC_DEFAULT_GRID;
    const gap = _dcNum(grid.gap, 8);
    const padX = _dcNum(grid.padX, 80);
    const padY = _dcNum(grid.padY, 40);
    const cellW = _dcNum(grid.cellWidth, 200);
    const cellH = _dcNum(grid.cellHeight, 68);
    const cardW = cellW - gap, cardH = cellH - gap;
    const cards = draw.cards || [];
    const positions = {};
    const useAuto = draw.layout === 'auto' || cards.some(c => c.col == null || c.row == null);
    const autoGap = 18;

    if (useAuto) {
        const colsMap = new Map();
        cards.forEach(c => {
            const col = (c.round != null ? c.round : (c.col != null ? c.col : 0)) | 0;
            if (!colsMap.has(col)) colsMap.set(col, []);
            colsMap.get(col).push(c);
        });
        const colKeys = Array.from(colsMap.keys()).sort((a, b) => a - b);
        const colHs = colKeys.map(k => colsMap.get(k).length * cellH + (colsMap.get(k).length - 1) * autoGap);
        const maxH = Math.max.apply(null, colHs.concat([1]));
        colKeys.forEach((col, ci) => {
            const list = colsMap.get(col).slice().sort((a, b) => (a.order != null ? a.order : (a.row != null ? a.row : 0)) - (b.order != null ? b.order : (b.row != null ? b.row : 0)));
            const top = padY + (maxH - colHs[ci]) / 2;
            list.forEach((c, i) => {
                positions[c.id] = { x: padX + col * cellW + gap / 2, y: top + i * (cellH + autoGap) };
            });
        });
    } else {
        cards.forEach(c => {
            positions[c.id] = { x: padX + (c.col | 0) * cellW + gap / 2, y: padY + (c.row | 0) * cellH + gap / 2 };
        });
    }

    let maxRight = 0, maxBottom = 0;
    cards.forEach(c => {
        const p = positions[c.id];
        if (!p) return;
        maxRight = Math.max(maxRight, p.x + cardW);
        maxBottom = Math.max(maxBottom, p.y + cardH);
    });

    return {
        positions, cardW, cardH, cellW, cellH, gap, padX, padY,
        canvasW: maxRight + padX, canvasH: maxBottom + padY,
        layoutMode: useAuto ? 'auto' : 'grid'
    };
}

function dcAnchorPoint(pos, cardW, cardH, side) {
    switch (side) {
        case 'left': return { x: pos.x, y: pos.y + cardH / 2 };
        case 'right': return { x: pos.x + cardW, y: pos.y + cardH / 2 };
        case 'top': return { x: pos.x + cardW / 2, y: pos.y };
        case 'bottom': return { x: pos.x + cardW / 2, y: pos.y + cardH };
        default: return { x: pos.x + cardW, y: pos.y + cardH / 2 };
    }
}

function dcConnectionPath(a, b, fromSide, toSide) {
    const dirX = s => (s === 'left' ? -1 : s === 'right' ? 1 : 0);
    const dirY = s => (s === 'top' ? -1 : s === 'bottom' ? 1 : 0);
    const d1x = dirX(fromSide), d1y = dirY(fromSide);
    const d2x = dirX(toSide), d2y = dirY(toSide);
    const dist = Math.max(36, Math.abs(b.x - a.x) * 0.5, Math.abs(b.y - a.y) * 0.5);
    const c1 = { x: a.x + d1x * dist, y: a.y + d1y * dist };
    const c2 = { x: b.x + d2x * dist, y: b.y + d2y * dist };
    return 'M ' + a.x + ' ' + a.y + ' C ' + c1.x + ' ' + c1.y + ', ' + c2.x + ' ' + c2.y + ', ' + b.x + ' ' + b.y;
}

// 连线在 SVG 上的箭头（指向目标端点）
function dcArrowPoints(tip, fromSide) {
    const s = 7;
    const inward = { right: [-1, 0], left: [1, 0], top: [0, 1], bottom: [0, -1] }[fromSide] || [1, 0];
    const px = -inward[1], py = inward[0]; // 垂直方向
    const back = { x: tip.x + inward[0] * s * 1.6, y: tip.y + inward[1] * s * 1.6 };
    return [
        (back.x + px * s) + ',' + (back.y + py * s),
        tip.x + ',' + tip.y,
        (back.x - px * s) + ',' + (back.y - py * s)
    ].join(' ');
}

// ---------- 规整排布（淘汰赛树形逐轮加倍）----------
// 依据 round / order 生成经典 col/row：row_units(r, order) = (order + 0.5) * 2^r * 2 - 1
// 列内卡片数不符合逐轮减半（如小组循环列）时，等距铺排并与最高列垂直居中。

function dcAutoArrange(draw) {
    const cards = (draw.cards || []).slice();
    const cellH = _dcNum((draw.grid || {}).cellHeight, 68);
    const colsMap = new Map();
    cards.forEach(c => {
        const col = (c.round != null ? c.round : (c.col != null ? c.col : 0)) | 0;
        if (!colsMap.has(col)) colsMap.set(col, []);
        colsMap.get(col).push(c);
    });
    const colKeys = Array.from(colsMap.keys()).sort((a, b) => a - b);
    const counts = colKeys.map(k => colsMap.get(k).length);
    const maxCount = Math.max.apply(null, counts.concat([1]));
    const isTree = counts.every((n, i) => i === 0 ? n === maxCount : n * 2 === counts[i - 1] || n === Math.ceil(counts[i - 1] / 2));
    colKeys.forEach((col, ci) => {
        const list = colsMap.get(col).sort((a, b) => (a.order != null ? a.order : 0) - (b.order != null ? b.order : 0));
        list.forEach((c, order) => {
            c.col = col;
            if (isTree) {
                const r = ci;
                c.row = Math.round((order + 0.5) * Math.pow(2, r) * 2 - 1);
            } else {
                const span = Math.max(2, Math.ceil((maxCount * 2 - 1) / Math.max(list.length, 1)));
                const offset = Math.floor(((maxCount * 2 - 1) - (list.length - 1) * span) / 2);
                c.row = Math.max(0, offset + order * span);
            }
            c.order = order;
        });
    });
    draw.layout = 'grid';
    return draw;
}

// ---------- 校验 ----------

function dcValidateDraw(draw, validCompetitionIds) {
    const errors = [], warnings = [];
    if (!draw) return { errors: ['抽签表为空'], warnings };
    if (!draw.id) errors.push('缺少 id');
    if (!draw.title) warnings.push('缺少标题 title');
    if (draw.competitionId && Array.isArray(validCompetitionIds) && !validCompetitionIds.includes(draw.competitionId)) {
        errors.push('competitionId "' + draw.competitionId + '" 不存在');
    }
    const cards = draw.cards || [];
    const ids = new Set();
    cards.forEach(c => {
        if (!c.id) { errors.push('存在缺少 id 的卡片'); return; }
        if (ids.has(c.id)) errors.push('卡片 id 重复: ' + c.id);
        ids.add(c.id);
        if (c.winner != null && c.winner !== 0 && c.winner !== 1 && c.winner !== 2) {
            errors.push('卡片 ' + c.id + ' 的 winner 取值非法（' + c.winner + '，应为 0/1/2/null）');
        }
        if ((c.col != null && c.col < 0) || (c.row != null && c.row < 0)) {
            errors.push('卡片 ' + c.id + ' 的 col/row 不能为负');
        }
        const st = dcMatchStatus(c);
        if (c.type === 'match') {
            if (!c.player1 || !c.player2) warnings.push('比赛卡 ' + c.id + ' 有选手空缺');
            if (st === 'scheduled' && (c.winner === 1 || c.winner === 2)) {
                warnings.push('比赛卡 ' + c.id + ' 未录入比分但已设 winner');
            }
        }
        if (c.type === 'champion' && !c.player1) warnings.push('冠军卡 ' + c.id + ' 未填写选手');
    });
    (draw.connections || []).forEach(cn => {
        if (!ids.has(cn.from)) errors.push('连线 from "' + cn.from + '" 不存在');
        if (!ids.has(cn.to)) errors.push('连线 to "' + cn.to + '" 不存在');
        if (cn.from === cn.to) errors.push('连线不能自连接: ' + cn.from);
    });
    return { errors, warnings };
}

// ---------- 胜者传播 ----------
// 依据已完赛卡片的 winner 与连线，把胜者姓名填入下一场的空位。

function dcPropagateWinners(draw) {
    const cardMap = {};
    (draw.cards || []).forEach(c => { cardMap[c.id] = c; });
    // 每张卡的入线按来源位置排序，保证填充顺序稳定
    const incoming = new Map();
    (draw.connections || []).forEach(cn => {
        const from = cardMap[cn.from], to = cardMap[cn.to];
        if (!from || !to) return;
        if (!incoming.has(to.id)) incoming.set(to.id, []);
        incoming.get(to.id).push(from);
    });
    incoming.forEach(list => list.sort((a, b) => (a.col - b.col) || (a.row - b.row)));
    let assigned = 0, conflicts = 0;
    incoming.forEach((sources, toId) => {
        const to = cardMap[toId];
        if (!to || to.type === 'note' || to.type === 'champion') return;
        sources.forEach(from => {
            const st = dcMatchStatus(from);
            if (st !== 'final' || (from.winner !== 1 && from.winner !== 2)) return;
            const winName = from.winner === 1 ? dcPlayerName(from.player1) : dcPlayerName(from.player2);
            if (!winName) return;
            if (!to.player1) { to.player1 = { name: winName }; assigned++; }
            else if (!to.player2 && to.type === 'match') { to.player2 = { name: winName }; assigned++; }
            else if (dcPlayerName(to.player1) === winName || dcPlayerName(to.player2) === winName) { /* 已填 */ }
            else conflicts++;
        });
    });
    return { assigned, conflicts };
}

// ---------- 模板生成 ----------

// 标准种子排位（slot 顺序 → 种子号），1/2 号种子分居上下半区
function dcSeedOrder(size) {
    let pls = [1, 2];
    while (pls.length < size) {
        const n = pls.length * 2 + 1;
        const next = [];
        pls.forEach(s => { next.push(s); next.push(n - s); });
        pls = next;
    }
    return pls.slice(0, size);
}

// 单淘汰模板。opts: { title, competitionId, entries:[名字(按种子序)], thirdPlace, cellWidth, cellHeight, roundNames }
function dcTemplateSingleElim(opts) {
    opts = opts || {};
    const entries = (opts.entries || []).map(s => String(s || '').trim()).filter(Boolean);
    const n = Math.max(2, Math.pow(2, Math.ceil(Math.log2(Math.max(entries.length, 2)))));
    const byes = n - entries.length;
    const seeds = dcSeedOrder(n);
    const slots = seeds.map(s => (s <= entries.length ? { name: entries[s - 1], seed: s } : null));
    const cellW = opts.cellWidth || 190, cellH = opts.cellHeight || 68;
    const totalRounds = Math.log2(n);
    const cards = [], connections = [];
    const roundNames = opts.roundNames || [];
    const roundLabels = {};
    let mid = 1;

    for (let r = 0; r < totalRounds; r++) {
        const count = n / Math.pow(2, r + 1);
        for (let i = 0; i < count; i++) {
            const row = (i + 0.5) * Math.pow(2, r) * 2 - 1;
            const card = {
                id: 'm' + (mid++), type: 'match',
                col: r, row, round: r, order: i,
                player1: null, player2: null, score: '', winner: null
            };
            if (r === 0) {
                const a = slots[i * 2], b = slots[i * 2 + 1];
                card.player1 = a || { name: '轮空' };
                card.player2 = b || { name: '轮空' };
                if (a && !b) card.winner = 1;
                if (!a && b) card.winner = 2;
            }
            cards.push(card);
        }
        const label = roundNames[r] || (r === totalRounds - 1 ? '决赛' : (totalRounds === 3 && r === 1 ? '半决赛' : (totalRounds === 4 && r === 2 ? '1/4决赛' : '第' + (r + 1) + '轮')));
        roundLabels[String(r)] = label;
    }
    // 连线
    for (let r = 1; r < totalRounds; r++) {
        const prev = cards.filter(c => c.round === r - 1);
        const cur = cards.filter(c => c.round === r);
        cur.forEach((c, i) => {
            connections.push({ from: prev[i * 2].id, to: c.id });
            connections.push({ from: prev[i * 2 + 1].id, to: c.id });
        });
    }
    // 决赛之后的冠军卡（与决赛同列下一行）
    const finalCol = totalRounds - 1;
    const finalCard = cards.filter(c => c.round === finalCol)[0];
    const champRow = finalCard.row + 4;
    cards.push({ id: 'm' + (mid++), type: 'champion', col: finalCol, row: champRow, round: finalCol, order: 1, player1: null, label: '冠军' });
    connections.push({ from: finalCard.id, to: cards[cards.length - 1].id });
    let extraCards = [], extraConns = [], extraLabels = {};

    // 季军赛（决赛季军 = 半决赛两位负者）
    if (opts.thirdPlace && totalRounds >= 2) {
        const semis = cards.filter(c => c.round === totalRounds - 2);
        const third = {
            id: 'm' + (mid++), type: 'match', col: finalCol, row: champRow + 6, round: finalCol, order: 2,
            player1: null, player2: null, score: '', winner: null, note: '半决赛负者'
        };
        semis.forEach(s => connections.push({ from: s.id, to: third.id, kind: 'loser' }));
        cards.push(third);
        extraLabels[String(finalCol)] = null; // 该列含决赛与季军赛，标签由调用方自定义
        roundLabels[String(finalCol)] = '决赛 / 季军赛';
    }

    const grid = { cols: Math.max(totalRounds + 1, 4), rows: Math.max.apply(null, cards.map(c => c.row).concat([0])) + 3, cellWidth: cellW, cellHeight: cellH };
    const draw = {
        id: opts.id || 'd_new', version: DRAWS_VERSION,
        competitionId: opts.competitionId || null,
        title: opts.title || '新对阵表', subtitle: opts.subtitle || '',
        layout: 'grid', grid, roundLabels,
        cards: cards.concat(extraCards), connections: connections.concat(extraConns),
        theme: {}
    };
    delete extraLabels;
    return draw;
}

// 小组循环 + 淘汰赛模板。opts: { title, competitionId, groups:[{name, players:[]}], advancePerGroup, cellWidth, cellHeight }
function dcTemplateGroups(opts) {
    opts = opts || {};
    const groups = (opts.groups || []).filter(g => g && g.players && g.players.length);
    const cellW = opts.cellWidth || 190, cellH = opts.cellHeight || 68;
    const cards = [], connections = [];
    const roundLabels = {};
    let mid = 1;

    // 每组一列：组名卡 + 组内单循环
    groups.forEach((g, gi) => {
        cards.push({ id: 'g' + (mid++), type: 'note', col: gi, row: 0, round: gi, order: 0, text: g.name + '（单循环）' });
        const n = g.players.length;
        const ids = [];
        for (let i = 0; i < n; i++) ids.push(i);
        if (n % 2 === 1) ids.push(-1);
        const rounds = [];
        for (let r = 0; r < ids.length - 1; r++) {
            const pairs = [];
            for (let i = 0; i < ids.length / 2; i++) {
                const a = ids[i], b = ids[ids.length - 1 - i];
                if (a !== -1 && b !== -1) pairs.push(r % 2 === 1 ? [b, a] : [a, b]);
            }
            rounds.push(pairs);
            ids.splice(1, 0, ids.pop());
        }
        let order = 1;
        rounds.forEach(pairs => pairs.forEach(p => {
            cards.push({
                id: 'm' + (mid++), type: 'match', col: gi, row: order * 2, round: gi, order,
                player1: { name: g.players[p[0]] }, player2: { name: g.players[p[1]] },
                score: '', winner: null
            });
            order++;
        }));
        roundLabels[String(gi)] = g.name;
    });

    // 淘汰赛阶段
    const adv = Math.max(1, Math.min(2, opts.advancePerGroup || 1));
    if (opts.knockout && groups.length >= 2) {
        const gCount = groups.length;
        const koBaseCol = groups.length;
        const qualifiedPerCol = adv === 2 ? 2 : 1; // 每组一列展示的晋级位
        if (gCount === 4 && adv === 1) {
            roundLabels.String4;
            roundLabels['4'] = '半决赛'; roundLabels['5'] = '决赛';
            const semiRow = 2, finalRow = 6;
            [['A组第1', 'B组第1', 0], ['C组第1', 'D组第1', 4]].forEach((cfg, i) => {
                const semi = { id: 'm' + (mid++), type: 'match', col: 4, row: semiRow + i * 8, round: 4, order: i,
                    player1: { desc: cfg[0] }, player2: { desc: cfg[1] }, score: '', winner: null };
                cards.push(semi);
                const src = cards.filter(c => c.round === cfg[2] && c.type === 'match');
                src.forEach(s => connections.push({ from: s.id, to: semi.id }));
            });
            const semis = cards.filter(c => c.round === 4);
            const final = { id: 'm' + (mid++), type: 'match', col: 5, row: finalRow, round: 5, order: 0,
                player1: { desc: '半决赛1胜者' }, player2: { desc: '半决赛2胜者' }, score: '', winner: null };
            cards.push(final);
            semis.forEach(s => connections.push({ from: s.id, to: final.id }));
        } else {
            // 通用：每组头名进下一列的循环赛闭环（连环画式排布），由编辑者继续拖拽调整
            let col = koBaseCol;
            let remaining = gCount;
            let prevColCards = cards.filter(c => c.type === 'match' && c.round === col - 1);
            while (remaining > 1) {
                const nextCount = Math.ceil(remaining / 2);
                roundLabels[String(col)] = remaining <= 2 ? '决赛' : (remaining <= 4 ? '半决赛' : '第' + (col - koBaseCol + 1) + '轮');
                const newCards = [];
                for (let i = 0; i < nextCount; i++) {
                    const c = { id: 'm' + (mid++), type: 'match', col, row: i * 4 + 2, round: col, order: i,
                        player1: { desc: '待定' }, player2: { desc: '待定' }, score: '', winner: null };
                    newCards.push(c); cards.push(c);
                }
                newCards.forEach((c, i) => {
                    const a = prevColCards[i * 2], b = prevColCards[i * 2 + 1];
                    if (a) connections.push({ from: a.id, to: c.id });
                    if (b) connections.push({ from: b.id, to: c.id });
                });
                prevColCards = newCards;
                remaining = nextCount;
                col++;
            }
        }
    }

    const rows = Math.max.apply(null, cards.map(c => c.row).concat([0])) + 2;
    const grid = { cols: Math.max.apply(null, cards.map(c => c.col).concat([0])) + 1, rows, cellWidth: cellW, cellHeight: cellH };
    return {
        id: opts.id || 'd_new', version: DRAWS_VERSION,
        competitionId: opts.competitionId || null,
        title: opts.title || '小组赛 + 淘汰赛', subtitle: opts.subtitle || '',
        layout: 'grid', grid, roundLabels, cards, connections, theme: {}
    };
}

// ---------- 序列化（清理默认值，保持 JSON 精简）----------

function _dcCleanPlayer(p) {
    if (!p) return null;
    const out = {};
    out.name = p.name;
    if (p.seed != null && p.seed !== '') out.seed = p.seed;
    if (p.note) out.note = p.note;
    if (p.desc) out.desc = p.desc;
    // 只有 name 时退化为纯字符串，保持数据精简
    if (Object.keys(out).length === 1) return out.name;
    return out;
}

function dcCleanCard(c) {
    if (!c || typeof c !== 'object') return null;
    const out = { id: c.id };
    if (c.type && c.type !== 'match') out.type = c.type;
    if (c.col != null) out.col = c.col;
    if (c.row != null) out.row = c.row;
    if (c.round != null && c.round !== c.col) out.round = c.round;
    if (c.order != null) out.order = c.order;
    const st = dcMatchStatus(c);
    const p1 = _dcCleanPlayer(c.player1);
    const p2 = _dcCleanPlayer(c.player2);
    if (c.type === 'champion') {
        if (p1) out.player1 = p1;
        if (c.label) out.label = c.label;
        return out;
    }
    if (c.type === 'note') {
        if (c.text) out.text = c.text;
        return out;
    }
    if (p1) out.player1 = p1;
    if (p2) out.player2 = p2;
    if (c.games && c.games.length) out.games = c.games.slice();
    if (c.score) out.score = c.score;
    if (c.winner === 0 || c.winner === 1 || c.winner === 2) out.winner = c.winner;
    else if (st === 'final' && (c.winner === 1 || c.winner === 2)) out.winner = c.winner;
    if (c.status) out.status = c.status;
    if (c.time) out.time = c.time;
    if (c.venue) out.venue = c.venue;
    if (c.note) out.note = c.note;
    return out;
}

function dcCleanDraw(d) {
    if (!d || typeof d !== 'object') return null;
    const out = { id: d.id, version: DRAWS_VERSION };
    if (d.competitionId) out.competitionId = d.competitionId;
    out.title = d.title || '';
    if (d.subtitle) out.subtitle = d.subtitle;
    if (d.roundLabels && Object.keys(d.roundLabels).length) {
        const rl = {};
        Object.keys(d.roundLabels).forEach(k => { if (d.roundLabels[k]) rl[k] = d.roundLabels[k]; });
        if (Object.keys(rl).length) out.roundLabels = rl;
    }
    if (d.layout && d.layout !== 'grid') out.layout = d.layout;
    const grid = {};
    const defs = DC_DEFAULT_GRID;
    ['cols', 'rows', 'cellWidth', 'cellHeight', 'gap', 'padX', 'padY'].forEach(k => {
        const v = _dcNum((d.grid || {})[k], defs[k]);
        if (v !== defs[k] || k === 'cols' || k === 'rows' || k === 'cellWidth' || k === 'cellHeight') grid[k] = v;
    });
    out.grid = grid;
    const theme = {};
    Object.keys(DC_DEFAULT_THEME).forEach(k => {
        const v = (d.theme || {})[k];
        if (v != null && v !== '' && v !== DC_DEFAULT_THEME[k]) theme[k] = v;
    });
    if (Object.keys(theme).length) out.theme = theme;
    out.cards = (d.cards || []).map(dcCleanCard).filter(Boolean);
    if (d.connections && d.connections.length) {
        out.connections = d.connections.map(cn => {
            const o = { from: cn.from, to: cn.to };
            if (cn.fromSide && cn.fromSide !== 'right') o.fromSide = cn.fromSide;
            if (cn.toSide && cn.toSide !== 'left') o.toSide = cn.toSide;
            if (cn.kind) o.kind = cn.kind;
            return o;
        });
    }
    return out;
}

function dcSerializeDraws(draws) {
    return JSON.stringify((draws || []).map(dcCleanDraw), null, 2) + '\n';
}

// ---------- 统计 ----------

function dcDrawStats(draw) {
    const cards = (draw && draw.cards) || [];
    let matches = 0, finished = 0, live = 0, pending = 0;
    cards.forEach(c => {
        if (c.type !== 'match') return;
        matches++;
        const st = dcMatchStatus(c);
        if (st === 'final') finished++;
        else if (st === 'live') live++;
        else pending++;
    });
    return { matches, finished, live, pending, cards: cards.length };
}

// 导出到全局（非 ES module 环境）
window.DRAWS_VERSION = DRAWS_VERSION;
window.dcNormalizeDraw = dcNormalizeDraw;
window.dcNormalizePlayer = dcNormalizePlayer;
window.dcParsePlayerName = dcParsePlayerName;
window.dcPlayerName = dcPlayerName;
window.dcComputeLayout = dcComputeLayout;
window.dcAnchorPoint = dcAnchorPoint;
window.dcConnectionPath = dcConnectionPath;
window.dcArrowPoints = dcArrowPoints;
window.dcAutoArrange = dcAutoArrange;
window.dcValidateDraw = dcValidateDraw;
window.dcPropagateWinners = dcPropagateWinners;
window.dcTemplateSingleElim = dcTemplateSingleElim;
window.dcTemplateGroups = dcTemplateGroups;
window.dcSeedOrder = dcSeedOrder;
window.dcCleanDraw = dcCleanDraw;
window.dcCleanCard = dcCleanCard;
window.dcSerializeDraws = dcSerializeDraws;
window.dcParseScore = dcParseScore;
window.dcMatchStatus = dcMatchStatus;
window.dcDrawStats = dcDrawStats;
window.dcEsc = dcEsc;
window.dcT = dcT;
window.dcNewId = dcNewId;
