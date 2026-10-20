/* =====================================================================
 *  hip-train.js — M2 学生：CE（软标签）蒸馏
 *
 *  与 DQN 时代的关键差别：
 *    · 损失是**分类**（softmax 交叉熵 / KL），不是 1904 维 MSE ——
 *      phase5 已证伪 MSE + 硬标签在 1904 路输出上（qmax 跑到 1e93）。
 *    · 标签是**软分布**（教师的 softmax），不是 one-hot。
 *    · 样本是「教师搜索出的最优意图」，不是环境回报 ——
 *      所以信用分配跨度只有 1 拍（而不是 500 帧的自举链）。
 *
 *  用法（cwd = tt_game/）：
 *    node tools/hip-train.js --data data/hip/teacher-v1.ndjson --epochs 30
 *    node tools/hip-train.js --data ... --out js/hip-weights.js --lr 0.002
 * ===================================================================== */
'use strict';
const path = require('path');
const fs = require('fs');

const ROOT = path.join(__dirname, '..');
const { HIP_INTENT } = require(path.join(ROOT, 'js', 'hip-intent.js'));

function argOf(flag, def){
  const i = process.argv.indexOf(flag);
  if(i < 0) return def;
  const v = process.argv[i + 1];
  return (v == null || v.startsWith('--')) ? def : v;
}
function mulberry32(a){
  return function(){
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const cl = (v, a, b) => (v < a ? a : (v > b ? b : v));

const N_IN = HIP_INTENT.N_FEAT, N_OUT = HIP_INTENT.N_INTENT;
const SIZES = [N_IN, 96, 128, 128, N_OUT];

/* ---- 权重：逐层 [W(out×in) 行优先 | b(out)] ---- */
function initWeights(rng){
  const w = [];
  for(let L = 0; L < SIZES.length - 1; L++){
    const nIn = SIZES[L], nOut = SIZES[L + 1];
    const W = new Float32Array(nOut * nIn);
    const sd = Math.sqrt(2 / nIn);                    // He
    for(let i = 0; i < W.length; i++) W[i] = (rng() * 2 - 1) * sd;
    const b = new Float32Array(nOut);
    w.push(W, b);
  }
  return w;
}
function flat(w){
  const out = [];
  for(const a of w) for(let i = 0; i < a.length; i++) out.push(a[i]);
  return out;
}

/* ---- 前向：返回每层的激活 ---- */
function forward(w, x){
  const acts = [x], nL = SIZES.length - 1;
  let a = x;
  for(let L = 0; L < nL; L++){
    const nIn = SIZES[L], nOut = SIZES[L + 1];
    const W = w[L * 2], b = w[L * 2 + 1];
    const o = new Float32Array(nOut);
    for(let j = 0; j < nOut; j++){
      let s = b[j];
      const base = j * nIn;
      for(let i = 0; i < nIn; i++) s += W[base + i] * a[i];
      o[j] = (L === nL - 1) ? s : (s > 0 ? s : 0);
    }
    acts.push(o); a = o;
  }
  return acts;
}
/* ---- 反向：交叉熵（软标签）+ label smoothing + 梯度裁剪 ---- */
function backward(w, acts, p, gradOut){
  const nL = SIZES.length - 1;
  const grads = [];
  for(let L = 0; L < nL; L++) grads.push([new Float32Array(SIZES[L + 1] * SIZES[L]), new Float32Array(SIZES[L + 1])]);
  /* 输出层：softmax 交叉熵的 dL/dlogits = (softmax(logits) − target) */
  const logits = acts[nL];
  let mx = -Infinity;
  for(let i = 0; i < N_OUT; i++) if(logits[i] > mx) mx = logits[i];
  let sum = 0;
  const sm = new Float32Array(N_OUT);
  for(let i = 0; i < N_OUT; i++){ const e = Math.exp(logits[i] - mx); sm[i] = e; sum += e; }
  for(let i = 0; i < N_OUT; i++) sm[i] /= (sum || 1);
  if(globalThis.__DBG){
    let nb = 0, np = 0;
    for(let i = 0; i < N_OUT; i++){ if(!isFinite(sm[i])) nb++; if(p[i] != null && !isFinite(p[i])) np++; }
    console.log('  [dbg] sm 非有限 ' + nb + '，p 非有限 ' + np + '，sum=' + sum + '，mx=' + mx +
                '，logits[0..2]=' + logits[0] + ',' + logits[1] + ',' + logits[2] +
                '，p[0..2]=' + p[0] + ',' + p[1] + ',' + p[2] + '，p.len=' + (p && p.length));
  }
  for(let i = 0; i < N_OUT; i++) gradOut[i] = (sm[i] - p[i]);   // 批内求和，批末再除以 batch
  for(let L = nL - 1; L >= 0; L--){
    const nIn = SIZES[L], nOut = SIZES[L + 1];
    const gW = grads[L][0], gb = grads[L][1];
    const dOut = gradOut;
    if(globalThis.__DBG){
      let bad = 0; for(let j = 0; j < nOut; j++) if(!isFinite(dOut[j])) bad++;
      if(bad) console.log('  [dbg] 层 L=' + L + ' 的 dOut 有 ' + bad + ' 个非有限值；前 3 个：' +
        dOut[0] + ',' + dOut[1] + ',' + dOut[2] + '；acts[L][0]=' + acts[L][0] +
        '；w[L*2][0]=' + w[L*2][0]);
    }
    const dIn = new Float32Array(nIn);
    for(let j = 0; j < nOut; j++){
      const g = dOut[j];
      if(g === 0) continue;
      gb[j] += g;
      const base = j * nIn;
      for(let i = 0; i < nIn; i++) gW[base + i] += g * acts[L][i];
    }
    if(L > 0){
      /* 隐层：dL/dx = Wᵀ·dOut，再乘 ReLU 导数（按**激活值**是否 >0，
         不能按梯度符号 —— 梯度负但激活正的情况很常见） */
      for(let i = 0; i < nIn; i++){
        let s = 0;
        for(let j = 0; j < nOut; j++) s += dOut[j] * w[L * 2][j * nIn + i];
        dIn[i] = acts[L][i] > 0 ? s : 0;
      }
    }
    gradOut = dIn;
  }
  return grads;
}

function main(){
  const dataPath = path.resolve(ROOT, argOf('--data', 'data/hip/teacher-v1.ndjson'));
  const outPath = path.resolve(ROOT, argOf('--out', 'js/hip-weights.js'));
  const epochs = parseInt(argOf('--epochs', '30'), 10);
  const lr = parseFloat(argOf('--lr', '0.002'));
  const batch = parseInt(argOf('--batch', '64'), 10);
  const smooth = parseFloat(argOf('--smooth', '0.03'), 10);
  const seed = parseInt(argOf('--seed', '20261004'), 10);
  const validFrac = parseFloat(argOf('--valid', '0.1'), 10);
  const clip = parseFloat(argOf('--clip', '2'), 10);

  if(!fs.existsSync(dataPath)){ console.error('数据文件不存在：' + dataPath); process.exit(2); }
  const lines = fs.readFileSync(dataPath, 'utf8').split('\n').filter(Boolean);
  console.log('读入样本 ' + lines.length + ' 条');
  const data = lines.map(l => JSON.parse(l));
  const rng = mulberry32(seed);
  /* 打散 + 切分 */
  for(let i = data.length - 1; i > 0; i--){ const j = Math.floor(rng() * (i + 1)); const t = data[i]; data[i] = data[j]; data[j] = t; }
  const nValid = Math.max(16, Math.floor(data.length * validFrac));
  const valid = data.slice(0, nValid), train = data.slice(nValid);
  console.log('训练 ' + train.length + ' / 验证 ' + valid.length);

  const w = initWeights(mulberry32(seed + 1));
  /* Adam 状态 */
  const m = [], v = [];
  for(let i = 0; i < w.length; i++){ m.push(new Float32Array(w[i].length)); v.push(new Float32Array(w[i].length)); }
  let tStep = 0;
  const b1 = 0.9, b2 = 0.999, eps = 1e-8;

  const evalSet = (set) => {
    let loss = 0, top1 = 0;
    for(const s of set){
      const acts = forward(w, s.f);
      const logits = acts[acts.length - 1];
      let mx = -Infinity;
      for(let i = 0; i < N_OUT; i++) if(logits[i] > mx) mx = logits[i];
      let sum = 0;
      const sm = new Float32Array(N_OUT);
      for(let i = 0; i < N_OUT; i++){ const e = Math.exp(logits[i] - mx); sm[i] = e; sum += e; }
      for(let i = 0; i < N_OUT; i++) sm[i] /= (sum || 1);
      for(let i = 0; i < N_OUT; i++){
        const t = s.p[i] * (1 - smooth) + (smooth / N_OUT);
        if(t > 0) loss -= t * Math.log(Math.max(sm[i], 1e-9));
      }
      let bi = 0, bv = -Infinity;
      for(let i = 0; i < N_OUT; i++) if(sm[i] > bv){ bv = sm[i]; bi = i; }
      if(bi === s.top) top1++;
    }
    return { loss: loss / Math.max(1, set.length), top1: top1 / Math.max(1, set.length) };
  };

  const before = evalSet(valid);
  console.log('训练前：验证 loss ' + before.loss.toFixed(4) + '  top1 ' + (before.top1 * 100).toFixed(1) + '%');

  const t0 = Date.now();
  for(let ep = 0; ep < epochs; ep++){
    /* 洗牌 */
    for(let i = train.length - 1; i > 0; i--){ const j = Math.floor(rng() * (i + 1)); const t = train[i]; train[i] = train[j]; train[j] = t; }
    for(let s0 = 0; s0 < train.length; s0 += batch){
      const s1 = Math.min(train.length, s0 + batch);
      const bs = s1 - s0;
      const grads = [];
      for(let L = 0; L < SIZES.length - 1; L++) grads.push([new Float32Array(SIZES[L + 1] * SIZES[L]), new Float32Array(SIZES[L + 1])]);
      for(let b = s0; b < s1; b++){
        const smp = train[b];
        const acts = forward(w, smp.f);
        if(globalThis.__DBG){
          let bad = 0;
          for(let L = 1; L < acts.length; L++) for(let i = 0; i < acts[L].length; i++) if(!isFinite(acts[L][i])) bad++;
          if(bad){
            console.log('  [dbg] 样本 #' + b + ' 前向有 ' + bad + ' 个非有限激活；f=' +
                        JSON.stringify(smp.f) + '；p[0..3]=' + JSON.stringify(smp.p.slice(0, 4)));
          }
        }
        const g = backward(w, acts, smp.p, new Float32Array(N_OUT));
        for(let L = 0; L < grads.length; L++){
          /* ★ 必须取 g[L]，不是 g[0]：层间梯度形状不同，
           *   读越界会得到 undefined → NaN（一度整个训练 loss=NaN）。 */
          const gW = grads[L][0], gb = grads[L][1], sW = g[L][0], sb = g[L][1];
          for(let i = 0; i < gW.length; i++) gW[i] += sW[i];
          for(let i = 0; i < gb.length; i++) gb[i] += sb[i];
        }
      }
      /* 批内求和 → 除以 batch size（梯度尺度） */
      const inv = 1 / Math.max(1, (s1 - s0));
      for(const g of grads) for(const a of g) for(let i = 0; i < a.length; i++) a[i] *= inv;
      if(globalThis.__DBG){
        let mx = 0, nan = 0, inf = 0;
        for(const g of grads) for(const a of g) for(let i = 0; i < a.length; i++){
          const v = a[i];
          if(Number.isNaN(v)) nan++; else if(!isFinite(v)) inf++; else if(Math.abs(v) > mx) mx = Math.abs(v);
        }
        console.log('  [dbg] 批 s0=' + s0 + ' 梯度 max|g|=' + mx.toExponential(3) + ' nan=' + nan + ' inf=' + inf);
      }
      /* 梯度裁剪（全局 2-范数） */
      let gn = 0, gnan = 0;
      for(const g of grads){ for(const a of g) for(let i = 0; i < a.length; i++){ const v = a[i]; if(!isFinite(v)) gnan++; else gn += v * v; } }
      if(gnan){ console.log('  [dbg] 梯度里有 NaN/Inf：' + gnan); }
      gn = Math.sqrt(gn);
      const scale = (gn > clip) ? (clip / (gn || 1)) : 1;
      /* Adam 更新 */
      tStep++;
      const bc1 = 1 - Math.pow(b1, tStep), bc2 = 1 - Math.pow(b2, tStep);
      for(let L = 0; L < SIZES.length - 1; L++){
        for(const arr of [grads[L][0], grads[L][1]]){
          const idx = (arr === grads[L][0]) ? L * 2 : L * 2 + 1;
          const p = w[idx], mm = m[idx], vv = v[idx];
          for(let i = 0; i < arr.length; i++){
            const g = arr[i] * scale;
            mm[i] = b1 * mm[i] + (1 - b1) * g;
            vv[i] = b2 * vv[i] + (1 - b2) * g * g;
            p[i] -= lr * (mm[i] / bc1) / (Math.sqrt(vv[i] / bc2) + eps);
          }
        }
      }
    }
    if(ep % 5 === 0 || ep === epochs - 1){
      const e = evalSet(valid);
      console.log('  epoch ' + (ep + 1) + '/' + epochs + '  验证 loss ' + e.loss.toFixed(4) +
                  '  top1 ' + (e.top1 * 100).toFixed(1) + '%  (' + ((Date.now() - t0) / 1000).toFixed(1) + 's)');
    }
  }

  const after = evalSet(valid);
  const tr = evalSet(train.slice(0, Math.min(500, train.length)));
  console.log('训练后：验证 loss ' + after.loss.toFixed(4) + '  top1 ' + (after.top1 * 100).toFixed(1) +
              '%  （训练集 top1 ' + (tr.top1 * 100).toFixed(1) + '%）');

  /* ---- 烘焙 ---- */
  const fw = flat(w);
  const json = JSON.stringify({ sizes: SIZES, w: fw.map(v => Math.round(v * 1e5) / 1e5) });
  const meta = { version: 1, trainedAt: new Date().toISOString().slice(0, 10),
                 src: path.relative(ROOT, dataPath), nSamples: data.length,
                 validLoss: +after.loss.toFixed(4), validTop1: +after.top1.toFixed(4),
                 trainTop1: +tr.top1.toFixed(4), nFeat: N_IN, nIntent: N_OUT };
  const out = '/* 自动生成：tools/hip-train.js —— HIP L2 策略网络（CE 蒸馏）\n' +
    ' * 勿手改；重训命令见 docs/reports/hip-m1-findings.md\n */\n' +
    'const HIP_WEIGHTS = ' + json + ';\n' +
    'const HIP_WEIGHTS_META = ' + JSON.stringify(meta) + ';\n' +
    'if(typeof module !== "undefined" && module.exports) module.exports = { HIP_WEIGHTS, HIP_WEIGHTS_META };\n';
  fs.writeFileSync(outPath, out);
  console.log('已写出 ' + path.relative(ROOT, outPath) + '（' + (out.length / 1024).toFixed(0) + ' KB）');
}
main();
