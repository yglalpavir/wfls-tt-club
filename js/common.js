/* ========================================
   common.js - 语言包 + 全局变量 + UI + 通用函数
   ======================================== */

// localStorage 安全垫片：Safari 隐私模式 / 禁用存储时静默降级，避免语言与主题切换整体失效
const safeStorage = {
    get(key) { try { return window.localStorage.getItem(key); } catch (e) { return null; } },
    set(key, val) { try { window.localStorage.setItem(key, val); } catch (e) { /* 存储不可用时忽略 */ } },
    remove(key) { try { window.localStorage.removeItem(key); } catch (e) { /* 忽略 */ } }
};

// 注入加载动画（供 ranking.js、main.js 等使用 wtt-spinner）
(function() {
    if (document.getElementById('wtt-spinner-style')) return;
    var style = document.createElement('style');
    style.id = 'wtt-spinner-style';
    style.textContent = '@keyframes wttSpin { to { transform: rotate(360deg); } }';
    document.head.appendChild(style);
})();

// 全局搜索：为所有加载 common.js 的页面注入搜索按钮 + 遮罩层（若页面未内置）
(function ensureGlobalSearchUI() {
    if (window.__WFLS_DISABLE_SEARCH__) return;  // 页面可设置此标志以禁用注入（如 wtt_hub.html）
    if (document.getElementById('searchToggle')) return;
    // 搜索按钮：插入到 nav-actions 最前面
    var actions = document.querySelector('.nav-actions');
    var toggle = document.createElement('button');
    toggle.className = 'search-toggle';
    toggle.id = 'searchToggle';
    toggle.setAttribute('aria-label', '搜索');
    toggle.innerHTML = '<i class="fa-solid fa-magnifying-glass"></i>';
    if (actions) {
        actions.insertBefore(toggle, actions.firstChild);
    } else {
        // 无导航栏的页面（如 wtt_hub）：固定在右上角
        toggle.style.cssText = 'position:fixed;top:16px;right:16px;z-index:1200;margin-left:auto;';
        toggle.classList.add('lang-toggle', 'search-toggle-hub');
        document.body.appendChild(toggle);
    }
    // 搜索遮罩层
    var overlay = document.createElement('div');
    overlay.className = 'search-overlay';
    overlay.id = 'searchOverlay';
    overlay.innerHTML = '<div class="search-modal glass-card"><div class="search-header"><div class="search-input-wrapper"><i class="fa-solid fa-magnifying-glass search-input-icon"></i><input type="text" class="search-input" id="searchInput" placeholder="搜索..." autocomplete="off"><button class="search-clear" id="searchClear" style="display:none;"><i class="fa-solid fa-xmark"></i></button></div><button class="search-close-btn" id="searchClose"><i class="fa-solid fa-xmark"></i></button></div><div class="search-results" id="searchResults"><div class="search-placeholder"><i class="fa-solid fa-magnifying-glass"></i><p data-i18n="search_input_hint">输入关键词开始搜索</p><p class="search-hint" data-i18n="search_hint_info">支持搜索标题、内容、姓名等</p></div></div></div></div>';
    document.body.appendChild(overlay);
})();

// 通用内容区加载提示（用于 news/competitions/home 等页面）
// 返回进度更新器 { setLabel, setProgress, setMeta }；容器不可用时返回 null。
// setProgress 传数字（0-100）为确定进度，传 null 切换为不定进度（流动动画）。
function showContentLoading(containerId, msg) {
    var el = document.getElementById(containerId);
    if (!el) return null;
    // 只在容器为空或显示默认占位内容时显示加载动画
    if (el.children.length > 0 && !el.querySelector('.content-loading-placeholder')) {
        var existing = el.querySelector('.content-loading-spinner');
        if (existing) existing.remove();
        return null;
    }
    el.innerHTML = '<div class="content-loading-spinner" style="display:flex;align-items:center;justify-content:center;padding:40px 20px;color:var(--text-secondary);min-height:120px;"><div class="content-loading-box"><div class="wtt-spinner" style="width:28px;height:28px;border:3px solid var(--border-color);border-top-color:var(--accent-blue);border-radius:50%;animation:wttSpin 0.8s linear infinite;margin:0 auto 10px;"></div><p class="content-loading-label" style="font-size:0.85rem;margin:0;">' + (msg || (i18n[currentLang] || {}).content_loading || '加载中...') + '</p><div class="content-progress-track"><div class="content-progress-fill indeterminate"></div></div><p class="content-progress-meta">&nbsp;</p></div></div>';
    var root = el.querySelector('.content-loading-spinner');
    var fill = root.querySelector('.content-progress-fill');
    var labelEl = root.querySelector('.content-loading-label');
    var metaEl = root.querySelector('.content-progress-meta');
    return {
        setLabel: function (t) { if (labelEl && t) labelEl.textContent = t; },
        setMeta: function (t) { if (metaEl) metaEl.textContent = t || '\u00a0'; },
        setProgress: function (pct) {
            if (!fill) return;
            if (pct == null) {
                fill.classList.add('indeterminate');
                fill.style.width = '';
                this.setMeta('\u00a0');
                return;
            }
            fill.classList.remove('indeterminate');
            fill.style.width = Math.max(0, Math.min(100, pct)) + '%';
        }
    };
}

// 带下载进度回调的 JSON 加载：能拿到 Content-Length 时回调确定百分比，
// 否则回调 null（调用方切换为不定进度动画）。gzip/brotli 下 content-length 为压缩字节数，
// 解压后 received 可能超过它，百分比夹取到 99%，流结束后再补 100%。
async function fetchJsonWithProgress(url, onProgress) {
    var resp = await fetch(url);
    if (!resp.ok) throw new Error('HTTP ' + resp.status);
    if (!resp.body || typeof resp.body.getReader !== 'function' || typeof onProgress !== 'function') return await resp.json();
    var total = parseInt(resp.headers.get('Content-Length') || '0', 10) || 0;
    var reader = resp.body.getReader();
    var decoder = new TextDecoder('utf-8');
    var text = '', received = 0;
    for (;;) {
        var r = await reader.read();
        if (r.done) break;
        received += r.value.length;
        text += decoder.decode(r.value, { stream: true });
        onProgress(total ? Math.min(99, (received / total) * 100) : null, received, total);
    }
    text += decoder.decode();
    onProgress(100, received, total);
    return JSON.parse(text);
}

const i18n = {
    zh: {
        site_title: "武汉外国语学校乒乓球社团 | WFLS Table Tennis Club", nav_home: "Home", nav_news: "News", nav_competitions: "Competitions", nav_contact: "Contact", nav_more: "More...", nav_members: "社团骨干", nav_qa: "Q&A", lang_btn: "EN",
        hero_title: "武汉外国语学校<br><span class='hero-title-accent'>乒乓球社团</span>", hero_slogan: "挥拍逐梦，旋转青春", hero_btn_about: "了解社团 <i class='fa-solid fa-arrow-right'></i>", hero_btn_join: "加入我们 <i class='fa-solid fa-plus'></i>", scroll: "Scroll",
        side_home: "首页", side_philosophy: "社团理念", side_activities: "社团活动", side_members: "社团骨干", side_news: "最新动态", side_competitions: "赛事信息",
        philosophy_tag: "Philosophy", philosophy_title: "社团理念", philosophy_desc: "我们的核心价值观与指导思想",
        activities_tag: "Activities", activities_title: "社团活动", activities_desc: "全年性活动、社团课活动及年度大赛",
        members_tag: "Core Members", members_title: "社团骨干", members_desc: "引领社团发展的核心力量",
        news_tag: "Latest News", news_title: "最新动态", news_desc: "关注社团最新活动与公告", news_all: "查看全部动态",
        comp_tag: "Competitions", comp_title: "赛事信息", comp_desc: "近期比赛安排与成绩", comp_all: "查看全部赛事",
        contact_page_title: "联系我们 | WFLS Table Tennis Club", contact_tag: "Contact", contact_title: "加入我们", contact_desc: "扫描二维码加入社团QQ群", contact_text: "扫码加入社团QQ群，与我们一起挥拍逐梦", contact_btn: "扫描二维码加入社团群", contact_qr_title: "社团QQ群二维码", contact_qr_desc: "扫码加入社团QQ群，与我们一起挥拍逐梦",
        footer_brand: "武汉外国语学校乒乓球社团", footer_motto: "挥拍逐梦，旋转青春", footer_nav: "快速导航", footer_school: "学校信息", footer_school_name: "武汉外国语学校", footer_location: "湖北省武汉市",
        modal_title: "社团QQ群二维码", modal_desc: "扫描下方二维码加入社团QQ群", modal_note: "二维码定期更新，如有问题请联系社团管理员",
        news_page_title: "近期动态 | WFLS Table Tennis Club", news_hero_tag: "News & Updates", news_hero_title: "近期动态", news_hero_desc: "社团活动 / 训练安排 / 重要公告", news_list_tag: "All News", news_list_title: "全部动态",
        comp_page_title: "赛事信息 | WFLS Table Tennis Club", comp_hero_tag: "Competitions", comp_hero_title: "赛事信息", comp_hero_desc: "比赛安排 / 成绩记录 / 赛事回顾", comp_list_tag: "All Competitions", comp_list_title: "全部赛事",
        members_page_title: "社团骨干 | WFLS Table Tennis Club",
        rank_page_title: "Ranking Beta | WFLS Table Tennis Club", rank_hero_desc: "社团积分排名系统 · 支持多时间节点对比 · 点击姓名查看积分明细", rank_tag: "Data Table", rank_title: "积分数据表", rank_sort_hint: "当前排序：", rank_sidebar_title: "时间节点", rank_qa_btn: "积分计算规则",
        rank_col_rank: "#", rank_col_name: "姓名", rank_col_points: "当前积分", rank_col_points_change: "积分变化", rank_col_change: "排名变化", rank_col_matches: "总场次", rank_col_winrate: "胜率",
        rank_export_btn: "导出图片", rank_export_gen: "生成于", rank_export_fail: "图片导出失败，请重试",
        rank_export_menu_all: "导出全部", rank_export_menu_top12: "导出前12名", rank_export_top_sub: "前{n}名", rank_export_topn_prefix: "导出前", rank_export_topn_suffix: "名", rank_export_menu_go: "导出", rank_export_menu_invalid: "请输入有效的名次（正整数）",
        score_detail_title: "积分明细", score_col_date: "日期", score_col_type: "类型", score_col_opponent: "对手", score_col_result: "结果", score_col_score_before: "赛前积分", score_col_change: "积分变动", score_col_score_after: "赛后积分", score_result_win: "胜", score_result_loss: "负",
        tag_match: "赛事", tag_training: "训练", tag_notice: "公告", tag_event: "活动", tag_daily: "日常", tag_upcoming: "即将开始", tag_result: "比赛结果", tag_live: "进行中",
        filter_all: "全部",
        detail_page_title: "详情 | WFLS Table Tennis Club", detail_back: "返回列表", detail_version_updated: "更新于 {date}", detail_version_list: "历史版本", detail_version_view: "查看", detail_version_viewing: "正在查看 v{version}（更新于 {date}）", detail_version_back: "返回 v{version}", pdf_preview_btn: "预览PDF", pdf_download_btn: "下载PDF", detail_loading: "内容加载中…", detail_not_found: "未找到内容", detail_load_fail: "加载失败，请稍后重试", detail_load_fail_hint: "内容可能已被移除，或网络出现异常。", detail_retry: "重试",
        search_placeholder: "搜索新闻、赛事、成员、排名、更新日志...", search_no_results: "未找到相关结果", search_type_news: "新闻", search_type_competition: "赛事", search_type_member: "成员", search_type_ranking: "排名", search_type_qa: "问答", search_type_changelog: "更新日志",
        qa_page_title: "常见问题 | WFLS Table Tennis Club", qa_hero_tag: "Q&A", qa_hero_title: "常见问题", qa_hero_desc: "加入社团 / 活动安排 / 积分系统 / 比赛报名", qa_list_tag: "All Q&A", qa_list_title: "全部问答",
        pagination_prev: "上一页", pagination_next: "下一页", pagination_info: "第 {current} 页，共 {total} 页",
        data_viz_page_title: "数据可视化 | WFLS Table Tennis Club", data_viz_tag: "Data Visualization", data_viz_title: "数据可视化", data_viz_desc: "积分趋势 · 排名变化 · 球员对比",
        data_viz_points_trend: "积分趋势", data_viz_rank_stream: "排名变化河流图", data_viz_player_compare: "球员对比", data_viz_select_players: "选择球员（最多8人）", data_viz_select_player_a: "球员 A", data_viz_select_player_b: "球员 B", data_viz_apply: "应用", data_viz_top_n: "显示前", data_viz_head_to_head: "历史交手记录",
        data_viz_recent: "最近", data_viz_data_points: "个数据点", data_viz_top_n_suffix: "名球员", data_viz_compare_btn: "对比", data_viz_compare_placeholder: "选择两名球员进行对比分析", data_viz_no_players: "暂无球员数据", data_viz_alert_select_one: "请至少选择一名球员", data_viz_alert_max: "最多选择15名球员", data_viz_alert_two: "请选择两名球员", data_viz_alert_diff: "请选择不同的球员", data_viz_select_player_ph: "-- 选择球员 --", data_viz_win: "胜", data_viz_total_h2h: "总交手: {n} 场", data_viz_recent_match: "最近: {date} (胜者: {winner})", data_viz_pts_change: "{player} 积分变动", data_viz_no_h2h: "暂无交手记录", data_viz_col_date: "日期", data_viz_col_type: "类型", data_viz_col_winner: "胜者", data_viz_axis_points: "积分", data_viz_axis_rank: "排名", data_viz_rank_suffix: "第{n}名", data_viz_topn_select_title: "填写1-20的任意正整数", data_viz_cur_score: "当前积分", data_viz_h2h_rate: "交手胜率", data_viz_pred_rate: "预测胜率", data_viz_prepare: "准备下载数据文件...", data_viz_topn_title: "显示最近N个数据点", data_viz_stream_title: "显示最近N个数据点", data_viz_loading: "加载数据中...", data_viz_downloading: "正在下载 {label} ({i}/{total}): {file}", data_viz_calculating: "正在计算排名积分...", data_viz_load_fail: "❌ 排名数据加载失败，请刷新页面重试", data_viz_file_players: "球员档案", data_viz_file_matches: "比赛记录", data_viz_file_initial: "初始积分", data_viz_file_event: "赛事系数", data_viz_file_decay: "衰减配置", data_viz_file_season: "赛季配置", data_viz_no_player_list: "❌ 无法获取球员列表",
        data_viz_race_title: "排名动态竞速 Top 15", data_viz_race_play: "播放", data_viz_race_pause: "暂停", data_viz_race_speed: "速度", data_viz_race_hint: "拖动滑块或播放，查看排名随时间变化",
        data_viz_record_title: "战绩统计", data_viz_efficiency_title: "场次×积分效率", data_viz_heatmap_title: "交手热力矩阵", data_viz_freq_title: "比赛频次时间轴", data_viz_dist_title: "积分区间分布", data_viz_loss: "负", data_viz_total: "总场次", data_viz_winrate: "胜率", data_viz_form: "状态分", data_viz_pts_norm: "积分", data_viz_bucket_week: "按周", data_viz_bucket_month: "按月", data_viz_bins: "分档数", data_viz_no_data: "暂无数据", data_viz_heatmap_cell: "{winner} 对 {loser} 胜 {n} 场", data_viz_heatmap_hint: "行球员对列球员的胜场 · 颜色越深胜场越多", data_viz_axis_matches: "场次", data_viz_axis_players: "球员", data_viz_axis_count: "人数", data_viz_bucket_label: "时间粒度", data_viz_other: "其他",
        data_viz_heatmap_mode: "显示模式", data_viz_heatmap_mode_wins: "胜场数", data_viz_heatmap_mode_rate: "胜率", data_viz_heatmap_cell_rate: "{winner} 对 {loser} 胜率 {r}%（{n} 场）", data_viz_heatmap_hint_rate: "行球员对列球员的交手胜率 · 蓝色越深胜率越高，红色越深胜率越低",
        season_initial_label: "{season}初始积分", score_type_bonus: "比赛结果加分",
        personal_stats_page_title: "个人数据 | WFLS Table Tennis Club", personal_stats_tag: "Personal Stats", personal_stats_title: "个人数据", personal_stats_desc: "个人比赛数据统计", personal_stats_filter_label: "按标签筛选", personal_stats_search_label: "搜索球员", personal_stats_search_ph: "搜索球员姓名 / 编号 / 标签（支持拼音）", personal_stats_placeholder: "位球员，选择一名查看个人数据页", personal_stats_no_tags: "暂无标签数据", personal_stats_tag_count: "{n}人", personal_stats_player_count: "{shown} / {total}", personal_stats_player_count_total: "{total}", personal_stats_no_match: "未找到匹配球员", personal_stats_no_data: "暂无比赛数据", personal_stats_load_fail: "数据加载失败，请刷新重试",
        pp_back_index: "返回总览", pp_prev_player: "上一名", pp_next_player: "下一名", pp_no_player: "未找到该球员", pp_all_records: "全部比赛记录", pp_player_id: "球员编号", pp_search_ph: "搜索球员姓名 / 编号 / 标签", pp_total_players: "共 {n} 名球员", pp_role: "职务", pp_match_detail: "积分明细", pp_view_profile: "查看个人数据页",
        pp_loading: "正在加载球员数据...", pp_load_fail: "数据加载失败，请刷新重试", pp_refresh: "刷新页面", pp_status_active: "在校", pp_status_alumni: "已离校", pp_matches_count: "{n} 场", pp_col_before: "赛前", pp_col_change: "调整", pp_col_after: "赛后", pp_tags_label: "标签", pp_honors_label: "荣誉",
        pa_section_title: "深度数据分析", pa_rank_title: "排名走势", pa_type_title: "赛事类型分布", pa_gap_title: "实力差胜负分析", pa_monthly_title: "月度活跃度", pa_form_title: "竞技状态", pa_season_title: "赛季对比", pa_source_title: "积分来源构成",
        pa_rank_axis: "排名", pa_no_rank: "暂无排名数据", pa_no_matches: "暂无对局数据", pa_monthly_matches: "场次数", pa_monthly_winrate: "胜率", pa_type_center_unit: "场", pa_type_wr: "胜率 {r}%",
        pa_gap_self_strong: "我方强", pa_gap_self_slight: "我方略强", pa_gap_opp_strong: "对手强", pa_gap_opp_slight: "对手略强", pa_gap_wins: "胜场", pa_gap_losses: "负场", pa_gap_wr: "胜率 {r}%", pa_gap_hint: "按双方赛前分差分档：对手赛前分 − 我方赛前分，数值越大对手越强",
        pa_form_now_w: "当前 {n} 连胜", pa_form_now_l: "当前 {n} 连败", pa_form_max_w: "最长连胜", pa_form_max_l: "最长连败", pa_form_last10: "近 10 场", pa_form_rolling: "滚动 10 场胜率", pa_form_overall: "生涯胜率",
        pa_season_col: "赛季", pa_season_matches: "场次", pa_season_wl: "胜负", pa_season_rate: "胜率", pa_season_net: "积分变化", pa_season_peak: "最高分", pa_season_total: "总计", pa_season_hint: "积分变化 = 该赛季末积分 − 赛季初积分（含比赛结果加分，不含跨赛季继承调整）",
        pa_source_axis: "累计积分变化", pa_source_baseline: "赛季基准分", pa_source_initial: "初始分", pa_source_inherit: "赛季继承", pa_source_total: "总积分", pa_source_hint: "按赛事类型分解的当季积分构成，堆叠总和即积分变化曲线（含时间衰减与赛季继承）",
        rank_realtime_header: "实时积分", rank_realtime_label: "实时积分",
        search_input_hint: "输入关键词搜索", search_hint_title: "输入关键词开始搜索", search_hint_info: "支持搜索标题、内容、姓名等",
        search_rank_tpl: "排名：{rank} | 胜率：{rate}",
        content_loading: "加载中...", loading_about: "加载社团信息...", loading_members: "加载成员数据...", loading_news: "加载动态...", loading_competitions: "加载赛事...",
        chart_matches_suffix: " 场", chart_axis_ym_tpl: "{y}年{m}月",
        dv_fullscreen: "全屏显示 (网页内)", dv_zoom_out: "缩小", dv_zoom_in: "放大", dv_zoom_fit: "适应内容", dv_zoom_reset: "重置视图",
        rank_no_data: "暂无排名数据", rank_no_records: "暂无记录", rank_add_short: "加分", rank_ppl: "{n}人", rank_node_count: "{n}个节点",
        rank_loading: "正在加载排名数据...", rank_prepare: "准备下载数据文件...", rank_download_file: "正在下载 {label} ({i}/{total}): {file}", rank_calculating: "正在计算排名积分（此过程可能较慢，请耐心等待）...", rank_calc_fail: "无法计算排名数据",
        rank_view_player_page: "查看个人数据页", rank_click_detail: "点击查看积分明细",
        rank_season_expired: "当前日期已超出最后一个赛季（{date}）：新比赛会暂计入该赛季的延伸区间，但不会触发跨赛季积分继承。请在 data/seasons.json 中创建新赛季。",
        changelog_page_title: "更新日志 | WFLS Table Tennis Club", changelog_hero_tag: "Changelog", changelog_hero_title: "更新日志", changelog_hero_desc: "版本历史 · 功能更新 · 问题修复", changelog_list_tag: "Version History", changelog_list_title: "版本历史", changelog_empty: "暂无更新日志",
        tag_release: "正式发布", tag_feature: "新功能", tag_fix: "修复",
        draws_tab_content: "赛事详情", draws_tab_bracket: "对阵表",
        wtt_hero_desc: "WTT 排名查询 · 点击姓名查看积分明细", wtt_dataviz_title: "WTT 数据可视化", wtt_dataviz_btn: "查看 WTT 数据可视化", wtt_personal_title: "WTT 个人数据", wtt_personal_btn: "查看 WTT 个人数据", wtt_table_title: "WTT 积分数据表", wtt_loading: "正在加载 WTT 数据...", wtt_click_detail: "点击查看积分明细", wtt_error_fail: "WTT排名数据加载失败，请刷新页面重试",
        wtt_back_hub: "返回 WTT Hub",
        sort_desc: "降序", sort_asc: "升序",
        wtt_file_matches: "比赛记录", wtt_file_initial: "初始积分", wtt_file_event: "赛事系数", wtt_file_season: "赛季配置",
        wtt_prepare: "准备下载数据文件...", wtt_downloading: "正在下载 {label} ({i}/{total}): {file}", wtt_calculating: "正在计算排名积分...", wtt_snapshot: "快照 {current}/{total}", wtt_elapsed: "已用时 {s}s",
        wtt_default_season: "默认赛季", wtt_node_count: "{n}个节点", wtt_ppl: "{n}人",
        wtt_no_records: "暂无记录", wtt_no_data: "暂无排名数据", wtt_cant_compute: "无法计算WTT排名数据", wtt_bonus: "加分",
        wtt_no_players: "暂无球员数据", wtt_select_player: "-- 选择球员 --", wtt_compare_btn: "对比", wtt_compare_placeholder: "选择两名球员进行对比分析",
        wtt_alert_select_one: "请至少选择一名球员", wtt_alert_max: "最多选择15名球员", wtt_alert_two: "请选择两名球员", wtt_alert_diff: "请选择不同的球员",
        wtt_axis_points: "积分", wtt_axis_rank: "排名", wtt_rank_suffix: "第{n}名",
        wtt_cur_score: "当前积分", wtt_h2h_rate: "交手胜率", wtt_pred_rate: "预测胜率", wtt_total_h2h: "总交手: {n} 场", wtt_wins: "{player} {n} 胜", wtt_recent: "最近: {date} (胜者: {winner})", wtt_winner: "胜者", wtt_pts_change: "{player} 积分变动", wtt_no_h2h: "暂无交手记录",
        wtt_recent_label: "最近", wtt_data_points: "个数据点", wtt_players: "名球员", wtt_player_a: "球员 A", wtt_player_b: "球员 B", wtt_select_players: "选择球员（最多8人）", wtt_top_n: "显示前",
        wtt_race_title: "排名动态竞速 Top 20", wtt_race_play: "播放", wtt_race_pause: "暂停", wtt_race_speed: "速度", wtt_race_hint: "拖动滑块或播放，查看排名随时间变化",
        wtt_record_title: "战绩统计", wtt_efficiency_title: "场次×积分效率", wtt_heatmap_title: "交手热力矩阵", wtt_freq_title: "比赛频次时间轴", wtt_dist_title: "积分区间分布", wtt_loss: "负", wtt_total: "总场次", wtt_winrate: "胜率", wtt_form: "状态分", wtt_pts_norm: "积分", wtt_bucket_week: "按周", wtt_bucket_month: "按月", wtt_bins: "分档数", wtt_no_data: "暂无数据", wtt_heatmap_cell: "{winner} 对 {loser} 胜 {n} 场", wtt_heatmap_hint: "行球员对列球员的胜场 · 颜色越深胜场越多", wtt_axis_matches: "场次", wtt_axis_players: "球员", wtt_axis_count: "人数", wtt_bucket_label: "时间粒度", wtt_other: "其他",
        wtt_heatmap_mode: "显示模式", wtt_heatmap_mode_wins: "胜场数", wtt_heatmap_mode_rate: "胜率", wtt_heatmap_cell_rate: "{winner} 对 {loser} 胜率 {r}%（{n} 场）", wtt_heatmap_hint_rate: "行球员对列球员的交手胜率 · 蓝色越深胜率越高，红色越深胜率越低",
        wtt_ps_hero_title: "WTT 个人比赛数据统计", wtt_ps_title: "WTT 个人数据", wtt_ps_label: "选择球员", wtt_ps_search_ph: "搜索球员名称...", wtt_ps_view: "查看数据", wtt_ps_placeholder: "选择一名球员查看个人数据", wtt_ps_nomatch: "无匹配球员", wtt_ps_nodata: "暂无比赛数据", wtt_ps_load_more: "显示更多",
        wtt_ov_total: "总场次", wtt_ov_wins: "获胜", wtt_ov_losses: "失利", wtt_ov_percentile: "胜率", wtt_ov_current: "当前积分", wtt_ov_max: "最高积分", wtt_ov_bestrank: "最高排名",
        wtt_ps_sum1: "{player}共进行了{total}盘比赛，获胜{wins}盘，失利{losses}盘。", wtt_ps_sum2: "{player}的胜率为{percent}%。",
        wtt_ps_trend: "积分变化趋势", wtt_ps_day: "按天", wtt_ps_week: "按周", wtt_ps_snapshot: "快照",
        wtt_victory_card: "胜利 · 曾战胜的前三名", wtt_pk_card: "PK · 曾交手的前三名", wtt_lucky_card: "拿捏", wtt_nemesis_card: "克星", wtt_empty: "暂无", wtt_sub_wl: "{wins}胜{losses}负 胜率:{rate}%", wtt_tooltip_points: "积分: {score}", wtt_tooltip_rank: "| 排名:#{rank}", wtt_ps_alert: "请选择一名球员",
        wtt_pp_open: "打开个人页", wtt_pp_back: "返回个人数据", wtt_pp_hero: "WTT 球员个人数据页", wtt_pp_loading: "正在加载球员数据...", wtt_pp_no_player: "未找到该球员", wtt_pp_load_fail: "数据加载失败，请刷新重试", wtt_pp_refresh: "刷新页面", wtt_pp_view_records: "查看全部比赛记录", wtt_pp_assoc: "协会籍",
        wtt_assoc_trend_title: "协会积分趋势", wtt_assoc_top5_title: "协会前五球员", wtt_select_assocs: "选择协会（最多8个）", wtt_assoc_strength_axis: "协会实力分", wtt_assoc_rank_n: "第{n}名", wtt_assoc_players_count: "{n} 名球员", wtt_assocs: "个协会", wtt_alert_select_assoc: "请至少选择一个协会", wtt_alert_max_assoc: "最多选择8个协会", wtt_date_range: "日期范围", wtt_date_to: "至",
        wtt_hub_sub_a: "基于乒乓球社团积分规则的 WTT 国际乒联积分排名模拟系统。", wtt_hub_sub_b: "选择下方项目查看对应积分排名、数据可视化和个人数据。", wtt_hub_back: "返回社团 Ranking", wtt_hub_credit: "数据仅供娱乐 · 非官方 WTT 排名 · © 2026 WFLS Table Tennis Club",
        wtt_status_check: "检测中...", wtt_status_ready: "数据已就绪", wtt_status_template: "待填充数据", wtt_status_empty: "暂无数据", wtt_link_rank: "排名", wtt_link_dataviz: "数据可视化", wtt_link_personal: "个人数据", wtt_link_assoc: "协会数据",
        wtt_hub_cat_tag: "Categories", wtt_hub_cat_title: "选择项目", wtt_hub_cat_desc: "点击卡片查看对应项目的排名、数据可视化、个人数据与协会数据",
        wtt_assoc_desc: "协会实力总榜 · 排名变迁 · 协会对抗", wtt_assoc_overview_title: "数据概览", wtt_assoc_stat_assocs: "收录协会", wtt_assoc_stat_players: "登记球员", wtt_assoc_stat_countries: "国家/地区", wtt_assoc_stat_leader: "当前领跑",
        wtt_assoc_rank_title: "协会实力总榜", wtt_assoc_rank_desc: "按前五加权实力分排序，点击行查看协会球员明细",
        wtt_assoc_snapshot_label: "时点", wtt_assoc_col_name: "协会", wtt_assoc_col_strength: "实力分", wtt_assoc_col_trend: "较上期", wtt_assoc_col_players: "球员数", wtt_assoc_col_leader: "领军球员", wtt_assoc_col_in_top: "TOP{n}",
        wtt_assoc_sq_points: "积分", wtt_assoc_sq_matches: "场次", wtt_assoc_sq_winrate: "胜率", wtt_assoc_sq_global_rank: "全球排名", wtt_assoc_sq_empty: "该协会暂无有积分的登记球员",
        wtt_assoc_bump_title: "协会排名变迁", wtt_assoc_bump_desc: "各协会按实力分的位次随时间的变化",
        wtt_assoc_matrix_title: "协会对抗矩阵", wtt_assoc_matrix_hint: "行协会对列协会的历史交手胜率（仅统计跨协会对阵）· 颜色越深胜率越高", wtt_assoc_matrix_size: "矩阵规模", wtt_assoc_matrix_cell: "{a} 对 {b} 胜率 {r}%（{n} 场）",
        wtt_assoc_no_data_hint: "当前项目无协会籍数据（缺少 assoc.json），协会栏目不可用",
        wtt_cat_ms: "男子单打", wtt_cat_ws: "女子单打", wtt_cat_md: "男子双打", wtt_cat_wd: "女子双打", wtt_cat_xd: "混合双打"
    },
    en: {
        site_title: "WFLS Table Tennis Club | Wuhan Foreign Languages School", nav_home: "Home", nav_news: "News", nav_competitions: "Competitions", nav_contact: "Contact", nav_more: "More...", nav_members: "Core Members", nav_qa: "Q&A", lang_btn: "中文",
        hero_title: "Wuhan Foreign Languages School<br><span class='hero-title-accent'>Table Tennis Club</span>", hero_slogan: "Swing for dreams, spin for youth", hero_btn_about: "About Us <i class='fa-solid fa-arrow-right'></i>", hero_btn_join: "Join Us <i class='fa-solid fa-plus'></i>", scroll: "Scroll",
        side_home: "Home", side_philosophy: "Philosophy", side_activities: "Activities", side_members: "Members", side_news: "News", side_competitions: "Competitions",
        philosophy_tag: "Philosophy", philosophy_title: "Philosophy", philosophy_desc: "Our core values and guiding principles",
        activities_tag: "Activities", activities_title: "Activities", activities_desc: "Year-round activities, club class activities and annual tournaments",
        members_tag: "Core Members", members_title: "Core Members", members_desc: "The driving force behind the club",
        news_tag: "Latest News", news_title: "Latest News", news_desc: "Stay updated with club activities and announcements", news_all: "View All News",
        comp_tag: "Competitions", comp_title: "Competitions", comp_desc: "Upcoming matches and results", comp_all: "View All Competitions",
        contact_page_title: "Contact | WFLS Table Tennis Club", contact_tag: "Contact", contact_title: "Join Us", contact_desc: "Scan the QR code to join the club QQ group and receive notifications", contact_text: "Scan to join the club QQ group and swing with us", contact_btn: "Scan QR Code to Join", contact_qr_title: "Club QQ Group QR Code", contact_qr_desc: "Scan to join the club QQ group and swing with us",
        footer_brand: "WFLS Table Tennis Club", footer_motto: "Swing for dreams, spin for youth", footer_nav: "Quick Links", footer_school: "School Info", footer_school_name: "Wuhan Foreign Languages School", footer_location: "Wuhan, Hubei, China",
        modal_title: "Club QQ Group QR Code", modal_desc: "Scan the QR code below to join the club QQ group", modal_note: "QR code updates periodically.",
        news_page_title: "News | WFLS Table Tennis Club", news_hero_tag: "News & Updates", news_hero_title: "News", news_hero_desc: "Activities / Training / Announcements", news_list_tag: "All News", news_list_title: "All News",
        comp_page_title: "Competitions | WFLS Table Tennis Club", comp_hero_tag: "Competitions", comp_hero_title: "Competitions", comp_hero_desc: "Schedule / Results / Review", comp_list_tag: "All Competitions", comp_list_title: "All Competitions",
        members_page_title: "Core Members | WFLS Table Tennis Club",
        rank_page_title: "Ranking Beta | WFLS Table Tennis Club", rank_hero_desc: "Club ranking system · Auto-calculated · Season inheritance", rank_tag: "Data Table", rank_title: "Points Table", rank_sort_hint: "Current sorting: ", rank_sidebar_title: "Time Periods", rank_qa_btn: "Scoring Rules",
        rank_col_rank: "#", rank_col_name: "Name", rank_col_points: "Points", rank_col_points_change: "Score Δ", rank_col_change: "Rank Δ", rank_col_matches: "Matches", rank_col_winrate: "Win Rate",
        rank_export_btn: "Save Image", rank_export_gen: "Generated", rank_export_fail: "Image export failed. Please try again.",
        rank_export_menu_all: "Export All", rank_export_menu_top12: "Export Top 12", rank_export_top_sub: "Top {n}", rank_export_topn_prefix: "Top", rank_export_topn_suffix: "", rank_export_menu_go: "Export", rank_export_menu_invalid: "Please enter a valid rank (positive integer)",
        score_detail_title: "Score Details", score_col_date: "Date", score_col_type: "Type", score_col_opponent: "Opponent", score_col_result: "Result", score_col_score_before: "Before", score_col_change: "Change", score_col_score_after: "After", score_result_win: "Win", score_result_loss: "Loss",
        tag_match: "Match", tag_training: "Training", tag_notice: "Notice", tag_event: "Event", tag_daily: "Daily", tag_upcoming: "Upcoming", tag_result: "Result", tag_live: "Live",
        filter_all: "All",
        detail_page_title: "Details | WFLS Table Tennis Club", detail_back: "Back to List", detail_version_updated: "Updated {date}", detail_version_list: "Version History", detail_version_view: "View", detail_version_viewing: "Viewing v{version} (updated {date})", detail_version_back: "Back to v{version}", pdf_preview_btn: "Preview PDF", pdf_download_btn: "Download PDF", detail_loading: "Loading content…", detail_not_found: "Content not found", detail_load_fail: "Failed to load. Please try again.", detail_load_fail_hint: "The content may have been removed, or a network error occurred.", detail_retry: "Retry",
        search_placeholder: "Search news, competitions, members, rankings, changelog...", search_no_results: "No results found", search_type_news: "News", search_type_competition: "Competition", search_type_member: "Member", search_type_ranking: "Ranking", search_type_qa: "Q&A", search_type_changelog: "Changelog",
        qa_page_title: "Q&A | WFLS Table Tennis Club", qa_hero_tag: "Q&A", qa_hero_title: "Q&A", qa_hero_desc: "Join / Schedule / Ranking / Registration", qa_list_tag: "All Q&A", qa_list_title: "All Q&A",
        pagination_prev: "Previous", pagination_next: "Next", pagination_info: "Page {current} of {total}",
        data_viz_page_title: "Data Visualization | WFLS Table Tennis Club", data_viz_tag: "Data Visualization", data_viz_title: "Data Visualization", data_viz_desc: "Points Trend · Rank Flow · Player Compare",
        data_viz_points_trend: "Points Trend", data_viz_rank_stream: "Rank Flow", data_viz_player_compare: "Player Comparison", data_viz_select_players: "Select Players (max 8)", data_viz_select_player_a: "Player A", data_viz_select_player_b: "Player B", data_viz_apply: "Apply", data_viz_top_n: "Top", data_viz_head_to_head: "Head to Head",
        data_viz_recent: "Recent", data_viz_data_points: "data points", data_viz_top_n_suffix: "players", data_viz_compare_btn: "Compare", data_viz_compare_placeholder: "Select two players to compare", data_viz_no_players: "No players yet", data_viz_alert_select_one: "Please select at least one player", data_viz_alert_max: "Maximum of 15 players", data_viz_alert_two: "Please select two players", data_viz_alert_diff: "Please select two different players", data_viz_select_player_ph: "-- Select Player --", data_viz_win: "wins", data_viz_total_h2h: "Total H2H: {n} matches", data_viz_recent_match: "Recent: {date} (Winner: {winner})", data_viz_pts_change: "{player} point change", data_viz_no_h2h: "No head-to-head records", data_viz_col_date: "Date", data_viz_col_type: "Type", data_viz_col_winner: "Winner", data_viz_axis_points: "Points", data_viz_axis_rank: "Rank", data_viz_rank_suffix: "Rank #{n}", data_viz_topn_select_title: "Enter any positive integer from 1 to 20", data_viz_cur_score: "Current Points", data_viz_h2h_rate: "H2H Win Rate", data_viz_pred_rate: "Predicted Win Rate", data_viz_prepare: "Preparing data files...", data_viz_topn_title: "Show recent N data points", data_viz_stream_title: "Show recent N data points", data_viz_loading: "Loading data...", data_viz_downloading: "Downloading {label} ({i}/{total}): {file}", data_viz_calculating: "Calculating rankings...", data_viz_load_fail: "❌ Failed to load ranking data. Please refresh and try again.", data_viz_file_players: "Players", data_viz_file_matches: "Match Records", data_viz_file_initial: "Initial Scores", data_viz_file_event: "Event Coefficients", data_viz_file_decay: "Decay Config", data_viz_file_season: "Season Config", data_viz_no_player_list: "❌ Could not fetch player list",
        data_viz_record_title: "Match Records", data_viz_efficiency_title: "Matches × Points", data_viz_heatmap_title: "Head-to-Head Matrix", data_viz_freq_title: "Match Frequency Timeline", data_viz_dist_title: "Score Distribution", data_viz_loss: "Losses", data_viz_total: "Matches", data_viz_winrate: "Win Rate", data_viz_form: "Form", data_viz_pts_norm: "Points", data_viz_bucket_week: "Weekly", data_viz_bucket_month: "Monthly", data_viz_bins: "Bins", data_viz_no_data: "No data", data_viz_heatmap_cell: "{winner} beats {loser} {n} times", data_viz_heatmap_hint: "Row player wins vs column player · darker = more wins", data_viz_axis_matches: "Matches", data_viz_axis_players: "Players", data_viz_axis_count: "Players", data_viz_bucket_label: "Granularity", data_viz_other: "Other",
        data_viz_race_title: "Bar Chart Race Top 15", data_viz_race_play: "Play", data_viz_race_pause: "Pause", data_viz_race_speed: "Speed", data_viz_race_hint: "Drag the slider or press play to see the top 15 evolve",
        data_viz_heatmap_mode: "Display Mode", data_viz_heatmap_mode_wins: "Win Counts", data_viz_heatmap_mode_rate: "Win Rate", data_viz_heatmap_cell_rate: "{winner} vs {loser}: win rate {r}% ({n} matches)", data_viz_heatmap_hint_rate: "Row player win rate vs column player · bluer = higher rate, redder = lower",
        season_initial_label: "{season} Initial Scores", score_type_bonus: "Bonus Points",
        personal_stats_page_title: "Personal Stats | WFLS Table Tennis Club", personal_stats_tag: "Personal Stats", personal_stats_title: "Personal Stats", personal_stats_desc: "Personal Match Statistics", personal_stats_filter_label: "Filter by Tags", personal_stats_search_label: "Search Players", personal_stats_search_ph: "Search by name / ID / tag (pinyin supported)", personal_stats_placeholder: "players total, select to view personal stats", personal_stats_no_tags: "No tags available", personal_stats_tag_count: "{n} players", personal_stats_player_count: "{shown} / {total}", personal_stats_player_count_total: "{total}", personal_stats_no_match: "No matching players", personal_stats_no_data: "No match data yet", personal_stats_load_fail: "Failed to load data. Please refresh and try again.",
        pp_back_index: "Back to Overview", pp_prev_player: "Previous", pp_next_player: "Next", pp_no_player: "Player not found", pp_all_records: "All Match Records", pp_player_id: "Player ID", pp_search_ph: "Search by name / ID / tag", pp_total_players: "{n} players total", pp_role: "Role", pp_match_detail: "Score Details", pp_view_profile: "View Personal Page",
        pp_loading: "Loading player data...", pp_load_fail: "Failed to load data. Please refresh and try again.", pp_refresh: "Refresh", pp_status_active: "Active", pp_status_alumni: "Alumni", pp_matches_count: "{n} matches", pp_col_before: "Before", pp_col_change: "Change", pp_col_after: "After", pp_tags_label: "Tags", pp_honors_label: "Honors",
        pa_section_title: "Deep Analytics", pa_rank_title: "Rank Trend", pa_type_title: "Event Type Mix", pa_gap_title: "Results by Rating Gap", pa_monthly_title: "Monthly Activity", pa_form_title: "Current Form", pa_season_title: "Season Comparison", pa_source_title: "Score Sources",
        pa_rank_axis: "Rank", pa_no_rank: "No ranking data", pa_no_matches: "No match data", pa_monthly_matches: "Matches", pa_monthly_winrate: "Win rate", pa_type_center_unit: "games", pa_type_wr: "Win rate {r}%",
        pa_gap_self_strong: "Favorite", pa_gap_self_slight: "Slight favorite", pa_gap_opp_strong: "Underdog", pa_gap_opp_slight: "Slight underdog", pa_gap_wins: "Wins", pa_gap_losses: "Losses", pa_gap_wr: "Win rate {r}%", pa_gap_hint: "Banded by pre-match rating gap (opponent − player); the larger the value, the stronger the opponent",
        pa_form_now_w: "{n}-match win streak", pa_form_now_l: "{n}-match losing streak", pa_form_max_w: "Best win streak", pa_form_max_l: "Worst losing streak", pa_form_last10: "Last 10", pa_form_rolling: "Rolling 10-match win rate", pa_form_overall: "Career win rate",
        pa_season_col: "Season", pa_season_matches: "Matches", pa_season_wl: "W-L", pa_season_rate: "Win rate", pa_season_net: "Points change", pa_season_peak: "Peak", pa_season_total: "Total", pa_season_hint: "Points change = season-end score − season-start score (incl. bonus points, excl. cross-season carryover)",
        pa_source_axis: "Cumulative points change", pa_source_baseline: "Season baseline", pa_source_initial: "Initial", pa_source_inherit: "Season carryover", pa_source_total: "Total", pa_source_hint: "Score composition by event type — the stacked total equals the score trend (with decay and season carryover)",
        rank_realtime_header: "Real-time", rank_realtime_label: "Live Ranking",
        search_input_hint: "Type keywords to search", search_hint_title: "Start typing to search", search_hint_info: "Searches titles, content and player names",
        search_rank_tpl: "Rank {rank} | Win rate {rate}",
        content_loading: "Loading...", loading_about: "Loading club info...", loading_members: "Loading members...", loading_news: "Loading news...", loading_competitions: "Loading competitions...",
        chart_matches_suffix: " matches", chart_axis_ym_tpl: "{m}/{y}",
        dv_fullscreen: "Fullscreen (in page)", dv_zoom_out: "Zoom out", dv_zoom_in: "Zoom in", dv_zoom_fit: "Fit content", dv_zoom_reset: "Reset view",
        rank_no_data: "No ranking data", rank_no_records: "No records", rank_add_short: "Bonus", rank_ppl: "{n} players", rank_node_count: "{n} nodes",
        rank_loading: "Loading ranking data...", rank_prepare: "Preparing to download data files...", rank_download_file: "Downloading {label} ({i}/{total}): {file}", rank_calculating: "Calculating ranking points (this may take a while)...", rank_calc_fail: "Unable to compute ranking data",
        rank_view_player_page: "View personal page", rank_click_detail: "Click for score details",
        rank_season_expired: "Today is past the last season ({date}): new matches are counted into that season's extension, but cross-season inheritance will not apply. Create a new season in data/seasons.json.",
        changelog_page_title: "Changelog | WFLS Table Tennis Club", changelog_hero_tag: "Changelog", changelog_hero_title: "Changelog", changelog_hero_desc: "Version History · Features · Bug Fixes", changelog_list_tag: "Version History", changelog_list_title: "Version History", changelog_empty: "No changelog entries yet",
        tag_release: "Release", tag_feature: "Feature", tag_fix: "Fix",
        draws_tab_content: "Details", draws_tab_bracket: "Bracket",
        wtt_hero_desc: "WTT Rankings · Click a name for score details", wtt_dataviz_title: "WTT Data Visualization", wtt_dataviz_btn: "View WTT Data Visualization", wtt_personal_title: "WTT Personal Stats", wtt_personal_btn: "View WTT Personal Stats", wtt_table_title: "WTT Points Table", wtt_loading: "Loading WTT data...", wtt_click_detail: "Click for score details", wtt_error_fail: "Failed to load WTT rankings. Please refresh and try again.",
        wtt_back_hub: "Back to WTT Hub",
        sort_desc: "Descending", sort_asc: "Ascending",
        wtt_file_matches: "Match Records", wtt_file_initial: "Initial Scores", wtt_file_event: "Event Coefficients", wtt_file_season: "Season Config",
        wtt_prepare: "Preparing data files...", wtt_downloading: "Downloading {label} ({i}/{total}): {file}", wtt_calculating: "Calculating rankings...", wtt_snapshot: "Snapshot {current}/{total}", wtt_elapsed: "Elapsed {s}s",
        wtt_default_season: "Default Season", wtt_node_count: "{n} nodes", wtt_ppl: "{n} players",
        wtt_no_records: "No records", wtt_no_data: "No ranking data", wtt_cant_compute: "Could not compute WTT rankings", wtt_bonus: "Bonus",
        wtt_no_players: "No player data", wtt_select_player: "-- Select Player --", wtt_compare_btn: "Compare", wtt_compare_placeholder: "Select two players to compare",
        wtt_alert_select_one: "Please select at least one player", wtt_alert_max: "Maximum of 15 players", wtt_alert_two: "Please select two players", wtt_alert_diff: "Please select two different players",
        wtt_axis_points: "Points", wtt_axis_rank: "Rank", wtt_rank_suffix: "Rank #{n}",
        wtt_cur_score: "Current Points", wtt_h2h_rate: "Head-to-head Win Rate", wtt_pred_rate: "Predicted Win Rate", wtt_total_h2h: "Head-to-head: {n} matches", wtt_wins: "{player} {n} wins", wtt_recent: "Recent: {date} (Winner: {winner})", wtt_winner: "Winner", wtt_pts_change: "{player} point change", wtt_no_h2h: "No head-to-head records",
        wtt_recent_label: "Recent", wtt_data_points: "data points", wtt_players: "players", wtt_player_a: "Player A", wtt_player_b: "Player B", wtt_select_players: "Select Players (max 8)", wtt_top_n: "Top",
        wtt_race_title: "Bar Chart Race Top 20", wtt_race_play: "Play", wtt_race_pause: "Pause", wtt_race_speed: "Speed", wtt_race_hint: "Drag the slider or press play to see the top 20 evolve",
        wtt_record_title: "Match Records", wtt_efficiency_title: "Matches × Points", wtt_heatmap_title: "Head-to-Head Matrix", wtt_freq_title: "Match Frequency Timeline", wtt_dist_title: "Score Distribution", wtt_loss: "Losses", wtt_total: "Matches", wtt_winrate: "Win Rate", wtt_form: "Form", wtt_pts_norm: "Points", wtt_bucket_week: "Weekly", wtt_bucket_month: "Monthly", wtt_bins: "Bins", wtt_no_data: "No data", wtt_heatmap_cell: "{winner} beats {loser} {n} times", wtt_heatmap_hint: "Row player wins vs column player · darker = more wins", wtt_axis_matches: "Matches", wtt_axis_players: "Players", wtt_axis_count: "Players", wtt_bucket_label: "Granularity", wtt_other: "Other",
        wtt_heatmap_mode: "Display Mode", wtt_heatmap_mode_wins: "Win Counts", wtt_heatmap_mode_rate: "Win Rate", wtt_heatmap_cell_rate: "{winner} vs {loser}: win rate {r}% ({n} matches)", wtt_heatmap_hint_rate: "Row player win rate vs column player · bluer = higher rate, redder = lower",
        wtt_ps_hero_title: "WTT Personal Match Statistics", wtt_ps_title: "WTT Personal Stats", wtt_ps_label: "Select Player", wtt_ps_search_ph: "Search player name...", wtt_ps_view: "View Data", wtt_ps_placeholder: "Select a player to view personal data", wtt_ps_nomatch: "No matching players", wtt_ps_nodata: "No match data", wtt_ps_load_more: "Show More",
        wtt_ov_total: "Matches", wtt_ov_wins: "Wins", wtt_ov_losses: "Losses", wtt_ov_percentile: "Win Rate", wtt_ov_current: "Current Points", wtt_ov_max: "Peak Points", wtt_ov_bestrank: "Best Rank",
        wtt_ps_sum1: "{player} has played {total} matches, winning {wins} and losing {losses}.", wtt_ps_sum2: "{player}'s win rate is {percent}%.",
        wtt_ps_trend: "Points Trend", wtt_ps_day: "By Day", wtt_ps_week: "By Week", wtt_ps_snapshot: "Snapshots",
        wtt_victory_card: "Victories · Top 3 Beaten", wtt_pk_card: "Head-to-Head · Top 3 Opponents", wtt_lucky_card: "Favorite Opponents", wtt_nemesis_card: "Nemesis", wtt_empty: "None", wtt_sub_wl: "{wins}W {losses}L Win Rate: {rate}%", wtt_tooltip_points: "Points: {score}", wtt_tooltip_rank: "| Rank: #{rank}", wtt_ps_alert: "Please select a player",
        wtt_pp_open: "Open Player Page", wtt_pp_back: "Back to Personal Stats", wtt_pp_hero: "WTT Player Personal Page", wtt_pp_loading: "Loading player data...", wtt_pp_no_player: "Player not found", wtt_pp_load_fail: "Failed to load data. Please refresh and try again.", wtt_pp_refresh: "Refresh", wtt_pp_view_records: "View All Match Records", wtt_pp_assoc: "Association",
        wtt_assoc_trend_title: "Association Points Trend", wtt_assoc_top5_title: "Association Top 5", wtt_select_assocs: "Select Associations (max 8)", wtt_assoc_strength_axis: "Strength Score", wtt_assoc_rank_n: "No.{n}", wtt_assoc_players_count: "{n} players", wtt_assocs: "associations", wtt_alert_select_assoc: "Please select at least one association", wtt_alert_max_assoc: "Maximum of 8 associations", wtt_date_range: "Date Range", wtt_date_to: "to",
        wtt_hub_sub_a: "A WTT ranking simulation based on the WFLS TT Club scoring system.", wtt_hub_sub_b: "Select a category below for rankings, visualizations, and personal stats.", wtt_hub_back: "Back to Club Ranking", wtt_hub_credit: "For entertainment only · Not official WTT rankings · © 2026 WFLS Table Tennis Club",
        wtt_status_check: "Checking...", wtt_status_ready: "Data Ready", wtt_status_template: "Template Data", wtt_status_empty: "No Data", wtt_link_rank: "Ranking", wtt_link_dataviz: "Data Viz", wtt_link_personal: "Personal Stats", wtt_link_assoc: "Associations",
        wtt_hub_cat_tag: "Categories", wtt_hub_cat_title: "Select an Event", wtt_hub_cat_desc: "Click a card to explore rankings, visualizations, personal stats, and association data for each event",
        wtt_assoc_desc: "Association Standings · Rank Movement · Head-to-Head Matrix", wtt_assoc_overview_title: "Overview", wtt_assoc_stat_assocs: "Associations", wtt_assoc_stat_players: "Registered Players", wtt_assoc_stat_countries: "Countries/Regions", wtt_assoc_stat_leader: "Current Leader",
        wtt_assoc_rank_title: "Association Strength Ranking", wtt_assoc_rank_desc: "Sorted by top-5 weighted strength score · click a row to view the squad",
        wtt_assoc_snapshot_label: "Snapshot", wtt_assoc_col_name: "Association", wtt_assoc_col_strength: "Strength", wtt_assoc_col_trend: "vs Prev.", wtt_assoc_col_players: "Players", wtt_assoc_col_leader: "Top Player", wtt_assoc_col_in_top: "TOP{n}",
        wtt_assoc_sq_points: "Points", wtt_assoc_sq_matches: "Matches", wtt_assoc_sq_winrate: "Win Rate", wtt_assoc_sq_global_rank: "Global Rank", wtt_assoc_sq_empty: "No scored players registered for this association",
        wtt_assoc_bump_title: "Rank Movement", wtt_assoc_bump_desc: "How association positions by strength score change over time",
        wtt_assoc_matrix_title: "Head-to-Head Matrix", wtt_assoc_matrix_hint: "Row association win rate vs column association (cross-assoc matches only) · darker = higher", wtt_assoc_matrix_size: "Matrix size", wtt_assoc_matrix_cell: "{a} vs {b}: win rate {r}% ({n} matches)",
        wtt_assoc_no_data_hint: "No association data for this category (missing assoc.json)",
        wtt_cat_ms: "Men's Singles", wtt_cat_ws: "Women's Singles", wtt_cat_md: "Men's Doubles", wtt_cat_wd: "Women's Doubles", wtt_cat_xd: "Mixed Doubles"
    }
};

let currentLang = 'zh';
let newsData = [], competitionsData = [], qaData = [], changelogData = [], aboutData = null, membersData = [], scoreLogData = [], drawsData = [];
let rankingTimeline = [], currentTimeIndex = 0, currentDisplayData = [];
let currentSortKey = '当前积分', currentSortDir = 'desc', dataLoaded = false;
let newsCurrentPage = 1, competitionsCurrentPage = 1, qaCurrentPage = 1;
let newsFilterTag = 'all', competitionsFilterTag = 'all';
const ITEMS_PER_PAGE = 10;
let initialScoresData = null, eventCoefficients = null, seasonsData = null, playerTagsData = null, decayConfig = null;
// ===== 统一球员档案（data/players.json）=====
let playersData = null;          // { version, baseDate, players: [...] }
let uidIndex = {};               // uid(String) -> player
let nameIndex = {};              // 姓名/别名 -> player
const SCORE_FLOOR = 1200, HALF_LIFE_DAYS = 180;
let DEFAULT_INITIAL_SCORE = 1300;  // 可配置的默认初始分（WTT settings.json 中的 baseScore 可覆盖）
let SCORE_TIME_DECAY_ENABLED = true;  // 赛季内时间衰减开关（WTT 关闭）
let LOSER_POINT_MULTIPLIER = 0.8;     // 负者扣分系数（WTT 设为 1.0，即负者扣分=胜者得分）
// ===== 类型刷新·定格衰减配置 =====
const FREEZE_ON_REPEAT = true;   // 类型第二次出现时，前一批次锁死停止衰减
const BATCH_GROUP_DAYS = 0;      // 同类型日期聚簇阈值（0 = 严格同日聚簇）

const hamburger = document.getElementById('hamburger'), navMenu = document.getElementById('navMenu'), navbar = document.getElementById('navbar');
const themeToggle = document.getElementById('themeToggle'), langToggle = document.getElementById('langToggle');
const searchToggle = document.getElementById('searchToggle'), searchOverlay = document.getElementById('searchOverlay'), searchInput = document.getElementById('searchInput'), searchClear = document.getElementById('searchClear'), searchClose = document.getElementById('searchClose'), searchResults = document.getElementById('searchResults');
const modalOverlay = document.getElementById('modalOverlay'), modalClose = document.getElementById('modalClose'), qrTrigger = document.getElementById('qrTrigger');
const scoreDetailModal = document.getElementById('scoreDetailModal'), scoreDetailClose = document.getElementById('scoreDetailClose'), scoreDetailTitle = document.getElementById('scoreDetailTitle'), scoreDetailBody = document.getElementById('scoreDetailBody');
const body = document.body;

function setLanguage(lang) {
    currentLang = lang; safeStorage.set('wfls-lang.v1', lang);
    document.documentElement.lang = lang === 'zh' ? 'zh-CN' : 'en';
    document.querySelectorAll('[data-i18n]').forEach(el => { const key = el.getAttribute('data-i18n'); if (i18n[lang] && i18n[lang][key] != null) el.innerHTML = i18n[lang][key]; });
    document.querySelectorAll('[data-i18n-title]').forEach(el => { const key = el.getAttribute('data-i18n-title'); if (i18n[lang] && i18n[lang][key]) el.title = i18n[lang][key]; });
    if (langToggle) langToggle.querySelector('span').textContent = lang === 'zh' ? 'EN' : '中文';
    if (searchInput) searchInput.placeholder = i18n[lang].search_placeholder;
    const _ovInput = document.querySelector('#searchOverlay .search-input');
    if (_ovInput) _ovInput.placeholder = i18n[lang].search_placeholder;
    if (typeof renderAllNews === 'function') renderAllNews();
    if (typeof renderAllCompetitions === 'function') renderAllCompetitions();
    if (typeof renderAllQa === 'function') renderAllQa();
    if (typeof renderAllChangelog === 'function') renderAllChangelog();
    if (aboutData && typeof renderAboutSections === 'function') { renderAboutSections(); updateHeroLastUpdated(); }
    if (membersData.length > 0 && typeof renderCoreMembers === 'function') { renderCoreMembers(); if (typeof renderAllMembersPage === 'function') renderAllMembersPage(); }
    if (typeof updateRankingHeaders === 'function') updateRankingHeaders();
    if (typeof updatePdfButtons === 'function') updatePdfButtons();
    if (dataLoaded && typeof updateDetailPage === 'function') updateDetailPage();
    if (typeof wttReapplyI18n === 'function') wttReapplyI18n();
    if (typeof dataVizReapplyI18n === 'function') dataVizReapplyI18n();
    if (typeof reapplyPlayerPage === 'function') reapplyPlayerPage();
    if (typeof reapplyPersonalStats === 'function') reapplyPersonalStats();
}
async function updateHeroLastUpdated() { const el = document.getElementById('heroLastUpdated'); if (!el) return; const cached = safeStorage.get('wfls-last-updated'); if (cached) { try { const cd = JSON.parse(cached); if (cd.date && (Date.now() - cd.ts) < 3600000) { el.textContent = currentLang === 'zh' ? `上次更新：${cd.date}` : `Last updated: ${cd.date}`; return; } } catch(e) {} } try { const res = await fetch('https://api.github.com/repos/yglalpavir/wfls-tt-club/commits?per_page=1'); if (res.ok) { const commits = await res.json(); if (commits && commits.length > 0) { const d = new Date(commits[0].commit.committer.date); const ds = d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0'); safeStorage.set('wfls-last-updated', JSON.stringify({ date: ds, ts: Date.now() })); el.textContent = currentLang === 'zh' ? `上次更新：${ds}` : `Last updated: ${ds}`; return; } } } catch(e) { console.warn('GitHub API failed, fallback to about.json'); } if (aboutData && aboutData.lastUpdated) { el.textContent = currentLang === 'zh' ? `上次更新：${aboutData.lastUpdated}` : `Last updated: ${aboutData.lastUpdated}`; } }
function updateRankingHeaders() { document.querySelectorAll('.ranking-table-full th[data-i18n]').forEach(th => { const key = th.getAttribute('data-i18n'); if (i18n[currentLang] && i18n[currentLang][key]) th.innerHTML = i18n[currentLang][key] + ' <span class="sort-arrow"></span>'; }); }

/* 时间线节点标签渲染时解析（替代计算期固化的字符串，语言切换即时生效） */
const NODE_MONTHS_EN = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
function formatNodeDate(ds) {
    if (!ds) return '';
    const p = String(ds).split('-');
    if (p.length < 3 || isNaN(+p[0])) return String(ds);
    if (currentLang === 'en') return `${NODE_MONTHS_EN[+p[1] - 1] || p[1]} ${+p[2]}, ${p[0]}`;
    return `${p[0]}年${+p[1]}月${+p[2]}日`;
}
function getNodeDisplayLabel(n) {
    if (!n) return '';
    if (typeof n === 'string') return n;
    const L = i18n[currentLang] || {};
    if (n.isRealtime) return L.rank_realtime_label || n.label || '';
    if (n.isInitial) return (L.season_initial_label || '{season}初始积分').replace('{season}', n.season || '');
    return formatNodeDate(n.time) || n.label || '';
}
function updatePdfButtons() { const btn = document.getElementById('pdfViewBtn'); if (btn) btn.innerHTML = `<i class="fa-solid fa-eye"></i> ${i18n[currentLang].pdf_preview_btn}`; const down = document.querySelector('.pdf-actions .btn-primary'); if (down) down.innerHTML = `<i class="fa-solid fa-download"></i> ${i18n[currentLang].pdf_download_btn}`; }

/* ---- 积分数据表导出为图片（Canvas 手绘，无外部依赖，全平台可用） ---- */
function _rankImgRoundRect(ctx, x, y, w, h, r) { ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); }
function _rankImgDataUrlToBlob(dataurl) {
    const parts = dataurl.split(','); const mime = (parts[0].match(/:(.*?);/) || [])[1] || 'image/png';
    const bin = atob(parts[1]); const arr = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
    return new Blob([arr], { type: mime });
}
function _downloadRankImageBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
}
function buildExportFileName(base) {
    const d = new Date(); const p = n => String(n).padStart(2, '0');
    return `${base}-${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}.png`;
}
function buildRankTableImageCanvas(rows, opts) {
    opts = opts || {};
    const cs = getComputedStyle(document.body);
    const v = n => (cs.getPropertyValue(n) || '').trim();
    const C = {
        bg: v('--bg-white') || '#ffffff',
        headBg: v('--primary-pale') || '#e6f2ff',
        accent: v('--primary-blue') || '#007bff',
        text: v('--text-primary') || '#1a1a2e',
        sub: v('--text-secondary') || '#4a5568',
        muted: v('--text-muted') || '#8899aa',
        border: v('--border-color') || '#e2e8f0',
        up: v('--accent-green') || '#52c41a',
        down: v('--accent-red') || '#ff6b6b',
        gold: v('--accent-gold') || '#f0a500', silver: '#8899aa', bronze: '#b87351'
    };
    const L = i18n[currentLang];
    const FONT = "'Poppins','Noto Sans SC','Microsoft YaHei',sans-serif";
    const changeCell = (p, valKey, typeKey, dec) => {
        const t = p[typeKey];
        if (t === 'up') return { text: '▲' + Math.abs(p[valKey]).toFixed(dec), color: C.up, weight: 700 };
        if (t === 'down') return { text: '▼' + Math.abs(p[valKey]).toFixed(dec), color: C.down, weight: 700 };
        if (t === 'new') return { text: 'NEW', color: C.accent, weight: 600 };
        return { text: '-', color: C.muted, weight: 400 };
    };
    const cols = [
        { align: 'center', minW: 40, cell: (p, i) => ({ text: String(i + 1), color: i === 0 ? C.gold : i === 1 ? C.silver : i === 2 ? C.bronze : C.sub, weight: i < 3 ? 700 : 500 }) },
        { label: L.rank_col_name, align: 'left', minW: 88, cell: p => ({ text: String(p['姓名'] || '-'), color: C.text, weight: 600 }) },
        { label: L.rank_col_points, align: 'right', minW: 78, cell: p => ({ text: (p['当前积分'] || 0).toFixed(1), color: C.text, weight: 700 }) },
        { label: L.rank_col_points_change, align: 'center', minW: 76, cell: p => changeCell(p, 'pointsChange', 'pointsChangeType', 1) },
        { label: L.rank_col_change, align: 'center', minW: 68, cell: p => changeCell(p, 'change', 'changeType', 0) },
        { label: L.rank_col_matches, align: 'center', minW: 62, cell: p => ({ text: String(p['总场次'] || 0), color: C.text }) },
        { label: L.rank_col_winrate, align: 'center', minW: 58, cell: p => { const wr = p['胜率'] || '0%'; return { text: (wr === '#DIV/0!' || wr === '-') ? '0%' : String(wr), color: C.text }; } }
    ];

    const measure = document.createElement('canvas').getContext('2d');
    const fontOf = w => `${w} 13px ${FONT}`;
    const padX = 14, inset = 10;
    const widths = cols.map(c => {
        measure.font = `600 12px ${FONT}`;
        return Math.max(c.minW, Math.ceil(measure.measureText(c.label || '#').width) + padX * 2);
    });
    rows.forEach((p, i) => cols.forEach((c, j) => {
        const cell = c.cell(p, i);
        measure.font = fontOf(cell.weight || 400);
        widths[j] = Math.max(widths[j], Math.ceil(measure.measureText(cell.text).width) + padX * 2);
    }));
    const W = widths.reduce((a, b) => a + b, 0);
    const pad = 26, titleH = 28, subH = 22, theadH = 38, rowH = 36, footH = 42;
    const H = pad + titleH + subH + 14 + theadH + rowH * rows.length + footH + 8;

    const scale = Math.min(3, Math.max(2, window.devicePixelRatio || 2));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(W * scale); canvas.height = Math.round(H * scale);
    const ctx = canvas.getContext('2d');
    ctx.scale(scale, scale);

    _rankImgRoundRect(ctx, 0.5, 0.5, W - 1, H - 1, 16);
    ctx.fillStyle = C.bg; ctx.fill();
    ctx.strokeStyle = C.border; ctx.lineWidth = 1; ctx.stroke();

    let y = pad;
    ctx.textBaseline = 'middle';
    ctx.font = `700 19px ${FONT}`; ctx.fillStyle = C.accent; ctx.textAlign = 'left';
    ctx.fillText(opts.title || L.rank_title || '', inset + 6, y + titleH / 2);
    ctx.font = `600 12px ${FONT}`; ctx.fillStyle = C.muted; ctx.textAlign = 'right';
    ctx.fillText(opts.brand || 'WFLS TT Club', W - inset - 6, y + titleH / 2);
    y += titleH;

    ctx.font = `400 12px ${FONT}`; ctx.fillStyle = C.sub; ctx.textAlign = 'left';
    ctx.fillText(opts.subtitle || '', inset + 6, y + subH / 2 - 2);
    y += subH;

    ctx.strokeStyle = C.border;
    ctx.beginPath(); ctx.moveTo(inset + 4, y + 7); ctx.lineTo(W - inset - 4, y + 7); ctx.stroke();
    y += 14;

    const tableX = 0, tableW = W;
    ctx.fillStyle = C.headBg;
    ctx.fillRect(tableX, y, tableW, theadH);
    cols.forEach((c, j) => {
        const x0 = widths.slice(0, j).reduce((a, b) => a + b, 0);
        ctx.font = `600 12px ${FONT}`; ctx.fillStyle = C.accent;
        const cx = c.align === 'left' ? x0 + inset : c.align === 'right' ? x0 + widths[j] - inset : x0 + widths[j] / 2;
        ctx.textAlign = c.align === 'left' ? 'left' : c.align === 'right' ? 'right' : 'center';
        ctx.fillText(c.label || '#', cx, y + theadH / 2);
    });
    y += theadH;

    rows.forEach((p, i) => {
        if (i % 2 === 1) { ctx.fillStyle = 'rgba(128,128,128,0.05)'; ctx.fillRect(tableX, y, tableW, rowH); }
        cols.forEach((c, j) => {
            const x0 = widths.slice(0, j).reduce((a, b) => a + b, 0);
            const cell = c.cell(p, i);
            ctx.font = fontOf(cell.weight || 400); ctx.fillStyle = cell.color || C.text;
            const cx = c.align === 'left' ? x0 + inset : c.align === 'right' ? x0 + widths[j] - inset : x0 + widths[j] / 2;
            ctx.textAlign = c.align === 'left' ? 'left' : c.align === 'right' ? 'right' : 'center';
            ctx.fillText(cell.text, cx, y + rowH / 2);
        });
        ctx.strokeStyle = C.border; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(0, y + rowH + 0.5); ctx.lineTo(W, y + rowH + 0.5); ctx.stroke();
        y += rowH;
    });

    y += 12;
    const d = new Date(); const pd = n => String(n).padStart(2, '0');
    const stamp = `${d.getFullYear()}-${pd(d.getMonth() + 1)}-${pd(d.getDate())} ${pd(d.getHours())}:${pd(d.getMinutes())}`;
    ctx.font = `400 11px ${FONT}`; ctx.fillStyle = C.muted; ctx.textAlign = 'right';
    ctx.fillText(`${opts.brand || 'WFLS TT Club'} · ${L.rank_export_gen} ${stamp}`, W - inset - 6, y + footH / 2 - 10);

    return canvas;
}
function exportRankTableAsImage(rows, opts) {
    try {
        const canvas = buildRankTableImageCanvas(rows, opts);
        const blob = _rankImgDataUrlToBlob(canvas.toDataURL('image/png'));
        const name = buildExportFileName(opts.filenameBase || 'points-table');
        _downloadRankImageBlob(blob, name);
    } catch (err) {
        console.error('导出图片失败', err);
        alert(i18n[currentLang].rank_export_fail);
    }
}
/* 为主导出按钮附加"全部 / 前12名 / 前N名"下拉菜单（doExport(limit)，limit 为 null 表示全部） */
function attachRankExportMenu(btn, doExport) {
    if (!btn || btn._exportMenuAttached) return;
    btn._exportMenuAttached = true;
    const L = i18n[currentLang] || {};
    const wrap = document.createElement('div');
    wrap.className = 'export-split';
    btn.parentNode.insertBefore(wrap, btn);
    wrap.appendChild(btn);

    const toggle = document.createElement('button');
    toggle.type = 'button';
    toggle.className = 'table-export-btn export-menu-toggle';
    toggle.setAttribute('aria-haspopup', 'true');
    toggle.setAttribute('aria-expanded', 'false');
    toggle.title = L.rank_export_btn || '';
    toggle.innerHTML = '<i class="fa-solid fa-chevron-down" aria-hidden="true"></i>';
    wrap.appendChild(toggle);

    const menu = document.createElement('div');
    menu.className = 'export-menu';
    menu.hidden = true;
    menu.innerHTML = `
        <button type="button" class="export-menu-item" data-export-limit="all" data-i18n="rank_export_menu_all">${L.rank_export_menu_all || '导出全部'}</button>
        <button type="button" class="export-menu-item" data-export-limit="12" data-i18n="rank_export_menu_top12">${L.rank_export_menu_top12 || '导出前12名'}</button>
        <div class="export-menu-custom">
            <span class="export-menu-label"><span data-i18n="rank_export_topn_prefix">${L.rank_export_topn_prefix || '导出前'}</span><input type="number" class="export-menu-input" min="1" step="1" placeholder="N" aria-label="N"><span data-i18n="rank_export_topn_suffix">${L.rank_export_topn_suffix || '名'}</span></span>
            <button type="button" class="export-menu-item export-menu-go" data-export-limit="custom" data-i18n="rank_export_menu_go">${L.rank_export_menu_go || '导出'}</button>
        </div>`;
    wrap.appendChild(menu);

    const input = menu.querySelector('.export-menu-input');
    const setOpen = open => { menu.hidden = !open; toggle.setAttribute('aria-expanded', open ? 'true' : 'false'); if (open) setTimeout(() => input.focus(), 0); };
    toggle.addEventListener('click', e => { e.stopPropagation(); setOpen(menu.hidden); });
    menu.addEventListener('click', e => e.stopPropagation());
    document.addEventListener('click', () => setOpen(false));
    document.addEventListener('keydown', e => { if (e.key === 'Escape' && !menu.hidden) setOpen(false); });

    const exportWith = limit => { setOpen(false); doExport(limit); };
    menu.querySelectorAll('.export-menu-item').forEach(item => {
        item.addEventListener('click', () => {
            const mode = item.getAttribute('data-export-limit');
            if (mode === 'custom') {
                const n = Math.floor(Number(input.value));
                if (!input.value.trim() || !Number.isFinite(n) || n < 1) { alert(i18n[currentLang].rank_export_menu_invalid); input.focus(); return; }
                exportWith(n);
            } else if (mode === 'all') exportWith(null);
            else exportWith(parseInt(mode, 10));
        });
    });
    input.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); menu.querySelector('.export-menu-go').click(); } });
}

if (langToggle) { const sl = safeStorage.get('wfls-lang.v1') || safeStorage.get('wfls-lang') || 'zh'; setLanguage(sl); langToggle.addEventListener('click', () => setLanguage(currentLang === 'zh' ? 'en' : 'zh')); }

function initSearch() {
    if (!searchToggle || !searchOverlay || !searchInput) return;
    searchToggle.addEventListener('click', () => { searchOverlay.classList.add('active'); body.style.overflow = 'hidden'; setTimeout(() => searchInput.focus(), 300); });
    function cs() { searchOverlay.classList.remove('active'); body.style.overflow = ''; searchInput.value = ''; searchClear.style.display = 'none'; showSearchPlaceholder(); }
    searchClose.addEventListener('click', cs); searchOverlay.addEventListener('click', e => { if (e.target === searchOverlay) cs(); });
    document.addEventListener('keydown', e => { if (e.key === 'Escape' && searchOverlay && searchOverlay.classList.contains('active')) cs(); });
    let dt; searchInput.addEventListener('input', () => { const q = searchInput.value.trim(); if (q.length > 0) searchClear.style.display = 'flex'; else { searchClear.style.display = 'none'; showSearchPlaceholder(); return; } clearTimeout(dt); dt = setTimeout(() => performSearch(q), 200); });
    searchClear.addEventListener('click', () => { searchInput.value = ''; searchClear.style.display = 'none'; showSearchPlaceholder(); searchInput.focus(); });
}
function showSearchPlaceholder() { if (!searchResults) return; const L = i18n[currentLang] || {}; searchResults.innerHTML = `<div class="search-placeholder"><i class="fa-solid fa-magnifying-glass"></i><p data-i18n="search_hint_title">${L.search_hint_title || '输入关键词开始搜索'}</p><p class="search-hint" data-i18n="search_hint_info">${L.search_hint_info || '支持搜索标题、内容、姓名等'}</p></div>`; }
function calcScore(query, ...texts) { const q = query.toLowerCase(); let s = 0; texts.forEach((t, i) => { if (!t) return; const tl = t.toLowerCase(); if (tl === q) s += 100; const w = i === 0 ? 3 : 1; if (tl.includes(q)) s += 20 * w; const cs = q.split(''); let mc = 0; cs.forEach(c => { if (tl.includes(c)) mc++; }); s += (mc / cs.length) * 10 * w; }); return Math.round(s); }
function hlMatch(text, query) { if (!text || !query) return text || ''; return text.replace(new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi'), '<strong style="color:var(--primary-blue);background:var(--primary-pale);padding:0 2px;border-radius:2px;">$1</strong>'); }

// ========================================
// 搜索（懒加载 search.json 搜索索引；失败时回退索引元数据）
// ========================================
const searchDataCache = {};
function ensureSearchData(type) {
    if (!(type in searchDataCache)) {
        searchDataCache[type] = fetch('data/' + type + '/search.json').then(r => { if (!r.ok) return null; return r.json(); }).catch(() => null);
    }
    return searchDataCache[type];
}
let searchQueryToken = 0;
async function performSearch(query) {
    if (!searchResults) return;
    const token = ++searchQueryToken;
    const data = await Promise.all([ensureSearchData('news'), ensureSearchData('competitions'), ensureSearchData('qa')]);
    if (token !== searchQueryToken) return;
    const newsList = (Array.isArray(data[0]) ? data[0] : []).filter(i => i && i.visible !== false);
    const compList = (Array.isArray(data[1]) ? data[1] : []).filter(i => i && i.visible !== false);
    const qaList = (Array.isArray(data[2]) ? data[2] : []).filter(i => i && i.visible !== false);
    const newsItems = newsList.length ? newsList : (newsData || []);
    const compItems = compList.length ? compList : (competitionsData || []);
    const qaItems = qaList.length ? qaList : (qaData || []);
    const results = [];
    if (newsItems.length) newsItems.forEach(item => {
        const s = calcScore(query, item.title, item.excerpt || '', item.content || '');
        if (s > 0) results.push({ type: 'news', typeLabel: i18n[currentLang].search_type_news, title: item.title, excerpt: item.excerpt || item.content || '', date: item.date, link: 'detail.html?type=news&id=' + item.id, score: s });
    });
    if (compItems.length) compItems.forEach(item => {
        const s = calcScore(query, item.title, item.excerpt || '', item.content || '');
        if (s > 0) results.push({ type: 'competition', typeLabel: i18n[currentLang].search_type_competition, title: item.title, excerpt: item.excerpt || item.content || '', date: item.date, link: 'detail.html?type=competition&id=' + item.id, score: s });
    });
    if (membersData && membersData.length) membersData.forEach(m => {
        const s = calcScore(query, m.name, m.role, m.description);
        if (s > 0) results.push({ type: 'member', typeLabel: i18n[currentLang].search_type_member, title: m.name + ' - ' + m.role, excerpt: m.description || '', date: '', link: 'members.html', score: s });
    });
    if (currentDisplayData && currentDisplayData.length) currentDisplayData.forEach(p => {
        const s = calcScore(query, p['姓名'], String(p['当前积分'] || ''), '');
        if (s > 0) {
            const uid = getUidForPlayerName(p['姓名']);
            const _L = i18n[currentLang] || {};
            const tpl = (_L.search_rank_tpl || '排名：{rank} | 胜率：{rate}').replace('{rank}', String(p.rank || '-')).replace('{rate}', String(p['胜率'] || '0%'));
            results.push({ type: 'ranking', typeLabel: i18n[currentLang].search_type_ranking, title: p['姓名'] + ' - ' + (p['当前积分'] || 0).toFixed(1) + '分', excerpt: tpl, date: '', link: uid != null ? ('player.html?uid=' + uid) : 'ranking.html', score: s + (uid != null ? 5 : 0) });
        }
    });
    if (qaItems.length) qaItems.forEach(item => {
        const s = calcScore(query, item.title, item.excerpt || '', item.content || '');
        if (s > 0) results.push({ type: 'qa', typeLabel: i18n[currentLang].search_type_qa, title: item.title, excerpt: item.excerpt || item.content || '', date: item.date, link: 'detail.html?type=qa&id=' + item.id, score: s });
    });
    if (changelogData && changelogData.length) changelogData.forEach(item => {
        const changesText = item.changes ? item.changes.join(' ') : '';
        const s = calcScore(query, item.title, item.version, changesText);
        if (s > 0) results.push({ type: 'changelog', typeLabel: i18n[currentLang].search_type_changelog, title: item.version + ' - ' + item.title, excerpt: item.changes ? item.changes.slice(0, 3).join(' | ') : '', date: item.date, link: 'changelog.html', score: s });
    });
    results.sort((a, b) => b.score - a.score);
    if (!results.length) { searchResults.innerHTML = '<div class="search-no-results"><i class="fa-solid fa-face-frown"></i><p>' + i18n[currentLang].search_no_results + '</p></div>'; return; }
    const safeResult = r => {
        const linkSafe = escapeHtml(String(r.link || '#'));
        const typeSafe = String(r.type || '').replace(/[^a-zA-Z0-9_-]/g, '');
        const titleSafe = hlMatch(escapeHtml(String(r.title || '')), query);
        const excerptSafe = hlMatch(escapeHtml(String(r.excerpt || '').substring(0, 100)), query);
        return '<div class="search-result-item" role="button" tabindex="0" data-link="' + linkSafe + '"><span class="search-result-type ' + escapeHtml(typeSafe) + '">' + escapeHtml(String(r.typeLabel || '')) + '</span><div class="search-result-title">' + titleSafe + '</div><div class="search-result-excerpt">' + excerptSafe + '</div>' + (r.date ? '<div style="font-size:0.7rem;color:var(--text-muted);margin-top:4px;">' + escapeHtml(String(r.date)) + '</div>' : '') + '</div>';
    };
    searchResults.innerHTML = '<div class="search-result-list">' + results.map(safeResult).join('') + '</div>';
}
if (searchResults) {
    searchResults.addEventListener('click', e => {
        const item = e.target.closest('.search-result-item');
        if (item && item.dataset.link) window.location.href = item.dataset.link;
    });
    searchResults.addEventListener('keydown', e => {
        if (e.key !== 'Enter' && e.key !== ' ') return;
        const item = e.target.closest('.search-result-item');
        if (item && item.dataset.link) { e.preventDefault(); window.location.href = item.dataset.link; }
    });
}
if (hamburger && navMenu) {
    // 创建移动端导航遮罩
    const navBackdrop = document.createElement('div');
    navBackdrop.className = 'nav-backdrop';
    navBackdrop.addEventListener('click', () => {
        hamburger.classList.remove('active');
        navMenu.classList.remove('active');
        navBackdrop.classList.remove('active');
        body.style.overflow = '';
    });
    navbar.appendChild(navBackdrop);

    hamburger.addEventListener('click', () => {
        const isActive = navMenu.classList.toggle('active');
        hamburger.classList.toggle('active');
        hamburger.setAttribute('aria-expanded', isActive ? 'true' : 'false');
        if (!hamburger.getAttribute('aria-controls')) hamburger.setAttribute('aria-controls', 'navMenu');
        navBackdrop.classList.toggle('active', isActive);
        if (window.innerWidth <= 768) {
            body.style.overflow = isActive ? 'hidden' : '';
        }
    });
    navMenu.querySelectorAll('.nav-link').forEach(l => l.addEventListener('click', e => {
        if (!l.classList.contains('dropdown-toggle')) {
            hamburger.classList.remove('active');
            hamburger.setAttribute('aria-expanded', 'false');
            navMenu.classList.remove('active');
            navBackdrop.classList.remove('active');
            body.style.overflow = '';
        }
    }));
    document.addEventListener('click', e => {
        if (!hamburger.contains(e.target) && !navMenu.contains(e.target)) {
            hamburger.classList.remove('active');
            hamburger.setAttribute('aria-expanded', 'false');
            navMenu.classList.remove('active');
            navBackdrop.classList.remove('active');
            body.style.overflow = '';
        }
    });
}
const dtEl = document.getElementById('moreDropdown'), dmEl = document.getElementById('dropdownMenu');
if (dtEl && dmEl) { dtEl.addEventListener('click', e => { e.preventDefault(); e.stopPropagation(); dtEl.classList.toggle('active'); dmEl.classList.toggle('active'); }); dmEl.querySelectorAll('.dropdown-link').forEach(l => l.addEventListener('click', () => { dtEl.classList.remove('active'); dmEl.classList.remove('active'); })); document.addEventListener('click', e => { if (!dtEl.contains(e.target) && !dmEl.contains(e.target)) { dtEl.classList.remove('active'); dmEl.classList.remove('active'); } }); }
window.addEventListener('scroll', () => { if (window.scrollY > 60) navbar.classList.add('scrolled'); else navbar.classList.remove('scrolled'); });
if (themeToggle) {
    const rootEl = document.documentElement;
    const sun = '<i class="fa-solid fa-sun"></i>', moon = '<i class="fa-solid fa-moon"></i>';
    // 初始状态可能已由 <head> 内联脚本设置（存储值优先，其次跟随系统偏好）
    themeToggle.innerHTML = isDarkTheme() ? sun : moon;
    themeToggle.addEventListener('click', () => {
        const dark = rootEl.classList.toggle('dark-mode');
        safeStorage.set('wfls-tt-theme', dark ? 'dark' : 'light');
        themeToggle.innerHTML = dark ? sun : moon;
    });
}

function openModal(m) { if(m) { m.classList.add('active'); body.style.overflow = 'hidden'; m.setAttribute('role', 'dialog'); m.setAttribute('aria-modal', 'true'); m._lastFocus = document.activeElement; const f = m.querySelector('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'); if (f) setTimeout(() => f.focus(), 60); } }
function closeModal(m) { if(m) { m.classList.remove('active'); body.style.overflow = ''; if (m._lastFocus && document.contains(m._lastFocus)) { try { m._lastFocus.focus(); } catch(e) {} } m._lastFocus = null; } }
/* 焦点陷阱：Tab 循环限制在当前打开的模态框内 */
document.addEventListener('keydown', e => {
    if (e.key !== 'Tab') return;
    const m = document.querySelector('.modal-overlay.active, .search-overlay.active');
    if (!m) return;
    const f = m.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
    if (!f.length) return;
    const first = f[0], last = f[f.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
});
if (qrTrigger && modalOverlay) qrTrigger.addEventListener('click', () => openModal(modalOverlay));
if (modalClose && modalOverlay) modalClose.addEventListener('click', () => closeModal(modalOverlay));
if (modalOverlay) modalOverlay.addEventListener('click', e => { if (e.target === modalOverlay) closeModal(modalOverlay); });
document.addEventListener('keydown', e => { if (e.key === 'Escape' && modalOverlay && modalOverlay.classList.contains('active')) closeModal(modalOverlay); });

function formatExcerpt(text) { if (!text) return ''; return renderLatexInString(escapeHtml(text).replace(/\n/g, '<br>').replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')); }
function renderLatexInString(html) { if (!html || typeof katex === 'undefined') return html; try { html = html.replace(/\$\$([\s\S]*?)\$\$/g, function(match, formula) { var f = formula.trim(); if (!f) return match; try { var r = katex.renderToString(f, { displayMode: true, throwOnError: false, strict: false }); return r.indexOf('katex-error') !== -1 ? match : r; } catch(e) { return match; } }); html = html.replace(/(^|[^\\$])\$([^\n$]+?)\$/g, function(match, prefix, formula) { var f = formula.trim(); if (!f) return match; try { var r = katex.renderToString(f, { displayMode: false, throwOnError: false, strict: false }); return r.indexOf('katex-error') !== -1 ? match : prefix + r; } catch(e) { return match; } }); } catch(e) { console.warn('LaTeX render failed', e); } return html; }
function protectLatex(text) { var blocks = []; var p = text; p = p.replace(/\$\$([\s\S]*?)\$\$/g, function(m, f) { var i = blocks.length; blocks.push({ t: 'd', f: f.trim() }); return '\uE000LD' + i + '\uE000'; }); p = p.replace(/\$([^\n]+?)\$/g, function(m, f) { var i = blocks.length; blocks.push({ t: 'i', f: f.trim() }); return '\uE000LI' + i + '\uE000'; }); return { text: p, blocks: blocks }; }
function restoreLatex(html, blocks) { if (!blocks || !blocks.length) return html; for (var i = 0; i < blocks.length; i++) { var b = blocks[i]; var ph = (b.t === 'd' ? '\uE000LD' : '\uE000LI') + i + '\uE000'; var idx = html.indexOf(ph); if (idx === -1) { html = html.replace(new RegExp('LD' + i + '(?=[^' + '\uE000' + ']|$)|LI' + i + '(?=[^' + '\uE000' + ']|$)', 'g'), b.t === 'd' ? '$$' + b.f + '$$' : '$' + b.f + '$'); continue; } try { var rendered = katex.renderToString(b.f, { displayMode: b.t === 'd', throwOnError: false, strict: false }); html = html.split(ph).join(rendered); } catch(e) { html = html.split(ph).join(b.t === 'd' ? '$$' + b.f + '$$' : '$' + b.f + '$'); } } return html; }
function renderMarkdown(text) { if (!text) return ''; const hasKatex = typeof katex !== 'undefined'; let blocks = []; let toProcess = escapeHtml(text); if (hasKatex) { const r = protectLatex(toProcess); toProcess = r.text; blocks = r.blocks; } let html; if (typeof marked !== 'undefined' && marked.parse) { try { marked.setOptions({ breaks: true, gfm: true }); html = marked.parse(toProcess); } catch(e) { console.warn('Markdown parse failed, fallback to formatExcerpt', e); html = formatExcerpt(toProcess); } } else { html = formatExcerpt(toProcess); } if (hasKatex && blocks.length) html = restoreLatex(html, blocks); return html; }
function parseWinRate(s) { return parseFloat((s || '0%').replace('%', '')) || 0; }
function createNewsCard(item) { const tt = i18n[currentLang]['tag_' + item.tag] || item.tag; return `<div class="news-card-date">${escapeHtml(item.date)}</div><h3>${escapeHtml(item.title)}</h3><p>${formatExcerpt(item.excerpt)}</p><span class="news-card-tag tag-${item.tag}">${tt}</span>`; }
function createCompetitionCard(item) { const tt = i18n[currentLang]['tag_' + item.tag] || item.tag; return `<div class="competitions-card-date">${escapeHtml(item.date)}</div><h3>${escapeHtml(item.title)}</h3><p>${formatExcerpt(item.excerpt)}</p><span class="competitions-card-tag tag-${item.tag}">${tt}</span>`; }
function createQaCard(item) { const tt = i18n[currentLang]['tag_' + item.tag] || item.tag; return `<div class="qa-card-date">${escapeHtml(item.date)}</div><h3>${escapeHtml(item.title)}</h3><p>${formatExcerpt(item.excerpt)}</p><span class="qa-card-tag tag-${item.tag}">${tt}</span>`; }
function getPaginatedData(d, p) { return d.slice((p-1)*ITEMS_PER_PAGE, p*ITEMS_PER_PAGE); }
function getTotalPages(d) { return Math.ceil(d.length/ITEMS_PER_PAGE); }

function getFilteredNewsData() { return newsFilterTag === 'all' ? newsData : newsData.filter(item => item.tag === newsFilterTag); }
function getFilteredCompetitionsData() { return competitionsFilterTag === 'all' ? competitionsData : competitionsData.filter(item => item.tag === competitionsFilterTag); }

function renderTagFilter(containerId, data, currentFilter, onChangeCallback) {
    const container = document.getElementById(containerId);
    if (!container) return;
    container.innerHTML = '';
    const tagCounts = {};
    data.forEach(item => { const t = item.tag; tagCounts[t] = (tagCounts[t] || 0) + 1; });
    const btnAll = document.createElement('button');
    btnAll.className = 'tag-filter-btn' + (currentFilter === 'all' ? ' active' : '');
    btnAll.innerHTML = i18n[currentLang].filter_all + ` <span class="count">(${data.length})</span>`;
    btnAll.addEventListener('click', () => { onChangeCallback('all'); });
    container.appendChild(btnAll);
    const tags = [...new Set(data.map(item => item.tag))];
    tags.forEach(tag => {
        const btn = document.createElement('button');
        btn.className = 'tag-filter-btn' + (currentFilter === tag ? ' active' : '');
        const label = i18n[currentLang]['tag_' + tag] || tag;
        btn.innerHTML = label + ` <span class="count">(${tagCounts[tag]})</span>`;
        btn.addEventListener('click', () => { onChangeCallback(tag); });
        container.appendChild(btn);
    });
}

function setNewsFilter(tag) { newsFilterTag = tag; newsCurrentPage = 1; renderAllNews(); }
function setCompetitionsFilter(tag) { competitionsFilterTag = tag; competitionsCurrentPage = 1; renderAllCompetitions(); }
function renderPagination(cid, d, cp) { const c = document.getElementById(cid); if (!c) return; const ep = c.parentElement.querySelector('.pagination'); if (ep) ep.remove(); const tp = getTotalPages(d); if (tp <= 1) return; const pe = document.createElement('div'); pe.className = 'pagination'; const pb = document.createElement('button'); pb.className = 'pagination-btn'; pb.textContent = i18n[currentLang].pagination_prev; pb.disabled = cp <= 1; pb.addEventListener('click', () => { if (cid === 'newsFullGrid') { newsCurrentPage = cp-1; renderAllNews(); } else if (cid === 'competitionsFullGrid') { competitionsCurrentPage = cp-1; renderAllCompetitions(); } else { qaCurrentPage = cp-1; renderAllQa(); } window.scrollTo({ top: c.offsetTop-100, behavior:'smooth' }); }); pe.appendChild(pb); const pages = [];
if (tp <= 7) { for (let i=1; i<=tp; i++) pages.push(i); }
else { pages.push(1); const s = Math.max(2, cp-1), e = Math.min(tp-1, cp+1); if (s > 2) pages.push('gap'); for (let i=s; i<=e; i++) pages.push(i); if (e < tp-1) pages.push('gap'); pages.push(tp); }
pages.forEach(p => { if (p === 'gap') { const gp = document.createElement('span'); gp.className = 'pagination-gap'; gp.textContent = '…'; pe.appendChild(gp); return; } const pg = document.createElement('button'); pg.className = 'pagination-btn'; if (p===cp) pg.classList.add('active'); pg.textContent = p; pg.addEventListener('click', () => { if (cid === 'newsFullGrid') { newsCurrentPage = p; renderAllNews(); } else if (cid === 'competitionsFullGrid') { competitionsCurrentPage = p; renderAllCompetitions(); } else { qaCurrentPage = p; renderAllQa(); } window.scrollTo({ top: c.offsetTop-100, behavior:'smooth' }); }); pe.appendChild(pg); }); const nb = document.createElement('button'); nb.className = 'pagination-btn'; nb.textContent = i18n[currentLang].pagination_next; nb.disabled = cp >= tp; nb.addEventListener('click', () => { if (cid === 'newsFullGrid') { newsCurrentPage = cp+1; renderAllNews(); } else if (cid === 'competitionsFullGrid') { competitionsCurrentPage = cp+1; renderAllCompetitions(); } else { qaCurrentPage = cp+1; renderAllQa(); } window.scrollTo({ top: c.offsetTop-100, behavior:'smooth' }); }); pe.appendChild(nb); const ie = document.createElement('span'); ie.className = 'pagination-info'; ie.textContent = i18n[currentLang].pagination_info.replace('{current}', cp).replace('{total}', tp); pe.appendChild(ie); c.parentElement.appendChild(pe); }

async function loadAboutData() { showContentLoading('coreMembersGrid', i18n[currentLang].loading_about); try { const resp = await fetch('data/about.json'); if (!resp.ok) throw new Error('HTTP ' + resp.status); aboutData = await resp.json(); } catch(e) { aboutData = null; } if (typeof renderAboutSections === 'function') renderAboutSections(); updateHeroLastUpdated(); }
async function loadMembersData() { showContentLoading('coreMembersGrid', i18n[currentLang].loading_members); if (!playersData) await loadPlayers(); if (playersData && Array.isArray(playersData.players)) { membersData = playersData.players.filter(p => p.role).map(p => ({ name: p.name, uid: p.uid, role: p.role, description: p.description, qq: p.qq })); } else { try { const resp = await fetch('data/_legacy/members.json'); if (!resp.ok) throw new Error('HTTP ' + resp.status); membersData = await resp.json(); } catch(e) { membersData = []; } } if (typeof renderCoreMembers === 'function') { renderCoreMembers(); if (typeof renderAllMembersPage === 'function') renderAllMembersPage(); } }
async function loadNewsData() { const prgs = [showContentLoading('newsPreviewGrid', i18n[currentLang].loading_news), showContentLoading('newsFullGrid', i18n[currentLang].loading_news)]; try { newsData = await fetchJsonWithProgress('data/news/index.json', pct => { prgs.forEach(p => { if (p) { p.setProgress(pct); p.setMeta('data/news/index.json' + (pct == null ? '' : ' · ' + Math.round(pct) + '%')); } }); }); } catch(e) { console.error('news/index.json 加载失败', e); newsData = []; } if (typeof renderAllNews === 'function') renderAllNews(); markContentLoaded('news'); }
async function loadCompetitionsData() { const prgs = [showContentLoading('competitionsPreviewGrid', i18n[currentLang].loading_competitions), showContentLoading('competitionsFullGrid', i18n[currentLang].loading_competitions)]; try { competitionsData = await fetchJsonWithProgress('data/competitions/index.json', pct => { prgs.forEach(p => { if (p) { p.setProgress(pct); p.setMeta('data/competitions/index.json' + (pct == null ? '' : ' · ' + Math.round(pct) + '%')); } }); }); } catch(e) { console.error('competitions/index.json 加载失败', e); competitionsData = []; } if (typeof renderAllCompetitions === 'function') renderAllCompetitions(); markContentLoaded('competition'); }
async function loadDrawsData() { try { const resp = await fetch('data/draws.json'); if (!resp.ok) throw new Error('HTTP ' + resp.status); drawsData = await resp.json(); } catch(e) { drawsData = []; } }
let _drawsLoadPromise = null;
function ensureDrawsData() {
    if (drawsData && drawsData.length) return Promise.resolve();
    if (!_drawsLoadPromise) _drawsLoadPromise = loadDrawsData().then(() => { _drawsLoadPromise = null; }, () => { _drawsLoadPromise = null; });
    return _drawsLoadPromise;
}
function getDrawsForCompetition(competitionId) { if (!drawsData || !drawsData.length) return null; return drawsData.find(d => d.competitionId === competitionId) || null; }
async function loadQaData() { try { const resp = await fetch('data/qa/index.json'); if (!resp.ok) throw new Error('HTTP ' + resp.status); qaData = await resp.json(); } catch(e) { qaData = []; } if (typeof renderAllQa === 'function') renderAllQa(); }
async function loadChangelogData() { try { const resp = await fetch('data/changelog.json'); if (!resp.ok) throw new Error('HTTP ' + resp.status); changelogData = await resp.json(); } catch(e) { changelogData = []; } if (typeof renderAllChangelog === 'function') renderAllChangelog(); }
async function loadPlayerTagsData() { if (!playersData) await loadPlayers(); if (playersData && Array.isArray(playersData.players)) { const map = {}; for (const p of playersData.players) map[p.name] = { tags: p.tags || [], honors: p.honors || [] }; playerTagsData = { players: map }; return; } try { const resp = await fetch('data/_legacy/player-tags.json'); if (!resp.ok) throw new Error('HTTP ' + resp.status); playerTagsData = await resp.json(); } catch(e) { playerTagsData = null; } }

// ===== 统一球员档案加载（data/players.json，兼容回退 data/_legacy/）=====
async function loadPlayers() {
    try {
        const resp = await fetch('data/players.json');
        if (!resp.ok) throw new Error('HTTP ' + resp.status);
        const raw = await resp.json();
        if (!raw || !Array.isArray(raw.players)) throw new Error('players.json 结构异常');
        playersData = raw;
        buildPlayerIndexes();
        return true;
    } catch(e) {
        console.warn('[Players] players.json 加载失败，尝试兼容旧数据', e);
        playersData = null;
        return false;
    }
}
function buildPlayerIndexes() {
    uidIndex = {};
    nameIndex = {};
    if (!playersData || !Array.isArray(playersData.players)) return;
    for (const p of playersData.players) {
        if (p && p.uid != null) uidIndex[String(p.uid)] = p;
        if (p && p.name) nameIndex[p.name] = p;
        if (p && Array.isArray(p.aliases)) p.aliases.forEach(a => { if (a) nameIndex[a] = p; });
    }
}
function getPlayerByUid(uid) { return uid != null ? (uidIndex[String(uid)] || null) : null; }
function getPlayerByName(name) { return name != null && nameIndex[name] ? nameIndex[name] : null; }
function getUidForPlayerName(name) { const p = getPlayerByName(name); return p ? p.uid : null; }
function getPlayerProfileUrl(playerOrUidOrName) {
    if (playerOrUidOrName == null) return '';
    if (typeof playerOrUidOrName === 'object') return playerOrUidOrName.uid != null ? ('player.html?uid=' + playerOrUidOrName.uid) : '#';
    const p = uidIndex[String(playerOrUidOrName)] || nameIndex[playerOrUidOrName];
    return p ? ('player.html?uid=' + p.uid) : '#';
}
// 姓名 → 个人页链接（无档案时纯文本）
function linkPlayerName(name) {
    const p = getPlayerByName(name);
    if (p && p.uid != null) return `<a href="player.html?uid=${escapeHtml(String(p.uid))}" class="player-name-link">${escapeHtml(String(name))}</a>`;
    return escapeHtml(String(name));
}
// 名称规范化：按 players.json（含别名）把赛果中的名字归一到规范名
function normalizePlayerName(raw) { if (raw == null) return raw; const p = nameIndex[raw]; return p && p.name ? p.name : raw; }
const _ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
function normalizeScoreLog(log) {
    if (!Array.isArray(log)) return log;
    const today = new Date(); today.setHours(0, 0, 0, 0);
    for (const r of log) {
        if (r['胜者']) r['胜者'] = normalizePlayerName(r['胜者']);
        if (r['负者']) r['负者'] = normalizePlayerName(r['负者']);
        if (r['对象']) r['对象'] = normalizePlayerName(r['对象']);
        const d = r['日期'];
        if (d && !_ISO_DATE_RE.test(d)) console.warn('[score-log] 日期格式非 YYYY-MM-DD，衰减/赛季归档可能错位:', d, r);
        else if (d && r['胜者'] && new Date(d + 'T00:00:00') > today) console.warn('[score-log] 记录日期在未来，当前按零权重处理:', d, r['胜者'], '→', r['负者']);
    }
    return log;
}
let _newsLoadSettled = false, _compLoadSettled = false;
function markContentLoaded(which) {
    if (which === 'news') _newsLoadSettled = true;
    else if (which === 'competition') _compLoadSettled = true;
    // 两个内容源都"落定"（无论成功或失败）后才触发详情页渲染，避免以空数组误判就绪
    if (_newsLoadSettled && _compLoadSettled && !dataLoaded) {
        dataLoaded = true;
        if (typeof updateDetailPage === 'function' && window.location.pathname.includes('detail.html')) updateDetailPage();
    }
}

function renderAboutSections() { if (!aboutData) return; const pc = document.getElementById('philosophyContent'); if (pc && aboutData.philosophy) pc.innerHTML = `<div class="markdown-body">${renderMarkdown(aboutData.philosophy.content)}</div>`; const ac = document.getElementById('activitiesContent'); if (ac && aboutData.activities) ac.innerHTML = `<div class="markdown-body">${renderMarkdown(aboutData.activities.content)}</div>`; updateHeroLastUpdated(); }
function getMemberAvatarHTML(m) { if (m.qq && m.qq.trim()) { const qqUrl = `https://q1.qlogo.cn/g?b=qq&nk=${m.qq.trim()}&s=640`; return `<div class="member-avatar">${escapeHtml(m.name.charAt(0))}<img class="member-avatar-img" src="${escapeHtml(qqUrl)}" alt="${escapeHtml(m.name)}" loading="lazy" onerror="this.style.display='none'"></div>`; } return `<div class="member-avatar text-only">${escapeHtml(m.name.charAt(0))}</div>`; }
function renderCoreMembers() { document.querySelectorAll('#coreMembersGrid').forEach(g => { if (!g) return; g.innerHTML = ''; membersData.forEach(m => { const el = document.createElement('div'); el.className = 'member-card glass-card'; el.innerHTML = `${getMemberAvatarHTML(m)}<h3>${escapeHtml(m.name)}</h3><span class="member-role">${escapeHtml(m.role)}</span><p class="member-desc">${formatExcerpt(m.description)}</p>`; if (m.uid != null) { el.title = i18n[currentLang].rank_view_player_page; makeCardClickable(el, 'player.html?uid=' + m.uid); } g.appendChild(el); }); }); }
function renderAllMembersPage() { const g = document.getElementById('allMembersGrid'); if (!g) return; g.innerHTML = ''; membersData.forEach(m => { const el = document.createElement('div'); el.className = 'member-card glass-card'; el.innerHTML = `${getMemberAvatarHTML(m)}<h3>${escapeHtml(m.name)}</h3><span class="member-role">${escapeHtml(m.role)}</span><p class="member-desc">${formatExcerpt(m.description)}</p>`; if (m.uid != null) { el.title = i18n[currentLang].rank_view_player_page; makeCardClickable(el, 'player.html?uid=' + m.uid); } g.appendChild(el); }); }
function renderAllNews() { const pg = document.getElementById('newsPreviewGrid'); if (pg) { pg.innerHTML = ''; newsData.slice(0,3).forEach(item => { const c = document.createElement('div'); c.className = 'news-card'; c.innerHTML = createNewsCard(item); makeCardClickable(c, 'detail.html?type=news&id=' + item.id); pg.appendChild(c); }); } const fg = document.getElementById('newsFullGrid'); if (fg) { const fd = getFilteredNewsData(); fg.innerHTML = ''; getPaginatedData(fd, newsCurrentPage).forEach(item => { const c = document.createElement('div'); c.className = 'news-card'; c.innerHTML = createNewsCard(item); makeCardClickable(c, 'detail.html?type=news&id=' + item.id); fg.appendChild(c); }); renderPagination('newsFullGrid', fd, newsCurrentPage); renderTagFilter('newsTagFilter', newsData, newsFilterTag, setNewsFilter); } }
function renderAllCompetitions() { const pg = document.getElementById('competitionsPreviewGrid'); if (pg) { pg.innerHTML = ''; competitionsData.slice(0,3).forEach(item => { const c = document.createElement('div'); c.className = 'competitions-card'; c.innerHTML = createCompetitionCard(item); makeCardClickable(c, 'detail.html?type=competition&id=' + item.id); pg.appendChild(c); }); } const fg = document.getElementById('competitionsFullGrid'); if (fg) { const fd = getFilteredCompetitionsData(); fg.innerHTML = ''; getPaginatedData(fd, competitionsCurrentPage).forEach(item => { const c = document.createElement('div'); c.className = 'competitions-card'; c.innerHTML = createCompetitionCard(item); makeCardClickable(c, 'detail.html?type=competition&id=' + item.id); fg.appendChild(c); }); renderPagination('competitionsFullGrid', fd, competitionsCurrentPage); renderTagFilter('competitionsTagFilter', competitionsData, competitionsFilterTag, setCompetitionsFilter); } }
function renderAllQa() { const fg = document.getElementById('qaFullGrid'); if (fg) { fg.innerHTML = ''; getPaginatedData(qaData, qaCurrentPage).forEach(item => { const c = document.createElement('div'); c.className = 'qa-card'; c.innerHTML = createQaCard(item); makeCardClickable(c, 'detail.html?type=qa&id=' + item.id); fg.appendChild(c); }); renderPagination('qaFullGrid', qaData, qaCurrentPage); } }
function renderAllChangelog() { const tl = document.getElementById('changelogTimeline'); if (!tl) return; tl.innerHTML = ''; if (!changelogData || !changelogData.length) { tl.innerHTML = '<div class="changelog-empty"><i class="fa-solid fa-clock-rotate-left"></i><p data-i18n="changelog_empty">鏆傛棤鏇存柊鏃ュ織</p></div>'; return; } changelogData.forEach((item, idx) => { const entry = document.createElement('div'); entry.className = 'changelog-entry'; const tagLabel = i18n[currentLang]['tag_' + item.tag] || item.tag; const tagSafe = 'tag-' + String(item.tag || '').replace(/[^a-zA-Z0-9_-]/g, ''); const changesHtml = item.changes && item.changes.length ? '<ul class="changelog-changes">' + item.changes.map(c => '<li>' + renderMarkdown(c) + '</li>').join('') + '</ul>' : ''; entry.innerHTML = `<div class="changelog-entry-marker"><div class="changelog-dot"></div>${idx < changelogData.length - 1 ? '<div class="changelog-line"></div>' : ''}</div><div class="changelog-entry-content glass-card"><div class="changelog-entry-header"><span class="changelog-version">${escapeHtml(item.version)}</span><span class="changelog-tag ${escapeHtml(tagSafe)}">${escapeHtml(tagLabel)}</span><span class="changelog-date">${escapeHtml(item.date)}</span></div><h3 class="changelog-entry-title">${escapeHtml(item.title)}</h3>${changesHtml}</div>`; tl.appendChild(entry); }); }
// ========================================
// 详情页：条目文件夹 {type}/{id}/{id}.json（展示）+ {id}.history.json（版本清单）+ {id}.v{n}.json（快照）
// ========================================
function getContentListByType(type) { return type === 'news' ? newsData : (type === 'competition' ? competitionsData : qaData); }
function getContentDirByType(type) { return type === 'news' ? 'news' : (type === 'competition' ? 'competitions' : 'qa'); }
async function resolveItemContent(type, item) {
    if (!item) return '';
    if (item.contentFile) {
        const cf = String(item.contentFile).replace(/\\/g, '/').replace(/^\/+/, '');
        const url = cf.includes('/') ? cf : `data/${getContentDirByType(type)}/${encodeURIComponent(String(item.id))}/${encodeURIComponent(cf)}`;
        try {
            const resp = await fetch(url);
            if (resp.ok) return await resp.text();
        } catch(e) { /* 拉取失败时回退到内联字段 */ }
    }
    return item.content || item.excerpt || '';
}
const DETAIL_SNAPSHOT_KEYS = ['date', 'title', 'excerpt', 'content', 'tag', 'media'];
const VERSION_I18N_DEFAULTS = { detail_version_updated: '更新于 {date}', detail_version_list: '历史版本', detail_version_view: '查看', detail_version_viewing: '正在查看 v{version}（更新于 {date}）', detail_version_back: '返回 v{version}' };
function snapshotOf(item) { const s = {}; DETAIL_SNAPSHOT_KEYS.forEach(k => s[k] = (item[k] === undefined ? null : item[k])); return s; }
function snapshotsEqual(a, b) { return JSON.stringify(snapshotOf(a)) === JSON.stringify(snapshotOf(b)); }
function getVersionInfo(item) {
    const hist = (Array.isArray(item.history) ? item.history : []).filter(h => h && typeof h === 'object');
    if (!hist.length) return { current: 1, updatedAt: null, old: [] };
    const last = hist[0], base = Number(last.version) || 1;
    const old = hist.slice(1).filter(h => h.visible !== false);
    const lastIsMeta = ('file' in last) && !('content' in last);
    if (lastIsMeta || snapshotsEqual(item, last)) return { current: base, updatedAt: last.updatedAt || null, old: old };
    return { current: base + 1, updatedAt: last.updatedAt || null, old: hist.filter(h => h.visible !== false) };
}
let detailState = null;
async function loadContentItem(type, id) {
    const dir = getContentDirByType(type);
    try {
        const resp = await fetch(`data/${dir}/${encodeURIComponent(id)}/${encodeURIComponent(id)}.json`);
        if (resp.ok) return await resp.json();
    } catch(e) { /* 回退到索引数据 */ }
    // 索引回退：index.json 为元数据（无 content），search.json 含正文
    const da = getContentListByType(type);
    let item = (da && da.find(d => d.id == id)) || null;
    if (item && (item.content || item.contentFile)) return item;
    try {
        const sresp = await fetch(`data/${dir}/search.json`);
        if (sresp.ok) {
            const slist = await sresp.json();
            const sitem = (Array.isArray(slist) ? slist : []).find(d => d.id == id);
            if (sitem) item = Object.assign({}, item || {}, sitem);
        }
    } catch(e) { /* 搜索索引缺失时保持索引回退结果 */ }
    return item;
}
async function loadHistoryManifest(type, id) {
    const dir = getContentDirByType(type);
    try {
        const resp = await fetch(`data/${dir}/${encodeURIComponent(id)}/${encodeURIComponent(id)}.history.json`);
        if (resp.ok) return await resp.json();
    } catch(e) { /* 清单缺失时按无历史处理 */ }
    return null;
}
let _detailRunToken = 0;
async function ensureContentList(type) {
    if (getContentListByType(type).length) return;
    const dir = getContentDirByType(type);
    try {
        const resp = await fetch(`data/${dir}/index.json`);
        if (resp.ok) {
            const arr = await resp.json();
            if (Array.isArray(arr)) {
                if (type === 'news') newsData = arr;
                else if (type === 'competition') competitionsData = arr;
                else qaData = arr;
            }
        }
    } catch(e) { /* 索引缺失时按无回退处理 */ }
}
function renderDetailMessage(title, bodyHtml) {
    const tEl = document.getElementById('detailTitle');
    const dEl = document.getElementById('detailDate');
    const cEl = document.getElementById('detailContent');
    const mEl = document.getElementById('detailMedia');
    const hEl = document.getElementById('detailVersion');
    if (tEl) tEl.textContent = title;
    if (dEl) dEl.textContent = '';
    if (cEl) { cEl.innerHTML = bodyHtml; cEl.style.display = ''; }
    if (mEl) mEl.innerHTML = '';
    if (hEl) hEl.style.display = 'none';
}
function renderDetailNotFound() {
    const t = Object.assign({}, VERSION_I18N_DEFAULTS, i18n[currentLang] || {});
    renderDetailMessage(t.detail_not_found || '未找到内容', `<div class="detail-error"><i class="fa-solid fa-circle-exclamation"></i><p>${escapeHtml(t.detail_not_found || '未找到内容')}</p><p class="detail-error-hint">${escapeHtml(t.detail_load_fail_hint || '')}</p><button class="detail-retry-btn" type="button" onclick="location.reload()"><i class="fa-solid fa-rotate-right"></i> ${escapeHtml(t.detail_retry || '重试')}</button></div>`);
}
function renderDetailLoadFail() {
    const t = Object.assign({}, VERSION_I18N_DEFAULTS, i18n[currentLang] || {});
    renderDetailMessage(t.detail_load_fail || '加载失败', `<div class="detail-error"><i class="fa-solid fa-triangle-exclamation"></i><p>${escapeHtml(t.detail_load_fail || '加载失败')}</p><p class="detail-error-hint">${escapeHtml(t.detail_load_fail_hint || '')}</p><button class="detail-retry-btn" type="button" onclick="location.reload()"><i class="fa-solid fa-rotate-right"></i> ${escapeHtml(t.detail_retry || '重试')}</button></div>`);
}
async function renderDetailBySig(type, id) {
    // 直读目标条目（{id}.json）+ 历史清单，无需全量索引
    const [item, hist] = await Promise.all([loadContentItem(type, id), loadHistoryManifest(type, id)]);
    if (item && item.visible !== false) {
        if (Array.isArray(hist) && hist.length) item.history = hist;
        // 兜底：数据文件缺失 id 时用 URL 参数回填，保证历史快照/赛程等依赖 item.id 的功能可用
        if (item.id == null) item.id = id;
        detailState = { type, item };
        await renderDetailItem(type, item);
        return true;
    }
    return false;
}
async function initDetailPageDirect() {
    const params = new URLSearchParams(window.location.search);
    const type = params.get('type'), id = params.get('id');
    const contentEl = document.getElementById('detailContent');
    const t = Object.assign({}, VERSION_I18N_DEFAULTS, i18n[currentLang] || {});
    // 立即显示加载提示，避免访问者面对空白卡片
    if (contentEl) showContentLoading('detailContent', t.detail_loading || '加载中...');
    if (!type || !id) { renderDetailNotFound(); return; }
    // 运行令牌：并发/重复触发时只让最后一次生效，防止重复 fetch 与 DOM 写入竞态
    const token = ++_detailRunToken;
    let ok;
    try {
        ok = await renderDetailBySig(type, id);
        if (token !== _detailRunToken) return;
        if (!ok) {
            // 直读失败：按需补拉索引后再重试一次（替代原先的轮询重试）
            await ensureContentList(type);
            if (token !== _detailRunToken) return;
            ok = await renderDetailBySig(type, id);
            if (token !== _detailRunToken) return;
        }
    } catch(e) {
        console.error('Detail: 渲染失败', e);
        if (token === _detailRunToken) renderDetailLoadFail();
        return;
    }
    if (!ok) { renderDetailNotFound(); return; }
    dataLoaded = true;
}
async function updateDetailPage() {
    await initDetailPageDirect();
}

async function renderDetailItem(type, item) {
    document.getElementById('detailTypeTag').textContent = i18n[currentLang][type === 'news' ? 'news_hero_tag' : (type === 'competition' ? 'comp_hero_tag' : 'qa_hero_tag')];
    document.getElementById('detailTitle').textContent = item.title;
    document.getElementById('detailDate').textContent = item.date;
    const bodyText = await resolveItemContent(type, item);
    document.getElementById('detailContent').innerHTML = renderMarkdown(bodyText);
    const contentSection = document.getElementById('detailContent');
    if (contentSection) contentSection.style.display = '';
    renderDetailMedia(item);
    await renderDetailDrawsSection(type, item);
    renderDetailVersion(type, item);
}

function renderDetailMedia(item) {
    const mc = document.getElementById('detailMedia');
    mc.innerHTML = '';
    if (item.media && Array.isArray(item.media) && item.media.length) {
        item.media.forEach(m => {
            if (!m || !m.type || !m.src) return;
            const mi = document.createElement('div');
            mi.className = 'media-item';
            if (m.type === 'image') {
                const img = document.createElement('img');
                img.src = m.src;
                img.alt = m.alt || '图片';
                img.loading = 'lazy';
                img.onerror = () => { img.style.display = 'none'; const srcSafe = escapeHtml(m.src); mi.innerHTML = '<div class="media-error"><i class="fa-solid fa-image"></i><p>图片加载失败</p><a href="' + srcSafe + '" download class="media-download-link"><i class="fa-solid fa-download"></i> 下载图片</a></div>'; };
                mi.appendChild(img);
            } else if (m.type === 'video') {
                const wrapper = document.createElement('div');
                wrapper.className = 'video-wrapper';
                const v = document.createElement('video');
                v.controls = true;
                v.playsInline = true;
                v.preload = 'metadata';
                v.style.width = '100%';
                const source = document.createElement('source');
                source.src = m.src;
                const ext = (m.src || '').split('.').pop().toLowerCase();
                const mimeMap = { mp4: 'video/mp4', webm: 'video/webm', ogg: 'video/ogg', ogv: 'video/ogg', mov: 'video/quicktime', mkv: 'video/x-matroska', avi: 'video/x-msvideo' };
                source.type = mimeMap[ext] || 'video/mp4';
                v.appendChild(source);
                const loadingEl = document.createElement('div');
                loadingEl.className = 'video-loading';
                loadingEl.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i><p>视频加载中...</p>';
                let videoLoaded = false, videoError = false;
                const hideLoading = () => { if (!videoLoaded && !videoError) { videoLoaded = true; loadingEl.style.display = 'none'; } };
                const showLoading = () => { if (videoLoaded && !videoError) { videoLoaded = false; loadingEl.style.display = 'flex'; } };
                v.addEventListener('loadedmetadata', hideLoading);
                v.addEventListener('canplay', hideLoading);
                v.addEventListener('canplaythrough', hideLoading);
                v.addEventListener('playing', hideLoading);
                v.addEventListener('waiting', showLoading);
                v.addEventListener('seeking', showLoading);
                v.addEventListener('seeked', hideLoading);
                const handleVideoError = () => {
                    if (videoError) return;
                    videoError = true;
                    loadingEl.style.display = 'none';
                    const srcSafe = escapeHtml(m.src);
                    mi.innerHTML = '<div class="media-error"><i class="fa-solid fa-video"></i><p>视频加载失败</p><p class="media-error-hint">（文件较大，网络不稳定时可能加载较慢）</p><a href="' + srcSafe + '" download class="media-download-link"><i class="fa-solid fa-download"></i> 下载视频</a></div>';
                };
                v.onerror = handleVideoError;
                source.onerror = handleVideoError;
                const dlBtn = document.createElement('a');
                dlBtn.href = m.src;
                dlBtn.download = '';
                dlBtn.className = 'video-dl-btn';
                dlBtn.title = '下载视频';
                dlBtn.innerHTML = '<i class="fa-solid fa-download"></i>';
                wrapper.appendChild(v);
                wrapper.appendChild(loadingEl);
                wrapper.appendChild(dlBtn);
                mi.appendChild(wrapper);
            } else if (m.type === 'file') {
                const a = document.createElement('a');
                a.href = m.src;
                a.className = 'file-link';
                a.download = '';
                a.innerHTML = '<i class="fa-solid fa-download"></i> ' + escapeHtml(String(m.name || '下载文件'));
                mi.appendChild(a);
            }
            mc.appendChild(mi);
        });
    }
}

async function renderDetailDrawsSection(type, item) {
    const drawsToggleContainer = document.getElementById('detailDrawsToggle');
    const drawsContainer = document.getElementById('detailDraws');
    if (drawsToggleContainer && drawsContainer) {
        if (type === 'competition') {
            // 懒加载：仅在查看赛事详情时才拉取 draws.json（detail 页不再急切下载）
            await ensureDrawsData();
            const draws = getDrawsForCompetition(item.id);
            if (draws) {
                drawsToggleContainer.style.display = 'flex';
                drawsToggleContainer.innerHTML = `
                    <button class="draws-tab-btn active" data-tab="content" data-i18n="draws_tab_content">${i18n[currentLang].draws_tab_content}</button>
                    <button class="draws-tab-btn" data-tab="draws" data-i18n="draws_tab_bracket">${i18n[currentLang].draws_tab_bracket}</button>
                `;
                const contentSection = document.getElementById('detailContent');
                const mediaSection = document.getElementById('detailMedia');
                drawsToggleContainer.querySelectorAll('.draws-tab-btn').forEach(btn => {
                    btn.addEventListener('click', () => {
                        drawsToggleContainer.querySelectorAll('.draws-tab-btn').forEach(b => b.classList.remove('active'));
                        btn.classList.add('active');
                        const tab = btn.dataset.tab;
                        if (tab === 'content') {
                            contentSection.style.display = '';
                            if (mediaSection) mediaSection.style.display = '';
                            drawsContainer.style.display = 'none';
                        } else {
                            contentSection.style.display = 'none';
                            if (mediaSection) mediaSection.style.display = 'none';
                            drawsContainer.style.display = '';
                        }
                    });
                });
                if (draws.version === 2 && typeof initDrawsViewer === 'function') {
                    drawsContainer.innerHTML = '';
                    drawsContainer.style.display = 'none';
                    let viewerInitialized = false;
                    const bracketTab = drawsToggleContainer.querySelector('[data-tab="draws"]');
                    if (bracketTab) {
                        bracketTab.addEventListener('click', function initOnce() {
                            if (!viewerInitialized) {
                                viewerInitialized = true;
                                setTimeout(() => initDrawsViewer('detailDraws', draws), 100);
                            }
                        });
                    }
                } else {
                    drawsContainer.innerHTML = typeof renderBracketHTML === 'function' ? renderBracketHTML(draws) : '';
                    drawsContainer.style.display = 'none';
                }
            } else {
                drawsToggleContainer.style.display = 'none';
                drawsContainer.innerHTML = '';
                drawsContainer.style.display = 'none';
            }
        } else {
            drawsToggleContainer.style.display = 'none';
            drawsContainer.innerHTML = '';
            drawsContainer.style.display = 'none';
        }
    }
}

let _detailVersionCloseHandler = null;   // 防止重复渲染时 document 级 handler 叠加泄漏

function renderDetailVersion(type, item) {
    const container = document.getElementById('detailVersion');
    if (!container) return;
    container.innerHTML = '';
    const vinfo = getVersionInfo(item);
    const t = Object.assign({}, VERSION_I18N_DEFAULTS, i18n[currentLang] || {});
    if (!vinfo.updatedAt && !vinfo.old.length) { container.style.display = 'none'; return; }
    container.style.display = '';
    const entry = document.createElement('button');
    entry.className = 'detail-version-entry' + (vinfo.old.length ? ' has-history' : '');
    entry.innerHTML = `<span class="detail-version-ver">v${escapeHtml(String(vinfo.current))}</span>${vinfo.updatedAt ? '<span class="detail-version-updated">' + escapeHtml(t.detail_version_updated.replace('{date}', String(vinfo.updatedAt))) + '</span>' : ''}${vinfo.old.length ? '<i class="fa-solid fa-chevron-down"></i>' : ''}`;
    container.appendChild(entry);
    if (!vinfo.old.length) return;
    const dropdown = document.createElement('div');
    dropdown.className = 'detail-version-dropdown';
    dropdown.style.display = 'none';
    const head = document.createElement('div');
    head.className = 'detail-version-head';
    head.innerHTML = `<i class="fa-solid fa-clock-rotate-left"></i><span>${escapeHtml(t.detail_version_list)}</span><span class="detail-version-count">${escapeHtml(String(vinfo.old.length))}</span>`;
    dropdown.appendChild(head);
    const list = document.createElement('ul');
    list.className = 'detail-version-list';
    vinfo.old.forEach(snap => {
        const li = document.createElement('li');
        li.className = 'detail-version-item';
        li.innerHTML = `<span class="detail-version-item-ver">v${escapeHtml(String(snap.version || '?'))}</span><span class="detail-version-item-date">${escapeHtml(String(snap.updatedAt || ''))}</span><span class="detail-version-item-title">${escapeHtml(String(snap.title || ''))}</span>`;
        const vb = document.createElement('button');
        vb.className = 'detail-version-view';
        vb.textContent = t.detail_version_view;
        vb.addEventListener('click', () => { dropdown.style.display = 'none'; viewHistoryVersion(snap); });
        li.appendChild(vb);
        list.appendChild(li);
    });
    dropdown.appendChild(list);
    container.appendChild(dropdown);
    entry.addEventListener('click', () => { dropdown.style.display = dropdown.style.display === 'none' ? '' : 'none'; });
    if (_detailVersionCloseHandler) document.removeEventListener('click', _detailVersionCloseHandler);
    const closeHandler = (e) => { if (!container.contains(e.target)) { dropdown.style.display = 'none'; document.removeEventListener('click', closeHandler); _detailVersionCloseHandler = null; } };
    _detailVersionCloseHandler = closeHandler;
    document.addEventListener('click', closeHandler);
}

async function viewHistoryVersion(snap) {
    if (!detailState || !snap) return;
    if (snap.file && !snap.content) {
        const type = detailState.type, item = detailState.item;
        const dir = getContentDirByType(type);
        try {
            const resp = await fetch(`data/${dir}/${encodeURIComponent(item.id)}/${encodeURIComponent(snap.file)}`);
            if (resp.ok) {
                const full = await resp.json();
                if (full && typeof full === 'object') snap = Object.assign({}, snap, full);
            }
        } catch(e) { /* 快照加载失败时按清单数据渲染 */ }
    }
    const type = detailState.type, item = detailState.item;
    const bodyText = await resolveItemContent(type, snap);
    document.getElementById('detailTitle').textContent = snap.title || '';
    document.getElementById('detailDate').textContent = snap.date || '';
    document.getElementById('detailContent').innerHTML = renderMarkdown(bodyText);
    const contentSection = document.getElementById('detailContent');
    if (contentSection) contentSection.style.display = '';
    renderDetailMedia(snap);
    renderDetailDrawsSection(type, item);
    const container = document.getElementById('detailVersion');
    if (!container) return;
    container.innerHTML = '';
    container.style.display = '';
    const t = Object.assign({}, VERSION_I18N_DEFAULTS, i18n[currentLang] || {});
    const vinfo = getVersionInfo(item);
    const banner = document.createElement('div');
    banner.className = 'detail-version-viewing';
    const msg = document.createElement('span');
    msg.innerHTML = `<i class="fa-solid fa-clock-rotate-left"></i>${escapeHtml(t.detail_version_viewing.replace('{version}', String(snap.version || '?')).replace('{date}', String(snap.updatedAt || '')))}`;
    const back = document.createElement('button');
    back.className = 'detail-version-back';
    back.textContent = t.detail_version_back.replace('{version}', String(vinfo.current));
    back.addEventListener('click', () => { renderDetailItem(type, item); });
    banner.appendChild(msg);
    banner.appendChild(back);
    container.appendChild(banner);
    if (typeof window.scrollTo === 'function') window.scrollTo({ top: 0, behavior: 'smooth' });
}
function getPlayerName(p) {
    if (!p) return '—';
    if (typeof p === 'string') return p;
    return p.name || '—';
}
function getPlayerNameEn(p) {
    if (!p || typeof p === 'string') return '';
    return p.nameEn || '';
}

function renderMatchCardHTML(m) {
    const p1 = m.player1;
    const p2 = m.player2;
    const score = m.score;
    const winner = m.winner;
    const p1Name = getPlayerName(p1);
    const p1En = getPlayerNameEn(p1);
    const p2Name = getPlayerName(p2);
    const p2En = getPlayerNameEn(p2);
    const p1Won = winner === 1;
    const p2Won = winner === 2;

    let html = '<div class="bracket-match-card">';
    // Player 1
    html += `<div class="bracket-player ${p1Won ? 'bracket-winner' : (p2Won ? 'bracket-loser' : '')}">`;
    html += `<span class="bracket-player-name">${escapeHtml(p1Name)}</span>`;
    if (p1En) html += `<span class="bracket-player-name-en">${escapeHtml(p1En)}</span>`;
    if (score && p1Won) html += `<span class="bracket-score-tag win">${escapeHtml(score)}</span>`;
    else if (score && p2Won) html += `<span class="bracket-score-tag loss">${escapeHtml(score)}</span>`;
    html += '</div>';

    // VS divider / opponent
    if (p2Name && p2Name !== '—') {
        html += '<div class="bracket-vs"></div>';
        html += `<div class="bracket-player ${p2Won ? 'bracket-winner' : (p1Won ? 'bracket-loser' : '')}">`;
        html += `<span class="bracket-player-name">${escapeHtml(p2Name)}</span>`;
        if (p2En) html += `<span class="bracket-player-name-en">${escapeHtml(p2En)}</span>`;
        if (score && p2Won) html += `<span class="bracket-score-tag win">${escapeHtml(score)}</span>`;
        else if (score && p1Won) html += `<span class="bracket-score-tag loss">${escapeHtml(score)}</span>`;
        html += '</div>';
    }
    html += '</div>';
    return html;
}

function gcd(a, b) { return b === 0 ? a : gcd(b, a % b); }
function lcm(a, b) { return (a * b) / gcd(a, b); }

function renderBracketHTML(draws) {
    if (!draws || !draws.rounds || !draws.rounds.length) return '<p class="draws-empty">暂无对阵数据</p>';

    const allRounds = draws.rounds;
    // Separate real competition rounds from champion display rounds
    const isChampionRound = (round) => {
        const ms = round.matches || [];
        return ms.length > 0 && ms.every(m => !m.player2 && !m.score);
    };
    const bracketRounds = [];
    const championRounds = [];
    for (const r of allRounds) {
        if (isChampionRound(r)) {
            championRounds.push(r);
        } else {
            bracketRounds.push(r);
        }
    }

    const numRounds = bracketRounds.length;
    if (numRounds === 0) return renderSimpleDrawsHTML(draws);

    const isKO = bracketRounds[0].matches.length >= 2;
    if (!isKO) return renderSimpleDrawsHTML(draws);

    // Calculate totalLanes as LCM of all round match counts for integer grid spans
    let totalLanes = 1;
    for (const round of bracketRounds) {
        totalLanes = lcm(totalLanes, (round.matches || []).length || 1);
    }
    const baseLaneHeight = 66;
    const maxTotalHeight = 2400;
    const laneHeight = Math.min(baseLaneHeight, Math.floor(maxTotalHeight / totalLanes));

    // ---- Precompute slot positions for every round ----
    const roundSlots = [];
    for (let ri = 0; ri < numRounds; ri++) {
        const matches = bracketRounds[ri].matches || [];
        const span = totalLanes / matches.length;
        const slots = [];
        for (let mi = 0; mi < matches.length; mi++) {
            const rowStart = mi * span + 1;
            const rowEnd = (mi + 1) * span + 1;
            // center of the match slot in px (top of the grid)
            const centerPx = ((rowStart + rowEnd - 1) / 2 - 1) * laneHeight + laneHeight / 2;
            slots.push({ rowStart, rowEnd, centerPx, matchIndex: mi });
        }
        roundSlots.push(slots);
    }

    let html = '';
    if (draws.title) {
        html += `<h3 class="draws-title">${escapeHtml(draws.title)}</h3>`;
    }

    html += '<div class="bracket-container"><div class="bracket-scroll"><div class="bracket-wrapper">';

    for (let ri = 0; ri < numRounds; ri++) {
        const round = bracketRounds[ri];
        const matches = round.matches || [];
        const spanPerMatch = totalLanes / matches.length;

        // ---- Round column ----
        html += '<div class="bracket-round">';
        html += `<div class="bracket-round-label">${escapeHtml(round.name)}</div>`;
        html += `<div class="bracket-round-matches" style="grid-template-rows:repeat(${totalLanes},${laneHeight}px);">`;

        for (let mi = 0; mi < matches.length; mi++) {
            const m = matches[mi];
            const rowStart = mi * spanPerMatch + 1;
            const rowEnd = (mi + 1) * spanPerMatch + 1;
            html += `<div class="bracket-slot" style="grid-row:${rowStart}/${rowEnd};" data-round="${ri}" data-match="${mi}">`;
            html += renderMatchCardHTML(m);
            html += '</div>';
        }

        html += '</div></div>';

        // ---- Connector column with smart SVG advancement lines ----
        if (ri < numRounds - 1) {
            const curSlots = roundSlots[ri];
            const nextSlots = roundSlots[ri + 1];
            const nextCount = nextSlots.length;
            const curCount = curSlots.length;
            const feedRatio = curCount / nextCount; // how many cur matches feed into 1 next match

            html += '<div class="bracket-round bracket-connector-col">';
            html += '<div class="bracket-round-label bracket-connector-spacer"></div>';
            html += `<div class="bracket-connectors" style="grid-template-rows:repeat(${totalLanes},${laneHeight}px);">`;

            for (let ni = 0; ni < nextCount; ni++) {
                const ns = nextSlots[ni];
                // Determine which current-round matches feed into this next match
                const feedStartIdx = Math.round(ni * feedRatio);
                const feedEndIdx = Math.round((ni + 1) * feedRatio);
                const feeders = curSlots.filter(s => s.matchIndex >= feedStartIdx && s.matchIndex < feedEndIdx);

                const groupHeight = (ns.rowEnd - ns.rowStart) * laneHeight;

                html += `<div class="bracket-connector-group" style="grid-row:${ns.rowStart}/${ns.rowEnd};">`;

                if (feeders.length >= 2) {
                    // Multiple feeders: draw a vertical stem + horizontal line using SVG
                    const feederTopPx = feeders[0].centerPx;
                    const feederBotPx = feeders[feeders.length - 1].centerPx;
                    const stemTop = feederTopPx - (ns.rowStart - 1) * laneHeight;
                    const stemBot = feederBotPx - (ns.rowStart - 1) * laneHeight;
                    const stemMid = (stemTop + stemBot) / 2;

                    html += `<svg class="bracket-connector-svg" width="28" height="${groupHeight}" viewBox="0 0 28 ${groupHeight}" preserveAspectRatio="none">`;
                    // Vertical stem connecting the centers of all feeding matches
                    html += `<line x1="2" y1="${stemTop}" x2="2" y2="${stemBot}" class="bracket-connector-stem"/>`;
                    // Horizontal line from stem midpoint to right edge
                    html += `<line x1="2" y1="${stemMid}" x2="26" y2="${stemMid}" class="bracket-connector-line"/>`;
                    // Small arrow at the right end
                    html += `<polygon points="26,${stemMid - 3} 28,${stemMid} 26,${stemMid + 3}" class="bracket-connector-arrow"/>`;
                    html += '</svg>';
                } else if (feeders.length === 1) {
                    // Single feeder (e.g., bye advancing): just a horizontal line
                    const feederPx = feeders[0].centerPx;
                    const midY = feederPx - (ns.rowStart - 1) * laneHeight;
                    html += `<svg class="bracket-connector-svg" width="28" height="${groupHeight}" viewBox="0 0 28 ${groupHeight}" preserveAspectRatio="none">`;
                    html += `<line x1="0" y1="${midY}" x2="26" y2="${midY}" class="bracket-connector-line"/>`;
                    html += `<polygon points="26,${midY - 3} 28,${midY} 26,${midY + 3}" class="bracket-connector-arrow"/>`;
                    html += '</svg>';
                } else {
                    // No feeders: empty
                    html += '<div class="bracket-connector-line"></div>';
                }

                html += '</div>';
            }
            html += '</div></div>';
        }
    }

    html += '</div></div></div>';

    // Render champion display(s) after the bracket
    for (const cr of championRounds) {
        html += '<div class="bracket-champion-section">';
        html += `<div class="bracket-champion-label">${escapeHtml(cr.name)}</div>`;
        for (const m of (cr.matches || [])) {
            const p1Name = getPlayerName(m.player1);
            html += `<div class="bracket-champion-card">`;
            html += `<span class="bracket-champion-crown"><i class="fa-solid fa-crown"></i></span>`;
            html += `<span class="bracket-champion-name">${escapeHtml(p1Name)}</span>`;
            html += `</div>`;
        }
        html += '</div>';
    }

    return html;
}

function renderSimpleDrawsHTML(draws) {
    let html = '';
    if (draws.title) {
        html += `<h3 class="draws-title">${escapeHtml(draws.title)}</h3>`;
    }
    // Filter out champion display rounds (player2 is null, no score)
    const isChampionRound = (round) => {
        const ms = round.matches || [];
        return ms.length > 0 && ms.every(m => !m.player2 && !m.score);
    };
    const realRounds = (draws.rounds || []).filter(r => !isChampionRound(r));
    realRounds.forEach((round, ri) => {
        html += `<div class="draws-round">`;
        html += `<h4 class="draws-round-name">${escapeHtml(round.name || '第' + (ri + 1) + '轮')}</h4>`;
        if (round.matches && round.matches.length) {
            html += `<div class="draws-matches">`;
            round.matches.forEach(m => {
                const p1Name = getPlayerName(m.player1);
                const p2Name = getPlayerName(m.player2);
                const p1Won = m.winner === 1;
                const p2Won = m.winner === 2;
                html += `<div class="draws-match glass-card">`;
                html += `<div class="draws-match-players">`;
                html += `<span class="draws-player ${p1Won ? 'draws-winner' : ''}">${escapeHtml(p1Name)}</span>`;
                html += `<span class="draws-vs">VS</span>`;
                html += `<span class="draws-player ${p2Won ? 'draws-winner' : ''}">${escapeHtml(p2Name)}</span>`;
                html += `</div>`;
                if (m.score) {
                    html += `<div class="draws-match-score">${escapeHtml(m.score)}</div>`;
                }
                html += `</div>`;
            });
            html += `</div>`;
        }
        html += `</div>`;
    });
    // Champion display for simple view
    const championRounds = (draws.rounds || []).filter(r => isChampionRound(r));
    for (const cr of championRounds) {
        html += '<div class="bracket-champion-section">';
        html += `<div class="bracket-champion-label">${escapeHtml(cr.name)}</div>`;
        for (const m of (cr.matches || [])) {
            const p1Name = getPlayerName(m.player1);
            html += `<div class="bracket-champion-card">`;
            html += `<span class="bracket-champion-crown"><i class="fa-solid fa-crown"></i></span>`;
            html += `<span class="bracket-champion-name">${escapeHtml(p1Name)}</span>`;
            html += `</div>`;
        }
        html += '</div>';
    }
    return html;
}

/* 可点击卡片统一键盘可达（Enter/Space 触发，role=link） */
function makeCardClickable(el, url) {
    if (!el || !url) return;
    el.style.cursor = 'pointer';
    el.tabIndex = 0;
    el.setAttribute('role', 'link');
    const nav = () => { window.location.href = url; };
    el.addEventListener('click', nav);
    el.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); nav(); } });
}

function isDarkTheme() {
    return document.documentElement.classList.contains('dark-mode') || document.body.classList.contains('dark-mode');
}

function escapeHtml(str) {
    if (!str) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function initPdfViewer() { const btn = document.getElementById('pdfViewBtn'), ctr = document.getElementById('pdfPreviewContainer'), ph = document.getElementById('pdfPlaceholder'), vw = document.getElementById('pdfViewer'); if (!btn) return; let loaded = false; btn.addEventListener('click', () => { if (!loaded) { btn.disabled = true; btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Loading...'; vw.src = vw.getAttribute('data-src'); loaded = true; vw.onload = () => { btn.innerHTML = `<i class="fa-solid fa-eye-slash"></i> ${i18n[currentLang].pdf_preview_btn}`; btn.disabled = false; }; setTimeout(() => { if (btn.disabled) { btn.innerHTML = `<i class="fa-solid fa-eye-slash"></i> ${i18n[currentLang].pdf_preview_btn}`; btn.disabled = false; } }, 10000); } if (ctr.style.display === 'none' || !ctr.style.display) { ctr.style.display = 'block'; ph.style.display = 'none'; } else { ctr.style.display = 'none'; ph.style.display = 'flex'; } }); }

function updateSideNavHighlight() { const links = document.querySelectorAll('.side-nav-link, .viz-tab-link'); if (!links.length) return; const pos = window.scrollY + 150; let cur = null; links.forEach(l => { const el = document.querySelector(l.getAttribute('href')); if (!el) return; const top = el.getBoundingClientRect().top + window.scrollY; if (pos >= top) cur = l.getAttribute('data-section'); }); if (!cur) cur = links[0].getAttribute('data-section'); links.forEach(l => l.classList.toggle('active', l.getAttribute('data-section') === cur)); const activeTab = document.querySelector('.viz-tab-link.active'); const tabNav = document.getElementById('vizMobileNav'); if (activeTab && tabNav) { const tl = tabNav.querySelector('.viz-tab-list'); if (tl) tl.scrollTo({ left: Math.max(0, activeTab.offsetLeft - tl.offsetLeft - 12), behavior: 'smooth' }); } }
function highlightNavByPath() { const cp = window.location.pathname.split('/').pop() || 'index.html'; const anl = document.querySelectorAll('.nav-link:not(.dropdown-toggle)'), dl = document.querySelectorAll('.dropdown-link'); anl.forEach(l => l.classList.remove('active')); dl.forEach(l => l.classList.remove('active')); const dt2 = document.getElementById('moreDropdown'); if (dt2) dt2.classList.remove('active'); anl.forEach(link => { const h = link.getAttribute('href'); if (!h) return; if (h === cp || (cp === '' && h === 'index.html') || (cp === 'index.html' && h === 'index.html') || (cp === 'contact.html' && h === 'contact.html')) link.classList.add('active'); }); if (cp === 'members.html' || cp === 'data_viz.html' || cp === 'personal_stats.html' || cp === 'player.html' || cp === 'qa.html' || cp === 'changelog.html') { if (dt2) dt2.classList.add('active'); dl.forEach(link => { const h = link.getAttribute('href'); if (h === cp || (cp === 'player.html' && h === 'personal_stats.html')) link.classList.add('active'); }); } }

function initCommon() {
    initSearch();
    highlightNavByPath();
    initVizMobileNav();
    if (typeof Chart !== 'undefined') Chart.defaults.devicePixelRatio = Math.min(window.devicePixelRatio || 1, 2);
    window.addEventListener('scroll', updateSideNavHighlight);
    updateSideNavHighlight();
}

function initVizMobileNav() {
    const sideNav = document.querySelector('.side-nav');
    if (!sideNav || document.getElementById('vizMobileNav')) return;
    const list = sideNav.querySelector('.side-nav-list');
    if (!list) return;
    const srcLinks = list.querySelectorAll('.side-nav-link');
    if (!srcLinks.length) return;
    const nav = document.createElement('nav');
    nav.className = 'viz-mobile-nav';
    nav.id = 'vizMobileNav';
    nav.setAttribute('aria-label', '页面章节导航');
    const inner = document.createElement('div');
    inner.className = 'viz-tab-list';
    srcLinks.forEach(src => {
        const a = document.createElement('a');
        a.className = 'viz-tab-link';
        const href = src.getAttribute('href') || '#';
        a.setAttribute('href', href);
        const sec = src.getAttribute('data-section');
        if (sec) a.setAttribute('data-section', sec);
        const key = src.getAttribute('data-i18n');
        if (key) a.setAttribute('data-i18n', key);
        a.textContent = (src.textContent || '').trim();
        a.addEventListener('click', e => {
            e.preventDefault();
            const t = document.querySelector(href);
            if (t) t.scrollIntoView({ behavior: 'smooth', block: 'start' });
        });
        inner.appendChild(a);
    });
    nav.appendChild(inner);
    const target = document.querySelector('.viz-main-section');
    if (target) target.before(nav);
    else document.body.insertBefore(nav, document.body.firstChild);
}
