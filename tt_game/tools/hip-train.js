/* =====================================================================
 *  hip-train.js — HIP L2：意图策略网络的**交叉熵蒸馏**训练器
 *
 *  数据格式（每行一条 ndjson，由 tools/hip-teacher.js 产出）：
 *    { f: [28 维特征], ph: { place:[7], depth:[4], stroke:[6], ctrl:[2] }, top: 意图 id }
 *  —— 标签是**分头**的软标签：每个头在自己的维度上做 softmax（温度由教师定）。
 *    早期版本用 336 路单头 + 三档离散分数，标签几乎是平的
 *    （实测平均最大概率 0.026、熵 4.24/5.82），学出来 top1 只有噪声水平 → 必须分头。
 *
 *  网络：28 → 96 → 128 → 128 → 19（4 个头的 logits 拼接）
 *  损失：4 段各自的 softmax CE 之和（label smoothing + 全局梯度裁剪 + Adam）
 *
 *  已知坑（保留注释以免重犯）：
 *   - 批内梯度累加必须取 g[L]，不能取 g[0]：层间梯度形状不同，
 *     越界读到 undefined → 整个梯度 NaN → loss 永远 NaN。
 *   - 隐层 ReLU 导数按**激活值**是否 >0 判定，不能按梯度符号。
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

const N_IN = HIP_INTENT.N_FEAT;
const N_OUT = HIP_INTENT.N_OUT_HEAD;          // 19 = 7+4+6+2
const SIZES = [N_IN, 96, 128, 128, N_OUT];
const HEADS = HIP_INTENT.headSlices();          // [{key,off,n}]

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
function forward(w, x){
  const acts = [x], nL = SIZES.length - 1;
  for(let L = 0; L < nL; L++){
    const nIn = SIZES[L], nOut = SIZES[L + 1];
    const W = w[L * 2], b = w[L * 2 + 1];
    const o = new Float32Array(nOut);
    for(let j = 0; j < nOut; j++){
      let s = b[j];
      const base = j * nIn;
      for(let i = 0; i < nIn; i++) s += W[base + i] * x[i];
      o[j] = (L === nL - 1) ? s : (s > 0 ? s : 0);
    }
    acts.push(o);
    x = o;
  }
  return acts;
}

/* 逐头 softmax：返回 [[{p:[]},...]]（每个头一段） */
function headSoftmax(logits){
  const out = [];
  for(const h of HEADS){
    let mx = -Infinity;
    for(let i = 0; i < h.n; i++){ const v = logits[h.off + i]; if(v > mx) mx = v; }
    let sum = 0;
    const p = new Float32Array(h.n);
    for(let i = 0; i < h.n; i++){ const e = Math.exp(logits[h.off + i] - mx); p[i] = e; sum += e; }
    for(let i = 0; i < h.n; i++) p[i] /= (sum || 1);
    out.push(p);
  }
  return out;
}

function backward(w, acts, tgt, gradOut){
  const nL = SIZES.length - 1;
  const grads = [];
  for(let L = 0; L < nL; L++) grads.push([new Float32Array(SIZES[L + 1] * SIZES[L]), new Float32Array(SIZES[L + 1])]);
  /* 输出层：逐头 dL/dlogits = (softmax(该头) − 该头目标) */
  const logits = acts[nL];
  const sm = headSoftmax(logits);
  for(let h = 0; h < HEADS.length; h++){
    const H = HEADS[h], p = sm[h], t = tgt[h];
    for(let i = 0; i < H.n; i++){
      gradOut[H.off + i] = (p[i] - (t && t[i] != null ? t[i] : 0));
    }
  }
  for(let L = nL - 1; L >= 0; L--){
    const nIn = SIZES[L], nOut = SIZES[L + 1];
    const gW = grads[L][0], gb = grads[L][1];
    let dOut = gradOut;
    const dIn = new Float32Array(nIn);
    for(let j = 0; j < nOut; j++){
      const g = dOut[j];
      if(g === 0) continue;
      gb[j] += g;
      const base = j * nIn;
      for(let i = 0; i < nIn; i++) gW[base + i] += g * acts[L][i];
    }
    if(L > 0){
      /* 隐层：dL/dx = Wᵀ·dOut，再乘 ReLU 导数（按**激活值**是否 >0） */
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
  const dataPath = path.resolve(ROOT, argOf('--data', 'data/hip/teacher-v2.ndjson'));
  const outPath = path.resolve(ROOT, argOf('--out', 'js/hip-weights.js'));
  const epochs = parseInt(argOf('--epochs', '40'), 10);
  const lr = parseFloat(argOf('--lr', '0.002'));
  const batch = parseInt(argOf('--batch', '64'), 10);
  const smooth = parseFloat(argOf('--smooth', '0.03'), 10);
  const seed = parseInt(argOf('--seed', '20261004'), 10);
  const validFrac = parseFloat(argOf('--valid', '0.12'), 10);
  const clip = parseFloat(argOf('--clip', '2'), 10);

  if(!fs.existsSync(dataPath)){ console.error('数据文件不存在：' + dataPath); process.exit(2); }
  const lines = fs.readFileSync(dataPath, 'utf8').split('\n').filter(Boolean);
  console.log('读入样本 ' + lines.length + ' 条');
  const raw = lines.map(l => JSON.parse(l));
  /* 标签归一化：ph 的每个头 → 概率数组（教师已给概率；若是计数则归一化） */
  const data = [];
  let bad = 0;
  for(const s of raw){
    if(!s.ph || !s.f){ bad++; continue; }
    const tgt = [];
    for(const h of HEADS){
      const arr = s.ph[h.key];
      if(!arr){ bad++; tgt.push(null); continue; }
      let sum = 0; for(const v of arr) sum += v;
      if(!(sum > 0)){ tgt.push(null); continue; }
      const p = new Float32Array(h.n);
      for(let i = 0; i < h.n; i++) p[i] = arr[i] / sum;
      tgt.push(p);
    }
    data.push({ f: s.f, tgt, top: s.top, w: s.w != null ? s.w : 1 });
  }
  if(bad) console.log('跳过 ' + bad + ' 条缺标签/缺特征的样本');
  if(!data.length){ console.error('没有可用样本'); process.exit(2); }

  const rng = mulberry32(seed);
  for(let i = data.length - 1; i > 0; i--){ const j = Math.floor(rng() * (i + 1)); const t = data[i]; data[i] = data[j]; data[j] = t; }
  const nValid = Math.max(16, Math.floor(data.length * validFrac));
  const valid = data.slice(0, nValid), train = data.slice(nValid);
  console.log('训练 ' + train.length + ' / 验证 ' + valid.length + '；输出维度 ' + N_OUT + '（' +
              HEADS.map(h => h.key + ':' + h.n).join(' ') + '）');

  const w = initWeights(mulberry32(seed + 1));
  const m = [], v = [];
  for(let i = 0; i < w.length; i++){ m.push(new Float32Array(w[i].length)); v.push(new Float32Array(w[i].length)); }
  let tStep = 0;
  const b1 = 0.9, b2 = 0.999, eps = 1e-8;

  const evalSet = (set) => {
    let loss = 0, n = 0;
    const top1 = HEADS.map(() => 0), topN = HEADS.map(() => 0);
    let combo = 0;
    for(const s of set){
      const acts = forward(w, s.f);
      const logits = acts[acts.length - 1];
      const sm = headSoftmax(logits);
      const sel = [];
      for(let h = 0; h < HEADS.length; h++){
        const H = HEADS[h], p = sm[h];
        let bi = 0, bv = -Infinity;
        for(let i = 0; i < H.n; i++) if(p[i] > bv){ bv = p[i]; bi = i; }
        sel.push(bi);
        const t = s.tgt[h];
        if(t){
          for(let i = 0; i < H.n; i++){
            const tt = t[i] * (1 - smooth) + (smooth / H.n);
            if(tt > 0) loss -= tt * Math.log(Math.max(p[i], 1e-9));
          }
          /* 该头的 top1：学生的 argmax 是否落在教师 top-3 里（软标签无法严格比 argmax） */
          let ti = 0, tv = -Infinity;
          for(let i = 0; i < H.n; i++) if(t[i] > tv){ tv = t[i]; ti = i; }
          if(bi === ti) top1[h]++;
          const ord = Array.from({ length: H.n }, (_, i) => i).sort((a, b) => t[b] - t[a]);
          if(ord.slice(0, 3).indexOf(bi) >= 0) topN[h]++;
        }
        n++;
      }
      if(s.top != null){
        const id = HIP_INTENT.fromHeads(sel);
        if(id === s.top) combo++;
      }
    }
    const N = Math.max(1, set.length);
    return { loss: loss / N, top1: top1.map(x => x / N), top3: topN.map(x => x / N), combo: combo / N };
  };
  const fmtEval = (e) => 'loss ' + e.loss.toFixed(4) + '  ' +
    HEADS.map((h, i) => h.key + ' top1 ' + (e.top1[i] * 100).toFixed(1) + '%').join('  ') +
    '  组合 top1 ' + (e.combo * 100).toFixed(1) + '%';

  const before = evalSet(valid);
  console.log('训练前：验证 ' + fmtEval(before));

  const t0 = Date.now();
  for(let ep = 0; ep < epochs; ep++){
    for(let i = train.length - 1; i > 0; i--){ const j = Math.floor(rng() * (i + 1)); const t = train[i]; train[i] = train[j]; train[j] = t; }
    for(let s0 = 0; s0 < train.length; s0 += batch){
      const s1 = Math.min(train.length, s0 + batch);
      const grads = [];
      for(let L = 0; L < SIZES.length - 1; L++) grads.push([new Float32Array(SIZES[L + 1] * SIZES[L]), new Float32Array(SIZES[L + 1])]);
      for(let b = s0; b < s1; b++){
        const smp = train[b];
        const acts = forward(w, smp.f);
        const g = backward(w, acts, smp.tgt, new Float32Array(N_OUT));
        for(let L = 0; L < grads.length; L++){
          /* ★ 必须取 g[L]，不是 g[0]：层间梯度形状不同，越界读 undefined → NaN */
          const gW = grads[L][0], gb = grads[L][1], sW = g[L][0], sb = g[L][1];
          for(let i = 0; i < gW.length; i++) gW[i] += sW[i];
          for(let i = 0; i < gb.length; i++) gb[i] += sb[i];
        }
      }
      const inv = 1 / Math.max(1, (s1 - s0));
      for(const g of grads) for(const a of g) for(let i = 0; i < a.length; i++) a[i] *= inv;
      /* 梯度裁剪（全局 2-范数） */
      let gn = 0;
      for(const g of grads){ for(const a of g) for(let i = 0; i < a.length; i++){ const v = a[i]; if(isFinite(v)) gn += v * v; } }
      gn = Math.sqrt(gn);
      const scale = (gn > clip) ? (clip / (gn || 1)) : 1;
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
      console.log('  epoch ' + (ep + 1) + '/' + epochs + '  验证 ' + fmtEval(e) + '  (' + ((Date.now() - t0) / 1000).toFixed(1) + 's)');
    }
  }

  const after = evalSet(valid);
  const tr = evalSet(train.slice(0, Math.min(600, train.length)));
  console.log('训练后：验证 ' + fmtEval(after));
  console.log('        训练集 ' + fmtEval(tr));

  /* ---- 烘焙 ---- */
  const fw = flat(w);
  const json = JSON.stringify({ sizes: SIZES, w: fw.map(v => Math.round(v * 1e5) / 1e5) });
  const meta = { version: 1, trainedAt: new Date().toISOString().slice(0, 10),
                 src: path.relative(ROOT, dataPath), nSamples: data.length,
                 validLoss: +after.loss.toFixed(4),
                 validTop1: Object.fromEntries(HEADS.map((h, i) => [h.key, +after.top1[i].toFixed(4)])),
                 validTop3: Object.fromEntries(HEADS.map((h, i) => [h.key, +after.top3[i].toFixed(4)])),
                 comboTop1: +after.combo.toFixed(4),
                 trainTop1: Object.fromEntries(HEADS.map((h, i) => [h.key, +tr.top1[i].toFixed(4)])),
                 nFeat: N_IN, nOut: N_OUT, heads: HEADS.map(h => ({ key: h.key, n: h.n })) };
  const out = '/* 自动生成：tools/hip-train.js —— HIP L2 策略网络（4 头 CE 蒸馏）\n' +
    ' * 勿手改；重训命令见 docs/reports/hip-m2-findings.md\n */\n' +
    'const HIP_WEIGHTS = ' + json + ';\n' +
    'const HIP_WEIGHTS_META = ' + JSON.stringify(meta) + ';\n' +
    'if(typeof module !== "undefined" && module.exports) module.exports = { HIP_WEIGHTS, HIP_WEIGHTS_META };\n';
  fs.writeFileSync(outPath, out);
  console.log('已写出 ' + path.relative(ROOT, outPath) + '（' + (out.length / 1024).toFixed(0) + ' KB）');
}
main();
