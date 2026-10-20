/* HIP L3：对手可达性模型（Opponent Reachability Model）
 * ============================================================================
 * 目标：回答「这一球，对手**够不够得到**？」——这是 L2 战术层能不能学到
 * 「把球打到对手够不到的地方」的前提。
 *
 * 现状：教师（tools/hip-choice-teacher.js）里用的是**解析近似**
 *     pMiss = sigmoid((reachT − availT) / 0.10)
 *   其中 reachT = |落点x − 对手x| / OPP_SPEED(2.8)，availT = 飞行时间 + 反应时间。
 *   这个近似有已知缺陷：
 *     · 对手的速度上限是常数 2.8，忽略了不同对手档位的差异；
 *     · 忽略了拍面深度（moveZ）与球的弧线、旋转对击球点的影响；
 *     · 忽略了下旋来球让接触窗口变宽（fitWindow 的 pushF）这件事。
 *   实测后果：教师的最优解退化成「恒定往右打一点」= 复制解析层 L1，
 *   学习层拿不到任何增量（docs/reports/hip-m3-findings.md §10）。
 *
 * 本模块的做法：**标签免费**——对手真的回球了 = 够得到（1），没够到 = 0。
 * 于是可以在仿真里大规模采样，训练一个小判别模型来替代解析近似。
 *
 * 特征（10 维，全部无量纲化）：
 *   0 落点 x                     /1.2
 *   1 落点深度 |z|               /1.37
 *   2 弹起后水平速度              /6
 *   3 弹起后垂直速度              /4
 *   4 弹起后 |旋转 x|            /200
 *   5 落点 x − 对手拍位 x（要跑多远）/1.2
 *   6 对手跑位速度                /3.4
 *   7 出球到落点的水平飞行时间     /1.0
 *   8 相持板数                    /10
 *   9 下降角（弧线平不平）         /1.57
 *
 * 网络：10 → 24 → 24 → 1（sigmoid），BCE 损失。
 * 权重文件：js/hip-l3-weights.js（tools/hip-l3-train.js 生成，勿手改）。
 */
'use strict';

const HIP_L3 = (() => {
  const N_FEAT = 10;

  const cl = (v, a, b) => (v < a ? a : (v > b ? b : v));

  /* 对手跑位速度：policy 对象里是扁平键 moveSpeed；取不到用默认 2.45 */
  function polSpeed(pol){
    if(!pol) return 2.45;
    const v = (typeof pol.moveSpeed === 'number') ? pol.moveSpeed : null;
    return (v == null) ? 2.45 : v;
  }

  /* ---- 上下文 → 10 维特征 ----
   * ctx 可以是两种来源：
   *   ① 仿真采集：{ sim, state, oppX, shots, pol }
   *      （sim = SIM.simulateFull 的结果，含 landing / bounce）
   *   ② 教师假设：{ landing, bounce, from, vel, oppX, shots, pol, spd }
   *      （教师用自己算出的落点/弹起来问「对手够不够得到」）
   */
  function features(ctx){
    ctx = ctx || {};
    const sim = ctx.sim || null;
    const land = ctx.landing || (sim && sim.landing) || { x: 0, y: 0, z: 0 };
    const bnc  = ctx.bounce  || (sim && sim.bounce)  || null;
    const bv   = (bnc && bnc.vel)  ? bnc.vel  : { x: 0, y: 0, z: 0 };
    const bs   = (bnc && bnc.spin) ? bnc.spin : { x: 0, y: 0, z: 0 };
    const st   = ctx.state || null;
    const from = ctx.from || (st && st.pos) || { x: 0, y: 0, z: 0 };
    const vel  = ctx.vel  || (st && st.vel) || { x: 0, y: 0, z: 0 };
    const oppX = (typeof ctx.oppX === 'number') ? ctx.oppX : 0;
    const shots= (typeof ctx.shots === 'number') ? ctx.shots : 0;
    const spd  = (typeof ctx.spd === 'number') ? ctx.spd : polSpeed(ctx.pol);

    const dx = land.x - oppX;                       // 对手要横向跑多远
    const hvx = Math.max(Math.abs(vel.x), 0.5);      // 出球的水平速度（估）
    const travel = Math.abs(land.x - from.x) / hvx; // 出球 → 落点的水平飞行时间
    const desc = Math.atan2(Math.max(0, -(bv.y || 0)), Math.abs(bv.x || 0) + 0.4);

    return [
      cl(land.x / 1.2, -1.5, 1.5),
      cl(Math.abs(land.z) / 1.37, 0, 1.2),
      cl((bv.x || 0) / 6, -1.5, 1.5),
      cl((bv.y || 0) / 4, -1.5, 1.5),
      cl(Math.abs(bs.x || 0) / 200, 0, 1.5),
      cl(dx / 1.2, -1.5, 1.5),
      cl(spd / 3.4, 0, 1.5),
      cl(travel, 0, 2.5),
      cl(shots / 10, 0, 3),
      cl(desc / 1.5708, 0, 1.2),
    ];
  }

  /* ---- 前向：{sizes, w} → P(对手够得到) ---- */
  function forward(net, f){
    if(!net || !net.sizes || !net.w) return 0.5;
    const S = net.sizes, W = net.w;
    let off = 0;
    const acts = [f];
    for(let l = 0; l < S.length - 1; l++){
      const nin = S[l], nout = S[l + 1];
      const cur = new Array(nout);
      for(let j = 0; j < nout; j++){
        let s = 0;
        for(let i = 0; i < nin; i++) s += W[off + i] * acts[l][i];
        off += nin;
        const b = W[off++];
        let a = s + b;
        if(l < S.length - 2) a = (a > 0 ? a : 0);   // 中间层 ReLU
        cur[j] = a;
      }
      acts.push(cur);
    }
    const last = acts[acts.length - 1][0];
    return 1 / (1 + Math.exp(-last));
  }

  return { N_FEAT, features, forward, polSpeed };
})();

if(typeof module !== 'undefined' && module.exports) module.exports = { HIP_L3 };
