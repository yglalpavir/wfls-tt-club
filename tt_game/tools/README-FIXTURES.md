# tt_game/tools 在环研究工具索引（fixture 时代）

> 本目录是 HIP/DQN 研究的工具链。实机口径定案：`hip-eval.js` / `live-match.js`，
> maxsec 120、seed 20261004、`--move-cap 2.0`（默认）。**sim 已饱和不可排名**，
> 一切候选只认实机读数。六条方法论铁律见 `../docs/tech/hip-framework.md` §7c。

## 回归基准（必读）

```bash
node tools/_fixture-check.js          # 全量：六档 × 40 局（~105 分钟）
node tools/_fixture-check.js --quick  # 抽检：hell/nemesis2 × 20 局（~15 分钟）
```

- fixture 基准 = `hip-framework.md` §13㉛（R45 五档带内读数 + R55 elite，
  seed 20261004）；六档与 `hip-framework.md` §7b 基线表全对齐
- 出带 → exit 1。任何 `tt_game/js` 改动后必跑。
- `data/hip/_cfg_roster.json`（txBias −0.05）= 表驱动阵容的 CLI 复现
  （R44 等价性论证：表内对手 `--hip-cfg` 全局 bias ≡ 浏览器表驱动）。
- **确定性已实测**（R57）：同种子重跑核心读数逐位一致（仅尾部耗时行不同）。
- **关键定案读数入库**：`data/verdicts/`（9 个文件，git 跟踪）= fixture 六档
  + R8 转正决策包三腿的原始读数；其余 361 个原始读数在 `data/hip/`
  （gitignored，可由同种子重跑再生）。

## 在环管线核心

| 工具 | 一句话用途 |
|---|---|
| `live-rig.js` | 进程内 rig API（`buildRig`/`playGame`/`setOpp`），~4s/局；PIPELINE 是装配唯一真相 |
| `live-match.js` | **唯一验收裁判**：vm 跑真 js 文件 + 虚拟时钟；`--hell-vec`/`--nem-vec` 注入、`--hip-probe` 探针、`--hip-cfg` 旋钮覆盖 |
| `hip-eval.js` | 实机评测门（多对手、Wilson CI、失分分解、`--ckptdir` ckpt 排名、`--grid` 扫描） |
| `live-search.js` | 坐标下降旋钮搜索（建立在 live-rig 上） |
| `live-residual-probe.js` | 逐通道敏感性探针（my/sw 残差） |
| `live-bandit-bias.js` | bandit 式 txBias 逐对手搜索（R4 表的来源） |
| `live-opp-bias-table.js` | 逐对手 bias 表评估 |
| `live-cma-residual.js` | CMA-ES 残差学习（R5 v2，已判决暂停） |
| `live-traj-spike.js` | 轨迹采集 spike |

## 研究期一次性脚本（按实验存档，可重跑）

| 脚本 | 对应轮次 | 产出 |
|---|---|---|
| `_allball-bias.js` | R12/R23 | 无偏弹跳误差分布（含长尾归因） |
| `_sel-effect-exploit.js` | R27 | 误差桶 × 触达率（选择效应定量） |
| `_dqn-bias-probe.js` | R28 | DQN 拍面深度误差量化（包 bestAction） |
| `_opp-recv-dist.js` | R35 | 对手接球位置 8 桶直方图 |
| `_recv-dist-matrix.js` | R37 | 接球分布矩阵（双 AI 斗蛐蛐） |
| `_vec-compare.js` | R46 | nemesis/nemesis2/hell 三向量参数对比 |
| `_cand-compare2.js` | R47 | R8 候选 vs 现役 nemesis 参数对比 |
| `_ret-speed-probe.js` | R40 | txBias 对对手回球到达速度影响（=零） |
| `_browser-path-verify.js` | R25 | startFight 表驱动端到端 8 用例 |

## 数据与文档

- 实验原始读数：`data/hip/*.txt`（UTF-8；PowerShell 重定向产物需检测 FF FE BOM）
- 研究文档：`../docs/tech/hip-framework.md`（§1.18.11 §13①~㉝ 过程 / §7a~7c 收官）
  与 `../docs/reports/hip-m3-findings.md`（§11e）
- 提交纪律：只提交 `tt_game/` 与 `AGENTS.md`；用户文件
  （`js/common.js`、`js/match-detail.js`、`style.css`、`wtt_*.html`）不碰
