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
  'input-weights.js',        // 烘焙权重（~9.7MB，懒加载同款）
  'state.js',                // 全局状态变量
  'tt-stats.js',             // 遥测（提供 reasonOf 归类）
  'physics.js',              // ★ 真实物理/触球/出球
  'ai.js',                   // ★ 真实 AI 跑位 + 赌博机
  'rules.js',                // ★ 真实规则/发球/判分
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
  const snap = vm.runInContext('({ y: scoreYou, a: scoreAi, st: TT_STATS.snapshot() })', ctx);
  return { you: snap.y, ai: snap.a, stats: snap.st, frames: Math.ceil(t * 60) };
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
function buildSimSide(weightsFile){
  const PP = require(path.join(ROOT, 'js', 'policy.js'));
  const SIM = require(path.join(ROOT, 'js', 'simcore.js'));
  const INPUTSIM = require(path.join(ROOT, 'js', 'input-sim.js'));
  const IA = require(path.join(ROOT, 'js', 'input-agent.js'));
  const OPP = require(path.join(ROOT, 'js', 'opponent-ladder.js'));
  global.SIM = SIM; global.P = PP;
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

if(!fs.existsSync(W)){ console.error('权重文件不存在：' + W); process.exit(2); }

function pct(x){ return (x * 100).toFixed(1) + '%'; }

function main(){
  const t0 = Date.now();
  /* 仿真侧（纯 Node require，与训练器完全同源） */
  let sim = null;
  if(!LIVE_ONLY){
    sim = buildSimSide(W);
    console.log('权重：' + path.relative(ROOT, W) +
                '  形状 ' + sim.agent.getNet().map(l => l.W.length + '×' + l.W[0].length).join(' → ') +
                '  动作数 ' + sim.agent.nActions +
                (sim.meta && sim.meta.src ? '  来源 ' + sim.meta.src : ''));
  }
  /* 实机侧 */
  let rig = null, step = null;
  if(!SIM_ONLY){
    process.stdout.write('载入实机管线（input-weights.js ~9.7MB）… ');
    rig = buildLiveRig(W);
    step = makeStep(rig.ctx, HZ);
    /* --serve-log：记录每次发球解算用的出球点。发球出球点由击球时刻的拍位决定，
       是训练/实机最容易漂的一处（训练写死 z=1.45/y=0.91，实机端线外 z=1.87/y=1.01）。 */
    if(HAS('--serve-log')){
      vm.runInContext('__serveFroms = []; const __so = SIM.serveShot; SIM.serveShot = function(f, o){ __serveFroms.push({ x:+f.x.toFixed(3), y:+f.y.toFixed(3), z:+f.z.toFixed(3), dir:o && o.dir }); return __so(f, o); };', rig.ctx);
    }
    console.log('完成，动作数 ' + rig.nActions);
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
      for(let g = 0; g < GAMES; g++){
        const r = playGame(rig, step, SEED + 4242, g, MAXSEC);
        const dq = dqnIsAi ? r.ai : r.you, op = dqnIsAi ? r.you : r.ai;
        dqnPts += dq; oppPts += op; frames += r.frames;
        if(r.stats){
          const side = dqnIsAi ? 'ai' : 'player', oSide = dqnIsAi ? 'player' : 'ai';
          dqnContacts += r.stats[side].contacts; oppContacts += r.stats[oSide].contacts;
          const L = r.stats[side].lostBy;
          lostAgg = lostAgg || { net: 0, out: 0, double: 0, serve: 0, other: 0, noreach: 0 };
          for(const k in lostAgg) if(L[k] != null) lostAgg[k] += L[k];
        }
      }
      live = { dqn: dqnPts, opp: oppPts, rate: (dqnPts + oppPts) ? dqnPts / (dqnPts + oppPts) : 0.5,
               lost: lostAgg, dqnContacts, oppContacts, frames };
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
              'Δ'.padEnd(10) + '实机触球(己/敌)');
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
    console.log('  ' + r.tag.padEnd(13) + lv.padEnd(12) + sv2.padEnd(12) + d.padEnd(10) + ct);
  }
  if(rows.some(r => r.live && r.live.lost)){
    console.log('');
    console.log('  实机失分原因分解（DQN 侧，跨全部档）：');
    const agg = { net: 0, out: 0, double: 0, serve: 0, other: 0, noreach: 0 };
    for(const r of rows) if(r.live && r.live.lost) for(const k in agg) agg[k] += r.live.lost[k] || 0;
    const tot = Object.values(agg).reduce((a, b) => a + b, 0) || 1;
    for(const k in agg) console.log('    ' + k.padEnd(9) + String(agg[k]).padStart(5) +
      '  ' + ((agg[k] / tot) * 100).toFixed(1) + '%' + '  ' + '█'.repeat(Math.round(agg[k] / tot * 40)));
    const reach = (agg.other + agg.double);
    console.log('    —— 够不到（未能回球 + 双跳）= ' + reach + ' / ' + tot +
                ' = ' + ((reach / tot) * 100).toFixed(1) + '%');
    console.log('    —— 自己出界/下网           = ' + (agg.out + agg.net) + ' / ' + tot +
                ' = ' + (((agg.out + agg.net) / tot) * 100).toFixed(1) + '%');
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

  if(isFinite(TOL)){
    const ok = Math.abs(worst) <= TOL;
    console.log(ok
      ? '结论: |Δ| = ' + Math.abs(worst).toFixed(1) + 'pp ≤ 容差 ' + TOL + 'pp  ✓ PASS'
      : '结论: |Δ| = ' + Math.abs(worst).toFixed(1) + 'pp > 容差 ' + TOL + 'pp  ✗ FAIL —— 训练/实机仍失配');
    process.exit(ok ? 0 : 1);
  }
}

main();
