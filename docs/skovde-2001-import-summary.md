# 2001 ITTF Pro Tour 数据导入记录

本次将 **2001 年四站 ITTF Pro Tour 公开赛** 的男单（MS）/ 女单（WS）比赛数据导入 WTT 数据系统，类型为 `ittf公开赛`：

1. Swedish Open Skovde（2001-11-21 ~ 2001-11-25）
2. German Open Bayreuth（2001-10-18 ~ 2001-10-21）
3. Japan Open Yokohama（2001-09-21 ~ 2001-09-24）
4. US Open Fort Lauderdale（2001-07-04 ~ 2001-07-08）

---

# 第一部分：Swedish Open Skovde

## 1. 赛事信息

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

---

# 第二部分：German Open Bayreuth

## 1. 赛事信息

| 项 | 值 |
| --- | --- |
| 赛事 | 2001 German Open Bayreuth |
| 时间 | 2001-10-18 ~ 2001-10-21 |
| 类别 | MS（男单）、WS（女单） |
| 类型 | `ittf公开赛`（系数 0.42，两项目 event-coefficient.json 均已存在） |
| 数据来源 | 用户提供（Ratings Central 官方结果，含资格赛与正赛） |
| 冠军 | MS: Vladimir SAMSONOV (BLR)；WS: RYU Jihae (KOR) |

## 2. 导入文件

| 文件 | 本次新增 | 累计场次 |
| --- | --- | --- |
| `wtt_data/ms/score-log-2001-wtt.json` | 183 场 | 361 场（含 Skovde 178） |
| `wtt_data/ws/score-log-2001-ws.json` | 132 场 | 236 场（含 Skovde 104） |

原始数据保留在 `tools/_bayreuth2001_raw.txt`。manifest.json 在 Skovde 时已注册 `score-log-2001-*`，无需改动。

## 3. 日期分配

按赛程分配：Qualification → 10-18，正赛 R64/R32 → 10-19，R16/1/4决赛 → 10-20，半决赛/决赛 → 10-21。

| 日期 | MS | WS |
| --- | --- | --- |
| 2001-10-18（资格赛） | 120 | 69 |
| 2001-10-19（R64/R32） | 48 | 48 |
| 2001-10-20（R16/QF） | 12 | 12 |
| 2001-10-21（SF/F） | 3 | 3 |

## 4. 姓名规范处理

沿用 player-name-format.md：欧洲/美洲 `名 姓`（姓全大写，如 `Vladimir SAMSONOV`、`Timo BOLL`）；中/韩/朝 `姓 名`（如 `JOO Saehyuk`、`KIM Kyungah`、`CHUANG Chih-Yuan`）；华裔代表他国保留中式（如 `LIU Song`(ARG)、`SCHOPP Jie`(GER)、`LIU Jia`(AUT)、`DUAN Yongjun`(SGP)、`JIANG Weizhong`(CRO)、`DING Yan`(ITA)、`WANG Yu`(ITA)）。

特殊处理：

- `WANG Yu (YOB=1981)` → `WANG Yu`（年份后缀去除，无同名冲突）。
- `KOSTROMINA Tatyana (1973)` → `Tatyana KOSTROMINA`（同 Skovde）。
- `KIM Kyungah` 与 `KIM Kyungha` 为两位不同韩国球员，分别保留原名。
- 同名单注意：`PAVLOVICH Viktoria`（WS）与 `PAVLOVICH Veronika`（WS）是两位不同球员；MS 另有 `SVENSSON Robert`、WS 另有 `SVENSSON Asa` 等，互不冲突。
- 原始文件有 3 处断行/缺列（CIOCIU vs TAMAS 被拆成两行、个别行少尾列），解析脚本已自动合并补齐。

全部 315 场无缺失名字、无重复导入。

## 5. 协会籍（assoc.json）补充

| 文件 | 本次新增 | 合计 |
| --- | --- | --- |
| `wtt_data/ms/assoc.json` | 82 | 633 |
| `wtt_data/ws/assoc.json` | 75 | 972 |

新增国家映射：`ARG/BRA/BIH/CAN/EGY/GRE/HUN/JOR/LTU/NZL/USA` 等。`LIU Jia` 已存在（键 `Jia LIU`），按 identity 跳过不覆盖。

## 6. 关键场次验证

| 场次 | 结果 |
| --- | --- |
| MS 决赛 | `Vladimir SAMSONOV` 胜 `Werner SCHLAGER`（2001-10-21） |
| MS 半决赛 | `Vladimir SAMSONOV` 胜 `Jan-Ove WALDNER`（2001-10-21） |
| MS 半决赛 | `Werner SCHLAGER` 胜 `Lucjan BLASZCZYK`（2001-10-21） |
| WS 决赛 | `RYU Jihae` 胜 `SCHOPP Jie`（2001-10-21） |
| WS 半决赛 | `RYU Jihae` 胜 `Tamara BOROS`（2001-10-21） |

## 7. 相关脚本

- `tools/import_bayreuth_2001.py`：Bayreuth 导入脚本（复用 Skovde NAME_MAP 并扩展，自动处理断行）。
- `tools/add_assoc_skovde_2001.py`：已扩展为同时支持 Skovde + Bayreuth 两个赛事。

---

# 第三部分：Japan Open Yokohama

## 1. 赛事信息

| 项 | 值 |
| --- | --- |
| 赛事 | 2001 Japan Open Yokohama |
| 时间 | 2001-09-21 ~ 2001-09-24（文件头部元数据 129 场） |
| 类别 | MS（男单）、WS（女单） |
| 类型 | `ittf公开赛`（系数 0.42，两项目 event-coefficient.json 均已存在） |
| 数据来源 | 用户提供（Ratings Central 官方结果，含资格赛与正赛） |
| 冠军 | MS: CHIANG Peng-Lung (TPE)；WS: WANG Nan (CHN) |

## 2. 导入文件

| 文件 | 本次新增 | 累计场次 |
| --- | --- | --- |
| `wtt_data/ms/score-log-2001-wtt.json` | 68 场 | 429 场 |
| `wtt_data/ws/score-log-2001-ws.json` | 61 场 | 297 场 |

原始数据保留在 `tools/_japanopen2001_raw.txt`。manifest.json 已注册 `score-log-2001-*`，无需改动。

## 3. 日期分配

按赛程分配：Qualification → 09-21，正赛 R64/R32 → 09-22，R16/1/4决赛 → 09-23，半决赛/决赛 → 09-24。

| 日期 | MS | WS |
| --- | --- | --- |
| 2001-09-21（资格赛） | 22 | 30 |
| 2001-09-22（R64/R32） | 31 | 16 |
| 2001-09-23（R16/QF） | 12 | 12 |
| 2001-09-24（SF/F） | 3 | 3 |

## 4. 姓名规范处理

沿用 player-name-format.md：

- 中式（含台/港/新）：`姓 名`（如 `CHIANG Peng-Lung`、`CHANG Yen-Shu`、`WANG Nan`、`LIN Ling`、`ZHAN Jian`）。
- 韩国：`姓 名`（如 `JOO Saehyuk`、`KIM Kyungah`、`KWON Hyunjoo`、`SUK Eunmi`）。
- 日本：`名 姓`（如 `Ryo YUZAWA`、`Miyuki NISHII`、`Ai FUKUHARA`、`Aya UMEMURA`）。
- 特殊处理：`PARK Kyungae (II)` → `PARK Kyungae`（去除 (II) 同名后缀，数据库无同名冲突）。

全部 129 场无缺失名字、无重复导入。

## 5. 协会籍（assoc.json）补充

| 文件 | 本次新增 | 合计 |
| --- | --- | --- |
| `wtt_data/ms/assoc.json` | 14 | 647 |
| `wtt_data/ws/assoc.json` | 17 | 989 |

新增国家映射：无（TPE/HKG/SGP/KOR/JPN/CHN 均已有）。

## 6. 关键场次验证

| 场次 | 结果 |
| --- | --- |
| MS 决赛 | `CHIANG Peng-Lung` 胜 `JOO Saehyuk`（2001-09-24） |
| WS 决赛 | `WANG Nan` 胜 `KIM Kyungah`（2001-09-24） |
| WS 半决赛 | `WANG Nan` 胜 `LIN Ling`（2001-09-24） |

## 7. 相关脚本

- `tools/import_japanopen_2001.py`：Japan Open 导入脚本（复用 Bayreuth NAME_MAP 并扩展）。

---

# 第四部分：US Open Fort Lauderdale

## 1. 赛事信息

| 项 | 值 |
| --- | --- |
| 赛事 | 2001 US Open Fort Lauderdale |
| 时间 | 2001-07-04 ~ 2001-07-08（文件头部仅 07-07，按 tt-wiki 04-08.07.2001 赛程分配） |
| 类别 | MS（男单）、WS（女单） |
| 类型 | `ittf公开赛`（系数 0.42，两项目 event-coefficient.json 均已存在） |
| 数据来源 | 用户提供（Ratings Central 官方结果，含资格赛与正赛） |
| 冠军 | MS: LIU Guozheng (CHN)；WS: NIU Jianfeng (CHN) |
| 赛制 | 21 分制（2001 年 9 月前规则），资格赛三局两胜、正赛五局三胜；不影响 score-log（仅记胜者/负者） |

## 2. 导入文件

| 文件 | 本次新增 | 累计场次 |
| --- | --- | --- |
| `wtt_data/ms/score-log-2001-wtt.json` | 108 场 | 537 场 |
| `wtt_data/ws/score-log-2001-ws.json` | 72 场 | 369 场 |

原始数据保留在 `tools/_usopen2001_raw.txt`。manifest.json 已注册 `score-log-2001-*`，无需改动。

## 3. 日期分配

按赛程分配：Qualification → 07-04，正赛 R64/R32 → 07-05，R16/1/4决赛 → 07-06，半决赛 → 07-07，决赛 → 07-08。

| 日期 | MS | WS |
| --- | --- | --- |
| 2001-07-04（资格赛） | 62 | 27 |
| 2001-07-05（R64/R32） | 31 | 30 |
| 2001-07-06（R16/QF） | 12 | 12 |
| 2001-07-07（SF） | 2 | 2 |
| 2001-07-08（F） | 1 | 1 |

## 4. 姓名规范处理

沿用 player-name-format.md：

- 美洲/欧洲/非洲/南亚球员：`名 姓`（如 `Raman SUBRAMANYAM`、`Julius OMODING`、`Abas EKUN`、`Bruno VENTURA DOS ANJOS`）。
- 华裔代表他国：保留中式 `姓 名`（如 `GAO Jun`(USA)、`WANG Chen`(USA)、`HUANG Johnny`(CAN)、`LI Qiangbing`(AUT)、`YU Fu`(POR)、`NIU Jianfeng`/`WANG Tingting`/`ZHANG Yining`/`JIA Beibei`(CHN)）。
- 中/韩球员：`姓 名`（如 `GUO Keli`、`ZHANG Yining`、`KIM Soongsil`、`SHIN Soohee`）。
- 特殊处理：`PARK Kyungae (II)` → `PARK Kyungae`（同 Japan Open）；`GUO Yan (1982)` → `GUO Yan`（已存在，按 identity 跳过）。

全部 180 场无缺失名字、无重复导入。

## 5. 协会籍（assoc.json）补充

| 文件 | 本次新增 | 合计 |
| --- | --- | --- |
| `wtt_data/ms/assoc.json` | 36 | 683 |
| `wtt_data/ws/assoc.json` | 30 | 1019 |

新增国家映射：`IND/UGA/NGR/VEN/GUA/BAR/POR` 等（印度/乌干达/尼日利亚/委内瑞拉/危地马拉/巴巴多斯/葡萄牙）。

## 6. 关键场次验证

| 场次 | 结果 |
| --- | --- |
| MS 决赛 | `LIU Guozheng` 胜 `HUANG Johnny`（2001-07-08） |
| WS 决赛 | `NIU Jianfeng` 胜 `Aya UMEMURA`（2001-07-08） |

## 7. 相关脚本

- `tools/import_usopen_2001.py`：US Open 导入脚本（复用 Japan Open NAME_MAP 并扩展）。
- `tools/add_assoc_skovde_2001.py`：已扩展为同时支持四站赛事（Skovde + Bayreuth + Japan Open + US Open）。

---

# 第五部分：2002 年 ITTF 十站赛事（MS/WS/MD/WD）

本次将 **2002 年 10 站 ITTF 赛事** 的男单（MS）、女单（WS）、男双（MD）、女双（WD）比赛数据导入 WTT 数据系统：

| 站 | 类型 | 时间 |
| --- | --- | --- |
| Brazilian Open Sao Paulo | `ittf公开赛` | 2002-07-11 ~ 07-14 |
| Danish Open Farum | `ittf公开赛` | 2002-11-21 ~ 11-24 |
| Dutch Open Eindhoven | `ittf公开赛` | 2002-10-23 ~ 10-27 |
| German Open Magdeburg | `ittf公开赛` | 2002-10-17 ~ 10-20 |
| Japan Open Kobe | `ittf公开赛` | 2002-09-12 ~ 09-15 |
| Korean Open Gangneung | `ittf公开赛` | 2002-09-05 ~ 09-08 |
| Men's World Cup Jinan | `世界杯` | 2002-10-31 ~ 11-03 |
| Polish Open Warsaw | `ittf公开赛` | 2002-11-14 ~ 11-17 |
| Pro Tour Grand Finals Stockholm | `总决赛` | 2002-12-12 ~ 12-15 |
| Women's World Cup Singapore | `世界杯` | 2002-08-30 ~ 09-01 |

## 1. 赛事信息

| 项 | 值 |
| --- | --- |
| 类别 | MS（男单）、WS（女单）、MD（男双）、WD（女双） |
| 类型 | `ittf公开赛`（8 站 Pro Tour）、`世界杯`（男子/女子世界杯）、`总决赛`（Pro Tour 总决赛） |
| 系数 | ms/ws：`ittf公开赛` 0.42、`世界杯` 1.62、`总决赛` 1.35（已存在）；md/wd：新增 `ittf公开赛` 0.19、`世界杯` 0.73、`总决赛` 0.61（按 ms→md 约 0.45 比例派生） |
| 数据来源 | 用户提供（Ratings Central 官方结果，含资格赛与正赛） |

## 2. 导入文件

| 类别 | 文件 | 场次 |
| --- | --- | --- |
| MS | `wtt_data/ms/score-log-2002-wtt.json` | 819 |
| WS | `wtt_data/ws/score-log-2002-ws.json` | 647 |
| MD | `wtt_data/md/score-log-2002-wtt.json` | 325 |
| WD | `wtt_data/wd/score-log-2002-wtt.json` | 245 |
| 合计 | | 2036 场 |

已同步注册至四个项目 `manifest.json` 的 scoreFiles 首位。原始数据保留在 `docs/result_ittf_link/2002/`（tab 分隔：Year/Event/PlayerA/PlayerB/PlayerX/PlayerY/Sub-event/Stage/Round/Result/Games/Winner/Winner；双打胜者占两列）。

各站明细（实际解析行数）：

| 站 | MS | WS | MD | WD |
| --- | --- | --- | --- | --- |
| Brazilian Open | 55 | 37 | 20 | 13 |
| Danish Open | 142 | 116 | 53 | 42 |
| Dutch Open | 162 | 128 | 60 | 45 |
| German Open | 63 | 63 | 68 | 51 |
| Japan Open | 102 | 61 | 30 | 21 |
| Korean Open | 114 | 67 | 36 | 22 |
| Men's World Cup | 31 | - | - | - |
| Polish Open | 135 | 128 | 51 | 44 |
| Grand Finals | 15 | 15 | 7 | 7 |
| Women's World Cup | - | 32 | - | - |

> 数据缺失说明（用户已确认无需在意）：German Open 原始文件仅含第 1 页（`Page 1 of 2 Total: 192`），故 MS/WS 少于头部总数；Brazilian MD 一行缺第二位球员、Danish WD 一行缺第二位对手、Polish WD 一行缺胜者列，3 行无法还原胜负双方，已跳过；Brazilian MS 头部 57 vs 55 行、Danish WS 118 vs 116 行、Men's WC 32 vs 31 行，均以实际行数为准。

## 3. 日期分配

按赛程模板分配（无需精确到天）：

- Pro Tour 4 天站：Qualification → 首日，R64/R32 → 次日，R16/1/4决赛 → 第三日，半决赛/决赛 → 末日。
- Dutch Open（5 天）：半决赛 → 第 4 日，决赛 → 第 5 日。
- Grand Finals：R16 → 12-12，1/4决赛 → 12-13，半决赛 → 12-14，决赛 → 12-15。
- Men's World Cup：资格赛 → 10-31，1/4决赛 → 11-01，半决赛 → 11-02，决赛 → 11-03。
- Women's World Cup：资格赛 → 08-30，1/4决赛/半决赛/排名赛 → 08-31，决赛 → 09-01。

## 4. 姓名规范处理

沿用 `wtt_data/player-name-format.md`，由 `tools/import_2002.py` 自动生成标准名（共 521 名球员）：

- 中/港/台/新/韩/朝：`姓 名`（如 `WANG Hao`、`CHUANG Chih-Yuan`、`KIM Kyungah`、`ZHANG Jike`）。
- 日本：`名 姓`（如 `Seiya KISHIKAWA`、`Aya UMEMURA`、`Akira KITO`）。
- 欧美等：`名 姓`，复姓整体移位（如 `Zoltan FEJER-KONNERTH`、`Bruno VENTURA DOS ANJOS`、`Jean-Michel SAIVE`、`Martijn VAN DE LEUR`）。
- 华裔代表他国：保留中式 `姓 名`（如 `CHEN Weixing`(AUT)、`GAO Jun`(USA)、`HOU Yingchao`(CAN)、`DING Yan`/`TAN Wenling`(ITA)、`WANG Jianfeng`(NOR)、`MIAO Miao`(AUS)、`YU Kapo`(NED)、`ZENG Cem`(TUR)）。
- 后缀去除：`GUO Yan (1982)` → `GUO Yan`、`KOSTROMINA Tatyana (1973)` → `Tatyana KOSTROMINA`、`ZHANG Xiaoyu (1986)` → `ZHANG Xiaoyu`、`WANG Yu (YOB=1981)` → `WANG Yu`、`PARK Kyungae (II)` → `PARK Kyungae`。
- 与既有 DB 一致性覆盖：`SCHOPP Jie` 保留原文（DB 既有）；`LANG Kristin` → `Kristin LANG`（LANG 非中文姓）；`NI Xia Lian` → `Xia Lian NI`、`LI Qian` → `Qian LI`（DB 采用欧洲格式）；`LIU Jia` 与 `HOU Yingchao` 采用中式（与 2001 同期 / DB 多数一致）。
- 同名单注意：`KIM Kyungah` 与 `KIM Kyungha` 为两位不同韩国球员，分别保留原名。

全部 2036 场无缺失名字、无胜者不匹配、无重复导入（仅 3 行源数据缺列跳过）。

## 5. 协会籍（assoc.json）补充

| 文件 | 本次新增 | 合计 |
| --- | --- | --- |
| `wtt_data/ms/assoc.json` | 133 | 816 |
| `wtt_data/ws/assoc.json` | 95 | 1114 |

MS 286 名 / WS 227 名球员全部有 assoc 记录（identity 命中率 100%）。新增国家映射：`BUL/CMR/ECU/HON/ISR/MDA/MON/SUD/UKR/UZB` 等（保加利亚/喀麦隆/厄瓜多尔/洪都拉斯/以色列/摩尔多瓦/摩纳哥/苏丹/乌克兰/乌兹别克斯坦）。

## 6. 关键场次验证

| 场次 | 结果 |
| --- | --- |
| 总决赛 MS 决赛 | `CHUANG Chih-Yuan` 胜 `Kalinikos KREANGA`（2002-12-15） |
| 总决赛 WS 决赛 | `ZHANG Yining` 胜 `GUO Yue`（2002-12-15） |
| 总决赛 MD 决赛 | `KONG Linghui/MA Lin` 胜 `Akira KITO/Toshio TASAKI`（2002-12-15） |
| 总决赛 WD 决赛 | `LI Jia/NIU Jianfeng` 胜 `LI Nan/ZHANG Yining`（2002-12-15） |
| 男子世界杯决赛 | `Timo BOLL` 胜 `KONG Linghui`（2002-11-03） |
| 女子世界杯决赛 | `ZHANG Yining` 胜 `LI Nan`（2002-09-01） |
| Dutch Open MS 决赛 | `WANG Hao` 胜 `CHUANG Chih-Yuan`（2002-10-27） |
| Dutch Open WS 决赛 | `NIU Jianfeng` 胜 `LI Jia`（2002-10-27） |
| German Open MS 决赛 | `MA Lin` 胜 `Vladimir SAMSONOV`（2002-10-20） |
| Japan Open MS 决赛 | `Kalinikos KREANGA` 胜 `CHUANG Chih-Yuan`（2002-09-15） |
| Japan Open WS 决赛 | `KIM Kyungah` 胜 `Mihaela STEFF`（2002-09-15） |
| Korean Open MS 决赛 | `Werner SCHLAGER` 胜 `Timo BOLL`（2002-09-08） |
| Polish Open MS 决赛 | `MA Lin` 胜 `Werner SCHLAGER`（2002-11-17） |
| Polish Open WS 决赛 | `ZHANG Yining` 胜 `GUO Yan`（2002-11-17） |
| Danish Open MS 决赛 | `MA Lin` 胜 `Timo BOLL`（2002-11-24） |
| Danish Open WS 决赛 | `ZHANG Yining` 胜 `GUO Yue`（2002-11-24） |
| Brazilian Open MS 决赛 | `Werner SCHLAGER` 胜 `Michael MAZE`（2002-07-14） |
| Brazilian Open WS 决赛 | `Aya UMEMURA` 胜 `SUK Eunmi`（2002-07-14） |

## 7. 相关脚本

- `tools/import_2002.py`：十站导入脚本（自动 NAME_MAP、断行合并、双打双胜者匹配、日期模板、去重追加、manifest 注册）。
- `tools/add_assoc_2002.py`：补充 assoc.json 脚本（复用 import_2002 的 NAME_MAP 与原始国家代码）。

---

# 第六部分：2003 年 ITTF 十三站赛事（MS/WS/MD/WD/XD）

本次将 **2003 年 13 站 ITTF 赛事**（男子单打 MS、女子单打 WS、男子双打 MD、女子双打 WD、混合双打 XD）数据导入 WTT 计分系统。新增两种场景：**世乒赛（含混合双打 XD）** 与 **总决赛/世界杯的双打**。

| 站 | 类型 | 时间 |
| --- | --- | --- |
| Brazilian Open Rio de Janeiro | `ittf公开赛` | 2003-06-26 ~ 06-29 |
| China Open Guangzhou | `ittf公开赛` | 2003-09-11 ~ 09-14 |
| Croatia Open Croatia | `ittf公开赛` | 2003-01-23 ~ 01-26 |
| Danish Open Aarhus | `ittf公开赛` | 2003-11-12 ~ 11-16 |
| German Open Bremen | `ittf公开赛` | 2003-11-06 ~ 11-09 |
| Japan Open Kobe | `ittf公开赛` | 2003-09-18 ~ 09-21 |
| Malaysian Open Johor Bahru | `ittf公开赛` | 2003-10-02 ~ 10-05 |
| Men's World Cup Jiangyin | `世界杯` | 2003-10-09 ~ 10-12 |
| Pro Tour Grand Finals Guangzhou | `总决赛` | 2003-12-11 ~ 12-14 |
| Qatar Open Doha | `ittf公开赛` | 2003-03-03 ~ 03-07 |
| Swedish Open Malmo | `ittf公开赛` | 2003-11-19 ~ 11-23 |
| Women's World Cup Hong Kong | `世界杯` | 2003-12-17 ~ 12-19 |
| World Table Tennis Championships Paris | `世乒赛` | 2003-05-19 ~ 05-25 |

## 1. 基本信息

| 项 | 值 |
| --- | --- |
| 项目 | MS（男单）、WS（女单）、MD（男双）、WD（女双）、XD（混双，仅世乒赛） |
| 类型 | `ittf公开赛`（9 站 Pro Tour）、`世界杯`（男/女世界杯）、`总决赛`（Pro Tour 总决赛）、`世乒赛`（世锦赛） |
| 系数 | 五类 event-coefficient.json 均已含四类类型：ms/ws 的 `世乒赛` 1.83、`世界杯` 1.62、`总决赛` 1.35、`ittf公开赛` 0.42；md/wd/xd 的 `世乒赛` 0.8、`世界杯` 0.58、`总决赛` 0.51、`ittf公开赛` 0.28（均已存在，未改值） |
| 数据来源 | 用户提供（ITTF 官方数据页，Ratings Central 档案格式，与 2001/2002 同源） |

## 2. 数据文件

| 类别 | 文件 | 2003 场次 |
| --- | --- | --- |
| MS | `wtt_data/ms/score-log-2003-wtt.json` | 1721 |
| WS | `wtt_data/ws/score-log-2003-ws.json` | 1110 |
| MD | `wtt_data/md/score-log-2003-wtt.json` | 527 |
| WD | `wtt_data/wd/score-log-2003-wtt.json` | 373 |
| XD | `wtt_data/xd/score-log-2003-wtt.json` | 62 |
| 合计 | | 3793 场 |

五个类别的 `manifest.json` 均已在 scoreFiles 首位注册 `score-log-2003-*`。原始数据位于 `docs/result_ittf_link/2003/`，tab 分隔，列结构同 2002（Year/Event/PlayerA/PlayerB/PlayerX/PlayerY/Sub-event/Stage/Round/Result/Games/Winner/Winner），双打胜者占两列，XD 为新增子项目。

各站详细导入数（按实际数据行计）：

| 站 | MS | WS | MD | WD | XD |
| --- | --- | --- | --- | --- | --- |
| Brazilian Open | 101 | 71 | 29 | 23 | - |
| China Open | 101 | 10 | 35 | 30 | - |
| Croatia Open | 248 | 160 | 83 | 52 | - |
| Danish Open | 215 | 140 | 81 | 53 | - |
| German Open | 251 | 172 | 92 | 65 | - |
| Japan Open | 62 | 60 | 36 | 27 | - |
| Malaysian Open | 61 | 31 | 29 | 16 | - |
| Men's World Cup | 32 | - | - | - | - |
| Grand Finals | 15 | 15 | 7 | 7 | - |
| Qatar Open | 65 | 35 | 23 | 9 | - |
| Swedish Open | 135 | 95 | 53 | 30 | - |
| Women's World Cup | - | 32 | - | - | - |
| WTTC Paris | 435 | 289 | 59 | 61 | 62 |

> 缺失说明（用户已确认数量差无须在意）：China Open WS 源数据仅 R16 起 10 行（截断）；German/Danish WD 各 1-2 行、Qatar MD 2 行缺对手位成员、WTTC MS 6 行缺对手或胜者、WTTC WD 1 行双方重复球员（HERCZIG Judit），均按源数据错误跳过。

## 3. 日期映射

沿用赛程模板（近似日期），新增 `wttc` 模板（7 天）：

- Pro Tour 4 天站：Qualification → 第 1 天，R64/R32 → 第 2 天，R16/1/4 决赛 → 第 3 天，半决赛/决赛 → 第 4 天。
- Pro Tour 5 天站（Danish/Qatar/Swedish）：半决赛 → 第 4 天，决赛 → 第 5 天。
- Grand Finals（4 天）：R16 → 12-11，1/4 决赛 → 12-12，半决赛 → 12-13，决赛 → 12-14。
- Men's World Cup（4 天）：资格赛 → 10-09，1/4 决赛 → 10-10，半决赛 → 10-11，决赛 → 10-12。
- Women's World Cup（3 天）：资格赛 → 12-17，1/4 决赛/半决赛/排位赛 → 12-18，决赛 → 12-19。
- WTTC（7 天）：资格赛 → 05-19，R128 → 05-21，R64 → 05-22，R32 → 05-23，R16/1/4 决赛 → 05-24，半决赛/决赛 → 05-25。

## 4. 姓名规范处理

遵循 `wtt_data/player-name-format.md`，`tools/import_2003.py` 自动生成标准名映射（约 700+ 球员）。

- 中/港/台/新/韩/朝：`姓 名` 保持原文，如 `WANG Hao`、`CHUANG Chih-Yuan`、`KIM Kyungah`、`CHEUNG Yuk`。
- 日本：`名 姓` 交换，如 `Seiya KISHIKAWA`、`Sayaka HIRANO`、`Ryusuke SAKAMOTO`、`Akira KITO`。
- 欧美等：`名 姓`，如 `Werner SCHLAGER`、`Kalinikos KREANGA`、`Michael MAZE`、`Zoltan FEJER-KONNERTH`。
- 华裔代表他国：中姓 + 非华语国家保留 `姓 名`，如 `CHEN Weixing`(AUT)、`GAO Jun`(USA)、`HOU Yingchao`(CAN)、`XU Chris`(CAN)、`LI Qiangbing`(AUT)、`LIU Jia`(AUT)、`TAN Wenling`/`DING Yan`/`WANG Yu`(ITA)、`LI Jiawei`/`JING Junhong`/`CAI Xiaoli`(SGP)、`NI Xia Lian`(LUX)。
- 后缀清理：`GUO Yan (1982)` → `GUO Yan`、`WANG Yu (YOB=1981)` → `WANG Yu`、`KOSTROMINA Tatyana (1973)` → `Tatyana KOSTROMINA`。
- 特例覆盖：`FORT Carlos I` → `Carlos FORT`（I 为名一部分）；与既有 DB 一致覆盖 `SCHOPP Jie`、`LANG Kristin`、`NI Xia Lian`、`LI Qian`。
- 同名单注意：`MULLER Frank`(LIE) 与 `MUELLER Frank`(FRA) 为两位不同球员，分别保留；`KIM Kyungah` 与 `KIM Kyungha` 为两位不同韩国球员。

全部 3793 场无缺失名字、无胜者不匹配、无重复导入、无双打胜者=负者（仅源数据缺列/重复球员的 12 行跳过）。

## 5. 协会籍（assoc.json）补充

| 文件 | 本次新增 | 合计 |
| --- | --- | --- |
| `wtt_data/ms/assoc.json` | 314 | 1130 |
| `wtt_data/ws/assoc.json` | 179 | 1293 |

MS 596 名 / WS 397 名 2003 球员全部有 assoc 记录（identity 命中率 100%）。新增国家映射：`ALB/ALG/ARM/ARU/BDI/BEN/CAM/CGO/CIV/COD/CRC/CYP/DOM/EST/FIJ/GAB/GHA/GUI/GUY/INA/IRL/ISL/JAM/KAZ/KSA/KUW/LAT/LBN/LCA/MAC/MAD/MAR/MAS/MDV/MEX/MGL/MKD/MLT/MRI/PER/PUR/PYF/QAT/RSA/SCO/SEN/SEY/SMR/SOM/SRI/THA/TKM/TOG/TTO/TUN/VIE/YEM` 等（阿尔巴尼亚/阿尔及利亚/亚美尼亚/阿鲁巴/布隆迪/贝宁/柬埔寨/刚果（布）/科特迪瓦/刚果（金）/哥斯达黎加/塞浦路斯/多米尼加/爱沙尼亚/斐济/加蓬/加纳/几内亚/圭亚那/印尼/爱尔兰/冰岛/牙买加/哈萨克斯坦/沙特/科威特/拉脱维亚/黎巴嫩/圣卢西亚/澳门/马达加斯加/摩洛哥/马来西亚/马尔代夫/墨西哥/蒙古/北马其顿/马耳他/毛里求斯/秘鲁/波多黎各/法属波利尼西亚/卡塔尔/南非/苏格兰/塞内加尔/塞舌尔/圣马力诺/索马里/斯里兰卡/泰国/土库曼斯坦/多哥/特立尼达和多巴哥/突尼斯/越南/也门）。

## 6. 关键场次验证

| 场次 | 结果 |
| --- | --- |
| 世乒赛 MS 决赛 | `Werner SCHLAGER` 胜 `JOO Saehyuk`（2003-05-25） |
| 世乒赛 WS 决赛 | `WANG Nan` 胜 `ZHANG Yining`（2003-05-25） |
| 世乒赛 MD 决赛 | `WANG Liqin/YAN Sen` 胜 `WANG Hao/KONG Linghui`（2003-05-25） |
| 世乒赛 WD 决赛 | `WANG Nan/ZHANG Yining` 胜 `NIU Jianfeng/GUO Yue`（2003-05-25） |
| 世乒赛 XD 决赛 | `MA Lin/WANG Nan` 胜 `LIU Guozheng/BAI Yang`（2003-05-25） |
| 男子世界杯决赛 | `MA Lin` 胜 `Kalinikos KREANGA`（2003-10-12） |
| 女子世界杯决赛 | `WANG Nan` 胜 `NIU Jianfeng`（2003-12-19） |
| 总决赛 MS 决赛 | `WANG Hao` 胜 `HAO Shuai`（2003-12-14） |
| 总决赛 WS 决赛 | `NIU Jianfeng` 胜 `ZHANG Yining`（2003-12-14） |
| 总决赛 MD 决赛 | `CHEN Qi/MA Lin` 胜 `CHEUNG Yuk/LEUNG Chu Yan`（2003-12-14） |
| 总决赛 WD 决赛 | `GUO Yue/NIU Jianfeng` 胜 `WANG Nan/ZHANG Yining`（2003-12-14） |
| Chinese Open MS 决赛 | `MA Lin` 胜 `WANG Hao`（2003-09-14） |
| Brazilian Open MS 决赛 | `CHUANG Chih-Yuan` 胜 `Jens LUNDQVIST`（2003-06-29） |

## 7. 相关脚本

- `tools/import_2003.py`：十三站导入脚本（自动 NAME_MAP、断行合并、双打双胜者匹配、单胜者归属推断、重复球员检测、日期模板含 wttc、去重追加、manifest 注册，含 XD 子项目）。
- `tools/add_assoc_2003.py`：补充 assoc.json 脚本（复用 import_2003 的 NAME_MAP 与原始国家代码，扩充 COUNTRY_MAP 至 100+ 国家/地区）。

# 第七部分：2004 年 ITTF 赛事（MS/WS/MD/WD）

本次将 **2004 年 19 站 ITTF 赛事**（男子单打 MS、女子单打 WS、男子双打 MD、女子双打 WD）数据导入 WTT 计分系统。新增四种场景：**世乒赛团体**（团体世锦赛，MT/WT 按单打导入）、**奥运会**、**世界杯**（男女合办一站）、**总决赛**（3 天）。

| 站 | 类型 | 时间 |
| --- | --- | --- |
| Brazilian Open Rio de Janeiro | `ittf公开赛` | 2004-06-24 ~ 06-27 |
| Chile Open Santiago | `ittf公开赛` | 2004-06-16 ~ 06-20 |
| China Open Wuxi | `ittf公开赛` | 2004-09-09 ~ 09-12 |
| Croatia Open Croatia | `ittf公开赛` | 2004-01-22 ~ 01-25 |
| Danish Open Aarhus | `ittf公开赛` | 2004-10-21 ~ 10-24 |
| Egypt Open Cairo | `ittf公开赛` | 2004-05-04 ~ 05-07 |
| German Open Leipzig | `ittf公开赛` | 2004-11-11 ~ 11-14 |
| Greece Open Athens | `ittf公开赛` | 2004-01-29 ~ 02-01 |
| Japan Open Kobe | `ittf公开赛` | 2004-09-23 ~ 09-26 |
| Korean Open Pyeong Chang | `ittf公开赛` | 2004-05-20 ~ 05-23 |
| Polish Open Warsaw | `ittf公开赛` | 2004-10-14 ~ 10-17 |
| Singapore Open | `ittf公开赛` | 2004-05-27 ~ 05-30 |
| St. Petersburg Open | `ittf公开赛` | 2004-11-25 ~ 11-28 |
| US Open Chicago | `ittf公开赛` | 2004-06-30 ~ 07-03 |
| Volkswagen China Open Changchun | `ittf公开赛` | 2004-09-16 ~ 09-19 |
| Pro Tour Grand Finals Beijing | `总决赛` | 2004-12-10 ~ 12-12 |
| Men's and Women's World Cup Hangzhou | `世界杯` | 2004-10-27 ~ 10-31 |
| Olympic Games Athens | `奥运会` | 2004-08-14 ~ 08-23 |
| World Team Table Tennis Championships Doha | `世乒赛团体` | 2004-03-01 ~ 03-07 |

## 1. 基本信息

| 项 | 值 |
| --- | --- |
| 项目 | MS（男单）、WS（女单）、MD（男双）、WD（女双）。世乒赛团体子项目 MT（男团）/WT（女团）按单打导入为 MS/WS |
| 类型 | `ittf公开赛`（15 站 Pro Tour）、`总决赛`（Pro Tour 总决赛）、`世界杯`（男女合办）、`奥运会`、`世乒赛团体` |
| 系数 | 四类 event-coefficient.json 均已含所涉类型：ms/ws 的 `世乒赛团体` 1.21、`奥运会` 2.25、`世界杯` 1.62、`总决赛` 1.35、`ittf公开赛` 0.42；md/wd 的 `奥运会` 1.0、`世界杯` 0.58、`总决赛` 0.51、`ittf公开赛` 0.28（均已存在，未改值；世乒赛团体仅涉及单打，md/wd 无需） |
| 数据来源 | 用户提供（ITTF 官方数据页，Ratings Central 档案格式，与 2001/2002/2003 同源） |

## 2. 数据文件

| 类别 | 文件 | 2004 场次 |
| --- | --- | --- |
| MS | `wtt_data/ms/score-log-2004-wtt.json` | 2099 |
| WS | `wtt_data/ws/score-log-2004-ws.json` | 1663 |
| MD | `wtt_data/md/score-log-2004-wtt.json` | 714 |
| WD | `wtt_data/wd/score-log-2004-wtt.json` | 477 |
| 合计 | | 4953 场 |

四个类别的 `manifest.json` 均已在 scoreFiles 首位注册 `score-log-2004-*`。原始数据位于 `docs/result_ittf_link/2004/`，tab 分隔，列结构同 2003（Year/Event/PlayerA/PlayerB/PlayerX/PlayerY/Sub-event/Stage/Round/Result/Games/Winner/Winner）。Pro Tour 公开赛文件首部含一行中文元数据头（赛事编号/年份/名称/类型/参赛人数/起止日期），世界杯/奥运会/世乒赛团体为单行头，解析时按数据行过滤即可。

各站导入数：

| 站 | MS | WS | MD | WD |
| --- | --- | --- | --- | --- |
| Brazilian Open | 60 | 31 | 33 | 25 |
| Chile Open | 100 | 45 | 37 | 15 |
| China Open Wuxi | 66 | 31 | 19 | 17 |
| Croatia Open | 131 | 128 | 80 | 49 |
| Danish Open | 63 | 29 | 53 | 29 |
| Egypt Open | 63 | 30 | 44 | 23 |
| German Open | 217 | 135 | 82 | 50 |
| Greece Open | 62 | 62 | 59 | 43 |
| Japan Open | 63 | 31 | 35 | 26 |
| Korean Open | 31 | 31 | 28 | 20 |
| Polish Open | 63 | 63 | 67 | 42 |
| Singapore Open | 141 | 114 | 52 | 39 |
| St. Petersburg Open | 105 | 54 | 31 | 18 |
| US Open | 59 | 29 | 37 | 22 |
| China Open Changchun | 31 | 60 | 19 | 18 |
| Grand Finals | 15 | 15 | 7 | 7 |
| World Cup | 27 | 30 | - | - |
| Olympic Games | 63 | 63 | 31 | 34 |
| WTTC Doha（团队） | 739 | 682 | - | - |

> 缺失说明（用户已确认数量差无须在意）：世界杯 2004 MS/WS 源数据止于半决赛（决赛行缺失，截断）；埃及 MD 4 行/WD 3 行、圣彼得堡 MD 2 行/WD 1 行、US Open MD/WD 各 1 行、巴西 MD 1 行、无锡 WD 1 行、莱比锡 WD 1 行、雅典 WD 1 行、奥运 MD 1 行缺球员或搭档，按源数据错误跳过；世乒赛团体 WT 5 行（与既有记录同日同对完全相同）去重。

## 3. 日期映射

沿用赛程模板（近似日期），新增 4 个模板：

- Pro Tour 4 天站：Qualification → 第 1 天，R64/R32 → 第 2 天，R16/1/4 决赛 → 第 3 天，半决赛/决赛 → 第 4 天。
- Pro Tour 5 天站（Chile）：半决赛 → 第 4 天，决赛 → 第 5 天。
- Grand Finals（3 天）：R16 → 12-10，1/4 决赛 → 12-11，半决赛/决赛 → 12-12。
- World Cup（5 天）：资格赛 → 10-27，1/4 决赛 → 10-29，半决赛 → 10-30，决赛 → 10-31。
- Olympic Games（10 天）：R128 → 08-14，R64 → 08-15，R32 → 08-16，R16 → 08-17，1/4 决赛 → 08-18，半决赛 → 08-19；决赛按项目区分：WD → 08-20、MD → 08-21、WS → 08-22、MS → 08-23。
- 世乒赛团体（7 天）：资格赛 → 03-01，Main Draw → 03-07。

## 4. 姓名规范处理

遵循 `wtt_data/player-name-format.md`，`tools/import_2004.py` 自动生成标准名映射（600+ 球员）。

- 中/港/台/新/韩/朝：`姓 名` 保持原文，如 `WANG Hao`、`CHUANG Chih-Yuan`、`KIM Kyungah`、`BEH Lee Wei`、`NG Sock Khim`。
- 日本：`名 姓` 交换，如 `Jun MIZUTANI`、`Reiko HIURA`、`Sayaka HIRANO`。
- 欧美等：`名 姓`，如 `Werner SCHLAGER`、`Dimitrij OVTCHAROV`、`Emmanuel LEBESSON`、`Elizabeta SAMARA`。
- 华裔代表他国：中姓 + 非华语国家保留 `姓 名`，如 `CHEN Weixing`(AUT)、`GAO Jun`/`WANG Chen`(USA)、`XU Chris`(CAN)、`SHEN Yanfei`/`ZHU Fang`(ESP)、`TAN Wenling`/`DING Yan`/`WANG Yu`(ITA)、`LI Qiangbing`(AUT)、`LIU Jia`(AUT)、`LI Jiao`(NED)、`LI Yun Fei`(BEL)、`XU Jie`(POL)。
- 后缀清理：`GUO Yan (1982)` → `GUO Yan`、`XU Jie (1982)` → `XU Jie`、`KIM Minhee (YOB=1985)` → `KIM Minhee`、`WANG Yu (YOB=1981)` → `WANG Yu`、`KOSTROMINA Tatyana (1973)` → `Tatyana KOSTROMINA`。
- 同名单注意：`PARK Kyungae (I)` 与 `PARK Kyungae (II)` 为两位不同球员，保留后缀区分（II 按 2001/2002 惯例归并）；`MULLER Frank`(LIE) 与 `MUELLER Frank`(FRA) 为两位不同球员；`KIM Kyungah` 与 `KIM Kyungha` 为两位不同韩国球员；`LOGATSKAYA Olga`(BLR) 与 `LOGATZKAYA Tatyana`(BLR) 为两位不同球员。

全部 4953 场无缺失名字、无胜者不匹配、无重复导入、无双打胜者=负者（仅源数据缺列的 16 行 + 奥运 1 行 + 团队重复 5 行跳过）。

## 5. 协会籍（assoc.json）补充

| 文件 | 本次新增 | 合计 |
| --- | --- | --- |
| `wtt_data/ms/assoc.json` | 256 | 1386 |
| `wtt_data/ws/assoc.json` | 150 | 1443 |

MS 616 名 / WS 420 名 2004 球员全部有 assoc 记录（identity 命中率 100%）。新增国家映射：`AZE/BRN/COL/FIN/HON/KEN/KOS/LBA/NEP/PAK/TJK/UAE/URU` 等（阿塞拜疆/巴林/哥伦比亚/芬兰/洪都拉斯/肯尼亚/科索沃/利比亚/尼泊尔/巴基斯坦/塔吉克斯坦/阿联酋/乌拉圭）。MD/WD 双打球员如从未进入 MS/WS 则不入 assoc（与 2002/2003 惯例一致）。

## 6. 关键场次验证

| 场次 | 结果 |
| --- | --- |
| 奥运会 MS 决赛 | `RYU Seungmin` 胜 `WANG Hao`（2004-08-23） |
| 奥运会 WS 决赛 | `ZHANG Yining` 胜 `KIM Hyang Mi`（2004-08-22） |
| 奥运会 MD 决赛 | `CHEN Qi/MA Lin` 胜 `KO Lai Chak/LI Ching`（2004-08-21） |
| 奥运会 WD 决赛 | `WANG Nan/ZHANG Yining` 胜 `LEE Eunsil/SUK Eunmi`（2004-08-20） |
| 总决赛 MS 决赛 | `WANG Liqin` 胜 `MA Lin`（2004-12-12） |
| 总决赛 WS 决赛 | `GUO Yue` 胜 `NIU Jianfeng`（2004-12-12） |
| 世乒赛团体（团队决赛日） | MS 组 `WANG Liqin`、`MA Lin`、`WANG Hao` 等对阵德国队（2004-03-07） |
| 世界杯 MS 半决赛 | `MA Lin` 胜 `WANG Hao`（2004-10-30，源数据决赛缺失） |
| 世界杯 WS 半决赛 | `ZHANG Yining` 胜 `TIE Yana`、`WANG Nan` 胜 `LI Jiawei`（2004-10-30，源数据决赛缺失） |

## 7. 相关脚本

- `tools/import_2004.py`：十九站导入脚本（复用 2003 逻辑，新增 `olympic`/`wcup`/`wttct`/`grandfinals3` 模板、MT/WT→MS/WS 映射、奥运会决赛分项目日期）。
- `tools/add_assoc_2004.py`：补充 assoc.json 脚本（复用 import_2004 的 NAME_MAP 与原始国家代码，扩充 COUNTRY_MAP 至 110+ 国家/地区，MT/WT 亦纳入单打提取）。

# 第八部分：2005 年 ITTF 赛事（MS/WS/MD/WD/XD）

本次导入 **2005 年 18 站 ITTF 赛事**，覆盖男子单打 MS、女子单打 WS、男子双打 MD、女子双打 WD、混合双打 XD（仅世乒赛），数据写入 WTT 计分系统。赛事类型含 **世乒赛**（个人锦标赛，含 XD）、**世界杯**（男/女分站）、**总决赛**、**ittf公开赛**（Pro Tour）。

| 站 | 类型 | 时间 |
| --- | --- | --- |
| Brazilian Open Rio de Janeiro | `ittf公开赛` | 2005-06-23 ~ 06-26 |
| Chile Open Santiago | `ittf公开赛` | 2005-06-29 ~ 07-03 |
| Chinese Taipei Open Taipei | `ittf公开赛` | 2005-06-16 ~ 06-19 |
| Croatia Open Zagreb | `ittf公开赛` | 2005-01-19 ~ 01-23 |
| German Open Magdeburg | `ittf公开赛` | 2005-11-09 ~ 11-13 |
| Japan Open Yokohama | `ittf公开赛` | 2005-09-22 ~ 09-25 |
| Korean Open Suncheon | `ittf公开赛` | 2005-06-09 ~ 06-12 |
| Panasonic China Open Harbin | `ittf公开赛` | 2005-09-08 ~ 09-11 |
| Qatar Open Doha | `ittf公开赛` | 2005-02-21 ~ 02-25 |
| SLOVENIA Open Velenje | `ittf公开赛` | 2005-01-12 ~ 01-15 |
| St. Petersburg Open | `ittf公开赛` | 2005-11-03 ~ 11-06 |
| Swedish Open Gothenburg | `ittf公开赛` | 2005-11-17 ~ 11-20 |
| US Open Fort Lauderdale | `ittf公开赛` | 2005-07-07 ~ 07-10 |
| Volkswagen China Open Shenzhen | `ittf公开赛` | 2005-09-15 ~ 09-18 |
| Pro Tour Grand Finals Fuzhou | `总决赛` | 2005-12-09 ~ 12-11 |
| Men's World Cup Liege | `世界杯` | 2005-10-21 ~ 10-23 |
| Women's World Cup Guangzhou | `世界杯` | 2005-12-13 ~ 12-15 |
| World Table Tennis Championships Shanghai | `世乒赛` | 2005-04-30 ~ 05-06 |

## 1. 基本信息

| 项 | 值 |
| --- | --- |
| 项目 | MS（男子单打）、WS（女子单打）、MD（男子双打）、WD（女子双打）、XD（混合双打） |
| 类型 | `ittf公开赛`（14 站 Pro Tour）、`总决赛`（Pro Tour 总决赛）、`世界杯`（男/女分站）、`世乒赛`（个人锦标赛） |
| 系数 | 复用 event-coefficient.json 已有全部类型：ms/ws 为 `世乒赛` 1.83、`世界杯` 1.62、`总决赛` 1.35、`ittf公开赛` 0.42；md/wd/xd 为 `世乒赛` 0.8、`世界杯` 0.58、`总决赛` 0.51、`ittf公开赛` 0.28（均已存在，未改值）。 |
| 数据来源 | 用户提供（ITTF 官方网页/赛事记录，Ratings Central 同源格式，2001~2004 同源）。 |

## 2. 数据文件

| 分类 | 文件 | 2005 记录 |
| --- | --- | --- |
| MS | `wtt_data/ms/score-log-2005-wtt.json` | 1693 |
| WS | `wtt_data/ws/score-log-2005-ws.json` | 1390 |
| MD | `wtt_data/md/score-log-2005-wtt.json` | 752 |
| WD | `wtt_data/wd/score-log-2005-wtt.json` | 559 |
| XD | `wtt_data/xd/score-log-2005-wtt.json` | 135 |
| 合计 | | 4529 条 |

五个分类的 `manifest.json` 已将 `score-log-2005-*` 注册到 scoreFiles 首位。原始数据位于 `docs/result_ittf_link/2005/`，tab 分隔行结构同 2004；Pro Tour 文件带中文元数据块（赛事编号/名称/类型/参赛人数/起止日期），世界杯/总决赛/世乒赛为表头直入（世乒赛无元数据块，起止日期 04-30 ~ 05-06 按实际赛事推算）。

分站明细（按原始文件实际可解析行数）：

| 站 | MS | WS | MD | WD | XD |
| --- | --- | --- | --- | --- | --- |
| Brazilian Open | - | 53 | 33 | 17 | - |
| Chile Open | 157 | 77 | 61 | 30 | - |
| Chinese Taipei Open | 79 | 71 | 29 | 27 | - |
| Croatia Open | 262 | 161 | 92 | 62 | - |
| German Open | 192 | 71 | 9 | 67 | - |
| Japan Open | 44 | 79 | 39 | 33 | - |
| Korean Open | 69 | 59 | 25 | 20 | - |
| Men's World Cup | 32 | - | - | - | - |
| Panasonic Harbin | 55 | 78 | 19 | 23 | - |
| Grand Finals | 15 | 15 | 7 | 7 | - |
| Qatar Open | 120 | 68 | 36 | 24 | - |
| SLOVENIA Open | 166 | 116 | 62 | 39 | - |
| St. Petersburg Open | 62 | 105 | 61 | 33 | - |
| Swedish Open | 114 | 126 | 83 | 47 | - |
| US Open | 100 | 82 | 43 | 28 | - |
| China Open Shenzhen | 100 | 73 | 37 | 27 | - |
| Women's World Cup | - | 32 | - | - | - |
| WTTC Shanghai | 126 | 124 | 116 | 75 | 135 |

> 缺失说明（用户确认数量差可忽略）：Brazilian Open 源文件无 MS 主赛事数据（仅 U21MS）；German Open MD 源文件仅含部分行（页头 Total: 110，实际数据 10 行，其中 1 行缺搭档跳行）；WTTC Shanghai 各单项源文件亦为部分页数据（MS 页头 Total: 465，实际数据 126 行）；Chinese Taipei Open WS 1 行对手/胜者全空（轮空行），跳过；WTTC 各单项资格赛部分行缺搭档或胜者，跳过。

## 3. 日期映射

沿用既有模板（附起止日期），新增 `wc3`（世界杯 3 天）：

- Pro Tour 4 天站：Qualification → 第 1 天，R64/R32 → 第 2 天，R16/1/4 决赛 → 第 3 天，半决赛/决赛 → 第 4 天。
- Pro Tour 5 天站（Chile/Croatia/German/Qatar）：半决赛 → 第 4 天，决赛 → 第 5 天。
- Grand Finals（3 天）：R16 → 12-09，1/4 决赛 → 12-10，半决赛/决赛 → 12-11。
- Men's World Cup（3 天）：资格赛 → 10-21，1/4 决赛 → 10-22，半决赛/决赛/排位赛 → 10-23。
- Women's World Cup（3 天）：资格赛 → 12-13，1/4 决赛 → 12-14，半决赛/决赛/排位赛 → 12-15。
- WTTC（7 天）：资格赛 → 04-30，R128 → 05-02，R64 → 05-03，R32 → 05-04，R16/1/4 决赛 → 05-05，半决赛/决赛 → 05-06。

## 4. 姓名规范化说明

遵循 `wtt_data/player-name-format.md`，`tools/import_2005.py` 自动生成标准名映射（约 700+ 球员）。

- 中/港/台/新/韩/朝：`姓 名` 保持原文，如 `WANG Liqin`、`CHUANG Chih-Yuan`、`KIM Kyungah`、`LI Jiawei`。
- 日本：`名 姓` 交换，如 `Jun MIZUTANI`、`Timo BOLL`（欧美同理）、`Yuki MORITA`（源数据含 YOB 后缀剥离）。
- 华裔代表他国（中文姓 + 非华语国家）：保持 `姓 名`，如 `CHEN Weixing`(AUT)、`GAO Jun`/`SHEN Yanfei`(USA/ESP)、`LI Qiangbing`(AUT)、`LIU Jia`(AUT)、`TAN Wenling`/`WANG Yu`(ITA)、`CAI Xiaoli`/`LI Jiawei`(SGP)、`NI Xia Lian`(LUX)。
- 后缀剥离：`GUO Yan (1982)` → `GUO Yan`、`WANG Yu (YOB=1981)` → `WANG Yu`、`KOSTROMINA Tatyana (1973)` → `Tatyana KOSTROMINA`、`KIM Minhee (YOB=1985)` → `KIM Minhee`、`NAM Hyejin (1985)` → `NAM Hyejin`、`MORITA Yuki (YOB=1984)` → `Yuki MORITA`。
- 姓名特例：`XU Jie (1979)`（WAL）与 `XU Jie (1982)`（POL）为**两位不同球员**——前者保留 `(1979)` 后缀区分，后者并入既有 DB 的 `XU Jie`（POL，2004 已录入）；`PARK Kyungae (II)` 并入既有 DB 的 `PARK Kyungae`。
- 同名异人注意：`XU Jie (1979)`(WAL) ≠ `XU Jie`(POL)；`LAY Jian Fang`(AUS) 按 2003 惯例为 `Fang LAY Jian`；`LIN Ling`(CHN)、`LIN Ju`(DOM) 为两位不同球员，按原始拼写区分。

全部 4529 条无缺失名字、无胜者不匹配、无重复录入、无双打胜者=负者（源数据缺行/重复球员 12 处已按规则处理）。

## 5. 协会籍补充（assoc.json）

| 文件 | 本次新增 | 合计 |
| --- | --- | --- |
| `wtt_data/ms/assoc.json` | 181 | 1567 |
| `wtt_data/ws/assoc.json` | 115 | 1558 |

MS 547 名 / WS 412 名 2005 球员全部有 assoc 记录（identity 命中率 100%）。新增国家映射：`KGZ/PAR`（吉尔吉斯斯坦/巴拉圭）。MD/WD/XD 双打球员如从未进入 MS/WS 则不入 assoc（与 2002~2004 惯例一致）。

## 6. 关键场次验证

| 场次 | 结果 |
| --- | --- |
| 世乒赛 MS 决赛 | `WANG Liqin` 胜 `MA Lin`（2005-05-06） |
| 世乒赛 WS 决赛 | `ZHANG Yining` 胜 `GUO Yan`（2005-05-06） |
| 世乒赛 MD 决赛 | `KONG Linghui/WANG Hao` 胜 `Christian SUSS/Timo BOLL`（2005-05-06） |
| 世乒赛 WD 决赛 | `WANG Nan/ZHANG Yining` 胜 `GUO Yue/NIU Jianfeng`（2005-05-06） |
| 世乒赛 XD 决赛 | `WANG Liqin/GUO Yue` 胜 `LIU Guozheng/BAI Yang`（2005-05-06） |
| 男子世界杯决赛 | `Timo BOLL` 胜 `WANG Hao`（2005-10-23） |
| 女子世界杯决赛 | `ZHANG Yining` 胜 `GUO Yan`（2005-12-15） |
| 总决赛 MS 决赛 | `Timo BOLL` 胜 `Jean-Michel SAIVE`（2005-12-11） |
| 总决赛 WS 决赛 | `ZHANG Yining` 胜 `LI Jiawei`（2005-12-11） |
| 总决赛 MD 决赛 | `Christian SUSS/Timo BOLL` 胜 `LEE Jungwoo/OH Sangeun`（2005-12-11） |
| 总决赛 WD 决赛 | `GAO Jun/SHEN Yanfei` 胜 `KIM Bokrae/KIM Kyungah`（2005-12-11） |
| German Open MS 决赛 | `Vladimir SAMSONOV` 胜 `MA Long`（2005-11-13） |

## 7. 相关脚本

- `tools/import_2005.py`：十八站导入脚本（复用 2003/2004 逻辑，新增 `wc3` 模板、XD 保留原始顺序（男前）、`XU Jie (1979)` 特例保留后缀、双打单胜者归属、重复球员检测、去重追加、manifest 注册）。
- `tools/add_assoc_2005.py`：补充 assoc.json 脚本（复用 import_2005 的 NAME_MAP 与原始国家代码，扩充 COUNTRY_MAP 至 120+ 国家/地区）。

# 第九部分：2013 年 ITTF 赛事（MS/WS/MD/WD/XD）

本次导入 **2013 年 17 站 ITTF 赛事**，覆盖男子单打 MS、女子单打 WS、男子双打 MD、女子双打 WD、混合双打 XD（仅世乒赛），数据写入 WTT 计分系统。与 2001~2005 不同，本年度首次引入 **U21 单打并入 MS/WS** 与 **团队世界杯双打并入 MD/WD** 两条新规则。赛事类型含 **世乒赛**（个人锦标赛，含 XD）、**世界杯**（男/女分站）、**总决赛**（Pro Tour Grand Finals）、**世界杯团体**（Team World Cup）、**ittf白金赛/ittf常规赛/ittf公开赛**（Pro Tour 分站）。

| 站 | 类型 | 时间 |
| --- | --- | --- |
| World Tour Austrian Open Wels | `ittf常规赛` | 2013-01-23 ~ 01-27 |
| World Tour Kuwait Open Kuwait City | `ittf白金赛` | 2013-02-14 ~ 02-18 |
| World Tour Qatar Open Doha | `ittf白金赛` | 2013-02-20 ~ 02-24 |
| Team World Cup Guangzhou | `世界杯团体` | 2013-03-28 ~ 03-31 |
| World Tour Korea Open Incheon | `ittf常规赛` | 2013-04-03 ~ 04-07 |
| World Table Tennis Championships Paris | `世乒赛` | 2013-05-13 ~ 05-20 |
| World Tour China Open Changchun | `ittf白金赛` | 2013-06-12 ~ 06-16 |
| World Tour Japan Open Yokohama | `ittf白金赛` | 2013-06-19 ~ 06-23 |
| World Tour Harmony China Open Suzhou | `ittf公开赛` | 2013-08-14 ~ 08-18 |
| World Tour Czeck Open Olomouc | `ittf常规赛` | 2013-08-21 ~ 08-25 |
| World Tour Polish Open Spala | `ittf常规赛` | 2013-11-06 ~ 11-10 |
| World Tour German Open Bremen | `ittf白金赛` | 2013-11-13 ~ 11-17 |
| World Tour Russian Open Ekaterinburg | `ittf常规赛` | 2013-11-20 ~ 11-24 |
| World Tour Swedish Open Stockholm | `ittf常规赛` | 2013-11-27 ~ 12-01 |
| Women's World Cup Kobe | `世界杯` | 2013-09-21 ~ 09-23 |
| Men's World Cup Verviers | `世界杯` | 2013-10-25 ~ 10-27 |
| World Tour Grand Finals Dubai 2013 | `总决赛` | 2014-01-09 ~ 01-12 |

## 1. 基本信息

| 项 | 值 |
| --- | --- |
| 项目 | MS（男子单打，含 U21MS）、WS（女子单打，含 U21WS）、MD（男子双打，含 MT 团队双打）、WD（女子双打，含 WT 团队双打）、XD（混合双打，仅世乒赛） |
| 类型 | `ittf白金赛`（5 站 Super Series）、`ittf常规赛`（6 站 Major Series）、`ittf公开赛`（Harmony Suzhou 1 站）、`总决赛`、`世界杯`、`世界杯团体`、`世乒赛` |
| 系数 | 复用 event-coefficient.json 已有全部类型（本年度白金/常规赛系数亦已存在，未改值）：ms/ws 为 `世乒赛` 1.83、`世界杯` 1.62、`总决赛` 1.35、`世界杯团体` 1.05、`ittf白金赛` 1.15、`ittf常规赛` 0.48、`ittf公开赛` 0.42；md/wd/xd 为 `世乒赛` 0.8、`世界杯` 0.58、`总决赛` 0.51、`世界杯团体` 0.36、`ittf白金赛` 0.42、`ittf常规赛` 0.25、`ittf公开赛` 0.28。 |
| 数据来源 | 用户提供（ITTF 官方网页/赛事记录，Ratings Central 同源格式，2001~2013 同源）。 |

## 2. 数据文件

| 分类 | 文件 | 2013 记录 |
| --- | --- | --- |
| MS | `wtt_data/ms/score-log-2013-wtt.json` | 1378 |
| WS | `wtt_data/ws/score-log-2013-ws.json` | 1185 |
| MD | `wtt_data/md/score-log-2013-wtt.json` | 667 |
| WD | `wtt_data/wd/score-log-2013-wtt.json` | 498 |
| XD | `wtt_data/xd/score-log-2013-wtt.json` | 226 |
| 合计 | | 3954 条 |

五个分类的 `manifest.json` 已将 `score-log-2013-*` 注册到 scoreFiles 首位。原始数据位于 `docs/result_ittf_link/2013/`，tab 分隔行结构同 2005（Pro Tour 文件带中文元数据块；世界杯/总决赛/世乒赛/团体世界杯为表头直入）。2013 文件经扫描无断行续行问题，无需行拼接。

分站明细（按原始文件实际可解析行数）：

| 站 | MS | WS | MD | WD | XD |
| --- | --- | --- | --- | --- | --- |
| Austrian Open Wels | 63 | 62 | 56 | 42 | - |
| Kuwait Open | 63 | 31 | 38 | 23 | - |
| Qatar Open | 118 | 69 | 43 | 31 | - |
| Team World Cup | 52 | 49 | 19 | 19 | - |
| Korea Open Incheon | 100 | 63 | 24 | 25 | - |
| WTTC Paris | 127 | 127 | 171 | 124 | 226 |
| China Open Changchun | 98 | 46 | 20 | 18 | - |
| Japan Open Yokohama | 79 | 122 | 27 | 22 | - |
| Harmony Suzhou | 123 | 152 | 19 | 19 | - |
| Czeck Open Olomouc | 93 | 94 | 55 | 39 | - |
| Polish Open Spala | 82 | 63 | 60 | 42 | - |
| German Open Bremen | 63 | 63 | 69 | 46 | - |
| Russian Open Ekaterinburg | 31 | 31 | 12 | 12 | - |
| Swedish Open Stockholm | 223 | 150 | 47 | 29 | - |
| Women's World Cup | - | 32 | - | - | - |
| Men's World Cup | 32 | - | - | - | - |
| Grand Finals Dubai | 31 | 31 | 7 | 7 | - |

> 缺失说明（用户确认数量差可忽略）：WTTC Paris 各单项为部分页数据（含资格赛缺员/缺搭档行，跳过）；Austrian WS/WD 的 R16 各缺 1 行（源数据截断）；Grand Finals Dubai MD/WD 仅 QF/SF/F 三轮；Russian Open MS/WS 等站源数据本身行数较少。

## 3. 日期映射

沿用既有模板（附起止日期），新增 `grandfinals4`（总决赛 4 天）、`teamwc4`（团体世界杯 4 天）、`wttc8`（世乒赛 8 天）：

- Pro Tour 5 天站（`pro5`，全部 12 站）：资格赛 → 第 1 天，R64/R32 → 第 2 天，R16/1/4 决赛 → 第 3 天，半决赛 → 第 4 天，决赛 → 第 5 天。
- Grand Finals（`grandfinals4`，2013 赛季总决赛实际于 2014-01-09 举办）：R32 → 01-09，R16 → 01-10，1/4 决赛 → 01-11，半决赛/决赛 → 01-12。
- 男/女世界杯（`wc3`）：资格赛 → 第 1 天，1/4 决赛 → 第 2 天，半决赛/决赛/排位赛 → 第 3 天。
- Team World Cup（`teamwc4`）：资格赛 → 03-28，主赛（Main Draw）→ 03-31。
- WTTC（`wttc8`，巴黎 8 天）：资格赛 → 05-13，R128 → 05-14，R64 → 05-15，R32 → 05-16，R16 → 05-17，1/4 决赛 → 05-18，半决赛 → 05-19，决赛 → 05-20。

> 注意：Grand Finals Dubai 赛事名称/年份列为 2013 赛季，但实际赛期 2014-01-09~12；按惯例归入 `score-log-2013-wtt.json`（年份列 2013），匹配日期按实际赛期 2014-01 计算。

## 4. 姓名规范化说明

遵循 `wtt_data/player-name-format.md`，`tools/import_2013.py` 自动生成标准名映射（复用 2005 规则，约 750+ 球员）。

- 中/港/台/新/韩/朝：`姓 名` 保持原文；日本/欧美：`名 姓` 交换。
- 后缀剥离：`GUO Yan (1982)` → `GUO Yan`、`CHEN Chao-Shun (1977)` → `CHEN Chao-Shun`（仅双打，不入 assoc）、`KIM Minhee (YOB=1991)` → 保留为 `KIM Minhee (1991)`（与 2005 已录入的 `KIM Minhee`，YOB=1985 为两位不同球员，保留后缀区分，同 `XU Jie` 先例）。
- 姓名特例：`FANG Bo`（2013 全部为 KAZ）与既有 assoc 的 `FANG Bo`（KAZ，official-416）一致；`THOMAS WU ZHANG Chloe Anna`（WAL）按欧洲规则处理为 `Anna THOMAS WU ZHANG Chloe`。

全部 3954 条无缺失名字、无胜者不匹配、无重复录入、无双打胜者=负者。

## 5. 协会籍补充（assoc.json）

| 文件 | 本次新增 | 合计 |
| --- | --- | --- |
| `wtt_data/ms/assoc.json` | 204 | 1771 |
| `wtt_data/ws/assoc.json` | 150 | 1708 |

2013 全部 MS/WS 球员（含 U21MS/U21WS/MT/WT 单打）identity 命中率 100%。新增国家映射：`CUB/IRQ/MNE/PAN`（古巴/伊拉克/黑山/巴拿马）。MD/WD/XD 双打球员如从未进入 MS/WS 则不入 assoc（与 2002~2005 惯例一致），如 `CHEN Chao-Shun`(TPE) 仅 MD。

## 6. 关键场次验证

| 场次 | 结果 |
| --- | --- |
| 世乒赛 MS 决赛 | `ZHANG Jike` 胜 `WANG Hao`（2013-05-20） |
| 世乒赛 WS 决赛 | `LI Xiaoxia` 胜 `LIU Shiwen`（2013-05-20） |
| 世乒赛 MD 决赛 | `CHEN Chien-An/CHUANG Chih-Yuan` 胜 `HAO Shuai/MA Lin`（2013-05-20） |
| 世乒赛 WD 决赛 | `GUO Yue/LI Xiaoxia` 胜 `DING Ning/LIU Shiwen`（2013-05-20） |
| 世乒赛 XD 决赛 | `KIM Hyok Bong/KIM Jong` 胜 `LEE Sang Su/PARK Youngsook`（2013-05-20） |
| 男子世界杯决赛 | `XU Xin` 胜 `Vladimir SAMSONOV`（2013-10-27） |
| 女子世界杯决赛 | `LIU Shiwen` 胜 `WU Yang`（2013-09-23） |
| 总决赛 MS 决赛 | `XU Xin` 胜 `MA Long`（2014-01-12） |
| 总决赛 WS 决赛 | `LIU Shiwen` 胜 `DING Ning`（2014-01-12） |
| 总决赛 MD 决赛 | `GAO Ning/LI Hu` 胜 `CHIANG Hung-Chieh/HUANG Sheng-Sheng`（2014-01-12） |
| 总决赛 WD 决赛 | `DING Ning/LI Xiaoxia` 胜 `CHENG I-Ching/HUANG Yi-Hua`（2014-01-12） |

## 7. 相关脚本

- `tools/import_2013.py`：十七站导入脚本（复用 2005 逻辑，新增 `pro5/grandfinals4/teamwc4/wttc8` 模板、U21MS/U21WS 并入 ms/ws、MT/WT 单双打分流（团队双打 → md/wd）、`KIM Minhee (YOB=1991)` 特例保留后缀、去重追加、manifest 注册）。
- `tools/add_assoc_2013.py`：补充 assoc.json 脚本（复用 import_2013 的 NAME_MAP 与原始国家代码，覆盖 U21MS/U21WS/MT/WT，扩充 COUNTRY_MAP 增 `CUB/IRQ/MNE/PAN`）。

---

# 第十部分：2014 年赛事导入

## 1. 概述

2014 年共导入 14 站 ITTF 赛事（无个人世乒赛，故无 XD）。沿用 2013 年全部规则：`U21MS/U21WS` 并入 ms/ws；团体赛（世乒团体 Tokyo）MT/WT 单打并入 ms/ws（2014 团体赛无双打行）；人名格式遵循 `wtt_data/player-name-format.md` 与 `wtt_data/mixed-team-guide.md`。

```python
# 事件类型映射（按原始文件页眉「赛事种类」判定，2014 无 to agent.txt）
Super Series   → ittf白金赛（1.15）
Major Series   → ittf常规赛（0.48）
Grand Finals   → 总决赛（1.35）
World Cup      → 世界杯（1.62）
ITTF WTTC 团体 → 世乒赛团体（1.21）
```

## 2. 数据来源与导入结果

原始数据位于 `docs/result_ittf_link/2014/`（14 个 txt；`import_2014.py` 为其中元数据生成脚本，非导入脚本）。tab 分隔行结构同 2013，无断行续行问题，无需行拼接。

| 类别 | 目标文件 | 新增 |
| --- | --- | --- |
| MS | `wtt_data/ms/score-log-2014-wtt.json` | 1507 |
| WS | `wtt_data/ws/score-log-2014-ws.json` | 1306 |
| MD | `wtt_data/md/score-log-2014-wtt.json` | 423 |
| WD | `wtt_data/wd/score-log-2014-wtt.json` | 304 |
| XD | `wtt_data/xd/score-log-2014-wtt.json` | 0 |
| 合计 | | 3540 条 |

> 现有 `ms/score-log-2014-wtt.json` 原已有 7 条洲杯赛记录（2014-02-21~23），按 `(日期,类型,胜者,负者)` 去重追加，无冲突；文件当前总计 1514 条。

五个分类的 `manifest.json` 已将 `score-log-2014-*` 注册到 scoreFiles 首位。

分站明细（按原始文件实际可解析行数）：

| 站 | 类型 | MS | WS | MD | WD |
| --- | --- | --- | --- | --- | --- |
| Kuwait Open | 白金 | 93 | 76 | 48 | 28 |
| Qatar Open | 白金 | 113 | 171 | 41 | 26 |
| German Open Magdeburg | 白金 | 63 | 63 | 61 | 41 |
| WTTC Tokyo（团体） | 世乒团体 | 428 | 346 | - | - |
| China Open Chengdu | 白金 | 100 | 100 | 18 | 16 |
| Korea Open Incheon | 白金 | 94 | 61 | 30 | 25 |
| Japan Open Yokohama | 白金 | 94 | 51 | 32 | 16 |
| Spanish Open Almeria | 常规 | 186 | 134 | 43 | 36 |
| Czech Open Olomouc | 常规 | 94 | 94 | 56 | 45 |
| Women's World Cup Linz | 世界杯 | - | 28 | - | - |
| Men's World Cup Dusseldorf | 世界杯 | 28 | - | - | - |
| Russian Open Ekaterinburg | 常规 | 94 | 62 | 23 | 20 |
| Swedish Open Stockholm | 常规 | 94 | 94 | 64 | 44 |
| Grand Finals Bangkok | 总决赛 | 30 | 30 | 7 | 7 |

> 缺失说明：German Open Magdeburg 源数据无 U21 行（该站 U21 未在导出范围内）；Grand Finals Bangkok MD/WD 仅 QF/SF/F 三轮；各站 MS/WS 行数含 U21MS/U21WS（并入 ms/ws）。

## 3. 日期映射

沿用既有模板，新增 `pro6`（Qatar 6 天）、`team8`（世乒团体 Tokyo 8 天），`wc3` 增加 `R16` 映射（2014 世界杯正赛含 R16 轮）：

- Pro Tour 5 天站（`pro5`，10 站）：资格赛 → 第 1 天，R64/R32 → 第 2 天，R16/1/4 决赛 → 第 3 天，半决赛 → 第 4 天，决赛 → 第 5 天。
- Qatar Open（`pro6`，2014-02-18~23）：资格赛 → 02-18，R64 → 02-19，R32 → 02-20，R16 → 02-21，1/4 决赛 → 02-22，半决赛/决赛 → 02-23。
- Grand Finals（`grandfinals4`，Bangkok 2014-12-11~14）：R16 → 12-12，1/4 决赛 → 12-13，半决赛/决赛 → 12-14。
- 男/女世界杯（`wc3`，各 3 天）：资格赛 → 第 1 天，R16/1/4 决赛 → 第 2 天，半决赛/决赛/排位赛 → 第 3 天。
- 世乒团体（`team8`，Tokyo 2014-04-28~05-05）：资格赛 → 04-28，主赛（Main Draw）→ 05-05。

## 4. 姓名规范化说明

遵循 `wtt_data/player-name-format.md`，`tools/import_2014.py` 自动生成标准名映射（复用 2013 规则）。

- 中/港/台/新/韩/朝：`姓 名` 保持原文；日本/欧美：`名 姓` 交换（如 `Jun MIZUTANI`、`Koki NIWA`、`Dimitrij OVTCHAROV`）。
- 复用 2013 姓名特例：`KIM Minhee (YOB=1991)` → 保留为 `KIM Minhee (1991)`（Kuwait/Qatar/Chengdu 2014 均出现）；`LANG Kristin` → `Kristin LANG`；`NI Xia Lian` → `Xia Lian NI`；`LI Qian` → `Qian LI`；`SCHOPP Jie` 保持原文。`FANG Bo`（Korea/Swedish 2014）与既有 assoc 一致为 KAZ。
- 新增特例：`CHEN Szu-YU`（Grand Finals Bangkok 胜者格大写 U）→ `CHEN Szu-Yu`（与既有 DB 一致）。

全部 3540 条无缺失名字、无胜者不匹配、无重复录入、无双打胜者=负者。

## 5. 协会籍补充（assoc.json）

| 文件 | 本次新增 | 合计 |
| --- | --- | --- |
| `wtt_data/ms/assoc.json` | 259 | 2030 |
| `wtt_data/ws/assoc.json` | 202 | 1910 |

2014 全部 MS/WS 球员（含 U21MS/U21WS/MT/WT 单打）identity 命中率 100%。新增国家映射 8 个：`BAN/ESA/FRO/GGY/GUM/LAO/NAM/PLE`（孟加拉/萨尔瓦多/法罗群岛/根西岛/关岛/老挝/纳米比亚/巴勒斯坦），多来自世乒团体 Tokyo 的队伍。另补全既有代码：`ANG/BOT/JEY/NCL/PHI/SYR`（安哥拉/博茨瓦纳/泽西岛/法国[NCL 沿用既有惯例]/菲律宾/叙利亚）。

## 6. 关键场次验证

| 场次 | 结果 |
| --- | --- |
| 男子世界杯决赛 | `ZHANG Jike` 胜 `MA Long`（2014-10-26） |
| 女子世界杯决赛 | `DING Ning` 胜 `LI Xiaoxia`（2014-10-19） |
| 总决赛 MS 决赛 | `Jun MIZUTANI` 胜 `Dimitrij OVTCHAROV`（2014-12-14） |
| 总决赛 WS 决赛 | `Kasumi ISHIKAWA` 胜 `SUH Hyo Won`（2014-12-14） |
| 总决赛 MD 决赛 | `CHO Eonrae/SEO Hyundeok` 胜 `Kenta MATSUDAIRA/Koki NIWA`（2014-12-14） |
| 总决赛 WD 决赛 | `Mima ITO/Miu HIRANO` 胜 `Katarzyna GRZYBOWSKA-FRANC/Natalia PARTYKA`（2014-12-14） |
| Kuwait MS/WS 决赛 | `FAN Zhendong` / `ZHU Yuling` |
| Qatar MS/WS 决赛 | `XU Xin` / `HU Limei` |
| German MS/WS 决赛 | `Dimitrij OVTCHAROV` / `SHAN Xiaona` |
| Chengdu MS/WS 决赛 | `MA Long` / `DING Ning` |
| Korea MS/WS 决赛 | `XU Xin` / `HAN Ying` |
| Japan MS/WS 决赛 | `YU Ziyang` / `FENG Tianwei` |
| Czech MS/WS 决赛 | `Marcos FREITAS` / `Elizabeta SAMARA` |
| Russian MS/WS 决赛 | `Koki NIWA` / `Kasumi ISHIKAWA` |
| Swedish MS/WS 决赛 | `FAN Zhendong` / `ZHU Yuling` |
| Spanish MS/WS 决赛 | `Paul DRINKHALL` / `LI Fen` |

## 7. 相关脚本

- `tools/import_2014.py`：十四站导入脚本（复用 2013 逻辑，新增 `pro6/team8` 模板、`wc3` 增 R16、`CHEN Szu-YU` 特例、去重追加、manifest 首位注册）。
- `tools/add_assoc_2014.py`：补充 assoc.json 脚本（复用 import_2014 的 NAME_MAP，扩充 COUNTRY_MAP 增 8 新代码及补全 6 既有代码）。

---

# 第十一部分：2015 年赛事导入

## 1. 概述

2015 年共导入 16 站 ITTF 赛事。沿用 2013/2014 全部规则：`U21MS/U21WS` 并入 ms/ws；团体世界杯 Dubai 的 MT/WT 单打并入 ms/ws、团队双打并入 md/wd；世乒赛 Suzhou 为个人赛（含 XD）；人名格式遵循 `wtt_data/player-name-format.md` 与 `wtt_data/mixed-team-guide.md`。

```python
# 事件类型映射（按原始文件页眉「赛事种类」判定）
Super Series   → ittf白金赛（1.15）
Major Series   → ittf常规赛（0.48）
Grand Finals   → 总决赛（1.35）
World Cup      → 世界杯（1.62）
Team World Cup → 世界杯团体（1.05）
ITTF WTTC 个人 → 世乒赛（1.83）
```

## 2. 数据来源与导入结果

原始数据位于 `docs/result_ittf_link/2015/`（16 个 txt + `import2015.py` 元数据生成脚本）。tab 分隔行结构同 2014，无断行续行问题。

| 类别 | 目标文件 | 新增 |
| --- | --- | --- |
| MS | `wtt_data/ms/score-log-2015-wtt.json` | 1650 |
| WS | `wtt_data/ws/score-log-2015-ws.json` | 1265 |
| MD | `wtt_data/md/score-log-2015-wtt.json` | 613 |
| WD | `wtt_data/wd/score-log-2015-wtt.json` | 477 |
| XD | `wtt_data/xd/score-log-2015-wtt.json` | 100 |
| 合计 | | 4105 条 |

> 现有 `ms/score-log-2015-wtt.json` 原已有 7 条洲杯赛记录（2015-02-21~23），去重追加无冲突；文件当前总计 1657 条。

五个分类的 `manifest.json` 已将 `score-log-2015-*` 注册到 scoreFiles 首位。

分站明细（按解析后实际入库行数）：

| 站 | 类型 | MS | WS | MD | WD | XD |
| --- | --- | --- | --- | --- | --- | --- |
| Team World Cup Dubai | 世界杯团体 | 44 | 48 | 19 | 19 | - |
| Kuwait Open | 白金 | 146 | 54 | 43 | 29 | - |
| Qatar Open | 白金 | 34 | 86 | 38 | 25 | - |
| German Open Bremen | 白金 | 244 | 154 | 60 | 38 | - |
| Spanish Open Almeria | 常规 | 93 | 93 | 48 | 36 | - |
| WTTC Suzhou | 世乒赛 | 350 | 200 | 100 | 99 | 100 |
| Japan Open Kobe | 白金 | 100 | 96 | 27 | 24 | - |
| Korea Open Incheon | 白金 | 96 | 67 | 18 | 10 | - |
| China Open Chengdu | 白金 | 100 | 98 | 23 | 21 | - |
| Czech Open Olomouc | 常规 | 54 | 35 | 59 | 43 | - |
| Austrian Open Wels | 常规 | 193 | 120 | 55 | 41 | - |
| Men's World Cup Halmstad | 世界杯 | 28 | - | - | - | - |
| Polish Open Warsaw | 常规 | 93 | 94 | 60 | 44 | - |
| Women's World Cup Sendai | 世界杯 | - | 28 | - | - | - |
| Swedish Open Stockholm | 常规 | 94 | 63 | 56 | 41 | - |
| Grand Finals Lisbon | 总决赛 | 30 | 30 | 7 | 7 | - |

> 缺失说明：各站均为部分页导出（按要求忽略数量差）；Kuwait MS 源文件重复粘贴两页，去重后正确；Team World Cup Dubai 有 2 条未赛行（Result `0 - 0` 且无胜者），自动跳过；German Bremen 资格赛 Round 列为「256」等数字编号，按 Qualification 阶段统一映射第 1 天。

## 3. 日期映射

沿用既有模板（复用 2013 的 `teamwc4/wttc8`、2014 的 `pro6/wc3(含R16)`），无新增模板：

- Pro Tour 5 天站（`pro5`，10 站）：资格赛 → 第 1 天，R64/R32 → 第 2 天，R16/1/4 决赛 → 第 3 天，半决赛 → 第 4 天，决赛 → 第 5 天。
- Qatar Open（`pro6`，2015-02-17~22）：资格赛 → 02-17，R64 → 02-18，R32 → 02-19，R16 → 02-20，1/4 决赛 → 02-21，半决赛/决赛 → 02-22。
- Grand Finals（`grandfinals4`，Lisbon 2015-12-10~13）：R16 → 12-11，1/4 决赛 → 12-12，半决赛/决赛 → 12-13。
- 男/女世界杯（`wc3`，各 3 天）：资格赛 → 第 1 天，R16/1/4 决赛 → 第 2 天，半决赛/决赛/排位赛 → 第 3 天。
- Team World Cup（`teamwc4`，Dubai 2015-01-08~11）：资格赛 → 01-08，主赛（Main Draw）→ 01-11。
- WTTC（`wttc8`，Suzhou 2015-04-26~05-03）：资格赛 → 04-26，R128 → 04-27，R64 → 04-28，R32 → 04-29，R16 → 04-30，1/4 决赛 → 05-01，半决赛 → 05-02，决赛 → 05-03。

## 4. 姓名规范化说明

遵循 `wtt_data/player-name-format.md`，`tools/import_2015.py` 自动生成标准名映射（复用 2013/2014 规则）。

- 中/港/台/新/韩/朝：`姓 名` 保持原文；日本/欧美：`名 姓` 交换（如 `Jun MIZUTANI`、`Tomokazu HARIMOTO`、`Dimitrij OVTCHAROV`）。
- 复用既有特例：`KIM Minhee (YOB=1991)` → `KIM Minhee (1991)`（Korea/Kuwait/Qatar 2015 出现）；`LANG Kristin` → `Kristin LANG`；`NI Xia Lian` → `Xia Lian NI`；`LI Qian` → `Qian LI`；`SCHOPP Jie` 保持原文；`THOMAS WU ZHANG Chloe Anna` (WAL) 按欧洲规则处理（Suzhou 资格赛再现）。
- `CHOE Hyon Hwa (1992)` (PRK)：DB 无同名球员，按默认规则剥离年份后缀为 `CHOE Hyon Hwa`。

全部 4105 条无缺失名字、无胜者不匹配、无重复录入、无双打胜者=负者。

## 5. 协会籍补充（assoc.json）

| 文件 | 本次新增 | 合计 |
| --- | --- | --- |
| `wtt_data/ms/assoc.json` | 130 | 2160 |
| `wtt_data/ws/assoc.json` | 57 | 1967 |

2015 全部 MS/WS 球员（含 U21MS/U21WS/MT/WT 单打）identity 命中率 100%。新增国家映射仅 1 个：`DJI`（吉布提，Austrian Open U21MS）。

## 6. 关键场次验证

| 场次 | 结果 |
| --- | --- |
| 世乒赛 MS 决赛 | `MA Long` 胜 `FANG Bo`（2015-05-03） |
| 世乒赛 WS 决赛 | `DING Ning` 胜 `LIU Shiwen`（2015-05-03） |
| 世乒赛 MD 决赛 | `XU Xin/ZHANG Jike` 胜 `FAN Zhendong/ZHOU Yu`（2015-05-03） |
| 世乒赛 WD 决赛 | `LIU Shiwen/ZHU Yuling` 胜 `DING Ning/LI Xiaoxia`（2015-05-03） |
| 世乒赛 XD 决赛 | `XU Xin/YANG Ha Eun` 胜 `Maharu YOSHIMURA/Kasumi ISHIKAWA`（2015-05-03） |
| 团体世界杯 MT 决赛 | 中国 3-0 奥地利（双打 `XU Xin/ZHANG Jike` 胜 `Daniel HABESOHN/Stefan FEGERL`，2015-01-11） |
| 团体世界杯 WT 决赛 | 中国 3-0 朝鲜（双打 `DING Ning/LIU Shiwen` 胜 `KIM Hye Song/RI Mi Gyong`，2015-01-11） |
| 男世界杯决赛 | `MA Long` 胜 `FAN Zhendong`（2015-10-18） |
| 女世界杯决赛 | `LIU Shiwen` 胜 `Kasumi ISHIKAWA`（2015-11-01） |
| 总决赛 MS 决赛 | `MA Long` 胜 `FAN Zhendong`（2015-12-13） |
| 总决赛 WS 决赛 | `DING Ning` 胜 `CHEN Meng`（2015-12-13） |
| 总决赛 MD 决赛 | `Masataka MORIZONO/Yuya OSHIMA` 胜 `Joao MONTEIRO/Tiago APOLONIA`（2015-12-13） |
| 总决赛 WD 决赛 | `DING Ning/ZHU Yuling` 胜 `Mima ITO/Miu HIRANO`（2015-12-13） |
| Kuwait MS/WS 决赛 | `MA Long` / `LI Xiaoxia` |
| Qatar MS/WS 决赛 | `Vladimir SAMSONOV` / `Elizabeta SAMARA` |
| German MS/WS 决赛 | `MA Long` / `Mima ITO` |
| Spanish MS/WS 决赛 | `Maharu YOSHIMURA` / `JEON Jihee` |
| Japan MS/WS 决赛 | `XU Xin` / `CHEN Meng` |
| Korea MS/WS 决赛 | `Youngsik JEOUNG` / `Ai FUKUHARA` |
| Chengdu MS/WS 决赛 | `MA Long` / `ZHU Yuling` |
| Czech MS/WS 决赛 | `WONG Chun Ting` / `Ai FUKUHARA` |
| Austrian MS/WS 决赛 | `Jun MIZUTANI` / `Ying HAN` |
| Polish MS/WS 决赛 | `FAN Zhendong` / `LIU Shiwen` |
| Swedish MS/WS 决赛 | `FAN Zhendong` / `MU Zi` |

## 7. 相关脚本

- `tools/import_2015.py`：十六站导入脚本（复用 2013/2014 逻辑与全部模板 `pro5/pro6/grandfinals4/wc3/teamwc4/wttc8`，未赛行自动跳过、去重追加、manifest 首位注册）。
- `tools/add_assoc_2015.py`：补充 assoc.json 脚本（复用 import_2015 的 NAME_MAP，COUNTRY_MAP 增 `DJI`）。