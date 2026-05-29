# wfls-tt-club

## 动态数据标签说明

### 新闻动态 (`news.json`)
每条新闻必须指定 `tag` 字段，可选值如下：

| tag 值 | 显示标签（中文） | 显示标签（英文） |
|--------|------------------|------------------|
| `match` | 赛事 | Match |
| `training` | 训练 | Training |
| `notice` | 公告 | Notice |
| `event` | 活动 | Event |

### 赛事信息 (`competitions.json`)
每条赛事必须指定 `tag` 字段，可选值如下：

| tag 值 | 显示标签（中文） | 显示标签（英文） |
|--------|------------------|------------------|
| `upcoming` | 即将开始 | Upcoming |
| `result` | 比赛结果 | Result |
| `live` | 进行中 | Live |

> 注意：标签区分大小写，请严格使用以上小写值。

## 快速修改指南

### 修改新闻/赛事条目
直接编辑 `news.json` 或 `competitions.json`，每条记录包含：
- `id`：唯一标识（用于详情页跳转）
- `date`：日期
- `title`：标题
- `excerpt`：摘要（可换行用 \n）
- `content`：详细正文（支持 HTML）
- `tag`：标签（新闻：match/training/notice/event；赛事：upcoming/result/live）
- `media`：附件数组，每个对象包含 `type`（image/video/file）和 `src`（路径，相对于根目录），file 类型可指定 `name`

### 资源文件夹结构
将图片、视频、文件分别放入 `Assets/images/`、`Assets/videos/`、`Assets/files/` 中，JSON 中路径需与此对应。

### 中英文切换
页面所有静态文本通过 `data-i18n` 属性控制，语言包在 `script.js` 的 `i18n` 对象中定义，可自由扩展。