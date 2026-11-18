/* R61：HIP 发球轮量化 —— 发球直接得分/失误/接发质量的专项统计 */
'use strict';
const vm = require('vm');
const { buildRig } = require('./live-rig.js');

const rig = buildRig({ controller: 'hip', moveCap: 2.0 });
rig.setOpp(process.argv[2] || 'hell');
if(process.argv[3]){
  const bias = parseFloat(process.argv[3]);
  vm.runInContext('HIP_SKILL.setConfig({ txBias: ' + bias + ' });', rig.ctx);
  console.log('[cfg] txBias = ' + vm.runInContext('HIP_SKILL.getConfig().txBias', rig.ctx));
}
vm.runInContext([
  'globalThis.__srv = { total: 0, aceOpp: 0, faultSelf: 0, rallyStarted: 0 };'
].join('\n'), rig.ctx);
/* 观察：每次 playGame 后 rules 层的 server/比分可以通过 rig 状态读。
 * 这里换一个更直接的口径：跑 N 局，在 vm 里包 pointTo，记录 reason 与 server。 */
vm.runInContext([
  'globalThis.__pts = [];',
  'globalThis.__pt_orig = pointTo;',
  'pointTo = function(who, why){',
  '  try{ globalThis.__pts.push({ who: who, why: why, server: (typeof server !== "undefined") ? server : "?" }); }catch(e){}',
  '  return globalThis.__pt_orig.apply(null, arguments);',
  '};'
].join('\n'), rig.ctx);
const GAMES = parseInt(process.argv[4] || '40', 10);
let you = 0, ai = 0;
for(let g = 0; g < 40; g++){
  const r = rig.playGame(20261004, g, 120);
  you += r.you; ai += r.ai;
}
const pts = vm.runInContext('globalThis.__pts', rig.ctx);
const mine = pts.filter(p => p.server === 'player');
const cnt = {};
for(const p of mine) cnt[p.why] = (cnt[p.why] || 0) + 1;
console.log('[serve-round] HIP 发球的分 = ' + mine.length + ' / 总分 ' + pts.length);
for(const [k, v] of Object.entries(cnt).sort((a, b) => b[1] - a[1])){
  console.log('  ' + k.padEnd(24) + ' ' + v + '  (' + (v / mine.length * 100).toFixed(1) + '%)');
}
console.log('总分点率 = ' + (you + ai ? (you / (you + ai) * 100).toFixed(1) : '-') + '%');
