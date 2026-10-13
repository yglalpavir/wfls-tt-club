#!/usr/bin/env node
/* 重测 finalize 基线：用 finalize 自己的口径（liveRun）跑一遍线上权重，
 * 把 live / sim / delta / worstDelta 全部填成真数。
 *
 * 为什么必须做：baseline-live.json 原来是 --live-only 测的，sim 只从训练器抄了
 * 3 局冒烟采样，delta 全 null、worstDelta 全空。_finalize-12h.js 读
 * `Math.abs(base.worstDelta || 0)` → 0，于是闸门 C1 变成
 * 「候选的 |sim−live| 必须 ≤ 0 + 3pp」。而仿真已经饱和到 93~97%，实机只有 38~89%，
 * 任何候选的 |Δ| 都是 30~60pp —— **C1 永远不可能通过**，
 * 12h 会在最后一步被判「未达标」，白跑。
 *
 * 用法：node tools/_refresh-baseline.js [--games 30] [--seed 20261004] [--opp default,hell,grandslam]
 */
'use strict';
const fs = require('fs'), path = require('path');
const { execFileSync } = require('child_process');
const ROOT = path.resolve(__dirname, '..');

function argOf(f, d){ const i = process.argv.indexOf(f); return i > 0 ? process.argv[i + 1] : d; }
const GAMES   = parseInt(argOf('--games', '30'), 10);
const SEED    = argOf('--seed', '20261004');
const LEVELS  = argOf('--opp', 'default,hell,grandslam').split(',').map(s => s.trim());
const SRCW    = argOf('--src', 'data/checkpoints/input3-12h/ckpt-008500.json');
const BASE_P  = path.resolve(ROOT, argOf('--out', 'tools/logs/baseline-live.json'));

console.log('== 重测 finalize 基线（sim + live，同 finalize 口径）==');
console.log('权重 ' + SRCW + ' · 每档 ' + GAMES + ' 局 · seed ' + SEED +
            ' · 档位 ' + LEVELS.join(','));

/* 与 _finalize-12h.js#liveRun 同一套解析：表格行「  档位  live%  sim%  ±Xpp」 */
const out = execFileSync(process.execPath,
  ['tools/live-match.js', '--from', SRCW, '--opp', LEVELS.join(','),
   '--games', String(GAMES), '--seed', SEED],
  { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
process.stdout.write(out + '\n');

const live = {}, sim = {}, delta = {};
let worst = 0;
for (const line of out.split('\n')){
  const m = line.match(/^\s{2}(\S+)\s+([\d.]+)%\s+([\d.]+)%\s+([+-][\d.]+)pp/);
  if (!m) continue;
  live[m[1]] = parseFloat(m[2]) / 100;
  sim[m[1]]  = parseFloat(m[3]) / 100;
  delta[m[1]] = parseFloat(m[4]);
  if (Math.abs(parseFloat(m[4])) > Math.abs(worst)) worst = parseFloat(m[4]);
}
if (!Object.keys(live).length){
  console.error('✗ 没解析到阶梯结果（live-match 输出格式变了？）—— 拒绝改写基线');
  process.exit(1);
}

/* 加权分口径必须与 finalize 一致：0.75*top + 0.25*default（--top hell） */
const TOP = argOf('--top', 'hell');
const weighted = 0.75 * (live[TOP] || 0) + 0.25 * (live.default || 0);

const old = fs.existsSync(BASE_P) ? JSON.parse(fs.readFileSync(BASE_P, 'utf8')) : {};
const next = Object.assign({}, old, {
  note: '游戏**当前**加载的那份权重在**当前代码**上的表现，含 sim/live/delta 三档完整口径' +
        '（2026-10-14 第 5 轮用 tools/_refresh-baseline.js 重测）。闸门 C1 读 delta.worstDelta，' +
        '缺这一项会让 C1 变成「|Δ| ≤ 3pp」而永远不通过。',
  at: new Date().toISOString(),
  games: GAMES, seed: SEED, top: TOP,
  weights: 'js/input-weights.js',
  srcWeights: SRCW,
  code: old.code || 'lateralPrior=on（js/input-agent.js#bestAction）',
  live, sim, delta,
  worstDelta: worst,
  weighted: Number(weighted.toFixed(4)),
});
fs.writeFileSync(BASE_P, JSON.stringify(next, null, 1), 'utf8');
console.log('\n✔ 已写入 ' + path.relative(ROOT, BASE_P));
console.log('  live      ' + JSON.stringify(live));
console.log('  sim       ' + JSON.stringify(sim));
console.log('  delta(pp) ' + JSON.stringify(delta));
console.log('  worstDelta ' + worst + 'pp   → 闸门 C1 上限 ' + (Math.abs(worst) + 3).toFixed(1) + 'pp');
console.log('  weighted   ' + next.weighted + '（top=' + TOP + '）');