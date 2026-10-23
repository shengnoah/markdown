// bubble-sort.js - FBASIC 冒泡排序可视化演示
// 左侧: FBASIC 代码逐行高亮执行; 右侧: 数组 A 的 10 个数字位置变化动画
// 依赖: fbasic.js 暴露的 window.FBasicInterpreter (真实解释器执行)
(() => {
  const codeEl = document.getElementById('bs-code');
  const barsEl = document.getElementById('bs-bars');
  const outputEl = document.getElementById('bs-output');
  const currentLineEl = document.getElementById('bs-current-line');
  const statusEl = document.getElementById('bs-status');
  const comparesEl = document.getElementById('bs-compares');
  const swapsEl = document.getElementById('bs-swaps');
  const stepsEl = document.getElementById('bs-steps');
  const varIEl = document.getElementById('bs-var-i');
  const varJEl = document.getElementById('bs-var-j');
  const playBtn = document.getElementById('bs-play');
  const pauseBtn = document.getElementById('bs-pause');
  const stepBtn = document.getElementById('bs-step');
  const resetBtn = document.getElementById('bs-reset');
  const speedInput = document.getElementById('bs-speed');
  const speedValueEl = document.getElementById('bs-speed-value');

  if (!codeEl || !barsEl || !window.FBasicInterpreter) return;

  // ===== FBASIC 冒泡排序程序 =====
  const BUBBLE_SORT = `10 DIM A(10)
20 REM INIT: FILL 10 NUMBERS
30 FOR I = 1 TO 10
40 A(I) = (I * 7) MOD 11
50 NEXT I
60 REM BUBBLE SORT: 9 ROUNDS
70 FOR I = 1 TO 9
80 FOR J = 1 TO 10 - I
90 IF A(J) > A(J + 1) THEN GOSUB 200
100 NEXT J
110 NEXT I
120 PRINT "SORTED OK"
130 END
200 REM SWAP A(J) AND A(J+1)
210 T = A(J)
220 A(J) = A(J + 1)
230 A(J + 1) = T
240 RETURN`;

  const ARRAY_SIZE = 10;
  const MAX_VALUE = 10;
  const SWAP_ANIM_MS = 340;

  // ===== 状态 =====
  let interpreter = null;
  let lineEls = new Map();       // 行号 -> 代码行 DOM
  let barEls = [];               // 10 个柱子 DOM (按下标)
  let lastValues = [];           // 上一步的数组值
  let playing = false;
  let finished = false;
  let runToken = 0;              // 防止重置后旧 run 继续写 UI
  let stepResolve = null;
  let stepReject = null;
  let playTimer = null;
  let compares = 0;
  let swaps = 0;
  let steps = 0;

  // ===== 工具 =====
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  function escapeHtml(text) {
    return text
      .replace(/&/g, '&')
      .replace(/</g, '<')
      .replace(/>/g, '>');
  }

  // 简易 FBASIC 语法着色
  const KEYWORDS = /\b(DIM|REM|FOR|TO|STEP|NEXT|IF|THEN|GOSUB|RETURN|GOTO|PRINT|END|INPUT|LET|MOD)\b/g;

  function highlightSource(src) {
    let html = escapeHtml(src);
    html = html.replace(/("[^"]*")/g, '<span class="bs-str">$1</span>');
    html = html.replace(/\b(\d+(?:\.\d+)?)\b/g, '<span class="bs-num">$1</span>');
    html = html.replace(KEYWORDS, '<span class="bs-kw">$1</span>');
    html = html.replace(/^(<span class="bs-kw">REM<\/span>.*)$/m, '<span class="bs-rem">$1</span>');
    return html;
  }

  // ===== 代码面板渲染 =====
  function renderCode() {
    codeEl.innerHTML = '';
    lineEls = new Map();
    BUBBLE_SORT.split('\n').forEach((line) => {
      const match = line.match(/^(\d+)\s*(.*)$/);
      if (!match) return;
      const row = document.createElement('div');
      row.className = 'bs-code-line';
      row.dataset.line = match[1];
      const ln = document.createElement('span');
      ln.className = 'bs-ln';
      ln.textContent = match[1];
      const src = document.createElement('span');
      src.className = 'bs-src';
      src.innerHTML = highlightSource(match[2]);
      row.appendChild(ln);
      row.appendChild(src);
      codeEl.appendChild(row);
      lineEls.set(Number(match[1]), row);
    });
  }

  function highlightLine(lineNumber) {
    lineEls.forEach((el) => el.classList.remove('active'));
    const el = lineEls.get(lineNumber);
    if (el) {
      el.classList.add('active');
      const container = codeEl;
      const top = el.offsetTop - container.clientHeight / 2 + el.clientHeight;
      container.scrollTo({ top: Math.max(0, top), behavior: 'smooth' });
    }
    currentLineEl.textContent = `RUN ${lineNumber}`;
    currentLineEl.classList.add('active');
  }

  // ===== 数组可视化 =====
  function slotLeft(index) {
    // 10 个槽位: 每槽 10%, 柱宽 7%, 居中偏移 1.5%
    return `${index * 10 + 1.5}%`;
  }

  function barHeight(value) {
    return `${Math.max(6, (value / MAX_VALUE) * 78)}%`;
  }

  function renderBars() {
    barsEl.innerHTML = '';
    barEls = [];
    for (let i = 0; i < ARRAY_SIZE; i += 1) {
      const bar = document.createElement('div');
      bar.className = 'bs-bar';
      bar.style.left = slotLeft(i);
      const value = document.createElement('span');
      value.className = 'bs-bar-value';
      const col = document.createElement('div');
      col.className = 'bs-bar-col';
      const idx = document.createElement('span');
      idx.className = 'bs-bar-idx';
      idx.textContent = i + 1;
      bar.appendChild(value);
      bar.appendChild(col);
      bar.appendChild(idx);
      barsEl.appendChild(bar);
      barEls.push(bar);
    }
  }

  function updateBar(index, value) {
    const bar = barEls[index];
    if (!bar) return;
    bar.querySelector('.bs-bar-value').textContent = value;
    bar.querySelector('.bs-bar-col').style.height = barHeight(value);
  }

  function renderValues(values) {
    for (let i = 0; i < ARRAY_SIZE; i += 1) updateBar(i, values[i]);
  }

  function clearBarStates() {
    barEls.forEach((bar) => bar.classList.remove('compare', 'swap', 'sorted'));
  }

  function markSorted(count) {
    for (let i = 0; i < ARRAY_SIZE; i += 1) {
      barEls[i].classList.toggle('sorted', i >= ARRAY_SIZE - count);
    }
  }

  // 检测两步之间是否发生了"互换" (交换动画的触发条件)
  function detectSwap(before, after) {
    if (!before || before.length !== after.length) return null;
    const changed = [];
    for (let i = 0; i < after.length; i += 1) {
      if (before[i] !== after[i]) changed.push(i);
    }
    if (changed.length === 2) {
      const [i, j] = changed;
      if (after[i] === before[j] && after[j] === before[i]) return [i, j];
    }
    return null;
  }

  // 交换飞行动画: 克隆两个柱子, 让它们滑到对方位置
  async function animateSwap(i, j, after) {
    const barI = barEls[i];
    const barJ = barEls[j];
    if (!barI || !barJ) {
      renderValues(after);
      return;
    }

    barI.classList.add('swap');
    barJ.classList.add('swap');

    const cloneI = barI.cloneNode(true);
    const cloneJ = barJ.cloneNode(true);
    cloneI.classList.add('bs-bar-clone');
    cloneJ.classList.add('bs-bar-clone');
    cloneI.style.left = slotLeft(i);
    cloneJ.style.left = slotLeft(j);
    barsEl.appendChild(cloneI);
    barsEl.appendChild(cloneJ);
    barI.style.visibility = 'hidden';
    barJ.style.visibility = 'hidden';

    // 强制 reflow 后设置目标位置, 触发 CSS transition
    cloneI.getBoundingClientRect();
    cloneI.style.left = slotLeft(j);
    cloneJ.style.left = slotLeft(i);

    await sleep(SWAP_ANIM_MS);

    updateBar(i, after[i]);
    updateBar(j, after[j]);
    barI.style.visibility = '';
    barJ.style.visibility = '';
    cloneI.remove();
    cloneJ.remove();
  }

  // ===== 状态文案 =====
  function statusText(lineNumber, fb) {
    const I = fb.getVariable('I');
    const J = fb.getVariable('J');
    switch (lineNumber) {
      case 10: return 'DIM A(10) 声明数组';
      case 30: return `初始化循环 I = 1 TO 10`;
      case 40: return `A(${I}) = (${I} * 7) MOD 11 赋值`;
      case 50: return `NEXT I (I=${I})`;
      case 70: return `外层循环: 第 ${I} 轮排序`;
      case 80: return `内层循环: J = 1 TO ${10 - I}`;
      case 90: return `比较 A(${J}) 与 A(${J + 1})`;
      case 100: return `NEXT J (J=${J})`;
      case 110: return `NEXT I (I=${I}) 第 ${I - 1} 轮完成`;
      case 120: return '输出 SORTED OK';
      case 130: return '程序结束';
      case 200: return `A(${J}) > A(${J + 1}) 需要交换`;
      case 210: return `T = A(${J}) 暂存左值`;
      case 220: return `A(${J}) ← A(${J + 1})`;
      case 230: return `A(${J + 1}) ← T 完成交换`;
      case 240: return 'RETURN 返回主循环';
      default: return `执行行 ${lineNumber}`;
    }
  }

  // ===== 步进控制 =====
  function waitForStep() {
    return new Promise((resolve, reject) => {
      stepResolve = resolve;
      stepReject = reject;
      if (playing) {
        playTimer = setTimeout(() => finishStep(), Number(speedInput.value));
      }
    });
  }

  function finishStep() {
    if (playTimer) { clearTimeout(playTimer); playTimer = null; }
    if (stepResolve) {
      const r = stepResolve;
      stepResolve = null;
      stepReject = null;
      r();
    }
  }

  function abortStep() {
    if (playTimer) { clearTimeout(playTimer); playTimer = null; }
    if (stepReject) {
      const r = stepReject;
      stepResolve = null;
      stepReject = null;
      r(new Error('RESET'));
    }
  }

  // ===== onStep 回调: 代码行高亮 + 数组同步动画 =====
  async function onStep(lineNumber, fb, token) {
    if (token !== runToken) throw new Error('RESET');

    steps += 1;
    stepsEl.textContent = steps;

    // 1. 高亮当前执行的代码行
    highlightLine(lineNumber);

    // 2. 统计
    if (lineNumber === 90) compares += 1;
    if (lineNumber === 200) swaps += 1;
    comparesEl.textContent = compares;
    swapsEl.textContent = swaps;

    // 3. 变量显示
    varIEl.textContent = fb.getVariable('I');
    varJEl.textContent = fb.getVariable('J');

    // 4. 数组状态同步
    const array = fb.arrays.get('A');
    const after = array ? array.values.slice(1, ARRAY_SIZE + 1) : lastValues;

    clearBarStates();

    // 比较高亮: 行 90 执行时高亮 J 与 J+1
    if (lineNumber === 90) {
      const j = fb.getVariable('J');
      if (j >= 1 && j < ARRAY_SIZE) {
        barEls[j - 1].classList.add('compare');
        barEls[j].classList.add('compare');
      }
    }

    // 交换动画: 检测与上一步相比是否发生互换
    const swap = detectSwap(lastValues, after);
    if (swap) {
      statusEl.textContent = `交换 A(${swap[0] + 1}) ↔ A(${swap[1] + 1})`;
      statusEl.className = 'bs-status swap';
      await animateSwap(swap[0], swap[1], after);
    } else {
      renderValues(after);
      statusEl.textContent = statusText(lineNumber, fb);
      statusEl.className = 'bs-status active';
    }
    lastValues = after;

    // 5. 已就位标记: 外层第 I 轮完成后, 右侧 I-1 个元素已排序
    if (lineNumber >= 70 && lineNumber <= 130) {
      const i = fb.getVariable('I');
      markSorted(Math.min(ARRAY_SIZE, Math.max(0, i - 1)));
    } else if (lineNumber === 130) {
      markSorted(ARRAY_SIZE);
    }

    // 6. 等待下一步 (播放节奏 / 暂停 / 单步)
    await waitForStep();
  }

  // ===== 运行控制 =====
  async function startRun(autoPlay) {
    // 强制清理旧运行状态 (防止异常中断后卡死)
    runToken += 1;
    if (interpreter) interpreter.running = false;
    abortStep();
    resetVisualState();
    const token = runToken;
    playing = autoPlay;

    interpreter = new window.FBasicInterpreter(outputEl);
    try {
      await interpreter.run(BUBBLE_SORT, (lineNumber, fb) => onStep(lineNumber, fb, token));
      finished = true;
      playing = false;
      clearBarStates();
      markSorted(ARRAY_SIZE);
      statusEl.textContent = '✅ 排序完成';
      statusEl.className = 'bs-status active';
      currentLineEl.textContent = 'DONE';
    } catch (error) {
      if (error.message !== 'RESET') {
        statusEl.textContent = `错误: ${error.message}`;
        statusEl.className = 'bs-status swap';
      }
    }
  }

  function resetVisualState() {
    playing = false;
    finished = false;
    finishStep();
    compares = 0;
    swaps = 0;
    steps = 0;
    lastValues = [];
    comparesEl.textContent = '0';
    swapsEl.textContent = '0';
    stepsEl.textContent = '0';
    varIEl.textContent = '-';
    varJEl.textContent = '-';
    statusEl.textContent = 'READY';
    statusEl.className = 'bs-status';
    currentLineEl.textContent = 'READY';
    currentLineEl.classList.remove('active');
    lineEls.forEach((el) => el.classList.remove('active'));
    renderBars();
    outputEl.textContent = '';
    codeEl.scrollTo({ top: 0 });
  }

  // ===== 事件绑定 =====
  playBtn.addEventListener('click', () => {
    // 从未运行 / 已结束 → 启动新运行; 运行中(含暂停) → 继续播放
    if (finished || !interpreter || !interpreter.running) {
      startRun(true);
      return;
    }
    playing = true;
    finishStep();
  });

  pauseBtn.addEventListener('click', () => {
    playing = false;
  });

  stepBtn.addEventListener('click', () => {
    // 从未运行 / 已结束 → 启动并单步执行; 运行中 → 放行一步
    if (finished || !interpreter || !interpreter.running) {
      startRun(false);
      return;
    }
    playing = false;
    finishStep();
  });

  resetBtn.addEventListener('click', () => {
    runToken += 1;
    if (interpreter) interpreter.running = false;
    abortStep();
    resetVisualState();
  });

  speedInput.addEventListener('input', () => {
    speedValueEl.textContent = `${speedInput.value}ms`;
  });

  // ===== 初始化 =====
  renderCode();
  resetVisualState();
})();
