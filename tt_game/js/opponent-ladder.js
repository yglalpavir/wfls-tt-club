/* =====================================================================
 *  opponent-ladder.js — 「极端对手」阶梯（训练器 / 实机共用）
 *  · 用途：给"鼠标上的tt玩家"（输入级 DQN）提供**逐级更强**的对阵压力。
 *    现有训练只打 `hell`（moveSpeed 2.8 / moveErr 0.03 / moveZ 2.6）；
 *    本阶梯在此之上再拉两档（elite / extreme / extreme-max），把
 *    跑位上限、落点精度、速度倍率、旋转倍率同时推到 PARAM_RANGE 允许的最大值，
 *    形成一条可复现、可插值的强度曲线，供 tools/train-input3.js 做课程调度。
 *  · 每级都是 POLICY_DEFAULT 的**派生对象**（不改动默认策略本体），
 *    所以可直接喂给 input-sim.playInputPoint / simmatch / 实机 policyForModel。
 *  · 难度轴（来自 input-sim.aiReach 与 policy.aiDecision 的实际公式）：
 *      moveSpeed / moveZ —— 跑位速度上限，决定"够不够得到球"
 *      moveErr          —— 回球落点高斯散布（gaussOf ~ N(0,1)），越小越准
 *      loop/smash/def/counter/serve *Pace* —— 出球速度倍率，直接压缩反应时间
 *      loop/smash/serve *Spin*       —— 旋转倍率，放大 errS（0.0011·|sx| 等）
 *      txErr* / awayProb / wide / txClamp —— 落点凶狠度与拉开身位能力
 *  · 用法：
 *      const OPP = require('./opponent-ladder.js');
 *      const opp = OPP.at(3);                 // 'extreme'
 *      const opp = OPP.pick(rng, 'elite');    // 同档 + 抖动（防单配置过拟合）
 *      const opp = OPP.schedule(rng, 0.6, 5); // 课程插值：0→hell 档，1→顶档
 * ===================================================================== */
'use strict';
const OPP_LADDER = (() => {
  let DEF = null;
  function defPolicy(){
    if(DEF) return DEF;
    if(typeof P !== 'undefined' && P && P.POLICY_DEFAULT) DEF = P.POLICY_DEFAULT;
    else if(typeof POLICY_DEFAULT !== 'undefined') DEF = POLICY_DEFAULT;
    else { try { DEF = require('./policy.js').POLICY_DEFAULT; } catch(e){ DEF = {}; } }
    return DEF;
  }
  const cl = (v, a, b) => v < a ? a : (v > b ? b : v);

  /* ---- 各档"难度旋钮"（其余字段回落 POLICY_DEFAULT）----
   * 数值全部落在 policy.js POLICY_KEYS 声明的 [min,max] 内，保证是可进化到/
   * 可被 GA 覆盖的真实配置，不是作弊开关。 */
  const LEVELS = [
    { id: 0, tag: 'default', name: '默认策略',
      desc: 'POLICY_DEFAULT 原样：标准速度 / 0.06 落点误差',
      diff: 0.00,
      p: {} },

    { id: 1, tag: 'hell', name: '地狱 AI',
      desc: '现有最强对手：速度 2.8 / 误差 0.03 / 纵深 2.6（v2 训练用对手）',
      diff: 0.25,
      p: { moveSpeed: 2.8, moveErr: 0.03, moveZ: 2.6 } },

    { id: 2, tag: 'elite', name: '精英对手',
      desc: '跑位更快更准 + 全线速度/旋转 ×1.12 + 落点误差 −25%',
      diff: 0.55,
      p: { moveSpeed: 3.05, moveErr: 0.017, moveZ: 2.85,
           loopPace: 1.12, smashPace: 1.12, defPace: 1.10, counterPace: 1.10,
           liftPace: 1.10, servePace: 1.12,
           loopSpin: 1.12, smashSpin: 1.12, serveSpin: 1.14,
           awayProb: 0.80, txClamp: 0.78,
           txErrBase: 0.052, txErrSpd: 0.029, txErrBx: 0.030, txErrTop: 0.0026,
           'wide.forehand': 1.05, 'wide.backhand': 1.28,
           push: { forceThresh: 40, prob: 0.66 }, counter: { spinThreshMul: 0.85, prob: 0.88 },
           smash: { prob: 0.68 }, loop: { prob: 0.78 },
           serve: { topProb: 1, sideProb: 0.72, txSpread: 0.95, tzBase: 0.95, tzRange: 0.3, power: 0.72 } } },

    { id: 3, tag: 'extreme', name: '极端对手',
      desc: '跑位近上限 + 误差减半 + 速度/旋转 ×1.22 + 凶狠落点',
      diff: 0.80,
      p: { moveSpeed: 3.25, moveErr: 0.009, moveZ: 3.05,
           loopPace: 1.22, smashPace: 1.22, defPace: 1.16, counterPace: 1.16,
           liftPace: 1.14, servePace: 1.24,
           loopSpin: 1.24, smashSpin: 1.24, serveSpin: 1.28,
           awayProb: 0.86, txClamp: 0.82, txWideProb: 0.12, txWideMag: 0.6,
           txErrBase: 0.042, txErrSpd: 0.024, txErrBx: 0.024, txErrSide: 0.003, txErrTop: 0.0022,
           'wide.forehand': 1.10, 'wide.backhand': 1.34,
           txMin: 0.26, txRange: 0.48,
           push: { forceThresh: 40, prob: 0.70 }, counter: { spinThreshMul: 0.85, prob: 0.93 },
           smash: { prob: 0.74 }, loop: { prob: 0.84 },
           serve: { topProb: 1, sideProb: 0.80, txSpread: 1.0, tzBase: 0.95, tzRange: 0.3, power: 0.82 } } },

    { id: 4, tag: 'extreme-max', name: '极端·满档',
      desc: '跑位/纵深顶格 + 误差近零 + 速度 ×1.30 旋转 ×1.34 + 概率拉满',
      diff: 1.00,
      p: { moveSpeed: 3.4, moveErr: 0.004, moveZ: 3.2,
           loopPace: 1.30, smashPace: 1.28, defPace: 1.22, counterPace: 1.20,
           liftPace: 1.18, servePace: 1.30,
           loopSpin: 1.34, smashSpin: 1.32, serveSpin: 1.36,
           awayProb: 0.92, txClamp: 0.9, txWideProb: 0.18, txWideMag: 0.65,
           txErrBase: 0.034, txErrSpd: 0.020, txErrBx: 0.020, txErrSide: 0.0025, txErrTop: 0.0018,
           'wide.forehand': 1.15, 'wide.backhand': 1.40,
           txMin: 0.30, txRange: 0.52,
           push: { forceThresh: 40, prob: 0.74 }, counter: { spinThreshMul: 0.85, prob: 0.97 },
           smash: { prob: 0.80 }, loop: { prob: 0.90 },
           serve: { topProb: 1, sideProb: 0.86, txSpread: 1.05, tzBase: 0.95, tzRange: 0.3, power: 0.92 } } },
  ];

  /* ---- 路径写入（支持 'wide.forehand' 这类嵌套键）---- */
  function setPath(o, path, val){
    const ks = path.split('.'); let cur = o;
    for(let i = 0; i < ks.length - 1; i++){
      if(cur[ks[i]] == null) cur[ks[i]] = {};
      cur = cur[ks[i]];
    }
    cur[ks[ks.length - 1]] = val;
  }

  /* ---- 生成某档对手策略（浅拷贝默认 + 逐键覆盖；抖动 spread∈[0,0.15]）----
   * 抖动让"同一档"也有若干亚型：训练时随机取亚型可显著降低对单一配置的记忆。 */
  function at(id, rng, spread){
    const lv = LEVELS[typeof id === 'number' ? id : (LEVELS.find(x => x.tag === id) || LEVELS[0]).id];
    const o = {};
    const def = defPolicy();
    for(const k of Object.keys(def)) o[k] = def[k];
    if(lv.p) for(const k of Object.keys(lv.p)) setPath(o, k, lv.p[k]);
    if(rng && spread > 0){
      const jit = (v) => v * (1 + (rng() - 0.5) * 2 * spread);
      const NUM = ['moveSpeed', 'moveErr', 'moveZ', 'loopPace', 'smashPace', 'defPace',
                   'counterPace', 'liftPace', 'servePace', 'loopSpin', 'smashSpin',
                   'serveSpin', 'awayProb', 'txClamp', 'txMin', 'txRange'];
      const R = { moveSpeed: [1.6, 3.4], moveErr: [0.0, 0.35], moveZ: [0.4, 3.2],
                  awayProb: [0.3, 0.95], txClamp: [0.5, 1.35], txMin: [0.05, 0.6], txRange: [0.05, 0.8] };
      for(const k of NUM){
        if(o[k] == null || typeof o[k] !== 'number') continue;
        const r = R[k]; o[k] = r ? cl(jit(o[k]), r[0], r[1]) : jit(o[k]);
      }
      if(o.serve) o.serve.power = cl((o.serve.power != null ? o.serve.power : 0.6) * (1 + (rng() - 0.5) * spread), 0.3, 1);
    }
    o._ladderTag = lv.tag; o._ladderId = lv.id; o._ladderDiff = lv.diff;
    return o;
  }

  /* ---- 随机取某档的一个亚型（spread 默认 0.06）---- */
  function pick(rng, tag, spread){ return at(tag, rng || Math.random, spread == null ? 0.06 : spread); }

  /* ---- 课程调度：progress∈[0,1] 在线性插值 diff 后取最近档位 ----
   * 0 = 最弱档起点（默认/hell 之间），1 = 顶档；可让训练从能赢的对手起步再逐级加压。 */
  function schedule(progress, rng, spread, floorTag){
    const q = cl(progress, 0, 1);
    let best = LEVELS[0];
    for(const lv of LEVELS) if(Math.abs(lv.diff - q) < Math.abs(best.diff - q)) best = lv;
    if(floorTag){
      const fl = LEVELS.find(x => x.tag === floorTag);
      if(fl && best.id < fl.id) best = fl;
    }
    return at(best.id, rng, spread);
  }

  return {
    LEVELS, LEVEL_TAGS: LEVELS.map(l => l.tag),
    DEFAULT_FROM: 1,          // 课程默认起点 = 'hell'（与 v2 训练对手一致）
    TOP: 4,                   // 课程终点 = 'extreme-max'
    defPolicy, at, pick, schedule,
    tagOf(p){ return (p && p._ladderTag) || 'unknown'; },
  };
})();

if(typeof module !== 'undefined' && module.exports) module.exports = OPP_LADDER;
if(typeof globalThis !== 'undefined') globalThis.OPP_LADDER = OPP_LADDER;
