/* =====================================================================
 *  server.js — 训练可视化控制台（零依赖 node:http + SSE）
 *  · 纯 Node 标准库，无 npm 依赖：`node server.js` 即可启动
 *  · 静态托管仓库文件（游戏 index.html 与训练台 train.html 都在里面）
 *  · 启动训练 = spawn 现有 tools/train*.js 子进程，注入 TT_TELEMETRY=1
 *  · 子进程每代/每 ep 输出 ##TT##{json} 打点行，服务端切分后走 SSE 推给前端
 *  · 用法：
 *      node server.js                     # 127.0.0.1:8123
 *      node server.js --port 9000
 *      node server.js --host 0.0.0.0
 *  · 前端：http://127.0.0.1:8123/train     游戏：http://127.0.0.1:8123/
 * ===================================================================== */
'use strict';
const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');

const ROOT = __dirname;
const TELE_TAG = '##TT##';
const LOG_KEEP = 3000;      // 每个 run 保留的日志行数
const SSE_HEARTBEAT = 25000;

/* ---- 参数 ---- */
const argv = process.argv.slice(2);
const opt = { port: 8123, host: '127.0.0.1' };
for(let i = 0; i < argv.length; i++){
  if(argv[i] === '--port') opt.port = parseInt(argv[++i], 10);
  else if(argv[i] === '--host') opt.host = argv[++i];
}

/* ---- 模型清单 ---- */
const REG_PATH = path.join(ROOT, 'tools', 'model-registry.json');
let REG = { models: [] };
try{ REG = JSON.parse(fs.readFileSync(REG_PATH, 'utf8')); }
catch(e){ console.error('[server] 无法读取 tools/model-registry.json：' + e.message); }
const MODEL = new Map(REG.models.map(m => [m.id, m]));

/* ---- 安全路径 ---- */
function safeJoin(rel){
  if(typeof rel !== 'string' || !rel) return null;
  const p = path.normalize(path.join(ROOT, rel.replace(/^\/+/, '')));
  if(p !== ROOT && !p.startsWith(ROOT + path.sep)) return null;
  return p;
}
const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8', '.txt': 'text/plain; charset=utf-8',
  '.log': 'text/plain; charset=utf-8', '.err': 'text/plain; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.gif': 'image/gif',
  '.ico': 'image/x-icon', '.woff': 'font/woff', '.woff2': 'font/woff2',
  '.ttf': 'font/ttf', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg',
};
function mimeOf(p){ return MIME[path.extname(p).toLowerCase()] || 'application/octet-stream'; }

/* ---- HTTP 基础件 ---- */
function send(res, code, body, type){
  const buf = Buffer.isBuffer(body) ? body : Buffer.from(String(body), 'utf8');
  res.writeHead(code, {
    'Content-Type': type || 'text/plain; charset=utf-8',
    'Content-Length': buf.length,
    'Cache-Control': 'no-store',
  });
  res.end(buf);
}
const sendJSON = (res, code, obj) => send(res, code, JSON.stringify(obj), 'application/json; charset=utf-8');
function readBody(req, limit){
  limit = limit || 1048576;
  return new Promise((resolve, reject) => {
    const chunks = []; let n = 0;
    req.on('data', c => { n += c.length; if(n > limit){ reject(new Error('body too large')); req.destroy(); } else chunks.push(c); });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

/* =====================================================================
 *  运行管理
 * ===================================================================== */
const runs = new Map();       // id -> run 对象
let runSeq = 0;
const HISTORY_PATH = path.join(ROOT, 'data', 'runs.json');

function loadHistory(){
  try{ return JSON.parse(fs.readFileSync(HISTORY_PATH, 'utf8')); }catch(e){ return []; }
}
function saveHistory(h){
  try{
    fs.mkdirSync(path.dirname(HISTORY_PATH), { recursive: true });
    fs.writeFileSync(HISTORY_PATH, JSON.stringify(h.slice(0, 100), null, 2), 'utf8');
  }catch(e){ console.error('[server] 写入 data/runs.json 失败：' + e.message); }
}

function buildArgs(model, payload){
  const args = [];
  if(payload.args && typeof payload.args === 'object'){
    for(const k of Object.keys(payload.args)){
      const v = payload.args[k];
      if(v === null || v === undefined || v === false || v === '') continue;
      args.push('--' + String(k), String(v));
    }
  }
  /* 布尔 flag 与 dryRunArgs 会重复出现（清单里 noSave 默认勾选 + dryRunArgs 也带 --no-save），
     去重让实际命令与 UI 预览都干净；params 与 rawArgs 保持原样（后者是用户显式输入） */
  const seenFlag = new Set();
  const addFlag = a => { if(!seenFlag.has(a)){ seenFlag.add(a); args.push(a); } };
  if(payload.flags && Array.isArray(payload.flags)){
    for(const f of payload.flags){ if(f) addFlag('--' + String(f)); }
  }
  if(payload.rawArgs && typeof payload.rawArgs === 'string'){
    for(const t of payload.rawArgs.trim().split(/\s+/)){ if(t) args.push(t); }
  }
  if(payload.dryRun !== false){
    for(const a of (model.dryRunArgs || [])) addFlag(a);   // 默认实验模式：不覆盖生产权重
  }
  return args;
}

function startRun(payload){
  const model = MODEL.get(payload && payload.model);
  if(!model) throw new Error('未知模型：' + (payload && payload.model));
  const args = buildArgs(model, payload || {});
  const id = 'r' + (++runSeq) + '-' + Date.now().toString(36);
  /* model.script 已是仓库相对路径（如 tools/train.js），直接用；safeJoin 校验防清单被篡改后指向仓库外 */
  const scriptPath = model.script;
  const scriptAbs = safeJoin(scriptPath);
  if(!scriptAbs) throw new Error('脚本路径非法（必须位于仓库内）：' + model.script);
  const proc = spawn(process.execPath, [scriptAbs, ...args], {
    cwd: ROOT,
    env: Object.assign({}, process.env, { TT_TELEMETRY: '1', NO_COLOR: '1' }),
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const run = {
    id, model: model.id, modelName: model.name, script: scriptPath,
    cmd: '"node ' + scriptPath.replace(/\\/g, '/') + ' ' + args.join(' ') + '"',
    args, dryRun: payload && payload.dryRun !== false,
    status: 'running', code: null, startedAt: Date.now(), endedAt: null,
    log: [], ticks: [], phases: [], listeners: new Set(),
    stdoutBuf: '', stderrBuf: '', proc,
  };
  runs.set(id, run);

  const pushLine = (text, stream) => {
    if(!text) return;
    const lines = text.split('\n');
    for(let i = 0; i < lines.length; i++){
      const ln = lines[i].replace(/\r$/, '');
      if(!ln) continue;
      if(ln.indexOf(TELE_TAG) === 0){ handleTelemetry(run, ln); continue; }   // 打点行不进入可视日志
      run.log.push({ ts: Date.now(), s: stream, text: ln });
      if(run.log.length > LOG_KEEP) run.log.splice(0, run.log.length - LOG_KEEP);
      broadcast(run, { kind: 'line', ts: Date.now(), s: stream, text: ln });
    }
  };
  proc.stdout.on('data', d => pushLine(d.toString('utf8'), 'out'));
  proc.stderr.on('data', d => pushLine(d.toString('utf8'), 'err'));
  proc.on('error', err => {
    run.status = 'error'; run.code = -1; run.endedAt = Date.now();
    pushLine('进程启动失败：' + err.message, 'err');
    broadcast(run, { kind: 'exit', code: -1 });
  });
  proc.on('close', code => {
    if(run.status === 'running'){
      run.status = code === 0 ? 'done' : 'error';
      run.code = code;
      run.endedAt = Date.now();
    }
    broadcast(run, { kind: 'exit', code, status: run.status, sec: +((run.endedAt - run.startedAt) / 1000).toFixed(1) });
    const h = loadHistory();
    h.unshift({
      id: run.id, model: run.model, modelName: run.modelName, cmd: run.cmd, dryRun: run.dryRun,
      status: run.status, code: run.code, startedAt: run.startedAt, endedAt: run.endedAt,
      ticks: run.ticks.length,
      last: run.ticks.length ? run.ticks[run.ticks.length - 1] : null,
      best: summarize(run.ticks, MODEL.get(run.model)),
      pts: downsample(run.ticks, 1200),
    });
    saveHistory(h);
  });
  return run;
}

/* 摘要：取每个 series key 在全部打点中的最大值 */
function summarize(ticks, model){
  const out = {};
  if(!ticks || !ticks.length || !model) return out;
  for(const s of (model.series || [])){
    let mx = -Infinity, at = null;
    for(const t of ticks){
      const v = Number(t[s.key]);
      if(isFinite(v) && v > mx){ mx = v; at = t[model.xKey]; }
    }
    if(isFinite(mx)) out[s.key] = +mx.toFixed(4);
  }
  return out;
}

/* 降采样打点用于历史持久化（等间隔取，保留首尾） */
function downsample(ticks, cap){
  cap = cap || 1200;
  if(!ticks || ticks.length <= cap) return ticks || [];
  const step = ticks.length / cap;
  const out = [];
  for(let i = 0; i < cap; i++) out.push(ticks[Math.min(ticks.length - 1, Math.floor(i * step))]);
  return out;
}

function broadcast(run, ev){
  for(const res of run.listeners){
    try{ res.write('data: ' + JSON.stringify(ev) + '\n\n'); }catch(e){ /* 忽略 */ }
  }
}

function stopRun(id){
  const run = runs.get(id);
  if(!run) return false;
  if(run.status !== 'running') return false;
  try{ run.proc.kill('SIGTERM'); }catch(e){ /* 忽略 */ }
  const timer = setTimeout(() => { try{ run.proc.kill('SIGKILL'); }catch(e){ /* 忽略 */ } }, 2000);
  timer.unref && timer.unref();
  return true;
}

function runPublic(run){
  return {
    id: run.id, model: run.model, modelName: run.modelName, script: run.script, cmd: run.cmd,
    args: run.args, dryRun: run.dryRun, status: run.status, code: run.code,
    startedAt: run.startedAt, endedAt: run.endedAt,
    sec: run.startedAt ? +(((run.endedAt || Date.now()) - run.startedAt) / 1000).toFixed(1) : 0,
    ticks: run.ticks.length, phases: run.phases,
    last: run.ticks.length ? run.ticks[run.ticks.length - 1] : null,
    best: summarize(run.ticks, MODEL.get(run.model)),
  };
}

/* =====================================================================
 *  历史产物：curve / meta / 日志
 * ===================================================================== */
function walk(dir, out, depth){
  if(depth > 3) return;
  let entries;
  try{ entries = fs.readdirSync(dir, { withFileTypes: true }); }catch(e){ return; }
  for(const e of entries){
    if(e.name === 'node_modules' || e.name === '.git' || e.name.startsWith('.')) continue;
    const p = path.join(dir, e.name);
    if(e.isDirectory()) walk(p, out, depth + 1);
    else out.push(p);
  }
}
function curveList(){
  const all = []; walk(ROOT, all, 0);
  const out = [];
  for(const p of all){
    const rel = path.relative(ROOT, p).replace(/\\/g, '/');
    if(!/curve[^/]*\.json$/i.test(rel)) continue;
    let st; try{ st = fs.statSync(p); }catch(e){ continue; }
    let count = -1, xKey = null;
    try{
      const arr = JSON.parse(fs.readFileSync(p, 'utf8'));
      if(Array.isArray(arr) && arr.length){ count = arr.length; xKey = arr[0].gen !== undefined ? 'gen' : (arr[0].ep !== undefined ? 'ep' : null); }
    }catch(e){ /* 保留但标记 */ }
    const owner = REG.models.find(m => path.basename(m.curve) === path.basename(rel));
    out.push({ path: rel, size: st.size, mtime: st.mtimeMs, count, xKey, model: owner ? owner.id : null, name: path.basename(rel) });
  }
  out.sort((a, b) => b.mtime - a.mtime);
  return out;
}
function readCurve(rel){
  const p = safeJoin(rel);
  if(!p || !fs.existsSync(p)) return null;
  const data = JSON.parse(fs.readFileSync(p, 'utf8'));
  if(!Array.isArray(data)) return null;
  const xKey = data.length && data[0].gen !== undefined ? 'gen' : 'ep';
  const owner = REG.models.find(m => path.basename(m.curve) === path.basename(rel));
  return { path: rel.replace(/\\/g, '/'), count: data.length, xKey, model: owner ? owner.id : null, points: data };
}
function readMeta(){
  const out = {};
  for(const m of REG.models){
    if(!m.metaConst) continue;
    const p = safeJoin(m.weightFile);
    let text = '';
    try{ text = fs.readFileSync(p, 'utf8'); }catch(e){ out[m.id] = { missing: true, weightFile: m.weightFile }; continue; }
    const re = new RegExp('const\\s+' + m.metaConst + '\\s*=\\s*(\\{[\\s\\S]*?\\});');
    const hit = text.match(re);
    const hasPolicy = /const\s+LEARNED_POLICY\s*=/.test(text) || /const\s+GRANDSLAM_POLICY\s*=/.test(text) || /const\s+INPUT_AI_WEIGHTS\s*=/.test(text);
    out[m.id] = hit
      ? { missing: false, weightFile: m.weightFile, hasWeights: hasPolicy, meta: JSON.parse(hit[1]) }
      : { missing: false, weightFile: m.weightFile, hasWeights: hasPolicy, meta: null };
  }
  return out;
}
function logList(){
  const out = [];
  for(const name of fs.readdirSync(ROOT)){
    if(!/\.(log|err)$/i.test(name)) continue;
    const p = path.join(ROOT, name);
    let st; try{ st = fs.statSync(p); }catch(e){ continue; }
    out.push({ name, size: st.size, mtime: st.mtimeMs });
  }
  out.sort((a, b) => b.mtime - a.mtime);
  return out;
}
function readLog(name){
  if(!/^[A-Za-z0-9_.-]+\.([A-Za-z0-9]+)$/.test(name)) return null;
  const p = safeJoin(name);
  if(!p || !fs.existsSync(p)) return null;
  const st = fs.statSync(p);
  const size = Math.min(st.size, 2 * 1024 * 1024);
  const fd = fs.openSync(p, 'r');
  const buf = Buffer.alloc(size);
  fs.readSync(fd, buf, 0, size, st.size - size);
  fs.closeSync(fd);
  return { name, size: st.size, mtime: st.mtimeMs, text: buf.toString('utf8') };
}

/* =====================================================================
 *  SSE
 * ===================================================================== */
function sseStart(res){
  res.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  res.write('retry: 3000\n\n');
}
function sseSend(res, ev){
  try{ res.write('data: ' + JSON.stringify(ev) + '\n\n'); }catch(e){ /* 忽略 */ }
}
function sseOpen(req, run, res){
  sseStart(res);
  run.listeners.add(res);
  /* 先重放已有内容（刷新页面不丢历史） */
  for(const ph of run.phases) sseSend(res, { kind: 'phase', ts: Date.now(), ...ph });
  for(let i = 0; i < run.log.length; i++) sseSend(res, { kind: 'line', ts: Date.now(), s: run.log[i].s, text: run.log[i].text });
  for(let i = 0; i < run.ticks.length; i++) sseSend(res, { kind: 'tick', ts: Date.now(), ...run.ticks[i] });
  if(run.status !== 'running') sseSend(res, { kind: 'exit', code: run.code, status: run.status, sec: runPublic(run).sec });
  const hb = setInterval(() => { try{ res.write(': hb\n\n'); }catch(e){ /* 忽略 */ } }, SSE_HEARTBEAT);
  req.on('close', () => {
    clearInterval(hb);
    run.listeners.delete(res);
  });
}

/* 把 telemetry 打点行从日志流里切出来 */
function handleTelemetry(run, line){
  const body = line.slice(TELE_TAG.length).trim();
  let obj;
  try{ obj = JSON.parse(body); }catch(e){ return false; }
  if(!obj || typeof obj !== 'object') return false;
  if(obj.t === 'phase'){ run.phases.push({ phase: obj.phase, msg: obj.msg }); broadcast(run, { kind: 'phase', phase: obj.phase, msg: obj.msg }); }
  else { run.ticks.push(obj); broadcast(run, { kind: 'tick', ...obj }); }
  return true;
}

/* =====================================================================
 *  路由
 * ===================================================================== */
const server = http.createServer(async (req, res) => {
  const u = new URL(req.url, 'http://' + (req.headers.host || 'localhost'));
  const p = decodeURIComponent(u.pathname);
  const method = req.method || 'GET';

  /* ---- API ---- */
  if(p === '/api/models'){
    return sendJSON(res, 200, { models: REG.models, node: process.version, platform: process.platform, cpus: os.cpus().length });
  }
  if(p === '/api/runs'){
    const live = [];
    for(const r of runs.values()) if(r.status === 'running') live.push(runPublic(r));
    return sendJSON(res, 200, { live, history: loadHistory().slice(0, 30) });
  }
  if(p === '/api/curves'){ return sendJSON(res, 200, { curves: curveList() }); }
  if(p === '/api/loglist'){ return sendJSON(res, 200, { logs: logList() }); }

  /* ---- 实机遥测（tt-stats.js 经 navigator.sendBeacon 上报）----
   * 仓库里所有胜率都是仿真内数据；这是唯一能回答"实机到底变强没有"的数据。 */
  const TTSTATS_PATH = path.join(ROOT, 'data', 'tt-stats.jsonl');
  if(p === '/api/ttstats' && method === 'GET'){
    let lines = [];
    try{
      const raw = fs.readFileSync(TTSTATS_PATH, 'utf8').split(/\r?\n/).filter(Boolean);
      lines = raw.slice(-200).map(s => { try{ return JSON.parse(s); }catch(e){ return null; } }).filter(Boolean);
    }catch(e){ lines = []; }
    /* 按 matchup 聚合：同 pair 的实机得分份额 */
    const agg = {};
    for(const e of lines){
      const k = e.pair || '?';
      if(!agg[k]) agg[k] = { pair: k, dqnPts: 0, oppPts: 0, samples: 0 };
      const s = e.share; if(!s) continue;
      agg[k].dqnPts += s.dqnPts || 0; agg[k].oppPts += s.oppPts || 0; agg[k].samples++;
    }
    for(const k of Object.keys(agg)){
      const a = agg[k];
      a.total = a.dqnPts + a.oppPts;
      a.share = a.total ? +(a.dqnPts / a.total * 100).toFixed(1) : null;
      delete a.samples;
    }
    return sendJSON(res, 200, { entries: lines, pairs: Object.values(agg) });
  }
  if(p === '/api/ttstats' && method === 'POST'){
    let body;
    try{ body = JSON.parse((await readBody(req)) || '{}'); }
    catch(e){ return sendJSON(res, 400, { error: '请求体不是合法 JSON' }); }
    try{
      fs.mkdirSync(path.dirname(TTSTATS_PATH), { recursive: true });
      fs.appendFileSync(TTSTATS_PATH, JSON.stringify(body) + '\n', 'utf8');
      const raw = fs.readFileSync(TTSTATS_PATH, 'utf8').split(/\r?\n/).filter(Boolean);
      if(raw.length > 4000){   // 防止无限增长：保留最近 4000 条
        fs.writeFileSync(TTSTATS_PATH, raw.slice(-4000).join('\n') + '\n', 'utf8');
      }
      return sendJSON(res, 200, { ok: true });
    }catch(e){ return sendJSON(res, 500, { error: '写入失败：' + e.message }); }
  }

  if(method === 'POST' && p === '/api/run'){
    let body;
    try{ body = JSON.parse((await readBody(req)) || '{}'); }
    catch(e){ return sendJSON(res, 400, { error: '请求体不是合法 JSON' }); }
    try{
      const run = startRun(body);
      return sendJSON(res, 200, { ok: true, id: run.id, cmd: run.cmd, model: run.model, status: run.status });
    }catch(e){
      return sendJSON(res, 400, { error: e.message });
    }
  }

  const stopHit = p.match(/^\/api\/stop\/([\w-]+)$/);
  if(method === 'POST' && stopHit){
    const ok = stopRun(stopHit[1]);
    return sendJSON(res, ok ? 200 : 409, { ok, id: stopHit[1] });
  }

  const evHit = p.match(/^\/api\/events\/([\w-]+)$/);
  if(method === 'GET' && evHit){
    const run = runs.get(evHit[1]);
    if(!run) return sendJSON(res, 404, { error: 'run 不存在（可能已重启服务）' });
    sseOpen(req, run, res);
    return;
  }

  const runHit = p.match(/^\/api\/run\/([\w-]+)$/);
  if(method === 'GET' && runHit){
    const run = runs.get(runHit[1]);
    if(!run) return sendJSON(res, 404, { error: 'run 不存在（可能已重启服务）' });
    return sendJSON(res, 200, runPublic(run));
  }

  if(p === '/api/curve'){ return sendJSON(res, 200, readCurve(u.searchParams.get('path')) || { error: '未找到曲线文件' }); }
  if(p === '/api/log'){ return sendJSON(res, 200, readLog(u.searchParams.get('name')) || { error: '未找到日志文件' }); }
  if(p === '/api/meta'){ return sendJSON(res, 200, { meta: readMeta() }); }
  if(p === '/api/health'){
    let live = 0;
    for(const r of runs.values()) if(r.status === 'running') live++;
    return sendJSON(res, 200, { ok: true, uptime: process.uptime(), runs: live, total: runs.size, models: REG.models.length, root: ROOT });
  }
  if(p.startsWith('/api/')) return sendJSON(res, 404, { error: '未知 API：' + p });

  /* ---- 静态文件 ---- */
  let rel = p === '/' ? 'index.html' : (p === '/train' ? 'train.html' : p.replace(/^\/+/, ''));
  if(rel === '/train.html') rel = 'train.html';
  const fp = safeJoin(rel);
  if(!fp) return send(res, 403, '禁止访问');
  let st;
  try{ st = fs.statSync(fp); }catch(e){ return send(res, 404, 'Not Found: ' + p); }
  if(st.isDirectory()) return send(res, 302, '', 'text/plain');
  const ext = path.extname(fp).toLowerCase();
  if(ext === '.exe' || ext === '.bat' || ext === '.cmd' || ext === '.ps1') return send(res, 403, '禁止访问');
  /* 大文件（权重）也允许，但限制在 32MB */
  if(st.size > 32 * 1024 * 1024) return send(res, 413, '文件过大');
  const buf = fs.readFileSync(fp);
  /* html/js/css 一律 no-store：这是本地开发控制台，改动后必须立刻在浏览器生效。
     早前 js 走 max-age=300，导致 train-ui.js 改完后 5 分钟内浏览器一直用旧代码，
     连命令预览都显示过期内容。其余类型（权重 json、图片、音频）保留 5 分钟缓存。 */
  const noStore = (ext === '.html' || ext === '.js' || ext === '.css');
  res.writeHead(200, {
    'Content-Type': mimeOf(fp), 'Content-Length': buf.length,
    'Cache-Control': noStore ? 'no-store' : 'public, max-age=300',
  });
  res.end(buf);
});

server.on('clientError', (err, sock) => { try{ sock.end('HTTP/1.1 400 Bad Request\r\n\r\n'); }catch(e){ /* 忽略 */ } });

server.listen(opt.port, opt.host, () => {
  console.log('=========================================================');
  console.log('  乒乓·训练控制台（零依赖）');
  console.log('  训练台  http://' + opt.host + ':' + opt.port + '/train');
  console.log('  游 戏  http://' + opt.host + ':' + opt.port + '/');
  console.log('  模型数  ' + REG.models.length + ' · Node ' + process.version + ' · CPU 核 ' + os.cpus().length);
  console.log('  根目录  ' + ROOT);
  console.log('=========================================================');
});

module.exports = { server, startRun, stopRun, runs, summarize };
