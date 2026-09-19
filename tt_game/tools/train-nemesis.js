/* =====================================================================
 *  train-nemesis.js — 「地狱AI克星」训练（离线 GA · 多核并行 · 多种子降噪）
 *  · 目标：只针对地狱AI（js/learned-policy.js + 护栏，与实机 policyForModel('hell')
 *    同一口径）训练一个克制策略，适应度 = 对地狱AI的胜球数占比（得分率）
 *  · 起点：pop[0] = 当前地狱策略本身（内战 50% 基线）+ 默认/大满贯/玩家模型 + 随机体
 *  · 评估：同候选 2 个独立种子平均（抑制种子过拟合）；对手固定为地狱AI（--harder
 *    可把对手 moveErr×0.75 加压留余量）
 *  · 并行：worker_threads 按本机核数评估，单局纯函数可复现（train-nemesis-worker.js）
 *  · 产出：js/learned-policy-nemesis.js（NEMESIS_POLICY）+ tools/train-nemesis-curve.json
 *  · CLI 可视化：零依赖 ANSI 实时面板（进度条/胜球率 sparkline/种群统计），
 *    非 TTY（管道/重定向）自动降级为逐行日志；同时保留 ##TT## 打点供 Web 训练台使用
 *  · 采纳门槛：独立最终验证（4 新种子 × 40 局，双向对评）中，新模型对地狱AI胜球率
 *    必须**高于前代**才覆盖——有现役克星时，新/旧在同一批验证对手（同种子、同
 *    --harder 口径）上配对测量；--force-write 可跳过该条，但仍须 >50% 胜地狱。
 *    无现役（首训）时须 >50%。无论采纳与否候选向量都落盘 tools/train-nemesis-candidate.json
 *  · 用法：
 *      node tools/train-nemesis.js --smoke
 *      node tools/train-nemesis.js
 *      node tools/train-nemesis.js --gens 400 --pop 24 --games 24 --seed 20260919 --workers 12
 *      node tools/train-nemesis.js --from tools/train-nemesis-best.json --no-write   （续训实验）
 *      node tools/train-nemesis.js --nice   （低优先级：不占满CPU，交互操作自动让位）
 *  · CPU 占用：--workers N 硬性限制并行核数（默认=核数）；--nice 整体降到
 *    BelowNormal 优先级（全速用空闲核，一有交互 OS 自动让位），两者可叠加。
 *  · --nice 通过"父包装进程 IPC 心跳"维系：包装进程被杀（如 Web 训练台停止），
 *    6 秒内真正干活的子进程自动退出，不留孤儿。
 * ===================================================================== */
'use strict';
const path = require('path');
const fs = require('fs');
const os = require('os');
const { Worker } = require('worker_threads');
const P = require(path.join(__dirname, '..', 'js', 'policy.js'));
const T = require(path.join(__dirname, '..', 'js', 'telemetry.js'));   // Web UI 打点（TT_TELEMETRY 门控）

/* ---- 可复现 RNG / 高斯 ---- */
function mulberry32(a){ return function(){ a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
function gaussN(rng){ let u = 0, v = 0; while(u === 0) u = rng(); while(v === 0) v = rng(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); }

/* ---- 参数 ---- */
const args = process.argv.slice(2);
const opt = { gens: 400, games: 24, pop: 24, seed: 20260919, smoke: false, workers: Math.max(2, Math.min(24, os.cpus().length || 8)), hard: 1 };
for(let i = 0; i < args.length; i++){
  if(args[i] === '--smoke') opt.smoke = true;
  else if(args[i] === '--gens') opt.gens = parseInt(args[++i], 10);
  else if(args[i] === '--games') opt.games = parseInt(args[++i], 10);
  else if(args[i] === '--pop') opt.pop = parseInt(args[++i], 10);
  else if(args[i] === '--seed') opt.seed = parseInt(args[++i], 10);
  else if(args[i] === '--workers') opt.workers = parseInt(args[++i], 10);
  else if(args[i] === '--write') opt.write = true;
  else if(args[i] === '--no-write') opt.noWrite = true;   // 实验模式：保留 curve/打点，绝不覆盖 js/learned-policy-nemesis.js
  else if(args[i] === '--from'){ opt.from = args[++i]; }  // 从候选/检查点文件续训（.vec 字段）
  else if(args[i] === '--harder') opt.hard = 0.75;        // 对手加压：地狱AI moveErr×0.75（防过拟合实机余量）
  else if(args[i] === '--force-write') opt.force = true;  // 跳过"头对头胜过现役"条（仍须 >50% 胜地狱）
  else if(args[i] === '--nice') opt.nice = true;          // 低优先级重启自身（不占满 CPU，交互自动让位）
}

/* ---- --nice：以低于正常的优先级重启自身 ----
 * Windows 下 Node 无自设优先级的 API，包装进程对子进程 PID 执行 PowerShell 设
 * BelowNormal（PowerShell 缺失则警告并按正常优先级继续）；POSIX 用 nice -n 10。
 * stdio inherit → CLI 实时面板/stdout 重定向不受影响；TT_NICE_CHILD 防递归。
 * 心跳看门狗：包装进程死了（Web 训练台停止/Ctrl+C 后父壳退出）→ 子进程 6s 自杀，
 * 防止真正干活的孙进程变孤儿继续吃 CPU。 */
if(opt.nice && !process.env.TT_NICE_CHILD){
  const { spawn } = require('child_process');
  const script = path.resolve(process.argv[1]);
  const childArgs = [script, ...process.argv.slice(2).filter(a => a !== '--nice')];
  const childEnv = Object.assign({}, process.env, { TT_NICE_CHILD: '1' });
  const child = process.platform === 'win32'
    ? spawn(process.execPath, childArgs, { stdio: ['inherit', 'inherit', 'inherit', 'ipc'], env: childEnv })
    : spawn('nice', ['-n', '10', process.execPath, ...childArgs], { stdio: ['inherit', 'inherit', 'inherit', 'ipc'], env: childEnv });
  if(process.platform === 'win32')
    spawn('powershell', ['-NoProfile', '-Command', `(Get-Process -Id ${child.pid}).PriorityClass = 'BelowNormal'`], { stdio: 'ignore' });
  console.log('[nice] 已以' + (process.platform === 'win32' ? ' BelowNormal' : ' nice 10') + ' 优先级启动训练子进程 PID=' + child.pid);
  const ping = setInterval(() => { try{ child.send({ t: 'nice-ping' }); }catch(e){} }, 2000);
  child.on('exit', (code) => { clearInterval(ping); process.exit(code == null ? 1 : code); });
  return;
}
if(process.env.TT_NICE_CHILD){
  let lastPing = Date.now();
  process.on('message', () => { lastPing = Date.now(); });
  setInterval(() => {
    if(Date.now() - lastPing > 6000){
      console.error('\n[nice] 父包装进程已退出，训练随之终止');
      process.exit(130);
    }
  }, 2000).unref();
}
const KEYS = P.POLICY_KEYS;
const range = s => s.max - s.min;

/* ---- 起点与对手（地狱AI向量） ----
 * 实机地狱AI口径 = 学习策略 + 难度护栏（与 policy.js strongVec、worker hellOpponent
 * 三处同源，改动护栏必须三处同步）。起点/基线/种群种子都必须用这个口径 —— 裸
 * LEARNED_POLICY 与带护栏版本是两个强度的策略，混用会把 50% 基线测歪。 */
const HELL_GUARD = { moveSpeed: 2.8, moveErr: 0.03, moveZ: 2.6 };
let curVec = P.flattenPolicy(P.POLICY_DEFAULT);           // --from / learned-policy 都读不到时的兜底
let hellVec = null;
try{
  const H = require(path.join(__dirname, '..', 'js', 'learned-policy.js'));
  if(H && H.LEARNED_POLICY){
    hellVec = P.flattenPolicy(Object.assign({}, H.LEARNED_POLICY, HELL_GUARD));
    curVec = hellVec.slice();                             // 克星的天然起点：地狱AI自己（内战 50% 基线）
  }
}catch(e){ console.warn('learned-policy.js 读取失败，以默认策略为起点'); }
if(opt.from){
  try{
    const C = JSON.parse(fs.readFileSync(opt.from, 'utf8'));
    if(Array.isArray(C.vec) && C.vec.length === KEYS.length) curVec = C.vec.slice();
    else console.warn('--from 文件向量长度不符，忽略（KEYS=' + KEYS.length + '）');
  }catch(e){ console.warn('--from 读取失败：' + e.message); }
}
if(!hellVec){
  console.error('✗ 未找到 js/learned-policy.js（地狱AI策略）——克星必须以地狱AI为训练对手');
  process.exit(1);
}

/* ---- 现役克星（若有）：新模型对地狱AI的胜球率须高于它才允许覆盖 ----
 * 注意与 curVec（--from/起点）区分：curNemVec 始终是当前正式文件里的部署版本。 */
let curNemVec = null, curNemRate = null;
try{
  const N = require(path.join(__dirname, '..', 'js', 'learned-policy-nemesis.js'));
  if(N && N.NEMESIS_POLICY){
    curNemVec = P.flattenPolicy(N.NEMESIS_POLICY);
    if(N.NEMESIS_META && typeof N.NEMESIS_META.pointRateVsHell === 'number') curNemRate = N.NEMESIS_META.pointRateVsHell;
  }
}catch(e){}

/* ---- 评估 worker 池 ---- */
class EvalPool{
  constructor(count, file){
    this.workers = [];
    this.queue = [];
    this.map = new Map();
    this.idN = 0;
    for(let i = 0; i < count; i++){
      const w = new Worker(file);
      const rec = { w, busy: false, pendingId: null };
      w.on('message', m => {
        const e = this.map.get(m.id);
        if(e){ this.map.delete(m.id); e.resolve(isFinite(m.pointRate) ? m.pointRate : NaN); }
        if(rec.pendingId === m.id){ rec.pendingId = null; rec.busy = false; this._pump(); }
      });
      w.on('error', err => console.error('[pool] worker error: ' + (err && err.message)));
      this.workers.push(rec);
    }
  }
  _pump(){
    if(this.queue.length === 0) return;
    for(const rec of this.workers){
      if(rec.busy) continue;
      const t = this.queue.shift();
      rec.busy = true; rec.pendingId = t.id;
      rec.w.postMessage(t);
      if(this.queue.length === 0) break;
    }
  }
  evalTask(vec, opp, base, games, curV, hard){
    const id = ++this.idN;
    return new Promise(resolve => {
      this.map.set(id, { resolve });
      this.queue.push({ id, vec, opp, base, games, curVec: curV, hard });
      this._pump();
    });
  }
  async close(){ for(const r of this.workers) await r.w.terminate(); }
}

const pool = new EvalPool(opt.workers, path.join(__dirname, 'train-nemesis-worker.js'));

/* ---- 多种子评估一个候选（对手恒为地狱AI；完成时回报本代进度） ---- */
const prog = { done: 0, total: 0 };
async function evalCandidate(vec, games, base){
  const p1 = pool.evalTask(vec, 'hell', base, games, curVec, opt.hard).then(r => { prog.done++; return r; });
  const p2 = pool.evalTask(vec, 'hell', base + 811, games, curVec, opt.hard).then(r => { prog.done++; return r; });
  const [a, b] = await Promise.all([p1, p2]);
  const vs = [a, b].filter(isFinite);
  return vs.length ? vs.reduce((x, y) => x + y, 0) / vs.length : 0.5;
}

/* ================= CLI 可视化（零依赖 ANSI） =================
 * FORCE_TTY=1 可在管道/重定向里强制启用面板（调试用）；NO_COLOR=1 关闭 */
const TTY = (!!process.stdout.isTTY || process.env.FORCE_TTY === '1') && process.env.NO_COLOR !== '1';
const c = {
  bold: s => `\x1b[1m${s}\x1b[0m`,
  dim:  s => `\x1b[2m${s}\x1b[0m`,
  cyan: s => `\x1b[36m${s}\x1b[0m`,
  green:s => `\x1b[32m${s}\x1b[0m`,
  gold: s => `\x1b[33m${s}\x1b[0m`,
  red:  s => `\x1b[31m${s}\x1b[0m`,
};
const visLen = s => s.replace(/\x1b\[[0-9;]*m/g, '').length;
const trunc = (s, w) => {           // ANSI 感知截断（窄终端防换行错位）
  if(visLen(s) <= w) return s;
  let out = '', n = 0, i = 0;
  while(i < s.length){
    if(s[i] === '\x1b'){ const m = /\x1b\[[0-9;]*m/.exec(s.slice(i)); out += m[0]; i += m[0].length; continue; }
    out += s[i++]; if(++n >= w) break;
  }
  return out + '\x1b[0m';
};
const fmtDur = s => s < 60 ? s.toFixed(0) + 's' : (s < 3600 ? (s / 60 | 0) + 'm' + String(s % 60 | 0).padStart(2, '0') + 's' : (s / 3600 | 0) + 'h' + String((s / 60 | 0) % 60).padStart(2, '0') + 'm');
const bar = (p, w) => '█'.repeat(Math.max(0, Math.round(p * w))) + '░'.repeat(Math.max(0, w - Math.round(p * w)));
const SPARK = '▁▂▃▄▅▆▇█';
function spark(vals, w){
  if(!vals.length) return '';
  const v = vals.slice(-w), lo = Math.min(...v), hi = Math.max(...v), rg = (hi - lo) || 1;
  return v.map(x => SPARK[Math.min(7, Math.floor((x - lo) / rg * 7.999))]).join('');
}
/* 胜球率条：窗口固定 30%–70%（50% 内战基线在正中），越出窗口钳制并加标 */
function rateBar(r, w){
  const LO = 0.30, HI = 0.70;
  const p = Math.max(0, Math.min(1, (r - LO) / (HI - LO)));
  const n = Math.round(p * w);
  const col = r > 0.5 ? c.green : c.gold;
  return col('█'.repeat(n)) + c.dim('░'.repeat(w - n));
}
let panelLines = 0;
function renderPanel(lines){
  if(panelLines > 0) process.stdout.write(`\x1b[${panelLines}A`);
  const w = (process.stdout.columns || 100) - 1;
  for(const ln of lines) process.stdout.write('\x1b[2K' + trunc(ln, w) + '\n');
  panelLines = lines.length;
}
function closePanel(){ panelLines = 0; process.stdout.write('\n'); }

const view = {
  gen: -1, gens: opt.gens, t0: Date.now(), genSec: 0, evals: 0, sigma: 0,
  top: 0, best: 0, bestGen: -1, p50: 0, worst: 0, hist: [], histBest: [], done: 0, total: 0,
};
function buildPanel(){
  const W = Math.max(56, (process.stdout.columns || 100) - 4);
  const bw = Math.min(24, W - 46);
  const elapsed = (Date.now() - view.t0) / 1000;
  const eta = view.gen >= 1 ? elapsed / (view.gen + 1) * (view.gens - view.gen - 1) : 0;
  const L = [];
  L.push(c.cyan('─'.repeat(Math.min(W, 86))));
  L.push(c.bold(' 地狱AI克星 · 只针对地狱AI特训 (GA μ+λ)  ') + c.dim(`seed=${opt.seed} · workers=${opt.workers} · 2种子×${opt.games}局${opt.hard !== 1 ? ' · 对手加压×' + opt.hard : ''}`));
  L.push(` 进度 ${c.cyan(bar(view.gen + 1 >= view.gens ? 1 : (view.gen + 1) / view.gens, bw))} ${String(view.gen + 1).padStart(3)}/${view.gens} 代 · 已用 ${fmtDur(elapsed)}` + (view.gen >= 1 ? ` · 预计还需 ${fmtDur(eta)}` : ''));
  if(view.total > 0) L.push(` 本代 ${c.cyan(bar(view.done / view.total, bw))} 评估 ${view.done}/${view.total} 任务 · σ=${view.sigma.toFixed(3)}`);
  L.push(` 对地狱AI胜球率  历史最优 ${c.bold((view.best * 100).toFixed(1) + '%')} ${rateBar(view.best, Math.min(18, W - 34))} ${c.dim('窗口30–70% · 中线=50%')}`);
  if(view.hist.length > 1) L.push(` best ${c.green(spark(view.histBest, Math.min(48, W - 10)))}   champ ${c.dim(spark(view.hist, Math.min(30, W - 44)))}`);
  L.push(` gen ${String(view.gen).padStart(3)} · top=${(view.top * 100).toFixed(1)}% · p50=${(view.p50 * 100).toFixed(1)}% · worst=${(view.worst * 100).toFixed(1)}%` + (view.bestGen >= 0 ? ` · best@gen${view.bestGen}` : ''));
  L.push(c.cyan('─'.repeat(Math.min(W, 86))));
  return L;
}

/* ---- 冒烟：并行环境自检（对手=地狱AI 的口径是否通） ---- */
if(opt.smoke){
  (async () => {
    const base = mulberry32(999);
    const pDef = await evalCandidate(P.flattenPolicy(P.POLICY_DEFAULT), opt.games, base() * 1e5 | 0);
    const pHellSelf = await evalCandidate(hellVec, opt.games, base() * 1e5 | 0);
    const pHellVsDef = await evalTaskDirect(hellVec, 'default', opt.games, base() * 1e5 | 0);
    console.log('[smoke] 默认策略 vs 地狱AI   : ' + (pDef * 100).toFixed(1) + '%   （应明显偏低）');
    console.log('[smoke] 地狱AI vs 地狱AI    : ' + (pHellSelf * 100).toFixed(1) + '%   （应≈50%，对手口径自检）');
    console.log('[smoke] 地狱AI vs 默认策略  : ' + (pHellVsDef * 100).toFixed(1) + '%   （应明显偏高）');
    T.phase('smoke', '并行 worker 自检通过');
    T.tick({ t:'smoke', tag:'默认 vs 地狱AI', winRate:+pDef.toFixed(4) });
    T.tick({ t:'smoke', tag:'地狱AI vs 地狱AI', winRate:+pHellSelf.toFixed(4) });
    T.tick({ t:'smoke', tag:'地狱AI vs 默认', winRate:+pHellVsDef.toFixed(4) });
    await pool.close();
    process.exit(0);
  })();
  return;
}
/* smoke 里需要一条非 hell 对手的直评通道（默认策略参照）；hard=对手 moveErr 倍率 */
function evalTaskDirect(vec, opp, games, base, hard){
  const id = ++pool.idN;
  return new Promise(resolve => {
    pool.map.set(id, { resolve });
    pool.queue.push({ id, vec, opp, base, games, curVec: hellVec, hard: hard == null ? 1 : hard });
    pool._pump();
  });
}

/* ---- 变异（沿袭 train-hell：12% 跳跃 + 高斯，随代际缩小） ---- */
function mutate(vec, sigma, rng){
  const out = vec.slice();
  for(let i = 0; i < out.length; i++){
    const s = KEYS[i];
    if(rng() < 0.12) out[i] = s.min + rng() * range(s);
    else out[i] += gaussN(rng) * range(s) * sigma;
    out[i] = Math.max(s.min, Math.min(s.max, out[i]));
  }
  return out;
}

/* ---- 主训练 ---- */
(async () => {
  const rng0 = mulberry32(opt.seed);
  const pop = [];
  pop.push({ v: hellVec.slice(), tag: 'hell' });                     // 内战 50% 基线
  pop.push({ v: P.flattenPolicy(P.POLICY_DEFAULT).slice(), tag: 'base' });
  try{                                                                // 大满贯/加强玩家模型作为额外强种子
    const G = require(path.join(__dirname, '..', 'js', 'learned-policy-grandslam.js'));
    if(G && G.GRANDSLAM_POLICY) pop.push({ v: P.flattenPolicy(G.GRANDSLAM_POLICY).slice(), tag: 'gs' });
  }catch(e){}
  try{
    const PM = require(path.join(__dirname, '..', 'js', 'player-model.js'));
    const pb = PM.currentBoost ? PM.currentBoost() : PM.PLAYER_MODEL_BOOST;
    if(pb) pop.push({ v: P.flattenPolicy(pb).slice(), tag: 'pb' });
  }catch(e){}
  while(pop.length < opt.pop) pop.push({ v: KEYS.map(s => s.min + rng0() * range(s)), tag: 'rand' });
  pop.length = opt.pop;

  let best = { v: curVec.slice(), fit: 0, gen: -1, tag: 'from' };
  let evals = 0;
  const curve = [];
  const t0 = Date.now();
  const header = `地狱AI克星训练 · gens=${opt.gens} games=${opt.games} pop=${opt.pop} seed=${opt.seed} workers=${opt.workers}` + (opt.hard !== 1 ? ` hard=${opt.hard}` : '');
  console.log(header);
  console.log('对手=地狱AI（learned-policy+护栏，实机同口径）· 起点向量：' + curVec.map(v => v.toFixed(2)).join(','));
  if(curNemVec)
    console.log('现役克星在场（对地狱AI ' + (curNemRate * 100).toFixed(1) + '%）：新模型对地狱AI胜球率须高于现役（同种子配对对照）才覆盖' +
      (opt.force ? '（--force-write：跳过该条，仅须 >50% 胜地狱）' : ''));
  T.phase('train', header);

  let ticker = null;
  if(TTY){
    view.total = opt.pop * 2;
    renderPanel(buildPanel());
    ticker = setInterval(() => {                                       // 本代评估进行中也要"活"起来
      if(prog.total > 0){ view.done = prog.done; view.total = prog.total; }
      renderPanel(buildPanel());
    }, 400);
  }

  for(let g = 0; g < opt.gens; g++){
    const sigma = 0.09 * (1 - g / opt.gens) + 0.025;
    prog.done = 0; prog.total = opt.pop * 2;
    if(TTY){ view.gen = g; view.sigma = sigma; view.done = 0; view.total = prog.total; }
    const genT0 = Date.now();
    /* 同代所有候选共用同一对手种子对（common random numbers，配对比较降噪，沿袭 train-hell） */
    const genBase = opt.seed * 1000 + g * 991;
    const jobs = pop.map(m => evalCandidate(m.v, opt.games, genBase).then(f => { m.fit = f; return f; }));
    const fits = await Promise.all(jobs);
    evals += opt.pop * 2;
    const sorted = pop.map((m, i) => ({ m, f: fits[i] })).sort((a, b) => b.f - a.f);
    const champ = sorted[0];
    if(champ.f > best.fit) best = { v: champ.m.v.slice(), fit: champ.f, gen: g, tag: champ.m.tag };
    const qs = sorted.map(r => r.f);
    const p50 = qs.length % 2 ? qs[(qs.length - 1) / 2 | 0] : (qs[qs.length / 2 - 1] + qs[qs.length / 2]) / 2;
    const entry = { gen: g, fit: +champ.f.toFixed(4), best: +best.fit.toFixed(4), p50: +p50.toFixed(4), worst: +qs[qs.length - 1].toFixed(4), sigma: +sigma.toFixed(4), sec: +((Date.now() - genT0) / 1000).toFixed(1) };
    curve.push(entry);
    T.tick(Object.assign({ t:'gen', evals, sec:+((Date.now() - t0) / 1000).toFixed(1) }, entry));
    if(TTY){
      view.top = champ.f; view.best = best.fit; view.bestGen = best.gen;
      view.p50 = p50; view.worst = qs[qs.length - 1];
      view.evals = evals; view.genSec = entry.sec;
      view.hist.push(champ.f); view.histBest.push(best.fit);
    }else{
      console.log('gen ' + String(g).padStart(3) +
        '  top=' + (champ.f * 100).toFixed(1) + '%  best=' + (best.fit * 100).toFixed(1) + '% (best@gen' + best.gen + ')' +
        '  p50=' + (p50 * 100).toFixed(1) + '%  worst=' + (qs[qs.length - 1] * 100).toFixed(1) + '%' +
        '  [' + ((Date.now() - t0) / 1000).toFixed(0) + 's]');
    }
    if(g % 10 === 0 || g === opt.gens - 1){
      fs.writeFileSync(path.join(__dirname, 'train-nemesis-curve.json'), JSON.stringify(curve, null, 2), 'utf8');
      /* 最优向量检查点：curve 只有标量，中途崩溃会丢策略本体 —— 每 10 代随曲线一并落盘，
       * 崩溃后可用 --from tools/train-nemesis-best.json 从最优向量续训 */
      fs.writeFileSync(path.join(__dirname, 'train-nemesis-best.json'), JSON.stringify({
        vec: best.v, fit: +best.fit.toFixed(4), gen: best.gen, tag: best.tag,
        seed: opt.seed, gens: opt.gens, savedAtGen: g, savedAt: new Date().toISOString(),
      }, null, 2), 'utf8');
    }
    const eliteN = Math.max(2, Math.ceil(opt.pop * 0.25));
    const next = [];
    for(let i = 0; i < eliteN; i++) next.push({ v: sorted[i].m.v.slice(), tag: sorted[i].m.tag });
    while(next.length < opt.pop){
      const parent = sorted[(rng0() * eliteN) | 0].m;
      next.push({ v: mutate(parent.v, sigma, rng0), tag: 'child' });
    }
    pop.length = 0;
    for(const p of next) pop.push(p);
  }
  if(ticker) clearInterval(ticker);
  if(TTY){ closePanel(); }
  console.log(`训练完成：${opt.gens} 代 · 评估 ${evals} 次 · 用时 ${fmtDur((Date.now() - t0) / 1000)} · 训练集最优 ${(best.fit * 100).toFixed(1)}% @gen${best.gen}(${best.tag})`);

  /* ---- 独立最终验证（新种子 + 更多局数，不参与训练；对手仍为地狱AI） ---- */
  const newVec = best.v;
  const valBase = 8110000 + opt.seed;
  async function val(v, opp, base, hard){
    const ps = [];
    for(let k = 0; k < 4; k++) ps.push(evalTaskDirect(v, opp, 40, base + k * 617, hard).then(r => { prog.done++; return r; }));
    const ms = await Promise.all(ps);
    let s = 0; for(const m of ms) s += m;
    return s / 4;
  }
  const pNvH = val(newVec, 'hell', valBase, opt.hard);                 // 新克星 vs 地狱AI（主判据）
  const pCvH = curNemVec ? val(curNemVec, 'hell', valBase, opt.hard) : null;   // 现役克星 vs 同一批对手（valBase 同源 → 配对对照）
  const pHellSelf = val(hellVec, 'hell', valBase + 5000, 1);           // 地狱AI内战基线（校准 ≈50%）
  const pNvD = val(newVec, 'default', valBase + 10000, 1);             // vs 默认策略（仅参考，未参与训练）
  const [nVh, cVh, bVh, nVd] = await Promise.all([pNvH, pCvH, pHellSelf, pNvD]);

  /* ---- 采纳门：对地狱AI胜球率高于前代才覆盖 ----
   * 有现役克星时：新/旧在同一批验证对手（同种子、同 --harder 口径）上配对测量，
   * 新模型严格高于现役才覆盖（--force-write 跳过该条）；无现役（首训）时 >50% 即采纳。
   * 绝对底线：任何情况下都须 >50% 胜地狱，防止配对口径漂移时放水。 */
  const vsPrevOk = (curNemVec && !opt.force) ? (nVh > cVh) : true;
  const adopt = !opt.noWrite && nVh > 0.50 && vsPrevOk;
  fs.writeFileSync(path.join(__dirname, 'train-nemesis-candidate.json'), JSON.stringify({
    vec: newVec, fitness: +best.fit.toFixed(4), bestGen: best.gen, seed: opt.seed, gens: opt.gens,
    vsHell: +nVh.toFixed(4), vsHellPrev: cVh == null ? undefined : +cVh.toFixed(4),
    vsHellBaseline: +bVh.toFixed(4), vsDefault: +nVd.toFixed(4),
    forceWrite: opt.force || undefined,
    harder: opt.hard !== 1 ? opt.hard : undefined,
    adopted: adopt, trainedAt: new Date().toISOString(),
  }, null, 2), 'utf8');
  T.phase('verify', '独立最终验证完成');
  T.tick({ t:'verify', vsHell:+nVh.toFixed(4), vsHellPrev: cVh == null ? undefined : +cVh.toFixed(4),
    vsHellBaseline:+bVh.toFixed(4), vsDefault:+nVd.toFixed(4),
    fitness:+best.fit.toFixed(4), bestGen:best.gen, evals, sec:+((Date.now() - t0) / 1000).toFixed(1) });

  console.log('\n════ 独立最终验证（4 新种子 × 40 局 · 不参与训练）════');
  if(cVh != null){
    console.log('克星(新) vs 地狱AI      ：' + c.bold((nVh * 100).toFixed(1) + '%') +
      '   （现役同种子对照 ' + c.bold((cVh * 100).toFixed(1) + '%') + ' · 内战基线 ' + (bVh * 100).toFixed(1) + '%）');
    console.log('判定：' + (nVh > cVh
      ? c.green('高于前代 ' + ((nVh - cVh) * 100).toFixed(1) + 'pp → 可覆盖')
      : c.red('未高于前代 → 保留现役')));
  }else{
    console.log('克星 vs 地狱AI          ：' + c.bold((nVh * 100).toFixed(1) + '%') + '   （>50% = 克制成立；内战基线 ' + (bVh * 100).toFixed(1) + '%）');
  }
  console.log('克星 vs 默认策略(参考)  ：' + (nVd * 100).toFixed(1) + '%   （未参与训练，仅观察）');
  console.log('已写 tools/train-nemesis-candidate.json（候选向量，可用 --from 续训/复评）');
  fs.writeFileSync(path.join(__dirname, 'train-nemesis-curve.json'), JSON.stringify(curve, null, 2), 'utf8');

  if(!adopt){
    let why;
    if(opt.noWrite) why = '--no-write：实验模式，跳过写入';
    else if(curNemVec) why = '对地狱AI胜球率 ' + (nVh * 100).toFixed(1) + '% 未高于现役的 ' + (cVh * 100).toFixed(1) + '%，保留现役';
    else why = '独立验证未超过 50% 胜球率';
    console.log('\n⚠ ' + why + '，不写入正式模型。');
    console.log('  候选已留存：node tools/train-nemesis.js --from tools/train-nemesis-candidate.json --gens 200 续训');
    T.tick({ t:'done', mode:'hell-nemesis', fitness:+best.fit.toFixed(4), adopted:false, noWrite:!!opt.noWrite,
      vsHell:+nVh.toFixed(4), vsHellPrev: cVh == null ? undefined : +cVh.toFixed(4), sec:+((Date.now() - t0) / 1000).toFixed(1) });
    await pool.close();
    process.exit(0);
  }

  /* ---- 采纳：写正式模型文件（原文件自动备份） ---- */
  const learned = P.unflattenPolicy(newVec);
  const meta = {
    fitness: +best.fit.toFixed(4),
    pointRateVsHell: +nVh.toFixed(4),
    pointRateVsHellPrev: cVh == null ? undefined : +cVh.toFixed(4),
    pointRateVsHellBaseline: +bVh.toFixed(4),
    pointRateVsDefault: +nVd.toFixed(4),
    generations: opt.gens, seed: opt.seed, evals,
    harder: opt.hard !== 1 ? opt.hard : undefined,
    mode: 'hell-nemesis',
    trainedAt: new Date().toISOString().slice(0, 10),
    adopted: true,
  };
  const outPath = path.join(__dirname, '..', 'js', 'learned-policy-nemesis.js');
  let backupNote = '（新文件）';
  if(fs.existsSync(outPath)){
    const bak = outPath + '.bak-' + new Date().toISOString().slice(0, 19).replace(/[-:T]/g, '');
    fs.copyFileSync(outPath, bak);
    backupNote = '（原文件备份：' + path.basename(bak) + '）';
  }
  const out =
`/* =====================================================================
 *  learned-policy-nemesis.js — 自动生成：node tools/train-nemesis.js
 *  「地狱AI克星」：只针对地狱AI（learned-policy.js+护栏口径）特训的克制策略
 *  （partial policy，未设字段回落 POLICY_DEFAULT；实机为原始学习策略、不加护栏）
 * ===================================================================== */
'use strict';
const NEMESIS_POLICY = ${JSON.stringify(learned, null, 2)};
const NEMESIS_META = ${JSON.stringify(meta, null, 2)};
/* Node 训练器/诊断可 require */
if(typeof module !== 'undefined' && module.exports) module.exports = { NEMESIS_POLICY, NEMESIS_META };
`;
  fs.writeFileSync(outPath, out, 'utf8');
  console.log('\n✅ 已采纳并写入 js/learned-policy-nemesis.js ' + backupNote);
  console.log('   对地狱AI胜球率 ' + (nVh * 100).toFixed(1) + '%（内战基线 ' + (bVh * 100).toFixed(1) + '%）' +
    (cVh != null ? ' · 高于前代现役的 ' + (cVh * 100).toFixed(1) + '%' : '') +
    ' · 可在游戏中选择「地狱AI克星」或斗蛐蛐对轰');
  T.tick({ t:'done', mode:'hell-nemesis', fitness:+best.fit.toFixed(4), adopted:true, vsHell:+nVh.toFixed(4), sec:+((Date.now() - t0) / 1000).toFixed(1) });
  await pool.close();
  process.exit(0);
})().catch(e => { console.error('[fatal] ' + (e && e.stack || e)); process.exit(1); });

/* Ctrl+C：提示检查点位置（每 10 代已落盘 train-nemesis-best.json） */
process.on('SIGINT', () => {
  console.log('\n(中断) 最优检查点：node tools/train-nemesis.js --from tools/train-nemesis-best.json 续训');
  process.exit(130);
});
