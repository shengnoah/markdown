// ============================================================
// Book Layout JavaScript（电子书/教程布局）
// 移植自 lua.ren 项目 butterfly 主题，适配 typora 主题独立页面
// 功能：侧边栏切换、平滑滚动、代码复制、目录高亮、返回顶部、图片放大
// ============================================================

(function () {
  'use strict';

  // 侧边栏切换功能（移动端，左上角按钮）
  function initSidebarToggle() {
    var sidebar = document.querySelector('.book-sidebar');
    var main = document.querySelector('.book-main');

    if (!sidebar || !main) return;

    // 创建切换按钮
    var toggleBtn = document.createElement('button');
    toggleBtn.className = 'book-sidebar-toggle';
    toggleBtn.innerHTML = '<i class="fas fa-bars"></i>';
    toggleBtn.setAttribute('aria-label', '打开目录');
    toggleBtn.style.cssText = [
      'position: fixed',
      'top: 20px',
      'left: 20px',
      'z-index: 100000',
      'background: #3498db',
      'color: #fff',
      'border: none',
      'padding: 12px 16px',
      'border-radius: 6px',
      'cursor: pointer',
      'display: none',
      'box-shadow: 0 2px 8px rgba(0,0,0,0.2)'
    ].join(';');

    document.body.appendChild(toggleBtn);

    // 响应式显示切换按钮
    function checkWidth() {
      if (window.innerWidth <= 1024) {
        toggleBtn.style.display = 'block';
      } else {
        toggleBtn.style.display = 'none';
        sidebar.classList.remove('active');
      }
    }

    // 切换侧边栏
    toggleBtn.addEventListener('click', function () {
      sidebar.classList.toggle('active');
    });

    // 点击主内容区关闭侧边栏
    main.addEventListener('click', function () {
      if (window.innerWidth <= 1024 && sidebar.classList.contains('active')) {
        sidebar.classList.remove('active');
      }
    });

    // 监听窗口大小变化
    window.addEventListener('resize', checkWidth);
    checkWidth();
  }

  // 顶部导航切换按钮（移动端，右上角按钮，切换左侧目录侧边栏）
  function initTopNavToggle() {
    var nav = document.getElementById('nav');
    var bookContainer = document.getElementById('book-container') || document.querySelector('.book-container');
    var sidebar = document.querySelector('.book-sidebar');

    // book.ejs 已固定输出按钮：确保所有 book layout 页面移动端都一定存在
    var btnList = Array.prototype.slice.call(document.querySelectorAll('.book-topnav-toggle'));
    if (!btnList.length) return;

    // 清理历史遗留的重复按钮
    var toggleBtn = btnList[0];
    btnList.slice(1).forEach(function (btn) { btn.remove(); });

    toggleBtn.setAttribute('aria-label', '打开目录');

    // 响应式显示切换按钮 + 隐藏顶部 nav
    function checkWidth() {
      var isMobile = window.innerWidth <= 768;

      if (isMobile) {
        toggleBtn.style.display = 'block';
        if (nav) nav.style.display = 'none';
        if (bookContainer) bookContainer.style.marginTop = '20px';
      } else {
        toggleBtn.style.display = 'none';
        if (nav) nav.style.display = '';
        if (bookContainer) bookContainer.style.marginTop = '';
        if (sidebar) sidebar.classList.remove('active');
      }
    }

    // 点击按钮：打开/关闭左侧目录侧边栏
    if (toggleBtn.dataset.bookTopnavToggleBound !== '1') {
      toggleBtn.addEventListener('click', function () {
        if (sidebar) sidebar.classList.toggle('active');
      });
      toggleBtn.dataset.bookTopnavToggleBound = '1';
    }

    if (!window.__bookTopnavResizeBound) {
      window.__bookTopnavResizeBound = true;
      window.addEventListener('resize', checkWidth);
      window.addEventListener('orientationchange', checkWidth);
    }

    checkWidth();
  }

  // 平滑滚动（兼容中文/URL encode 的 hash；并处理固定顶部导航偏移）
  function initSmoothScroll() {
    function getFixedTopOffset() {
      var nav = document.getElementById('nav');
      if (!nav) return 0;
      var navDisplay = window.getComputedStyle(nav).display;
      if (navDisplay === 'none') return 0;
      // 额外留一点间距，避免标题贴边
      return (nav.offsetHeight || 0) + 12;
    }

    function scrollToTarget(target) {
      var offset = getFixedTopOffset();
      var top = window.scrollY + target.getBoundingClientRect().top - offset;
      window.scrollTo({ top: top, behavior: 'smooth' });
    }

    var anchors = document.querySelectorAll('a[href^="#"]');
    Array.prototype.forEach.call(anchors, function (anchor) {
      anchor.addEventListener('click', function (e) {
        var rawHref = this.getAttribute('href');
        if (!rawHref || rawHref === '#') return;

        // toc() 生成的 href 可能是 encodeURI 的（尤其中文标题），先 decode 再找元素
        var decodedHash;
        try { decodedHash = decodeURI(rawHref); } catch (err) { decodedHash = rawHref; }
        var id = decodedHash.replace(/^#/, '');
        if (!id) return;

        var target = document.getElementById(id);
        if (!target) return;

        e.preventDefault();
        scrollToTarget(target);

        // 更新地址栏 hash
        try {
          history.pushState(null, '', '#' + encodeURI(id));
        } catch (err) {
          // ignore
        }
      });
    });
  }

  // 代码块复制功能
  // 注意：不处理 Hexo highlight.js 的 `figure.highlight`，避免破坏行号结构
  function initCodeCopy() {
    var blocks = document.querySelectorAll('.book-body pre code');
    Array.prototype.forEach.call(blocks, function (block) {
      var pre = block.parentElement;

      // 跳过 highlight 代码块
      if (pre.closest('figure.highlight') || pre.closest('.highlight')) return;

      // 避免重复包裹
      if (pre.parentElement && pre.parentElement.classList && pre.parentElement.classList.contains('code-wrapper')) return;

      var wrapper = document.createElement('div');
      wrapper.className = 'code-wrapper';
      wrapper.style.position = 'relative';

      pre.parentNode.insertBefore(wrapper, pre);
      wrapper.appendChild(pre);

      var copyBtn = document.createElement('button');
      copyBtn.className = 'code-copy-btn';
      copyBtn.innerHTML = '<i class="fas fa-copy"></i>';
      copyBtn.style.cssText = [
        'position: absolute',
        'top: 10px',
        'right: 10px',
        'background: rgba(255,255,255,0.1)',
        'color: #ecf0f1',
        'border: 1px solid rgba(255,255,255,0.2)',
        'padding: 6px 12px',
        'border-radius: 4px',
        'cursor: pointer',
        'font-size: 12px',
        'transition: all 0.3s'
      ].join(';');

      copyBtn.addEventListener('mouseenter', function () {
        this.style.background = 'rgba(255,255,255,0.2)';
      });

      copyBtn.addEventListener('mouseleave', function () {
        this.style.background = 'rgba(255,255,255,0.1)';
      });

      copyBtn.addEventListener('click', function () {
        var code = block.textContent;
        navigator.clipboard.writeText(code).then(function () {
          copyBtn.innerHTML = '<i class="fas fa-check"></i> 已复制';
          setTimeout(function () {
            copyBtn.innerHTML = '<i class="fas fa-copy"></i>';
          }, 2000);
        }).catch(function (err) {
          console.error('复制失败:', err);
        });
      });

      wrapper.appendChild(copyBtn);
    });
  }

  // 目录高亮（滚动时高亮左侧目录中当前章节）
  function initTocHighlight() {
    var headings = document.querySelectorAll('.book-body h1, .book-body h2, .book-body h3');
    var menuLinks = document.querySelectorAll('.book-menu a');

    if (headings.length === 0 || menuLinks.length === 0) return;

    function highlightToc() {
      var current = '';

      Array.prototype.forEach.call(headings, function (heading) {
        var rect = heading.getBoundingClientRect();
        if (rect.top <= 100) {
          current = heading.id || heading.textContent;
        }
      });

      Array.prototype.forEach.call(menuLinks, function (link) {
        link.style.color = '#bdc3c7';
        link.style.fontWeight = 'normal';

        if (current && link.textContent.indexOf(current) !== -1) {
          link.style.color = '#3498db';
          link.style.fontWeight = '600';
        }
      });
    }

    window.addEventListener('scroll', highlightToc);
    highlightToc();
  }

  // 返回顶部按钮
  function initBackToTop() {
    var backToTop = document.createElement('button');
    backToTop.className = 'back-to-top';
    backToTop.innerHTML = '<i class="fas fa-arrow-up"></i>';
    backToTop.setAttribute('aria-label', '返回顶部');
    backToTop.style.cssText = [
      'position: fixed',
      'bottom: 40px',
      'right: 40px',
      'background: #3498db',
      'color: #fff',
      'border: none',
      'width: 50px',
      'height: 50px',
      'border-radius: 50%',
      'cursor: pointer',
      'opacity: 0',
      'visibility: hidden',
      'transition: all 0.3s',
      'z-index: 1000',
      'box-shadow: 0 4px 12px rgba(52, 152, 219, 0.3)'
    ].join(';');

    document.body.appendChild(backToTop);

    window.addEventListener('scroll', function () {
      if (window.pageYOffset > 300) {
        backToTop.style.opacity = '1';
        backToTop.style.visibility = 'visible';
      } else {
        backToTop.style.opacity = '0';
        backToTop.style.visibility = 'hidden';
      }
    });

    backToTop.addEventListener('click', function () {
      window.scrollTo({
        top: 0,
        behavior: 'smooth'
      });
    });

    backToTop.addEventListener('mouseenter', function () {
      this.style.background = '#2980b9';
      this.style.transform = 'translateY(-5px)';
    });

    backToTop.addEventListener('mouseleave', function () {
      this.style.background = '#3498db';
      this.style.transform = 'translateY(0)';
    });
  }

  // 图片放大功能（点击查看大图）
  function initImageZoom() {
    var images = document.querySelectorAll('.book-body img');
    Array.prototype.forEach.call(images, function (img) {
      img.style.cursor = 'zoom-in';

      img.addEventListener('click', function () {
        var overlay = document.createElement('div');
        overlay.style.cssText = [
          'position: fixed',
          'top: 0',
          'left: 0',
          'right: 0',
          'bottom: 0',
          'background: rgba(0,0,0,0.9)',
          'z-index: 99999',
          'display: flex',
          'align-items: center',
          'justify-content: center',
          'cursor: zoom-out'
        ].join(';');

        var zoomedImg = document.createElement('img');
        zoomedImg.src = this.src;
        zoomedImg.style.cssText = [
          'max-width: 90%',
          'max-height: 90%',
          'object-fit: contain'
        ].join(';');

        overlay.appendChild(zoomedImg);
        document.body.appendChild(overlay);

        overlay.addEventListener('click', function () {
          document.body.removeChild(overlay);
        });
      });
    });
  }

  // 初始化所有功能
  function init() {
    initSidebarToggle();
    initTopNavToggle();
    initSmoothScroll();
    initCodeCopy();
    initTocHighlight();
    initBackToTop();
    initImageZoom();
  }

  // DOM 加载完成后初始化
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
