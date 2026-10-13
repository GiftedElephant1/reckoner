#!/usr/bin/env python3
"""Makes the icons the web page needs from the app icon in assets/icon-1024.png.

    python3 tools/make_web_icons.py

Writes into dist/icons:
  apple-touch-icon.png   180 px, the Home Screen icon on iPhone and iPad
  icon-192.png           192 px, the browser tab and Android Home Screen icon
  icon-512.png           512 px, the install screen on Android
  icon-512-maskable.png  512 px with the picture pulled in, for launchers that cut icons into shapes
"""
import os
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SOURCE = os.path.join(ROOT, 'assets', 'icon-1024.png')
OUT = os.path.join(ROOT, 'dist', 'icons')


def lerp(a, b, t):
    return tuple(round(a[i] + (b[i] - a[i]) * t) for i in range(3))


def maskable(icon, size):
    # The icon's own green, top to bottom, behind a smaller copy of the picture: a launcher that
    # cuts a circle out of the middle still shows the whole sheet.
    top, bottom = icon.getpixel((icon.width // 2, 2)), icon.getpixel((icon.width // 2, icon.height - 3))
    big = size * 4
    grad = Image.new('RGB', (1, big))
    for y in range(big):
        grad.putpixel((0, y), lerp(top[:3], bottom[:3], y / (big - 1)))
    back = grad.resize((big, big))
    inner = round(big * 0.80)
    pic = icon.convert('RGB').resize((inner, inner), Image.LANCZOS)
    back.paste(pic, ((big - inner) // 2, (big - inner) // 2))
    return back.resize((size, size), Image.LANCZOS)


def main():
    icon = Image.open(SOURCE).convert('RGB')
    os.makedirs(OUT, exist_ok=True)
    for name, size in (('apple-touch-icon.png', 180), ('icon-192.png', 192), ('icon-512.png', 512)):
        icon.resize((size, size), Image.LANCZOS).save(os.path.join(OUT, name), optimize=True)
    maskable(icon, 512).save(os.path.join(OUT, 'icon-512-maskable.png'), optimize=True)
    for name in sorted(os.listdir(OUT)):
        print('%-24s %6d bytes' % (name, os.path.getsize(os.path.join(OUT, name))))


if __name__ == '__main__':
    main()
