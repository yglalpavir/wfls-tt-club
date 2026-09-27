/* =====================================================================
 *  train-ui.js — 训练可视化控制台前端
 *  · 拉取 /api/models + /api/meta 渲染模型卡片与参数面板
 *  · POST /api/run 启动训练子进程，EventSource 订阅 /api/events/:id
 *  · tick / line / phase / exit 四类事件分别驱动图表、日志、状态
 *  · 历史：/api/runs（内嵌降采样 pts）与 /api/curves（磁盘 curve 文件）
 * ===================================================================== */
(function(){
'use strict';

var $ = function(s){ return document.querySelector(s); };
var $$ = function(s){ return Array.prototype.slice.call(document.querySelectorAll(s)); };

var S = {
  models: [], meta: {}, sel: null, vals: {}, flags: {},
  chart: null, hidden: {}, es: null, runId: null, runTicks: [], runModel: null,
  tab: 'log', ckpts: [], ckSel: null, mx: null,
  runs: [], curves: [], logs: [], auto: true, norm: false,
  curvePoints: null, last: null, health: null
};

/* ---------------- 工具 ---------------- */
function get(p){
  return fetch(p).then(function(r){
    if(!r.ok) throw new Error(p + ' → HTTP ' + r.status);
    return r.json();
  });
}
function post(p, body){
  return fetch(p, { method:'POST', headers:{'Content-Type':'application/json'},
    body: JSON.stringify(body || {}) }).then(function(r){
      var d; return r.json().then(function(j){ d = j; if(!r.ok) throw new Error(d && d.error || ('HTTP ' + r.status)); return d; });
    });
}
function esc(s){
  return String(s == null ? '' : s).replace(/[&<>"]/g, function(c){
    return c === '&' ? '&amp;' : c === '<' ? '&lt;' : c === '>' ? '&gt;' : '&quot;';
  });
}
function num(v){ var n = Number(v); return isFinite(n) ? n : null; }
function fmtPct(v, unit){
  var n = num(v); if(n === null) return '–';
  return (unit === 'rate' ? n * 100 : n).toFixed(1) + '%';
}
function fmtDur(ms){
  var s = Math.max(0, Math.floor(ms / 1000));
  if(s < 60) return s + 's';
  var m = Math.floor(s / 60), ss = s % 60;
  if(m < 60) return m + 'm' + (ss ? ss + 's' : '');
  return Math.floor(m / 60) + 'h' + (m % 60) + 'm';
}
function fmtBytes(n){
  if(n < 1024) return n + 'B';
  if(n < 1048576) return (n / 1024).toFixed(1) + 'KB';
  return (n / 1048576).toFixed(1) + 'MB';
}
function fmtTs(t){
  var d = new Date(t); var p = function(n){ return n < 10 ? '0' + n : n; };
  return p(d.getMonth() + 1) + '-' + p(d.getDate()) + ' ' + p(d.getHours()) + ':' + p(d.getMinutes());
}
function fmtBytesShort(n){ return fmtBytes(n); }
/* text 可直接传文案;需要跟随语言切换时再传 i18nKey(可选 i18nData) */
function banner(kind, text, i18nKey, i18nData){
  S.bannerKind = kind; S.bannerText = text || ''; S.bannerKey = i18nKey || null; S.bannerData = i18nData || null;
  var b = $('#banner');
  b.className = 'banner ' + (kind === 'err' ? 'err' : 'warn') + (text ? ' show' : '');
  b.textContent = text || '';
}
function logLine(text, cls){
  var box = $('#logbox');
  var d = document.createElement('div');
  d.className = 'ln ' + (cls || 'out');
  var ts = document.createElement('span');
  ts.className = 'ts';
  ts.textContent = new Date().toTimeString().slice(0, 8);
  d.appendChild(ts);
  d.appendChild(document.createTextNode(text));
  box.appendChild(d);
  while(box.childNodes.length > 3000) box.removeChild(box.firstChild);
  if(S.auto) box.scrollTop = box.scrollHeight;
}

/* ---------------- 卡片 ---------------- */
function metaLine(m){
  var e = S.meta[m.id];
  if(!e) return '';
  if(e.missing) return '<span class="bad">' + gameT('g_tr_missing') + '</span>';
  var mt = e.meta || {};
  var bits = [];
  if(mt.trainedAt) bits.push('<span>' + gameT('g_tr_trained') + '</span> <b>' + esc(mt.trainedAt) + '</b>');
  if(mt.evalDefault != null) bits.push('<span>' + gameT('g_tr_vs_default') + '</span> <b class="ok">' + (mt.evalDefault * 100).toFixed(1) + '%</b>');
  if(mt.evalHell != null) bits.push('<span>' + gameT('g_tr_vs_hell') + '</span> <b class="ok">' + (mt.evalHell * 100).toFixed(1) + '%</b>');
  if(mt.fitness != null) bits.push('<span>fit</span> <b>' + mt.fitness.toFixed(3) + '</b>');
  if(mt.pointRateVsDefault != null) bits.push('<span>' + gameT('g_tr_vs_default') + '</span> <b class="ok">' + (mt.pointRateVsDefault * 100).toFixed(1) + '%</b>');
  if(mt.pointRateVsPlayer != null) bits.push('<span>' + gameT('g_tr_vs_player') + '</span> <b class="ok">' + (mt.pointRateVsPlayer * 100).toFixed(1) + '%</b>');
  if(!bits.length) bits.push('<span>' + esc(e.weightFile) + '</span>');
  return '<div class="mrow">' + bits.join('') + '</div>';
}
function renderCards(){
  var box = $('#cards'); box.innerHTML = '';
  S.models.forEach(function(m){
    var el = document.createElement('div');
    el.className = 'card' + (m.id === S.sel ? ' sel' : '');
    el.style.setProperty('--mc', m.color);
    el.innerHTML =
      '<h3><i></i>' + esc(m.name) + '<em>' + esc(m.tag) + '</em></h3>' +
      '<p>' + esc(m.desc) + '</p>' + metaLine(m) +
      '<div class="mrow"><span>' + gameT('g_tr_script') + '</span> <b>' + esc(m.script) + '</b></div>';
    el.onclick = function(){ selectModel(m.id); };
    box.appendChild(el);
  });
}

/* ---------------- 配置面板 ---------------- */
function paramDefs(m){
  var out = (m.params || []).map(function(p){ return p; });
  if(m.extraArgs) Object.keys(m.extraArgs).forEach(function(k){
    out.push({ name:k, label:k + ' <small>' + gameT('g_tr_extra') + '</small>', type:'text', default:m.extraArgs[k] });
  });
  return out;
}
function buildFields(m){
  var fb = $('#fields'); fb.innerHTML = '';
  paramDefs(m).forEach(function(p){
    var row = document.createElement('div'); row.className = 'field';
    var lab = document.createElement('label');
    if(p.name) S.vals[p.name] = (S.vals[p.name] !== undefined ? S.vals[p.name] : p.default);
    lab.innerHTML = esc(String(p.label).replace(/<.*>/, '')) +
      (p.min !== undefined ? '<small>' + p.min + '~' + p.max + '</small>' : '');
    var inp = document.createElement('input');
    inp.type = p.type === 'int' ? 'number' : 'text';
    inp.value = S.vals[p.name];
    if(p.min !== undefined){ inp.min = p.min; inp.max = p.max; inp.step = p.step || 1; }
    inp.spellcheck = false;
    inp.oninput = function(){
      if(p.type === 'int'){
        var v = parseInt(inp.value, 10);
        if(isFinite(v)){ if(p.min !== undefined) v = Math.max(p.min, Math.min(p.max, v)); S.vals[p.name] = v; }
      } else S.vals[p.name] = inp.value.trim();
      updateCmd();
    };
    row.appendChild(lab); row.appendChild(inp); fb.appendChild(row);
  });
}
function buildFlags(m){
  var fb = $('#flags'); fb.innerHTML = '';
  (m.flags || []).forEach(function(f){
    var lab = document.createElement('label'); lab.className = 'chk';
    var cb = document.createElement('input'); cb.type = 'checkbox';
    if(S.flags[f.name] === undefined) S.flags[f.name] = f.default;
    cb.checked = !!S.flags[f.name];
    cb.onchange = function(){ S.flags[f.name] = cb.checked; updateCmd(); };
    lab.appendChild(cb);
    var txt = document.createElement('span'); txt.textContent = f.label; lab.appendChild(txt);
    var k = document.createElement('span'); k.className = 'k'; k.textContent = '--' + f.name; lab.appendChild(k);
    fb.appendChild(lab);
  });
}
function buildPresets(m){
  var pb = $('#presets'); pb.innerHTML = '';
  (m.presets || []).forEach(function(pr, i){
    var b = document.createElement('button'); b.className = 'btn sm' + (S.presetOn === pr.name ? ' on' : ''); b.textContent = pr.name;
    b.onclick = function(){
      (m.params || []).forEach(function(p){ S.vals[p.name] = pr.args[p.name] !== undefined ? pr.args[p.name] : p.default; });
      $$('#presets .btn').forEach(function(x){ x.classList.remove('on'); });
      b.classList.add('on');
      S.presetOn = pr.name;
      buildFields(m); updateCmd(); logLine(gameT('g_tr_preset_log', { n: pr.name, a: JSON.stringify(pr.args) }), 'sys');
    };
    pb.appendChild(b);
  });
}
function argsFromUI(m){
  var args = {};
  Object.keys(S.vals).forEach(function(k){
    var v = S.vals[k];
    if(v === '' || v === null || v === undefined) return;
    args[k] = v;
  });
  var flags = [];
  Object.keys(S.flags).forEach(function(k){ if(S.flags[k]) flags.push(k); });
  return { args:args, flags:flags, rawArgs: $('#rawArgs').value.trim(), dryRun: $('#chkDry') ? $('#chkDry').checked : true };
}
function cmdText(m, payload){
  var a = [];
  Object.keys(payload.args || {}).forEach(function(k){ a.push('--' + k, String(payload.args[k])); });
  /* 与 server.buildArgs 保持一致：flag 去重（清单默认勾选 + dryRunArgs 会重复出同一条） */
  var seen = {};
  var addFlag = function(x){ if(!seen[x]){ seen[x] = 1; a.push(x); } };
  (payload.flags || []).forEach(function(f){ addFlag('--' + f); });
  if(payload.rawArgs) a = a.concat(payload.rawArgs.split(/\s+/));
  if(payload.dryRun !== false) (m.dryRunArgs || []).forEach(addFlag);
  return 'node ' + m.script + (a.length ? ' ' + a.join(' ') : '');
}
function updateCmd(){
  var m = cur(); if(!m) return;
  var payload = argsFromUI(m);
  $('#cmdbox').textContent = cmdText(m, payload);
  var w = $('#warnBox');
  if(payload.dryRun !== false && (m.dryRunArgs || []).length){
    w.className = 'warn ok';
    w.innerHTML = gameT('g_tr_warn_dry1', { w: esc((m.writes || []).join('、')) });
  } else if(payload.dryRun !== false){
    w.className = 'warn ok'; w.innerHTML = gameT('g_tr_warn_dry2');
  } else {
    w.className = 'warn';
    w.innerHTML = gameT('g_tr_warn_write', { w: esc((m.writes || []).join('、')) });
  }
}
function cur(){ return S.models.filter(function(m){ return m.id === S.sel; })[0] || null; }

function selectModel(id){
  var m = S.models.filter(function(x){ return x.id === id; })[0];
  if(!m) return;
  S.sel = id; S.vals = {}; S.flags = {}; S.presetOn = null;
  S.models.forEach(function(x){ if(x.id === id){
    (x.params || []).forEach(function(p){ S.vals[p.name] = p.default; });
    (x.flags || []).forEach(function(f){ S.flags[f.name] = f.default; });
  }});
  renderCards();
  $('#cfgTitle').textContent = m.name + gameT('g_tr_cfg_suffix');
  $('#cfgScript').textContent = m.script;
  buildPresets(m); buildFields(m); buildFlags(m); updateCmd();
  $('#rawArgs').value = '';
  if(!S.runId){ plotModel(m, [], function(){ return m.name + gameT('g_tr_not_started'); }, ''); }
}

/* ---------------- 验证胜率矩阵 / 进度 ---------------- */
/* wr* 系列带 tag（ladder 档）+ short（矩阵短标签）；矩阵与折线共用同一份数据 */
function wrSeries(m){
  return ((m && m.series) || []).filter(function(s){ return typeof s.tag === 'string'; });
}
/* 秒数 → 可读时长（打点的 elapsedSec/budgetSec/remainSec 都是秒） */
function fmtH(sec){
  var n = num(sec); if(n === null) return '–';
  var h = n / 3600;
  if(n < 60) return Math.round(n) + 's';
  if(n < 3600){ var s = Math.round(n); return Math.floor(s / 60) + 'm' + (s % 60 ? (s % 60) + 's' : ''); }
  if(h < 48) return (h < 10 ? h.toFixed(1) : h.toFixed(0)) + 'h';
  return (h / 24).toFixed(1) + gameT('g_tr_days');
}
/* 从打点序列汇总矩阵：cur=最后有效值 / peak=全程峰值 / base=基线（t:'verify' 带 base）
 * wr* 打点为百分比；wrMap 为小数，仅在缺 wr* 时回退（老版本曲线兼容）。 */
function refreshMatrix(points){
  var m = (S.chart && S.chart.model) || cur();
  var levels = wrSeries(m);
  var st = { levels: levels, base: {}, cur: {}, peak: {}, ep: null };
  (points || []).forEach(function(p){
    var t = normalizeTick(p, m);
    if(t.base && typeof t.base === 'object'){
      Object.keys(t.base).forEach(function(tag){
        var s = levels.filter(function(x){ return x.tag === tag; })[0];
        if(s){ var n = num(t.base[tag]); if(n !== null) st.base[s.key] = +(n * 100).toFixed(1); }
      });
    }
    levels.forEach(function(s){
      var n = num(t[s.key]);
      if(n === null && t.wrMap && t.wrMap[s.tag] !== undefined){
        var f = num(t.wrMap[s.tag]); n = f === null ? null : f * 100;
      }
      if(n === null) return;
      st.cur[s.key] = +n.toFixed(1);
      if(st.peak[s.key] === undefined || n > st.peak[s.key]) st.peak[s.key] = +n.toFixed(1);
      st.ep = xOf(t, m);
    });
  });
  S.mx = st;
  renderMatrix();
}
function renderMatrix(){
  var g = $('#mxGrid'), tag = $('#mxTag');
  if(!g) return;
  var st = S.mx;
  if(!st || !st.levels.length){
    if(!g.dataset.empty){ g.dataset.empty = '1'; g.style.display='none'; if(tag) tag.textContent='—'; }
    return;
  }
  delete g.dataset.empty;
  g.style.display='grid';
  g.style.gridTemplateColumns='repeat(' + st.levels.length + ',minmax(0,1fr))';
  var html='';
  /* 还没跑完一轮训练（st.ep 为 0/空）时这一行就是基线本身，
     不显示 +0.0pp——那会读成"已经涨了 0.0"。 */
  var trained = st.ep !== null && st.ep !== undefined && st.ep > 0;
  st.levels.forEach(function(s){
    var c = st.cur[s.key], pk = st.peak[s.key], b = st.base[s.key];
    var d = (trained && c !== undefined && b !== undefined) ? (c - b) : undefined;
    var cls = d === undefined ? '' : (d > 0.05 ? 'up' : (d < -0.05 ? 'dn' : ''));
    html += '<div class="mxc' + (c === undefined ? ' dim' : '') + '" style="--c:' + s.color + '">' +
      '<div class="lbl"><i></i>' + esc(s.short || s.label) +
        (s.badge ? '<em>' + esc(s.badge) + '</em>' : '') + '</div>' +
      '<div class="val">' + (c === undefined ? '–' : c.toFixed(1)) + '<span>%</span></div>' +
      '<div class="delta' + cls + '">' + (d === undefined ? (trained ? gameT('g_tr_baseline') : gameT('g_tr_pending')) : (d >= 0 ? '+' : '') + d.toFixed(1) + 'pp') + '</div>' +
      '<div class="track"><i style="width:' + (c === undefined ? 0 : Math.max(0, Math.min(100, c))) + '%"></i>' +
        (b !== undefined ? '<u style="left:' + Math.max(0, Math.min(100, b)) + '%"></u>' : '') + '</div>' +
      '<div class="sub">' + gameT('g_tr_peak') + ' ' + (pk === undefined ? '–' : pk.toFixed(1)) +
        ' · ' + gameT('g_tr_baseline') + ' ' + (b === undefined ? '–' : b.toFixed(1)) + '</div></div>';
  });
  g.innerHTML = html;
  if(tag) tag.textContent = st.ep !== null ? ('ep ' + st.ep) : '—';
}
/* 时间预算进度：优先 --hours 墙钟预算（elapsedSec/budgetSec），否则回退 ep/games */
function updateMeter(){
  var bar = $('#mxBar'), lab = $('#mxMeter');
  if(!bar) return;
  /* budgetSec 只在 start / verify / done 打点里出现，elapsedSec 也稀疏
   * （基线标定那几十秒根本没有打点），所以都取"最新一次见到"的值，
   * 再按最新一条打点的到达时间往后外推，否则进度条会在打点间隙冻住。 */
  var b = null, ep = null, sec = 0, lastTs = 0;
  var ticks = S.runTicks || [];
  for(var i = 0; i < ticks.length; i++){
    var t = ticks[i];
    if((t.ts || 0) > lastTs) lastTs = t.ts || 0;
    var e0 = num(t.elapsedSec);
    if(e0 !== null) sec = e0;
    if(b === null){ var bb = num(t.budgetSec); if(bb !== null) b = bb; }
    if(ep === null){ var pp = num(t.ep); if(pp !== null) ep = pp; }
  }
  if(!lastTs) lastTs = Date.now();
  var e = sec + Math.max(0, (Date.now() - lastTs) / 1000);
  var tot = num((S.vals || {})['games']);
  var pct = null, txt = '';
  if(b && b > 0){
    e = e || 0;
    pct = Math.max(0, Math.min(1, e / b));
    txt = gameT('g_tr_elapsed', { a: fmtH(e), b: fmtH(b), c: fmtH(Math.max(0, b - e)) });
  } else if(tot && tot > 0 && ep !== null){
    pct = Math.max(0, Math.min(1, ep / tot));
    txt = 'ep ' + Math.round(ep) + ' / ' + Math.round(tot) + ' · ' + (pct * 100).toFixed(1) + '%';
  }
  if(pct === null){
    bar.style.width = '0'; bar.className = 'bar';
    if(lab) lab.textContent = S.runId ? gameT('g_tr_stats_ing') : '—';
    return;
  }
  bar.style.width = (pct * 100).toFixed(1) + '%';
  bar.className = 'bar' + (pct >= 0.999 ? ' full' : (pct > 0.85 ? ' warn' : ''));
  if(lab) lab.textContent = txt;
}
function setChartTag(extra){
  var el = $('#chartTag'); if(!el) return;
  el.textContent = (S.chartTag || '') + extra;
}

/* ---------------- 图表 ---------------- */
function xOf(t, model){
  var v = t[model.xKey];
  if(v === undefined || v === null) v = t.pass;
  if(v === undefined || v === null) v = t.gen;
  if(v === undefined || v === null) v = t.ep;
  var n = num(v);
  /* num() 返回 null 表示无有效数值；注意 isFinite(null) 为 true，必须显式判空再兜底 */
  return (n !== null && isFinite(n)) ? n : S.runTicks.length;
}
function normalizeTick(t, model){
  var o = Object.assign({}, t);
  if(t.t === 'bc' && o.evalW !== undefined){
    if(o.evalDef === undefined) o.evalDef = o.evalW;   // BC 阶段对手固定为默认策略
  }
  return o;
}
function mkChart(){
  var ctx = $('#chart').getContext('2d');
  S.chart = new Chart(ctx, {
    type: 'line',
    data: { datasets: [] },
    options: {
      responsive: true, maintainAspectRatio: false, animation: false,
      interaction: { mode:'nearest', axis:'x', intersect:false },
      layout: { padding: { top: 4, right: 4 } },
      scales: {
        x: {
          type: 'linear', grid: { color:'rgba(255,255,255,.06)' },
          ticks: { color:'#6d7788', font:{ size:10, family:'Consolas,monospace' }, maxTicksLimit: 12 },
          title: { display:true, text: gameT('g_tr_axis_default'), color:'#6d7788', font:{ size:10 } }
        },
        y: {
          min: 0, grid: { color:'rgba(255,255,255,.06)' },
          ticks: { color:'#6d7788', font:{ size:10, family:'Consolas,monospace' } }
        },
        y1: {
          position:'right', min: 0, max: 1, grid: { drawOnChartArea:false },
          ticks: { color:'#6d7788', font:{ size:10, family:'Consolas,monospace' } }
        }
      },
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor:'rgba(10,13,20,.95)', borderColor:'rgba(255,255,255,.16)', borderWidth:1,
          titleColor:'#eef2f8', bodyColor:'#9aa3b5', padding:8, boxPadding:3,
          titleFont:{ size:11 }, bodyFont:{ size:11, family:'Consolas,monospace' },
          callbacks: {
            title: function(items){ return S.chartTag || gameT('g_tr_datapoints'); },
            label: function(c){
              var s = S.chart.model.series.filter(function(x){ return x.key === c.dataset.key; })[0];
              var v = c.parsed.y;
              if(v === null || v === undefined) return null;
              if(s && s.axis === 'right') return c.dataset.label + '  ' + (+v).toFixed(3);
              return c.dataset.label + '  ' + fmtPct(v, S.chart.unit);
            }
          }
        }
      }
    }
  });
}
/* title 可以是字符串或函数——语言切换时按函数重算,图表标题跟着换语言 */
function resolveTitle(t){ return (typeof t === 'function') ? t() : t; }
function plotModel(model, points, title, tag){
  if(!S.chart) mkChart();
  S.chart.model = model; S.chart.unit = model.yUnit || 'rate'; S.chartTag = tag || '';
  S.plotPts = points; S.plotTitle = title; S.plotTag = tag || '';
  var norm = S.norm;
  var mx = 0;
  points.forEach(function(p){ var x = xOf(p, model); if(x > mx) mx = x; });
  var ds = (model.series || []).map(function(s){
    return {
      key: s.key, label: s.label, yAxisID: s.axis === 'right' ? 'y1' : 'y',
      data: points.map(function(p){
        var t = normalizeTick(p, model);
        var v = num(t[s.key]);
        if(v === null) return null;
        var x = xOf(t, model);
        return { x: norm ? (mx ? x / mx * 100 : 0) : x, y: v };
      }).filter(function(d){ return d && d.y !== null; }),
      borderColor: s.color, backgroundColor: s.color + '22',
      borderWidth: 1.7, pointRadius: 0, pointHoverRadius: 3,
      tension: .25, spanGaps: true, fill: s.key === 'fit' || s.key === 'best' ? false : false
    };
  });
  S.chart.data.datasets = ds;
  S.chart.options.scales.y.min = model.yUnit === 'rate' ? 0 : 0;
  S.chart.options.scales.y.max = model.yUnit === 'rate' ? 1 : 100;
  S.chart.options.scales.y.ticks.callback = function(v){
    return model.yUnit === 'rate' ? (v * 100).toFixed(0) + '%' : v + '%';
  };
  S.chart.options.scales.y1.ticks.callback = function(v){ return (+v).toFixed(2); };
  S.chart.options.scales.x.title.text = norm ? gameT('g_tr_axis_norm')
    : (model.xKey === 'gen' ? gameT('g_tr_axis_gen') : gameT('g_tr_axis_ep'));
  S.chart.options.scales.x.min = 0;
  S.chart.options.scales.x.max = norm ? 100 : (mx > 0 ? mx : undefined);
  S.chartTag = tag || '';
  $('#chartTitle').textContent = resolveTitle(title);
  $('#chartTag').textContent = tag ? (tag + ' · ' + points.length + ' ' + gameT('g_tr_points')) : (points.length + ' ' + gameT('g_tr_points'));
  S.hidden = {};
  renderLegend(); S.chart.update('none'); renderReadout(points);
  refreshMatrix(points);
}
function renderLegend(){
  var m = S.chart.model; if(!m) return;
  var box = $('#legend'); box.innerHTML = '';
  (m.series || []).forEach(function(s){
    var el = document.createElement('span');
    if(S.hidden[s.key]) el.className = 'off';
    el.innerHTML = '<i style="background:' + s.color + '"></i>' + esc(s.label) +
      (s.axis === 'right' ? ' <small style="color:#6d7788">' + gameT('g_tr_axis_right') + '</small>' : '');
    el.onclick = function(){
      S.hidden[s.key] = !S.hidden[s.key];
      S.chart.data.datasets.forEach(function(d){ d.hidden = !!S.hidden[d.key]; });
      S.chart.update('none'); renderLegend();
    };
    box.appendChild(el);
  });
}
function renderReadout(points){
  var m = S.chart.model; if(!m) { $('#readout').innerHTML = ''; return; }
  var last = points.length ? points[points.length - 1] : null;
  var bits = [];
  (m.series || []).forEach(function(s){
    if(S.hidden[s.key]) return;
    var v = null, at = null;
    points.forEach(function(p){
      var t = normalizeTick(p, m); var n = num(t[s.key]);
      if(n !== null){ if(v === null || n > v){ v = n; at = xOf(t, m); } }
    });
    var cur2 = last ? num(normalizeTick(last, m)[s.key]) : null;
    var fmt = function(n){ return s.axis === 'right' ? (+n).toFixed(3) : fmtPct(n, m.yUnit); };
    bits.push('<span>' + gameT('g_tr_series_peak', { s: esc(s.label) }) + ' <b>' + (v === null ? '–' : fmt(v)) + '</b>' +
      (cur2 !== null ? ' ' + gameT('g_tr_current') + ' <b>' + fmt(cur2) + '</b>' : '') + '</span>');
  });
  if(last){
    bits.push('<span>' + gameT('g_tr_latest') + ' ' + esc(String(xOf(last, m))) + '</span>');
    if(last.sec !== undefined) bits.push('<span>' + gameT('g_tr_time_cost') + ' <b>' + fmtDur(last.sec * 1000) + '</b></span>');
    if(last.lr !== undefined) bits.push('<span>lr <b>' + last.lr + '</b></span>');
    if(last.eps !== undefined) bits.push('<span>eps <b>' + last.eps + '</b></span>');
    if(last.evals !== undefined) bits.push('<span>evals <b>' + last.evals + '</b></span>');
  }
  $('#readout').innerHTML = bits.join('');
}

/* ---------------- 启动 / 停止 ---------------- */
function setStatus(text, cls){
  S.statusText = text; S.statusCls = cls || '';
  $('#runStatus').textContent = text;
  $('#runDot').className = 'dot ' + (cls === 'run' ? 'on' : (cls === 'err' ? 'off' : ''));
}
function openSSE(id){
  if(S.es){ try{ S.es.close(); }catch(e){} S.es = null; }
  var es = new EventSource('/api/events/' + encodeURIComponent(id));
  S.es = es;
  es.onmessage = function(ev){
    var msg; try{ msg = JSON.parse(ev.data); }catch(e){ return; }
    onEvent(msg);
  };
  es.onerror = function(){ setStatus(gameT('g_tr_conn_lost'), 'err'); };
}
function onEvent(msg){
  var m = S.runModel; if(!m) return;
  if(msg.kind === 'phase'){
    logLine('◈ ' + (msg.msg || msg.phase), 'ph');
    return;
  }
  if(msg.kind === 'line'){
    logLine(msg.text, msg.s === 'err' ? 'err' : 'out');
    return;
  }
  if(msg.kind === 'tick'){
    var t = Object.assign({}, msg, { ts: msg.ts || Date.now() });
    S.runTicks.push(t);
    /* 心跳：长跑里一轮长达 20 多分钟，这是期间唯一的活动信号。
       只推图表标签 + 限频日志（每 6 次 = 1 分钟一条），不碰矩阵（心跳不带 wr*）。 */
    if(t.t === 'hb'){
      S.hbN = (S.hbN || 0) + 1;
      var wrNow = (t.trainTotal ? Math.round(t.trainWins / t.trainTotal * 100) : 0);
      S.chartTag = 'ep ' + (t.ep || '') + ' · ' + gameT('g_tr_this_round') + ' ' + (t.inRound || 0) + '/' + (t.step || '?') +
        ' · vs' + (t.phase || '') + ' ' + wrNow + '%';
      setChartTag(' · ' + gameT('g_tr_remain') + ' ' + fmtH(t.remainSec));
      if(S.hbN % 6 === 0){
        logLine('… ep ' + t.ep + ' · ' + gameT('g_tr_this_round') + ' ' + t.inRound + '/' + t.step +
          ' · vs' + t.phase + ' ' + wrNow + '% · ε ' + t.eps +
          ' · best ' + (num(t.best) !== null ? (t.best * 100).toFixed(1) : '?') + '@' + t.bestEp +
          ' · ' + gameT('g_tr_remain') + ' ' + fmtH(t.remainSec), 'hb');
      }
      updateMeter();
      return;
    }
    /* 停止请求已收到：进程还在训完当前回合并落检查点，面板给出明确提示，别让人以为卡死 */
    if(t.t === 'stop'){
      S.chartTag = gameT('g_tr_stopping');
      setChartTag(' · ep ' + (t.ep || '?'));
      logLine(gameT('g_tr_stop_req', { r: t.reason }), 'sys');
      updateMeter();
      return;
    }
    /* 优雅暂停完成：wr* 齐全，照常进矩阵和曲线 */
    if(t.t === 'paused'){
      logLine(gameT('g_tr_paused_log', { e: t.ep, c: (t.ckpt || ''), n: (t.ckpts || 0) }), 'sys');
      if(t.best !== undefined){
        logLine(gameT('g_tr_best_line', {
          b: (num(t.best) !== null ? (t.best * 100).toFixed(1) : '?'), e: (t.bestEp || 0),
          t: (t.trained || 0), h: fmtH(t.elapsedSec) }), 'sys');
      }
    }
    S.chartTag = (m.xKey === 'gen' ? 'gen ' : 'ep ') + (t[m.xKey] !== undefined ? t[m.xKey] : '');
    plotModel(m, S.runTicks, function(){ return m.name + gameT('g_tr_training'); }, S.chartTag);
    refreshMatrix(S.runTicks);
    updateMeter();
    if(num(t.remainSec) !== null){
      setChartTag(' · ' + gameT('g_tr_remain') + ' ' + fmtH(t.remainSec));
    } else {
      var total = S.vals[m.xKey === 'gen' ? 'gens' : 'games'];
      var x = xOf(t, m);
      if(t.sec !== undefined && total && x > 0){
        setChartTag(' · ETA ' + fmtDur((total - x) * (t.sec / x) * 1000));
      }
    }
    return;
  }
  if(msg.kind === 'exit'){
    logLine(gameT('g_tr_exit', { c: msg.code, d: fmtDur(msg.sec * 1000) }), 'sys');
    /* closeRun 会清掉 runModel，先在此刷新一次图表标题与读数，避免停留在「训练中」 */
    if(S.runModel && S.runTicks.length){
      plotModel(S.runModel, S.runTicks, function(){
        return S.runModel.name + ' · ' + gameT(msg.status === 'done' ? 'g_tr_done' : msg.status === 'stopped' ? 'g_tr_paused' : 'g_tr_abnormal');
      }, S.chartTag || (S.runTicks.length + ' ' + gameT('g_tr_points')));
    }
    var stText = gameT(msg.status === 'done' ? 'g_tr_done' : (msg.status === 'stopped' ? 'g_tr_paused' : 'g_tr_abnormal'));
    closeRun(msg.status === 'error' ? 'err' : '');
    setStatus(stText, msg.status === 'error' ? 'err' : '');
    if(msg.status === 'stopped') logLine(gameT('g_tr_paused_hint'), 'sys');
    refreshRuns();
  }
}
function startRun(){
  var m = cur(); if(!m) return;
  if(S.runId){ logLine(gameT('g_tr_busy', { id: S.runId }), 'sys'); return; }
  var payload = argsFromUI(m);
  post('/api/run', { model:m.id, args:payload.args, flags:payload.flags, rawArgs:payload.rawArgs, dryRun:payload.dryRun })
    .then(function(r){
      S.runId = r.id; S.runTicks = []; S.runModel = m;
      /* 清掉上一次训练的矩阵读数，否则新一场开始前会挂着旧数字 */
      S.mx = null; S.hbN = 0; renderMatrix(); updateMeter();
      $('#logbox').innerHTML = '';
      logLine('$ ' + r.cmd, 'sys');
      logLine('runId=' + r.id + gameT(payload.dryRun ? 'g_tr_dryrun_suffix' : 'g_tr_willwrite_suffix'), 'sys');
      $('#btnRun').disabled = true; $('#btnStop').disabled = false;
      setStatus(gameT('g_tr_running'), 'run');
      openSSE(r.id);
    })
    .catch(function(e){ banner('err', gameT('g_tr_start_fail', { e: e.message }), 'g_tr_start_fail', { e: e.message });
      logLine(gameT('g_tr_start_fail', { e: e.message }), 'err'); });
}
function stopRun(){
  if(!S.runId) return;
  post('/api/stop/' + encodeURIComponent(S.runId)).then(function(){
    logLine(gameT('g_tr_stop_requested'), 'sys');
  }).catch(function(e){ logLine(gameT('g_tr_stop_fail', { e: e.message }), 'err'); });
}
function closeRun(cls){
  S.runId = null; S.runModel = null;
  if(S.es){ try{ S.es.close(); }catch(e){} S.es = null; }
  $('#btnRun').disabled = false; $('#btnStop').disabled = true;
  if(cls) setStatus(gameT(cls === 'err' ? 'g_tr_abnormal' : 'g_tr_done'), cls);
}

/* ---------------- 历史：运行 ---------------- */
function refreshRuns(){
  get('/api/runs').then(function(d){
    S.runs = d.history || [];
    var tb = $('#runsTable tbody'); tb.innerHTML = '';
    (d.live || []).concat(S.runs).slice(0, 40).forEach(function(r){
      var tr = document.createElement('tr');
      var best = Object.keys(r.best || {}).map(function(k){
        return k + ' ' + (r.best[k] > 1 ? r.best[k].toFixed(2) : (r.best[k] * 100).toFixed(0) + '%');
      }).join(' ');
      tr.innerHTML =
        '<td>' + fmtTs(r.startedAt) + '</td>' +
        '<td>' + esc(r.modelName || r.model) + (r.dryRun ? '' : ' <span class="pill error">' + gameT('g_tr_write_pill') + '</span>') + '</td>' +
        '<td style="max-width:230px;overflow:hidden;text-overflow:ellipsis">' + esc(r.cmd) + '</td>' +
        '<td><span class="pill ' + (r.status === 'running' ? 'running' : r.status === 'done' ? 'done' : r.status === 'stopped' ? 'paused' : 'error') + '">' +
          esc(r.status === 'running' ? gameT('g_tr_status_running') : r.status === 'done' ? gameT('g_tr_done') : r.status === 'stopped' ? gameT('g_tr_paused') : gameT('g_tr_status_error')) + '</span></td>' +
        '<td>' + fmtDur((r.endedAt || Date.now()) - r.startedAt) + '</td>' +
        '<td>' + (r.ticks || 0) + '</td>' +
        '<td style="max-width:150px;overflow:hidden;text-overflow:ellipsis">' + esc(best) + '</td>' +
        '<td>' + (r.last && r.last.t === 'done'
          ? esc(Object.keys(r.last).filter(function(k){ return /eval|fitness|adopted/.test(k); })
            .map(function(k){ return k + '=' + r.last[k]; }).join(' '))
          : '–') + '</td>';
      tr.onclick = function(){
        $$('#runsTable tbody tr').forEach(function(x){ x.classList.remove('on'); });
        tr.classList.add('on');
        if(r.pts && r.pts.length){
          var mdl = S.models.filter(function(x){ return x.id === r.model; })[0];
          if(mdl) plotModel(mdl, r.pts, (function(rr){ return function(){
            return (rr.modelName || rr.model) + gameT('g_tr_replay_suffix') + rr.id; }; })(r), r.cmd);
        } else {
          banner('warn', gameT('g_tr_no_ticks'), 'g_tr_no_ticks');
        }
      };
      tb.appendChild(tr);
    });
    $('#runsEmpty').style.display = (d.live || []).length + S.runs.length ? 'none' : 'block';
  }).catch(function(e){ /* 静默 */ });
}

/* ---------------- 历史：曲线文件 ---------------- */
function refreshCurves(){
  get('/api/curves').then(function(d){
    S.curves = d.curves || [];
    var tb = $('#curvesTable tbody'); tb.innerHTML = '';
    S.curves.forEach(function(c){
      var tr = document.createElement('tr');
      tr.innerHTML =
        '<td>' + esc(c.path) + '</td>' +
        '<td>' + esc(c.model ? (S.models.filter(function(x){ return x.id === c.model; })[0] || {}).name || c.model : '–') + '</td>' +
        '<td>' + c.count + '</td>' +
        '<td>' + fmtBytes(c.size) + '</td>' +
        '<td>' + fmtTs(c.mtime) + '</td>';
      tr.onclick = function(){ loadCurve(c.path, c.model); };
      tb.appendChild(tr);
    });
    $('#curvesEmpty').style.display = S.curves.length ? 'none' : 'block';
  }).catch(function(){});
}
function loadCurve(path, modelId){
  get('/api/curve?path=' + encodeURIComponent(path)).then(function(d){
    if(!d || d.error){ banner('err', gameT('g_tr_curve_fail', { e: (d && d.error) }), 'g_tr_curve_fail', { e: (d && d.error) }); return; }
    var mdl = S.models.filter(function(x){ return x.id === (modelId || d.model); })[0];
    if(!mdl){
      mdl = { name: gameT('g_tr_unknown_model'), xKey: d.xKey || 'gen', yUnit:'rate', color:'#7fd8ff',
        series: Object.keys(d.points[0] || {}).filter(function(k){ return k !== 'gen' && k !== 'ep'; })
          .map(function(k, i){ return { key:k, label:k, color:['#7fd8ff','#8fe8c8','#f2b64c','#f78c6b','#c77dff','#f72585'][i % 6] }; }) };
    }
    S.curvePoints = d.points;
    plotModel(mdl, d.points, (function(p){ return function(){ return p + gameT('g_tr_hist_curve'); }; })(path), '');
    $$('#curvesTable tbody tr').forEach(function(x, i){ x.classList.toggle('on', S.curves[i] && S.curves[i].path === path); });
  }).catch(function(e){ banner('err', gameT('g_tr_curve_fail', { e: e.message }), 'g_tr_curve_fail', { e: e.message }); });
}

/* ---------------- 历史：日志文件 ---------------- */
function refreshLogs(){
  get('/api/loglist').then(function(d){
    S.logs = d.logs || [];
    var tb = $('#logsTable tbody'); tb.innerHTML = '';
    S.logs.forEach(function(l){
      var tr = document.createElement('tr');
      tr.innerHTML = '<td>' + esc(l.name) + '</td><td>' + fmtBytes(l.size) + '</td><td>' + fmtTs(l.mtime) + '</td><td>' + gameT('g_tr_view') + '</td>';
      tr.onclick = function(){ showLogFile(l.name); };
      tb.appendChild(tr);
    });
    $('#logsEmpty').style.display = S.logs.length ? 'none' : 'block';
  }).catch(function(){});
}
function showLogFile(name){
  get('/api/log?name=' + encodeURIComponent(name)).then(function(d){
    if(!d || d.error){ banner('err', d && d.error); return; }
    var box = $('#logFileView');
    box.style.display = 'block';
    box.innerHTML = '<div class="ln sys">— ' + esc(d.name) + ' · ' + fmtBytes(d.size) + ' · ' + gameT('g_tr_tail2mb') + ' —</div>';
    d.text.split('\n').slice(-400).forEach(function(line){
      var el = document.createElement('div');
      el.className = 'ln' + (/错误|Error|失败/i.test(line) ? ' err' : '');
      el.textContent = line;
      box.appendChild(el);
    });
    box.scrollTop = box.scrollHeight;
  }).catch(function(e){ banner('err', gameT('g_tr_log_fail', { e: e.message }), 'g_tr_log_fail', { e: e.message }); });
}

/* ---------------- 检查点 / 续训 ---------------- */
function refreshCkpts(){
  get('/api/checkpoints').then(function(d){
    S.ckpts = (d && d.checkpoints) || [];
    var sel = $('#ckRun');
    if(!S.ckSel && S.ckpts.length) S.ckSel = S.ckpts[0].name;
    sel.innerHTML = S.ckpts.length
      ? S.ckpts.map(function(c){
          return '<option value="' + esc(c.name) + '"' + (c.name === S.ckSel ? ' selected' : '') + '>' +
            esc(c.name) + ' · ' + gameT('g_tr_copies', { n: c.count }) +
            (c.status && c.status !== 'running' ? ' · ' + esc(c.status) : '') + '</option>';
        }).join()
      : '<option value="">' + gameT('g_tr_none') + '</option>';
    renderCkpt();
  }).catch(function(e){ var m = $('#ckMeta'); if(m) m.textContent = gameT('g_tr_read_fail', { e: e.message }); });
}
function renderCkpt(){
  var r = (S.ckpts || []).filter(function(c){ return c.name === S.ckSel; })[0];
  var head = $('#ckHead'), tb = $('#ckptTable tbody'), meta = $('#ckMeta');
  if(!r){
    if(meta) meta.textContent = '—';
    head.innerHTML = ''; tb.innerHTML = '';
    $('#ckptEmpty').style.display = 'block';
    return;
  }
  $('#ckptEmpty').style.display = 'none';
  /* 列 = 该批次实际验证过的档（base / final / 各检查点 wr 的并集） */
  var tags = [];
  function collect(wr){
    if(!wr || typeof wr !== 'object') return;
    Object.keys(wr).forEach(function(k){ if(tags.indexOf(k) < 0) tags.push(k); });
  }
  collect(r.base); collect(r.final && r.final.wr);
  (r.checks || []).forEach(function(c){ collect(c.wr); });
  var names = { 'default': gameT('g_lvl_default'), 'hell': gameT('g_lvl_hell'), 'elite': gameT('g_lvl_elite'),
                 'extreme': gameT('g_lvl_extreme'), 'extreme-max': gameT('g_lvl_max') };
  head.innerHTML = '<th>ep</th><th>best</th><th>' + gameT('g_tr_best_ep') + '</th>' +
    tags.map(function(t){ return '<th>' + esc(names[t] || t) + '</th>'; }).join('') +
    '<th>' + gameT('g_tr_train_wr') + '</th><th>ε</th><th>' + gameT('g_tr_used') + '</th><th>' + gameT('g_tr_file') + '</th><th></th>';
  var rows = '';
  (r.checks || []).slice().reverse().forEach(function(c){
    var best = (c.best != null && c.best !== undefined) ? (+c.best * 100).toFixed(1) : '–';
    var cells = tags.map(function(t){
      var v = c.wr && c.wr[t];
      if(v === undefined || v === null) return '<td>–</td>';
      var b = r.base && r.base[t];
      var cls = b === undefined ? 'wr' : (v * 100 > b * 100 + 0.05 ? 'wr up' : (v * 100 < b * 100 - 0.05 ? 'wr dn' : 'wr'));
      return '<td class="' + cls + '">' + (v * 100).toFixed(1) + '</td>';
    }).join('');
    var tw = (c.trainWins != null && c.trainTotal > 0)
      ? (c.trainWins / c.trainTotal * 100).toFixed(0) + '%' : '–';
    var isBest = !!(r.best && r.best.ep === c.ep);
    var pill = !c.alive ? '<span class="pill dead">' + gameT('g_tr_eliminated') + '</span>'
      : (isBest ? '<span class="pill best">' + gameT('g_tr_best') + '</span>' : '<span class="pill live">' + gameT('g_tr_alive') + '</span>');
    rows += '<tr>' +
      '<td><b>' + (c.ep || 0) + '</b></td>' +
      '<td><b>' + esc(best) + '</b></td>' +
      '<td>' + (c.bestEp || '–') + '</td>' + cells +
      '<td>' + esc(tw) + '</td>' +
      '<td>' + (c.eps != null ? c.eps : '–') + '</td>' +
      '<td>' + fmtDur((c.sec || 0) * 1000) + '</td>' +
      '<td>' + pill + (c.size ? ' <span class="file">' + esc(fmtBytes(c.size)) + '</span>' : '') + '</td>' +
      '<td><button class="btn sm" data-ep="' + esc(c.ep) + '" data-file="' + esc(c.file || '') +
        '" data-best="' + (isBest ? '1' : '0') + '">' + gameT('g_tr_resume_btn') + '</button></td></tr>';
  });
  tb.innerHTML = rows;
  var alive = (r.checks || []).filter(function(c){ return c.alive; }).length;
  if(meta){
    meta.textContent = gameT('g_tr_ck_meta', { st: (r.status || '—'), tot: fmtH(r.elapsedSec),
        a: alive + '/' + (r.checks || []).length }) +
      (r.cfg && r.cfg.ckpt ? gameT('g_tr_ck_every', { n: r.cfg.ckpt }) : '');
  }
}
/* ---------------- 附着到进行中的训练 ---------------- */
/* argv → {键:值} / {键:true}。长跑跨页刷新不应丢进度，所以启动时自动接回 live run。 */
function argvToMap(argv){
  var o = {};
  for(var i = 0; i < (argv || []).length; i++){
    var a = argv[i];
    if(typeof a !== 'string' || a.indexOf('--') !== 0) continue;
    var k = a.slice(2), nxt = argv[i + 1];
    if(nxt !== undefined && nxt.charAt(0) !== '-') { o[k] = nxt; i++; }
    else o[k] = true;
  }
  return o;
}
function attachLive(){
  get('/api/runs').then(function(d){
    var live = (d.live || [])[0];
    if(!live || S.runId) return;
    var m = S.models.filter(function(x){ return x.id === live.model; })[0];
    if(!m) return;
    selectModel(live.model);
    var fromArgv = argvToMap(live.args);
    Object.keys(fromArgv).forEach(function(k){
      var f = (m.flags || []).filter(function(x){ return x.name === k; })[0];
      if(S.vals[k] !== undefined && fromArgv[k] !== true) S.vals[k] = fromArgv[k];
      else if(f) S.flags[k] = true;
    });
    if(live.dryRun === false && S.flags['no-save'] !== undefined) S.flags['no-save'] = false;
    buildFields(m); buildFlags(m); updateCmd();
    S.runId = live.id; S.runModel = m; S.runTicks = [];
    S.mx = null; S.hbN = 0; renderMatrix(); updateMeter();
    $('#logbox').innerHTML = '';
    logLine(gameT('g_tr_attached', { id: live.id, name: (live.modelName || m.name) }) +
      gameT(live.dryRun ? 'g_tr_dryrun_suffix' : 'g_tr_willwrite_suffix'), 'sys');
    logLine('$ ' + (live.cmd || ''), 'sys');
    $('#btnRun').disabled = true; $('#btnStop').disabled = false;
    setStatus(gameT('g_tr_running'), 'run');
    openSSE(live.id);
  }).catch(function(){});
}
/* 语言切换钩子(i18n.js 的 setGameLanguage 调用)：重画本文件负责的动态文案。
 * 注意:实时日志(logbox)是追加式历史,保留原始语言,不回溯重绘。 */
window.gameReapplyI18n = function(){
  try{
    if(S.models.length){
      renderCards();
      var m = cur();
      if(m){
        $('#cfgTitle').textContent = m.name + gameT('g_tr_cfg_suffix');
        buildPresets(m); buildFields(m); buildFlags(m); updateCmd();
      }
    }
    if(S.chart && S.plotPts) plotModel(S.chart.model, S.plotPts, resolveTitle(S.plotTitle), S.plotTag);
    else { renderMatrix(); updateMeter(); }
    if(S.ckpts.length) renderCkpt();
    if(S.tab === 'runs') refreshRuns();
    if(S.tab === 'curves') refreshCurves();
    if(S.tab === 'logs') refreshLogs();
    if(S.bannerText && S.bannerKey) banner(S.bannerKind, gameT(S.bannerKey, S.bannerData), S.bannerKey, S.bannerData);
    health();
    if(S.statusText !== undefined) setStatus(S.statusText, S.statusCls);
  }catch(e){ if(window.console) console.warn(e); }
};

/* 从检查点填回左侧配置：resume 指该批次 index.json（--resume-best 取最佳一份） */
function resumeFromCkpt(ep, file, isBest){
  var r = (S.ckpts || []).filter(function(c){ return c.name === S.ckSel; })[0];
  if(!r){ banner('warn', gameT('g_tr_no_ckpt'), 'g_tr_no_ckpt'); return; }
  var m = S.models.filter(function(x){ return x.script && x.script === r.script; })[0];
  if(!m){
    var base = String(r.script || '').split('/').pop();
    m = S.models.filter(function(x){ return x.script && x.script.split('/').pop() === base; })[0];
  }
  if(!m){ banner('warn', gameT('g_tr_script_missing', { s: (r.script || '—') }), 'g_tr_script_missing', { s: (r.script || '—') }); return; }
  selectModel(m.id);
  /* 顺带把原批次 cfgSnapshot 里的参数搬回来（cfg 是驼峰、参数是 CLI 名，做个别名映射）。
     关键意义在 --hours：默认 0 = 不限时，直接续训会变成永不结束的长跑；
     原批次的预算照搬，再让训练脚本扣掉已累计耗时，用户只需改一个数字。 */
  var names = {};
  (m.params || []).forEach(function(p){ names[p.name] = p; });
  var ALIAS = { layerLr:'layer-lr', gradClip:'grad-clip', epsReset:'eps-reset', run:'run-name' };
  var cfg = r.cfg || {}, got = [];
  Object.keys(cfg).forEach(function(k){
    if(k === 'noSave' || k === 'noCkpt' || k === 'trainMode') return;
    var n = ALIAS[k] || k;
    if(names[n] !== undefined){ S.vals[n] = cfg[k]; got.push(n); }
  });
  /* 曲线文件不在 cfg 里（存的是顶层字段）：续训必须在原曲线上接着写，
     否则脚本会把新点写进默认曲线文件，形成两条互不接续的曲线。 */
  if(r.curve && names['curve'] !== undefined) S.vals['curve'] = r.curve;
  if(r.from && names['from'] !== undefined) S.vals['from'] = r.from;
  if(r.save && names['save'] !== undefined) S.vals['save'] = r.save;
  if(r.run && names['run-name'] !== undefined) S.vals['run-name'] = r.run;
  S.vals['resume'] = r.idxPath;
  if(S.flags['no-save'] !== undefined) S.flags['no-save'] = !!cfg.noSave;
  if(S.flags['no-ckpt'] !== undefined) S.flags['no-ckpt'] = !!cfg.noCkpt;
  if(isBest) S.flags['resume-best'] = true;
  buildFields(m); buildFlags(m); updateCmd();
  logLine(gameT('g_tr_resume_filled', { p: r.idxPath, e: ep, f: (file || ''),
    b: (isBest ? gameT('g_tr_resume_best') : '') }), 'sys');
  if(got.length){
    var hrs = (typeof S.vals['hours'] === 'number') ? S.vals['hours'] : 0;
    logLine(gameT('g_tr_inherit', { n: got.length, l: got.slice(0, 8).join(', ') + (got.length > 8 ? ', …' : '') }) +
      gameT('g_tr_budget', { h: hrs }) +
      (hrs > 0 ? gameT('g_tr_budget_note', { t: ((r.elapsedSec || 0) / 3600).toFixed(2) }) : gameT('g_tr_budget_zero')) +
      gameT('g_tr_writes_label') + (S.flags['no-save'] ? gameT('g_tr_no_dry') : gameT('g_tr_yes')), 'sys');
  }
}

/* ---------------- 标签页 / 轮询 ---------------- */
function setTab(name){
  S.tab = name;
  $$('.tabbar button[data-tab]').forEach(function(b){ b.classList.toggle('on', b.dataset.tab === name); });
  $$('.tabpane').forEach(function(p){ p.classList.toggle('on', p.id === 'tab-' + name); });
  if(name === 'runs') refreshRuns();
  if(name === 'curves') refreshCurves();
  if(name === 'logs') refreshLogs();
  if(name === 'ckpt') refreshCkpts();
}
function health(){
  get('/api/health').then(function(d){
    S.health = d;
    $('#srvDot').className = 'dot on';
    $('#srvHint').textContent = gameT('g_tr_srv_ok', { n: d.runs });
    $('#nodeHint').textContent = gameT('g_tr_node', { v: (S.nodeVer || ''), c: (S.cpu || '') });
  }).catch(function(){
    $('#srvDot').className = 'dot off';
    $('#srvHint').textContent = gameT('g_tr_srv_off');
  });
}

/* ---------------- 启动 ---------------- */
function bind(){
  $('#btnRun').onclick = startRun;
  $('#btnStop').onclick = stopRun;
  $('#btnRefresh').onclick = function(){ boot(); };
  $('#btnClear').onclick = function(){ $('#logbox').innerHTML = ''; };
  $('#btnApplyRaw').onclick = updateCmd;
  $('#ckRun').onchange = function(e){ S.ckSel = e.target.value; renderCkpt(); };
  $('#btnCkRefresh').onclick = function(){ refreshCkpts(); };
  $('#ckptTable').onclick = function(e){
    var b = e.target && e.target.closest ? e.target.closest('button[data-ep]') : null;
    if(!b) return;
    resumeFromCkpt(Number(b.dataset.ep), b.dataset.file, b.dataset.best === '1');
  };
  $$('.tabbar button[data-tab]').forEach(function(b){ b.onclick = function(){ setTab(b.dataset.tab); }; });
  $('#chkAuto').onchange = function(e){ S.auto = e.target.checked; if(S.auto) $('#logbox').scrollTop = $('#logbox').scrollHeight; };
  $('#chkNorm').onchange = function(e){
    S.norm = e.target.checked;
    if(S.runId && S.runTicks.length) plotModel(S.runModel, S.runTicks, function(){ return S.runModel.name + gameT('g_tr_training'); }, '');
    else if(S.curvePoints) plotModel(S.chart.model, S.curvePoints, S.plotTitle, S.plotTag);
  };
}
function boot(){
  banner(null, '');
  get('/api/models').then(function(d){
    S.models = d.models || []; S.nodeVer = d.node; S.cpu = d.cpus;
    $('#nodeHint').textContent = gameT('g_tr_node_models', { v: d.node, c: d.cpus, m: d.models.length });
    return get('/api/meta');
  }).then(function(d){
    S.meta = d.meta || {};
    if(!S.chart) mkChart();
    renderCards();
    if(!S.sel && S.models.length) selectModel(S.models[0].id);
    logLine(gameT('g_tr_ready', { n: S.models.length }), 'sys');
    health();
    attachLive();
  }).catch(function(e){
    banner('err', gameT('g_tr_cant_connect', { e: e.message }), 'g_tr_cant_connect', { e: e.message });
  });
}

if(typeof Chart === 'undefined'){
  banner('err', gameT('g_tr_no_chart'), 'g_tr_no_chart');
} else {
  bind(); boot();
  setInterval(health, 10000);
  setInterval(function(){ if(S.tab === 'runs') refreshRuns(); else if(S.tab === 'ckpt') refreshCkpts(); }, 8000);
  /* 进度条按秒走：两次打点之间也要能动（打点间隔可达一分钟以上） */
  setInterval(function(){ if(S.runId) updateMeter(); }, 1000);
}

})();
