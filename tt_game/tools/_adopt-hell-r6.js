/* =====================================================================
 * _adopt-hell-r6.js — 把第六轮候选写进 js/learned-policy.js（2026-10-26）
 *
 * 用法：node tools/_adopt-hell-r6.js <候选json> <归档名> <h2h-vs-online%> <hipDeltaPP> <hipP>
 *   例：node tools/_adopt-hell-r6.js tools/train-hell-candidate.json _shipped-20261019-r5-ingame 55.3 2.1 0.013
 *
 * 流程与 _adopt-hell.js（2026-10-19 首次采纳）同一套，meta 改为从第六轮候选
 * JSON 与实配对评测数字填充。四步：归档线上实机向量 → 备份 → 重写 → 全新进程
 * 逐位校验（必须先 delete global.LEARNED_POLICY，见 _adopt-hell.js 坑 2）。
 * ===================================================================== */
'use strict';
const fs = require('fs');
const path = require('path');
const P = require(path.join(__dirname, '..', 'js', 'policy.js'));

const candFile = process.argv[2];
const archiveName = process.argv[3];
const h2hOnline = process.argv[4];   // 例 "55.31"（3200 局双向 vs 线上）
const hipDelta = process.argv[5];    // 例 "+2.10"（HIP 实机配对 Δ，pp）
const hipP = process.argv[6];        // 例 "0.013"
if(!candFile || !archiveName || !h2hOnline || !hipDelta || !hipP){
  console.error('用法: node tools/_adopt-hell-r6.js <候选json> <归档名> <h2h-vs-online%> <hipDeltaPP> <hipP>');
  process.exit(1);
}
const ROOT = path.join(__dirname, '..');
const cand = JSON.parse(fs.readFileSync(path.join(ROOT, candFile), 'utf8'));
if(!Array.isArray(cand.vec) || cand.vec.length !== P.POLICY_KEYS.length)
  throw new Error('候选向量长度不符: ' + (cand.vec && cand.vec.length));

/* ---- 1. 归档当前线上实机向量（strongVec() 直接就是 42 维数组，别再 flatten）---- */
const archivePath = path.join(ROOT, 'tools', 'logs', archiveName + '.json');
const oldVec = P.strongVec().slice();
fs.writeFileSync(archivePath, JSON.stringify({
  vec: oldVec,
  note: '归档：2026-10-26 采纳前线上地狱（第 5 轮候选）的【实机口径】向量（P.strongVec()）。用途：' +
        'node tools/_hell-h2h.js 200 8 --versus tools/logs/' + archiveName + '.json',
  archivedAt: new Date().toISOString(),
}, null, 2), 'utf8');
console.log('[1] 已归档当前线上实机向量 -> tools/logs/' + archiveName + '.json');

/* ---- 2. 备份原文件 ---- */
const target = path.join(ROOT, 'js', 'learned-policy.js');
const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, '');
fs.copyFileSync(target, target + '.bak-' + stamp);
console.log('[2] 已备份 -> js/learned-policy.js.bak-' + stamp);

/* ---- 3. 重写（train-hell.js 生成模板）---- */
const learned = P.unflattenPolicy(cand.vec);
const meta = {
  fitness: cand.fitness,
  pointRateVsDefault: cand.vsDefault,
  pointRateVsPlayer: cand.vsPlayer,
  pointRateVsOldHell: parseFloat(h2hOnline) / 100,
  vsPlayerOld: cand.vsPlayerOld,
  generations: cand.gens,
  seed: cand.seed,
  bestGen: cand.bestGen,
  mode: 'selfplay-42dim-round6-planD',
  trainedAt: '2026-10-26',
  adopted: 'manual (pre-authorized by user 2026-10-26: bake if stronger)',
  decisiveEval: 'node tools/_hell-h2h.js 200 8 --versus tools/logs/' + archiveName + '.json -> 3200 games dual-orientation = ' + h2hOnline + '% vs the round-5 shipped hell; PRIMARY (user-designated): HIP live paired eval delta = ' + hipDelta + 'pp (p=' + hipP + ', 12 seeds x 12 games, live-match --controller hip --hell-vec)',
  note: 'Round 6 (Plan D): fresh-nemesis reference pinned at 0.30 (Phase A product, NOT adopted for visitors); pool nemesis2/self/r2/nemesis/pb/default. See tools/hell-selfplay-findings.md section 16 + 17. Raw LEARNED_POLICY already carries the guardrail values (2.8/0.03/2.6), so strongVec() overwriting stays idempotent.',
};
const out =
'/* =====================================================================\n' +
' *  learned-policy.js — 自动生成：node tools/train-hell.js\n' +
' *  自对弈续训学习到的 AI 策略（partial policy，未设字段回落 POLICY_DEFAULT）\n' +
' *  2026-10-26 采纳：第 6 轮「方案 D」候选（新鲜克星进池 + HIP 实机主判据）\n' +
' *    · 3200 局双向复评 vs 2026-10-19 线上（第 5 轮候选）= ' + h2hOnline + ' %\n' +
' *    · 主判据（用户指定）：HIP 实机配对评测 Δ = ' + hipDelta + ' pp（p=' + hipP + '）\n' +
' *  ' + (cand.nemesis2 ? '· 方案D：参照池钉死新鲜克星（Phase A 产物，未采纳给访客）\n' : '') +
' * ===================================================================== */\n' +
"'use strict';\n\n" +
'const LEARNED_POLICY = ' + JSON.stringify(learned, null, 2) + ';\n' +
'const LEARNED_META = ' + JSON.stringify(meta, null, 2) + ';\n' +
'/* Node 训练器/诊断可 require */\n' +
"if(typeof module !== 'undefined' && module.exports) module.exports = { LEARNED_POLICY, LEARNED_META };\n";

fs.writeFileSync(target, out, 'utf8');
console.log('[3] 已写入 js/learned-policy.js  bytes=' + Buffer.byteLength(out));

/* ---- 4. 全新进程逐位校验 ----
 * ⚠ 必须先 delete global.LEARNED_POLICY（policy.js require 时挂 global），
 *   否则 typeof 判 false 跳过重读，校验比的是旧值（2026-10-19 踩过）。 */
delete require.cache[require.resolve(path.join(ROOT, 'js', 'policy.js'))];
delete require.cache[require.resolve(target)];
delete global.LEARNED_POLICY;
const P2 = require(path.join(ROOT, 'js', 'policy.js'));
const LP = require(target);

const rt = P2.flattenPolicy(P2.unflattenPolicy(cand.vec));
const drift = Math.max.apply(null, rt.map((v, i) => Math.abs(v - cand.vec[i])));
console.log('[4a] round-trip 最大偏差 = ' + drift.toExponential(2) + (drift < 1e-9 ? '  OK' : '  ✗ 过大'));

const live = P2.strongVec().slice();
const mism = live.filter((v, i) => Math.abs(v - cand.vec[i]) > 1e-12).length;
console.log('[4b] strongVec()（实机真正使用的策略）逐维不一致数 = ' + mism + (mism === 0 ? '  OK' : '  ✗'));
console.log('[4c] 前三维（护栏）= ' + live[0] + ' / ' + live[1] + ' / ' + live[2] + ' （应为 2.8/0.03/2.6）');
if(mism !== 0 || drift >= 1e-9){ console.error('校验失败！'); process.exit(1); }
console.log('[OK] 采纳完成，实机口径与候选向量完全一致。');
