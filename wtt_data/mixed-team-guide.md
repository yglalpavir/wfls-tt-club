# 成都混合团体世界杯数据录入指南

> 本文档供后续 agent 处理各年份成都混合团体世界杯（类型「世界杯团体」）数据时参考。
> 以 2024 成都混团世界杯为例，记录完整的数据源、赛制、解析方法、姓名规范与工作流。

---

## 一、数据源文件

每次处理的原始数据放在 `tools/` 目录，命名规则：

| 文件 | 内容 | 示例 |
|------|------|------|
| `mixedteams{YEAR}results.txt` | 比赛结果（赛事官网转录，倒序排列） | `mixedteams2024results.txt` |
| `mixedteams{YEAR}playerlist.txt` | 参赛球员名单 | `mixedteams2024playerlist.txt` |

**results 文件结构**（关键）：

```
Mixed Teams - Final              ← 赛段头（Final/Bronze/Semifinal/Stage 1/Stage 2）
Match 1 | 8 Dec, 19:00           ← 场次 + 日期时间

CHN  8-1                        ← 队A + 总比分（注意行末可能有尾随空格）
KOR                            ← 队B
Table 1
Match Centre
View Results
WANG                           ← 第1盘胜者（双打给姓氏，单打给全名）
SUN
2 - 1                          ← 该盘比分（混双2局制）
SHIN
CHO
11-9,17-19,11-4                ← 各局小分（sets）
WANG Manyu                     ← 第2盘（女单，全名）
3 - 0
KIM Nayeong
11-3,11-7,11-2
```

---

## 二、混团赛制（成都混团世界杯）

每场队际赛盘序固定，先到 **8 局总分** 的队伍获胜（提前结束，剩余局不显示）：

| 盘序 | 项目 | 说明 |
|------|------|------|
| 第1盘 | **XD** 混双 | 2 局制（最多 2 局，先到 2 局者胜该盘） |
| 第2盘 | **WS** 女单 | 3 局制 |
| 第3盘 | **MS** 男单 | 3 局制 |
| 第4/5盘 | **MD/WD** 男双/女双 | 3 局制，顺序不定，按上场球员性别判定 |

> ⚠️ 2023 与 2024 计分可能不同，处理前务必确认该年份的局制。
> 录入数据只需胜负关系（谁赢谁输），无需局分。

**关键特征**：
- **单打**盘给球员**全名**（如 `WANG Manyu`、`SZOCS Bernadette`）
- **双打**盘只给**姓氏对**（如 `WANG/SUN`、`KIM/CHO`），需解析成全名

---

## 三、姓名规范

遵循 `wtt_data/player-name-format.md`：

| 地区 | 格式 | 示例 |
|------|------|------|
| 中国/韩国 | `姓 名`（姓全大写） | `WANG Chuqin`、`JANG Woojin` |
| 日本/欧洲 | `名 姓`（姓全大写） | `Tomokazu HARIMOTO`、`Felix LEBRUN` |
| 双打 | `P1/P2`（斜杠分隔） | `WANG Chuqin/SUN Yingsha` |

**XD 混双顺序**：系统前端（`js/wtt_common.js` 的 `wttNormalizeDoublesName`）会自动把 XD 规范为**男前女后**、MD/WD 按字母序排序。因此**数据文件可保留原始转录顺序**，前端展示时自动规范化（与 2023 数据惯例一致，如 `SHIN Yubin/AN Jaehyun` 在文件中为女前男后）。

---

## 四、双打姓氏 → 全名解析策略

这是混团处理的最大难点。双打盘只给姓氏（如 `WANG/SUN`），且同一队内可能有同名/同姓球员。

### 解析约束（组合使用）

1. **队伍约束**：双打姓氏必须匹配该队球员。
2. **项目/性别约束**：
   - XD：一男一女（`{M,F}`）
   - MD：两个男（`{M,M}`）
   - WD：两个女（`{F,F}`）
3. **本场已出场者**（appeared）：单打盘给全名，可确定该场各队实际出场的球员。
4. **全局活跃球员**（ACTIVE_PLAYERS）：全赛事所有场次单打出现的球员，权重低于本场。

### 歧义示例

| 情况 | 例 | 解决 |
|------|-----|------|
| 同姓多球员（不同性别） | CHN `WANG`（Chuqin男/Manyu女/Yidi女） | XD 中配 SUN(女) → WANG 必须男 = Chuqin |
| 同姓多球员（同性别） | ROU `IONESCU`（Eduard/Ovidiu 均男） | 该场单打出现的那个 IONESCU 优先 |
| 同姓多球员（同性别） | USA `NARESH`（Sid/Nandan 均男） | 同上，用该场单打 + 全局活跃消歧 |
| 无单打线索 | CHN `WANG/LIN`（两女 WANG + 两男 LIN） | 需**手工查证**实际出场 |

### 手工覆盖表（必要时）

当自动消歧无法可靠判定时，需用**实际比赛查证**（Olympics.com、WTT、新华网、各国乒协社媒等）后，在脚本中加**手工覆盖表** `DOUBLES_OVERRIDES`：

```python
DOUBLES_OVERRIDES = {
    # (队A, 队B, 盘索引, side)  side: 0=胜者, 1=负者 -> (球员1, 球员2)
    ("CHN", "USA", 0, 0): ("WANG Yidi", "LIN Gaoyuan"),
    ("IND", "USA", 0, 1): ("Nandan NARESH", "Tiffany KE"),
    ("TPE", "SGP", 0, 0): ("LI Yan Jun", "HUANG Yu-Chiao"),
}
```

---

## 五、目标文件

按类别追加到对应年份的正式 score-log 文件（**追加到末尾**，保持原有格式）：

| 类别 | 目标文件 |
|------|---------|
| MS | `wtt_data/ms/score-log-{YEAR}-wtt.json` |
| WS | `wtt_data/ws/score-log-{YEAR}-ws.json` |
| MD | `wtt_data/md/score-log-{YEAR}-wtt.json` |
| WD | `wtt_data/wd/score-log-{YEAR}-ws.json` |
| XD | `wtt_data/xd/score-log-{YEAR}-wtt.json` |

**记录格式**：
```json
{ "日期": "2024-12-08", "类型": "世界杯团体", "胜者": "WANG Chuqin/SUN Yingsha", "负者": "SHIN Yubin/CHO Daeseong" }
```

> ⚠️ 各文件格式不同：XD 为**紧凑单行**（`{ "日期": ..., ... }` 每记录一行），其余为**缩进格式**。追加时需保持各自风格。

**文件编码规则**：读取 `utf-8-sig`（兼容 BOM），写入 `utf-8` + `ensure_ascii=False` + `newline='\n'`。

---

## 六、工作流

```bash
# 1. 运行解析脚本（生成 tools/_mixedteams{YEAR}_{cat}.json）
python tools/parse_mixedteams.py 2024
python tools/parse_mixedteams.py 2024 --write

# 2. 检查输出：统计条数、比分校验、未解析清单
#    预期 MS/WS/XD 各 ~52（每场各1盘），MD/WD 视比赛进程（约15-25）

# 3. 处理未解析项：查证实际出场 → 补 DOUBLES_OVERRIDES → 重跑

# 4. 追加到正式文件（先备份 wtt_data 下的目标文件）
python tools/append_mixedteams.py 2024

# 5. 验证
#    - 各文件 json.loads 成功
#    - 混团记录数正确、无重复
#    - 日期范围正确（如 2024-12-01 ~ 2024-12-08）
#    - 决赛/半决赛等关键场次抽查
```

### 关键脚本

| 脚本 | 作用 | 保留/临时 |
|------|------|----------|
| `tools/parse_mixedteams.py` | 解析 results/playerlist → 分类记录 | **保留复用** |
| `tools/append_mixedteams.py` | 合并解析产物到正式文件 | **保留复用** |

### 验证要点

1. **比分校验**：每场总比分应等于各盘局数之和（脚本已内置，出现 `[比分不符]` 需排查）。
2. **无重复**：追加脚本按 `(日期,类型,胜者,负者)` 去重。
3. **日期范围**：混团通常跨多天（如 2024 为 12-01 ~ 12-08）。
4. **歧义零遗留**：解析应达到「无未解析项」，否则数据不完整。

---

## 七、注意事项 / 常见坑

1. **结果文件为倒序**：从决赛 → 半决赛 → 小组赛，注意别漏场次（2024 共 52 场）。
2. **`Player Image` 前缀**：playerlist 的姓名前有 `Player Image` 前缀，需去除。
3. **未上场球员**：playerlist 中 M/W/L 全为 `-` 的球员（如 THAKKAR、SHAH、YOSHIYAMA 等）未上场，无需处理。
4. **多字姓拼接**：转录中双打姓氏可能拼接（如 `REYESLAI`=REYES LAI、`DESTOPPELEIRE`=DE STOPPELEIRE），姓氏匹配需支持合并形式。
5. **单打名字序**：结果文件中单打可能是「姓 名」（如 `SZOCS Bernadette`），而数据库是「名 姓」——用**忽略词语顺序的全名匹配**（word_key）。
6. **性别查证**：TPE 的 `HUANG Yu-Chiao` 是**女**、`HUANG Yan-Cheng` 是**男**；同姓不同性别需从 WS/MS 数据或权威来源确认。
7. **备份先行**：追加前务必备份正式文件（追加脚本幂等，但防误操作）。
8. **PowerShell 内联中文**：避免用 `python -c` 处理含中文/引号的逻辑，优先写脚本文件。
