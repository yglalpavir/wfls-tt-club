/* =====================================================================
 *  hip-skill.js — HIP L1：解析技能控制器（零学习参数）
 *
 *  背景（为什么要它）：
 *    玩家侧 DQN（input-agent.js）把「够得到球」和「往哪打」压进了同一个
 *    1904 维分类头，用末帧标量奖励训练。实测后果：
 *      - 34 档横向只用掉 4 档，|x|<=0.6 时拍面恒在 ±0.14m（≈ centre）；
 *      - 一行解析横向先验（lateralPrior）把实机胜率从 8.7% 抬到 32.1%；
 *      - 手写 chase（往球 x 走）就有 40.1%，高于任何一版权重；
 *      - 71.5% 的失分是 noreach（够不到），不是击球参数不对。
 *    ⇒ 结论：几何（拦截点、触球时机、挥拍→落点的反解）应该由解析层负责，
 *      网络只该学「战术选择」（M2 的 336 类意图）。
 *
 *  本文件就是那一层：给定 15 字段 obs（与 input-sim.playerReceive 完全同构），
 *  输出 {tx, my, ctrl} 三个量 —— 与真人玩家的输入完全同口径，
 *  所以它同时能喂给训练侧（playInputPoint 的 brain.act）和实机（tt-player）。
 *
 *  ★ 不改物理：本文件只产出 tx/my/ctrl，出球仍走 SIM.resolveHit，
 *    拍面运动仍走 input-sim.padControl / tt-player 内联的同一套公式。
 *
 *  坐标约定：全部在「玩家侧坐标系」（自己半台 +z，视线看球来自 −z）。
 *    与实机 tt-player 的 mirrorState('player') 一致（mir=+1，不镜像）。
 * ===================================================================== */
'use strict';

const HIP_SKILL = (() => {
  /* ---- 环境：浏览器/vm 里 SIM 是全局；Node 里 require 兜底 ---- */
  const SIM_ = (typeof SIM !== 'undefined') ? SIM
    : (typeof require === 'function'
        ? (() => { try { return require('./simcore.js'); } catch (e) { return null; } })()
        : null);
  const C_ = (SIM_ && SIM_.C) || {};

  const PLAYER_Z = C_.PLAYER_Z != null ? C_.PLAYER_Z : 1.32;
  const X_CLAMP  = C_.X_CLAMP  != null ? C_.X_CLAMP  : 1.2;
  const PADDLE_Y = C_.PADDLE_Y != null ? C_.PADDLE_Y : 0.91;
  const TABLE_TOP= C_.TABLE_TOP!= null ? C_.TABLE_TOP: 0.76;
  const PACE     = C_.MOUSE_PACE   != null ? C_.MOUSE_PACE   : 18;  // 拍面跟随速率 1/s
  const SVCAP    = C_.MOUSE_SV_CAP != null ? C_.MOUSE_SV_CAP : 7;   // 拍速上限 m/s
  const AIM      = C_.AIM || { xFromPos: 0.55, xFromSwipe: 0.30, zDeep: -1.24, zShort: -0.50 };
  const AIM_XMAX = (C_.STROKE && C_.STROKE.forehand && C_.STROKE.forehand.aimXMax != null)
    ? C_.STROKE.forehand.aimXMax : 0.62;   // resolveHit 最终把落点夹在 ±这个值
  const WIN_LO = PADDLE_Y - 0.235, WIN_HI = PADDLE_Y + 0.235;
  const ZRANGE = { lo: 0.92, hi: 1.72 };
  const G = C_.G != null ? C_.G : 9.81;

  const cl = (v, a, b) => (v < a ? a : (v > b ? b : v));
  /* 最近一次预测失败的诊断（供 live-match --hip-probe 统计） */
  const LAST_FAIL = { wide: null };
  const sgn = (v) => (v < 0 ? -1 : 1);

  /* ---- 可调旋钮（默认值由 tools/hip-tune.js 的坐标下降定出，2026-10-20）----
   * 目标函数不是「仿真分点率」（那会饱和成拖时间：烘焙 DQN 仿真 97.1%
   * 但平均每分 471 板），而是「在 maxShots 板内结束的一分里赢多少」，
   * 平局计入分母。坐标下降 2 轮后的取值见 docs/reports/hip-m1-findings.md。 */
  const DEFAULTS = {
    /* 落点 */
    landX:       0.55,   // 宽球时期望的落点（±，台半宽 0.7625）
    landXMid:    0.55,   // 中球时期望的落点
    aimShiftGain:0.5,    // 落点偏移的补偿强度（1=全补偿）
    aimTau:      0.35,   // 估算飞行时间（把速度差换算成落点差）
    wideThresh:  0.25,   // |bx| 超过它算「宽球」
    alternate:   1,      // 每球换边
    /* 追位 */
    posGain:     1.0,    // 追位速度前馈增益
    maxLead:     0.75,   // 追位前馈（折算成 tx 偏移）上限
    posLead:    -0.06,   // 位置律的目标点前置量（米）
    holdClamp:   0.22,   // 挥拍阶段允许的拍位修正（米）
    /* 挥拍 */
    swingLead:   0.05,   // 进入挥拍阶段的提前量（秒）
    swingEff:    0.45,   // 期望落点 → 需要的拍速 的经验折算
    maxSwing:    2.0,    // 拍速上限（命令值）
    aimTrim:     0.6,    // 挥拍阶段：落点律相对追位律的权重
    /* 深度/手法 */
    myDrive:     0.54,   // 常规击球的 my（→ 落点深度 + 前冲力度）
    myPush:      0.56,   // 搓球
    myLift:      0.72,   // 挑打（下旋但球高）
    /* ★ 接近段用**浅拍位**、触球前最后几帧再切回出球深度。
     * 动机（实机 tryPlayerHit 逐帧判据实测）：接触窗口的横向容忍是
     *   PAD_HW + BALL_R + fitH，而 fitH 只在**球高 > TABLE_TOP+0.13 = 0.89**
     *   时才放宽（0.026 → 0.21，即容忍 0.146 → 0.33m）。
     *   实机触球高度 p50 = 0.82（全是低球）→ 窗口最窄，
     *   实测「够不到」= 横向差 ~0.15m 差一点被拒。
     *   拍位 z 由 my 决定（effZ = 0.92+0.8·my + (meetZ−1.32)·fitW），
     *   拍位越浅 → 球越早越过拍面 → 触球点越高（顶到球上升段）。
     * ★ 但 my 同时决定出球深度（aimZ = −1.24+0.74·my²），二者**无法解耦**：
     *   试过「接近段 my=0.34 浅拍位、触球前 mySwitchTau 内切回 myDrive」，
     *   实机 40 局：够不到 78%→41% ✓，但「自己出界」24%→59% ✗，
     *   分点率反而 58.6% → 8%~27%。原因：接触帧比预测的触球时刻早 1~3 帧
     *   （prox 判据允许球还差 0.09m 就碰），于是「切回出球深度」经常来不及，
     *   触球那一帧用的还是浅 my → 落点 z=-1.15 → 直接出底线。
     *   ⇒ 这个方向要成立，必须先让**触球时刻可预测**（z 相位对齐），
     *   否则 my 的耦合就是死结。默认关闭，留作 M2 的实验开关。 */
    myApproach:  0.0,    // 接近段拍位 my（0 = 不启用，直接用 myDrive）
    mySwitchTau: 0.025,  // tau <= 它就切回 myDrive（触球前 ~1.5 帧）
    mySpeedRef:  7.0,    // 来球速度超过它就开始「收」
    mySpeedGain: 0.0,    // 收的幅度（0 = 不按速度调整深度）
    mySpeedSpan: 7.0,
    pushRtop:   -8,      // relTopOf < 它 = 下旋来球
    pushHeight:  0.95,   // 球高低于它才搓（否则挑）
    /* 待机 */
    homeX:       0.0,
    homeMy:      0.50,
    /* ★ 独立拍面深度通道（pz）：拍面 z = 预测落台点 z + padZOffset。
     * 实机实测（tools/live-match.js --hip-probe，20 局 / 2845 次 tryPlayerHit）：
     *   365 个「球已到拍面深度」的决定性帧里，横向 x 超限 **0** 次，
     *   24 次漏球**全部**是纵向 y 超限，且那些帧的球高 p50 = **0.569**
     *   （0.41~0.68）—— 球还在**台面以下**，也就是它在拍面深度之前
     *   **还没落地弹起**，直接从拍下穿过去了。
     *   根因：拍面 z 由 my 推出（my=0.54 → z=1.273），恰好停在「球弹起之前」
     *   那一段。⇒ 拍面 z 必须由**预测落台点**决定，与出球深度解耦。
     *   offset 取多少：落台后球上升，0.2~0.3m 相当于弹起后 2~3 帧，
     *   触球高度 ≈ 0.82~0.86（离拍心 0.91 只差 0.05~0.09，在纵向容差 0.175 内）。 */
     padZOffset:  0.35,   // 拍面 z = 预测落台点 z + 偏移（<0 = 关闭 pz 通道）
     padZPhase:   1,      // 拍面 z 是否按「球的 z 相位栅格」吸附（避免球跳过接触窗口）
    padZMin:     0.95,   // 拍面 z 下限
    padZMax:     1.60,   // 拍面 z 上限
  /* 预判站位：AI 的落点永远在玩家的**反侧**（policy.js#aiDecision:
   * away = playerX>0 ? -1 : 1），所以下一球大概率来「上一球的反侧」。
   * 空档时先站到那一侧，等球来就不用追 —— 理论上是最便宜的够球率提升。
   * ★ 实测（live-match 30 局 vs hell）：开预判 45.8% vs 关 58.6% —— **更差**。
   *   原因：预判站位把拍子摆在 ±0.34，来球在另一侧时等于**横穿全台去追**，
   *   到位时拍速 1~2 m/s → 落点被顶到台边 → 「自己出界」从 24% 涨到 45%。
   *   预判能省的路程 < 它引入的拍速，所以默认关闭（留作实验开关）。 */
    anticipateX: 0.0,   // 预判站位的幅度（米）；0 = 不预判
    anticipate:  0,      // 开关
  };

  /* ---- 运行时覆盖（实机扫描用）：tools/live-match.js --hip-cfg 会注入 ---- */
  let OVERRIDE = null;
  function setConfig(cfg){ OVERRIDE = cfg ? Object.assign({}, DEFAULTS, cfg) : null; return OVERRIDE; }
  function getConfig(){ return Object.assign({}, OVERRIDE || DEFAULTS); }

  /* ---- 接触点预测（**与实机 physics.js#physicsStep 逐子步同口径**）----
   * ★ 为什么不再用 SIM.predictMeetZ：它的弹跳判据与实机不一致 ——
   *   实机 physics.js:340-341：
   *     v.y<0 && p.y-BALL_R<=TABLE_TOP && _prev.y-BALL_R>TABLE_TOP-0.05
   *     && |p.x|<=TABLE_W/2+BALL_R*0.6 && |p.z|<=TABLE_L/2+BALL_R*0.6
   *   simcore.predictMeetZ：
   *     v.y<0 && p.y-BALL_R<=TABLE_TOP && |p.x|<=TABLE_W/2 && |p.z|<=TABLE_L/2
   *   差两点：
   *   (a) 实机台面外沿多 0.6·BALL_R = 1.2cm。落台点 z ∈ [1.370, 1.382] 的球
   *       **实机会弹起、预测器不认** ⇒ 拍面深度失去依据 ⇒ 球从拍下穿过
   *       （实测那批漏球帧的球高 p50 = 0.507，还在台面以下）。
   *   (b) 实机要求「上一子步球还在台面之上」，陡降的球实机**不弹**。
   *   下面这份积分器照抄实机：1/120 子步、同一套重力/阻力/Magnus(s×v)/旋转衰减/
   *   弹跳判据/tableBounce 公式，并一路跟到「球到达拍面深度」的那一点。
   *   返回 {ok, x, y, z, tau, inSpd, inVx, bz, tBounce, vzPost, targetZ}。
   *   targetZ = 拍面目标 z（= 落台点 z + padZOffset，夹在 padZMin/Max）。
   */
  const SUB_DT = 1 / 120;     // 实机每帧 2 子步（SIM.subStepsFor(1/60) = 2）
  function predictContact(obs, cfg){
    if(!SIM_) return { ok: false };
    const C = SIM_.C || {};
    const G_ = C.G != null ? C.G : 9.81;
    const AIR_ = C.AIR != null ? C.AIR : 0.10;
    const MAG_ = C.MAGNUS != null ? C.MAGNUS : 0.0032;
    const REST_ = C.REST != null ? C.REST : 0.72;
    const KICK_ = C.SPIN_KICK != null ? C.SPIN_KICK : 0.016;
    const TT = C.TABLE_TOP != null ? C.TABLE_TOP : 0.76;
    const TW = C.TABLE_W != null ? C.TABLE_W : 1.525;
    const TL = C.TABLE_L != null ? C.TABLE_L : 2.74;
    const BR = C.BALL_R != null ? C.BALL_R : 0.02;
    const off = (cfg && cfg.padZOffset != null) ? cfg.padZOffset : 0.35;
    const zmin = (cfg && cfg.padZMin != null) ? cfg.padZMin : 0.95;
    const zmax = (cfg && cfg.padZMax != null) ? cfg.padZMax : 1.60;

    let px = obs.x, py = obs.y, pz = obs.z;
    let vx = obs.vx || 0, vy = obs.vy || 0, vz = obs.vz || 0;
    let sx = obs.sx || 0, sy = obs.sy || 0;
    let t = 0;
    let bounced = false, tB = 0, bz = 0, bvz = 0;
    let targetZ = null, hit = null;

    for(let i = 0; i < 900; i++){
      const prevY = py;
      /* ---- 积分（实机 physicsStep 的前 5 行）---- */
      vy -= G_ * SUB_DT;
      const drag = Math.max(0, 1 - AIR_ * SUB_DT);
      vx *= drag; vy *= drag; vz *= drag;
      const mx = sy * vz, my = -sx * vz, mz = sx * vy - sy * vx;   // s × v（sz=0）
      vx += mx * MAG_ * SUB_DT; vy += my * MAG_ * SUB_DT; vz += mz * MAG_ * SUB_DT;
      px += vx * SUB_DT; py += vy * SUB_DT; pz += vz * SUB_DT;
      const sd = Math.max(0, 1 - 0.05 * SUB_DT); sx *= sd; sy *= sd;
      t += SUB_DT;
      /* ---- 台面弹跳（实机 physics.js:340-341 + tableBounce）---- */
      if(vy < 0 && py - BR <= TT && (prevY - BR) > TT - 0.05
         && Math.abs(px) <= TW / 2 + BR * 0.6 && Math.abs(pz) <= TL / 2 + BR * 0.6){
        py = TT + BR;
        vy = -vy * REST_;
        vz = vz * 0.99 + sx * KICK_;
        vx = vx * 0.985 - sy * KICK_ * 0.6;
        sx *= 0.72; sy *= 0.72;
        if(!bounced){
          bounced = true; tB = t; bz = pz; bvz = vz;
          targetZ = cl(bz + off, zmin, zmax);
        }
      }
      /* ---- 球到达拍面深度的那一点 = 触球点 ---- */
      if(bounced && !hit && pz >= targetZ){
        hit = { x: px, y: py, z: pz, t: t, vx: vx, vy: vy, vz: vz };
        break;
      }
      if(py <= BR && vy < 0) break;                 // 落地
      if(Math.abs(pz) > 4.5 || Math.abs(px) > 3) break;
    }
    if(!hit){ LAST_FAIL.noBounce = true; return { ok: false }; }
    LAST_FAIL.noBounce = false;
    return {
      ok: true,
      x: hit.x, y: hit.y, z: hit.z,
      tau: hit.t,
      inSpd: Math.abs(hit.vz),
      inVx: hit.vx,
      bz: bz,                 // 落台点 z
      tBounce: tB,            // 落台时刻
      vzPost: Math.abs(bvz),  // 落台后的 vz
      targetZ: targetZ,       // 拍面目标 z
    };
  }

  /* ---- 控制器 ----
   * 每侧一个实例（实机 player/ai 各一，训练侧一个）。
   * 状态：这一板是否在飞来、预测接触点、目标落点、换边计数。 */
  function makeController(opts){
    const cfg = Object.assign({}, OVERRIDE || DEFAULTS, opts || {});
    const S = {
      inb: false,        // 当前是否在处理「来球」
      bx: 0, by: PADDLE_Y, bz: PLAYER_Z, tau: 9,
      wide: false, aimT: 0, side: 1, rtop: 0,
      shots: 0, lastTau: 9, reach: 1,
    };

    function reset(){
      S.inb = false; S.bx = 0; S.by = PADDLE_Y; S.bz = PLAYER_Z; S.tau = 9;
      S.wide = false; S.aimT = 0; S.rtop = 0; S.shots = 0; S.lastTau = 9; S.reach = 1;
    }

    /* 主入口：obs(15 字段) → {tx, my, ctrl} */
    function plan(obs){
      const vz = obs.vz || 0;
      const incoming = vz > 0.15;
      const zp = obs.pz != null ? obs.pz : PLAYER_Z;
      const px = obs.px != null ? obs.px : 0;
      const svx = obs.svx || 0;

      /* ── 来球上升沿：锁住这一板的手法与落点目标 ── */
      if(incoming && !S.inb){
        S.inb = true;
        S.shots++;
        S.rtop = (SIM_ && SIM_.relTopOf) ? SIM_.relTopOf(obs.sx || 0, vz) : (obs.sx || 0);
        S.inSpd = Math.abs(vz);
        if(cfg.alternate) S.side = -S.side;
        S.aimLocked = false;
      }else if(!incoming){
        S.inb = false;
        S.aimLocked = false;
      }

      /* ── 接触点：**每帧重算** ──
       * ★ 这是本控制器能不能用的关键。追位律是
       *     dpx/dt = (bx − px) / tau
       * 「时间归一」的纯追踪律：tau 必须在收缩，px 才会收敛到接触点。
       *   早先只在来球第一帧算一次 tau（0.42s 恒定），追位律就退化成
       *   「朝一个固定点匀速走」，球拍到位时球早走了 → 100% 够不到
       *   （实测分点率 0%，全部 lose:out）。 */
      const ct = predictContact(obs, cfg);
      if(ct.ok){
        S.bx = ct.x; S.by = ct.y; S.bz = ct.bz; S.tau = ct.tau; S.hasMeet = true;
        S.bounceZ = ct.bz;
        S.tBounce = ct.tBounce; S.vzPost = ct.vzPost; S.padZ = ct.targetZ;
        S.inVx = ct.inVx;
        /* 来球**触球时**的速度（不是出球瞬间的）：弹跳时上旋 kick 会把 vz 顶高
         * （sx=389 时 +6.2m/s，实测来球 5.4 → 14.6m/s），用出球瞬间的速度会
         * 严重低估「这一板要收多少」。meet 点就是弹起点，速度已是 kick 之后的。 */
        if(ct.inSpd) S.inSpd = ct.inSpd;
      }else{
        /* 退化：线性外推到拍面所在 z 平面 */
        const t = Math.max(0.04, (zp - obs.z) / Math.max(vz, 0.05));
        S.bx = obs.x + (obs.vx || 0) * t;
        S.by = obs.y; S.bz = PLAYER_Z; S.tau = t; S.hasMeet = false;
        S.padZ = null;
      }
      S.lastTau = S.tau;

      /* 落点目标：**方向每帧跟随当前预测**，只有「中球变线用哪一侧」是整板锁定。
       * ★ 早先整板锁定方向，吃了大亏：来球第一帧的预测还远（球带侧旋会拐弯，
       *   实测预测 bx=-0.74 而锁定的 want 却是 +0.46），于是落点纠偏往反方向
       *   拉 —— 挥拍阶段 tx 从 -0.74 跳到 -0.58，把拍子从球上拽开，
       *   92% 的球变成「够不到」（lose:out）。 */
      const wide = Math.abs(S.bx) > cfg.wideThresh;
      S.wide = wide;
      S.want = (wide ? (S.bx < 0 ? -1 : 1) : S.side) * (wide ? cfg.landX : cfg.landXMid);
      /* 记住这一球来自哪一侧 → 空档时预判站到反侧 */
      if(S.bx < -0.12) S.lastSide = -1; else if(S.bx > 0.12) S.lastSide = 1;

      /* ── 无来球：回中待机（带预判站位） ── */
      if(!S.inb){
        let hx = cfg.homeX;
        if(cfg.anticipate && cfg.anticipateX > 0 && S.lastSide){
          /* AI 往玩家的反侧打 → 上一球来过的反侧就是下一球的落点侧 */
          hx = -S.lastSide * cfg.anticipateX;
        }
        return { tx: cl(hx, -X_CLAMP, X_CLAMP), my: cfg.homeMy, ctrl: false };
      }

      /* ── 手法（下旋搓 / 挑 / 常规） ── */
      let my = cfg.myDrive, ctrl = false, isPushCase = false;
      if(S.rtop < cfg.pushRtop){                 // 下旋来球
        if(S.by < cfg.pushHeight){ ctrl = !!cfg.pushCtrl; my = cfg.myPush; isPushCase = true; }
        else { my = cfg.myLift; isPushCase = true; }
      }else if(cfg.mySpeedGain > 0){
        /* 快球回短：来球越快，出球速度上限（pace=paceBase+inSpd·0.3）顶得越死，
         * 固定深度目标就会**打长出界**（实测 fast ball（inVz≈14）时
         * 落点 z=-1.36 正好压在台边 → 全是 lose:hit-floor）。
         * 提高 my 同时做三件事：落点深度变浅、弧线抬高、拍面更靠前（速度略降）。 */
        const t = cl((S.inSpd - cfg.mySpeedRef) / Math.max(cfg.mySpeedSpan, 0.1), 0, 1);
        my = cfg.myDrive + cfg.mySpeedGain * t;
      }
      /* 接近段用浅拍位（触球更高 → 接触窗口放宽），触球前切回出球深度 */
      if(cfg.myApproach > 0 && !isPushCase && S.tau > cfg.mySwitchTau){
        my = cfg.myApproach;
      }
      my = cl(my, 0.15, 0.95);

      /* ── 落点控制（闭环）──
       * 玩家的落点公式（tt-player / input-sim 同一份）：
       *     aimX = AIM.xFromPos * 拍位x + AIM.xFromSwipe * 拍速x
       * 拍位被接触窗口锁在球附近（±0.29~0.34m），所以「主动变线」只能靠
       * 触球前那一瞬的拍速来补：拍速是 0.30 的落点系数。
       *
       * ★ 但 aimX 只是**意图**，不是**落点**：resolveHit 里出球速度 =
       *   0.78·intent + 0.22·物理分量，物理分量的横向速度（来球 vx 残留 +
       *   偏心量 offX·1.2）会把落点整体带偏。实测：宽球时自然 aimX 被追击
       *   速度顶到 >0.9（被夹到 0.62），落点 x 落在 ±0.75~0.76（台边 0.7625）
       *   → 23% 的球直接飞出边线（reason='floor'）。
       *   所以这里做**落点闭环**：先估出「意图→落点」的偏移，再把意图反向补偿。 */
      const aimNow = AIM.xFromPos * px + AIM.xFromSwipe * svx;
      const offX = cl((S.bx - px) / 0.10, -1, 1);
      const physVx = 0.22 * (S.inVx || 0) + 1.2 * offX;
      const intentVx = (aimNow - S.bx) / cfg.aimTau;
      const shift = 0.22 * (physVx - intentVx) * cfg.aimTau;
      const aimT = cl(S.want - shift * cfg.aimShiftGain, -0.62, 0.62);
      let tx;
      const tau = S.tau;
      if(tau > cfg.swingLead){
        /* 追位：**位置律**（tx 直接指向预测触球点 bx）。
         * 早先用的是速度前馈律 tx = px + (bx−px)/(τ·PACE)：它在连续极限下
         * 等价于「以恒定速度 C = d0/τ0 移动并恰好在触球时刻到位」，
         * 于是**到位时拍速仍是 C**（实测 1~2 m/s）。而落点公式里拍速占
         * 0.30 的权重：aim = 0.55·bx + 0.30·v → 宽球 bx=0.6、v=1.5 时
         * aim=0.78（被夹到 0.62），落点 x 顶到台边 → 23% 直接出边线。
         * 位置律让拍子「先到位、后停住」，到位时拍速≈0，落点回到
         * 0.55·bx（宽球 ≈0.33），稳稳在台内。 */
        tx = cl(S.bx + cfg.posLead, -X_CLAMP, X_CLAMP);
      }else{
        /* 挥拍阶段：位置保持在球附近，速度纠偏到目标落点。
         * v = (aimT − 0.55·px)/0.30  →  落点闭环 */
        const hold = cl(S.bx - px, -cfg.holdClamp, cfg.holdClamp);
        const vA = (aimT - AIM.xFromPos * px) / AIM.xFromSwipe;
        const vCmd = cl(vA, -cfg.maxSwing, cfg.maxSwing);
        tx = px + hold + vCmd / PACE;
      }

      /* ★ 独立拍面深度通道：pz = 预测落台点 z + padZOffset。
       * 与出球深度（my）完全解耦 —— 这正是 M1 剩下的唯一硬瓶颈：
       * 够不到的球，球高 p50 = 0.569（还在台面以下 = 球在拍面深度之前没弹起，
       * 从拍下穿过去了），而拍面 z 原先是由 my 推出的。
       *
       * ★★ z 相位对齐（padZPhase）：球弹起后每帧 z 步进 s = vz/60（实测
       *   0.14~0.23m），而接触判据的 z 容差只有
       *   PAD_HD + 2·BALL_R + fitZ ≈ 0.09~0.11m。**s 接近容差的 2 倍**，
       *   所以拍面深度若与球的 z 序列不同步，球会「跳过」接触窗口
       *   （swept 与 prox 同时不成立 → 球直接穿过拍面 → 漏球）。
       *   球在测试帧上的 z = 落台z + r + k·s，r = 落台到下一个帧边界的余量，
       *   k = 整数帧号。控制器把拍面深度吸附到这串栅格上（k 取最接近
       *   padZOffset 的整数），触球时球正好在拍面正中。 */
      let padZ = null;
      if(cfg.padZOffset >= 0 && S.padZ != null && S.hasMeet){
        padZ = cl(S.padZ, cfg.padZMin, cfg.padZMax);
        if(cfg.padZPhase && S.vzPost > 0.2){
          /* z 相位对齐（默认关，实机 40 局实测 63.8% < 不对齐的 68.2%）：
           * 把拍面深度吸附到「球弹起后每帧 z 步进 s=vz/60」这条栅格上。 */
          const s = S.vzPost / 60;
          const tb = S.tBounce != null ? S.tBounce : 0;
          const nextFrame = Math.ceil(tb * 60 + 1e-6) / 60;
          const r = Math.max(0, nextFrame - tb) * S.vzPost;
          const k = Math.max(1, Math.round((cfg.padZOffset - r) / s));
          padZ = cl(S.bounceZ + r + k * s, cfg.padZMin, cfg.padZMax);
        }
      }

      return { tx: cl(tx, -X_CLAMP, X_CLAMP), my: cl(my, 0, 1), ctrl: ctrl, pz: padZ };
    }

    /* 发球：HIP 的发球是固定动作（上旋、中等力量、居中） */
    function serve(){
      return { tx: cl(cfg.homeX, -X_CLAMP, X_CLAMP), my: cfg.homeMy, ctrl: false,
               top: true, power: 0.6 };
    }

    return { plan, serve, reset, get state(){ return S; }, get cfg(){ return cfg; } };
  }

  /* ---- 训练侧脑（playInputPoint 的 brain.act 契约） ---- */
  function makeBrain(opts){
    const ctl = makeController(opts);
    return {
      act(obs){ return ctl.plan(obs); },
      credit(){},
      reset(){ ctl.reset(); },
      _ctl: ctl,
    };
  }

  return { makeController, makeBrain, setConfig, getConfig, DEFAULTS, predictContact, LAST_FAIL,
           get constants(){ return { PLAYER_Z, X_CLAMP, PADDLE_Y, PACE, SVCAP, AIM, AIM_XMAX, ZRANGE, WIN_LO, WIN_HI }; } };
})();

if(typeof module !== 'undefined' && module.exports) module.exports = { HIP_SKILL };
