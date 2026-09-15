'use strict';
const path = require('path');
const PP = require(path.join('..', 'js', 'policy.js'));
const SIM = require(path.join('..', 'js', 'simcore.js')); global.SIM = SIM; global.P = PP;
const IS = require(path.join('..', 'js', 'input-sim.js'));
function mulberry32(a){ return function(){ a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
const naive = { act(o){ const x = o.x || 0; return { tx: Math.max(-0.9, Math.min(0.9, x)), my: 0.5, ctrl: false }; } };

const slow = { act(o){
  const x = o.x || 0;
  const vz = o.vz || 0, sy = o.sy || 0, sx = o.sx || 0, by = o.y || 0;
  let my = 0.5, ctrl = false;
  if(o.bounced){
    const ballHigh = by > 1.0;
    const lowSpin = vz < 1.6 && sx > -8;
    my = ballHigh ? 0.85 : (lowSpin ? 0.35 : 0.6);
    if(o.z > 0.9 && vz > 1.1 && sy < -18) ctrl = true;
  } else {
    my = 0.45;
  }
  return { tx: Math.max(-0.9, Math.min(0.9, x)), my, ctrl };
} };

function run(b, pol, seed, games){ return IS.playInputMatch(b, pol, { games, rngFactory: k => mulberry32(seed + k) }); }
const WEAK = { moveSpeed: 1.8, moveErr: 0.28, moveZ: 1.0, push: { prob: 0.78, forceThresh: 30 }, counter: { prob: 0.45 }, smash: { prob: 0.05 }, loop: { prob: 0.3 }, awayProb: 0.5, txMin: 0.12, txRange: 0.3, tzBase: 0.8, tzRange: 0.3 };

const m1 = run(naive, PP.POLICY_DEFAULT, 31337);
const m2 = run(slow, PP.POLICY_DEFAULT, 31337);
const m3 = run(slow, PP.POLICY_DEFAULT, 2000);
const w2 = run(slow, WEAK, 2000);
console.log('naive vs默认:', (m1.pointRate * 100).toFixed(1) + '%', m1.winsA + '-' + m1.winsB);
console.log('slow  vs默认:', (m2.pointRate * 100).toFixed(1) + '%', m2.winsA + '-' + m2.winsB);
console.log('slow  vs默认(二重种):', (m3.pointRate * 100).toFixed(1) + '%', m3.winsA + '-' + m3.winsB);
console.log('slow  vs弱  :', (w2.pointRate * 100).toFixed(1) + '%', w2.winsA + '-' + w2.winsB);