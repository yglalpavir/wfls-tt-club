# news / competitions / qa 内容运营手册

本文档面向社团网站的内容维护人员，说明 **新闻（news）、赛事（competitions）、问答（qa）** 三类内容的完整维护流程：目录结构、新建条目、用 Markdown 文件写正文（`contentFile`）、同步脚本、版本历史与常见问题。

---

## 1. 概述

三类内容共用同一套存储与生成机制，统一由脚本 `tools/sync_content.py` 管理。

| 内容类型 | 数据目录 | 前台页面 | 示例 |
| --- | --- | --- | --- |
| 新闻 news | `data/news/` | `news.html`、首页"最新动态" | 社团公告、活动报道 |
| 赛事 competitions | `data/competitions/` | `competitions.html`、首页"赛事信息" | 比赛结果、赛制说明 |
| 问答 qa | `data/qa/` | `qa.html` | 积分规则、常见问题 |

**职责划分：**

- 你只需要**手动维护**：`data/{type}/{id}/{id}.json`（条目数据）和 `contentFile` 指向的 `.md` 正文文件。
- 其余文件（`index.json`、`search.json`、`{id}.history.json`、`{id}.v{n}.json`）全部由同步脚本**自动生成**，不要手动编辑。

---

## 2. 目录结构

以问答 `q1` 为例：

```
data/qa/
├── index.json              ← 生成：列表元数据（id/date/title/excerpt/tag/media/visible）
├── search.json             ← 生成：搜索索引（id/date/title/excerpt/content）
└── q1/                     ← 条目文件夹（一个条目一个文件夹）
    ├── q1.json             ← 手动维护：条目数据（唯一数据源）
    ├── q1.md               ← 手动维护：正文 Markdown（可选，由 contentFile 引用）
    ├── q1.history.json     ← 生成：版本清单
    ├── q1.v1.json          ← 生成：v1 版本快照（只读）
    └── q1.v2.json          ← 生成：v2 版本快照（只读）
```

news / competitions 结构与 qa 完全一致。

---

## 3. 新建一条内容（逐步操作）

### 3.1 创建条目文件夹与展示文件

1. 在 `data/{type}/` 下新建文件夹，**文件夹名 = 条目 id**（建议 `n17`、`c6`、`q3` 这类递增编号）。
2. 在文件夹内创建 `{id}.json`，内容示例：

```json
{
  "id": "n17",
  "date": "2026-08-12",
  "title": "标题",
  "excerpt": "列表卡片上显示的摘要文字。",
  "tag": "notice",
  "media": [],
  "content": "正文……"
}
```

### 3.2 必填字段

| 字段 | 类型 | 必填 | 说明 |
| --- | --- | :---: | --- |
| `id` | `string` | ✅ | 条目唯一编号，须与文件夹名一致 |
| `date` | `string` | ✅ | 展示日期，须含 `YYYY-MM-DD`（用于按日期排序） |
| `title` | `string` | ✅ | 标题 |
| `excerpt` | `string` | ✅ | 摘要，显示在列表卡片上 |
| `tag` | `string` | ✅ | 分类标签，须在白名单内 |

`tag` 白名单：

| 类型 | 允许的 tag |
| --- | --- |
| news | `notice`（公告）、`daily`（日常）、`match`（比赛）、`training`（训练）、`event`（活动） |
| competitions | `result`（比赛结果）、`upcoming`（即将开始）、`live`（进行中） |
| qa | `notice` |

### 3.3 正文的两种写法（二选一）

| 写法 | 适用场景 |
| --- | --- |
| `"content": "正文……"` | 正文很短、无换行/格式时；需要把换行写成 `\n` |
| `"contentFile": "q1.md"` | **推荐**：正文较长时，直接引用 Markdown 文件（见第 4 章） |

### 3.4 媒体附件（可选）

```json
"media": [
  { "type": "image", "src": "Assets/images/2026-05-31-004.png", "alt": "图片说明" },
  { "type": "video", "src": "Assets/videos/xxx.mp4" },
  { "type": "file", "src": "Assets/files/宣传海报.zip", "name": "宣传海报.zip" }
]
```

`src` 为站点根目录相对路径。同步脚本会校验文件真实存在，不存在时输出警告。

### 3.5 生成索引

```bash
python tools/sync_content.py
```

首次同步会自动为条目建立 v1 基线快照，并重写 `index.json`、`search.json`。输出类似：

```
[news] index.json/search.json 已更新: 16 条（隐藏 0）· 快照 16 个（隐藏 0）· 清单重写 0 · 新增快照 1
```

---

## 4. `contentFile`：用 Markdown 文件写正文（核心功能）

不必再把 md 里的换行手动转成 `\n` 粘进 JSON。在条目 JSON 里写：

```json
"contentFile": "q1.md"
```

### 4.1 引用方式的两种写法

| 写法 | 文件位置 | 示例 |
| --- | --- | --- |
| 纯文件名 | `data/{type}/{id}/{文件名}` | `"contentFile": "q1.md"` → `data/qa/q1/q1.md` |
| 含 `/` 的路径 | 站点根目录相对路径 | `"contentFile": "Assets/md/n1.md"` → `Assets/md/n1.md` |

### 4.2 优先级与回退

- `content` 与 `contentFile` 同时存在时，**以 `contentFile` 为准**（`content` 会被忽略）。
- `contentFile` 指向的文件不存在或读取失败时，回退使用 `content` 字段；同步脚本会输出警告提醒。

### 4.3 各环节如何消费 contentFile

| 环节 | 行为 |
| --- | --- |
| 详情页（`detail.html`） | 前端实时 fetch 该 md 文件渲染（**不依赖同步**，改 md 立即可见，需刷新页面） |
| 历史版本快照 `{id}.v{n}.json` | 同步时把 md 内容**内联**进快照（快照自包含、只增不改，回看旧版不依赖 md 现状） |
| 搜索索引 `search.json` | 同步时把 md 内容内联，正文可被搜索 |
| 版本比较 | 基于内联后的正文——**md 内容变了即自动归档新版本** |

### 4.4 典型工作流（修改正文）

1. 直接编辑 md 文件（如 `data/qa/q1/q1.md`）。
2. 运行 `python tools/sync_content.py`。
3. 脚本检测到正文变化，自动归档新版本快照（v3、v4……），更新 `search.json` 与版本清单。
4. 前台刷新即可看到新内容与新的历史版本。

---

## 5. 修改内容与版本历史

版本历史由脚本自动维护（只增不改）：

| 事件 | 结果 |
| --- | --- |
| 首次同步某条目 | 建立 **v1 基线**快照，`updatedAt` = 条目 `date` |
| 内容有变化（`date/title/excerpt/content/tag/media` 任一变化，含 md 正文变化） | 归档 **v{n+1}** 快照，`updatedAt` = 当天日期 |
| 内容无变化再次同步 | 幂等，不产生新快照、不重写清单 |
| 想在历史列表隐藏某个旧版本 | 在该快照文件（`{id}.v{n}.json`）里设 `"visible": false`，下次同步后生效 |

注意事项：

- 快照文件只增不改；删除快照会导致清单校验报错，不要手动删除。
- 展示文件 `{id}.json` 永远不会被脚本修改，你是唯一编辑者。

---

## 6. 隐藏条目

在 `{id}.json` 中设置 `"visible": false`（不需要时可删除该字段或改回 `true`）：

- 条目仍保留在 `index.json` / `search.json` 中，数据不丢失。
- 前台效果：不出现在搜索结果；详情页直接访问显示"未找到内容"。
- 注意：列表页（news/competitions 首页区块）目前不过滤 `visible`，如需完全从列表移除，请删除条目文件夹或暂时把 `date` 改到很久以前。

---

## 7. 同步脚本

```bash
python tools/sync_content.py          # 正常同步：迁移旧数据 + 维护版本历史 + 重写 index/search
python tools/sync_content.py --check  # 仅校验：报告问题与预计新增的快照数，不写任何文件
```

脚本行为（对 news / competitions / qa 三类分别执行）：

1. 自动迁移旧版扁平文件（`data/{type}/{id}.json` → 文件夹结构），历史版本一并抽取。
2. 扫描所有条目文件夹，逐条校验。
3. 维护版本历史：比对内联正文，变化则写新快照、重写清单。
4. 重新生成 `index.json`（列表元数据）与 `search.json`（含内联正文的搜索索引）。

退出码：有警告时返回 1，全通过返回 0。

---

## 8. 校验警告与处理

运行脚本时出现 `[警告]` 均不影响生成，但应尽快修复：

| 警告内容 | 含义与处理 |
| --- | --- |
| `文件名与 id 不一致` | 文件夹名/文件名 ≠ JSON 中的 `id`，统一命名 |
| `缺少必填字段 xxx` | 补上 `id/date/title/excerpt/tag` |
| `tag "xxx" 不在白名单中` | 改用该类型允许的 tag（见 3.2 表格） |
| `date 不含 YYYY-MM-DD` | 修正日期格式，否则条目排到列表末尾 |
| `media 文件不存在 xxx` | 检查 `src` 路径是否真实存在 |
| `contentFile 文件不存在 xxx` | 检查 md 文件是否已创建、路径是否正确 |
| `id "xxx" 重复` | 同一类型内 id 必须唯一 |
| `清单引用的快照文件不存在` | 快照被误删，从 git 恢复或删除对应清单条目 |
| `清单版本号未从新到旧递减` | 手改过 history.json，恢复由脚本生成的版本 |

---

## 9. 前端消费关系（便于排查"改了为什么没生效"）

| 页面 | 读取的文件 | 说明 |
| --- | --- | --- |
| 列表页（news/competitions/qa） | `data/{type}/index.json` | 列表卡片只用 `excerpt` |
| 全局搜索 | `data/{type}/search.json` | 正文（已内联 md）可被搜索 |
| 详情页 `detail.html?type=news&id=n1` | `data/{type}/{id}/{id}.json`（失败时回退 index/search） | `contentFile` 由前端实时拉取 md 渲染 |
| 详情页历史版本 | `{id}.history.json` + `{id}.v{n}.json` | 快照内含内联正文 |

排查口诀：**列表看 index.json，搜索看 search.json，详情看条目 json + md，版本看快照**。

---

## 10. 常见问题（FAQ）

**Q1：改了 md 文件，为什么前台没变化？**
详情页是实时拉取 md 的，刷新页面即可（可能需要强制刷新 Ctrl+F5 清缓存）。但搜索与版本归档需要重新运行同步脚本。

**Q2：搜索搜不到新正文内容？**
`search.json` 是同步时生成的，运行 `python tools/sync_content.py` 后即可。

**Q3：content 和 contentFile 都写了会怎样？**
以 `contentFile` 为准，`content` 被忽略。

**Q4：如何把现有条目的 content 迁移到 md？**
1. 在条目文件夹里新建 md 文件，把正文粘贴进去（保留 md 格式）。
2. 在 `{id}.json` 中把 `content` 删掉，加上 `"contentFile": "xx.md"`。
3. 运行同步脚本（md 内容与原 content 一致则不会产生多余新版本；不一致会归档一个新版本，属正常）。

**Q5：如何彻底删除一条内容？**
删除 `data/{type}/{id}/` 整个文件夹，运行同步脚本重写索引即可（删除前建议确认 git 历史可恢复）。

**Q6：为什么同步输出乱码？**
Windows 控制台代码页问题，不影响文件内容。也可以执行 `$OutputEncoding` 相关设置或用 `--check` 确认无警告。

**Q7：文件编码有什么要求？**
所有 JSON 与 md 文件必须为 **UTF-8**。用带 UTF-8 的编辑器（VS Code 等）编辑，否则中文会乱码。

**Q8：快照被我不小心删了怎么办？**
`git checkout -- data/{type}/{id}/` 恢复；清单与快照必须一一对应，不要只删一半。
