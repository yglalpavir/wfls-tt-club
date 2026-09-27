// 回归测试：draws.json 过一遍 dcCleanDraw 后，_en 字段必须一个不少
const fs = require('fs');
const path = require('path');
const root = path.dirname(__dirname === '.' ? __dirname : process.cwd());
const src = fs.readFileSync(path.join(process.cwd(), 'js', 'draws-core.js'), 'utf8');
const sandbox = {};
// draws-core 依赖 window/DOM，只取纯数据函数
new Function('window', 'document', src + '\n;window.__dc = { dcCleanDraw, dcCleanCard };')(sandbox, {});
const dc = sandbox.__dc;

const draws = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'data', 'draws.json'), 'utf8'));

const countEn = (o) => {
  let n = 0;
  const walk = (v) => {
    if (Array.isArray(v)) return v.forEach(walk);
    if (v && typeof v === 'object') {
      for (const [k, val] of Object.entries(v)) {
        if (k.endsWith('_en')) n++; else walk(val);
      }
    }
  };
  walk(o);
  return n;
};

let bad = 0;
for (const d of draws) {
  const before = countEn(d);
  const after = countEn(dc.dcCleanDraw(d));
  const ok = before === after;
  if (!ok) bad++;
  console.log(`${d.id}: _en fields before=${before} after=${after} ${ok ? 'OK' : 'LOST ' + (before - after)}`);
}
console.log(bad === 0 ? '\nPASS: draws round-trip preserves every _en field' : `\nFAIL: ${bad} draw(s) lost translations`);
process.exit(bad === 0 ? 0 : 1);
