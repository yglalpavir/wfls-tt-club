'use strict';
const path = require('path');
const IA = require(path.join(__dirname, '..', 'js', 'input-agent.js'));
const INPUTSIM = require(path.join(__dirname, '..', 'js', 'input-sim.js'));
const PP = require(path.join(__dirname, '..', 'js', 'policy.js'));

function mulberry32(a){ return function(){ a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }

const agent = IA.createInputAgent({ lr: 0.0005, gamma: 0.95, eps0: 1.0, epsMin: 0.05, batch: 64, replayCap: 40000, targetEvery: 500, learnPerPoint: 4 }, mulberry32(20260809));
const brain = { act(obs){ const r = agent.act(obs, true); return r.cmd; }, credit(d){ agent.credit(d); } };

function probe(tag){
  const obs = [
    { x: 0.3, y: 0.4, z: 0.9, vx: 0.1, vy: -0.2, vz: 1.2, sx: 0, sy: 0, px: 0.1, pz: 0.95, svx: 0, svz: 0, bounced: 0 },
    { x: -0.3, y: 0.7, z: 0.6, vx: -0.2, vy: -0.4, vz: 1.8, sx: 8, sy: -6, px: -0.2, pz: 0.92, svx: 0.1, svz: 0, bounced: 1 },
    { x: 0.9, y: 0.5, z: 1.3, vx: 0.8, vy: -0.3, vz: 1.0, sx: -14, sy: 0, px: 0.8, pz: 1.0, svx: 0.3, svz: 0, bounced: 0 },
  ];
  for(const o of obs){
    const a = agent.bestAction(o);
    const c = agent.decode(a);
    const q = require(path.join(__dirname, '..', 'js', 'dqn.js')).mlpForward(agent.getNet(), IA.encodeObs(o)).last;
    const solo = q.reduce((s, v) => s + Math.abs(v), 0);
    console.log('  obs', JSON.stringify({ x: o.x, z: o.z, bounced: o.bounced, vz: o.vz }),
      '→ a=' + a, 'cmd=' + JSON.stringify(c), '|Q|sum=' + solo.toFixed(3), 'maxQ=' + Math.max(...q).toFixed(3));
  }
}

console.log('--- 初始（随机权重） ---');
probe();

let w = 0, t = 0;
for(let g = 0; g < 400; g++){
  const server = (g % 2 === 0) ? 'player' : 'ai';
  const res = INPUTSIM.playInputPoint(brain, PP.POLICY_DEFAULT, mulberry32(20260809 + g), server);
  agent.endPoint('player', res.winner);
  t++; if(res.winner === 'player') w++;
  if((g + 1) % 100 === 0){
    agent.setTraining(false);
    const ev = INPUTSIM.playInputMatch({ act(o){ return agent.decode(agent.bestAction(o)); }, credit(){} }, PP.POLICY_DEFAULT, { games: 8, rngFactory: k => mulberry32(999000 + k) });
    agent.setTraining(true);
    console.log('ep', g + 1, 'trainW=' + (w / t * 100).toFixed(1) + '%', 'evalW=' + (ev.pointRate * 100).toFixed(1) + '%',
      'eps=' + agent.getEps().toFixed(2), 'replay=' + 0);
  }
}
console.log('--- 训练 400 分后 ---');
probe();