'use strict';
/* 探测：训练好的 DQN 在接收球时，其 argmax 动作 tx 是否跟随球 x */
const fs = require('fs');
const path = require('path');
const PP = require('../js/policy.js');
const SIM = require('../js/simcore.js'); global.SIM = SIM; global.P = PP;
const IS = require('../js/input-sim.js');
const IA = require('../js/input-agent.js');
function mulberry32(a){ return function(){ a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }

const ag = IA.loadInputAgent(fs.readFileSync(path.join(__dirname, '..', 'data', 'input-ai.json'), 'utf8'));
let n = 0; const hist = {}; let total = 0, txcnt = {};
for(let g = 0; g < 60; g++){
  const r = IS.playInputPoint({
    act(o){
      const a = ag.bestAction(o);
      const cmd = ag.decode(a);
      const k = String(Math.round(o.x * 4) / 4) + '->' + cmd.tx.toFixed(2) + (cmd.ctrl ? 'C' : '');
      hist[k] = (hist[k] || 0) + 1; total++;
      txcnt[cmd.tx] = (txcnt[cmd.tx] || 0) + 1;
      return cmd;
    },
  }, PP.POLICY_DEFAULT, mulberry32(11 + g), g % 2 === 0 ? 'player' : 'ai');
}
console.log('决策次数=' + total);
console.log('tx 分布:', JSON.stringify(txcnt));
const rows = Object.entries(hist).sort();
console.log('前 40 个 (ballX→tx):');
for(const [k, v] of rows.slice(0, 40)) console.log(k, v);