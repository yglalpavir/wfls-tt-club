/* =====================================================================
 * _adopt-hell.js — 把某一轮候选写进 js/learned-policy.js
 *
 * 用法：node tools/_adopt-hell.js <候选 json> <归档名> [标签说明]
 *   例：node tools/_adopt-hell.js tools/logs/_r5-candidate.json _shipped-20261018-r2-ingame "..."
 *
 * 流程（与 2026-10-18 首次采纳同一套）：
 *   1. 归档当前线上实机向量 P.strongVec() → tools/logs/<归档名>.json
 *      （这是「实机口径」的向量，也是下一轮当参照用的那份）
 *   2. 备份 js/learned-policy.js → js/learned-policy.js.bak-<日期>
 *   3. 按 train-hell.js 的生成模板重写 js/learned-policy.js
 *   4. 逐位校验：P.flattenPolicy(P.unflattenPolicy(vec)) === vec
 *              P.strongVec() === vec（最重要：strongVec 才是实机真正用的策略）
 * ===================================================================== */
'use strict';
const fs = require('fs');
const path = require('path');
const P = require(path.join(__dirname, '..', 'js', 'policy.js'));

const candFile = process.argv[2] || 'tools/logs/_r5-candidate.json';
const archiveName = process.argv[3] || '_shipped-20261018-r2-ingame';
const label = process.argv[4] || '';

const ROOT = path.join(__dirname, '..');
const cand = JSON.parse(fs.readFileSync(path.join(ROOT, candFile), 'utf8'));
if(!Array.isArray(cand.vec) || cand.vec.length !== P.POLICY_KEYS.length)
  throw new Error('候选向量长度不符: ' + (cand.vec && cand.vec.length));

/* ---- 1. 归档当前线上实机向量 ---- */
const archivePath = path.join(ROOT, 'tools', 'logs', archiveName + '.json');
/* ⚠️ P.strongVec() 返回的是【42 维向量数组】，不是策略对象。
 * 千万别写 P.flattenPolicy(P.strongVec()) —— 那样 42 条路径全部取不到，
 * 会静默回落 POLICY_DEFAULTS，归档文件里存的就不是真向量了（2026-10-19 踩过）。 */
const oldVec = P.strongVec().slice();
fs.writeFileSync(archivePath, JSON.stringify({
  vec: oldVec,
  note: '归档：采纳前线上地狱的【实机口径】向量（P.strongVec()）。用途：' +
        'node tools/_hell-h2h.js 200 8 --versus tools/logs/' + archiveName + '.json',
  archivedAt: new Date().toISOString(),
}, null, 2), 'utf8');
console.log('[1] 已归档当前线上实机向量 -> tools/logs/' + archiveName + '.json');

/* ---- 2. 备份原文件 ---- */
const target = path.join(ROOT, 'js', 'learned-policy.js');
const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, '');
const bak = target + '.bak-' + stamp;
fs.copyFileSync(target, bak);
console.log('[2] 已备份 -> js/learned-policy.js.bak-' + stamp);

/* ---- 3. 重写 ---- */
const learned = P.unflattenPolicy(cand.vec);
const meta = {
  fitness: cand.fitness,
  pointRateVsDefault: cand.vsDefault,
  pointRateVsPlayer: cand.vsPlayer,
  pointRateVsOldHell: 0.6030,
  vsPlayerOld: cand.vsPlayerOld,
  generations: cand.gens,
  seed: cand.seed,
  bestGen: cand.bestGen,
  mode: 'selfplay-42dim',
  trainedAt: '2026-10-19',
  adopted: 'manual (user-approved 2026-10-19)',
  decisiveEval: 'node tools/_hell-h2h.js 200 8 --versus tools/logs/_shipped-20261018-r2-ingame.json -> 3200 games dual-orientation = 60.30% vs the 2026-10-18 shipped hell (round 2 candidate)',
  note: 'pointRateVsOldHell is the decisive 3200-game number. vs nemesis = 55.36% (round 2 scored 38.20%), vs the 2026-09-13 hell = 53.30%. Holdout ladder (default/pusher/pb/grandslam) all within 1 SE of the previous policy - no collapse, no overfit. Raw LEARNED_POLICY already carries the guardrail values (2.8/0.03/2.6), so strongVec() overwriting is idempotent. See tools/hell-selfplay-findings.md sections 12-14.',
};

const out =
'/* =====================================================================\n' +
' *  learned-policy.js — 自动生成：node tools/train-hell.js\n' +
' *  自对弈续训学习到的 AI 策略（partial policy，未设字段回落 POLICY_DEFAULT）\n' +
' *  2026-10-19 采纳：第 5 轮「方案 C」520 代候选\n' +
' *    · 3200 局双向复评 vs 2026-10-18 线上（第 2 轮候选）= 60.30 %\n' +
' *    · vs 地狱 AI 克星 = 55.36 %（第 2 轮仅 38.20 %）\n' +
' *    · 留出集（default/pusher/pb/grandslam）无塌陷\n' +
' *  ' + label + '\n' +
' * ===================================================================== */\n' +
"'use strict';\n\n" +
'const LEARNED_POLICY = ' + JSON.stringify(learned, null, 2) + ';\n' +
'const LEARNED_META = ' + JSON.stringify(meta, null, 2) + ';\n' +
'/* Node 训练器/诊断可 require */\n' +
"if(typeof module !== 'undefined' && module.exports) module.exports = { LEARNED_POLICY, LEARNED_META };\n";

fs.writeFileSync(target, out, 'utf8');
console.log('[3] 已写入 js/learned-policy.js  bytes=' + Buffer.byteLength(out));

/* ---- 4. 逐位校验 ---- */
delete require.cache[require.resolve(path.join(ROOT, 'js', 'policy.js'))];
delete require.cache[require.resolve(target)];
/* ⚠️ 关键：policy.js 第 19–30 行在 require 时把 LEARNED_POLICY 挂到 global。
 * 只清 require.cache 是不够的 —— global.LEARNED_POLICY 还在，policy.js 里
 * `typeof LEARNED_POLICY === 'undefined'` 判false 就不会重新读文件，
 * 于是「逐位校验」比的是旧值（2026-10-19 踩过，表现为校验通过但文件没换）。 */
delete global.LEARNED_POLICY;
const P2 = require(path.join(ROOT, 'js', 'policy.js'));
const LP = require(target);

const rt = P2.flattenPolicy(P2.unflattenPolicy(cand.vec));
const drift = Math.max.apply(null, rt.map((v, i) => Math.abs(v - cand.vec[i])));
console.log('[4a] round-trip 最大偏差 = ' + drift.toExponential(2) + (drift < 1e-9 ? '  OK' : '  ✗ 过大'));

const live = P2.strongVec().slice();
const mism = live.filter((v, i) => Math.abs(v - cand.vec[i]) > 1e-12).length;
console.log('[4b] strongVec()（实机真正使用的策略）逐维不一致数 = ' + mism + (mism === 0 ? '  OK' : '  ✗'));
if(mism !== 0 || drift >= 1e-9){ console.error('校验失败！'); process.exit(1); }
console.log('[OK] 采纳完成，实机口径与候选向量完全一致。');
