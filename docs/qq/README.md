# QQ 号「武外乒乓球社团」开设方案

> 建号日期 2026-10-14 · 用途：QQ 空间日常运营（每日积分榜为主），把官网的数据资产变成同学每天想看一眼的东西
> 数据口径全部来自官网仓库真实数据（撰写时快照：46 名注册球员 · 381 场正式对局，2026-03-03 起）· 官网 https://yglalpavir.github.io/wfls-tt-club
> **这些数字天天在变**，所以它们只出现在「每次发布时重新生成」的内容里（§3 的说说草稿、§6 的每日卡片），**不进贴上去就不动的图**（头像、封面）。

---

## 1. 素材（已产出，可直接上传）

| 素材 | 文件 | 尺寸 | 说明 |
|---|---|---|---|
| 头像 · 蓝底 + WTTC（推荐） | `docs/qq/avatar-blue-wttc.html` → `.poster-preview/qq/avatar-blue-wttc.png` | 1280×1280 | 蓝色平底 `#2f7fe6` + 白徽标 + 四个拉丁大写字母 `WTTC`；加字后徽标缩到画布 68%，整组仍收在圆形安全区里 |
| 头像 · 蓝底 + WFLS TT CLUB | `docs/qq/avatar-blue-wfls.html` → `.poster-preview/qq/avatar-blue-wfls.png` | 1280×1280 | 同底色，字标换成与徽标等宽的 `WFLS TT CLUB`（12 字符）；只在头像被放大显示时看得清，40px 下字高只剩 2.3px |
| 头像 · 蓝底 · 纯徽标（次选） | `docs/qq/avatar-blue.html` → `.poster-preview/qq/avatar-blue.png` | 1280×1280 | 蓝色平底 + 纯白徽标，**不放任何文字**；徽标能放到画布 76%，小尺寸最干净 |
| 头像 · 墨底（备选） | `docs/qq/avatar-navy.html` → `.poster-preview/qq/avatar-navy.png` | 1280×1280 | 几何完全同上，底色换近黑 `#101828`，对比度最高、远处最清楚 |
| 头像 · 白底（备选） | `docs/qq/avatar-white.html` → `.poster-preview/qq/avatar-white.png` | 1280×1280 | 白底 + 品牌蓝徽标，最干净的一版；代价是夹在白色评论区里容易「化」进背景 |
| 头像 · 带社名（对照，不推荐） | `docs/qq/avatar-with-name.html` → `.poster-preview/qq/avatar-with-name.png` | 1280×1280 | 保留「武外乒乓球社团」七字，专门用来对照「图标里不排字」这条规范 |
| 头像用徽标（派生矢量） | `docs/qq/logo-mark-white.svg`、`docs/qq/logo-mark-blue.svg` | 矢量 | 加粗版徽标图形，头像引用它；来源与做法见下 |
| 选型对照页 | `docs/qq/preview.html` → `.poster-preview/qq/preview.png` | — | 六版各按 方形 / 100 / 64 / 40 / 24px 铺开，改完头像自己先验一遍小尺寸 |
| 空间封面 | `docs/qq/cover.html` → `.poster-preview/qq/cover.png` | 2560×1280 | 徽标页眉 + 衬线社名 + 口号黑底横幅 + 「空间发什么」一行 + 入群二维码；**不写任何会变的数字** |

### 头像为什么长这样（对照 icon 设计规范）

五条结论都是查了规范之后改的，不是审美偏好：

1. **图标里不排字。** Apple HIG（App icons）原文：图标中的文字「不支持无障碍与本地化、常常小到看不清、会让图标显得凌乱」，而且应用名通常就显示在旁边、重复一遍没意义。QQ 的昵称永远挂在头像旁边，「武外乒乓球社团」七个字缩到 40px 以下就是一团结块的白线 —— 对照页最后一行就是这条规范在现实里的样子。
2. **笔画必须够粗。** Material 图标规范：`Make icons graphic and bold`、`Don't use delicate, thin stroke weights`。徽标的球台外框 / 球网 / 台面线实测只有徽标宽度的 **3.83%**，按「徽标 = 画布 76%、头像 24px」算只剩 **0.67px**，等于看不见；即便 100px 也才 1.9px。所以派生徽标给每条路径都加了 `stroke-width="1"`（用户单位）：线宽变 **5.4%**，24px 时约 0.98px、40px 时 1.6px。这是规范里明确允许的 optical correction（为小尺寸做视觉补偿），形状、比例、语言一点没动。
3. **主体要收进圆形安全区。** 徽标本体是 **1.6 : 1** 的长条，外框四角到中心的距离等于其宽度的 0.588 倍；圆形裁切下要留约 10% 余量，于是徽标宽度定在画布 **76%**。群列表那种圆角方裁切里，它会显得更满一点 —— 同一张图两处都不丢主体。
4. **底是平的，没有阴影、没有圆角。** Apple 只要求「用纯色或渐变把注意力交给主体」；Google Play 图标规范写得更直接：`Shadow: None`（平台自己加阴影）、成品必须是**完整正方形**（圆角由平台按 30% 半径裁）。渐变到 24px 也看不出差别，索性用平色。
5. **要加字，就只加一个短字标。** Apple 那句「别在图标里排字」其实留了口子：原文紧接着说 *「显示一个助记符 —— 比如应用名的首字母 —— 能帮人认出你的应用」*。所以按「助记符」的规格来选：`WTTC` 四个拉丁大写字母，40px 下仍认得出字形、24px 时变成「这里有一行字」的方块；`WFLS TT CLUB` 十二个字符在 640 画布上字高只有 37px（100px 头像时 5.6px、40px 时 2.3px），只在头像被放大显示时成立。加字是有代价的：徽标要从画布 76% 缩到 **68%**，整组内容（徽标 + 字标）的四角仍留在圆形安全区内 —— 实测最大半径 0.45×画布，也就是留了 10% 余量。

### 派生徽标 SVG 的来源（改徽标时要一起重做）

`Assets/files/logo.svg` 不能直接当图标用，有两个原因：① 它的 viewBox 只框住图形，下方「WFLS TT CLUB」「武外乒乓球社团」两行的 baseline 落在 viewBox 之外；② 整枚徽标的 35 块黑路径是**实心填充**（自带的 `stroke-width:0.1` 等于没有），线宽就是上面说的 3.83%。

所以 `docs/qq/logo-mark-white.svg` / `logo-mark-blue.svg` 的生成口径是：35 条路径**原样照抄**、丢掉 `<text>` 行、viewBox 收紧到图形 bbox、父 `<g>` 上统一 `stroke-width="1"` + 圆角接头、整体着色为白或品牌蓝。**改了 `Assets/files/logo.svg` 就要照这个口径重做这两个文件**，否则头像会停在旧徽标上。

**⚠️ 别再退回「overflow 硬裁文字行」的老做法**：上一版头像用 `overflow:hidden` + 负 margin 裁掉文字行，实测把图形最左边约 **4%** 也一起裁掉了（图形真正的 bbox 左边界比原先估计的还靠左 2.6 单位），左下角那道挥拍弧线因此缺了一块；而且被裁掉的文字仍会投出自己的影子（`drop-shadow`），在容器外画出一块方形脏块。现在改用收紧 viewBox 的派生 SVG，这两个坑都不存在。

**上传规格**：QQ 头像传 1024×1024 或 1280×1280（导出即 1280；平色、无投影、无圆角，平台不会二次加工）。空间封面 1280×640 或 2560×1280 均可。

**封面只写不会变的内容**：社名、校名、口号、社团理念、空间长期发什么（每日积分榜 / 球员战绩 / 赛事对阵 / 规则问答）、官网地址、群二维码 —— 这些贴上去三年不用动。封面刻意**不写**注册球员数、对局总数、名次、赛季名：它们每天或每学期都变，印在图上就是给自己埋一个「和官网对不上」的雷；要报数字，就在每次发布的说说里现场生成（§6 的每日卡片），那样永远是当天的真值。构图上也按「安全区」办：主信息全部落在画布内缩的中央区域（左右各 56px、上下各 48px），平台按自己的比例裁切时不伤社名，二维码也留了整块白牌。

---

## 2. 昵称 / 签名 / 简介（可直接粘贴）

### 昵称

| 版本 | 昵称 | 适配 |
|---|---|---|
| **推荐** | 武外乒乓球社团 | 与官网、徽标、海报完全一致，搜一次就能对上 |
| 短版 | 武外乒乓 | 群列表里更省地方 |
| 双语版 | 武外乒乓球社团 WFLS | 只有确实需要照顾外籍/交换同学时才用 |

### 个性签名（签名有长度上限，下面每版都压在 60 字内）

**主推 · 正式**

> 挥拍逐梦，旋转青春。每一场对局都会被记录、被计算、被看见。

**副推 · 带入口**

> 挥拍逐梦，旋转青春 · 每日更新积分榜 → 官网 wfls-tt-club

**活泼版 · 招新期用**

> 球台见！🏓 积分榜每日更新，社团课 / 排位赛 / 校乒赛全年可参加。

### 空间简介（长版，写在空间资料/开号说说里）

> 武汉外国语学校乒乓球社团官方 QQ 号。
>
> 这里每天更新社团官方积分榜：46 名注册球员、381 场正式对局，每场比赛的胜负都会换算成分数，按时间衰减。
>
> 社团课、排位赛、校队联赛、校乒赛，全年可参加；友谊赛随时开，报比分入分。
>
> 完整数据在官网：排名 · 积分明细 · 对阵表 · 球员主页 · 数据可视化
> https://yglalpavir.github.io/wfls-tt-club

### 英文版（给交换生 / 官网 EN 模式对照用）

- Signature: `Striving with no regrets. Every rally is recorded, scored, and seen.`
- Bio: `Official QQ account of the WFLS Table Tennis Club. Daily ELO-style rankings, match-by-match points, season reviews, brackets and player pages — all on the club website. https://yglalpavir.github.io/wfls-tt-club`

### 群内规范

- 群名片统一「年级+姓名」（如「高二 陈某某」），不做花名
- 群公告三行：① 每场友谊赛可入分，报比分给管理层 ② 官网地址 ③ 招新/活动时间
- 不在群里发全名+成绩的对战表，避免社恐；排名讨论引导到官网

---

## 3. 第一条说说（开号，置顶）

> 【武外乒乓球社团 · 官方号上线】
>
> 从今天起，这里每天更新社团官方积分榜。
>
> 目前 46 名注册球员、381 场正式对局。每一场比赛的胜负都会换算成分数，按时间衰减实时滚动 —— 不是随便排的顺序，是打过就留下的记录。
>
> 看排名、看对手、看自己的积分曲线：
> https://yglalpavir.github.io/wfls-tt-club
>
> 想入分、约球、招新信息，往群里来 👇

配图用 `cover.png`。

---

## 4. 栏目矩阵

八个栏目，按「日更两条 / 周更一条 / 随缘一条」的量级排。带 ✅ 的是能直接从官网数据自动生成、不需要人编的。

| 栏目 | 频率 | 数据来源 | 文案模板 |
|---|---|---|---|
| ✅ **今日积分榜** | 日 | 官网排名 Top10 | `今日积分榜（10.14）：` 换行 `1 魏罗瑞 2102.4` … `本轮最大变化：任峻贤 −17.7（-1）` 换行 `完整排名 → 官网` |
| ✅ **名次变动** | 日 | 排名变化字段 | `今天上升最快的是付大卫，+7.8 分升到第 2；第 9、10 名还在等他们的第一场比赛。` |
| **赛后速递** | 有比赛就发 | 当日赛果 + 积分明细 | `【赛况】甲 2:4 乙` 换行 `赢的 +xx.x 分，输的 −xx.x 分（衰减后）。` 换行 `这场之后两人只差 xx.x 分。` —— **分数是占位符，必须换成当天真实值**（先在官网积分明细页核一遍） |
| **球员卡片** | 周 | 个人数据页 | `[本周球员] 魏罗瑞：23 场，胜率 48%。赢球不靠发球，靠第三板相持。` |
| **活动预告** | 赛前 1–2 天 | 赛程 / 社团课 | `本周四社团课排位赛，签到即入分。报名 → 群内接龙` |
| **规则科普** | 周 | 官网 Q&A | `为什么输了也会掉分？` —— 一条讲清时间衰减，附官网 Q&A 链接 |
| **彩蛋引流** | 月 | 官网隐藏页 | `官网有三个彩蛋：裁判特训题库、WTT 职业赛数据、3D 乒乓球对决。地址在上一条。` |
| **招新** | 开学季 / 缺人时 | 招新海报文案 | 用 `docs/posters/recruitment-poster-2026.md` 的现成文案，配竖版海报 |

### 每条说说的固定尾巴（三行，别每次重写）

```
—— 武外乒乓球社团 · 官方 QQ 号
排名 / 数据 / 对阵表：yglalpavir.github.io/wfls-tt-club
```

---

## 5. 发布节奏（周表）

| 时段 | 内容 | 备注 |
|---|---|---|
| 每天 22:30–23:30 | 今日积分榜（Top10 图 + 3 行文字） | 当天有比赛的加一条「赛后速递」 |
| 每天 12:30（可选） | 一句话名次变动 | 只在有人变动时才发，没变动不发 |
| 周三 | 球员卡片 | 从数据最热闹的人里挑，每周换一个 |
| 周五 | 规则科普 / 彩蛋引流 | 二选一，轮着来 |
| 周六日（赛前一天） | 活动预告 | 有比赛才发 |
| 月末 | 赛季小结 + 本月进步最快的人 | 可以直接引用官网赛季总结页数据 |

**宁少勿多**：每天 1–2 条是上限，连发 5 条会把群和访客的动态刷屏，同学反而屏蔽。

---

## 6. 每日积分榜怎么做到「每日」

现状：官网的排名由 `js/score-engine.js` 算出，`node tools/recompute_rankings.js` 能把它导出成 `data/api/rankings/current.json`（含姓名、当前积分、场次、胜率、升降、`pointsChange`），本地已验证可用。

所以「每日更新」不需要人去算，只需要人把结果**变成一张图**。推荐的下一步是加一个 `tools/qq_daily_card.js`：

- 输入 `data/api/rankings/current.json`（跑一次 `node tools/recompute_rankings.js` 就得到）
- 输出一张 1080×1350 的竖版卡片 PNG + 一段可直接粘贴的正文，写进 `.poster-preview/qq/`
- 卡片版式沿用海报房规：巨字标题 + 黑底横幅 + 冷灰蓝细线 + 不超过两块实心
- 人每天只做两件事：**校对**（数据是脚本出的，但文案语气要人味）和**粘贴上传**

QQ 空间没有开放的公开发布接口（网页端发布要带登录态 Cookie，既脆又不稳定），所以**不建议做全自动发帖**，自动化只到「生成好图和文案」为止。

工作量参考：脚本一次写完约 0.5–1 天，之后每天 3 分钟。

---

## 7. 纪律（踩过的坑都在这）

- **数字必须真**：所有积分、场次、名次只能来自官网数据，不能手写估。没有比赛的日子就发「今日无新对局，排名未变」，不要编一场球出来。
- **不点名批评**：排名榜是公开的，但配文只讲数据和故事，不写「某人今天太菜」。差距大的用「他在往前追」这种写法。
- **比分和积分对得上**：赛后速递里的分数先在官网积分明细页核一遍再发，口径是 `calcMatchPointsDual()`（按衰减后算，赢家和输家分开算）。
- **官网是唯一主源**：QQ 空间是二手传播，任何长内容都导回官网（排名页 / 个人主页 / 赛季总结），不要把整站搬进说说。
- **对外文案不出现开发者口径**：写「积分榜」，不写「ELO 引擎」「score-log」「衰减系数 0.5」。`data/`、`tools/` 这类路径一律不出现在访客可见的文案里。
- **英语模式**：官网有 EN 切换，QQ 空间没有 —— 所以对外文案统一中文，不要混排英文技术词。
- **头像和封面跟人走**：社长换人运营时，交接文档里写清楚头像源文件和导出命令，不要传一张来路不明的图。

---

## 8. 重新导出素材

改了 `docs/qq/*.html` 之后重新出图（`.poster-preview/` 已被 gitignore，产物只留本地）：

```powershell
# 先把 8767 上的旧 http.server 全部停掉再起新的（Windows 上重复绑定会让 Chrome 拿到
# net::ERR_EMPTY_RESPONSE），确认真能访问了再开始截图
Get-CimInstance Win32_Process -Filter "Name like 'python%'" |
  Where-Object { $_.CommandLine -match 'http\.server' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force }
Start-Process python -ArgumentList '-m','http.server','8767','--bind','127.0.0.1' -WorkingDirectory 'S:\wfls-tt-club\wfls-tt-club' -WindowStyle Hidden
for ($i = 0; $i -lt 25; $i++) { try { if ((Invoke-WebRequest 'http://127.0.0.1:8767/docs/qq/' -TimeoutSec 2 -UseBasicParsing).StatusCode -eq 200) { break } } catch {}; Start-Sleep -Milliseconds 300 }

$chrome = "C:\Program Files\Google\Chrome\Application\chrome.exe"
$out = "S:\wfls-tt-club\wfls-tt-club\.poster-preview\qq"
# 六个头像：文件名跟 HTML 同名；每个 run 用新的 --user-data-dir，不要复用
foreach ($n in @("blue","blue-wttc","blue-wfls","navy","white","with-name")) {
  $a = @("--headless=old","--disable-gpu","--no-sandbox","--hide-scrollbars",
         "--user-data-dir=$env:TEMP\qq-$n","--force-device-scale-factor=2",
         "--window-size=640,640","--virtual-time-budget=25000",
         "--screenshot=$out\avatar-$n.png","http://127.0.0.1:8767/docs/qq/avatar-$n.html")
  Start-Process -FilePath $chrome -ArgumentList $a -NoNewWindow -Wait
}
# 对照页：--window-size=1180,1220 → preview.png（它读的是上面六张 PNG，先出头像再出对照页）
# 封面：  --window-size=1280,640 → cover.png
# ⚠️ 别用 PowerShell 的 Get-Content/Set-Content 改这几个 HTML：它们默认编码不是 UTF-8，
#    中文注释和 alt 属性会被写坏（实测到过一次，页面直接白）。改文件用编辑器 / UTF-8 写入。
# ⚠️ 用 Start-Process -Wait，别写 `& $chrome … 2>$null`：后者可能立刻返回、一张 PNG 都不产出，
#    报错还被 2>$null 吞掉（实测踩过，当时误以为是服务没起）。
```

`--force-device-scale-factor=2` 出的是 1280×1280（画布 640）；`--virtual-time-budget` 不能省 —— Google Fonts（Noto Serif SC / Poppins）没加载完会出 fallback 字体的图（带社名那版尤其明显）。