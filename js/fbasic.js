(() => {
  const defaultProgram = `10 CLS
20 PRINT "HELLO FAMILY BASIC"
30 LET A = 1
40 FOR I = 1 TO 5
50 PRINT "I="; I; " A="; A
60 LET A = A + I
70 NEXT I
80 INPUT "YOUR NAME"; N$
90 IF N$ = "" THEN 120
100 PRINT "NICE TO MEET YOU, "; N$
110 GOTO 130
120 PRINT "NO NAME? OK!"
130 PRINT "READY."
140 END`;

  class FBasicInterpreter {
    constructor(screen) {
      this.screen = screen;
      this.noArgFunctions = new Set(['RND']);
      this.builtinFunctions = new Set([
        'CHR$', 'STR$', 'LEFT$', 'RIGHT$', 'MID$', 'STRING$', 'SPACE$', 'HEX$', 'OCT$',
        'ASC', 'LEN', 'VAL', 'INSTR', 'RND', 'INT', 'ABS', 'SQR', 'SGN',
        'SIN', 'COS', 'TAN', 'ATN', 'LOG', 'EXP',
      ]);
      this.resetRuntime();
    }

    boot() {
      this.resetRuntime();
      this.print('FAMILY BASIC JS SIMULATOR');
      this.print('READY.');
    }

    resetRuntime() {
      this.program = [];
      this.lineIndex = new Map();
      this.variables = new Map();
      this.arrays = new Map();
      this.callStack = [];
      this.forStack = [];
      this.pc = 0;
      this.output = [];
      this.running = false;
    }

    load(source) {
      this.resetRuntime();
      const rows = source.split(/\r?\n/);
      const parsed = [];

      rows.forEach((raw, rowIndex) => {
        const trimmed = raw.trim();
        if (!trimmed) return;
        const match = trimmed.match(/^(\d+)\s*(.*)$/);
        if (!match) {
          throw new Error(`第 ${rowIndex + 1} 行缺少行号: ${raw}`);
        }
        parsed.push({ number: Number(match[1]), code: match[2].trim(), raw: trimmed });
      });

      parsed.sort((a, b) => a.number - b.number);
      parsed.forEach((line, index) => {
        if (this.lineIndex.has(line.number)) {
          throw new Error(`重复行号: ${line.number}`);
        }
        this.lineIndex.set(line.number, index);
      });
      this.program = parsed;
    }

    async run(source, onStep) {
      this.load(source);
      this.running = true;
      this.pc = 0;
      this.render();

      let guard = 0;
      while (this.running && this.pc < this.program.length) {
        if (++guard > 10000) {
          throw new Error('程序执行超过 10000 步，可能存在死循环。');
        }

        const current = this.program[this.pc];
        const beforePc = this.pc;
        await this.executeStatement(current.code, current.number);
        if (this.pc === beforePc) this.pc += 1;
        if (onStep) await onStep(current.number, this);
      }

      this.running = false;
      this.render();
    }

    list(source) {
      this.load(source);
      this.output = this.program.map((line) => line.raw);
      this.render();
    }

    cls() {
      this.output = [];
      this.render();
    }

    async directCommand(command, source) {
      const raw = command.trim();
      const upper = raw.toUpperCase();
      if (!raw) return;

      this.print(`>${raw}`);

      if (upper === 'CLS' || upper === 'HOME') {
        this.cls();
        return;
      }
      if (upper === 'LIST') {
        this.list(source);
        return;
      }
      if (upper === 'RUN') {
        await this.run(source);
        return;
      }
      if (upper === 'SYSTEM') {
        this.boot();
        return;
      }
      if (/^\d+\s*/.test(raw)) {
        this.upsertProgramLine(raw, source);
        return;
      }

      try {
        await this.executeStatement(raw, 0);
      } catch (error) {
        this.print(`SYNTAX ERROR: ${error.message}`);
      }
    }

    upsertProgramLine(raw, source) {
      const match = raw.match(/^(\d+)\s*(.*)$/);
      if (!match) return;

      const lineNumber = Number(match[1]);
      const codePart = match[2].trim();
      const rows = source.split(/\r?\n/).filter((line) => line.trim() && !line.trim().startsWith(`${lineNumber} `) && line.trim() !== String(lineNumber));

      if (codePart) rows.push(raw);
      rows.sort((a, b) => Number(a.trim().match(/^(\d+)/)?.[1] || 0) - Number(b.trim().match(/^(\d+)/)?.[1] || 0));
      document.getElementById('fbasic-code').value = rows.join('\n');
      this.print(codePart ? `LINE ${lineNumber} OK` : `LINE ${lineNumber} DELETED`);
    }

    print(text = '') {
      this.output.push(String(text));
      this.render();
    }

    render() {
      this.screen.textContent = this.output.join('\n');
      this.screen.scrollTop = this.screen.scrollHeight;
    }

    async executeStatement(code, lineNumber) {
      const statement = code.trim();
      if (!statement) return;

      const upper = statement.toUpperCase();
      if (upper.startsWith('REM') || upper.startsWith("'")) return;
      if (upper === 'END' || upper === 'STOP') {
        this.running = false;
        return;
      }
      if (upper === 'CLS' || upper === 'HOME') {
        this.cls();
        return;
      }
      if (upper.startsWith('PRINT')) {
        this.executePrint(statement.slice(5).trim());
        return;
      }
      if (upper.startsWith('LET ')) {
        this.executeAssignment(statement.slice(4).trim());
        return;
      }
      if (upper.startsWith('INPUT')) {
        await this.executeInput(statement.slice(5).trim());
        return;
      }
      if (upper.startsWith('GOTO')) {
        this.gotoLine(this.evalNumeric(statement.slice(4).trim()));
        return;
      }
      if (upper.startsWith('GOSUB')) {
        this.callStack.push(this.pc + 1);
        this.gotoLine(this.evalNumeric(statement.slice(5).trim()));
        return;
      }
      if (upper === 'RETURN') {
        if (!this.callStack.length) throw new Error(`第 ${lineNumber} 行 RETURN 没有对应 GOSUB`);
        this.pc = this.callStack.pop();
        return;
      }
      if (upper.startsWith('IF')) {
        await this.executeIf(statement.slice(2).trim(), lineNumber);
        return;
      }
      if (upper.startsWith('FOR')) {
        this.executeFor(statement.slice(3).trim(), lineNumber);
        return;
      }
      if (upper.startsWith('NEXT')) {
        this.executeNext(statement.slice(4).trim(), lineNumber);
        return;
      }
      if (upper.startsWith('DIM ')) {
        this.executeDim(statement.slice(4).trim(), lineNumber);
        return;
      }
      if (/^[A-Z][A-Z0-9]*\$?\s*\(.*\)\s*=/.test(upper)) {
        this.executeAssignment(statement);
        return;
      }
      if (/^[A-Z][A-Z0-9]*\$?\s*=/.test(upper)) {
        this.executeAssignment(statement);
        return;
      }

      throw new Error(`第 ${lineNumber} 行暂不支持: ${statement}`);
    }

    executePrint(expr) {
      if (!expr) {
        this.print('');
        return;
      }

      const parts = this.splitTopLevel(expr, /[;,]/g);
      const values = parts.map((part) => this.evalExpression(part.trim()));
      this.print(values.join(''));
    }

    async executeInput(expr) {
      let promptText = '?';
      let variable = expr.trim();
      const separator = this.findTopLevelSeparator(expr, [';', ',']);

      if (separator > -1) {
        promptText = String(this.evalExpression(expr.slice(0, separator).trim()));
        variable = expr.slice(separator + 1).trim();
      }

      if (!this.isVariableName(variable)) {
        throw new Error(`INPUT 变量名无效: ${variable}`);
      }

      const value = window.prompt(`${promptText} `, '') ?? '';
      this.setVariable(variable, variable.endsWith('$') ? value : Number(value || 0));
      this.print(`${promptText} ${value}`);
    }

    async executeIf(expr, lineNumber) {
      const thenIndex = expr.toUpperCase().indexOf(' THEN ');
      if (thenIndex < 0) throw new Error(`第 ${lineNumber} 行 IF 缺少 THEN`);

      const condition = expr.slice(0, thenIndex).trim();
      const thenPart = expr.slice(thenIndex + 6).trim();
      if (!this.evalCondition(condition)) return;

      if (/^\d+$/.test(thenPart)) {
        this.gotoLine(Number(thenPart));
      } else {
        await this.executeStatement(thenPart, lineNumber);
      }
    }

    executeFor(expr, lineNumber) {
      const match = expr.match(/^([A-Z][A-Z0-9]*)\s*=\s*(.+?)\s+TO\s+(.+?)(?:\s+STEP\s+(.+))?$/i);
      if (!match) throw new Error(`第 ${lineNumber} 行 FOR 语法错误`);

      const variable = match[1].toUpperCase();
      const start = this.evalNumeric(match[2]);
      const end = this.evalNumeric(match[3]);
      const step = match[4] ? this.evalNumeric(match[4]) : 1;

      this.setVariable(variable, start);
      this.forStack.push({ variable, end, step, returnPc: this.pc + 1 });
    }

    executeNext(expr, lineNumber) {
      if (!this.forStack.length) throw new Error(`第 ${lineNumber} 行 NEXT 没有对应 FOR`);

      const expected = expr.trim().toUpperCase();
      const loop = this.forStack[this.forStack.length - 1];
      if (expected && expected !== loop.variable) {
        throw new Error(`第 ${lineNumber} 行 NEXT ${expected} 与 FOR ${loop.variable} 不匹配`);
      }

      const nextValue = Number(this.getVariable(loop.variable)) + loop.step;
      this.setVariable(loop.variable, nextValue);
      const shouldContinue = loop.step >= 0 ? nextValue <= loop.end : nextValue >= loop.end;
      if (shouldContinue) {
        this.pc = loop.returnPc;
      } else {
        this.forStack.pop();
      }
    }

    executeDim(expr, lineNumber) {
      const parts = this.splitTopLevel(expr, /,/g);
      parts.forEach((part) => {
        const match = part.trim().match(/^([A-Z][A-Z0-9]*\$?)\s*\((.+)\)$/i);
        if (!match) throw new Error(`第 ${lineNumber} 行 DIM 语法错误: ${part.trim()}`);

        const name = match[1].toUpperCase();
        const size = Math.floor(this.evalNumeric(match[2]));
        if (size < 0 || size > 10000) throw new Error(`第 ${lineNumber} 行 DIM 数组大小无效: ${size}`);

        const isString = name.endsWith('$');
        this.arrays.set(name, {
          values: Array.from({ length: size + 1 }, () => (isString ? '' : 0)),
        });
      });
    }

    getArrayElement(name, index) {
      const array = this.arrays.get(name);
      if (!array) throw new Error(`数组未定义: ${name}`);
      if (index < 0 || index >= array.values.length) {
        throw new Error(`数组下标越界: ${name}(${index})`);
      }
      return array.values[index];
    }

    setArrayElement(name, index, value) {
      const array = this.arrays.get(name);
      if (!array) throw new Error(`数组未定义: ${name}`);
      if (index < 0 || index >= array.values.length) {
        throw new Error(`数组下标越界: ${name}(${index})`);
      }
      array.values[index] = value;
    }

    executeAssignment(expr) {
      const index = expr.indexOf('=');
      if (index < 0) throw new Error(`赋值语句缺少 =: ${expr}`);

      const target = expr.slice(0, index).trim();
      const value = this.evalExpression(expr.slice(index + 1).trim());

      const arrayMatch = target.match(/^([A-Z][A-Z0-9]*\$?)\s*\((.+)\)$/i);
      if (arrayMatch) {
        const name = arrayMatch[1].toUpperCase();
        const idx = Math.floor(this.evalNumeric(arrayMatch[2]));
        this.setArrayElement(name, idx, name.endsWith('$') ? String(value) : Number(value));
        return;
      }

      const variable = target.toUpperCase();
      if (!this.isVariableName(variable)) throw new Error(`变量名无效: ${variable}`);
      this.setVariable(variable, variable.endsWith('$') ? String(value) : Number(value));
    }

    gotoLine(number) {
      const line = Number(number);
      if (!this.lineIndex.has(line)) throw new Error(`找不到行号: ${line}`);
      this.pc = this.lineIndex.get(line);
    }

    evalCondition(expr) {
      const found = this.findCompareOperator(expr);
      if (!found) return Boolean(this.evalExpression(expr));

      const left = this.evalExpression(expr.slice(0, found.index));
      const right = this.evalExpression(expr.slice(found.index + found.op.length));

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

    findCompareOperator(expr) {
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

    evalNumeric(expr) {
      const value = this.evalExpression(expr);
      const number = Number(value);
      if (Number.isNaN(number)) throw new Error(`不是数字表达式: ${expr}`);
      return number;
    }

    evalExpression(expr) {
      const trimmed = expr.trim();
      if (!trimmed) return '';
      const tokens = this.tokenizeExpression(trimmed);
      if (!tokens.length) return '';
      const parser = { tokens, pos: 0 };
      const value = this.parseAdditive(parser);
      if (parser.pos < parser.tokens.length) {
        throw new Error(`表达式语法错误: ${trimmed}`);
      }
      return value;
    }

    tokenizeExpression(expr) {
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
        throw new Error(`表达式包含不支持字符: ${char}`);
      }
      return tokens;
    }

    parseAdditive(parser) {
      let left = this.parseMultiplicative(parser);
      while (this.peekOperator(parser, '+') || this.peekOperator(parser, '-')) {
        const op = parser.tokens[parser.pos].value;
        parser.pos += 1;
        const right = this.parseMultiplicative(parser);
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

    parseMultiplicative(parser) {
      let left = this.parseUnary(parser);
      for (;;) {
        if (this.peekOperator(parser, '*')) {
          parser.pos += 1;
          left = Number(left) * Number(this.parseUnary(parser));
        } else if (this.peekOperator(parser, '/')) {
          parser.pos += 1;
          const right = Number(this.parseUnary(parser));
          if (right === 0) throw new Error('除数为零');
          left = Number(left) / right;
        } else if (this.peekOperator(parser, '\\')) {
          parser.pos += 1;
          const right = Number(this.parseUnary(parser));
          left = right === 0 ? 0 : Math.trunc(Number(left) / right);
        } else if (this.peekIdentifier(parser, 'MOD')) {
          parser.pos += 1;
          const right = Number(this.parseUnary(parser));
          left = right === 0 ? 0 : Number(left) % right;
        } else {
          break;
        }
      }
      return left;
    }

    parseUnary(parser) {
      if (this.peekOperator(parser, '-')) {
        parser.pos += 1;
        return -Number(this.parseUnary(parser));
      }
      if (this.peekOperator(parser, '+')) {
        parser.pos += 1;
        return this.parseUnary(parser);
      }
      return this.parsePrimary(parser);
    }

    parsePrimary(parser) {
      const token = parser.tokens[parser.pos];
      if (!token) throw new Error('表达式不完整');

      if (token.type === 'number') { parser.pos += 1; return token.value; }
      if (token.type === 'string') { parser.pos += 1; return token.value; }

      if (token.type === 'ident') {
        parser.pos += 1;
        if (this.peekOperator(parser, '(')) {
          if (this.builtinFunctions.has(token.value)) {
            parser.pos += 1;
            const args = [];
            if (!this.peekOperator(parser, ')')) {
              args.push(this.parseAdditive(parser));
              while (this.peekOperator(parser, ',')) {
                parser.pos += 1;
                args.push(this.parseAdditive(parser));
              }
            }
            if (!this.peekOperator(parser, ')')) throw new Error(`函数 ${token.value} 缺少右括号`);
            parser.pos += 1;
            return this.callBuiltin(token.value, args);
          }
          // 数组元素访问: NAME(下标表达式)
          parser.pos += 1;
          const index = Math.floor(Number(this.parseAdditive(parser)) || 0);
          if (!this.peekOperator(parser, ')')) throw new Error(`数组 ${token.value} 缺少右括号`);
          parser.pos += 1;
          return this.getArrayElement(token.value, index);
        }
        if (this.noArgFunctions.has(token.value)) {
          return this.callBuiltin(token.value, []);
        }
        return this.getVariable(token.value);
      }

      if (token.type === 'op' && token.value === '(') {
        parser.pos += 1;
        const value = this.parseAdditive(parser);
        if (!this.peekOperator(parser, ')')) throw new Error('缺少右括号');
        parser.pos += 1;
        return value;
      }

      throw new Error(`表达式语法错误: ${token.value}`);
    }

    peekOperator(parser, value) {
      const token = parser.tokens[parser.pos];
      return Boolean(token) && token.type === 'op' && token.value === value;
    }

    peekIdentifier(parser, value) {
      const token = parser.tokens[parser.pos];
      return Boolean(token) && token.type === 'ident' && token.value === value;
    }

    callBuiltin(name, args) {
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
        default: throw new Error(`未知函数: ${name}`);
      }
    }

    getVariable(name) {
      const key = name.toUpperCase();
      if (this.variables.has(key)) return this.variables.get(key);
      return key.endsWith('$') ? '' : 0;
    }

    setVariable(name, value) {
      this.variables.set(name.toUpperCase(), value);
    }

    isVariableName(value) {
      return /^[A-Z][A-Z0-9]*\$?$/i.test(value.trim());
    }

    splitTopLevel(input, delimiterRegex) {
      const parts = [];
      let current = '';
      let inString = false;
      let depth = 0;

      for (let i = 0; i < input.length; i += 1) {
        const char = input[i];
        if (char === '"') inString = !inString;
        if (!inString) {
          if (char === '(') depth += 1;
          if (char === ')') depth = Math.max(0, depth - 1);
        }
        delimiterRegex.lastIndex = 0;
        if (!inString && depth === 0 && delimiterRegex.test(char)) {
          parts.push(current);
          current = '';
        } else {
          current += char;
        }
      }
      parts.push(current);
      return parts;
    }

    findTopLevelSeparator(input, separators) {
      let inString = false;
      for (let i = 0; i < input.length; i += 1) {
        const char = input[i];
        if (char === '"') inString = !inString;
        if (!inString && separators.includes(char)) return i;
      }
      return -1;
    }
  }

  // 暴露解释器类，供可视化演示页等复用
  window.FBasicInterpreter = FBasicInterpreter;

  const code = document.getElementById('fbasic-code');
  const screen = document.getElementById('fbasic-screen');
  const runButton = document.getElementById('fbasic-run');
  const listButton = document.getElementById('fbasic-list');
  const clearButton = document.getElementById('fbasic-clear');
  const resetButton = document.getElementById('fbasic-reset');
  const commandInput = document.getElementById('fbasic-command');
  const execButton = document.getElementById('fbasic-exec');

  if (!code || !screen) return;

  const interpreter = new FBasicInterpreter(screen);
  interpreter.boot();

  const executeDirectCommand = async () => {
    const command = commandInput.value;
    commandInput.value = '';
    try {
      await interpreter.directCommand(command, code.value);
    } catch (error) {
      interpreter.print(`ERROR: ${error.message}`);
    }
  };

  runButton.addEventListener('click', async () => {
    try {
      await interpreter.run(code.value);
      if (window.fbasicIncrementRuns) window.fbasicIncrementRuns();
      if (window.fbasicAddHistory && code.value.trim()) {
        window.fbasicAddHistory(code.value, 'modern');
      }
    } catch (error) {
      interpreter.print(`ERROR: ${error.message}`);
    }
  });

  listButton.addEventListener('click', () => {
    try {
      interpreter.list(code.value);
    } catch (error) {
      interpreter.print(`ERROR: ${error.message}`);
    }
  });

  clearButton.addEventListener('click', () => interpreter.cls());
  resetButton.addEventListener('click', () => {
    code.value = defaultProgram;
    interpreter.cls();
    interpreter.print('示例程序已恢复。');
  });

  execButton.addEventListener('click', executeDirectCommand);
  commandInput.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      executeDirectCommand();
    }
  });
})();
