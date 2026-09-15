/* 临时诊断：验证不同打法策略的区分度（进化梯度） */
'use strict';
const P = require('../js/policy.js');
global.LEARNED_POLICY = require('../js/learned-policy.js').LEARNED_POLICY;   // 浏览器全局在 Node 中手动注入
const SIMMATCH = require('../js/simmatch.js');
function mulberry32(a){ return function(){ a|=0; a=a+0x6D2B79F5|0; let t=Math.imul(a^a>>>15,1|a); t=t+Math.imul(t^t>>>7,61|t)^t; return ((t^t>>>14)>>>0)/4294967296; }; }
function test(name, pol, games){
  const m = SIMMATCH.playMatch(pol, P.POLICY_DEFAULT, { games, rngFactory: i=>mulberry32(555000+i) });
  console.log(`${name.padEnd(28)} vs 默认：${m.winsA}-${m.winsB}  得分率=${m.pointRate.toFixed(3)}  (${m.games}局, ${m.shots}球)`);
}
test('默认(基准)', P.POLICY_DEFAULT, 24);
test('进攻型(loop/smash/counter↑)', { loop:{prob:0.95}, smash:{prob:0.9}, counter:{prob:0.95} }, 24);
test('保守型(loop/smash↓)', { loop:{prob:0.1}, smash:{prob:0.0}, counter:{prob:0.3} }, 24);
test('深落点型(tz↑)', { tzBase:1.15, tzRange:0.3 }, 24);
test('摆短型(tz↓)', { tzBase:0.55, tzRange:0.15 }, 24);
test('大角度型(txMin/range↑ away↑)', { txMin:0.5, txRange:0.3, awayProb:0.9 }, 24);
test('高精度型(moveErr↓)', { moveErr:0.0 }, 24);
test('迟钝型(moveErr↑)', { moveErr:0.2 }, 24);

/* 修正后的难度档位（curated hell） */
const hell = P.policyForDifficulty(1);
const casual = P.policyForDifficulty(0);
test('地狱档(curated 学习策略)', hell, 24);
test('休闲档(WEAK)', casual, 24);
console.log('  地狱档关键参数: loop=' + hell.loop.prob.toFixed(2) + ' push=' + hell.push.prob.toFixed(2) +
  ' smash=' + hell.smash.prob.toFixed(2) + ' serveTop=' + hell.serve.topProb.toFixed(2) +
  ' moveZ=' + hell.moveZ.toFixed(2));
