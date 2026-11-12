/* R12 v3：用 c.state.bz（hasMeet 帧的内部预测落台点）+ vy 翻转边沿配对 */
'use strict';
const vm = require('vm');
const { buildRig } = require('./live-rig.js');

const OPP = process.argv[2] || 'hell';
const GAMES = parseInt(process.argv[3] || '30', 10);
const SEED = 20261004;

const rig = buildRig({ controller: 'hip', moveCap: 2.0 });
rig.setOpp(OPP);
vm.runInContext([
  'globalThis.__pairs = [];',
  'globalThis.__st = { lastVy: null, pendPred: null };',
  'const __om = HIP_SKILL.makeController;',
  'HIP_SKILL.makeController = function(o){',
  '  const c = __om(o); const op = c.plan;',
  '  c.plan = function(obs){',
  '    const r = op(obs);',
  '    try{',
  '      const S = globalThis.__st;',
  '      const vy = ball.vel.y, bz = ball.pos.z;',
  '      if(bz > 0 && vy > 0 && S.lastVy != null && S.lastVy <= 0){',
  '        if(S.pendPred != null){ globalThis.__pairs.push({ real: bz, pred: S.pendPred }); }',
  '        S.pendPred = null;',
  '      }',
  '      /* 飞向玩家 + 控制器有 meets 预测：记内部 S.bz */',
  '      if(bz > 0 && ball.vel.z > 0.15 && c.state.hasMeet && c.state.bz != null){',
  '        S.pendPred = c.state.bz;',
  '      }',
  '      S.lastVy = vy;',
  '    }catch(e){}',
  '    return r;',
  '  };',
  '  return c;',
  '};',
  'TT_PLAYER.setController("hip");'
].join('\n'), rig.ctx);

let pts = 0, tot = 0;
for(let g = 0; g < GAMES; g++){
  const r = rig.playGame(SEED, g, 120);
  pts += r.you; tot += r.you + r.ai;
}
const pairs = vm.runInContext('globalThis.__pairs', rig.ctx);
const errs = pairs.map(p => p.real - p.pred).sort((a, b) => a - b);
const q = f => errs.length ? errs[Math.min(errs.length - 1, Math.floor(f * errs.length))] : null;
console.log('[allball-bias v3] opp=' + OPP + ' games=' + GAMES + ' rate=' + (tot ? (pts / tot * 100).toFixed(1) : '-') + '%');
console.log('pairs n=' + pairs.length);
console.log('err (real-pred) p10/p25/p50/p75/p90 = ' +
            [0.1, 0.25, 0.5, 0.75, 0.9].map(f => q(f) != null ? q(f).toFixed(3) : '-').join(' / '));
const near = pairs.filter(p => Math.abs(p.pred) < 0.9);
const ne = near.map(p => p.real - p.pred).sort((a, b) => a - b);
const q2 = f => ne.length ? ne[Math.min(ne.length - 1, Math.floor(f * ne.length))] : null;
console.log('near-net bucket n=' + near.length + ' err p25/p50/p75 = ' +
            [0.25, 0.5, 0.75].map(f => q2(f) != null ? q2(f).toFixed(3) : '-').join(' / '));
const hits = pairs.filter(p => Math.abs(p.real - p.pred) < 0.15).length;
console.log('|err|<0.15 (usable): ' + hits + '/' + pairs.length + ' = ' + (pairs.length ? (hits / pairs.length * 100).toFixed(0) : '-') + '%');
