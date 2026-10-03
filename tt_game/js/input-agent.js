/* =====================================================================
 *  input-agent.js — "输入级"DQN 智能体（浏览器游戏 与 Node 训练器共用）
 *  · 与 simmatch 的"决策级"DQN（选打法模式）不同：
 *    本智能体控制的是**原始鼠标/键盘输入**——每帧输出
 *      鼠标X(targetX) × 鼠标Y(mouseNy) × Ctrl(搓球)
 *    由 input-sim.js 的玩家引擎（实机同款管线）把输入变成击球。
 *  · 观测：88 维归一化（球/拍/鼠标/来球/动力学/台面相位特征）；动作：17×7×2=238 离散。
 *  · 复用 dqn.js 的 MLP（mlpInit/Forward/Train）+ 经验回放；浏览器仅需推理。
 *  · 训练：tools/train-input.js；产出 data/input-ai.json → js/input-weights.js
 * ===================================================================== */
'use strict';
const INPUT_AGENT = (() => {
  /* ---- 网络隐藏层宽度：全仓唯一权威。tt-player.js 的实机装配经 api.HSIZES 引用这里，
   *     训练器经 --hsizes 传同一组值。任何一处漂移都会让形状断言失效 → 出球 NaN。 ---- */
  const DEFAULT_HSIZES = [192, 256, 192];   // 2026-10-02 扩容（旧 128/192/128 存档与此不兼容）

  /* ---- 动作空间：鼠标X(34) × 鼠标Y(14) × Ctrl(2) × 发球上/下旋(2) = 1904 ----
   * 回球维度（X/Y/Ctrl）决定拍面运动与触球方式；发球维度（侧旋/力度）只在**发球那一刻**
   * 被 serveFromPlayer / ttHit 消费，回球时被忽略——所以扩维不会污染已学到的回球行为，
   * 网络在回球时对 8568 个动作的 Q 值仍然按 (x,y,ctrl) 三元组成组相等，
   * argmax 的 tie-break 会在组内随机，等价于原来的 952 动作。
   * 2026-10-02 之前发球是完全写死的常量（input-sim serveFromPlayer 力度恒 0.5、
   * 侧旋恒 0），DQN 从没学过控制自己的发球——每分都是同一个球。 */
  const IN_MX = (() => { const a = []; for(let i = 0; i < 34; i++) a.push(-0.9 + i * (1.8 / 33)); return a; })();
  const IN_MY = (() => { const a = []; for(let i = 0; i < 14; i++) a.push(i / 13); return a; })();
  /* ---- 发球维度：上旋 / 下旋（2 档），动作数 34×14×2×2 = 1904 ----
   *
   * 为什么是「上下旋」而不是「侧旋」：2026-10-03 实测发现侧旋维度学不出分化，
   * 三种侧旋的平均发球奖励极差只有 0.018。根因在 policy.js#aiDecision——对手接发球的
   * 决策只读上旋（`ctx.sx * sign(vz)` → rtop → isBack），**完全不看侧旋 sy**。
   * 而当时全游戏发球恒为上旋（rules.js 硬编码 top:true），下旋是死代码，
   * 于是三种侧旋对对手完全等价 → 没有可学信号 → Q 值被随机初始化的那一个锁死。
   *
   * 恢复下旋后（rules.js 读 serveCfg.top / aiServePlan 的 topProb 0.7），
   * policy.js:115 的 `receive.pushProb`(0.62 搓球率) 首次真正生效——对手接到下旋球
   * 只能勉强搓起，回球质量明显低于接上旋球。这条路径此前一直是死的。
   * 上下旋才是这个游戏发球唯一有归因信号的对局维度。
   *
   * 力度固定 0.6（与实机 serveCfg.power 默认一致），不占动作维度：
   * 实测输出层耗时随动作数线性膨胀（952→8568 是 6.2×，→2856 是 1.4×），
   * 力度 3 档要多付 3 倍算力换 2 档区分，不值。 */
  const SERVE_TOP = [true, false];    // [上旋, 下旋]
  const SERVE_POWER_MID = 0.6;
  const SERVE_TOP_N = SERVE_TOP.length;
  const ACT_N = IN_MX.length * IN_MY.length * 2 * SERVE_TOP_N;
  const OBS_N = 88;
  const F = (v, lo, hi) => { const f = isFinite(v) ? v : 0; return Math.max(lo, Math.min(hi, f)); };

  /* 88 维观测编码（全部来自 input-sim 实际提供的 15 字段；含动力学/台面相位/拍-球相对特征） */
  function encodeObs(o){
    const g = o || {};
    const x = F(g.x, -2, 2) || 0, y = F(g.y, 0, 3), z = F(g.z, -4.5, 4.5) || 0;
    const px = F(g.px, -2, 2) || 0, pz = (g.pz != null ? F(g.pz, 0, 1.5) : 1.32);
    const tx = F(g.tx, -1, 1) || 0, my = (g.my != null ? F(g.my, 0, 1) : 0.5);
    const vx = F(g.vx, -6, 6) || 0, vy = F(g.vy, -6, 6) || 0, vz = F(g.vz, -8, 8) || 0;
    const sx = F(g.sx, -200, 200) || 0, sy = F(g.sy, -200, 200) || 0;
    const svx = F(g.svx, -9, 9) || 0, svz = F(g.svz, -9, 9) || 0;
    const bounced = g.bounced ? 1 : 0;
    const signVz = vz >= 0 ? 1 : -1;
    const sp = Math.sqrt(vx * vx + vy * vy + vz * vz);
    /* 来球到拍所在 z 平面的碰撞时间 τ（秒，截断 0..1.5；仅来球时非零） */
    const tauS = (vz < -0.05 && pz - z > 0) ? Math.min(1.5, Math.abs((pz - z) / vz)) : 0;
    const tau01 = tauS / 1.5;
    return [
      x / 1.2, (y - 0.46) / 0.8, z / 2.2,
      vx / 4, vy / 5, vz / 5.5,
      sx * signVz / 170, sy / 130,
      px / 1.2, (pz - 1.32) / 0.5,
      tx / 1.2, my - 0.5,
      svx / 7, svz / 7,
      bounced, vz > 0.2 ? 1 : 0,
      (x - px) / 1.2, (z - pz) / 0.6, (y - 0.5) / 0.8,
      (tx - x) / 1.2,
      /* 球-拍**纵深**接近度：z 与 pz 同轴，1 = 球正落向拍面，0 = 差 1.2m 以上。
       * 原来写的是 abs(z - px)——px 是球拍的**横向**位置，和 z 不同轴，量纲不对。
       * 后果实测：网络从这一维拿不到可靠的纵深接近信号，深度追踪（my 旋钮）
       * 退化成常数 0.462，拍面永远停在浅台区。 */
      Math.max(0, 1 - Math.abs(z - pz) / 1.2),
      tau01,
      (x + vx * tauS) / 1.2,
      (y + vy * tauS - 0.46) / 0.8,
      (z + vz * tauS) / 2.2,
      (vz < 0 ? -vz : vz) / 5.5,
      (vx - svx) / 7, (vz - svz) / 7,
      sp / 7,
      (Math.abs(vz) > 0.05 ? F(vx / vz / 3, -1, 1) : 0),
      (Math.abs(vz) > 0.05 ? F(vy / vz / 3, -1, 1) : 0),
      vx / (sp + 1e-6), vy / (sp + 1e-6), vz / (sp + 1e-6),
      Math.abs(x) <= 1.3 ? 1 : 0, Math.abs(z) <= 1.2 ? 1 : 0,
      z > 0 ? 1 : 0,
      y > 0.8 ? 1 : 0, y < 0.5 ? 1 : 0,
      1 / (1 + Math.abs(y - 0.46)),
      Math.abs(z) < 0.25 ? 1 : 0, z >= 0 ? 1 : -1,
      1 - Math.abs(z) / 2.2,
      (pz - z) / 1.2,
      sx * vz / 600, sy * signVz / 600,
      (sx / 170) * (sx / 170), (sy / 130) * (sy / 130),
      (bounced && vz > 0) ? 1 : 0, (bounced && vz < 0) ? 1 : 0,
      (!bounced && y < 0.55) ? 1 : 0,
      (x + vx * 0.2) / 1.2,
      (y + vy * 0.2 - 0.46) / 0.8,
      (z + vz * 0.2) / 2.2,
      (vz >= 0 ? z : -z) / 2.2,
      Math.abs(x - px) / 2.4, Math.abs(z - pz) / 1.2,
      F(y - 0.46, 0, 1),
      (vx / (sp + 1e-6)) * signVz,
      (vy - 0.5) / 5,
      svx / (1 + Math.abs(svx)), svz / (1 + Math.abs(svz)),
      my,
      (vx - svx) * (x - px) > 0 ? 1 : 0,
      (vz - svz) * (z - pz) > 0 ? 1 : 0,
      (Math.abs(z) < 0.3 && y < 1.0) ? 1 : 0,
      y > 1.6 ? 1 : 0,
      Math.abs(x) / 1.2, Math.abs(z) / 2.2,
      1 / (tauS + 0.05) / 20,
      (bounced && tauS < 0.3) ? 1 : 0,
      x > 0 ? 1 : 0,
      1 - Math.abs(x) / 1.2,
      (pz - z > 0 && vz < 0) ? 1 : 0,
      Math.abs(px) > 1 ? 1 : 0,
      z < -1.6 ? 1 : 0,
      ((x - px) * (x - px) + (z - pz) * (z - pz)) / 6,
      Math.abs(y - 0.5) / 0.8,
      (pz + 2.2) / 3.4,
      tx * my,
      (vx + vy + vz) / 14,
      (bounced && z > 0) ? 1 : 0,
      (y < 0.55 && vz > 0) ? 1 : 0,
      0, 0, 0, 0, 0,
    ];
  }
  /* 动作解码 → 原始输入 { tx, my, ctrl, serveTop, servePower }
   * 编码：a = ((mxI*IN_MY.length + myI)*2 + ctrl) * SERVE_TOP_N + topI
   * 双射覆盖全部 1904 组合。前三维是回球语义，第四维只在发球时被消费。 */
  function decodeAction(a){
    let t = a;
    const topI = t % SERVE_TOP_N; t = (t / SERVE_TOP_N) | 0;
    const ctrl = t & 1; t >>= 1;
    const myI = t % IN_MY.length;
    const mxI = (t / IN_MY.length) | 0;
    return { tx: IN_MX[mxI], my: IN_MY[myI], ctrl: !!ctrl,
             serveTop: SERVE_TOP[topI], servePower: SERVE_POWER_MID };
  }
  /* 离某个"连续意图"最近的动作索引（行为克隆/离散化用） */
  function nearestAction(tx, my, ctrl){
    let best = 0, bd = 1e9;
    for(let a = 0; a < ACT_N; a++){
      const d = decodeAction(a);
      const dd = Math.abs(d.tx - tx) + 0.6 * Math.abs(d.my - my) + (d.ctrl === ctrl ? 0 : 0.5);
      if(dd < bd){ bd = dd; best = a; }
    }
    return best;
  }

  /* ---- 简单基线"追球型"输入（对照/冒烟用）：鼠标永远追球 + 中线深度 ---- */
  function naiveBrain(){
    return { act(obs){
      const x = obs.x || 0;
      return { tx: Math.max(-0.9, Math.min(0.9, x * 1.0)), my: 0.5, ctrl: false };
    } };
  }

  /* ---- DQN 输入智能体（Node 训练用；浏览器只用 encodeObs/decode/推理）----
   * opts：{ lr, gamma, eps0, epsMin, batch, replayCap, targetEvery, learnPerPoint } */
  function createInputAgent(opts, rng){
    rng = rng || Math.random;
    const DQN = (typeof module !== 'undefined' && module.exports)
      ? require('./dqn.js')
      : { mlpInit: mlpInit, mlpForward: mlpForward, mlpTrain: mlpTrain,
          mlpTrainOpts: mlpTrainOpts };
    const makeReplay = (cap) => { const buf = []; let idx = 0;
      return { push(s){ if(buf.length < cap) buf.push(s); else buf[idx % cap] = s; idx++; },
               sample(n){ const out = []; const len = buf.length; for(let i = 0; i < n; i++) out.push(buf[(rng() * len) | 0]); return out; },
               size(){ return buf.length; } }; };
    /* optimizer/gradClip/lrScale：增强训练开关（dqn.js#mlpTrainEnh）。
     * 默认 'sgd' + gradClip 0 + 无分层 → mlpTrainOpts 返回 null，
     * mlpTrain 走旧 SGD 路径，故 data/input-ai-extreme.json 与既有训练脚本
     * 的行为逐位不变；续训从旧存档加载时 o 里没这些字段，同样走旧路径。 */
    const o = Object.assign({ stateSize: OBS_N, nActions: ACT_N, lr: 0.0008, gamma: 0.9,
      eps0: 0.9, epsMin: 0.05, batch: 64, replayCap: 60000, targetEvery: 800, learnPerPoint: 3,
      hSizes: DEFAULT_HSIZES,     // 见下方常量：唯一权威，tt-player.js 经 HSIZES 引用同一份
      optimizer: 'sgd', gradClip: 0, lrScale: null }, opts);
    /* 构建一次并复用：Adam 动量 / 步计数要跨 learn() 累积。
     * 不挂在 o 上——serialize() 会把 o 写进存档，Float64Array 动量不该进权重文件。 */
    let trainOpt = DQN.mlpTrainOpts ? DQN.mlpTrainOpts(o) : null;
    const sizes = [o.stateSize].concat(o.hSizes).concat([o.nActions]);
    let net = DQN.mlpInit(sizes, rng);
    let tnet = DQN.mlpInit(sizes, rng);
    const copyNet = () => { tnet = JSON.parse(JSON.stringify(net)); };
    copyNet();
    const replay = makeReplay(o.replayCap);
    let steps = 0, eps = o.eps0, training = true, episode = [];
    let bcPairs = null, bcBoost = 1.5;

    return {
      encode: encodeObs, decode: decodeAction,
      nActions: o.nActions,
      /* mark：可选帧标记（如 'serve'）。配合 creditMarked 给**指定帧**打 reward，
         而不是 credit() 那样只加到 episode 最后一帧。
         为什么需要：一分的胜负无法归因到发球那一帧——endPoint 只给最后一帧 ±3，
         中间所有帧（包括发球决策）只有 0.0008 的常数激励。发球 credit 走 credit()
         就永远加在最后一帧上，发球决策拿不到任何梯度，Q 值被随机初始化的那一个动作
         自我强化锁死（实测左旋 Q=1.41 vs 其他 0.01，差 140 倍）。 */
      act(obs, explore, mark){
        const state = encodeObs(obs);
        let action;
        if(training && explore && rng() < eps) action = (rng() * o.nActions) | 0;
        else action = this.bestAction(obs);
        episode.push({ state, action, mark: mark || null });
        return { action, cmd: decodeAction(action) };
      },
      bestAction(obs){
        const q = DQN.mlpForward(net, encodeObs(obs)).last;
        let bq = -1e9; const ties = [];
        for(let i = 0; i < q.length; i++){ if(q[i] > bq + 1e-9){ bq = q[i]; ties.length = 0; } if(q[i] >= bq - 1e-9) ties.push(i); }
        return ties[(rng() * ties.length) | 0];
      },
      credit(d){ const s = episode[episode.length - 1]; if(s) s.reward = (s.reward || 0) + d; },
      /* 给 episode 里最后一个带 mark 标记的帧加 reward（找不到则退化为 credit）。
         用于把「发球效果」这类局部信号精确归因到发球决策那一帧。 */
      creditMarked(mark, d){
        for(let i = episode.length - 1; i >= 0; i--){
          if(episode[i].mark === mark){ episode[i].reward = (episode[i].reward || 0) + d; return true; }
        }
        const s = episode[episode.length - 1]; if(s) s.reward = (s.reward || 0) + d;
        return false;
      },
      endPoint(ownSide, winner){
        const R = o.endReward != null ? o.endReward : 3;   // 终局奖励尺度（默认 ±3；小尺度更稳）
        const r = winner === ownSide ? R : -R;
        for(let i = 0; i < episode.length; i++){
          const s = episode[i];
          const last = (i === episode.length - 1);
          const pot = o.shape ? o.shape(s.state) : 0;   // 势差塑形：站在球线上有微小正激励
          s.reward = (s.reward || 0) + (last ? r : 0) + 0.0008 + pot;
          s.done = last;
          s.next = last ? s.state : episode[i + 1].state;   // 链式 next 状态（TD 正确衔接）
        }
        for(const s of episode) replay.push(s);
        episode = [];
        for(let i = 0; i < o.learnPerPoint; i++) this.learn();
      },
      learn(){
        if(replay.size() < o.batch) return;
        const batch = replay.sample(o.batch, rng);
        /* 在线 BC：每个 batch 混入 bcMix 比例的监督对（跟踪技能持续保鲜，防止 RL 洗掉）
         * bcMix 默认 20%（max-4 保底），可经 opts.bcMix 调大（回放被自对弈数据稀释时升到 30%+） */
        let bcIdx = 0;
        const bcMix = (bcPairs && bcPairs.length) ? Math.max(4, ((o.bcMix != null ? o.bcMix : 0.2) * o.batch) | 0) : 0;
        for(const s of batch){
          if(bcMix && (rng() * o.batch) < bcMix){
            const p = bcPairs[(rng() * bcPairs.length) | 0];
            const tgt = new Array(o.nActions).fill(0);
            tgt[p[1]] = bcBoost != null ? bcBoost : 1.5;
            DQN.mlpTrain(net, p[0], tgt, o.lr * 0.7, trainOpt);
            bcIdx++;
            continue;
          }
          if(!isFinite(s.reward) || s.state.some(v => !isFinite(v)) || s.next.some(v => !isFinite(v))){
            continue;
          }
          const qNext = DQN.mlpForward(tnet, s.next).last;
          const qOnlineNext = DQN.mlpForward(net, s.next).last;   // double-DQN：动作取在线网
          let aMax = 0; for(let i = 1; i < qOnlineNext.length; i++) if(qOnlineNext[i] > qOnlineNext[aMax]) aMax = i;
          const y = s.reward + (s.done ? 0 : o.gamma * qNext[aMax]);
          if(!isFinite(y)){ continue; }
          const q = DQN.mlpForward(net, s.state).last;
          const tgt = q.slice(); tgt[s.action] = y;
          DQN.mlpTrain(net, s.state, tgt, o.lr, trainOpt);
        }
        const netNonFinite = (w) => { for(const l of w){ for(const r of l.W) for(const v of r) if(!isFinite(v)) return true; for(const v of l.b) if(!isFinite(v)) return true; } return false; };
        if(netNonFinite(net)){
          net = DQN.mlpInit(sizes, rng);
          this.setNet(net);
          console.warn('[网络 NaN 重置] learn#' + steps);
        }
        steps++;
        eps = Math.max(o.epsMin, eps - (o.eps0 - o.epsMin) / (o.epsDenom || 3000));
        if(steps % o.targetEvery === 0) copyNet();
      },
      setTraining(t){ training = t; },
      isTraining(){ return training; },
      setBC(pairs, boost){ bcPairs = pairs; if(boost != null) bcBoost = boost; },
      /* 在线 BC 混入比例：续训时存档里的 o.bcMix（0.35）会把好策略冲回"追球"，需要单独压低 */
      setBcMix(m){ o.bcMix = m; },
      getBcMix(){ return o.bcMix; },
      getEps(){ return eps; },
      setEps(e){ eps = e; },
      getNet(){ return net; },
      /* 形状断言：把网络权重塞进来时必须逐层核对，否则错误会一路静默传播到动作选择——
       * mlpForward 的 reduce 遇到维度不匹配只会产出 NaN（既不抛错也不警告），
       * bestAction 里 `NaN > -1e9` 恒 false → ties 塌成 [0] → 恒返回动作 0，
       * AI 表面上"在动"，实际每分都发同一个固定动作。
       * 这正是 11:0 那次失效的形态，必须在这里硬拦。 */
      setNet(w){
        const want = [o.stateSize].concat(o.hSizes).concat([o.nActions]);
        if(w){
          const got = w.map(l => (Array.isArray(l) ? l : (l && l.W) || []).length);
          const gotIn = w.map(l => { const W = Array.isArray(l) ? l : (l && l.W) || []; return Array.isArray(W[0]) ? W[0].length : 0; });
          /* want 是 [in, h1, h2, h3, out]，共 want.length 个数、want.length-1 层权重。
           * 每层权重行数应等于 want[i+1]，首层列数应等于 want[0]。 */
          const ok = got.length === want.length - 1 &&
                     got.every((v, i) => v === want[i + 1]) &&
                     gotIn[0] === want[0];
          if(!ok){
            const shapeOf = (a, b) => a.map((v, i) => v + '×' + b[i]).join(' → ');
            throw new Error('网络形状不匹配：期望 ' + want.length + ' 层 ' +
                            shapeOf(want.slice(1), want.slice(0, -1)) +
                            '，实际 ' + got.length + ' 层 ' +
                            shapeOf(got, gotIn) +
                            '。当前 hSizes=[' + o.hSizes.join(',') + '] —— 换网络后旧权重不可续训');
          }
        }
        net = w; copyNet();
      },
      setLr(l){ o.lr = l; },
      /* 每回合触发的梯度更新次数：续训必须调低——起点是好策略，
       * 每回合 6 次 × 小回放缓冲会把 Q 值反复锤爆（实测 60 局 vs默认 71%→40%） */
      setLearnPerPoint(n){ o.learnPerPoint = n; },
      getReplaySize(){ return replay.size(); },
      /* 模仿单步（行为克隆暖启动）：硬目标监督——所选动作 Q 抬到 boost，
       * 其余动作压到 0（一次性传播，不会被共享隐层噪声抬高其他动作） */
      imitate(state, action, boost){
        const n = o.nActions;
        const tgt = new Array(n).fill(0);
        tgt[action] = boost != null ? boost : 2.0;
        DQN.mlpTrain(net, state, tgt, o.lr * 0.9, trainOpt);
      },
      /* 运行时切换优化器配置。
       * 续训必须走这个：--from 载入的存档 o 里没有 optimizer 字段，
       * 只能加载完再打补丁。重建配置会让 Adam 动量从零开始，
       * 这符合"换了优化器就该重新累积动量"的语义。 */
      setOptimizer(patch){
        Object.assign(o, patch);
        trainOpt = DQN.mlpTrainOpts ? DQN.mlpTrainOpts(o) : null;
      },
      /* 当前训练路径：'sgd'（旧路径）/ 'adam' / 'sgd+clip' / 'sgd+layerlr'。
       * 冒烟脚本用这个断言"默认路径未被改动"。 */
      getTrainMode(){
        const tag = [];
        if(o.optimizer === 'adam') tag.push('adam');
        else tag.push('sgd');
        if(o.gradClip > 0) tag.push('clip' + o.gradClip);
        if(o.lrScale && o.lrScale.length) tag.push('layerlr');
        return tag.join('+');
      },
      serialize(){ return JSON.stringify({ w: net, o }); },
    };
  }
  function loadInputAgent(json){
    const d = JSON.parse(json);
    const a = createInputAgent(d.o);
    a.setNet(d.w);
    a.setEps(0);
    return a;
  }

  /* HSIZES 导出：tt-player.js 的实机装配必须与这里同源（唯一的形状权威）。
     之前它各写一份 [192,256,192]，漏改一处就会静默 NaN。 */
  const api = { IN_MX, IN_MY, ACT_N, OBS_N, HSIZES: DEFAULT_HSIZES, encodeObs, decodeAction,
                nearestAction, naiveBrain, createInputAgent, loadInputAgent };
  if(typeof module !== 'undefined' && module.exports) module.exports = api;
  return api;
})();