#!/usr/bin/env python3
"""Checks the website in dist/ the way a phone's browser sees it: the page installs (manifest and
icons), keeps a copy of itself for offline use (service worker), and offers the Home Screen hint
only where it applies. Serves dist/ over HTTP on localhost, because a file:// page gets none of
these.

    python3 tests/site_test.py            (needs Playwright with Chromium)
"""
import http.server, json, os, socket, sys, threading
from playwright.sync_api import sync_playwright

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
DIST = os.path.join(ROOT, 'dist')
IPHONE_UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.6 Mobile/15E148 Safari/604.1'

passed = failed = 0


def check(cond, label, detail=''):
    global passed, failed
    if cond:
        passed += 1
    else:
        failed += 1
        print('FAILED: %s %s' % (label, detail))


class Quiet(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *a, **k):
        super().__init__(*a, directory=DIST, **k)

    def log_message(self, *a):
        pass

    def end_headers(self):
        self.send_header('Cache-Control', 'no-store')
        super().end_headers()


def home(page):
    """Waits for the app, then shows the home screen (a first run opens the example sheet)."""
    page.wait_for_function("() => window.Reckoner && document.querySelector('#fields .row, #home-list .item, #home-list .empty')")
    page.evaluate("() => { if (!document.getElementById('sheet').hidden) Reckoner.test.closeSheet(); }")
    page.wait_for_selector('#home-list .item, #home-list .empty')


def serve():
    with socket.socket() as s:
        s.bind(('127.0.0.1', 0))
        port = s.getsockname()[1]
    server = http.server.ThreadingHTTPServer(('127.0.0.1', port), Quiet)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    return server, 'http://127.0.0.1:%d/' % port


def main():
    server, base = serve()
    with sync_playwright() as p:
        browser = p.chromium.launch()

        # ---- the page as a website: manifest, icons, head
        ctx = browser.new_context(viewport={'width': 393, 'height': 852}, device_scale_factor=3, is_mobile=True, has_touch=True, user_agent=IPHONE_UA)
        page = ctx.new_page()
        page.goto(base)
        home(page)
        check(page.title() == 'Reckoner', 'the page is called Reckoner')
        check(page.locator('link[rel="manifest"]').count() == 1, 'the page links to its manifest')
        check(page.locator('link[rel="apple-touch-icon"]').count() == 1, 'the page names its Home Screen icon')
        manifest = page.evaluate("async () => { const r = await fetch('manifest.webmanifest'); return { status: r.status, body: await r.text() }; }")
        check(manifest['status'] == 200, 'the manifest is served', manifest['status'])
        m = json.loads(manifest['body'])
        check(m.get('display') == 'standalone' and m.get('start_url') == './' and m.get('scope') == './', 'the manifest opens the page full screen from its folder', m)
        for ico in m.get('icons', []):
            r = page.evaluate("async (u) => { const r = await fetch(u); const b = await r.arrayBuffer(); const h = new Uint8Array(b.slice(0, 8)); return { status: r.status, png: h[0] === 137 && h[1] === 80 && h[2] === 78 && h[3] === 71, bytes: b.byteLength }; }", ico['src'])
            check(r['status'] == 200 and r['png'] and r['bytes'] > 1000, 'icon %s is a PNG' % ico['src'], r)
        touch = page.evaluate("async () => { const r = await fetch(document.querySelector('link[rel=\"apple-touch-icon\"]').href); return r.status; }")
        check(touch == 200, 'the Home Screen icon is served', touch)

        # ---- the Home Screen hint on an iPhone that has not added the page yet
        hint = page.locator('#install-hint')
        check(hint.count() == 1 and 'Add to Home Screen' in hint.inner_text(), 'an iPhone in Safari is told how to add the page to its Home Screen')
        hint.locator('button[aria-label="Hide this note"]').click()
        check(page.locator('#install-hint').count() == 0, 'the hint goes when dismissed')
        page.reload()
        home(page)
        check(page.locator('#install-hint').count() == 0, 'and stays away after a reload')

        # ---- the offline copy
        page.evaluate("() => navigator.serviceWorker.ready")
        page.wait_for_function("async () => (await caches.keys()).includes('reckoner-site-1')")
        kept = page.evaluate("async () => { const c = await caches.open('reckoner-site-1'); const keys = await c.keys(); return keys.map(k => new URL(k.url).pathname); }")
        check(any(k.endswith('/index.html') for k in kept) and any(k.endswith('/icon-192.png') for k in kept), 'the page and its icons are kept on the device', kept)
        page.wait_for_function("() => !!navigator.serviceWorker.controller")
        ctx.set_offline(True)
        page.reload()
        home(page)
        check(page.title() == 'Reckoner' and page.locator('#new-sheet').count() == 1, 'the app opens with no connection')
        offline_ok = page.evaluate("async () => { try { const r = await fetch('manifest.webmanifest'); return r.status; } catch (e) { return 'threw ' + e; } }")
        check(offline_ok == 200, 'kept files are served while offline', offline_ok)
        ctx.set_offline(False)
        ctx.close()

        # ---- once on the Home Screen, no hint and the right words in Settings
        ctx2 = browser.new_context(viewport={'width': 393, 'height': 852}, device_scale_factor=3, is_mobile=True, has_touch=True, user_agent=IPHONE_UA)
        ctx2.add_init_script("Object.defineProperty(navigator, 'standalone', { get: () => true });")
        p2 = ctx2.new_page()
        p2.goto(base)
        home(p2)
        check(p2.locator('#install-hint').count() == 0, 'no hint once the page is on the Home Screen')
        p2.locator('button[aria-label="Settings"]').click()
        p2.wait_for_selector('.panel')
        check('kept on this device by the app' in p2.locator('.panel').inner_text(), 'Settings say where the sheets are kept')
        ctx2.close()

        # ---- a desktop browser: either no hint, or the browser's own install offer behind an Install button
        ctx3 = browser.new_context(viewport={'width': 1200, 'height': 800})
        p3 = ctx3.new_page()
        p3.goto(base)
        home(p3)
        p3.wait_for_timeout(600)
        n = p3.locator('#install-hint').count()
        check(n == 0 or p3.locator('#install-hint button.chip').count() == 1, 'on a desktop the hint only appears with the browser’s Install offer')
        errors = []
        p3.on('pageerror', lambda e: errors.append(str(e)))
        p3.reload()
        home(p3)
        check(not errors, 'no script errors on the site', errors)
        ctx3.close()
        browser.close()
    server.shutdown()
    print('%d passed, %d failed' % (passed, failed))
    sys.exit(1 if failed else 0)


if __name__ == '__main__':
    main()
