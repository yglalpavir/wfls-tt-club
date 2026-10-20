/* =====================================================================
 *  hip-choice-train.js — HIP L2'：安全动作集策略网络的 CE 蒸馏训练器
 *
 *  数据（tools/hip-choice-teacher.js 产出，每行一条）：
 *    { f: [28 维特征], p: [K 维软标签], top: 最优选项 id }
 *
 *  网络：28 → 96 → 128 → 128 → K（单头 softmax）
 *  损失：softmax CE + label smoothing + 全局梯度裁剪 + Adam
 *
 *  与 hip-train.js（4 头）的关系：本训练器是**单头**版本——
 *  动作空间已经从 336 类原始意图收缩成 K 个实机验证过的安全选项，
 *  一次分类即可，不需要分头。
 *
 *  已知坑（沿用 hip-train.js 的教训）：
 *   - 批内梯度累加必须取 g[L]，不能取 g[0]（层间形状不同 → undefined → NaN）
 *   - 隐层 ReLU 导数按**激活值**是否 >0 判定
 * ===================================================================== */
'use strict';
const path = require('path');
const fs = require('fs');

const ROOT = path.join(__dirname, '..');
const { HIP_INTENT } = require(path.join(ROOT, 'js', 'hip-intent.js'));
const { HIP_CHOICE } = require(path.join(ROOT, 'js', 'hip-choice.js'));

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

const N_IN = HIP_INTENT.N_FEAT;
const N_OUT = HIP_CHOICE.N_OPT;
const SIZES = [N_IN, 96, 128, 128, N_OUT];

function initWeights(rng){
  const w = [];
  for(let L = 0; L < SIZES.length - 1; L++){
    const nIn = SIZES[L], nOut = SIZES[L + 1];
    const W = new Float32Array(nOut * nIn);
    const sd = Math.sqrt(2 / nIn);
    for(let i = 0; i < W.length; i++) W[i] = (rng() * 2 - 1) * sd;
    const b = new Float32Array(nOut);
    w.push(W, b);
  }
  return w;
}
function flat(w){ const out = []; for(const a of w) for(let i = 0; i < a.length; i++) out.push(a[i]); return out; }
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
    acts.push(o); x = o;
  }
  return acts;
}
function softmax1(logits){
  let mx = -Infinity;
  for(let i = 0; i < logits.length; i++) if(logits[i] > mx) mx = logits[i];
  const p = new Float32Array(logits.length);
  let s = 0;
  for(let i = 0; i < logits.length; i++){ const e = Math.exp(logits[i] - mx); p[i] = e; s += e; }
  for(let i = 0; i < p.length; i++) p[i] /= (s || 1);
  return p;
}
function backward(w, acts, t, gradOut){
  const nL = SIZES.length - 1;
  const grads = [];
  for(let L = 0; L < nL; L++) grads.push([new Float32Array(SIZES[L + 1] * SIZES[L]), new Float32Array(SIZES[L + 1])]);
  const p = softmax1(acts[nL]);
  for(let i = 0; i < N_OUT; i++) gradOut[i] = p[i] - (t && t[i] != null ? t[i] : 0);
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
  const dataPath = path.resolve(ROOT, argOf('--data', 'data/hip/choice-v1.ndjson'));
  const outPath = path.resolve(ROOT, argOf('--out', 'js/hip-choice-weights.js'));
  const epochs = parseInt(argOf('--epochs', '40'), 10);
  const lr = parseFloat(argOf('--lr', '0.002'), 10);
  const batch = parseInt(argOf('--batch', '64'), 10);
  const smooth = parseFloat(argOf('--smooth', '0.03'), 10);
  const seed = parseInt(argOf('--seed', '20261004'), 10);
  const validFrac = parseFloat(argOf('--valid', '0.12'), 10);
  const clip = parseFloat(argOf('--clip', '2'), 10);

  if(!fs.existsSync(dataPath)){ console.error('数据文件不存在：' + dataPath); process.exit(2); }
  const lines = fs.readFileSync(dataPath, 'utf8').split('\n').filter(Boolean);
  const data = [];
  for(const l of lines){
    let s; try{ s = JSON.parse(l); }catch(e){ continue; }
    if(!s.f || !s.p) continue;
    let sum = 0; for(const v of s.p) sum += v;
    if(!(sum > 0)) continue;
    const t = new Float32Array(N_OUT);
    for(let i = 0; i < N_OUT; i++) t[i] = (s.p[i] || 0) / sum;
    data.push({ f: s.f, t, top: s.top });
  }
  if(!data.length){ console.error('没有可用样本'); process.exit(2); }
  console.log('读入样本 ' + data.length + ' 条，选项数 K=' + N_OUT);

  const rng = mulberry32(seed);
  for(let i = data.length - 1; i > 0; i--){ const j = Math.floor(rng() * (i + 1)); const tmp = data[i]; data[i] = data[j]; data[j] = tmp; }
  const nValid = Math.max(16, Math.floor(data.length * validFrac));
  const valid = data.slice(0, nValid), train = data.slice(nValid);

  const w = initWeights(mulberry32(seed + 1));
  const m = [], v = [];
  for(let i = 0; i < w.length; i++){ m.push(new Float32Array(w[i].length)); v.push(new Float32Array(w[i].length)); }
  let tStep = 0;
  const b1 = 0.9, b2 = 0.999, eps = 1e-8;

  const evalSet = (set) => {
    let loss = 0, top1 = 0, top3 = 0, n = 0;
    const perOpt = new Array(N_OUT).fill(0);
    for(const s of set){
      const acts = forward(w, s.f);
      const p = softmax1(acts[acts.length - 1]);
      for(let i = 0; i < N_OUT; i++){
        const tt = s.t[i] * (1 - smooth) + (smooth / N_OUT);
        if(tt > 0) loss -= tt * Math.log(Math.max(p[i], 1e-9));
      }
      let bi = 0, bv = -Infinity;
      for(let i = 0; i < N_OUT; i++) if(p[i] > bv){ bv = p[i]; bi = i; }
      let ti = 0, tv = -Infinity;
      for(let i = 0; i < N_OUT; i++) if(s.t[i] > tv){ tv = s.t[i]; ti = i; }
      if(bi === ti) top1++;
      const ord = Array.from({ length: N_OUT }, (_, i) => i).sort((a, b) => s.t[b] - s.t[a]);
      if(ord.slice(0, 3).indexOf(bi) >= 0) top3++;
      perOpt[bi]++;
      n++;
    }
    const N = Math.max(1, set.length);
    return { loss: loss / N, top1: top1 / N, top3: top3 / N, perOpt };
  };
  const fmtEval = (e) => 'loss ' + e.loss.toFixed(4) + '  top1 ' + (e.top1 * 100).toFixed(1) +
                        '%  top3 ' + (e.top3 * 100).toFixed(1) + '%';

  console.log('训练 ' + train.length + ' / 验证 ' + valid.length);
  console.log('训练前：验证 ' + fmtEval(evalSet(valid)));

  const t0 = Date.now();
  for(let ep = 0; ep < epochs; ep++){
    for(let i = train.length - 1; i > 0; i--){ const j = Math.floor(rng() * (i + 1)); const tmp = train[i]; train[i] = train[j]; train[j] = tmp; }
    for(let s0 = 0; s0 < train.length; s0 += batch){
      const s1 = Math.min(train.length, s0 + batch);
      const grads = [];
      for(let L = 0; L < SIZES.length - 1; L++) grads.push([new Float32Array(SIZES[L + 1] * SIZES[L]), new Float32Array(SIZES[L + 1])]);
      for(let b = s0; b < s1; b++){
        const smp = train[b];
        const acts = forward(w, smp.f);
        const g = backward(w, acts, smp.t, new Float32Array(N_OUT));
        for(let L = 0; L < grads.length; L++){
          const gW = grads[L][0], gb = grads[L][1], sW = g[L][0], sb = g[L][1];
          for(let i = 0; i < gW.length; i++) gW[i] += sW[i];
          for(let i = 0; i < gb.length; i++) gb[i] += sb[i];
        }
      }
      const inv = 1 / Math.max(1, (s1 - s0));
      for(const g of grads) for(const a of g) for(let i = 0; i < a.length; i++) a[i] *= inv;
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
      console.log('  epoch ' + (ep + 1) + '/' + epochs + '  验证 ' + fmtEval(evalSet(valid)) +
                  '  (' + ((Date.now() - t0) / 1000).toFixed(1) + 's)');
    }
  }

  const after = evalSet(valid);
  const tr = evalSet(train.slice(0, Math.min(600, train.length)));
  console.log('训练后：验证 ' + fmtEval(after));
  console.log('        训练集 ' + fmtEval(tr));
  console.log('验证集上学生的选项分布：');
  after.perOpt.forEach((c, i) => { if(c) console.log('  ' + HIP_CHOICE.OPTIONS[i].name.padEnd(8) + c); });

  const fw = flat(w);
  const json = JSON.stringify({ sizes: SIZES, w: fw.map(v => Math.round(v * 1e5) / 1e5) });
  const meta = { version: 1, trainedAt: new Date().toISOString().slice(0, 10),
                 src: path.relative(ROOT, dataPath), nSamples: data.length,
                 validLoss: +after.loss.toFixed(4),
                 validTop1: +after.top1.toFixed(4), validTop3: +after.top3.toFixed(4),
                 trainTop1: +tr.top1.toFixed(4),
                 nFeat: N_IN, nOut: N_OUT,
                 options: HIP_CHOICE.OPTIONS.map(o => o.name) };
  const out = '/* 自动生成：tools/hip-choice-train.js —— HIP L2\' 安全动作集策略网络（单头 CE 蒸馏）\n' +
    ' * 勿手改；重训命令见 docs/reports/hip-m2-findings.md\n */\n' +
    'const HIP_CHOICE_WEIGHTS = ' + json + ';\n' +
    'const HIP_CHOICE_WEIGHTS_META = ' + JSON.stringify(meta) + ';\n' +
    'if(typeof module !== "undefined" && module.exports) module.exports = { HIP_CHOICE_WEIGHTS, HIP_CHOICE_WEIGHTS_META };\n';
  fs.writeFileSync(outPath, out);
  console.log('已写出 ' + path.relative(ROOT, outPath) + '（' + (out.length / 1024).toFixed(0) + ' KB）');
}
main();
