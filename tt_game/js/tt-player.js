/* =====================================================================
 *  tt-player.js — 「鼠标上的tt玩家」对战模型
 *  · 把 tools/train-input.js 训练出的"输入级 DQN"（记 鼠标X/鼠标Y/Ctrl
 *    三个原始输入）直接搬进实机，作为 AI 侧对手——
 *    与训练环境 input-sim.js 100% 同款管线：
 *      15Hz 决策 → encodeObs(88维) → bestAction → decode(tx,my,ctrl)
 *      → padControl 拍面缓动 → 来球磁吸/拟合/触球（实机物理）→ 出球
 *  · 坐标：AI 侧把实况镜像到"玩家侧坐标系"（z->-z, vz->-vz, sx->-sx, sy->-sy），
 *    智能体只按训练时的近台视角决策，出球再镜像回真坐标。
 *  · 依赖加载顺序：dqn.js → input-agent.js → 本文件
 *    （input-weights.js 已懒加载：选中本模型时由 ensureWeights 动态注入）
 * ===================================================================== */
'use strict';

const TT_PLAYER = (() => {
  const C_ = (typeof SIM !== 'undefined') ? SIM.C : {};
  const PLAYER_Z = C_.PLAYER_Z || 1.32;
  const X_CLAMP_ = C_.X_CLAMP || 1.2;
  const WIN_LO = (C_.PADDLE_Y || 0.91) - 0.235, WIN_HI = (C_.PADDLE_Y || 0.91) + 0.235;
  const ZRANGE_P = { lo: 0.92, hi: 1.72 };
  const CV = C_.AIM || { xFromPos: 0.55, xFromSwipe: 0.30, zDeep: -1.24, zShort: -0.50 };
  /* 决策跳帧：必须与训练器 input-sim.playInputPoint 的 SIM.C.DECIDE_SKIP 一致。
   * 历史上训练按 60Hz、实机按 15Hz，训练里 16ms 可修正的错误在此停留最多 50ms。
   * 两边都由 constants.js 的 DECIDE_SKIP 单一来源同步，启动时断言防漂移。 */
  const DECIDE_SKIP_ = C_.DECIDE_SKIP || 3;
  if(typeof console !== 'undefined'){
    console.assert(DECIDE_SKIP_ === 3, '[TT_PLAYER] DECIDE_SKIP=' + DECIDE_SKIP_ +
      '，与训练器默认 15Hz 不一致——训练/实机决策频率漂移会导致实机表现远低于仿真胜率');
  }

  let agent = null, ready = false;
  let frame = 0;
  /* 每侧虚拟"玩家拍"（玩家侧坐标系：拍在 +z 近台，来球 vz>0） */
  const vpads = {
    player: { x: 0, z: PLAYER_Z, svx: 0, svz: 0, ctrl: false, my: 0.5, cur: { tx: 0, my: 0.5, ctrl: false } },
    ai:     { x: 0, z: PLAYER_Z, svx: 0, svz: 0, ctrl: false, my: 0.5, cur: { tx: 0, my: 0.5, ctrl: false } },
  };
  const cl = (v, a, b) => v < a ? a : (v > b ? b : v);

  /* ---- 从烘焙权重初始化推理智能体（与训练存档同结构） ---- */
  function init(){
    try{
      if(typeof INPUT_AI_WEIGHTS === 'undefined' || !INPUT_AI_WEIGHTS.net || typeof INPUT_AGENT === 'undefined'){
        ready = false; return;
      }
      const o = { stateSize: 88, nActions: 952,
                  lr: 0.0004, gamma: 0.99, eps0: 1, epsMin: 0.12,
                  batch: 128, replayCap: 1200000, targetEvery: 1200, learnPerPoint: 12, epsDenom: 20000,
                  hSizes: [128, 192, 128] };
      agent = INPUT_AGENT.createInputAgent(o, Math.random);
      agent.setNet(INPUT_AI_WEIGHTS.net);
      agent.setTraining(false);
      agent.setEps(0);
      ready = true;
    }catch(e){
      console.warn('[TT_PLAYER] 初始化失败：' + (e && e.message));
      ready = false;
    }
  }
  function isReady(){ return ready && !!agent; }

  /* ---- 侧 → 是否使用「鼠标上的tt玩家」模型 ---- */
  function isTtSide(side){
    const m = (typeof mode !== 'undefined' && mode === 'watch')
      ? (side === 'player' ? fightL : fightR)
      : (side === 'ai' ? aiModel : '');
    return m === 'ttmouse';
  }

  /* ---- 实况 → 玩家侧坐标系（mir=+1 玩家侧原样 / mir=-1 AI 侧镜像） ---- */
  function mirrorState(side){
    const mir = (side === 'player') ? 1 : -1;
    const p = ball.pos, v = ball.vel, s = ball.spin;
    return {
      pos: { x: p.x, y: p.y, z: mir * p.z },
      vel: { x: v.x, y: v.y, z: mir * v.z },
      spin: { x: mir * s.x, y: mir * s.y, z: 0 },
    };
  }

  /* ---- 观测量（与 input-sim.js playerReceive 的 obs 字段完全一致） ---- */
  function buildObs(side, realPad){
    const m = mirrorState(side);
    const vp = vpads[side];
    const g = realPad.group.position;
    return {
      x: m.pos.x, y: m.pos.y, z: m.pos.z,
      vx: m.vel.x, vy: m.vel.y, vz: m.vel.z,
      sx: m.spin.x, sy: m.spin.y,
      px: g.x, pz: (side === 'player') ? g.z : -g.z,
      svx: realPad.svx, svz: (side === 'player') ? realPad.svz : -realPad.svz,
      tx: vp.cur.tx, my: vp.cur.my,
      bounced: (typeof shotBouncedOpp !== 'undefined' && shotBouncedOpp) ? 1 : 0,
    };
  }

  /* ---- 15Hz 决策 + 拍面缓动（input-sim.padControl 同公式，作用到实机拍） ---- */
  function ttTick(dt, side, realPad){
    if(!isReady()) return;
    const vp = vpads[side];
    const mir = (side === 'player') ? 1 : -1;
    const m = mirrorState(side);
    if(frame % DECIDE_SKIP_ === 0){
      const obs = buildObs(side, realPad);
      const a = agent.bestAction(obs);
      vp.cur = agent.decode(a);
      if(typeof TT_STATS !== 'undefined') TT_STATS.noteAction(side, vp.cur);
    }
    frame++;
    /* padControl（玩家侧坐标系） */
    const rate = vp.recover > 0 ? 9 : 18;
    const tx = cl(vp.cur.tx, -X_CLAMP_, X_CLAMP_);
    const tz = cl(0.92 + (vp.cur.my != null ? vp.cur.my : 0.5) * 0.8, ZRANGE_P.lo, ZRANGE_P.hi);
    let effZ = tz;
    if(m.vel.z > 0.5 && typeof ball !== 'undefined' && ball.active){
      const meet = SIM.predictMeetZ(m.pos, m.vel, m.spin, 'player',
                                    WIN_LO, WIN_HI, ZRANGE_P.lo, ZRANGE_P.hi);
      if(meet){
        const fitW = cl(0.25 + (m.pos.z - 1) * 0.03, 0.2, 0.5);
        effZ = cl(PLAYER_Z + (tz - PLAYER_Z) + (meet.z - PLAYER_Z) * fitW, ZRANGE_P.lo, ZRANGE_P.hi);
      }
    }
    const prevX = vp.x, prevZ = vp.z;
    vp.x += (tx - vp.x) * Math.min(1, dt * rate);
    vp.z += (effZ - vp.z) * Math.min(1, dt * rate * 0.7);
    const svx = cl((vp.x - prevX) / Math.max(dt, 1e-4), -7, 7);
    const svz = cl((vp.z - prevZ) / Math.max(dt, 1e-4), -7, 7);
    vp.svx += (svx - vp.svx) * Math.min(1, dt * 12);
    vp.svz += (svz - vp.svz) * Math.min(1, dt * 12);
    vp.ctrl = !!vp.cur.ctrl;
    /* 写回实机拍（AI 侧 z 镜像回负半轴） */
    const g = realPad.group.position;
    g.x = vp.x;
    g.z = mir * vp.z;
    realPad.svx = vp.svx;
    realPad.svz = mir * vp.svz;
    realPad.ctrl = vp.ctrl;
    realPad.my = vp.cur.my;
    realPad._tx = vp.cur.tx;
    realPad._my = vp.cur.my;
    /* 玩家侧：让实机物理用本模型的 ctrl 判定搓球磁吸/拟合（与训练管线一致） */
    if(side === 'player' && typeof ctrlHold !== 'undefined' && typeof beginWindup === 'function'){
      ctrlHold = vp.ctrl;
    }
    /* 正/反手姿态（仅 AI 侧；玩家侧由 autoStance 唯一所有，勿双写）。
       mirrorState 只镜像 z——x 语义两侧一致，bvx 直接用真实坐标的 ball.vel.x。
       与 aiMoveShared 同款 90ms 预测缓存 + SIM.resolveStance（v2.3：触球时刻几何/
       横向趋势/方向不对称滞回/OU 平滑噪声/软承诺/磁吸过渡成本与实机 AI、玩家完全同源）。 */
    if(side === 'ai'){
      const inboundSt = typeof ball !== 'undefined' && ball.active && !ballDead && ball.vel.z * mir > 0.15;
      if(inboundSt && !vp._wasInbound){ vp._stSw = 0; if(vp._nz){ vp._nz.v = 0; vp._nz.t = -1; } }   // 新一板：重置切换预算与决策噪声
      vp._wasInbound = inboundSt;
      if(inboundSt && elapsed - (vp._spT != null ? vp._spT : -9) > 0.09){
        vp._spT = elapsed;
        vp._spBX = SIM.predictXAtZ(ball.pos, ball.vel, ball.spin, g.z);
      }
      const ttc = (g.z - ball.pos.z) / ball.vel.z;   // 球到拍面平面时间（分子分母同号）
      const st = SIM.resolveStance({ bx: inboundSt ? vp._spBX : ball.pos.x, gx: g.x, gz: g.z,
        cur: realPad.stance, lastSwitch: realPad.stanceT, now: elapsed,
        inbound: inboundSt, idle: !ball.active || ballDead,
        commit: inboundSt && ttc > 0 && ttc < SIM.commitTOf(realPad.stance, ball.vel.z),
        strokeSwitches: vp._stSw || 0, bvx: ball.vel.x, gvx: realPad.svx || 0,
        ttc: inboundSt ? ttc : null, ballY: ball.pos.y, spinY: ball.spin.y,
        noiseBox: (vp._nz || (vp._nz = { v: 0, t: -1 })) });
      if(st !== realPad.stance){ realPad.stance = st; realPad.stanceT = elapsed; vp._stSw = (vp._stSw || 0) + 1; }
    }
    /* 引拍预告（与 aiMoveShared 同窗口）：在玩家侧坐标系看球接近虚拟拍时引拍 */
    if(typeof beginWindup === 'function' && realPad.phase === 'ready'
       && typeof lastHitter !== 'undefined' && lastHitter !== side
       && typeof ball !== 'undefined' && ball.active && !ballDead && m.vel.z > 0.15){
      const ttc = (vp.z - m.pos.z) / m.vel.z;
      if(ttc > 0 && ttc < 0.16) beginWindup(realPad, realPad.stance, 0.5);
    }
  }

  /* ---- 触球：与 input-sim hitShot 同构（玩家侧坐标系 resolveHit，AI 侧再镜像回真坐标） ---- */
  function ttHit(side, realPad){
    if(!isReady()) return false;
    const mir = (side === 'player') ? 1 : -1;
    const m = mirrorState(side);
    const vp = vpads[side];
    const ny = cl(realPad._my != null ? realPad._my : 0.5, 0, 1);
    const aimX = cl(vp.x * CV.xFromPos + vp.svx * CV.xFromSwipe, -0.9, 0.9);
    const aimZ = CV.zDeep + (CV.zShort - CV.zDeep) * ny * ny;
    const r = SIM.resolveHit({
      stroke: 'forehand',
      pos: { x: m.pos.x, y: m.pos.y, z: m.pos.z },
      vel: { x: m.vel.x, y: m.vel.y, z: m.vel.z },
      spin: { x: m.spin.x, y: m.spin.y, z: 0 },
      swipe: vp.svx,
      fwd: cl(-vp.svz / 7, 0, 1),
      mouseNy: ny,
      aim: { x: aimX, z: aimZ, gx: vp.x },
      ctrlHold: !!realPad.ctrl,
      dir: -1,
      applyArcAdj: (typeof mode !== 'undefined') ? mode === 'play' : true,
      // 接发球板（第一板）无法触发爆冲——与实机玩家/AI 同一限制
      receive: (typeof rallyCount !== 'undefined' && typeof lastHitter !== 'undefined')
               ? (rallyCount <= 1 && lastHitter !== side) : false,
    });
    if(!r || !r.outVel) return false;
    /* 镜像回真坐标（AI 侧：vz/sx/sy 反号） */
    ball.vel.set(r.outVel.x, r.outVel.y, mir * r.outVel.z);
    ball.spin.set(mir * r.spin.x, mir * r.spin.y, 0);
    ball.lastStroke = 'tt-' + (side === 'ai' ? 'mirror' : 'player');
    if(typeof willNet !== 'undefined') willNet = !!r.netOut;
    if(typeof TT_STATS !== 'undefined') TT_STATS.noteHit(side, !!r.netOut);   // 实机遥测：一次成功触球
    return true;
  }

  /* 每分重置虚拟拍（setupServe 时由 rules 调用，若已加载） */
  function reset(){
    frame = 0;
    for(const side of Object.keys(vpads)){
      const vp = vpads[side];
      vp.x = 0; vp.z = PLAYER_Z; vp.svx = 0; vp.svz = 0;
      vp.ctrl = false; vp.my = 0.5;
      vp.cur = { tx: 0, my: 0.5, ctrl: false };
      vp._stSw = 0;                            // 切换预算
      if(vp._nz){ vp._nz.v = 0; vp._nz.t = -1; }   // OU 决策噪声
    }
  }

  /* ---- 权重懒加载：input-weights.js（3.8MB）仅在需要本模型时注入 ----
   * 页面启动不再无条件加载该文件（移动端可省数百 ms 的下载+解析阻塞）。
   * 未加载时 init() 检测到 INPUT_AI_WEIGHTS 缺失保持 ready=false（该侧回退普通 AI），
   * 脚本 onload 后重新 init 完成装配；重复调用复用同一份 Promise。 */
  let weightsPromise = null;
  function ensureWeights(){
    if(typeof INPUT_AI_WEIGHTS !== 'undefined') return Promise.resolve();
    if(!weightsPromise){
      weightsPromise = new Promise((resolve, reject)=>{
        const s = document.createElement('script');
        s.src = 'js/input-weights.js';
        s.onload = () => { init(); resolve(); };
        s.onerror = () => { weightsPromise = null; reject(new Error('input-weights.js 加载失败')); };
        document.head.appendChild(s);
      });
    }
    return weightsPromise;
  }

  return { init, isReady, isTtSide, ttTick, ttHit, reset, ensureWeights,
           get agent(){ return agent; } };
})();

/* 页面加载即初始化：若权重未（懒）加载则保持 ready=false，ensureWeights 注入后会重试 */
if(typeof document !== 'undefined' && document.readyState !== 'loading') TT_PLAYER.init();
else if(typeof document !== 'undefined') document.addEventListener('DOMContentLoaded', () => TT_PLAYER.init());
if(typeof module !== 'undefined' && module.exports) module.exports = { TT_PLAYER };