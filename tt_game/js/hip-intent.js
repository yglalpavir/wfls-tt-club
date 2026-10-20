/* =====================================================================
 *  hip-intent.js — HIP L2 的**动作空间**：336 类战术意图
 *
 *  为什么不用原来的 1904 维（34 鼠标X × 14 鼠标Y × Ctrl × 发球旋转）：
 *    1904 路是**鼠标档位的笛卡尔积**，其中绝大多数格点物理上等价或不可达；
 *    用它做分类，等于让网络去学「鼠标该按到第几格」，而真正要学的是
 *    「这球往哪打、打多重、怎么打」。实测（phase5-findings）：
 *    1904 维上 MSE/硬标签 BC 全部失败（硬目标把另外 1903 维往 0 拉、
 *    qmax 跑到 1e93），唯一奏效的是「解析先验 + 排序更新」。
 *
 *  336 类 = 落点 7 × 深度 4 × 打击 6 × Ctrl 2：
 *    · 落点 7：期望落点 x ∈ {−0.62,−0.42,−0.20, 0, +0.20,+0.42,+0.62}
 *    · 深度 4：期望落点 |z| ∈ {0.45, 0.70, 0.95, 1.20}（台半长 1.37）
 *    · 打击 6：drive / loop / smash / push / lift / block
 *    · Ctrl 2：按住 / 不按（搓球窗口）
 *
 *  「期望落点」是**意图**，不是直接的控制量：L1（hip-skill.js）负责把它
 *  反解成 {tx, my, ctrl, pz}（见 intentToControls + HIP_SKILL.plan 的
 *  落点闭环）。物理口径与人类玩家完全一致（同样的 aimX/aimZ 公式）。
 * ===================================================================== */
'use strict';

const HIP_INTENT = (() => {
  /* ---- 落点：期望落点 x（会被 resolveHit 夹到 ±aimXMax=0.62）---- */
  const PLACEMENTS = [-0.62, -0.42, -0.20, 0.0, 0.20, 0.42, 0.62];
  const PLACEMENT_NAMES = ['L-out', 'L-mid', 'L-in', 'centre', 'R-in', 'R-mid', 'R-out'];
  /* ---- 深度：期望落点 |z|（0.45 = 摆短，1.20 = 底线）---- */
  const DEPTHS = [0.45, 0.70, 0.95, 1.20];
  const DEPTH_NAMES = ['short', 'half', 'deep', 'baseline'];
  /* ---- 打击手法 ---- */
  const STROKES = ['drive', 'loop', 'smash', 'push', 'lift', 'block'];
  const STROKE_NAMES = ['drive', 'loop', 'smash', 'push', 'lift', 'block'];

  const N_PLACE = PLACEMENTS.length, N_DEPTH = DEPTHS.length;
  const N_STROKE = STROKES.length, N_CTRL = 2;
  const N_INTENT = N_PLACE * N_DEPTH * N_STROKE * N_CTRL;   // 7*4*6*2 = 336

  /* 编码：place*84 + depth*24 + stroke*2 + ctrl（与 decode 互为双射） */
  function encode(place, depth, stroke, ctrl){
    return (((place * N_DEPTH + depth) * N_STROKE + stroke) * N_CTRL) + (ctrl ? 1 : 0);
  }
  function decode(id){
    const ctrl = id % N_CTRL;
    let r = (id - ctrl) / N_CTRL;
    const stroke = r % N_STROKE; r = (r - stroke) / N_STROKE;
    const depth = r % N_DEPTH;   r = (r - depth) / N_DEPTH;
    const place = r;
    return { place, depth, stroke, ctrl: !!ctrl };
  }
  function get(id){
    const d = decode(id);
    return {
      id,
      place: d.place, depth: d.depth, stroke: d.stroke, ctrl: d.ctrl,
      placeX: PLACEMENTS[d.place],
      placeName: PLACEMENT_NAMES[d.place],
      depthZ: DEPTHS[d.depth],
      depthName: DEPTH_NAMES[d.depth],
      strokeName: STROKE_NAMES[d.stroke],
    };
  }

  /* ---- 合法掩码 ----
   * 掩码只挡「物理上不可能 / 必然自失误」的组合，不挡「不最优」的：
   *   · push（搓）只在**下旋来球**上成立（fitWindow 的 pushF 分支）；
   *     上旋来球按 ctrl 不会进搓球窗口，只是白按。
   *   · smash（爆冲）需要高球（球高 > TABLE_TOP+0.13）且不是接发球板。
   *   · lift（挑）需要下旋来球（否则没有挑的动机，且下网率极高）。
   *   · 其余组合都合法。 */
  function mask(ctx){
    const m = new Uint8Array(N_INTENT);
    const rtop = ctx && ctx.rtop != null ? ctx.rtop : 0;      // relTopOf(spin.x, vz)
    const by = ctx && ctx.by != null ? ctx.by : 0.91;        // 预测触球高度
    const isBack = rtop < -8;
    const isHigh = by > 0.89;
    const receive = !!(ctx && ctx.receive);
    for(let id = 0; id < N_INTENT; id++){
      const d = decode(id);
      let ok = true;
      if(d.stroke === 3 && !isBack) ok = false;               // push 需要下旋
      if(d.stroke === 4 && !isBack) ok = false;               // lift 需要下旋
      if(d.stroke === 2 && (!isHigh || receive)) ok = false;  // smash 需要高球且非接发球
      m[id] = ok ? 1 : 0;
    }
    return m;
  }

  /* ---- 意图 → L1 控制量 ----
   * 深度 → my：出球落点深度由 aimZ = zDeep + (zShort−zDeep)·my² 决定，
   * 玩家侧 aimZ = −1.24 + 0.74·my²（zDeep=−1.24, zShort=−0.50），
   * 期望落点 |z| = depth ⇒ my = sqrt((1.24 − depth)/0.74)。
   * 手法 → my/ctrl 的修正（弧线与前冲）：
   *   push  按 ctrl（进搓球宽容窗口），深度用 myPush
   *   lift  抬高 my（弧线高、落点浅一点）
   *   smash 压低 my（弧线平、球速高）
   *   其余  用 depth 直接换算出来的 my。
   * 返回 {my, ctrl, aimX, depthZ}，其中 aimX 是**期望落点 x**（L1 再做闭环）。 */
  function intentToControls(id, ctx){
    const it = get(id);
    let my = Math.sqrt(Math.max(0, (1.24 - it.depthZ) / 0.74));
    let ctrl = false;
    if(it.stroke === 3){ ctrl = true; my = 0.56; }              // push
    else if(it.stroke === 4){ my = Math.max(my, 0.72); }          // lift
    else if(it.stroke === 2){ my = Math.min(my, 0.34); }          // smash
    else if(it.stroke === 1){ my = Math.max(my, 0.44); }          // loop（稍抬高弧线）
    return { my: Math.min(Math.max(my, 0.15), 0.95), ctrl, aimX: it.placeX, depthZ: it.depthZ };
  }

  /* ---- 每个「落点 × 深度 × 手法」组合的一个代表意图（Ctrl 由掩码决定）---- */
  function representative(id){
    const d = decode(id);
    return { place: d.place, depth: d.depth, stroke: d.stroke };
  }

  /* ---- 学生的输入特征（教师与学生必须用同一份，否则学的是另一个函数）----
   * 28 维，全部来自 15 字段 obs + L1 的接触点预测（**不含意图**，否则自举）。
   * 刻意不放的东西：对手的意图、比分、对手的跑位历史 —— M2 先只学「这一板往哪打」。
   * L1 的预测（hip-skill.js#predictContact）是确定性的纯函数，重复调用无副作用。 */
  const N_FEAT = 28;
  function skill(){
    if(typeof HIP_SKILL !== 'undefined') return HIP_SKILL;
    if(typeof require === 'function'){ try { return require('./hip-skill.js').HIP_SKILL; } catch(e){ return null; } }
    return null;
  }
  const F = (v, lo, hi) => {
    if(v == null || !isFinite(v)) return 0;
    return Math.max(lo, Math.min(hi, v));
  };
  function features(obs){
    const o = obs || {};
    const sk = skill();
    const ct = sk ? sk.predictContact(o, o.pz != null ? o.pz : 1.32) : null;
    const ok = ct && ct.ok ? 1 : 0;
    const bx = ok ? ct.x : o.x, by = ok ? ct.y : o.y, bz = ok ? ct.z : o.pz;
    const tau = ok ? ct.tau : 9;
    const inSpd = ok ? ct.inSpd : Math.abs(o.vz || 0);
    const inVx = ok ? ct.inVx : (o.vx || 0);
    const px = o.px || 0, pz = o.pz != null ? o.pz : 1.32;
    const svx = o.svx || 0, svz = o.svz || 0;
    const rtop = sk && sk.constants ? 0 : 0;   // 占位，rtop 由调用方补（见 rtopOf）
    const f = new Float32Array(N_FEAT);
    f[0]  = F(o.x, -1.3, 1.3) / 1.3;
    f[1]  = F(o.y, 0, 1.6) / 1.6;
    f[2]  = F(o.z, -1.6, 2.2) / 2.2;
    f[3]  = F(o.vx, -6, 6) / 6;
    f[4]  = F(o.vy, -6, 6) / 6;
    f[5]  = F(o.vz, -8, 8) / 8;
    f[6]  = F(o.sx, -300, 300) / 300;
    f[7]  = F(o.sy, -200, 200) / 200;
    f[8]  = F(bx, -1.3, 1.3) / 1.3;
    f[9]  = F(by, 0, 1.6) / 1.6;
    f[10] = F(bz, 0.6, 2.0) - 1.3;
    f[11] = F(tau, 0, 1.2) / 1.2;
    f[12] = F(inSpd, 0, 16) / 16;
    f[13] = F(inVx, -6, 6) / 6;
    f[14] = F(px, -1.3, 1.3) / 1.3;
    f[15] = F(pz, 0.6, 1.8) - 1.2;
    f[16] = F(svx, -8, 8) / 8;
    f[17] = F(svz, -8, 8) / 8;
    f[18] = ok ? F(ct.bz, 0, 1.6) / 1.6 : 0;      // 预测落台点 z
    f[19] = ok ? F(ct.vzPost, 0, 16) / 16 : 0;    // 弹起后的 vz
    f[20] = F(o.ox, -1.3, 1.3) / 1.3;            // 对手拍位 x
    f[21] = F(o.rtop, -200, 200) / 200;          // 来球旋转（relTop）
    f[22] = o.bounced ? 1 : 0;
    f[23] = ok;
    f[24] = F(0.55 * px + 0.30 * svx, -0.9, 0.9) / 0.9;   // 当前自然落点
    f[25] = ok ? F(ct.targetZ, 0.6, 1.8) - 1.2 : 0;      // 拍面目标深度
    f[26] = F(bx - px, -1.0, 1.0);                       // 球相对拍位的横向差
    f[27] = F(bz - pz, -1.2, 1.2);                       // 球相对拍位的纵深差
    return f;
  }

  /* relTopOf（来球旋转的相对上旋）：与 simcore/policy 同口径 */
  function rtopOf(obs){
    const sx = (obs && obs.sx) || 0, vz = (obs && obs.vz) || 0;
    return sx * (vz < 0 ? -1 : 1);
  }

  /* ================= L2 策略网络（CE 蒸馏出来的） =================
   * 结构：28 → 96 → 128 → 128 → 336，ReLU 隐层，输出 336 logits。
   * 权重格式（js/hip-weights.js）：
   *   { sizes:[28,96,128,128,336], w:[扁平 float32], meta:{...} }
   * 扁平数组 = 逐层 [W(行优先 out×in) | b(out)] 拼接。
   * 参数约 3.6 万 → fp32 约 145KB（比 1904 维 DQN 的 9.7MB 小 60 倍）。 */
  function forward(weights, feats){
    const sizes = weights.sizes, w = weights.w;
    let off = 0, a = feats, out = null;
    for(let L = 0; L < sizes.length - 1; L++){
      const nIn = sizes[L], nOut = sizes[L + 1];
      const W = w.subarray ? w.subarray(off, off + nOut * nIn) : w.slice(off, off + nOut * nIn);
      off += nOut * nIn;
      const b = w.subarray ? w.subarray(off, off + nOut) : w.slice(off, off + nOut);
      off += nOut;
      const o = new Float32Array(nOut);
      for(let j = 0; j < nOut; j++){
        let s = b[j];
        const base = j * nIn;
        for(let i = 0; i < nIn; i++) s += W[base + i] * a[i];
        o[j] = (L === sizes.length - 2) ? s : (s > 0 ? s : 0);   // 最后一层线性
      }
      a = o; out = o;
    }
    return out;
  }
  /* softmax + argmax（教师标签是概率分布，推理只需要 argmax） */
  function argmax(weights, feats){
    const o = forward(weights, feats);
    let bi = 0, bv = -Infinity;
    for(let i = 0; i < o.length; i++) if(o[i] > bv){ bv = o[i]; bi = i; }
    return bi;
  }
  function softmax(logits){
    let mx = -Infinity;
    for(let i = 0; i < logits.length; i++) if(logits[i] > mx) mx = logits[i];
    const o = new Float32Array(logits.length);
    let s = 0;
    for(let i = 0; i < logits.length; i++){ const e = Math.exp(logits[i] - mx); o[i] = e; s += e; }
    for(let i = 0; i < o.length; i++) o[i] /= (s || 1);
    return o;
  }

  return {
    PLACEMENTS, PLACEMENT_NAMES, DEPTHS, DEPTH_NAMES, STROKES, STROKE_NAMES,
    N_PLACE, N_DEPTH, N_STROKE, N_CTRL, N_INTENT, N_FEAT,
    encode, decode, get, mask, intentToControls, representative, features, rtopOf,
    forward, argmax, softmax,
    STROKE_PUSH: 3, STROKE_LIFT: 4, STROKE_SMASH: 2,
  };
})();

if(typeof module !== 'undefined' && module.exports) module.exports = { HIP_INTENT };
