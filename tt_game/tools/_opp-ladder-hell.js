/* =====================================================================
 * _opp-ladder-hell.js — 「当前地狱 AI 在各对手面前有多强」强度阶梯
 *
 * 动机：train-hell.js 的适应度里 3/4 的权重压在 default / pb / pusher 上，
 * 而实测这三个对手地狱已经赢到 84~94%（区间窄、梯度弱）；仓库里真正的两个
 * 克制策略（grandslam 预备种子、nemesis 地狱克星）根本没进适应度。
 * 这个脚本量化一下「对手到底有多弱」。
 *
 * 用法：node tools/_opp-ladder-hell.js [每种子局数] [种子数]
 * 双向对打取无偏分点率，消除先后手偏置（口径同 _hell-h2h.js）。
 * ===================================================================== */
'use strict';
const path = require('path');
const P = require(path.join(__dirname, '..', 'js', 'policy.js'));
const PM = require(path.join(__dirname, '..', 'js', 'player-model.js'));
const SIM = require(path.join(__dirname, '..', 'js', 'simmatch.js'));

function mulberry32(a){ return function(){ a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }

/* 与 train-hell-worker.js 同名同价的搓球狂对手 */
const PUSHER = {
  serve: { topProb: 0.2, sideProb: 0.4 },
  push: { prob: 0.55, forceThresh: 28 },
  loop: { prob: 0.4 }, counter: { prob: 0.5 }, smash: { prob: 0.15 },
  pushDepth: 1.2, pushSide: 1.0,
};

const argOf = (n) => { const i = process.argv.indexOf(n); return (i >= 0 && process.argv[i+1]) ? process.argv[i+1] : ''; };
const FROM = argOf('--from');
const pos = process.argv.slice(2).filter((a, i, arr) => !a.startsWith('--') && !(i > 0 && arr[i-1].startsWith('--')));
const GAMES = parseInt(pos[0] || '150', 10);
const SEEDS = parseInt(pos[1] || '6', 10);

/* 被测策略：默认当前线上地狱（strongVec 实机口径）；--from 换任意 {vec:[42]} 检查点 */
const HELL = FROM ? P.unflattenPolicy(JSON.parse(require('fs').readFileSync(FROM, 'utf8')).vec)
                  : P.unflattenPolicy(P.strongVec());
console.log('被测策略: ' + (FROM || '当前线上 strongVec()（护栏 2.8/0.03/2.6）'));

const OPPOS = [
  ['default  默认 AI',        P.POLICY_DEFAULT],
  ['pusher   搓球狂',        PUSHER],
  ['pb       加强玩家模型',   PM.currentBoost ? PM.currentBoost() : PM.PLAYER_MODEL_BOOST],
  ['grandslam 大满贯预备种子', P.policyForModel('grandslam')],
  ['nemesis  地狱AI克星',     P.policyForModel('nemesis')],
];

function rate(pA, pB, base){
  const rngF = k => mulberry32(base + k);
  return SIM.playMatch(pA, pB, { games: GAMES, rngFactory: rngF }).pointRate;
}

console.log('当前地狱 = LEARNED_POLICY 经 strongVec()（护栏 2.8/0.03/2.6）');
console.log('口径：双向各 ' + SEEDS + ' 种子 × ' + GAMES + ' 局，合计 ' + (SEEDS * GAMES * 2) + ' 局/对手\n');
console.log('对手'.padEnd(26) + '地狱先手   对手先手   无偏(地狱)   SE');
console.log('-'.repeat(66));

const rows = [];
for(const [name, opp] of OPPOS){
  if(!opp){ console.log(name.padEnd(26) + '  （策略文件缺失，跳过）'); continue; }
  let ab = 0, ba = 0;
  for(let s = 0; s < SEEDS; s++){
    ab += rate(HELL, opp, 3100000 + s * 7919);
    ba += rate(opp, HELL, 4100000 + s * 7919);
  }
  ab /= SEEDS; ba /= SEEDS;
  const u = 0.5 * (ab + (1 - ba));
  const n = SEEDS * GAMES * 2;
  const se = Math.sqrt(u * (1 - u) / n);
  rows.push({ name, u, se });
  console.log(name.padEnd(24) + (ab * 100).toFixed(2).padStart(7) + '%'
    + ((1 - ba) * 100).toFixed(2).padStart(10) + '%'
    + (u * 100).toFixed(2).padStart(11) + '%'
    + ('±' + (se * 100).toFixed(2)).padStart(8) + 'pp');
}

console.log('\n读法：数字 = 当前地狱的无偏分点率。');
console.log('接近 100% ⇒ 这个对手对地狱毫无压力，进适应度也提供不了梯度。');
console.log('\n--- 训练适应度实际用到的四项（train-hell.js）---');
for(const k of ['vs现役(0.52)', 'vs加强玩家(0.20)', 'vs默认(0.16)', 'vs搓球(0.12)'])
  console.log('  ' + k);
console.log('\n--- 仓库里存在但【没有】进适应度的克制策略 ---');
for(const k of ['grandslam', 'nemesis'])
  console.log('  ' + k);