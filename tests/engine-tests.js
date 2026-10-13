/* Engine checks. Runs in Node (tests/run-engine.js), in the browser test page, and inside
   the iOS app when it is launched with -selftest, so the same checks cover real WebKit. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.ReckonerEngineTests = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  function run(E) {
    var passed = 0, failures = [], group = '';
    var S = { numFmt: 'us', group: true, angle: 'deg', defMinDec: 0, defMaxDec: 2, mode: 'ns' };

    function ok(cond, label) { if (cond) passed++; else failures.push(group + ': ' + label); }
    function eq(actual, expected, label) {
      var a = JSON.stringify(actual), b = JSON.stringify(expected);
      if (a === b) passed++; else failures.push(group + ': ' + label + ' \u2014 expected ' + b + ', got ' + a);
    }
    function near(actual, expected, label) {
      var good = typeof actual === 'number' && Math.abs(actual - expected) <= Math.max(1e-9, Math.abs(expected) * 1e-9);
      if (good) passed++; else failures.push(group + ': ' + label + ' \u2014 expected ' + expected + ', got ' + actual);
    }
    function section(name, fn) {
      group = name;
      try { fn(); } catch (e) { failures.push(name + ': threw ' + (e && e.message ? e.message : e)); }
    }

    /* Evaluates formula text with named values: calc('a * 2', {a: 4}) -> {status, value} */
    function calc(text, vars, settings) {
      var sheet = E.newSheet('t'), k;
      for (k in (vars || {})) sheet.fields.push(E.newField('input', { symbol: k, value: vars[k] }));
      var toks = E.textToTokens(text);
      sheet.fields.push(E.newField('output', { symbol: 'OUT', formula: toks }));
      var r = E.computeSheet(sheet, settings || S).byId;
      return r[sheet.fields[sheet.fields.length - 1].id];
    }
    function val(text, vars, settings) { var r = calc(text, vars, settings); return r.status === 'ok' ? r.value : r.status + (r.code ? ':' + r.code : ''); }

    /* Types characters on the editor the way the keypad does. */
    function type(st, keys, opts) {
      for (var i = 0; i < keys.length; i++) {
        var ch = keys.charAt(i), a;
        if (ch >= '0' && ch <= '9') a = { k: 'digit', d: ch };
        else if (ch === '.') a = { k: 'dot' };
        else if ('+-*/^'.indexOf(ch) >= 0) a = { k: 'op', v: ch };
        else if (ch === '(') a = { k: 'lp' };
        else if (ch === ')') a = { k: 'rp' };
        else if (ch === ',') a = { k: 'sep' };
        else if (ch === '%') a = { k: 'pct' };
        else if (ch === '!') a = { k: 'fact' };
        else if (ch === '<') a = { k: 'back' };
        else if (ch === '~') a = { k: 'sign' };
        else if (/[A-Za-z]/.test(ch)) a = { k: 'letter', ch: ch };
        else if (ch === ' ') { st = { tokens: st.tokens, cur: st.cur, typing: false }; continue; }
        else throw new Error('bad key ' + ch);
        st = E.editor.apply(st, a, opts);
      }
      return st;
    }
    function text(st, sheet) { return E.tokensToText(st.tokens, sheet || null, { settings: S }); }
    function draft(sheet, st) { var r = E.computeSheet(sheet, S, { tokens: st.tokens }).draft; return r.status === 'ok' ? r.value : r.status; }
    function values(sheet) {
      var r = E.computeSheet(sheet, S).byId, out = {};
      sheet.fields.forEach(function (f) { out[f.symbol] = r[f.id].status === 'ok' ? E.cleanNum(r[f.id].value) : r[f.id].status; });
      return out;
    }
    function bySym(sheet, s) { return sheet.fields.filter(function (f) { return f.symbol === s; })[0]; }
    function formulaOf(sheet, s) { return E.tokensToText(bySym(sheet, s).formula, sheet, { settings: S }); }

    section('arithmetic', function () {
      near(val('1 + 2 * 3'), 7, 'precedence');
      near(val('(1 + 2) * 3'), 9, 'brackets');
      near(val('10 - 4 - 3'), 3, 'left to right subtraction');
      near(val('100 / 10 / 5'), 2, 'left to right division');
      near(val('2 ^ 3 ^ 2'), 512, 'power is right associative');
      near(val('-2 ^ 2'), -4, 'minus applies after power');
      near(val('2 ^ -1'), 0.5, 'negative exponent');
      near(val('2 * -3'), -6, 'unary minus after operator');
      near(val('--5'), 5, 'double minus');
      near(val('5!'), 120, 'factorial');
      near(val('0!'), 1, 'zero factorial');
      eq(val('2.5!'), 'error:domain', 'factorial of a fraction');
      eq(val('1 / 0'), 'error:div0', 'division by zero');
      eq(val('sqrt(-4)'), 'error:domain', 'root of a negative');
      eq(val('ln(0)'), 'error:domain', 'log of zero');
      eq(val('10 ^ 400'), 'error:overflow', 'overflow');
      eq(val('(-8) ^ 0.5'), 'error:domain', 'fractional power of a negative');
      near(val('0.1 + 0.2'), 0.3, 'float noise is tolerated');
    });

    section('percent', function () {
      near(val('200 + 10%'), 220, 'add percent of the left side');
      near(val('200 - 10%'), 180, 'subtract percent of the left side');
      near(val('200 * 10%'), 20, 'times percent');
      near(val('50%'), 0.5, 'plain percent');
      near(val('80 + 15% + 5'), 97, 'percent in a chain');
      near(val('p + t%', { p: 40, t: 20 }), 48, 'percent of a field');
      near(val('100 + (10%)'), 100.1, 'bracketed percent is a plain fraction');
    });

    section('functions', function () {
      near(val('sqrt(16)'), 4, 'sqrt');
      near(val('cbrt(-27)'), -3, 'cbrt of a negative');
      near(val('abs(-3.5)'), 3.5, 'abs');
      near(val('round(2.345, 2)'), 2.35, 'round to places');
      near(val('round(2.5)'), 3, 'round half up');
      near(val('round(-2.5)'), -3, 'round half away from zero');
      near(val('floor(-1.2)'), -2, 'floor');
      near(val('ceil(1.2)'), 2, 'ceil');
      near(val('ceil(0.1 + 0.2 - 0.3 + 3)'), 3, 'ceil ignores float noise');
      near(val('mod(17, 5)'), 2, 'mod');
      near(val('mod(-1, 5)'), 4, 'mod of a negative follows the divisor');
      eq(val('mod(3, 0)'), 'error:div0', 'mod by zero');
      near(val('min(4, 2, 8)'), 2, 'min');
      near(val('max(4, 2, 8)'), 8, 'max');
      near(val('sum(1, 2, 3, 4)'), 10, 'sum');
      near(val('avg(2, 4, 9)'), 5, 'avg');
      near(val('median(5, 1, 9, 3)'), 4, 'median of an even count');
      near(val('count(7, 7, 7)'), 3, 'count');
      near(val('sd(2, 4, 4, 4, 5, 5, 7, 9)'), 2.138089935299395, 'sample standard deviation');
      near(val('sdp(2, 4, 4, 4, 5, 5, 7, 9)'), 2, 'population standard deviation');
      near(val('ln(@e)'), 1, 'ln e');
      near(val('log(1000)'), 3, 'log10');
      near(val('exp(0)'), 1, 'exp');
      near(val('sin(30)'), 0.5, 'sin in degrees');
      near(val('cos(60)'), 0.5, 'cos in degrees');
      near(val('sin(180)'), 0, 'sin 180 is exactly zero');
      near(val('atan(1)'), 45, 'atan in degrees');
      near(val('sin(@pi / 2)', null, { angle: 'rad' }), 1, 'sin in radians');
      near(val('2 * @pi * r', { r: 1 }), 6.283185307179586, 'pi');
      near(val('if(a > b, a, b)', { a: 3, b: 9 }), 9, 'if picks the else branch');
      near(val('if(a <= 3, 10, 1 / 0)', { a: 3 }), 10, 'if skips the unused branch');
      near(val('if(a = 0.3, 1, 0)', { a: 0.1 + 0.2 }), 1, 'equality tolerates float noise');
      near(val('if(a != b, 1, 0)', { a: 1, b: 2 }), 1, 'not equal');
      eq(calc('sum()').status, 'error', 'empty call is a syntax error');
      eq(calc('mod(1)').status, 'error', 'too few arguments');
      eq(calc('sqrt(1, 2)').status, 'error', 'too many arguments');
      eq(calc('1 + @above').status, 'error', 'rows-above outside a total');
    });

    section('unknowns', function () {
      eq(val('a * 2', { a: null }), 'unknown', 'empty input gives no answer yet');
      eq(val('q * 2'), 'unknown', 'unknown symbol gives no answer yet');
      eq(val('sum(a, 2)', { a: null }), 'unknown', 'sum with an empty argument');
      eq(calc('2 +').status, 'error', 'dangling operator');
      near(val('(2 + 3'), 5, 'a missing closing bracket is filled in');
      near(val('sqrt(16'), 4, 'unclosed function call');
    });

    section('number format', function () {
      function f(v, min, max, tr) { return E.formatNumber(v, { minDec: min, maxDec: max, trunc: tr }, S); }
      eq(f(1234567.891, 0, 2), '1,234,567.89', 'grouping and rounding');
      eq(f(1.005, 0, 2), '1.01', '1.005 rounds up');
      eq(f(2.675, 0, 2), '2.68', '2.675 rounds up');
      eq(f(0.1 + 0.2, 0, 10), '0.3', 'float noise hidden');
      eq(f(12.5, 2, 2), '12.50', 'minimum decimals pad');
      eq(f(12, 0, 2), '12', 'no needless decimals');
      eq(f(-4162.45, 0, 2), '\u22124,162.45', 'true minus sign');
      eq(f(-0.001, 0, 2), '0', 'no negative zero');
      eq(f(2.999, 0, 2, 'floor'), '2.99', 'floor mode');
      eq(f(2.991, 0, 2, 'ceil'), '3', 'ceil mode');
      eq(f(-2.991, 0, 2, 'floor'), '\u22123', 'floor of a negative');
      eq(f(0.1 + 0.2, 0, 1, 'ceil'), '0.3', 'ceil ignores float noise');
      eq(f(999.999, 0, 2), '1,000', 'carry into a new group');
      eq(f(1e21, 0, 2), '1e21', 'huge numbers use exponent form');
      eq(f(-2.5e17, 0, 2), '\u22122.5e17', 'huge negative');
      eq(f(1 / 3, 0, 10), '0.3333333333', 'ten decimals');
      eq(f(NaN, 0, 2), '?', 'not a number');
      eq(E.formatNumber(1234.5, { minDec: 0, maxDec: 2 }, { numFmt: 'eu', group: true }), '1.234,5', 'european format');
      eq(E.formatNumber(1234.5, { minDec: 0, maxDec: 2 }, { numFmt: 'us', group: false }), '1234.5', 'grouping off');
      eq(E.formatTyped('25000', S), '25,000', 'typed number groups');
      eq(E.formatTyped('12.50', S), '12.50', 'typed zeros kept');
      eq(E.formatTyped('0.', S), '0.', 'typed trailing point kept');
      eq(E.formatTyped('-1234.5', S), '\u22121,234.5', 'typed negative');
      eq(E.plainNumber(1e-7), '0.0000001', 'small number in plain digits');
      eq(E.plainNumber(1.5e21), '1500000000000000000000', 'large number in plain digits');
      eq(E.plainNumber(42.5), '42.5', 'ordinary number unchanged');
    });

    section('editor typing', function () {
      var ed = E.editor, st = ed.create();
      st = type(st, '5.73*458/27');
      eq(text(st), '5.73 \u00d7 458 \u00f7 27', 'same-rank operators stay flat');
      near(draft(E.newSheet('t'), st), 97.19777777777777, 'live result');
      ok(ed.isComplete(st), 'complete expression');
      st = type(ed.create(), '34*2+');
      eq(text(st), '(34 \u00d7 2) +', 'bracket added when the operator rank changes');
      ok(!ed.isComplete(st), 'dangling operator is incomplete');
      st = type(ed.create(), '1+2*');
      eq(text(st), '(1 + 2) \u00d7', 'sum is bracketed before multiplying');
      st = type(ed.create(), '1+2+3-4');
      eq(text(st), '1 + 2 + 3 \u2212 4', 'same rank needs no brackets');
      st = type(ed.create(), '2*3^');
      eq(text(st), '(2 \u00d7 3)^', 'power takes the running result');
      st = type(ed.create(), '1+2*', { autoBracket: false });
      eq(text(st), '1 + 2 \u00d7', 'auto bracket can be switched off');
      st = type(ed.create(), '(1+2)*3');
      eq(text(st), '(1 + 2) \u00d7 3', 'typed brackets are kept as typed');
      near(draft(E.newSheet('t'), st), 9, 'typed brackets evaluate');
      st = type(ed.create(), '2*(3+4');
      near(draft(E.newSheet('t'), st), 14, 'open bracket evaluates live');
      st = type(ed.create(), '2*(3+4*');
      eq(text(st), '2 \u00d7 ((3 + 4) \u00d7', 'bracketing stays inside the open group');
      st = type(ed.create(), '7+*');
      eq(text(st), '7 \u00d7', 'a second operator replaces the first');
      st = type(ed.create(), '-5+3');
      near(draft(E.newSheet('t'), st), -2, 'leading minus');
      st = type(ed.create(), '5~');
      eq(st.tokens[0].v, '-5', 'sign key negates the number being typed');
      st = type(st, '~');
      eq(st.tokens[0].v, '5', 'sign key toggles back');
      st = type(ed.create(), '007');
      eq(st.tokens[0].v, '7', 'leading zeros collapse');
      st = type(ed.create(), '.5');
      eq(st.tokens[0].v, '0.5', 'point first gives 0.5');
      st = type(ed.create(), '1.2.3');
      eq(st.tokens[0].v, '1.23', 'second point ignored');
      st = type(ed.create(), '12<');
      eq(st.tokens[0].v, '1', 'backspace removes a digit');
      st = type(st, '<');
      eq(st.tokens.length, 0, 'backspace removes the last digit and the token');
      st = type(ed.create(), '12+3');
      st = ed.apply(st, { k: 'select', i: 0 });
      st = type(st, '9');
      eq(text(st), '9 + 3', 'typing over a selected number replaces it');
      st = type(ed.create(), '8+2');
      st = ed.apply(st, { k: 'left' });
      st = ed.apply(st, { k: 'left' });
      eq(st.cur, 0, 'cursor moves left');
      st = type(st, '*');
      eq(text(st), '8 \u00d7 + 2', 'operator inserted mid-expression without brackets');
      ok(!ed.isComplete(st), 'two operators in a row are incomplete');
      st = type(ed.create(), '1234567890123456789');
      eq(st.tokens[0].v.length, 15, 'at most 15 digits');
      st = type(ed.create(), 'rate*n');
      eq(st.tokens.map(function (t) { return t.t; }), ['name', 'op', 'name'], 'letters build symbols');
      eq(st.tokens[0].v, 'rate', 'multi-letter symbol');
      st = type(ed.create(), '50%');
      near(draft(E.newSheet('t'), st), 0.5, 'percent key');
      st = type(ed.create(), '4!');
      near(draft(E.newSheet('t'), st), 24, 'factorial key');
    });

    section('editor keys allowed', function () {
      var ed = E.editor, st = ed.create();
      ok(ed.can(st, { k: 'digit', d: '1' }), 'digit allowed at start');
      ok(!ed.can(st, { k: 'op', v: '+' }), 'plus not allowed at start');
      ok(ed.can(st, { k: 'op', v: '-' }), 'minus allowed at start');
      ok(!ed.can(st, { k: 'rp' }), 'closing bracket not allowed at start');
      ok(ed.can(st, { k: 'lp' }), 'opening bracket allowed at start');
      ok(!ed.can(st, { k: 'back' }), 'nothing to delete');
      st = type(st, '5');
      ok(ed.can(st, { k: 'op', v: '+' }), 'operator after a number');
      ok(!ed.can(st, { k: 'lp' }), 'no opening bracket right after a number');
      ok(!ed.can(st, { k: 'rp' }), 'no closing bracket without an open one');
      ok(!ed.can(st, { k: 'letter', ch: 'a' }), 'no letter right after a number');
      ok(ed.can(st, { k: 'pct' }), 'percent after a number');
      ok(ed.can(st, { k: 'ref', id: 'x' }), 'linking replaces the number being typed');
      st = type(st, '+');
      ok(ed.can(st, { k: 'ref', id: 'x' }), 'link after an operator');
      ok(!ed.can(st, { k: 'pct' }), 'no percent after an operator');
      st = type(ed.create(), '(5');
      ok(ed.can(st, { k: 'rp' }), 'closing bracket when one is open');
      ok(!ed.can(st, { k: 'sep' }), 'no comma outside a function');
      st = ed.apply(ed.create(), { k: 'fn', v: 'mod' });
      ok(!ed.can(st, { k: 'sep' }), 'no comma before the first argument');
      st = type(st, '7');
      ok(ed.can(st, { k: 'sep' }), 'comma inside a two-argument function');
      st = type(st, ',5');
      ok(!ed.can(st, { k: 'sep' }), 'no third argument for mod');
      st = ed.apply(ed.create(), { k: 'fn', v: 'sum' });
      ok(ed.can(st, { k: 'above' }), 'rows-above inside a total');
      st = ed.apply(ed.create(), { k: 'fn', v: 'sqrt' });
      ok(!ed.can(st, { k: 'above' }), 'rows-above not offered in sqrt');
    });

    section('editor functions', function () {
      var ed = E.editor, st;
      st = type(ed.create(), '16');
      st = ed.apply(st, { k: 'fn', v: 'sqrt' });
      eq(text(st), '\u221a(16)', 'function wraps the number just typed');
      near(draft(E.newSheet('t'), st), 4, 'wrapped value');
      st = type(ed.create(), '2+7');
      st = ed.apply(st, { k: 'fn', v: 'sqrt' });
      eq(text(st), '2 + \u221a(7)', 'function wraps only the last operand');
      st = type(ed.create(), '(2+7)');
      st = ed.apply(st, { k: 'fn', v: 'sqrt' });
      eq(text(st), '\u221a((2 + 7))', 'function wraps a bracket group');
      st = type(ed.create(), '3.14159');
      st = ed.apply(st, { k: 'fn', v: 'round' });
      st = type(st, ',2');
      near(draft(E.newSheet('t'), st), 3.14, 'two-argument function continues with a comma');
      st = type(ed.create(), '5');
      st = ed.apply(st, { k: 'square' });
      near(draft(E.newSheet('t'), st), 25, 'square key');
      ok(st.tokens[2].fixed, 'the exponent of the square key is a constant');
      st = type(ed.create(), '8');
      st = ed.apply(st, { k: 'recip' });
      near(draft(E.newSheet('t'), st), 0.125, 'reciprocal key');
      st = ed.apply(ed.create(), { k: 'const', v: 'pi' });
      st = type(st, '*2');
      near(draft(E.newSheet('t'), st), 2 * Math.PI, 'pi constant');
      st = ed.apply(ed.create(), { k: 'fn', v: 'max' });
      st = type(st, '3,9,4)');
      near(draft(E.newSheet('t'), st), 9, 'typed function arguments');
      st = type(ed.create(), '6');
      st = ed.apply(st, { k: 'sign' });
      st = type(st, '*2');
      near(draft(E.newSheet('t'), st), -12, 'negated number in a product');
      st = type(ed.create(), '(1+2)');
      st = ed.apply(st, { k: 'sign' });
      eq(text(st), '\u2212(1 + 2)', 'sign key negates a bracket group');
      st = ed.apply(st, { k: 'sign' });
      eq(text(st), '(1 + 2)', 'sign key removes the minus again');
    });

    section('bracket helper', function () {
      var ed = E.editor, st = type(ed.create(), '5.73*458/27'), b = ed.bracketStart(st);
      ok(!!b, 'available after an operand');
      eq(b.stops, [0, 2, 4], 'stops before each operand');
      eq(E.tokensToText(ed.bracketPreview(st, b).tokens, null, { settings: S }), '(5.73 \u00d7 458 \u00f7 27)', 'starts around everything');
      b = ed.bracketMove(b, 1);
      eq(E.tokensToText(ed.bracketPreview(st, b).tokens, null, { settings: S }), '5.73 \u00d7 (458 \u00f7 27)', 'moves right one operand');
      var done = ed.bracketApply(st, b);
      near(draft(E.newSheet('t'), done), 5.73 * (458 / 27), 'bracketed value');
      eq(done.cur, done.tokens.length - 1, 'cursor lands on the closing bracket');
      b = ed.bracketMove(ed.bracketMove(b, 1), 1);
      eq(b.at, 2, 'cannot move past the last operand');
      b = ed.bracketMove(ed.bracketMove(ed.bracketMove(b, -1), -1), -1);
      eq(b.at, 0, 'cannot move before the first operand');
      st = type(ed.create(), '2*(3+4*5');
      b = ed.bracketStart(st);
      eq(b.stops, [3, 9], 'stays inside the open group');
      st = type(ed.create(), '2*-3+4');
      b = ed.bracketStart(st);
      eq(b.stops.length, 3, 'a minus sign and its operand are one stop');
      ok(!ed.bracketStart(type(ed.create(), '2+')), 'unavailable after an operator');
    });

    section('commit: numbers become fields', function () {
      var sheet = E.newSheet('New sheet'), ed = E.editor;
      var r = E.commit(sheet, type(ed.create(), '5.73*458/27').tokens, { mode: 'ns' });
      ok(r.ok && r.kind === 'output', 'first calculation committed');
      eq(sheet.fields.map(function (f) { return f.symbol; }), ['a', 'b', 'c', 'x'], 'three inputs and a result');
      eq(values(sheet), { a: 5.73, b: 458, c: 27, x: 97.1977777777778 }, 'values');
      eq(formulaOf(sheet, 'x'), 'a \u00d7 b \u00f7 c', 'formula uses the new symbols');
      eq(r.focusId, null, 'nothing waits for a value');
      var st = type(ed.create(), '34*2+');
      st = ed.apply(st, { k: 'ref', id: bySym(sheet, 'x').id });
      near(draft(sheet, st), 165.19777777777779, 'live result with a linked field');
      r = E.commit(sheet, st.tokens, { mode: 'ns' });
      eq(sheet.fields.map(function (f) { return f.symbol; }), ['a', 'b', 'c', 'x', 'd', 'e', 'y'], 'second calculation appends d, e, y');
      eq(formulaOf(sheet, 'y'), '(d \u00d7 e) + x', 'linked formula');
      E.setInputValue(sheet, bySym(sheet, 'b').id, '523');
      var v = values(sheet);
      near(v.x, 110.99222222222222, 'changing an input updates its result');
      near(v.y, 178.99222222222222, 'and everything linked to it');
      eq(E.displayField(bySym(sheet, 'x'), E.computeSheet(sheet, S).byId[bySym(sheet, 'x').id], S).text, '110.99', 'results show two decimals by default');
    });

    section('commit: formulas with symbols', function () {
      var sheet = E.newSheet('t'), ed = E.editor;
      var st = type(ed.create(), 'n*(n+1)/2');
      var r = E.commit(sheet, st.tokens, { mode: 'ns' });
      eq(sheet.fields.map(function (f) { return f.symbol; }), ['n', 'a', 'b', 'x'], 'symbol first, then numbers, then result');
      eq(r.focusId, bySym(sheet, 'n').id, 'the empty input is next to fill');
      eq(values(sheet).x, 'unknown', 'no answer until n has a value');
      E.setInputValue(sheet, bySym(sheet, 'n').id, '48');
      eq(values(sheet).x, 1176, 'n = 48 gives 1,176');
      eq(formulaOf(sheet, 'x'), 'n \u00d7 (n + a) \u00f7 b', 'one field for n even though it appears twice');
      var s2 = E.newSheet('t');
      E.commit(s2, type(ed.create(), 'n*(n+1)/2').tokens, { mode: 's' });
      eq(s2.fields.map(function (f) { return f.symbol; }), ['n', 'x'], 'symbols-only mode keeps numbers as constants');
      eq(formulaOf(s2, 'x'), 'n \u00d7 (n + 1) \u00f7 2', 'constants stay in the formula');
      var s3 = E.newSheet('t');
      E.commit(s3, type(ed.create(), '25000*5*6.5/100').tokens, { mode: 's' });
      eq(s3.fields.length, 1, 'symbols-only mode with plain numbers adds just the result');
      eq(values(s3).x, 8125, 'constant calculation');
      var s4 = E.newSheet('t');
      E.commit(s4, type(ed.create(), 'P*N*r/100').tokens, { mode: 's' });
      eq(s4.fields.map(function (f) { return f.symbol; }), ['P', 'N', 'r', 'x'], 'capital and small symbols');
      E.commit(s4, type(ed.create(), 'x*2').tokens, { mode: 's' });
      eq(formulaOf(s4, 'y'), 'x \u00d7 2', 'a typed symbol that exists links to that field');
      eq(s4.fields.length, 5, 'no duplicate field for a known symbol');
    });

    section('commit: notes', function () {
      var sheet = E.newSheet('t'), ed = E.editor;
      var r = E.commit(sheet, type(ed.create(), '23').tokens, { mode: 'ns' });
      eq([r.kind, sheet.fields.length, sheet.fields[0].kind, sheet.fields[0].value], ['input', 1, 'input', 23], 'a number on its own is an input');
      r = E.commit(sheet, type(ed.create(), 'b').tokens, { mode: 'ns' });
      eq([r.kind, sheet.fields[1].symbol, sheet.fields[1].value], ['input', 'b', null], 'a new symbol on its own is an empty input');
      eq(r.focusId, sheet.fields[1].id, 'and it is selected for typing');
      r = E.commit(sheet, type(ed.create(), '-7.5').tokens, { mode: 'ns' });
      eq(sheet.fields[2].value, -7.5, 'a negative number on its own');
      r = E.commit(sheet, type(ed.create(), '12').tokens, { mode: 's' });
      eq(sheet.fields[3].value, 12, 'notes work in symbols-only mode too');
      eq(sheet.fields.map(function (f) { return f.symbol; }), ['a', 'b', 'c', 'd'], 'auto symbols skip the one in use');
      eq(E.commit(sheet, type(ed.create(), '2+').tokens, {}).ok, false, 'incomplete input is refused');
      eq(E.commit(sheet, [], {}).ok, false, 'empty input is refused');
    });

    section('commit: editing a formula', function () {
      var sheet = E.newSheet('t'), ed = E.editor;
      E.commit(sheet, type(ed.create(), '10*4').tokens, { mode: 'ns' });
      var x = bySym(sheet, 'x');
      var st = ed.load(x.formula);
      st = type(st, '+5');
      var r = E.commit(sheet, st.tokens, { mode: 'ns', editId: x.id });
      ok(r.ok && r.edited, 'edit accepted');
      eq(sheet.fields.map(function (f) { return f.symbol; }), ['a', 'b', 'c', 'x'], 'the new number becomes a field just above the result');
      eq(values(sheet).x, 45, 'edited result');
      eq(formulaOf(sheet, 'x'), '(a \u00d7 b) + c', 'edited formula');
      E.commit(sheet, type(ed.create(), 'x*2').tokens, { mode: 's' });
      var y = bySym(sheet, 'y');
      st = ed.apply(type(ed.load(x.formula), '+'), { k: 'ref', id: y.id });
      eq(E.commit(sheet, st.tokens, { mode: 'ns', editId: x.id }).error, 'cycle', 'a formula cannot use a field that depends on it');
      st = ed.apply(type(ed.load(x.formula), '+'), { k: 'ref', id: x.id });
      eq(E.commit(sheet, st.tokens, { mode: 'ns', editId: x.id }).error, 'cycle', 'a formula cannot use itself');
      ok(E.dependsOn(sheet, y.id, bySym(sheet, 'a').id), 'dependency is followed through formulas');
      ok(!E.dependsOn(sheet, bySym(sheet, 'a').id, y.id), 'inputs depend on nothing');
      var s2 = E.newSheet('t');
      E.commit(s2, type(ed.create(), 'n*2').tokens, { mode: 's' });
      st = type(ed.load(bySym(s2, 'x').formula), '+7');
      E.commit(s2, st.tokens, { mode: 'ns', editId: bySym(s2, 'x').id });
      eq(s2.fields.map(function (f) { return f.symbol; }), ['n', 'a', 'x'], 'only the newly typed number becomes a field');
      eq(formulaOf(s2, 'x'), '(n \u00d7 2) + a', 'the old constant stays a constant');
    });

    section('smart delete', function () {
      var sheet = E.newSheet('t'), ed = E.editor;
      function link(st, s) { return ed.apply(st, { k: 'ref', id: bySym(sheet, s).id }); }
      E.commit(sheet, type(ed.create(), '1+2').tokens, { mode: 'ns' });
      E.commit(sheet, type(ed.create(), '3+4').tokens, { mode: 'ns' });
      E.commit(sheet, type(ed.create(), '5+6').tokens, { mode: 'ns' });
      eq(sheet.fields.map(function (f) { return f.symbol; }), ['a', 'b', 'x', 'c', 'd', 'y', 'e', 'f', 'z'], 'three small sums');
      var st = link(ed.create(), 'x');
      st = link(type(st, '*'), 'y');
      st = link(type(st, '/'), 'z');
      E.commit(sheet, st.tokens, { mode: 'ns' });
      eq(formulaOf(sheet, 'w'), 'x \u00d7 y \u00f7 z', 'final formula uses the three sums');
      near(values(sheet).w, 3 * 7 / 11, 'value before deleting');
      E.deleteFields(sheet, [bySym(sheet, 'x').id, bySym(sheet, 'y').id, bySym(sheet, 'z').id]);
      eq(formulaOf(sheet, 'w'), '(a + b) \u00d7 (c + d) \u00f7 (e + f)', 'the sums are written into the final formula');
      near(values(sheet).w, 3 * 7 / 11, 'value unchanged after deleting');
      E.deleteField(sheet, bySym(sheet, 'a').id);
      eq(formulaOf(sheet, 'w'), '(1 + b) \u00d7 (c + d) \u00f7 (e + f)', 'a deleted input leaves its number behind');
      near(values(sheet).w, 3 * 7 / 11, 'value unchanged after deleting an input');
      E.setInputValue(sheet, bySym(sheet, 'b').id, '-2');
      E.deleteField(sheet, bySym(sheet, 'b').id);
      eq(formulaOf(sheet, 'w'), '(1 + (\u22122)) \u00d7 (c + d) \u00f7 (e + f)', 'a negative number is bracketed');
      near(values(sheet).w, -1 * 7 / 11, 'value with the negative number');
      var s2 = E.newSheet('t');
      E.commit(s2, type(ed.create(), 'p*q').tokens, { mode: 's' });
      E.setInputValue(s2, bySym(s2, 'p').id, '3');
      E.deleteField(s2, bySym(s2, 'q').id);
      eq(formulaOf(s2, 'x'), 'p \u00d7 q', 'an empty input leaves its symbol behind');
      eq(values(s2).x, 'unknown', 'and the result waits');
      var r = E.commit(s2, type(ed.create(), 'q').tokens, { mode: 's' });
      E.setInputValue(s2, r.fieldId, '5');
      eq(values(s2).x, 15, 'a new field with that symbol reconnects');
      var s3 = E.newSheet('t');
      E.commit(s3, type(ed.create(), '6*7').tokens, { mode: 'ns' });
      var x3 = bySym(s3, 'x');
      E.commit(s3, ed.apply(ed.create(), { k: 'ref', id: x3.id }).tokens, { mode: 'ns' });
      E.deleteField(s3, x3.id);
      eq(formulaOf(s3, 'y'), 'a \u00d7 b', 'a formula that was only a link takes the formula without brackets');
      var s4 = E.newSheet('t');
      E.commit(s4, type(ed.create(), '2+3').tokens, { mode: 'ns' });
      var st4 = ed.apply(ed.create(), { k: 'ref', id: bySym(s4, 'x').id });
      st4 = ed.apply(st4, { k: 'square' });
      E.commit(s4, st4.tokens, { mode: 'ns' });
      E.deleteField(s4, bySym(s4, 'x').id);
      eq(formulaOf(s4, 'y'), '(a + b)^2', 'brackets protect a power');
      eq(values(s4).y, 25, 'power of the inlined sum');
      eq(E.dependentsOf(s4, bySym(s4, 'a').id).length, 1, 'dependents are found');
    });

    section('totals of the rows above', function () {
      var sheet = E.newSheet('Trip log'), ed = E.editor;
      ['23', '24.01', '12.5'].forEach(function (n) { E.commit(sheet, type(ed.create(), n).tokens, { mode: 'ns' }); });
      var st = ed.apply(ed.create(), { k: 'fn', v: 'sum' });
      st = ed.apply(st, { k: 'above' });
      near(draft(sheet, st), 59.51, 'live total');
      var r = E.commit(sheet, st.tokens, { mode: 'ns' });
      eq(sheet.fields.map(function (f) { return f.symbol; }), ['a', 'b', 'c', 'x'], 'the total goes last');
      near(values(sheet).x, 59.51, 'total of three notes');
      E.commit(sheet, type(ed.create(), '8').tokens, { mode: 'ns' });
      eq(sheet.fields.map(function (f) { return f.symbol; }), ['a', 'b', 'c', 'd', 'x'], 'a new note lands above the total');
      near(values(sheet).x, 67.51, 'and is counted');
      var total = bySym(sheet, 'x');
      st = type(ed.apply(ed.create(), { k: 'ref', id: total.id }), '*0.1');
      E.commit(sheet, st.tokens, { mode: 'ns' });
      eq(sheet.fields.map(function (f) { return f.symbol; }), ['a', 'b', 'c', 'd', 'x', 'e', 'y'], 'a calculation is added after the total');
      near(values(sheet).x, 67.51, 'numbers of a later calculation are not counted');
      near(values(sheet).y, 6.751, 'calculation on the total');
      st = ed.apply(ed.apply(ed.create(), { k: 'fn', v: 'avg' }), { k: 'above' });
      E.commit(sheet, st.tokens, { mode: 'ns' });
      near(values(sheet).z, (23 + 24.01 + 12.5 + 8 + 0.1) / 5, 'an average further down counts every number above it');
      E.setInputValue(sheet, bySym(sheet, 'c').id, '');
      near(values(sheet).x, 55.01, 'an empty row is skipped');
      E.moveField(sheet, 0, 6);
      near(values(sheet).x, 32.01, 'a row dragged below the total is no longer counted');
      eq(formulaOf(sheet, 'x'), 'sum(all above)', 'formula text of a total');
      var s2 = E.newSheet('t');
      st = ed.apply(ed.apply(ed.create(), { k: 'fn', v: 'avg' }), { k: 'above' });
      E.commit(s2, st.tokens, { mode: 'ns' });
      eq(values(s2).x, 'unknown', 'an average of nothing waits');
      st = ed.apply(ed.apply(ed.create(), { k: 'fn', v: 'count' }), { k: 'above' });
      E.commit(s2, st.tokens, { mode: 'ns' });
      eq(values(s2).y, 0, 'a count of nothing is zero');
      var s3 = E.newSheet('t');
      st = type(ed.apply(ed.apply(ed.create(), { k: 'fn', v: 'sum' }), { k: 'above' }), ')*2');
      E.commit(s3, st.tokens, { mode: 'ns' });
      eq(s3.fields.length, 1, 'numbers typed next to a total stay constants');
    });

    section('fields and symbols', function () {
      var sheet = E.newSheet('t'), i;
      for (i = 0; i < 30; i++) sheet.fields.push(E.newField('input', { symbol: E.nextSymbol(sheet, 'input'), value: i }));
      eq(sheet.fields[25].symbol, 'z', 'inputs run a to z');
      eq(sheet.fields[26].symbol, 'a1', 'then continue with a number');
      eq(E.nextSymbol(sheet, 'output'), 'x1', 'results follow the same idea');
      var s2 = E.newSheet('t');
      eq([E.nextSymbol(s2, 'output'), E.nextSymbol(s2, 'output', ['x']), E.nextSymbol(s2, 'output', ['x', 'y', 'z'])], ['x', 'y', 'w'], 'results run x, y, z, then w');
      var f = E.newField('input', { symbol: 'a', value: 1 }), g = E.newField('input', { symbol: 'b', value: 2 });
      s2.fields.push(f, g);
      eq(E.renameSymbol(s2, f.id, 'b').ok, false, 'duplicate symbol refused');
      eq(E.renameSymbol(s2, f.id, '9x').ok, false, 'symbol must start with a letter');
      eq(E.renameSymbol(s2, f.id, '').ok, false, 'empty symbol refused');
      eq(E.renameSymbol(s2, f.id, 'price').ok, true, 'word symbols allowed');
      E.commit(s2, E.textToTokens('price * b'), { mode: 's' });
      E.renameSymbol(s2, g.id, 'qty');
      eq(formulaOf(s2, 'x'), 'price \u00d7 qty', 'renaming follows into formulas');
      eq(values(s2).x, 2, 'value survives renaming');
      ok(E.moveField(s2, 0, 2), 'move down');
      eq(s2.fields.map(function (q) { return q.symbol; }), ['qty', 'x', 'price'], 'order after moving');
      ok(!E.moveField(s2, 1, 1), 'moving to the same place does nothing');
      var d = E.displayField(E.newField('input', { symbol: 'a' }), { status: 'unknown' }, S);
      eq([d.state, d.text], ['empty', '?'], 'an empty input shows a question mark');
      d = E.displayField(E.newField('output', { symbol: 'x', prefix: '$', suffix: 'each' }), { status: 'ok', value: -1234.567 }, S);
      eq([d.state, d.text, d.prefix, d.suffix, d.negative], ['ok', '\u22121,234.57', '$', 'each', true], 'display parts');
      d = E.displayField(E.newField('output', { symbol: 'x' }), { status: 'error', code: 'div0' }, S);
      eq([d.state, d.reason], ['error', 'Can\u2019t divide by zero'], 'error display');
      d = E.displayField(E.newField('input', { symbol: 'a', minDec: 2, maxDec: 2 }), { status: 'ok', value: 12.5 }, S);
      eq(d.text, '12.50', 'per-field decimals');
      d = E.displayField(E.newField('input', { symbol: 'a' }), { status: 'ok', value: 5.73125 }, S);
      eq(d.text, '5.73125', 'inputs show what was typed');
    });

    section('circular formulas', function () {
      var sheet = E.newSheet('t');
      var a = E.newField('output', { symbol: 'a' }), b = E.newField('output', { symbol: 'b' });
      a.formula = [E.T.ref(b.id)]; b.formula = [E.T.ref(a.id), E.T.op('+'), E.T.num('1')];
      sheet.fields.push(a, b);
      var r = E.computeSheet(sheet, S).byId;
      eq([r[a.id].status, r[b.id].status], ['error', 'error'], 'a loop is reported, not followed forever');
      var c = E.newField('output', { symbol: 'c', formula: [E.T.name('c')] });
      sheet.fields.push(c);
      eq(E.computeSheet(sheet, S).byId[c.id].code, 'cycle', 'a formula naming itself');
      var d = E.newField('output', { symbol: 'd', formula: [E.T.ref('gone')] });
      sheet.fields.push(d);
      eq(E.computeSheet(sheet, S).byId[d.id].status, 'unknown', 'a link to a missing field waits');
    });

    section('deleting a row that an unfinished calculation uses', function () {
      var sh = E.newSheet('t');
      E.commit(sh, type(E.editor.create(), '6*7').tokens, { mode: 'ns' });
      var a = sh.fields[0], b = sh.fields[1], x = sh.fields[2];
      var draft = { tokens: [E.T.ref(a.id), E.T.op('+'), E.T.ref(x.id)] }, same = draft.tokens;
      E.deleteFields(sh, [b.id], draft);
      ok(draft.tokens === same, 'a draft that does not use the row is left alone');
      E.deleteFields(sh, [a.id], draft);
      eq(E.tokensToText(draft.tokens, sh, { settings: S }), '6 + x', 'the number of a deleted row is written into the draft');
      E.deleteFields(sh, [x.id], draft);
      eq(E.tokensToText(draft.tokens, sh, { settings: S }), '6 + (6 \u00d7 7)', 'and so is the formula of a deleted result');
      eq(sh.fields.length, 0, 'the sheet is empty again');
      var r = E.commit(sh, draft.tokens, { mode: 'ns' });
      eq([r.ok, sh.fields.length], [true, 1], 'numbers written in by a delete stay inside the formula');
      eq(E.computeSheet(sh, S).byId[sh.fields[0].id].value, 48, 'and the value is what it would have been');
      var solo = { tokens: [E.T.ref(sh.fields[0].id)] };
      E.deleteFields(sh, [sh.fields[0].id], solo);
      eq(E.tokensToText(solo.tokens, sh, { settings: S }), '6 + (6 \u00d7 7)', 'a draft that was only the row becomes its formula, without extra brackets');
    });

    section('names left behind by an empty row', function () {
      function byId(sh, id) { return sh.fields.filter(function (f) { return f.id === id; })[0]; }
      function value(sh, f) { var r = E.computeSheet(sh, S).byId[f.id]; return r.status === 'ok' ? r.value : r.status; }
      var sh = E.newSheet('t');
      E.commit(sh, type(E.editor.create(), 'rate*3').tokens, { mode: 's' });
      var rate = sh.fields[0], x = sh.fields[1];
      eq([rate.symbol, rate.kind, x.kind], ['rate', 'input', 'output'], 'a letter makes an empty number row');
      E.deleteField(sh, rate.id);
      eq(E.tokensToText(x.formula, sh, { settings: S }), 'rate \u00d7 3', 'deleting the empty row leaves its symbol in the formula');
      eq(value(sh, x), 'unknown', 'which waits for a value');
      eq(Object.keys(E.looseNames(sh)), ['rate'], 'the name is known to be loose');
      var note = byId(sh, E.commit(sh, [E.T.num('5')], { mode: 'ns' }).fieldId);
      ok(E.renameSymbol(sh, note.id, 'rate').ok, 'another row may take the name');
      eq(x.formula[0], { t: 'ref', id: note.id }, 'and the formula is tied to that row');
      eq(value(sh, x), 15, 'so it has a value again');
      ok(E.renameSymbol(sh, note.id, 'r').ok, 'renaming the row again');
      eq(E.tokensToText(x.formula, sh, { settings: S }), 'r \u00d7 3', 'takes the formula with it');
      eq(Object.keys(E.looseNames(sh)), [], 'nothing is loose any more');

      sh = E.newSheet('u');
      E.commit(sh, type(E.editor.create(), 'q+1').tokens, { mode: 's' });
      var q = sh.fields[0], out = sh.fields[1];
      E.deleteField(sh, q.id);
      ok(!E.renameSymbol(sh, out.id, 'q').ok, 'a result cannot take a name its own formula is waiting for');
      eq(out.symbol, 'x', 'and keeps its symbol');
      var second = byId(sh, E.commit(sh, [E.T.ref(out.id), E.T.op('*'), E.T.num('2')], { mode: 's' }).fieldId);
      ok(/circle/.test(E.renameSymbol(sh, second.id, 'q').error || ''), 'nor can a result that depends on that formula');
      eq(value(sh, second), 'unknown', 'nothing was changed by the refusals');
      var made = E.commit(sh, [E.T.name('q')], { mode: 's' });
      eq([made.ok, made.kind], [true, 'input'], 'typing the name on its own brings the row back');
      eq(out.formula[0], { t: 'ref', id: made.fieldId }, 'and ties the formula to it');
      E.setInputValue(sh, made.fieldId, '4');
      eq([value(sh, out), value(sh, second)], [5, 10], 'both results follow');

      sh = E.newSheet('v');
      E.commit(sh, type(E.editor.create(), 'y+1').tokens, { mode: 's' });
      E.deleteField(sh, sh.fields[0].id);
      var third = byId(sh, E.commit(sh, type(E.editor.create(), '2*3').tokens, { mode: 's' }).fieldId);
      eq(third.symbol, 'z', 'a new result skips a symbol that a formula is waiting for');
      var loaded = E.importFile(E.exportSheetFile(sh));
      ok(loaded.ok && E.tokensToText(loaded.sheets[0].fields[0].formula, loaded.sheets[0], { settings: S }) === 'y + 1', 'a waiting name survives a sheet file');
    });

    section('awkward names', function () {
      // words that every JavaScript object inherits must behave like any other symbol
      var sheet = E.newSheet('t'), ed = E.editor;
      var r = E.commit(sheet, type(ed.create(), 'constructor*2').tokens, { mode: 's' });
      ok(r.ok, 'a symbol called constructor is accepted');
      eq(sheet.fields.map(function (f) { return f.symbol; }), ['constructor', 'x'], 'it becomes a normal input');
      eq(values(sheet).x, 'unknown', 'and waits for a value like any other');
      E.setInputValue(sheet, sheet.fields[0].id, '4');
      eq(values(sheet).x, 8, 'then calculates');
      eq(val('toString + 1'), 'unknown', 'an inherited name is not mistaken for a field');
      eq(calc('valueOf(3)').code, 'syntax', 'an inherited name is not mistaken for a function');
      var n = E.normalizeState({ sheets: { constructor: { name: 'Odd', fields: [] } }, view: { open: 'toString' } });
      eq([Object.keys(n.sheets), n.view.open], [['constructor'], null], 'odd sheet keys load safely');
      eq(E.importFile(JSON.stringify({ items: [{ type: 'sheet', id: 'hasOwnProperty' }], sheets: {} })).ok, false, 'a backup pointing at an inherited key has no sheets');
      var st = E.newState();
      ok(!E.findItem(st.items, 'constructor'), 'nothing is found in an empty list');
      ok(st.sheets.constructor === undefined, 'the sheet store has no inherited keys');
    });

    section('templates, copies and files', function () {
      var sheet = E.sheetFromSpec({ name: 'Compound interest', icon: '', fields: [
        { s: 'P', d: 'Starting amount', v: 1000, pre: '$' },
        { s: 'r', d: 'Yearly rate', v: 5, suf: '%' },
        { s: 'n', d: 'Times compounded per year', v: 12 },
        { s: 't', d: 'Years', v: 10 },
        { s: 'A', d: 'Final amount', f: 'P * (1 + r / 100 / n) ^ (n * t)', pre: '$' },
        { s: 'I', d: 'Interest earned', f: 'A - P', pre: '$' }
      ] });
      near(values(sheet).A, 1647.00949769028, 'compound interest');
      near(values(sheet).I, 647.00949769028, 'interest earned');
      eq(formulaOf(sheet, 'A'), 'P \u00d7 (1 + r \u00f7 100 \u00f7 n)^(n \u00d7 t)', 'template formula text');
      var copy = E.duplicateSheet(sheet, 'Copy');
      ok(copy.id !== sheet.id && copy.fields[0].id !== sheet.fields[0].id, 'a copy gets new ids');
      E.setInputValue(copy, bySym(copy, 'P').id, '2000');
      near(values(copy).A, 3294.01899538056, 'the copy calculates on its own');
      near(values(sheet).A, 1647.00949769028, 'the original is untouched');
      var back = E.importFile(E.exportSheetFile(sheet));
      ok(back.ok && back.sheets.length === 1, 'a sheet file reads back');
      near(values(back.sheets[0]).A, 1647.00949769028, 'the imported sheet calculates');
      ok(back.sheets[0].id !== sheet.id, 'imported sheets get new ids');
      eq(back.sheets[0].fields[0].prefix, '$', 'prefix survives');
      var csv = E.sheetToCSV(sheet, S);
      ok(csv.indexOf('P,Starting amount,1000,$ 1000,') >= 0 || csv.indexOf('P,Starting amount,1000,"$ 1,000",') >= 0, 'csv input row');
      ok(csv.indexOf('=P * (1 + r / 100 / n)^(n * t)') >= 0, 'csv formula column');
      ok(csv.charCodeAt(0) === 0xFEFF, 'csv starts with a byte order mark');
      ok(E.sheetToText(sheet, S).indexOf('Final amount: $ 1,647.01') >= 0, 'plain text export');
      eq(E.importFile('not json').ok, false, 'rubbish is refused');
      eq(E.importFile('{"hello":1}').ok, false, 'other json is refused');
      var hostile = E.importFile(JSON.stringify({ sheets: [{ name: 5, fields: [
        { id: 'a', kind: 'input', symbol: '<b>', value: 'NaN', desc: { x: 1 } },
        { id: 'b', kind: 'output', symbol: 'x', formula: [{ t: 'evil' }, { t: 'ref', id: 'a' }, { t: 'op', v: 'DROP' }, { t: 'num', v: '1e999' }, { t: 'fn', v: 'constructor' }] },
        null, 7
      ] }] }));
      ok(hostile.ok, 'a damaged file still opens');
      eq(hostile.sheets[0].fields.length, 2, 'damaged rows are dropped');
      eq(hostile.sheets[0].fields[0].symbol, 'a', 'bad symbols are replaced');
      eq(hostile.sheets[0].fields[0].value, null, 'bad values are cleared');
      eq(hostile.sheets[0].fields[1].formula.length, 1, 'unknown formula parts are dropped');
      eq(hostile.sheets[0].fields[1].formula[0].id, hostile.sheets[0].fields[0].id, 'links are re-pointed at the new ids');
      eq(E.computeSheet(hostile.sheets[0], S).byId[hostile.sheets[0].fields[1].id].status, 'unknown', 'and the cleaned sheet computes');
    });

    section('folders and saved state', function () {
      var st = E.newState();
      var a = E.addSheet(st, E.newSheet('A')), folder = E.addFolder(st, 'Work');
      var b = E.addSheet(st, E.newSheet('B'), folder.id);
      eq(st.items.length, 2, 'sheet and folder at the top');
      eq(folder.items.length, 1, 'sheet inside the folder');
      ok(E.moveItem(st, a.id, folder.id), 'move a sheet into a folder');
      eq([st.items.length, folder.items.length], [1, 2], 'after moving in');
      var sub = E.addFolder(st, 'Sub', folder.id);
      ok(!E.moveItem(st, folder.id, sub.id), 'a folder cannot move into itself');
      ok(E.moveItem(st, b.id, null), 'move back to the top');
      eq(st.items.length, 2, 'after moving out');
      var removed = E.removeItem(st, folder.id);
      eq(Object.keys(removed.sheets), [a.id], 'deleting a folder takes its sheets');
      ok(!st.sheets[a.id] && !!st.sheets[b.id], 'the other sheet stays');
      var backup = E.importFile(E.exportBackupFile((function () {
        var s2 = E.newState(), f2 = E.addFolder(s2, 'Bakery');
        E.addSheet(s2, E.newSheet('Cupcakes'), f2.id); E.addSheet(s2, E.newSheet('Loose'));
        return s2;
      })()));
      ok(backup.ok && backup.backup, 'a backup reads back');
      eq([backup.sheets.length, backup.items.length, backup.items[0].type, backup.items[0].items.length], [2, 2, 'folder', 1], 'folders survive a backup');
      var n = E.normalizeState({ settings: { mode: 'zzz', defMaxDec: 99, theme: 'dark', haptics: 'yes' }, items: [{ type: 'sheet', id: 'nope' }, 'junk'], sheets: { s1: { name: 'Kept', fields: [{ id: 'f', symbol: 'a', kind: 'input', value: 'x' }, null] } }, view: { open: 'gone' } });
      eq([n.settings.mode, n.settings.defMaxDec, n.settings.theme, n.settings.haptics], ['ns', 10, 'dark', true], 'settings are repaired');
      eq(n.items, [{ type: 'sheet', id: 's1' }], 'orphan sheets are listed and dead entries dropped');
      eq([n.sheets.s1.fields.length, n.sheets.s1.fields[0].value], [1, null], 'fields are repaired');
      eq(n.view.open, null, 'a missing open sheet is forgotten');
      eq(E.normalizeState(null).items.length, 0, 'nothing saved gives an empty start');
    });

    return { passed: passed, failed: failures.length, failures: failures };
  }

  return { run: run };
});
