'use strict';
/* 分层找到 NaN 出生点：每 10 局检查各层权重 NaN 数量 */
const IA = require('../js/input-agent.js');
const PP = require('../js/policy.js');
const SIM = require('../js/simcore.js'); global.SIM = SIM; global.P = PP;
const IS = require('../js/input-sim.js');
function nanCount(w){ let n = 0, b = 0; for(const l of w){ for(const r of l.W) for(const v of r) if(!isFinite(v)) n++; for(const v of l.b) if(!isFinite(v)) b++; } return { W: n, b }; }
const ag = IA.createInputAgent({ lr: 0.0006, gamma: 0.9, eps0: 1.0, epsMin: 0.05, batch: 64, replayCap: 30000, targetEvery: 1000, learnPerPoint: 6 }, Math.random);
console.log('init: W-NaN=' + nanCount(ag.getNet()).W + ' b-NaN=' + nanCount(ag.getNet()).B);
for(let g = 0; g < 200; g++){
  const res = IS.playInputPoint({ act(o){ return ag.act(o, true).cmd; }, credit(d){ ag.credit(d); } },
    PP.POLICY_DEFAULT, Math.random, g % 2 === 0 ? 'player' : 'ai');
  ag.endPoint('player', res.winner);
  if((g + 1) % 20 === 0){ const n = nanCount(ag.getNet()); console.log('game ' + (g + 1) + ': W-NaN=' + n.W + ' b-NaN=' + n.B + ' Q[0..3]=' + JSON.stringify(ag.getNet()[2].W[0].slice(0, 4))); }
}