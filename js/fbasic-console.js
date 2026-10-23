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
  const arrays = new Map();
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
    arrays.clear();
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

  const NO_ARG_FUNCTIONS = new Set(['RND']);
  const BUILTIN_FUNCTIONS = new Set([
    'CHR$', 'STR$', 'LEFT$', 'RIGHT$', 'MID$', 'STRING$', 'SPACE$', 'HEX$', 'OCT$',
    'ASC', 'LEN', 'VAL', 'INSTR', 'RND', 'INT', 'ABS', 'SQR', 'SGN',
    'SIN', 'COS', 'TAN', 'ATN', 'LOG', 'EXP',
  ]);

  function getArrayElement(name, index) {
    const array = arrays.get(name);
    if (!array) throw new Error(`ARRAY NOT DIMMED: ${name}`);
    if (index < 0 || index >= array.values.length) throw new Error(`SUBSCRIPT OUT OF RANGE: ${name}(${index})`);
    return array.values[index];
  }

  function setArrayElement(name, index, value) {
    const array = arrays.get(name);
    if (!array) throw new Error(`ARRAY NOT DIMMED: ${name}`);
    if (index < 0 || index >= array.values.length) throw new Error(`SUBSCRIPT OUT OF RANGE: ${name}(${index})`);
    array.values[index] = value;
  }

  function executeDim(statement, currentLineNumber) {
    splitPrint(statement).forEach((part) => {
      const match = part.trim().match(/^([A-Z][A-Z0-9]*\$?)\s*\((.+)\)$/i);
      if (!match) throw new Error(formatRuntimeError('SYNTAX ERROR', currentLineNumber));
      const name = match[1].toUpperCase();
      const size = Math.floor(Number(evalExpr(match[2])));
      if (size < 0 || size > 10000) throw new Error(formatRuntimeError('SYNTAX ERROR', currentLineNumber));
      const isString = name.endsWith('$');
      arrays.set(name, { values: Array.from({ length: size + 1 }, () => (isString ? '' : 0)) });
    });
  }

  function evalExpr(expr) {
    const trimmed = expr.trim();
    if (!trimmed) return '';
    const tokens = tokenizeExpression(trimmed);
    if (!tokens.length) return '';
    const parser = { tokens, pos: 0 };
    const value = parseAdditive(parser);
    if (parser.pos < parser.tokens.length) throw new Error('SYNTAX ERROR');
    return value;
  }

  function tokenizeExpression(expr) {
    const tokens = [];
    let i = 0;
    while (i < expr.length) {
      const char = expr[i];
      if (char === ' ' || char === '\t') { i += 1; continue; }
      if (char === '"') {
        let value = '';
        let j = i + 1;
        while (j < expr.length && expr[j] !== '"') { value += expr[j]; j += 1; }
        tokens.push({ type: 'string', value });
        i = j + 1;
        continue;
      }
      if (/[0-9]/.test(char) || (char === '.' && /[0-9]/.test(expr[i + 1] || ''))) {
        let j = i;
        while (j < expr.length && /[0-9.]/.test(expr[j])) j += 1;
        tokens.push({ type: 'number', value: Number(expr.slice(i, j)) });
        i = j;
        continue;
      }
      if (/[A-Za-z]/.test(char)) {
        let j = i;
        while (j < expr.length && /[A-Za-z0-9]/.test(expr[j])) j += 1;
        if (expr[j] === '$') j += 1;
        tokens.push({ type: 'ident', value: expr.slice(i, j).toUpperCase() });
        i = j;
        continue;
      }
      const two = expr.slice(i, i + 2);
      if (two === '<=' || two === '>=' || two === '<>') {
        tokens.push({ type: 'op', value: two });
        i += 2;
        continue;
      }
      if ('+-*/\\(),=<>'.includes(char)) {
        tokens.push({ type: 'op', value: char });
        i += 1;
        continue;
      }
      throw new Error('SYNTAX ERROR');
    }
    return tokens;
  }

  function parseAdditive(parser) {
    let left = parseMultiplicative(parser);
    while (peekOperator(parser, '+') || peekOperator(parser, '-')) {
      const op = parser.tokens[parser.pos].value;
      parser.pos += 1;
      const right = parseMultiplicative(parser);
      if (op === '+') {
        left = (typeof left === 'string' || typeof right === 'string')
          ? String(left) + String(right)
          : Number(left) + Number(right);
      } else {
        left = Number(left) - Number(right);
      }
    }
    return left;
  }

  function parseMultiplicative(parser) {
    let left = parseUnary(parser);
    for (;;) {
      if (peekOperator(parser, '*')) {
        parser.pos += 1;
        left = Number(left) * Number(parseUnary(parser));
      } else if (peekOperator(parser, '/')) {
        parser.pos += 1;
        const right = Number(parseUnary(parser));
        if (right === 0) throw new Error('DIVISION BY ZERO');
        left = Number(left) / right;
      } else if (peekOperator(parser, '\\')) {
        parser.pos += 1;
        const right = Number(parseUnary(parser));
        left = right === 0 ? 0 : Math.trunc(Number(left) / right);
      } else if (peekIdentifier(parser, 'MOD')) {
        parser.pos += 1;
        const right = Number(parseUnary(parser));
        left = right === 0 ? 0 : Number(left) % right;
      } else {
        break;
      }
    }
    return left;
  }

  function parseUnary(parser) {
    if (peekOperator(parser, '-')) {
      parser.pos += 1;
      return -Number(parseUnary(parser));
    }
    if (peekOperator(parser, '+')) {
      parser.pos += 1;
      return parseUnary(parser);
    }
    return parsePrimary(parser);
  }

  function parsePrimary(parser) {
    const token = parser.tokens[parser.pos];
    if (!token) throw new Error('SYNTAX ERROR');

    if (token.type === 'number') { parser.pos += 1; return token.value; }
    if (token.type === 'string') { parser.pos += 1; return token.value; }

    if (token.type === 'ident') {
      parser.pos += 1;
      if (peekOperator(parser, '(')) {
        if (BUILTIN_FUNCTIONS.has(token.value)) {
          parser.pos += 1;
          const args = [];
          if (!peekOperator(parser, ')')) {
            args.push(parseAdditive(parser));
            while (peekOperator(parser, ',')) {
              parser.pos += 1;
              args.push(parseAdditive(parser));
            }
          }
          if (!peekOperator(parser, ')')) throw new Error('SYNTAX ERROR');
          parser.pos += 1;
          return callBuiltin(token.value, args);
        }
        // 数组元素访问: NAME(下标表达式)
        parser.pos += 1;
        const index = Math.floor(Number(parseAdditive(parser)) || 0);
        if (!peekOperator(parser, ')')) throw new Error('SYNTAX ERROR');
        parser.pos += 1;
        return getArrayElement(token.value, index);
      }
      if (NO_ARG_FUNCTIONS.has(token.value)) {
        return callBuiltin(token.value, []);
      }
      return getVar(token.value);
    }

    if (token.type === 'op' && token.value === '(') {
      parser.pos += 1;
      const value = parseAdditive(parser);
      if (!peekOperator(parser, ')')) throw new Error('SYNTAX ERROR');
      parser.pos += 1;
      return value;
    }

    throw new Error('SYNTAX ERROR');
  }

  function peekOperator(parser, value) {
    const token = parser.tokens[parser.pos];
    return Boolean(token) && token.type === 'op' && token.value === value;
  }

  function peekIdentifier(parser, value) {
    const token = parser.tokens[parser.pos];
    return Boolean(token) && token.type === 'ident' && token.value === value;
  }

  function callBuiltin(name, args) {
    const num = (index) => Number(args[index] ?? 0) || 0;
    const str = (index) => String(args[index] ?? '');

    switch (name) {
      case 'CHR$': return String.fromCharCode(num(0));
      case 'STR$': return String(num(0));
      case 'LEFT$': return str(0).slice(0, Math.max(0, num(1)));
      case 'RIGHT$': {
        const text = str(0);
        const count = Math.max(0, num(1));
        return text.slice(Math.max(0, text.length - count));
      }
      case 'MID$': {
        const text = str(0);
        const start = Math.max(1, num(1));
        const length = args.length > 2 ? Math.max(0, num(2)) : text.length;
        return text.slice(start - 1, start - 1 + length);
      }
      case 'STRING$': {
        const count = Math.max(0, num(0));
        const second = args[1];
        const char = typeof second === 'number'
          ? String.fromCharCode(second)
          : String(second ?? '').charAt(0) || ' ';
        return char.repeat(count);
      }
      case 'SPACE$': return ' '.repeat(Math.max(0, num(0)));
      case 'HEX$': return Math.trunc(num(0)).toString(16).toUpperCase();
      case 'OCT$': return Math.trunc(num(0)).toString(8).toUpperCase();
      case 'ASC': return str(0).charCodeAt(0) || 0;
      case 'LEN': return str(0).length;
      case 'VAL': return Number.parseFloat(str(0)) || 0;
      case 'INSTR': {
        const haystack = str(0);
        const needle = str(1);
        return needle ? haystack.indexOf(needle) + 1 : 0;
      }
      case 'RND': return Math.random();
      case 'INT': return Math.floor(num(0));
      case 'ABS': return Math.abs(num(0));
      case 'SQR': return Math.sqrt(num(0));
      case 'SGN': return Math.sign(num(0));
      case 'SIN': return Math.sin(num(0));
      case 'COS': return Math.cos(num(0));
      case 'TAN': return Math.tan(num(0));
      case 'ATN': return Math.atan(num(0));
      case 'LOG': return Math.log(num(0));
      case 'EXP': return Math.exp(num(0));
      default: throw new Error('SYNTAX ERROR');
    }
  }

  function splitPrint(expr) {
    const parts = [];
    let current = '';
    let inString = false;
    let depth = 0;
    for (let i = 0; i < expr.length; i += 1) {
      const char = expr[i];
      if (char === '"') inString = !inString;
      if (!inString) {
        if (char === '(') depth += 1;
        if (char === ')') depth = Math.max(0, depth - 1);
      }
      if (!inString && depth === 0 && (char === ';' || char === ',')) {
        parts.push(current);
        current = '';
      } else {
        current += char;
      }
    }
    parts.push(current);
    return parts;
  }

  function findCompareOperator(expr) {
    let inString = false;
    for (let i = 0; i < expr.length; i += 1) {
      const char = expr[i];
      if (char === '"') { inString = !inString; continue; }
      if (inString) continue;
      if (char === '<' || char === '>') {
        const next = expr[i + 1];
        if (next === '=' || (char === '<' && next === '>')) return { index: i, op: char + next };
        return { index: i, op: char };
      }
      if (char === '=') return { index: i, op: '=' };
    }
    return null;
  }

  function evalCondition(expr) {
    const found = findCompareOperator(expr);
    if (!found) return Boolean(evalExpr(expr));
    const left = evalExpr(expr.slice(0, found.index));
    const right = evalExpr(expr.slice(found.index + found.op.length));
    switch (found.op) {
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
    if (upper.startsWith('DIM ')) {
      executeDim(raw.slice(4).trim(), currentLineNumber);
      return;
    }
    if (/^[A-Z][A-Z0-9]*\$?\s*\(.*\)\s*=/.test(upper)) {
      assign(raw);
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
    const target = statement.slice(0, index).trim();
    const value = evalExpr(statement.slice(index + 1));

    const arrayMatch = target.match(/^([A-Z][A-Z0-9]*\$?)\s*\((.+)\)$/i);
    if (arrayMatch) {
      const name = arrayMatch[1].toUpperCase();
      const idx = Math.floor(Number(evalExpr(arrayMatch[2])));
      setArrayElement(name, idx, name.endsWith('$') ? String(value) : Number(value));
      return;
    }

    if (!/^[A-Z][A-Z0-9]*\$?$/i.test(target)) throw new Error('SYNTAX ERROR');
    setVar(target, value);
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
