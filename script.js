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
        about_tag: "About Us",
        about_title: "社团简介",
        about_desc: "以球会友，以技修身。武汉外国语学校乒乓球社团致力于为每一位热爱乒乓球的同学提供成长与竞技的平台。",
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
        contact_tag: "Contact",
        contact_title: "加入我们",
        contact_desc: "扫描二维码加入社团群，获取最新训练安排与活动通知",
        contact_text: "扫码加入社团微信群，与我们一起挥拍逐梦",
        contact_btn: "扫描二维码加入社团群",
        footer_brand: "武汉外国语学校乒乓球社团",
        footer_motto: "挥拍逐梦，旋转青春",
        footer_nav: "快速导航",
        footer_school: "学校信息",
        footer_school_name: "武汉外国语学校",
        footer_location: "湖北省武汉市",
        modal_title: "社团群二维码",
        modal_desc: "扫描下方二维码加入社团微信群",
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
        members_page_title: "社团骨干 | WFLS Table Tennis Club",
        rank_page_title: "Ranking Beta | WFLS Table Tennis Club",
        rank_hero_desc: "社团积分排名系统 · 支持多时间节点对比",
        rank_tag: "Data Table",
        rank_title: "积分数据表",
        rank_desc: "点击表头可按相应列排序 | 切换时间节点自动对比排名变化",
        rank_sort_hint: "当前排序：",
        rank_sidebar_title: "时间节点",
        rank_col_rank: "#",
        rank_col_name: "姓名",
        rank_col_points: "当前积分",
        rank_col_change: "变化",
        rank_col_matches: "总场次",
        rank_col_winrate: "胜率",
        tag_match: "赛事",
        tag_training: "训练",
        tag_notice: "公告",
        tag_event: "活动",
        tag_upcoming: "即将开始",
        tag_result: "比赛结果",
        tag_live: "进行中",
        detail_page_title: "详情 | WFLS Table Tennis Club",
        detail_back: "返回列表"
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
        about_tag: "About Us",
        about_title: "About the Club",
        about_desc: "Making friends through table tennis, cultivating skills through sport.",
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
        contact_tag: "Contact",
        contact_title: "Join Us",
        contact_desc: "Scan the QR code to join the club group and receive notifications",
        contact_text: "Scan to join the club WeChat group and swing with us",
        contact_btn: "Scan QR Code to Join",
        footer_brand: "WFLS Table Tennis Club",
        footer_motto: "Swing for dreams, spin for youth",
        footer_nav: "Quick Links",
        footer_school: "School Info",
        footer_school_name: "Wuhan Foreign Languages School",
        footer_location: "Wuhan, Hubei, China",
        modal_title: "Club Group QR Code",
        modal_desc: "Scan the QR code below to join the club WeChat group",
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
        members_page_title: "Core Members | WFLS Table Tennis Club",
        rank_page_title: "Ranking Beta | WFLS Table Tennis Club",
        rank_hero_desc: "Club ranking system · Multi-period comparison",
        rank_tag: "Data Table",
        rank_title: "Points Table",
        rank_desc: "Click column header to sort | Switch time period for auto comparison",
        rank_sort_hint: "Current sorting: ",
        rank_sidebar_title: "Time Periods",
        rank_col_rank: "#",
        rank_col_name: "Name",
        rank_col_points: "Points",
        rank_col_change: "Change",
        rank_col_matches: "Matches",
        rank_col_winrate: "Win Rate",
        tag_match: "Match",
        tag_training: "Training",
        tag_notice: "Notice",
        tag_event: "Event",
        tag_upcoming: "Upcoming",
        tag_result: "Result",
        tag_live: "Live",
        detail_page_title: "Details | WFLS Table Tennis Club",
        detail_back: "Back to List"
    }
};

let currentLang = 'zh';
let newsData = [];
let competitionsData = [];
let aboutData = null;
let membersData = [];
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
const modalOverlay = document.getElementById('modalOverlay');
const modalClose = document.getElementById('modalClose');
const qrTrigger = document.getElementById('qrTrigger');
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
    renderAllNews();
    renderAllCompetitions();
    if (aboutData) { renderAbout(); }
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
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && modalOverlay && modalOverlay.classList.contains('active')) closeModal(modalOverlay); });

// ---------- 辅助函数 ----------
function formatExcerpt(text) { return text.replace(/\n/g, '<br>').replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>'); }
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
    catch(e) { console.warn('about.json error'); aboutData = { cards: [] }; }
    renderAbout();
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
function renderAbout() {
    const grid = document.getElementById('aboutGrid');
    if (!grid || !aboutData || !aboutData.cards) return;
    grid.innerHTML = '';
    aboutData.cards.forEach(card => {
        const el = document.createElement('div'); el.className = 'about-card glass-card';
        el.innerHTML = `<div class="about-card-icon"><i class="fa-solid ${card.icon}"></i></div><h3>${card.title}</h3><p>${card.content}</p>`;
        grid.appendChild(el);
    });
}

function renderCoreMembers() {
    const grids = document.querySelectorAll('#coreMembersGrid');
    grids.forEach(grid => {
        if (!grid) return;
        grid.innerHTML = '';
        membersData.forEach(m => {
            const el = document.createElement('div'); el.className = 'member-card glass-card';
            el.innerHTML = `<div class="member-avatar">${m.name.charAt(0)}</div><h3>${m.name}</h3><span class="member-role">${m.role}</span><p class="member-desc">${m.description}</p>`;
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
        el.innerHTML = `<div class="member-avatar">${m.name.charAt(0)}</div><h3>${m.name}</h3><span class="member-role">${m.role}</span><p class="member-desc">${m.description}</p>`;
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
    document.getElementById('detailContent').innerHTML = content.replace(/\n/g, '<br>');
    
    const mediaContainer = document.getElementById('detailMedia');
    mediaContainer.innerHTML = '';
    
    if (item.media && Array.isArray(item.media) && item.media.length > 0) {
        item.media.forEach((m, index) => {
            if (!m || !m.type || !m.src) {
                console.warn(`跳过无效媒体项 [${index}]:`, m);
                return;
            }
            
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
            } else {
                console.warn(`未知媒体类型 [${index}]:`, m.type);
                return;
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
// 排名系统（多时间节点 + 排名变化对比）
// ==========================================

async function loadRankingData() {
    const tbody = document.getElementById('rankingFullBody');
    if (!tbody) return;

    try {
        const response = await fetch('ranking.json');
        if (!response.ok) throw new Error('无法加载排名数据');
        rankingTimeline = await response.json();
        
        // 按时间降序排列（最新在前）
        rankingTimeline.sort((a, b) => b.time.localeCompare(a.time));
        
        // 默认显示最新时间节点
        currentTimeIndex = 0;
        currentSortKey = '当前积分';
        currentSortDir = 'desc';
        
        // 渲染侧边栏
        renderTimeNodeList();
        
        // 计算排名变化并渲染
        updateRankingDisplay();
        
        // 设置排序监听
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
        
        li.innerHTML = `
            <span class="node-dot"></span>
            ${node.label}
            <span class="node-count">${node.data.length}人</span>
        `;
        
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
        return currentData.map((player, index) => ({
            ...player,
            rank: index + 1,
            change: 0,
            changeType: 'new'
        }));
    }
    
    const prevRankMap = {};
    previousData.forEach((player, index) => {
        prevRankMap[player['姓名']] = index + 1;
    });
    
    return currentData.map((player, index) => {
        const currentRank = index + 1;
        const prevRank = prevRankMap[player['姓名']];
        
        if (prevRank === undefined) {
            return {
                ...player,
                rank: currentRank,
                change: 0,
                changeType: 'new'
            };
        }
        
        const change = prevRank - currentRank;
        
        if (change > 0) {
            return { ...player, rank: currentRank, change, changeType: 'up' };
        } else if (change < 0) {
            return { ...player, rank: currentRank, change: Math.abs(change), changeType: 'down' };
        } else {
            return { ...player, rank: currentRank, change: 0, changeType: 'same' };
        }
    });
}

function updateRankingDisplay() {
    if (!rankingTimeline.length || !rankingTimeline[currentTimeIndex]) return;
    
    const currentData = rankingTimeline[currentTimeIndex].data;
    const previousData = currentTimeIndex < rankingTimeline.length - 1 
        ? rankingTimeline[currentTimeIndex + 1].data 
        : null;
    
    currentDisplayData = calculateRankChanges(currentData, previousData);
    currentDisplayData = sortDisplayData(currentSortKey, currentSortDir);
    
    renderRankingTable(currentDisplayData);
    
    const indicator = document.getElementById('sortIndicator');
    if (indicator) {
        indicator.textContent = `${currentSortKey}${currentSortDir === 'desc' ? '降序' : '升序'}`;
    }
    
    updateSortHeaderHighlight();
    
    const label = document.getElementById('currentTimeLabel');
    if (label) {
        label.textContent = rankingTimeline[currentTimeIndex].label;
    }
}

function sortDisplayData(key, dir) {
    return [...currentDisplayData].sort((a, b) => {
        let valA, valB;
        
        if (key === '胜率') {
            valA = parseWinRate(a['胜率']);
            valB = parseWinRate(b['胜率']);
        } else if (key === '姓名') {
            valA = a['姓名'] || '';
            valB = b['姓名'] || '';
            return dir === 'asc' 
                ? valA.localeCompare(valB, 'zh') 
                : valB.localeCompare(valA, 'zh');
        } else if (key === 'rank') {
            valA = a.rank || 0;
            valB = b.rank || 0;
        } else if (key === '变化') {
            valA = a.change || 0;
            valB = b.change || 0;
        } else {
            valA = a[key] || 0;
            valB = b[key] || 0;
        }
        
        if (valA < valB) return dir === 'asc' ? -1 : 1;
        if (valA > valB) return dir === 'asc' ? 1 : -1;
        return 0;
    });
}

function renderRankingTable(data) {
    const tbody = document.getElementById('rankingFullBody');
    if (!tbody) return;
    
    if (!data || data.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:40px;">暂无排名数据</td></tr>';
        return;
    }

    tbody.innerHTML = '';
    data.forEach((player, index) => {
        const tr = document.createElement('tr');
        const winRateRaw = player['胜率'] || '0%';
        let winRateDisplay = winRateRaw === '#DIV/0!' || winRateRaw === '-' ? '0%' : winRateRaw;
        
        let changeHtml = '';
        if (player.changeType === 'up') {
            changeHtml = `<span class="rank-change rank-up">▲${player.change}</span>`;
        } else if (player.changeType === 'down') {
            changeHtml = `<span class="rank-change rank-down">▼${player.change}</span>`;
        } else if (player.changeType === 'new') {
            changeHtml = `<span class="rank-new">NEW</span>`;
        } else {
            changeHtml = `<span class="rank-same">-</span>`;
        }
        
        tr.innerHTML = `
            <td>${index + 1}</td>
            <td>${player['姓名'] || '-'}</td>
            <td><strong>${player['当前积分'] || 0}</strong></td>
            <td>${changeHtml}</td>
            <td>${player['总场次'] || 0}</td>
            <td>${winRateDisplay}</td>
        `;
        tbody.appendChild(tr);
    });
}

function updateSortHeaderHighlight() {
    document.querySelectorAll('.ranking-table-full th.sortable').forEach(th => {
        th.classList.remove('active-sort');
        const sortKey = th.getAttribute('data-sort');
        if (sortKey === currentSortKey) {
            th.classList.add('active-sort');
        }
    });
}

function setupSortListeners() {
    const sortableHeaders = document.querySelectorAll('.ranking-table-full th.sortable');
    const sortIndicator = document.getElementById('sortIndicator');

    sortableHeaders.forEach(th => {
        const newTh = th.cloneNode(true);
        th.parentNode.replaceChild(newTh, th);
        
        newTh.addEventListener('click', () => {
            const key = newTh.getAttribute('data-sort');
            let dir = 'desc';

            if (key === currentSortKey) {
                currentSortDir = currentSortDir === 'desc' ? 'asc' : 'desc';
                dir = currentSortDir;
            } else {
                currentSortKey = key;
                currentSortDir = 'desc';
                dir = 'desc';
            }

            currentDisplayData = sortDisplayData(key, dir);
            renderRankingTable(currentDisplayData);
            
            updateSortHeaderHighlight();
            const allHeaders = document.querySelectorAll('.ranking-table-full th.sortable');
            allHeaders.forEach(h => {
                const arrow = h.querySelector('.sort-arrow');
                if (arrow) arrow.innerHTML = '';
            });
            const arrow = newTh.querySelector('.sort-arrow');
            if (arrow) arrow.innerHTML = dir === 'desc' ? '&#9660;' : '&#9650;';
            newTh.classList.add('active-sort');

            if (sortIndicator) {
                sortIndicator.textContent = `${key}${dir === 'desc' ? '降序' : '升序'}`;
            }
        });
    });
}

// ---------- 导航高亮（基于当前页面路径）----------
function highlightNavByPath() {
    const currentPath = window.location.pathname.split('/').pop() || 'index.html';
    const allNavLinks = document.querySelectorAll('.nav-link:not(.dropdown-toggle)');
    const dropdownLinks = document.querySelectorAll('.dropdown-link');
    
    allNavLinks.forEach(link => link.classList.remove('active'));
    dropdownLinks.forEach(link => link.classList.remove('active'));
    const dropdownToggleEl = document.getElementById('moreDropdown');
    if (dropdownToggleEl) dropdownToggleEl.classList.remove('active');
    
    allNavLinks.forEach(link => {
        const href = link.getAttribute('href');
        if (!href) return;
        
        if (href === currentPath || 
            (currentPath === '' && href === 'index.html') ||
            (currentPath === 'index.html' && href === 'index.html')) {
            link.classList.add('active');
        }
    });
    
    if (currentPath === 'ranking.html' || currentPath === 'members.html') {
        if (dropdownToggleEl) dropdownToggleEl.classList.add('active');
        dropdownLinks.forEach(link => {
            const href = link.getAttribute('href');
            if (href === currentPath) {
                link.classList.add('active');
            }
        });
    }
}

// ---------- 初始化 ----------
function initPage() {
    loadAboutData();
    loadMembersData();
    loadNewsData();
    loadCompetitionsData();
    if (document.getElementById('rankingFullBody')) loadRankingData();
    initPdfViewer();
    highlightNavByPath();
    
    if (window.location.pathname.includes('detail.html')) {
        if (newsData.length > 0 || competitionsData.length > 0) {
            updateDetailPage();
        }
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

// 页面加载完成后执行高亮
window.addEventListener('DOMContentLoaded', highlightNavByPath);
window.addEventListener('popstate', highlightNavByPath);

initPage();