/* =====================================================================
 *  _dqn-bias-probe.js — R28：DQN 的 96% noreach 通道分解（横向 vs 深度）
 * =====================================================================
 *  R22 发现 nemesis2 对 DQN 是真强敌（45.5%，noreach 96%）。
 *  DQN 的拍位由 obs.bounced 前的 mxI（lateralPrior 覆盖为预测拦截点）
 *  与 my（拍面深度）共同决定。问题：漏掉的球是「横向差一点」还是
 *  「深度错（球没弹起来/已弹过）」？
 *  方法：DQN plan 包装里记录每板决定性时刻的（拍位 x, 拍位 z, 球 x, 球 z），
 *  与 HIP 探针同口径做 |球x−拍x| 与 |球z−拍z| 的分布对比。
 * ===================================================================== */
'use strict';
const vm = require('vm');
const { buildRig } = require('./live-rig.js');

const OPP = process.argv[2] || 'nemesis2';
const GAMES = parseInt(process.argv[3] || '20', 10);
const SEED = 20261004;

const rig = buildRig({ controller: 'dqn', moveCap: 2.0 });
rig.setOpp(OPP);
vm.runInContext([
  'globalThis.__dec = [];   // 决定性帧（球到拍面深度平面附近）',
  'const __om = TT_PLAYER;',   // 词法不可用 —— 用 plan 包装代替
  'const __origDecode = null;'
].join('\n'), rig.ctx);
/* DQN 路径的决策在 tt-player 的 else 分支：agent.bestAction(obs) → decode。
 * 包装点：plan 不可用（DQN 无 controller.plan）—— 包 agent.bestAction。
 * 但 agent 在 init() 之后才存在 —— 用轮询挂。 */
/* agent 是懒创建的：rig 构建后 init() 已跑（buildLiveRig 断言 isReady），
 * 所以 agent 已存在 —— 直接包，不需要 setInterval */
vm.runInContext([
  'const __ag = TT_PLAYER.agent;',
  'if(!__ag) throw new Error("agent not ready");',
  'globalThis.__probe = { frames: 0, decisive: 0, dx: [], dz: [], dy: [] };',
  'const __ba = __ag.bestAction.bind(__ag);',
  'const __dec = __ag.decode.bind(__ag);',
  '__ag.bestAction = function(obs){',
  '  const a = __ba(obs);',
  '  const cmd = __dec(a);',
  '  const P = globalThis.__probe;',
  '  P.frames++;',
  '  try{',
  '    const pz = obs.pz != null ? obs.pz : 1.32;',
  '    const dz = Math.abs((obs.z||0) - pz);',
  '    if((obs.vz||0) > 0.15 && dz < 0.15){',
  '      P.decisive++;',
  '      const padZ = 0.92 + (cmd.my != null ? cmd.my : 0.5) * 0.8;',
  '      P.dz.push(Math.abs((obs.z||0) - padZ));',
  '      P.dy.push(Math.abs((obs.y||0) - 0.91));',
  '    }',
  '  }catch(e){}',
  '  return a;',
  '};'
].join('\n'), rig.ctx);

let pts = 0, tot = 0;
for(let g = 0; g < GAMES; g++){
  const r = rig.playGame(SEED, g, 120);
  pts += r.you; tot += r.you + r.ai;
}
const P = vm.runInContext('globalThis.__probe', rig.ctx);
const q = (a, f) => a.length ? a.slice().sort((x, y) => x - y)[Math.min(a.length - 1, Math.floor(f * a.length))] : null;
console.log('[dqn-bias-probe] opp=' + OPP + ' games=' + GAMES + ' rate=' + (tot ? (pts / tot * 100).toFixed(1) : '-') + '%');
console.log('frames=' + P.frames + ' decisive=' + P.decisive);
console.log('|球z−拍z| (pad-depth err) p50/p90 = ' +
            [0.5, 0.9].map(f => { const v = q(P.dz, f); return v != null ? v.toFixed(3) : '-'; }).join(' / '));
console.log('|球y−拍y| (height err)     p50/p90 = ' +
            [0.5, 0.9].map(f => { const v = q(P.dy, f); return v != null ? v.toFixed(3) : '-'; }).join(' / '));
