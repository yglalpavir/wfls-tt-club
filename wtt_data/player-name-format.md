# WTT 数据球员名标准格式

> 本文档定义 `wtt_data/` 目录下所有比赛记录（score-log）和初始积分（initial-scores）中球员姓名的标准写法。

---

## 基本原则

**名在前，姓在后，姓全大写。**

| 地区 | 格式 | 示例 |
|------|------|------|
| 中国（含港台澳） | `姓 名` | `WANG Chuqin` `LIN Yun-Ju` `WONG Chun Ting` |
| 日本 | `名 姓`（姓全大写） | `Tomokazu HARIMOTO` `Sora MATSUSHIMA` |
| 韩国 | `姓 名` | `JANG Woojin` `AN Jaehyun` `LIM Jonghoon` |
| 朝鲜 | `姓 名` | `RI Jong Sik` `KIM Kum Yong` |
| 东南亚 | `姓 名` 或 `名 姓` | `QUEK Izaac` `PANG Koen` |
| 欧洲 | `名 姓` | `Felix LEBRUN` `Truls MOREGARD` |
| 美洲 | `名 姓` | `Hugo CALDERANO` `Kanak JHA` |
| 非洲 | `名 姓` | `Quadri ARUNA` `Omar ASSAR` |
| 中东/中亚 | `名 姓` | `Noshad ALAMIYAN` `Kirill GERASSIMENKO` |
| 南亚（印度等） | `名 姓` | `Manush SHAH` `Sathiyan GNANASEKARAN` |
| 大洋洲 | `名 姓` | `Nicholas LUM` `Finn LUU` |

---

## 详细规则

### 1. 中国球员（含港、台、澳）

**格式**：`姓 名`（姓在前，全大写；名在后，首字母大写其余小写）

```
WANG Chuqin         ← 正确
FAN Zhendong        ← 正确
MA Long             ← 正确
LIN Yun-Ju          ← 正确（台湾，连字符在名中）
WONG Chun Ting      ← 正确（香港，多字名用空格分隔）
CHAN Baldwin        ← 正确（英文名视为名的一部分）
KUO Guan-Hong       ← 正确
```

> **注意**：中国大陆球员姓全大写，名首字母大写余小写。台湾、香港球员同理。

### 2. 日本球员

**格式**：`名 姓`（名在前，姓在后且全大写）

```
Tomokazu HARIMOTO   ← 正确
Sora MATSUSHIMA     ← 正确
Shunsuke TOGAMI     ← 正确
Hiroto SHINOZUKA    ← 正确
Jun MIZUTANI        ← 正确
Mima ITO            ← 正确（女）
Miu HIRANO          ← 正确（女）
Satsuki ODO         ← 正确（女）
Hitomi SATO         ← 正确（女）
```

> ❌ **不允许**：`HARIMOTO Tomokazu`（姓在前） `Harimoto Tomokazu`（姓未全大写）

### 3. 韩国球员

**格式**：`姓 名`（与中文相同，姓全大写）

```
JANG Woojin         ← 正确
AN Jaehyun          ← 正确
LIM Jonghoon        ← 正确
PARK Ganghyeon      ← 正确
CHO Daeseong        ← 正确
OH Junsung          ← 正确
SHIN Yubin          ← 正确（女）
KIM Nayeong         ← 正确（女）
```

### 4. 朝鲜球员

**格式**：`姓 名`（与韩国相同，姓全大写）

```
RI Jong Sik         ← 正确
KIM Kum Yong        ← 正确
```

### 5. 欧洲球员

**格式**：`名 姓`（名在前首字母大写，姓全大写）

```
Felix LEBRUN        ← 正确
Truls MOREGARD      ← 正确
Benedikt DUDA       ← 正确
Dang QIU            ← 正确（华裔德籍，但也采用欧洲格式）
Darko JORGIC        ← 正确
Alexis LEBRUN       ← 正确
Dimitrij OVTCHAROV  ← 正确
Patrick FRANZISKA   ← 正确
Flavien COTON       ← 正确
```

### 6. 美洲球员

**格式**：`名 姓`

```
Hugo CALDERANO      ← 正确（巴西）
Kanak JHA           ← 正确（美国）
Horacio CIFUENTES   ← 正确（阿根廷）
Nicolas BURGOS      ← 正确（智利）
```

### 7. 非洲球员

**格式**：`名 姓`

```
Quadri ARUNA        ← 正确
Omar ASSAR          ← 正确
Mohamed ELBEIALI    ← 正确
```

### 8. 南亚球员（印度等）

**格式**：`名 姓`

```
Manush SHAH         ← 正确
Sathiyan GNANASEKARAN ← 正确
Harmeet DESAI       ← 正确
Manika BATRA        ← 正确（女）
```

### 9. 东南亚球员

**格式**：`姓 名` 或 `名 姓`（以姓名大写为准）

```
QUEK Izaac          ← 正确（新加坡，姓全大写）
PANG Koen           ← 正确
LOY Ming Ying       ← 正确
```

### 10. 中东/中亚球员

**格式**：`名 姓`

```
Noshad ALAMIYAN     ← 正确（伊朗）
Kirill GERASSIMENKO ← 正确（哈萨克斯坦）
Abdullah YIGENLER   ← 正确（土耳其）
```

---

## 双打组合

**格式**：`球员A/球员B`（用 `/` 分隔，每位球员遵循上述规则）

```
MA Long/WANG Chuqin                         ← 正确（中国男双）
HUANG Youzheng/LIN Shidong                  ← 正确
JANG Woojin/CHO Daeseong                    ← 正确（韩国男双）
Tomokazu HARIMOTO/Shunsuke TOGAMI           ← 正确（日本男双）
Felix LEBRUN/Alexis LEBRUN                  ← 正确（欧洲男双）
LIM Jonghoon/SHIN Yubin                     ← 正确（韩国混双，男前女后）
WANG Chuqin/SUN Yingsha                     ← 正确（中国混双）
```

> **注意**：
> - MD/WD（同性别双打）：两球员名按字母排序
> - XD（混合双打）：男选手在前，女选手在后
> - `A/B` 和 `B/A` 视为同一组双打，系统会自动规范化

---

## 特殊字符与连字符

| 情况 | 处理 | 示例 |
|------|------|------|
| 带连字符的名 | 保留连字符 | `LIN Yun-Ju` `FENG Yi-Hsin` |
| 带空格的多字名 | 保留空格 | `WONG Chun Ting` `LAM Siu Hang` |
| 带撇号的名字 | 保留撇号 | `Abdel-Kader SALIFOU` |
| 带变音符 | 保留原字符 | `Milosz REDZIMSKI` `Horacio CIFUENTES` |

---

## 反面示例（❌ 不允许）

| 错误 | 问题 | 正确 |
|------|------|------|
| `HARIMOTO Tomokazu` | 姓在前，名在后 | `Tomokazu HARIMOTO` |
| `Harimoto Tomokazu` | 姓未全大写 | `Tomokazu HARIMOTO` |
| `NIWA Koki` | 日本球员姓在前 | `Koki NIWA` |
| `ODO Satsuki` | 日本球员姓在前 | `Satsuki ODO` |

---

## 维护

- 新录入数据时，请严格遵循以上格式
- 如发现格式错误，运行 `python tools/fix_jp_names.py` 自动检查和修复日本球员名
- 双打组合名由系统自动规范化（`js/wtt_common.js` — `wttNormalizeDoublesName()`）
