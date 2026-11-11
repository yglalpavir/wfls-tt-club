/* =====================================================================
 *  live-residual-probe.js — R2 残差构造的敏感性探针（不训练，只量基线）
 * =====================================================================
 *  问题：解析律（hip-skill plan）的输出 {tx,my,sw,f} 上，加一个小的学习残差，
 *  每个通道对胜率的敏感度是多少？敏感度 ≈ 0 的通道不值得学；
 *  敏感度大的通道就是 R2 残差网络的输出维度。
 *
 *  做法：在 rig 的 vm 里包住 TT_PLAYER 实际用的 HIP 控制器（通过
 *  HIP_SKILL.setConfig 的「每点覆盖」没法改 plan 的输出，所以这里直接
 *  重写 makeController —— 与 live-match 的 --hip-probe 同一手法），
 *  给每个通道加固定幅度的偏移，跑 20 局量分点率变化。
 * ===================================================================== */
'use strict';
const vm = require('vm');
const { buildRig } = require('./live-rig.js');

const OPP = (process.argv[2] || 'nemesis');
const GAMES = 20;
const SEED = 20261004;

function main(){
  const rig = buildRig({ controller: 'hip', moveCap: 2.0 });
  rig.setOpp(OPP);

  /* 包一层带残差偏移的 plan：offsets = {tx, my, sw, f}（加在原输出上） */
  function installResidual(off){
    vm.runInContext('HIP_SKILL.setConfig(null);', rig.ctx);
    /* ★ 每次 install 都生成新的包装函数名（const 词法绑定不可重复声明） */
    const tag = '__om' + Math.floor(Math.random() * 1e9).toString(36);
    const tag2 = '__off' + Math.floor(Math.random() * 1e9).toString(36);
    vm.runInContext([
      'if(globalThis.__origMakeController === undefined){',
      '  globalThis.__origMakeController = HIP_SKILL.makeController;',
      '}',
      'const ' + tag + ' = globalThis.__origMakeController;',
      'const ' + tag2 + ' = ' + JSON.stringify(off) + ';',
      'HIP_SKILL.makeController = function(o){',
      '  const c = ' + tag + '(o); const op = c.plan;',
      '  c.plan = function(obs){',
      '    const r = op(obs);',
      '    const OFF = ' + tag2 + ';',
      '    if(OFF.tx != null && r.tx != null) r.tx = Math.max(-0.9, Math.min(0.9, r.tx + OFF.tx));',
      '    if(OFF.my != null && r.my != null) r.my = Math.max(0.15, Math.min(0.95, r.my + OFF.my));',
      '    if(OFF.sw != null && r.sw != null) r.sw = Math.max(-0.8, Math.min(0.8, r.sw + OFF.sw));',
      '    if(OFF.f  != null && r.f  != null) r.f  = Math.max(0, Math.min(1, r.f + OFF.f));',
      '    return r;',
      '  };',
      '  return c;',
      '};',
      'TT_PLAYER.setController("hip");'
    ].join('\n'), rig.ctx);
  }
  function uninstall(){
    vm.runInContext('if(globalThis.__origMakeController !== undefined){ HIP_SKILL.makeController = globalThis.__origMakeController; TT_PLAYER.setController("hip"); }', rig.ctx);
  }

  const run = (label, off) => {
    if(off) installResidual(off); else uninstall();
    let pts = 0, tot = 0, stalled = 0;
    for(let g = 0; g < GAMES; g++){
      const r = rig.playGame(SEED, g, 120);
      pts += r.you; tot += r.you + r.ai;
      if(r.you + r.ai === 0) stalled++;
    }
    const line = label.padEnd(14) + (tot ? (pts / tot * 100).toFixed(1) : '-') + '%  (pts ' + pts + '/' + tot + ', stalled ' + stalled + ')';
    console.log(line);
    return tot ? pts / tot : 0;
  };

  console.log('[residual-probe] opp=' + OPP + ' games=' + GAMES);
  run('baseline', null);
  run('my +0.06', { my: 0.06 });
  run('my -0.06', { my: -0.06 });
  run('tx +0.05', { tx: 0.05 });
  run('tx -0.05', { tx: -0.05 });
  run('sw +0.10', { sw: 0.10 });
  run('sw -0.10', { sw: -0.10 });
  run('f +0.15', { f: 0.15 });
  run('f -0.15', { f: -0.15 });
  run('my +0.12', { my: 0.12 });
  run('my -0.12', { my: -0.12 });
}
main();
