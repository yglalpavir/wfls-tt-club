# `data/players.json` 统一球员档案格式

本文档说明 `data/players.json` 的完整数据结构、各字段的取值形式、在站点各功能中的用途，以及相关的兼容与生成规则。本文档与 `wtt_data/*/score-log-*.json` 等 WTT 模拟数据无关，仅针对社团站内核心球员档案。

---

## 1. 文件位置与加载方式

- 路径：`data/players.json`
- 加载：`js/common.js` 中的 `loadPlayers()` 负责读取，失败时回退到旧版 `data/legacy/*`。
- 其余数据文件会**以本文件为事实来源**派生：
  - `initialScoresData`：由每位球员的 `initialScore` + 顶层 `baseDate` 生成（见 `js/score-engine.js` 的 `loadInitialScores()`）。
  - `playerTagsData`：由每位球员的 `tags` / `honors` 生成（见 `js/common.js` 的 `loadPlayerTagsData()`）。
  - `membersData`：由 `role` 非空的球员生成（见 `js/common.js` 的 `loadMembersData()`）。

---

## 2. 顶层结构

```json
{
  "version": 1,
  "baseDate": "2026-03-01",
  "players": []
}
```

| 字段 | 类型 | 必填 | 说明 |
| --- | --- | :---: | --- |
| `version` | `number` | ✅ | 档案结构版本号，当前为 `1`。 |
| `baseDate` | `string` | ✅ | 初始积分基准日，格式 `YYYY-MM-DD`，即所有球员 `initialScore` 对应的基准快照日期。 |
| `players` | `Player[]` | ✅ | 球员档案数组。 |

---

## 3. 球员对象字段（`players[]` 每一项）

一个完整的球员对象示例：

```json
{
  "uid": 10000,
  "name": "陈瑜萱",
  "aliases": [],
  "initialScore": 2000,
  "tags": ["25-26年副社长", "校队成员", "大满贯"],
  "honors": ["校乒赛2025单打冠军", "校乒赛2026团体冠军"],
  "role": "社长",
  "qq": "3152269031",
  "description": "统筹社团事务",
  "status": "active"
}
```

### 3.1 `uid` — 球员唯一编号

| 项 | 值 |
| --- | --- |
| 类型 | `number`（整数） |
| 约束 | 全站唯一；正则 `^\d{5,}$`（至少 5 位数字，当前从 `10000` 起）；`tools/build_players.js` 会校验唯一性与格式。 |
| 用途 | 个人主页地址参数 `player.html?uid=10000`；`getPlayerByUid()` 按此建立 `uidIndex` 索引。 |
| 注意 | 由构建脚本按 `initialScore` 降序（同分按姓名拼音升序）自动稳定分配，勿手动重复。 |

### 3.2 `name` — 规范姓名（主键）

| 项 | 值 |
| --- | --- |
| 类型 | `string` |
| 约束 | 全站唯一；唯一用于跨文件关联（`score-log.json`、`initial-scores.json`、`player-tags.json` 中的姓名都要与其一致）。 |
| 用途 | 排名数据 `'姓名'` 字段的规范名；`nameIndex` 主键；比赛记录归一化基准（`normalizePlayerName()`）；积分计算/统计的匹配键。 |

> 注意：`name` 是全站积分系统的"事实来源"。`score-log.json` 中出现且不在 `players.json` 的姓名会被视为"无档案球员"（无 uid、无初始积分），`loadInitialScores()` 会给其赋予 `DEFAULT_INITIAL_SCORE`（默认 1300）。

### 3.3 `aliases` — 别名数组

| 项 | 值 |
| --- | --- |
| 类型 | `string[]`，可为空数组 |
| 用途 | 
- 全站搜索时作为额外的匹配关键词（`js/common.js` 的 `performSearch`；`js/personal-stats.js` 的拼音/模糊搜索）。
- `buildPlayerIndexes()` 会把每个别名写入 `nameIndex`，使 `getPlayerByName(别名)` 也能找到对应球员。
- 建议：写入曾用名、英文名、昵称、易错拼写等，便于模糊检索时命中。 |

> 当前 `tools/build_players.js` 初始生成时为 `[]`，需手动维护补充别名。

### 3.4 `initialScore` — 初始积分

| 项 | 值 |
| --- | --- |
| 类型 | `number` |
| 约束 | 无数据时默认取 `DEFAULT_INITIAL_SCORE`（默认 1300）；积分地板 `SCORE_FLOOR` 为 1200。 |
| 用途 | 构建 `initialScoresData.initialScores`（姓名 → 分）映射，是积分引擎所有赛季计算的基准（见 `js/score-engine.js` 的 `getSeasonStartScores()`、`js/personal-stats.js` 的 `getApproxScoreAtDate()` / `computeDailyScoreHistory()` 等）。 |

> 说明：`tools/build_players.js` 会读取 `data/legacy/initial-scores.json` 迁移该字段；旧文件仅作兼容回退保留。

### 3.5 `tags` — 标签数组（可选）

| 项 | 值 |
| --- | --- |
| 类型 | `string[]` |
| 用途 | 
- 标签过滤：`data/personal-stats.html` 顶部「按标签筛选」，`js/personal-stats.js` 使用 `TAG_MERGE_RULES` 合并显示标签。
- 球员个人主页、个人数据页展示归类徽章。
- 全站搜索、个人数据搜索的匹配维度。 |
| 约定 | 标签名建议语义化（如 `校队成员`、`26-27年社长`），不限制数量；`loadPlayerTagsData()` 由 `tags`/`honors` 直接构造 `{ name: {tags, honors} }`。 |

> 显示层存在**标签合并规则** `TAG_MERGE_RULES`（`js/personal-stats.js`）：例如 `'社长/副社长'` 聚合了多个原始标签（`26-27年社长` 等），合并仅影响「标签筛选」的展示入口，不影响底层数据。

### 3.6 `honors` — 荣誉数组（可选）

| 项 | 值 |
| --- | --- |
| 类型 | `string[]` |
| 用途 | 在 `player.html` 个人主页与个人数据卡中以奖章徽章展示；首个荣誉带皇冠图标（`wtt_personal_stats.js` 中亦有使用）。 |

### 3.7 `role` — 职务（可选）

| 项 | 值 |
| --- | --- |
| 类型 | `string` |
| 约束 | `role` 非空 ⇒ 该球员自动出现在社团骨干页 `members.html`（`loadMembersData()` 筛选 `p.role` 非空者）。 |
| 用途 | 骨干卡片角色标签、`player.html` 的角色 chip（`player-role-chip`）、搜索摘要。 |

### 3.8 `qq` — QQ 号（可选，用于头像）

| 项 | 值 |
| --- | --- |
| 类型 | `string`（纯数字字符串） |
| 用途 | 骨干卡片头像走 QQ 头像服务 `https://q1.qlogo.cn/g?b=qq&nk=<qq>&s=640`（`getMemberAvatarHTML()`）；无 `qq` 时头像退化为姓名首字。 | 

### 3.9 `description` — 个人简介（可选）

| 项 | 值 |
| --- | --- |
| 类型 | `string` |
| 格式 | 支持 `\n` 换行；也可包含 `**加粗**`（见 `renderAllMembersPage` 使用 `formatExcerpt` 渲染）。 |
| 用途 | 骨干页卡片描述、全站搜索的匹配文本、`player.html` 档案区。 |

### 3.10 `status` — 在校状态

| 项 | 值 |
| --- | --- |
| 类型 | `string` |
| 枚举 | `"active"`（在校）或 `"alumni"`（已离校） |
| 用途 | `player.html` 状态徽章 `player-status-chip`（`active` 绿点 / 其余按 Alumni 处理）；`tools/build_players.js` 初始写入 `"active"`。 |

> 除 `active` / `alumni` 外的任意值都会被当作 `alumni` 处理（`js/player-page.js`：`player.status === 'active' ? active : alumni`）。

---

## 4. 数据结构与上游/下游依赖

```
data/legacy/initial-scores.json ──► data/players.json ◄── data/legacy/player-tags.json
data/legacy/members.json      ──►        │                 data/legacy/members.json
                                          │
                    ┌─────────────────────┼─────────────────────┐
                    ▼                     ▼                     ▼
            积分引擎/排名            会员展示               搜索
            score-engine.js /       common.js             common.js / personal-stats.js
            ranking.js 等           loadMembersData        performSearch / 拼音模糊搜索
```

---

## 5. 兼容与回退

- `loadPlayers()` 优先读取新版 `players.json`；若解析失败或结构异常（`!Array.isArray(players.players)`），会置空 `playersData` 并返回 `false`。
- 在 `players.json` 缺失/失败时，下游数据会各自回退到 `data/legacy/` 旧文件：
  - `initial-scores.json` → `loadInitialScores()` 回退使用（生成 `initialScoresData`）。
  - `player-tags.json` → `loadPlayerTagsData()` 回退使用（生成 `playerTagsData`）。
  - `members.json` → `loadMembersData()` 回退使用（生成 `membersData`）。
- 推荐始终以 `data/players.json` 为唯一事实来源进行维护；旧文件仅作兼容回退保留。

---

## 6. 维护与写入约束

| 关注点 | 约束 |
| --- | --- |
| 新增球员 | 手动为该球员补 `uid`（5 位以上唯一数字）、`name`、`initialScore`、空数组 `tags`/`honors`/`aliases`、`status:"active"`。 |
| 一致性 | `name` 必须与 `data/score-log.json` 中的 `'胜者'` / `'负者'` / `'对象'` 完全一致，否则该姓名会脱离档案（无 uid、无名下初始积分）。 |
| uid 校验 | `tools/build_players.js`（一次性迁移脚本）内含 `/^\d{5,}$/` 与唯一性校验；不建议手工改动已存在的 `uid`，避免破坏 `player.html` 外链。 |
| 别名 | 建议随角色变更补充 `aliases`，让英文名/曾用名也能被搜索命中。 |
| 生成 | 若需从旧数据重建，删除 `data/players.json` 后运行 `node tools/build_players.js`（注意脚本默认拒绝覆盖已存在的目标文件）。 |