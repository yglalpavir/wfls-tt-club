/* hip-land.js — 统计玩家出球的**落点分布**（出界诊断用）
 * 用法：node tools/hip-land.js [--opp hell] [--games 8] [--set k=v]...
 */
'use strict';
const path = require('path');
const ROOT = path.join(__dirname, '..');
const INPUTSIM = require(path.join(ROOT, 'js', 'input-sim.js'));
const OPP = require(path.join(ROOT, 'js', 'opponent-ladder.js'));
const { HIP_SKILL } = require(path.join(ROOT, 'js', 'hip-skill.js'));
const SIM = global.SIM;

function argOf(flag, def){
  const i = process.argv.indexOf(flag);
  if(i < 0) return def;
  const v = process.argv[i + 1];
  return (v == null || v.startsWith('--')) ? def : v;
}
function mulberry32(a){
  return function(){
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* 记录玩家出球：落点 z（成功落地）/ 失败原因 */
const origFull = SIM.simulateFull;
let lastHitter = 'player';
let lands = [], fails = {}, speeds = [];
SIM.simulateFull = function(from, vel, hitter, spin, rng){
  const r = origFull.call(SIM, from, vel, hitter, spin, rng);
  if(hitter === 'player'){
    if(r.ok) lands.push({ z: r.landing.z, x: r.landing.x });
    else fails[r.reason] = (fails[r.reason] || 0) + 1;
    speeds.push(Math.abs(vel.z));
  }
  return r;
};

const cfg = {};
for(let i = 2; i < process.argv.length; i++){
  if(process.argv[i] === '--set'){
    const kv = process.argv[i+1] || ''; const j = kv.indexOf('=');
    if(j > 0) cfg[kv.slice(0,j)] = Number(kv.slice(j+1));
    i++;
  }
}
const opp = OPP.at(argOf('--opp','hell'));
const games = parseInt(argOf('--games','8'),10);
const seed = parseInt(argOf('--seed','20261004'),10);
const brain = HIP_SKILL.makeBrain(cfg);
let pts = 0, won = 0;
for(let g = 0; g < games; g++){
  const rng = mulberry32((seed + g*7919)>>>0);
  let sA=0,sB=0, server=(g%2===0)?'player':'ai', guard=0;
  while(!((sA>=11||sB>=11)&&Math.abs(sA-sB)>=2) && guard++<80){
    const pt = INPUTSIM.playInputPoint(brain, opp, rng, server);
    pts++;
    if(pt.winner==='player'){ sA++; won++; } else sB++;
    const total=sA+sB, iv=(sA>=10&&sB>=10)?1:2;
    if(total%iv===0) server=(server==='player')?'ai':'player';
  }
}
const zs = lands.map(l=>l.z).sort((a,b)=>a-b);
const xs = lands.map(l=>l.x).sort((a,b)=>a-b);
const qz = (p) => zs.length ? zs[Math.min(zs.length-1, Math.floor(p*zs.length))].toFixed(2) : '-';
const qx = (p) => xs.length ? xs[Math.min(xs.length-1, Math.floor(p*xs.length))].toFixed(2) : '-';
console.log(`配置=${JSON.stringify(cfg)}`);
console.log(`分=${pts} 赢=${won} 落点样本=${lands.length}`);
console.log(`落点 z: min=${zs[0]!==undefined?zs[0].toFixed(2):'-'} p10=${qz(0.1)} p50=${qz(0.5)} p90=${qz(0.9)} max=${zs[zs.length-1]!==undefined?zs[zs.length-1].toFixed(2):'-'} （台边 -1.37）`);
console.log(`落点 x: min=${xs[0]!==undefined?xs[0].toFixed(2):'-'} p10=${qx(0.1)} p50=${qx(0.5)} p90=${qx(0.9)} max=${xs[xs.length-1]!==undefined?xs[xs.length-1].toFixed(2):'-'} （台边 ±0.76）`);
console.log(`落在台外的比例：z ${(100*zs.filter(z=>Math.abs(z)>1.37).length/Math.max(1,zs.length)).toFixed(1)}%  x ${(100*xs.filter(x=>Math.abs(x)>0.7625).length/Math.max(1,xs.length)).toFixed(1)}%`);
console.log('失败原因：', JSON.stringify(fails));
const sp = speeds.sort((a,b)=>a-b);
console.log(`出球 |vz|: p50=${sp.length?sp[Math.floor(sp.length*0.5)].toFixed(2):'-'} max=${sp.length?sp[sp.length-1].toFixed(2):'-'}`);
