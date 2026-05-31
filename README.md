```markdown
# WFLS Table Tennis Club Website

武汉外国语学校乒乓球社团官方网站

## 项目结构

wfls-tt-club/
├── index.html              # 主页（含全站搜索功能）
├── news.html               # 新闻列表页
├── competitions.html       # 赛事列表页（含PDF比赛记录）
├── members.html            # 社团骨干页面
├── ranking.html            # Ranking Beta 排名系统（多时间节点对比）
├── detail.html             # 新闻/赛事详情页（支持图片、视频、文件附件）
├── style.css               # 全局样式表
├── script.js               # JavaScript 交互逻辑
├── about.json              # 社团简介数据
├── members.json            # 社团骨干数据
├── news.json               # 新闻动态数据
├── competitions.json       # 赛事信息数据
├── ranking.json            # 排名数据（多时间节点）
├── Assets/
│   ├── images/             # 图片资源
│   ├── videos/             # 视频资源
│   └── files/              # PDF、Excel等文件资源
└── README.md               # 项目说明文档


## 技术栈

- HTML5 语义化结构
- CSS3（CSS变量主题系统 / 玻璃拟态 / Grid+Flex布局 / 响应式设计）
- 原生 JavaScript（无框架依赖）
- Google Fonts（Poppins + Noto Sans SC）
- Font Awesome 6 图标
- 中英文双语切换

## 部署方式

本项目设计为 GitHub Pages 静态部署：

```bash
git init
git add .
git commit -m "Initial commit"
git branch -M main
git remote add origin https://github.com/你的用户名/wfls-tt-club.git
git push -u origin main
```

然后在仓库 Settings > Pages 中选择 `main` 分支部署即可。

---

## 功能特性

### 核心功能
- 响应式导航栏（桌面端 + 移动端汉堡菜单）
- 玻璃拟态卡片风格（frosted glass）
- 暗色/亮色主题切换（支持本地存储记忆）
- 中英文双语切换（全站静态文本 + 动态卡片标签）
- 全站搜索功能（覆盖新闻、赛事、成员、排名，按匹配度排序）
- 平滑滚动与导航高亮（基于页面路径检测）

### 新闻系统（News）
- 新闻列表展示（主页预览 + 独立列表页）
- 新闻详情页（支持正文、图片、视频、文件附件）
- 支持 `\n` 换行和 `**加粗**` 格式
- 便捷的 JSON 数据管理

### 赛事系统（Competitions）
- 赛事列表展示（主页预览 + 独立列表页）
- 赛事详情页（支持正文、图片、视频、文件附件）
- PDF 比赛记录嵌入（延迟加载，避免自动下载）
- 支持 `\n` 换行和 `**加粗**` 格式

### 排名系统（Ranking Beta）
- 多时间节点排名切换（侧边栏选择）
- 自动对比上一时间节点排名变化
- ▲ 排名上升（绿色）/ ▼ 排名下降（红色）/ NEW 新上榜（蓝色）/ - 排名不变（灰色）
- 表头点击排序（序号、姓名、积分、变化、场次、胜率）

### 社团信息
- 社团简介卡片（数据源自 `about.json`）
- 社团骨干展示（数据源自 `members.json`，头像自动取姓氏首字）
- 二维码模态框（加入社团群）

---

## 数据文件格式说明

### `about.json` - 社团简介
```json
{
  "intro": "简介描述文字",
  "cards": [
    {
      "icon": "fa-book-open",        // Font Awesome 图标类名
      "title": "卡片标题",
      "content": "卡片内容"
    }
  ],
  "coreMembers": [
    {
      "name": "姓名",
      "role": "职务",
      "description": "描述"
    }
  ]
}
```

### `members.json` - 社团骨干
```json
[
  {
    "name": "姓名",
    "role": "职务",
    "description": "描述"
  }
]
```

### `news.json` - 新闻动态
```json
[
  {
    "id": "n1",                    // 唯一标识（推荐格式：n+数字）
    "date": "2025-01-05",          // 日期
    "title": "标题",
    "excerpt": "摘要（支持\\n换行和**加粗**）",
    "content": "正文内容（可选，不填则显示excerpt）",
    "tag": "notice",               // 标签类型
    "media": [                     // 附件（可选）
      {"type": "image", "src": "Assets/images/example.jpg"},
      {"type": "video", "src": "Assets/videos/example.mp4"},
      {"type": "file", "src": "Assets/files/example.pdf", "name": "文件名"}
    ]
  }
]
```

#### 新闻标签类型
| tag 值 | 中文标签 | 英文标签 | 说明 |
|--------|----------|----------|------|
| `match` | 赛事 | Match | 比赛相关新闻 |
| `training` | 训练 | Training | 训练相关通知 |
| `notice` | 公告 | Notice | 重要公告 |
| `event` | 活动 | Event | 社团活动 |

### `competitions.json` - 赛事信息
```json
[
  {
    "id": "c1",                    // 唯一标识（推荐格式：c+数字）
    "date": "2025-01-10",          // 日期
    "title": "标题",
    "excerpt": "摘要（支持\\n换行和**加粗**）",
    "content": "正文内容（可选）",
    "tag": "result",               // 标签类型
    "media": []                    // 附件（格式同news.json）
  }
]
```

#### 赛事标签类型
| tag 值 | 中文标签 | 英文标签 | 说明 |
|--------|----------|----------|------|
| `upcoming` | 即将开始 | Upcoming | 即将举行的比赛 |
| `result` | 比赛结果 | Result | 已结束的比赛结果 |
| `live` | 进行中 | Live | 正在进行的比赛 |

### `ranking.json` - 排名数据
```json
[
  {
    "time": "2026-05-30",          // 时间标识（用于排序）
    "label": "2026年5月30日",       // 显示标签
    "data": [
      {"姓名": "张三", "当前积分": 2100, "总场次": 15, "胜率": "73%"}
    ]
  }
]
```

> 注意：`data` 数组中球员的排列顺序即为其排名顺序，系统会自动对比相邻时间节点的排名变化。

---

## ID 命名规范

### 可接受的字符
| 字符类型 | 示例 | 推荐度 |
|----------|------|--------|
| 小写字母 | `n1`, `c2` | 强烈推荐 |
| 大写字母 | `N1`, `C2` | 推荐 |
| 数字 | `1`, `123` | 推荐 |
| 连字符 `-` | `news-1` | 推荐 |
| 下划线 `_` | `news_1` | 推荐 |

### 不可使用的字符
| 字符 | 原因 |
|------|------|
| 空格 | 破坏 URL 结构 |
| `#` `?` `&` `=` `/` | URL 特殊标记 |
| `\` `%` `+` `@` `!` `$` 等 | 可能引起解析问题 |

### 推荐命名格式
- 新闻：`n1`, `n2`, `n3`, ...
- 赛事：`c1`, `c2`, `c3`, ...

---

## 自定义修改指南

### 修改社团信息
- 编辑 `about.json`：修改社团简介卡片内容
- 编辑 `members.json`：修改社团骨干名单

### 添加新闻/赛事
- 编辑 `news.json` 或 `competitions.json`
- 在数组**开头**插入新条目（最新的显示在最前）
- 媒体文件放入对应 `Assets/` 子文件夹，路径需与 JSON 中一致

### 修改排名数据
- 编辑 `ranking.json`：添加新的时间节点对象
- 系统自动按 `time` 字段排序，最新的显示在最前

### 调整主题色
编辑 `style.css` 中 `:root` 的 CSS 变量：
```css
:root {
    --primary-blue: #007bff;    /* 主色调 */
    --primary-dark: #0056b3;    /* 深色变体 */
    --accent-red: #ff4d4f;      /* 强调色 */
}
```

### 中英文翻译
编辑 `script.js` 中 `i18n` 对象的 `zh` 和 `en` 部分，可自由扩展翻译内容。

---

## 浏览器兼容性

- Chrome 90+
- Firefox 88+
- Safari 14+
- Edge 90+
- 移动端 Safari 和 Chrome

---

## 许可证

校园社团内部使用

---

## 联系方式

武汉外国语学校乒乓球社团  
邮箱：wfls-tt@wfls.edu.cn  
训练地点：校体育馆二楼乒乓球馆
```