# phase5-findings — 第 5 轮：12h 续训「地狱 AI」

> 任务：研究并续训 12h 的地狱 AI，增强其实力，做好防中断措施，若实力增强则烘焙。
> 本文件是第 5 轮的完整研究记录。前 4 轮见 `phase4-findings.md`。
> 结论先行：**前 4 轮失败的根本原因不是训练不够久，而是网络被训成了「拍面停在中间」**。
> 本轮修掉的是代码缺陷，不是超参；12h 训练只是在这之后才第一次有意义。

---

## 0. 一句话结论

用脚本脑实测（`tools/live-match.js --brain`）：

| 决策方式 | vs 地狱 胜率（实机 30 局） | 说明 |
|---|---|---|
| `centre`（tx ≡ 0，拍面钉在中间） | **0.4 %** | |
| `naive`（tx = 球当前 x） | **22.8 %** | 现行 BC 的示范目标 |
| `chase`（tx = x + vx·τ，预测拦截点） | **40.1 %** | |
| 线上权重 `input3-12h/ckpt-008500` | 8.7 ~ 11.7 % | 现行烘焙产物 |
| `prior`（网络出 my/ctrl/旋转，横向交给规则） | **32.1 %**（τ 修复后基线为 8.7 %） | 已落进 `js/input-agent.js` |

**横向追踪本身就是瓶颈。** 拍面速度不是（见 §2）。修好 τ 之后，「拍面停中间」的网络从 8.7 % 变成 32.1 %，一行训练都不需要。

---

## 1. 四个 12h 轮次的账

| 轮 | 起点 | default | **hell** | grandslam | 结果 |
|---|---|---|---|---|---|
| 基线（线上） | `input3-12h/ckpt-008500` | 35.4 % | **11.7 %** | 35.4 % | 已烘焙 |
| r3 `input3-hell12h` | 同上 | 35.4 % | 11.7 % | 35.4 % | 白跑（选优口径错） |
| r4a `input3-hell12h2` | 同上 | — | 2.6 % | — | 白跑（选优口径错，模型训崩） |
| r4b `input3-hell12h3` | 同上 | 38.6 % | 5.0 % | 36.4 % | 门禁 B 失败，**未烘焙**（正确） |

r4b 的训练胜率 50.4 % → 21.6 % **单调下降**，`best` 只动过一次（ep 2250）然后 8300 回合不动。
说明：**不是没学会，是学成了坏的，而且选优忠实地记录了这一点**。

前 4 轮共烧掉约 48 机时。

---

## 2. 为什么「拍面速度」不是瓶颈（实测）

`js/input-sim.js#padControl`（与实机 `main.js#playerControl` 同公式）：

```js
const rate = C.MOUSE_PACE != null ? C.MOUSE_PACE : 18;      // constants.js: MOUSE_PACE=18
pad.x += (tx - pad.x) * Math.min(1, dt * rate);
```

60 Hz 下 `dt*rate = 0.30` —— 每帧吃掉 30 % 的残差，时间常数 τ = 1/18 s ≈ 0.056 s。
从 −0.9 冲到 +0.9 只需 **7 帧 ≈ 0.15 s**。
而接触窗口是 `|bx − px| ≤ PAD_HW 0.10 + BALL_R 0.02 + fitH(0.17…0.22) ≈ 0.29…0.34 m`。

结论：**只要 `tx` 给对了，拍面一定能到。给错了，拍面永远停在中间。**

## 2.1 被证伪的三个假设（不要再走回头路）

| 假设 | 证伪方式 | 实测 |
|---|---|---|
| 深度旋钮卡在中位 → 打不到球 | `tools/_diag_depth.js`，20 局实机 | my 均值 0.427 / 众数 0.462 / 94.6 % 前倾；基线 0.529 / 0.462 / 83.1 %。**深度没卡** |
| padControl 速度太慢 | 算式 + `--brain chase` 达 40.1 % | **不是瓶颈** |
| 选优分被 default 主导 | 读 `train-input3.js` L179-190 `selScore` | `SEL_W=[0.45,0.30,0.25]`、第二项锁 `SEL_REF`、顶项是 `wrMap[opt.end]`，`--end hell --sel-ref hell` 下就是 `0.75·hell + 0.25·default`。**口径正确** |

三者共同的表象都是「够不到球」，所以很容易被误判成同一个病。真正的共同根因是
**tx 均值只有 0.118 ~ 0.126（中位数 0）—— 网络根本不横向追踪**。

---

## 3. 网络为什么停在中间（`_diag_argmax.js` 实测）

在真实来球观测上扫球的 x，打印 argmax 动作与 Q：

```
   bx    tx(决策)   my    ctrl   mxI   Q(argmax)  Q(追球心)    Δ
 -1.20   -0.027  0.923  true    16    0.5699    0.2190   0.3508
 -0.80   -0.136  0.462  false   14    1.1743    0.0079   1.1663
  0.00   -0.027  0.462  false   16    2.5464    2.5464   0.0000
 +0.60   -0.027  0.923  true    16    0.6388    0.3001   0.3387
 +1.20    0.900  0.462  false   33    0.9646    0.9646   0.0000
tx 均值 0.166 · 回归斜率 d(tx)/d(x) = 0.421 · tx 唯一取值数 = 4（34 个可选里只用 4 个）
```

两个硬事实：

1. **34 个鼠标 X 只用了 4 个**（≈ −0.14 / −0.03 / +0.14 / +0.90）。球在 |x| < 0.8 时拍面只会在 ±0.14 m 内晃，够不到 ±0.29 m 的窗口。
2. **连球在 x = −1.2 时都不去 −0.9**，但球在 +0.8 就猛冲 +0.9 —— 单边、非对称的塌缩。

`--brain centre`（tx ≡ 0）实机 0.4 %，与这个网络的 8.7 % 几乎一样：**这个网络基本等价于「拍面钉在中间」**。

---

## 4. 缺陷 A：τ 与「预测拦截点」算在了半程的另一半（`js/input-agent.js`）

原代码：

```js
const tauS = (vz < -0.05 && pz - z > 0) ? Math.min(1.5, Math.abs((pz - z) / vz)) : 0;
```

球朝拍面来时的条件是 `(pz − z)·vz > 0`（玩家侧 pz − z > 0 且 vz > 0）。而 `vz < -0.05` 恰恰是**球正在离拍面走**。

于是**玩家必须拦球的那一整段，τ 恒为 0**，`encodeObs` 的第 21 ~ 24 维（τ01、预测拦截 x/y/z）塌成「当前位置」，零预判。实测（球 x=0.8, pz=1.32, z=0.5）：

| vz | #21 tau01 | #22 (x+vx·τ)/1.2 | #23 (y+vy·τ−.46)/.8 |
|---|---|---|---|
| +3.2（来球） | **0.000** | 0.667 | 0.575 |
| +1.2（来球） | **0.000** | 0.667 | 0.575 |
| −1.2（离拍） | **0.456** | 0.667 | 0.233 |
| −3.2（离拍） | **0.171** | 0.667 | 0.447 |

**修法（一行）**：

```js
const closing = (pz - z) * vz > 0 && Math.abs(vz) > 0.05;
const tauS = closing ? Math.min(1.5, Math.abs((pz - z) / vz)) : 0;
```

第 122 维的 one-hot 同步改为 `closing ? 1 : 0`。

> ⚠️ 这改了 4 个输入维的语义，**旧权重在这 4 维上学的东西全部作废**。所以不该无脑热启动（§7 说明为什么最后仍然选了热启动）。

## 缺陷 B：BC 的示范目标追的是「现在的球」而不是「该去的点」（`tools/train-input3.js`）

```js
// 旧
const naiveCmd = (o) => ({ tx: Math.max(-0.9, Math.min(0.9, o.x || 0)), my: 0.5, ctrl: false });
```

`tx = clamp(球当前 x)` 是**滞后量**。而 `js/input-sim.js` 里早就有正确答案 —— `playerReceive` 开头算了
`predBX = SIM.predictXAtZ(from, vel, spin, PLAYER_Z)`，却只喂给 `stanceOf`，**从不让 agent 看见**。

`--brain naive` 22.8 % vs `--brain chase` 40.1 %，就是这一行的 17 pp。

## 缺陷 C：BC 损失在 1904 维输出上是「全局下沉机」

```js
// 旧
const tgt = new Array(o.nActions).fill(0); tgt[p[1]] = bcBoost;   // 1903 个别的动作全被往 0 拉
```

TD 的真值是 `+3·γᵏ`（远大于 1.6），所以每一步 BC 都在对**所有学到的好动作**施加净负梯度。
12 h × 72 000 次这种更新。`imitate()`（BC 预训练入口）有一模一样的病。

## 缺陷 D：`--bcmix 0` 根本关不掉 BC

```js
// 旧
const bcMix = (bcPairs && bcPairs.length) ? Math.max(4, ((o.bcMix ?? 0.2) * o.batch) | 0) : 0;
//                                          ^^^^^^^ 0 × batch 还是 4
```

传 `--bcmix 0` 仍然每 64 个样本塞 4 个 BC（6.25 %）。**已修**（见 §6）。

---

## 5. 硬目标 BC 在这个网络上**学不动** —— 四组实测

| 手段 | 结果 |
|---|---|
| 硬目标 + SGD（`_t4.txt`） | N=1 → q 6.6e15；N=10 → **qmax 3.7e93**；N=50 → **3.3e90**。**发散** |
| 硬目标 + Adam/clip2/layerlr（`_t5.txt`） | 稳定（qmax 0.18）但**卡死**：N=200 命中率 17 %，50 epoch 与 300 epoch 完全一样 |
| 随机确定性标签 520 条（`_diag_bc_fit`） | 0 ~ 1 %，所有 lr × epoch 组合全灭 |
| 单纯 raise-only | 所有「当过示范」的单位都饱和到 1.6 → 全行相等 → argmax 由噪声决定 |

SGD 的 `|d| < 100` 输出钳位救不了，因为爆炸发生在 ReLU 隐层里。
**这解释了 r4 训练胜率单调下跌、`learn()` 的 NaN 重置，以及为什么每一轮配置都得挂 `--optimizer adam --grad-clip`。**

改成**两点排序更新**（`imitate()`，只动 2 个输出单位而不是 1904 个）：

```js
const want = Math.max(q[action], b);
let bj = -1, bv = -Infinity;
for (let i = 0; i < n; i++) if (i !== action && q[i] > bv) { bv = q[i]; bj = i; }
const tgt = q.slice();
tgt[action] = want;
if (bj >= 0 && (want - bv) < b) tgt[bj] = bv + (want - bv) * 0.5;   // 只把当前亚军压到中点
```

命中率确实开始爬（3.3 % → 6.7 % → 10.0 %，lr 0.01，6 epoch；旧版第 1 个 epoch 后就冻结）。

## 5.1 但 BC 预训练这条路依然**被证伪**

| 网络 | argmax 命中率 | 实机 vs 地狱 |
|---|---|---|
| 线上权重 | — | 8.7 % |
| 线上权重 + 12 epoch 追球 BC | 3.3 % | **0.0 %** |
| 随机初始化 + 6 epoch 追球 BC | 10 % | **0.0 %** |

120 个状态、1904 维输出上的监督训练只会把已有策略搅烂，永远学不会追球规则。
**所以本轮没有把 12h 花在 BC 上。**

---

## 6. 本轮实际落地的设计：`lateralPrior`（横向先验）

```js
// js/input-agent.js，模块级，紧邻 nearestAction
function lateralBinOf(obs){
  const z = obs.z || 0, vx = obs.vx || 0, vz = obs.vz || 0;
  const pz = (obs.pz != null) ? obs.pz : 0;
  if (!((pz - z) * vz > 0 && Math.abs(vz) > 0.05)) return -1;   // 不该干预
  const tau = Math.min(1.5, Math.abs((pz - z) / vz));
  let tx = (obs.x || 0) + vx * tau;
  if (tx > 0.9) tx = 0.9; else if (tx < -0.9) tx = -0.9;
  let b = 0, bd = Infinity;
  for (let i = 0; i < IN_MX.length; i++){ const d = Math.abs(IN_MX[i] - tx); if (d < bd){ bd = d; b = i; } }
  return b;
}
// bestAction 末尾
const a = ties[(rng() * ties.length) | 0];
if (o.lateralPrior === false) return a;                  // 回滚开关
const lb = lateralBinOf(obs);
if (lb < 0) return a;                                    // 球在飞离 / 待发球 → 保持网络原意
if ((a >> 2) / 14 === lb) return a;                       // 本来就追对了，不动
return ((lb * 14 + ((a >> 2) % 14)) * 2 + ((a >> 1) & 1)) * 2 + (a & 1);
```

要点：

- **只覆盖 `mxI`**（横向），`my` / `ctrl` / 上旋下旋全部交给网络 —— 这正是 TD 能学的东西。
- **`pz` 缺失时按 0 处理** ⇒ `closing` 为假 ⇒ 返回 −1，构造上安全（待发球时 obs 里没有拍面）。
- **默认开**，`setLateralPrior(false)` / `o.lateralPrior === false` 可一键回滚。
- 冒烟验证：bx 从 −1.2 到 +1.2，tx 依次 −0.900 / −0.791 / −0.409 / −0.027 / +0.409 / +0.791 / +0.900（完美追踪），而 `my`/`ctrl` 仍随网络变化（最左侧 0.92/true）；球飞离（vz −3.2）时保持网络自己的 tx。

配套改动：

| 文件 | 改动 |
|---|---|
| `js/input-agent.js` | 缺陷 A（τ）、缺陷 C（BC 改 raise-only）、`imitate()` 两点排序、`--bcmix 0` 变成真开关、`lateralPrior` + `setLateralPrior`/`getLateralPrior` |
| `tools/train-input3.js` | 缺陷 B：`naiveCmd` 改为追预测拦截点 |
| `tools/live-match.js` | 新增 `--brain {centre,naive,chase,prior}` 与 `--no-prior` |
| `tools/bake-input.js` | **argv 整槽偏移 bug**（见 §9）+ LIVE 数值校验 |

---

## 7. 新基线（必须重建，见 phase4 #17）

τ 修复 + prior 落地后，线上权重的**实机**表现已经完全不同：

| | default | hell | grandslam | 加权(0.75·hell+0.25·default) |
|---|---|---|---|---|
| 旧基线（prior 前） | 0.354 | 0.117 | 0.354 | 0.1427 |
| **新基线（prior 后）** | **0.886** | **0.381** | **0.905** | **0.5073** |

新基线写进 `tools/logs/baseline-live.json`（旧文件归档为 `baseline-live.v4-archive.json`，标注「已作废」）。
`liveOld` 块保留了 prior 前的 0.354 / 0.117 / 0.354。
`lossReasons`：noreach 90 / out 51 / serve 25 / net 6（共 172）—— **noreach 从 95 % 掉到 52 %**。

**如果还用旧基线，门禁 A 会白送通过。** 这是本轮最容易犯的错。

## 8. 仿真已经饱和（phase4 #15 的加强版）

| | default | hell |
|---|---|---|
| 修复前 | 70.6 % | 11.5 % |
| **修复后** | **96.9 %** | **93.2 %** |

`selScore` 基线 94.1，天花板 100 —— **动态范围从 58.6 压到 5.9 分**。仿真的排序能力接近随机。

⇒ **仿真只能用来「排序候选」，绝不能用来「判定通过」**；接受判定必须走实机。
⇒ `--topN` 由 3 提到 4；`_finalize-12h.js` 对前 N 个候选逐个跑实机，按实机分挑。
⇒ 12h 的成败几乎完全押在 `_finalize-12h.js` 这一步，所以 `bake-input.js` 的调用参数必须先修好（§9）。

## 8.1 演练抓到的第三个「最后一刻」bug：闸门 C1 的参照物是空的

用 `_finalize-12h.js` 对一个假 run 目录做 `--dry-run` 演练（`_finsmoke`），输出：

```
闸门 A：实机加权分 48.92% vs 基线 50.72% ✗ -1.80pp
闸门 B：vs地狱 33.3% vs 基线 38.1%   ✗ -4.80pp
闸门 C1：worst|Δ| 54.7pp ≤ 基线 0.0pp + 3pp     ✗
闸门 C2：worst|Δ| 54.7pp ≤ 45pp               ✗
```

`基线 0.0pp` 是假的。新基线当初是 `--live-only` 测的，仿真值只从训练器抄了 3 局冒烟采样，
于是 `baseline-live.json` 的 `delta` 全 `null`、`worstDelta` 全空，
而闸门读的是 `Math.abs(base.worstDelta || 0)` → **0**。

于是 C1 退化成「候选 |sim−live| 必须 ≤ 3pp」。仿真已饱和到 93~97%、实机只有 38~89%，
**任何候选的 |Δ| 都在 30~60pp，C1 永远不可能通过 —— 12h 会在最后一步被判「未达标」白跑。**
和 §9 的 argv 偏移是同一类病：**训练本身没事，死在验收环节。**

修法两条：

1. `tools/_refresh-baseline.js`（新）用 finalize 自己的口径重测基线，sim/live/delta 一次填全，
   并写出 `worstDelta`；本次实测 `worstDelta ≈ -55pp` ⇒ C1 上限变成 58pp，重新可判定。
2. `tools/_finalize-12h.js` 里加了结构护栏：基线 `worstDelta` 为空时 **C1 直接判不通过**
   （而不是拿 0 当参照物），打印修法命令，并且 `--bake-anyway` 也不能绕过它。

> **教训**：验收脚本本身要用演练跑一遍。用一个假 run 目录 + `--dry-run` 花两分钟，
> 换来的是「12h 不会在最后一步崩掉或白跑」的确定性。本轮两次「最后一刻」的坑
> （`bake-input.js` 下标偏移、闸门 C1 空参照）**都是这样抓到的**，
> 而两者都不可能在训练日志里看出来。

---

## 9. `bake-input.js` 的 argv 整槽偏移（差点让 12h 在最后一步崩掉）

```js
const argv = process.argv.slice(2);   // argv[0] = <src.json>，可选参数从 argv[1] 开始
```

而函数体读的是 `argv[2] … argv[6]` —— **整体错了一格**。三个后果：

1. `evalHell` / `evalDefault` 被交换，第二个还成了 `NaN` → 序列化成 `null`；
2. `opp` 收到的是 `ladderLive` 的 JSON 字符串；
3. `_finalize-12h.js` L318 是 `execFileSync('node', ['tools/bake-input.js', path, evHell, ...])`，
   于是 **`src` 解析成了脚本自己** —— `existsSync` 通过、`JSON.parse` 一个 .js 抛 SyntaxError，
   **12h 训练结束后会在烘焙那一步当场崩掉**。

已修为 `argv[1..5]`，并加了硬校验：`evalHell` / `evalDefault` 必须是 0..1 的有限数，否则拒绝烘焙并打印原始值。
用 finalize 完全相同的 `execFileSync` 调用形状验证通过。

线上权重的 `INPUT_AI_META` 已用**实机**数值重烘焙（权重字节未变）：
`evalDefault 0.886`、`evalHell 0.381`、`opp 'ladder-parity-input3-12h-ep8500+lateralPrior'`、
`ladderLive{seed:20261004, games:30, byTier{default .886, hell .381, grandslam .905}}`、`simEval{default .969, hell .932}`。
（此前线上 meta 挂的是**仿真**值 0.6156 / 0.1822，而实机只有 0.354 / 0.117 —— phase4 #16 的修复在代码里，但这批权重早于它。）

---

## 10. 轮速与预算：又烧掉一轮才发现

第 1 个 round 实测 **3069 s ≈ 51 min**（250 训练回合 2084 s + 3 档 90 局验证 985 s）。
r4 是 ~17 min/round，现在慢 3 倍 —— **因为球终于被打回去了**：以前 95 % 的对局是 `noreach` 秒丢球，现在回合很长，每回合帧数与 TD 更新数都上去了。

两条由此产生的硬事实：

1. **预算只计训练时间**：`elapsedSec` 第 1 轮后是 2084，trainer 打印 `剩11h25m` = 43200 − 2084。**验证时间不计入预算。**
2. **课程表的边界是 `--games` 的分数**（`evalAtPhase = PHASES.find(p => g < p.to * opt.games)`，L166）。

于是首版 `--games 9000` 是错的：`default` 段 = 回合 0–2250 = **第 1–9 轮 ≈ 7.6 h**，而 `default` 已经是 98.3 % —— 7.6 h 学不到任何东西，只剩 4.4 h 给 `hell`。
**这是预算分配 bug，不是强度不够。**

已改为 **`--games 3200`**（12.8 轮 ≈ 11.1 h 挂钟，trainer 跑完自己正常退出）：

| 段 | 回合区间 | 轮数 | 约 |
|---|---|---|---|
| default | 0–800 | 3.2 | 2.7 h（护栏） |
| **hell** | **800–2240** | **5.8** | **4.9 h（主战场）** |
| grandslam | 2240–2720 | 1.9 | 1.6 h |
| hell | 2720–3200 | 1.9 | 1.6 h |

`hell` 占 60 % ≈ 7.7 h，且 3/4 落在主段而不是拖在尾巴上。

## 10.1 监督器有一个会误杀健康进程的窗口

`_supervise.sh` 靠内容判挂：`index.json` 的 `elapsedSec` 连续 N 轮轮询不变就算挂（免疫 phase4 #18 的时钟跳变）。
但 `index.json` **一个 round 才写一次**。原来的 `SUP_BOOT=1500`（25 min）+ `SUP_STALL=1800`（30 min）
对着 51 分钟一轮 —— **健康进程会在第一轮结束没多久被判定挂掉并杀掉**。

已改为 `SUP_BOOT=3600` / `SUP_STALL=5400`，都严格大于实测的 3069 s。

---

## 11. 防中断（四层）

1. **`tools/_supervise.sh`**：非零退出 / 被杀 且 `elapsedSec` 未超预算 → 自重启（最多 400 次）；
   内容式挂起检测；trainer 侧哨兵 `data/.stop/<run>.stop`；检查点 tmp + rename 原子写；
   停止用 `data/.stop/<run>.sup`（监督器自己的标志，绝不与 trainer 抢同一个文件）。
2. **`tools/_watchdog-hell12h5.ps1`**：300 s 轮询，只在「监督器不在 + finalize 不在 + 无 .sup 标志 + `elapsedSec < 43200`」时整链重启。
   自己写 PID 文件 `tools/logs/<run>.watchdog.pid`。
3. **trainer 侧 `--resume`**：每轮一个 `index.json`，中断后从 `best-*.json` 起、带 `elapsedSec` 续预算。
4. **结束时自动 `_finalize-12h.js --topN 4`**，门禁 A/B/C1/C2 全过才烘焙，否则 `js/input-weights.js` 原样不动（退出码 2）。

手动停：`touch data/.stop/input3-hell12h5.sup`

## 11.1 Windows 侧的三条地雷

- **PowerShell 5.1 解析不带 BOM 的 UTF-8 `.ps1` 会崩** —— 中文注释直接报 `TerminatorExpectedAtEndOfString`。写文件必须加 `\uFEFF`。
- **绝不要按命令行文本匹配来杀进程** —— `Where-Object { $_.CommandLine -like '*_watchdog-hell12h5*' }` 会连 shell 工具自己的 wrapper 一起匹配上，`Stop-Process -Force` 把它杀了（exit 255、无输出）。只能用 PID 文件 / 显式 PID。
- **`taskkill /F /T` 不跟随 `exec` 出来的子进程** —— 只杀掉 wrapper 与链脚本，被 exec 的监督器和 trainer 得单独按 PID 杀。
- 这台机器上还跑着**别人的**后台作业（`X:\wfls\research\r103`、若干 `ck*.py`），不要碰。

## 12. 本轮的 12h 配置

```
bash tools/_supervise.sh input3-hell12h5 12 data/checkpoints/input3-12h/ckpt-008500.json \
  --run-name input3-hell12h5 --end hell --sel-ref hell \
  --games 3200 --step 250 --eval 30 --vallevels default,hell,grandslam \
  --ckpt 250 --keep 16 --no-save \
  --optimizer adam --layer-lr 1,1,1,3 --grad-clip 2 \
  --lr0 0.00001 --lr1 0.00001 --eps-reset 500 --bcmix 0 \
  --curve data/checkpoints/input3-hell12h5/curve.json \
  --phases 'default:0.25,hell:0.45,grandslam:0.15,hell:0.15'
```

- 起点 = 线上权重 = 旧 finalize 基线。
- **`--bcmix 0`**：横向已经由 prior 接管，在线 BC 只会跟 TD 抢 `my`/`ctrl`。
- `--no-save`：训练期间绝不碰 `js/input-weights.js`。
- prior 生效后，剩下的败因是 **`out`（打到了但打错）**，正是 TD 该修的 —— `--brain chase` 的败因构成是 noreach 47.5 % / **out 52.5 %**。

---

## 13. 下一步

1. 盯 `data/checkpoints/input3-hell12h5/index.json` 的 `best` / `curve.json` 是否有 ★（尤其进 `hell` 段之后）。
2. trainer 退出后 `_finalize-12h.js --topN 4 --top hell --opp default,hell,grandslam` 自动接手；
   **门禁 A（实机加权 > 新基线 0.5073）与门禁 B（实机 vs 地狱 ≥ 0.381）都过才烘焙。**
3. 过 → `bake-input.js` 写 `js/input-weights.js`，再跑一次实机确认 meta 里的数是真机数。
4. 不过 → 保留现有权重，本轮照样算成功（**诊断链条是真正的产出**）。