# 六维战力雷达（Capability Radar）— 技术口径文档

> 创建：2026-10-25。本页是面向维护者的实现口径记录；前台不含本页。
> 雷达是**纯展示层**：不参与积分计算、不进 `data/api/`、不进任何校验口径。

## 0. 一句话

把「怎么赢的」拆成六根轴（每轴 0–100，缺省值兜底），综合战力指数 = round(六维均值)，映射 S+ ≥80 / S 70–79 / A 60–69 / B <60。社团侧与 WTT 侧共用一套公式骨架，只有第④维阈值、第③维「大赛」定义和第⑤维含义不同。

## 1. 六轴口径（两侧对照）

| # | 轴 | 缺省 | 社团（club） | WTT |
|---|---|---|---|---|
| ① | 胜率统治力 | 30 | 全部正式对局（含双打、pair 拆成员）胜率 | 同左（双打分项按 pair 实体） |
| ② | 高阶赛制力 | 30 | `赛制 ∈ {bo5, bo7}`（缺失按 event-coefficient `默认赛制`），100% 覆盖 | **无赛制字段**，由 `比分` 首字符反推（3-x→bo5、4-x→bo7）；全量覆盖仅 32.3%，**截断样本** |
| ③ | 大赛含金量 | 30 | 类型白名单：校乒赛单打/校乒赛团体/十二强赛/校乒联赛（`CR_CONFIG.club.majorTypes`） | `event-coefficient` 系数 ≥ 1.2（奥运会 2.25 / 世乒赛 1.83 / 世界杯 1.62 / 奥运会团体 1.5 / 总决赛 1.35 / 大满贯 1.24 / 世乒赛团体·亚运会·全运会·洲锦赛 1.21） |
| ④ | 强敌对抗力 | 30 | 对手**赛前回放积分** ≥ **2000**；双打看对方任一成员的单打赛前分 | 同公式，阈值 **1800**（WTT 中位 1490、≥2000 全库 0.3–0.5%，2000 无区分度）；双打分项看对方 pair 实体赛前分 |
| ⑤ | 积极度 / 巅峰保持率 | 30（0 个比赛日） | **按参赛的比赛日数对数放缩**（含双打、截至快照日的 distinct 日期）：raw = 100 × log(1+天数) ÷ log(1+最多天数)，参赛最多者记满分（最大天数动态计算并缓存，`crClubMaxMatchDays`） | **「巅峰保持率」**：r = min(1.10, 当前分 ÷ 生涯峰值分)，锚定区间 [0.996, 1.00]（见 §1.1）。原因：WTT `SCORE_TIME_DECAY_ENABLED=false` ⇒ 定格保值率恒 1.0，零信息量 |
| ⑥ | 零封 | 30 | 零封（比分 3-0 / 2-0 / 4-0）÷ **有比分的胜场** ×80 + min(25, 总胜×0.8)；无比分胜场不进分母（只进胜场加成） | 同左；WTT 比分覆盖 32.3%，**截断样本**（UI 显示 ⓘ） |

## 1.1 放缩与缺省（2026-10-25 站长二次定稿）

1. **全轴放缩**：每轴公式原始分 raw（归一到 0–100，>100 先钳到 100）线性映射 `score = round(30 + raw×0.7)`——0 分记 30、满分记 100。旧版各轴不同的下限（25/30/35）全部废弃，六轴统一 30–100。
2. **缺省值统一 30**：任一轴无样本时记 30（原 ①50/②60/③55/④60/⑥50）。⑥的「无样本」= **无比分的胜场**（新分母）。
3. **⑤的演变**（2026-10-25 多次定稿）：最初为「定格保值率」r×75+活跃加成，实测 r∈[0.996,1.005] 无区分度；次日改为 r 锚定 [0.996, 1.00]（r=1.00 记满分）；随后改为线性参赛天数（50 天满分）；最终定为**对数放缩**——参赛最多者记满分、其余按 log(1+天数) 比例递减（对数曲线：早期参赛天数边际收益高，长尾递减）。「活跃加成」与无衰减重放（`computeNoDecayScoreMapAsOf`，引擎中保留备用）自此退出⑤的计算。WTT 侧维持「巅峰保持率」r 锚定公式。

公式（两侧同构；raw 为各轴 0–100 原始分，最终分 = round(30 + min(100, raw) × 0.7)）：

```
① raw = 胜/总×100
② raw = 长盘胜/长盘总×100
③ raw = 大赛胜率×100 + min(20, 大赛场次×2)
④ raw = 强敌胜率×90 + min(25, 强敌胜场×3)
⑤ raw = 100 × log(1+参赛天数) ÷ log(1+最多参赛天数)（club，最多者=100）；r 锚定 [0.996, 1.00]（WTT）
⑥ raw = 零封/有比分胜场×80 + min(25, 总胜×0.8)
综合 = round(六维均值)；全部落在 [30, 100]
```

**显示名（2026-10-25 站长定名）**：社团第⑤轴前台显示为「积极度」（EN Activity），第⑥轴「零封」（EN Sweeps / Sweep Rate）——计算口径不变（⑤即定格保值率公式、⑥即零封占比），改名只涉及 i18n 词典 `radar_ax5_short_club` / `radar_ax5_full_club` / `radar_ax6_*`；WTT 第⑤轴仍为「巅峰保持率」。

## 2. 关键口径决定（与说明书原稿的差异）

1. **④赛前积分 = 比赛当日回放口径**（score-engine.js 顶部「产生分」注释同款语义：把更早记录回放到该比赛日评估，frozen + 各类型尾批衰减到该日）。与 match-detail club 模式的「衰减到今天」口径不同——**有意不改 match-detail**，两处口径各自成立。含义：对手「当时 2010、如今 1980」仍算强敌。
2. **⑤无衰减全额 = 全历史 weight=1 重放**：产生分走 `calcRawPoints`（本就无时间权重），胜者 +raw、负者 −raw×LOSER_POINT_MULTIPLIER(0.8)、逐步钳 1200 地板；跨赛季 50% 继承按同一口径自算（不复用 `_seasonStartCache`——那是衰减口径缓存）。**不动 `SCORE_TIME_DECAY_ENABLED`**（动了会把赛制系数和败方系数一起关掉）。
3. **双打归属**：①②③⑥把 pair 胜负拆记到两名成员（`crRecordParticipants`）；④社团侧看对方成员单打赛前分任一 ≥ 阈值，WTT 双打分项看对方 pair 实体分（分项宇宙隔离，不跨 md/ws 查成员分）。
4. **asOf**：v1 四处落点均取「当前」（社团=今天、WTT=已加载日志）；`computeClubRadar(name, asOfDate)` 已留参数，未来可接 season-review / 时间节点。
5. **WTT 大赛档**用系数 ≥1.2 而非类型白名单——WTT 32 种类型逐个列白名单不可维护，系数表本身就是权威分级。

## 3. 已知数据限制（UI 有提示）

- **WTT ②⑥ 截断**：比分覆盖率 32.3%，且系统性偏向联赛档（德甲/洲锦赛近 100%）而大赛档最低（大满贯 7.2%、世乒赛 15.6%）。轴上显示样本数 n + ⓘ 说明「仅统计已录入比分的场次」。
- **社团 ⑥**：校乒赛团体 43 场全无比分——团体胜场只进分母（规格本意：没有证据不记横扫）。
- **⑥ 的分母是胜场不是场次**：负场无比分不影响本维。

## 4. 实现指针

| 文件 | 内容 |
|---|---|
| `js/score-engine.js` | `buildPreMatchBasisTable(singlesLog, doublesLog)` — 逐场赛前回放积分表（镜像 `buildRawPointsTable` 的 frozen+tail 状态机；单打记录推进状态并捕获双方赛前分，双打只捕获四名成员赛前分；缓存键 = 日志引用+initial+t+floor）；`computeNoDecayScoreMapAsOf(asOfDate)` — 无衰减全额重放 |
| `js/capability-radar.js` | 全部雷达逻辑：`CR_CONFIG`（阈值/大赛定义）、`computeClubRadar(name, asOf?)`、`crWttBuildRadarAggregates()`（单遍回放聚合，按 `wttScoreLogData` 引用缓存，ms 3.2 万条实测 ~200ms）、`computeWttRadar(subject)`、`renderRadarChart(canvas, subjects, opts)`、`crGradeOf` |
| `js/player-analytics.js` | `renderPlayerAnalytics` 首位插入雷达通栏卡；`opts.wttMode` 区分社团/WTT（wtt_player.js 两处传入 `{wttMode:true}`） |
| `js/data-viz.js` | 数据大屏**独立雷达区块**（data_viz.html `#viz-radar`，位于排名变化河流图与球员对比之间）：`renderCompareSelects` 一并填充 `crRadarPlayerA/B` 下拉框；init 在 then 回调内（renderCompareSelects 之后，微任务时序）调 `crInitVizRadar()` 默认渲染实时榜前 2；`#applyRadar` 触发 `crMountVizRadar(a, b)`；`dataVizMainReapplyI18n` 调 `crRerenderVizRadar()` |
| `js/wtt_dataviz.js` | WTT 数据大屏**独立雷达区块**（wtt_dataviz.html `#viz-wtt-radar`，A/B 双下拉 + 对比按钮，与社团 data_viz 同构）：`wttRenderCompareSelects` 一并填充 `wttRadarPlayerA/B`；init 默认渲染实时榜前 2；`wttApplyRadar` 触发 `wttMountVizRadar(a, b)`（支持只选一人）；`wttReapplyI18n` 调 `wttRerenderVizRadar()`。旧「雷达对决（复选前 3 人）」形态已废弃 |
| `js/common.js` | i18n `radar_*` 键（zh/en 成对；第⑤维轴名与 tooltip 分 `_club` / `_wtt` 两套） |
| `style.css` | `.cr-*` 类（卡片、明细行、徽章、chips、对照表、reduced-motion） |
| HTML | `player.html` / `data_viz.html` / `wtt_player.html` / `wtt_dataviz.html` 各加 `<script src="js/capability-radar.js">` |

主题联动：`crEnsureThemeObserver()` 用 MutationObserver 监听 `<html>.dark-mode`（与 data-scale.js 同模式），`chart.update('none')` 即时换色。动效：入场 700ms easeOutQuart 展开；`prefers-reduced-motion` 时禁用（CSS + `crReducedMotion()` 双保险）。

## 5. 验证记录（2026-10-25）

Node vm 无头对拍（`common.js + score-engine.js + capability-radar.js + wtt_common.js` 真实代码 + 真实数据），10 项全 PASS：

- **A**：`buildPreMatchBasisTable` 赛前分差逐条 ≡ `getRecordBaseScoreInfo().gap`（387 条单打，0 mismatch）；双打 9 条 × 4 成员捕获完整。
- **C1**：无衰减重放——赛季 0 只赛一场的球员 = 初始分 ± 产生分（后续赛季 50% 继承不动）。
- **C2**：⑤ 转化率 r ∈ (0, 1.10] 全体 67 人无越界。
- **E**：任峻贤 ① = 116/216 → **54**，与说明书示例精确吻合；② 63/115→55、③ 10/12→100（clamp）、⑤ r≈1+216场→100、⑥ 15 零封/116 胜→35。
- **W1–W4**：WTT ms 32267 条回放聚合 202ms、缓存 0ms；FAN Zhendong 计数与日志直扫一致；r ∈ 界内。
  ⚠ 对拍脚本用 `wttLoadAllData()`（不加载 assoc 别名表），FAN 直扫 341 条；真实页面走 `wttLoadSettingsAndFiles(true)`（含 `wttLoadPlayerAssoc`）别名归一后 348 条。**浏览器是权威路径**——WTT 雷达聚合的输入依赖 assoc 加载后的别名归一，两个 WTT 页面（wtt_player.js:28 / wtt_dataviz.js:86）都走 includeAssoc=true，跨页一致；任何新的 WTT 调用方若跳过 assoc，同一球员的计数会偏低。
- 样本量级：社团 top5 综合 69–72（S/A），WTT 顶级 80–84（S+）——两侧分数各自成分布，不跨口径比较。

## 6. 维护注意

- 改六轴公式/阈值只动 `js/capability-radar.js` 的 `CR_CONFIG` + 各计算器，**不要**在渲染层复算。
- `buildPreMatchBasisTable` / `computeNoDecayScoreMapAsOf` 必须在**单打 `withScoreContext` 内**调用（`getScoreMapAsOf` / `getSeasonStartScores` 读全局）。
- 新增球员列表/排名渲染时保持 `visible:false` 过滤惯例——雷达的输入是 score-log 原始记录，天然包含隐藏球员的场次；前台展示以 `playerDisplayName` 现行为准，未额外按可见性过滤（与比赛记录表同口径）。
- 引擎若改 `buildRawPointsTable` 的状态机语义，`buildPreMatchBasisTable` 必须同步（两者是同一状态机的两个消费视角，oracle：逐条 gap 相等）。
