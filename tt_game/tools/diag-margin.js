'use strict';
const PP = require('../js/policy.js');
const SIM = require('../js/simcore.js'); global.SIM = SIM; global.P = PP;
process.env.TT_HITDBG = '1';   // 本脚本要读击球采样统计（默认关闭以省一半仿真开销）
const IS = require('../js/input-sim.js');
function mulberry32(a){ return function(){ a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
const naive = { act(o){ const x = o.x || 0; return { tx: Math.max(-0.9, Math.min(0.9, x)), my: 0.5, ctrl: false }; } };
function run(tag, margin){
  SIM.C.netMargin = margin;
  IS.HITDBG.hits = IS.HITDBG.nets = IS.HITDBG.ok = IS.HITDBG.svz = IS.HITDBG.fwd = 0;
  let w = 0, count = {};
  for(let g = 0; g < 200; g++){
    const r = IS.playInputPoint(naive, PP.POLICY_DEFAULT, mulberry32(4242 + g), g % 2 === 0 ? 'player' : 'ai');
    count[r.reason] = (count[r.reason] || 0) + 1;
    if(r.winner === 'player') w++;
  }
  console.log(String(tag).padEnd(12), 'margin=' + margin, '胜率=' + (w / 200 * 100).toFixed(1) + '%',
    '触=' + IS.HITDBG.hits, '落地=' + IS.HITDBG.ok, 'fail=' + IS.HITDBG.nets, '|', JSON.stringify(count));
}
for(const m of [0.03, 0.06, 0.09, 0.12]) run('m' + m, m);