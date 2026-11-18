/* =====================================================================
 *  _ret-speed-probe.js — R40：txBias 对「对手回球到达速度」的影响
 * =====================================================================
 *  R39 发现 nemesis2 + txBias：玩家侧 noreach 0%→85.5%（对手得分飙升）。
 *  假设：txBias 不仅移落点还改出球速度（R24 已证 nemesis 处 6.66 vs 5.45）
 *  ⇒ nemesis2 接到球后回击的球速也变 ⇒ 玩家接不到。
 *  量测：对每颗「对手回球」（向玩家飞）记录到达玩家拍面平面时的速度，
 *  对比 txBias 0 vs −0.05 两个配置（nemesis2，各 15 局）。
 * ===================================================================== */
'use strict';
const vm = require('vm');
const { buildRig } = require('./live-rig.js');

const GAMES = 15;
const SEED = 20261004;

function measure(txBias){
  const rig = buildRig({ controller: 'hip', moveCap: 2.0 });
  rig.setOpp('nemesis2');
  if(txBias){
    vm.runInContext('HIP_SKILL.setConfig({ txBias: ' + txBias + ' });', rig.ctx);
    // 生效确认
    const rb = vm.runInContext('HIP_SKILL.getConfig().txBias', rig.ctx);
    if(rb !== txBias) throw new Error('txBias readback ' + rb);
  }
  vm.runInContext([
    'globalThis.__ret = [];   // 对手回球（vz<0，向玩家飞）到达 |z|<=1.2 时的速度幅值',
    'globalThis.__seen = new Set();   // 防重：每板只记一次（首次进入 1.2 平面）'
  ].join('\n'), rig.ctx);
  /* 用 plan 包装逐帧观测 */
  const __om = vm.runInContext('HIP_SKILL.makeController', rig.ctx);
  vm.runInContext([
    'const __om = HIP_SKILL.makeController;',
    'HIP_SKILL.makeController = function(o){',
    '  const c = __om(o); const op = c.plan;',
    '  c.plan = function(obs){',
    '    try{',
    '      const S = globalThis.__seen;',
    '      const vy = ball.vel.y;',
    '      /* 对手刚回击：vy 由正转负（球向玩家飞）→ 清标记 */',
    '      if(vy > 0 && c.__lastVy != null && c.__lastVy <= 0){ S.clear(); }',
    '      /* 球向玩家飞且到达 z=1.2 平面附近：记录速度 */',
    '      if(vy < 0 && ball.pos.z > 1.15 && ball.pos.z < 1.25 && !S.has("r")){',
    '        const sp = Math.sqrt(ball.vel.x*ball.vel.x + vy*vy + ball.vel.z*ball.vel.z);',
    '        globalThis.__ret.push({ sp: sp, z: ball.pos.z, y: ball.pos.y });',
    '        S.add("r");',
    '      }',
    '      c.__lastVy = vy;',
    '    }catch(e){}',
    '    return op(obs);',
    '  };',
    '  return c;',
    '};',
    'TT_PLAYER.setController("hip");'
  ].join('\n'), rig.ctx);
  let you = 0, ai = 0;
  for(let g = 0; g < GAMES; g++){
    const r = rig.playGame(SEED, g, 120);
    you += r.you; ai += r.ai;
  }
  const ret = vm.runInContext('globalThis.__ret', rig.ctx);
  const sp = ret.map(r => r.sp).sort((a, b) => a - b);
  const q = f => sp.length ? sp[Math.min(sp.length - 1, Math.floor(f * sp.length))].toFixed(2) : '-';
  console.log('txBias=' + (txBias || 0) + '  rate=' + (you + ai ? (you / (you + ai) * 100).toFixed(1) : '-') +
              '%  returns=' + ret.length +
              '  arrive-speed p50/p90 = ' + q(0.5) + ' / ' + q(0.9) + ' m/s');
  return ret.map(r => r.sp);
}

console.log('[ret-speed-probe] opponent return arrival speed (nemesis2, 15 games each):');
const a = measure(0);
const b = measure(-0.05);
if(a.length && b.length){
  const mean = arr => arr.reduce((x, y) => x + y, 0) / arr.length;
  console.log('mean arrive-speed: no-bias ' + mean(a).toFixed(2) + ' vs txBias ' + mean(b).toFixed(2) + ' m/s');
}
