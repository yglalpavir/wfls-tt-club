/* =====================================================================
 *  live-cma-residual.js — R5b v2：CMA-ES 式进化策略（替代策略梯度）
 * =====================================================================
 *  v1（策略梯度）判决：管线通，算法噪声太大（60 局训练后 66.7% vs 基线
 *  73.6%——MC 回报方差压过梯度信号）。
 *  v2：把残差参数空间当连续优化问题，用 (μ,λ)-进化策略：
 *    · 个体 = (dMy, dSw)（2 维，范围 ±0.06）；
 *    · 每代 λ=6 个个体，每个体评 6 局（同种子起点）取均值；
 *    · 按排名加权更新均值 μ 与步长 σ（CMA-ES 的 rank-one 简化版）；
 *    · 评估用「同种子对局」 ⇒ 个体间比较是配对的（方差大幅降低）。
 *  这是 R1 已证有效的「在环搜索」的连续参数版，但配对评估降噪。
 * ===================================================================== */
'use strict';
const vm = require('vm');
const { buildRig } = require('./live-rig.js');

const GEN = parseInt((process.argv[2] || '10'), 10);
const LAMBDA = 6;
const GAMES_PER = 6;
const SEED = 20261004;
const OPP = process.argv[3] || 'nemesis';
const RANGE = 0.06;

const rig = buildRig({ controller: 'hip', moveCap: 2.0 });
rig.setOpp(OPP);
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

function setR(dM, dS){ vm.runInContext('globalThis.__resid.dMy=' + dM + '; globalThis.__resid.dSw=' + dS + ';', rig.ctx); }
function score(dM, dS){
  setR(dM, dS);
  let pts = 0, tot = 0;
  for(let g = 0; g < GAMES_PER; g++){
    const r = rig.playGame(SEED, g, 120);
    pts += r.you; tot += r.you + r.ai;
  }
  return tot ? pts / tot : 0.5;
}

let mu = [0, 0], sigma = 0.03;
console.log('[cma] opp=' + OPP + ' gen=' + GEN + ' lambda=' + LAMBDA + ' games/ind=' + GAMES_PER);
const base = score(0, 0);
console.log('base (0,0): ' + (base * 100).toFixed(1) + '%');
let best = { x: [0, 0], s: base };
let rng = 987654321;
const rnd = () => { rng = (rng * 1103515245 + 12345) & 0x7fffffff; return rng / 0x7fffffff; };
const gauss = () => { let u = 0, v = 0; while(u === 0) u = rnd(); while(v === 0) v = rnd(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };

for(let gen = 0; gen < GEN; gen++){
  const pop = [];
  for(let i = 0; i < LAMBDA; i++){
    const x = [mu[0] + sigma * gauss(), mu[1] + sigma * gauss()];
    x[0] = Math.max(-RANGE, Math.min(RANGE, x[0]));
    x[1] = Math.max(-RANGE, Math.min(RANGE, x[1]));
    const s = score(x[0], x[1]);
    pop.push({ x, s });
  }
  pop.sort((a, b) => b.s - a.s);
  const w = [0.4, 0.25, 0.15, 0.1, 0.07, 0.03];
  let nMu = [0, 0];
  pop.forEach((p, i) => { nMu[0] += w[i] * p.x[0]; nMu[1] += w[i] * p.x[1]; });
  mu = nMu;
  sigma = Math.max(0.008, sigma * 0.92);
  if(pop[0].s > best.s) best = { x: pop[0].x, s: pop[0].s };
  console.log('[gen ' + gen + '] best=' + (pop[0].s * 100).toFixed(1) + '% (' + pop[0].x.map(v => v.toFixed(3)).join(',') + ')' +
              '  worst=' + (pop[5].s * 100).toFixed(1) + '%' +
              '  mu=' + mu.map(v => v.toFixed(3)).join(',') + ' sigma=' + sigma.toFixed(3));
}
console.log('[done] best=' + (best.s * 100).toFixed(1) + '% at ' + best.x.map(v => v.toFixed(3)).join(',') +
            '  (base ' + (base * 100).toFixed(1) + '%)');
