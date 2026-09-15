'use strict';
const path = require('path');
const IA = require(path.join(__dirname, '..', 'js', 'input-agent.js'));
const INPUTSIM = require(path.join(__dirname, '..', 'js', 'input-sim.js'));
const PP = require(path.join(__dirname, '..', 'js', 'policy.js'));
const DQN = require(path.join(__dirname, '..', 'js', 'dqn.js'));

function mulberry32(a){ return function(){ a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }

const agent = IA.createInputAgent({ lr: 0.0005, gamma: 0.95, eps0: 1.0, epsMin: 0.05, batch: 64, replayCap: 40000, targetEvery: 500, learnPerPoint: 4 }, mulberry32(20260711));

const origLearn = agent.learn.bind(agent);
let trap = 0;
agent.learn = function(){
  const net = agent.getNet();
  const check = w => { let bad = null;
    for(const layer of w) for(const row of layer.W) for(const v of row) if(!isFinite(v)) bad = v;
    return bad; };
  if(trap < 8 && check(net) !== null){
    trap++;
    console.log('!!! 学习入口时权重已非有限:', check(net));
  }
  const r = origLearn();
  if(trap < 8 && check(net) !== null){
    trap++;
    console.log('!!! 学习后权重非有限:', check(net));
  }
  return r;
};

const brain = { act(o){ const r = agent.act(o, true); return r.cmd; }, credit(d){ agent.credit(d); } };

for(let g = 0; g < 6; g++){
  const server = (g % 2 === 0) ? 'player' : 'ai';
  const res = INPUTSIM.playInputPoint(brain, PP.POLICY_DEFAULT, mulberry32(20260809 + g), server);
  agent.endPoint('player', res.winner);
  console.log('point', g + 1, res.winner, res.reason);
}