/* ============================================================
   首页「Lua 在线运行」引导区
   - 终端逐行敲入并打印结果
   - 不可见时暂停，重新进入继续
   - prefers-reduced-motion 下静态展示
   ============================================================ */
(function () {
  'use strict';
  if (typeof document === 'undefined') return;

  var codeEl = document.getElementById('lua-home-code');
  if (!codeEl) return;

  var caretEl = document.getElementById('lua-home-caret');
  var outputEl = document.getElementById('lua-home-output');
  var stateEl = document.getElementById('lua-home-state');
  var section = document.getElementById('lua-online');

  var SCRIPT = [
    { code: 'local topics = { "闭包", "元表", "协程" }', out: null },
    { code: 'for i, name in ipairs(topics) do', out: null },
    { code: '  print(i, name)', out: '1\t闭包\n2\t元表\n3\t协程' },
    { code: 'end', out: null },
    { code: 'print("Lua in your browser ✓")', out: 'Lua in your browser ✓' },
  ];

  var reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var generation = 0;
  var visible = true;
  var started = false;

  function sleep(ms) {
    return new Promise(function (resolve) { setTimeout(resolve, ms); });
  }

  function alive(token) {
    return token === generation;
  }

  function setState(label, live) {
    if (!stateEl) return;
    stateEl.textContent = label;
    stateEl.classList.toggle('is-running', !!live);
  }

  function flashOutput() {
    outputEl.classList.add('is-flash');
    setTimeout(function () { outputEl.classList.remove('is-flash'); }, 340);
  }

  async function typeText(text, token) {
    for (var i = 0; i < text.length; i++) {
      if (!alive(token)) return false;
      while (!visible) {
        await sleep(200);
        if (!alive(token)) return false;
      }
      codeEl.textContent += text[i];
      var ch = text[i];
      var delay = ch === '\n' ? 190 : (ch === ' ' ? 16 : 32 + Math.random() * 24);
      await sleep(delay);
    }
    return alive(token);
  }

  async function play() {
    var token = ++generation;
    codeEl.textContent = '';
    outputEl.textContent = '';
    if (caretEl) caretEl.style.display = '';
    setState('TYPING', true);
    await sleep(450);

    for (var i = 0; i < SCRIPT.length; i++) {
      var block = SCRIPT[i];
      var line = block.code + (i < SCRIPT.length - 1 ? '\n' : '');
      if (!(await typeText(line, token))) return;
      if (block.out) {
        await sleep(140);
        if (!alive(token)) return;
        outputEl.textContent += (outputEl.textContent ? '\n' : '') + block.out;
        flashOutput();
        await sleep(220);
      }
      await sleep(90);
    }

    if (!alive(token)) return;
    setState('OK', false);
    await sleep(3200);
    if (!alive(token)) return;
    play();
  }

  function renderStatic() {
    codeEl.textContent = SCRIPT.map(function (block) { return block.code; }).join('\n');
    outputEl.textContent = SCRIPT.filter(function (block) { return block.out; })
      .map(function (block) { return block.out; })
      .join('\n');
    if (caretEl) caretEl.style.display = 'none';
    setState('READY', false);
  }

  function start() {
    if (started || reduceMotion) return;
    started = true;
    play();
  }

  if (reduceMotion) {
    renderStatic();
  } else if ('IntersectionObserver' in window) {
    var observer = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        visible = entry.isIntersecting;
        if (visible) start();
      });
    }, { threshold: 0.15 });
    observer.observe(section);
  } else {
    start();
  }

  // 点击终端区域直接打开 Playground
  var terminal = document.querySelector('.lua-home-terminal');
  if (terminal) {
    function openPlayground() {
      window.location.href = terminal.getAttribute('data-href') || '/lua/';
    }
    terminal.addEventListener('click', openPlayground);
    terminal.addEventListener('keydown', function (event) {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        openPlayground();
      }
    });
  }
})();