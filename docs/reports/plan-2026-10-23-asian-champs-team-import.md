# 计划：WTT 模块导入亚锦赛团体（Asian Championships 2026）比赛数据

日期：2026-10-23
范围：`wtt_data/{ms,ws}`（国际乒联积分排名中心 / WTT 模块）

## 1. 目标

把 **ITTF-ATTU 亚洲乒乓球锦标赛 2026（塔什干）团体赛**的每一盘单打写入 WTT 模块。

- 赛事类型：`洲锦赛团体`（与欧锦赛团体、亚运会团体同一类型键，ms/ws 系数 0.81 已在
  `event-coefficient.json` 中就绪，i18n 键 `wtt_ev_continental_team` 已存在 ⇒ 无需新增）。
- 项目映射：男团（MT）的每盘单打 → `wtt_data/ms`；女团（WT）的每盘单打 → `wtt_data/ws`。
- 记录格式沿用 WTT 既有约定：`{日期, 类型, 胜者, 负者, 比分?, 局分?}`，
  `局分` 为**胜者视角**的每局比分（如 `["11-9","8-11","11-6"]`）。

仓库此前**没有任何亚锦赛记录**（只有 `亚运会` / `亚运会团体`，指 Asian Games），
本次是首次录入该赛事。

## 2. 数据源

ITTF 官方成绩站（Bornan 静态 JSON 接口），无需 JS 渲染：

| 路径 | 内容 |
|---|---|
| `<BASE>/<CHAMP>/champ.json` | 比赛日、项目、阶段列表 |
| `<BASE>/<CHAMP>/match/d<YYYY-MM-DD>.json` | 当日全部场次（团体 tie 带 `IsTeam: true`、`Status: 1` = 已完赛） |
| `<BASE>/<CHAMP>/match/<Key>.json` | 单场详情；团体 tie 的 `SubMatches` 即每盘单打 |

- `BASE = https://results.ittf.com/ittf-web-results/html`
- 本次届次代码 `TTE3474`（2026 亚锦赛，塔什干 Olympic Town，2026-10-19 ~ 10-25）。
- 团体赛 10-19 ~ 10-22 全部结束；10-23 起为个人赛（本次不导入，另立任务）。
- 本地缓存：`tools/.attc_raw/TTE3474/`（`champ.json`、`day-2026-10-19..23.json`、83 个 `tie-*.json`），
  抓取脚本为 `tools/import_asian_champs.py --fetch`（`--refresh` 强制重抓）。

## 3. 记录口径

团体 tie 的 `SubMatches` 固定 5 个槽位，未开打的槽位两侧 `Res` 均为 `0`、`Splits` 全空 ⇒ 跳过。

胜负与局分的判定顺序（**这是本次唯一的自定义口径**）：

1. **逐局比分优先**：由双方 `Splits[].Res` 统计胜局数，先到 3 局者胜；
2. 逐局比分不可用时才回退到 `Res`（胜局数字段）；
3. `Res` 为 `WO`（对手弃权）/ `RET`（伤退）等非数字取值的盘**整盘跳过**（写入会得到虚假的 11-0）。

清点（2026 亚锦赛团体）：83 个 tie、289 盘有效单打（ms 158 / ws 131），
另有 124 个未开打槽位、2 盘弃权/伤退被跳过。

已核实的三处数据源瑕疵（均已在导入器中处理，并写入验收记录）：

1. `SubMatches[].Home.Win` / `Splits[].Win` 恒为 `false`，**不可用于判胜负**。
2. `SubMatches` 的 `Home`/`Away` 与 tie 的 `Home`/`Away` **不对应**（例：男团半决赛
   中国 vs 中国台北，tie `Home` 是 CHN，但每盘 `Home` 都是 TPE 选手）⇒ 不能拿 tie 的队伍
   去推断某盘的胜者，只能按每盘自带的 `Desc`/`Org` 判定。
3. 全量仅 1 盘的 `Res` 与逐局比分冲突：`2026-10-21 W.TEAM...RND3.00020000`（印度 vs 马来西亚）
   第 3 盘 DAS Syndrela vs CHANG Li Sian，`Res` 记 `2-2`，逐局比分实为 **3-2 印度**
   （与该 tie 在当日赛程里的最终比分「India 3-0 Malaysia」一致，detail 里的 tie `Res` 是陈旧值）
   ⇒ 采用逐局比分结论。

姓名口径：ITTF 一律「姓 名」（`KANG Dongsoo`）。转换规则与仓库既有写法对齐：

- 汉字姓名协会（CHN / TPE / HKG / MAC / KOR / PRK / JPN / SGP）：**保留姓在前**；
- 其他协会：改为**名在前**（`PARANANG Orawan` → `Orawan PARANANG`）；多词姓按前导全大写词切分
  （`GUSTHIGHGHA WADU Maneesha Shalindi` → `Maneesha Shalindi GUSTHIGHGHA WADU`）；
- 规则判定的写法先在现有姓名表里做 exact / token（词集合）匹配，命中即用仓库写法；
  仓库里存在 680+ 组「同人异写」（WTT 各站口径不同，如 `Tomokazu HARIMOTO` 468 次 vs
  `HARIMOTO Tomokazu` 11 次），同一人的多种写法统一取**出现次数最多**的那个，
  与前端 `wttNameIdentity` 的合并口径一致；
  未命中才保留新写法（本次 47 名全新球员，全部来自 BAN/BRN/INA/IRI/IRQ/KGZ/KUW/MAC/MAS/MDV/MGL/PHI/SRI/TJK/TKM/UAE）；
- 显式身份统一（`EXTRA_NAME_MAP`）：`Ubaidullo SULTONOV` → **`Ubaydullo SULTONOV`**
  （仓库自 2023 亚运会起一直用该写法）；`YAP Rui Zhe`（马来西亚华裔）保持姓在前。

## 4. 实施步骤

1. `tools/import_asian_champs.py`：新增亚洲锦标赛导入器，复用 `import_europe_champs` 的
   姓名表、`append_records`、`build_juifen` 等基建（`tools/*` 全程 gitignored，不进版本库）。
2. 抓取 `champ.json` → 每个比赛日的 `d<date>.json` → 每个 tie 的 `<Key>.json`，全量落本地缓存。
3. 逐 tie 解析 → 每盘一条记录 → 按 `年份 + 项目` 分派到
   `wtt_data/ms/score-log-2026-wtt.json` 与 `wtt_data/ws/score-log-2026-ws.json`，纯追加。
4. 一致性校验（一次性探针 `tools/_attc_verify.py`）：
   - tie 层面：逐盘胜者数 vs 当日 `d<date>.json` 里的 tie 比分；
   - 记录层面：无自弈、`比分` 与 `局分` 自洽、局分无平分、局数 = 胜负局之和。
5. `python tools/ci_validate.py` 全绿后再提交。

## 5. 实际产出规模（已导入）

| 目标文件 | 原记录 | 新增 | 现记录 |
|---|---|---|---|
| `wtt_data/ms/score-log-2026-wtt.json` | 3682 | +158 | 3840 |
| `wtt_data/ws/score-log-2026-ws.json` | 2657 | +131 | 2788 |

按比赛日：10-19 = 154、10-20 = 59、10-21 = 40、10-22 = 36（合计 289）。
比分分布：`3-0` 168、`3-1` 69、`3-2` 52；**289 盘全部带 `局分`**（无「只有比分」的场次）。
团体名次：男团决赛 中国 3-0 韩国；女团决赛 日本 3-2 中国。

## 6. 验收标准与结果

| # | 标准 | 结果 |
|---|---|---|
| 1 | 每盘胜负由逐局比分判定，`Res` 仅回退 | ✅ 289/289 逐局判定（1 盘按逐局纠正 `Res`） |
| 2 | `比分` 与 `局分` 自洽、无平分局、无自弈 | ✅ 289/289 通过 |
| 3 | tie 比分与逐盘加总一致 | ✅ 83 个 tie 中 80 个一致（含 Home/Away 方向相反但胜者集合相同的等价情形）；2 个差异来自已跳过的弃权/伤退盘，1 个来自上述 `Res` 陈旧值 |
| 4 | 姓名映射不产生新写法重复（同人异写） | ✅ 除显式统一的 SULTONOV 外无 token 撞车；47 名新球员为首次录入 |
| 5 | `python tools/ci_validate.py` | ✅ 全部通过（JSON 解析、比分/局分自洽、类型定义、赛季覆盖至 2027-01-31、88 个 WTT score-log 合法） |
| 6 | `python tools/generate_meta.py --check` | ✅ sitemap / feed 无漂移（数据文件不进入 sitemap） |

备注：第 3 项里两个差异是「弃权/伤退盘被跳过」的必然结果，不是导入错误；如需全量还原
（把弃权盘按 3-0 记入），才会与当日 tie 比分完全对上，但那样会写入虚假的 11-0，故不做。
