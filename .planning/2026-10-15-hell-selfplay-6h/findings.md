# findings.md — 自对弈续训地狱 AI

## 1. 两套「AI」的区分（最容易搞错的地方）

| | 玩家侧 DQN（第 1–5 轮训的） | **地狱 AI（本轮）** |
|---|---|---|
| 代码 | `js/input-agent.js` | `js/policy.js` + `js/learned-policy.js` |
| 权重 | `js/input-weights.js` | `js/learned-policy.js` 的 `LEARNED_POLICY` |
| 训练器 | `tools/train-input3.js` | **`tools/train-hell.js`** |
| 验收 | `tools/live-match.js`（真引擎） | `tools/train-hell.js` 内置独立最终验证（simmatch 口径） |

本轮只动第二列。

## 2. 地狱 AI 现状（`js/learned-policy.js`，2026-09-13 采纳）

`LEARNED_META`：
```json
{ "fitness": 0.834, "pointRateVsDefault": 0.9168, "pointRateVsPlayer": 0.9272,
  "pointRateVsOldHell": 0.8738, "vsPlayerOld": 0.9709, "generations": 1000,
  "seed": 20260913, "evals": 192000, "bestGen": 794, "mode": "selfplay-42dim",
  "trainedAt": "2026-09-13",
  "adopted": "manual (user-approved 2026-09-13: 头对头87.4% / vs默认+13pp / vs玩家模型-4.4pp天花板区)" }
```
⇒ 上一轮是 1000 代、794 代取最优、**人工采纳**。

## 3. `tools/train-hell.js` 机制（逐行读过，323 行）

- CLI：`--smoke | --gens | --games | --pop | --seed | --workers | --write | --no-write | --from <file> | --nice`
- 默认 `gens 400, games 24, pop 24, seed 20260810, workers = max(2,min(24,cpus))`
- `--write` 是死参数（`opt.write` 从未被读）；**不加 `--no-write` 就会自动采纳**。
- 续训起点：`--from` 优先；否则 `require('../js/learned-policy.js').LEARNED_POLICY`；再否则 `POLICY_DEFAULT`。
- 种群：pop[0]=curVec(`cur`)、pop[1]=POLICY_DEFAULT(`base`)、其余均匀随机(`rand`)。
- 适应度 `m.fit = 0.34*fPB + 0.26*fDef + 0.26*fSelf + 0.14*fPush`（L209）。
- 选择：`eliteN = max(2, ceil(pop*0.25))`，其余由随机精英父代 `mutate(sigma)`；`sigma = 0.09*(1-g/gens)+0.025`。
- 落盘：`g%10===0 || g===gens-1` 时写 curve + best（L218-232）。**best 是策略本体，curve 只有标量。**
- 最终验证 `val(v,opp,base)` = 4 种子 × 40 局均值（种子 `7770000+seed + k*617`，k=0..3）。
- 采纳 `adopt = !opt.noWrite && confNewVsCur >= 0.515 && nVd >= cVd-0.015 && nVp >= cVp-0.04`（L270）。
- 无论采纳与否都写 `tools/train-hell-candidate.json`（含 `vec` 与全部验证数字）。
- `opt.grandslam` 在 L290 被引用但**没有任何地方设置它**（永远是 undefined）。

## 4. 评估口径 = `js/simmatch.js`（不是真引擎！）

`train-hell-worker.js`：
```js
const m = SIMMATCH.playMatch(pol, opp, { games: t.games, rngFactory: rngF });
return m.pointRate;
```
- 对手：`self` → `P.unflattenPolicy(t.curVec)`；`default` → `P.POLICY_DEFAULT`；`pb` → `PM.currentBoost()` 或 `PM.PLAYER_MODEL_BOOST`；`pusher` → 本地搓球狂常量。
- ⚠️ **所有强度数字都来自 `simmatch`，不是浏览器里的真引擎**。历史遗留口径，用户已接受（2026-09-13 的采纳数字也是 simmatch）。
- 交叉验证思路（Phase 6）：用 `tools/live-match.js`（真引擎 vm）跑「玩家 AI vs 旧地狱」与「玩家 AI vs 新地狱」，
  玩家侧胜率下降 ⇒ 新地狱在真引擎里也更强。

## 5. 测速与预算

- `--smoke`（7.6 s）：默认 vs 默认 49.2%；当前地狱 vs 加强玩家模型 93.6%；地狱自对弈 50.1%。⇒ worker 池 / 镜像自检正常。
- `--gens 2 --no-write --workers 20`：gen0 @25.9s，gen1 @51.0s，`ELAPSED_SEC=60` ⇒ **≈25.5 s/代**。
- 一代 = 24 个体 × 4 对手 × 2 种子 × 24 局 = **4608 局**。
- 850 代 ≈ 21 675 s ≈ **6.0 h**。

## 6. 防中断设计（本轮新增）

`tools/_supervise-hell.sh`（新）：
- 单实例锁 `data/.stop/hell-selfplay.lock`（写 MSYS `$$`）+ `tools/logs/_hell-selfplay.winpid`（写 `/proc/$$/winpid`，供 PowerShell 查存活）。
- 进度状态 `tools/logs/_hell-selfplay.state`（已完成的代数）。有该文件 ⇒ 从 `--from tools/train-hell-best.json` 续跑；没有 ⇒ 全新起跑。
- 判进度看 **`train-hell-best.json` 的 `savedAtGen` 是否推进**，不看进程存活、不看退出码（吸取第 5 轮 `code=0` 空转 14h 的教训）。
- 停止哨兵 `data/.stop/hell-selfplay.stop`。

`tools/_watchdog-hell.ps1`（新，**纯 ASCII**，避免 PowerShell 5.1 对无 BOM UTF-8 的解析崩溃）：
- 每 300 s 检查；用 `tools/logs/_hell-selfplay.winpid` 查进程存活，退化方案是按命令行文本匹配 `bash.exe`（只读，不杀）。
- 监督者不在且无停止哨兵且代数未满 ⇒ `Start-Process` 重新拉起守护。

## 7. 环境坑（本轮实际踩到的）

- `bash` **不在 PATH**；完整路径 `C:\Program Files\Git\bin\bash.exe`。
- Git Bash 的 `$$` 是 MSYS PID（如 29/376），PowerShell 的 `Get-Process -Id` 查不到；
  `/proc/$$/winpid` 可以拿到 Windows PID（已实测）。
- 我自己的测速运行把三个 **tracked** 文件（`tools/train-hell-{best,candidate,curve}.json`）覆盖了 → 已 `git checkout` 还原。
- `docs/qq/*` 是用户自己在改的文件（`M docs/qq/preview.html` + 3 个未跟踪的 avatar-logo-*.html），**不要动**。

---

## ★ 口径修正（2026-10-17 00:30）—— 复评工具之前测的是「游戏里不存在的地狱 AI」

### 问题

游戏里的地狱 AI 走 `js/policy.js#strongVec()`：

```js
const L = Object.assign({}, LEARNED_POLICY, { moveSpeed: 2.8, moveErr: 0.03, moveZ: 2.6 });
```

它把 **idx 0/1/2 硬写成护栏值 2.8 / 0.03 / 2.6**。而 `js/learned-policy.js` 里
`LEARNED_POLICY` 的原始值是 `moveSpeed≈3.348 / moveErr≈0 / moveZ≈0.984` —— **实机永远不用**。

`tools/_hell-h2h.js` 原来拿 `unflattenPolicy(flattenPolicy(LEARNED_POLICY))`（**原始向量**）当对手，
所以它测的是「原始地狱」而不是「实机地狱」。**第一轮的 `49.90 %` 也是这个口径**，
而第一轮候选**最大的改动恰好是 `moveZ`（0.984→1.796）**——一个实机被覆盖、根本不生效的维度。
⇒ 第一轮「持平 / 不采纳」的结论是在一个游戏不使用的口径下得出的，**必须重测**。

### 修正

`_hell-h2h.js` 现在默认用 **`P.strongVec()`（实机口径）** 当对手，`--opp-raw` 才切回原始向量；
并新增 `--from <file>` 以指定候选来源（默认 `tools/train-hell-candidate.json`），
用于长跑途中指向 `tools/train-hell-best.json` 做中途预判。

### 修正后的数字（第二轮候选 `best` @ gen 76，各 1800 局双向无偏）

| 对手口径 | 候选胜率 | 结论 |
|---|---|---|
| **`strongVec()` = 实机地狱 AI** | **56.40 %** | **候选更强**（+6.4 pp，SE ≈ 1.2 pp ⇒ 显著） |
| 原始 `LEARNED_POLICY`（实机不用） | 46.07 % | 原始更强 |

⇒ 训练里 `vs现役` 从 48.5 % 爬到 56 % 是**真实的**，不是自对弈循环的假提升。

### 对 `train-hell.js` 的影响

`val(curVec, 'self', confBase)` 里的 `curVec` 已 `applyFrozen`（= 实机值），
所以**内置最终验证的口径是对的**；只有我的 `_hell-h2h.js` 错了，现已修正。

### 待办

- [ ] 用实机口径回测第一轮候选（`tools/logs/_run850-best.json`）→ `tools/logs/_h2h-run850-ingame.txt`
