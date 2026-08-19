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