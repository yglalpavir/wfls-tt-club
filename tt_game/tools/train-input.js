/* =====================================================================
 *  train-input.js — DQN 训练"输入级"AI（Node）
 *  · 智能体不直接决策打法，而是像真人一样只输出 鼠标X / 鼠标Y / Ctrl；
 *    出球由 input-sim.js 的"人类玩家管线"（缓动/磁吸/拟合/瞄准/出球核心）产生。
 *  · 对手 = 策略 AI（默认/地狱学习策略/搓球狂），自对弈/DQN 经验回放。
 *  · 产出：data/input-ai.json（权重）+ js/input-weights.js（浏览器可直接加载）
 *  · 用法：
 *      node tools/train-input.js                    # 完整训练
 *      node tools/train-input.js --smoke            # 环境自检（基线随机/追球）
 *      node tools/train-input.js --games 200 --eval 16 --opp hell
 *      node tools/train-input.js --eval-only        # 仅评估已存档权重
 * ===================================================================== */
'use strict';
const path = require('path');
const fs = require('fs');
const PP = require(path.join(__dirname, '..', 'js', 'policy.js'));
const SIM = require(path.join(__dirname, '..', 'js', 'simcore.js'));
const INPUTSIM = require(path.join(__dirname, '..', 'js', 'input-sim.js'));
const IA = require(path.join(__dirname, '..', 'js', 'input-agent.js'));
const DQN = require(path.join(__dirname, '..', 'js', 'dqn.js'));
const T = require(path.join(__dirname, '..', 'js', 'telemetry.js'));   // Web UI 打点（TT_TELEMETRY 门控）
global.SIM = SIM; global.P = PP;

function mulberry32(a){ return function(){ a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }

const args = process.argv.slice(2);
const opt = { games: 4000, eval: 48, opp: 'hell', smoke: false, save: path.join(__dirname, '..', 'data', 'input-ai.json'), noBake: false, noSave: false, evalOnly: false, pret: 400, mix: true, step: 100 };
for(let i = 0; i < args.length; i++){
  if(args[i] === '--smoke') opt.smoke = true;
  else if(args[i] === '--games') opt.games = parseInt(args[++i], 10);
  else if(args[i] === '--eval') opt.eval = parseInt(args[++i], 10);
  else if(args[i] === '--opp') opt.opp = args[++i];
  else if(args[i] === '--save') opt.save = args[++i];
  else if(args[i] === '--no-bake') opt.noBake = true;
  else if(args[i] === '--eval-only') opt.evalOnly = true;
  else if(args[i] === '--pret') opt.pret = parseInt(args[++i], 10);
  else if(args[i] === '--no-mix') opt.mix = false;
  else if(args[i] === '--step') opt.step = parseInt(args[++i], 10);   // 评估间隔（局）；Web UI 常用小值换取实时曲线
  else if(args[i] === '--no-save') opt.noSave = true;                  // 实验模式：不覆盖 data/input-ai.json
}

/* ---- 对手策略 ---- */
function oppFor(name){
  if(name === 'weak')  return { moveSpeed: 1.8, moveErr: 0.28, moveZ: 1.0, push: { prob: 0.78, forceThresh: 30 }, counter: { prob: 0.45 }, smash: { prob: 0.05 }, loop: { prob: 0.3 }, awayProb: 0.5, txMin: 0.12, txRange: 0.3, tzBase: 0.8, tzRange: 0.3 };
  if(name === 'hell'){
    try{ const LP = require(path.join(__dirname, '..', 'js', 'learned-policy.js')).LEARNED_POLICY;
      return Object.assign({}, LP, { moveSpeed: 2.8, moveErr: 0.03, moveZ: 2.6 }); }
    catch(e){ console.warn('learned-policy.js 缺失，回退普通策略'); return PP.POLICY_DEFAULT; }
  }
  if(name === 'grand'){ try{ const G = require(path.join(__dirname, '..', 'js', 'learned-policy-grandslam.js')).GRANDSLAM_POLICY; return G; } catch(e){ /* fall */ } }
  return PP.POLICY_DEFAULT;
}
const OPPONENTS = { default: '普通 AI', hell: '地狱 AI', grand: '大满贯', weak: '弱 AI' };
/* 对手混合池：按局循环不同风格，防止死记一种对手的固定发球/回球模式 */
const OPP_CYCLE = ['default', 'weak', 'default', 'default', 'default', 'weak'];
const opp = oppFor(opt.opp);
function oppOfGame(g){
  if(!opt.mix || opt.opp !== 'default') return opp;
  return oppFor(OPP_CYCLE[g % OPP_CYCLE.length]);
}

/* 包装 DQN agent → input-sim 的 brain/credit 接口 */
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

/* ---- 冒烟：环境自检（追球基线 vs 默认） ---- */
if(opt.smoke){
  const rg = k => mulberry32(4242 + k);
  const naive = brainOf({ act(o, e){ const x = o.x || 0; return { action: 0, cmd: { tx: Math.max(-0.9, Math.min(0.9, x)), my: 0.5, ctrl: false } }; }, credit(){} });
  const m1 = INPUTSIM.playInputMatch(naive, PP.POLICY_DEFAULT, { games: 6, rngFactory: k => mulberry32(1000 + k) });
  console.log('[smoke] 追球基线 vs 默认策略：玩家胜率=' + (m1.pointRate * 100).toFixed(1) + '%  (' + m1.winsA + '-' + m1.winsB + ')');
  const rand = brainOf({ act(){ const a = (Math.random() * IA.ACT_N) | 0; return { action: a, cmd: IA.decodeAction(a) }; }, credit(){} });
  const m2 = INPUTSIM.playInputMatch(rand, PP.POLICY_DEFAULT, { games: 6, rngFactory: k => mulberry32(2000 + k) });
  console.log('[smoke] 随机输入 vs 默认策略：', (m2.pointRate * 100).toFixed(1) + '%  (' + m2.winsA + '-' + m2.winsB + ')');
  T.phase('smoke', '输入级管线自检通过');
  T.tick({ t:'smoke', tag:'追球基线 vs 默认', winRate:+m1.pointRate.toFixed(4) });
  T.tick({ t:'smoke', tag:'随机输入 vs 默认', winRate:+m2.pointRate.toFixed(4) });
  // 一局示例（细节）
  const one = INPUTSIM.playInputGame(naive, PP.POLICY_DEFAULT, mulberry32(77));
  console.log('[smoke] 单局采样：', JSON.stringify(one));
  process.exit(0);
}

/* ---- 训练（大网络：88→128→192→128→238，参数量/深度升级，配合更长训练轮数）----
 * eps 慢衰减（20000 learn 步到底）+ 每 100 局重锚 BC → 防止贪心早期崩溃 */
const AGENT_OPTS = { lr: 0.0004, gamma: 0.99, eps0: 1.0, epsMin: 0.12, batch: 128, replayCap: 1200000, targetEvery: 1200, learnPerPoint: 12, hSizes: [256, 384, 256, 192], epsDenom: 20000, bcMix: 0.35, endReward: 1.5,
  shape(state){ return 0.0006 * Math.max(0, state[20]); } };   // 势塑形：贴近球 z 平面（已缩放，避免累积碾压终局奖励）
const agent = IA.createInputAgent(AGENT_OPTS, mulberry32(20260809));
const SAVE = opt.save;
let win = 0, total = 0, bestScore = -1, bestNet = null;
const curve = [];
const t0 = Date.now();

/* ---- 阶段 -1：仅评估已存档权重（不训练） ---- */
if(opt.evalOnly){
  const b = JSON.parse(fs.readFileSync(SAVE, 'utf8'));
  const net = b.w || b.net;
  if(!net){ console.error('存档缺权重：' + SAVE); process.exit(1); }
  agent.setTraining(false);
  agent.setNet(net);
  agent.setEps(0);
  const ev = (p, n, s) => INPUTSIM.playInputMatch(brainEval(agent), p, { games: n, rngFactory: k => mulberry32(s + k) });
  console.log('[eval-only] 已加载 ' + SAVE + ' · 网络 [' + agent.getNet().map(l => l.W[0].length).join(',') + ']');
  const fD = ev(PP.POLICY_DEFAULT, 48, 555000), fH = ev(oppFor('hell'), 48, 555100), fW = ev(oppFor('weak'), 48, 555200);
  console.log('vs 默认策略：' + (fD.pointRate * 100).toFixed(1) + '%');
  console.log('vs 地狱策略：' + (fH.pointRate * 100).toFixed(1) + '%');
  console.log('vs 弱策略  ：' + (fW.pointRate * 100).toFixed(1) + '%');
  T.tick({ t:'done', mode:'input-dqn', evalOnly:true, opp: opt.opp,
    evalDefault:+fD.pointRate.toFixed(4), evalHell:+fH.pointRate.toFixed(4), evalWeak:+fW.pointRate.toFixed(4) });
  process.exit(0);
}

/* ---- 阶段 0：行为克隆暖启动（模仿 naive 追球，先学会"怎么接住球"） ---- */
const bcPairs = [];
if(opt.pret > 0){
  T.phase('bc', 'BC 暖启动 ' + opt.pret + ' 局');
  console.log('BC 暖启动 ' + opt.pret + ' 局 · 录制 naive 监督样本…');
  const naiveCmd = (o) => ({ tx: Math.max(-0.9, Math.min(0.9, o.x || 0)), my: 0.5, ctrl: false });
  const naive = { act(o){ const c = naiveCmd(o); bcPairs.push([agent.encode(o), IA.nearestAction(c.tx, c.my, c.ctrl)]); return c; }, credit(){} };
  for(let g = 0; g < opt.pret; g++){
    INPUTSIM.playInputPoint(naive, oppOfGame(g + 500), mulberry32(777000 + g), g % 2 === 0 ? 'player' : 'ai');
  }
  console.log('BC 样本 ' + bcPairs.length + ' 条 · 监督拟合(带评估早停) …');
  let bestBcEval = -1, bestBcNet = null;
  for(let p = 0; p < 30; p++){
    for(let i = 0; i < bcPairs.length; i++) agent.imitate(bcPairs[i][0], bcPairs[i][1], 2.0);
    if((p + 1) % 3 === 0){
      agent.setTraining(false);
      const ev = INPUTSIM.playInputMatch(brainEval(agent), PP.POLICY_DEFAULT, { games: 24, rngFactory: k => mulberry32(777111 + p * 13 + k) });
      agent.setTraining(true);
      if(ev.pointRate > bestBcEval){ bestBcEval = ev.pointRate; bestBcNet = JSON.parse(JSON.stringify(agent.getNet())); }
      console.log('  BC pass=' + (p + 1) + ' eval=' + (ev.pointRate * 100).toFixed(1) + '% best=' + (bestBcEval * 100).toFixed(1) + '%');
      T.tick({ t:'bc', pass:p + 1, ep:p + 1, evalW:+(ev.pointRate * 100).toFixed(1), bestW:+(bestBcEval * 100).toFixed(1) });
      if(bestBcEval >= 0.75) break;   // 追球目标达标即停
    }
  }
  if(bestBcNet) agent.setNet(bestBcNet);
  agent.setTraining(false);
  const bcEv = INPUTSIM.playInputMatch(brainEval(agent), PP.POLICY_DEFAULT, { games: 24, rngFactory: k => mulberry32(999000 + k) });
  agent.setTraining(true);
  agent.setBC(bcPairs, 1.5);   // 在线 BC：每个学习 batch 混入监督对，保住追球技能
  console.log('BC 完成 ✓ · BC后评估=' + (bcEv.pointRate * 100).toFixed(1) + '% · 在线 BC 已挂载');
}
const bcAnchorStep = 100;
console.log('输入级 AI 训练开始 · opp=' + opt.opp + ' · games=' + opt.games + ' · eval=' + opt.eval + ' · mix=' + opt.mix);
T.phase('rl', 'RL 训练开始 opp=' + opt.opp + ' games=' + opt.games + ' step=' + opt.step);
const lr0 = 0.00055, lr1 = 0.00015;
for(let g = 0; g < opt.games; g++){
  const lrCur = lr0 + (lr1 - lr0) * Math.min(1, g / opt.games);
  agent.setLr(lrCur);
  const server = (g % 2 === 0) ? 'player' : 'ai';
  const res = INPUTSIM.playInputPoint(brainOf(agent), oppOfGame(g), mulberry32(20260809 + g), server);
  agent.endPoint('player', res.winner);
  total++; if(res.winner === 'player') win++;
  if(bcPairs.length && (g + 1) % bcAnchorStep === 0){
    for(let p = 0; p < 4; p++) for(let i = 0; i < bcPairs.length; i++) agent.imitate(bcPairs[i][0], bcPairs[i][1], 1.5);
    console.log('  [重锚 BC x4 @game' + (g + 1) + ']');
  }
  if((g + 1) % opt.step === 0){
    agent.setTraining(false);
    const ev = INPUTSIM.playInputMatch(brainEval(agent), opp, { games: opt.eval, rngFactory: k => mulberry32(999000 + g * 31 + k) });
    agent.setTraining(true);
    const sc = ev.pointRate;
    if(sc > bestScore){ bestScore = sc; bestNet = JSON.parse(JSON.stringify(agent.getNet())); }
    curve.push({ ep: g + 1, trainW: (win / total * 100).toFixed(1), evalW: (sc * 100).toFixed(1),
                 bestW: (bestScore * 100).toFixed(1), eps: +agent.getEps().toFixed(2) });
    T.tick(Object.assign({ t:'ep', lr:+lrCur.toFixed(6), sec:+((Date.now() - t0)/1000).toFixed(1) }, curve[curve.length - 1]));
    console.log(`ep ${String(g + 1).padStart(4)}  train=${(win / total * 100).toFixed(0)}%  eval=${(sc * 100).toFixed(1)}%  best=${(bestScore * 100).toFixed(1)}%  eps=${agent.getEps().toFixed(2)}`);
  }
}

/* ---- 最佳权重最终评估（多个对手）+ 存档 ---- */
if(bestNet) agent.setNet(bestNet);
agent.setTraining(false);
const finalP = { default: PP.POLICY_DEFAULT }, finH = oppFor('hell'), finG = oppFor('grand');
const evDef = INPUTSIM.playInputMatch(brainEval(agent), PP.POLICY_DEFAULT, { games: opt.eval * 2, rngFactory: k => mulberry32(555000 + k) });
const evHell = INPUTSIM.playInputMatch(brainEval(agent), finH, { games: opt.eval, rngFactory: k => mulberry32(555100 + k) });
const evWeak = INPUTSIM.playInputMatch(brainEval(agent), oppFor('weak'), { games: opt.eval, rngFactory: k => mulberry32(555200 + k) });
console.log('\n=== 训练完成（DQN 输入级 vs 策略 AI）===');
console.log('vs 默认策略：' + (evDef.pointRate * 100).toFixed(1) + '%  (' + evDef.winsA + '-' + evDef.winsB + ')');
console.log('vs 地狱策略：' + (evHell.pointRate * 100).toFixed(1) + '%  (' + evHell.winsA + '-' + evHell.winsB + ')');
console.log('vs 弱策略  ：' + (evWeak.pointRate * 100).toFixed(1) + '%  (' + evWeak.winsA + '-' + evWeak.winsB + ')');
agent.setTraining(true);

fs.mkdirSync(path.dirname(SAVE), { recursive: true });
if(opt.noSave){
  console.log('⚠ --no-save：跳过写入 ' + SAVE + '（实验模式）');
} else {
  fs.writeFileSync(SAVE, agent.serialize(), 'utf8');
  console.log('✅ 权重已保存：' + SAVE);
}
fs.writeFileSync(path.join(__dirname, 'input-curve.json'), JSON.stringify(curve, null, 2), 'utf8');
T.tick({ t:'done', mode:'input-dqn', opp: opt.opp, evalDefault:+evDef.pointRate.toFixed(4),
  evalHell:+evHell.pointRate.toFixed(4), evalWeak:+evWeak.pointRate.toFixed(4),
  games:opt.games, eval:opt.eval, bestW:+(bestScore*100).toFixed(1), eps:+agent.getEps().toFixed(2),
  baked:!opt.noBake, saved:!opt.noSave, sec:+((Date.now() - t0)/1000).toFixed(1) });

/* ---- 烘焙浏览器加载文件（js/input-weights.js） ---- */
if(!opt.noBake){
  const baked = {
    version: 1,
    trainedAt: new Date().toISOString().slice(0, 10),
    opp: opt.opp,
    nActions: IA.ACT_N,
    evalDefault: +evDef.pointRate.toFixed(4),
    evalHell: +evHell.pointRate.toFixed(4),
    net: bestNet || agent.getNet(),
  };
  const meta = { version: 1, trainedAt: baked.trainedAt, opp: opt.opp,
                 evalDefault: baked.evalDefault, evalHell: baked.evalHell };
  const out = `/* 自动生成：node tools/train-input.js · 输入级 DQN 权重（原始鼠标/键盘动作） */\nconst INPUT_AI_WEIGHTS = ${JSON.stringify(baked)};\nconst INPUT_AI_META = ${JSON.stringify(meta)};\nif(typeof module !== 'undefined' && module.exports) module.exports = { INPUT_AI_WEIGHTS, INPUT_AI_META };\n`;
  fs.writeFileSync(path.join(__dirname, '..', 'js', 'input-weights.js'), out, 'utf8');
  console.log('✅ 已烘焙 js/input-weights.js');
}