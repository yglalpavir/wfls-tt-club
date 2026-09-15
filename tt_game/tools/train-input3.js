/* =====================================================================
 *  train-input3.js — 输入级 DQN「极端对手课程」续训器
 *  · 目标：把"鼠标上的tt玩家"（tools/train-input2.js 产出的输入级 DQN）
 *    从 hell 档继续推到「极端·满档」，用**逐级更强**的对手把策略压上去。
 *  · 与 v2 的差异：
 *      - 对手不再是固定 HELL，而是 js/opponent-ladder.js 的课程阶梯
 *        （hell → elite → extreme → extreme-max），每局随机取一档亚型（抖动），
 *        防止把策略背成"只赢某一个具体配置"。
 *      - 评估改为三路：本阶段对手 / 顶档对手 / 默认策略（防崩回归护栏），
 *        最佳权重按加权和挑选，并单独守护 vs 默认的胜率下限。
 *      - 断点保护：每 --ckpt 局把 bestNet 落盘，进程被杀也不丢成果。
 *      - --eval-only：只标定不训练（用来量某份权重打整条阶梯的胜率）。
 *  · 产出：data/input-ai-extreme.json + tools/input-curve-v3.json
 *  · 用法：
 *      node tools/train-input3.js --eval-only
 *      node tools/train-input3.js --games 600 --eval 40 --no-save          # 冒烟
 *      node tools/train-input3.js --games 3000 --pret 0 --no-save
 * ===================================================================== */
'use strict';
const path = require('path');
const fs = require('fs');
const PP = require(path.join(__dirname, '..', 'js', 'policy.js'));
const SIM = require(path.join(__dirname, '..', 'js', 'simcore.js'));
const INPUTSIM = require(path.join(__dirname, '..', 'js', 'input-sim.js'));
const IA = require(path.join(__dirname, '..', 'js', 'input-agent.js'));
const OPP = require(path.join(__dirname, '..', 'js', 'opponent-ladder.js'));
global.SIM = SIM; global.P = PP;
const T = require(path.join(__dirname, '..', 'js', 'telemetry.js'));   // Web UI 打点（TT_TELEMETRY 门控）

function mulberry32(a){ return function(){ a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }

const ROOT = path.join(__dirname, '..');
const args = process.argv.slice(2);
const opt = {
  games: 3000, eval: 40, step: 50, pret: 0, bcGames: 120,
  ckpt: 400, epsReset: 500,
  bcmix: 0.06, bcpass: 0,
  preload: 500, learnp: 2,
  /* 续训起点 = 当前最佳权重（护栏的基线也是它：必须打赢自己才能采纳） */
  from: path.join(ROOT, 'data', 'input-ai-extreme.json'),
  save: path.join(ROOT, 'data', 'input-ai-extreme.json'),
  curve: path.join(__dirname, 'input-curve-v3.json'),
  start: 'hell', end: 'extreme-max', jitter: 0.06,
  seed: 20260909,
  noSave: false, evalOnly: false,
  // 课程：每档占比（和 = 1.0）。想换节奏用 --phases hell:0.2,elite:0.28,extreme:0.3,extreme-max:0.22
  phases: 'hell:0.20,elite:0.28,extreme:0.30,extreme-max:0.22',
  /* 优化器（dqn.js#mlpTrainEnh，全部 opt-in；不传任何 flag = 旧 SGD 路径）：
   *   --optimizer adam            换成 Adam（默认 β1=0.9, β2=0.999）
   *   --grad-clip 2               全网络梯度 2-范数裁剪（安全阀，不是提速手段）
   *   --layer-lr 1,1,1,3          每层 lr 乘子（长度 = 层数；末层 = 952 维输出层）
   * 实测依据见 tools/diag-grad.js：输出层梯度范数是隐层的 1/10，
   * 单 lr 同时喂两者会让输出层欠驱动；且输出层 |d|<100 截断触发率 0.000%，
   * 现有唯一稳定性机制在真实分布下从未生效过。 */
  optimizer: '', gradClip: 0, layerLr: '',
};
for(let i = 0; i < args.length; i++){
  if(args[i] === '--games') opt.games = parseInt(args[++i], 10);
  else if(args[i] === '--eval') opt.eval = parseInt(args[++i], 10);
  else if(args[i] === '--step') opt.step = parseInt(args[++i], 10);
  else if(args[i] === '--pret') opt.pret = parseInt(args[++i], 10);
  else if(args[i] === '--bcpairs') opt.bcGames = parseInt(args[++i], 10);
  else if(args[i] === '--bcmix') opt.bcmix = parseFloat(args[++i]);
  else if(args[i] === '--bcpass') opt.bcpass = parseInt(args[++i], 10);
  else if(args[i] === '--preload') opt.preload = parseInt(args[++i], 10);
  else if(args[i] === '--learnp') opt.learnp = parseInt(args[++i], 10);
  else if(args[i] === '--ckpt') opt.ckpt = parseInt(args[++i], 10);
  else if(args[i] === '--eps-reset') opt.epsReset = parseInt(args[++i], 10);
  else if(args[i] === '--from') opt.from = path.resolve(args[++i]);
  else if(args[i] === '--save') opt.save = path.resolve(args[++i]);
  else if(args[i] === '--curve') opt.curve = path.resolve(args[++i]);
  else if(args[i] === '--start') opt.start = args[++i];
  else if(args[i] === '--end') opt.end = args[++i];
  else if(args[i] === '--jitter') opt.jitter = parseFloat(args[++i]);
  else if(args[i] === '--phases') opt.phases = args[++i];
  else if(args[i] === '--seed') opt.seed = parseInt(args[++i], 10);
  else if(args[i] === '--no-save') opt.noSave = true;
  else if(args[i] === '--eval-only') opt.evalOnly = true;
  else if(args[i] === '--optimizer') opt.optimizer = args[++i];
  else if(args[i] === '--grad-clip') opt.gradClip = parseFloat(args[++i]);
  else if(args[i] === '--layer-lr') opt.layerLr = args[++i];
}

/* ---- 优化器补丁：只在显式传了 flag 时才应用，默认保持旧 SGD 路径 ---- */
function applyOptimizer(agent){
  if(!opt.optimizer && !(opt.gradClip > 0) && !opt.layerLr) return 'sgd（默认，未改动）';
  const patch = {};
  if(opt.optimizer) patch.optimizer = opt.optimizer;
  if(opt.gradClip > 0) patch.gradClip = opt.gradClip;
  if(opt.layerLr) patch.lrScale = opt.layerLr.split(',').map(parseFloat).filter(isFinite);
  agent.setOptimizer(patch);
  if(patch.lrScale && patch.lrScale.length < agent.getNet().length){
    console.error('    警告：--layer-lr 给了 ' + patch.lrScale.length +
                  ' 个乘子但网络有 ' + agent.getNet().length + ' 层，缺的层按 ×1 处理');
  }
  return agent.getTrainMode();
}

/* ---- 课程解析：'hell:0.2,elite:0.3' → [{tag,share,from,to}] ---- */
function parsePhases(spec){
  const ps = spec.split(',').map(s => s.trim()).filter(Boolean).map(s => {
    const [tag, w] = s.split(':');
    return { tag, share: w != null ? parseFloat(w) : 0 };
  });
  if(!ps.length) throw new Error('--phases 为空');
  const sum = ps.reduce((a, b) => a + b.share, 0) || 1;
  let acc = 0;
  return ps.map(p => { p.share /= sum; const f = acc; acc += p.share; p.from = f; p.to = acc; return p; });
}
const PHASES = parsePhases(opt.phases);
const evalAtPhase = g => PHASES.find(p => g < p.to * opt.games) || PHASES[PHASES.length - 1];
const oppForPhase = (p, rng) => OPP.pick(rng, p.tag, opt.jitter);

function brainOf(agent){ return { act(o){ return agent.act(o, true).cmd; }, credit(d){ agent.credit(d); } }; }
function brainEval(agent){ return { act(o){ return agent.decode(agent.bestAction(o)); }, credit(){} }; }

/* ---- 载入起点权重（续训起点 = 上一轮最佳）----
 * 形状校验是硬拦：仓库里同时躺着 238 动作旧网（input-ai.json / input-ai-v2.json /
 * input-ai-v3.json）与 952 动作新网（input-ai-a952.json）。旧网被现在的 952 解码器
 * 解码只会输出垃圾输入，续训等于从随机策略起步（实测仅 ~21% 胜率），必须先拦下来。 */
function loadBase(){
  const txt = fs.readFileSync(opt.from, 'utf8');
  const base = IA.loadInputAgent(txt);
  const net = base.getNet();
  const widths = net.map(l => l.W.length + '×' + l.W[0].length).join(' → ');
  const bad = [];
  if(base.nActions !== IA.ACT_N) bad.push('nActions=' + base.nActions + ' ≠ 当前 ACT_N=' + IA.ACT_N);
  if(net[0].W[0].length !== IA.OBS_N) bad.push('输入维=' + net[0].W[0].length + ' ≠ 当前 OBS_N=' + IA.OBS_N);
  if(net[net.length - 1].W.length !== IA.ACT_N) bad.push('输出维=' + net[net.length - 1].W.length + ' ≠ 当前 ACT_N=' + IA.ACT_N);
  if(bad.length){
    console.error('❌ 起点权重与当前动作空间不兼容，拒绝续训：' + opt.from);
    for(const b of bad) console.error('    ' + b);
    console.error('    网络形状：' + widths);
    console.error('    可用兼容起点：data/input-ai-a952.json（' + IA.ACT_N + ' 动作 = ' +
                  IA.IN_MX.length + '×' + IA.IN_MY.length + '×2）');
    process.exit(2);
  }
  return { agent: base, shape: widths };
}

/* ---- 对一份权重做整条阶梯标定 ---- */
function ladderEval(agent, rngSeed, games){
  agent.setTraining(false);
  const out = [];
  for(const lv of OPP.LEVELS){
    const r = INPUTSIM.playInputMatch(brainEval(agent), OPP.at(lv.tag), { games, rngFactory: k => mulberry32(rngSeed + lv.id * 977 + k) });
    out.push({ tag: lv.tag, wr: +r.pointRate.toFixed(4), detail: r.winsA + '-' + r.winsB });
  }
  agent.setTraining(true);
  return out;
}

/* ================= --eval-only：只标定不训练 ================= */
if(opt.evalOnly){
  const G = parseInt(process.env.TT_EVALGAMES || String(opt.eval * 2), 10);
  const { agent } = loadBase();
  console.log('标定模式：' + opt.from + '（' + OPP.LEVELS.length + ' 档 × ' + G + ' 局）');
  const res = ladderEval(agent, opt.seed * 31, G);
  console.log('  对手'.padEnd(16) + '胜率      局分');
  for(const r of res) console.log('  ' + r.tag.padEnd(14) + (r.wr * 100).toFixed(1).padStart(6) + '%  ' + r.detail);
  T.tick({ t:'done', mode:'input-ladder-probe', from:opt.from, games:G,
           ladder: res.map(r => r.tag + ':' + r.wr.toFixed(3)).join(',') });
  process.exit(0);
}

/* ================= 正式训练 ================= */
const { agent, shape } = loadBase();
const trainMode = applyOptimizer(agent);
const t0 = Date.now();
let win = 0, total = 0;
const curve = [];
let bestScore = -1, bestNet = JSON.parse(JSON.stringify(agent.getNet()));
let bestDef = -1, bestMax = -1, bestPhase = -1;

console.log('输入级 AI 极端对手课程续训（v3）');
console.log('  起点权重：' + path.relative(ROOT, opt.from));
console.log('  网络形状：' + shape + '（' + agent.nActions + ' 动作 = ' + IA.IN_MX.length + '×' + IA.IN_MY.length + '×2）');
console.log('  课程：' + PHASES.map(p => p.tag + '=' + (p.share * 100).toFixed(0) + '%').join(' → '));
console.log('  games=' + opt.games + ' eval=' + opt.eval + ' step=' + opt.step + ' jitter=' + opt.jitter + ' seed=' + opt.seed);
console.log('  优化器：' + trainMode);
T.phase('train', '极端对手课程续训开始 games=' + opt.games + ' 课程=' + PHASES.map(p => p.tag + '=' + p.share.toFixed(2)).join(','));

/* ---- BC 保鲜池：追球监督，防止 RL 在对极端对手时洗掉基础接球技能 ---- */
const bcPairs = [];
const naiveCmd = (o) => ({ tx: Math.max(-0.9, Math.min(0.9, o.x || 0)), my: 0.5, ctrl: false });
const naive = { act(o){ const c = naiveCmd(o); bcPairs.push([agent.encode(o), IA.nearestAction(c.tx, c.my, c.ctrl)]); return c; }, credit(){} };
for(let g = 0; g < opt.bcGames; g++){
  INPUTSIM.playInputPoint(naive, PP.POLICY_DEFAULT, mulberry32(707000 + g), g % 2 === 0 ? 'player' : 'ai');
}
agent.setBC(bcPairs, 1.6);
/* 关键：存档里的 bcMix=0.35 会让 35% 的每个 batch 都变成"追球"监督，
 * 续训时足以把已有好策略冲回 naive 水平（实测 150 局 vs默认 71.9%→47.3%）。
 * 续训只保留很小的保鲜比例，重锚 pass 默认关闭。 */
console.log('BC 保鲜池 ' + bcPairs.length + ' 条（' + opt.bcGames + ' 局追球监督 · 在线混入 ' +
  (agent.getBcMix() * 100).toFixed(0) + '% → 压到 ' + (opt.bcmix * 100).toFixed(0) + '% · 周期性重锚 ' +
  opt.bcpass + ' pass/100局）');
agent.setBcMix(opt.bcmix);

/* ---- 基线标定：起点权重能打整条阶梯多少（决定"更强"的判定线）---- */
const baseLadder = ladderEval(agent, opt.seed * 13, opt.eval * 2);
console.log('基线（起点权重）：' + baseLadder.map(r => r.tag + '=' + (r.wr * 100).toFixed(1) + '%').join('  '));
const baseDef = baseLadder.find(r => r.tag === 'default').wr;
const baseMax = baseLadder.find(r => r.tag === opt.end).wr;
const basePhase = baseLadder.find(r => r.tag === PHASES[0].tag).wr;
/* 用基线初始化"最佳"，让选优护栏从第 1 次评估就真正生效——
 * 否则 bestDef=-1 会让第一块评估无条件被采纳为"最佳"，退化也会被当成成果。 */
bestScore = 0.45 * baseMax + 0.30 * basePhase + 0.25 * baseDef;
bestDef = baseDef; bestMax = baseMax; bestPhase = basePhase;
console.log('选优基线：best=' + (bestScore * 100).toFixed(1) +
  '（vs默认=' + (baseDef * 100).toFixed(1) + '%，护栏下限 ' + ((baseDef - 0.05) * 100).toFixed(1) + '%）');
T.tick({ t:'verify', stage:'baseline',
  vsDefault:+baseDef.toFixed(4), vsTop:+baseMax.toFixed(4), vsStartOpp:+basePhase.toFixed(4),
  ladder: baseLadder.map(r => r.tag + ':' + r.wr.toFixed(3)).join(',') });

/* ---- 预填回放（续训最关键的一步）----
 * 起点是好策略，但回放是空的。直接开训的话，前几百个 batch 只能反复锤不到
 * 2000 条样本 + ε 随机动作的噪声，Q 值迅速发散（实测 60 局 vs默认 71.3%→39.9%）。
 * 先用**贪心的当前策略**把若干回合灌进回放，让每个 batch 从大且多样的分布里抽样。 */
if(opt.preload > 0){
  agent.setTraining(true); agent.setLearnPerPoint(0); agent.setEps(0);
  const tPre = Date.now();
  let preWin = 0;
  for(let g = 0; g < opt.preload; g++){
    const ph = PHASES[Math.min(PHASES.length - 1, ((g / opt.preload) * PHASES.length) | 0)];
    const r = INPUTSIM.playInputPoint(brainOf(agent), oppForPhase(ph, mulberry32(opt.seed * 11 + g)),
                                       mulberry32(opt.seed * 13 + g), g % 2 === 0 ? 'player' : 'ai');
    agent.endPoint('player', r.winner);
    if(r.winner === 'player') preWin++;
  }
  console.log('预填回放 ' + opt.preload + ' 回合 → 回放 ' + agent.getReplaySize() + ' 条样本' +
    '（贪心当前策略 · 课程对手 · 胜率 ' + (preWin / opt.preload * 100).toFixed(0) +
    '% · ' + ((Date.now() - tPre) / 1000).toFixed(0) + 's）');
  T.tick({ t:'preload', games:opt.preload, replay:agent.getReplaySize(), winRate:+(preWin / opt.preload).toFixed(4),
           sec:+((Date.now() - tPre) / 1000).toFixed(1) });
}
agent.setLearnPerPoint(opt.learnp);

/* ---- ε 调度：loadInputAgent 会把 ε 置 0，不显式重置的话前几百局全是贪心、
 *    等于只在做 exploitation 而没有任何探索，学不到新东西。
 *    基线 ε 从 0.30 线性降到 0.10；每 --eps-reset 局再叠加一次 0.45 的探索脉冲
 *    （半衰期 ~140 局），配合 bestNet 回退，避免回放被贪心数据统治后晚期退化。 */
const EPS_BASE0 = 0.18, EPS_BASE1 = 0.07, EPS_PULSE = 0.30;
/* 续训学习率：起点是好策略，起步就要比从头训练低一个量级；600 局走完衰减 */
const LR_0 = 0.00010, LR_1 = 0.000035, LR_HORIZON = 600;
/* 早停门槛要宽：40 局评估的样本噪声就有 ±10pp（实测同一轮内 63%~81% 来回摆），
 * 拿它当判据会把正在恢复的轮次错杀。护栏（bestDef）已保证不会采纳退化权重，
 * 早停只用来兜"彻底崩了"的情形。 */
const ABORT_GAP = 0.18, ABORT_N = 4;
const clEps = (v) => v < 0.02 ? 0.02 : (v > 1 ? 1 : v);
let epsBoost = 0;
let degenerate = 0;
let curPhaseTag = null;
for(let g = 0; g < opt.games; g++){
  const phase = evalAtPhase(g);
  if(phase.tag !== curPhaseTag){
    curPhaseTag = phase.tag;
    console.log('\n—— 课程进入第 ' + (PHASES.indexOf(phase) + 1) + '/' + PHASES.length +
      ' 阶段：对手=' + phase.tag + '（占 ' + (phase.share * 100).toFixed(0) + '%，第 ' +
      (Math.round(phase.from * opt.games)) + '-' + Math.round(phase.to * opt.games) + ' 局）——');
    T.phase('curriculum', phase.tag, '课程进入对手 ' + phase.tag);
    T.tick({ t:'phase', ep:g + 1, phase:phase.tag, idx:PHASES.indexOf(phase) + 1, share:+phase.share.toFixed(3) });
  }
  const opp = oppForPhase(phase, mulberry32(opt.seed * 7 + g));
  /* 续训学习率要比从头训练低一个量级：起点已是好策略，大步长只会把它打散。
   * 衰减基准用固定的 LR_HORIZON 而不是 opt.games——否则长跑在同样的局数上
   * 仍停留在大步长（1500 局跑到 250 局时 lr 还有 0.000089，而 300 局短跑已降到
   * 0.000046），续训会重新不稳定。 */
  agent.setLr(LR_0 + (LR_1 - LR_0) * Math.min(1, g / LR_HORIZON));
  epsBoost *= 0.995;
  agent.setEps(clEps(EPS_BASE0 + (EPS_BASE1 - EPS_BASE0) * Math.min(1, g / opt.games) + epsBoost));
  const server = (g % 2 === 0) ? 'player' : 'ai';
  const res = INPUTSIM.playInputPoint(brainOf(agent), opp, mulberry32(opt.seed * 3 + g), server);
  agent.endPoint('player', res.winner);
  total++; if(res.winner === 'player') win++;
  /* 周期性重锚：续训默认关闭。实测 3 pass/100局 ≈ 2 万次"追球"硬监督，
   * 足以把起点的好策略冲回 naive 水平（150 局 vs默认 71.9%→47.3%）。
   * 需要长期保鲜时用 --bcpass 1 显式打开。 */
  if(opt.bcpass > 0 && (g + 1) % 100 === 0){
    for(let p = 0; p < opt.bcpass; p++) for(let i = 0; i < bcPairs.length; i++) agent.imitate(bcPairs[i][0], bcPairs[i][1], 1.6);
  }

  if((g + 1) % opt.step === 0){
    const evP = INPUTSIM.playInputMatch(brainEval(agent), oppForPhase(phase, mulberry32(911000 + g)),
                                         { games: opt.eval, rngFactory: k => mulberry32(911000 + g * 17 + k) });
    const evM = INPUTSIM.playInputMatch(brainEval(agent), OPP.at(opt.end),
                                         { games: opt.eval, rngFactory: k => mulberry32(922000 + g * 17 + k) });
    const evD = INPUTSIM.playInputMatch(brainEval(agent), PP.POLICY_DEFAULT,
                                         { games: opt.eval, rngFactory: k => mulberry32(933000 + g * 17 + k) });
    const epH = evP.pointRate, epM = evM.pointRate, epD = evD.pointRate;
    /* 选优分：顶档为主、本阶段次之、默认策略做护栏 */
    const sc = 0.45 * epM + 0.30 * epH + 0.25 * epD;
    const keep = (sc > bestScore) && (epD >= bestDef - 0.05);
    if(keep){
      bestScore = sc; bestDef = epD; bestMax = epM; bestPhase = epH;
      bestNet = JSON.parse(JSON.stringify(agent.getNet()));
    }
    /* 早停：连续多块评估都远低于基线，说明这组超参在毁模型（典型：BC 占比过高、
     * 学习率过大、回放太小），立刻停并回退基线权重。阈值刻意放宽——
     * 详见 ABORT_GAP 注释。 */
    if(epD < baseDef - ABORT_GAP || epM < baseMax - ABORT_GAP){
      degenerate++;
      console.warn('  ⚠ 评估远低于基线（vs默认 ' + (epD * 100).toFixed(1) + '% vs 基线 ' + (baseDef * 100).toFixed(1) +
        '%；vs' + opt.end + ' ' + (epM * 100).toFixed(1) + '% vs 基线 ' + (baseMax * 100).toFixed(1) +
        '%）· 退化 ' + degenerate + '/' + ABORT_N);
    } else degenerate = 0;
    if(degenerate >= ABORT_N){
      console.warn('  ✗ 连续 ' + ABORT_N + ' 块评估退化，提前停止（结果回退到基线权重）');
      T.tick({ t:'abort', reason:'degenerate', ep:g + 1, evalDef:+epD.toFixed(4), baseDef:+baseDef.toFixed(4),
               evalTop:+epM.toFixed(4), baseTop:+baseMax.toFixed(4) });
      break;
    }
    /* ε 循环：周期性重启探索（防回放被贪心数据统治后晚期退化） */
    if((g + 1) % opt.epsReset === 0){
      epsBoost = EPS_PULSE;
      console.log('  ↻ ε 循环：注入探索脉冲（第 ' + (g + 1) + ' 局，ε→' + (EPS_BASE0 + epsBoost).toFixed(2) + '）');
      T.tick({ t:'eps-reset', ep:g + 1, eps:+agent.getEps().toFixed(2) });
    }
    /* 断点保护：bestNet 定期落盘，进程被杀也不丢成果 */
    if((g + 1) % opt.ckpt === 0){
      const cur = agent.getNet();
      agent.setNet(bestNet);
      if(!opt.noSave){ fs.mkdirSync(path.dirname(opt.save), { recursive: true }); fs.writeFileSync(opt.save, agent.serialize(), 'utf8'); }
      fs.writeFileSync(opt.curve, JSON.stringify(curve, null, 2), 'utf8');
      agent.setNet(cur);
    }
    curve.push({ ep: g + 1, phase: phase.tag,
                 trainW: +(win / total * 100).toFixed(1),
                 evalPhase: +(epH * 100).toFixed(1), evalTop: +(epM * 100).toFixed(1), evalDef: +(epD * 100).toFixed(1),
                 best: +(bestScore * 100).toFixed(1), bestTop: +(bestMax * 100).toFixed(1),
                 eps: +agent.getEps().toFixed(2) });
    console.log(`ep ${String(g + 1).padStart(5)} [${phase.tag}]  train=${(win / total * 100).toFixed(0)}%  vs本档=${(epH * 100).toFixed(1)}%  vs${opt.end}=${(epM * 100).toFixed(1)}%  vs默认=${(epD * 100).toFixed(1)}%  best=${(bestScore * 100).toFixed(1)}  eps=${agent.getEps().toFixed(2)}  [${((Date.now() - t0) / 1000).toFixed(0)}s]`);
    T.tick(Object.assign({ t:'ep', sec:+((Date.now() - t0) / 1000).toFixed(1) }, curve[curve.length - 1]));
  }
}

/* ================= 最终评估：bestNet vs 整条阶梯 ================= */
if(bestNet) agent.setNet(bestNet);
const FINAL_G = Math.max(80, opt.eval * 2);
console.log('\n=== 最佳权重最终评估（' + FINAL_G + ' 局/档）===');
const finNew = ladderEval(agent, opt.seed * 51, FINAL_G);
const finBase = baseLadder;   // 基线已在训练前标定（同一份起点权重）
console.log('  对手'.padEnd(16) + '新权重        起点权重');
for(let i = 0; i < OPP.LEVELS.length; i++){
  const a = finNew[i], b = finBase[i];
  const d = (a.wr - b.wr) * 100;
  console.log('  ' + a.tag.padEnd(14) + (a.wr * 100).toFixed(1).padStart(6) + '%' + '  ' +
              (b.wr * 100).toFixed(1).padStart(6) + '%' + '  ' + (d >= 0 ? '+' : '') + d.toFixed(1));
}

const nDef = finNew.find(r => r.tag === 'default').wr;
const nMax = finNew.find(r => r.tag === opt.end).wr;
const nStart = finNew.find(r => r.tag === PHASES[0].tag).wr;
/* 采纳条件：对顶档明显更强，且不显著退步 vs 默认策略（回归护栏） */
const adopt = (!opt.noSave) && (nMax >= baseMax + 0.015) && (nDef >= baseDef - 0.03);
T.phase('verify', '最终阶梯评估完成');
T.tick({ t:'verify', stage:'final',
  vsDefault:+nDef.toFixed(4), vsDefaultBase:+baseDef.toFixed(4),
  vsTop:+nMax.toFixed(4), vsTopBase:+baseMax.toFixed(4),
  vsStartOpp:+nStart.toFixed(4),
  ladder: finNew.map(r => r.tag + ':' + r.wr.toFixed(3)).join(',') });

fs.writeFileSync(opt.curve, JSON.stringify(curve, null, 2), 'utf8');
console.log('已写 ' + path.relative(ROOT, opt.curve));
if(adopt){
  fs.mkdirSync(path.dirname(opt.save), { recursive: true });
  fs.writeFileSync(opt.save, agent.serialize(), 'utf8');
  const relSave = path.relative(ROOT, opt.save).replace(/\\/g, '/');
  console.log('✅ 采纳：已保存 ' + path.relative(ROOT, opt.save) +
              '（vs ' + opt.end + ' ' + (nMax * 100).toFixed(1) + '% ← 基线 ' + (baseMax * 100).toFixed(1) + '%）');
  console.log('\n下一步：');
  console.log('  1) 烘焙进实机：  node tools/bake-input.js ' + relSave + ' ' + nMax.toFixed(3) + ' ' + nDef.toFixed(3));
  console.log('  2) 继续加压续训：node tools/train-input3.js --from ' + relSave + ' --games 3000 --eval 32 --step 75');
  T.tick({ t:'done', mode:'input-extreme-curriculum', adopted:true,
    vsTop:+nMax.toFixed(4), vsTopBase:+baseMax.toFixed(4), vsDefault:+nDef.toFixed(4),
    games:opt.games, sec:+((Date.now() - t0) / 1000).toFixed(1), save:path.relative(ROOT, opt.save) });
} else {
  console.log('\n⚠ ' + (opt.noSave ? '--no-save：实验模式，不写入 ' + path.relative(ROOT, opt.save)
    : '未通过采纳线（需 vs' + opt.end + ' 至少 +' + (1.5) + 'pp 且 vs默认 不劣于 -3pp），' + path.relative(ROOT, opt.save) + ' 保持不变'));
  T.tick({ t:'done', mode:'input-extreme-curriculum', adopted:false, noWrite:opt.noSave,
    vsTop:+nMax.toFixed(4), vsTopBase:+baseMax.toFixed(4), vsDefault:+nDef.toFixed(4),
    games:opt.games, sec:+((Date.now() - t0) / 1000).toFixed(1) });
}
process.exit(0);
