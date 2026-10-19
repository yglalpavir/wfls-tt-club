/* =====================================================================
 *  learned-policy.js — 自动生成：node tools/train-hell.js
 *  自对弈续训学习到的 AI 策略（partial policy，未设字段回落 POLICY_DEFAULT）
 *  2026-10-19 采纳：第 5 轮「方案 C」520 代候选
 *    · 3200 局双向复评 vs 2026-10-18 线上（第 2 轮候选）= 60.30 %
 *    · vs 地狱 AI 克星 = 55.36 %（第 2 轮仅 38.20 %）
 *    · 留出集（default/pusher/pb/grandslam）无塌陷
 *  第 5 轮「方案 C」：对手池 nemesis/self/r2/pb/default，520 代
 * ===================================================================== */
'use strict';

const LEARNED_POLICY = {
  "moveSpeed": 2.8,
  "moveErr": 0.03,
  "moveZ": 2.6,
  "push": {
    "prob": 0.39608319905765044,
    "forceThresh": 63.141796407137726
  },
  "counter": {
    "prob": 0.8646477200609979
  },
  "smash": {
    "prob": 0.46153433204162864
  },
  "loop": {
    "prob": 0.98
  },
  "awayProb": 0.9412908609057057,
  "txMin": 0.5950254284277462,
  "txRange": 0.8794075182784978,
  "tzBase": 0.6549798088279912,
  "tzRange": 0.21994118139682195,
  "txWideProb": 0.04293451600771027,
  "serve": {
    "topProb": 0.017345036712642967,
    "sideProb": 1
  },
  "loopPace": 1.0731039537640632,
  "loopSpin": 1.3098607841636387,
  "loopArc": 0.9362267438384855,
  "smashPace": 0.8785958941023444,
  "smashSpin": 1.248136549252462,
  "liftPace": 0.85,
  "defPace": 0.863922021649261,
  "counterPace": 0.85,
  "txWideMag": 0.5053616220702758,
  "fwdBoost": 1.3,
  "pushSide": 1.126837893374933,
  "pushDepth": 0.6820408078984951,
  "servePace": 1.0638603828826683,
  "serveSpin": 1.267635751719743,
  "txErrBase": 0.08142543183981889,
  "txErrSpd": 0.015931651618823574,
  "txErrBx": 0.07026171865585273,
  "txErrSide": 0.014828190434861027,
  "txErrTop": 0.002929317312945941,
  "txClamp": 0.5,
  "wide": {
    "forehand": 1.532937310243559,
    "backhand": 1.4586235599227944
  },
  "swipeSide": 0.04667516674621289,
  "receive": {
    "pushProb": 0.05,
    "attackProb": 0.2212386488570649
  },
  "recoverPace": 9.462921254639568
};
const LEARNED_META = {
  "fitness": 0.623,
  "pointRateVsDefault": 0.8726,
  "pointRateVsPlayer": 0.9097,
  "pointRateVsOldHell": 0.603,
  "vsPlayerOld": 0.9003,
  "generations": 520,
  "seed": 20260810,
  "bestGen": 450,
  "mode": "selfplay-42dim",
  "trainedAt": "2026-10-19",
  "adopted": "manual (user-approved 2026-10-19)",
  "decisiveEval": "node tools/_hell-h2h.js 200 8 --versus tools/logs/_shipped-20261018-r2-ingame.json -> 3200 games dual-orientation = 60.30% vs the 2026-10-18 shipped hell (round 2 candidate)",
  "note": "pointRateVsOldHell is the decisive 3200-game number. vs nemesis = 55.36% (round 2 scored 38.20%), vs the 2026-09-13 hell = 53.30%. Holdout ladder (default/pusher/pb/grandslam) all within 1 SE of the previous policy - no collapse, no overfit. Raw LEARNED_POLICY already carries the guardrail values (2.8/0.03/2.6), so strongVec() overwriting is idempotent. See tools/hell-selfplay-findings.md sections 12-14."
};
/* Node 训练器/诊断可 require */
if(typeof module !== 'undefined' && module.exports) module.exports = { LEARNED_POLICY, LEARNED_META };
