/* =====================================================================
 *  policy.js — AI 策略层（纯函数，浏览器游戏 与 Node 训练器 共用）
 *  · POLICY_DEFAULT：默认策略（数值 = 原 hitAI 硬编码值 → 零回归）
 *  · aiDecision(ctx, policy)：把"来球上下文"映射为击球方案（纯决策）
 *  · 训练：POLICY_KEYS 定义可进化参数向量，flatten/unflatten 互转
 *  · 浏览器中若已加载 constants.js 则自动同步 STROKE/PUSH/LIFT/COUNTER/SPIN
 * ===================================================================== */
'use strict';

const cclamp = (v, a, b) => v < a ? a : (v > b ? b : v);   // 用 cclamp 避免与 constants.js 全局 clamp 冲突
/* 相对上旋（方向无关）：正=上旋 / 负=下旋 */
function relTopOf(ctx){ return ctx.sx * Math.sign(ctx.vz || 1); }
/* 高斯噪声（与 state.js#gauss 同分布，rng 可注入以便训练复现） */
function gaussOf(rng){ return (rng() + rng() + rng() - 1.5) * 0.8; }
/* 前冲力度 → 出球质量（玩家与 AI 共用，移植 physics.js#strokePower） */
function strokePowerOf(fwd){
  return { speed: 0.75 + 0.4 * fwd, spin: 0.6 + 0.55 * fwd, eat: (1 - fwd) * 0.35 };
}
/* 点路径读取（partial policy 覆盖默认，未设置字段回落默认） */
function get(p, path, def){
  if(!p) return def;
  let o = p;
  for(const k of path.split('.')){ if(o == null) return def; o = o[k]; }
  return (o === undefined || o === null) ? def : o;
}
function setPath(o, path, val){
  const ks = path.split('.'); let cur = o;
  for(let i = 0; i < ks.length - 1; i++){ if(!cur[ks[i]]) cur[ks[i]] = {}; cur = cur[ks[i]]; }
  cur[ks[ks.length - 1]] = val;
}

/* ---- AI 击球模板常量（= constants.js 的 STROKE/PUSH/LIFT/COUNTER/SPIN；浏览器自动同步）---- */
const DEFAULT_TEMPLATE = {
  TABLE_TOP: 0.76, NET_H: 0.1525, BALL_R: 0.02,
  STROKE: {
    forehand: { paceBase: 2.5, paceSwipe: 0.78, paceMax: 6.5, spinGen: 2.7, sideGen: 40, spinCap: 280, aimXMax: 0.62, arc: 1.0, recover: 0.20, control: 0.78, forgiveV: 0.14, forgiveH: 0.05, forgiveZ: 0.06, magnet: 1.35 },
    backhand: { paceBase: 3.55, paceSwipe: 0.48, paceMax: 6.4, spinGen: 0.65, sideGen: 24, spinCap: 90, aimXMax: 0.74, arc: 0.8, recover: 0.08, control: 0.66, forgiveV: 0.11, forgiveH: 0.035, forgiveZ: 0.05, magnet: 0.95 },
  },
  PUSH:    { paceShort: 2.4, paceDeep: 3.4, paceMax: 3.4, paceSwipe: 0.28, arc: 0.55, back: 38, sideCap: 45, control: 0.9, recover: 0.18, fit: { v: 0.08, h: 0.05, z: 0.06, mag: 1.5 }, arcSafe: 0.30, net: 0.10, deep: 0.45, deepPace: 0.7, xRange: 0.6 },
  LIFT:    { paceMult: 0.95, arcAdd: 0.10, netRate: 0.002, rush: 0.12 },
  COUNTER: { spinThresh: 30, arc: 0.55, paceFloor: 4.2, pacePerSpin: 0.013, paceMax: 7.0, spinBorrow: 0.4, recover: 0.06 },
  SPIN:    { sideCap: 200 },
};
// 决策用常量别名（浏览器同步自 constants.js；Node 用模板默认）
let C_TABLE_TOP = DEFAULT_TEMPLATE.TABLE_TOP;
let C_COUNTER = DEFAULT_TEMPLATE.COUNTER;

/* ---- 默认策略（数值 = 原 hitAI 硬编码，保证零回归）---- */
const POLICY_DEFAULT = {
  // 移动 / 稳定性（难度轴）
  moveSpeed: 2.45,        // = AI_SPEED
  moveErr: 0.06,          // 落点 X 预测偏差基数（仿真 aiReach 与实机 aiMoveShared 共用）
  moveZ: 2.0,             // 前后移动速度（短球上前 / 深球退后）
  // 模式选择（软概率级联）
  backThresh: -8,
  push:    { forceThresh: 40, prob: 0.62 },
  counter: { spinThreshMul: 0.85, prob: 0.8 },
  smash:   { prob: 0.6 },
  loop:    { prob: 0.7 },
  // 落点策略
  awayProb: 0.72,
  wide:        { forehand: 1.0, backhand: 1.22 },
  txMin: 0.22, txRange: 0.42,
  txErrBase: 0.07, txErrSpd: 0.038, txErrBx: 0.04, txErrSide: 0.004, txErrTop: 0.0035,
  txWideProb: 0.055, txWideMag: 0.5, txWideSpread: 0.35,
  txClamp: 0.74,
  tzBase: 0.85, tzRange: 0.45,
  // 发球（下旋发球已取消：topProb 恒为 1，仅保留字段兼容旧向量）
  serve: { topProb: 1.0, sideProb: 0.6, txSpread: 0.9, tzBase: 0.95, tzRange: 0.3 },
  // 各打法出球质量（×系数，默认=现状，零回归）
  loopPace: 1.0, loopSpin: 1.0, loopArc: 1.0,
  smashPace: 1.0, smashSpin: 1.0,
  liftPace: 1.0, defPace: 1.0, counterPace: 1.0,
  fwdBoost: 1.0,
  pushSide: 1.0, pushDepth: 1.0,
  servePace: 1.0, serveSpin: 1.0,
  TEMPLATE: DEFAULT_TEMPLATE,
};

/* ---- 当前生效策略（null → 按难度解析；在线学习/显式覆盖会替换）---- */
let currentPolicy = null;
function setCurrentPolicy(p){ currentPolicy = p; _diffCache = { d:null, pol:null }; }
function resolvedPolicy(){
  if(currentPolicy) return currentPolicy;
  return policyForModel(aiModel);
}
function policyMoveSpeed(){ return get(resolvedPolicy(), 'moveSpeed', 2.45); }  // = AI_SPEED（字面量保证 Node 可加载）

/* ---- AI 击球决策（纯函数，浏览器与训练器共用）
 * ★ AI = 自动操控的玩家：本函数不再走独立出球物理，而是生成"等效鼠标/键盘动作"
 *   （stroke / swipe 横滑 / fwd 前冲 / mouseNy 弧线 / aim 落点 / ctrlHold 搓球），
 *   然后调用与玩家 100% 相同的共享核心 SIM.resolveHit 产生出球。
 *   → AI 与玩家的机制、数值、公式完全一致，仅"挥拍动作"由策略决定。
 * ctx = { stroke, bx,by,bz, vx,vy,vz, sx,sy, aiX, playerX, dir?, svx?, svz?, rng? }
 * 返回同旧结构（outVel/fx/fy/netOut/mode/pace/power/swingType/playSoundPower/...）
 */
function aiDecision(ctx, policy, forceMode){
  const rng = ctx.rng || Math.random;
  const p = policy || POLICY_DEFAULT;
  const stroke = ctx.stroke;
  const inSpd = Math.abs(ctx.vz);
  const inTop = Math.abs(ctx.sx);
  const rtop = relTopOf(ctx);
  const isBack = rtop < get(p, 'backThresh', POLICY_DEFAULT.backThresh);
  const inBack = isBack ? -rtop : 0;
  const highBall = ctx.by > C_TABLE_TOP + 0.13;   // 半高阈值与玩家完全一致
  const outDir = ctx.dir || 1;

  // —— AI 决策：决定"这一板怎么挥"（映射为等效动作，触发 resolveHit 的涌现打法）——
  let intent = forceMode || '';
  if(forceMode){ intent = forceMode; }
  else if(isBack){
    // 下旋：搓球率 push.prob 主导（接发时用 receive.pushProb，缺省回落 push.prob）；重下旋加成；冒高下旋→拉球
    const highUnder = ctx.by > C_TABLE_TOP + 0.14;
    const pushBase = ctx.receive ? get(p, 'receive.pushProb', get(p, 'push.prob', 0.62)) : get(p, 'push.prob', 0.62);
    const pushP = cclamp(pushBase + (inBack > get(p, 'push.forceThresh', 40) ? 0.3 : 0) - (highUnder ? 0.45 : 0), 0.05, 0.95);
    intent = rng() < pushP ? 'push' : 'lift';
  }else if(ctx.receive && rng() < get(p, 'receive.attackProb', 0)){
    // 接发抢攻（对上旋发球）：正手抢冲意图 / 反手快撕——
    // 接发板 resolveHit 不判爆冲（receive 门控），正手大挥拍涌现为强快带（低平快、收敛旋转）
    intent = stroke === 'forehand' ? 'loop' : 'counter';
  }else if(stroke === 'backhand' && inTop > C_COUNTER.spinThresh && rng() < get(p, 'counter.prob', 0.8)){
    intent = 'counter';
  }else if(stroke === 'forehand' && highBall && rng() < get(p, 'smash.prob', 0.6)){
    intent = 'smash';
  }else if(stroke === 'forehand' && rng() < get(p, 'loop.prob', 0.7)){
    intent = 'loop';
  }else{
    intent = 'normal';
  }

  // —— 等效动作：swipe（横滑强度·方向）/ fwd（前冲）/ mouseNy ----
  // swipeSide：侧旋方向偏好（def 0.5=原随机各半），可进化"左拐/右拐"发球倾向
  const swipeSideP = get(p, 'swipeSide', 0.5);
  let swipe, fwd;
  if(intent === 'push'){     fwd = 0.25; swipe = 0; }
  else if(intent === 'lift'){fwd = 0.8;  swipe = (rng() < swipeSideP ? 1 : -1) * (2.2 + rng() * 1.3); }
  else if(intent === 'counter'){ fwd = 0.9; swipe = (rng() < swipeSideP ? 1 : -1) * (0.4 + rng() * 0.6); }
  else if(intent === 'smash'){ fwd = 1.0; swipe = (rng() < swipeSideP ? 1 : -1) * (4.5 + rng() * 1.5); }
  else if(intent === 'loop'){ fwd = 0.9; swipe = (rng() < swipeSideP ? 1 : -1) * (2.2 + rng() * 1.8); }
  else {                      fwd = 0.5 + rng() * 0.2; swipe = (rng() - 0.5) * 1.0; }
  fwd = cclamp(fwd * get(p, 'fwdBoost', 1.0), 0.15, 1.0);

  // —— 等效瞄准：落点（与旧落点策略一致）——
  const away = ctx.playerX > 0 ? -1 : 1;
  const wide = stroke === 'backhand' ? get(p, 'wide.backhand', 1.22) : get(p, 'wide.forehand', 1.0);
  let tx = (rng() < get(p, 'awayProb', 0.72) ? away : -away) * (get(p, 'txMin', 0.22) + rng() * get(p, 'txRange', 0.42)) * wide;
  tx += gaussOf(rng) * (get(p, 'txErrBase', 0.07) + inSpd * get(p, 'txErrSpd', 0.038) + Math.abs(ctx.bx) * get(p, 'txErrBx', 0.04) + Math.abs(ctx.sy) * get(p, 'txErrSide', 0.004) + inTop * get(p, 'txErrTop', 0.0035));
  if(rng() < get(p, 'txWideProb', 0.055)) tx += (rng() < 0.5 ? -1 : 1) * (get(p, 'txWideMag', 0.5) + rng() * get(p, 'txWideSpread', 0.35));
  tx = cclamp(tx, -get(p, 'txClamp', 0.74), get(p, 'txClamp', 0.74));
  let tz = get(p, 'tzBase', 0.85) + rng() * get(p, 'tzRange', 0.45);
  if(intent === 'push'){ tz = cclamp((0.5 + rng() * 0.7) * get(p, 'pushDepth', 1.0), 0.3, 1.6); tx *= 0.45 * get(p, 'pushSide', 1.0); }  // 搓中（pushSide=横向压缩倍率）
  else if(intent === 'counter'){ tz = cclamp(tz + 0.15, 0.7, 1.3); }
  const gx = (ctx.aiX == null) ? ctx.bx : ctx.aiX;
  // mouseNy：由落点深度反推（与玩家 mouseNy→深度 的映射一致：0=深压 … 1=摆短）
  const mouseNy = cclamp((tz - 0.92) / 0.8, 0, 1);

  // —— 调用共享出球核心（与玩家完全相同！）——（注入与决策相同的 rng → 可复现）
  // q：出球质量倍率（loopPace/loopSpin/loopArc/smashPace/smashSpin/liftPace/defPace/counterPace），
  //    由 resolveHit 按实际成型打法消费；玩家路径无 q → 全部按 1.0（零回归）
  const r = SIM.resolveHit({
    stroke,
    pos: { x: ctx.bx, y: ctx.by, z: ctx.bz },
    vel: { x: ctx.vx, y: ctx.vy, z: ctx.vz },
    spin: { x: ctx.sx, y: ctx.sy, z: 0 },
    swipe,
    fwd,
    mouseNy,
    aim: { x: tx, z: tz, gx },
    ctrlHold: intent === 'push',
    dir: outDir,
    applyArcAdj: true,
    receive: !!ctx.receive,   // 接发球板（第一板）无法触发爆冲（物理门控的唯一所有者）
    q: {
      loopPace: get(p, 'loopPace', 1.0), loopSpin: get(p, 'loopSpin', 1.0), loopArc: get(p, 'loopArc', 1.0),
      smashPace: get(p, 'smashPace', 1.0), smashSpin: get(p, 'smashSpin', 1.0),
      liftPace: get(p, 'liftPace', 1.0), defPace: get(p, 'defPace', 1.0), counterPace: get(p, 'counterPace', 1.0),
    },
    rng,
  });

  return {
    stroke, mode: r.mode,
    tx, tz, pace: r.pace, arc: r.arc, relOut: r.relOut, side: r.side, netRisk: 0,
    fwd, netOut: r.netOut,
    fx: r.spin.x, fy: r.spin.y,
    outVel: r.outVel,
    power: r.power,
    swingType: r.swingType,
    playSoundPower: cclamp(r.pace / 6, 0.3, 1),
  };
}

/* ---- AI 发球决策（移植 rules.js#startToss AI 分支 / strikeServe AI 落点）---- */
function aiServePlan(policy, rng){
  rng = rng || Math.random;
  const p = policy || POLICY_DEFAULT;
  const power = get(p, 'serve.power', 0.6);
  return {
    top: rng() < get(p, 'serve.topProb', 1.0),   // 发球旋转 mix（topProb<1 恢复下旋发球；def=1 → 恒上旋零回归）
    side: rng() < get(p, 'serve.sideProb', 0.6) ? (rng() < 0.5 ? 1 : -1) : 0,
    power: power + (rng() - 0.5) * get(p, 'serve.powerJitter', 0.3),
    type: 'long',   // 统一发球（不再区分短球/急长球）
    tx: (rng() - 0.5) * 0.9,
    tz: 0.95,
    serveSpin: get(p, 'serveSpin', 1.0),   // 旋转量倍率（调用方乘入 mag/sideMag）
    servePace: get(p, 'servePace', 1.0),   // 出球速度倍率（serveShot 解算下限/上限缩放）
  };
}
function aiServeTarget(policy, rng){
  rng = rng || Math.random;
  const p = policy || POLICY_DEFAULT;
  return { x: (rng() - 0.5) * get(p, 'serve.txSpread', 0.9), z: get(p, 'serve.tzBase', 0.95) + rng() * get(p, 'serve.tzRange', 0.3) };
}

/* ---- 可进化参数（扁平向量）---- */
const POLICY_KEYS = [
  { k: 'moveSpeed',      min: 1.6,  max: 3.4,  def: 2.45 },
  { k: 'moveErr',        min: 0.0,  max: 0.35, def: 0.06 },
  { k: 'moveZ',          min: 0.4,  max: 3.2,  def: 2.0 },
  { k: 'push.prob',      min: 0.2,  max: 0.95, def: 0.62 },
  { k: 'push.forceThresh', min: 10, max: 80,  def: 40 },
  { k: 'counter.prob',   min: 0.2,  max: 0.98, def: 0.8 },
  { k: 'smash.prob',     min: 0.0,  max: 0.95, def: 0.6 },
  { k: 'loop.prob',      min: 0.1,  max: 0.98, def: 0.7 },
  { k: 'awayProb',       min: 0.3,  max: 0.95, def: 0.72 },
  { k: 'txMin',          min: 0.05, max: 0.6,  def: 0.22 },
  { k: 'txRange',        min: 0.1,  max: 0.9,  def: 0.42 },
  { k: 'tzBase',         min: 0.5,  max: 1.35, def: 0.85 },
  { k: 'tzRange',        min: 0.05, max: 0.8,  def: 0.45 },
  { k: 'txWideProb',     min: 0.0,  max: 0.3,  def: 0.055 },
  { k: 'serve.topProb',  min: 0.0,  max: 1.0,  def: 0.45 },
  { k: 'serve.sideProb', min: 0.0,  max: 1.0,  def: 0.6 },
  // —— 出球质量维度（×系数，默认 1.0=现状）——
  { k: 'loopPace',    min: 0.85, max: 1.3,  def: 1.0 },
  { k: 'loopSpin',    min: 0.85, max: 1.35, def: 1.0 },
  { k: 'loopArc',     min: 0.8,  max: 1.25, def: 1.0 },
  { k: 'smashPace',   min: 0.85, max: 1.25, def: 1.0 },
  { k: 'smashSpin',   min: 0.8,  max: 1.3,  def: 1.0 },
  { k: 'liftPace',    min: 0.85, max: 1.25, def: 1.0 },
  { k: 'defPace',     min: 0.85, max: 1.2,  def: 1.0 },
  { k: 'counterPace', min: 0.85, max: 1.25, def: 1.0 },
  { k: 'txWideMag',   min: 0.2,  max: 0.9,  def: 0.5 },
  { k: 'fwdBoost',    min: 0.7,  max: 1.3,  def: 1.0 },
  { k: 'pushSide',    min: 0.6,  max: 1.5,  def: 1.0 },
  { k: 'pushDepth',   min: 0.6,  max: 1.6,  def: 1.0 },
  { k: 'servePace',   min: 0.85, max: 1.3,  def: 1.0 },
  { k: 'serveSpin',   min: 0.8,  max: 1.4,  def: 1.0 },
  // —— 2026-09-13 扩容（30→42）：落点凶狠度-稳定性 / 侧旋偏好 / 接发策略 / 步法回位 ——
  { k: 'txErrBase',   min: 0.02, max: 0.20, def: 0.07 },
  { k: 'txErrSpd',    min: 0.01, max: 0.12, def: 0.038 },
  { k: 'txErrBx',     min: 0.01, max: 0.12, def: 0.04 },
  { k: 'txErrSide',   min: 0.0,  max: 0.02, def: 0.004 },
  { k: 'txErrTop',    min: 0.0,  max: 0.02, def: 0.0035 },
  { k: 'txClamp',     min: 0.5,  max: 1.35, def: 0.74 },
  { k: 'wide.forehand', min: 0.7, max: 1.6, def: 1.0 },
  { k: 'wide.backhand', min: 0.7, max: 1.6, def: 1.22 },
  { k: 'swipeSide',   min: 0.0,  max: 1.0,  def: 0.5 },   // 侧旋方向偏好：P(横滑取正向)
  { k: 'receive.pushProb',   min: 0.05, max: 0.95, def: 0.62 },  // 接发(对下旋发球)搓球率；def=push.prob 默认值 → 零回归
  { k: 'receive.attackProb', min: 0.0,  max: 0.8,  def: 0.0 },   // 接发(对上旋发球)直接抢攻率
  { k: 'recoverPace', min: 4.0,  max: 12.0, def: 7.0 },   // 回位/移动跟随速度（ai.js 常数 7 参数化）
];
function flattenPolicy(p){
  return POLICY_KEYS.map(s => get(p || POLICY_DEFAULT, s.k, s.def));
}
function unflattenPolicy(vec){
  const o = {};
  POLICY_KEYS.forEach((s, i) => {
    const v = vec[i];
    setPath(o, s.k, cclamp((v == null || !isFinite(v)) ? s.def : v, s.min, s.max));
  });
  return o;
}

/* ---- 难度档位（按 POLICY_KEYS 对齐）----
   休闲(0)=迟钝+保守  标准(0.5)=现状默认  地狱(1)=学习策略(learned-policy.js，若未训练则=默认) */
const WEAK_POLICY = {
  moveSpeed: 1.8, moveErr: 0.28, moveZ: 1.0,
  push:    { prob: 0.78, forceThresh: 30 },
  counter: { prob: 0.45 }, smash: { prob: 0.05 }, loop: { prob: 0.3 },
  awayProb: 0.5, txMin: 0.12, txRange: 0.3,
  tzBase: 0.8, tzRange: 0.3, txWideProb: 0.02,
  serve: { topProb: 1.0, sideProb: 0.6 },
};
function _vecOf(p){ return POLICY_KEYS.map(s => get(p, s.k, s.def)); }
function strongVec(){
  if(typeof LEARNED_POLICY === 'undefined') return _vecOf(POLICY_DEFAULT);
  // 温和修正（2026-08-10，训练验证后）：仅保留"难度护栏"（移动/精度/前后速度轴），
  // 击球选择 / 落点 / 发球完全采用自对弈学习值。
  // · 依据：raw 学习策略在 sim 中 vs 加强玩家模型 68%、vs 默认 64%，
  //   而旧修正（强制压低 push.prob / 改发球 mix / 抬 smash）把强度砍到 46%/49%；
  //   输入级 DQN 训练器（train-input.js）的"地狱对手"也早已用本温和口径，实机应一致。
  const L = Object.assign({}, LEARNED_POLICY, {
    moveSpeed: 2.8, moveErr: 0.03, moveZ: 2.6,
  });
  return _vecOf(L);
}
let _diffCache = { d:null, pol:null };
function policyForDifficulty(d){
  d = (d == null) ? 0.5 : cclamp(d, 0, 1);
  if(_diffCache.d === d) return _diffCache.pol;
  const weak = _vecOf(WEAK_POLICY), mid = _vecOf(POLICY_DEFAULT), str = strongVec();
  let vec;
  if(d <= 0.5){ const t = d/0.5; vec = weak.map((w,i)=> w + (mid[i]-w)*t); }
  else { const t = (d-0.5)/0.5; vec = mid.map((m,i)=> m + (str[i]-m)*t); }
  const pol = unflattenPolicy(vec);
  _diffCache = { d, pol };
  return pol;
}
function policyMoveZ(){ return get(resolvedPolicy(), 'moveZ', 2.0); }
/* 模型精度系数（AI 误差缩放）：普通=1.0 · 地狱=0.5 · 大满贯=0.3（更精准） · 克星=1.0
 *   extreme / extreme-max 保持 1.0：难度已全部编码进策略自身的 moveErr
 *   （0.009 / 0.004），再乘系数会让实机比训练对手更难、两边不再同源。
 *   地狱AI克星同理=1.0：难度编码在自身学习策略里，训练评估口径即实机口径。 */
function diffPrecision(model){
  if(model === 'grandslam') return 0.3;
  if(model === 'hell') return 0.5;
  return 1.0;
}
/* 地狱AI克星：只针对地狱AI特训的克制策略（learned-policy-nemesis.js，未训练回落地狱AI）。
 * 注意：返回原始学习策略、不加护栏 —— 训练器评估的就是原始向量（对手=带护栏的地狱AI），
 * 若在此叠加护栏会破坏训练/实机一致性。 */
function nemesisPolicy(){
  if(typeof NEMESIS_POLICY === 'undefined') return policyForModel('hell');
  return unflattenPolicy(_vecOf(NEMESIS_POLICY));
}
/* 大满贯预备种子：以加强玩家模型为模板训练（learned-policy-grandslam.js），未训练回落地狱 */
function grandSlamPolicy(){
  if(typeof GRANDSLAM_POLICY === 'undefined') return policyForModel('hell');
  const L = Object.assign({}, GRANDSLAM_POLICY, {
    moveSpeed: 2.9, moveErr: 0.02, moveZ: 2.7,
    smash: { prob: Math.max(0.5, (GRANDSLAM_POLICY.smash && GRANDSLAM_POLICY.smash.prob) || 0.5) },
    serve: { topProb: 1.0, sideProb: (GRANDSLAM_POLICY.serve && GRANDSLAM_POLICY.serve.sideProb) || 0.6 },
  });
  return unflattenPolicy(_vecOf(L));
}
/* 按所选对战模型解析策略：普通=默认 · 地狱=学习策略 · 大满贯=预备种子 ·
 *   extreme / extreme-max=极端对手阶梯（opponent-ladder.js，与训练器同源）·
 *   nemesis=地狱AI克星（只针对地狱AI特训）·
 *   鼠标上的tt玩家=默认(仅发球决策用，回球由 DQN 驱动) */
function policyForModel(model){
  if(model === 'hell') return unflattenPolicy(strongVec());
  if(model === 'grandslam') return grandSlamPolicy();
  if(model === 'nemesis') return nemesisPolicy();
  if(model === 'extreme' || model === 'extreme-max'){
    if(typeof OPP_LADDER !== 'undefined') return OPP_LADDER.at(model);
    if(typeof module !== 'undefined' && module.exports) return require('./opponent-ladder.js').at(model);
  }
  return POLICY_DEFAULT;
}
/* 按“侧”取模型：斗蛐蛐(watch) 左=玩家侧(fightL)/右=AI侧(fightR)；正常对战=aiModel */
function sideModel(side){
  if(typeof mode !== 'undefined' && mode === 'watch') return (side === 'player' ? fightL : fightR);
  return aiModel;
}
/* 按“侧”取策略（physics/ai/rules 两侧 AI 共用，斗蛐蛐两 AI 可不同） */
function policyForSide(side){ return policyForModel(sideModel(side)); }

/* ---- 浏览器：constants.js 已加载 → 同步 AI 模板常量（单一物理源）---- */
if(typeof STROKE !== 'undefined'){
  DEFAULT_TEMPLATE.TABLE_TOP = TABLE_TOP;
  DEFAULT_TEMPLATE.NET_H = NET_H;
  DEFAULT_TEMPLATE.BALL_R = BALL_R;
  DEFAULT_TEMPLATE.STROKE = STROKE;
  DEFAULT_TEMPLATE.PUSH = PUSH;
  DEFAULT_TEMPLATE.LIFT = LIFT;
  DEFAULT_TEMPLATE.COUNTER = COUNTER;
  DEFAULT_TEMPLATE.SPIN = SPIN;
  C_TABLE_TOP = TABLE_TOP;
  C_COUNTER = COUNTER;
}

/* ---- Node 导出（训练器 / 回归检查用）---- */
if(typeof module !== 'undefined' && module.exports){
  module.exports = {
    clamp: cclamp, relTopOf, gaussOf, strokePowerOf, get, setPath,
    DEFAULT_TEMPLATE, POLICY_DEFAULT, POLICY_KEYS, WEAK_POLICY,
    setCurrentPolicy, resolvedPolicy, policyMoveSpeed, policyMoveZ, diffPrecision, policyForDifficulty,
    policyForModel, grandSlamPolicy, policyForSide, sideModel,
    aiDecision, aiServePlan, aiServeTarget, flattenPolicy, unflattenPolicy,
  };
}
