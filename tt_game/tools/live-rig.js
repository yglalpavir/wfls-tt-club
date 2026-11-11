/* =====================================================================
 *  live-rig.js — 「实机管线」可复用装配层（从 tools/live-match.js 抽出）
 * =====================================================================
 *
 *  为什么要有这个模块（2026-10-27，R1.2）
 * -------------------------------------
 *  live-match.js 一直是「只批处理」的：main() 从 argv 读参数 → 建一台 rig →
 *  跑完打印 → 退出。所有在环研究（轨迹采集、进程内训练、CMA 类实机搜索）
 *  都只能靠「每点起一个进程」来做，而 rig 构建要 parse ~10MB 的
 *  input-weights.js（≈2-4s），决策帧带宽也过不了 JSON 导出。
 *  本模块把 live-match.js 的装配层原样抽出来（同一段代码，不重写，
 *  避免重演「手抄副本对比」的漂移史），暴露成进程内 API：
 *
 *    const { buildRig, makeStep, playGame, setOpp } = require('./live-rig.js');
 *    const rig = buildRig({ controller: 'hip', hipCfg: {…}, moveCap: 2.0 });
 *    const r = playGame(rig, rig.step, seed, gameIdx, maxSec);   // ~4s/局（11 分）
 *
 *  与 live-match.js 的关系
 * ----------------------
 *  live-match.js 仍是 CLI 判据（唯一验收口径）；本模块是它的**进程内子集**
 *  （makeThree / PRELUDE_HEAD / PRELUDE_BODY / PIPELINE / liveWeightsSource /
 *   buildLiveRig / makeStep / playGame / mulberry32 / rallyStats 逐字复制）。
 *  改装配层时**两处同步**：要么两边都改，要么把 live-match 迁移到 require 本模块。
 *  （R1 采取后者：先并行存在，live-match 的下一处装配层修改时一并迁移。）
 * ===================================================================== */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
const JSD = f => path.join(ROOT, 'js', f);
const DEFAULT_W = path.join(ROOT, 'js', 'input-weights.js');

function mulberry32(a){
  return function(){
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

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

/* ---------------- 进程内装配 API ----------------
 * buildRig(opts) —— 一台「实机」= vm context + 管线 + 控制器 + 限速。
 *   opts: { controller='hip', hipCfg=null(obj), moveCap=null(number|null), weights=null(path) }
 * 返回 { ctx, step, playGame, setOpp, nActions }。
 * setOpp(tag) —— 把对手档切到 tag（'hell'/'default'/'grandslam'/'nemesis'/'elite'/…）。 */
function buildRig(opts){
  const o = opts || {};
  const controller = o.controller || 'hip';
  const weightsFile = o.weights || DEFAULT_W;
  const rig = buildLiveRig(weightsFile);
  const step = makeStep(rig.ctx, 60);
  /* 限速：显式传（0/负 = 不限）才注入；不传 = 出厂默认 2.0（与浏览器同份） */
  if(o.moveCap !== undefined && o.moveCap !== null){
    const cap = (o.moveCap > 0) ? o.moveCap : null;
    const capZ = (o.moveCapZ > 0) ? o.moveCapZ : null;
    vm.runInContext('setMoveLimit({ cap: ' + (cap || 'null') + ', capZ: ' + (capZ || 'null') + ' });', rig.ctx);
  }
  if(controller === 'hip' || controller === 'hip-intent' || controller === 'hip-choice'){
    vm.runInContext('TT_PLAYER.setController(' + JSON.stringify(controller) + ');', rig.ctx);
    const got = vm.runInContext('TT_PLAYER.getController()', rig.ctx);
    if(got !== controller) throw new Error('TT_PLAYER.setController("' + controller + '") 没生效（拿到 ' + got + '）');
    if(o.hipCfg){
      vm.runInContext('HIP_SKILL.setConfig(' + JSON.stringify(o.hipCfg) + ');', rig.ctx);
      const back = vm.runInContext('JSON.stringify(HIP_SKILL.getConfig())', rig.ctx);
      const want = JSON.stringify(Object.assign({}, JSON.parse(back), o.hipCfg));
      if(back !== want) throw new Error('HIP_SKILL.setConfig 回读不一致');
    }
  }
  const api = {
    ctx: rig.ctx,
    nActions: rig.nActions,
    step: () => step(),
    playGame: (seedBase, gameIdx, maxSec) => playGame(rig, step, seedBase, gameIdx, maxSec || 120),
    setOpp: (tag, side) => {
      const t = JSON.stringify(tag);
      vm.runInContext('setCurrentPolicy(policyForModel(' + t + '));', rig.ctx);
      const s = side || 'player';
      if(s === 'ai') vm.runInContext('mode="watch"; fightL=' + t + '; fightR="ttmouse"; aiModel="standard";', rig.ctx);
      else vm.runInContext('mode="watch"; fightL="ttmouse"; fightR=' + t + '; aiModel="standard";', rig.ctx);
    },
  };
  return api;
}

module.exports = { buildRig, mulberry32, rallyStats, ROOT, DEFAULT_W };

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

