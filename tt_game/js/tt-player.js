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
   * 两边同源于 constants.js 的 DECIDE_SKIP（浏览器）/ simcore.js 的 C（Node）。
   * 断言比对的是「实机值 === 训练侧兜底值」而不是硬编码某个数字——原来写死
   * `=== 3`，一旦调频率就会误报，久了就没人看了。2026-10-02：3 → 1，每帧决策（60Hz）。 */
  const DECIDE_SKIP_ = C_.DECIDE_SKIP || 1;
  const TRAIN_DECIDE_SKIP = 1;   // input-sim.js 的兜底值，两边必须一致
  if(typeof console !== 'undefined'){
    console.assert(DECIDE_SKIP_ === TRAIN_DECIDE_SKIP, '[TT_PLAYER] DECIDE_SKIP=' + DECIDE_SKIP_ +
      ' ≠ 训练侧 ' + TRAIN_DECIDE_SKIP + '——训练/实机决策频率漂移会导致实机表现远低于仿真胜率');
  }

  let agent = null, ready = false;
  let frame = 0;
  /* 每侧虚拟"玩家拍"（玩家侧坐标系：拍在 +z 近台，来球 vz>0） */
  const __vpInit = () => ({ x: 0, z: PLAYER_Z, svx: 0, svz: 0, ctrl: false, my: 0.5,
    cur: { tx: 0, my: 0.5, ctrl: false },
    stance: 'forehand', stanceT: -1e9, serveLock: null,
    _nz: { v: 0, t: -1 }, _stSw: 0, _wasInbound: false, _predBX: null });
  const vpads = { player: __vpInit(), ai: __vpInit() };
  const cl = (v, a, b) => v < a ? a : (v > b ? b : v);
  const PADDLE_Y_ = C_.PADDLE_Y || 0.91;

  /* ---- 从烘焙权重初始化推理智能体（与训练存档同结构） ---- */
  function init(){
    try{
      if(typeof INPUT_AI_WEIGHTS === 'undefined' || !INPUT_AI_WEIGHTS.net || typeof INPUT_AGENT === 'undefined'){
        ready = false; return;
      }
      /* 形状必须以**代码**（input-agent.js）为唯一权威，绝不能读烘焙权重自带的 meta。
       *
       * 踩过的坑：一度改成「从 INPUT_AI_META 读 nActions/hSizes」，结果权重是旧动作空间
       * （2856）而代码已改成新动作空间（1904）时，setNet 校验的是「权重 vs 权重自己的 meta」
       * —— 2856 vs 2856，通过了；而解码走的是代码的 ACT_N=1904。于是 Q 全 NaN、
       * bestAction 恒返回动作 0，出球速度直接是 NaN，且**没有任何报错**。
       * 这正是当初加 setNet 形状断言想防的失效模式，只是断言的对象选错了。
       *
       * 正确关系：代码定义「期望形状」，权重是待塞进这个形状的对象。
       * 形状不符 → setNet 抛错 → 这里的 catch → ready=false → 回退普通 AI（安全）。 */
      const H = INPUT_AGENT.HSIZES;   // 唯一权威（input-agent.js DEFAULT_HSIZES）
      const o = { stateSize: 88, nActions: INPUT_AGENT.ACT_N,
                  lr: 0.0004, gamma: 0.99, eps0: 1, epsMin: 0.12,
                  batch: 128, replayCap: 1200000, targetEvery: 1200, learnPerPoint: 12, epsDenom: 20000,
                  hSizes: H.slice() };
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

  /* ---- 本侧的姿态决策（玩家侧坐标系）----
   * ★ 与训练侧 input-sim.js#stanceOf **逐字段对齐** —— 不是"给得更多"，是"给一样的"。
   *   两侧喂给 SIM.resolveStance 的字段必须完全相同，否则姿态就会分叉，而姿态
   *   同时决定两件有物理后果的事：tryPlayerHit 里用哪个 STROKE 算触球窗口、
   *   physicsStep 里用哪个 STROKE.magnet 算磁吸。
   *   训练侧 stanceOf 的入参只有：bx / gx / gz / cur / lastSwitch / now /
   *   inbound:true / commit / rng / bvx / noiseBox。**没有** gvx、ttc、ballY、
   *   spinY、strokeSwitches、idle —— 所以这里一个都不传，多传一个就是新的失配。
   *   bx = 每板一次的整板预测击球点，且不随磁吸拉球漂移（训练侧明确要求这一点，
   *   否则会出现"磁吸改变球位 → 改变姿态"的反馈震荡）。
   *   还原期（无来球）不调用 resolveStance、保持当前姿态 —— 与训练侧一致
   *   （autoStance 的 resetHold 归位是真人手感，不属于训练口径）。 */
  function stanceTick(vp, m, dt, mir){
    const inbound = (typeof ball !== 'undefined') && ball.active && !ballDead && m.vel.z > 0.15;
    if(!inbound){ vp._wasInbound = false; return; }
    if(!vp._wasInbound){
      vp._wasInbound = true;
      vp._predBX = null;
      vp._stSw = 0;
      if(vp._nz){ vp._nz.v = 0; vp._nz.t = -1; }
    }
    if(vp._predBX == null) vp._predBX = SIM.predictXAtZ(m.pos, m.vel, m.spin, PLAYER_Z);
    const ttc = (vp.z - m.pos.z) / m.vel.z;
    const commit = ttc > 0 && ttc < SIM.commitTOf(vp.stance, m.vel.z);
    const st = SIM.resolveStance({ bx: vp._predBX, gx: vp.x, gz: vp.z, cur: vp.stance,
      lastSwitch: vp.stanceT, now: elapsed, inbound: true, commit, rng: Math.random,
      bvx: m.vel.x || 0, noiseBox: vp._nz });
    if(st !== vp.stance){ vp.stance = st; vp.stanceT = elapsed; }
  }

  /* ---- 60Hz 决策 + 拍面缓动（input-sim.padControl 同公式，作用到实机拍） ---- */
  function ttTick(dt, side, realPad){
    if(!isReady()) return;
    const vp = vpads[side];
    const mir = (side === 'player') ? 1 : -1;
    const m = mirrorState(side);
    /* ★ 发球锁：抛球窗口内冻结动作。
     * 实机抛球有 1~1.5s 的 awaitServe + ~0.35s 的 toss 下降才击球，这段时间里
     * ttTick 每帧都在重新决策 —— 于是真正击球那一刻的拍位是**最后一次**决策的目标，
     * 而不是发球决策的目标。训练侧相反：serveFromPlayer 之前跑 15 帧 padControl
     * 把拍面收敛到发球动作的 tx。出球点由拍位决定（SIM.serveOrigin），于是两边
     * 的发球出球点系统性地不同。这里把发球决策锁到击球为止，与训练侧同口径。 */
    const serving = vp.serveLock && (typeof state !== 'undefined')
                    && (state === 'awaitServe' || state === 'toss')
                    && (typeof server !== 'undefined') && server === side;
    if(serving){
      vp.cur = vp.serveLock;
    }else if(frame % DECIDE_SKIP_ === 0){
      const obs = buildObs(side, realPad);
      const a = agent.bestAction(obs);
      vp.cur = agent.decode(a);
      if(typeof TT_STATS !== 'undefined') TT_STATS.noteAction(side, vp.cur);
    }
    if(!serving) frame++;
    /* padControl（玩家侧坐标系） */
    /* MOUSE_PACE / MOUSE_SV_CAP 从 simcore 的 C 读——与训练器 input-sim.js 同一份。
     * 原来这里是裸数字 18 / ±7，训练侧也各写一份；两边漂移 = 又一次训练/实机失配。
     * 想给 ttmouse 限速（让它更好打）只改 constants.js 一处，重烘焙即可，不用重训。 */
    const pace = C_.MOUSE_PACE != null ? C_.MOUSE_PACE : 18;
    const svCap = C_.MOUSE_SV_CAP != null ? C_.MOUSE_SV_CAP : 7;
    const rate = vp.recover > 0 ? pace * 0.5 : pace;
    const tx = cl(vp.cur.tx, -X_CLAMP_, X_CLAMP_);
    const tz = cl(0.92 + (vp.cur.my != null ? vp.cur.my : 0.5) * 0.8, ZRANGE_P.lo, ZRANGE_P.hi);
    let effZ = tz;
    if(m.vel.z > 0.5 && typeof ball !== 'undefined' && ball.active){
      const meet = SIM.predictMeetZ(m.pos, m.vel, m.spin, 'player',
                                    WIN_LO, WIN_HI, ZRANGE_P.lo, ZRANGE_P.hi);
      if(meet){
        /* fitW 吃的是来球**速度** z，不是球的**位置** z。训练侧 input-sim.js 的
         * ctx.ball 传的是速度向量 v，真人玩家侧 main.js 用的也是 ball.vel.z——
         * 唯独这里写成了 m.pos.z，球在 z≈-0.5 时 fitW 恒被压到下限 0.2，
         * 拍面深度追踪基本失效。 */
        const fitW = cl(0.25 + (m.vel.z - 1) * 0.03, 0.2, 0.5);
        effZ = cl(PLAYER_Z + (tz - PLAYER_Z) + (meet.z - PLAYER_Z) * fitW, ZRANGE_P.lo, ZRANGE_P.hi);
      }
    }
    const prevX = vp.x, prevZ = vp.z;
    vp.x += (tx - vp.x) * Math.min(1, dt * rate);
    vp.z += (effZ - vp.z) * Math.min(1, dt * rate * 0.7);
    const svx = cl((vp.x - prevX) / Math.max(dt, 1e-4), -svCap, svCap);
    const svz = cl((vp.z - prevZ) / Math.max(dt, 1e-4), -svCap, svCap);
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
    /* 正/反手姿态：本侧统一由 stanceTick 拥有（= 训练侧 input-sim#stanceOf 的输入口径）。
       原来这里是「AI 侧用 ttTick 内嵌的 90ms 缓存版、玩家侧用 physics.js#autoStance
       的自适应缓存版」—— 两套不同的输入喂同一个 SIM.resolveStance，实测构成
       default/elite/extreme 档 -20~-38pp 缺口的一部分（见 tools/phase3-findings.md §5）。
       玩家侧不再由 autoStance 写 playerPad.stance，autoStance 的返回值在
       ttmouse 对局里已不参与任何物理判定（见 physics.js#autoStance 顶部注释）。 */
    stanceTick(vp, m, dt, mir);
    realPad.stance = vp.stance; realPad.stanceT = vp.stanceT;
    /* 玩家侧同步 playerStance 全局：physicsStep 的玩家侧磁吸与 tryPlayerHit 都读它，
       不同步的话它们读到的是 autoStance 的结果（真人路径）而不是本模型的。 */
    if(side === 'player' && typeof playerStance !== 'undefined') playerStance = vp.stance;
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
      fwd: SIM.fwdOf(vp.svz),          // 分母读 MOUSE_SV_CAP（原来硬编码 /7，与训练侧各写一份）
      mouseNy: ny,
      aim: { x: aimX, z: aimZ, gx: vp.x },
      ctrlHold: !!realPad.ctrl,
      dir: -1,
      /* ★ 无条件应用弧线拟合。
       * 原来写 applyArcAdj:(mode==='play')，于是**斗蛐蛐模式（mode==='watch'）下
       * 弧线拟合被静默关掉** —— 而这正是线上遥测里全部 ttmouse 对局所在的模式。
       * 训练侧 input-sim#hitShot 恒传 true，权重是在「弧线拟合生效」下学出来的，
       * 关掉它等于实机换了一套出球物理。resolveHit 里这一项直接改 arc（±0.35），
       * 进而改 solveShot 的抛物线与落点深度。 */
      applyArcAdj: true,
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
      vp.serveLock = null;                       // 发球锁：每分重置
      vp.stance = 'forehand'; vp.stanceT = -1e9; // 姿态跨板保持（与实机 playerPad 同）
      vp._stSw = 0;                            // 切换预算
      vp._wasInbound = false; vp._predBX = null; // 每板重置：预测击球点 / 上升沿
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

  /* ---- 发球决策（2026-10-02 新增）----
   * 在 rules.js#setupServe 的 1~1.5s 发球窗口内调用：此刻 aiMove→ttTick 每帧都在跑，
   * 拍面已经落到稳定位置，球尚未抛起（ball.active 为真但速度为 0）。
   * 返回 { side:-1|0|1, power:0.35|0.6|0.85, tx, my } 供 strikeServe 消费。
   * 训练侧对应 input-sim.js 的「发球前决策」块（serveObs + 15 帧 padControl）——
   * 两边必须同一口径，否则训练出的发球在实机复现不出来。 */
  function decideServe(){
    if(!isReady()) return null;
    const side = (typeof mode !== 'undefined' && mode === 'watch')
      ? (server === 'player' ? fightL : fightR)
      : (server === 'ai' ? aiModel : '');
    if(side !== 'ttmouse') return null;
    const realPad = (side === 'player') ? playerPad : aiPad;
    if(typeof realPad === 'undefined' || !realPad || !realPad.group) return null;
    /* 发球待机观测：球未抛起 → 位置/速度置中、标记未落台（与训练侧 serveObs 同构） */
    const vp = vpads[side === 'player' ? 'player' : 'ai'];
    const mir = (side === 'player') ? 1 : -1;
    const obs = {
      x: 0, y: PADDLE_Y_, z: mir * PLAYER_Z,
      vx: 0, vy: 0, vz: 0, sx: 0, sy: 0,
      px: realPad.group.position.x,
      pz: (side === 'player') ? realPad.group.position.z : -realPad.group.position.z,
      svx: realPad.svx, svz: (side === 'player') ? realPad.svz : -realPad.svz,
      tx: vp.cur.tx, my: vp.cur.my, bounced: 0,
    };
    const d = agent.decode(agent.bestAction(obs));
    vp.cur = { tx: d.tx, my: d.my, ctrl: d.ctrl };
    /* 锁住这一次决策直到击球（见 ttTick 的「发球锁」注释）：拍位要收敛到发球动作，
       而不是被抛球窗口里后续的逐帧决策改写。 */
    vp.serveLock = { tx: d.tx, my: d.my, ctrl: d.ctrl };
    return { top: d.serveTop, power: d.servePower, tx: d.tx, my: d.my };
  }

  /* 本侧当前姿态（physics.js#pushStanceOf 在 ttmouse 玩家侧读它） */
  function getStance(side){ const vp = vpads[side]; return vp ? vp.stance : 'forehand'; }

  return { init, isReady, isTtSide, ttTick, ttHit, reset, ensureWeights, decideServe, getStance,
           get agent(){ return agent; } };
})();

/* 页面加载即初始化：若权重未（懒）加载则保持 ready=false，ensureWeights 注入后会重试 */
if(typeof document !== 'undefined' && document.readyState !== 'loading') TT_PLAYER.init();
else if(typeof document !== 'undefined') document.addEventListener('DOMContentLoaded', () => TT_PLAYER.init());
if(typeof module !== 'undefined' && module.exports) module.exports = { TT_PLAYER };