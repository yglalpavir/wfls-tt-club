/* =====================================================================
 *  hip-sim.js — HIP L1（解析技能控制器）的**仿真侧**快速评测/调参台
 *
 *  为什么需要它：实机（live-match）是唯一判据，但一局实机要几十秒，
 *  没法做网格搜索。仿真侧跑得快，够用来调旋钮；调完必须过实机闸门。
 *  ⚠ 仿真会饱和（DQN 在 default 上仿真 100%、实机 92.1%），
 *    所以这里的数字只用来**排序**候选，不用来判定达标。
 *
 *  用法（cwd = tt_game/）：
 *    node tools/hip-sim.js --opp hell --games 30
 *    node tools/hip-sim.js --opp hell --games 30 --set aimMid=0.45 --set swingLead=0.08
 *    node tools/hip-sim.js --opp hell --games 12 --grid aimMid=0.3,0.4,0.5,0.6
 *    node tools/hip-sim.js --opp hell --games 30 --json data/hip/hip-sim.json
 * ===================================================================== */
'use strict';
const path = require('path');
const fs = require('fs');

const ROOT = path.join(__dirname, '..');
const INPUTSIM = require(path.join(ROOT, 'js', 'input-sim.js'));
const OPP = require(path.join(ROOT, 'js', 'opponent-ladder.js'));
const { HIP_SKILL } = require(path.join(ROOT, 'js', 'hip-skill.js'));

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

/* 把 reason 归类（与 input-sim 的 reason 命名一致）：
 *   'serve-*'        发球失误
 *   'recv-out'       玩家回球出界
 *   'recv-double'    球在己方台弹两次（没接到）
 *   'recv-timeout'   没等到球
 *   'hit-net'/'hit-out' 玩家出球下网/出界
 *   'ai-*'           对手失误（玩家赢）
 */
function bucket(reason, winner){
  const r = String(reason || '');
  if(winner === 'player'){
    if(r.startsWith('ai-')) return 'win:ai-err';
    if(r.startsWith('ai-recv-')) return 'win:ai-noreach';
    return 'win:other';
  }
  if(r.startsWith('serve-')) return 'lose:serve';
  if(r.startsWith('recv-out')) return 'lose:out';
  if(r.startsWith('recv-double')) return 'lose:double';
  if(r.startsWith('recv-timeout')) return 'lose:timeout';
  if(r.startsWith('hit-net')) return 'lose:net';
  if(r.startsWith('hit-out')) return 'lose:out';
  if(r === 'cap') return 'lose:cap';
  return 'lose:' + r;
}

function runGame(brain, opp, rng, firstServer, buckets, shotStat){
  let sA = 0, sB = 0, server = firstServer;
  for(;;){
    const pt = INPUTSIM.playInputPoint(brain, opp, rng, server);
    buckets[bucket(pt.reason, pt.winner)] = (buckets[bucket(pt.reason, pt.winner)] || 0) + 1;
    if(shotStat) shotStat.push(pt.shots || 0);
    if(pt.winner === 'player') sA++; else sB++;
    const total = sA + sB;
    if((sA >= 11 || sB >= 11) && Math.abs(sA - sB) >= 2) break;
    const iv = (sA >= 10 && sB >= 10) ? 1 : 2;
    if(total % iv === 0) server = (server === 'player') ? 'ai' : 'player';
  }
  return { sA, sB };
}

function runOne(cfg, oppTag, games, seed, useDqn){
  let brain;
  if(useDqn){
    const IA = require(path.join(ROOT, 'js', 'input-agent.js'));
    const baked = require(path.join(ROOT, 'js', 'input-weights.js'));
    const agent = IA.createInputAgent({ stateSize: IA.OBS_N, nActions: IA.ACT_N,
      hSizes: IA.HSIZES.slice(), gamma: 0.99, eps0: 1, epsMin: 0.12 }, Math.random);
    agent.setNet(baked.INPUT_AI_WEIGHTS.net);
    agent.setTraining(false);
    agent.setEps(0);
    brain = { act(o){ return agent.decode(agent.bestAction(o)); }, credit(){} };
  }else{
    brain = HIP_SKILL.makeBrain(cfg);
  }
  const opp = OPP.at(oppTag);
  const buckets = {};
  const shotStat = [];
  let pA = 0, pB = 0;
  for(let g = 0; g < games; g++){
    const rng = mulberry32((seed + g * 7919) >>> 0);
    const r = runGame(brain, opp, rng, (g % 2 === 0) ? 'player' : 'ai', buckets, shotStat);
    pA += r.sA; pB += r.sB;
  }
  const tot = pA + pB;
  const rate = tot ? pA / tot : 0;
  const n = tot || 1;
  const ci = 1.96 * Math.sqrt(rate * (1 - rate) / n);
  const avgShots = shotStat.length ? shotStat.reduce((a, b) => a + b, 0) / shotStat.length : 0;
  return { rate, ci, pA, pB, pts: tot, buckets, avgShots };
}

function fmtBuckets(b){
  const keys = Object.keys(b).sort((x, y) => b[y] - b[x]);
  return keys.map(k => `${k}=${b[k]}`).join(' ');
}

function parseSets(){
  const out = {};
  for(let i = 2; i < process.argv.length; i++){
    if(process.argv[i] === '--set'){
      const kv = process.argv[i + 1] || '';
      const j = kv.indexOf('=');
      if(j > 0) out[kv.slice(0, j)] = Number(kv.slice(j + 1));
      i++;
    }
  }
  return out;
}

function main(){
  const oppTag = argOf('--opp', 'hell');
  const games = parseInt(argOf('--games', '30'), 10);
  const seed = parseInt(argOf('--seed', '20261004'), 10);
  const jsonOut = argOf('--json', '');
  const useDqn = process.argv.includes('--dqn');
  const base = parseSets();

  const gridArg = argOf('--grid', '');
  const t0 = Date.now();

  if(gridArg){
    const j = gridArg.indexOf('=');
    const key = gridArg.slice(0, j);
    const vals = gridArg.slice(j + 1).split(',').map(Number);
    const rows = [];
    for(const v of vals){
      const cfg = Object.assign({}, base, { [key]: v });
      const r = runOne(cfg, oppTag, games, seed, useDqn);
      rows.push({ key, v, rate: r.rate, ci: r.ci, avgShots: r.avgShots, buckets: r.buckets });
      console.log(`${key}=${v}\t分点率=${(r.rate * 100).toFixed(1)}% ±${(r.ci * 100).toFixed(1)}\t均板=${r.avgShots.toFixed(1)}\t${fmtBuckets(r.buckets)}`);
    }
    rows.sort((a, b) => b.rate - a.rate);
    console.log('\n最好：', rows[0].key + '=' + rows[0].v, (rows[0].rate * 100).toFixed(1) + '%');
    if(jsonOut) fs.writeFileSync(path.resolve(jsonOut), JSON.stringify({ grid: rows }, null, 2));
    return;
  }

  const r = runOne(base, oppTag, games, seed, useDqn);
  const dt = ((Date.now() - t0) / 1000).toFixed(1);
  console.log(`对手=${oppTag} 脑=${useDqn ? 'DQN(烘焙权重)' : 'HIP-L1'} 局数=${games} seed=${seed} 用时=${dt}s`);
  console.log(`分点率 = ${(r.rate * 100).toFixed(1)}% ± ${(r.ci * 100).toFixed(1)}  （${r.pA} : ${r.pB}，共 ${r.pts} 分）`);
  console.log(`平均每分板数 = ${r.avgShots.toFixed(2)}`);
  console.log('分项：', fmtBuckets(r.buckets));
  if(Object.keys(base).length) console.log('旋钮：', JSON.stringify(base));
  if(jsonOut) fs.writeFileSync(path.resolve(jsonOut), JSON.stringify({ opp: oppTag, games, seed, cfg: base, ...r }, null, 2));
}

main();
