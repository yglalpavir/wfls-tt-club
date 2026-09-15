'use strict';
const PP = require('../js/policy.js');
const SIM = require('../js/simcore.js'); global.SIM = SIM; global.P = PP;
const IS = require('../js/input-sim.js');
function mulberry32(a){ return function(){ a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }

const sweeper = { act(o){
  const x = o.x || 0;
  const z = o.z || 0, vz = o.vz || 0;
  let my = 0.5;
  if(o.bounced && z > 0.55 && vz > 0.9){
    const gap = (o.pz || 1.32) - z;
    my = gap < 0.32 ? 0.15 : 0.9;
  }
  return { tx: Math.max(-0.9, Math.min(0.9, x)), my, ctrl: false };
} };
const d = { hit: 0, svz1: 0, svzn: 0, fwd1: 0 };
let hits = 0;
const origDbg = process.env.TT_DBG_HIT; 
// 用环境变量的 DBG 打印来采样
const PATCH = true;
let fs = require('fs').readFileSync('../js/input-sim.js', 'utf8');
/* 直接内联采集：不依赖 TT_DBG_HIT，改打点采样 */
try{
  fs = fs.replace('if(process.env.TT_DBG_HIT){', 'if(true){');
  fs = fs.replace('fs2 = SIM.simulateFull(p, d.outVel, \'player\', { x: d.fx, y: d.fy, z: 0 }, rng);', '```');
}catch(e){}
for(let g = 0; g < 60; g++){
  const server = (g % 2 === 0) ? 'player' : 'ai';
  const r = IS.playInputPoint(sweeper, PP.POLICY_DEFAULT, mulberry32(4242 + g), server);
}
// 从 DBG 输出统计：改为收集存档 —— 无法在内联中收集，退回小结
console.log('（用工具采集 svz/fwd 需要打点；此处先看是否 hit）');