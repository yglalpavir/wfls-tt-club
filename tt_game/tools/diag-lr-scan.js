'use strict';
const IA = require('../js/input-agent.js');
const PP = require('../js/policy.js');
const SIM = require('../js/simcore.js'); global.SIM = SIM; global.P = PP;
const IS = require('../js/input-sim.js');
function nanC(w){ let n = 0; for(const l of w) for(const r of l.W) for(const v of r) if(!isFinite(v)) n++; return n; }
for(const lr of [1e-4, 1e-5]){
  const ag = IA.createInputAgent({ lr, gamma: 0.9, eps0: 1.0, epsMin: 0.05, batch: 64, replayCap: 30000, targetEvery: 1000, learnPerPoint: 6 }, Math.random);
  let first = -1;
  for(let g = 0; g < 120; g++){
    const res = IS.playInputPoint({ act(o){ return ag.act(o, true).cmd; }, credit(d){ ag.credit(d); } }, PP.POLICY_DEFAULT, Math.random, g % 2 === 0 ? 'player' : 'ai');
    ag.endPoint('player', res.winner);
    const n = nanC(ag.getNet());
    if(first < 0 && n > 0) first = g + 1;
    if(g === 119) console.log('lr=' + lr + ' 首次NaN@game=' + (first === -1 ? '无' : first) + ' 终态W-NaN=' + n);
  }
}