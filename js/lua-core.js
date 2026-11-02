/*!
 * Lua in JavaScript — 在浏览器中运行的 Lua 5.4 风格解释器
 *
 * 纯 JavaScript 实现：词法分析、递归下降语法分析、树遍历求值。
 * 支持闭包、元表、协程、goto、可变参数、模式匹配等 Lua 核心特性。
 *
 * 用法（浏览器）：
 *   const lua = LuaJS.create({ stdout: s => console.log(s) });
 *   lua.execute('print("hello")');
 *
 * 用法（Node）：
 *   const LuaJS = require('./lua-core.js');
 *   require('./lua-stdlib.js');
 *   LuaJS.run('print(1 + 2)');
 *
 * 已知差异见 /lua/ 页面说明：数字统一为 JS 双精度、字符串按 UTF-16 处理。
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.LuaJS = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const LuaJS = {};
  LuaJS.VERSION = 'Lua 5.4';
  LuaJS.IMPL_VERSION = '1.0.0';

  /* =====================================================================
   * 基础类型与工具
   * =================================================================== */

  class LuaError extends Error {
    constructor(value) {
      super(typeof value === 'string' ? value : 'Lua error');
      this.name = 'LuaError';
      this.value = value;
      this.luaTraceback = '';
    }
  }

  class ReturnSignal {
    constructor(values) { this.values = values || []; }
  }
  class BreakSignal {}
  class GotoSignal {
    constructor(name) { this.name = name; }
  }
  class TailCallSignal {
    constructor(fn, args) {
      this.fn = fn;
      this.args = args;
    }
  }

  function errorValue(err) {
    if (err instanceof LuaError) return err.value;
    if (err instanceof RangeError && /stack/i.test(err.message)) return 'stack overflow';
    return err && err.message ? String(err.message) : String(err);
  }

  function errorMessage(err) {
    const value = errorValue(err);
    if (typeof value === 'string') return value;
    return `(error object is a ${typeName(value)} value)`;
  }

  function truthy(value) {
    return value !== null && value !== undefined && value !== false;
  }

  function typeName(value) {
    if (value === null || value === undefined) return 'nil';
    const t = typeof value;
    if (t === 'boolean') return 'boolean';
    if (t === 'number') return 'number';
    if (t === 'string') return 'string';
    if (value instanceof LuaTable) return 'table';
    if (value instanceof LuaFunction || value instanceof LuaNative) return 'function';
    if (value instanceof LuaCoroutine) return 'thread';
    return 'userdata';
  }

  const SIGNALS = { ReturnSignal, BreakSignal, GotoSignal, TailCallSignal };

  function isSignal(err) {
    return err instanceof ReturnSignal || err instanceof BreakSignal ||
      err instanceof GotoSignal || err instanceof TailCallSignal;
  }

  function isDigit(ch) {
    return ch >= '0' && ch <= '9';
  }

  function isHexDigit(ch) {
    return (ch >= '0' && ch <= '9') || (ch >= 'a' && ch <= 'f') || (ch >= 'A' && ch <= 'F');
  }

  function isAlpha(ch) {
    return (ch >= 'a' && ch <= 'z') || (ch >= 'A' && ch <= 'Z') || ch === '_';
  }

  function isAlphaNum(ch) {
    return isAlpha(ch) || isDigit(ch);
  }

  function isSpace(ch) {
    return ch === ' ' || ch === '\t' || ch === '\n' || ch === '\r' || ch === '\v' || ch === '\f';
  }

  /* ---------------- 数字解析 / 格式化 ---------------- */

  function parseHexNumber(text) {
    let s = text.slice(2);
    let exp = 0;
    const p = s.search(/[pP]/);
    if (p >= 0) {
      exp = parseInt(s.slice(p + 1), 10);
      if (Number.isNaN(exp)) exp = 0;
      s = s.slice(0, p);
    }
    let intPart = s;
    let fracPart = '';
    const dot = s.indexOf('.');
    if (dot >= 0) {
      intPart = s.slice(0, dot);
      fracPart = s.slice(dot + 1);
    }
    let value = intPart ? parseInt(intPart, 16) : 0;
    if (fracPart) value += parseInt(fracPart, 16) / Math.pow(16, fracPart.length);
    if (Number.isNaN(value)) return NaN;
    return value * Math.pow(2, exp);
  }

  /** 严格按 Lua 数字语法解析字符串；失败返回 null。 */
  function parseLuaNumber(input) {
    if (typeof input === 'number') return Number.isNaN(input) ? null : input;
    if (typeof input !== 'string') return null;
    let s = input.trim();
    if (!s) return null;
    let sign = 1;
    if (s[0] === '+' || s[0] === '-') {
      if (s[0] === '-') sign = -1;
      s = s.slice(1);
    }
    let value;
    if (/^0[xX]/.test(s)) {
      if (!/^0[xX][0-9a-fA-F]*(?:\.[0-9a-fA-F]*)?(?:[pP][+-]?\d+)?$/.test(s)) return null;
      if (!/[0-9a-fA-F]/.test(s)) return null;
      value = parseHexNumber(s);
    } else if (/^(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?$/.test(s)) {
      value = Number(s);
    } else {
      return null;
    }
    if (Number.isNaN(value)) return null;
    return sign * value;
  }

  function parseIntegerBase(input, base) {
    if (typeof input !== 'string') return null;
    let s = input.trim().toLowerCase();
    if (!s) return null;
    let sign = 1;
    if (s[0] === '+' || s[0] === '-') {
      if (s[0] === '-') sign = -1;
      s = s.slice(1);
    }
    if (!s) return null;
    for (let i = 0; i < s.length; i++) {
      const digit = parseInt(s[i], 36);
      if (Number.isNaN(digit) || digit >= base) return null;
    }
    return sign * parseInt(s, base === 10 ? 10 : base);
  }

  function formatNumber(n) {
    if (typeof n !== 'number') return String(n);
    if (Number.isNaN(n)) return 'nan';
    if (n === Infinity) return 'inf';
    if (n === -Infinity) return '-inf';
    if (Object.is(n, -0)) n = 0;
    if (Number.isInteger(n)) return String(n);
    let s = n.toPrecision(14);
    if (s.indexOf('e') >= 0) {
      let parts = s.split('e');
      let mantissa = parts[0].replace(/\.?0+$/, '');
      let exp = parts[1];
      const sign = exp[0] === '-' ? '-' : '+';
      const digits = exp.replace(/^[+-]/, '').padStart(2, '0');
      return mantissa + 'e' + sign + digits;
    }
    s = s.replace(/(\.\d*?)0+$/, '$1').replace(/\.$/, '');
    return s;
  }

  function toNumberValue(value) {
    if (typeof value === 'number') return Number.isNaN(value) ? null : value;
    if (typeof value === 'string') return parseLuaNumber(value);
    return null;
  }

  /** 转为 Lua 64 位整数（用 BigInt 模拟）；无法表示时返回 null。 */
  function toLuaInteger(value) {
    let n = null;
    if (typeof value === 'number') n = value;
    else if (typeof value === 'string') n = parseLuaNumber(value);
    if (n === null || !Number.isFinite(n)) return null;
    const truncated = Math.trunc(n);
    if (truncated !== n) return null;
    try {
      return BigInt(truncated);
    } catch (e) {
      return null;
    }
  }

  function toLuaIntegerStrict(value) {
    if (typeof value !== 'number' || !Number.isFinite(value)) return null;
    const truncated = Math.trunc(value);
    if (truncated !== value) return null;
    try {
      return BigInt(truncated);
    } catch (e) {
      return null;
    }
  }

  function bigintToNumber(bi) {
    return Number(BigInt.asIntN(64, bi));
  }

  /* ---------------- 对象 ID / 地址 ---------------- */

  let objectSeq = 0;
  function objectId(value) {
    if (!value.__luaId) {
      objectSeq += 1;
      try {
        Object.defineProperty(value, '__luaId', { value: objectSeq, enumerable: false });
      } catch (e) {
        return objectSeq;
      }
    }
    return value.__luaId;
  }

  function objectAddress(value) {
    const id = objectId(value);
    return '0x' + (0x100000000 + id).toString(16).slice(1);
  }

  /* =====================================================================
   * 表
   * =================================================================== */

  class LuaTable {
    constructor() {
      this.map = new Map();
      this.metatable = null;
      this._border = 0;
      // next() 需要记住已经删除的键，才能支持在遍历中删除当前字段
      this._order = [];
      this._orderIndex = new Map();
    }

    rawGet(key) {
      if (key === null || key === undefined) return null;
      if (typeof key === 'number' && Number.isNaN(key)) return null;
      if (typeof key === 'number' && key === 0) key = 0;
      return this.map.has(key) ? this.map.get(key) : null;
    }

    rawSet(key, value) {
      if (key === null || key === undefined) throw new LuaError('table index is nil');
      if (typeof key === 'number' && Number.isNaN(key)) throw new LuaError('table index is NaN');
      if (typeof key === 'number' && key === 0) key = 0;
      if (value === null || value === undefined) {
        if (!this.map.has(key)) return;
        this.map.delete(key);
        if (typeof key === 'number' && Number.isInteger(key) && key >= 1 && key <= this._border) {
          let border = key - 1;
          while (border > 0 && !this.map.has(border)) border -= 1;
          this._border = border;
        }
        return;
      }
      const isNew = !this.map.has(key);
      this.map.set(key, value);
      if (isNew) {
        if (this._order.length > this.map.size * 2 + 64) {
          // 删除较多的表：压缩遍历顺序数组，避免无限增长
          this._order = [];
          this._orderIndex = new Map();
          for (const existing of this.map.keys()) {
            this._orderIndex.set(existing, this._order.length);
            this._order.push(existing);
          }
        }
        this._orderIndex.set(key, this._order.length);
        this._order.push(key);
      }
      if (isNew && typeof key === 'number' && Number.isInteger(key) && key === this._border + 1) {
        this._border = key;
        while (this.map.has(this._border + 1)) this._border += 1;
      }
    }

    rawLen() {
      return this._border;
    }

    keys() {
      return Array.from(this.map.keys());
    }

    next(key) {
      if (key === null || key === undefined) {
        for (let i = 0; i < this._order.length; i++) {
          const k = this._order[i];
          if (this.map.has(k)) return [k, this.map.get(k)];
        }
        return null;
      }
      if (typeof key === 'number' && Number.isNaN(key)) throw new LuaError('table index is NaN');
      const index = this._orderIndex.get(key);
      if (index === undefined) throw new LuaError("invalid key to 'next'");
      for (let i = index + 1; i < this._order.length; i++) {
        const k = this._order[i];
        if (this.map.has(k)) return [k, this.map.get(k)];
      }
      return null;
    }
  }

  /* =====================================================================
   * 函数 / 协程 / 词法作用域
   * =================================================================== */

  class LuaFunction {
    constructor(params, isVararg, body, env, options) {
      this.params = params;
      this.isVararg = isVararg;
      this.body = body;
      this.env = env;
      this.chunkName = (options && options.chunkName) || 'main.lua';
      this.lineDefined = (options && options.lineDefined) || 0;
      this.name = (options && options.name) || '<anonymous>';
    }
  }

  class LuaNative {
    constructor(name, fn, isGenerator) {
      this.name = name || 'native';
      this.fn = fn;
      this.isGenerator = !!isGenerator;
    }
  }

  class LuaCoroutine {
    constructor(fn) {
      this.fn = fn;
      this.generator = null;
      this.state = 'suspended';
      this.frames = [];
      this.started = false;
      this.error = null;
    }
  }

  class Env {
    constructor(parent) {
      this.parent = parent || null;
      this.vars = new Map();
      this.consts = new Set();
      this.varargs = null;
      this.hasVarargs = false;
    }

    declare(name, value, isConst) {
      this.vars.set(name, value === undefined ? null : value);
      if (isConst) this.consts.add(name);
      else this.consts.delete(name);
    }

    find(name) {
      let env = this;
      while (env) {
        if (env.vars.has(name)) return env;
        env = env.parent;
      }
      return null;
    }

    findVarargs() {
      let env = this;
      while (env) {
        if (env.hasVarargs) return env;
        env = env.parent;
      }
      return null;
    }
  }

  /* =====================================================================
   * 词法分析
   * =================================================================== */

  const KEYWORDS = new Set([
    'and', 'break', 'do', 'else', 'elseif', 'end', 'false', 'for', 'function',
    'goto', 'if', 'in', 'local', 'nil', 'not', 'or', 'repeat', 'return',
    'then', 'true', 'until', 'while',
  ]);

  const OPERATORS = [
    '...', '..', '==', '~=', '<=', '>=', '//', '<<', '>>', '::',
    '+', '-', '*', '/', '%', '^', '#', '&', '~', '|', '<', '>', '=',
    '(', ')', '{', '}', '[', ']', ';', ':', ',', '.',
  ];

  class Lexer {
    constructor(source, chunkName) {
      this.source = String(source == null ? '' : source).replace(/\r\n?/g, '\n');
      this.chunkName = chunkName || 'main.lua';
      this.pos = 0;
      this.line = 1;
    }

    error(message) {
      throw new LuaError(`${this.chunkName}:${this.line}: ${message}`);
    }

    longBracketLevel(pos) {
      const src = this.source;
      if (src[pos] !== '[') return -1;
      let i = pos + 1;
      while (src[i] === '=') i += 1;
      return src[i] === '[' ? i - pos - 1 : -1;
    }

    readLongString(level) {
      const src = this.source;
      const startLine = this.line;
      const close = ']' + '='.repeat(level) + ']';
      this.pos += level + 2;
      if (src[this.pos] === '\n') {
        this.pos += 1;
        this.line += 1;
      }
      const end = src.indexOf(close, this.pos);
      if (end < 0) {
        this.line = startLine;
        this.error('unfinished long string (starting at line ' + startLine + ')');
      }
      const value = src.slice(this.pos, end);
      const newlines = value.split('\n').length - 1;
      this.line += newlines;
      this.pos = end + close.length;
      return value;
    }

    skipComment() {
      const src = this.source;
      this.pos += 2;
      const level = this.longBracketLevel(this.pos);
      if (level >= 0) {
        const startLine = this.line;
        const close = ']' + '='.repeat(level) + ']';
        this.pos += level + 2;
        if (src[this.pos] === '\n') {
          this.pos += 1;
          this.line += 1;
        }
        const end = src.indexOf(close, this.pos);
        if (end < 0) {
          this.line = startLine;
          this.error('unfinished long comment (starting at line ' + startLine + ')');
        }
        const text = src.slice(this.pos, end);
        this.line += text.split('\n').length - 1;
        this.pos = end + close.length;
        return;
      }
      while (this.pos < src.length && src[this.pos] !== '\n') this.pos += 1;
    }

    readString(quote) {
      const src = this.source;
      const startLine = this.line;
      this.pos += 1;
      let out = '';
      while (this.pos < src.length) {
        let ch = src[this.pos];
        this.pos += 1;
        if (ch === quote) return { type: 'string', value: out, line: startLine };
        if (ch === '\n') {
          this.line = startLine;
          this.error('unfinished string');
        }
        if (ch !== '\\') { out += ch; continue; }

        if (this.pos >= src.length) {
          this.line = startLine;
          this.error('unfinished string');
        }
        ch = src[this.pos];
        this.pos += 1;
        switch (ch) {
          case 'a': out += '\x07'; break;
          case 'b': out += '\b'; break;
          case 'f': out += '\f'; break;
          case 'n': out += '\n'; break;
          case 'r': out += '\r'; break;
          case 't': out += '\t'; break;
          case 'v': out += '\v'; break;
          case '\\': out += '\\'; break;
          case '"': out += '"'; break;
          case "'": out += "'"; break;
          case '\n': out += '\n'; this.line += 1; break;
          case 'z': {
            while (this.pos < src.length && isSpace(src[this.pos])) {
              if (src[this.pos] === '\n') this.line += 1;
              this.pos += 1;
            }
            break;
          }
          case 'x': {
            const hex = src.slice(this.pos, this.pos + 2);
            if (!/^[0-9a-fA-F]{2}$/.test(hex)) this.error('hexadecimal digit expected');
            out += String.fromCharCode(parseInt(hex, 16));
            this.pos += 2;
            break;
          }
          case 'u': {
            if (src[this.pos] !== '{') this.error("missing '{' in \\u{xxxx}");
            this.pos += 1;
            let hex = '';
            while (this.pos < src.length && src[this.pos] !== '}') {
              hex += src[this.pos];
              this.pos += 1;
            }
            if (src[this.pos] !== '}') this.error("missing '}' in \\u{xxxx}");
            this.pos += 1;
            if (!/^[0-9a-fA-F]+$/.test(hex)) this.error('hexadecimal digit expected');
            const code = parseInt(hex, 16);
            if (code > 0x10FFFF) this.error('UTF-8 value too large');
            out += String.fromCodePoint(code);
            break;
          }
          default: {
            if (isDigit(ch)) {
              let digits = ch;
              for (let i = 0; i < 2 && isDigit(src[this.pos]); i++) {
                digits += src[this.pos];
                this.pos += 1;
              }
              const code = parseInt(digits, 10);
              if (code > 255) this.error('decimal escape too large');
              out += String.fromCharCode(code);
            } else {
              this.error('invalid escape sequence');
            }
          }
        }
      }
      this.line = startLine;
      this.error('unfinished string');
    }

    readNumber() {
      const src = this.source;
      const start = this.pos;
      const startLine = this.line;
      let isHex = false;
      if (src[this.pos] === '0' && (src[this.pos + 1] === 'x' || src[this.pos + 1] === 'X')) {
        isHex = true;
        this.pos += 2;
        while (isHexDigit(src[this.pos])) this.pos += 1;
        if (src[this.pos] === '.') {
          this.pos += 1;
          while (isHexDigit(src[this.pos])) this.pos += 1;
        }
        if (src[this.pos] === 'p' || src[this.pos] === 'P') {
          this.pos += 1;
          if (src[this.pos] === '+' || src[this.pos] === '-') this.pos += 1;
          while (isDigit(src[this.pos])) this.pos += 1;
        }
      } else {
        while (isDigit(src[this.pos])) this.pos += 1;
        if (src[this.pos] === '.' && src[this.pos + 1] === '.') {
          // 与 Lua 一致：1..2 是 malformed number，拼接需要写成 1 .. 2
          this.error('malformed number near \'' + src.slice(start, this.pos + 2) + '\'');
        }
        if (src[this.pos] === '.') {
          this.pos += 1;
          while (isDigit(src[this.pos])) this.pos += 1;
        }
        if (src[this.pos] === 'e' || src[this.pos] === 'E') {
          this.pos += 1;
          if (src[this.pos] === '+' || src[this.pos] === '-') this.pos += 1;
          while (isDigit(src[this.pos])) this.pos += 1;
        }
      }
      let text = src.slice(start, this.pos);
      let value;
      if (isHex) {
        if (!/^0[xX](?:[0-9a-fA-F]+(?:\.[0-9a-fA-F]*)?|\.[0-9a-fA-F]+)(?:[pP][+-]?\d+)?$/.test(text)) {
          this.error("malformed number near '" + text + "'");
        }
        value = parseHexNumber(text);
      } else {
        if (!/^(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?$/.test(text)) {
          this.error("malformed number near '" + text + "'");
        }
        value = Number(text);
      }
      if (Number.isNaN(value)) this.error('malformed number');
      // 与 Lua 一致：1.5.5 之类的写法是 malformed number，而不是两个数字
      if (src[this.pos] === '.' && isDigit(src[this.pos + 1])) {
        let end = this.pos + 2;
        while (isDigit(src[end])) end += 1;
        text = src.slice(start, end);
        this.pos = end;
        this.error("malformed number near '" + text + "'");
      }
      return { type: 'number', value, line: startLine };
    }

    nextToken() {
      const src = this.source;
      if (this.pos === 0 && src[0] === '#') {
        // 与 Lua 一致：忽略脚本第一行的 shebang
        while (this.pos < src.length && src[this.pos] !== '\n') this.pos += 1;
      }
      while (this.pos < src.length) {
        const ch = src[this.pos];
        if (ch === '\n') { this.line += 1; this.pos += 1; continue; }
        if (isSpace(ch) || ch === '\uFEFF') { this.pos += 1; continue; }
        if (ch === '-' && src[this.pos + 1] === '-') { this.skipComment(); continue; }
        break;
      }

      const line = this.line;
      if (this.pos >= src.length) return { type: 'eof', value: '<eof>', line };

      const ch = src[this.pos];

      if (isAlpha(ch)) {
        const start = this.pos;
        this.pos += 1;
        while (this.pos < src.length && isAlphaNum(src[this.pos])) this.pos += 1;
        const word = src.slice(start, this.pos);
        if (KEYWORDS.has(word)) return { type: 'keyword', value: word, line };
        return { type: 'name', value: word, line };
      }

      if (isDigit(ch) || (ch === '.' && isDigit(src[this.pos + 1]))) {
        return this.readNumber();
      }

      if (ch === '"' || ch === "'") return this.readString(ch);

      if (ch === '[') {
        const level = this.longBracketLevel(this.pos);
        if (level >= 0) {
          const value = this.readLongString(level);
          return { type: 'string', value, line };
        }
      }

      for (const op of OPERATORS) {
        if (src.startsWith(op, this.pos)) {
          this.pos += op.length;
          return { type: 'op', value: op, line };
        }
      }

      this.error(`unexpected symbol near '${ch}'`);
    }
  }

  /* =====================================================================
   * 语法分析
   * =================================================================== */

  const BINARY_PRIORITY = {
    'or': [1, 1],
    'and': [2, 2],
    '<': [3, 3], '>': [3, 3], '<=': [3, 3], '>=': [3, 3], '~=': [3, 3], '==': [3, 3],
    '|': [4, 4],
    '~': [5, 5],
    '&': [6, 6],
    '<<': [7, 7], '>>': [7, 7],
    '..': [9, 8],
    '+': [10, 10], '-': [10, 10],
    '*': [11, 11], '/': [11, 11], '//': [11, 11], '%': [11, 11],
    '^': [14, 13],
  };

  const UNARY_OPS = new Set(['-', '#', '~', 'not']);

  class Parser {
    constructor(source, chunkName) {
      this.lex = new Lexer(source, chunkName || 'main.lua');
      this.chunkName = chunkName || 'main.lua';
      this.tok = this.lex.nextToken();
      this.ahead = null;
      this.varargStack = [true]; // 主 chunk 是可变参数函数
      this.loopDepth = 0;
    }

    error(message, line) {
      const l = line || this.tok.line;
      throw new LuaError(`${this.chunkName}:${l}: ${message}`);
    }

    next() {
      if (this.ahead) {
        this.tok = this.ahead;
        this.ahead = null;
      } else {
        this.tok = this.lex.nextToken();
      }
      return this.tok;
    }

    peek() {
      if (!this.ahead) this.ahead = this.lex.nextToken();
      return this.ahead;
    }

    check(value) {
      return this.tok.value === value;
    }

    accept(value) {
      if (this.check(value)) {
        this.next();
        return true;
      }
      return false;
    }

    expect(value) {
      if (!this.check(value)) {
        this.error(`'${value}' expected near '${this.tok.value}'`);
      }
      return this.next();
    }

    expectName() {
      if (this.tok.type !== 'name') {
        this.error(`name expected near '${this.tok.value}'`);
      }
      const name = this.tok.value;
      this.next();
      return name;
    }

    isBlockEnd() {
      return this.tok.type === 'eof' ||
        this.check('end') || this.check('else') || this.check('elseif') || this.check('until');
    }

    parse() {
      const block = this.parseBlock();
      if (this.tok.type !== 'eof') this.error(`'<eof>' expected near '${this.tok.value}'`);
      return block;
    }

    parseBlock() {
      const line = this.tok.line;
      const body = [];
      const labels = new Set();
      while (!this.isBlockEnd()) {
        if (this.check('return')) {
          body.push(this.parseReturn());
          break;
        }
        const stat = this.parseStatement();
        if (stat) {
          if (stat.type === 'Label') {
            if (labels.has(stat.name)) this.error(`label '${stat.name}' already defined`, stat.line);
            labels.add(stat.name);
          }
          body.push(stat);
        }
        if (this.check('return')) {
          body.push(this.parseReturn());
          break;
        }
      }
      return { type: 'Block', body, line };
    }

    parseReturn() {
      const line = this.tok.line;
      this.next();
      let exprs = [];
      if (!this.isBlockEnd() && !this.check(';')) exprs = this.parseExprList();
      this.accept(';');
      return { type: 'Return', exprs, line };
    }

    parseStatement() {
      const line = this.tok.line;
      if (this.accept(';')) return { type: 'Empty', line };

      if (this.check('::')) {
        this.next();
        const name = this.expectName();
        this.expect('::');
        return { type: 'Label', name, line };
      }

      if (this.check('break')) {
        if (this.loopDepth === 0) this.error("'break' outside a loop", line);
        this.next();
        return { type: 'Break', line };
      }

      if (this.check('goto')) {
        this.next();
        const name = this.expectName();
        return { type: 'Goto', name, line };
      }

      if (this.check('do')) {
        this.next();
        const body = this.parseBlock();
        this.expect('end');
        return { type: 'Do', body, line };
      }

      if (this.check('while')) {
        this.next();
        const cond = this.parseExpr(0);
        this.expect('do');
        this.loopDepth += 1;
        const body = this.parseBlock();
        this.loopDepth -= 1;
        this.expect('end');
        return { type: 'While', cond, body, line };
      }

      if (this.check('repeat')) {
        this.next();
        this.loopDepth += 1;
        const body = this.parseBlock();
        this.loopDepth -= 1;
        this.expect('until');
        const cond = this.parseExpr(0);
        return { type: 'Repeat', body, cond, line };
      }

      if (this.check('if')) {
        this.next();
        const clauses = [];
        const cond = this.parseExpr(0);
        this.expect('then');
        clauses.push({ cond, body: this.parseBlock() });
        while (this.check('elseif')) {
          this.next();
          const c = this.parseExpr(0);
          this.expect('then');
          clauses.push({ cond: c, body: this.parseBlock() });
        }
        let elseBody = null;
        if (this.check('else')) {
          this.next();
          elseBody = this.parseBlock();
        }
        this.expect('end');
        return { type: 'If', clauses, elseBody, line };
      }

      if (this.check('for')) {
        this.next();
        const name = this.expectName();
        if (this.accept('=')) {
          const start = this.parseExpr(0);
          this.expect(',');
          const limit = this.parseExpr(0);
          let step = null;
          if (this.accept(',')) step = this.parseExpr(0);
          this.expect('do');
          this.loopDepth += 1;
          const body = this.parseBlock();
          this.loopDepth -= 1;
          this.expect('end');
          return { type: 'NumericFor', name, start, limit, step, body, line };
        }
        const names = [name];
        while (this.accept(',')) names.push(this.expectName());
        this.expect('in');
        const exprs = this.parseExprList();
        this.expect('do');
        this.loopDepth += 1;
        const body = this.parseBlock();
        this.loopDepth -= 1;
        this.expect('end');
        return { type: 'GenericFor', names, exprs, body, line };
      }

      if (this.check('function')) {
        this.next();
        const target = this.parseFuncName();
        const func = this.parseFuncBody(line, target.isMethod);
        return { type: 'FunctionDecl', target: target.expr, func, line };
      }

      if (this.check('local')) {
        this.next();
        if (this.check('function')) {
          this.next();
          const name = this.expectName();
          const func = this.parseFuncBody(line, false);
          return { type: 'LocalFunction', name, func, line };
        }
        const names = [];
        do {
          const name = this.expectName();
          let attrib = null;
          if (this.check('<')) {
            this.next();
            attrib = this.expectName();
            this.expect('>');
            if (attrib !== 'const') {
              this.error(attrib === 'close'
                ? "local attribute '<close>' is not supported"
                : `unknown attribute '${attrib}'`);
            }
          }
          names.push({ name, attrib });
        } while (this.accept(','));
        let exprs = null;
        if (this.accept('=')) exprs = this.parseExprList();
        return { type: 'Local', names, exprs, line };
      }

      const expr = this.parsePrefixExpr();
      if (this.check('=') || this.check(',')) {
        const targets = [expr];
        while (this.accept(',')) targets.push(this.parsePrefixExpr());
        this.expect('=');
        const exprs = this.parseExprList();
        for (const target of targets) {
          if (target.type !== 'Name' && target.type !== 'Index') {
            this.error('syntax error: assignment target expected', line);
          }
        }
        return { type: 'Assign', targets, exprs, line };
      }
      if (expr.type !== 'Call' && expr.type !== 'Method') {
        this.error('syntax error near unexpected token', line);
      }
      return { type: 'CallStat', expr, line };
    }

    parseFuncName() {
      const line = this.tok.line;
      const name = this.expectName();
      let expr = { type: 'Name', name, line };
      while (this.check('.')) {
        this.next();
        const key = this.expectName();
        expr = { type: 'Index', object: expr, key: { type: 'String', value: key, line }, line };
      }
      let isMethod = false;
      if (this.check(':')) {
        this.next();
        const key = this.expectName();
        isMethod = true;
        expr = { type: 'Index', object: expr, key: { type: 'String', value: key, line }, line };
      }
      return { expr, isMethod };
    }

    parseFuncBody(line, implicitSelf) {
      this.expect('(');
      const params = [];
      let isVararg = false;
      if (!this.check(')')) {
        if (this.check('...')) {
          this.next();
          isVararg = true;
        } else {
          params.push(this.expectName());
          while (this.accept(',')) {
            if (this.check('...')) {
              this.next();
              isVararg = true;
              break;
            }
            params.push(this.expectName());
          }
        }
      }
      this.expect(')');
      if (implicitSelf) params.unshift('self');
      this.varargStack.push(isVararg);
      const outerLoopDepth = this.loopDepth;
      this.loopDepth = 0;
      const body = this.parseBlock();
      this.loopDepth = outerLoopDepth;
      this.expect('end');
      this.varargStack.pop();
      return { type: 'Function', params, isVararg, body, line };
    }

    parseExprList() {
      const list = [this.parseExpr(0)];
      while (this.accept(',')) list.push(this.parseExpr(0));
      return list;
    }

    parseExpr(limit) {
      let left;
      const line = this.tok.line;
      if (this.tok.type === 'op' && UNARY_OPS.has(this.tok.value) || this.check('not')) {
        const op = this.tok.value;
        this.next();
        const operand = this.parseExpr(12);
        left = { type: 'UnOp', op, operand, line };
      } else {
        left = this.parseSimpleExpr();
      }
      while (true) {
        const op = this.tok.value;
        const pri = BINARY_PRIORITY[op];
        if (!pri || pri[0] <= limit) break;
        const opLine = this.tok.line;
        this.next();
        const right = this.parseExpr(pri[1]);
        left = { type: 'BinOp', op, left, right, line: opLine };
      }
      return left;
    }

    parseSimpleExpr() {
      const line = this.tok.line;
      const tok = this.tok;
      if (tok.type === 'number') {
        this.next();
        return { type: 'Number', value: tok.value, line };
      }
      if (tok.type === 'string') {
        this.next();
        return { type: 'String', value: tok.value, line };
      }
      if (this.check('nil')) { this.next(); return { type: 'Nil', line }; }
      if (this.check('true')) { this.next(); return { type: 'True', line }; }
      if (this.check('false')) { this.next(); return { type: 'False', line }; }
      if (this.check('...')) {
        if (!this.varargStack[this.varargStack.length - 1]) {
          this.error("cannot use '...' outside a vararg function");
        }
        this.next();
        return { type: 'Vararg', line };
      }
      if (this.check('{')) return this.parseTable();
      if (this.check('function')) {
        this.next();
        return this.parseFuncBody(line, false);
      }
      return this.parsePrefixExpr();
    }

    parseTable() {
      const line = this.tok.line;
      this.expect('{');
      const fields = [];
      while (!this.check('}')) {
        if (this.check('[')) {
          this.next();
          const key = this.parseExpr(0);
          this.expect(']');
          this.expect('=');
          const value = this.parseExpr(0);
          fields.push({ kind: 'keyed', key, value });
        } else if (this.tok.type === 'name' && this.peek().value === '=') {
          const name = this.tok.value;
          this.next();
          this.next();
          const value = this.parseExpr(0);
          fields.push({ kind: 'named', name, value });
        } else {
          fields.push({ kind: 'expr', value: this.parseExpr(0) });
        }
        if (!this.accept(',') && !this.accept(';')) break;
      }
      this.expect('}');
      return { type: 'Table', fields, line };
    }

    parsePrefixExpr() {
      const line = this.tok.line;
      let expr;
      if (this.check('(')) {
        this.next();
        const inner = this.parseExpr(0);
        this.expect(')');
        expr = { type: 'Paren', expr: inner, line };
      } else {
        const name = this.expectName();
        expr = { type: 'Name', name, line };
      }
      while (true) {
        if (this.check('.')) {
          this.next();
          const key = this.expectName();
          expr = { type: 'Index', object: expr, key: { type: 'String', value: key, line }, line };
        } else if (this.check('[')) {
          this.next();
          const key = this.parseExpr(0);
          this.expect(']');
          expr = { type: 'Index', object: expr, key, line };
        } else if (this.check(':')) {
          this.next();
          const name = this.expectName();
          const args = this.parseArgs();
          expr = { type: 'Method', object: expr, name, args, line };
        } else if (this.check('(') || this.check('{') || this.tok.type === 'string') {
          const args = this.parseArgs();
          expr = { type: 'Call', callee: expr, args, line };
        } else {
          break;
        }
      }
      return expr;
    }

    parseArgs() {
      const line = this.tok.line;
      if (this.check('(')) {
        this.next();
        const args = this.check(')') ? [] : this.parseExprList();
        this.expect(')');
        return args;
      }
      if (this.check('{')) return [this.parseTable()];
      if (this.tok.type === 'string') {
        const value = this.tok.value;
        this.next();
        return [{ type: 'String', value, line }];
      }
      this.error('function arguments expected');
    }
  }

  /* =====================================================================
   * 解释器
   * =================================================================== */

  const ARITH_METAMETHODS = {
    '+': '__add', '-': '__sub', '*': '__mul', '/': '__div', '//': '__idiv',
    '%': '__mod', '^': '__pow', '&': '__band', '|': '__bor', '~': '__bxor',
    '<<': '__shl', '>>': '__shr',
  };

  function rawEquals(a, b) {
    if (a === null || a === undefined) return b === null || b === undefined;
    if (typeof a === 'number' && typeof b === 'number') {
      return !Number.isNaN(a) && !Number.isNaN(b) && a === b;
    }
    return a === b;
  }

  class Interpreter {
    constructor(options) {
      options = options || {};
      this.options = options;
      this.stdout = typeof options.stdout === 'function' ? options.stdout : function () {};
      this.stdin = options.stdin == null ? '' : String(options.stdin);
      this.stdinPos = 0;
      this.maxSteps = options.maxSteps || 1500000;
      this.timeLimit = options.timeLimit == null ? 5000 : options.timeLimit;
      this.maxDepth = options.maxDepth || 200;
      this.steps = 0;
      this.startTime = 0;
      this.depth = 0;
      this.frames = [];
      this.currentCoroutine = null;
      this.mainThread = new LuaCoroutine(null);
      this.mainThread.state = 'running';
      this.chunkName = 'main.lua';
      this.globals = new LuaTable();
      this.stringMetatable = new LuaTable();
      this.rootEnv = new Env(null);
      this.rootEnv.declare('_ENV', this.globals);
      this.globals.rawSet('_G', this.globals);
      this._randomState = 0x9e3779b9;
      this._clockStart = typeof performance !== 'undefined' ? performance.now() : Date.now();
      if (typeof this.installStdlib === 'function') this.installStdlib();
    }

    /* ---------------- 输出 / 输入 ---------------- */

    write(text) {
      this.stdout(String(text));
    }

    readStdin(count) {
      if (count == null) {
        if (this.stdinPos >= this.stdin.length) return null;
        const end = this.stdin.indexOf('\n', this.stdinPos);
        if (end < 0) {
          const text = this.stdin.slice(this.stdinPos);
          this.stdinPos = this.stdin.length;
          return text;
        }
        let text = this.stdin.slice(this.stdinPos, end);
        this.stdinPos = end + 1;
        if (text.endsWith('\r')) text = text.slice(0, -1);
        return text;
      }
      if (this.stdinPos >= this.stdin.length) return '';
      const text = this.stdin.slice(this.stdinPos, this.stdinPos + count);
      this.stdinPos += text.length;
      return text;
    }

    /* ---------------- 位置 / 错误 ---------------- */

    position(level) {
      const depth = level === undefined ? 1 : level;
      let index = this.frames.length - depth;
      if (index < 0) index = 0;
      const frame = this.frames[index] || this.frames[this.frames.length - 1];
      if (frame) return `${frame.chunkName}:${frame.line}: `;
      return `${this.chunkName}:0: `;
    }

    raise(message, node) {
      const frame = this.frames[this.frames.length - 1];
      const chunk = frame ? frame.chunkName : this.chunkName;
      let line = frame ? frame.line : 0;
      if (node && node.line) line = node.line;
      const error = new LuaError(`${chunk}:${line}: ${message}`);
      error.luaTraceback = this.traceback();
      throw error;
    }

    setLine(stat) {
      const frame = this.frames[this.frames.length - 1];
      if (frame && stat && stat.line) frame.line = stat.line;
    }

    tick() {
      this.steps += 1;
      if (this.steps > this.maxSteps) {
        throw new LuaError(this.position() + '执行步数超过上限（可能是死循环）');
      }
      if ((this.steps & 2047) === 0 && this.timeLimit > 0) {
        const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
        if (now - this.startTime > this.timeLimit) {
          throw new LuaError(this.position() + '执行超时（可能是死循环）');
        }
      }
    }

    traceback(message) {
      let out = '';
      if (message !== undefined && message !== null && message !== '') {
        out += (typeof message === 'string' ? message : this.display(message)) + '\n';
      }
      out += 'stack traceback:';
      for (let i = this.frames.length - 1; i >= 0; i--) {
        const frame = this.frames[i];
        out += `\n\t${frame.chunkName}:${frame.line}: in function '${frame.fn.name || '?'}'`;
      }
      return out;
    }

    attachTraceback(err) {
      if (err instanceof LuaError && !err.luaTraceback) {
        if (this.frames.length) err.luaTraceback = this.traceback();
      }
    }

    /* ---------------- 编译 / 执行 ---------------- */

    compile(source, chunkName, envTable) {
      const name = chunkName || 'main.lua';
      const parser = new Parser(source, name);
      const block = parser.parse();
      // 每个 chunk 都有自己的 _ENV upvalue，赋值 _ENV 不会污染解释器的全局状态
      const fnEnv = new Env(this.rootEnv);
      if (envTable !== undefined && envTable !== null) fnEnv.declare('_ENV', envTable);
      else fnEnv.declare('_ENV', this.globals);
      return new LuaFunction([], true, block, fnEnv, {
        chunkName: name,
        lineDefined: 0,
        name: 'main chunk',
      });
    }

    execute(source, options) {
      options = options || {};
      this.chunkName = options.chunkName || 'main.lua';
      this.steps = 0;
      this.depth = 0;
      this.frames = [];
      this.currentCoroutine = null;
      this.startTime = typeof performance !== 'undefined' ? performance.now() : Date.now();
      const fn = this.compile(source, this.chunkName, options.env);
      const generator = this.call(fn, options.args || []);
      try {
        while (true) {
          const step = generator.next();
          if (step.done) return step.value || [];
          throw new LuaError(this.position() + 'attempt to yield from outside a coroutine');
        }
      } catch (err) {
        this.attachTraceback(err);
        if (err instanceof RangeError && /stack/i.test(err.message)) {
          throw new LuaError(this.position() + 'stack overflow（递归层级过深）');
        }
        throw err;
      }
    }

    /* ---------------- 调用 ---------------- */

    *call(fn, args, node) {
      if (fn instanceof LuaFunction) return yield* this.callLuaFunction(fn, args);
      if (fn instanceof LuaNative) {
        if (fn.isGenerator) return yield* fn.fn.call(this, args || []);
        return fn.fn.call(this, args || []) || [];
      }
      const handler = this.getMetamethod(fn, '__call');
      if (handler !== null) return yield* this.call(handler, [fn].concat(args || []), node);
      this.raise(`attempt to call a ${typeName(fn)} value`, node);
    }

    *callLuaFunction(fn, args) {
      let currentFn = fn;
      let currentArgs = args || [];
      let counted = false;
      try {
        while (true) {
          if (!counted) {
            if (this.depth >= this.maxDepth) this.raise('stack overflow（递归调用层级过深）');
            this.depth += 1;
            counted = true;
          }
          const frame = { fn: currentFn, chunkName: currentFn.chunkName, line: currentFn.lineDefined || 0 };
          this.frames.push(frame);
          const callEnv = new Env(currentFn.env);
          for (let i = 0; i < currentFn.params.length; i++) {
            callEnv.declare(currentFn.params[i], i < currentArgs.length ? currentArgs[i] : null);
          }
          if (currentFn.isVararg) {
            callEnv.hasVarargs = true;
            callEnv.varargs = currentArgs.slice(currentFn.params.length);
          }
          let values = [];
          let tailCall = null;
          try {
            yield* this.execBlockIn(currentFn.body, new Env(callEnv));
          } catch (err) {
            if (err instanceof ReturnSignal) {
              values = err.values;
            } else if (err instanceof TailCallSignal) {
              // 尾调用不增加调用深度，直接复用当前栈帧
              tailCall = err;
            } else if (err instanceof BreakSignal) {
              this.raise('break outside loop');
            } else if (err instanceof GotoSignal) {
              this.raise(`no visible label '${err.name}' for <goto>`);
            } else {
              if (err instanceof LuaError && !err.luaTraceback) err.luaTraceback = this.traceback();
              throw err;
            }
          } finally {
            this.frames.pop();
          }
          if (tailCall) {
            if (tailCall.fn instanceof LuaFunction) {
              currentFn = tailCall.fn;
              currentArgs = tailCall.args;
              continue;
            }
            counted = false;
            this.depth -= 1;
            return yield* this.call(tailCall.fn, tailCall.args);
          }
          return values;
        }
      } finally {
        if (counted) this.depth -= 1;
      }
    }

    /* ---------------- 语句执行 ---------------- */

    *execBlock(block, parentEnv) {
      yield* this.execBlockIn(block, new Env(parentEnv));
    }

    *execBlockIn(block, env) {
      if (!block._labels) {
        const labels = new Map();
        for (let i = 0; i < block.body.length; i++) {
          const stat = block.body[i];
          if (stat.type === 'Label' && !labels.has(stat.name)) labels.set(stat.name, i);
        }
        block._labels = labels;
      }
      const labels = block._labels;
      let pc = 0;
      while (pc < block.body.length) {
        const stat = block.body[pc];
        this.tick();
        this.setLine(stat);
        try {
          const nextEnv = yield* this.execStat(stat, env);
          if (nextEnv instanceof Env) env = nextEnv;
          pc += 1;
        } catch (err) {
          if (err instanceof GotoSignal) {
            const target = labels.get(err.name);
            if (target !== undefined) {
              pc = target;
              continue;
            }
          }
          if (err instanceof LuaError && !err.luaTraceback) {
            err.luaTraceback = this.traceback();
          }
          throw err;
        }
      }
    }

    *execStat(node, env) {
      switch (node.type) {
        case 'Local': {
          let values = [];
          if (node.exprs) values = yield* this.evalExprList(node.exprs, env);
          let target = env;
          for (let i = 0; i < node.names.length; i++) {
            const item = node.names[i];
            if (target.vars.has(item.name)) target = new Env(target);
            target.declare(item.name, values[i] === undefined ? null : values[i], item.attrib === 'const');
          }
          return target === env ? undefined : target;
        }

        case 'LocalFunction': {
          let target = env;
          if (target.vars.has(node.name)) target = new Env(target);
          target.declare(node.name, null);
          const fn = this.makeFunction(node.func, target);
          fn.name = node.name;
          target.vars.set(node.name, fn);
          return target === env ? undefined : target;
        }

        case 'FunctionDecl': {
          const ref = yield* this.evalRef(node.target, env);
          const fn = this.makeFunction(node.func, env);
          fn.name = ref.kind === 'name' ? ref.name : (node.target.key && node.target.key.value) || '?';
          yield* this.assignRef(ref, fn, node);
          return;
        }

        case 'Assign': {
          const refs = [];
          for (const target of node.targets) refs.push(yield* this.evalRef(target, env));
          const values = yield* this.evalExprList(node.exprs, env);
          for (let i = 0; i < refs.length; i++) {
            yield* this.assignRef(refs[i], values[i] === undefined ? null : values[i], node);
          }
          return;
        }

        case 'CallStat':
          yield* this.evalCall(node.expr, env);
          return;

        case 'Do':
          yield* this.execBlock(node.body, env);
          return;

        case 'While': {
          while (truthy(yield* this.evalExpr(node.cond, env))) {
            this.tick();
            try {
              yield* this.execBlock(node.body, env);
            } catch (err) {
              if (err instanceof BreakSignal) return;
              throw err;
            }
          }
          return;
        }

        case 'Repeat': {
          while (true) {
            this.tick();
            let bodyEnv = new Env(env);
            let broke = false;
            try {
              const finalEnv = yield* this.execBlockIn(node.body, bodyEnv);
              if (finalEnv instanceof Env) bodyEnv = finalEnv;
            } catch (err) {
              if (err instanceof BreakSignal) broke = true;
              else throw err;
            }
            if (broke) return;
            if (truthy(yield* this.evalExpr(node.cond, bodyEnv))) return;
          }
        }

        case 'If': {
          for (const clause of node.clauses) {
            if (truthy(yield* this.evalExpr(clause.cond, env))) {
              yield* this.execBlock(clause.body, env);
              return;
            }
          }
          if (node.elseBody) yield* this.execBlock(node.elseBody, env);
          return;
        }

        case 'NumericFor': {
          const start = this.checkNumber(yield* this.evalExpr(node.start, env), "'for' initial value");
          const limit = this.checkNumber(yield* this.evalExpr(node.limit, env), "'for' limit");
          const step = node.step
            ? this.checkNumber(yield* this.evalExpr(node.step, env), "'for' step")
            : 1;
          if (step === 0) this.raise("'for' step is zero");
          for (let i = start; step > 0 ? i <= limit : i >= limit; i += step) {
            this.tick();
            const loopEnv = new Env(env);
            loopEnv.declare(node.name, i);
            try {
              yield* this.execBlockIn(node.body, loopEnv);
            } catch (err) {
              if (err instanceof BreakSignal) return;
              throw err;
            }
          }
          return;
        }

        case 'GenericFor': {
          const values = yield* this.evalExprList(node.exprs, env);
          const iterator = values[0] === undefined ? null : values[0];
          const state = values[1] === undefined ? null : values[1];
          let control = values[2] === undefined ? null : values[2];
          while (true) {
            this.tick();
            const results = yield* this.call(iterator, [state, control], node);
            const first = results.length ? results[0] : null;
            if (first === null) return;
            control = first;
            const loopEnv = new Env(env);
            for (let i = 0; i < node.names.length; i++) {
              loopEnv.declare(node.names[i], results[i] === undefined ? null : results[i]);
            }
            try {
              yield* this.execBlockIn(node.body, loopEnv);
            } catch (err) {
              if (err instanceof BreakSignal) return;
              throw err;
            }
          }
        }

        case 'Return': {
          if (node.exprs && node.exprs.length === 1) {
            const only = node.exprs[0];
            if (only.type === 'Call' || only.type === 'Method') {
              const parts = yield* this.evalCallParts(only, env);
              throw new TailCallSignal(parts.fn, parts.args);
            }
          }
          throw new ReturnSignal(yield* this.evalExprList(node.exprs, env));
        }

        case 'Break':
          throw new BreakSignal();

        case 'Goto':
          throw new GotoSignal(node.name);

        case 'Label':
        case 'Empty':
          return;

        default:
          this.raise('unknown statement: ' + node.type, node);
      }
    }

    checkNumber(value, what) {
      const number = toNumberValue(value);
      if (number === null) {
        this.raise(`${what || 'value'} must be a number`);
      }
      return number;
    }

    /* ---------------- 左值 ---------------- */

    *evalRef(target, env) {
      if (target.type === 'Name') {
        return { kind: 'name', name: target.name, env };
      }
      const object = yield* this.evalExpr(target.object, env);
      const key = yield* this.evalExpr(target.key, env);
      return { kind: 'index', object, key, node: target };
    }

    *assignRef(ref, value, node) {
      if (ref.kind === 'name') {
        yield* this.setName(ref.env, ref.name, value, node || ref);
      } else {
        yield* this.setIndex(ref.object, ref.key, value, node || ref.node);
      }
    }

    /* ---------------- 表达式求值 ---------------- */

    makeFunction(node, env) {
      const fn = new LuaFunction(node.params, node.isVararg, node.body, env, {
        chunkName: this.frames.length ? this.frames[this.frames.length - 1].chunkName : this.chunkName,
        lineDefined: node.line,
      });
      return fn;
    }

    isMultiExpr(node) {
      return node.type === 'Call' || node.type === 'Method' || node.type === 'Vararg';
    }

    *evalExprList(exprs, env) {
      if (!exprs || !exprs.length) return [];
      const values = [];
      for (let i = 0; i < exprs.length; i++) {
        if (i === exprs.length - 1) {
          const multi = yield* this.evalMulti(exprs[i], env);
          for (const value of multi) values.push(value);
        } else {
          values.push(yield* this.evalExpr(exprs[i], env));
        }
      }
      return values;
    }

    *evalMulti(node, env) {
      if (node.type === 'Call' || node.type === 'Method') {
        return yield* this.evalCall(node, env);
      }
      if (node.type === 'Vararg') {
        const holder = env.findVarargs();
        if (!holder) this.raise("cannot use '...' outside a vararg function", node);
        return holder.varargs ? holder.varargs.slice() : [];
      }
      return [yield* this.evalExpr(node, env)];
    }

    *evalExpr(node, env) {
      switch (node.type) {
        case 'Nil': return null;
        case 'True': return true;
        case 'False': return false;
        case 'Number': return node.value;
        case 'String': return node.value;

        case 'Vararg': {
          const holder = env.findVarargs();
          if (!holder) this.raise("cannot use '...' outside a vararg function", node);
          return holder.varargs && holder.varargs.length ? holder.varargs[0] : null;
        }

        case 'Name': return yield* this.getName(env, node.name, node);

        case 'Index': {
          const object = yield* this.evalExpr(node.object, env);
          const key = yield* this.evalExpr(node.key, env);
          return yield* this.getIndex(object, key, node);
        }

        case 'Call':
        case 'Method': {
          const results = yield* this.evalCall(node, env);
          return results.length ? results[0] : null;
        }

        case 'Paren':
          return yield* this.evalExpr(node.expr, env);

        case 'BinOp': {
          if (node.op === 'and') {
            const left = yield* this.evalExpr(node.left, env);
            return truthy(left) ? yield* this.evalExpr(node.right, env) : left;
          }
          if (node.op === 'or') {
            const left = yield* this.evalExpr(node.left, env);
            return truthy(left) ? left : yield* this.evalExpr(node.right, env);
          }
          const left = yield* this.evalExpr(node.left, env);
          const right = yield* this.evalExpr(node.right, env);
          return yield* this.binary(node.op, left, right, node);
        }

        case 'UnOp': {
          const value = yield* this.evalExpr(node.operand, env);
          return yield* this.unary(node.op, value, node);
        }

        case 'Table': {
          const table = new LuaTable();
          let index = 1;
          for (let i = 0; i < node.fields.length; i++) {
            const field = node.fields[i];
            if (field.kind === 'keyed') {
              const key = yield* this.evalExpr(field.key, env);
              const value = yield* this.evalExpr(field.value, env);
              table.rawSet(key, value);
            } else if (field.kind === 'named') {
              const value = yield* this.evalExpr(field.value, env);
              table.rawSet(field.name, value);
            } else if (i === node.fields.length - 1 && this.isMultiExpr(field.value)) {
              const values = yield* this.evalMulti(field.value, env);
              for (const value of values) {
                table.rawSet(index, value);
                index += 1;
              }
            } else {
              table.rawSet(index, yield* this.evalExpr(field.value, env));
              index += 1;
            }
          }
          return table;
        }

        case 'Function':
          return this.makeFunction(node, env);

        case 'ParenCall':
          return null;

        default:
          this.raise('unknown expression: ' + node.type, node);
      }
    }

    *evalCallParts(node, env) {
      if (node.type === 'Method') {
        const object = yield* this.evalExpr(node.object, env);
        const fn = yield* this.getIndex(object, node.name, node);
        const args = [object].concat(yield* this.evalExprList(node.args, env));
        return { fn, args };
      }
      const fn = yield* this.evalExpr(node.callee, env);
      const args = yield* this.evalExprList(node.args, env);
      return { fn, args };
    }

    *evalCall(node, env) {
      const parts = yield* this.evalCallParts(node, env);
      return yield* this.call(parts.fn, parts.args, node);
    }

    *getName(env, name, node) {
      const holder = env.find(name);
      if (holder) return holder.vars.get(name);
      // 拼错全局变量时仍返回 nil；这里保持 Lua 行为，不报错
      const envHolder = env.find('_ENV');
      const envTable = envHolder ? envHolder.vars.get('_ENV') : null;
      if (envTable === null) {
        this.raise(`attempt to index a nil value (upvalue '_ENV')`, node);
      }
      return yield* this.getIndex(envTable, name, node);
    }

    *setName(env, name, value, node) {
      const holder = env.find(name);
      if (holder) {
        if (holder.consts.has(name)) {
          this.raise(`attempt to assign to const variable '${name}'`, node);
        }
        holder.vars.set(name, value);
        return;
      }
      const envHolder = env.find('_ENV');
      const envTable = envHolder ? envHolder.vars.get('_ENV') : null;
      if (envTable === null) this.raise("attempt to index a nil value (upvalue '_ENV')", node);
      yield* this.setIndex(envTable, name, value, node);
    }

    /* ---------------- 元表 / 索引 ---------------- */

    getMetamethod(value, event) {
      let metatable = null;
      if (value instanceof LuaTable) metatable = value.metatable;
      else if (typeof value === 'string') metatable = this.stringMetatable;
      if (!metatable) return null;
      return metatable.rawGet(event);
    }

    *getIndex(object, key, node, depth) {
      depth = depth || 0;
      if (depth > 100) this.raise("'__index' chain too long; possible loop", node);
      if (object instanceof LuaTable) {
        const value = object.rawGet(key);
        if (value !== null) return value;
        const metatable = object.metatable;
        if (metatable) {
          const handler = metatable.rawGet('__index');
          if (handler !== null) {
            if (handler instanceof LuaTable) return yield* this.getIndex(handler, key, node, depth + 1);
            if (!(handler instanceof LuaFunction) && !(handler instanceof LuaNative) && this.getMetamethod(handler, '__call') === null) {
              this.raise(`attempt to index a ${typeName(handler)} value`, node);
            }
            const results = yield* this.call(handler, [object, key], node);
            return results.length ? results[0] : null;
          }
        }
        return null;
      }
      if (typeof object === 'string') {
        const handler = this.stringMetatable.rawGet('__index');
        if (handler !== null) return yield* this.getIndex(handler, key, node, depth + 1);
      }
      this.raise(`attempt to index a ${typeName(object)} value`, node);
    }

    *setIndex(object, key, value, node, depth) {
      depth = depth || 0;
      if (depth > 100) this.raise("'__newindex' chain too long; possible loop", node);
      if (!(object instanceof LuaTable)) {
        this.raise(`attempt to index a ${typeName(object)} value`, node);
      }
      if (key === null || key === undefined) this.raise('table index is nil', node);
      if (typeof key === 'number' && Number.isNaN(key)) this.raise('table index is NaN', node);
      if (object.rawGet(key) !== null) {
        object.rawSet(key, value);
        return;
      }
      const metatable = object.metatable;
      if (metatable) {
        const handler = metatable.rawGet('__newindex');
        if (handler !== null) {
          if (handler instanceof LuaTable) {
            yield* this.setIndex(handler, key, value, node, depth + 1);
          } else {
            if (!(handler instanceof LuaFunction) && !(handler instanceof LuaNative) && this.getMetamethod(handler, '__call') === null) {
              this.raise(`attempt to index a ${typeName(handler)} value`, node);
            }
            yield* this.call(handler, [object, key, value], node);
          }
          return;
        }
      }
      object.rawSet(key, value);
    }

    /* ---------------- 运算 ---------------- */

    *unary(op, value, node) {
      if (op === 'not') return !truthy(value);
      if (op === '-') {
        const number = toNumberValue(value);
        if (number !== null) return -number;
        const handler = this.getMetamethod(value, '__unm');
        if (handler !== null) {
          const results = yield* this.call(handler, [value], node);
          return results.length ? results[0] : null;
        }
        this.raise(`attempt to perform arithmetic on a ${typeName(value)} value`, node);
      }
      if (op === '#') return yield* this.length(value, node);
      if (op === '~') {
        const integer = toLuaIntegerStrict(value);
        if (integer !== null) return bigintToNumber(~BigInt.asIntN(64, integer));
        const handler = this.getMetamethod(value, '__bnot');
        if (handler !== null) {
          const results = yield* this.call(handler, [value], node);
          return results.length ? results[0] : null;
        }
        this.raise(`attempt to perform bitwise operation on a ${typeName(value)} value`, node);
      }
      this.raise('unknown unary operator ' + op, node);
    }

    *length(value, node) {
      if (typeof value === 'string') return value.length;
      if (value instanceof LuaTable) {
        const handler = this.getMetamethod(value, '__len');
        if (handler !== null) {
          const results = yield* this.call(handler, [value], node);
          return results.length ? results[0] : null;
        }
        return value.rawLen();
      }
      const handler = this.getMetamethod(value, '__len');
      if (handler !== null) {
        const results = yield* this.call(handler, [value], node);
        return results.length ? results[0] : null;
      }
      this.raise(`attempt to get length of a ${typeName(value)} value`, node);
    }

    *binary(op, a, b, node) {
      if (op === '..') return yield* this.concat(a, b, node);
      if (op === '==') return yield* this.equels(a, b, node);
      if (op === '~=') return !(yield* this.equels(a, b, node));
      if (op === '<') return yield* this.lessThan(a, b, node);
      if (op === '>') return yield* this.lessThan(b, a, node);
      if (op === '<=') return yield* this.lessOrEqual(a, b, node);
      if (op === '>=') return yield* this.lessOrEqual(b, a, node);

      if (op === '+' || op === '-' || op === '*' || op === '/' || op === '//' || op === '%' || op === '^') {
        const x = toNumberValue(a);
        const y = toNumberValue(b);
        if (x !== null && y !== null) {
          switch (op) {
            case '+': return x + y;
            case '-': return x - y;
            case '*': return x * y;
            case '/': return x / y;
            case '//': return Math.floor(x / y);
            case '%': return x - Math.floor(x / y) * y;
            case '^': return Math.pow(x, y);
          }
        }
        const handler = this.getMetamethod(a, ARITH_METAMETHODS[op]) || this.getMetamethod(b, ARITH_METAMETHODS[op]);
        if (handler !== null) {
          const results = yield* this.call(handler, [a, b], node);
          return results.length ? results[0] : null;
        }
        this.raise(`attempt to perform arithmetic on a ${typeName(x === null ? a : b)} value`, node);
      }

      if (op === '&' || op === '|' || op === '~' || op === '<<' || op === '>>') {
        const x = toLuaIntegerStrict(a);
        const y = toLuaIntegerStrict(b);
        if (x !== null && y !== null) return this.bitwise(op, x, y);
        const handler = this.getMetamethod(a, ARITH_METAMETHODS[op]) || this.getMetamethod(b, ARITH_METAMETHODS[op]);
        if (handler !== null) {
          const results = yield* this.call(handler, [a, b], node);
          return results.length ? results[0] : null;
        }
        this.raise(`attempt to perform bitwise operation on a ${typeName(x === null ? a : b)} value`, node);
      }

      this.raise('unknown binary operator ' + op, node);
    }

    bitwise(op, x, y) {
      x = BigInt.asIntN(64, x);
      y = BigInt.asIntN(64, y);
      switch (op) {
        case '&': return bigintToNumber(x & y);
        case '|': return bigintToNumber(x | y);
        case '~': return bigintToNumber(x ^ y);
        case '<<': {
          if (y < 0n) return this.bitwise('>>', x, -y);
          if (y >= 64n) return 0;
          return bigintToNumber(BigInt.asIntN(64, x << y));
        }
        case '>>': {
          if (y < 0n) return this.bitwise('<<', x, -y);
          if (y >= 64n) return 0;
          return bigintToNumber(BigInt.asIntN(64, x >> y));
        }
      }
      return 0;
    }

    *concat(a, b, node) {
      const aok = typeof a === 'string' || typeof a === 'number';
      const bok = typeof b === 'string' || typeof b === 'number';
      if (aok && bok) {
        return (typeof a === 'number' ? formatNumber(a) : a) + (typeof b === 'number' ? formatNumber(b) : b);
      }
      const handler = this.getMetamethod(a, '__concat') || this.getMetamethod(b, '__concat');
      if (handler !== null) {
        const results = yield* this.call(handler, [a, b], node);
        return results.length ? results[0] : null;
      }
      this.raise(`attempt to concatenate a ${typeName(aok ? b : a)} value`, node);
    }

    *equels(a, b, node) {
      if (a === null || a === undefined) return b === null || b === undefined;
      if (typeof a !== typeof b) return false;
      if (typeof a === 'number') {
        return !Number.isNaN(a) && !Number.isNaN(b) && a === b;
      }
      if (typeof a === 'string' || typeof a === 'boolean') return a === b;
      if (a === b) return true;
      if (a instanceof LuaTable && b instanceof LuaTable) {
        // Lua 5.4：任意一个操作数提供了 __eq 就会调用（5.3 要求两者是同一个函数）
        const ma = a.metatable;
        const mb = b.metatable;
        const ha = ma ? ma.rawGet('__eq') : null;
        const hb = mb ? mb.rawGet('__eq') : null;
        const handler = ha !== null ? ha : hb;
        if (handler !== null) {
          const results = yield* this.call(handler, [a, b], node);
          return truthy(results.length ? results[0] : null);
        }
      }
      return false;
    }

    *lessThan(a, b, node) {
      if (typeof a === 'number' && typeof b === 'number') return a < b;
      if (typeof a === 'string' && typeof b === 'string') return a < b;
      const handler = this.getMetamethod(a, '__lt') || this.getMetamethod(b, '__lt');
      if (handler !== null) {
        const results = yield* this.call(handler, [a, b], node);
        return truthy(results.length ? results[0] : null);
      }
      this.raise(`attempt to compare ${typeName(a)} with ${typeName(b)}`, node);
    }

    *lessOrEqual(a, b, node) {
      if (typeof a === 'number' && typeof b === 'number') return a <= b;
      if (typeof a === 'string' && typeof b === 'string') return a <= b;
      let handler = this.getMetamethod(a, '__le') || this.getMetamethod(b, '__le');
      if (handler !== null) {
        const results = yield* this.call(handler, [a, b], node);
        return truthy(results.length ? results[0] : null);
      }
      handler = this.getMetamethod(a, '__lt') || this.getMetamethod(b, '__lt');
      if (handler !== null) {
        const results = yield* this.call(handler, [b, a], node);
        return !truthy(results.length ? results[0] : null);
      }
      this.raise(`attempt to compare ${typeName(a)} with ${typeName(b)}`, node);
    }

    /* ---------------- 字符串化 ---------------- */

    *tostring(value) {
      switch (typeof value) {
        case 'undefined':
          return 'nil';
        case 'boolean':
          return value ? 'true' : 'false';
        case 'number':
          return formatNumber(value);
        case 'string':
          return value;
        default:
          break;
      }
      if (value === null) return 'nil';
      if (value instanceof LuaTable || value instanceof LuaFunction || value instanceof LuaNative || value instanceof LuaCoroutine) {
        const handler = value instanceof LuaTable ? this.getMetamethod(value, '__tostring') : null;
        if (handler !== null) {
          const results = yield* this.call(handler, [value]);
          const text = results.length ? results[0] : null;
          if (typeof text !== 'string') this.raise("'__tostring' must return a string");
          return text;
        }
        let name = typeName(value);
        if (value instanceof LuaTable) {
          const mt = value.metatable;
          const custom = mt ? mt.rawGet('__name') : null;
          if (typeof custom === 'string') name = custom;
        }
        return `${name}: ${objectAddress(value)}`;
      }
      return String(value);
    }

    display(value) {
      if (typeof value === 'string') return value;
      if (typeof value === 'number') return formatNumber(value);
      if (value === null) return 'nil';
      return this.simpleToString(value);
    }

    simpleToString(value) {
      if (value === null) return 'nil';
      if (typeof value === 'boolean') return value ? 'true' : 'false';
      if (typeof value === 'number') return formatNumber(value);
      if (typeof value === 'string') return value;
      if (value instanceof LuaTable) return `table: ${objectAddress(value)}`;
      if (value instanceof LuaFunction || value instanceof LuaNative) return `function: ${objectAddress(value)}`;
      if (value instanceof LuaCoroutine) return `thread: ${objectAddress(value)}`;
      return String(value);
    }

    /* ---------------- 协程支持 ---------------- */

    *yieldValues(values) {
      const incoming = yield { op: 'yield', values };
      return Array.isArray(incoming) ? incoming : [];
    }

    resumeCoroutine(co, args) {
      if (co.state === 'dead') return [false, 'cannot resume dead coroutine'];
      if (co.state === 'running' || co.state === 'normal') {
        return [false, 'cannot resume non-suspended coroutine'];
      }
      if (!(co.fn instanceof LuaFunction) && !(co.fn instanceof LuaNative) &&
        this.getMetamethod(co.fn, '__call') === null) {
        return [false, `attempt to call a ${typeName(co.fn)} value`];
      }
      const previousCoroutine = this.currentCoroutine;
      const previousFrames = this.frames;
      if (previousCoroutine) previousCoroutine.state = 'normal';
      co.state = 'running';
      this.currentCoroutine = co;
      this.frames = co.frames;
      try {
        let step;
        if (!co.started) {
          co.started = true;
          co.generator = this.call(co.fn, args || []);
          step = co.generator.next();
        } else {
          step = co.generator.next(args || []);
        }
        if (step.done) {
          co.state = 'dead';
          return [true].concat(step.value || []);
        }
        if (step.value && step.value.op === 'yield') {
          co.state = 'suspended';
          return [true].concat(step.value.values || []);
        }
        co.state = 'dead';
        return [false, 'invalid coroutine yield'];
      } catch (err) {
        co.state = 'dead';
        if (isSignal(err)) {
          if (err instanceof ReturnSignal) return [true].concat(err.values || []);
          return [false, 'coroutine yielded outside of coroutine.yield'];
        }
        return [false, errorValue(err)];
      } finally {
        this.frames = previousFrames;
        this.currentCoroutine = previousCoroutine;
        if (previousCoroutine && previousCoroutine.state === 'normal') previousCoroutine.state = 'running';
      }
    }
  }

  /* =====================================================================
   * 导出
   * =================================================================== */

  LuaJS.Interpreter = Interpreter;
  LuaJS.LuaError = LuaError;
  LuaJS.LuaTable = LuaTable;
  LuaJS.LuaFunction = LuaFunction;
  LuaJS.LuaNative = LuaNative;
  LuaJS.LuaCoroutine = LuaCoroutine;
  LuaJS.Env = Env;
  LuaJS.SIGNALS = SIGNALS;
  LuaJS.Lexer = Lexer;
  LuaJS.Parser = Parser;
  LuaJS.typeName = typeName;
  LuaJS.truthy = truthy;
  LuaJS.formatNumber = formatNumber;
  LuaJS.parseLuaNumber = parseLuaNumber;
  LuaJS.parseIntegerBase = parseIntegerBase;
  LuaJS.toLuaInteger = toLuaInteger;
  LuaJS.bigintToNumber = bigintToNumber;
  LuaJS.errorValue = errorValue;
  LuaJS.errorMessage = errorMessage;
  LuaJS.rawEquals = rawEquals;
  LuaJS.objectAddress = objectAddress;
  LuaJS.isSignal = isSignal;

  return LuaJS;
});