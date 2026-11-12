/* =====================================================================
 *  live-traj-spike.js — R5a：在环轨迹采集 spike（v2：帧级快照在 vm 内落）
 * =====================================================================
 *  v1 教训：只在 plan 前后暂存「最新一帧」，局末只剩 1 帧（steps=0 的原因：
 *  __snap 没实现）。v2 改为在 vm 内用普通 Array 逐帧 push（决策帧频率 =
 *  60Hz，一局 ~2000 决策帧，对象开销可忽略），局末一次性搬出。
 * ===================================================================== */
'use strict';
const vm = require('vm');
const { buildRig } = require('./live-rig.js');

const MAX_GAMES = 10;

function main(){
  const rig = buildRig({ controller: 'hip', moveCap: 2.0 });
  rig.setOpp('nemesis');
  vm.runInContext([
    'globalThis.__traj = [];',
    'const __om = HIP_SKILL.makeController;',
    'HIP_SKILL.makeController = function(o){',
    '  const c = __om(o); const op = c.plan;',
    '  c.plan = function(obs){',
    '    const r = op(obs);',
    '    try{ globalThis.__traj.push([',
    '      obs.x, obs.y, obs.z, obs.vx, obs.vy, obs.vz, obs.sx, obs.sy,',
    '      obs.px, obs.pz, obs.svx, obs.svz, obs.tx, obs.my, obs.bounced, obs.ox,',
    '      r.tx, r.my, r.ctrl ? 1 : 0, r.pz, r.sw, r.f',
    '    ]); }catch(e){}',
    '    return r;',
    '  };',
    '  return c;',
    '};',
    'TT_PLAYER.setController("hip");'
  ].join('\n'), rig.ctx);

  const t0 = Date.now();
  let steps = 0;
  const rewards = [];
  for(let g = 0; g < MAX_GAMES; g++){
    vm.runInContext('globalThis.__traj.length = 0;', rig.ctx);
    const r = rig.playGame(20261004, g, 120);
    const n = vm.runInContext('globalThis.__traj.length', rig.ctx);
    steps += n;
    rewards.push(r.you - r.ai);
    if(g === 0){
      const sample = vm.runInContext('globalThis.__traj[0]', rig.ctx);
      console.log('sample frame (22 dims): [' + sample.map(v => typeof v === 'number' ? +v.toFixed(3) : v).join(', ') + ']');
    }
    console.log('game ' + g + ': you=' + r.you + ' ai=' + r.ai + ' reward=' + (r.you - r.ai) + ' frames=' + n);
  }
  const dt = (Date.now() - t0) / 1000;
  const bytes = steps * 22 * 8;
  console.log('---');
  console.log('games=' + MAX_GAMES + ' steps=' + steps + ' raw-bytes(JS array)=' + bytes +
              '  wall=' + dt.toFixed(1) + 's (' + (dt / MAX_GAMES).toFixed(1) + 's/game)');
  console.log('as Float32Array: ' + (steps * 22 * 4) + 'B; as Float16: ' + (steps * 22 * 2) + 'B');
  console.log('rewards: ' + rewards.join(','));
}
main();
