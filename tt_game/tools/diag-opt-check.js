#!/usr/bin/env node
/* =====================================================================
 *  diag-opt-check.js — 优化器改动验证闸门（阶段 2.2）
 *
 *  验四件事：
 *   1. 默认路径逐位不变：mlpTrain(w,i,t,lr)（无 opts）与改动前的原始实现
 *      （本文件里的 mlpTrainRef，改动前 js/dqn.js:41-74 的逐字副本）
 *      在同一输入序列下产生完全相同的权重 —— 这是"现有 5 个模型与全部旧
 *      脚本行为不变"这个承诺的唯一硬证据。
 *   2. gradClip 真的在裁：裁剪后全网络梯度 2-范数 ≤ clip（误差 1e-9 内）。
 *   3. lrScale 真的在分层缩放：只有第 li 层乘了 scale[li]。
 *   4. Adam 跑得住：同数据下 Adam 的 MSE 不劣于同 lr 的 SGD，且全程无 NaN。
 *
 *  用法：node tools/diag-opt-check.js [--n 600] [--seed 20260910]
 *  退出码 0 = 全部通过；1 = 有失败（可直接当 CI 闸门）
 * ===================================================================== */
'use strict';
const DQN = require('../js/dqn.js');
const IA = require('../js/input-agent.js');

const argv = process.argv.slice(2);
const flag = (k, d) => { const i = argv.indexOf(k); return i >= 0 && argv[i + 1] ? argv[i + 1] : d; };
const N = parseInt(flag('--n', '600'), 10);
const SEED = parseInt(flag('--seed', '20260910'), 10);
let fail = 0;
const ok = (name, cond, extra) => {
  console.log((cond ? '  PASS  ' : '  FAIL  ') + name + (extra != null ? '   ' + extra : ''));
  if(!cond) fail++;
};

/* mulberry32 固定种子（跨平台可复现） */
function rngFactory(seed){
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6D2B79F5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* ---- mlpTrain 的原始实现（改动前 js/dqn.js 的逐字副本，用作参考） ---- */
function mlpTrainRef(w, input, target, lr){
  const { acts } = DQN.mlpForward(w, input);
  const nLayers = w.length;
  const outAct = acts[acts.length - 1];
  let delta = outAct.map((q, i) => {
    const d = q - target[i];
    return (isFinite(d) && Math.abs(d) < 100) ? d : 0;
  });
  for(let li = nLayers - 1; li >= 0; li--){
    const { W, b } = w[li];
    const inAct = acts[li];
    for(let j = 0; j < W.length; j++){
      const d = delta[j];
      if(!isFinite(d)) continue;
      for(let k = 0; k < inAct.length; k++) W[j][k] -= lr * d * inAct[k];
      b[j] -= lr * d;
    }
    if(li > 0){
      let newDelta = new Array(inAct.length).fill(0);
      for(let j = 0; j < W.length; j++){
        const d = delta[j];
        if(!isFinite(d)) continue;
        for(let k = 0; k < inAct.length; k++) newDelta[k] += W[j][k] * d;
      }
      delta = newDelta.map((d, k) => (inAct[k] > 0 ? d : 0));
    }
  }
  return w;
}

/* ---- 用真实智能体造数据：观测 + BC one-hot 目标（与 diag-grad.js 同一来源） ---- */
function makeData(n, seed){
  const rng = rngFactory(seed);
  const rows = [];
  for(let i = 0; i < n; i++){
    const obs = {
      x: (rng() * 2 - 1) * 1.2, y: 0.46 + (rng() * 2 - 1) * 0.5,
      z: (rng() * 2 - 1) * 2.0, vx: (rng() * 2 - 1) * 5,
      vy: -0.5 - rng() * 5, vz: 0.5 + rng() * 5,
      sx: (rng() * 2 - 1) * 150, sy: (rng() * 2 - 1) * 110,
      px: (rng() * 2 - 1) * 1.2, pz: 0.92 + rng() * 0.8,
      svx: (rng() * 2 - 1) * 7, svz: (rng() * 2 - 1) * 5,
      tx: (rng() * 2 - 1) * 1, my: rng(), bounced: rng() > 0.45 ? 1 : 0,
    };
    const state = IA.encodeObs(obs);
    const ctrl = rng() > 0.8 ? 1 : 0;
    const act = IA.nearestAction((rng() * 2 - 1) * 0.9, rng(), !!ctrl);
    const target = new Array(IA.ACT_N).fill(0);
    target[act] = 1.5;
    rows.push([state, target]);
  }
  return rows;
}
const meanMSE = (w, rows) => {
  let s = 0;
  for(const [x, t] of rows){
    const q = DQN.mlpForward(w, x).last;
    for(let i = 0; i < q.length; i++) s += (q[i] - t[i]) * (q[i] - t[i]);
  }
  return s / rows.length / IA.ACT_N;
};
const hasNaN = (w) => { for(const l of w){ for(const r of l.W) for(const v of r) if(!isFinite(v)) return true; for(const v of l.b) if(!isFinite(v)) return true; } return false; };

const data = makeData(N, SEED);
const SIZES = [IA.OBS_N, 128, 192, 128, IA.ACT_N];   // 与生产权重同形状
console.log('数据 ' + N + ' 条 · 形状 ' + SIZES.join('→') + ' · seed ' + SEED + '\n');

/* ===== 1. 默认路径逐位不变 ===== */
console.log('1) 默认路径（无 opts）vs 改动前原始实现');
{
  const nA = DQN.mlpInit(SIZES, rngFactory(101));
  const nB = DQN.mlpInit(SIZES, rngFactory(101));
  let maxDiff = 0;
  for(let i = 0; i < data.length; i++){
    const [x, t] = data[i];
    const lr = 0.0004 * (1 + (i % 3) * 0.5);   // 故意变动 lr，覆盖分支
    mlpTrainRef(nA, x, t, lr);
    DQN.mlpTrain(nB, x, t, lr);                 // 无 opts → 应走 mlpTrainSgd
    for(let li = 0; li < nA.length; li++){
      for(let j = 0; j < nA[li].W.length; j++){
        const ra = nA[li].W[j], rb = nB[li].W[j];
        for(let k = 0; k < ra.length; k++) maxDiff = Math.max(maxDiff, Math.abs(ra[k] - rb[k]));
        maxDiff = Math.max(maxDiff, Math.abs(nA[li].b[j] - nB[li].b[j]));
      }
    }
  }
  ok('无 opts 与原始实现逐位相同（最大差 0）', maxDiff === 0, 'maxDiff=' + maxDiff);
}

/* ===== 2. gradClip 真的在裁 ===== */
console.log('\n2) gradClip 生效性');
{
  /* 极小网络 + 大输入幅值制造超大梯度。
   * 注意：输入维度必须与网络首层一致——mlpTrain 不校验维度，
   * 维度不匹配时 W[j][k] 读到 undefined → NaN（原实现与增强路径同病，
   * 这是既有行为，不是本次改动引入的）。 */
  const SMALL = [8, 32, 32, 6];
  const x = new Array(SMALL[0]).fill(5);
  const t = new Array(SMALL[SMALL.length - 1]).fill(0);
  t[0] = 1;
  const cfg = DQN.mlpTrainOpts({ optimizer: 'sgd', gradClip: 0.01, lrScale: null });
  ok('mlpTrainOpts 识别 gradClip', !!cfg, 'mode=' + (cfg ? 'sgd+clip0.01' : 'null'));
  // 全网络梯度 2-范数（裁剪前）
  const w0 = DQN.mlpInit(SMALL, rngFactory(202));
  const { acts } = DQN.mlpForward(w0, x);
  let gnorm = 0;
  {
    let delta = acts[acts.length - 1].map((q, i) => { const d = q - t[i]; return (isFinite(d) && Math.abs(d) < 100) ? d : 0; });
    for(let li = SMALL.length - 2; li >= 0; li--){
      const { W } = w0[li], inAct = acts[li];
      for(let j = 0; j < W.length; j++){
        const d = delta[j]; if(!isFinite(d)) continue;
        for(let k = 0; k < inAct.length; k++) gnorm += (d * inAct[k]) * (d * inAct[k]);
        gnorm += d * d;
      }
      if(li > 0){
        const nd = new Array(inAct.length).fill(0);
        for(let j = 0; j < W.length; j++){ const d = delta[j]; if(!isFinite(d)) continue;
          for(let k = 0; k < inAct.length; k++) nd[k] += W[j][k] * d; }
        delta = nd.map((d, k) => (inAct[k] > 0 ? d : 0));
      }
    }
  }
  gnorm = Math.sqrt(gnorm);
  const wClip = DQN.mlpInit(SMALL, rngFactory(202));
  const wNo = DQN.mlpInit(SMALL, rngFactory(202));
  const step = 0.05;   // 大 lr，单步位移远超 clip
  DQN.mlpTrain(wNo, x, t, step);
  DQN.mlpTrain(wClip, x, t, step, cfg);
  // 裁剪后实际施加的更新范数 ≈ step × clip；未裁剪 ≈ step × gnorm
  const upNorm = (a, b) => {
    let s = 0;
    for(let li = 0; li < a.length; li++)
      for(let j = 0; j < a[li].W.length; j++){
        for(let k = 0; k < a[li].W[j].length; k++){ const d = a[li].W[j][k] - b[li].W[j][k]; s += d * d; }
        const d = a[li].b[j] - b[li].b[j]; s += d * d;
      }
    return Math.sqrt(s);
  };
  const base0 = DQN.mlpInit(SMALL, rngFactory(202));
  const movedNo = upNorm(wNo, base0), movedClip = upNorm(wClip, base0);
  const wantClip = step * 0.01;
  ok('裁剪前梯度范数确实超界', gnorm > 1, '‖g‖=' + gnorm.toFixed(3));
  ok('裁剪后位移 ≈ step×clip', Math.abs(movedClip - wantClip) < 1e-9,
     'got=' + movedClip.toExponential(3) + ' want=' + wantClip.toExponential(3));
  ok('未裁剪位移远大于裁剪后', movedNo > movedClip * 10, 'unclipped=' + movedNo.toFixed(3));
}

/* ===== 3. lrScale 真的在分层缩放 ===== */
console.log('\n3) lrScale 分层缩放');
{
  const SMALL = [4, 8, 8, 4];
  const x = new Array(SMALL[0]).fill(3);
  const t = new Array(SMALL[SMALL.length - 1]).fill(0);
  t[1] = 1;
  const sCfg = DQN.mlpTrainOpts({ optimizer: 'sgd', gradClip: 0, lrScale: [1, 0] });
  ok('mlpTrainOpts 识别 lrScale', !!sCfg && sCfg.lrScale[0] === 1 && sCfg.lrScale[1] === 0);
  /* 只在 enh 路径之间互比：sgd 路径在原地更新权重，上层误差传播用的是"更新后"
   * 的 W；enh 路径先累计梯度再统一施加，用的是"更新前"的 W。两者梯度本身有 O(lr)
   * 的差异，跨路径比较会把这个差异误判成 lrScale 失效。
   * enh 路径内部的 delta 链不依赖 lrScale，所以同 cfg 家族的梯度逐位相同，
   * 可以精确比较。 */
  const mk = () => DQN.mlpInit(SMALL, rngFactory(303));
  const layerMoved = (a, b, li) => {
    for(let j = 0; j < a[li].W.length; j++){
      for(let k = 0; k < a[li].W[j].length; k++) if(a[li].W[j][k] !== b[li].W[j][k]) return true;
      if(a[li].b[j] !== b[li].b[j]) return true;
    }
    return false;
  };
  const layerEqual = (a, b, li) => !layerMoved(a, b, li);
  const base = mk();
  const s00 = DQN.mlpTrainOpts({ optimizer: 'sgd', gradClip: 0, lrScale: [0, 0] });
  const s11 = DQN.mlpTrainOpts({ optimizer: 'sgd', gradClip: 0, lrScale: [1, 1] });
  const s10 = DQN.mlpTrainOpts({ optimizer: 'sgd', gradClip: 0, lrScale: [1, 0] });
  const s01 = DQN.mlpTrainOpts({ optimizer: 'sgd', gradClip: 0, lrScale: [0, 1] });
  const wAll = mk(), wS00 = mk(), wS10 = mk(), wS01 = mk();
  DQN.mlpTrain(wAll, x, t, 0.1, s11);   // 全层 scale=1（= enh 默认）
  DQN.mlpTrain(wS00, x, t, 0.1, s00);   // 两层全冻
  DQN.mlpTrain(wS10, x, t, 0.1, s10);   // 输出层冻、输入层活
  DQN.mlpTrain(wS01, x, t, 0.1, s01);   // 输入层冻、输出层活
  ok('scale=[1,1] 两层都动（对照组）', layerMoved(wAll, base, 0) && layerMoved(wAll, base, 1));
  ok('scale=[0,0] 整网不动', !layerMoved(wS00, base, 0) && !layerMoved(wS00, base, 1),
     'layer0=' + (layerMoved(wS00, base, 0) ? 'MOVED' : 'frozen')
     + ', layer1=' + (layerMoved(wS00, base, 1) ? 'MOVED' : 'frozen'));
  ok('scale=[1,0] 只动输入层', layerMoved(wS10, base, 0) && layerEqual(wS10, base, 1));
  ok('scale=[0,1] 只动输出层', layerEqual(wS01, base, 0) && layerMoved(wS01, base, 1));
  ok('scale=1 的层与 [1,1] 配置逐位相同', layerEqual(wS10, wAll, 0) && layerEqual(wS01, wAll, 1));
}

/* ===== 4. Adam：跑得住 + 不比同 lr SGD 差 ===== */
console.log('\n4) Adam（同形状、同数据、同名义 lr）');
{
  const mk = () => DQN.mlpInit(SIZES, rngFactory(404));
  const steps = 400;
  const lr = 0.0004;
  const run = (cfg, tag) => {
    let w = mk();
    let m0 = meanMSE(w, data);
    for(let i = 0; i < steps; i++){
      const [x, t] = data[i % data.length];
      DQN.mlpTrain(w, x, t, lr, cfg);
    }
    const m1 = meanMSE(w, data);
    console.log('  ' + tag.padEnd(22) + ' MSE ' + m0.toFixed(5) + ' → ' + m1.toFixed(5)
                + '   降 ' + (100 * (1 - m1 / m0)).toFixed(1) + '%   NaN=' + hasNaN(w));
    return { m0, m1, nan: hasNaN(w) };
  };
  const sgd = run(null, 'sgd（默认路径）');
  const sgdc = run(DQN.mlpTrainOpts({ optimizer: 'sgd', gradClip: 2.0 }), 'sgd + clip2.0');
  const adam = run(DQN.mlpTrainOpts({ optimizer: 'adam', gradClip: 0 }), 'adam（默认 β）');
  const adamc = run(DQN.mlpTrainOpts({ optimizer: 'adam', gradClip: 1.0 }), 'adam + clip1.0');
  const layer = run(DQN.mlpTrainOpts({ optimizer: 'adam', lrScale: [1, 1, 1, 3] }), 'adam + 输出层 3×lr');

  ok('SGD 默认路径无 NaN', !sgd.nan);
  ok('SGD+clip 无 NaN', !sgdc.nan);
  ok('Adam 无 NaN', !adam.nan);
  ok('Adam+clip 无 NaN', !adamc.nan);
  ok('Adam 拟合不劣于同 lr 的纯 SGD', adam.m1 <= sgd.m1 * 1.02,
     'adam=' + adam.m1.toFixed(5) + ' sgd=' + sgd.m1.toFixed(5));
  ok('Adam+clip 无 NaN 且基本不损失拟合', !adamc.nan && adamc.m1 <= adam.m1 * 1.15,
     'clip=' + adamc.m1.toFixed(5));
  ok('分层 lr（输出层 3×）无 NaN', !layer.nan);
}

/* ===== 5. 智能体接线：默认仍是 sgd 旧路径 ===== */
console.log('\n5) 智能体接线（默认路径不被改动）');
{
  const a = IA.createInputAgent({ stateSize: IA.OBS_N, nActions: IA.ACT_N, hSizes: [128, 192, 128] });
  ok('默认 getTrainMode = sgd', a.getTrainMode() === 'sgd', 'mode=' + a.getTrainMode());
  const b = IA.createInputAgent({ hSizes: [128, 192, 128], optimizer: 'adam', gradClip: 3.0 });
  ok('启用后 getTrainMode = adam+clip3', b.getTrainMode() === 'adam+clip3', 'mode=' + b.getTrainMode());
  // 冒烟：act 必须先调用（episode 为空时 endPoint 不入回放，learn 直接返回）
  const s = IA.encodeObs({ x: 0, y: 0.5, z: 1, vx: 0, vy: -1, vz: 3, sx: 0, sy: 0, px: 0, pz: 1.3, svx: 0, svz: 0, tx: 0, my: 0.5 });
  for(let i = 0; i < 300; i++){
    b.act(s, true);
    b.endPoint('player', i % 2 ? 'player' : 'ai');
  }
  ok('回放已填充（learn 才会真跑）', b.getReplaySize() >= 128, 'replay=' + b.getReplaySize());
  b.setBcMix(0.3);
  const pairs = [];
  for(let i = 0; i < 40; i++) pairs.push([s, IA.ACT_N * i % IA.ACT_N]);
  b.setBC(pairs);
  let threw = false;
  try{ for(let i = 0; i < 30; i++) b.learn(); }catch(e){ threw = true; console.log('    异常：' + e.message); }
  ok('Adam 智能体连续 learn 不抛异常', !threw);
  ok('Adam 智能体权重全有限', !hasNaN(b.getNet()));
  // 存档往返：旧存档（无 optimizer 字段）加载后仍是 sgd
  const legacy = { w: a.getNet(), o: { stateSize: IA.OBS_N, nActions: IA.ACT_N, hSizes: [128, 192, 128] } };
  const c = IA.loadInputAgent(JSON.stringify(legacy));
  ok('旧存档（无 optimizer）加载后 mode=sgd', c.getTrainMode() === 'sgd', 'mode=' + c.getTrainMode());
}

/* ===== 6. 维度守卫 ===== */
console.log('\n6) 维度守卫（防止 undefined 乘出 NaN 静默污染整网）');
{
  const w = DQN.mlpInit(SIZES, rngFactory(505));
  let threw = false;
  try{ DQN.mlpTrain(w, new Array(8).fill(1), data[0][1], 0.001); }
  catch(e){ threw = /维度不符/.test(e.message); }
  ok('输入维度不匹配时抛错', threw, threw ? '已拦' : '漏过');
  ok('抛错后网络未被 NaN 污染', !hasNaN(w));
  let threw2 = false;
  try{ DQN.mlpTrain(w, data[0][0], new Array(9).fill(0), 0.001); }
  catch(e){ threw2 = /维度不符/.test(e.message); }
  ok('target 维度不匹配时抛错', threw2);
  /* 形状匹配时正常训练、不受守卫影响 */
  const w2 = DQN.mlpInit(SIZES, rngFactory(505));
  let threw3 = false;
  try{ DQN.mlpTrain(w2, data[0][0], data[0][1], 0.001); }catch(e){ threw3 = true; }
  ok('形状匹配时正常训练不抛错', !threw3 && !hasNaN(w2));
}

console.log('\n' + (fail === 0 ? '全部通过 ✓' : fail + ' 项失败 ✗'));
process.exit(fail === 0 ? 0 : 1);
