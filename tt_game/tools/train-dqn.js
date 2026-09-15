/* =====================================================================
 *  train-dqn.js — DQN 深度强化学习训练（Node）
 *  · DQN 控制 AI 一侧回球（选"打法模式"），对手=默认策略，用 simmatch 自对弈
 *  · ε-greedy 探索 + 经验回放 + 目标网络 + TD 学习（奖励=得分+回球塑造）
 *  · 输出权重 data/dqn-ai.json，浏览器地狱档可加载（混合策略）
 *
 *  用法：node tools/train-dqn.js [--games N] [--eval M] [--save path]
 * ===================================================================== */
'use strict';
const path = require('path');
const fs = require('fs');
const DQN = require(path.join(__dirname, '..', 'js', 'dqn.js'));
const SIMMATCH = require(path.join(__dirname, '..', 'js', 'simmatch.js'));
const P = require(path.join(__dirname, '..', 'js', 'policy.js'));
const LP = require(path.join(__dirname, '..', 'js', 'learned-policy.js')).LEARNED_POLICY;   // 与实机地狱档同语境
const learned = LP;

/* ---- 可复现 RNG ---- */
function mulberry32(a){ return function(){ a|=0; a=a+0x6D2B79F5|0; let t=Math.imul(a^a>>>15,1|a); t=t+Math.imul(t^t>>>7,61|t)^t; return ((t^t>>>14)>>>0)/4294967296; }; }

const args = process.argv.slice(2);
let GAMES = 800, EVAL = 30, SAVE = path.join(__dirname, '..', 'data', 'dqn-ai.json');
for(let i=0;i<args.length;i++){
  if(args[i]==='--games') GAMES = parseInt(args[++i],10);
  else if(args[i]==='--eval') EVAL = parseInt(args[++i],10);
  else if(args[i]==='--save') SAVE = args[++i];
}

/* ---- DQN agent（8 维状态 / 6 模式动作）---- */
const agent = DQN.createDQN({ stateSize: 8, nActions: 6, lr: 0.003, gamma: 0.9,
  eps0: 0.9, epsMin: 0.05, batch: 32, replayCap: 50000, targetEvery: 500, learnPerEp: 4 });
// 若已有权重可续训（可选）
// const load = path.join(__dirname,'..','data','dqn-ai.json');
// if(fs.existsSync(load)){ agent.setNet(DQN.dqnLoad(fs.readFileSync(load,'utf8')).getNet()); }

console.log('开始 DQN 训练（learned 语境）· games=' + GAMES + ' eval=' + EVAL + ' 状态8维 动作6(模式)');
let wins = 0, bestWin = 0, bestNet = null;
const t0 = Date.now();
for(let i = 0; i < GAMES; i++){
  const rng = mulberry32(20260802 + i);
  const server = (i % 2) ? 'ai' : 'player';
  // DQN 控制 AI 侧（pB，物理=learned）；对手=learned（玩家侧 pA）
  const res = SIMMATCH.playPoint(learned, { __dqn: agent, __physics: learned }, rng, server);
  agent.endEpisode('ai', res.winner);
  if(res.winner === 'ai') wins++;
  if((i + 1) % 100 === 0){
    // 评估（不探索）；跟踪最佳权重防过拟合退化（>50% 即超越 learned 镜像基准）
    agent.setTraining(false);
    const ev = SIMMATCH.playMatch(learned, { __dqn: agent, __physics: learned }, { games: EVAL, rngFactory: k => mulberry32(999000 + k) });
    agent.setTraining(true);
    const dqnWin = ev.winsB / (ev.winsA + ev.winsB || 1);
    if(dqnWin > bestWin){ bestWin = dqnWin; bestNet = JSON.parse(JSON.stringify(agent.getNet())); }
    console.log(`ep ${(i+1).toString().padStart(4)}  trainWin=${((wins/(i+1))*100).toFixed(0)}%  evalDQN=${(dqnWin*100).toFixed(1)}%  best=${(bestWin*100).toFixed(1)}%  eps=${agent.getEps().toFixed(2)}`);
  }
}

/* ---- 用最佳权重最终评估 + 存档 ---- */
if(bestNet) agent.setNet(bestNet);
agent.setTraining(false);
const fin = SIMMATCH.playMatch(learned, { __dqn: agent, __physics: learned }, { games: EVAL * 4, rngFactory: k => mulberry32(555000 + k) });
agent.setTraining(true);
console.log('\n=== 最佳评估（DQN+learned=AI侧 vs 纯learned）===');
console.log('learned胜场 ' + fin.winsA + ' - DQN胜场 ' + fin.winsB + '  DQN+learned得分率=' + (fin.winsB / (fin.winsA + fin.winsB) * 100).toFixed(1) + '%  (learned镜像基准≈50%)');
fs.mkdirSync(path.dirname(SAVE), { recursive: true });
fs.writeFileSync(SAVE, agent.serialize(), 'utf8');
console.log('✅ 已保存最佳 DQN 权重：' + SAVE);
