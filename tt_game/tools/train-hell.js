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
 *  · 2026-10-16 方案A（用户批准，针对上一轮 850 代"零提升"的诊断）：
 *      ① 主目标改为「vs 现役地狱」头对头 —— 对手固定为 curVec（冻结参照，不是
 *         每代移动的 best.v），权重 0.52；旧的 0.34*pb+0.26*def 常年顶在天花板
 *         （0.94/0.90）几乎不贡献梯度。
 *      ② 冻结 moveSpeed/moveErr/moveZ（idx 0/1/2）—— 实机 policyForModel('hell')
 *         经 strongVec() 把这三项硬写为 2.8/0.03/2.6，训练却优化原始向量，导致
 *         这三维在真机上被忽略（上一轮候选第二大的改动恰好是 moveZ，实机没生效）。
 *         现在钉死在护栏值：训练向量 == 实机向量。
 *      ③ 每代局数 24→60 降噪；④ 跨代固定种子（去掉 +g*991）使 best 可比。
 *  · 2026-10-18 方案B（第四轮，针对第三轮"共演化循环"的复盘）：
 *      ① 对手池化 —— 实测（tools/_opp-ladder-hell.js，当前地狱 1800 局/对手）仓库里
 *         所有非地狱策略都挤在饱和区：default 85.50% / pusher 85.14% / pb 91.17% /
 *         grantslam 85.53%。也就是说唯一有区分度的强参照只有【历史地狱向量】。
 *         新池：self(当前线上) + old(归档的 2026-09-13 线上地狱) + nemesis(地狱克星) + pb，
 *         default / pusher 因零梯度被剔除（收尾验证里仍报 vs 默认供参考）。
 *      ② 两个强参照同时压住 —— 第三轮只有 self 一个强参照，且它已经被特化过，
 *         GA 于是去学"专治 self"，内部 fit 创新高而实测对线上倒退了 4.2pp。
 *         现在 self 与 old 两个**钉死不动的**参照同时进池，任何"只专治其中一个"
 *         的候选都会被另一个拉下来。old 用 --old 指定（默认 tools/logs/_shipped-20260913-ingame.json）。
 *      ③ 先手偏置不处理 —— 阶梯实测先手优势仅 0.04~0.81pp，远小于每对手 ~4.5pp 的
 *         标准误；花一局换一次先后手不如把预算全花在局数上（所以不做双向去偏）。
 *      ④ 每个对手局数按预期区分度分配（self 70 / old 60 / nemesis 40 / pb 60，×2 种子
 *         = 460 局/个体/代，与上一轮 480 局相当，代数吞吐不变）。
 *  · 2026-10-19 方案C（第五轮，承接第四轮 3200 局复评的结论）：
 *      第四轮实测：vs 现役 +9.8pp / vs 克星 +15.6pp / vs 2026-09-13 旧线上 −3.75pp，
 *      且留出集（default / pusher / pb）三项全在 ~1SE 内无塌陷 ⇒ 方案B 方向成立。
 *      本轮三处改动：
 *      ① old（2026-09-13 线上地狱）移出适应度池（权重 0.22→0）。它是退役策略、
 *         玩家看不到，第四轮实测它单独拖了 3.75pp；只在收尾验证里保留作历史对照。
 *      ② 新增 r2 = 归档第二轮候选（--r2，默认 tools/logs/_shipped-20261018-r2-ingame.json）。
 *         池内变成「两个地狱血统参照（self=本轮起点、R2）+ 一个非地狱血统强参照
 *         （nemesis）」。nemesis 是固定对手、权重同样不能给太高（会重演第三轮
 *         那种专治单一参照的过拟合），r2 正好夹在中间。
 *      ③ default 以 0.06 的最低权重重新进池，作「别塌陷」哨兵（它也是留出集之一）。
 *      每体每代局数 = nemesis100 + self110 + r2 90 + pb80 + default90 = 470，
 *      与第四轮 460 相当 ⇒ 仍 ~63 s/代。
 *      新增通用参照开关：--ref key=file（可重复）、--r2 <file>、--old <file>。
 *  · 2026-10-26 方案D（第六轮，针对第五轮"池化饱和"的复盘）：
 *      ① 新鲜克星进池 —— 第五轮复盘（§13.5/13.6）证明「固定参照池已榨干」：R5≈R4，
 *         且 nemesis 对当时地狱只剩 55% 压力（2026-10-26 配对复测已掉到 44.8%）。
 *         本轮先用 train-nemesis.js 对着现役地狱重训一个「新鲜克星」（Phase A，
 *         产物 tools/logs/_r6-nemesis-candidate.json），再把它以 0.30 最高权重钉进池
 *         （--nemesis2 <file>）—— 这是 §13.6 处方「双种群循环」的Hell侧半步。
 *      ② nemesis2 是克星血统参照，**不过 applyFrozen**：克星的 moveSpeed/moveErr/moveZ
 *         是它自己的学习值（3.4/0/2.235…），不像地狱血统向量被 strongVec() 硬写护栏。
 *         worker 里走 oppVec 直通（unflattenPolicy(oppVec)），与
 *         policyForModel('nemesis') 完全同构（nemesisPolicy() 无任何覆写）。
 *      ③ 旧 nemesis 降权留池（0.12）：专治新鲜克星会重演第三轮的过拟合，旧克星
 *         把候选往「对地狱血统通用强度」方向拉。self/r2/pb/default 权重相应压缩，
 *         每体每代总局数仍 470，代际吞吐不变（~60 s/代）。
 *      ④ HIP（hip-skill L1）**不进适应度池**：2026-10-26 探针实测 input-sim 里
 *         HIP-L1 对地狱 3 个种子全败 95%+ 且失分 100% 是自己出界（landAuto 关掉也只
 *         回到 ~28%，失分仍是全出界）—— 仿真物理对 HIP 的落点/力量管线失真，
 *         是个坏评估器。HIP 只在**实机**（live-match --controller hip）做最终评估，
 *         见 hell-selfplay-findings.md §16 的预注册判据。
 *  · 采纳判据铁律：内部 fitness / vsCur 只用于同一轮内部排序，**不作采纳依据**。
 *    第三轮内部 fit 创新高而实测倒退 4.2pp 就是反例。一律以
 *    tools/_hell-h2h.js 3200 局双向（--versus / --opp-nemesis）为准。
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
const opt = { gens: 400, games: 60, pop: 24, seed: 20260810, smoke: false, workers: Math.max(2, Math.min(24, os.cpus().length || 8)) };
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
  else if(args[i] === '--old'){ opt.old = args[++i]; }    // 方案B/C：钉死强参照 old（归档的 2026-09-13 线上地狱）
  else if(args[i] === '--r2'){ opt.r2 = args[++i]; }      // 方案C：钉死强参照 r2（归档的第二轮候选）
  else if(args[i] === '--ref'){ (opt.refs = opt.refs || []).push(args[++i]); }   // 方案C：额外钉死参照 key=file（可重复）
  else if(args[i] === '--nemesis2'){ opt.nemesis2 = args[++i]; }  // 方案D：钉死「新鲜克星」参照（原始向量，不过 applyFrozen）
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

/* ---- 冻结维（2026-10-16 方案A）----
 * moveSpeed / moveErr / moveZ 是 strongVec() 的实机难度护栏：policyForModel('hell')
 * 读入 LEARNED_POLICY 后会把这三项硬写为 2.8 / 0.03 / 2.6（js/policy.js L321-332）。
 * 训练/验证却走 P.unflattenPolicy(rawVec)，于是这三维在训练里被优化、在实机里被忽略
 * —— 上一轮 850 代候选第二大的改动恰好是 moveZ（0.984→1.796），实机等于没动。
 * 现在把它们钉死在护栏值上：训练向量 == 实机向量，口径一致。 */
const FROZEN = [[0, 2.8], [1, 0.03], [2, 2.6]];             // [idx, 护栏值]
const FROZEN_IDX = new Set(FROZEN.map(f => f[0]));
function applyFrozen(vec){ for(const f of FROZEN) vec[f[0]] = f[1]; return vec; }

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
applyFrozen(curVec);   // 续训起点与实机口径对齐（见 FROZEN 注释）

/* ---- 钉死强参照注册表（方案C）----
 * 第三轮只把 curVec 当强参照，而 curVec 当时已经是「被特化过的第二轮候选」，
 * 于是 GA 学会专治它、内部 fit 创新高、实测对线上倒退。钉死参照（归档文件，
 * 整轮训练期间不会动）与 curVec 同时进池，专治其一的候选会被另一个压下去。
 * 每个文件存的是 42 维扁平数组（strongVec() 实机口径）。 */
const REFS = {};                       // key -> vec（地狱血统参照已 applyFrozen；freeze=false 的参照存原始向量）
function loadRef(key, file, freeze){
  try{
    const O = JSON.parse(fs.readFileSync(file, 'utf8'));
    if(Array.isArray(O.vec) && O.vec.length === P.POLICY_KEYS.length){
      REFS[key] = (freeze === false) ? O.vec.slice() : applyFrozen(O.vec.slice());
      return true;
    }
    console.warn('参照 ' + key + ' 向量长度不符，忽略（' + file + '）');
  }catch(e){ console.warn('参照 ' + key + ' 读取失败（' + file + '）：' + e.message + ' —— 将从池中剔除'); }
  return false;
}
const OLD_FILE = opt.old || path.join(__dirname, 'logs', '_shipped-20260913-ingame.json');
/* 池内第二档参照 = 【上一个已上线的地狱】。2026-10-19 R5 上线后，R2 就是上一版，
 * 用归档的实机向量文件（_shipped-20261018-r2-ingame.json），不要用 _shipped-20261018-r2-ingame.json
 * （那个是「第二轮候选」，虽然同源，但语义上会随轮次漂移）。 */
const R2_FILE  = opt.r2  || path.join(__dirname, 'logs', '_shipped-20261018-r2-ingame.json');
loadRef('old', OLD_FILE);
loadRef('r2',  R2_FILE);
/* 方案D：新鲜克星（Phase A 产物，train-nemesis.js --no-write 的候选）。
 * 克星的 moveSpeed/moveErr/moveZ 是它自己的学习值，不经过 strongVec() 护栏 ——
 * 所以这条参照 freeze=false，worker 里走 oppVec 直通。读不到就硬失败：
 * 第六轮的整个适应度设计建立在它之上，静默降级回方案C 会让本轮训练白跑。 */
if(opt.nemesis2 && !loadRef('nemesis2', opt.nemesis2, false)){
  console.error('--nemesis2 读取失败（' + opt.nemesis2 + '），方案D 无法开跑');
  process.exit(1);
}
for(const spec of (opt.refs || [])){
  const i = spec.indexOf('=');
  if(i > 0) loadRef(spec.slice(0, i).trim(), spec.slice(i + 1).trim());
  else console.warn('--ref 格式应为 key=file，忽略：' + spec);
}
const oldVec = REFS.old || null;   // 方案C 已把它移出适应度池，只在收尾验证里报

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
  evalTask(vec, opp, base, games, curV, oppVec){
    const id = ++this.idN;
    return new Promise(resolve => {
      this.map.set(id, { resolve });
      this.queue.push({ id, vec, opp, base, games, curVec: curV, oppVec: oppVec || null });
      this._pump();
    });
  }
  async close(){ for(const r of this.workers) await r.w.terminate(); }
}

const pool = new EvalPool(opt.workers, path.join(__dirname, 'train-hell-worker.js'));

/* ---- 多种子评估一个候选（方案B：局数/种子数按对手区分度分配） ---- */
async function evalCandidate(vec, opp, base, games, seeds, curV, oppVec){
  const ps = [];
  for(let k = 0; k < seeds; k++) ps.push(pool.evalTask(vec, opp, base + k * 811, games, curV, oppVec));
  const ms = await Promise.all(ps);
  const vs = ms.filter(isFinite);
  return vs.length ? vs.reduce((x, y) => x + y, 0) / vs.length : 0.5;
}

/* ---- 对手池（2026-10-18 方案B / 2026-10-19 方案C·第五轮）----
 * 权重来自 tools/_opp-ladder-hell.js 的实测（1800 局/对手的无偏分点率）：
 *   nemesis 38.20%（第四轮起）← 唯一有真实压力的对手（地狱 AI 克星，trained counter）
 *   default 85.50% / pusher 85.14% / grandslam 85.53% / pb 91.17% ← 饱和区，零梯度
 * 方案C（第五轮）相对方案B 的三处改动：
 *   ① old（2026-09-13 线上地狱）权重 0.22 → 0（移出池）。第四轮实测它让候选
 *      vs 旧线上掉 3.75pp，而旧线上已是退役策略、玩家根本看不到它；换来的是
 *      nemesis +15.6pp + 打赢现役 9.8pp，这笔买卖整体划算，但这一个拖后腿项
 *      该摘掉。省下的局数给 r2 —— 一个**更强**的钉死地狱参照。
 *   ② 新增 r2 = 归档的第二轮候选（tools/logs/_shipped-20261018-r2-ingame.json）。
 *      池里现在有【两个地狱血统的钉死/半钉死参照】(self=R4、r2=R2) 加【一个非
 *      地狱血统的强参照】(nemesis)。第三轮就是「只专治一个已特化的地狱参照」
 *      才翻车的；nemesis 权重又不能给太高（它同样是固定对手，专治它会以同样
 *      方式过拟合），所以用 r2 把它夹在中间 —— 这是经典的 hall-of-fame 思路。
 *   ③ default 重新进池但只给 0.06：它是留出集之一（第四轮 vs 默认 86.16%，
 *      与 R2 的 85.50% 无差异），在池里当最低权重的「别塌陷」哨兵。
 * 每体每代局数：nemesis 100 + self 110 + r2 90 + pb 80 + default 90 = 470，
 * 与第四轮的 460 相当 ⇒ 代数吞吐不变（~63 s/代）。 */
const POOL_RAW = opt.nemesis2 ? [
  /* 方案D（第六轮）：新鲜克星拿最高权重（0.30，与第四轮 nemesis/self 双强参照格局对齐），
   * 旧 nemesis 降权 0.12 留池防「专治新鲜克星」的过拟合（第三轮教训）。
   * 每体每代总局数仍 470：110+100+80+60+50+70。 */
  { key: 'nemesis2',  weight: 0.30, games: 55, seeds: 2 },
  { key: 'self',      weight: 0.24, games: 50, seeds: 2 },
  { key: 'r2',        weight: 0.16, games: 40, seeds: 2 },
  { key: 'nemesis',   weight: 0.12, games: 30, seeds: 2 },
  { key: 'pb',        weight: 0.10, games: 25, seeds: 2 },
  { key: 'default',   weight: 0.08, games: 35, seeds: 2 },
] : [
  /* 方案C（第五轮）原池：不带 --nemesis2 时维持第五轮口径，老命令照旧可复现。 */
  { key: 'nemesis', weight: 0.34, games: 50, seeds: 2 },
  { key: 'self',    weight: 0.30, games: 55, seeds: 2 },
  { key: 'r2',      weight: 0.18, games: 45, seeds: 2 },
  { key: 'pb',      weight: 0.12, games: 40, seeds: 2 },
  { key: 'default', weight: 0.06, games: 45, seeds: 2 },
];
/* 先剔除缺失参照（r2 归档文件历史上可能缺失），再把权重归一化 —— 池缺一员时
 * 其余成员的相对权重不变，fit 仍然是 0..1 量纲。 */
const POOL = POOL_RAW
  .filter(e => e.key !== 'r2' || REFS.r2)
  .filter(e => e.key !== 'nemesis2' || REFS.nemesis2);
const WSUM = POOL.reduce((a, e) => a + e.weight, 0);
for(const e of POOL) e.weight = e.weight / WSUM;
const BASE = { def: opt.seed * 1000, pb: opt.seed * 2000, push: opt.seed * 3000, self: opt.seed * 4000,
               old: opt.seed * 5000, r2: opt.seed * 7000, nemesis: opt.seed * 6000, nemesis2: opt.seed * 8000 };

/* ---- 冒烟：并行环境自检 ---- */
if(opt.smoke){
  (async () => {
    const base = mulberry32(999);
    const p1 = await evalCandidate(P.flattenPolicy(P.POLICY_DEFAULT), 'default', base() * 1e5 | 0, 20, 1, curVec);
    const p2 = await evalCandidate(curVec, 'pb', base() * 1e5 | 0, 20, 1, curVec);
    const p3 = await evalCandidate(curVec, 'self', base() * 1e5 | 0, 20, 1, curVec);
    const p4 = await evalCandidate(curVec, 'nemesis', base() * 1e5 | 0, 20, 1, curVec);
    const p5 = REFS.r2  ? await evalCandidate(curVec, 'r2',  base() * 1e5 | 0, 20, 1, curVec, REFS.r2)  : NaN;
    const p6 = REFS.old ? await evalCandidate(curVec, 'old', base() * 1e5 | 0, 20, 1, curVec, REFS.old) : NaN;
    const p7 = REFS.nemesis2 ? await evalCandidate(curVec, 'nemesis2', base() * 1e5 | 0, 20, 1, curVec, REFS.nemesis2) : NaN;
    console.log('[smoke] 默认 vs 默认 : ' + (p1 * 100).toFixed(1) + '%');
    console.log('[smoke] 当前地狱 vs 加强玩家模型 : ' + (p2 * 100).toFixed(1) + '%');
    console.log('[smoke] 当前地狱 vs 当前地狱(自对弈) : ' + (p3 * 100).toFixed(1) + '%');
    console.log('[smoke] 当前地狱 vs 地狱克星 : ' + (p4 * 100).toFixed(1) + '%  ← 第四轮 38.2%→53.8% 已反转，池内最高权重压它');
    if(REFS.r2)  console.log('[smoke] 当前地狱 vs 归档R2 : ' + (p5 * 100).toFixed(1) + '%  ← R4 对 R2 的独立小样本复核，应 ≈60%');
    if(REFS.old) console.log('[smoke] 当前地狱 vs 归档旧地狱 : ' + (p6 * 100).toFixed(1) + '%');
    if(REFS.nemesis2) console.log('[smoke] 当前地狱 vs 新鲜克星 : ' + (p7 * 100).toFixed(1) + '%  ← 20 局小样本；现役克星配对复测 44.8%，新鲜克星应更低（压力更大）');
    console.log('[smoke] 对手池：' + POOL.map(e => e.key + '=' + e.weight).join(' / '));
    T.phase('smoke', '并行 worker 自检通过');
    T.tick({ t:'smoke', tag:'默认 vs 默认', winRate:+p1.toFixed(4) });
    T.tick({ t:'smoke', tag:'地狱 vs 玩家模型', winRate:+p2.toFixed(4) });
    T.tick({ t:'smoke', tag:'地狱 vs 地狱', winRate:+p3.toFixed(4) });
    T.tick({ t:'smoke', tag:'地狱 vs 克星', winRate:+p4.toFixed(4) });
    await pool.close();
    process.exit(0);
  })();
  return;
}

/* ---- 变异（沿袭 train.js：12% 跳跃 + 高斯，随代际缩小） ---- */
function mutate(vec, sigma, rng){
  const out = vec.slice();
  for(let i = 0; i < out.length; i++){
    if(FROZEN_IDX.has(i)) continue;             // 冻结维不参与变异（方案A）
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
    else if(i === 1) pop.push({ v: applyFrozen(P.flattenPolicy(P.POLICY_DEFAULT)), tag: 'base' });
    else pop.push({ v: applyFrozen(KEYS.map(s => s.min + rng0() * range(s))), tag: 'rand' });
  }
  let best = { v: curVec.slice(), fit: 0, gen: -1, tag: 'cur' };
  let evals = 0;
  const curve = [];
  const t0 = Date.now();
  console.log('地狱 AI 续训 · gens=' + opt.gens + ' games=' + opt.games + ' pop=' + opt.pop + ' seed=' + opt.seed + ' workers=' + opt.workers);
  console.log('口径(方案C)：fit=' + POOL.map(e => e.weight.toFixed(2) + '*vs' + e.key).join(' + ') +
    ' · 每对手 ' + POOL.map(e => e.key + ':' + (e.games * e.seeds)).join('/') + ' 局 · 冻结维 idx0/1/2=2.8/0.03/2.6 · 跨代固定种子');
  console.log('参照：self=当前线上(cur)  r2=' + (REFS.r2 ? '归档R2 ' + R2_FILE : '缺失(已剔除)') +
    '  nemesis=内置克星  old=' + (REFS.old ? '仅收尾验证(已移出池)' : '缺失') +
    '  nemesis2=' + (REFS.nemesis2 ? '新鲜克星 ' + opt.nemesis2 : '未指定(回退方案C池)'));
  console.log('续训起点(当前地狱策略)：' + curVec.map(v => v.toFixed(2)).join(','));
  T.phase('train', '地狱 AI 续训开始 gens=' + opt.gens + ' pop=' + opt.pop + ' games=' + opt.games + ' workers=' + opt.workers);
  for(let g = 0; g < opt.gens; g++){
    const sigma = 0.09 * (1 - g / opt.gens) + 0.025;
    /* 全代评估一次性提交（并行跑满 worker 池），再统一回收 */
    const rows = [];
    for(const m of pop){
      const r = { m };
      for(const e of POOL)
        r[e.key] = evalCandidate(m.v, e.key, BASE[e.key] || 1, e.games, e.seeds, curVec, e.key === 'self' ? null : (REFS[e.key] || null));
      rows.push(r);
    }
    for(const r of rows) for(const e of POOL) await r[e.key];
    for(const r of rows){
      const m = r.m;
      let fit = 0;
      const comp = {};
      for(const e of POOL){ const f = await r[e.key]; comp[e.key] = f; fit += e.weight * f; }
      evals += POOL.reduce((a, e) => a + 2 * e.seeds, 0);
      /* 方案C（2026-10-19）：见文件头。权重来自 tools/_opp-ladder-hell.js 实测的区分度。 */
      m.fit = fit;
      m.fSelf = comp.self;
      m.fNemesis = comp.nemesis;
      m.fNem2 = comp.nemesis2;
      m.fR2 = comp.r2;
      m.fPB = comp.pb;
      m.fDef = comp.default;
    }
    pop.sort((a, b) => b.fit - a.fit);
    const champ = pop[0];
    if(champ.fit > best.fit) best = { v: champ.v.slice(), fit: champ.fit, gen: g, tag: champ.tag };
    curve.push({ gen: g, fit: +champ.fit.toFixed(4), fSelf: +champ.fSelf.toFixed(4),
                 fNemesis: +champ.fNemesis.toFixed(4), fNem2: +(champ.fNem2 || 0).toFixed(4),
                 fR2: +(champ.fR2 || 0).toFixed(4),
                 fPB: +champ.fPB.toFixed(4), fDef: +champ.fDef.toFixed(4),
                 best: +best.fit.toFixed(4), min: +pop[pop.length - 1].fit.toFixed(4) });
    T.tick(Object.assign({ t:'gen', evals, sec:+((Date.now() - t0)/1000).toFixed(1) }, curve[curve.length - 1]));
    if(g % 10 === 0 || g === opt.gens - 1){
      console.log('gen ' + String(g).padStart(3) +
        '  top.fit=' + champ.fit.toFixed(4) +
        ' (vsCur=' + champ.fSelf.toFixed(3) + ' vsNem=' + champ.fNemesis.toFixed(3) +
        ' vsN2=' + (champ.fNem2 || 0).toFixed(3) +
        ' vsR2=' + (champ.fR2 || 0).toFixed(3) + ' vsPB=' + champ.fPB.toFixed(3) +
        ' vsDef=' + champ.fDef.toFixed(3) + ')' +
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
  async function val(v, key, base, games, seeds, oppVec){
    const ps = [];
    for(let k = 0; k < seeds; k++) ps.push(evalCandidate(v, key, base + k * 617, games, 1, curVec, oppVec));
    const ms = await Promise.all(ps);
    let s = 0;
    for(const m of ms) s += m;
    return s / seeds;
  }
  const pNvD = val(newVec, 'default', valBase, 40, 4);
  const pCvD = val(curVec, 'default', valBase + 5000, 40, 4);
  const pNvP = val(newVec, 'pb', valBase + 10000, 40, 4);
  const pCvP = val(curVec, 'pb', valBase + 15000, 40, 4);
  const pNewVsCur = val(newVec, 'self', confBase, 40, 4);   // vs curVec（头对头）—— 采纳主判据
  const pNewVsNem = val(newVec, 'nemesis', confBase + 20000, 40, 4);
  const pCurVsNem = val(curVec, 'nemesis', confBase + 30000, 40, 4);
  const pNewVsOld = oldVec ? val(newVec, 'old', confBase + 40000, 40, 4, oldVec) : Promise.resolve(NaN);
  const pCurVsOld = oldVec ? val(curVec, 'old', confBase + 45000, 40, 4, oldVec) : Promise.resolve(NaN);
  const pNewVsR2  = REFS.r2 ? val(newVec, 'r2', confBase + 50000, 40, 4, REFS.r2) : Promise.resolve(NaN);
  const pCurVsR2  = REFS.r2 ? val(curVec, 'r2', confBase + 55000, 40, 4, REFS.r2) : Promise.resolve(NaN);
  const pNewVsNem2 = REFS.nemesis2 ? val(newVec, 'nemesis2', confBase + 60000, 40, 4, REFS.nemesis2) : Promise.resolve(NaN);
  const pCurVsNem2 = REFS.nemesis2 ? val(curVec, 'nemesis2', confBase + 65000, 40, 4, REFS.nemesis2) : Promise.resolve(NaN);
  const [nVd, cVd, nVp, cVp, confNewVsCur, nVnem, cVnem, nVold, cVold, nVr2, cVr2, nVnem2, cVnem2] =
    await Promise.all([pNvD, pCvD, pNvP, pCvP, pNewVsCur, pNewVsNem, pCurVsNem, pNewVsOld, pCurVsOld, pNewVsR2, pCurVsR2, pNewVsNem2, pCurVsNem2]);
  console.log('\n=== 独立最终验证（4 种子 × 40 局均值，新种子不参与训练）===');
  console.log('新策略 vs 默认        ：' + (nVd * 100).toFixed(1) + '%   （旧=' + (cVd * 100).toFixed(1) + '%）');
  console.log('新策略 vs 加强玩家模型：' + (nVp * 100).toFixed(1) + '%   （旧=' + (cVp * 100).toFixed(1) + '%）');
  console.log('新策略 vs 地狱克星    ：' + (nVnem * 100).toFixed(1) + '%   （旧=' + (cVnem * 100).toFixed(1) + '%）  ← 池里唯一的非地狱血统强对手');
  console.log('新策略 vs 归档R2      ：' + (nVr2 * 100).toFixed(1) + '%   （旧=' + (cVr2 * 100).toFixed(1) + '%）');
  if(REFS.nemesis2) console.log('新策略 vs 新鲜克星    ：' + (nVnem2 * 100).toFixed(1) + '%   （旧=' + (cVnem2 * 100).toFixed(1) + '%）  ← 池内最高权重参照（方案D）');
  console.log('新策略 vs 当前线上    ：' + (confNewVsCur * 100).toFixed(1) + '%（>50% = 明显更强）');
  if(oldVec) console.log('新策略 vs 归档旧地狱  ：' + (nVold * 100).toFixed(1) + '%   （旧=' + (cVold * 100).toFixed(1) + '%）  ← 已移出池，仅作历史对照');

  /* ---- 是否采纳：头对头取胜（且不显著退步 vs 默认）才覆盖；--no-write 时永不覆盖 ----
   * vsPlayer 容忍线 -4pp（2026-09-13 放宽自 -2pp）：双方 vs 加强玩家模型常年在 92%+ 天花板，
   * 微小差异多为本板风格波动；头对头 vsOldHell ≥51.5% 才是强度主判据。 */
  const adopt = !opt.noWrite && confNewVsCur >= 0.515 && (nVd >= cVd - 0.015) && (nVp >= cVp - 0.04);
  /* 无论采纳与否，都把候选向量落盘（历史上否决后向量即丢失，82.2% 头对头的策略没能留存） */
  fs.writeFileSync(path.join(__dirname, 'train-hell-candidate.json'), JSON.stringify({
    vec: newVec, fitness: +best.fit.toFixed(4), bestGen: best.gen, seed: opt.seed, gens: opt.gens,
    vsDefault: +nVd.toFixed(4), vsDefaultOld: +cVd.toFixed(4),
    vsPlayer: +nVp.toFixed(4), vsPlayerOld: +cVp.toFixed(4), vsOldHell: +confNewVsCur.toFixed(4),
    vsNemesis: +nVnem.toFixed(4), vsNemesisOld: +cVnem.toFixed(4),
    vsR2: isFinite(nVr2) ? +nVr2.toFixed(4) : null, vsR2Old: isFinite(cVr2) ? +cVr2.toFixed(4) : null,
    vsNemesis2: isFinite(nVnem2) ? +nVnem2.toFixed(4) : null, vsNemesis2Old: isFinite(cVnem2) ? +cVnem2.toFixed(4) : null,
    nemesis2: opt.nemesis2 || undefined,
    vsArchivedOld: isFinite(nVold) ? +nVold.toFixed(4) : null,
    vsArchivedOldRef: isFinite(cVold) ? +cVold.toFixed(4) : null,
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