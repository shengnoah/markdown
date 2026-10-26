// Typora theme scripts
(function () {
  // Sticky header shadow
  var header = document.getElementById('site-header');
  window.addEventListener('scroll', function () {
    if (window.scrollY > 10) {
      header.classList.add('scrolled');
    } else {
      header.classList.remove('scrolled');
    }
  });

  // Nav dropdown (算法演示)
  var dropdown = document.getElementById('nav-dropdown');
  var dropdownToggle = document.getElementById('nav-dropdown-toggle');
  if (dropdown && dropdownToggle) {
    dropdownToggle.addEventListener('click', function (e) {
      e.stopPropagation();
      var isOpen = dropdown.classList.toggle('open');
      dropdownToggle.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
    });
    // hover 展开（桌面端）
    dropdown.addEventListener('mouseenter', function () {
      dropdown.classList.add('open');
      dropdownToggle.setAttribute('aria-expanded', 'true');
    });
    dropdown.addEventListener('mouseleave', function () {
      dropdown.classList.remove('open');
      dropdownToggle.setAttribute('aria-expanded', 'false');
    });
    // 点击菜单项后收起
    dropdown.querySelectorAll('.nav-dropdown-item').forEach(function (item) {
      item.addEventListener('click', function () {
        dropdown.classList.remove('open');
        dropdownToggle.setAttribute('aria-expanded', 'false');
      });
    });
    // 点击页面其他位置收起
    document.addEventListener('click', function () {
      dropdown.classList.remove('open');
      dropdownToggle.setAttribute('aria-expanded', 'false');
    });
    // Esc 收起
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') {
        dropdown.classList.remove('open');
        dropdownToggle.setAttribute('aria-expanded', 'false');
      }
    });
  }

  // Mobile nav toggle
  var toggle = document.getElementById('nav-toggle');
  var nav = document.getElementById('site-nav');
  if (toggle && nav) {
    toggle.addEventListener('click', function () {
      nav.classList.toggle('open');
    });
    nav.querySelectorAll('a').forEach(function (link) {
      link.addEventListener('click', function () {
        nav.classList.remove('open');
      });
    });
  }

  // Hero typing effect: the whole window-body document (heading, paragraph,
  // quote, list, code block) is typed character by character like someone
  // writing in the editor, then backspaced away — endlessly looping.
  var stage = document.getElementById('hero-window-body');
  if (stage) {
    // Typing script: each block = { tag, parent?, code?, segments }
    // segment = { text, tag? (strong/em), cls? (code token color) }
    var script = [
      { tag: 'h2', segments: [{ text: '# 欢迎使用 Xianbao' }] },
      { tag: 'p', segments: [
        { text: '用' },
        { text: '轻松', tag: 'strong' },
        { text: '而' },
        { text: '优雅', tag: 'em' },
        { text: '的方式书写。所见即所得。' }
      ] },
      { tag: 'blockquote', segments: [{ text: '"简约是极致的精致。"' }] },
      { tag: 'li', parent: 'ul', segments: [{ text: '输入时实时预览' }] },
      { tag: 'li', parent: 'ul', segments: [{ text: '专注模式与打字机模式' }] },
      { tag: 'li', parent: 'ul', segments: [{ text: '导出为 PDF、HTML、Word' }] },
      { tag: 'pre', code: true, segments: [
        { text: 'function', cls: 'tok-keyword' },
        { text: ' ', cls: '' },
        { text: 'greet', cls: 'tok-fn' },
        { text: '() {\n  ', cls: '' },
        { text: 'return', cls: 'tok-keyword' },
        { text: ' ', cls: '' },
        { text: '"你好，Xianbao！"', cls: 'tok-string' },
        { text: ';\n}', cls: '' }
      ] }
    ];

  var TYPE_START_DELAY = 600;    // delay before first character
  var CJK_CHAR_DELAY = 95;       // CJK chars base delay (+ jitter)
  var ASCII_CHAR_DELAY = 55;     // ascii chars base delay (+ jitter)
  var SPACE_DELAY = 30;          // fast through spaces
  var NEWLINE_DELAY = 380;       // pause at line breaks
  var BLOCK_PAUSE = 450;         // pause between blocks
  var HOLD_AFTER_TYPED = 5000;   // keep full document before deleting
  var DELETE_CHAR_DELAY = 22;    // backspace speed
  var HOLD_AFTER_DELETED = 800;  // pause before retyping

  stage.textContent = '';
  var cursor = document.createElement('span');
  cursor.className = 'typing-cursor';
  stage.appendChild(cursor);

  var typedSpans = [];   // every created segment element, in order
  var parents = {};      // shared parent elements, e.g. the <ul>
  var blockIndex = 0;
  var segIndex = 0;
  var charIndex = 0;
  var blockEl = null;    // element receiving the current block
  var segEl = null;      // element receiving the current segment

      function startBlock() {
        var block = script[blockIndex];
        var host = stage;
        if (block.parent) {
          if (!parents[block.parent]) {
            parents[block.parent] = document.createElement(block.parent);
            stage.appendChild(parents[block.parent]);
          }
          host = parents[block.parent];
        }
        blockEl = document.createElement(block.tag);
        host.appendChild(blockEl);
        if (block.code) {
          var codeEl = document.createElement('code');
          blockEl.appendChild(codeEl);
          blockEl = codeEl; // segments go inside <code>
        }
        blockEl.appendChild(cursor);
      }

      function typeStep() {
        var block = script[blockIndex];
        if (!blockEl) startBlock();
        var seg = block.segments[segIndex];
        if (charIndex === 0) {
          segEl = seg.tag ? document.createElement(seg.tag) : document.createElement('span');
          if (seg.cls) segEl.className = seg.cls;
          blockEl.insertBefore(segEl, cursor);
          typedSpans.push(segEl);
        }
        var ch = seg.text.charAt(charIndex);
        segEl.textContent += ch;
        charIndex++;

        if (charIndex >= seg.text.length) {
          segIndex++;
          charIndex = 0;
          segEl = null;
          if (segIndex >= block.segments.length) {
            blockIndex++;
            segIndex = 0;
            blockEl = null;
            if (blockIndex >= script.length) {
              // fully typed → hold, then backspace everything
              setTimeout(deleteStep, HOLD_AFTER_TYPED);
              return;
            }
            setTimeout(typeStep, BLOCK_PAUSE);
            return;
          }
        }

        var delay;
        if (ch === '\n') {
          delay = NEWLINE_DELAY;
        } else if (ch === ' ') {
          delay = SPACE_DELAY;
        } else if (ch.charCodeAt(0) > 0x2e80) {
          delay = CJK_CHAR_DELAY + Math.random() * 60;
        } else {
          delay = ASCII_CHAR_DELAY + Math.random() * 50;
        }
        setTimeout(typeStep, delay);
      }

      function deleteStep() {
        if (typedSpans.length === 0) {
          // wipe leftover empty containers, then restart from the top
          Array.prototype.slice.call(stage.childNodes).forEach(function (node) {
            if (node !== cursor) stage.removeChild(node);
          });
          parents = {};
          blockIndex = 0;
          segIndex = 0;
          charIndex = 0;
          blockEl = null;
          segEl = null;
          setTimeout(typeStep, HOLD_AFTER_DELETED);
          return;
        }
        var last = typedSpans[typedSpans.length - 1];
        last.textContent = last.textContent.slice(0, -1);
        if (!last.textContent) {
          var container = last.parentNode;
          container.removeChild(last);
          typedSpans.pop();
          // move cursor to the new tail
          if (typedSpans.length > 0) {
            typedSpans[typedSpans.length - 1].parentNode.appendChild(cursor);
          } else {
            stage.appendChild(cursor);
          }
          // drop the container if it is now empty
          if (container !== stage && container.childNodes.length === 0) {
            var grand = container.parentNode;
            if (grand) grand.removeChild(container);
            if (grand && grand !== stage && grand.childNodes.length === 0) {
              if (grand.parentNode) grand.parentNode.removeChild(grand);
            }
          }
        }
        setTimeout(deleteStep, DELETE_CHAR_DELAY);
      }

  setTimeout(typeStep, TYPE_START_DELAY);
  }
})();
