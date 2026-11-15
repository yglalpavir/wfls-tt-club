/* =====================================================================
 *  _recv-dist-matrix.js — R37：接球位置分布矩阵（血统 vs 响应判定）
 * =====================================================================
 *  R36 反驳了「打稀疏半区」假说后，下一层问题：nemesis 的右偏接球分布
 *  是「血统」（42 维参数固有）还是「响应」（追 HIP 球路的结果）？
 *  判定矩阵（各 30 局，双 AI 斗蛐蛐）：
 *    nemesis2(fightL) vs hell(fightR)  —— nemesis2 面对 hell
 *    hell(fightL) vs nemesis2(fightR)  —— hell 面对 nemesis2（R26 已有）
 *    hell vs hell（自对弈基线）
 *  若 nemesis2 面对 hell 也右偏 ⇒ 右偏是「克星血统追 hell 球路」；
 *  若 nemesis2 面对 hell 不右偏 ⇒ 右偏是 nemesis 个体特性。
 * ===================================================================== */
'use strict';
const vm = require('vm');
const { buildRig } = require('./live-rig.js');

const SEED = 20261004;
const GAMES = 20;

function measure(fightL, fightR){
  const rig = buildRig({ controller: 'hip', moveCap: 2.0 });
  vm.runInContext([
    'mode = "watch";',
    'fightL = ' + JSON.stringify(fightL) + '; fightR = ' + JSON.stringify(fightR) + ';',
    'aiModel = "standard";',
    'setCurrentPolicy(policyForModel(' + JSON.stringify(fightR === 'hell' ? 'hell' : fightR) + '));'
  ].join('\n'), rig.ctx);
  vm.runInContext([
    'globalThis.__aiX = [];',
    'const __ha = hitAI, __hap = hitAIForPlayer;',
    'const __rec = () => { globalThis.__aiX.push(aiPad.group.position.x); };',
    'hitAI = function(){ __rec(); return __ha.apply(null, arguments); };',
    'hitAIForPlayer = function(){ __rec(); return __hap.apply(null, arguments); };'
  ].join('\n'), rig.ctx);
  for(let g = 0; g < GAMES; g++) rig.playGame(SEED, g, 120);
  const xs = vm.runInContext('(globalThis.__aiX||[])', rig.ctx);
  /* aiPad 是「远侧拍」= fightR 侧的拍（镜像下 x 直接可比？）
   * buildObs L254：玩家侧 obs.ox = aiPad.x（不镜像）；AI 侧 = −playerPad.x。
   * aiPad.group.position.x 的符号：远侧拍 z<0，x 同轴未镜像 ⇒ 直接可读。 */
  let left = 0, right = 0;
  for(const x of xs){ if(x < 0) left++; else right++; }
  const leftPct = xs.length ? (left / xs.length * 100).toFixed(1) : '-';
  const rightPct = xs.length ? (right / xs.length * 100).toFixed(1) : '-';
  /* 均值 */
  const mean = xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0;
  console.log((fightL + ' vs ' + fightR).padEnd(26) + ' n=' + String(xs.length).padStart(5) +
              '  mean=' + mean.toFixed(3) + '  left=' + leftPct + '% right=' + rightPct + '%');
  return { mean, leftPct, rightPct };
}

console.log('[recv-dist matrix] 20 games each:');
/* fightR 侧的拍 = aiPad（被观测者） */
measure('hell', 'hell');            // hell 自对弈：观测 hell（远侧）
measure('hell', 'nemesis');         // nemesis（远侧）面对 hell（近侧）
measure('hell', 'nemesis2');        // nemesis2（远侧）面对 hell
