#!/usr/bin/env python3
"""Builds Reckoner's single-file web app from src/.

Outputs
  dist/index.html            the complete app as one HTML file: the web page, published as the site
  ios/Reckoner/Web/index.html  the same app, bundled into the iOS app
  ios/Reckoner/Web/selftest.js the checks the iOS app runs when launched with -selftest
  dist/preview.html          the app without its document shell, for the hosted preview

The rest of the website is kept in dist/ as it is: manifest.webmanifest, sw.js and icons/
(made by tools/make_web_icons.py).
"""
import base64, os, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, 'src')
JS_ORDER = ['engine.js', 'pdf-metrics.js', 'pdf.js', 'data.js', 'ui.js', 'app.js']

def read(*parts):
    with open(os.path.join(*parts), encoding='utf-8') as f:
        return f.read()

def write(path, text):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, 'w', encoding='utf-8', newline='\n') as f:
        f.write(text)

def asciify(text):
    out = []
    for ch in text:
        o = ord(ch)
        if o < 128:
            out.append(ch)
        elif o < 0x10000:
            out.append('\\u%04x' % o)
        else:
            o -= 0x10000
            out.append('\\u%04x\\u%04x' % (0xD800 + (o >> 10), 0xDC00 + (o & 0x3FF)))
    return ''.join(out)

def scripts():
    parts = []
    for name in JS_ORDER:
        js = asciify(read(SRC, name))
        if '</script' in js.lower():
            sys.exit('%s contains a closing script tag' % name)
        parts.append('<script>\n' + js.rstrip() + '\n</script>')
    return '\n'.join(parts)

def main():
    css = read(SRC, 'styles.css').rstrip()
    js = scripts()
    icon_path = os.path.join(ROOT, 'assets', 'icon-180.png')
    touch_icon = ''
    if os.path.exists(icon_path):
        with open(icon_path, 'rb') as f:
            touch_icon = '<link rel="apple-touch-icon" href="data:image/png;base64,%s">\n' % base64.b64encode(f.read()).decode('ascii')

    body = '<div class="app" id="app"></div>\n<noscript>Reckoner needs JavaScript to run.</noscript>\n' + js + '\n'

    head = ('<!doctype html>\n<html lang="en" class="native">\n<head>\n<meta charset="utf-8">\n'
            '<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover">\n'
            '<meta name="format-detection" content="telephone=no">\n'
            '<meta name="apple-mobile-web-app-capable" content="yes">\n'
            '<meta name="mobile-web-app-capable" content="yes">\n'
            '<meta name="apple-mobile-web-app-title" content="Reckoner">\n'
            '<meta name="apple-mobile-web-app-status-bar-style" content="default">\n'
            '<meta name="color-scheme" content="light dark">\n')
    tail = '<title>Reckoner</title>\n<style>\n' + css + '\n</style>\n</head>\n<body>\n' + body + '</body>\n</html>\n'

    # the iOS app carries its icon inside the page; the website links to real files, which is
    # what Safari and Android need before they will put the page on a Home Screen
    ios_page = head + touch_icon + tail
    site_page = (head
                 + '<meta name="description" content="A pocket spreadsheet. Type a calculation once and every number in it becomes a row you can change later.">\n'
                 + '<meta name="theme-color" content="#FFFFFF" media="(prefers-color-scheme: light)">\n'
                 + '<meta name="theme-color" content="#1D2622" media="(prefers-color-scheme: dark)">\n'
                 + '<link rel="manifest" href="manifest.webmanifest">\n'
                 + '<link rel="apple-touch-icon" href="icons/apple-touch-icon.png">\n'
                 + '<link rel="icon" type="image/png" sizes="192x192" href="icons/icon-192.png">\n'
                 + tail)

    preview = '<title>Reckoner</title>\n<style>\n' + css + '\n</style>\n' + body

    write(os.path.join(ROOT, 'dist', 'index.html'), site_page)
    write(os.path.join(ROOT, 'dist', 'preview.html'), preview)
    write(os.path.join(ROOT, 'ios', 'Reckoner', 'Web', 'index.html'), ios_page)
    for name in ('manifest.webmanifest', 'sw.js', os.path.join('icons', 'apple-touch-icon.png'), os.path.join('icons', 'icon-192.png'), os.path.join('icons', 'icon-512.png'), os.path.join('icons', 'icon-512-maskable.png')):
        if not os.path.exists(os.path.join(ROOT, 'dist', name)):
            sys.exit('dist/%s is missing; the website needs it (icons come from tools/make_web_icons.py)' % name.replace(os.sep, '/'))
    full = site_page
    selftest = asciify(read(ROOT, 'tests', 'engine-tests.js')) + '\n' + asciify(read(ROOT, 'tests', 'app-selftest.js')) if os.path.exists(os.path.join(ROOT, 'tests', 'app-selftest.js')) else asciify(read(ROOT, 'tests', 'engine-tests.js'))
    write(os.path.join(ROOT, 'ios', 'Reckoner', 'Web', 'selftest.js'), selftest)
    print('built dist/index.html (%d KB), dist/preview.html, ios/Reckoner/Web/' % (len(full.encode('utf-8')) // 1024))

if __name__ == '__main__':
    main()
