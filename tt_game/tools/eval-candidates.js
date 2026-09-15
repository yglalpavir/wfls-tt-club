/* 最终候选评估：对每个权重文件跑多场大样本评估（地狱 + 默认），输出胜率排序 */
'use strict';
const path = require('path');
const fs = require('fs');
const PP = require(path.join(__dirname, '..', 'js', 'policy.js'));
const SIM = require(path.join(__dirname, '..', 'js', 'simcore.js'));
const INPUTSIM = require(path.join(__dirname, '..', 'js', 'input-sim.js'));
const IA = require(path.join(__dirname, '..', 'js', 'input-agent.js'));
global.SIM = SIM; global.P = PP;
function mulberry32(a){ return function(){ a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
function hellOpp(){ try{ const LP = require(path.join(__dirname, '..', 'js', 'learned-policy.js')).LEARNED_POLICY; return Object.assign({}, LP, { moveSpeed: 2.8, moveErr: 0.03, moveZ: 2.6 }); } catch(e){ return PP.POLICY_DEFAULT; } }
function evalNet(net, opp, games, seedBase){
  const agent = IA.createInputAgent({}, mulberry32(seedBase));
  agent.setNet(net);
  return INPUTSIM.playInputMatch({ act(obs){ return agent.decode(agent.bestAction(obs)); }, credit(){} }, opp, { games, rngFactory: k => mulberry32(seedBase + k) });
}
(async () => {
  const files = process.argv.slice(2).length ? process.argv.slice(2) : ['data/input-ai.json', 'data/input-ai-v2.json', 'data/input-ai-v3.json'];
  const games = 160, seed = 70001;
  const rows = [];
  for(const f of files){
    const b = JSON.parse(fs.readFileSync(path.join(__dirname, '..', f), 'utf8'));
    const net = b.w || b.net;
    const mH = evalNet(net, hellOpp(), games, seed);
    const mD = evalNet(net, PP.POLICY_DEFAULT, games, seed + 1000);
    rows.push({ f, hell: +(mH.pointRate * 100).toFixed(1), def: +(mD.pointRate * 100).toFixed(1), hellW: mH.winsA + '-' + mH.winsB, defW: mD.winsA + '-' + mD.winsB });
    console.log(f + ' | vs hell ' + rows[rows.length - 1].hell.toFixed(1) + '% (' + mH.winsA + '-' + mH.winsB + ') | vs default ' + rows[rows.length - 1].def.toFixed(1) + '% (' + mD.winsA + '-' + mD.winsB + ')');
  }
  rows.sort((a, b) => b.hell - a.hell);
  console.log('\n排名（按 vs hell）：\n' + rows.map((r, i) => (i + 1) + ') ' + r.f + '  hell=' + r.hell + '%  def=' + r.def + '%').join('\n'));
})();