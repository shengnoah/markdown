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

    async run(source) {
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

    executeAssignment(expr) {
      const index = expr.indexOf('=');
      if (index < 0) throw new Error(`赋值语句缺少 =: ${expr}`);

      const variable = expr.slice(0, index).trim().toUpperCase();
      if (!this.isVariableName(variable)) throw new Error(`变量名无效: ${variable}`);
      const value = this.evalExpression(expr.slice(index + 1).trim());
      this.setVariable(variable, variable.endsWith('$') ? String(value) : Number(value));
    }

    gotoLine(number) {
      const line = Number(number);
      if (!this.lineIndex.has(line)) throw new Error(`找不到行号: ${line}`);
      this.pc = this.lineIndex.get(line);
    }

    evalCondition(expr) {
      const match = expr.match(/^(.+?)\s*(<=|>=|<>|=|<|>)\s*(.+)$/);
      if (!match) return Boolean(this.evalExpression(expr));

      const left = this.evalExpression(match[1].trim());
      const op = match[2];
      const right = this.evalExpression(match[3].trim());

      switch (op) {
        case '=': return left === right;
        case '<>': return left !== right;
        case '<': return left < right;
        case '>': return left > right;
        case '<=': return left <= right;
        case '>=': return left >= right;
        default: return false;
      }
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
      if (/^".*"$/.test(trimmed)) return trimmed.slice(1, -1);
      if (this.isVariableName(trimmed.toUpperCase())) return this.getVariable(trimmed.toUpperCase());
      if (/^-?\d+(?:\.\d+)?$/.test(trimmed)) return Number(trimmed);

      return this.evalArithmetic(trimmed);
    }

    evalArithmetic(expr) {
      const replaced = expr.replace(/"([^"\\]|\\.)*"|[A-Z][A-Z0-9]*\$?/gi, (token) => {
        if (token.startsWith('"')) return token;
        return JSON.stringify(this.getVariable(token.toUpperCase()));
      });

      if (!/^[\d\s+\-*/()."A-Za-z_,$]*$/.test(replaced)) {
        throw new Error(`表达式包含不支持字符: ${expr}`);
      }

      try {
        return Function(`"use strict"; return (${replaced});`)();
      } catch (error) {
        throw new Error(`表达式错误: ${expr}`);
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

      for (let i = 0; i < input.length; i += 1) {
        const char = input[i];
        if (char === '"') inString = !inString;
        delimiterRegex.lastIndex = 0;
        if (!inString && delimiterRegex.test(char)) {
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
