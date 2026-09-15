'use strict';
const PP = require('../js/policy.js');
const SIM = require('../js/simcore.js'); global.SIM = SIM; global.P = PP;
const IS = require('../js/input-sim.js');
function mulberry32(a){ return function(){ a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }

const naive = { act(o){ const x = o.x || 0; return { tx: Math.max(-0.9, Math.min(0.9, x)), my: 0.5, ctrl: false }; } };

// 挥拍版：接近击球时把 my 从 0.9 甩到 0.15（产生前冲 svz → fwd → 出球力量/弧线）
const sweeper = { act(o){
  const x = o.x || 0;
  const z = o.z || 0, vz = o.vz || 0;
  let my = 0.5;
  if(o.bounced && z > 0.55 && vz > 0.9){
    const gap = (o.pz || 1.32) - z;
    my = gap < 0.32 ? 0.15 : 0.9;          // 距离短 → 前甩
  }
  return { tx: Math.max(-0.9, Math.min(0.9, x)), my, ctrl: false };
} };

const WEAK = { moveSpeed: 1.8, moveErr: 0.28, moveZ: 1.0, push: { prob: 0.78, forceThresh: 30 }, counter: { prob: 0.45 }, smash: { prob: 0.05 }, loop: { prob: 0.3 }, awayProb: 0.5, txMin: 0.12, txRange: 0.3, tzBase: 0.8, tzRange: 0.3 };

function tally(agent, pol, seed, points){
  const count = {}; let w = 0;
  for(let g = 0; g < points; g++){
    const server = (g % 2 === 0) ? 'player' : 'ai';
    const r = IS.playInputPoint(agent, pol, mulberry32(seed + g), server);
    count[r.reason] = (count[r.reason] || 0) + 1;
    if(r.winner === 'player') w++;
  }
  return { count, w, t: points };
}

const r1 = tally(naive, PP.POLICY_DEFAULT, 4242, 300);
console.log('naive   vs默认: 胜率=' + (r1.w / r1.t * 100).toFixed(1) + '%', JSON.stringify(r1.count));
const r2 = tally(sweeper, PP.POLICY_DEFAULT, 4242, 300);
console.log('sweeper vs默认: 胜率=' + (r2.w / r2.t * 100).toFixed(1) + '%', JSON.stringify(r2.count));
const r3 = tally(sweeper, PP.POLICY_DEFAULT, 9000, 300);
console.log('sweeper vs默认(2): 胜率=' + (r3.w / r3.t * 100).toFixed(1) + '%', JSON.stringify(r3.count));
const r4 = tally(sweeper, WEAK, 9000, 300);
console.log('sweeper vs弱  : 胜率=' + (r4.w / r4.t * 100).toFixed(1) + '%', JSON.stringify(r4.count));