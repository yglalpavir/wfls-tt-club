/* =====================================================================
 *  player-fit.js — 自动生成：node tools/fit-player.js
 *  从真实玩家行为日志拟合出的玩家风格模型（默认 = 典型玩家）
 * ===================================================================== */
'use strict';
const PLAYER_MODEL = {
  "__playerModel": true,
  "push": {
    "prob": 0.1,
    "forceThresh": 30
  },
  "counter": {
    "prob": 0.4266666666666667
  },
  "smash": {
    "prob": 0.05
  },
  "loop": {
    "prob": 0.05
  },
  "loopPace": 0.85,
  "loopArc": 0.92,
  "loopSpin": 0.9,
  "liftPace": 1.3849511229790255,
  "defPace": 1.505625877095573,
  "counterPace": 1.0400896817488212,
  "smashPace": 0.9,
  "smashSpin": 0.9,
  "fwdBoost": 1.4,
  "awayProb": 0.5078340655535272,
  "txMin": 0.05,
  "txRange": 0.7,
  "tzBase": 1.1,
  "tzRange": 0.1276802996619424,
  "txWideProb": 0.04,
  "txWideMag": 0.4,
  "pushSide": 1,
  "pushDepth": 1,
  "txErrBase": 0.07533753383628655,
  "moveErr": 0.12,
  "moveSpeed": 2.2,
  "moveZ": 1.7,
  "serve": {
    "topProb": 0.4,
    "sideProb": 0.5
  }
};
/* Node 训练器/诊断可 require */
if(typeof module !== 'undefined' && module.exports) module.exports = { PLAYER_MODEL };
