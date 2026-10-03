/* =====================================================================
 *  input-sim.js — 无头"人类输入接口"竞技场（浏览器游戏 与 Node 训练器共用）
 *  · 目的：训练 AI 用"鼠标 + 键盘"的真人方式打比赛——
 *    AI 每帧只输出 鼠标X(targetX) / 鼠标Y(mouseNy) / Ctrl 三个原始输入，
 *    其余（拍面缓动 / 深度拟合 / 磁吸 / 触球容错 / 瞄准计算 / 出球核心）
 *    100% 复刻实机玩家管线（main.js.playerControl → physics.js.tryPlayerHit→hitPlayer→SIM.resolveHit）。
 *  · AI 对手侧仍用策略层（policy.js#aiDecision），与 simmatch.js 相同；
 *    仅"玩家侧"从"直接决策"降级为"靠鼠标键盘输入驱动"——这就是学习目标。
 *  · 发球/轮换/双跳/净网/11分规则与 simmatch.js 一致（ITTF）。
 *  · Node 用法：require 本文件前先 require simcore.js / policy.js
 * ===================================================================== */
'use strict';
if(typeof module !== 'undefined' && module.exports){
  const mcore = require('./simcore.js'); global.SIM = mcore; global.P = require('./policy.js');
}
/* 击球采样统计（临时诊断用）：HITDBG 对象常驻，但每记球多跑一遍 simulateFull
 * 只为统计，训练时白白多花近一半仿真开销 → 默认关，诊断脚本用 TT_HITDBG=1 打开。 */
const HITDBG = { hits: 0, nets: 0, ok: 0, svz: 0, fwd: 0 };
const HITDBG_SIM = !!(typeof process !== 'undefined' && process.env && process.env.TT_HITDBG);
const INPUTSIM = (() => {
  const C = SIM.C;
  const PLAYER_Z = C.PLAYER_Z || 1.32, AI_Z = C.AI_Z || -1.32;
  const X_CLAMP = C.X_CLAMP || 1.2;
  const PAD_HW = C.PAD_HW || 0.10, PAD_HH = C.PAD_HH || 0.115, PAD_HD = C.PAD_HD || 0.03;
  const PADDLE_Y = C.PADDLE_Y || 0.91;
  const WIN_LO = PADDLE_Y - 0.235, WIN_HI = PADDLE_Y + 0.235;
  /* z 可达范围：实机 aiMoveShared 传 -1.72/-0.92（ai.js），原评估用 -1.45
   * = 对手在评估里退不了那么远 → 纵深防守被系统性高估。 */
  const ZRANGE = { player: { lo: 0.92, hi: 1.72 }, ai: { lo: -1.72, hi: -0.92 } };
  const ASSIST = C.ASSISTG || { magnetPull: 2.4, magnetRangeZ: 0.45 };
  const DT = 1 / 60;
  // 子步数：实机 main.js 对每个 1/60 帧按 n=ceil(dt/(1/120))=2 子步积分 physicsStep。
  // 仿真旧版单步 1/60，轨迹与实机系统性偏离（同一条发球在两边落地位置不同）。
  const SUBN = 2;
  const cl   = (v, a, b) => v < a ? a : (v > b ? b : v);
  const getP = (p, path, def) => { if(!p) return def; let o = p; for(const k of path.split('.')){ if(o == null) return def; o = o[k]; } return (o === undefined) ? def : o; };
  const relTopOfSt = (sx, vz) => sx * Math.sign(vz || 1);

  /* ==== 玩家拍对象 ==== */
  /* 上一分末的球拍快照（横移/纵深/上一条输入意图）。
   * 为什么需要它：发球决策发生在 padInit 之后、padControl 之前，若 padInit 永远
   * 返回 x=0/z=PLAYER_Z，则发球观测的 (px,pz,tx,my) 每分完全相同 —— 网络看到的
   * 输入 100% 一样，argmax 必然锁死同一个动作，发球的侧旋/出球点维度永远学不出分化
   * （实测 ep1500：无论观测怎么变，side 恒为 -1）。
   * 实机不存在这个问题：setupServe 到 startToss 之间有 1~1.5s，aiMove→ttTick 每帧
   * 都在跑，拍位早就落在上一分结束的地方。继承快照就是让训练侧对齐这个实机行为。 */
  let prevPadSnap = null;
  function padInit(z){
    const p = prevPadSnap || {};
    return { x: p.x != null ? p.x : 0, z: p.z != null ? p.z : (z || PLAYER_Z),
             svx: 0, svz: 0, recover: 0, ctrl: !!p.ctrl, my: p.my != null ? p.my : 0.5,
             stance: 'forehand', stanceT: -9,   // 姿态状态跨板保持（= 实机 playerPad）
             _tx: p.tx, _my: p.my,
             _nz: { v: 0, t: -1 } };            // OU 决策噪声盒（resolveStance v2.3，原地更新）
  }
  /* 记录一分结束时的球拍快照，供下一分的 padInit 继承 */
  function snapPad(pad){
    prevPadSnap = { x: pad.x, z: pad.z, tx: pad._tx, my: pad._my, ctrl: pad.ctrl };
  }

  /* ==== 鼠标输入 → 拍面缓动（main.js#playerControl 同公式）====
   * ctx = { tx（鼠标X→拍面目标）, my（鼠标Y→深度/弧线）, ball, pos/vel/spin, ballActive }
   * svx/svz = 拍面真实速度（横滑→出球侧旋+正手爆旋 / 前冲→出球力量） */
  function padControl(pad, ctx, dt){
    /* MOUSE_PACE / MOUSE_SV_CAP 从 simcore 的 C 读（与实机 tt-player.js 同一份）。
     * 原来这里是裸数字 18 / ±7，实机那边也各写一份 —— 两边漂移就会重演
     * 「训练里学得到、实机做不到」。想调速只改 constants.js 一处。 */
    const pace = C.MOUSE_PACE != null ? C.MOUSE_PACE : 18;
    const svCap = C.MOUSE_SV_CAP != null ? C.MOUSE_SV_CAP : 7;
    const rate = pad.recover > 0 ? pace * 0.5 : pace;
    const tx = cl(ctx.tx, -X_CLAMP, X_CLAMP);
    const tz = cl(0.92 + (ctx.my != null ? ctx.my : 0.5) * 0.8, ZRANGE.player.lo, ZRANGE.player.hi);
    let effZ = tz;
    if(ctx.ball && ctx.ball.z > 0.5 && ctx.ballActive){
      const meet = SIM.predictMeetZ(ctx.pos, ctx.vel, ctx.spin, 'player',
                                    WIN_LO, WIN_HI, ZRANGE.player.lo, ZRANGE.player.hi);
      if(meet){
        const fitW = cl(0.25 + (ctx.ball.z - 1) * 0.03, 0.2, 0.5);
        effZ = cl(PLAYER_Z + (tz - PLAYER_Z) + (meet.z - PLAYER_Z) * fitW, ZRANGE.player.lo, ZRANGE.player.hi);
      }
    }
    const prevX = pad.x, prevZ = pad.z;
    pad.x += (tx - pad.x) * Math.min(1, dt * rate);
    pad.z += (effZ - pad.z) * Math.min(1, dt * rate * 0.7);
    const svx = cl((pad.x - prevX) / Math.max(dt, 1e-4), -svCap, svCap);
    const svz = cl((pad.z - prevZ) / Math.max(dt, 1e-4), -svCap, svCap);
    pad.svx += (svx - pad.svx) * Math.min(1, dt * 12);
    pad.svz += (svz - pad.svz) * Math.min(1, dt * 12);
  }

  /* 玩家侧自动正/反手（SIM.resolveStance 单一逻辑源，实机 physics.js#autoStance 同款状态机 v2.3）：
     姿态与切换时刻记录在 pad 上跨子步/跨板保持（旧版每板重置 'forehand'，与实机不一致）；
     切换时刻写 pad.stanceT 供 magnetPull 的磁吸过渡成本使用。
     bx = 整板预测击球点 x（调用方在 playerReceive 开头用 predictXAtZ 算一次）；
     commit = 触球承诺（SIM.commitTOf 分姿态×球速窗口，与实机同公式）；
     bvx = 来球横向速度（趋势预判项）；pad._nz = OU 平滑噪声盒（每板开头由 playerReceive 重启）。 */
  function stanceOf(pad, bx, now, rng, commit, bvx){
    const st = SIM.resolveStance({ bx, gx: pad.x, gz: pad.z, cur: pad.stance,
      lastSwitch: pad.stanceT, now, inbound: true, commit: !!commit, rng,
      bvx, noiseBox: pad._nz });
    if(st !== pad.stance){ pad.stance = st; pad.stanceT = now; }
    return st;
  }

  /* ==== 磁吸（physics.js#physicsStep 玩家侧，逐帧）====
     now：当前仿真时刻（秒）——姿态切换过渡成本（SIM.stanceRampOf）与实机同款 */
  function magnetPull(p, v, s, pad, stance, ctrlOn, canHit, now){
    if(!canHit || v.z <= 0) return;
    if(p.z < (stance === 'forehand' ? 0.3 : 0.45)) return;
    const stF = C.STROKE[stance];
    const pushF = (ctrlOn && relTopOfSt(s.x, v.z) < -8) ? C.PUSH.fit : null;
    const high = p.y > C.TABLE_TOP + 0.13;
    const mag = (stF.magnet + (pushF ? pushF.mag : 0) + (high ? 1.2 : 0))
              * SIM.stanceRampOf(pad.stanceT, now);
    v.x += cl(pad.x - p.x, -0.7, 0.7) * ASSIST.magnetPull * mag * DT;
    const zAhead = pad.z - p.z;
    if(zAhead > 0.05) v.z += cl(zAhead * 0.5, 0, 0.45) * ASSIST.magnetPull * mag * 0.55 * DT;
    if(high && p.y > PADDLE_Y){
      const yGap = PADDLE_Y - p.y;
      v.y += cl(yGap * 0.4, -0.35, 0) * ASSIST.magnetPull * mag * 0.4 * DT;
    }
  }
  /* 正/反手容错拟合 → 触球否（physics.js#tryPlayerHit 全公式）
     bx/by/bz = 球位 x/y/z（与实机一致的窗口判断）
     prevZ = 本帧积分前的 z（= 实机 physics.js 的 _prev.z）：
       实机 swept 要求"上一帧还在拍面前方、这一帧已越过平面"的真实穿越，
       旧实现只有 bz > plane - zF，球已经过拍面 20cm 也算触球——
       这是仿真 57% / 实机 10% 胜率差的主因（仿真几乎总是"打到"，实机常打不到）。 */
  function tryPlayerFit(bx, by, bz, prevZ, v, s, pad, stance, ctrlOn){
    const under = relTopOfSt(s.x, v.z) < -8;
    const pushSt = (under && ctrlOn) ? ((bx >= pad.x) ? 'backhand' : 'forehand') : stance;
    const st = C.STROKE[pushSt];
    const pushF = (under && ctrlOn) ? C.PUSH.fit : null;
    const high = by > C.TABLE_TOP + 0.13;
    const inQual = cl((Math.abs(v.z) * 0.06 + Math.abs(s.x) * 0.002 + Math.abs(s.y) * 0.002) - 0.15, 0, 0.35);
    const fitV = pushF ? st.forgiveV + pushF.v : (high ? st.forgiveV + 0.30 : Math.max(st.forgiveV - inQual, 0.04));
    const fitH = pushF ? st.forgiveH + pushF.h : (high ? st.forgiveH + 0.16 : Math.max(st.forgiveH - inQual * 0.5, 0.02));
    const fitZ = pushF ? st.forgiveZ + pushF.z : (high ? st.forgiveZ + 0.12 : Math.max(st.forgiveZ - inQual * 0.4, 0.02));
    const plane = pad.z - PAD_HD;
    const zF = fitZ || 0.05;
    const swept = (prevZ <= plane + zF && bz > plane - zF && v.z > 0);   // 本帧真实穿越拍面平面（= 实机 _prev.z 判据）
    const prox = Math.abs(bz - pad.z) < PAD_HD + C.BALL_R * 2 + zF && v.z > -0.3;
    if(!(swept || prox)) return null;
    if(Math.abs(bx - pad.x) > PAD_HW + C.BALL_R + fitH) return null;
    if(Math.abs(by - PADDLE_Y) > PAD_HH + C.BALL_R + fitV) return null;
    return pushSt;
  }

  /* 触球 → 出球核心（physics.js#hitPlayer → SIM.resolveHit；正反手由内部推演）
     receive = 接发球板（第一板）：无法触发爆冲（与实机 hitPlayer 同一门控） */
  function hitShot(b, v, s, pad, mouseNy, rng, receive){
    const CV = C.AIM || { xFromPos: 0.55, xFromSwipe: 0.30, zDeep: -1.24, zShort: -0.50 };
    const aimX = cl(pad.x * CV.xFromPos + pad.svx * CV.xFromSwipe, -0.9, 0.9);
    const ny = cl(mouseNy != null ? mouseNy : 0.5, 0, 1);
    const aimZ = CV.zDeep + (CV.zShort - CV.zDeep) * ny * ny;
    return SIM.resolveHit({
      stroke: 'forehand',
      pos: { x: b.x, y: b.y, z: b.z },
      vel: { x: v.x, y: v.y, z: v.z },
      spin: { x: s.x, y: s.y, z: 0 },
      swipe: pad.svx,
      fwd: cl(-pad.svz / 7, 0, 1),
      mouseNy: ny,
      aim: { x: aimX, z: aimZ, gx: pad.x },
      ctrlHold: !!pad.ctrl,
      dir: -1,
      applyArcAdj: true,
      receive: !!receive,
      rng,
    });
  }

  /* ==== 玩家引擎：逐帧模拟来球（磁吸/拟合/物理），驱动拍面，必要时触球
   * brain：{ act(obs) → {tx, my, ctrl} }；obs 观测量（供 DQN / 脚本控制）
   * brain 每 freq 帧调用一次（调用方不传时取 SIM.C.DECIDE_SKIP=1，即每帧决策 60Hz），
   * 中间复用上一个动作——既贴近真人"鼠标不是每帧抖"的习惯，也让 DQN 时间粒度更干净。
   * ⚠ freq 必须与实机 tt-player.js 的 DECIDE_SKIP 一致（同源 constants.js），否则训练/实机决策频率漂移。
   * isReceive：接发球板（第一板）标记 → 出球核心不判爆冲（= 实机 hitPlayer 的 receive 门控）。
   * 返回 { hit:true, out:{pos, vel, spin}, mode } | { hit:false, loss:'double'|'out'|'timeout' } */
  function playerReceive(from, vel, spin, pad, brain, rng, freq, isReceive){
    const p = { x: from.x, y: from.y, z: from.z };
    const v = { x: vel.x, y: vel.y, z: vel.z };
    const s = { x: spin ? spin.x : 0, y: spin ? spin.y : 0, z: 0 };
    // 每板重启 OU 决策噪声盒（不带着上一板的犹豫；now 为本板内局部时钟）
    if(pad._nz){ pad._nz.v = 0; pad._nz.t = -1; }
    // 整板预测击球点（来球起点 → 拍面 z 平面的 x）：与实机 autoStance 同为"预测决策"，
    // 且不随磁吸拉球漂移——姿态决策稳定，不会出现"磁吸改变球位→改变姿态"的反馈震荡
    let predBX = from.x;
    if(vel.z > 0.15) predBX = SIM.predictXAtZ(from, vel, spin, PLAYER_Z);
    let stance = pad.stance, bounced = false;
    let f = 0;
    const skip = freq || 1;   // 决策跳帧；playInputPoint 已按 DECIDE_SKIP 传入（60Hz）
    let cur = { tx: 0, my: 0.5, ctrl: false };
    for(let i = 0; i < 2600; i++){
      const obs = {
        x: p.x, y: p.y, z: p.z,
        vx: v.x, vy: v.y, vz: v.z,
        sx: s.x, sy: s.y,
        px: pad.x, pz: pad.z, svx: pad.svx, svz: pad.svz,
        tx: pad._tx != null ? pad._tx : 0, my: pad._my != null ? pad._my : 0.5,
        bounced: bounced ? 1 : 0,
      };
      if(brain){ if(f % skip === 0) cur = brain.act(obs); f++; }
      pad.ctrl = !!cur.ctrl;
      pad._tx = cur.tx; pad._my = cur.my;
      if(process.env.TT_DEBUG_NAN && ![p.x, p.y, p.z, v.x, v.y, v.z, s.x, s.y, pad.x, pad.z, pad.svx, pad.svz].every(Number.isFinite)){
        console.log('[TT-NaN] frame=' + i, 'p=' + JSON.stringify(p), 'v=' + JSON.stringify(v), 'pad=' + pad.x + ',' + pad.z + ',' + pad.svx + ',' + pad.svz, 'obs-y=' + obs.y,
          'cur=' + JSON.stringify(cur));
        throw new Error('nan-in-recv');
      }
      padControl(pad, { tx: cur.tx, my: cur.my, ball: v, pos: p, vel: v, spin: s, ballActive: bounced }, DT);
      const pzPrev = p.z;   // 本帧积分前的 z（= 实机 _prev.z，供 swept 穿越判据用）
      const pPrev = { x: p.x, y: p.y, z: p.z };   // 子步起点（= 实机 _prev，供撞网穿越判据用）
      // —— 物理（子步积分）——
      // 实机 main.js 按 n=ceil(dt/(1/120)) 子步调 physicsStep，即 1/60 帧内 2 个 1/120 步；
      // 旧仿真单步 1/60 积分，轨迹与实机系统性不同（发球解算器 SIM.serveShot 本身按 1/60 解，
      // 却在 1/120 子步的实机里跑，是实机发球失误率偏高的直接原因）。
      let ended = null;
      {
        const n = SUBN, h = DT / n;
        for(let k = 0; k < n; k++){
          netStep(p, v, pPrev, rng);   // 撞网判定（对齐实机 physics.js#checkNet）
          v.y -= C.G * h;
          const drag = 1 - C.AIR * h; v.x *= drag; v.y *= drag; v.z *= drag;
          const ex = s.y * v.z - s.z * v.y, ey = s.z * v.x - s.x * v.z, ez = s.x * v.y - s.y * v.x;
          v.x += ex * C.MAGNUS * h; v.y += ey * C.MAGNUS * h; v.z += ez * C.MAGNUS * h;
          // 飞行中旋转衰减（与实机 physics.js 的 s.multiplyScalar(1-0.05*dt) 对齐）——
          // 此前训练侧缺失，训练出的策略对"高旋长距离来球"的衰减行为从未见过
          const sd = Math.max(0, 1 - 0.05 * h); s.x *= sd; s.y *= sd;
          p.x += v.x * h; p.y += v.y * h; p.z += v.z * h;
          // 台面弹跳
          if(v.y < 0 && p.y - C.BALL_R <= C.TABLE_TOP
             && Math.abs(p.x) <= C.TABLE_W / 2 + C.BALL_R * 0.6
             && Math.abs(p.z) <= C.TABLE_L / 2 + C.BALL_R * 0.6){
            p.y = C.TABLE_TOP + C.BALL_R;
            v.y = -v.y * C.REST;
            v.z = v.z * 0.99 + s.x * C.SPIN_KICK;
            v.x = v.x * 0.985 - s.y * C.SPIN_KICK * 0.6;
            s.x *= 0.72; s.y *= 0.72;
            if(p.z > 0){ if(bounced){ ended = 'double'; break; } bounced = true; }
          }
          // 出界/落地
          if((p.y <= C.BALL_R && v.y < 0) || Math.abs(p.x) > 3 || p.z > 4.5 || p.z < -4.5){
            ended = bounced ? 'out-recv' : 'out'; break;
          }
          pPrev.x = p.x; pPrev.y = p.y; pPrev.z = p.z;   // 下一子步的穿越起点
        }
      }
      if(ended) return { hit:false, loss: ended };
      if(bounced && v.z > 0.02){
        // 每帧一次姿态决策（旧版磁吸/拟合各调一次且噪声重复抽签）；now=帧数×DT；
        // TTC 承诺窗口与实机 autoStance 同公式（SIM.commitTOf：分姿态 × 来球速度自适应）
        const ttc = (pad.z - p.z) / v.z;
        stance = stanceOf(pad, predBX, i * DT, rng, ttc > 0 && ttc < SIM.commitTOf(pad.stance, v.z), v.x);
        magnetPull(p, v, s, pad, stance, pad.ctrl, true, i * DT);
        const fitSt = tryPlayerFit(p.x, p.y, p.z, pzPrev, v, s, pad, stance, pad.ctrl);
        if(fitSt !== null){
          p.z = pad.z - PAD_HD - C.BALL_R;
          const d = hitShot(p, v, s, pad, pad._my != null ? pad._my : 0.5, rng, isReceive);
          if(HITDBG_SIM){
            const fs2 = SIM.simulateFull(p, d.outVel, 'player', { x: d.spin.x, y: d.spin.y, z: 0 }, rng);
            HITDBG.hits++; HITDBG.svz += pad.svz; HITDBG.fwd += (-pad.svz / 7) > 0 ? Math.min(1, -pad.svz / 7) : 0;
            HITDBG.ok += fs2.ok ? 1 : 0;
            if(!fs2.ok && fs2.reason === 'net') HITDBG.nets++;
            if(process.env.TT_DBG_HIT){ console.log('[HIT DBG] pos=(' + p.x.toFixed(2) + ',' + p.y.toFixed(2) + ',' + p.z.toFixed(2) + ')',
              'out=(' + d.outVel.x.toFixed(2) + ',' + d.outVel.y.toFixed(2) + ',' + d.outVel.z.toFixed(2) + ')',
              'inVz=' + v.z.toFixed(2), 'mode=' + d.mode, 'pace=' + d.pace.toFixed(2), 'arc=' + d.arc.toFixed(2),
              'fwd=' + (-pad.svz / 7).toFixed(2), 'svz=' + pad.svz.toFixed(2), 'mv=' + d.mouseNy,
              'netY=' + (fs2.netY != null ? fs2.netY.toFixed(3) : '-'),
              'spin=' + (d.spin ? d.spin.x.toFixed(1) + ',' + d.spin.y.toFixed(1) : '?'),
              '→ ' + (fs2.ok ? ('landed z=' + fs2.landing.z.toFixed(2) + ' x=' + fs2.landing.x.toFixed(2)) : ('FAIL:' + fs2.reason))); }
          }
          return { hit:true, out: { pos: { x: p.x, y: p.y, z: p.z }, vel: d.outVel, spin: { x: d.spin.x, y: d.spin.y, z: 0 } }, mode: d.mode };
        }
      }
    }
    return { hit:false, loss:'timeout' };
  }

  /* ==== 撞网判定（逐字对齐实机 physics.js#checkNet）====
   * 缺这段是「评估 54.5% / 实机 0 分」的最大单一原因：评估里本该下网或被网弹回的球
   * 仍会一路飞到拍面并可能被回击，等于给 agent 送了一遍它本该丢掉的球。
   * 三个条件缺一不可：跨越 z=0 平面、横向在网宽内、高度在网高范围内。
   * 两分支与实机一致：擦网顶部 55% 概率「过」（速度骤减但继续飞），45% 弹回；否则直接弹回。 */
  function netStep(p, v, prev, rng){
    const crossed = (prev.z < 0 && p.z >= 0) || (prev.z > 0 && p.z <= 0);
    if(!crossed) return;
    const t = (0 - prev.z) / (p.z - prev.z);
    const xC = prev.x + (p.x - prev.x) * t;
    const yC = prev.y + (p.y - prev.y) * t;
    const NET_LEN = C.NET_LEN || 1.83, NET_H = C.NET_H || 0.1525, R = C.BALL_R;
    if(Math.abs(xC) > NET_LEN / 2 + R) return;
    if(yC > C.TABLE_TOP + NET_H + R * 1.5 || yC < C.TABLE_TOP - 0.03) return;
    const rnd = rng || Math.random;
    const back = prev.z > 0 ? 0.035 : -0.035;
    if(yC > C.TABLE_TOP + NET_H - 0.028){
      if(rnd() < 0.55){
        // 擦网过：速度大幅衰减但方向不变，球继续飞向对方（实机 netLet 置位，LET 直接放行）
        v.z *= 0.44; v.y = Math.min(v.y, 0.25) * 0.5 + 0.1; v.x *= 0.72;
      }else{
        p.z = back; v.z *= -0.16; v.y *= 0.35; v.x *= 0.6;
      }
    }else{
      p.z = back; v.z *= -0.13; v.y *= 0.42; v.x *= 0.55;
    }
  }

  /* ==== 发球：下旋已取消（恒定上旋），侧旋/力度/出球点由 DQN 决定 ====
   * 2026-10-02 之前这里是全写死的常量（power 恒 0.5、sideY 恒 0、落点恒 0.62 深），
   * 调用点也不传 opt —— DQN 从没学过控制自己的发球，每分都是同一个球，
   * 而实机侧走 aiServePlan 有 60% 侧旋，训练/实机发球口径不一致。
   * 现在 serveSide / servePower 来自 DQN 动作的第五、六维（见 input-agent decodeAction）。 */
  function serveFromPlayer(pad, rng, opt){
    opt = opt || {};
    const power = cl(opt.power != null ? opt.power : 0.6, 0, 1);
    const top = opt.top !== false;                    // true=上旋 / false=下旋
    const magR = 22 + rng() * 10;
    /* 下旋强度对齐实机 rules.js#strikeServe 的 topSign：topSpin===false 时取 -0.6
       （上旋的 60%）。训练/实机同口径，否则 DQN 学到的发球在实机复现不出来。 */
    const topSign = top ? 1 : -0.6;
    const spinX = magR * (0.6 + 0.8 * power) * topSign;
    const from = { x: cl(pad.x * 0.35, -0.4, 0.4), y: C.PADDLE_Y, z: cl(PLAYER_Z + 0.10, 1.45, 1.7) };
    let sv = SIM.serveShot(from, { dir: -1, depth: 0.62 + (rng() - 0.5) * 0.06, spinX, sideY: 0 });
    if(!sv) sv = SIM.serveShot(from, { dir: -1, depth: 0.62, spinX, sideY: 0 });
    if(!sv) sv = SIM.serveShot(from, { dir: -1, depth: 0.35, spinX: 0, sideY: 0 });
    return { from, vel: sv.vel, spin: sv.spin };
  }
  function serveFromAI(policy, rng){
    const plan = P.aiServePlan(policy, rng);
    const power = cl(plan.power == null ? 0.5 : plan.power, 0, 1);
    const from = { x: 0, y: C.TABLE_TOP + 0.28, z: -1.87 };
    /* serveSpin / servePace 必须乘入：aiServePlan 明确返回这两个倍率并注明"调用方乘入
     * mag/sideMag"，实机 rules.js#strikeServe 也照做。丢了它们 = elite 以上的档位
     * 发球强度在评估里完全没有差异（extreme-max 上旋少 26%、速度少 23%），
     * 评估胜率因此系统性虚高。 */
    const sSpin = plan.serveSpin == null ? 1 : plan.serveSpin;
    const sPace = plan.servePace == null ? 1 : plan.servePace;
    const mag = (22 + rng() * 10) * (0.6 + 0.8 * power) * sSpin;
    const sideY = (plan.side * 72 + (rng() - 0.5) * 6) * (0.6 + 0.8 * power) * sSpin;
    let sv = SIM.serveShot(from, { dir: 1, depth: 0.62 + (rng() - 0.5) * 0.06, spinX: mag, sideY, speedMul: sPace });
    if(!sv) sv = SIM.serveShot(from, { dir: 1, depth: 0.62, spinX: mag, sideY: 0 });
    if(!sv) sv = SIM.serveShot(from, { dir: 1, depth: 0.35, spinX: 0, sideY: 0 });
    return { from, vel: sv.vel, spin: sv.spin };
  }

  /* ==== AI 接发/回球（simmatch.returnShot 同构）====
     isReceive：接发球板（第一板）——此前训练侧从不传 receive，receive.pushProb/attackProb
     与爆冲门控在训练里从未生效（simmatch.js 一直传），此处对齐实机/ simmatch。 */
  function aiReturn(meetState, pol, rng, ownX, oppX, isReceive){
    const stroke = meetState.pos.x < ownX ? 'forehand' : 'backhand';
    const d = P.aiDecision({
      stroke, dir: 1,
      bx: meetState.pos.x, by: meetState.pos.y, bz: meetState.pos.z,
      vx: meetState.vel.x, vy: meetState.vel.y, vz: meetState.vel.z,
      sx: meetState.spin.x, sy: meetState.spin.y,
      aiX: ownX, playerX: oppX, rng,
      receive: !!isReceive,
    }, pol);
    return { outVel: d.outVel, fx: d.fx, fy: d.fy, mode: d.mode };
  }

  function gaussOf(rng){ return (rng() + rng() + rng() - 1.5) * 0.8; }

  /* ==== 单分：玩家侧 = agent（输入驱动）；对手 = pA（策略）
   * agent：{ act(obs)→{tx,my,ctrl}，可选 credit(delta) }
   * 返回 { winner:'player'|'ai', shots, reason, pReturns, aiReturns } */
  /* freq：决策跳帧（每 freq 帧才让 brain 决策一次）。默认取 SIM.C.DECIDE_SKIP=3
   * （=60Hz，每帧决策），与实机 tt-player.js 的 frame%DECIDE_SKIP 严格一致。
   * 历史上训练与实机不同源（训练 60Hz / 实机 15Hz），训练里 16ms 内可修正的错误
   * 在实机最多停留 50ms（≈15cm 球程），与接触容差同量级。
   * 2026-10-02 起两边同源 constants.js 的 DECIDE_SKIP=1（60Hz）。 */
  function _playInputPointInner(agent, pA, rng, firstServer, freq){
    const skip = freq || C.DECIDE_SKIP || 1;
    const pad = padInit(PLAYER_Z);
    const aiP = { x: 0, z: AI_Z };
    const zSpd = getP(pA, 'moveZ', 2.0), spd = getP(pA, 'moveSpeed', 2.45), err = getP(pA, 'moveErr', 0.06);
    const credit = d => { if(agent && agent.credit) agent.credit(d); };
    const aiReach = (state, z, x) => {
      /* 同一个 predict/检查块（返回 {reach, meet, newX, newZ}） */
      const meet = SIM.predictMeetZ(state.pos, state.vel, state.spin, 'ai', WIN_LO, WIN_HI, ZRANGE.ai.lo, ZRANGE.ai.hi);
      if(!meet) return { reach:false, why:'reach-null' };
      /* 反应延迟：实机 aiMoveShared 是逐帧指数跟随（g.x += clamp((target-g.x)*rPace, ...)*dt，
       * rPace=7，dt=1/60），跑位有 ~143ms 时间常数。原评估直接一次性 clamp 到位
       * = 零反应延迟，把"够不够得到"判得比实机宽松，对手被系统性高估。 */
      const rPace = getP(pA, 'recoverPace', 7);
      const frames = Math.max(1, Math.round(meet.t / DT));
      const perF = 1 - Math.exp(-rPace * DT);   // 指数趋近的帧级系数
      const errS0 = err + Math.abs(state.spin.x) * 0.0011 + Math.abs(state.spin.y) * 0.0006 + Math.max(0, Math.abs(state.vel.z) - 4) * 0.05;
      const xT = meet.x + gaussOf(rng) * errS0;
      /* 指数跟随 n 帧的闭式终值：x_end = x + (xT-x)*(1-(1-perF)^n)。
       * 用闭式解而非逐帧循环，避免累积误差，也省掉每板的循环开销。 */
      const k = 1 - Math.pow(1 - perF, frames);
      const nx = x + cl((xT - x) * k, -spd * meet.t, spd * meet.t);
      const nz = z + cl((meet.z - z) * k, -zSpd * meet.t, zSpd * meet.t);
      if(Math.abs(meet.z - nz) > 0.10) return { reach:false, why:'reach-z' };
      if(Math.abs(meet.x - nx) > PAD_HW + 0.05) return { reach:false, why:'reach-pos' };
      return { reach:true, meet, newX: nx, newZ: nz };
    };

    /* ---- 发球：先让 DQN 决策一次，再据其结果发球 ----
     * 时序要点：原来 serveFromPlayer 在 padInit 之后立即调用，此时 pad.x 恒为 0
     * （还没跑过一帧 padControl），所以出球点永远固定在台中——DQN 没有任何机会
     * 影响自己的发球。现在先跑一次决策：动作的 tx/my 决定拍位（经 padControl），
     * serveSide/servePower 决定旋转与力度，两者来自**同一次**决策，自洽。 */
    if(firstServer === 'player' && agent && agent.act){
      /* 发球待机观测：球尚未抛起，位置/速度无物理意义，置中并标记未落台。
       * 沿用 playerReceive 的 15 字段口径，encodeObs 才能吃。 */
      const serveObs = {
        x: 0, y: C.PADDLE_Y, z: PLAYER_Z,
        vx: 0, vy: 0, vz: 0,
        sx: 0, sy: 0,
        px: pad.x, pz: pad.z, svx: pad.svx, svz: pad.svz,
        tx: pad._tx != null ? pad._tx : 0, my: pad._my != null ? pad._my : 0.5,
        bounced: 0,
      };
      /* agent 这个形参拿到的是调用方传入的 brain 包装器（train-input3 的 brainOf，
         内部是 agent.act(o, true).cmd —— explore=true 是开的），与 playerReceive
         里的 brain.act(obs) 走的是同一条路、同一套探索策略。 */
      /* 与 agent.act(obs, explore, mark) 同签名：brain 包装器（brainOf）转发到
         真正的 agent 时固定 explore=true，并把 mark 透传下去。这样发球帧能被
         creditMarked('serve', d) 精确定位——否则奖励落到 episode 最后一帧，
         发球动作拿不到梯度（实测锁死在随机初始化的那一个侧旋）。 */
      const cur = agent.act(serveObs, true, 'serve');
      pad.ctrl = !!cur.ctrl;
      pad._tx = cur.tx; pad._my = cur.my;
      /* 跑够帧数让拍面收敛到目标位（实机发球窗口有 1~1.5s，这里给 15 帧 = 0.25s，
       * 指数趋近 timeConstant≈55ms，15 帧足够到达 99%）。 */
      for(let i = 0; i < 15; i++){
        padControl(pad, { tx: cur.tx, my: cur.my, ball: null, pos: null, vel: null,
                          spin: null, ballActive: false }, DT);
      }
      _lastPad = pad;   // 供包装层在一分结束后快照
      var serveIntent = { power: cur.servePower, top: cur.serveTop };
    }
    const srv = firstServer === 'player'
      ? serveFromPlayer(pad, rng, (typeof serveIntent !== 'undefined') ? serveIntent : null)
      : serveFromAI(pA, rng);
    const simS = SIM.simulateServeFull(srv.from, srv.vel, srv.spin, firstServer, rng);
    let shots = 1, winner = null, reason = '', pReturns = 0;
    /* ---- 发球奖励：把「发球质量」精确归因到发球决策那一帧 ----
     * 为什么必须单独设计：一分胜负无法归因到发球——endPoint 只给最后一帧 ±3，
     * 发球帧只拿 0.0008 常数激励。若走普通 credit，信号落在最后一帧，
     * 发球动作的 Q 值没有任何梯度来源，会被随机初始化的那一个值锁死
     * （实测左旋 Q=1.41 vs 其他 0.01）。这里用 creditMarked 直接给发球帧加权。
     *
     * 信号来自**发球后对手的接球质量**——这是发球唯一能直接影响、且可归因的结果：
     *   直接得分（对手够不到）  → +0.8
     *   对手被迫弱接（push/lift）→ +0.3   强接等于把球打回去，无优势
     *   发球下网/出界           → -0.5   自己送分，必须惩罚
     * 尺度刻意与终局 ±3 同量级但更小：发球只是一分的开始，不该主导整分评价。 */
    const serveMark = firstServer === 'player' && agent && agent.creditMarked ? 'serve' : null;
    const cmServe = (d) => {
      if(serveMark && agent.creditMarked) agent.creditMarked('serve', d);
      else credit(d);
    };
    if(!simS.ok){
      winner = firstServer === 'player' ? 'ai' : 'player';
      reason = 'serve-' + simS.reason;
      if(firstServer === 'player') cmServe(-0.5);   // 自己发球失误：重罚
      credit(winner === 'player' ? 0.3 : -0.3);
      return { winner, shots, reason, pReturns };
    }
    credit(0.02);

    let hitter = null;
    /* 接发用发球接触点状态整程模拟（playerReceive/aiReach 自会检测二跳落玩家侧→
       浮出台面；与实机 aiMoveShared/ttTick 一致——深发球按全程反应时间判定够到球）。
       接发球板（第一板）：isReceive=true → 两侧都无法触发爆冲。 */
    let state = { pos: srv.from, vel: srv.vel, spin: srv.spin };
    const receiver0 = firstServer === 'player' ? 'ai' : 'player';
    if(receiver0 === 'player'){
      const r0 = playerReceive(state.pos, state.vel, state.spin, pad, agent, rng, skip, true);
      if(!r0.hit){ winner = 'ai'; reason = 'recv-' + r0.loss; credit(-0.2); return { winner, shots, reason, pReturns }; }
      state = { pos: r0.out.pos, vel: r0.out.vel, spin: r0.out.spin }; hitter = 'player'; shots++; pReturns++;
      credit(0.08);
    }else{
      const r0 = aiReach(state, aiP.z, aiP.x);
      if(!r0.reach){
        // 对手够不到发球 —— 发球直接得分，这是最好的发球
        winner = 'player'; reason = 'ai-' + r0.why;
        if(serveMark) cmServe(0.6);
        credit(0.3); return { winner, shots, reason, pReturns };
      }
      aiP.x = r0.newX; aiP.z = r0.newZ;
      const hit0 = aiReturn(r0.meet.state, pA, rng, aiP.x, pad.x, true);
      /* 对手接到了：按**回球质量**给连续奖励，而不是只看接球手法。
       * 原设计只认 push/lift 两种弱接，实测 elite 对手几乎总能接到并强攻，
       * 三档奖励全不命中 → 一次信号都发不出去（探针实测 200 局 0 样本）。
       *
       * 现在的信号：回球越"软"越好——出球速度慢、弧线高、旋转弱，说明发球把对手
       * 逼到了只能勉强起板的程度，下一分 agent 的回球机会就更好。这三个量在
       * aiReturn 已经算出来（outVel / mode），不需要额外模拟。
       * 归一化到 [-1, 1] 后乘 0.5：正 = 逼出了弱接，负 = 被对手抢攻。 */
      if(serveMark){
        const sp = Math.sqrt(hit0.outVel.x * hit0.outVel.x +
                             hit0.outVel.y * hit0.outVel.y +
                             hit0.outVel.z * hit0.outVel.z);
        const spinMag = Math.abs(hit0.fx) + Math.abs(hit0.fy);
        // 速度：>5m/s 是强攻，<3m/s 是软接；旋转：>150 是强力拧，<60 是软
        const q = (5.0 - Math.min(sp, 6.5)) / 3.5 * 0.6 + (150 - Math.min(spinMag, 200)) / 150 * 0.4;
        cmServe(cl((q - 0.5) * 1.0, -0.5, 0.5));
      }
      state = { pos: r0.meet.state.pos, vel: hit0.outVel, spin: { x: hit0.fx, y: hit0.fy, z: 0 } };
      hitter = 'ai'; shots++;
    }

    for(let k = 0; k < 5000 && !winner; k++){
      // —— 校验上一板 ——
      const sim = SIM.simulateFull(state.pos, state.vel, hitter, state.spin, rng);
      if(!sim.ok || !sim.bouncedOpp){
        if(hitter === 'player'){ winner = 'ai'; reason = 'hit-' + (sim.ok ? 'own' : (sim.reason || 'net-out')); credit(-0.3); }
        else { winner = 'player'; reason = 'ai-' + (sim.ok ? 'own' : (sim.reason || 'net-out')); credit(0.35); }
        break;
      }
      const recv = hitter === 'player' ? 'ai' : 'player';
      if(recv === 'player'){
        const r = playerReceive(state.pos, state.vel, state.spin, pad, agent, rng, skip);
        if(!r.hit){ winner = 'ai'; reason = 'recv-' + r.loss; credit(-0.2); break; }
        state = { pos: r.out.pos, vel: r.out.vel, spin: r.out.spin }; hitter = 'player'; shots++; pReturns++;
        credit(0.05);
      }else{
        const r2 = aiReach(state, aiP.z, aiP.x);
        if(!r2.reach){ winner = 'player'; reason = 'ai-' + r2.why; credit(0.35); break; }
        aiP.x = r2.newX; aiP.z = r2.newZ;
        const rr = aiReturn(r2.meet.state, pA, rng, aiP.x, pad.x);
        state = { pos: r2.meet.state.pos, vel: rr.outVel, spin: { x: rr.fx, y: rr.fy, z: 0 } };
        hitter = 'ai'; shots++;
      }
    }
    /* 实机没有板数上限（physicsStep 一直积分到分出胜负）。原实现在 500 板后掷硬币
     * = 给极端僵持的回合一个现实中不存在的结果。改为大硬上限（只防死循环），
     * 正常对局远到不了这个数；真到上限就判 agent 负（它没能结束僵持）。 */
    if(!winner){ winner = 'ai'; reason = 'cap'; credit(-0.2); }
    return { winner, shots, reason, pReturns };
  }

  /* ==== 一局（11 分 · ITTF 轮换）==== */
  /* playInputPoint 包装：无论内部从哪个 return 出口结束，都把球拍快照留下来，
   * 供下一分的 padInit 继承（否则发球观测每分完全相同 → argmax 锁死）。
   * _lastPad 是 playInputPointInner 在运行期间实时更新的实时拍状态。 */
  let _lastPad = null;
  function playInputPoint(agent, pA, rng, firstServer, freq){
    _lastPad = null;
    const r = _playInputPointInner(agent, pA, rng, firstServer, freq);
    if(_lastPad) snapPad(_lastPad);
    return r;
  }

  function playInputGame(agent, pA, rng){
    let sA = 0, sB = 0, server = 'player', pR = 0;
    for(;;){
      const pt = playInputPoint(agent, pA, rng, server);
      pR += pt.pReturns || 0;
      if(pt.winner === 'player') sA++; else sB++;
      const total = sA + sB;
      if((sA >= 11 || sB >= 11) && Math.abs(sA - sB) >= 2) break;
      const iv = (sA >= 10 && sB >= 10) ? 1 : 2;
      if(total % iv === 0) server = server === 'player' ? 'ai' : 'player';
    }
    return { sA, sB, pR };
  }
  /* ==== 一场（agent 恒在玩家侧）==== */
  function playInputMatch(agent, opp, opts){
    opts = opts || {};
    const games = opts.games || 12;
    let wA = 0, wB = 0, pR = 0;
    for(let i = 0; i < games; i++){
      const g = playInputGame(agent, opp, opts.rngFactory ? opts.rngFactory(i) : Math.random);
      wA += g.sA; wB += g.sB; pR += g.pR;
    }
    return { winsA: wA, winsB: wB, pR, games, pointRate: (wA + wB) ? wA / (wA + wB) : 0.5 };
  }

  const api = { cl, C, DT, PLAYER_Z, AI_Z, padInit, padControl, playerReceive, HITDBG,
                serveFromPlayer, serveFromAI, aiReturn,
                playInputPoint, playInputGame, playInputMatch };
  if(typeof module !== 'undefined' && module.exports) module.exports = api;
  return api;
})();