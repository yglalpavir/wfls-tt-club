/* =====================================================================
 *  _diag_argmax.js — 「动作是不是跟着球走」的一次性诊断
 * =====================================================================
 *  问三个问题，全部在**烘焙进 js/input-weights.js 的那份权重**上回答：
 *   Q1  bestAction 的 tx 随球的横向位置 x 变化吗？（不回�� → 网络对横向不敏感）
 *   Q2  来球（玩家侧 vz > 0）时 encodeObs 的 tau / 预测落点三维是不是退化成原值？
 *   Q3  argmax 动作与「追当前球心」的动作一致吗？两者差多少分？
 *
 *  用法： node tools/_diag_argmax.js [--from data/checkpoints/xxx.json]
 * ===================================================================== */
'use strict';
const path = require('path');
const fs = require('fs');

const ROOT = path.join(__dirname, '..');
const IA = require(path.join(ROOT, 'js', 'input-agent.js'));

function loadAgent(){
  const arg = process.argv.indexOf('--from');
  if(arg > 0 && process.argv[arg + 1]){
    const txt = fs.readFileSync(process.argv[arg + 1], 'utf8');
    return IA.loadInputAgent(JSON.parse(txt));
  }
  const baked = require(path.join(ROOT, 'js', 'input-weights.js'));
  const meta = baked.INPUT_AI_META || {};
  return IA.loadInputAgent(JSON.stringify({
    o: { stateSize: 88, nActions: 1904, hSizes: meta.hSizes, lr: 1e-5, gamma: 0.9 },
    w: baked.INPUT_AI_WEIGHTS.net }));
}

/* 构造一个「玩家侧来球」的真实观测：
   玩家在 +z（pz≈1.32），球从对面飞向玩家 → vz > 0，已过网 bounced=1。 */
function obsAt(bx, opt){
  opt = opt || {};
  const vx = opt.vx != null ? opt.vx : 0;
  const vz = opt.vz != null ? opt.vz : 3.2;
  return {
    x: bx, y: 0.92, z: opt.z != null ? opt.z : 0.5,
    vx: vx, vy: -0.4, vz: vz,
    sx: 0, sy: 40,
    px: opt.px != null ? opt.px : 0,
    pz: opt.pz != null ? opt.pz : 1.32,
    svx: 0, svz: 0,
    tx: opt.tx != null ? opt.tx : 0,
    my: 0.5,
    bounced: opt.bounced != null ? opt.bounced : 1,
  };
}

const A = loadAgent();
console.log('权重：' + (process.argv[2] || 'js/input-weights.js（线上烘焙版）'));

/* ---------- Q1：argmax 的 tx 是否跟着球 x 走 ---------- */
console.log('\n=== Q1 来球扫描：球心 bx → 决策 tx ===');
console.log('   bx    tx(决策)   my    ctrl   mxI    Q(argmax)   Q(追球心)   Δ');
let txs = [], bxs = [];
for(let i = -6; i <= 6; i++){
  const bx = i * 0.2;
  const o = obsAt(bx);
  const a = A.bestAction(o);
  const d = A.decode(a);
  /* 同一 obs 下，「追球心」那个动作的 Q 值（BC 保鲜池用的正是这个目标） */
  const chaseA = IA.nearestAction(Math.max(-0.9, Math.min(0.9, bx)), 0.5, false);
  const st = A.encode(o);
  const DQN = require(path.join(ROOT, 'js', 'dqn.js'));
  const q = DQN.mlpForward(require(path.join(ROOT, 'js', 'input-weights.js')).INPUT_AI_WEIGHTS.net, st).last;
  console.log(bx.toFixed(2).padStart(6), d.tx.toFixed(3).padStart(8), d.my.toFixed(3).padStart(5),
    String(d.ctrl).padStart(5), String(((a >> 2) / 14 | 0)).padStart(4),
    q[a].toFixed(4).padStart(9), q[chaseA].toFixed(4).padStart(9), (q[a] - q[chaseA]).toFixed(4).padStart(7));
  txs.push(d.tx); bxs.push(bx);
}
const mx = bxs.reduce((s, v) => s + v, 0) / bxs.length;
const my = txs.reduce((s, v) => s + v, 0) / txs.length;
let num = 0, den = 0;
for(let i = 0; i < bxs.length; i++){ num += (bxs[i] - mx) * (txs[i] - my); den += (bxs[i] - mx) ** 2; }
const slope = den ? num / den : 0;
console.log('\n  tx 均值 %s · 球心均值 %s · 回归斜率 d(tx)/d(x) = %s',
  my.toFixed(3), mx.toFixed(3), slope.toFixed(3));
console.log('  判读：斜率≈1 → 会跟球；斜率≈0 → 拍面钉在中线（横向跟踪缺失）。');
console.log('  tx 唯一取值数 = %d（34 个可选鼠标X里只用了 %d 个）', new Set(txs.map(v => v.toFixed(3))).size, new Set(txs.map(v => v.toFixed(3))).size);

/* ---------- Q2：tau / 预测落点在玩家来球时是否失效 ---------- */
console.log('\n=== Q2 encodeObs 的时间前视维（玩家侧来球 vz>0 vs 对面来球 vz<0）===');
console.log('  球心 x=0.8、拍面 pz=1.32、球 z=0.5，逐维打印 18..30（不猜索引）：');
console.log('  vz   ' + Array.from({ length: 13 }, (_, i) => ('#' + (18 + i)).padEnd(9)).join(''));
for(const vz of [3.2, 1.2, 0, -1.2, -3.2]){
  const st = A.encode(obsAt(0.8, { vz: vz }));
  console.log('  ' + vz.toFixed(1).padStart(4) + ' ' +
    Array.from({ length: 13 }, (_, i) => st[18 + i].toFixed(3).padEnd(9)).join(''));
}
console.log('  判读：#21=tau01、#22=(x+vx·τ)/1.2、#23=(y+vy·τ−.46)/.8、#24=(z+vz·τ)/2.2。');
console.log('  若 vz>0（玩家侧来球）那一行 #21 恒 0 且 #22 恒等于球心 x/1.2=0.667，');
console.log('  就说明**玩家真正需要它的那一段，前视维全是废的**（τ 只在 vz<0 时才有值）。');

/* ---------- Q3：横向移动幅度（拍速到底够不够） ---------- */
console.log('\n=== Q3 横向可达性（MOUSE_PACE=18，60Hz → 每帧补 30% 残差）===');
console.log('  τ = 1/18 s ≈ 0.056s；从球心 -0.9 挪到 +0.9 需要的帧数 ≈ %d（0.15s）', Math.ceil(Math.log(0.1) / Math.log(1 - 0.3)));
console.log('  → 拍面速度不是瓶颈：只要 tx 对，0.15s 内任何合法 x 都能到。');