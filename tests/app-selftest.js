/* Reckoner's in-app self-test.

   The iPhone app runs this file when it is launched with the argument -selftest (the cloud
   build does that in the iPhone simulator). It runs the calculation checks, then uses the
   real interface the way a person would, and hands the outcome to the app, which writes it
   to Documents/selftest.json. Everything it creates is removed again at the end. */
(function (root) {
  'use strict';
  var doc = root.document, R = root.Reckoner, T = R && R.test, E = root.ReckonerEngine;
  var out = { type: 'selftest', passed: 0, failed: 0, failures: [], info: {} };

  function check(ok, label, detail) {
    if (ok) { out.passed++; return; }
    out.failed++;
    out.failures.push(label + (detail !== undefined ? ' :: ' + String(detail) : ''));
  }
  function eq(actual, expected, label) {
    check(JSON.stringify(actual) === JSON.stringify(expected), label, 'expected ' + JSON.stringify(expected) + ', got ' + JSON.stringify(actual));
  }
  function $(sel) { return doc.querySelector(sel); }
  function $all(sel) { return Array.prototype.slice.call(doc.querySelectorAll(sel)); }
  function text(sel) { var el = $(sel); return el ? el.textContent.replace(/\u00a0/g, ' ').trim() : null; }

  function press(k) {
    var b = $('#pad [data-k="' + k + '"]');
    if (!b) throw new Error('there is no key ' + k);
    if (b.classList.contains('off')) throw new Error('the key ' + k + ' is switched off');
    b.click();
  }
  var KEY = { '.': 'dot', '+': 'op:+', '-': 'op:-', '*': 'op:*', '/': 'op:/', '(': 'lp', ')': 'rp', '=': 'enter', '%': 'pct' };
  function type(s) {
    for (var i = 0; i < s.length; i++) {
      var ch = s.charAt(i);
      press(ch >= '0' && ch <= '9' ? 'd:' + ch : KEY[ch]);
    }
  }
  function rows() {
    return $all('#fields .row').map(function (r) {
      function part(sel) { var el = r.querySelector(sel); return el ? el.textContent : ''; }
      return { id: r.getAttribute('data-id'), sym: part('.sym'), desc: part('.desc'), num: part('.num'), el: r };
    });
  }
  function row(sym) { var all = rows(); for (var i = 0; i < all.length; i++) if (all[i].sym === sym) return all[i]; return null; }
  function nums() { var o = {}; rows().forEach(function (r) { o[r.sym] = r.num; }); return o; }
  function syms() { return rows().map(function (r) { return r.sym; }); }
  function px(value) {
    var probe = doc.createElement('div');
    probe.style.cssText = 'position:absolute;visibility:hidden;height:' + value;
    doc.body.appendChild(probe);
    var h = probe.getBoundingClientRect().height;
    doc.body.removeChild(probe);
    return Math.round(h * 100) / 100;
  }

  function finish() {
    out.info.finished = new Date().toISOString();
    try {
      if (root.ReckonerUI) root.ReckonerUI.toast('Self-test: ' + out.passed + ' passed, ' + out.failed + ' failed', { ms: 8000 });
    } catch (e) { /* the message is only a convenience */ }
    try { root.webkit.messageHandlers.reckoner.postMessage(out); } catch (e2) { /* no app around us */ }
    root.__RECKONER_SELFTEST__ = out;
  }

  if (!T || !E) {
    out.failed++; out.failures.push('the app did not start: window.Reckoner is missing');
    finish();
    return;
  }

  var snapshot = T.snapshot();
  try {
    // ------------------------------------------------------------ where are we running
    out.info.userAgent = root.navigator.userAgent;
    out.info.screen = root.innerWidth + ' x ' + root.innerHeight + ' @' + (root.devicePixelRatio || 1);
    // the margins the page is actually using, as told by the app or else read from CSS
    out.info.safeTop = px('var(--sat)');
    out.info.safeBottom = px('var(--sab)');
    out.info.dark = !!(root.matchMedia && root.matchMedia('(prefers-color-scheme: dark)').matches);
    out.info.native = !!root.__RECKONER_NATIVE__;
    if (out.info.native) check(out.info.safeTop >= 20, 'the page leaves room for the status bar', out.info.safeTop + ' at the top');
    out.info.version = R.version;

    // ------------------------------------------------------------ the calculation engine
    if (root.ReckonerEngineTests) {
      var er = root.ReckonerEngineTests.run(E);
      out.info.engine = er.passed + ' passed, ' + er.failed + ' failed';
      out.passed += er.passed; out.failed += er.failed;
      er.failures.slice(0, 20).forEach(function (f) { out.failures.push('engine: ' + f); });
    } else check(false, 'the engine checks are bundled');

    // ------------------------------------------------------------ the interface
    var st = T.state().settings;
    st.numFmt = 'us'; st.mode = 'ns'; st.autoBracket = true; st.defMinDec = 0; st.defMaxDec = 2; st.group = true; st.showSymbols = true;

    T.newBlank('Self-test');
    eq(text('#sheet .head .title'), 'Self-test', 'a new sheet opens');
    check(!!$('#fields .empty'), 'a blank sheet explains itself');
    type('5.73*458/27');
    eq(text('#entry .res'), '97.2', 'the answer shows while typing');
    press('enter');
    eq(syms(), ['a', 'b', 'c', 'x'], 'three numbers and a result become rows');
    eq(nums(), { a: '5.73', b: '458', c: '27', x: '97.2' }, 'with their values');
    eq(row('x').desc, 'a \u00d7 b \u00f7 c', 'an unnamed result shows its formula');

    T.select(row('b').id);
    type('523');
    eq(nums().x, '110.99', 'changing a number updates the result');
    press('enter');

    type('34*2+');
    eq(text('#entry .expr').replace(/\s+/g, ''), '(34\u00d72)+', 'brackets are added when the operator rank changes');
    press('link');
    check(!!$('#pad .padnote'), 'the keypad asks which row to use');
    row('x').el.querySelector('.row-main').click();
    eq(text('#entry .res'), '178.99', 'a linked row joins the calculation');
    press('enter');
    eq(syms(), ['a', 'b', 'c', 'x', 'd', 'e', 'y'], 'the second calculation adds its rows');

    // smart delete, through the row details panel
    row('d').el.querySelector('.row-main').click();
    check(!!$('.ovl .panel') && text('.ovl .panel-title') === 'Row details', 'tapping the left of a row opens its details');
    var del = $all('.ovl .btn').filter(function (b) { return /Delete this row/.test(b.textContent); })[0];
    check(!!del, 'the details offer to delete the row');
    if (del) del.click();
    eq(syms(), ['a', 'b', 'c', 'x', 'e', 'y'], 'the row is deleted');
    eq(row('y').desc, '(34 \u00d7 e) + x', 'and its number is written into the formula');
    eq(nums().y, '178.99', 'so the result is unchanged');

    // percent
    type('200+10%');
    eq(text('#entry .res'), '220', '200 + 10% is 220');
    press('clear'); press('clear');

    // a formula with a letter
    $('#bar .ib.mode').click();
    check(!!$('#pad.abc'), 'the letter keys appear');
    press('ch:n'); press('op:*'); press('lp'); press('ch:n'); press('op:+');
    press('num');
    type('1)/2');
    eq(text('#entry .res'), '?', 'no answer until n has a value');
    press('enter');
    check(/\bsel\b/.test(row('n').el.className), 'the new empty row is ready for its number');
    type('48');
    var formulaRow = rows().filter(function (r) { return r.desc.indexOf('n \u00d7 (n + ') === 0; })[0];
    eq(formulaRow ? formulaRow.num : null, '1,176', 'n = 48 gives 1,176');
    press('enter');

    // a total
    T.newBlank('Self-test log');
    ['23', '24.01', '12.5'].forEach(function (n) { type(n); press('enter'); });
    press('fn');
    var tot = $all('.ovl button').filter(function (b) { return /Total of the rows above/.test(b.textContent); })[0];
    check(!!tot, 'the functions list offers a total');
    if (tot) tot.click();
    eq([row('x') && row('x').desc, nums().x], ['Total', '59.51'], 'the total is added and named');
    type('8'); press('enter');
    eq(nums().x, '67.51', 'a new number is counted in the total');

    // exports
    T.openSheet(Object.keys(T.state().sheets).filter(function (id) { return T.state().sheets[id].name === 'Self-test'; })[0]);
    var pdf = T.buildPDF();
    check(pdf && pdf.length > 1500 && String.fromCharCode.apply(null, pdf.subarray(0, 8)) === '%PDF-1.4', 'a PDF is made', pdf && pdf.length);
    var csv = T.csv();
    check(csv.indexOf('110.99') >= 0 && csv.indexOf('=a * b / c') >= 0, 'the CSV has values and formulas', csv.slice(0, 160));
    T.newBlank('\u65e5\u672c\u8a9e');
    type('1200*3'); press('enter');
    var pdf2 = T.buildPDF();
    check(pdf2 && pdf2.length > 20000, 'a sheet in another script exports as page images', pdf2 && pdf2.length);

    // the layout on this screen
    var pad = $('#pad').getBoundingClientRect(), key7 = $('#pad [data-k="d:7"]').getBoundingClientRect(), top = $('#sheet .top').getBoundingClientRect();
    check(pad.bottom <= root.innerHeight + 1, 'the keypad fits on the screen', pad.bottom + ' > ' + root.innerHeight);
    check(key7.height >= 38 && key7.width >= 44, 'the keys are big enough to tap', key7.width + ' x ' + key7.height);
    check(doc.documentElement.scrollWidth <= root.innerWidth + 1, 'nothing overflows sideways');
    check(top.top >= -0.5 && top.height >= 44, 'the top bar is on screen');
    out.info.keySize = Math.round(key7.width) + ' x ' + Math.round(key7.height);
    out.info.rowsVisible = Math.floor($('#fields').getBoundingClientRect().height / 57);
    out.info.fontNumber = root.getComputedStyle($('#pad [data-k="d:7"]')).fontFamily.split(',')[0];

    // saving
    T.flush();
    var kept = null;
    try { kept = root.localStorage.getItem('reckoner.state.v1'); } catch (e3) { kept = null; }
    out.info.localStorage = !!kept;
    if (!out.info.native) check(!!kept && kept.indexOf('Self-test log') > 0, 'changes are saved in the browser');
  } catch (err) {
    out.failed++;
    out.failures.push('stopped early: ' + (err && err.message ? err.message : String(err)));
  }

  // leave things as they were found
  try {
    T.load(snapshot);
    var names = Object.keys(T.state().sheets).map(function (id) { return T.state().sheets[id].name; });
    check(names.indexOf('Self-test') < 0 && names.indexOf('Self-test log') < 0, 'the test sheets are gone again');
  } catch (err2) {
    out.failed++; out.failures.push('could not restore the sheets: ' + (err2 && err2.message ? err2.message : String(err2)));
  }
  finish();
})(typeof self !== 'undefined' ? self : this);
