/* =====================================================================
 *  live-match.js — 「实机管线」无头对局台（训练/实机一致性的唯一判据）
 * =====================================================================
 *
 *  为什么要有这个工具
 * ------------------
 *  仓库里所有「胜率」都来自 input-sim.js，而实机一条都没有。历史上每一次
 *  「修一致性」用的都是**手抄副本对比**：
 *    · tools/_drift.js          —— 头注释自述「本工具按源码复刻两侧公式……
 *                                  若改了 physics.js#tryAIHit 请同步这里，
 *                                  否则会误报」。它比的是它自己抄的两份。
 *    · tools/diag-serve-legal.js —— 头注释自述「与实机 physicsStep(physics.js)
 *                                  是两个独立实现，历史上多处不一致」。
 *    · tools/tt-verify.js        —— 只跑 240 帧 + 一次 ttHit，不打一个完整回合。
 *  结果就是：每修一处就漂移一处，47 个百分点的仿真/实机缺口活到今天
 *  （实机 26.1% vs 仿真声称 73~77%，见 data/tt-stats.jsonl 的 23 个真实 session）。
 *
 *  这个工具做什么
 * --------------
 *  用 Node 的 vm **加载 js/ 里真实的那几个文件**（constants / simcore / policy /
 *  opponent-ladder / learned-policy-* / dqn / input-agent / input-weights / state /
 *  physics / ai / rules / tt-player / tt-stats），只用极薄的替身顶掉**渲染与 UI
 *  层**（THREE.Vector3、DOM、音效、HUD），然后按 main.js#animate() 的调用顺序
 *  逐帧步进，跑完整的 11 分 ITTF 局。
 *
 *  → 物理、跑位、姿态、触球判定、出球、发球、规则判分、遥测归类
 *    **全部是实机那份代码**，不是复刻。
 *  → 同一份权重、同一批种子，并排跑一遍 input-sim.js 的 playInputMatch，
 *    打印两者的差 Δ。Δ 就是「训练/实机失配」这一个数字。
 *
 *  哪些是替身（以及为什么替身是安全的）
 * ------------------------------------
 *  只替掉**不参与物理与决策**的东西，逐条核对过：
 *    · THREE.Vector3 / Color / Sprite —— 只有 .set/.copy/.add/.cross 等纯数值方法
 *      被 physics/rules 用到，语义与 three r128 一致。
 *    · 音效（HUD 弹字、落点环、闪白、震屏）—— 无任何物理副作用。
 *    · setTimeout —— 换成**虚拟时钟队列**（挂在 elapsed 上），规则里的
 *      「1~1.5s 后抛球 / 1.5s 后下一分 / 2.5s 后下一大局」因此是确定性可复现的。
 *    · beginWindup / strikeSwing / updateWindupTrigger —— 从 main.js 逐字复制，
 *      它们只写 pad.phase/phaseT/windup/swing/power/flipTarget/strokeT；
 *      grep 全仓确认这些字段**只被动画读**，物理侧只判断 `phase==='ready'`
 *      来决定要不要再触发一次引拍（触发本身也无副作用）。
 *    · driver（约 20 行）—— main.js#animate() 的**仿真段**的等价物。渲染段
 *      （renderer/scene/mesh/相机）不参与物理，故不加载 main.js。驱动段逐行
 *      对照 main.js:194-216，涉及的两处非平凡逻辑都改为调用共享函数：
 *        · 抛球点 → SIM.serveOrigin()（Phase 1 新增，main.js/rules.js/input-sim.js 共用）
 *        · 每帧子步数 → SIM.subStepsFor(dt)
 *      其余（elapsed 累加、autoStance、aiMovePlayer/aiMove、物理子步）是直译。
 *
 *  用法
 * ----
 *  node tools/live-match.js                              # 默认 vs hell，8 局
 *  node tools/live-match.js --opp default,hell,elite,extreme,extreme-max --games 8
 *  node tools/live-match.js --side ai                    # 让 DQN 站 AI 侧（镜像路径）
 *  node tools/live-match.js --sim-only --from data/input-ai-extreme.json
 *  node tools/live-match.js --tol 3                      # Δ>3pp 时退出码 1（CI 闸门）
 *  node tools/live-match.js --from data/checkpoints/input3-v3/ckpt-003600.json
 *
 *  权重来源优先级：--from > js/input-weights.js（游戏实际加载的那份烘焙产物）。
 * ===================================================================== */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
const JSD = f => path.join(ROOT, 'js', f);

/* ---------------- 确定性随机（与训练器同款 mulberry32） ---------------- */
function mulberry32(a){
  return function(){
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* ---------------- THREE 替身 ---------------- */
function makeThree(){
  class Vector3{
    constructor(x = 0, y = 0, z = 0){ this.x = x; this.y = y; this.z = z; }
    set(x, y, z){ this.x = x; this.y = y; this.z = z; return this; }
    copy(v){ this.x = v.x; this.y = v.y; this.z = v.z; return this; }
    clone(){ return new Vector3(this.x, this.y, this.z); }
    add(v){ this.x += v.x; this.y += v.y; this.z += v.z; return this; }
    addScaledVector(v, s){ this.x += v.x * s; this.y += v.y * s; this.z += v.z * s; return this; }
    multiplyScalar(s){ this.x *= s; this.y *= s; this.z *= s; return this; }
    cross(v){
      const x = this.x, y = this.y, z = this.z;
      this.x = y * v.z - z * v.y; this.y = z * v.x - x * v.z; this.z = x * v.y - y * v.x;
      return this;
    }
    length(){ return Math.sqrt(this.x * this.x + this.y * this.y + this.z * this.z); }
  }
  class Color{ constructor(c){ this.hex = c; } set(c){ this.hex = c; return this; } }
  class Sprite{
    constructor(){
      this.material = { color: new Color(0xffffff), opacity: 0 };
      this.position = new Vector3();
      this.scale = { set(){} };
      this.visible = false;
    }
  }
  return {
    Vector3, Color, Sprite,
    MathUtils: { clamp: (v, a, b) => (v < a ? a : (v > b ? b : v)) },
  };
}

/* ---------------- 前置脚本：渲染/UI/音频层的全局替身 ----------------
 * 这里只声明 js/{main,entities,ui,audio,i18n,input}.js 在浏览器里提供的全局。
 * 凡是上面 7 个真实文件里自己声明过的名字，这里一律不重复声明。
 * 拆成两段：HEAD 不依赖任何物理常量；BODY 需要 PADDLE_Y/PLAYER_Z/AI_Z，
 * 因此在 constants.js 之后、其余文件之前注入（球拍位置在 entities.js 里
 * 也是用这三个常量建的）。 */
const PRELUDE_HEAD = `
'use strict';
/* --- 确定性随机源：ctx.__randFn 由外部按局替换 --- */
var __randFn = Math.random;
Math.random = function(){ return __randFn(); };

/* --- 虚拟时钟：把 rules.js 的 setTimeout 挂到 elapsed 上，确定性可复现 --- */
var __timers = [];
function setTimeout(fn, ms){ __timers.push({ fn: fn, at: elapsed + (ms || 0) / 1000 }); return __timers.length; }
function clearTimeout(){}
function __fireTimers(){
  if(!__timers.length) return;
  const due = [];
  const keep = [];
  for(const t of __timers){ (t.at <= elapsed ? due : keep).push(t); }
  __timers = keep;
  due.sort((a, b) => a.at - b.at);
  for(const t of due) t.fn();
}

/* --- main.js 的时间轴全局 --- */
let elapsed = 0, fovKick = 0, flashLife = 0, camX = 0;
/* --- input.js 的鼠标全局（本台不用真人输入，固定中位）--- */
let targetX = 0, targetZ = 1, mouseNy = 0.5;
var aim = { x: 0, z: -0.9 };

/* --- main.js 的挥拍相位（逐字复制，只写 pad 的动画字段）--- */
function beginWindup(pad, strokeType, power){
  if(pad.phase === 'windup' || pad.phase === 'strike') return;
  pad.phase = 'windup'; pad.phaseT = 0; pad.windup = 0;
  pad.swingType = strokeType;
  pad.power = (power != null) ? power : 0.6;
  pad.flipTarget = strokeType === 'backhand' ? 1 : 0;
  pad.strokeT = elapsed;
}
function strikeSwing(pad, power){
  pad.phase = 'strike'; pad.phaseT = 0; pad.windup = 0; pad.swing = 1;
  if(power != null) pad.power = power;
}
function updateWindupTrigger(){
  if(!canHit.player || lastHitter === 'player' || playerPad.phase !== 'ready') return;
  if(ball.vel.z <= 0.05) return;
  const ttc = (playerPad.group.position.z - ball.pos.z) / ball.vel.z;
  if(ttc <= 0 || ttc > 0.30) return;
  const pushF = (ctrlHold && relTop() < -8) ? PUSH.fit : null;
  beginWindup(playerPad, pushF ? 'push' : playerStance, pushF ? 0.5 : 0.55);
}
var playerControl = function(){ /* 本台不用真人输入；watch 模式也不会走到 */ };

/* --- 音效 / HUD（无物理副作用）--- */
function spawnRing(){} function playBounce(){} function playNet(){} function playStroke(){}
function playSwipe(){} function playScore(){} function playServe(){} function playPaddleHit(){}
function toast(){} function flash(){} function setStatus(){} function updateScoreUI(){}
function updateRallyChip(){} function showHitMarker(){} function updateServeUI(){}
function updateCounterHint(){} function updatePushHint(){} function updateTouchUI(){}
function updateSpinMeter(){} function updateStanceChip(){} function updateWindupUI(){}
function computeAim(){}
function showEnd(){ __onGameEnd(); }
function fightEnd(){ __seriesReset(); }
var demoServe = function(){};

/* --- i18n：内部口径恒为中文（tt-stats.js 的 reasonOf 按中文关键词归类）--- */
var __ZH = {
  g_msg_serve_out: '发球出界', g_msg_no_return: '对手未能回球',
  g_msg_rush_net: '对下旋抢点 · 下网!', g_msg_net: '下网!', g_msg_out: '出界!',
  g_msg_let: '擦网 · 重发球', g_msg_serve_first: '发球失误 · 未先落自己半台',
  g_msg_serve_twice_own: '发球失误 · 两跳都在自己半台',
  g_msg_double: '双跳 · 回球失败', g_msg_not_over: '未过网',
};
function gameT(k){ return __ZH[k] || String(k); }
function gameTzh(k){ return __ZH[k] || String(k); }
function modelLabel(id){ return String(id); }

/* --- 浏览器 API 替身 --- */
var localStorage = { getItem: function(){ return null; }, setItem: function(){}, removeItem: function(){} };
var navigator = {};
var Blob = function(){};
function __el(){
  const e = { classList: { add(){}, remove(){}, toggle(){}, contains(){ return false; } },
              style: {}, dataset: {}, textContent: '', innerHTML: '',
              appendChild(){}, removeChild(){},
              setAttribute(){}, getAttribute(){ return null; }, addEventListener(){},
              querySelectorAll(){ return []; } };
  /* 惰性：ui.js 会摸 firstElementChild（pushHint 的内层 <span>），
     写成 eager 会自我递归爆栈 */
  Object.defineProperty(e, 'firstElementChild', { get(){ return __el(); } });
  return e;
}
function $(id){ return __el(); }
var document = {
  readyState: 'complete',
  getElementById: function(){ return __el(); },
  querySelectorAll: function(){ return []; },
  createElement: function(){ return { style: {}, setAttribute(){}, appendChild(){}, addEventListener(){} }; },
  head: { appendChild(){} }, body: { appendChild(){} },
  documentElement: __el(),
  addEventListener(){},
};
`;

const PRELUDE_BODY = `
'use strict';
/* --- entities.js 的球与球拍（只需要物理/决策读写的字段）--- */
function __pad(z){
  return { group: { position: new THREE.Vector3(0, PADDLE_Y, z) },
           phase: 'ready', phaseT: 0, windup: 0, swing: 0, swingType: 'forehand',
           flipTarget: 0, flipT: 0, strokeT: -9,
           svx: 0, svz: 0, power: 0.6, recover: 0, serveSide: 0,
           stance: 'forehand', stanceT: -9,
           predX: 0, predZ: z, predT: -1,
           _inbound: false, _xErr: 0, _wrapDone: false, _wrapOn: false,
           _strokeSwitches: 0, _nz: { v: 0, t: -1 } };
}
var ball = { pos: new THREE.Vector3(0, 1, 0.8), vel: new THREE.Vector3(), spin: new THREE.Vector3(), active: true, lastStroke: '' };
var playerPad = __pad(PLAYER_Z);
var aiPad = __pad(AI_Z);
var flashSpr = { material: { color: { set(){} }, opacity: 0 }, position: new THREE.Vector3(), scale: { set(){} }, visible: false };
`;

/* ---------------- 真实管线加载顺序（与 index.html 的 script 标签一致） ----------------
 * constants.js 之后立刻注入 BODY（球/球拍要用 PADDLE_Y/PLAYER_Z/AI_Z），
 * 其余顺序与 index.html:238-268 完全相同。 */
const PIPELINE = [
  'constants.js',            // 全局常量（simcore/policy 加载时读它同步 → 必须最先）
  '__BODY__',                // 球与球拍替身（需 constants）
  'simcore.js',              // SIM：依赖自由物理核心
  'policy.js',               // AI 策略 + 出球意图
  'opponent-ladder.js',      // 阶梯（needs POLICY_DEFAULT）
  'learned-policy.js',
  'learned-policy-grandslam.js',
  'learned-policy-nemesis.js',
  'dqn.js',                  // MLP 原语
  'input-agent.js',          // 输入级 DQN（needs DQN）
  'hip-skill.js',            // ★ HIP L1：解析技能控制器（无学习参数，tt-player 之前）
  'hip-intent.js',           // ★ HIP L2：意图空间 + 特征 + 前向（依赖 hip-skill）
  'hip-weights.js',          // ★ HIP L2 权重（CE 蒸馏烘焙，~80KB）
  'hip-choice.js',           // ★ HIP L2'：K 路安全动作集（依赖 hip-skill/hip-intent）
  'hip-choice-weights.js',   // ★ HIP L2' 权重（K 分类烘焙）
  'input-weights.js',        // 烘焙权重（~9.7MB，懒加载同款）
  'state.js',                // 全局状态变量
  'tt-stats.js',             // 遥测（提供 reasonOf 归类）
  'physics.js',              // ★ 真实物理/触球/出球
  'ai.js',                   // ★ 真实 AI 跑位 + 赌博机
  'rules.js',                // ★ 真实规则/发球/判分
  'move-limit.js',           // ★ 模型侧移动预算（限速；tt-player 之前）
  'tt-player.js',            // ★ 真实 DQN 推理管线
];

/* --from 权重接进实机侧。TT_PLAYER 只读全局 INPUT_AI_WEIGHTS.net（tt-player.js#init），
 * 所以替换管线里 input-weights.js 这一环的源码即可 —— 用 --from 文件里的 net 生成等价模块。
 * ★ 之前这里只把 --from 接到了仿真侧（buildSimSide），实机侧永远测的是 js/input-weights.js
 *   里那份 —— 头注释宣称的「权重来源优先级：--from > js/input-weights.js」只兑现了一半，
 *   且无任何报错。2026-10-06 暴露：两份不同权重的实机 default/hell 分点率与触球数
 *   逐字节相同（35.7%/2.4%、135/240、63/191），顺着这个才查到这里。 */
function liveWeightsSource(weightsFile){
  const b = JSON.parse(fs.readFileSync(weightsFile, 'utf8'));
  const net = b.w || b.net;
  if(!net || !Array.isArray(net) || !net.length) throw new Error('--from 文件里没有可用的 net/w 字段：' + weightsFile);
  const last = net[net.length - 1];
  const nActions = (Array.isArray(last) ? last.length : (last.W && last.W.length))
                || (b.o && b.o.nActions) || 0;
  if(!nActions) throw new Error('无法从 --from 文件推断动作数：' + weightsFile);
  const hSizes = net.slice(0, -1).map(l => Array.isArray(l) ? l.length : l.W.length);
  const meta = { version: 1, trainedAt: new Date().toISOString().slice(0, 10),
                 opp: 'live-match --from', src: path.relative(ROOT, weightsFile),
                 nActions, hSizes, evalDefault: 0, evalHell: 0 };
  return 'const INPUT_AI_WEIGHTS = ' + JSON.stringify({ version: 1, nActions, hSizes, net }) + ';\n'
       + 'const INPUT_AI_META = ' + JSON.stringify(meta) + ';\n'
       + 'if(typeof module !== "undefined" && module.exports) module.exports = { INPUT_AI_WEIGHTS, INPUT_AI_META };\n';
}

/* ---------------- 构造一台「实机」 ---------------- */
function buildLiveRig(weightsFile){
  const ctx = { THREE: makeThree(), console, Math, Date, JSON, Object, Array, Number,
                String, Boolean, isFinite, isNaN, parseInt, parseFloat, Error, TypeError };
  ctx.globalThis = ctx; ctx.window = ctx; ctx.self = ctx;
  vm.createContext(ctx);
  vm.runInContext(PRELUDE_HEAD, ctx, { filename: 'live-prelude-head.js' });
  const swapWeights = weightsFile && path.resolve(weightsFile) !== DEFAULT_W;
  for(const f of PIPELINE){
    const src = (f === '__BODY__') ? PRELUDE_BODY
      : (f === 'input-weights.js' && swapWeights) ? liveWeightsSource(weightsFile)
      : fs.readFileSync(JSD(f), 'utf8');
    vm.runInContext(src, ctx, { filename: (f === '__BODY__' ? 'live-prelude-body.js' : 'js/' + f) });
  }
  /* tt-player.js 走 document.readyState!=='loading' 分支已自动 init()。
   * 这里补一道断言：权重没装上就必须炸，绝不静默回退普通 AI。 */
  const init = vm.runInContext('({ ready: TT_PLAYER.isReady(), n: TT_PLAYER.agent ? TT_PLAYER.agent.nActions : 0 })', ctx);
  if(!init.ready) throw new Error('TT_PLAYER 未就绪：权重没装上（' + weightsFile + '）');
  /* ★ 相持长度直方图（每分一记）：「这一分打了多少板」。
   *   口径与训练侧 `input-sim.js` 的 `shots` 一致 —— 发球算第 1 板，每一击 +1
   *   （实机：rules.js:232 发球置 1，physics.js 每次击球 ++；训练侧：shots 从 1 起、每板 ++）。
   *   采集点选在 `pointTo`（rules.js:12）：那里 `rallyCount` 还是本分的最终值
   *   （line 16 先取 max 再在 line 89/232 重置），且 line 14 的早退
   *   （state 已是 pointPause/over）要挡掉，否则重复计分会被记两次。 */
  vm.runInContext([
    'globalThis.__rallyHist = [];',
    'const __pt = pointTo;',
    'pointTo = function(){',
    '  try{',
    '    if(state !== "pointPause" && state !== "over" && typeof rallyCount === "number"){',
    '      globalThis.__rallyHist.push(rallyCount);',
    '    }',
    '  }catch(e){}',
    '  return __pt.apply(null, arguments);',
    '};'
  ].join('\n'), ctx);
  return { ctx, nActions: init.n };
}

/* ---------------- 一帧（= main.js#stepSim 的等价物） ----------------
 * main.js 里 stepSim 是固定 1/60 步长的仿真帧；本台锁死同一频率，
 * 调用顺序逐行对齐（elapsed → autoStance → aiMovePlayer → aiMove →
 * updateWindupTrigger → 抛球点/物理子步）。共享口径全部走 SIM.*，
 * 不在本文件里重写任何判定公式。 */
function makeStep(ctx, hz){
  const FR = 1 / hz;
  return function step(){
    vm.runInContext('__fireTimers();', ctx);
    vm.runInContext(`
      elapsed += ${FR};
      if(!(typeof TT_PLAYER !== 'undefined' && TT_PLAYER.isReady()
           && TT_PLAYER.isTtSide('player') && mode === 'watch')) playerStance = autoStance();
      aiMovePlayer(${FR});
      aiMove(${FR});
      if(state === 'awaitServe'){
        const pad = server === 'player' ? playerPad : aiPad;
        const o = SIM.serveOrigin(server, pad.group.position.x, pad.group.position.z);
        ball.pos.set(o.x, TABLE_TOP + 0.05, o.z);
        ball.vel.set(0, 0, 0); ball.spin.set(0, 0, 0);
      } else if(ball.active){
        const n = SIM.subStepsFor(${FR}), h = ${FR} / n;
        for(let i = 0; i < n; i++) physicsStep(h);
      }
    `, ctx);
  };
}

/* ---------------- 跑一局（11 分 · 胜 2 分 · ITTF 两发一换） ---------------- */
function playGame(rig, step, seedBase, gameIdx, maxSec){
  const ctx = rig.ctx;
  ctx.__randFn = mulberry32(seedBase + gameIdx * 7919);
  vm.runInContext(`
    scoreYou = 0; scoreAi = 0; rallyCount = 0; longestRally = 0; ballDead = true;
    seriesWinsL = 0; seriesWinsR = 0;
    globalThis.__rallyHist = [];
    TT_STATS.reset();
    __gameOver = false;
    __onGameEnd = function(){ __gameOver = true; };
    __seriesReset = function(){ __gameOver = true; };
    setupServe();
  `, ctx);
  let t = 0, prevY = 0, prevA = 0;
  const maxFrames = Math.ceil(maxSec * 60);
  for(let f = 0; f < maxFrames; f++){
    step(); t += 1 / 60;
    const y = vm.runInContext('scoreYou', ctx), a = vm.runInContext('scoreAi', ctx);
    /* pointTo 只在得分时改分数 → 用分数增量累计「分点率」这个指标 */
    if(y !== prevY || a !== prevA){ /* 由下方统一结算 */ }
    prevY = y; prevA = a;
    if(vm.runInContext('__gameOver', ctx)) break;
  }
  const snap = vm.runInContext('({ y: scoreYou, a: scoreAi, st: TT_STATS.snapshot(), rh: (globalThis.__rallyHist||[]).slice() })', ctx);
  return { you: snap.y, ai: snap.a, stats: snap.st, frames: Math.ceil(t * 60), rally: snap.rh || [] };
}

/* ---------------- 权重载入 ----------------
 * 两种来源：
 *  · js/input-weights.js —— 烘焙产物（`const INPUT_AI_WEIGHTS = {...};`），
 *    游戏实际加载的那份。仿真侧要自己把 net 塞进 agent（setNet 会硬校验形状）。
 *  · 训练存档（{w,o} 纯 JSON，如 data/checkpoints 下任意 ckpt-*.json）—— 直接
 *    loadInputAgent。
 * 两条路径都必须过 input-agent.js#setNet 的形状断言：形状不符 → 抛错 → 退出，
 * 绝不静默退化成随机策略（那正是历史上「Q 全 NaN → 恒返回动作 0」的失效形态）。 */
let _baked = null;
function loadWeights(file){
  const txt = fs.readFileSync(file, 'utf8');
  const trimmed = txt.trim();
  if(trimmed.startsWith('{')){
    return { kind: 'archive', agent: require(path.join(ROOT, 'js', 'input-agent.js')).loadInputAgent(txt) };
  }
  if(_baked && _baked.file === file) return _baked;
  const box = { console };
  vm.createContext(box);
  vm.runInContext(txt + '\n;globalThis.__W = INPUT_AI_WEIGHTS; globalThis.__M = INPUT_AI_META;',
                  box, { filename: file });
  _baked = { kind: 'baked', file, net: box.__W.net, meta: box.__M || {} };
  return _baked;
}

/* ---------------- 仿真侧（input-sim.js，与训练器同一份） ---------------- */
function buildSimSide(weightsFile, controller){
  const PP = require(path.join(ROOT, 'js', 'policy.js'));
  const SIM = require(path.join(ROOT, 'js', 'simcore.js'));
  const INPUTSIM = require(path.join(ROOT, 'js', 'input-sim.js'));
  const IA = require(path.join(ROOT, 'js', 'input-agent.js'));
  const OPP = require(path.join(ROOT, 'js', 'opponent-ladder.js'));
  global.SIM = SIM; global.P = PP;
  /* hip 控制器没有学习参数 → 不需要权重（也不该被权重文件卡住）。
   * 权重文件仍然会被加载一次做「形状自检」：实机侧仍要过一遍 TT_PLAYER.isReady()。 */
  if(controller === 'hip' || controller === 'hip-intent' || controller === 'hip-choice'){
    const { HIP_SKILL } = require(path.join(ROOT, 'js', 'hip-skill.js'));
    if(controller === 'hip-intent'){
      const { HIP_INTENT } = require(path.join(ROOT, 'js', 'hip-intent.js'));
      const W2 = require(path.join(ROOT, 'js', 'hip-weights.js'));
      const ctl = HIP_SKILL.makeController();
      const brain = { act(o){
        const feats = HIP_INTENT.features(o);
        const id = HIP_INTENT.decide(W2.HIP_WEIGHTS, feats);
        const c = HIP_INTENT.intentToControls(id, o);
        return ctl.plan(o, c);
      }, credit(){} };
      return { INPUTSIM, OPP, IA, agent: null, brain, meta: null };
    }
    if(controller === 'hip-choice'){
      const { HIP_INTENT } = require(path.join(ROOT, 'js', 'hip-intent.js'));
      const { HIP_CHOICE } = require(path.join(ROOT, 'js', 'hip-choice.js'));
      const W3 = require(path.join(ROOT, 'js', 'hip-choice-weights.js'));
      const ctl = HIP_SKILL.makeController();
      const brain = { act(o){
        const feats = HIP_INTENT.features(o);
        const id = HIP_INTENT.argmax(W3.HIP_CHOICE_WEIGHTS || W3, feats);
        const c = HIP_CHOICE.optionToIntent(id, o, SIM.C.AIM);
        return ctl.plan(o, c);
      }, credit(){} };
      return { INPUTSIM, OPP, IA, agent: null, brain, meta: null };
    }
    const brain = HIP_SKILL.makeBrain();
    return { INPUTSIM, OPP, IA, agent: null, brain, meta: null };
  }
  const w = loadWeights(weightsFile);
  let agent;
  if(w.kind === 'archive'){
    agent = w.agent;
  }else{
    /* 形状以代码（input-agent.js）为唯一权威，绝不读烘焙 meta —— 与
     * tt-player.js#init 同一口径（那里的注释记录了读 meta 导致的全 NaN 事故）。 */
    agent = IA.createInputAgent({ stateSize: IA.OBS_N, nActions: IA.ACT_N,
                                  hSizes: IA.HSIZES.slice(), gamma: 0.99,
                                  eps0: 1, epsMin: 0.12 }, Math.random);
    agent.setNet(w.net);
  }
  agent.setTraining(false);
  agent.setEps(0);
  const brain = { act(o){ return agent.decode(agent.bestAction(o)); }, credit(){} };
  return { INPUTSIM, OPP, IA, agent, brain, meta: (w.kind === 'baked' ? w.meta : null) };
}

function simMatch(sim, tag, games, seedBase){
  const lv = sim.OPP.LEVELS.find(l => l.tag === tag);
  const r = sim.INPUTSIM.playInputMatch(sim.brain, sim.OPP.at(lv.id), {
    games,
    rngFactory: k => mulberry32(seedBase + lv.id * 977 + k),
  });
  return { dqn: r.winsA, opp: r.winsB, rate: r.pointRate };
}

/* ---------------- CLI ---------------- */
function argOf(flag, def){
  const i = process.argv.indexOf(flag);
  return (i >= 0 && process.argv[i + 1] && !process.argv[i + 1].startsWith('--')) ? process.argv[i + 1] : def;
}
const HAS = f => process.argv.includes(f);

const DEFAULT_W = path.join(ROOT, 'js', 'input-weights.js');
const W = path.resolve(argOf('--from', DEFAULT_W));
const OPP_TAGS = argOf('--opp', 'hell').split(',').map(s => s.trim()).filter(Boolean);
const GAMES = parseInt(argOf('--games', '6'), 10);
const HZ = parseInt(argOf('--hz', '60'), 10);
const SEED = parseInt(argOf('--seed', '20261004'), 10);
const SIDE = argOf('--side', 'player');           // player = DQN 站近侧（不镜像，= 训练口径）
const TOL = parseFloat(argOf('--tol', 'NaN'));
const SIM_ONLY = HAS('--sim-only');
const LIVE_ONLY = HAS('--live-only');
const MAXSEC = parseFloat(argOf('--maxsec', '40'));
/* --brain：把实机侧的 DQN 决策整体换成脚本脑（追球假设的判决实验用）。
 * 2026-10-14 R5 起因：BC 预训练出来的那份 net 实机只有 1.5%（比基线 11.7% 还差），
 * 但那份 net 的 argmax 命中率只有 3.3%——它压根没学到追球，所以这个结果
 * 既不能证明也不能推翻「够不到球」这个假设。要判决假设本身，就必须绕开网络，
 * 直接把「追拦截预测点」这条策略喂进**实机管线**。
 *   chase  = 追 (x + vx·τ)，τ = 到拍面平面的碰撞时间（R5 主张的正确目标）
 *   naive  = 追球**当前** x（旧 BC 目标，用来量「前瞻值多少钱」）
 *   centre = tx 恒为 0（拍面钉在中间，对照组）
 *   prior  = **保留网络，只把横向那一维换成解析追球**（R5 的最终设计判决）：
 *           仍走原 net 的 argmax，但把它解出来的 mxI 覆盖成 chase 的桶，
 *           my/ctrl/上旋三維原样保留 —— 量的是「网络管深度与手法 + 解析管横向」
 *           这个组合到底值多少（网络其余部分不丢，也不必重新学横向）。
 * 权重照常载入（形状自检要过），但决策函数被覆盖，实机跑的是脚本脑。 */
const BRAIN = argOf('--brain', '');
/* --controller <dqn|hip>：切换决策来源。
 *   dqn = 输入级 DQN（1904 维，逐帧 argmax + 横向拦截先验）
 *   hip = HIP L1 解析技能控制器（js/hip-skill.js，零学习参数）
 * 两者产出的都是 {tx,my,ctrl}，共用同一条物理管线（padControl/resolveHit），
 * 所以实机分点率可直接对比。 */
const CONTROLLER = argOf('--controller', 'dqn');
/* --json <path>：把结果写成结构化 JSON（给 tools/hip-eval.js 做闸门判定用） */
const JSON_OUT = argOf('--json', '');
/* --hip-cfg <path|json>：覆盖 HIP 控制器旋钮（实机扫描用）。
 *   文件里是 {"myDrive":0.5, ...}；注入到 vm 里的 HIP_SKILL.setConfig()。 */
const HIP_CFG = argOf('--hip-cfg', '');
/* --hell-vec <path>：把 hell 档策略换成 {vec:[42]} 检查点（候选地狱实机复核用，见注入处注释） */
const HELL_VEC = argOf('--hell-vec', '');
/* --move-cap <m/s>：模型侧移动预算（限速）。
 *   作用范围：**只有模型控制的拍**（ttmouse / hipmouse）——真人的拍面走
 *   main.js#playerControl，不受影响。
 *   同时作用于实机侧（vm 里的 MOVE_LIMIT）与仿真侧（Node 的 MOVE_LIMIT），
 *   保证两侧同一口径（否则又是训练/实机失配）。
 *
 *   ★ 三种状态（2026-10-21 修）：
 *     不给      = 用出厂默认（js/move-limit.js 的 DEFAULT_CAP，浏览器也是这一份）
 *     --move-cap 0 / 负数 = **显式不限**（限速前基线口径）
 *     --move-cap v (v>0)  = 限速 v m/s
 *   旧实现把「不给」和「给 0」当成同一件事（都用 `MOVE_CAP > 0` 判断），
 *   于是**显式给 0 也拿不到不限**（默认 2.0 仍在生效）——
 *   「不限速基线」根本测不出来，而且测出来的数字会被误当成不限速。
 *   现在用 MOVE_CAP_SET 区分「没给」与「给了 0」。 */
const MOVE_CAP_RAW = argOf('--move-cap', '');
const MOVE_CAP_SET = MOVE_CAP_RAW !== '';
const MOVE_CAP = MOVE_CAP_SET ? (parseFloat(MOVE_CAP_RAW) || 0) : 0;
const MOVE_CAP_Z_RAW = argOf('--move-cap-z', '');
const MOVE_CAP_Z_SET = MOVE_CAP_Z_RAW !== '';
const MOVE_CAP_Z = MOVE_CAP_Z_SET ? (parseFloat(MOVE_CAP_Z_RAW) || 0) : 0;
function brainSrc(kind){
  return '(function(){\n' +
  '  var IN_MX=[],IN_MY=[];\n' +
  '  for(var i=0;i<34;i++) IN_MX.push(-0.9 + i*(1.8/33));\n' +
  '  for(var j=0;j<14;j++) IN_MY.push(j/13);\n' +
  '  function near(arr,v){ var b=0; for(var i=1;i<arr.length;i++) if(Math.abs(arr[i]-v)<Math.abs(arr[b]-v)) b=i; return b; }\n' +
  '  var KIND = ' + JSON.stringify(kind) + ';\n' +
  '  var ag = TT_PLAYER.agent;\n' +
  '  var netBest = ag.bestAction.bind(ag);\n' +
  '  function chaseBin(obs){\n' +
  '    var vz=obs.vz||0, vx=obs.vx||0, z=obs.z||0, x=obs.x||0;\n' +
  '    var pz = (obs.pz!=null) ? obs.pz : 1.32;\n' +
  '    var closing = (pz - z)*vz > 0 && Math.abs(vz) > 0.05;\n' +
  '    var tau = closing ? Math.min(1.5, Math.abs((pz - z)/vz)) : 0;\n' +
  '    var tx = x + vx*tau;\n' +
  '    if(tx > 0.9) tx = 0.9; if(tx < -0.9) tx = -0.9;\n' +
  '    return near(IN_MX, tx);\n' +
  '  }\n' +
  '  ag.bestAction = function(obs){\n' +
  '    if(KIND==="prior"){\n' +
  '      var a = netBest(obs);\n' +
  '      var topI = a & 1, ctrl = (a>>1) & 1, myI = (a>>2) % 14;\n' +
  '      return ((chaseBin(obs)*14 + myI)*2 + ctrl)*2 + topI;\n' +
  '    }\n' +
  '    var vz=obs.vz||0, vx=obs.vx||0, z=obs.z||0, x=obs.x||0;\n' +
  '    var pz = (obs.pz!=null) ? obs.pz : 1.32;\n' +
  '    var closing = (pz - z)*vz > 0 && Math.abs(vz) > 0.05;\n' +
  '    var tau = closing ? Math.min(1.5, Math.abs((pz - z)/vz)) : 0;\n' +
  '    var tx = (KIND==="chase") ? (x + vx*tau) : (KIND==="naive" ? x : 0);\n' +
  '    if(tx > 0.9) tx = 0.9; if(tx < -0.9) tx = -0.9;\n' +
  '    var my = (obs.my!=null) ? obs.my : 0.5;\n' +
  '    var i = near(IN_MX, tx), j = near(IN_MY, my);\n' +
  '    return ((i*14 + j)*2)*2 + 0;   /* ctrl=false, 不带上旋（发球不经过 bestAction） */\n' +
  '  };\n' +
  '})();';
}

if(!fs.existsSync(W)){ console.error('权重文件不存在：' + W); process.exit(2); }

function pct(x){ return (x * 100).toFixed(1) + '%'; }

/* 相持长度统计（每分一记，口径同训练侧 shots：发球算第 1 板，每击 +1） */
function rallyStats(a){
  if(!a || !a.length) return null;
  const s = a.slice().sort((x, y) => x - y);
  const sum = a.reduce((x, y) => x + y, 0);
  const q = (f) => s[Math.min(s.length - 1, Math.floor(f * s.length))];
  const hist = {};
  for(const v of a){ const b = Math.min(20, Math.floor(v / 5) * 5); hist[b] = (hist[b] || 0) + 1; }
  return { n: a.length, avg: sum / a.length, p50: q(0.5), p90: q(0.9), max: s[s.length - 1],
           over15: a.filter(v => v > 15).length,
           over10: a.filter(v => v > 10).length, hist };
}

function main(){
  const t0 = Date.now();
  /* ★ 移动预算（限速）：仿真侧（Node）与实机侧（vm）必须是同一份口径，
   * 否则就是又一次「训练/实机失配」。只影响模型控制的拍，真人不受影响。 */
  if(MOVE_CAP_SET || MOVE_CAP_Z_SET){
    const ML = require(path.join(ROOT, 'js', 'move-limit.js'));
    ML.setMoveLimit({ cap: MOVE_CAP > 0 ? MOVE_CAP : null,
                      capZ: MOVE_CAP_Z > 0 ? MOVE_CAP_Z : null });
    console.log('移动预算（限速）：横向 ' + (MOVE_CAP > 0 ? MOVE_CAP + ' m/s' : '不限') +
                '，纵向 ' + (MOVE_CAP_Z > 0 ? MOVE_CAP_Z + ' m/s' : '不限'));
  }
  /* 仿真侧（纯 Node require，与训练器完全同源） */
  let sim = null;
  if(!LIVE_ONLY){
    sim = buildSimSide(W, CONTROLLER);
    /* ★ 只有 DQN 控制器才有 DQN 网络可打印；hip / hip-intent / hip-choice 的仿真侧
     * 不建 DQN agent ⇒ 以前这里会抛 TypeError（在**开局之前**就崩，整局白跑）。 */
    const simDesc = (CONTROLLER === 'hip' || CONTROLLER === 'hip-intent' || CONTROLLER === 'hip-choice')
      ? ('控制器：' + CONTROLLER + '（解析技能层 + 可选策略层）')
      : ('权重：' + path.relative(ROOT, W) +
         (sim.agent ? ('  形状 ' + sim.agent.getNet().map(l => l.W.length + '×' + l.W[0].length).join(' → ') +
                       '  动作数 ' + sim.agent.nActions) : '') +
         (sim.meta && sim.meta.src ? '  来源 ' + sim.meta.src : ''));
    console.log(simDesc);
  }
  /* 实机侧 */
  let rig = null, step = null;
  if(!SIM_ONLY){
    process.stdout.write('载入实机管线（input-weights.js ~9.7MB）… ');
    rig = buildLiveRig(W);
    step = makeStep(rig.ctx, HZ);
    /* 限速也注入 vm 里的实机侧（vm 里 move-limit.js 是普通 script ⇒ 全局函数） */
    if(MOVE_CAP_SET || MOVE_CAP_Z_SET){
      vm.runInContext('setMoveLimit({ cap: ' + (MOVE_CAP > 0 ? MOVE_CAP : 'null') +
                      ', capZ: ' + (MOVE_CAP_Z > 0 ? MOVE_CAP_Z : 'null') + ' });', rig.ctx);
    }
    /* --serve-log：记录每次发球解算用的出球点。发球出球点由击球时刻的拍位决定，
       是训练/实机最容易漂的一处（训练写死 z=1.45/y=0.91，实机端线外 z=1.87/y=1.01）。 */
    if(HAS('--serve-log')){
      vm.runInContext('__serveFroms = []; const __so = SIM.serveShot; SIM.serveShot = function(f, o){ __serveFroms.push({ x:+f.x.toFixed(3), y:+f.y.toFixed(3), z:+f.z.toFixed(3), dir:o && o.dir }); return __so(f, o); };', rig.ctx);
    }
    console.log('完成，动作数 ' + rig.nActions + (BRAIN ? ('，决策已换成脚本脑 ' + BRAIN + '（权重仅供形状自检）') : ''));
    if(BRAIN) vm.runInContext(brainSrc(BRAIN), rig.ctx);   // 形状自检通过后再接管决策
    /* --controller hip：把实机侧的决策来源换成解析技能控制器。
     * 权重仍然照常载入（形状自检 + 管线一致性），但不再参与决策。 */
    if(CONTROLLER === 'hip' || CONTROLLER === 'hip-intent' || CONTROLLER === 'hip-choice'){
      vm.runInContext('TT_PLAYER.setController(' + JSON.stringify(CONTROLLER) + ');', rig.ctx);
      /* 注意：vm 里 `const TT_PLAYER = …` 是**词法绑定**，不是 ctx 的属性，
       * 所以 rig.ctx.TT_PLAYER 是 undefined —— 只能通过 runInContext 取值。 */
      const ctrl = vm.runInContext('TT_PLAYER.getController()', rig.ctx);
      if(ctrl !== CONTROLLER) throw new Error('TT_PLAYER.setController("' + CONTROLLER + '") 没生效（拿到 ' + ctrl + '）');
      if(CONTROLLER === 'hip-intent'){
        const ok = vm.runInContext('typeof HIP_INTENT !== "undefined" && typeof HIP_WEIGHTS !== "undefined"', rig.ctx);
        if(!ok) throw new Error('hip-intent 需要 js/hip-intent.js 与 js/hip-weights.js');
      }
      if(CONTROLLER === 'hip-choice'){
        const ok = vm.runInContext('typeof HIP_CHOICE !== "undefined" && typeof HIP_CHOICE_WEIGHTS !== "undefined"', rig.ctx);
        if(!ok) throw new Error('hip-choice 需要 js/hip-choice.js 与 js/hip-choice-weights.js');
      }
      if(HIP_CFG){
        const raw = HIP_CFG.trim().startsWith('{') ? HIP_CFG : fs.readFileSync(path.resolve(HIP_CFG), 'utf8');
        const cfgObj = JSON.parse(raw);
        vm.runInContext('HIP_SKILL.setConfig(' + JSON.stringify(cfgObj) + ');', rig.ctx);
        console.log('  HIP 旋钮覆盖：' + JSON.stringify(cfgObj));
      }
      /* --hip-probe：量化「够不到」到底是预测不准还是跑不到。
       *   探针包住 HIP 控制器的 plan，记录每一帧：
       *     预测接触点 bx（控制器内部状态）
       *     球按当前速度线性外推到拍面所在 z 平面的实际 x
       *   两者的差 = 预测误差；|实际x − 拍位x| = 跑位残差。
       *   够不到的根因就在这两个数里。 */
      if(HAS('--hip-probe')){
        vm.runInContext([
          'globalThis.__hipProbe = { cross:[], gate:[] };',
          'const __om = HIP_SKILL.makeController;',
          'HIP_SKILL.makeController = function(o){',
          '  const c = __om(o); const op = c.plan;',
          '  let prev = null;   // ★ 每侧各一份：两侧共用会互相覆盖（之前 341 次触球只记到 29 次）',
          '  c.plan = function(obs){',
          '    const r = op(obs);',
          '    const st = c.state;',
          '    const P = globalThis.__hipProbe;',
          '    if(st){ globalThis.__hipLastState = st; }',
          '    if(st && st.inb && obs.vz > 0.3){',
          '      /* 进入拍面邻域的那一帧：记录闸门状态 canHit.player / shotBouncedOpp / lastHitter */',
          '      if(Math.abs(obs.z - obs.pz) < 0.16){',
          '        P.gate.push({ canHit: (typeof canHit !== "undefined" ? canHit.player : null),',
          '                      bounced: (typeof shotBouncedOpp !== "undefined" ? shotBouncedOpp : null),',
          '                      lastHitter: (typeof lastHitter !== "undefined" ? lastHitter : null),',
          '                      dz: obs.z - obs.pz, by: obs.y, gap: Math.abs(obs.x - obs.px),',
          '                      vz: obs.vz, step: obs.vz/60, hasMeet: st.hasMeet,' +
          '                      wide: (st.hasMeet ? null : (HIP_SKILL.LAST_FAIL.wide || null)) });',
          '      }',
          '      if(prev && prev.z < obs.pz && obs.z >= obs.pz){',
          '        const W = SIM.fitWindow("forehand", SIM.relTopOf(obs.sx||0, obs.vz), obs.y,',
          '                               { x:obs.vx, y:obs.vy, z:obs.vz }, { x:obs.sx||0, y:obs.sy||0, z:0 }, true);',
          '        P.cross.push({ gap: Math.abs(obs.x - obs.px),',
          '                       perr: st.bx != null ? Math.abs(st.bx - obs.x) : null,',
          '                       by: obs.y, svx: obs.svx, tau: st.tau, vz: obs.vz,',
          '                       dz: obs.z - obs.pz, pz: obs.pz, bz: obs.z,',
          '                       fitH: W.fitH, fitV: W.fitV, fitZ: W.fitZ, high: W.high,',
          '                       prevZ: prev.z, step: obs.vz/60, ttc: (obs.pz - obs.z)/obs.vz });',
          '      }',
          '      prev = { x: obs.x, y: obs.y, z: obs.z, px: obs.px, pz: obs.pz, vx: obs.vx, vz: obs.vz, bz: obs.z };',
          '    }',
          '    return r;',
          '  };',
          '  return c;',
          '};',
          '/* ---- 直接包裹实机的 tryPlayerHit：逐帧记录每一条判据 ---- */',
          'globalThis.__hipTests = [];',
          'const __tp = tryPlayerHit;',
          'tryPlayerHit = function(){',
          '  if(lastHitter==="player" || !canHit.player){',
          '    globalThis.__hipTests.push({ why:"gate", lh:lastHitter, canHit:canHit.player });',
          '    return __tp.apply(null, arguments);',
          '  }',
          '  const stance = pushStanceOf();',
          '  const W = SIM.fitWindow(stance, relTop(), ball.pos.y, ball.vel, ball.spin, !!ctrlHold);',
          '  const g = playerPad.group.position, plane = g.z-PAD_HD;',
          '  const zF = W.fitZ || 0.05;',
          '  const swept = (_prev.z<=plane+zF && ball.pos.z>plane-zF && ball.vel.z>0);',
          '  const prox  = Math.abs(ball.pos.z-g.z)<PAD_HD+BALL_R*2+zF && ball.vel.z>-0.3;',
          '  const dx = Math.abs(ball.pos.x-g.x), limX = PAD_HW+BALL_R+W.fitH;',
          '  const dy = Math.abs(ball.pos.y-g.y), limY = PAD_HH+BALL_R+W.fitV;',
          '  const zOK = (swept||prox), xOK = dx<=limX, yOK = dy<=limY;',
          '  const st = (typeof __hipLastState !== "undefined") ? __hipLastState : null;',
          '  globalThis.__hipTests.push({ why:"test", ok:(zOK&&xOK&&yOK), decisive:zOK,',
          '    fail: zOK ? (xOK ? (yOK ? "" : "y") : "x") : "z",',
          '    swept:swept, prox:prox, dx:dx, limX:limX, dy:dy, limY:limY,',
          '    dz: ball.pos.z-g.z, zLim: PAD_HD+BALL_R*2+zF, by: ball.pos.y, PADDLE_Y: PADDLE_Y,',
          '    fitH:W.fitH, fitV:W.fitV, fitZ:W.fitZ, high:W.high, stance:stance,',
          '    hasMeet: st ? st.hasMeet : null, bounceZ: st ? st.bounceZ : null,',
          '    predBx: st ? st.bx : null, predBz: st ? st.bz : null,',
          '    vx: ball.vel.x, vz: ball.vel.z });',
          '  return __tp.apply(null, arguments);',
          '};',
          '/* ---- 记录成功触球时的高度分布（对照漏球样本）---- */',
          'globalThis.__hipHits = [];',
          '/* ---- 落点探针：玩家每次击球后，用实机出球速度复算落点 ---- */',
          'globalThis.__hipLand = [];',
          '/* 玩家（ttmouse）这一侧的出球是 TT_PLAYER.ttHit 算的（不是 physics.js#hitPlayer），',
          '   所以落点探针要挂在 ttHit 上。 */',
          'try{ const __tt = TT_PLAYER.ttHit;',
          '  TT_PLAYER.ttHit = function(){ const r = __tt.apply(null, arguments); try{ const st = globalThis.__hipLastState; const L = SIM.simulateFull({x:ball.pos.x,y:ball.pos.y,z:ball.pos.z}, {x:ball.vel.x,y:ball.vel.y,z:ball.vel.z}, "player", {x:ball.spin.x,y:ball.spin.y,z:0}, Math.random); globalThis.__hipLand.push({ ok: !!(L&&L.ok), reason: L?L.reason:null, lx: (L&&L.landing)?L.landing.x:null, lz: (L&&L.landing)?L.landing.z:null, want: st?st.want:null, bx: st?st.bx:null, spd: Math.hypot(ball.vel.x,ball.vel.y,ball.vel.z), svx: st?st.svx:null, my: (arguments[1]&&arguments[1]._my!=null)?arguments[1]._my:null, svz: (arguments[1]&&arguments[1].svz!=null)?arguments[1].svz:null, cy: ball.pos.y, cz: ball.pos.z, cx: ball.pos.x, ovx: ball.vel.x, ovy: ball.vel.y, ovz: ball.vel.z, dLand: st?st.depthLand:null, dFix: st?(st.depthFixed||0):null, dOk: st?(st.depthOk||0):null, tau: st?st.tau:null, hasMeet: st?st.hasMeet:null }); const p = globalThis.__hipPend; if(p>=0 && globalThis.__hipBounce){ globalThis.__hipBounce[p].hit = true; globalThis.__hipPend = -1; } }catch(e){} return r; };',
          '}catch(e){}',
          '/* ---- 弹跳探针：每次台面弹跳记一次（含后续是否被玩家回击）---- */',
          'globalThis.__hipBounce = [];',
          'globalThis.__hipPend = -1;',
          'try{ const __tb = globalThis.tableBounce;',
          '  globalThis.tableBounce = function(){ try{ const st = globalThis.__hipLastState; const g = playerPad.group.position; globalThis.__hipBounce.push({ bx: ball.pos.x, bz: ball.pos.z, py: ball.pos.y, vz: ball.vel.z, vy: ball.vel.y, t: elapsed, hit: false, pz: st?st.padZ:null, bzPred: st?st.bounceZ:null, px: g.x, pzNow: g.z, bxPred: st?st.bx:null }); globalThis.__hipPend = globalThis.__hipBounce.length-1; }catch(e){} return __tb.apply(null, arguments); };',
          '}catch(e){}',
          'const __hp = hitPlayer, __hap = hitAIForPlayer;',
          'const __rec = () => { globalThis.__hipHits.push({ by: ball.pos.y, gz: playerPad.group.position.z, high: ball.pos.y > TABLE_TOP+0.13 }); };',
          'hitPlayer = function(){ __rec(); return __hp.apply(null, arguments); };',
          'hitAIForPlayer = function(){ __rec(); return __hap.apply(null, arguments); };'
        ].join('\n'), rig.ctx);
      }
    }
    /* --no-prior：关掉 input-agent 的横向拦截先验（回退到纯 argmax）。
     * 用途：A/B —— 烘焙时必须能区分「提升来自新权重」还是「来自先验」。
     * 先验现已在 input-agent.js 内置且默认开，所以「线上老权重 + 新代码」
     * 本身就已经比 R4 的基线强很多；不带这个开关就没法做同口径比较。
     *
     * ★ 两个坑（都实测踩过，结果都是「A/B 两组逐位相同」）：
     *   1) 必须走 TT_PLAYER.setLateralPrior：agent 是延迟创建的（ensureWeights 之后才 init），
     *      rig 构建时 TT_PLAYER.agent 还是 null，直接调 agent 的方法会被守卫静默跳过；
     *   2) vm 里的 `const TT_PLAYER = …` 是**词法绑定**，rig.ctx.TT_PLAYER 是 undefined
     *      （同 --controller 那段注释）⇒ 只能通过 runInContext 调用。 */
    if(HAS('--no-prior')){
      vm.runInContext('TT_PLAYER.setLateralPrior(false);', rig.ctx);
      if(vm.runInContext('TT_PLAYER.getLateralPrior()', rig.ctx) !== false) throw new Error('--no-prior 没有生效');
    }
  }

  /* --hell-vec <file>：把「地狱档」的策略整体换成 {vec:[42]} 检查点里的向量。
   * 用途：候选地狱的实机复核（HIP/DQN vs 新旧地狱），全程不触碰 js/learned-policy.js。
   * 实现：vm 里 learned-policy.js 的 LEARNED_POLICY 是 const 词法绑定 —— 不可重绑，
   * 但对象属性可以原地改写（strongVec() 每次调用现读它，policyForModel('hell')
   * 走 strongVec()）。写完在 vm 里回读 strongVec() 逐维校验，不一致直接抛错。
   * 注意：只影响从 LEARNED_POLICY 派生的 hell 档；grandslam/nemesis 各有自己的文件，不受影响。
   * 前三条护栏维（moveSpeed/moveErr/moveZ）由 strongVec() 硬写，注入前后一致。 */
  if(HELL_VEC && rig){
    const candVec = JSON.parse(fs.readFileSync(path.resolve(HELL_VEC), 'utf8')).vec;
    const Pn = require(path.join(ROOT, 'js', 'policy.js'));
    const candObj = Pn.unflattenPolicy(candVec);
    vm.runInContext('Object.assign(LEARNED_POLICY, ' + JSON.stringify(candObj) + ');', rig.ctx);
    const back = vm.runInContext('strongVec().map(function(v){return +v.toFixed(12)}).join(",")', rig.ctx);
    const merged = Object.assign({}, candObj, { moveSpeed: 2.8, moveErr: 0.03, moveZ: 2.6 });
    const want = Pn.flattenPolicy(merged).map(v => +v.toFixed(12)).join(',');
    const bad = back.split(',').filter((v, i) => v !== want.split(',')[i]).length;
    if(bad > 0) throw new Error('--hell-vec 注入校验失败：' + bad + ' 维不一致');
    console.log('[hell-vec] 已注入 ' + HELL_VEC + '（strongVec 回读校验 42/42 一致）');
  }

  const rows = [];
  for(const tag of OPP_TAGS){
    /* ---- 实机管线 ---- */
    let live = null;
    if(rig){
      /* DQN 站哪一侧由 --side 决定；另一侧放阶梯对手。
       * setCurrentPolicy 让两侧「策略层」出球都用本档策略——等价于实机把该档
       * 选为当前策略，且避免每板重复 unflattenPolicy。 */
      vm.runInContext(`setCurrentPolicy(policyForModel(${JSON.stringify(tag)}));`, rig.ctx);
      if(SIDE === 'ai') vm.runInContext('mode="watch"; fightL=' + JSON.stringify(tag) + '; fightR="ttmouse"; aiModel="standard";', rig.ctx);
      else vm.runInContext('mode="watch"; fightL="ttmouse"; fightR=' + JSON.stringify(tag) + '; aiModel="standard";', rig.ctx);
      const dqnIsAi = SIDE === 'ai';
      let dqnPts = 0, oppPts = 0, lostAgg = null, dqnContacts = 0, oppContacts = 0, frames = 0;
      const gameLog = [];
      const rallyAll = [];
      for(let g = 0; g < GAMES; g++){
        const r = playGame(rig, step, SEED + 4242, g, MAXSEC);
        const dq = dqnIsAi ? r.ai : r.you, op = dqnIsAi ? r.you : r.ai;
        dqnPts += dq; oppPts += op; frames += r.frames;
        if(r.rally) for(const v of r.rally) rallyAll.push(v);
        gameLog.push({ g, dq, op, frames: r.frames });
        if(r.stats){
          const side = dqnIsAi ? 'ai' : 'player', oSide = dqnIsAi ? 'player' : 'ai';
          dqnContacts += r.stats[side].contacts; oppContacts += r.stats[oSide].contacts;
          const L = r.stats[side].lostBy;
          lostAgg = lostAgg || { net: 0, out: 0, double: 0, serve: 0, other: 0, noreach: 0 };
          for(const k in lostAgg) if(L[k] != null) lostAgg[k] += L[k];
        }
      }
      live = { dqn: dqnPts, opp: oppPts, rate: (dqnPts + oppPts) ? dqnPts / (dqnPts + oppPts) : 0.5,
               lost: lostAgg, dqnContacts, oppContacts, frames,
               /* ★ 停摆检测：一局在 maxsec 内一分都没打出来 ⇒ 这局是「拉锯到超时」。
                 * 分点率的分母因此会偏小（小样本高胜率），比较不同配置时必须看这个数。 */
               stalled: gameLog.filter(x => (x.dq + x.op) === 0).length,
               rally: rallyStats(rallyAll),
               games: gameLog };
    }
    /* ---- 仿真管线 ---- */
    let sv = null;
    if(sim){
      if(!OPP_TAGS.includes(tag)) continue;
      sv = simMatch(sim, tag, GAMES, SEED);
    }
    rows.push({ tag, live, sv });
  }

  console.log('');
  console.log('实机管线 vs 仿真管线（同一权重 · 同一种子 · 每档 ' + GAMES + ' 局 · ' + HZ + 'Hz）');
  console.log('='.repeat(96));
  console.log('  DQN 位置：' + (SIDE === 'ai' ? 'AI 侧（镜像路径，与真人对战时一致）'
                                          : '玩家侧（不镜像，与训练口径一致）'));
  console.log('');
  console.log('  ' + '对手'.padEnd(13) + '实机分点率'.padEnd(12) + '仿真分点率'.padEnd(12) +
              'Δ'.padEnd(10) + '实机触球(己/敌)'.padEnd(18) + '实机相持(均/超15)');
  console.log('  ' + '-'.repeat(92));
  let worst = 0;
  for(const r of rows){
    const lv = r.live ? pct(r.live.rate) : '—';
    const sv2 = r.sv ? pct(r.sv.rate) : '—';
    let d = '—';
    if(r.live && r.sv){
      const dd = (r.live.rate - r.sv.rate) * 100;
      d = (dd >= 0 ? '+' : '') + dd.toFixed(1) + 'pp';
      if(Math.abs(dd) > Math.abs(worst)) worst = dd;
    }
    const ct = r.live ? (r.live.dqnContacts + ' / ' + r.live.oppContacts) : '—';
    const rl = (r.live && r.live.rally)
      ? (r.live.rally.avg.toFixed(1) + ' / ' + r.live.rally.over15 + '分(' + r.live.rally.n + '分)')
      : '—';
    console.log('  ' + r.tag.padEnd(13) + lv.padEnd(12) + sv2.padEnd(12) + d.padEnd(10) + ct.padEnd(18) + rl);
  }
  if(rows.some(r => r.live && r.live.lost)){
    console.log('');
    console.log('  实机失分原因分解（DQN 侧，跨全部档）：');
    const agg = { net: 0, out: 0, double: 0, serve: 0, other: 0, noreach: 0 };
    for(const r of rows) if(r.live && r.live.lost) for(const k in agg) agg[k] += r.live.lost[k] || 0;
    const tot = Object.values(agg).reduce((a, b) => a + b, 0) || 1;
    for(const k in agg) console.log('    ' + k.padEnd(9) + String(agg[k]).padStart(5) +
      '  ' + ((agg[k] / tot) * 100).toFixed(1) + '%' + '  ' + '█'.repeat(Math.round(agg[k] / tot * 40)));
    /* 够不到 = noreach（未能回球/回球失败）+ double（双跳）。
     * 原来这里写的是 agg.other + agg.double —— other 是 reasonOf 的**兜底类**
     * （消息没匹配任何关键词），不是"够不到"。于是汇总行与上面逐项打印自相矛盾：
     * 分项明明打 noreach 499 / 95.6%，汇总却报「够不到 = 0 / 522 = 0.0%」。
     * 这个数字恰恰是判断"是不是深度/站位问题"的第一证据，算错就等于把结论
     * 指向相反方向（2026-10-08 input3-hell12h 收尾就是这样被读成 0%）。 */
    const reach = (agg.noreach + agg.double);
    console.log('    —— 够不到（未能回球 + 双跳）= ' + reach + ' / ' + tot +
                ' = ' + ((reach / tot) * 100).toFixed(1) + '%');
    console.log('    —— 自己出界/下网           = ' + (agg.out + agg.net) + ' / ' + tot +
                ' = ' + (((agg.out + agg.net) / tot) * 100).toFixed(1) + '%');
    if(agg.other) console.log('    —— 未归类（other）          = ' + agg.other + ' / ' + tot +
                ' = ' + ((agg.other / tot) * 100).toFixed(1) + '%');
  }
  console.log('');
  console.log('  耗时 ' + ((Date.now() - t0) / 1000).toFixed(1) + 's');
  if(HAS('--serve-log') && rig){
    const fs2 = vm.runInContext('__serveFroms.slice(0, 12)', rig.ctx);
    console.log('  发球出球点（前 12 次）：');
    for(const f of fs2) console.log('    x=' + String(f.x).padStart(7) + '  y=' + String(f.y).padStart(6) +
                                   '  z=' + String(f.z).padStart(7) + '  dir=' + f.dir);
  }
  console.log('');
  if(HAS('--hip-probe') && rig){
    const p = vm.runInContext('(()=>{ const C = (globalThis.__hipProbe.cross||[]); const q=(a,f)=>{ if(!a.length) return "-"; const b=a.slice().sort((x,y)=>x-y); return b[Math.min(b.length-1,Math.floor(f*b.length))].toFixed(3); }; const g=(f)=>C.map(c=>c[f]).filter(v=>v!=null); return { n:C.length, p50Gap:q(g("gap"),0.5), p90Gap:q(g("gap"),0.9), p50Err:q(g("perr"),0.5), p90Err:q(g("perr"),0.9), p50By:q(g("by"),0.5), p50Dz:q(g("dz"),0.5), p90Dz:q(g("dz"),0.9), p50FitH:q(g("fitH"),0.5), p50FitV:q(g("fitV"),0.5), p50FitZ:q(g("fitZ"),0.5), hiRate: (C.length? (C.filter(c=>c.high).length/C.length*100).toFixed(0) : "-"), p50Step:q(g("vz"),0.5), p50PrevZ:q(g("prevZ"),0.5) }; })()', rig.ctx);
    console.log('  HIP 探针（**漏球**样本 n=' + p.n + '）：');
    console.log('    落点差 |球x−拍位x| p50 ' + p.p50Gap + ' p90 ' + p.p90Gap + '   预测误差 p50 ' + p.p50Err + ' p90 ' + p.p90Err);
    console.log('    触球高度 p50 ' + p.p50By + '（>0.89 才是高球，本样本高球率 ' + p.hiRate + '%）');
    console.log('    球z − 拍z p50 ' + p.p50Dz + ' p90 ' + p.p90Dz + '  （接触窗口 ±' + (0.09) + 'm）');
    console.log('    拟合窗口 fitH ' + p.p50FitH + ' fitV ' + p.p50FitV + ' fitZ ' + p.p50FitZ);
    const g = vm.runInContext('(()=>{ const G = globalThis.__hipProbe.gate||[]; const n=G.length; const c=(f)=>G.filter(x=>x[f]===true).length; const cF=(f)=>G.filter(x=>x[f]===false).length; const q=(a,f)=>{ if(!a.length) return "-"; const b=a.slice().sort((x,y)=>x-y); return b[Math.min(b.length-1,Math.floor(f*b.length))].toFixed(3); }; return { n, canHitTrue:c("canHit"), canHitFalse:cF("canHit"), bouncedTrue:c("bounced"), lastAi:c("lastHitter")===c("lastHitter")?0:G.filter(x=>x.lastHitter==="ai").length, dz:q(G.map(x=>x.dz),0.5) }; })()', rig.ctx);
    console.log('    闸门采样 n=' + g.n + '：canHit=true ' + g.canHitTrue + ' / false ' + g.canHitFalse +
                '；球已落台(bounced=true) ' + g.bouncedTrue);
    const g2 = vm.runInContext('(()=>{ const G = globalThis.__hipProbe.gate||[]; const nm = G.filter(x=>x.hasMeet===false); const q=(a,f)=>{ if(!a.length) return "-"; const b=a.slice().sort((x,y)=>x-y); return b[Math.min(b.length-1,Math.floor(f*b.length))].toFixed(3); }; return { nm: nm.length, withWide: nm.filter(x=>x.wide).length, wideZ: q(nm.filter(x=>x.wide).map(x=>x.wide.z),0.5), wideZmin: q(nm.filter(x=>x.wide).map(x=>x.wide.z),0), wideZmax: q(nm.filter(x=>x.wide).map(x=>x.wide.z),0.999), wideY: q(nm.filter(x=>x.wide).map(x=>x.wide.y),0.5) }; })()', rig.ctx);
    console.log('    预测失败帧 n=' + g2.nm + '：放宽窗口后仍能找到落台点 ' + g2.withWide + '（z p50 ' + g2.wideZ + ' 最小 ' + g2.wideZmin + ' 最大 ' + g2.wideZmax + '，球高 p50 ' + g2.wideY + '）→ 找不到 = 该球在玩家半台没弹起');
    const t = vm.runInContext('(()=>{ const T = globalThis.__hipTests||[]; const tests=T.filter(x=>x.why==="test"); const gates=T.filter(x=>x.why==="gate"); const n=tests.length; const dec=tests.filter(x=>x.decisive); const q=(a,f)=>{ if(!a.length) return "-"; const b=a.slice().sort((x,y)=>x-y); return b[Math.min(b.length-1,Math.floor(f*b.length))].toFixed(3); }; const H=globalThis.__hipHits||[]; const yf=dec.filter(x=>x.fail==="y"); return { n, gates:gates.length, dec:dec.length, failX:dec.filter(x=>x.fail==="x").length, failY:yf.length, okInDec:dec.filter(x=>x.ok).length, dx:q(dec.map(x=>x.dx),0.5), limX:q(dec.map(x=>x.limX),0.5), dy:q(dec.map(x=>x.dy),0.5), limY:q(dec.map(x=>x.limY),0.5), by:q(dec.map(x=>x.by),0.5), hiDec:dec.filter(x=>x.high).length, yFailBy:q(yf.map(x=>x.by),0.5), yFailDy:q(yf.map(x=>x.dy),0.5), yFailMin:yf.length?q(yf.map(x=>x.by),0):"-", yFailMax:yf.length?q(yf.map(x=>x.by),0.999):"-", yFailGz:q(yf.map(x=>x.gz||0),0.5), hitN:H.length, hitBy:q(H.map(x=>x.by),0.5), hitHi:H.filter(x=>x.high).length, hitGz:q(H.map(x=>x.gz),0.5) }; })()', rig.ctx);
    console.log('    ★ tryPlayerHit 判据：总调用 ' + t.n + '，闸门拦截 ' + t.gates + '，**球已到拍面深度**的帧 ' + t.dec + '（决定性帧）');
    console.log('      决定性帧里：放行 ' + t.okInDec + '，x 超限 ' + t.failX + '，y 超限 ' + t.failY);
    console.log('      决定性帧 |球x−拍x| p50 ' + t.dx + '（容差 ' + t.limX + '）；|球y−拍y| p50 ' + t.dy + '（容差 ' + t.limY + '）；球高 p50 ' + t.by + '，高球帧 ' + t.hiDec);
    console.log('      y 超限帧的球高 p50 ' + t.yFailBy + '（min ' + t.yFailMin + ' / max ' + t.yFailMax + '），|Δy| p50 ' + t.yFailDy);
    const f2 = vm.runInContext('(()=>{ const T=(globalThis.__hipTests||[]).filter(x=>x.why==="test"&&x.decisive); const f=T.filter(x=>x.fail==="y"), o=T.filter(x=>x.ok); const q=(a,f)=>{ if(!a.length) return "-"; const b=a.slice().sort((x,y)=>x-y); return b[Math.min(b.length-1,Math.floor(f*b.length))].toFixed(3); }; const hm=(a)=>a.filter(x=>x.hasMeet).length; return { fNoMeet:f.length-hm(f), fHasMeet:hm(f), fBounceZ:q(f.map(x=>x.bounceZ),0.5), oNoMeet:o.length-hm(o), oHasMeet:hm(o), oBounceZ:q(o.map(x=>x.bounceZ),0.5), fGz:q(f.map(x=>x.dz),0.5) }; })()', rig.ctx);
    console.log('      漏球帧：有落台预测 ' + f2.fHasMeet + '/' + f2.fNoMeet + f2.fNoMeet + '（无预测 ' + f2.fNoMeet + '），预测落台 z p50 ' + f2.fBounceZ);
    console.log('      成功帧：有落台预测 ' + f2.oHasMeet + '，无 ' + f2.oNoMeet + '，预测落台 z p50 ' + f2.oBounceZ);
    console.log('      成功触球 n=' + t.hitN + '：触球高度 p50 ' + t.hitBy + '，高球占比 ' + (t.hitN ? (t.hitHi / t.hitN * 100).toFixed(0) : '-') + '%，拍面 z p50 ' + t.hitGz);
    /* 落点探针：请求的落点（want） vs 实机出球速度复算出来的落点（lx） */
    const ld = vm.runInContext('(()=>{ const L=(globalThis.__hipLand||[]); const q=(a,f)=>{ if(!a.length) return "-"; const b=a.slice().sort((x,y)=>x-y); return b[Math.min(b.length-1,Math.floor(f*b.length))].toFixed(3); }; const mean=(a)=>a.length?(a.reduce((s,v)=>s+v,0)/a.length).toFixed(3):"-"; const ok=L.filter(x=>x.ok&&x.lx!=null); const wide=ok.filter(x=>x.want!=null&&Math.abs(x.want)>0.4); const near=ok.filter(x=>x.want!=null&&Math.abs(x.want)<=0.1); const rs={}; L.forEach(x=>{ if(!x.ok) rs[x.reason||"?"]=(rs[x.reason||"?"]||0)+1; }); return { n:L.length, ok:ok.length, rs:JSON.stringify(rs), lxP10:q(ok.map(x=>x.lx),0.1), lxP50:q(ok.map(x=>x.lx),0.5), lxP90:q(ok.map(x=>x.lx),0.9), lzP50:q(ok.map(x=>x.lz),0.5), wideN:wide.length, wideP10:q(wide.map(x=>x.lx),0.1), wideP50:q(wide.map(x=>x.lx),0.5), wideP90:q(wide.map(x=>x.lx),0.9), nearN:near.length, nearP50:q(near.map(x=>x.lx),0.5), offWide:mean(wide.map(x=>x.want-x.lx)), offNear:mean(near.map(x=>x.want-x.lx)), spdP50:q(ok.map(x=>x.spd),0.5), spdP90:q(ok.map(x=>x.spd),0.9), svxP50:q(ok.map(x=>x.svx),0.5), svxAbsP50:q(ok.map(x=>Math.abs(x.svx||0)),0.5), svxAbsP90:q(ok.map(x=>Math.abs(x.svx||0)),0.9), dFixN: L.filter(x=>x.dFix>0).length, dLandBadP50: q(L.filter(x=>!x.ok).map(x=>x.dLand),0.5), dLandOkP50: q(ok.map(x=>x.dLand),0.5), tauP50: q(L.map(x=>x.tau),0.5), meetN: L.filter(x=>x.hasMeet).length }; })()', rig.ctx);
    console.log('    ★ 落点探针：玩家出球 n=' + ld.n + '（合法落台 ' + ld.ok + '，失败原因 ' + ld.rs + '）');
    console.log('      落点 x 分位 p10 ' + ld.lxP10 + ' p50 ' + ld.lxP50 + ' p90 ' + ld.lxP90 + '；落点 |z| p50 ' + ld.lzP50);
    console.log('      请求 |want|>0.4 的球 n=' + ld.wideN + '：落点 x p10 ' + ld.wideP10 + ' p50 ' + ld.wideP50 + ' p90 ' + ld.wideP90 + '（请求−落点 平均 ' + ld.offWide + '）');
    console.log('      请求 |want|≤0.1 的球 n=' + ld.nearN + '：落点 x p50 ' + ld.nearP50 + '（请求−落点 平均 ' + ld.offNear + '）');
    console.log('      ★ 出球速度 p50 ' + ld.spdP50 + ' p90 ' + ld.spdP90 + '；拍速 |svx| p50 ' + ld.svxAbsP50 + ' p90 ' + ld.svxAbsP90 + '（svx = 出球核的 swipe ⇒ 决定速度倍率）');
    /* 弹跳探针：玩家半台上的每次弹跳 + 随后是否被回击 */
    const bc = vm.runInContext('(()=>{ const A=(globalThis.__hipBounce||[]).filter(x=>x.bz>0); const q=(a,f)=>{ const bb=a.filter(v=>v!=null); if(!bb.length) return "-"; const b=bb.slice().sort((x,y)=>x-y); return b[Math.min(b.length-1,Math.floor(f*b.length))].toFixed(3); }; const med=(a)=>q(a,0.5); const B=[[0,0.7],[0.7,0.9],[0.9,1.1],[1.1,1.45]]; const rows=B.map(r=>{ const S=A.filter(x=>x.bz>=r[0]&&x.bz<r[1]); const H=S.filter(x=>x.hit); const M=S.filter(x=>!x.hit); const dx=(L)=>med(L.map(x=>Math.abs(x.bx-x.px))); const dz=(L)=>med(L.map(x=>x.pzNow-x.bz)); return r[0]+"-"+r[1]+" n="+S.length+" hit="+(S.length?(H.length/S.length*100).toFixed(0):"-")+"% dxHit="+dx(H)+" dxMiss="+dx(M)+" dzNowHit="+dz(H)+" dzNowMiss="+dz(M)+" vyH="+med(H.map(x=>Math.abs(x.vy)))+" vyM="+med(M.map(x=>Math.abs(x.vy)))+" vzH="+med(H.map(x=>Math.abs(x.vz)))+" vzM="+med(M.map(x=>Math.abs(x.vz))); }); const M=A.filter(x=>!x.hit); return { n:A.length, rows:rows.join(" | "), mErrP50:med(M.map(x=>x.bzPred!=null?x.bz-x.bzPred:null)), mNoPred:M.filter(x=>x.bzPred==null).length }; })()', rig.ctx);
    console.log('    ★ 弹跳探针（玩家半台）：弹跳 n=' + bc.n + '（未回击里无预测 ' + bc.mNoPred + '）');
    console.log('      误差中位数（实际−预测）：未回击 ' + bc.mErrP50 + '，已回击 ' + bc.hErrP50);
    console.log('      ' + bc.rows);
  }

  /* ---- --json：结构化结果落盘（tools/hip-eval.js 的闸门输入）---- */
  if(JSON_OUT){
    const byTier = {};
    for(const r of rows){
      if(!r.live) continue;
      const n = r.live.dqn + r.live.opp;
      const p = n ? r.live.dqn / n : 0.5;
      byTier[r.tag] = {
        dqnPts: r.live.dqn, oppPts: r.live.opp, points: n,
        rate: p,
        ci95: n ? 1.96 * Math.sqrt(p * (1 - p) / n) : 0,
        lost: r.live.lost || null,
        dqnContacts: r.live.dqnContacts, oppContacts: r.live.oppContacts,
        frames: r.live.frames,
        /* ★ 停摆局数（一局在 maxsec 内 0 分）与逐局比分。
         * 分点率的分母 = 实际打出的分数；若大量局停摆，样本会变得很小、
         * 胜率会虚高，比较不同配置时必须同时看 stalled。 */
        stalled: r.live.stalled != null ? r.live.stalled : 0,
        /* ★ 相持长度（每分一记，口径同训练侧 shots）—— 判断「相持惩罚」类改动
         * 是否切题、以及上线模型会不会触发阈值，都靠这个数。 */
        rally: r.live.rally || null,
        games: r.live.games || null,
        simRate: r.sv ? r.sv.rate : null,
      };
    }
    const out = {
      tool: 'live-match', controller: CONTROLLER, weights: path.relative(ROOT, W),
      side: SIDE, seed: parseInt(SEED, 10), games: GAMES, hz: HZ, maxsec: MAXSEC,
      elapsedSec: +((Date.now() - t0) / 1000).toFixed(1),
      byTier,
    };
    /* 探针原始数据（--hip-probe 时）：落点逐球记录，离线分析失败形态用。
     * 上限 4000 条，避免 JSON 过大。 */
    if(HAS('--hip-probe') && rig.ctx){
      try{
        const pl = vm.runInContext('(globalThis.__hipLand||[]).slice(0,4000)', rig.ctx);
        if(pl && pl.length) out.probeLand = pl;
      }catch(e){}
    }
    fs.writeFileSync(path.resolve(JSON_OUT), JSON.stringify(out, null, 2));
    console.log('  JSON 结果已写入 ' + path.relative(ROOT, path.resolve(JSON_OUT)));
  }

  if(isFinite(TOL)){
    const ok = Math.abs(worst) <= TOL;
    console.log(ok
      ? '结论: |Δ| = ' + Math.abs(worst).toFixed(1) + 'pp ≤ 容差 ' + TOL + 'pp  ✓ PASS'
      : '结论: |Δ| = ' + Math.abs(worst).toFixed(1) + 'pp > 容差 ' + TOL + 'pp  ✗ FAIL —— 训练/实机仍失配');
    process.exit(ok ? 0 : 1);
  }
}

main();
