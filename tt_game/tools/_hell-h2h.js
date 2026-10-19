/* =====================================================================
 * _hell-h2h.js — 独立复评：候选地狱策略 vs 参照地狱策略
 *   · 双向对打（A 先手 / B 先手）取无偏胜率，消除先后手偏置
 *   · 口径与 train-hell.js 一致（js/simmatch.js）
 * 用法：
 *   node tools/_hell-h2h.js [每种子局数] [种子数]
 *   node tools/_hell-h2h.js 200 8 --from tools/logs/_run330-candidate.json
 *   node tools/_hell-h2h.js 200 8 --versus tools/train-hell-candidate.json   # 换参照
 *   node tools/_hell-h2h.js 200 8 --opp-raw                                  # 原始口径（实机不用）
 * ===================================================================== */
'use strict';
const path = require('path');
const fs = require('fs');
const P = require(path.join(__dirname, '..', 'js', 'policy.js'));
const SIM = require(path.join(__dirname, '..', 'js', 'simmatch.js'));

function mulberry32(a){ return function(){ a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }

const LP = require(path.join(__dirname, '..', 'js', 'learned-policy.js'));

/* 参照口径（★ 2026-10-17 修正）：
 * 游戏里地狱 AI 走 policy.js#strongVec()，它把 moveSpeed/moveErr/moveZ 硬写成
 * 2.8/0.03/2.6（护栏）。而 js/learned-policy.js 里的 LEARNED_POLICY 原始值并不是这三维
 * （线上原始 moveSpeed≈3.35 / moveErr≈0 / moveZ≈0.98），实机永不使用。
 * 所以「候选 vs 线上」必须用实机口径 —— 默认 strongVec()；加 --opp-raw 才用原始向量；
 * 加 --versus <file> 则改用任意 {vec:[...]} 检查点作参照（例如上一轮候选）。 */
const USE_RAW = process.argv.includes('--opp-raw');
const USE_NEMESIS = process.argv.includes('--opp-nemesis');
const argOf = (name) => { const i = process.argv.indexOf(name); return (i >= 0 && process.argv[i + 1]) ? process.argv[i + 1] : ''; };
const VERSUS_FILE = argOf('--versus');
const FROM_FILE = argOf('--from');

let OPP, OPP_LABEL;
if(VERSUS_FILE){
  OPP = P.unflattenPolicy(JSON.parse(fs.readFileSync(VERSUS_FILE, 'utf8')).vec);
  OPP_LABEL = '指定参照 ' + VERSUS_FILE;
} else if(USE_NEMESIS){
  OPP = P.policyForModel('nemesis');
  OPP_LABEL = '地狱AI克星 policyForModel("nemesis")（第四轮新增：非地狱血统的强参照）';
} else {
  OPP = P.unflattenPolicy(USE_RAW ? P.flattenPolicy(LP.LEARNED_POLICY) : P.strongVec());
  OPP_LABEL = USE_RAW ? '原始 LEARNED_POLICY（实机不用）' : 'strongVec() 实机口径（护栏 2.8/0.03/2.6）';
}
console.log('对手口径: ' + OPP_LABEL);

/* 候选来源：默认 tools/train-hell-candidate.json；可用 --from <file> 指向别的检查点
 * （例如长跑途中的 tools/train-hell-best.json，用于中途预判是否只是自对弈循环的假提升）。 */
const CAND_FILE = FROM_FILE || path.join(__dirname, 'train-hell-candidate.json');
const CANDVEC = JSON.parse(fs.readFileSync(CAND_FILE, 'utf8')).vec;
const CAND = P.unflattenPolicy(CANDVEC);
console.log('候选来源: ' + CAND_FILE);

const VALUE_FLAGS = ['--from', '--versus'];
const _pos = process.argv.slice(2).filter((v, i, arr) => {
  if(v === '--opp-raw') return false;
  if(v === '--opp-nemesis') return false;
  if(VALUE_FLAGS.includes(v)) return false;
  if(i > 0 && VALUE_FLAGS.includes(arr[i - 1])) return false;
  return true;
});
const GAMES = parseInt(_pos[0] || '200', 10);
const SEEDS = parseInt(_pos[1] || '8', 10);

function rate(pA, pB, base){
  const rngF = k => mulberry32(base + k);
  return SIM.playMatch(pA, pB, { games: GAMES, rngFactory: rngF }).pointRate;
}

let ab = 0, ba = 0;
for(let s = 0; s < SEEDS; s++){
  ab += rate(CAND, OPP, 5100000 + s * 7919);
  ba += rate(OPP, CAND, 6100000 + s * 7919);
}
ab /= SEEDS; ba /= SEEDS;
const unbiased = 0.5 * (ab + (1 - ba));
console.log('候选 vs 参照（候选先手）: ' + (ab * 100).toFixed(2) + '%');
console.log('参照 vs 候选（参照先手）: ' + (ba * 100).toFixed(2) + '%');
console.log('双向无偏：候选 = ' + (unbiased * 100).toFixed(2) + '%  ⇒ ' + (unbiased > 0.5 ? '候选更强' : '参照更强 / 持平'));
console.log('总局数 = ' + (SEEDS * GAMES * 2));
