# 计划：WTT 模块导入亚锦赛个人赛（Asian Championships 2026 Singles & Doubles）

日期：2026-10-25
范围：`wtt_data/{ms,ws,md,wd,xd}`（国际乒联积分排名中心 / WTT 模块）
续接：`plan-2026-10-23-asian-champs-team-import.md`（同一届赛事 TTE3474 的团体部分，已导入 289 盘）

## 1. 目标

把 **ITTF-ATTU 亚洲乒乓球锦标赛 2026（塔什干）个人赛全部 5 个项目**写入 WTT 模块：

| 项目 | ITTF 事件码 | 目标目录 |
|---|---|---|
| 男子单打 | `M.SINGLES` | `wtt_data/ms` |
| 女子单打 | `W.SINGLES` | `wtt_data/ws` |
| 男子双打 | `M.DOUBLES` | `wtt_data/md` |
| 女子双打 | `W.DOUBLES` | `wtt_data/wd` |
| 混合双打 | `X.DOUBLES` | `wtt_data/xd` |

- 赛事类型：`洲锦赛`（个人赛；团体是 `洲锦赛团体`）。类型键、系数、i18n 均已在
  `event-coefficient.json` / `js/common.js` 中就绪 ⇒ 无需新增。
- 记录格式沿用 WTT 既有约定：`{日期, 类型, 胜者, 负者, 比分, 局分?}`，`局分` 为**胜者视角**。
- 双打的 `胜者`/`负者` 是 `"甲/乙"` 组合串（WTT 侧双打口径），成员名各自走姓名映射。
- 淘汰轮 + 排位赛全部导入（`R128`/`R64-`/`R32-`/`8FNL`/`QFNL`/`SFNL`/`FNL-`/
  `2532`/`2528`/`2728`/`1732`/`916-`/`1616`/`1516`/`1314`），排位赛也是真实场次。

## 2. 数据源

与团体导入同源（ITTF 官方成绩站 Bornan 静态 JSON，无需 JS 渲染），届次代码 `TTE3474`：

| 路径 | 内容 |
|---|---|
| `<BASE>/<CHAMP>/champ.json` | 比赛日、项目、阶段列表（`isFinished: true`） |
| `<BASE>/<CHAMP>/match/d<YYYY-MM-DD>.json` | 当日全部场次，10-18 ~ 10-25 共 8 天 |
| `<BASE>/<CHAMP>/match/<Key>.json` | 单场详情 |

`BASE = https://results.ittf.com/ittf-web-results/html`。

**个人赛详情结构与团体不同**：没有 `SubMatches`，局分直接挂在顶层
`Home.Splits` / `Away.Splits`（每局一项 `{Win, Res, Stats}`，`Res` 是该局得分）；
双打一侧另有 `Members: [{Reg, Org, Desc}, ...]` 两名成员。`Periods` 是字符串列表，
顺序/视角未核实，**不使用**。

本地缓存：`tools/.attc_raw/TTE3474/`（8 个 `day-*.json`、396 个 `sng-*.json`、
83 个 `tie-*.json`）。抓取脚本 `tools/import_asian_champs_sng.py`（缓存命中即读，
`--refresh` 强制重抓）。

## 3. 记录口径

### 3.1 胜负与局分

与团体导入一致（**本次无新增自定义口径**）：

1. **逐局比分优先**：由双方 `Splits[].Res` 统计胜局数，先到 3 局者胜；
2. 逐局比分不可用时才回退到 `Res`（胜局数字段）；
3. `Res` 为 `WO`（弃权）/ `RET`（伤退）等非数字取值的场次**整场跳过**
   （写入会得到虚假的 11-0）——本次 16 场。

本届个人赛 **0 处** `Res` 与逐局比分冲突（`res_splits_conflict = 0`），
团体那 1 处陈旧 `Res` 的问题在个人赛未出现。

### 3.2 双打组合名（`wttNormalizeDoublesName` 前置）

前端在加载 wtt score-log 时会对 `胜者`/`负者` 就地规范化（`js/wtt_common.js`
`wttNormalizeDoublesName`）：MD/WD 按字母序；XD 男前女后，性别查
`WTT_KNOWN_GENDERS`（**只有仓库既有表**，约 240 个 identity），判不出时退化为字母序。

导入时直接写成规范化形式，避免 H2H 统计因顺序不同而分裂。关键在于**写盘必须与前端
加载后的内存形态一致**，因此：

- 只使用仓库 `WTT_KNOWN_GENDERS` 判定性别，**不**把本赛事自证的性别（M.*/W.*/团体
  项目可推出 219 个新面孔性别）用于排序——前端没有这些性别，加载时会退化为字母序，
  写盘若按男前女后写就会与内存不一致；
- XD 两端性别都能判定且不同 → 男前女后；否则 → 字母序。
  本届 52 场 XD 中共 **67 个组合走字母序退化**（多为亚洲新面孔，仓库性别表尚未覆盖）。

> 遗留问题：`WTT_KNOWN_GENDERS` 缺一大批亚洲球员，XD 组合的性别判定覆盖不足。
> 该表是前端逻辑的一部分（改动会波及所有 XD 页面的排序），本次不扩表，只如实记录退化数量。

### 3.3 姓名

沿用团体导入的姓名口径（汉字协会保留姓在前、其余协会改为名在前、同人异写取仓库出现
次数最多的写法、`EXTRA_NAME_MAP` 显式统一 `Ubaydullo SULTONOV` / `YAP Rui Zhe`）。
本届个人赛**新面孔 7 人**（均非拼写错误，仓库此前无记录）：

`Alisya MALIQA`、`Braydon SUSILO`、`Hangoma SAIDBEKOVA`、`Imran MUHAMMAD`、
`Maftuna ELMURODOVA`、`Parichehra SHARIPOVA`、`Taufiq ZIKRI`

### 3.4 追加而非重排

新增记录**只追加到各文件数组末尾**，既有记录一字不动（`git diff --numstat` 全部
**0 行删除**）。原因：仓库 2026 的 score-log 本来就不是全局按日期升序（多年累次追加的
产物，HEAD 里 ms 有 48 处、md 有 22 处日期回退），为了插入几场 10-20 的比赛去重排整个
文件会产生上万行无关 diff。读取侧都是先按日期过滤再排序，追加不影响正确性。

## 4. 数据源清点（396 场）

| 项目 | 赛程场次 | 落库 | 跳过（弃权） | 有局分 | 无局分 |
|---|---|---|---|---|---|
| MS | 138 | 132 | 6 | 130 | 2 |
| WS | 99 | 97 | 2 | 97 | 0 |
| MD | 58 | 54 | 4 | 54 | 0 |
| WD | 47 | 45 | 2 | 41 | 4 |
| XD | 54 | 52 | 2 | 51 | 1 |
| **合计** | **396** | **380** | **16** | **373** | **7** |

16 场跳过（`walkover_skipped=16`）全部是 `Res` 含字面量 `WO`（对手未出场 / 退赛，
另一方记 `3`），无一例 `RET`；其中 1 场（`W.DOUBLES-----------.1516.000100--`
CHIEN Tung-Chuan/PENG Yu-Han vs CHEN Szu-Yu/WU Ying Syuan）**双方均弃权**。

另有 7 场（已落库）`Res` 是数字 `3` 但逐局比分全为 `0`——名义上 3-0、实际未开打，
例：`X.DOUBLES-----------.R32-.000400--` CHOONG Javen/LYNE Karen 3-0
Shunsuke TOGAMI/Hina HAYATA，`Splits` 为 `['0','0','0','','']`。这 7 场 `Res` 是数字，
无法与真实比赛区分，故按 `比分: "3-0"` 落库、**不写 `局分`**（无法构造合法局分）；
`ci_validate.py` 的比分/局分自洽检查允许该形态。

## 5. 实际产出规模（已导入）

| 目标文件 | 原记录 | 新增 | 现记录 |
|---|---|---|---|
| `wtt_data/ms/score-log-2026-wtt.json` | 3840 | +132 | 3972 |
| `wtt_data/ws/score-log-2026-ws.json` | 2788 | +97 | 2885 |
| `wtt_data/md/score-log-2026-wtt.json` | 834 | +54 | 888 |
| `wtt_data/wd/score-log-2026-wtt.json` | 627 | +45 | 672 |
| `wtt_data/xd/score-log-2026-wtt.json` | 616 | +52 | 668 |

合计 **+380 条**，`git diff` = 4737 行插入、0 行删除。

按比赛日（个人赛 10-20 开赛，团体 10-19 ~ 10-22 已单独导入）：

| 日期 | MS | WS | MD | WD | XD |
|---|---|---|---|---|---|
| 10-20 | 33 | 35 | – | – | 15 |
| 10-21 | 24 | 32 | 20 | 8 | 16 |
| 10-22 | – | – | 15 | 16 | 8 |
| 10-23 | 54 | 15 | 8 | 8 | 13 |
| 10-24 | 18 | 12 | 8 | 10 | – |
| 10-25 | 3 | 3 | 3 | 3 | – |

XD 于 10-23 结束（比单打/双打早 2 天），与官方赛程一致；10-25 的 3 场为各项目奖牌轮。

比分分布：MS `3-0` 71 / `3-1` 34 / `3-2` 27；WS `3-0` 60 / `3-1` 23 / `3-2` 14；
MD `3-0` 36 / `3-1` 11 / `3-2` 7；WD `3-0` 28 / `3-1` 9 / `3-2` 8；
XD `3-0` 35 / `3-1` 11 / `3-2` 6。

## 6. 五项冠军（与官方成绩页逐盘核对）

| 项目 | 金牌 | 比分 | 局分（胜者视角） |
|---|---|---|---|
| MS | Tomokazu HARIMOTO | 3-2 | vs LI Tianyang `['1-11','9-11','11-7','11-8','11-7']` |
| WS | CHEN Yi | 3-0 | vs Miwa HARIMOTO `['11-5','11-8','11-6']` |
| MD | HUANG Youzheng/LIN Shidong | 3-1 | vs WEN Ruibo/YUAN Licen `['8-11','11-7','11-5','11-6']` |
| WD | KUAI Man/WANG Yidi | 3-1 | vs Hina HAYATA/Miwa HARIMOTO `['9-11','11-8','11-9','11-8']` |
| XD | HUANG Youzheng/CHEN Yi | 3-2 | vs Sora MATSUSHIMA/Miwa HARIMOTO `['8-11','11-9','8-11','11-8','11-9']` |

以上为官方成绩页的决赛结果；落库记录的胜者、比分、逐局比分均与之一致
（`Home`/`Away` 方向本身不做归一，胜负按逐局比分判定后落到 `胜者`/`负者`）。

## 7. 验收标准与结果

| # | 标准 | 结果 |
|---|---|---|
| 1 | 数据源覆盖率：396 场个人赛全部落库或被明确跳过 | ✅ 396 = 380 落库 + 16 弃权（`walkover_skipped`），`match_unfinished = 0` |
| 2 | 每场胜负由逐局比分判定，`Res` 仅回退 | ✅ 380/380 逐局判定，`res_splits_conflict = 0` |
| 3 | `比分` 与 `局分` 自洽、无平分局、无自弈 | ✅ 373 条带局分全部自洽，0 异常（比分取值全部在 `3-0`/`3-1`/`3-2`/`4-0`/`4-1`/`4-2`/`4-3` 内） |
| 4 | 双打组合合法：两名成员、无同组合员、无跨组合重叠 | ✅ 0 异常 |
| 5 | 双打组合排序与前端 `wttNormalizeDoublesName` 完全一致 | ✅ 0 处不一致（XD 67 个组合走字母序退化，与前端退化路径一致） |
| 6 | 既有记录零改动 | ✅ `git diff --numstat` 5 个文件全部 0 行删除（4737 行纯插入） |
| 7 | `python tools/ci_validate.py` | ✅ 全部通过（WTT 含比分记录 23678 = 22974 + 289 团体 + 35 欧锦赛补录 + 380 个人赛；赛季覆盖至 2027-01-31；88 个 WTT score-log 合法） |

自检脚本：`tools/_attc_sng_verify.py`（A 文件结构 / B 记录自洽 / B2 双打组合 /
C 组合排序 / D 覆盖率 / E 五项决赛，输出 `tools/.attc_sng_verify.txt`）。
