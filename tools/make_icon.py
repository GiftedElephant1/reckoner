#!/usr/bin/env python3
"""Draws Reckoner's app icon: a small sheet of rows on pine green, the result marked with a
highlighter. Writes the 1024 px icon for the iOS asset catalog and a 180 px one for the web build.

    python3 tools/make_icon.py
"""
import os
from PIL import Image, ImageDraw, ImageFilter

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
S = 4096            # drawn large, then scaled down for smooth edges
U = S / 1024.0      # one icon pixel

def lerp(a, b, t):
    return tuple(round(a[i] + (b[i] - a[i]) * t) for i in range(3))

def rounded(draw, box, radius, fill):
    draw.rounded_rectangle([round(v) for v in box], radius=round(radius), fill=fill)

def draw_icon():
    top, bottom = (17, 128, 105), (6, 78, 63)
    img = Image.new('RGB', (S, S), top)
    px = img.load()
    grad = Image.new('RGB', (1, S))
    for y in range(S):
        grad.putpixel((0, y), lerp(top, bottom, y / (S - 1)))
    img = grad.resize((S, S))

    over = Image.new('RGBA', (S, S), (0, 0, 0, 0))
    d = ImageDraw.Draw(over)
    left, right = 160 * U, 864 * U
    rows = [296 * U, 512 * U, 728 * U]
    bar_h = 86 * U

    # ruled lines between the rows
    for y in (404 * U, 620 * U):
        d.rectangle([round(left), round(y - 3 * U), round(right), round(y + 3 * U)], fill=(255, 255, 255, 46))

    # the names on the left, the numbers on the right
    for y, name_w, num_w in ((rows[0], 170, 290), (rows[1], 126, 196)):
        rounded(d, (left, y - bar_h / 2, left + name_w * U, y + bar_h / 2), bar_h / 2, (255, 255, 255, 110))
        rounded(d, (right - num_w * U, y - bar_h / 2, right, y + bar_h / 2), bar_h / 2, (255, 255, 255, 245))
    rounded(d, (left, rows[2] - bar_h / 2, left + 150 * U, rows[2] + bar_h / 2), bar_h / 2, (255, 255, 255, 110))
    img.paste(over, (0, 0), over)

    # the result: a stroke of highlighter with the number inside it
    mark_w, mark_h = 436 * U, 176 * U
    mark = Image.new('RGBA', (round(mark_w + 80 * U), round(mark_h + 80 * U)), (0, 0, 0, 0))
    md = ImageDraw.Draw(mark)
    ox, oy = 40 * U, 40 * U
    md.rounded_rectangle([round(ox), round(oy), round(ox + mark_w), round(oy + mark_h)], radius=round(54 * U), fill=(255, 228, 94, 255))
    num_h = 72 * U
    md.rounded_rectangle([round(ox + 70 * U), round(oy + mark_h / 2 - num_h / 2), round(ox + mark_w - 70 * U), round(oy + mark_h / 2 + num_h / 2)], radius=round(num_h / 2), fill=(29, 25, 0, 255))
    mark = mark.rotate(3.2, resample=Image.BICUBIC, expand=True)
    shadow = Image.new('RGBA', mark.size, (0, 0, 0, 0))
    shadow.paste((3, 40, 32, 70), (0, 0), mark.split()[3])
    shadow = shadow.filter(ImageFilter.GaussianBlur(14 * U))
    cx, cy = right - mark_w / 2 + 6 * U, rows[2]
    pos = (round(cx - mark.size[0] / 2), round(cy - mark.size[1] / 2))
    img.paste(shadow, (pos[0], round(pos[1] + 12 * U)), shadow)
    img.paste(mark, pos, mark)
    return img

def main():
    big = draw_icon()
    icon = big.resize((1024, 1024), Image.LANCZOS)
    out_ios = os.path.join(ROOT, 'ios', 'Reckoner', 'Assets.xcassets', 'AppIcon.appiconset')
    os.makedirs(out_ios, exist_ok=True)
    icon.save(os.path.join(out_ios, 'icon-1024.png'), optimize=True)
    os.makedirs(os.path.join(ROOT, 'assets'), exist_ok=True)
    icon.save(os.path.join(ROOT, 'assets', 'icon-1024.png'), optimize=True)
    icon.resize((180, 180), Image.LANCZOS).save(os.path.join(ROOT, 'assets', 'icon-180.png'), optimize=True)
    print('icon written:', icon.size, icon.mode)

if __name__ == '__main__':
    main()
