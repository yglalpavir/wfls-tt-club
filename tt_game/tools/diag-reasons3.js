'use strict';
const fs = require('fs');
const PP = require('../js/policy.js');
const SIM = require('../js/simcore.js'); global.SIM = SIM; global.P = PP;
const IS = require('../js/input-sim.js');
const IA = require('../js/input-agent.js');
function mulberry32(a){ return function(){ a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }

const agents = {
  dqn: (() => { const a = IA.loadInputAgent(fs.readFileSync(require('path').join(__dirname, '..', 'data', 'input-ai.json'), 'utf8'));
    a.setTraining(false); a.setEps(0);
    return { act(o){ return a.decode(a.bestAction(o)); } }; })(),
  naive: { act(o){ const x = o.x || 0; return { tx: Math.max(-0.9, Math.min(0.9, x)), my: 0.5, ctrl: false }; } },
  sweeper: { act(o){ const x = o.x || 0; return { tx: Math.max(-0.9, Math.min(0.9, x * 0.75)), my: 0.5, ctrl: true }; } },
};
for(const [name, ag] of Object.entries(agents)){
  const count = {}; let w = 0;
  for(let g = 0; g < 400; g++){
    const r = IS.playInputPoint(ag, PP.POLICY_DEFAULT, mulberry32(4242 + g), g % 2 === 0 ? 'player' : 'ai');
    count[r.reason] = (count[r.reason] || 0) + 1;
    if(r.winner === 'player') w++;
  }
  console.log('=== ' + name + ' ===  玩家胜率=' + (w / 400 * 100).toFixed(1) + '%');
  for(const [k, n] of Object.entries(count).sort((a, b) => b[1] - a[1]))
    console.log(String(k).padEnd(22), String(n).padStart(5), (n / 400 * 100).toFixed(1) + '%');
}