/* _diag_bc_fit.js —— 「这个网络到底能不能拟合 520 条硬标注」的判决实验（R5）
 *
 * 背景：_diag_bc_capacity.js 的结果是**按累计更新次数**单调变差的
 *   5 次更新 → 100% 命中，20 次 → 55%，100 次 → 12%，520 次 → 1%。
 *   池子大小和 epoch 都不是变量，只有「总更新数」是。
 *   两种监督都试过：硬目标（其余压到 0）和 raise-only（只抬示范），都失败。
 *   于是要么是「这个 88→192→256→192→1904 的网在真实观测上拟合不动」，
 *   要么是「mlpTrainEnh / mlpTrainSgd 的更新路径有毛病」。
 *   这个脚本把标签换成**随机的确定性函数**（不可能有语义冲突），
 *   如果连随机标签都拟合不了，那就是路径问题，不是数据问题。
 *   再顺带测隐层 ReLU 活跃率——全灭的话梯度根本传不回第一层。
 */
const path = require('path');
const fs = require('fs');

const ROOT = path.join(__dirname, '..');
const PP = require(path.join(ROOT, 'js', 'policy.js'));
const INPUTSIM = require(path.join(ROOT, 'js', 'input-sim.js'));
const IA = require(path.join(ROOT, 'js', 'input-agent.js'));
const DQN = require(path.join(ROOT, 'js', 'dqn.js'));

function mulberry32(a){
  return function(){ a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

/* ---- 真实观测轨迹 ---- */
const raw = [];
{
  const brain = { act(o){ raw.push(Object.assign({}, o)); return { tx:0, my:0.5, ctrl:false }; }, credit(){} };
  for(let g = 0; g < 10; g++) INPUTSIM.playInputPoint(brain, PP.POLICY_DEFAULT, mulberry32(20261014 + g), g % 2 === 0 ? 'player' : 'ai');
}
const N = 520;
const sts = raw.slice(0, N).map(o => IA.encodeObs(o));
/* 确定性随机标签：只看前 6 个输入维的整数部分，任何语义都不冲突 */
const rnd = mulberry32(777);
const lbl = sts.map(s => ((Math.floor(s[0] * 97) * 31 + Math.floor(s[3] * 89) * 17
                          + Math.floor(s[5] * 71) * 7 + Math.floor(s[1] * 53) * 3) % 1904 + 1904) % 1904);
console.log('样本 ' + sts.length + '  标签去重 ' + new Set(lbl).size + ' 种');

/* ---- ReLU 活跃率 ---- */
{
  const a = IA.createInputAgent({ stateSize: 88, nActions: 1904, hSizes: [192, 256, 192], batch: 64, gamma: 0.99, lr: 0.01 });
  let act = [0, 0, 0], tot = [0, 0, 0];
  for(const s of sts){
    const r = DQN.mlpForward(a.getNet(), s);
    for(let li = 0; li < 3; li++) for(const v of r.acts[li]){ tot[li]++; if(v > 0) act[li]++; }
  }
  console.log('隐层 ReLU 活跃率（随机初始化）：' + act.map((v, i) => (100 * v / tot[i]).toFixed(1) + '%').join(' / '));
}

function fit(lr, epochs, hard){
  const a = IA.createInputAgent({ stateSize: 88, nActions: 1904, hSizes: [192, 256, 192], batch: 64, gamma: 0.99, lr });
  a.setEps(0); a.setLr(lr);
  const marks = [];
  for(let e = 1; e <= epochs; e++){
    for(let i = 0; i < sts.length; i++){
      if(hard){
        const tgt = new Array(1904).fill(0); tgt[lbl[i]] = 1.6;
        DQN.mlpTrain(a.getNet(), sts[i], tgt, lr * 0.9, null);
      }else{
        a.imitate(sts[i], lbl[i], 1.6);
      }
    }
    if(e === 1 || e === 5 || e === 20 || e === epochs){
      const net = a.getNet();
      let hit = 0;
      for(let i = 0; i < sts.length; i++){
        const q = DQN.mlpForward(net, sts[i]).last;
        let m = 0; for(let j = 1; j < q.length; j++) if(q[j] > q[m]) m = j;
        if(m === lbl[i]) hit++;
      }
      marks.push('e' + e + '=' + (100 * hit / sts.length).toFixed(0) + '%');
    }
  }
  return marks.join('  ');
}

const rows = [];
for(const lr of [0.01, 0.1, 0.5, 2.0]){
  const h = 'lr=' + String(lr).padEnd(4) + ' 硬目标  ' + fit(lr, 100, true);
  const r = 'lr=' + String(lr).padEnd(4) + ' 只抬不压  ' + fit(lr, 100, false);
  console.log(h); console.log(r);
  rows.push(h, r);
}
fs.writeFileSync(path.join(__dirname, 'logs', '_diag_bc_fit.txt'),
  '随机确定性标签 · 520 条真实观测 · 100 epoch —— 能不能拟合？\n' + rows.join('\n') + '\n', 'utf8');
console.log('\n已写 tools/logs/_diag_bc_fit.txt');