/* =====================================================================
 *  learned-policy-nemesis2.js — 「地狱AI克星·R7刷新版」（2026-10-28 R7 Phase A 产物）
 *  与旧版 nemesis 的差异：39/42 维不同（forceThresh 28.6→14.2、moveZ 2.24→3.15 等）。
 *  用途：R7 陪练候选转正为正式对手档（R13 实验对手变强源）。
 *  生成：tools/logs/_r7-nemesis-candidate.json → P.unflattenPolicy。
 * ===================================================================== */
'use strict';
const NEMESIS2_POLICY = {
  "moveSpeed": 3.4,
  "moveErr": 0,
  "moveZ": 3.1487964872286267,
  "push": {
    "prob": 0.44101714638499623,
    "forceThresh": 14.242802631211228
  },
  "counter": {
    "prob": 0.9770109004866929
  },
  "smash": {
    "prob": 0.07958526391468128
  },
  "loop": {
    "prob": 0.9619430207418517
  },
  "awayProb": 0.9207933189569639,
  "txMin": 0.5999983954339996,
  "txRange": 0.14038877313153744,
  "tzBase": 0.7610894511570223,
  "tzRange": 0.1615177509410515,
  "txWideProb": 0.00822895999608944,
  "serve": {
    "topProb": 0.2680016273230036,
    "sideProb": 1
  },
  "loopPace": 1.1199108464761343,
  "loopSpin": 1.2931618469320951,
  "loopArc": 0.8,
  "smashPace": 0.8594974035808304,
  "smashSpin": 1.0869294236746099,
  "liftPace": 0.8540842250111239,
  "defPace": 0.8659604121237006,
  "counterPace": 0.85,
  "txWideMag": 0.8338403203722478,
  "fwdBoost": 1.1355185332669495,
  "pushSide": 0.6004442537044757,
  "pushDepth": 1.6,
  "servePace": 1.0047213481468051,
  "serveSpin": 1.1708919419694825,
  "txErrBase": 0.06039652165552055,
  "txErrSpd": 0.04200515189116922,
  "txErrBx": 0.11062310163630172,
  "txErrSide": 0.00508584799204433,
  "txErrTop": 0.002241084168175942,
  "txClamp": 0.6349416667334654,
  "wide": {
    "forehand": 1.0067535925948956,
    "backhand": 1.2254525859687122
  },
  "swipeSide": 0,
  "receive": {
    "pushProb": 0.9448426201551113,
    "attackProb": 0.6815213771990897
  },
  "recoverPace": 5.420435740871126
};
const NEMESIS2_META = { src: "R7 Phase A candidate", trainedAt: "2026-10-28", gens: 200, fitness: 0.5995, vsHell: 0.5828 };
if(typeof module !== "undefined" && module.exports) module.exports = { NEMESIS2_POLICY, NEMESIS2_META };
