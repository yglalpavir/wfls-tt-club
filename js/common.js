/* ========================================
   common.js - 语言包 + 全局变量 + UI + 通用函数
   ======================================== */

// 注入加载动画（供 ranking.js、main.js 等使用 wtt-spinner）
(function() {
    if (document.getElementById('wtt-spinner-style')) return;
    var style = document.createElement('style');
    style.id = 'wtt-spinner-style';
    style.textContent = '@keyframes wttSpin { to { transform: rotate(360deg); } }';
    document.head.appendChild(style);
})();

// 通用内容区加载提示（用于 news/competitions/home 等页面）
function showContentLoading(containerId, msg) {
    var el = document.getElementById(containerId);
    if (!el) return;
    // 只在容器为空或显示默认占位内容时显示加载动画
    if (el.children.length > 0 && !el.querySelector('.content-loading-placeholder')) {
        var existing = el.querySelector('.content-loading-spinner');
        if (existing) existing.remove();
        return;
    }
    el.innerHTML = '<div class="content-loading-spinner" style="display:flex;align-items:center;justify-content:center;padding:40px 20px;color:var(--text-secondary);min-height:120px;"><div style="text-align:center;"><div class="wtt-spinner" style="width:28px;height:28px;border:3px solid var(--border-color);border-top-color:var(--accent-blue);border-radius:50%;animation:wttSpin 0.8s linear infinite;margin:0 auto 10px;"></div><p style="font-size:0.85rem;margin:0;">' + (msg || '加载中...') + '</p></div></div>';
}

const i18n = {
    zh: {
        site_title: "武汉外国语学校乒乓球社团 | WFLS Table Tennis Club", nav_home: "Home", nav_news: "News", nav_competitions: "Competitions", nav_contact: "Contact", nav_more: "More...", nav_members: "社团骨干", nav_qa: "Q&A", lang_btn: "EN",
        hero_title: "武汉外国语学校<br>乒乓球社团", hero_slogan: "挥拍逐梦，旋转青春", hero_btn_about: "了解社团", hero_btn_join: "加入我们", scroll: "Scroll",
        side_home: "首页", side_history: "社团历史", side_philosophy: "社团理念", side_activities: "社团活动", side_members: "社团骨干", side_news: "最新动态", side_competitions: "赛事信息",
        history_tag: "Club History", history_title: "社团历史", history_desc: "武汉外国语学校乒乓球社团的发展历程",
        philosophy_tag: "Philosophy", philosophy_title: "社团理念", philosophy_desc: "我们的核心价值观与指导思想",
        activities_tag: "Activities", activities_title: "社团活动", activities_desc: "全年性活动、社团课活动及年度大赛",
        members_tag: "Core Members", members_title: "社团骨干", members_desc: "引领社团发展的核心力量",
        news_tag: "Latest News", news_title: "最新动态", news_desc: "关注社团最新活动与公告", news_all: "查看全部动态",
        comp_tag: "Competitions", comp_title: "赛事信息", comp_desc: "近期比赛安排与成绩", comp_all: "查看全部赛事",
        contact_page_title: "联系我们 | WFLS Table Tennis Club", contact_tag: "Contact", contact_title: "加入我们", contact_desc: "扫描二维码加入社团QQ群，获取最新训练安排与活动通知", contact_text: "扫码加入社团QQ群，与我们一起挥拍逐梦", contact_btn: "扫描二维码加入社团群", contact_qr_title: "社团QQ群二维码", contact_qr_desc: "扫码加入社团QQ群，与我们一起挥拍逐梦",
        footer_brand: "武汉外国语学校乒乓球社团", footer_motto: "挥拍逐梦，旋转青春", footer_nav: "快速导航", footer_school: "学校信息", footer_school_name: "武汉外国语学校", footer_location: "湖北省武汉市",
        modal_title: "社团QQ群二维码", modal_desc: "扫描下方二维码加入社团QQ群", modal_note: "二维码定期更新，如有问题请联系社团管理员",
        news_page_title: "近期动态 | WFLS Table Tennis Club", news_hero_tag: "News & Updates", news_hero_title: "近期动态", news_hero_desc: "社团活动 / 训练安排 / 重要公告", news_list_tag: "All News", news_list_title: "全部动态",
        comp_page_title: "赛事信息 | WFLS Table Tennis Club", comp_hero_tag: "Competitions", comp_hero_title: "赛事信息", comp_hero_desc: "比赛安排 / 成绩记录 / 赛事回顾", comp_list_tag: "All Competitions", comp_list_title: "全部赛事",
        members_page_title: "社团骨干 | WFLS Table Tennis Club",
        rank_page_title: "Ranking Beta | WFLS Table Tennis Club", rank_hero_desc: "社团积分排名系统 · 支持多时间节点对比 · 点击姓名查看积分明细", rank_tag: "Data Table", rank_title: "积分数据表", rank_sort_hint: "当前排序：", rank_sidebar_title: "时间节点",
        rank_col_rank: "#", rank_col_name: "姓名", rank_col_points: "当前积分", rank_col_points_change: "积分变化", rank_col_change: "排名变化", rank_col_matches: "总场次", rank_col_winrate: "胜率",
        score_detail_title: "积分明细", score_col_date: "日期", score_col_type: "类型", score_col_opponent: "对手", score_col_result: "结果", score_col_score_before: "赛前积分", score_col_change: "积分变动", score_col_score_after: "赛后积分", score_result_win: "胜", score_result_loss: "负",
        tag_match: "赛事", tag_training: "训练", tag_notice: "公告", tag_event: "活动", tag_daily: "日常", tag_upcoming: "即将开始", tag_result: "比赛结果", tag_live: "进行中",
        filter_all: "全部",
        detail_page_title: "详情 | WFLS Table Tennis Club", detail_back: "返回列表",
        search_placeholder: "搜索新闻、赛事、成员、排名、更新日志...", search_no_results: "未找到相关结果", search_type_news: "新闻", search_type_competition: "赛事", search_type_member: "成员", search_type_ranking: "排名", search_type_qa: "问答", search_type_changelog: "更新日志",
        qa_page_title: "常见问题 | WFLS Table Tennis Club", qa_hero_tag: "Q&A", qa_hero_title: "常见问题", qa_hero_desc: "加入社团 / 活动安排 / 积分系统 / 比赛报名", qa_list_tag: "All Q&A", qa_list_title: "全部问答",
        pagination_prev: "上一页", pagination_next: "下一页", pagination_info: "第 {current} 页，共 {total} 页",
        data_viz_page_title: "数据可视化 | WFLS Table Tennis Club", data_viz_tag: "Data Visualization", data_viz_title: "数据可视化", data_viz_desc: "积分趋势 · 排名变化 · 球员对比",
        data_viz_points_trend: "积分趋势", data_viz_rank_stream: "排名变化河流图", data_viz_player_compare: "球员对比", data_viz_select_players: "选择球员（最多8人）", data_viz_select_player_a: "球员 A", data_viz_select_player_b: "球员 B", data_viz_apply: "应用", data_viz_top_n: "显示前", data_viz_head_to_head: "历史交手记录",
        season_initial_label: "{season}初始积分", score_type_bonus: "比赛结果加分",
        personal_stats_page_title: "个人数据 | WFLS Table Tennis Club", personal_stats_tag: "Personal Stats", personal_stats_title: "个人数据", personal_stats_desc: "个人比赛数据统计",
        rank_realtime_header: "实时积分", rank_realtime_label: "实时积分",
        changelog_page_title: "更新日志 | WFLS Table Tennis Club", changelog_hero_tag: "Changelog", changelog_hero_title: "更新日志", changelog_hero_desc: "版本历史 · 功能更新 · 问题修复", changelog_list_tag: "Version History", changelog_list_title: "版本历史", changelog_empty: "暂无更新日志",
        tag_release: "正式发布", tag_feature: "新功能", tag_fix: "修复",
        draws_tab_content: "赛事详情", draws_tab_bracket: "对阵表"
    },
    en: {
        site_title: "WFLS Table Tennis Club | Wuhan Foreign Languages School", nav_home: "Home", nav_news: "News", nav_competitions: "Competitions", nav_contact: "Contact", nav_more: "More...", nav_members: "Core Members", nav_qa: "Q&A", lang_btn: "中文",
        hero_title: "Wuhan Foreign Languages School<br>Table Tennis Club", hero_slogan: "Swing for dreams, spin for youth", hero_btn_about: "About Us", hero_btn_join: "Join Us", scroll: "Scroll",
        side_home: "Home", side_history: "History", side_philosophy: "Philosophy", side_activities: "Activities", side_members: "Members", side_news: "News", side_competitions: "Competitions",
        history_tag: "Club History", history_title: "Club History", history_desc: "The development journey of WFLS Table Tennis Club",
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
        rank_page_title: "Ranking Beta | WFLS Table Tennis Club", rank_hero_desc: "Club ranking system 路 Auto-calculated 路 Season inheritance", rank_tag: "Data Table", rank_title: "Points Table", rank_sort_hint: "Current sorting: ", rank_sidebar_title: "Time Periods",
        rank_col_rank: "#", rank_col_name: "Name", rank_col_points: "Points", rank_col_points_change: "Score Δ", rank_col_change: "Rank Δ", rank_col_matches: "Matches", rank_col_winrate: "Win Rate",
        score_detail_title: "Score Details", score_col_date: "Date", score_col_type: "Type", score_col_opponent: "Opponent", score_col_result: "Result", score_col_score_before: "Before", score_col_change: "Change", score_col_score_after: "After", score_result_win: "Win", score_result_loss: "Loss",
        tag_match: "Match", tag_training: "Training", tag_notice: "Notice", tag_event: "Event", tag_daily: "Daily", tag_upcoming: "Upcoming", tag_result: "Result", tag_live: "Live",
        filter_all: "All",
        detail_page_title: "Details | WFLS Table Tennis Club", detail_back: "Back to List",
        search_placeholder: "Search news, competitions, members, rankings, changelog...", search_no_results: "No results found", search_type_news: "News", search_type_competition: "Competition", search_type_member: "Member", search_type_ranking: "Ranking", search_type_qa: "Q&A", search_type_changelog: "Changelog",
        qa_page_title: "Q&A | WFLS Table Tennis Club", qa_hero_tag: "Q&A", qa_hero_title: "Q&A", qa_hero_desc: "Join / Schedule / Ranking / Registration", qa_list_tag: "All Q&A", qa_list_title: "All Q&A",
        pagination_prev: "Previous", pagination_next: "Next", pagination_info: "Page {current} of {total}",
        data_viz_page_title: "Data Visualization | WFLS Table Tennis Club", data_viz_tag: "Data Visualization", data_viz_title: "Data Visualization", data_viz_desc: "Points Trend 路 Rank Flow 路 Player Compare",
        data_viz_points_trend: "Points Trend", data_viz_rank_stream: "Rank Flow", data_viz_player_compare: "Player Comparison", data_viz_select_players: "Select Players (max 15)", data_viz_select_player_a: "Player A", data_viz_select_player_b: "Player B", data_viz_apply: "Apply", data_viz_top_n: "Top", data_viz_head_to_head: "Head to Head",
        season_initial_label: "{season} Initial Scores", score_type_bonus: "Bonus Points",
        personal_stats_page_title: "Personal Stats | WFLS Table Tennis Club", personal_stats_tag: "Personal Stats", personal_stats_title: "Personal Stats", personal_stats_desc: "Personal Match Statistics",
        rank_realtime_header: "Real-time", rank_realtime_label: "Live Ranking",
        changelog_page_title: "Changelog | WFLS Table Tennis Club", changelog_hero_tag: "Changelog", changelog_hero_title: "Changelog", changelog_hero_desc: "Version History 路 Features 路 Bug Fixes", changelog_list_tag: "Version History", changelog_list_title: "Version History", changelog_empty: "No changelog entries yet",
        tag_release: "Release", tag_feature: "Feature", tag_fix: "Fix",
        draws_tab_content: "Details", draws_tab_bracket: "Bracket"
    }
};

let currentLang = 'zh';
let newsData = [], competitionsData = [], qaData = [], changelogData = [], aboutData = null, membersData = [], scoreLogData = [], drawsData = [];
let rankingTimeline = [], currentTimeIndex = 0, currentDisplayData = [];
let currentSortKey = '当前积分', currentSortDir = 'desc', dataLoaded = false;
let newsCurrentPage = 1, competitionsCurrentPage = 1, qaCurrentPage = 1;
let newsFilterTag = 'all', competitionsFilterTag = 'all';
const ITEMS_PER_PAGE = 10;
let initialScoresData = null, eventCoefficients = null, seasonsData = null, playerTagsData = null;
const SCORE_FLOOR = 1200, HALF_LIFE_DAYS = 180;
let DEFAULT_INITIAL_SCORE = 1300;  // 可配置的默认初始分（WTT settings.json 中的 baseScore 可覆盖）
let SCORE_TIME_DECAY_ENABLED = true;  // 赛季内时间衰减开关（WTT 关闭）
let LOSER_POINT_MULTIPLIER = 0.8;     // 负者扣分系数（WTT 设为 1.0，即负者扣分=胜者得分）

const hamburger = document.getElementById('hamburger'), navMenu = document.getElementById('navMenu'), navbar = document.getElementById('navbar');
const themeToggle = document.getElementById('themeToggle'), langToggle = document.getElementById('langToggle');
const searchToggle = document.getElementById('searchToggle'), searchOverlay = document.getElementById('searchOverlay'), searchInput = document.getElementById('searchInput'), searchClear = document.getElementById('searchClear'), searchClose = document.getElementById('searchClose'), searchResults = document.getElementById('searchResults');
const modalOverlay = document.getElementById('modalOverlay'), modalClose = document.getElementById('modalClose'), qrTrigger = document.getElementById('qrTrigger');
const scoreDetailModal = document.getElementById('scoreDetailModal'), scoreDetailClose = document.getElementById('scoreDetailClose'), scoreDetailTitle = document.getElementById('scoreDetailTitle'), scoreDetailBody = document.getElementById('scoreDetailBody');
const body = document.body;

function setLanguage(lang) {
    currentLang = lang; localStorage.setItem('wfls-lang', lang);
    document.querySelectorAll('[data-i18n]').forEach(el => { const key = el.getAttribute('data-i18n'); if (i18n[lang] && i18n[lang][key]) el.innerHTML = i18n[lang][key]; });
    if (langToggle) langToggle.querySelector('span').textContent = lang === 'zh' ? 'EN' : '中文';
    if (searchInput) searchInput.placeholder = i18n[lang].search_placeholder;
    if (typeof renderAllNews === 'function') renderAllNews();
    if (typeof renderAllCompetitions === 'function') renderAllCompetitions();
    if (typeof renderAllQa === 'function') renderAllQa();
    if (typeof renderAllChangelog === 'function') renderAllChangelog();
    if (aboutData && typeof renderAboutSections === 'function') { renderAboutSections(); updateHeroLastUpdated(); }
    if (membersData.length > 0 && typeof renderCoreMembers === 'function') { renderCoreMembers(); if (typeof renderAllMembersPage === 'function') renderAllMembersPage(); }
    if (typeof updateRankingHeaders === 'function') updateRankingHeaders();
    if (typeof updatePdfButtons === 'function') updatePdfButtons();
    if (dataLoaded && typeof updateDetailPage === 'function') updateDetailPage();
}
async function updateHeroLastUpdated() { const el = document.getElementById('heroLastUpdated'); if (!el) return; const cached = localStorage.getItem('wfls-last-updated'); if (cached) { try { const cd = JSON.parse(cached); if (cd.date && (Date.now() - cd.ts) < 3600000) { el.textContent = currentLang === 'zh' ? `上次更新：${cd.date}` : `Last updated: ${cd.date}`; return; } } catch(e) {} } try { const res = await fetch('https://api.github.com/repos/yglalpavir/wfls-tt-club/commits?per_page=1'); if (res.ok) { const commits = await res.json(); if (commits && commits.length > 0) { const d = new Date(commits[0].commit.committer.date); const ds = d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0'); localStorage.setItem('wfls-last-updated', JSON.stringify({ date: ds, ts: Date.now() })); el.textContent = currentLang === 'zh' ? `上次更新：${ds}` : `Last updated: ${ds}`; return; } } } catch(e) { console.warn('GitHub API failed, fallback to about.json'); } if (aboutData && aboutData.lastUpdated) { el.textContent = currentLang === 'zh' ? `上次更新：${aboutData.lastUpdated}` : `Last updated: ${aboutData.lastUpdated}`; } }
function updateRankingHeaders() { document.querySelectorAll('.ranking-table-full th[data-i18n]').forEach(th => { const key = th.getAttribute('data-i18n'); if (i18n[currentLang] && i18n[currentLang][key]) th.innerHTML = i18n[currentLang][key] + ' <span class="sort-arrow"></span>'; }); }
function updatePdfButtons() { const btn = document.getElementById('pdfViewBtn'); if (btn) btn.innerHTML = `<i class="fa-solid fa-eye"></i> ${i18n[currentLang].pdf_preview_btn}`; const down = document.querySelector('.pdf-actions .btn-primary'); if (down) down.innerHTML = `<i class="fa-solid fa-download"></i> ${i18n[currentLang].pdf_download_btn}`; }
if (langToggle) { const sl = localStorage.getItem('wfls-lang') || 'zh'; setLanguage(sl); langToggle.addEventListener('click', () => setLanguage(currentLang === 'zh' ? 'en' : 'zh')); }

function initSearch() {
    if (!searchToggle || !searchOverlay || !searchInput) return;
    searchToggle.addEventListener('click', () => { searchOverlay.classList.add('active'); body.style.overflow = 'hidden'; setTimeout(() => searchInput.focus(), 300); });
    function cs() { searchOverlay.classList.remove('active'); body.style.overflow = ''; searchInput.value = ''; searchClear.style.display = 'none'; showSearchPlaceholder(); }
    searchClose.addEventListener('click', cs); searchOverlay.addEventListener('click', e => { if (e.target === searchOverlay) cs(); });
    document.addEventListener('keydown', e => { if (e.key === 'Escape' && searchOverlay && searchOverlay.classList.contains('active')) cs(); });
    let dt; searchInput.addEventListener('input', () => { const q = searchInput.value.trim(); if (q.length > 0) searchClear.style.display = 'flex'; else { searchClear.style.display = 'none'; showSearchPlaceholder(); return; } clearTimeout(dt); dt = setTimeout(() => performSearch(q), 200); });
    searchClear.addEventListener('click', () => { searchInput.value = ''; searchClear.style.display = 'none'; showSearchPlaceholder(); searchInput.focus(); });
    // 管理员密钥检测：在搜索框按回车时检查
    searchInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            const q = searchInput.value.trim();
            if (q && aboutData && aboutData.adminKey && q === aboutData.adminKey) {
                searchOverlay.classList.remove('active');
                body.style.overflow = '';
                searchInput.value = '';
                searchClear.style.display = 'none';
                window.location.href = 'admin.html';
            }
        }
    });
}
function showSearchPlaceholder() { if (!searchResults) return; searchResults.innerHTML = `<div class="search-placeholder"><i class="fa-solid fa-magnifying-glass"></i><p>输入关键词开始搜索</p><p class="search-hint">支持搜索标题、内容、姓名等</p></div>`; }
function performSearch(query) { if (!searchResults) return; const results = []; if (newsData && newsData.length) newsData.forEach(item => { const s = calcScore(query, item.title, item.excerpt || '', item.content || ''); if (s > 0) results.push({ type: 'news', typeLabel: i18n[currentLang].search_type_news, title: item.title, excerpt: item.excerpt || item.content || '', date: item.date, link: `detail.html?type=news&id=${item.id}`, score: s }); }); if (competitionsData && competitionsData.length) competitionsData.forEach(item => { const s = calcScore(query, item.title, item.excerpt || '', item.content || ''); if (s > 0) results.push({ type: 'competition', typeLabel: i18n[currentLang].search_type_competition, title: item.title, excerpt: item.excerpt || item.content || '', date: item.date, link: `detail.html?type=competition&id=${item.id}`, score: s }); }); if (membersData && membersData.length) membersData.forEach(m => { const s = calcScore(query, m.name, m.role, m.description); if (s > 0) results.push({ type: 'member', typeLabel: i18n[currentLang].search_type_member, title: `${m.name} - ${m.role}`, excerpt: m.description || '', date: '', link: 'members.html', score: s }); }); if (currentDisplayData && currentDisplayData.length) currentDisplayData.forEach(p => { const s = calcScore(query, p['姓名'], String(p['当前积分'] || ''), ''); if (s > 0) results.push({ type: 'ranking', typeLabel: i18n[currentLang].search_type_ranking, title: `${p['姓名']} - ${(p['当前积分'] || 0).toFixed(1)}分`, excerpt: `排名：${p.rank || '-'} | 胜率：${p['胜率'] || '0%'}`, date: '', link: 'ranking.html', score: s }); }); if (qaData && qaData.length) qaData.forEach(item => { const s = calcScore(query, item.title, item.excerpt || '', item.content || ''); if (s > 0) results.push({ type: 'qa', typeLabel: i18n[currentLang].search_type_qa, title: item.title, excerpt: item.excerpt || item.content || '', date: item.date, link: `detail.html?type=qa&id=${item.id}`, score: s }); }); if (changelogData && changelogData.length) changelogData.forEach(item => { const changesText = item.changes ? item.changes.join(' ') : ''; const s = calcScore(query, item.title, item.version, changesText); if (s > 0) results.push({ type: 'changelog', typeLabel: i18n[currentLang].search_type_changelog, title: `${item.version} - ${item.title}`, excerpt: item.changes ? item.changes.slice(0, 3).join(' | ') : '', date: item.date, link: 'changelog.html', score: s }); }); results.sort((a, b) => b.score - a.score); if (!results.length) { searchResults.innerHTML = `<div class="search-no-results"><i class="fa-solid fa-face-frown"></i><p>${i18n[currentLang].search_no_results}</p></div>`; return; } searchResults.innerHTML = `<div class="search-result-list">${results.map(r => `<div class="search-result-item" onclick="window.location.href='${r.link}'"><span class="search-result-type ${r.type}">${r.typeLabel}</span><div class="search-result-title">${hlMatch(r.title, query)}</div><div class="search-result-excerpt">${hlMatch(r.excerpt.substring(0, 100), query)}</div>${r.date ? `<div style="font-size:0.7rem;color:var(--text-muted);margin-top:4px;">${r.date}</div>` : ''}</div>`).join('')}</div>`; }
function calcScore(query, ...texts) { const q = query.toLowerCase(); let s = 0; texts.forEach((t, i) => { if (!t) return; const tl = t.toLowerCase(); if (tl === q) s += 100; const w = i === 0 ? 3 : 1; if (tl.includes(q)) s += 20 * w; const cs = q.split(''); let mc = 0; cs.forEach(c => { if (tl.includes(c)) mc++; }); s += (mc / cs.length) * 10 * w; }); return Math.round(s); }
function hlMatch(text, query) { if (!text || !query) return text || ''; return text.replace(new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi'), '<strong style="color:var(--primary-blue);background:var(--primary-pale);padding:0 2px;border-radius:2px;">$1</strong>'); }

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
        navBackdrop.classList.toggle('active', isActive);
        if (window.innerWidth <= 768) {
            body.style.overflow = isActive ? 'hidden' : '';
        }
    });
    navMenu.querySelectorAll('.nav-link').forEach(l => l.addEventListener('click', e => {
        if (!l.classList.contains('dropdown-toggle')) {
            hamburger.classList.remove('active');
            navMenu.classList.remove('active');
            navBackdrop.classList.remove('active');
            body.style.overflow = '';
        }
    }));
    document.addEventListener('click', e => {
        if (!hamburger.contains(e.target) && !navMenu.contains(e.target)) {
            hamburger.classList.remove('active');
            navMenu.classList.remove('active');
            navBackdrop.classList.remove('active');
            body.style.overflow = '';
        }
    });
}
const dtEl = document.getElementById('moreDropdown'), dmEl = document.getElementById('dropdownMenu');
if (dtEl && dmEl) { dtEl.addEventListener('click', e => { e.preventDefault(); e.stopPropagation(); dtEl.classList.toggle('active'); dmEl.classList.toggle('active'); }); dmEl.querySelectorAll('.dropdown-link').forEach(l => l.addEventListener('click', () => { dtEl.classList.remove('active'); dmEl.classList.remove('active'); })); document.addEventListener('click', e => { if (!dtEl.contains(e.target) && !dmEl.contains(e.target)) { dtEl.classList.remove('active'); dmEl.classList.remove('active'); } }); }
window.addEventListener('scroll', () => { if (window.scrollY > 60) navbar.classList.add('scrolled'); else navbar.classList.remove('scrolled'); });
if (themeToggle) { const st = localStorage.getItem('wfls-tt-theme'); if (st === 'dark') { body.classList.add('dark-mode'); themeToggle.innerHTML = '<i class="fa-solid fa-sun"></i>'; } themeToggle.addEventListener('click', () => { body.classList.toggle('dark-mode'); const id = body.classList.contains('dark-mode'); localStorage.setItem('wfls-tt-theme', id ? 'dark' : 'light'); themeToggle.innerHTML = id ? '<i class="fa-solid fa-sun"></i>' : '<i class="fa-solid fa-moon"></i>'; }); }

function openModal(m) { if(m) { m.classList.add('active'); body.style.overflow = 'hidden'; } }
function closeModal(m) { if(m) { m.classList.remove('active'); body.style.overflow = ''; } }
if (qrTrigger && modalOverlay) qrTrigger.addEventListener('click', () => openModal(modalOverlay));
if (modalClose && modalOverlay) modalClose.addEventListener('click', () => closeModal(modalOverlay));
if (modalOverlay) modalOverlay.addEventListener('click', e => { if (e.target === modalOverlay) closeModal(modalOverlay); });
document.addEventListener('keydown', e => { if (e.key === 'Escape' && modalOverlay && modalOverlay.classList.contains('active')) closeModal(modalOverlay); });

function formatExcerpt(text) { if (!text) return ''; return renderLatexInString(text.replace(/\n/g, '<br>').replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')); }
function renderLatexInString(html) { if (!html || typeof katex === 'undefined') return html; try { html = html.replace(/\$\$([\s\S]*?)\$\$/g, function(match, formula) { var f = formula.trim(); if (!f) return match; try { var r = katex.renderToString(f, { displayMode: true, throwOnError: false, strict: false }); return r.indexOf('katex-error') !== -1 ? match : r; } catch(e) { return match; } }); html = html.replace(/(^|[^\\$])\$([^\n$]+?)\$/g, function(match, prefix, formula) { var f = formula.trim(); if (!f) return match; try { var r = katex.renderToString(f, { displayMode: false, throwOnError: false, strict: false }); return r.indexOf('katex-error') !== -1 ? match : prefix + r; } catch(e) { return match; } }); } catch(e) { console.warn('LaTeX render failed', e); } return html; }
function protectLatex(text) { var blocks = []; var p = text; p = p.replace(/\$\$([\s\S]*?)\$\$/g, function(m, f) { var i = blocks.length; blocks.push({ t: 'd', f: f.trim() }); return '\uE000LD' + i + '\uE000'; }); p = p.replace(/\$([^\n]+?)\$/g, function(m, f) { var i = blocks.length; blocks.push({ t: 'i', f: f.trim() }); return '\uE000LI' + i + '\uE000'; }); return { text: p, blocks: blocks }; }
function restoreLatex(html, blocks) { if (!blocks || !blocks.length) return html; for (var i = 0; i < blocks.length; i++) { var b = blocks[i]; var ph = (b.t === 'd' ? '\uE000LD' : '\uE000LI') + i + '\uE000'; var idx = html.indexOf(ph); if (idx === -1) { html = html.replace(new RegExp('LD' + i + '(?=[^' + '\uE000' + ']|$)|LI' + i + '(?=[^' + '\uE000' + ']|$)', 'g'), b.t === 'd' ? '$$' + b.f + '$$' : '$' + b.f + '$'); continue; } try { var rendered = katex.renderToString(b.f, { displayMode: b.t === 'd', throwOnError: false, strict: false }); html = html.split(ph).join(rendered); } catch(e) { html = html.split(ph).join(b.t === 'd' ? '$$' + b.f + '$$' : '$' + b.f + '$'); } } return html; }
function renderMarkdown(text) { if (!text) return ''; const hasKatex = typeof katex !== 'undefined'; let blocks = []; let toProcess = text; if (hasKatex) { const r = protectLatex(text); toProcess = r.text; blocks = r.blocks; } let html; if (typeof marked !== 'undefined' && marked.parse) { try { marked.setOptions({ breaks: true, gfm: true }); html = marked.parse(toProcess); } catch(e) { console.warn('Markdown parse failed, fallback to formatExcerpt', e); html = formatExcerpt(toProcess); } } else { html = formatExcerpt(toProcess); } if (hasKatex && blocks.length) html = restoreLatex(html, blocks); return html; }
function parseWinRate(s) { return parseFloat((s || '0%').replace('%', '')) || 0; }
function createNewsCard(item) { const tt = i18n[currentLang]['tag_' + item.tag] || item.tag; return `<div class="news-card-date">${item.date}</div><h3>${item.title}</h3><p>${formatExcerpt(item.excerpt)}</p><span class="news-card-tag tag-${item.tag}">${tt}</span>`; }
function createCompetitionCard(item) { const tt = i18n[currentLang]['tag_' + item.tag] || item.tag; return `<div class="competitions-card-date">${item.date}</div><h3>${item.title}</h3><p>${formatExcerpt(item.excerpt)}</p><span class="competitions-card-tag tag-${item.tag}">${tt}</span>`; }
function createQaCard(item) { const tt = i18n[currentLang]['tag_' + item.tag] || item.tag; return `<div class="qa-card-date">${item.date}</div><h3>${item.title}</h3><p>${formatExcerpt(item.excerpt)}</p><span class="qa-card-tag tag-${item.tag}">${tt}</span>`; }
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
function renderPagination(cid, d, cp) { const c = document.getElementById(cid); if (!c) return; const ep = c.parentElement.querySelector('.pagination'); if (ep) ep.remove(); const tp = getTotalPages(d); if (tp <= 1) return; const pe = document.createElement('div'); pe.className = 'pagination'; const pb = document.createElement('button'); pb.className = 'pagination-btn'; pb.textContent = i18n[currentLang].pagination_prev; pb.disabled = cp <= 1; pb.addEventListener('click', () => { if (cid === 'newsFullGrid') { newsCurrentPage = cp-1; renderAllNews(); } else if (cid === 'competitionsFullGrid') { competitionsCurrentPage = cp-1; renderAllCompetitions(); } else { qaCurrentPage = cp-1; renderAllQa(); } window.scrollTo({ top: c.offsetTop-100, behavior:'smooth' }); }); pe.appendChild(pb); for (let i=1; i<=tp; i++) { const pg = document.createElement('button'); pg.className = 'pagination-btn'; if (i===cp) pg.classList.add('active'); pg.textContent = i; pg.addEventListener('click', () => { if (cid === 'newsFullGrid') { newsCurrentPage = i; renderAllNews(); } else if (cid === 'competitionsFullGrid') { competitionsCurrentPage = i; renderAllCompetitions(); } else { qaCurrentPage = i; renderAllQa(); } window.scrollTo({ top: c.offsetTop-100, behavior:'smooth' }); }); pe.appendChild(pg); } const nb = document.createElement('button'); nb.className = 'pagination-btn'; nb.textContent = i18n[currentLang].pagination_next; nb.disabled = cp >= tp; nb.addEventListener('click', () => { if (cid === 'newsFullGrid') { newsCurrentPage = cp+1; renderAllNews(); } else if (cid === 'competitionsFullGrid') { competitionsCurrentPage = cp+1; renderAllCompetitions(); } else { qaCurrentPage = cp+1; renderAllQa(); } window.scrollTo({ top: c.offsetTop-100, behavior:'smooth' }); }); pe.appendChild(nb); const ie = document.createElement('span'); ie.className = 'pagination-info'; ie.textContent = i18n[currentLang].pagination_info.replace('{current}', cp).replace('{total}', tp); pe.appendChild(ie); c.parentElement.appendChild(pe); }

async function loadAboutData() { showContentLoading('coreMembersGrid', '加载社团信息...'); try { aboutData = await (await fetch('data/about.json')).json(); } catch(e) { aboutData = null; } if (typeof renderAboutSections === 'function') renderAboutSections(); updateHeroLastUpdated(); }
async function loadMembersData() { showContentLoading('coreMembersGrid', '加载成员数据...'); try { membersData = await (await fetch('data/members.json')).json(); } catch(e) { membersData = []; } if (typeof renderCoreMembers === 'function') { renderCoreMembers(); if (typeof renderAllMembersPage === 'function') renderAllMembersPage(); } }
async function loadNewsData() { showContentLoading('newsPreviewGrid', '加载动态...'); showContentLoading('newsFullGrid', '加载动态...'); try { newsData = await (await fetch('data/news.json')).json(); } catch(e) { newsData = []; } if (typeof renderAllNews === 'function') renderAllNews(); checkAllDataLoaded(); }
async function loadCompetitionsData() { showContentLoading('competitionsPreviewGrid', '加载赛事...'); showContentLoading('competitionsFullGrid', '加载赛事...'); try { competitionsData = await (await fetch('data/competitions.json')).json(); } catch(e) { competitionsData = []; } if (typeof renderAllCompetitions === 'function') renderAllCompetitions(); checkAllDataLoaded(); }
async function loadDrawsData() { try { drawsData = await (await fetch('data/draws.json')).json(); } catch(e) { drawsData = []; } checkAllDataLoaded(); }
function getDrawsForCompetition(competitionId) { if (!drawsData || !drawsData.length) return null; return drawsData.find(d => d.competitionId === competitionId) || null; }
async function loadQaData() { try { qaData = await (await fetch('data/qa.json')).json(); } catch(e) { qaData = []; } if (typeof renderAllQa === 'function') renderAllQa(); }
async function loadChangelogData() { try { changelogData = await (await fetch('data/changelog.json')).json(); } catch(e) { changelogData = []; } if (typeof renderAllChangelog === 'function') renderAllChangelog(); }
async function loadPlayerTagsData() { try { playerTagsData = await (await fetch('data/player-tags.json')).json(); } catch(e) { playerTagsData = null; } }
function checkAllDataLoaded() { if (newsData && competitionsData) { dataLoaded = true; if (typeof updateDetailPage === 'function' && window.location.pathname.includes('detail.html')) updateDetailPage(); } }

function renderAboutSections() { if (!aboutData) return; const hc = document.getElementById('historyContent'); if (hc && aboutData.history) hc.innerHTML = `<div class="markdown-body">${renderMarkdown(aboutData.history.content)}</div>`; const pc = document.getElementById('philosophyContent'); if (pc && aboutData.philosophy) pc.innerHTML = `<div class="markdown-body">${renderMarkdown(aboutData.philosophy.content)}</div>`; const ac = document.getElementById('activitiesContent'); if (ac && aboutData.activities) ac.innerHTML = `<div class="markdown-body">${renderMarkdown(aboutData.activities.content)}</div>`; updateHeroLastUpdated(); }
function getMemberAvatarHTML(m) { if (m.qq && m.qq.trim()) { const qqUrl = `https://q1.qlogo.cn/g?b=qq&nk=${m.qq.trim()}&s=640`; return `<div class="member-avatar">${m.name.charAt(0)}<img class="member-avatar-img" src="${qqUrl}" alt="${m.name}" loading="lazy" onerror="this.style.display='none'"></div>`; } return `<div class="member-avatar text-only">${m.name.charAt(0)}</div>`; }
function renderCoreMembers() { document.querySelectorAll('#coreMembersGrid').forEach(g => { if (!g) return; g.innerHTML = ''; membersData.forEach(m => { const el = document.createElement('div'); el.className = 'member-card glass-card'; el.innerHTML = `${getMemberAvatarHTML(m)}<h3>${m.name}</h3><span class="member-role">${m.role}</span><p class="member-desc">${formatExcerpt(m.description)}</p>`; g.appendChild(el); }); }); }
function renderAllMembersPage() { const g = document.getElementById('allMembersGrid'); if (!g) return; g.innerHTML = ''; membersData.forEach(m => { const el = document.createElement('div'); el.className = 'member-card glass-card'; el.innerHTML = `${getMemberAvatarHTML(m)}<h3>${m.name}</h3><span class="member-role">${m.role}</span><p class="member-desc">${formatExcerpt(m.description)}</p>`; g.appendChild(el); }); }
function renderAllNews() { const pg = document.getElementById('newsPreviewGrid'); if (pg) { pg.innerHTML = ''; newsData.slice(0,3).forEach(item => { const c = document.createElement('div'); c.className = 'news-card'; c.innerHTML = createNewsCard(item); c.addEventListener('click', () => window.location.href = `detail.html?type=news&id=${item.id}`); pg.appendChild(c); }); } const fg = document.getElementById('newsFullGrid'); if (fg) { const fd = getFilteredNewsData(); fg.innerHTML = ''; getPaginatedData(fd, newsCurrentPage).forEach(item => { const c = document.createElement('div'); c.className = 'news-card'; c.innerHTML = createNewsCard(item); c.addEventListener('click', () => window.location.href = `detail.html?type=news&id=${item.id}`); fg.appendChild(c); }); renderPagination('newsFullGrid', fd, newsCurrentPage); renderTagFilter('newsTagFilter', newsData, newsFilterTag, setNewsFilter); } }
function renderAllCompetitions() { const pg = document.getElementById('competitionsPreviewGrid'); if (pg) { pg.innerHTML = ''; competitionsData.slice(0,3).forEach(item => { const c = document.createElement('div'); c.className = 'competitions-card'; c.innerHTML = createCompetitionCard(item); c.addEventListener('click', () => window.location.href = `detail.html?type=competition&id=${item.id}`); pg.appendChild(c); }); } const fg = document.getElementById('competitionsFullGrid'); if (fg) { const fd = getFilteredCompetitionsData(); fg.innerHTML = ''; getPaginatedData(fd, competitionsCurrentPage).forEach(item => { const c = document.createElement('div'); c.className = 'competitions-card'; c.innerHTML = createCompetitionCard(item); c.addEventListener('click', () => window.location.href = `detail.html?type=competition&id=${item.id}`); fg.appendChild(c); }); renderPagination('competitionsFullGrid', fd, competitionsCurrentPage); renderTagFilter('competitionsTagFilter', competitionsData, competitionsFilterTag, setCompetitionsFilter); } }
function renderAllQa() { const fg = document.getElementById('qaFullGrid'); if (fg) { fg.innerHTML = ''; getPaginatedData(qaData, qaCurrentPage).forEach(item => { const c = document.createElement('div'); c.className = 'qa-card'; c.innerHTML = createQaCard(item); c.addEventListener('click', () => window.location.href = `detail.html?type=qa&id=${item.id}`); fg.appendChild(c); }); renderPagination('qaFullGrid', qaData, qaCurrentPage); } }
function renderAllChangelog() { const tl = document.getElementById('changelogTimeline'); if (!tl) return; tl.innerHTML = ''; if (!changelogData || !changelogData.length) { tl.innerHTML = '<div class="changelog-empty"><i class="fa-solid fa-clock-rotate-left"></i><p data-i18n="changelog_empty">鏆傛棤鏇存柊鏃ュ織</p></div>'; return; } changelogData.forEach((item, idx) => { const entry = document.createElement('div'); entry.className = 'changelog-entry'; const tagLabel = i18n[currentLang]['tag_' + item.tag] || item.tag; const changesHtml = item.changes && item.changes.length ? '<ul class="changelog-changes">' + item.changes.map(c => '<li>' + renderMarkdown(c) + '</li>').join('') + '</ul>' : ''; entry.innerHTML = `<div class="changelog-entry-marker"><div class="changelog-dot"></div>${idx < changelogData.length - 1 ? '<div class="changelog-line"></div>' : ''}</div><div class="changelog-entry-content glass-card"><div class="changelog-entry-header"><span class="changelog-version">${item.version}</span><span class="changelog-tag tag-${item.tag}">${tagLabel}</span><span class="changelog-date">${item.date}</span></div><h3 class="changelog-entry-title">${item.title}</h3>${changesHtml}</div>`; tl.appendChild(entry); }); }
function updateDetailPage() {
    const params = new URLSearchParams(window.location.search);
    const type = params.get('type'), id = params.get('id');
    if (!type || !id) return;
    const da = type === 'news' ? newsData : (type === 'competition' ? competitionsData : qaData);
    if (!da || !da.length) { setTimeout(() => updateDetailPage(), 200); return; }
    const item = da.find(d => d.id == id);
    if (!item) {
        document.getElementById('detailTitle').textContent = '未找到内容';
        document.getElementById('detailDate').textContent = '';
        document.getElementById('detailContent').innerHTML = '<p>请求的内容不存在或已被移除。</p>';
        document.getElementById('detailMedia').innerHTML = '';
        return;
    }
    document.getElementById('detailTypeTag').textContent = i18n[currentLang][type === 'news' ? 'news_hero_tag' : (type === 'competition' ? 'comp_hero_tag' : 'qa_hero_tag')];
    document.getElementById('detailTitle').textContent = item.title;
    document.getElementById('detailDate').textContent = item.date;
    document.getElementById('detailContent').innerHTML = renderMarkdown(item.content || item.excerpt || '');
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
                img.onerror = () => { img.style.display = 'none'; mi.innerHTML = '<div class="media-error"><i class="fa-solid fa-image"></i><p>图片加载失败</p><a href="' + m.src + '" download class="media-download-link"><i class="fa-solid fa-download"></i> 下载图片</a></div>'; };
                mi.appendChild(img);
            } else if (m.type === 'video') {
                const wrapper = document.createElement('div');
                wrapper.className = 'video-wrapper';
                const v = document.createElement('video');
                v.controls = true;
                v.playsInline = true;
                v.preload = 'auto';
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
                    mi.innerHTML = '<div class="media-error"><i class="fa-solid fa-video"></i><p>视频加载失败</p><p class="media-error-hint">（文件较大，网络不稳定时可能加载较慢）</p><a href="' + m.src + '" download class="media-download-link"><i class="fa-solid fa-download"></i> 下载视频</a></div>';
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
                a.innerHTML = '<i class="fa-solid fa-download"></i> ' + (m.name || '下载文件');
                mi.appendChild(a);
            }
            mc.appendChild(mi);
        });
    }

    // Draws toggle for competitions
    const drawsToggleContainer = document.getElementById('detailDrawsToggle');
    const drawsContainer = document.getElementById('detailDraws');
    if (drawsToggleContainer && drawsContainer) {
        if (type === 'competition') {
            const draws = getDrawsForCompetition(id);
            if (draws) {
                // Show toggle buttons
                drawsToggleContainer.style.display = 'flex';
                drawsToggleContainer.innerHTML = `
                    <button class="draws-tab-btn active" data-tab="content" data-i18n="draws_tab_content">${i18n[currentLang].draws_tab_content}</button>
                    <button class="draws-tab-btn" data-tab="draws" data-i18n="draws_tab_bracket">${i18n[currentLang].draws_tab_bracket}</button>
                `;
                // Bind toggle events
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
                // Render draws based on version
                if (draws.version === 2 && typeof initDrawsViewer === 'function') {
                    drawsContainer.innerHTML = '';
                    drawsContainer.style.display = 'none';
                    // The viewer will be initialized when tab is clicked
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

function escapeHtml(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

function initPdfViewer() { const btn = document.getElementById('pdfViewBtn'), ctr = document.getElementById('pdfPreviewContainer'), ph = document.getElementById('pdfPlaceholder'), vw = document.getElementById('pdfViewer'); if (!btn) return; let loaded = false; btn.addEventListener('click', () => { if (!loaded) { btn.disabled = true; btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Loading...'; vw.src = vw.getAttribute('data-src'); loaded = true; vw.onload = () => { btn.innerHTML = `<i class="fa-solid fa-eye-slash"></i> ${i18n[currentLang].pdf_preview_btn}`; btn.disabled = false; }; setTimeout(() => { if (btn.disabled) { btn.innerHTML = `<i class="fa-solid fa-eye-slash"></i> ${i18n[currentLang].pdf_preview_btn}`; btn.disabled = false; } }, 10000); } if (ctr.style.display === 'none' || !ctr.style.display) { ctr.style.display = 'block'; ph.style.display = 'none'; } else { ctr.style.display = 'none'; ph.style.display = 'flex'; } }); }

function updateSideNavHighlight() { const links = document.querySelectorAll('.side-nav-link'); const pos = window.scrollY + 150; let cur = 'home'; [{ id:'home', s:'#home' },{ id:'history', s:'#history' },{ id:'philosophy', s:'#philosophy' },{ id:'activities', s:'#activities' },{ id:'core-members', s:'#core-members' },{ id:'news', s:'#news' },{ id:'competitions', s:'#competitions' }].forEach(sec => { const el = document.querySelector(sec.s); if (el && pos >= el.offsetTop && pos < el.offsetTop+el.offsetHeight) cur = sec.id; }); links.forEach(l => { l.classList.remove('active'); if (l.getAttribute('data-section') === cur) l.classList.add('active'); }); }
function highlightNavByPath() { const cp = window.location.pathname.split('/').pop() || 'index.html'; const anl = document.querySelectorAll('.nav-link:not(.dropdown-toggle)'), dl = document.querySelectorAll('.dropdown-link'); anl.forEach(l => l.classList.remove('active')); dl.forEach(l => l.classList.remove('active')); const dt2 = document.getElementById('moreDropdown'); if (dt2) dt2.classList.remove('active'); anl.forEach(link => { const h = link.getAttribute('href'); if (!h) return; if (h === cp || (cp === '' && h === 'index.html') || (cp === 'index.html' && h === 'index.html') || (cp === 'contact.html' && h === 'contact.html')) link.classList.add('active'); }); if (cp === 'members.html' || cp === 'data_viz.html' || cp === 'personal_stats.html' || cp === 'qa.html' || cp === 'changelog.html') { if (dt2) dt2.classList.add('active'); dl.forEach(link => { if (link.getAttribute('href') === cp) link.classList.add('active'); }); } }

function initCommon() {
    initSearch();
    highlightNavByPath();
    window.addEventListener('scroll', updateSideNavHighlight);
    updateSideNavHighlight();
}