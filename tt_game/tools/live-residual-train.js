/* =====================================================================
 *  live-residual-train.js — R5b v1：解析骨架 + 学习残差（my/sw 通道）
 * =====================================================================
 *  架构（设计约束见 hip-framework.md §1.18.11 §11）：
 *    · 骨架 = hip-skill plan()（不动，安全兜底）；
 *    · 残差 = 小 MLP（输入：obs 16 维关键子集 + 对手上下文 4 维；
 *      输出：dMy, dSw ∈ [−0.06, +0.06]），加在 plan 输出的 my/sw 上；
 *    · 训练 = REINFORCE-with-baseline：每局 MC 回报 z = (you−ai)/10，
 *      对局内每帧 log-prob 加权 z（高斯策略，σ 固定 0.03）；
 *    · 残差 = 0 ⇒ 逐位退化为现状（MLP 输出恒 0 初始化）。
 *
 *  流程（在线闭环，同进程）：
 *    for each game:
 *      1. 用当前残差策略打一局（先 ε-greedy：概率 ε 用 σ=0.03 高斯探索）；
 *      2. 局末用 z 更新 MLP（每帧一条梯度，Adam lr 3e-4）；
 *      3. 每 EVAL_EVERY 局做一次「无探索」评估（50 局 CLI 前先在环粗看）。
 *  纪律：本脚本只在环粗看；任何进 DEFAULTS 的决定必须 CLI ≥100 局 × 多种子。
 * ===================================================================== */
'use strict';
const vm = require('vm');
const { buildRig } = require('./live-rig.js');

const GAMES = parseInt((process.argv[2] || '60'), 10);
const SEED = 20261004;
const OPP = process.argv[3] || 'nemesis';
const SIGMA = 0.03;
const EPS = 0.15;
const LR = 3e-4;
const IN_N = 20;    // 16 obs + 4 ctx
const HID = 24;
const OUT_N = 2;    // dMy, dSw

/* ---- 极简 MLP（前向 + 反向，Adam）——与 dqn.js 同构但独立，避免耦合 ---- */
function mlpInit(sizes, rng){
  const w = [];
  for(let l = 1; l < sizes.length; l++){
    const W = [], nIn = sizes[l - 1], nOut = sizes[l];
    for(let j = 0; j < nOut; j++){
      const row = new Float64Array(nIn);
      for(let i = 0; i < nIn; i++) row[i] = (rng() * 2 - 1) * Math.sqrt(2 / nIn);
      W.push(row);
    }
    w.push({ W, b: new Float64Array(nOut),
             mW: null, vW: null, mb: null, vb: null, t: 0 });
  }
  return w;
}
function forward(w, x){
  const acts = [x];
  for(let l = 0; l < w.length; l++){
    const { W, b } = w[l], prev = acts[acts.length - 1];
    const y = new Float64Array(W.length);
    for(let j = 0; j < W.length; j++){
      let s = b[j];
      const row = W[j];
      for(let i = 0; i < row.length; i++) s += row[i] * prev[i];
      y[j] = (l === w.length - 1) ? s : Math.max(0, s);   // 末层线性，隐层 ReLU
    }
    acts.push(y);
  }
  return acts;
}
function adamStep(w, grads, lr){
  for(let l = 0; l < w.length; l++){
    const L = w[l], g = grads[l];
    if(!L.mW){ L.mW = L.W.map(r => new Float64Array(r.length)); L.vW = L.W.map(r => new Float64Array(r.length));
               L.mb = new Float64Array(L.b.length); L.vb = new Float64Array(L.b.length); }
    L.t++;
    const b1 = 0.9, b2 = 0.999, e = 1e-8;
    const c1 = 1 - Math.pow(b1, L.t), c2 = 1 - Math.pow(b2, L.t);
    for(let j = 0; j < L.W.length; j++){
      const row = L.W[j], gW = g.gW[j], m = L.mW[j], v = L.vW[j];
      for(let i = 0; i < row.length; i++){
        m[i] = b1 * m[i] + (1 - b1) * gW[i];
        v[i] = b2 * v[i] + (1 - b2) * gW[i] * gW[i];
        row[i] -= lr * (m[i] / c1) / (Math.sqrt(v[i] / c2) + e);
      }
      L.mb[j] = b1 * L.mb[j] + (1 - b1) * g.gb[j];
      L.vb[j] = b2 * L.vb[j] + (1 - b2) * g.gb[j] * g.gb[j];
      L.b[j] -= lr * (L.mb[j] / c1) / (Math.sqrt(L.vb[j] / c2) + e);
    }
  }
}
/* 对每局做一次策略梯度反向（帧级累计梯度，乘 z） */
function accumulate(w, frames, z, grads){
  for(const f of frames){
    const acts = forward(w, f.x);
    const out = acts[acts.length - 1];
    /* 高斯对角策略：mu = out（tanh 压缩），sigma 固定 */
    for(let k = 0; k < OUT_N; k++){
      const mu = Math.tanh(out[k]) * 0.06;
      const dlog = (f.a[k] - mu) / (SIGMA * SIGMA) * 0.06 * (1 - Math.tanh(out[k]) * Math.tanh(out[k]));
      const delta = [0, 0]; delta[k] = dlog * z;
      /* 反传：末层线性 → ReLU 链 */
      let cur = delta;
      for(let l = w.length - 1; l >= 0; l--){
        const L = w[l], prev = acts[l], gg = grads[l];
        const dPrev = new Float64Array(prev.length);
        for(let j = 0; j < L.W.length; j++){
          gg.gb[j] += cur[j];
          const row = L.W[j], gW = gg.gW[j];
          for(let i = 0; i < row.length; i++){
            gW[i] += cur[j] * prev[i];
            dPrev[i] += cur[j] * row[i];
          }
          if(l > 0) {} /* ReLU 导数在下游统一处理 */
        }
        if(l > 0){
          for(let i = 0; i < dPrev.length; i++) if(acts[l][i] <= 0) dPrev[i] = 0;
        }
        cur = dPrev;
      }
    }
  }
}

function zerosLike(w){
  return w.map(L => ({ gW: L.W.map(r => new Float64Array(r.length)), gb: new Float64Array(L.b.length) }));
}
function addInto(acc, g, scale){
  for(let l = 0; l < acc.length; l++){
    for(let j = 0; j < acc[l].gW.length; j++){
      const r = acc[l].gW[j];
      for(let i = 0; i < r.length; i++) r[i] += scale * g[l].gW[j][i];
    }
    for(let j = 0; j < acc[l].gb.length; j++) acc[l].gb[j] += scale * g[l].gb[j];
  }
}

function feats(obs, oppId){
  const ctx = [0, 0, 0, 0]; ctx[oppId] = 1;   // one-hot 对手（nemesis=0, hell=1, 其它=2, 留 1 空）
  return new Float64Array([
    obs.x || 0, obs.y || 0, obs.z || 0,
    (obs.vx || 0) * 0.2, (obs.vy || 0) * 0.1, (obs.vz || 0) * 0.1,
    (obs.sx || 0) * 0.01, (obs.sy || 0) * 0.01,
    obs.px || 0, ((obs.pz || 1.3) - 1.3), (obs.svx || 0) * 0.2, (obs.svz || 0) * 0.1,
    obs.tx || 0, obs.my || 0, obs.bounced || 0, obs.ox || 0,
    ctx[0], ctx[1], ctx[2], ctx[3]
  ]);
}

function main(){
  let s = 12345;
  const rng = () => { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x7fffffff; };
  const net = mlpInit([IN_N, HID, OUT_N], rng);
  const rig = buildRig({ controller: 'hip', moveCap: 2.0 });
  rig.setOpp(OPP);
  const oppId = OPP === 'nemesis' ? 0 : (OPP === 'hell' ? 1 : 2);

  /* 在 vm 里安装残差通道（读 __resid 全局） */
  vm.runInContext([
    'globalThis.__resid = { dMy: 0, dSw: 0, on: true };',
    'const __om = HIP_SKILL.makeController;',
    'HIP_SKILL.makeController = function(o){',
    '  const c = __om(o); const op = c.plan;',
    '  c.plan = function(obs){',
    '    const r = op(obs);',
    '    const R = globalThis.__resid;',
    '    if(R.on && r.my != null) r.my = Math.max(0.15, Math.min(0.95, r.my + R.dMy));',
    '    if(R.on && r.sw != null) r.sw = Math.max(-0.8, Math.min(0.8, r.sw + R.dSw));',
    '    return r;',
    '  };',
    '  return c;',
    '};',
    'TT_PLAYER.setController("hip");'
  ].join('\n'), rig.ctx);

  const evalRun = (n, tag) => {
    vm.runInContext('globalThis.__resid.on = false;', rig.ctx);
    let pts = 0, tot = 0;
    for(let g = 0; g < n; g++){
      const r = rig.playGame(SEED + 777, g, 120);
      pts += r.you; tot += r.you + r.ai;
    }
    vm.runInContext('globalThis.__resid.on = true;', rig.ctx);
    console.log('[eval ' + tag + '] ' + (tot ? (pts / tot * 100).toFixed(1) : '-') + '%  pts ' + pts + '/' + tot);
    return tot ? pts / tot : 0;
  };

  const base = evalRun(20, 'residual=0 baseline');
  console.log('[train] opp=' + OPP + ' games=' + GAMES + ' sigma=' + SIGMA + ' eps=' + EPS + ' lr=' + LR);
  for(let g = 0; g < GAMES; g++){
    /* 采样一局：先固定残差（本局的动作从轨迹里回填），探索在帧级 */
    const frames = [];
    const setResid = (dM, dS) => vm.runInContext('globalThis.__resid.dMy=' + dM + '; globalThis.__resid.dSw=' + dS + ';', rig.ctx);
    /* 逐局策略：本局用「帧级独立高斯」不可行（resid 是全局常量），改用
     * 局级采样：本局 dMy/dSw 从 N(0, SIGMA) 抽一次（bandit 式），帧不变。 */
    const useExp = rng() < EPS || g < 4;
    const dMy = useExp ? (rng() * 2 - 1) * 0.06 : Math.tanh(forward(net, zerosFeat(oppId))[2][0]) * 0.06;
    const dSw = useExp ? (rng() * 2 - 1) * 0.06 : Math.tanh(forward(net, zerosFeat(oppId))[2][1]) * 0.06;
    setResid(dMy.toFixed(4), dSw.toFixed(4));
    const r = rig.playGame(SEED + 555, g, 120);
    const z = (r.you - r.ai) / 10;
    const x = zerosFeat(oppId);
    frames.push({ x, a: [dMy, dSw] });
    const grads = zerosLike(net);
    accumulate(net, frames, z, grads);
    adamStep(net, grads, LR);
    if(g % 10 === 9) console.log('[g' + (g + 1) + '] z=' + z.toFixed(1) + ' dMy=' + dMy.toFixed(3) + ' dSw=' + dSw.toFixed(3) +
                                (useExp ? ' (explore)' : ''));
  }
  const after = evalRun(20, 'after-train');
  console.log('[done] base=' + (base * 100).toFixed(1) + '% after=' + (after * 100).toFixed(1) + '%');
}
function zerosFeat(oppId){
  const f = new Float64Array(20);
  f[16 + oppId] = 1;
  return f;
}
main();
