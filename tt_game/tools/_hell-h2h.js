/* =====================================================================
 * _hell-h2h.js — 独立复评：候选地狱策略 vs 线上地狱策略
 *   · 双向对打（A 先手 / B 先手）取无偏胜率，消除先后手偏置
 *   · 口径与 train-hell.js 一致（js/simmatch.js）
 * 用法：node tools/_hell-h2h.js [每种子局数] [种子数]
 * ===================================================================== */
'use strict';
const path = require('path');
const fs = require('fs');
const P = require(path.join(__dirname, '..', 'js', 'policy.js'));
const SIM = require(path.join(__dirname, '..', 'js', 'simmatch.js'));

function mulberry32(a){ return function(){ a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }

const LP = require(path.join(__dirname, '..', 'js', 'learned-policy.js'));

/* 对手口径（★ 2026-10-17 修正）：
 * 游戏里地狱 AI 走 policy.js#strongVec()，它把 moveSpeed/moveErr/moveZ 硬写成
 * 2.8/0.03/2.6（护栏）。而 js/learned-policy.js 里的 LEARNED_POLICY 原始值并不是这三维
 * （线上原始 moveSpeed≈3.35 / moveErr≈0 / moveZ≈0.98），实机永不使用。
 * 所以「候选 vs 线上」必须用实机口径 —— 默认 strongVec()；加 --opp-raw 才用原始向量。 */
const USE_RAW = process.argv.includes('--opp-raw');
const SHIPPED = P.unflattenPolicy(USE_RAW ? P.flattenPolicy(LP.LEARNED_POLICY) : P.strongVec());
console.log('对手口径: ' + (USE_RAW ? '原始 LEARNED_POLICY（实机不用）' : 'strongVec() 实机口径（护栏 2.8/0.03/2.6）'));

/* 候选来源：默认 tools/train-hell-candidate.json；可用 --from <file> 指向别的检查点
 * （例如长跑途中的 tools/train-hell-best.json，用于中途预判是否只是自对弈循环的假提升）。 */
const fromArg = process.argv.indexOf('--from');
const CAND_FILE = (fromArg >= 0 && process.argv[fromArg + 1]) ? process.argv[fromArg + 1] : path.join(__dirname, 'train-hell-candidate.json');
const CANDVEC = JSON.parse(fs.readFileSync(CAND_FILE, 'utf8')).vec;
const CAND = P.unflattenPolicy(CANDVEC);
console.log('候选来源: ' + CAND_FILE);

const _pos = process.argv.slice(2).filter((v, i, arr) => {
  if(v === '--from' || v === '--opp-raw') return false;
  if(i > 0 && arr[i - 1] === '--from') return false;
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
  ab += rate(CAND, SHIPPED, 5100000 + s * 7919);
  ba += rate(SHIPPED, CAND, 6100000 + s * 7919);
}
ab /= SEEDS; ba /= SEEDS;
const unbiased = 0.5 * (ab + (1 - ba));
console.log('候选 vs 线上（候选先手）: ' + (ab * 100).toFixed(2) + '%');
console.log('线上 vs 候选（线上先手）: ' + (ba * 100).toFixed(2) + '%');
console.log('双向无偏：候选 = ' + (unbiased * 100).toFixed(2) + '%  ⇒ ' + (unbiased > 0.5 ? '候选更强' : '线上更强 / 持平'));
console.log('总局数 = ' + (SEEDS * GAMES * 2));
