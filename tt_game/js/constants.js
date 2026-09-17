/* =====================================================================
 *  constants.js — 全局常量与参数配置
 *  · 玩家：正手极重上旋(×1.9) / 反手快撕(阈值30rad/s，低平快)
 *  · AI 对称能力：正手爆冲(120-175rad/s) / 机会球扣杀 / 反手快撕借力
 *  · AI 翻拍 = 出球预告：红面重旋 / 黑面快撕
 * ===================================================================== */
'use strict';
const clamp = THREE.MathUtils.clamp;

/* ---------------- 1. 常量 ---------------- */
const TABLE_L = 2.74, TABLE_W = 1.525, TABLE_H = 0.76;
const TABLE_TOP = TABLE_H;
const NET_H = 0.1525, NET_LEN = 1.83;
const BALL_R  = 0.02;
const G       = 9.81;
const REST    = 0.72;
const AIR     = 0.10;
const MAGNUS  = 0.0032;
const SPIN_KICK = 0.016;
const PADDLE_Y  = TABLE_TOP + 0.15;
const PAD_HW = 0.10, PAD_HH = 0.115, PAD_HD = 0.03;
const PLAYER_Z = 1.32, AI_Z = -1.32;
const X_CLAMP  = 1.2;
const AI_SPEED = 2.45;
/* DQN 决策跳帧：每 N 帧决策一次（60/N Hz）。训练器 input-sim.js 与实机
 * tt-player.js 必须共用这一份——历史上训练按 60Hz 决策、实机按 15Hz，
 * 导致训练里 16ms 内可修正的错误在实机停留最多 50ms（≈15cm 球程）。 */
const DECIDE_SKIP = 3;

const COUNTER = {          // 反手快撕（玩家与 AI 共用）
  spinThresh: 30,          // ★ 触发阈值降低：中等旋转即可借力快撕
  arc: 0.55,               // 低平弧线
  paceFloor: 4.2,          // 借力球速保底（更快 → 落台更深）
  pacePerSpin: 0.013,      // 每 rad/s 来球旋转转化的球速
  paceMax: 7.0,            // 反击球速上限（落点深度主要由此决定）
  spinBorrow: 0.4,         // 借用来球上旋比例
  recover: 0.06,           // 极速还原 → 可连续快撕
};
const STROKE = {
  forehand: {           // 正手：旋转更强 · 球速更慢（更大区分）
    paceBase: 2.5, paceSwipe: 0.78, paceMax: 6.5,
    spinGen: 2.7, sideGen: 40, spinCap: 280,
    aimXMax: 0.62, arc: 1.0, recover: 0.20,
    control: 0.78, forgiveV: 0.14, forgiveH: 0.05, forgiveZ: 0.06, magnet: 1.35,
  },
  backhand: {           // 反手：速度更快（= 目前正反手速度之上限更高）· 旋转弱
    paceBase: 3.55, paceSwipe: 0.48, paceMax: 6.4,
    spinGen: 0.65, sideGen: 24, spinCap: 90,
    aimXMax: 0.74, arc: 0.8, recover: 0.08,
    control: 0.66, forgiveV: 0.11, forgiveH: 0.035, forgiveZ: 0.05, magnet: 0.95,
  },
};
const STANCE = {               // 正/反手自动切换（simcore.js#resolveStance 单一逻辑源，v2.3）
  relNear: 0.10,               // 球-拍"明显侧向"饱和半径 (m)：|球-拍| 超过此值用满强度信号
  relFar: 1.4,                 // 明显侧向信号强度（球位主导）
  bodyBias: 0.55,              // 追身区信号幅值：按球偏离体线的比例渐变（贴体线→0，10cm→满幅）
  noiseAmp: 0.16,              // 决策噪声幅值（±）：保留一点"人不是每次都判得一样"的味道
  enter: 0.3,                  // 真滞回：切换到新姿态所需置信度（抑制噪声抖动，不压正常切换）
  minHold: 0.15,               // 切换后最短保持 (s)：v2.3 起为软坡——刚换握需 urgent 级信号，置信需求线性滑落到 enter
  urgent: 1.1,                 // 紧急纠正：切换后瞬间改判所需的信号强度（随 minHold 软坡衰减）
  commitT: 0.15,               // 触球承诺基准窗口 (s)：TTC 小于此值锁姿态（挥拍已启动，真人也不会再换）
  transT: 0.18,                // 切换过渡时长 (s)：换握/转腰未完全到位的时间
  transMag: 0.65,              // 过渡期磁吸比例下限（transMag→1 线性恢复）：轻微手感代价
  // —— v2.2 情境感知（调用方不传对应输入时自动退化为 v2.1 行为）——
  meetVCap: 2.5,               // 拍速外推上限 (m/s)：推算触球时刻拍位的速度钳制
  meetTCap: 0.32,              // 外推时长上限 (s)：太远不外推（预测本身不准）
  fhBias: 0.22,                // 时间充裕时的正手偏好强度：分界线向反手侧移（正手接追身）
  fhBiasT: 0.45,               // 达到满正手偏好所需 TTC (s)：时间紧迫偏置消失→反手快挡中路
  highY0: 0.13,                // 半高球起偏阈值（相对台面 m，与高球磁吸阈值一致）
  highYR: 0.12,                // 高球偏置渐变区间 (m)
  highBias: 0.30,              // 高球正手（扣杀）倾向强度
  uncT: 0.6,                   // 预测不确定度饱和 TTC (s)：远球噪声/滞回大，贴脸干脆
  noiseMin: 0.4,               // 贴脸球噪声保有比例（远球=1.0 线性过渡）
  spinNoiseK: 0.0008,          // 侧旋附加不确定度（拐球难判）
  enterLate: 0.7,              // 贴脸球滞回系数（远球=1.0）：临近触球切换更果断
  escStep: 0.30,               // 软承诺：每已切换一次滞回追加量（替代 v2.1 硬性一板一次）
  // —— v2.3 灵动化（全部可选输入/有缺省，旧调用方零回归）——
  trendT: 0.10,                // 挥拍空间外推 (s)：来球横向趋势——球-拍相对横移速度 × 此值并入决策位移，
                               //   "球往怀里钻"提前倒反手、"球走向正手位"迎正手（贴线球不再来回翻面）
  trendVCap: 3.0,              // 趋势速度钳制 (m/s)：侧旋拐球的瞬时 vx 不淹没几何信号
  toBhLateK: 0.8,              // 贴脸转反手置信 ×0.8（反手快拨随时敢换，灵动）
  toFhLateK: 1.25,             // 贴脸转正手置信 ×1.25（正手引拍大，临近触球不乱改；远球渐回对称）
  noiseTau: 0.09,              // 决策噪声 OU 平滑时间 (s)：调用方传 noiseBox 时生效——
                               //   犹豫是连贯的"倾向摇摆"，不再是逐帧白噪抽签
  escCap: 2,                   // 软承诺滞回追加最多叠 2 次（防止连被骗后滞回无限垒高、手感锁死）
  commitTFh: 0.18,             // 当前姿态=正手的承诺窗口（正手引拍长，锁得更早；= ANIM.forehand.windupT）
  commitTBh: 0.12,             // 当前姿态=反手的承诺窗口（反手紧凑，更晚才锁死）
  commitSpdK: 0.3,             // 来球速度自适应：|vz| 从 4→8 m/s，承诺窗口线性放宽至多 +30%（快球不敢换）
  resetHold: 1.2,              // 一分之间无活球超过此秒数 → 回到正手基准握法（真人还原准备姿）
  wrap: {                      // AI 侧身正手（wrap around，仅 AI；玩家侧保持意图主导）
    vzMax: 2.6,                // 来球较慢（有侧身时间）——v2.2 起为软窗上限（向下 0.9 渐变）
    distMin: 0.15, distMax: 0.55,   // 反手位但不偏远（太远侧身来不及）
    prob: 0.55,                // 基准概率（由 SIM.wrapProb 按可行性×球速调制；0 = 关闭）
    wrapSpeed: 1.5,            // 侧身移动速度估计 (m/s)：可行性 = ttc 与 dx/wrapSpeed 的比较
  },
};
const PUSH = {                 // 搓球（下旋来球 · 按住 Ctrl 主动搓）
  paceShort: 2.4, paceDeep: 3.4, paceMax: 3.4, paceSwipe: 0.28,   // 球速更快：下限提高，最短搓球也有中速
  arc: 0.55,                   // 低平
  back: 38,                    // 搓出下旋强度（rad/s）—— 降低强度：搓球旋转减弱、不再"锁死"对手
  sideCap: 45,
  control: 0.9,                // 控制好 · 贴目标
  recover: 0.18,
  fit: { v: 0.08, h: 0.05, z: 0.06, mag: 1.5 },   // 按住Ctrl搓球：容错/磁吸拟合更强（更易触球）
  arcSafe: 0.30,               // 搓球弧线抬升（更高更深的搓球，难搓出短二跳；也减少擦网/下网）
  net: 0.10,                   // 搓球过网余量（减少擦网）
  deep: 0.45,                  // 搓球更深：深度偏置（最短搓球也落入对方半区中部，难搓出短二跳）
  deepPace: 0.7,               // 玩家 pace 上限再放宽（球速更快；不影响 AI / 训练器默认）
  xRange: 0.6,                 // 搓球 x 落点范围系数（横向收窄到 60%，更居中可控；玩家专用，AI 不受影响）
};
const LIFT = {                 // 拉球起下旋（下旋来球 · 前冲回球）—— 增强：拉球更可靠，成对抗下旋的主流
  paceMult: 0.95,              // 更快球速 → 落台更稳、弧线更低（防一飞冲天）
  arcAdd: 0.10,                // 略高弧线拉起
  netRate: 0.002,              // 下旋越大越易下网（减半 → 拉球更稳）
  rush: 0.12,                  // 抢点（快挥）附加下网风险（降低 → 敢拉）
};
const SERVE = {                // 发球旋转与抛球（ITTF：垂直抛起≥16cm、无旋转、下降击球）
  TOSS_H: 0.18,                // 抛球高度（m）≥16cm 规则；初速 vy = sqrt(2*G*TOSS_H) ≈ 1.88
  topMag: 22,                  // 上旋发球 spin.x 基础幅值（下旋发球已取消，backMag 不再使用）
  backMag: 14,                 // （兼容保留：下旋发球已取消，实际恒用 topMag）
  sideMag: 72,                 // 侧旋发球 spin.y 基础幅值
  power: { weak: 0.6, mid: 1.0, strong: 1.4 },   // 旋转强度档（发球前调好）：缩放上旋与侧旋
  // 统一深发球（不再区分短球/急长球；下旋发球已取消）：两跳发球第一跳靠己方半台中部偏后(z1≈0.55)、
  // 低平过网(弹起≈0.4m)、二跳深≈0.62（深压对方半台，由 SIM.serveShot 低平解算保证过网不高）
  // 为兼容旧代码引用保留 short/long 两个键，但指向同一套参数
  long: { speed: 2.7, speedJitter: 0.3, arc: 0.95, depth: 0.62, depthJitter: 0.06 },
  short: { speed: 2.7, speedJitter: 0.3, arc: 0.95, depth: 0.62, depthJitter: 0.06 },
};
const ANIM = {                 // 球拍挥拍动画：正手大引拍/横扫/长随挥 · 反手紧凑/前推/手腕抖
  forehand: {
    readyX: -0.18, readyZ: 0.35,    // 待机：拍面微闭 + 拍头向上/拍柄向下（真实握拍）
    windupT: 0.18,                  // 引拍时长（秒）
    back: 0.07,                     // 引拍后撤（local +z）
    dip: 0.025,                     // 引拍重心下沉
    cockZ: -0.30,                   // 引拍蓄力：手腕放松、拍头稍回落
    cockX: 0.12,                    // 引拍拍面微开
    push: 0.085,                    // 触球前送（local -z）
    sweepZ: 0.40,                   // 小臂带动随挥翻转（正手拉：低→高弧线）
    closeX: 0.20,                   // 触球更压拍（外观，不影响物理）
    rise: 0.05,                     // 随挥上抬（弧圈低→高）
    snap: 0.16,                     // 触球瞬间甩腕
    decay: 4.2,                     // 随挥衰减（慢 → 长随挥）
    flat: false,
    serveLat: 0.012, serveSpin: 0.06,   // 发球侧旋横向扫
    flipX: 0.52,                    // 外观：随挥绕拍柄翻转 ≈30°（不影响物理）
    pressX: 0.06,                   // 外观：触球更压拍
    sideSweep: 0.05,                // 外观：由右下向左上挥拍的横向位移
  },
  backhand: {
    readyX: -0.12, readyZ: 0.35,    // 待机：拍面微闭 + 拍头向上/拍柄向下（翻面 ry=π 后同向，仍拍头向上）
    windupT: 0.11,                  // 反手引拍更短
    back: 0.035,
    dip: 0.01,
    cockZ: 0.10,                    // 手腕蓄力（轻微，拍头保持向上）
    cockX: 0.06,
    push: 0.06,
    sweepZ: 0.28,                   // 小臂带动随挥翻转（反手撕：横向撕扯）
    closeX: 0.17,                   // 触球更压拍（外观，不影响物理）
    rise: 0.025,
    snap: 0.10,                     // 触球瞬间甩腕
    decay: 6.5,                     // 快衰减 → 快还原
    flat: false,
    serveLat: 0.008, serveSpin: 0.04,
    flipX: 0.44,                    // 外观：随挥绕拍柄翻转 ≈25°（不影响物理）
    pressX: 0.05,                   // 外观：触球更压拍
    upSweep: 0.025,                 // 外观：由后下向前上的上抬增强
  },
  push: {                           // 搓球 / 下旋发球：拍面放平、向前下切
    readyX: 0.60, readyZ: 0.35,     // 拍面明显打开 + 拍头向上/拍柄向下（搓球切球下部）
    windupT: 0.10,                  // 短促引拍
    back: 0.04,
    dip: 0.012,                     // 轻微下切
    cockZ: 0.10, cockX: 0.06,
    push: 0.055,                    // 向前推送
    sweepZ: 0.10,                   // 几乎不横扫
    closeX: 0.05,                   // 保持打开（搓球不关闭拍面）
    rise: 0.008,
    snap: 0.04,
    decay: 6.0,
    flat: true,
    serveLat: 0.02, serveSpin: 0.09,
  },
  serveTop: {                       // 上旋发球：低引拍 · 向上刷 · 大随挥上抬
    readyX: -0.20, readyZ: 0.10,    // 发球时接近水平（除发球外才拍头向上）
    windupT: 0.20,                  // 发球引拍更长更明显
    back: 0.09,
    dip: 0.04,                      // 压得更低 → 向上刷轨迹
    cockZ: -0.60, cockX: 0.16,
    push: 0.10,
    sweepZ: 0.50,
    closeX: 0.25,                   // 触球中幅关面（≈29°，上旋发球刷球顶部）
    rise: 0.07,                     // 大幅向上随挥
    snap: 0.18,
    decay: 4.0,
    flat: false,
    serveLat: 0.014, serveSpin: 0.07,
  },
  servePush: {                      // 下旋发球：平拍向前下切（可带侧旋横向扫）
    readyX: 0.65, readyZ: 0.10,     // 拍面更开 + 发球时接近水平
    windupT: 0.12,
    back: 0.05,
    dip: 0.015,
    cockZ: 0.12, cockX: 0.07,
    push: 0.065,
    sweepZ: 0.10,
    closeX: 0.05,
    rise: 0.006,
    snap: 0.03,
    decay: 6.0,
    flat: true,
    serveLat: 0.022, serveSpin: 0.10,   // 侧旋发球横向刷过
  },
};
const AIM = { xFromPos: 0.55, xFromSwipe: 0.30, zDeep: -1.24, zShort: -0.50 };
const SPIN = { sideCap: 200, toastThresh: 48 };   // 侧旋上限增强 2 倍以上（击球更拐）
const ASSIST = { magnetPull: 2.4, magnetRangeZ: 0.45, netMargin: 0.07, showLanding: true };
