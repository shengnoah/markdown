/* ============================================================
   Keyboard Test（键盘测试）
   108 键 ANSI 布局 · 立体透明机械键帽 · 按键检测/记录/统计
   ============================================================ */
(function () {
  'use strict';

  var container = document.getElementById('kb-app');
  if (!container) return;

  /* ------------------------------------------------------------
     108 键 ANSI 布局数据
     每键: [code, 主标签, 宽度u, 副标签, 附加类]
     行内 null       表示分区间隔（kb-gap，14px）
     行内 { gap: N } 表示自定义宽度间隔（N px）
     行内 false      表示 1u 宽空占位（kb-blank，编辑区无键的行用它
                     补齐 3u 宽度，保证小键盘 456/123 与 789 列对齐）
     ------------------------------------------------------------ */
  var LAYOUT = [
    /* Row 0: 功能键区 */
    [
      ['Escape', 'Esc', 1, '', 'kb-small'],
      null,
      ['F1', 'F1', 1, '', 'kb-small'], ['F2', 'F2', 1, '', 'kb-small'],
      ['F3', 'F3', 1, '', 'kb-small'], ['F4', 'F4', 1, '', 'kb-small'],
      /* 33px 宽间隔：F5-F8 整组向右移 19px（标准 14px + 19px） */
      { gap: 33 },
      ['F5', 'F5', 1, '', 'kb-small'], ['F6', 'F6', 1, '', 'kb-small'],
      ['F7', 'F7', 1, '', 'kb-small'], ['F8', 'F8', 1, '', 'kb-small'],
      /* 33px 宽间隔：F9-F12 整组向右移 19px（标准 14px + 19px） */
      { gap: 33 },
      ['F9', 'F9', 1, '', 'kb-small'], ['F10', 'F10', 1, '', 'kb-small'],
      ['F11', 'F11', 1, '', 'kb-small'], ['F12', 'F12', 1, '', 'kb-small'],
      /* 15px 宽间隔：PrtSc/ScrLk/Pause 与下方 Insert/Home/PgUp 纵向对齐
         （53px - 38px，抵消 F9-F12 右移量，保持 PrtSc 位置不变） */
      { gap: 15 },
      ['PrintScreen', 'PrtSc', 1, '', 'kb-small'],
      ['ScrollLock', 'ScrLk', 1, '', 'kb-small'],
      ['Pause', 'Pause', 1, '', 'kb-small']
    ],

    /* Row 1: 数字行 */
    [
      ['Backquote', '`', 1, '~'],
      ['Digit1', '1', 1, '!'], ['Digit2', '2', 1, '@'], ['Digit3', '3', 1, '#'],
      ['Digit4', '4', 1, '$'], ['Digit5', '5', 1, '%'], ['Digit6', '6', 1, '^'],
      ['Digit7', '7', 1, '&'], ['Digit8', '8', 1, '*'], ['Digit9', '9', 1, '('],
      ['Digit0', '0', 1, ')'], ['Minus', '-', 1, '_'], ['Equal', '=', 1, '+'],
      ['Backspace', 'Backspace', 2, '', 'kb-small'],
      null,
      ['Insert', 'Insert', 1, '', 'kb-small'], ['Home', 'Home', 1, '', 'kb-small'],
      ['PageUp', 'PgUp', 1, '', 'kb-small'],
      null,
      ['NumLock', 'NumLk', 1, '', 'kb-small'],
      ['NumpadDivide', '/', 1], ['NumpadMultiply', '*', 1], ['NumpadSubtract', '-', 1]
    ],

    /* Row 2: QWERTY 行 */
    [
      ['Tab', 'Tab', 1.5, '', 'kb-small'],
      ['KeyQ', 'Q', 1], ['KeyW', 'W', 1], ['KeyE', 'E', 1], ['KeyR', 'R', 1],
      ['KeyT', 'T', 1], ['KeyY', 'Y', 1], ['KeyU', 'U', 1], ['KeyI', 'I', 1],
      ['KeyO', 'O', 1], ['KeyP', 'P', 1],
      ['BracketLeft', '[', 1, '{'], ['BracketRight', ']', 1, '}'],
      ['Backslash', '\\', 1.5, '|'],
      null,
      ['Delete', 'Delete', 1, '', 'kb-small'], ['End', 'End', 1, '', 'kb-small'],
      ['PageDown', 'PgDn', 1, '', 'kb-small'],
      null,
      ['Numpad7', '7', 1, 'Home'], ['Numpad8', '8', 1, '↑'], ['Numpad9', '9', 1, 'PgUp'],
      ['NumpadAdd', '+', 1, '', 'kb-tall']
    ],

    /* Row 3: ASDF 行 */
    [
      ['CapsLock', 'Caps', 1.75, '', 'kb-small'],
      ['KeyA', 'A', 1], ['KeyS', 'S', 1], ['KeyD', 'D', 1], ['KeyF', 'F', 1],
      ['KeyG', 'G', 1], ['KeyH', 'H', 1], ['KeyJ', 'J', 1], ['KeyK', 'K', 1],
      ['KeyL', 'L', 1],
      ['Semicolon', ';', 1, ':'], ['Quote', "'", 1, '"'],
      ['Enter', 'Enter', 2.25, '', 'kb-small'],
      null,
      false, false, false,           /* 编辑区 3u 空位（本行无编辑键） */
      null,
      ['Numpad4', '4', 1, '←'], ['Numpad5', '5', 1, ''], ['Numpad6', '6', 1, '→']
    ],

    /* Row 4: ZXCV 行 */
    [
      ['ShiftLeft', 'Shift', 2.25, '', 'kb-small'],
      ['KeyZ', 'Z', 1], ['KeyX', 'X', 1], ['KeyC', 'C', 1], ['KeyV', 'V', 1],
      ['KeyB', 'B', 1], ['KeyN', 'N', 1], ['KeyM', 'M', 1],
      ['Comma', ',', 1, '<'], ['Period', '.', 1, '>'], ['Slash', '/', 1, '?'],
      ['ShiftRight', 'Shift', 2.75, '', 'kb-small'],
      null,
      false,                        /* 编辑区左空位 */
      ['ArrowUp', '↑', 1],
      false,                        /* 编辑区右空位 */
      null,
      ['Numpad1', '1', 1, 'End'], ['Numpad2', '2', 1, '↓'], ['Numpad3', '3', 1, 'PgDn'],
      ['NumpadEnter', 'Enter', 1, '', 'kb-tall kb-small']
    ],

    /* Row 5: 修饰键行 */
    [
      ['ControlLeft', 'Ctrl', 1.25, '', 'kb-small'],
      ['MetaLeft', 'Win', 1.25, '', 'kb-small'],
      ['AltLeft', 'Alt', 1.25, '', 'kb-small'],
      ['Space', 'Space', 6.25, '', 'kb-small'],
      ['AltRight', 'Alt', 1.25, '', 'kb-small'],
      ['MetaRight', 'Win', 1.25, '', 'kb-small'],
      ['ContextMenu', 'Menu', 1.25, '', 'kb-small'],
      ['ControlRight', 'Ctrl', 1.25, '', 'kb-small'],
      null,
      ['ArrowLeft', '←', 1], ['ArrowDown', '↓', 1], ['ArrowRight', '→', 1],
      null,
      ['Numpad0', '0', 2, 'Ins'], ['NumpadDecimal', '.', 1, 'Del']
    ]
  ];

  /* ------------------------------------------------------------
     渲染键盘
     ------------------------------------------------------------ */
  var keyEls = {};   // code -> DOM
  var history = {};  // code -> { label, count }
  var historyOrder = [];
  var totalPress = 0;
  var touchedCount = 0;

  function buildKeyboard() {
    var tray = document.createElement('div');
    tray.className = 'kb-tray';

    LAYOUT.forEach(function (row) {
      var rowEl = document.createElement('div');
      rowEl.className = 'kb-row';

      row.forEach(function (def) {
        if (def === null) {
          var gap = document.createElement('div');
          gap.className = 'kb-gap';
          rowEl.appendChild(gap);
          return;
        }
        if (typeof def === 'object' && def !== null && def.gap) {
          var wideGap = document.createElement('div');
          wideGap.className = 'kb-gap';
          wideGap.style.flexBasis = def.gap + 'px';
          rowEl.appendChild(wideGap);
          return;
        }
        if (def === false) {
          var blank = document.createElement('div');
          blank.className = 'kb-blank';
          rowEl.appendChild(blank);
          return;
        }
        var code = def[0], label = def[1], u = def[2], sub = def[3], extra = def[4] || '';
        var key = document.createElement('div');
        key.className = 'kb-key' + (extra ? ' ' + extra : '');
        key.style.setProperty('--u', u);
        key.dataset.code = code;
        key.setAttribute('role', 'button');
        key.setAttribute('aria-label', label);

        var main = document.createElement('span');
        main.textContent = label;
        key.appendChild(main);

        if (sub) {
          var subEl = document.createElement('span');
          subEl.className = 'kb-sub';
          subEl.textContent = sub;
          key.appendChild(subEl);
        }

        /* 鼠标/触摸模拟按下（移动端友好） */
        (function (k, c) {
          var down = function (e) { e.preventDefault(); pressKey(c, true); };
          var up = function () { releaseKey(c); };
          k.addEventListener('mousedown', down);
          k.addEventListener('mouseup', up);
          k.addEventListener('mouseleave', up);
          k.addEventListener('touchstart', down, { passive: false });
          k.addEventListener('touchend', up);
        })(key, code);

        keyEls[code] = key;
        rowEl.appendChild(key);
      });

      tray.appendChild(rowEl);
    });

    return tray;
  }

  /* ------------------------------------------------------------
     按下 / 释放
     ------------------------------------------------------------ */
  function pressKey(code, synthetic) {
    var el = keyEls[code];
    if (!el) return;

    var wasPressed = el.classList.contains('pressed');
    if (!wasPressed) {
      el.classList.add('pressed');
      if (!el.classList.contains('touched')) {
        el.classList.add('touched');
        touchedCount++;
      }
      totalPress++;
      addHistory(code);
      updateStats();
    }
  }

  function releaseKey(code) {
    var el = keyEls[code];
    if (!el) return;
    el.classList.remove('pressed');
  }

  /* ------------------------------------------------------------
     按键记录
     ------------------------------------------------------------ */
  function addHistory(code) {
    var el = keyEls[code];
    var label = el ? el.getAttribute('aria-label') : code;

    if (!history[code]) {
      history[code] = { label: label, count: 0 };
      historyOrder.push(code);
    }
    history[code].count++;
    renderHistory();
  }

  function renderHistory() {
    var list = document.getElementById('kb-history-list');
    if (!list) return;

    if (!historyOrder.length) {
      list.innerHTML = '<span class="kb-hint">按下键盘上的任意按键，此处会显示按键记录…</span>';
      return;
    }

    /* 最多显示最近 24 个不同按键 */
    var recent = historyOrder.slice(-24);
    var html = recent.map(function (code) {
      var h = history[code];
      return '<span class="kb-chip">' + escapeHtml(h.label) +
        (h.count > 1 ? '<span class="kb-chip-count">×' + h.count + '</span>' : '') +
        '</span>';
    }).join('');
    list.innerHTML = html;
  }

  function escapeHtml(s) {
    return String(s).replace(/&/g, '&').replace(/</g, '<').replace(/>/g, '>');
  }

  /* ------------------------------------------------------------
     统计
     ------------------------------------------------------------ */
  function updateStats() {
    var totalEl = document.getElementById('kb-stat-total');
    var touchedEl = document.getElementById('kb-stat-touched');
    var activeEl = document.getElementById('kb-stat-active');
    if (totalEl) totalEl.textContent = totalPress;
    if (touchedEl) touchedEl.textContent = touchedCount + ' / 108';
    if (activeEl) {
      var n = document.querySelectorAll('.kb-key.pressed').length;
      activeEl.textContent = n;
      activeEl.closest('.kb-stat-card').classList.toggle('is-active', n > 0);
    }
  }

  /* ------------------------------------------------------------
     重置
     ------------------------------------------------------------ */
  function reset() {
    Object.keys(keyEls).forEach(function (code) {
      keyEls[code].classList.remove('pressed', 'touched');
    });
    history = {};
    historyOrder = [];
    totalPress = 0;
    touchedCount = 0;
    renderHistory();
    updateStats();
  }

  /* ------------------------------------------------------------
     全局键盘事件
     ------------------------------------------------------------ */
  document.addEventListener('keydown', function (e) {
    /* 阻止 F1-F12 / Tab 等默认行为，保证测试不被打断 */
    if (keyEls[e.code]) {
      if (e.code === 'Tab' || e.code.indexOf('F') === 0 || e.code === 'Space' ||
          e.code === 'ArrowUp' || e.code === 'ArrowDown' || e.code === 'ArrowLeft' ||
          e.code === 'ArrowRight' || e.code === 'Backspace' || e.code === 'Slash' ||
          e.code === 'Quote') {
        e.preventDefault();
      }
      pressKey(e.code);
    }
  });

  document.addEventListener('keyup', function (e) {
    releaseKey(e.code);
  });

  /* 窗口失焦时释放所有键，避免卡键 */
  window.addEventListener('blur', function () {
    Object.keys(keyEls).forEach(releaseKey);
  });

  /* ------------------------------------------------------------
     初始化
     ------------------------------------------------------------ */
  function init() {
    container.innerHTML = '';

    /* 页面标题居中（仅键盘测试页） */
    var pageTitle = document.querySelector('.post-title');
    if (pageTitle) pageTitle.style.textAlign = 'center';

    /* 统计栏 */
    var stats = document.createElement('div');
    stats.className = 'kb-stats';
    stats.innerHTML =
      '<div class="kb-stat-card">总按键 <strong id="kb-stat-total">0</strong></div>' +
      '<div class="kb-stat-card">已测试键位 <strong id="kb-stat-touched">0 / 108</strong></div>' +
      '<div class="kb-stat-card">当前按下 <strong id="kb-stat-active">0</strong></div>';
    container.appendChild(stats);

    /* 键盘 */
    var deck = document.createElement('div');
    deck.className = 'kb-deck';
    deck.appendChild(buildKeyboard());
    container.appendChild(deck);

    /* 按键记录 */
    var historyBox = document.createElement('div');
    historyBox.className = 'kb-history';
    historyBox.innerHTML =
      '<h3>按键记录 <button class="kb-reset-btn" type="button">重置</button></h3>' +
      '<div class="kb-history-list" id="kb-history-list"></div>';
    container.appendChild(historyBox);

    historyBox.querySelector('.kb-reset-btn').addEventListener('click', reset);

    renderHistory();
    updateStats();
  }

  init();
})();
