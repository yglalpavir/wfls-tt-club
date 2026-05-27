/* ========================================
   WFLS Table Tennis Club - Main Script
   ======================================== */

// ---------- 全局变量 ----------
let newsData = [];
let rankingData = [];
let currentSortKey = '序号';
let currentSortDir = 'asc';

// ---------- DOM 元素 ----------
const hamburger = document.getElementById('hamburger');
const navMenu = document.getElementById('navMenu');
const navbar = document.getElementById('navbar');
const themeToggle = document.getElementById('themeToggle');
const modalOverlay = document.getElementById('modalOverlay');
const modalClose = document.getElementById('modalClose');
const qrTrigger = document.getElementById('qrTrigger');
const body = document.body;

// ---------- 移动端菜单 ----------
if (hamburger && navMenu) {
    hamburger.addEventListener('click', () => {
        hamburger.classList.toggle('active');
        navMenu.classList.toggle('active');
    });

    const navLinks = navMenu.querySelectorAll('.nav-link');
    navLinks.forEach(link => {
        link.addEventListener('click', () => {
            hamburger.classList.remove('active');
            navMenu.classList.remove('active');
        });
    });

    document.addEventListener('click', (e) => {
        if (!hamburger.contains(e.target) && !navMenu.contains(e.target)) {
            hamburger.classList.remove('active');
            navMenu.classList.remove('active');
        }
    });
}

// ---------- 导航栏滚动效果 ----------
window.addEventListener('scroll', () => {
    if (window.scrollY > 60) {
        navbar.classList.add('scrolled');
    } else {
        navbar.classList.remove('scrolled');
    }
});

// ---------- 主题切换 ----------
if (themeToggle) {
    const savedTheme = localStorage.getItem('wfls-tt-theme');
    if (savedTheme === 'dark') {
        body.classList.add('dark-mode');
        themeToggle.innerHTML = '<i class="fa-solid fa-sun"></i>';
    }

    themeToggle.addEventListener('click', () => {
        body.classList.toggle('dark-mode');
        const isDark = body.classList.contains('dark-mode');
        localStorage.setItem('wfls-tt-theme', isDark ? 'dark' : 'light');
        themeToggle.innerHTML = isDark
            ? '<i class="fa-solid fa-sun"></i>'
            : '<i class="fa-solid fa-moon"></i>';
    });
}

// ---------- 模态框 ----------
function openModal(modalEl) {
    if (modalEl) {
        modalEl.classList.add('active');
        body.style.overflow = 'hidden';
    }
}

function closeModal(modalEl) {
    if (modalEl) {
        modalEl.classList.remove('active');
        body.style.overflow = '';
    }
}

if (qrTrigger && modalOverlay) {
    qrTrigger.addEventListener('click', () => openModal(modalOverlay));
}

if (modalClose && modalOverlay) {
    modalClose.addEventListener('click', () => closeModal(modalOverlay));
}

if (modalOverlay) {
    modalOverlay.addEventListener('click', (e) => {
        if (e.target === modalOverlay) {
            closeModal(modalOverlay);
        }
    });
}

document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        if (modalOverlay && modalOverlay.classList.contains('active')) {
            closeModal(modalOverlay);
        }
    }
});

// ---------- 标签映射 ----------
const tagMap = {
    'match': { text: '赛事', class: 'tag-match' },
    'training': { text: '训练', class: 'tag-training' },
    'notice': { text: '公告', class: 'tag-notice' },
    'event': { text: '活动', class: 'tag-event' }
};

// ---------- 创建新闻卡片HTML ----------
function createNewsCard(item) {
    const tagInfo = tagMap[item.tag] || { text: item.tag, class: 'tag-notice' };
    return `
        <div class="news-card-date">${item.date}</div>
        <h3>${item.title}</h3>
        <p>${item.excerpt}</p>
        <span class="news-card-tag ${tagInfo.class}">${tagInfo.text}</span>
    `;
}

// ---------- 加载新闻数据 ----------
async function loadNewsData() {
    try {
        const response = await fetch('news.json');
        if (!response.ok) throw new Error('无法加载新闻数据');
        newsData = await response.json();
    } catch (error) {
        console.warn('news.json 加载失败，使用默认数据:', error);
        newsData = [
            { "date": "2024-12-20", "title": "十二月月度排名赛圆满结束", "excerpt": "本次排名赛共有32名社员参赛，经过激烈角逐，新一届排名已出炉。", "tag": "match" },
            { "date": "2024-12-10", "title": "寒假集训营报名通知", "excerpt": "2025年寒假集训营将于1月15日至1月25日举行，为期10天。", "tag": "training" },
            { "date": "2024-11-28", "title": "社团代表队在市级联赛中斩获佳绩", "excerpt": "我校乒乓球社团代表队在武汉市中学生乒乓球联赛中获得团体第三名。", "tag": "match" }
        ];
    }
    renderAllNews();
}

// ---------- 渲染所有新闻模块 ----------
function renderAllNews() {
    // 主页新闻预览（前3条）
    const newsPreviewGrid = document.getElementById('newsPreviewGrid');
    if (newsPreviewGrid) {
        newsPreviewGrid.innerHTML = '';
        const previewNews = newsData.slice(0, 3);
        previewNews.forEach(item => {
            const card = document.createElement('div');
            card.className = 'news-card';
            card.innerHTML = createNewsCard(item);
            card.addEventListener('click', () => {
                window.location.href = 'news.html';
            });
            newsPreviewGrid.appendChild(card);
        });
    }

    // 新闻页完整列表
    const newsFullGrid = document.getElementById('newsFullGrid');
    if (newsFullGrid) {
        newsFullGrid.innerHTML = '';
        newsData.forEach(item => {
            const card = document.createElement('div');
            card.className = 'news-card';
            card.innerHTML = createNewsCard(item);
            newsFullGrid.appendChild(card);
        });
    }
}

// ---------- PDF 延迟加载 ----------
function initPdfViewer() {
    const pdfViewBtn = document.getElementById('pdfViewBtn');
    const pdfPreviewContainer = document.getElementById('pdfPreviewContainer');
    const pdfPlaceholder = document.getElementById('pdfPlaceholder');
    const pdfViewer = document.getElementById('pdfViewer');

    if (!pdfViewBtn || !pdfPreviewContainer || !pdfPlaceholder || !pdfViewer) return;

    let pdfLoaded = false;

    pdfViewBtn.addEventListener('click', () => {
        if (!pdfLoaded) {
            // 显示加载状态
            pdfViewBtn.disabled = true;
            pdfViewBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> 加载中...';
            
            // 延迟加载iframe，避免页面加载时自动下载
            const dataSrc = pdfViewer.getAttribute('data-src');
            if (dataSrc) {
                pdfViewer.src = dataSrc;
                pdfLoaded = true;
                
                // 监听iframe加载完成
                pdfViewer.onload = () => {
                    pdfViewBtn.innerHTML = '<i class="fa-solid fa-eye-slash"></i> 隐藏预览';
                    pdfViewBtn.disabled = false;
                };

                // 如果10秒后还没加载完，恢复按钮
                setTimeout(() => {
                    if (pdfViewBtn.disabled) {
                        pdfViewBtn.innerHTML = '<i class="fa-solid fa-eye-slash"></i> 隐藏预览';
                        pdfViewBtn.disabled = false;
                    }
                }, 10000);
            }
        }

        // 切换显示/隐藏
        if (pdfPreviewContainer.style.display === 'none' || !pdfPreviewContainer.style.display) {
            pdfPreviewContainer.style.display = 'block';
            pdfPlaceholder.style.display = 'none';
            if (pdfLoaded) {
                pdfViewBtn.innerHTML = '<i class="fa-solid fa-eye-slash"></i> 隐藏预览';
            }
        } else {
            pdfPreviewContainer.style.display = 'none';
            pdfPlaceholder.style.display = 'flex';
            pdfViewBtn.innerHTML = '<i class="fa-solid fa-eye"></i> 在线预览';
        }
    });
}

// ---------- 加载排名数据 (ranking.html) ----------
async function loadRankingData() {
    const rankingBody = document.getElementById('rankingFullBody');
    const lastUpdatedEl = document.getElementById('lastUpdated');
    if (!rankingBody) return;

    try {
        const response = await fetch('ranking.json');
        if (!response.ok) throw new Error('无法加载排名数据');
        rankingData = await response.json();
        
        if (lastUpdatedEl) {
            lastUpdatedEl.textContent = '数据已加载';
        }
        
        renderRankingTable(rankingData);
        setupSortListeners();
    } catch (error) {
        console.error('加载排名失败:', error);
        rankingBody.innerHTML = '<tr><td colspan="5" style="text-align:center;padding:40px;color:var(--accent-red);">无法加载排名数据，请确保 ranking.json 文件存在</td></tr>';
        if (lastUpdatedEl) {
            lastUpdatedEl.textContent = '加载失败';
        }
    }
}

function parseWinRate(rateStr) {
    if (!rateStr || rateStr === '#DIV/0!' || rateStr === '-') return 0;
    const cleaned = rateStr.replace('%', '').trim();
    const num = parseFloat(cleaned);
    return isNaN(num) ? 0 : num;
}

function renderRankingTable(data) {
    const rankingBody = document.getElementById('rankingFullBody');
    if (!rankingBody) return;
    
    if (!data || data.length === 0) {
        rankingBody.innerHTML = '<tr><td colspan="5" style="text-align:center;padding:40px;">暂无排名数据</td></tr>';
        return;
    }

    rankingBody.innerHTML = '';
    data.forEach((player, index) => {
        const tr = document.createElement('tr');
        const winRateRaw = player['胜率'] || '0%';
        let winRateDisplay = winRateRaw;
        if (winRateRaw === '#DIV/0!' || winRateRaw === '-') {
            winRateDisplay = '0%';
        }

        tr.innerHTML = `
            <td>${index + 1}</td>
            <td>${player['姓名'] || '-'}</td>
            <td><strong>${player['当前积分'] || 0}</strong></td>
            <td>${player['总场次'] || 0}</td>
            <td>${winRateDisplay}</td>
        `;
        rankingBody.appendChild(tr);
    });
}

function sortRankingData(key, dir) {
    const sorted = [...rankingData].sort((a, b) => {
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
        } else {
            valA = a[key] || 0;
            valB = b[key] || 0;
        }

        if (valA < valB) return dir === 'asc' ? -1 : 1;
        if (valA > valB) return dir === 'asc' ? 1 : -1;
        return 0;
    });
    return sorted;
}

function setupSortListeners() {
    const sortableHeaders = document.querySelectorAll('.ranking-table-full th.sortable');
    const sortIndicator = document.getElementById('sortIndicator');

    sortableHeaders.forEach(th => {
        th.addEventListener('click', () => {
            const key = th.getAttribute('data-sort');
            let dir = 'desc';

            if (key === currentSortKey) {
                currentSortDir = currentSortDir === 'desc' ? 'asc' : 'desc';
                dir = currentSortDir;
            } else {
                currentSortKey = key;
                currentSortDir = key === '序号' ? 'asc' : 'desc';
                dir = currentSortDir;
            }

            sortableHeaders.forEach(h => {
                h.classList.remove('active-sort');
                h.querySelector('.sort-arrow').innerHTML = '';
            });
            th.classList.add('active-sort');
            th.querySelector('.sort-arrow').innerHTML = dir === 'desc' ? '&#9660;' : '&#9650;';

            const sortedData = sortRankingData(key, dir);
            renderRankingTable(sortedData);

            const keyNames = {
                '序号': '序号', '姓名': '姓名', '当前积分': '积分',
                '总场次': '总场次', '胜率': '胜率'
            };
            if (sortIndicator) {
                sortIndicator.textContent = `${keyNames[key] || key}${dir === 'desc' ? '降序' : '升序'}`;
            }
        });
    });
}

// ---------- 页面初始化 ----------
function initPage() {
    // 加载新闻数据
    loadNewsData();

    // 排名页面初始化
    if (document.getElementById('rankingFullBody')) {
        loadRankingData();
    }

    // PDF预览初始化
    initPdfViewer();
}

// ---------- 平滑滚动 ----------
document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener('click', function (e) {
        const href = this.getAttribute('href');
        if (href === '#') return;
        const target = document.querySelector(href);
        if (target) {
            e.preventDefault();
            target.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
    });
});

// ---------- 滚动高亮导航 ----------
const allSections = document.querySelectorAll('section[id]');
const allNavLinks = document.querySelectorAll('.nav-link');

function updateActiveNavLink() {
    let currentSectionId = '';
    const scrollPos = window.scrollY + 120;

    allSections.forEach(section => {
        const sectionTop = section.offsetTop;
        const sectionHeight = section.offsetHeight;
        if (scrollPos >= sectionTop && scrollPos < sectionTop + sectionHeight) {
            currentSectionId = section.getAttribute('id');
        }
    });

    allNavLinks.forEach(link => {
        link.classList.remove('active');
        const linkHref = link.getAttribute('href');
        if (linkHref && linkHref.includes('#' + currentSectionId)) {
            link.classList.add('active');
        }
    });
}

if (document.querySelector('section[id="home"]') && document.querySelector('section[id="about"]')) {
    window.addEventListener('scroll', updateActiveNavLink);
}

// ---------- 启动 ----------
initPage();
console.log('WFLS Table Tennis Club - Website Initialized');