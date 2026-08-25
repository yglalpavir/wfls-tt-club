# 实施说明：全方位审计修复（2026-08-24）

> 对应计划：[plan.md](../plan.md)（P0×4 + P1×12 + P2×5 + P3×2 已全部完成）
> 本文档记录每一项改动的落点、行为变化与验证结论，供 review 与后续维护参考。

---

## 一、Phase 0 急救（4/4）

### 1.1 `.nojekyll`
- 新增仓库根目录空文件 `.nojekyll`。
- 效果：GitHub Pages 不再运行 Jekyll，`data/_legacy/*`（admin 页主数据源与 club 回退分支）与 `Assets/images/_qr-code.jpg` 线上恢复可访问。

### 1.2 XSS 地雷排除
| 文件 | 改动 |
|------|------|
| `js/common.js` | `escapeHtml()` 由 textContent 技巧改为显式转义链，补 `"→&quot;`、`'→&#39;` |
| `js/ranking.js` | 排名表内联 `onclick="showScoreDetail('…')"` → `data-player/data-snapshot` 属性 + document 级事件委托（click + Enter/Space 键盘） |
| `js/wtt_ranking.js` | 明细按钮同上改造，委托至 `wttShowScoreDetail` |
| `js/wtt_dataviz.js` | 球员对比卡 5 处未转义姓名插值全部套 `escapeHtml` |
| `js/wtt_personal_stats.js` | 概览文案、克星/福星卡片对手名插值补转义 |

保留的静态 `onclick="location.reload()"`（player-page.js / wtt_player.js）不含数据插值，无风险。

### 1.3 WTT 数据身份分裂修复
修正以下笔误变体并统一为规范拼写（前端严格相等匹配不再分裂档案）：

| 变体 → 规范 | 数量 | 落点 |
|---|---|---|
| `NatalIA BAJOR` / `NATALIA BAJOR` / `BAJOR Natalia` → `Natalia BAJOR` | 18 | wd/ws/xd score-log-2026 |
| `CLEMENT LAINE` → `Clement LAINE` | 1 | xd score-log-2026 |
| `NatalIA GAJEWSKA` → `Natalia GAJEWSKA` | 4 | wd/ws score-log + ws assoc.json 键名 |
| `NatalIA GRIGELOVA` → `Natalia GRIGELOVA` | 2 | xd score-log-2026 |
| `PaulINE CHASSELIN` → `Pauline CHASSELIN` | 3 | wd/ws score-log |

防复发：`tools/import_lagos_2026.py` 与 `import_dusseldorf_2026.py` 新增 `normalize_name()`（按空格分词、连字符分段，仅修混合大小写异常词；全大写姓氏原样通过），写入前对胜者/负者归一化。13 组用例测试通过（含 Tin-Tin / Tung-Chuan / DE NUTTE 等正常形态不误伤）。

> ⚠️ 过程事故披露：首次用 PowerShell 批量替换时因单元素数组展开缺陷曾把 wd 文件所有大写 N 替换成 a，已通过 `git checkout` 完整还原后重做；最终数据以本节清单为准，`git diff wtt_data/` 可复核。

### 1.4 后台暴露面收缩
- 删除 `test_harness.html`。
- 删除 `data/about.json` 的 `adminKey` 字段及 `common.js` 搜索框密钥后门逻辑。

---

## 二、Phase 1 Bug 清理（12/12）

### 2.1 静默失败治理
- `score-engine.js`：`loadScoreLogData/loadScoreLogForViz` 失败改为返回 `false` 并 console.error（原先吞错返回 true，图表用残缺数据照常渲染）。
- `main.js` / `ranking.js`：loader 循环检查返回值，失败即抛错走统一的错误 UI。

### 2.2 详情页初始化竞态
- 就绪判断从"数组恒真"改为 `markContentLoaded()` 落定门控（news+competitions 都 settle 才触发一次）。
- `updateDetailPage()` 加运行令牌：并发触发时仅最后一次生效；轮询重试上限 8 次、200ms 起步线性退避，且仅在目标条目变化时重置计数——消灭无限轮询与重复 fetch/DOM 竞态。

### 2.3 明细弹窗系数统一
`ranking.js` 弹窗内 3 处硬编码 `0.8` 全部改用引擎常量 `LOSER_POINT_MULTIPLIER`，配置改动不再导致表格与弹窗数值不一致。

### 2.4 localStorage 安全垫片
- `common.js` 顶部新增 `safeStorage`（get/set/remove 全 try-catch），5 处访问点迁移；语言键升级为 `wfls-lang.v1` 并兼容读取旧键。
- `admin.js`（不加载 common.js）内置同款垫片。Safari 隐私模式下语言/主题切换恢复正常工作。

### 2.5 i18n 补齐与修复
- 新增 16 个 key × zh/en：搜索占位符 3 键（原先根本不存在于词典）、排名流程 13 键（加载进度/下载进度/计算中/失败/暂无数据/暂无记录/加分/N人/N个节点/升序降序/查看个人页/点击明细/赛季过期提示）。
- `ranking.js` 所有面向用户的中文硬编码接入词典；排序指示器复用已有 `sort_desc/sort_asc`。
- **时间线标签渲染期解析**：新增 `getNodeDisplayLabel()/formatNodeDate()`，替代计算期固化的中文字符串；覆盖 ranking.js（节点列表/当前标签/弹窗标题）、wtt_ranking.js、data-viz.js 两处图表轴、personal-stats.js、player-page.js、club_race.js 共 6 个消费文件——切语言即时生效。
- `showSearchPlaceholder()` 本地化并携带 data-i18n。
- 修复 `el.title = attr && i18n[lang][key]` 把布尔 false 字符串化赋给 title 的缺陷。
- 复核更正：审计报告所称 `wtt_no_data` 重复定义**不存在**（实为 `wtt_no_data` 与其他键同行的误读），无需处理。

### 2.6 sync_content.py 五项修复
1. **exit code**：`main() is None or …` 恒真短路删除；`log_error()` 计入警告数；有错退出码 1。
2. **幂等恢复**：`load_history` 的 problems 标志传递到 `sync_type`，历史结构损坏时拒绝追加新快照并报错（原逻辑每次运行都会新增版本）。
3. **原子写入**：`write_json` 先写 `.tmp` 再 `os.replace`。
4. **日期校验**：锚定匹配 + `date.fromisoformat` 日历校验（拒绝 9999-99-99）。
5. 其他：utf-8-sig 兼容 BOM 读取；media 根相对路径规范化（Windows 盘根问题）；扁平迁移由直接删除改为 `.migrated.bak` 改名备份。
验证：`--check` 0 警告退出码 0；连续两次真实同步快照数保持 24 不变（幂等 ✓）。

### 2.7 SEO
- `robots.txt` 重写：放开 `/data/`（客户端渲染内容源，屏蔽等于让搜索引擎只见空壳）；移除不存在的 `/ittf_data/`、`/ittf-pingpong_api/`；保留 `/Assets/`（图片隐私优先）与 `/wtt_data/`、`/tools/`。
- `sitemap.xml`：移除 4 个 noindex 的 WTT 页；加入 player.html/detail.html；lastmod 更新为 2026-08-24；共 12 URL。
- `marked` CDN 从浮动 latest 锁定为 `marked@12`（jsdelivr 大版本锁定），涉及 6 个页面。

### 2.8 暴露面收缩（git）
`git rm --cached` 共 **1168 个文件**：`tools/tleague_data/`(1026)、`__pycache__/`、`backup_wd/`、`_archive*/` 若被跟踪部分、5 个 `_*_raw.txt`、`docs/result_ittf_link/`(121)、`.tmp`。`.gitignore` 同步补充规则（含 `*.migrated.bak`、`docs/result_ittf_link/`）。跟踪树 **1508 → 342 文件**（约 150MB→140MB，剩余大头为视频，按决策点 3 默认不动历史）。

### 2.9 2001 孤儿数据
ms/ws 各补 `2001-wtt` 赛季定义（537/369 条记录），排名快照口径与个人页统计一致。

### 2.10 score-log 重复记录
按默认方案**保留并在 README 口径化**：同 `(日期,类型,胜者,负者)` 多条属同日多局正常录入；WTT importer 的去重语义不同已注明。

### 2.11 赛季守卫（P1-11）
- `data/seasons.json` 新增 `2026-autumn`（2026-09-01 ~ 2027-01-31，8 个快照日）。
- `ranking.js` 新增 `renderSeasonExpiryNotice()`：当前日期超出最后赛季时表格上方显示双语提示横幅（说明延伸口径与继承缺失后果）。
- CI 层面再加一道过期守卫（见 2.12）。

### 2.12 WTT 架构清理
- **全局 swap 异常安全化**：`wtt_dataviz.js` 6 处 + `wtt_personal_stats.js` 2 处手工 save/swap/restore 全部改走已有的 `wttWithDataContext`（try/finally 保证恢复，支持嵌套调用）；`origScoreLog` 等临时变量清零。
- **hub 探测重写**：~100 个串行探测请求 → 每类目 1 次 `manifest.json` 读取（scoreFiles 非空即 ready）；顺带修正了"只看第一个命中文件"的误判面。
- 死代码删除：`wttCheckCategoryStatus`、`wttLoadRankingDataLegacy`、`wttUpdateCategoryDisplay`（均零引用，删除前已 grep 确认）。
- `wttBuildSeasonIds` 回退表更新为实际存在的年份全集（补 2001-2005/2013-2015/2018），触发回退时输出 console 警告；docstring 中 manifest 键名 `scoreLogs`→`scoreFiles` 修正。

---

## 三、Phase 2 体验优化（5/5）

### 3.1 暗色模式防闪 + 系统偏好跟随
- 20 个页面 `<head>` 注入 3 行内联 bootstrap：首帧前按 `localStorage → prefers-color-scheme` 顺序应用主题到 `<html>`。
- `style.css` 92 处 `body.dark-mode` 迁移为 `.dark-mode`（作用于根元素，变量继承不变）。
- JS 主题状态迁移至 `documentElement`；新增 `isDarkTheme()` 统一判断（4 个图表文件的散落检测改走此函数）；用户手动切换后写入显式偏好，不再被系统偏好覆盖。
- 语言预应用受纯前端 i18n 架构限制维持现状（词典在 common.js 内），已在 plan.md 记录。

### 3.2 性能批次
- preconnect jsdelivr/cdnjs ×20 页；favicon 补齐 8 页（404/admin/changelog/competitions/detail/index/news/qa）。
- og:image + twitter:image ×12 页，配套生成 `Assets/images/og-cover.png`（1200×630，45KB，社团配色+校名）。
- marked 锁版本见 2.7。
- 决策记录：字体裁剪放弃（11 字重全部在用，裁剪必破坏样式）；详情页缩略图/poster 与脚本 defer 涉及媒体资产重制与回归面较大，列为后续迭代。

### 3.3 可访问性批次
- **模态框三件套**：openModal 设 role=dialog/aria-modal、焦点移入首个控件、关闭还原触发点焦点；document 级 Tab 焦点陷阱（模态框与搜索遮罩通用）。
- **键盘可达**：新闻/赛事/QA/成员卡片经 `makeCardClickable()`（role=link + tabindex + Enter/Space）；club 与 WTT 排名页时间节点 role=button/tabindex + 键盘委托（只绑一次）。
- **标注**：18 页 hamburger（aria-expanded 动态维护）/theme/lang/searchToggle/searchClose/searchClear 补 aria-label。
- **标题层级**：player 页 JS 渲染的球员名 h2→h1；ranking/wtt_ranking sidebar-title h3→h2；全站页脚 h4→h3（CSS 选择器同步 3 处）；contact 内容卡 h3→h2；另修复 data_viz/wtt_assoc/wtt_dataviz 中 4 处原有的 `<h4>…</h3>` 开闭错配标签。终态抽查 contact 序列 1,2,3,3,3,3 ✓。
- **对比度**：`--text-muted` 亮色 #8899aa→#5b6b7d(≈5.0:1)、暗色 #6e7686→#98a2b3(≈4.6:1)，达 WCAG AA。品牌蓝/金主要用于大字与装饰，保留不动。

### 3.4 交互批次
- 404 页三个快捷链接与倒计时跳转改 `/wfls-tt-club/` 绝对基准，嵌套路径不再二次 404 循环。
- 分页窗口化：≤7 页全显示，否则 `1 … (n−1,n,n+1) … last`；新增 `.pagination-gap` 样式。

### 3.5 WTT 个人页性能
- `computeWttDailyScoreHistory` 重写：旧算法从球员首秀起逐日"克隆千人大对象+全量重放"，O(天数×记录数)≈亿级迭代；新算法日粒度限定最近 730 天窗口、事件指针单调前进、跨赛季按继承积分重置后快进。已知近似（代码注释注明）：窗口起点前的历史贡献冻结于窗口起点值，其后续衰减不再逐日累计；精确数值以"快照"粒度为准。
- `wttGetApproxScoreAtDate` 加同一渲染批次的记忆化缓存（键含 sortedLog 引用标识，容量上限自动清空）。

---

## 四、Phase 3 功能建设（2/2）

### 4.1 CI 门禁（`.github/workflows/ci.yml` + `tools/ci_validate.py`）
push(main)/PR 触发三步：
1. `node --check` 全部 18 个 js；
2. `sync_content.py --check` 幂等干跑；
3. `ci_validate.py` 数据门禁：194 个 JSON 解析、score-log↔players.json 引用完整性（姓名∪别名）、无自弈记录、ISO 日期且无未来日期、比赛类型 ∈ event-coefficient 白名单、**赛季过期守卫**（超出最后 endDate 即红，强制创建新赛季）。
本地实测：三项全部通过（exit 0）。
> 预计算排名快照 / HTML 预渲染需将浏览器耦合的积分引擎移植 Node 环境，工程量大，列为下一迭代（plan.md 内已注明）。

### 4.2 Web 记分录入工具（admin.html）
自包含面板（独立样式作用域 + IIFE，不侵入 admin.js）：
- 双模式：比赛结果（日期/类型/胜者/负者）与积分调整（日期/对象/+分数）；
- 下拉联动 players.json 姓名与 event-coefficient 类型白名单；
- 逐条校验：必填、胜≠负、YYYY-MM-DD 格式、分数必须数字（正数自动加 + 号）；
- 队列管理（添加/移除/清空）；
- 导出两式：复制 JSON 片段（粘贴进 score-log.json 末尾）或**下载合并后的完整 score-log.json**（fetch 现网数据 + 队列追加），替换文件提交即可，配合 ci_validate 自动把关。

---

## 五、验证结论汇总

| # | 验证项 | 结果 |
|---|--------|------|
| 1 | 18 个 JS 文件 `node --check` | ✅ PASS |
| 2 | admin.html / wtt_hub.html 内联脚本提取后语法检查 | ✅ PASS |
| 3 | 4 个 Python 工具 `py_compile` | ✅ PASS |
| 4 | `ci_validate.py`（194 JSON/引用完整性/自弈/日期/类型/赛季） | ✅ exit 0 |
| 5 | `sync_content.py --check` 0 警告；连续两次真实同步快照数恒 24（幂等） | ✅ exit 0 |
| 6 | normalize_name 13 组用例（正常形态不误伤） | ✅ ALL PASS |
| 7 | 关键符号定义与加载顺序（safeStorage/getNodeDisplayLabel/makeCardClickable/isDarkTheme 在 common.js 且先于消费方加载） | ✅ |
| 8 | 20 页 viewport + 主题 bootstrap 全覆盖；8 页 favicon 缺口补齐 | ✅ |
| 9 | 数据插值类内联 onclick 清零（仅剩静态 location.reload 两处） | ✅ |
| 10 | i18n 16 个新键 zh/en 成对存在 | ✅ |
| 11 | style.css 无残留 body.dark-mode；JS 仅 isDarkTheme 内一处刻意双查 | ✅ |
| 12 | seasons 三处 JSON 终态正确（club 3 赛季至 2027-01-31；ms/ws 26 赛季含 2001） | ✅ |
| 13 | git 变更面：52 文件 +1612/−833 行 + 1168 个取消跟踪文件；autocrlf 正常归一 | ✅ |
| 14 | WTT 数据修正后全部 JSON 重新解析有效（56 个） | ✅ |

**建议的人工冒烟**（部署预览后执行，静态分析无法完全覆盖浏览器行为）：
1. ranking.html：时间节点切换、明细弹窗（数值应与表格一致）、模拟改系统日期超 2027-01-31 看横幅；
2. 语言切换往返：排名页无中文残留、时间线标签即时刷新、刷新无白闪/中文闪；
3. news 分页 >7 页造数验证省略号窗口；键盘 Tab 操作成员卡/时间节点/模态框焦点圈；
4. WTT hub Network 面板确认仅 5 个 manifest 请求；wtt_personal_stats 选 ms 类目老将确认无长卡顿；
5. admin 记分工具走一遍"添加→导出下载→替换文件→CI 绿"闭环。

---

## 六、遗留与后续建议

1. **构建管线二期**：积分引擎 Node 化 → 部署期预算 club/WTT 快照 JSON（流量 >90%↓）+ 新闻/赛事预渲染 HTML（SEO 终解）+ sitemap/cache-bust 自动生成。
2. **媒体治理**：视频移出 git 或 LFS（决策点 3 备选项，需协调协作者）；详情页 WebP 缩略图 + 视频 poster。
3. **字体子集化**：如未来设计上收敛字重使用，再行裁剪。
4. **双胞胎架构合并**：club/WTT 管线参数化共享（长期项，plan.md Phase 3 已列）。
5. **可选增强**：对战预测器卡片、PWA manifest+SW、RSS feed（plan.md 未勾选项）。
