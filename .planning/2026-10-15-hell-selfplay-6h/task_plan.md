# 任务计划 — 自对弈续训「地狱 AI」

## 用户指令（逐字）

> 训练自对弈模型“地狱ai”

随后补充：
- 时长选择：**约 6 小时（≈850 代）**
- 采纳方式：**先不采纳，产出候选由我确认** → 训练一律带 `--no-write`
- 「计划完成后自动开始」（不需要再确认）

## 目标

用 `tools/train-hell.js` 续训 `js/learned-policy.js`（地狱 AI 的核心策略向量，42 维），
约 6 小时 / 850 代，产出：
- `tools/train-hell-candidate.json`（候选向量 + 最终独立验证数字）
- `tools/train-hell-curve.json`（每代适应度曲线）
- `tools/train-hell-best.json`（最优向量检查点）
**不写 `js/learned-policy.js`**，等用户确认后再由我手动采纳。

## 关键事实（务必先读）

- 地狱 AI = `js/learned-policy.js` 的 `LEARNED_POLICY`（partial policy，未设字段回落 `POLICY_DEFAULT`），
  被 `js/policy.js#strongVec()` 合并，护栏 `moveSpeed 2.8 / moveErr 0.03 / moveZ 2.6`。
- **与第 1–5 轮训的「玩家侧 DQN」(`js/input-agent.js` / `js/input-weights.js`) 完全无关**，不要混淆。
- 训练器 `tools/train-hell.js`：GA，pop 24，每代 24 个体 × 4 对手（default / pb 加强玩家模型 / pusher / self 自对弈）× 2 种子 × 24 局；
  适应度 `0.34*fPB + 0.26*fDef + 0.26*fSelf + 0.14*fPush`；`sigma = 0.09*(1-g/gens)+0.025`。
- 每 10 代落盘 `train-hell-curve.json` + `train-hell-best.json`（后者是「策略本体」检查点，崩溃续训靠它）。
- `--from <file>` 读 `{vec:[...]}` 作为续训起点（同时成为最终头对头比较的 `curVec`）。
- `--no-write`：**永不覆盖** `js/learned-policy.js`。
- 最终独立验证（4 种子 × 40 局）：新策略 vs 默认 / vs 加强玩家模型 / **vs 旧地狱（头对头）**。
- 默认采纳门槛（本次不启用）：`头对头 ≥51.5% && vs默认 ≥ 旧-1.5pp && vs玩家模型 ≥ 旧-4pp`。
- 实测速度：**≈25.5 秒/代**（20 workers）⇒ 850 代 ≈ 6.0 h。

## 阶段

- [x] Phase 1 勘察工具链（train-hell.js / worker / simmatch / learned-policy.js）
- [x] Phase 2 冒烟自检（`--smoke` 通过）+ 测速（2 代 60s ⇒ 25.5s/代）
- [x] Phase 3 写防中断守护 `tools/_supervise-hell.sh` + `tools/_watchdog-hell.ps1`
- [x] Phase 4 启动 850 代长跑（detached + 看门狗）
- [x] Phase 5 监控：全程 0 次重启，06:33:29 正常收尾（850 代 / 5.86 h）
- [x] Phase 6 收尾：内置验证 + 自写双向对打复评（3200 局）= **49.90 %，与线上持平** → 报告
- [x] Phase 7 **无需采纳**（候选未超过现役；`js/learned-policy.js` 保持原样）

## 当前状态

见 `progress.md`。

## 停止方法

```bash
touch tt_game/data/.stop/hell-selfplay.stop     # 守护收到后收工
# 看门狗：PID 在 tt_game/tools/logs/_hell-selfplay.watchdog.pid
```

---

# 第二轮（2026-10-16 · 方案A）— 用户批准的适应度改造

## 用户指令（逐字）

> A

（= 采用我提的方案 A：**改适应度：把「vs 现役」头对头设为主要目标（权重 ≥0.5），
并只优化实机生效的 39 维（冻结 `moveSpeed`/`moveErr`/`moveZ`）；顺带把每代局数从 24 提到 60+ 降噪**）

## 第一轮为什么是零提升（三条根因）

1. **适应度没有梯度**：`0.34*vs加强玩家 + 0.26*vs默认`（共 60 %）常年顶在天花板
   （0.90 / 0.94），几乎贡献 0 梯度；唯一还能动的自对弈项只占 0.26，且对手是每代在动的
   `best.v`（移动靶，自己抬高门槛）。
2. **三维在实机里是死的**：训练/验证走 `P.unflattenPolicy(rawVec)`，实机
   `policyForModel('hell')` 走 `strongVec()` 把 `moveSpeed/moveErr/moveZ` 硬写为
   2.8/0.03/2.6 ⇒ 这三维在真机上被忽略。第一轮候选第二大的改动恰好是 `moveZ`
   （0.984→1.796），实机等于没动。
3. **跨代选优有噪声**：每代种子 `BASE.x + g*991`（跨代不可比），一代只跑 2 种子 × 24 局
   ≈ 48 局（SE ≈ 7 pp）；fitness 那 0.017 的「提升」远小于其标准误。

## 本轮改动（全部落在 `tt_game/tools/train-hell.js`）

- **适应度主目标反转**：`fit = 0.52*vs现役 + 0.20*vs加强玩家 + 0.16*vs默认 + 0.12*vs搓球`。
- **对手固定为 `curVec`**（冻结参照，不再用每代移动的 `best.v`）—— 这才是真正的「vs 现役头对头」。
- **冻结维**：`FROZEN = [[0,2.8],[1,0.03],[2,2.6]]` + `applyFrozen()`；`mutate()` 跳过 idx 0/1/2，
  种群随机初始化也 `applyFrozen()`，续训起点 `curVec` 同样钉死 ⇒ 训练向量 == 实机向量。
- **每代局数 24 → 60**（默认值；每代 24×4×2×60 = 11 520 局）。
- **跨代固定种子**：去掉 `+ g*991`，使 `best` 跨代可比（配对比较，检测真实进步）。
- 头部注释与启动横幅记录口径。

## 实测（改动后）

- `--smoke` 通过：默认 vs 默认 50.4 % · 现役地狱 vs 加强玩家模型 91.7 % · 现役 vs 现役 48.7 %。
  （注意：现役地狱的口径已变为实机的护栏版，故 91.7 % 与第一轮 93.6 % 不同 —— 这才是真机数字。）
- 测速：**≈63 秒/代**（games=60）⇒ 330 代 ≈ 5.8 h。

## 本轮阶段

- [x] Phase A1 实施方案 A 的四处改动 + `node --check` + `--smoke`
- [x] Phase A2 测速（2 代 135s ⇒ 63s/代）+ 归档第一轮产物到 `tools/logs/_run850-*`
- [x] Phase A3 启动 330 代长跑（守护 + 看门狗 + waiter）
- [ ] Phase A4 监控前 ~20 代（关键：`best` 是否突破起点）
- [ ] Phase A5 收尾：内置 4 种子验证 + `_hell-h2h.js` 双向复评 → 报告，**不采纳**，交用户确认
- [ ] Phase A6 处理两个待定问题（见 `progress.md`：tracked 的 `train-hell-*.json` 提交还是还原；守护脚本要不要提交）

## 本轮运行参数

```bash
bash tools/_supervise-hell.sh 330 --workers 20 --no-write
```
- 起点：`js/learned-policy.js`（现役地狱）经 `applyFrozen` 后的 42 维向量。
- 预期结束：启动 22:47:32 + ≈5.8 h ≈ **次日 04:35** 前后。
- 停止：`touch tt_game/data/.stop/hell-selfplay.stop`
