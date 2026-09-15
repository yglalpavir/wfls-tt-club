/* =====================================================================
 *  train-hell-worker.js — 地狱 AI 续训评估 worker（worker_threads）
 *  · 单任务：在当前 sim 中评估一个策略向量 vs 指定对手 → 得分率
 *  · 为 train-hell.js 的并行评估提供后端（纯函数，无状态）
 * ===================================================================== */
'use strict';
const path = require('path');
const { parentPort } = require('worker_threads');

const P = require(path.join(__dirname, '..', 'js', 'policy.js'));
const SIMMATCH = require(path.join(__dirname, '..', 'js', 'simmatch.js'));
const PM = require(path.join(__dirname, '..', 'js', 'player-model.js'));

function mulberry32(a){ return function(){ a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }

/* 搓球狂对手（与 train.js 同名同价，防止恶意搓球） */
const PUSHER = {
  serve: { topProb: 0.2, sideProb: 0.4 },
  push: { prob: 0.55, forceThresh: 28 },
  loop: { prob: 0.4 }, counter: { prob: 0.5 }, smash: { prob: 0.15 },
  pushDepth: 1.2, pushSide: 1.0,
};

function runTask(t){
  const pol = P.unflattenPolicy(t.vec);
  let opp;
  if(t.opp === 'self') opp = P.unflattenPolicy(t.curVec || []);
  else if(t.opp === 'default') opp = P.POLICY_DEFAULT;
  else if(t.opp === 'pb') opp = PM.currentBoost ? PM.currentBoost() : PM.PLAYER_MODEL_BOOST;
  else if(t.opp === 'pusher') opp = PUSHER;
  else return NaN;
  const rngF = k => mulberry32(t.base + k);
  const m = SIMMATCH.playMatch(pol, opp, { games: t.games, rngFactory: rngF });
  return m.pointRate;
}

parentPort.on('message', (t) => {
  let pr = NaN;
  try{ pr = runTask(t); }
  catch(e){ pr = NaN; }
  parentPort.postMessage({ id: t.id, pointRate: pr });
});