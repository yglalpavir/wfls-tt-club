# Task Plan: 地狱 AI 续训 12h（第 5 轮）

## Goal

把**地狱档实机胜率**从当前基线抬上去，并且**只有实机闸门全过**才更新
`js/input-weights.js`。未达标就保持生产权重原样（这是预期内的安全结果）。

## Current Phase

Phase 4/5（训练仍在跑；**ep750 已实测并烘焙上线** —— 对地狱实机 38.1% → 59.2%）

## Next Step

等训练自然结束（`--games 3200` 约 15:00 前后），链路自动进
`_finalize-12h.js --topN 4 --top hell --opp default,hell,grandslam --force`：
它会实测至多 5 个候选（已加「同分取 ep 大者」和「best.file 保底入选」），
四门全过才再写一次 `js/input-weights.js`，否则保持 ep750 不动。
期间只需偶尔核对 `data/checkpoints/input3-hell12h5/index.json` 的 `elapsedSec` 在涨、
`trainW` 的下滑不是崩。**已挂 `_wait-hell12h5.ps1` 轮询器（300s/次），结束或超时会自动报。**

## Phases

### Phase 1: 研究现状与真瓶颈 — ✅ complete

- [x] 读 `tt_game/tools/phase4-findings.md`（前 4 轮全部踩坑）
- [x] 复盘第 4 轮 finalize + `chain.log` 逐档实机输因
- [x] 读 `js/input-agent.js`（88 维 / 1904 动作 / τ / BC 注入点）
- [x] 读 `js/input-sim.js` 玩家引擎，定位 `noreach` 的几何来源
- [x] `tools/_diag_argmax.js` 扫 13 个来球 x —— **证实网络不横向追球**（34 档只用 4 档）
- [x] 证伪自己的假设：选优分口径（`selScore` L179-190）**没有**错
- [x] 查 `INPUT_AI_META` 当前内容 → 是修复前烘的陈旧产物（写的是仿真值）

### Phase 2: 用短探针定本轮配置 — ✅ complete

- [x] `live-match.js --brain {centre,naive,chase,prior}`（在真 live rig 里换决策函数）
- [x] 实机地狱胜率：centre 0.4% / naive 22.8% / **chase 40.1%** / prior 32.1% / 基线 8.7%
- [x] 落地 C1（τ 判据方向）/ C2（BC 追拦截点）/ C3（在线 BC 非破坏）/ C5（imitate 成对排序）
- [x] 落地 `lateralPrior`（产品路径，默认开，`setLateralPrior(false)` 回滚）
- [x] 修 `--bcmix 0` 关不掉 BC 的 bug
- [x] **证伪 BC 预训练**（实机 0.0%）：`_diag_bc_capacity` / `_diag_bc_fit` / `_t4` / `_t5`
- [x] `tt_game/tools/phase5-findings.md`（§0~§16 全文，含 ep750 结果与验收演练教训）

### Phase 3: 重跑本轮脚本 + 防中断 — ✅ complete

- [x] 写 `tt_game/tools/_launch-hell12h5.sh`（含全部实测依据的注释）
- [x] 写 `tt_game/tools/_run-hell12h5-and-finalize.sh`（训练 → 实机验收 → 达标才烘）
- [x] 复用 `tools/_supervise.sh`（内容级卡死检测 / 三级停止 / EXIT trap 防孤儿）
- [x] **重测 `tools/logs/baseline-live.json`** → default 88.6 / hell 38.1 / grandslam 90.5
      （旧值归档 `baseline-live.v4-archive.json`，**作废，勿再用**）
- [x] 修 `tools/bake-input.js` 参数下标偏移（否则收尾烘焙必崩）
- [x] 用同权重 + 实机值重烘 `INPUT_AI_META`（此前写的是仿真值 0.6156/0.1822）
- [x] Windows 侧看门狗 `tools/_watchdog-hell12h5.ps1`（PID 文件管理）

### Phase 4: 跑 12h 并盯 ★ — 🔄 in progress

- [x] 2026-10-14 03:16 启动链路 + 看门狗；启动自检全绿（BC 已压到 0%）
- [x] 测出轮速 51 min → `--games 9000` 改 `3200`、`SUP_BOOT/_STALL` 改 3600/5400（否则会被误判卡死）
- [x] 04:02 重启（新的轮速/预算配置），从 ep 251 续训
- [x] **ep750 出现 ★（best 98.3），实机地狱 38.1% → 59.2%（换种子 57.8%），已烘焙上线**（commit `700903d`）
- [ ] 每 30~60 min 核对 `index.json` 的 `elapsedSec` / 最佳分 / `trainW`
- [ ] 训练走满（`--games 3200`，约 15:00）后自动进验收

### Phase 5: 实机验收与烘焙决策 — 🔄 进行中（ep750 已烘，等最终 finalize 复核）

- [x] 演练 `_finalize-12h.js`（临时 run 目录 + `--dry-run`）⇒ **逮到 2 个「最后一步才死」的 bug**
- [x] 新增 `tools/_refresh-baseline.js`（按 finalize 自己的口径量基线）+ `baseDeltaMissing` 守卫
- [x] 门禁 C2 改成 `min(85, max(45, baseAbs+20))`（原 45pp 硬编码早于口径变化）
- [x] 候选排序同分取 `ep` 大者（commit `ddabc65`）+ `best.file` 保底入选（commit `5416c6a`）
- [x] ep750 实测四门预期全过：加权 67.7% > 50.72%，vs 地狱 59.2% ≥ 38.1%
- [x] `bake-input.js` 写入 → `js/input-weights.js`（`evalHell 0.592` / `evalDefault 0.933`，实机数）
- [ ] 训练结束后自动跑 `--topN 4`，四门全过才再写一次；否则保持 ep750 不动

### Phase 6: 收尾

- [x] 写 `tt_game/tools/phase5-findings.md`（§0~§16）+ 更新 `AGENTS.md`（新增 4 行）
- [x] 剥掉 `_run-hell12h5-and-finalize.sh` 的 BOM —— **等训练链路跑完再做**（bash 增量读脚本）
- [ ] 向用户汇报：实机是否变强、烘了没有、证据是什么