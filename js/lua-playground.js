/* ============================================================
   Lua Playground — 在线编辑器前端
   依赖 lua-core.js + lua-stdlib.js（纯 JavaScript 解释器）
   ============================================================ */
(function () {
  'use strict';

  if (typeof document === 'undefined') return;
  var codeEl = document.getElementById('lua-code');
  if (!codeEl || typeof LuaJS === 'undefined') return;

  var highlightEl = document.getElementById('lua-highlight');
  var gutterEl = document.getElementById('lua-gutter-inner');
  var countsEl = document.getElementById('lua-counts');
  var outputEl = document.getElementById('lua-output');
  var outputBody = document.getElementById('lua-output-body');
  var errorWrap = document.getElementById('lua-error-wrap');
  var errorEl = document.getElementById('lua-error');
  var tracebackEl = document.getElementById('lua-traceback');
  var tracebackText = document.getElementById('lua-traceback-text');
  var outputNote = document.getElementById('lua-output-note');
  var runBtn = document.getElementById('lua-run');
  var resetBtn = document.getElementById('lua-reset');
  var shareBtn = document.getElementById('lua-share');
  var downloadBtn = document.getElementById('lua-download');
  var exampleSelect = document.getElementById('lua-example');
  var stdinEl = document.getElementById('lua-stdin');
  var stdinBody = document.getElementById('lua-stdin-body');
  var tabOutput = document.getElementById('lua-tab-output');
  var tabStdin = document.getElementById('lua-tab-stdin');
  var statusEl = document.getElementById('lua-status');
  var statusDot = document.getElementById('lua-status-dot');
  var statusText = document.getElementById('lua-status-text');
  var timeEl = document.getElementById('lua-time');
  var stepsEl = document.getElementById('lua-steps');
  var messageEl = document.getElementById('lua-message');

  var STORAGE_KEY = 'lua-playground-code-v1';
  var MAX_OUTPUT = 300000;
  var MAX_STEPS = 3000000;
  var TIME_LIMIT = 5000;
  var currentExample = 'welcome';
  var outputChars = 0;
  var truncated = false;
  var outputNode = null;
  var saveTimer = null;

  /* ---------------- 示例程序 ---------------- */

  var EXAMPLES = {
    welcome: {
      label: '👋 语言速览',
      code: [
        '-- Lua 在线解释器：点击「运行」或按 Ctrl/⌘ + Enter',
        'print("Hello, Lua!")',
        '',
        '-- 变量、字符串与数字',
        'local name = "世界"',
        'local n = 3',
        'print("你好，" .. name .. "！")',
        'print("n 的平方是", n ^ 2)',
        'print(("%d + %d = %d"):format(7, 8, 7 + 8))',
        '',
        '-- 表：Lua 唯一的复合数据结构',
        'local t = { 10, 20, 30, fruit = "apple" }',
        'for i, v in ipairs(t) do',
        '  print(i, v)',
        'end',
        'print(t.fruit, #t)',
        '',
        '-- 函数与多返回值',
        'local function minmax(a, b)',
        '  if a < b then return a, b end',
        '  return b, a',
        'end',
        'print(minmax(8, 3))',
        '',
        '-- 常用标准库',
        'print(math.floor(3.9), string.upper("lua"), table.concat({1, 2, 3}, "-"))',
      ].join('\n'),
    },

    closures: {
      label: '🔒 闭包与迭代器',
      code: [
        '-- 闭包：函数会记住它捕获的 upvalue',
        'local function makeCounter()',
        '  local count = 0',
        '  return function(step)',
        '    count = count + (step or 1)',
        '    return count',
        '  end',
        'end',
        '',
        'local c1 = makeCounter()',
        'local c2 = makeCounter()',
        'print(c1(), c1(5), c1())',
        'print(c2())',
        '',
        '-- 用闭包实现一个不带协程的迭代器',
        'local function range(n)',
        '  local i = 0',
        '  return function()',
        '    i = i + 1',
        '    if i <= n then return i end',
        '  end',
        'end',
        '',
        'local sum = 0',
        'for i in range(10) do sum = sum + i end',
        'print("1..10 =", sum)',
        '',
        '-- 记忆化递归：memo 同样是闭包捕获的 upvalue',
        'local memo = { [0] = 0, [1] = 1 }',
        'local function fib(n)',
        '  if memo[n] == nil then',
        '    memo[n] = fib(n - 1) + fib(n - 2)',
        '  end',
        '  return memo[n]',
        'end',
        'print("fib(40) =", fib(40))',
      ].join('\n'),
    },

    metatables: {
      label: '🧱 元表与面向对象',
      code: [
        '-- 用元表实现一个二维向量类',
        'local Vector = {}',
        'Vector.__index = Vector',
        '',
        'function Vector.new(x, y)',
        '  return setmetatable({ x = x, y = y }, Vector)',
        'end',
        '',
        'function Vector:__tostring()',
        '  return string.format("Vector(%g, %g)", self.x, self.y)',
        'end',
        '',
        'function Vector:__add(other)',
        '  return Vector.new(self.x + other.x, self.y + other.y)',
        'end',
        '',
        'function Vector:__mul(k)',
        '  return Vector.new(self.x * k, self.y * k)',
        'end',
        '',
        'function Vector:__eq(other)',
        '  return self.x == other.x and self.y == other.y',
        'end',
        '',
        'function Vector:__lt(other)',
        '  return self:length() < other:length()',
        'end',
        '',
        'function Vector:length()',
        '  return math.sqrt(self.x ^ 2 + self.y ^ 2)',
        'end',
        '',
        'local a = Vector.new(3, 4)',
        'local b = Vector.new(1, 2)',
        'print(a, b)',
        'print("a + b =", a + b)',
        'print("a * 3 =", a * 3)',
        'print("a == Vector(3,4):", a == Vector.new(3, 4))',
        'print("a < b:", a < b)',
        'print("a 的长度:", a:length())',
        '',
        '-- 继承：子类的 __index 指向父类',
        'local Named = setmetatable({}, { __index = Vector })',
        'Named.__index = Named',
        'Named.__tostring = Vector.__tostring',
        'function Named.new(x, y, name)',
        '  local v = Vector.new(x, y)',
        '  v.name = name',
        '  return setmetatable(v, Named)',
        'end',
        'local p = Named.new(5, 12, "P")',
        'print(p, "长度", p:length(), "名字", p.name)',
      ].join('\n'),
    },

    coroutines: {
      label: '🔁 协程',
      code: [
        '-- 协程：可以在任意位置暂停和恢复的函数',
        'local function producer()',
        '  for i = 1, 5 do',
        '    coroutine.yield("item-" .. i)',
        '  end',
        '  return "done"',
        'end',
        '',
        'local co = coroutine.create(producer)',
        'while true do',
        '  local ok, value = coroutine.resume(co)',
        '  print(ok, value)',
        '  if coroutine.status(co) == "dead" then break end',
        'end',
        '',
        '-- coroutine.wrap：把协程包装成可调用函数',
        'local function counter(n)',
        '  return coroutine.wrap(function()',
        '    for i = 1, n do coroutine.yield(i) end',
        '  end)',
        'end',
        '',
        'local total = 0',
        'for i in counter(100) do total = total + i end',
        'print("1..100 =", total)',
        '',
        '-- 生产者 / 消费者',
        'local function range(n)',
        '  return coroutine.create(function()',
        '    for i = 1, n do coroutine.yield(i) end',
        '    return nil',
        '  end)',
        'end',
        '',
        'local gen = range(3)',
        'while true do',
        '  local ok, value = coroutine.resume(gen)',
        '  if not ok or value == nil then break end',
        '  print("消费", value)',
        'end',
      ].join('\n'),
    },

    patterns: {
      label: '🔤 模式匹配',
      code: [
        '-- Lua 的模式匹配不是正则表达式',
        'local text = [[',
        'Lua 5.4 released in 2020',
        'JavaScript is everywhere',
        'lua patterns are powerful',
        ']]',
        '',
        '-- gsub 的第二个返回值是替换次数',
        'print("单词数:", select(2, text:gsub("%a+", "")))',
        '',
        '-- 逐行处理，提取四位年份',
        'for line in text:gmatch("[^\\n]+") do',
        '  local year = line:match("(%d%d%d%d)")',
        '  print(line, year or "-")',
        'end',
        '',
        '-- 捕获组与反向引用',
        'local kv = "name=Alice, age=30, city=Beijing"',
        'for k, v in kv:gmatch("(%w+)=(%w+)") do',
        '  print(k, v)',
        'end',
        'print((kv:gsub("(%w+)=(%w+)", "%2=%1")))',
        '',
        '-- %b 平衡匹配，%f 边界匹配',
        'print(("f(a(b)c)d"):match("%b()"))',
        'print(("hello world"):match("%f[%w]world"))',
        '',
        '-- 格式化输出',
        'print(string.format("|%-8s|%6.2f|%04d|", "Lua", math.pi, 42))',
      ].join('\n'),
    },

    sorting: {
      label: '📊 排序算法',
      code: [
        '-- 递归快排 + table.sort',
        'local function quicksort(t, lo, hi)',
        '  lo = lo or 1',
        '  hi = hi or #t',
        '  if lo >= hi then return t end',
        '  local pivot = t[hi]',
        '  local i = lo - 1',
        '  for j = lo, hi - 1 do',
        '    if t[j] <= pivot then',
        '      i = i + 1',
        '      t[i], t[j] = t[j], t[i]',
        '    end',
        '  end',
        '  t[i + 1], t[hi] = t[hi], t[i + 1]',
        '  quicksort(t, lo, i)',
        '  quicksort(t, i + 2, hi)',
        '  return t',
        'end',
        '',
        'local data = { 64, 25, 12, 22, 11, 90, 5, 77, 30 }',
        'print("原始:", table.concat(data, " "))',
        'quicksort(data)',
        'print("快排:", table.concat(data, " "))',
        '',
        '-- 按字段排序',
        'local people = {',
        '  { name = "Alice", age = 30 },',
        '  { name = "Bob", age = 24 },',
        '  { name = "Cathy", age = 35 },',
        '}',
        'table.sort(people, function(a, b) return a.age < b.age end)',
        'for _, p in ipairs(people) do',
        '  print(p.name, p.age)',
        'end',
        '',
        '-- 自定义比较：先按长度，再按字典序',
        'local words = { "banana", "fig", "apple", "kiwi" }',
        'table.sort(words, function(a, b)',
        '  if #a == #b then return a < b end',
        '  return #a < #b',
        'end)',
        'print(table.concat(words, " "))',
      ].join('\n'),
    },

    queens: {
      label: '♛ 八皇后',
      code: [
        '-- 八皇后：递归回溯，找出全部 92 个解',
        'local N = 8',
        'local solution = {}',
        'local count = 0',
        '',
        'local function safe(row, col)',
        '  for r = 1, row - 1 do',
        '    local c = solution[r]',
        '    if c == col or math.abs(c - col) == row - r then',
        '      return false',
        '    end',
        '  end',
        '  return true',
        'end',
        '',
        'local function solve(row)',
        '  if row > N then',
        '    count = count + 1',
        '    if count == 1 then',
        '      for r = 1, N do',
        '        local line = {}',
        '        for c = 1, N do',
        '          line[c] = (solution[r] == c) and "Q" or "."',
        '        end',
        '        print(table.concat(line, " "))',
        '      end',
        '    end',
        '    return',
        '  end',
        '  for col = 1, N do',
        '    if safe(row, col) then',
        '      solution[row] = col',
        '      solve(row + 1)',
        '    end',
        '  end',
        'end',
        '',
        'solve(1)',
        'print("八皇后解的总数:", count)',
      ].join('\n'),
    },

    serializer: {
      label: '🧪 序列化器',
      code: [
        '-- 用递归写一个简单的 Lua 值序列化器',
        'local function serialize(value, indent)',
        '  indent = indent or ""',
        '  local t = type(value)',
        '  if t == "nil" or t == "boolean" or t == "number" then',
        '    return tostring(value)',
        '  elseif t == "string" then',
        '    return string.format("%q", value)',
        '  elseif t == "table" then',
        '    local parts = {}',
        '    local nextIndent = indent .. "  "',
        '    for k, v in pairs(value) do',
        '      local key',
        '      if type(k) == "string" and k:match("^[%a_][%w_]*$") then',
        '        key = k',
        '      else',
        '        key = "[" .. serialize(k) .. "]"',
        '      end',
        '      table.insert(parts, nextIndent .. key .. " = " .. serialize(v, nextIndent))',
        '    end',
        '    if #parts == 0 then return "{}" end',
        '    return "{\\n" .. table.concat(parts, ",\\n") .. "\\n" .. indent .. "}"',
        '  end',
        '  return tostring(value)',
        'end',
        '',
        'local data = {',
        '  name = "Lua",',
        '  version = 5.4,',
        '  tags = { "script", "embedded", "fast" },',
        '  meta = { author = "PUC-Rio", year = 1993 },',
        '}',
        'print(serialize(data))',
      ].join('\n'),
    },
  };

  /* ---------------- 语法高亮 ---------------- */

  var KEYWORDS = new Set([
    'and', 'break', 'do', 'else', 'elseif', 'end', 'false', 'for', 'function',
    'goto', 'if', 'in', 'local', 'nil', 'not', 'or', 'repeat', 'return',
    'then', 'true', 'until', 'while',
  ]);

  var TOKEN_RE = new RegExp([
    '--\\[(=*)\\[[\\s\\S]*?\\]\\1\\]',
    '--[^\\n]*',
    '\\[(=*)\\[[\\s\\S]*?\\]\\2\\]',
    '"(?:\\\\.|[^"\\\\\\n])*"',
    "'(?:\\\\.|[^'\\\\\\n])*'",
    '0[xX][0-9a-fA-F]*(?:\\.[0-9a-fA-F]*)?(?:[pP][+-]?\\d+)?',
    '\\b\\d+(?:\\.\\d*)?(?:[eE][+-]?\\d+)?\\b',
    '\\b[A-Za-z_]\\w*\\b',
    '\\.\\.\\.?',
    '[+\\-*/%^#&~|<>=]+',
    '[{}()\\[\\];:,.]',
  ].join('|'), 'g');

  function escapeHtml(text) {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  function isLongBracket(token) {
    return token[0] === '[' && (token[1] === '[' || token[1] === '=');
  }

  function highlightLua(source) {
    var html = '';
    var last = 0;
    TOKEN_RE.lastIndex = 0;
    var match;
    while ((match = TOKEN_RE.exec(source))) {
      var token = match[0];
      var start = match.index;
      if (start > last) html += escapeHtml(source.slice(last, start));
      last = start + token.length;
      var cls = '';
      if (token.startsWith('--')) cls = 'tok-comment';
      else if (isLongBracket(token)) cls = 'tok-string';
      else if (token[0] === '"' || token[0] === "'") cls = 'tok-string';
      else if (KEYWORDS.has(token)) cls = (token === 'true' || token === 'false' || token === 'nil') ? 'tok-literal' : 'tok-keyword';
      else if (/^0[xX]/.test(token) || /^\d/.test(token)) cls = 'tok-number';
      else if (/^[A-Za-z_]/.test(token)) {
        var rest = source.slice(last);
        cls = /^\s*\(/.test(rest) ? 'tok-function' : '';
      } else if (/^[+\-*/%^#&~|<>=]+$/.test(token)) cls = 'tok-operator';
      if (cls) html += '<span class="' + cls + '">' + escapeHtml(token) + '</span>';
      else html += escapeHtml(token);
    }
    if (last < source.length) html += escapeHtml(source.slice(last));
    return html;
  }

  function updateEditor() {
    var source = codeEl.value;
    highlightEl.innerHTML = highlightLua(source) + '\n';

    var lines = source.split('\n').length;
    var numbers = '';
    for (var i = 1; i <= lines; i++) numbers += i + '\n';
    gutterEl.textContent = numbers;

    countsEl.textContent = lines + ' 行 · ' + source.length + ' 字符';
    syncExampleSelection();
    syncScroll();

    clearTimeout(saveTimer);
    saveTimer = setTimeout(function () {
      try { localStorage.setItem(STORAGE_KEY, source); } catch (e) { /* ignore */ }
    }, 400);
  }

  function syncScroll() {
    highlightEl.scrollTop = codeEl.scrollTop;
    highlightEl.scrollLeft = codeEl.scrollLeft;
    gutterEl.style.transform = 'translateY(' + (-codeEl.scrollTop) + 'px)';
  }

  /* ---------------- 输出 ---------------- */

  function setStatus(state, label, detail) {
    statusEl.textContent = label;
    statusEl.setAttribute('data-state', state);
    statusDot.className = 'lua-status-dot lua-dot-' + state;
    statusText.textContent = detail || label;
  }

  function clearOutput() {
    outputEl.textContent = '';
    outputNode = null;
    outputChars = 0;
    truncated = false;
    errorWrap.hidden = true;
    tracebackEl.hidden = true;
    outputNote.hidden = true;
    errorEl.textContent = '';
    tracebackText.textContent = '';
  }

  function appendOutput(text) {
    if (!text) return;
    if (truncated) return;
    if (outputChars + text.length > MAX_OUTPUT) {
      text = text.slice(0, Math.max(0, MAX_OUTPUT - outputChars));
      truncated = true;
      outputNote.hidden = false;
      outputNote.textContent = '输出过长，已截断（上限 ' + Math.round(MAX_OUTPUT / 1000) + 'K 字符）。';
    }
    outputChars += text.length;
    if (!outputNode) {
      outputEl.textContent = '';
      outputNode = document.createTextNode('');
      outputEl.appendChild(outputNode);
    }
    outputNode.appendData(text);
  }

  function showPlaceholder(text) {
    outputEl.textContent = '';
    var span = document.createElement('span');
    span.className = 'lua-placeholder';
    span.textContent = text;
    outputEl.appendChild(span);
    outputNode = null;
  }

  function showError(message, traceback) {
    errorEl.textContent = message;
    errorWrap.hidden = false;
    if (traceback) {
      tracebackText.textContent = traceback;
      tracebackEl.hidden = false;
    } else {
      tracebackEl.hidden = true;
    }
  }

  function formatTime(ms) {
    if (ms < 1) return '<1 ms';
    if (ms < 1000) return Math.round(ms) + ' ms';
    return (ms / 1000).toFixed(2) + ' s';
  }

  function formatSteps(steps) {
    if (steps >= 1000000) return (steps / 1000000).toFixed(2) + 'M';
    if (steps >= 1000) return (steps / 1000).toFixed(1) + 'K';
    return String(steps);
  }

  function run() {
    var source = codeEl.value;
    clearOutput();
    setStatus('running', 'RUNNING', '运行中');
    timeEl.textContent = '—';
    stepsEl.textContent = '—';
    messageEl.textContent = '正在执行…';

    var startedAt = (typeof performance !== 'undefined' ? performance.now() : Date.now());
    var interpreter;
    try {
      interpreter = LuaJS.create({
        stdout: appendOutput,
        stdin: stdinEl.value,
        maxSteps: MAX_STEPS,
        timeLimit: TIME_LIMIT,
        maxDepth: 200,
      });
      interpreter.execute(source, { chunkName: 'main.lua' });
      var elapsed = (typeof performance !== 'undefined' ? performance.now() : Date.now()) - startedAt;

      if (!outputChars) showPlaceholder('程序运行成功，但没有输出。试试调用 print(...) 或 io.write(...)。');
      timeEl.textContent = formatTime(elapsed);
      stepsEl.textContent = formatSteps(interpreter.steps);
      setStatus('ok', 'OK', '运行成功');
      messageEl.textContent = '执行完成 · ' + formatSteps(interpreter.steps) + ' 步';
    } catch (err) {
      var elapsedError = (typeof performance !== 'undefined' ? performance.now() : Date.now()) - startedAt;
      var message = LuaJS.errorMessage(err);
      var traceback = err && err.luaTraceback ? err.luaTraceback : '';
      if (!outputChars) {
        outputEl.textContent = '';
        outputNode = null;
      }
      showError(message, traceback);
      timeEl.textContent = formatTime(elapsedError);
      stepsEl.textContent = interpreter ? formatSteps(interpreter.steps) : '—';
      var timeout = /执行超时|执行步数超过上限|stack overflow/.test(message);
      setStatus('error', 'ERROR', timeout ? '已中断' : '运行出错');
      messageEl.textContent = timeout ? '已触发安全限制' : (traceback ? '展开下方「调用栈」查看调用链' : '请检查代码后重试');
      if (timeout) {
        outputNote.hidden = false;
        outputNote.textContent = '为避免死循环卡住页面，单次运行限制为 ' + formatSteps(MAX_STEPS) + ' 步 / ' + (TIME_LIMIT / 1000) + ' 秒。';
      }
    }
    outputBody.scrollTop = 0;
    switchTab('output');
  }

  /* ---------------- 标签页 ---------------- */

  function switchTab(name) {
    var isOutput = name === 'output';
    tabOutput.classList.toggle('active', isOutput);
    tabStdin.classList.toggle('active', !isOutput);
    tabOutput.setAttribute('aria-selected', isOutput ? 'true' : 'false');
    tabStdin.setAttribute('aria-selected', isOutput ? 'false' : 'true');
    outputBody.hidden = !isOutput;
    stdinBody.hidden = isOutput;
  }

  /* ---------------- 示例 ---------------- */

  function buildExampleMenu() {
    Object.keys(EXAMPLES).forEach(function (key) {
      var option = document.createElement('option');
      option.value = key;
      option.textContent = EXAMPLES[key].label;
      exampleSelect.appendChild(option);
    });
    var custom = document.createElement('option');
    custom.value = 'custom';
    custom.textContent = '✎ 自定义代码';
    custom.hidden = true;
    exampleSelect.appendChild(custom);
    exampleSelect.value = currentExample;
  }

  function syncExampleSelection() {
    var source = codeEl.value;
    var matched = null;
    Object.keys(EXAMPLES).forEach(function (key) {
      if (!matched && EXAMPLES[key].code === source) matched = key;
    });
    if (matched) {
      currentExample = matched;
      exampleSelect.value = matched;
      exampleSelect.options[exampleSelect.options.length - 1].hidden = true;
    } else {
      exampleSelect.value = 'custom';
      exampleSelect.options[exampleSelect.options.length - 1].hidden = false;
    }
  }

  function loadExample(name, silent) {
    var example = EXAMPLES[name];
    if (!example) return;
    exampleSelect.options[exampleSelect.options.length - 1].hidden = true;
    currentExample = name;
    codeEl.value = example.code;
    exampleSelect.value = name;
    updateEditor();
    codeEl.scrollTop = 0;
    codeEl.scrollLeft = 0;
    syncScroll();
    if (!silent) {
      clearOutput();
      showPlaceholder('已加载示例「' + example.label.replace(/^[^\s]+\s*/, '') + '」，点击运行查看结果。');
      setStatus('ready', 'READY', '就绪');
      timeEl.textContent = '—';
      stepsEl.textContent = '—';
      messageEl.textContent = '纯 JavaScript · 无网络请求';
    }
  }

  /* ---------------- 分享链接 ---------------- */

  function encodeCode(text) {
    var bytes = new TextEncoder().encode(text);
    var binary = '';
    for (var i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
    return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }

  function decodeCode(text) {
    var base64 = text.replace(/-/g, '+').replace(/_/g, '/');
    while (base64.length % 4) base64 += '=';
    var binary = atob(base64);
    var bytes = new Uint8Array(binary.length);
    for (var i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return new TextDecoder().decode(bytes);
  }

  function readHashCode() {
    var hash = location.hash || '';
    var marker = '#code=';
    if (hash.indexOf(marker) !== 0) return null;
    try {
      return decodeCode(hash.slice(marker.length));
    } catch (e) {
      return null;
    }
  }

  function copyText(text, button, doneLabel) {
    function done() {
      var original = button.textContent;
      button.textContent = doneLabel;
      setTimeout(function () { button.textContent = original; }, 1600);
    }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(done, function () { fallback(); });
    } else {
      fallback();
    }
    function fallback() {
      var area = document.createElement('textarea');
      area.value = text;
      area.style.position = 'fixed';
      area.style.opacity = '0';
      document.body.appendChild(area);
      area.select();
      try { document.execCommand('copy'); done(); } catch (e) { window.prompt('复制下面的链接：', text); }
      document.body.removeChild(area);
    }
  }

  /* ---------------- 事件绑定 ---------------- */

  codeEl.addEventListener('input', updateEditor);
  codeEl.addEventListener('scroll', syncScroll);

  codeEl.addEventListener('keydown', function (event) {
    var key = event.key;
    if ((event.ctrlKey || event.metaKey) && key === 'Enter') {
      event.preventDefault();
      run();
      return;
    }
    if (key === 'Tab') {
      event.preventDefault();
      var start = codeEl.selectionStart;
      var end = codeEl.selectionEnd;
      var value = codeEl.value;
      var indent = '  ';
      // 多行选中时整体缩进
      if (start !== end && value.slice(start, end).indexOf('\n') >= 0) {
        var before = value.slice(0, start);
        var selected = value.slice(start, end);
        var after = value.slice(end);
        var lineStart = before.lastIndexOf('\n') + 1;
        var block = before.slice(lineStart) + selected;
        var shifted = block.split('\n').map(function (line) {
          return event.shiftKey ? line.replace(/^ {1,2}/, '') : indent + line;
        }).join('\n');
        codeEl.value = value.slice(0, lineStart) + shifted + after;
        codeEl.selectionStart = start + (event.shiftKey ? -Math.min(2, block.length) : indent.length);
        codeEl.selectionEnd = end + (event.shiftKey ? -Math.min(2, block.length) : indent.length);
      } else {
        codeEl.value = value.slice(0, start) + indent + value.slice(end);
        codeEl.selectionStart = codeEl.selectionEnd = start + indent.length;
      }
      updateEditor();
      return;
    }
    if (key === 'Enter' && !event.shiftKey && !event.ctrlKey && !event.metaKey) {
      var pos = codeEl.selectionStart;
      var endPos = codeEl.selectionEnd;
      var text = codeEl.value;
      var lineStart = text.lastIndexOf('\n', pos - 1) + 1;
      var currentLine = text.slice(lineStart, pos);
      var leading = /^[ \t]*/.exec(currentLine)[0];
      var trimmed = currentLine.replace(/\s+$/, '');
      var extra = '';
      if (/(\bthen|\bdo|\bfunction|\brepeat|\belse|\{)\s*$/.test(trimmed)) extra = '  ';
      // 当前行只有空白时，回车清空缩进
      if (!trimmed) leading = '';
      event.preventDefault();
      var insert = '\n' + leading + extra;
      codeEl.value = text.slice(0, pos) + insert + text.slice(endPos);
      codeEl.selectionStart = codeEl.selectionEnd = pos + insert.length;
      updateEditor();
    }
  });

  runBtn.addEventListener('click', run);
  resetBtn.addEventListener('click', function () {
    loadExample(currentExample);
  });

  exampleSelect.addEventListener('change', function () {
    if (exampleSelect.value === 'custom') return;
    loadExample(exampleSelect.value);
  });

  shareBtn.addEventListener('click', function () {
    var hash = '#code=' + encodeCode(codeEl.value);
    var url = location.origin + location.pathname + hash;
    history.replaceState(null, '', hash);
    copyText(url, shareBtn, '✓ 已复制');
  });

  downloadBtn.addEventListener('click', function () {
    var blob = new Blob([codeEl.value], { type: 'text/x-lua;charset=utf-8' });
    var url = URL.createObjectURL(blob);
    var link = document.createElement('a');
    link.href = url;
    link.download = 'main.lua';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  });

  tabOutput.addEventListener('click', function () { switchTab('output'); });
  tabStdin.addEventListener('click', function () { switchTab('stdin'); });

  document.addEventListener('keydown', function (event) {
    if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
      var tag = event.target && event.target.tagName;
      if (tag === 'TEXTAREA' || tag === 'INPUT' || tag === 'SELECT') return;
      event.preventDefault();
      run();
    }
  });

  /* ---------------- 初始化 ---------------- */

  buildExampleMenu();

  var initial = readHashCode();
  if (initial !== null) {
    codeEl.value = initial;
    updateEditor();
    showPlaceholder('已从分享链接载入代码，点击运行查看结果。');
    messageEl.textContent = '分享链接载入 · 无网络请求';
  } else {
    var saved = null;
    try { saved = localStorage.getItem(STORAGE_KEY); } catch (e) { /* ignore */ }
    if (saved && saved.trim()) {
      codeEl.value = saved;
      // 判断是否与某个示例完全一致，保持一致时同步下拉框
      updateEditor();
      showPlaceholder('已恢复上次编辑的代码，点击运行查看结果。');
    } else {
      loadExample('welcome', true);
      showPlaceholder('点击「运行」或按 Ctrl/⌘ + Enter 执行代码。print 的输出会显示在这里。');
    }
  }

  setStatus('ready', 'READY', '就绪');
})();