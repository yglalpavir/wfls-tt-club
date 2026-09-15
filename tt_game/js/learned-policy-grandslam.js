/* =====================================================================
 *  learned-policy-grandslam.js — 自动生成：node tools/train.js --grandslam
 *  大满贯预备种子 — 以加强玩家模型为模板训练（partial policy）
 * ===================================================================== */
'use strict';
const GRANDSLAM_POLICY = {
  "moveSpeed": 3.365630184464981,
  "moveErr": 0,
  "moveZ": 1.8895590280308736,
  "push": {
    "prob": 0.7544515888323076,
    "forceThresh": 63.85201323947309
  },
  "counter": {
    "prob": 0.7873600276698691
  },
  "smash": {
    "prob": 0.41020360569053377
  },
  "loop": {
    "prob": 0.98
  },
  "awayProb": 0.6239287960474597,
  "txMin": 0.20999421257126172,
  "txRange": 0.12066497396462789,
  "tzBase": 0.9121941854707258,
  "tzRange": 0.23328141009434195,
  "txWideProb": 0.11311697519748189,
  "serve": {
    "topProb": 0.27815958320267237,
    "sideProb": 0.9719293136214535
  },
  "loopPace": 1.0,
  "loopSpin": 1.0,
  "loopArc": 1.0,
  "smashPace": 1.0,
  "smashSpin": 1.0,
  "liftPace": 1.0,
  "defPace": 1.0,
  "counterPace": 1.0,
  "txWideMag": 0.49907828818361505,
  "fwdBoost": 1.1305428877498827,
  "pushSide": 1.0,
  "pushDepth": 1.0157998411079494,
  "servePace": 1.0,
  "serveSpin": 1.0
};
/* 2026-09-13 注：上方 12 个出球质量键（loopPace/smashSpin 等）在训练时是"死维度"
 * （resolveHit 不消费，GA 随机变异值从未生效）。42 维扩容接通后这些值会真实改变出球，
 * 故重置回默认 1.0 保持大满贯既有打法不变；如需让大满贯利用新维度请用 train.js 重训。 */
const GRANDSLAM_META = {
  "fitness": 0.8613,
  "pointRateVsDefault": 0.8118,
  "winsVsDefault": 220,
  "lossesVsDefault": 51,
  "pointRateVsPusher": 0.8494,
  "pointRateVsPlayer": 0.9091,
  "generations": 100,
  "seed": 20260802,
  "evals": 6400,
  "mode": "grandslam",
  "trainedAt": "2026-08-02"
};
/* Node 训练器/诊断可 require */
if(typeof module !== 'undefined' && module.exports) module.exports = { GRANDSLAM_POLICY, GRANDSLAM_META };
