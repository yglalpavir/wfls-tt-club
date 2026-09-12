## 目标

取消「个人数据」页（player.html）的「导出图片」功能（个人战绩卡导出）。排名页和详情页的图片导出保持不变（用户说的是"个人数据"，即 player.html 页面，nav 中对应「个人数据」入口）。

## 已确认的事实

- player.html 的导出功能全部在 `js/player-page.js` L234–435（文件末尾）：徽章预渲染、`buildPlayerExportNode`、`exportPlayerShareCard`、`renderPlayerExportButton`（动态注入 `#playerExportBtn` 按钮）。
- 该功能依赖 `common.js` 的公共导出工具（`exportDomNodeAsImage` 等），但这些工具同时被**详情页导出**和**排名表导出**使用，**不能删**。
- `pp_export_btn` / `pp_card_title` / `pp_export_fail` 三个 i18n 键只被 player-page.js 使用；`export_gen` / `img_export_fail` 还被详情页使用，需保留。
- player.html L57 加载的 html2canvas CDN 只服务于本功能；detail.html 有自己的独立 script 标签，互不影响。
- 无需改 CSS（按钮用的是通用 `.btn btn-sm btn-primary` 类）。

## 修改内容

1. **`js/player-page.js`**
   - 删除 L197 和 L225 两处 `renderPlayerExportButton();` 调用（`renderPlayerPage` 与 `reapplyPlayerPage` 内）。
   - 删除 L234–435 整段导出代码（`EXPORT_PILL_SEL`、`_expPillToImage`、`_expPrepPills`、`_expCleanupPillMarks`、`buildPlayerExportNode`、`exportPlayerShareCard`、`renderPlayerExportButton`）。

2. **`player.html`**
   - 删除 L57 的 html2canvas CDN `<script>` 标签。

3. **`js/common.js`**
   - 从 zh（L157）和 en（L255）i18n 字典中删除 `pp_export_btn`、`pp_card_title`、`pp_export_fail` 三个键（保留同行其余键）。

## 验证

- `node --check js/player-page.js` 和 `node --check js/common.js` 确认语法正确。
- grep 确认 `pp_export_btn` / `playerExportBtn` / `exportPlayerShareCard` 无残留引用。
- 本次改动不涉及 `data/` 内容，无需运行 `sync_content.py` / `ci_validate.py`。
