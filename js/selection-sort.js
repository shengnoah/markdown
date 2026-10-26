// selection-sort.js - FBASIC 选择排序可视化演示
// 左侧: FBASIC 代码逐行高亮执行; 右侧: 数组 A 的候选最小值与交换动画
// 依赖: fbasic.js 暴露的 window.FBasicInterpreter (真实解释器执行)
(() => {
  const codeEl = document.getElementById('ss-code');
  const barsEl = document.getElementById('ss-bars');
  const outputEl = document.getElementById('ss-output');
  const currentLineEl = document.getElementById('ss-current-line');
  const statusEl = document.getElementById('ss-status');
  const comparesEl = document.getElementById('ss-compares');
  const swapsEl = document.getElementById('ss-swaps');
  const stepsEl = document.getElementById('ss-steps');
  const varIEl = document.getElementById('ss-var-i');
  const varJEl = document.getElementById('ss-var-j');
  const varMEl = document.getElementById('ss-var-m');
  const playBtn = document.getElementById('ss-play');
  const pauseBtn = document.getElementById('ss-pause');
  const stepBtn = document.getElementById('ss-step');
  const resetBtn = document.getElementById('ss-reset');
  const speedInput = document.getElementById('ss-speed');
  const speedValueEl = document.getElementById('ss-speed-value');

  if (!codeEl || !barsEl || !window.FBasicInterpreter) return;

  // ===== FBASIC 选择排序程序 =====
  const SELECTION_SORT = `10 DIM A(10)
20 REM INIT: FILL 10 NUMBERS
30 FOR I = 1 TO 10
40 A(I) = (I * 7) MOD 11
50 NEXT I
60 REM SELECTION SORT: 9 ROUNDS
70 FOR I = 1 TO 9
80 M = I
90 FOR J = I + 1 TO 10
100 IF A(J) < A(M) THEN M = J
110 NEXT J
120 IF M <> I THEN GOSUB 200
130 NEXT I
140 PRINT "SORTED OK"
150 END
200 REM SWAP A(I) AND A(M)
210 T = A(I)
220 A(I) = A(M)
230 A(M) = T
240 RETURN`;

  const ARRAY_SIZE = 10;
  const MAX_VALUE = 10;
  const SWAP_ANIM_MS = 340;

  // ===== 状态 =====
  let interpreter = null;
  let lineEls = new Map();
  let barEls = [];
  let lastValues = [];
  let pendingSwap = null;
  let sortedCount = 0;
  let playing = false;
  let finished = false;
  let runToken = 0;
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
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

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
    SELECTION_SORT.split('\n').forEach((line) => {
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
      const top = el.offsetTop - codeEl.clientHeight / 2 + el.clientHeight;
      codeEl.scrollTo({ top: Math.max(0, top), behavior: 'smooth' });
    }
    currentLineEl.textContent = `RUN ${lineNumber}`;
    currentLineEl.classList.add('active');
  }

  // ===== 数组可视化 =====
  function slotLeft(index) {
    return `${index * 10 + 1.5}%`;
  }

  function barHeight(value) {
    const maxPx = 300;
    const minPx = 24;
    return `${Math.max(minPx, (value / MAX_VALUE) * maxPx)}px`;
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
      value.textContent = '?';
      const col = document.createElement('div');
      col.className = 'bs-bar-col';
      col.style.height = '30px';
      const colLabel = document.createElement('span');
      colLabel.className = 'bs-bar-col-label';
      col.appendChild(colLabel);
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
    const col = bar.querySelector('.bs-bar-col');
    col.style.height = barHeight(value);
    col.querySelector('.bs-bar-col-label').textContent = value;
    col.dataset.tall = value >= 4 ? '1' : '0';
  }

  function renderValues(values) {
    for (let i = 0; i < ARRAY_SIZE; i += 1) updateBar(i, values[i]);
  }

  function clearBarStates() {
    barEls.forEach((bar) => bar.classList.remove('compare', 'candidate', 'swap', 'sorted'));
  }

  function markSorted(count) {
    for (let i = 0; i < ARRAY_SIZE; i += 1) {
      barEls[i].classList.toggle('sorted', i < count);
    }
  }

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
    const M = fb.getVariable('M');
    switch (lineNumber) {
      case 10: return 'DIM A(10) 声明数组';
      case 30: return '初始化循环 I = 1 TO 10';
      case 40: return `A(${I}) = (${I} * 7) MOD 11 赋值`;
      case 50: return `NEXT I (I=${I})`;
      case 70: return `第 ${I} 轮：从未排序区选择最小值`;
      case 80: return `M = ${I}，候选最小值暂定 A(${I})`;
      case 90: return `扫描 A(${I + 1}) 到 A(10)`;
      case 100: return `比较 A(${J}) 与候选 A(${M})`;
      case 110: return `NEXT J (J=${J})`;
      case 120:
        return M === I
          ? `A(${I}) 已是本轮最小值`
          : `发现更小值 A(${M})，交换 A(${I}) 与 A(${M})`;
      case 130: return `NEXT I (I=${I})，有序区扩大到 ${Math.max(0, I - 1)} 个`;
      case 140: return '输出 SORTED OK';
      case 150: return '程序结束';
      case 200: return `GOSUB 交换 A(${I}) 与 A(${M})`;
      case 210: return `T = A(${I}) 暂存当前元素`;
      case 220: return `A(${I}) ← A(${M})`;
      case 230: return `A(${M}) ← T 完成交换`;
      case 240: return 'RETURN 返回外层循环';
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
    if (playTimer) {
      clearTimeout(playTimer);
      playTimer = null;
    }
    if (stepResolve) {
      const resolve = stepResolve;
      stepResolve = null;
      stepReject = null;
      resolve();
    }
  }

  function abortStep() {
    if (playTimer) {
      clearTimeout(playTimer);
      playTimer = null;
    }
    if (stepReject) {
      const reject = stepReject;
      stepResolve = null;
      stepReject = null;
      reject(new Error('RESET'));
    }
  }

  function updateSortedCount(lineNumber, fb) {
    const I = fb.getVariable('I');
    const M = fb.getVariable('M');

    if (lineNumber === 120 && M === I) {
      sortedCount = Math.max(sortedCount, I);
    } else if (lineNumber === 230 || lineNumber === 240) {
      sortedCount = Math.max(sortedCount, I);
    } else if (lineNumber === 130) {
      sortedCount = Math.max(sortedCount, I - 1);
    } else if (lineNumber === 140 || lineNumber === 150) {
      sortedCount = ARRAY_SIZE;
    }
    sortedCount = Math.min(ARRAY_SIZE, Math.max(0, sortedCount));
  }

  // ===== onStep 回调 =====
  async function onStep(lineNumber, fb, token) {
    if (token !== runToken) throw new Error('RESET');

    steps += 1;
    stepsEl.textContent = steps;
    highlightLine(lineNumber);

    if (lineNumber === 100) compares += 1;
    if (lineNumber === 200) swaps += 1;
    comparesEl.textContent = compares;
    swapsEl.textContent = swaps;

    const I = fb.getVariable('I');
    const J = fb.getVariable('J');
    const M = fb.getVariable('M');
    varIEl.textContent = I || '-';
    varJEl.textContent = J || '-';
    varMEl.textContent = M || '-';

    const array = fb.arrays.get('A');
    const after = array ? array.values.slice(1, ARRAY_SIZE + 1) : lastValues;

    clearBarStates();

    const inSelectionScan = lineNumber >= 70 && lineNumber <= 130;
    const inSwapRoutine = lineNumber >= 200 && lineNumber <= 240;
    if ((inSelectionScan || inSwapRoutine) && M >= 1 && M <= ARRAY_SIZE) {
      barEls[M - 1].classList.add('candidate');
    }

    if (lineNumber === 100 && J >= 1 && J <= ARRAY_SIZE) {
      barEls[J - 1].classList.add('compare');
      if (M >= 1 && M <= ARRAY_SIZE) barEls[M - 1].classList.add('compare');
    }

    if (lineNumber === 210 && lastValues.length === ARRAY_SIZE) {
      pendingSwap = {
        before: lastValues.slice(),
        i: I - 1,
        j: M - 1,
      };
    }

    let swap = detectSwap(lastValues, after);
    if (
      pendingSwap &&
      lineNumber === 230 &&
      after[pendingSwap.i] === pendingSwap.before[pendingSwap.j] &&
      after[pendingSwap.j] === pendingSwap.before[pendingSwap.i]
    ) {
      swap = [pendingSwap.i, pendingSwap.j];
      pendingSwap = null;
    }

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

    updateSortedCount(lineNumber, fb);
    markSorted(sortedCount);

    await waitForStep();
  }

  // ===== 运行控制 =====
  async function startRun(autoPlay) {
    runToken += 1;
    if (interpreter) interpreter.running = false;
    abortStep();
    resetVisualState();
    const token = runToken;
    playing = autoPlay;

    interpreter = new window.FBasicInterpreter(outputEl);
    try {
      await interpreter.run(SELECTION_SORT, (lineNumber, fb) => onStep(lineNumber, fb, token));
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
    sortedCount = 0;
    lastValues = [];
    pendingSwap = null;
    comparesEl.textContent = '0';
    swapsEl.textContent = '0';
    stepsEl.textContent = '0';
    varIEl.textContent = '-';
    varJEl.textContent = '-';
    varMEl.textContent = '-';
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
