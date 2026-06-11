/* ========================================
   WFLS Table Tennis Club - Main Script
   ======================================== */

const i18n = {
    zh: {
        site_title: "武汉外国语学校乒乓球社团 | WFLS Table Tennis Club",
        nav_home: "Home",
        nav_news: "News",
        nav_competitions: "Competitions",
        nav_contact: "Contact",
        nav_more: "More...",
        nav_members: "社团骨干",
        lang_btn: "EN",
        hero_title: "武汉外国语学校<br>乒乓球社团",
        hero_slogan: "挥拍逐梦，旋转青春",
        hero_btn_about: "了解社团",
        hero_btn_join: "加入我们",
        scroll: "Scroll",
        side_home: "首页",
        side_history: "社团历史",
        side_philosophy: "社团理念",
        side_activities: "社团活动",
        side_members: "社团骨干",
        side_news: "最新动态",
        side_competitions: "赛事信息",
        history_tag: "Club History",
        history_title: "社团历史",
        history_desc: "武汉外国语学校乒乓球社团的发展历程",
        philosophy_tag: "Philosophy",
        philosophy_title: "社团理念",
        philosophy_desc: "我们的核心价值观与指导思想",
        activities_tag: "Activities",
        activities_title: "社团活动",
        activities_desc: "全年性活动、社团课活动及年度大赛",
        members_tag: "Core Members",
        members_title: "社团骨干",
        members_desc: "引领社团发展的核心力量",
        news_tag: "Latest News",
        news_title: "最新动态",
        news_desc: "关注社团最新活动与公告",
        news_all: "查看全部动态",
        comp_tag: "Competitions",
        comp_title: "赛事信息",
        comp_desc: "近期比赛安排与成绩",
        comp_all: "查看全部赛事",
        contact_page_title: "联系我们 | WFLS Table Tennis Club",
        contact_tag: "Contact",
        contact_title: "加入我们",
        contact_desc: "扫描二维码加入社团QQ群，获取最新训练安排与活动通知",
        contact_text: "扫码加入社团QQ群，与我们一起挥拍逐梦",
        contact_btn: "扫描二维码加入社团群",
        contact_qr_title: "社团QQ群二维码",
        contact_qr_desc: "扫码加入社团QQ群，与我们一起挥拍逐梦",
        footer_brand: "武汉外国语学校乒乓球社团",
        footer_motto: "挥拍逐梦，旋转青春",
        footer_nav: "快速导航",
        footer_school: "学校信息",
        footer_school_name: "武汉外国语学校",
        footer_location: "湖北省武汉市",
        modal_title: "社团QQ群二维码",
        modal_desc: "扫描下方二维码加入社团QQ群",
        modal_note: "二维码定期更新，如有问题请联系社团管理员",
        news_page_title: "近期动态 | WFLS Table Tennis Club",
        news_hero_tag: "News & Updates",
        news_hero_title: "近期动态",
        news_hero_desc: "社团活动 / 训练安排 / 重要公告",
        news_list_tag: "All News",
        news_list_title: "全部动态",
        comp_page_title: "赛事信息 | WFLS Table Tennis Club",
        comp_hero_tag: "Competitions",
        comp_hero_title: "赛事信息",
        comp_hero_desc: "比赛安排 / 成绩记录 / 赛事回顾",
        comp_list_tag: "All Competitions",
        comp_list_title: "全部赛事",
        pdf_tag: "Match Records",
        pdf_title: "比赛记录",
        pdf_desc: "最新赛事对阵表与成绩记录",
        pdf_preview_btn: "在线预览",
        pdf_download_btn: "下载PDF",
        pdf_placeholder_name: "比赛记录文件 (matches.pdf)",
        pdf_placeholder_hint: "点击上方\"在线预览\"按钮查看，或直接下载",
        members_page_title: "社团骨干 | WFLS Table Tennis Club",
        rank_page_title: "Ranking Beta | WFLS Table Tennis Club",
        rank_hero_desc: "社团积分排名系统 · 支持多时间节点对比 · 点击姓名查看积分明细",
        rank_tag: "Data Table",
        rank_title: "积分数据表",
        rank_sort_hint: "当前排序：",
        rank_sidebar_title: "时间节点",
        rank_col_rank: "#",
        rank_col_name: "姓名",
        rank_col_points: "当前积分",
        rank_col_points_change: "积分变化",
        rank_col_change: "排名变化",
        rank_col_matches: "总场次",
        rank_col_winrate: "胜率",
        score_detail_title: "积分明细",
        score_col_date: "日期",
        score_col_type: "类型",
        score_col_opponent: "对手",
        score_col_result: "结果",
        score_col_score_before: "赛前积分",
        score_col_change: "积分变动",
        score_col_score_after: "赛后积分",
        score_result_win: "胜",
        score_result_loss: "负",
        tag_match: "赛事",
        tag_training: "训练",
        tag_notice: "公告",
        tag_event: "活动",
        tag_upcoming: "即将开始",
        tag_result: "比赛结果",
        tag_live: "进行中",
        detail_page_title: "详情 | WFLS Table Tennis Club",
        detail_back: "返回列表",
        search_placeholder: "搜索新闻、赛事、成员、排名...",
        search_no_results: "未找到相关结果",
        search_type_news: "新闻",
        search_type_competition: "赛事",
        search_type_member: "成员",
        search_type_ranking: "排名",
        pagination_prev: "上一页",
        pagination_next: "下一页",
        pagination_info: "第 {current} 页，共 {total} 页",
        data_viz_page_title: "数据可视化 | WFLS Table Tennis Club",
        data_viz_tag: "Data Visualization",
        data_viz_title: "数据可视化仪表盘",
        data_viz_desc: "积分趋势 · 排名变化 · 球员对比",
        data_viz_points_trend: "积分趋势",
        data_viz_rank_stream: "排名变化河流图",
        data_viz_player_compare: "球员对比",
        data_viz_select_players: "选择球员（最多8人）",
        data_viz_select_player_a: "球员 A",
        data_viz_select_player_b: "球员 B",
        data_viz_apply: "应用",
        data_viz_top_n: "显示前",
        data_viz_head_to_head: "历史交手记录"
    },
    en: {
        site_title: "WFLS Table Tennis Club | Wuhan Foreign Languages School",
        nav_home: "Home",
        nav_news: "News",
        nav_competitions: "Competitions",
        nav_contact: "Contact",
        nav_more: "More...",
        nav_members: "Core Members",
        lang_btn: "中文",
        hero_title: "Wuhan Foreign Languages School<br>Table Tennis Club",
        hero_slogan: "Swing for dreams, spin for youth",
        hero_btn_about: "About Us",
        hero_btn_join: "Join Us",
        scroll: "Scroll",
        side_home: "Home",
        side_history: "History",
        side_philosophy: "Philosophy",
        side_activities: "Activities",
        side_members: "Members",
        side_news: "News",
        side_competitions: "Competitions",
        history_tag: "Club History",
        history_title: "Club History",
        history_desc: "The development journey of WFLS Table Tennis Club",
        philosophy_tag: "Philosophy",
        philosophy_title: "Philosophy",
        philosophy_desc: "Our core values and guiding principles",
        activities_tag: "Activities",
        activities_title: "Activities",
        activities_desc: "Year-round activities, club class activities and annual tournaments",
        members_tag: "Core Members",
        members_title: "Core Members",
        members_desc: "The driving force behind the club",
        news_tag: "Latest News",
        news_title: "Latest News",
        news_desc: "Stay updated with club activities and announcements",
        news_all: "View All News",
        comp_tag: "Competitions",
        comp_title: "Competitions",
        comp_desc: "Upcoming matches and results",
        comp_all: "View All Competitions",
        contact_page_title: "Contact | WFLS Table Tennis Club",
        contact_tag: "Contact",
        contact_title: "Join Us",
        contact_desc: "Scan the QR code to join the club QQ group and receive notifications",
        contact_text: "Scan to join the club QQ group and swing with us",
        contact_btn: "Scan QR Code to Join",
        contact_qr_title: "Club QQ Group QR Code",
        contact_qr_desc: "Scan to join the club QQ group and swing with us",
        footer_brand: "WFLS Table Tennis Club",
        footer_motto: "Swing for dreams, spin for youth",
        footer_nav: "Quick Links",
        footer_school: "School Info",
        footer_school_name: "Wuhan Foreign Languages School",
        footer_location: "Wuhan, Hubei, China",
        modal_title: "Club QQ Group QR Code",
        modal_desc: "Scan the QR code below to join the club QQ group",
        modal_note: "QR code updates periodically.",
        news_page_title: "News | WFLS Table Tennis Club",
        news_hero_tag: "News & Updates",
        news_hero_title: "News",
        news_hero_desc: "Activities / Training / Announcements",
        news_list_tag: "All News",
        news_list_title: "All News",
        comp_page_title: "Competitions | WFLS Table Tennis Club",
        comp_hero_tag: "Competitions",
        comp_hero_title: "Competitions",
        comp_hero_desc: "Schedule / Results / Review",
        comp_list_tag: "All Competitions",
        comp_list_title: "All Competitions",
        pdf_tag: "Match Records",
        pdf_title: "Match Records",
        pdf_desc: "Latest match schedule and results",
        pdf_preview_btn: "Preview Online",
        pdf_download_btn: "Download PDF",
        pdf_placeholder_name: "Match Records (matches.pdf)",
        pdf_placeholder_hint: "Click \"Preview Online\" to view, or download directly",
        members_page_title: "Core Members | WFLS Table Tennis Club",
        rank_page_title: "Ranking Beta | WFLS Table Tennis Club",
        rank_hero_desc: "Club ranking system · Multi-period comparison · Click name for score details",
        rank_tag: "Data Table",
        rank_title: "Points Table",
        rank_sort_hint: "Current sorting: ",
        rank_sidebar_title: "Time Periods",
        rank_col_rank: "#",
        rank_col_name: "Name",
        rank_col_points: "Points",
        rank_col_points_change: "Score Δ",
        rank_col_change: "Rank Δ",
        rank_col_matches: "Matches",
        rank_col_winrate: "Win Rate",
        score_detail_title: "Score Details",
        score_col_date: "Date",
        score_col_type: "Type",
        score_col_opponent: "Opponent",
        score_col_result: "Result",
        score_col_score_before: "Before",
        score_col_change: "Change",
        score_col_score_after: "After",
        score_result_win: "Win",
        score_result_loss: "Loss",
        tag_match: "Match",
        tag_training: "Training",
        tag_notice: "Notice",
        tag_event: "Event",
        tag_upcoming: "Upcoming",
        tag_result: "Result",
        tag_live: "Live",
        detail_page_title: "Details | WFLS Table Tennis Club",
        detail_back: "Back to List",
        search_placeholder: "Search news, competitions, members, rankings...",
        search_no_results: "No results found",
        search_type_news: "News",
        search_type_competition: "Competition",
        search_type_member: "Member",
        search_type_ranking: "Ranking",
        pagination_prev: "Previous",
        pagination_next: "Next",
        pagination_info: "Page {current} of {total}",
        data_viz_page_title: "Data Visualization | WFLS Table Tennis Club",
        data_viz_tag: "Data Visualization",
        data_viz_title: "Data Dashboard",
        data_viz_desc: "Points Trend · Rank Flow · Player Compare",
        data_viz_points_trend: "Points Trend",
        data_viz_rank_stream: "Rank Flow",
        data_viz_player_compare: "Player Comparison",
        data_viz_select_players: "Select Players (max 8)",
        data_viz_select_player_a: "Player A",
        data_viz_select_player_b: "Player B",
        data_viz_apply: "Apply",
        data_viz_top_n: "Top",
        data_viz_head_to_head: "Head to Head"
    }
};

let currentLang = 'zh';
let newsData = [];
let competitionsData = [];
let aboutData = null;
let membersData = [];
let scoreLogData = [];
let rankingTimeline = [];
let currentTimeIndex = 0;
let currentDisplayData = [];
let currentSortKey = '当前积分';
let currentSortDir = 'desc';
let dataLoaded = false;
let newsCurrentPage = 1;
let competitionsCurrentPage = 1;
const ITEMS_PER_PAGE = 10;

let pointsTrendChart = null;
let rankStreamChart = null;
const CHART_COLORS = ['#4da3ff','#ff6b6b','#52c41a','#f5c542','#ff9f43','#a55eea','#26de81','#fd79a8','#45b7d1','#f78fb3','#3dc1d3','#e66767','#778beb','#f5cd79','#cf6a87','#786fa6','#f8a5c2','#63cdda','#ea8685','#596275'];

const hamburger = document.getElementById('hamburger');
const navMenu = document.getElementById('navMenu');
const navbar = document.getElementById('navbar');
const themeToggle = document.getElementById('themeToggle');
const langToggle = document.getElementById('langToggle');
const searchToggle = document.getElementById('searchToggle');
const searchOverlay = document.getElementById('searchOverlay');
const searchInput = document.getElementById('searchInput');
const searchClear = document.getElementById('searchClear');
const searchClose = document.getElementById('searchClose');
const searchResults = document.getElementById('searchResults');
const modalOverlay = document.getElementById('modalOverlay');
const modalClose = document.getElementById('modalClose');
const qrTrigger = document.getElementById('qrTrigger');
const scoreDetailModal = document.getElementById('scoreDetailModal');
const scoreDetailClose = document.getElementById('scoreDetailClose');
const scoreDetailTitle = document.getElementById('scoreDetailTitle');
const scoreDetailBody = document.getElementById('scoreDetailBody');
const body = document.body;

function setLanguage(lang) {
    currentLang = lang;
    localStorage.setItem('wfls-lang', lang);
    document.querySelectorAll('[data-i18n]').forEach(el => {
        const key = el.getAttribute('data-i18n');
        if (i18n[lang] && i18n[lang][key]) el.innerHTML = i18n[lang][key];
    });
    if (langToggle) langToggle.querySelector('span').textContent = lang === 'zh' ? 'EN' : '中文';
    if (searchInput) searchInput.placeholder = i18n[lang].search_placeholder;
    renderAllNews();
    renderAllCompetitions();
    if (aboutData) { renderAboutSections(); updateHeroLastUpdated(); }
    if (membersData.length > 0) { renderCoreMembers(); renderAllMembersPage(); }
    updateRankingHeaders();
    updatePdfButtons();
    if (dataLoaded) updateDetailPage();
}

function updateHeroLastUpdated() {
    const lastUpdatedEl = document.getElementById('heroLastUpdated');
    if (lastUpdatedEl && aboutData && aboutData.lastUpdated) {
        lastUpdatedEl.textContent = currentLang === 'zh' 
            ? `上次更新：${aboutData.lastUpdated}` 
            : `Last updated: ${aboutData.lastUpdated}`;
    }
}

function updateRankingHeaders() {
    document.querySelectorAll('.ranking-table-full th[data-i18n]').forEach(th => {
        const key = th.getAttribute('data-i18n');
        if (i18n[currentLang] && i18n[currentLang][key]) th.innerHTML = i18n[currentLang][key] + ' <span class="sort-arrow"></span>';
    });
}

function updatePdfButtons() {
    const btn = document.getElementById('pdfViewBtn');
    if (btn) btn.innerHTML = `<i class="fa-solid fa-eye"></i> ${i18n[currentLang].pdf_preview_btn}`;
    const down = document.querySelector('.pdf-actions .btn-primary');
    if (down) down.innerHTML = `<i class="fa-solid fa-download"></i> ${i18n[currentLang].pdf_download_btn}`;
}

if (langToggle) {
    const savedLang = localStorage.getItem('wfls-lang') || 'zh';
    setLanguage(savedLang);
    langToggle.addEventListener('click', () => setLanguage(currentLang === 'zh' ? 'en' : 'zh'));
}

function initSearch() {
    if (!searchToggle || !searchOverlay || !searchInput) return;
    searchToggle.addEventListener('click', () => { searchOverlay.classList.add('active'); body.style.overflow = 'hidden'; setTimeout(() => searchInput.focus(), 300); });
    function closeSearch() { searchOverlay.classList.remove('active'); body.style.overflow = ''; searchInput.value = ''; searchClear.style.display = 'none'; showSearchPlaceholder(); }
    searchClose.addEventListener('click', closeSearch);
    searchOverlay.addEventListener('click', e => { if (e.target === searchOverlay) closeSearch(); });
    document.addEventListener('keydown', e => { if (e.key === 'Escape' && searchOverlay && searchOverlay.classList.contains('active')) closeSearch(); });
    let dt;
    searchInput.addEventListener('input', () => {
        const q = searchInput.value.trim();
        if (q.length > 0) { searchClear.style.display = 'flex'; } else { searchClear.style.display = 'none'; showSearchPlaceholder(); return; }
        clearTimeout(dt); dt = setTimeout(() => performSearch(q), 200);
    });
    searchClear.addEventListener('click', () => { searchInput.value = ''; searchClear.style.display = 'none'; showSearchPlaceholder(); searchInput.focus(); });
}

function showSearchPlaceholder() {
    if (!searchResults) return;
    searchResults.innerHTML = `<div class="search-placeholder"><i class="fa-solid fa-magnifying-glass"></i><p>输入关键词开始搜索</p><p class="search-hint">支持搜索标题、内容、姓名等</p></div>`;
}

function performSearch(query) {
    if (!searchResults) return;
    const results = [];
    if (newsData && newsData.length) newsData.forEach(item => { const s = calculateScore(query, item.title, item.excerpt || '', item.content || ''); if (s > 0) results.push({ type: 'news', typeLabel: i18n[currentLang].search_type_news, title: item.title, excerpt: item.excerpt || item.content || '', date: item.date, link: `detail.html?type=news&id=${item.id}`, score: s }); });
    if (competitionsData && competitionsData.length) competitionsData.forEach(item => { const s = calculateScore(query, item.title, item.excerpt || '', item.content || ''); if (s > 0) results.push({ type: 'competition', typeLabel: i18n[currentLang].search_type_competition, title: item.title, excerpt: item.excerpt || item.content || '', date: item.date, link: `detail.html?type=competition&id=${item.id}`, score: s }); });
    if (membersData && membersData.length) membersData.forEach(m => { const s = calculateScore(query, m.name, m.role, m.description); if (s > 0) results.push({ type: 'member', typeLabel: i18n[currentLang].search_type_member, title: `${m.name} - ${m.role}`, excerpt: m.description || '', date: '', link: 'members.html', score: s }); });
    if (currentDisplayData && currentDisplayData.length) currentDisplayData.forEach(p => { const s = calculateScore(query, p['姓名'], String(p['当前积分'] || ''), ''); if (s > 0) results.push({ type: 'ranking', typeLabel: i18n[currentLang].search_type_ranking, title: `${p['姓名']} - ${p['当前积分']}分`, excerpt: `排名：${p.rank || '-'} | 胜率：${p['胜率'] || '0%'}`, date: '', link: 'ranking.html', score: s }); });
    results.sort((a, b) => b.score - a.score);
    if (!results.length) { searchResults.innerHTML = `<div class="search-no-results"><i class="fa-solid fa-face-frown"></i><p>${i18n[currentLang].search_no_results}</p></div>`; return; }
    searchResults.innerHTML = `<div class="search-result-list">${results.map(r => `<div class="search-result-item" onclick="window.location.href='${r.link}'"><span class="search-result-type ${r.type}">${r.typeLabel}</span><div class="search-result-title">${highlightMatch(r.title, query)}</div><div class="search-result-excerpt">${highlightMatch(r.excerpt.substring(0, 100), query)}</div>${r.date ? `<div style="font-size:0.7rem;color:var(--text-muted);margin-top:4px;">${r.date}</div>` : ''}</div>`).join('')}</div>`;
}

function calculateScore(query, ...texts) {
    const q = query.toLowerCase(); let score = 0;
    texts.forEach((text, idx) => { if (!text) return; const t = text.toLowerCase(); if (t === q) score += 100; const w = idx === 0 ? 3 : 1; if (t.includes(q)) score += 20 * w; const chars = q.split(''); let mc = 0; chars.forEach(c => { if (t.includes(c)) mc++; }); score += (mc / chars.length) * 10 * w; });
    return Math.round(score);
}

function highlightMatch(text, query) {
    if (!text || !query) return text || '';
    return text.replace(new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi'), '<strong style="color:var(--primary-blue);background:var(--primary-pale);padding:0 2px;border-radius:2px;">$1</strong>');
}

if (hamburger && navMenu) {
    hamburger.addEventListener('click', () => { hamburger.classList.toggle('active'); navMenu.classList.toggle('active'); });
    navMenu.querySelectorAll('.nav-link').forEach(l => l.addEventListener('click', e => { if (!l.classList.contains('dropdown-toggle')) { hamburger.classList.remove('active'); navMenu.classList.remove('active'); } }));
    document.addEventListener('click', e => { if (!hamburger.contains(e.target) && !navMenu.contains(e.target)) { hamburger.classList.remove('active'); navMenu.classList.remove('active'); } });
}

const dropdownToggle = document.getElementById('moreDropdown');
const dropdownMenu = document.getElementById('dropdownMenu');
if (dropdownToggle && dropdownMenu) {
    dropdownToggle.addEventListener('click', e => { e.preventDefault(); e.stopPropagation(); dropdownToggle.classList.toggle('active'); dropdownMenu.classList.toggle('active'); });
    dropdownMenu.querySelectorAll('.dropdown-link').forEach(l => l.addEventListener('click', () => { dropdownToggle.classList.remove('active'); dropdownMenu.classList.remove('active'); }));
    document.addEventListener('click', e => { if (!dropdownToggle.contains(e.target) && !dropdownMenu.contains(e.target)) { dropdownToggle.classList.remove('active'); dropdownMenu.classList.remove('active'); } });
}

window.addEventListener('scroll', () => { if (window.scrollY > 60) navbar.classList.add('scrolled'); else navbar.classList.remove('scrolled'); });

if (themeToggle) {
    const st = localStorage.getItem('wfls-tt-theme');
    if (st === 'dark') { body.classList.add('dark-mode'); themeToggle.innerHTML = '<i class="fa-solid fa-sun"></i>'; }
    themeToggle.addEventListener('click', () => { body.classList.toggle('dark-mode'); const isDark = body.classList.contains('dark-mode'); localStorage.setItem('wfls-tt-theme', isDark ? 'dark' : 'light'); themeToggle.innerHTML = isDark ? '<i class="fa-solid fa-sun"></i>' : '<i class="fa-solid fa-moon"></i>'; });
}

function openModal(m) { if(m) { m.classList.add('active'); body.style.overflow = 'hidden'; } }
function closeModal(m) { if(m) { m.classList.remove('active'); body.style.overflow = ''; } }
if (qrTrigger && modalOverlay) qrTrigger.addEventListener('click', () => openModal(modalOverlay));
if (modalClose && modalOverlay) modalClose.addEventListener('click', () => closeModal(modalOverlay));
if (modalOverlay) modalOverlay.addEventListener('click', e => { if (e.target === modalOverlay) closeModal(modalOverlay); });
if (scoreDetailClose && scoreDetailModal) { scoreDetailClose.addEventListener('click', () => closeModal(scoreDetailModal)); scoreDetailModal.addEventListener('click', e => { if (e.target === scoreDetailModal) closeModal(scoreDetailModal); }); }
document.addEventListener('keydown', e => { if (e.key === 'Escape') { if (modalOverlay && modalOverlay.classList.contains('active')) closeModal(modalOverlay); if (scoreDetailModal && scoreDetailModal.classList.contains('active')) closeModal(scoreDetailModal); } });

let currentScorePlayer = '';
async function loadScoreLogData() { try { scoreLogData = await (await fetch('score-log.json')).json(); } catch(e) { console.warn('score-log.json 加载失败'); scoreLogData = []; } }
async function loadScoreLogForViz() { try { scoreLogData = await (await fetch('score-log.json')).json(); console.log('DataViz: score-log.json OK,', scoreLogData.length, '条'); return true; } catch(e) { console.warn('DataViz: score-log.json 失败'); scoreLogData = []; return true; } }
function showScoreDetail(playerName) { if (!scoreDetailModal || !scoreDetailBody || window.innerWidth < 1200) return; currentScorePlayer = playerName; scoreDetailTitle.textContent = `${playerName} - ${i18n[currentLang].score_detail_title}`; renderScoreDetail(); adjustModalSize(); openModal(scoreDetailModal); }
function adjustModalSize() { if (!scoreDetailModal) return; scoreDetailModal.classList.remove('content-fit'); setTimeout(() => { const tw = scoreDetailModal.querySelector('.score-detail-table-wrapper'); const tb = scoreDetailModal.querySelector('.score-detail-table'); if (tw && tb && tb.scrollWidth <= tw.clientWidth + 2 && tb.scrollHeight <= tw.clientHeight + 2) scoreDetailModal.classList.add('content-fit'); }, 100); }
function renderScoreDetail() { if (!scoreDetailBody) return; let records = scoreLogData.filter(r => r['胜者'] === currentScorePlayer || r['负者'] === currentScorePlayer); records.sort((a, b) => b['日期'].localeCompare(a['日期'])); if (!records.length) { scoreDetailBody.innerHTML = '<tr><td colspan="7" style="text-align:center;padding:20px;">暂无比赛记录</td></tr>'; setTimeout(() => { if (scoreDetailModal) scoreDetailModal.classList.add('content-fit'); }, 100); return; } scoreDetailBody.innerHTML = records.map(r => { const isW = r['胜者'] === currentScorePlayer; const opp = isW ? r['负者'] : r['胜者']; const res = isW ? i18n[currentLang].score_result_win : i18n[currentLang].score_result_loss; const rc = isW ? 'result-win' : 'result-loss'; const sb = isW ? r['胜者赛前积分'] : r['负者赛前积分']; const sc = isW ? r['胜者积分变动'] : r['负者积分变动']; const sa = sb + sc; const cc = sc > 0 ? 'score-change-positive' : 'score-change-negative'; return `<tr><td>${r['日期']}</td><td>${r['类型']}</td><td>${opp}</td><td class="${rc}">${res}</td><td>${sb.toFixed(1)}</td><td class="${cc}">${sc > 0 ? '+' : ''}${sc.toFixed(1)}</td><td>${sa.toFixed(1)}</td></tr>`; }).join(''); setTimeout(adjustModalSize, 150); }
window.addEventListener('resize', () => { if (scoreDetailModal && scoreDetailModal.classList.contains('active')) adjustModalSize(); });

function formatExcerpt(text) { if (!text) return ''; return text.replace(/\n/g, '<br>').replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>'); }
function parseWinRate(s) { return parseFloat((s || '0%').replace('%', '')) || 0; }
function createNewsCard(item) { const tt = i18n[currentLang]['tag_' + item.tag] || item.tag; return `<div class="news-card-date">${item.date}</div><h3>${item.title}</h3><p>${formatExcerpt(item.excerpt)}</p><span class="news-card-tag tag-${item.tag}">${tt}</span>`; }
function createCompetitionCard(item) { const tt = i18n[currentLang]['tag_' + item.tag] || item.tag; return `<div class="competitions-card-date">${item.date}</div><h3>${item.title}</h3><p>${formatExcerpt(item.excerpt)}</p><span class="competitions-card-tag tag-${item.tag}">${tt}</span>`; }

function getPaginatedData(dataArray, page) { return dataArray.slice((page - 1) * ITEMS_PER_PAGE, page * ITEMS_PER_PAGE); }
function getTotalPages(dataArray) { return Math.ceil(dataArray.length / ITEMS_PER_PAGE); }
function renderPagination(containerId, dataArray, currentPage) {
    const container = document.getElementById(containerId); if (!container) return;
    const ep = container.parentElement.querySelector('.pagination'); if (ep) ep.remove();
    const tp = getTotalPages(dataArray); if (tp <= 1) return;
    const pel = document.createElement('div'); pel.className = 'pagination';
    const pb = document.createElement('button'); pb.className = 'pagination-btn'; pb.textContent = i18n[currentLang].pagination_prev; pb.disabled = currentPage <= 1; pb.addEventListener('click', () => { if (containerId === 'newsFullGrid') { newsCurrentPage = currentPage - 1; renderAllNews(); } else { competitionsCurrentPage = currentPage - 1; renderAllCompetitions(); } window.scrollTo({ top: container.offsetTop - 100, behavior: 'smooth' }); }); pel.appendChild(pb);
    for (let i = 1; i <= tp; i++) { const pg = document.createElement('button'); pg.className = 'pagination-btn'; if (i === currentPage) pg.classList.add('active'); pg.textContent = i; pg.addEventListener('click', () => { if (containerId === 'newsFullGrid') { newsCurrentPage = i; renderAllNews(); } else { competitionsCurrentPage = i; renderAllCompetitions(); } window.scrollTo({ top: container.offsetTop - 100, behavior: 'smooth' }); }); pel.appendChild(pg); }
    const nb = document.createElement('button'); nb.className = 'pagination-btn'; nb.textContent = i18n[currentLang].pagination_next; nb.disabled = currentPage >= tp; nb.addEventListener('click', () => { if (containerId === 'newsFullGrid') { newsCurrentPage = currentPage + 1; renderAllNews(); } else { competitionsCurrentPage = currentPage + 1; renderAllCompetitions(); } window.scrollTo({ top: container.offsetTop - 100, behavior: 'smooth' }); }); pel.appendChild(nb);
    const ie = document.createElement('span'); ie.className = 'pagination-info'; ie.textContent = i18n[currentLang].pagination_info.replace('{current}', currentPage).replace('{total}', tp); pel.appendChild(ie);
    container.parentElement.appendChild(pel);
}

async function loadAboutData() { try { aboutData = await (await fetch('about.json')).json(); } catch(e) { aboutData = null; } renderAboutSections(); updateHeroLastUpdated(); }
async function loadMembersData() { try { membersData = await (await fetch('members.json')).json(); } catch(e) { membersData = []; } renderCoreMembers(); renderAllMembersPage(); }
async function loadNewsData() { try { newsData = await (await fetch('news.json')).json(); } catch(e) { newsData = []; } renderAllNews(); checkAllDataLoaded(); }
async function loadCompetitionsData() { try { competitionsData = await (await fetch('competitions.json')).json(); } catch(e) { competitionsData = []; } renderAllCompetitions(); checkAllDataLoaded(); }
function checkAllDataLoaded() { if (newsData && competitionsData) { dataLoaded = true; if (window.location.pathname.includes('detail.html')) updateDetailPage(); } }

function renderAboutSections() {
    if (!aboutData) return;
    const hc = document.getElementById('historyContent'); if (hc && aboutData.history) hc.innerHTML = `<p>${formatExcerpt(aboutData.history.content)}</p>`;
    const pc = document.getElementById('philosophyContent'); if (pc && aboutData.philosophy) pc.innerHTML = `<p>${formatExcerpt(aboutData.philosophy.content)}</p>`;
    const ac = document.getElementById('activitiesContent'); if (ac && aboutData.activities) ac.innerHTML = `<p>${formatExcerpt(aboutData.activities.content)}</p>`;
    updateHeroLastUpdated();
}

function renderCoreMembers() { document.querySelectorAll('#coreMembersGrid').forEach(g => { if (!g) return; g.innerHTML = ''; membersData.forEach(m => { const el = document.createElement('div'); el.className = 'member-card glass-card'; el.innerHTML = `<div class="member-avatar">${m.name.charAt(0)}</div><h3>${m.name}</h3><span class="member-role">${m.role}</span><p class="member-desc">${formatExcerpt(m.description)}</p>`; g.appendChild(el); }); }); }
function renderAllMembersPage() { const g = document.getElementById('allMembersGrid'); if (!g) return; g.innerHTML = ''; membersData.forEach(m => { const el = document.createElement('div'); el.className = 'member-card glass-card'; el.innerHTML = `<div class="member-avatar">${m.name.charAt(0)}</div><h3>${m.name}</h3><span class="member-role">${m.role}</span><p class="member-desc">${formatExcerpt(m.description)}</p>`; g.appendChild(el); }); }
function renderAllNews() { const pg = document.getElementById('newsPreviewGrid'); if (pg) { pg.innerHTML = ''; newsData.slice(0, 3).forEach(item => { const c = document.createElement('div'); c.className = 'news-card'; c.innerHTML = createNewsCard(item); c.addEventListener('click', () => window.location.href = `detail.html?type=news&id=${item.id}`); pg.appendChild(c); }); } const fg = document.getElementById('newsFullGrid'); if (fg) { fg.innerHTML = ''; getPaginatedData(newsData, newsCurrentPage).forEach(item => { const c = document.createElement('div'); c.className = 'news-card'; c.innerHTML = createNewsCard(item); c.addEventListener('click', () => window.location.href = `detail.html?type=news&id=${item.id}`); fg.appendChild(c); }); renderPagination('newsFullGrid', newsData, newsCurrentPage); } }
function renderAllCompetitions() { const pg = document.getElementById('competitionsPreviewGrid'); if (pg) { pg.innerHTML = ''; competitionsData.slice(0, 3).forEach(item => { const c = document.createElement('div'); c.className = 'competitions-card'; c.innerHTML = createCompetitionCard(item); c.addEventListener('click', () => window.location.href = `detail.html?type=competition&id=${item.id}`); pg.appendChild(c); }); } const fg = document.getElementById('competitionsFullGrid'); if (fg) { fg.innerHTML = ''; getPaginatedData(competitionsData, competitionsCurrentPage).forEach(item => { const c = document.createElement('div'); c.className = 'competitions-card'; c.innerHTML = createCompetitionCard(item); c.addEventListener('click', () => window.location.href = `detail.html?type=competition&id=${item.id}`); fg.appendChild(c); }); renderPagination('competitionsFullGrid', competitionsData, competitionsCurrentPage); } }

function updateDetailPage() {
    const params = new URLSearchParams(window.location.search); const type = params.get('type'); const id = params.get('id');
    if (!type || !id) return; const da = type === 'news' ? newsData : competitionsData;
    if (!da || !da.length) { setTimeout(() => updateDetailPage(), 200); return; }
    const item = da.find(d => d.id == id);
    if (!item) { document.getElementById('detailTitle').textContent = '未找到内容'; document.getElementById('detailDate').textContent = ''; document.getElementById('detailContent').innerHTML = '<p>请求的内容不存在或已被移除。</p>'; document.getElementById('detailMedia').innerHTML = ''; return; }
    document.getElementById('detailTypeTag').textContent = i18n[currentLang][type === 'news' ? 'news_hero_tag' : 'comp_hero_tag'];
    document.getElementById('detailTitle').textContent = item.title; document.getElementById('detailDate').textContent = item.date;
    document.getElementById('detailContent').innerHTML = formatExcerpt(item.content || item.excerpt || '');
    const mc = document.getElementById('detailMedia'); mc.innerHTML = '';
    if (item.media && Array.isArray(item.media) && item.media.length) { item.media.forEach(m => { if (!m || !m.type || !m.src) return; const mi = document.createElement('div'); mi.className = 'media-item'; if (m.type === 'image') { const img = document.createElement('img'); img.src = m.src; img.alt = m.alt || '图片'; img.loading = 'lazy'; img.onerror = () => { img.style.display = 'none'; mi.innerHTML = '<p style="padding:20px;text-align:center;color:var(--text-muted);">图片加载失败</p>'; }; mi.appendChild(img); } else if (m.type === 'video') { const v = document.createElement('video'); v.src = m.src; v.controls = true; v.playsInline = true; v.preload = 'metadata'; v.style.width = '100%'; v.onerror = () => { v.style.display = 'none'; mi.innerHTML = '<p style="padding:20px;text-align:center;color:var(--text-muted);">视频加载失败</p>'; }; mi.appendChild(v); } else if (m.type === 'file') { const a = document.createElement('a'); a.href = m.src; a.className = 'file-link'; a.download = ''; a.innerHTML = `<i class="fa-solid fa-download"></i> ${m.name || '下载文件'}`; mi.appendChild(a); } mc.appendChild(mi); }); }
}

function initPdfViewer() { const btn = document.getElementById('pdfViewBtn'); const ctr = document.getElementById('pdfPreviewContainer'); const ph = document.getElementById('pdfPlaceholder'); const vw = document.getElementById('pdfViewer'); if (!btn) return; let loaded = false; btn.addEventListener('click', () => { if (!loaded) { btn.disabled = true; btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Loading...'; vw.src = vw.getAttribute('data-src'); loaded = true; vw.onload = () => { btn.innerHTML = `<i class="fa-solid fa-eye-slash"></i> ${i18n[currentLang].pdf_preview_btn}`; btn.disabled = false; }; setTimeout(() => { if (btn.disabled) { btn.innerHTML = `<i class="fa-solid fa-eye-slash"></i> ${i18n[currentLang].pdf_preview_btn}`; btn.disabled = false; } }, 10000); } if (ctr.style.display === 'none' || !ctr.style.display) { ctr.style.display = 'block'; ph.style.display = 'none'; } else { ctr.style.display = 'none'; ph.style.display = 'flex'; } }); }

async function loadRankingData() { const tb = document.getElementById('rankingFullBody'); if (!tb) return; try { const r = await fetch('ranking.json'); if (!r.ok) throw new Error('fail'); rankingTimeline = await r.json(); rankingTimeline.sort((a, b) => b.time.localeCompare(a.time)); currentTimeIndex = 0; currentSortKey = '当前积分'; currentSortDir = 'desc'; renderTimeNodeList(); updateRankingDisplay(); setupSortListeners(); } catch(e) { console.error('排名加载失败', e); tb.innerHTML = '<tr><td colspan="7" style="text-align:center;padding:40px;color:var(--accent-red);">无法加载排名数据</td></tr>'; } }
async function loadRankingDataForViz() { try { const r = await fetch('ranking.json'); if (!r.ok) throw new Error('fail'); rankingTimeline = await r.json(); rankingTimeline.sort((a, b) => b.time.localeCompare(a.time)); console.log('DataViz: ranking.json OK,', rankingTimeline.length, '个时间节点'); return true; } catch(e) { console.error('DataViz: ranking.json 失败', e); rankingTimeline = []; return false; } }

function renderTimeNodeList() { const list = document.getElementById('timeNodeList'); const lbl = document.getElementById('currentTimeLabel'); if (!list || !rankingTimeline.length) return; list.innerHTML = ''; rankingTimeline.forEach((n, i) => { const li = document.createElement('li'); li.className = 'time-node-item'; if (i === currentTimeIndex) li.classList.add('active'); li.innerHTML = `<span class="node-dot"></span>${n.label}<span class="node-count">${n.data.length}人</span>`; li.addEventListener('click', () => { currentTimeIndex = i; currentSortKey = '当前积分'; currentSortDir = 'desc'; updateRankingDisplay(); renderTimeNodeList(); }); list.appendChild(li); }); if (lbl && rankingTimeline[currentTimeIndex]) lbl.textContent = rankingTimeline[currentTimeIndex].label; }
function calculateRankChanges(cd, pd) { if (!pd) return cd.map((p, i) => ({ ...p, rank: i + 1, change: 0, changeType: 'new', pointsChange: 0, pointsChangeType: 'new' })); const prm = {}; const ppm = {}; pd.forEach((p, i) => { prm[p['姓名']] = i + 1; ppm[p['姓名']] = p['当前积分'] || 0; }); return cd.map((p, i) => { const cr = i + 1; const pr = prm[p['姓名']]; const pp = ppm[p['姓名']]; const cp = p['当前积分'] || 0; let ch = 0, ct = 'new'; if (pr === undefined) ct = 'new'; else { ch = pr - cr; if (ch > 0) ct = 'up'; else if (ch < 0) ct = 'down'; else ct = 'same'; } let pc = 0, pct = 'new'; if (pp === undefined) pct = 'new'; else { pc = cp - pp; if (pc > 0) pct = 'up'; else if (pc < 0) pct = 'down'; else pct = 'same'; } return { ...p, rank: cr, change: ch, changeType: ct, pointsChange: pc, pointsChangeType: pct }; }); }
function updateRankingDisplay() { if (!rankingTimeline.length || !rankingTimeline[currentTimeIndex]) return; const cd = rankingTimeline[currentTimeIndex].data; const pd = currentTimeIndex < rankingTimeline.length - 1 ? rankingTimeline[currentTimeIndex + 1].data : null; currentDisplayData = calculateRankChanges(cd, pd); currentDisplayData = sortDisplayData(currentSortKey, currentSortDir); renderRankingTable(currentDisplayData); const ind = document.getElementById('sortIndicator'); if (ind) ind.textContent = `${currentSortKey}${currentSortDir === 'desc' ? '降序' : '升序'}`; updateSortHeaderHighlight(); const lbl = document.getElementById('currentTimeLabel'); if (lbl) lbl.textContent = rankingTimeline[currentTimeIndex].label; }
function sortDisplayData(key, dir) { return [...currentDisplayData].sort((a, b) => { let va, vb; if (key === '胜率') { va = parseWinRate(a['胜率']); vb = parseWinRate(b['胜率']); } else if (key === '姓名') return dir === 'asc' ? (a['姓名']||'').localeCompare(b['姓名']||'', 'zh') : (b['姓名']||'').localeCompare(a['姓名']||'', 'zh'); else if (key === 'rank') { va = a.rank || 0; vb = b.rank || 0; } else if (key === '变化') { va = a.change || 0; vb = b.change || 0; } else if (key === '积分变化') { va = a.pointsChange || 0; vb = b.pointsChange || 0; } else { va = a[key] || 0; vb = b[key] || 0; } return va < vb ? (dir === 'asc' ? -1 : 1) : va > vb ? (dir === 'asc' ? 1 : -1) : 0; }); }
function renderRankingTable(data) { const tb = document.getElementById('rankingFullBody'); if (!tb) return; if (!data || !data.length) { tb.innerHTML = '<tr><td colspan="7" style="text-align:center;padding:40px;">暂无排名数据</td></tr>'; return; } tb.innerHTML = ''; data.forEach((p, i) => { const tr = document.createElement('tr'); const wr = p['胜率'] || '0%'; const wd = wr === '#DIV/0!' || wr === '-' ? '0%' : wr; let ch = '', pch = ''; if (p.changeType === 'up') ch = `<span class="rank-change rank-up">▲${p.change}</span>`; else if (p.changeType === 'down') ch = `<span class="rank-change rank-down">▼${p.change}</span>`; else if (p.changeType === 'new') ch = '<span class="rank-new">NEW</span>'; else ch = '<span class="rank-same">-</span>'; if (p.pointsChangeType === 'up') pch = `<span class="rank-change rank-up">▲${p.pointsChange.toFixed(1)}</span>`; else if (p.pointsChangeType === 'down') pch = `<span class="rank-change rank-down">▼${Math.abs(p.pointsChange).toFixed(1)}</span>`; else if (p.pointsChangeType === 'new') pch = '<span class="rank-new">NEW</span>'; else pch = '<span class="rank-same">-</span>'; const pn = p['姓名'] || '-'; const nc = (window.innerWidth >= 1200 && scoreLogData.length > 0) ? `<span class="player-name-link" onclick="showScoreDetail('${pn}')" title="点击查看积分明细">${pn}</span>` : pn; tr.innerHTML = `<td>${i + 1}</td><td>${nc}</td><td><strong>${p['当前积分'] || 0}</strong></td><td>${pch}</td><td>${ch}</td><td>${p['总场次'] || 0}</td><td>${wd}</td>`; tb.appendChild(tr); }); }
function updateSortHeaderHighlight() { document.querySelectorAll('.ranking-table-full th.sortable').forEach(th => { th.classList.remove('active-sort'); if (th.getAttribute('data-sort') === currentSortKey) th.classList.add('active-sort'); }); }
function setupSortListeners() { document.querySelectorAll('.ranking-table-full th.sortable').forEach(th => { const nt = th.cloneNode(true); th.parentNode.replaceChild(nt, th); nt.addEventListener('click', () => { const key = nt.getAttribute('data-sort'); currentSortDir = key === currentSortKey ? (currentSortDir === 'desc' ? 'asc' : 'desc') : 'desc'; currentSortKey = key; currentDisplayData = sortDisplayData(key, currentSortDir); renderRankingTable(currentDisplayData); updateSortHeaderHighlight(); document.querySelectorAll('.ranking-table-full th.sortable').forEach(h => { const a = h.querySelector('.sort-arrow'); if (a) a.innerHTML = ''; }); const ar = nt.querySelector('.sort-arrow'); if (ar) ar.innerHTML = currentSortDir === 'desc' ? '&#9660;' : '&#9650;'; nt.classList.add('active-sort'); document.getElementById('sortIndicator').textContent = `${key}${currentSortDir === 'desc' ? '降序' : '升序'}`; }); }); }

function updateSideNavHighlight() { const links = document.querySelectorAll('.side-nav-link'); const pos = window.scrollY + 150; let cur = 'home'; [{ id: 'home', s: '#home' },{ id: 'history', s: '#history' },{ id: 'philosophy', s: '#philosophy' },{ id: 'activities', s: '#activities' },{ id: 'core-members', s: '#core-members' },{ id: 'news', s: '#news' },{ id: 'competitions', s: '#competitions' }].forEach(sec => { const el = document.querySelector(sec.s); if (el && pos >= el.offsetTop && pos < el.offsetTop + el.offsetHeight) cur = sec.id; }); links.forEach(l => { l.classList.remove('active'); if (l.getAttribute('data-section') === cur) l.classList.add('active'); }); }
function highlightNavByPath() { const cp = window.location.pathname.split('/').pop() || 'index.html'; const anl = document.querySelectorAll('.nav-link:not(.dropdown-toggle)'); const dl = document.querySelectorAll('.dropdown-link'); anl.forEach(l => l.classList.remove('active')); dl.forEach(l => l.classList.remove('active')); const dt = document.getElementById('moreDropdown'); if (dt) dt.classList.remove('active'); anl.forEach(link => { const h = link.getAttribute('href'); if (!h) return; if (h === cp || (cp === '' && h === 'index.html') || (cp === 'index.html' && h === 'index.html') || (cp === 'contact.html' && h === 'contact.html')) link.classList.add('active'); }); if (cp === 'ranking.html' || cp === 'members.html' || cp === 'data_viz.html') { if (dt) dt.classList.add('active'); dl.forEach(link => { if (link.getAttribute('href') === cp) link.classList.add('active'); }); } }

function initDataViz() {
    if (!document.getElementById('pointsTrendChart')) return;
    console.log('DataViz: 开始初始化, rankingTimeline长度=', rankingTimeline.length, 'scoreLogData长度=', scoreLogData.length);
    const players = getAllPlayers();
    if (!players.length) { console.warn('DataViz: 无球员数据'); return; }
    renderPlayerCheckboxes(); renderCompareSelects();
    const defPlayers = players.slice(0, Math.min(5, players.length));
    renderPointsTrend(defPlayers); renderRankStream(Math.min(10, players.length));
    document.getElementById('applyPointsTrend')?.addEventListener('click', () => { const sel = getSelectedPlayers(); if (!sel.length) { alert('请至少选择一名球员'); return; } if (sel.length > 8) { alert('最多选择8名球员'); return; } renderPointsTrend(sel); });
    document.getElementById('topNSelect')?.addEventListener('change', e => renderRankStream(parseInt(e.target.value)));
    document.getElementById('applyCompare')?.addEventListener('click', () => { const pa = document.getElementById('playerASelect')?.value; const pb = document.getElementById('playerBSelect')?.value; if (!pa || !pb) { alert('请选择两名球员'); return; } if (pa === pb) { alert('请选择不同的球员'); return; } renderComparison(pa, pb); });
}
function getAllPlayers() { if (!rankingTimeline.length || !rankingTimeline[0]) return []; return rankingTimeline[0].data.map(p => p['姓名']); }
function getSelectedPlayers() { return Array.from(document.querySelectorAll('#playerCheckboxList input[type="checkbox"]:checked')).map(cb => cb.value); }
function renderPlayerCheckboxes() { const container = document.getElementById('playerCheckboxList'); if (!container) return; const players = getAllPlayers(); const cd = rankingTimeline[0]?.data || []; container.innerHTML = players.map((name, i) => { const checked = i < 5 ? 'checked' : ''; const p = cd.find(x => x['姓名'] === name); const pts = p ? p['当前积分'] : '-'; return `<label class="player-checkbox-item ${i < 5 ? 'checked' : ''}"><input type="checkbox" value="${name}" ${checked}><span>${name}</span><span class="player-rank">${pts}</span></label>`; }).join(''); container.querySelectorAll('.player-checkbox-item').forEach(item => { item.addEventListener('click', e => { if (e.target.tagName === 'INPUT') return; const cb = item.querySelector('input'); cb.checked = !cb.checked; item.classList.toggle('checked', cb.checked); }); }); }
function renderCompareSelects() { const players = getAllPlayers(); const opts = players.map(p => `<option value="${p}">${p}</option>`).join(''); const sa = document.getElementById('playerASelect'); const sb = document.getElementById('playerBSelect'); if (sa) sa.innerHTML = '<option value="">-- 选择球员 --</option>' + opts; if (sb) sb.innerHTML = '<option value="">-- 选择球员 --</option>' + opts; }
function renderPointsTrend(playerNames) { const canvas = document.getElementById('pointsTrendChart'); if (!canvas || !rankingTimeline.length) return; if (pointsTrendChart) { pointsTrendChart.destroy(); pointsTrendChart = null; } const labels = rankingTimeline.map(t => t.label).reverse(); const datasets = playerNames.map((name, idx) => { const data = []; for (let i = rankingTimeline.length - 1; i >= 0; i--) { const p = rankingTimeline[i].data.find(x => x['姓名'] === name); data.push(p ? p['当前积分'] : null); } return { label: name, data, borderColor: CHART_COLORS[idx % CHART_COLORS.length], backgroundColor: CHART_COLORS[idx % CHART_COLORS.length] + '20', borderWidth: 2.5, pointRadius: 4, pointHoverRadius: 7, tension: 0.3, fill: false, spanGaps: true }; }); try { pointsTrendChart = new Chart(canvas, { type: 'line', data: { labels, datasets }, options: { responsive: true, maintainAspectRatio: false, interaction: { intersect: false, mode: 'index' }, plugins: { legend: { position: 'bottom', labels: { usePointStyle: true, padding: 20, font: { size: 12, family: "'Poppins', sans-serif" } } }, tooltip: { backgroundColor: 'rgba(26,29,40,0.9)', titleFont: { size: 13 }, bodyFont: { size: 12 }, padding: 12, cornerRadius: 8 } }, scales: { x: { grid: { color: 'rgba(0,0,0,0.04)' }, ticks: { font: { size: 11 } } }, y: { beginAtZero: false, grid: { color: 'rgba(0,0,0,0.04)' }, ticks: { font: { size: 11 } }, title: { display: true, text: currentLang === 'zh' ? '积分' : 'Points', font: { size: 12 } } } } } }); } catch(err) { console.error('DataViz: 积分趋势图失败', err); } }
function renderRankStream(topN) { const canvas = document.getElementById('rankStreamChart'); if (!canvas || !rankingTimeline.length) return; if (rankStreamChart) { rankStreamChart.destroy(); rankStreamChart = null; } const labels = rankingTimeline.map(t => t.label).reverse(); const topPlayers = (rankingTimeline[0]?.data || []).slice(0, topN).map(p => p['姓名']); const datasets = topPlayers.map((name, idx) => { const data = []; for (let i = rankingTimeline.length - 1; i >= 0; i--) { const ri = rankingTimeline[i].data.findIndex(x => x['姓名'] === name); data.push(ri >= 0 ? ri + 1 : null); } return { label: name, data, borderColor: CHART_COLORS[idx % CHART_COLORS.length], backgroundColor: CHART_COLORS[idx % CHART_COLORS.length] + '40', borderWidth: 2, pointRadius: 3, pointHoverRadius: 6, tension: 0.3, fill: true, spanGaps: true }; }); try { rankStreamChart = new Chart(canvas, { type: 'line', data: { labels, datasets }, options: { responsive: true, maintainAspectRatio: false, interaction: { intersect: false, mode: 'index' }, plugins: { legend: { position: 'bottom', labels: { usePointStyle: true, padding: 16, font: { size: 11, family: "'Poppins', sans-serif" } } }, tooltip: { backgroundColor: 'rgba(26,29,40,0.9)', titleFont: { size: 13 }, bodyFont: { size: 12 }, padding: 12, cornerRadius: 8, callbacks: { label: ctx => `${ctx.dataset.label}: 第${ctx.raw}名` } } }, scales: { x: { grid: { color: 'rgba(0,0,0,0.04)' }, ticks: { font: { size: 11 } } }, y: { reverse: true, min: 1, max: topN, grid: { color: 'rgba(0,0,0,0.04)' }, ticks: { font: { size: 11 }, stepSize: 1 }, title: { display: true, text: currentLang === 'zh' ? '排名' : 'Rank', font: { size: 12 } } } } } }); } catch(err) { console.error('DataViz: 排名河流图失败', err); } }
function renderComparison(playerA, playerB) { const container = document.getElementById('compareResult'); if (!container) return; const cd = rankingTimeline[0]?.data || []; const ad = cd.find(p => p['姓名'] === playerA); const bd = cd.find(p => p['姓名'] === playerB); const h2h = scoreLogData.filter(r => { const ps = [r['胜者'], r['负者']]; return ps.includes(playerA) && ps.includes(playerB); }); const aW = h2h.filter(r => r['胜者'] === playerA).length; const bW = h2h.filter(r => r['胜者'] === playerB).length; const total = h2h.length; const recent = h2h.length ? h2h[h2h.length - 1] : null; let html = `<div class="compare-summary"><div class="compare-player-col"><div class="compare-player-name">${playerA}</div><div class="compare-player-stat">当前积分: <strong>${ad ? ad['当前积分'] : '-'}</strong></div><div class="compare-player-stat">胜率: <strong>${ad ? ad['胜率'] : '-'}</strong></div></div><div class="compare-divider">VS</div><div class="compare-player-col"><div class="compare-player-name">${playerB}</div><div class="compare-player-stat">当前积分: <strong>${bd ? bd['当前积分'] : '-'}</strong></div><div class="compare-player-stat">胜率: <strong>${bd ? bd['胜率'] : '-'}</strong></div></div></div>`; if (total > 0) { html += `<div style="text-align:center;margin-bottom:16px;"><span style="font-weight:600;">总交手: ${total} 场</span> | <span style="color:#52c41a;">${playerA} ${aW} 胜</span> | <span style="color:#52c41a;">${playerB} ${bW} 胜</span>${recent ? ` | 最近: ${recent['日期']} (胜者: ${recent['胜者']})` : ''}</div><table class="compare-h2h-table"><thead><tr><th>日期</th><th>类型</th><th>胜者</th><th>${playerA} 积分变动</th><th>${playerB} 积分变动</th></tr></thead><tbody>`; h2h.sort((a, b) => b['日期'].localeCompare(a['日期'])).forEach(r => { const aC = r['胜者'] === playerA ? r['胜者积分变动'] : r['负者积分变动']; const bC = r['胜者'] === playerB ? r['胜者积分变动'] : r['负者积分变动']; html += `<tr><td>${r['日期']}</td><td>${r['类型']}</td><td>${r['胜者']}</td><td class="${r['胜者'] === playerA ? 'win-highlight' : 'loss-highlight'}">${aC > 0 ? '+' : ''}${aC.toFixed(1)}</td><td class="${r['胜者'] === playerB ? 'win-highlight' : 'loss-highlight'}">${bC > 0 ? '+' : ''}${bC.toFixed(1)}</td></tr>`; }); html += '</tbody></table>'; } else { html += '<div class="compare-placeholder"><i class="fa-solid fa-circle-info"></i><p>暂无交手记录</p></div>'; } container.innerHTML = html; }

function initPage() {
    loadAboutData(); loadMembersData(); loadNewsData(); loadCompetitionsData();
    const isRanking = !!document.getElementById('rankingFullBody');
    const isDataViz = !!document.getElementById('pointsTrendChart');
    if (isRanking) { loadRankingData(); loadScoreLogData(); }
    if (isDataViz) { Promise.all([loadRankingDataForViz(), loadScoreLogForViz()]).then(() => initDataViz()).catch(err => console.error('DataViz: 初始化失败', err)); }
    initPdfViewer(); initSearch(); highlightNavByPath();
    window.addEventListener('scroll', updateSideNavHighlight); updateSideNavHighlight();
    if (window.location.pathname.includes('detail.html') && (newsData.length > 0 || competitionsData.length > 0)) updateDetailPage();
}

document.querySelectorAll('a[href^="#"]').forEach(a => { a.addEventListener('click', e => { const href = a.getAttribute('href'); if (href === '#') return; const t = document.querySelector(href); if (t) { e.preventDefault(); t.scrollIntoView({ behavior:'smooth' }); } }); });
window.addEventListener('DOMContentLoaded', highlightNavByPath);
window.addEventListener('popstate', highlightNavByPath);
initPage();