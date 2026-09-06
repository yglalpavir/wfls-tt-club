/* ========================================
   shared-partials.js - 全站共享导航/页脚/二维码模态
   取代每页 4-5KB 的复制粘贴 markup（错配/漂移类回归的根源）。
   用法：在页面原 nav/footer/modal 位置放置：
     <script src="js/shared-partials.js" data-partial="nav"></script>
     <script src="js/shared-partials.js" data-partial="footer"></script>
     <script src="js/shared-partials.js" data-partial="qr-modal"></script>
   脚本同步执行原地注入（无 CLS、无闪烁），DOM 就绪时序与原静态 markup 一致。
   当前高亮由 common.js 的 highlightNavByPath() 在运行期处理，模板不写死 active。
   ======================================== */
(function () {
    var NAV_HTML = [
        '<nav class="navbar" id="navbar">',
        '        <div class="nav-container">',
        '            <a href="index.html" class="nav-logo">',
        '                <span class="logo-icon"><i class="fa-solid fa-table-tennis-paddle-ball"></i></span>',
        '                <span class="logo-text">WFLS TT Club</span>',
        '            </a>',
        '            <ul class="nav-menu" id="navMenu">',
        '                <li class="nav-item"><a href="index.html" class="nav-link" data-i18n="nav_home">Home</a></li>',
        '                <li class="nav-item"><a href="news.html" class="nav-link" data-i18n="nav_news">News</a></li>',
        '                <li class="nav-item"><a href="competitions.html" class="nav-link" data-i18n="nav_competitions">Competitions</a></li>',
        '                <li class="nav-item"><a href="ranking.html" class="nav-link">Ranking <span class="beta-tag">Beta</span></a></li>',
        '                <li class="nav-item dropdown">',
        '                    <a href="#" class="nav-link dropdown-toggle" id="moreDropdown" data-i18n="nav_more">More... <i class="fa-solid fa-chevron-down"></i></a>',
        '                    <ul class="dropdown-menu" id="dropdownMenu">',
        '                        <li><a href="members.html" class="dropdown-link" data-i18n="nav_members">社团骨干</a></li>',
        '                        <li><a href="data_viz.html" class="dropdown-link">Data Viz <span class="beta-tag">Beta</span></a></li>',
        '                        <li><a href="personal_stats.html" class="dropdown-link" data-i18n="nav_personal">个人数据</a></li>',
        '                        <li><a href="qa.html" class="dropdown-link" data-i18n="nav_qa">Q&A</a></li>',
        '                        <li><a href="changelog.html" class="dropdown-link" data-i18n="nav_changelog">更新日志</a></li>',
        '                    </ul>',
        '                </li>',
        '                <li class="nav-item"><a href="contact.html" class="nav-link" data-i18n="nav_contact">Contact</a></li>',
        '            </ul>',
        '            <div class="nav-actions">',
        '                <button class="search-toggle" id="searchToggle" aria-label="搜索">',
        '                    <i class="fa-solid fa-magnifying-glass"></i>',
        '                </button>',
        '                <button class="theme-toggle" id="themeToggle" aria-label="切换主题">',
        '                    <i class="fa-solid fa-moon"></i>',
        '                </button>',
        '                <button class="lang-toggle" id="langToggle" aria-label="切换语言">',
        '                    <span data-i18n="lang_btn">EN</span>',
        '                </button>',
        '            </div>',
        '            <button class="hamburger" id="hamburger" aria-label="菜单" aria-expanded="false" aria-controls="navMenu">',
        '                <span class="bar"></span>',
        '                <span class="bar"></span>',
        '                <span class="bar"></span>',
        '            </button>',
        '        </div>',
        '    </nav>'
    ].join('\n');

    var FOOTER_HTML = [
        '<footer class="footer">',
        '        <div class="container">',
        '            <div class="footer-grid">',
        '                <div class="footer-brand">',
        '                    <h3>WFLS Table Tennis Club</h3>',
        '                    <p data-i18n="footer_brand">武汉外国语学校乒乓球社团</p>',
        '                    <p class="footer-motto" data-i18n="footer_motto">挥拍逐梦，旋转青春</p>',
        '                </div>',
        '                <div class="footer-links">',
        '                    <h3 data-i18n="footer_nav">快速导航</h3>',
        '                    <a href="index.html" data-i18n="nav_home">Home</a>',
        '                    <a href="news.html" data-i18n="nav_news">News</a>',
        '                    <a href="competitions.html" data-i18n="nav_competitions">Competitions</a>',
        '                    <a href="members.html" data-i18n="nav_members">社团骨干</a>',
        '                    <a href="ranking.html">Ranking</a>',
        '                    <a href="data_viz.html">Data Viz</a>',
        '                    <a href="personal_stats.html" data-i18n="nav_personal">个人数据</a>',
        '                    <a href="qa.html" data-i18n="nav_qa">Q&A</a>',
        '                    <a href="changelog.html" data-i18n="nav_changelog">更新日志</a>',
        '                    <a href="contact.html" data-i18n="nav_contact">Contact</a>',
        '                </div>',
        '                <div class="footer-school">',
        '                    <h3 data-i18n="footer_school">学校信息</h3>',
        '                    <p data-i18n="footer_school_name">武汉外国语学校</p>',
        '                    <p>Wuhan Foreign Languages School</p>',
        '                    <p data-i18n="footer_location">湖北省武汉市</p>',
        '                </div>',
        '            </div>',
        '            <div class="footer-bottom">',
        '                <p>&copy; 2026 WFLS Table Tennis Club. All rights reserved.</p>',
        '            </div>',
        '        </div>',
        '    </footer>'
    ].join('\n');

    var QR_MODAL_HTML = [
        '<!-- 模态框 - 二维码 -->',
        '    <div class="modal-overlay" id="modalOverlay">',
        '        <div class="modal-content glass-card">',
        '            <button class="modal-close" id="modalClose">&times;</button>',
        '            <h3 data-i18n="modal_title">社团QQ群二维码</h3>',
        '            <p data-i18n="modal_desc">扫描下方二维码加入社团QQ群</p>',
        '            <div class="qr-image-wrapper">',
        '                <img src="Assets/images/qr-code.jpg" alt="社团QQ群二维码" class="qr-real-image">',
        '            </div>',
        '            <p class="modal-note" data-i18n="modal_note">二维码定期更新，如有问题请联系社团管理员</p>',
        '        </div>',
        '    </div>'
    ].join('\n');

    var PARTIALS = { nav: NAV_HTML, footer: FOOTER_HTML, 'qr-modal': QR_MODAL_HTML };

    var script = document.currentScript;
    if (!script) return;
    var html = PARTIALS[script.getAttribute('data-partial')];
    if (html) script.insertAdjacentHTML('beforebegin', html);
})();
