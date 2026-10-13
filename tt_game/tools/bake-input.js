/* bake-input.js：把某份输入级 DQN 权重烘焙进 js/input-weights.js（浏览器直接用）
 * 用法：node tools/bake-input.js <src.json> [evalHell] [evalDefault] [opp标签] [ladderLive] [simEval] [--force]
 * src.json **必填**。曾经这里是可选的、默认 data/input-ai.json —— 那份是 238 动作的
 * 旧网，于是 `node tools/bake-input.js`（不带参数）会把一份实机加载不起来的垃圾权重
 * 直接盖掉 js/input-weights.js，还把 eval 胜率静默写成 0。烘焙是不可逆动作
 * （实机懒加载的就是这个文件），所以从「忘了传参数」升级为硬报错。
 * src.json 需为输入级 agent 存档（{o, w} 或 {o, net}）
 *   evalHell / evalDefault：**实机管线**实测胜率（0~1），写进 INPUT_AI_META 供页面展示。
 *     必须是实机值 —— 这两个数字是玩家唯一能看到的胜率，写仿真值等于对外宣称
 *     一个游戏里不存在的水平（线上那份曾写 evalHell:0.75 / 实机 2.4%）。
 *     由 _finalize-12h.js 从 tools/live-match.js 的实测结果传入。
 *     不传 = 写 0，只适合调试，正式烘焙必须传。
 *   opp 标签：对手来源说明，默认 'hell'；课程续训产物传 'ladder'
 *   ladderLive：可选 JSON 字符串，实机管线逐档实测值（留痕，便于日后查 sim/live 岔开）
 *   simEval：可选 JSON 字符串，同一份权重的仿真值，仅作对照
 *   --force：形状与当前 input-agent.js 对不上时仍然烘焙（明知故犯，得自己负责）
 * nActions / 网络形状一律从权重本身推断，避免硬编码把 238 与 952 动作网搞混，
 * 再与 input-agent.js 的 ACT_N / OBS_N / HSIZES 对账——对不上直接 exit 2。 */
'use strict';
const fs = require('fs');
const path = require('path');
const IA = require(path.join(__dirname, '..', 'js', 'input-agent.js'));
const argv = process.argv.slice(2).filter(a => a !== '--force');
const force = process.argv.slice(2).indexOf('--force') >= 0;
if(!argv.length){
  console.error('用法：node tools/bake-input.js <src.json> [evalHell] [evalDefault] [opp标签] [ladderLive] [simEval] [--force]');
  console.error('  src 必填——烘焙会直接覆盖实机在用的 js/input-weights.js，不接受默认值。');
  process.exit(2);
}
const src = path.resolve(argv[0]);
if(!fs.existsSync(src)){ console.error('权重文件不存在：' + src); process.exit(2); }
/* ★ 2026-10-14（R5）修正：argv = process.argv.slice(2)，所以 argv[0] 是 <src.json>，
 * 胜率等可选参数从 argv[1] 起。原来的下标整组偏移了一位（argv[2]/[3]/[4]/[5]/[6]），
 * 后果有三重，且都很难一眼看出来：
 *   1. 传进来的 evalHell 被当成 evalDefault、evalDefault 被 parseFloat 成 NaN
 *      （JSON.stringify(NaN) → null），**页面上给玩家看的两个胜率整个错位**；
 *   2. opp 标签取到了 ladderLive 的 JSON 原文，meta.opp 变成一坨 JSON 字符串；
 *   3. 最要命的是 _finalize-12h.js L318 的调用把 'tools/bake-input.js' 当成 argv[0]，
 *      于是 src 解析成**脚本自己** —— 它确实 existsSync 通过，但 JSON.parse 一个
 *      .js 源文件必然 SyntaxError，收尾阶段直接崩在烘焙这一步（12h 训练白跑）。
 * 现在的下标与头部用法注释、以及 _finalize-12h.js 的调用方式三方一致。 */
const evH = argv[1] != null ? parseFloat(argv[1]) : 0;
const evD = argv[2] != null ? parseFloat(argv[2]) : 0;
const opp = argv[3] || 'hell';
/* 实机 / 仿真对照都是可选的；传了就记，解析失败不致命（不能因为留痕字段
 * 坏掉就整个烘焙失败 —— 权重本身才是要紧的）。 */
function parseOpt(s, fallback){ if(!s) return fallback; try { return JSON.parse(s); } catch(e){ return fallback; } }
const ladderLive = parseOpt(argv[4], null);
const simEval = parseOpt(argv[5], null);
/* 这两个数是**页面上给玩家看的**胜率，位置错了要能当场发现，不能靠事后看页面。
 * （offset bug 的教训：错位时它们一个变成 NaN→null、一个串到别的档位。） */
const badNum = [];
if(argv[1] != null && !isFinite(evH)) badNum.push('evalHell=' + JSON.stringify(argv[1]));
if(argv[2] != null && !isFinite(evD)) badNum.push('evalDefault=' + JSON.stringify(argv[2]));
if(evH < 0 || evH > 1) badNum.push('evalHell=' + evH + ' 不在 0~1');
if(evD < 0 || evD > 1) badNum.push('evalDefault=' + evD + ' 不在 0~1');
if(badNum.length){
  console.error('❌ 拒绝烘焙：胜率参数不是 0~1 的数（多半是位置传错了）');
  for(const b of badNum) console.error('    ' + b);
  console.error('    用法：<src.json> [evalHell] [evalDefault] [opp标签] [ladderLive] [simEval]');
  process.exit(2);
}
const b = JSON.parse(fs.readFileSync(src, 'utf8'));
const net = b.w || b.net;
/* 层数不再硬编码 4：网络可以加深（2026-10-02 起是 88→256→384→256→952，仍是 4 层，
 * 但架构允许更深）。只要求「至少 2 层」——一层没有隐藏层，不该出现在这。 */
if(!net || !Array.isArray(net) || net.length < 2){
  console.error('权重格式不符（需要 [in→h1→…→out] 的多层数组）：' + src);
  process.exit(1);
}
/* 层尺寸：{W:[[..]]} 行=输出维；直接数组则取 length */
const shape = net.map(l => {
  const W = Array.isArray(l) ? l : l.W;
  const rows = Array.isArray(W) ? W.length : null;
  const cols = Array.isArray(W) && Array.isArray(W[0]) ? W[0].length : (Array.isArray(l) ? null : null);
  return [rows, cols];
});
/* 动作数取**最后一层**（输出层），不能写死 net[3]——层数变了就取错位置。 */
const last = net[net.length - 1];
const nActions = (Array.isArray(last) ? last.length : (last.W && last.W.length))
                 || (b.o && b.o.nActions) || 0;
if(!nActions){ console.error('无法推断动作数：' + src); process.exit(1); }
const inDim = shape[0][1];
const hSizes = [shape[0][0], shape[1][0], shape[2][0]];
/* 与当前 input-agent.js 对账。实机 tt-player.js 走的就是 ACT_N 的解码器，
 * 烘一份 238/952 动作的旧网进去 = 游戏里「鼠标上的tt玩家」静默退回普通 AI，
 * 而 js/input-weights.js 看起来一切正常。烘焙是不可逆的，先在这里拦住。 */
const bad = [];
if(nActions !== IA.ACT_N) bad.push('nActions=' + nActions + ' ≠ 当前 ACT_N=' + IA.ACT_N);
if(inDim !== IA.OBS_N) bad.push('输入维=' + inDim + ' ≠ 当前 OBS_N=' + IA.OBS_N);
if(hSizes.join('/') !== IA.HSIZES.join('/'))
  bad.push('隐藏层=' + hSizes.join('/') + ' ≠ 当前 HSIZES=' + IA.HSIZES.join('/'));
if(bad.length && !force){
  console.error('❌ 拒绝烘焙：权重形状与实机解码器不兼容');
  for(const b of bad) console.error('    ' + b);
  console.error('    实机 tt-player.js 用的是 ' + IA.ACT_N + ' 动作 / ' + IA.OBS_N +
                ' 维输入的解码器，烘进去只会被静默丢弃。');
  console.error('    确实要烘就加 --force（自己负责）。');
  process.exit(2);
}
if(bad.length)
  console.warn('⚠ --force：明知形状不兼容仍烘焙（' + bad.join('；') + '）');
const trainedAt = new Date().toISOString().slice(0, 10);
const meta = {
  version: 1,
  trainedAt,
  opp,
  src: path.relative(path.join(__dirname, '..'), src).split(path.sep).join('/'),
  nActions,
  hSizes,
  /* evalDefault / evalHell = 实机管线（tools/live-match.js）实测分点率 */
  evalDefault: evD, evalHell: evH,
};
if(ladderLive) meta.ladderLive = ladderLive;
if(simEval) meta.simEval = simEval;
const baked = { version: 1, trainedAt, opp, src: meta.src, nActions, hSizes, evalDefault: evD, evalHell: evH, net };
if(ladderLive) baked.ladderLive = ladderLive;
if(simEval) baked.simEval = simEval;
const out = '/* 自动生成：' + path.basename(src) + '（输入级 DQN 权重，' + nActions + ' 动作 · ' + hSizes.join('/') + '） */\n'
  + 'const INPUT_AI_WEIGHTS = ' + JSON.stringify(baked) + ';\n'
  + 'const INPUT_AI_META = ' + JSON.stringify(meta) + ';\n'
  + 'if(typeof module !== "undefined" && module.exports) module.exports = { INPUT_AI_WEIGHTS, INPUT_AI_META };\n';
fs.writeFileSync(path.join(__dirname, '..', 'js', 'input-weights.js'), out, 'utf8');
console.log('已烘焙 js/input-weights.js ← ' + path.basename(src)
  + '（' + inDim + '→' + hSizes.join('→') + '→' + nActions + '，opp=' + opp + '）');
