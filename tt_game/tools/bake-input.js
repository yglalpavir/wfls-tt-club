/* bake-input.js：把某份输入级 DQN 权重烘焙进 js/input-weights.js（浏览器直接用）
 * 用法：node tools/bake-input.js <src.json> [evalHell] [evalDefault] [opp标签]
 * src.json 需为输入级 agent 存档（{o, w} 或 {o, net}）
 *   evalHell / evalDefault：终评胜率（0~1），写进 INPUT_AI_META 供页面展示
 *   opp 标签：对手来源说明，默认 'hell'；课程续训产物传 'ladder'
 * nActions / 网络形状一律从权重本身推断，避免硬编码把 238 与 952 动作网搞混。 */
'use strict';
const fs = require('fs');
const path = require('path');
const src = process.argv[2] || path.join(__dirname, '..', 'data', 'input-ai.json');
const evH = process.argv[3] != null ? parseFloat(process.argv[3]) : 0;
const evD = process.argv[4] != null ? parseFloat(process.argv[4]) : 0;
const opp = process.argv[5] || 'hell';
const b = JSON.parse(fs.readFileSync(src, 'utf8'));
const net = b.w || b.net;
if(!net || !Array.isArray(net) || net.length !== 4){
  console.error('权重格式不符（需要 4 层 [in→h1→h2→h3→out]）：' + src);
  process.exit(1);
}
/* 层尺寸：{W:[[..]]} 行=输出维；直接数组则取 length */
const shape = net.map(l => {
  const W = Array.isArray(l) ? l : l.W;
  const rows = Array.isArray(W) ? W.length : null;
  const cols = Array.isArray(W) && Array.isArray(W[0]) ? W[0].length : (Array.isArray(l) ? null : null);
  return [rows, cols];
});
const nActions = (Array.isArray(net[3]) ? net[3].length : net[3].W.length)
                 || (b.o && b.o.nActions) || 0;
if(!nActions){ console.error('无法推断动作数：' + src); process.exit(1); }
const inDim = shape[0][1];
const hSizes = [shape[0][0], shape[1][0], shape[2][0]];
const trainedAt = new Date().toISOString().slice(0, 10);
const meta = {
  version: 1,
  trainedAt,
  opp,
  src: path.relative(path.join(__dirname, '..'), src).split(path.sep).join('/'),
  nActions,
  hSizes,
  evalDefault: evD, evalHell: evH,
};
const baked = { version: 1, trainedAt, opp, src: meta.src, nActions, hSizes, evalDefault: evD, evalHell: evH, net };
const out = '/* 自动生成：' + path.basename(src) + '（输入级 DQN 权重，' + nActions + ' 动作 · ' + hSizes.join('/') + '） */\n'
  + 'const INPUT_AI_WEIGHTS = ' + JSON.stringify(baked) + ';\n'
  + 'const INPUT_AI_META = ' + JSON.stringify(meta) + ';\n'
  + 'if(typeof module !== "undefined" && module.exports) module.exports = { INPUT_AI_WEIGHTS, INPUT_AI_META };\n';
fs.writeFileSync(path.join(__dirname, '..', 'js', 'input-weights.js'), out, 'utf8');
console.log('已烘焙 js/input-weights.js ← ' + path.basename(src)
  + '（' + inDim + '→' + hSizes.join('→') + '→' + nActions + '，opp=' + opp + '）');
