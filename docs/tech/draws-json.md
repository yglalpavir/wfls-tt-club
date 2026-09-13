# draws.json 格式规范（v3）

> v3 于 2026-09 引入。查看器（`js/draws-viewer.js`）通过 `dcNormalizeDraw` 兼容渲染 v2 旧数据；
> 编辑器（`draws-editor.html`）读写 v3。共享模型/几何/校验逻辑都在 `js/draws-core.js`。

## 顶层结构

`data/draws.json` 是数组，每张布表一个对象：

```json
{
  "id": "d1",
  "version": 3,
  "competitionId": "c5",
  "title": "2026乒乓球单打淘汰赛",
  "subtitle": "可选副标题",
  "layout": "grid",
  "grid": { "cols": 5, "rows": 32, "cellWidth": 180, "cellHeight": 64 },
  "roundLabels": { "0": "第一轮", "3": "半决赛", "4": "决赛" },
  "theme": { "accent": "", "showSeeds": true, "showLegend": true },
  "cards": [ ... ],
  "connections": [ ... ]
}
```

### 字段说明

| 字段 | 必填 | 说明 |
|------|------|------|
| `id` | ✅ | 布表 ID，`d` 前缀递增 |
| `version` | ✅ | 固定 `3` |
| `competitionId` | 建议 | 关联 `data/competitions/{id}/`；`ci_validate.py` 校验存在性；详情页据此挂载查看器 |
| `title` | ✅ | 查看器标题栏 |
| `layout` | — | `grid`（默认，省略可写）：按卡片 `col/row` 布局；`auto`：按 `round/order` 自动分列垂直居中（不可拖拽编辑） |
| `grid` | ✅ | `cols/rows` 为卡片区范围（编辑器导出时自动重算）；`cellWidth/cellHeight` 单元格尺寸；`gap`（默认 8）/`padX`（默认 80）/`padY`（默认 40）有默认值，等于默认值时省略 |
| `roundLabels` | — | 按列索引的自定义轮次标签；缺省用默认名（第一轮/第二轮/1/4决赛/半决赛/决赛） |
| `theme` | — | `accent` 卡片主题色（CSS 颜色，空串用默认）；`showSeeds` 种子角标；`showLegend` 图例 |
| `cards` | ✅ | 卡片数组 |
| `connections` | — | 晋级连线数组 |

## 卡片（cards）

### match（比赛，默认类型，`type` 可省略）

```json
{
  "id": "m17",
  "col": 1, "row": 1,
  "player1": { "name": "祁子傲", "seed": 1 },
  "player2": "严嘉翔",
  "score": "3-2",
  "games": ["11-9", "8-11", "11-7", "9-11", "12-10"],
  "winner": 1,
  "status": "final",
  "time": "09-04 14:00",
  "venue": "1号球台",
  "note": "可选备注"
}
```

- **选手**：纯字符串（只写名字）或对象 `{name, seed?, note?, desc?}`。`seed` 种子号渲染为蓝色角标；`note` 附加说明（如「弃赛」「替补」）渲染为黄色角标；`desc` 占位描述（如「A组第1」「半决赛1胜者」）。只有 `name` 时序列化会退化为纯字符串
- **坐标**：`col` 即轮次列，`row` 为列内网格行。序列化时若 `round === col` 则 `round` 省略
- **胜负**：`winner` 取 `0`（平局）/`1`/`2`；未开赛省略。`score` 总比分 `"3-1"`；`games` 逐局比分（弹窗中绿/灰分色显示）
- **status**：`scheduled`（待赛，虚线边框+时钟徽标）/ `live`（进行中，红边框+LIVE 徽标）/ `final`。**缺省时按是否含比分自动推断**，只有需要覆盖自动推断时才写

### bye（轮空）

```json
{ "id": "m1", "type": "bye", "col": 0, "row": 0, "player1": "祁子傲", "winner": 1 }
```

只填 `player1`，查看器显示 `— BYE —`。

### champion（冠军）

```json
{ "id": "m32", "type": "champion", "col": 4, "row": 17, "player1": "任峻贤", "label": "冠军" }
```

### note（备注）

```json
{ "id": "g1", "type": "note", "col": 0, "row": 0, "text": "A组（单循环）" }
```

## 连线（connections）

```json
{ "from": "m1", "to": "m17" }
```

- 方向默认 `fromSide: "right"` → `toSide: "left"`，等于默认值时省略；可选 `top/bottom`
- `kind: "loser"` 标记负者晋级线（如季军赛）
- `ci_validate.py` 校验 `from`/`to` 引用的卡片存在
- **胜者传播**：编辑器「填充胜者」按连线把已完赛卡片的胜者写入下一场空位

## 工作流

1. **可视化编辑**：`admin.html` → 「对阵表编辑器」（或直接开 `draws-editor.html`）。模板生成 / 拖拽 / 连线 / 撤销重做 / 校验 / localStorage 自动保存
2. **导出**：编辑器「下载 draws.json」或「复制」，替换仓库 `data/draws.json`
3. **校验**：`python tools/ci_validate.py`（校验 competitionId 引用、卡片 id 唯一、winner 合法）
4. **提交**：随常规部署发布

## 几何规则（改布局前必读）

- 卡片位置：`x = padX + col*cellWidth + gap/2`，`y = padY + row*cellHeight + gap/2`；卡片尺寸 `cellWidth-gap` × `cellHeight-gap`
- 连线锚点在卡片边缘中点，贝塞尔控制点取两端中点（水平连接呈 S 形收束）
- 淘汰赛树形排布：第 r 列第 i 张卡 `row = (i+0.5)*2^r*2 - 1`（`dcAutoArrange` / 模板生成均遵守）
- `layout: "auto"` 时忽略 `col/row`，按 `round` 分列、列内按 `order` 堆叠并垂直居中

## 迁移

v2 → v3：`python tools/migrate_draws_v3.py`（就地升级；`--check` 只检查）。迁移内容：
补 `type`、把 `"祁子傲(1)"` / `"陈瑜萱(2)(弃赛)"` 解析为结构化选手、剥离冗余方向字段；坐标/比分/胜负不变。
