'use strict';
const path = require('path');
const PP = require(path.join(__dirname, '..', 'js', 'policy.js'));
const SIM = require(path.join(__dirname, '..', 'js', 'simcore.js'));
const INPUTSIM = require(path.join(__dirname, '..', 'js', 'input-sim.js'));
const IA = require(path.join(__dirname, '..', 'js', 'input-agent.js'));
const OPP = require(path.join(__dirname, '..', 'js', 'opponent-ladder.js'));
global.SIM = SIM; global.P = PP;
const fs = require('fs');
function mulberry32(a){ return function(){ a|=0; a=a+0x6D2B79F5|0; let t=Math.imul(a^a>>>15,1|a); t=t+Math.imul(t^t>>>7,61|t)^t; return ((t^t>>>14)>>>0)/4294967296; }; }
const base = IA.loadInputAgent(fs.readFileSync(path.join(__dirname,'..','data','input-ai-extreme.json'),'utf8'));
const brainOf = a => ({ act(o){ return a.act(o,true).cmd; }, credit(d){ a.credit(d); } });
const brainEval = a => ({ act(o){ return a.decode(a.bestAction(o)); }, credit(){} });
for(const tag of ['default','hell','elite','extreme','extreme-max']){
  const opp = OPP.at(tag);
  const rng = mulberry32(4242);
  const t0 = Date.now();
  let w=0; const N=30;
  for(let i=0;i<N;i++){ const r = INPUTSIM.playInputPoint(brainOf(base), opp, mulberry32(5000+i), i%2===0?'player':'ai'); if(r.winner==='player') w++; }
  const dtTrain = (Date.now()-t0)/1000;
  const t1 = Date.now();
  const r = INPUTSIM.playInputMatch(brainEval(base), opp, { games: 40, rngFactory: k => mulberry32(7000+k) });
  const dtEval = (Date.now()-t1)/1000;
  console.log(tag.padEnd(12), 'train 30局', dtTrain.toFixed(2)+'s', (30/dtTrain).toFixed(2)+' 局/s', '| eval 40局', dtEval.toFixed(2)+'s', (40/dtEval).toFixed(2)+' 局/s', '| win '+(w/30*100).toFixed(0)+'%', 'pR', r.pointRate.toFixed(3));
}
