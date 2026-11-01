/* ========================================
   opponent-network.js — 交手网络通用图（旧版视觉）
   力导向（Fruchterman–Reingold）布局 + 悬停高亮 / 标签避让 / 尚未交手带，
   视觉与数据规模页（data-scale.js 的 ds-net）同一套，供 WTT 数据可视化页复用。
   接口：OpponentNetwork.render(host, model, opts) / OpponentNetwork.destroy(host)
   model = {
       nodes: [{ uid, name, label, cls, deg, games, href, title }],
       edges: [{ a, b, w }],
       comps / isolated: 可省略（缺省时自动计算），
       maxDeg: Number,
       stats: [[value, label], ...],          // 已格式化
       cohorts: [{ label, cls, count }, ...], // 已格式化
       edgeKeyLabel, isolatedLabel, isolatedCaption?, hint, aria: String
   }
   opts = { tipNode(nd), tipEdge(e, a, b) }  自定义浮层 HTML（缺省用内置样式）
   ======================================== */
(function () {
    'use strict';

    var NET_PAD = 24, NET_LABEL_SIZE = 10.5;

    var states = [];
    var resizeTimer = null;
    var glowSeq = 0;

    /* ---------- 小工具 ---------- */

    function esc(v) {
        var s = String(v == null ? '' : v);
        if (typeof escapeHtml === 'function') return escapeHtml(s);
        return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }

    // 文本宽度估算：CJK 约 1em，其余约 0.56em
    function netTextWidth(s, size) {
        var w = 0;
        for (var i = 0; i < s.length; i++) w += s.charCodeAt(i) > 0x2e7f ? size : size * 0.56;
        return w;
    }

    function netNodeR(nd, maxDeg) {
        return 4 + 7 * Math.sqrt((nd.deg || 0) / (maxDeg || 1));
    }

    /* ---------- 模型补全 ---------- */

    function adjacencyOf(N) {
        var adj = {};
        N.nodes.forEach(function (_, i) { adj[i] = []; });
        (N.edges || []).forEach(function (e) {
            if (!adj[e.a] || !adj[e.b]) return;
            adj[e.a].push({ i: e.b, w: e.w || 1 });
            adj[e.b].push({ i: e.a, w: e.w || 1 });
        });
        Object.keys(adj).forEach(function (k) {
            adj[k].sort(function (a, b) { return b.w - a.w || a.i - b.i; });
        });
        return adj;
    }

    function completeModel(N) {
        // 节点级邻居表（与旧版 data-scale 的 buildGraph 同形：nodes[i].nb = [j…]），
        // 悬停高亮与悬停补名都读它；data-scale 自带的模型已带 nb，外部（WTT）模型在此补齐
        if (!N.nodes[0] || !N.nodes[0].nb) {
            N.nodes.forEach(function (nd) { nd.nb = []; });
            (N.edges || []).forEach(function (e) {
                if (!N.nodes[e.a] || !N.nodes[e.b]) return;
                if (N.nodes[e.a].nb.indexOf(e.b) < 0) N.nodes[e.a].nb.push(e.b);
                if (N.nodes[e.b].nb.indexOf(e.a) < 0) N.nodes[e.b].nb.push(e.a);
            });
        }
        if (!N.comps || !N.comps.length) {
            var adj = adjacencyOf(N), seen = {}, comps = [], isolated = [], maxDeg = N.maxDeg || 0;
            N.nodes.forEach(function (nd, i) {
                if (!nd.deg) { isolated.push(i); return; }
                if (nd.deg > maxDeg) maxDeg = nd.deg;
                if (seen[i]) return;
                seen[i] = 1;
                var stack = [i], comp = [];
                while (stack.length) {
                    var v = stack.pop();
                    comp.push(v);
                    (adj[v] || []).forEach(function (n) {
                        if (!seen[n.i]) { seen[n.i] = 1; stack.push(n.i); }
                    });
                }
                comps.push(comp);
            });
            comps.sort(function (a, b) { return b.length - a.length; });
            N.comps = comps; N.isolated = isolated; N.maxDeg = maxDeg;
        } else if (!N.isolated) {
            N.isolated = [];
            N.nodes.forEach(function (nd, i) { if (!nd.deg) N.isolated.push(i); });
        }
        // 展示度（加权）：度数打底，交手场次作平缓加成，决定“谁的标签最值钱”。
        // 缓存在 N 上，同一模型重复渲染（切语言 / 换 TopN 重算）不重复求值
        if (!N.showW) {
            var sw = N.nodes.map(function (nd) {
                return (nd.deg || 0) + Math.sqrt(Math.max(0, nd.games || 0)) * 0.5;
            });
            N.showW = sw;
        }
        return N;
    }

    /* ---------- 单个连通集团的力导向布局（世界坐标，尺寸交给外面统一缩放） ---------- */

    function netLayoutBlock(ids, N) {
        var n = ids.length;
        var local = {}, xs = [], ys = [], i;
        ids.forEach(function (gi, idx) { local[gi] = idx; });

        var kk = 42;
        for (i = 0; i < n; i++) {
            var a = i * 2.399963 + 0.9;
            var r0 = kk * Math.sqrt(i + 0.6);
            xs[i] = Math.cos(a) * r0;
            ys[i] = Math.sin(a) * r0;
        }

        var es = [];
        N.edges.forEach(function (e) {
            var a = local[e.a], b = local[e.b];
            if (a != null && b != null) es.push([a, b, e.w]);
        });

        var iters = Math.min(340, 160 + n * 4);
        var temp = kk * 1.5;
        for (var it = 0; it < iters; it++) {
            var dx = [], dy = [];
            for (i = 0; i < n; i++) { dx[i] = 0; dy[i] = 0; }
            for (i = 0; i < n; i++) {
                for (var j = i + 1; j < n; j++) {
                    var vx = xs[i] - xs[j], vy = ys[i] - ys[j];
                    var d2 = vx * vx + vy * vy;
                    if (d2 < 0.01) { vx = 0.11; vy = 0.07; d2 = 0.017; }
                    // 斥力用 1/d²（而不是 FR 的 1/d）：近处推得狠、远处迅速衰减，
                    // 中宫不会糊成一团，外围也不会被一个离群点顶得满画布飞
                    var d = Math.sqrt(d2), f = kk * kk * kk / d2;
                    // 远处的点不再互相排斥：否则 40 多个"只打过一两场"的边缘成员会
                    // 被整张图一起往外推，撑成一圈均匀的环，中宫反而被压扁
                    var cut = kk * 3.6;
                    if (d > cut) f *= Math.max(0, 1 - (d - cut) / (kk * 2.2));
                    dx[i] += vx / d * f; dy[i] += vy / d * f;
                    dx[j] -= vx / d * f; dy[j] -= vy / d * f;
                }
            }
            es.forEach(function (e) {
                var vx = xs[e[1]] - xs[e[0]], vy = ys[e[1]] - ys[e[0]];
                var d = Math.sqrt(vx * vx + vy * vy) || 0.01;
                // 交手越多的组合拉得越紧（有上限，避免一对 “老对手” 把两个人粘死）
                var f = Math.min(d * d / kk, kk * 0.85) * 1.0 * (1 + 0.1 * Math.min(3, e[2] - 1));
                dx[e[0]] += vx / d * f; dy[e[0]] += vy / d * f;
                dx[e[1]] -= vx / d * f; dy[e[1]] -= vy / d * f;
            });
            for (i = 0; i < n; i++) {
                dx[i] -= xs[i] * 0.03;
                dy[i] -= ys[i] * 0.03;
                var dl = Math.sqrt(dx[i] * dx[i] + dy[i] * dy[i]) || 0.01;
                var step = Math.min(dl, temp);
                xs[i] += dx[i] / dl * step;
                ys[i] += dy[i] / dl * step;
            }
            temp *= 0.978;
        }

        // 尾部压缩：把外围收回到中宫旁边，长线变短线。
        // 之前用 pow(...,0.45) 是「单调压扁」，结果每个边缘成员的半径几乎相同，
        // 整张图变成一圈均匀的烟花；这里改成线性收缩 0.42，保留疏密差别
        var rad = [];
        for (i = 0; i < n; i++) rad.push(Math.sqrt(xs[i] * xs[i] + ys[i] * ys[i]));
        var sorted = rad.slice().sort(function (a, b) { return a - b; });
        var Rc = sorted[Math.max(0, Math.floor(sorted.length * 0.8) - 1)] || 1;
        for (i = 0; i < n; i++) {
            if (rad[i] > Rc) {
                var nr = Rc + (rad[i] - Rc) * 0.42;
                xs[i] *= nr / rad[i]; ys[i] *= nr / rad[i];
            }
        }

        var minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        for (i = 0; i < n; i++) {
            if (xs[i] < minX) minX = xs[i];
            if (xs[i] > maxX) maxX = xs[i];
            if (ys[i] < minY) minY = ys[i];
            if (ys[i] > maxY) maxY = ys[i];
        }
        return {
            ids: ids, xs: xs, ys: ys, minX: minX, minY: minY,
            w: Math.max(1, maxX - minX), h: Math.max(1, maxY - minY)
        };
    }

    // 圆点半径是固定像素值，缩放之后会有点挨得过近：在像素空间把它们互相推开
    function netSpreadNodes(N, pos, ids, maxDeg, rounds) {
        var margin = 11;
        var total = 0;
        for (var it = 0; it < rounds * 24; it++) {
            var moved = 0;
            for (var i = 0; i < ids.length; i++) {
                var a = ids[i], pa = pos[a];
                if (!pa) continue;
                var ra = netNodeR(N.nodes[a], maxDeg);
                for (var j = i + 1; j < ids.length; j++) {
                    var b = ids[j], pb = pos[b];
                    if (!pb) continue;
                    var need = ra + netNodeR(N.nodes[b], maxDeg) + margin;
                    var vx = pb.x - pa.x, vy = pb.y - pa.y;
                    var d = Math.sqrt(vx * vx + vy * vy);
                    if (d >= need) continue;
                    if (d < 0.01) { vx = 0.83; vy = 0.56; d = 1; }   // 完全重合时挑一个固定方向
                    var push = (need - d) * 0.5;
                    pa.x -= vx / d * push; pa.y -= vy / d * push;
                    pb.x += vx / d * push; pb.y += vy / d * push;
                    moved++;
                }
            }
            total += moved;
            if (!moved) break;
        }
        return total;
    }

    // 把图整体收进画布（只缩不放）并居中，返回实际缩放比例
    function netFitToBox(pos, ids, x0, x1, y0, y1) {
        var minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        ids.forEach(function (gi) {
            var p = pos[gi];
            if (!p) return;
            if (p.x < minX) minX = p.x;
            if (p.x > maxX) maxX = p.x;
            if (p.y < minY) minY = p.y;
            if (p.y > maxY) maxY = p.y;
        });
        if (minX === Infinity) return 1;
        var s = Math.min(1, (x1 - x0) / Math.max(1, maxX - minX), (y1 - y0) / Math.max(1, maxY - minY));
        var cx = (minX + maxX) / 2, cy = (minY + maxY) / 2;
        var tx = (x0 + x1) / 2, ty = (y0 + y1) / 2;
        ids.forEach(function (gi) {
            var p = pos[gi];
            if (!p) return;
            p.x = tx + (p.x - cx) * s;
            p.y = ty + (p.y - cy) * s;
        });
        return s;
    }

    /* ---------- 标签引擎（两轮分配） ----------
       静态阶段：按展示度（加权度）从高到低，每个名字在 8 个候选位里选总分最低的，
                 同位冲突看谁更值钱——分高者占位、分低者换位或放弃；
                 一轮走完把「位子被抢」的再补一轮，仍放不下的走悬停兜底。
       悬停阶段：H1 缩小半径解锁空隙、H2 压扁重叠候选、H3 放弃 8px 外框约束，
                 分数容忍度逐步放宽，直到把热门邻居的名字尽量放出来。 */

    function netLabelBox(s, wpx) {
        var x0 = s[2] === 'start' ? s[0] : s[2] === 'end' ? s[0] - wpx : s[0] - wpx / 2;
        return { x0: x0, y0: s[1] - 10.5, x1: x0 + wpx, y1: s[1] + 5.5, sx: s[0], sy: s[1], anchor: s[2] };
    }

    function netBoxOverlap(a, b) {
        var ox = Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0);
        var oy = Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0);
        return (ox > 0 && oy > 0) ? ox * oy : 0;
    }

    // 单个候选位的代价。语义分层：名字压名字（obst）是硬伤——悬停直接出局、静态天价；
    // 名字擦到点上按 cfg.nodePenalty 计价（标签有白描边光晕，压到点上也清晰可读，容忍度远高于压字）
    function netSlotScore(box, gi, pos, ctx, cfg) {
        var score = 0;
        for (var k = 0; k < ctx.obst.length; k++) {
            var ov = netBoxOverlap(box, ctx.obst[k]);
            if (!ov) continue;
            if (cfg.labelHard) return -1;
            score += ov * 3 + 100;
        }
        for (var m = 0; m < ctx.nodesIdx.length; m++) {
            var oi = ctx.nodesIdx[m];
            if (oi === gi) continue;
            var op = pos[oi];
            if (!op) continue;
            var orx = netNodeR(ctx.N.nodes[oi], ctx.maxDeg);
            var o = netBoxOverlap(box, { x0: op.x - orx, x1: op.x + orx, y0: op.y - orx, y1: op.y + orx });
            if (!o) continue;
            score += o * cfg.nodePenalty * ((ctx.showW[oi] || 0) >= (ctx.showW[gi] || 0) ? 1 : 0.5);
        }
        if (!cfg.allowOutside && (box.x0 < 3 || box.x1 > ctx.W - 3 || box.y0 < 2 || box.y1 > ctx.H - 2)) return -1;
        if (ctx.bias) {
            var p = pos[gi];
            var lvx = box.sx - p.x, lvy = box.sy - p.y;
            var lvl = Math.sqrt(lvx * lvx + lvy * lvy);
            var ovx = p.x - ctx.cx, ovy = p.y - ctx.cy;
            var ovl = Math.sqrt(ovx * ovx + ovy * ovy);
            if (lvl > 0.01 && ovl > 1) {
                // 与「向外」方向一致的位置更划算（权重小于压住别的字，只作倾向）
                score += (1 - (lvx * ovx + lvy * ovy) / (lvl * ovl)) * 7;
            }
        }
        return score;
    }

    // 8 个候选位，参数化：rMul 缩小避让半径（悬停时解锁点旁空隙）
    function netSlotsFor(p, r, rMul) {
        var rr = r * rMul;
        return [
            [p.x + rr + 6, p.y, 'start'],
            [p.x - rr - 6, p.y, 'end'],
            [p.x, p.y - rr - 7, 'middle'],
            [p.x, p.y + rr + 13, 'middle'],
            [p.x + rr * 0.7 + 3, p.y - rr * 0.8, 'start'],
            [p.x - rr * 0.7 - 3, p.y - rr * 0.8, 'end'],
            [p.x + rr * 0.7 + 3, p.y + rr * 0.8 + 7, 'start'],
            [p.x - rr * 0.7 - 3, p.y + rr * 0.8 + 7, 'end']
        ];
    }

    function netLabelCtx(N, pos, obst, W, H) {
        var cx = 0, cy = 0, cn = 0;
        var idx = [];
        pos.forEach(function (q, i) {
            if (!q) return;
            idx.push(i);
            cx += q.x; cy += q.y; cn++;
        });
        return {
            N: N, pos: pos, obst: obst || [], out: [], W: W, H: H,
            maxDeg: N.maxDeg || 1, showW: N.showW || N.nodes.map(function () { return 0; }),
            nodesIdx: idx,
            cx: cn ? cx / cn : W / 2, cy: cn ? cy / cn : H / 2,
            bias: cn > 8
        };
    }

    // 为一个名字找位置：返回 {box, score, text} 或 null。ctx.mode = 'static' | 'hover'
    // 静态一轮：不压字、少压点、不出画，分数 > cap 交悬停兜底；
    // 悬停四档逐步放宽（S1 正常 → S2 缩半径解锁点旁空隙 → S3 出画框 → S4 允许压点），
    // 任何档位都绝不压已放置的名字
    function netFindSlot(N, pos, gi, ctx) {
        var nd = N.nodes[gi], p = pos[gi];
        if (!nd || !p) return null;
        var txt = nd.label || nd.name || '';
        var wpx = netTextWidth(txt, NET_LABEL_SIZE) + 2;
        var r = netNodeR(nd, ctx.maxDeg);
        var hover = ctx.mode === 'hover';

        var attempts = hover ? [
            { rMul: 1.0, allowOutside: false, nodePenalty: 1, labelHard: true, cap: 40 },
            { rMul: 0.55, allowOutside: false, nodePenalty: 0.35, labelHard: true, cap: 90 },
            { rMul: 1.0, allowOutside: true, nodePenalty: 0.35, labelHard: true, cap: 90 },
            { rMul: 0.45, allowOutside: true, nodePenalty: 0.12, labelHard: true, cap: 260 }
        ] : [
            { rMul: 1.0, allowOutside: false, nodePenalty: 1, labelHard: true, cap: 40 }
        ];

        for (var a = 0; a < attempts.length; a++) {
            var cfg = attempts[a];
            var slots = netSlotsFor(p, r, cfg.rMul);
            var best = null, bestScore = Infinity;
            for (var i = 0; i < slots.length; i++) {
                var box = netLabelBox(slots[i], wpx);
                var sc = netSlotScore(box, gi, pos, ctx, cfg);
                if (sc < 0) continue;
                if (sc < bestScore) { bestScore = sc; best = box; }
            }
            if (best && bestScore <= cfg.cap) {
                best.gi = gi;
                return { box: best, score: bestScore, text: txt };
            }
        }
        return null;
    }

    // 两轮静态分配：第一轮按展示度占位；第二轮给「位子被抢」的再试一次，
    // 他们此时会考虑剩下的空位（先放的已经写进 ctx.obst，冲突代价会自然变高）。
    // 超出 labelLimit 的直接跳过——大 N 时不做无用功
    function netPlaceLabels(N, pos, W, H, labelLimit) {
        var ctx = netLabelCtx(N, pos, [], W, H);
        ctx.mode = 'static';
        var order = ctx.nodesIdx.slice().sort(function (a, b) {
            return (N.showW[b] || 0) - (N.showW[a] || 0) || a - b;
        });

        var boxes = [], placed = {}, retry = [], shown = 0;
        order.forEach(function (gi) {
            if (labelLimit && shown >= labelLimit) return;
            var r = netFindSlot(N, pos, gi, ctx);
            if (r) {
                ctx.obst.push(r.box);
                boxes.push(r.box); placed[gi] = r; shown++;
            } else {
                retry.push(gi);
            }
        });
        // 二轮：失败者按「占用最少的位」重试一遍 —— 一轮里的障碍是逐步积累的，
        // 某些失败只是「当时恰好挤」，全队列走完后可能已经让出空间
        var retry2 = [];
        retry.forEach(function (gi) {
            if (labelLimit && shown >= labelLimit) return;
            var r = netFindSlot(N, pos, gi, ctx);
            if (r) { ctx.obst.push(r.box); boxes.push(r.box); placed[gi] = r; shown++; }
            else retry2.push(gi);
        });
        retry2.forEach(function (gi) {
            if (labelLimit && shown >= labelLimit) return;
            var r = netFindSlot(N, pos, gi, ctx);
            if (r) { ctx.obst.push(r.box); boxes.push(r.box); placed[gi] = r; shown++; }
        });

        Object.keys(placed).forEach(function (gi) {
            var r = placed[gi];
            ctx.out.push('<text class="oppnet-lab" data-l="' + gi +
                '" x="' + r.box.sx.toFixed(1) + '" y="' + r.box.sy.toFixed(1) +
                '" text-anchor="' + r.box.anchor + '" dominant-baseline="middle">' + esc(r.text) + '</text>');
        });
        return { html: ctx.out.join(''), boxes: boxes };
    }

    // 悬停：邻居按展示度排队，三阶段逐步放宽约束（缩小避让半径 → 允许压扁重叠 → 放弃外框），
    // 每个名字独立选最优位；放不下的宁可不放，绝不叠字
    function netHoverLabels(N, pos, i, staticBoxes, W, H) {
        var ctx = netLabelCtx(N, pos, staticBoxes.slice(), W, H);
        ctx.mode = 'hover';
        var done = {}, n = 0;
        staticBoxes.forEach(function (b) { done[b.gi] = 1; });
        var order = (N.nodes[i].nb || []).slice().sort(function (a, b) {
            return (N.showW[b] || 0) - (N.showW[a] || 0) || a - b;
        });
        for (var k = 0; k < order.length && n < 14; k++) {
            var gi = order[k];
            if (done[gi]) continue;
            var r = netFindSlot(N, pos, gi, ctx);
            if (r) {
                ctx.obst.push(r.box);
                ctx.out.push('<text class="oppnet-lab is-hot-lab" data-l="' + gi +
                    '" x="' + r.box.sx.toFixed(1) + '" y="' + r.box.sy.toFixed(1) +
                    '" text-anchor="' + r.box.anchor + '" dominant-baseline="middle">' + esc(r.text) + '</text>');
                n++;
            }
        }
        return ctx.out.join('');
    }

    /* ---------- 绘制 ---------- */

    function draw(host, st) {
        var N = st.model, opts = st.opts || {};
        var W = Math.max(240, Math.round(host.clientWidth || 320));
        st.lastW = host.clientWidth || W;
        var narrow = W < 520;

        completeModel(N);
        if (!N.comps.length || N.comps[0].length < 2) {
            host.innerHTML = '<div class="oppnet-empty">' + esc(opts.emptyText || '') + '</div>';
            return;
        }

        var maxDeg = N.maxDeg || 1;
        var maxEdgeW = 1;
        N.edges.forEach(function (e) { if (e.w > maxEdgeW) maxEdgeW = e.w; });
        var wLog = Math.log(1 + maxEdgeW) || 1;
        var maxR = netNodeR({ deg: maxDeg }, maxDeg);

        // 每个连通集团各自布局（世界坐标），再并排摆开、缩放到画布内
        var blocks = N.comps.map(function (comp) { return netLayoutBlock(comp, N); });
        var gap = 44, totalW = 0, maxH = 1;
        blocks.forEach(function (b) {
            totalW += b.w;
            if (b.h > maxH) maxH = b.h;
        });
        totalW += gap * Math.max(0, blocks.length - 1);

        var cursor = 0;
        blocks.forEach(function (b) {
            b.dx = cursor - b.minX;
            b.dy = (maxH - b.h) / 2 - b.minY;
            cursor += b.w + gap;
        });

        var pad = NET_PAD + maxR;
        var availW = Math.max(60, W - 2 * pad);
        // 画布高度按布局自身的宽高比来定（力导向没有唯一正确的长宽比）：
        // 布局偏窄就给它方一点的画布，偏宽就压扁一点，别硬塞进固定高度里把点挤在一起
        var aspect = totalW / Math.max(1, maxH);
        var targetAspect = Math.max(1.05, Math.min(narrow ? 1.2 : 1.95, aspect));
        var graphH = Math.round(Math.max(narrow ? 300 : 340,
            Math.min(narrow ? 520 : 700, W / targetAspect)));
        var availH = Math.max(60, graphH - 2 * pad);

        // 横向允许有限度拉伸把卡片用满；超过上限就保持等比、左右留白
        var k = Math.min(availW / totalW, availH / maxH);
        var kx = k * Math.min(availW / totalW / k, 1.45);
        var ky = k * Math.min(availH / maxH / k, 1.45);
        var ox = (W - totalW * kx) / 2;
        var oy = (graphH - maxH * ky) / 2;

        var pos = [], graphIds = [];
        blocks.forEach(function (b) {
            b.ids.forEach(function (gi, i) {
                pos[gi] = { x: ox + (b.dx + b.xs[i]) * kx, y: oy + (b.dy + b.ys[i]) * ky };
                graphIds.push(gi);
            });
        });

        // 推开 ↔ 收回：单次「推开再缩放」会把刚推出来的间距又按比例压回去，
        // 所以反复几轮，直到这一次完全不用再缩（s≈1）为止
        for (var cyc = 0; cyc < 8; cyc++) {
            netSpreadNodes(N, pos, graphIds, maxDeg, 4);
            if (netFitToBox(pos, graphIds, pad, W - pad, pad, graphH - pad) > 0.999) break;
        }

        // 图下方的虚线框：一条边都没有的成员排成若干行，不参与上面那张网
        var bandItems = N.isolated.map(function (gi) {
            var nd = N.nodes[gi];
            var nm = nd.label || nd.name || '';
            return { gi: gi, name: nm, w: 10 + netTextWidth(nm, NET_LABEL_SIZE) };
        });
        var bandTop = graphH + 14, rowH = 24;
        var bandX = NET_PAD + 16, bandMaxX = W - NET_PAD - 16;
        var bx = bandX, by = 0, rows = 0;
        bandItems.forEach(function (it) {
            if (!rows) rows = 1;
            if (bx + it.w > bandMaxX && bx > bandX) { bx = bandX; by += rowH; rows++; }
            it.x = bx; it.y = by;
            bx += it.w + 18;
        });
        var bandH = bandItems.length ? 50 + (rows - 1) * rowH : 0;
        var H = bandItems.length ? bandTop + bandH + 8 : graphH;

        // 边：细的（交手少的）先画，粗的压在上面
        var edgeHtml = '', hitHtml = '';
        N.edges.map(function (e, i) { return i; })
            .sort(function (a, b) { return N.edges[a].w - N.edges[b].w; })
            .forEach(function (i) {
                var e = N.edges[i], pa = pos[e.a], pb = pos[e.b];
                if (!pa || !pb) return;
                var d = 'M' + pa.x.toFixed(1) + ' ' + pa.y.toFixed(1) + 'L' + pb.x.toFixed(1) + ' ' + pb.y.toFixed(1);
                var lw = 0.9 + 2.4 * Math.log(1 + e.w) / wLog;
                var lo = 0.05 + 0.5 * Math.log(1 + e.w) / wLog;
                edgeHtml += '<path class="oppnet-edge" data-k="' + i + '" d="' + d +
                    '" stroke-width="' + lw.toFixed(2) + '" stroke-opacity="' + lo.toFixed(2) + '"/>';
                hitHtml += '<path class="oppnet-hit" data-e="' + i + '" d="' + d + '"/>';
            });

        var nodeHtml = graphIds.slice().sort(function (a, b) {
            return (N.nodes[a].deg || 0) - (N.nodes[b].deg || 0);
        }).map(function (gi) {
            var nd = N.nodes[gi], p = pos[gi], r = netNodeR(nd, maxDeg);
            var title = nd.title || nd.label || nd.name || '';
            return '<a class="oppnet-g" data-n="' + gi + '" href="' + esc(nd.href || '#') + '" tabindex="0">' +
                '<circle class="oppnet-ring" cx="' + p.x.toFixed(1) + '" cy="' + p.y.toFixed(1) + '" r="' + (r + 3.6).toFixed(1) + '"/>' +
                '<circle class="oppnet-node ' + esc(nd.cls || 'oppnet-cx') + '" cx="' + p.x.toFixed(1) +
                '" cy="' + p.y.toFixed(1) + '" r="' + r.toFixed(1) + '"/>' +
                '<title>' + esc(title) + '</title></a>';
        }).join('');

        // 静态标签数随画布宽度和节点数自适应：宽画布 / 大 N 多放一些，其余靠悬停补
        var labelLimit = Math.round(Math.max(10, Math.min(narrow ? 14 : 28,
            (W / 55) * (N.nodes.length > 80 ? 1.25 : 1))));
        var placed = netPlaceLabels(N, pos, W, graphH, labelLimit);
        var labelHtml = placed.html;

        var bandHtml = '';
        if (bandItems.length) {
            var bandCap = opts.isolatedCaption || N.isolatedCaption || N.isolatedLabel || '';
            bandHtml = '<rect class="oppnet-band" x="' + NET_PAD + '" y="' + bandTop +
                '" width="' + (W - 2 * NET_PAD) + '" height="' + bandH + '" rx="12"/>' +
                '<text class="oppnet-band-cap" x="' + (NET_PAD + 16) + '" y="' + (bandTop + 19) + '">' +
                esc(bandCap) + '</text>' +
                bandItems.map(function (it) {
                    var nd = N.nodes[it.gi], p = { x: it.x, y: bandTop + 38 + it.y };
                    pos[it.gi] = p;
                    var title = nd.title || nd.label || nd.name || '';
                    return '<a class="oppnet-g" data-n="' + it.gi + '" href="' + esc(nd.href || '#') + '" tabindex="0">' +
                        '<circle class="oppnet-ring" cx="' + p.x.toFixed(1) + '" cy="' + p.y.toFixed(1) + '" r="8"/>' +
                        '<circle class="oppnet-node ' + esc(nd.cls || 'oppnet-cx') + '" cx="' + p.x.toFixed(1) +
                        '" cy="' + p.y.toFixed(1) + '" r="4.2"/>' +
                        '<text class="oppnet-band-name" x="' + (p.x + 9).toFixed(1) + '" y="' + p.y.toFixed(1) +
                        '" dominant-baseline="middle">' + esc(it.name) + '</text>' +
                        '<title>' + esc(title) + '</title></a>';
                }).join('');
        }

        // 光晕跟着主集团最终位置走（取实际落点，缩放/推开之后的坐标）
        var gMinX = Infinity, gMinY = Infinity, gMaxX = -Infinity, gMaxY = -Infinity;
        N.comps[0].forEach(function (gi) {
            var p = pos[gi];
            if (!p) return;
            if (p.x < gMinX) gMinX = p.x;
            if (p.x > gMaxX) gMaxX = p.x;
            if (p.y < gMinY) gMinY = p.y;
            if (p.y > gMaxY) gMaxY = p.y;
        });
        var gx = (gMinX + gMaxX) / 2, gy = (gMinY + gMaxY) / 2;
        var glowId = 'oppnetGlow' + (++glowSeq);
        var glow = '<circle class="oppnet-glow" cx="' + gx.toFixed(1) + '" cy="' + gy.toFixed(1) + '" r="' +
            (Math.max(gMaxX - gMinX, gMaxY - gMinY) * 0.62 + 90).toFixed(1) + '" fill="url(#' + glowId + ')"/>';

        host.innerHTML = '<div class="oppnet">' +
            '<div class="oppnet-stage">' +
            '<div class="oppnet-tip" aria-hidden="true"></div>' +
            '<svg class="oppnet-svg" viewBox="0 0 ' + W + ' ' + H + '" width="' + W + '" height="' + H +
            '" role="group" aria-label="' + esc(N.aria || '') + '">' +
            '<defs><radialGradient id="' + glowId + '">' +
            '<stop offset="0%" style="stop-color:var(--accent-blue);stop-opacity:.12"/>' +
            '<stop offset="100%" style="stop-color:var(--accent-blue);stop-opacity:0"/>' +
            '</radialGradient></defs>' +
            glow + bandHtml +
            '<g class="oppnet-edges">' + edgeHtml + '</g>' +
            '<g class="oppnet-hits">' + hitHtml + '</g>' +
            '<g class="oppnet-nodes">' + nodeHtml + '</g>' +
            '<g class="oppnet-labels">' + labelHtml + '</g>' +
            '</svg></div>' +
            railHtml(N, opts) + '</div>';

        netWire(host.querySelector('.oppnet-svg'), host, st, pos, placed.boxes, W, graphH);
    }

    function railHtml(N, opts) {
        var statHtml = (N.stats || []).map(function (s) {
            return '<div class="oppnet-stat"><span class="oppnet-stat-v">' + esc(s[0]) +
                '</span><span class="oppnet-stat-l">' + esc(s[1]) + '</span></div>';
        }).join('');

        var legend = (N.cohorts || []).map(function (c) {
            return '<li><span class="oppnet-swatch ' + esc(c.cls || 'oppnet-cx') + '"></span>' +
                '<span>' + esc(c.label) + '</span><em>' + esc(c.count) + '</em></li>';
        }).join('');

        var keys = '<div class="oppnet-keys">' +
            '<span class="oppnet-key"><svg width="30" height="12" viewBox="0 0 30 12" aria-hidden="true">' +
            '<line x1="1" y1="2" x2="29" y2="2" stroke-width="1"/>' +
            '<line x1="1" y1="6" x2="29" y2="6" stroke-width="2"/>' +
            '<line x1="1" y1="10" x2="29" y2="10" stroke-width="3"/></svg>' +
            esc(N.edgeKeyLabel || '') + '</span>' +
            ((N.isolated && N.isolated.length) ? '<span class="oppnet-key"><span class="oppnet-dash" aria-hidden="true"></span>' +
                esc(N.isolatedLabel || '') + '</span>' : '') +
            '</div>';

        return '<aside class="oppnet-rail">' + statHtml +
            (legend ? '<ul class="oppnet-legend">' + legend + '</ul>' : '') +
            (N.edgeKeyLabel ? keys : '') +
            (N.hint ? '<p class="oppnet-hint">' + esc(N.hint) + '</p>' : '') +
            '</aside>';
    }

    /* ---------- 悬停：高亮一位成员的整圈交手，其余压暗；悬停一条边看这组对手打了几场 ---------- */

    function netWire(svg, host, st, pos, labelBoxes, W, H) {
        if (!svg) return;
        var N = st.model, opts = st.opts || {};
        var tip = host.querySelector('.oppnet-tip');
        var labGroup = svg.querySelector('.oppnet-labels');
        var nodeEls = [].slice.call(svg.querySelectorAll('[data-n]'));
        var lineEls = [].slice.call(svg.querySelectorAll('.oppnet-edge'));
        var labEls = [].slice.call(svg.querySelectorAll('.oppnet-lab'));
        var nodeByI = [], lineByK = [], labByI = [];
        nodeEls.forEach(function (el) { nodeByI[+el.getAttribute('data-n')] = el; });
        lineEls.forEach(function (el) { lineByK[+el.getAttribute('data-k')] = el; });
        labEls.forEach(function (el) { labByI[+el.getAttribute('data-l')] = el; });

        var hot = null;

        var tipBox = null;
        function placeTip(px, py) {
            // 位置要变，先把上一处「被浮层压住」的名字放出来
            if (labGroup) {
                var prev = labGroup.querySelectorAll('.is-under-tip');
                for (var q = 0; q < prev.length; q++) prev[q].classList.remove('is-under-tip');
            }
            var w = host.clientWidth || 320;
            var tw = tip.offsetWidth || 180, th = tip.offsetHeight || 44;
            // 让开光标底下的那个点：默认放右上，靠边就翻到左边 / 下面
            var x = px + 16;
            if (x + tw > w - 6) x = px - 16 - tw;
            if (x < 6) x = 6;
            var below = py - 12 - th < 6;
            var y = below ? py + 16 : py - 12;
            tip.style.transform = 'translate(' + x.toFixed(1) + 'px,' + y.toFixed(1) + 'px) translate(0,' +
                (below ? '0' : '-100%') + ')';
            // 记下浮层占的方块，下面用它让开成员名字
            tipBox = { x0: x, x1: x + tw, y0: below ? y : y - th, y1: below ? y + th : y };
        }
        // 浮层底下压着的名字先藏起来，等移开再露出来（名字比标签重要）
        function hideUnderTip() {
            if (!labGroup || !tipBox) return;
            var els = [].slice.call(labGroup.querySelectorAll('.oppnet-lab'));
            els.forEach(function (el) {
                if (el.classList.contains('is-self')) return;
                var b;
                try { b = el.getBBox(); } catch (err) { return; }
                if (b.width <= 0) return;
                if (b.x + b.width > tipBox.x0 - 3 && b.x < tipBox.x1 + 3 &&
                    b.y + b.height > tipBox.y0 - 3 && b.y < tipBox.y1 + 3) {
                    el.classList.add('is-under-tip');
                }
            });
        }
        function showTip(html, px, py) {
            tip.innerHTML = html;
            tip.classList.add('is-on');
            placeTip(px, py);
            hideUnderTip();
        }
        function nodeTipHtml(nd) {
            if (opts.tipNode) return opts.tipNode(nd);
            return '<b>' + esc(nd.label || nd.name || '') + '</b>' +
                (nd.title ? '<span>' + esc(nd.title) + '</span>' : '');
        }
        function edgeTipHtml(e, a, b) {
            if (opts.tipEdge) return opts.tipEdge(e, a, b);
            var la = (a && (a.label || a.name)) || '', lb = (b && (b.label || b.name)) || '';
            return '<b>' + esc(la) + ' × ' + esc(lb) + '</b><span>' + esc(e.w) + '</span>';
        }
        function clear() {
            if (!hot) return;
            hot = null;
            svg.classList.remove('is-focus');
            nodeEls.forEach(function (el) { el.classList.remove('is-hot', 'is-near'); });
            lineEls.forEach(function (el) { el.classList.remove('is-hot'); });
            labEls.forEach(function (el) { el.classList.remove('is-near', 'is-self', 'is-under-tip'); });
            // 悬停时临时补的名字整批撤掉
            if (labGroup) {
                var dyn = labGroup.querySelectorAll('.is-hot-lab');
                for (var d = 0; d < dyn.length; d++) dyn[d].parentNode.removeChild(dyn[d]);
            }
            tip.classList.remove('is-on');
        }
        function focusNode(i, px, py) {
            if (hot && hot.t === 'n' && hot.i === i) { placeTip(px, py); hideUnderTip(); return; }
            clear();
            hot = { t: 'n', i: i };
            svg.classList.add('is-focus');
            if (nodeByI[i]) nodeByI[i].classList.add('is-hot');
            (N.nodes[i].nb || []).forEach(function (j) { if (nodeByI[j]) nodeByI[j].classList.add('is-near'); });
            // 自己的名字让给浮层显示（否则浮层刚好压在同一串字上）
            if (labByI[i]) labByI[i].classList.add('is-self');
            (N.nodes[i].nb || []).forEach(function (j) { if (labByI[j]) labByI[j].classList.add('is-near'); });
            for (var k = 0; k < N.edges.length; k++) {
                var e = N.edges[k];
                if ((e.a === i || e.b === i) && lineByK[k]) lineByK[k].classList.add('is-hot');
            }
            // 邻居里没有静态名字的，临时补上（放不下就不放，宁可少标也不叠字）
            if (labGroup && labelBoxes) {
                labGroup.insertAdjacentHTML('beforeend', netHoverLabels(N, pos, i, labelBoxes, W, H));
            }
            showTip(nodeTipHtml(N.nodes[i]), px, py);
        }
        function focusEdge(i, px, py) {
            if (hot && hot.t === 'e' && hot.i === i) { placeTip(px, py); hideUnderTip(); return; }
            clear();
            hot = { t: 'e', i: i };
            svg.classList.add('is-focus');
            var e = N.edges[i];
            if (lineByK[i]) lineByK[i].classList.add('is-hot');
            if (nodeByI[e.a]) nodeByI[e.a].classList.add('is-hot');
            if (nodeByI[e.b]) nodeByI[e.b].classList.add('is-hot');
            if (labByI[e.a]) labByI[e.a].classList.add('is-near');
            if (labByI[e.b]) labByI[e.b].classList.add('is-near');
            showTip(edgeTipHtml(e, N.nodes[e.a], N.nodes[e.b]), px, py);
        }
        function hitTarget(ev) {
            var el = ev.target;
            return (el && el.closest) ? el.closest('[data-n],[data-e]') : null;
        }
        svg.addEventListener('pointermove', function (ev) {
            var el = hitTarget(ev);
            var rect = host.getBoundingClientRect();
            var px = ev.clientX - rect.left, py = ev.clientY - rect.top;
            if (!el) { clear(); return; }
            var ni = el.getAttribute('data-n');
            if (ni != null) { focusNode(+ni, px, py); return; }
            var ei = el.getAttribute('data-e');
            if (ei != null) focusEdge(+ei, px, py);
        });
        svg.addEventListener('pointerleave', clear);
        svg.addEventListener('focusin', function (ev) {
            var el = hitTarget(ev);
            if (!el) return;
            var ni = el.getAttribute('data-n');
            if (ni == null) return;
            var p = pos[+ni] || { x: 80, y: 80 };
            focusNode(+ni, p.x, p.y + 4);
        });
        svg.addEventListener('focusout', clear);
    }

    /* ---------- 对外接口 ---------- */

    function findState(host) {
        for (var i = 0; i < states.length; i++) if (states[i].host === host) return states[i];
        return null;
    }

    function render(host, model, opts) {
        if (!host || !model || !model.nodes || !model.nodes.length) return;
        var st = findState(host);
        if (!st) { st = { host: host }; states.push(st); }
        st.model = model;
        st.opts = opts || {};
        draw(host, st);
    }

    function destroy(host) {
        for (var i = states.length - 1; i >= 0; i--) {
            if (states[i].host === host) states.splice(i, 1);
        }
    }

    function onResize() {
        if (resizeTimer) clearTimeout(resizeTimer);
        resizeTimer = setTimeout(function () {
            for (var i = states.length - 1; i >= 0; i--) {
                var st = states[i];
                if (!st.host.isConnected) { states.splice(i, 1); continue; }
                var w = st.host.clientWidth || 0;
                // 容器宽度变了才重画（手机转屏 / 侧栏收起），当作纯几何调整
                if (Math.abs(w - (st.lastW || 0)) >= 24) draw(st.host, st);
            }
        }, 160);
    }

    if (!states._bound) {
        window.addEventListener('resize', onResize);
        states._bound = true;
    }

    window.OpponentNetwork = { render: render, destroy: destroy };
})();
