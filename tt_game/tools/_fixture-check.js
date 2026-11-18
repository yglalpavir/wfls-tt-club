/* =====================================================================
 *  _fixture-check.js — R51：阵容定格回归脚本（fixture 驱动）
 * =====================================================================
 *  R45 承诺「改动后重跑同口径，任一档出带即报警」。本脚本把它自动化：
 *    node tools/_fixture-check.js [--quick]
 *  流程：读 §13㉛ fixture 基准（硬编码五档读数）→ 重跑五档（--quick 只跑
 *  hell/nemesis2 两档各 20 局）→ 对照（Wilson CI 与基准 CI 重叠 = 带内）→
 *  出带报警（exit 1）。
 *  基准（R45，seed 20261004，40 局/档）：
 *    hell 75.3 [68.0,81.5] / nemesis(表) 72.5 [63.9,79.7] /
 *    nemesis2(表) 71.1 [63.4,77.8] / default 99.5 [98.2,99.9] /
 *    grandslam 99.2 [97.6,99.7]
 * ===================================================================== */
'use strict';
const { spawnSync } = require('child_process');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');
const QUICK = process.argv.includes('--quick');

const FIXTURE = [
  { opp: 'hell',      lo: 68.0, hi: 81.5, rate: 75.3 },
  { opp: 'nemesis',   lo: 63.9, hi: 79.7, rate: 72.5, cfg: 'data/hip/_cfg_roster.json' },
  { opp: 'nemesis2',  lo: 63.4, hi: 77.8, rate: 71.1, cfg: 'data/hip/_cfg_roster.json' },
  { opp: 'default',   lo: 98.2, hi: 99.9, rate: 99.5 },
  { opp: 'grandslam', lo: 97.6, hi: 99.7, rate: 99.2 },
];
const TIERS = QUICK ? ['hell', 'nemesis2'] : FIXTURE.map(f => f.opp);
const GAMES = QUICK ? 20 : 40;

let fail = 0;
for(const opp of TIERS){
  const f = FIXTURE.find(x => x.opp === opp);
  const args = ['tools/hip-eval.js', '--controller', 'hip', '--opp', opp,
                '--games', String(GAMES), '--maxsec', '120', '--move-cap', '2.0'];
  if(f.cfg) args.push('--hip-cfg', f.cfg);
  const r = spawnSync(process.execPath, args, { cwd: ROOT, encoding: 'utf8', maxBuffer: 1 << 26 });
  const m = (r.stdout || '').match(/(\S+)\s+(\d+\.\d)%\s+\[(\d+\.\d),(\d+\.\d)\]/);
  if(!m){ console.log('✗ ' + opp + ': 解析失败\n' + (r.stderr || r.stdout || '').slice(-400)); fail++; continue; }
  const rate = parseFloat(m[2]);
  const inBand = rate >= f.lo && rate <= f.hi;
  console.log((inBand ? '✓' : '✗') + ' ' + opp.padEnd(10) + ' ' + rate.toFixed(1) +
              '%  (fixture ' + f.rate.toFixed(1) + '% [' + f.lo + ',' + f.hi + '])' +
              (GAMES !== 40 ? '  [quick ' + GAMES + ' 局]' : ''));
  if(!inBand) fail++;
}
console.log(fail ? ('\n✗ ' + fail + ' 档出带 —— 阵容回归报警！') : '\n✓ 全部档带内 —— 阵容回归通过');
process.exit(fail ? 1 : 0);
