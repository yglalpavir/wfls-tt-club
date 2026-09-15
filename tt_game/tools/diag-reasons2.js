'use strict';
const PP = require('../js/policy.js');
const SIM = require('../js/simcore.js'); global.SIM = SIM; global.P = PP;
const IS = require('../js/input-sim.js');
function mulberry32(a){ return function(){ a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
const naive = { act(o){ const x = o.x || 0; return { tx: Math.max(-0.9, Math.min(0.9, x)), my: 0.5, ctrl: false }; } };
const count = {}; let w = 0;
for(let g = 0; g < 400; g++){
  const r = IS.playInputPoint(naive, PP.POLICY_DEFAULT, mulberry32(4242 + g), g % 2 === 0 ? 'player' : 'ai');
  count[r.reason] = (count[r.reason] || 0) + 1;
  if(r.winner === 'player') w++;
}
const sorted = Object.entries(count).sort((a, b) => b[1] - a[1]);
console.log('玩家胜率=' + (w / 400 * 100).toFixed(1) + '%');
for(const [k, n] of sorted) console.log(String(k).padEnd(22), String(n).padStart(5), (n / 400 * 100).toFixed(1) + '%');