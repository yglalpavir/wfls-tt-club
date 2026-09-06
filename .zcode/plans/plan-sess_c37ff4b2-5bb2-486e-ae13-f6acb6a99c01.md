# WFLS TT Club 优化计划

所有问题均已逐一在源码中亲自验证（非猜测），标注 file:line。范围：正确性 bug 修复 + 访客体验增强 + i18n 补全 + 代码健康清理 + 排行榜同分稳定排序（并列名次）。

## Phase 1 — 正确性 bug 修复（已验证）

1. **衰减配置加载失败静默用错半衰期**：`js/score-engine.js:850` `loadDecayConfig` 无 return 语句（失败返回 undefined），`js/ranking.js:143` 只判 `=== false`，因此 fetch 失败时不报错、fallback 无 `t` 字段，`DECAY_HALF_LIFE_DAYS` 静默保持 180 而非配置值 45 → 积分全错且无提示。修复：成功 `return true`/失败 `return false`，让 ranking.js 抛出可见错误；硬编码 fallback noDecayTypes 抽成共享常量。
2. **`getSeasonStartScores` 守卫自相矛盾**：`js/score-engine.js:624` `if (!initialScoresData || !seasonsData) return { ...initialScoresData.initialScores }` — 恰在可能为 null 的分支上解引用。改为返回 `{}`。
3. **WTT 个人数据日线图日期整体偏移一天**：`js/wtt_personal_stats.js:962/996`（`computeWttDailyScoreHistory`，经 `wttRenderPersonalStats`:793 渲染到 WTT 个人页/球员页）用 `new Date(本地午夜).toISOString()` 生成日期串，UTC+8 下所有点标注为前一天、跨赛季切换晚一天。改用本地日期格式化（同 `score-engine.js:606 getTodayStr` 手法）。
4. **news/competitions/qa 加载失败静默变空白**：`js/common.js:763-764,773` catch 后置 `[]`，`renderAllNews`(849) 等渲染空网格、无错误无空态提示（changelog:852 已有空态可参照）。补：失败 → 错误卡+重试按钮；成功但为空 → 空态提示（新增 i18n 键）。
5. **data-viz.js 未转义拼接 + 硬编码中文**：`js/data-viz.js:766-767,780,790` playerName/tags/honors 直接拼 HTML（违反全站 escapeHtml 纪律，WTT 孪生版 wtt_personal_stats.js:773 是转义的）；758-762「总场次/获胜/失利/胜率/当前积分」与 752-754 日期格式硬编码中文。补 escapeHtml + i18n（参照 WTT 版 wtt_ov_* 键）。
6. **admin 后台 WTT 路径全部失效**：`js/admin.js:28-32` 指向 `wtt_data/{cat}/score-log.json`，该文件已不存在（现为按年分文件 + manifest.json，已 ls 确认）。改为读 manifest.json 聚合各分项记录数。
7. **robots.txt 与 og:image 冲突**：robots.txt `Disallow: /Assets/`，而 og:image 在 `Assets/images/og-cover.png`（index.html:15）。把 og-cover.png 移到未屏蔽目录（如 `images/og-cover.png`）并更新引用。
8. **WTT 赛季加载失败 → 骨架屏永久卡住**：`js/wtt_common.js:800` 失败置 `[]`，`wtt_ranking.js:226` 守卫只判 falsy，`[]` 为真 → 时间线为空、骨架行永挂。守卫改为 `!Array.isArray || length===0` 时渲染错误卡（复用 wtt 错误卡样式）。
9. **数据上下文卫生**：`js/wtt_common.js:958-1013` 两个 context 函数不保存/恢复 `LOSER_POINT_MULTIPLIER`、`SCORE_TIME_DECAY_ENABLED`（742-743/752-753 全局改写）；同步版 977 对 Promise 结果跳过恢复（潜在）。补：两值纳入 save/restore；同步版检测到 thenable 时 console.warn。

## Phase 2 — 排行榜同分稳定排序 + 并列名次

- 现状（已验证）：`js/score-engine.js:287/336/404/464/523/719/824` 七处 `.sort((a,b)=>b[1]-a[1])` 无次级键，同分按插入顺序排，跨快照顺序可能互换 → `calculateRankChanges`（ranking.js:216、wtt_ranking.js:331）按索引差算变化，出现假▲▼。
- 方案：抽共享比较器（积分降序 → 总场次降序 → 姓名 localeCompare）替换七处；名次计算改为同分并列（1,2,2,4 式），rank change 基于名次值而非数组索引。
- 用 node 脚本对真实 club + WTT(ms) 数据先导出改前排名时间线作为 golden 基线，改后 diff 验证除同分顺序/名次外无任何差异。

## Phase 3 — 访客体验增强

10. **详情页**（`js/common.js` detail 渲染段 + detail.html）：补「返回列表」链接（`detail_back` 键已定义、grep 确认从未使用）；利用已加载的 index.json 渲染上一篇/下一篇导航（新增 detail_prev/detail_next 键）；动态 `document.title` = `{标题} | WFLS Table Tennis Club`（player.html 已有先例）+ 更新 meta description。
11. **club 排行页并行加载**：`js/ranking.js:127-146` 六个文件纯串行 await（各含 setTimeout(0)），GitHub Pages 下白白叠加 RTT。改为 players 先行（loadInitialScores 依赖 playersData），其余四个 Promise.all 并行、逐个完成时更新进度行；保留进度 UI。失败时显示带重载按钮的错误卡（复用 main.js:59 `showRankingLoadFail` 模式，现在只有红字无重试）。
12. **全局搜索支持标签**：`tools/sync_content.py` 的 search.json 增加 `tag` 字段（build_index_and_search:621-633，tag 目前只进 index.json 不进搜索）；`js/common.js:565 calcScore` 把 tag 匹配计入得分；跑 `sync_content.py` 重新生成。
13. **news.html 声明 RSS**：feed.xml 已存在但仅 index.html:11 声明，news.html 补 `<link rel="alternate">`。

## Phase 4 — i18n 英文模式补全（均已验证残留）

14. club 排行榜表头 `ranking.html:79-86` 无 data-i18n（WTT 版 wtt_ranking.html:80-86 有，属漂移）；排序指示符初值「积分降序」(ranking.html:66) 与 `ranking.js:236` 显示原始字段名（如「当前积分」）→ 加 data-i18n + 字段名→i18n 映射。
15. 图表回退文案：`data-viz-extra.js:139/346/413`、`wtt_dataviz_extra.js:34/994/1225` 的 `' 场'`、`'{y}年{m}月'` 等改走 i18n。
16. 导航残留：`js/shared-partials.js:29/73`「个人数据」、`wtt_hub.html` 静态导航副本中的「社团骨干/更新日志」等补 data-i18n。
17. draws-core.js 回合名「决赛/半决赛/第N轮/冠军」（:103/:391/:407/:504）— 视改造成本，若 viewer 侧 dcT 能覆盖则补 en 键，否则记录不动。
18. **不做**（保持现状）：404.html、umpire-training.html 全中文（彩蛋性质、无 i18n 基建）；sitemap、PWA/Service Worker。

## Phase 5 — 代码健康清理（不影响访客可见行为）

19. 删除逐字节重复的 `loadScoreLogForViz`（score-engine.js:867-868），调用点改指 `loadScoreLogData`。
20. `wttCalculateAllRankings` 定义两次（wtt_common.js:1050 与 wtt_ranking.js:24，后者因加载顺序覆盖前者）：diff 两版后保留一份。
21. 同步/异步引擎克隆（`calculateAllRankingsWithSeasons` vs `Async` 257-359/366-503、`calculateRealtimeRanking` vs `Async` 650-729/735-834）：不整体合并（风险高），把三段逐行重复的块（赛季继承、赛季初始分、逐快照重放）抽成两侧共用的 helper，用 Phase 2 的 golden 基线验证输出不变。

## 验证与交付

- 每步之后：`python tools/sync_content.py`（改了 sync_content.py 与搜索后）、`python tools/ci_validate.py`（当前全绿，改后必须仍全绿）。
- 排名相关改动：node golden 基线 diff（club + wtt/ms）。
- 本地 `python -m http.server` 起站，浏览器逐项核对：排行榜 zh/en 表头与同分并列、详情页返回/上下篇/标题、搜索标签命中、news 断网空态、WTT 个人页日线图日期、admin 后台 WTT 概览。
- 不去重同日重复比赛记录（AGENTS.md 明确为合法约定）、不引入构建工具。