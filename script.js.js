// ============================================
// script.js - 武汉外国语学校乒乓球社团
// 通用交互脚本
// ============================================

(function () {
  'use strict';

  // ---------- DOM 元素 ----------
  const navbar = document.getElementById('navbar');
  const hamburger = document.getElementById('hamburger');
  const navMenu = document.getElementById('navMenu');
  const backToTop = document.getElementById('backToTop');

  // ---------- 移动端汉堡菜单 ----------
  if (hamburger && navMenu) {
    hamburger.addEventListener('click', function () {
      hamburger.classList.toggle('active');
      navMenu.classList.toggle('active');
      // 菜单打开时禁止页面滚动
      if (navMenu.classList.contains('active')) {
        document.body.style.overflow = 'hidden';
      } else {
        document.body.style.overflow = '';
      }
    });

    // 点击导航链接后关闭菜单
    const navLinks = navMenu.querySelectorAll('.nav-link');
    navLinks.forEach(function (link) {
      link.addEventListener('click', function () {
        hamburger.classList.remove('active');
        navMenu.classList.remove('active');
        document.body.style.overflow = '';
      });
    });

    // 点击页面其他区域关闭菜单
    document.addEventListener('click', function (e) {
      if (
        navMenu.classList.contains('active') &&
        !navMenu.contains(e.target) &&
        !hamburger.contains(e.target)
      ) {
        hamburger.classList.remove('active');
        navMenu.classList.remove('active');
        document.body.style.overflow = '';
      }
    });
  }

  // ---------- 导航栏滚动阴影 ----------
  if (navbar) {
    function updateNavbarShadow() {
      if (window.scrollY > 10) {
        navbar.classList.add('scrolled');
      } else {
        navbar.classList.remove('scrolled');
      }
    }
    window.addEventListener('scroll', updateNavbarShadow, { passive: true });
    // 初始检查
    updateNavbarShadow();
  }

  // ---------- 自动设置当前页面的导航 active 状态 ----------
  function setActiveNavLink() {
    const navLinks = document.querySelectorAll('.nav-link[data-page]');
    const currentPath = window.location.pathname;
    // 获取当前页面文件名
    const currentPage = currentPath.split('/').pop() || 'index.html';

    navLinks.forEach(function (link) {
      const pageName = link.getAttribute('data-page');
      // 移除所有 active 类
      link.classList.remove('active');

      if (pageName === 'index' && (currentPage === 'index.html' || currentPage === '')) {
        link.classList.add('active');
      } else if (pageName === 'news' && currentPage === 'news.html') {
        link.classList.add('active');
      } else if (pageName === 'ranking' && currentPage === 'ranking.html') {
        link.classList.add('active');
      }
    });
  }
  setActiveNavLink();

  // ---------- 返回顶部按钮 ----------
  if (backToTop) {
    function toggleBackToTop() {
      if (window.scrollY > 500) {
        backToTop.classList.add('visible');
      } else {
        backToTop.classList.remove('visible');
      }
    }

    window.addEventListener('scroll', toggleBackToTop, { passive: true });

    backToTop.addEventListener('click', function () {
      window.scrollTo({
        top: 0,
        behavior: 'smooth',
      });
    });

    // 初始检查
    toggleBackToTop();
  }

  // ---------- 键盘 ESC 关闭移动端菜单 ----------
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && navMenu && navMenu.classList.contains('active')) {
      hamburger.classList.remove('active');
      navMenu.classList.remove('active');
      document.body.style.overflow = '';
    }
  });

  // ---------- 窗口大小改变时重置菜单状态 ----------
  let resizeTimer;
  window.addEventListener('resize', function () {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(function () {
      if (window.innerWidth > 768 && navMenu && navMenu.classList.contains('active')) {
        hamburger.classList.remove('active');
        navMenu.classList.remove('active');
        document.body.style.overflow = '';
      }
    }, 200);
  });

  console.log('🏓 武汉外国语学校乒乓球社团 - 网站已就绪');
})();