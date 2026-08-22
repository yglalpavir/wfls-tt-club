# 修复：女双 2026 初始积分下 TPE 协会实力分为 0

## 根因（已验证）

1. **WD 以"组合"为单位计分**——积分键是 `"A/B"` 组合名，非个人。
2. **wd 为 flat1300 模式**（`wtt_data/wd/settings.json`，baseScore=1500，无 initial-scores.json）。
   引擎的赛季初快照（`isInitial:true`, score-engine.js:329-343）只含**有继承积分**的组合；
   新组合首战时才被懒赋值 1500（score-engine.js:361-362）。
3. **数据事实**：TPE 2026 年活跃的 6 对组合全部首现于 2026（老将新配对），且 TPE 老组合均未在
   2026 出战——全站唯一"2026 活跃组合 100% 全新"的协会（IND 20/24、KOR 12/16、TPE **6/6**）。
4. **页面逻辑**：`wtaComputeListAt`（js/wtt_assoc.js:156-187）按"本赛季活跃"过滤后，TPE 只剩这
   6 对；它们不在初始快照 scoreMap 中 → 兜底为 `0`（js/wtt_assoc.js:172）→ 前五加权 = 0.00。

## 修复方案（js/wtt_assoc.js 单文件）

在 `wtaComputeListAt` 中将缺失积分兜底从固定 `0` 改为 flat1300 模式下的 `DEFAULT_INITIAL_SCORE`
（与引擎给首次出场者的赋值语义一致），initial 模式项目保持不变：

```js
const fallbackScore = (wttSettings && wttSettings.scoreMode === 'flat1300')
    ? DEFAULT_INITIAL_SCORE : 0;
// ...
.map(name => ({ name, score: (scoreMap[name] != null) ? scoreMap[name] : fallbackScore }))
```

### 效果
- TPE @2026初始 → 1500.0；明细表积分列同步显示 1500.0、全球排名 '-'
- 赛季内快照不受影响（打过球即有真实分）
- ms/ws 等 initial 模式项目行为零变化

### 明确不改
- 积分引擎（全局风险大；flat 模式无花名册，无法枚举"已注册未出场"组合）
- `wtaGlobalRankMapAt`（TOP-N 统计不应为未出场组合插入幻影排名）

## 验证
1. `node --check js/wtt_assoc.js`
2. Node vm 沙箱加载真实 wd 数据 + 真实脚本跑完整管线：
   - 断言 TPE@2026初始 = 1500.0（修复前 0.00）
   - 抽查 JPN/CHN/KOR 数值修复前后一致（仅缺分组合受兜底影响）
