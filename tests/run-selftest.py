"""Runs the in-app self-test (the file the iPhone app runs with -selftest) in headless Chromium,
with a stand-in for the app's native side.

    python3 tests/run-selftest.py
"""
import json, os, sys
from playwright.sync_api import sync_playwright

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
URL = 'file://' + os.path.join(ROOT, 'ios', 'Reckoner', 'Web', 'index.html')
SELFTEST = os.path.join(ROOT, 'ios', 'Reckoner', 'Web', 'selftest.js')

FAKE_NATIVE = """
window.__RECKONER_NATIVE__ = { platform: 'test' };
window.__posted = [];
window.webkit = { messageHandlers: { reckoner: { postMessage: function (m) { window.__posted.push(JSON.parse(JSON.stringify(m))); } } } };
"""

with sync_playwright() as p:
    browser = p.chromium.launch()
    ctx = browser.new_context(viewport={'width': 393, 'height': 852}, device_scale_factor=3, is_mobile=True, has_touch=True, locale='de-DE')
    page = ctx.new_page()
    errors = []
    page.on('console', lambda m: errors.append(m.text) if m.type == 'error' else None)
    page.on('pageerror', lambda e: errors.append('PAGEERROR ' + str(e)))
    page.add_init_script(FAKE_NATIVE)
    page.goto(URL)
    page.wait_for_selector('#fields .row')
    before = page.evaluate("() => Reckoner.test.snapshot()")
    page.add_script_tag(path=SELFTEST)
    page.wait_for_function("() => !!window.__RECKONER_SELFTEST__")
    out = page.evaluate("() => window.__RECKONER_SELFTEST__")
    posted = page.evaluate("() => window.__posted")
    after = page.evaluate("() => Reckoner.test.snapshot()")
    browser.close()

kinds = [m.get('type') for m in posted]
problems = list(out['failures'])
if errors:
    problems.append('console errors: %r' % errors)
if 'selftest' not in kinds:
    problems.append('no selftest message reached the app')
if 'ready' not in kinds or 'save' not in kinds:
    problems.append('the app did not send ready and save: %r' % sorted(set(kinds)))
b, a = json.loads(before), json.loads(after)
b.pop('savedAt', None); a.pop('savedAt', None)
if b != a:
    problems.append('the self-test left the sheets changed')
print(json.dumps(out['info'], indent=1, ensure_ascii=False))
print('%d passed, %d failed' % (out['passed'], out['failed'] + (len(problems) - len(out['failures']))))
for f in problems:
    print('  FAIL ' + f)
sys.exit(1 if problems else 0)
