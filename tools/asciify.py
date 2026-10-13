#!/usr/bin/env python3
"""Rewrites non-ASCII characters in JavaScript sources as \\uXXXX escapes.

The app's scripts end up inside an HTML file and inside an iOS bundle; keeping them pure
ASCII means no tool along the way can damage a minus sign or a no-break space."""
import sys

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

changed = 0
for path in sys.argv[1:]:
    with open(path, encoding='utf-8') as f:
        src = f.read()
    dst = asciify(src)
    if dst != src:
        with open(path, 'w', encoding='utf-8', newline='\n') as f:
            f.write(dst)
        changed += 1
print('asciify: %d of %d files rewritten' % (changed, len(sys.argv) - 1))
