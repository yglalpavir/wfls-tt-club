'use strict';
const path = require('path');
const IA = require(path.join(__dirname, '..', 'js', 'input-agent.js'));
const INPUTSIM = require(path.join(__dirname, '..', 'js', 'input-sim.js'));
const PP = require(path.join(__dirname, '..', 'js', 'policy.js'));
const DQN = require(path.join(__dirname, '..', 'js', 'dqn.js'));

function mulberry32(a){ return function(){ a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }

const agent = IA.createInputAgent({ lr: 0.0005, gamma: 0.95, eps0: 1.0, epsMin: 0.05, batch: 64, replayCap: 40000, targetEvery: 500, learnPerPoint: 4 }, mulberry32(20260711));

const origEnd = agent.endPoint.bind(agent);
let once = false;
agent.endPoint = function(own, winner){
  origEnd(own, winner);
  if(!once){
    once = true;
    const net = agent.getNet();
    const dump = (tag, arr) => {
      const flat = arr.flat().filter(v => typeof v === 'number');
      const nan = flat.filter(v => !isFinite(v)).length;
      if(nan > 0) console.log('  ', tag, '含', nan, '个非有限值；min=' + Math.min(...flat), 'max=' + Math.max(...flat));
    };
    console.log('=== 第一分 endPoint 后 ===');
    dump('reward', agent.replay ? agent.replay : []);
    const checkW = (tag, w) => { const bad = []; for(const L of w) for(const row of L.W) for(const v of row) if(!isFinite(v)) bad.push(v); for(const L of w) for(const v of L.b) if(!isFinite(v)) bad.push(v); console.log('  ', tag, bad.length ? 'BAD:' + bad.slice(0,5).join(',') : 'OK'); };
    checkW('net', net);
    const q1 = DQN.mlpForward(net, new Array(22).fill(0.1)).last;
    dump('q(zeros)', [q1]);
  }
};
const brain = { act(o){ const r = agent.act(o, true); return r.cmd; }, credit(d){ agent.credit(d); } };
const res = INPUTSIM.playInputPoint(brain, PP.POLICY_DEFAULT, mulberry32(20260809), 'player');
agent.endPoint('player', res.winner);
console.log('point1:', res.winner, res.reason);