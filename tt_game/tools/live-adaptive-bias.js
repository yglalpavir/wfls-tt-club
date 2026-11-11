/* =====================================================================
 *  live-adaptive-bias.js — R2a：条件 txBias（对手覆盖面在线估计）
 * =====================================================================
 *  R1 已证：txBias −0.05 在 nemesis +9.9pp、在 hell −23.5pp —— 对手依赖。
 *  假设：bias 的收益取决于「对手的横向覆盖分布」——覆盖窄的对手被深角落
 *  惩罚（nemesis），覆盖宽的对手恰好吃掉 +x 深角落（hell）。
 *  本脚本量测每个对手的「被击中后回球落点 x 分布」（对手接球位置），
 *  验证该分布能否在线（首 N 板）区分 nemesis 与 hell ⇒ 条件 bias 的特征。
 *
 *  实现：rig 里包 TT_PLAYER.ttHit 的反面 —— 记录 AI 击球时（hitAI）的
 *  aiPad 位置 x。分布宽度（p10..p90）就是覆盖面。
 * ===================================================================== */
'use strict';
const vm = require('vm');
const { buildRig } = require('./live-rig.js');

function measureOpp(tag, games){
  const rig = buildRig({ controller: 'hip', moveCap: 2.0 });
  rig.setOpp(tag);
  vm.runInContext([
    'globalThis.__aiX = [];',
    'const __ha = hitAI, __hap = hitAIForPlayer;',
    'const __rec = () => { globalThis.__aiX.push(aiPad.group.position.x); };',
    'hitAI = function(){ __rec(); return __ha.apply(null, arguments); };',
    'hitAIForPlayer = function(){ __rec(); return __hap.apply(null, arguments); };'
  ].join('\n'), rig.ctx);
  let pts = 0, tot = 0;
  for(let g = 0; g < games; g++){
    const r = rig.playGame(20261004, g, 120);
    pts += r.you; tot += r.you + r.ai;
  }
  const xs = vm.runInContext('(globalThis.__aiX||[])', rig.ctx).sort((a, b) => a - b);
  const q = f => xs.length ? xs[Math.min(xs.length - 1, Math.floor(f * xs.length))] : 0;
  console.log(tag.padEnd(10) + ' rate=' + (tot ? (pts / tot * 100).toFixed(1) : '-') + '%' +
              '  aiX n=' + xs.length +
              '  p10/p50/p90 = ' + [0.1, 0.5, 0.9].map(f => q(f).toFixed(3)).join(' / ') +
              '  spread(p90-p10)=' + (q(0.9) - q(0.1)).toFixed(3));
}

console.log('opponent lateral coverage (contact-x distribution, 20 games each):');
for(const t of ['nemesis', 'hell', 'default', 'grandslam', 'elite']) measureOpp(t, 20);
