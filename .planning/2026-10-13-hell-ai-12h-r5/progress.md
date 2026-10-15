# Progress Log

Chronological record of the round-5 "research + 12h continued training of the hell AI, bake if stronger" work.
Durable research record lives in `findings.md`; the plan lives in `task_plan.md`.

## Session 1 — 2026-10-13/14, phases 1-3 (research → diagnosis → launch scripts)

### Phase 1: 研究现状与真瓶颈 — COMPLETE

- Read `tt_game/tools/phase4-findings.md` (371 lines, rounds 1-4), the round-4 finalize
  report + `input3-hell12h3.chain.log`, `js/input-agent.js` in full, `js/input-sim.js`
  player engine, `js/tt-player.js`, `tools/live-match.js`, `js/opponent-ladder.js`,
  `js/policy.js`, and the 2026-10-14 cleanup commit `1e0e5e3`.
- Re-read `data/checkpoints/input3-hell12h3/curve.json` (42 eval points):
  `trainW` falls **monotonically 50.4% → 21.6%** across all 10 500 epochs; `best`
  moves exactly once (ep2250) and never again for 8 300 epochs.
- **Falsified my own hypothesis** that the selection score was dominated by `default`:
  `selScore` at `train-input3.js` L179-190 really is `0.75*hell + 0.25*default`
  (`SEL_W=[0.45,0.30,0.25]`, top term `wrMap[opt.end]`, second term `SEL_REF`).
  The selection math from phase4 §6 is correct; round 4 genuinely made hell worse.
- **Located the real bottleneck**: live loss-reason breakdown in `chain.log` shows
  `noreach` 95.4-99.5% of losses. Wrote `tools/_diag_argmax.js` and swept 13 incoming
  ball positions against the shipped weights (`tools/logs/_diag_argmax.txt`):
  the policy uses only **4 of 34 mouse-X values**, sits within ±0.14 m of centre for
  ball x ∈ [−0.8, +0.6], and never goes to −0.9 even at x = −1.2.
  Contact window is |ball.x − paddle.x| ≤ 0.29…0.34 m; paddle speed is fine
  (τ = 1/18 s, full sweep 0.15 s). **Lateral tracking, not paddle speed, not depth.**

### Phase 2: 用短探针定本轮配置 — COMPLETE (four falsified hypotheses, one breakthrough)

Built `tools/live-match.js --brain {centre|naive|chase|prior}` — script policies that
replace `TT_PLAYER.agent.bestAction` inside the **real live vm rig**, so the measured
number is a true live-pipeline number.

| probe | live win rate vs hell | touches self/opp | loss mix |
|---|---|---|---|
| `centre` (tx ≡ 0) | 0.4 % | 13/162 | noreach 99.6 % |
| `naive` (tx = current ball x = today's BC target) | 22.8 % | 245/308 | noreach 93.8 %, out 5.7 % |
| `chase` (tx = x + vx·τ) | **40.1 %** | 365/404 | noreach 47.5 %, **out 52.5 %** |
| `prior` (net decides my/ctrl/topspin, rule decides mxI) | **32.1 %** | 246/269 | — |
| shipped DQN baseline | 8.7-11.7 % | — | noreach ~95 % |

Also falsified BC pretraining as a path: three BC capacity diagnostics
(`_diag_bc_capacity.js`, `_diag_bc_fit.js`, `_bc_pretrain.js`) showed that MSE with a
hard target over a 1904-wide output is a global sink (each state pushes 1 903 rows
down; measured hit rate falls monotonically with the number of updates and freezes
after epoch 1), that plain **SGD diverges to 1e85-1e93**, and that a 120-state
supervised warm-start scores **0.0 % live** — it scrambles the policy rather than
teaching the rule.

### Phase 3: 重跑本轮脚本 + 防中断 — COMPLETE (scripts written, run not yet launched)

- `tools/_launch-hell12h5.sh` — supervised 12 h run, run name `input3-hell12h5`,
  start `data/checkpoints/input3-12h/ckpt-008500.json`, `--bcmix 0` (only possible
  after the `Math.max(4, …)` off-switch fix), `--lr0/--lr1 1e-5`,
  `--sel-ref hell --end hell`, curriculum `default:0.25,hell:0.45,grandslam:0.15,hell:0.15`,
  adam + grad-clip 2 + layer-lr 1,1,1,3, `--no-save`.
- `tools/_run-hell12h5-and-finalize.sh` — train → `_finalize-12h.js --topN 4 --top hell
  --opp default,hell,grandslam --force` → bake only if gates pass.

### Phase 3b: 基线重测 / 烘焙偏移修复 / 仿真饱和 — COMPLETE

- **新基线必须重测**：prior 默认开之后，同一份生产权重的实机成绩变成
  default 88.6 % / hell 38.1 % / grandslam 90.5 %（旧口径 35.4 / 11.7 / 35.4）。
  旧基线会让闸门 A 必然通过 = 没设闸门 → 已重写
  `tools/logs/baseline-live.json`，旧值归档 `baseline-live.v4-archive.json`。
- **★ `bake-input.js` 参数下标整组偏移一位**（`argv[2..6]` 应为 `argv[1..5]`）：
  `evalHell/evalDefault` 互换 + 第二项变 `NaN`→`null`；`opp` 取到 JSON 串；
  最要命的是 `_finalize-12h.js:318` 的 `execFileSync(node, ['tools/bake-input.js', path, …])`
  会让 `src` 变成**脚本自己**，`JSON.parse` 一个 `.js` 必然 SyntaxError ——
  **12h 会在收尾烘焙那一刻崩掉**。已修 + 加了「非有限数/超界就拒绝烘焙」的闸，
  并用 execFileSync 同形状调用复验。
- 用同一份权重 + 真·实机值重烘了 `js/input-weights.js` 的 META（权重字节未变）：
  `evalDefault 0.886 / evalHell 0.381`（此前写的是仿真 0.6156 / 0.1822），
  另记 `ladderLive` 与 `simEval`。
- **仿真饱和**：prior 之后同一份权重仿真 default 96.9 % / hell 93.2 %，
  选优基线分 94.1、天花板 100，动态范围从 58.6 点压到 5.9 点 → 仿真只用于排序候选，
  判达标一律实机；`--topN` 3 → 4。
- 短冒烟 `input3-smoke5`（`--games 3 --step 1 --bcmix 0`）确认全部参数可解析、
  prior + bcmix=0 路径干净、检查点正常写出；随后删掉该目录。

### Phase 4: 12h 训练已启动 — IN PROGRESS

- 2026-10-14 03:16 启动整条链路（`_run-hell12h5-and-finalize.sh` → `_launch-hell12h5.sh`
  → `_supervise.sh input3-hell12h5 12 …`），日志
  `tools/logs/input3-hell12h5.chain.log` / `.train.log`（`input3-hell12h5.log`）。
- **Windows 侧看门狗** `tools/_watchdog-hell12h5.ps1`（PID 记在
  `tools/logs/input3-hell12h5.watchdog.pid`，每 300s 一次）：监督器不在、收尾不在、
  没叫停、预算没满 → `Start-Process` 重拉整条链路。叫停：`touch data/.stop/input3-hell12h5.sup`。
- 启动自检：192×88→256×192→192×256→1904×192；课程 default25/hell45/grandslam15/hell15；
  `adam+clip2+layerlr` lr 1e-5；BC 池 6666 对但在线混入 **压到 0%**；仿真基线
  default 96.9 / hell 93.2；选优基线 best=94.1（地板 91.9）；预填回放 500 回合 /
  43930 样本 / 贪心胜率 93% / 53s；已进入课程 1/4（default，ep 0-2250）。

## Error Log

| Timestamp | Error | Attempt | Resolution |
|---|---|---|---|
| 2026-10-14 | 看门狗 `.ps1` 首跑 `TerminatorExpectedAtEndOfString` 退出 1 | 1 | PowerShell 5.1 读**无 BOM** 的 UTF-8 脚本会按 ANSI 码页解析、中文注释炸掉；改用 `'\uFEFF' + text` 写盘 |
| 2026-10-14 | `Stop-Process` 按命令行 `-like '*_watchdog-hell12h5*'` 匹配，**把自己的 shell 宿主一起杀了**（退出 255 无输出） | 1 | 进程一律走 PID 文件管；且本机还有别人的后台作业（`X:\wfls\research\r103`、`ck*.py`），不要动 |
| 2026-10-14 | PowerShell 吞掉给原生命令的 JSON 参数里的双引号，`bake-input.js` 的 `ladderLive`/`simEval` 解析失败 | 1 | 带 JSON 的参数改用 node 的 `execFileSync` 传 |

## Test Results

| Test | Input | Expected | Actual | Status |
|---|---|---|---|---|
| diag argmax sweep | `_diag_argmax.js` × 13 ball x | find whether the net tracks laterally | 4/34 mouse-X values, tx ≈ ±0.14 m near centre | PASS (diagnosis confirmed) |
| live script-brain sweep | `--brain centre/naive/chase` × 30 games | chase ≫ baseline if lateral is the cause | 40.1 % vs 11.7 % baseline | PASS |
| live prior probe | `--brain prior` × 30 games | keep net's my/ctrl, rule's mxI | 32.1 % | PASS |
| lateralPrior smoke | `tools/logs/_smoke_prior.txt` | tx spans −0.9…+0.9, my/ctrl still vary, departing ball untouched | as expected | PASS |
| BC warm-start | `_bc_pretrain.js` + live 30 games | ≥ baseline if BC can teach chase | 0.0 % (hit rate 3.3 %) | FAIL — path abandoned |
| optimizer stability | `_t4.txt` / `_t5.txt` | SGD explodes, Adam stable | SGD 1e85-1e93; Adam stable but BC-plateaued | PASS (diagnosis) |

## Error Log

| Timestamp | Error | Attempt | Resolution |
|---|---|---|---|
| 2026-10-14 | `edit` on `input-agent.js` failed twice — the `read` line-number prefix indentation did not match the file bytes | 1 | Dumped the exact lines with `node -e` + `JSON.stringify` to get literal whitespace, then edited |
| 2026-10-14 | `imitate()` initially written with 2-space indent, file uses 8 | 1 | Rewrote with the file's real indentation |
| 2026-10-14 | `getBcMix()` deleted by accident while editing `learn()`; used at `train-input3.js:705` | 1 | Restored immediately |
| 2026-10-14 | `_bc_pretrain.js` passed already-encoded vectors to `bestAction` (which encodes internally) → meaningless constant hit rate | 1 | Store both `raw` obs and the encoded vector; call `encode` once |
| 2026-10-14 | PowerShell console mangles UTF-8 from node | many | Always `node … | Out-File -Encoding utf8 <file>` then read the file |

## 5-Question Reboot Check

| Question | Answer |
|---|---|
| Where am I? | Phase 4：12h 训练在跑（run `input3-hell12h5`，2026-10-14 03:16 起，预算到 15:16），看门狗已挂 |
| Where am I going? | 盯到训练结束 → `_finalize-12h.js --topN 4` 实机验收 → 闸门 A/B 过才烘焙 → `phase5-findings.md` + AGENTS.md + 汇报 |
| What's the goal? | 在「横向 prior 已把实机从 11.7% 抬到 38.1%」之上，用 12h TD 再赚一点；实机闸门不过就不烘 |
| What have I learned? | 见 `findings.md`：横向跟踪是真瓶颈、τ 符号 bug、BC 是全局汇、prior 设计、烘焙下标偏移 |
| What have I done? | 见上；除基线外全部改动仍未提交 |
---

## Phase 4 — 12h 续训已启动（2026-10-14 04:02，配置已按实测轮速重新平衡）

### 已完成（本阶段）

| 项 | 状态 |
|---|---|
| 提交 `f0208d3`：prior + τ 修复 + 烘焙下标偏移 + 基线重建 | ✅ |
| `tt_game/tools/phase5-findings.md` 全文写就（本轮完整研究记录） | ✅ |
| `AGENTS.md` 新增 3 行（`input-agent.js` / `live-match.js` / `bake-input.js`） | ✅ |
| 实测轮速 → `--games 9000 → 3200`、`SUP_BOOT/_STALL 3600/5400` | ✅ |
| 链 + 监督器 + trainer 续训 + watchdog 重启并验证 | ✅ |

### 实测：轮速与预算（这是本阶段最贵的发现）

- **一个 round = 3069 s ≈ 51 min**（250 训练回合 2084 s + 3 档 90 局验证 985 s）。r4 是 ~17 min/round，现在慢 3 倍 —— **因为球终于被打回去了**（以前 95 % 的对局 `noreach` 秒丢球）。
- **预算只计训练时间**：`elapsedSec` 第 1 轮后 2084，trainer 打印 `剩11h25m` = 43200 − 2084。验证时间不计入。
- **课程表边界是 `--games` 的分数**（`evalAtPhase`，train-input3.js L166）。`--games 9000` ⇒ `default` 段 = 回合 0–2250 = **第 1–9 轮 ≈ 7.6 h**，而 `default` 已 98.3 % —— 烧 7.6 h 学不到东西，只剩 4.4 h 给 `hell`。**这是预算分配 bug，不是强度不够。**
- 已改 `--games 3200`（12.8 轮 ≈ 11.1 h 挂钟）：`default` 3.2 轮 → **`hell` 5.8 轮（主战场）** → `grandslam` 1.9 轮 → `hell` 1.9 轮。

### 实测：监督器有一个会误杀健康进程的窗口

`_supervise.sh` 内容式判挂（`index.json` 的 `elapsedSec` 连续 N 轮轮询不变）是对的（免疫 phase4 #18 的时钟跳变），
但 `index.json` **一个 round 才写一次**。原 `SUP_BOOT=1500` + `SUP_STALL=1800` 对 51 min 一轮 ⇒
**健康进程会在第一轮结束后 9 分钟被判定挂掉并杀掉**。已改 `3600` / `5400`。

### 新增错误行

| 时间 | 错误 | 处理 |
|---|---|---|
| 2026-10-14 | `taskkill /F /T /PID <wrapper>` 没杀掉被 `exec` 出来的监督器与 trainer（`/T` 不跟随 exec） | 按显式 PID 逐个杀 |
| 2026-10-14 | 误以为 04:01:39 的「第 1 次启动」是幽灵重启，其实是自己刚做的 relaunch | 以 `Get-Date` 核对 |
| 2026-10-14 | `edit` 带 `\` 续行的大块 `oldString` 连续两次匹配失败 | 拆成两次小编辑：先替唯一 token，再锚短块 |
| 2026-10-14 | `_run-hell12h5-and-finalize.sh` 带 UTF-8 BOM，bash 报 `line 1: ?#!/usr/bin/env` | 无害（`bash file` 方式下 shebang 只是坏命令），**但运行期间不能改它**（bash 增量读脚本），跑完再剥 BOM |

### 5-Question Reboot Check（覆盖旧的）

| 问题 | 答案 |
|---|---|
| 在哪？ | Phase 4。run `input3-hell12h5` 运行中，2026-10-14 04:02 重启，预计 ~15:00 自然结束。trainer 已从 ep 251 / best=94.2 续训，`games=3200`，剩 11.42 h 预算，`BC 混入 0%` |
| 去哪？ | 等 trainer 退出 → `_finalize-12h.js --topN 4` 自动实机验收 → 门禁 A/B/C1/C2 全过才 `bake-input.js` 烘焙 → `phase5-findings.md`（已写）+ AGENTS.md（已写）+ 汇报 |
| 目标？ | 把烘焙进 `js/input-weights.js` 的玩家 AI 对地狱的**实机**胜率从 11.7 % 提到 38.1 %（prior）之上。prior 已把它从 11.7 提到 38.1；12 h TD 负责剩下的 `out`（打到了但打错，52.5 %） |
| 学到什么？ | 全在 `findings.md` 与 `phase5-findings.md`：τ 符号 bug、BC 全局下沉机、SGD 发散、prior 设计、仿真饱和、烘焙下标偏移 |
| 做了什么？ | 诊断链 + 4 个代码修复 + prior 落地 + 基线重建 + 烘焙修复 + 12 h 续训已启动 |---

## Phase 4 里程碑 — ep750 已烘焙上线（2026-10-14 05:30）

### 实测：ep 750 的实机成绩（本轮第一个 ★）

`node tools/live-match.js --from data/checkpoints/input3-hell12h5/ckpt-000750.json --opp default,hell,grandslam --games 30 --seed 20261004 --live-only`
（耗时 584 s，24 核机器上与训练并行跑，互不干扰）

| 档 | 基线（旧权重+prior） | **ckpt-000750** | Δ |
|---|---|---|---|
| default | 88.6 % | **93.3 %** | +4.7 pp |
| **hell** | 38.1 % | **59.2 %** | **+21.1 pp** |
| grandslam | 90.5 % | **91.5 %** | +1.0 pp |
| 加权 0.75·hell+0.25·default | 50.72 % | **67.7 %** | **+17.0 pp** |

- 换 seed 777 复测地狱档 **57.8 %** —— 不是过拟合单一种子。
- 败因构成：out 35.5 %（打到了但打错）· noreach 71.5 %/123（含双跳）。**`out` 正是 12h TD 该修的东西，已烘进去。**
- 已用 `tools/_bake750.js` → `bake-input.js` 烘进 `js/input-weights.js`，`INPUT_AI_META` 全写实机值（evalHell 0.592 / evalDefault 0.933），`simEval` 另存作对照。提交 `700903d`。
- 烘焙后又用实机管线空跑一遍（不带 `--from`，直接读线上文件）确认游戏里加载正常。

### 实测：课程切换会砸一次

ep 750（default 段收尾）仿真三档 98.3 % → ep 1000（刚进 hell 段）掉到 75 / **21.7** / 68.3 → ep 1250 回到 96.7 / **70.0** / 96.7。
**是瞬态，不是崩塌**，但训练胜率一路 76→79→73.6→63.3→55 % 单调下降，与 r4 同一个形态，继续盯。

### 改了两处 finalize（都在烘焙之前发现，来得及）

1. **候选排序同分取 ep 大者**（提交 `ddabc65`）。仿真饱和后几十个检查点并列 98.3 %，原写法只按 `simScore` 排，而 `Array.sort` 在 V8 里稳定 → 并列时保留插入顺序 → **最早**达成该分的检查点胜出，训练 10 小时的后期权重反而被挤掉。仿真分既然分不出高低，就用唯一还单调的量（训练进度）兜底。
2. **候选集保底包含「选优最佳」**（提交 `5416c6a`）。`best.file` 标 `isBest`，无条件进候选（最多 TOPN+1 份）。**这一轮实机 +21 pp 的正是 ep 750 —— 只取前 --topN 的话，一串「同分但没验证过」的后期权重会把它挤掉，12h 白跑。**

### 新增错误行

| 时间 | 错误 | 处理 |
|---|---|---|
| 2026-10-14 | 想改 PowerShell 里的整表行锚点，结果把两行表格并成一行 | 锚点取**上一行的结尾**，不取下一行的开头 |

### 5-Question Reboot Check（覆盖旧的）

| 问题 | 答案 |
|---|---|
| 在哪？ | Phase 4。run `input3-hell12h5` 运行中（05:32 时 ep 1250 / elapsed 7085 s / 剩余预算 ~10 h）。**ep750 的权重已经烘焙上线**，训练继续，收尾时 finalize 会再挑一次 |
| 去哪？ | 等 trainer 退出 → finalize 自动实机验收 5 份候选 → 四道门禁全过才再烘一次（有更好的就覆盖）→ 汇报 |
| 目标？ | 地狱实机胜率。已达成 11.7 % → 59.2 %（+47.5 pp 累计），剩下看 TD 还能不能把 `out` 那 35.5 % 压下去 |
| 学到什么？ | 全部在 `findings.md` 与 `tt_game/tools/phase5-findings.md`。新增一条通用教训：**排序/阈值类逻辑在「度量饱和」之后必须有兜底**，否则稳定的 sort 会静默地选错 |
| 做了什么？ | 诊断链 + 4 个代码修复 + prior 落地 + 基线重建 + 烘焙修复 + 验收演练（抓到 2 个坑）+ **ep750 上线** + finalize 两处加固 |---

## Phase 5 收官 — 第 5 轮完成并上线（2026-10-14 21:00+）

### 验收结果（四门全过，自动跑完）

| 候选 | ep | 仿真分 | 实机分 | 实机 地狱 |
|---|---|---|---|---|
| **ckpt-000500（选中）** | 500 | 0.9292 | **0.68025** | **0.600** |
| best-000750 | 750 | 0.9833 | 0.67725 | 0.592 |
| best-000000 | 250 | 0.8833 | 0.50725 | 0.381 |
| best-001500 | 1500 | **0.9875** | **0.33100** | 0.209 |

A 68.0 vs 50.7 ✓ · B 60.0 vs 38.1 ✓ · C1 19.1 ≤ 52.2 ✓ · C2 19.1 ≤ 69.2 ✓ → **已烘焙**

**最强的一条证据**：仿真分最高（0.9875）的 ep1500 实机垫底（0.331）；仿真分只排第三的 ep500 实机第一（0.680）。
若当年直接烘焙选优最佳，烘进去的会比旧权重还差 5 个百分点。**仿真只排序、实机定生死。**

### 12h 运行结束后才发现的第 6 个坑（14 机时空转）

- 现象：07:36→21:20 监督器重启 21 次，每次「正常启动 → 正常退出（code=0）」，`ep` 冻在 3000，`elapsedSec` 冻在 14952。
- 根因：检查点与 `index.json` 只在轮次边界写（`(g+1)%ckpt===0`）。`--games 3200` 不是 `--ckpt 250` 的整数倍，最后能写的边界 3250 永远到不了 ⇒ 末尾 199 回合训完不落盘 ⇒ `elapsedSec` 不推进 ⇒ 监督器判定预算未用完 ⇒ 重启 ⇒ 自锁。
- 修 1：`train-input3.js` 正常退出前补一次收尾检查点（`finishEp > lastCkpt` 时写）。
- 修 2：`_supervise.sh` 加「干净退出但 `elapsedSec` 未推进」守卫，`ELAPSED_PREV=-1` 初始化，首次启动不误判。

**这条是唯一一个训练日志里完全看不出来的**（前 5 个都在验收阶段，演练一次全看见；这条在训练尾部，`code=0` 反而是最好的伪装）。
判定运行健康只能看 `index.json` 的**内容有没有推进**，不能看进程在不在、也不能看退出码。

### 本轮共 6 个代码修复 + 4 个工具改动

input-agent.js 6 处（τ 条件、BC raise-only、imitate 两点排序、bcmix 0 真开关、lateralPrior、回滚开关）；
train-input3.js 2 处（BC 追预测拦截点、收尾检查点）；live-match.js（`--brain`/`--no-prior`）；
bake-input.js（argv 偏移 + LIVE 校验）；_finalize-12h.js（同分按 ep 降序、选优最佳保底、C1 空参照硬失败、C2 阈值跟基线）；
新增 `_refresh-baseline.js`。

### 提交

`38ae6d3` fix(tt_game): 收尾落盘 + 空转守卫 —— 12h 续训第 5 轮收官
（`js/input-weights.js` + `_run-hell12h5-and-finalize.sh` BOM 剥除 + `_supervise.sh` + `train-input3.js`）

### 新增错误行

| 时间 | 错误 | 处理 |
|---|---|---|
| 2026-10-14 | `[IO.File]::ReadAllBytes` 用相对路径 → FileNotFound（shell 工具的 `cd` 不影响 .NET 的当前目录） | 用绝对路径 |
| 2026-10-14 | 剥 BOM 时 `.WriteAllBytes($b, $bytes[3..])` 把后续字节也拷了一份（PowerShell 数组切片语义） | 改成 `$bytes[3..($bytes.Length-1)]` |

### 5-Question Reboot Check（最终）

| 问题 | 答案 |
|---|---|
| 在哪？ | 第 5 轮**已完成并上线**。验收四门全过，ep500 已烘焙进 `js/input-weights.js` |
| 去哪？ | 无待办。等 seed 777 独立复测数出来后给用户最终汇报 |
| 目标？ | **达成**：地狱实机 11.7 % → 60.0 %（5.1×），默认 35.4 % → 92.1 %，大满贯 35.4 % → 91.0 % |
| 学到什么？ | 全部在 `findings.md` 与 `tt_game/tools/phase5-findings.md`（17 节，660 行）。核心：4 轮白烧的真因是「拍面停中间」，不是训练不够久 |
| 做了什么？ | 诊断 → 6 个代码修复 → 12h 续训 → 6 个「最后一步才炸」的坑（1 个验收侧靠演练发现、1 个训练侧靠日志发现）→ 验收 → 上线 |