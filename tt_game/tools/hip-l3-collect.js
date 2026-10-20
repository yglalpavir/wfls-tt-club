/* =====================================================================
 *  hip-l3-collect.js — L3 对手可达性模型的数据采集
 *
 *  在**仿真**里用 HIP L1 当玩家侧控制器，对各种对手档位打球，
 *  每次「对手接球」都记录一条样本：
 *    f = HIP_L3.features(ctx)   —— 10 维物理特征
 *    y = 对手够到了吗（1/0）    —— 标签免费（对手真的回球了 = 够得到）
 *
 *  为了让落点分布足够散（否则全是「对手站中间、轻松接到」的样本），
 *  每一分都会随机化玩家侧的落点目标与出球深度：
 *    aimForce ∈ [-0.62, 0.62]（强制绝对落点）、myDrive ∈ [0.46, 0.68]
 *
 *  输出：ndjson，每行 { f:[10], y:0|1, m:{tag,lx,lz,dx} }
 * ===================================================================== */
'use strict';
const path = require('path');
const fs = require('fs');

const ROOT = path.join(__dirname, '..');
/* input-sim.js 会建立 global.SIM / global.P（opponent-ladder 依赖它们） */
const INPUTSIM = require(path.join(ROOT, 'js', 'input-sim.js'));
const { HIP_SKILL } = require(path.join(ROOT, 'js', 'hip-skill.js'));
const { HIP_L3 } = require(path.join(ROOT, 'js', 'hip-l3.js'));
const OPP = require(path.join(ROOT, 'js', 'opponent-ladder.js'));
const P = require(path.join(ROOT, 'js', 'policy.js'));

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

function main(){
  const outPath = path.resolve(ROOT, argOf('--out', 'data/hip/l3-v1.ndjson'));
  const want = parseInt(argOf('--points', '20000'), 10);      // 目标样本数
  const maxPoints = parseInt(argOf('--maxPoints', '4000'), 10);
  const seed = parseInt(argOf('--seed', '20261004'), 10);
  const tags = argOf('--opp', 'default,hell,grandslam,extreme,nemesis').split(',');

  const rng = mulberry32(seed);
  const out = fs.createWriteStream(outPath, { flags: 'w' });
  let n = 0, nPos = 0, nNeg = 0, nSkip = 0, nPoint = 0;
  let curTag = '';
  const perTag = {};
  /* ★ --alt <v>：**逐板交替**强制绝对落点（±v），而不是每分随机一个固定落点。
   *   为什么要逐板交替：对手的横向速度上限是 moveSpeed(2.8 m/s)，而击球飞行时间只有
   *   ~0.4s ⇒ 对手最多横移 ~1.1m；台半宽 0.7625m。
   *   ⇒ 只有当对手**站在一边**而我们把球打到**另一边**时，它才够不到；
   *   每分随机的固定落点做不到这件事（对手总能回到中间）⇒ 上一版采集全是正样本。 */
  const altV = parseFloat(argOf('--alt', ''));
  const hasAlt = !isNaN(altV);
  /* ★ --err <v>：覆盖对手的瞄准误差基数 moveErr（诊断「对手的辅助预算」）。
   *   moveErr 是 aiStep 里每板抽一次的高斯瞄准误差的基数（σ = moveErr + amp）。
   *   把它调到 0.3/0.6/1.0 就能量出：**对手的瞄准误差要大到什么程度才会真的漏球**。 */
  const errOv = parseFloat(argOf('--err', ''));
  const hasErr = !isNaN(errOv);
  /* 接触余量统计：gap = |球x−拍x|，fitX = 该板的横向容差 */
  const gapStat = { n: 0, sum: 0, max: 0, over: 0, fitSum: 0, errSum: 0, errAbs: 0 };

  INPUTSIM.setObserver(function(ctx, r){
    /* 标签：对手接到了 = 1；没接到（timeout）= 0；其它（球出界等）跳过 */
    let y = null;
    if(r && r.hit) y = 1;
    else if(r && r.loss === 'timeout') y = 0;
    if(y === null){ nSkip++; return; }
    const f = HIP_L3.features(ctx);
    if(r && typeof r.gap === 'number'){
      gapStat.n++; gapStat.sum += r.gap;
      gapStat.fitSum += (r.fitX || 0);
      gapStat.errSum += (r.xErr || 0);
      gapStat.errAbs += Math.abs(r.xErr || 0);
      if(r.gap > gapStat.max) gapStat.max = r.gap;
    }
    out.write(JSON.stringify({ f: f, y: y,
      m: { tag: curTag, lx: +(ctx.sim && ctx.sim.landing ? ctx.sim.landing.x : 0).toFixed(3),
           lz: +(ctx.sim && ctx.sim.landing ? ctx.sim.landing.z : 0).toFixed(3),
           dx: +(ctx.oppX || 0).toFixed(3),
           gap: r && typeof r.gap === 'number' ? +r.gap.toFixed(3) : null,
           fitX: r && typeof r.fitX === 'number' ? +r.fitX.toFixed(3) : null,
           xErr: r && typeof r.xErr === 'number' ? +r.xErr.toFixed(3) : null } }) + '\n');
    n++; if(y) nPos++; else nNeg++;
  });

  const t0 = Date.now();
  while(n < want && nPoint < maxPoints){
    nPoint++;
    const tag = tags[Math.floor(rng() * tags.length) % tags.length];
    curTag = tag;
    const pol0 = (tag === 'trap') ? (P.policyForModel('trap') || P.POLICY_DEFAULT)
                                  : (OPP.at(tag) || P.policyForModel(tag) || P.POLICY_DEFAULT);
    /* --delay <v> / --nospin <0|1>：覆盖对手的「读球代价」参数（诊断用）。
     *   readDelay 越大 ⇒ 读旋越久 ⇒ 可用跑位时间越少；readSpin=0 ⇒ 信念包含旋转（无误设）。 */
    const dOv = parseFloat(argOf('--delay', ''));
    const nsOv = argOf('--nospin', '');
    const polOv = Object.assign({}, pol0,
      (isNaN(dOv) ? {} : { readDelay: dOv }),
      (nsOv === '' ? {} : { readSpin: nsOv !== '0' }));
    const pol = hasErr ? Object.assign({}, polOv, { moveErr: errOv }) : polOv;
    /* 随机化玩家侧：落点目标 + 出球深度（把落点空间铺开） */
    const cfg = hasAlt
      ? { aimForceAlt: altV, myDrive: 0.46 + rng() * 0.22 }
      : { aimForce: (rng() * 2 - 1) * 0.62, myDrive: 0.46 + rng() * 0.22 };
    const brain = HIP_SKILL.makeBrain(cfg);
    const r = mulberry32(seed + nPoint * 7919);
    const res = INPUTSIM.playInputPoint(brain, pol, r, (nPoint % 2) === 0 ? 'player' : 'ai');
    perTag[tag] = (perTag[tag] || 0) + 1;
  }
  INPUTSIM.setObserver(null);
  out.end();
  console.log('采集完成：' + n + ' 条样本（够到 ' + nPos + ' / 没够到 ' + nNeg +
              ' / 跳过 ' + nSkip + '），' + nPoint + ' 分，耗时 ' +
              ((Date.now() - t0) / 1000).toFixed(1) + 's');
  console.log('各对手分场次：' + JSON.stringify(perTag));
  if(gapStat.n){
    console.log('接触余量：n=' + gapStat.n +
      '  gap 均值 ' + (gapStat.sum / gapStat.n).toFixed(3) +
      '  gap 最大 ' + gapStat.max.toFixed(3) +
      '  横向容差均值 ' + (gapStat.fitSum / gapStat.n).toFixed(3) +
      '  瞄准误差 |均值| ' + (gapStat.errAbs / gapStat.n).toFixed(3));
  }
  console.log('已写出 ' + path.relative(ROOT, outPath));
}
main();
