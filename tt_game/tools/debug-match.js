/* 临时诊断：查看自对弈分结束原因分布 */
'use strict';
const P = require('../js/policy.js');
const SIMMATCH = require('../js/simmatch.js');
function mulberry32(a){ return function(){ a|=0; a=a+0x6D2B79F5|0; let t=Math.imul(a^a>>>15,1|a); t=t+Math.imul(t^t>>>7,61|t)^t; return ((t^t>>>14)>>>0)/4294967296; }; }

function show(name, A, B, games){
  const m = SIMMATCH.playMatch(A, B, { games, debugReasons:true, rngFactory: i=>mulberry32(7000+i) });
  console.log(`[${name}] ${games}局 ${m.winsA}-${m.winsB} 得分率=${m.pointRate.toFixed(3)} 球数=${m.shots} 每局回合=${(m.shots/games).toFixed(1)}`);
  console.log('  结束原因:', JSON.stringify(m.reasons));
}
show('默认 vs 默认', P.POLICY_DEFAULT, P.POLICY_DEFAULT, 30);
show('默认 vs 弱(高误差0.22低速1.8)', P.POLICY_DEFAULT, { moveErr:0.22, moveSpeed:1.8 }, 30);
show('默认 vs 更弱(高误差0.5)', P.POLICY_DEFAULT, { moveErr:0.5, moveSpeed:2.45 }, 30);
