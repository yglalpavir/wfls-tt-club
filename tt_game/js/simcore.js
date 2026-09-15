/* =====================================================================
 *  simcore.js — 依赖自由物理核心（浏览器游戏 与 Node 训练器 共用）
 *  · 无 THREE / 无 DOM 依赖；纯函数 + 平面对象 {x,y,z}
 *  · 浏览器中若已加载 constants.js 则自动同步全局常量（单一物理源）
 *  · Node 中可通过 require 导入（底部 module.exports）
 * ===================================================================== */
'use strict';

const SIM = (() => {
  /* 积分/解算的单一时间步。
   * 实机 main.js 对每个 1/60 帧按 n=ceil(dt/(1/120))=2 子步调 physicsStep，所以"真实"
   * 积分分辨率是 1/120。历史上一切解算器都按 1/60 建模：
   *   · serveShot 按 1/60 找速度，实机按 1/120 积分 → 发球轨迹系统性偏移，
   *     实测一次 11 分对局里 4 分以"发球出界"结算；
   *   · predictMeetZ 按 1/60 预测触球点，实机按 1/120 演化 → DQN 深度判断有系统偏差。
   * 现在所有解算器共用 SDT，与实机同分辨率，解出来的东西在实机里才成立。 */
  const SDT = 1 / 120;
  // 发球二跳必须深入对方半台的最小距离（m）。留出这个余量，解算器与实机积分的
  // 微小差异才不会把"合法发球"变成"两跳都在自己半台"。
  const SERV_EMBED = 0.12;
  // 实机 physics.js#checkNet 的"算撞网"高度带是
  //   TABLE_TOP-0.03  ..  TABLE_TOP + NET_H + BALL_R*1.5
  // （比物理网顶高 0.5 个球径：网带有一定厚度/网线形变）。解算器旧版只要求
  //   yC >= TABLE_TOP + NET_H + BALL_R  (= 网顶 + 1 个球径)
  // 比实机撞网带上限低 0.5 球径——它认为合法的发球在实机会被判"擦网/下网"，
  // 球被弹回己方 → "发球失误 · 两跳都在自己半台" / "发球出界"（实测约 6 成发球）。
  // 这里用实机同一上限，再加 2cm 安全余量。
  // 实机 physics.js#checkNet 的"算撞网"高度带是
  //   TABLE_TOP-0.03  ..  TABLE_TOP + NET_H + BALL_R*1.5
  // （比物理网顶高 0.5 个球径：网带有厚度/网线形变）。解算器旧版只要求
  //   yC >= TABLE_TOP + NET_H + BALL_R  (= 网顶 + 1 个球径)
  // 比实机撞网带上限低 0.5 球径——它认为合法的发球在实机会被判"擦网/下网"，
  // 球被弹回己方 → "发球失误 · 两跳都在自己半台" / "发球出界"。
  // 这里用实机同一上限，再加 2cm 安全余量。
  // 用函数而非常量：C 的各字段要在下方浏览器同步块之后才是最终值。
  function netHitTop(){ return C.TABLE_TOP + C.NET_H + C.BALL_R * 1.5 + 0.02; }

  /* ---- 物理常量（默认值 = constants.js；浏览器中会被全局值覆盖同步）---- */
  const C = {
    TABLE_L: 2.74, TABLE_W: 1.525, TABLE_H: 0.76, TABLE_TOP: 0.76,
    NET_H: 0.1525, NET_LEN: 1.83,
    BALL_R: 0.02, G: 9.81, REST: 0.72, AIR: 0.10,
    MAGNUS: 0.0032, SPIN_KICK: 0.016,
    netMargin: 0.07,          // = ASSIST.netMargin
    // —— 出球常量（玩家与 AI 共用同一份；浏览器同步自 constants.js）——
    PADDLE_Y: 0.91, PAD_HW: 0.10, PAD_HH: 0.115, PAD_HD: 0.03,
    X_CLAMP: 1.2, PLAYER_Z: 1.32, AI_Z: -1.32,
    DECIDE_SKIP: 3,        // DQN 决策跳帧（=15Hz）：训练器与实机 tt-player.js 共用同一份
    STROKE: {
      forehand: { paceBase: 2.5, paceSwipe: 0.78, paceMax: 6.5, spinGen: 2.7, sideGen: 40, spinCap: 280, aimXMax: 0.62, arc: 1.0, recover: 0.20, control: 0.78, forgiveV: 0.14, forgiveH: 0.05, forgiveZ: 0.06, magnet: 1.35 },
      backhand: { paceBase: 3.55, paceSwipe: 0.48, paceMax: 6.4, spinGen: 0.65, sideGen: 24, spinCap: 90, aimXMax: 0.74, arc: 0.8, recover: 0.08, control: 0.66, forgiveV: 0.11, forgiveH: 0.035, forgiveZ: 0.05, magnet: 0.95 },
    },
    PUSH: { paceShort: 2.4, paceDeep: 3.4, paceMax: 3.4, paceSwipe: 0.28, arc: 0.55, back: 38, sideCap: 45, control: 0.9, recover: 0.18, fit: { v: 0.08, h: 0.05, z: 0.06, mag: 1.5 }, arcSafe: 0.30, net: 0.10, deep: 0.45, deepPace: 0.7, xRange: 0.6 },
    LIFT: { paceMult: 0.95, arcAdd: 0.10, netRate: 0.002, rush: 0.12 },
    COUNTER: { spinThresh: 30, arc: 0.55, paceFloor: 4.2, pacePerSpin: 0.013, paceMax: 7.0, spinBorrow: 0.4, recover: 0.06 },
    SPIN: { sideCap: 200, toastThresh: 48 },
    AIM: { xFromPos: 0.55, xFromSwipe: 0.30, zDeep: -1.24, zShort: -0.50 },
    ASSISTG: { magnetPull: 2.4, magnetRangeZ: 0.45 },
    STANCE: { relNear: 0.10, relFar: 1.4, bodyBias: 0.55, noiseAmp: 0.16, enter: 0.3, minHold: 0.15, urgent: 1.1, commitT: 0.15, transT: 0.18, transMag: 0.65,
              // v2.2 情境感知（全部为可选输入；缺省 = v2.1 行为）
              meetVCap: 2.5, meetTCap: 0.32,        // 拍速外推上限 (m/s) / 外推时长上限 (s)：触球时刻几何
              fhBias: 0.22, fhBiasT: 0.45,          // 时间充裕→正手偏好强度 / 满偏好所需 TTC (s)
              highY0: 0.13, highYR: 0.12, highBias: 0.30,   // 半高球起偏阈值(相对台面)/渐变区间/高球正手倾向
              uncT: 0.6, noiseMin: 0.4, spinNoiseK: 0.0008, // 不确定度饱和 TTC / 贴脸噪声保有比例 / 侧旋附加噪声
              enterLate: 0.7, escStep: 0.30,        // 贴脸滞回系数（远球=1.0）/ 每已切换一次追加的滞回（软承诺）
              wrap: { vzMax: 2.6, distMin: 0.15, distMax: 0.55, prob: 0.55, wrapSpeed: 1.5 } },
  };
  const clamp = (v, a, b) => v < a ? a : (v > b ? b : v);
  const v = (x, y, z) => ({ x, y, z });
  const vcopy = o => ({ x: o.x, y: o.y, z: o.z });

  /* 反算把球从 from 打到 target 的出射速度（移植 rules.js#solveShot） */
  function solveShot(from, target, speed, arc, spinX, netMargin){
    arc = arc || 1;
    const gEff = C.G + Math.abs(spinX || 0) * speed * C.MAGNUS * 0.8;
    const dx = target.x - from.x, dy = target.y - from.y, dz = target.z - from.z;
    const T = clamp(Math.hypot(dx, dz) / speed, 0.24, 0.95);
    const vx = dx / T, vz = dz / T;
    let vy = dy / T + 0.5 * gEff * T * arc;
    if(Math.abs(vz) > 0.01){
      const tN = (0 - from.z) / vz;
      if(tN > 0.03 && tN < T + 0.3){
        const yN = from.y + vy * tN - 0.5 * gEff * tN * tN;
        const need = C.TABLE_TOP + C.NET_H + (netMargin || C.netMargin) + 0.03;
        if(yN < need) vy += (need - yN) / tN;
      }
    }
    return v(vx, vy, vz);
  }

  /* 校验一板球是否合法落在对方台面（移植 physics.js#simulateShot，返回布尔） */
  function simulateShot(from, vel, hitter, spin){
    const p = vcopy(from), v = vcopy(vel);
    let sx = spin ? spin.x : 0, sy = spin ? spin.y : 0;      // let：飞行中旋转衰减要就地乘减
    const dt = SDT; let crossed = false;
    for(let i = 0; i < 360; i++){
      const py = p.y, pz = p.z;
      v.y -= C.G * dt;
      const drag = 1 - C.AIR * dt; v.x *= drag; v.y *= drag; v.z *= drag;
      // 完整叉积（实机 physicsStep 是 s.cross(v)）+ 飞行中旋转衰减
      v.x += (sy * v.z) * C.MAGNUS * dt;
      v.y += (-sx * v.z) * C.MAGNUS * dt;
      v.z += (sx * v.y - sy * v.x) * C.MAGNUS * dt;
      const sd = Math.max(0, 1 - 0.05 * dt); sx *= sd; sy *= sd;
      p.x += v.x * dt; p.y += v.y * dt; p.z += v.z * dt;
      if(!crossed && ((pz < 0 && p.z >= 0) || (pz > 0 && p.z <= 0))){
        const t = (0 - pz) / (p.z - pz), yC = py + (p.y - py) * t;
        if(yC < C.TABLE_TOP + C.NET_H + C.BALL_R + C.netMargin) return false;
        crossed = true;
      }
      if(v.y < 0 && p.y - C.BALL_R <= C.TABLE_TOP && Math.abs(p.x) <= C.TABLE_W / 2 && Math.abs(p.z) <= C.TABLE_L / 2){
        return hitter === 'player' ? p.z < 0 : p.z > 0;
      }
      if(p.y <= C.BALL_R || Math.abs(p.z) > 4.5 || Math.abs(p.x) > 3) return false;
    }
    return false;
  }

  /* 真实网带判定（移植 physics.js#checkNet 语义）：返回 'clear'|'let'|'fault' */
  function netHit(yC, xC){
    if(Math.abs(xC) > C.NET_LEN/2 + C.BALL_R) return 'clear';            // 网柱外
    if(yC > C.TABLE_TOP + C.NET_H + C.BALL_R*1.5 || yC < C.TABLE_TOP - 0.03) return 'clear';  // 上方或台面下
    if(yC > C.TABLE_TOP + C.NET_H - 0.028) return 'let';                 // 擦网带
    return 'fault';
  }

  /* 完整仿真（训练器用）：返回 {ok, reason, bouncedOpp, landing:{x,z}, netY, bounce?}
     网带用真实 checkNet 语义（rng 决定擦网 let/下网）；bounce=首跳后状态 */
  function simulateFull(from, vel, hitter, spin, rng){
    const p = vcopy(from), v = vcopy(vel);
    let sx = spin ? spin.x : 0, sy = spin ? spin.y : 0;      // let：飞行中旋转衰减要就地乘减
    const dt = SDT; let crossed = false, netY = -1, netX = 0;
    const rand = rng || Math.random;
    for(let i = 0; i < 360; i++){
      const py = p.y, pz = p.z, px = p.x;
      v.y -= C.G * dt;
      const drag = 1 - C.AIR * dt; v.x *= drag; v.y *= drag; v.z *= drag;
      // 完整叉积（实机 physicsStep 是 s.cross(v)）+ 飞行中旋转衰减
      v.x += (sy * v.z) * C.MAGNUS * dt;
      v.y += (-sx * v.z) * C.MAGNUS * dt;
      v.z += (sx * v.y - sy * v.x) * C.MAGNUS * dt;
      const sd = Math.max(0, 1 - 0.05 * dt); sx *= sd; sy *= sd;
      p.x += v.x * dt; p.y += v.y * dt; p.z += v.z * dt;
      if(!crossed && ((pz < 0 && p.z >= 0) || (pz > 0 && p.z <= 0))){
        const t = (0 - pz) / (p.z - pz || 1e-9);
        netY = py + (p.y - py) * t; netX = px + (p.x - px) * t;
        const hit = netHit(netY, netX);
        if(hit === 'fault' || (hit === 'let' && rand() < 0.45)) return { ok:false, reason:'net', netY, netX };
        crossed = true;
      }
      if(v.y < 0 && p.y - C.BALL_R <= C.TABLE_TOP && Math.abs(p.x) <= C.TABLE_W / 2 && Math.abs(p.z) <= C.TABLE_L / 2){
        // 记录弹跳后状态（与 tableBounce 相同的变换）
        const bpos = { x: p.x, y: C.TABLE_TOP + C.BALL_R, z: p.z };
        const bv = { x: v.x, y: -v.y * C.REST, z: v.z * 0.99 + sx * C.SPIN_KICK, };
        bv.x = bv.x * 0.985 - sy * C.SPIN_KICK * 0.6;
        const bs = { x: sx * 0.72, y: sy * 0.72, z: 0 };
        return { ok:true, bouncedOpp: hitter === 'player' ? p.z < 0 : p.z > 0, landing: { x: p.x, y: 0, z: p.z }, netY, netX,
                 bounce: { pos: bpos, vel: bv, spin: bs } };
      }
      if(p.y <= C.BALL_R || Math.abs(p.z) > 4.5 || Math.abs(p.x) > 3){
        return { ok:false, reason: (Math.abs(p.z) > 4.5 || Math.abs(p.x) > 3) ? 'out' : 'floor', landing: { x: p.x, y: 0, z: p.z }, netY };
      }
    }
    return { ok:false, reason:'timeout', netY };
  }

  /* 发球（两跳）仿真：首跳须在发球方自己半台 → 弹起过网 → 二跳在对方半台（ITTF）
     返回 { ok:true, pos, vel, spin }（二跳后状态，供接发方回球）；
     或 { ok:false, reason }（'own-first' 未先落己方 / 'net' 撞网 / 'out' 出界 / 'own-second' 二跳落回己方）
     from = 发球点击球点，vel = 出射速度（serveShot 输出） */
  function simulateServeFull(from, vel, spin, server, rng){
    const ownSign = server === 'player' ? 1 : -1;      // 发球方半台：player=+Z / ai=-Z
    const p = vcopy(from), v = vcopy(vel);
    const s = { x: spin ? spin.x : 0, y: spin ? spin.y : 0, z: 0 };
    const R = C.BALL_R;
    const dt = SDT;
    const netTop = netHitTop();
    let bounced = 0;                       // 已弹跳次数
    const rand = rng || Math.random;
    for(let i = 0; i < 840; i++){
      const py = p.y, pz = p.z;
      v.y -= C.G * dt;
      const drag = 1 - C.AIR * dt; v.x *= drag; v.y *= drag; v.z *= drag;
      // 完整叉积 + 飞行中旋转衰减（与实机 physicsStep 一致）
      v.x += (s.y * v.z) * C.MAGNUS * dt;
      v.y += (-s.x * v.z) * C.MAGNUS * dt;
      v.z += (s.x * v.y - s.y * v.x) * C.MAGNUS * dt;
      const sd = Math.max(0, 1 - 0.05 * dt); s.x *= sd; s.y *= sd;
      p.x += v.x * dt; p.y += v.y * dt; p.z += v.z * dt;
      // 过网校验：反弹后穿越网平面
      if(bounced >= 1 && ((pz < 0 && p.z >= 0) || (pz > 0 && p.z <= 0))){
        const t = (0 - pz) / ((p.z - pz) || 1e-9);
        const yC = py + (p.y - py) * t;
        if(yC < netTop){
          // 擦网判定：贴近网顶则随机 LET，否则下网
          const near = Math.abs(yC - netTop) < 0.03;
          if(near && rand() < 0.55) continue;    // 擦网重发（LET）——此处直接视为重发信号，调用方决定
          return { ok:false, reason:'net' };
        }
      }
      // 台面触碰
      if(v.y <= 0 && p.y - R <= C.TABLE_TOP && Math.abs(p.x) <= C.TABLE_W / 2 && Math.abs(p.z) <= C.TABLE_L / 2){
        const zSide = p.z > 0 ? 1 : -1;
        if(bounced === 0){
          if(zSide !== ownSign) return { ok:false, reason:'own-first' };   // 首跳落在对方半台
          bounced = 1;
        }else if(bounced === 1){
          if(zSide === ownSign) return { ok:false, reason:'own-second' };  // 二跳落回己方
          bounced = 2;                                                       // 二跳对方半台 → 合法发球完成
        } else {
          return { ok:false, reason:'out' };
        }
        p.y = C.TABLE_TOP + R;
        tableBounce(v, s);
        if(bounced === 2) return { ok:true, pos: vcopy(p), vel: vcopy(v), spin: vcopy(s) };
        continue;
      }
      if(p.y <= R || Math.abs(p.z) > 4.5 || Math.abs(p.x) > 3) return { ok:false, reason:'out' };
    }
    return { ok:false, reason:'timeout' };
  }

  /* 台面弹跳变换（原地修改 v / s；移植 physics.js#tableBounce 无特效部分） */
  function tableBounce(v, s){
    v.y = -v.y * C.REST;
    v.z = v.z * 0.99 + s.x * C.SPIN_KICK;
    v.x = v.x * 0.985 - s.y * C.SPIN_KICK * 0.6;
    s.x *= 0.72; s.y *= 0.72; s.z *= 0.72;
  }

  /* 预测球在 zPlane 处的横向位置（移植 ai.js#predictXAtZ） */
  function predictXAtZ(from, vel, spin, zPlane){
    const p = vcopy(from), v = vcopy(vel), s = vcopy(spin || v(0, 0, 0));
    const dt = SDT;
    for(let i = 0; i < 400; i++){
      v.y -= C.G * dt;
      const drag = 1 - C.AIR * dt; v.x *= drag; v.y *= drag; v.z *= drag;
      const tx = s.y * v.z - s.z * v.y, ty = s.z * v.x - s.x * v.z, tz = s.x * v.y - s.y * v.x;
      v.x += tx * C.MAGNUS * dt; v.y += ty * C.MAGNUS * dt; v.z += tz * C.MAGNUS * dt;
      // 飞行中旋转衰减（= 实机 physicsStep 的 s.multiplyScalar(1-0.05*dt)）
      const sd = Math.max(0, 1 - 0.05 * dt); s.x *= sd; s.y *= sd; s.z *= sd;
      p.x += v.x * dt; p.y += v.y * dt; p.z += v.z * dt;
      if(v.y < 0 && p.y - C.BALL_R <= C.TABLE_TOP && Math.abs(p.x) <= C.TABLE_W / 2 && Math.abs(p.z) <= C.TABLE_L / 2){
        p.y = C.TABLE_TOP + C.BALL_R; v.y = -v.y * C.REST; v.z += s.x * C.SPIN_KICK;
        s.x *= 0.72; s.y *= 0.72; s.z *= 0.72;
      }
      if((v.z < 0 && p.z <= zPlane) || (v.z > 0 && p.z >= zPlane)) return clamp(p.x, -1.3, 1.3);
      if(p.y < 0.1) return clamp(p.x, -1.3, 1.3);
    }
    return clamp(p.x, -1.3, 1.3);
  }

  /* 预测落点（移植 ai.js#predictLanding，返回 {x,z} 或 null） */
  function predictLanding(from, vel, spin){
    const p = vcopy(from), v = vcopy(vel), s = vcopy(spin || v(0, 0, 0));
    const dt = SDT;
    for(let i = 0; i < 300; i++){
      v.y -= C.G * dt;
      const drag = 1 - C.AIR * dt; v.x *= drag; v.y *= drag; v.z *= drag;
      const tx = s.y * v.z - s.z * v.y, ty = s.z * v.x - s.x * v.z, tz = s.x * v.y - s.y * v.x;
      v.x += tx * C.MAGNUS * dt; v.y += ty * C.MAGNUS * dt; v.z += tz * C.MAGNUS * dt;
      // 飞行中旋转衰减（= 实机 physicsStep 的 s.multiplyScalar(1-0.05*dt)）
      const sd = Math.max(0, 1 - 0.05 * dt); s.x *= sd; s.y *= sd; s.z *= sd;
      p.x += v.x * dt; p.y += v.y * dt; p.z += v.z * dt;
      if(v.y < 0 && p.y - C.BALL_R <= C.TABLE_TOP && Math.abs(p.x) <= C.TABLE_W / 2 && Math.abs(p.z) <= C.TABLE_L / 2){
        return { x: p.x, z: p.z };
      }
      if(p.y < 0.2) return null;
    }
    return null;
  }

  /* 预测球在接收方半区弹起后、升/降到 yPlane 高度的位置（球拍前后移动跟踪用）
     side='player'(z>0) / 'ai'(z<0)；返回 {z, x, t, state} 或 null（从未到该高度） */
  function predictZAtY(from, vel, spin, yPlane, side){
    const p = vcopy(from), v = vcopy(vel), s = vcopy(spin || v(0, 0, 0));
    const dt = SDT; let t = 0, bounced = false;
    const posSign = (side === 'player') ? 1 : -1;
    for(let i = 0; i < 800; i++){
      const px = p.x, py = p.y, pz = p.z;
      v.y -= C.G * dt;
      const drag = 1 - C.AIR * dt; v.x *= drag; v.y *= drag; v.z *= drag;
      const tx = s.y * v.z - s.z * v.y, ty = s.z * v.x - s.x * v.z, tz = s.x * v.y - s.y * v.x;
      v.x += tx * C.MAGNUS * dt; v.y += ty * C.MAGNUS * dt; v.z += tz * C.MAGNUS * dt;
      // 飞行中旋转衰减（= 实机 physicsStep 的 s.multiplyScalar(1-0.05*dt)）
      const sd = Math.max(0, 1 - 0.05 * dt); s.x *= sd; s.y *= sd; s.z *= sd;
      p.x += v.x * dt; p.y += v.y * dt; p.z += v.z * dt;
      if(v.y < 0 && p.y - C.BALL_R <= C.TABLE_TOP && Math.abs(p.x) <= C.TABLE_W / 2 && Math.abs(p.z) <= C.TABLE_L / 2){
        p.y = C.TABLE_TOP + C.BALL_R; v.y = -v.y * C.REST; v.z = v.z * 0.99 + s.x * C.SPIN_KICK;
        v.x = v.x * 0.985 - s.y * C.SPIN_KICK * 0.6; s.x *= 0.72; s.y *= 0.72; s.z *= 0.72;
        if(posSign * p.z > 0) bounced = true;
      }
      if(bounced && ((py <= yPlane && p.y >= yPlane) || (py >= yPlane && p.y <= yPlane))){
        const f = (yPlane - py) / (p.y - py || 1e-9);
        const x = px + (p.x - px) * f, z = pz + (p.z - pz) * f;
        return { z, x, t: t + dt * f, state: { pos: { x, y: yPlane, z }, vel: { x: v.x, y: v.y, z: v.z }, spin: { x: s.x, y: s.y, z: s.z } } };
      }
      t += dt;
      if(p.y < 0.05 || Math.abs(p.z) > 4.5) return null;
    }
    return null;
  }

  /* 预测球在接收方半区弹起后、位于球拍可击窗口（高度[yLo,yHi] ∩ z范围[zLo,zHi]）内的最早位置
     用于模拟器"够到球"判定（对应实机 tryAIHit 的拍高窗口 PADDLE_Y±0.235） */
  function predictMeetZ(from, vel, spin, side, yLo, yHi, zLo, zHi){
    const p = vcopy(from), v = vcopy(vel), s = vcopy(spin || v(0, 0, 0));
    const dt = SDT; let t = 0, bounced = false;
    const posSign = (side === 'player') ? 1 : -1;
    for(let i = 0; i < 800; i++){
      v.y -= C.G * dt;
      const drag = 1 - C.AIR * dt; v.x *= drag; v.y *= drag; v.z *= drag;
      const tx = s.y * v.z - s.z * v.y, ty = s.z * v.x - s.x * v.z, tz = s.x * v.y - s.y * v.x;
      v.x += tx * C.MAGNUS * dt; v.y += ty * C.MAGNUS * dt; v.z += tz * C.MAGNUS * dt;
      // 飞行中旋转衰减（= 实机 physicsStep 的 s.multiplyScalar(1-0.05*dt)）
      const sd = Math.max(0, 1 - 0.05 * dt); s.x *= sd; s.y *= sd; s.z *= sd;
      p.x += v.x * dt; p.y += v.y * dt; p.z += v.z * dt;
      if(v.y < 0 && p.y - C.BALL_R <= C.TABLE_TOP && Math.abs(p.x) <= C.TABLE_W / 2 && Math.abs(p.z) <= C.TABLE_L / 2){
        p.y = C.TABLE_TOP + C.BALL_R; v.y = -v.y * C.REST; v.z = v.z * 0.99 + s.x * C.SPIN_KICK;
        v.x = v.x * 0.985 - s.y * C.SPIN_KICK * 0.6; s.x *= 0.72; s.y *= 0.72; s.z *= 0.72;
        if(posSign * p.z > 0) bounced = true;
      }
      if(bounced && p.y >= yLo && p.y <= yHi && p.z >= zLo && p.z <= zHi){
        return { z: p.z, x: p.x, y: p.y, t: t + dt,
                 state:{ pos:{ x: p.x, y: p.y, z: p.z }, vel:{ x: v.x, y: v.y, z: v.z }, spin:{ x: s.x, y: s.y, z: s.z } } };
      }
      t += dt;
      if(p.y < 0.05 || Math.abs(p.z) > 4.5) return null;
    }
    return null;
  }

  /* ── 发球专用：两跳解算（ITTF：先落自己半台 → 弹起过网 → 落对方半台）──
   * from = 发球点击球点（端线后、拍高附近）
   * opts = { dir: 回球方向（player 向 -Z → -1；AI 向 +Z → +1）
   *          own: 自己想落点屏距（弹起点离网的距离，自己半台）
   *          opp: 对方想落点屏距（离网距离，对方半台）
   *          speed: 出射水平速度(幅值)  spinX: 出球相对旋(顶/底)  sideY: 侧旋
   *          rng? }
   * 返回 { vel, spin } 或 null（无合法两跳解）。
   * 算法：固定水平速度 vz，（用“恰好落在网高上方”约束反推测网时的竖直速度），
   *       数值搜索 vy 使第 1 跳落在自己半台 own、弹起(REST)后第 2 跳落在对方半台 opp 且过网合法。
   */
  /* ── 发球专用：两跳（ITTF：先落己方半台 → 弹起过网 → 落对方半台）──
   * 在可达发球脊上扫描 (vz,vy)，找合法两跳里"第一跳尽量靠己方底线(z1大) + 弹起尽量低(不高)"的解，
   * 同时保证第二跳落在对方半台（z2 深度接近目标 depth，弱约束）。
   * opts: { dir, depth(对方落点离网目标 0.15..0.95), spinX(相对旋), sideY, lowBias(0..1 低平偏好) }
   * 返回 { vel, spin, zOwn, zOpp, peakRel, depth }；无解返回 null（调用方回退一跳发球）。
   * 机制：z1 大(第一跳靠后/贴发球点) + vz 大 vy 适中(vy≈2.2) → 弹起低平过网(peakRel≈0.35)。
   *       真实发球第一跳应在靠近己方底线处，而非贴网高弹。
   */
  function serveShot(from, opts){
    const dir = (opts && opts.dir) || -1;
    const srvSign = -dir;                      // 己方半台符号（player +Z → +1）
    const spinByte = ((opts && opts.spinX) || 0) * dir;
    const sideY = (opts && opts.sideY) || 0;
    const depth = clamp((opts && opts.depth) || 0.5, 0.15, 0.95);
    const lowBias = clamp((opts && opts.lowBias) || 0.85, 0, 1);   // 低平偏好（深发球 + 过网不高）
    // speedMul：发球出球速度倍率（策略 servePace；1=原解算域零回归）。上下限同缩，
    // 更快的发球若两跳不合法会被评分淘汰/返回 null（调用方有回退链兜底）。
    const sm = clamp((opts && opts.speedMul) || 1, 0.8, 1.35);
    const R = C.BALL_R;
    const p = vcopy(from), s = v(0, 0, 0);
    // 用 1/120 解算：实机 main.js 对每帧按 ceil(dt/(1/120))=2 子步积分 physicsStep，
    // 若解算器仍按 1/60 建模，它找到的速度在实际积分下会偏移——实测实机发球失误率
    // 因此偏高（一次 11 分对局里 4 分以"发球出界"结算）。这里与实机同一分辨率，
    // 解出的轨迹在实机里才真的是两跳合法。
    const dt = SDT;
    const netTop = netHitTop();
    // 己方半台参考长度（决定 z1 目标：尽量靠近端线）
    const ownHalf = C.TABLE_L / 2;             // 1.37
    let best = null, bestScore = 1e9;
    for(let vzMag = 1.2 * sm; vzMag <= Math.min(4.4 * sm, 5.6); vzMag += 0.06){
      for(let vy = 0.6; vy <= 6.2; vy += 0.08){
        p.x = from.x; p.y = from.y; p.z = from.z;
        s.x = spinByte; s.y = sideY; s.z = 0;
        // 出球点可能不在台面中线（球员从半场任意位置发球）：给 vx 让球朝台面中心回落，
        // 否则 vx=0 的直线轨迹在 |from.x|>半台宽时会飞出边线 → 无解（曾导致 strikeServe 空指针崩溃）
        const tN0 = Math.max(0.1, Math.abs(from.z) / vzMag);   // 到网平面时间近似
        const vx = from.x ? clamp(-from.x / tN0, -2.5, 2.5) : 0;
        const vel = v(vx, vy, dir * vzMag);
        let z1 = 0, z2 = 0, bounced = false, netClear = true, ok = false, peakRel = 0, netY = -1;
        for(let i = 0; i < 1200; i++){
          const py = p.y, pz = p.z;
          vel.y -= C.G * dt;
          const drag = 1 - C.AIR * dt; vel.x *= drag; vel.y *= drag; vel.z *= drag;
          // 完整叉积 + 飞行中旋转衰减（此前两者都缺，导致解算轨迹与实机积分不一致）
          vel.x += (s.y * vel.z) * C.MAGNUS * dt; vel.y += (-s.x * vel.z) * C.MAGNUS * dt;
          vel.z += (s.x * vel.y - s.y * vel.x) * C.MAGNUS * dt;
          const sd = Math.max(0, 1 - 0.05 * dt); s.x *= sd; s.y *= sd;
          p.x += vel.x * dt; p.y += vel.y * dt; p.z += vel.z * dt;
          const rel = p.y - C.TABLE_TOP; if(rel > peakRel) peakRel = rel;
          // 过网检测：仅弹起后（bounced）穿越网平面才算，须净高；同时记录过网高度（要求低平）
          if(bounced && ((pz < 0 && p.z >= 0) || (pz > 0 && p.z <= 0))){
            const t = (0 - pz) / ((p.z - pz) || 1e-9);
            const yC = py + (p.y - py) * t;
            netY = yC;
            if(yC < netTop) netClear = false;
          }
          if(vel.y <= 0 && p.y - R <= C.TABLE_TOP && Math.abs(p.x) <= C.TABLE_W / 2 && Math.abs(p.z) <= C.TABLE_L / 2){
            if(!bounced){ z1 = p.z; p.y = C.TABLE_TOP + R; tableBounce(vel, s); bounced = true; continue; }
            else { z2 = p.z; ok = true; break; }
          }
          if(p.y < R || Math.abs(p.z) > 3 || Math.abs(p.x) > 2) break;
        }
        // 二跳落点要求深入对方半台 SERV_EMBED：只判"在对方半台"会让二跳紧贴网线的解
        // 通过，而解算模型与实机 physicsStep 有微小积分差异（旋转衰减顺序、磁吸），
        // 那种解在实机里就会变成"两跳都在自己半台"的发球失误（实测约 1/6 的发球）。
        if(ok && netClear && srvSign * z1 > 0 && srvSign * z2 < -SERV_EMBED && netY >= 0){
          const z1Abs = Math.abs(z1);
          const z2Diff = Math.abs(Math.abs(z2) - depth);
          // 评分：z2 达标(主) + z1 靠底线 + 弹起越低越好 + 过网越低越好（netY 超出网顶的余量）
          const z1Score = (ownHalf - z1Abs) / ownHalf;          // 0..1，越大 z1 越靠前
          const peakScore = clamp(peakRel - 0.45, 0, 2);        // 超过 0.45m 弹起的部分
          const netHigh = clamp(netY - netTop - 0.06, 0, 1);    // 过网净空超过 6cm 的部分
          const score = z2Diff * 1.0 + z1Score * 0.35 * lowBias + peakScore * 0.45 * lowBias + netHigh * 0.9 * lowBias;
          if(score < bestScore){ bestScore = score; best = { vx, vy, vzMag, z1, z2, peakRel, netY }; }
        }
      }
    }
    if(!best) return null;
    return {
      vel: v(best.vx, best.vy, dir * best.vzMag),
      spin: v(spinByte, sideY, 0),
      zOwn: +best.z1.toFixed(3),
      zOpp: +best.z2.toFixed(3),
      peakRel: +best.peakRel.toFixed(2),
      netRel: +(best.netY - C.TABLE_TOP).toFixed(2),
      depth: Math.abs(best.z2),
    };
  }

  /* 制造撞网轨迹：从 from 以 vz 出发，在 z=0 处高度≈yC（移植 physics.js#makeNetShot） */
  function makeNetShot(from, vz, yC){
    const tN = (0 - from.z) / vz;
    const vy = (yC - from.y) / tN + 0.5 * C.G * tN;
    const vx = -from.x / tN;
    return v(vx, vy, vz);
  }

  /* ---- 共享出球辅助（玩家与 AI 共用，名称避开浏览器全局 clamp 冲突，用 cclamp）---- */
  const cclamp = clamp;
  /* 相对上旋（方向无关）：正=上旋 / 负=下旋（sign(vz||1) 兼容方向） */
  function relTopOf(spinX, vz){ return spinX * Math.sign(vz || 1); }
  /* 高斯噪声（与 state.js#gauss 同分布） */
  function gaussOf(rng){ rng = rng || Math.random; return (rng() + rng() + rng() - 1.5) * 0.8; }
  /* 前冲力度 → 出球质量（移植 physics.js#strokePower，玩家与 AI 共用） */
  function strokePowerOf(fwd){
    return { speed: 0.75 + 0.4 * fwd, spin: 0.6 + 0.55 * fwd, eat: (1 - fwd) * 0.35 };
  }

  /* ★★★ 共享出球核心：玩家 hitPlayer 与 AI（自动玩家）调用同一个函数 ★★★
   * 输入 a（纯动作向量）：
   *   stroke    'forehand' | 'backhand'
   *   pos/vel/spin 来球状态 {x,y,z}
   *   swipe     横向滑拍速度（玩家=playerPad.svx；AI=其拍面移动的等效 svx）
   *   fwd       前冲力度 0..1（玩家=clamp(-svz/7)；AI 由策略）
   *   mouseNy   弧线/深度输入 0..1（0=上/压深 · 1=下/摆短）
   *   aim       {x,z} 瞄准目标（玩家=computeAim；AI 由落点策略）
   *   ctrlHold  是否主动搓球（下旋来球时）
   *   dir       1=向 +Z 回球（AI 侧） · -1=向 -Z 回球（玩家侧/watch 左 AI）
   *   applyArcAdj  是否应用鼠标弧线控制（玩家 play=true；AI 由策略）
   * 返回：{ outVel:{x,y,z}, spin:{x,y}, netOut, mode,
   *         pace, arc, topMag, side, relOut, ax, aimZ, power, recover, swingType }
   * 注意：此函数无 DOM/音效/HUD 副作用，纯物理 —— 玩家与 AI 保证 100% 对称。
   */
  function resolveHit(a){
    const rng = a.rng || Math.random;
    const st = C.STROKE[a.stroke];
    const gx = a.aim.gx != null ? a.aim.gx : a.pos.x;      // 击球时刻拍面 x（缺少时用球位）
    const offX = cclamp((a.pos.x - gx) / C.PAD_HW, -1, 1);
    const inSpd = Math.abs(a.vel.z);
    const swipe = a.swipe || 0;
    const inSpinX = a.spin.x, inSpinY = a.spin.y;
    const inVx = a.vel.x, inVy = a.vel.y, inVz = a.vel.z;
    const inTop = Math.abs(a.spin.x);
    const rtop = relTopOf(a.spin.x, a.vel.z);
    const isBack = rtop < -8;
    const inBack = isBack ? -rtop : 0;
    const fwd = (a.fwd == null) ? 0.75 : cclamp(a.fwd, 0, 1);
    const spw = strokePowerOf(fwd);
    const sAbs = Math.abs(swipe);
    const swingQ = Math.min(1, Math.sqrt(sAbs * 0.8 / 5.6));
    const qMult = 1 + swingQ;
    const sideIn = swipe * 0.2;
    const isCounter = !isBack && a.stroke === 'backhand' && inTop > C.COUNTER.spinThresh;
    const isHigh = a.pos.y > C.TABLE_TOP + 0.13;                    // 半高球阈值（与玩家一致）
    const isSmash = !isBack && isHigh && sAbs > 1.5;
    const isLoop = !isBack && !isSmash && a.stroke === 'forehand' && sAbs > 1.1 && fwd > 0.35;
    const isPush = isBack && a.ctrlHold;
    const stroke = isPush ? ((a.pos.x >= gx) ? 'backhand' : 'forehand') : a.stroke;
    const stk = C.STROKE[stroke];
    const outDir = (a.dir == null) ? -1 : a.dir;

    // 鼠标弧线控制 + 来球高度拟合（与玩家一致）
    const arcMouse = -0.28 + (0.30 - (-0.28)) * (a.mouseNy != null ? cclamp(a.mouseNy, 0, 1) : 0.5);
    const arcFit = cclamp((C.TABLE_TOP + 0.18 - a.pos.y) * 0.7, -0.22, 0.28);
    const arcAdj = cclamp(arcMouse + arcFit, -0.35, 0.35);

    let arc, pace, topMag, side, relOut, netRisk = 0;
    // 出球质量倍率（AI 策略 q 注入；玩家/未注入 → 全 1.0 零回归）
    const Q = a.q || { loopPace:1, loopSpin:1, loopArc:1, smashPace:1, smashSpin:1, liftPace:1, defPace:1, counterPace:1 };
    // 深度绝对值（方向无关）：aim.z 传带符号目标深度（玩家 -Z 负 / AI +Z 正），内部取绝对值
    const depthZ = Math.abs(a.aim.z == null ? 0.9 : a.aim.z);
    if(isPush){
      arc = C.PUSH.arc + C.PUSH.arcSafe;
      const depthT = cclamp((depthZ - 0.5) / (1.24 - 0.5), 0, 1);   // 深度 0.5..1.24（AIM.zShort/zDeep 绝对值）
      const depthP = cclamp(depthT + C.PUSH.deep, 0, 1);
      pace = cclamp((C.PUSH.paceShort + (C.PUSH.paceDeep - C.PUSH.paceShort) * depthP) + sAbs * C.PUSH.paceSwipe, C.PUSH.paceShort, C.PUSH.paceMax + C.PUSH.deepPace);
      side = cclamp(-swipe * 10, -C.PUSH.sideCap, C.PUSH.sideCap);
      relOut = -C.PUSH.back;
      topMag = 0;
    }else if(isBack){
      arc = stk.arc + C.LIFT.arcAdd;
      pace = cclamp((stk.paceBase + inSpd * 0.25) * C.LIFT.paceMult * qMult * Q.liftPace, 2.4, stk.paceMax * Q.liftPace);
      side = cclamp(-sideIn * stk.sideGen, -C.SPIN.sideCap, C.SPIN.sideCap);
      topMag = cclamp((26 + inSpd * 5) * stk.spinGen * qMult, 0, stk.spinCap) + inBack * 0.35;
      relOut = topMag;
      netRisk = cclamp(inBack * C.LIFT.netRate + (sAbs > 2.6 ? C.LIFT.rush : 0), 0, 0.35);
    }else{
      arc = isSmash ? 0.55 : (isLoop ? 1.35 * Q.loopArc : (isCounter ? C.COUNTER.arc : stk.arc));
      pace = (stk.paceBase + inSpd * 0.3 + fwd * 1.6) * qMult;
      if(isCounter) pace = Math.max(pace, C.COUNTER.paceFloor + inTop * C.COUNTER.pacePerSpin);
      if(isSmash) pace = Math.max(pace, 6.8);
      // 出球速度倍率：快攻=smashPace · 拉冲=loopPace · 快撕=counterPace · 挡球/相持=defPace（封顶同步放宽）
      const paceMul = isSmash ? Q.smashPace : (isLoop ? Q.loopPace : (isCounter ? Q.counterPace : Q.defPace));
      pace = cclamp(pace * spw.speed * paceMul, 2.4,
                    (isSmash ? 8.2 : (isLoop ? 7.0 : (isCounter ? C.COUNTER.paceMax : stk.paceMax))) * paceMul);
      side = cclamp(-sideIn * stk.sideGen, -C.SPIN.sideCap, C.SPIN.sideCap);
      if(isCounter) side *= 0.7;
      const sideFrac = Math.abs(side) / C.SPIN.sideCap;
      topMag = cclamp((26 + inSpd * 5) * stk.spinGen * qMult, 0, stk.spinCap);
      topMag *= spw.spin;
      topMag *= (1 - sideFrac * 0.65);
      if(isCounter) topMag = cclamp(topMag * 0.35 + inTop * C.COUNTER.spinBorrow * 0.45, 0, 70);
      else if(isSmash) topMag = cclamp(topMag * 0.55 * Q.smashSpin, 0, 110);
      else if(isLoop) topMag *= 1.45 * Q.loopSpin;
      relOut = topMag;
    }
    if(a.applyArcAdj && !isPush && !isSmash && !isCounter) arc = cclamp(arc + arcAdj, 0.45, 1.7);
    const ax = cclamp(a.aim.x, -stk.aimXMax, stk.aimXMax);
    const axPush = isPush ? ax * (C.PUSH.xRange != null ? C.PUSH.xRange : 1) : ax;
    const aimZ = isPush ? cclamp(depthZ - 0.2, 0.72, 1.25)
               : (isCounter ? Math.min(depthZ, 1.2) : depthZ);
    // 落点：x 为全局坐标（不随侧取反）；z 落在对方半台（玩家向 -Z → 负，AI 向 +Z → 正）
    const tx = axPush;
    const tz = outDir === -1 ? -aimZ : aimZ;
    const intent = solveShot(a.pos, { x: tx, y: C.TABLE_TOP + 0.05, z: tz }, pace, arc, relOut, isPush ? C.PUSH.net : undefined);
    // 出球 z 方向：玩家向 -Z（负）、AI 向 +Z（正）——vz = outDir × 速度幅值
    let vz = outDir * (1.5 + pace * 0.62 + rng() * 0.18); vz = clamp(vz, -6.8, 6.8);
    let vx = cclamp(a.vel.x * 0.22 + sideIn * 0.5 + offX * 1.2, -4.4, 4.4);
    let vy = (0.75 + rng() * 0.2 + Math.max(0, C.TABLE_TOP + 0.12 - a.pos.y) * 1.1) * arc;
    let hv = v(vx, vy, vz);
    const blendC = isCounter ? 0.92 : (isPush ? C.PUSH.control : (isSmash ? 0.7 : (isLoop ? 0.5 : stk.control)));
    // 与玩家一致：hv 向 intent 线性插值（blendC = 玩家对 intent 的保留比例）
    hv.x += (intent.x - hv.x) * blendC;
    hv.y += (intent.y - hv.y) * blendC;
    hv.z += (intent.z - hv.z) * blendC;
    const eatK = isPush ? 0 : spw.eat;
    const fx = relOut * outDir + inSpinX * eatK;
    const fy = side + inSpinY * eatK * 0.5;
    const netOut = netRisk > 0 && rng() < netRisk;
    if(netOut){
      // ★ 撞网轨迹平直无旋（makeNetShot 返回 {x,y,z}；AI 向 +Z 用 dir 取反 vz）
      const ns = makeNetShot(a.pos, outDir * Math.max(2.2, pace * 0.6), C.TABLE_TOP + C.NET_H * 0.72);
      hv = v(ns.x, ns.y, ns.z);
    }else if(!simulateShot(a.pos, hv, outDir === -1 ? 'player' : 'ai', { x: fx, y: fy, z: 0 })){
      hv = v(intent.x, intent.y, intent.z);
    }
    if(isBack && !isPush) hv.y = Math.min(hv.y, 3.6);

    return {
      outVel: hv,
      spin: { x: netOut ? 0 : fx, y: netOut ? 0 : fy },
      netOut,
      mode: isPush ? 'push' : (isBack ? 'lift' : (isSmash ? 'smash' : (isCounter ? 'counter' : (isLoop ? 'loop' : 'block')))),
      pace, arc, topMag, side, relOut, ax, aimZ,
      power: isSmash ? 1.25 : (isLoop ? 1.15 : (isCounter ? 0.8 : cclamp(pace / 6.5, 0.4, 1))),
      recover: isCounter ? C.COUNTER.recover : (isPush ? C.PUSH.recover : (isSmash ? 0.45 : (isLoop ? 0.5 : stk.recover))),
      swingType: isPush ? 'push' : stroke,
      stroke,
    };
  }

  /* ★ 玩家/AI 正/反手自动选择 v2.2（单一逻辑源：实机 physics.js#autoStance、
   * ai.js#aiMoveShared、tt-player.js、训练器 input-sim.js#stanceOf 全部走这里）
   * 输入 o = {
   *   bx         决策参考点 x：来球时 = 预测击球点 x（调用方用 predictXAtZ 算好）；
   *              无来球时任意（本函数直接保持）
   *   gx, gz     拍位置
   *   cur        当前姿态 'forehand' | 'backhand'
   *   lastSwitch 上次姿态切换时刻（秒，调用方在 pad.stanceT 维护）
   *   now        当前时刻（秒）
   *   inbound    是否有来球朝本方飞（vel.z>0.15 且球活着）；false = 还原期直接保持
   *   commit     触球承诺：球到拍面 TTC < commitT 时传 true（挥拍已启动，锁姿态）——
   *              由调用方按 ttc=(拍z-球z)/球vz 计算。引拍期间不锁：翻面动画逐帧插值
   *              跟随姿态，中途改握视觉自然（v2.0 的 phase 硬锁因磁吸提前引拍把自由
   *              窗口压到≈0，切换僵死，已改）
   *   strokeSwitches 本板已切换次数（v2.2 软承诺：每次切换把滞回抬高 escStep，
   *              被骗后仍可用更强信号纠正，连切链自然指数衰减；玩家侧传 0）
   *   rng        可选随机源
   *   —— v2.2 可选情境输入（缺省 = v2.1 行为，全兼容旧调用方）——
   *   gvx        平滑拍速 x（m/s）：推算触球时刻拍位，消除"拍追球扫过分界线"的自激抖
   *   ttc        球到拍面平面预计时间（秒）；缺省/非法 → 不做外推与情境偏置
   *   ballY      来球高度（m）：半高/高球 → 正手扣杀倾向
   *   spinY      来球侧旋（rad/s）：拐球 → 附加预测不确定度（噪声）
   *   fhPref     正手偏好风格系数（缺省 1；策略可下调=均衡型选手）
   * }
   * 返回 'forehand' | 'backhand'；是否发生切换由调用方比对 cur 判定并记录 stanceT。
   *
   * 侧向信号全轨迹连续：|球-拍|>relNear 用满强度 relFar；追身区按球偏离体线的比例
   * 渐变（贴体线→0，relNear→±bodyBias），与远区同号衔接（-X 侧→正手/+X 侧→反手）。
   * v2.0 的"拍在哪半台"半台粗判在磁吸游戏里（拍总贴着球）几乎是唯一有效信号，
   * 叠加 enter=0.5 的 0.05 窄缝导致几乎不切换，已弃用。
   *
   * v2.2 三处情境化（全部连续、可叠加，无新硬边界）：
   *  ① 触球时刻几何：gxMeet = gx + clamp(gvx)×min(ttc, meetTCap)——对"触球瞬间的
   *     相对位置"决策，而不是当前瞬时值；拍子移动不再把信号扫过分界线。
   *  ② 时间偏置：fhBias×clamp(ttc/fhBiasT)×fhPref——时间充裕分界线向反手侧移
   *     （真人习惯用正手接追身球）；时间紧迫偏置消失（反手快挡中路）。
   *     高球偏置：球高于台面+highY0 起渐变 +highBias（半高球找正手扣杀）。
   *  ③ 不确定度自适应：unc=clamp(ttc/uncT)——远球噪声大、滞回大（不提前下结论），
   *     贴脸球噪声×noiseMin、滞回×enterLate（干脆）；侧旋再附加噪声。
   *  v2.1 的硬性"一板一次"承诺删除 → 递增滞回软承诺（escStep×已切次数）。 */
  function resolveStance(o){
    const S = C.STANCE;
    if(o.commit) return o.cur;                                        // 触球在即：挥拍已启动
    if(!o.inbound) return o.cur;                                      // 还原期：保持当前握法
    // ① 触球时刻几何：外推拍到触球瞬间的位置（无 ttc/gvx → 退化为当前拍位）
    const ttc = (o.ttc != null && Number.isFinite(o.ttc) && o.ttc > 0) ? o.ttc : null;
    const gxMeet = (ttc != null && o.gvx)
      ? o.gx + clamp(o.gvx, -S.meetVCap, S.meetVCap) * Math.min(ttc, S.meetTCap)
      : o.gx;
    const dist = o.bx - gxMeet;
    const rel = dist < -S.relNear ? S.relFar
              : (dist > S.relNear ? -S.relFar
              : -(dist / S.relNear) * S.bodyBias);                    // 追身区：比例渐变
    // ② 情境偏置：时间充裕→正手偏好；半高/高球→正手扣杀倾向
    let bias = 0;
    if(ttc != null) bias += S.fhBias * clamp(ttc / S.fhBiasT, 0, 1) * (o.fhPref != null ? o.fhPref : 1);
    if(o.ballY != null && o.ballY > C.TABLE_TOP + S.highY0){
      bias += S.highBias * clamp((o.ballY - C.TABLE_TOP - S.highY0) / S.highYR, 0, 1);
    }
    // ③ 不确定度：远球（预测久）+ 侧旋（拐弯）→ 噪声大；贴脸球干脆
    const unc = ttc != null ? clamp(ttc / S.uncT, 0, 1) : 0;
    // 无 ttc（旧调用方）→ 完全 v2.1 中性行为：满噪声 / 满滞回 / 无情境偏置
    const noiseEff = ttc != null
      ? S.noiseAmp * (S.noiseMin + (1 - S.noiseMin) * unc) + (o.spinY ? Math.abs(o.spinY) * S.spinNoiseK : 0)
      : S.noiseAmp;
    const rng = o.rng || Math.random;
    const score = rel + bias + (rng() - 0.5) * noiseEff;
    const want = score > 0 ? 'forehand' : 'backhand';
    if(want === o.cur) return o.cur;
    // 真滞回：远球需更高置信（unc 大）；软承诺：每已切一次门槛 +escStep（v2.1 硬性
    // 一板一次的软化——被骗后允许用更强信号纠正，连切链自然衰减）
    const enterEff = S.enter * (ttc != null ? S.enterLate + (1 - S.enterLate) * unc : 1)
                   + S.escStep * (o.strokeSwitches || 0);
    if(Math.abs(score) < enterEff) return o.cur;                      // 置信不足：保持
    if(o.now - o.lastSwitch < S.minHold && Math.abs(score) < S.urgent) return o.cur;  // 刚切换：保持
    return want;
  }

  /* 侧身正手（wrap around）概率评估 v2.2：静态抽签 → 可行性×收益（纯函数，可测）。
   * o = { ttc, dx, vz, W(=STANCE.wrap), fhPref }；任一缺失 → 0（不侧身）。
   *  可行性：need=dx/wrapSpeed 为侧身所需时间，ttc 越宽裕 pFeas 越高；
   *  软速度窗：|vz| 从 vzMax-0.9 → vzMax 平滑衰减（去掉 v2.1 硬截止）；
   *  基准 prob 以外由情境调制，上限 0.95。 */
  function wrapProb(o){
    const W = o.W || (C.STANCE && C.STANCE.wrap);
    if(!W || !W.prob || o.ttc == null || o.dx == null || o.vz == null) return 0;
    const need = o.dx / (W.wrapSpeed || 1.5);
    const pFeas = clamp((o.ttc - need) / 0.25, 0, 1);
    const av = Math.abs(o.vz), vLo = W.vzMax - 0.9;
    const pSlow = av <= vLo ? 1 : (av >= W.vzMax ? 0 : 1 - (av - vLo) / (W.vzMax - vLo));
    return clamp(W.prob * (0.35 + 0.65 * pFeas) * (0.3 + 0.7 * pSlow) * (o.fhPref != null ? o.fhPref : 1), 0, 0.95);
  }

  /* 姿态切换过渡系数（磁吸打折）：切换后 transT 秒内从 transMag 线性恢复到 1，
     模拟换握/转腰未完全到位。未切换或已过过渡期 → 1（零影响）。 */
  function stanceRampOf(lastSwitch, now){
    const S = C.STANCE;
    const t = (now - lastSwitch) / S.transT;
    if(t >= 1) return 1;
    return S.transMag + (1 - S.transMag) * Math.max(0, t);
  }

  /* 浏览器：constants.js 已加载 → 同步全局物理常量（单一物理源，防漂移） */
  if(typeof TABLE_L !== 'undefined'){
    C.TABLE_L = TABLE_L; C.TABLE_W = TABLE_W; C.TABLE_H = TABLE_H; C.TABLE_TOP = TABLE_TOP;
    C.NET_H = NET_H; C.NET_LEN = NET_LEN; C.BALL_R = BALL_R; C.G = G; C.REST = REST;
    C.AIR = AIR; C.MAGNUS = MAGNUS; C.SPIN_KICK = SPIN_KICK;
    if(typeof ASSIST !== 'undefined' && ASSIST.netMargin) C.netMargin = ASSIST.netMargin;
    // 出球常量（玩家与 AI 同一份，同步自全局）
    if(typeof PADDLE_Y !== 'undefined') C.PADDLE_Y = PADDLE_Y;
    if(typeof PAD_HW !== 'undefined'){ C.PAD_HW = PAD_HW; C.PAD_HH = PAD_HH; C.PAD_HD = PAD_HD; }
    if(typeof X_CLAMP !== 'undefined'){ C.X_CLAMP = X_CLAMP; C.PLAYER_Z = PLAYER_Z; C.AI_Z = AI_Z; }
    if(typeof DECIDE_SKIP !== 'undefined') C.DECIDE_SKIP = DECIDE_SKIP;
    if(typeof STROKE !== 'undefined') C.STROKE = STROKE;
    if(typeof PUSH !== 'undefined') C.PUSH = PUSH;
    if(typeof LIFT !== 'undefined') C.LIFT = LIFT;
    if(typeof COUNTER !== 'undefined') C.COUNTER = COUNTER;
    if(typeof SPIN !== 'undefined') C.SPIN = SPIN;
    if(typeof AIM !== 'undefined') C.AIM = AIM;
    if(typeof STANCE !== 'undefined') C.STANCE = STANCE;
    if(typeof ASSIST !== 'undefined'){ C.ASSISTG = { magnetPull: ASSIST.magnetPull, magnetRangeZ: ASSIST.magnetRangeZ }; }
  }

  const api = { C, clamp, v, vcopy, solveShot, simulateShot, simulateFull, simulateServeFull, tableBounce, predictXAtZ, predictLanding, predictZAtY, predictMeetZ, serveShot, makeNetShot,
                relTopOf, gaussOf, strokePowerOf, resolveHit, resolveStance, stanceRampOf, wrapProb };
  if(typeof module !== 'undefined' && module.exports) module.exports = api;
  return api;
})();
