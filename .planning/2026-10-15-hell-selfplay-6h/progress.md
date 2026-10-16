# progress.md — 自对弈续训地狱 AI（**已收尾**）

## 结论一句话

850 代 / 5.86 h 跑完、零中断，**候选与线上地狱 AI 强度统计上无法区分（双向对打 49.90 %）**，
故 **不采纳**，`js/learned-policy.js` 保持原样（`--no-write` 全程生效）。

## 时间线

| 时间（2026-10-15/16） | 事件 |
|---|---|
| 00:2x | 勘察 `tools/train-hell.js` / `train-hell-worker.js` / `js/learned-policy.js` / `js/policy.js` |
| 00:2x | `--smoke` 自检通过（7.6 s） |
| 00:25 | 测速 `--gens 2 --no-write --workers 20` → 60 s / 2 代 ⇒ **25.5 s/代** |
| 00:3x | 用户确认：**6 小时（≈850 代）** + **先不采纳**（`--no-write`） |
| 00:3x | 写 `tools/_supervise-hell.sh`、`tools/_watchdog-hell.ps1`；`bash -n` 通过；`TOTAL_GENS=0` 冒烟通过 |
| 00:38 | 首次启动 → 发现 MSYS `$$` ≠ Windows PID，杀掉重来 |
| 00:41:36 | **850 代长跑正式启动**（守护 winpid 39532） |
| 00:42:02 | 看门狗启动（PID 55548） |
| 06:33:29 | **训练结束**：code=0，用时 21113 s（5.86 h），`savedAtGen 0 -> 849`，**全程 0 次重启** |
| 06:38:03 | 看门狗自行退出（`reached 850 gens`） |
| 07:2x | 独立双向对打复评 3200 局 → 49.90 % |

## 训练结果

起点 = 当前线上地狱策略；`best.fit` 0.8087 → **0.8256（第 524 代）**，此后 325 代无突破。

### 内置独立最终验证（4 种子 × 40 局 = 160 局）

| 指标 | 新候选 | 线上旧策略 | Δ |
|---|---|---|---|
| vs 默认 | 89.62 % | 90.22 % | −0.60 pp |
| vs 加强玩家模型 | 94.02 % | 93.51 % | +0.51 pp |
| **vs 旧地狱（头对头）** | **49.36 %** | 50 % | −0.64 pp |

`adopted: false`（门槛要求头对头 ≥ 51.5 %）。

### 我的独立复评 `tools/_hell-h2h.js`（双向对打，消除先后手偏置）

```
候选 vs 线上（候选先手）: 50.05%
线上 vs 候选（线上先手）: 50.25%
双向无偏：候选 = 49.90%   ⇒ 线上更强 / 持平
总局数 = 3200
```
⇒ 与 49.36 % 一致，**不是先后手偏置造成的假象**。

## 诊断（下一轮该改的地方）

1. **适应度口径没有梯度**：`0.34·加强玩家 + 0.26·默认 + 0.26·自对弈 + 0.14·搓球狂` 里，
   前两项常年顶在天花板（0.90 / 0.94），**60 % 的权重贡献几乎为零**；
   唯一还能动的「自对弈」项权重只有 0.26，而且对手是每代在动的 `best`（移动靶）。
2. **`best` 的跨代比较有噪声**：每代种子是 `BASE.x + g*991`，跨代不可比；
   一代只跑 2 种子 × 24 局（48 局，SE ≈ 7 pp），fitness 的「提升」0.017 远小于其标准误。
3. **★ 三维在实机里是死的**：训练/验证用 `P.unflattenPolicy(vec)`（原始向量），
   但实机 `policyForModel('hell') = unflattenPolicy(strongVec())`，而 `strongVec()`（`js/policy.js` L328-330）会把
   **`moveSpeed: 2.8` / `moveErr: 0.03` / `moveZ: 2.6` 硬写**成护栏值。
   ⇒ 这三维在真机上被忽略，训练白优化。本次候选第二大的改动恰好就是 `moveZ`（0.984 → 1.796），实机等于没改。
4. **42 维空间疑似已饱和**：候选与线上 L1 距离 10.714（最大单维 `recoverPace` 6.745 → 11.679，接近上限 12），
   强度却完全一样 —— 平缓的适应度地形。

## 产出文件

| 路径 | 内容 |
|---|---|
| `tt_game/tools/train-hell-candidate.json` | 候选向量 + 全部验证数字（`adopted:false`） |
| `tt_game/tools/train-hell-curve.json` | 850 点曲线 |
| `tt_game/tools/train-hell-best.json` | 最优向量（gen 524，fit 0.8256） |
| `tt_game/tools/logs/_hell-selfplay.log` | 训练全日志 |
| `tt_game/tools/logs/_hell-h2h.txt` | 独立双向对打复评 |
| `tt_game/tools/_hell-h2h.js` | 复评脚本（可复用：`node tools/_hell-h2h.js [局数] [种子数]`） |

**`js/learned-policy.js` 未被修改。**

## 错误日志 / 教训

1. **MSYS PID ≠ Windows PID**：`$$` 在 Git Bash 是 MSYS PID（29/376），PowerShell 的 `Get-Process -Id` 查不到
   ⇒ 看门狗会误判「已死」重复拉起。解法：额外写 `/proc/$$/winpid`（实测可用）。
2. **`bash` 不在 PATH**：必须用 `C:\Program Files\Git\bin\bash.exe`；看门狗里加了候选路径兜底。
3. **测速运行覆盖了 tracked 文件**（`train-hell-{best,candidate,curve}.json`）→ 已 `git checkout` 还原。
4. **改正在运行的 .sh 有风险**（bash 增量读取）⇒ 发现 winpid 问题后直接杀掉重来，只损失 2 分钟。
5. **不要按命令行文本杀进程**（会杀宿主 shell）⇒ 只按显式 PID；命令行匹配只用于存活判断。
6. **控制台中文乱码会吃掉数字的首位**：`?9.4%` 实为 `49.4%`。读关键数字必须
   `Get-Content -Encoding UTF8 | Out-File -Encoding utf8` 后用 read 工具看。

---

## Phase A4 监控 — 中途快照（2026-10-17 00:19）

长跑 `bash tools/_supervise-hell.sh 330 --workers 20 --no-write`（22:47:32 启动）：

- **gen 80 / 330**，用时 1.53 h ⇒ **68 秒/代**，预计 **05:00 前后**收尾。0 次重启。
- 进程：守护 bash 50136 / 49472 / 55600 · 训练器 node 49436 · 看门狗 50188 · waiter 676。

### 曲线（方案 A 是否生效的判据）

| gen | fit | vs现役 | vs加强玩家 | vs默认 | vs搓球 |
|---|---|---|---|---|---|
| 0（起点） | 0.6723 | **48.5 %** | 92.3 % | 85.5 % | 82.5 % |
| 65–80 | 0.698–0.715 | **52.8–56.5 %** | 89–92 % | 83–88 % | 82–86 % |
| **best @ gen 76** | **0.7153** | **56.0 %** | 92.3 % | 85.5 % | 85.4 % |

**结论：方案 A 生效。** `vs现役` 从 48.5 % 升到 54–56 %（第一轮 850 代里从未超过 50 %），
`best.fit` 0.6723 → 0.7153 且 `tag=child`（突变子代，不是原样续训），三个护栏项没崩。

### 注意（口径提醒）

训练里 `fSelf` 每代只跑 2 种子 × 60 局 = 120 局 ⇒ SE ≈ 4.5 pp，单代 55 % 只有 +1.1 SE，**不能单代定罪**；
但连续 16 代稳定在 53–57 %，趋势可信。判决在收尾：内置 4 种子 × 40 局（160 局，SE ≈ 3.9 pp）
+ `node tools/_hell-h2h.js 200 8`（双向 3200 局）。

### 落盘节奏（已核实 `tools/train-hell.js`）

`curve.push` 每代都执行（L239），但**写文件**只在 `g % 10 === 0 || g === opt.gens - 1`（L242），
所以 `train-hell-curve.json` 每 ~11 分钟更新一次，且每次都含**全部历史**（故 gen 80 时有 81 条）。
`train-hell-best.json` 同样节奏。`train-hell-candidate.json` 只在收尾时写一次。

### 中途事故

服务重启掐掉了两个我挂的 shell 后台等待进程（不影响训练本身）；看门狗与 waiter 未受影响，防中断链路完好。
已重新挂一个完成通知。
