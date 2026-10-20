/* =====================================================================
 *  hip-teacher.js — M2 教师：短程 rollout 搜索 → 意图的 soft label
 *
 *  做什么：在 sim 里用 L1 控制器打「有脑子」的球。每次要出球时枚举候选意图
 *  （hip-intent.js 的 336 类，经掩码与去重后 ~110 个），对每个候选：
 *    1. 用 SIM.resolveHit 按该意图的 aim/my/ctrl 在**预测接触点**上出球
 *       （与实机 tt-player#ttHit 同一份出球核）
 *    2. 用 SIM.simulateFull 复核落点与合法性（出界/下网直接判死）
 *    3. 用解析式可达性模型估「对手够不够得到」+ 变线/深度/风险收益 → 打分
 *  4. softmax(scores/T) → soft label
 *  然后**按最高分的意图出球**，让这一局继续打得像样（教师自己的策略是
 *  「搜索最优」，比后面的学生强，学生学的正是这个差距）。
 *
 *  输出：ndjson，每行 { f:[28 维特征], p:[336 概率], top:id, meta:{...} }
 *  文件默认写到 tt_game/data/hip/（已 gitignore）。
 *
 *  用法（cwd = tt_game/）：
 *    node tools/hip-teacher.js --opp hell --points 2000 --out data/hip/teacher.ndjson
 *    node tools/hip-teacher.js --opp hell,grandslam --points 4000 --temp 0.5
 * ===================================================================== */
'use strict';
const path = require('path');
const fs = require('fs');

const ROOT = path.join(__dirname, '..');
const INPUTSIM = require(path.join(ROOT, 'js', 'input-sim.js'));
const SIM = global.SIM || require(path.join(ROOT, 'js', 'simcore.js'));
global.SIM = SIM;
const OPP = require(path.join(ROOT, 'js', 'opponent-ladder.js'));
const { HIP_SKILL } = require(path.join(ROOT, 'js', 'hip-skill.js'));
const { HIP_INTENT } = require(path.join(ROOT, 'js', 'hip-intent.js'));

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
const cl = (v, a, b) => (v < a ? a : (v > b ? b : v));

/* ---- 对手参数（可达性模型用；与 policy.js 的 hell 口径一致）---- */
const OPP_SPEED = 2.8;      // moveSpeed
const OPP_REACT = 0.12;     // 对手反应时间（秒）

/* ---- 候选意图枚举（掩码 + 去重：push/lift 的深度无意义，只保留 depth=0）---- */
function candidates(ctx){
  const m = HIP_INTENT.mask(ctx);
  const out = [];
  for(let id = 0; id < HIP_INTENT.N_INTENT; id++){
    if(!m[id]) continue;
    const d = HIP_INTENT.decode(id);
    if((d.stroke === HIP_INTENT.STROKE_PUSH || d.stroke === HIP_INTENT.STROKE_LIFT) && d.depth !== 0) continue;
    /* ctrl 只在**下旋**来球上有意义（resolveHit 里 isPush = isBack && ctrlHold） */
    if(d.ctrl && !ctx.isBack) continue;
    out.push(id);
  }
  return out;
}

/* ---- 给一个候选意图打分 ---- */
function scoreIntent(id, ctx){
  const ctl = HIP_INTENT.intentToControls(id, ctx);
  const sk = HIP_SKILL;
  const AIM = sk.constants.AIM;
  const aimZ = AIM.zDeep + (AIM.zShort - AIM.zDeep) * ctl.my * ctl.my;
  /* 用「预测接触点」出球：位置 = 预测落点，速度 = 当前速度 + 重力粗估 */
  const pos = { x: ctx.bx, y: ctx.by, z: ctx.bz };
  const vel = { x: ctx.vx, y: ctx.vy - 9.81 * Math.max(ctx.tau, 0) * 0.5, z: ctx.vz };
  const spin = { x: ctx.sx, y: ctx.sy, z: 0 };
  const r = SIM.resolveHit({
    stroke: 'forehand', pos, vel, spin,
    swipe: ctx.svx, fwd: SIM.fwdOf(ctx.svz), mouseNy: ctl.my,
    aim: { x: ctl.aimX, z: aimZ, gx: ctx.px },
    ctrlHold: ctl.ctrl, dir: -1, applyArcAdj: true, receive: !!ctx.receive, rng: ctx.rng,
  });
  if(!r || !r.outVel) return { s: -12, legal: 0 };
  const land = SIM.simulateFull(pos, r.outVel, 'player', { x: r.spin.x, y: r.spin.y, z: 0 }, ctx.rng);
  if(!land.ok) return { s: -12, legal: 0, reason: land.reason };
  const L = land.landing;
  /* 飞行时间 → 对手够不够得到 */
  const dist = Math.hypot(L.x - ctx.bx, L.z - ctx.bz);
  const hSpd = Math.hypot(r.outVel.x, r.outVel.z) || 1;
  const flightT = dist / hSpd;
  const reachT = Math.abs(L.x - ctx.ox) / OPP_SPEED;
  const availT = flightT + OPP_REACT;
  const pMiss = cl(0.5 + (availT - reachT) / 0.20, 0, 1);
  const depthQ = cl((Math.abs(L.z) - 0.45) / 0.8, 0, 1);
  const crossQ = (Math.abs(L.x - ctx.ox) > 0.25) ? 1 : 0;
  const margin = Math.min(0.7625 - Math.abs(L.x), 1.37 - Math.abs(L.z));
  const risk = cl((0.10 - margin) / 0.10, 0, 1);
  const s = 3.0 * pMiss + 0.7 * depthQ + 0.6 * crossQ - 1.2 * risk;
  return { s, legal: 1, pMiss, land: L, mode: r.mode, margin };
}

function main(){
  const oppTags = argOf('--opp', 'hell').split(',').map(s => s.trim()).filter(Boolean);
  const points = parseInt(argOf('--points', '2000'), 10);
  const temp = parseFloat(argOf('--temp', '0.5'));
  const seed = parseInt(argOf('--seed', '20261004'), 10);
  const outPath = path.resolve(ROOT, argOf('--out', 'data/hip/teacher.ndjson'));
  if(!fs.existsSync(path.dirname(outPath))) fs.mkdirSync(path.dirname(outPath), { recursive: true });
  const out = fs.createWriteStream(outPath, { flags: 'w' });

  const ctl = HIP_SKILL.makeController();
  let nDecide = 0, nSamples = 0, nIllegal = 0;
  const t0 = Date.now();
  const rng = mulberry32(seed);

  /* 教师的脑：一板一次决策（来球上升沿），按最高分意图出球 */
  let lastIncoming = false, curIntent = null, curCtl = null;
  const brain = {
    act(obs){
      const incoming = (obs.vz || 0) > 0.15;
      if(incoming && !lastIncoming){
        lastIncoming = true;
        const sk = HIP_SKILL;
        const ct = sk.predictContact(obs, obs.pz != null ? obs.pz : 1.32);
        if(ct && ct.ok){
          const rtop = HIP_INTENT.rtopOf(obs);
          const ctx = {
            bx: ct.x, by: ct.y, bz: ct.z, tau: ct.tau,
            vx: obs.vx, vy: obs.vy, vz: obs.vz, sx: obs.sx, sy: obs.sy,
            px: obs.px || 0, svx: obs.svx || 0, svz: obs.svz || 0,
            ox: obs.ox || 0, rtop, isBack: rtop < -8,
            receive: false, rng: mulberry32((seed + nDecide * 7919) >>> 0),
          };
          const cands = candidates(ctx);
          const scores = new Float64Array(HIP_INTENT.N_INTENT);
          let best = -1, bestS = -1e9, legalCount = 0;
          for(const id of cands){
            const sc = scoreIntent(id, ctx);
            scores[id] = sc.s;
            if(sc.legal) legalCount++;
            if(sc.s > bestS){ bestS = sc.s; best = id; }
          }
          if(best >= 0 && bestS > -11){
            /* softmax → soft label */
            const probs = new Float64Array(HIP_INTENT.N_INTENT);
            let sum = 0;
            for(const id of cands){
              const e = Math.exp((scores[id] - bestS) / temp);
              probs[id] = e; sum += e;
            }
            for(const id of cands) probs[id] /= (sum || 1);
            const f = HIP_INTENT.features(Object.assign({}, obs, { rtop }));
            const line = JSON.stringify({
              f: Array.from(f, v => Math.round(v * 1e4) / 1e4),
              p: Array.from(probs, v => Math.round(v * 1e4) / 1e4),
              top: best,
              meta: { opp: oppTags[0], bx: +ctx.bx.toFixed(3), by: +ctx.by.toFixed(3),
                      tau: +ctx.tau.toFixed(3), ox: +ctx.ox.toFixed(3), rtop: Math.round(rtop),
                      legal: legalCount, cands: cands.length },
            });
            if(nSamples < 200000) out.write(line + '\n');
            nSamples++;
          }else{
            nIllegal++;
          }
          nDecide++;
          curIntent = best >= 0 ? HIP_INTENT.intentToControls(best, { rtop, by: ctx.by, receive: false }) : null;
          curCtl = best;
        }
      }else if(!incoming){
        lastIncoming = false; curIntent = null; curCtl = null;
      }
      return ctl.plan(obs, curIntent);
    },
    credit(){},
  };

  /* 打点：跑到 points 个「分」为止（用 playInputPoint 一分一分跑） */
  let pts = 0, wins = 0, gi = 0;
  while(pts < points && gi < points * 6){
    const opp = OPP.at(oppTags[gi % oppTags.length]);
    const r = INPUTSIM.playInputPoint(brain, opp, mulberry32((seed + gi * 7919) >>> 0),
                                      (gi % 2 === 0) ? 'player' : 'ai');
    pts++; gi++;
    if(r.winner === 'player') wins++;
    if(pts % 100 === 0){
      process.stdout.write('\r  已跑 ' + pts + ' 分，决策 ' + nDecide + '，样本 ' + nSamples +
                           '，无合法解 ' + nIllegal + '  ');
    }
  }
  out.end();
  const dt = (Date.now() - t0) / 1000;
  console.log('\r  教师完成：' + pts + ' 分（胜 ' + wins + '），决策 ' + nDecide +
              '，样本 ' + nSamples + '，无合法解 ' + nIllegal);
  console.log('  写入 ' + path.relative(ROOT, outPath) + '  用时 ' + dt.toFixed(1) + 's' +
              '（' + (nSamples / Math.max(dt, 0.01)).toFixed(1) + ' 样本/s）');
}
main();
