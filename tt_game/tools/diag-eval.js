'use strict';
/* 用三组独立种子重评当前烘焙 DQN（每组 96 分），对照 naive */
const fs = require('fs');
const path = require('path');
const PP = require('../js/policy.js');
const SIM = require('../js/simcore.js'); global.SIM = SIM; global.P = PP;
const IS = require('../js/input-sim.js');
const IA = require('../js/input-agent.js');
function mulberry32(a){ return function(){ a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
const dqn = IA.loadInputAgent(fs.readFileSync(path.join(__dirname, '..', 'data', 'input-ai.json'), 'utf8'));
dqn.setTraining(false); dqn.setEps(0);
const dqnEval = { act(o){ return dqn.decode(dqn.bestAction(o)); } };
const naive = { act(o){ const x = o.x || 0; return { tx: Math.max(-0.9, Math.min(0.9, x)), my: 0.5, ctrl: false }; } };
for(const [name, ag] of [['dqn', dqnEval], ['naive', naive]]){
  for(const base of [999000, 4242, 13579]){
    const r = IS.playInputMatch(ag, PP.POLICY_DEFAULT, { games: 96, rngFactory: k => mulberry32(base + k) });
    console.log(name + ' seed ' + base + ': ' + (r.pointRate * 100).toFixed(1) + '%  (' + r.winsA + '-' + r.winsB + ')');
  }
}