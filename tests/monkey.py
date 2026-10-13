"""A stress test: taps around the app at random for a long time and watches for anything broken.

    python3 tests/monkey.py [seed] [actions]

After every action it checks that no script error was logged, that every sheet still computes,
that no formula points at a row that is gone, that symbols are unique, and that the screen shows
no "undefined" or "NaN". The seed makes a failing run repeatable.
"""
import json, os, random, sys
from playwright.sync_api import sync_playwright

SEED = int(sys.argv[1]) if len(sys.argv) > 1 else 1
STEPS = int(sys.argv[2]) if len(sys.argv) > 2 else 800
URL = 'file://' + os.path.abspath(os.path.join(os.path.dirname(__file__), '..', 'dist', 'index.html'))

INVARIANTS = """() => {
  const T = Reckoner.test, E = Reckoner.engine, st = T.state(), problems = [];
  const listed = new Set();
  (function walk(items) { for (const it of items) { if (it.type === 'folder') walk(it.items); else listed.add(it.id); } })(st.items);
  for (const id in st.sheets) if (!listed.has(id)) problems.push('sheet not listed: ' + st.sheets[id].name);
  for (const id of listed) if (!st.sheets[id]) problems.push('listed sheet missing: ' + id);
  for (const id in st.sheets) {
    const sh = st.sheets[id], ids = new Set(), syms = new Set();
    for (const f of sh.fields) {
      if (ids.has(f.id)) problems.push('duplicate id in ' + sh.name);
      ids.add(f.id);
      if (syms.has(f.symbol)) problems.push('duplicate symbol ' + f.symbol + ' in ' + sh.name);
      syms.add(f.symbol);
      if (!f.symbol) problems.push('empty symbol in ' + sh.name);
    }
    for (const f of sh.fields) {
      if (f.kind !== 'output') continue;
      if (!Array.isArray(f.formula) || !f.formula.length) problems.push('empty formula for ' + f.symbol + ' in ' + sh.name);
      for (const t of f.formula || []) {
        if (t.t === 'ref' && !ids.has(t.id)) problems.push('formula of ' + f.symbol + ' points at a missing row in ' + sh.name);
        if (t.t === 'name' && syms.has(t.v)) problems.push('formula of ' + f.symbol + ' has the loose name ' + t.v + ' although a row carries it, in ' + sh.name);
        if (t.t === 'ref' && ids.has(t.id) && (t.id === f.id || E.dependsOn(sh, t.id, f.id))) problems.push('formula of ' + f.symbol + ' goes round in a circle in ' + sh.name);
      }
    }
    let res;
    try { res = E.computeSheet(sh, st.settings).byId; } catch (e) { problems.push('compute threw in ' + sh.name + ': ' + e.message); continue; }
    for (const f of sh.fields) {
      const d = E.displayField(f, res[f.id], st.settings);
      if (/undefined|NaN|null|\\[object/.test(d.text + d.prefix + d.suffix)) problems.push('bad display for ' + f.symbol + ' in ' + sh.name + ': ' + d.text);
    }
  }
  const shown = document.getElementById('app').innerText;
  const bad = /undefined|NaN|\\[object|Infinity/.exec(shown);
  if (bad) problems.push('the screen shows "' + bad[0] + '"');
  const ui = T.ui();
  if (!document.getElementById('sheet').hidden) {
    const sh = T.sheet();
    if (!sh) problems.push('sheet screen without a sheet');
    else if (document.querySelectorAll('#fields .row').length !== sh.fields.length) problems.push('rows on screen differ from the sheet: ' + document.querySelectorAll('#fields .row').length + ' vs ' + sh.fields.length);
    if (ui.sel && !sh.fields.some(f => f.id === ui.sel)) problems.push('a deleted row is still selected');
    if (ui.entry) for (const t of ui.entry.tokens) if (t.t === 'ref' && !sh.fields.some(f => f.id === t.id)) problems.push('the calculation being typed points at a missing row');
    if ((ui.bracket || ui.link) && !ui.entry) problems.push('a helper is open with no calculation');
    if (ui.entry && (ui.entry.cur < -1 || ui.entry.cur >= ui.entry.tokens.length)) problems.push('the cursor is outside the calculation: ' + ui.entry.cur + ' of ' + ui.entry.tokens.length);
    if (ui.editId && !sh.fields.some(f => f.id === ui.editId)) problems.push('editing the formula of a deleted row');
  }
  const app = document.getElementById('app');
  if (app.scrollTop || app.scrollLeft) problems.push('the app frame scrolled');
  return problems;
}"""


def main():
    rng = random.Random(SEED)
    log = []
    with sync_playwright() as p:
        browser = p.chromium.launch()
        ctx = browser.new_context(viewport={'width': 390, 'height': 844}, device_scale_factor=1, is_mobile=True, has_touch=True, locale='en-US')
        page = ctx.new_page()
        page.set_default_timeout(4000)
        errors = []
        page.on('console', lambda m: errors.append(m.text) if m.type == 'error' else None)
        page.on('pageerror', lambda e: errors.append('PAGEERROR ' + str(e)))
        page.goto(URL)
        page.wait_for_selector('#fields .row')

        def visible(sel):
            return [el for el in page.locator(sel).all() if el.is_visible()]

        def click_random(sel, what):
            els = visible(sel)
            if not els:
                return False
            el = rng.choice(els)
            label = (el.get_attribute('data-k') or el.get_attribute('aria-label') or el.inner_text() or '')[:30].replace('\n', ' ')
            log.append('%s: %s' % (what, label))
            try:
                el.click(timeout=1500)
            except Exception as ex:  # covered by an animation or gone again; not a fault of the app
                log.append('  (click skipped: %s)' % str(ex).split('\n')[0][:60])
            return True

        def tap_row(zone):
            rows = visible('#fields .row .row-main')
            if not rows:
                return False
            row = rng.choice(rows)
            box = row.bounding_box()
            if not box:
                return False
            x = box['x'] + (60 if zone == 'left' else box['width'] - 40)
            log.append('tap row %s' % zone)
            page.mouse.click(x, box['y'] + box['height'] / 2)
            return True

        def swipe_row(full):
            rows = visible('#fields .row .row-main')
            if not rows:
                return False
            box = rng.choice(rows).bounding_box()
            if not box:
                return False
            x, y = box['x'] + box['width'] - 30, box['y'] + box['height'] / 2
            dist = 300 if full else 130
            log.append('swipe row %s' % ('fully' if full else 'open'))
            page.mouse.move(x, y)
            page.mouse.down()
            for i in range(1, 9):
                page.mouse.move(x - dist * i / 8, y)
            page.mouse.up()
            if not full and rng.random() < 0.7:
                click_random('#fields .row.reveal .row-del', 'delete button')
            return True

        def act():
            overlay = page.locator('.ovl.open').count() > 0
            if overlay:
                r = rng.random()
                if r < 0.45:
                    return click_random('.ovl.open button:not([disabled])', 'in panel')
                if r < 0.6:
                    inputs = visible('.ovl.open input[type=text]')
                    if inputs:
                        el = rng.choice(inputs)
                        text = rng.choice(['Rent', 'x1', 'a', '9lives', 'sum', 'Total cost', '$', 'kg', '', 'b', 'pi', 'if', '日本', 'n'])
                        log.append('fill %s with %r' % (el.get_attribute('id'), text))
                        el.fill(text)
                        return True
                log.append('close panel')
                page.keyboard.press('Escape')
                return True
            if page.locator('#home').is_visible():
                r = rng.random()
                if r < 0.5:
                    return click_random('#home-list .item-main', 'open item')
                if r < 0.7:
                    return click_random('#home button', 'home button')
                if r < 0.85:
                    log.append('new blank sheet')
                    page.evaluate("() => Reckoner.test.newBlank('Monkey')")
                    return True
                return click_random('#new-sheet', 'new sheet panel')
            r = rng.random()
            if r < 0.52:
                return click_random('#pad button:not(.off)', 'key')
            if r < 0.62:
                return tap_row('right')
            if r < 0.67:
                return tap_row('left')
            if r < 0.72:
                rows = visible('#fields .row.out .row-main')
                if rows:
                    box = rng.choice(rows).bounding_box()
                    if box:
                        log.append('double tap result')
                        page.mouse.dblclick(box['x'] + box['width'] - 40, box['y'] + box['height'] / 2)
                        return True
                return False
            if r < 0.78:
                return swipe_row(rng.random() < 0.5)
            if r < 0.86:
                return click_random('#bar button:not([disabled])', 'bar')
            if r < 0.9:
                return click_random('#toast.show button', 'toast action')
            if r < 0.93:
                return click_random('#entry .tk', 'token')
            if r < 0.96:
                return click_random('#sheet .top button:not([disabled]), #sheet .head button, #fields .chip, #fields .note button', 'sheet chrome')
            if r < 0.98:
                key = rng.choice(['Escape', 'Enter', 'Backspace', '7', '+', '(', ')', 'q', '%', '.', 'Delete', 'ArrowLeft'])
                log.append('keyboard %s' % key)
                page.keyboard.press(key)
                return True
            log.append('reload the page')
            page.evaluate("() => Reckoner.test.flush()")
            page.reload()
            page.wait_for_selector('#app .screen')
            return True

        done = 0
        while done < STEPS:
            try:
                if act():
                    done += 1
            except Exception as ex:
                log.append('  (action raised %s)' % str(ex).split('\n')[0][:80])
                done += 1
            problems = page.evaluate(INVARIANTS)
            if errors or problems:
                print('seed %d failed after %d actions' % (SEED, done))
                for e in errors[:5]:
                    print('  script error:', e)
                for pr in problems[:8]:
                    print('  problem:', pr)
                print('last actions:')
                for line in log[-25:]:
                    print('   ', line)
                page.screenshot(path=os.path.join(os.path.dirname(__file__), 'monkey-fail-%d.png' % SEED))
                browser.close()
                return 1
        stats = page.evaluate("() => { const s = Reckoner.test.state(); return { sheets: Object.keys(s.sheets).length, rows: Object.values(s.sheets).reduce((n, sh) => n + sh.fields.length, 0) }; }")
        browser.close()
    print('seed %d: %d actions, no problems (%d sheets, %d rows at the end)' % (SEED, done, stats['sheets'], stats['rows']))
    return 0


sys.exit(main())
