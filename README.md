# WFLS Table Tennis Club Website

武汉外国语学校乒乓球社团官方网站

## 项目结构

```text
wfls-tt-club/
├── index.html                  # 主页（含全站搜索功能 + 左侧定位条）
├── news.html                   # 新闻列表页（分页 + 标签筛选）
├── competitions.html           # 赛事列表页（分页 + 标签筛选 + 对阵表）
├── members.html                # 社团骨干页面
├── ranking.html                # Ranking Beta 排名系统（自动计算 + 赛季继承 + 积分明细）
├── data_viz.html               # 数据可视化（积分趋势 + 排名河流图 + 球员对比）
├── personal_stats.html         # 个人数据页面（积分趋势 + 荣誉成就）
├── detail.html                 # 新闻/赛事/Q&A 详情页（支持图片、视频、文件附件）
├── qa.html                     # 常见问题（Q&A）页面
├── changelog.html              # 更新日志页面
├── contact.html                # 联系我们页面（社团QQ群二维码）
├── admin.html                  # 后台数据概览仪表盘
├── 404.html                    # 404 页面
│
├── wtt_hub.html                # WTT 彩蛋入口（男/女单打、双打、混双）
├── wtt_ranking.html            # WTT 排名页面
├── wtt_dataviz.html            # WTT 数据可视化
├── wtt_personal_stats.html     # WTT 个人数据
│
├── style.css                   # 全局样式表（玻璃拟态 + 暗色模式 + 响应式）
│
├── js/                         # JavaScript 模块（按页面拆分）
│   ├── common.js               # 语言包 + 全局变量 + UI交互 + 通用渲染/搜索
│   ├── score-engine.js         # 积分计算核心引擎
│   ├── ranking.js              # 排名系统 + 积分明细模态框
│   ├── data-viz.js             # 数据可视化（Chart.js）
│   ├── personal-stats.js       # 个人数据页面
│   ├── player-page.js          # 球员个人主页（player.html）
│   ├── draws-viewer.js         # 对阵表（Draws）渲染器
│   ├── admin.js                # 后台数据概览仪表盘
│   ├── main.js                 # 入口初始化
│   ├── wtt_common.js           # WTT 通用数据加载 + 积分计算
│   ├── wtt_ranking.js          # WTT 排名
│   ├── wtt_dataviz.js          # WTT 数据可视化
│   └── wtt_personal_stats.js   # WTT 个人数据
│
├── data/                       # 站内数据（JSON）
│   ├── about.json              # 社团简介数据（历史、理念、活动）
│   ├── players.json            # 统一球员档案（uid/初始积分/标签/荣誉/职务）
│   ├── news/                   # 新闻动态（条目文件夹 {id}/ + 生成的 index/search.json）
│   ├── competitions/           # 赛事信息（条目文件夹 {id}/ + 生成的 index/search.json）
│   ├── qa/                     # 常见问题（条目文件夹 {id}/ + 生成的 index/search.json）
│   ├── changelog.json          # 更新日志数据
│   ├── draws.json              # 对阵表数据
│   ├── event-coefficient.json  # 赛事系数配置
│   ├── seasons.json            # 赛季定义（含继承规则）
│   ├── decay-config.json       # 时间衰减配置（半衰期 & 保值类型）
│   ├── score-log.json          # 比赛记录 + 积分调整记录
│   ├── data_viz-settings.json  # 数据可视化设置
│   ├── personal-stats-chart-settings.json  # 个人数据图表设置
│   └── _legacy/                # 旧版/备份数据（members / player-tags / initial-scores / 合并版 news/competitions/qa）
│
├── wtt_data/                   # WTT 彩蛋数据（ms/ws/md/wd/xd，按赛季拆分 + manifest.json）
├── ittf_data/                  # ITTF 历史数据（ms / ws）
├── ittf-pingpong_api/          # ittf-pingpong API 原始抓取数据
├── tools/                       # 数据抓取/生成脚本（Python / Node）
│
├── Assets/
│   ├── images/                 # 图片资源
│   ├── videos/                 # 视频资源
│   └── files/                  # PDF、Excel等文件资源
│
└── README.md                   # 项目说明文档
```

## 技术栈

- HTML5 语义化结构
- CSS3（CSS变量主题系统 / 玻璃拟态 / Grid+Flex布局 / 响应式设计）
- 原生 JavaScript（ES6+，按页面模块化拆分）
- Chart.js 4.4（数据可视化图表）
- Google Fonts（Poppins + Noto Sans SC）
- Font Awesome 6 图标
- 中英文双语切换

## 部署方式

本项目设计为 GitHub Pages 静态部署：

```bash
git init
git add .
git commit -m "Initial commit"
git branch -M main
git remote add origin https://github.com/你的用户名/wfls-tt-club.git
git push -u origin main
```

然后在仓库 Settings > Pages 中选择 `main` 分支部署即可。

---

## 功能特性

### 核心功能

- 响应式导航栏（桌面端 + 移动端汉堡菜单）
- 玻璃拟态卡片风格（frosted glass）
- 暗色/亮色主题切换（支持本地存储记忆）
- 中英文双语切换（全站静态文本 + 动态卡片标签）
- 全站搜索功能（覆盖新闻、赛事、成员、排名，按匹配度排序）
- 左侧定位条（主页板块精准导航，自动高亮当前位置）
- 平滑滚动与导航高亮（基于页面路径检测）

### 新闻系统（News）

- 新闻列表展示（主页预览前3条 + 独立列表页）
- 新闻详情页（支持正文、图片、视频、文件附件）
- 支持 `\n` 换行和 `**加粗**` 格式
- 分页显示（每页10条，2列布局）
- 便捷的 JSON 数据管理

### 赛事系统（Competitions）

- 赛事列表展示（主页预览前3条 + 独立列表页）
- 赛事详情页（支持正文、图片、视频、文件附件）
- 支持 `\n` 换行和 `**加粗**` 格式
- 分页显示（每页10条，2列布局）

### 排名系统（Ranking Beta）

- **自动积分计算**：基于 ELO 变体算法，读取比赛记录自动计算积分
- **赛季积分继承**：每赛季保留50%历史基础 + 50%赛季表现
- **类型刷新·定格衰减**：同类型再参赛时锁定前批成绩（持续参赛保值），半衰期 `t` 默认180天（可在 `data/decay-config.json` 配置）
- **保值类型**：校乒赛单打/团体默认永久保值（可在 `data/decay-config.json` 配置）
- **多时间节点快照**：按赛季折叠显示，含赛季初始积分节点
- **排名变化对比**：▲绿色上升 / ▼红色下降 / NEW蓝色新上榜 / -灰色不变
- **积分变化对比**：自动计算与上一快照的积分差值
- **积分明细模态框**：点击姓名查看详细记录，按快照日期截断
- **双重积分显示**：外侧显示原始变动，括号内显示定格后变动
- **积分调整记录**：支持"比赛结果加分"类型
- **表头点击排序**：支持按序号、姓名、积分、积分变化、排名变化、场次、胜率排序

### 积分计算规则

- **基础积分**：根据积分差距分"高积分胜"和"爆冷"两种情况
- **赛事系数**：普通0.2 / 排位赛0.6 / 校乒联赛0.7 / 校乒赛团体0.8 / 校乒赛单打1.0
- **赛制系数**：score-log 可记录「赛制」default/bo3/bo5/bo7，倍率由 `event-coefficient.json` 保留键全局统一配置，未配置时按 1（仅社团积分生效）
- **时间权重**：2^(-距比赛天数/t)，t 默认180天可配置，按"球员×类型"批次分组
- **定格衰减**：同一类型再次出现时，前一批次权重锁死定格；仅最后一批随时间衰减
- **保值类型**：校乒赛单打/团体不衰减（`data/decay-config.json` 的 `noDecayTypes`）
- **积分地板**：最低1200分
- **负者扣分**：胜者加分 × 0.8

### 数据可视化（Data Viz）

- **积分趋势折线图**：支持同时显示最多15名球员的积分变化
- **排名变化河流图**：展示Top N球员排名随时间流动
- **球员对比表**：两名球员的当前积分、交手胜率、历史交手记录
- **球员选择器**：多选复选框，默认选择前5名
- 图表使用 Chart.js 渲染，支持悬停查看数值

### WTT 彩蛋（Easter Egg）

- **WTT Hub**（`wtt_hub.html`）：男子/女子单打、双打、混双积分排名入口，自动检测各项目数据状态
- **WTT 排名**（`wtt_ranking.html`）：基于真实 WTT 比赛记录的积分模拟排名，支持时间节点切换、排序、积分明细
- **WTT 数据可视化**（`wtt_dataviz.html`）：积分趋势、排名河流图、球员对比
- **WTT 个人数据**（`wtt_personal_stats.html`）：单名球员的战绩、对手分析、积分变化趋势
- 数据存放于 `wtt_data/{分类}/`（ms 男单 / ws 女单 / md 男双 / wd 女双 / xd 混双）
- 全站支持中英文双语切换，WTT 页面动态内容（图表、进度、统计）随语言实时刷新

### 社团信息

- 社团简介（历史、理念、活动，数据源自 `about.json`）
- 社团骨干展示（头像自动取姓氏首字）
- 二维码模态框（加入社团QQ群）
- 首页 Hero 区右下角显示网站最后更新时间

---

## 数据文件格式说明

### `about.json` - 社团简介

```json
{
  "lastUpdated": "2026-06-17",
  "history": {
    "title": "社团历史",
    "content": "社团历史内容（支持\\n换行）"
  },
  "philosophy": {
    "title": "社团理念",
    "content": "社团理念内容"
  },
  "activities": {
    "title": "社团活动",
    "content": "社团活动内容（支持\\n换行和**加粗**）"
  }
}
```

### `players.json` - 统一球员档案

```json
{
  "version": "1",
  "baseDate": "2026-03-01",
  "players": [
    {
      "uid": 10000,
      "name": "姓名",
      "aliases": [],
      "initialScore": 2000,
      "tags": ["校队成员"],
      "honors": ["校乒赛2025单打冠军"],
      "role": "社长",
      "qq": "",
      "description": "",
      "status": "active"
    }
  ]
}
```

> 角色字段非空的球员会自动出现在社团骨干页（members.html）。每名球员拥有唯一 5 位 uid（10000 起），用于个人主页地址 `player.html?uid=xxxxx`。旧版 `members.json` / `player-tags.json` / `initial-scores.json` 已移入 `data/_legacy/` 仅作兼容回退。各字段的详细取值形式、用途与维护约束见 [docs/players-json.md](docs/players-json.md)。

### `news/` `competitions/` `qa/` - 新闻动态 / 赛事信息 / 常见问题

三类内容采用**一条目一个文件夹**的存储方式：

```
data/news/               data/competitions/     data/qa/
├── index.json           ├── index.json         ├── index.json   ← 生成：元数据索引
├── search.json          ├── search.json        ├── search.json  ← 生成：搜索索引（含正文）
├── n1/                  ├── c1/                ├── q1/
│   ├── n1.json          │   ├── c1.json        │   ├── q1.json  ← 唯一数据源（编辑维护时改它）
│   ├── n1.history.json  │   ├── c1.history.json│   ├── q1.history.json ← 生成：版本清单
│   └── n1.v1.json       │   └── c1.v1.json     │   └── q1.v1.json      ← 生成：版本快照（只读）
├── n2/                  ├── c2/                └── q2/
└── ...                  └── ...
```

各文件职责：

- `{id}/{id}.json`：**唯一数据源**，编辑维护时只改它（纯内容字段，不含 `history`）
- `{id}/{id}.history.json`：版本清单（生成），形如 `[{version, updatedAt, title, visible, file}]`，新→旧排列
- `{id}/{id}.v{n}.json`：版本快照 v{n}（生成，只读；n 从 1 起递增，只增不改）
- `index.json`：由 `tools/sync_content.py` 生成的**元数据索引**（id/date/title/excerpt/tag/media/visible），供列表与详情兜底使用，**不要手动编辑**
- `search.json`：由脚本生成的**搜索索引**（id/date/title/excerpt/content），**不要手动编辑**
- 列表与搜索按 `date` 倒序展示，`date` 需为 `YYYY-MM-DD`（该字段也用于排序与校验）

条目展示文件格式（三类通用，字段可选多少不同）：

```json
{
  "id": "n1",
  "date": "2025-01-05",
  "title": "标题",
  "excerpt": "摘要（支持\\n换行和**加粗**）",
  "content": "正文内容（可选）",
  "tag": "notice",
  "media": [
    {"type": "image", "src": "Assets/images/example.jpg"},
    {"type": "video", "src": "Assets/videos/example.mp4"},
    {"type": "file", "src": "Assets/files/example.pdf", "name": "文件名"}
  ]
}
```

#### 显示控制（`visible`）

可选字段，默认显示。设为 `false` 时前台**隐藏**（列表、搜索、详情均不可见），但条目仍保留在 `index.json`/`search.json` 中，管理后台会显示隐藏数量；改回 `true` 即可恢复：

```json
{ "id": "n1", "visible": false }
```

#### 历史版本（版本清单 + 快照）

由 `tools/sync_content.py` **自动维护**，请勿手动编辑：

- 首次同步为每条目建立 v1 基线快照（`updatedAt` 取条目 `date`）
- 此后每次内容变更（`date/title/excerpt/content/tag/media` 任一变化），同步时自动把**上一版线上内容**归档为新快照（版本号 +1，`updatedAt` 为当天），版本清单从新到旧排列
- 每次同步后清单首项与当前线上内容一致，未改动时重复运行脚本不会新增快照（幂等）
- 详情页自动显示版本号与最后更新时间，可展开查看并切换旧版本（点击"查看"时按清单 `file` 懒加载对应快照文件）
- 如需隐藏某个历史版本，可在对应快照文件 `{id}.v{n}.json` 上设 `"visible": false`（同步时保留进清单，详情页历史列表不显示）

```json
{
  "version": 2,
  "updatedAt": "2026-08-11",
  "title": "历史标题",
  "visible": null,
  "file": "n1.v2.json"
}
```

#### 新闻标签类型

| tag 值    | 中文标签 | 英文标签    | 说明         |
|-----------|----------|-------------|--------------|
| `match`   | 赛事     | Match       | 比赛相关新闻 |
| `training`| 训练     | Training    | 训练相关通知 |
| `notice`  | 公告     | Notice      | 重要公告     |
| `event`   | 活动     | Event       | 社团活动     |
| `daily`   | 日常     | Daily       | 日常动态     |

#### 赛事标签类型

| tag 值      | 中文标签 | 英文标签    | 说明             |
|-------------|----------|-------------|------------------|
| `upcoming`  | 即将开始 | Upcoming    | 即将举行的比赛   |
| `result`    | 比赛结果 | Result      | 已结束的比赛结果 |
| `live`      | 进行中   | Live        | 正在进行的比赛   |

#### 更新索引（必做）

编辑任意条目文件后，运行：

```bash
python tools/sync_content.py            # 重写 index.json / search.json + 维护版本历史（附带校验警告）
python tools/sync_content.py --check    # 仅校验（含预计新增快照数），不写入
```

- 新增条目：在 `data/{type}/{id}/` 下新建 `{id}.json`，运行脚本即可（首次同步自动建立 v1 基线快照）
- 旧版扁平文件（`data/{type}/{id}.json`，含内嵌 history）：运行脚本时自动一次性迁移为文件夹结构（快照从内嵌 history 抽取，平铺文件删除）
- 脚本会校验：文件名 == 条目 id、必填字段、tag 白名单、日期格式、media 文件是否存在、id 唯一、清单与快照结构（版本号递减、字段齐全）。输出中会显示各类型隐藏数与快照总数。

> 原合并版 `data/news.json` / `data/competitions.json` / `data/qa.json` 已备份至 `data/_legacy/`，仅作历史存档，代码不再读取。

### `_legacy/initial-scores.json` - 初始积分配置（旧版）

> 已迁移至 `data/players.json` 的 `initialScore` 字段。旧文件仅作为兼容回退保留：

```json
{
  "baseDate": "2026-03-01",
  "initialScores": {
    "陈瑜萱": 2019,
    "祁子傲": 2029,
    "任峻贤": 2100
  },
  "snapshotDates": [
    "2026-03-15",
    "2026-03-31",
    "2026-04-15"
  ]
}
```

### `event-coefficient.json` - 赛事系数

```json
{
  "普通": 0.2,
  "排位赛": 0.6,
  "挑战赛": 0.6,
  "校乒联赛": 0.7,
  "十二强赛": 0.7,
  "校乒赛团体": 0.8,
  "校乒赛单打": 1.0,
  "赛制系数": {},
  "默认赛制": {}
}
```

| 键 | 类型 | 说明 |
| --- | --- | --- |
| （赛事类型） | number | 各赛事类型的积分系数 |
| `赛制系数` | object | **保留键**。各赛制的全局统一倍率（仅社团积分生效），如 `"bo3": 0.8, "bo5": 1.1, "bo7": 1.5`；留空表示全部按 1 |
| `默认赛制` | object | **保留键**。各赛事类型 `default` 赛制所映射的赛制，如 `"普通": "bo3"`；未配置映射的类型 default 按 1 |

> 保留键的值为对象而非数值，遍历该文件时请按「值为 number」过滤出真实赛事类型（前端与 CI 已做过滤）。赛制系数机制不影响 WTT 积分。

### `seasons.json` - 赛季定义

```json
[
  {
    "id": "2026-spring",
    "label": "2026年春季学期",
    "startDate": "2026-03-01",
    "endDate": "2026-06-30",
    "snapshotDates": [
      "2026-03-15",
      "2026-03-31",
      "2026-04-15"
    ]
  }
]
```

### `score-log.json` - 比赛记录 + 积分调整

```json
[
  { "日期": "2026-03-13", "类型": "普通", "赛制": "bo3", "胜者": "魏罗瑞", "负者": "任峻贤" },
  { "日期": "2026-03-26", "类型": "比赛结果加分", "对象": "任峻贤", "分数": "+100" }
]
```

#### 比赛记录字段

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `日期` | string | 比赛日期，格式 `YYYY-MM-DD` |
| `类型` | string | 比赛类型，对应 `event-coefficient.json` 中的键 |
| `赛制` | string | 可选。`default` / `bo3` / `bo5` / `bo7`，缺省等同 `default`；default 按该类型的「默认赛制」映射解析，未配置时系数按 1（仅影响社团积分） |
| `胜者` | string | 胜者姓名 |
| `负者` | string | 负者姓名 |

#### 积分调整记录字段

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `日期` | string | 调整日期 |
| `类型` | string | 固定为 `"比赛结果加分"` |
| `对象` | string | 调整积分的球员姓名 |
| `分数` | string/number | 积分变化量，如 `"+100"` 或 `-30` |

> **注意**：积分调整记录不需要 `胜者` 和 `负者` 字段。

> **关于同日重复记录**：数据中存在 `(日期, 类型, 胜者, 负者)` 完全相同的条目（截至 2026-08 共 18 组）。业务口径为**同一天确实进行了多场对局**（如三局两胜的多局较量），每场独立计分，属正常录入，请勿去重。WTT 数据导入脚本（tools/import_*.py）对该元组去重仅用于防止同一事件重复导入，与校内 score-log 语义不同。

---

## ID 命名规范

### 可接受的字符

| 字符类型       | 示例         | 推荐度     |
|----------------|--------------|------------|
| 小写字母       | `n1`, `c2`   | 强烈推荐   |
| 大写字母       | `N1`, `C2`   | 推荐       |
| 数字           | `1`, `123`   | 推荐       |
| 连字符 `-`     | `news-1`     | 推荐       |
| 下划线 `_`     | `news_1`     | 推荐       |

### 不可使用的字符

| 字符 | 原因 |
| --- | --- |
| 空格 | 破坏 URL 结构 |
| `#` `?` `&` `=` `/` | URL 特殊标记 |
| `\` `%` `+` `@` `!` `$` 等 | 可能引起解析问题 |

### 推荐命名格式

- 新闻：`n1`, `n2`, `n3`, ...
- 赛事：`c1`, `c2`, `c3`, ...

---

## 积分系统规则摘要

### 基础积分（根据积分差距）

**高积分选手获胜（预期结果）**：

| 积分差距 | 0-49 | 50-99 | 100-149 | 150-199 | 200-299 | 300-399 | ≥400 |
|----------|------|-------|---------|---------|---------|---------|------|
| 基础积分 | 30   | 24    | 20      | 16      | 12      | 8       | 4    |

**低积分选手获胜（爆冷）**：

| 积分差距 | 0-49 | 50-99 | 100-149 | 150-199 | 200-299 | 300-399 | ≥400 |
|----------|------|-------|---------|---------|---------|---------|------|
| 基础积分 | 30   | 36    | 42      | 48      | 54      | 60      | 66   |

### 最终积分变化

```text
胜者加分 = 基础积分 × 赛事系数 × 赛制系数 × 时间权重
负者扣分 = 胜者加分 × 0.8
积分地板 = max(1200, 计算结果)
```

> **赛制系数**（仅社团积分）：由 score-log 记录的「赛制」字段（default/bo3/bo5/bo7，缺省视为 default）与 `event-coefficient.json` 中「赛制系数」「默认赛制」保留键共同决定；未配置时按 1。详见 `data/qa/q1/q1.v3.json` 规则书第五部分。

### 赛季积分继承

```text
下一赛季初始积分 = 本赛季初始积分 + (本赛季结束积分 - 本赛季初始积分) × 50%
```

---

## 自定义修改指南

### 修改社团信息

- 编辑 `about.json`：修改社团简介卡片内容
- 编辑 `players.json`：修改球员档案（含 `role` 非空者自动显示在社团骨干页）

### 添加新闻/赛事/问答

- 新增条目：新建文件夹 `data/{type}/{id}/`，放入条目文件 `data/{type}/{id}/{id}.json`（id 与文件名/文件夹名一致，格式见上文）
- 删除条目：直接删除对应 `data/{type}/{id}/` 文件夹
- 临时隐藏（不删除）：在条目文件里加 `"visible": false`，之后改回 `true` 即可恢复
- 媒体文件放入对应 `Assets/` 子文件夹，路径需与 JSON 中一致
- 修改后运行 `python tools/sync_content.py` 重新生成索引（顺序自动按 date 倒序，历史版本自动归档，无需手动排序）

### 添加比赛记录

- 编辑 `score-log.json`，在数组末尾追加新记录
- 系统自动计算积分，无需手动计算

### 调整快照日期

- 编辑 `players.json` 中的 `baseDate`（初始积分基准日）
- 编辑 `seasons.json` 中的赛季起始/结束日期

### 调整主题色

编辑 `style.css` 中 `:root` 的 CSS 变量：

```css
:root {
    --primary-blue: #007bff;    /* 主色调 */
    --primary-dark: #0056b3;    /* 深色变体 */
    --accent-red: #ff4d4f;      /* 强调色 */
}
```

---

### 中英文翻译

编辑 `js/common.js` 中 `i18n` 对象的 `zh` 和 `en` 部分，可自由扩展翻译内容。

---

## 浏览器兼容性

- Chrome 90+
- Firefox 88+
- Safari 14+
- Edge 90+
- 移动端 Safari 和 Chrome

---

## 许可证

校园社团内部使用

---

## 联系方式

武汉外国语学校乒乓球社团
训练地点：校体育馆二楼乒乓球馆
