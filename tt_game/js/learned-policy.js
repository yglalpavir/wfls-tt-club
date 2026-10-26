/* =====================================================================
 *  learned-policy.js — 自动生成：node tools/train-hell.js
 *  自对弈续训学习到的 AI 策略（partial policy，未设字段回落 POLICY_DEFAULT）
 *  2026-10-26 采纳：第 6 轮「方案 D」候选（新鲜克星进池 + HIP 实机主判据）
 *    · 3200 局双向复评 vs 2026-10-19 线上（第 5 轮候选）= 50.33 %
 *    · 主判据（用户指定）：HIP 实机配对评测 Δ = +21.49 pp（p=0.0000）
 *  · 方案D：参照池钉死新鲜克星（Phase A 产物，未采纳给访客）
 * ===================================================================== */
'use strict';

const LEARNED_POLICY = {
  "moveSpeed": 2.8,
  "moveErr": 0.03,
  "moveZ": 2.6,
  "push": {
    "prob": 0.3800483654895136,
    "forceThresh": 62.326198929693696
  },
  "counter": {
    "prob": 0.9340254872403176
  },
  "smash": {
    "prob": 0.9384263933700192
  },
  "loop": {
    "prob": 0.98
  },
  "awayProb": 0.95,
  "txMin": 0.6,
  "txRange": 0.7576335194090433,
  "tzBase": 0.7516432510287997,
  "tzRange": 0.06518447434735376,
  "txWideProb": 0.061963401314877944,
  "serve": {
    "topProb": 0,
    "sideProb": 0.9984296957992822
  },
  "loopPace": 1.0708746827047213,
  "loopSpin": 1.2168370223992226,
  "loopArc": 0.8153181429501934,
  "smashPace": 0.8956462054540998,
  "smashSpin": 1.220881467108859,
  "liftPace": 0.85,
  "defPace": 0.85,
  "counterPace": 0.85,
  "txWideMag": 0.6196624318393681,
  "fwdBoost": 1.289451991134027,
  "pushSide": 1.3683971497732665,
  "pushDepth": 0.6342593020416173,
  "servePace": 1.0232629102346593,
  "serveSpin": 1.387409633700042,
  "txErrBase": 0.14037103397524175,
  "txErrSpd": 0.029356153348926453,
  "txErrBx": 0.100689582929748,
  "txErrSide": 0.01868566427529128,
  "txErrTop": 0.005161031597962541,
  "txClamp": 0.5831070755108801,
  "wide": {
    "forehand": 1.1210151512723587,
    "backhand": 1.5783826200595408
  },
  "swipeSide": 0.04672712637831242,
  "receive": {
    "pushProb": 0.08223125829027973,
    "attackProb": 0.32846008156599327
  },
  "recoverPace": 9.08667535782545
};
const LEARNED_META = {
  "fitness": 0.5758,
  "pointRateVsDefault": 0.8733,
  "pointRateVsPlayer": 0.9041,
  "pointRateVsOldHell": 0.5033,
  "vsPlayerOld": 0.9201,
  "generations": 270,
  "seed": 20260810,
  "bestGen": 260,
  "mode": "selfplay-42dim-round6-planD",
  "trainedAt": "2026-10-26",
  "adopted": "manual (pre-authorized by user 2026-10-26: bake if stronger)",
  "decisiveEval": "node tools/_hell-h2h.js 200 8 --versus tools/logs/_shipped-20261019-r5-ingame.json -> 3200 games dual-orientation = 50.33% vs the round-5 shipped hell; PRIMARY (user-designated): HIP live paired eval delta = +21.49pp (p=0.0000, 12 seeds x 12 games, live-match --controller hip --hell-vec)",
  "note": "Round 6 (Plan D): fresh-nemesis reference pinned at 0.30 (Phase A product, NOT adopted for visitors); pool nemesis2/self/r2/nemesis/pb/default. See tools/hell-selfplay-findings.md section 16 + 17. Raw LEARNED_POLICY already carries the guardrail values (2.8/0.03/2.6), so strongVec() overwriting stays idempotent."
};
/* Node 训练器/诊断可 require */
if(typeof module !== 'undefined' && module.exports) module.exports = { LEARNED_POLICY, LEARNED_META };
