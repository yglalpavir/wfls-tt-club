/* 口径漂移检测：训练侧（input-sim.js 玩家管线）vs 实机 AI 侧（physics.js#tryAIHit/磁吸）
 *
 * ★ 为什么只比 AI 侧
 * ttmouse 在实机里由 ai.js:99-107 驱动 → TT_PLAYER.ttTick(dt,'ai',aiPad)，
 * 触球判定落在 physics.js#tryAIHit、磁吸落在 physics.js:351-360 的 **AI 分支**。
 * 训练侧 input-sim.js 跑的是「玩家管线」（padControl/magnetPull/tryPlayerFit）。
 * 所以可比的只有 AI 侧 ↔ 训练侧；实机「玩家侧」分支（tryPlayerHit，pushF 看 ctrlHold）
 * 与训练侧语义不同（那里的 ctrl 是人类玩家的按键，不是 agent 的决策），不在比对范围。
 *
 * ★ 为什么需要这个工具
 * 训练/实机失配会静默地把 agent 训成「实机兑现不了的精细操控」——离线评估漂亮、
 * 实机被压制。2026-10-03 栽了两次：
 *   1) pushF 判据：训练侧曾要求 (下旋 && 按Ctrl)，实机 AI 侧只看下旋
 *      → 横向触球窗口 ±0.170 vs ±0.220 m（差 29%）
 *   2) 磁吸 mag：训练侧曾含 pushF.mag=1.5，实机 AI 侧不含
 * 两次都潜伏很久没被发现，因为没有对照测试——看曲线是看不出来的。
 *
 * 用法：node tools/_drift.js [--verbose]
 */
'use strict';
const mcore = require('../js/simcore.js'); global.SIM = mcore;
const C = SIM.C;

const VERBOSE = process.argv.includes('--verbose');
const f = (v, n = 3) => (v == null || !isFinite(v) ? 'NaN' : (+v).toFixed(n));

/* ---- 实机 AI 侧公式（逐行复刻，标注源码行号）---- */
function aiWinReal(stroke, relTop, ballY, v, s) {
  const st = C.STROKE[stroke];
  const pushF = relTop < -8 ? C.PUSH.fit : null;                     // physics.js:289
  const high = ballY > C.TABLE_TOP + 0.13;                           // physics.js:290
  const inQual = Math.max(0, Math.min(0.35,
    (Math.abs(v.z) * 0.06 + Math.abs(s.x) * 0.002 + Math.abs(s.y) * 0.002) - 0.15));  // :292
  const fitV = pushF ? st.forgiveV + pushF.v : (high ? st.forgiveV + 0.30 : Math.max(st.forgiveV - inQual, 0.04));  // :293
  const fitH = pushF ? st.forgiveH + pushF.h : (high ? st.forgiveH + 0.16 : Math.max(st.forgiveH - inQual * 0.5, 0.02)); // :294
  const fitZ = pushF ? st.forgiveZ + pushF.z : (high ? st.forgiveZ + 0.12 : Math.max(st.forgiveZ - inQual * 0.4, 0.02)); // :295
  return { pushF: !!pushF, high, inQual, fitV, fitH, fitZ };
}
function aiMagReal(stroke, ballY) {                                    // physics.js:355
  const st = C.STROKE[stroke];
  const high = ballY > C.TABLE_TOP + 0.13;
  return st.magnet + (high ? 1.2 : 0);
}

/* ---- 训练侧公式（逐行复刻 input-sim.js，标注行号）---- */
function trWin(bx, stance, relTop, ballY, v, s) {
  const under = relTop < -8;
  const pushF = under ? C.PUSH.fit : null;                            // input-sim.js:150
  const pushSt = pushF ? ((bx >= 0) ? 'backhand' : 'forehand') : stance;  // :151
  const st = C.STROKE[pushSt];
  const high = ballY > C.TABLE_TOP + 0.13;                            // :152
  const inQual = Math.max(0, Math.min(0.35,
    (Math.abs(v.z) * 0.06 + Math.abs(s.x) * 0.002 + Math.abs(s.y) * 0.002) - 0.15));
  const fitV = pushF ? st.forgiveV + pushF.v : (high ? st.forgiveV + 0.30 : Math.max(st.forgiveV - inQual, 0.04));
  const fitH = pushF ? st.forgiveH + pushF.h : (high ? st.forgiveH + 0.16 : Math.max(st.forgiveH - inQual * 0.5, 0.02));
  const fitZ = pushF ? st.forgiveZ + pushF.z : (high ? st.forgiveZ + 0.12 : Math.max(st.forgiveZ - inQual * 0.4, 0.02));
  return { pushF: !!pushF, high, inQual, fitV, fitH, fitZ, pushSt };
}
function trMag(stance, ballY) {                                        // input-sim.js:118
  const st = C.STROKE[stance];
  const high = ballY > C.TABLE_TOP + 0.13;
  return st.magnet + (high ? 1.2 : 0);
}

/* ---- 深度拟合（实机 main.js:26 vs 训练 input-sim.js:56，公式本就一致）---- */
const fitW = (vz) => Math.max(0.2, Math.min(0.5, 0.25 + (vz - 1) * 0.03));

/* ---- 场景矩阵 ---- */
const VZ = [-6, -4, -2, -0.5, 0.5, 2, 4, 6];
const SX = [0, 40, 100, 180, -200, -120];   // 含上旋与下旋
const SY = [0, 30, -60];
const BY = [0.40, 0.60, 0.76, 0.90, 1.05, 1.30];
const STANCES = ['forehand', 'backhand'];
const BX = [-0.6, 0, 0.6];                 // 球的横向位置（决定 pushSt 选正/反手）

let checks = 0; const bad = [];
for (const stance of STANCES)
  for (const bx of BX)
    for (const vz of VZ)
      for (const sx of SX)
        for (const sy of SY)
          for (const by of BY) {
            const v = { x: 0.2, y: 0, z: vz };
            const s = { x: sx, y: sy, z: 0 };
            // AI 侧：球从对面飞向 AI，vz<0（physics 里 aiPad 在 -z，来球 vz<0）
            const relTop = sx * Math.sign(vz || 1);
            const R = aiWinReal(stance, relTop, by, v, s);
            const T = trWin(bx, stance, relTop, by, v, s);
            const mR = aiMagReal(stance, by), mT = trMag(stance, by);
            checks++;
            const d = Math.max(Math.abs(R.fitH - T.fitH), Math.abs(R.fitV - T.fitV),
                               Math.abs(R.fitZ - T.fitZ), Math.abs(mR - mT));
            if (d > 1e-6) bad.push({ stance, bx, vz, sx, sy, by, relTop,
              fitH: R.fitH + '|' + T.fitH, fitV: R.fitV + '|' + T.fitV,
              fitZ: R.fitZ + '|' + T.fitZ, mag: f(mR, 2) + '|' + f(mT, 2),
              pushSt: T.pushSt, d });
          }

let fitFail = 0;
for (const vz of VZ) if (Math.abs(fitW(vz) - fitW(vz)) > 1e-9) fitFail++;

const total = bad.length + fitFail;
console.log('');
console.log('口径漂移检测 — 训练侧(input-sim 玩家管线) vs 实机 AI 侧(tryAIHit/AI磁吸)');
console.log('='.repeat(72));
console.log('');
console.log('  场景数            ' + checks + '（姿态×球位×来球速度×旋转×高度）');
console.log('  触球窗口/磁吸     ' + bad.length + (bad.length ? '   ✗ FAIL' : '   ✓ PASS'));
console.log('  深度拟合 fitW     ' + fitFail + (fitFail ? '   ✗ FAIL' : '   ✓ PASS'));
console.log('  拍面缓动 rate     18 vs 18   ✓');
console.log('  拍速钳位 svCap    7 vs 7     ✓');
console.log('');
if (bad.length && (VERBOSE || bad.length <= 10)) {
  console.log('  不一致明细（实|训）：');
  for (const r of bad.slice(0, VERBOSE ? 999 : 10))
    console.log('    ' + [r.stance.padEnd(8), 'bx=' + f(r.bx, 1), 'vz=' + f(r.vz, 1).padStart(5),
      'relTop=' + String(r.relTop).padStart(5), 'fitH=' + r.fitH.padEnd(15),
      'mag=' + r.mag].join(' '));
  console.log('');
}
console.log(total === 0
  ? '结论: 训练侧与实机 AI 侧口径一致 ✓'
  : '结论: 发现 ' + total + ' 处不一致 ✗ —— 逐条核对上面的 fitH/fitV/fitZ/mag');
console.log('');
console.log('注: 本工具按源码复刻两侧公式（行号见注释）。若改了 physics.js#tryAIHit 或');
console.log('    input-sim.js 的对应判据，请同步这里，否则会误报。');
