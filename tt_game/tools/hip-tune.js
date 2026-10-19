/* hip-tune.js — HIP-L1 旋钮的坐标下降搜索（目标：仿真内自失误率最低）
 *
 * 目标函数说明：仿真里「分点率」是**饱和**指标 —— 烘焙 DQN 在同一仿真下
 * 分点率 97.1%，但平均每分 471 板（撞 500 板上限判负），也就是说仿真里
 * 谁都不主动结束一分，比分毫无意义。真正可测的是**自失误率**：
 *   自失误 = 自己出界/下网/没接到/发球失误（hit-floor / out / net / double / serve）
 * 烘焙 DQN 的自失误率 ≈ 3%（34 分里 1 次），HIP-L1 起初是 69%。
 * 所以这里以自失误率为主目标，同时报告「够不到率」（球飞出底线 = 没够到）。
 */
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
function bucket(reason, winner){
  const r = String(reason || '');
  if(winner === 'player') return 'win';
  if(r.startsWith('serve-')) return 'self:serve';
  if(r.startsWith('recv-out')) return 'miss:out';
  if(r.startsWith('recv-double')) return 'self:double';
  if(r.startsWith('recv-timeout')) return 'miss:timeout';
  if(r.startsWith('hit-net')) return 'self:net';
  if(r.startsWith('hit-out') || r.startsWith('hit-floor')) return 'self:out';
  if(r === 'cap') return 'self:cap';
  return 'self:other';
}
function evaluate(cfg, oppTag, games, seed, maxShots){
  maxShots = maxShots || 25;
  const brain = HIP_SKILL.makeBrain(cfg);
  const opp = OPP.at(oppTag);
  const b = {};
  let pA = 0, pB = 0;
  for(let g = 0; g < games; g++){
    const rng = mulberry32((seed + g * 7919) >>> 0);
    let sA = 0, sB = 0, server = (g % 2 === 0) ? 'player' : 'ai';
    let guard = 0;
    while(!((sA >= 11 || sB >= 11) && Math.abs(sA - sB) >= 2) && guard++ < 80){
      const pt = INPUTSIM.playInputPoint(brain, opp, rng, server);
      /* ★ 截断：超过 maxShots 板的一分算「平局」，不计胜负。
       *   原因：仿真里双方都不主动结束一分时，比分会被 500 板上限和
       *   AI 的随机失误支配（烘焙 DQN 在仿真里 97.1%，但平均每分 471 板），
       *   那个数字毫无意义。截断后「多少分在合理板数内被打死」才是
       *   和实机可比的指标。 */
      if((pt.shots || 0) > maxShots){ b.draw = (b.draw || 0) + 1; continue; }
      const k = bucket(pt.reason, pt.winner);
      b[k] = (b[k] || 0) + 1;
      if(pt.winner === 'player') sA++; else sB++;
      const total = sA + sB;
      const iv = (sA >= 10 && sB >= 10) ? 1 : 2;
      if(total % iv === 0) server = (server === 'player') ? 'ai' : 'player';
    }
    pA += sA; pB += sB;
  }
  const tot = pA + pB;
  const cnt = (k) => b[k] || 0;
  const self = cnt('self:serve') + cnt('self:double') + cnt('self:net') + cnt('self:out') + cnt('self:other') + cnt('self:cap');
  const miss = cnt('miss:out') + cnt('miss:timeout');
  const draws = cnt('draw');
  /* ★ 分母必须把「平局」（超过 maxShots 未结束）算进去：否则一个「永远打不完」
   *   的策略会拿到 100%（实测踩过：myDrive=0.54 时 581 分全是平局、
   *   154 胜 → 分母只有 154 → 显示 100%）。实机同样不吃拖时间：
     *   live-match 的 --maxsec 到了就砍掉这一分。 */
  const denom = tot + draws;
  return {
    rate: denom ? pA / denom : 0,
    selfErr: denom ? self / denom : 1,
    missErr: denom ? miss / denom : 1,
    winErr: denom ? cnt('win') / denom : 0,
    draw: draws,
    pts: denom, buckets: b,
  };
}

/* 坐标下降：每一轮对每个旋钮试若干候选值，取最好的 */
const KNOBS = [
  { key: 'myDrive',      vals: [0.22, 0.30, 0.38, 0.46, 0.54] },
  { key: 'mySpeedGain',  vals: [0, 0.15, 0.3, 0.45, 0.6] },
  { key: 'mySpeedRef',   vals: [3, 5, 7, 10] },
  { key: 'landX',        vals: [0.25, 0.35, 0.46, 0.55] },
  { key: 'landXMid',     vals: [0.3, 0.45, 0.55] },
  { key: 'wideThresh',   vals: [0.25, 0.42, 0.6, 0.8] },
  { key: 'swingLead',    vals: [0.05, 0.08, 0.12, 0.18, 0.25] },
  { key: 'maxSwing',     vals: [1.0, 2.0, 3.0, 4.2] },
  { key: 'posLead',      vals: [-0.12, -0.06, 0, 0.06, 0.12] },
  { key: 'holdClamp',    vals: [0.08, 0.16, 0.25, 0.35] },
  { key: 'aimShiftGain', vals: [0, 0.5, 1.0, 1.5] },
  { key: 'pushHeight',   vals: [0.85, 0.95, 1.05] },
  { key: 'myPush',       vals: [0.4, 0.56, 0.7] },
];

function main(){
  const oppTag = argOf('--opp', 'hell');
  const games = parseInt(argOf('--games', '12'), 10);
  const rounds = parseInt(argOf('--rounds', '2'), 10);
  const seed = parseInt(argOf('--seed', '20261004'), 10);
  const jsonOut = argOf('--json', '');
  const t0 = Date.now();

  let cfg = Object.assign({}, HIP_SKILL.DEFAULTS);
  let cur = evaluate(cfg, oppTag, games, seed);
  const line = (r) => `分点=${(r.rate*100).toFixed(1)}% 自失误=${(r.selfErr*100).toFixed(1)}% 够不到=${(r.missErr*100).toFixed(1)}% 赢=${(r.winErr*100).toFixed(1)}% 平=${r.draw}`;
  console.log('起点：', line(cur));

  for(let rd = 0; rd < rounds; rd++){
    for(const kn of KNOBS){
      const base = cfg[kn.key];
      let best = base, bestR = cur;
      for(const v of kn.vals){
        if(v === base) continue;
        const c2 = Object.assign({}, cfg, { [kn.key]: v });
        const r2 = evaluate(c2, oppTag, games, seed);
        const better = (r2.rate > bestR.rate + 1e-9) ||
                       (Math.abs(r2.rate - bestR.rate) < 1e-9 && r2.selfErr < bestR.selfErr - 1e-9);
        if(better){ best = v; bestR = r2; }
      }
      if(best !== base){
        cfg[kn.key] = best; cur = bestR;
        console.log(`  ${kn.key}: ${base} → ${best}   ${line(cur)}`);
      }
    }
    console.log(`第 ${rd+1} 轮结束：`, line(cur));
  }
  console.log('最终旋钮：', JSON.stringify(cfg));
  console.log('分项：', JSON.stringify(cur.buckets));
  console.log('用时', ((Date.now()-t0)/1000).toFixed(1), 's');
  if(jsonOut) fs.writeFileSync(path.resolve(jsonOut), JSON.stringify({ cfg, result: cur }, null, 2));
}
main();
