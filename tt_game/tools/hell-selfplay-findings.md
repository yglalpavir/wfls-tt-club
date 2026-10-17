# 地狱 AI 自对弈续训 — 第 1 / 2 轮技术记录

> 训练器 `tools/train-hell.js`（遗传算法），目标策略 `js/learned-policy.js` 的 `LEARNED_POLICY`（42 维）。
> 两轮均在 `--no-write` 下跑，**从未自动覆盖 `js/learned-policy.js`**，候选一律交人确认。
> 与第 1–5 轮训的「玩家侧 DQN」（`js/input-agent.js` / `js/input-weights.js`）**完全无关**。

---

## 0. 结论摘要

| 轮次 | 配置 | 代 | vs 线上地狱（实机口径） | 采纳 |
|---|---|---|---|---|
| 线上基线 | 2026-09-13 人工采纳 | 1000 | — | 已上线 |
| 第 1 轮 | 旧适应度 | 850 | **52.2 %**（1800 局） | 否（当时误判为 49.9 % 持平） |
| 第 2 轮 | **方案 A** | 330 | **57.27 %**（独立复评 3200 局双向实机口径） | 待用户确认 |

**两轮都真的变强了。** 第 1 轮被「对手口径错误」误判掉，第 2 轮换用正确的主目标口径后提升更明显（+7 pp 级别）。

---

## 1. 地狱 AI 是什么

- `js/learned-policy.js` 导出 `LEARNED_POLICY`（partial，未设字段回落 `POLICY_DEFAULT`）+ `LEARNED_META`。
- 实机经 `js/policy.js#strongVec()` 合并：
  ```js
  const L = Object.assign({}, LEARNED_POLICY, { moveSpeed: 2.8, moveErr: 0.03, moveZ: 2.6 });
  ```
  ⇒ **idx 0/1/2（`moveSpeed`/`moveErr`/`moveZ`）在实机被硬写**，`LEARNED_POLICY` 里的原始值永远不用。
- `policyForModel('hell') = unflattenPolicy(strongVec())`；`grandSlamPolicy()` 另硬写 2.9/0.02/2.7。

## 2. 训练器 `tools/train-hell.js`

- GA：`pop 24`；每代每个体对 4 个对手（`default` 默认 / `pb` 加强玩家模型 / `pusher` 搓球 / `self` 自对弈）各 2 种子；
- 每 10 代落盘 `tools/train-hell-curve.json` + `tools/train-hell-best.json`；收尾写 `tools/train-hell-candidate.json`；
- `--from <file>` 读 `{vec:[...]}` 续训；`--no-write` 永不覆盖 `js/learned-policy.js`；
- 内置最终验证 = 4 种子 × 40 局（新 vs 默认 / 新 vs 加强玩家模型 / **新 vs 旧地狱头对头**）。

---

## 3. 第 1 轮（850 代，旧适应度）为什么「看起来」零提升

旧适应度：`fit = 0.34*vs加强玩家 + 0.26*vs默认 + 0.26*vs自对弈 + 0.14*vs搓球`。

三条根因：

1. **适应度没有梯度**：`vs加强玩家 + vs默认` 共 60 % 权重常年顶在天花板（0.94 / 0.90），几乎贡献 0 梯度；唯一能动的自对弈项只占 0.26，且对手是**每代在动的 `best.v`（移动靶）**。
2. **★ 三维在实机里是死的**：训练/验证走 `unflattenPolicy(rawVec)`，实机走 `strongVec()` 硬写 idx 0/1/2 ⇒ 这三维练了也白练。第 1 轮候选**最大的改动恰好是 `moveZ`**（0.984→1.796）。
3. **跨代选优有噪声**：每代种子 `BASE.x + g*991`（跨代不可比），一代只跑 2 种子 × 24 局 ≈ 48 局（SE ≈ 7 pp）。

第 1 轮实测：`best.fit` 0.8087 → 0.8256 @ gen 524，之后 325 代无突破；内置验证 vs 旧地狱 49.36 %。

---

## 4. 方案 A 的四处改动（全部在 `tools/train-hell.js`）

1. **适应度主目标反转**：`fit = 0.52*vs现役 + 0.20*vs加强玩家 + 0.16*vs默认 + 0.12*vs搓球`。
2. **对手固定为 `curVec`**（不再用每代移动的 `best.v`）——这才是真正的「vs 现役头对头」。
3. **冻结 idx 0/1/2**：`FROZEN = [[0,2.8],[1,0.03],[2,2.6]]` + `applyFrozen()`；`mutate()` 跳过、种群随机初始化 `applyFrozen()`、续训起点也 `applyFrozen()` ⇒ **训练向量 == 实机向量**。
4. **每代局数 24 → 60** + **跨代固定种子**（去掉 `+g*991`），降低选优噪声。

---

## 5. 第 2 轮（330 代，2026-10-16 22:47:32 → 10-17 04:27:05）

- `bash tools/_supervise-hell.sh 330 --workers 20 --no-write`，**0 次重启**，`code=0`，**20373 s（5.66 h）**，`savedAtGen 1 → 329`；68 s/代。
- **`vs现役` 20 代窗口均值单调上升至末尾仍在涨**：

  | 代段 | 0-19 | 20-39 | 40-59 | 60-79 | 80-99 | 100-119 | 140-159 | 200-219 | 240-259 | 280-299 | 320-339 |
  |---|---|---|---|---|---|---|---|---|---|---|---|
  | vs现役 | 50.4 % | 52.4 % | 54.4 % | 55.0 % | 56.0 % | 56.3 % | 56.4 % | 56.6 % | 57.3 % | 58.2 % | **58.7 %** |
  | vs加强玩家 | 92.3 % | 91.9 % | 90.5 % | 90.9 % | 92.4 % | 92.1 % | 92.2 % | 92.4 % | 92.3 % | 91.6 % | 91.4 % |
  | vs默认 | 85.8 % | 85.3 % | 85.5 % | 85.0 % | 86.0 % | 85.6 % | 85.8 % | 86.0 % | 86.4 % | 86.2 % | 86.2 % |

  ⇒ **适应度梯度一直存在，未跑饱和**；护栏三项稳定，没有拿护栏换头对头。
- `best.fit` 起点 0.6723 → `0.7370 @ gen 255`。
- 内置最终验证（160 局）：vs 默认 84.3 %（旧 86.1 %）· vs 加强玩家模型 91.3 %（旧 91.8 %）· **vs 旧地狱 57.3 %**。
  `adopted: false` 仅因门槛 `vs默认 ≥ 旧-1.5pp` 差了 **0.29 pp**（160 局 SE ≈ 4 pp，噪声）。
- **独立复评（`tools/_hell-h2h.js 200 8`，3200 局双向）**：
  ```
  候选 vs 线上（候选先手）: 57.02%
  线上 vs 候选（线上先手）: 42.47%
  双向无偏：候选 = 57.27%     总局数 = 3200
  ```
  （SE ≈ 0.9 pp ⇒ 显著。同一候选的原始口径对照 = 48.32 %，与口径修正前的数字一致，反证「实机口径」才是唯一有意义的判据。）

---

## 6. ★ 口径修正：`tools/_hell-h2h.js`

`_hell-h2h.js` 原来拿 `unflattenPolicy(flattenPolicy(LEARNED_POLICY))`（**原始向量**）当对手 —— 那是**游戏里不存在的地狱 AI**（实机走 `strongVec()`）。
第 1 轮「49.9 % 持平」的结论就是被这个口径毁掉的（其最大改动恰是实机被覆写的 `moveZ`）。

已修正为默认 `P.strongVec()`（实机口径），`--opp-raw` 可回退；并新增 `--from <file>` 指定候选来源。校验：

```bash
node tt_game/tools/_hell-h2h.js 150 6                      # 默认实机口径
node tt_game/tools/_hell-h2h.js 150 6 --opp-raw            # 原始口径对照
node tt_game/tools/_hell-h2h.js 200 8 --from <candidate.json>
```

用实机口径重测第 1 轮候选（1800 局双向）：**52.22 %**（不是 49.9 %）。⇒ 第 1 轮也不是白跑。
用实机口径复评第 2 轮候选（3200 局双向）：**57.27 %**；同一候选的原始口径只有 48.32 %。
**同一份权重，换个对手口径就从「更强」变成「更弱」** —— 这是本轮最值得记住的一件事。

> **注意**：`train-hell.js` 内置的最终验证本身就是对的 —— 它的 `curVec` 已 `applyFrozen`。

---

## 7. 候选策略的变化与权衡

候选相对**实机地狱**改动最大的 12 维：

| idx | key | 范围 | 实机 | 候选 |
|---|---|---|---|---|
| 4 | push.forceThresh | 10-80 | 10 | 62.09 |
| 39 | receive.pushProb | 0.05-0.95 | 0.827 | 0.05 |
| 3 | push.prob | 0.2-0.95 | 0.95 | 0.208 |
| 40 | receive.attackProb | 0-0.8 | 0.765 | 0.112 |
| 24 | txWideMag | 0.2-0.9 | 0.642 | 0.2 |
| 27 | pushDepth | 0.6-1.6 | 1.469 | 1.032 |
| 20 | smashSpin | 0.8-1.3 | 0.809 | 1.095 |
| 28 | servePace | 0.85-1.3 | 1.012 | 1.254 |
| 17 | loopSpin | 0.85-1.35 | 1.35 | 1.11 |
| 37 | wide.backhand | 0.7-1.6 | 1.419 | 1.192 |
| 16 | loopPace | 0.85-1.3 | 1.117 | 0.893 |
| 38 | swipeSide | 0-1 | 0.395 | 0.619 |

读数：实机地狱原本**「能推就推」**（`push.forceThresh` 压最小值 10、`push.prob` 压最大值 0.95、`receive.pushProb` 0.827、`receive.attackProb` 0.765），
候选**把推送整体关掉、转向进攻**（`smashSpin`↑、`servePace`↑、`loopPace`↓、`receive.attackProb`↓）。

**权衡（必须在采纳前讲清）**：
- `vs 旧地狱头对头 57.27 %`（3200 局）⇒ 确实整体更强；
- 但 `vs 加强玩家模型` 基本持平（91.3 vs 91.8），`vs 默认` 降 1.8 pp（噪声范围）
  ⇒ 候选主要是**「克地狱」**（自对弈视角更难被同类打败），**并不明确「更难打人类」**。
  对「地狱 AI 的难度」而言这是提升；对「像人类高手一样打球」而言未必。

---

## 8. 复现命令

```bash
cd tt_game
node tools/train-hell.js --smoke --workers 20                      # 自检
node tools/train-hell.js --gens 330 --workers 20 --no-write        # 直接跑
bash tools/_supervise-hell.sh 330 --workers 20 --no-write          # 带防中断守护
node tools/_hell-h2h.js 200 8                                      # 双向对打复评（实机口径）
touch data/.stop/hell-selfplay.stop                                # 停止
```

---

## 9. 遗留问题

1. tracked 的 `tools/train-hell-{best,candidate,curve}.json`：提交留档还是 `git checkout` 还原成 2026-09-13 的记录？
2. 守护脚本（`_supervise-hell.sh` / `_watchdog-hell.ps1` / `_wait-hell-selfplay.ps1` / `_hell-h2h.js`）要不要提交？
3. 末尾窗口仍在上升 ⇒ 要不要继续训（第 3 轮，从本轮 `train-hell-candidate.json` 起续）？
4. 采纳后建议复核 `strongVec()` 的护栏覆写是否仍有必要（训练已把这三维钉在护栏值上，覆写成为幂等操作）。
