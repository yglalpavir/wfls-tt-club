/* 一次性脚本：把第 2 轮候选写进 js/learned-policy.js（复刻 train-hell.js 的生成模板） */
'use strict';
const fs = require('fs');
const P = require('../js/policy.js');

const cand = JSON.parse(fs.readFileSync(__dirname + '/logs/_run330-candidate.json', 'utf8'));
const learned = P.unflattenPolicy(cand.vec);
const meta = {
  fitness: cand.fitness,
  pointRateVsDefault: cand.vsDefault,
  pointRateVsPlayer: cand.vsPlayer,
  pointRateVsOldHell: 0.5727,
  vsPlayerOld: cand.vsPlayerOld,
  generations: cand.gens,
  seed: cand.seed,
  bestGen: cand.bestGen,
  mode: 'selfplay-42dim',
  trainedAt: '2026-10-18',
  adopted: 'manual (user-approved 2026-10-18)',
  decisiveEval: 'node tools/_hell-h2h.js 200 8  ->  3200 games dual-orientation, in-game caliber (strongVec guardrail 2.8/0.03/2.6) = 57.27% vs the 2026-09-13 shipped hell',
  note: 'pointRateVsOldHell is the decisive 3200-game number. The vsDefault/vsPlayer figures come from the trainer built-in final validation (only 4 seeds x 40 games, SE about 3.9pp) and are noisy by nature. Raw LEARNED_POLICY now already carries the guardrail values (2.8/0.03/2.6), so strongVec() overwriting is idempotent. A 3rd round continued from this candidate REGRESSED to 53.08% - coevolution cycling, see tools/hell-selfplay-findings.md section 10.'
};

const out =
'/* =====================================================================\n' +
' *  learned-policy.js — 自动生成：node tools/train-hell.js\n' +
' *  自对弈续训学习到的 AI 策略（partial policy，未设字段回落 POLICY_DEFAULT）\n' +
' *  2026-10-18 采纳：第 2 轮「方案 A」330 代候选（3200 局双向复评 vs 2026-09-13 线上 = 57.27%）\n' +
' * ===================================================================== */\n' +
"'use strict';\n\n" +
'const LEARNED_POLICY = ' + JSON.stringify(learned, null, 2) + ';\n' +
'const LEARNED_META = ' + JSON.stringify(meta, null, 2) + ';\n' +
'/* Node 训练器/诊断可 require */\n' +
"if(typeof module !== 'undefined' && module.exports) module.exports = { LEARNED_POLICY, LEARNED_META };\n";

fs.writeFileSync(__dirname + '/../js/learned-policy.js', out, 'utf8');
console.log('written bytes=' + Buffer.byteLength(out) + '  vecLen=' + cand.vec.length);