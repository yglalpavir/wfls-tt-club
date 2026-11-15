/* =====================================================================
 *  _opp-recv-dist.js — R35：对手接球位置分布的精细对比（nemesis vs hell）
 * =====================================================================
 *  R13 用 spread(p90−p10) 分不开 nemesis(1.059)/hell(1.108) —— 但 spread
 *  只是宽度。本轮用**直方图对比**（分 8 桶）看形状差异：
 *  nemesis 被推到 +0.58 深落点惩罚（txBias 收益 +14.1pp）而 hell 不被
 *  —— 若 hell 在 +x 深处的密度显著更高（覆盖 +x 深），机理即坐实。
 * ===================================================================== */
'use strict';
const vm = require('vm');
const { buildRig } = require('./live-rig.js');

const GAMES = 30;
const SEED = 20261004;

function measure(tag){
  const rig = buildRig({ controller: 'hip', moveCap: 2.0 });
  rig.setOpp(tag);
  vm.runInContext([
    'globalThis.__aiX = [];',
    'const __ha = hitAI, __hap = hitAIForPlayer;',
    'const __rec = () => { globalThis.__aiX.push(aiPad.group.position.x); };',
    'hitAI = function(){ __rec(); return __ha.apply(null, arguments); };',
    'hitAIForPlayer = function(){ __rec(); return __hap.apply(null, arguments); };'
  ].join('\n'), rig.ctx);
  for(let g = 0; g < GAMES; g++) rig.playGame(SEED, g, 120);
  const xs = vm.runInContext('(globalThis.__aiX||[])', rig.ctx);
  /* 8 桶直方图：[-0.9,-0.675,-0.45,-0.225,0,0.225,0.45,0.675,0.9] */
  const edges = [-0.9, -0.675, -0.45, -0.225, 0, 0.225, 0.45, 0.675, 0.9];
  const hist = new Array(8).fill(0);
  let outside = 0;
  for(const x of xs){
    let placed = false;
    for(let b = 0; b < 8; b++){
      if(x >= edges[b] && x < edges[b + 1]){ hist[b]++; placed = true; break; }
    }
    if(!placed) outside++;
  }
  const total = xs.length;
  const pct = hist.map(v => (v / total * 100).toFixed(1));
  console.log(tag.padEnd(10) + ' n=' + total +
              '  [' + pct.join(', ') + ']  outside=' + (outside / total * 100).toFixed(1) + '%');
  return hist.map(v => v / total);
}

console.log('[opp-recv-dist] 8-bucket histogram of opponent contact-x (30 games each):');
const h1 = measure('nemesis');
const h2 = measure('hell');
console.log('\nbucket deltas (nemesis − hell, pp):');
for(let b = 0; b < 8; b++){
  const lo = (-0.9 + b * 0.225).toFixed(2), hi = (-0.9 + (b + 1) * 0.225).toFixed(2);
  console.log('  [' + lo + ',' + hi + '): ' + ((h1[b] - h2[b]) * 100).toFixed(1) + 'pp');
}
