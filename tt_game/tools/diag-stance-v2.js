/* 正反手自动切换 v2.3 行为断言 + 训练器冒烟（node tools/diag-stance-v2.js）
   v2.1~v2.2 旧断言全部保留（v2.3 全可选输入、缺省零回归）；[9]~[15] 为 v2.3 新增 */
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

/* ================= v2.3 灵动化 ================= */
console.log('[9] 来球横向趋势预判（bvx × trendT 并入决策位移，钳 ±relNear）');
// dist=+0.02 静止球：信号 -0.19 < enter → 保持正手；同位置球以 0.6m/s 钻向怀里(+X)
// → dist 0.02+0.06=0.08 → 信号 -0.52 过 enter → 提前倒反手（真人"球要追身"的预判）
ok('贴线静止球：信号不足 → 保持正手', SIM.resolveStance({ bx: 0.32, gx: 0.30, gz: 1.32, cur: FH, lastSwitch: -9, now: 10, inbound: true, rng: R0 }) === FH);
ok('贴线球 + 0.6m/s 钻向怀里 → 提前倒反手', SIM.resolveStance({ bx: 0.32, gx: 0.30, gz: 1.32, cur: FH, lastSwitch: -9, now: 10, inbound: true, bvx: 0.6, rng: R0 }) === BH);
// 镜像：dist=-0.02 微偏正手侧保持反手（R1 噪声 0.19 < enter）；球以 -0.6m/s 走向正手位 → 迎正手
ok('贴线静止球：保持反手', SIM.resolveStance({ bx: 0.28, gx: 0.30, gz: 1.32, cur: BH, lastSwitch: -9, now: 10, inbound: true, rng: R1 }) === BH);
ok('贴线球走向正手位 → 迎正手', SIM.resolveStance({ bx: 0.28, gx: 0.30, gz: 1.32, cur: BH, lastSwitch: -9, now: 10, inbound: true, bvx: -0.6, rng: R1 }) === FH);
ok('趋势钳制：bvx=10 不淹没信号、无 NaN（仍然只是"提前倒反手"）', SIM.resolveStance({ bx: 0.32, gx: 0.30, gz: 1.32, cur: FH, lastSwitch: -9, now: 10, inbound: true, bvx: 10, rng: R0 }) === BH);

console.log('[10] 方向不对称滞回（贴脸：转反手敢换 / 转正手慎重；远球渐回对称）');
// 贴脸 ttc=0.05：|score|≈0.20 —— 转反手门槛 0.174 过、转正手门槛 0.272 不过
ok('贴脸弱反手信号 → 敢换反手', SIM.resolveStance({ bx: 0.338, gx: 0.30, gz: 1.32, cur: FH, lastSwitch: -9, now: 10, inbound: true, ttc: 0.05, rng: R0 }) === BH);
ok('贴脸弱正手信号 → 不乱转正手', SIM.resolveStance({ bx: 0.262, gx: 0.30, gz: 1.32, cur: BH, lastSwitch: -9, now: 10, inbound: true, ttc: 0.05, rng: R0 }) === BH);
// 远球 ttc=0.6（unc=1 → 对称）+ 时间充裕正手偏置 → 同强度正手信号可切换
ok('远球时间充裕 → 同强度正手信号可切换', SIM.resolveStance({ bx: 0.262, gx: 0.30, gz: 1.32, cur: BH, lastSwitch: -9, now: 10, inbound: true, ttc: 0.6, rng: R0 }) === FH);

console.log('[11] OU 平滑噪声盒（noiseBox）：连贯摇摆，不是逐帧抽签');
{
  const nb = { v: 0, t: -1 };
  // 首次调用（dtN 大 → 新鲜抽签）：与无盒白噪同值
  const a1 = SIM.resolveStance({ bx: 0.32, gx: 0.30, gz: 1.32, cur: FH, lastSwitch: -9, now: 10, inbound: true, rng: R1, noiseBox: nb });
  ok('噪声盒首抽 = 白噪行为（保持）', a1 === FH && nb.v === 0.5 && nb.t === 10);
  // 1ms 后用最大负噪抽签：OU 平滑 → 只从 +0.5 小幅回落（白噪会一步跳到 -0.5）
  SIM.resolveStance({ bx: 0.32, gx: 0.30, gz: 1.32, cur: FH, lastSwitch: -9, now: 10.001, inbound: true, rng: R0, noiseBox: nb });
  ok('OU 平滑：相邻帧噪声连贯（+0.5→约+0.42，不跳变）', nb.v > 0.4 && nb.v < 0.5 && nb.t === 10.001);
}

console.log('[12] minHold 软坡（无硬墙：中等信号 0.135s 即可改判，v2.2 硬墙要到 0.15s）');
// dist=+0.06 R0 → score=-0.41；软坡 req=1.1-0.8×h：dt=0.135 → req=0.38 <0.41 放行；dt=0.07 → req=0.73 挡住
ok('软坡：dt=0.135（<minHold）中等信号已可改判', SIM.resolveStance({ bx: 0.36, gx: 0.30, gz: 1.32, cur: FH, lastSwitch: 9.865, now: 10, inbound: true, rng: R0 }) === BH);
ok('软坡：dt=0.07 中等信号仍被挡', SIM.resolveStance({ bx: 0.36, gx: 0.30, gz: 1.32, cur: FH, lastSwitch: 9.93, now: 10, inbound: true, rng: R0 }) === FH);

console.log('[13] 还原归位（idle + 超过 resetHold → 回正手基准握法）');
ok('一分之间死球 1.2s+ → 回正手', SIM.resolveStance({ bx: 0, gx: 0.3, gz: 1.32, cur: BH, lastSwitch: -9, now: 10, inbound: false, idle: true, rng: R0 }) === FH);
ok('死球不足 1.2s → 保持', SIM.resolveStance({ bx: 0, gx: 0.3, gz: 1.32, cur: BH, lastSwitch: 9.5, now: 10, inbound: false, idle: true, rng: R0 }) === BH);
ok('未传 idle（旧调用方）→ 保持', SIM.resolveStance({ bx: 0, gx: 0.3, gz: 1.32, cur: BH, lastSwitch: -9, now: 10, inbound: false, rng: R0 }) === BH);

console.log('[14] commitTOf 分姿态 × 球速自适应承诺窗口');
ok('正手基准 0.18 / 反手基准 0.12', Math.abs(SIM.commitTOf('forehand', 3) - 0.18) < 1e-9 && Math.abs(SIM.commitTOf('backhand', 3) - 0.12) < 1e-9);
ok('快球锁更早：FH vz=6 → 0.18×1.15', Math.abs(SIM.commitTOf('forehand', 6) - 0.18 * 1.15) < 1e-9);
ok('慢球不放宽：FH vz=2 → 0.18', Math.abs(SIM.commitTOf('forehand', 2) - 0.18) < 1e-9);
ok('vz 缺省 → 基准窗口', Math.abs(SIM.commitTOf('forehand') - 0.18) < 1e-9);

console.log('[15] 接发球（第一板）无法触发爆冲');
{
  // 满足全部爆冲条件的正手大挥拍（上旋来球 / 非半高 / 大横滑 / 大前冲）
  const loopCtx = { stroke: 'forehand', pos: { x: -0.2, y: 0.85, z: 1.0 }, vel: { x: 0, y: 0.5, z: 2.0 },
                    spin: { x: 50, y: 0, z: 0 }, swipe: 3.0, fwd: 0.9, mouseNy: 0.5,
                    aim: { x: -0.3, z: 0.9, gx: -0.2 }, ctrlHold: false, dir: -1, applyArcAdj: false, rng: () => 0.5 };
  const rLoop = SIM.resolveHit(Object.assign({}, loopCtx, { receive: false }));
  const rRecv = SIM.resolveHit(Object.assign({}, loopCtx, { receive: true }));
  ok('相持板（receive:false）→ mode=loop（爆冲）', rLoop.mode === 'loop', rLoop.mode);
  ok('接发板（receive:true）→ 同动作只涌现快带（block），不是爆冲', rRecv.mode === 'block', rRecv.mode);
  ok('接发板仍正常出球（轨迹有限）', Number.isFinite(rRecv.outVel.x + rRecv.outVel.y + rRecv.outVel.z));
  // 策略层：接发抢攻意图（attackProb=1 强制 loop intent）也被物理门控拦下
  const PP = require('../js/policy.js');
  const ctxR = { stroke: 'forehand', bx: -0.3, by: 0.85, bz: 1.0, vx: 0, vy: 0.5, vz: 2.0, sx: 50, sy: 0,
                 aiX: -0.2, playerX: 0.3, rng: () => 0.5 };
  const dRecv = PP.aiDecision(Object.assign({}, ctxR, { receive: true }), { receive: { attackProb: 1 } });
  const dRally = PP.aiDecision(Object.assign({}, ctxR, { receive: false }), { loop: { prob: 1 } });
  ok('AI 接发抢攻意图 → 出球 block（爆冲被门控）', dRecv.mode === 'block', dRecv.mode);
  ok('AI 相持 loop 意图 → 出球 loop（不受影响）', dRally.mode === 'loop', dRally.mode);
  //  smash 不受接发门控影响（发球冒高被拍死是真实的）
  const rSmash = SIM.resolveHit(Object.assign({}, loopCtx, { receive: true, pos: { x: -0.2, y: 0.95, z: 1.0 } }));
  ok('接发板半高球 → 仍可扣杀（只限爆冲）', rSmash.mode === 'smash', rSmash.mode);
}

console.log('\n结果: ' + pass + ' 通过, ' + fail + ' 失败');
process.exit(fail ? 1 : 0);
