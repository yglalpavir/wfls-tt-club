# 把官网数据做成免服务器 API（每日 04:00 版）

## 原理

GitHub Actions（免费）每天定时跑一个算分脚本 → 结果存成 JSON 提交回仓库 → GitHub Pages（免费）自动发布 → 网址即 API。全程在 GitHub 机器上完成，不需要你开机、不需要买服务器、不需要写后台。

算分直接运行官网现有的 `js/common.js` + `js/score-engine.js`（本地脚本 `tools/_compute_current_scores.js` 已验证可在 Node 无头环境跑通，零 npm 依赖），不重新实现算法 —— 保证 API 数字与官网页面逐位一致。

## 改动清单

**1. 新增 `tools/recompute_rankings.js`（Node 脚本，约 100 行）**
- 复用 `_compute_current_scores.js` 的 vm 沙箱配方（stub document/localStorage，fetch 走本地文件）
- 按官网加载顺序读入 6 个数据文件，调用 `calculateAllRankingsWithSeasons()` + `calculateRealtimeRanking()`（与 ranking.js:163-165 完全一致的路径）
- 为每个节点补上 `rank` / 排名变化 / 积分变化（对齐 ranking.js:241 的显示逻辑），只补字段不重算数字
- 写出到 `data/api/`；写完自检（节点数 = 赛季数 + 快照数 + 1 实时），失败则退出非零、不提交

**2. 新增 `.github/workflows/recompute.yml`（定时任务，约 40 行）**
- **定时：北京时间每日 04:00**
  ```yaml
  schedule:
    - cron: '0 20 * * *'   # Actions 的 cron 是 UTC；UTC 20:00 = 北京时间次日 04:00
  ```
- 附加触发条件：a) push 改动了 5 个数据文件或 score-engine.js 时立即重算；b) 支持手动触发
- **`TZ: Asia/Shanghai`**（关键：实时积分按本地日期算，runner 默认 UTC 会晚 8 小时）
- `permissions: contents: write` + `fetch-depth: 0` + `concurrency` 防并发
- 只 add `data/api/`，不碰其他未提交内容；产物字节无变化则不提交（不刷 git 历史）
- 不在此任务里重跑 generate_meta.py（它的 lastmod 取自 HEAD 日期，会连带把现有 CI 打红）

**3. `.gitignore` 加一行 `!tools/recompute_rankings.js`**
（现有规则 `tools/*` 只白名单 3 个文件，不加这行新脚本进不了仓库、CI 检出会报 file not found）

**4. 生成的 API 产物（`data/api/`，纯新增目录，不动任何现有文件）**

| 文件 | 内容 |
|---|---|
| `manifest.json` | 生成时间、来源 commit、各端点条数 |
| `rankings/current.json` | 实时积分排名（列与 ranking.html 一致） |
| `rankings/timeline.json` | 全部历史快照（3 赛季初 + 21 快照 + 1 实时，共 25 节点） |
| `players.json` | 45 名成员：档案 + 当前积分/排名/胜率 |
| `matches.json` | 305 条比赛与加分记录 |

调用示例：`fetch('https://yglalpavir.github.io/wfls-tt-club/data/api/rankings/current.json')`

## 实现第一步会验证的事

- 用 curl 实测 GitHub Pages 的响应头，确认第三方网站能跨域读取（CORS）。万一缺跨域头，退路是 raw.githubusercontent.com 地址（天然允许跨域）
- 确认 main 分支没有保护规则（否则机器人推送被拒，改走 PR）

## 如实说明的边界

- API 数据每日 04:00 刷新一次；当天新录入的比赛会等次日凌晨生效（若希望立即生效，可用手动触发按钮）
- 官网 6 个页面本次不改，照旧在浏览器自算 —— 零回归风险，页面与 API 互为副本

## 明确不做（本次）

- 不动 `index.json` / `search.json` / `sitemap.xml` 等现有生成物
- 不改官网前端页面
- WTT 世界排名（5.2 万条记录）留作第二期，套同一套机制即可加入