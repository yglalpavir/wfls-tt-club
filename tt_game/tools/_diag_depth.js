/* =====================================================================
 *  _diag_depth.js — 一次性诊断：地狱档失分到底是不是「深度旋钮」问题
 *
 *  为什么查这个（2026-10-08 input3-hell12h 收尾之后）
 *  --------------------------------------------------
 *  12h 跑完，闸门 B 判负：实机 vs 地狱 2.6%，基线 11.7%，掉了 9.1pp。
 *  同一份权重的仿真 vs 地狱是 6.5%，而失分原因分解里 **noreach 占 95.6%**
 *  （522 次失分里 499 次是「未能回球」）。也就是说：
 *  这份权重在实机上不是「打过去出界」，而是**根本够不到球**。
 *
 *  而 depth 旋钮 my 直接决定球台 z 位置（input-sim.js:
 *  tz = 0.92 + my*0.8），也就是前后站位 —— 恰恰是「够不够得到」那个量。
 *
 *  phase4 §4 早就怀疑过这一点：BC「追球监督」保鲜池的样本全部来自
 *  naiveCmd = { tx: ball.x, my: 0.5 }，**深度恒为中位**。但那只是推测，
 *  当时没有实测。现在要回答两个问题：
 *    Q1 训练出来的策略在实机里 my 实际取什么值？（锁定中位？）
 *    Q2 起点权重（线上那份）是不是也锁中位？（若两者一样，说明这轮
 *       训练压根没动这个旋钮 —— 那就是 12h 白烧的真正原因）
 *
 *  只读：不改任何权重、不训练，纯观测。
 *  用法：node tools/_diag_depth.js [weights.json ...]
 * ===================================================================== */
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const IA = require(path.join(ROOT, 'js', 'input-agent.js'));
const INPUTSIM = require(path.join(ROOT, 'js', 'input-sim.js'));
const OPP = require(path.join(ROOT, 'js', 'opponent-ladder.js'));
const PP = require(path.join(ROOT, 'js', 'policy.js'));

function mulberry32(a){
  return function(){
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const GAMES = parseInt(process.env.GAMES || '20', 10);
const LEVELS = (process.env.OPP || 'hell').split(',');

const targets = process.argv.slice(2);
if(!targets.length){
  console.error('用法：node tools/_diag_depth.js <weights.json> [more.json ...]');
  process.exit(1);
}

/* agent 只需要能 setNet + bestAction；不需要训练，所以 rng 传个函数即可。
 * hSizes **必须**用权重自带的 o.hSizes（或从矩阵形状推），不能省：
 * createInputAgent 的默认 hSizes 是 [192,256,192]（input-agent.js 的权威值），
 * 而 setNet 会硬校验 [stateSize,h1..hn,out] 与权重逐层一致，不一致直接抛错。
 * 隐藏层宽度 = 各权重矩阵的**行数**（行=该层输出维），
 * 不是 slice(1,-1)——权重数组里没有独立的「输入层」条目。 */
function loadAgent(file){
  const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
  const net = raw.w || raw.net;
  const W = net.map(l => Array.isArray(l) ? l : l.W);
  const rows = W.map(m => m.length);
  const inDim = W[0][0].length;
  const hSizes = (raw.o && Array.isArray(raw.o.hSizes) && raw.o.hSizes.length === W.length - 1)
    ? raw.o.hSizes.slice() : rows.slice(0, -1);
  const agent = IA.createInputAgent({
    stateSize: inDim, hSizes, nActions: rows[rows.length - 1],
    batch: 64, replayCap: 1000, targetEvery: 1000, learnPerPoint: 0,
  }, mulberry32(12345));
  agent.setNet(net);
  return { agent, shape: [inDim].concat(rows) };
}

for(const file of targets){
  const abs = path.isAbsolute(file) ? file : path.join(ROOT, file);
  if(!fs.existsSync(abs)){ console.error('跳过（不存在）：' + file); continue; }
  const { agent, shape } = loadAgent(abs);
  console.log('\n=== ' + path.relative(ROOT, abs) + ' ===');
  console.log('  网络形状 ' + shape.join('×') + ' · 动作数 ' + shape[shape.length - 1]);

  for(const lv of LEVELS){
    const opp = OPP.at(lv);
    if(!opp){ console.error('  未知对手档 ' + lv); continue; }
    const hist = new Array(IA.IN_MY.length).fill(0);
    const txSum = new Array(IA.IN_MX.length).fill(0);
    let dec = 0, ctrlOn = 0;

    /* 贪心当前策略，记录每一步它选的 my / tx。 */
    const brain = { act(o){
      const a = agent.bestAction(o);
      const c = agent.decode(a);
      const myI = Math.max(0, Math.min(IA.IN_MY.length - 1,
        Math.round(c.my * (IA.IN_MY.length - 1))));
      const txI = Math.max(0, Math.min(IA.IN_MX.length - 1,
        Math.round((c.tx + 0.9) / 1.8 * (IA.IN_MX.length - 1))));
      hist[myI]++; txSum[txI]++; dec++;
      if(c.ctrl) ctrlOn++;
      return c;
    }, credit(){} };

    let dqnPts = 0, oppPts = 0;
    for(let g = 0; g < GAMES; g++){
      const server = (g % 2 === 0) ? 'player' : 'ai';
      const r = INPUTSIM.playInputPoint(brain, opp, mulberry32(99991 + g), server);
      if(r.winner === 'player') dqnPts++; else oppPts++;
    }
    const n = dec || 1;
    const topIdx = hist.map((v, i) => [v, i]).sort((a, b) => b[0] - a[0]);
    const txMean = txSum.reduce((a, v, i) => a + v * IA.IN_MX[i], 0) / n;
    const myMean = hist.reduce((a, v, i) => a + v * IA.IN_MY[i], 0) / n;
    const myTop = topIdx[0];
    const midI = Math.round(0.5 * (IA.IN_MY.length - 1));

    console.log('\n  对手 ' + lv + '：点分率 ' +
      (GAMES ? (dqnPts / GAMES * 100).toFixed(1) : '—') + '%  (' + dqnPts + '-' + oppPts + '，' + GAMES + ' 局)');
    console.log('    决策步数 ' + dec + ' · ctrl 占比 ' + (ctrlOn / n * 100).toFixed(1) + '%');
    console.log('    my 均值 ' + myMean.toFixed(3) +
                '  tx 均值 ' + txMean.toFixed(3) +
                '（tx 中位=0，my 中位=0.5）');
    console.log('    my 众数 = ' + IA.IN_MY[myTop[1]].toFixed(3) +
                '（占 ' + (myTop[0] / n * 100).toFixed(1) + '%）' +
                (myTop[1] === midI ? '   ← 锁在中位' : ''));
    const bar = hist.map((v, i) => v ? String(Math.round(v / n * 100)).padStart(3) : '  .').join('');
    console.log('    my 直方图(%) my=0.00→1.00 共 ' + IA.IN_MY.length + ' 档:');
    console.log('      ' + bar);
    const atMid = hist[midI] / n * 100;
    const lo = hist.slice(0, midI).reduce((a, b) => a + b, 0) / n * 100;
    const hi = hist.slice(midI + 1).reduce((a, b) => a + b, 0) / n * 100;
    console.log('    偏前(<中位) ' + lo.toFixed(1) + '% · 中位 ' + atMid.toFixed(1) +
                '% · 偏后(>中位) ' + hi.toFixed(1) + '%');
  }
}
console.log('\n（只读诊断，未改任何权重）');