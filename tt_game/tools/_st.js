/* 训练状态速读：node tools/_st.js [run-name] */
'use strict';
const fs = require('fs');
const path = require('path');
const run = process.argv[2] || 'input3-v4';
const p = path.join(__dirname, '..', 'data', 'checkpoints', run, 'index.json');
if (!fs.existsSync(p)) { console.log('还没有 ' + p); process.exit(0); }
const d = JSON.parse(fs.readFileSync(p, 'utf8'));
const pc = (v) => (v != null ? (v * 100).toFixed(1) + '%' : '—');

console.log('=== 新口径基线（起点权重真实水平）===');
for (const k of ['default', 'hell', 'elite', 'extreme', 'extreme-max'])
  if (d.base && d.base[k] != null) console.log('  ' + k.padEnd(13) + pc(d.base[k]));
console.log('  baseBest ' + pc(d.baseBest));

const b = d.best || {};
console.log('');
console.log('=== 当前最佳 ===');
console.log('  ep' + (b.ep != null ? b.ep : '?') + '  best=' + pc(b.best));
if (b.wr) for (const k of ['default', 'hell', 'elite', 'extreme', 'extreme-max'])
  if (b.wr[k] != null) console.log('    ' + k.padEnd(13) + pc(b.wr[k]));

const c = d.cur || {};
console.log('');
console.log('=== 进度 ===');
console.log('  ep' + (c.ep != null ? c.ep : '?') +
  '  eps=' + (c.eps != null ? c.eps.toFixed(3) : '?') +
  '  训练胜率=' + pc(c.trainW) +
  '  累计=' + (c.sec != null ? (c.sec / 60).toFixed(0) + 'min' : '?'));
console.log('  断点: ' + (d.checks || []).map(x => 'ep' + x.ep).join('  '));

const cp = path.join(__dirname, '..', 'data', 'checkpoints', run, 'curve.json');
if (fs.existsSync(cp)) {
  const cur = JSON.parse(fs.readFileSync(cp, 'utf8'));
  console.log('');
  console.log('=== 曲线（' + cur.length + ' 轮）===');
  const nm = { default: '默认', hell: '地狱', elite: '精英', extreme: '极端', 'extreme-max': '满档' };
  const key = { default: 'wrDefault', hell: 'wrHell', elite: 'wrElite', extreme: 'wrExtreme', 'extreme-max': 'wrExtremeMax' };
  for (const r of cur.slice(-8))
    console.log('  ep' + String(r.ep).padEnd(6) +
      'best=' + (r.best != null ? r.best.toFixed(1) : '—').padStart(5) + '  ' +
      /* curve.json 的 wr* 字段存的就是百分比，别再乘 100（index.json 里的才是小数） */
      Object.keys(nm).map(k => nm[k] + (r[key[k]] != null ? r[key[k]].toFixed(1) + '%' : '—')).join('  '));
}