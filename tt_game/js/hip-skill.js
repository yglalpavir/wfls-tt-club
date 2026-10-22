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
    /* ★ aimNat：落点目标用「自然落点 + 偏移」表达（1），还是老的「绝对落点 ±landX」（0）。
     *   自然落点 = 0.55·拍位x + 0.30·拍速x（不挥拍时的落点）。
     *   落点公式里拍位被接触窗口锁在球附近（±0.14m）⇒ 绝对落点只能靠挥拍实现，
     *   而挥拍会让拍子在触球前漂移 ≈0.065·vCmd（vCmd 上限 0.8 ⇒ 漂移 0.052m）
     *   ⇒ 「为了控落点而挥拍」≈ 拿够球率换落点。实测（vs hell，40 局）：
     *   绝对落点 ±0.55 ⇒ 69.6%；自然落点 ±0.30 ⇒ 87.9%。 */
    aimNat:      1,      // 1 = 落点目标 = 自然落点 + landBias
    landBias:    0.0,    // 自然落点的偏移（米）；正 = 往 +x 打
    /* ★ latchAim：挥拍阶段锁定落点目标（1 = 开，0 = 每帧跟随自然落点）。
     *   自然落点 = 0.55·拍位x + 0.30·拍速x，拍子在挥拍阶段还在动 ⇒ 目标每帧漂
     *   ⇒ 挥拍命令抖 ⇒ 实际落点散布（p10 −0.607 / p50 −0.231 / p90 0.700）。 */
    latchAim:    0,
    /* ★ aimForce（诊断用）：强制**绝对**落点目标。null = 正常走上面两条路径；
     *   给数值则每球都朝这个绝对 x 打（无视自然落点、也无视意图）。
     *   用途：在**实机**上量「玩家侧到底能不能控落点」——
     *   配合 live-match --hip-probe 打印的落点 x 分布，
     *   如果请求 ±0.55 而落点分布几乎不动 ⇒ 落点不可控 ⇒ L2 不该学落点。 */
    aimForce:    null,
    /* ★ aimForceAlt：每板交替强制绝对落点 ±v（诊断用，见 aimForce）。 */
    aimForceAlt: null,
    /* ★ landTarget（正式）：绝对落点目标（米），覆盖 aimNat/landBias/意图三条路径。
     *   null = 不启用（走自然落点）。实测见 plan() 里的对照表：
     *   自然落点 70.3% / 目标 +0.55 74.6% / 目标 0.00 79.7% / 目标 −0.55 68.1%（vs hell，30 局/组）。
     *   机理：「回球到球来的地方」= 把球送回对手已经站着的区域；
     *   固定落点才能逼对手跑动。 */
    landTarget:  null,
    /* ★ landCorner（正式）：打「对手的反侧角」（1=开）。
     *   限速下模型防守被打穿 ⇒ 胜负改由落点决定；实机（cap 2.0, 40 局同种子）：
     *   自然落点 47.8%  vs  固定 +0.62 角 83.1%（+35.3pp）。
     *   固定角有单侧风险 ⇒ 本旋钮按对手当前站位（obs.ox）选反侧。 */
    landCorner:  0,
    landCornerV: 0.62,   // 反侧角的横向目标（米）
    /* ★ landAuto（正式，默认 'auto'）：限速下的「固定角落点」战术。
     *   'auto' = **只在开了移动预算（cap != null）时生效** ⇒ 不限速路径逐位不变（零回归）；
     *   'pos' / 'neg' = 强制 +x / −x 角（不限速也生效，诊断用）；
     *   0 / 'off' = 关。
     *   实机（cap 2.0，40 局/组，同种子，vs hell）：
     *     自然落点 47.8%  |  固定 +0.62 角 83.1%（+35.3pp）  |  固定 −0.62 角 35.5%
     *     |  自适应「打对手反侧角」 51.2%
     *   ⇒ ① 角落的价值高度**单侧**（+x 侧好、−x 侧差）；
     *     ② 自适应版本只有 +3.4pp，因为对手大多数时间站在中间 ⇒ 选边近乎随机 ⇒ 收益被平均掉；
     *     ③ 只在**没有意图**（纯 L1 路径）时生效 —— L2 路径的落点由学生自己决定，
     *        动作集里已经有绝对角落选项（hip-choice 的 abs-r55 等），不需要这里插手。 */
    landAuto:    'auto',
    landAutoV:   0.62,   // 固定角落的横向目标（米）
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
    /* ★ maxSwing 必须压小：挥拍命令 tx = px + hold + vCmd/PACE 会让拍子在
     *   触球前漂移 ≈ (vCmd/18)(1−e^{−18T}) ≈ 0.065·vCmd。vCmd=2.0 ⇒ 漂移 0.13m
     *   ≈ 整个接触窗口（±0.14m）⇒ 「为了控落点而挥拍」直接等于「够不到」。
     *   0.8 ⇒ 漂移 ≤0.05m，落点可调范围仍有 ±0.18~0.26m。 */
    maxSwing:    0.8,    // 拍速上限（命令值）
    /* ★ 落点伺服（M3）：0 = 关（保持前馈行为），1 = 开。
     * 把「这一拍实际落在哪」伺服到「我们想要它落在哪」：把剩下的 τ 前向仿真到
     * 触球（补上追位滞后项）→ 用实机同一份 resolveHit+simulateFull 算落点 →
     * 误差反解 aimT → 重解挥拍命令。
     * ★ 为什么必须补「追位滞后项」：落点 = 0.55·拍位x + 0.30·拍速x，而触球瞬间
     *   拍速 ≈ 18·(球x − 拍位x) + vCmd ⇒ 落点 ≈ 0.55·球x + 4.85·(球x−拍位x) + 0.30·vCmd。
     *   追位残差（恒为正，因为拍子总是落后球）以 4.85 的系数支配落点，
     *   挥拍只有 0.30 ⇒ 「往左挥」被完全抵消（落点控制单侧化，见文档 §1.10）。
     *   伺服把这一项在模型里消掉 ⇒ 落点控制恢复对称。
     * 实机 A/B（vs hell，40 局/组，maxsec 120，同种子配对）：
     *   伺服关 94.1%（自己出界·下网 12）/ 迭代 2 次 95.2%（8）/ **迭代 3 次 98.3%（3）** /
     *   迭代 4 次 97.8%（4）。⇒ 默认取 3。 */
    servo:       1,      // 开关
    servoIter:   3,      // 每帧迭代次数（挥拍阶段 3 帧）
    servoGain:   1.28,   // 落点误差 → aim 的修正增益（1/blendC，block 模式 0.78）
    servoTol:    0.03,   // 误差小于它就收敛（米）
    /* L2（意图层）提议的安全闸门 */
     intentMyLo:  0.50,   // 意图给的 my 只能落在这个安全带（实机扫描：0.42 时 67% 的球自己出界，0.50/0.58 都是安全点）
    intentMyHi:  0.58,
    intentMyFixed: 0.54,   // ≥0 时固定 my（实机扫描「意图路径」的深度带用；-1 = 用意图给的深度）
    intentAimR:  0.30,   // 意图落点与「自然落点」的最大偏移（超出就回落）
    intentVerify:1,      // 触球前用 resolveHit+simulateFull 复核（非法就回落）
    intentVerifyTau: 0.05,   // 复核触发时刻（触球前多少秒内做一次，每板只判一次）
    intentVerifyMargin: 0.0, // 复核时的台面安全余量（落点离台边太近就丢弃意图）
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
    /* ── 长相持「求速」打法（2026-10-22）────────────────────────────────
     * 背景（实机测量，tools/live-match.js 的 rally 直方图，cap 2.0 + 固定 +x 角）：
     *   平均相持 **25.8 板**，68 分里 **43 分超过 15 板**。
     *   ⇒ 模型赢是赢了，但一分要磨二十几板 —— 这就是「相持过长」的问题。
     * 做法：相持超过阈值后改用更冲的打法（my 调小 = 弧线更平更快；可再给一点前冲），
     *   让对手来不及舒服地回球 ⇒ 这一分早点结束。
     * 口径：S.shots = 玩家接到的球数 ⇒ 总板数 ≈ 2·S.shots+1（发球算第 1 板）。
     * 默认关闭（rallyAfter=0）⇒ 逐位不变；先用 --grid 扫出收益再决定是否上线。 */
    rallyAfter:  0,       // 0 = 关；>0 = 总板数阈值（超过就切「求速」打法）
    rallyMy:     0.50,    // 长相持时的 my（比 myDrive 小 ⇒ 弧线更平、球更快更冲）
    rallyFwd:    0,       // 长相持时的前冲量 fwd（0 = 不额外前冲）
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
    /* ★ padZMode：拍面深度的目标 = 弹跳后轨迹的**顶点**（1），还是老的
     *   「落台点 + 固定偏移」（0）。
     *   机理：接触窗口的**横向**容差 = PAD_HW + BALL_R + fitH，而 fitH 只在
     *   球高 > TABLE_TOP+0.13 = 0.89 时才放宽（0.026 → 0.186 ⇒ x 容差
     *   0.146m → 0.306m，翻倍）。实机触球高度 p50 = 0.83（全是低球）⇒
     *   一直吃最窄窗口，而「够不到」的横向差 p90 只有 0.107m —— 差一点点被拒。
     *   弹跳后轨迹的顶点是**每颗球能达到的最高点**，把拍面放到顶点所在的 z 上，
     *   就是逐球拿最大接触高度（固定偏移做不到：球的弧线高度逐球不同）。 */
    padZMode:    0,      // 0 = 固定偏移，1 = 顶点击球
    apexMaxDy:   0.16,   // 顶点比拍心高过这个值就放弃（拍子够不着）
    padZMin:     0.95,   // 拍面 z 下限
    padZMax:     1.60,   // 拍面 z 上限
    padZFixed:   null,   // 拍面深度钉死值（null = 用预测落台点 + padZOffset）
    contactY:    null,   // 目标接触高度（null = 不启用；0.92 ≈ 刚好进「高球宽窗口」）
    /* ★ postBounceFix：修「弹起后预测器去找第二次弹跳」这个真 bug。
     *   球在玩家半台弹起后（obs.bounced=1 且仍朝玩家飞，vz>0.15），预测器会
     *   继续去找「下一次落台」= 球升到顶再落回来的第二次弹跳，于是落台点 /
     *   接触点 / 拍面深度全错：合成自测里预测落台 z=1.295（真实 0.248）、
     *   拍面目标被赶到 z=1.60 ⇒ 球从拍子前面飞过去 ⇒「够不到」；
     *   实机探针里未回击球的「预测落台 z 误差」平均 −0.206。
     *   修法：记下「弹起前」预测出的玩家半台落台点（PRED_BZ），弹起后直接复用，
     *   并把拍面目标抬到「球的当前 z」，免得拍子往回跑。
     *   0 = 关（回到旧的错误行为，用于 A/B）。 */
    postBounceFix: 1,
  /* chaseBounce：追位目标是「落台点 x」还是「触球点 x」。
   * 0 = 触球点（旧行为）；1 = 落台点。
   * 限速下的意义：落台点早得多就知道 ⇒ 模型能提前站好 ⇒ 触球时拍速≈0
   * ⇒ 不触发「挥拍冲量放大球速」（限速下 out 爆炸的主因）。 */
  chaseBounce: 0,
  /* swingLaw：挥拍阶段的目标律。0 = 旧（px+hold+vCmd/PACE，满速冲进球）；
   * 1 = 位置律（目标是接触点 bx ⇒ 减速进入 ⇒ 触球拍速≈0）。 */
  swingLaw: 0,
  /* swingSwipe：出球核的 swipe 用哪一个。
   * null = 真实拍速（旧行为）；1 = 故意挥拍速度 S.sw（跑位与挥拍分离）。
   * 只有开了移动预算才需要它（限速下满速冲量会把球速放大 50%）。 */
  swingSwipe: 'auto',
  /* swingFwd：出球核的 fwd（前冲力度）用哪一个。
   * null = 真实拍面 z 速度（旧行为）；数字 = 故意前冲力度上限（0~1）。
   * ★ 与 swingSwipe 同源的第二个泄漏点：resolveHit 的 isLoop 判据是
   *   `|swipe|>1.1 && fwd>0.35` ⇒ 限速下「拍面俯冲速度」也算成前冲力度，
   *   这一板被误判成拉球（arc 1.46 / pace 7 / vz -7）⇒ 球必然冲过端线。
   *   复算与实机逐位吻合：inSpd 3~10 + fwd≥0.7 + swipe -1.97
   *   ⇒ mode=loop, vz=-7, 落点 z=-2.7~-3.0（floor）＝ 实机 ovz -6.50 / 落点 -2.93。
   *   ⇒ 限速下把 fwd 也从「跑位」里剥出来（0 = 纯借力，不主动前冲）。 */
  swingFwd: 'auto',
    /* ★ 深度安全网（depthSafety）：把「这一拍会落在多深」夹进安全带。
     *   背景（第六个真 bug 修完之后）：够不到已清零，**失分 100% 是「自己出界/下网」**。
     *   出界机理：出球深度 my 与入球速度/接触高度耦合 —— 来球越快、接触越低，
     *   resolveHit 的 arcFit 越小 ⇒ 弧线越平 ⇒ 落点越深 ⇒ 撞端线出界。
     *   做法：用实机同一份 resolveHit + simulateFull 复算这一拍的落点，
     *   若落点深度超界，就把 my 往「更浅」的方向拉
     *   （my↑ ⇒ aimZ = −1.24+0.74·my² 更浅，但 arcMouse = −0.28+0.58·my 同时更高 ⇒ 弧线更平？⇒ 更长；
     *   两者几乎抵消 —— 实测 my 从 0.30 扫到 0.95，落点深度只差 0.23m 且非单调）。
     *   ⇒ 这条网只在「不限速」口径下有效（出界 12→8）；限速口径下默认关（depthSafetyCapped=0）。
     *   与第三道闸门的区别：闸门是**否决**（落点非法就打回自然落点），
     *   而自然落点本身也可能出界；这里是**修正**（把 my 拉到合法）。 */
    depthSafety: 1,       // 1 = 开（实机 A/B：off 92.3% / on 93.1% / on+depthMax1.15 94.1%，
                           //     失分 out 12→10→8 单调下降；vs hell，40 局/组，同种子）
    depthTau:   0.05,     // 触球前多少秒做这次修正（与第三道闸门同口径）
    depthMax:   1.15,     // 落点深度上限（端线 1.37，留 0.22 余量）
    depthMin:   0.52,     // 落点深度下限（太短会下网）
    depthGain:  1.60,     // my 的修正增益（d(my)/d(depth) ≈ −1.6）
    depthIter:  3,        // 迭代次数
    myMin:      0.30,     // 修正时 my 的下限（方向修对后要留出下调空间：my↓ ⇒ 弧线更平 ⇒ 落点更近）
    myMax:      0.72,     // 修正时 my 的上限
    depthSafetyCapped: 1, // ★ 有限速时是否仍开这条修正网（默认开：方向修对之后才有效）
    depthLatch:   0,      // ★ 修正是否**跨帧锁存**（默认关：实测锁存有害 83.1%→55.1%，
                           //     因为这条网的落点估计偏悲观（dLand p90=3.5 vs 真实 ~1.0）
                           //     ⇒ 锁存会把好球一起拉歪；见「第十个真 bug」）
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
  /* 弹跳后的轨迹缓冲（模块级复用，避免每帧分配对象） */
  const TRAJ_CAP = 800, TRAJ_STRIDE = 7;
  const TRAJ = new Float64Array(TRAJ_CAP * TRAJ_STRIDE);
  /* 模块级：最近一次「球弹起**之前**」预测出的落台 z（玩家半台，pz > 0）。
   * ★ 为什么需要它：球在玩家半台弹起后（obs.bounced=1），预测器如果继续
   *   去找「下一次弹跳」，找到的是**第二次**弹跳（球升到顶再落回来），
   *   于是落台点/接触点/拍面深度全错。实测（合成自测）：
   *     弹起前：落台 z 预测 0.248（真实 0.248 ✓）拍面目标 0.95 接触点 x −0.236
   *     弹起后：落台 z 预测 1.295（真实 0.248 ✗）拍面目标 1.60 接触点 x −0.139
   *   ⇒ 慢速短球（vz≈2.5，弹起后要飞 0.33s）整段都在用这份垃圾预测，
   *     拍面被赶到 z=1.6，球从拍子前面过去了 ⇒ 「够不到」。
   *   弹起后应当**不再找弹跳**，直接沿当前（弹起后的）飞行轨迹找接触点，
   *   落台点沿用弹起前预测出来的 PRED_BZ。 */
  let PRED_BZ = null;
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
    const PAD_HD = C.PAD_HD != null ? C.PAD_HD : 0.03;
    const off = (cfg && cfg.padZOffset != null) ? cfg.padZOffset : 0.35;
    const zmin = (cfg && cfg.padZMin != null) ? cfg.padZMin : 0.95;
    const zmax = (cfg && cfg.padZMax != null) ? cfg.padZMax : 1.60;
    const apexMode = (cfg && cfg.padZMode != null) ? cfg.padZMode : 0;
    const apexMaxDy = (cfg && cfg.apexMaxDy != null) ? cfg.apexMaxDy : 0.16;

    let px = obs.x, py = obs.y, pz = obs.z;
    let vx = obs.vx || 0, vy = obs.vy || 0, vz = obs.vz || 0;
    let sx = obs.sx || 0, sy = obs.sy || 0;
    let t = 0;
    let bounced = false, tB = 0, bz = 0, bvz = 0, bxp = 0;
    let nTraj = 0;

    /* ★ 球已经在玩家半台弹起（obs.bounced=1）且仍在飞来 ⇒ **不要再找弹跳**。
     *   规则（rules.js:75）：接球方必须等球在己方半台弹起后才能击球，
     *   所以 obs.bounced=1 之后球就是「可击打状态」；此时预测器再去找
     *   「下一次落台」找到的是**第二次**弹跳（球升到顶再落回来），
     *   整份预测（落台点 / 接触点 / 拍面深度）就全错了。
     *   实测（合成自测，慢速短球 vz=2.5）：
     *     弹起前：落台 z 预测 0.248（真实 0.248 ✓）拍面目标 0.95 接触点 x −0.236
     *     弹起后：落台 z 预测 1.295（真实 0.248 ✗）拍面目标 1.60 接触点 x −0.139
     *   ⇒ 慢球整段都在用这份垃圾预测：拍面被赶到 z=1.6，球从拍子前面过去了
     *     ⇒「够不到」。弹起后应当沿当前飞行轨迹直接找接触点，
     *     落台点沿用弹起前预测出来的 PRED_BZ。
     *   旋钮 postBounceFix（默认 1）控制这条路径，方便 A/B。 */
    const already = !!(cfg && cfg.postBounceFix !== 0)
                 && !!(obs && obs.bounced) && (obs.vz || 0) > 0.15;
    if(already){
      bounced = true;
      bz = (PRED_BZ != null) ? PRED_BZ : pz;
      bvz = vz;
      bxp = px;
    }

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
      if(!already && vy < 0 && py - BR <= TT && (prevY - BR) > TT - 0.05
         && Math.abs(px) <= TW / 2 + BR * 0.6 && Math.abs(pz) <= TL / 2 + BR * 0.6){
        py = TT + BR;
        vy = -vy * REST_;
        vz = vz * 0.99 + sx * KICK_;
        vx = vx * 0.985 - sy * KICK_ * 0.6;
        sx *= 0.72; sy *= 0.72;
        if(!bounced){ bounced = true; tB = t; bz = pz; bvz = vz; bxp = px;
          /* 只记玩家半台（pz>0）的落台点：球飞向对手那边时预测到的落台
           *   在对手半台，不能拿来当「这一板」的落台参考。 */
          if(pz > 0) PRED_BZ = pz;
        }
      }
      /* ---- 记录弹跳后的整条轨迹（顶点/穿越点都在里面找）---- */
      if(bounced && nTraj < TRAJ_CAP){
        const o = nTraj * TRAJ_STRIDE;
        TRAJ[o] = px; TRAJ[o+1] = py; TRAJ[o+2] = pz;
        TRAJ[o+3] = vx; TRAJ[o+4] = vy; TRAJ[o+5] = vz; TRAJ[o+6] = t;
        nTraj++;
      }
      if(py <= BR && vy < 0) break;                 // 落地
      if(Math.abs(pz) > 4.5 || Math.abs(px) > 3) break;
    }
    if(!bounced || nTraj === 0){ LAST_FAIL.noBounce = true; return { ok: false }; }
    LAST_FAIL.noBounce = false;

    /* ---- 顶点（弹跳后轨迹的最高点）----
     * ★ 为什么要在顶点击球：接触窗口的**横向**容差
     *   PAD_HW + BALL_R + fitH，其中 fitH 只在球高 > TABLE_TOP+0.13 = 0.89
     *   时才放宽（0.026 → 0.186，即 x 容差 0.146m → 0.306m，翻倍）。
     *   实机触球高度 p50 = 0.83（全是低球）⇒ 一直吃最窄的窗口，
     *   而「够不到」的横向差 p90 只有 0.107m —— 差一点点就被拒。
     *   弹跳后球的最高点是**每一颗球能达到的最大高度**，把拍面放到
     *   顶点所在的 z 上，就能逐球拿到最大接触高度（而不是固定偏移）。 */
    let ai = -1;
    for(let i = 0; i < nTraj; i++){
      const y = TRAJ[i * TRAJ_STRIDE + 1];
      if(ai < 0 || y > TRAJ[ai * TRAJ_STRIDE + 1]) ai = i;
    }
    const apexY = ai >= 0 ? TRAJ[ai * TRAJ_STRIDE + 1] : 0;
    const apexZ = ai >= 0 ? TRAJ[ai * TRAJ_STRIDE + 2] : 0;

    /* ---- 目标拍面深度 ---- */
    let crossZ = cl(bz + off, zmin, zmax);   // 球心穿过的平面
    /* ★ 弹起后：球若已经越过理想接触深度（obs.z > crossZ），
     *   目标深度改成「球当前 z」——否则拍子会往回跑，球从拍子前面飞过去。
     *   （慢速短球最典型：理想深度 0.95，球从 0.25 一路飞来。） */
    if(already && obs.z > crossZ) crossZ = cl(obs.z, zmin, zmax);
    /* ★ padZFixed：把拍面深度**钉死**（诊断/简化用）。
     *   背景：弹跳探针显示「回击失败」的球 100% 是**拍面深度没赶到**
     *   （短球 vz≈2.55 时球从弹跳到拍面平面只要 8 帧，而拍面每帧只挪 21%
     *   ⇒ 追不上），而几何上固定深度也能保证接触高度在窗口内：
     *   固定 1.35 时短/中/深三类球的接触高度约 0.89/0.89/0.80，
     *   全部落在 [0.735, 1.085] 内，且接触更高 ⇒ 弧线更平 ⇒ 更不容易出界。 */
    const fixedZ = (cfg && cfg.padZFixed != null) ? cfg.padZFixed : null;
    if(fixedZ != null) crossZ = cl(fixedZ, zmin, zmax);
    let targetZ = crossZ;                   // 拍子的虚拟 z（与老口径一致：targetZ = crossZ）
    let useApex = false;
    /* ★ contactY：按**目标接触高度**选拍面深度（比 padZFixed 更有机理）。
     *   接触窗口的横向容差 fitH 只在球高 > TABLE_TOP+0.13 = 0.89 时才放宽
     *   （0.026 → 0.186 ⇒ x 容差 0.146m → 0.306m，翻倍），而且高球还有
     *   +1.2 的磁吸增益（magnetStep: high ? 1.2 : 0）⇒ **接触越高越好接**。
     *   实机触球高度 p50 = 0.833（永远吃最窄窗口），而横向误差 p90 = 0.107m
     *   已接近最窄窗口的 0.146m ⇒ 差一点点就被拒。
     *   做法：在弹跳后的轨迹里找「球第一次升到 contactY」的那个 z，
     *   把它当拍面深度 ⇒ 接触高度就正好是 contactY（在球够得到的范围内）。
     *   够不到时（球根本没升到那么高）自动回落默认口径。 */
    let useContactY = false;
    const contactY = (cfg && cfg.contactY != null) ? cfg.contactY : null;
    if(contactY != null && ai >= 0){
      let hi2 = -1;
      for(let i = 1; i < nTraj; i++){
        if(TRAJ[i * TRAJ_STRIDE + 1] >= contactY){ hi2 = i; break; }
      }
      if(hi2 > 0){
        const o1 = (hi2 - 1) * TRAJ_STRIDE, o2 = hi2 * TRAJ_STRIDE;
        const y1 = TRAJ[o1 + 1], y2 = TRAJ[o2 + 1];
        const f = y2 > y1 ? (contactY - y1) / (y2 - y1) : 0;
        const zc = TRAJ[o1 + 2] + (TRAJ[o2 + 2] - TRAJ[o1 + 2]) * f;
        crossZ = cl(zc, zmin, zmax);
        targetZ = crossZ;
        useContactY = true;
      }
    }
    if(apexMode && ai >= 0 && !useContactY){
      /* 顶点在拍子够得着的范围内，且顶点的 z 没超出拍子行程 */
      const apexOk = apexY <= PADDLE_Y + apexMaxDy && apexY >= PADDLE_Y - 0.22
                  && apexZ + PAD_HD >= zmin && apexZ + PAD_HD <= zmax;
      if(apexOk){
        crossZ = apexZ;
        targetZ = cl(apexZ + PAD_HD, zmin, zmax);
        useApex = true;
      }
    }
    /* ---- 找球心穿过 crossZ 的那一刻 ---- */
    let hi = -1;
    for(let i = 0; i < nTraj; i++){
      if(TRAJ[i * TRAJ_STRIDE + 2] >= crossZ){ hi = i; break; }
    }
    if(hi < 0){ LAST_FAIL.noBounce = true; return { ok: false }; }
    /* 线性插值到 crossZ 精确位置 */
    let hx, hy, hz, hvx, hvy, hvz, ht;
    if(hi === 0){
      const o = 0;
      hx = TRAJ[o]; hy = TRAJ[o+1]; hz = TRAJ[o+2];
      hvx = TRAJ[o+3]; hvy = TRAJ[o+4]; hvz = TRAJ[o+5]; ht = TRAJ[o+6];
    }else{
      const o1 = (hi - 1) * TRAJ_STRIDE, o2 = hi * TRAJ_STRIDE;
      const z1 = TRAJ[o1+2], z2 = TRAJ[o2+2];
      const f = z2 > z1 ? (crossZ - z1) / (z2 - z1) : 0;
      const g = f < 0 ? 0 : (f > 1 ? 1 : f);
      hx = TRAJ[o1]   + (TRAJ[o2]   - TRAJ[o1])   * g;
      hy = TRAJ[o1+1] + (TRAJ[o2+1] - TRAJ[o1+1]) * g;
      hz = crossZ;
      hvx = TRAJ[o1+3] + (TRAJ[o2+3] - TRAJ[o1+3]) * g;
      hvy = TRAJ[o1+4] + (TRAJ[o2+4] - TRAJ[o1+4]) * g;
      hvz = TRAJ[o1+5] + (TRAJ[o2+5] - TRAJ[o1+5]) * g;
      ht  = TRAJ[o1+6] + (TRAJ[o2+6] - TRAJ[o1+6]) * g;
    }
    return {
      ok: true,
      x: hx, y: hy, z: hz,
      tau: ht,
      inSpd: Math.abs(hvz),
      inVx: hvx,
      vel: { x: hvx, y: hvy, z: hvz },   // 触球瞬间的球速（复核出球用）
      bz: bz,                 // 落台点 z
      bounceX: bxp,           // ★ 落台点 x（限速下用来「提前站位」，见 chaseBounce）
      tBounce: tB,            // 落台时刻
      vzPost: Math.abs(bvz),  // 落台后的 vz
      targetZ: targetZ,       // 拍面目标 z
      apexY: apexY,           // 弹跳后轨迹的最高点高度
      apexZ: apexZ,           // 最高点所在的 z
      useApex: useApex,       // 是否采用了「顶点击球」
      useContactY: useContactY, // 是否采用了「按目标接触高度选深度」
      cty: hy,                // 预测接触点高度（= 窗口判据用的球高）
    };
  }

  /* ---- 意图复核：L2 提议的出球在**预测接触点**上真的合法吗？----
   * 用实机同一份出球核（SIM.resolveHit）+ 同一份轨迹校验（SIM.simulateFull）
   * 把「这一拍按这个意图打出去会落在哪、会不会出界」算出来。
   * 非法（出界/下网）就丢弃 L2 的提议，回落 L1 的默认 —— 这就是
   * 「L2 只提议、L1 裁决」的第二道闸门。 */
  function verifyIntent(ctl, ctx, rng){
    if(!SIM_ || !SIM_.resolveHit || !SIM_.simulateFull) return true;
    const aimZ = AIM.zDeep + (AIM.zShort - AIM.zDeep) * ctl.my * ctl.my;
    let r;
    try{
      r = SIM_.resolveHit({
        stroke: 'forehand',
        pos: { x: ctx.bx, y: ctx.by, z: ctx.bz },
        vel: ctx.vel || { x: ctx.vx || 0, y: ctx.vy || 0, z: ctx.vz || 0 },
        spin: { x: ctx.sx || 0, y: ctx.sy || 0, z: 0 },
        swipe: ctx.svx || 0,
        fwd: SIM_.fwdOf ? SIM_.fwdOf(ctx.svz || 0) : 0,
        mouseNy: ctl.my,
        aim: { x: ctl.aimX, z: aimZ, gx: ctx.px },
        ctrlHold: !!ctl.ctrl,
        dir: -1, applyArcAdj: true, receive: false, rng: rng || Math.random,
      });
    }catch(e){ return true; }
    if(!r || !r.outVel) return false;
    let land;
    try{
      land = SIM_.simulateFull({ x: ctx.bx, y: ctx.by, z: ctx.bz }, r.outVel, 'player',
                                { x: r.spin.x, y: r.spin.y, z: 0 }, rng || Math.random);
    }catch(e){ return true; }
    if(!land || !land.ok) return false;
    const L = land.landing || { x: 0, z: 0 };
    /* 台面余量：横向半宽 0.7625，纵向半长 1.37（再留一点安全余量） */
    const mg = ctx.margin != null ? ctx.margin : 0;
    if(Math.abs(L.x) > 0.7625 - 0.01 - mg || Math.abs(L.z) > 1.37 - 0.01 - mg) return false;
    ctx.landX = L.x; ctx.landZ = L.z;
    return true;
  }

  /* ---- 落点伺服（M3）----
   * 目标：让「这一拍**实际**会落在哪」等于「我们**想要**它落在哪」。
   *
   * 为什么需要：落点公式是
   *     落点 ≈ 0.55·拍位x + 0.30·拍速x
   * 而触球瞬间的拍速并不由挥拍命令 vCmd 单独决定：
   *     拍速(触球) ≈ 18·(球x − 拍位x) + vCmd      ← 追位滞后项主导
   * 前馈式的 vCmd = (目标 − 0.55·拍位x)/0.30 漏掉了滞后项 ⇒ 固定落点目标会带
   * 系统性偏移（实机探针：请求恒定 0，实际落点中位 +0.376）。
   *
   * 做法（只在挥拍阶段做，一分球 3 帧）：
   *   1) 用 tt-player 同一份 padControl 动力学把剩下的 τ 前向仿真到触球，
   *      得到触球瞬间的拍位/拍速（含滞后项）；
   *   2) 用实机同一份 resolveHit + simulateFull 算出这一拍的落点；
   *   3) 落点误差 Δ = 想要 − 实际，按落点对 aim 的敏感度（blendC≈0.78 ⇒ 增益 1.28）
   *      修正 aimT，重新解 vCmd；迭代 servoIter 次。
   * 有了伺服，「落点」这个量才是真的落点，L2 的 place 头才有意义。 */
  const SERVO_RNG = (function(){ let s = 0x9e3779b9; return function(){ s = (s + 0x6D2B79F5) | 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; })();
  /* 把拍子前向仿真到触球（照抄 tt-player 的 padControl 动力学） */
  function simSwingToContact(px, svx, bx, tau, cfg, vCmd){
    const dt = 1 / 60, svCap = (SIM_ && SIM_.C && SIM_.C.MOUSE_SV_CAP) ? SIM_.C.MOUSE_SV_CAP : 7;
    /* ★ 限速感知：伺服必须用与实机**同一份**限速公式，否则它算出来的落点
     * 与真实落点不一致 ⇒ 误差反解朝错方向修（限速前 30% 挥拍、
     * 限速后 100% 挥拍，差异被放大 3 倍以上）。
     * cap=null 时 moveStep 与原式逐位等价 ⇒ 零回归。 */
    const ML = (typeof MOVE_LIMIT !== 'undefined') ? MOVE_LIMIT : null;
    const capX = ML ? ML.cap : null;
    let x = px, v = svx;
    const steps = Math.max(1, Math.ceil(tau / dt));
    for(let i = 0; i < steps; i++){
      const hold = cl(bx - x, -cfg.holdClamp, cfg.holdClamp);
      const tx = (cfg && cfg.swingLaw === 1)
        ? cl(bx + vCmd / PACE, -X_CLAMP, X_CLAMP)      /* 位置律：减速进入接触点 */
        : cl(x + hold + vCmd / PACE, -X_CLAMP, X_CLAMP);
      const prev = x;
      x = (ML && typeof moveStep === 'function')
        ? moveStep(x, tx, PACE, dt, capX)
        : x + (tx - x) * Math.min(1, dt * PACE);
      const raw = cl((x - prev) / dt, -svCap, svCap);
      v += (raw - v) * Math.min(1, dt * 12);
    }
    return { x: x, svx: v };
  }
  /* 给定触球瞬间的拍位/拍速，这一拍会落在哪（实机同一份出球核 + 轨迹校验） */
  function landingOf(pxC, svxC, ctx, my, ctrl, aimX, rng, requireOk, swOvf, fwdOvf){
    if(!SIM_ || !SIM_.resolveHit || !SIM_.simulateFull) return null;
    const aimZ = AIM.zDeep + (AIM.zShort - AIM.zDeep) * my * my;
    let r;
    try{
      r = SIM_.resolveHit({
        stroke: 'forehand',
        pos: { x: ctx.bx, y: ctx.by, z: ctx.bz },
        vel: ctx.vel || { x: 0, y: 0, z: 0 },
        spin: { x: ctx.sx || 0, y: ctx.sy || 0, z: 0 },
        swipe: (swOvf != null) ? swOvf : svxC,
        fwd: (fwdOvf != null) ? fwdOvf : (SIM_.fwdOf ? SIM_.fwdOf(ctx.svz || 0) : 0),
        mouseNy: my,
        aim: { x: aimX, z: aimZ, gx: pxC },
        ctrlHold: !!ctrl,
        dir: -1, applyArcAdj: true, receive: false, rng: rng,
      });
    }catch(e){ return null; }
    if(!r || !r.outVel) return null;
    let land;
    try{
      land = SIM_.simulateFull({ x: ctx.bx, y: ctx.by, z: ctx.bz }, r.outVel, 'player',
                                { x: r.spin.x, y: r.spin.y, z: 0 }, rng);
    }catch(e){ return null; }
    if(!land || !land.landing) return null;
    /* ★★ 第七个真 bug（限速后暴露）：simulateFull 对「打长/出界」返回
     *   { ok:false, reason:'floor'|'out', landing:{x,y:0,z} } —— 落点坐标**仍然给出来**。
     *   原来这里一律 return null ⇒ 深度安全网拿不到「这一球到底打多远」
     *   ⇒ 恰恰是最该修的那批球（打长）永远修不了（实测 my 一直停在 0.540）。
     *   现在：floor/out 也返回落点（带 ok=false），由调用方决定用不用；
     *   net（挂网 ⇒ 深度无意义）与 timeout（没落点）仍然返回 null。
     *   requireOk=true 的调用方（落点伺服）只要合法落点，保持旧行为。 */
    if(land.reason === 'net' || land.reason === 'timeout') return null;
    if(requireOk && !land.ok) return null;
    return { x: land.landing.x, z: land.landing.z, ok: !!land.ok, reason: land.reason || null };
  }

  /* ---- 控制器 ----
   * 每侧一个实例（实机 player/ai 各一，训练侧一个）。
   * 状态：这一板是否在飞来、预测接触点、目标落点、换边计数。 */
  /* swingSwipe 的开关：
   *   null/undefined = 旧行为（出球核用真实拍速）；
   *   1 = 用「故意挥拍速度」（跑位与挥拍分离）；
   *   'auto' = **只在开了移动预算时**用故意挥拍速度
   *     （不限速时旧行为逐位不变 ⇒ 零回归；限速时避免「满速冲量放大球速」）。 */
  function swingSwipeOn(cfg){
    const v = cfg ? cfg.swingSwipe : null;
    if(v === 1) return true;
    if(v === 'auto'){
      const cap = (typeof MOVE_LIMIT !== 'undefined' && MOVE_LIMIT) ? MOVE_LIMIT.cap : null;
      return cap != null;
    }
    return false;
  }

  /* swingFwd 的取值：undefined = 沿用真实拍面 z 速度（旧行为，逐位不变）；
   * 数字 = 故意前冲力度上限（0~1）。
   * 挥拍阶段之外（还在追位）一律给 0：还没准备出手时，
   * 不该因为「俯冲找球」而把这一板打成拉球。 */
  function swingFwdVal(cfg, obs, inSwing){
    let v = cfg ? cfg.swingFwd : null;
    if(v === 'auto'){
      /* 'auto' = 只在开了移动预算时把前冲力度从「跑位」里剥出来
       * （不限速时旧行为逐位不变 ⇒ 零回归）。 */
      const cap = (typeof MOVE_LIMIT !== 'undefined' && MOVE_LIMIT) ? MOVE_LIMIT.cap : null;
      if(cap == null) return undefined;
      v = 0;
    }
    if(v == null) return undefined;
    if(!inSwing) return 0;
    let raw = 0;
    try{ raw = (SIM_ && SIM_.fwdOf) ? SIM_.fwdOf((obs && obs.svz) || 0) : 0; }catch(e){ raw = 0; }
    return Math.min(raw, Math.max(0, v));
  }

  /* 移动预算是否生效（cap != null）。限速下「够不到」重新出现 ⇒ 胜负改由落点决定。 */
  function cappedOn(){
    const cap = (typeof MOVE_LIMIT !== 'undefined' && MOVE_LIMIT) ? MOVE_LIMIT.cap : null;
    return cap != null;
  }

  function makeController(opts){
    const cfg = Object.assign({}, OVERRIDE || DEFAULTS, opts || {});
    const S = {
      inb: false,        // 当前是否在处理「来球」
      bx: 0, by: PADDLE_Y, bz: PLAYER_Z, tau: 9, bounceX: null,
      wide: false, aimT: 0, side: 1, rtop: 0,
      shots: 0, lastTau: 9, reach: 1,
    };

    function reset(){
      S.inb = false; S.bx = 0; S.by = PADDLE_Y; S.bz = PLAYER_Z; S.tau = 9;
      S.wide = false; S.aimT = 0; S.rtop = 0; S.shots = 0; S.lastTau = 9; S.reach = 1;
    }

    /* 主入口：obs(15 字段) → {tx, my, ctrl} */
    function plan(obs, intent){
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
        S.intentChecked = false;      // 每板重置（第三道闸门每板只判一次）
        S.depthChecked = false;       // 每板重置（深度安全网每板只判一次）
        S.myFix = null;               // 每板重置（深度安全网算出的修正 my，见下面的 ★ 第十个真 bug）
        if(cfg.alternate) S.side = -S.side;
        /* ★ aimForceAlt：每板交替强制绝对落点（±v）。
         *   对手会跟着上一球站位 ⇒ 固定一边会被适应，换边才有效。 */
        if(cfg.aimForceAlt != null) S.aimAltSign = -(S.aimAltSign || 1);
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
        S.bounceZ = ct.bz; S.bounceX = ct.bounceX;
        S.tBounce = ct.tBounce; S.vzPost = ct.vzPost; S.padZ = ct.targetZ;
        S.apexY = ct.apexY; S.apexZ = ct.apexZ; S.useApex = ct.useApex;
        S.cty = ct.cty; S.useContactY = ct.useContactY;
        S.inVx = ct.inVx;
        S.vel = ct.vel;                 // 触球瞬间的球速（意图复核用）
        S.svx = obs.svx || 0;           // 拍面 x 速度（= 出球核里的 swipe，决定速度倍率）
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
      if(intent){
        S.wide = false;
        /* ★ 第一道闸门：意图落点不得离「自然落点」太远。
         * 自然落点 = 0.55·拍位x + 0.30·拍速x（不挥拍时就是这个）。
         * 偏得越远，L1 要的拍速越大 → 拍子在触球前漂移越大 → 直接够不到。
         * 实测：学生给「球在 +0.3、落点 −0.62」⇒ 100% 失分且全是够不到。 */
        const natAim = cl(AIM.xFromPos * (obs.px || 0) + AIM.xFromSwipe * (obs.svx || 0), -0.62, 0.62);
        let w = cl(intent.aimX, -0.62, 0.62);
        const d = w - natAim;
        if(Math.abs(d) > cfg.intentAimR) w = natAim + cl(d, -cfg.intentAimR, cfg.intentAimR);
        S.want = w;
      }
      else{
        const natAim = cl(AIM.xFromPos * (obs.px || 0) + AIM.xFromSwipe * (obs.svx || 0), -0.62, 0.62);
        if(cfg.aimNat){
          /* 自然落点 + 偏移（默认）：不为了控落点而挥拍 ⇒ 拍子不漂离球。 */
          S.wide = false;
          S.want = cl(natAim + cfg.landBias, -0.62, 0.62);
        }else{
          const wide = Math.abs(S.bx) > cfg.wideThresh;
          S.wide = wide;
          S.want = (wide ? (S.bx < 0 ? -1 : 1) : S.side) * (wide ? cfg.landX : cfg.landXMid);
        }
      }
      /* ★ aimForce（诊断）：强制绝对落点，覆盖上面两条路径 */
      if(cfg.aimForce != null){
        S.wide = false;
        S.want = cl(cfg.aimForce, -0.62, 0.62);
      }else if(cfg.aimForceAlt != null){
        S.wide = false;
        S.want = cl((S.aimAltSign || 1) * cfg.aimForceAlt, -0.62, 0.62);
      }else if(cfg.landTarget != null){
        /* ★ landTarget（正式旋钮）：绝对落点目标（米）。
         * 与 aimForce 的区别：闸门复核失败时**允许回落**（aimForce 是诊断模式，
         * 不回落才能量到「请求落点 → 实际落点」的偏差）。
         *
         * ★★ 实机测出来的关键事实（vs hell，30 局/组，同种子）：
         *   自然落点（回球到「球来的地方」附近）= 70.3%
         *   强制绝对落点 +0.55                 = 74.6%
         *   强制绝对落点  0.00                 = 79.7%  ← 最好
         *   强制绝对落点 −0.55                 = 68.1%
         *   每板交替 ±0.55                    = 69.3%
         *   每板交替 ±0.40                    = 63.4%
         * ⇒ 「把球回给对方来的那一侧」是最差的策略：对手本来就在那儿接球。
         *   固定落点目标（把球送到固定一侧）能逼对手移动。
         * 注意：出球速度反而是「自然落点」更高（6.08 vs 5.42 m/s），
         * 所以增益**不是**来自球速，而是来自落点位置。
         * ⇒ L1 的落点应当是「一个可调的固定目标」，而不是「球来的地方」。 */
        S.wide = false;
        S.want = cl(cfg.landTarget, -0.62, 0.62);
      }else if(cfg.landCorner){
        /* ★ landCorner（正式）：打「对手的反侧角」—— 绝对落点目标随对手站位自适应。
         * 动机（限速下的实机事实）：限速后模型的防守被打穿（够不到 > 0），
         * 胜负转由「球放到哪儿」决定；固定 +x 角比自然落点高 35pp（47.8% → 83.1%，
         * 40 局同种子，cap 2.0），但固定角有单侧风险（对手若恰好站在那边就无效）。
         * 本旋钮按对手当前站位选反侧 ⇒ 两侧都有效。
         * obs.ox = 对手拍位 x（tt-player / input-sim 的 obs 都有）。 */
        S.wide = true;
        const ox = obs.ox || 0;
        S.want = cl((ox >= 0 ? -1 : 1) * (cfg.landCornerV || cfg.landX), -0.62, 0.62);
      }else if(!intent && (cfg.landAuto === 'pos' || (cfg.landAuto === 'auto' && cappedOn()))){
        /* ★ landAuto（正式）：限速下的「固定角落点」。
         * 机理：限速后模型的防守被打穿（够不到 > 0），胜负转由「球放到哪儿」决定。
         * 实机（cap 2.0，40 局/组，同种子，vs hell）：
         *     自然落点 47.8%  |  固定 +0.62 角 83.1%  |  固定 −0.62 角 35.5%
         *     |  自适应反侧角 51.2%
         * ⇒ 固定角落好 35pp，但**单侧**（换到 −x 角反而 −12pp）；
         *   自适应版本只 +3.4pp（对手常在中间 ⇒ 选边近乎随机 ⇒ 收益被平均掉）。
         * 只在**没有意图**（纯 L1 路径）时生效：L2 的落点由学生决定，
         * 它的动作集里本来就有绝对角落选项（abs-r55 等），不必在这里插手。 */
        S.wide = true;
        const side = (cfg.landAuto === 'neg') ? -1 : 1;
        S.want = cl(side * (cfg.landAutoV != null ? cfg.landAutoV : 0.62), -0.62, 0.62);
      }
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
      if(intent){
        /* ★ 第二道闸门：my 夹到实机验证过的安全带。
         * 实机扫描（40 局/组）：my=0.38 时 67% 的球自己出界，my=0.54 只 2%。
         * 搓球（ctrl）用自己的 my（搓球的深度另算），其余夹进安全带。 */
        if(intent.ctrl){ my = cl(intent.my, 0.15, 0.95); }
        else {
          my = cl(intent.my, cfg.intentMyLo, cfg.intentMyHi);
          /* ★ 固定 my（扫描用）：intentMyFixed ≥ 0 时无视意图给的深度，
           *   用来在**实机**上测「意图路径的安全深度带」。
           *   （注意：pz 通道上线后，意图路径里的 my 只管出球深度/弧线，
           *     不再管拍面深度 —— 之前用 L1 路径测出来的 [0.50,0.58] 不能直接套。） */
          if(cfg.intentMyFixed >= 0) my = cfg.intentMyFixed;
          /* ★ 安全下限：L1 的「快球回短」逻辑（mySpeedGain）在意图路径上被跳过了，
           *   但快球本来就顶死了出球速度上限 → 固定深度必然打长出界。
           *   实机：意图路径 out 19.2%（纯 L1 只有 1%）。
           *   ⇒ 意图给的 my 只能在这个下限之上。 */
          if(cfg.mySpeedGain > 0){
            const t = cl((S.inSpd - cfg.mySpeedRef) / Math.max(cfg.mySpeedSpan, 0.1), 0, 1);
            const floor = cfg.myDrive + cfg.mySpeedGain * t;
            if(floor > my) my = cl(floor, cfg.intentMyLo, cfg.intentMyHi);
          }
        }
        ctrl = !!intent.ctrl; isPushCase = !!intent.ctrl;
      }else{
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
      }
      /* ── 长相持「求速」：相持超过阈值就换更冲的打法（DEFAULTS 里有背景与口径） ──
       * 只在**没有意图**时生效（意图路径的 my 由学生决定）。
       * 注意：本块放在深度安全网的 myFix **之前** ⇒ 安全网仍然拥有最后一句话
       *（安全网是安全修正，求速是主动冒险，安全优先）。 */
      let fOver = null;
      if(cfg.rallyAfter > 0 && !intent && !isPushCase && S.shots > 0){
        const totalGuess = 2 * S.shots + 1;   /* S.shots = 玩家接到的球数 */
        if(totalGuess > cfg.rallyAfter){
          my = cl(cfg.rallyMy, 0.15, 0.95);
          if(cfg.rallyFwd > 0) fOver = cfg.rallyFwd;
        }
      }
      /* ★★★ 第十个真 bug（已定位，但**修法被实测否决** ⇒ 默认关）
       *   症状：深度安全网**每板只判一次**（`S.depthChecked`），而 `my` 在每一帧都从
       *   `cfg.myDrive` 重新起算 ⇒ 安全网算出的 my2 在**下一帧就被冲掉**，
       *   真正触球那一帧用的还是 myDrive（实测坏球的 my 恒为 0.540，
       *   而安全网估出的深度 dLand = 3.18~3.84m，端线只有 1.37m ⇒ 它**算对了**）。
       *   修法（把修正**跨帧锁存**在 `S.myFix` 里）**实测有害**：
       *   实机 A/B（限速 2.0 + 固定角落，40 局，配对同种子）
       *     不锁存（= 上线配置）      **83.1%** [78.2,87.1]
       *     锁存 + 方向「太深 ⇒ my 调小」31.1% [25.5,37.2]（失分 98.2% 自己出界）
       *     锁存 + 方向「太深 ⇒ my 调大」**55.1%** [49.7,60.5]
       *   ⇒ 锁存为什么更差：这条网的**估计偏悲观**（dLand p50 = 1.18、p90 = 3.5，
       *   而真实落点深度 p50 只有 1.0）⇒ 锁存会把约 10~20% 的**好球**也一起拉歪
       *   （my 被推到 myMax ⇒ 弧线变高 ⇒ 球变短 ⇒ 被对手轻松回到）。
       *   ⇒ 正确的修法是**把估计做准**，不是把估计锁死 ⇒ 锁存保留为旋钮，默认关。
       *   ⇒ 通用教训：「代码在跑」≠「代码在起作用」；但反过来也成立 ——
       *     **「算对了」不等于「锁住它是对的」**（锁之前先问：这个估计有多可信？）。 */
      if(cfg.depthLatch > 0 && S.myFix != null) my = cl(S.myFix, cfg.myMin, cfg.myMax);

      /* ★ 第三道闸门（**两条路径都生效**）：触球前把「这一拍打出去会落在哪」
       *   算一遍（实机同一份 resolveHit + simulateFull）。出界/下网 ⇒ 落点回落
       *   「自然落点」；意图路径额外回落 my/ctrl（意图给的深度可能是错的）。
       *   只在触球前 0.05s 内做（每帧都做太贵，且早期预测还不准）。
       * ★ 2026-10-20 修：这段原本写在 else 分支里（只在「没有意图」时可达），
       *   于是对意图路径**从来没有生效过**——三道闸门实际只落了两道。
       *   后来又把它扩展到 L1 路径（L1 也要复核自己的落点）。 */
      if(cfg.intentVerify && S.hasMeet && S.tau < cfg.intentVerifyTau && !S.intentChecked){
        S.intentChecked = true;
        const ok = verifyIntent({ my: my, ctrl: ctrl, aimX: S.want },
          { bx: S.bx, by: S.by, bz: S.bz, vel: S.vel, svx: obs.svx, svz: obs.svz,
            px: obs.px, sx: obs.sx, sy: obs.sy, margin: cfg.intentVerifyMargin }, Math.random);
        if(!ok){
          /* 落点回落「自然落点」（任何路径都安全：不做额外挥拍）。
           * aimForce 是诊断模式：不回落，否则实验测不到强制落点。 */
          if(cfg.aimForce == null && cfg.aimForceAlt == null)
            S.want = cl(AIM.xFromPos * (obs.px || 0) + AIM.xFromSwipe * (obs.svx || 0), -0.62, 0.62);
          /* 意图路径还要回落深度/手法（意图给的深度可能是错的）。 */
          if(intent){ my = cfg.myDrive; ctrl = false; }
          S.verifyFail = (S.verifyFail || 0) + 1;
        }else{
          S.verifyOk = (S.verifyOk || 0) + 1;
        }
      }

      /* ★ 深度安全网：把这一拍的落点深度夹进 [depthMin, depthMax]。
       *   触发条件与第三道闸门相同（触球前 0.05s、每板一次），但动作不同：
       *   闸门是「落点非法 ⇒ 打回自然落点」，这里是「落点太深 ⇒ 把 my 拉浅」。
       *   为什么要修正而不是否决：自然落点（= 回球到球来的地方）本身也可能出界，
       *   而实测失分 100% 是出界 ⇒ 否决式闸门救不了。
       *   落点深度 = −landing.z（对手半台为负），
       *   修正方向：太深（depth > depthMax）⇒ my 增大（更浅）；太短 ⇒ my 减小。
       *   ★ 限速下**开**（depthSafetyCapped=1）：限速口径下「打长」的成因有两个
       *   （isLoop 误判 —— 已用 swingFwd 修掉；以及落点目标在远角 ⇒ 意图解算出的球极快），
       *   剩下的那一小撮（实测 0.8% 的出球）由这条网收尾。
       *   ⚠ 注意：这条网的价值取决于 (1) 修正**跨帧锁存**（第十个真 bug）与
       *   (2) 修正**方向**（实机 A/B 定，不能用孤立复算定）。 */
      const capOn = (typeof MOVE_LIMIT !== 'undefined' && MOVE_LIMIT) ? (MOVE_LIMIT.cap != null) : false;
      const dsOn = (cfg.depthSafety > 0) && (!capOn || cfg.depthSafetyCapped > 0);
      if(dsOn && S.hasMeet && S.vel && S.tau < cfg.depthTau && !S.depthChecked){
        S.depthChecked = true;
        const dctx = { bx: S.bx, by: S.by, bz: S.bz, vel: S.vel,
                       sx: obs.sx, sy: obs.sy, svz: obs.svz };
        /* ★ 限速口径：这条网算落点时必须用**与实机同一份**出球参数
         *   （swipe = 故意挥拍速度，fwd = 0），否则它会用「跑位冲量」去估球速，
         *   估出一个假的「打长」⇒ 把 my 调小 ⇒ 真球反而打短。
         *   挥拍速度用「按 S.want 反解的 vCmd」近似（伺服只微调 aimT，量级很小）。 */
        const capOn2 = (typeof MOVE_LIMIT !== 'undefined' && MOVE_LIMIT) ? (MOVE_LIMIT.cap != null) : false;
        const vEst = cl((S.want - AIM.xFromPos * px) / AIM.xFromSwipe, -cfg.maxSwing, cfg.maxSwing);
        for(let it = 0; it < cfg.depthIter; it++){
          const land = landingOf(px, svx, dctx, my, ctrl, S.want, SERVO_RNG, false,
                                 capOn2 ? vEst : undefined, capOn2 ? 0 : undefined);
          if(!land || land.z == null) break;
          const depth = -land.z;
          S.depthLand = depth;
          let my2 = my;
          /* ★ 修正方向：**打太长 ⇒ my 增大（落点更浅）**；打太短 ⇒ my 减小。
           *   ⚠ 这里踩过一次坑：先前用**孤立复算**（固定接触点、扫 my 0.30~0.95）
           *   得出「my 越大落点越深（d(lz)/d(my) ≈ −0.76）」，据此把方向**反过来**。
           *   但那组样本**非单调**（my 0.30 → lz −0.733，my 0.60 → −0.960，
           *   my 0.95 → −0.896），结论不成立。
           *   实机 A/B（限速 2.0 + 固定角落，40 局，配对同种子）给出的方向相反：
           *   把「太深 ⇒ my 调小」+ 跨帧锁存一起上线 ⇒ 胜率 83.1% → **31.1%**，
           *   失分的 98.2% 变成「自己出界」（483 球）⇒ **my 调小 = 球更长**。
           *   ⇒ 方向必须用**实机 A/B**定，不能用孤立复算定；
           *   而 A/B 又必须先把修正**真正落到球上**（跨帧锁存）才有意义 ——
           *   这就是「第十个真 bug」与「方向」两件事必须一起修的原因。 */
          if(depth > cfg.depthMax)      my2 = my + (depth - cfg.depthMax) * cfg.depthGain;
          else if(depth < cfg.depthMin) my2 = my - (cfg.depthMin - depth) * cfg.depthGain;
          else { S.depthOk = (S.depthOk || 0) + 1; break; }
          my2 = cl(my2, cfg.myMin, cfg.myMax);
          if(cfg.depthLatch > 0) S.myFix = my2;   /* ★ 跨帧锁存（默认关，见上面的「第十个真 bug」） */
          S.depthFixed = (S.depthFixed || 0) + 1;
          if(Math.abs(my2 - my) < 1e-4){ my = my2; break; }
          my = my2;
        }
      }

      /* ★ latchAim：挥拍阶段把落点目标**锁住**（每板只锁一次）。
       *   落点目标默认每帧跟随「自然落点」（0.55·拍位x + 0.30·拍速x），
       *   而挥拍阶段拍位/拍速还在动 ⇒ 目标每帧漂 ⇒ 挥拍命令跟着抖，
       *   实际落点散布极大（实机探针：落点 x p10 −0.607 / p50 −0.231 / p90 0.700）。
       *   锁住后同一板目标恒定 ⇒ 落点集中。
       *   （意图路径天生就是这样：每板给一个固定 aimX ⇒ 实机 77.7%
       *     vs 纯 L1 70.5%，很可能就差在这里。） */
      if(cfg.latchAim && S.tau <= cfg.swingLead){
        if(!S.aimLocked){ S.aimLocked = true; S.wantLatched = S.want; }
        else S.want = S.wantLatched;
      }

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
      let aimT = cl(S.want - shift * cfg.aimShiftGain, -0.62, 0.62);
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
        S.sw = 0;   // 追位阶段没有挥拍
        S.inSwing = false;
        const chaseX = (cfg.chaseBounce && S.bounceX != null) ? S.bounceX : S.bx;
        tx = cl(chaseX + cfg.posLead, -X_CLAMP, X_CLAMP);
      }else{
        /* 挥拍阶段：位置保持在球附近，速度纠偏到目标落点。
         * v = (aimT − 0.55·px)/0.30  →  落点闭环 */
        const hold = cl(S.bx - px, -cfg.holdClamp, cfg.holdClamp);
        /* ★ swingLaw=1：挥拍阶段也用「位置律」——目标是接触点 bx 本身，
         * 一阶跟踪器会让拍子**减速进入**接触点（到位时拍速≈0）⇒
         * 不触发 resolveHit 的 qMult 速度放大（限速下 out 爆炸的主因）。
         * 旧律 tx = px + hold + vCmd/PACE 是「位置 + 速度前馈」，
         * 限速下 hold 被夹住 ⇒ 拍子以满速冲进球 ⇒ 触球拍速 = cap ⇒ 球被打长。 */
        let vCmd = cl((aimT - AIM.xFromPos * px) / AIM.xFromSwipe, -cfg.maxSwing, cfg.maxSwing);
        /* ★ 故意挥拍速度（sw）：只有它代表「这一拍的手上动作」。
         * 追位（跑位）速度不该算进击球——限速下模型总是「迟到猛冲」
         * （触球拍速 = cap），而 resolveHit 的 qMult=1+sqrt(|swipe|*0.8/5.6)
         * 会把这个冲量放大成 +53% 球速 ⇒ 球飞过端线（实测 out 占 95%）。
         * 把「跑位」与「挥拍」分开后：
         *   1) 球速回到正常区间（不再自己打长出界）；
         *   2) 落点仍由挥拍控制（aimX = 0.55*拍位x + 0.30*sw）⇒ 落点维度活着。 */
        S.sw = vCmd;
        S.inSwing = true;
        /* ★★ 落点伺服（M3）：把「实际落点」伺服到「想要的落点」（S.want）。
         * 前馈只解了「vCmd → 落点」的线性关系，漏掉了触球瞬间拍速里的
         * 追位滞后项 18·(球x−拍位x) ⇒ 固定落点目标会带系统性偏移
         * （实机探针：请求恒定 0，实际落点中位 +0.376）。
         * 伺服做法：把剩下的 τ 前向仿真到触球（补上滞后项）→ 用实机同一份
         * resolveHit + simulateFull 算出实际落点 → 误差反解 aimT → 重解 vCmd。
         * 一分球只跑 3 帧 × servoIter 次，代价可忽略。 */
        if(cfg.servo > 0 && S.hasMeet && tau > 0 && S.vel){
          const sctx = { bx: S.bx, by: S.by, bz: S.bz, vel: S.vel,
                         sx: obs.sx, sy: obs.sy, svz: obs.svz };
          for(let it = 0; it < cfg.servoIter; it++){
            const sw = simSwingToContact(px, obs.svx || 0, S.bx, tau, cfg, vCmd);
            /* ★ 限速口径：伺服算落点时必须用**与实机同一份**出球参数
             *   （swipe = 故意挥拍速度 vCmd，fwd = 0），否则伺服会朝一个
             *   永远不会发生的落点修正 ⇒ 把球往台外打。 */
            const capOn2 = (typeof MOVE_LIMIT !== 'undefined' && MOVE_LIMIT) ? (MOVE_LIMIT.cap != null) : false;
            const land = landingOf(sw.x, sw.svx, sctx, my, ctrl, aimT, SERVO_RNG, true,
                                  capOn2 ? (vCmd || 0) : undefined, capOn2 ? 0 : undefined);
            if(!land) break;
            const err = S.want - land.x;
            S.servoLand = land.x; S.servoErr = err;
            if(Math.abs(err) < cfg.servoTol) break;
            aimT = cl(aimT + err * cfg.servoGain, -0.62, 0.62);
            vCmd = cl((aimT - AIM.xFromPos * px) / AIM.xFromSwipe, -cfg.maxSwing, cfg.maxSwing);
          }
        }
        tx = (cfg.swingLaw === 1)
          ? cl(S.bx + vCmd / PACE, -X_CLAMP, X_CLAMP)
          : px + hold + vCmd / PACE;
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
        if(cfg.padZPhase && S.vzPost > 0.2 && !S.useApex){
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

      return { tx: cl(tx, -X_CLAMP, X_CLAMP), my: cl(my, 0, 1), ctrl: ctrl, pz: padZ,
               sw: (swingSwipeOn(cfg) ? (S.sw || 0) : undefined),
               f: (fOver != null ? fOver : swingFwdVal(cfg, obs, S.inSwing)) };
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
