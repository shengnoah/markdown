(() => {
  const output = document.getElementById('fbasic-console-output');
  const input = document.getElementById('fbasic-console-input');
  const modernMode = document.getElementById('fbasic-modern-mode');
  const consoleMode = document.getElementById('fbasic-console-mode');
  const modernButton = document.getElementById('fbasic-modern-tab');
  const consoleButton = document.getElementById('fbasic-console-tab');
  const displayTheme = document.getElementById('fbasic-display-theme');
  const displayFont = document.getElementById('fbasic-display-font');

  if (!output || !input || !modernMode || !consoleMode || !modernButton || !consoleButton) return;

  const program = new Map();
  const variables = new Map();
  let running = false;
  let pc = 0;
  let lines = [];
  const forStack = [];

  function println(text = '') {
    output.textContent += `${text}\n`;
    output.scrollTop = output.scrollHeight;
  }

  function clearScreen() {
    output.textContent = '';
  }

  function boot() {
    clearScreen();
    program.clear();
    variables.clear();
    forStack.length = 0;
    println('FAMILY BASIC JS CONSOLE');
    println('COPYRIGHT 2026 MARKDOWN.REN');
    println('READY.');
  }

  function listProgram() {
    if (!program.size) {
      println('READY.');
      return;
    }
    [...program.entries()].sort((a, b) => a[0] - b[0]).forEach(([number, code]) => {
      println(`${number} ${code}`.trim());
    });
    println('READY.');
  }

  function rebuildLines() {
    lines = [...program.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([number, code]) => ({ number, code }));
  }

  function findLine(number) {
    return lines.findIndex((line) => line.number === Number(number));
  }

  function getVar(name) {
    const key = name.toUpperCase();
    if (variables.has(key)) return variables.get(key);
    return key.endsWith('$') ? '' : 0;
  }

  function setVar(name, value) {
    const key = name.toUpperCase();
    variables.set(key, key.endsWith('$') ? String(value) : Number(value));
  }

  function evalExpr(expr) {
    const trimmed = expr.trim();
    if (!trimmed) return '';
    if (/^".*"$/.test(trimmed)) return trimmed.slice(1, -1);
    if (/^-?\d+(?:\.\d+)?$/.test(trimmed)) return Number(trimmed);
    if (/^[A-Z][A-Z0-9]*\$?$/i.test(trimmed)) return getVar(trimmed);

    const builtinValue = evalBuiltinFunction(trimmed);
    if (builtinValue !== null) return builtinValue;

    const replaced = trimmed.replace(/"([^"\\]|\\.)*"|[A-Z][A-Z0-9]*\$?/gi, (token) => {
      if (token.startsWith('"')) return token;
      return JSON.stringify(getVar(token));
    });
    if (!/^[\d\s+\-*/()."A-Za-z_,$]*$/.test(replaced)) throw new Error('SYNTAX ERROR');
    return Function(`"use strict"; return (${replaced});`)();
  }

  function evalBuiltinFunction(expr) {
    const match = expr.match(/^([A-Z]+\$?)\((.*)\)$/i);
    if (!match) return null;

    const name = match[1].toUpperCase();
    const args = splitPrint(match[2]).map((arg) => evalExpr(arg.trim()));

    switch (name) {
      case 'CHR$': return String.fromCharCode(Number(args[0]) || 0);
      case 'ASC': return String(args[0] ?? '').charCodeAt(0) || 0;
      case 'LEN': return String(args[0] ?? '').length;
      case 'LEFT$': return String(args[0] ?? '').slice(0, Number(args[1]) || 0);
      case 'RIGHT$': {
        const text = String(args[0] ?? '');
        const count = Number(args[1]) || 0;
        return text.slice(Math.max(0, text.length - count));
      }
      case 'MID$': {
        const text = String(args[0] ?? '');
        const start = Math.max(1, Number(args[1]) || 1) - 1;
        const length = args.length > 2 ? Number(args[2]) || 0 : text.length;
        return text.slice(start, start + length);
      }
      case 'RND': return Math.random();
      case 'INT': return Math.floor(Number(args[0]) || 0);
      case 'ABS': return Math.abs(Number(args[0]) || 0);
      case 'VAL': return Number.parseFloat(String(args[0] ?? '')) || 0;
      case 'STR$': return String(Number(args[0]) || 0);
      default: return null;
    }
  }

  function splitPrint(expr) {
    const parts = [];
    let current = '';
    let inString = false;
    for (let i = 0; i < expr.length; i += 1) {
      const char = expr[i];
      if (char === '"') inString = !inString;
      if (!inString && (char === ';' || char === ',')) {
        parts.push(current);
        current = '';
      } else {
        current += char;
      }
    }
    parts.push(current);
    return parts;
  }

  function evalCondition(expr) {
    const match = expr.match(/^(.+?)\s*(<=|>=|<>|=|<|>)\s*(.+)$/);
    if (!match) return Boolean(evalExpr(expr));
    const left = evalExpr(match[1]);
    const right = evalExpr(match[3]);
    switch (match[2]) {
      case '=': return left === right;
      case '<>': return left !== right;
      case '<': return left < right;
      case '>': return left > right;
      case '<=': return left <= right;
      case '>=': return left >= right;
      default: return false;
    }
  }

  async function executeStatement(statement, currentLineNumber = null) {
    const raw = statement.trim();
    const upper = raw.toUpperCase();
    if (!raw || upper.startsWith('REM') || upper.startsWith("'")) return;

    if (upper === 'CLS' || upper === 'HOME') {
      clearScreen();
      return;
    }
    if (upper === 'END' || upper === 'STOP') {
      running = false;
      return;
    }
    if (upper.startsWith('PRINT')) {
      const expr = raw.slice(5).trim();
      println(expr ? splitPrint(expr).map((part) => evalExpr(part)).join('') : '');
      return;
    }
    if (upper.startsWith('LET ')) {
      assign(raw.slice(4));
      return;
    }
    if (/^[A-Z][A-Z0-9]*\$?\s*=/.test(upper)) {
      assign(raw);
      return;
    }
    if (upper.startsWith('INPUT')) {
      const name = raw.slice(5).trim().replace(/^["].*["];?\s*/, '').trim();
      const value = window.prompt('? ', '') ?? '';
      setVar(name, name.endsWith('$') ? value : Number(value || 0));
      println(`? ${value}`);
      return;
    }
    if (upper.startsWith('GOTO')) {
      const target = findLine(Number(evalExpr(raw.slice(4))));
      if (target < 0) throw new Error(formatRuntimeError('UNDEFINED LINE', currentLineNumber));
      pc = target;
      return;
    }
    if (upper.startsWith('IF')) {
      const thenIndex = upper.indexOf(' THEN ');
      if (thenIndex < 0) throw new Error(formatRuntimeError('SYNTAX ERROR', currentLineNumber));
      if (!evalCondition(raw.slice(2, thenIndex))) return;
      const thenPart = raw.slice(thenIndex + 6).trim();
      if (/^\d+$/.test(thenPart)) {
        const target = findLine(Number(thenPart));
        if (target < 0) throw new Error(formatRuntimeError('UNDEFINED LINE', currentLineNumber));
        pc = target;
      } else {
        await executeStatement(thenPart, currentLineNumber);
      }
      return;
    }
    if (upper.startsWith('FOR')) {
      executeFor(raw.slice(3).trim(), currentLineNumber);
      return;
    }
    if (upper.startsWith('NEXT')) {
      executeNext(raw.slice(4).trim(), currentLineNumber);
      return;
    }

    throw new Error(formatRuntimeError('SYNTAX ERROR', currentLineNumber));
  }

  function formatRuntimeError(message, lineNumber) {
    return lineNumber === null ? message : `${message} IN ${lineNumber}`;
  }

  function executeFor(statement, currentLineNumber) {
    const match = statement.match(/^([A-Z][A-Z0-9]*)\s*=\s*(.+?)\s+TO\s+(.+?)(?:\s+STEP\s+(.+))?$/i);
    if (!match) throw new Error(formatRuntimeError('SYNTAX ERROR', currentLineNumber));

    const variable = match[1].toUpperCase();
    const start = Number(evalExpr(match[2]));
    const end = Number(evalExpr(match[3]));
    const step = match[4] ? Number(evalExpr(match[4])) : 1;
    if ([start, end, step].some(Number.isNaN) || step === 0) {
      throw new Error(formatRuntimeError('SYNTAX ERROR', currentLineNumber));
    }

    setVar(variable, start);
    forStack.push({ variable, end, step, returnPc: pc + 1 });
  }

  function executeNext(statement, currentLineNumber) {
    if (!forStack.length) throw new Error(formatRuntimeError('NEXT WITHOUT FOR', currentLineNumber));

    const expected = statement.trim().toUpperCase();
    const loop = forStack[forStack.length - 1];
    if (expected && expected !== loop.variable) {
      throw new Error(formatRuntimeError('NEXT WITHOUT FOR', currentLineNumber));
    }

    const nextValue = Number(getVar(loop.variable)) + loop.step;
    setVar(loop.variable, nextValue);
    const shouldContinue = loop.step >= 0 ? nextValue <= loop.end : nextValue >= loop.end;
    if (shouldContinue) pc = loop.returnPc;
    else forStack.pop();
  }

  function assign(statement) {
    const index = statement.indexOf('=');
    if (index < 0) throw new Error('SYNTAX ERROR');
    const name = statement.slice(0, index).trim();
    if (!/^[A-Z][A-Z0-9]*\$?$/i.test(name)) throw new Error('SYNTAX ERROR');
    setVar(name, evalExpr(statement.slice(index + 1)));
  }

  async function runProgram() {
    rebuildLines();
    running = true;
    pc = 0;
    forStack.length = 0;
    if (window.fbasicIncrementRuns) window.fbasicIncrementRuns();
    if (window.fbasicAddHistory && lines.length) {
      var code = lines.map(function(l) { return l.number + ' ' + l.code; }).join('\n');
      window.fbasicAddHistory(code, 'console');
    }
    let guard = 0;
    while (running && pc < lines.length) {
      if (++guard > 10000) throw new Error('BREAK IN LOOP');
      const before = pc;
      const current = lines[pc];
      try {
        await executeStatement(current.code, current.number);
      } catch (error) {
        throw new Error(error.message.includes(' IN ') ? error.message : `${error.message} IN ${current.number}`);
      }
      if (pc === before) pc += 1;
    }
    println('READY.');
  }

  async function handleCommand(command) {
    const raw = command.trim();
    if (!raw) return;
    println(`]${raw}`);

    const lineMatch = raw.match(/^(\d+)\s*(.*)$/);
    if (lineMatch) {
      const number = Number(lineMatch[1]);
      const code = lineMatch[2].trim();
      if (code) program.set(number, code);
      else program.delete(number);
      return;
    }

    const upper = raw.toUpperCase();
    if (upper === 'LIST') {
      listProgram();
      return;
    }
    if (upper === 'RUN') {
      await runProgram();
      return;
    }
    if (upper === 'SYSTEM') {
      boot();
      return;
    }

    await executeStatement(raw);
  }

  function switchMode(mode) {
    const isConsole = mode === 'console';
    modernMode.hidden = isConsole;
    consoleMode.hidden = !isConsole;
    modernButton.classList.toggle('active', !isConsole);
    consoleButton.classList.toggle('active', isConsole);
    if (isConsole) input.focus();
  }

  function applyDisplaySettings() {
    const theme = displayTheme?.value || 'green';
    const font = displayFont?.value || 'mono';
    document.body.classList.remove('fbasic-theme-green', 'fbasic-theme-amber', 'fbasic-theme-mono', 'fbasic-theme-fc');
    document.body.classList.remove('fbasic-font-mono', 'fbasic-font-pixel', 'fbasic-font-crt');
    document.body.classList.add(`fbasic-theme-${theme}`, `fbasic-font-${font}`);
  }

  modernButton.addEventListener('click', () => switchMode('modern'));
  consoleButton.addEventListener('click', () => switchMode('console'));
  displayTheme?.addEventListener('change', applyDisplaySettings);
  displayFont?.addEventListener('change', applyDisplaySettings);
  input.addEventListener('keydown', async (event) => {
    if (event.key !== 'Enter') return;
    event.preventDefault();
    const command = input.value;
    input.value = '';
    try {
      await handleCommand(command);
    } catch (error) {
      println(`?${error.message}`);
    }
  });

  applyDisplaySettings();
  boot();
})();
