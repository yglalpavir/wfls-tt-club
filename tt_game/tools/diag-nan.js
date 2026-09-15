'use strict';
const path = require('path');
const IA = require(path.join(__dirname, '..', 'js', 'input-agent.js'));
const INPUTSIM = require(path.join(__dirname, '..', 'js', 'input-sim.js'));
const PP = require(path.join(__dirname, '..', 'js', 'policy.js'));
const DQN = require(path.join(__dirname, '..', 'js', 'dqn.js'));

function mulberry32(a){ return function(){ a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }

const agent = IA.createInputAgent({ lr: 0.0005, gamma: 0.95, eps0: 1.0, epsMin: 0.05, batch: 64, replayCap: 40000, targetEvery: 500, learnPerPoint: 4 }, mulberry32(20260711));
const brain = { act(o){ const r = agent.act(o, true); return r.cmd; }, credit(d){ agent.credit(d); } };

const ORIG_LINK = { learn: agent }.learn;
const origLearn = Object.getPrototypeOf(agent).learn || undefined;
console.log('learn is own method:', typeof agent.learn === 'function');

let shown = 0;
let points = 0;
for(let g = 0; g < 120; g++){
  points++;
  const server = (g % 2 === 0) ? 'player' : 'ai';
  const res = INPUTSIM.playInputPoint(brain, PP.POLICY_DEFAULT, mulberry32(20260809 + g), server);
  agent.endPoint('player', res.winner);
  // post-check
  if(shown < 25){
    const w = agent.getNet();
    let bad = false;
    for(const layer of w){
      for(const row of layer.W) for(const v of row) if(!isFinite(v)) bad = true;
      for(const v of layer.b) if(!isFinite(v)) bad = true;
    }
    if(bad && !shown){ shown++; console.log('NaN 出现于 第', g + 1, '分之后；该分 server=', server, 'winner=', res.winner, 'reason=', res.reason); }
  }
}
console.log('done points:', points);