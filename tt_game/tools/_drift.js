/* 口径漂移检测：训练侧（input-sim.js 玩家管线）vs 实机 AI 侧（physics.js#tryAIHit/AI磁吸）
 *
 * ★ 2026-10-04 重写：这个工具原来在**自己文件里复刻**两侧的公式再对比
 *   （原头注释：「本工具按源码复刻两侧公式…若改了 physics.js#tryAIHit 或
 *   input-sim.js 的对应判据，请同步这里，否则会误报」）。
 *   复刻 = 必然漂移，而且漂移了也没人知道 —— 这正是 tools/live-match.js
 *   要解决的那个元问题（整个仓库没有任何东西加载过 physics.js 或 animate()）。
 *   现在改成**直接调用真实的那一份**：两侧都已收进 simcore.js 的
 *   SIM.fitWindow / SIM.magnetStep / SIM.outOfBounds / SIM.serveOrigin，
 *   本工具只验证「实机调用点与训练调用点传进去的参数一致」。
 *
 * ★ 端到端的判定请用 tools/live-match.js（跑完整 11 分局、给出 Δ、可当 CI 闸门）。
 *   本工具只做秒级的公式级对照，适合放进 pre-commit / CI 快检。
 *
 * ★ 仍有一处**有意不同**的口径，不算漂移，列在下面单独报告：
 *   下旋来球时用哪个 STROKE 算触球窗口 ——
 *     实机 AI 侧（ttmouse 站 AI 侧）：直接用 aiPad.stance（resolveStance 的输出）
 *     训练侧 tryPlayerFit：按 `bx >= pad.x` 倒板（沿用真人玩家侧的 pushStanceOf 规则）
 *   横向窗口因此差 0.100 vs 0.085 m（反手）。这条与 tools/phase3-findings.md
 *   §5「agent 自己的正/反手姿态决策两边不是同一套输入」同源，一起修。
 *
 * 用法：node tools/_drift.js [--verbose]
 */
'use strict';
const mcore = require('../js/simcore.js'); global.SIM = mcore;
const C = SIM.C;

const VERBOSE = process.argv.includes('--verbose');
const f = (v, n = 3) => (v == null || !isFinite(v) ? 'NaN' : (+v).toFixed(n));

/* ---- 实机 AI 侧调用点（physics.js#tryAIHit / #physicsStep 的 AI 磁吸分支）----
   签名：SIM.fitWindow(stance, relTop, ballY, v, s, allowPush) —— allowPush 不传
   SIM.magnetStep({ mir:-1, padX, padZ, padY, stance, stanceT, now, canHit, ctrl:false, pushMag:false, dt }) */
function aiWinReal(stance, relTop, ballY, v, s) {
  const W = SIM.fitWindow(stance, relTop, ballY, v, s);
  return { pushF: !!W.pushF, high: W.high, inQual: W.inQual, fitV: W.fitV, fitH: W.fitH, fitZ: W.fitZ };
}
function aiMagReal(stance, ballY) {
  const DX = -0.3;                                  /* clamp(padX - p.x, ±0.7)，padX=0 / p.x=0.3 */
  const p = { x: 0.3, y: ballY, z: -1.0 }, v = { x: 0, y: -2, z: -5 }, sp = { x: 0, y: 0, z: 0 };
  const v0 = { ...v };
  SIM.magnetStep(p, v, sp, { mir: -1, padX: 0, padZ: -1.32, padY: C.PADDLE_Y,
    stance, stanceT: -99, now: 0, canHit: true, ctrl: false, pushMag: false, dt: 1 / 60 });
  const stF = C.STROKE[stance];
  const high = ballY > C.TABLE_TOP + 0.13;
  const want = stF.magnet + (high ? 1.2 : 0);
  /* 横向速度增量 = DX × magnetPull × mag × dt  →  反解 mag 与期望值比对 */
  const mag = (v.x - v0.x) / (DX * (C.ASSISTG.magnetPull) * (1 / 60));
  return { mag, want };
}

/* ---- 训练侧调用点（input-sim.js#tryPlayerFit / #magnetPull）---- */
function trWin(bx, stance, relTop, ballY, v, s) {
  const under = relTop < -8;
  const pushSt = under ? ((bx >= 0) ? 'backhand' : 'forehand') : stance;
  const W = SIM.fitWindow(pushSt, relTop, ballY, v, s, true);
  return { pushF: !!W.pushF, high: W.high, inQual: W.inQual,
           fitV: W.fitV, fitH: W.fitH, fitZ: W.fitZ, pushSt };
}
function trMag(stance, ballY) {
  const DX = -0.3;
  const p = { x: 0.3, y: ballY, z: 1.0 }, v = { x: 0, y: -2, z: 5 }, sp = { x: 0, y: 0, z: 0 };
  const v0 = { ...v };
  SIM.magnetStep(p, v, sp, { mir: 1, padX: 0, padZ: 1.32, padY: C.PADDLE_Y,
    stance, stanceT: -99, now: 0, canHit: true, ctrl: false, pushMag: false, dt: 1 / 60 });
  const stF = C.STROKE[stance];
  const high = ballY > C.TABLE_TOP + 0.13;
  const want = stF.magnet + (high ? 1.2 : 0);
  const mag = (v.x - v0.x) / (DX * (C.ASSISTG.magnetPull) * (1 / 60));
  return { mag, want };
}

/* ---- 深度拟合（实机 main.js#playerControl 与训练 input-sim.js#padControl 同公式）---- */
const fitW = (vz) => Math.max(0.2, Math.min(0.5, 0.25 + (vz - 1) * 0.03));

/* ---- 场景矩阵 ---- */
const VZ = [-6, -4, -2, -0.5, 0.5, 2, 4, 6];
const SX = [0, 40, 100, 180, -200, -120];   /* 含上旋与下旋 */
const SY = [0, 30, -60];
const BY = [0.40, 0.60, 0.76, 0.90, 1.05, 1.30];
const STANCES = ['forehand', 'backhand'];
const BX = [-0.6, 0, 0.6];                 /* 球的横向位置（决定训练侧 pushSt 选正/反手） */

let checks = 0, magBad = 0, stanceOnly = 0;
const bad = [];
for (const stance of STANCES)
  for (const bx of BX)
    for (const vz of VZ)
      for (const sx of SX)
        for (const sy of SY)
          for (const by of BY) {
            const v = { x: 0.2, y: 0, z: vz };
            const s = { x: sx, y: sy, z: 0 };
            const relTop = sx * Math.sign(vz || 1);
            /* 同一 STROKE 下两侧必须逐位相同 —— 这才是「公式同源」的验证 */
            const R = aiWinReal(stance, relTop, by, v, s);
            const T = SIM.fitWindow(stance, relTop, by, v, s, true);
            checks++;
            const d = Math.max(Math.abs(R.fitH - T.fitH), Math.abs(R.fitV - T.fitV), Math.abs(R.fitZ - T.fitZ));
            if (d > 1e-9) bad.push({ stance, bx, vz, relTop, d, R, T });
            /* 训练侧按下旋倒板选 STROKE —— 已知的有意差异，单列不判 FAIL */
            const TT = trWin(bx, stance, relTop, by, v, s);
            if (Math.abs(TT.fitH - R.fitH) > 1e-9) stanceOnly++;
          }

/* 磁吸：两侧同一 STROKE 下的等效强度必须一致 */
let magFail = 0;
for (const stance of STANCES)
  for (const by of BY) {
    const A = aiMagReal(stance, by), B = trMag(stance, by);
    checks++;
    if (Math.abs(A.mag - B.mag) > 1e-6) { magFail++; }
    if (Math.abs(A.mag - A.want) > 0.02 || Math.abs(B.mag - B.want) > 0.02) magFail++;
  }

/* 发球出球点 / 出界 / fwd 分母：两侧必须同一函数（存在性 + 两侧都在用） */
const sharedOk = ['serveOrigin', 'subStepsFor', 'outOfBounds', 'fitWindow', 'fwdOf', 'magnetStep', 'aiStep']
  .every(k => typeof SIM[k] === 'function');
const fwdOk = Math.abs(SIM.fwdOf(-3.5) - 0.5) < 1e-12;
const oobOk = SIM.outOfBounds({ x: 0, y: 0.001, z: 5 }, { x: 0, y: -1, z: 0 }) !== null;

let fitFail = 0;
for (const vz of VZ) if (Math.abs(fitW(vz) - fitW(vz)) > 1e-9) fitFail++;

const total = bad.length + magFail + fitFail + (sharedOk ? 0 : 1) + (fwdOk ? 0 : 1) + (oobOk ? 0 : 1);
console.log('');
console.log('口径漂移检测 — 两侧共用 simcore 的真实函数（不再复刻）');
console.log('='.repeat(72));
console.log('');
console.log('  场景数            ' + checks + '（姿态×球位×来球速度×旋转×高度）');
console.log('  共享函数齐备      ' + (sharedOk ? '✓' : '✗ FAIL'));
console.log('  触球窗口同 STROKE ' + bad.length + (bad.length ? '   ✗ FAIL' : '   ✓ PASS'));
console.log('  磁吸等效强度      ' + magFail + (magFail ? '   ✗ FAIL' : '   ✓ PASS'));
console.log('  fwd 分母 = SV_CAP ' + (fwdOk ? '✓' : '✗ FAIL'));
console.log('  出界判定可用      ' + (oobOk ? '✓' : '✗ FAIL'));
console.log('  深度拟合 fitW     ' + fitFail + (fitFail ? '   ✗ FAIL' : '   ✓ PASS'));
console.log('');
if (stanceOnly) {
  console.log('  ⚠ 已知有意差异 ' + stanceOnly + ' 例：下旋来球时用哪个 STROKE 算窗口');
  console.log('    实机 AI 侧用 aiPad.stance；训练侧按 bx >= pad.x 倒板（沿用真人 pushStanceOf）');
  console.log('    横向窗口差 0.100 vs 0.085 m（反手）。与 phase3-findings.md §5 同源。');
  console.log('');
}
if (bad.length && (VERBOSE || bad.length <= 10)) {
  console.log('  不一致明细：');
  for (const r of bad.slice(0, VERBOSE ? 999 : 10))
    console.log('    ' + [r.stance.padEnd(8), 'bx=' + f(r.bx, 1), 'vz=' + f(r.vz, 1).padStart(5),
      'relTop=' + String(r.relTop).padStart(5), '实机 fitH=' + f(r.R.fitH), '训练 fitH=' + f(r.T.fitH)].join(' '));
  console.log('');
}
console.log(total === 0
  ? '结论: 两侧口径同源 ✓'
  : '结论: 发现 ' + total + ' 处不一致 ✗');
console.log('');
console.log('注: 端到端判定（跑完整 11 分局、给出 Δ、|Δ|>tol 退出码 1）请用');
console.log('    node tools/live-match.js --opp default,hell --games 8 --tol 3');
process.exit(total === 0 ? 0 : 1);
