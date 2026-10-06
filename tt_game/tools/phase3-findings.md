# 阶段 3：把「训练结果 vs 实机结果」变成一个可测量的数字

日期：2026-10-04
对象权重：`js/input-weights.js`（来自 `data/checkpoints/input3-v3/ckpt-003600.json`）

## 0. 一句话结论

**尺子造出来了，六个结构性根因修掉了，但 `default / elite / extreme` 三档仍有 -20 ~ -38pp 的缺口没关上。**
另外查出一件更要紧的事：**现在这份权重已经不可用了** —— 它在仿真里对真正的地狱 AI 只有 1.5~2% 分点率，
因为整个训练课程里的「地狱 AI」那一档从来就不是实机的地狱 AI（见 §2 #9）。

---

## 1. 起点：实测复现

`data/tt-stats.jsonl`（554 条遥测、23 个真实 session，正确分组键是 `snap.t0` 不是 `snap.n`）：

| 对手 | session | 胜率 |
|---|---|---|
| 全部 | 23 | **26.1%** |
| hell | 9 | **0.0%** |
| extreme-max | 11 | 45.5% |

失分构成：**67% 是「够不到球」**（`对手未能回球` 99 次 + `双跳` 15 次），30% 是自己出界。
DQN 触球 79 次 vs 对手 144 次。

## 2. 元问题：每一次「修一致性」验证的都是手抄副本

| 工具 | 它自己的头注释 |
|---|---|
| `tools/_drift.js` | 「本工具按源码复刻两侧公式……若改了 `physics.js#tryAIHit` 请同步这里，否则会误报」 |
| `tools/diag-serve-legal.js` | 「与实机 `physicsStep`（`physics.js`）是两个独立实现，历史上多处不一致」 |
| `tools/tt-verify.js` | 只跑 240 帧 + 一次 `ttHit`，不打一个完整回合 |

**全仓库没有任何东西加载过 `physics.js` 或驱动过 `animate()`。** 两处各写一份 = 必然漂移，
所以每修一处就复发一次，47 个百分点的缺口才活到今天。

**修法：`tools/live-match.js`** —— 用 Node `vm` 加载 `js/` 里**真实的**
`constants / simcore / policy / opponent-ladder / learned-policy-* / dqn / input-agent /
input-weights / state / tt-stats / physics / ai / rules / tt-player`，只替掉渲染与 UI 层
（THREE.Vector3、DOM、音效、HUD、`setTimeout` 换成挂在 `elapsed` 上的虚拟时钟），
按 `main.js#stepSim` 的顺序逐帧步进，跑完整 11 分 ITTF 局。
同一份权重、同一批种子并排跑 `input-sim.js`，打印两者的差 Δ。

```bash
node tools/live-match.js --opp default,hell,elite,extreme,extreme-max --games 8
node tools/live-match.js --tol 3          # |Δ|>3pp 退出码 1，可当 CI 闸门
node tools/live-match.js --side ai        # 让 DQN 站 AI 侧（镜像路径）
node tools/live-match.js --serve-log      # 打印每次发球解算的出球点
```

**harness 本身已证伪测试过**：把 agent 发球出球点 x 钉成 0，仿真数字从 64.0% 变到 50.7%。

## 3. 已修的六个结构性根因

### #9 训练阶梯的「地狱 AI」不是实机的地狱 AI（最大的一个）

- 训练侧 `opponent-ladder.js` LEVELS[1] = `POLICY_DEFAULT` + 移动覆写。
- 实机侧 `policyForModel('hell')` = `unflattenPolicy(strongVec())` = `learned-policy.js`
  的 42 维自对弈学习值 + 护栏。落点窗口（`tzBase` 0.85 vs 0.95、`txRange` 0.45 vs 0.3）、
  出球倾向（`receive.pushProb` / `receive.attackProb` / `swipeSide`）、发球参数全不同。
- 模型从没见过真正的地狱 AI。**改同源后，仿真 vs hell 从 71.5% 塌到 2.2%**，Δ 由 -58.4pp 变成 +6.9pp。

### #10 Node 下学习策略静默回落 + 斗蛐蛐对手接错模型 + 阶梯污染基座

1. `policy.js#strongVec()` 用 `typeof LEARNED_POLICY !== 'undefined'` 判断，
   而 `learned-policy.js` 的 `const` 在 Node 里是模块作用域 → 恒假 →
   `policyForModel('hell'|'grandslam'|'nemesis')` 在任何 Node 脚本里都静默返回
   `POLICY_DEFAULT`，**无任何报错**。已在 `policy.js` 顶部显式 require 补齐。
2. `resolvedPolicy()` 一律读顶栏 `aiModel`。斗蛐蛐里给右侧选什么模型，
   跑动速度与出球选择都还是顶栏那一档（默认普通 AI），只有 `moveErr` 和
   `diffPrecision` 读了 `fightR`。已加 `resolvedPolicyFor(side)`，
   `aiMove` / `bandit.policyForContext` / `startToss` 三处改走它。
3. `OPP.at()` 只做浅拷贝，`setPath(o,'wide.forehand',…)` 会**原地改到基座身上**。
   实测调一次 `at('extreme-max')` 之后 `POLICY_DEFAULT.wide` 变成 `{1.15, 1.40}`，
   实机的「普通 AI」从此永久变宽。已改为结构化深拷贝。

### #11 八处 agent 侧口径各写一份 → 收进 `simcore.js` 单一来源

新增并被两侧共调用的函数：

| 函数 | 修掉的失配 |
|---|---|
| `SIM.serveOrigin(side,padX,padZ)` | 发球出球点：训练写死 `{x:pad.x*0.35(±0.4), y:0.91, z:1.45}`，实机是端线外 `z≈±1.87`、`y≈1.01`、x 用满拍位。**z 差 42cm、y 差 10cm**，而 `serveShot` 是从出球点反解速度的 → 解出的发球完全不同。`servePlan.tx/tz` 原本算了从不消费，一并去掉 |
| `SIM.subStepsFor(dt)` | 实机 `dt` 跟着显示器刷新率走：144Hz 屏上每帧只积 1 个 1/120 子步 |
| `SIM.fitWindow(stance,relTop,ballY,v,s,allowPush)` | 触球容错窗口（fitV/fitH/fitZ）两份手写 |
| `SIM.outOfBounds(p,v)` | 出界阈值两份（`\|z\|>4.5` vs `OUT_Z=1.72`） |
| `SIM.fwdOf(svz)` | `fwd` 分母两份硬编码 `/7`，与 `MOUSE_SV_CAP` 脱钩 |
| `SIM.magnetStep(...)` | 磁吸三份手写，漂移出 z 门、调用顺序、以及**AI 侧纵深磁吸的符号错误**（注释说「镜像玩家 zAhead」但没镜像符号，把短球往网方向拉） |

另外三处独立修正：

- **`applyArcAdj`**：`tt-player.js` 写 `mode==='play'`，于是**斗蛐蛐模式下弧线拟合被静默关掉** ——
  而线上遥测里全部 ttmouse 对局都在斗蛐蛐模式。已无条件为 true。
- **帧率**：`main.js` 把仿真拆成固定 1/60 步长累加器（`stepSim`），渲染仍按刷新率走。
  决策与物理恒定 60Hz × 2×1/120 子步，与训练器 `DT`/`SUBN` 严格一致。
- **发球锁**：实机抛球窗口有 1~1.5s + ~0.35s 下降，期间 `ttTick` 每帧重新决策，
  于是击球那一刻的拍位是**最后一次**决策的目标；训练侧相反（`serveFromPlayer` 前跑
  15 帧 `padControl` 收敛到发球动作）。出球点由拍位决定 → 两边发球点系统性不同。
  已在 `decideServe` 里把发球决策锁到击球为止。
- **撞网判定顺序**：训练侧 `netStep` 原先跑在积分**之前**（滞后一个子步），
  已挪到积分之后，与实机 `checkNet` 同序。实测对结果影响很小（穿越子步基本不变），
  但插值端点原来取错了一段。

### #12 对手在训练与实机是两个不同的游戏

`input-sim.js#aiReach` 是闭式近似：预测触球点 → 抽一次高斯误差 → 指数趋近 →
`|Δx|>0.15` 硬判失败。没有逐帧跑位、没有磁吸、没有穿越/贴近判据、没有三维接触窗口、
没有落台/撞网交互 —— 4 道 `reach:false` 硬门直接给 agent 记分。

已改为**对手真的逐帧跑**：`SIM.aiStep`（= 实机 `aiMoveShared` 的逐帧跑位与姿态，
从 `ai.js` 搬进 `simcore.js`）+ `SIM.magnetStep`（mir=-1）+ 与 `tryAIHit` 镜像的接触判据 +
`P.aiDecision`。两侧接收循环也共用一份 `stepBall`。

顺带修掉：`physics.js#tryAIHit` 的 swept 判据并非玩家侧的严格镜像（原来要求球在一步内
**完整穿过** ±zF 带，玩家侧只要求进入），已改成严格镜像。

训练成本实测：40 局 169s（含 13s 验证）≈ 3.9s/局，与修之前的 ~5s/局同量级 ——
逐帧真跑对手并没有想象中贵（瓶颈不在这里）。

### #13 遥测把唯一的判据扔了

`tt-stats.js#reasonOf()` 没有「对手未能回球」的关键词，23 个 session 里 99 次
「未能回球」全被静默归进 `other`，而快照只存分类结果、原始文案没落盘 → 事后无法复原。
已加 `noreach` 桶（并把「双跳·回球失败」也归入够不到口径），上报快照额外带 `reasons[]` 原始文案。

修完后的分类验证：
```
DQN 侧失分归类： {"net":3,"out":1,"double":0,"serve":3,"other":0,"noreach":2}
```

### #14 训练器续训写错目录（`input3-v4` 的真相）

`input3-v4` 的 index 里 `run` 字段写着 `"input3-v3"`、`adopted.json` 与 v3 的
`ckpt-006400.json` 逐字节相同、ep 6400~8400 的 `checks[]` 全部停在 ep 3600 的胜率上。
看起来像「验证循环冻住了」，真实原因：**续训默认沿用起点 run 的名字与目录，
而局号又从头数**，于是新 run 的检查点覆盖了旧 run 同号的 `checks[]`。
已改：续训默认开新目录（`<旧名>-<日期>`），并加一道硬拦 —— 目标目录里已有的 index
若属于另一个 run 名就退出。

同一次排查还发现最终报表 `finBase[i]` 按下标索引 5 档结果，而 `baseLadder` 现场标定时
只跑 3 档 → `--from random` 必崩 `TypeError`；`--resume` 带残缺基线时则把 default 的
胜率和顶档的胜率错位相减（v4 的 `final.base: {default:0.0704, extreme-max:0.4682}`
就是这么来的）。已改成按档名匹配。

---

## 4. 修完之后的测量（同一权重 · 同一种子 · 每档 8 局）

| 对手 | 实机 | 仿真 | Δ | 实机触球(己/敌) |
|---|---|---|---|---|
| default | 40.6% | 64.0% | **-23.4pp** | 36 / 66 |
| hell | 9.1% | 2.2% | **+6.9pp** | 27 / 54 |
| elite | 29.7% | 68.2% | **-38.5pp** | 29 / 60 |
| extreme | 45.5% | 77.2% | **-31.7pp** | 25 / 58 |
| extreme-max | 47.1% | 67.7% | **-20.6pp** | 15 / 50 |

失分构成（修好归类后）：**够不到 92.9%**，自己出界/下网 6.1%，发球失误 1.0%。

> `elite` 不是实机可选模型（`MODEL_NAMES` 里没有），`policyForModel('elite')` 会回落
> `POLICY_DEFAULT`；这一行的「实机」列实际是 default 那一档。训练侧是真正的 elite 档。
> `live-match.js` 输出里这一行应当理解为「训练 elite 档 vs 实机 default 档」，不是同源对照。

### 起点对照

| 对手 | 修前 实机 | 修前 仿真 | 修前 Δ | 修后 Δ |
|---|---|---|---|---|
| default | 51.6% | 71.5% | -19.9pp | -23.4pp |
| hell | 13.1% | 71.5% | **-58.4pp** | **+6.9pp** |

`hell` 从 -58.4pp 收敛到 +6.9pp（两条管线一致地说「这份权重打真地狱 AI 是 2%」）。
`default` 的缺口反而扩大 —— 因为修掉的对手/磁吸口径让**实机对手变强了**，
而训练侧的对手在阶段 2 之前根本没有这些机制。这是把欠账暴露出来，不是引入新错。

---

## 5. 还没关上的缺口

`default / elite / extreme` 仍有 -20 ~ -38pp。

### 5.0 先修的一处（负面结果：没关上）

已改：`tt-player.js#stanceTick` 接管本侧姿态，逐字段对齐训练侧 `input-sim#stanceOf`
（只传 `bx/gx/gz/cur/lastSwitch/now/inbound/commit/rng/bvx/noiseBox`，**不传**
`gvx/ttc/ballY/spinY/strokeSwitches/idle`）；`main.js#stepSim` 在 ttmouse 玩家侧
不再调 `autoStance()`；`pushStanceOf()` 在该路径改读 `TT_PLAYER.getStance()`。

**但缺口没动**：

| 样本 | 实机 | 仿真 | Δ |
|---|---|---|---|
| 8 局/档 | 40.6% | 64.0% | -23.4pp（σ_Δ≈5.7pp） |
| 8 局/档（改后） | 34.9% | 64.0% | -29.1pp |
| **24 局（改后）** | **37.9%** | **65.3%** | **-27.4pp**（σ_Δ≈3.2pp） |

三组在噪声内一致。**结论：姿态输入口径不是这档缺口的原因**，或不是主要原因。

> 顺带一条方法论：8 局/档（≈200 分点，σ_Δ≈5.7pp）**分辨不了 5pp 级的效应**。
> 之前几轮「改了没变化 / 数字一模一样」的困惑里，有一部分其实是样本量不够，
> 另一部分是改动确实不改变这些球的轨迹。判断任何 ≤10pp 的修复都必须 ≥20 局/档。

### 5.1 下一步：不要再猜，做逐帧 diff

harness 已经让「猜 → 改 → 跑 8 局」这个循环变得可负担，但它仍然是**黑盒比对** ——
只能告诉你 Δ 变没变，没告诉你第一个分叉发生在哪一帧、哪个量。

该做的是给 `live-match.js` 加 `--trace <seed>`：把实机管线与仿真侧**同一颗种子**
的逐帧状态（球 pos/vel/spin、两侧拍 x/z/svx/svz/stance/cur、决策动作、
接触/落台/出界事件）录成定长记录并 diff，**第一个不一致的字段就是元凶**。
现在两边都已共用 `simcore` 的物理与接触判据，剩下的分叉必然落在
「状态喂进去的那一层」，逐帧 diff 能一击定位。

候选（按怀疑度）：

1. 实机对手/agent 的 `resolveStance` 的 `now` 与 `stanceT` 时钟不同源
   （实机 `elapsed` 从页面加载起算、训练 `simClock` 从本进程起算，
   而 `STANCE.minHold/urgent/escStep` 都是**绝对时刻差**的函数）。
2. 实机 `rules.js#resolveOut/pointTo` 的判分分支与训练侧 `_playInputPointInner`
   的一串 `winner=` 赋值是两份独立状态机，逐步对照还没做。
3. `bandit.policyForContext` 在 `mode!=='play'` 时直接返回策略不带 arm 偏置，
   训练侧完全没有这层（watch 模式下不触发，play 模式会）。

---

## 6. 必须重训（现有权重已不可用）

修好环境后，这份权重在仿真里对真正的地狱 AI 只有 **1.5~2%** 分点率 —— 整个课程
（20% hell → 30% elite → 30% extreme → 20% extreme-max）打的都不是实机那个地狱 AI。
**继续用它做 A/B 已经没有意义。**

```bash
# 从随机初始化重训（现有权重不是合法起点：它的课程目标已经不是实机的对手了）
node tools/train-input3.js --from random --run-name input3-parity \
     --games 20000 --step 200 --eval 77 --ckpt 200 --keep 12 \
     --phases 'hell:0.25,elite:0.30,extreme:0.25,extreme-max:0.20' \
     --optimizer adam --layer-lr 1,1,1,3 --no-save

# 每轮训练后用实机管线验收（Δ 不达标就别采纳）
node tools/live-match.js --from data/checkpoints/input3-parity/ckpt-XXXXXX.json \
     --opp default,hell,elite,extreme,extreme-max --games 8 --tol 3

# 通过后再烘焙
node tools/bake-input.js data/checkpoints/input3-parity/adopted.json <evalHell> <evalDefault> ladder
```

`bake-input.js` 的 `INPUT_AI_META` 建议补记 `ladderLive`（用 `live-match.js --side ai`
在实机管线上实测的分点率），以后一眼能看出 sim/live 是否又岔开。

---

## 7. 本次改动的文件

| 文件 | 改了什么 |
|---|---|
| `js/simcore.js` | 新增 `serveOrigin / subStepsFor / outOfBounds / fitWindow / fwdOf / magnetStep / aiStep` 七个共享口径 |
| `js/physics.js` | 两侧磁吸改走 `SIM.magnetStep`（含符号修正）；触球窗口改走 `SIM.fitWindow`；出界改走 `SIM.outOfBounds`；磁吸挪到落台之后；AI 侧 swept 改成玩家侧的严格镜像 |
| `js/ai.js` | `aiMoveShared` 变成 `SIM.aiStep` 的薄适配层；补回被误删的 `aiMove` |
| `js/input-sim.js` | 对手换成真实逐帧（`aiReceive`）；两侧共用 `stepBall`；发球出球点/触球窗口/出界/撞网顺序对齐；单调 `simClock` |
| `js/main.js` | 仿真拆成固定 1/60 步长累加器 `stepSim`，渲染与仿真解耦 |
| `js/rules.js` | 发球出球点改走 `SIM.serveOrigin`；对手策略按侧解析 |
| `js/tt-player.js` | `applyArcAdj` 无条件；`fwd` 读 `MOUSE_SV_CAP`；抛球窗口发球锁 |
| `js/policy.js` | Node 侧补齐 learned-policy；新增 `resolvedPolicyFor(side)` |
| `js/opponent-ladder.js` | hell 档改用真正的地狱 AI 为基座；`at()` 深拷贝，不再污染基座 |
| `js/tt-stats.js` | 失分归类加 `noreach`；上报带原始文案 |
| `tools/live-match.js` | **新增**：实机管线无头对局台 + Δ 报告 + `--tol` 闸门 |
| `tools/train-input3.js` | 续训开新目录 + 跨 run 覆盖硬拦；最终报表按档名匹配基线 |
---

## 8. 阶梯难度是乱的（600 局实测）

用修好的环境从随机初始化跑了 600 局（`--from random --run-name input3-parity
--games 600 --step 300 --eval 16 --no-save`），课程 20% hell → 28% elite →
30% extreme → 22% extreme-max：

| 对手 | 起点 | 600 局后 |
|---|---|---|
| default | 4.8% | 43.9% |
| **hell（真地狱 AI）** | 1.1% | **6.7%** |
| elite | — | 54.9% |
| extreme | — | 66.2% |
| extreme-max | 3.3% | 65.6% |

**课程把 30% 的局数花在 extreme 上、20% 花在 hell 上，结果 extreme 66.2%、真地狱 AI 6.7%。**
课程假定难度单调递增，这个假定不成立 —— 真地狱 AI 比 extreme-max 强得多。

原因在 `strongVec()` 那份自对弈学习策略：出球倾向（`receive.pushProb 0.62`、
`attackProb`、`swipeSide 0.5`）与落点参数都和 `POLICY_DEFAULT` 那一族不是一回事，
再加上 `diffPrecision('hell') = 0.5` 让它比默认档更准（elite/extreme/max 都是 1.0）。

**因此上长跑之前必须先重标阶梯**：要么把 hell 拆成几档插值，要么把课程份额
按实测强度重排（把 hell 拉到 40%+ 并放到后面），否则模型会一直花大部分预算
打一群比地狱 AI 弱得多的对手。判据用 `--eval-only` 在 5 档上的分点率，
用 ≥20 局/档（小样本分辨不了，见 §5.0）。

检查点：`data/checkpoints/input3-parity/ckpt-000{150,300,450,600}.json`（约 10MB/份，gitignored）。
