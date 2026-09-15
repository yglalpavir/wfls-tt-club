/* 临时诊断：AI 回球的净空情况 */
'use strict';
const SIM = require('../js/simcore.js');
global.SIM = SIM;
const P = require('../js/policy.js');
function mulberry32(a){ return function(){ a|=0; a=a+0x6D2B79F5|0; let t=Math.imul(a^a>>>15,1|a); t=t+Math.imul(t^t>>>7,61|t)^t; return ((t^t>>>14)>>>0)/4294967296; }; }
const rng = mulberry32(42);

let net=0, ok=0, own=0, other=0;
for(let i=0;i<20000;i++){
  const side = rng()<0.5?'ai':'player';        // ai: contact z=-1.32 → +z ; player: contact z=+1.32 → -z
  const z = side==='ai' ? -1.32 : 1.32;
  const dir = side==='ai' ? 1 : -1;
  const stroke = rng()<0.5?'forehand':'backhand';
  const ctx = {
    stroke, bx:(rng()-0.5)*0.8, by:0.78+rng()*0.25, bz:z,
    vx:(rng()-0.5)*2, vy:0.5+rng()*2, vz: (side==='ai'?1:-1)*(1.5+rng()*5),
    sx:(rng()-0.5)*260, sy:(rng()-0.5)*110,
    aiX:0, playerX:(rng()-0.5)*1.2, dir,
  };
  const d = P.aiDecision(ctx, P.POLICY_DEFAULT);
  const sim = SIM.simulateFull({x:ctx.bx,y:ctx.by,z:ctx.bz}, d.outVel, side, {x:d.fx,y:d.fy,z:0});
  if(!sim.ok){ if(sim.reason==='net') net++; else other++; }
  else if(!sim.bouncedOpp) own++;
  else ok++;
}
console.log(`ok=${ok} net=${net} own=${own} other=${other}  净空率=${(ok/(ok+net+own+other)).toFixed(3)} 下网率=${(net/(ok+net+own+other)).toFixed(3)}`);
