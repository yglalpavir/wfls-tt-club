/* =====================================================================
 *  regress-check.js — 对称性回归校验（Node）
 *  目标：验证"AI = 自动操控的玩家"——玩家与 AI 共用同一个出球核心 SIM.resolveHit，
 *        任何动作在 dir=+1（AI 侧）与 dir=-1（玩家侧）下必须镜像对称。
 *  方法：同一随机种子生成随机"来球 + 动作"，分别以 dir=+1 / dir=-1 调 SIM.resolveHit，
 *        断言 outVel/mode/pace/arc/relOut/side 满足镜像不变量。
 *  另：校验 AI 决策 aiDecision 输出有限、结构完整（不崩溃/不 NaN）。
 * 运行：node tools/regress-check.js
 * ===================================================================== */
'use strict';
const path = require('path');
const SIM = require(path.join(__dirname, '..', 'js', 'simcore.js'));
global.SIM = SIM;                                    // aiDecision 内部引用裸 SIM
const P = require(path.join(__dirname, '..', 'js', 'policy.js'));

/* ---- 可复现 RNG ---- */
function mulberry32(a){ return function(){ a|=0; a=a+0x6D2B79F5|0; let t=Math.imul(a^a>>>15,1|a); t=t+Math.imul(t^t>>>7,61|t)^t; return ((t^t>>>14)>>>0)/4294967296; }; }

/* ---- 随机"来球 + 动作"（覆盖正/反手、上下旋、快慢球、高低球、挥拍/前冲/搓球）---- */
function randActions(rng){
  const r = rng;
  return {
    stroke: r()<0.5?'forehand':'backhand',
    pos: { x:(r()-0.5)*1.4, y:0.66 + r()*0.75, z:(r()-0.5)*0.4 },
    vel: { x:(r()-0.5)*3, y:0.3+r()*2.2, z:(r()<0.5?1:-1)*(1.2+r()*5.0) },
    spin: { x:(r()-0.5)*260, y:(r()-0.5)*110, z:0 },
    swipe: (r()-0.5)*6,
    fwd: r()*1.0,
    mouseNy: r(),
    aim: { x:(r()-0.5)*0.9, z:(r()<0.5?1:-1)*(0.5+r()*0.7), gx:(r()-0.5)*1.2 },
    ctrlHold: r()<0.3,
  };
}

/* ---- 主校验 ---- */
let bad = 0, checked = 0;
const N = 40000;
for(let i = 0; i < N; i++){
  const rng = mulberry32(1000 + i);
  const a = randActions(rng);   // 玩家视角动作（接触在近侧 +Z，向 -Z 回球）
  // 构造 AI 侧的"网面镜像（z=0 平面）"：x/侧旋/横滑保持（同一物理动作），仅 z 相关量取反
  const aAI = Object.assign({}, a, {
    pos: { x: a.pos.x, y: a.pos.y, z: -a.pos.z },
    vel: { x: a.vel.x, y: a.vel.y, z: -a.vel.z },
    spin: { x: -a.spin.x, y: a.spin.y, z: 0 },
    aim: { x: a.aim.x, z: -a.aim.z, gx: a.aim.gx },
  });
  // 相同随机流注入 → 同一板在两侧必须镜像对称（真正校验公式对称，而非随机噪声）
  const pPlayer = SIM.resolveHit(Object.assign({}, a,   { dir:-1, applyArcAdj:true, rng: mulberry32(5000 + i) }));
  const pAI     = SIM.resolveHit(Object.assign({}, aAI, { dir: 1, applyArcAdj:true, rng: mulberry32(5000 + i) }));
  checked++;
  // —— 对称不变量（网面镜像）——
  // 1) 模式/节奏/弧线/相对旋 必须完全一致（方向无关的量）
  if(pPlayer.mode !== pAI.mode ||
     Math.abs(pPlayer.pace - pAI.pace) > 1e-9 ||
     Math.abs(pPlayer.arc  - pAI.arc)  > 1e-9 ||
     Math.abs(pPlayer.relOut - pAI.relOut) > 1e-9){
    bad++;
    console.log(`MISMATCH #${i} symmetric-scale mode=${pPlayer.mode}/${pAI.mode} pace=${pPlayer.pace}/${pAI.pace} relOut=${pPlayer.relOut}/${pAI.relOut}`);
    continue;
  }
  // 2) outVel：x/y 相同；z 镜像（AI 侧向 +Z、玩家向 -Z，幅值相等）
  const vp = pPlayer.outVel, va = pAI.outVel;
  const xz = Math.abs(vp.x - va.x), yz = Math.abs(vp.y - va.y), zz = Math.abs(vp.z - (-va.z));
  if(xz > 1e-6 || yz > 1e-6 || zz > 1e-6){
    bad++;
    console.log(`MISMATCH #${i} outVel player=(${vp.x},${vp.y},${vp.z}) ai=(${va.x},${va.y},${va.z})`);
    continue;
  }
  // 3) spin：相对旋 fx 镜像（符号随 dir/来旋镜像）、侧旋 fy 相同
  if(Math.abs(pPlayer.spin.x - (-pAI.spin.x)) > 1e-6 || Math.abs(pPlayer.spin.y - pAI.spin.y) > 1e-6){
    bad++;
    console.log(`MISMATCH #${i} spin player=(${pPlayer.spin.x},${pPlayer.spin.y}) ai=(${pAI.spin.x},${pAI.spin.y})`);
    continue;
  }
  // 4) netOut 一致
  if(pPlayer.netOut !== pAI.netOut){ bad++; console.log(`MISMATCH #${i} netOut ${pPlayer.netOut}/${pAI.netOut}`); continue; }
}

console.log(`✅ 对称性校验完成 checked=${checked} mismatches=${bad}`);

/* —— aiDecision：随机来球，输出必须有限且结构完整（不崩溃/不 NaN）—— */
let dBad = 0;
for(let i = 0; i < 2000; i++){
  const rng = mulberry32(9000 + i);
  const ctx = {
    stroke: rng()<0.5?'forehand':'backhand',
    bx:(rng()-0.5)*1.4, by:0.66+rng()*0.75, bz:(rng()-0.5)*0.4,
    vx:(rng()-0.5)*3, vy:0.3+rng()*2.2, vz:(rng()<0.5?1:-1)*(1.2+rng()*5),
    sx:(rng()-0.5)*260, sy:(rng()-0.5)*110,
    aiX:(rng()-0.5)*1.4, playerX:(rng()-0.5)*1.4,
    rng: mulberry32(10000 + i),
  };
  const d = P.aiDecision(ctx, P.POLICY_DEFAULT);
  const fin = [d.outVel.x, d.outVel.y, d.outVel.z, d.fx, d.fy, d.pace, d.arc, d.relOut].every(Number.isFinite);
  if(!fin){ dBad++; console.log(`AI MISMATH #${i} NaN/Inf`); }
}
if(dBad){ console.log(`❌ aiDecision 输出异常 ${dBad}`); bad += dBad; }
else console.log('✅ aiDecision 2000 例输出均有限');

/* 附加：难度 0.5 必须严格等于默认策略（零回归） */
const mid = P.flattenPolicy(P.policyForDifficulty(0.5)), def = P.flattenPolicy(P.POLICY_DEFAULT);
let diffBad = false;
mid.forEach((v,i)=>{ if(Math.abs(v-def[i])>1e-12){ diffBad=true; console.log(`DIFF@0.5 mismatch key=${P.POLICY_KEYS[i].k} mid=${v} def=${def[i]}`); } });
if(diffBad){ console.log('❌ 难度 0.5 偏离默认！'); bad++; }
else console.log('✅ 难度 0.5 = 默认策略（零回归）');

process.exit(bad ? 1 : 0);

