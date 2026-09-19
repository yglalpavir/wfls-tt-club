/* =====================================================================
 *  train-nemesis-worker.js — 「地狱AI克星」训练评估 worker（worker_threads）
 *  · 单任务：在当前 sim 中评估一个策略向量 vs 指定对手 → 得分率（胜球数占比）
 *  · 为 train-nemesis.js 的并行评估提供后端（纯函数，无状态）
 *  · 对手 'hell' = 实机地狱AI的精确口径：LEARNED_POLICY + 护栏
 *    （moveSpeed 2.8 / moveErr 0.03 / moveZ 2.6，与 policy.js strongVec 同源）
 * ===================================================================== */
'use strict';
const path = require('path');
const { parentPort } = require('worker_threads');

const P = require(path.join(__dirname, '..', 'js', 'policy.js'));
const SIMMATCH = require(path.join(__dirname, '..', 'js', 'simmatch.js'));
const PM = require(path.join(__dirname, '..', 'js', 'player-model.js'));

function mulberry32(a){ return function(){ a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }

/* 搓球狂对手（与 train.js/train-hell-worker.js 同名同价，供 smoke/诊断对照） */
const PUSHER = {
  serve: { topProb: 0.2, sideProb: 0.4 },
  push: { prob: 0.55, forceThresh: 28 },
  loop: { prob: 0.4 }, counter: { prob: 0.5 }, smash: { prob: 0.15 },
  pushDepth: 1.2, pushSide: 1.0,
};

/* 地狱AI对手：学习策略 + 难度护栏（与实机 policyForModel('hell') 完全同口径） */
function hellOpponent(hard){
  const H = require(path.join(__dirname, '..', 'js', 'learned-policy.js'));
  const pol = Object.assign({}, H.LEARNED_POLICY, {
    moveSpeed: 2.8, moveErr: 0.03 * (hard || 1), moveZ: 2.6,
  });
  return P.unflattenPolicy(P.flattenPolicy(pol));
}

function runTask(t){
  const pol = P.unflattenPolicy(t.vec);
  let opp;
  if(t.opp === 'hell') opp = hellOpponent(t.hard);
  else if(t.opp === 'self') opp = P.unflattenPolicy(t.curVec || []);
  else if(t.opp === 'default') opp = P.POLICY_DEFAULT;
  else if(t.opp === 'pb') opp = PM.currentBoost ? PM.currentBoost() : PM.PLAYER_MODEL_BOOST;
  else if(t.opp === 'pusher') opp = PUSHER;
  else return NaN;
  const rngF = k => mulberry32(t.base + k);
  if(t.opp === 'hell' || t.opp === 'default'){
    /* 双向对评：simmatch 的参数位置(pA/pB)存在 ~5pp 结构性先手偏差（同策略内战实测
     * 54.8%），正反各打一遍取平均可彻底抵消，使 50% 成为无偏的"克制成立"基线。
     * 采纳门所需的"现役对照"也走 'hell' 通道：trainer 把现役向量作为候选传入即可。 */
    const m1 = SIMMATCH.playMatch(pol, opp, { games: t.games, rngFactory: rngF });
    const m2 = SIMMATCH.playMatch(opp, pol, { games: t.games, rngFactory: k => mulberry32(t.base + 1013 + k) });
    return (m1.pointRate + (1 - m2.pointRate)) / 2;
  }
  const m = SIMMATCH.playMatch(pol, opp, { games: t.games, rngFactory: rngF });
  return m.pointRate;
}

parentPort.on('message', (t) => {
  let pr = NaN;
  try{ pr = runTask(t); }
  catch(e){ pr = NaN; }
  parentPort.postMessage({ id: t.id, pointRate: pr });
});
