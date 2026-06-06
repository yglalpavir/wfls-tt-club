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
        rank_col_change: "变化",
        rank_col_matches: "总场次",
        rank_col_winrate: "胜率",
        score_detail_title: "积分明细",
        score_filter_all: "全部",
        score_filter_normal: "普通",
        score_filter_team: "校乒赛团体",
        score_filter_single: "校乒赛单打",
        score_filter_league: "校乒联赛",
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
        search_type_ranking: "排名"
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
        rank_col_change: "Change",
        rank_col_matches: "Matches",
        rank_col_winrate: "Win Rate",
        score_detail_title: "Score Details",
        score_filter_all: "All",
        score_filter_normal: "Normal",
        score_filter_team: "Team",
        score_filter_single: "Single",
        score_filter_league: "League",
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
        search_type_ranking: "Ranking"
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

// ---------- DOM ----------
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
const scoreDetailFilters = document.getElementById('scoreDetailFilters');
const body = document.body;

// ---------- 语言切换 ----------
function setLanguage(lang) {
    currentLang = lang;
    localStorage.setItem('wfls-lang', lang);
    document.querySelectorAll('[data-i18n]').forEach(el => {
        const key = el.getAttribute('data-i18n');
        if (i18n[lang] && i18n[lang][key]) {
            el.innerHTML = i18n[lang][key];
        }
    });
    if (langToggle) {
        langToggle.querySelector('span').textContent = lang === 'zh' ? 'EN' : '中文';
    }
    if (searchInput) {
        searchInput.placeholder = i18n[lang].search_placeholder;
    }
    renderAllNews();
    renderAllCompetitions();
    if (aboutData) { renderAboutSections(); }
    if (membersData.length > 0) { renderCoreMembers(); renderAllMembersPage(); }
    updateRankingHeaders();
    updatePdfButtons();
    if (dataLoaded) updateDetailPage();
}

function updateRankingHeaders() {
    document.querySelectorAll('.ranking-table-full th[data-i18n]').forEach(th => {
        const key = th.getAttribute('data-i18n');
        if (i18n[currentLang] && i18n[currentLang][key]) {
            th.innerHTML = i18n[currentLang][key] + ' <span class="sort-arrow"></span>';
        }
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
    langToggle.addEventListener('click', () => {
        setLanguage(currentLang === 'zh' ? 'en' : 'zh');
    });
}

// ---------- 搜索功能 ----------
function initSearch() {
    if (!searchToggle || !searchOverlay || !searchInput) return;

    searchToggle.addEventListener('click', () => {
        searchOverlay.classList.add('active');
        body.style.overflow = 'hidden';
        setTimeout(() => searchInput.focus(), 300);
    });

    function closeSearch() {
        searchOverlay.classList.remove('active');
        body.style.overflow = '';
        searchInput.value = '';
        searchClear.style.display = 'none';
        showSearchPlaceholder();
    }

    searchClose.addEventListener('click', closeSearch);
    searchOverlay.addEventListener('click', (e) => {
        if (e.target === searchOverlay) closeSearch();
    });

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && searchOverlay && searchOverlay.classList.contains('active')) {
            closeSearch();
        }
    });

    let debounceTimer;
    searchInput.addEventListener('input', () => {
        const query = searchInput.value.trim();
        
        if (query.length > 0) {
            searchClear.style.display = 'flex';
        } else {
            searchClear.style.display = 'none';
            showSearchPlaceholder();
            return;
        }

        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => {
            performSearch(query);
        }, 200);
    });

    searchClear.addEventListener('click', () => {
        searchInput.value = '';
        searchClear.style.display = 'none';
        showSearchPlaceholder();
        searchInput.focus();
    });
}

function showSearchPlaceholder() {
    if (!searchResults) return;
    searchResults.innerHTML = `
        <div class="search-placeholder">
            <i class="fa-solid fa-magnifying-glass"></i>
            <p>输入关键词开始搜索</p>
            <p class="search-hint">支持搜索标题、内容、姓名等</p>
        </div>
    `;
}

function performSearch(query) {
    if (!searchResults) return;
    
    const results = [];

    if (newsData && newsData.length > 0) {
        newsData.forEach(item => {
            const score = calculateScore(query, item.title, item.excerpt || '', item.content || '');
            if (score > 0) {
                results.push({
                    type: 'news',
                    typeLabel: i18n[currentLang].search_type_news,
                    title: item.title,
                    excerpt: item.excerpt || item.content || '',
                    date: item.date,
                    link: `detail.html?type=news&id=${item.id}`,
                    score: score
                });
            }
        });
    }

    if (competitionsData && competitionsData.length > 0) {
        competitionsData.forEach(item => {
            const score = calculateScore(query, item.title, item.excerpt || '', item.content || '');
            if (score > 0) {
                results.push({
                    type: 'competition',
                    typeLabel: i18n[currentLang].search_type_competition,
                    title: item.title,
                    excerpt: item.excerpt || item.content || '',
                    date: item.date,
                    link: `detail.html?type=competition&id=${item.id}`,
                    score: score
                });
            }
        });
    }

    if (membersData && membersData.length > 0) {
        membersData.forEach(member => {
            const score = calculateScore(query, member.name, member.role, member.description);
            if (score > 0) {
                results.push({
                    type: 'member',
                    typeLabel: i18n[currentLang].search_type_member,
                    title: `${member.name} - ${member.role}`,
                    excerpt: member.description || '',
                    date: '',
                    link: 'members.html',
                    score: score
                });
            }
        });
    }

    if (currentDisplayData && currentDisplayData.length > 0) {
        currentDisplayData.forEach(player => {
            const score = calculateScore(query, player['姓名'], String(player['当前积分'] || ''), '');
            if (score > 0) {
                results.push({
                    type: 'ranking',
                    typeLabel: i18n[currentLang].search_type_ranking,
                    title: `${player['姓名']} - ${player['当前积分']}分`,
                    excerpt: `排名：${player.rank || '-'} | 胜率：${player['胜率'] || '0%'}`,
                    date: '',
                    link: 'ranking.html',
                    score: score                });
            }
        });
    }

    results.sort((a, b) => b.score - a.score);

    if (results.length === 0) {
        searchResults.innerHTML = `
            <div class="search-no-results">
                <i class="fa-solid fa-face-frown"></i>
                <p>${i18n[currentLang].search_no_results}</p>
            </div>
        `;
        return;
    }

    const html = results.map(r => `
        <div class="search-result-item" onclick="window.location.href='${r.link}'">
            <span class="search-result-type ${r.type}">${r.typeLabel}</span>
            <div class="search-result-title">${highlightMatch(r.title, query)}</div>
            <div class="search-result-excerpt">${highlightMatch(r.excerpt.substring(0, 100), query)}</div>
            ${r.date ? `<div style="font-size:0.7rem;color:var(--text-muted);margin-top:4px;">${r.date}</div>` : ''}
        </div>
    `).join('');

    searchResults.innerHTML = `<div class="search-result-list">${html}</div>`;
}

function calculateScore(query, ...texts) {
    const q = query.toLowerCase();
    let score = 0;
    
    texts.forEach((text, index) => {
        if (!text) return;
        const t = text.toLowerCase();
        
        if (t === q) score += 100;
        
        const weight = index === 0 ? 3 : 1;
        
        if (t.includes(q)) score += 20 * weight;
        
        const queryChars = q.split('');
        let matchCount = 0;
        queryChars.forEach(char => {
            if (t.includes(char)) matchCount++;
        });
        score += (matchCount / queryChars.length) * 10 * weight;
    });
    
    return Math.round(score);
}

function highlightMatch(text, query) {
    if (!text || !query) return text || '';
    const regex = new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
    return text.replace(regex, '<strong style="color:var(--primary-blue);background:var(--primary-pale);padding:0 2px;border-radius:2px;">$1</strong>');
}

// ---------- 移动菜单 ----------
if (hamburger && navMenu) {
    hamburger.addEventListener('click', () => {
        hamburger.classList.toggle('active');
        navMenu.classList.toggle('active');
    });
    navMenu.querySelectorAll('.nav-link').forEach(link => {
        link.addEventListener('click', (e) => {
            if (!link.classList.contains('dropdown-toggle')) {
                hamburger.classList.remove('active');
                navMenu.classList.remove('active');
            }
        });
    });
    document.addEventListener('click', (e) => {
        if (!hamburger.contains(e.target) && !navMenu.contains(e.target)) {
            hamburger.classList.remove('active');
            navMenu.classList.remove('active');
        }
    });
}

// ---------- 下拉菜单 ----------
const dropdownToggle = document.getElementById('moreDropdown');
const dropdownMenu = document.getElementById('dropdownMenu');
if (dropdownToggle && dropdownMenu) {
    dropdownToggle.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        dropdownToggle.classList.toggle('active');
        dropdownMenu.classList.toggle('active');
    });
    dropdownMenu.querySelectorAll('.dropdown-link').forEach(link => {
        link.addEventListener('click', () => {
            dropdownToggle.classList.remove('active');
            dropdownMenu.classList.remove('active');
        });
    });
    document.addEventListener('click', (e) => {
        if (!dropdownToggle.contains(e.target) && !dropdownMenu.contains(e.target)) {
            dropdownToggle.classList.remove('active');
            dropdownMenu.classList.remove('active');
        }
    });
}

// ---------- 滚动效果 ----------
window.addEventListener('scroll', () => {
    if (window.scrollY > 60) navbar.classList.add('scrolled');
    else navbar.classList.remove('scrolled');
});

// ---------- 主题 ----------
if (themeToggle) {
    const savedTheme = localStorage.getItem('wfls-tt-theme');
    if (savedTheme === 'dark') { body.classList.add('dark-mode'); themeToggle.innerHTML = '<i class="fa-solid fa-sun"></i>'; }
    themeToggle.addEventListener('click', () => {
        body.classList.toggle('dark-mode');
        const isDark = body.classList.contains('dark-mode');
        localStorage.setItem('wfls-tt-theme', isDark ? 'dark' : 'light');
        themeToggle.innerHTML = isDark ? '<i class="fa-solid fa-sun"></i>' : '<i class="fa-solid fa-moon"></i>';
    });
}

// ---------- 模态框 ----------
function openModal(m) { if(m) { m.classList.add('active'); body.style.overflow = 'hidden'; } }
function closeModal(m) { if(m) { m.classList.remove('active'); body.style.overflow = ''; } }
if (qrTrigger && modalOverlay) { qrTrigger.addEventListener('click', () => openModal(modalOverlay)); }
if (modalClose && modalOverlay) { modalClose.addEventListener('click', () => closeModal(modalOverlay)); }
if (modalOverlay) { modalOverlay.addEventListener('click', (e) => { if (e.target === modalOverlay) closeModal(modalOverlay); }); }

// 积分明细模态框
if (scoreDetailClose && scoreDetailModal) {
    scoreDetailClose.addEventListener('click', () => closeModal(scoreDetailModal));
    scoreDetailModal.addEventListener('click', (e) => { if (e.target === scoreDetailModal) closeModal(scoreDetailModal); });
}

document.addEventListener('keydown', (e) => { 
    if (e.key === 'Escape') {
        if (modalOverlay && modalOverlay.classList.contains('active')) closeModal(modalOverlay);
        if (scoreDetailModal && scoreDetailModal.classList.contains('active')) closeModal(scoreDetailModal);
    }
});

// ---------- 积分明细功能 ----------
let currentScorePlayer = '';
let currentScoreFilter = 'all';

async function loadScoreLogData() {
    try { scoreLogData = await (await fetch('score-log.json')).json(); }
    catch(e) { console.warn('score-log.json 加载失败'); scoreLogData = []; }
}

function showScoreDetail(playerName) {
    if (!scoreDetailModal || !scoreDetailBody) return;
    
    // 屏幕宽度小于1200px不显示
    if (window.innerWidth < 1200) return;
    
    currentScorePlayer = playerName;
    currentScoreFilter = 'all';
    
    scoreDetailTitle.textContent = `${playerName} - ${i18n[currentLang].score_detail_title}`;
    
    const filterBtns = scoreDetailFilters.querySelectorAll('.filter-btn');
    filterBtns.forEach(btn => btn.classList.remove('active'));
    const allBtn = scoreDetailFilters.querySelector('[data-filter="all"]');
    if (allBtn) allBtn.classList.add('active');
    
    renderScoreDetail();
    adjustModalSize();
    
    openModal(scoreDetailModal);
}

function adjustModalSize() {
    if (!scoreDetailModal) return;
    
    scoreDetailModal.classList.remove('content-fit');
    
    setTimeout(() => {
        const tableWrapper = scoreDetailModal.querySelector('.score-detail-table-wrapper');
        const table = scoreDetailModal.querySelector('.score-detail-table');
        
        if (tableWrapper && table) {
            const wrapperWidth = tableWrapper.clientWidth;
            const tableWidth = table.scrollWidth;
            const wrapperHeight = tableWrapper.clientHeight;
            const tableHeight = table.scrollHeight;
            
            if (tableWidth <= wrapperWidth + 2 && tableHeight <= wrapperHeight + 2) {
                scoreDetailModal.classList.add('content-fit');
            }
        }
    }, 100);
}

function renderScoreDetail() {
    if (!scoreDetailBody) return;
    
    let records = scoreLogData.filter(record => 
        (record['胜者'] === currentScorePlayer || record['负者'] === currentScorePlayer)
    );
    
    if (currentScoreFilter !== 'all') {
        records = records.filter(record => record['类型'] === currentScoreFilter);
    }
    
    records.sort((a, b) => b['日期'].localeCompare(a['日期']));
    
    if (records.length === 0) {
        scoreDetailBody.innerHTML = `<tr><td colspan="7" style="text-align:center;padding:20px;">暂无比赛记录</td></tr>`;
        setTimeout(() => {
            if (scoreDetailModal) scoreDetailModal.classList.add('content-fit');
        }, 100);
        return;
    }
    
    scoreDetailBody.innerHTML = records.map(record => {
        const isWinner = record['胜者'] === currentScorePlayer;
        const opponent = isWinner ? record['负者'] : record['胜者'];
        const result = isWinner ? i18n[currentLang].score_result_win : i18n[currentLang].score_result_loss;
        const resultClass = isWinner ? 'result-win' : 'result-loss';
        const scoreBefore = isWinner ? record['胜者赛前积分'] : record['负者赛前积分'];
        const scoreChange = isWinner ? record['胜者积分变动'] : record['负者积分变动'];
        const scoreAfter = scoreBefore + scoreChange;
        const changeClass = scoreChange > 0 ? 'score-change-positive' : 'score-change-negative';
        
        return `
            <tr>
                <td>${record['日期']}</td>
                <td>${record['类型']}</td>
                <td>${opponent}</td>
                <td class="${resultClass}">${result}</td>
                <td>${scoreBefore.toFixed(1)}</td>
                <td class="${changeClass}">${scoreChange > 0 ? '+' : ''}${scoreChange.toFixed(1)}</td>
                <td>${scoreAfter.toFixed(1)}</td>
            </tr>
        `;
    }).join('');
    
    setTimeout(adjustModalSize, 150);
}

if (scoreDetailFilters) {
    scoreDetailFilters.addEventListener('click', (e) => {
        if (e.target.classList.contains('filter-btn')) {
            const filter = e.target.getAttribute('data-filter');
            currentScoreFilter = filter;
            
            scoreDetailFilters.querySelectorAll('.filter-btn').forEach(btn => btn.classList.remove('active'));
            e.target.classList.add('active');
            
            renderScoreDetail();
        }
    });
}

window.addEventListener('resize', () => {
    if (scoreDetailModal && scoreDetailModal.classList.contains('active')) {
        adjustModalSize();
    }
});

// ---------- 辅助函数 ----------
function formatExcerpt(text) { 
    if (!text) return '';
    return text.replace(/\n/g, '<br>').replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>'); 
}

function parseWinRate(s) { return parseFloat((s || '0%').replace('%', '')) || 0; }

function createNewsCard(item) {
    const tagText = i18n[currentLang]['tag_' + item.tag] || item.tag;
    return `
        <div class="news-card-date">${item.date}</div>
        <h3>${item.title}</h3>
        <p>${formatExcerpt(item.excerpt)}</p>
        <span class="news-card-tag tag-${item.tag}">${tagText}</span>
    `;
}

function createCompetitionCard(item) {
    const tagText = i18n[currentLang]['tag_' + item.tag] || item.tag;
    return `
        <div class="competitions-card-date">${item.date}</div>
        <h3>${item.title}</h3>
        <p>${formatExcerpt(item.excerpt)}</p>
        <span class="competitions-card-tag tag-${item.tag}">${tagText}</span>
    `;
}

// ---------- 加载数据 ----------
async function loadAboutData() {
    try { aboutData = await (await fetch('about.json')).json(); }
    catch(e) { console.warn('about.json error'); aboutData = null; }
    renderAboutSections();
}

async function loadMembersData() {
    try { membersData = await (await fetch('members.json')).json(); }
    catch(e) { console.warn('members.json error'); membersData = []; }
    renderCoreMembers();
    renderAllMembersPage();
}

async function loadNewsData() {
    try { newsData = await (await fetch('news.json')).json(); }
    catch(e) { newsData = []; }
    renderAllNews();
    checkAllDataLoaded();
}

async function loadCompetitionsData() {
    try { competitionsData = await (await fetch('competitions.json')).json(); }
    catch(e) { competitionsData = []; }
    renderAllCompetitions();
    checkAllDataLoaded();
}

function checkAllDataLoaded() {
    if (newsData && competitionsData) {
        dataLoaded = true;
        if (window.location.pathname.includes('detail.html')) {
            updateDetailPage();
        }
    }
}

// ---------- 渲染函数 ----------
function renderAboutSections() {
    if (!aboutData) return;

    const historyContent = document.getElementById('historyContent');
    if (historyContent && aboutData.history) {
        historyContent.innerHTML = `<p>${formatExcerpt(aboutData.history.content)}</p>`;
    }

    const philosophyContent = document.getElementById('philosophyContent');
    if (philosophyContent && aboutData.philosophy) {
        philosophyContent.innerHTML = `<p>${formatExcerpt(aboutData.philosophy.content)}</p>`;
    }

    const activitiesContent = document.getElementById('activitiesContent');
    if (activitiesContent && aboutData.activities) {
        activitiesContent.innerHTML = `<p>${formatExcerpt(aboutData.activities.content)}</p>`;
    }
}

function renderCoreMembers() {
    const grids = document.querySelectorAll('#coreMembersGrid');
    grids.forEach(grid => {
        if (!grid) return;
        grid.innerHTML = '';
        membersData.forEach(m => {
            const el = document.createElement('div'); el.className = 'member-card glass-card';
            el.innerHTML = `<div class="member-avatar">${m.name.charAt(0)}</div><h3>${m.name}</h3><span class="member-role">${m.role}</span><p class="member-desc">${formatExcerpt(m.description)}</p>`;
            grid.appendChild(el);
        });
    });
}

function renderAllMembersPage() {
    const grid = document.getElementById('allMembersGrid');
    if (!grid) return;
    grid.innerHTML = '';
    membersData.forEach(m => {
        const el = document.createElement('div'); el.className = 'member-card glass-card';
        el.innerHTML = `<div class="member-avatar">${m.name.charAt(0)}</div><h3>${m.name}</h3><span class="member-role">${m.role}</span><p class="member-desc">${formatExcerpt(m.description)}</p>`;
        grid.appendChild(el);
    });
}

function renderAllNews() {
    const previewGrid = document.getElementById('newsPreviewGrid');
    if (previewGrid) {
        previewGrid.innerHTML = '';
        newsData.slice(0,3).forEach(item => {
            const card = document.createElement('div'); card.className = 'news-card';
            card.innerHTML = createNewsCard(item);
            card.addEventListener('click', () => window.location.href = `detail.html?type=news&id=${item.id}`);
            previewGrid.appendChild(card);
        });
    }
    const fullGrid = document.getElementById('newsFullGrid');
    if (fullGrid) {
        fullGrid.innerHTML = '';
        newsData.forEach(item => {
            const card = document.createElement('div'); card.className = 'news-card';
            card.innerHTML = createNewsCard(item);
            card.addEventListener('click', () => window.location.href = `detail.html?type=news&id=${item.id}`);
            fullGrid.appendChild(card);
        });
    }
}

function renderAllCompetitions() {
    const previewGrid = document.getElementById('competitionsPreviewGrid');
    if (previewGrid) {
        previewGrid.innerHTML = '';
        competitionsData.slice(0,3).forEach(item => {
            const card = document.createElement('div'); card.className = 'competitions-card';
            card.innerHTML = createCompetitionCard(item);
            card.addEventListener('click', () => window.location.href = `detail.html?type=competition&id=${item.id}`);
            previewGrid.appendChild(card);
        });
    }
    const fullGrid = document.getElementById('competitionsFullGrid');
    if (fullGrid) {
        fullGrid.innerHTML = '';
        competitionsData.forEach(item => {
            const card = document.createElement('div'); card.className = 'competitions-card';
            card.innerHTML = createCompetitionCard(item);
            card.addEventListener('click', () => window.location.href = `detail.html?type=competition&id=${item.id}`);
            fullGrid.appendChild(card);
        });
    }
}

// ---------- 详情页加载 ----------
function updateDetailPage() {
    const params = new URLSearchParams(window.location.search);
    const type = params.get('type');
    const id = params.get('id');
    if (!type || !id) return;
    
    const dataArray = type === 'news' ? newsData : competitionsData;
    if (!dataArray || dataArray.length === 0) {
        setTimeout(() => updateDetailPage(), 200);
        return;
    }
    
    const item = dataArray.find(d => d.id == id);
    if (!item) {
        document.getElementById('detailTitle').textContent = '未找到内容';
        document.getElementById('detailDate').textContent = '';
        document.getElementById('detailContent').innerHTML = '<p>请求的内容不存在或已被移除。</p>';
        document.getElementById('detailMedia').innerHTML = '';
        return;
    }
    
    document.getElementById('detailTypeTag').textContent = i18n[currentLang][type === 'news' ? 'news_hero_tag' : 'comp_hero_tag'];
    document.getElementById('detailTitle').textContent = item.title;
    document.getElementById('detailDate').textContent = item.date;
    
    const content = item.content || item.excerpt || '';
    document.getElementById('detailContent').innerHTML = formatExcerpt(content);
    
    const mediaContainer = document.getElementById('detailMedia');
    mediaContainer.innerHTML = '';
    
    if (item.media && Array.isArray(item.media) && item.media.length > 0) {
        item.media.forEach((m, index) => {
            if (!m || !m.type || !m.src) return;
            
            const mediaItem = document.createElement('div');
            mediaItem.className = 'media-item';
            
            if (m.type === 'image') {
                const img = document.createElement('img');
                img.src = m.src;
                img.alt = m.alt || '图片';
                img.loading = 'lazy';
                img.onerror = () => {
                    img.style.display = 'none';
                    mediaItem.innerHTML = '<p style="padding:20px;text-align:center;color:var(--text-muted);">图片加载失败</p>';
                };
                mediaItem.appendChild(img);
            } else if (m.type === 'video') {
                const video = document.createElement('video');
                video.src = m.src;
                video.controls = true;
                video.playsInline = true;
                video.preload = 'metadata';
                video.style.width = '100%';
                video.onerror = () => {
                    video.style.display = 'none';
                    mediaItem.innerHTML = '<p style="padding:20px;text-align:center;color:var(--text-muted);">视频加载失败</p>';
                };
                mediaItem.appendChild(video);
            } else if (m.type === 'file') {
                const link = document.createElement('a');
                link.href = m.src;
                link.className = 'file-link';
                link.download = '';
                link.innerHTML = `<i class="fa-solid fa-download"></i> ${m.name || '下载文件'}`;
                mediaItem.appendChild(link);
            }
            
            mediaContainer.appendChild(mediaItem);
        });
    }
}

// ---------- PDF ----------
function initPdfViewer() {
    const btn = document.getElementById('pdfViewBtn');
    const container = document.getElementById('pdfPreviewContainer');
    const placeholder = document.getElementById('pdfPlaceholder');
    const viewer = document.getElementById('pdfViewer');
    if (!btn) return;
    let loaded = false;
    btn.addEventListener('click', () => {
        if (!loaded) {
            btn.disabled = true; btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Loading...';
            viewer.src = viewer.getAttribute('data-src'); loaded = true;
            viewer.onload = () => { btn.innerHTML = `<i class="fa-solid fa-eye-slash"></i> ${i18n[currentLang].pdf_preview_btn}`; btn.disabled = false; };
            setTimeout(() => { if (btn.disabled) { btn.innerHTML = `<i class="fa-solid fa-eye-slash"></i> ${i18n[currentLang].pdf_preview_btn}`; btn.disabled = false; } }, 10000);
        }
        if (container.style.display === 'none' || !container.style.display) {
            container.style.display = 'block'; placeholder.style.display = 'none';
        } else {
            container.style.display = 'none'; placeholder.style.display = 'flex';
        }
    });
}

// ==========================================
// 排名系统
// ==========================================
async function loadRankingData() {
    const tbody = document.getElementById('rankingFullBody');
    if (!tbody) return;
    try {
        const response = await fetch('ranking.json');
        if (!response.ok) throw new Error('无法加载排名数据');
        rankingTimeline = await response.json();
        rankingTimeline.sort((a, b) => b.time.localeCompare(a.time));
        currentTimeIndex = 0;
        currentSortKey = '当前积分';
        currentSortDir = 'desc';
        renderTimeNodeList();
        updateRankingDisplay();
        setupSortListeners();
    } catch (error) {
        console.error('加载排名失败:', error);
        tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:40px;color:var(--accent-red);">无法加载排名数据，请确保 ranking.json 文件存在</td></tr>';
    }
}

function renderTimeNodeList() {
    const list = document.getElementById('timeNodeList');
    const label = document.getElementById('currentTimeLabel');
    if (!list || !rankingTimeline.length) return;
    list.innerHTML = '';
    rankingTimeline.forEach((node, index) => {
        const li = document.createElement('li');
        li.className = 'time-node-item';
        if (index === currentTimeIndex) li.classList.add('active');
        li.innerHTML = `<span class="node-dot"></span>${node.label}<span class="node-count">${node.data.length}人</span>`;
        li.addEventListener('click', () => {
            currentTimeIndex = index;
            currentSortKey = '当前积分';
            currentSortDir = 'desc';
            updateRankingDisplay();
            renderTimeNodeList();
        });
        list.appendChild(li);
    });
    if (label && rankingTimeline[currentTimeIndex]) {
        label.textContent = rankingTimeline[currentTimeIndex].label;
    }
}

function calculateRankChanges(currentData, previousData) {
    if (!previousData) {
        return currentData.map((player, index) => ({ ...player, rank: index + 1, change: 0, changeType: 'new' }));
    }
    const prevRankMap = {};
    previousData.forEach((player, index) => { prevRankMap[player['姓名']] = index + 1; });
    return currentData.map((player, index) => {
        const currentRank = index + 1;
        const prevRank = prevRankMap[player['姓名']];
        if (prevRank === undefined) return { ...player, rank: currentRank, change: 0, changeType: 'new' };
        const change = prevRank - currentRank;
        if (change > 0) return { ...player, rank: currentRank, change, changeType: 'up' };
        if (change < 0) return { ...player, rank: currentRank, change: Math.abs(change), changeType: 'down' };
        return { ...player, rank: currentRank, change: 0, changeType: 'same' };
    });
}

function updateRankingDisplay() {
    if (!rankingTimeline.length || !rankingTimeline[currentTimeIndex]) return;
    const currentData = rankingTimeline[currentTimeIndex].data;
    const previousData = currentTimeIndex < rankingTimeline.length - 1 ? rankingTimeline[currentTimeIndex + 1].data : null;
    currentDisplayData = calculateRankChanges(currentData, previousData);
    currentDisplayData = sortDisplayData(currentSortKey, currentSortDir);
    renderRankingTable(currentDisplayData);
    const indicator = document.getElementById('sortIndicator');
    if (indicator) indicator.textContent = `${currentSortKey}${currentSortDir === 'desc' ? '降序' : '升序'}`;
    updateSortHeaderHighlight();
    const label = document.getElementById('currentTimeLabel');
    if (label) label.textContent = rankingTimeline[currentTimeIndex].label;
}

function sortDisplayData(key, dir) {
    return [...currentDisplayData].sort((a, b) => {
        let valA, valB;
        if (key === '胜率') { valA = parseWinRate(a['胜率']); valB = parseWinRate(b['胜率']); }
        else if (key === '姓名') { return dir === 'asc' ? (a['姓名']||'').localeCompare(b['姓名']||'', 'zh') : (b['姓名']||'').localeCompare(a['姓名']||'', 'zh'); }
        else if (key === 'rank') { valA = a.rank || 0; valB = b.rank || 0; }
        else if (key === '变化') { valA = a.change || 0; valB = b.change || 0; }
        else { valA = a[key] || 0; valB = b[key] || 0; }
        if (valA < valB) return dir === 'asc' ? -1 : 1;
        if (valA > valB) return dir === 'asc' ? 1 : -1;
        return 0;
    });
}

function renderRankingTable(data) {
    const tbody = document.getElementById('rankingFullBody');
    if (!tbody) return;
    if (!data || data.length === 0) { tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:40px;">暂无排名数据</td></tr>'; return; }
    tbody.innerHTML = '';
    data.forEach((player, index) => {
        const tr = document.createElement('tr');
        const winRateRaw = player['胜率'] || '0%';
        let winRateDisplay = winRateRaw === '#DIV/0!' || winRateRaw === '-' ? '0%' : winRateRaw;
        let changeHtml = '';
        if (player.changeType === 'up') changeHtml = `<span class="rank-change rank-up">▲${player.change}</span>`;
        else if (player.changeType === 'down') changeHtml = `<span class="rank-change rank-down">▼${player.change}</span>`;
        else if (player.changeType === 'new') changeHtml = `<span class="rank-new">NEW</span>`;
        else changeHtml = `<span class="rank-same">-</span>`;
        
        const playerName = player['姓名'] || '-';
        // 仅在屏幕宽度 >= 1200px 且 scoreLogData 有数据时显示可点击链接
        const nameCell = (window.innerWidth >= 1200 && scoreLogData.length > 0)
            ? `<span class="player-name-link" onclick="showScoreDetail('${playerName}')" title="点击查看积分明细">${playerName}</span>`
            : playerName;
        
        tr.innerHTML = `<td>${index + 1}</td><td>${nameCell}</td><td><strong>${player['当前积分'] || 0}</strong></td><td>${changeHtml}</td><td>${player['总场次'] || 0}</td><td>${winRateDisplay}</td>`;
        tbody.appendChild(tr);
    });
}

function updateSortHeaderHighlight() {
    document.querySelectorAll('.ranking-table-full th.sortable').forEach(th => {
        th.classList.remove('active-sort');
        if (th.getAttribute('data-sort') === currentSortKey) th.classList.add('active-sort');
    });
}

function setupSortListeners() {
    document.querySelectorAll('.ranking-table-full th.sortable').forEach(th => {
        const newTh = th.cloneNode(true);
        th.parentNode.replaceChild(newTh, th);
        newTh.addEventListener('click', () => {
            const key = newTh.getAttribute('data-sort');
            currentSortDir = key === currentSortKey ? (currentSortDir === 'desc' ? 'asc' : 'desc') : 'desc';
            currentSortKey = key;
            currentDisplayData = sortDisplayData(key, currentSortDir);
            renderRankingTable(currentDisplayData);
            updateSortHeaderHighlight();
            document.querySelectorAll('.ranking-table-full th.sortable').forEach(h => { const a = h.querySelector('.sort-arrow'); if (a) a.innerHTML = ''; });
            const arrow = newTh.querySelector('.sort-arrow');
            if (arrow) arrow.innerHTML = currentSortDir === 'desc' ? '&#9660;' : '&#9650;';
            newTh.classList.add('active-sort');
            document.getElementById('sortIndicator').textContent = `${key}${currentSortDir === 'desc' ? '降序' : '升序'}`;
        });
    });
}

// ---------- 侧边定位条高亮 ----------
function updateSideNavHighlight() {
    const sideNavLinks = document.querySelectorAll('.side-nav-link');
    const scrollPos = window.scrollY + 150;

    let currentSection = 'home';

    const sections = [
        { id: 'home', selector: '#home' },
        { id: 'history', selector: '#history' },
        { id: 'philosophy', selector: '#philosophy' },
        { id: 'activities', selector: '#activities' },
        { id: 'core-members', selector: '#core-members' },
        { id: 'news', selector: '#news' },
        { id: 'competitions', selector: '#competitions' }
    ];

    sections.forEach(section => {
        const el = document.querySelector(section.selector);
        if (el) {
            const top = el.offsetTop;
            const height = el.offsetHeight;
            if (scrollPos >= top && scrollPos < top + height) {
                currentSection = section.id;
            }
        }
    });

    sideNavLinks.forEach(link => {
        link.classList.remove('active');
        if (link.getAttribute('data-section') === currentSection) {
            link.classList.add('active');
        }
    });
}

// ---------- 导航高亮 ----------
function highlightNavByPath() {
    const currentPath = window.location.pathname.split('/').pop() || 'index.html';
    const allNavLinks = document.querySelectorAll('.nav-link:not(.dropdown-toggle)');
    const dropdownLinks = document.querySelectorAll('.dropdown-link');
    
    allNavLinks.forEach(l => l.classList.remove('active'));
    dropdownLinks.forEach(l => l.classList.remove('active'));
    const dt = document.getElementById('moreDropdown');
    if (dt) dt.classList.remove('active');
    
    allNavLinks.forEach(link => {
        const href = link.getAttribute('href');
        if (!href) return;
        if (href === currentPath || 
            (currentPath === '' && href === 'index.html') ||
            (currentPath === 'index.html' && href === 'index.html') ||
            (currentPath === 'contact.html' && href === 'contact.html')) {
            link.classList.add('active');
        }
    });
    
    if (currentPath === 'ranking.html' || currentPath === 'members.html') {
        if (dt) dt.classList.add('active');
        dropdownLinks.forEach(link => { 
            if (link.getAttribute('href') === currentPath) link.classList.add('active'); 
        });
    }
}

// ---------- 初始化 ----------
function initPage() {
    loadAboutData();
    loadMembersData();
    loadNewsData();
    loadCompetitionsData();
    loadScoreLogData();
    if (document.getElementById('rankingFullBody')) loadRankingData();
    initPdfViewer();
    initSearch();
    highlightNavByPath();
    
    window.addEventListener('scroll', updateSideNavHighlight);
    updateSideNavHighlight();
    
    if (window.location.pathname.includes('detail.html') && (newsData.length > 0 || competitionsData.length > 0)) {
        updateDetailPage();
    }
}

// ---------- 平滑滚动 ----------
document.querySelectorAll('a[href^="#"]').forEach(a => {
    a.addEventListener('click', e => {
        const href = a.getAttribute('href');
        if (href === '#') return;
        const target = document.querySelector(href);
        if (target) { e.preventDefault(); target.scrollIntoView({ behavior:'smooth' }); }
    });
});

window.addEventListener('DOMContentLoaded', highlightNavByPath);
window.addEventListener('popstate', highlightNavByPath);

initPage();