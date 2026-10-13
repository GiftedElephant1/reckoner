/* Reckoner engine: tokens, parsing, evaluation, formatting, sheet operations and the
   token editor. Pure logic with no DOM access, so it runs unchanged in the app, in Node
   tests and in the in-app self-test. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.ReckonerEngine = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // ---------------------------------------------------------------- tokens

  /* Lookup objects have no prototype: a key such as "constructor" or "toString", typed as a
     symbol or read from a file, must never match something inherited. */
  function dict() { return Object.create(null); }
  function table(src) { var d = dict(); for (var k in src) if (Object.prototype.hasOwnProperty.call(src, k)) d[k] = src[k]; return d; }

  var T = {
    num: function (v, fixed) { var t = { t: 'num', v: String(v) }; if (fixed) t.fixed = true; return t; },
    ref: function (id) { return { t: 'ref', id: id }; },
    name: function (v) { return { t: 'name', v: v }; },
    konst: function (v) { return { t: 'const', v: v }; },
    op: function (v) { return { t: 'op', v: v }; },
    cmp: function (v) { return { t: 'cmp', v: v }; },
    neg: function () { return { t: 'neg' }; },
    pct: function () { return { t: 'pct' }; },
    fact: function () { return { t: 'fact' }; },
    lp: function () { return { t: 'lp' }; },
    rp: function () { return { t: 'rp' }; },
    fn: function (v) { return { t: 'fn', v: v }; },
    sep: function () { return { t: 'sep' }; },
    above: function () { return { t: 'above' }; }
  };

  function cloneTokens(tokens) {
    var out = [];
    for (var i = 0; i < tokens.length; i++) {
      var s = tokens[i], d = { t: s.t };
      if (s.v !== undefined) d.v = s.v;
      if (s.id !== undefined) d.id = s.id;
      if (s.fixed) d.fixed = true;
      out.push(d);
    }
    return out;
  }

  var NUM_RE = /^-?(\d+\.?\d*|\.\d+)$/;
  function isCompleteNum(v) { return NUM_RE.test(v); }

  var OP_CLASS = table({ '+': 1, '-': 1, '*': 2, '/': 2, '^': 3 });
  var OP_SIGN = table({ '+': '+', '-': '\u2212', '*': '\u00d7', '/': '\u00f7', '^': '^' });
  var CMP_SIGN = table({ '<': '<', '>': '>', '<=': '\u2264', '>=': '\u2265', '=': '=', '!=': '\u2260' });

  // ---------------------------------------------------------------- functions

  function CalcError(code) { this.code = code; }

  function mean(a) { var s = 0; for (var i = 0; i < a.length; i++) s += a[i]; return s / a.length; }
  function variance(a, sample) {
    var m = mean(a), s = 0;
    for (var i = 0; i < a.length; i++) s += (a[i] - m) * (a[i] - m);
    return s / (sample ? a.length - 1 : a.length);
  }
  function needPos(x) { if (!(x > 0)) throw new CalcError('domain'); return x; }

  /* agg: takes a flattened list of numbers (and accepts the "all rows above" token).
     min/max count arguments, Infinity for unlimited. */
  var FUNCS = table({
    sqrt:   { label: '\u221a', min: 1, max: 1, f: function (x) { if (x < 0) throw new CalcError('domain'); return Math.sqrt(x); } },
    cbrt:   { label: '\u221b', min: 1, max: 1, f: function (x) { return x < 0 ? -Math.pow(-x, 1 / 3) : Math.pow(x, 1 / 3); } },
    abs:    { label: 'abs', min: 1, max: 1, f: function (x) { return Math.abs(x); } },
    ln:     { label: 'ln', min: 1, max: 1, f: function (x) { return Math.log(needPos(x)); } },
    log:    { label: 'log', min: 1, max: 1, f: function (x) { return Math.log(needPos(x)) / Math.LN10; } },
    exp:    { label: 'exp', min: 1, max: 1, f: function (x) { return Math.exp(x); } },
    sin:    { label: 'sin', min: 1, max: 1, trig: 'in', f: function (x) { return Math.sin(x); } },
    cos:    { label: 'cos', min: 1, max: 1, trig: 'in', f: function (x) { return Math.cos(x); } },
    tan:    { label: 'tan', min: 1, max: 1, trig: 'in', f: function (x) { return Math.tan(x); } },
    asin:   { label: 'asin', min: 1, max: 1, trig: 'out', f: function (x) { if (x < -1 || x > 1) throw new CalcError('domain'); return Math.asin(x); } },
    acos:   { label: 'acos', min: 1, max: 1, trig: 'out', f: function (x) { if (x < -1 || x > 1) throw new CalcError('domain'); return Math.acos(x); } },
    atan:   { label: 'atan', min: 1, max: 1, trig: 'out', f: function (x) { return Math.atan(x); } },
    round:  { label: 'round', min: 1, max: 2, f: function (x, d) { return roundDec(x, clampInt(d === undefined ? 0 : d, 0, 10), 'round'); } },
    floor:  { label: 'floor', min: 1, max: 1, f: function (x) { return Math.floor(cleanNum(x)); } },
    ceil:   { label: 'ceil', min: 1, max: 1, f: function (x) { return Math.ceil(cleanNum(x)); } },
    mod:    { label: 'mod', min: 2, max: 2, f: function (a, b) { if (b === 0) throw new CalcError('div0'); return a - b * Math.floor(a / b); } },
    min:    { label: 'min', min: 1, max: Infinity, agg: true, f: function (a) { if (!a.length) return null; return Math.min.apply(null, a); } },
    max:    { label: 'max', min: 1, max: Infinity, agg: true, f: function (a) { if (!a.length) return null; return Math.max.apply(null, a); } },
    sum:    { label: 'sum', min: 1, max: Infinity, agg: true, f: function (a) { var s = 0; for (var i = 0; i < a.length; i++) s += a[i]; return s; } },
    avg:    { label: 'avg', min: 1, max: Infinity, agg: true, f: function (a) { if (!a.length) return null; return mean(a); } },
    median: { label: 'median', min: 1, max: Infinity, agg: true, f: function (a) {
      if (!a.length) return null;
      var s = a.slice().sort(function (x, y) { return x - y; }), m = s.length >> 1;
      return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
    } },
    count:  { label: 'count', min: 1, max: Infinity, agg: true, f: function (a) { return a.length; } },
    sd:     { label: 'sd', min: 1, max: Infinity, agg: true, f: function (a) { if (a.length < 2) return null; return Math.sqrt(variance(a, true)); } },
    sdp:    { label: 'sdp', min: 1, max: Infinity, agg: true, f: function (a) { if (!a.length) return null; return Math.sqrt(variance(a, false)); } },
    'if':   { label: 'if', min: 3, max: 3, lazy: true }
  });

  function clampInt(x, lo, hi) { x = Math.round(x); return x < lo ? lo : x > hi ? hi : x; }

  // ---------------------------------------------------------------- parser

  function parse(tokens, opts) {
    opts = opts || {};
    var i = 0, n = tokens.length;
    function peek() { return i < n ? tokens[i] : null; }
    function fail(code) { var e = new Error(code); e.syntax = true; throw e; }
    function closeParen() {
      var t = peek();
      if (t && t.t === 'rp') { i++; return; }
      if (!t && opts.autoClose) return;
      fail('paren');
    }
    function expr() { return cmpE(); }
    function cmpE() {
      var l = addE();
      for (;;) {
        var t = peek();
        if (t && t.t === 'cmp') { i++; l = { k: 'cmp', op: t.v, l: l, r: addE() }; }
        else return l;
      }
    }
    function addE() {
      var l = mulE();
      for (;;) {
        var t = peek();
        if (t && t.t === 'op' && OP_CLASS[t.v] === 1) {
          i++;
          var r = mulE();
          // "200 + 10%" means 10 percent of the left side, as on a pocket calculator
          l = r.k === 'pct' ? { k: 'addpct', op: t.v, l: l, p: r.x } : { k: 'bin', op: t.v, l: l, r: r };
        } else return l;
      }
    }
    function mulE() {
      var l = unary();
      for (;;) {
        var t = peek();
        if (t && t.t === 'op' && OP_CLASS[t.v] === 2) { i++; l = { k: 'bin', op: t.v, l: l, r: unary() }; }
        else return l;
      }
    }
    function unary() {
      var t = peek();
      if (t && t.t === 'neg') { i++; return { k: 'neg', x: unary() }; }
      return power();
    }
    function power() {
      var b = postfix(), t = peek();
      if (t && t.t === 'op' && t.v === '^') { i++; return { k: 'bin', op: '^', l: b, r: unary() }; }
      return b;
    }
    function postfix() {
      var x = primary();
      for (;;) {
        var t = peek();
        if (t && t.t === 'pct') { i++; x = { k: 'pct', x: x }; }
        else if (t && t.t === 'fact') { i++; x = { k: 'fact', x: x }; }
        else return x;
      }
    }
    function primary() {
      var t = peek();
      if (!t) fail('incomplete');
      switch (t.t) {
        case 'num':
          if (!isCompleteNum(t.v)) fail('number');
          i++; return { k: 'num', v: parseFloat(t.v) };
        case 'ref': i++; return { k: 'ref', id: t.id };
        case 'name': i++; return { k: 'name', v: t.v };
        case 'const': i++; return { k: 'const', v: t.v };
        case 'above': i++; return { k: 'above' };
        case 'lp': { i++; var e = expr(); closeParen(); return { k: 'grp', x: e }; }
        case 'fn': {
          var meta = FUNCS[t.v];
          if (!meta) fail('function');
          i++;
          var args = [expr()];
          while (peek() && peek().t === 'sep') { i++; args.push(expr()); }
          closeParen();
          if (args.length < meta.min || args.length > meta.max) fail('args');
          for (var a = 0; a < args.length; a++) if (args[a].k === 'above' && !meta.agg) fail('above');
          return { k: 'call', fn: t.v, args: args };
        }
        default: fail('unexpected');
      }
    }
    function checkAbove(node, allowed) {
      if (!node || typeof node !== 'object') return;
      if (node.k === 'above') { if (!allowed) fail('above'); return; }
      if (node.k === 'call') { for (var a = 0; a < node.args.length; a++) checkAbove(node.args[a], !!FUNCS[node.fn].agg); return; }
      checkAbove(node.x, false); checkAbove(node.l, false); checkAbove(node.r, false); checkAbove(node.p, false);
    }
    try {
      if (!n) fail('empty');
      var ast = expr();
      if (i < n) fail('trailing');
      checkAbove(ast, false);
      return { ok: true, ast: ast };
    } catch (e) {
      if (e && e.syntax) return { ok: false, error: e.message };
      throw e;
    }
  }

  // ---------------------------------------------------------------- evaluation

  function factorial(x) {
    var r = Math.round(x);
    if (Math.abs(x - r) > 1e-9 || r < 0 || r > 170) throw new CalcError('domain');
    var p = 1;
    for (var i = 2; i <= r; i++) p *= i;
    return p;
  }

  function nearlyEqual(a, b) {
    if (a === b) return true;
    var d = Math.abs(a - b), m = Math.max(Math.abs(a), Math.abs(b));
    return d <= m * 1e-12 || d < 1e-300;
  }

  /* Returns a finite number, or null when something the formula needs has no value yet.
     Throws CalcError for real mistakes (division by zero and the like). */
  function evaluate(node, ctx) {
    var l, r, x, i;
    switch (node.k) {
      case 'num': return node.v;
      case 'ref': return ctx.ref(node.id);
      case 'name': return ctx.name(node.v);
      case 'const': return node.v === 'pi' ? Math.PI : Math.E;
      case 'grp': return evaluate(node.x, ctx);
      case 'neg': x = evaluate(node.x, ctx); return x === null ? null : -x;
      case 'pct': x = evaluate(node.x, ctx); return x === null ? null : x / 100;
      case 'fact': x = evaluate(node.x, ctx); return x === null ? null : factorial(x);
      case 'addpct':
        l = evaluate(node.l, ctx); r = evaluate(node.p, ctx);
        if (l === null || r === null) return null;
        return check(node.op === '+' ? l + l * r / 100 : l - l * r / 100);
      case 'bin':
        l = evaluate(node.l, ctx); r = evaluate(node.r, ctx);
        if (l === null || r === null) return null;
        switch (node.op) {
          case '+': return check(l + r);
          case '-': return check(l - r);
          case '*': return check(l * r);
          case '/': if (r === 0) throw new CalcError('div0'); return check(l / r);
          default: return check(Math.pow(l, r));
        }
      case 'cmp':
        l = evaluate(node.l, ctx); r = evaluate(node.r, ctx);
        if (l === null || r === null) return null;
        switch (node.op) {
          case '<': return l < r && !nearlyEqual(l, r) ? 1 : 0;
          case '>': return l > r && !nearlyEqual(l, r) ? 1 : 0;
          case '<=': return l < r || nearlyEqual(l, r) ? 1 : 0;
          case '>=': return l > r || nearlyEqual(l, r) ? 1 : 0;
          case '=': return nearlyEqual(l, r) ? 1 : 0;
          default: return nearlyEqual(l, r) ? 0 : 1;
        }
      case 'call': {
        var meta = FUNCS[node.fn];
        if (node.fn === 'if') {
          var c = evaluate(node.args[0], ctx);
          if (c === null) return null;
          return evaluate(c !== 0 ? node.args[1] : node.args[2], ctx);
        }
        if (meta.agg) {
          var list = [], unknown = false;
          for (i = 0; i < node.args.length; i++) {
            if (node.args[i].k === 'above') { list = list.concat(ctx.above()); continue; }
            x = evaluate(node.args[i], ctx);
            if (x === null) unknown = true; else list.push(x);
          }
          if (unknown) return null;
          x = meta.f(list);
          return x === null ? null : check(x);
        }
        var vals = [];
        for (i = 0; i < node.args.length; i++) {
          x = evaluate(node.args[i], ctx);
          if (x === null) return null;
          vals.push(x);
        }
        var deg = ctx.angle !== 'rad';
        if (meta.trig === 'in' && deg) vals[0] = vals[0] * Math.PI / 180;
        x = meta.f.apply(null, vals);
        if (meta.trig === 'out' && deg) x = x * 180 / Math.PI;
        if (meta.trig === 'in') x = snapTrig(x);
        return check(x);
      }
      case 'above': throw new CalcError('syntax');
    }
    throw new CalcError('syntax');
  }

  function check(x) {
    if (x !== x) throw new CalcError('domain');
    if (x === Infinity || x === -Infinity) throw new CalcError('overflow');
    return x;
  }
  // sin(180 degrees) should read 0, not 1.2e-16
  function snapTrig(x) { if (Math.abs(x) < 1e-15) return 0; if (Math.abs(x) > 1e15) throw new CalcError('domain'); return x; }

  var parseCache = typeof WeakMap === 'function' ? new WeakMap() : null;
  function parseCached(tokens) {
    if (!parseCache) return parse(tokens, { autoClose: true });
    var hit = parseCache.get(tokens);
    if (!hit) { hit = parse(tokens, { autoClose: true }); parseCache.set(tokens, hit); }
    return hit;
  }

  function evalTokens(tokens, ctx, fresh) {
    var p = fresh ? parse(tokens, { autoClose: true }) : parseCached(tokens);
    if (!p.ok) return { status: 'error', code: 'syntax' };
    try {
      var v = evaluate(p.ast, ctx);
      return v === null ? { status: 'unknown' } : { status: 'ok', value: v };
    } catch (e) {
      if (e instanceof CalcError) return { status: 'error', code: e.code };
      throw e;
    }
  }

  function fieldIndex(sheet) {
    var byId = dict(), bySym = dict(), pos = dict();
    for (var i = 0; i < sheet.fields.length; i++) {
      var f = sheet.fields[i];
      byId[f.id] = f; pos[f.id] = i;
      if (bySym[f.symbol] === undefined) bySym[f.symbol] = f;
    }
    return { byId: byId, bySym: bySym, pos: pos };
  }

  function hasValue(f) { return typeof f.value === 'number' && isFinite(f.value); }

  /* Works out every field. `draft`, when given, is an unsaved expression evaluated as if it
     were a new field at position draft.at (default: the end). */
  function computeSheet(sheet, settings, draft) {
    var ix = fieldIndex(sheet), res = dict(), mark = dict();
    var angle = settings && settings.angle;
    function aboveOf(limit) {
      var out = [];
      for (var i = 0; i < limit && i < sheet.fields.length; i++) {
        var f = sheet.fields[i];
        if (f.kind === 'input' && hasValue(f)) out.push(f.value);
      }
      return out;
    }
    function ctxFor(self, limit) {
      return {
        angle: angle,
        ref: function (id) {
          if (self && id === self.id) throw new CalcError('cycle');
          var r = get(id);
          if (r.status === 'ok') return r.value;
          if (r.status === 'unknown') return null;
          throw new CalcError(r.code === 'cycle' ? 'cycle' : 'dep');
        },
        name: function (sym) {
          var f = ix.bySym[sym];
          if (!f) return null;
          return this.ref(f.id);
        },
        above: function () { return aboveOf(limit); }
      };
    }
    function get(id) {
      var f = ix.byId[id];
      if (!f) return { status: 'unknown' };
      if (mark[id] === 2) return res[id];
      if (mark[id] === 1) return { status: 'error', code: 'cycle' };
      mark[id] = 1;
      var r;
      if (f.kind === 'input') r = hasValue(f) ? { status: 'ok', value: f.value } : { status: 'unknown' };
      else r = evalTokens(f.formula || [], ctxFor(f, ix.pos[id]));
      mark[id] = 2; res[id] = r;
      return r;
    }
    for (var i = 0; i < sheet.fields.length; i++) get(sheet.fields[i].id);
    var out = { byId: res };
    if (draft) {
      var limit = draft.at === undefined || draft.at === null ? sheet.fields.length : draft.at;
      var self = draft.editId ? ix.byId[draft.editId] : null;
      if (self) limit = ix.pos[self.id];
      out.draft = evalTokens(draft.tokens, ctxFor(self, limit), true);
    }
    return out;
  }

  // ---------------------------------------------------------------- number formatting

  function cleanNum(v) { return isFinite(v) ? Number(v.toPrecision(15)) : v; }

  /* A non-negative number as plain digits, never in exponent form ("0.0000001", not "1e-7"). */
  function plainNumber(v) {
    var s = String(cleanNum(Math.abs(v)));
    var m = /^(\d+)(?:\.(\d+))?e([+-]\d+)$/.exec(s);
    if (!m) return s;
    var digits = m[1] + (m[2] || ''), point = m[1].length + parseInt(m[3], 10);
    if (point <= 0) return '0.' + new Array(1 - point).join('0') + digits;
    if (point >= digits.length) return digits + new Array(point - digits.length + 1).join('0');
    return digits.slice(0, point) + '.' + digits.slice(point);
  }

  function roundDec(v, d, mode) {
    var c = cleanNum(v);
    if (!isFinite(c) || c === 0) return c;
    var s = String(c), scaled;
    scaled = s.indexOf('e') >= 0 ? c * Math.pow(10, d) : Number(s + 'e' + d);
    var r;
    if (mode === 'floor') r = Math.floor(scaled);
    else if (mode === 'ceil') r = Math.ceil(scaled);
    else r = (scaled < 0 ? -1 : 1) * Math.round(Math.abs(scaled));
    if (Math.abs(r) >= 1e21) return r / Math.pow(10, d);
    var out = Number(r + 'e-' + d);
    return out === 0 ? 0 : out;
  }

  var NUM_FORMATS = table({
    'us': { dec: '.', grp: ',' },
    'eu': { dec: ',', grp: '.' },
    'fr': { dec: ',', grp: '\u202f' },
    'ch': { dec: '.', grp: '\u2019' },
    'plain': { dec: '.', grp: '' }
  });

  function detectNumFormat() {
    try {
      var parts = new Intl.NumberFormat().formatToParts(12345.6), dec = '.', grp = ',';
      for (var i = 0; i < parts.length; i++) {
        if (parts[i].type === 'decimal') dec = parts[i].value;
        if (parts[i].type === 'group') grp = parts[i].value;
      }
      if (dec === ',') return /[.]/.test(grp) ? 'eu' : 'fr';
      if (grp === '\u2019' || grp === "'") return 'ch';
      return 'us';
    } catch (e) { return 'us'; }
  }

  function numFormatOf(settings) {
    var key = settings && settings.numFmt;
    if (!key || key === 'auto') key = detectNumFormat();
    var f = NUM_FORMATS[key] || NUM_FORMATS.us;
    return { dec: f.dec, grp: settings && settings.group === false ? '' : f.grp };
  }

  function groupInt(digits, sep) {
    if (!sep || digits.length < 4) return digits;
    var out = '';
    for (var i = 0; i < digits.length; i++) {
      if (i && (digits.length - i) % 3 === 0) out += sep;
      out += digits.charAt(i);
    }
    return out;
  }

  var MINUS = '\u2212';

  /* fmt: {minDec, maxDec, trunc}. Returns display text with a real minus sign. */
  function formatNumber(v, fmt, settings, plain) {
    if (typeof v !== 'number' || v !== v) return '?';
    if (v === Infinity || v === -Infinity) return '?';
    var nf = plain ? { dec: '.', grp: '' } : numFormatOf(settings);
    var minus = plain ? '-' : MINUS;
    var maxDec = clampInt(fmt && fmt.maxDec !== undefined ? fmt.maxDec : 2, 0, 10);
    var minDec = clampInt(fmt && fmt.minDec !== undefined ? fmt.minDec : 0, 0, maxDec);
    var mode = (fmt && fmt.trunc) || 'round';
    var c = cleanNum(v);
    if (Math.abs(c) >= 1e15) {
      var ex = c.toExponential(Math.min(maxDec, 6)).split('e');
      var mant = ex[0].replace(/\.?0+$/, '').replace('-', minus).replace('.', nf.dec);
      return mant + 'e' + ex[1].replace('+', '').replace('-', minus);
    }
    var r = roundDec(c, maxDec, mode);
    var neg = r < 0;
    var s = Math.abs(r).toFixed(maxDec), dot = s.indexOf('.');
    var ip = dot < 0 ? s : s.slice(0, dot), fp = dot < 0 ? '' : s.slice(dot + 1);
    while (fp.length > minDec && fp.charAt(fp.length - 1) === '0') fp = fp.slice(0, -1);
    return (neg ? minus : '') + groupInt(ip, nf.grp) + (fp ? nf.dec + fp : '');
  }

  /* Text of a number while it is being typed: keeps a trailing point and zeros. */
  function formatTyped(text, settings) {
    if (text === '' || text === undefined || text === null) return '';
    var nf = numFormatOf(settings);
    var neg = text.charAt(0) === '-', body = neg ? text.slice(1) : text;
    var dot = body.indexOf('.');
    var ip = dot < 0 ? body : body.slice(0, dot), fp = dot < 0 ? null : body.slice(dot + 1);
    return (neg ? MINUS : '') + groupInt(ip, nf.grp) + (fp === null ? '' : nf.dec + fp);
  }

  function fieldFormat(field, settings) {
    var out = field.kind === 'output';
    return {
      minDec: field.minDec !== undefined && field.minDec !== null ? field.minDec : (out && settings ? settings.defMinDec || 0 : 0),
      maxDec: field.maxDec !== undefined && field.maxDec !== null ? field.maxDec : (out ? (settings && settings.defMaxDec !== undefined ? settings.defMaxDec : 2) : 10),
      trunc: field.trunc || 'round'
    };
  }

  var ERROR_TEXT = table({
    div0: 'Can\u2019t divide by zero',
    domain: 'That has no real answer',
    overflow: 'The number is too large',
    cycle: 'This formula depends on itself',
    dep: 'A field it uses has a problem',
    syntax: 'The formula is incomplete'
  });

  /* -> {state:'ok'|'empty'|'error', text, prefix, suffix, negative, reason} */
  function displayField(field, result, settings) {
    var d = { state: 'empty', text: '?', prefix: field.prefix || '', suffix: field.suffix || '', negative: false, reason: '' };
    if (!result || result.status === 'unknown') {
      d.reason = field.kind === 'input' ? 'No value yet' : 'Waiting for a value';
      return d;
    }
    if (result.status === 'error') { d.state = 'error'; d.reason = ERROR_TEXT[result.code] || ERROR_TEXT.syntax; return d; }
    var fmt = fieldFormat(field, settings);
    d.state = 'ok';
    d.text = formatNumber(result.value, fmt, settings);
    d.negative = roundDec(result.value, fmt.maxDec, fmt.trunc) < 0;
    return d;
  }

  // ---------------------------------------------------------------- text <-> tokens

  function displayFnName(v) { return (FUNCS[v] && FUNCS[v].label) || v; }

  /* Formula as readable text with symbols, e.g. "(a \u2212 b) \u00d7 c". opts.ascii gives "(a - b) * c". */
  function tokensToText(tokens, sheet, opts) {
    opts = opts || {};
    var ix = sheet ? fieldIndex(sheet) : null, parts = [], i, t;
    function sym(id) { var f = ix && ix.byId[id]; return f ? f.symbol : '?'; }
    for (i = 0; i < tokens.length; i++) {
      t = tokens[i];
      switch (t.t) {
        case 'num': parts.push(opts.ascii ? t.v : formatTyped(t.v, opts.settings)); break;
        case 'ref': parts.push(sym(t.id)); break;
        case 'name': parts.push(t.v); break;
        case 'const': parts.push(opts.ascii ? (t.v === 'pi' ? '@pi' : '@e') : (t.v === 'pi' ? '\u03c0' : '\u212f')); break;
        case 'op': parts.push(t.v === '^' ? '^' : ' ' + (opts.ascii ? t.v : OP_SIGN[t.v]) + ' '); break;
        case 'cmp': parts.push(' ' + (opts.ascii ? t.v : CMP_SIGN[t.v]) + ' '); break;
        case 'neg': parts.push(opts.ascii ? '-' : MINUS); break;
        case 'pct': parts.push('%'); break;
        case 'fact': parts.push('!'); break;
        case 'lp': parts.push('('); break;
        case 'rp': parts.push(')'); break;
        case 'fn': parts.push((opts.ascii ? t.v : displayFnName(t.v)) + '('); break;
        case 'sep': parts.push(', '); break;
        case 'above': parts.push(opts.ascii ? '@above' : 'all above'); break;
      }
    }
    return parts.join('').replace(/\s+/g, ' ').trim();
  }

  /* Parses formula text ("P * (1 + r/100) ^ t") into tokens; identifiers stay as names. */
  function textToTokens(str) {
    var out = [], i = 0, n = str.length;
    function expectOperand() {
      if (!out.length) return true;
      var t = out[out.length - 1].t;
      return t === 'op' || t === 'cmp' || t === 'neg' || t === 'lp' || t === 'fn' || t === 'sep';
    }
    while (i < n) {
      var ch = str.charAt(i), m;
      if (/\s/.test(ch)) { i++; continue; }
      m = /^(\d+\.?\d*|\.\d+)/.exec(str.slice(i));
      if (m) { out.push(T.num(m[1], true)); i += m[1].length; continue; }
      m = /^@(pi|e|above)\b/.exec(str.slice(i));
      if (m) { out.push(m[1] === 'above' ? T.above() : T.konst(m[1])); i += m[0].length; continue; }
      if (ch === '\u03c0') { out.push(T.konst('pi')); i++; continue; }
      m = /^[A-Za-z][A-Za-z0-9]*/.exec(str.slice(i));
      if (m) {
        var id = m[0], rest = str.slice(i + id.length), sp = /^\s*\(/.exec(rest);
        if (sp && FUNCS[id]) { out.push(T.fn(id)); i += id.length + sp[0].length; }
        else { out.push(T.name(id)); i += id.length; }
        continue;
      }
      m = /^(<=|>=|!=|<>|==|\u2264|\u2265|\u2260|<|>|=)/.exec(str.slice(i));
      if (m) {
        var c = m[1];
        c = c === '\u2264' ? '<=' : c === '\u2265' ? '>=' : (c === '\u2260' || c === '<>') ? '!=' : c === '==' ? '=' : c;
        out.push(T.cmp(c)); i += m[1].length; continue;
      }
      if (ch === '+') { out.push(T.op('+')); i++; continue; }
      if (ch === '-' || ch === MINUS) { out.push(expectOperand() ? T.neg() : T.op('-')); i++; continue; }
      if (ch === '*' || ch === '\u00d7' || ch === '\u00b7') { out.push(T.op('*')); i++; continue; }
      if (ch === '/' || ch === '\u00f7') { out.push(T.op('/')); i++; continue; }
      if (ch === '^') { out.push(T.op('^')); i++; continue; }
      if (ch === '(') { out.push(T.lp()); i++; continue; }
      if (ch === ')') { out.push(T.rp()); i++; continue; }
      if (ch === ',') { out.push(T.sep()); i++; continue; }
      if (ch === '%') { out.push(T.pct()); i++; continue; }
      if (ch === '!') { out.push(T.fact()); i++; continue; }
      throw new Error('Unexpected "' + ch + '" in formula');
    }
    return out;
  }

  // ---------------------------------------------------------------- sheets and fields

  var idCounter = 0;
  function uid(prefix) {
    idCounter = (idCounter + 1) % 1679616;
    var r = Math.floor(Math.random() * 2176782336).toString(36);
    return (prefix || 'i') + Date.now().toString(36) + ('0000' + idCounter.toString(36)).slice(-4) + ('000000' + r).slice(-6);
  }

  function newSheet(name) {
    var now = Date.now();
    return { id: uid('s'), name: name || 'New sheet', icon: '', fields: [], created: now, updated: now };
  }

  function newField(kind, props) {
    var f = { id: uid('f'), kind: kind, symbol: '', desc: '', prefix: '', suffix: '', created: Date.now() };
    if (kind === 'input') f.value = null; else f.formula = [];
    if (props) for (var k in props) if (Object.prototype.hasOwnProperty.call(props, k)) f[k] = props[k];
    return f;
  }

  var INPUT_ORDER = 'abcdefghijklmnopqrstuvwxyz';
  var OUTPUT_ORDER = 'xyzwvutsrqponmlkjihgfedcba';

  /* Names that formulas mention with no row behind them. One is left when an empty number
     row that a formula used is deleted: there is no number to write in its place. */
  function looseNames(sheet) {
    var out = dict();
    for (var i = 0; i < sheet.fields.length; i++) {
      var f = sheet.fields[i];
      if (f.kind !== 'output' || !f.formula) continue;
      for (var j = 0; j < f.formula.length; j++) if (f.formula[j].t === 'name') out[f.formula[j].v] = true;
    }
    return out;
  }

  /* Ties loose names to the rows that now carry those symbols, so a later rename keeps them
     together. A name that would make a formula lean on itself stays loose. */
  function adoptNames(sheet) {
    var changed = false;
    for (var i = 0; i < sheet.fields.length; i++) {
      var f = sheet.fields[i];
      if (f.kind !== 'output' || !f.formula) continue;
      for (var j = 0; j < f.formula.length; j++) {
        var t = f.formula[j];
        if (t.t !== 'name') continue;
        var target = fieldIndex(sheet).bySym[t.v];
        if (!target || target.id === f.id || dependsOn(sheet, target.id, f.id)) continue;
        f.formula[j] = T.ref(target.id);
        changed = true;
      }
    }
    return changed;
  }

  function nextSymbol(sheet, kind, extra) {
    var taken = dict(), i, loose = looseNames(sheet);
    for (i = 0; i < sheet.fields.length; i++) taken[sheet.fields[i].symbol] = true;
    for (var name in loose) taken[name] = true;
    if (extra) for (i = 0; i < extra.length; i++) taken[extra[i]] = true;
    var order = kind === 'output' ? OUTPUT_ORDER : INPUT_ORDER;
    for (var round = 0; round < 1000; round++) {
      for (i = 0; i < order.length; i++) {
        var s = order.charAt(i) + (round ? round : '');
        if (!taken[s]) return s;
      }
    }
    return uid('v');
  }

  var SYMBOL_RE = /^[A-Za-z][A-Za-z0-9]{0,11}$/;

  function checkSymbol(sheet, fieldId, symbol) {
    if (!symbol) return 'A symbol can\u2019t be empty.';
    if (!SYMBOL_RE.test(symbol)) return 'Use letters and digits, starting with a letter (12 at most).';
    for (var i = 0; i < sheet.fields.length; i++) {
      var f = sheet.fields[i];
      if (f.id !== fieldId && f.symbol === symbol) return '\u201c' + symbol + '\u201d is already used in this sheet.';
    }
    return '';
  }

  function renameSymbol(sheet, fieldId, symbol) {
    var err = checkSymbol(sheet, fieldId, symbol);
    if (err) return { ok: false, error: err };
    var f = fieldIndex(sheet).byId[fieldId];
    if (!f) return { ok: false, error: 'That field no longer exists.' };
    // a formula that already mentions this name would be tied to the row; that must not go round in a circle
    for (var i = 0; i < sheet.fields.length; i++) {
      var g = sheet.fields[i];
      if (g.kind !== 'output' || !g.formula) continue;
      for (var j = 0; j < g.formula.length; j++) {
        if (g.formula[j].t === 'name' && g.formula[j].v === symbol && (g.id === fieldId || dependsOn(sheet, fieldId, g.id))) {
          return { ok: false, error: '\u201c' + symbol + '\u201d appears in a formula this row depends on, so the two would go round in a circle.' };
        }
      }
    }
    f.symbol = symbol;
    adoptNames(sheet);
    touch(sheet);
    return { ok: true };
  }

  function touch(sheet) { sheet.updated = Date.now(); }

  function parseInputText(text) {
    if (text === null || text === undefined) return null;
    text = String(text).trim();
    if (!isCompleteNum(text)) return null;
    var v = parseFloat(text);
    return isFinite(v) ? v : null;
  }

  function setInputValue(sheet, fieldId, text) {
    var f = fieldIndex(sheet).byId[fieldId];
    if (!f || f.kind !== 'input') return false;
    f.value = typeof text === 'number' ? (isFinite(text) ? text : null) : parseInputText(text);
    touch(sheet);
    return true;
  }

  /* Direct references of a formula, with typed names resolved to fields. */
  function refsOf(tokens, ix) {
    var out = [];
    for (var i = 0; i < tokens.length; i++) {
      var t = tokens[i];
      if (t.t === 'ref' && ix.byId[t.id]) out.push(t.id);
      else if (t.t === 'name' && ix.bySym[t.v]) out.push(ix.bySym[t.v].id);
    }
    return out;
  }

  /* True when field `a` needs field `b`, directly or through other formulas. */
  function dependsOn(sheet, a, b) {
    var ix = fieldIndex(sheet), seen = dict();
    function walk(id) {
      if (id === b) return true;
      if (seen[id]) return false;
      seen[id] = true;
      var f = ix.byId[id];
      if (!f || f.kind !== 'output') return false;
      var refs = refsOf(f.formula || [], ix);
      for (var i = 0; i < refs.length; i++) if (walk(refs[i])) return true;
      return false;
    }
    return walk(a);
  }

  function usesAbove(tokens) {
    for (var i = 0; i < tokens.length; i++) if (tokens[i].t === 'above') return true;
    return false;
  }

  function dependentsOf(sheet, fieldId) {
    var ix = fieldIndex(sheet), out = [];
    for (var i = 0; i < sheet.fields.length; i++) {
      var f = sheet.fields[i];
      if (f.kind === 'output' && f.id !== fieldId && refsOf(f.formula || [], ix).indexOf(fieldId) >= 0) out.push(f);
    }
    return out;
  }

  /* Where a number jotted down on its own lands: above the first total of "all rows above". */
  function noteInsertIndex(sheet) {
    for (var i = 0; i < sheet.fields.length; i++) {
      var f = sheet.fields[i];
      if (f.kind === 'output' && usesAbove(f.formula || [])) return i;
    }
    return sheet.fields.length;
  }

  function closeOpenParens(tokens) {
    var depth = 0;
    for (var i = 0; i < tokens.length; i++) {
      if (tokens[i].t === 'lp' || tokens[i].t === 'fn') depth++;
      else if (tokens[i].t === 'rp') depth--;
    }
    for (; depth > 0; depth--) tokens.push(T.rp());
    return tokens;
  }

  /* Turns what was typed into fields.
     opts.mode: 'ns' (numbers and symbols become input fields) or 's' (symbols only).
     opts.editId: rewrite this output's formula instead of adding a new result.
     -> {ok, kind:'input'|'output', created:[ids], fieldId, focusId} or {ok:false, error} */
  function commit(sheet, rawTokens, opts) {
    opts = opts || {};
    var mode = opts.mode === 's' ? 's' : 'ns';
    var tokens = closeOpenParens(cloneTokens(rawTokens));
    var p = parse(tokens);
    if (!p.ok) return { ok: false, error: 'syntax' };
    var ix = fieldIndex(sheet), i, t, f;
    var editing = opts.editId ? ix.byId[opts.editId] : null;
    if (opts.editId && (!editing || editing.kind !== 'output')) return { ok: false, error: 'missing' };

    if (!editing) {
      // a number on its own is a note; a new symbol on its own is an empty input
      var lone = tokens.length === 1 ? tokens[0] : null;
      if (lone && lone.t === 'num') {
        f = newField('input', { symbol: nextSymbol(sheet, 'input'), value: parseFloat(lone.v) });
        sheet.fields.splice(noteInsertIndex(sheet), 0, f);
        touch(sheet);
        return { ok: true, kind: 'input', created: [f.id], fieldId: f.id, focusId: null };
      }
      if (tokens.length === 2 && tokens[0].t === 'neg' && tokens[1].t === 'num') {
        f = newField('input', { symbol: nextSymbol(sheet, 'input'), value: -parseFloat(tokens[1].v) });
        sheet.fields.splice(noteInsertIndex(sheet), 0, f);
        touch(sheet);
        return { ok: true, kind: 'input', created: [f.id], fieldId: f.id, focusId: null };
      }
      if (lone && lone.t === 'name' && !ix.bySym[lone.v]) {
        if (checkSymbol(sheet, null, lone.v)) return { ok: false, error: 'symbol' };
        f = newField('input', { symbol: lone.v });
        sheet.fields.splice(noteInsertIndex(sheet), 0, f);
        adoptNames(sheet);
        touch(sheet);
        return { ok: true, kind: 'input', created: [f.id], fieldId: f.id, focusId: f.id };
      }
    }

    var keepLiterals = mode === 's' || usesAbove(tokens);
    var created = [], newByName = dict(), reserved = [];
    for (i = 0; i < tokens.length; i++) {
      t = tokens[i];
      if (t.t === 'name') {
        f = ix.bySym[t.v] || newByName[t.v];
        if (!f) {
          if (!SYMBOL_RE.test(t.v)) return { ok: false, error: 'symbol' };
          f = newField('input', { symbol: t.v });
          newByName[t.v] = f; created.push(f); reserved.push(t.v);
        }
        tokens[i] = T.ref(f.id);
      } else if (t.t === 'num') {
        if (!keepLiterals && !t.fixed) {
          var symb = nextSymbol(sheet, 'input', reserved);
          reserved.push(symb);
          f = newField('input', { symbol: symb, value: parseFloat(t.v) });
          created.push(f);
          tokens[i] = T.ref(f.id);
        } else {
          tokens[i] = T.num(t.v);
        }
      }
    }

    if (editing) {
      // a formula may not lean on itself, however indirectly
      for (i = 0; i < tokens.length; i++) {
        if (tokens[i].t === 'ref' && ix.byId[tokens[i].id] && dependsOn(sheet, tokens[i].id, editing.id)) return { ok: false, error: 'cycle' };
      }
    }

    var focus = null;
    for (i = 0; i < created.length; i++) if (!hasValue(created[i])) { focus = created[i].id; break; }
    var ids = created.map(function (c) { return c.id; });

    if (editing) {
      var at = ix.pos[editing.id];
      Array.prototype.splice.apply(sheet.fields, [at, 0].concat(created));
      editing.formula = tokens;
      adoptNames(sheet);
      touch(sheet);
      return { ok: true, kind: 'output', created: ids, fieldId: editing.id, focusId: focus, edited: true };
    }
    var out = newField('output', { symbol: nextSymbol(sheet, 'output', reserved), formula: tokens });
    Array.prototype.push.apply(sheet.fields, created);
    sheet.fields.push(out);
    adoptNames(sheet);
    touch(sheet);
    return { ok: true, kind: 'output', created: ids.concat([out.id]), fieldId: out.id, focusId: focus };
  }

  function isSinglePrimary(tokens) {
    var p = parse(tokens, { autoClose: true });
    if (!p.ok) return false;
    var k = p.ast.k;
    if (k === 'num') return p.ast.v >= 0 && tokens.length === 1;
    return k === 'ref' || k === 'name' || k === 'const' || k === 'grp' || k === 'call';
  }

  /* Smart delete: whatever leaned on the field keeps working. A result's formula is written
     into the formulas that used it; an input's number is written in as a constant. */
  function deleteField(sheet, fieldId, draft) {
    var ix = fieldIndex(sheet), d = ix.byId[fieldId];
    if (!d) return false;
    var repl;
    if (d.kind === 'output') {
      repl = closeOpenParens(cloneTokens(d.formula || []));
      for (var k = 0; k < repl.length; k++) if (repl[k].t === 'num') repl[k].fixed = true;
      if (!repl.length) repl = [T.name(d.symbol)];
    } else if (hasValue(d)) {
      repl = d.value < 0 ? [T.neg(), T.num(plainNumber(-d.value), true)] : [T.num(plainNumber(d.value), true)];
    } else {
      repl = [T.name(d.symbol)];
    }
    var single = isSinglePrimary(repl);
    function uses(t) { return (t.t === 'ref' && t.id === fieldId) || (t.t === 'name' && t.v === d.symbol && ix.bySym[t.v] === d); }
    /* The same tokens when the field is not mentioned, otherwise a rewritten copy. */
    function rewrite(formula) {
      var hit = false, j;
      for (j = 0; j < formula.length; j++) if (uses(formula[j])) { hit = true; break; }
      if (!hit) return formula;
      var out = [], alone = formula.length === 1;
      for (j = 0; j < formula.length; j++) {
        if (!uses(formula[j])) { out.push(formula[j]); continue; }
        var piece = cloneTokens(repl);
        if (!single && !alone) { out.push(T.lp()); Array.prototype.push.apply(out, piece); out.push(T.rp()); }
        else Array.prototype.push.apply(out, piece);
      }
      return out;
    }
    for (var i = 0; i < sheet.fields.length; i++) {
      var f = sheet.fields[i];
      if (f.kind !== 'output' || f.id === fieldId || !f.formula) continue;
      f.formula = rewrite(f.formula);
    }
    // a calculation still being typed may use the field too
    if (draft && draft.tokens) draft.tokens = rewrite(draft.tokens);
    sheet.fields.splice(ix.pos[fieldId], 1);
    touch(sheet);
    return true;
  }

  /* draft: optional {tokens}, an unfinished calculation that is rewritten along with the formulas. */
  function deleteFields(sheet, ids, draft) {
    var n = 0;
    for (var i = 0; i < ids.length; i++) if (deleteField(sheet, ids[i], draft)) n++;
    return n;
  }

  function moveField(sheet, from, to) {
    var n = sheet.fields.length;
    if (from < 0 || from >= n) return false;
    to = to < 0 ? 0 : to >= n ? n - 1 : to;
    if (from === to) return false;
    var f = sheet.fields.splice(from, 1)[0];
    sheet.fields.splice(to, 0, f);
    touch(sheet);
    return true;
  }

  function remapTokens(tokens, map) {
    var out = cloneTokens(tokens || []);
    for (var i = 0; i < out.length; i++) {
      delete out[i].fixed;
      if (out[i].t === 'ref') out[i].id = map[out[i].id] || out[i].id;
    }
    return out;
  }

  function duplicateSheet(sheet, name) {
    var copy = newSheet(name || sheet.name), map = dict(), i;
    copy.icon = sheet.icon || '';
    for (i = 0; i < sheet.fields.length; i++) map[sheet.fields[i].id] = uid('f');
    for (i = 0; i < sheet.fields.length; i++) {
      var s = sheet.fields[i], f = {};
      for (var k in s) if (Object.prototype.hasOwnProperty.call(s, k)) f[k] = s[k];
      f.id = map[s.id];
      if (s.kind === 'output') f.formula = remapTokens(s.formula, map);
      copy.fields.push(f);
    }
    return copy;
  }

  /* Template spec -> sheet. Field spec: {s symbol, d description, v value, f formula text,
     pre, suf, min, max, tr}. */
  function sheetFromSpec(spec) {
    var sheet = newSheet(spec.name), i, bySym = dict();
    sheet.icon = spec.icon || '';
    for (i = 0; i < spec.fields.length; i++) {
      var q = spec.fields[i];
      var f = newField(q.f !== undefined ? 'output' : 'input', { symbol: q.s, desc: q.d || '', prefix: q.pre || '', suffix: q.suf || '' });
      if (q.min !== undefined) f.minDec = q.min;
      if (q.max !== undefined) f.maxDec = q.max;
      if (q.tr) f.trunc = q.tr;
      if (f.kind === 'input') f.value = typeof q.v === 'number' ? q.v : null;
      sheet.fields.push(f); bySym[q.s] = f;
    }
    for (i = 0; i < spec.fields.length; i++) {
      if (spec.fields[i].f === undefined) continue;
      var toks = textToTokens(spec.fields[i].f);
      for (var j = 0; j < toks.length; j++) {
        delete toks[j].fixed;
        if (toks[j].t === 'name' && bySym[toks[j].v]) toks[j] = T.ref(bySym[toks[j].v].id);
      }
      sheet.fields[i].formula = toks;
    }
    return sheet;
  }

  // ---------------------------------------------------------------- export / import

  function csvCell(s) {
    s = String(s === null || s === undefined ? '' : s);
    return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }

  function sheetToCSV(sheet, settings) {
    var res = computeSheet(sheet, settings).byId;
    var rows = [['Symbol', 'Description', 'Value', 'Shown as', 'Formula']];
    for (var i = 0; i < sheet.fields.length; i++) {
      var f = sheet.fields[i], r = res[f.id], d = displayField(f, r, settings);
      var raw = r && r.status === 'ok' ? String(cleanNum(r.value)) : '';
      var shown = d.state === 'ok' ? [d.prefix, d.text.replace(/\u2212/g, '-'), d.suffix].filter(Boolean).join(' ') : '';
      rows.push([f.symbol, f.desc, raw, shown, f.kind === 'output' ? '=' + tokensToText(f.formula || [], sheet, { ascii: true }) : '']);
    }
    return '\ufeff' + rows.map(function (r) { return r.map(csvCell).join(','); }).join('\r\n') + '\r\n';
  }

  function sheetToText(sheet, settings) {
    var res = computeSheet(sheet, settings).byId, lines = [sheet.name, ''];
    for (var i = 0; i < sheet.fields.length; i++) {
      var f = sheet.fields[i], d = displayField(f, res[f.id], settings);
      var val = [d.prefix, d.text, d.suffix].filter(Boolean).join(' ');
      var label = f.desc || (f.kind === 'output' ? tokensToText(f.formula || [], sheet, { settings: settings }) : f.symbol);
      lines.push(label + ': ' + val);
    }
    return lines.join('\n');
  }

  function exportSheetFile(sheet) {
    return JSON.stringify({ app: 'Reckoner', kind: 'reckoner-sheet', version: 1, sheets: [sheet] });
  }
  /* Everything: folders, sheets and settings. */
  function exportBackupFile(state) {
    return JSON.stringify({ app: 'Reckoner', kind: 'reckoner-backup', version: 1, exported: new Date().toISOString(),
      settings: state.settings, items: state.items, sheets: state.sheets });
  }

  var TOKEN_TYPES = table({ num: 1, ref: 1, name: 1, 'const': 1, op: 1, cmp: 1, neg: 1, pct: 1, fact: 1, lp: 1, rp: 1, fn: 1, sep: 1, above: 1 });

  function str(x, max) { return typeof x === 'string' ? x.slice(0, max) : ''; }

  function sanitizeTokens(arr) {
    var out = [];
    if (!Array.isArray(arr)) return out;
    for (var i = 0; i < arr.length && i < 400; i++) {
      var s = arr[i];
      if (!s || typeof s !== 'object' || !TOKEN_TYPES[s.t]) continue;
      switch (s.t) {
        case 'num': if (typeof s.v === 'string' && isCompleteNum(s.v)) out.push(T.num(s.v)); break;
        case 'ref': if (typeof s.id === 'string') out.push(T.ref(s.id)); break;
        case 'name': if (typeof s.v === 'string' && SYMBOL_RE.test(s.v)) out.push(T.name(s.v)); break;
        case 'const': if (s.v === 'pi' || s.v === 'e') out.push(T.konst(s.v)); break;
        case 'op': if (OP_CLASS[s.v]) out.push(T.op(s.v)); break;
        case 'cmp': if (CMP_SIGN[s.v]) out.push(T.cmp(s.v)); break;
        case 'fn': if (FUNCS[s.v]) out.push(T.fn(s.v)); break;
        default: out.push({ t: s.t });
      }
    }
    return out;
  }

  /* Cleans a sheet from a file so that nothing in it can break the app; gives it fresh ids. */
  function sanitizeSheet(src) {
    if (!src || typeof src !== 'object' || !Array.isArray(src.fields)) return null;
    var sheet = newSheet(str(src.name, 120) || 'Imported sheet'), map = dict(), i, used = dict();
    sheet.icon = str(src.icon, 16);
    var list = src.fields.slice(0, 2000);
    for (i = 0; i < list.length; i++) if (list[i] && typeof list[i].id === 'string') map[list[i].id] = uid('f');
    for (i = 0; i < list.length; i++) {
      var s = list[i];
      if (!s || typeof s !== 'object') continue;
      var kind = s.kind === 'output' ? 'output' : 'input';
      var symbol = str(s.symbol, 12);
      if (!SYMBOL_RE.test(symbol) || used[symbol]) symbol = nextSymbol(sheet, kind, Object.keys(used));
      used[symbol] = true;
      var f = newField(kind, { symbol: symbol, desc: str(s.desc, 300), prefix: str(s.prefix, 24), suffix: str(s.suffix, 24) });
      if (typeof s.id === 'string') f.id = map[s.id];
      if (typeof s.minDec === 'number') f.minDec = clampInt(s.minDec, 0, 10);
      if (typeof s.maxDec === 'number') f.maxDec = clampInt(s.maxDec, 0, 10);
      if (f.minDec !== undefined && f.maxDec !== undefined && f.minDec > f.maxDec) f.minDec = f.maxDec;
      if (s.trunc === 'floor' || s.trunc === 'ceil' || s.trunc === 'round') f.trunc = s.trunc;
      if (kind === 'input') f.value = typeof s.value === 'number' && isFinite(s.value) ? s.value : null;
      else f.formula = remapTokens(sanitizeTokens(s.formula), map);
      sheet.fields.push(f);
    }
    adoptNames(sheet);
    return sheet;
  }

  /* Reads a sheet file or a backup file.
     -> {ok, sheets:[clean sheets with fresh ids], items:[tree entries pointing at them], backup} */
  function importFile(text) {
    var bad = { ok: false, error: 'This file isn\u2019t a Reckoner sheet.' };
    var data;
    try { data = JSON.parse(text); } catch (e) { return bad; }
    if (!data || typeof data !== 'object') return bad;
    var out = [], items = [], i, s;
    if (data.sheets && typeof data.sheets === 'object' && !Array.isArray(data.sheets)) {
      // a backup: keep its folders
      var used = dict(), count = 0;
      var walk = function (list, depth) {
        var res = [];
        if (!Array.isArray(list) || depth > 12) return res;
        for (var j = 0; j < list.length && count < 2000; j++) {
          var it = list[j];
          if (!it || typeof it !== 'object') continue;
          if (it.type === 'folder') res.push({ type: 'folder', id: uid('d'), name: str(it.name, 120) || 'Folder', items: walk(it.items, depth + 1) });
          else if (it.type === 'sheet' && typeof it.id === 'string' && !used[it.id] && Object.prototype.hasOwnProperty.call(data.sheets, it.id)) {
            var cs = sanitizeSheet(data.sheets[it.id]);
            if (cs) { used[it.id] = true; count++; out.push(cs); res.push({ type: 'sheet', id: cs.id }); }
          }
        }
        return res;
      };
      items = walk(data.items, 0);
      for (var k in data.sheets) {
        if (Object.prototype.hasOwnProperty.call(data.sheets, k) && !used[k] && count < 2000) {
          s = sanitizeSheet(data.sheets[k]);
          if (s) { count++; out.push(s); items.push({ type: 'sheet', id: s.id }); }
        }
      }
      if (!out.length) return { ok: false, error: 'There are no sheets in this file.' };
      return { ok: true, sheets: out, items: items, backup: true };
    }
    var list = Array.isArray(data.sheets) ? data.sheets : (data.sheet ? [data.sheet] : (Array.isArray(data.fields) ? [data] : null));
    if (!list) return bad;
    for (i = 0; i < list.length && i < 500; i++) {
      s = sanitizeSheet(list[i]);
      if (s) { out.push(s); items.push({ type: 'sheet', id: s.id }); }
    }
    if (!out.length) return { ok: false, error: 'There are no sheets in this file.' };
    return { ok: true, sheets: out, items: items, backup: false };
  }

  // ---------------------------------------------------------------- token editor

  function tokAt(st, i) { return i >= 0 && i < st.tokens.length ? st.tokens[i] : null; }

  function expectsOperand(tokens, cur) {
    if (cur < 0) return true;
    var t = tokens[cur].t;
    return t === 'op' || t === 'cmp' || t === 'neg' || t === 'lp' || t === 'fn' || t === 'sep';
  }

  function operandDone(tokens, cur) {
    if (cur < 0) return false;
    var t = tokens[cur];
    if (t.t === 'num') return isCompleteNum(t.v);
    return t.t === 'ref' || t.t === 'name' || t.t === 'const' || t.t === 'rp' || t.t === 'pct' || t.t === 'fact' || t.t === 'above';
  }

  /* Indices of the brackets still open just after position `upto`. */
  function openStack(tokens, upto) {
    var st = [];
    for (var i = 0; i <= upto && i < tokens.length; i++) {
      var t = tokens[i].t;
      if (t === 'lp' || t === 'fn') st.push(i);
      else if (t === 'rp') st.pop();
    }
    return st;
  }

  function matchOpen(tokens, closeIdx) {
    var depth = 0;
    for (var i = closeIdx; i >= 0; i--) {
      var t = tokens[i].t;
      if (t === 'rp') depth++;
      else if (t === 'lp' || t === 'fn') { depth--; if (depth === 0) return i; }
    }
    return -1;
  }

  /* First token of the bracket group or function argument that ends at `end`. */
  function groupStart(tokens, end) {
    var depth = 0;
    for (var i = end; i >= 0; i--) {
      var t = tokens[i].t;
      if (t === 'rp') depth++;
      else if (t === 'lp' || t === 'fn') { if (depth === 0) return i + 1; depth--; }
      else if (t === 'sep' && depth === 0) return i + 1;
    }
    return 0;
  }

  /* First token of the single operand that ends at `end` (a number, a field, a bracket group,
     a function call, with any trailing % or !). */
  function primaryStart(tokens, end) {
    var i = end;
    while (i >= 0 && (tokens[i].t === 'pct' || tokens[i].t === 'fact')) i--;
    if (i < 0) return 0;
    if (tokens[i].t === 'rp') { var o = matchOpen(tokens, i); return o < 0 ? 0 : o; }
    return i;
  }

  function topLevelInfo(tokens, from, to) {
    var depth = 0, lowest = 0, hasCmp = false, leadNeg = tokens[from] && tokens[from].t === 'neg';
    for (var i = from; i <= to; i++) {
      var t = tokens[i];
      if (t.t === 'lp' || t.t === 'fn') depth++;
      else if (t.t === 'rp') depth--;
      else if (depth === 0) {
        if (t.t === 'cmp') hasCmp = true;
        else if (t.t === 'op') { var c = OP_CLASS[t.v]; if (!lowest || c < lowest) lowest = c; }
      }
    }
    return { lowest: lowest, hasCmp: hasCmp, leadNeg: leadNeg };
  }

  var MAX_DIGITS = 15, MAX_NAME = 12, MAX_TOKENS = 200;

  function digitCount(v) { return v.replace(/[^0-9]/g, '').length; }

  var editor = {
    create: function (tokens) {
      var toks = tokens ? cloneTokens(tokens) : [];
      return { tokens: toks, cur: toks.length - 1, typing: false };
    },

    /* For formulas loaded for editing: existing numbers are constants, not new inputs. */
    load: function (tokens) {
      var st = editor.create(tokens);
      for (var i = 0; i < st.tokens.length; i++) if (st.tokens[i].t === 'num') st.tokens[i].fixed = true;
      return st;
    },

    isComplete: function (st) {
      if (!st.tokens.length) return false;
      return parse(st.tokens, { autoClose: true }).ok;
    },

    innerFn: function (st) {
      var stack = openStack(st.tokens, st.cur);
      if (!stack.length) return null;
      var t = st.tokens[stack[stack.length - 1]];
      return t.t === 'fn' ? t.v : null;
    },

    argCount: function (st) {
      var stack = openStack(st.tokens, st.cur);
      if (!stack.length) return 0;
      var open = stack[stack.length - 1], depth = 0, n = 1;
      for (var i = open + 1; i <= st.cur; i++) {
        var t = st.tokens[i].t;
        if (t === 'lp' || t === 'fn') depth++;
        else if (t === 'rp') depth--;
        else if (t === 'sep' && depth === 0) n++;
      }
      return n;
    },

    can: function (st, a) {
      var toks = st.tokens, cur = st.cur, t = tokAt(st, cur);
      var need = expectsOperand(toks, cur), done = operandDone(toks, cur);
      if (toks.length >= MAX_TOKENS && a.k !== 'back' && a.k !== 'clear' && a.k !== 'left' && a.k !== 'right' && a.k !== 'select') {
        if (!(t && (t.t === 'num' || t.t === 'name') && (a.k === 'digit' || a.k === 'dot' || a.k === 'letter'))) return false;
      }
      switch (a.k) {
        case 'digit':
          if (t && t.t === 'num') return !st.typing || digitCount(t.v) < MAX_DIGITS;
          return need;
        case 'dot':
          if (t && t.t === 'num') return !st.typing || (t.v.indexOf('.') < 0 && digitCount(t.v) < MAX_DIGITS);
          return need;
        case 'letter':
          if (t && t.t === 'name') return !st.typing || t.v.length < MAX_NAME;
          return need;
        case 'op':
          if (cur < 0) return a.v === '-';
          if (t.t === 'op' || t.t === 'cmp') return true;
          if (t.t === 'lp' || t.t === 'fn' || t.t === 'sep') return a.v === '-';
          if (t.t === 'neg') return false;
          return done;
        case 'cmp':
          if (cur < 0) return false;
          if (t.t === 'op' || t.t === 'cmp') return true;
          return done;
        case 'lp': return need;
        case 'rp': return done && openStack(toks, cur).length > 0;
        case 'sep': {
          if (!done) return false;
          var fnName = editor.innerFn(st);
          return !!fnName && editor.argCount(st) < FUNCS[fnName].max;
        }
        case 'pct': case 'fact': case 'square': return done;
        case 'recip': return done || need;
        case 'fn': return !!FUNCS[a.v] && (need || done);
        case 'const': return need;
        case 'ref': return need || (!!t && (t.t === 'num' || t.t === 'name' || t.t === 'ref' || t.t === 'const'));
        case 'above': { var fnn = editor.innerFn(st); return need && !!fnn && !!FUNCS[fnn].agg; }
        case 'sign': return true;
        case 'back': return cur >= 0;
        case 'clear': return true;
        case 'left': return cur >= 0;
        case 'right': return cur < toks.length - 1;
        case 'select': return a.i >= -1 && a.i < toks.length;
        case 'bracket': return done;
      }
      return false;
    },

    apply: function (prev, a, opts) {
      if (!editor.can(prev, a)) return prev;
      opts = opts || {};
      var st = { tokens: cloneTokens(prev.tokens), cur: prev.cur, typing: prev.typing };
      var toks = st.tokens, t = tokAt(st, st.cur), ps;
      function insert(tok) { toks.splice(st.cur + 1, 0, tok); st.cur++; }
      switch (a.k) {
        case 'digit':
          if (t && t.t === 'num') {
            if (!st.typing) t.v = a.d;
            else if (t.v === '0') t.v = a.d;
            else if (t.v === '-0') t.v = '-' + a.d;
            else t.v += a.d;
          } else insert(T.num(a.d));
          st.typing = true;
          break;
        case 'dot':
          if (t && t.t === 'num') {
            if (!st.typing) t.v = '0.';
            else if (t.v === '-' || t.v === '') t.v += '0.';
            else t.v += '.';
          } else insert(T.num('0.'));
          st.typing = true;
          break;
        case 'letter':
          if (t && t.t === 'name') t.v = st.typing ? t.v + a.ch : a.ch;
          else insert(T.name(a.ch));
          st.typing = true;
          break;
        case 'op':
          if (st.cur < 0 || t.t === 'lp' || t.t === 'fn' || t.t === 'sep') { insert(T.neg()); }
          else if (t.t === 'op' || t.t === 'cmp') { toks[st.cur] = T.op(a.v); }
          else {
            if (opts.autoBracket !== false && st.cur === toks.length - 1) {
              var gs = groupStart(toks, st.cur), info = topLevelInfo(toks, gs, st.cur), cls = OP_CLASS[a.v];
              var wrap = !info.hasCmp && ((info.lowest && info.lowest !== cls) || (info.leadNeg && cls === 3 && !info.lowest));
              if (wrap) { toks.splice(gs, 0, T.lp()); toks.push(T.rp()); st.cur += 2; }
            }
            insert(T.op(a.v));
          }
          st.typing = false;
          break;
        case 'cmp':
          if (t.t === 'op' || t.t === 'cmp') toks[st.cur] = T.cmp(a.v); else insert(T.cmp(a.v));
          st.typing = false;
          break;
        case 'lp': insert(T.lp()); st.typing = false; break;
        case 'rp': insert(T.rp()); st.typing = false; break;
        case 'sep': insert(T.sep()); st.typing = false; break;
        case 'pct': insert(T.pct()); st.typing = false; break;
        case 'fact': insert(T.fact()); st.typing = false; break;
        case 'square': insert(T.op('^')); insert(T.num('2', true)); st.typing = false; break;
        case 'recip':
          if (operandDone(toks, st.cur)) {
            ps = primaryStart(toks, st.cur);
            toks.splice(ps, 0, T.num('1', true), T.op('/'));
            st.cur += 2;
          } else { insert(T.num('1', true)); insert(T.op('/')); }
          st.typing = false;
          break;
        case 'fn':
          if (expectsOperand(toks, st.cur)) insert(T.fn(a.v));
          else {
            // applied after the fact, the function takes the operand just entered
            ps = primaryStart(toks, st.cur);
            toks.splice(ps, 0, T.fn(a.v));
            st.cur++;
            if (FUNCS[a.v].max === 1) insert(T.rp());
          }
          st.typing = false;
          break;
        case 'const': insert(T.konst(a.v)); st.typing = false; break;
        case 'ref':
          if (expectsOperand(toks, st.cur)) insert(T.ref(a.id)); else toks[st.cur] = T.ref(a.id);
          st.typing = false;
          break;
        case 'above': insert(T.above()); st.typing = false; break;
        case 'sign':
          if (t && t.t === 'num') {
            t.v = t.v.charAt(0) === '-' ? t.v.slice(1) : '-' + t.v;
            if (t.v === '') { toks.splice(st.cur, 1); st.cur--; st.typing = false; }
          } else if (operandDone(toks, st.cur)) {
            ps = primaryStart(toks, st.cur);
            if (ps > 0 && toks[ps - 1].t === 'neg') { toks.splice(ps - 1, 1); st.cur--; }
            else { toks.splice(ps, 0, T.neg()); st.cur++; }
          } else if (t && t.t === 'neg') { toks.splice(st.cur, 1); st.cur--; }
          else { insert(T.neg()); st.typing = false; }
          break;
        case 'back':
          if ((t.t === 'num' || t.t === 'name') && st.typing && t.v.length > 1 && t.v.slice(0, -1) !== '-') {
            t.v = t.v.slice(0, -1);
          } else { toks.splice(st.cur, 1); st.cur--; st.typing = false; }
          break;
        case 'clear': st.tokens = []; st.cur = -1; st.typing = false; break;
        case 'left': st.cur--; st.typing = false; break;
        case 'right': st.cur++; st.typing = false; break;
        case 'select': st.cur = a.i; st.typing = false; break;
      }
      return st;
    },

    /* Bracket helper: the closing bracket sits after the current operand and the opening
       one can be walked left or right between sensible places. */
    bracketStart: function (st) {
      if (!operandDone(st.tokens, st.cur)) return null;
      var toks = st.tokens, gs = groupStart(toks, st.cur), stops = [], depth = 0;
      for (var i = gs; i <= st.cur; i++) {
        var t = toks[i].t;
        if (depth === 0) {
          // an operand starts at the group start or right after an operator; a minus sign
          // and the operand it negates count as one
          var prev = i > gs ? toks[i - 1].t : null;
          if (i === gs || prev === 'op' || prev === 'cmp' || prev === 'sep') stops.push(i);
        }
        if (t === 'lp' || t === 'fn') depth++;
        else if (t === 'rp') depth--;
      }
      if (!stops.length) return null;
      return { stops: stops, at: 0, close: st.cur };
    },
    bracketMove: function (b, dir) {
      var at = b.at + dir;
      if (at < 0 || at >= b.stops.length) return b;
      return { stops: b.stops, at: at, close: b.close };
    },
    bracketPreview: function (st, b) {
      var toks = cloneTokens(st.tokens), open = b.stops[b.at];
      toks.splice(b.close + 1, 0, T.rp());
      toks.splice(open, 0, T.lp());
      return { tokens: toks, open: open, close: b.close + 2 };
    },
    bracketApply: function (st, b) {
      var p = editor.bracketPreview(st, b);
      return { tokens: p.tokens, cur: p.close, typing: false };
    }
  };

  // ---------------------------------------------------------------- app state helpers

  function defaultSettings() {
    return {
      mode: 'ns', theme: 'system', autoBracket: true, group: true, numFmt: 'auto', angle: 'deg',
      defMinDec: 0, defMaxDec: 2, showSymbols: true, haptics: true, welcomed: false
    };
  }

  function newState() {
    return { version: 1, settings: defaultSettings(), items: [], sheets: dict(), view: { open: null, path: [] }, savedAt: 0 };
  }

  /* Finds a folder or sheet entry anywhere in the tree -> {list, index, item} or null. */
  function findItem(items, id) {
    for (var i = 0; i < items.length; i++) {
      var it = items[i];
      if (it.id === id) return { list: items, index: i, item: it };
      if (it.type === 'folder') { var r = findItem(it.items, id); if (r) return r; }
    }
    return null;
  }

  function folderItems(state, folderId) {
    if (!folderId) return state.items;
    var r = findItem(state.items, folderId);
    return r && r.item.type === 'folder' ? r.item.items : state.items;
  }

  function addSheet(state, sheet, folderId, atStart) {
    state.sheets[sheet.id] = sheet;
    var list = folderItems(state, folderId), entry = { type: 'sheet', id: sheet.id };
    if (atStart) list.unshift(entry); else list.push(entry);
    return sheet;
  }

  function addFolder(state, name, folderId) {
    var f = { type: 'folder', id: uid('d'), name: name || 'New folder', items: [] };
    folderItems(state, folderId).push(f);
    return f;
  }

  function sheetIdsIn(item, out) {
    out = out || [];
    if (item.type === 'sheet') out.push(item.id);
    else for (var i = 0; i < item.items.length; i++) sheetIdsIn(item.items[i], out);
    return out;
  }

  function removeItem(state, id) {
    var r = findItem(state.items, id);
    if (!r) return null;
    r.list.splice(r.index, 1);
    var ids = sheetIdsIn(r.item), removed = dict();
    for (var i = 0; i < ids.length; i++) { removed[ids[i]] = state.sheets[ids[i]]; delete state.sheets[ids[i]]; }
    return { item: r.item, sheets: removed, list: r.list, index: r.index };
  }

  function containsItem(folder, id) {
    if (folder.id === id) return true;
    if (folder.type !== 'folder') return false;
    for (var i = 0; i < folder.items.length; i++) if (containsItem(folder.items[i], id)) return true;
    return false;
  }

  function moveItem(state, id, toFolderId) {
    var r = findItem(state.items, id);
    if (!r) return false;
    if (toFolderId) {
      var dest = findItem(state.items, toFolderId);
      if (!dest || dest.item.type !== 'folder') return false;
      if (r.item.type === 'folder' && containsItem(r.item, toFolderId)) return false;
    }
    r.list.splice(r.index, 1);
    folderItems(state, toFolderId).push(r.item);
    return true;
  }

  /* Repairs a loaded state so the app can always start. */
  function normalizeState(raw) {
    var st = newState();
    if (!raw || typeof raw !== 'object') return st;
    var d = defaultSettings(), k;
    if (raw.settings && typeof raw.settings === 'object') {
      for (k in d) if (Object.prototype.hasOwnProperty.call(d, k) && typeof raw.settings[k] === typeof d[k]) st.settings[k] = raw.settings[k];
    }
    if (st.settings.mode !== 's') st.settings.mode = 'ns';
    st.settings.defMaxDec = clampInt(st.settings.defMaxDec, 0, 10);
    st.settings.defMinDec = clampInt(st.settings.defMinDec, 0, st.settings.defMaxDec);
    var sheets = dict(), seen = dict();
    if (raw.sheets && typeof raw.sheets === 'object' && !Array.isArray(raw.sheets)) {
      for (k in raw.sheets) if (Object.prototype.hasOwnProperty.call(raw.sheets, k)) sheets[k] = raw.sheets[k];
    }
    function walk(list) {
      var out = [];
      if (!Array.isArray(list)) return out;
      for (var i = 0; i < list.length; i++) {
        var it = list[i];
        if (!it || typeof it !== 'object' || typeof it.id !== 'string' || seen[it.id]) continue;
        if (it.type === 'folder') { seen[it.id] = true; out.push({ type: 'folder', id: it.id, name: str(it.name, 120) || 'Folder', items: walk(it.items) }); }
        else if (it.type === 'sheet' && sheets[it.id] && Array.isArray(sheets[it.id].fields)) { seen[it.id] = true; out.push({ type: 'sheet', id: it.id }); }
      }
      return out;
    }
    st.items = walk(raw.items);
    for (k in sheets) {
      var s = sheets[k];
      if (!s || typeof s !== 'object' || !Array.isArray(s.fields)) continue;
      if (!seen[k]) st.items.push({ type: 'sheet', id: k });
      s.id = k;
      s.name = str(s.name, 120) || 'Sheet';
      s.icon = str(s.icon, 16);
      s.fields = s.fields.filter(function (f) { return f && typeof f === 'object' && typeof f.id === 'string' && typeof f.symbol === 'string'; });
      s.fields.forEach(function (f) {
        f.kind = f.kind === 'output' ? 'output' : 'input';
        f.desc = str(f.desc, 300); f.prefix = str(f.prefix, 24); f.suffix = str(f.suffix, 24);
        if (f.kind === 'output') f.formula = sanitizeTokens(f.formula);
        else if (!(typeof f.value === 'number' && isFinite(f.value))) f.value = null;
      });
      st.sheets[k] = s;
    }
    if (raw.view && typeof raw.view === 'object') {
      st.view.open = typeof raw.view.open === 'string' && st.sheets[raw.view.open] ? raw.view.open : null;
      st.view.path = Array.isArray(raw.view.path) ? raw.view.path.filter(function (id) { var r = findItem(st.items, id); return r && r.item.type === 'folder'; }) : [];
    }
    st.savedAt = typeof raw.savedAt === 'number' ? raw.savedAt : 0;
    return st;
  }

  return {
    T: T, FUNCS: FUNCS, OP_SIGN: OP_SIGN, CMP_SIGN: CMP_SIGN, MINUS: MINUS, ERROR_TEXT: ERROR_TEXT,
    cloneTokens: cloneTokens, isCompleteNum: isCompleteNum,
    parse: parse, evaluate: evaluate, evalTokens: evalTokens, computeSheet: computeSheet, CalcError: CalcError,
    cleanNum: cleanNum, plainNumber: plainNumber, roundDec: roundDec, formatNumber: formatNumber, formatTyped: formatTyped,
    fieldFormat: fieldFormat, displayField: displayField, numFormatOf: numFormatOf, NUM_FORMATS: NUM_FORMATS,
    tokensToText: tokensToText, textToTokens: textToTokens, displayFnName: displayFnName,
    uid: uid, newSheet: newSheet, newField: newField, nextSymbol: nextSymbol, checkSymbol: checkSymbol, looseNames: looseNames, adoptNames: adoptNames,
    renameSymbol: renameSymbol, setInputValue: setInputValue, parseInputText: parseInputText, hasValue: hasValue,
    fieldIndex: fieldIndex, refsOf: refsOf, dependsOn: dependsOn, dependentsOf: dependentsOf, usesAbove: usesAbove,
    noteInsertIndex: noteInsertIndex, commit: commit, deleteField: deleteField, deleteFields: deleteFields,
    moveField: moveField, duplicateSheet: duplicateSheet, sheetFromSpec: sheetFromSpec,
    sheetToCSV: sheetToCSV, sheetToText: sheetToText, exportSheetFile: exportSheetFile, exportBackupFile: exportBackupFile,
    importFile: importFile, sanitizeSheet: sanitizeSheet,
    editor: editor, expectsOperand: expectsOperand, operandDone: operandDone, openStack: openStack,
    groupStart: groupStart, primaryStart: primaryStart,
    defaultSettings: defaultSettings, newState: newState, normalizeState: normalizeState,
    findItem: findItem, folderItems: folderItems, addSheet: addSheet, addFolder: addFolder,
    removeItem: removeItem, moveItem: moveItem, sheetIdsIn: sheetIdsIn, touch: touch
  };
});
