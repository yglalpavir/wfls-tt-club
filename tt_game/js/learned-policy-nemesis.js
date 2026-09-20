/* =====================================================================
 *  learned-policy-nemesis.js — 自动生成：node tools/train-nemesis.js
 *  「地狱AI克星」：只针对地狱AI（learned-policy.js+护栏口径）特训的克制策略
 *  （partial policy，未设字段回落 POLICY_DEFAULT；实机为原始学习策略、不加护栏）
 * ===================================================================== */
'use strict';
const NEMESIS_POLICY = {
  "moveSpeed": 3.4,
  "moveErr": 0,
  "moveZ": 2.2351540813762374,
  "push": {
    "prob": 0.2712110007443097,
    "forceThresh": 28.59171135716682
  },
  "counter": {
    "prob": 0.979926615405416
  },
  "smash": {
    "prob": 0.16358343041282333
  },
  "loop": {
    "prob": 0.7022149406699708
  },
  "awayProb": 0.95,
  "txMin": 0.5998841605992971,
  "txRange": 0.5145315151384351,
  "tzBase": 0.6676289248422745,
  "tzRange": 0.05047261797192439,
  "txWideProb": 0.049897972939086765,
  "serve": {
    "topProb": 0,
    "sideProb": 0.9050351236348947
  },
  "loopPace": 1.027337158167214,
  "loopSpin": 1.3050905462865365,
  "loopArc": 0.8140997090498506,
  "smashPace": 0.85,
  "smashSpin": 0.9214847346388082,
  "liftPace": 0.85,
  "defPace": 0.9381474522056442,
  "counterPace": 0.85,
  "txWideMag": 0.5058999612377133,
  "fwdBoost": 1.2029654819613484,
  "pushSide": 1.4193413076420887,
  "pushDepth": 1.1770102974493057,
  "servePace": 1.1532096163733283,
  "serveSpin": 1.2845498256247272,
  "txErrBase": 0.023688656985759737,
  "txErrSpd": 0.015520383766751928,
  "txErrBx": 0.026403210924884485,
  "txErrSide": 0.0038627901061798822,
  "txErrTop": 0.0004414016034344719,
  "txClamp": 0.6052349779690747,
  "wide": {
    "forehand": 1.2465737439538316,
    "backhand": 0.9783264392579948
  },
  "swipeSide": 0.46483459626324475,
  "receive": {
    "pushProb": 0.05,
    "attackProb": 0.4604635144992756
  },
  "recoverPace": 9.788434039957853
};
const NEMESIS_META = {
  "fitness": 0.6426,
  "pointRateVsHell": 0.6062,
  "pointRateVsHellPrev": 0.5908,
  "pointRateVsHellBaseline": 0.4946,
  "pointRateVsDefault": 0.8627,
  "generations": 480,
  "seed": 20260919,
  "evals": 46080,
  "mode": "hell-nemesis",
  "trainedAt": "2026-09-19",
  "adopted": true
};
/* Node 训练器/诊断可 require */
if(typeof module !== 'undefined' && module.exports) module.exports = { NEMESIS_POLICY, NEMESIS_META };
