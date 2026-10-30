// quick-sort.js - FBASIC 快速排序可视化演示
// 左侧: FBASIC 代码逐行高亮执行; 右侧: 数组 A 的基准值、区间划分与交换动画
// 依赖: fbasic.js 暴露的 window.FBasicInterpreter (真实解释器执行)
(() => {
  const codeEl = document.getElementById('qs-code');
  const barsEl = document.getElementById('qs-bars');
  const outputEl = document.getElementById('qs-output');
  const currentLineEl = document.getElementById('qs-current-line');
  const statusEl = document.getElementById('qs-status');
  const comparesEl = document.getElementById('qs-compares');
  const swapsEl = document.getElementById('qs-swaps');
  const stepsEl = document.getElementById('qs-steps');
  const varLoEl = document.getElementById('qs-var-lo');
  const varHiEl = document.getElementById('qs-var-hi');
  const varIEl = document.getElementById('qs-var-i');
  const varJEl = document.getElementById('qs-var-j');
  const varPEl = document.getElementById('qs-var-p');
  const playBtn = document.getElementById('qs-play');
  const pauseBtn = document.getElementById('qs-pause');
  const stepBtn = document.getElementById('qs-step');
  const resetBtn = document.getElementById('qs-reset');
  const speedInput = document.getElementById('qs-speed');
  const speedValueEl = document.getElementById('qs-speed-value');

  if (!codeEl || !barsEl || !window.FBasicInterpreter) return;

  // ===== FBASIC 快速排序程序 (Lomuto 划分 + 嵌套 GOSUB 递归) =====
  const QUICK_SORT = `10 DIM A(10)
15 DIM STK(20)
20 REM INIT: FILL 10 NUMBERS
30 FOR I = 1 TO 10
40 A(I) = (I * 7) MOD 11
50 NEXT I
60 REM QUICKSORT A(1) TO A(10)
70 LO = 1
80 HI = 10
90 SP = 0
95 GOSUB 200
100 PRINT "SORTED OK"
110 END
200 REM PARTITION A(LO..HI) PIVOT A(HI)
210 P = A(HI)
220 I = LO - 1
230 FOR J = LO TO HI - 1
240 IF A(J) < P THEN GOSUB 400
250 NEXT J
260 IF I + 1 < HI THEN GOSUB 460
270 REM PIVOT NOW AT I+1
280 IF LO < I THEN GOSUB 510
290 IF I + 2 < HI THEN GOSUB 590
300 REM BOTH SIDES DONE
310 RETURN
400 REM GROW SMALL SIDE: SWAP A(J) A(I+1)
410 I = I + 1
420 T = A(J)
430 A(J) = A(I)
440 A(I) = T
450 RETURN
460 REM SWAP PIVOT A(I+1) WITH A(HI)
470 T = A(I + 1)
480 A(I + 1) = A(HI)
490 A(HI) = T
500 RETURN
510 REM RECURSE LEFT A(LO..I)
520 SP = SP + 1
530 STK(SP) = HI
540 HI = I
550 GOSUB 200
560 HI = STK(SP)
570 SP = SP - 1
580 RETURN
590 REM RECURSE RIGHT A(I+2..HI)
600 SP = SP + 1
610 STK(SP) = LO
620 LO = I + 2
630 GOSUB 200
640 LO = STK(SP)
650 SP = SP - 1
660 RETURN`;

  const ARRAY_SIZE = 10;
  const MAX_VALUE = 10;
  const SWAP_ANIM_MS = 340;

  // ===== 状态 =====
  let interpreter = null;
  let lineEls = new Map();
  let barEls = [];
  let lastValues = [];
  let sortedSet = new Set();
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
      .replace(/&/g, '&')
      .replace(/</g, '<')
      .replace(/>/g, '>');
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
    QUICK_SORT.split('\n').forEach((line) => {
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
    barEls.forEach((bar) => bar.classList.remove('compare', 'pivot', 'range', 'swap', 'sorted'));
  }

  function markSorted() {
    for (let i = 0; i < ARRAY_SIZE; i += 1) {
      barEls[i].classList.toggle('sorted', sortedSet.has(i + 1));
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
    const LO = fb.getVariable('LO');
    const HI = fb.getVariable('HI');
    const I = fb.getVariable('I');
    const J = fb.getVariable('J');
    const P = fb.getVariable('P');
    switch (lineNumber) {
      case 10: return 'DIM A(10) 声明数组';
      case 15: return 'DIM STK(20) 递归现场栈';
      case 30: return '初始化循环 I = 1 TO 10';
      case 40: return `A(${I}) = (${I} * 7) MOD 11 赋值`;
      case 50: return `NEXT I (I=${I})`;
      case 70: return 'LO = 1，排序区间左端';
      case 80: return 'HI = 10，排序区间右端';
      case 90: return 'SP = 0，栈指针清零';
      case 95: return 'GOSUB 200 开始快速排序';
      case 100: return '输出 SORTED OK';
      case 110: return '程序结束';
      case 200: return `划分区间 A(${LO}) 到 A(${HI})`;
      case 210: return `P = A(${HI}) = ${P}，选取基准值`;
      case 220: return `I = ${LO - 1}，小于区边界初始化`;
      case 230: return `J 从 ${LO} 扫描到 ${HI - 1}`;
      case 240: return `比较 A(${J}) 与基准 P=${P}`;
      case 250: return `NEXT J (J=${J})`;
      case 260:
        return I + 1 < HI
          ? `把基准换到位置 ${I + 1}`
          : `基准已在位置 ${I + 1}，无需交换`;
      case 270: return `基准 ${P} 就位于 A(${I + 1})`;
      case 280: return LO < I
        ? `递归处理左区间 A(${LO}) 到 A(${I})`
        : `左区间为空，跳过`;
      case 290: return I + 2 < HI
        ? `递归处理右区间 A(${I + 2}) 到 A(${HI})`
        : `右区间为空，跳过`;
      case 300: return '本区间两侧处理完毕';
      case 310: return 'RETURN 返回调用者';
      case 400: return `A(${J}) < P，扩大小于区并交换`;
      case 410: return `I = I + 1 = ${I}`;
      case 420: return `T = A(${J}) 暂存`;
      case 430: return `A(${J}) ← A(${I})`;
      case 440: return `A(${I}) ← T 完成交换`;
      case 450: return 'RETURN 返回扫描循环';
      case 460: return `交换基准 A(${I + 1}) 与 A(${HI})`;
      case 470: return `T = A(${I + 1}) 暂存`;
      case 480: return `A(${I + 1}) ← A(${HI})`;
      case 490: return `A(${HI}) ← T 基准归位`;
      case 500: return 'RETURN 返回划分流程';
      case 510: return '递归左区间：保存 HI 入栈';
      case 520: return `SP = ${fb.getVariable('SP')}，栈指针上移`;
      case 530: return `STK(SP) = ${HI}，保存右边界`;
      case 540: return `HI = I = ${I}，缩小到左区间`;
      case 550: return 'GOSUB 200 划分左区间';
      case 560: return `HI = STK(SP) = ${HI}，恢复右边界`;
      case 570: return `SP = ${fb.getVariable('SP')}，栈指针回落`;
      case 580: return 'RETURN 返回上层';
      case 590: return '递归右区间：保存 LO 入栈';
      case 600: return `SP = ${fb.getVariable('SP')}，栈指针上移`;
      case 610: return `STK(SP) = ${LO}，保存左边界`;
      case 620: return `LO = I + 2 = ${I + 2}，缩小到右区间`;
      case 630: return 'GOSUB 200 划分右区间';
      case 640: return `LO = STK(SP) = ${LO}，恢复左边界`;
      case 650: return `SP = ${fb.getVariable('SP')}，栈指针回落`;
      case 660: return 'RETURN 返回上层';
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

  // ===== onStep 回调 =====
  async function onStep(lineNumber, fb, token) {
    if (token !== runToken) throw new Error('RESET');

    steps += 1;
    stepsEl.textContent = steps;
    highlightLine(lineNumber);

    if (lineNumber === 240) compares += 1;
    if (lineNumber === 400 || lineNumber === 460) swaps += 1;
    comparesEl.textContent = compares;
    swapsEl.textContent = swaps;

    const LO = fb.getVariable('LO');
    const HI = fb.getVariable('HI');
    const I = fb.getVariable('I');
    const J = fb.getVariable('J');
    const P = fb.getVariable('P');
    varLoEl.textContent = LO || '-';
    varHiEl.textContent = HI || '-';
    varIEl.textContent = Number.isFinite(I) && I !== 0 ? I : '-';
    varJEl.textContent = J || '-';
    varPEl.textContent = P || '-';

    const array = fb.arrays.get('A');
    const after = array ? array.values.slice(1, ARRAY_SIZE + 1) : lastValues;

    // 已就位元素追踪
    if (lineNumber === 210 && LO === HI) {
      // 单元素区间: 该元素天然有序
      sortedSet.add(LO);
    }
    if (lineNumber === 270) {
      // 基准归位到 I+1
      sortedSet.add(I + 1);
    }
    if (lineNumber === 100 || lineNumber === 110) {
      for (let k = 1; k <= ARRAY_SIZE; k += 1) sortedSet.add(k);
    }

    clearBarStates();

    // 划分上下文: 高亮当前区间与基准
    const inPartition = lineNumber >= 200 && lineNumber <= 500;
    if (inPartition && LO >= 1 && HI >= LO && HI <= ARRAY_SIZE) {
      for (let k = LO; k <= HI; k += 1) {
        barEls[k - 1].classList.add('range');
      }
      if (lineNumber >= 200 && lineNumber <= 310) {
        barEls[HI - 1].classList.add('pivot');
      }
    }

    // 比较高亮: J 与基准
    if (lineNumber === 240 && J >= 1 && J <= ARRAY_SIZE) {
      barEls[J - 1].classList.add('compare');
      if (HI >= 1 && HI <= ARRAY_SIZE) barEls[HI - 1].classList.add('compare');
    }

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

    markSorted();

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
      await interpreter.run(QUICK_SORT, (lineNumber, fb) => onStep(lineNumber, fb, token));
      finished = true;
      playing = false;
      clearBarStates();
      for (let k = 1; k <= ARRAY_SIZE; k += 1) sortedSet.add(k);
      markSorted();
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
    sortedSet = new Set();
    lastValues = [];
    comparesEl.textContent = '0';
    swapsEl.textContent = '0';
    stepsEl.textContent = '0';
    varLoEl.textContent = '-';
    varHiEl.textContent = '-';
    varIEl.textContent = '-';
    varJEl.textContent = '-';
    varPEl.textContent = '-';
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
