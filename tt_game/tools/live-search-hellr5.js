/* =====================================================================
 *  live-search-hellr5.js — R3 第一腿：mySpeedGain 在第 5 轮 hell 上的在环网格
 * =====================================================================
 *  探针（probe-hell-r5.txt）：hell-r5 下玩家出球速度 p50 6.50（上限 6.98），
 *  out 31.8% —— 快球回击顶死出球上限。
 *  mySpeedGain（快球时增大 my ⇒ 出球更短更安全）是现成旋钮，
 *  默认 mySpeedRef=7 几乎不触发。本网格扫 (mySpeedRef, mySpeedGain)。
 *  纪律：20 局/点在环筛选 → 最优 2 点 CLI 40 局复验。
 * ===================================================================== */
'use strict';
const vm = require('vm');
const { buildRig } = require('./live-rig.js');

const GAMES = 20;
const SEED = 20261004;

const rig = buildRig({ controller: 'hip', moveCap: 2.0 });
rig.setOpp('hell');

function evalPoint(cfg, label){
  vm.runInContext('HIP_SKILL.setConfig(null);', rig.ctx);
  if(cfg && Object.keys(cfg).length) vm.runInContext('HIP_SKILL.setConfig(' + JSON.stringify(cfg) + ');', rig.ctx);
  let pts = 0, tot = 0, stalled = 0, outN = 0;
  for(let g = 0; g < GAMES; g++){
    const r = rig.playGame(SEED, g, 120);
    pts += r.you; tot += r.you + r.ai;
    if(r.you + r.ai === 0) stalled++;
    if(r.stats && r.stats.player && r.stats.player.lostBy) outN += (r.stats.player.lostBy.out || 0);
  }
  vm.runInContext('HIP_SKILL.setConfig(null);', rig.ctx);
  const rate = tot ? pts / tot : 0;
  console.log(label.padEnd(34) + (rate * 100).toFixed(1) + '%  pts ' + pts + '/' + tot +
              '  stalled ' + stalled);
  return rate;
}

console.log('mySpeedGain grid vs hell-r5 (' + GAMES + ' games/point):');
const base = evalPoint(null, 'base(ref=7,gain=0)');
let best = { cfg: null, rate: base };
for(const ref of [3.5, 4.5, 5.5]){
  for(const gain of [0.10, 0.18]){
    const cfg = { mySpeedRef: ref, mySpeedGain: gain };
    const r = evalPoint(cfg, 'ref=' + ref + ' gain=' + gain);
    if(r > best.rate) best = { cfg, rate: r };
  }
}
console.log('best in-loop: ' + JSON.stringify(best));
