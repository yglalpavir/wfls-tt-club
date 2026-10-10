/* =====================================================================
 *  train-input3.js — 输入级 DQN「极端对手课程」续训器
 *  · 目标：把"鼠标上的tt玩家"（tools/train-input2.js 产出的输入级 DQN）
 *    从 hell 档继续推到「极端·满档」，用**逐级更强**的对手把策略压上去。
 *  · 与 v2 的差异：
 *      - 对手不再是固定 HELL，而是 js/opponent-ladder.js 的课程阶梯
 *        （hell → elite → extreme → extreme-max），每局随机取一档亚型（抖动），
 *        防止把策略背成"只赢某一个具体配置"。
 *      - 每轮验证跑**整条阶梯**（默认 5 档：default / hell / elite / extreme /
 *        extreme-max），逐档胜率落进曲线与检查点索引，可视化面板直接画
 *        "对不同模型的验证胜率"。三路选优（本档 / 顶档 / 默认护栏）仍用其中
 *        3 档，加权和挑最佳权重，单独守护 vs 默认的胜率下限。
 *      - 断点备份 + 续训：每 --ckpt 局把 bestNet 落进 data/checkpoints/<run>/
 *        （权重文件可直接当 --from；index.json 记录 ep / 胜率 / 配置 / 累计耗时），
 *        环形保留 --keep 份 + 最佳一份；--resume <index.json|权重> 恢复
 *        ep 偏移、选优状态、累计胜率与曲线，进程被杀 / 关机 / 断电都能接着跑。
 *      - --hours N：墙钟预算（小时）。0 = 不限时，只用 --games 兜底；
 *        续训时扣掉断点记录的累计耗时，18h 预算可跨多次中断累计。
 *      - --eval-only：只标定不训练（用来量某份权重打整条阶梯的胜率）。
 *  · 产出：data/input-ai-extreme.json（采纳后）+ tools/input-curve-v3.json
 *        + data/checkpoints/input3-<时间戳>/（检查点，gitignore，本地续训用）
 *  · 用法：
 *      node tools/train-input3.js --eval-only
 *      node tools/train-input3.js --games 600 --eval 40 --no-save          # 冒烟
 *      node tools/train-input3.js --games 3000 --pret 0 --no-save
 *      node tools/train-input3.js --hours 18 --games 600000 --step 200 \
 *              --eval 24 --ckpt 200 --run-name input3-18h --no-save        # 18h 长跑
 *      node tools/train-input3.js --resume data/checkpoints/input3-18h/index.json \
 *              --hours 18 --no-save                                        # 断点续训
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
  /* ---- 长跑 + 断点续训 ----
   * hours=0 时用 --games 作唯一终止条件；hours>0 时以墙钟预算为准，
   * --games 退化成保险上限（避免卡死/死循环把 CPU 占到天荒地老）。
   * 预算在轮次边界判定，所以每轮（--step）的验证与检查点一定成对落盘。 */
  hours: 0,
  hoursAdd: 0,   // 本次额外投入的墙钟预算（叠加在断点已耗时之上；--hours 是跨中断累计的总量）
  /* 每轮验证的对手档位。默认全阶梯 5 档；'default' 强制保留——它是采纳护栏的
   * 参照（vs默认 不劣于 -5pp 才采纳），拿掉它等于关掉防崩保护。 */
  vallevels: 'default,hell,elite,extreme,extreme-max',
  runName: '', ckptDir: '', keep: 12, noCkpt: false,
  resume: '', resumeBest: false, fromRandom: false,
  hSizesArg: '',
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
  else if(args[i] === '--hsizes') opt.hSizesArg = args[++i];
  else if(args[i] === '--hours-add') opt.hoursAdd = parseFloat(args[++i]);
  else if(args[i] === '--from'){
    const v = args[++i];
    if(String(v).toLowerCase() === 'random'){ opt.fromRandom = true; opt.from = '(random)'; }
    else opt.from = path.resolve(v);
  }
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
  else if(args[i] === '--hours') opt.hours = parseFloat(args[++i]);
  else if(args[i] === '--vallevels') opt.vallevels = args[++i];
  else if(args[i] === '--run-name') opt.runName = args[++i];
  else if(args[i] === '--ckptdir') opt.ckptDir = path.resolve(args[++i]);
  else if(args[i] === '--keep') opt.keep = parseInt(args[++i], 10);
  else if(args[i] === '--no-ckpt') opt.noCkpt = true;
  else if(args[i] === '--resume') opt.resume = args[++i];
  else if(args[i] === '--resume-best') opt.resumeBest = true;
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

/* ---- 参数一致性：这些组合会静默失效，先说清楚 ----
 * ε 脉冲检查挂在"每轮"块内，只有 (g+1) 同时是 step 与 epsReset 的倍数时才触发；
 * epsReset 不是 step 的倍数时实际周期是两者的最小公倍数（可能远超预期）。 */
const _gcd = (a, b) => b ? _gcd(b, a % b) : a;
const _lcm = (a, b) => (a / _gcd(a, b)) * b;
if(opt.epsReset % opt.step !== 0){
  const _eff = _lcm(opt.step, opt.epsReset);
  console.error('⚠ 警告：--eps-reset ' + opt.epsReset + ' 不是 --step ' + opt.step +
                ' 的倍数——脉冲检查在每轮评估块内，实际每 ' + _eff + ' 回合才触发一次' +
                '（设成 step 的整数倍，例如 ' + (opt.step * 2) + '）');
}

/* act(o, mark)：mark 透传给 agent，input-sim 发球决策用它标记 'serve' 帧，
 * 之后 creditMarked('serve', d) 能把发球奖励精确落到那一帧。
 * 若不透传，标记丢失 → 发球奖励回落到最后一帧 → 发球维度学不出分化。 */
function brainOf(agent){
  return {
    act(o, mark){ return agent.act(o, true, mark).cmd; },
    credit(d){ agent.credit(d); },
    creditMarked(m, d){ if(agent.creditMarked) agent.creditMarked(m, d); else agent.credit(d); }
  };
}
function brainEval(agent){ return { act(o){ return agent.decode(agent.bestAction(o)); }, credit(){} }; }

/* ---- 载入起点权重（续训起点 = 上一轮最佳）----
 * 形状校验是硬拦：仓库里同时躺着 238 动作旧网（input-ai.json / input-ai-v2.json /
 * input-ai-v3.json）与 952 动作新网（input-ai-a952.json）。旧网被现在的 952 解码器
 * 解码只会输出垃圾输入，续训等于从随机策略起步（实测仅 ~21% 胜率），必须先拦下来。 */
function loadWeight(p, label){
  const txt = fs.readFileSync(p, 'utf8');
  /* 换网络后旧权重形状不再兼容。input-agent.js 的 setNet 会硬拦（抛错），
   * 这里转成可读的退出信息——否则续训会带着一份塞不进新网的旧权重静默跑，
   * 而失效形态是「Q 全 NaN → bestAction 恒返回动作 0」，极难从胜率反推原因。 */
  let base;
  try{
    base = IA.loadInputAgent(txt);
  }catch(e){
    console.error('❌ ' + (label || '起点权重') + ' 与当前网络形状不兼容，拒绝续训：' + p);
    console.error('    ' + (e && e.message ? e.message : e));
    process.exit(2);
  }
  const net = base.getNet();
  const widths = net.map(l => l.W.length + '×' + l.W[0].length).join(' → ');
  const bad = [];
  if(base.nActions !== IA.ACT_N) bad.push('nActions=' + base.nActions + ' ≠ 当前 ACT_N=' + IA.ACT_N);
  if(net[0].W[0].length !== IA.OBS_N) bad.push('输入维=' + net[0].W[0].length + ' ≠ 当前 OBS_N=' + IA.OBS_N);
  if(net[net.length - 1].W.length !== IA.ACT_N) bad.push('输出维=' + net[net.length - 1].W.length + ' ≠ 当前 ACT_N=' + IA.ACT_N);
  /* 隐藏层宽度：换了网络后旧权重唯一「合法地」被 load 进来的方式就是这个漏洞——
   * nActions/OBS_N 都对得上，只有宽度不同。必须显式比对。 */
  const hGot = net.slice(0, -1).map(l => l.W.length);
  const wantHs = (function(){ try{ const o = JSON.parse(txt).o; return o && o.hSizes; }catch(e){ return null; } })();
  if(Array.isArray(wantHs) && hGot.length === wantHs.length && hGot.some((v, i) => v !== wantHs[i])){
    bad.push('隐藏层宽度=' + hGot.join('/') + ' ≠ 该权重自己的 hSizes=' + wantHs.join('/'));
  }
  if(bad.length){
    console.error('❌ ' + (label || '起点权重') + ' 与当前动作空间不兼容，拒绝续训：' + p);
    for(const b of bad) console.error('    ' + b);
    console.error('    网络形状：' + widths);
    console.error('    可用兼容起点：data/input-ai-a952.json（' + IA.ACT_N + ' 动作 = ' +
                  IA.IN_MX.length + '×' + IA.IN_MY.length + '×2）');
    process.exit(2);
  }
  return { agent: base, shape: widths };
}
/* 网络隐藏层宽度。默认 = input-agent.js 的 hSizes（256/384/256，2026-10-02 扩容）。
 * --hsizes 可临时改（如 128,192,128 快速冒烟、或 192,256,192 折中），
 * 权重形状必须与之一致——A4 会校验，对不上会直接拒绝续训。 */
const DEFAULT_HSIZES = (opt.hSizesArg && opt.hSizesArg.trim()
  ? opt.hSizesArg.split(',').map(x => parseInt(x, 10)).filter(n => n > 0)
  : IA.HSIZES.slice());   // 默认 = input-agent.js 的 DEFAULT_HSIZES（唯一权威）
if(DEFAULT_HSIZES.length < 1){ console.error('❌ --hsizes 解析失败：' + opt.hSizesArg); process.exit(2); }

/* 起点权重。--from random = 跳过加载，用当前网络形状（IA 默认 hSizes + ACT_N）随机初始化。
 * 换网络后旧存档形状不再兼容（A4 会拦），从零训练必须走这条路——2026-10-02 换到
 * 256/384/256 + 8568 动作时就是这么起的。 */
const loadBase = () => {
  if(opt.fromRandom){
    const o = { stateSize: IA.OBS_N, nActions: IA.ACT_N, hSizes: DEFAULT_HSIZES,
                lr: 3.5e-5, gamma: 0.99, eps0: 1, epsMin: 0.12, batch: 128,
                replayCap: 1200000, targetEvery: 1500, learnPerPoint: 2,
                optimizer: 'adam', layerLr: '1,1,1,3' };
    const a = IA.createInputAgent(o, mulberry32(opt.seed));
    const widths = a.getNet().map(l => l.W.length + '×' + l.W[0].length).join(' → ');
    console.log('  起点权重：随机初始化（新网络）' + (opt.save ? '' : ''));
    console.log('  网络形状：' + widths);
    return { agent: a, shape: widths };
  }
  return loadWeight(opt.from, '起点权重');
};

/* ---- 每轮验证的对手档位 ----
 * 'default' 与 --end（顶档）强制保留：采纳护栏的两条判定线（vs默认 不劣于 -5pp、
 * vs顶档 至少 +1.5pp）全靠它们。缺一个就会算出 NaN，等于把护栏和早停一起关掉。 */
const VAL_TAGS = (() => {
  const want = opt.vallevels.split(',').map(s => s.trim()).filter(Boolean);
  const ok = t => OPP.LEVELS.some(l => l.tag === t);
  for(const b of want.filter(t => !ok(t)))
    console.warn('    ⚠ 未知档位已忽略：' + b + '（可用：' + OPP.LEVEL_TAGS.join('/') + '）');
  const keep = want.filter(ok);
  const forced = [];
  if(keep.indexOf('default') < 0){ keep.unshift('default'); forced.push('default（采纳护栏：vs默认 不劣于 -5pp）'); }
  if(keep.indexOf(opt.end) < 0){ keep.push(opt.end); forced.push(opt.end + '（顶档：采纳线 vs' + opt.end + ' 至少 +1.5pp）'); }
  if(forced.length) console.warn('    ⚠ 验证档位补入 ' + forced.join('、'));
  return keep.map(t => OPP.LEVELS.find(l => l.tag === t));
})();

/* ---- 对一份权重做整条（或部分）阶梯标定 ---- */
function ladderEval(agent, rngSeed, games, tags){
  agent.setTraining(false);
  const out = [];
  const list = (tags && tags.length) ? tags : OPP.LEVELS;
  for(const lv of list){
    const r = INPUTSIM.playInputMatch(brainEval(agent), OPP.at(lv.tag), { games, rngFactory: k => mulberry32(rngSeed + lv.id * 977 + k) });
    out.push({ tag: lv.tag, id: lv.id, wr: +r.pointRate.toFixed(4), games, detail: r.winsA + '-' + r.winsB });
  }
  agent.setTraining(true);
  return out;
}

/* ---- 每档 N 局 × 2 个独立种子，取合并胜率 ----
 * 单种子的胜率会把"这批对手序列恰好克制/恰好被克制"记进选优分（种子过拟合）。
 * 两个独立种子合并后，同一代选优的噪声减半；最终评估本来就是 eval*2 局，
 * 这里把每轮验证提到同口径。代价：每轮验证局数翻倍（--eval 77 → 3 档 × 154 局）。
 * detail 记两段各自的局分，方便事后看两个种子是否严重分歧。 */
function ladderEval2(agent, rngSeed, games, tags){
  const a = ladderEval(agent, rngSeed, games, tags);
  const b = ladderEval(agent, rngSeed * 7 + 104729, games, tags);
  return a.map((r, i) => {
    const q = b[i];
    const wa = Math.round(r.wr * r.games), wb = Math.round(q.wr * q.games);
    const g = r.games + q.games;
    return { tag: r.tag, id: r.id, wr: +((wa + wb) / g).toFixed(4), games: g,
             detail: r.detail + ' | ' + q.detail };
  });
}

/* ---- 胜率结果 → 扁平 series 键（wr<档位名驼峰>）：曲线文件与 UI 图表直接取用 ---- */
function wrFlat(res){
  const o = {};
  for(const r of res) o['wr' + r.tag.split('-').map(s => s.charAt(0).toUpperCase() + s.slice(1)).join('')] = r.wr;
  return o;
}

/* ================= --eval-only：只标定不训练 ================= */
if(opt.evalOnly){
  const G = parseInt(process.env.TT_EVALGAMES || String(opt.eval * 2), 10);
  const { agent } = loadBase();
  const tProbe = Date.now();   // 本分支在全局 t0 声明之前退出，elapsedSec 要自己计时
  console.log('标定模式：' + opt.from + '（' + VAL_TAGS.length + ' 档 × ' + G + ' 局）');
  const res = ladderEval(agent, opt.seed * 31, G, VAL_TAGS);
  console.log('  对手'.padEnd(16) + '胜率      局分');
  for(const r of res) console.log('  ' + r.tag.padEnd(14) + (r.wr * 100).toFixed(1).padStart(6) + '%  ' + r.detail);
  /* 与每轮 ep / 基线 verify 打点同口径：wr* 是**百分比**，wrMap 与 base 是小数。
     只标定没有训练过程，这一趟就是起点权重本身的胜率，所以同时当作基线
     （面板矩阵据此显示 Δ=0、基线刻度与峰值）。 */
  const baseMap = {}, baseFlat = {};
  for(const r of res){
    baseMap[r.tag] = +r.wr.toFixed(4);
    baseFlat['wr' + r.tag.split('-').map(x => x.charAt(0).toUpperCase() + x.slice(1)).join('')] = +(r.wr * 100).toFixed(1);
  }
  T.tick(Object.assign({ t:'done', stage:'baseline', mode:'input-ladder-probe', from:opt.from,
           elapsedSec: +((Date.now() - tProbe) / 1000).toFixed(1),
           games:G, base: baseMap, wrMap: baseMap, bestEp:0, ep:0,
           ladder: res.map(r => r.tag + ':' + r.wr.toFixed(3)).join(',') }, baseFlat));
  process.exit(0);
}

/* ================= 正式训练 ================= */

const rel = (p) => path.relative(ROOT, p).replace(/\\/g, '/');
const dayStamp = () => {
  const d = new Date(), p = n => String(n).padStart(2, '0');
  return d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate()) + '-' + p(d.getHours()) + p(d.getMinutes()) + p(d.getSeconds());
};

/* ---- 解析 --resume：index.json（推荐）或裸权重文件 ----
 * 两者能恢复的信息差很多：index.json 里带 ep 偏移、选优状态、累计胜率、基线标定、
 * 累计墙钟耗时（--hours 预算要扣掉它）；裸权重只有网络本身，其余按"新起点"重算。 */
const RESUME = (function(){
  if(!opt.resume) return null;
  const p = path.isAbsolute(opt.resume) ? opt.resume : path.resolve(ROOT, opt.resume);
  let d;
  try{ d = JSON.parse(fs.readFileSync(p, 'utf8')); }
  catch(e){ console.error('❌ 无法读取续训起点 ' + opt.resume + '：' + e.message); process.exit(2); }
  if(d && Array.isArray(d.checks)){
    if(!d.checks.length){ console.error('❌ ' + opt.resume + ' 里没有检查点'); process.exit(2); }
    const entry = opt.resumeBest
      ? d.checks.reduce((a, b) => (b.best > a.best ? b : a), d.checks[0])
      : d.checks[d.checks.length - 1];
    const f = entry.file && !path.isAbsolute(entry.file) ? path.join(path.dirname(p), entry.file) : entry.file;
    if(!f || !fs.existsSync(f)){
      console.error('❌ 检查点权重文件不存在：' + (entry.file || '(空)'));
      console.error('    该检查点可能已被 --keep 环形裁剪掉，换一个 index 或从裸权重文件续训');
      process.exit(2);
    }
    return { kind:'index', idx: d, idxPath: p, dir: path.dirname(p), entry, file: f };
  }
  if(d && d.w && d.o){
    const m = path.basename(p).match(/(\d+)\.json$/);
    return { kind:'weight', idx: null, idxPath: null, dir: null,
             entry: { ep: m ? parseInt(m[1], 10) : 1 }, file: p };
  }
  console.error('❌ 续训起点既不是检查点索引（含 checks[]）也不是权重文件（{w,o}）：' + opt.resume);
  process.exit(2);
})();
/* index 里取某档胜率（缺则 -1，由下面的基线兜底） */
const resumeWr = (tag) => {
  if(!RESUME || !RESUME.entry || !RESUME.entry.wr) return -1;
  const v = RESUME.entry.wr[tag];
  return typeof v === 'number' ? v : -1;
};

/* ---- 检查点目录：默认 data/checkpoints/<run>/ ----
 * ★ 续训默认开新目录（旧 run 名 + 日期后缀），除非显式给了 --run-name/--ckptdir。
 *   旧行为是直接沿用起点 run 的名字与目录，而局号又从头数（ep 200/400/…），
 *   于是新 run 的检查点会**覆盖**旧 run 同号的 checks[]，两段历史混进同一个
 *   index.json。实测事故：input3-v4 的 index.json 里 run 字段写着 "input3-v3"、
 *   adopted.json 与 v3 的 ckpt-006400.json 逐字节相同、ep 6400~8400 的
 *   checks[] 全部停在 ep 3600 的胜率上 —— 看起来像「验证循环冻住了」，
 *   其实是覆盖事故的表象：新 run 写的都是 ep 200~2000，覆盖了旧 run 的低位，
 *   旧 run 的高位 6400~8400 无人覆盖，于是永远停在那里。 */
const RESUME_RUN = (RESUME && RESUME.idx && RESUME.idx.run) || null;
const INHERIT_DIR = !opt.runName && !opt.ckptDir && !!(RESUME && RESUME.dir);
const RUN_NAME = opt.runName
  || (INHERIT_DIR ? (RESUME_RUN + '-' + dayStamp()) : RESUME_RUN)
  || ('input3-' + dayStamp());
/* 续训默认写回起点所在目录（同一条曲线接着长），但显式给了 --ckptdir 或 --run-name
 * 就以显式值为准 —— 否则「换个名字重跑一轮」会静默写进旧目录，把新旧口径（或两个
 * 实验）的曲线混在一起，读图时无从分辨。 */
const CKPT_DIR = opt.ckptDir
  || ((opt.runName || (RESUME && RESUME.dir)) ? path.join(ROOT, 'data', 'checkpoints', RUN_NAME) : null)
  || (RESUME && RESUME.dir)
  || path.join(ROOT, 'data', 'checkpoints', RUN_NAME);
const IDX_PATH = path.join(CKPT_DIR, 'index.json');
/* 硬拦第二道闸：目标目录里已有的 index 若属于另一个 run 名，绝不覆写。
 * 上一段已经把「续训默认目录」换开了，这里防的是显式指定写错 ——
 * 至少要炸出来，而不是把别人的曲线悄悄盖掉。 */
if(fs.existsSync(IDX_PATH)){
  try{
    const ex = JSON.parse(fs.readFileSync(IDX_PATH, 'utf8'));
    if(ex && ex.run && ex.run !== RUN_NAME){
      console.error('❌ ' + rel(IDX_PATH) + ' 已属于 run「' + ex.run + '」，与本次「' + RUN_NAME + '」不符。');
      console.error('    换 --run-name / --ckptdir 指定新目录；覆盖会把两轮曲线混成一条。');
      process.exit(2);
    }
  }catch(e){ /* index 损坏时不拦，交给后续读取逻辑报错 */ }
}
/* 曲线文件的目录要在这里就建好。18h 预设把曲线放在检查点目录里
 * （data/checkpoints/input3-18h/curve.json），而那个目录原本只有写检查点时才建；
 * 可第一轮边界里 curve 的 writeFileSync 排在 writeCheckpoint 之前，
 * 于是第一轮回调就 ENOENT 崩溃——实测 18h 长跑跑到 ep 1500 死在这里，
 * 连一份检查点都没留下。 */
fs.mkdirSync(path.dirname(opt.curve), { recursive: true });

/* ---- 断点状态汇总 ---- */
const R = {
  resumed: !!RESUME,
  /* entry.ep 表示"已训完第 N 回合"（ep = g+1），所以续训从 g = N 开始，
   * 而不是 N-1——否则第一轮验证会重复算一遍 ep N，曲线上留一个重影点。 */
  ep0: RESUME ? Math.max(0, RESUME.entry.ep || 0) : 0,
  win: RESUME ? (RESUME.entry.trainWins | 0) : 0,
  total: RESUME ? (RESUME.entry.trainTotal | 0) : 0,
  best: RESUME ? (RESUME.entry.best != null ? RESUME.entry.best : null) : null,
  bestWr: RESUME ? Object.assign({}, RESUME.entry.wr || {}) : {},
  bestDef: RESUME ? resumeWr('default') : -1,
  bestMax: RESUME ? resumeWr(opt.end) : -1,
  bestPhase: RESUME ? resumeWr(PHASES[0].tag) : -1,
  base: RESUME && RESUME.idx && RESUME.idx.base ? RESUME.idx.base : null,
  elapsed: RESUME ? ((RESUME.idx && RESUME.idx.elapsedSec != null) ? RESUME.idx.elapsedSec
                                : (RESUME.entry.sec || 0)) : 0,
};

/* ---- 载入起点（或断点）权重 ---- */
const { agent, shape } = RESUME ? loadWeight(RESUME.file, '断点权重') : loadBase();
const trainMode = applyOptimizer(agent);
const t0 = Date.now();
let win = R.win, total = R.total;
let bestNet = JSON.parse(JSON.stringify(agent.getNet()));
let bestScore = R.best;
let bestDef = R.bestDef, bestMax = R.bestMax, bestPhase = R.bestPhase;
let bestEp = RESUME ? (RESUME.entry.ep || 0) : 0;
const bestWr = Object.assign({}, R.bestWr);
/* 曲线接续：续训时沿用曲线文件里 ep ≤ 断点 的历史点，长跑才不会被截成一段一段 */
const curve = (() => {
  if(!R.resumed || !fs.existsSync(opt.curve)) return [];
  try{
    const arr = JSON.parse(fs.readFileSync(opt.curve, 'utf8'));
    if(!Array.isArray(arr)) return [];
    const tail = arr.filter(p => (p.ep | 0) <= R.ep0);
    if(tail.length) console.log('曲线接续：沿用 ' + rel(opt.curve) + ' 已有 ' + tail.length + ' 点（ep ≤ ' + R.ep0 + '）');
    return tail;
  }catch(e){ return []; }
})();
/* ---- 墙钟预算：--hours 换算成秒；续训要扣掉断点里已累计的耗时 ---- */
/* 预算 = --hours（跨中断累计的总量） + --hours-add（本次额外投入）。
 * 只有 --hours 时，续训一个已耗 8.6h 的断点再给 --hours 3 会让剩余预算为 0、
 * 训练循环一次都不进；--hours-add 让「在既有进度上再投 N 小时」成为可能。 */
/* 墙钟预算的三种写法，语义互不相同，别混：
 *   --hours N    总量 N 小时（跨多次中断累计）。断点已耗 8.6h 时给 --hours 3
 *                会让剩余为 0、训练循环一次都不进（elapsed() 含 R.elapsed）。
 *   --hours-add N  在既有累计之上**再追加** N 小时——「已经跑了 8.6h，再投 3 小时」
 *                就用这个，与 R.elapsed 无关。
 *   都不给        无墙钟限制，只受 --games 约束。
 * 折算成同一个 BUDGET_SEC 时：--hours 优先；否则基准是断点已耗时 + 本次追加。 */
const RESUME_ELAPSED = R.elapsed || 0;
const BUDGET_SEC = opt.hours > 0
  ? opt.hours * 3600
  : (opt.hoursAdd > 0 ? RESUME_ELAPSED + opt.hoursAdd * 3600 : 0);
const elapsed = () => R.elapsed + (Date.now() - t0) / 1000;
const remain = () => BUDGET_SEC > 0 ? Math.max(0, BUDGET_SEC - elapsed()) : -1;
/* 实测吞吐（含梯度更新；tools/_probe_thr.js 量的，24 核 / adam / learnp 2）：
 * 约 1.2 回合/秒。只用于"续训起点越过 --games 时"放宽上限，别拿它当精确承诺。 */
const PTS_S_EST = 1.2;
/* 断点续训 + 墙钟预算：上一段可能已经把 --games 跑满（ep0 ≥ games），
 * 那会儿循环一次都不进、直接跳最终评估——等于续训空转。按剩余预算放宽上限。
 * ε/课程都用 games 做标尺，放宽后 ε 仍近似满衰减、课程仍停在最后一段（顶档），
 * 语义不变；LR 走固定的 LR_HORIZON，与 games 无关。 */
if(BUDGET_SEC > 0 && R.ep0 >= opt.games){
  const extra = Math.floor(Math.max(0, BUDGET_SEC - R.elapsed) * PTS_S_EST);
  if(extra > 0){
    console.error('⚠ 续训起点 ep ' + R.ep0 + ' 已达 --games ' + opt.games +
                  ' —— 按剩余预算 ' + (Math.max(0, BUDGET_SEC - R.elapsed) / 3600).toFixed(2) +
                  'h 把回合上限放宽到 ' + (opt.games + extra));
    opt.games += extra;
  } else {
    console.error('⚠ 续训起点 ep ' + R.ep0 + ' 已达 --games ' + opt.games +
                  ' 且预算已耗尽 —— 只跑最终评估，不训新回合');
  }
}

function cfgSnapshot(){
  return { games:opt.games, hours:opt.hours, step:opt.step, eval:opt.eval, ckpt:opt.ckpt, keep:opt.keep,
           vallevels:VAL_TAGS.map(l => l.tag).join(','), phases:opt.phases, jitter:opt.jitter, seed:opt.seed,
           start:opt.start, end:opt.end, optimizer:opt.optimizer || 'sgd', gradClip:opt.gradClip,
           layerLr:opt.layerLr || null, trainMode:trainMode, bcmix:opt.bcmix, bcpass:opt.bcpass,
           preload:opt.preload, learnp:opt.learnp, epsReset:opt.epsReset, pret:opt.pret, bcpairs:opt.bcGames,
           noSave:opt.noSave, noCkpt:opt.noCkpt };
}
/* ---- 检查点索引：新跑时创建；续训时沿用，但 cfg 换成本次实际值（允许改超参续训）---- */
const CIdx = (RESUME && RESUME.idx)
  ? Object.assign({}, RESUME.idx, {
        checks: (RESUME.idx.checks || []).slice(),
        cfg: cfgSnapshot(),
        resumedFrom: rel(RESUME.idxPath), resumeEp: R.ep0 + 1,
        updated: new Date().toISOString()
      })
  : { run:RUN_NAME, script:'tools/train-input3.js', node:process.version,
        created: new Date().toISOString(), updated: new Date().toISOString(),
        from: rel(opt.from), save: rel(opt.save), curve: rel(opt.curve),
        cfg: cfgSnapshot(), base: null, baseBest: null, best: null, elapsedSec: 0, checks: [] };

console.log('输入级 AI 极端对手课程续训（v3）');
console.log('  起点权重：' + (RESUME ? rel(RESUME.file) + '   ← 断点续训' : rel(opt.from)));
console.log('  网络形状：' + shape + '（' + agent.nActions + ' 动作 = ' + IA.IN_MX.length + '×' + IA.IN_MY.length + '×2）');
console.log('  课程：' + PHASES.map(p => p.tag + '=' + (p.share * 100).toFixed(0) + '%').join(' → '));
console.log('  每轮验证：' + VAL_TAGS.length + ' 档 × ' + opt.eval + ' 局 = ' + (VAL_TAGS.length * opt.eval) +
  ' 局/轮（' + VAL_TAGS.map(l => l.tag).join('/') + '）');
console.log('  games=' + opt.games + ' step=' + opt.step + ' ckpt=' + opt.ckpt + ' jitter=' + opt.jitter +
  ' seed=' + opt.seed +
  (BUDGET_SEC > 0
    ? '  预算=' + (opt.hoursAdd > 0 ? '+' + opt.hoursAdd + 'h' : opt.hours + 'h') + (R.elapsed > 0
        ? '（已耗 ' + (R.elapsed / 3600).toFixed(2) + 'h / 剩 ' + (remain() / 3600).toFixed(2) + 'h）' : '')
    : ''));
console.log('  优化器：' + trainMode);
console.log('  检查点：' + (opt.noCkpt ? '关闭（--no-ckpt）'
  : rel(CKPT_DIR) + ' · 每 ' + opt.ckpt + ' 局 · 保留 ' + opt.keep + ' 份 + 最佳'));
if(R.resumed){
  console.log('  续训恢复：从 ep ' + (R.ep0 + 1) + ' 继续 · best=' +
    (bestScore != null ? (bestScore * 100).toFixed(1) + '%（ep ' + bestEp + '）' : '未记录，按本轮重定基线') +
    ' · 累计训练胜率 ' + (total ? (R.win / total * 100).toFixed(0) + '% / ' + total + ' 回合' : '未记录'));
}
T.phase('train', (R.resumed ? '断点续训 ep=' + (R.ep0 + 1) + ' · ' : '新起点 · ') +
  'games=' + opt.games + ' 课程=' + PHASES.map(p => p.tag + '=' + p.share.toFixed(2)).join(',') +
  (BUDGET_SEC > 0 ? ' 预算=' + (opt.hoursAdd > 0 ? '+' + opt.hoursAdd + 'h' : opt.hours + 'h') + '（本次投入）' : ''));
T.tick({ t:'start', run:RUN_NAME, resumed:R.resumed, ep0:R.ep0 + 1, games:opt.games, step:opt.step,
         vallevels:VAL_TAGS.map(l => l.tag).join(','), valgames:opt.eval,
         budgetSec:BUDGET_SEC, elapsedSec:R.elapsed, ckptSec:opt.noCkpt ? 0 : opt.ckpt,
         keep:opt.keep, ckptDir:rel(CKPT_DIR), curve:rel(opt.curve), trainMode:trainMode });

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

/* ---- 基线标定：起点权重能打整条阶梯多少（决定"更强"的判定线）----
 * 断点续训时沿用 index 里记录的基线（同一起点权重，重跑只会多花几十秒并引入噪声）；
 * 裸权重续训 / 新跑则现场标定。护栏依赖的档位有一条缺失就整体重测，
 * 宁可多花几十秒也不要拿残缺基线去比。 */
/* 基线标定的局数：只用于定"起点权重有多强"这条判定线，需要够稳但不必和正式
 * 验证同等精度。原值 max(60, eval*2) 在 --eval 77 下是 154 局/档，5 档共 770 局
 * ≈ 56 分钟——续训还没开跑就先吃掉半个预算（实测卡在这一步很久）。
 * 60 局/档的噪声约 ±6.3pp，对"护栏判定线"足够（它只决定"是否比起点强"）。
 * 环境口径变更后基线必须重标（旧的作废），所以这条路径不可避免，只能把单次成本压下来。 */
const BASE_G = Math.max(40, Math.round(opt.eval * 0.8));
const needTags = ['default', opt.end, PHASES[0].tag].filter((t, i, a) => a.indexOf(t) === i);
const baseUsable = !!(R.base && needTags.every(t => R.base[t] != null));
if(R.base && !baseUsable){
  console.warn('  ⚠ 断点基线缺档位（' + needTags.filter(t => R.base[t] == null).join('/') +
    '），改为现场标定');
}
const baseLadder = (R.base && baseUsable)
  ? VAL_TAGS.map(lv => R.base[lv.tag] != null
      ? { tag: lv.tag, id: lv.id, wr: R.base[lv.tag], games: BASE_G, detail: '断点记录' } : null)
      .filter(Boolean)
  /* 只标定护栏真正要用的档位（needTags = default / 顶档 / 课程首档）。
   * 原来跑满 VAL_TAGS 全部 5 档，但下游 baseDef/baseMax/basePhase 只读这 3 档，
   * 多出的 2 档纯属浪费——--eval 77 下就是白跑 246 局 ≈ 18 分钟。
   * 曲线/面板展示用的是每轮验证的 wr，不依赖 baseLadder，所以这里窄化不影响任何显示。 */
  : ladderEval(agent, opt.seed * 13, BASE_G,
               VAL_TAGS.filter(lv => needTags.indexOf(lv.tag) >= 0));
console.log('基线（' + (R.base ? '断点记录' : '起点权重') + '）：' +
  baseLadder.map(r => r.tag + '=' + (r.wr * 100).toFixed(1) + '%').join('  '));
const wrOfTag = (arr, tag, fb) => {
  const hit = arr.find(r => r.tag === tag) || (fb ? arr.find(r => r.tag === fb) : null);
  return hit ? hit.wr : 0.5;
};
const baseDef = wrOfTag(baseLadder, 'default');
const baseMax = wrOfTag(baseLadder, opt.end);
const basePhase = wrOfTag(baseLadder, PHASES[0].tag, opt.end);
CIdx.base = {}; for(const r of baseLadder) CIdx.base[r.tag] = r.wr;
CIdx.baseBest = 0.45 * baseMax + 0.30 * basePhase + 0.25 * baseDef;
/* 用起点基线初始化"最佳"，让选优护栏从第 1 次评估就真正生效——
 * 否则 bestDef=-1 会让第一块评估无条件被采纳为"最佳"，退化也会被当成成果。
 * 断点里已有 best 时沿用断点状态；缺哪一档就用起点基线兜底，别让护栏变空门。 */
if(bestScore == null){
  bestScore = CIdx.baseBest;
  bestEp = R.ep0;
  /* 此时"最佳"就是起点权重本身，它的逐档胜率就是基线标定值——
   * 记下来，检查点索引里的 wr 才有内容（否则显示空档，没法看 Δ）。 */
  for(const k of Object.keys(CIdx.base)) bestWr[k] = CIdx.base[k];
}
if(bestDef < 0) bestDef = baseDef;
if(bestMax < 0) bestMax = baseMax;
if(bestPhase < 0) bestPhase = basePhase;
console.log('选优' + (RESUME && bestScore != null && R.best != null ? '状态（断点恢复）' : '基线') + '：best=' +
  (bestScore * 100).toFixed(1) + '（vs默认=' + (bestDef * 100).toFixed(1) + '%，起点基线 ' +
  (baseDef * 100).toFixed(1) + '%，护栏下限 ' + ((bestDef - 0.05) * 100).toFixed(1) +
  '%）· vs' + opt.end + '=' + (bestMax * 100).toFixed(1) + '%）');
/* wrMap/ wr* 一并带上：面板的胜率矩阵从第 1 个打点就有内容
 * （此时最佳=起点权重本身，逐档胜率即基线标定值，Δ 为 0）。
 * wr* 是百分比（与每轮 pt 的口径一致），wrMap 保持小数供算 Δ。 */
const _bf = wrFlat(baseLadder), baseFlat = {};
for(const k of Object.keys(_bf)) baseFlat[k] = +(_bf[k] * 100).toFixed(1);
T.tick(Object.assign({ t:'verify', stage: (RESUME && R.best != null) ? 'resume' : 'baseline',
  /* elapsedSec 必须带：面板的时间预算以外推为骨架，这条打点比 start 晚几十秒才到，
     缺它会让外推锚点前移而 sec 停在 0，进度条倒退到 0 再重爬。 */
  elapsedSec: +elapsed().toFixed(1), ep: R.ep0, resumed: !!RESUME,
  base: CIdx.base, baseBest: +CIdx.baseBest.toFixed(4),
  bestEp: bestEp, wrMap: Object.assign({}, CIdx.base),
  ladder: baseLadder.map(r => r.tag + ':' + r.wr.toFixed(3)).join(',') }, baseFlat));

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
/* ---- 早停（兜底：只在模型"彻底崩了"时停）----
 *
 * 判据用两条，**都与起点基线无关**——这是 2026-10-03 修掉的一个真 bug：
 * 原来写的是 `epD < baseDef - ABORT_GAP`，ABORT_GAP=0.18。它在旧配置下成立
 * （起点是有能力的模型，基线 37.7%，阈值 19.7%），但从零训练（--from random）
 * 后基线只有 7.0%，阈值算成 **-11%** —— 胜率不可能低于 0，这个条件**永远为假**。
 * 后果实测：ep5400 的 vs地狱 掉到 5.7%（比随机初始化还差），日志里一条
 * 退化告警都没有，早停形同虚设。
 *
 * 现在的两条判据：
 *   1) ABORT_DROP —— 相对**本轮最佳**的跌幅。选优分 bestScore 已经吸收了
 *      「对手变强时分数自然降低」的影响，所以拿它当参照不会被课程推进误伤。
 *      0.30 = 掉到峰值的 70%；77 局评估的噪声约 ±5.7pp，30pp 是它的 5 倍余量。
 *   2) ABORT_FLOOR —— 绝对地板 0.12。低于 12% 基本等于没在打球（比随机初始化的
 *      7% 高不了多少），任何训练配置下这都是废的。
 * 两条都满足才算退化，连续 ABORT_N 轮才停，避免单轮噪声误杀。 */
const ABORT_DROP = 0.30, ABORT_FLOOR = 0.12, ABORT_N = 4;
const clEps = (v) => v < 0.02 ? 0.02 : (v > 1 ? 1 : v);
let epsBoost = 0;
let degenerate = 0;
let curPhaseTag = null;
let lastEp = 0, lastCkpt = 0;
const fmtH = (s) => {
  s = Math.max(0, Math.floor(s));
  const h = (s / 3600) | 0, m = ((s % 3600) / 60) | 0, ss = s % 60;
  return h > 0 ? h + 'h' + (m > 0 ? String(m).padStart(2, '0') + 'm' : '')
       : (m > 0 ? m + 'm' + (ss ? ss + 's' : '') : ss + 's');
};

/* ---- 检查点落盘：存 bestNet（可直接当 --from），index 记本轮胜率与累计状态 ----
 * 权重文件给脚本/烘焙用；index.json 才是续训入口（ep、best、逐档胜率、累计胜率、
 * 累计墙钟耗时都记在里面，--hours 预算靠它跨中断累计）。
 * 环形保留 --keep 份 + 历史最佳那份：18h 长跑按 step 200 局落一次会有上千个 3.7MB
 * 文件，不裁盘会写爆磁盘。 */
function writeCheckpoint(ep){
  if(opt.noCkpt) return;
  const cur = agent.getNet();
  agent.setNet(bestNet);
  const file = 'ckpt-' + String(ep).padStart(6, '0') + '.json';
  try{
    fs.mkdirSync(CKPT_DIR, { recursive: true });
    fs.writeFileSync(path.join(CKPT_DIR, file), agent.serialize(), 'utf8');
  }catch(e){ console.warn('  ⚠ 检查点写入失败：' + e.message); }
  agent.setNet(cur);
  let size = 0;
  try{ size = fs.statSync(path.join(CKPT_DIR, file)).size; }catch(e){}
  const entry = { ep, sec: +elapsed().toFixed(1), best: +bestScore.toFixed(4), bestEp: bestEp,
                  wr: Object.assign({}, bestWr), trainWins: win, trainTotal: total,
                  eps: +agent.getEps().toFixed(3), file, size };
  /* 同一 ep 覆盖写（断电后续训常落在同一边界）：替换旧条目而不是追加，
   * 否则 index.json 里会攒出重复行、面板表格也会有重复 ep。 */
  const slot = CIdx.checks.findIndex(c => c.ep === ep);
  if(slot >= 0) CIdx.checks[slot] = entry; else CIdx.checks.push(entry);
  if(!CIdx.best || entry.best > CIdx.best.best)
    CIdx.best = { ep: entry.ep, best: entry.best, wr: entry.wr, sec: entry.sec, file: entry.file };
  CIdx.updated = new Date().toISOString();
  CIdx.elapsedSec = entry.sec;
  CIdx.cur = { ep, sec: entry.sec, best: entry.best, eps: entry.eps,
               trainW: +(win / Math.max(1, total) * 100).toFixed(1), wr: entry.wr };
  trimRing();
  try{ fs.writeFileSync(IDX_PATH, JSON.stringify(CIdx, null, 2), 'utf8'); }
  catch(e){ console.warn('  ⚠ 检查点索引写入失败：' + e.message); }
}
function trimRing(){
  if(opt.keep <= 0 || CIdx.checks.length <= opt.keep) return;
  const bestEp = CIdx.best ? CIdx.best.ep : null;
  const keep = new Set(CIdx.checks.slice(-opt.keep).map(c => c.ep));
  if(bestEp != null) keep.add(bestEp);
  for(const c of CIdx.checks.slice()){
    if(keep.has(c.ep)) continue;
    try{ fs.unlinkSync(path.join(CKPT_DIR, c.file)); }catch(e){}
    CIdx.checks = CIdx.checks.filter(x => x !== c);
  }
}

/* ---- 预算已在断点前用光：不白跑一轮验证，直接跳到最终评估与收尾 ---- */
let budgetExhausted = false;
if(BUDGET_SEC > 0 && elapsed() >= BUDGET_SEC){
  budgetExhausted = true;
  console.warn('\n⏱ --hours ' + opt.hours + ' 预算已用完（断点累计 ' + fmtH(R.elapsed) +
    '）——没有可继续的训练量。');
  console.warn('  加预算：--hours-add 3（在已累计的 ' + (R.elapsed / 3600).toFixed(2) +
    'h 之上再投 3h），或 --hours ' + Math.ceil(R.elapsed / 3600 + 1) +
    '（总量覆盖式），或两者都不给取消限时只用 --games 兜底。');
  T.tick({ t:'budget', exhausted:true, hours:opt.hours, elapsedSec:R.elapsed, sec:R.elapsed });
}
/* 心跳计时：一轮 --step 可能长达 20 多分钟，期间若不打点，面板在长跑里只剩
 * 进度条自己慢慢爬，日志和胜率矩阵全静默——看不出"正在训"。每 10 秒报一次。 */
let tHb = Date.now();
/* ---- 优雅暂停（哨兵文件 + 信号）----
 * 长跑必须能"停在任意回合而不丢进度"：请求停止后在下一个回合边界落检查点再退，
 * 跳过最终评估与采纳（那是"跑完"的事，暂停不该动生产权重）。
 * 主通道是哨兵文件，不是信号：Windows 上 server 的 child.kill('SIGTERM') 走的是
 * TerminateProcess，信号处理器根本收不到，面板点「停止」等于硬杀、丢光当前回合。
 * 所以 server.js 改写成先落一个 STOP 文件，这里每局检查一下，发现就停。
 * 信号（SIGTERM/SIGINT/SIGBREAK）保留：真实终端里 Ctrl+C 也能优雅停。
 * 哨兵按 run-name 隔离；启动时清掉上次残留，否则新批次会被上一轮的停止请求秒杀。 */
const STOP_DIR = path.join(ROOT, 'data', '.stop');
const STOP_NAME = (opt.runName || path.basename(opt.save, '.json') || 'run') + '.stop';
const STOP_FLAG = path.join(STOP_DIR, STOP_NAME);
/* 启动阶段要区分"残留"和"正在进行中的停止请求"：本进程从启动到进入训练循环
 * 要加载权重、标定基线，耗时几十秒（实测约 35s）。这段时间里面板点「停止」，
 * server 写下的哨兵是真实的请求，不是残留——按文件存在与否一刀切会把它清掉，
 * 训练就永远停不下来，最后只能等 server 的 SIGKILL 兜底。
 * 判据用时间：标记的 mtime 早于本进程启动时间 = 上一轮遗留，可以删；
 * 晚于启动时间 = 新请求，留着让训练循环响应。 */
const PROCESS_START_MS = Date.now() - process.uptime() * 1000;
try{
  fs.mkdirSync(STOP_DIR, { recursive: true });
  if(fs.existsSync(STOP_FLAG)){
    if(fs.statSync(STOP_FLAG).mtimeMs < PROCESS_START_MS){
      fs.unlinkSync(STOP_FLAG);
      console.log('  清掉本进程启动前的残留停止标记：' + rel(STOP_FLAG));
    } else {
      console.log('  ⚠ 启动期间收到停止标记，进入训练循环后立刻响应');
    }
  }
}catch(e){}
let stopRequested = false, stopSig = null, stopEp = 0;
function requestStop(reason){
  if(stopRequested) return;
  stopRequested = true; stopSig = reason;
  console.log('\n⏸ 停止请求（' + reason + '）：完成当前回合后落检查点退出，不跑最终评估');
  T.tick({ t:'stop', reason:reason, ep:lastEp, elapsedSec:+elapsed().toFixed(1) });
}
for(const sig of ['SIGTERM', 'SIGINT', 'SIGBREAK']){
  try{
    process.on(sig, () => {
      if(stopRequested){ console.log('\n⏸ 再次收到停止信号：直接退出（检查点已落盘）'); process.exit(0); }
      requestStop(sig);
    });
  }catch(e){ /* 某些信号在当前平台不支持，忽略 */ }
}
for(let g = R.ep0; g < opt.games && !budgetExhausted && !stopRequested; g++){ stopEp = g + 1;
  if(!stopRequested && fs.existsSync(STOP_FLAG)) requestStop('停止标记');
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
  if(Date.now() - tHb >= 10000){
    tHb = Date.now();
    T.tick({ t:'hb', ep:g + 1, lastEp:lastEp, step:opt.step,
             inRound: lastEp ? g + 1 - lastEp : g + 1 - R.ep0,
             elapsedSec:+elapsed().toFixed(1),
             remainSec: BUDGET_SEC > 0 ? +remain().toFixed(1) : -1,
             eps:+agent.getEps().toFixed(3), phase:phase.tag,
             trainWins:win, trainTotal:total,
             best:+bestScore.toFixed(4), bestEp:bestEp });
  }
  /* 周期性重锚：续训默认关闭。实测 3 pass/100局 ≈ 2 万次"追球"硬监督，
   * 足以把起点的好策略冲回 naive 水平（150 局 vs默认 71.9%→47.3%）。
   * 需要长期保鲜时用 --bcpass 1 显式打开。 */
  if(opt.bcpass > 0 && (g + 1) % 100 === 0){
    for(let p = 0; p < opt.bcpass; p++) for(let i = 0; i < bcPairs.length; i++) agent.imitate(bcPairs[i][0], bcPairs[i][1], 1.6);
  }

  if((g + 1) % opt.step === 0){
    lastEp = g + 1;
    /* ---- 全阶梯验证：本轮对 --vallevels 的每档各打 opt.eval 局 ----
     * 逐档胜率就是面板上「对不同模型的验证胜率」；选优仍只取其中 3 档
     * （顶档为主 / 本阶段次之 / 默认策略做回归护栏）。 */
    const tEv = Date.now();
    const res = ladderEval2(agent, opt.seed * 91 + g, opt.eval, VAL_TAGS);
    const wr = wrFlat(res);
    const wrMap = {}; for(const r of res) wrMap[r.tag] = r.wr;
    const epM = wrMap[opt.end], epD = wrMap['default'];   // 顶档与 default 已强制包含，必然存在
    const epH = (typeof wrMap[phase.tag] === 'number') ? wrMap[phase.tag] : epM;
    /* 选优分：顶档为主、本阶段次之、默认策略做护栏 */
    const sc = 0.45 * epM + 0.30 * epH + 0.25 * epD;
    const keep = (sc > bestScore) && (epD >= bestDef - 0.05);
    if(keep){
      bestScore = sc; bestDef = epD; bestMax = epM; bestPhase = epH; bestEp = g + 1;
      Object.assign(bestWr, wrMap);
      bestNet = JSON.parse(JSON.stringify(agent.getNet()));
      console.log('  ★ 新最佳（ep ' + (g + 1) + '）：best=' + (bestScore * 100).toFixed(1) +
        ' · vs' + opt.end + ' ' + (epM * 100).toFixed(1) + '% · vs本档 ' + (epH * 100).toFixed(1) +
        '% · vs默认 ' + (epD * 100).toFixed(1) + '%');
    }
    /* 早停：连续 ABORT_N 轮**同时**满足「相对本轮最佳跌幅过大」**且**「绝对地板过低」，
     * 说明这组超参在毁模型（典型：BC 占比过高、学习率过大、回放太小），立刻停。
     * 详见 ABORT_DROP 注释——关键是判据不依赖起点基线，否则从零训练时阈值会变成负数。
     *
     * ★ 2026-10-10 修：这里原来是 `abDrop || abFloor`，与上方注释「两条都满足才算退化」
     *   相矛盾，效果是**分数相对峰值掉 30% 单独就能触发退化计数**，哪怕绝对水平还好。
     *   实测代价：input3-hell12h 在 ep 2250 被误停 —— 那三轮 default 分别是
     *   30.0 / 27.5 / 30.0%，全都远高于 12% 的地板（模型在正常打球），只是分数相对
     *   峰值 41.6% 掉了 30%+。而选优分在 77 局评估下本身就在 ±10pp 内晃，
     *   「相对峰值 -30%」很容易纯靠噪声达成 → 一个正在推进的进程被停掉。
     *   改成 && 后，那三轮不再计数；真正的崩坏（default 5.0% / hell 0.0%）
     *   两条同时成立，仍然会被抓住。 */
    const abDrop = (bestScore > 0) && (sc < bestScore * (1 - ABORT_DROP));
    const abFloor = (epD < ABORT_FLOOR) && (epM < ABORT_FLOOR);
    if(abDrop && abFloor){
      degenerate++;
      console.warn('  ⚠ 评估退化（vs默认 ' + (epD * 100).toFixed(1) + '% · vs' + opt.end + ' ' +
        (epM * 100).toFixed(1) + '% · 本轮分 ' + (sc * 100).toFixed(1) + '% vs 最佳 ' +
        (bestScore * 100).toFixed(1) + '%' +
        (abDrop ? ' · 跌幅>30%' : '') + (abFloor ? ' · 低于地板12%' : '') +
        '）· 退化 ' + degenerate + '/' + ABORT_N);
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
    const pt = { ep: g + 1, phase: phase.tag,
                 trainW: +(win / total * 100).toFixed(1),
                 evalPhase: +(epH * 100).toFixed(1), evalTop: +(epM * 100).toFixed(1), evalDef: +(epD * 100).toFixed(1),
                 best: +(bestScore * 100).toFixed(1), bestTop: +(bestMax * 100).toFixed(1), bestEp: bestEp,
                 eps: +agent.getEps().toFixed(2), evSec: +((Date.now() - tEv) / 1000).toFixed(1) };
    for(const k of Object.keys(wr)) pt[k] = +(wr[k] * 100).toFixed(1);   // 百分比，与 trainW/eval* 同轴
    pt.wrMap = wrMap;                                                     // 小数，面板矩阵算 Δ 用
    curve.push(pt);
    fs.writeFileSync(opt.curve, JSON.stringify(curve, null, 2), 'utf8');
    console.log(`ep ${String(g + 1).padStart(5)} [${phase.tag}]  train=${(win / total * 100).toFixed(0)}%` +
      VAL_TAGS.map(l => '  vs' + l.tag + '=' + ((wrMap[l.tag] || 0) * 100).toFixed(1) + '%').join('') +
      `  best=${(bestScore * 100).toFixed(1)}@${bestEp}  eps=${agent.getEps().toFixed(2)}` +
      (BUDGET_SEC > 0 ? '  剩' + fmtH(remain()) : '') +
      `  [${elapsed().toFixed(0)}s · 验证${((Date.now() - tEv) / 1000).toFixed(0)}s]`);
    T.tick(Object.assign({ t:'ep', sec:+elapsed().toFixed(1), elapsedSec:+elapsed().toFixed(1),
      bestEp: bestEp }, pt));
  }
  /* ---- 检查点：按 --ckpt 独立落盘（不必与轮次对齐）----
   * bestNet 进检查点环形目录，进程被杀 / 断电都能接着跑。
   * 注意：这里不再像旧版那样顺手覆盖生产权重 data/input-ai-extreme.json——
   * 中途产物没过采纳线，覆盖等于让游戏用回退权重。生产权重只在结尾按
   * 采纳条件写一次。 */
  if((g + 1) % opt.ckpt === 0){
    writeCheckpoint(g + 1);
    lastCkpt = g + 1;
    console.log('  ●ckpt ep ' + (g + 1) + ' → ' + rel(IDX_PATH) +
      '（best=' + (bestScore * 100).toFixed(1) + '@' + bestEp + ' · 留 ' + CIdx.checks.length + ' 份）');
    T.tick({ t:'ckpt', ep:g + 1, best:+bestScore.toFixed(4), bestEp:bestEp,
             ckptDir:rel(CKPT_DIR), ckpts:CIdx.checks.length });
  }

  /* ---- 墙钟预算到点：在最近的检查点 / 轮次边界停（该点已落盘）---- */
  if(BUDGET_SEC > 0 && elapsed() >= BUDGET_SEC && (g + 1) % Math.min(opt.step, opt.ckpt) === 0){
    console.log('⏱ 已达 --hours ' + opt.hours + ' 预算（用时 ' + fmtH(elapsed()) + '），在边界停止');
    console.log('  续训：node tools/train-input3.js --resume ' + rel(IDX_PATH) +
                ' --hours ' + opt.hours + (opt.noSave ? ' --no-save' : ''));
    T.tick({ t:'budget', ep:g + 1, hours:opt.hours, elapsedSec:+elapsed().toFixed(1), sec:+elapsed().toFixed(1) });
    break;
  }
}

/* ---- 暂停收尾：落检查点即退，不跑最终评估、不碰生产权重 ---- */
if(stopRequested){
  try{ if(fs.existsSync(STOP_FLAG)) fs.unlinkSync(STOP_FLAG); }catch(e){}
  if(!opt.noCkpt && stopEp > lastCkpt){
    writeCheckpoint(stopEp); lastCkpt = stopEp;
  }
  fs.writeFileSync(opt.curve, JSON.stringify(curve, null, 2), 'utf8');
  console.log('\n⏸ 已暂停 —— 进度已保存，生产权重未动');
  console.log('  进度   ：ep ' + stopEp + '（累计 ' + fmtH(elapsed()) + '，本次训了 ' + (stopEp - R.ep0) + ' 回合）');
  console.log('  最佳   ：best=' + (bestScore * 100).toFixed(1) + '@' + bestEp +
              ' · vs' + opt.end + ' ' + (bestMax * 100).toFixed(1) +
              '% · vs默认 ' + (bestDef * 100).toFixed(1) + '%');
  console.log('  检查点 ：' + rel(IDX_PATH) + '（' + CIdx.checks.length + ' 份，环形保留 ' + opt.keep + ' 份）');
  console.log('  继续跑 ：node tools/train-input3.js --resume ' + rel(IDX_PATH) +
              ' --hours ' + opt.hours + (opt.noSave ? ' --no-save' : ''));
  /* wr* 口径是百分比（wrMap 才是小数），bestWr 里是小数，这里乘 100 */
  const paFlat = {};
  for(const k of Object.keys(bestWr))
    paFlat['wr' + k.split('-').map(s => s.charAt(0).toUpperCase() + s.slice(1)).join('')] = +(bestWr[k] * 100).toFixed(2);
  T.tick(Object.assign({ t:'paused', reason:stopSig, ep:stopEp, ckpt:rel(IDX_PATH),
           ckpts:CIdx.checks.length, best:+bestScore.toFixed(4), bestEp:bestEp,
           trained:stopEp - R.ep0, elapsedSec:+elapsed().toFixed(1) }, paFlat));
  process.exit(0);
}

/* ================= 最终评估：bestNet vs 验证阶梯 ================= */
if(bestNet) agent.setNet(bestNet);
const FINAL_G = Math.max(80, opt.eval * 2);
console.log('\n=== 最佳权重最终评估（' + FINAL_G + ' 局/档）===');
const finNew = ladderEval2(agent, opt.seed * 51, Math.max(40, Math.round(FINAL_G / 2)), VAL_TAGS);
const finBase = baseLadder;   // 基线已在训练前标定（同一份起点权重）
/* ★ 按档名匹配，不按下标。baseLadder 现场标定时只跑 needTags 三档（省 246 局），
 *   而 finNew 是完整 VAL_TAGS —— 原来 `finBase[i]` 按下标取，第四档起是 undefined，
 *   `--from random`（无断点基线）必崩 TypeError；--resume 带残缺基线时则把
 *   「default 的胜率」和「顶档的胜率」错位相减，算出 0.0704 / 0.4682 这种数
 *   （input3-v4 的 final.base 就是这么来的）。 */
const baseByTag = {}; for(const r of baseLadder) baseByTag[r.tag] = r;
console.log('  对手'.padEnd(16) + '最佳权重      起点权重');
for(let i = 0; i < finNew.length; i++){
  const a = finNew[i], b = baseByTag[a.tag];
  if(!b){ console.log('  ' + a.tag.padEnd(14) + (a.wr * 100).toFixed(1).padStart(6) + '%' + '  ' + '  (基线无此档)'); continue; }
  const d = (a.wr - b.wr) * 100;
  console.log('  ' + a.tag.padEnd(14) + (a.wr * 100).toFixed(1).padStart(6) + '%' + '  ' +
              (b.wr * 100).toFixed(1).padStart(6) + '%' + '  ' + (d >= 0 ? '+' : '') + d.toFixed(1));
}

const nDef = wrOfTag(finNew, 'default');
const nMax = wrOfTag(finNew, opt.end);
const nStart = wrOfTag(finNew, PHASES[0].tag, opt.end);
/* 采纳条件：对顶档明显更强，且不显著退步 vs 默认策略（回归护栏） */
const adopt = (!opt.noSave) && (nMax >= baseMax + 0.015) && (nDef >= baseDef - 0.03);
/* 用最终标定（局数更多、噪声更小）重算选优分，收尾检查点记这份更准的胜率 */
bestScore = 0.45 * nMax + 0.30 * nStart + 0.25 * nDef;
const finMap = {}; for(const r of finNew) finMap[r.tag] = r.wr;
Object.assign(bestWr, finMap);
const finalEp = Math.max(lastEp, lastCkpt) || R.ep0;
const lastCkptEp = CIdx.checks.length ? CIdx.checks[CIdx.checks.length - 1].ep : 0;
if(lastCkptEp !== finalEp) writeCheckpoint(finalEp);
CIdx.status = adopt ? 'adopted' : (opt.noSave ? 'dry-run' : 'not-adopted');
CIdx.final = { ep: finalEp, wr: finMap, best: +bestScore.toFixed(4),
               vsDefault: nDef, vsTop: nMax, vsStartOpp: nStart,
               base: CIdx.base, elapsedSec: +elapsed().toFixed(1), adopted: adopt };
try{ fs.writeFileSync(IDX_PATH, JSON.stringify(CIdx, null, 2), 'utf8'); }catch(e){}

const finFlat = wrFlat(finNew);
const finPt = { ep: finalEp, phase: 'final', best: +(bestScore * 100).toFixed(1),
                evalDef: +(nDef * 100).toFixed(1), evalTop: +(nMax * 100).toFixed(1),
                evalPhase: +(nStart * 100).toFixed(1), wrMap: finMap };
for(const k of Object.keys(finFlat)) finPt[k] = +(finFlat[k] * 100).toFixed(1);
T.phase('verify', '最终阶梯评估完成');
T.tick(Object.assign({ t:'verify', stage:'final', elapsedSec: +elapsed().toFixed(1),
  vsDefault:+nDef.toFixed(4), vsDefaultBase:+baseDef.toFixed(4),
  vsTop:+nMax.toFixed(4), vsTopBase:+baseMax.toFixed(4),
  vsStartOpp:+nStart.toFixed(4),
  ladder: finNew.map(r => r.tag + ':' + r.wr.toFixed(3)).join(',') }, finPt));

fs.writeFileSync(opt.curve, JSON.stringify(curve, null, 2), 'utf8');
console.log('已写 ' + rel(opt.curve));
const doneBase = {
  vsTop:+nMax.toFixed(4), vsTopBase:+baseMax.toFixed(4), vsDefault:+nDef.toFixed(4),
  games:opt.games, trained:finalEp - R.ep0, ep:finalEp,
  sec:+elapsed().toFixed(1), elapsedSec:+elapsed().toFixed(1),
  budgetSec:BUDGET_SEC, remainSec:BUDGET_SEC > 0 ? +remain().toFixed(0) : null,
  ckpts:CIdx.checks.length, ckptDir:rel(CKPT_DIR), ckptIdx:rel(IDX_PATH)
};
if(adopt){
  fs.mkdirSync(path.dirname(opt.save), { recursive: true });
  fs.writeFileSync(opt.save, agent.serialize(), 'utf8');
  const relSave = rel(opt.save);
  console.log('✅ 采纳：已保存 ' + relSave +
              '（vs ' + opt.end + ' ' + (nMax * 100).toFixed(1) + '% ← 基线 ' + (baseMax * 100).toFixed(1) + '%）');
  console.log('\n下一步：');
  console.log('  1) 烘焙进实机：   node tools/bake-input.js ' + relSave + ' ' + nMax.toFixed(3) + ' ' + nDef.toFixed(3));
  console.log('  2) 加预算继续跑： node tools/train-input3.js --resume ' + rel(IDX_PATH) + ' --hours 6 --no-save');
  console.log('  3) 检查点目录：   ' + rel(CKPT_DIR) + '（' + CIdx.checks.length + ' 份，任意一份可直接 --from）');
  T.tick(Object.assign({ t:'done', mode:'input-extreme-curriculum', adopted:true, save:relSave }, doneBase));
} else {
  console.log('\n⚠ ' + (opt.noSave ? '--no-save：实验模式，不写入 ' + rel(opt.save)
    : '未通过采纳线（需 vs' + opt.end + ' 至少 +1.5pp 且 vs默认 不劣于 -3pp），' + rel(opt.save) + ' 保持不变'));
  console.log('  检查点仍在 ' + rel(CKPT_DIR) + '（' + CIdx.checks.length + ' 份），--resume 可加预算继续');
  T.tick(Object.assign({ t:'done', mode:'input-extreme-curriculum', adopted:false, noWrite:opt.noSave }, doneBase));
}
process.exit(0);
