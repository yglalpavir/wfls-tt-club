/* =====================================================================
 *  input-agent.js — "输入级"DQN 智能体（浏览器游戏 与 Node 训练器共用）
 *  · 与 simmatch 的"决策级"DQN（选打法模式）不同：
 *    本智能体控制的是**原始鼠标/键盘输入**——每帧输出
 *      鼠标X(targetX) × 鼠标Y(mouseNy) × Ctrl(搓球)
 *    由 input-sim.js 的玩家引擎（实机同款管线）把输入变成击球。
 *  · 观测：88 维归一化（球/拍/鼠标/来球/动力学/台面相位特征）；动作：34×14×2×2=1904 离散。
 *  · 复用 dqn.js 的 MLP（mlpInit/Forward/Train）+ 经验回放；浏览器仅需推理。
 *  · 训练：tools/train-input3.js（唯一训练器）；产出经 tools/bake-input.js
 *    烘焙进 js/input-weights.js，实机 tt-player.js 懒加载该文件。
 *    （v1 train-input.js / v2 train-input2.js 已删：它们建的是 238/952 动作的
 *      旧网络，与当前 1904 动作解码器不兼容，跑出来的权重实机加载不了。）
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
    /* 来球到拍所在 z 平面的碰撞时间 τ（秒，截断 0..1.5；仅来球时非零）。
     * ★ 2026-10-14（R5）：原来写的是 `vz < -0.05 && pz - z > 0`——球**正在离开**
     *   拍面时才算 τ。但玩家侧回球全程 vz > 0（input-sim.playerReceive 的
     *   playerContact 门控 `v.z > -0.3`，实机 tt-player 同款），也就是说
     *   「需要拦球」的每一帧 τ 恒为 0，#21~#24 四个预测拦截特征退化成当前值，
     *   网络拿不到任何前瞻量。实测（球 x=0.8, pz=1.32, z=0.5）：
     *     vz=+3.2 → tau01=0.000   vz=-1.2 → tau01=0.456
     *   正确判据是「球正朝拍面移动」：(pz-z)*vz > 0，与哪一侧无关。
     *   ⚠ 这改变了 4 维输入的语义，旧权重在这 4 维上是脏的——续训必须
     *   走 BC 预训练起点，不能直接 warm-start 线上权重。 */
    const closing = (pz - z) * vz > 0 && Math.abs(vz) > 0.05;
    const tauS = closing ? Math.min(1.5, Math.abs((pz - z) / vz)) : 0;
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
      closing ? 1 : 0,
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

  /* ---- 横向拦截先验（R5，2026-10-14） --------------------------------
   * 问题（60h 训练 + 5 轮续训仍未解决）：网络学会的横向决策塌在中心。
   *   `_diag_argmax.js` 实测线上权重：球在 x∈[-1.2,1.2] 全程扫一遍，
   *   argmax 解出的 tx 只有 **4 个**不同取值；|x|≤0.6 时 tx 恒在 ±0.14m 内，
   *   而接触窗口只有 PAD_HW 0.10 + BALL_R 0.02 + fitH 0.17~0.22 ≈ **±0.29~0.34m**。
   *   → 球被地狱 AI 放到 |x|≈0.8~1.2 时拍面**物理上够不到**，
   *     实机 95~99% 的败局判 noreach。这不是速度问题：padControl 的
   *     `pad.x += (tx-pad.x)*dt*MOUSE_PACE` 在 60Hz 下每帧收 30% 残差，
   *     τ=1/18s，扫过整个台面只要 0.15s —— 是**目标错了**。
   * 为什么不给网络学：`--brain chase` 脚本脑实机 vs 地狱 **40.1%**（基线 11.7%），
   *   一行解析式就值 +28pp；但行为克隆教不会它 —— BC 池实测 argmax 命中率
   *   只有 3~6%（1904 维输出上 MSE 表达不了「排名」），warm-start 12 epoch 后
   *   实机直接掉到 **0.0%**。所以横向改由解析式负责，网络保留其余三维。
   * 做法：只在**来球方向**（closing）时把 argmax 解出的 mxI 换成拦截桶；
   *   my / ctrl / 上旋 三维原样保留 —— 深度与手法仍然由 TD 学出来的网络决定。
   *   非来球时（球正飞离、或发球待抛 vz≈0）不干预，拍面按网络原意归位。
   * 实机收益（tools/live-match.js --brain prior，30 局 vs 地狱）：
   *   **8.7% → 32.1%**（+23.4pp），拍面触球 246/269。
   * 开关：o.lateralPrior !== false，setLateralPrior(false) 可整条关掉回退到纯 argmax。 */
  function lateralBinOf(obs){
    const z = obs.z || 0, vx = obs.vx || 0, vz = obs.vz || 0;
    const pz = (obs.pz != null) ? obs.pz : 0;
    /* 与 encodeObs 里 tauS 同一个 closing 判据：球正在朝拍面平面来 */
    if(!((pz - z) * vz > 0 && Math.abs(vz) > 0.05)) return -1;
    const tau = Math.min(1.5, Math.abs((pz - z) / vz));
    let tx = (obs.x || 0) + vx * tau;
    if(tx > 0.9) tx = 0.9; else if(tx < -0.9) tx = -0.9;
    let b = 0, bd = Infinity;
    for(let i = 0; i < IN_MX.length; i++){
      const d = Math.abs(IN_MX[i] - tx);
      if(d < bd){ bd = d; b = i; }
    }
    return b;
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
        if(training && explore && rng() < eps){
          /* ★ 探索只在**网络真正能决定**的维度上随机（my / ctrl / 上旋 = 14×2×2 = 56 种），
             mxI 一律沿用 bestAction 的结果（那里已经套了横向拦截先验）。
             为什么：实机时间 mxI 永远被 lateralBinOf 覆盖，网络自己的横向输出从不生效
             （实测：--no-prior 真生效后 8 局实机 0.0 %、相持 1.8 板、noreach 99.5 %）。
             旧实现是 (rng()*o.nActions)|0 —— 1904 维均匀随机，绝大多数探索步把球拍甩到
             随机横位，等于把策略推进一个实机不会出现的状态分布，梯度也平摊到 34 个
             永远不生效的 mxI 分箱上。o.exploreLateral === 'all' 可恢复旧行为做 A/B。 */
          if(o.exploreLateral === 'all') action = (rng() * o.nActions) | 0;
          else {
            const a0 = this.bestAction(obs);          // 先验已把 mxI 摆到拦截点
            const mx = (a0 / (IN_MY.length * 4)) | 0;
            const my = (rng() * IN_MY.length) | 0;
            const ct = (rng() * 2) | 0;
            const sp = (rng() * SERVE_TOP_N) | 0;
            action = ((mx * IN_MY.length + my) * 2 + ct) * 2 + sp;
          }
        }
        else action = this.bestAction(obs);
        episode.push({ state, action, mark: mark || null });
        return { action, cmd: decodeAction(action) };
      },
      bestAction(obs){
        const q = DQN.mlpForward(net, encodeObs(obs)).last;
        let bq = -1e9; const ties = [];
        for(let i = 0; i < q.length; i++){ if(q[i] > bq + 1e-9){ bq = q[i]; ties.length = 0; } if(q[i] >= bq - 1e-9) ties.push(i); }
        const a = ties[(rng() * ties.length) | 0];
        /* 横向拦截先验（见 lateralBinOf 上方注释）。只换 mxI，
         * my/ctrl/上旋仍来自网络 argmax。返回 -1 = 不该干预（球在飞离或待发球）。 */
        if(o.lateralPrior === false) return a;
        const lb = lateralBinOf(obs);
        if(lb < 0) return a;
        if((a >> 2) / 14 === lb) return a;          // 网络本来就追对了，不动
        return ((lb * 14 + ((a >> 2) % 14)) * 2 + ((a >> 1) & 1)) * 2 + (a & 1);
      },
      /* 整条关掉横向先验，回退到纯 argmax（回滚开关，也给 A/B 诊断用）。 */
      setLateralPrior(on){ o.lateralPrior = !!on; return o.lateralPrior; },
      getLateralPrior(){ return o.lateralPrior !== false; },
      /* 探索维度的回滚开关：'prior'（默认）= 横向沿用先验、只随机 my/ctrl/上旋；
         'all' = 旧的 1904 维均匀随机（球拍会被甩到随机横位，仅用于 A/B）。 */
      setExploreLateral(mode){ o.exploreLateral = (mode === 'all' ? 'all' : 'prior'); return o.exploreLateral; },
      getExploreLateral(){ return o.exploreLateral === 'all' ? 'all' : 'prior'; },
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
         * bcMix 默认 20%（max-4 保底），可经 opts.bcMix 调大（回放被自对弈数据稀释时升到 30%+）
         * ★ 2026-10-14（R5）：原来是 `tgt.fill(0); tgt[bcAction] = bcBoost`，即把
         *   另外 1903 个动作的 Q 一起往 0 拉。而 TD 学出来的好动作 Q = +3·γᵏ ≫ 1.6，
         *   等于每一记 BC 都在往反方向踩 1903 个动作。bcmix 0.06 × batch 64 = 4/64
         *   ≈ 6.25%，× learnPerPoint × 9000 点 ≈ 7.2 万记破坏性更新 / 12h。
         *   改成「只抬不压」：以当前 Q 为基线，只把示范动作抬到 max(q, bcBoost)。
         *   配合 bcTarget=intercept（见 train-input3 naiveCmd）才是真正的保鲜。 */
        let bcIdx = 0;
        /* ★ R5：`--bcmix 0` 以前**关不掉**在线 BC —— `Math.max(4, 0|0)` 恒为 4，
         * 每个 batch 仍有 6.25% 的 BC 样本在把 my 往 0.5、ctrl 往 false 拽。
         * 横向拦截现在由 bestAction 的解析先验负责（见 lateralBinOf），
         * BC 再重复一遍只会跟 TD 抢深度/手法这两维，必须能真正关掉。
         * o.bcMix 缺省仍是 0.2，行为与旧版一致。 */
        const bcMix = (bcPairs && bcPairs.length && (o.bcMix != null ? o.bcMix : 0.2) > 0)
                      ? Math.max(4, ((o.bcMix != null ? o.bcMix : 0.2) * o.batch) | 0) : 0;
        for(const s of batch){
          if(bcMix && (rng() * o.batch) < bcMix){
            const p = bcPairs[(rng() * bcPairs.length) | 0];
            if(!p[0] || !p[0].every(v => isFinite(v))) continue;
            const q = DQN.mlpForward(net, p[0]).last;
            const tgt = q.slice();
            tgt[p[1]] = Math.max(q[p[1]], bcBoost != null ? bcBoost : 1.5);
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
      /* 0 = 在线 BC 真正关闭（见 learn() 里 bcMix 的注释）。 */
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
      /* 模仿单步（行为克隆暖启动）：只把示范动作抬到 boost。
       * ★ 2026-10-14（R5）：原来写的是硬目标 —— `tgt.fill(0); tgt[action]=boost`，
       *   注释说是「一次性传播，不会被共享隐层噪声抬高其他动作」。实际后果相反：
       *   1904 个输出里，**每一次** BC 调用都会把另外 1903 个的 Q 往 0 拉。
       *   池子里有 N 个状态时，示范动作那一行只被自己那 1/N 的调用往上推，
       *   却被另外 (N-1)/N 往下踩 —— N 越大越被压死。
       *   实测（_bc_pretrain.js，657 个状态 / default 对手，Adam+clip2+layerlr，
       *   lr=0.01、20 epoch 共 1.3 万次 imitate）：
       *     硬目标：q[示范] -0.0658 → -0.0001（只走了 4%），argmax 命中率 6.1%，
       *             20/40 个 epoch 命中率**完全不变**，等于没训练。
       *     单状态对照（200 次 imitate，同一套优化器）：q 0.0017 → 1.3520，命中。
       *   差别只在「池子有多大」，所以历史上单测永远看不出这个 bug，
       *   只有真跑 BC 预训练/周期重锚时才暴露成「BC 学不动」。
       *   改成只抬不压：基线取当前 Q，只抬示范动作。
       *   （learn() 里的在线 BC 已先行改成同样的 raise-only，见该处注释。）
       * ★ 2026-10-14（R5 续）：只抬不压**也不够**。argmax 要的是**排名**不是数值，
       *   而 MSE 只能表达数值。1904 个输出里只要有两个以上候选，raise-only 就让
       *   每一行都被抬到同一个 boost，argmax 退化成噪声。实测（Adam+clip2）：
       *     硬目标     → 命中率随更新次数**单调衰减**（5 次 100% → 520 次 1%），
       *                  且每个 epoch 打完完全不动 —— 是「全局汇」把整网压成 0。
       *     raise-only → 饱和成平局，命中率卡在 0~17%，300 epoch 与 50 epoch 同值。
       *   正确形状是**成对排序损失**：一次只动两个输出单元 ——
       *     把示范抬到 max(q[action], boost)，同时只把**当前亚军**压到中点。
       *   这样每条样本只与一个竞争者赛跑，收敛量级从「打完 1903 个对手」变成
       *   O(log nActions) 轮；既不制造全局汇，也不制造平局。
       *   压的是 argmax 的真正障碍（当前最高的非示范），不是任意单元。 */
      imitate(state, action, boost){
        if(!state || !state.every(v => isFinite(v))) return;
        const b = (boost != null) ? boost : 2.0;
        const q = DQN.mlpForward(net, state).last;
        const n = q.length;
        if(action < 0 || action >= n) return;
        const want = Math.max(q[action], b);
        let bj = -1, bv = -Infinity;
        for(let i = 0; i < n; i++){ if(i !== action && q[i] > bv){ bv = q[i]; bj = i; } }
        const tgt = q.slice();
        tgt[action] = want;
        /* 亚军已经远低于示范（相对间隔 ≥ boost）就不再动它：
         * 省掉 1904 长数组里 99.9% 本来就为 0 的梯度项。 */
        if(bj >= 0 && (want - bv) < b) tgt[bj] = bv + (want - bv) * 0.5;
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