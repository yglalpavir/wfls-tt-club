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
    // 搜索按钮：插入到 nav-actions 最前面
    var actions = document.querySelector('.nav-actions');
    if (!document.getElementById('searchToggle')) {
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
    }
    // 搜索遮罩层：与按钮分开补齐 —— 共享导航自带按钮的页面此前会在这里整体跳过，
    // 导致遮罩缺失、搜索按钮点了没反应（此前仅 index/contact 静态内置遮罩的页面搜索可用）
    if (!document.getElementById('searchOverlay')) {
        var overlay = document.createElement('div');
        overlay.className = 'search-overlay';
        overlay.id = 'searchOverlay';
        overlay.innerHTML = '<div class="search-modal glass-card"><div class="search-header"><div class="search-input-wrapper"><i class="fa-solid fa-magnifying-glass search-input-icon"></i><input type="text" class="search-input" id="searchInput" placeholder="搜索..." autocomplete="off"><button class="search-clear" id="searchClear" style="display:none;"><i class="fa-solid fa-xmark"></i></button></div><button class="search-close-btn" id="searchClose"><i class="fa-solid fa-xmark"></i></button></div><div class="search-results" id="searchResults"><div class="search-placeholder"><i class="fa-solid fa-magnifying-glass"></i><p data-i18n="search_input_hint">输入关键词开始搜索</p><p class="search-hint" data-i18n="search_hint_info">支持搜索标题、内容、姓名等</p></div></div></div></div>';
        document.body.appendChild(overlay);
    }
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

// 内容列表加载失败时的错误占位 + 重试按钮（替代静默渲染空白网格）
function showContentLoadFail(containerId, retryFn) {
    var el = document.getElementById(containerId);
    if (!el) return;
    el.innerHTML = '';
    var box = document.createElement('div');
    box.style.cssText = 'grid-column:1/-1;text-align:center;padding:48px 20px;';
    box.innerHTML = '<i class="fa-solid fa-triangle-exclamation" style="font-size:1.8rem;color:var(--accent-red);"></i>'
        + '<p style="margin:12px 0 2px;color:var(--accent-red);font-weight:600;">' + escapeHtml(i18n[currentLang].content_load_fail) + '</p>'
        + '<p style="font-size:0.85rem;margin:0 0 16px;color:var(--text-tertiary);">' + escapeHtml(i18n[currentLang].content_load_fail_hint) + '</p>';
    var btn = document.createElement('button');
    btn.className = 'btn btn-sm btn-primary';
    btn.textContent = i18n[currentLang].detail_retry;
    btn.addEventListener('click', () => { if (typeof retryFn === 'function') retryFn(); });
    box.appendChild(btn);
    el.appendChild(box);
}

// 内容列表为空时的占位提示
function showContentEmptyState(containerId) {
    var el = document.getElementById(containerId);
    if (!el) return;
    var box = document.createElement('div');
    box.style.cssText = 'grid-column:1/-1;text-align:center;padding:48px 20px;color:var(--text-tertiary);';
    box.innerHTML = '<i class="fa-solid fa-inbox" style="font-size:1.6rem;display:block;margin-bottom:10px;opacity:.6;"></i><p data-i18n="content_empty">' + escapeHtml(i18n[currentLang].content_empty) + '</p>';
    el.appendChild(box);
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
        site_title: "武汉外国语学校乒乓球社团 | WFLS Table Tennis Club", nav_home: "Home", nav_news: "News", nav_competitions: "Competitions", nav_contact: "Contact", nav_more: "More... <i class='fa-solid fa-chevron-down'></i>", nav_members: "社团骨干", nav_data_viz: "数据可视化 <span class='beta-tag'>Beta</span>", nav_season_review: "赛季总结", nav_personal: "个人数据", nav_qa: "Q&A", nav_changelog: "更新日志", nav_docs: "网站文档", lang_btn: "EN",
        hero_title: "武汉外国语学校<br><span class='hero-title-accent'>乒乓球社团</span>", hero_slogan: "挥拍逐梦，旋转青春", hero_btn_about: "了解社团 <i class='fa-solid fa-arrow-right'></i>", hero_btn_join: "加入我们 <i class='fa-solid fa-plus'></i>", scroll: "Scroll",
        side_home: "首页", side_philosophy: "社团理念", side_activities: "社团活动", side_members: "社团骨干", side_news: "最新动态", side_competitions: "赛事信息",
        philosophy_tag: "Philosophy", philosophy_title: "社团理念", philosophy_desc: "我们的核心价值观与指导思想",
        activities_tag: "Activities", activities_title: "社团活动", activities_desc: "全年性活动、社团课活动及年度大赛",
        members_tag: "Core Members", members_title: "社团骨干",
        news_tag: "Latest News", news_title: "最新动态", news_desc: "关注社团最新活动与公告", news_all: "查看全部动态",
        comp_tag: "Competitions", comp_title: "赛事信息", comp_desc: "近期比赛安排与成绩", comp_all: "查看全部赛事",
        hl_tag: "Highlights", hl_title: "最新快报", hl_desc: "社团最新动态与赛事信息一览",
        contact_page_title: "联系我们 | WFLS Table Tennis Club", contact_tag: "Contact", contact_title: "加入我们", contact_desc: "扫描二维码加入社团QQ群", contact_text: "扫码加入社团QQ群，与我们一起挥拍逐梦", contact_btn: "扫描二维码加入社团群", contact_qr_title: "社团QQ群二维码", contact_qr_desc: "扫码加入社团QQ群，与我们一起挥拍逐梦",
        footer_brand: "武汉外国语学校乒乓球社团", footer_motto: "挥拍逐梦，旋转青春", footer_nav: "快速导航", footer_school: "学校信息", footer_school_name: "武汉外国语学校", footer_location: "湖北省武汉市",
        modal_title: "社团QQ群二维码", modal_desc: "扫描下方二维码加入社团QQ群", modal_note: "二维码定期更新，如有问题请联系社团管理员",
        news_page_title: "近期动态 | WFLS Table Tennis Club", news_hero_tag: "News & Updates", news_hero_title: "近期动态", news_hero_desc: "社团活动 / 训练安排 / 重要公告", news_list_tag: "All News", news_list_title: "全部动态",
        comp_page_title: "赛事信息 | WFLS Table Tennis Club", comp_hero_tag: "Competitions", comp_hero_title: "赛事信息", comp_hero_desc: "比赛安排 / 成绩记录 / 赛事回顾", comp_list_tag: "All Competitions", comp_list_title: "全部赛事",
        members_page_title: "社团骨干 | WFLS Table Tennis Club",
        rank_page_title: "Ranking Beta | WFLS Table Tennis Club", rank_hero_desc: "社团积分排名系统 · 支持多时间节点对比 · 点击姓名查看积分明细", rank_tag: "Data Table", rank_title: "积分数据表", rank_sort_hint: "当前排序：", rank_sidebar_title: "时间节点", rank_rules_pill: "积分相关规则", rank_rules_menu_q1: "积分计算方法", rank_qa_btn_doubles: "双打计分规则",
        rank_col_rank: "#", rank_col_name: "姓名", rank_col_points: "当前积分", rank_col_points_change: "积分变化", rank_col_change: "排名变化", rank_col_matches: "总场次", rank_col_winrate: "胜率",
        rank_export_btn: "导出图片", rank_export_gen: "生成于", rank_export_fail: "图片导出失败，请重试",
        export_gen: "生成于", img_export_fail: "图片导出失败，请重试", detail_export_btn: "导出图片",
        rank_export_delta_ref: "积分/排名变化对比：{date}", rank_export_menu_all: "导出全部", rank_export_menu_top12: "导出前12名", rank_export_top_sub: "前{n}名", rank_export_topn_prefix: "导出前", rank_export_topn_suffix: "名", rank_export_menu_go: "导出", rank_export_menu_invalid: "请输入有效的名次（正整数）",
        score_detail_title: "积分明细", score_col_date: "日期", score_col_type: "类型", score_col_opponent: "对手", score_col_result: "结果", score_col_score: "比分", score_col_score_before: "赛前积分", score_col_change: "积分变动", score_col_score_after: "赛后积分", score_result_win: "胜", score_result_loss: "负",
        rank_mode_singles: "单打", rank_mode_doubles: "双打", rank_doubles_empty: "暂无双打记录，录入双打比赛后此处将生成组合积分榜",
        mrank_search_ph: "搜索成员", mrank_sort_title: "排序方式", mrank_no_result: "没有匹配的成员", mrank_close: "关闭", mrank_expand_detail: "查看积分明细",
        mrank_c_m: "场次", mrank_c_w: "胜率", mrank_c_pc: "变化", mrank_c_p: "积分",
        pp_doubles_title: "双打战绩", pp_doubles_partner: "搭档", pp_doubles_summary: "双打共 {n} 场，胜 {w} 场，胜率 {r}%",
        tag_match: "赛事", tag_training: "训练", tag_notice: "公告", tag_event: "活动", tag_daily: "日常", tag_upcoming: "即将开始", tag_result: "比赛结果", tag_live: "进行中",
        filter_all: "全部",
        detail_page_title: "详情 | WFLS Table Tennis Club", detail_back: "返回列表", detail_version_updated: "更新于 {date}", detail_version_list: "历史版本", detail_version_view: "查看", detail_version_viewing: "正在查看 v{version}（更新于 {date}）", detail_version_back: "返回 v{version}", pdf_preview_btn: "预览PDF", pdf_download_btn: "下载PDF", detail_loading: "内容加载中…", detail_not_found: "未找到内容", detail_load_fail: "加载失败，请稍后重试", detail_load_fail_hint: "内容可能已被移除，或网络出现异常。", detail_retry: "重试",
        search_placeholder: "搜索新闻、赛事、成员、排名、更新日志...", search_no_results: "未找到相关结果", search_type_news: "新闻", search_type_competition: "赛事", search_type_member: "成员", search_type_ranking: "排名", search_type_qa: "问答", search_type_changelog: "更新日志",
        qa_page_title: "常见问题 | WFLS Table Tennis Club", qa_hero_tag: "Q&A", qa_hero_title: "常见问题", qa_hero_desc: "加入社团 / 活动安排 / 积分系统 / 比赛报名", qa_list_tag: "All Q&A", qa_list_title: "全部问答",
        pagination_prev: "上一页", pagination_next: "下一页", pagination_info: "第 {current} 页，共 {total} 页",
        data_viz_page_title: "数据可视化 | WFLS Table Tennis Club", data_viz_tag: "Data Visualization", data_viz_title: "数据可视化", data_viz_desc: "积分趋势 · 排名变化 · 球员对比",
        data_viz_points_trend: "积分趋势", data_viz_rank_stream: "排名变化河流图", data_viz_player_compare: "球员对比", data_viz_select_players: "选择球员（最多8人）", data_viz_select_player_a: "球员 A", data_viz_select_player_b: "球员 B", data_viz_apply: "应用", data_viz_top_n: "显示前", data_viz_head_to_head: "历史交手记录",
        data_viz_recent: "最近", data_viz_data_points: "个数据点", data_viz_top_n_suffix: "名球员", data_viz_compare_btn: "对比", data_viz_compare_placeholder: "选择两名球员进行对比分析", data_viz_no_players: "暂无球员数据", data_viz_alert_select_one: "请至少选择一名球员", data_viz_alert_max: "最多选择15名球员", data_viz_alert_two: "请选择两名球员", data_viz_alert_diff: "请选择不同的球员", data_viz_select_player_ph: "-- 选择球员 --", data_viz_win: "胜", data_viz_total_h2h: "总交手: {n} 场", data_viz_recent_match: "最近: {date} (胜者: {winner})", data_viz_pts_change: "{player} 积分变动", data_viz_no_h2h: "暂无交手记录", data_viz_col_date: "日期", data_viz_col_type: "类型", data_viz_col_winner: "胜者", data_viz_axis_points: "积分", data_viz_axis_rank: "排名", data_viz_rank_suffix: "第{n}名", data_viz_topn_select_title: "填写1-20的任意正整数", data_viz_bins_title: "填写4-100的任意正整数", data_viz_cur_score: "当前积分", data_viz_h2h_rate: "交手胜率", data_viz_pred_rate: "预测胜率", data_viz_prepare: "准备下载数据文件...", data_viz_topn_title: "显示最近N个数据点", data_viz_stream_title: "显示最近N个数据点", data_viz_loading: "加载数据中...", data_viz_downloading: "正在下载 {label} ({i}/{total}): {file}", data_viz_calculating: "正在计算排名积分...", data_viz_load_fail: "❌ 排名数据加载失败，请刷新页面重试", data_viz_file_players: "球员档案", data_viz_file_matches: "比赛记录", data_viz_file_initial: "初始积分", data_viz_file_event: "赛事系数", data_viz_file_decay: "衰减配置", data_viz_file_season: "赛季配置", data_viz_no_player_list: "❌ 无法获取球员列表",
        ps_ov_total: "总场次", ps_ov_wins: "获胜", ps_ov_losses: "失利", ps_ov_rate: "胜率", ps_ov_points: "当前积分",
        ps_sum1: "{player}共进行了{total}盘单打比赛，其中获胜{wins}盘，失利{losses}盘。", ps_sum2: "{player}的胜率为{percent}%。",
        ps_tags_label: "标签", ps_honors_label: "荣誉", ps_date_ymd: "{y}年{m}月{d}日",
        ps_card_victory: "胜利 · 曾战胜的前三名", ps_card_pk: "PK · 曾交手的前三名", ps_card_lucky: "拿捏", ps_card_nemesis: "克星",
        ps_none: "暂无", ps_card_sub: "{w}胜{l}负 胜率:{wr}%",
        content_load_fail: "内容加载失败", content_load_fail_hint: "网络异常或数据暂时不可用，请稍后重试。", content_empty: "暂无内容",
        detail_prev: "上一篇", detail_next: "下一篇", detail_no_prev: "没有上一篇了", detail_no_next: "没有下一篇了",
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
        dv_fullscreen: "全屏显示 (网页内)", dv_zoom_out: "缩小", dv_zoom_in: "放大", dv_zoom_fit: "适应内容", dv_zoom_reset: "重置视图", dv_search_placeholder: "搜索选手 / 队伍，高亮晋级路径", dv_champion: "冠军", dv_status_scheduled: "待赛", dv_status_live: "比赛进行中", dv_tbd: "待定", dv_total_score: "总比分", dv_round_1: "第一轮", dv_round_2: "第二轮", dv_quarters: "1/4决赛", dv_semis: "半决赛", dv_final: "决赛", dv_round_n: "第{n}轮", dv_legend_win: "胜者", dv_legend_loss: "负者", dv_legend_live: "进行中", dv_legend_pending: "待赛", dv_legend_path: "晋级路径",
        rank_no_data: "暂无排名数据", rank_no_records: "暂无记录", rank_add_short: "加分", rank_ppl: "{n}人", rank_node_count: "{n}个节点",
        rank_loading: "正在加载排名数据...", rank_prepare: "准备下载数据文件...", rank_download_file: "正在下载 {label} ({i}/{total}): {file}", rank_calculating: "正在计算排名积分（此过程可能较慢，请耐心等待）...", rank_calc_fail: "无法计算排名数据",
        rank_view_player_page: "查看个人数据页", rank_click_detail: "点击查看积分明细",
        rank_season_expired: "当前日期已超出最后一个赛季（{date}）：新比赛会暂计入该赛季的延伸区间，但不会触发跨赛季积分继承。请在 data/seasons.json 中创建新赛季。",
        changelog_page_title: "更新日志 | WFLS Table Tennis Club", changelog_hero_tag: "Changelog", changelog_hero_title: "更新日志", changelog_hero_desc: "版本历史 · 功能更新 · 问题修复", changelog_list_tag: "Version History", changelog_list_title: "版本历史", changelog_empty: "暂无更新日志",
        docs_page_title: "网站文档 | WFLS Table Tennis Club", docs_title: "网站文档", docs_desc: "浏览与预览站点文档与静态资源：图片 · 视频 · 音频 · PDF · 文本代码",
        docs_search_ph: "在当前目录筛选…", docs_loading: "正在扫描 Assets 目录…", docs_retry: "重试",
        docs_err_title: "未能加载 Assets/manifest.json", docs_err_hint: "该文件在部署时由 deploy 工作流自动生成；本地开发请先运行：",
        docs_view_list: "切换为列表视图", docs_view_grid: "切换为网格视图", docs_refresh: "重新扫描 Assets",
        docs_filter_aria: "按类型筛选", docs_crumb_aria: "目录路径", docs_pv_dialog: "文件预览",
        docs_unit_dirs: "{n} 个子文件夹", docs_unit_files: "{n} 个文件", docs_folder_empty: "空文件夹",
        docs_empty_dir: "此文件夹为空", docs_empty_search: "没有匹配「{q}」的条目",
        docs_type_folder: "文件夹", docs_type_image: "图片", docs_type_svg: "SVG 矢量图", docs_type_video: "视频", docs_type_audio: "音频", docs_type_pdf: "PDF 文档", docs_type_markdown: "Markdown", docs_type_text: "文本/代码", docs_type_sheet: "表格", docs_type_doc: "Word 文档", docs_type_ppt: "PPT 演示", docs_type_archive: "压缩包", docs_type_other: "文件",
        docs_f_all: "全部", docs_f_image: "图片", docs_f_video: "视频", docs_f_audio: "音频", docs_f_text: "文本/代码", docs_f_doc: "文档",
        docs_pv_source: "查看源码", docs_pv_rendered: "图片预览", docs_wrap_on: "自动换行", docs_wrap_off: "不换行",
        docs_pv_zoom_reset: "复位缩放（双击图片亦可）", docs_open_new: "新窗口打开", docs_download: "下载", docs_download_file: "下载文件",
        docs_close: "关闭（Esc）", docs_prev: "上一个（←）", docs_next: "下一个（→）",
        docs_pv_hint: "<kbd>Esc</kbd> 关闭 · <kbd>←</kbd><kbd>→</kbd> 切换 · 图片支持滚轮缩放 / 拖动平移 / 双击复位",
        docs_unsupported: "该格式暂不支持网页内预览", docs_loading_text: "加载中…",
        docs_img_fail: "图片加载失败", docs_video_fail: "浏览器不支持直接播放该视频格式（如 MOV），请下载后播放", docs_audio_fail: "浏览器不支持该音频格式", docs_text_fail: "文本内容加载失败", docs_md_fail: "Markdown 加载失败",
        docs_trunc_note: "文件较大，仅显示前 {n} MB，完整内容请下载查看。",
        tag_release: "正式发布", tag_feature: "新功能", tag_fix: "修复",
        draws_tab_content: "赛事详情", draws_tab_bracket: "对阵表",
        wtt_hero_desc: "WTT 排名查询 · 点击姓名查看积分明细", wtt_dataviz_title: "WTT 数据可视化", wtt_dataviz_btn: "查看 WTT 数据可视化", wtt_personal_title: "WTT 个人数据", wtt_personal_btn: "查看 WTT 个人数据", wtt_table_title: "WTT 积分数据表", wtt_loading: "正在加载 WTT 数据...", wtt_click_detail: "点击查看积分明细", wtt_error_fail: "WTT排名数据加载失败，请刷新页面重试",
        wtt_back_hub: "返回 WTT Hub",
        sort_desc: "降序", sort_asc: "升序",
        wtt_file_matches: "比赛记录", wtt_file_initial: "初始积分", wtt_file_event: "赛事系数", wtt_file_season: "赛季配置",
        wtt_prepare: "准备下载数据文件...", wtt_downloading: "正在下载 {label} ({i}/{total}): {file}", wtt_calculating: "正在计算排名积分...", wtt_snapshot: "快照 {current}/{total}", wtt_elapsed: "已用时 {s}s",
        wtt_default_season: "默认赛季", wtt_node_count: "{n}个节点", wtt_ppl: "{n}人",
        wtt_no_records: "暂无记录", wtt_cant_compute: "无法计算WTT排名数据", wtt_bonus: "加分",
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
        wtt_cat_ms: "男子单打", wtt_cat_ws: "女子单打", wtt_cat_md: "男子双打", wtt_cat_wd: "女子双打", wtt_cat_xd: "混合双打",
        nav_submit: "提交战绩", submit_page_title: "提交战绩 | WFLS Table Tennis Club",
        sb_hero_tag: "Submit", sb_hero_title: "提交战绩", sb_hero_desc: "比赛结果 / 审核通过后自动计入排名", sb_form_title: "记录录入",
        sb_date: "日期", sb_type: "类型", sb_format: "赛制", sb_winner: "胜者", sb_loser: "负者", sb_add: "添加到队列",
        sb_score_toggle: "记录比分（可选）", sb_score_total: "总比分（胜-负）", sb_games: "逐局分数（胜者视角，逗号分隔）", sb_games_label: "局分",
        sb_note: "备注（可选）", sb_submitter: "你的昵称（可选，公开可见）", sb_remove: "移除", sb_warn_unknown: "不在册",
        sb_btn_github: "通过 GitHub 提交", sb_btn_copy: "复制 JSON", sb_btn_clear: "清空",
        sb_hint_github: "跳转 GitHub 需登录 GitHub 账号；提交后可在 issue 中查看审核进度。",
        sb_hint_public: "提交内容公开可见，请勿填写联系方式。",
        sb_hint_paste: "若跳转后输入框为空，请点「复制 JSON」后手动粘贴。",
        sb_err_fill: "请完整填写日期 / 类型 / 胜者 / 负者", sb_err_same: "胜者与负者不能相同",
        sb_err_date: "日期格式需为 YYYY-MM-DD", sb_err_future: "日期不能是未来",
        sb_err_score: "总比分需为胜方局数大于负方局数（如 3-1）", sb_err_games: "逐局分数格式应为 11-9，且无平局",
        sb_err_mismatch: "逐局分数与总比分不一致", sb_ok_added: "已加入队列", sb_err_empty: "队列为空",
        sb_ok_copied: "已复制，可发到社团 QQ 群由管理员代录", sb_err_copy: "复制失败，请手动选择文本",
        sb_err_types: "赛事类型加载失败", sb_err_players: "球员数据加载失败",
        sb_quick_title: "在线提交比赛战绩", sb_quick_btn: "打开提交表单",
        sb_step1: "在线填写结果", sb_step2: "管理员审核", sb_step3: "计入积分排名",
        sb_quick_desc: "无需 GitHub：点击下方按钮，在腾讯文档表单里填写比赛结果，管理员审核后统一计入排名。",
        sb_quick_missing: "提交表单链接尚未配置（管理员：把收集表链接填入本页 TENCENT_FORM_URL）。",
        /* ---- 赛季总结页 ---- */
        sr_page_title: "赛季总结 | WFLS Table Tennis Club",
        sr_hero_tag: "Season Review", sr_hero_title: "赛季总结", sr_hero_desc: "胜负 · 积分 · 连胜 · 赛季之最",
        sr_season_label: "选择赛季", sr_ongoing_badge: "进行中", sr_realtime_note: "截至今天",
        sr_entry_btn: "查看赛季总结", sr_kpi_events: "赛事数", sr_kpi_snapshots: "月度快照",
        sr_loading: "正在加载赛季数据...",
        sr_kpi_matches: "总场次", sr_kpi_players: "参与人数", sr_kpi_bonus: "积分调整", sr_kpi_types: "赛事类型",
        sr_types_none: "本季暂无对局",
        sr_points_title: "积分变化榜", sr_points_desc: "赛季初始 vs 最新快照（仅含当季有对局的球员）",
        sr_col_delta: "积分变化", sr_col_rank_delta: "名次变化", sr_col_end_points: "最新积分",
        sr_streak_title: "连胜榜", sr_col_max_streak: "最长连胜", sr_col_cur: "当前状态", sr_cur_streak: "{n} 连胜", sr_cur_loss: "上场告负", sr_col_record: "当季战绩",
        sr_attend_title: "出勤榜", sr_col_matches: "场次", sr_col_wins: "胜", sr_col_losses: "负", sr_col_winrate: "胜率",
        sr_best_title: "单场得分之最", sr_best_desc: "当季原始得分（未衰减）最高的一场", sr_best_none: "本季暂无对局", sr_best_gap: "赛前分差",
        sr_games_title: "局分亮点", sr_games_none: "本季暂无含局分的对局——录入战绩时可附带总比分与逐局分数",
        sr_games_count: "含局分对局", sr_deciding: "打满决胜局", sr_comeback: "逆转翻盘", sr_max_margin: "最大单局分差", sr_games_list: "对局明细",
        sr_bonus_title: "积分调整审计", sr_bonus_desc: "当季「比赛结果加分」全部记录，调整前积分公开可查",
        sr_col_target: "对象", sr_col_amount: "分数", sr_col_pre: "调整前积分",
        sr_bonus_none: "本季暂无积分调整记录", sr_bonus_summary: "{n} 次调整 · 净 {net} 分 · 涉及 {m} 人", sr_bonus_total: "合计",
        sr_no_data: "该赛季还没有任何对局记录",
        sr_daily_title: "按日积分走势", sr_daily_desc: "点选球员查看其本赛季积分的逐日走势（至多 10 人）；各日取截至当日的实时口径，俱乐部模式含时间衰减。",
        sr_daily_search: "搜索球员…", sr_daily_clear: "清空", sr_daily_max: "最多同时显示 10 人",
        sr_daily_empty: "请点选上方球员绘制曲线", sr_daily_start: "赛季初", sr_daily_axis: "积分",
        /* ---- WTT 赛季总结 ---- */
        wtt_sr_page_title: "WTT 赛季总结 | WFLS TT Club",
        wtt_sr_hero_tag: "WTT Season Review", wtt_sr_hero_title: "WTT 赛季总结", wtt_sr_hero_desc: "胜负 · 积分 · 连胜 · 赛季之最",
        wtt_sr_footnote: "WTT 彩蛋玩法：数据口径与 WTT 排名一致（零和积分、无时间衰减）。",
        /* ---- 比赛详情页 ---- */
        md_page_title: "比赛详情 | WFLS Table Tennis Club",
        md_hero_tag: "Match Detail", md_hero_title: "比赛详情", md_hero_desc: "比分 · 积分 · 胜率 · 交锋",
        md_back_ranking: "返回排名",
        md_winner_badge: "胜", md_loser_badge: "负",
        md_pre_score: "赛前积分", md_post_score: "赛后积分", md_change: "本场变化", md_eff_now: "当前计入",
        md_score_title: "大比分", md_games_title: "小比分（局分）",
        md_score_none: "未记录比分",
        md_score_none_hint: "该场比赛没有比分数据。提交赛果时填写比分/局分即可在此展示。",
        md_score_none_hint_wtt: "该场比赛没有比分数据。录入战绩时附带比分/局分即可在此展示。",
        md_games_note: "局分为胜者视角：每局前者为胜者得分。",
        md_format_label: "赛制", md_season_label: "赛季",
        md_breakdown_title: "积分产生明细",
        md_breakdown_base: "基础分", md_breakdown_gap: "赛前分差",
        md_breakdown_base_lead: "胜者积分领先", md_breakdown_base_upset: "胜者以低打高（逆袭加成）",
        md_breakdown_event: "赛事系数", md_breakdown_format: "赛制系数",
        md_breakdown_decay: "时间权重（含定格）", md_breakdown_decay_off: "不衰减",
        md_breakdown_result: "产生积分",
        md_breakdown_loser_note: "负者按 {n} 倍扣除：−{val}",
        md_pred_title: "赛前胜率预测",
        md_pred_hit: "预测命中", md_pred_upset: "冷门!",
        md_pred_model_note: "三因子模型：Elo 积分 60% · 历史交锋 20% · 近期状态 20%（无交锋时 Elo 70% · 状态 30%）",
        md_pred_form: "近期状态",
        md_h2h_title: "历史交锋",
        md_h2h_summary: "赛前共交锋 {n} 场：{a} {aw} 胜 · {b} {bw} 胜",
        md_h2h_none: "赛前两人（队）没有交手记录",
        md_col_score: "比分",
        md_not_found_title: "未找到该比赛记录",
        md_not_found_hint: "链接可能已失效（记录被修改或参数不完整）。请从排名页或球员页重新进入。",
        md_load_fail: "数据加载失败",
        md_retry: "重试",
        md_early_date: "该比赛日期早于最早赛季，无法回放积分。",
        md_status_ft: "已结束", md_sets_col: "局", md_pts_total: "总得分",
        md_copy_link: "复制链接", md_copied: "已复制",
        md_occurrence: "当日第 {n} 场",
        md_official: "Official",
        md_periods_title: "逐局比分", md_final_col: "赛果", md_game_col: "第 {n} 局",
        md_tabs_games: "局分", md_tabs_points: "积分明细", md_tabs_pred: "胜率预测", md_tabs_h2h: "历史交锋",
        /* ---- docs browser (missing keys) ---- */
        docs_copy_text: "复制全文", docs_copy_link: "复制链接",
        nav_aria_search: "搜索", nav_aria_theme: "切换主题", nav_aria_lang: "切换语言", nav_aria_menu: "菜单",
        wtt_win: "胜",
        /* ---- 事件类型词典（显示层；数据键保持中文） ---- */
        ev_normal: "普通", ev_ranked: "排位赛", ev_challenge: "挑战赛", ev_school_league: "校乒联赛", ev_top12: "十二强赛", ev_school_team: "校乒赛团体", ev_school_singles: "校乒赛单打", ev_doubles: "双打",
        /* ---- WTT 赛事类型词典 ---- */
        wtt_ev_tleague: "T联赛", wtt_ev_ittf_open: "ittf公开赛", wtt_ev_ittf_regular: "ittf常规赛", wtt_ev_ittf_platinum: "ittf白金赛", wtt_ev_worlds: "世乒赛", wtt_ev_worlds_team: "世乒赛团体", wtt_ev_worldcup: "世界杯", wtt_ev_worldcup_team: "世界杯团体", wtt_ev_csl: "乒超联赛", wtt_ev_asiad: "亚运会", wtt_ev_asiad_team: "亚运会团体", wtt_ev_alljapan: "全日锦", wtt_ev_nationalgames: "全运会", wtt_ev_nationals: "全锦赛", wtt_ev_champions: "冠军赛", wtt_ev_grandsmash: "大满贯", wtt_ev_olympics: "奥运会", wtt_ev_olympics_team: "奥运会团体", wtt_ev_challenge_reg: "常规挑战赛", wtt_ev_dfbpokal: "德国杯", wtt_ev_bundesliga: "德甲联赛", wtt_ev_bundesliga_final: "德甲联赛决赛", wtt_ev_bundesliga_semi: "德甲联赛半决赛", wtt_ev_finals: "总决赛", wtt_ev_feeder: "支线赛", wtt_ev_euroleague_team: "欧冠团体", wtt_ev_continental_cup: "洲杯赛", wtt_ev_continental_champs: "洲锦赛", wtt_ev_continental_team: "洲锦赛团体", wtt_ev_star: "球星挑战赛",
        /* ---- 赛季标签词典（按 seasons.json id/label 查；label 是引擎 join key 不可改） ---- */
        season_2026_spring: "2026年春季学期", season_2026_summer: "2026年暑假", season_2026_autumn: "2026年秋季学期",
        /* ---- 球员标签 / 荣誉词典 ---- */
        ptag_school_team: "校队成员", ptag_grand_slam: "大满贯", ptag_pres_2627: "26-27年社长", ptag_vp_2627: "26-27年副社长", ptag_pres_2526: "25-26年社长", ptag_vp_2526: "25-26年副社长", ptag_vp_2425: "24-25年副社长", ptag_penholder1: "校一直板", ptag_penholder2: "校二直板",
        phonor_s25_singles_1: "校乒赛2025单打冠军", phonor_s26_singles_1: "校乒赛2026单打冠军", phonor_s26_singles_2: "校乒赛2026单打亚军", phonor_s26_singles_3: "校乒赛2026单打季军", phonor_s26_team_1: "校乒赛2026团体冠军", phonor_s26_team_2: "校乒赛2026团体亚军", phonor_s26_team_3: "校乒赛2026团体季军", phonor_s25_team_3: "校乒赛2025团体季军",
        ps_tag_group_leaders: "社长/副社长",
        /* ---- 通用日期模板 ---- */
        date_ymd: "{y}年{m}月{d}日", date_ym: "{y}年{m}月", date_md: "{m}月{d}日",
        /* ---- SEO keywords（<meta name="keywords">） ---- */
        home_kw: "武汉外国语学校,乒乓球,社团,WFLS,Table Tennis,排名,积分",
        news_kw: "武汉外国语学校,WFLS,乒乓球,社团动态,训练安排,比赛公告",
        comp_kw: "武汉外国语学校,WFLS,乒乓球,比赛,赛事,成绩",
        members_kw: "武汉外国语学校,WFLS,乒乓球,社团成员,骨干",
        rank_kw: "武汉外国语学校,WFLS,乒乓球,积分排名,ELO,排名系统",
        data_viz_kw: "武汉外国语学校,WFLS,乒乓球,数据可视化,积分趋势,排名变化",
        data_viz_meta_desc: "WFLS 乒乓球社团数据可视化。积分趋势图、排名变化河流图、球员对比分析。",
        data_viz_race_play_aria: "播放/暂停",
        personal_stats_kw: "武汉外国语学校,WFLS,乒乓球,个人数据,球员数据,战绩分析",
        personal_stats_meta_desc: "WFLS 乒乓球社团个人数据。查看球员个人战绩、胜率、对手分析等详细数据。",
        detail_kw: "武汉外国语学校,WFLS,乒乓球,详情",
        md_kw: "武汉外国语学校,WFLS,乒乓球,比赛详情,比分,局分,积分,胜率,交锋",
        qa_kw: "武汉外国语学校,WFLS,乒乓球,常见问题,问答,Q&A",
        changelog_kw: "武汉外国语学校,WFLS,乒乓球,更新日志,Changelog,版本历史",
        contact_kw: "武汉外国语学校,WFLS,乒乓球,加入社团,QQ群",
        submit_kw: "武汉外国语学校,WFLS,乒乓球,提交战绩,比赛记录,积分",
        sr_kw: "武汉外国语学校,WFLS,乒乓球,赛季总结,积分变化,连胜,积分调整",
        wtt_hub_kw: "WTT,世界乒联,乒乓球,积分排名,男子单打,女子单打,男子双打,女子双打,混合双打",
        wtt_ranking_kw: "WTT,世界乒联,乒乓球,积分排名,国际乒联",
        wtt_player_kw: "WTT,世界乒联,乒乓球,个人数据,球员数据,战绩分析",
        wtt_ps_kw: "WTT,世界乒联,乒乓球,个人数据,球员数据,战绩分析",
        wtt_dataviz_kw: "WTT,世界乒联,乒乓球,数据可视化,积分趋势,排名变化",
        wtt_assoc_kw: "WTT,世界乒联,乒乓球,协会数据,协会排名,实力榜,对抗矩阵",
        /* ---- docs 浏览器静态控件 ---- */
        docs_filter_ph: "在当前目录筛选…", docs_filter_files_aria: "筛选文件",
        docs_scope_title: "搜索范围：当前目录", docs_view_toggle_title: "切换视图",
        docs_breadcrumb_aria: "目录路径", docs_type_filter_aria: "按类型筛选",
        docs_sort_name: "名称", docs_preview_aria: "文件预览",
        media_download_file: "下载文件",
        /* ---- 页面级文案：SEO / 404 / ranking / WTT / admin（补齐 HTML 已引用但字典缺失的 key） ---- */
        nf_page_title: "404 - 页面未找到 | WFLS Table Tennis Club",
        nf_meta_desc: "WFLS Table Tennis Club - 页面未找到",
        nf_title: "这里不存在页面~",
        nf_desc: "你访问的页面可能已被移除、更名，或暂时不可用。",
        nf_guess: "猜你想找",
        nf_home: "返回首页",
        nf_news: "新闻",
        nf_ranking: "排名",
        nf_countdown: "秒后自动跳转回首页",
        home_meta_desc: "武汉外国语学校乒乓球社团官方网站。了解社团理念、活动，查看最新动态和赛事信息。",
        home_og_title: "武汉外国语学校乒乓球社团",
        home_og_desc: "WFLS Table Tennis Club - 挥拍逐梦，旋转青春",
        home_rss_title: "WFLS Table Tennis Club - 社团动态",
        news_feed_title: "WFLS Table Tennis Club - 社团动态",
        home_ball_title: "🌟 彩蛋：3D 乒乓球",
        home_ball_aria: "彩蛋：3D 乒乓球",
        home_last_updated: "上次更新：获取中...",
        home_search_clear_aria: "清空搜索词",
        home_search_close_aria: "关闭搜索",
        mrank_search_clear: "清空搜索",
        news_meta_desc: "WFLS 乒乓球社团最新动态。查看社团活动通知、训练安排、比赛公告等。",
        comp_meta_desc: "WFLS 乒乓球社团赛事信息。查看比赛安排、成绩记录、赛事回顾。",
        qa_meta_desc: "WFLS 乒乓球社团常见问题解答。查看加入社团、活动安排、积分系统等常见问题。",
        changelog_meta_desc: "WFLS 乒乓球社团网站更新日志。记录网站版本更新历史和功能变更。",
        contact_meta_desc: "加入 WFLS 乒乓球社团。扫描二维码加入社团QQ群。",
        members_meta_desc: "WFLS 乒乓球社团骨干成员介绍。",
        detail_meta_desc: "WFLS 乒乓球社团内容详情页。查看新闻、赛事、成员等详细内容。",
        detail_shell_title: "标题",
        md_meta_desc: "WFLS 乒乓球社团单场比赛详情：大比分、局分、双方赛前赛后积分、积分产生明细、赛前胜率预测与历史交锋。",
        player_meta_desc: "WFLS 乒乓球社团球员个人主页。查看球员个人战绩、胜率、积分趋势、对手分析等详细数据。",
        player_meta_desc_short: "WFLS 乒乓球社团球员个人主页。",
        player_og_title: "球员个人数据 | WFLS Table Tennis Club",
        rank_meta_desc: "WFLS 乒乓球社团积分排名系统。基于 ELO 变体算法自动计算，支持多时间节点对比。",
        sr_meta_desc: "WFLS 乒乓球社团赛季总结：积分变化、连胜榜、出勤榜、单场之最、局分亮点与积分调整审计。",
        submit_meta_desc: "提交 WFLS 乒乓球社团比赛战绩。填写比赛结果，管理员审核通过后自动计入积分排名。",
        submit_og_desc: "填写比赛结果，管理员审核通过后自动计入积分排名。",
        ut_meta_desc: "WFLS 乒乓球社团彩蛋：乒乓球裁判特训。观看发球视频，判断抛球角度是否合规。",
        ut_title: "🌟乒乓球裁判特训🌟 | WFLS Table Tennis Club",
        ut_hero_title: "🌟乒乓球裁判特训🌟",
        ut_hero_sub: "观察发球 · 判断抛球角度 · 练就火眼金睛",
        rank_submit_aria: "提交比赛战绩",
        rank_mode_aria: "积分项目",
        rank_sort_default: "积分降序",
        rank_loading_hint: "加载排名数据中...",
        rank_egg_title: "你发现了一个彩蛋",
        rank_egg_desc: "基于武外乒乓球社积分规则的 WTT排名",
        rank_egg_btn: "进入查看",
        sb_games_title: "如 11-9, 8-11, 11-7",
        wtt_hub_meta_desc: "WTT 国际乒联积分排名中心 · 男子单打 / 女子单打 / 男子双打 / 女子双打 / 混合双打",
        wtt_ranking_meta_desc: "WTT 国际乒联积分排名 · 基于ELO变体算法模拟 · 彩蛋页面",
        wtt_match_meta_desc: "WTT 比赛详情（彩蛋页）：双方赛前赛后积分、积分产生明细、赛前胜率预测与历史交锋。",
        wtt_match_og_title: "WTT 比赛详情 | WFLS TT Club",
        wtt_ps_meta_desc: "WTT 国际乒联积分排名 · 个人数据 · 对手分析",
        wtt_ps_page_title: "WTT 个人数据 🥚 | WFLS Table Tennis Club",
        wtt_player_meta_desc: "WTT 国际乒联积分球员个人主页。查看球员个人战绩、胜率、积分趋势、对手分析等详细数据。",
        wtt_player_page_title: "WTT 球员个人数据 | WFLS Table Tennis Club",
        wtt_player_cat_fallback: "个人页",
        wtt_dataviz_meta_desc: "WTT 国际乒联积分排名数据可视化。积分趋势图、排名变化河流图、球员对比分析。",
        wtt_dataviz_page_title: "WTT 数据可视化 🥚 | WFLS Table Tennis Club",
        wtt_assoc_meta_desc: "WTT 国际乒联积分排名协会数据：协会实力总榜、球员阵容明细、协会排名变迁与协会对抗矩阵。",
        wtt_assoc_page_title: "WTT 协会数据 🥚 | WFLS Table Tennis Club",
        wtt_assoc_topn_hint: "统计全球 TOP-N 人数，填写 5-500 的正整数",
        wtt_matrix_size_title: "取实力榜前 N 个协会构建矩阵，填写 3-25 的正整数",
        wtt_sr_meta_desc: "WTT 赛季总结：积分变化、连胜榜、出勤榜、单场之最与月度快照回顾（彩蛋玩法，口径同 WTT 排名）。",
        wtt_aria_play_pause: "播放/暂停",
        wtt_aria_sort_field: "排序字段",
        wtt_aria_sort_dir: "切换升序/降序",
        wtt_topn_title_1_20: "填写1-20的任意正整数",
        wtt_topn_title_1_66: "填写1-66的任意正整数",
        wtt_topn_title_1_100: "填写1-100的任意正整数",
        wtt_topn_title_2_20: "填写2-20的任意正整数",
        wtt_date_start_hint: "起始日期，留空不限",
        wtt_date_end_hint: "截止日期，留空不限",
        adm_title: "数据仪表盘",
        adm_home_title: "返回首页",
        adm_hero_desc: "全站数据资产一览 · WTT 五项模块与核心数据实时统计",
        adm_editor_title: "可视化编辑对阵表并导出 draws.json",
        adm_editor: "对阵表编辑器",
        adm_refresh_title: "重新加载全站数据",
        adm_refresh: "刷新",
        adm_ps_title: "待审核提交",
        adm_se_title: "记分录入",
        adm_se_mode_match: "比赛结果",
        adm_se_mode_bonus: "积分调整",
        adm_se_games_hint: "如 11-9, 8-11, 11-7",
        adm_se_add_match: "添加记录",
        adm_se_amount: "分数（如 +100 / -30）",
        adm_se_add_bonus: "添加调整",
        adm_se_export: "下载合并后的 score-log.json",
        adm_se_clear: "清空队列",
        adm_loading: "正在加载全站数据...",
        /* ---- draws editor (de_*) ---- */
        de_page_title: "对阵表编辑器 | WFLS Table Tennis Club",
        de_meta_desc: "WFLS 乒乓球社团对阵表编辑器。可视化编辑对阵表、模板生成、导出 draws.json。",
        de_kw: "武汉外国语学校,WFLS,乒乓球,对阵表,淘汰赛,对阵表编辑器,draws.json",
        de_title: "对阵表编辑器",
        de_hero_desc: "可视化编辑 · 模板生成 · 导出 draws.json",
        de_back_admin: "返回数据仪表盘",
        de_sel_draw: "选择要编辑的对阵表",
        de_new_draw: "新建空白对阵表",
        de_dup_draw: "复制当前对阵表",
        de_del_draw: "删除当前对阵表",
        de_from_tpl: "从模板生成",
        de_undo: "撤销 (Ctrl+Z)",
        de_redo: "重做 (Ctrl+Y)",
        de_validate: "校验数据",
        de_import: "导入",
        de_download: "下载 draws.json",
        de_copy_all: "复制全部 draws.json 到剪贴板",
        de_sec_basic: "基本信息",
        de_fld_title: "标题",
        de_ph_draw_title: "2026乒乓球单打淘汰赛",
        de_fld_subtitle: "副标题（可选）",
        de_ph_subtitle: "例如：12 名选手 · 单败淘汰",
        de_fld_comp: "关联赛事（competitionId）",
        de_opt_none: "（不关联）",
        de_opt_nodraw: "（无对阵表）",
        de_sec_layout: "布局与网格",
        de_fld_layout: "布局模式",
        de_opt_layout_grid: "手动网格（卡片 col/row）",
        de_opt_layout_auto: "自动堆叠（按轮次/序号）",
        de_fld_cellw: "卡宽 cellWidth",
        de_fld_cellh: "卡高 cellHeight",
        de_fld_gap: "留白 gap",
        de_fld_padx: "水平边距 padX",
        de_fld_pady: "垂直边距 padY",
        de_btn_arrange: "规整排布",
        de_hint_arrange: "规整排布会依据每张卡的「轮次 col」与「列内序号 row」重排成标准淘汰赛树形。",
        de_sec_rounds: "轮次标签（按列）",
        de_btn_add_round: "添加列标签",
        de_sec_look: "外观",
        de_fld_accent: "主题色（留空用默认）",
        de_chk_seeds: "显示种子号角标",
        de_chk_legend: "显示图例",
        de_btn_reset_look: "恢复默认外观",
        de_col: "列",
        de_ph_round: "第{n}轮",
        de_del_short: "删除",
        de_hint_rounds: "暂无自定义标签，查看器将使用默认轮次名。",
        de_btn_select: "选择",
        de_btn_connect: "连线",
        de_mode_select: "选择模式",
        de_mode_connect: "连线模式：点起点 → 点终点",
        de_btn_add_match: "比赛卡",
        de_btn_add_bye: "轮空卡",
        de_btn_add_champion: "冠军卡",
        de_btn_add_note: "备注卡",
        de_btn_del_selected: "删除选中",
        de_propagate: "依据已完赛卡片的胜者与连线，自动填充下一轮选手",
        de_btn_propagate: "填充胜者",
        de_zoom_fit: "适应画布",
        de_stat_cards: "0 卡片",
        de_stat_conns: "0 连线",
        de_unit_cards: "卡片",
        de_unit_conns: "连线",
        de_stat_dirty: "有未导出的修改",
        de_prog_done: "比赛 {done}/{total} 已完赛",
        de_prog_live: "{n} 进行中",
        de_empty_canvas: "没有对阵表。点击顶栏 <i class=\"fa-solid fa-plus\"></i> 新建，或用 <i class=\"fa-solid fa-wand-magic-sparkles\"></i> 从模板生成。",
        de_ins_empty_1: "在画布上点击一张卡片开始编辑。",
        de_ins_empty_2: "拖拽移动 · 连线模式连接晋级关系",
        de_ins_empty_3: "Ctrl+Z 撤销 · Delete 删除选中",
        de_ins_card: "卡片",
        de_type_match: "比赛",
        de_type_bye: "轮空",
        de_type_champion: "冠军",
        de_type_note: "备注",
        de_fld_p1: "选手 1",
        de_ph_player: "姓名 / 队伍",
        de_fld_seed: "种子号",
        de_ph_seed: "如 1",
        de_fld_pnote: "附注（弃赛等）",
        de_ph_optional: "可选",
        de_fld_p2: "选手 2",
        de_fld_pnote2: "附注",
        de_fld_score: "总比分（如 3-1）",
        de_fld_games: "逐局比分（每局一行，如 11-9）",
        de_fld_winner: "胜者",
        de_win_p1: "选手 1 胜",
        de_win_draw: "平",
        de_win_p2: "选手 2 胜",
        de_fld_status: "状态",
        de_st_auto: "自动（依据比分判断）",
        de_st_scheduled: "待赛",
        de_st_live: "进行中",
        de_st_final: "已完赛",
        de_fld_champ: "冠军选手",
        de_fld_label: "标签文字",
        de_ph_champ: "冠军",
        de_fld_note_text: "备注文字",
        de_ph_group: "A组（单循环）",
        de_fld_col: "列 col（轮次）",
        de_fld_row: "行 row",
        de_fld_time: "时间（可选）",
        de_fld_venue: "场地（可选）",
        de_ph_venue: "1号球台",
        de_fld_card_note: "备注（可选）",
        de_ph_card_note: "弃赛 / 因雨顺延",
        de_sec_conns: "连线关系",
        de_btn_dup_card: "复制卡片",
        de_conn_from: "来自",
        de_conn_to: "去向",
        de_conn_del: "删除连线",
        de_conn_none: "无连线 — 可用顶部「连线模式」建立",
        de_tpl_modal_title: "从模板生成对阵表",
        de_fld_tpl_type: "模板类型",
        de_tpl_single: "单败淘汰赛（含种子排位 / 轮空 / 季军赛）",
        de_tpl_groups: "小组循环 + 淘汰赛",
        de_fld_tpl_comp: "关联赛事",
        de_tpl_entries: "参赛名单（每行一位，按种子顺序排列；人数自动补齐到 2 的幂，多余位轮空）",
        de_ph_entries: "祁子傲\n陈瑜萱\n任峻贤\n...",
        de_tpl_third: "附加季军赛（半决赛负者互赛）",
        de_tpl_group_fmt: "分组（每组一行：「组名: 选手1、选手2、选手3」）",
        de_ph_groups: "A组: 张三、李四、王五\nB组: 赵六、钱七\nC组: ...\nD组: ...",
        de_tpl_ko: "生成淘汰赛阶段（组首位晋级）",
        de_cancel: "取消",
        de_generate: "生成",
        de_json_modal_title: "当前对阵表 JSON（保存时自动清理默认值）",
        de_json_hint: "「应用修改」会以这里的内容替换当前对阵表（可粘贴单个对象或整个 draws.json 数组，粘贴数组会整体替换所有对阵表）。",
        de_copy: "复制",
        de_apply: "应用修改",
        de_close: "关闭",
        de_import_modal_title: "导入 JSON",
        de_import_hint: "粘贴 draws.json（数组 = 整体替换；单个对象 = 追加为一张新表）",
        de_import_file: "或从本地文件导入（覆盖粘贴内容）",
        de_import_upgrade: "自动把 v2 旧格式升级为 v3",
        de_err_load: "加载 data/draws.json 失败 —— 请通过本地 HTTP 服务器打开（勿用 file://）",
        de_toast_restore: "已恢复 {when} 未导出的编辑内容；如需仓库版本请用「导入」",
        de_last: "上次",
        de_toast_new: "已新建 {id}，可从模板生成或手动添加卡片",
        de_err_no_draw: "没有可复制的对阵表",
        de_untitled: "未命名",
        de_copy_suffix: "（副本）",
        de_new_draw_title: "新对阵表",
        de_toast_dup: "已复制为 {id}",
        de_confirm_del: "确定删除「{title}」？此操作可撤销。",
        de_toast_undo: "已撤销",
        de_toast_redo: "已重做",
        de_id_empty: "（空）",
        de_err_empty_canvas: "画布为空",
        de_toast_arranged: "已按轮次规整排布",
        de_toast_filled: "已填充 {n} 个空位",
        de_toast_noprop: "没有可传播的胜者（需要已完赛卡片与连线）",
        de_toast_conflict: "{n} 个目标位冲突，请手动检查",
        de_err_no_drag: "自动布局模式下不可拖拽，可切换为手动网格",
        de_confirm_del_conn: "删除连线 {from} → {to} ？",
        de_toast_src: "已选起点 {id}，点击目标卡片完成连线（再次点击起点取消）",
        de_err_conn_exists: "连线已存在",
        de_toast_conn: "已连线 {from} → {to}",
        de_err_pick_draw: "请先新建或选择一张对阵表",
        de_confirm_del_card: "删除卡片 {id} 及其连线？",
        de_hint_no_draw: "当前没有对阵表。",
        de_ok: "通过",
        de_lbl_error: "错误：",
        de_lbl_warn: "警告：",
        de_val_title: "校验结果（{e} 错误 / {w} 警告）",
        de_toast_copy_json: "已复制 JSON",
        de_err_copy: "复制失败，请手动选择文本",
        de_toast_dup_id: "重复布表 ID 已自动改号：{list}",
        de_join: "、",
        de_toast_replaced: "已替换全部 {n} 张对阵表",
        de_err_invalid: "无效对象",
        de_toast_conflict_id: "与现有布表 ID 冲突，已自动改号：{list}",
        de_toast_applied: "已应用当前对阵表",
        de_err_json: "JSON 解析失败：{msg}",
        de_toast_imported: "已导入 {n} 张对阵表",
        de_toast_appended: "已追加为 {id}",
        de_err_import: "导入失败：{msg}",
        de_err_entries: "请填写参赛名单",
        de_err_groups: "请按「组名: 选手1、选手2」格式填写分组",
        de_err_tpl: "模板生成失败：{msg}",
        de_toast_tpl: "模板已生成 {id}，可继续微调",
        de_toast_download: "已下载 draws.json —— 请用它替换仓库中的 data/draws.json 并提交",
        de_toast_copy_all: "已复制全部 draws.json 到剪贴板",
        de_err_copy_all: "复制失败，请用 JSON 面板手动复制",
        de_v_empty: "抽签表为空",
        de_v_no_id: "缺少 id",
        de_v_no_title: "缺少标题 title",
        de_v_no_comp: "competitionId \"{id}\" 不存在",
        de_v_card_no_id: "存在缺少 id 的卡片",
        de_v_dup_id: "卡片 id 重复: {id}",
        de_v_bad_winner: "卡片 {id} 的 winner 取值非法（{w}，应为 0/1/2/null）",
        de_v_neg_pos: "卡片 {id} 的 col/row 不能为负",
        de_v_no_players: "比赛卡 {id} 有选手空缺",
        de_v_winner_no_score: "比赛卡 {id} 未录入比分但已设 winner",
        de_v_no_champ: "冠军卡 {id} 未填写选手",
        de_v_conn_from: "连线 from \"{id}\" 不存在",
        de_v_conn_to: "连线 to \"{id}\" 不存在",
        de_v_conn_self: "连线不能自连接: {id}",

        /* ---- admin dashboard (adm_*) ---- */
        /* 分项代号 */
        adm_disc_ms: "男单 MS", adm_disc_ws: "女单 WS", adm_disc_wd: "女双 WD", adm_disc_md: "男双 MD", adm_disc_xd: "混双 XD",
        /* 页头 chips */
        adm_chips_reloading: "正在重新加载…", adm_chip_load: "加载耗时 {t}s", adm_chip_records: "WTT 记录 {n} 条",
        /* 分区标题 */
        adm_sec_overview: "数据总览", adm_sec_disc: "WTT 五项模块数据量", adm_sec_charts: "WTT 数据分布",
        adm_sec_records: "记录构成与活跃选手", adm_sec_files: "核心数据文件明细", adm_sec_seasons: "赛季管理概览",
        /* KPI 卡片 */
        adm_kpi_wtt_records: "WTT 比赛记录", adm_kpi_wtt_records_sub: "五单项合计",
        adm_kpi_wtt_players: "WTT 选手总数", adm_kpi_wtt_players_sub: "初始积分在册选手",
        adm_kpi_wtt_seasons: "WTT 赛季数", adm_kpi_wtt_seasons_sub: "赛季管理",
        adm_kpi_wtt_events: "WTT 赛事类型", adm_kpi_wtt_events_sub: "不同级别赛事",
        adm_kpi_players: "球员档案", adm_kpi_players_sub: "统一球员数据",
        adm_kpi_news_comp: "新闻 / 赛事", adm_kpi_news_comp_sub: "新闻 {n}{nh} · 赛事 {m}{mh}",
        adm_hidden_suffix: "(隐藏{n})", adm_total_records: "共 {n} 条记录",
        /* 分项卡片 */
        adm_disc_template: "仅有模板数据", adm_disc_no_real: "暂无真实数据",
        adm_unit_matches: "比赛记录", adm_unique_players: "独特选手", adm_share_of_total: "占全部记录",
        /* 图表 */
        adm_chart_trend: "历年比赛记录趋势（按分项堆叠）", adm_chart_disc: "五单项比赛记录数",
        adm_chart_pie: "赛事类型占比（全部分项）", adm_note_unit: "条", adm_chart_center: "总记录",
        adm_axis_records: "比赛记录数",
        adm_tip_records: "{l}: {v} 条", adm_tip_total: "合计 {n} 条",
        adm_tip_share: "{v} 条 · 占比 {p}%", adm_tip_records_pct: "{v} 条 ({p}%)",
        /* TOP 选手 */
        adm_top_players: "最活跃选手 TOP {n}", adm_top_note: "按出场场次（胜+负）", adm_rank_wl: "胜 {w} · 负 {l}",
        /* 赛事类型明细表 */
        adm_event_detail: "赛事类型明细", adm_event_total: "总计 {n} 条",
        adm_th_event: "赛事类型", adm_th_records: "记录数", adm_th_share: "占比", adm_th_dist: "分布",
        /* 核心数据文件卡片 */
        adm_derived: "（派生）",
        adm_unit_player_profiles: "位球员档案", adm_unit_members: "位成员", adm_unit_news: "篇新闻",
        adm_unit_competitions: "场赛事", adm_unit_match_records: "条比赛记录", adm_unit_seasons: "个赛季",
        adm_unit_qa: "条问答", adm_unit_changelog: "条更新日志", adm_unit_draws: "张对阵表",
        adm_unit_players: "位球员", adm_unit_event_types: "种赛事类型", adm_unit_tags: "位球员 · {n} 种标签",
        adm_unit_updated: "最近更新",
        adm_pill_hidden: "隐藏 {n}", adm_pill_hidden_versions: "隐藏版本 {n}",
        adm_share_total: "占核心总量 {p}%", adm_meta_file: "元数据文件",
        adm_files_sub: "data/ 目录 · {n} 个文件",
        /* 赛季管理 */
        adm_wtt_seasons_panel: "WTT 赛季（按分项）", adm_core_seasons_panel: "社团赛季",
        adm_seasons_count: "{n} 个赛季",
        adm_th_name: "名称", adm_th_dates: "日期范围", adm_th_status: "状态",
        adm_vis_on: "可见", adm_vis_off: "隐藏",
        /* 待审核提交 */
        adm_ps_empty: "暂无待审核提交", adm_ps_review: "去审核 →",
        adm_ps_fail: "读取失败（GitHub 匿名 API 限流为 60 次/时/IP，请稍后刷新重试）",
        /* 记分录入 */
        adm_se_q_format: "赛制 {f}", adm_se_q_win: "{w} 胜 {l}", adm_se_q_games: "（{g}）", adm_se_q_adjust: "调整",
        adm_se_pick_winner: "-- 选择胜者 --", adm_se_pick_loser: "-- 选择负者 --", adm_se_pick_player: "-- 选择球员 --",
        adm_se_err_coef: "赛事系数加载失败", adm_se_err_players: "players.json 加载失败",
        adm_se_err_format: "赛制仅支持 default / bo3 / bo5 / bo7",
        adm_se_err_no_score: "已勾选记录比分，请填写总比分或逐局分数",
        adm_se_err_total_fmt: "总比分格式应为「胜者局数-负者局数」，如 3-1",
        adm_se_err_total_order: "总比分 {w}-{l}：胜方局数必须大于负方（胜者在前的口径）",
        adm_se_err_total_max: "总比分 {w}-{l}：单打最多 bo7（胜方最多 4 局）",
        adm_se_err_total_mismatch: "总比分 {w}-{l} 与赛制 {eff} 不符（需胜 {n} 局）",
        adm_se_err_games_self: "逐局分数与总比分 {w}-{l} 不自洽（应共 {t} 局、胜方赢 {w} 局）",
        adm_se_err_games_infer: "逐局分数推不出胜方（胜者视角，胜方赢的局须更多）",
        adm_se_ok_match: "已添加 1 条比赛记录",
        adm_se_err_bonus_fill: "请完整填写日期 / 对象 / 分数（数字）", adm_se_ok_bonus: "已添加 1 条积分调整",
        adm_se_ok_cleared: "队列已清空",
        adm_se_ok_copied: "已复制到剪贴板，可粘贴进 data/score-log.json 数组末尾",
        adm_se_ok_downloaded: "已下载合并文件（原 {n} 条 + 新增 {m} 条）。请用下载的文件替换 data/score-log.json 并提交。",
        adm_se_err_merge: "当前 score-log.json 加载失败，无法合并导出",

        /* ---- 裁判特训彩蛋 (ut_*) ---- */
        ut_default_title: "乒乓球裁判特训", ut_default_desc: "观看发球视频，判断抛球角度是否合规。",
        ut_video_missing: "示范视频待补充", ut_options_aria: "选项",
        ut_best: "历史最佳：{c}/{t}（{p}%）",
        ut_rule_watch: "观看发球视频", ut_rule_judge: "判断抛球是否近乎垂直", ut_rule_verdict: "做出你的判罚",
        ut_count: "共 {n} 题", ut_mode_practice: "练习模式", ut_mode_practice_desc: "逐题作答，即时反馈与解析",
        ut_start: "开始特训", ut_step: "第 {cur} / {total} 题",
        ut_topic_toss: "抛球角度", ut_topic_general: "综合判罚",
        ut_verdict_ok: "判罚正确！", ut_verdict_bad: "误判了……",
        ut_finish: "查看成绩", ut_next: "下一题",
        ut_rank_intl: "国际级裁判", ut_rank_nat: "国家级裁判", ut_rank_certified: "持证上岗", ut_rank_trainee: "见习裁判",
        ut_pass_title: "特训通过！", ut_fail_title: "继续加油！",
        ut_result_detail: "答对 {c} / {t} 题 · 评级：<strong>{rank}</strong>",
        ut_new_best: "新纪录！", ut_restart: "再来一轮", ut_back_home: "返回首页",
        ut_load_fail: "题库加载失败，请稍后再试。", ut_reload: "重新加载"
    },
    en: {
        site_title: "WFLS Table Tennis Club | Wuhan Foreign Languages School", nav_home: "Home", nav_news: "News", nav_competitions: "Competitions", nav_contact: "Contact", nav_more: "More... <i class='fa-solid fa-chevron-down'></i>", nav_members: "Core Members", nav_data_viz: "Data Viz <span class='beta-tag'>Beta</span>", nav_season_review: "Season Review", nav_personal: "Personal Stats", nav_qa: "Q&A", nav_changelog: "Changelog", nav_docs: "docs", lang_btn: "中文",
        hero_title: "Wuhan Foreign Languages School<br><span class='hero-title-accent'>Table Tennis Club</span>", hero_slogan: "Swing for dreams, spin for youth", hero_btn_about: "About Us <i class='fa-solid fa-arrow-right'></i>", hero_btn_join: "Join Us <i class='fa-solid fa-plus'></i>", scroll: "Scroll",
        side_home: "Home", side_philosophy: "Philosophy", side_activities: "Activities", side_members: "Members", side_news: "News", side_competitions: "Competitions",
        philosophy_tag: "Philosophy", philosophy_title: "Philosophy", philosophy_desc: "Our core values and guiding principles",
        activities_tag: "Activities", activities_title: "Activities", activities_desc: "Year-round activities, club class activities and annual tournaments",
        members_tag: "Core Members", members_title: "Core Members",
        news_tag: "Latest News", news_title: "Latest News", news_desc: "Stay updated with club activities and announcements", news_all: "View All News",
        comp_tag: "Competitions", comp_title: "Competitions", comp_desc: "Upcoming matches and results", comp_all: "View All Competitions",
        hl_tag: "Highlights", hl_title: "Highlights", hl_desc: "The latest club news and competition updates at a glance",
        contact_page_title: "Contact | WFLS Table Tennis Club", contact_tag: "Contact", contact_title: "Join Us", contact_desc: "Scan the QR code to join the club QQ group and receive notifications", contact_text: "Scan to join the club QQ group and swing with us", contact_btn: "Scan QR Code to Join", contact_qr_title: "Club QQ Group QR Code", contact_qr_desc: "Scan to join the club QQ group and swing with us",
        footer_brand: "WFLS Table Tennis Club", footer_motto: "Swing for dreams, spin for youth", footer_nav: "Quick Links", footer_school: "School Info", footer_school_name: "Wuhan Foreign Languages School", footer_location: "Wuhan, Hubei, China",
        modal_title: "Club QQ Group QR Code", modal_desc: "Scan the QR code below to join the club QQ group", modal_note: "QR code updates periodically.",
        news_page_title: "News | WFLS Table Tennis Club", news_hero_tag: "News & Updates", news_hero_title: "News", news_hero_desc: "Activities / Training / Announcements", news_list_tag: "All News", news_list_title: "All News",
        comp_page_title: "Competitions | WFLS Table Tennis Club", comp_hero_tag: "Competitions", comp_hero_title: "Competitions", comp_hero_desc: "Schedule / Results / Review", comp_list_tag: "All Competitions", comp_list_title: "All Competitions",
        members_page_title: "Core Members | WFLS Table Tennis Club",
        rank_page_title: "Ranking Beta | WFLS Table Tennis Club", rank_hero_desc: "Club ranking system · Auto-calculated · Season inheritance", rank_tag: "Data Table", rank_title: "Points Table", rank_sort_hint: "Current sorting: ", rank_sidebar_title: "Time Periods", rank_rules_pill: "Scoring Rules", rank_rules_menu_q1: "Singles Scoring Rules", rank_qa_btn_doubles: "Doubles Scoring Rules",
        rank_col_rank: "#", rank_col_name: "Name", rank_col_points: "Points", rank_col_points_change: "Score Δ", rank_col_change: "Rank Δ", rank_col_matches: "Matches", rank_col_winrate: "Win Rate",
        rank_export_btn: "Save Image", rank_export_gen: "Generated", rank_export_fail: "Image export failed. Please try again.",
        export_gen: "Generated", img_export_fail: "Image export failed. Please try again.", detail_export_btn: "Save Image",
        rank_export_delta_ref: "Point/rank changes vs. {date}", rank_export_menu_all: "Export All", rank_export_menu_top12: "Export Top 12", rank_export_top_sub: "Top {n}", rank_export_topn_prefix: "Top", rank_export_topn_suffix: "", rank_export_menu_go: "Export", rank_export_menu_invalid: "Please enter a valid rank (positive integer)",
        score_detail_title: "Score Details", score_col_date: "Date", score_col_type: "Type", score_col_opponent: "Opponent", score_col_result: "Result", score_col_score: "Score", score_col_score_before: "Before", score_col_change: "Change", score_col_score_after: "After", score_result_win: "Win", score_result_loss: "Loss",
        rank_mode_singles: "Singles", rank_mode_doubles: "Doubles", rank_doubles_empty: "No doubles matches yet — the doubles standings will appear once matches are recorded",
        mrank_search_ph: "Search members", mrank_sort_title: "Sort by", mrank_no_result: "No matching members", mrank_close: "Close", mrank_expand_detail: "View points detail",
        mrank_c_m: "MP", mrank_c_w: "Win%", mrank_c_pc: "Chg", mrank_c_p: "Pts",
        pp_doubles_title: "Doubles Record", pp_doubles_partner: "Partner", pp_doubles_summary: "{n} doubles matches, {w} wins ({r}% win rate)",
        tag_match: "Match", tag_training: "Training", tag_notice: "Notice", tag_event: "Event", tag_daily: "Daily", tag_upcoming: "Upcoming", tag_result: "Result", tag_live: "Live",
        filter_all: "All",
        detail_page_title: "Details | WFLS Table Tennis Club", detail_back: "Back to List", detail_version_updated: "Updated {date}", detail_version_list: "Version History", detail_version_view: "View", detail_version_viewing: "Viewing v{version} (updated {date})", detail_version_back: "Back to v{version}", pdf_preview_btn: "Preview PDF", pdf_download_btn: "Download PDF", detail_loading: "Loading content…", detail_not_found: "Content not found", detail_load_fail: "Failed to load. Please try again.", detail_load_fail_hint: "The content may have been removed, or a network error occurred.", detail_retry: "Retry",
        search_placeholder: "Search news, competitions, members, rankings, changelog...", search_no_results: "No results found", search_type_news: "News", search_type_competition: "Competition", search_type_member: "Member", search_type_ranking: "Ranking", search_type_qa: "Q&A", search_type_changelog: "Changelog",
        qa_page_title: "Q&A | WFLS Table Tennis Club", qa_hero_tag: "Q&A", qa_hero_title: "Q&A", qa_hero_desc: "Join / Schedule / Ranking / Registration", qa_list_tag: "All Q&A", qa_list_title: "All Q&A",
        pagination_prev: "Previous", pagination_next: "Next", pagination_info: "Page {current} of {total}",
        data_viz_page_title: "Data Visualization | WFLS Table Tennis Club", data_viz_tag: "Data Visualization", data_viz_title: "Data Visualization", data_viz_desc: "Points Trend · Rank Flow · Player Compare",
        data_viz_points_trend: "Points Trend", data_viz_rank_stream: "Rank Flow", data_viz_player_compare: "Player Comparison", data_viz_select_players: "Select Players (max 8)", data_viz_select_player_a: "Player A", data_viz_select_player_b: "Player B", data_viz_apply: "Apply", data_viz_top_n: "Top", data_viz_head_to_head: "Head to Head",
        data_viz_recent: "Recent", data_viz_data_points: "data points", data_viz_top_n_suffix: "players", data_viz_compare_btn: "Compare", data_viz_compare_placeholder: "Select two players to compare", data_viz_no_players: "No players yet", data_viz_alert_select_one: "Please select at least one player", data_viz_alert_max: "Maximum of 15 players", data_viz_alert_two: "Please select two players", data_viz_alert_diff: "Please select two different players", data_viz_select_player_ph: "-- Select Player --", data_viz_win: "wins", data_viz_total_h2h: "Total H2H: {n} matches", data_viz_recent_match: "Recent: {date} (Winner: {winner})", data_viz_pts_change: "{player} point change", data_viz_no_h2h: "No head-to-head records", data_viz_col_date: "Date", data_viz_col_type: "Type", data_viz_col_winner: "Winner", data_viz_axis_points: "Points", data_viz_axis_rank: "Rank", data_viz_rank_suffix: "Rank #{n}", data_viz_topn_select_title: "Enter any positive integer from 1 to 20", data_viz_bins_title: "Enter any integer from 4 to 100", data_viz_cur_score: "Current Points", data_viz_h2h_rate: "H2H Win Rate", data_viz_pred_rate: "Predicted Win Rate", data_viz_prepare: "Preparing data files...", data_viz_topn_title: "Show recent N data points", data_viz_stream_title: "Show recent N data points", data_viz_loading: "Loading data...", data_viz_downloading: "Downloading {label} ({i}/{total}): {file}", data_viz_calculating: "Calculating rankings...", data_viz_load_fail: "❌ Failed to load ranking data. Please refresh and try again.", data_viz_file_players: "Players", data_viz_file_matches: "Match Records", data_viz_file_initial: "Initial Scores", data_viz_file_event: "Event Coefficients", data_viz_file_decay: "Decay Config", data_viz_file_season: "Season Config", data_viz_no_player_list: "❌ Could not fetch player list",
        ps_ov_total: "Matches", ps_ov_wins: "Wins", ps_ov_losses: "Losses", ps_ov_rate: "Win Rate", ps_ov_points: "Points",
        ps_sum1: "{player} has played {total} singles matches, winning {wins} and losing {losses}.", ps_sum2: "{player}'s win rate is {percent}%.",
        ps_tags_label: "Tags", ps_honors_label: "Honors", ps_date_ymd: "{m}/{d}/{y}",
        ps_card_victory: "Wins · Top 3 Beaten", ps_card_pk: "Head-to-Head · Top 3", ps_card_lucky: "Dominates", ps_card_nemesis: "Nemeses",
        ps_none: "None yet", ps_card_sub: "{w}W {l}L · {wr}%",
        content_load_fail: "Failed to load content", content_load_fail_hint: "Network error or data temporarily unavailable. Please try again later.", content_empty: "Nothing here yet",
        detail_prev: "Previous", detail_next: "Next", detail_no_prev: "No newer post", detail_no_next: "No older post",
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
        dv_fullscreen: "Fullscreen (in page)", dv_zoom_out: "Zoom out", dv_zoom_in: "Zoom in", dv_zoom_fit: "Fit content", dv_zoom_reset: "Reset view", dv_search_placeholder: "Search player / team, highlight path", dv_champion: "Champion", dv_status_scheduled: "Scheduled", dv_status_live: "Live", dv_tbd: "TBD", dv_total_score: "Total", dv_round_1: "Round 1", dv_round_2: "Round 2", dv_quarters: "Quarterfinals", dv_semis: "Semifinals", dv_final: "Final", dv_round_n: "Round {n}", dv_legend_win: "Winner", dv_legend_loss: "Loser", dv_legend_live: "Live", dv_legend_pending: "Scheduled", dv_legend_path: "Path",
        rank_no_data: "No ranking data", rank_no_records: "No records", rank_add_short: "Bonus", rank_ppl: "{n} players", rank_node_count: "{n} nodes",
        rank_loading: "Loading ranking data...", rank_prepare: "Preparing to download data files...", rank_download_file: "Downloading {label} ({i}/{total}): {file}", rank_calculating: "Calculating ranking points (this may take a while)...", rank_calc_fail: "Unable to compute ranking data",
        rank_view_player_page: "View personal page", rank_click_detail: "Click for score details",
        rank_season_expired: "Today is past the last season ({date}): new matches are counted into that season's extension, but cross-season inheritance will not apply. Create a new season in data/seasons.json.",
        changelog_page_title: "Changelog | WFLS Table Tennis Club", changelog_hero_tag: "Changelog", changelog_hero_title: "Changelog", changelog_hero_desc: "Version History · Features · Bug Fixes", changelog_list_tag: "Version History", changelog_list_title: "Version History", changelog_empty: "No changelog entries yet",
        docs_page_title: "Docs | WFLS Table Tennis Club", docs_title: "Docs", docs_desc: "Browse and preview site documents & static assets: images · videos · audio · PDF · text & code",
        docs_search_ph: "Filter in current folder…", docs_loading: "Scanning Assets…", docs_retry: "Retry",
        docs_err_title: "Failed to load Assets/manifest.json", docs_err_hint: "This file is generated at deploy time by the deploy workflow; for local dev run:",
        docs_view_list: "Switch to list view", docs_view_grid: "Switch to grid view", docs_refresh: "Rescan Assets",
        docs_filter_aria: "Filter by type", docs_crumb_aria: "Folder path", docs_pv_dialog: "File preview",
        docs_unit_dirs: "{n} folders", docs_unit_files: "{n} files", docs_folder_empty: "Empty folder",
        docs_empty_dir: "This folder is empty", docs_empty_search: "No items match “{q}”",
        docs_type_folder: "Folder", docs_type_image: "Image", docs_type_svg: "SVG vector", docs_type_video: "Video", docs_type_audio: "Audio", docs_type_pdf: "PDF", docs_type_markdown: "Markdown", docs_type_text: "Text/Code", docs_type_sheet: "Spreadsheet", docs_type_doc: "Word doc", docs_type_ppt: "Slides", docs_type_archive: "Archive", docs_type_other: "File",
        docs_f_all: "All", docs_f_image: "Images", docs_f_video: "Videos", docs_f_audio: "Audio", docs_f_text: "Text/Code", docs_f_doc: "Docs",
        docs_pv_source: "View source", docs_pv_rendered: "Rendered", docs_wrap_on: "Wrap lines", docs_wrap_off: "No wrap",
        docs_pv_zoom_reset: "Reset zoom (double-click works too)", docs_open_new: "Open in new tab", docs_download: "Download", docs_download_file: "Download file",
        docs_close: "Close (Esc)", docs_prev: "Previous (←)", docs_next: "Next (→)",
        docs_pv_hint: "<kbd>Esc</kbd> close · <kbd>←</kbd><kbd>→</kbd> navigate · scroll to zoom / drag to pan / double-click to reset",
        docs_unsupported: "This format can't be previewed in the browser", docs_loading_text: "Loading…",
        docs_img_fail: "Failed to load image", docs_video_fail: "This video format (e.g. MOV) can't be played by the browser — please download it", docs_audio_fail: "This audio format isn't supported by the browser", docs_text_fail: "Failed to load text content", docs_md_fail: "Failed to load Markdown",
        docs_trunc_note: "Large file — only the first {n} MB is shown. Download to view the full content.",
        tag_release: "Release", tag_feature: "Feature", tag_fix: "Fix",
        draws_tab_content: "Details", draws_tab_bracket: "Bracket",
        wtt_hero_desc: "WTT Rankings · Click a name for score details", wtt_dataviz_title: "WTT Data Visualization", wtt_dataviz_btn: "View WTT Data Visualization", wtt_personal_title: "WTT Personal Stats", wtt_personal_btn: "View WTT Personal Stats", wtt_table_title: "WTT Points Table", wtt_loading: "Loading WTT data...", wtt_click_detail: "Click for score details", wtt_error_fail: "Failed to load WTT rankings. Please refresh and try again.",
        wtt_back_hub: "Back to WTT Hub",
        sort_desc: "Descending", sort_asc: "Ascending",
        wtt_file_matches: "Match Records", wtt_file_initial: "Initial Scores", wtt_file_event: "Event Coefficients", wtt_file_season: "Season Config",
        wtt_prepare: "Preparing data files...", wtt_downloading: "Downloading {label} ({i}/{total}): {file}", wtt_calculating: "Calculating rankings...", wtt_snapshot: "Snapshot {current}/{total}", wtt_elapsed: "Elapsed {s}s",
        wtt_default_season: "Default Season", wtt_node_count: "{n} nodes", wtt_ppl: "{n} players",
        wtt_no_records: "No records", wtt_cant_compute: "Could not compute WTT rankings", wtt_bonus: "Bonus",
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
        wtt_cat_ms: "Men's Singles", wtt_cat_ws: "Women's Singles", wtt_cat_md: "Men's Doubles", wtt_cat_wd: "Women's Doubles", wtt_cat_xd: "Mixed Doubles",
        nav_submit: "Submit Results", submit_page_title: "Submit Results | WFLS Table Tennis Club",
        sb_hero_tag: "Submit", sb_hero_title: "Submit Results", sb_hero_desc: "Match results / Counted into rankings after review", sb_form_title: "Record Entry",
        sb_date: "Date", sb_type: "Type", sb_format: "Format", sb_winner: "Winner", sb_loser: "Loser", sb_add: "Add to Queue",
        sb_score_toggle: "Include game scores (optional)", sb_score_total: "Total (W-L)", sb_games: "Game scores (winner-first, comma separated)", sb_games_label: "Games",
        sb_note: "Notes (optional)", sb_submitter: "Your nickname (optional, public)", sb_remove: "Remove", sb_warn_unknown: "unregistered",
        sb_btn_github: "Submit via GitHub", sb_btn_copy: "Copy JSON", sb_btn_clear: "Clear",
        sb_hint_github: "Signing in to GitHub is required; track review progress in the issue afterwards.",
        sb_hint_public: "Submissions are public — do not include contact info.",
        sb_hint_paste: "If the box is empty after redirect, paste the copied JSON manually.",
        sb_err_fill: "Please fill date / type / winner / loser", sb_err_same: "Winner and loser must differ",
        sb_err_date: "Date must be YYYY-MM-DD", sb_err_future: "Date cannot be in the future",
        sb_err_score: "Winner games must exceed loser games (e.g. 3-1)", sb_err_games: "Game scores look like 11-9; no draws allowed",
        sb_err_mismatch: "Game scores do not match the total", sb_ok_added: "Added to queue", sb_err_empty: "Queue is empty",
        sb_ok_copied: "Copied — send it to the club QQ group for manual entry", sb_err_copy: "Copy failed; please select the text manually",
        sb_err_types: "Failed to load event types", sb_err_players: "Failed to load players",
        sb_quick_title: "Submit Your Match Results", sb_quick_btn: "Open the submission form",
        sb_step1: "Fill in the form", sb_step2: "Admin review", sb_step3: "Counted into rankings",
        sb_quick_desc: "No GitHub needed: click below and fill in the Tencent Docs form. Results are reviewed and batched into the rankings.",
        sb_quick_missing: "The form link is not configured yet (admin: fill in TENCENT_FORM_URL on this page).",
        /* ---- Season review ---- */
        sr_page_title: "Season Review | WFLS Table Tennis Club",
        sr_hero_tag: "Season Review", sr_hero_title: "Season Review", sr_hero_desc: "Matches · Points · Streaks · Season Bests",
        sr_season_label: "Season", sr_ongoing_badge: "Ongoing", sr_realtime_note: "as of today",
        sr_entry_btn: "View Season Review", sr_kpi_events: "Events", sr_kpi_snapshots: "Monthly Snapshots",
        sr_loading: "Loading season data...",
        sr_kpi_matches: "Total Matches", sr_kpi_players: "Players", sr_kpi_bonus: "Adjustments", sr_kpi_types: "Event Types",
        sr_types_none: "No matches this season",
        sr_points_title: "Points Change", sr_points_desc: "Season start vs latest snapshot (players with matches this season only)",
        sr_col_delta: "Points Δ", sr_col_rank_delta: "Rank Δ", sr_col_end_points: "Latest Points",
        sr_streak_title: "Win Streaks", sr_col_max_streak: "Best Streak", sr_col_cur: "Current", sr_cur_streak: "{n}-win streak", sr_cur_loss: "Lost last match", sr_col_record: "Record (W-L)",
        sr_attend_title: "Attendance", sr_col_matches: "Matches", sr_col_wins: "W", sr_col_losses: "L", sr_col_winrate: "Win Rate",
        sr_best_title: "Biggest Single Match", sr_best_desc: "Highest raw (undecayed) points gained this season", sr_best_none: "No matches this season", sr_best_gap: "Pre-match gap",
        sr_games_title: "Game Score Highlights", sr_games_none: "No games with per-game scores this season — attach them when submitting results",
        sr_games_count: "Games recorded", sr_deciding: "Full-distance", sr_comeback: "Comebacks", sr_max_margin: "Biggest single-game margin", sr_games_list: "Matches",
        sr_bonus_title: "Points Adjustment Audit", sr_bonus_desc: "Every bonus adjustment this season, with points before/after",
        sr_col_target: "Player", sr_col_amount: "Points", sr_col_pre: "Points Before",
        sr_bonus_none: "No adjustments this season", sr_bonus_summary: "{n} adjustments · net {net} pts · {m} players", sr_bonus_total: "Total",
        sr_no_data: "No match records for this season yet",
        sr_daily_title: "Daily Points Timeline", sr_daily_desc: "Pick players (up to 10) to chart their daily points through the season; each day uses the realtime basis as of that day (club mode includes time decay).",
        sr_daily_search: "Search players…", sr_daily_clear: "Clear", sr_daily_max: "Up to 10 players at a time",
        sr_daily_empty: "Select players above to draw their curves", sr_daily_start: "Start", sr_daily_axis: "Points",
        /* ---- WTT season review ---- */
        wtt_sr_page_title: "WTT Season Review | WFLS TT Club",
        wtt_sr_hero_tag: "WTT Season Review", wtt_sr_hero_title: "WTT Season Review", wtt_sr_hero_desc: "Matches · Points · Streaks · Season Bests",
        wtt_sr_footnote: "WTT easter-egg: same rules as the WTT rankings (zero-sum points, no time decay).",
        /* ---- Match detail ---- */
        md_page_title: "Match Detail | WFLS Table Tennis Club",
        md_hero_tag: "Match Detail", md_hero_title: "Match Detail", md_hero_desc: "Scores · Points · Win Rate · H2H",
        md_back_ranking: "Back to Rankings",
        md_winner_badge: "W", md_loser_badge: "L",
        md_pre_score: "Points Before", md_post_score: "Points After", md_change: "Match Δ", md_eff_now: "effective now",
        md_score_title: "Match Score", md_games_title: "Game Scores",
        md_score_none: "No score recorded",
        md_score_none_hint: "No score data for this match. Include scores when submitting results to show them here.",
        md_score_none_hint_wtt: "No score data for this match. It appears here once the record includes 比分/局分 fields.",
        md_games_note: "Game scores are winner-perspective: the first number in each game is the winner's points.",
        md_format_label: "Format", md_season_label: "Season",
        md_breakdown_title: "Points Breakdown",
        md_breakdown_base: "Base Points", md_breakdown_gap: "Pre-match gap",
        md_breakdown_base_lead: "Winner ranked higher", md_breakdown_base_upset: "Underdog upset bonus",
        md_breakdown_event: "Event Coefficient", md_breakdown_format: "Format Coefficient",
        md_breakdown_decay: "Time Weight (incl. freeze)", md_breakdown_decay_off: "No decay",
        md_breakdown_result: "Points Generated",
        md_breakdown_loser_note: "Loser deducted ×{n}: −{val}",
        md_pred_title: "Pre-match Win Probability",
        md_pred_hit: "Prediction hit", md_pred_upset: "Upset!",
        md_pred_model_note: "Three-factor model: Elo 60% · H2H 20% · Recent form 20% (no H2H: Elo 70% · form 30%)",
        md_pred_form: "Recent form",
        md_h2h_title: "Head-to-Head",
        md_h2h_summary: "{n} meetings before this match: {a} {aw}W · {b} {bw}W",
        md_h2h_none: "No previous meetings before this match",
        md_col_score: "Score",
        md_not_found_title: "Match record not found",
        md_not_found_hint: "This link may be broken (record changed or incomplete params). Re-enter from the rankings or player page.",
        md_load_fail: "Failed to load data",
        md_retry: "Retry",
        md_early_date: "This match predates the earliest season; points cannot be replayed.",
        md_status_ft: "Full Time", md_sets_col: "Sets", md_pts_total: "Total points",
        md_copy_link: "Copy link", md_copied: "Copied",
        md_occurrence: "Game #{n} that day",
        md_official: "Official",
        md_periods_title: "Periods", md_final_col: "Final", md_game_col: "Game {n}",
        md_tabs_games: "Games", md_tabs_points: "Points", md_tabs_pred: "Win Rate", md_tabs_h2h: "H2H",
        /* ---- docs browser (missing keys) ---- */
        docs_copy_text: "Copy full text", docs_copy_link: "Copy link",
        nav_aria_search: "Search", nav_aria_theme: "Toggle theme", nav_aria_lang: "Switch language", nav_aria_menu: "Menu",
        wtt_win: "Wins",
        /* ---- Event type dictionary (display layer; data keys stay Chinese) ---- */
        ev_normal: "Normal", ev_ranked: "Ranked", ev_challenge: "Challenge", ev_school_league: "School League", ev_top12: "Top-12", ev_school_team: "School Championship · Team", ev_school_singles: "School Championship · Singles", ev_doubles: "Doubles",
        /* ---- WTT event type dictionary ---- */
        wtt_ev_tleague: "T.League", wtt_ev_ittf_open: "ITTF Open", wtt_ev_ittf_regular: "ITTF Regular", wtt_ev_ittf_platinum: "ITTF Platinum", wtt_ev_worlds: "World Championships", wtt_ev_worlds_team: "World Team Championships", wtt_ev_worldcup: "World Cup", wtt_ev_worldcup_team: "World Team Cup", wtt_ev_csl: "Chinese Super League", wtt_ev_asiad: "Asian Games", wtt_ev_asiad_team: "Asian Games Team", wtt_ev_alljapan: "All-Japan Championships", wtt_ev_nationalgames: "National Games", wtt_ev_nationals: "National Championships", wtt_ev_champions: "WTT Champions", wtt_ev_grandsmash: "Grand Smash", wtt_ev_olympics: "Olympic Games", wtt_ev_olympics_team: "Olympic Team Event", wtt_ev_challenge_reg: "Regular Challenge", wtt_ev_dfbpokal: "German Cup", wtt_ev_bundesliga: "Bundesliga", wtt_ev_bundesliga_final: "Bundesliga Finals", wtt_ev_bundesliga_semi: "Bundesliga Semifinals", wtt_ev_finals: "WTT Finals", wtt_ev_feeder: "WTT Feeder", wtt_ev_euroleague_team: "European Champions League", wtt_ev_continental_cup: "Continental Cup", wtt_ev_continental_champs: "Continental Championships", wtt_ev_continental_team: "Continental Team Championships", wtt_ev_star: "WTT Star Contender",
        /* ---- Season label dictionary (keyed by seasons.json id/label; label is a load-bearing join key) ---- */
        season_2026_spring: "Spring 2026 Semester", season_2026_summer: "Summer 2026", season_2026_autumn: "Autumn 2026 Semester",
        /* ---- Player tag / honor dictionary ---- */
        ptag_school_team: "School Team Member", ptag_grand_slam: "Grand Slam", ptag_pres_2627: "2026-27 President", ptag_vp_2627: "2026-27 Vice President", ptag_pres_2526: "2025-26 President", ptag_vp_2526: "2025-26 Vice President", ptag_vp_2425: "2024-25 Vice President", ptag_penholder1: "School No.1 Penholder", ptag_penholder2: "School No.2 Penholder",
        phonor_s25_singles_1: "2025 School Championship Singles Champion", phonor_s26_singles_1: "2026 School Championship Singles Champion", phonor_s26_singles_2: "2026 School Championship Singles Runner-up", phonor_s26_singles_3: "2026 School Championship Singles Third Place", phonor_s26_team_1: "2026 School Championship Team Champion", phonor_s26_team_2: "2026 School Championship Team Runner-up", phonor_s26_team_3: "2026 School Championship Team Third Place", phonor_s25_team_3: "2025 School Championship Team Third Place",
        ps_tag_group_leaders: "President / VP",
        /* ---- Generic date templates ---- */
        date_ymd: "{m}/{d}/{y}", date_ym: "{y}-{m}", date_md: "{m}/{d}",
        /* ---- SEO keywords (<meta name="keywords">) ---- */
        home_kw: "Wuhan Foreign Languages School,Table Tennis,Club,WFLS,Table Tennis,Ranking,Points",
        news_kw: "Wuhan Foreign Languages School,WFLS,Table Tennis,Club News,Training,Match Announcements",
        comp_kw: "Wuhan Foreign Languages School,WFLS,Table Tennis,Matches,Tournaments,Results",
        members_kw: "Wuhan Foreign Languages School,WFLS,Table Tennis,Club Members,Core Team",
        rank_kw: "Wuhan Foreign Languages School,WFLS,Table Tennis,Points Ranking,ELO,Ranking System",
        data_viz_kw: "Wuhan Foreign Languages School,WFLS,Table Tennis,Data Visualization,Points Trend,Rank Changes",
        data_viz_meta_desc: "WFLS Table Tennis Club data visualization: points trend charts, a rank flow river chart, and head-to-head player comparison.",
        data_viz_race_play_aria: "Play / Pause",
        personal_stats_kw: "Wuhan Foreign Languages School,WFLS,Table Tennis,Personal Stats,Player Data,Match Analysis",
        personal_stats_meta_desc: "WFLS Table Tennis Club personal stats: individual records, win rates, opponent analysis and more.",
        detail_kw: "Wuhan Foreign Languages School,WFLS,Table Tennis,Details",
        md_kw: "Wuhan Foreign Languages School,WFLS,Table Tennis,Match Detail,Score,Game Scores,Points,Win Rate,Head to Head",
        qa_kw: "Wuhan Foreign Languages School,WFLS,Table Tennis,FAQ,Q&A",
        changelog_kw: "Wuhan Foreign Languages School,WFLS,Table Tennis,Changelog,Version History",
        contact_kw: "Wuhan Foreign Languages School,WFLS,Table Tennis,Join the Club,QQ Group",
        submit_kw: "Wuhan Foreign Languages School,WFLS,Table Tennis,Submit Results,Match Records,Points",
        sr_kw: "Wuhan Foreign Languages School,WFLS,Table Tennis,Season Review,Points Change,Win Streaks,Adjustments",
        wtt_hub_kw: "WTT,World Table Tennis,Table Tennis,Points Ranking,Men's Singles,Women's Singles,Men's Doubles,Women's Doubles,Mixed Doubles",
        wtt_ranking_kw: "WTT,World Table Tennis,Table Tennis,Points Ranking,ITTF",
        wtt_player_kw: "WTT,World Table Tennis,Table Tennis,Personal Stats,Player Data,Match Analysis",
        wtt_ps_kw: "WTT,World Table Tennis,Table Tennis,Personal Stats,Player Data,Match Analysis",
        wtt_dataviz_kw: "WTT,World Table Tennis,Table Tennis,Data Visualization,Points Trend,Rank Changes",
        wtt_assoc_kw: "WTT,World Table Tennis,Table Tennis,Association Data,Association Ranking,Strength Rankings,Head to Head Matrix",
        /* ---- docs browser static controls ---- */
        docs_filter_ph: "Filter in this folder…", docs_filter_files_aria: "Filter files",
        docs_scope_title: "Search scope: current folder", docs_view_toggle_title: "Toggle view",
        docs_breadcrumb_aria: "Folder path", docs_type_filter_aria: "Filter by type",
        docs_sort_name: "Name", docs_preview_aria: "File preview",
        media_download_file: "Download file",
        /* ---- Page-level copy: SEO / 404 / ranking / WTT / admin (keys referenced by HTML but missing from the dictionary) ---- */
        nf_page_title: "404 - Page Not Found | WFLS Table Tennis Club",
        nf_meta_desc: "WFLS Table Tennis Club - Page not found",
        nf_title: "This page doesn't exist~",
        nf_desc: "The page you visited may have been removed, renamed, or is temporarily unavailable.",
        nf_guess: "You might be looking for",
        nf_home: "Back to home",
        nf_news: "News",
        nf_ranking: "Ranking",
        nf_countdown: "seconds until redirecting to the home page",
        home_meta_desc: "Official site of the WFLS Table Tennis Club. Learn about our philosophy and activities, and follow the latest news and competitions.",
        home_og_title: "WFLS Table Tennis Club",
        home_og_desc: "WFLS Table Tennis Club - Swing at dreams, spin through youth",
        home_rss_title: "WFLS Table Tennis Club - News",
        news_feed_title: "WFLS Table Tennis Club - News",
        home_ball_title: "🌟 Easter egg: 3D Table Tennis",
        home_ball_aria: "Easter egg: 3D Table Tennis",
        home_last_updated: "Last updated: loading...",
        home_search_clear_aria: "Clear search",
        home_search_close_aria: "Close search",
        mrank_search_clear: "Clear search",
        news_meta_desc: "Latest WFLS Table Tennis Club news: activity notices, training schedules and match announcements.",
        comp_meta_desc: "WFLS Table Tennis Club competitions: schedules, results and tournament reviews.",
        qa_meta_desc: "WFLS Table Tennis Club FAQ: joining the club, schedules, the points system and more.",
        changelog_meta_desc: "WFLS Table Tennis Club website changelog: version history and feature updates.",
        contact_meta_desc: "Join the WFLS Table Tennis Club. Scan the QR code to join our QQ group.",
        members_meta_desc: "Meet the core members of the WFLS Table Tennis Club.",
        detail_meta_desc: "WFLS Table Tennis Club detail page: news, competitions and member content.",
        detail_shell_title: "Title",
        md_meta_desc: "WFLS Table Tennis Club match detail: final score, game scores, points before and after, points breakdown, pre-match win-rate prediction and head-to-head history.",
        player_meta_desc: "WFLS Table Tennis Club player profile: individual records, win rate, points trend and opponent analysis.",
        player_meta_desc_short: "WFLS Table Tennis Club player profile.",
        player_og_title: "Player Stats | WFLS Table Tennis Club",
        rank_meta_desc: "WFLS Table Tennis Club points ranking, auto-calculated with an ELO-variant algorithm and comparable across time periods.",
        sr_meta_desc: "WFLS Table Tennis Club season review: points changes, win streaks, attendance, best single results, notable game scores and points adjustments.",
        submit_meta_desc: "Submit a WFLS Table Tennis Club match result. Once approved by an administrator it counts toward the points ranking.",
        submit_og_desc: "Fill in a match result; once approved it counts toward the points ranking.",
        ut_meta_desc: "WFLS Table Tennis Club easter egg: umpire training. Watch serve videos and judge whether the toss is legal.",
        ut_title: "🌟Umpire Training🌟 | WFLS Table Tennis Club",
        ut_hero_title: "🌟Umpire Training🌟",
        ut_hero_sub: "Watch the serve · Judge the toss angle · Train your eye",
        rank_submit_aria: "Submit a match result",
        rank_mode_aria: "Points category",
        rank_sort_default: "Points, descending",
        rank_loading_hint: "Loading ranking data...",
        rank_egg_title: "You found an easter egg",
        rank_egg_desc: "WTT rankings based on the WFLS club points rules",
        rank_egg_btn: "Enter",
        sb_games_title: "e.g. 11-9, 8-11, 11-7",
        wtt_hub_meta_desc: "WTT World Table Tennis ranking hub · Men's Singles / Women's Singles / Men's Doubles / Women's Doubles / Mixed Doubles",
        wtt_ranking_meta_desc: "WTT ranking, simulated with an ELO-variant algorithm · easter egg page",
        wtt_match_meta_desc: "WTT match detail (easter egg): points before and after, points breakdown, pre-match win-rate prediction and head-to-head history.",
        wtt_match_og_title: "WTT Match Detail | WFLS TT Club",
        wtt_ps_meta_desc: "WTT ranking · personal stats · opponent analysis",
        wtt_ps_page_title: "WTT Personal Stats 🥚 | WFLS Table Tennis Club",
        wtt_player_meta_desc: "WTT player profile: individual records, win rate, points trend and opponent analysis.",
        wtt_player_page_title: "WTT Player Stats | WFLS Table Tennis Club",
        wtt_player_cat_fallback: "Player page",
        wtt_dataviz_meta_desc: "WTT ranking data visualization: points trend charts, a rank flow river chart and player comparison.",
        wtt_dataviz_page_title: "WTT Data Visualization 🥚 | WFLS Table Tennis Club",
        wtt_assoc_meta_desc: "WTT association data: overall association strength rankings, squad details, ranking changes over time and an association head-to-head matrix.",
        wtt_assoc_page_title: "WTT Association Data 🥚 | WFLS Table Tennis Club",
        wtt_assoc_topn_hint: "Number of players in the global TOP-N; enter a positive integer from 5 to 500",
        wtt_matrix_size_title: "Build the matrix from the top N associations; enter a positive integer from 3 to 25",
        wtt_sr_meta_desc: "WTT season review: points changes, win streaks, attendance, best single results and monthly snapshots (easter egg, same rules as the WTT ranking).",
        wtt_aria_play_pause: "Play / Pause",
        wtt_aria_sort_field: "Sort field",
        wtt_aria_sort_dir: "Toggle ascending / descending",
        wtt_topn_title_1_20: "Enter any positive integer from 1 to 20",
        wtt_topn_title_1_66: "Enter any positive integer from 1 to 66",
        wtt_topn_title_1_100: "Enter any positive integer from 1 to 100",
        wtt_topn_title_2_20: "Enter any positive integer from 2 to 20",
        wtt_date_start_hint: "Start date; leave blank for no limit",
        wtt_date_end_hint: "End date; leave blank for no limit",
        adm_title: "Data Dashboard",
        adm_home_title: "Back to home",
        adm_hero_desc: "Site-wide data assets at a glance · five WTT modules with live core statistics",
        adm_editor_title: "Visually edit tournament brackets and export draws.json",
        adm_editor: "Bracket Editor",
        adm_refresh_title: "Reload all site data",
        adm_refresh: "Refresh",
        adm_ps_title: "Submissions Pending Review",
        adm_se_title: "Score Entry",
        adm_se_mode_match: "Match result",
        adm_se_mode_bonus: "Points adjustment",
        adm_se_games_hint: "e.g. 11-9, 8-11, 11-7",
        adm_se_add_match: "Add record",
        adm_se_amount: "Points (e.g. +100 / -30)",
        adm_se_add_bonus: "Add adjustment",
        adm_se_export: "Download the merged score-log.json",
        adm_se_clear: "Clear queue",
        adm_loading: "Loading all site data...",
        /* ---- draws editor (de_*) ---- */
        de_page_title: "Draws Editor | WFLS Table Tennis Club",
        de_meta_desc: "WFLS table tennis club draws editor. Edit brackets visually, generate them from templates and export draws.json.",
        de_kw: "Wuhan Foreign Languages School,WFLS,Table Tennis,Draws,Bracket,Knockout,Draws Editor,draws.json",
        de_title: "Draws Editor",
        de_hero_desc: "Visual editing · Templates · Export draws.json",
        de_back_admin: "Back to the data dashboard",
        de_sel_draw: "Select the draw to edit",
        de_new_draw: "New blank draw",
        de_dup_draw: "Duplicate the current draw",
        de_del_draw: "Delete the current draw",
        de_from_tpl: "Generate from a template",
        de_undo: "Undo (Ctrl+Z)",
        de_redo: "Redo (Ctrl+Y)",
        de_validate: "Validate data",
        de_import: "Import",
        de_download: "Download draws.json",
        de_copy_all: "Copy all draws.json to the clipboard",
        de_sec_basic: "Basic info",
        de_fld_title: "Title",
        de_ph_draw_title: "2026 Table Tennis Singles Knockout",
        de_fld_subtitle: "Subtitle (optional)",
        de_ph_subtitle: "e.g. 12 players · single elimination",
        de_fld_comp: "Linked competition (competitionId)",
        de_opt_none: "(none)",
        de_opt_nodraw: "(no draws)",
        de_sec_layout: "Layout & grid",
        de_fld_layout: "Layout mode",
        de_opt_layout_grid: "Manual grid (card col/row)",
        de_opt_layout_auto: "Auto stack (by round / order)",
        de_fld_cellw: "Card width cellWidth",
        de_fld_cellh: "Card height cellHeight",
        de_fld_gap: "Gap gap",
        de_fld_padx: "Horizontal padding padX",
        de_fld_pady: "Vertical padding padY",
        de_btn_arrange: "Auto-arrange",
        de_hint_arrange: "Auto-arrange reflows every card into a standard knockout tree using its “round col” and “row in column”.",
        de_sec_rounds: "Round labels (per column)",
        de_btn_add_round: "Add a column label",
        de_sec_look: "Appearance",
        de_fld_accent: "Accent color (blank = default)",
        de_chk_seeds: "Show seed badges",
        de_chk_legend: "Show legend",
        de_btn_reset_look: "Reset appearance",
        de_col: "Col",
        de_ph_round: "Round {n}",
        de_del_short: "Delete",
        de_hint_rounds: "No custom labels yet — the viewer will use the default round names.",
        de_btn_select: "Select",
        de_btn_connect: "Connect",
        de_mode_select: "Select mode",
        de_mode_connect: "Connect mode: click the source → click the target",
        de_btn_add_match: "Match card",
        de_btn_add_bye: "Bye card",
        de_btn_add_champion: "Champion card",
        de_btn_add_note: "Note card",
        de_btn_del_selected: "Delete selected",
        de_propagate: "Fill the next round's players from the winners of finished cards and the connections",
        de_btn_propagate: "Fill winners",
        de_zoom_fit: "Fit to canvas",
        de_stat_cards: "0 cards",
        de_stat_conns: "0 connections",
        de_unit_cards: "cards",
        de_unit_conns: "connections",
        de_stat_dirty: "Unsaved changes",
        de_prog_done: "Matches {done}/{total} finished",
        de_prog_live: "{n} live",
        de_empty_canvas: "No draw yet. Click <i class=\"fa-solid fa-plus\"></i> in the top bar to create one, or <i class=\"fa-solid fa-wand-magic-sparkles\"></i> to generate it from a template.",
        de_ins_empty_1: "Click a card on the canvas to start editing.",
        de_ins_empty_2: "Drag to move · use connect mode to link the progression",
        de_ins_empty_3: "Ctrl+Z to undo · Delete to remove the selection",
        de_ins_card: "Card",
        de_type_match: "Match",
        de_type_bye: "Bye",
        de_type_champion: "Champion",
        de_type_note: "Note",
        de_fld_p1: "Player 1",
        de_ph_player: "Name / team",
        de_fld_seed: "Seed",
        de_ph_seed: "e.g. 1",
        de_fld_pnote: "Note (e.g. withdrew)",
        de_ph_optional: "optional",
        de_fld_p2: "Player 2",
        de_fld_pnote2: "Note",
        de_fld_score: "Total score (e.g. 3-1)",
        de_fld_games: "Game scores (one game per line, e.g. 11-9)",
        de_fld_winner: "Winner",
        de_win_p1: "Player 1 wins",
        de_win_draw: "Draw",
        de_win_p2: "Player 2 wins",
        de_fld_status: "Status",
        de_st_auto: "Auto (derived from the score)",
        de_st_scheduled: "Scheduled",
        de_st_live: "Live",
        de_st_final: "Finished",
        de_fld_champ: "Champion",
        de_fld_label: "Label text",
        de_ph_champ: "Champion",
        de_fld_note_text: "Note text",
        de_ph_group: "Group A (round-robin)",
        de_fld_col: "Column col (round)",
        de_fld_row: "Row row",
        de_fld_time: "Time (optional)",
        de_fld_venue: "Venue (optional)",
        de_ph_venue: "Table 1",
        de_fld_card_note: "Note (optional)",
        de_ph_card_note: "Withdrawn / postponed due to rain",
        de_sec_conns: "Connections",
        de_btn_dup_card: "Duplicate card",
        de_conn_from: "from",
        de_conn_to: "to",
        de_conn_del: "Delete connection",
        de_conn_none: "No connections — use “Connect” in the toolbar to add one",
        de_tpl_modal_title: "Generate a draw from a template",
        de_fld_tpl_type: "Template type",
        de_tpl_single: "Single elimination (with seeded bracket / byes / third-place match)",
        de_tpl_groups: "Group round-robin + knockout",
        de_fld_tpl_comp: "Linked competition",
        de_tpl_entries: "Entrants (one per line, in seed order; the field is padded to a power of two and spare slots become byes)",
        de_ph_entries: "祁子傲\n陈瑜萱\n任峻贤\n...",
        de_tpl_third: "Add a third-place match (the semifinal losers play each other)",
        de_tpl_group_fmt: "Groups (one per line: “Group: Player 1, Player 2, Player 3”)",
        de_ph_groups: "Group A: Player 1, Player 2, Player 3\nGroup B: Player 4, Player 5\nGroup C: ...\nGroup D: ...",
        de_tpl_ko: "Generate the knockout stage (group winners advance)",
        de_cancel: "Cancel",
        de_generate: "Generate",
        de_json_modal_title: "Current draw JSON (default values are stripped on save)",
        de_json_hint: "“Apply changes” replaces the current draw with this content (paste a single object or a whole draws.json array — an array replaces every draw).",
        de_copy: "Copy",
        de_apply: "Apply changes",
        de_close: "Close",
        de_import_modal_title: "Import JSON",
        de_import_hint: "Paste draws.json (an array replaces every draw; a single object is appended as a new draw)",
        de_import_file: "Or import from a local file (overrides the pasted content)",
        de_import_upgrade: "Auto-upgrade legacy v2 data to v3",
        de_err_load: "Failed to load data/draws.json — open this page through a local HTTP server (not file://)",
        de_toast_restore: "Restored the unexported edits from {when}; use “Import” to get the repository version back",
        de_last: "the last session",
        de_toast_new: "Created {id} — generate it from a template or add cards by hand",
        de_err_no_draw: "There is no draw to duplicate",
        de_untitled: "Untitled",
        de_copy_suffix: " (copy)",
        de_new_draw_title: "New draw",
        de_toast_dup: "Duplicated as {id}",
        de_confirm_del: "Delete “{title}”? This can be undone.",
        de_toast_undo: "Undone",
        de_toast_redo: "Redone",
        de_id_empty: "(empty)",
        de_err_empty_canvas: "The canvas is empty",
        de_toast_arranged: "Cards re-arranged into a proper round tree",
        de_toast_filled: "Filled {n} empty slots",
        de_toast_noprop: "No winners to propagate (finished cards and connections are required)",
        de_toast_conflict: "{n} target slots conflict — please check them manually",
        de_err_no_drag: "Cards cannot be dragged in auto layout — switch to the manual grid",
        de_confirm_del_conn: "Delete the connection {from} → {to}?",
        de_toast_src: "Source {id} selected — click the target card to connect (click the source again to cancel)",
        de_err_conn_exists: "The connection already exists",
        de_toast_conn: "Connected {from} → {to}",
        de_err_pick_draw: "Create or select a draw first",
        de_confirm_del_card: "Delete card {id} and its connections?",
        de_hint_no_draw: "There is no draw at the moment.",
        de_ok: "Passed",
        de_lbl_error: "Error: ",
        de_lbl_warn: "Warning: ",
        de_val_title: "Validation result ({e} errors / {w} warnings)",
        de_toast_copy_json: "JSON copied",
        de_err_copy: "Copy failed, please select the text manually",
        de_toast_dup_id: "Duplicate draw IDs were renumbered: {list}",
        de_join: ", ",
        de_toast_replaced: "Replaced all {n} draws",
        de_err_invalid: "Invalid object",
        de_toast_conflict_id: "IDs conflicting with the existing draws were renumbered: {list}",
        de_toast_applied: "Current draw updated",
        de_err_json: "Failed to parse the JSON: {msg}",
        de_toast_imported: "Imported {n} draws",
        de_toast_appended: "Appended as {id}",
        de_err_import: "Import failed: {msg}",
        de_err_entries: "Please fill in the entrant list",
        de_err_groups: "Please enter the groups as “Group: Player 1, Player 2”",
        de_err_tpl: "Template generation failed: {msg}",
        de_toast_tpl: "Template generated as {id} — feel free to fine-tune it",
        de_toast_download: "draws.json downloaded — use it to replace data/draws.json in the repository and commit",
        de_toast_copy_all: "All of draws.json was copied to the clipboard",
        de_err_copy_all: "Copy failed, please copy manually from the JSON panel",
        de_v_empty: "The draw is empty",
        de_v_no_id: "Missing id",
        de_v_no_title: "Missing title",
        de_v_no_comp: "competitionId \"{id}\" does not exist",
        de_v_card_no_id: "There is a card without an id",
        de_v_dup_id: "Duplicate card id: {id}",
        de_v_bad_winner: "Card {id} has an invalid winner ({w}; expected 0/1/2/null)",
        de_v_neg_pos: "col/row of card {id} cannot be negative",
        de_v_no_players: "Match card {id} is missing a player",
        de_v_winner_no_score: "Match card {id} has a winner but no score",
        de_v_no_champ: "Champion card {id} has no player",
        de_v_conn_from: "Connection from \"{id}\" does not exist",
        de_v_conn_to: "Connection to \"{id}\" does not exist",
        de_v_conn_self: "A card cannot be connected to itself: {id}",

        /* ---- admin dashboard (adm_*) ---- */
        /* event codes */
        adm_disc_ms: "Men's Singles MS", adm_disc_ws: "Women's Singles WS", adm_disc_wd: "Women's Doubles WD", adm_disc_md: "Men's Doubles MD", adm_disc_xd: "Mixed Doubles XD",
        /* header chips */
        adm_chips_reloading: "Reloading…", adm_chip_load: "Loaded in {t}s", adm_chip_records: "{n} WTT records",
        /* section titles */
        adm_sec_overview: "Overview", adm_sec_disc: "WTT five-event module volume", adm_sec_charts: "WTT data distribution",
        adm_sec_records: "Record composition and active players", adm_sec_files: "Core data files", adm_sec_seasons: "Season management",
        /* KPI cards */
        adm_kpi_wtt_records: "WTT match records", adm_kpi_wtt_records_sub: "Sum of the five events",
        adm_kpi_wtt_players: "Total WTT players", adm_kpi_wtt_players_sub: "Players with an initial score on file",
        adm_kpi_wtt_seasons: "WTT seasons", adm_kpi_wtt_seasons_sub: "Season management",
        adm_kpi_wtt_events: "WTT event types", adm_kpi_wtt_events_sub: "Tiers of competition",
        adm_kpi_players: "Player profiles", adm_kpi_players_sub: "One source of player data",
        adm_kpi_news_comp: "News / Competitions", adm_kpi_news_comp_sub: "News {n}{nh} · Competitions {m}{mh}",
        adm_hidden_suffix: " ({n} hidden)", adm_total_records: "{n} records in total",
        /* discipline cards */
        adm_disc_template: "Template data only", adm_disc_no_real: "No real data yet",
        adm_unit_matches: "match records", adm_unique_players: "unique players", adm_share_of_total: "of all records",
        /* charts */
        adm_chart_trend: "Yearly match-record trend (stacked by event)", adm_chart_disc: "Match records per event",
        adm_chart_pie: "Event-type share (all events)", adm_note_unit: "records", adm_chart_center: "Total records",
        adm_axis_records: "Match records",
        adm_tip_records: "{l}: {v}", adm_tip_total: "Total {n}",
        adm_tip_share: "{v} · {p}%", adm_tip_records_pct: "{v} ({p}%)",
        /* top players */
        adm_top_players: "Most active players — top {n}", adm_top_note: "By appearances (wins + losses)", adm_rank_wl: "{w} W · {l} L",
        /* event-type table */
        adm_event_detail: "Event-type breakdown", adm_event_total: "{n} total",
        adm_th_event: "Event type", adm_th_records: "Records", adm_th_share: "Share", adm_th_dist: "Distribution",
        /* core data file cards */
        adm_derived: " (derived)",
        adm_unit_player_profiles: "player profiles", adm_unit_members: "members", adm_unit_news: "news items",
        adm_unit_competitions: "competitions", adm_unit_match_records: "match records", adm_unit_seasons: "seasons",
        adm_unit_qa: "Q&A entries", adm_unit_changelog: "changelog entries", adm_unit_draws: "brackets",
        adm_unit_players: "players", adm_unit_event_types: "event types", adm_unit_tags: "players · {n} tags",
        adm_unit_updated: "last updated",
        adm_pill_hidden: "{n} hidden", adm_pill_hidden_versions: "{n} hidden versions",
        adm_share_total: "{p}% of core total", adm_meta_file: "Metadata file",
        adm_files_sub: "data/ directory · {n} files",
        /* season management */
        adm_wtt_seasons_panel: "WTT seasons (by event)", adm_core_seasons_panel: "Club seasons",
        adm_seasons_count: "{n} seasons",
        adm_th_name: "Name", adm_th_dates: "Date range", adm_th_status: "Status",
        adm_vis_on: "Visible", adm_vis_off: "Hidden",
        /* pending submissions */
        adm_ps_empty: "No submissions pending review", adm_ps_review: "Review →",
        adm_ps_fail: "Failed to load (the anonymous GitHub API is rate-limited to 60 requests per hour per IP — please refresh and try again later)",
        /* score entry */
        adm_se_q_format: "Format {f}", adm_se_q_win: "{w} beat {l}", adm_se_q_games: " ({g})", adm_se_q_adjust: "Adjustment",
        adm_se_pick_winner: "-- Select winner --", adm_se_pick_loser: "-- Select loser --", adm_se_pick_player: "-- Select player --",
        adm_se_err_coef: "Failed to load event-coefficient.json", adm_se_err_players: "Failed to load players.json",
        adm_se_err_format: "Format must be one of default / bo3 / bo5 / bo7",
        adm_se_err_no_score: "\"Include game scores\" is checked — please enter the overall score or the per-game scores",
        adm_se_err_total_fmt: "The overall score must read \"winner games-loser games\", e.g. 3-1",
        adm_se_err_total_order: "Overall score {w}-{l}: the winner's game count must be greater than the loser's (winner first)",
        adm_se_err_total_max: "Overall score {w}-{l}: singles go up to bo7 (the winner takes at most 4 games)",
        adm_se_err_total_mismatch: "Overall score {w}-{l} does not match format {eff} (needs {n} games won)",
        adm_se_err_games_self: "The per-game scores do not match the overall score {w}-{l} (there should be {t} games, with the winner taking {w})",
        adm_se_err_games_infer: "The per-game scores do not determine a winner (winner-first: the winner must take more games)",
        adm_se_ok_match: "Added 1 match record",
        adm_se_err_bonus_fill: "Please fill in date / target / points (a number)", adm_se_ok_bonus: "Added 1 points adjustment",
        adm_se_ok_cleared: "Queue cleared",
        adm_se_ok_copied: "Copied to the clipboard — paste it at the end of the data/score-log.json array",
        adm_se_ok_downloaded: "Merged file downloaded ({n} existing + {m} new records). Replace data/score-log.json with the downloaded file and commit.",
        adm_se_err_merge: "The current score-log.json could not be loaded, so it cannot be merged",

        /* ---- umpire training easter egg (ut_*) ---- */
        ut_default_title: "Umpire Training", ut_default_desc: "Watch serve videos and judge whether the ball toss is legal.",
        ut_video_missing: "Demo video coming soon", ut_options_aria: "Options",
        ut_best: "Personal best: {c}/{t} ({p}%)",
        ut_rule_watch: "Watch the serve video", ut_rule_judge: "Judge whether the toss is near-vertical", ut_rule_verdict: "Make your call",
        ut_count: "{n} questions", ut_mode_practice: "Practice mode", ut_mode_practice_desc: "Answer one question at a time, with instant feedback and explanations",
        ut_start: "Start training", ut_step: "Question {cur} / {total}",
        ut_topic_toss: "Toss angle", ut_topic_general: "General calls",
        ut_verdict_ok: "Correct call!", ut_verdict_bad: "Wrong call…",
        ut_finish: "See results", ut_next: "Next question",
        ut_rank_intl: "International Umpire", ut_rank_nat: "National Umpire", ut_rank_certified: "Certified", ut_rank_trainee: "Trainee Umpire",
        ut_pass_title: "Training passed!", ut_fail_title: "Keep going!",
        ut_result_detail: "{c} / {t} correct · Rank: <strong>{rank}</strong>",
        ut_new_best: "New personal best!", ut_restart: "Play again", ut_back_home: "Back to home",
        ut_load_fail: "The question bank could not be loaded, please try again later.", ut_reload: "Reload"
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
    const _i18n = i18n[lang] || {};
    document.querySelectorAll('[data-i18n]').forEach(el => { const key = el.getAttribute('data-i18n'); if (_i18n[key] != null) el.innerHTML = _i18n[key]; });
    document.querySelectorAll('[data-i18n-title]').forEach(el => { const key = el.getAttribute('data-i18n-title'); if (_i18n[key]) el.title = _i18n[key]; });
    document.querySelectorAll('[data-i18n-placeholder]').forEach(el => { const key = el.getAttribute('data-i18n-placeholder'); if (_i18n[key] != null) el.placeholder = _i18n[key]; });
    document.querySelectorAll('[data-i18n-aria]').forEach(el => { const key = el.getAttribute('data-i18n-aria'); if (_i18n[key] != null) el.setAttribute('aria-label', _i18n[key]); });
    document.querySelectorAll('[data-i18n-alt]').forEach(el => { const key = el.getAttribute('data-i18n-alt'); if (_i18n[key] != null) el.setAttribute('alt', _i18n[key]); });
    document.querySelectorAll('[data-i18n-content]').forEach(el => { const key = el.getAttribute('data-i18n-content'); if (_i18n[key] != null) el.setAttribute('content', _i18n[key]); });
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
    if (typeof dataVizMainReapplyI18n === 'function') dataVizMainReapplyI18n();
    if (typeof rankingReapplyI18n === 'function') rankingReapplyI18n();
    if (typeof reapplyPlayerPage === 'function') reapplyPlayerPage();
    if (typeof reapplyPersonalStats === 'function') reapplyPersonalStats();
    if (typeof seasonReviewReapplyI18n === 'function') seasonReviewReapplyI18n();
    if (typeof matchDetailReapplyI18n === 'function') matchDetailReapplyI18n();
    if (typeof docsBrowserReapplyI18n === 'function') docsBrowserReapplyI18n();
    if (typeof adminReapplyI18n === 'function') adminReapplyI18n();
    if (typeof drawsEditorReapplyI18n === 'function') drawsEditorReapplyI18n();
    if (typeof umpireTrainingReapplyI18n === 'function') umpireTrainingReapplyI18n();
    if (typeof gameReapplyI18n === 'function') gameReapplyI18n();
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
    if (n.isInitial) return (L.season_initial_label || '{season}初始积分').replace('{season}', seasonLabel(n.season || ''));
    return formatNodeDate(n.time) || n.label || '';
}

/* ===================== i18n 显示层 helper（数据键保持中文，仅显示翻译） ===================== */
const EVENT_TYPE_KEY_MAP = { '普通': 'ev_normal', '排位赛': 'ev_ranked', '挑战赛': 'ev_challenge', '校乒联赛': 'ev_school_league', '十二强赛': 'ev_top12', '校乒赛团体': 'ev_school_team', '校乒赛单打': 'ev_school_singles', '双打': 'ev_doubles', '比赛结果加分': 'score_type_bonus' };
const WTT_EVENT_TYPE_KEY_MAP = { 'T联赛': 'wtt_ev_tleague', 'ittf公开赛': 'wtt_ev_ittf_open', 'ittf常规赛': 'wtt_ev_ittf_regular', 'ittf白金赛': 'wtt_ev_ittf_platinum', '世乒赛': 'wtt_ev_worlds', '世乒赛团体': 'wtt_ev_worlds_team', '世界杯': 'wtt_ev_worldcup', '世界杯团体': 'wtt_ev_worldcup_team', '乒超联赛': 'wtt_ev_csl', '亚运会': 'wtt_ev_asiad', '亚运会团体': 'wtt_ev_asiad_team', '全日锦': 'wtt_ev_alljapan', '全运会': 'wtt_ev_nationalgames', '全锦赛': 'wtt_ev_nationals', '冠军赛': 'wtt_ev_champions', '大满贯': 'wtt_ev_grandsmash', '奥运会': 'wtt_ev_olympics', '奥运会团体': 'wtt_ev_olympics_team', '常规挑战赛': 'wtt_ev_challenge_reg', '德国杯': 'wtt_ev_dfbpokal', '德甲联赛': 'wtt_ev_bundesliga', '德甲联赛决赛': 'wtt_ev_bundesliga_final', '德甲联赛半决赛': 'wtt_ev_bundesliga_semi', '总决赛': 'wtt_ev_finals', '支线赛': 'wtt_ev_feeder', '欧冠团体': 'wtt_ev_euroleague_team', '洲杯赛': 'wtt_ev_continental_cup', '洲锦赛': 'wtt_ev_continental_champs', '洲锦赛团体': 'wtt_ev_continental_team', '球星挑战赛': 'wtt_ev_star', '比赛结果加分': 'score_type_bonus' };
const SEASON_KEY_MAP = { '2026-spring': 'season_2026_spring', '2026-summer': 'season_2026_summer', '2026-autumn': 'season_2026_autumn', '2026年春季学期': 'season_2026_spring', '2026年暑假': 'season_2026_summer', '2026年秋季学期': 'season_2026_autumn' };
const PLAYER_TAG_KEY_MAP = { '校队成员': 'ptag_school_team', '大满贯': 'ptag_grand_slam', '26-27年社长': 'ptag_pres_2627', '26-27年副社长': 'ptag_vp_2627', '25-26年社长': 'ptag_pres_2526', '25-26年副社长': 'ptag_vp_2526', '24-25年副社长': 'ptag_vp_2425', '校一直板': 'ptag_penholder1', '校二直板': 'ptag_penholder2' };
const PLAYER_HONOR_KEY_MAP = { '校乒赛2025单打冠军': 'phonor_s25_singles_1', '校乒赛2026单打冠军': 'phonor_s26_singles_1', '校乒赛2026单打亚军': 'phonor_s26_singles_2', '校乒赛2026单打季军': 'phonor_s26_singles_3', '校乒赛2026团体冠军': 'phonor_s26_team_1', '校乒赛2026团体亚军': 'phonor_s26_team_2', '校乒赛2026团体季军': 'phonor_s26_team_3', '校乒赛2025团体季军': 'phonor_s25_team_3' };
/* 按映射表解析显示文本：英文模式查字典，缺失回退原文（优雅降级，不显示 key） */
function i18nMapped(map, value) {
    if (value == null || value === '') return value == null ? value : '';
    if (currentLang === 'zh') return value;
    const L = i18n[currentLang] || {};
    const k = map[value];
    return (k && L[k] != null) ? L[k] : value;
}
function eventTypeLabel(v) { return i18nMapped(EVENT_TYPE_KEY_MAP, v); }
function wttEventTypeLabel(v) { return i18nMapped(WTT_EVENT_TYPE_KEY_MAP, v); }
function seasonLabel(v) { return i18nMapped(SEASON_KEY_MAP, v); }
function playerTagLabel(v) { return i18nMapped(PLAYER_TAG_KEY_MAP, v); }
function playerHonorLabel(v) { return i18nMapped(PLAYER_HONOR_KEY_MAP, v); }
/* 球员职务 / 简介：players.json 可带 role_en / description_en 同级字段，英文模式优先 */
function playerRole(p) { if (!p) return ''; if (currentLang === 'en' && p.role_en) return p.role_en; return p.role || ''; }
function playerDescription(p) { if (!p) return ''; if (currentLang === 'en' && p.description_en) return p.description_en; return p.description || ''; }
/* 统一日期格式（英文模式 {m}/{d}/{y}；经 i18n 模板可随时改样式） */
function fmtDate(y, m, d) {
    const L = i18n[currentLang] || {};
    const tpl = L.date_ymd || '{y}年{m}月{d}日';
    return tpl.replace('{y}', y).replace('{m}', m).replace('{d}', d);
}
function fmtDateFrom(ds) {
    const p = String(ds || '').split('-');
    if (p.length < 3 || isNaN(+p[0])) return String(ds || '');
    return fmtDate(p[0], +p[1], +p[2]);
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
        { align: 'center', minW: 40, cell: (p, i) => { const r = p.rank || (i + 1); return { text: String(r), color: r === 1 ? C.gold : r === 2 ? C.silver : r === 3 ? C.bronze : C.sub, weight: r <= 3 ? 700 : 500 }; } },
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

    /* 副标题自适应：超宽时先缩字号（12→9px），仍超宽由 fillText maxWidth 水平压缩兜底 */
    const subAvail = W - (inset + 6) * 2;
    let subFont = 12;
    ctx.font = `400 ${subFont}px ${FONT}`;
    while (subFont > 9 && ctx.measureText(opts.subtitle || '').width > subAvail) { subFont -= 0.5; ctx.font = `400 ${subFont}px ${FONT}`; }
    ctx.fillStyle = C.sub; ctx.textAlign = 'left';
    ctx.fillText(opts.subtitle || '', inset + 6, y + subH / 2 - 2, subAvail);
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

/* 规则/文档入口下拉：与导出图片同款「主药丸 + 菜单」交互，菜单项为文档链接。
   links: [{ key: i18n键, href: 文档地址 }]；主药丸与箭头均可开合，点项跳转后随页面离开。 */
function attachDocLinkMenu(btn, links) {
    if (!btn || btn._docMenuAttached) return;
    btn._docMenuAttached = true;
    const L = i18n[currentLang] || {};
    const wrap = document.createElement('div');
    wrap.className = 'export-split';
    btn.parentNode.insertBefore(wrap, btn);
    wrap.appendChild(btn);

    const toggle = document.createElement('button');
    toggle.type = 'button';
    toggle.className = 'qa-link-btn export-menu-toggle';
    toggle.setAttribute('aria-haspopup', 'true');
    toggle.setAttribute('aria-expanded', 'false');
    toggle.title = L.rank_rules_pill || '';
    toggle.innerHTML = '<i class="fa-solid fa-chevron-down" aria-hidden="true"></i>';
    wrap.appendChild(toggle);

    const menu = document.createElement('div');
    menu.className = 'export-menu';
    menu.hidden = true;
    menu.innerHTML = links.map(l => `<a class="export-menu-item" href="${escapeHtml(l.href)}" data-i18n="${escapeHtml(l.key)}">${escapeHtml(L[l.key] || l.key)}</a>`).join('');
    wrap.appendChild(menu);

    const setOpen = open => { menu.hidden = !open; toggle.setAttribute('aria-expanded', open ? 'true' : 'false'); };
    const flip = e => { e.stopPropagation(); setOpen(menu.hidden); };
    btn.addEventListener('click', flip);
    toggle.addEventListener('click', flip);
    menu.addEventListener('click', e => e.stopPropagation());
    document.addEventListener('click', () => setOpen(false));
    document.addEventListener('keydown', e => { if (e.key === 'Escape' && !menu.hidden) setOpen(false); });
}

/* ---- DOM 节点导出为图片（html2canvas；detail 页 n/c/q 内容卡使用） ---- */
async function exportDomNodeAsImage(node, opts) {
    opts = opts || {};
    if (typeof html2canvas === 'undefined') throw new Error('html2canvas 未加载');
    if (document.fonts && document.fonts.ready) { try { await document.fonts.ready; } catch (e) { /* 字体就绪探测失败时直接渲染 */ } }
    const scale = Math.min(3, Math.max(2, window.devicePixelRatio || 2));
    // Chrome 128+ 默认对中西文混排自动加间隙（text-autospace），html2canvas 的画布绘制不含该间隙，
    // 量宽与绘制不一致会导致全部文字错位——导出节点上显式关闭，同时关闭连字
    node.style.textAutospace = 'no-autospace';
    node.style.fontKerning = 'none';
    // 页面被施加非 100% 的 CSS zoom 时（浏览器缩放策略/扩展注入），html2canvas 的文字坐标
    // 会整体错位——在导出节点内做反向抵消，保证输出为节点的原始布局
    let counterZoom = '';
    try {
        let v = parseFloat(getComputedStyle(document.documentElement).zoom);
        if (!Number.isFinite(v) || !v) v = parseFloat(getComputedStyle(document.body).zoom);
        if (Number.isFinite(v) && v > 0 && Math.abs(v - 1) > 0.001) counterZoom = String(1 / v);
    } catch (e) { /* 读取失败时按无 zoom 处理 */ }
    if (counterZoom) node.style.zoom = counterZoom;
    try {
        const canvas = await html2canvas(node, { scale: scale, backgroundColor: null, useCORS: true, logging: false });
        const blob = _rankImgDataUrlToBlob(canvas.toDataURL('image/png'));
        _downloadRankImageBlob(blob, buildExportFileName(opts.filenameBase || 'wfls-export'));
    } finally {
        if (counterZoom) node.style.zoom = '';
        node.style.textAutospace = '';
        node.style.fontKerning = '';
    }
}

{
    const sl = safeStorage.get('wfls-lang.v1') || safeStorage.get('wfls-lang') || 'zh';
    setLanguage(sl);
    if (langToggle) langToggle.addEventListener('click', () => setLanguage(currentLang === 'zh' ? 'en' : 'zh'));
}

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
    // 英文模式用 *_en 参与匹配与展示，英文关键词才能命中英文正文
    const sr = it => currentLang === 'en'
        ? Object.assign({}, it, { title: it.title_en || it.title, excerpt: it.excerpt_en || it.excerpt, content: it.content_en || it.content })
        : it;
    if (newsItems.length) newsItems.map(sr).forEach(item => {
        const s = calcScore(query, item.title, item.excerpt || '', item.content || '', item.tag || '', i18n[currentLang]['tag_' + item.tag] || '');
        if (s > 0) results.push({ type: 'news', typeLabel: i18n[currentLang].search_type_news, title: item.title, excerpt: stripMediaMarkers(item.excerpt || item.content || ''), date: item.date, link: 'detail.html?type=news&id=' + item.id, score: s });
    });
    if (compItems.length) compItems.map(sr).forEach(item => {
        const s = calcScore(query, item.title, item.excerpt || '', item.content || '', item.tag || '', i18n[currentLang]['tag_' + item.tag] || '');
        if (s > 0) results.push({ type: 'competition', typeLabel: i18n[currentLang].search_type_competition, title: item.title, excerpt: stripMediaMarkers(item.excerpt || item.content || ''), date: item.date, link: 'detail.html?type=competition&id=' + item.id, score: s });
    });
    if (membersData && membersData.length) membersData.forEach(m => {
        const shown = playerDisplayName(m.name);
        const mRole = playerRole(m), mDesc = playerDescription(m);
        const s = Math.max(calcScore(query, m.name, mRole, mDesc), calcScore(query, shown, '', ''));
        if (s > 0) results.push({ type: 'member', typeLabel: i18n[currentLang].search_type_member, title: shown + ' - ' + mRole, excerpt: mDesc || '', date: '', link: 'members.html', score: s });
    });
    if (currentDisplayData && currentDisplayData.length) currentDisplayData.forEach(p => {
        const shown = playerDisplayName(p['姓名']);
        const s = Math.max(calcScore(query, p['姓名'], String(p['当前积分'] || ''), ''), calcScore(query, shown, '', ''));
        if (s > 0) {
            const uid = getUidForPlayerName(p['姓名']);
            const _L = i18n[currentLang] || {};
            const tpl = (_L.search_rank_tpl || '排名：{rank} | 胜率：{rate}').replace('{rank}', String(p.rank || '-')).replace('{rate}', String(p['胜率'] || '0%'));
            results.push({ type: 'ranking', typeLabel: i18n[currentLang].search_type_ranking, title: shown + ' - ' + (p['当前积分'] || 0).toFixed(1) + '分', excerpt: tpl, date: '', link: uid != null ? ('player.html?uid=' + uid) : 'ranking.html', score: s + (uid != null ? 5 : 0) });
        }
    });
    if (qaItems.length) qaItems.forEach(item => {
        const s = calcScore(query, item.title, item.excerpt || '', item.content || '', item.tag || '', i18n[currentLang]['tag_' + item.tag] || '');
        if (s > 0) results.push({ type: 'qa', typeLabel: i18n[currentLang].search_type_qa, title: item.title, excerpt: stripMediaMarkers(item.excerpt || item.content || ''), date: item.date, link: 'detail.html?type=qa&id=' + item.id, score: s });
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

/* 内容字段取本地化值：英文模式优先 *_en 同级字段，缺失回退中文原文。
   闭集枚举（tag / 类型 / 赛季 / tags / honors）不走这里——它们是数据键，由 *Label() 查字典。 */
function contentField(item, field) {
    if (!item) return '';
    if (currentLang === 'en') {
        const en = item[field + '_en'];
        if (en != null && String(en).trim() !== '') return en;
    }
    return item[field] != null ? item[field] : '';
}
/* 标题 / 摘要统一入口（内部已 escapeHtml，调用方不要再转义） */
function contentTitle(item) { return escapeHtml(contentField(item, 'title')); }
function contentExcerpt(item) { return formatExcerpt(contentField(item, 'excerpt')); }

function formatExcerpt(text) { if (!text) return ''; return renderLatexInString(escapeHtml(text).replace(/\n/g, '<br>').replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')); }
function renderLatexInString(html) { if (!html || typeof katex === 'undefined') return html; try { html = html.replace(/\$\$([\s\S]*?)\$\$/g, function(match, formula) { var f = formula.trim(); if (!f) return match; try { var r = katex.renderToString(f, { displayMode: true, throwOnError: false, strict: false }); return r.indexOf('katex-error') !== -1 ? match : r; } catch(e) { return match; } }); html = html.replace(/(^|[^\\$])\$([^\n$]+?)\$/g, function(match, prefix, formula) { var f = formula.trim(); if (!f) return match; try { var r = katex.renderToString(f, { displayMode: false, throwOnError: false, strict: false }); return r.indexOf('katex-error') !== -1 ? match : prefix + r; } catch(e) { return match; } }); } catch(e) { console.warn('LaTeX render failed', e); } return html; }
function protectLatex(text) { var blocks = []; var p = text; p = p.replace(/\$\$([\s\S]*?)\$\$/g, function(m, f) { var i = blocks.length; blocks.push({ t: 'd', f: f.trim() }); return '\uE000LD' + i + '\uE000'; }); p = p.replace(/\$([^\n]+?)\$/g, function(m, f) { var i = blocks.length; blocks.push({ t: 'i', f: f.trim() }); return '\uE000LI' + i + '\uE000'; }); return { text: p, blocks: blocks }; }
function restoreLatex(html, blocks) { if (!blocks || !blocks.length) return html; for (var i = 0; i < blocks.length; i++) { var b = blocks[i]; var ph = (b.t === 'd' ? '\uE000LD' : '\uE000LI') + i + '\uE000'; var idx = html.indexOf(ph); if (idx === -1) { html = html.replace(new RegExp('LD' + i + '(?=[^' + '\uE000' + ']|$)|LI' + i + '(?=[^' + '\uE000' + ']|$)', 'g'), b.t === 'd' ? '$$' + b.f + '$$' : '$' + b.f + '$'); continue; } try { var rendered = katex.renderToString(b.f, { displayMode: b.t === 'd', throwOnError: false, strict: false }); html = html.split(ph).join(rendered); } catch(e) { html = html.split(ph).join(b.t === 'd' ? '$$' + b.f + '$$' : '$' + b.f + '$'); } } return html; }
function renderMarkdown(text) { if (!text) return ''; const hasKatex = typeof katex !== 'undefined'; let blocks = []; let toProcess = escapeHtml(text); if (hasKatex) { const r = protectLatex(toProcess); toProcess = r.text; blocks = r.blocks; } let html; if (typeof marked !== 'undefined' && marked.parse) { try { marked.setOptions({ breaks: true, gfm: true }); html = marked.parse(toProcess); } catch(e) { console.warn('Markdown parse failed, fallback to formatExcerpt', e); html = formatExcerpt(toProcess); } } else { html = formatExcerpt(toProcess); } if (hasKatex && blocks.length) html = restoreLatex(html, blocks); return html; }
function parseWinRate(s) { return parseFloat((s || '0%').replace('%', '')) || 0; }
// 对（引擎输出、已按积分降序）的排名数据赋予同分并列名次（1,2,2,4 式）。
// club / WTT 两管线共用（calculateRankChanges / wttCalculateRankChanges）：
// 积分相同者名次相同，既消除"同分球员跨快照互换顺序导致的假▲▼"，
// 也让 # 列对访客如实反映并列（两人并列第3时下一名为第5）。
function assignTiedRanks(rows) {
    let lastScore = null, lastRank = 0;
    return rows.map((p, i) => {
        const score = p['当前积分'] || 0;
        const rank = (i > 0 && score === lastScore) ? lastRank : (i + 1);
        lastScore = score; lastRank = rank;
        return Object.assign({}, p, { rank });
    });
}
function createNewsCard(item) { const tt = i18n[currentLang]['tag_' + item.tag] || item.tag; return `<div class="news-card-date">${escapeHtml(item.date)}</div><h3>${contentTitle(item)}</h3><p>${contentExcerpt(item)}</p><span class="news-card-tag tag-${item.tag}">${tt}</span>`; }
function createCompetitionCard(item) { const tt = i18n[currentLang]['tag_' + item.tag] || item.tag; return `<div class="competitions-card-date">${escapeHtml(item.date)}</div><h3>${contentTitle(item)}</h3><p>${contentExcerpt(item)}</p><span class="competitions-card-tag tag-${item.tag}">${tt}</span>`; }
/* 首页快报列表项：日期徽章 + 标题/摘要 + 标签，比卡片更紧凑、信息密度更高 */
function createHomeHlItem(item) { const tt = i18n[currentLang]['tag_' + item.tag] || item.tag; const parts = (item.date || '').split('-'); const badge = parts.length === 3 ? `<div class="home-hl-date"><span class="home-hl-date-md">${escapeHtml(parts[1])}-${escapeHtml(parts[2])}</span><span class="home-hl-date-y">${escapeHtml(parts[0])}</span></div>` : `<div class="home-hl-date"><span class="home-hl-date-md">${escapeHtml(item.date || '')}</span></div>`; return `${badge}<div class="home-hl-body"><h4>${contentTitle(item)}</h4><p>${contentExcerpt(item)}</p></div><span class="home-hl-tag tag-${item.tag}">${tt}</span>`; }
function createQaCard(item) { const tt = i18n[currentLang]['tag_' + item.tag] || item.tag; return `<div class="qa-card-date">${escapeHtml(item.date)}</div><h3>${contentTitle(item)}</h3><p>${contentExcerpt(item)}</p><span class="qa-card-tag tag-${item.tag}">${tt}</span>`; }
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
async function loadMembersData() { showContentLoading('coreMembersGrid', i18n[currentLang].loading_members); if (!playersData) await loadPlayers(); if (playersData && Array.isArray(playersData.players)) { membersData = playersData.players.filter(p => p.role).map(p => ({ name: p.name, uid: p.uid, role: p.role, role_en: p.role_en, description: p.description, description_en: p.description_en, qq: p.qq })); } else { membersData = []; } if (typeof renderCoreMembers === 'function') { renderCoreMembers(); if (typeof renderAllMembersPage === 'function') renderAllMembersPage(); } }
async function loadNewsData() { const prgs = [showContentLoading('newsPreviewGrid', i18n[currentLang].loading_news), showContentLoading('newsFullGrid', i18n[currentLang].loading_news), showContentLoading('homeNewsList', i18n[currentLang].loading_news)]; try { newsData = await fetchJsonWithProgress('data/news/index.json', pct => { prgs.forEach(p => { if (p) { p.setProgress(pct); p.setMeta('data/news/index.json' + (pct == null ? '' : ' · ' + Math.round(pct) + '%')); } }); }); } catch(e) { console.error('news/index.json 加载失败', e); newsData = []; showContentLoadFail('newsPreviewGrid', loadNewsData); showContentLoadFail('newsFullGrid', loadNewsData); showContentLoadFail('homeNewsList', loadNewsData); markContentLoaded('news'); return; } if (typeof renderAllNews === 'function') renderAllNews(); markContentLoaded('news'); }
async function loadCompetitionsData() { const prgs = [showContentLoading('competitionsPreviewGrid', i18n[currentLang].loading_competitions), showContentLoading('competitionsFullGrid', i18n[currentLang].loading_competitions), showContentLoading('homeCompList', i18n[currentLang].loading_competitions)]; try { competitionsData = await fetchJsonWithProgress('data/competitions/index.json', pct => { prgs.forEach(p => { if (p) { p.setProgress(pct); p.setMeta('data/competitions/index.json' + (pct == null ? '' : ' · ' + Math.round(pct) + '%')); } }); }); } catch(e) { console.error('competitions/index.json 加载失败', e); competitionsData = []; showContentLoadFail('competitionsPreviewGrid', loadCompetitionsData); showContentLoadFail('competitionsFullGrid', loadCompetitionsData); showContentLoadFail('homeCompList', loadCompetitionsData); markContentLoaded('competition'); return; } if (typeof renderAllCompetitions === 'function') renderAllCompetitions(); markContentLoaded('competition'); }
async function loadDrawsData() { try { const resp = await fetch('data/draws.json'); if (!resp.ok) throw new Error('HTTP ' + resp.status); drawsData = await resp.json(); } catch(e) { drawsData = []; } }
let _drawsLoadPromise = null;
function ensureDrawsData() {
    if (drawsData && drawsData.length) return Promise.resolve();
    if (!_drawsLoadPromise) _drawsLoadPromise = loadDrawsData().then(() => { _drawsLoadPromise = null; }, () => { _drawsLoadPromise = null; });
    return _drawsLoadPromise;
}
function getDrawsForCompetition(competitionId) { if (!drawsData || !drawsData.length) return null; return drawsData.find(d => d.competitionId === competitionId && d.visible !== false) || null; }
async function loadQaData() { try { const resp = await fetch('data/qa/index.json'); if (!resp.ok) throw new Error('HTTP ' + resp.status); qaData = await resp.json(); } catch(e) { console.error('qa/index.json 加载失败', e); qaData = []; showContentLoadFail('qaFullGrid', loadQaData); showContentLoadFail('qaList', loadQaData); return; } if (typeof renderAllQa === 'function') renderAllQa(); }
async function loadChangelogData() { try { const resp = await fetch('data/changelog.json'); if (!resp.ok) throw new Error('HTTP ' + resp.status); changelogData = await resp.json(); } catch(e) { console.error('changelog.json 加载失败', e); changelogData = []; showContentLoadFail('changelogTimeline', loadChangelogData); showContentLoadFail('changelogList', loadChangelogData); return; } if (typeof renderAllChangelog === 'function') renderAllChangelog(); }
async function loadPlayerTagsData() { if (!playersData) await loadPlayers(); if (playersData && Array.isArray(playersData.players)) { const map = {}; for (const p of playersData.players) map[p.name] = { tags: p.tags || [], honors: p.honors || [] }; playerTagsData = { players: map }; return; } playerTagsData = null; }

// ===== 统一球员档案加载（data/players.json 为唯一数据源；旧版 data/_legacy/ 已退役）=====
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
// 英文界面下返回球员拼音人名（players.json 的 pinyin 字段）；无档案或无拼音时原样返回。
// 仅用于展示层：数据键、URL 参数、data-* 属性一律保持原始中文姓名
function playerDisplayName(name) {
    if (name == null || currentLang !== 'en') return name;
    const s = String(name);
    if (s.indexOf('/') >= 0) {
        const parts = splitPairNames(s);
        if (parts) return parts.map(n => { const p = getPlayerByName(n); return (p && p.pinyin) ? p.pinyin : n; }).join(' / ');
    }
    const p = getPlayerByName(s);
    return (p && p.pinyin) ? p.pinyin : s;
}
// 姓名 → 个人页链接（无档案时纯文本）
function linkPlayerName(name) {
    const p = getPlayerByName(name);
    if (p && p.uid != null) return `<a href="player.html?uid=${escapeHtml(String(p.uid))}" class="player-name-link">${escapeHtml(playerDisplayName(name))}</a>`;
    return escapeHtml(playerDisplayName(name));
}
// 一侧参赛方（单人或 "A/B" 双打组合）→ 可点名链接：组合逐成员链接（成员无档案回退纯文本）
function linkPlayerSide(name) {
    const parts = (typeof name === 'string' && name.indexOf('/') >= 0) ? splitPairNames(name) : null;
    if (parts) return parts.map(n => linkPlayerName(n)).join('<span class="pair-name-sep">/</span>');
    return linkPlayerName(name);
}
// ===== 比分/局分的球员视角展示 =====
// 存储口径恒为胜者视角（AGENTS.md「比分/局分」字段说明）。球员视角表格中结果为负的行，
// 展示时对调两数字（"11-9"→"9-11"）；逐局对调后局序不变（局序是时间顺序）。
// 解析失败原样返回（fail-safe），调用方必须在翻转之后再 escapeHtml。
function flipScoreStr(s) {
    const m = String(s).match(/^(\d{1,2})\s*[-:：]\s*(\d{1,2})$/);
    return m ? `${m[2]}-${m[1]}` : s;
}
// ===== 拼音搜索支持（pinyin-pro + 模糊匹配）=====
const pinyinCache = {};

function getPlayerPinyin(text) {
    if (!text) return { full: '', fullSpaced: '', initial: '' };
    const cacheKey = 'zh:' + text;
    if (pinyinCache[cacheKey]) return pinyinCache[cacheKey];
    let full = '', fullSpaced = '', initial = '';
    if (typeof window.pinyinPro !== 'undefined' && window.pinyinPro.pinyin) {
        try {
            const arr = window.pinyinPro.pinyin(text, { toneType: 'none', type: 'array', nonZh: 'consecutive' });
            const segs = arr.map(s => String(s).trim()).filter(Boolean);
            full = segs.join('').toLowerCase();
            fullSpaced = segs.join(' ').toLowerCase();
            initial = segs.map(s => String(s.charAt(0))).join('').toLowerCase();
        } catch (e) { /* ignore */ }
    }
    const result = { full, fullSpaced, initial };
    pinyinCache[cacheKey] = result;
    return result;
}

function playerSearchKeys(name, p) {
    const keys = new Set();
    if (name) keys.add(String(name).trim().toLowerCase());
    if (p) {
        if (p.uid != null) keys.add(String(p.uid));
        (p.aliases || []).forEach(a => { if (a) keys.add(String(a).trim().toLowerCase()); });
        (p.tags || []).forEach(t => { if (t) keys.add(String(t).trim().toLowerCase()); });
    }
    const namesToConvert = [name].concat(p ? (p.aliases || []) : []);
    for (const n of namesToConvert) {
        if (!n) continue;
        const py = getPlayerPinyin(n);
        if (py.full) keys.add('py:' + py.full);
        if (py.fullSpaced) keys.add('py:' + py.fullSpaced);
        if (py.initial) keys.add('pyi:' + py.initial);
    }
    return Array.from(keys).filter(Boolean);
}

function isSubsequenceMatch(a, target) {
    let qi = 0;
    for (let ti = 0; ti < target.length && qi < a.length; ti++) {
        if (a[qi] === target[ti]) qi++;
    }
    return qi === a.length;
}

function playerSearchRawKey(k) {
    if (k.startsWith('py:')) return k.slice(3);
    if (k.startsWith('pyi:')) return k.slice(4);
    return k;
}

/**
 * 计算球员搜索匹配分数（0 = 不匹配）。
 * 支持：姓名/别名/编号/标签 的完全匹配、前缀、包含；拼音全拼/首字母；模糊子序列。
 */
function playerSearchScore(name, p, q) {
    if (!q) return -1;
    const keys = playerSearchKeys(name, p);
    const ql = q.toLowerCase();
    let best = 0;
    for (const k of keys) {
        const rawKey = playerSearchRawKey(k);
        if (!rawKey) continue;
        if (rawKey === ql) best = Math.max(best, 100);
        else if (rawKey.startsWith(ql)) best = Math.max(best, 80);
        else if (rawKey.includes(ql)) best = Math.max(best, 60);
        else if (rawKey.endsWith(ql)) best = Math.max(best, 45);
        else if (ql.length >= 2 && isSubsequenceMatch(ql, rawKey)) best = Math.max(best, 25);
    }
    return best;
}

// 球员视角总比分 / 局分数组：isWinner 为 false 时逐项翻转
function playerViewScore(score, isWinner) { return (score == null || isWinner) ? score : flipScoreStr(score); }
function playerViewGames(games, isWinner) { return (!isWinner && Array.isArray(games)) ? games.map(flipScoreStr) : games; }
// ===== 比赛详情页（match.html / wtt_match.html）URL 构造 =====
// score-log 无 ID 字段且同日重复记录合法：用 (日期,类型,胜者,负者) + 当日次序 n 定位一条记录
function buildMatchDetailUrl(date, type, winner, loser, n, cat) {
    let url = (cat ? 'wtt_match.html' : 'match.html') +
        '?date=' + encodeURIComponent(date) +
        '&type=' + encodeURIComponent(type) +
        '&w=' + encodeURIComponent(winner) +
        '&l=' + encodeURIComponent(loser);
    if (cat) url += '&cat=' + encodeURIComponent(cat);
    if (n && n > 1) url += '&n=' + n;
    return url;
}
// 同日同 (日期,类型,胜者,负者) 重复记录合法：返回 记录对象 → 当日第几次出现 的 Map。
// 排序口径与 match-detail.js mdCompute() 完全一致（日期升序稳定排序，同日保持文件序），
// 各列表页生成详情链接时必须带上该 n，否则同日重复对阵的 URL 会撞车、全都打开第 1 场。
// Map 键为记录对象本身：请传入调用点本地正在遍历的那个数组（或其展开排序副本）。
function computeMatchOccurrenceMap(log) {
    const map = new Map();
    if (!Array.isArray(log)) return map;
    // 🔥 复用 score-engine 的排序记忆化（同一数据源一次页面只排一次）；
    // 返回数组共享只读，Map 仍以记录对象为键（与逐字排序副本同序同对象）
    const sorted = (typeof getSortedScoreLog === 'function')
        ? getSortedScoreLog(log)
        : [...log].sort((a, b) => String(a['日期'] || '').localeCompare(String(b['日期'] || '')));
    const count = Object.create(null);
    for (const r of sorted) {
        if (!r || r['日期'] == null || r['胜者'] == null || r['负者'] == null) continue;
        const key = r['日期'] + '|' + r['类型'] + '|' + r['胜者'] + '|' + r['负者'];
        count[key] = (count[key] || 0) + 1;
        map.set(r, count[key]);
    }
    return map;
}
// 名称规范化：按 players.json（含别名）把赛果中的名字归一到规范名
function normalizePlayerName(raw) { if (raw == null) return raw; const p = nameIndex[raw]; return p && p.name ? p.name : raw; }

// ===== 双打组合名（胜者/负者 = "A/B"，与 WTT 站 wd/md 同口径）=====
// club 无性别数据，规范顺序 = 成员 pinyin 升序（无档案回退字符串序），
// 保证 "A/B" 与 "B/A" 收敛为同一 key；下游 URL / uid / H2H 全用规范形式。
const DOUBLES_TYPE = '双打';
function isDoublesRecord(r) { return !!r && !!r['胜者'] && !!r['负者'] && r['类型'] === DOUBLES_TYPE; }
// 组合拆分：恰好两个非空成员返回 [a, b]，否则 null（单名 / 非法形态）
function splitPairNames(name) {
    if (typeof name !== 'string' || name.indexOf('/') < 0) return null;
    const parts = name.split('/').map(s => s.trim());
    return (parts.length === 2 && parts[0] && parts[1]) ? parts : null;
}
function _pairMemberSortKey(n) { const p = getPlayerByName(n); return (p && p.pinyin) ? String(p.pinyin) : n; }
function normalizeDoublesPairName(raw) {
    const parts = splitPairNames(String(raw == null ? '' : raw));
    if (!parts) return raw;
    const halves = parts.map(normalizePlayerName);
    halves.sort((a, b) => { const ka = _pairMemberSortKey(a), kb = _pairMemberSortKey(b); return ka < kb ? -1 : ka > kb ? 1 : 0; });
    return halves.join('/');
}
// score-log 字段级归一：含 "/" 按组合处理（逐半归一 + 规范顺序），非法形态告警并保持原样
function _normalizeLogName(raw) {
    if (typeof raw !== 'string' || raw.indexOf('/') < 0) return normalizePlayerName(raw);
    if (!splitPairNames(raw)) { console.warn('[score-log] 组合名形态非法（应为 "A/B" 两人）:', raw); return raw; }
    return normalizeDoublesPairName(raw);
}
const _ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
function normalizeScoreLog(log) {
    if (!Array.isArray(log)) return log;
    const today = new Date(); today.setHours(0, 0, 0, 0);
    for (const r of log) {
        if (r['胜者']) r['胜者'] = _normalizeLogName(r['胜者']);
        if (r['负者']) r['负者'] = _normalizeLogName(r['负者']);
        if (r['对象']) r['对象'] = normalizePlayerName(r['对象']);
        const d = r['日期'];
        if (d && !_ISO_DATE_RE.test(d)) console.warn('[score-log] 日期格式非 YYYY-MM-DD，衰减/赛季归档可能错位:', d, r);
        else if (d && r['胜者'] && new Date(d + 'T00:00:00') > today) console.warn('[score-log] 记录日期在未来，当前按零权重处理:', d, r['胜者'], '→', r['负者']);
    }
    return log;
}

// ===== 单打/双打双口径的全局数据源切换（仿 wtt_common.js 的 wttWithDataContext）=====
// 引擎的赛季起始分缓存(_seasonStartCache)与排序缓存(_sortedLogCache)都按 scoreLogData
// 数组引用失效：换入新数组引用即天然隔离，两套口径互不串缓存。仅包同步计算段。
function withScoreContext(log, initialScores, fn) {
    const prevLog = scoreLogData, prevInit = initialScoresData;
    scoreLogData = log;
    if (initialScores !== undefined) initialScoresData = initialScores;
    if (fn && typeof fn.then === 'function') {
        console.warn('[withScoreContext] fn 返回 Promise，上下文无法安全恢复——异步段请改用 withScoreContextAsync');
        return fn;
    }
    try { return fn(); } finally { scoreLogData = prevLog; initialScoresData = prevInit; }
}
async function withScoreContextAsync(log, initialScores, fn) {
    const prevLog = scoreLogData, prevInit = initialScoresData;
    scoreLogData = log;
    if (initialScores !== undefined) initialScoresData = initialScores;
    try { return await fn(); } finally { scoreLogData = prevLog; initialScoresData = prevInit; }
}

/* 单打口径积分时间线（含实时节点）：排除双打记录后计算。
   无双打数据时保持原引用（回归零漂移）；有双打数据时在单打上下文中换血
   （引擎 getSeasonStartScores 读全局）。ranking.js / main.js(loadRankingDataForViz)
   / recompute_rankings.js 共用，防止单打口径漂移。 */
function computeSinglesClubTimeline() {
    const doublesLog = scoreLogData.filter(isDoublesRecord);
    const log = doublesLog.length ? scoreLogData.filter(r => !isDoublesRecord(r)) : scoreLogData;
    const run = () => {
        const t = calculateAllRankingsWithSeasons(log, initialScoresData.initialScores, seasonsData);
        const rt = calculateRealtimeRanking();
        if (rt) t.push(rt);
        return t;
    };
    return doublesLog.length ? withScoreContext(log, undefined, run) : run();
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

function renderAboutSections() { if (!aboutData) return; const pc = document.getElementById('philosophyContent'); if (pc && aboutData.philosophy) pc.innerHTML = `<div class="markdown-body">${renderMarkdown(contentField(aboutData.philosophy, 'content'))}</div>`; const ac = document.getElementById('activitiesContent'); if (ac && aboutData.activities) ac.innerHTML = `<div class="markdown-body">${renderMarkdown(contentField(aboutData.activities, 'content'))}</div>`; updateHeroLastUpdated(); }
function getMemberAvatarHTML(m) { const nm = playerDisplayName(m.name); if (m.qq && m.qq.trim()) { const qqUrl = `https://q1.qlogo.cn/g?b=qq&nk=${m.qq.trim()}&s=640`; return `<div class="member-avatar">${escapeHtml(nm.charAt(0))}<img class="member-avatar-img" src="${escapeHtml(qqUrl)}" alt="${escapeHtml(nm)}" loading="lazy" onerror="this.style.display='none'"></div>`; } return `<div class="member-avatar text-only">${escapeHtml(nm.charAt(0))}</div>`; }
function renderCoreMembers() { document.querySelectorAll('#coreMembersGrid').forEach(g => { if (!g) return; g.innerHTML = ''; membersData.forEach(m => { const el = document.createElement('div'); el.className = 'member-card glass-card'; el.innerHTML = `${getMemberAvatarHTML(m)}<h3>${escapeHtml(playerDisplayName(m.name))}</h3><span class="member-role">${escapeHtml(playerRole(m))}</span><p class="member-desc">${formatExcerpt(playerDescription(m))}</p>`; if (m.uid != null) { el.title = i18n[currentLang].rank_view_player_page; makeCardClickable(el, 'player.html?uid=' + m.uid); } g.appendChild(el); }); }); }
function renderAllMembersPage() { const g = document.getElementById('allMembersGrid'); if (!g) return; g.innerHTML = ''; membersData.forEach(m => { const el = document.createElement('div'); el.className = 'member-card glass-card'; el.innerHTML = `${getMemberAvatarHTML(m)}<h3>${escapeHtml(playerDisplayName(m.name))}</h3><span class="member-role">${escapeHtml(playerRole(m))}</span><p class="member-desc">${formatExcerpt(playerDescription(m))}</p>`; if (m.uid != null) { el.title = i18n[currentLang].rank_view_player_page; makeCardClickable(el, 'player.html?uid=' + m.uid); } g.appendChild(el); }); }
function renderAllNews() { const pg = document.getElementById('newsPreviewGrid'); if (pg) { pg.innerHTML = ''; newsData.slice(0,3).forEach(item => { const c = document.createElement('div'); c.className = 'news-card'; c.innerHTML = createNewsCard(item); makeCardClickable(c, 'detail.html?type=news&id=' + item.id); pg.appendChild(c); }); } const hl = document.getElementById('homeNewsList'); if (hl) { hl.innerHTML = ''; const items = newsData.slice(0,4); if (!items.length) showContentEmptyState('homeNewsList'); items.forEach(item => { const c = document.createElement('div'); c.className = 'home-hl-item'; c.innerHTML = createHomeHlItem(item); makeCardClickable(c, 'detail.html?type=news&id=' + item.id); hl.appendChild(c); }); } const fg = document.getElementById('newsFullGrid'); if (fg) { const fd = getFilteredNewsData(); fg.innerHTML = ''; if (!fd.length) showContentEmptyState('newsFullGrid'); getPaginatedData(fd, newsCurrentPage).forEach(item => { const c = document.createElement('div'); c.className = 'news-card'; c.innerHTML = createNewsCard(item); makeCardClickable(c, 'detail.html?type=news&id=' + item.id); fg.appendChild(c); }); renderPagination('newsFullGrid', fd, newsCurrentPage); renderTagFilter('newsTagFilter', newsData, newsFilterTag, setNewsFilter); } }
function renderAllCompetitions() { const pg = document.getElementById('competitionsPreviewGrid'); if (pg) { pg.innerHTML = ''; competitionsData.slice(0,3).forEach(item => { const c = document.createElement('div'); c.className = 'competitions-card'; c.innerHTML = createCompetitionCard(item); makeCardClickable(c, 'detail.html?type=competition&id=' + item.id); pg.appendChild(c); }); } const hl = document.getElementById('homeCompList'); if (hl) { hl.innerHTML = ''; const upcoming = competitionsData.filter(it => it.tag === 'upcoming'); const items = upcoming.concat(competitionsData.filter(it => it.tag !== 'upcoming')).slice(0,4); if (!items.length) showContentEmptyState('homeCompList'); items.forEach(item => { const c = document.createElement('div'); c.className = 'home-hl-item' + (item.tag === 'upcoming' ? ' is-upcoming' : ''); c.innerHTML = createHomeHlItem(item); makeCardClickable(c, 'detail.html?type=competition&id=' + item.id); hl.appendChild(c); }); } const fg = document.getElementById('competitionsFullGrid'); if (fg) { const fd = getFilteredCompetitionsData(); fg.innerHTML = ''; if (!fd.length) showContentEmptyState('competitionsFullGrid'); getPaginatedData(fd, competitionsCurrentPage).forEach(item => { const c = document.createElement('div'); c.className = 'competitions-card'; c.innerHTML = createCompetitionCard(item); makeCardClickable(c, 'detail.html?type=competition&id=' + item.id); fg.appendChild(c); }); renderPagination('competitionsFullGrid', fd, competitionsCurrentPage); renderTagFilter('competitionsTagFilter', competitionsData, competitionsFilterTag, setCompetitionsFilter); } }
function renderAllQa() { const fg = document.getElementById('qaFullGrid'); if (fg) { fg.innerHTML = ''; if (!qaData.length) showContentEmptyState('qaFullGrid'); getPaginatedData(qaData, qaCurrentPage).forEach(item => { const c = document.createElement('div'); c.className = 'qa-card'; c.innerHTML = createQaCard(item); makeCardClickable(c, 'detail.html?type=qa&id=' + item.id); fg.appendChild(c); }); renderPagination('qaFullGrid', qaData, qaCurrentPage); } }
function renderAllChangelog() { const tl = document.getElementById('changelogTimeline'); if (!tl) return; tl.innerHTML = ''; if (!changelogData || !changelogData.length) { tl.innerHTML = '<div class="changelog-empty"><i class="fa-solid fa-clock-rotate-left"></i><p data-i18n="changelog_empty">暂无更新日志</p></div>'; return; } changelogData.forEach((item, idx) => { const entry = document.createElement('div'); entry.className = 'changelog-entry'; const tagLabel = i18n[currentLang]['tag_' + item.tag] || item.tag; const tagSafe = 'tag-' + String(item.tag || '').replace(/[^a-zA-Z0-9_-]/g, ''); const locChanges = (currentLang === 'en' && item.changes_en && item.changes_en.length ? item.changes_en : item.changes) || [];
    const changesHtml = locChanges.length ? '<ul class="changelog-changes">' + locChanges.map(c => '<li>' + renderMarkdown(c) + '</li>').join('') + '</ul>' : ''; entry.innerHTML = `<div class="changelog-entry-marker"><div class="changelog-dot"></div>${idx < changelogData.length - 1 ? '<div class="changelog-line"></div>' : ''}</div><div class="changelog-entry-content glass-card"><div class="changelog-entry-header"><span class="changelog-version">${escapeHtml(item.version)}</span><span class="changelog-tag ${escapeHtml(tagSafe)}">${escapeHtml(tagLabel)}</span><span class="changelog-date">${escapeHtml(item.date)}</span></div><h3 class="changelog-entry-title">${escapeHtml(contentField(item, 'title'))}</h3>${changesHtml}</div>`; tl.appendChild(entry); }); }
// ========================================
// 详情页：条目文件夹 {type}/{id}/{id}.json（展示）+ {id}.history.json（版本清单）+ {id}.v{n}.json（快照）
// ========================================
function getContentListByType(type) { return type === 'news' ? newsData : (type === 'competition' ? competitionsData : qaData); }
function getContentDirByType(type) { return type === 'news' ? 'news' : (type === 'competition' ? 'competitions' : 'qa'); }
async function resolveItemContent(type, item) {
    if (!item) return '';
    // 英文模式优先 contentFile_en（*.en.md），再退 content_en，最后回退中文正文
    const inlineKey = currentLang === 'en' ? 'content_en' : 'content';
    const cf0 = currentLang === 'en' ? (item.contentFile_en || item.contentFile) : item.contentFile;
    if (cf0) {
        const cf = String(cf0).replace(/\\/g, '/').replace(/^\/+/, '');
        const url = cf.includes('/') ? cf : `data/${getContentDirByType(type)}/${encodeURIComponent(String(item.id))}/${encodeURIComponent(cf)}`;
        try {
            const resp = await fetch(url);
            if (resp.ok) return await resp.text();
        } catch(e) { /* 拉取失败时回退到内联字段 */ }
    }
    const localized = item[inlineKey];
    if (localized != null && String(localized).trim() !== '') return localized;
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
    const aEl = document.getElementById('detailActions');
    if (aEl) { aEl.style.display = 'none'; aEl.innerHTML = ''; }
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
    // 动态标题与描述：浏览器标签页/分享卡片/搜索结果如实反映当前条目（player.html 同款做法）
    const locTitle = contentField(item, 'title');
    const locExcerpt = contentField(item, 'excerpt');
    document.title = (locTitle || '') + ' | WFLS Table Tennis Club';
    const descMeta = document.querySelector('meta[name="description"]');
    if (descMeta && locExcerpt) descMeta.setAttribute('content', String(locExcerpt));
    document.getElementById('detailTypeTag').textContent = i18n[currentLang][type === 'news' ? 'news_hero_tag' : (type === 'competition' ? 'comp_hero_tag' : 'qa_hero_tag')];
    document.getElementById('detailTitle').textContent = locTitle;
    document.getElementById('detailDate').textContent = item.date;
    const bodyText = await resolveItemContent(type, item);
    const contentSection = document.getElementById('detailContent');
    const usedMediaRefs = contentSection ? renderDetailBody(contentSection, bodyText, item.media) : null;
    if (contentSection) contentSection.style.display = '';
    renderDetailMedia(item, usedMediaRefs);
    await renderDetailDrawsSection(type, item);
    renderDetailVersion(type, item);
    try { await ensureContentList(type); } catch (e) { /* 列表不可用时只省略上下篇，不影响正文 */ }
    renderDetailNav(type, item);
    renderDetailExportButton();
}

// 详情页底部导航：返回列表 + 上一篇/下一篇（按 index.json 日期倒序位置，上一篇=更新的一条；
// 到达边界时显示灰色禁用的"没有上一篇了/没有下一篇了"占位，而非隐藏）
function renderDetailNav(type, item) {
    const host = document.getElementById('detailNav');
    if (!host) return;
    host.innerHTML = '';
    host.className = 'detail-nav';
    const L = i18n[currentLang] || {};
    const listHref = type === 'news' ? 'news.html' : (type === 'competition' ? 'competitions.html' : 'qa.html');
    const back = document.createElement('a');
    back.className = 'btn btn-sm btn-secondary';
    back.href = listHref;
    back.innerHTML = '<i class="fa-solid fa-arrow-left"></i> ' + escapeHtml(L.detail_back || '');
    host.appendChild(back);
    const list = getContentListByType(type).filter(x => x && x.visible !== false);
    const idx = list.findIndex(x => x && String(x.id) === String(item.id));
    const mkNeighbor = (entry, label, noneText, arrowLeft) => {
        const wrapText = text => (arrowLeft ? '<i class="fa-solid fa-chevron-left"></i>' : '') + '<span>' + escapeHtml(text) + '</span>' + (arrowLeft ? '' : '<i class="fa-solid fa-chevron-right"></i>');
        if (!entry) {
            const s = document.createElement('span');
            s.className = 'detail-nav-item disabled';
            s.setAttribute('aria-disabled', 'true');
            s.innerHTML = wrapText(noneText);
            return s;
        }
        const a = document.createElement('a');
        a.className = 'detail-nav-item';
        a.href = 'detail.html?type=' + type + '&id=' + encodeURIComponent(String(entry.id));
        const entryTitle = contentField(entry, 'title');
        a.title = entryTitle;
        a.innerHTML = wrapText(label + entryTitle);
        return a;
    };
    const wrap = document.createElement('div');
    wrap.className = 'detail-nav-links';
    wrap.appendChild(mkNeighbor(list[idx - 1], (L.detail_prev || '') + '：', L.detail_no_prev || '', true));
    wrap.appendChild(mkNeighbor(list[idx + 1], (L.detail_next || '') + '：', L.detail_no_next || '', false));
    host.appendChild(wrap);
}

/* ---- 详情内容导出为图片（foreignObject 截取已渲染的 markdown/KaTeX 成品） ---- */
function renderDetailExportButton() {
    const host = document.getElementById('detailActions');
    if (!host) return;
    host.innerHTML = '';
    if (!detailState || !detailState.item) { host.style.display = 'none'; return; }
    host.style.display = '';
    const L = i18n[currentLang] || {};
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'detail-export-btn';
    btn.innerHTML = '<i class="fa-solid fa-image" aria-hidden="true"></i><span data-i18n="detail_export_btn">' + escapeHtml(L.detail_export_btn || '导出图片') + '</span>';
    btn.addEventListener('click', () => exportDetailAsImage(btn));
    host.appendChild(btn);
}

// 离屏导出节点：头部类型标签 + 标题/日期 + 正文（含 KaTeX/表格）+ 配图 + 页脚链接
// 不含赛程签表（交互式）与视频/文件附件
function buildDetailExportNode(type, item) {
    const contentEl = document.getElementById('detailContent');
    const mediaEl = document.getElementById('detailMedia');
    if (!contentEl || !contentEl.innerHTML.trim()) return null;
    const L = i18n[currentLang] || {};
    const wrap = document.createElement('div');
    wrap.setAttribute('aria-hidden', 'true');
    wrap.style.cssText = 'position:fixed;left:0;top:0;z-index:-1;width:820px;box-sizing:border-box;padding:36px 42px 28px;background:var(--bg-white);border:1px solid var(--border-color);border-radius:18px;color:var(--text-primary);font-family:"Poppins","Noto Sans SC","Microsoft YaHei",sans-serif;';

    const head = document.createElement('div');
    head.style.cssText = 'display:flex;justify-content:space-between;align-items:center;';
    const tagKey = type === 'news' ? 'news_hero_tag' : (type === 'competition' ? 'comp_hero_tag' : 'qa_hero_tag');
    const tagText = L[tagKey] || type;
    head.innerHTML = '<span style="display:inline-block;padding:4px 14px;border-radius:14px;background:var(--primary-pale);color:var(--primary-blue);font-size:12px;font-weight:700;">' + escapeHtml(tagText) + '</span>'
        + '<span style="font-size:13px;font-weight:600;color:var(--text-muted);">WFLS TT Club</span>';
    wrap.appendChild(head);

    const title = document.createElement('h1');
    title.style.cssText = 'margin:18px 0 6px;font-size:26px;line-height:1.35;color:var(--text-primary);';
    title.textContent = String(item.title || '');
    wrap.appendChild(title);

    const dateEl = document.createElement('div');
    dateEl.style.cssText = 'font-size:13px;color:var(--text-muted);margin-bottom:18px;';
    dateEl.textContent = String(item.date || '');
    wrap.appendChild(dateEl);

    const body = document.createElement('div');
    body.className = 'detail-body';
    // 中和 .detail-body 的卡片外观（离屏节点自带卡片底），只保留排版样式
    body.style.cssText = 'background:transparent;border:none;box-shadow:none;backdrop-filter:none;-webkit-backdrop-filter:none;padding:0;margin:0;max-width:none;';
    body.innerHTML = contentEl.innerHTML;
    // 导出为静态图片：交互式视频/文件附件无法呈现，内嵌块整块移除（与底部媒体区导出口径一致）；图片强制立即加载
    body.querySelectorAll('.media-embed[data-media-type="video"], .media-embed[data-media-type="file"]').forEach(el => el.remove());
    body.querySelectorAll('img').forEach(img => { img.loading = 'eager'; });
    body.querySelectorAll('.katex-display').forEach(el => { el.style.overflowX = 'visible'; el.style.overflowY = 'visible'; });
    wrap.appendChild(body);

    if (mediaEl) {
        mediaEl.querySelectorAll('.media-item img').forEach(img => {
            const box = document.createElement('div');
            box.style.cssText = 'margin-top:16px;';
            const c = document.createElement('img');
            c.src = img.currentSrc || img.src;
            c.alt = img.alt || '';
            c.loading = 'eager';
            c.style.cssText = 'display:block;width:100%;border-radius:10px;';
            box.appendChild(c);
            wrap.appendChild(box);
        });
    }

    const url = location.origin + location.pathname.replace(/[^/]*$/, '') + 'detail.html?type=' + type + '&id=' + encodeURIComponent(String(item.id == null ? '' : item.id));
    const d = new Date(); const pd = n => String(n).padStart(2, '0');
    const stamp = `${d.getFullYear()}-${pd(d.getMonth() + 1)}-${pd(d.getDate())} ${pd(d.getHours())}:${pd(d.getMinutes())}`;
    const foot = document.createElement('div');
    foot.style.cssText = 'display:flex;justify-content:space-between;align-items:center;gap:20px;margin-top:26px;padding-top:14px;border-top:1px solid var(--border-color);font-size:11px;color:var(--text-muted);';
    foot.innerHTML = '<span style="color:var(--primary-blue);font-weight:600;word-break:break-all;">' + escapeHtml(url) + '</span>'
        + '<span style="white-space:nowrap;">' + escapeHtml(L.export_gen || '') + ' ' + stamp + '</span>';
    wrap.appendChild(foot);
    return wrap;
}

function _waitExportImages(root) {
    const imgs = Array.from(root.querySelectorAll('img'));
    return Promise.all(imgs.map(img => {
        if (img.complete) return Promise.resolve();
        return new Promise(resolve => {
            img.onload = () => resolve();
            img.onerror = () => resolve();
            setTimeout(resolve, 8000);
        });
    }));
}

async function exportDetailAsImage(btn) {
    const L = i18n[currentLang] || {};
    if (!detailState || !detailState.item) return;
    const node = buildDetailExportNode(detailState.type, detailState.item);
    if (!node) return;
    const origHtml = btn ? btn.innerHTML : '';
    if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i><span>' + escapeHtml(L.detail_export_btn || '') + '</span>'; }
    try {
        document.body.appendChild(node);
        await _waitExportImages(node);
        await exportDomNodeAsImage(node, { filenameBase: 'wfls-detail-' + detailState.type + '-' + String(detailState.item.id == null ? 'export' : detailState.item.id) });
    } catch (err) {
        console.error('详情导出失败', err);
        alert(L.img_export_fail || '图片导出失败，请重试');
    } finally {
        if (node.parentNode) node.parentNode.removeChild(node);
        if (btn) { btn.disabled = false; btn.innerHTML = origHtml; }
    }
}

/* ---- 文中媒体嵌入：content 里用 {{media:N}} / {{media:标识}} 把 media 数组中的附件插到正文该位置 ----
   约定：
   - media 数组仍是附件的唯一来源（sync_content.py 校验文件存在性、占位符引用合法性），占位符只决定"放哪里"；
   - {{media:N}} 按第 N 项（1 起）引用；{{media:标识}} 按附件的 mid 字段引用（mid 匹配优先于序号）；
   - 未被任何占位符引用的附件仍渲染在详情页底部媒体区 —— 旧条目不写占位符即保持原样，零迁移；
   - 占位符先替换为私有区字符（\uE007，避开正文可输入字符与 KaTeX 的 \uE000 占位），markdown 渲染后再
     在 DOM 层换回媒体元素：块级插入用 Range 拆段，保证 innerHTML 往返时 DOM 合法。 */
const MEDIA_REF_RE = /\{\{\s*media\s*:\s*([^{}]+?)\s*\}\}/g;
const MEDIA_PH = '\uE007';
const MEDIA_PH_RE = new RegExp(MEDIA_PH + 'M(\\d+)' + MEDIA_PH);
const MEDIA_PH_RE_G = new RegExp(MEDIA_PH + 'M(\\d+)' + MEDIA_PH, 'g');
const MEDIA_INLINE_OK = /^(STRONG|EM|B|I|CODE|A|SPAN|BR|DEL|S|U|MARK|SUB|SUP|SMALL|CITE|Q)$/i;

function applyMediaPlaceholders(rawText) {
    const refs = [];
    const text = String(rawText || '');
    if (text.indexOf('{{') === -1) return { text, refs };
    return { text: text.replace(MEDIA_REF_RE, (m, ref) => { refs.push(String(ref).trim()); return MEDIA_PH + 'M' + (refs.length - 1) + MEDIA_PH; }), refs };
}

function stripMediaMarkers(text) { return text ? String(text).replace(MEDIA_REF_RE, ' ') : ''; }

function resolveMediaRef(ref, mediaList) {
    const list = Array.isArray(mediaList) ? mediaList : [];
    if (ref == null || ref === '') return null;
    // mid 匹配优先于序号（与 sync_content.py 的校验口径一致）
    for (let i = 0; i < list.length; i++) {
        const m = list[i];
        if (m && typeof m === 'object' && m.mid != null && String(m.mid).trim() === ref) return { item: m, index: i };
    }
    if (/^[0-9]+$/.test(ref)) {
        const n = parseInt(ref, 10);
        if (n >= 1 && n <= list.length) return { item: list[n - 1], index: n - 1 };
    }
    return null;
}

// 单个附件 → 媒体卡片元素；embed=true 时用于正文内嵌（附加 media-embed 类）。无法识别的类型返回 null。
function buildMediaItem(m, embed) {
    if (!m || !m.type || !m.src) return null;
    const mi = document.createElement('div');
    mi.className = 'media-item' + (embed ? ' media-embed' : '');
    mi.dataset.mediaType = String(m.type);
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
        a.innerHTML = '<i class="fa-solid fa-download"></i> ' + escapeHtml(String((currentLang === 'en' && m.name_en) ? m.name_en : (m.name || i18n[currentLang].media_download_file)));
        mi.appendChild(a);
    } else {
        return null;
    }
    const capRaw = (currentLang === 'en' && m.caption_en) ? m.caption_en : m.caption;
    const caption = capRaw == null ? '' : String(capRaw).trim();
    if (caption) {
        const cap = document.createElement('div');
        cap.className = 'media-caption';
        cap.textContent = caption;
        mi.appendChild(cap);
    }
    return mi;
}

// 无效引用占位提示（前台可见的虚线胶囊，便于维护者发现；sync --check 会提前告警）
function buildMediaRefError(ref, block) {
    const el = document.createElement(block ? 'div' : 'span');
    el.className = 'media-ref-error' + (block ? ' block' : '');
    el.title = 'media 引用无效：请核对 media 数组的序号（1 起）或 mid 标识';
    const icon = document.createElement('i');
    icon.className = 'fa-solid fa-triangle-exclamation';
    el.appendChild(icon);
    el.appendChild(document.createTextNode('{{media:' + ref + '}}'));
    return el;
}

// markdown 渲染 + 占位符回填：返回被内嵌引用的 media 下标集合（底部媒体区据此跳过）
function renderDetailBody(el, rawText, mediaList) {
    const { text, refs } = applyMediaPlaceholders(rawText);
    el.innerHTML = renderMarkdown(text);
    return embedDetailMedia(el, refs, mediaList);
}

// 在正文 DOM 中把占位符替换为媒体元素；返回已使用的 media 数组下标集合
function embedDetailMedia(rootEl, refs, mediaList) {
    const used = new Set();
    if (!rootEl || !refs || !refs.length) return used;
    // 收集所有占位符出现位置（TreeWalker 天然按文档序）
    const occurrences = [];
    const walker = document.createTreeWalker(rootEl, NodeFilter.SHOW_TEXT, null);
    let tn;
    while ((tn = walker.nextNode())) {
        const re = new RegExp(MEDIA_PH_RE.source, 'g');
        let m;
        while ((m = re.exec(tn.nodeValue))) {
            occurrences.push({ idx: parseInt(m[1], 10), node: tn, start: m.index, end: m.index + m[0].length });
        }
    }
    if (!occurrences.length) return used;

    const inCode = node => { let el = node.parentElement; while (el && el !== rootEl) { if (el.tagName === 'PRE' || el.tagName === 'CODE') return true; el = el.parentElement; } return false; };
    const hostOf = node => {
        let el = node.parentElement;
        while (el && el !== rootEl) {
            if (/^(P|LI|TD|TH|H[1-6])$/i.test(el.tagName)) return el;
            el = el.parentElement;
        }
        return null;
    };
    // 整块独占占位符（无其他可见文字、无块级子元素）→ 块级媒体整体替换
    const isMarkerOnlyHost = host => {
        if (!host || host === rootEl) return false;
        if ((host.textContent || '').replace(MEDIA_PH_RE_G, '').trim() !== '') return false;
        return Array.from(host.querySelectorAll('*')).every(el => MEDIA_INLINE_OK.test(el.tagName));
    };
    const blockSplitNeeded = host => host && /^(P|H[1-6])$/i.test(host.tagName); // p/h 系只允许 phrasing 内容，需拆段；li/td/th 可直接容纳块级媒体

    const replaceRange = (occ, build) => {
        const r = document.createRange();
        r.setStart(occ.node, occ.start);
        r.setEnd(occ.node, Math.min(occ.end, occ.node.nodeValue.length));
        r.deleteContents();
        r.insertNode(build());
    };
    // 块级媒体插进 p/h 前先把占位符所在的段落拆开：占位符前文字留在原段落，
    // 媒体块插到原段落之后，其余内容包进同标签新段落 —— 避免 p>div 非法嵌套
    // （innerHTML 往返时解析器会重排非法嵌套，导致导出图片与所见不一致）
    const cleanupEmptyInline = root => {
        root.querySelectorAll('*').forEach(el => {
            if (!MEDIA_INLINE_OK.test(el.tagName) || el.tagName === 'BR') return;
            if (!el.textContent.trim() && !el.querySelector('img,video')) el.remove();
        });
    };
    const insertBlockSplit = (occ, mediaEl) => {
        const host = hostOf(occ.node);
        if (!blockSplitNeeded(host)) { replaceRange(occ, () => mediaEl); return; }
        const ph = document.createRange();
        ph.setStart(occ.node, occ.start);
        ph.setEnd(occ.node, Math.min(occ.end, occ.node.nodeValue.length));
        ph.deleteContents(); // 占位符移除后其前后文字在同/相邻文本节点中自然衔接
        const tail = document.createRange();
        tail.setStart(occ.node, occ.start);
        tail.setEnd(host, host.childNodes.length);
        const moved = tail.extractContents(); // 跨行内元素（strong 等）时自动拆分克隆
        cleanupEmptyInline(host);
        host.after(mediaEl);
        if (moved.childNodes.length && (moved.textContent.trim() || moved.querySelector('img,video'))) {
            const rest = document.createElement(host.tagName);
            rest.appendChild(moved);
            cleanupEmptyInline(rest);
            if (rest.textContent.trim() || rest.querySelector('img,video')) mediaEl.after(rest);
        }
    };
    const handleOccurrence = (occ) => {
        const ref = refs[occ.idx] != null ? refs[occ.idx] : '';
        if (inCode(occ.node)) {
            // 代码上下文不渲染媒体，按字面还原占位符原文
            replaceRange(occ, () => document.createTextNode('{{media:' + ref + '}}'));
            return;
        }
        const resolved = resolveMediaRef(ref, mediaList);
        const el = resolved ? buildMediaItem(resolved.item, true) : null;
        if (!resolved || !el) { replaceRange(occ, () => buildMediaRefError(ref, false)); return; }
        used.add(resolved.index);
        if (String(resolved.item.type) === 'image') {
            // 行内图片：作为 phrasing 内容原位插入，无需拆段
            const img = document.createElement('img');
            img.src = resolved.item.src;
            img.alt = resolved.item.alt || '图片';
            img.loading = 'lazy';
            img.className = 'media-inline-img';
            img.onerror = () => {
                const err = document.createElement('a');
                err.className = 'media-inline-img-error';
                err.href = resolved.item.src;
                err.download = '';
                err.title = '图片加载失败，点击下载';
                err.innerHTML = '<i class="fa-solid fa-image"></i>';
                img.replaceWith(err);
            };
            replaceRange(occ, () => img);
        } else {
            insertBlockSplit(occ, el);
        }
    };

    // 第一遍：整块独占的宿主（可含多个占位符，如相邻两行各一个）按文档序整体替换
    const hostGroups = new Map();
    const rest = [];
    for (const occ of occurrences) {
        const host = hostOf(occ.node);
        if (host && isMarkerOnlyHost(host)) {
            if (!hostGroups.has(host)) hostGroups.set(host, []);
            hostGroups.get(host).push(occ);
        } else {
            rest.push(occ);
        }
    }
    for (const [host, occs] of hostGroups) {
        const frag = document.createDocumentFragment();
        occs.forEach(occ => {
            const ref = refs[occ.idx] != null ? refs[occ.idx] : '';
            const resolved = resolveMediaRef(ref, mediaList);
            const el = resolved ? buildMediaItem(resolved.item, true) : null;
            if (el) { frag.appendChild(el); used.add(resolved.index); }
            else frag.appendChild(buildMediaRefError(ref, true));
        });
        if (/^(P|H[1-6])$/i.test(host.tagName)) host.replaceWith(frag);
        else { host.innerHTML = ''; host.appendChild(frag); } // li/td/th 保留宿主（维持列表编号/表格结构）
    }
    // 第二遍：行内出现（可能同段混排文字）从后往前处理，保证已记录的节点/偏移不因前方拆段而失效
    for (let i = rest.length - 1; i >= 0; i--) handleOccurrence(rest[i]);
    return used;
}

function renderDetailMedia(item, skip) {
    const mc = document.getElementById('detailMedia');
    if (!mc) return;
    mc.innerHTML = '';
    const list = item.media && Array.isArray(item.media) ? item.media : [];
    list.forEach((m, i) => {
        if (skip && skip.has(i)) return; // 已在正文中内嵌的附件不再重复出现在底部媒体区
        const mi = buildMediaItem(m, false);
        if (mi) mc.appendChild(mi);
    });
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
                if (draws.version >= 2 && typeof initDrawsViewer === 'function') {
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
    const contentSection = document.getElementById('detailContent');
    const usedMediaRefs = contentSection ? renderDetailBody(contentSection, bodyText, snap.media) : null;
    if (contentSection) contentSection.style.display = '';
    renderDetailMedia(snap, usedMediaRefs);
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
function highlightNavByPath() { const cp = window.location.pathname.split('/').pop() || 'index.html'; const anl = document.querySelectorAll('.nav-link:not(.dropdown-toggle)'), dl = document.querySelectorAll('.dropdown-link'); anl.forEach(l => l.classList.remove('active')); dl.forEach(l => l.classList.remove('active')); const dt2 = document.getElementById('moreDropdown'); if (dt2) dt2.classList.remove('active'); anl.forEach(link => { const h = link.getAttribute('href'); if (!h) return; if (h === cp || (cp === '' && h === 'index.html') || (cp === 'index.html' && h === 'index.html') || (cp === 'contact.html' && h === 'contact.html')) link.classList.add('active'); }); if (cp === 'members.html' || cp === 'data_viz.html' || cp === 'personal_stats.html' || cp === 'player.html' || cp === 'qa.html' || cp === 'changelog.html' || cp === 'docs.html') { if (dt2) dt2.classList.add('active'); dl.forEach(link => { const h = link.getAttribute('href'); if (h === cp || (cp === 'player.html' && h === 'personal_stats.html')) link.classList.add('active'); }); } }

/* Chart.js 全局现代化默认样式（字体 / 图例 / 提示框 / 网格线） */
function applyChartDefaults() {
    Chart.defaults.devicePixelRatio = Math.min(window.devicePixelRatio || 1, 2);
    const cs = getComputedStyle(document.documentElement);
    const textMuted = (cs.getPropertyValue('--text-muted') || '').trim() || '#5b6b7d';
    const borderCol = (cs.getPropertyValue('--border-color') || '').trim() || '#e2e8f0';
    Chart.defaults.font.family = "'Poppins', 'Noto Sans SC', sans-serif";
    Chart.defaults.font.size = 11.5;
    Chart.defaults.color = textMuted;
    Chart.defaults.borderColor = borderCol;
    Chart.defaults.animation.duration = 700;
    Chart.defaults.animation.easing = 'easeOutQuart';
    /* 图例：小圆点样式 */
    Chart.defaults.plugins.legend.labels.usePointStyle = true;
    Chart.defaults.plugins.legend.labels.pointStyle = 'circle';
    Chart.defaults.plugins.legend.labels.boxWidth = 7;
    Chart.defaults.plugins.legend.labels.boxHeight = 7;
    Chart.defaults.plugins.legend.labels.padding = 16;
    /* 提示框：深色圆角卡片 */
    Object.assign(Chart.defaults.plugins.tooltip, {
        backgroundColor: 'rgba(15, 23, 42, 0.92)',
        titleColor: '#fff',
        bodyColor: 'rgba(255, 255, 255, 0.85)',
        footerColor: 'rgba(255, 255, 255, 0.6)',
        padding: 12,
        cornerRadius: 10,
        boxPadding: 6,
        usePointStyle: true,
        titleFont: { weight: '700', size: 12.5 },
        bodyFont: { size: 12 }
    });
    /* 坐标轴：浅网格 + 留白 */
    Chart.defaults.scale.grid.color = borderCol;
    Chart.defaults.scale.grid.drawTicks = false;
    Chart.defaults.scale.ticks.padding = 8;
    Chart.defaults.scale.border.display = false;
    /* 折线 / 柱状元素默认更精致 */
    Chart.defaults.elements.line.borderWidth = 2.5;
    Chart.defaults.elements.line.tension = 0.35;
    Chart.defaults.elements.point.radius = 3;
    Chart.defaults.elements.point.hoverRadius = 5.5;
    Chart.defaults.elements.point.borderWidth = 2;
    Chart.defaults.elements.bar.borderRadius = 6;
    Chart.defaults.elements.arc.borderWidth = 2;
}

function initCommon() {
    initSearch();
    // 全站预载球员档案：nameIndex 供姓名链接（getUidForPlayerName）与英文拼音显示（playerDisplayName）使用，
    // detail.html 等不主动加载 players.json 的页面也依赖它
    if (!playersData && typeof loadPlayers === 'function') loadPlayers();
    highlightNavByPath();
    initVizMobileNav();
    if (typeof Chart !== 'undefined') applyChartDefaults();
    /* 竞速滑块：同步轨道填充进度（webkit 用 --fill 渐变，Firefox 用 range-progress） */
    document.addEventListener('input', e => {
        const s = e.target;
        if (!s.classList || !s.classList.contains('viz-race-slider')) return;
        const max = parseFloat(s.max) || 0;
        s.style.setProperty('--fill', (max > 0 ? (parseFloat(s.value) / max * 100) : 0) + '%');
    });
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
    if (target) { target.before(nav); return; }
    // 首页全屏 hero：pill 导航放到 hero 之后，避免在 ≤1200px 时把 hero 顶下去导致首屏占不满
    const hero = document.querySelector('.hero');
    if (hero && hero.parentNode === document.body) { hero.after(nav); return; }
    document.body.insertBefore(nav, document.body.firstChild);
}
