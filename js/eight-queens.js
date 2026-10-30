// 仅绘图和播放控制；搜索由 FBasicInterpreter 执行 FBASIC 源码。
(() => {
  'use strict';
  const el = name => document.getElementById('eq-' + name);
  if (!el('board') || !window.FBasicInterpreter || !window.FBasicDemos) return;
  const D = window.FBasicDemos;
  const execution = new D.Execution(window.FBasicInterpreter, el('output'));
  const fb = execution.fb;
  const highlight = D.code(el('code'), D.queens, 'eq');
  const cells = [];
  for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) {
    const cell = document.createElement('div');
    const piece = document.createElement('span');
    if (c === 0) {
      const label = document.createElement('span'); label.className = 'eq-row-label'; label.textContent = r + 1; cell.append(label);
    }
    cell.append(piece); el('board').append(cell); cells.push({ cell, piece, r, c });
  }
  let solutions = [], viewed = -1, lastLine = 0, finished = false;
  const player = new D.Player(execution, () => Number(el('speed').value), update, done, error => {
    el('message').textContent = '解释器错误：' + error.message; controls();
  });
  function controls() {
    el('play').disabled = player.playing || finished;
    el('pause').disabled = !player.playing;
    el('step').disabled = player.fast || finished;
    el('all').disabled = player.fast || finished;
    el('prev').disabled = player.playing || viewed <= 0;
    el('next').disabled = player.playing || viewed < 0 || viewed >= solutions.length - 1;
    el('view').textContent = viewed < 0 ? '尚未浏览解' : `解 ${viewed + 1} / ${solutions.length}`;
    el('status').textContent = finished ? 'DONE' : player.fast ? 'FAST' : player.playing ? 'RUNNING' : 'PAUSED';
  }
  function draw(q, mode = lastLine) {
    const row = fb.getVariable('R') - 1, col = fb.getVariable('C') - 1;
    const j = fb.getVariable('J') - 1;
    cells.forEach(({ cell, piece, r, c }) => {
      cell.className = 'eq-cell' + ((r + c) % 2 ? ' dark' : '');
      const occupied = q[r] === c;
      const candidate = [120, 150, 160, 210].includes(mode) && row === r && col === c;
      if (occupied) cell.classList.add(mode === 350 || mode === 'solution' ? 'solution' : 'placed');
      if (candidate) cell.classList.add(mode === 210 ? 'conflict' : 'candidate');
      if (mode === 210 && occupied && r === j) cell.classList.add('conflict');
      piece.textContent = occupied || candidate ? '♛' : '';
      cell.title = `第 ${r + 1} 行，第 ${c + 1} 列`;
    });
    el('board').setAttribute('aria-label', '各行皇后列号：' + q.map(c => c + 1).join(', '));
  }
  function update(line) {
    lastLine = line;
    viewed = -1;
    const q = (fb.arrays.get('Q')?.values.slice(1, 9) || Array(8).fill(0)).map(c => c - 1);
    if (line === 350) {
      solutions.push(q.slice()); viewed = solutions.length - 1;
      if (el('stop-solution').checked && !player.fast) player.stop();
    }
    // 快速模式只在关键帧绘图，执行的仍是每一条 FBASIC 语句。
    if (player.fast && line !== 350 && execution.steps % 300 !== 0) return;
    highlight(line); el('line').textContent = 'RUN ' + line;
    draw(q);
    el('attempts').textContent = fb.getVariable('A');
    el('conflicts').textContent = fb.getVariable('B');
    el('backtracks').textContent = fb.getVariable('T');
    el('steps').textContent = execution.steps;
    el('row').textContent = fb.getVariable('R');
    el('solutions').textContent = fb.getVariable('S');
    const source = fb.program.find(p => p.number === line)?.code || '';
    el('message').textContent = `执行 ${line} ${source}；R=${fb.getVariable('R')}，C=${fb.getVariable('C')}，J=${fb.getVariable('J')}。`;
    if (line === 350) el('message').textContent = `FBASIC 找到第 ${solutions.length} 个解：[${q.map(c => c + 1).join(', ')}]。`;
    controls();
  }
  function done() {
    finished = true;
    update(510);
    if (solutions.length) { viewed = solutions.length - 1; draw(solutions[viewed], 'solution'); }
    el('message').textContent = `FBASIC 搜索完成，共找到 ${fb.getVariable('S')} 个解，执行 ${execution.steps} 条语句。`;
    controls();
  }
  function reset() {
    player.stop(); execution.start(D.queens, {}, false);
    solutions = []; viewed = -1; finished = false; lastLine = 0;
    el('output').textContent = '';
    highlight(0); el('line').textContent = 'READY';
    ['attempts', 'conflicts', 'backtracks', 'steps', 'solutions'].forEach(name => el(name).textContent = '0');
    el('row').textContent = '—';
    draw(Array(8).fill(-1));
    el('message').textContent = '点击播放或单步，逐条执行 FBASIC 程序。'; controls();
  }
  el('play').addEventListener('click', () => { player.play(); controls(); });
  el('pause').addEventListener('click', () => { player.stop(); controls(); });
  el('step').addEventListener('click', () => player.single());
  el('all').addEventListener('click', () => { player.quick(); controls(); });
  el('reset').addEventListener('click', reset);
  el('speed').addEventListener('input', () => el('speed-value').textContent = el('speed').value + 'ms');
  function browse(delta) {
    viewed += delta; draw(solutions[viewed], 'solution');
    el('message').textContent = `浏览第 ${viewed + 1} 个解：[${solutions[viewed].map(c => c + 1).join(', ')}]。继续执行会恢复解释器现场。`; controls();
  }
  el('prev').addEventListener('click', () => browse(-1));
  el('next').addEventListener('click', () => browse(1));
  window.addEventListener('pagehide', () => player.stop());
  reset();
})();
