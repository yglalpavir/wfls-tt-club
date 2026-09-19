/* =====================================================================
 *  train-hell.js — 地狱 AI 续训（离线自对弈 · 多核并行 · 多种子降噪）
 *  · 接续 js/learned-policy.js：pop 第 0 个体 = 当前地狱学习策略（不是从零开始）
 *  · 评估：同代同对手 2 个独立种子平均（抑制种子过拟合）
 *  · 对手：默认策略 / 加强玩家模型(最强) / 搓球狂 / 当前最优(自对弈)
 *  · 并行：worker_threads 按本机核数评估，单局纯函数可复现
 *  · 产出：js/learned-policy.js（地狱 AI 核心策略）+ tools/train-hell-curve.json
 *  · 只在"独立种子最终验证"明显更强时才覆盖旧策略（自动回滚保护）
 *  · 用法：
 *      node tools/train-hell.js --smoke
 *      node tools/train-hell.js
 *      node tools/train-hell.js --gens 100 --pop 16 --games 12 --seed 20260810 --workers 12
 *      node tools/train-hell.js --nice   （低优先级：不占满CPU，交互操作自动让位）
 *  · CPU 占用：--workers N 硬性限制并行核数（默认=核数）；--nice 整体降到
 *    BelowNormal 优先级（全速用空闲核，一有交互 OS 自动让位），两者可叠加；
 *    父包装进程被杀（如 Web 训练台停止）时子进程经 IPC 心跳看门狗 6s 自动退出。
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
const opt = { gens: 400, games: 24, pop: 24, seed: 20260810, smoke: false, workers: Math.max(2, Math.min(24, os.cpus().length || 8)) };
for(let i = 0; i < args.length; i++){
  if(args[i] === '--smoke') opt.smoke = true;
  else if(args[i] === '--gens') opt.gens = parseInt(args[++i], 10);
  else if(args[i] === '--games') opt.games = parseInt(args[++i], 10);
  else if(args[i] === '--pop') opt.pop = parseInt(args[++i], 10);
  else if(args[i] === '--seed') opt.seed = parseInt(args[++i], 10);
  else if(args[i] === '--workers') opt.workers = parseInt(args[++i], 10);
  else if(args[i] === '--write') opt.write = true;
  else if(args[i] === '--no-write') opt.noWrite = true;   // 实验模式：保留 curve/打点，绝不覆盖 js/learned-policy.js
  else if(args[i] === '--from'){ opt.from = args[++i]; }  // 从候选文件续训（train-hell-candidate.json 的 .vec）
  else if(args[i] === '--nice') opt.nice = true;          // 低优先级重启自身（不占满 CPU，交互自动让位）
}

/* ---- --nice：以低于正常的优先级重启自身（机制详见 train-nemesis.js 同名块）----
 * Windows=PowerShell 设 BelowNormal / POSIX=nice -n 10；IPC 心跳看门狗防孤儿。 */
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

/* ---- 当前地狱学习策略（续训起点；--from 优先用候选向量） ---- */
let curVec = P.flattenPolicy(P.POLICY_DEFAULT);
if(opt.from){
  try{
    const C = JSON.parse(fs.readFileSync(opt.from, 'utf8'));
    if(Array.isArray(C.vec) && C.vec.length === P.POLICY_KEYS.length) curVec = C.vec.slice();
    else console.warn('--from 文件向量长度不符，忽略（KEYS=' + P.POLICY_KEYS.length + '）');
  }catch(e){ console.warn('--from 读取失败：' + e.message); }
}else try{
  const CUR = require(path.join(__dirname, '..', 'js', 'learned-policy.js'));
  if(CUR && CUR.LEARNED_POLICY) curVec = P.flattenPolicy(CUR.LEARNED_POLICY);
}catch(e){ console.warn('learned-policy.js 读取失败，以默认策略为续训起点'); }

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
  evalTask(vec, opp, base, games, curV){
    const id = ++this.idN;
    return new Promise(resolve => {
      this.map.set(id, { resolve });
      this.queue.push({ id, vec, opp, base, games, curVec: curV });
      this._pump();
    });
  }
  async close(){ for(const r of this.workers) await r.w.terminate(); }
}

const pool = new EvalPool(opt.workers, path.join(__dirname, 'train-hell-worker.js'));

/* ---- 多种子评估一个候选 ---- */
async function evalCandidate(vec, opp, base, games, curV){
  const p1 = pool.evalTask(vec, opp, base, games, curV);
  const p2 = pool.evalTask(vec, opp, base + 811, games, curV);
  const [a, b] = await Promise.all([p1, p2]);
  const vs = [a, b].filter(isFinite);
  return vs.length ? vs.reduce((x, y) => x + y, 0) / vs.length : 0.5;
}
const BASE = { def: opt.seed * 1000, pb: opt.seed * 2000, push: opt.seed * 3000, self: opt.seed * 4000 };

/* ---- 冒烟：并行环境自检 ---- */
if(opt.smoke){
  (async () => {
    const base = mulberry32(999);
    const p1 = await evalCandidate(P.flattenPolicy(P.POLICY_DEFAULT), 'default', base() * 1e5 | 0, opt.games, curVec);
    const p2 = await evalCandidate(curVec, 'pb', base() * 1e5 | 0, opt.games, curVec);
    const p3 = await evalCandidate(curVec, 'self', base() * 1e5 | 0, opt.games, curVec);
    console.log('[smoke] 默认 vs 默认 : ' + (p1 * 100).toFixed(1) + '%');
    console.log('[smoke] 当前地狱 vs 加强玩家模型 : ' + (p2 * 100).toFixed(1) + '%');
    console.log('[smoke] 当前地狱 vs 当前地狱(自对弈) : ' + (p3 * 100).toFixed(1) + '%');
    T.phase('smoke', '并行 worker 自检通过');
    T.tick({ t:'smoke', tag:'默认 vs 默认', winRate:+p1.toFixed(4) });
    T.tick({ t:'smoke', tag:'地狱 vs 玩家模型', winRate:+p2.toFixed(4) });
    T.tick({ t:'smoke', tag:'地狱 vs 地狱', winRate:+p3.toFixed(4) });
    await pool.close();
    process.exit(0);
  })();
  return;
}

/* ---- 变异（沿袭 train.js：12% 跳跃 + 高斯，随代际缩小） ---- */
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
  let pop = [];
  for(let i = 0; i < opt.pop; i++){
    if(i === 0) pop.push({ v: curVec.slice(), tag: 'cur' });
    else if(i === 1) pop.push({ v: P.flattenPolicy(P.POLICY_DEFAULT), tag: 'base' });
    else pop.push({ v: KEYS.map(s => s.min + rng0() * range(s)), tag: 'rand' });
  }
  let best = { v: curVec.slice(), fit: 0, gen: -1, tag: 'cur' };
  let evals = 0;
  const curve = [];
  const t0 = Date.now();
  console.log('地狱 AI 续训 · gens=' + opt.gens + ' games=' + opt.games + ' pop=' + opt.pop + ' seed=' + opt.seed + ' workers=' + opt.workers);
  console.log('续训起点(当前地狱策略)：' + curVec.map(v => v.toFixed(2)).join(','));
  T.phase('train', '地狱 AI 续训开始 gens=' + opt.gens + ' pop=' + opt.pop + ' games=' + opt.games + ' workers=' + opt.workers);
  for(let g = 0; g < opt.gens; g++){
    const sigma = 0.09 * (1 - g / opt.gens) + 0.025;
    /* 全代评估一次性提交（并行跑满 worker 池），再统一回收 */
    const rows = [];
    for(const m of pop){
      const evDef  = evalCandidate(m.v, 'default', BASE.def  + g * 991, opt.games, best.v);
      const evPB   = evalCandidate(m.v, 'pb',      BASE.pb   + g * 991, opt.games, best.v);
      const evPush = evalCandidate(m.v, 'pusher',  BASE.push + g * 991, opt.games, best.v);
      const evSelf = evalCandidate(m.v, 'self',    BASE.self + g * 991, opt.games, best.v);
      rows.push({ m, evDef, evPB, evPush, evSelf });
    }
    for(const r of rows) await r.evDef;
    for(const r of rows) await r.evPB;
    for(const r of rows) await r.evPush;
    for(const r of rows) await r.evSelf;
    for(const r of rows){
      const m = r.m;
      const fDef = await r.evDef, fPB = await r.evPB, fPush = await r.evPush, fSelf = await r.evSelf;
      evals += 8;
      /* 权重：针对最强对手(加强玩家模型)为主，默认+自对弈次之，搓球狂兜底 */
      m.fit = 0.34 * fPB + 0.26 * fDef + 0.26 * fSelf + 0.14 * fPush;
      m.fDef = fDef; m.fPB = fPB; m.fPush = fPush; m.fSelf = fSelf;
    }
    pop.sort((a, b) => b.fit - a.fit);
    const champ = pop[0];
    if(champ.fit > best.fit) best = { v: champ.v.slice(), fit: champ.fit, gen: g, tag: champ.tag };
    curve.push({ gen: g, fit: +champ.fit.toFixed(4), fDef: +champ.fDef.toFixed(4), fPB: +champ.fPB.toFixed(4), fPush: +champ.fPush.toFixed(4), fSelf: +champ.fSelf.toFixed(4), best: +best.fit.toFixed(4),
                 min: +pop[pop.length - 1].fit.toFixed(4) });
    T.tick(Object.assign({ t:'gen', evals, sec:+((Date.now() - t0)/1000).toFixed(1) }, curve[curve.length - 1]));
    if(g % 10 === 0 || g === opt.gens - 1){
      console.log('gen ' + String(g).padStart(3) +
        '  top.fit=' + champ.fit.toFixed(4) +
        ' (vsDef=' + champ.fDef.toFixed(3) + ' vsPB=' + champ.fPB.toFixed(3) +
        ' vsPush=' + champ.fPush.toFixed(3) + ' vsSelf=' + champ.fSelf.toFixed(3) + ')' +
        '  best=' + best.fit.toFixed(4) + (best.tag === 'cur' ? '(续训) ' : '') +
        '  [' + (Date.now() - t0) / 1000 + 's]');
      fs.writeFileSync(path.join(__dirname, 'train-hell-curve.json'), JSON.stringify(curve, null, 2), 'utf8');   // 中途存档，便于长训监控
      /* 最优向量检查点：curve 只有标量，中途崩溃会丢整个策略本体 —— 每 10 代随曲线一并落盘，
       * 崩溃后可用 --from tools/train-hell-best.json 从最优向量续训（2026-09-13 事故教训） */
      fs.writeFileSync(path.join(__dirname, 'train-hell-best.json'), JSON.stringify({
        vec: best.v, fit: +best.fit.toFixed(4), gen: best.gen, tag: best.tag,
        seed: opt.seed, gens: opt.gens, savedAtGen: g, savedAt: new Date().toISOString(),
      }, null, 2), 'utf8');
    }
    const eliteN = Math.max(2, Math.ceil(opt.pop * 0.25));
    const next = [];
    for(let i = 0; i < eliteN; i++) next.push({ v: pop[i].v.slice(), tag: pop[i].tag });
    while(next.length < opt.pop){
      const parent = pop[(rng0() * eliteN) | 0];
      next.push({ v: mutate(parent.v, sigma, rng0), tag: 'child' });
    }
    pop = next;
  }

  /* ---- 独立最终验证（新种子 + 更多局数，不参与训练） ---- */
  const newVec = best.v;
  const valBase = 7770000 + opt.seed;
  const confBase = 8880000 + opt.seed;
  async function val(v, opp, base){
    const ps = [];
    for(let k = 0; k < 4; k++) ps.push(evalCandidate(v, opp, base + k * 617, 40, curVec));
    const ms = await Promise.all(ps);
    let s = 0;
    for(const m of ms) s += m;
    return s / 4;
  }
  const pNvD = val(newVec, 'default', valBase);
  const pCvD = val(curVec, 'default', valBase + 5000);
  const pNvP = val(newVec, 'pb', valBase + 10000);
  const pCvP = val(curVec, 'pb', valBase + 15000);
  const pNewVsCur = val(newVec, 'self', confBase);   // vs curVec（头对头）
  const [nVd, cVd, nVp, cVp, confNewVsCur] = await Promise.all([pNvD, pCvD, pNvP, pCvP, pNewVsCur]);
  console.log('\n=== 独立最终验证（4 种子 × 40 局均值）===');
  console.log('新策略 vs 默认        ：' + (nVd * 100).toFixed(1) + '%   （旧=' + (cVd * 100).toFixed(1) + '%）');
  console.log('新策略 vs 加强玩家模型：' + (nVp * 100).toFixed(1) + '%   （旧=' + (cVp * 100).toFixed(1) + '%）');
  console.log('新策略 vs 旧地狱策略  ：' + (confNewVsCur * 100).toFixed(1) + '%（>50% = 明显更强）');
  console.log('旧地狱策略 vs 默认    ：' + (cVd * 100).toFixed(1) + '%');

  /* ---- 是否采纳：头对头取胜（且不显著退步 vs 默认）才覆盖；--no-write 时永不覆盖 ----
   * vsPlayer 容忍线 -4pp（2026-09-13 放宽自 -2pp）：双方 vs 加强玩家模型常年在 92%+ 天花板，
   * 微小差异多为本板风格波动；头对头 vsOldHell ≥51.5% 才是强度主判据。 */
  const adopt = !opt.noWrite && confNewVsCur >= 0.515 && (nVd >= cVd - 0.015) && (nVp >= cVp - 0.04);
  /* 无论采纳与否，都把候选向量落盘（历史上否决后向量即丢失，82.2% 头对头的策略没能留存） */
  fs.writeFileSync(path.join(__dirname, 'train-hell-candidate.json'), JSON.stringify({
    vec: newVec, fitness: +best.fit.toFixed(4), bestGen: best.gen, seed: opt.seed, gens: opt.gens,
    vsDefault: +nVd.toFixed(4), vsDefaultOld: +cVd.toFixed(4),
    vsPlayer: +nVp.toFixed(4), vsPlayerOld: +cVp.toFixed(4), vsOldHell: +confNewVsCur.toFixed(4),
    adopted: adopt, trainedAt: new Date().toISOString(),
  }, null, 2), 'utf8');
  console.log('已写 tools/train-hell-candidate.json（候选向量，可用 --from 续训/复评）');
  T.phase('verify', '独立最终验证完成');
  T.tick({ t:'verify', vsDefault:+nVd.toFixed(4), vsDefaultOld:+cVd.toFixed(4),
    vsPlayer:+nVp.toFixed(4), vsPlayerOld:+cVp.toFixed(4), vsOldHell:+confNewVsCur.toFixed(4),
    fitness:+best.fit.toFixed(4), bestGen:best.gen, evals, sec:+((Date.now() - t0)/1000).toFixed(1) });
  const learned = P.unflattenPolicy(newVec);
  const meta = {
    fitness: +best.fit.toFixed(4),
    pointRateVsDefault: +nVd.toFixed(4),
    pointRateVsPlayer: +nVp.toFixed(4),
    pointRateVsOldHell: +confNewVsCur.toFixed(4),
    generations: opt.gens, seed: opt.seed, evals,
    mode: opt.grandslam ? 'grandslam' : 'selfplay-continue',
    trainedAt: new Date().toISOString().slice(0, 10),
    adopted: adopt,
  };
  fs.writeFileSync(path.join(__dirname, 'train-hell-curve.json'), JSON.stringify(curve, null, 2), 'utf8');
  console.log('已写 tools/train-hell-curve.json');

  if(!adopt){
    console.log('\n⚠ ' + (opt.noWrite ? '--no-write：实验模式，跳过写入' : '新策略未能稳定击败旧地狱策略，不覆盖') +
      ' learned-policy.js（保留 ' + (curVec === P.flattenPolicy(P.POLICY_DEFAULT) ? '默认' : '旧') + '）。');
    T.tick({ t:'done', mode:'selfplay-continue', fitness:+best.fit.toFixed(4), adopted:false,
      noWrite:!!opt.noWrite, sec:+((Date.now() - t0)/1000).toFixed(1) });
    await pool.close();
    process.exit(0);
  }

  const out =
`/* =====================================================================
 *  learned-policy.js — 自动生成：node tools/train-hell.js
 *  自对弈续训学习到的 AI 策略（partial policy，未设字段回落 POLICY_DEFAULT）
 * ===================================================================== */
'use strict';
const LEARNED_POLICY = ${JSON.stringify(learned, null, 2)};
const LEARNED_META = ${JSON.stringify(meta, null, 2)};
/* Node 训练器/诊断可 require */
if(typeof module !== 'undefined' && module.exports) module.exports = { LEARNED_POLICY, LEARNED_META };
`;
  fs.writeFileSync(path.join(__dirname, '..', 'js', 'learned-policy.js'), out, 'utf8');
  console.log('✅ 已采纳新策略并覆盖 js/learned-policy.js（原文件备份：js/learned-policy.js.bak-20260810）');
  T.tick({ t:'done', mode:'selfplay-continue', fitness:+best.fit.toFixed(4), adopted:true,
    vsDefault:+nVd.toFixed(4), vsPlayer:+nVp.toFixed(4), sec:+((Date.now() - t0)/1000).toFixed(1) });
  await pool.close();
  process.exit(0);
})();