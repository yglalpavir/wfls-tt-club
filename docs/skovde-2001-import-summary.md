# 2001 Swedish Open (Skovde) 数据导入记录

本次将 **2001 年瑞典公开赛（Swedish Open Skovde，2001-11-21 ~ 2001-11-25）** 的男单（MS）/ 女单（WS）比赛数据导入 WTT 数据系统，类型为 `ittf公开赛`。

## 1. 赛事信息

| 项 | 值 |
| --- | --- |
| 赛事 | 2001 Swedish Open Skovde |
| 时间 | 2001-11-21 ~ 2001-11-25 |
| 类别 | MS（男单）、WS（女单） |
| 类型 | `ittf公开赛`（系数 0.42，两项目 event-coefficient.json 均已存在） |
| 数据来源 | 用户提供（瑞典公开赛官方结果，含资格赛与正赛） |

## 2. 导入文件

| 文件 | 场次数 |
| --- | --- |
| `wtt_data/ms/score-log-2001-wtt.json` | 178 场 |
| `wtt_data/ws/score-log-2001-ws.json` | 104 场 |
| 合计 | 282 场 |

已同步注册至 `wtt_data/ms/manifest.json`、`wtt_data/ws/manifest.json` 的 scoreFiles 首位。

原始数据保留在 `tools/_skovde2001_ms_raw.txt`、`tools/_skovde2001_ws_raw.txt`（tab 分隔：Year/Event/PlayerA/空/PlayerB/空/Sub-event/Stage/Round/Result/Games/Winner）。

## 3. 日期分配

按赛程大致分配（无需精确到天）：Qualification 小组赛 → 11-21，QR16 → 11-22，正赛 R64/R32 → 11-23，R16/1/4决赛 → 11-24，半决赛/决赛 → 11-25。

| 日期 | MS | WS |
| --- | --- | --- |
| 2001-11-21（资格赛） | 125 | 57 |
| 2001-11-22（QR16） | 6 | 0 |
| 2001-11-23（R64/R32） | 32 | 32 |
| 2001-11-24（R16/QF） | 12 | 12 |
| 2001-11-25（SF/F） | 3 | 3 |

## 4. 姓名规范处理

遵循 `wtt_data/player-name-format.md`：

- 欧洲/美洲球员：`名 姓`，姓全大写（如 `Cedrik CABESTANY`、`Timo BOLL`）。
- 中/韩/朝球员：`姓 名`（如 `WANG Liqin`、`RYU Seungmin`、`JONG Kyong Chol`）。
- 日本球员：`名 姓`（如 `Seiya KISHIKAWA`、`Toshio TASAKI`）。
- 华裔代表他国：保留中式 `姓 名`（如 `CHEN Weixing`(AUT)、`CHANG Miao`(NOR)、`NI Xia Lian`(LUX)、`LI Jiawei`/`JIANG Huajun`(SGP 等)、`WANG Jianfeng`(NOR)）。
- 年份后缀去除：`GUO Yan (1982)` → `GUO Yan`、`KOSTROMINA Tatyana (1973)` → `Tatyana KOSTROMINA`（数据库无年份后缀先例，且无同名冲突）。

全部 282 场无缺失名字、无重复导入。

## 5. 协会籍（assoc.json）补充

为本次新增球员补齐协会/国家记录（`source: user-confirmed`），追加到 `wtt_data/ms/assoc.json` 与 `wtt_data/ws/assoc.json`：

| 文件 | 新增 | 现有 | 合计 |
| --- | --- | --- | --- |
| `wtt_data/ms/assoc.json` | 116 | 435 | 551 |
| `wtt_data/ws/assoc.json` | 72 | 825 | 897 |

要点：

- 国家代码来自原始数据括号内（如 DEN/FRA/CHI/NOR/AUT/SWE/CZE/JPN/KOR/CHN/HKG/GER/POL/NED/PRK/BEL/TPE/SGP/CRO/LUX/BLR/ROU/ITA/SLO/SRB/SVK/ESP/TUR/ENG/WAL/AUS/SUI/LIE/CHI 等）。
- 新增国家映射：`LIE → Liechtenstein`。
- 键名顺序与 score-log 一致；查询端 `wttGetPlayerAssoc` 按 `wttNameIdentity`（词序无关）匹配，故与既有 assoc 键（如 `Xia Lian NI`）不冲突、不重复。

## 6. 关键场次验证

| 场次 | 结果 |
| --- | --- |
| MS 决赛 | `WANG Liqin` 胜 `RYU Seungmin`（2001-11-25） |
| MS 半决赛 | `RYU Seungmin` 胜 `Fredrik HAKANSSON`（2001-11-25） |
| WS 决赛 | `GUO Yan` 胜 `Tamara BOROS`（2001-11-25） |
| WS 半决赛 | `GUO Yan` 胜 `BAI Yang`（2001-11-25） |

## 7. 相关脚本

- `tools/import_skovde_2001.py`：导入 score-log 的解析脚本（含 NAME_MAP 姓名映射表、日期分配、去重追加）。
- `tools/add_assoc_skovde_2001.py`：补充 assoc.json 的脚本（复用 NAME_MAP 与原始数据国家代码）。