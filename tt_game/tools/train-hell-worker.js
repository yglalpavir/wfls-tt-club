'use strict';
/* =====================================================================
 * train-hell-worker.js — 评估后端（worker_threads 池的一个 worker）
 * 任务 { id, vec, opp, base, games, curVec, oppVec }
 *   vec    : 扁平 42 维候选向量
 *   opp    : 'self' | 'nemesis' | 'default' | 'pb' | 'pusher' | 'old'
 *   oppVec : 若给出，直接作为对手向量（方案B 的"归档旧地狱"走这条路，避免 worker 读文件）
 *   base   : RNG 种子基数（跨代固定，保证同代个体看到同一批对局）
 * 返回 { id, pointRate }（NaN = 失败）
 * ===================================================================== */
const path = require('path');
const { parentPort } = require('worker_threads');
const P = require(path.join(__dirname, '..', 'js', 'policy.js'));
const SIMMATCH = require(path.join(__dirname, '..', 'js', 'simmatch.js'));
const PM = require(path.join(__dirname, '..', 'js', 'player-model.js'));

function mulberry32(a){ return function(){ a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }

const PUSHER = {
  serve: { topProb: 0.2, sideProb: 0.4 },
  push: { prob: 0.55, forceThresh: 28 },
  loop: { prob: 0.4 }, counter: { prob: 0.5 }, smash: { prob: 0.15 },
  pushDepth: 1.2, pushSide: 1.0,
};

function runTask(t){
  const pol = P.unflattenPolicy(t.vec);
  let opp = null;
  if(Array.isArray(t.oppVec)) opp = P.unflattenPolicy(t.oppVec);
  else if(t.opp === 'self') opp = P.unflattenPolicy(t.curVec || []);
  else if(t.opp === 'nemesis') opp = P.policyForModel('nemesis');   // 方案B：唯一有真实压力的强对手
  else if(t.opp === 'default') opp = P.POLICY_DEFAULT;
  else if(t.opp === 'pb') opp = PM.currentBoost ? PM.currentBoost() : PM.PLAYER_MODEL_BOOST;
  else if(t.opp === 'pusher') opp = PUSHER;
  if(!opp) return NaN;
  const rngF = k => mulberry32(t.base + k);
  const m = SIMMATCH.playMatch(pol, opp, { games: t.games, rngFactory: rngF });
  return m.pointRate;
}

parentPort.on('message', (t) => {
  let pr = NaN;
  try{ pr = runTask(t); } catch(e){ pr = NaN; }
  parentPort.postMessage({ id: t.id, pointRate: pr });
});