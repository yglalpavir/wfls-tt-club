/* R62：HIP 接发轮量化（对手发球、HIP 接发的分点结局）—— R61 对称面 */
'use strict';
const vm = require('vm');
const { buildRig } = require('./live-rig.js');
const rig = buildRig({ controller: 'hip', moveCap: 2.0 });
rig.setOpp('hell');
vm.runInContext([
  'globalThis.__pts = [];',
  'globalThis.__pt_orig = pointTo;',
  'pointTo = function(who, why){',
  '  try{ globalThis.__pts.push({ who: who, why: why, server: (typeof server !== "undefined") ? server : "?" }); }catch(e){}',
  '  return globalThis.__pt_orig.apply(null, arguments);',
  '};'
].join('\n'), rig.ctx);
let you = 0, ai = 0;
for(let g = 0; g < 40; g++){
  const r = rig.playGame(20261004, g, 120);
  you += r.you; ai += r.ai;
}
const pts = vm.runInContext('globalThis.__pts', rig.ctx);
const recv = pts.filter(p => p.server !== 'player');   // 对手发球的分（HIP 接发轮）
const cnt = {};
for(const p of recv) cnt[p.why] = (cnt[p.why] || 0) + 1;
/* HIP 在接发轮的得分 = who==='player' 的分 */
const won = recv.filter(p => p.who === 'player').length;
console.log('[receive-round] HIP 接发的分 = ' + recv.length + ' / 总分 ' + pts.length);
for(const [k, v] of Object.entries(cnt).sort((a, b) => b[1] - a[1])){
  console.log('  ' + k.padEnd(24) + ' ' + v + '  (' + (v / recv.length * 100).toFixed(1) + '%)');
}
console.log('HIP 接发轮得分率 = ' + (recv.length ? (won / recv.length * 100).toFixed(1) : '-') + '%  (' + won + '/' + recv.length + ')');
