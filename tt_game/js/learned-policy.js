/* =====================================================================
 *  learned-policy.js — 自动生成：node tools/train-hell.js（42 维扩容版）
 *  自对弈学习到的 AI 策略（42 维，未设字段回落 POLICY_DEFAULT）
 * ===================================================================== */
'use strict';
const LEARNED_POLICY = {
  "moveSpeed": 3.3481713013757988,
  "moveErr": 0,
  "moveZ": 0.9843173166736962,
  "push": {
    "prob": 0.95,
    "forceThresh": 10
  },
  "counter": {
    "prob": 0.9637732031999241
  },
  "smash": {
    "prob": 0.21389972348592065
  },
  "loop": {
    "prob": 0.98
  },
  "awayProb": 0.9094044374302028,
  "txMin": 0.5557670367184113,
  "txRange": 0.7420659319140279,
  "tzBase": 0.7508096171909925,
  "tzRange": 0.2274636566447164,
  "txWideProb": 0.18350551192000833,
  "serve": {
    "topProb": 0.013474876557385867,
    "sideProb": 0.9843079093363816
  },
  "loopPace": 1.1170507820228526,
  "loopSpin": 1.35,
  "loopArc": 0.8390997478214104,
  "smashPace": 0.9666542807122936,
  "smashSpin": 0.8086801137076691,
  "liftPace": 0.85,
  "defPace": 0.9225316013841384,
  "counterPace": 0.8500406307513365,
  "txWideMag": 0.6423639822934655,
  "fwdBoost": 1.2128015699357981,
  "pushSide": 0.7251451658550649,
  "pushDepth": 1.4686499571393317,
  "servePace": 1.0124774493445488,
  "serveSpin": 1.2226797793766953,
  "txErrBase": 0.08962322561784093,
  "txErrSpd": 0.0528928846386112,
  "txErrBx": 0.06567871840903536,
  "txErrSide": 0.0015802196655146173,
  "txErrTop": 0.0028277708170950907,
  "txClamp": 0.6218778689098751,
  "wide": {
    "forehand": 1.5493233292130755,
    "backhand": 1.4187975498318672
  },
  "swipeSide": 0.39509341795956254,
  "receive": {
    "pushProb": 0.826633564132786,
    "attackProb": 0.7653707568770075
  },
  "recoverPace": 6.744683881724924
};
const LEARNED_META = {
  "fitness": 0.834,
  "pointRateVsDefault": 0.9168,
  "pointRateVsPlayer": 0.9272,
  "pointRateVsOldHell": 0.8738,
  "vsPlayerOld": 0.9709,
  "generations": 1000,
  "seed": 20260913,
  "evals": 192000,
  "bestGen": 794,
  "mode": "selfplay-42dim",
  "trainedAt": "2026-09-13",
  "adopted": "manual (user-approved 2026-09-13: 头对头87.4% / vs默认+13pp / vs玩家模型-4.4pp天花板区)"
};
/* Node 训练器/诊断可 require */
if(typeof module !== 'undefined' && module.exports) module.exports = { LEARNED_POLICY, LEARNED_META };
