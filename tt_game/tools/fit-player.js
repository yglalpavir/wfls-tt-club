/* =====================================================================
 *  fit-player.js — 玩家日志 → 玩家模型（Node）
 *  读 data/player-logs.json（浏览器 PLAYER_LOG.exportJSON() 导出）,
 *  拟合成玩家风格策略，写入 js/player-fit.js（train.js 自动加载作为对手）。
 *
 *  用法：
 *    node tools/fit-player.js                # 读 data/player-logs.json
 *    node tools/fit-player.js <path.json>    # 指定日志文件
 * ===================================================================== */
'use strict';
const path = require('path');
const fs = require('fs');
// 先初始化 SIM / P（player-model 拟合依赖 predictLanding 与模板基准）
require(path.join(__dirname, '..', 'js', 'simmatch.js'));
const PM = require(path.join(__dirname, '..', 'js', 'player-model.js'));

const logPath = process.argv[2] || path.join(__dirname, '..', 'data', 'player-logs.json');
if(!fs.existsSync(logPath)){
  console.log('⚠️  未找到日志：' + logPath);
  console.log('   请先在浏览器对局（记录玩家行为），再导出 PLAYER_LOG.exportJSON() 到此文件。');
  console.log('   使用默认玩家风格生成兜底模型…');
  writeFit(PM.MODEL_DEFAULT);
  process.exit(0);
}
const logs = JSON.parse(fs.readFileSync(logPath, 'utf8'));
console.log(`读取玩家日志 ${logs.length} 条样本`);

const model = PM.fitPlayerModel(logs, { minSamples: 8 });
const boost = PM.boostModel(model);
console.log('\n拟合玩家风格：');
const show = (k, v, pad = 16) => console.log('  ' + String(k).padEnd(pad) + ' = ' + (typeof v === 'object' ? JSON.stringify(v) : (+v).toFixed(3)));
show('push.prob', model.push.prob);
show('counter.prob', model.counter.prob);
show('smash.prob', model.smash.prob);
show('loop.prob', model.loop.prob);
show('loopPace', model.loopPace); show('loopArc', model.loopArc); show('loopSpin', model.loopSpin);
show('liftPace', model.liftPace); show('defPace', model.defPace); show('counterPace', model.counterPace);
show('smashPace', model.smashPace); show('fwdBoost', model.fwdBoost);
show('txMin', model.txMin); show('txRange', model.txRange); show('awayProb', model.awayProb);
show('tzBase', model.tzBase); show('tzRange', model.tzRange);
show('txErrBase', model.txErrBase); show('moveErr', model.moveErr); show('moveSpeed', model.moveSpeed); show('moveZ', model.moveZ);

console.log('\n加强版（AI 训练对手）：moveSpeed=' + boost.moveSpeed.toFixed(2) + ' moveErr=' + boost.moveErr.toFixed(3) + ' fwdBoost=' + boost.fwdBoost.toFixed(2) + ' txErrBase=' + boost.txErrBase.toFixed(3));

function writeFit(m){
  const out =
`/* =====================================================================
 *  player-fit.js — 自动生成：node tools/fit-player.js
 *  从真实玩家行为日志拟合出的玩家风格模型（默认 = 典型玩家）
 * ===================================================================== */
'use strict';
const PLAYER_MODEL = ${JSON.stringify(m, null, 2)};
/* Node 训练器/诊断可 require */
if(typeof module !== 'undefined' && module.exports) module.exports = { PLAYER_MODEL };
`;
  fs.writeFileSync(path.join(__dirname, '..', 'js', 'player-fit.js'), out, 'utf8');
  console.log('✅ 已写出 js/player-fit.js（玩家模型，含加强版在 player-model.js 内计算）');
}

writeFit(model);
