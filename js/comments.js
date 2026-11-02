(() => {
  'use strict';
  const config = document.getElementById('comments-config');
  const container = document.getElementById('gitalk-container');
  if (!config || !container) return;
  const status = document.getElementById('comments-status');
  const retry = document.getElementById('comments-retry');
  const base = 'https://cdn.jsdelivr.net/npm/gitalk@1.8.0/dist/';
  let loading = false, rendered = false;

  function resource(tag, url) {
    return new Promise((resolve, reject) => {
      const element = document.createElement(tag);
      if (tag === 'link') { element.rel = 'stylesheet'; element.href = url; }
      else { element.src = url; element.async = true; }
      const timer = setTimeout(() => fail(), 15000);
      function fail() { clearTimeout(timer); element.remove(); reject(new Error('评论资源加载失败')); }
      element.onload = () => { clearTimeout(timer); resolve(); };
      element.onerror = fail;
      document.head.append(element);
    });
  }
  async function load() {
    if (loading || rendered) return;
    loading = true; retry.hidden = true; status.textContent = '正在加载 GitHub 评论…';
    try {
      await resource('link', base + 'gitalk.css');
      if (typeof window.Gitalk !== 'function') await resource('script', base + 'gitalk.min.js');
      const options = JSON.parse(config.textContent);
      const widget = new window.Gitalk(options);
      widget.render(container.id);
      rendered = true; status.textContent = ''; config.remove();
    } catch (error) {
      status.textContent = '评论加载失败，请重试或前往 GitHub Issues。';
      retry.hidden = false;
    } finally { loading = false; }
  }
  retry.addEventListener('click', load);
  if ('IntersectionObserver' in window) {
    const observer = new IntersectionObserver(entries => {
      if (entries.some(entry => entry.isIntersecting)) { observer.disconnect(); load(); }
    }, { rootMargin: '200px' });
    observer.observe(container);
  } else load();
})();
