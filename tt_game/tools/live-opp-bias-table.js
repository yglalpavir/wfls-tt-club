/* =====================================================================
 *  live-opp-bias-table.js — R4a：逐对手 bias 表的完整守卫扫描
 * =====================================================================
 *  R2b bandit 已证「nemesis 选 −0.05、hell 选 0」能在线收敛；三档守护
 *  （default/grandslam/elite + txBias −0.05）也全平。但「全平」是在
 *  −0.05 下测的；如果上线形式是「每对手一个 bias」，其它对手应该用 0
 *  （等价于现状）—— 严格说不需要再测。真正缺的是：
 *    1. nemesis −0.05 的**第三次独立复现**（不同 seed），
 *       排除「seed 20261004 恰好偏向 −0.05」的可能；
 *    2. hell-r5 上 {0, −0.05} 的 100 局配对（现有 −0.05 读数是 40 局）。
 *  本脚本用不同 seed 跑这两条。
 * ===================================================================== */
'use strict';
const { execFileSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const ROOT = path.join(__dirname, '..');
const seeds = [20261025, 20261101];
const jobs = [
  { opp: 'nemesis', cfg: 'data/hip/_cfg_txbias.json', tag: 'txb', games: 100 },
  { opp: 'nemesis', cfg: '', tag: 'base', games: 100 },
  { opp: 'hell', cfg: 'data/hip/_cfg_txbias.json', tag: 'txb', games: 100 },
  { opp: 'hell', cfg: '', tag: 'base', games: 100 },
];

function run(seed, opp, cfg, tag, games){
  const out = path.join(ROOT, 'data', 'hip', `s${seed}-${tag}-${opp}100.txt`);
  const args = ['tools/hip-eval.js', '--controller', 'hip', '--opp', opp,
                '--games', String(games), '--maxsec', '120', '--move-cap', '2.0',
                '--seed', String(seed)];
  if(cfg) args.push('--hip-cfg', cfg);
  args.push('>', out, '2>&1');
  console.log('[run] seed ' + seed + ' ' + tag + ' vs ' + opp + ' …');
  execFileSync('cmd', ['/c', 'node ' + args.join(' ')], { cwd: ROOT, stdio: 'ignore' });
  const t = fs.readFileSync(out, 'utf8').split('\n')[4] || '';
  console.log('      ' + t.trim().slice(0, 100));
}

for(const s of seeds){
  for(const j of jobs) run(s, j.opp, j.cfg, j.tag, j.games);
}
console.log('done');
