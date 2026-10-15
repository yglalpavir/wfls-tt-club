/* _bc_pretrain.js —— 「只做追球 BC」的对照实验（R5 判决实验）
 *
 * 目的：在烧掉 12 小时之前，先用**最小成本**验证根因假设。
 *
 * 根因假设（R5 诊断，见 tools/phase5-findings.md）：
 *   线上权重的 argmax 决策只用 34 个鼠标X里的 4 个，球在 |x|∈[0.8,1.2] 时
 *   拍面目标仍停在 ±0.14m，而接触窗口只有 ±0.29~0.34m → 物理上够不到
 *   → 95~99% 的败局判 noreach。修好「追**拦截预测点**」这一个动作，
 *   实机胜率就应该明显高于基线的 11.7%。
 *
 * 本脚本做的事：
 *   1. 随机初始化（或从 --from 续）一个 net；
 *   2. 用一个**纯脚本**追球脑（无 RL、无探索）打若干局采集 (obs → 追球动作) 对；
 *   3. 只用 agent.imitate() 做监督预训练若干轮；
 *   4. 输出 agent.serialize()（live-match.js --from 直接吃这个格式）。
 *
 * 用法：
 *   node tools/_bc_pretrain.js --games 120 --epochs 30 --lr 0.004 --out data/checkpoints/_bc-chase/bc.json
 *   node tools/live-match.js --from data/checkpoints/_bc-chase/bc.json --opp hell --games 30 --live-only
 *
 * 关键点：pretrain 阶段**不做 TD**，所以如果「追球」本身就打不过地狱 AI，
 * 那么整套 R5 诊断就是错的，必须在烧 12h 之前推翻重查。
 */
const path = require('path');
const fs = require('fs');

const ROOT = path.join(__dirname, '..');
const PP = require(path.join(ROOT, 'js', 'policy.js'));
const INPUTSIM = require(path.join(ROOT, 'js', 'input-sim.js'));
const IA = require(path.join(ROOT, 'js', 'input-agent.js'));

/* ---------- 参数 ---------- */
const argv = process.argv.slice(2);
const argOf = (k, d) => {
  const i = argv.indexOf('--' + k);
  return (i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--')) ? argv[i + 1] : d;
};
const num = (k, d) => { const v = Number(argOf(k, d)); return Number.isFinite(v) ? v : d; };

const GAMES = num('games', 120);      // 采集监督对的局数
const POOL = num('pool', 120);       // 实际进训练池的条数（分层采样，见下方实测）
const EPOCHS = num('epochs', 30);     // 扫全池的轮数
const LR = num('lr', 0.004);          // imitate 的 lr（比 TD 大：纯回归）
const BOOST = num('boost', 1.6);
const OUT = path.join(ROOT, argOf('out', 'data/checkpoints/_bc-chase/bc.json'));
const FROM = argOf('from', '');
const OPP = argOf('opp', 'default');  // 采集时对手：default = 单一、稳定
const SEED = num('seed', 20261014);

function mulberry32(a){
  return function(){
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* ---------- 建 agent ---------- */
const agent = IA.createInputAgent({
  stateSize: IA.OBS_N, nActions: IA.ACT_N, hSizes: IA.HSIZES,
  batch: 64, gamma: 0.99, lr: LR, trainMode: 'sgd',
});
/* 纯 SGD 实测学不动（185k 记 imitate，argmax 命中率钉在 16.2% 不动）——
 * 与 tools/diag-grad.js 的结论一致：单 lr 喂 192 维隐层和 1904 维输出层，
 * 输出层被欠驱动约 10 倍。正式 12h 配置本来就走 adam+分层 lr+裁剪，
 * 这里照抄同一套，不发明新配方。 */
const layerLr = String(argOf('layer-lr', '1,1,1,3')).split(',').map(Number);
agent.setOptimizer({ optimizer: argOf('optimizer', 'adam'),
                      gradClip: num('grad-clip', 2),
                      lrScale: layerLr.filter(v => Number.isFinite(v)) });
agent.setEps(0);
agent.setLr(LR);   // imitate() 内部用 o.lr * 0.9，不接受 lr 形参
let warmed = '随机初始化';
if(FROM && fs.existsSync(FROM)){
  const b = JSON.parse(fs.readFileSync(FROM, 'utf8'));
  agent.setNet(b.w || b.net);
  warmed = FROM;
}
console.log('起点权重：' + warmed);
console.log('网络规格：OBS_N=' + IA.OBS_N + ' ACT_N=' + IA.ACT_N + ' HSIZES=' + JSON.stringify(IA.HSIZES));
console.log('训练路径：' + agent.getTrainMode() + '  lr=' + LR + '  分层lr=' + JSON.stringify(layerLr));

/* ---------- 追球脑：唯一的「策略」就是追拦截预测点 ---------- */
const clamp = (v, lo, hi) => (v < lo ? lo : (v > hi ? hi : v));
function chaseTx(o){
  const x = o.x || 0, vx = o.vx || 0, vz = o.vz || 0;
  const pz = (o.pz != null) ? o.pz : INPUTSIM.PLAYER_Z;
  const closing = (pz - (o.z || 0)) * vz > 0 && Math.abs(vz) > 0.05;
  const tau = closing ? Math.min(1.5, Math.abs((pz - (o.z || 0)) / vz)) : 0;
  return clamp(x + vx * tau, -0.9, 0.9);
}
const chaseCmd = (o) => ({ tx: chaseTx(o), my: 0.5, ctrl: false });

/* ---------- 采集监督对 ---------- */
const pairs = [];
let seen = 0;
const brain = {
  act(o){
    const c = chaseCmd(o);
    pairs.push({ raw: Object.assign({}, o), st: agent.encode(o), act: IA.nearestAction(c.tx, c.my, c.ctrl) });
    seen++;
    return c;
  },
  credit(){},
};
const policy = (OPP === 'default') ? PP.POLICY_DEFAULT : null;
if(!policy){ console.error('本对照实验只支持 --opp default（保证分布干净）'); process.exit(2); }
for(let g = 0; g < GAMES; g++){
  INPUTSIM.playInputPoint(brain, policy, mulberry32(SEED + g), g % 2 === 0 ? 'player' : 'ai');
}
console.log('采集 ' + pairs.length + ' 条监督对（' + GAMES + ' 局，' + seen + ' 次决策，对手=' + OPP + '）');

/* 采样质量体检：tx 的分布必须真的在追球，而不是塌在中心 */
{
  const txs = pairs.map(p => p.st[10] * 1.2);
  const uniq = new Set(txs.map(v => v.toFixed(2)));
  const mean = txs.reduce((a, b) => a + b, 0) / Math.max(1, txs.length);
  let lo = Infinity, hi = -Infinity;
  for(const v of txs){ if(v < lo) lo = v; if(v > hi) hi = v; }
  console.log('  示范 tx：均值 ' + mean.toFixed(3) + '  范围 [' + lo.toFixed(2) + ', ' + hi.toFixed(2) + ']  取值数 ' + uniq.size);
}

/* ---------- 纯监督预训练 ----------
 * ★ R5 实测（tools/_diag_bc_capacity.js，训练集内 argmax 命中率）：
 *     N=   1 sgd lr0.01  e1=0%  e5=100%
 *     N=  20 sgd lr0.01  e1=55% e5=55% e10=60%
 *     N= 100 sgd lr0.01  e1=12%（之后 40 epoch 纹丝不动）
 *     N= 520 sgd lr0.01  e1=1%  e5=1%  e40=1%
 *   池子越大、迭代越多，命中率越低且**在第一个 epoch 之后就不再动**。
 *   原因：raise-only 的 imitate 只在 q[示范] < boost 时才有梯度，一旦所有示范
 *   都抬到位就整体冻结（delta=0）；命中率上不去就永远在推，于是 1904 个输出行
 *   被 520 个不同状态轮番往上抬 + 隐层互相打架，最后 argmax 与示范无关。
 *   结论：这个「追球」函数用全池逐帧硬拟合并不划算——命中率的绝对值不是目标，
 *   **实机能不能接到球**才是。所以池子取分层采样（覆盖全程而不是开局几帧）、
 *   epoch 压到个位数，别把时间烧在这里。真正的提升交给后面的 TD 续训。 */
const pick = [];
if(pairs.length <= POOL){ pick.push(...pairs); }
else{
  const step = pairs.length / POOL;
  for(let i = 0; i < POOL; i++) pick.push(pairs[Math.floor(i * step)]);
}
console.log('训练池 ' + pick.length + ' 条（从 ' + pairs.length + ' 条分层采样）');

for(let e = 1; e <= EPOCHS; e++){
  for(const p of pick){
    agent.imitate(p.st, p.act, BOOST);   // 内部用 o.lr * 0.9（见 input-agent.js imitate）
  }
  if(e === 1 || e % 5 === 0 || e === EPOCHS){
    /* argmax 命中率：训练后的 argmax 是否就是示范动作。
     * ⚠ bestAction() 收的是**原始 obs**（内部自己 encodeObs），
     *   传编码向量会二次编码 → 命中率恒定在噪声值上（踩过一次）。 */
    let hit = 0;
    for(const p of pick){
      if(agent.bestAction(p.raw) === p.act) hit++;
    }
    console.log('  epoch ' + String(e).padStart(3) + '/' + EPOCHS +
                '  argmax 命中率 ' + (100 * hit / pick.length).toFixed(1) + '%');
  }
}

/* ---------- 输出 ---------- */
fs.mkdirSync(path.dirname(OUT), { recursive: true });
const blob = agent.serialize();
fs.writeFileSync(OUT, blob, 'utf8');
console.log('已写出 ' + path.relative(ROOT, OUT) + '（' + (blob.length / 1024).toFixed(0) + ' KB）');
console.log('下一步：node tools/live-match.js --from ' + path.relative(ROOT, OUT).replace(/\\/g, '/') +
            ' --opp hell --games 30 --live-only');