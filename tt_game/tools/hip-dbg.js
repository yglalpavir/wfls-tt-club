/* hip-dbg.js — 调试 HIP 控制器在一分里的决策轨迹 */
'use strict';
const path = require('path');
const ROOT = path.join(__dirname, '..');
const INPUTSIM = require(path.join(ROOT, 'js', 'input-sim.js'));
const OPP = require(path.join(ROOT, 'js', 'opponent-ladder.js'));
const { HIP_SKILL } = require(path.join(ROOT, 'js', 'hip-skill.js'));

function mulberry32(a){
  return function(){
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const opp = OPP.at(process.argv[2] || 'hell');
const ctl = HIP_SKILL.makeController();
let n = 0;
const buf = [];
const brain = {
  act(obs){
    const r = ctl.plan(obs);
    const s = ctl.state;
    buf.push(`#${n} obs x=${obs.x.toFixed(2)} z=${obs.z.toFixed(2)} vx=${obs.vx.toFixed(2)} vz=${obs.vz.toFixed(2)} px=${obs.px.toFixed(2)} pz=${obs.pz.toFixed(2)} svx=${obs.svx.toFixed(2)} | bx=${s.bx.toFixed(2)} by=${s.by.toFixed(2)} tau=${s.tau.toFixed(2)} -> tx=${r.tx.toFixed(2)} my=${r.my.toFixed(2)} ctrl=${r.ctrl?1:0}`);
    if(buf.length > 30) buf.shift();
    n++;
    return r;
  },
  credit(){}
};

const rng = mulberry32(12345);
const pt = INPUTSIM.playInputPoint(brain, opp, rng, 'player');
console.log(buf.join('\n'));
console.log('result', pt);
