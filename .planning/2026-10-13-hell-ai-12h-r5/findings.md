# Findings — 地狱 AI 续训 12h（第 5 轮）

## 目标

研究地狱 AI（tt_game 输入级 DQN）现状 → 定位可修的真瓶颈 → 跑一轮 12h 受守护的续训 →
达标才烘焙 `js/input-weights.js`。防中断要做到「进程级」与「会话级」两层。

## 已确认的事实（读代码/读日志所得，非猜测）

### 1. 「地狱 AI」在本仓库指什么

- 游戏里选得到的一档对手：`policyForModel('hell')` = `unflattenPolicy(strongVec())`
  （`js/policy.js`，护栏 `moveSpeed 2.8 / moveErr 0.03 / moveZ 2.6`）。
- **要增强的实参**是玩家侧的输入级 DQN：`js/input-agent.js`（观测 88 维、动作
  34×14×2×2=1904 离散）+ `js/input-weights.js`（烘焙产物），实机由
  `js/tt-player.js` 懒加载。训练器 `tools/train-input3.js`，烘焙 `tools/bake-input.js`。
- 课程档位定义在 `js/opponent-ladder.js`：`hell / elite / extreme / extreme-max`。
  `elite/extreme/extreme-max` 游戏里**选不到**，只有 default/hell/grandslam 是实机真实可选。

### 2. 历史成绩（实机管线 `tools/live-match.js`，每档 30 局、种子 20261004）

| 轮次 | run | default | **hell** | grandslam | 结论 |
|---|---|---|---|---|---|
| 基线（线上） | `input3-12h/ckpt-008500` | 35.4% | **11.7%** | 35.4% | 当前烘焙的那份 |
| 第 3 轮 | `input3-hell12h` | 35.4% | 11.7% | 35.4% | 白跑（口径 bug） |
| 第 4 轮 | `input3-hell12h2` | — | 2.6% | — | 白跑（模型被练崩） |
| 第 4 轮 | `input3-hell12h3` | 38.6% | **5.0%** | 36.4% | 闸门 B 判负，未烘焙 |

- 线上基线 = `js/input-weights.js` ← `data/checkpoints/input3-12h/ckpt-008500.json`。
  见 `tools/logs/baseline-live.json`（live hell 0.117 / default 0.354 / gs 0.354）。
- **仿真 ≠ 实机**：同一份权重 default 档仿真 60.7% / 实机 35.4%（差 25pp），
  且地狱档仿真最佳 ≠ 实机最佳（`input3-gs` best@ep2000 仿真 18.8% / 实机 2.3%）。
  所以「仿真分」只能用来**排序候选**，验收必须走实机管线。

### 3. 失分原因分解（`input3-hell12h3` 收尾，`tools/logs/input3-hell12h3.chain.log`）

| 候选 | default | **hell** | 主导失分原因 |
|---|---|---|---|
| `ckpt-009500` | 22.8% | 3.0% | serve 495/733 = **67.5%**，noreach 31.8% |
| `ckpt-009750` | 32.0% | 2.7% | noreach 586/589 = **99.5%**，serve 0 |
| `best-002250` | 38.6% | 5.0% | noreach 518/543 = **95.4%**，serve 0 |

- 触球数（己/敌）：`ckpt-009500` default 93/96、hell 24/25 —— DQN 自己几乎摸不到球。
- `phase4-findings.md` §4 实测：两份权重 `my` 众数 0.462（80%+）、`tx` 均值 0.118~0.126，
  中位 0 —— **深度没锁死，但横向几乎不跟球**。§4 的「调深度旋钮」假设已被证伪，
  真抓手是**横向追踪**。

### 4. 第 4 轮（`input3-hell12h3`）的配置与它的失败原因

配置（`tools/logs/input3-hell12h3.chain.log` L4）：
`--from data/checkpoints/input3-12h/ckpt-008500.json`（= 线上生产权重）
`--end hell --sel-ref hell --lr0 1e-5 --lr1 1e-5 --games 9000 --step 250 --eval 30
--vallevels default,hell,grandslam --ckpt 250 --keep 16 --no-save --optimizer adam
--layer-lr 1,1,1,3 --grad-clip 2 --phases default:0.25,hell:0.45,grandslam:0.15,hell:0.15`

三个已查实的病因（`phase4-findings.md` §6）：
1. **选优分两个口径不是同一个量** → `keep` 恒不成立 → `bestNet` 从不更新 →
   一轮 12h 写出的检查点全是同一份副本。**已修**：第二项固定锚 `--sel-ref`，
   基线与每轮共用同一个 `selScore()`；`VAL_TAGS` 强制补进 `SEL_REF`。
2. **强起点套从头训练的学习率**（`LR_0=1e-4`）→ 模型被练崩。
   **已修**：`--lr0/--lr1`，实测 1e-5 / 3e-5 都能出现「★新最佳」。
3. **检查点只存 bestNet** → 收尾没有候选可选。**已修**：`ckpt-*.json` 存当轮策略、
   `best-*.json` 存 bestNet；`entry.wr` 记当轮策略胜率、`bestWr` 另存。
   另有饥饿告警（连续 12 轮无新最佳就告警）。

### 5. 2026-10-14 的提交 `1e0e5e3` 做了什么（**大量删除**）

删掉的（我需要重建或绕开）：
- `tools/_launch-hell12h*.sh`、`_run-hell12h*-and-finalize.sh`、`_auto_bake.sh`、
  `_st.js`、`_stub-trainer.js` —— **整条「训练→验收→烘焙」一条龙脚本没了**。
- 全部 `tools/diag-*.js`、`tools/debug-*.js`、`tools/train-dqn.js`、
  `tools/train-input.js`、`tools/train-input2.js`、旧的 `input-curve-*.json`、
  `js/dqn-weights.js`、`data/dqn-ai.json`（DQN 8 维/6 模式那一支，从没被 index.html 加载过）。

留下的（可复用）：
- `tools/_supervise.sh`（17.5KB，守护：按内容判卡死、三级降级停机、EXIT trap 防孤儿）
- `tools/_finalize-12h.js`（21KB，`--topN` 多候选实机择优、按内容 sha1 去重）
- `tools/bake-input.js`、`tools/eval-candidates.js`、`tools/live-match.js`、
  `tools/model-registry.json`、`tools/phase4-findings.md`、`tools/train-input3.js`
- 历史跑出来的检查点全在：`data/checkpoints/input3-{12h,gs,hell12h,hell12h2,hell12h3}/`

`train-input3.js` 本次改动：新增 `--from auto`（默认）+ `resolveAutoFrom()`，
按 `js/input-weights.js` 的 `INPUT_AI_META.src` → `data/<save>` → `best-*.json` → `ckpt-*.json`
的顺序扫，**每份都用 `netShape()` 试读**，形状不兼容直接跳过；采纳写盘前加形状断言（exit 3）。

### 6. 动作/观测口径（`js/input-agent.js`，读全）

- 观测 88 维；动作 = 鼠标X(`IN_MX` 34 档，-0.9..0.9) × 鼠标Y(`IN_MY` 14 档，0..1) ×
  Ctrl × 发球上/下旋。回球只用前三维，第四维只在发球那帧被消费。
- 奖励：`endPoint()` 只给**最后一帧** ±R(默认 3)，其余帧只有常数 `0.0008` +
  `o.shape` 势差（**train-input3.js 没设 `shape`，实际为 0**）。
  → 中间帧没有稠密奖励，靠 TD 链式 `s.next = episode[i+1].state` 反传。
- 训练期还持续混入 BC：`bcPairs` 来自 `naiveCmd = { tx: clamp(o.x,±0.9), my: 0.5, ctrl:false }`
  （train-input3.js L680-681），`--bcpairs`(默认 120 局) `--bcmix`(默认 0.06，batch 内至少 4 条)
  `--bcpass`(默认 0)，`agent.setBC(bcPairs, 1.6)`。
- `setNet()` 有形状硬断言；`mlpForward` 维度不匹配只会出 NaN，
  NaN 会让 `bestAction` 的 ties 塌成 `[0]` → 恒返回动作 0（静默失效形态）。

## 待查（本轮研究的核心问题）

- [ ] **noreach 95~99% 的机制**：是拍子速度跟不上、还是 tx 没跟球、还是够不到判定本身有问题？
      要用 `input-sim.js` 的玩家引擎 + 逐决策步统计来测，不是猜。
- [ ] serve 67.5% 失分（`ckpt-009500`）的成因：发球动作没学？还是发球后第一板必然丢？
- [ ] `_supervise.sh` 的环境变量接口；`_finalize-12h.js` / `bake-input.js` 的 CLI。
- [ ] `js/input-weights.js` 的 `INPUT_AI_META` 当前内容（src / evalHell / ladderLive）。
  → 已查：meta 写的是 `evalDefault:0.6156 / evalHell:0.1822`，**都是仿真值**
    （仿真 default 0.607 / 仿真 hell 0.16），而实机只有 0.354 / 0.117。
    `bake-input.js` 本身**已经**接受实机值作 argv2/argv3，`_finalize-12h.js` L313-322
    **也已经**把 `cand.live[...]` 传进去 —— 所以这不是代码没修，是**线上这份权重
    是修复前烘的**，属于陈旧产物。下一次成功烘焙会自动修正；
    若本轮闸门不过而没烘，**要单独手工烘一次同权重 + 实机值**，否则玩家看到的
    永远是错的数字（finding #16 的全部意义就在这个字段）。

---

# 第二段（2026-10-14 续）：真瓶颈定位 + 三个被证伪的假设 + 一个突破

## A. 先证伪自己：选优分口径**没有**错

`train-input3.js` L179-190 `selScore`：
`SEL_W=[0.45,0.30,0.25]`，第一项 `wrMap[opt.end]`，第二项 `SEL_REF`，第三项 `default`。
`--end hell --sel-ref hell` 时 `sc = 0.75*hell + 0.25*default`，与基线同口径。
phase4 §6 的修法是对的，**不要再翻案**。

## B. 第四轮是真的把模型练崩了

`data/checkpoints/input3-hell12h3/curve.json` 42 个评估点：
`trainW` 从 ep250 的 50.4% **单调**掉到 ep10500 的 21.6%；`best` 只在 ep2250 动过一次
（23.9→24.6），之后 8 300 个 epoch 再没动过。仿真 hell 全程 0.10-0.12（基线 0.16，更差）。
闸门 B 判负（实机 5.0% vs 基线 11.7%）是**如实记录**，不是记账 bug。

## C. 真瓶颈：策略根本不横向追球（`tools/_diag_argmax.js` → `tools/logs/_diag_argmax.txt`）

扫 13 个来球 x（obs：y 0.92 / z 0.5 / vz 3.2 / px 0 / pz 1.32 / bounced 1），
对**线上权重**取 argmax：

```
   bx    tx(决策)   my    ctrl   Q(argmax)  Q(追球心)    Δ
 -1.20   -0.027  0.923  true   0.5699    0.2190   0.3508
 -0.80   -0.136  0.462  false  1.1743    0.0079   1.1663
  0.00   -0.027  0.462  false  2.5464    2.5464   0.0000
 +0.60   -0.027  0.923  true   0.6388    0.3001   0.3387
 +0.80    0.900  0.462  false  0.6750    0.0147   0.6603
 +1.20    0.900  0.462  false  0.9646    0.9646   0.0000
tx 均值 0.166 · 唯一取值数 4（34 个鼠标X里只用了 4 个）· 回归斜率 d(tx)/d(x)=0.421
```

- 拍速**不是**瓶颈：`MOUSE_PACE=18` @60Hz，每帧收敛残差 30%（τ≈0.056s），
  −0.9→+0.9 全场横移 0.15s。
- 触球窗口：`|bx − pad.x| ≤ PAD_HW 0.10 + BALL_R 0.02 + fitH 0.17…0.22 ≈ 0.29…0.34 m`
  （`input-sim.js#tryPlayerFit` L285）。地狱 AI 把球放在 |x| ≈ 0.8…1.2 → **够不到是必然**。
- BC 目标（「追当前球心」）的 Q 在 13 个点里有 9 个**低于** argmax —— 网络在主动回避追球动作。

## D. 三个被证伪的假设（**别再走**）

1. **选优分口径错**（见 A，phase4 已修）。
2. **深度旋钮 / bcmix 能救**（phase4 §4 已用 `_diag_depth.js` 证伪）。
3. **BC 预训练能把追球规则灌进网络** —— 本轮用三个诊断彻底证伪：
   - `_diag_bc_capacity.js`：命中率随**梯度更新次数**单调衰减
     （5 次→100%、20 次→55%、100 次→12%、520 次→1%），且第 1 个 epoch 后不再动。与池子大小无关。
   - `_diag_bc_fit.js`：520 个真实观测 + 随机确定性标签，lr∈{0.01,0.1,0.5,2.0} × 100 epoch
     → **每一格 0~1%**。连不冲突的标签都拟合不了。
   - `_t4.txt`：**裸 SGD 直接发散到 1e85~1e93**（`mlpTrainSgd` 的 `|d|<100` 输出钳位救不了，
     爆炸发生在 ReLU 隐层）。这才是历史上每次 12h 都必须开 adam 的真实原因。
   - `_t5.txt`：adam+clip2+layerlr 稳定（qmax≈0.18）但**平台化**，300 epoch 与 50 epoch 同为 17%。
   - `imitate()` 改成**只抬不压**后（已落地），命中率终于会爬（lr0.01：3.3%→6.7%→10.0%/6 epoch），
     再改成**成对排序**（只抬示范 + 只压当前亚军，已落地）也只到 10%。
   - 实机判定：`_bc_pretrain.js --pool 120` 出的网，**实机地狱胜率 0.0%**（原基线 8.7%）。
     它没学会规则，只是把原策略打乱了。
   → **根因**：1904 维输出上的 MSE 硬目标是**全局下沉井** —— N 个状态把每行往下踩 N 次、
     只往上推 N/65 次，全网收敛到全零。要学的是**排序**，不是数值。

## E. 突破：`--brain` 脚本脑实测（`tools/live-match.js` 新增）

`live-match.js` 新增 `--brain {centre|naive|chase|prior}`，在 rig 建好、形状自检**之后**
往 vm 里注入，覆盖 `TT_PLAYER.agent.bestAction`（权重仍然加载，只为过形状检查）。

```
node tools/live-match.js --brain X --opp hell --games 30 --live-only

  centre  tx≡0          实机地狱胜率  0.4%   触球 13/162    够不到 99.6%
  naive   tx=当前球心     实机地狱胜率 22.8%   触球 245/308   够不到 93.8% 出界 5.7%
  chase   tx=x+vx·τ     实机地狱胜率 40.1%   触球 365/404   够不到 47.5% 出界 52.5%
  prior   网络定my/ctrl   实机地狱胜率 32.1%   触球 246/269
  ── 线上 DQN 基线        实机地狱胜率  8.7%（修 τ 判据后）/ 11.7%（修之前）
```

**一行拦截预测点，零训练，+28.4pp（3.4 倍）。** 而且失球结构从「够不到 95%」变成
「出界 52.5%」—— 横向这一项交给规则之后，**剩下的弱项是深度/旋转，正好是 TD 能修的**。

## F. 落进产品路径：`lateralPrior`（已落地 `js/input-agent.js`，默认开）

```js
function lateralBinOf(obs){                    // 与 lateralBinOf 同侧的桶
  const pz = (obs.pz != null) ? obs.pz : 0;    // pz 缺失→0→closing 必假→返回 -1（安全）
  if(!((pz - z) * vz > 0 && Math.abs(vz) > 0.05)) return -1;
  const tau = Math.min(1.5, Math.abs((pz - z) / vz));
  let tx = clamp((obs.x || 0) + vx * tau, -0.9, 0.9);
  → 返回 IN_MX 里离 tx 最近的桶号
}
// bestAction 结尾：
const a = ties[(rng() * ties.length) | 0];
if(o.lateralPrior === false) return a;
const lb = lateralBinOf(obs);
if(lb < 0) return a;                                  // 球在飞离/待发球 → 不干预
if((a >> 2) / 14 === lb) return a;                     // 本来就追对了
return ((lb * 14 + ((a >> 2) % 14)) * 2 + ((a >> 1) & 1)) * 2 + (a & 1);
```

新增 `setLateralPrior(on)` / `getLateralPrior()`；`o.lateralPrior === false` 是回滚开关。
**训练与实机走同一份代码**（`train-input3.js` 和 `tt-player.js` 都用 `agent.bestAction`），
所以训练时评估到的就是实机行为。冒烟（`tools/logs/_smoke_prior.txt`）：bx 从 −1.2 到 +1.2，
tx 依次 −0.900/−0.791/−0.409/−0.027/+0.409/+0.791/+0.900（完整跟踪），
而 `my`/`ctrl` 仍随网络变化（左端 0.92/true，其余 0.46/false）；vz=−3.2 的离场球保持网络原意。

## G. 顺手修掉的三个小缺陷

| 缺陷 | 位置 | 修法 |
|---|---|---|
| τ 判据方向反了 | `encodeObs`：`vz < -0.05 && pz - z > 0` 只在球**离开**时成立 → 该接球的帧 τ≡0，预测落点特征零前瞻 | `(pz-z)*vz > 0 && \|vz\| > 0.05`；idx122 的 one-hot 同步改 `closing` |
| BC 目标滞后 | `train-input3.js#naiveCmd` 用 `clamp(o.x)`（当前球心） | 改追 `x + vx·τ`（与 prior 同一公式） |
| **`--bcmix 0` 关不掉 BC** | `learn()`：`Math.max(4, bcmix*batch\|0)` → `Math.max(4,0)=4`，每 batch 恒 6.25%，12h 约 7.2 万次「把其余 1903 个 Q 往 0 拉」 | `(o.bcMix ?? 0.2) > 0` 才计；默认 0.2 行为不变 |
| 在线 BC 硬目标 | `learn()`：`tgt.fill(0)` | raise-only（基线取当前 Q） |
| `imitate()` 硬目标 | `input-agent.js` | 成对排序更新（只抬示范 + 只压当前亚军） |

## H. 本轮 12h 的职责因此变得清晰且可验证

prior 兜住横向 → TD 只需修**出界 / 深度 / 旋转**。
课程沿用第四轮已验证的：`default:0.25 → hell:0.45 → grandslam:0.15 → hell:0.15`；
`--sel-ref hell --end hell`（选优分 = 0.75*地狱 + 0.25*默认护栏）；`--lr0/--lr1 1e-5`
（强起点不能用从头训练的学习率）；`adam + grad-clip 2 + layer-lr 1,1,1,3`；
新增 **`--bcmix 0`**（追球归 prior，BC 不要和 TD 抢 my/ctrl）。

**基线必须重测**：prior 已在 `js/input-agent.js` 里默认开，同一份权重现在打地狱 32.1%
（旧口径 11.7%）。拿 `tools/logs/baseline-live.json` 的旧值当基线，
闸门 A 会**必然通过**，等于没设闸门。要重测成「当前代码 + 当前生产权重」的实机值，
然后闸门问的才是真问题：**这 12h 的 TD 有没有在规则之上再赚一点**。

---

# 第三段：基线重测 + 一个会让 12h 白跑的烘焙偏移 + 启动

## I. 新基线（当前代码 + 当前生产权重，实机管线，seed 20261004，30 局/档）

| 档位 | lateralPrior 之前 | lateralPrior 之后 |
|---|---|---|
| default | 35.4 % | **88.6 %** |
| hell | 11.7 % | **38.1 %** |
| grandslam | 35.4 % | **90.5 %** |

即**光靠这一条横向 prior，零训练**，实机三档全部翻倍以上。
失球结构：`noreach 90（52.3%）` / `out 51（33.1%）` / `serve 25（14.5%）` / `net 6`。
够不到**仍然是第一大项** —— 所以 12h 的 TD 仍有活可干，不是白跑。

已写 `tools/logs/baseline-live.json`（weighted 0.5073，top=hell 时
`0.75*0.381 + 0.25*0.886`），旧值归档到 `tools/logs/baseline-live.v4-archive.json`。
**不要**再用旧值当基线。

## J. ★ `bake-input.js` 参数下标整组偏移一位 —— 会让 12h 在收尾阶段崩掉

`argv = process.argv.slice(2)`，所以 `argv[0]=<src.json>`、可选参数从 `argv[1]` 起；
但函数体里写的是 `argv[2]/[3]/[4]/[5]/[6]`，**跳过了一格**。三重后果：
1. 传进来的 `evalHell` 被写进 `evalDefault`，`evalDefault` 被 `parseFloat` 成 `NaN`
   → `JSON.stringify(NaN)` = `null`，**页面上给玩家看的两个胜率整个错位**；
2. `opp` 标签取到了 `ladderLive` 的 JSON 原文，`meta.opp` 变成一坨 JSON 字符串；
3. 最要命：`_finalize-12h.js` L318 用
   `execFileSync(node, ['tools/bake-input.js', path, evHell, …])`，
   于是 `src` 解析成**脚本自己** —— `existsSync` 过得去，但 `JSON.parse` 一个 `.js`
   源文件必然 `SyntaxError`，**收尾直接崩在烘焙这一步，12h 白跑**。
   （已用 execFileSync 同形状的调用复现并确认修好后正常。）

修法：下标改成 `argv[1..5]`，与头部用法注释、`_finalize-12h.js` 的调用三方一致；
再加一道闸：`evalHell/evalDefault` 必须是 0~1 的有限数，否则**拒绝烘焙**并打印参数原值
（位置错了要当场发现，不能靠事后看页面）。

实测这次偏移已经造成过真实损坏：线上 `js/input-weights.js` 写的是
`evalDefault:0.6156 / evalHell:0.1822`，都是**仿真**值（仿真 0.607 / 0.16），
实机只有 0.354 / 0.117。已用同一份权重 + 实机值重烘（权重字节没变，只改 meta）：
`evalDefault 0.886 / evalHell 0.381`，另记 `ladderLive`（三档实机）与
`simEval`（仿真 0.969 / 0.932）便于以后一眼看出 sim/live 又岔开了多少。

## K. 仿真已经饱和 —— 选优信号被压扁（不是 bug，是任务的真实状态）

prior 落地后，同一份权重在**仿真**里是 default 96.9 % / hell 93.2 %
（之前 70.6 % / 11.5 %）。于是选优基线分 94.1、天花板 100，
**动态范围从 58.6 点压到 5.9 点**，仿真排名近乎随机。
后果与对策：
- 仿真只能用来**排序候选**，判达标一律走实机（这本来就是 phase3 §5.0 的规矩）；
- `--topN` 从 3 提到 **4**，多测一个候选就是多一条实机证据。
- 绝不能因为「仿真 93% 了」就认为任务完成 —— 同一份权重实机地狱只有 38.1%。

## L. 12h 已启动（2026-10-14 03:16）

- 链路 `tools/_run-hell12h5-and-finalize.sh`（bash 隐藏窗口，chain.log / chain.err.log）
  → `tools/_launch-hell12h5.sh` → `tools/_supervise.sh input3-hell12h5 12 …`
- 训练参数见 `_launch-hell12h5.sh` 注释；要点：`--bcmix 0`（追球归 prior）、
  `--lr0/--lr1 1e-5`、`--sel-ref hell --end hell`、adam+clip2+layerlr、
  课程 `default:0.25,hell:0.45,grandslam:0.15,hell:0.15`、`--no-save`。
- 启动即读到：基线 default=96.9 / hell=93.2，bestScore=94.1，BC 已压到 0%，
  预填回放 500 回合 / 43930 样本 / 胜率 93%，进入课程 1/4（default 25%，ep 0-2250）。
- **Windows 侧看门狗** `tools/_watchdog-hell12h5.ps1`：每 300s 看一眼
  `data/checkpoints/<run>/index.json` 的 `elapsedSec` 与进程命令行；
  守护不在、收尾不在、没叫停、预算没满 → 用 `Start-Process` 重拉整条链路。
  PID 记在 `tools/logs/input3-hell12h5.watchdog.pid`。
  叫停：`touch data/.stop/input3-hell12h5.sup`（看门狗与守护都响应）。

### 踩坑：PowerShell 5.1 读无 BOM 的 UTF-8 `.ps1` 会解析失败
看门狗脚本第一次跑直接 `TerminatorExpectedAtEndOfString` 退出码 1 ——
中文注释里的字节被当成 ANSI 码页，中断了解析。**写 `.ps1` 必须带 UTF-8 BOM**
（`fs.writeFileSync(p, '\uFEFF' + text)`），否则中文一进去就炸。

### 踩坑（危险）：不要用命令行文本去匹配自己的宿主进程
`Get-CimInstance Win32_Process … Where-Object { $_.CommandLine -like '*_watchdog-hell12h5*' }`
会**连我自己的 shell 包装进程一起匹配上**（它的命令行里就含这段脚本名），
`Stop-Process -Force` 把自己杀掉 → 整条命令退出码 255、无输出。
正解：脚本启动时把 PID 写进文件，要停就按文件读 PID。
另外这台机器上还有**别人的**后台 PowerShell 作业（`X:\wfls\research\r103` 的几个
`ck*.py`），**不要动**。