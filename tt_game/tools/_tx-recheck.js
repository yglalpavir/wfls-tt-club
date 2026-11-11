/* tx ±0.05 复验（R2 前置）：每臂独立 rig，60 局，避免共享全局的交叉污染。
 * 背景：residual-probe 第一轮给出 tx-0.05 → 92.0% / tx+0.05 → 77.6%（20 局），
 * 远超基线 57.0%。纯平移不该有这么大收益 ⇒ 必须先复验是否真实（大样本），
 * 再诊断机理（哪个旋钮等价于这个平移）。 */
'use strict';
const vm = require('vm');
const { buildRig } = require('./live-rig.js');

function runBatch(off, tag, games){
  const rig = buildRig({ controller: 'hip', moveCap: 2.0 });
  rig.setOpp('nemesis');
  if(off){
    const t1 = '__m' + (Math.random() * 1e9 | 0).toString(36);
    const t2 = '__o' + (Math.random() * 1e9 | 0).toString(36);
    vm.runInContext('if(globalThis.__omc===undefined) globalThis.__omc=HIP_SKILL.makeController;', rig.ctx);
    const src = 'const ' + t1 + '=globalThis.__omc; const ' + t2 + '=' + JSON.stringify(off) + ';' +
      'HIP_SKILL.makeController=function(o){ const c=' + t1 + '(o); const op=c.plan;' +
      'c.plan=function(obs){ const r=op(obs); const OFF=' + t2 + ';' +
      'if(r.tx!=null) r.tx=Math.max(-0.9,Math.min(0.9,r.tx+OFF.tx));' +
      'if(OFF.my!=null&&r.my!=null) r.my=Math.max(0.15,Math.min(0.95,r.my+OFF.my));' +
      'return r; }; return c; }; TT_PLAYER.setController("hip");';
    vm.runInContext(src, rig.ctx);
  }
  let pts = 0, tot = 0, st = 0, rallyN = 0, rallySum = 0;
  for(let g = 0; g < games; g++){
    const r = rig.playGame(20261004, g, 120);
    pts += r.you; tot += r.you + r.ai;
    if(r.you + r.ai === 0) st++;
    if(r.rally && r.rally.length){ rallySum += r.rally.reduce((a, b) => a + b, 0); rallyN += r.rally.length; }
  }
  console.log(tag.padEnd(10) + (tot ? (pts / tot * 100).toFixed(1) : '-') + '%  pts ' + pts + '/' + tot +
              ' stalled ' + st + ' rally ' + (rallyN ? (rallySum / rallyN).toFixed(2) : '-'));
}

console.log('tx-offset recheck (60 games/arm, fresh rig each arm):');
runBatch(null, 'baseline', 60);
runBatch({ tx: -0.05 }, 'tx-0.05', 60);
runBatch({ tx: +0.05 }, 'tx+0.05', 60);
