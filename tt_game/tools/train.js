/* =====================================================================
 *  train.js — 离线自对弈训练（Node）
 *  (μ+λ) 进化 + 高斯变异：对"基线策略(=POLICY_DEFAULT)"与"当前最优"优化
 *  得分率，输出学习策略 js/learned-policy.js 与训练曲线。
 *
 *  用法：
 *    node tools/train.js                     # 默认训练
 *    node tools/train.js --smoke             # 快速冒烟（先验证自对弈可跑）
 *    node tools/train.js --gens 100 --games 10 --pop 16 --seed 20260802
 * ===================================================================== */
'use strict';
const path = require('path');
const fs = require('fs');
const P = require(path.join(__dirname, '..', 'js', 'policy.js'));
const SIMMATCH = require(path.join(__dirname, '..', 'js', 'simmatch.js'));
const PM = require(path.join(__dirname, '..', 'js', 'player-model.js'));
const T = require(path.join(__dirname, '..', 'js', 'telemetry.js'));   // Web UI 打点（TT_TELEMETRY 门控）
const oppPlayer = PM.PLAYER_MODEL_BOOST;   // 加强版玩家模型（AI 训练对手）

/* ---- 可复现 RNG / 高斯 ---- */
function mulberry32(a){ return function(){ a|=0; a=a+0x6D2B79F5|0; let t=Math.imul(a^a>>>15,1|a); t=t+Math.imul(t^t>>>7,61|t)^t; return ((t^t>>>14)>>>0)/4294967296; }; }
function gaussN(rng){ let u=0,v=0; while(u===0) u=rng(); while(v===0) v=rng(); return Math.sqrt(-2*Math.log(u))*Math.cos(2*Math.PI*v); }

/* ---- 参数 ---- */
const args = process.argv.slice(2);
const opt = { gens:100, games:10, pop:16, seed:20260802, smoke:false, gamesSmoke:4, write:true };
for(let i=0;i<args.length;i++){
  if(args[i]==='--smoke') opt.smoke = true;
  else if(args[i]==='--gens') opt.gens = parseInt(args[++i],10);
  else if(args[i]==='--games') opt.games = parseInt(args[++i],10);
  else if(args[i]==='--pop') opt.pop = parseInt(args[++i],10);
  else if(args[i]==='--seed') opt.seed = parseInt(args[++i],10);
  else if(args[i]==='--grandslam') opt.grandslam = true;
  else if(args[i]==='--no-write') opt.write = false;   // 只跑实验：保留 curve/打点，不覆盖 js/learned-policy*.js
}
const KEYS = P.POLICY_KEYS;
const range = s => s.max - s.min;

/* ---- 冒烟：默认 vs 默认 自对弈是否正常（比分合理、不无限）---- */
if(opt.smoke){
  T.phase('smoke', '冒烟自检');
  const rngF = i => mulberry32(opt.seed + i);
  const mk = (m, tag) => { T.tick({ t:'smoke', tag, winRate:+(m.winsA/(m.winsA+m.winsB||1)).toFixed(4), winsA:m.winsA, winsB:m.winsB, games:m.games, shots:m.shots }); return m; };
  const m = mk(SIMMATCH.playMatch(P.POLICY_DEFAULT, P.POLICY_DEFAULT, { games: opt.gamesSmoke, rngFactory: rngF }), '默认 vs 默认');
  console.log(`[smoke] 默认 vs 默认：${m.games} 局  ${m.winsA}-${m.winsB}  总球数=${m.shots}  平均每局回合=${Math.round(m.shots/m.games)}`);
  const m2 = mk(SIMMATCH.playMatch(P.POLICY_DEFAULT, { moveErr:0.25, moveSpeed:1.8 }, { games: opt.gamesSmoke, rngFactory: rngF }), '默认 vs 弱');
  console.log(`[smoke] 默认 vs 弱(高误差低速)：${m2.games} 局  ${m2.winsA}-${m2.winsB}  (默认胜率=${m2.winRate.toFixed(2)})`);
  const m3 = mk(SIMMATCH.playMatch(P.POLICY_DEFAULT, oppPlayer, { games: opt.gamesSmoke, rngFactory: rngF }), '默认 vs 玩家模型');
  console.log(`[smoke] 默认 vs 玩家模型(加强)：${m3.games} 局  ${m3.winsA}-${m3.winsB}  (默认胜率=${m3.winRate.toFixed(2)})`);
  process.exit(0);
}

/* ---- 评估：候选 vs 对手 的得分率（对手固定 baseline 或当前最优）---- */
function evaluate(policy, opp, games, base){
  const rngF = i => mulberry32(base + i);
  const m = SIMMATCH.playMatch(policy, opp, { games, rngFactory: rngF });
  return m.pointRate;                     // 平滑信号：得分占比
}

/* ---- 变异 ---- */
function mutate(vec, sigma, rng){
  const out = vec.slice();
  for(let i = 0; i < out.length; i++){
    const s = KEYS[i];
    if(rng() < 0.12) out[i] = s.min + rng()*(range(s));      // 12% 突变跳跃（探索）
    else out[i] += gaussN(rng) * range(s) * sigma;
    out[i] = Math.max(s.min, Math.min(s.max, out[i]));
  }
  return out;
}
function childOf(vec, sigma, rng){ return mutate(vec, sigma, rng); }

/* 搓球对手：下旋偏多 + 中量搓球 → 训练适度的搓球应对（不再逼 AI 全搓） */
const PUSHER = {
  serve: { topProb: 0.2, sideProb: 0.4 },
  push: { prob: 0.55, forceThresh: 28 },
  loop: { prob: 0.4 }, counter: { prob: 0.5 }, smash: { prob: 0.15 },
  pushDepth: 1.2, pushSide: 1.0,
};

/* ---- 主训练 ---- */
const rng0 = mulberry32(opt.seed);
const baseline = P.POLICY_DEFAULT;
const baselineVec = P.flattenPolicy(baseline);
let pop = [];
for(let i = 0; i < opt.pop; i++){
  const v = i === 0 ? baselineVec.slice() : KEYS.map(s => s.min + rng0()*(range(s)));
  pop.push({ v, fit: 0 });
}
let best = { v: baselineVec.slice(), fitVsDef: 0.5, fitVsBest: 0.5, fitVsPush: 0.5, fitVsPlayer: 0.5, fit: 0.5, gen: -1 };
let evals = 0;
const curve = [];
const t0 = Date.now();
console.log('开始自对弈训练 · gens=' + opt.gens + ' games=' + opt.games + ' pop=' + opt.pop + ' seed=' + opt.seed);
T.phase('train', '自对弈训练开始 gens=' + opt.gens + ' pop=' + opt.pop + ' games=' + opt.games);
for(let g = 0; g < opt.gens; g++){
  const sigma = 0.10 * (1 - g/opt.gens) + 0.03;    // 变异随代际缩小
  for(const m of pop){
    const pol = P.unflattenPolicy(m.v);
    const fDef = evaluate(pol, baseline, opt.games, opt.seed*1000 + g*1000 + evals);
    const fBest = evaluate(pol, P.unflattenPolicy(best.v), opt.games, opt.seed*2000 + g*1000 + evals);
    const fPush = evaluate(pol, PUSHER, opt.games, opt.seed*3000 + g*1000 + evals);   // 连续搓球对抗
    const fPlayer = evaluate(pol, oppPlayer, opt.games, opt.seed*4000 + g*1000 + evals);  // 真人风格对抗
    evals += 4;
    // 常规：基线(重)+最优+搓球(轻)+玩家模型；大满贯：以加强玩家模型为主对手（55%）
    m.fit = opt.grandslam
      ? 0.55*fPlayer + 0.20*fDef + 0.15*fBest + 0.10*fPush
      : 0.40*fDef + 0.30*fBest + 0.10*fPush + 0.20*fPlayer;
    m.fDef = fDef; m.fBest = fBest; m.fPush = fPush; m.fPlayer = fPlayer;
  }
  pop.sort((a,b)=> b.fit - a.fit);
  const champ = pop[0];
  if(champ.fit >= best.fit) best = { v: champ.v.slice(), fitVsDef: champ.fDef, fitVsBest: champ.fBest, fitVsPush: champ.fPush, fitVsPlayer: champ.fPlayer, fit: champ.fit, gen: g };
    curve.push({ gen:g, fit:+champ.fit.toFixed(4), fDef:+champ.fDef.toFixed(4), fPush:+champ.fPush.toFixed(4), fPlayer:+champ.fPlayer.toFixed(4), best:+best.fit.toFixed(4) });
    T.tick(Object.assign({ t:'gen', evals, sec:+((Date.now() - t0)/1000).toFixed(1) }, curve[curve.length - 1]));
  if(g % 5 === 0 || g === opt.gens-1){
    const vv = champ.v.slice(0,5).map(x=>x.toFixed(2)).join(',');
    console.log(`gen ${g.toString().padStart(3)}  top.fit=${champ.fit.toFixed(4)} (vsDef=${champ.fDef.toFixed(3)} vsBest=${champ.fBest.toFixed(3)} vsPush=${champ.fPush.toFixed(3)} vsPlayer=${champ.fPlayer.toFixed(3)})  best=${best.fit.toFixed(4)}  vec[0..4]=[${vv}]`);
  }
  // 繁殖下一代：保留精英 + 从精英变异
  const eliteN = Math.max(2, Math.ceil(opt.pop*0.3));
  const next = [];
  for(let i = 0; i < eliteN; i++) next.push({ v: pop[i].v.slice() });
  while(next.length < opt.pop){
    const parent = pop[(rng0()*eliteN)|0];
    next.push({ v: childOf(parent.v, sigma, rng0) });
  }
  pop = next;
}

/* ---- 汇总输出 ---- */
const learnedVec = best.v;
const learned = P.unflattenPolicy(learnedVec);
// 最终确认：learned vs default 独立再测一局（更多局数）
const conf = SIMMATCH.playMatch(learned, baseline, { games: opt.games*2, rngFactory: i=>mulberry32(999000+i) });
const confPush = SIMMATCH.playMatch(learned, PUSHER, { games: opt.games*2, rngFactory: i=>mulberry32(999100+i) });
const confPlayer = SIMMATCH.playMatch(learned, oppPlayer, { games: opt.games*2, rngFactory: i=>mulberry32(999200+i) });
console.log('\n=== 训练完成 ===');
console.log('最终得分率 vs 默认策略：' + conf.pointRate.toFixed(4) + '  (胜场 ' + conf.winsA + '-' + conf.winsB + ')');
console.log('最终得分率 vs 搓球狂对手：' + confPush.pointRate.toFixed(4) + '  (胜场 ' + confPush.winsA + '-' + confPush.winsB + ')');
console.log('最终得分率 vs 玩家模型(加强)：' + confPlayer.pointRate.toFixed(4) + '  (胜场 ' + confPlayer.winsA + '-' + confPlayer.winsB + ')');
console.log('学习策略参数：');
KEYS.forEach((s,i)=> console.log('  ' + s.k.padEnd(20) + ' = ' + learnedVec[i].toFixed(3)));

const meta = {
  fitness: +best.fit.toFixed(4),
  pointRateVsDefault: +conf.pointRate.toFixed(4),
  winsVsDefault: conf.winsA, lossesVsDefault: conf.winsB,
  pointRateVsPusher: +confPush.pointRate.toFixed(4),
  pointRateVsPlayer: +confPlayer.pointRate.toFixed(4),
  generations: opt.gens, seed: opt.seed, evals, mode: opt.grandslam ? 'grandslam' : 'selfplay',
  trainedAt: new Date().toISOString().slice(0,10),
};
const OUT_NAME = opt.grandslam ? 'learned-policy-grandslam.js' : 'learned-policy.js';
const CONST_NAME = opt.grandslam ? 'GRANDSLAM_POLICY' : 'LEARNED_POLICY';
const META_NAME = opt.grandslam ? 'GRANDSLAM_META' : 'LEARNED_META';
const HEAD = opt.grandslam ? '大满贯预备种子 — 以加强玩家模型为模板训练（partial policy）' : '自对弈学习到的 AI 策略（partial policy，未设字段回落 POLICY_DEFAULT）';
const out =
`/* =====================================================================
 *  ${OUT_NAME} — 自动生成：node tools/train.js${opt.grandslam ? ' --grandslam' : ''}
 *  ${HEAD}
 * ===================================================================== */
'use strict';
const ${CONST_NAME} = ${JSON.stringify(learned, null, 2)};
const ${META_NAME} = ${JSON.stringify(meta, null, 2)};
/* Node 训练器/诊断可 require */
if(typeof module !== 'undefined' && module.exports) module.exports = { ${CONST_NAME}, ${META_NAME} };
`;
if(opt.write){
  fs.writeFileSync(path.join(__dirname, '..', 'js', OUT_NAME), out, 'utf8');
  console.log('✅ 已写出 js/' + OUT_NAME);
} else {
  console.log('⚠ --no-write：跳过覆盖 js/' + OUT_NAME + '（实验模式，游戏当前 AI 不变）');
}
fs.writeFileSync(path.join(__dirname, 'train-curve.json'), JSON.stringify(curve, null, 2), 'utf8');
T.tick({ t:'done', mode: opt.grandslam ? 'grandslam' : 'selfplay', fitness: meta.fitness,
  vsDefault: meta.pointRateVsDefault, vsPlayer: meta.pointRateVsPlayer,
  vsPusher: meta.pointRateVsPusher, winsVsDefault: conf.winsA, lossesVsDefault: conf.winsB,
  generations: opt.gens, seed: opt.seed, evals, adopted: !!opt.write, sec:+((Date.now() - t0)/1000).toFixed(1) });
console.log('✅ 已写出 tools/train-curve.json');
