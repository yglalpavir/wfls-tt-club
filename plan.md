# WFLS-TT-Club 第二轮审计与改进计划（2026-09-01）

> 审计方式：三路并行复审（JS 核心 / Python 工具与数据 / 页面层）+ 关键发现逐项人工核实
> 前置衔接：上轮（2026-08-24）Phase 0–2 已基本完成并验证（.nojekyll、XSS 事件委托迁移、静默失败治理、详情页竞态、safeStorage、i18n 批次、sync_content 修复、SEO 三项、暴露面收缩、2001 赛季、秋季赛季+CI 守卫、WTT 上下文安全化、暗色防闪、a11y 批次、404/分页、WTT 日史重写）。本轮重点：上轮修复的回归与残留、数据正确性、工具链门禁缺口。
> **已裁决（业务）**：score-log.json 中 21 组同日完全重复对局为**真实多次对局**（同日多局属正常录入），**不做去重**；ci_validate 不引入重复检测；口径写入 README。

---

## 一、结论摘要

1. **上轮修复产生两类新问题**
   - **回归**：5 处标题标签错配——上轮 h4→h3 / h3→h2 只改了开标签没改闭标签（已逐行核实 ranking.html:75、wtt_ranking.html:66、wtt_dataviz.html:282/284、wtt_assoc.html:352）。
   - **漂移残留**：上轮把明细弹窗改用 LOSER_POINT_MULTIPLIER 只覆盖了 ranking.js/player-page.js/WTT 克隆；club 管线的 data-viz.js（9 处）与 personal-stats.js（5 处）仍硬编码 `*0.8`。
2. **数据面**：`data/` 内误入 npm 残留（package.json + package-lock.json，08-31 出现）；news n11 无正文仍可被搜索；重复对局已裁决为正常（见上）。
3. **工具链门禁有系统性漏洞**：`sync_content.py --check` 不比对生成产物与磁盘（手改 index.json CI 照样绿）；ci_validate.py 遇坏记录直接 KeyError 崩溃，且缺 bonus 分数/赛制/赛季日期/players-draws schema 校验。
4. **引擎口径隐患**：personal-stats 日史衰减用死常量 HALF_LIFE_DAYS(180) 而非配置值（decay-config 实际 t=45）；每局重放用比赛日期做衰减基准，与排名弹窗口径不一；WTT 手工全局交换无 try/finally。
5. **页面层根因债**：nav/footer/QR 每页 4–5KB 复制粘贴（标题错配这类回归的直接根源）；公共页 fetch 失败永远"加载中"转圈。

---

## 二、Bug 清单（位置均经本轮核实；行号为 2026-09-01 工作区）

### 🔴 P0 数据与回归

| # | 问题 | 位置 | 修复方向 |
|---|------|------|----------|
| P0-1 | `data/` 内 npm 残留（dep: ittf-pingpong），若在 data/ 跑 npm install，node_modules 数千 JSON 会被 ci_validate 遍历 | data/package.json、data/package-lock.json | 删除两个文件 |
| P0-2 | 5 处 `<hN>…</hM>` 错配（上轮回归） | ranking.html:75、wtt_ranking.html:66（h2…/h3）；wtt_dataviz.html:282/284、wtt_assoc.html:352（h3…/h4） | 闭标签对齐开标签 |
| P0-3 | news n11 无 content/contentFile，搜索结果正文为空 | data/news/n11/n11.json | 补正文或 `"visible": false` |

### 🟠 P1 引擎/前端正确性

| # | 问题 | 位置 | 修复方向 |
|---|------|------|----------|
| P1-1 | 日史衰减用死常量 HALF_LIFE_DAYS=180，非配置值 DECAY_HALF_LIFE_DAYS（t=45）；且该 LUT 是死代码（循环实际走 getFreezeWeight），每次调用白分配 3000 元素 Float64Array | personal-stats.js:784-786；常量 common.js:232 | 删除 LUT 与 getDecay 死代码 |
| P1-2 | club 管线 14 处硬编码 `*0.8`，未用 LOSER_POINT_MULTIPLIER（WTT 侧已迁移，漂移实锤） | data-viz.js:479,496,498,500,555×3,604,713,716,719；personal-stats.js:381,551,554,557,875 | 全部替换为全局常量 |
| P1-3 | 每局重放把比赛日期当衰减基准，与排名明细弹窗（传快照日）口径不一 | player-page.js:126；data-viz.js:555,602,710；personal-stats.js:379,548 | 统一传当前快照日 |
| P1-4 | wttRenderScoreDetail 手工 swap 4 个引擎全局，无 try/finally；中途抛异常则 club 全局永久指向 WTT 数据。同文件已有安全的 wttWithDataContext 未使用 | wtt_ranking.js:97-109,193-194 | 改走 wttWithDataContext |
| P1-5 | WTT 明细/重放 6 处漏传"赛制"参数（当前因 WTT 禁衰减而中性，属埋雷） | wtt_ranking.js:142-143；wtt_player.js:164-165；wtt_personal_stats.js:549；wtt_dataviz.js:659,675,783 | 补传 record['赛制'] |
| P1-6 | getSeasonForDate 对**赛季开始前**的日期回退返回"最后一个"赛季（应为第一个） | score-engine.js:500-506 | 早于首赛季时返回 seasonsData[0] |
| P1-7 | initialScore 无 Number 强转（字符串会引发字符串拼接链，getBaseScore(NaN)=66）；currentScores[winner] `||` DEFAULT 对合法 0 分误替换 | score-engine.js:138,698；SCORE_FLOOR common.js:232 | `Number(x) || DEFAULT`；用 typeof 判数 |
| P1-8 | 未来日期比赛 dd<0 → weight=0，静默贡献零分（数据笔误不可见）；日期校验只查字符串不查格式 | score-engine.js:68；wtt_common.js:572-596 | normalize 时校验 `^\d{4}-\d{2}-\d{2}$` 并 console.warn 未来记录 |
| P1-9 | loadSeasons/loadScoreLogData 及 wtt_common 5 处 fetch 不查 resp.ok（404 HTML 报成 parse error，掩盖真因） | score-engine.js:721-722；wtt_common.js:602,722,733,784,794 | 统一加 resp.ok 检查 |
| P1-10 | wttInitialized 加载失败不复位 → 无法重试，只能刷新页面 | wtt_ranking.js:201-202 | catch 中复位标志 |
| P1-11 | 版本下拉每次打开叠挂一个 document 级 closeHandler（外部点击才自移除，反复开合即泄漏累积） | common.js:1045-1046 | 打开前先摘除旧 handler |
| P1-12 | 公共页 fetch 失败无错误态：静态"加载中"占位永远转圈（admin/wtt_hub 已有 .catch 范式可抄） | ranking.html:117、wtt_ranking.html:118、wtt_assoc.html:285/325、player.html:74 等 | main.js 统一 catch → 错误占位 + 重试按钮 + `<noscript>` |

### 🟡 P2 工具链 / i18n / 页面 / 卫生

**sync_content.py**

1. `--check` 不 diff 生成产物与磁盘 → 手改 index.json CI 照绿（最大门禁缺口）。修复：check 模式内存生成后逐文件比对字节，不一致报错。
2. 无 stdout UTF-8 reconfigure（GBK 控制台打印生僻字即崩），与 ci_validate.py:16-19 不一致。
3. folder 名 ≠ id 仅 warn 仍继续，且 Windows 大小写不敏感 → 历史分叉进两个目录。改为硬错误。
4. 快照与 manifest 两文件写非原子，崩溃可留孤儿 .v{n}.json；load_history 只查 manifest→file 不查反向 → 孤儿永不检测。加 file→manifest 方向校验。
5. check_type 不去重而 sync_type 去重（重复 id 时 warn 计数不一致）；check/sync 对 TODAY 取值时点不同（跨午夜漂移）。

**ci_validate.py**

6. 记录缺"负者"键时 KeyError 崩溃（r.get("胜者") 之后直接 r["负者"]，:86）；score-log 非 list 时 .get 崩溃。加结构守卫。
7. bonus 记录（比赛结果加分 ×37）完全绕过校验：分数恒为字符串 "+50"，前端 parseFloat("+5O")→0 静默吞掉。校验 parseFloat 可解析且非零。
8. 赛制零校验：238 局中 178 局缺"赛制"（靠默认赛制兜底），已有值不对照 赛制系数 键 {bo3,bo5,bo7}；默认赛制覆盖所有数值类型、decay noDecayTypes ⊆ 类型 均未断言。
9. 赛季校验弱：startDate/endDate 无 ISO 格式检查、无重叠/间隙检查、snapshotDates 未校验（2026-autumn 为空数组）。
10. players.json（uid/name 唯一、initialScore 数值、status 枚举）与 draws.json（competitionId 引用）无 schema 校验。
11. 注：**不加**重复对局检测（已裁决同日多局为正常录入）。

**i18n 缺口**

12. WTT 两处直出中文快照 label（英文页混排）：wtt_ranking.js:57、:338；wtt_player.js:63。根因是 formatSnapshotLabel（score-engine.js:497）计算期固化中文，club 侧有 getNodeDisplayLabel 运行期重解析，WTT 侧没接。
13. 搜索摘要"排名：/胜率："硬编码（common.js:487）；搜索占位"搜索..."与"加载中..."默认值（common.js:44,58）；图表 tooltip `${raw} 场` 与轴"年/月"（data-viz-extra.js:139,345,348,412；wtt_dataviz_extra.js:33,36,993,1224）；draws-viewer.js:93-97 工具 title。
14. 键错用：club 个人页用 wtt_ov_* 键（personal-stats.js:282-285）、player-page.js:155 用 wtt_bonus（club 键为 rank_add_short）；player-page.js:76 状态徽章仅英文模式渲染。

**页面层**

15. 搜索入口仅 index/contact 两页有（news/competitions/ranking 有 search.json 却无入口）；404.html noindex 却带 canonical（矛盾）；index.html:91 汉堡缺 aria-expanded；WTT 页脚丢失 data-i18n（wtt_dataviz.html:282-284、wtt_assoc.html:352）。
16. nav(~2.5KB)×18 + footer×18 + QR modal×14 + 主题脚本×20 全为复制粘贴——P0-2 类错配与页脚漂移的直接根源。方案：shared-partials.js 注入（无构建步骤下的最小改造）。
17. CDN：5 个依赖全无 SRI/integrity；marked@12 仅锁大版本；KaTeX 三件套被新闻/赛事/QA/详情全量加载（多数内容无公式）。加 integrity + 精确锁版 + KaTeX 检测到 `$`/`\(` 再加载。
18. 公开面收缩：tools/ 73 文件（爬虫源码+原始抓取数据）、docs/、data/_legacy/ 52KB、qa/q1 的 v1-v3 快照（每份 ~12KB 四份近重复）全被 Pages 公开部署；robots disallow 不是访问控制。git rm --cached 并考虑移出部署分支（tools/sync_content.py 与 ci_validate.py 两工具保留）。
19. 媒体：4.4MB 原图、57MB 视频无压缩直出；Google Fonts 13 字重。
20. 全局状态债（长期）：~45 个可变全局、async 交换窗口期 club/WTT 数据互见、WTT 三个入口加载函数无 single-flight、_seasonStartCache 按引用键控、loadRankingData 三重定义靠脚本顺序裁决。

**已核实无需修**：escapeHtml 已转义引号（AGENTS.md:44 描述过时，需更新文档）；内联 onclick 迁移已彻底完成；排序/平局/舍入逻辑无误；重复对局（已裁决正常）。

---

## 三、四阶段实施清单

### Phase 0 — 回归与数据急救（半小时级）

- [x] 删 data/package.json、data/package-lock.json
- [x] 修 5 处标题闭标签（ranking.html:75、wtt_ranking.html:66、wtt_dataviz.html:282/284、wtt_assoc.html:352）
- [x] news n11 补正文（依 excerpt 拟写管理层名单全文）；跑 `python tools/sync_content.py` 重建索引（自动归档 v2 快照）
- [x] README 补充"同日多局正常录入"口径说明（18→21 组）

### Phase 1 — 引擎/前端 bug（P1-1 ~ P1-12）

- [x] 删 personal-stats 死 LUT（P1-1）；`*0.8`→LOSER_POINT_MULTIPLIER ×14（P1-2）；重放衰减基准统一（P1-3，新增 getTodayStr()，getApproxScoreAtDate 用 targetDate）
- [x] wttRenderScoreDetail 改 wttWithDataContext（P1-4，提取 wttRenderScoreDetailInContext）；补赛制参数 ×8（P1-5，含 wtt_dataviz 两处 calcRawPoints）
- [x] getSeasonForDate 首赛季回退（P1-6）；initialScore Number 强转 + typeof 判数（P1-7）
- [x] normalizeScoreLog 日期格式校验 + 未来记录告警（P1-8）；resp.ok ×9（P1-9，含 loadScoreLogForViz/loadSeasons）；wttInitialized 失败复位（P1-10）
- [x] 版本下拉 handler 泄漏（P1-11，_detailVersionCloseHandler 复用）；公共页统一错误态 + noscript（P1-12，showRankingLoadFail + 20 页 noscript）

### Phase 2 — 工具链门禁

- [x] sync_content.py：--check 产物 diff（#1，build_index_and_search 与 sync 共用构造逻辑）、GBK stdout（#2）、folder≠id 硬错误（#3）、孤儿快照检测（#4）、check/sync 行为一致（#5，TODAY 函数化）
- [x] ci_validate.py：结构守卫（#6）、bonus 分数校验（#7）、赛制校验三件（#8）、赛季 ISO/重叠/snapshotDates（#9，空隙为警告）、players/draws schema（#10，winner 允许 0=平局）
- [x] 验证：手改 index.json → --check 红 ✓；缺"负者"/自弈记录 → FAIL 而非 traceback ✓；孤儿快照 → 告警 ✓

### Phase 3 — 体验与卫生

- [x] i18n：WTT 7 处直出 label 接 getNodeDisplayLabel（#12，wtt_ranking/wtt_player/wtt_assoc）；#13 搜索摘要/占位/加载文案/图表"场"与"年月"/draws 工具提示全部进词典（新增键×双语）；#14 bonus 键统一 score_type_bonus、状态徽章双语渲染（wtt_ov_* 键经核实在双语词典中齐全，功能无碍，保留）
- [x] shared-partials.js：nav/footer/QR 注入式共享（#16，17 页 nav+footer、13 页 QR，净删 788 行重复 markup；wtt_hub 保留自定义 chrome；active 高亮由 highlightNavByPath 运行期处理；顺带修复 index 汉堡 aria-expanded、WTT 页脚 data-i18n 丢失、页脚 Q&A/更新日志链接缺失）
- [x] a11y/SEO（#15）：404 去掉与 noindex 矛盾的 canonical；搜索入口经核实已由 ensureGlobalSearchUI 全站注入（审计项过时）
- [x] CDN 加固（#17）：8 个外部依赖全部 SRI（sha384 双重下载校验）+ crossorigin；marked@12 锁定 12.0.2；删除死依赖 auto-render.min.js（代码用 common.js 自带 renderLatexInString）；KaTeX 全量懒加载经评估放弃（风险>收益）
- [x] 公开面收缩（#18，修正后范围）：git rm --cached 71 个 tools/ 爬虫与原始数据文件（保留 sync/ci_validate/generate_meta 三工具）+ docs/ 两份内部审计 + data/_legacy/（6 文件）+ .gitignore 白名单规则。**重要修正**：qa 版本快照/清单是详情页版本历史的运行时数据源（common.js:797,1079），必须保持部署——原计划该项作废
- [x] 媒体（#19 部分）：>1MB 的 4 张 JPEG 全部重压（12MB→5.2MB，4.5MB→361KB）；视频经 ffprobe 核实码率已仅 ~1Mbps（体积大因时长），重压无益有损，跳过；字体裁剪沿用上轮决策放弃
- [x] 更新 AGENTS.md（escapeHtml 描述已过时→更正、shared-partials 约束、同日多局口径、版本快照必须部署、wttWithDataContext 规范）

### Phase 4 — 长期（承接上轮未完成项）

- [x] 构建管线子集：tools/generate_meta.py（sitemap.xml lastmod 自动化 + RSS feed.xml 全新生成）+ CI --check 门禁（HEAD 日期方案兼容 shallow checkout）+ index.html RSS 发现链接
- [ ] 预计算排名快照 / 内容预渲染（大工程，另行立项）
- [ ] 双管线架构合并（数据上下文参数化，消灭 swap 模式与三重定义）
- [ ] 可选：PWA / 对战预测器

---

## 四、决策点

| # | 决策 | 默认方案 |
|---|------|----------|
| 1 | 重复对局 | **已裁决**：真实多次对局，保留，仅文档化 |
| 2 | 公开面收缩范围 | **已执行（修正后）**：git rm --cached tools/ 爬虫与原始数据 71 文件（保留 sync/ci_validate/generate_meta）、docs/ 两份内部审计、data/_legacy/；**版本快照与清单保持部署**（详情页版本历史的运行时数据源，实施时核实） |
| 3 | Phase 4 取舍 | **已执行**：sitemap lastmod 自动化 + RSS feed + CI 门禁；预计算快照/预渲染/双管线合并另行立项 |

---

## 五、验证方式

1. 每阶段收尾：`python tools/sync_content.py --check` + `python tools/ci_validate.py` 全绿；Phase 2 后用负面用例验证门禁真能红
2. 数值一致性：修 P1-2/P1-3 后，同一球员在排名弹窗、个人页、数据可视化三处每局得失分一致（data_viz 对比表 vs 弹窗抽 3 局核对）
3. i18n：英文模式巡检 ranking/wtt_ranking/player/data_viz 无中文残留；语言切换即时生效
4. 错误态：DevTools 断网/404 模拟 fetch 失败 → 页面显示错误占位与重试，不再永久转圈
5. 回归防护：Phase 3 共享化完成后，全站 21 页 grep 无 `<hN>…</hM>` 错配（用本轮同款检查脚本）
6. WTT：五类目加载正常；wttRenderScoreDetail 中途异常注入后 club 全局未被污染

---

*本计划基于 2026-09-01 工作区快照，行号已逐项核实；上轮（2026-08-24）计划及其完成记录见 git 历史。*
