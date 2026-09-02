# player.html 深度数据分析可视化方案（7 个新模块）

## 现状与基础
- player.html 是壳页面，内容由 `js/player-page.js` + `js/personal-stats.js` 动态渲染；唯一图表库 Chart.js 4.4.0（CDN 已引入），支持所需全部图表类型，**不新增依赖**
- `computePlayerMatchRecords()`（player-page.js:103）已逐赛季回放出每场比赛的 日期/类型/对手/胜负/赛前分/积分变化/赛后分 —— 新分析的主要数据源
- `rankingTimeline`（main.js 加载）含全部快照的全体积分，可推导历史排名
- 深浅主题用 `isDarkTheme()`，文案走 `i18n[currentLang]`，颜色基调沿用 `personalChartSettings`

## 新增模块（放在 playerStatsBody 与 playerMatchTable 之间的 `#playerAnalyticsBody`）
1. **排名走势图**：折线图（Y 轴反转，#1 在顶部），数据取自 rankingTimeline 逐节点排序；复用赛季分界虚线
2. **赛事类型分布**：环形图（各类型场次数，中心显示总场次）+ 图例区每类型 胜-负-胜率
3. **实力差胜负分析**：水平对称条形图，按「对手赛前分 − 我方赛前分」分档（领先≥100 / 50-99 / 0-49 / 落后 0-49 / 50-99 / ≥100）显示胜/负场数，突出「以弱胜强」能力，附各档胜率
4. **月度活跃度**：柱状图（每月场次数，含 0 场月份）+ 胜率折线叠加（双 Y 轴组合图）
5. **竞技状态卡**：当前连胜/连败、历史最长连胜/连败、近 10 场 W/L 状态圆点（form guide）、滚动 10 场胜率迷你走势线
6. **赛季对比卡**：每赛季一行的小表格——场次、胜负、胜率、净积分变化（含 bonus）、赛季最高分
7. **积分来源构成**：按赛事类型的累计积分变化堆叠面积图（用实际计入的 `change`，体现衰减）

数据不足（如某图 <2 个数据点）时该模块整体隐藏或显示空态，风格沿用现有 `wtt_empty`。

## 文件改动
| 文件 | 改动 |
|---|---|
| **js/player-analytics.js（新建，~500 行）** | `renderPlayerAnalytics(playerName)`：计算 + 渲染上述 7 模块；`paActiveCharts[]` 注册所有 Chart 实例；`destroyPlayerAnalytics()` 统一销毁 |
| **player.html** | 增加一行 `<script src="js/player-analytics.js">`（player-page.js 之后） |
| **js/player-page.js** | `initPlayerPage`/`reapplyPlayerPage` 插入 `<div id="playerAnalyticsBody">` 并调用渲染；`reapplyPlayerPage` 重建前先 `destroyPlayerAnalytics()`；`computePlayerMatchRecords` 每条对局记录增加 `oppPre` 字段（对手赛前分，纯记录、不改任何得分计算）；`renderPlayerMatchTable` 增加可选 records 参数避免重复回放计算 |
| **js/personal-stats.js** | 把 `renderPersonalScoreChart` 内联的 seasonBoundaries 插件（行 1006-1024、1091-1126）抽为顶层 `createSeasonBoundaryPlugin(dataPoints, isDark)` 供复用，原行为不变 |
| **js/common.js** | i18n 新增 `pa_*` 双语键（约 35 个：模块标题、轴标签、状态卡文案等） |
| **style.css** | 新增分析区样式：两列响应式网格（移动端单列）、环形图图例、赛季对比表、form 圆点等；复用现有 `.glass-card`/`.personal-card` 设计变量 |

## 约束
- 不改积分引擎的任何计算逻辑（`oppPre` 只是额外记录）；不动 data/*.json；总览页 personal_stats.html 不受影响（新逻辑全部在 player 专属文件）
- 中英切换、深浅主题均正常工作（语言切换走 reapplyPlayerPage 全量重渲，图表先 destroy 防泄漏）

## 验证
- 用浏览器打开 `player.html?uid=10000` 等不同数据量的球员（多场次/仅几场/含 bonus/几乎无对手数据）逐模块检查渲染、空态、tooltip
- 切换 zh/en、深/浅主题各验证一轮；确认语言切换多次后无 Chart 报错（控制台无泄漏告警）
- 跑 `python tools/ci_validate.py` 确认数据层无影响（本次不改 data/，预期全绿）