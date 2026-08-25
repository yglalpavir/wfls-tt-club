# WFLS-TT-Club 全方位审计与改进计划

> 审计日期：2026-08-24
> 审计范围：全部 22 个 HTML 页面、18 个 JS 模块（约 70 万字符）、style.css（2744 行）、data/ 与 wtt_data/ 全部数据文件、tools/ 脚本、仓库卫生与部署配置
> 审计方式：静态代码审查 + 数据交叉一致性校验 + 部署链路核查

---

## 目录

1. [项目现状概述](#一项目现状概述)
2. [Bug 与问题清单](#二bug-与问题清单)
3. [分场景体验优化](#三分场景体验优化)
4. [功能增强建议](#四功能增强建议)
5. [四阶段实施计划](#五四阶段实施计划)
6. [待确认决策点](#六待确认决策点)
7. [验证方式](#七验证方式)

---

## 一、项目现状概述

纯静态站点：原生 HTML/CSS/JS + Chart.js 4，GitHub Pages 部署，无构建步骤、无测试、无 CI。
内容全部由前端 `fetch()` JSON 后渲染；积分排名由客户端 ELO 变体引擎实时计算。

**核心架构问题（影响多项 bug 的根因）：**

- **全局可变状态单例**：`scoreLogData` / `initialScoresData` / `eventCoefficients` / `seasonsData` 等 ~15 个可变全局变量被 5+ 个脚本共享，WTT 页靠手工 save/swap/restore 切换数据上下文，8 处调用点无 try/finally 保护，任一异常即污染后续所有计算。
- **双胞胎复制粘贴架构**：club 管线与 WTT 管线 ~40% 代码互为克隆且已实际漂移（硬编码系数、i18n 键缺失一边）；关联强度逻辑存在 **3 份**副本。
- **字符串模板 + 引号盲区转义器**：几乎所有输出经 `innerHTML` 拼接，`escapeHtml` 不转义引号 → 整类 XSS 地雷。
- **三套目录发现启发式并存**：manifest 加载器、`wttBuildSeasonIds` 硬编码年份表、hub 探测器各自描述同一数据目录，只有 manifest 符合现实。
- **每次访问全量现算**：每个访客下载数 MB 比赛日志并重放 O(快照数 × 记录数) 计算，仅为显示一张最新排名表。

---

## 二、Bug 与问题清单

### 🔴 P0 紧急（时间炸弹 / 生产事故级）

| # | 问题 | 位置 | 说明与修复方向 |
|---|------|------|----------------|
| P0-1 | **缺少 `.nojekyll`** | 仓库根目录（已验证不存在） | GitHub Pages 默认跑 Jekyll，剔除所有 `_` 前缀路径：`data/_legacy/*.json` 线上全部 404。club 前台主路径走 players.json 不受影响（回退分支 `common.js:587,594`、`score-engine.js:556` 仅静默降级），但 `js/admin.js:13-23` 以 `_legacy` 为主数据源，admin 页线上真实故障。修复：根目录添加空 `.nojekyll` |
| P0-2 | **escapeHtml 不转义引号 → XSS 地雷** | `js/common.js:1214-1219`（根源）；消费点 `js/ranking.js:194`、`js/wtt_ranking.js:411`、`js/wtt_dataviz.js:797-811,866`、`js/wtt_personal_stats.js:789-839` 等约 60 处 | `textContent→innerHTML` 技巧只转义 `& < >`。球员名含 `'`/`"` 即破坏 `onclick="showScoreDetail('${...}')"` 内联拼接（按钮失效或存储型 XSS）。当前数据恰好干净（43 名球员无引号字符），属活地雷。修复：转义器补 `"→&quot;`、`'→&#39;`；内联 onclick 改事件委托 + `data-*` 传参 |
| P0-3 | **WTT 正式数据中球员身份被拆分** | 来源笔误 `tools/import_lagos_2026.py:77,104,118,119,126,129`、`tools/import_dusseldorf_2026.py:126,174,179,182,184`；落地 `wtt_data/wd/score-log-2026-wtt.json:1595,1619,1631,1638`、`wtt_data/xd/score-log-2026-wtt.json:259,264,359`、`wtt_data/ws/score-log-2026-ws.json:570,8364,10049,10079,10163,10205,10223,10236` | `NatalIA BAJOR` / `CLEMENT LAINE` 与正确拼写在同一数据集共存，另有全大写变体 `NATALIA BAJOR` 与姓名倒序 `BAJOR Natalia`；前端严格相等匹配（`wtt_personal_stats.js:587,589`）导致同一球员战绩分裂为多个档案。修复：修正数据 + importer 加大小写/词序归一化 |
| P0-4 | **后台暴露面全公开** | `data/about.json:3` `"adminKey":"admin616"`；`test_harness.html`（无 noindex 可爬）；`tools/` 1109 个被跟踪文件含爬虫源码与原始抓取数据 | 搜索框输密钥进 admin.html，但密钥明文人人都可读（安全剧场）；测试工具页直接可达；内部工具链全部发布。修复：删 test_harness.html、去 adminKey 假门、tools 数据目录移出跟踪 |

### 🟠 P1 高优先级 Bug

| # | 问题 | 位置 | 说明与修复方向 |
|---|------|------|----------------|
| P1-1 | **SEO 自断：robots 屏蔽了全站内容源** | `robots.txt:8-9` vs 架构 | 内容全部由前端 fetch `/data/*.json` 渲染，robots 却 Disallow `/data/` → 搜索引擎抓到的全是空壳页。修复：放开 `/data/` 或部署期预渲染 HTML |
| P1-2 | **sitemap 与 noindex 互相矛盾** | `sitemap.xml:64-86`；各 wtt_*.html `<meta robots>` | sitemap 收录 4 个 `noindex,nofollow` 的 WTT 页，却漏了可收录的 `player.html`/`detail.html`；14 个 lastmod 全部硬编码 `2026-08-08` |
| P1-3 | **静默失败：score-log 加载失败仍返回成功** | `js/score-engine.js:577` `catch(e){ scoreLogData=[]; return true; }` | 下载残缺时图表照常用"只有初始积分快照"的时间线渲染，用户无从察觉。对比 `loadInitialScores` 正确返回 false。修复：返回 false 并加入 `main.js:38`、`ranking.js:134` 校验 |
| P1-4 | **详情页初始化竞态 + 无限轮询** | `js/common.js:204,640,709-716`；`js/main.js:76` | `checkAllDataLoaded()` 测试的数组初始值 `[]` 即真值 → 就绪判断恒真；`updateDetailPage` 可能并发执行 3-4 次（重复 fetch + DOM 写入竞态）；index.json 失败时 200ms 轮询永不停止（每轮 2 个请求）。修复：Promise.allSettled 门控 + 运行令牌 + 轮询上限退避 |
| P1-5 | **明细弹窗硬编码 0.8 与引擎配置脱节** | `js/ranking.js:65-66,72` vs `js/common.js:218` | 引擎负者扣分用可配置的 `LOSER_POINT_MULTIPLIER`（注释明示 WTT 设 1.0），弹窗却写死 `*0.8`——任何非 0.8 配置下两处数值不一致 |
| P1-6 | **2001 孤儿数据统计口径不一** | `wtt_data/{ms,ws}/score-log-2001-*.json` vs 各类目 `seasons.json` 从 2002 起 | 引擎所有计算过滤到赛季起点之后 → 排名页不统计 2001 年；但 `wtt_dataviz_extra.js:88-99`、`wtt_personal_stats.js:586-590` 无赛季过滤照常统计 → 同一球员两处数字不同。修复：补 2001 赛季定义或统一排除口径 |
| P1-7 | **localStorage 未防护，Safari 隐私模式语言切换整个失效** | `js/common.js:231,251,405,536`；`js/admin.js:86-95` | `setLanguage` 首行 `setItem` 即抛 QuotaExceededError。修复：safeGet/safeSet try-catch 垫片 |
| P1-8 | **sync_content.py exit code 恒为 0** | `tools/sync_content.py:638` | `main()` 无 return → `main() is None` 恒真 → `sys.exit(0)` 无条件成立；`log_error()` 不计入 warning 计数。CI/cron 无法感知失败 |
| P1-9 | **sync_content.py 幂等承诺失效路径** | `tools/sync_content.py:333-366,530` | 快照文件损坏时 `problems` 标志被丢弃，每次运行都归档新版本，违反 README "重复运行不新增快照" 承诺 |
| P1-10 | **score-log 存在 18 组完全重复记录** | `data/score-log.json` | 同 `(日期,类型,胜者,负者)` 元组出现 2-3 次（如 2026-06-04、06-09、07-12、07-30、08-05）。项目自己的 importer 对该元组去重——语义冲突需业务判断：当天真打多次还是录入重复？ |
| P1-11 | **赛季数据过期：09-01 起新比赛归入被延伸的"2026年暑假"** | `data/seasons.json`；`score-engine.js:497-500` | 最后一个赛季 `2026-summer` 于 08-31 结束（审计日仅剩 7 天）。到期后页面**不会白屏**：`getSeasonForDate`（score-engine.js:444-450）对超范围日期回退返回最后一个赛季，实时排名显式"延伸至今天"（:497-500），历史快照照常可查。真实后果是数据口径失真：秋季新比赛持续计入暑假赛季、跨赛季积分继承缺失。修复：新增秋季赛季 + 可选前端提示 + CI 过期告警 |

### 🟡 P2 中低优先级

| # | 问题 | 位置 |
|---|------|------|
| P2-1 | i18n 缺口：搜索占位符两个 key（`search_input_hint`/`search_hint_info`）不存在于词典；排名流程大量硬编码中文（"暂无记录"/"人"/排序按钮/进度标签）；时间线标签计算时固化、切语言不刷新；`formatSnapshotLabel` 英文模式也输出"2025年3月1日"；`el.title = ... && ...` 会把布尔 false 字符串化赋给 title | `common.js:37,234,429`；`ranking.js` 多处；`score-engine.js:225,339,441,546` |
| P2-2 | 双胞胎漂移实锤：club/WTT 两管线近似行数 `wtt_ranking 62/546`、`wtt_dataviz 170/889`、`wtt_personal_stats 354/1295`；引擎内部同步/异步两版 130 行块 ~95% 重复（`score-engine.js:186-285` vs `292-417`）；`wtt_no_data` 键重复定义两次后者静默覆盖（`common.js:100/107,173/180`） | 多处 |
| P2-3 | WTT hub 可用性检测每次访问发起 ~100 个串行请求（探测不存在的 `score-log.json` 路径 + 逐年试探），找到文件还整份下载只为计数；分类状态只看第一个命中的文件；`wttCheckCategoryStatus` 是死代码副本 | `wtt_hub.html:394-436`；`wtt_common.js:1249-1263` |
| P2-4 | 硬编码赛季年份表（ittfYears=[2008,2009,2011,...]+2021..2026）漏掉实际存在的 2001-2005,2018,2020 → manifest 损坏时静默加载残缺历史；docstring 写错 manifest 键名 | `wtt_common.js:627-641,645`；`wtt_hub.html:401` |
| P2-5 | 8 处手工 save/swap/restore 全局数据无 try/finally（已有安全的 `wttWithDataContext` 未使用），异常后 `_seasonStartCache` 与全部函数读到错误数据集 | `wtt_dataviz.js` ×6、`wtt_personal_stats.js` ×2 |
| P2-6 | 硬编码 227 人性别表决定 XD 组合键序：新球员不在表中→按字母序键化并生成 FNV uid 进分享链接，日后补录性别→同一组合换键→旧链接全断、历史拆两队 | `wtt_common.js:47-274,295-323,1386-1391` |
| P2-7 | 名字身份合并遗漏现有数据的 token 数变体（`Manav Thakar`/`Manav THAKKAR`、`QUEK Yong Izaac`/`QUEK Izaac` 各自成两个档案）；从未交手的同名 token 不同人会被误合并 | `wtt_common.js:351-418` |
| P2-8 | md/wd/xd 无 initial-scores.json，settings 一旦离开 flat1300 模式四个页面全挂 | `wtt_common.js:923-925` |
| P2-9 | 性能：`calculateRealtimeRanking` 绕过现成的 match index 做 O(players×log) 双重过滤（`score-engine.js:540-544`）；快照循环对每快照全量重扫日志重建批次索引（`:238-240,355-357`）；无人活跃时 realtime 节点列出所有人、常规快照却过滤为空，行为不一致（`:540`） | score-engine |
| P2-10 | WTT 个人页 O(天数×记录数) 主线程重放：2002 年起 ~9000 天 × 每天展开千人大对象 + 重放全量比赛 ≈ 上亿次迭代，ms 类目明显卡顿；`wttGetApproxScoreAtDate` 每对手再重放一次 | `wtt_personal_stats.js:520-560,667-670,962-1007` |
| P2-11 | 名字索引冲突静默 last-wins：重名或别名撞真实名时一半名单链错个人页，历史结果被错误归一化 | `common.js:616-620` |
| P2-12 | 引擎无自弈守卫（胜者==负者未拒绝）；normalizeScoreLog 别名映射可能把普通比赛隐形变成自弈记录（当前数据已验证干净） | `score-engine.js:246-248,364-365` |
| P2-13 | club_race.js 依赖其他脚本的全局变量无 typeof 守卫、initialized 标志形同虚设（二次 init 双绑监听）、resize 监听每次 init 叠加 | `club_race.js:49,211,354,357-385` |
| P2-14 | 版本下拉每次渲染泄漏一个 document 级 click 处理器 | `common.js:913-914` |
| P2-15 | sync_content.py 其他：BOM 文件会被跳过出索引（utf-8 vs utf-8-sig）；日期校验正则接受 `9999-99-99`；media 以 `/` 开头路径在 Windows 解析到盘根；迁移步骤无备份且中断留双份 | `sync_content.py:103,84,117-121,166,396-437` |
| P2-16 | importer 输出格式漂移（xd 紧凑 JSON-lines、其余 indent=2）；导入原地覆写无备份 | `import_lagos_2026.py:152-161` |

### ⚪ P3 卫生 / 低危

| # | 问题 | 位置 |
|---|------|------|
| P3-1 | Git 包 530MB：11 个 mp4（最大 17.4MB，合计 ~120MB）反复提交所致；跟踪树 150MB/1508 文件 | `.git/objects/pack/` |
| P3-2 | .gitignore 迟到导致忽略目录仍被跟踪：`tools/tleague_data/`（1026 文件 5.1MB）、`tools/backup_wd/`、`tools/__pycache__/`（含已删除源码的孤儿 .pyc）、乱码文件名的 zip | `.gitignore:19-20` |
| P3-3 | 死依赖 `ittf-pingpong ^2.0.1` 零引用；`"main":"index.js"` 指向不存在的文件 | `package.json` |
| P3-4 | `docs/result_ittf_link/` ~110 个原始 txt（4.6MB）随仓库发布上线，仅 tools 脚本引用 | docs/ |
| P3-5 | 凭据扫描干净（tools/js/html 中 token/api_key/password/cookie 零命中）✔ | — |
| P3-6 | players.json 健康（43 人 uid 10000-10042 连续唯一无重名别名）✔；news 16 / competitions 5 / qa 2 条目与 index/search 完全一致 ✔；draws.json 引用有效 ✔；changelog 格式统一 ✔ | — |

---

## 三、分场景体验优化

| 场景 | 现状痛点 | 优化方案 |
|------|----------|----------|
| **暗色模式用户刷新页面** | 白色闪烁：主题在 121KB 解析阻塞的 common.js 下载后才应用（`common.js:536`）；CSS 无 prefers-color-scheme 支持 | 每页 `<head>` 内联 bootstrap 脚本首帧前应用主题；CSS 选择器迁移到 `html.dark-mode` 并增加系统偏好默认值 |
| **英文用户** | 中文闪现（语言在 JS 加载后才恢复）；排名页中英混排；图表轴标签"年/月/日"硬编码；WTT hub 导航无 data-i18n；document.title 从不本地化 | 语言同样内联预应用；补齐缺失 i18n key；标签改为渲染时解析（存结构化数据而非固化字符串） |
| **移动端** | 分页每页一个按钮无窗口化（`common.js:584`），条目多了按钮爆炸且每次筛选全量重渲染；部分导航图标按钮无 aria-label（news/competitions 等页与 index 不一致） | 分页窗口化（1 … n−1, n）或"第 x/y 页"；触控目标 ≥44px；统一各页 navbar 标注 |
| **慢网络 / 弱网** | 每页 head 同步 Google Fonts 请求 **11 个字重** + Font Awesome 全量 CDN；body 尾部无 defer 的 CDN 脚本；零 preload/preconnect（除 fonts）；marked.min.js 未锁版本随时可能被上游破坏性更新打断渲染；本地资源零 cache-busting | 字体子集化 + display=swap；非关键脚本 defer；preconnect jsdelivr/cdnjs；锁定 marked@x.y.z + SRI；构建期注入 `?v=<sha>` |
| **键盘 / 读屏用户** | 模态框无 role="dialog"、无焦点陷阱、开/关不转移焦点；搜索清除/关闭按钮无名；时间节点 `<li>` 与成员卡片点击型 div 不可 Tab；汉堡菜单从不设 aria-expanded；标题层级断裂（player.html 无 h1 从 h4 开始；contact/ranking 跳级） | 语义化改造 + 焦点管理三件套（移入/陷阱/还原）+ aria-expanded + 标题层级修复 |
| **视觉障碍 / 对比度** | WCAG AA 不达标的核心变量：`--text-muted` 亮色 2.92:1 / 暗色 3.88:1（需 4.5:1）；`--accent-gold` 2.08:1；`--primary-blue` 3.98:1（大字勉强过）；这些变量驱动日期、提示、分页信息、表格头等全站文本 | 调暗 muted tokens（如 #5b6b7d≈5.0:1）、金色只作装饰、蓝色加深至 #0062cc |
| **社交分享** | 全站声明 `twitter:card=summary_large_image` 却**零** og:image/twitter:image → 分享卡片空白；obsolete keywords meta；detail.html canonical 恒定不随 ?id= 变化 | 制作 1200×630 OG 图全站引用（绝对 URL）；删 keywords；预渲染后按条目输出动态 meta |
| **404 迷路者** | 嵌套路径（`/foo/bar`）下相对链接 `index.html` 解析到 `/foo/index.html` 再 404，10 秒定时跳转也落回 404 → 死循环 | 改绝对基准路径（`/wfls-tt-club/` 或从 pathname 推导） |
| **图片视频浏览** | 4.52MB 原图直出、17.79MB 视频无 poster、媒体无固有宽高 → 详情页 CLS | ≤200KB WebP 缩略图 + 点击看原图；视频加 poster；显式尺寸 |
| **WTT 访客** | hub 探测 ~100 串行请求；每页全量下载类目历史（ms 3.19MB/ws 2.31MB...）；个人页主线程卡顿 | 读 manifest.json（1 请求，可扩展 record-count 字段供状态检测）；部署期预算快照 JSON；个人页增量重放算法 |
| **打印场景** | style.css 打印样式 0 条规则 | 小型 @media print 块 |

---

## 四、功能增强建议

### 4.1 部署期构建管线（GitHub Actions）★ 地基工程

解决一类问题的杠杆点：

- **预计算排名快照 JSON**：部署时跑一遍积分引擎输出各赛季快照，访客免下载数 MB 日志免现算（流量省 >90%，顺带消灭 P2-10 卡顿）
- **预渲染新闻/赛事/QA HTML**：根治 SEO 空壳问题（P1-1），detail 页获得独立 canonical/title/og（P1-2 关联）
- **自动生成 sitemap**（lastmod 取自 git/changelog）+ cache-bust 版本号注入
- **赛季过期 CI 告警**：当前日期超出最后赛季 endDate 时 PR check 报红 —— 把 P1-11 这类赛季过期口径漂移变成显式失败
- **数据校验门禁**：schema + 引用完整性（名字↔players.json、无自弈、ISO 日期、tag 白名单）作为合并前置检查

### 4.2 Web 记分录入工具

admin.html 内嵌表单：选日期/类型/胜者/负者（或积分调整对象+分数）→ 前端校验（球员存在于 players.json、类型白名单、日期合法）→ 生成 score-log 片段一键复制或直接产出可提交的 JSON。降低维护门槛，社团换届后可持续运转。配合 sync_content.py 修复（P1-8/9）形成闭环。

### 4.3 对战预测器

`docs/predicted-win-rate.md` 已有算法文档但前端未实现。可在 data_viz 球员对比卡片加"预测胜率"展示（基于现行积分差距基础分表反推），零新数据成本。

### 4.4 PWA 支持

manifest.webmanifest + theme-color + apple-touch-icon + Service Worker（静态资源缓存策略）。手机添加到主屏幕、弱网可用。favicon/theme-color 本就是缺口（P2 清单项）。

### 4.5 其他候选

- **RSS/Atom feed**：news 有结构化数据，构建期生成 feed.xml 成本极低
- **球员主页增强**：头衔徽章墙（honors 已有数据）、生涯里程碑时间轴、单双打分栏
- **交手记录库**：score-log 已含全部对阵，做一个可按球员/类型/日期筛选的历史对战检索页
- **赛季管理自动化**：脚本按学期规则自动生成下一赛季骨架 + snapshotDates 建议

---

## 五、四阶段实施计划

### Phase 0 — 急救（目标：当天完成）

- [x] 根目录添加空 `.nojekyll`
- [x] escapeHtml 补引号转义；内联 onclick 全部改事件委托 + data-* 传参（含 wtt_dataviz/wtt_personal_stats 的未转义注入点）
- [ ] 修正 `NatalIA BAJOR`（含 `NATALIA BAJOR` 全大写、`BAJOR Natalia` 倒序变体）/ `CLEMENT LAINE` 数据拼写（wd/xd/ws score-log-2026）；importer 加大小写/词序归一化防复发
- [x] 已删除 test_harness.html；已移除 adminKey 及对应搜索框后门逻辑

### Phase 1 — Bug 清理

- [x] 静默失败治理（loader 返回 false + 两处校验）
- [x] 详情页初始化重构（落定门控 markContentLoaded + 运行令牌 + 重试上限 8 次退避）
- [x] 明细弹窗改用 `LOSER_POINT_MULTIPLIER`
- [x] safeStorage 垫片 + wfls-lang.v1 版本键（含 admin 页独立垫片）
- [x] i18n 补齐（新增 16 键×2 语言、排名页全部接入、getNodeDisplayLabel 渲染期解析覆盖 6 个消费文件、title 布尔修复；复核确认 wtt_no_data 并无重复定义，系审计误报）
- [x] sync_content.py 修复（exit code / problems 传递恢复幂等 / 原子写入 / 严格日期校验 / utf-8-sig / media 根路径 / 迁移 .bak），双跑幂等验证通过
- [x] SEO 三项完成（robots 重写 / sitemap 12 URL / marked@12 锁定×6 页）
- [x] 暴露面收缩：git rm --cached 共 1168 文件（tleague_data/__pycache__/backup_wd/_archive/raw txt/result_ittf_link/.tmp），跟踪树 1508→342 文件
- [x] ms/ws 各补 2001 赛季定义（537/369 条记录纳入排名口径，消除排名页与个人页计数不一致）
- [x] 按默认方案保留并在 README 补充口径说明（同日多局属正常录入）
- [x] 新增 2026-autumn 赛季 + 排名页过期提示横幅（i18n 双语）+ CI 过期守卫
- [x] WTT 全部完成（dataviz 6 处 + personal_stats 2 处改异常安全上下文；hub 探测 ~100 请求→每类目 1 次 manifest 读取；三个死函数已删；硬编码赛季回退表更新并加警告；docstring 键名修正）

### Phase 2 — 体验优化

- [x] 暗色防闪完成：20 页 `<head>` 内联 bootstrap（存储值优先、其次跟随系统偏好）；style.css 92 处 `body.dark-mode`→`.dark-mode` 迁移至根元素；JS 主题状态迁移 documentElement + isDarkTheme() 统一判断。语言预应用受限于纯前端 i18n 架构（词典在 common.js 内），维持现状并记录
- [x] preconnect×20 页（jsdelivr/cdnjs）；favicon 补齐 8 页；og:image+twitter:image×12 页 + 生成 Assets/images/og-cover.png(45KB)；marked 锁版本。字体裁剪经复核放弃——11 个字重全部在用（300×1/400×3/500×26/600×60/700×50/800×11/900×1），裁剪会破坏样式，记录为决策；defer/缩略图涉及资源重制，列为后续
- [x] 全部完成：openModal/closeModal 焦点管理三件套+Tab 焦点陷阱；18 页按钮标注（theme/lang/searchToggle/searchClose/searchClear/hamburger aria-expanded）；排名页与 WTT 排名页时间节点 role=button+tabindex+Enter/Space 委托；新闻/赛事/QA/成员卡片 makeCardClickable 键盘化；player 页补 h1、sidebar-title h3→h2、全站页脚 h4→h3（CSS 同步）、contact 层级修正、修复 4 处原有 <h4>…</h3> 错配标签；--text-muted 双模式调至 WCAG AA
- [x] 404 三链接+定时跳转改 /wfls-tt-club/ 绝对基准；分页窗口化（≤7 页全显，否则 1…n…last）+.pagination-gap 样式；navbar 标注已随 a11y 批次统一
- [x] computeWttDailyScoreHistory 重写：日粒度限定最近 730 天窗口 + 单调事件指针 + 单调赛季切换（跨赛季按继承积分重置），消除 O(天数×记录数) 主线程卡顿；wttGetApproxScoreAtDate 加同批次记忆化。注：窗口内早期事件的后续衰减为冻结近似，精确值见快照粒度（代码注释已说明）

### Phase 3 — 功能建设（按决策点 5 取舍）

- [ ] GitHub Actions 构建管线（预计算快照 + 预渲染 + sitemap + cache-bust + 赛季过期检查 + 数据校验门禁）
- [x] admin.html 记分录入面板：比赛结果/积分调整双模式、players.json 与类型白名单联动下拉、逐条校验（必填/胜≠负/日期格式）、队列管理、复制 JSON 片段或下载合并后的 score-log.json
- [ ] （可选）对战预测器卡片
- [ ] （可选）PWA manifest + SW
- [ ] （可选）RSS feed
- [ ] （长期）双胞胎架构合并：单一数据上下文参数化的共享渲染/计算核心

---

## 六、待确认决策点

| # | 决策 | 默认方案 | 备选 |
|---|------|----------|------|
| 1 | 执行范围 | 全部四阶段 | 分批停在任意 Phase |
| 2 | admin/tools 暴露面 | 删 test_harness + 去 adminKey + git rm --cached tools 数据目录；admin.html 暂留 | admin.html 也撤出部署分支 |
| 3 | Git 历史瘦身（.git 530MB） | 只停止跟踪+清理，不改写历史 | filter-repo 改写历史彻底瘦身（需全体协作者重新 clone） |
| 4 | score-log 18 组重复记录 | 待业务裁决：当天真打多次→保留并文档化；录入重复→去重 | — |
| 5 | Phase 3 功能取舍 | 先做构建管线 + 记分工具 | 加预测器/PWA/RSS |

---

## 七、验证方式

1. **数据完整性**：每阶段后运行 `python tools/sync_content.py --check`，输出应为 0 警告且退出码正确反映状态
2. **关键路径手测清单**：
   - ranking.html：正常赛季渲染 / 模拟 2026-10-01 超出最后赛季时页面仍正常渲染且实时节点延续最后赛季（P1-11 回归）/ 时间节点切换 / 积分明细弹窗数值与表格一致（改 LOSER_POINT_MULTIPLIER 后复核）
   - 语言切换：排名页无中文残留、刷新后无中文闪现、时间线标签即时刷新
   - 暗色模式：刷新无白闪、系统偏好首次访问正确跟随
   - XSS 回归：临时插入含 `'` `"` `<` 的测试球员名，确认明细按钮正常、无脚注执行
   - WTT：五类目加载、hub 状态检测（应只有 1 个 manifest 请求）、个人页 ms 类目不再长卡顿
   - 404 页：嵌套路径下链接与自动跳转均回到首页
3. **性能抽查**：Lighthouse 跑分对比（首屏 LCP/CLS/无障碍分），WTT 页网络面板确认快照 JSON 替代全量日志
4. **部署验证**：GitHub Pages 上确认 `data/_legacy/about.json` 可 fetch（.nojekyll 生效）、test_harness.html 404、robots.txt 生效后的抓取诊断

---

*本计划基于 2026-08-24 代码库快照生成。行号引用以当日工作区为准，实施时如有偏移请按符号名重新定位。*
*2026-08-24 修订：经二次代码复核，原"赛季到期白屏"（P0-1）被证伪——引擎已有回退与延伸逻辑，降级为数据口径问题 P1-11；`.nojekyll` 影响面按实际引用关系修正（admin 页为主受损面）；球员拼写变体清单扩大（`NATALIA BAJOR`、`BAJOR Natalia`）。P0 编号相应重排。*
