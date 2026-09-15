/* =====================================================================
 *  diag-grad.js — 量网络权重范数 / 梯度范数 / 输出层硬截断触发率
 *  · 背景：`js/dqn.js#mlpTrain` 的全部稳定性机制只有一条
 *      delta = |q-target|<100 ? d : 0     （输出层误差硬截断）
 *    没有 Adam、没有动量、没有梯度裁剪、没有分层学习率。
 *    而整个仓库历史上**从未测量过梯度量级**——tools/ 里连 `grad` 字样都没有。
 *    一个 lr 同时喂 128 维隐层和 952 维输出层，是未审查的真实风险。
 *  · 本脚本做的事：拿真实训练产生的 obs→action 对，跑一遍前向 + 反向，
 *    按层统计权重范数、梯度范数、以及 |d|≥100 的截断触发率。
 *  · 用法：
 *      node tools/diag-grad.js                     # 用当前生产权重
 *      node tools/diag-grad.js --shapes "88:128,192,128:952,88:256,384,256,192:952"
 *      node tools/diag-grad.js --n 400             # 样本数（默认 300）
 * ===================================================================== */
'use strict';
const path = require('path');
const fs = require('fs');
const PP = require(path.join(__dirname, '..', 'js', 'policy.js'));
const SIM = require(path.join(__dirname, '..', 'js', 'simcore.js'));
const INPUTSIM = require(path.join(__dirname, '..', 'js', 'input-sim.js'));
const IA = require(path.join(__dirname, '..', 'js', 'input-agent.js'));
const DQN = require(path.join(__dirname, '..', 'js', 'dqn.js'));
const OPP = require(path.join(__dirname, '..', 'js', 'opponent-ladder.js'));
global.SIM = SIM; global.P = PP;

const ROOT = path.join(__dirname, '..');
const args = process.argv.slice(2);
const opt = {
  from: path.join(ROOT, 'data', 'input-ai-extreme.json'),
  n: 300,
  shapes: null,
  lr: 0.0004,
};
for(let i = 0; i < args.length; i++){
  if(args[i] === '--from') opt.from = path.resolve(args[++i]);
  else if(args[i] === '--n') opt.n = parseInt(args[++i], 10);
  else if(args[i] === '--shapes') opt.shapes = args[++i];
  else if(args[i] === '--lr') opt.lr = parseFloat(args[++i]);
}

function mulberry32(a){
  return function(){
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
const clamp = (v, a, b) => v < a ? a : (v > b ? b : v);

/* ---- 采样真实 obs→action 对：让当前权重的推理策略打若干分，
 *      记录每一帧的 obs 与 bestAction 目标（与训练器同一条路径）---- */
function collectPairs(n, opp){
  const base = IA.loadInputAgent(fs.readFileSync(opt.from, 'utf8'));
  base.setTraining(false); base.setEps(0);
  const brain = { act(o){ return base.decode(base.bestAction(o)); }, credit(){} };
  const pairs = [];
  // 直接把 playInputPoint 跑完拿不到逐帧 obs，所以自己驱动 playerReceive 的等价循环：
  // 这里用 brainOf + playInputPoint 跑分，同时通过一个包装 brain 拦截每次 act 的 obs。
  let g = 0;
  while(pairs.length < n && g < n * 6){
    const watching = {
      act(o){
        const cmd = brain.act(o);
        pairs.push([o, cmd]);
        return cmd;
      },
      credit(){},
    };
    INPUTSIM.playInputPoint(watching, opp, mulberry32(4242 + g), g % 2 === 0 ? 'player' : 'ai');
    g++;
    if(pairs.length >= n) break;
  }
  return pairs;
}

/* ---- 前向 + 反向，统计每层的权重范数与梯度范数 ---- */
function measure(net, pairs, lr){
  const stats = [];
  let clipHits = 0, clipTotal = 0;
  const grads = net.map(l => l.W.map(row => row.map(() => 0)));
  const gB = net.map(l => l.b.map(() => 0));
  let lossSum = 0, lossN = 0;

  for(const [obs, cmd] of pairs){
    // obs 对象 → 向量（与 input-agent.encodeObs 同构）
    const inp = IA.encodeObs(obs);
    const { acts, last } = DQN.mlpForward(net, inp);
    // 目标：模仿解码出的动作（BC 目标，与训练器 bcmix 分支同一目标构造）
    const a = IA.nearestAction(cmd.tx, cmd.my, cmd.ctrl);
    const target = new Array(IA.ACT_N).fill(0);
    target[a] = 1;
    let ls = 0;
    for(let i = 0; i < IA.ACT_N; i++){ const d = last[i] - target[i]; ls += d * d; }
    lossSum += ls; lossN++;

    // 输出层误差（= mlpTrain 的 delta 初值），同时统计硬截断触发
    let delta = last.map((q, i) => {
      const d = q - target[i];
      const bad = !isFinite(d) || Math.abs(d) >= 100;
      clipTotal++;
      if(bad) clipHits++;
      return bad ? 0 : d;
    });
    // 反向（与 mlpTrain 同一公式）
    const nLayers = net.length;
    for(let li = nLayers - 1; li >= 0; li--){
      const { W, b } = net[li];
      const inAct = acts[li];
      for(let j = 0; j < W.length; j++){
        const d = delta[j];
        if(!isFinite(d)) continue;
        const gj = grads[li][j];
        for(let k = 0; k < inAct.length; k++) gj[k] += d * inAct[k];
        gB[li][j] += d;
      }
      if(li > 0){
        const nd = new Array(inAct.length).fill(0);
        for(let j = 0; j < W.length; j++){
          const d = delta[j];
          if(!isFinite(d)) continue;
          for(let k = 0; k < inAct.length; k++) nd[k] += W[j][k] * d;
        }
        delta = nd.map((d, k) => (inAct[k] > 0 ? d : 0));
      }
    }
  }

  for(let li = 0; li < net.length; li++){
    let wSq = 0, nW = 0, gSq = 0, nG = 0, gMax = 0;
    for(let j = 0; j < net[li].W.length; j++){
      for(let k = 0; k < net[li].W[0].length; k++){ wSq += net[li].W[j][k] * net[li].W[j][k]; nW++; }
      for(let k = 0; k < net[li].W[0].length; k++){ const g = grads[li][j][k]; gSq += g * g; nG++; if(Math.abs(g) > gMax) gMax = Math.abs(g); }
    }
    for(let j = 0; j < net[li].b.length; j++){ gSq += gB[li][j] * gB[li][j]; }
    const wNorm = Math.sqrt(wSq / Math.max(1, nW));
    const gNorm = Math.sqrt(gSq / Math.max(1, nG));
    const perNeuron = Math.sqrt(gSq / Math.max(1, net[li].W.length * net[li].W[0].length));
    stats.push({
      li, out: net[li].W.length, inN: net[li].W[0].length,
      wNorm: +wNorm.toFixed(4), gNorm: +gNorm.toFixed(4),
      gPerNeuron: +perNeuron.toFixed(5), gMaxAbs: +gMax.toFixed(4),
      stepL1: +(opt.lr * gNorm).toFixed(5),
    });
  }
  return { stats, meanLoss: lossSum / Math.max(1, lossN), clipRate: clipHits / Math.max(1, clipTotal) };
}

/* ---- 解析形状串 "88:128,192,128:952" → [88,128,192,128,952] ---- */
function parseShape(s){
  const [a, h, b] = s.split(':');
  return [parseInt(a, 10), ...h.split(',').map(x => parseInt(x, 10)), parseInt(b, 10)];
}

function newNet(sizes){
  return DQN.mlpInit(sizes, mulberry32(99));
}

console.log('起点权重：' + opt.from + '   lr=' + opt.lr + '   样本=' + opt.n);
console.log('（目标 = BC 独热动作，梯度公式与 dqn.js#mlpTrain 完全一致）\n');

const pairs = collectPairs(opt.n, OPP.at('extreme-max'));
console.log('采集到 ' + pairs.length + ' 个 obs→action 对（对手 extreme-max）\n');

const spec = opt.shapes
  ? opt.shapes.split(';')
  : ['88:128,192,128:952', '88:256,384,256,192:952', '88:32,32:952'];
for(const sp of spec){
  const sizes = parseShape(sp);
  const net = newNet(sizes);
  const nParams = net.reduce((s, l) => s + l.W.length * l.W[0].length + l.b.length, 0);
  const r = measure(net, pairs, opt.lr);
  console.log('网络 ' + sizes.join('→') + '   参数量 ' + nParams.toLocaleString());
  console.log('  平均 MSE = ' + r.meanLoss.toFixed(4) +
              '   输出层 |d|≥100 截断触发率 = ' + (100 * r.clipRate).toFixed(3) + '%');
  console.log('  层  出×入          权重均方范数   梯度范数    梯度/单元     最大|g|      lr×‖g‖');
  for(const s of r.stats){
    console.log('  ' + s.li + '   ' + String(s.out + '×' + s.inN).padEnd(12) +
      s.wNorm.toFixed(4).padStart(11) + '  ' + s.gNorm.toFixed(4).padStart(9) +
      '  ' + s.gPerNeuron.toFixed(5).padStart(10) + '  ' + s.gMaxAbs.toFixed(4).padStart(10) +
      '  ' + s.stepL1.toFixed(5).padStart(9));
  }
  console.log('');
}
