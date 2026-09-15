# 训练可视化控制台 — 实施计划

零 npm 依赖：`node server.js` 起服务，浏览器里点击启动训练、SSE 实时看曲线、回放历史。

- 训练台：<http://127.0.0.1:8123/train>
- 游戏本身：<http://127.0.0.1:8123/>（由同一服务托管，`file://` 打开也不受影响）

## 1. 架构

```
L:\tt_game
├── server.js                    [新] 零依赖 node:http 服务 + SSE，端口 8123
├── train.html                   [新] 训练控制台单页
├── css/train.css                [新] 控制台样式（沿用 base.css 暗色变量）
├── js/train-ui.js               [新] 前端：SSE 解析 + Chart.js 驱动
├── js/telemetry.js              [新] 共享打点器（浏览器/Node 双用，TT_TELEMETRY 门控）
├── tools/model-registry.json    [新] 模型清单（脚本、参数范围、预设、曲线 schema、配色）
└── index.html                   不改，由 server.js 一并托管
```

### API

| 方法 | 路径 | 作用 |
|---|---|---|
| GET | `/` `/train` `/<静态>` | 静态托管（`safeJoin` 防穿越，禁 `.exe/.bat/.cmd/.ps1`，单文件 ≤32MB） |
| GET | `/api/models` | 读 `tools/model-registry.json` |
| POST | `/api/run` | `{model,args,flags,rawArgs,dryRun}` → spawn `node tools/<script>`，注入 `TT_TELEMETRY=1` |
| GET | `/api/events/:id` | SSE：`tick` / `line` / `phase` / `exit`，先重放缓冲再推增量，25s 心跳 |
| POST | `/api/stop/:id` | SIGTERM，2s 未退 SIGKILL |
| GET | `/api/runs` | 运行中 + `data/runs.json` 最近 30 次（含降采样 `pts`，可复绘） |
| GET | `/api/curves` `/api/curve?path=` | 扫描并载入 `*curve*.json` |
| GET | `/api/loglist` `/api/log?name=` | 根目录 `train-*.log/.err` |
| GET | `/api/meta` | 正则抽取 `LEARNED_META` / `GRANDSLAM_META` / `INPUT_AI_META` |
| GET | `/api/health` | 存活与运行时信息 |

### 打点协议

训练器每代/每 ep 追加一行带前缀 JSON，原有 `console.log` 全部不变：

```
##TT##{"t":"gen","gen":3,"fit":0.6632,"fDef":0.7653}
```

`t` 取值：`gen`（GA 代）/ `ep`（RL 轮）/ `bc`（行为克隆 pass）/ `phase`（阶段）/ `smoke` / `verify` / `done`。
服务端按 `##TT##` 切分，打点行不进可视日志。`TT_TELEMETRY` 未设置时 `tick()` 静默 → 命令行行为零变化。

## 2. 模型清单（`tools/model-registry.json`）

| id | 名称 | 脚本 | 曲线 | x 轴 | 主要指标 |
|---|---|---|---|---|---|
| `selfplay` | 自对弈 GA（含大满贯档） | `tools/train.js` | `tools/train-curve.json` | `gen` | fit / best / fDef / fPush / fPlayer |
| `hell` | 地狱 AI 续训 | `tools/train-hell.js` | `tools/train-hell-curve.json` | `gen` | fit / best / min / fPB / fDef / fSelf / fPush |
| `input` | 输入级 DQN v1 | `tools/train-input.js` | `tools/input-curve.json` | `ep` | evalW / bestW / trainW / eps(右轴) |
| `input2` | 输入级 DQN v2 稳定化 | `tools/train-input2.js` | `tools/input-curve-v2.json` | `ep` | evalHell / evalDef / bestH / trainW / eps(右轴) |

每个模型含：`params`（name/label/type/default/min/max/step）、`flags`、`presets`（冒烟/快速/标准）、
`dryRunArgs`、`writes`（会覆盖哪些产物，用于 UI 警示）、`series`（key/label/color/axis）、`metaConst`。

## 3. 对现有训练脚本的轻量改动

| 文件 | 改动 |
|---|---|
| `tools/train.js` | 打点 6 处；新增 `--no-write`（跳过覆盖 `js/learned-policy*.js`，curve 仍写） |
| `tools/train-hell.js` | 打点 9 处（含 `verify`/`done`）；新增 `--no-write`（短路 `adopt`，永不覆盖）；curve 增加 `min`（种群最差） |
| `tools/train-input.js` | 打点 8 处；新增 `--step`（评估间隔，原硬编码 100）、`--no-save`；复用已有 `--no-bake` |
| `tools/train-input2.js` | 打点 3 处；新增 `--no-save`（含每 500 局检查点） |

统一约定：**UI 默认 dryRun**，实验不会打断游戏当前 AI；显式勾选「写入产物」才覆盖。

## 4. 前端（`train.html` + `css/train.css` + `js/train-ui.js`）

1. 顶栏：标题、`/api/health` 状态点、`← 返回游戏`
2. 模型卡片 ×4：色条 + 名称 + tag + `meta` 的 `trainedAt` / `evalDefault` / `evalHell` / `fitness`，点选高亮
3. 左栏：预设按钮组 + 参数输入（受 `min/max/step` 约束）+ flags 复选框 + dryRun 开关 + 启动/停止 + 状态灯 + ETA（`sec/gens` 线性外推）
4. 右栏：Chart.js 折线图，`animation:false` + `update('none')` + `decimation`，`eps` 走右轴 0~1
5. 底栏三 tab：**实时日志**（300 行 tail）／**运行历史**（`/api/runs`，点行用 `pts` 复绘）／**曲线历史**（`/api/curves`，支持 x 轴归一化做多训练叠加对比）
6. 打点归一化：x 取 `gen||ep||pass`；数值统一 `Number()` 兜底（历史 curve 文件里是字符串）
7. Chart.js 走 cdnjs；`typeof Chart === 'undefined'` 时顶部红色横幅提示离线不可用（与 index.html 的 three.js CDN 现状一致）

## 5. 阻断级修复（已定位）

| 位置 | 问题 | 修法 |
|---|---|---|
| `server.js:170` | `run.bestSummary()` 引用的方法已删除，训练结束抛 `TypeError`，`data/runs.json` 永远写不进 | 改为 `summarize(run.ticks, MODEL.get(run.model))`，并补 `pts: downsample(run.ticks, 1200)` |
| `server.js:394` | `sseOpen(run, res)` 与三参签名 `sseOpen(req, run, res)` 不匹配，SSE 打开即抛错，实时曲线推不出来 | 改为 `sseOpen(req, run, res)` |
| `server.js` `startRun` | **`path.join('tools', model.script)` 把 `tools/train.js` 拼成 `tools\tools\train.js`**，spawn 立刻退出 code=1，所有 `/api/run` 全挂、零打点 | 直接用 `model.script`（清单里本就是仓库相对路径），并加 `safeJoin` 校验防清单被篡改指向仓库外 |
| `tools/train-input.js:176` | **`lrCur` 从未声明**，`T.tick({... lr:+lrCur.toFixed(6)})` 抛 `ReferenceError`。参数表达式先求值，所以**不设 `TT_TELEMETRY` 也会崩**，命令行与 UI 全灭 | 在主循环内 `const lrCur = lr0 + (lr1 - lr0) * Math.min(1, g/opt.games)` 并传给 `agent.setLr(lrCur)` |
| `train.html` CDN | **Chart.js `4.4.3` 在 cdnjs 上不存在（404）**，`typeof Chart === 'undefined'` 恒真，图表永不渲染 | 改为 `4.4.1/chart.umd.min.js`（cdnjs 实测 200/196KB），并加 jsdelivr `document.write` 同步回退 |

### 5.1 非阻断级修复（验证时发现）

| 位置 | 问题 | 修法 |
|---|---|---|
| `tools/train-input2.js` | `opt.noSave` 被引用但**从未解析 `--no-save`**，且末尾存档无条件覆盖 → UI「实验模式」对 input2 完全失效 | 补 `--no-save` / `--pret` 解析（清单里已声明这两个参数）+ 末尾存档加 `if(opt.noSave)` 短路 + 补 `done` 打点（凑齐清单要求的 3 处） |
| `tools/model-registry.json` | flag `name` 用驼峰（`noSave`/`noBake`/`evalOnly`/`noMix`），而脚本解析连字符 → UI 勾选被静默忽略 | 统一为 `--no-save`/`--no-bake`/`--eval-only`/`--no-mix`；自写脚本交叉校验全部可达 |
| `js/train-ui.js` `xOf` | `num()` 无值时返回 `null`，而 **`isFinite(null) === true`**，兜底分支永不触发 → 读数显示「最新 null」 | 改为 `n !== null && isFinite(n)` |
| `js/train-ui.js` | 训练结束后图表标题停在「训练中」；`S.curvePoints` 从未赋值 → 「x 轴归一化」对历史曲线无效 | `exit` 事件里先 `plotModel` 再 `closeRun`；`loadCurve` 存 `S.curvePoints` |
| `server.js` `/api/health` | `runs: runs.size` 统计的是**历史全部 run**，UI 显示「服务正常 · 4 个 run」误导 | 改为统计 `status==='running'`，另加 `total` 字段 |
| `server.js` 静态缓存 | **`.js` 走 `max-age=300`，改完 `train-ui.js` 后 5 分钟内浏览器一直用旧代码**（本轮实测：性能 API 显示 `transferSize:0 / fromCache:true`，连命令预览都显示过期内容） | `.html/.js/.css` 统一 `no-store`；权重 json、图片、音频仍保留 5 分钟缓存 |
| `server.js` `buildArgs` + `js/train-ui.js` `cmdText` | flag 去重前，清单默认勾选 + `dryRunArgs` 会重复出同一参数（`--no-bake --no-save --no-bake --no-save`） | 两侧用同一套「只看布尔 flag、去重但不动 params/rawArgs」的逻辑，保证实际命令与 UI 预览一致 |

## 6. 验证结果（2026-09-08 全绿）

1. **语法**：`node --check` 通过 server.js / telemetry.js / train-ui.js / train.js / train-hell.js / train-input.js / train-input2.js
2. **打点门控**：`train.js --smoke` 不设变量 → `##TT##` 0 行；`TT_TELEMETRY=1` → 正常输出 phase/smoke/gen 打点
3. **冒烟**：`train.js --smoke`、`train-hell.js --smoke`、`train-input.js --smoke` 三连通过，原逻辑未破坏
4. **CLI 行为零变化**：`train-input.js` 不设变量跑完整个 RL 循环 exit=0，0 行 `##TT##`，无异常（已越过原先崩在 `lrCur` 的那一行）
5. **API 探测**：`/`、`/train`、`/api/health|models|runs|curves|curve|loglist|log|meta` 全部 200；`/api/nope` 404 JSON
6. **静态资源**：train.html 3 个 + index.html 23 个本地资源全部 200 且 MIME 正确，无 404
7. **路径安全**：对 ROOT 之外的哨兵文件做 6 种穿越尝试（原样编码、双重编码 `%255c`、`../` 链、深层链、目录拼接、仅文件名）全部 404，**无法逃逸 ROOT**；`%2e%2e` 单段解码后由 `safeJoin` 正确 403
8. **`/api/run` 端到端**：SSE 推送 6/6 个 gen tick + 1 phase + exit code=0；`/api/stop` HTTP 200 且 run 从 live 消失；`data/runs.json` 落盘，每条含 `pts` 数组与 `best` 摘要；已结束 run 的 SSE 重放 6/6 tick
9. **浏览器实测**（IAB）：4 张模型卡片 + meta（trainedAt/fit/vs默认/vs玩家）+ 参数/flags/预设渲染；点「启动训练」后曲线实时生长（5 条 series、峰值读数、ETA 外推）；跑完标题变「已完成」、读数「最新 5」；`运行历史` 点行用 `pts` 复绘；`曲线历史` 载入磁盘 curve；`停止` 生效；4 个 tab 切换正常
10. **四个模型全部可跑**：selfplay / hell / input / input2 均经 `/api/run` 启动并打点。input 输出 `{"t":"ep","lr":0.00043,...}` 直接验证 `lrCur` 修复；input2 输出 `{"t":"bc","pass":2,"evalW":36.8}`
11. **dryRun 约定**：本轮全部 10 次 `/api/run` 均带 `--no-write/--no-save/--no-bake`，未覆盖任何生产权重

> ⚠ **发现但未改动**：`js/learned-policy.js` 当前内容是 2 代的弱策略（`trainedAt 2026-09-07`，vs默认 48.7%、vs玩家 35.3%），是上一轮会话在无 `--no-write` 时写入的，把真正的 100 代策略顶掉了。备份 `js/learned-policy.js.bak-20260810` 里的才是好策略（fit 0.6603、vs默认 64.65%、vs玩家 63.1%）。如需恢复：
> `cp js/learned-policy.js /tmp/learned-policy.weak.js && cp js/learned-policy.js.bak-20260810 js/learned-policy.js`

## 6. 验证

1. `node --check server.js` 等全部改动文件
2. `TT_TELEMETRY=1 node tools/train.js --gens 3 --games 4 --pop 4` → stdout 出现 `##TT##` 行；不设变量时不出现
3. `node tools/train.js --smoke`、`train-hell.js --smoke`、`train-input.js --smoke` 三连，确认未破坏原逻辑
4. `node server.js` → `curl.exe` 探测 `/api/health` `/api/models` `/api/curves` `/api/meta` `/api/runs`
5. `POST /api/run` 跑 GA 冒烟：SSE 流式推 tick、`/api/stop` 生效、退出后 `data/runs.json` 落盘含 `pts`
6. 浏览器打开 `/train`：曲线随训练生长、停止按钮生效、刷新后历史可回放、静态资源无 404

## 7. 实施顺序

1. 修 `server.js` 两处阻断 bug
2. `train.html` + `css/train.css` + `js/train-ui.js`
3. 按第 6 节验证；发现问题即修，直至 6 项全绿

### 7.1 完成情况（2026-09-08）

- 第 1、2 步：已全部完成（server.js / train.html / css/train.css / js/train-ui.js / js/telemetry.js / tools/model-registry.json）
- 第 3 步：第 6 节 11 项验证全绿（见 6 节）
- 过程中额外发现并修复 **3 处阻断级**（spawn 双写路径、`lrCur` 未声明、Chart.js CDN 版本不存在）+ **5 处非阻断级**缺陷，均已记入 5 / 5.1 节
- 全部改动文件 `node --check` 通过；registry 声明的 flag 与脚本实际解析已做自动交叉校验，无不可达项
- 新增产物：`data/runs.json`（运行历史，含降采样 `pts`）

---

## 8. 极端对手课程训练（2026-09-09）

目标：把「鼠标上的tt玩家」（输入级 DQN）从只打 `hell` 推到逐级更强的对手上继续练。

### 8.1 新增产物

| 文件 | 作用 |
|---|---|
| `js/opponent-ladder.js` | 极端对手阶梯（浏览器/Node 共用）：`default → hell → elite → extreme → extreme-max`，每级都是 `POLICY_DEFAULT` 的派生对象，可复现可插值；`pick()` 带抖动出亚型防过拟合，`schedule()` 按 progress 插值 |
| `tools/train-input3.js` | 课程续训器：从 `data/input-ai-a952.json` 续训，对手按 `--phases hell:0.20,elite:0.28,extreme:0.30,extreme-max:0.22` 调度；三路评估（本档/顶档/默认护栏）选最佳权重；`--eval-only` 只做阶梯标定 |
| `tools/input-curve-v3.json` | v3 训练曲线（含 `phase` 字段标记课程阶段） |
| `data/input-ai-extreme.json` | v3 权重产物（采纳线通过才写） |

对手强度轴（全部落在 `POLICY_KEYS` 声明的 min/max 内，不是作弊开关）：`moveSpeed`/`moveZ` 跑位上限、
`moveErr` 落点高斯散布、`loop/smash/def/counter/serve *Pace*` 速度倍率、`*Spin` 旋转倍率、`txErr*`/`awayProb`/`wide` 落点凶狠度。

### 8.2 阶梯标定（`data/input-ai-a952.json`，80 局/档）

| 对手 | 胜率 | 对手 | 胜率 |
|---|---|---|---|
| default | 70.9% | elite | 64.0% |
| hell | 71.8% | extreme | 58.6% |
| | | extreme-max | 62.0% |

阶梯单调有效：从 71.8% 逐级压到 ~59%，课程起点选 `hell`、终点选 `extreme-max` 有真实难度跨度。

### 8.3 本轮修掉的三个真问题

| 位置 | 问题 | 影响 | 修法 |
|---|---|---|---|
| `js/input-weights.js` | 烘焙的是 **238 动作**旧网（`trainedAt 2026-08-12`），而 `tt-player.js` 按 **952 动作**（34×14×2）建智能体并解码 | 实机「鼠标上的tt玩家」一直在用错误动作映射解 238 输出 → 输出垃圾输入，实际只有 ~21% 胜率 | 重新烘焙 ← `data/input-ai-a952.json`（唯一 952 兼容权重）；旧文件备份为 `js/input-weights.js.bak-238stale-20260909` |
| `tools/train-input3.js` | `loadInputAgent` 把 ε 置 0，续训前几百局全是贪心 | 完全不探索，学不到新东西 | 显式 ε 调度：基线 0.30→0.10 线性 + 每 `--eps-reset` 局注入 0.45 探索脉冲（半衰期 ~140 局） |
| `tools/train-input3.js` | 选优护栏初值 `bestDef=-1`（形同虚设）；**回放是空的**却每回合做 6 次梯度更新；ε 高达 0.25~0.30；每 100 局再做 3×6754≈2 万次「追球」BC 硬监督 + 每个 batch 混 35% BC | **150 局 vs 默认 71.9%→47.3%，60 局→39.9%**，且退化被当成"最佳"采纳 | ① **预填回放** `--preload`（贪心当前策略灌 500~800 回合 ≈1.5 万条样本），这是最关键的一步 ② `--learnp 2`（原 6）③ ε 降到 0.18→0.07 ④ 用基线初始化 `bestDef/bestMax/bestPhase/bestScore`，护栏第 1 块评估即生效 ⑤ 续训 `bcmix` 压到 0.06、周期性重锚默认关（`--bcpass 0`） ⑥ 连续 3 块评估远低于基线自动早停 |

另加：`tools/train-input3.js` 载入起点权重时**硬校验形状**（`nActions`/输入维/输出维 vs 当前 `ACT_N`/`OBS_N`），
不兼容直接退出并指出可用起点——仓库里 238 旧网与新网并存，之前全靠肉眼分辨。
`js/input-agent.js` 补 `setBcMix()`：存档里的 `o.bcMix=0.35` 无法从外部改，续训时是主要的策略冲刷源。

### 8.4 极端对手接入实机

`index.html` 加 `js/opponent-ladder.js`（紧跟 `policy.js`）+ 「极端对手 / 极端·满档」两个模型按钮与斗蛐蛐选项；
`policy.js#policyForModel` 支持 `extreme`/`extreme-max` → `OPP_LADDER.at(model)`（与训练器同源同一份配置）。
`diffPrecision` 对这两档保持 1.0：难度已全部编码进策略自身的 `moveErr`（0.009 / 0.004），再乘系数会让实机比训练对手更难、两边不同源。

### 8.5 附带优化

`js/input-sim.js` 的 `HITDBG` 每记球多跑一遍 `simulateFull` 只为统计，训练时白耗 ~20% 仿真开销。
改为 `TT_HITDBG=1` 门控（`HITDBG_SIM`），`diag-margin.js` / `diag-sweep3.js` 显式打开，回归验证计数不变。

### 8.6 续训有效性验证（300 局短验证，80 局/档独立种子终评）

`--preload 300 --learnp 2 --bcmix 0.06 --bcpass 0`：

| 对手 | 起点权重 | 训练后 | 变化 |
|---|---|---|---|
| default | 71.3% | 80.7% | +9.4 |
| hell | 72.0% | 80.8% | +8.8 |
| elite | 63.1% | 78.7% | +15.6 |
| extreme | 59.6% | 78.4% | +18.7 |
| extreme-max | 60.3% | 76.3% | +16.0 |

曲线全程 vs 最强对手都有 +16pp 以上净提升，且对默认策略没有退步（反而 +9.4pp），
说明课程对手**没有把策略带偏**，护栏与采纳线都没被误触发。
过程中 24 局评估出现 ±7pp 抖动是样本量噪声（SE≈3.1pp），不代表真实退化——80 局终评才是判据。

**两次踩到的坑（都已修进脚本）**：

1. **学习率衰减基准**：原来按 `g/games` 衰减，长跑在同样局数上仍停留在大步长
   （1500 局跑到 250 局时 lr 还是 0.000089，而 300 局短跑此时已降到 0.000046），
   续训重新失稳、vs 默认一路掉到 47.8%。改为固定 `LR_HORIZON = 600` 走完衰减。
2. **中段评估不能当判据**：40 局评估的样本噪声就有 ±10pp（同一轮内 63%~81% 来回摆），
   拿它做早停会错杀正在恢复的轮次。护栏（`bestDef` 初值 = 基线）已保证不会采纳退化权重，
   早停阈值放宽到「连续 4 块、差距 >18pp」只兜彻底崩掉的情形。

续训的复利机制：产物写 `data/input-ai-extreme.json`，下一轮用
`--from data/input-ai-extreme.json` 续接，采纳线相对上一轮基线判定，可无限堆叠。
训练结束会打印下一步的烘焙命令与续训命令。



### 8.7 正式长跑结果与控制台续训闭环（2026-09-09）

**900 局正式长跑**（`train-extreme.log`，起点 `data/input-ai-a952.json`，80 局/档终评）：

| 对手 | 起点权重 | 新权重 | 变化 |
|---|---|---|---|
| default | 71.8% | 74.4% | +2.6 |
| hell | 71.6% | 75.3% | +3.7 |
| elite | 63.4% | 68.1% | +4.7 |
| extreme | 60.3% | 68.6% | +8.3 |
| extreme-max | 59.9% | 73.2% | **+13.3** |

每一档都是净提升、无回归，采纳线通过 → 写 `data/input-ai-extreme.json`，
并已烘焙进 `js/input-weights.js`（`INPUT_AI_META.evalDefault 0.744 / evalHell 0.732`）。
`--eval-only` 复核：74.7 / 72.6 / 65.0 / 67.2 / 72.0%，与终评一致。

**控制台续训闭环**（`tools/model-registry.json` 的 `input3` 条目）：

- 参数补齐 `from` / `save` / `curve` / `preload` / `learnp`——前两个是续训入口
  （护栏基线就是 `--from` 那份权重，必须打赢自己才采纳），后两个是续训不失稳的
  必要条件（空回放 + 高更新率会把 Q 值打爆，见 8.6）。
- `curve` 提为参数：脚本无论是否采纳都会写曲线，冒烟预设指向
  `tools/input-curve-v3-smoke.json`，**不会覆盖正式曲线**
  （`tools/input-curve-v3.json` = 900 局长跑，已另存快照 `input-curve-v3-900run.json`）。
- `tools/train-input3.js` 默认 `--from` 改为 `data/input-ai-extreme.json`，
  即"直接继续加强"；`bestNet` 初值 = 起点权重，检查点只在选优更新后落盘，
  同路径就地晋升不会写坏产物。
- 已实测经 `POST /api/run` 启动：命令与手跑一致（含 `--no-save` 实验模式），
  SSE 打点 → 运行历史入库正常（`model: input3`、`status: done`、`code: 0`），
  且 `--no-save` 未触碰生产权重与正式曲线。

## 9. 仿真/实机一致性大修（2026-09-10）—— 8.7 的所有数字作废

**先说更正**：8.7 那张表里的 74.4% / 73.2% 全部是仿真内数字，而仿真在 5 处与实机物理
不一致，其中两处会**系统性给模型记功它打不到的球**。逐项对齐后，同一份权重、同一批种子
的胜率塌到 31.4% / 29.8%。完整实测见 `tools/phase1-findings.md`，
标定输出见 `tools/eval-after-phase1b.log`。

### 9.1 修掉的 5 处不一致（按影响排序）

| # | 不一致 | 旧仿真 | 实机 |
|---|--------|--------|------|
| 1 | 触球 `swept` 判据 | `bz > plane-zF`（球过拍面即算） | `_prev.z<=plane+zF && bz>plane-zF`（本帧真实穿越） |
| 2 | 发球过网高度 | `网顶+1球径` (0.9325) | `checkNet` 撞网带上限 `网顶+1.5球径` (0.9475) |
| 3 | 积分分辨率 | 单步 1/60 | 每帧 2 个 1/120 子步 |
| 4 | Magnus / 旋转衰减 | 4 处漏 z 分量、8 处全无 `s*=(1-0.05dt)` | 完整叉积 + 逐帧衰减 |
| 5 | 决策频率 | 60Hz | 15Hz（`constants.js` 单一 `DECIDE_SKIP=3`） |

`tools/diag-serve-legal.js`（新增，Node 确定性检验，500 发）：
修复前**两跳合法 390/500 = 78%，撞网 110 = 22%**；修复后 **500/500 = 100%，撞网 0**。
这 22% 就是实机里那批 `发球失误 · 两跳都在自己半台` / `发球出界`。

### 9.2 新基线（`tools/eval-after-phase1b.log`，5 档 × 600 局）

| 对手 | 8.7 报告 | 修正后 | 差 |
|---|---|---|---|
| default | 74.4% | 31.4% | −43.0 |
| hell | 75.3% | 32.0% | −43.3 |
| elite | 68.1% | 27.0% | −41.1 |
| extreme | 68.6% | 28.2% | −40.4 |
| extreme-max | 73.2% | 29.8% | −43.4 |

两个必须记住的新事实：

1. **这是弱模型，不是强模型。** 对每一档都输约 2:1。之前的"极端对手 73% 胜率"是仿真记账错误。
2. **阶梯已不区分难度**——五档全在 27–32%，非单调（default 反而最高）。
   "对弈更强对手来加强"这个训练策略的前提（阶梯真的逐级变难）目前**不成立**，
   需要先修阶梯区分度，再谈续训。

### 9.3 实机遥测（此前为零）

`js/tt-stats.js` + `/api/ttstats`（GET 聚合 / POST `sendBeacon`）+ HUD chip。
判分走 `rules.js#pointTo` 单一出口，每分刷新一次。已在页内验证 chip 渲染
`DQN 2:4 (33.3%) · 1 触球 / 擦网 0% · 对手 extreme-max`，
并给出仿真读不到的构成：决策数 `dec`、触球 `contacts`、动作分布 `txMean/txRange`、
按原因分类的 `lostBy`、判分原文（`出界!` / `对手未能回球` / `发球出界` / `发球失误…`）。
样本量仍小（单局 3–11 分），**不能当胜率用**，只用于看构成。

### 9.4 遗留问题（下一阶段头号目标）

1. **实机 AI 对手有磁吸，仿真对手没有。** `physics.js` 的 `canHit.ai && p.z<-magnetRangeZ`
   分支把球吸向 AI 拍面；仿真的 `aiReturn` 完全没有对手磁吸。这直接解释了方向性矛盾：
   仿真说"DQN 自己回球出界"（`recv-out-recv` 占 100%），实机说"AI 回球出界"。
2. 实机仍有零星发球失误（6 分样本 1 次），而 Node 检验 500 发 0 失误；
   剩余差异最可能是 `strikeServe` 实际出球点 x（由 DQN 当帧拍位决定）与检验里的 x0 分布不一致。
3. 训练触球条件 `bounced && v.z > 0.02`（`input-sim.js`）只允许弹跳后上升段，
   实机 `tryPlayerHit` 允许下降段拦截。`swept` 已修，相位限制仍在。
4. 上一轮声称"已逐一验证 6 个模型"的 `physics.js` 落点误差改动**实为零作用**：
   `aiPosErr` 写入后全仓库无人读取。已改为由 `ai.js#aiMoveShared` 在每板来球上升沿
   读取 `policyForModel().moveErr` 施加，并删除那段死代码。

---

## 10. 阶段 2：优化器 + 生产权重退化（2026-09-10）—— 9.3 的新基线仍有效，但权重本身是坏的

详细数据见 `tools/phase2-findings.md`。

### 10.1 头号发现：生产权重退化，9.4 的"阶梯无区分度"是假象

阶段 1 测的"五档全在 27-32% 且非单调"不是环境性质，是 `data/input-ai-extreme.json`
（09-08 训练）在新仿真下的表现。同一份权重 400 局/档标定两次：
31.3 / 32.6 / 26.4 / 27.7 / 29.3，与阶段 1 完全一致——基线没漂移。
但从它训练 300 局（adam+分层lr）后：42.6 / 41.5 / 36.8 / 38.0 / 38.6，
**阶梯重新单调**，五档全部 +9.3 ~ +11.3pp。

所以"先修一致性再推复杂度"的顺序对，但"阶梯没信号、对弈更强对手没意义"
这条作废。9.4 的遗留问题 1/2/3 全部降级：它们解释的是仿真-实机细节差异，
而真正的大问题是权重本身。

### 10.2 优化器（`js/dqn.js#mlpTrain`，全部 opt-in）

`mlpTrain(w,i,t,lr,opts)` 第 5 参可选。`mlpTrainOpts(o)` 未启用时返回 null →
走 `mlpTrainSgd`（原实现逐字保留）。新增 `optimizer:'adam'`、`gradClip`（全网络
2-范数，裁剪在形成 Adam 动量之前）、`lrScale`（每层乘子）。
Adam 动量存 `o.adamState`，**不进 serialize**。
`input-agent.js` 三处调用点 + `createDQN` 全部透传；`setOptimizer(patch)` 供续训
（`--from` 载入的存档 `o` 没有 optimizer 字段，只能加载后打补丁）；
`getTrainMode()` 供脚本断言。训练器新增 `--optimizer / --grad-clip / --layer-lr`。

梯度实测（`tools/diag-grad.js`，仓库第一次量梯度）驱动了这个改动：
- 输出层 `|d|<100` 截断触发率 **0.000%** —— 注释里唯一的稳定性机制在真实分布下从未生效，
  NaN 防护是"未验证"不是"有效"。
- 隐层梯度范数 30.8/21.8/23.5，输出层只有 2.9 —— 一个 lr 喂两种量级，输出层欠驱动 10 倍。
- 单元素最大 |g| = 411，而权重 RMS 范数 0.087 —— 单步更新可比权重自身还大。

### 10.3 验收闸门（`tools/diag-opt-check.js`，28 项全过，退出码可当 CI）

**默认路径逐位不变**：无 opts 的 `mlpTrain` 与改动前原始实现（脚本内保留逐字副本）
同一序列最大差 **0**。这是"现有模型与全部旧脚本行为不变"的唯一硬证据。
另验证 gradClip 位移精确等于 `step×clip`、lrScale 冻层/分层/反向配置、
Adam 无 NaN、旧存档（无 optimizer 字段）加载后仍 `sgd`、维度守卫。
**闸门先写、后写代码，抓到一个真 bug**：初版 `lrScale[li] ? ... : 1` 用三目真值判断，
`scale=0`（冻层）被当 falsy 退回 1，等于静默忽略冻层。已改 `!= null`。

另补一处：`mlpTrain` 原本不校验维度，不匹配时 `W[j][k]` 读到 undefined → NaN
静默污染整网（写测试时先踩到）。现在 Node 抛错、浏览器告警一次并跳过该次更新
（历史上异常从 rAF 冒泡会永久终止动画循环，故浏览器绝不抛）。

### 10.4 三臂对照 + 续训 + 种子复现（全部 400 局/档，σ≈2.4pp）

| 对手 | 起点 | A sgd | B adam | C adam+分层lr | C′ 换种子 | C 再续 1000 局 |
|---|---|---|---|---|---|---|
| default | 31.3% | 35.8% | 35.0% | 42.6% | 38.2% | **43.5%** |
| hell | 32.6% | 36.6% | 35.6% | 41.5% | 39.4% | **45.2%** |
| elite | 26.4% | 32.4% | 29.2% | 36.8% | 32.6% | **41.2%** |
| extreme | 27.7% | 35.2% | 31.2% | 38.0% | 32.6% | **43.8%** |
| extreme-max | 29.3% | 37.6% | 35.4% | 38.6% | 34.1% | **46.1%** |
| 平均 | — | +6.1 | +3.8 | +10.0 | +6.2 | **+13.5** |

三条结论：
1. **单换 Adam 没用，甚至略差**（+3.8 vs SGD +6.1）。合成 BC 数据上"Adam 略好"
   的定性判断搬到 RL 训练上方向相反。
2. **分层 lr 是全部收益来源**（B→C 从 +3.8 跳到 +10.0），正好对上输出层梯度
   只有 1/10 的实测。952 个竞争动作要拉开 Q 差距，输出层需要更大更新量。
3. **续训真复利**（+10.0 → +13.5，五档全升）。阶段 1 的"更长训练不复利"
   是旧仿真下的结论，一致性修好后作废。换种子仍成立（每档 +2.8~+9.2pp）。
   单独开 gradClip 会变差（47.0% vs 76.2% 拟合），它是安全阀不是提速手段。

### 10.5 已采纳并烘焙

采纳线 `vs顶档 ≥ +1.5pp 且 vs默认 ≥ -3pp`：cont-1000 是 +16.8 / +12.2，远超。
- `data/input-ai-extreme.json` ← cont-1000（旧权重备份 `data/input-ai-extreme.pre-phase2.json`）
- 烘焙 `bake-input.js data/input-ai-extreme.json 0.452 0.435 ladder`
  （用 400 局诚实数字，不是训练过程 80 局的乐观数字；旧烘焙备份
  `js/input-weights.pre-phase2.js.bak`）
- `tools/model-registry.json` 的 input3 加 `optimizer / layer-lr / grad-clip` 三参，
  默认 `adam` + `1,1,1,3`，三个训练预设同步更新。

**实机 A/B**（同驱动器、`ttmouse` vs `extreme-max`、各 11 分各 ~52 秒墙钟）：

| | 旧 09-08 | 新 cont-1000 |
|---|---|---|
| 比分 | 5:6 (45.5%) | **6:5 (54.5%)** |
| **DQN 触球** | **3** | **7** |
| 对手触球 | 8 | 12 |
| DQN 失分（未回球）| 6 | 5 |
| myMean（拍深）| 0.462 | 0.716 |
| 页面错误 | 0 | 0 |

11 分 σ≈28pp，比分不能当胜率。但同样驱动时长里 DQN 触球 3 vs 7 是结构性差异，
正是仿真给不出的那一类证据。`myMean` 0.462→0.716 说明新模型把拍放得更深。

### 10.6 顺手修的遥测缺陷

`opp.contacts` 恒为 0：`noteHit` 只在 `ttHit` 里调，而 `ttHit` 只在 DQN 侧跑，
对手的回球从没被记过。修在 `physics.js` 的 `tryPlayerHit`/`tryAIHit` 触球出口，
新增 `noteContact(side)`：非 DQN 侧在此记账，DQN 侧仍由 `ttHit` 记（带擦网标记），
不重复。10.5 的 A/B 表里"对手触球 8/12"是修完后的第一个可读数字。

### 10.7 遗留问题

1. **训练器的选优判据建立在 8-16 局评估上**（σ≈9-14pp），护栏"必须打赢自己"
   在这种噪声下经常选不到，也可能选中运气好的。本轮 300 局运行的选优正好是
   "运气好"那一侧，但对落盘权重的 400 局直测是真实的，所以采纳成立。
   值得把 `--eval` 提到 32+ 并相应拉长 `--step`。
2. 9.4 的三条老问题（对手磁吸 / 零星发球失误 / 触球相位限制）全部仍在，优先级更低。
3. 宽网 `256/384/256/192 × 952`（453,112 参数）仍未跑过；梯度实测显示它在同批数据上
   MSE 4.75 vs 现网 11.58。`bake-input.js` 的 `net.length !== 4` 硬要求需要先放宽。
4. 观测索引 83-87 仍是字面量 `0,0,0,0,0`（P2.1 未做）。

## 11. 正反手自动切换 v2 — 预测决策 + 真滞回 + 承诺机制（2026-09-13）

### 11.1 v1 的问题

`autoStance()`（physics.js）只看**球的当前 x** 与拍的相对位置：球从中间飞向反手位深处时，
前半程一直判正手、临近击球才仓促翻转；`|score|<0.3` 是假滞回（score∈[0.3,0.45] 反向也切）；
噪声每帧重抽，临界球抖动；切换零成本（磁吸/容错瞬间全量生效）；引拍中途还能换握。
AI 侧是裸三元判断 `(ball.x<g.x)?'forehand':'backhand'`，散布 6+ 处、无状态无滞回，
`simmatch.js` 甚至用球台中线近似。`simcore.resolveStance` 是手工同步拷贝。

### 11.2 v2 设计（单一逻辑源 `SIM.resolveStance(o)`）

| 机制 | 参数（`STANCE`） | 说明 |
|---|---|---|
| **预测击球点决策** | — | 来球时用 `predictXAtZ(·, 拍z)` 的预测点而非球当前 x：过网即预判，提前 0.3-0.5s |
| 还原期保持 | `inbound=false` | 球飞向对方半场直接保持当前握法——真人回中还原，不跟远处球位乱切 |
| 引拍锁定 | `phase!=='ready'` | windup/strike 期间锁姿态——动作已开始不换握（含搓球倒板特例除外） |
| 真滞回 | `enter=0.5` | 切换需 `|score|>enter`；明显侧向信号 1.4 恒超阈，追身区 bodyBias 0.55 跨阈 |
| 最短保持 | `minHold=0.15` | 刚切换 0.15s 内不再切（`urgent=1.1` 紧急纠正除外） |
| 一板一次承诺 | `strokeSwitches` | AI 本板已换过握后仅紧急才再切——消灭追球途中 4 连翻转（玩家侧传 0 保持自由） |
| 切换过渡成本 | `transT=0.18, transMag=0.55` | 切换后 0.18s 内磁吸 0.55→1 线性恢复（换握/转腰未到位） |
| AI 侧身正手 | `wrap{vzMax:2.6, dist:0.15-0.55, prob:0.55}` | 反手位慢球每板一次概率性侧身用正手（wrap around），本板锁定 |

决策信号与 v1 同号约定：-X 侧 = 正手（两侧镜像一致）；追身（|球-拍|<`relNear=0.10`）时
按拍所在半台取体侧偏置（`bodyBias=0.55`，保留 v1 sideBias 调优结论）；噪声缩到 ±0.08
（真滞回下只需保留人味）。

### 11.3 接入点（全部走 `SIM.resolveStance` 单一源）

- **玩家** `physics.js#autoStance`：薄包装（50ms 预测缓存 + 状态写入 `playerStance`/
  `playerPad.stance/stanceT`），menu/play/watch 全模式唯一所有者。
- **实机 AI** `ai.js#aiMoveShared`（side==='ai'）：复用 `pad.predX` 预测点；`_inbound`
  上升沿重置每板状态（wrap 抽签 / 切换预算）。玩家侧拍（watch 模式由本函数驱动）
  **不碰姿态**——autoStance 唯一所有，防双写。
- **DQN 对手** `tt-player.js#ttTick`：真实坐标更新 `realPad.stance`（mirrorState 只镜像
  z，x 语义两侧一致）；仅 AI 侧，玩家侧仍归 autoStance。
- **训练器玩家管线** `input-sim.js`：`stanceOf` 有状态化（pad.stance/stanceT 跨板保持，
  修复旧版每板重置 'forehand' 与实机不一致）；整板一次 `predictXAtZ(from,·,PLAYER_Z)`
  预测点（不随磁吸漂移，姿态决策无反馈震荡）；`magnetPull` 同款过渡成本。
  **`simmatch.js`/`aiReturn` 对手侧保持 `bx<0` 中线近似**：训练器策略 AI 拍瞬移到击球点，
  基于拍位的判断会退化为随机，中线反而稳定；已训模型环境分布影响极小。
- 磁吸过渡成本同步：physics.js 玩家/AI 侧、input-sim.js 磁吸（训练-实机一致）。

### 11.4 验证

- `tools/diag-stance-v2.js`（node）：20 断言全过（方向/还原保持/引拍锁定/enter 滞回/
  minHold/urgent/strokeSwitches 承诺/ramp 数值/常量同步）+ input-sim 100 分冒烟
  （回球率正常、无 NaN）。
- 实机（手动步进确定性帧，嵌入浏览器 rAF 冻结环境的替代方案）：
  - 菜单演示对拉 21.5s：5 次切换全部发生在 ready 相位（引拍锁定 0 违例）、
    `playerStance` 与 `playerPad.stance` 零失同步、最快切换间隔 0.18s。
  - 合成场景：球当前 x 与拍对齐但预测击球点在反手位深处 → 立即判反手（预测决策生效，
    v1 在此无法决策）；引拍中改飞正手位 → 锁定不换握；引拍结束 → 正确翻正手；
    `stanceRampOf` 切换瞬间 0.55 → 0.18s 后 1。
  - 斗蛐蛐观战：AI 侧 511 帧来球采样 0 次引拍期切换；**侧身正手触发 1 次**
    （反手位慢球 dist=+0.26）；承诺机制上线后翻转链（1.2s 内 ≥3 次交替）归零。
- 已知测试挂具伪影（与本次改动无关）：嵌入浏览器里被节流的真实定时器与手动发球
  挂具竞争，偶发 toss 状态卡死——发球/抛球流程未改动，真实浏览器不受影响。

### 11.5 调参指南

手感太"黏"→ 降 `enter` 或 `minHold`；AI 移动中仍见翻转 → 降 `wrap.prob` 或收紧
`strokeSwitches`（改 resolveStance 里 `>0` 为 `>1` 允许每板两次）；刚切换漏球多 →
升 `transMag`（弱化成本）；想关侧身正手 → `wrap.prob: 0`。

### 11.6 v2.1 修订 — 修复"几乎不切换"（同日）

用户反馈 v2 姿态切换僵硬死板。三个叠加原因：
1. **引拍锁死过早（主因）**：`phase!=='ready'` 硬锁 + 磁吸辅助提前引拍（慢球 TTC 可达
   0.6s+）+ 漏球 0.5s 引拍保持 ⇒ 姿态从球落己方半台起就冻结，自由窗口≈0。
2. **追身区半台粗判 + 窄缝**：磁吸游戏里拍总贴着球（|dist|<0.10 常态），信号退化为
   "拍在哪半台"的 ±0.55，enter=0.5 只留 0.05 缝隙 ⇒ 切换变噪声抽签。
3. transMag=0.55 惩罚偏重。

修正（`SIM.resolveStance` v2.1，调用方全部同步）：
- **锁死改 TTC 门控**：`o.commit`（调用方按 `ttc=(拍z-球z)/球vz` 计算，`ttc<commitT=0.15`
  才锁）。引拍期间自由重估——翻面动画逐帧插值跟随姿态，中途改握视觉自然。
- **追身区比例渐变**：`rel = -(dist/relNear)*bodyBias`，贴体线→0、偏 10cm→0.55 满幅，
  与远区同号衔接，全轨迹连续；弃用半台粗判。
- `enter` 0.5→0.3（只压噪声不压正常切换）；`transMag` 0.55→0.65。
- 保留还原期保持 / minHold / urgent / AI 一板一次承诺。

验证：断言 21/21（commit 门控/比例渐变/连续性/承诺/ramp）；观战 34.6s 采样 19 次切换
（≈0.55 次/s，v2.0 同口径约 0.3）、承诺窗口内切换 0、翻转链 0、最短间隔 0.42s，
切换方向与球侧全部吻合。侧身正手概率性触发（本 session 未中签，逻辑同前版已验证）。
