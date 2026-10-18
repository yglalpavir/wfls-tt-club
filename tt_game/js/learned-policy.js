/* =====================================================================
 *  learned-policy.js — 自动生成：node tools/train-hell.js
 *  自对弈续训学习到的 AI 策略（partial policy，未设字段回落 POLICY_DEFAULT）
 *  2026-10-18 采纳：第 2 轮「方案 A」330 代候选（3200 局双向复评 vs 2026-09-13 线上 = 57.27%）
 * ===================================================================== */
'use strict';

const LEARNED_POLICY = {
  "moveSpeed": 2.8,
  "moveErr": 0.03,
  "moveZ": 2.6,
  "push": {
    "prob": 0.20810573990847805,
    "forceThresh": 62.09102181252854
  },
  "counter": {
    "prob": 0.763695655466262
  },
  "smash": {
    "prob": 0.1737360561879275
  },
  "loop": {
    "prob": 0.9757081838844711
  },
  "awayProb": 0.95,
  "txMin": 0.6,
  "txRange": 0.5567257598042489,
  "tzBase": 0.5789159346690688,
  "tzRange": 0.10273670045426116,
  "txWideProb": 0.07982263723480305,
  "serve": {
    "topProb": 0.047814261788236334,
    "sideProb": 0.9128522036750314
  },
  "loopPace": 0.8928055600105781,
  "loopSpin": 1.1096668457628833,
  "loopArc": 0.96151074950148,
  "smashPace": 0.9978606214925556,
  "smashSpin": 1.0950931692336614,
  "liftPace": 0.85,
  "defPace": 0.909002115865741,
  "counterPace": 0.85,
  "txWideMag": 0.2,
  "fwdBoost": 1.2813117470728381,
  "pushSide": 0.6,
  "pushDepth": 1.0323250220291864,
  "servePace": 1.2538851589664661,
  "serveSpin": 1.3347265843177842,
  "txErrBase": 0.024796066774453507,
  "txErrSpd": 0.01,
  "txErrBx": 0.06928053374087668,
  "txErrSide": 0.009849191363793055,
  "txErrTop": 0.0047173522266570084,
  "txClamp": 0.5774258085514211,
  "wide": {
    "forehand": 1.555118374958567,
    "backhand": 1.1921598153457043
  },
  "swipeSide": 0.6190183669498194,
  "receive": {
    "pushProb": 0.05,
    "attackProb": 0.11195461040655118
  },
  "recoverPace": 6.543886606139544
};
const LEARNED_META = {
  "fitness": 0.737,
  "pointRateVsDefault": 0.8433,
  "pointRateVsPlayer": 0.9131,
  "pointRateVsOldHell": 0.5727,
  "vsPlayerOld": 0.9178,
  "generations": 330,
  "seed": 20260810,
  "bestGen": 255,
  "mode": "selfplay-42dim",
  "trainedAt": "2026-10-18",
  "adopted": "manual (user-approved 2026-10-18)",
  "decisiveEval": "node tools/_hell-h2h.js 200 8  ->  3200 games dual-orientation, in-game caliber (strongVec guardrail 2.8/0.03/2.6) = 57.27% vs the 2026-09-13 shipped hell",
  "note": "pointRateVsOldHell is the decisive 3200-game number. The vsDefault/vsPlayer figures come from the trainer built-in final validation (only 4 seeds x 40 games, SE about 3.9pp) and are noisy by nature. Raw LEARNED_POLICY now already carries the guardrail values (2.8/0.03/2.6), so strongVec() overwriting is idempotent. A 3rd round continued from this candidate REGRESSED to 53.08% - coevolution cycling, see tools/hell-selfplay-findings.md section 10."
};
/* Node 训练器/诊断可 require */
if(typeof module !== 'undefined' && module.exports) module.exports = { LEARNED_POLICY, LEARNED_META };
