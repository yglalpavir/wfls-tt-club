/* =====================================================================
 *  game-analytics.js — 本局 / 上一局 数据分析
 *  · 记录：发球方案、每板击球（正/反手 · 技术 · 球速 · 转速）、台内落点、每分结果
 *  · 展示：#statsOverlay > #anCard（白玻璃卡片，红=你 / 蓝=AI）
 *  · 打开面板时 main.js 会暂停仿真（isOpen()），关闭后继续
 *  · 只统计当前这一局；上一局在本局开始时归档
 *  · 斗蛐蛐（五局三胜）按「局」归档整轮 series：面板可逐局回看，直到 3 胜收尾
 * ===================================================================== */
'use strict';

const GAME_ANALYTICS = (() => {
  const MAX_POINTS = 400, MAX_HITS = 6000, MAX_BOUNCES = 3000;
  const MODES = ['push', 'lift', 'smash', 'counter', 'loop', 'block'];
  const MAX_GAMES = 5;   // 五局三胜 ⇒ 一轮最多 5 局

  let cur = null;        // 当前这一局
  let prev = null;       // 上一局（单打；begin() 时归档）
  let series = [];       // 斗蛐蛐本轮已结束的每一局（按局序，最多 MAX_GAMES）
  let view = 'cur';      // 'cur' | 'prev' | 数字（series 下标）
  let openFlag = false;
  let rally = null;      // 当前这一分：{server, top, side, startedAt, hits}

  const $id = id => document.getElementById(id);
  const now = () => (typeof elapsed === 'number' ? elapsed : 0);
  const isNum = v => Number.isFinite(v);
  const pct = (part, total) => (total ? (part / total) * 100 : 0);
  const fmt1 = v => (Number.isInteger(v) ? String(v) : v.toFixed(1));
  const unitRally = n => gameT(n === 1 ? 'g_an_unit_rally_1' : 'g_an_unit_rally');
  const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ESC[c]);

  /* 记录开关：菜单里的 AI 演示对局不进统计 */
  function recording(){ return typeof mode !== 'undefined' && mode !== 'menu'; }

  function newGame(){
    return {
      mode: (typeof mode !== 'undefined' ? mode : 'menu'),
      watch: (typeof mode !== 'undefined' && mode === 'watch'),
      ids: (typeof mode !== 'undefined' && mode === 'watch')
        ? { player: (typeof fightL !== 'undefined' ? fightL : ''),
            ai: (typeof fightR !== 'undefined' ? fightR : '') }
        : null,
      points: [],
      hits: [],
      bounces: [],
      over: false,
      result: null,
      startedAt: now(),
    };
  }

  /* 新的一局：把上一局归档（上一局有得分才保留）
     opts.newSeries = 新开一轮斗蛐蛐 ⇒ 整轮清空（上一轮的局不再可回看） */
  function begin(opts){
    opts = opts || {};
    if(cur && !cur.watch) series = [];   // 离开斗蛐蛐：整轮回看列表作废
    const wasWatch = !!(cur && cur.watch);
    if(opts.newSeries){
      series = [];
      prev = null;
    }else if(cur && cur.points.length){
      if(cur.watch){
        /* 斗蛐蛐：只有打完的局才算「一局」（中途 R 重置的半局不占据局号） */
        if(cur.over){
          series.push(cur);
          if(series.length > MAX_GAMES) series.shift();
        }
      }else{
        prev = cur;
      }
    }
    cur = newGame();
    /* 面板开着、正看着刚归档的这一局：跟着切到归档位，别让画面突然变空 */
    if(openFlag && view === 'cur' && !cur.points.length){
      if(wasWatch && series.length) view = series.length - 1;
      else if(prev && prev.points.length) view = 'prev';
    }
    if(view === 'prev' && (!prev || !prev.points.length)) view = 'cur';
    if(openFlag) render();
  }

  /* 当前展示的是哪一局 */
  function shownGame(){
    if(view === 'prev') return prev;
    if(typeof view === 'number' && series[view]) return series[view];
    return cur;
  }

  function serveSetup(server){
    if(!recording()) return;
    if(!cur) cur = newGame();
    rally = {
      server: server === 'ai' ? 'ai' : 'player',
      top: null,
      side: 0,
      startedAt: now(),
      hits: 0,
    };
  }

  function serveStrike(plan){
    if(!recording() || !cur) return;
    if(!rally){
      rally = { server: (typeof server !== 'undefined' ? server : 'player'), top: null,
                side: 0, startedAt: now(), hits: 0 };
    }
    rally.top = !(plan && plan.top === false);
    rally.side = (plan && plan.side) ? plan.side : 0;
    rally.startedAt = now();
    if(typeof ball !== 'undefined' && ball && ball.vel){
      const v = ball.vel;
      const sp = Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z) * 3.6;
      rally.serveSpeed = isNum(sp) ? sp : 0;
    }
  }

  /* 一板击球：球速 km/h + 相对转速 RPM + 出球位置 */
  function hit(side){
    if(!recording() || !cur || typeof ball === 'undefined' || !ball) return;
    const ls = ball.lastStroke || '';
    let stroke = 'forehand';
    if(ball.lastStrokeDetail === 'backhand' || ball.lastStrokeDetail === 'forehand'){
      stroke = ball.lastStrokeDetail;
    }else if(ls.indexOf('backhand') >= 0){
      stroke = 'backhand';
    }
    const v = ball.vel || { x: 0, y: 0, z: 0 };
    const speed = Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z) * 3.6;
    let spin = 0;
    if(typeof relTop === 'function'){
      const r = relTop();
      if(isNum(r)) spin = Math.abs(r) * 9.55;
    }
    const p = ball.pos || { x: 0, z: 0 };
    if(cur.hits.length < MAX_HITS){
      cur.hits.push({
        side: side === 'ai' ? 'ai' : 'player',
        stroke: stroke,
        mode: ball.lastMode || '',
        speed: isNum(speed) ? speed : 0,
        spin: isNum(spin) ? spin : 0,
        x: isNum(p.x) ? p.x : 0,
        z: isNum(p.z) ? p.z : 0,
        p: cur.points.length,
      });
    }
    if(rally) rally.hits++;
  }

  /* 台内落点（台外弹跳不记） */
  function bounce(x, z, by){
    if(!recording() || !cur) return;
    /* 只记回合进行中的弹跳：一分结束后球还在台上连弹，会把落点图刷成一团 */
    if(typeof state !== 'undefined' && state !== 'rally') return;
    if(typeof ballDead !== 'undefined' && ballDead) return;
    if(!isNum(x) || !isNum(z)) return;
    if(Math.abs(x) > TABLE_W / 2 + 0.03 || Math.abs(z) > TABLE_L / 2 + 0.03) return;
    if(cur.bounces.length < MAX_BOUNCES){
      cur.bounces.push({ x: x, z: z, side: by === 'ai' ? 'ai' : 'player' });
    }
  }

  /* 一分结束：scoreYou / scoreAi 已更新，rallyCount 仍是这一分的拍数 */
  function point(winner, msgKey){
    if(!recording() || !cur) return;
    const r = rally || {};
    const rec = {
      winner: winner === 'ai' ? 'ai' : 'player',
      reason: msgKey || 'g_msg_out',
      rally: Math.max(0, isNum(rallyCount) ? rallyCount : 0),
      py: isNum(scoreYou) ? scoreYou : 0,
      pa: isNum(scoreAi) ? scoreAi : 0,
      server: r.server || 'player',
      top: r.top !== false,
      side: r.side || 0,
      dur: Math.max(0, now() - (isNum(r.startedAt) ? r.startedAt : now())),
      hits: r.hits || 0,
      serveSpeed: isNum(r.serveSpeed) ? r.serveSpeed : 0,
    };
    if(cur.points.length < MAX_POINTS) cur.points.push(rec);
    rally = null;
    if(openFlag) render();
  }

  function gameOver(winner){
    if(!cur) return;
    cur.over = true;
    cur.result = winner === 'ai' ? 'ai' : 'player';
    if(openFlag) render();
  }

  /* ---------------- 展示 ---------------- */
  function nameOf(g, side, long){
    if(g && g.watch){
      const pre = gameT(side === 'player' ? 'g_left_prefix' : 'g_right_prefix');
      const id = g.ids && g.ids[side];
      const nm = (id && typeof modelLabel === 'function') ? modelLabel(id) : '';
      return long ? pre + nm : gameT(side === 'player' ? 'g_an_side_left' : 'g_an_side_right');
    }
    return gameT(side === 'player' ? (long ? 'g_name_you' : 'g_an_side_you')
                                   : (long ? 'g_name_ai' : 'g_an_side_ai'));
  }

  const chip = (label, n) => `<span class="an-chip">${esc(label)}<em>${n}</em></span>`;
  const sec = (titleKey, body, cls) =>
    `<section class="an-sec${cls ? ' ' + cls : ''}"><h3>${esc(gameT(titleKey))}</h3>${body}</section>`;

  function emptyMini(){ return '<span class="an-muted">—</span>'; }

  function emptyState(){
    return `<div class="an-empty">
      <div class="an-empty-ico">▦</div>
      <h3>${esc(gameT('g_an_empty_title'))}</h3>
      <p>${esc(gameT('g_an_empty_sub'))}</p>
    </div>`;
  }

  function renderRally(g){
    const buckets = [{ y: 0, a: 0 }, { y: 0, a: 0 }, { y: 0, a: 0 }, { y: 0, a: 0 }];
    g.points.forEach(p => {
      const n = p.rally;
      const i = n <= 2 ? 0 : n <= 4 ? 1 : n <= 6 ? 2 : 3;
      if(p.winner === 'player') buckets[i].y++; else buckets[i].a++;
    });
    const max = Math.max(1, ...buckets.map(b => b.y + b.a));
    return '<div class="an-buckets">' + buckets.map((b, i) => {
      const t = b.y + b.a;
      const h = (t / max) * 100;
      const yh = t ? (b.y / t) * 100 : 0;
      const ah = t ? (b.a / t) * 100 : 0;
      return `<div class="an-bucket">
        <span class="an-bucket-n">${t}</span>
        <div class="an-bucket-bar" style="height:${h.toFixed(1)}%">
          ${b.y ? `<i class="you" style="height:${yh.toFixed(1)}%"></i>` : ''}
          ${b.a ? `<i class="ai" style="height:${ah.toFixed(1)}%"></i>` : ''}
        </div>
        <span class="an-bucket-l">${esc(gameT('g_an_bucket' + (i + 1)))}</span>
      </div>`;
    }).join('') + '</div>';
  }

  function renderReasons(g){
    const map = new Map();
    g.points.forEach(p => {
      const k = p.reason || 'g_msg_out';
      const o = map.get(k) || { y: 0, a: 0 };
      if(p.winner === 'player') o.y++; else o.a++;
      map.set(k, o);
    });
    if(!map.size) return emptyMini();
    const rows = [...map.entries()]
      .sort((a, b) => (b[1].y + b[1].a) - (a[1].y + a[1].a))
      .slice(0, 8);
    return rows.map(([k, v]) => {
      const t = v.y + v.a;
      return `<div class="an-reason">
        <div class="an-reason-top"><span>${esc(gameT(k))}</span><b>${t}</b></div>
        <div class="an-bar"><i class="you" style="width:${pct(v.y, t).toFixed(1)}%"></i><i class="ai" style="width:${pct(v.a, t).toFixed(1)}%"></i></div>
      </div>`;
    }).join('');
  }

  function serveStats(g){
    const st = {
      player: { n: 0, w: 0, top: 0, back: 0, left: 0, right: 0 },
      ai:     { n: 0, w: 0, top: 0, back: 0, left: 0, right: 0 },
    };
    g.points.forEach(p => {
      const s = st[p.server === 'ai' ? 'ai' : 'player'];
      s.n++;
      if(p.winner === p.server) s.w++;
      if(p.top === false) s.back++; else s.top++;
      if(p.side > 0) s.left++;
      else if(p.side < 0) s.right++;
    });
    return st;
  }

  function renderServe(g){
    const st = serveStats(g);
    const col = side => {
      const s = st[side];
      const chips = [];
      if(s.top) chips.push(chip(gameT('g_serve_top'), s.top));
      if(s.back) chips.push(chip(gameT('g_serve_back'), s.back));
      if(s.left) chips.push(chip(gameT('g_serve_side_l'), s.left));
      if(s.right) chips.push(chip(gameT('g_serve_side_r'), s.right));
      return `<div>
        <div class="an-rowhead"><b class="${side}">${esc(nameOf(g, side, true))}</b>
          <span>${esc(gameT('g_an_serve_val', { n: s.n, w: s.w }))}</span></div>
        <div class="an-bar"><i class="${side}" style="width:${pct(s.w, s.n).toFixed(1)}%"></i></div>
        <div class="an-chips">${chips.join('') || emptyMini()}</div>
      </div>`;
    };
    return `<div class="an-cols">${col('player')}${col('ai')}</div>`;
  }

  function renderShots(g){
    const agg = {
      player: { n: 0, fh: 0, bh: 0, modes: {}, sum: 0, max: 0 },
      ai:     { n: 0, fh: 0, bh: 0, modes: {}, sum: 0, max: 0 },
    };
    g.hits.forEach(h => {
      const s = agg[h.side];
      if(!s) return;
      s.n++;
      if(h.stroke === 'backhand') s.bh++; else s.fh++;
      if(h.mode) s.modes[h.mode] = (s.modes[h.mode] || 0) + 1;
      s.sum += h.speed;
      s.max = Math.max(s.max, h.speed);
    });
    const col = side => {
      const s = agg[side];
      if(!s.n){
        return `<div><div class="an-rowhead"><b class="${side}">${esc(nameOf(g, side, true))}</b><span>0</span></div>${emptyMini()}</div>`;
      }
      const chips = [
        chip(gameT('g_an_fh'), s.fh),
        chip(gameT('g_an_bh'), s.bh),
      ].concat(MODES.filter(m => s.modes[m]).map(m => chip(gameT('g_an_mode_' + m), s.modes[m])));
      return `<div>
        <div class="an-rowhead"><b class="${side}">${esc(nameOf(g, side, true))}</b>
          <span>${s.n} ${esc(unitRally(s.n))}</span></div>
        <div class="an-chips">${chips.join('')}</div>
        <div class="an-shot-foot">
          <span>${esc(gameT('g_an_avg_speed', { v: (s.sum / s.n).toFixed(0) }))}</span>
          <span>${esc(gameT('g_an_max_speed', { v: s.max.toFixed(0) }))}</span>
        </div>
      </div>`;
    };
    return `<div class="an-cols">${col('player')}${col('ai')}</div>`;
  }

  function timelineSvg(g){
    const pts = g.points;
    const W = 340, H = 96, padX = 8, padY = 10;
    const leads = [0];
    pts.forEach(p => leads.push(p.py - p.pa));
    const maxAbs = Math.max(1, ...leads.map(Math.abs));
    const xOf = i => padX + (i / Math.max(1, pts.length)) * (W - padX * 2);
    const yOf = l => H / 2 - (l / maxAbs) * (H / 2 - padY);
    let d = '';
    leads.forEach((l, i) => { d += (i ? 'L' : 'M') + xOf(i).toFixed(1) + ' ' + yOf(l).toFixed(1); });
    const dots = pts.map((p, i) =>
      `<circle class="pt ${p.winner}" cx="${xOf(i + 1).toFixed(1)}" cy="${yOf(p.py - p.pa).toFixed(1)}" r="2.6"/>`).join('');
    return `<div class="an-svg-wrap"><svg class="an-svg an-timeline" viewBox="0 0 ${W} ${H}" role="img">
      <line class="zero" x1="${padX}" y1="${H / 2}" x2="${W - padX}" y2="${H / 2}"/>
      <path class="line" d="${d}"/>
      ${dots}
    </svg></div>`;
  }

  function placementSvg(g){
    const W = 190, H = 340, TX = 19, TY = 33, TW = 152, TH = 274;
    const cx = W / 2, cy = H / 2;
    const xOf = x => cx + (x / (TABLE_W / 2)) * (TW / 2);
    const yOf = z => cy + (z / (TABLE_L / 2)) * (TH / 2);
    const dots = g.bounces.map(b =>
      `<circle class="dot ${b.side}" cx="${xOf(b.x).toFixed(1)}" cy="${yOf(b.z).toFixed(1)}" r="3"/>`).join('');
    return `<div class="an-svg-wrap an-place-wrap"><svg class="an-svg an-place" viewBox="0 0 ${W} ${H}" role="img">
      <rect class="table" x="${TX}" y="${TY}" width="${TW}" height="${TH}" rx="3"/>
      <line class="center" x1="${cx}" y1="${TY}" x2="${cx}" y2="${TY + TH}"/>
      <line class="net" x1="${TX - 4}" y1="${cy}" x2="${TX + TW + 4}" y2="${cy}"/>
      <text x="${cx}" y="${TY - 7}" text-anchor="middle">${esc(nameOf(g, 'ai', false))}</text>
      <text x="${cx}" y="${TY + TH + 14}" text-anchor="middle">${esc(nameOf(g, 'player', false))}</text>
      ${dots}
    </svg></div>`;
  }

  function renderRecent(g){
    const pts = g.points.slice(-6).reverse();
    if(!pts.length) return emptyMini();
    return '<div class="an-pts">' + pts.map(p => {
      const i = g.points.indexOf(p) + 1;
      return `<div class="an-pt ${p.winner}">
        <span class="an-pt-i">#${i}</span>
        <span class="an-pt-score">${p.py} : ${p.pa}</span>
        <span class="an-pt-who">${esc(nameOf(g, p.winner, false))}</span>
        <span class="an-pt-reason">${esc(gameT(p.reason || 'g_msg_out'))}</span>
        <span class="an-pt-rally">${p.rally} ${esc(unitRally(p.rally))}</span>
      </div>`;
    }).join('') + '</div>';
  }

  function kpi(labelKey, value, unitKey){
    return `<div class="an-kpi"><span class="an-kpi-l">${esc(gameT(labelKey))}</span><b>${value}</b><em>${esc(gameT(unitKey))}</em></div>`;
  }

  function tabs(){
    const mk = (v, on, label, score) => `<button type="button" class="an-tab${on ? ' on' : ''}"
      data-an-act="view" data-an-view="${v}">${label}${score ? `<em>${score}</em>` : ''}</button>`;
    /* 斗蛐蛐：本局 + 本轮每一局（带最终比分），整轮都能回看 */
    if((cur && cur.watch) || typeof view === 'number'){
      if(!(cur && cur.points.length) && !series.length) return '';
      const items = [mk('cur', view === 'cur', esc(gameT('g_an_view_cur')), '')];
      series.forEach((g, i) => {
        const last = g.points.length ? g.points[g.points.length - 1] : null;
        items.push(mk(String(i), view === i, esc(gameT('g_an_game', { n: i + 1 })),
          last ? `${last.py}:${last.pa}` : ''));
      });
      return `<div class="an-tabs an-tabs-games">${items.join('')}</div>`;
    }
    if(!prev || !prev.points.length) return '';
    return `<div class="an-tabs">${mk('cur', view === 'cur', esc(gameT('g_an_view_cur')), '')}${
      mk('prev', view === 'prev', esc(gameT('g_an_view_prev')), '')}</div>`;
  }

  function render(){
    if(!openFlag) return;
    const card = $id('anCard');
    if(!card) return;
    if(typeof view === 'number' && !series[view]) view = 'cur';
    const g = shownGame();
    if(!g){ card.innerHTML = emptyState(); return; }

    const n = g.points.length;
    const last = n ? g.points[n - 1] : null;
    const py = last ? last.py : 0;
    const pa = last ? last.pa : 0;
    const rallies = g.points.map(p => p.rally);
    const longest = n ? Math.max(...rallies) : 0;
    const avg = n ? rallies.reduce((a, b) => a + b, 0) / n : 0;
    const avgDisp = Math.round(avg * 10) / 10;
    const maxSpeed = g.points.reduce((a, p) => Math.max(a, p.serveSpeed || 0),
      g.hits.reduce((a, h) => Math.max(a, h.speed), 0));

    const cls = (typeof view === 'number' || view === 'prev') ? 'prev' : (g.over ? 'over' : 'live');
    const stateKey = (view === 'prev') ? 'g_an_prev_tag' : (g.over ? 'g_an_over' : 'g_an_live');
    const stateText = typeof view === 'number' ? gameT('g_an_game', { n: view + 1 }) : gameT(stateKey);

    let meta = '';
    if(n){
      meta = `<div class="an-meta">${esc(gameT('g_an_meta', { n: n, r: longest }))}`;
      if(view === 'cur' && !g.over && typeof state !== 'undefined' && state === 'rally'
         && isNum(rallyCount) && rallyCount > 1){
        meta += `<span class="an-live-rally">${esc(gameT('g_an_ongoing', { r: rallyCount }))}</span>`;
      }
      meta += '</div>';
    }

    const legend = `<div class="an-legend">
      <span><i class="you"></i>${esc(nameOf(g, 'player', false))}</span>
      <span><i class="ai"></i>${esc(nameOf(g, 'ai', false))}</span>
    </div>`;

    const body = n ? `
      <div class="an-kpis">
        ${kpi('g_an_kpi_points', n, 'g_an_unit_pt')}
        ${kpi('g_an_kpi_avg', fmt1(avgDisp), avgDisp === 1 ? 'g_an_unit_rally_1' : 'g_an_unit_rally')}
        ${kpi('g_an_kpi_longest', longest, longest === 1 ? 'g_an_unit_rally_1' : 'g_an_unit_rally')}
        ${kpi('g_an_kpi_speed', Math.round(maxSpeed), 'g_an_unit_kmh')}
      </div>
      ${legend}
      <div class="an-grid">
        ${sec('g_an_rally_title', renderRally(g))}
        ${sec('g_an_reason_title', renderReasons(g))}
        ${sec('g_an_serve_title', renderServe(g))}
        ${sec('g_an_shot_title', renderShots(g))}
        ${sec('g_an_timeline_title', timelineSvg(g) + `<div class="an-cap">${esc(gameT(g.watch ? 'g_an_timeline_cap_watch' : 'g_an_timeline_cap'))}</div>`)}
        ${sec('g_an_place_title', placementSvg(g) + `<div class="an-cap">${esc(gameT('g_an_place_cap'))}</div>`)}
        ${sec('g_an_recent_title', renderRecent(g), 'an-wide')}
      </div>` : emptyState();

    card.innerHTML = `
      <div class="an-top">
        <div>
          <div class="an-kicker">${esc(gameT('g_an_kicker'))}</div>
          <div class="an-titlerow">
            <h2>${esc(gameT('g_btn_stats'))}</h2>
            <span class="an-state ${cls}">${esc(stateText)}</span>
          </div>
        </div>
        <div class="an-tools">
          ${tabs()}
          <button type="button" class="an-close" data-an-act="close"
            aria-label="${esc(gameT('g_an_close'))}" title="${esc(gameT('g_an_close'))}">✕</button>
        </div>
      </div>
      <div class="an-score">
        <div class="an-team you"><span>${esc(nameOf(g, 'player', true))}</span><b>${py}</b></div>
        <span class="an-colon">:</span>
        <div class="an-team ai"><b>${pa}</b><span>${esc(nameOf(g, 'ai', true))}</span></div>
      </div>
      ${meta}
      ${body}
      <div class="an-foot">${esc(gameT('g_an_foot'))}</div>`;
  }

  /* ---------------- 开关 ---------------- */
  function isOpen(){ return openFlag; }

  function open(){
    if(!cur) cur = newGame();
    openFlag = true;
    document.documentElement.classList.add('stats-open');
    const ov = $id('statsOverlay');
    if(ov) ov.classList.remove('hidden');
    view = (cur && cur.points.length) ? 'cur'
         : series.length ? series.length - 1
         : (prev && prev.points.length) ? 'prev' : 'cur';
    render();
  }

  function close(){
    openFlag = false;
    document.documentElement.classList.remove('stats-open');
    const ov = $id('statsOverlay');
    if(ov) ov.classList.add('hidden');
  }

  function toggle(){ if(openFlag) close(); else open(); }

  function analyticsReapplyI18n(){ if(openFlag) render(); }

  /* ---------------- 入口按钮 ---------------- */
  function bindUi(){
    ['btnStats', 'btnStatsIco', 'btnEndStats'].forEach(id => {
      const el = $id(id);
      if(!el || el.__anBound) return;
      el.__anBound = true;
      el.addEventListener('click', e => {
        e.preventDefault(); e.stopPropagation();
        if(typeof ensureAudio === 'function') ensureAudio();
        toggle();
      });
    });
    const ov = $id('statsOverlay');
    if(ov && !ov.__anBound){
      ov.__anBound = true;
      ov.addEventListener('click', e => {
        const b = e.target.closest('[data-an-act]');
        if(b){
          const act = b.getAttribute('data-an-act');
          if(act === 'close') close();
          else if(act === 'view'){
            const v = b.getAttribute('data-an-view');
            view = v === 'cur' ? 'cur' : v === 'prev' ? 'prev'
                 : (isNum(+v) ? +v : 'cur');
            render();
          }
          return;
        }
        if(e.target === ov) close();
      });
    }
  }
  if(typeof document !== 'undefined'){
    if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bindUi);
    else bindUi();
  }

  if(typeof window !== 'undefined') window.analyticsReapplyI18n = analyticsReapplyI18n;

  return {
    begin, serveSetup, serveStrike, hit, bounce, point, gameOver,
    open, close, toggle, isOpen, render, analyticsReapplyI18n,
  };
})();

if(typeof window !== 'undefined') window.GAME_ANALYTICS = GAME_ANALYTICS;
if(typeof module !== 'undefined' && module.exports) module.exports = GAME_ANALYTICS;
