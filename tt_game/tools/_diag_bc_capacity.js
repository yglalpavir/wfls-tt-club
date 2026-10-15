/* _diag_bc_capacity.js —— 「BC 为什么学不动」的定位实验（R5）
 *
 * 背景：把 imitate() 改成 raise-only 之后，argmax 命中率仍然在 epoch 5 就
 * 钉死在 3.2%（657 个状态 / default 对手 / Adam+clip2+layerlr / lr=0.01）。
 * 单状态对照却能 200 步收敛到 q=1.6。差别只在「池子大小」。
 *
 * 这个脚本把变量一个个拆开：池子规模 × 学习率 × 优化器，
 * 每个格子报 argmax 命中率（**训练集内**，不是泛化），用来区分
 *   (a) 优化问题（学不动）  vs  (b) 标注冲突（学不了）  vs  (c) 评估口径问题。
 *
 * 用法：node tools/_diag_bc_capacity.js
 */
const path = require('path');
const fs = require('fs');

const ROOT = path.join(__dirname, '..');
const PP = require(path.join(ROOT, 'js', 'policy.js'));
const INPUTSIM = require(path.join(ROOT, 'js', 'input-sim.js'));
const IA = require(path.join(ROOT, 'js', 'input-agent.js'));
const DQN = require(path.join(ROOT, 'js', 'dqn.js'));

function mulberry32(a){
  return function(){
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const cl = (v, l, h) => (v < l ? l : (v > h ? h : v));
function chaseTx(o){
  const x = o.x || 0, vx = o.vx || 0, vz = o.vz || 0;
  const pz = (o.pz != null) ? o.pz : INPUTSIM.PLAYER_Z;
  const closing = (pz - (o.z || 0)) * vz > 0 && Math.abs(vz) > 0.05;
  const tau = closing ? Math.min(1.5, Math.abs((pz - (o.z || 0)) / vz)) : 0;
  return cl(x + vx * tau, -0.9, 0.9);
}

/* ---- 采一条足够长的追球轨迹，切成不同规模的池子 ---- */
const all = [];
{
  const brain = {
    act(o){ all.push({ raw: Object.assign({}, o), st: null, act: IA.nearestAction(chaseTx(o), 0.5, false) }); return { tx: chaseTx(o), my: 0.5, ctrl: false }; },
    credit(){},
  };
  for(let g = 0; g < 10; g++) INPUTSIM.playInputPoint(brain, PP.POLICY_DEFAULT, mulberry32(20261014 + g), g % 2 === 0 ? 'player' : 'ai');
}
console.log('采到 ' + all.length + ' 帧');

function mkAgent(lr, opt){
  const a = IA.createInputAgent({ stateSize: IA.OBS_N, nActions: IA.ACT_N, hSizes: IA.HSIZES,
                                  batch: 64, gamma: 0.99, lr });
  if(opt !== 'sgd') a.setOptimizer({ optimizer: opt, gradClip: 2, lrScale: [1, 1, 1, 3] });
  a.setEps(0); a.setLr(lr);
  return a;
}
/* 命中率直接用编码向量算（绕开 bestAction 的二次编码坑） */
function hitRate(net, pool){
  let hit = 0;
  for(const p of pool){
    const q = DQN.mlpForward(net, p.st).last;
    let m = 0; for(let i = 1; i < q.length; i++) if(q[i] > q[m]) m = i;
    if(m === p.act) hit++;
  }
  return 100 * hit / pool.length;
}

const rows = [];
for(const N of [1, 20, 100, 657]){
  const pool = all.slice(0, N).map(p => ({ st: mkAgent(0.01).encode(p.raw), act: p.act }));
  for(const opt of ['sgd', 'adam']){
    for(const lr of [0.01, 0.05, 0.2]){
      const a = mkAgent(lr, opt);
      const marks = [];
      for(let e = 1; e <= 40; e++){
        for(const p of pool) a.imitate(p.st, p.act, 1.6);
        if(e === 1 || e === 5 || e === 10 || e === 20 || e === 40) marks.push('e' + e + '=' + hitRate(a.getNet(), pool).toFixed(0) + '%');
      }
      const line = 'N=' + String(N).padStart(4) + ' ' + opt.padEnd(4) + ' lr=' + String(lr).padEnd(5) + ' ' + marks.join('  ');
      console.log(line);
      rows.push(line);
    }
  }
}
fs.writeFileSync(path.join(__dirname, 'logs', '_diag_bc_capacity.txt'),
                 '池子规模 × 优化器 × lr → 训练集内 argmax 命中率（40 epoch）\n' + rows.join('\n') + '\n', 'utf8');
console.log('\n已写 tools/logs/_diag_bc_capacity.txt');