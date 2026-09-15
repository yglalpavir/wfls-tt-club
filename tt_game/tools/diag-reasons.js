'use strict';
const PP = require('../js/policy.js');
const SIM = require('../js/simcore.js'); global.SIM = SIM; global.P = PP;
const IS = require('../js/input-sim.js');
function mulberry32(a){ return function(){ a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }

const args = process.argv.slice(2);
const tag = args[0] || 'arc-off';
const count = {};
let w = 0, t = 0;
function tally(agent, pol, seed, points){
  for(let g = 0; g < points; g++){
    const server = (g % 2 === 0) ? 'player' : 'ai';
    const r = IS.playInputPoint(agent, pol, mulberry32(seed + g), server);
    const k = r.reason; count[k] = (count[k] || 0) + 1;
    t++; if(r.winner === 'player') w++;
  }
}
const naive = { act(o){ const x = o.x || 0; return { tx: Math.max(-0.9, Math.min(0.9, x)), my: 0.5, ctrl: false }; } };
tally(naive, PP.POLICY_DEFAULT, 4242, 400);
const sorted = Object.entries(count).sort((a, b) => b[1] - a[1]);
console.log('=== ' + tag + ' ===  玩家胜率=' + (w / t * 100).toFixed(1) + '%');
for(const [k, n] of sorted) console.log(String(k).padEnd(22), String(n).padStart(5), (n / t * 100).toFixed(1) + '%');