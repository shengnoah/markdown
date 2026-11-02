/*!
 * Lua in JavaScript — 标准库
 * 依赖 lua-core.js，为其 Interpreter 安装 Lua 5.4 风格的标准库。
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('./lua-core.js'));
  } else {
    root.LuaJS = factory(root.LuaJS);
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (LuaJS) {
  'use strict';

  const Interpreter = LuaJS.Interpreter;
  const LuaTable = LuaJS.LuaTable;
  const LuaNative = LuaJS.LuaNative;
  const LuaCoroutine = LuaJS.LuaCoroutine;
  const LuaError = LuaJS.LuaError;
  const LuaFunction = LuaJS.LuaFunction;
  const Env = LuaJS.Env;
  const typeName = LuaJS.typeName;
  const truthy = LuaJS.truthy;
  const formatNumber = LuaJS.formatNumber;
  const parseLuaNumber = LuaJS.parseLuaNumber;
  const parseIntegerBase = LuaJS.parseIntegerBase;
  const toLuaInteger = LuaJS.toLuaInteger;
  const bigintToNumber = LuaJS.bigintToNumber;
  const errorValue = LuaJS.errorValue;
  const errorMessage = LuaJS.errorMessage;
  const toNumberValue = function (value) {
    if (typeof value === 'number') return Number.isNaN(value) ? null : value;
    if (typeof value === 'string') return parseLuaNumber(value);
    return null;
  };

  /* =====================================================================
   * 参数检查
   * =================================================================== */

  function argError(interp, message) {
    throw new LuaError(interp.position() + message);
  }

  function badArgument(interp, index, fname, expected, value) {
    argError(interp, `bad argument #${index} to '${fname}' (${expected} expected, got ${typeName(value)})`);
  }

  function checkTable(interp, args, index, fname) {
    const value = args[index - 1];
    if (!(value instanceof LuaTable)) badArgument(interp, index, fname, 'table', value);
    return value;
  }

  function checkNumber(interp, args, index, fname, optional, fallback) {
    const value = args[index - 1];
    if (value === undefined || value === null) {
      if (optional) return fallback;
      badArgument(interp, index, fname, 'number', null);
    }
    const number = typeof value === 'number' ? value : parseLuaNumber(value);
    if (number === null) badArgument(interp, index, fname, 'number', value);
    return number;
  }

  function checkInteger(interp, args, index, fname, optional, fallback) {
    const number = checkNumber(interp, args, index, fname, optional, fallback);
    if (number === null && optional) return null;
    if (!Number.isFinite(number) || Math.floor(number) !== number) {
      argError(interp, `bad argument #${index} to '${fname}' (number has no integer representation)`);
    }
    return number;
  }

  function checkString(interp, args, index, fname) {
    const value = args[index - 1];
    if (typeof value === 'string') return value;
    if (typeof value === 'number') return formatNumber(value);
    badArgument(interp, index, fname, 'string', value);
  }

  function optionalString(interp, args, index, fname, fallback) {
    const value = args[index - 1];
    if (value === undefined || value === null) return fallback;
    if (typeof value === 'string') return value;
    if (typeof value === 'number') return formatNumber(value);
    badArgument(interp, index, fname, 'string', value);
  }

  function argCount(args) {
    let n = args.length;
    while (n > 0 && args[n - 1] === null) n -= 1;
    return n;
  }

  /* =====================================================================
   * Lua 模式匹配（Lua patterns）
   * =================================================================== */

  const MAX_CAPTURES = 32;
  const MAX_PATTERN_DEPTH = 220;

  function patternError(message) {
    throw new LuaError('malformed pattern (' + message + ')');
  }

  function classEnd(p, pi) {
    if (pi >= p.length) patternError("ends with '%'");
    const ch = p[pi];
    if (ch === '%') {
      if (pi + 1 >= p.length) patternError("ends with '%'");
      return pi + 2;
    }
    if (ch === '[') {
      let i = pi + 1;
      if (p[i] === '^') i += 1;
      if (p[i] === ']') i += 1;
      while (i < p.length && p[i] !== ']') {
        if (p[i] === '%' && i + 1 < p.length) i += 1;
        i += 1;
      }
      if (i >= p.length) patternError("missing ']'");
      return i + 1;
    }
    return pi + 1;
  }

  function matchClassChar(ch, cls) {
    const code = ch.charCodeAt(0);
    let result;
    switch (cls) {
      case 'a': result = /[A-Za-z]/.test(ch); break;
      case 'c': result = code < 32 || code === 127; break;
      case 'd': result = ch >= '0' && ch <= '9'; break;
      case 'g': result = code >= 33 && code <= 126; break;
      case 'l': result = ch >= 'a' && ch <= 'z'; break;
      case 'p': result = (code >= 33 && code <= 47) || (code >= 58 && code <= 64) ||
        (code >= 91 && code <= 96) || (code >= 123 && code <= 126); break;
      case 's': result = /\s/.test(ch); break;
      case 'u': result = ch >= 'A' && ch <= 'Z'; break;
      case 'w': result = /[A-Za-z0-9]/.test(ch); break;
      case 'x': result = /[0-9A-Fa-f]/.test(ch); break;
      case 'z': result = code === 0; break;
      default: return ch === cls;
    }
    return result;
  }

  function matchClass(ch, cls) {
    if (cls === cls.toUpperCase() && cls !== cls.toLowerCase()) {
      return !matchClassChar(ch, cls.toLowerCase());
    }
    return matchClassChar(ch, cls);
  }

  function matchBracketChar(ch, p, pi, ec) {
    let i = pi + 1;
    let negate = false;
    if (p[i] === '^') {
      negate = true;
      i += 1;
    }
    let matched = false;
    const code = ch.charCodeAt(0);
    while (i < ec - 1) {
      if (p[i] === '%' && i + 1 < ec - 1) {
        if (matchClass(ch, p[i + 1])) matched = true;
        i += 2;
      } else if (i + 2 < ec - 1 && p[i + 1] === '-') {
        const from = p.charCodeAt(i);
        const to = p.charCodeAt(i + 2);
        if (code >= from && code <= to) matched = true;
        i += 3;
      } else {
        if (p[i] === ch) matched = true;
        i += 1;
      }
    }
    return negate ? !matched : matched;
  }

  function singleMatch(s, si, p, pi, ep) {
    if (si >= s.length) return false;
    const ch = s[si];
    const pc = p[pi];
    if (pc === '.') return true;
    if (pc === '%') return matchClass(ch, p[pi + 1]);
    if (pc === '[') return matchBracketChar(ch, p, pi, ep);
    return pc === ch;
  }

  function cloneCaptures(captures) {
    return captures.map(c => ({ start: c.start, end: c.end, pos: !!c.pos }));
  }

  function patternDoMatch(s, si, p, pi, captures, depth) {
    if (depth > MAX_PATTERN_DEPTH) throw new LuaError('pattern too complex');
    while (true) {
      if (pi >= p.length) {
        for (const capture of captures) {
          if (!capture.pos && capture.end < 0) throw new LuaError('unfinished capture');
        }
        return { captures, end: si };
      }
      const pc = p[pi];

      if (pc === '(') {
        if (captures.length >= MAX_CAPTURES) throw new LuaError('too many captures');
        const next = cloneCaptures(captures);
        if (p[pi + 1] === ')') {
          next.push({ start: si, end: si, pos: true });
          return patternDoMatch(s, si, p, pi + 2, next, depth + 1);
        }
        next.push({ start: si, end: -1, pos: false });
        return patternDoMatch(s, si, p, pi + 1, next, depth + 1);
      }

      if (pc === ')') {
        let index = -1;
        for (let i = captures.length - 1; i >= 0; i--) {
          if (!captures[i].pos && captures[i].end < 0) {
            index = i;
            break;
          }
        }
        if (index < 0) throw new LuaError('invalid pattern capture');
        const next = cloneCaptures(captures);
        next[index].end = si;
        captures = next;
        pi += 1;
        continue;
      }

      if (pc === '$' && pi + 1 === p.length) {
        return si === s.length ? { captures, end: si } : null;
      }

      if (pc === '%' && p[pi + 1] === 'b') {
        const open = p[pi + 2];
        const close = p[pi + 3];
        if (open === undefined || close === undefined) patternError("missing arguments to '%b'");
        if (si >= s.length || s[si] !== open) return null;
        let count = 1;
        let i = si + 1;
        while (i < s.length) {
          if (s[i] === close) {
            count -= 1;
            if (count === 0) {
              si = i + 1;
              break;
            }
          } else if (s[i] === open) {
            count += 1;
          }
          i += 1;
        }
        if (count !== 0) return null;
        pi += 4;
        continue;
      }

      if (pc === '%' && p[pi + 1] === 'f') {
        const ep = classEnd(p, pi + 2);
        const previous = si === 0 ? '\0' : s[si - 1];
        const current = si >= s.length ? '\0' : s[si];
        if (p[pi + 2] === '[') {
          if (matchBracketChar(previous, p, pi + 2, ep)) return null;
          if (!matchBracketChar(current, p, pi + 2, ep)) return null;
        } else {
          const cls = p[pi + 2];
          if (matchClass(previous, cls)) return null;
          if (!matchClass(current, cls)) return null;
        }
        pi = ep;
        continue;
      }

      if (pc === '%' && p[pi + 1] >= '1' && p[pi + 1] <= '9') {
        const index = Number(p[pi + 1]) - 1;
        const capture = captures[index];
        if (!capture || capture.pos || capture.end < 0) throw new LuaError('invalid capture index %' + (index + 1));
        const text = s.slice(capture.start, capture.end);
        if (!s.startsWith(text, si)) return null;
        si += text.length;
        pi += 2;
        continue;
      }

      const ep = classEnd(p, pi);
      const quantifier = p[ep];

      if (quantifier === '?') {
        if (singleMatch(s, si, p, pi, ep)) {
          const result = patternDoMatch(s, si + 1, p, ep + 1, captures, depth + 1);
          if (result) return result;
        }
        pi = ep + 1;
        continue;
      }

      if (quantifier === '*') {
        return patternMaxExpand(s, si, p, pi, ep, 0, captures, depth);
      }

      if (quantifier === '+') {
        return patternMaxExpand(s, si, p, pi, ep, 1, captures, depth);
      }

      if (quantifier === '-') {
        return patternMinExpand(s, si, p, pi, ep, captures, depth);
      }

      if (!singleMatch(s, si, p, pi, ep)) return null;
      si += 1;
      pi = ep;
    }
  }

  function patternMaxExpand(s, si, p, pi, ep, min, captures, depth) {
    let i = si;
    while (i < s.length && singleMatch(s, i, p, pi, ep)) i += 1;
    for (; i >= si + min; i--) {
      const result = patternDoMatch(s, i, p, ep + 1, captures, depth + 1);
      if (result) return result;
    }
    return null;
  }

  function patternMinExpand(s, si, p, pi, ep, captures, depth) {
    let i = si;
    while (true) {
      const result = patternDoMatch(s, i, p, ep + 1, captures, depth + 1);
      if (result) return result;
      if (i < s.length && singleMatch(s, i, p, pi, ep)) i += 1;
      else return null;
    }
  }

  class LuaPattern {
    constructor(pattern, literalCaret) {
      // string.gmatch 不把开头的 ^ 当作锚点（Lua 5.4 手册明确说明），按普通字符处理
      this.anchored = !literalCaret && pattern[0] === '^';
      this.pattern = this.anchored ? pattern.slice(1) : pattern;
    }

    matchAt(s, start) {
      const result = patternDoMatch(s, start, this.pattern, 0, [], 0);
      if (!result) return null;
      return { start, end: result.end, captures: result.captures };
    }
  }

  function captureValues(s, captures) {
    return captures.map(capture => capture.pos ? capture.start + 1 : s.slice(capture.start, capture.end));
  }

  function relativePosition(pos, len) {
    if (pos >= 0) return pos;
    return len + pos + 1;
  }

  /* =====================================================================
   * 安装标准库
   * =================================================================== */

  Interpreter.prototype.installStdlib = function () {
    const interp = this;
    const globals = this.globals;

    const native = (name, fn) => new LuaNative(name, fn, false);
    const nativeGen = (name, fn) => new LuaNative(name, fn, true);
    const def = (name, value) => globals.rawSet(name, value);

    this.randomSeed = 0x9e3779b9;
    this._randomExtra = 0x243f6a88;

    /* ---------------- base ---------------- */

    def('_VERSION', 'Lua 5.4');

    def('print', nativeGen('print', function* (args) {
      const parts = [];
      for (const value of args) parts.push(yield* this.tostring(value));
      this.write(parts.join('\t') + '\n');
      return [];
    }));

    def('tostring', nativeGen('tostring', function* (args) {
      return [yield* this.tostring(args[0] === undefined ? null : args[0])];
    }));

    def('tonumber', native('tonumber', function (args) {
      const value = args[0];
      if (args.length > 1 && args[1] !== undefined && args[1] !== null) {
        const base = checkInteger(this, args, 2, 'tonumber');
        if (base < 2 || base > 36) argError(this, `bad argument #2 to 'tonumber' (base out of range)`);
        if (typeof value !== 'string') return [null];
        return [parseIntegerBase(value, base)];
      }
      if (typeof value === 'number') return [value];
      if (typeof value === 'string') return [parseLuaNumber(value)];
      return [null];
    }));

    def('type', native('type', function (args) {
      return [typeName(args[0] === undefined ? null : args[0])];
    }));

    def('assert', native('assert', function (args) {
      if (!truthy(args[0])) {
        const message = args.length > 1 ? args[1] : 'assertion failed!';
        if (typeof message === 'string') throw new LuaError(this.position() + message);
        throw new LuaError(message);
      }
      return args.slice();
    }));

    def('error', native('error', function (args) {
      const message = args[0] === undefined ? null : args[0];
      let level = args.length > 1 ? Number(args[1]) : 1;
      if (typeof message === 'string' && level > 0) {
        const error = new LuaError(this.position(level) + message);
        error.luaTraceback = this.traceback();
        throw error;
      }
      const error = new LuaError(message);
      error.luaTraceback = this.traceback();
      throw error;
    }));

    def('pcall', nativeGen('pcall', function* (args) {
      const fn = args[0];
      if (!(fn instanceof LuaFunction) && !(fn instanceof LuaNative) && this.getMetamethod(fn, '__call') === null) {
        return [false, `attempt to call a ${typeName(fn)} value`];
      }
      try {
        const results = yield* this.call(fn, args.slice(1));
        return [true].concat(results);
      } catch (err) {
        if (LuaJS.isSignal(err)) throw err;
        return [false, errorValue(err)];
      }
    }));

    def('xpcall', nativeGen('xpcall', function* (args) {
      const fn = args[0];
      const handler = args[1];
      try {
        const results = yield* this.call(fn, args.slice(2));
        return [true].concat(results);
      } catch (err) {
        if (LuaJS.isSignal(err)) throw err;
        try {
          const handled = yield* this.call(handler, [errorValue(err)]);
          return [false].concat(handled);
        } catch (handlerErr) {
          return [false, errorValue(handlerErr)];
        }
      }
    }));

    def('select', native('select', function (args) {
      if (args[0] === '#') return [args.length - 1];
      let index = checkInteger(this, args, 1, 'select');
      const count = args.length - 1;
      if (index < 0) index = count + index + 1;
      if (index < 1) argError(this, "bad argument #1 to 'select' (index out of range)");
      return args.slice(index);
    }));

    const nextFn = native('next', function (args) {
      const table = checkTable(this, args, 1, 'next');
      const key = args.length > 1 ? args[1] : null;
      const result = table.next(key);
      if (result === null) return [null];
      return result;
    });
    def('next', nextFn);

    def('pairs', nativeGen('pairs', function* (args) {
      const table = args[0];
      if (table === null || table === undefined) {
        badArgument(this, 1, 'pairs', 'table', table);
      }
      if (table instanceof LuaTable) {
        const handler = this.getMetamethod(table, '__pairs');
        if (handler !== null) return yield* this.call(handler, [table]);
      }
      return [nextFn, table, null];
    }));

    def('ipairs', native('ipairs', function (args) {
      const table = args[0];
      const interp = this;
      const iterator = nativeGen('ipairs_iterator', function* (iterArgs) {
        const t = iterArgs[0];
        const index = checkInteger(interp, iterArgs, 2, 'ipairs');
        const value = yield* interp.getIndex(t, index + 1);
        if (value === null) return [null];
        return [index + 1, value];
      });
      return [iterator, table, 0];
    }));

    def('rawget', native('rawget', function (args) {
      const table = checkTable(this, args, 1, 'rawget');
      return [table.rawGet(args[1] === undefined ? null : args[1])];
    }));

    def('rawset', native('rawset', function (args) {
      const table = checkTable(this, args, 1, 'rawset');
      table.rawSet(args[1] === undefined ? null : args[1], args[2] === undefined ? null : args[2]);
      return [table];
    }));

    def('rawequal', native('rawequal', function (args) {
      return [LuaJS.rawEquals(args[0] === undefined ? null : args[0], args[1] === undefined ? null : args[1])];
    }));

    def('rawlen', native('rawlen', function (args) {
      const value = args[0];
      if (typeof value === 'string') return [value.length];
      if (value instanceof LuaTable) return [value.rawLen()];
      badArgument(this, 1, 'rawlen', 'table or string', value);
    }));

    def('getmetatable', native('getmetatable', function (args) {
      const value = args[0];
      let metatable = null;
      if (value instanceof LuaTable) metatable = value.metatable;
      else if (typeof value === 'string') metatable = this.stringMetatable;
      if (!metatable) return [null];
      const protectedValue = metatable.rawGet('__metatable');
      if (protectedValue !== null) return [protectedValue];
      return [metatable];
    }));

    def('setmetatable', native('setmetatable', function (args) {
      const table = checkTable(this, args, 1, 'setmetatable');
      const metatable = args[1] === undefined ? null : args[1];
      if (metatable !== null && !(metatable instanceof LuaTable)) {
        badArgument(this, 2, 'setmetatable', 'nil or table', metatable);
      }
      if (table.metatable && table.metatable.rawGet('__metatable') !== null) {
        throw new LuaError('cannot change a protected metatable');
      }
      table.metatable = metatable;
      return [table];
    }));

    def('collectgarbage', native('collectgarbage', function (args) {
      const option = args[0] === undefined ? 'collect' : args[0];
      if (option === 'count') return [0];
      if (option === 'isrunning') return [true];
      if (option === 'step') return [false];
      if (option === 'collect' || option === 'stop' || option === 'restart' || option === 'incremental' || option === 'generational') {
        return [0];
      }
      return [0];
    }));

    /* ---------------- load ---------------- */

    const loadFn = nativeGen('load', function* (args) {
      let source = args[0];
      const chunkName = args[1] === undefined || args[1] === null ? '=(load)' : String(args[1]);
      const env = args[3];
      if (source instanceof LuaFunction || source instanceof LuaNative) {
        const pieces = [];
        while (true) {
          const results = yield* this.call(source, []);
          const piece = results.length ? results[0] : null;
          if (piece === null) break;
          if (typeof piece !== 'string') return [null, 'reader function must return a string'];
          if (piece === '') break;
          pieces.push(piece);
        }
        source = pieces.join('');
      }
      if (typeof source !== 'string') {
        return [null, `bad argument #1 to 'load' (string or function expected, got ${typeName(source)})`];
      }
      try {
        const fn = this.compile(source, chunkName, env instanceof LuaTable ? env : undefined);
        return [fn];
      } catch (err) {
        return [null, errorMessage(err)];
      }
    });
    def('load', loadFn);
    def('loadstring', loadFn);

    /* ---------------- string ---------------- */

    const stringLib = new LuaTable();

    function argString(args, index, fname) {
      return checkString(interp, args, index, fname);
    }

    function argPosStart(value, len, fname) {
      let pos = Number(value);
      if (!Number.isFinite(pos)) argError(interp, `bad argument to '${fname}' (number expected)`);
      pos = Math.trunc(pos);
      if (pos >= 0) return pos;
      return len + pos + 1;
    }

    stringLib.rawSet('len', native('string.len', function (args) {
      const s = checkString(this, args, 1, 'len');
      return [s.length];
    }));

    stringLib.rawSet('sub', native('string.sub', function (args) {
      const s = checkString(this, args, 1, 'sub');
      const len = s.length;
      let i = argPosStart(args[1] === undefined ? 1 : args[1], len, 'sub');
      let j = args[2] === undefined ? len : argPosStart(args[2], len, 'sub');
      if (i < 1) i = 1;
      if (j > len) j = len;
      if (i > j) return [''];
      return [s.slice(i - 1, j)];
    }));

    stringLib.rawSet('upper', native('string.upper', function (args) {
      return [checkString(this, args, 1, 'upper').toUpperCase()];
    }));

    stringLib.rawSet('lower', native('string.lower', function (args) {
      return [checkString(this, args, 1, 'lower').toLowerCase()];
    }));

    stringLib.rawSet('rep', native('string.rep', function (args) {
      const s = checkString(this, args, 1, 'rep');
      const n = checkInteger(this, args, 2, 'rep');
      const sep = optionalString(this, args, 3, 'rep', '');
      if (n <= 0) return [''];
      if ((s.length + sep.length) * n > 5000000) throw new LuaError('resulting string too large');
      const parts = new Array(n);
      for (let i = 0; i < n; i++) parts[i] = s;
      return [parts.join(sep)];
    }));

    stringLib.rawSet('reverse', native('string.reverse', function (args) {
      const s = checkString(this, args, 1, 'reverse');
      return [Array.from(s).reverse().join('')];
    }));

    stringLib.rawSet('byte', native('string.byte', function (args) {
      const s = checkString(this, args, 1, 'byte');
      const len = s.length;
      let i = args[1] === undefined ? 1 : argPosStart(args[1], len, 'byte');
      let j = args[2] === undefined ? i : argPosStart(args[2], len, 'byte');
      if (i < 1) i = 1;
      if (j > len) j = len;
      const out = [];
      for (let k = i; k <= j; k++) out.push(s.charCodeAt(k - 1));
      return out;
    }));

    stringLib.rawSet('char', native('string.char', function (args) {
      const codes = [];
      for (let i = 0; i < args.length; i++) {
        const code = checkInteger(this, args, i + 1, 'char');
        if (code < 0 || code > 0x10FFFF) argError(this, `bad argument #${i + 1} to 'char' (value out of range)`);
        codes.push(code);
      }
      return [String.fromCodePoint.apply(String, codes)];
    }));

    stringLib.rawSet('find', native('string.find', function (args) {
      const s = checkString(this, args, 1, 'find');
      const pattern = checkString(this, args, 2, 'find');
      const len = s.length;
      let init = args.length > 2 && args[2] !== null ? argPosStart(args[2], len, 'find') : 1;
      if (init > len + 1) return [null];
      if (init < 1) init = 1;
      const plain = truthy(args[3]);

      if (plain) {
        const index = s.indexOf(pattern, init - 1);
        if (index < 0) return [null];
        return [index + 1, index + pattern.length];
      }

      const compiled = new LuaPattern(pattern);
      if (compiled.anchored) {
        const match = compiled.matchAt(s, init - 1);
        if (!match) return [null];
        return [match.start + 1, match.end].concat(captureValues(s, match.captures));
      }
      for (let start = init - 1; start <= len; start++) {
        const match = compiled.matchAt(s, start);
        if (match) return [match.start + 1, match.end].concat(captureValues(s, match.captures));
      }
      return [null];
    }));

    stringLib.rawSet('match', native('string.match', function (args) {
      const s = checkString(this, args, 1, 'match');
      const pattern = checkString(this, args, 2, 'match');
      const len = s.length;
      let init = args.length > 2 ? argPosStart(args[2], len, 'match') : 1;
      if (init < 1) init = 1;
      if (init > len + 1) return [null];
      const compiled = new LuaPattern(pattern);
      if (compiled.anchored) {
        const match = compiled.matchAt(s, init - 1);
        if (!match) return [null];
        const values = captureValues(s, match.captures);
        return values.length ? values : [s.slice(match.start, match.end)];
      }
      for (let start = init - 1; start <= len; start++) {
        const match = compiled.matchAt(s, start);
        if (match) {
          const values = captureValues(s, match.captures);
          return values.length ? values : [s.slice(match.start, match.end)];
        }
      }
      return [null];
    }));

    stringLib.rawSet('gmatch', native('string.gmatch', function (args) {
      const s = checkString(this, args, 1, 'gmatch');
      const pattern = checkString(this, args, 2, 'gmatch');
      const compiled = new LuaPattern(pattern, true);
      const len = s.length;
      let position = 0;
      let lastMatchEnd = -1;
      let finished = false;
      const iterator = nativeGen('gmatch_iterator', function* () {
        if (finished) return [null];
        // 与 lstrlib.c 的 gmatch_aux 一致：从上次匹配结束处继续，
        // 跳过与上一次匹配结束位置相同的空匹配。
        let src = position;
        while (src <= len) {
          const match = compiled.matchAt(s, src);
          if (match && match.end !== lastMatchEnd) {
            position = match.end;
            lastMatchEnd = match.end;
            const values = captureValues(s, match.captures);
            return values.length ? values : [s.slice(match.start, match.end)];
          }
          src += 1;
        }
        finished = true;
        return [null];
      });
      return [iterator];
    }));

    function expandReplacement(replacement, whole, captures) {
      let out = '';
      for (let i = 0; i < replacement.length; i++) {
        const ch = replacement[i];
        if (ch !== '%') {
          out += ch;
          continue;
        }
        const next = replacement[i + 1];
        if (next === '%') {
          out += '%';
          i += 1;
        } else if (next === '0') {
          out += whole;
          i += 1;
        } else if (next >= '1' && next <= '9') {
          const index = Number(next) - 1;
          if (captures.length === 0) {
            out += whole;
          } else {
            if (index >= captures.length) throw new LuaError(`invalid capture index %${next}`);
            out += captures[index];
          }
          i += 1;
        } else {
          throw new LuaError("invalid use of '%' in replacement string");
        }
      }
      return out;
    }

    function replacementString(interpInstance, value) {
      if (typeof value === 'string') return value;
      if (typeof value === 'number') return formatNumber(value);
      if (value === null || value === false) return null;
      badArgument(interpInstance, 3, 'gsub', 'string, number, table or function', value);
    }

    stringLib.rawSet('gsub', nativeGen('string.gsub', function* (args) {
      const s = checkString(this, args, 1, 'gsub');
      const pattern = checkString(this, args, 2, 'gsub');
      const replacement = args[2];
      const maxCount = args[3] === undefined || args[3] === null ? Infinity : checkInteger(this, args, 4, 'gsub');
      if (!(typeof replacement === 'string' || typeof replacement === 'number' || replacement instanceof LuaTable || replacement instanceof LuaFunction || replacement instanceof LuaNative)) {
        badArgument(this, 3, 'gsub', 'string, table or function', replacement);
      }
      const compiled = new LuaPattern(pattern);
      const len = s.length;
      let position = 0;
      let lastMatchEnd = -1;
      let output = '';
      let count = 0;
      // 与 lstrlib.c 的 str_gsub 一致：用 lastmatch 跳过重复的空匹配；
      // 没有有效匹配时复制一个字符（到达末尾则结束）。
      while (count < maxCount) {
        const match = compiled.matchAt(s, position);
        if (match && match.end !== lastMatchEnd) {
          const whole = s.slice(match.start, match.end);
          const captures = captureValues(s, match.captures);
          let value;
          if (typeof replacement === 'string' || typeof replacement === 'number') {
            value = expandReplacement(String(replacement), whole, captures);
          } else if (replacement instanceof LuaTable) {
            const key = captures.length ? captures[0] : whole;
            value = yield* this.getIndex(replacement, key);
          } else {
            const callArgs = captures.length ? captures : [whole];
            const results = yield* this.call(replacement, callArgs);
            value = results.length ? results[0] : null;
          }
          if (value === null || value === false) value = whole;
          else value = replacementString(this, value);
          output += s.slice(position, match.start) + value;
          count += 1;
          position = match.end;
          lastMatchEnd = match.end;
        } else if (position < len) {
          output += s[position];
          position += 1;
        } else {
          break;
        }
        if (compiled.anchored) break;
      }
      if (position < len) output += s.slice(position);
      return [output, count];
    }));

    function applyWidth(text, flags, width, numeric) {
      const w = width || 0;
      if (text.length >= w) return text;
      const left = flags.indexOf('-') >= 0;
      if (left) return text + ' '.repeat(w - text.length);
      const fill = flags.indexOf('0') >= 0 && numeric ? '0' : ' ';
      if (fill === '0' && /^[+-]/.test(text)) {
        return text[0] + '0'.repeat(w - text.length) + text.slice(1);
      }
      return fill.repeat(w - text.length) + text;
    }

    function padDigits(text, precision) {
      if (precision == null) return text;
      const negative = text[0] === '-';
      let digits = negative ? text.slice(1) : text;
      if (digits.length < precision) digits = '0'.repeat(precision - digits.length) + digits;
      return (negative ? '-' : '') + digits;
    }

    function applyNumberFlags(text, flags, precision, isFloat) {
      if (precision != null && !isFloat) text = padDigits(text, precision);
      if (!isFloat && text[0] !== '-' && text[0] !== '+') {
        if (flags.indexOf('+') >= 0) text = '+' + text;
        else if (flags.indexOf(' ') >= 0) text = ' ' + text;
      }
      return text;
    }

    function formatScientific(value, precision, upper) {
      let text = value.toExponential(precision);
      text = text.replace(/e([+-])(\d+)$/, function (m, sign, digits) {
        return 'e' + sign + digits.padStart(2, '0');
      });
      return upper ? text.toUpperCase() : text;
    }

    function formatGeneral(value, precision, upper) {
      if (value === 0) return '0';
      const exp = Math.floor(Math.log10(Math.abs(value)));
      let text;
      if (exp < -4 || exp >= precision) {
        text = formatScientific(value, precision - 1, false);
        const parts = text.split('e');
        parts[0] = parts[0].replace(/\.?0+$/, '');
        text = parts[0] + 'e' + parts[1];
      } else {
        text = value.toPrecision(precision);
        if (text.indexOf('e') >= 0) {
          const parts = text.split('e');
          parts[0] = parts[0].indexOf('.') >= 0 ? parts[0].replace(/0+$/, '').replace(/\.$/, '') : parts[0];
          const exponent = Number(parts[1]);
          text = parts[0] + 'e' + (exponent >= 0 ? '+' : '-') + String(Math.abs(exponent)).padStart(2, '0');
        } else if (text.indexOf('.') >= 0) {
          text = text.replace(/0+$/, '').replace(/\.$/, '');
        }
      }
      return upper ? text.toUpperCase() : text;
    }

    function formatHexFloat(value, precision, upper) {
      if (value === 0) return upper ? '0X0P+0' : '0x0p+0';
      const negative = value < 0;
      value = Math.abs(value);
      let exponent = Math.floor(Math.log2(value));
      let mantissa = value / Math.pow(2, exponent);
      if (mantissa < 1) {
        mantissa *= 2;
        exponent -= 1;
      }
      let text;
      if (precision == null) {
        let fraction = mantissa.toString(16);
        const dot = fraction.indexOf('.');
        if (dot >= 0) {
          let frac = fraction.slice(dot + 1);
          frac = frac.replace(/0+$/, '');
          text = fraction.slice(0, dot) + (frac ? '.' + frac : '');
        } else {
          text = fraction;
        }
        text = text.replace(/0+$/, '');
      } else {
        text = mantissa.toFixed(precision);
        // 用十六进制重新生成
        const intPart = Math.floor(mantissa);
        const fracPart = Math.round((mantissa - intPart) * Math.pow(16, precision));
        text = intPart.toString(16);
        if (precision > 0) {
          let frac = fracPart.toString(16).padStart(precision, '0');
          text += '.' + frac;
        }
      }
      const sign = negative ? '-' : '';
      const prefix = upper ? '0X' : '0x';
      const p = upper ? 'P' : 'p';
      return sign + prefix + text + p + (exponent >= 0 ? '+' : '') + exponent;
    }

    stringLib.rawSet('format', nativeGen('string.format', function* (args) {
      const format = checkString(this, args, 1, 'format');
      let output = '';
      let argIndex = 1;
      let i = 0;
      while (i < format.length) {
        const ch = format[i];
        if (ch !== '%') {
          output += ch;
          i += 1;
          continue;
        }
        if (format[i + 1] === '%') {
          output += '%';
          i += 2;
          continue;
        }
        const rest = format.slice(i);
        const match = /^%([-+ #0]*)(\d*)(?:\.(\d+))?([diouxXeEfgGqscaA])/.exec(rest);
        if (!match) throw new LuaError("invalid conversion specification");
        const flags = match[1];
        const width = match[2] ? Number(match[2]) : 0;
        const precision = match[3] === undefined ? null : Number(match[3]);
        const spec = match[4];
        if (argIndex >= args.length) {
          argError(this, `bad argument #${argIndex + 1} to 'format' (no value)`);
        }
        const value = args[argIndex];
        argIndex += 1;
        i += match[0].length;

        let text;
        let numeric = true;
        switch (spec) {
          case 'd':
          case 'i': {
            const number = toNumberValue(value);
            if (number === null) badArgument(this, argIndex, 'format', 'number', value);
            if (!Number.isFinite(number) || Math.trunc(number) !== number) {
              argError(this, `bad argument #${argIndex} to 'format' (number has no integer representation)`);
            }
            text = String(number);
            text = applyNumberFlags(text, flags, precision, false);
            break;
          }
          case 'u': {
            const number = toNumberValue(value);
            if (number === null) badArgument(this, argIndex, 'format', 'number', value);
            text = BigInt.asUintN(64, BigInt(Math.trunc(number))).toString(10);
            text = applyNumberFlags(text, flags, precision, false);
            break;
          }
          case 'o':
          case 'x':
          case 'X': {
            const number = toNumberValue(value);
            if (number === null) badArgument(this, argIndex, 'format', 'number', value);
            let big = BigInt.asUintN(64, BigInt(Math.trunc(number)));
            text = big.toString(spec === 'o' ? 8 : 16);
            if (spec === 'X') text = text.toUpperCase();
            text = applyNumberFlags(text, flags, precision, false);
            if (flags.indexOf('#') >= 0 && text !== '0') {
              if (spec === 'o') text = '0' + text;
              else if (spec === 'x') text = '0x' + text;
              else text = '0X' + text;
            }
            break;
          }
          case 'c': {
            const number = toNumberValue(value);
            if (number === null) badArgument(this, argIndex, 'format', 'number', value);
            const code = Math.trunc(number);
            if (code < 0 || code > 0x10FFFF) {
              argError(this, `bad argument #${argIndex} to 'format' (value out of range)`);
            }
            text = String.fromCodePoint(code);
            numeric = false;
            break;
          }
          case 'f': {
            const number = toNumberValue(value);
            if (number === null) badArgument(this, argIndex, 'format', 'number', value);
            const p = precision === null ? 6 : precision;
            text = number.toFixed(p);
            if (flags.indexOf('+') >= 0 && number >= 0) text = '+' + text;
            else if (flags.indexOf(' ') >= 0 && number >= 0) text = ' ' + text;
            break;
          }
          case 'e':
          case 'E': {
            const number = toNumberValue(value);
            if (number === null) badArgument(this, argIndex, 'format', 'number', value);
            const p = precision === null ? 6 : precision;
            text = formatScientific(number, p, spec === 'E');
            if (flags.indexOf('+') >= 0 && number >= 0) text = '+' + text;
            else if (flags.indexOf(' ') >= 0 && number >= 0) text = ' ' + text;
            break;
          }
          case 'g':
          case 'G': {
            const number = toNumberValue(value);
            if (number === null) badArgument(this, argIndex, 'format', 'number', value);
            const p = precision === null ? 6 : precision || 1;
            text = formatGeneral(number, p, spec === 'G');
            if (flags.indexOf('+') >= 0 && number >= 0) text = '+' + text;
            else if (flags.indexOf(' ') >= 0 && number >= 0) text = ' ' + text;
            break;
          }
          case 'a':
          case 'A': {
            const number = toNumberValue(value);
            if (number === null) badArgument(this, argIndex, 'format', 'number', value);
            text = formatHexFloat(number, precision, spec === 'A');
            break;
          }
          case 's': {
            text = yield* this.tostring(value);
            if (precision !== null) text = text.slice(0, precision);
            numeric = false;
            break;
          }
          case 'q': {
            if (typeof value !== 'string') badArgument(this, argIndex, 'format', 'string', value);
            let quoted = '"';
            for (let i = 0; i < value.length; i++) {
              const ch = value[i];
              const code = value.charCodeAt(i);
              if (ch === '"' || ch === '\\') {
                quoted += '\\' + ch;
              } else if (ch === '\n') {
                quoted += '\\\n';
              } else if (code < 32 || code === 127) {
                const next = value[i + 1];
                const width = next !== undefined && next >= '0' && next <= '9' ? 3 : 1;
                quoted += '\\' + String(code).padStart(width, '0');
              } else {
                quoted += ch;
              }
            }
            text = quoted + '"';
            numeric = false;
            break;
          }
          default:
            throw new LuaError('invalid conversion specification');
        }
        if (width) text = applyWidth(text, flags, width, numeric);
        output += text;
      }
      return [output];
    }));

    stringLib.rawSet('dump', native('string.dump', function () {
      throw new LuaError('string.dump is not supported');
    }));

    // utf8
    const utf8Lib = new LuaTable();
    utf8Lib.rawSet('charpattern', '[\0-\x7F\xC2-\xFD][\x80-\xBF]*');
    utf8Lib.rawSet('char', native('utf8.char', function (args) {
      const codes = args.map((value, index) => checkInteger(this, args, index + 1, 'char'));
      try {
        return [String.fromCodePoint.apply(String, codes)];
      } catch (err) {
        throw new LuaError('value out of range');
      }
    }));
    utf8Lib.rawSet('len', native('utf8.len', function (args) {
      const s = checkString(this, args, 1, 'len');
      let i = args[1] === undefined ? 1 : argPosStart(args[1], s.length, 'len');
      let j = args[2] === undefined ? s.length : argPosStart(args[2], s.length, 'len');
      if (i < 1) i = 1;
      if (j > s.length) j = s.length;
      if (i > j) return [0];
      return [Array.from(s.slice(i - 1, j)).length];
    }));
    utf8Lib.rawSet('codepoint', native('utf8.codepoint', function (args) {
      const s = checkString(this, args, 1, 'codepoint');
      let i = args[1] === undefined ? 1 : argPosStart(args[1], s.length, 'codepoint');
      let j = args[2] === undefined ? i : argPosStart(args[2], s.length, 'codepoint');
      if (i < 1) i = 1;
      if (j > s.length) j = s.length;
      const out = [];
      let pos = i - 1;
      while (pos < j) {
        const code = s.codePointAt(pos);
        out.push(code);
        pos += code > 0xFFFF ? 2 : 1;
      }
      return out;
    }));
    utf8Lib.rawSet('codes', native('utf8.codes', function (args) {
      const s = checkString(this, args, 1, 'codes');
      let position = 0;
      const iterator = nativeGen('utf8_iterator', function* () {
        if (position >= s.length) return [null];
        const code = s.codePointAt(position);
        const start = position + 1;
        position += code > 0xFFFF ? 2 : 1;
        return [start, code];
      });
      return [iterator, s, 0];
    }));
    utf8Lib.rawSet('offset', native('utf8.offset', function (args) {
      const s = checkString(this, args, 1, 'offset');
      const n = checkInteger(this, args, 2, 'offset');
      const len = s.length;
      let i = args[2] === undefined ? (n >= 0 ? 1 : len + 1) : argPosStart(args[2], len, 'offset');
      if (i < 1 || i > len + 1) argError(this, "bad argument #3 to 'offset' (position out of bounds)");
      if (n === 0) {
        let pos = i - 1;
        while (pos > 0 && pos < len && (s.charCodeAt(pos) & 0xC0) === 0x80) pos -= 1;
        return [pos + 1];
      }
      let pos = i - 1;
      if (n > 0) {
        if (pos >= len) return n === 1 ? [len + 1] : [null];
        let count = 0;
        while (count < n) {
          if (pos >= len) return [null];
          const code = s.codePointAt(pos);
          pos += code > 0xFFFF ? 2 : 1;
          count += 1;
        }
        return [pos + 1];
      }
      let count = 0;
      while (count > n) {
        if (pos <= 0) return [null];
        pos -= 1;
        while (pos > 0 && (s.charCodeAt(pos) & 0xC0) === 0x80) pos -= 1;
        count -= 1;
      }
      return [pos + 1];
    }));

    /* ---------------- table ---------------- */

    const tableLib = new LuaTable();

    tableLib.rawSet('concat', native('table.concat', function (args) {
      const table = checkTable(this, args, 1, 'concat');
      const separator = optionalString(this, args, 2, 'concat', '');
      const start = args[2] === undefined || args[2] === null ? 1 : checkInteger(this, args, 3, 'concat');
      const end = args[3] === undefined || args[3] === null ? table.rawLen() : checkInteger(this, args, 4, 'concat');
      const parts = [];
      for (let i = start; i <= end; i++) {
        const value = table.rawGet(i);
        if (typeof value === 'string') parts.push(value);
        else if (typeof value === 'number') parts.push(formatNumber(value));
        else throw new LuaError(`invalid value (at index ${i}) in table for 'concat'`);
      }
      return [parts.join(separator)];
    }));

    tableLib.rawSet('insert', native('table.insert', function (args) {
      const table = checkTable(this, args, 1, 'insert');
      const length = table.rawLen();
      let pos;
      let value;
      if (args.length >= 3 && args[2] !== null) {
        pos = checkInteger(this, args, 2, 'insert');
        value = args[2];
        if (pos < 1 || pos > length + 1) argError(this, "bad argument #2 to 'insert' (position out of bounds)");
        for (let i = length; i >= pos; i--) table.rawSet(i + 1, table.rawGet(i));
        table.rawSet(pos, value);
      } else {
        value = args[1] === undefined ? null : args[1];
        table.rawSet(length + 1, value);
      }
      return [];
    }));

    tableLib.rawSet('remove', native('table.remove', function (args) {
      const table = checkTable(this, args, 1, 'remove');
      const length = table.rawLen();
      let pos = args[1] === undefined || args[1] === null ? length : checkInteger(this, args, 2, 'remove');
      if (length === 0 && pos === 0) return [null];
      if (pos < 1 || pos > length + 1) argError(this, "bad argument #2 to 'remove' (position out of bounds)");
      if (pos === length + 1) return [null];
      const value = table.rawGet(pos);
      for (let i = pos; i < length; i++) table.rawSet(i, table.rawGet(i + 1));
      table.rawSet(length, null);
      return [value];
    }));

    tableLib.rawSet('unpack', native('table.unpack', function (args) {
      const table = checkTable(this, args, 1, 'unpack');
      const start = args[1] === undefined || args[1] === null ? 1 : checkInteger(this, args, 2, 'unpack');
      const end = args[2] === undefined || args[2] === null ? table.rawLen() : checkInteger(this, args, 3, 'unpack');
      if (end - start >= 1000000) throw new LuaError('too many results to unpack');
      const out = [];
      for (let i = start; i <= end; i++) out.push(table.rawGet(i));
      return out;
    }));

    tableLib.rawSet('pack', native('table.pack', function (args) {
      const table = new LuaTable();
      for (let i = 0; i < args.length; i++) table.rawSet(i + 1, args[i]);
      table.rawSet('n', args.length);
      return [table];
    }));

    tableLib.rawSet('move', native('table.move', function (args) {
      const a1 = checkTable(this, args, 1, 'move');
      const f = checkInteger(this, args, 2, 'move');
      const e = checkInteger(this, args, 3, 'move');
      const t = checkInteger(this, args, 4, 'move');
      const a2 = args[4] === undefined || args[4] === null ? a1 : checkTable(this, args, 5, 'move');
      if (e >= f) {
        if (t > f && t <= e && a1 === a2) {
          for (let i = e; i >= f; i--) a2.rawSet(t + (i - f), a1.rawGet(i));
        } else {
          for (let i = f; i <= e; i++) a2.rawSet(t + (i - f), a1.rawGet(i));
        }
      }
      return [a2];
    }));

    tableLib.rawSet('sort', nativeGen('table.sort', function* (args) {
      const table = checkTable(this, args, 1, 'sort');
      const comparator = args[1] === undefined || args[1] === null ? null : args[1];
      if (comparator !== null && !(comparator instanceof LuaFunction) && !(comparator instanceof LuaNative) && this.getMetamethod(comparator, '__call') === null) {
        badArgument(this, 2, 'sort', 'function', comparator);
      }
      const length = table.rawLen();
      const values = [];
      for (let i = 1; i <= length; i++) values.push(table.rawGet(i));
      const interp = this;
      function* less(a, b) {
        if (comparator) {
          const results = yield* interp.call(comparator, [a, b]);
          return truthy(results.length ? results[0] : null);
        }
        return yield* interp.lessThan(a, b);
      }
      function* mergeSort(items) {
        if (items.length <= 1) return items;
        const middle = Math.floor(items.length / 2);
        const left = yield* mergeSort(items.slice(0, middle));
        const right = yield* mergeSort(items.slice(middle));
        const merged = [];
        let i = 0;
        let j = 0;
        while (i < left.length && j < right.length) {
          if (yield* less(right[j], left[i])) {
            merged.push(right[j]);
            j += 1;
          } else {
            merged.push(left[i]);
            i += 1;
          }
        }
        while (i < left.length) merged.push(left[i++]);
        while (j < right.length) merged.push(right[j++]);
        return merged;
      }
      const sorted = yield* mergeSort(values);
      for (let i = 0; i < sorted.length; i++) table.rawSet(i + 1, sorted[i]);
      return [];
    }));

    /* ---------------- math ---------------- */

    const mathLib = new LuaTable();

    function mathArg(args, index, fname) {
      return checkNumber(interp, args, index, fname);
    }

    mathLib.rawSet('abs', native('math.abs', function (args) { return [Math.abs(mathArg(args, 1, 'abs'))]; }));
    mathLib.rawSet('ceil', native('math.ceil', function (args) { return [Math.ceil(mathArg(args, 1, 'ceil'))]; }));
    mathLib.rawSet('floor', native('math.floor', function (args) { return [Math.floor(mathArg(args, 1, 'floor'))]; }));
    mathLib.rawSet('sqrt', native('math.sqrt', function (args) { return [Math.sqrt(mathArg(args, 1, 'sqrt'))]; }));
    mathLib.rawSet('sin', native('math.sin', function (args) { return [Math.sin(mathArg(args, 1, 'sin'))]; }));
    mathLib.rawSet('cos', native('math.cos', function (args) { return [Math.cos(mathArg(args, 1, 'cos'))]; }));
    mathLib.rawSet('tan', native('math.tan', function (args) { return [Math.tan(mathArg(args, 1, 'tan'))]; }));
    mathLib.rawSet('asin', native('math.asin', function (args) { return [Math.asin(mathArg(args, 1, 'asin'))]; }));
    mathLib.rawSet('acos', native('math.acos', function (args) { return [Math.acos(mathArg(args, 1, 'acos'))]; }));
    mathLib.rawSet('atan', native('math.atan', function (args) {
      const y = mathArg(args, 1, 'atan');
      const x = args[1] === undefined || args[1] === null ? 1 : checkNumber(this, args, 2, 'atan');
      return [Math.atan2(y, x)];
    }));
    mathLib.rawSet('exp', native('math.exp', function (args) { return [Math.exp(mathArg(args, 1, 'exp'))]; }));
    mathLib.rawSet('log', native('math.log', function (args) {
      const x = mathArg(args, 1, 'log');
      if (args[1] === undefined || args[1] === null) return [Math.log(x)];
      return [Math.log(x) / Math.log(checkNumber(this, args, 2, 'log'))];
    }));
    mathLib.rawSet('fmod', native('math.fmod', function (args) {
      const x = mathArg(args, 1, 'fmod');
      const y = checkNumber(this, args, 2, 'fmod');
      return [x % y];
    }));
    mathLib.rawSet('modf', native('math.modf', function (args) {
      const x = mathArg(args, 1, 'modf');
      const int = x >= 0 ? Math.floor(x) : Math.ceil(x);
      return [int, x - int];
    }));
    mathLib.rawSet('max', native('math.max', function (args) {
      if (!args.length) argError(this, "bad argument #1 to 'max' (number expected, got no value)");
      let best = checkNumber(this, args, 1, 'max');
      for (let i = 1; i < args.length; i++) {
        const value = checkNumber(this, args, i + 1, 'max');
        if (value > best) best = value;
      }
      return [best];
    }));
    mathLib.rawSet('min', native('math.min', function (args) {
      if (!args.length) argError(this, "bad argument #1 to 'min' (number expected, got no value)");
      let best = checkNumber(this, args, 1, 'min');
      for (let i = 1; i < args.length; i++) {
        const value = checkNumber(this, args, i + 1, 'min');
        if (value < best) best = value;
      }
      return [best];
    }));
    mathLib.rawSet('tointeger', native('math.tointeger', function (args) {
      if (typeof args[0] === 'number' && Number.isFinite(args[0]) && Math.trunc(args[0]) === args[0]) return [args[0]];
      if (typeof args[0] === 'string') {
        const value = parseLuaNumber(args[0]);
        if (value !== null && Math.trunc(value) === value) return [value];
      }
      return [null];
    }));
    mathLib.rawSet('type', native('math.type', function (args) {
      if (typeof args[0] !== 'number') return [null];
      return [Number.isInteger(args[0]) ? 'integer' : 'float'];
    }));
    mathLib.rawSet('ult', native('math.ult', function (args) {
      const x = mathArg(args, 1, 'ult');
      const y = checkNumber(this, args, 2, 'ult');
      if (!Number.isFinite(x) || Math.trunc(x) !== x) {
        argError(this, "bad argument #1 to 'ult' (number has no integer representation)");
      }
      if (!Number.isFinite(y) || Math.trunc(y) !== y) {
        argError(this, "bad argument #2 to 'ult' (number has no integer representation)");
      }
      const a = toLuaInteger(x);
      const b = toLuaInteger(y);
      return [BigInt.asUintN(64, a) < BigInt.asUintN(64, b)];
    }));
    mathLib.rawSet('random', native('math.random', function (args) {
      const random = this.nextRandom();
      if (!args.length) return [random];
      if (args.length === 1) {
        const upper = checkInteger(this, args, 1, 'random');
        if (upper === 0) return [Math.floor(random * 4294967296)];
        if (upper < 1) argError(this, "bad argument #1 to 'random' (interval is empty)");
        return [Math.floor(random * upper) + 1];
      }
      const lower = checkInteger(this, args, 1, 'random');
      const upper = checkInteger(this, args, 2, 'random');
      if (lower > upper) argError(this, "bad argument #2 to 'random' (interval is empty)");
      return [Math.floor(random * (upper - lower + 1)) + lower];
    }));
    mathLib.rawSet('randomseed', native('math.randomseed', function (args) {
      let x;
      if (args.length) x = checkNumber(this, args, 1, 'randomseed');
      else x = Date.now() % 2147483647;
      let y = args.length > 1 ? checkNumber(this, args, 2, 'randomseed') : 0;
      this.randomSeed = (Number(x) >>> 0) ^ Math.imul(Number(y) >>> 0, 0x9e3779b1);
      if (this.randomSeed === 0) this.randomSeed = 0x9e3779b9;
      this._randomExtra = 0x243f6a88;
      for (let i = 0; i < 4; i++) this.nextRandom();
      return [x, y];
    }));
    mathLib.rawSet('pi', Math.PI);
    mathLib.rawSet('huge', Infinity);
    mathLib.rawSet('maxinteger', 9223372036854775807);
    mathLib.rawSet('mininteger', -9223372036854775808);

    this.nextRandom = function () {
      let t = this.randomSeed += 0x6D2B79F5;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };

    /* ---------------- os ---------------- */

    const osLib = new LuaTable();
    const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const WEEKDAYS_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June',
      'July', 'August', 'September', 'October', 'November', 'December'];
    const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

    function strftime(date, format, utc) {
      const year = utc ? date.getUTCFullYear() : date.getFullYear();
      const month = (utc ? date.getUTCMonth() : date.getMonth()) + 1;
      const day = utc ? date.getUTCDate() : date.getDate();
      const hour = utc ? date.getUTCHours() : date.getHours();
      const minute = utc ? date.getUTCMinutes() : date.getMinutes();
      const second = utc ? date.getUTCSeconds() : date.getSeconds();
      const weekday = utc ? date.getUTCDay() : date.getDay();
      const start = utc ? Date.UTC(year, 0, 1) : new Date(year, 0, 1).getTime();
      const current = utc ? Date.UTC(year, month - 1, day) : new Date(year, month - 1, day).getTime();
      const dayOfYear = Math.floor((current - start) / 86400000) + 1;
      const pad = (n, w) => String(n).padStart(w || 2, '0');
      let out = '';
      for (let i = 0; i < format.length; i++) {
        if (format[i] !== '%') {
          out += format[i];
          continue;
        }
        i += 1;
        const spec = format[i];
        switch (spec) {
          case 'Y': out += pad(year, 4); break;
          case 'y': out += pad(year % 100); break;
          case 'm': out += pad(month); break;
          case 'd': out += pad(day); break;
          case 'H': out += pad(hour); break;
          case 'I': out += pad(hour % 12 === 0 ? 12 : hour % 12); break;
          case 'M': out += pad(minute); break;
          case 'S': out += pad(second); break;
          case 'p': out += hour < 12 ? 'AM' : 'PM'; break;
          case 'A': out += WEEKDAYS[weekday]; break;
          case 'a': out += WEEKDAYS_SHORT[weekday]; break;
          case 'B': out += MONTHS[month - 1]; break;
          case 'b': out += MONTHS_SHORT[month - 1]; break;
          case 'j': out += pad(dayOfYear, 3); break;
          case 'w': out += String(weekday); break;
          case 'u': out += String(weekday === 0 ? 7 : weekday); break;
          case 'U': out += pad(Math.floor((dayOfYear + 6 - weekday) / 7)); break;
          case 'W': out += pad(Math.floor((dayOfYear + 6 - ((weekday + 6) % 7)) / 7)); break;
          case 'c': out += `${WEEKDAYS_SHORT[weekday]} ${MONTHS_SHORT[month - 1]} ${pad(day)} ${pad(hour)}:${pad(minute)}:${pad(second)} ${pad(year, 4)}`; break;
          case 'x': out += `${pad(month)}/${pad(day)}/${pad(year % 100)}`; break;
          case 'X': out += `${pad(hour)}:${pad(minute)}:${pad(second)}`; break;
          case 'z': {
            if (utc) {
              out += '+0000';
            } else {
              const offset = -date.getTimezoneOffset();
              const sign = offset >= 0 ? '+' : '-';
              const abs = Math.abs(offset);
              out += sign + pad(Math.floor(abs / 60)) + pad(abs % 60);
            }
            break;
          }
          case 'Z': {
            if (utc) {
              out += 'UTC';
            } else {
              let name = '';
              try {
                const parts = new Intl.DateTimeFormat('en-US', { timeZoneName: 'short' }).formatToParts(date);
                const zone = parts.find(part => part.type === 'timeZoneName');
                name = zone ? zone.value : '';
              } catch (e) {
                name = '';
              }
              out += name || 'local';
            }
            break;
          }
          case '%': out += '%'; break;
          default: out += '%' + spec; break;
        }
      }
      return out;
    }

    osLib.rawSet('clock', native('os.clock', function () {
      const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
      return [(now - this._clockStart) / 1000];
    }));

    osLib.rawSet('time', native('os.time', function (args) {
      const value = args[0];
      if (value === undefined || value === null) return [Math.floor(Date.now() / 1000)];
      const table = checkTable(this, args, 1, 'time');
      const year = table.rawGet('year');
      const month = table.rawGet('month');
      const day = table.rawGet('day');
      if (typeof year !== 'number' || typeof month !== 'number' || typeof day !== 'number') {
        throw new LuaError("field 'year' missing in date table");
      }
      const hour = typeof table.rawGet('hour') === 'number' ? table.rawGet('hour') : 12;
      const min = typeof table.rawGet('min') === 'number' ? table.rawGet('min') : 0;
      const sec = typeof table.rawGet('sec') === 'number' ? table.rawGet('sec') : 0;
      const date = new Date(year, month - 1, day, hour, min, sec);
      return [Math.floor(date.getTime() / 1000)];
    }));

    osLib.rawSet('date', native('os.date', function (args) {
      let format = args[0] === undefined || args[0] === null ? '%c' : checkString(this, args, 1, 'date');
      let time = args[1] === undefined || args[1] === null ? Date.now() / 1000 : checkNumber(this, args, 2, 'date');
      let utc = false;
      if (format[0] === '!') {
        utc = true;
        format = format.slice(1);
      }
      const date = new Date(time * 1000);
      if (format === '*t') {
        const table = new LuaTable();
        const fields = utc ? {
          year: date.getUTCFullYear(), month: date.getUTCMonth() + 1, day: date.getUTCDate(),
          hour: date.getUTCHours(), min: date.getUTCMinutes(), sec: date.getUTCSeconds(),
          wday: date.getUTCDay() + 1, yday: Math.floor((Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()) - Date.UTC(date.getUTCFullYear(), 0, 1)) / 86400000) + 1,
          isdst: false,
        } : {
          year: date.getFullYear(), month: date.getMonth() + 1, day: date.getDate(),
          hour: date.getHours(), min: date.getMinutes(), sec: date.getSeconds(),
          wday: date.getDay() + 1,
          yday: Math.floor((new Date(date.getFullYear(), date.getMonth(), date.getDate()) - new Date(date.getFullYear(), 0, 1)) / 86400000) + 1,
          isdst: false,
        };
        for (const key in fields) table.rawSet(key, fields[key]);
        return [table];
      }
      return [strftime(date, format, utc)];
    }));

    osLib.rawSet('difftime', native('os.difftime', function (args) {
      const t2 = checkNumber(this, args, 1, 'difftime');
      const t1 = args[1] === undefined || args[1] === null ? 0 : checkNumber(this, args, 2, 'difftime');
      return [t2 - t1];
    }));

    osLib.rawSet('getenv', native('os.getenv', function () { return [null]; }));
    osLib.rawSet('setlocale', native('os.setlocale', function () { return ['C']; }));

    /* ---------------- io ---------------- */

    const ioLib = new LuaTable();

    ioLib.rawSet('write', native('io.write', function (args) {
      // 支持 io.write(...) 与 io.stdout:write(...)（第一个参数是文件对象时忽略）
      const values = args[0] === ioLib ? args.slice(1) : args;
      let text = '';
      for (const value of values) {
        if (typeof value === 'string') text += value;
        else if (typeof value === 'number') text += formatNumber(value);
        else throw new LuaError(`bad argument to 'write' (string expected, got ${typeName(value)})`);
      }
      this.write(text);
      return [ioLib];
    }));

    ioLib.rawSet('read', native('io.read', function (args) {
      const formats = args[0] === ioLib ? (args.length > 1 ? args.slice(1) : ['l']) : (args.length ? args : ['l']);
      const results = [];
      for (const rawFormat of formats) {
        let format = rawFormat;
        if (typeof format === 'string') {
          if (format[0] === '*') format = format.slice(1);
          if (format === 'l' || format === 'L') {
            const line = this.readStdin();
            if (line === null) {
              results.push(null);
              break;
            }
            results.push(format === 'L' ? line + '\n' : line);
          } else if (format === 'a') {
            const rest = this.stdin.slice(this.stdinPos);
            this.stdinPos = this.stdin.length;
            results.push(rest);
          } else if (format === 'n') {
            const rest = this.stdin.slice(this.stdinPos);
            const match = /^\s*([+-]?(?:0[xX][0-9a-fA-F]+|\d+\.?\d*(?:[eE][+-]?\d+)?|\.\d+))/.exec(rest);
            if (!match) {
              results.push(null);
              break;
            }
            this.stdinPos += match[0].length;
            results.push(parseLuaNumber(match[1]));
          } else {
            throw new LuaError(`invalid format '${format}' to 'read'`);
          }
        } else if (typeof format === 'number') {
          const count = Math.trunc(format);
          if (count === 0) {
            results.push(this.stdinPos >= this.stdin.length ? null : '');
          } else {
            const text = this.readStdin(count);
            if (text === null || text === '') {
              results.push(null);
              break;
            }
            results.push(text);
          }
        } else {
          throw new LuaError(`bad argument to 'read' (invalid format)`);
        }
      }
      return results;
    }));

    ioLib.rawSet('flush', native('io.flush', function () { return [ioLib]; }));
    ioLib.rawSet('stdin', ioLib);
    ioLib.rawSet('stdout', ioLib);
    ioLib.rawSet('stderr', ioLib);
    ioLib.rawSet('write', ioLib.rawGet('write'));

    /* ---------------- coroutine ---------------- */

    const coroutineLib = new LuaTable();

    coroutineLib.rawSet('create', native('coroutine.create', function (args) {
      const fn = args[0];
      if (!(fn instanceof LuaFunction) && !(fn instanceof LuaNative) && this.getMetamethod(fn, '__call') === null) {
        badArgument(this, 1, 'create', 'function', fn);
      }
      return [new LuaCoroutine(fn)];
    }));

    coroutineLib.rawSet('resume', native('coroutine.resume', function (args) {
      const co = args[0];
      if (!(co instanceof LuaCoroutine)) badArgument(this, 1, 'resume', 'thread', co);
      return this.resumeCoroutine(co, args.slice(1));
    }));

    coroutineLib.rawSet('yield', nativeGen('coroutine.yield', function* (args) {
      if (!this.currentCoroutine) throw new LuaError('attempt to yield from outside a coroutine');
      return yield* this.yieldValues(args);
    }));

    coroutineLib.rawSet('status', native('coroutine.status', function (args) {
      const co = args[0];
      if (!(co instanceof LuaCoroutine)) badArgument(this, 1, 'status', 'thread', co);
      if (co === this.currentCoroutine) return ['running'];
      if (co === this.mainThread) return [this.currentCoroutine === null ? 'running' : 'normal'];
      return [co.state];
    }));

    coroutineLib.rawSet('running', native('coroutine.running', function () {
      return [this.currentCoroutine === null ? this.mainThread : this.currentCoroutine, this.currentCoroutine === null];
    }));

    coroutineLib.rawSet('isyieldable', native('coroutine.isyieldable', function () {
      return [this.currentCoroutine !== null];
    }));

    coroutineLib.rawSet('close', native('coroutine.close', function (args) {
      const co = args[0];
      if (!(co instanceof LuaCoroutine)) badArgument(this, 1, 'close', 'thread', co);
      if (co === this.currentCoroutine) return [false, 'cannot close a running coroutine'];
      if (co.state === 'dead') return [true];
      try {
        if (co.generator) co.generator.return();
      } catch (err) {
        return [false, errorValue(err)];
      }
      co.state = 'dead';
      return [true];
    }));

    coroutineLib.rawSet('wrap', native('coroutine.wrap', function (args) {
      const fn = args[0];
      if (!(fn instanceof LuaFunction) && !(fn instanceof LuaNative) && this.getMetamethod(fn, '__call') === null) {
        badArgument(this, 1, 'wrap', 'function', fn);
      }
      const co = new LuaCoroutine(fn);
      const interpRef = this;
      const wrapper = nativeGen('coroutine.wrap', function* (callArgs) {
        const result = interpRef.resumeCoroutine(co, callArgs);
        if (!result[0]) throw new LuaError(result[1]);
        return result.slice(1);
      });
      return [wrapper];
    }));

    /* ---------------- debug ---------------- */

    const debugLib = new LuaTable();
    debugLib.rawSet('traceback', native('debug.traceback', function (args) {
      const message = args[0] === undefined ? '' : args[0];
      const level = args[1] === undefined ? 1 : checkInteger(this, args, 2, 'traceback');
      return [this.traceback(message, level)];
    }));
    debugLib.rawSet('getmetatable', native('debug.getmetatable', function (args) {
      const value = args[0];
      if (value instanceof LuaTable) return [value.metatable];
      if (typeof value === 'string') return [this.stringMetatable];
      return [null];
    }));
    debugLib.rawSet('setmetatable', native('debug.setmetatable', function (args) {
      const table = checkTable(this, args, 1, 'setmetatable');
      const metatable = args[1] === undefined || args[1] === null ? null : args[1];
      if (metatable !== null && !(metatable instanceof LuaTable)) badArgument(this, 2, 'setmetatable', 'nil or table', metatable);
      table.metatable = metatable;
      return [table];
    }));

    /* ---------------- 挂载全局库 ---------------- */

    def('string', stringLib);
    def('table', tableLib);
    def('math', mathLib);
    def('os', osLib);
    def('io', ioLib);
    def('coroutine', coroutineLib);
    def('utf8', utf8Lib);
    def('debug', debugLib);
    def('unpack', tableLib.rawGet('unpack'));

    // 字符串元表：允许 ("abc"):upper()
    this.stringMetatable.rawSet('__index', stringLib);

    // 标准库之间的引用
    def('_G', globals);
    def('arg', (function () {
      const table = new LuaTable();
      table.rawSet(0, 'main.lua');
      return table;
    })());

    def('warn', native('warn', function (args) {
      const parts = [];
      for (const value of args) parts.push(typeof value === 'string' ? value : this.display(value));
      this.write('Lua warning: ' + parts.join('') + '\n');
      return [];
    }));
  };

  /* =====================================================================
   * 便捷接口
   * =================================================================== */

  LuaJS.create = function (options) {
    return new Interpreter(options || {});
  };

  LuaJS.run = function (source, options) {
    options = options || {};
    const chunks = [];
    const interpreter = new Interpreter(Object.assign({}, options, {
      stdout: function (text) {
        chunks.push(text);
        if (options.stdout) options.stdout(text);
      },
    }));
    const start = typeof performance !== 'undefined' ? performance.now() : Date.now();
    try {
      const values = interpreter.execute(source, options);
      const end = typeof performance !== 'undefined' ? performance.now() : Date.now();
      return {
        ok: true,
        output: chunks.join(''),
        values,
        steps: interpreter.steps,
        time: end - start,
      };
    } catch (err) {
      const end = typeof performance !== 'undefined' ? performance.now() : Date.now();
      return {
        ok: false,
        output: chunks.join(''),
        error: errorMessage(err),
        value: errorValue(err),
        traceback: err && err.luaTraceback ? err.luaTraceback : '',
        steps: interpreter.steps,
        time: end - start,
      };
    }
  };

  return LuaJS;
});