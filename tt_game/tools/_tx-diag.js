/* =====================================================================
 *  _tx-diag.js — tx 偏移 +28pp 的机理诊断（R1.3 主攻）
 * =====================================================================
 *  tx-recheck 已定案：plan 输出的 tx 加 ±0.05 平移在 60 局/臂下
 *  baseline 58.7% / tx−0.05 87.0% / tx+0.05 81.3%（nemesis，r8 口径）。
 *  ±两个方向都涨 ⇒ 不是「位置偏好」，而是**动力学效应**：
 *  tx 是「拍子的鼠标目标」，padControl 用它算拍速/拍位 —— 平移 tx
 *  改变的是「追位残差」与「挥拍滞后项」，进而改变出球速度/落点。
 *  本探针记录：偏移后的出球（速度/落点）、失分结构、停摆。
 * ===================================================================== */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { buildRig, ROOT } = require('./live-rig.js');

function runArm(off, tag, games){
  const rig = buildRig({ controller: 'hip', moveCap: 2.0 });
  rig.setOpp('nemesis');
  /* 落点探针：挂 TT_PLAYER.ttHit（与 live-match --hip-probe 同手法） */
  vm.runInContext([
    'globalThis.__land = [];',
    'try{ const __tt = TT_PLAYER.ttHit;',
    '  TT_PLAYER.ttHit = function(){ const r = __tt.apply(null, arguments);',
    '    try{ const L = SIM.simulateFull({x:ball.pos.x,y:ball.pos.y,z:ball.pos.z},',
    '      {x:ball.vel.x,y:ball.vel.y,z:ball.vel.z}, "player", {x:ball.spin.x,y:ball.spin.y,z:0}, Math.random);',
    '      globalThis.__land.push({ ok: !!(L&&L.ok), reason: L?L.reason:null,',
    '        lx: (L&&L.landing)?L.landing.x:null, spd: Math.hypot(ball.vel.x,ball.vel.y,ball.vel.z) });',
    '    }catch(e){} return r; };',
    '}catch(e){}',
  ].join('\n'), rig.ctx);
  if(off){
    const t1 = '__m' + (Math.random() * 1e9 | 0).toString(36);
    const t2 = '__o' + (Math.random() * 1e9 | 0).toString(36);
    vm.runInContext('if(globalThis.__omc===undefined) globalThis.__omc=HIP_SKILL.makeController;', rig.ctx);
    const src = 'const ' + t1 + '=globalThis.__omc; const ' + t2 + '=' + JSON.stringify(off) + ';' +
      'HIP_SKILL.makeController=function(o){ const c=' + t1 + '(o); const op=c.plan;' +
      'c.plan=function(obs){ const r=op(obs); const OFF=' + t2 + ';' +
      'if(r.tx!=null) r.tx=Math.max(-0.9,Math.min(0.9,r.tx+OFF.tx));' +
      'return r; }; return c; }; TT_PLAYER.setController("hip");';
    vm.runInContext(src, rig.ctx);
  }
  let pts = 0, tot = 0, st = 0;
  const lostAgg = {};
  for(let g = 0; g < games; g++){
    const r = rig.playGame(20261004, g, 120);
    pts += r.you; tot += r.you + r.ai;
    if(r.you + r.ai === 0) st++;
    if(r.stats && r.stats.player && r.stats.player.lostBy){
      for(const k in r.stats.player.lostBy) lostAgg[k] = (lostAgg[k] || 0) + r.stats.player.lostBy[k];
    }
  }
  const land = vm.runInContext('(globalThis.__land||[])', rig.ctx);
  const ok = land.filter(x => x.ok);
  const spd = ok.map(x => x.spd).sort((a, b) => a - b);
  const lx = ok.map(x => x.lx).sort((a, b) => a - b);
  const q = (a, f) => a.length ? a[Math.min(a.length - 1, Math.floor(f * a.length))] : null;
  const fail = {};
  land.filter(x => !x.ok).forEach(x => { fail[x.reason] = (fail[x.reason] || 0) + 1; });
  console.log(tag + '  rate=' + (tot ? (pts / tot * 100).toFixed(1) : '-') + '%  pts ' + pts + '/' + tot +
              ' stalled ' + st);
  console.log('  out-balls n=' + land.length + ' legal=' + ok.length + ' fail=' + JSON.stringify(fail));
  console.log('  exit-speed p50/p90 = ' + (q(spd, 0.5) != null ? q(spd, 0.5).toFixed(2) : '-') + ' / ' +
              (q(spd, 0.9) != null ? q(spd, 0.9).toFixed(2) : '-') +
              '   landing-x p10/p50/p90 = ' + [0.1, 0.5, 0.9].map(f => q(lx, f) != null ? q(lx, f).toFixed(3) : '-').join(' / '));
  console.log('  lostBy=' + JSON.stringify(lostAgg));
}

console.log('tx-offset diagnosis (40 games/arm):');
runArm(null, 'baseline', 40);
runArm({ tx: -0.05 }, 'tx-0.05', 40);
runArm({ tx: +0.05 }, 'tx+0.05', 40);
