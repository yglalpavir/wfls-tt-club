/* HIP 教师（安全动作集版）：给 K 个「已验证安全」的选项打分并打标
 * ---------------------------------------------------------------------------
 * 与 tools/hip-teacher.js（336 类原始意图）的区别：
 *   1) 候选空间是 js/hip-choice.js 里的 K 个选项（每个都是实机验证过安全的
 *      my × 落点偏移组合），不���「打长出界/够不到」的组合混进学习空间；
 *   2) 打分里显式加了**挥拍代价**（|落点偏移|）——因为落点偏移只能靠挥拍实现，
 *      而挥拍会让拍子漂离球。旧教师没有这一项，所以它教出来的落点偏得很；
 *   3) 标签是 K 路 softmax（temp 可调），学生只做一次 K 分类。
 *
 * 用法（cwd = tt_game/）：
 *   node tools/hip-choice-teacher.js --opp hell,grandslam,default --points 9000 \
 *        --temp 0.12 --out data/hip/choice-v1.ndjson
 */
const path = require('path');
const fs = require('fs');

const ROOT = path.join(__dirname, '..');
const INPUTSIM = require(path.join(ROOT, 'js', 'input-sim.js'));
const SIM = global.SIM || require(path.join(ROOT, 'js', 'simcore.js'));
const OPP = require(path.join(ROOT, 'js', 'opponent-ladder.js'));
const P = require(path.join(ROOT, 'js', 'policy.js'));
const ML = require(path.join(ROOT, 'js', 'move-limit.js'));
const { HIP_SKILL } = require(path.join(ROOT, 'js', 'hip-skill.js'));
const { HIP_INTENT } = require(path.join(ROOT, 'js', 'hip-intent.js'));
const { HIP_CHOICE } = require(path.join(ROOT, 'js', 'hip-choice.js'));

function argOf(flag, def){
  const i = process.argv.indexOf(flag);
  if(i >= 0 && i + 1 < process.argv.length && !String(process.argv[i + 1]).startsWith('--')) return process.argv[i + 1];
  return def;
}
function mulberry32(a){
  return function(){
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const cl = (v, a, b) => (v < a ? a : (v > b ? b : v));

const OPP_SPEED = 2.8;      // 对手 moveSpeed
const OPP_REACT = 0.12;     // 对手反应时间（秒）
const AIM = (SIM.C && SIM.C.AIM) || { xFromPos: 0.55, xFromSwipe: 0.30, zDeep: -1.24, zShort: -0.50 };

/* ============================================================================
 * 打分模型 = 「执行模型 × 接触概率 × 落点价值」
 * ---------------------------------------------------------------------------
 * ★ 2026-10-20 重写。旧版用一个**线性挥拍代价** swingCost = 1.4·|偏移|/0.24
 *   来表示「挥拍会让拍子漂离球」，结果教师 97.6% 都选「不挥拍」——
 *   标签退化成常数，学生学不到任何东西。
 *   真实机理不是「挥拍要罚款」，而是：
 *     落点公式 aimX = 0.55·拍位x + 0.30·拍速x
 *     挥拍命令 tx = px + hold + vCmd/PACE ⇒ 拍速 svx(t)=vCmd·e^{−18t}，
 *     拍位偏移 drift(t) = (vCmd/18)(1−e^{−18t})
 *   ⇒ 挥拍量 vCmd 与「落点偏移」一一对应，而真正的代价是
 *     **触球时拍子离球 |drift| 米** ⇒ 横向接触窗口 ±FIT_X 里少了一块。
 *   所以正确做法是：把接触成功率算出来，用成功率×落点价值 − 失败率×丢分。
 *   挥拍本身几乎是免费的（drift 只有几厘米），代价在**预测误差**面前才显现。
 * ========================================================================== */

/* 横向接触窗口（实测）：低球 fitH≈0.026 ⇒ ±(PAD_HW+BALL_R+fitH)=±0.146；
 * 下旋搓球 fitH=0.170 ⇒ ±0.290；高球 fitH=0.186 ⇒ ±0.306。 */
const FIT_X_NORMAL = 0.146;
const FIT_X_PUSH = 0.290;
/* 接触点横向预测误差：实测 |误差| p50 0.05 / p90 0.107 ⇒ σ≈0.065 */
const SIGMA_X = 0.065;
const MISS_PENALTY = 3.0;      // 够不到 = 这一分直接丢

/* 标准正态 CDF（Abramowitz-Stegun 7.1.26，误差 < 1.5e-7） */
function erf(x){
  const s = x < 0 ? -1 : 1; x = Math.abs(x);
  const a1 = 0.254829592, a2 = -0.284496736, a3 = 1.421413741,
        a4 = -1.453152027, a5 = 1.061405429, p = 0.3275911;
  const t = 1 / (1 + p * x);
  const y = 1 - (((((a5 * t + a4) * t + a3) * t + a2) * t + a1) * t) * Math.exp(-x * x);
  return s * y;
}
function normCdf(x){ return 0.5 * (1 + erf(x / Math.SQRT2)); }

/* ---- L1 执行模型：把「想要的落点」翻译成「实际会落在哪」----
 * ★ 用**逐帧前向仿真**而不是解析式近似：
 *   L1 的挥拍阶段是**每帧重算** tx = px + hold + vCmd/PACE 的闭环，
 *   拍速 svx 是「测量值的一阶平滑」，所以「挥拍量 → 落点」的关系
 *   并不是简单的 0.30·vCmd（解析近似会低估实现力度约 2.5 倍）。
 *   这里照抄 tt-player.js / input-sim.js 的 padControl 动力学跑 3 帧，
 *   拿到触球瞬间的拍位 px 与拍速 svx，再算真实落点。
 *   （对应关系必须与 js/hip-skill.js plan() 保持一致。） */
function simSwing(px0, svx0, bx, want, ctx){
  const cfg = ctx.cfg, A = AIM;
  const dt = 1 / 60, rate = 18, svCap = 7;
  let px = px0, svx = svx0;
  /* ★ 仿真到**触球时刻**（τ），不是只仿真挥拍阶段那 3 帧。
   *   部署时落点闭环每帧都在跑、拍子会一路收敛到球旁（hold 项把拍位拉向球），
   *   触球瞬间的拍速 ≈ 18·(球x − 拍位x) + vCmd。
   *   只仿真 3 帧 ⇒ 「达成落点」被系统性低估（实机探针反推：低估约 2.5 倍），
   *   于是教师以为「要打偏就得挥得很大、挥大了就打不到位」，
   *   左偏选项（aim −0.24）永远排在后面 ⇒ 学生只学会「恒定打右侧」。
   *   （这一条与部署侧 js/hip-skill.js#simSwingToContact 同源，见 P5。） */
  const tau = (ctx.tau != null) ? ctx.tau : cfg.swingLead;
  const steps = Math.max(1, Math.round(cl(tau, dt, 0.5) / dt));
  let vCmd = 0;
  /* ★ 限速口径：落点的横向项只用「故意挥拍速度」（与实机 tt-player.js 的 swAim 一致），
   *   否则教师算的落点会被满速冲量拽偏 ±0.6m ⇒ 标签推荐的是实机打不到的落点。 */
  const capOn = !!(ML.getMoveLimit && ML.getMoveLimit().cap != null);
  for(let k = 0; k < steps; k++){
    /* 落点闭环（hip-skill.js: aimNow/offX/physVx/intentVx/shift/aimT） */
    const aimNow = A.xFromPos * px + A.xFromSwipe * (capOn ? vCmd : svx);
    const offX = cl((bx - px) / 0.10, -1, 1);
    const physVx = 0.22 * (ctx.inVx || 0) + 1.2 * offX;
    const intentVx = (aimNow - bx) / cfg.aimTau;
    const shift = 0.22 * (physVx - intentVx) * cfg.aimTau;
    const aimT = cl(want - shift * cfg.aimShiftGain, -0.62, 0.62);
    const hold = cl(bx - px, -cfg.holdClamp, cfg.holdClamp);
    const vA = (aimT - A.xFromPos * px) / A.xFromSwipe;
    vCmd = cl(vA, -cfg.maxSwing, cfg.maxSwing);
    const tx = cl(px + hold + vCmd / rate, -1.2, 1.2);
    /* 一帧拍子动力学（tt-player.js 的内联 padControl）
     * ★ 必须用共享的 moveStep：模型侧限速（js/move-limit.js）也要生效 ——
     *   否则教师算出的「实际落点 / 接触成功率」是无限速口径，
     *   会推荐「限速后根本够不到」的挥拍。 */
    const nx = ML.moveStep(px, tx, rate, dt, ML.getMoveLimit().cap);
    const rawV = cl((nx - px) / dt, -svCap, svCap);
    svx += (rawV - svx) * Math.min(1, dt * 12);
    px = nx;
  }
  const achieved = cl(A.xFromPos * px + A.xFromSwipe * (capOn ? vCmd : svx), -0.62, 0.62);
  return { px, svx, achieved, vCmd, drift: px - bx };
}

/* ---- 给一个选项打分 ---- */
function scoreOption(opt, ctx){
  const ctl = HIP_CHOICE.optionToIntent(opt.id, ctx.obs, AIM);
  const aimZ = AIM.zDeep + (AIM.zShort - AIM.zDeep) * ctl.my * ctl.my;
  const capOn = !!(ML.getMoveLimit && ML.getMoveLimit().cap != null);

  /* 执行模型：L1 实际会打成什么样（逐帧前向仿真挥拍阶段） */
  const ex = simSwing(ctx.px, ctx.svx, ctx.bx, ctl.aimX, ctx);
  /* 触球时拍子离球多远（drift 沿挥拍方向）+ 没到位残差 */
  const resid = Math.max(0, Math.abs(ex.px - ctx.bx) - 0);
  const sig = Math.sqrt(SIGMA_X * SIGMA_X + resid * resid);
  const fitX = (ctl.ctrl && ctx.isBack) ? FIT_X_PUSH : FIT_X_NORMAL;
  /* 接触成功：|误差 − drift| ≤ fitX，误差 ~ N(0, sig) */
  const pContact = cl(normCdf((ex.drift + fitX) / sig) - normCdf((ex.drift - fitX) / sig), 0, 1);

  let r;
  try{
    r = SIM.resolveHit({
      stroke: 'forehand',
      pos: { x: ctx.bx, y: ctx.by, z: ctx.bz },
      vel: { x: ctx.vx, y: ctx.vy, z: ctx.vz },
      spin: { x: ctx.sx, y: ctx.sy, z: 0 },
      /* ★ 限速口径：出球核的 swipe/fwd 必须与实机**完全一致**
       *   （hip-skill.js 的 swingSwipe / swingFwd：限速时「跑位冲量」不再计入球速，
       *    否则 resolveHit 的 isLoop 误判 ⇒ 这一板被当成拉球 ⇒ pace 7 ⇒ 球冲过端线）。
       *   实机在限速下传的是：swipe = 故意挥拍速度 vCmd，fwd = 0。 */
      swipe: capOn ? (ex.vCmd || 0) : ex.svx,
      fwd: capOn ? 0 : (SIM.fwdOf ? SIM.fwdOf(ctx.svz) : 0),
      mouseNy: ctl.my,
      /* 落点用「实际会落的地方」；gx = 触球时拍心的 x */
      aim: { x: ex.achieved, z: aimZ, gx: ex.px },
      ctrlHold: !!ctl.ctrl, dir: -1, applyArcAdj: true, receive: false, rng: ctx.rng,
    });
  }catch(e){ return { s: -12, legal: 0, pContact: 0 }; }
  if(!r || !r.outVel) return { s: -12, legal: 0, pContact: 0 };
  let land;
  try{
    land = SIM.simulateFull({ x: ctx.bx, y: ctx.by, z: ctx.bz }, r.outVel, 'player',
                             { x: r.spin.x, y: r.spin.y, z: 0 }, ctx.rng);
  }catch(e){ return { s: -12, legal: 0, pContact: 0 }; }
  if(!land || !land.ok) return { s: -12, legal: 0, reason: land && land.reason, pContact: 0 };
  const L = land.landing || { x: 0, z: 0 };

  /* 对手够不到的概率
   * ★ 2026-10-20 修：旧版符号写反了（sigmoid((availT−reachT)/0.1)），
   *   变成「对手来得及接 ⇒ 判对手够不到」⇒ 教师在奖励**好接的球**，
   *   于是永远选中间/靠近对手的落点。正确方向：reachT > availT 才够不到。 */
  const dist = Math.hypot(L.x - ctx.bx, L.z - ctx.bz);
  const hSpd = Math.hypot(r.outVel.x, r.outVel.z) || 1;
  const flightT = dist / hSpd;
  const reachT = Math.abs(L.x - ctx.ox) / OPP_SPEED;
  const availT = flightT + OPP_REACT;
  const pMiss = 1 / (1 + Math.exp(-(reachT - availT) / 0.10));

  const qFar = cl(Math.abs(L.x - ctx.ox) / 0.85, 0, 1);
  const az = Math.abs(L.z);
  const qDeep = az < 0.45 ? 0 : (az > 1.35 ? cl((1.45 - az) / 0.20, 0, 1)
                          : (az <= 1.05 ? (az - 0.45) / 0.60 : (1.35 - az) / 0.30));
  const spd = Math.hypot(r.outVel.x, r.outVel.y, r.outVel.z);
  const qSpeed = cl(spd / 6.5, 0, 1);
  const margin = Math.min(0.7625 - Math.abs(L.x), 1.37 - az);
  const risk = cl((0.12 - margin) / 0.12, 0, 1);

  /* ★ 深度项：现在所有常规选项的 my 都是 0.54（实机扫描的尖峰），
   *   这一项在选项之间几乎不变，保留它只是为了让「深球更有威胁」的偏好
   *   在**落点相同**时起微调作用。 */
  const V = 2.4 * pMiss + 1.2 * qFar + 1.0 * qDeep + 0.7 * qSpeed - 1.6 * risk;

  /* ★ 总分 = 接触成功率 × 落点价值 − 失败率 × 丢分代价。
   *   落点非法（出界/下网）直接判死：−12。 */
  const s = pContact * V - (1 - pContact) * MISS_PENALTY;
  return { s, legal: 1, land: L, mode: r.mode, pContact, drift: ex.drift, achieved: ex.achieved,
           /* 探针用：V 去掉 pMiss 项后的部分 + 这一球真正打出去的球 */
           V0: V - 2.4 * pMiss,
           shot: { pos: { x: ctx.bx, y: ctx.by, z: ctx.bz },
                   vel: { x: r.outVel.x, y: r.outVel.y, z: r.outVel.z },
                   spin: { x: r.spin.x, y: r.spin.y, z: 0 } } };
}

/* ==== 对手真实接球探针（ground truth）====
 * 几何近似 pMiss（reachT/availT）**不知道对手的接触容差**：
 * 实测线上对手的瞄准误差 0.055m vs 接触容差 0.209m（辅助预算 3.8 倍），
 * 于是「把球放到对手够不到的地方」在标签里根本没有信号
 * （教师退化成「恒定往右打一点」= 复制 L1）。
 * 这里直接调用 input-sim 的 aiReceive：**让对手真的去接这一球**。
 *   接到了 ⇒ 这一拍没价值（pMiss=0）；没接到 ⇒ 有价值（pMiss=1）。
 *   aiReceive 的三种失败（timeout / double / out）都是「对手没接到」。
 * 探针用独立 rng（不动游戏的 rng 流 ⇒ 不破坏 rollout 的确定性）。 */
let curOpp = null;                      // 当前对手策略（打标时用）
let curOppTag = null;                   // 当前对手档位名（写进 meta；原来写死 oppTags[0] ⇒ 全标成第一个档）
const PROBE_RNG = mulberry32(0xC0FFEE);
function probeOppMiss(sc, ctx){
  if(!curOpp || !INPUTSIM.aiReceive || !sc || !sc.shot) return null;
  try{
    /* ★ oppX 必须是对手**当前真实拍位**（ctx.ox）：传 0 等于让对手凭空回到中间，
     *   它就永远接得到 ⇒ 探针恒为 0 命中，标签退化成几何近似。 */
    const rec = INPUTSIM.aiReceive(sc.shot.pos, sc.shot.vel, sc.shot.spin, curOpp,
                                   PROBE_RNG, false, (ctx && ctx.ox) || 0);
    if(rec && rec.hit) return 0;
    if(rec) return 1;
  }catch(e){ return null; }
  return null;
}

function main(){
  const oppTags = argOf('--opp', 'hell').split(',').map(s => s.trim()).filter(Boolean);
  const points = parseInt(argOf('--points', '9000'), 10);
  const temp = parseFloat(argOf('--temp', '0.12'), 10);
  const seed = parseInt(argOf('--seed', '20261004'), 10);
  const outPath = path.resolve(ROOT, argOf('--out', 'data/hip/choice-v1.ndjson'));
  const DBG = parseInt(argOf('--debug', '0'), 10);
  /* ★ 移动预算（限速）：教师必须在**与部署同口径的限速**下 rollout，
   *   否则它算出的「实际落点 / 接触成功率」是无限速口径 ⇒ 会推荐
   *   限速后根本够不到的挥拍。--move-cap <m/s>，0/不给 = 用 move-limit.js 的出厂默认。 */
  const CAP = parseFloat(argOf('--move-cap', '0'));
  /* 探针开关：--probe 0 关（纯几何 pMiss）；--probe-top N 只探前 N 个候选 */
  const PROBE = parseInt(argOf('--probe', '1'), 10);
  const PROBE_TOP = parseInt(argOf('--probe-top', '0'), 10);
  if(CAP > 0){ ML.setMoveLimit({ cap: CAP }); }
  console.log('移动预算（限速）：横向 ' + (ML.getMoveLimit().cap == null ? '不限' : ML.getMoveLimit().cap + ' m/s'));
  let dbgLeft = DBG;
  if(!fs.existsSync(path.dirname(outPath))) fs.mkdirSync(path.dirname(outPath), { recursive: true });
  const out = fs.createWriteStream(outPath, { flags: 'w' });

  const ctl = HIP_SKILL.makeController();
  let nDecide = 0, nSamples = 0, nIllegal = 0;
  const t0 = Date.now();
  const rng = mulberry32(seed);

  const hist = {};        // 最优选项的分布（诊断用）
  let avgMax = 0, avgH = 0, avgNZ = 0, avgPC = 0, avgDrift = 0, avgProbe = 0, avgProbeMiss = 0;
  let lastIncoming = false, curIntent = null, labeled = false;
  /* 打标时刻（秒，触球前的剩余时间）：必须与 L1 的挥拍阶段起点一致 */
  const LABEL_TAU = 0.06;

  const brain = {
    act(obs){
      const incoming = (obs.vz || 0) > 0.15;
      if(!incoming){ lastIncoming = false; curIntent = null; return ctl.plan(obs, null); }
      if(!lastIncoming){ lastIncoming = true; labeled = false; }
      /* ★ 打标时刻 = **挥拍阶段起点**（τ ≤ LABEL_TAU），不是来球第一帧。
       *   理由：部署时 L2 的输出真正影响落点的是挥拍阶段（τ < swingLead=0.05），
       *   而 L1 的挥拍阶段也是由 τ 触发的 ⇒ 训练与部署必须同一时刻。
       *   早期（τ 很大）预测最不准，接触点 bx 能差 0.3m 以上，学出来的映射
       *   用在挥拍阶段上必然失配。每球只打一次标。 */
      const ct = HIP_SKILL.predictContact(obs, ctl.cfg);
      if(ct && ct.ok && !labeled && ct.tau <= LABEL_TAU){
        labeled = true;
          const rtop = HIP_INTENT.rtopOf(obs);
          const ctx = {
            obs,
            bx: ct.x, by: ct.y, bz: ct.z, tau: ct.tau,
            vx: obs.vx, vy: obs.vy, vz: obs.vz, sx: obs.sx, sy: obs.sy,
            px: obs.px || 0, svx: obs.svx || 0, svz: obs.svz || 0,
            ox: obs.ox || 0, rtop, isBack: rtop < -8,
            /* 执行模型需要的量 */
            cfg: ctl.cfg, AIM,
            inVx: ct.inVx || 0,
            natAim: AIM.xFromPos * (obs.px || 0) + AIM.xFromSwipe * (obs.svx || 0),
            receive: false, rng: mulberry32((seed + nDecide * 7919) >>> 0),
          };
          const m = HIP_CHOICE.mask({ rtop, by: ctx.by });
          const scores = new Float64Array(HIP_CHOICE.N_OPT);
          const scs = new Array(HIP_CHOICE.N_OPT).fill(null);
          let best = -1, bestS = -1e9, legalCount = 0, pcSum = 0, driftSum = 0;
          let driftBest = 0, pcBest = 0;
          for(let i = 0; i < HIP_CHOICE.N_OPT; i++){
            if(!m[i]){ scores[i] = -1e9; continue; }
            const sc = scoreOption(HIP_CHOICE.OPTIONS[i], ctx);
            scs[i] = sc; scores[i] = sc.s;
            if(sc.legal) legalCount++;
            if(sc.pContact > 0){ pcSum += sc.pContact; driftSum += Math.abs(sc.drift || 0); }
            if(sc.s > bestS){ bestS = sc.s; best = i; driftBest = sc.drift || 0; pcBest = sc.pContact || 0; }
          }
          /* ★ 探针阶段：把几何 pMiss 换成「对手真的接不到」的 ground truth。
           *   探针只跑分数最高的前 probeTop 个（默认全跑；每跑一个都是一次
           *   对手接球仿真 ⇒ 成本高；未探的选项保持几何分）。 */
          let nProbe = 0, nProbeMiss = 0;
          if(PROBE > 0 && curOpp){
            const order = [];
            for(let i = 0; i < HIP_CHOICE.N_OPT; i++) if(scs[i]) order.push(i);
            order.sort((a,b) => scores[b] - scores[a]);
            const lim = (PROBE_TOP > 0) ? Math.min(PROBE_TOP, order.length) : order.length;
            for(let k = 0; k < lim; k++){
              const i = order[k];
              const pm = probeOppMiss(scs[i], ctx);
              if(pm == null) continue;
              nProbe++;
              if(pm > 0){
                nProbeMiss++;
                /* ground truth：这一球对手接不到 ⇒ 落点价值拉满 */
                scores[i] = scs[i].pContact * (scs[i].V0 + 2.4) - (1 - scs[i].pContact) * MISS_PENALTY;
              }else{
                /* 对手接到了 ⇒ 落点价值里的 pMiss 项归零 */
                scores[i] = scs[i].pContact * scs[i].V0 - (1 - scs[i].pContact) * MISS_PENALTY;
              }
            }
            best = -1; bestS = -1e9;
            for(let i = 0; i < HIP_CHOICE.N_OPT; i++) if(scores[i] > bestS){ bestS = scores[i]; best = i; }
          }
          avgProbe += nProbe; avgProbeMiss += nProbeMiss;
          if(best >= 0 && bestS > -11){
            if(dbgLeft > 0){
              dbgLeft--;
              console.log(`\n[frame] bx=${ctx.bx.toFixed(3)} px=${ctx.px.toFixed(3)} svx=${ctx.svx.toFixed(2)} ox=${ctx.ox.toFixed(3)} tau=${ctx.tau.toFixed(3)} nat=${ctx.natAim.toFixed(3)} inVx=${(ctx.inVx||0).toFixed(2)}`);
              for(let i = 0; i < HIP_CHOICE.N_OPT; i++){
                if(!m[i]) continue;
                const sc = scoreOption(HIP_CHOICE.OPTIONS[i], ctx);
                const L = sc.land;
                console.log(`   ${HIP_CHOICE.OPTIONS[i].name.padEnd(8)} s=${sc.s.toFixed(3).padStart(8)} pc=${(sc.pContact||0).toFixed(3)} drift=${(sc.drift||0).toFixed(3).padStart(6)} ach=${(sc.achieved||0).toFixed(3).padStart(6)} land=(${L?L.x.toFixed(3):'-'},${L?L.z.toFixed(3):'-'}) mode=${sc.mode||'-'}`);
              }
            }
            let mx = -Infinity;
            for(let i = 0; i < HIP_CHOICE.N_OPT; i++) if(scores[i] > mx) mx = scores[i];
            let sum = 0;
            const p = new Float64Array(HIP_CHOICE.N_OPT);
            for(let i = 0; i < HIP_CHOICE.N_OPT; i++){
              if(scores[i] <= -1e8){ p[i] = 0; continue; }
              const e = Math.exp((scores[i] - mx) / temp); p[i] = e; sum += e;
            }
            for(let i = 0; i < HIP_CHOICE.N_OPT; i++) p[i] /= (sum || 1);
            /* 标签质量诊断 */
            let pMax = 0, h = 0, nz = 0;
            for(let i = 0; i < HIP_CHOICE.N_OPT; i++){
              if(p[i] > pMax) pMax = p[i];
              if(p[i] > 0.001) nz++;
              if(p[i] > 1e-12) h -= p[i] * Math.log(p[i]);
            }
            avgMax += pMax; avgH += h; avgNZ += nz;
            avgPC += (pcSum / Math.max(legalCount, 1)); avgDrift += driftSum;

            const f = HIP_INTENT.features(Object.assign({}, obs, { rtop }));
            const name = HIP_CHOICE.OPTIONS[best].name;
            hist[name] = (hist[name] || 0) + 1;
            out.write(JSON.stringify({
              f: Array.from(f, v => Math.round(v * 1e4) / 1e4),
              p: Array.from(p, v => Math.round(v * 1e4) / 1e4),
              top: best,
              meta: { opp: (curOppTag || oppTags[0]), bx: +ctx.bx.toFixed(3), by: +ctx.by.toFixed(3),
                      tau: +ctx.tau.toFixed(3), ox: +ctx.ox.toFixed(3), rtop: Math.round(rtop),
                      legal: legalCount, bestS: +bestS.toFixed(3),
                      pdx: +Math.abs(ctx.bx - ctx.px).toFixed(3),
                      dr: +(driftBest || 0).toFixed(3), pc: +(pcBest || 0).toFixed(3) },
            }) + '\n');
            nSamples++;
          }else{
            nIllegal++;
          }
          nDecide++;
          curIntent = best >= 0 ? HIP_CHOICE.optionToIntent(best, obs, AIM) : null;
      }
      return ctl.plan(obs, curIntent);
    },
    credit(){},
  };

  let pts = 0, wins = 0, gi = 0;
  while(pts < points && gi < points * 6){
    const oppTag = oppTags[gi % oppTags.length];
    /* ★ 对手档位：'bare'（辅助 assist=0.45，M6 引入）与 'trap' 不在阶梯表里，
     * OPP.at('bare') 会**静默回落到默认策略** ⇒ 必须像 hip-l3-collect.js 那样特判，
     * 否则教师永远只对着「从不错过」的对手学，落点维度学不到任何东西。 */
    const opp = (oppTag === 'trap') ? (P.policyForModel('trap') || P.POLICY_DEFAULT)
              : (oppTag === 'bare') ? (P.policyForModel('bare') || P.POLICY_DEFAULT)
              : (OPP.at(oppTag) || P.policyForModel(oppTag) || P.POLICY_DEFAULT);
    curOpp = opp;   /* 探针要用**当前这一局的真实对手**（assist/速度都不同） */
    curOppTag = oppTag;   /* ★ meta 里要记**真实对手**（原来写 oppTags[0] ⇒ 全部标成第一个档） */
    const r = INPUTSIM.playInputPoint(brain, opp, mulberry32((seed + gi * 7919) >>> 0),
                                      (gi % 2 === 0) ? 'player' : 'ai');
    pts++; gi++;
    if(r.winner === 'player') wins++;
  }

  out.end(() => {
    const sec = ((Date.now() - t0) / 1000).toFixed(1);
    console.log(`教师(安全动作集) 决策 ${nDecide} 次，样本 ${nSamples}，非法 ${nIllegal}，用时 ${sec}s`);
    console.log(`教师自胜 ${wins}/${pts} = ${(100 * wins / Math.max(pts,1)).toFixed(1)}%`);
    console.log('最优选项分布：');
    Object.keys(hist).sort((a,b) => hist[b] - hist[a]).forEach(k =>{
      console.log('  ' + k.padEnd(8) + String(hist[k]).padStart(6) + '  (' + (100*hist[k]/Math.max(nSamples,1)).toFixed(1) + '%)');
    });
    console.log('标签熵（0=完全确定，log(K)=完全不确定）：');
    console.log('  平均最大概率 ' + avgMax.toFixed(3) + '  平均熵 ' + avgH.toFixed(3) +
                '  非零选项数 ' + (avgNZ / Math.max(nSamples,1)).toFixed(2));
    console.log('接触成功率均值 ' + (avgPC / Math.max(nSamples,1)).toFixed(3) +
                '  挥拍漂移均值 ' + (avgDrift / Math.max(nSamples,1)).toFixed(4) + ' m');
    if(avgProbe > 0){
      console.log('对手真实接球探针：平均每球 ' + (avgProbe / Math.max(nSamples,1)).toFixed(1) +
                  ' 次，其中对手没接到 ' + (avgProbeMiss / Math.max(avgProbe,1)).toFixed(3) +
                  '（= 落点维度的真实收益率）');
    }
  });
}

main();
