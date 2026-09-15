/* 正反手自动切换 v2.1 行为断言 + 训练器冒烟（node tools/diag-stance-v2.js） */
'use strict';
const SIM = require('../js/simcore.js');
const IS = require('../js/input-sim.js');

let pass = 0, fail = 0;
function ok(name, cond, extra){
  if(cond){ pass++; console.log('  ✓ ' + name); }
  else{ fail++; console.log('  ✗ ' + name + (extra != null ? '  → ' + extra : '')); }
}
const R0 = () => 0;          // 噪声最小（score = 信号 - 0.08）
const R1 = () => 1;          // 噪声最大（score = 信号 + 0.08）
const FH = 'forehand', BH = 'backhand';

console.log('[1] 基本方向（-X 侧 = 正手，远区满强度）');
ok('球明显在拍左侧 → 正手', SIM.resolveStance({ bx: 0.0, gx: 0.5, gz: 1.32, cur: BH, lastSwitch: -9, now: 10, inbound: true, rng: R0 }) === FH);
ok('球明显在拍右侧 → 反手', SIM.resolveStance({ bx: 0.5, gx: 0.0, gz: 1.32, cur: FH, lastSwitch: -9, now: 10, inbound: true, rng: R0 }) === BH);

console.log('[2] 还原期 / 触球承诺（TTC 门控）');
ok('无来球（还原期）保持当前姿态', SIM.resolveStance({ bx: -0.9, gx: 0.5, gz: 1.32, cur: BH, lastSwitch: -9, now: 10, inbound: false, rng: R0 }) === BH);
ok('commit=true（挥拍已启动）锁姿态', SIM.resolveStance({ bx: -0.9, gx: 0.5, gz: 1.32, cur: BH, lastSwitch: -9, now: 10, inbound: true, commit: true, rng: R0 }) === BH);
ok('commit=false + 引拍中（phase 无关）正常切换', SIM.resolveStance({ bx: -0.9, gx: 0.5, gz: 1.32, cur: BH, lastSwitch: -9, now: 10, inbound: true, rng: R0 }) === FH);

console.log('[3] 追身区比例渐变（0.55 × |dist|/relNear，连续）');
// dist=+0.06（球在拍体线 +X 侧 6cm）→ rel = -0.33 → 反手意图
// R0 噪声 → score=-0.41（过 enter 0.3）；R1 噪声 → score=-0.25（不过）
ok('偏离体线 6cm：信号过 enter → 切换到反手', SIM.resolveStance({ bx: 0.36, gx: 0.30, gz: 1.32, cur: FH, lastSwitch: -9, now: 10, inbound: true, rng: R0 }) === BH);
ok('偏离体线 6cm：信号被噪声拉进滞回带 → 保持', SIM.resolveStance({ bx: 0.36, gx: 0.30, gz: 1.32, cur: FH, lastSwitch: -9, now: 10, inbound: true, rng: R1 }) === FH);
ok('贴体线 2cm：信号 ~0.11 < enter → 保持', SIM.resolveStance({ bx: 0.32, gx: 0.30, gz: 1.32, cur: FH, lastSwitch: -9, now: 10, inbound: true, rng: R1 }) === FH);
ok('边界连续性：dist=-relNear 处为正手信号（与远区同号）', SIM.resolveStance({ bx: 0.20, gx: 0.30, gz: 1.32, cur: BH, lastSwitch: -9, now: 10, inbound: true, rng: R1 }) === FH);

console.log('[4] minHold 切换后最短保持（追身区 0.41 < urgent 1.1 被挡）');
ok('刚切换 0.05s：追身信号不足以二次切换', SIM.resolveStance({ bx: 0.36, gx: 0.30, gz: 1.32, cur: FH, lastSwitch: 9.95, now: 10, inbound: true, rng: R0 }) === FH);
ok('minHold 过后：同样的追身信号可切换', SIM.resolveStance({ bx: 0.36, gx: 0.30, gz: 1.32, cur: FH, lastSwitch: 9.80, now: 10, inbound: true, rng: R0 }) === BH);

console.log('[5] urgent 紧急纠正（明显侧向 1.4 > 1.1 不受 minHold 限制）');
ok('刚切换但球明显在另一侧 → 立即纠正', SIM.resolveStance({ bx: 0.0, gx: 0.5, gz: 1.32, cur: BH, lastSwitch: 9.95, now: 10, inbound: true, rng: R1 }) === FH);

console.log('[5b] 一板一次承诺（strokeSwitches，AI）');
ok('已换过握：追身信号不足以再切换', SIM.resolveStance({ bx: 0.36, gx: 0.30, gz: 1.32, cur: FH, lastSwitch: 9.0, now: 10, inbound: true, strokeSwitches: 1, rng: R0 }) === FH);
ok('已换过握：球明显在另一侧（紧急）→ 允许改', SIM.resolveStance({ bx: 0.0, gx: 0.5, gz: 1.32, cur: BH, lastSwitch: 9.0, now: 10, inbound: true, strokeSwitches: 1, rng: R1 }) === FH);
ok('未换过握（玩家侧 strokeSwitches=0）：同信号可切换', SIM.resolveStance({ bx: 0.36, gx: 0.30, gz: 1.32, cur: FH, lastSwitch: 9.0, now: 10, inbound: true, strokeSwitches: 0, rng: R0 }) === BH);

console.log('[6] stanceRampOf 过渡成本');
ok('切换瞬间 = transMag(0.65)', Math.abs(SIM.stanceRampOf(10, 10) - 0.65) < 1e-9);
ok('过渡中点 = 0.825', Math.abs(SIM.stanceRampOf(10, 10.09) - 0.825) < 1e-9);
ok('过渡结束 = 1', Math.abs(SIM.stanceRampOf(10, 10.181) - 1) < 1e-9);
ok('久未切换 = 1', SIM.stanceRampOf(-9, 10) === 1);

console.log('[7] 实机常量同步（浏览器值覆盖 C.STANCE）');
ok('C.STANCE 存在且 enter=0.3 / commitT=0.15 / transMag=0.65',
   SIM.C.STANCE && SIM.C.STANCE.enter === 0.3 && SIM.C.STANCE.commitT === 0.15 && SIM.C.STANCE.transMag === 0.65);

console.log('[8] 训练器玩家管线冒烟（input-sim 100 分）');
{
  const mulberry32 = s => () => { s |= 0; s = s + 0x6D2B79F5 | 0; let t = Math.imul(s ^ s >>> 15, 1 | s); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
  const PP = require('../js/policy.js');
  const agent = { act: obs => ({ tx: obs.x * 0.6 + obs.vx * 0.05, my: 0.5, ctrl: false }) };
  let pWin = 0, hits = 0, N = 100;
  for(let i = 0; i < N; i++){
    const r = IS.playInputPoint(agent, PP.POLICY_DEFAULT, mulberry32(1000 + i), i % 2 ? 'player' : 'ai');
    hits += r.pReturns || 0;
    if(r.winner === 'player') pWin++;
  }
  console.log('  玩家侧回球成功板数 = ' + hits + '，胜 ' + pWin + '/' + N);
  ok('管线无异常且玩家能回球', hits > 0);
}

console.log('\n结果: ' + pass + ' 通过, ' + fail + ' 失败');
process.exit(fail ? 1 : 0);
