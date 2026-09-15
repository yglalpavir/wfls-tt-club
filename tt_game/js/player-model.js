/* =====================================================================
 *  player-model.js — 玩家行为模型（纯函数，浏览器/Node 共用）
 *  · 记录玩家击球 → 拟合成"玩家风格策略"（拟合 = 统计各打法频率/速度/
 *    弧线/落点/误差），再"加强"后作为 AI 训练对手
 *  · 玩家模型本质是一个参数化策略对象（兼容 policy.js#aiDecision 的 get）
 *    —— 因此 simmatch.js 无需改动即可让 AI 对战"玩家模型"
 *  · Node 中由 tools/fit-player.js 生成 js/player-fit.js 注入拟合结果；
 *    无拟合数据时回落 DEFAULT_MODEL（典型休闲玩家）
 * ===================================================================== */
'use strict';

/* 运行时取全局（浏览器为全局词法；Node 由 simmatch/train 设置 global.P / global.SIM） */
const _P = () => (typeof P !== 'undefined' ? P : global.P);
const _SIM = () => (typeof SIM !== 'undefined' ? SIM : global.SIM);
const _clamp = (v, a, b) => v < a ? a : (v > b ? b : v);

const PM = (() => {
  /* 默认玩家风格：无日志兜底（典型休闲/中水平玩家——多搓、弧线偏安全、误差较大） */
  const MODEL_DEFAULT = {
    __playerModel: true,
    // 打法频率（相对各种来球）
    push:       { prob: 0.55, forceThresh: 30 },
    counter:    { prob: 0.50 },
    smash:      { prob: 0.30 },
    loop:       { prob: 0.50 },
    // 出球风格缩放（×模板 base）
    loopPace: 0.85, loopArc: 0.92, loopSpin: 0.9,
    liftPace: 0.90, defPace: 0.95, counterPace: 0.90,
    smashPace: 0.90, smashSpin: 0.9,
    fwdBoost: 0.82,
    // 落点偏好
    awayProb: 0.60, txMin: 0.20, txRange: 0.30,
    tzBase: 0.75, tzRange: 0.35,
    txWideProb: 0.04, txWideMag: 0.4,
    pushSide: 1.0, pushDepth: 1.0,
    // 误差 / 移动（越大越菜、越慢）
    txErrBase: 0.09, moveErr: 0.12, moveSpeed: 2.2, moveZ: 1.7,
    // 发球
    serve: { topProb: 0.40, sideProb: 0.50 },
  };

  /* 从真实玩家日志拟合风格策略（统计模式频率 / pace·arc 系数 / 落点 / 误差） */
  function fitPlayerModel(logs, opts){
    opts = opts || {};
    const SIMx = _SIM();
    const Px = _P();
    const T = Px ? Px.DEFAULT_TEMPLATE : null;
    const base = { ...MODEL_DEFAULT, push: { ...MODEL_DEFAULT.push }, serve: { ...MODEL_DEFAULT.serve } };
    const need = opts.minSamples || 8;
    if(!logs || !Array.isArray(logs) || logs.length < need) return base;   // 样本太少 → 回落默认
    const all = logs.filter(l => l && l.ctx && l.act);
    if(all.length < need) return base;
    const rtop = l => l.ctx.sx * Math.sign(l.ctx.vz || 1);
    const under   = all.filter(l => rtop(l) < -8);
    const pushL   = under.filter(l => l.act.mode === 'push');
    const liftL   = under.filter(l => l.act.mode === 'lift');
    const overFh  = all.filter(l => l.ctx.stroke === 'forehand' && rtop(l) > 8);
    const loopL   = overFh.filter(l => l.act.mode === 'loop');
    const smashL  = overFh.filter(l => l.act.mode === 'smash');
    const overBh  = all.filter(l => l.ctx.stroke === 'backhand' && rtop(l) > 8);
    const counterL = overBh.filter(l => l.act.mode === 'counter');
    const defL    = overFh.filter(l => l.act.mode === 'block' || l.act.mode === 'attack');

    const mean = (arr, f) => { const vs = arr.map(f).filter(v => v != null && isFinite(v)); return vs.length ? vs.reduce((a, b) => a + b, 0) / vs.length : null; };
    const sd = (arr, f) => { const vs = arr.map(f).filter(v => v != null && isFinite(v)); if(vs.length < 2) return null;
      const mu = vs.reduce((a, b) => a + b, 0) / vs.length;
      return Math.sqrt(vs.reduce((a, x) => a + (x - mu) * (x - mu), 0) / vs.length); };

    // —— 打法频率 ——
    if(under.length)    base.push.prob   = _clamp(pushL.length / under.length, 0.1, 0.95);
    if(overBh.length)   base.counter.prob = _clamp(counterL.length / overBh.length, 0.1, 0.95);
    if(overFh.length)   base.smash.prob  = _clamp(smashL.length / overFh.length, 0.05, 0.9);
    if(overFh.length)   base.loop.prob   = _clamp(loopL.length / overFh.length, 0.05, 0.95);

    // —— pace / arc 系数（相对模板 base）——
    const lp = mean(loopL, l => l.act.pace);   if(lp) base.loopPace = _clamp(lp / (T ? 3.75 : 3.75), 0.5, 1.6);
    const la = mean(loopL, l => l.act.arc);    if(la) base.loopArc  = _clamp(la / (T ? 1.15 : 1.15), 0.6, 1.5);
    const ls = mean(loopL, l => Math.abs(l.act.relOut)); if(ls) base.loopSpin = _clamp(ls / 150, 0.4, 1.6);
    const li = mean(liftL, l => l.act.pace);   if(li) base.liftPace = _clamp(li / 3.0, 0.5, 1.6);
    const df = mean(defL,  l => l.act.pace);   if(df) base.defPace  = _clamp(df / 3.0, 0.5, 1.6);
    const sm = mean(smashL, l => l.act.pace);  if(sm) base.smashPace = _clamp(sm / 5.8, 0.5, 1.6);
    const ct = mean(counterL, l => l.act.pace); if(ct) base.counterPace = _clamp(ct / 4.5, 0.5, 1.6);
    const fb = mean(all, l => (l.act.fwd != null ? l.act.fwd : null)); if(fb != null) base.fwdBoost = _clamp(0.55 / Math.max(0.1, fb), 0.5, 1.4);

    // —— 落点偏好（aim tx / tz）——
    const txs = all.map(l => l.act.tx).filter(v => isFinite(v));
    if(txs.length){
      const mu = mean(txs, x => x), sig = sd(txs, x => x) || 0.05;
      base.txMin   = _clamp(Math.abs(mu) * 0.55, 0.05, 0.7);
      base.txRange = _clamp(sig * 1.4, 0.08, 0.7);
      base.awayProb = _clamp(0.5 + Math.abs(mu) / 0.7 * 0.45, 0.3, 0.95);
    }
    const tzs = all.map(l => Math.abs(l.act.tz)).filter(v => isFinite(v));
    if(tzs.length){
      const mu = mean(tzs, x => x), sig = sd(tzs, x => x) || 0.1;
      base.tzBase  = _clamp(mu, 0.3, 1.1);
      base.tzRange = _clamp(sig * 1.2, 0.1, 0.7);
    }

    // —— 落点误差（实际落点 vs 瞄准点；用物理反推）——
    const errs = [];
    for(const l of all){
      if(!l.act.outVel || !isFinite(l.act.tx)) continue;
      const land = SIMx && SIMx.predictLanding
        ? SIMx.predictLanding({ x: l.ctx.bx, y: l.ctx.by, z: l.ctx.bz },
                              { x: l.act.outVel.x, y: l.act.outVel.y, z: l.act.outVel.z },
                              { x: l.act.spin ? l.act.spin.x : 0, y: l.act.spin ? l.act.spin.y : 0, z: 0 })
        : null;
      if(land) errs.push(land.x - l.act.tx);
    }
    const eSig = sd(errs, x => x);
    if(eSig != null) base.txErrBase = _clamp(eSig, 0.03, 0.25);

    base.__playerModel = true;
    return base;
  }

  /* 加强版：更精准、更快、更凶、落点更刁（作为 AI 训练对手） */
  function boostModel(model){
    const b = JSON.parse(JSON.stringify(model || MODEL_DEFAULT));
    b.__playerModel = true;
    b.moveSpeed = (b.moveSpeed != null ? b.moveSpeed : 2.2) * 1.25;
    b.moveZ     = (b.moveZ     != null ? b.moveZ     : 1.7) * 1.20;
    b.moveErr   = (b.moveErr   != null ? b.moveErr   : 0.12) * 0.40;
    b.txErrBase = (b.txErrBase != null ? b.txErrBase : 0.09) * 0.55;
    b.loopPace  = (b.loopPace  != null ? b.loopPace  : 1) * 1.12;
    b.liftPace  = (b.liftPace  != null ? b.liftPace  : 1) * 1.08;
    b.defPace   = (b.defPace   != null ? b.defPace   : 1) * 1.08;
    b.counterPace = (b.counterPace != null ? b.counterPace : 1) * 1.06;
    b.smashPace = (b.smashPace != null ? b.smashPace : 1) * 1.10;
    b.fwdBoost  = (b.fwdBoost  != null ? b.fwdBoost  : 1) * 1.15;
    b.awayProb  = Math.min(0.95, (b.awayProb != null ? b.awayProb : 0.7) * 1.08);
    b.txRange   = (b.txRange != null ? b.txRange : 0.3) * 1.15;
    return b;
  }

  /* 当前玩家模型（默认 = 典型玩家；由 player-fit.js 注入真实拟合） */
  let _model = MODEL_DEFAULT;
  let _boost = boostModel(MODEL_DEFAULT);
  function setModel(m){ if(m && m.__playerModel){ _model = m; _boost = boostModel(m); } }
  function current(){ return _model; }
  function currentBoost(){ return _boost; }

  return {
    MODEL_DEFAULT, fitPlayerModel, boostModel,
    setModel, current, currentBoost,
    get PLAYER_MODEL(){ return _model; },
    get PLAYER_MODEL_BOOST(){ return _boost; },
  };
})();

/* ---- Node 导出（训练器 / 拟合脚本用；浏览器无需此文件）---- */
if(typeof module !== 'undefined' && module.exports){
  // 若已存在 js/player-fit.js（tools/fit-player.js 生成），注入拟合结果
  try{
    const fit = require('./player-fit.js');
    if(fit && fit.PLAYER_MODEL) PM.setModel(fit.PLAYER_MODEL);
  }catch(e){ /* 尚无拟合 → 用默认 */ }
  module.exports = PM;
}
