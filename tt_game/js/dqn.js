/* =====================================================================
 *  dqn.js — 深度强化学习核心（纯 JS，无依赖，浏览器/Node 共用）
 *  · 小型 MLP 作为 Q 网络（state → 各动作 Q 值）
 *  · DQN agent：ε-greedy 选动作 + 经验回放 + 目标网络 + TD 学习
 *  · 与 simmatch 自对弈环境配合（tools/train-dqn.js 训练）
 *  · 决策：DQN 输出"打法模式"（push/lift/counter/smash/loop/def），
 *    出球物理仍复用 aiDecision（forceMode）→ 混合策略（NN 学战术、物理沿用）
 * ===================================================================== */
'use strict';

/* ---------- 小型 MLP（前向 + 反向，SGD） ----------
   weights = [{W: out×in, b: out}, ...]（隐藏层 ReLU，输出层线性） */
function mlpInit(sizes, rng){
  rng = rng || Math.random;
  const w = [];
  for(let i = 0; i < sizes.length - 1; i++){
    const inN = sizes[i], outN = sizes[i + 1];
    const scale = Math.sqrt(2 / inN);
    const W = [], b = [];
    for(let j = 0; j < outN; j++){
      const row = [];
      for(let k = 0; k < inN; k++) row.push((rng() * 2 - 1) * scale);
      W.push(row); b.push(0);
    }
    w.push({ W, b });
  }
  return w;
}
/* 前向：返回 {acts, last}（acts[i]=第 i 层激活，acts[0]=输入；last=输出层线性值） */
function mlpForward(w, input){
  const acts = [input.slice()];
  for(let i = 0; i < w.length; i++){
    const { W, b } = w[i];
    const lin = W.map((row, j) => row.reduce((s, v, k) => s + v * acts[i][k], 0) + b[j]);
    acts.push(lin);
    if(i < w.length - 1) acts[i + 1] = lin.map(x => Math.max(0, x));   // ReLU 隐藏层
  }
  return { acts, last: acts[acts.length - 1] };
}
/* 反向传播 + SGD：MSE loss 对输出 Q 向量，更新权重（lr 学习率）。
 * 第 5 个参数 opts 为可选增强项（optimizer='adam' / gradClip / lrScale）。
 * 不传 opts、或 opts 未启用任何增强项 → 走 mlpTrainSgd，与原实现逐位一致
 * （所有既有权重存档与训练脚本的行为不变）；启用增强项 → 走 mlpTrainEnh。 */
function mlpTrain(w, input, target, lr, opts){
  /* 维度校验。mlpTrain 本来不校验：维度不匹配时反向传播里 W[j][k] 会读到
   * undefined，`undefined * d` = NaN，整张网络静默污染——diag-opt-check.js 把
   * 88 维观测喂给 8 维网络时先踩到这个。所以这里拦下来。
   * Node 抛错（训练脚本立即暴露）；浏览器只告警一次并跳过本次更新——
   * 历史上异常从 requestAnimationFrame 冒泡会永久终止整个动画循环
   * （见 rules.js#strikeServe 的自愈处理），所以这里绝不在浏览器抛。 */
  if(input.length !== w[0].W[0].length || target.length !== w[w.length - 1].W.length){
    const msg = '[dqn] mlpTrain 维度不符：input=' + input.length +
      '/首层=' + w[0].W[0].length + '，target=' + target.length +
      '/输出层=' + w[w.length - 1].W.length;
    if(typeof window === 'undefined') throw new Error(msg);
    if(!mlpTrain._dimWarn){ mlpTrain._dimWarn = true; console.error(msg + '（本次更新已跳过）'); }
    return w;
  }
  const cfg = mlpTrainOpts(opts);
  return cfg ? mlpTrainEnh(w, input, target, lr, cfg) : mlpTrainSgd(w, input, target, lr);
}
/* 从 agent 的 opts 对象提取增强训练配置。
 * 调用方应只调一次并复用返回值：配置里的 adamState/t 要跨 learn() 累积，
 * 每次重建会丢掉 Adam 动量。已构建的配置（含 adamState）原样返回；未启用返回 null。 */
function mlpTrainOpts(o){
  if(o && o.adamState) return o;
  if(!o) return null;
  if(o.optimizer === 'adam' || o.gradClip > 0 || (o.lrScale && o.lrScale.length)){
    return { optimizer: o.optimizer, gradClip: o.gradClip || 0, lrScale: o.lrScale,
             beta1: o.beta1, beta2: o.beta2, eps: o.adamEps,
             adamState: [], t: 0 };
  }
  return null;
}
/* 原版纯 SGD：非有限或 |d|≥100 的输出层梯度清零（唯一的历史稳定性机制） */
function mlpTrainSgd(w, input, target, lr){
  const { acts } = mlpForward(w, input);
  const nLayers = w.length;
  const outAct = acts[acts.length - 1];
  // 输出层误差（MSE 对线性输出；防爆炸：非有限或超大梯度清零）
  let delta = outAct.map((q, i) => {
    const d = q - target[i];
    return (isFinite(d) && Math.abs(d) < 100) ? d : 0;
  });
  // 从后往前：先更新当前层权重（用当前层输出误差 delta），再传播误差到下一层
  for(let li = nLayers - 1; li >= 0; li--){
    const { W, b } = w[li];
    const inAct = acts[li];
    // 更新 W,b（delta 是第 li+1 层激活的误差；非有限梯度跳过该输出单元）
    for(let j = 0; j < W.length; j++){
      const d = delta[j];
      if(!isFinite(d)) continue;
      for(let k = 0; k < inAct.length; k++) W[j][k] -= lr * d * inAct[k];
      b[j] -= lr * d;
    }
    // 传播误差到上一层：delta_prev[k] = sum_j W[j][k]*delta[j] * relu'(inAct[k])
    if(li > 0){
      let newDelta = new Array(inAct.length).fill(0);
      for(let j = 0; j < W.length; j++){
        const d = delta[j];
        if(!isFinite(d)) continue;
        for(let k = 0; k < inAct.length; k++) newDelta[k] += W[j][k] * d;
      }
      // 上一隐藏层激活是 ReLU(inAct[k])
      delta = newDelta.map((d, k) => (inAct[k] > 0 ? d : 0));
    }
  }
  return w;
}

/* 增强训练路径：可选 Adam + 分层学习率 + 全网络梯度范数裁剪。
 *
 * 为什么需要它 —— tools/diag-grad.js 对现有 88→128→192→128→952 网络的实测
 * （真实观测 + BC one-hot 目标）：
 *   · 输出层 |d|<100 截断触发率 = 0.000% —— 上面注释里唯一的稳定性机制
 *     在真实训练分布下从未生效过，NaN 防护是未被验证过的，不是有效的。
 *   · 单层梯度范数 30.8 / 21.8 / 23.5 / 2.9（输入层 → 输出层），
 *     lr=0.0004 时 lr×‖g‖ = 0.0123 / 0.0087 / 0.0094 / 0.0012 ——
 *     一个 lr 同时喂 128 维隐层和 952 维输出层，输出层被欠驱动约 10 倍。
 *   · 单元素最大 |g| = 411（128/192/128）到 4357（32/32/952），
 *     而权重本身 RMS 范数只有 0.087 —— 单步更新可比权重自身还大。
 *     这才是 NaN 重置 / 低 learnPerPoint / bcMix 那些护栏在兜的东西。
 *
 * 与 mlpTrainSgd 的差异（只影响本路径）：
 *   1) 梯度先全部累计完成再统一施加，所以上一层误差传播用的是更新前的权重
 *      （sgd 路径因原地更新而用的是更新后权重，量级上只差 lr×g 一项）。
 *   2) gradClip>0 时按"全网络梯度 2-范数"裁剪，裁剪发生在形成 Adam 动量之前，
 *      否则动量会记住已超界的梯度。
 *   3) lrScale 是每层乘子（长度 = 层数），用于让隐层与 952 维输出层各自
 *      拿到匹配的更新量级，而不是共用一个 lr。
 *
 * Adam 状态（o.adamState / o.t）不写入 serialize：权重存档只该含网络，
 * 优化器状态是训练时的运行细节，续训从第 0 步重新累积动量。 */
function mlpTrainEnh(w, input, target, lr, o){
  const { acts } = mlpForward(w, input);
  const nLayers = w.length;
  const useAdam = (o.optimizer === 'adam');
  const beta1 = o.beta1 != null ? o.beta1 : 0.9;
  const beta2 = o.beta2 != null ? o.beta2 : 0.999;
  const epsA = o.eps != null ? o.eps : 1e-8;

  /* 误差链：与 sgd 路径同构（输出层 |d|<100 截断 + 非有限跳过） */
  const outAct = acts[acts.length - 1];
  let delta = outAct.map((q, i) => {
    const d = q - target[i];
    return (isFinite(d) && Math.abs(d) < 100) ? d : 0;
  });

  /* 梯度缓冲（Float64Array，与权重同布局） */
  const gW = [], gb = [];
  for(let li = 0; li < nLayers; li++){
    const W = w[li].W;
    const g = [];
    for(let j = 0; j < W.length; j++) g.push(new Float64Array(W[0].length));
    gW.push(g); gb.push(new Float64Array(W.length));
  }
  for(let li = nLayers - 1; li >= 0; li--){
    const { W } = w[li];
    const inAct = acts[li];
    const G = gW[li], GB = gb[li];
    for(let j = 0; j < W.length; j++){
      const d = delta[j];
      if(!isFinite(d)) continue;
      const gj = G[j];
      for(let k = 0; k < inAct.length; k++) gj[k] += d * inAct[k];
      GB[j] += d;
    }
    if(li > 0){
      const nd = new Array(inAct.length).fill(0);
      for(let j = 0; j < W.length; j++){
        const d = delta[j];
        if(!isFinite(d)) continue;
        for(let k = 0; k < inAct.length; k++) nd[k] += W[j][k] * d;
      }
      delta = nd.map((d, k) => (inAct[k] > 0 ? d : 0));
    }
  }

  /* 全网络梯度 2-范数裁剪（跨所有层的所有权重与偏置） */
  let nrmSq = 0;
  for(let li = 0; li < nLayers; li++){
    for(let j = 0; j < gW[li].length; j++)
      for(let k = 0; k < gW[li][j].length; k++) nrmSq += gW[li][j][k] * gW[li][j][k];
    for(let j = 0; j < gb[li].length; j++) nrmSq += gb[li][j] * gb[li][j];
  }
  const scale = (o.gradClip > 0 && nrmSq > 0)
    ? Math.min(1, o.gradClip / Math.sqrt(nrmSq)) : 1;

  const stp = (o.t = (o.t || 0) + 1);
  const b1c = 1 - Math.pow(beta1, stp), b2c = 1 - Math.pow(beta2, stp);

  for(let li = 0; li < nLayers; li++){
    const { W, b } = w[li];
    /* lrScale[li] 为 null/undefined 时用 1；必须用 != null 判断——
     * 三目真值判断会把 scale=0（冻层）当成 falsy 退回 1，等于静默忽略冻层。 */
    const sc = o.lrScale && o.lrScale[li] != null ? o.lrScale[li] : 1;
    const lrL = lr * sc;
    let A = o.adamState[li];
    if(useAdam && !A){
      A = o.adamState[li] = { mW: [], vW: [], m: new Float64Array(W.length), v: new Float64Array(W.length) };
      for(let j = 0; j < W.length; j++){
        A.mW.push(new Float64Array(W[0].length));
        A.vW.push(new Float64Array(W[0].length));
      }
    }
    for(let j = 0; j < W.length; j++){
      const gj = gW[li][j], bj = gb[li][j] * scale;
      if(useAdam){
        A.m[j] = beta1 * A.m[j] + (1 - beta1) * bj;
        A.v[j] = beta2 * A.v[j] + (1 - beta2) * bj * bj;
        b[j] -= lrL * (A.m[j] / b1c) / (Math.sqrt(A.v[j] / b2c) + epsA);
        for(let k = 0; k < W[j].length; k++){
          const gk = gj[k] * scale;
          A.mW[j][k] = beta1 * A.mW[j][k] + (1 - beta1) * gk;
          A.vW[j][k] = beta2 * A.vW[j][k] + (1 - beta2) * gk * gk;
          W[j][k] -= lrL * (A.mW[j][k] / b1c) / (Math.sqrt(A.vW[j][k] / b2c) + epsA);
        }
      }else{
        b[j] -= lrL * bj;
        for(let k = 0; k < W[j].length; k++) W[j][k] -= lrL * gj[k] * scale;
      }
    }
  }
  return w;
}

/* ---------- 经验回放 ---------- */
function createReplay(cap){
  const buf = [];
  let idx = 0;
  return {
    push(s){ if(buf.length < cap) buf.push(s); else buf[idx % cap] = s; idx++; },
    sample(n, rng){ const out = []; const len = buf.length;
      for(let i = 0; i < n; i++) out.push(buf[(rng() * len) | 0]); return out; },
    size(){ return buf.length; },
  };
}

/* ---------- DQN agent ----------
   opts: { stateSize, nActions, lr, gamma, eps0, epsMin, batch, replayCap, targetEvery } */
function createDQN(opts, rng){
  rng = rng || Math.random;
  /* optimizer/gradClip/lrScale 为增强训练开关（见 mlpTrainEnh）；
   * 默认 'sgd' + 0 + 无分层 → mlpTrainOpts 返回 null，走旧 SGD 路径，
   * 故既有存档（o 里没这些字段）与旧脚本行为完全不变。 */
  const o = Object.assign({ stateSize: 8, nActions: 6, lr: 0.001, gamma: 0.92,
    eps0: 0.9, epsMin: 0.05, batch: 32, replayCap: 20000, targetEvery: 500,
    optimizer: 'sgd', gradClip: 0, lrScale: null }, opts);
  const trainOpt = mlpTrainOpts(o);
  const sizes = [o.stateSize, 32, 32, o.nActions];
  let net = mlpInit(sizes, rng);
  let tnet = mlpInit(sizes, rng);   // 目标网络（初始拷贝）
  const copyNet = () => { tnet = JSON.parse(JSON.stringify(net)); };
  copyNet();
  const replay = createReplay(o.replayCap);
  let steps = 0, eps = o.eps0, training = true;
  // 回合记录（训练脚本回填奖励）
  let episode = [];

  return {
    /* 状态编码：把击球上下文归一化为固定维向量（与训练一致） */
    encode(ctx){
      return [
        ctx.bx / 0.8, ctx.by / 1.3, ctx.bz / 1.5,
        Math.abs(ctx.vz) / 6,
        (ctx.sx * Math.sign(ctx.vz || 1)) / 160,   // 相对上旋（±）
        ctx.sy / 60, ctx.aiX / 0.8, ctx.playerX / 0.8,
      ];
    },
    /* 训练模式选动作（ε-greedy）；返回 {action, state}，并记入 episode */
    act(ctx, explore){
      const state = this.encode(ctx);
      if(explore && rng() < eps){
        const action = (rng() * o.nActions) | 0;
        episode.push({ state, action });
        return { action, state };
      }
      const q = mlpForward(net, state).last;
      let action = 0;
      for(let a = 1; a < q.length; a++) if(q[a] > q[action]) action = a;
      episode.push({ state, action });
      return { action, state };
    },
    /* 推理模式选动作（argmax，无探索）返回 Q 向量 */
    best(ctx){
      return mlpForward(net, this.encode(ctx)).last;
    },
    bestAction(ctx){
      const q = mlpForward(net, this.encode(ctx)).last;
      let a = 0; for(let i = 1; i < q.length; i++) if(q[i] > q[a]) a = i;
      return a;
    },
    getNet(){ return net; },
    setNet(w){ net = w; copyNet(); },
    setTraining(t){ training = t; },
    isTraining(){ return training; },
    /* 给最近一次动作加逐板 shaping（成功回球/失误/得分），endEpisode 时累积终局奖励 */
    creditReward(d){ const s = episode[episode.length - 1]; if(s) s.reward = (s.reward || 0) + d; },
    /* 一局结束：winner='ai'/'player'（本 agent 侧由训练脚本指定）；累积终局奖励并提交回放、学习 */
    endEpisode(ownSide, winner){
      const r = winner === ownSide ? 1 : -1;
      for(const s of episode){ s.reward = (s.reward || 0) + r + 0.02; s.done = true; s.next = s.state; }
      this.commitEpisode();
      this.learnN(o.learnPerEp || 3);
      episode = [];
    },
    /* 多次从回放采样训练 batch */
    learnN(n){ for(let i = 0; i < n; i++) this.learn(); },
    /* 从回放采样训练 batch */
    learn(){
      if(replay.size() < o.batch) return;
      const batch = replay.sample(o.batch, rng);
      for(const s of batch){
        const qNext = mlpForward(tnet, s.next).last;
        let maxQ = -1e9;
        for(const v of qNext) if(v > maxQ) maxQ = v;
        const y = s.reward + (s.done ? 0 : o.gamma * maxQ);
        const q = mlpForward(net, s.state).last;
        const target = q.slice();
        target[s.action] = y;
        mlpTrain(net, s.state, target, o.lr, trainOpt);
      }
      steps++;
      eps = Math.max(o.epsMin, eps - (o.eps0 - o.epsMin) / 2000);
      if(steps % o.targetEvery === 0) copyNet();
    },
    /* 把当前局经验加入回放 */
    commitEpisode(){ for(const s of episode) replay.push(s); },
    setEps(e){ eps = e; },
    getEps(){ return eps; },
    serialize(){ return JSON.stringify({ w: net, o }); },
  };
}
function dqnLoad(json){
  const d = JSON.parse(json);
  const a = createDQN(d.o);
  a.setNet(d.w);
  a.setEps(0);
  return a;
}

/* ---- Node 导出 ---- */
if(typeof module !== 'undefined' && module.exports){
  module.exports = { mlpInit, mlpForward, mlpTrain, mlpTrainSgd, mlpTrainEnh, mlpTrainOpts,
                     createDQN, dqnLoad };
}
