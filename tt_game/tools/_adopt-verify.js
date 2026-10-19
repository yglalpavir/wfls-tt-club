/* =====================================================================
 * _adopt-verify.js — 采纳后复核 + 修正归档
 *
 * 背景（2026-10-19 的一个真 bug）：
 *   P.strongVec() 返回的是【向量数组】，不是策略对象。
 *   写成 P.flattenPolicy(P.strongVec()) 会把数组当策略对象读，
 *   所有路径都取不到 → 全部回落 POLICY_DEFAULTS，于是「逐位比对」看起来 42 维全错，
 *   而且归档文件也悄悄存成了默认值。
 *   正确用法：P.strongVec() 直接就是 vec 数组，和 cand.vec 逐位比。
 *
 * 本脚本做三件事：
 *   1. 从备份 js/learned-policy.js.bak-20261019 还原【被替换掉的 R2】的实机向量，
 *      写进 tools/logs/_shipped-20261018-r2-ingame.json（归档必须是真的 R2）
 *   2. 校验当前线上：P.strongVec() 逐位 == R5 候选向量
 *   3. 交叉核对：备份里的 R2 向量 == tools/logs/_run330-candidate.json 的 vec
 * ===================================================================== */
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const P = require(path.join(ROOT, 'js', 'policy.js'));

const R5 = JSON.parse(fs.readFileSync(path.join(ROOT, 'tools/logs/_r5-candidate.json'), 'utf8'));
const R2SRC = JSON.parse(fs.readFileSync(path.join(ROOT, 'tools/logs/_run330-candidate.json'), 'utf8'));

/* ---- 1. 从备份还原 R2 的实机向量 ---- */
const bakFile = path.join(ROOT, 'js', 'learned-policy.js.bak-20261019');
const bakLP = require(bakFile);
const r2vec = P.flattenPolicy(bakLP.LEARNED_POLICY);
const r2drift = Math.max.apply(null, r2vec.map((v, i) => Math.abs(v - R2SRC.vec[i])));
console.log('[1] 备份里的 R2 向量 vs _run330-candidate.json：最大偏差 = ' + r2drift.toExponential(2) +
            (r2drift < 1e-9 ? '  OK（同一策略）' : '  ✗ 不一致'));

const archPath = path.join(ROOT, 'tools', 'logs', '_shipped-20261018-r2-ingame.json');
fs.writeFileSync(archPath, JSON.stringify({
  vec: r2vec,
  note: '归档：2026-10-18 线上地狱（= 第 2 轮候选）在被 2026-10-19 第 5 轮候选替换前的【实机口径】向量。' +
        '用途：node tools/_hell-h2h.js 200 8 --versus tools/logs/_shipped-20261018-r2-ingame.json',
  archivedAt: new Date().toISOString(),
}, null, 2), 'utf8');
console.log('[2] 已重写 tools/logs/_shipped-20261018-r2-ingame.json（真实 R2 向量）');

/* ---- 3. 校验当前线上 == R5 候选 ---- */
const live = P.strongVec();                 // ← 向量数组，直接比
const mism = [];
for(let i = 0; i < R5.vec.length; i++){
  if(Math.abs(live[i] - R5.vec[i]) > 1e-12) mism.push({ i, live: live[i], want: R5.vec[i] });
}
console.log('[3] 当前线上 P.strongVec() 逐维比对 R5 候选：不一致维数 = ' + mism.length +
            (mism.length === 0 ? '  OK' : '  ✗'));
if(mism.length) console.log('    ' + JSON.stringify(mism.slice(0, 10)));

/* ---- 4. 护栏幂等性：前三维应已是 2.8/0.03/2.6 ---- */
console.log('[4] 前三维（护栏）= ' + live[0] + ' / ' + live[1] + ' / ' + live[2] +
            (live[0] === 2.8 && live[1] === 0.03 && live[2] === 2.6 ? '  OK（幂等）' : '  ✗'));

if(mism.length || r2drift >= 1e-9){ console.error('校验未通过'); process.exit(1); }
console.log('[OK] 采纳状态与归档全部正确。');
