'use strict';
/* 打印 DQN 在若干球状态下各动作的 Q 分布——检查是否坍缩为无差异值 */
const fs = require('fs');
const path = require('path');
const DQN = require('../js/dqn.js');
const IA = require('../js/input-agent.js');
const ag = IA.loadInputAgent(fs.readFileSync(path.join(__dirname, '..', 'data', 'input-ai.json'), 'utf8'));
const d = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'input-ai.json'), 'utf8'));
const net = d.w;
const states = [
  { x: 0.4, y: 0.8, z: 1.3, vx: 0.5, vy: -2, vz: -4.5, sx: 20, sy: 30, px: 0.2, pz: 1.1, svx: 1, svz: 0, bounced: 0, myScore: 0, oppScore: 0 },
  { x: -0.5, y: 0.5, z: -0.4, vx: -1, vy: 1.5, vz: 4, sx: 10, sy: 45, px: -0.3, pz: 1.05, svx: -2, svz: 1, bounced: 1, myScore: 5, oppScore: 3 },
  { x: 0.1, y: 0.9, z: 0.6, vx: 0.3, vy: -3, vz: -3, sx: 0, sy: 60, px: 0.1, pz: 1.3, svx: 0, svz: 0, bounced: 0, myScore: 10, oppScore: 10 },
];
for(const s of states){
  const q = DQN.mlpForward(net, IA.encodeObs(s)).last;
  const show = q.map((v, i) => {
    const c = IA.decodeAction(i);
    return c.tx.toFixed(2) + '/' + c.my + (c.ctrl ? 'C' : '') + '=' + v.toFixed(3);
  });
  console.log('state x=' + s.x + ' z=' + s.z + '  →  ' + show.join('  '));
  console.log('  Q 范围: min=' + Math.min(...q).toFixed(3) + ' max=' + Math.max(...q).toFixed(3) +
    ' 均值=' + (q.reduce((a, b) => a + b, 0) / q.length).toFixed(3));
}