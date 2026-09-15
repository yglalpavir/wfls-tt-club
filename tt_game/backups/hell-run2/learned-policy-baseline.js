/* =====================================================================
 *  learned-policy.js — 自动生成：node tools/train.js
 *  自对弈学习到的 AI 策略（partial policy，未设字段回落 POLICY_DEFAULT）
 * ===================================================================== */
'use strict';
const LEARNED_POLICY = {
  "moveSpeed": 2.9869563711602964,
  "moveErr": 0,
  "moveZ": 3.2,
  "push": {
    "prob": 0.6938139224650491,
    "forceThresh": 10
  },
  "counter": {
    "prob": 0.6847483213422288
  },
  "smash": {
    "prob": 0.3791709942924242
  },
  "loop": {
    "prob": 0.824364180895322
  },
  "awayProb": 0.95,
  "txMin": 0.2672969871577573,
  "txRange": 0.1,
  "tzBase": 0.676253045938619,
  "tzRange": 0.31500098261895093,
  "txWideProb": 0.101831740113024,
  "serve": {
    "topProb": 1.0,
    "sideProb": 1
  },
  "loopPace": 1.0,
  "loopSpin": 1.0,
  "loopArc": 1.0,
  "smashPace": 1.0,
  "smashSpin": 1.0,
  "liftPace": 1.0,
  "defPace": 1.0,
  "counterPace": 1.0,
  "txWideMag": 0.23654284075934157,
  "fwdBoost": 0.7,
  "pushSide": 1.0,
  "pushDepth": 1.4442339243281088,
  "servePace": 1.0,
  "serveSpin": 1.0
};
/* 2026-09-13 注：从 learned-policy.js.bak-20260810 恢复（fitness 0.6603 / vs 默认 64.65%）。
 * 其中 12 个出球质量键与 serve.topProb 在该次训练时是"死维度"（resolveHit 不消费，
 * 值为 GA 随机噪声），42 维扩容接通后已归一到默认 1.0，保持基线行为与历史测评口径一致。
 * serve.topProb 归 1.0：训练时无消费者，其 0.14 的噪声值会引入 86% 下旋发球。 */
const LEARNED_META = {
  "fitness": 0.6603,
  "pointRateVsDefault": 0.6465,
  "winsVsDefault": 203,
  "lossesVsDefault": 111,
  "pointRateVsPusher": 0.6616,
  "pointRateVsPlayer": 0.631,
  "generations": 100,
  "seed": 20260802,
  "evals": 6400,
  "mode": "selfplay",
  "trainedAt": "2026-08-09"
};
/* Node 训练器/诊断可 require */
if(typeof module !== 'undefined' && module.exports) module.exports = { LEARNED_POLICY, LEARNED_META };
