/* =====================================================================
 *  train-input2.js — 输入级 DQN 稳定化训练变体（对照 v1：train-input.js）
 *  · 加固点：
 *      - 终局奖励 ±3 → ±1.5（更稳的 TD 尺度，抑制 Q 值爆炸/贪心漂移）
 *      - 在线 BC 提升 boost 1.5→1.8，每 100 局重锚
 *      - lr 0.0004（更稳），targetEvery 800，eps slow decay 20000
 *      - 每 50 局双评估（地狱 + 默认），密集捕获最佳权重
 *  · 用法：node tools/train-input2.js [--games N] [--eval M]
 * ===================================================================== */
'use strict';
const path = require('path');
const fs = require('fs');
const PP = require(path.join(__dirname, '..', 'js', 'policy.js'));
const SIM = require(path.join(__dirname, '..', 'js', 'simcore.js'));
const INPUTSIM = require(path.join(__dirname, '..', 'js', 'input-sim.js'));
const IA = require(path.join(__dirname, '..', 'js', 'input-agent.js'));
global.SIM = SIM; global.P = PP;
const T = require(path.join(__dirname, '..', 'js', 'telemetry.js'));   // Web UI 打点（TT_TELEMETRY 门控）

function mulberry32(a){ return function(){ a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }

const args = process.argv.slice(2);
const opt = { games: 3000, eval: 40, pret: 400, step: 50, noSave: false,
              save: path.join(__dirname, '..', 'data', 'input-ai-v2.json'),
              curve: path.join(__dirname, 'input-curve-v2.json') };
for(let i = 0; i < args.length; i++){
  if(args[i] === '--games') opt.games = parseInt(args[++i], 10);
  else if(args[i] === '--eval') opt.eval = parseInt(args[++i], 10);
  else if(args[i] === '--save') opt.save = args[++i];
  else if(args[i] === '--step') opt.step = parseInt(args[++i], 10);
  else if(args[i] === '--pret') opt.pret = parseInt(args[++i], 10);   // BC 暖启动局数（Web UI 可调小换取实时曲线）
  else if(args[i] === '--no-save') opt.noSave = true;                   // 实验模式：不覆盖 data/input-ai-v2.json
  else if(args[i] === '--curve') opt.curve = args[++i];
}

function hellOpp(){
  try{ const LP = require(path.join(__dirname, '..', 'js', 'learned-policy.js')).LEARNED_POLICY;
    return Object.assign({}, LP, { moveSpeed: 2.8, moveErr: 0.03, moveZ: 2.6 }); }
  catch(e){ return PP.POLICY_DEFAULT; }
}
const HELL = hellOpp();

function brainOf(agent){
  return {
    act(obs){ const r = agent.act(obs, true); return r.cmd; },
    credit(d){ agent.credit(d); },
  };
}
function brainEval(agent){
  return {
    act(obs){ return agent.decode(agent.bestAction(obs)); },
    credit(){},
  };
}

const agent = IA.createInputAgent({
  lr: 0.00022, gamma: 0.99, eps0: 1.0, epsMin: 0.15,
  batch: 128, replayCap: 1200000, targetEvery: 1500, learnPerPoint: 6,
  hSizes: [128, 192, 128], epsDenom: 20000, endReward: 1.5, bcMix: 0.35,
}, mulberry32(20260901));

let win = 0, total = 0, bestScore = -1, bestNet = null;
const curve = [];
const t0 = Date.now();
console.log('输入级 AI 稳定化训练（v2 · endReward=1.5）· games=' + opt.games + ' · eval=' + opt.eval);

/* BC 暖启动（naive 追球监督）——单点监督、长轮数，探 952 动作空间下 BC 上限 */
const bcPairs = [];
const naiveCmd = (o) => ({ tx: Math.max(-0.9, Math.min(0.9, o.x || 0)), my: 0.5, ctrl: false });
const naive = { act(o){ const c = naiveCmd(o); bcPairs.push([agent.encode(o), IA.nearestAction(c.tx, c.my, c.ctrl)]); return c; }, credit(){} };
for(let g = 0; g < opt.pret; g++){
  INPUTSIM.playInputPoint(naive, PP.POLICY_DEFAULT, mulberry32(777000 + g), g % 2 === 0 ? 'player' : 'ai');
}
console.log('BC 样本 ' + bcPairs.length + ' 条 · 单点监督拟合（长轮数抬上限）…');
let lastBc = -1, bestBcNet = null;
for(let p = 0; p < 80; p++){
  for(let i = 0; i < bcPairs.length; i++) agent.imitate(bcPairs[i][0], bcPairs[i][1], 2.0);
  if((p + 1) % 2 === 0){
    agent.setTraining(false);
    const ev = INPUTSIM.playInputMatch(brainEval(agent), PP.POLICY_DEFAULT, { games: 24, rngFactory: k => mulberry32(777111 + p * 13 + k) });
    agent.setTraining(true);
    lastBc = ev.pointRate;
    if(ev.pointRate > 0.70 && !bestBcNet) bestBcNet = JSON.parse(JSON.stringify(agent.getNet()));
    console.log('  BC pass=' + (p + 1) + ' eval=' + (ev.pointRate * 100).toFixed(1) + '%');
    T.tick({ t:'bc', pass:p + 1, ep:p + 1, evalW:+(ev.pointRate * 100).toFixed(1) });
    if(ev.pointRate >= 0.78) break;
  }
}
// 若 BC 上限不足，取中途最佳 BC 权重兜底（别让 RL 从太弱的起点起步）
if(bestBcNet && lastBc < 0.50) agent.setNet(bestBcNet);
console.log('BC 阶段完成 · 上限=' + (lastBc * 100).toFixed(1) + '% · 进入 RL');
agent.setBC(bcPairs, 1.8);

console.log('RL 训练开始 · opp=hell · games=' + opt.games + ' · eval=' + opt.eval);
for(let g = 0; g < opt.games; g++){
  agent.setLr(0.00022 + (0.0001 - 0.00022) * Math.min(1, g / opt.games));
  const server = (g % 2 === 0) ? 'player' : 'ai';
  const res = INPUTSIM.playInputPoint(brainOf(agent), HELL, mulberry32(20260901 + g), server);
  agent.endPoint('player', res.winner);
  total++; if(res.winner === 'player') win++;
  if((g + 1) % 100 === 0){
    for(let p = 0; p < 4; p++) for(let i = 0; i < bcPairs.length; i++) agent.imitate(bcPairs[i][0], bcPairs[i][1], 1.8);
  }
  if((g + 1) % opt.step === 0){
    agent.setTraining(false);
    const evH = INPUTSIM.playInputMatch(brainEval(agent), HELL, { games: opt.eval, rngFactory: k => mulberry32(888000 + g * 17 + k) });
    const evD = INPUTSIM.playInputMatch(brainEval(agent), PP.POLICY_DEFAULT, { games: opt.eval, rngFactory: k => mulberry32(888100 + g * 17 + k) });
    agent.setTraining(true);
    const sc = evH.pointRate;
    if(sc > bestScore){ bestScore = sc; bestNet = JSON.parse(JSON.stringify(agent.getNet())); }
    /* 周期检查点 + ε 循环：回放长期被贪心数据统治会引发晚期退化（见 v3），每 500 局
     * 存档 bestNet（防静默崩溃丢失成果）并把 ε 重置到 0.55 重新探索。 */
    if((g + 1) % 500 === 0){
      const cur = agent.getNet();
      agent.setNet(bestNet);
      fs.mkdirSync(path.dirname(opt.save), { recursive: true });
      if(!opt.noSave) fs.writeFileSync(opt.save, agent.serialize(), 'utf8');
      fs.writeFileSync(opt.curve, JSON.stringify(curve, null, 2), 'utf8');
      agent.setNet(cur);      agent.setEps(0.55);
    }
    curve.push({ ep: g + 1, trainW: (win / total * 100).toFixed(1), evalHell: (sc * 100).toFixed(1),
                 evalDef: (evD.pointRate * 100).toFixed(1), bestH: (bestScore * 100).toFixed(1), eps: +agent.getEps().toFixed(2) });
    console.log(`ep ${String(g + 1).padStart(4)}  train=${(win / total * 100).toFixed(0)}%  evalHell=${(sc * 100).toFixed(1)}%  evalDef=${(evD.pointRate * 100).toFixed(1)}%  bestH=${(bestScore * 100).toFixed(1)}%  eps=${agent.getEps().toFixed(2)}  [${((Date.now() - t0) / 1000).toFixed(0)}s]`);
    T.tick(Object.assign({ t:'ep', sec:+((Date.now() - t0) / 1000).toFixed(1) }, curve[curve.length - 1]));
  }
}

if(bestNet) agent.setNet(bestNet);
agent.setTraining(false);
const fH = INPUTSIM.playInputMatch(brainEval(agent), HELL, { games: 80, rngFactory: k => mulberry32(444000 + k) });
const fD = INPUTSIM.playInputMatch(brainEval(agent), PP.POLICY_DEFAULT, { games: 80, rngFactory: k => mulberry32(444100 + k) });
console.log('\n=== v2 最佳权重最终评估 ===');
console.log('vs 地狱策略：' + (fH.pointRate * 100).toFixed(1) + '%  (' + fH.winsA + '-' + fH.winsB + ')');
console.log('vs 默认策略：' + (fD.pointRate * 100).toFixed(1) + '%  (' + fD.winsA + '-' + fD.winsB + ')');
agent.setTraining(true);
fs.mkdirSync(path.dirname(opt.save), { recursive: true });
if(opt.noSave){
  console.log('⚠ --no-save：跳过写入 ' + opt.save + '（实验模式，data/input-ai-v2.json 保持不变）');
} else {
  fs.writeFileSync(opt.save, agent.serialize(), 'utf8');
  console.log('✅ v2 权重已保存：' + opt.save);
}
fs.writeFileSync(opt.curve, JSON.stringify(curve, null, 2), 'utf8');
T.tick({ t:'done', mode:'input-dqn-v2', games:opt.games, eval:opt.eval,
  evalDefault:+fD.pointRate.toFixed(4), evalHell:+fH.pointRate.toFixed(4),
  bestH: bestScore > 0 ? +(bestScore*100).toFixed(1) : undefined,
  eps:+agent.getEps().toFixed(2), saved:!opt.noSave, sec:+((Date.now() - t0)/1000).toFixed(1) });