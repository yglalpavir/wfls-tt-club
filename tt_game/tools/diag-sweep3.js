'use strict';
const PP = require('../js/policy.js');
const SIM = require('../js/simcore.js'); global.SIM = SIM; global.P = PP;
process.env.TT_HITDBG = '1';   // 本脚本要读击球采样统计（默认关闭以省一半仿真开销）
const IS = require('../js/input-sim.js');
function mulberry32(a){ return function(){ a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }

function run(name, agent, pol, seed, n){
  IS.HITDBG.hits = IS.HITDBG.nets = IS.HITDBG.ok = IS.HITDBG.svz = IS.HITDBG.fwd = 0;
  let w = 0;
  for(let g = 0; g < n; g++){
    const server = (g % 2 === 0) ? 'player' : 'ai';
    const r = IS.playInputPoint(agent, pol, mulberry32(seed + g), server);
    if(r.winner === 'player') w++;
  }
  const h = IS.HITDBG;
  console.log(name.padEnd(14), '胜率=' + (w / n * 100).toFixed(1) + '%',
    '| 触球=' + h.hits, '落地=' + h.ok, '撞网=' + h.nets,
    '平均svz=' + (h.hits ? (h.svz / h.hits).toFixed(2) : 0),
    '平均fwd=' + (h.hits ? (h.fwd / h.hits).toFixed(2) : 0));
}

const naive = { act(o){ const x = o.x || 0; return { tx: Math.max(-0.9, Math.min(0.9, x)), my: 0.5, ctrl: false }; } };
const sweeper = { act(o){
  const x = o.x || 0, z = o.z || 0, vz = o.vz || 0;
  let my = 0.5;
  if(o.bounced && z > 0.55 && vz > 0.9){
    my = ((o.pz || 1.32) - z) < 0.32 ? 0.15 : 0.9;
  }
  return { tx: Math.max(-0.9, Math.min(0.9, x)), my, ctrl: false };
} };
const sweeper2 = { act(o){
  const x = o.x || 0, z = o.z || 0, vz = o.vz || 0;
  let my = 0.5;
  if(o.bounced && z > 0.4 && vz > 0.5){
    my = ((o.pz || 1.32) - z) < 0.45 ? 0.05 : 0.95;   // 更大更早的甩动
  }
  return { tx: Math.max(-0.9, Math.min(0.9, x)), my, ctrl: false };
} };

run('naive', naive, PP.POLICY_DEFAULT, 4242, 300);
run('sweeper', sweeper, PP.POLICY_DEFAULT, 4242, 300);
run('sweeper2', sweeper2, PP.POLICY_DEFAULT, 4242, 300);