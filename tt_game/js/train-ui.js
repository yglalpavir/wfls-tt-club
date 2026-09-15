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
function banner(kind, text){
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
  if(e.missing) return '<span class="bad">权重缺失</span>';
  var mt = e.meta || {};
  var bits = [];
  if(mt.trainedAt) bits.push('<span>训练</span> <b>' + esc(mt.trainedAt) + '</b>');
  if(mt.evalDefault != null) bits.push('<span>vs默认</span> <b class="ok">' + (mt.evalDefault * 100).toFixed(1) + '%</b>');
  if(mt.evalHell != null) bits.push('<span>vs地狱</span> <b class="ok">' + (mt.evalHell * 100).toFixed(1) + '%</b>');
  if(mt.fitness != null) bits.push('<span>fit</span> <b>' + mt.fitness.toFixed(3) + '</b>');
  if(mt.pointRateVsDefault != null) bits.push('<span>vs默认</span> <b class="ok">' + (mt.pointRateVsDefault * 100).toFixed(1) + '%</b>');
  if(mt.pointRateVsPlayer != null) bits.push('<span>vs玩家</span> <b class="ok">' + (mt.pointRateVsPlayer * 100).toFixed(1) + '%</b>');
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
      '<div class="mrow"><span>脚本</span> <b>' + esc(m.script) + '</b></div>';
    el.onclick = function(){ selectModel(m.id); };
    box.appendChild(el);
  });
}

/* ---------------- 配置面板 ---------------- */
function paramDefs(m){
  var out = (m.params || []).map(function(p){ return p; });
  if(m.extraArgs) Object.keys(m.extraArgs).forEach(function(k){
    out.push({ name:k, label:k + ' <small>(额外参数)</small>', type:'text', default:m.extraArgs[k] });
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
    var b = document.createElement('button'); b.className = 'btn sm'; b.textContent = pr.name;
    b.onclick = function(){
      (m.params || []).forEach(function(p){ S.vals[p.name] = pr.args[p.name] !== undefined ? pr.args[p.name] : p.default; });
      $$('#presets .btn').forEach(function(x){ x.classList.remove('on'); });
      b.classList.add('on');
      buildFields(m); updateCmd(); logLine('预设「' + pr.name + '」：' + JSON.stringify(pr.args), 'sys');
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
    w.innerHTML = '<b>实验模式</b>：本次不会覆盖 ' + esc((m.writes || []).join('、'));
  } else if(payload.dryRun !== false){
    w.className = 'warn ok'; w.innerHTML = '<b>实验模式</b>：本次不会写入生产权重';
  } else {
    w.className = 'warn';
    w.innerHTML = '<b>将写入产物</b>：' + esc((m.writes || []).join('、')) +
      '<br>会替换游戏当前使用的模型，请确认。';
  }
}
function cur(){ return S.models.filter(function(m){ return m.id === S.sel; })[0] || null; }

function selectModel(id){
  var m = S.models.filter(function(x){ return x.id === id; })[0];
  if(!m) return;
  S.sel = id; S.vals = {}; S.flags = {};
  S.models.forEach(function(x){ if(x.id === id){
    (x.params || []).forEach(function(p){ S.vals[p.name] = p.default; });
    (x.flags || []).forEach(function(f){ S.flags[f.name] = f.default; });
  }});
  renderCards();
  $('#cfgTitle').textContent = m.name + ' · 配置';
  $('#cfgScript').textContent = m.script;
  buildPresets(m); buildFields(m); buildFlags(m); updateCmd();
  $('#rawArgs').value = '';
  if(!S.runId){ plotModel(m, [], m.name + ' · 未开始训练', ''); }
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
          title: { display:true, text:'训练进度', color:'#6d7788', font:{ size:10 } }
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
            title: function(items){ return S.chartTag || '数据点'; },
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
function plotModel(model, points, title, tag){
  if(!S.chart) mkChart();
  S.chart.model = model; S.chart.unit = model.yUnit || 'rate'; S.chartTag = tag || '';
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
  S.chart.options.scales.x.title.text = norm ? '训练进度 (%)' : (model.xKey === 'gen' ? '代数 gen' : '轮次 ep');
  S.chart.options.scales.x.min = 0;
  S.chart.options.scales.x.max = norm ? 100 : (mx > 0 ? mx : undefined);
  S.chartTag = tag || '';
  $('#chartTitle').textContent = title;
  $('#chartTag').textContent = tag ? (tag + ' · ' + points.length + ' 点') : (points.length + ' 点');
  S.hidden = {};
  renderLegend(); S.chart.update('none'); renderReadout(points);
}
function renderLegend(){
  var m = S.chart.model; if(!m) return;
  var box = $('#legend'); box.innerHTML = '';
  (m.series || []).forEach(function(s){
    var el = document.createElement('span');
    if(S.hidden[s.key]) el.className = 'off';
    el.innerHTML = '<i style="background:' + s.color + '"></i>' + esc(s.label) +
      (s.axis === 'right' ? ' <small style="color:#6d7788">右轴</small>' : '');
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
    bits.push('<span>' + esc(s.label) + ' 峰值 <b>' + (v === null ? '–' : fmt(v)) + '</b>' +
      (cur2 !== null ? ' 当前 <b>' + fmt(cur2) + '</b>' : '') + '</span>');
  });
  if(last){
    bits.push('<span>最新 ' + esc(String(xOf(last, m))) + '</span>');
    if(last.sec !== undefined) bits.push('<span>耗时 <b>' + fmtDur(last.sec * 1000) + '</b></span>');
    if(last.lr !== undefined) bits.push('<span>lr <b>' + last.lr + '</b></span>');
    if(last.eps !== undefined) bits.push('<span>eps <b>' + last.eps + '</b></span>');
    if(last.evals !== undefined) bits.push('<span>evals <b>' + last.evals + '</b></span>');
  }
  $('#readout').innerHTML = bits.join('');
}

/* ---------------- 启动 / 停止 ---------------- */
function setStatus(text, cls){
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
  es.onerror = function(){ setStatus('连接断开', 'err'); };
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
    var t = Object.assign({}, msg);
    S.runTicks.push(t);
    plotModel(m, S.runTicks, m.name + ' · 训练中', 'gen ' + (t[m.xKey] !== undefined ? t[m.xKey] : ''));
    var total = S.vals[m.xKey === 'gen' ? 'gens' : 'games'];
    var x = xOf(t, m);
    if(t.sec !== undefined && total && x > 0){
      var eta = (total - x) * (t.sec / x);
      $('#chartTag').textContent += ' · ETA ' + fmtDur(eta * 1000);
    }
    return;
  }
  if(msg.kind === 'exit'){
    logLine('■ 进程结束 · code=' + msg.code + ' · ' + fmtDur(msg.sec * 1000), 'sys');
    /* closeRun 会清掉 runModel，先在此刷新一次图表标题与读数，避免停留在「训练中」 */
    if(S.runModel && S.runTicks.length){
      plotModel(S.runModel, S.runTicks, S.runModel.name + ' · ' + (msg.status === 'done' ? '已完成' : '异常结束'),
                S.chartTag || (S.runTicks.length + ' 点'));
    }
    closeRun(msg.status === 'error' ? 'err' : '');
    setStatus(msg.status === 'done' ? '已完成' : '异常结束', msg.status === 'done' ? '' : 'err');
    refreshRuns();
  }
}
function startRun(){
  var m = cur(); if(!m) return;
  if(S.runId){ logLine('已有训练在跑（' + S.runId + '），请先停止', 'sys'); return; }
  var payload = argsFromUI(m);
  post('/api/run', { model:m.id, args:payload.args, flags:payload.flags, rawArgs:payload.rawArgs, dryRun:payload.dryRun })
    .then(function(r){
      S.runId = r.id; S.runTicks = []; S.runModel = m;
      $('#logbox').innerHTML = '';
      logLine('$ ' + r.cmd, 'sys');
      logLine('runId=' + r.id + (payload.dryRun ? ' · 实验模式' : ' · 将写入产物'), 'sys');
      $('#btnRun').disabled = true; $('#btnStop').disabled = false;
      setStatus('训练中', 'run');
      openSSE(r.id);
    })
    .catch(function(e){ banner('err', '启动失败：' + e.message); logLine('启动失败：' + e.message, 'err'); });
}
function stopRun(){
  if(!S.runId) return;
  post('/api/stop/' + encodeURIComponent(S.runId)).then(function(){
    logLine('■ 已发送停止信号…', 'sys');
  }).catch(function(e){ logLine('停止失败：' + e.message, 'err'); });
}
function closeRun(cls){
  S.runId = null; S.runModel = null;
  if(S.es){ try{ S.es.close(); }catch(e){} S.es = null; }
  $('#btnRun').disabled = false; $('#btnStop').disabled = true;
  if(cls) setStatus(cls === 'err' ? '异常结束' : '已完成', cls);
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
        '<td>' + esc(r.modelName || r.model) + (r.dryRun ? '' : ' <span class="pill error">写入</span>') + '</td>' +
        '<td style="max-width:230px;overflow:hidden;text-overflow:ellipsis">' + esc(r.cmd) + '</td>' +
        '<td><span class="pill ' + (r.status === 'running' ? 'running' : r.status === 'done' ? 'done' : 'error') + '">' + esc(r.status) + '</span></td>' +
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
          if(mdl) plotModel(mdl, r.pts, (r.modelName || r.model) + ' · 历史回放 ' + r.id, r.cmd);
        } else {
          banner('warn', '该记录没有保留打点数据（可能早于本次改造，或为冒烟自检）');
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
    if(!d || d.error){ banner('err', '读取曲线失败：' + (d && d.error)); return; }
    var mdl = S.models.filter(function(x){ return x.id === (modelId || d.model); })[0];
    if(!mdl){
      mdl = { name:'未知模型', xKey: d.xKey || 'gen', yUnit:'rate', color:'#7fd8ff',
        series: Object.keys(d.points[0] || {}).filter(function(k){ return k !== 'gen' && k !== 'ep'; })
          .map(function(k, i){ return { key:k, label:k, color:['#7fd8ff','#8fe8c8','#f2b64c','#f78c6b','#c77dff','#f72585'][i % 6] }; }) };
    }
    S.curvePoints = d.points;
    plotModel(mdl, d.points, path + ' · 历史曲线', '');
    $$('#curvesTable tbody tr').forEach(function(x, i){ x.classList.toggle('on', S.curves[i] && S.curves[i].path === path); });
  }).catch(function(e){ banner('err', '读取曲线失败：' + e.message); });
}

/* ---------------- 历史：日志文件 ---------------- */
function refreshLogs(){
  get('/api/loglist').then(function(d){
    S.logs = d.logs || [];
    var tb = $('#logsTable tbody'); tb.innerHTML = '';
    S.logs.forEach(function(l){
      var tr = document.createElement('tr');
      tr.innerHTML = '<td>' + esc(l.name) + '</td><td>' + fmtBytes(l.size) + '</td><td>' + fmtTs(l.mtime) + '</td><td>查看</td>';
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
    box.innerHTML = '<div class="ln sys">— ' + esc(d.name) + ' · ' + fmtBytes(d.size) + ' · 末尾 2MB —</div>';
    d.text.split('\n').slice(-400).forEach(function(line){
      var el = document.createElement('div');
      el.className = 'ln' + (/错误|Error|失败/i.test(line) ? ' err' : '');
      el.textContent = line;
      box.appendChild(el);
    });
    box.scrollTop = box.scrollHeight;
  }).catch(function(e){ banner('err', '读取日志失败：' + e.message); });
}

/* ---------------- 标签页 / 轮询 ---------------- */
function setTab(name){
  S.tab = name;
  $$('.tabbar button[data-tab]').forEach(function(b){ b.classList.toggle('on', b.dataset.tab === name); });
  $$('.tabpane').forEach(function(p){ p.classList.toggle('on', p.id === 'tab-' + name); });
  if(name === 'runs') refreshRuns();
  if(name === 'curves') refreshCurves();
  if(name === 'logs') refreshLogs();
}
function health(){
  get('/api/health').then(function(d){
    S.health = d;
    $('#srvDot').className = 'dot on';
    $('#srvHint').textContent = '服务正常 · ' + d.runs + ' 个 run';
    $('#nodeHint').textContent = 'Node ' + (S.nodeVer || '') + ' · CPU ' + (S.cpu || '') + ' 核';
  }).catch(function(){
    $('#srvDot').className = 'dot off';
    $('#srvHint').textContent = '服务离线';
  });
}

/* ---------------- 启动 ---------------- */
function bind(){
  $('#btnRun').onclick = startRun;
  $('#btnStop').onclick = stopRun;
  $('#btnRefresh').onclick = function(){ boot(); };
  $('#btnClear').onclick = function(){ $('#logbox').innerHTML = ''; };
  $('#btnApplyRaw').onclick = updateCmd;
  $$('.tabbar button[data-tab]').forEach(function(b){ b.onclick = function(){ setTab(b.dataset.tab); }; });
  $('#chkAuto').onchange = function(e){ S.auto = e.target.checked; if(S.auto) $('#logbox').scrollTop = $('#logbox').scrollHeight; };
  $('#chkNorm').onchange = function(e){
    S.norm = e.target.checked;
    if(S.runId && S.runTicks.length) plotModel(S.runModel, S.runTicks, S.runModel.name + ' · 训练中', '');
    else if(S.curvePoints) plotModel(S.chart.model, S.curvePoints, $('#chartTitle').textContent, S.chartTag);
  };
}
function boot(){
  banner(null, '');
  get('/api/models').then(function(d){
    S.models = d.models || []; S.nodeVer = d.node; S.cpu = d.cpus;
    $('#nodeHint').textContent = 'Node ' + d.node + ' · CPU ' + d.cpus + ' 核 · ' + d.models.length + ' 个模型';
    return get('/api/meta');
  }).then(function(d){
    S.meta = d.meta || {};
    if(!S.chart) mkChart();
    renderCards();
    if(!S.sel && S.models.length) selectModel(S.models[0].id);
    logLine('控制台就绪 · ' + S.models.length + ' 个模型可训练', 'sys');
    health();
  }).catch(function(e){
    banner('err', '无法连接服务：' + e.message + ' — 请先运行 node server.js');
  });
}

if(typeof Chart === 'undefined'){
  banner('err', 'Chart.js 未加载（CDN 不可达，可能是离线环境）——图表功能不可用，其余 API 仍可通过命令行训练。');
} else {
  bind(); boot();
  setInterval(health, 10000);
  setInterval(function(){ if(S.tab === 'runs') refreshRuns(); }, 8000);
}

})();
