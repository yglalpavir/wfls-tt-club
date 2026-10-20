/* HIP 教师（安全动作集版）：给 K 个「已验证安全」的选项打分并打标
 * ---------------------------------------------------------------------------
 * 与 tools/hip-teacher.js（336 类原始意图）的区别：
 *   1) 候选空间是 js/hip-choice.js 里的 K 个选项（每个都是实机验证过安全的
 *      my × 落点偏移组合），不���「打长出界/够不到」的组合混进学习空间；
 *   2) 打分里显式加了**挥拍代价**（|落点偏移|）——因为落点偏移只能靠挥拍实现，
 *      而挥拍会让拍子漂离球。旧教师没有这一项，所以它教出来的落点偏得很；
 *   3) 标签是 K 路 softmax（temp 可调），学生只做一次 K 分类。
 *
 * 用法（cwd = tt_game/）：
 *   node tools/hip-choice-teacher.js --opp hell,grandslam,default --points 9000 \
 *        --temp 0.12 --out data/hip/choice-v1.ndjson
 */
const path = require('path');
const fs = require('fs');

const ROOT = path.join(__dirname, '..');
const INPUTSIM = require(path.join(ROOT, 'js', 'input-sim.js'));
const SIM = global.SIM || require(path.join(ROOT, 'js', 'simcore.js'));
const OPP = require(path.join(ROOT, 'js', 'opponent-ladder.js'));
const { HIP_SKILL } = require(path.join(ROOT, 'js', 'hip-skill.js'));
const { HIP_INTENT } = require(path.join(ROOT, 'js', 'hip-intent.js'));
const { HIP_CHOICE } = require(path.join(ROOT, 'js', 'hip-choice.js'));

function argOf(flag, def){
  const i = process.argv.indexOf(flag);
  if(i >= 0 && i + 1 < process.argv.length && !String(process.argv[i + 1]).startsWith('--')) return process.argv[i + 1];
  return def;
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

const OPP_SPEED = 2.8;      // 对手 moveSpeed
const OPP_REACT = 0.12;     // 对手反应时间（秒）
const AIM = (SIM.C && SIM.C.AIM) || { xFromPos: 0.55, xFromSwipe: 0.30, zDeep: -1.24, zShort: -0.50 };

/* ---- 给一个选项打分 ---- */
function scoreOption(opt, ctx){
  const ctl = HIP_CHOICE.optionToIntent(opt.id, ctx.obs, AIM);
  const aimZ = AIM.zDeep + (AIM.zShort - AIM.zDeep) * ctl.my * ctl.my;
  let r;
  try{
    r = SIM.resolveHit({
      stroke: 'forehand',
      pos: { x: ctx.bx, y: ctx.by, z: ctx.bz },
      vel: { x: ctx.vx, y: ctx.vy, z: ctx.vz },
      spin: { x: ctx.sx, y: ctx.sy, z: 0 },
      swipe: ctx.svx, fwd: SIM.fwdOf ? SIM.fwdOf(ctx.svz) : 0,
      mouseNy: ctl.my,
      aim: { x: ctl.aimX, z: aimZ, gx: ctx.px },
      ctrlHold: !!ctl.ctrl, dir: -1, applyArcAdj: true, receive: false, rng: ctx.rng,
    });
  }catch(e){ return { s: -12, legal: 0 }; }
  if(!r || !r.outVel) return { s: -12, legal: 0 };
  let land;
  try{
    land = SIM.simulateFull({ x: ctx.bx, y: ctx.by, z: ctx.bz }, r.outVel, 'player',
                             { x: r.spin.x, y: r.spin.y, z: 0 }, ctx.rng);
  }catch(e){ return { s: -12, legal: 0 }; }
  if(!land || !land.ok) return { s: -12, legal: 0, reason: land && land.reason };
  const L = land.landing || { x: 0, z: 0 };

  /* 对手够不到的概率 */
  const dist = Math.hypot(L.x - ctx.bx, L.z - ctx.bz);
  const hSpd = Math.hypot(r.outVel.x, r.outVel.z) || 1;
  const flightT = dist / hSpd;
  const reachT = Math.abs(L.x - ctx.ox) / OPP_SPEED;
  const availT = flightT + OPP_REACT;
  const pMiss = 1 / (1 + Math.exp(-(availT - reachT) / 0.10));

  const qFar = cl(Math.abs(L.x - ctx.ox) / 0.85, 0, 1);
  const az = Math.abs(L.z);
  const qDeep = az < 0.45 ? 0 : (az > 1.35 ? cl((1.45 - az) / 0.20, 0, 1)
                          : (az <= 1.05 ? (az - 0.45) / 0.60 : (1.35 - az) / 0.30));
  const spd = Math.hypot(r.outVel.x, r.outVel.y, r.outVel.z);
  const qSpeed = cl(spd / 6.5, 0, 1);
  const margin = Math.min(0.7625 - Math.abs(L.x), 1.37 - az);
  const risk = cl((0.12 - margin) / 0.12, 0, 1);

  /* ★ 挥拍代价：落点偏移只能靠挥拍实现，挥拍会让拍子漂离球
   *   （漂移 ≈ 0.065·vCmd，vCmd ≈ aimOffset/0.30）。 */
  const swingCost = 1.4 * cl(Math.abs(opt.aim) / 0.22, 0, 1);

  const s = 2.4 * pMiss + 1.2 * qFar + 1.0 * qDeep + 0.7 * qSpeed - 1.6 * risk - swingCost;
  return { s, legal: 1, land: L, mode: r.mode };
}

function main(){
  const oppTags = argOf('--opp', 'hell').split(',').map(s => s.trim()).filter(Boolean);
  const points = parseInt(argOf('--points', '9000'), 10);
  const temp = parseFloat(argOf('--temp', '0.12'), 10);
  const seed = parseInt(argOf('--seed', '20261004'), 10);
  const outPath = path.resolve(ROOT, argOf('--out', 'data/hip/choice-v1.ndjson'));
  if(!fs.existsSync(path.dirname(outPath))) fs.mkdirSync(path.dirname(outPath), { recursive: true });
  const out = fs.createWriteStream(outPath, { flags: 'w' });

  const ctl = HIP_SKILL.makeController();
  let nDecide = 0, nSamples = 0, nIllegal = 0;
  const t0 = Date.now();
  const rng = mulberry32(seed);

  const hist = {};        // 最优选项的分布（诊断用）
  let lastIncoming = false, curIntent = null, labeled = false;
  /* 打标时刻（秒，触球前的剩余时间）：必须与 L1 的挥拍阶段起点一致 */
  const LABEL_TAU = 0.06;

  const brain = {
    act(obs){
      const incoming = (obs.vz || 0) > 0.15;
      if(!incoming){ lastIncoming = false; curIntent = null; return ctl.plan(obs, null); }
      if(!lastIncoming){ lastIncoming = true; labeled = false; }
      /* ★ 打标时刻 = **挥拍阶段起点**（τ ≤ LABEL_TAU），不是来球第一帧。
       *   理由：部署时 L2 的输出真正影响落点的是挥拍阶段（τ < swingLead=0.05），
       *   而 L1 的挥拍阶段也是由 τ 触发的 ⇒ 训练与部署必须同一时刻。
       *   早期（τ 很大）预测最不准，接触点 bx 能差 0.3m 以上，学出来的映射
       *   用在挥拍阶段上必然失配。每球只打一次标。 */
      const ct = HIP_SKILL.predictContact(obs, obs.pz != null ? obs.pz : 1.32);
      if(ct && ct.ok && !labeled && ct.tau <= LABEL_TAU){
        labeled = true;
          const rtop = HIP_INTENT.rtopOf(obs);
          const ctx = {
            obs,
            bx: ct.x, by: ct.y, bz: ct.z, tau: ct.tau,
            vx: obs.vx, vy: obs.vy, vz: obs.vz, sx: obs.sx, sy: obs.sy,
            px: obs.px || 0, svx: obs.svx || 0, svz: obs.svz || 0,
            ox: obs.ox || 0, rtop, isBack: rtop < -8,
            receive: false, rng: mulberry32((seed + nDecide * 7919) >>> 0),
          };
          const m = HIP_CHOICE.mask({ rtop });
          const scores = new Float64Array(HIP_CHOICE.N_OPT);
          let best = -1, bestS = -1e9, legalCount = 0;
          for(let i = 0; i < HIP_CHOICE.N_OPT; i++){
            if(!m[i]){ scores[i] = -1e9; continue; }
            const sc = scoreOption(HIP_CHOICE.OPTIONS[i], ctx);
            scores[i] = sc.s;
            if(sc.legal) legalCount++;
            if(sc.s > bestS){ bestS = sc.s; best = i; }
          }
          if(best >= 0 && bestS > -11){
            let mx = -Infinity;
            for(let i = 0; i < HIP_CHOICE.N_OPT; i++) if(scores[i] > mx) mx = scores[i];
            let sum = 0;
            const p = new Float64Array(HIP_CHOICE.N_OPT);
            for(let i = 0; i < HIP_CHOICE.N_OPT; i++){
              if(scores[i] <= -1e8){ p[i] = 0; continue; }
              const e = Math.exp((scores[i] - mx) / temp); p[i] = e; sum += e;
            }
            for(let i = 0; i < HIP_CHOICE.N_OPT; i++) p[i] /= (sum || 1);

            const f = HIP_INTENT.features(Object.assign({}, obs, { rtop }));
            const name = HIP_CHOICE.OPTIONS[best].name;
            hist[name] = (hist[name] || 0) + 1;
            out.write(JSON.stringify({
              f: Array.from(f, v => Math.round(v * 1e4) / 1e4),
              p: Array.from(p, v => Math.round(v * 1e4) / 1e4),
              top: best,
              meta: { opp: oppTags[0], bx: +ctx.bx.toFixed(3), by: +ctx.by.toFixed(3),
                      tau: +ctx.tau.toFixed(3), ox: +ctx.ox.toFixed(3), rtop: Math.round(rtop),
                      legal: legalCount, bestS: +bestS.toFixed(3) },
            }) + '\n');
            nSamples++;
          }else{
            nIllegal++;
          }
          nDecide++;
          curIntent = best >= 0 ? HIP_CHOICE.optionToIntent(best, obs, AIM) : null;
      }
      return ctl.plan(obs, curIntent);
    },
    credit(){},
  };

  let pts = 0, wins = 0, gi = 0;
  while(pts < points && gi < points * 6){
    const opp = OPP.at(oppTags[gi % oppTags.length]);
    const r = INPUTSIM.playInputPoint(brain, opp, mulberry32((seed + gi * 7919) >>> 0),
                                      (gi % 2 === 0) ? 'player' : 'ai');
    pts++; gi++;
    if(r.winner === 'player') wins++;
  }

  out.end(() => {
    const sec = ((Date.now() - t0) / 1000).toFixed(1);
    console.log(`教师(安全动作集) 决策 ${nDecide} 次，样本 ${nSamples}，非法 ${nIllegal}，用时 ${sec}s`);
    console.log(`教师自胜 ${wins}/${pts} = ${(100 * wins / Math.max(pts,1)).toFixed(1)}%`);
    console.log('最优选项分布：');
    Object.keys(hist).sort((a,b) => hist[b] - hist[a]).forEach(k =>{
      console.log('  ' + k.padEnd(8) + String(hist[k]).padStart(6) + '  (' + (100*hist[k]/Math.max(nSamples,1)).toFixed(1) + '%)');
    });
  });
}

main();
