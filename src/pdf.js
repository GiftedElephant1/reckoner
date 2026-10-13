/* Reckoner PDF writer. Lays a sheet out as a display list, then writes it either as real
   text (when every character exists in the standard PDF fonts) or as page images drawn by
   the app, so sheets in any script still export. No dependencies. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./pdf-metrics.js'));
  else root.ReckonerPDF = factory(root.ReckonerPDFMetrics);
})(typeof self !== 'undefined' ? self : this, function (METRICS) {
  'use strict';

  // WinAnsi (the encoding of the standard fonts) for the characters above Latin-1
  var EXTRA = {
    0x20AC: 0x80, 0x201A: 0x82, 0x0192: 0x83, 0x201E: 0x84, 0x2026: 0x85, 0x2020: 0x86, 0x2021: 0x87,
    0x02C6: 0x88, 0x2030: 0x89, 0x0160: 0x8A, 0x2039: 0x8B, 0x0152: 0x8C, 0x017D: 0x8E, 0x2018: 0x91,
    0x2019: 0x92, 0x201C: 0x93, 0x201D: 0x94, 0x2022: 0x95, 0x2013: 0x96, 0x2014: 0x97, 0x02DC: 0x98,
    0x2122: 0x99, 0x0161: 0x9A, 0x203A: 0x9B, 0x0153: 0x9C, 0x017E: 0x9E, 0x0178: 0x9F
  };

  /* Swaps characters the standard fonts lack for close equivalents they have. */
  function soften(s) {
    return String(s)
      .replace(/\u2212/g, '\u2013')
      .replace(/[\u00a0\u2009\u202f\u2007]/g, ' ')
      .replace(/\u03c0/g, 'pi').replace(/\u212f/g, 'e')
      .replace(/\u221a/g, 'sqrt').replace(/\u221b/g, 'cbrt')
      .replace(/\u2264/g, '<=').replace(/\u2265/g, '>=').replace(/\u2260/g, '!=');
  }

  function code(ch) {
    var c = ch.charCodeAt(0);
    if (c >= 0x20 && c <= 0x7E) return c;
    if (c >= 0xA0 && c <= 0xFF) return c;
    return EXTRA[c] || -1;
  }

  function canEncode(s) {
    s = soften(s);
    for (var i = 0; i < s.length; i++) if (code(s.charAt(i)) < 0) return false;
    return true;
  }

  function afmWidth(text, font, size) {
    var t = soften(text), w = 0, table = METRICS[font] || METRICS.regular;
    for (var i = 0; i < t.length; i++) {
      var c = code(t.charAt(i));
      w += c < 0 ? 556 : table[c - 32];
    }
    return w * size / 1000;
  }

  var INK = [0.09, 0.13, 0.115], GREY = [0.42, 0.47, 0.44], RULE = [0.84, 0.87, 0.85];
  var HI = [1, 0.894, 0.369], NEG = [0.70, 0.15, 0.12], NEG_HI = [1, 0.85, 0.83];

  function wrap(text, font, size, maxW, measure) {
    var words = String(text).split(/\s+/).filter(Boolean), lines = [], line = '';
    function fits(s) { return measure(s, font, size) <= maxW; }
    for (var i = 0; i < words.length; i++) {
      var word = words[i];
      while (!fits(word) && word.length > 1) {
        // a single word wider than the column is broken by letters
        var cut = word.length - 1;
        while (cut > 1 && !fits(word.slice(0, cut))) cut--;
        if (line) { lines.push(line); line = ''; }
        lines.push(word.slice(0, cut));
        word = word.slice(cut);
      }
      var trial = line ? line + ' ' + word : word;
      if (fits(trial)) line = trial;
      else { if (line) lines.push(line); line = word; }
    }
    if (line) lines.push(line);
    return lines.length ? lines : [''];
  }

  /* doc: {title, note, rows:[{symbol, label, ghost, prefix, value, suffix, result, negative}],
           formulas:[text], showSymbols}
     opts: {paper:'letter'|'a4'}; measure(text, font, size) -> width in points.
     -> {width, height, pages:[[op...]]} with y measured down from the top edge. */
  function layout(doc, opts, measure) {
    var a4 = opts && opts.paper === 'a4';
    var W = a4 ? 595.28 : 612, H = a4 ? 841.89 : 792, M = 54;
    var x0 = M, x1 = W - M, bottom = H - M - 18;
    var pages = [], ops = null, y = 0;
    var symW = doc.showSymbols === false ? 0 : 26;

    function newPage(first) {
      ops = []; pages.push(ops); y = M;
      if (!first) {
        ops.push({ op: 'text', x: x0, y: y + 9, text: doc.title, font: 'regular', size: 9, color: GREY });
        y += 22;
      }
    }
    function room(h) { if (y + h > bottom) newPage(false); }

    newPage(true);
    var tl = wrap(doc.title, 'bold', 20, x1 - x0, measure);
    for (var i = 0; i < tl.length; i++) {
      ops.push({ op: 'text', x: x0, y: y + 18, text: tl[i], font: 'bold', size: 20, color: INK });
      y += 25;
    }
    if (doc.note) {
      ops.push({ op: 'text', x: x0, y: y + 10, text: doc.note, font: 'regular', size: 9, color: GREY });
      y += 16;
    }
    y += 6;
    ops.push({ op: 'line', x1: x0, y1: y, x2: x1, y2: y, color: INK, width: 1 });

    for (i = 0; i < doc.rows.length; i++) {
      var r = doc.rows[i];
      var numFont = r.result ? 'bold' : 'regular';
      var wNum = measure(r.value, numFont, 12);
      var wPre = r.prefix ? measure(r.prefix, 'regular', 10) + 5 : 0;
      var wSuf = r.suffix ? measure(r.suffix, 'regular', 10) + 5 : 0;
      var valueW = wPre + wNum + wSuf;
      var labelX = x0 + symW;
      var labelW = Math.max(120, x1 - labelX - valueW - 18);
      var labelFont = r.ghost ? 'italic' : 'regular';
      var lines = wrap(r.label || '', labelFont, 11, labelW, measure);
      var rowH = Math.max(27, lines.length * 14 + 13);
      room(rowH);
      var base = y + 18;
      if (symW) ops.push({ op: 'text', x: x0, y: base, text: r.symbol, font: 'italic', size: 11, color: GREY });
      for (var k = 0; k < lines.length; k++) {
        ops.push({ op: 'text', x: labelX, y: base + k * 14, text: lines[k], font: labelFont, size: 11, color: r.ghost ? GREY : INK });
      }
      var xr = x1;
      if (r.suffix) { xr -= wSuf - 5; ops.push({ op: 'text', x: xr, y: base, text: r.suffix, font: 'regular', size: 10, color: GREY }); xr -= 5; }
      xr -= wNum;
      if (r.result && r.value !== '?') {
        ops.push({ op: 'rect', x: xr - 4, y: base - 11.5, w: wNum + 8, h: 16, color: r.negative ? NEG_HI : HI });
      }
      ops.push({ op: 'text', x: xr, y: base, text: r.value, font: numFont, size: 12, color: r.negative ? NEG : INK });
      if (r.prefix) { xr -= wPre; ops.push({ op: 'text', x: xr, y: base, text: r.prefix, font: 'regular', size: 10, color: GREY }); }
      y += rowH;
      ops.push({ op: 'line', x1: x0, y1: y, x2: x1, y2: y, color: RULE, width: 0.5 });
    }

    if (doc.formulas && doc.formulas.length) {
      room(48);
      y += 22;
      ops.push({ op: 'text', x: x0, y: y, text: 'How the results are worked out', font: 'bold', size: 10, color: INK });
      y += 8;
      for (i = 0; i < doc.formulas.length; i++) {
        var fl = wrap(doc.formulas[i], 'italic', 10.5, x1 - x0, measure);
        room(fl.length * 14 + 2);
        for (k = 0; k < fl.length; k++) {
          y += 14;
          ops.push({ op: 'text', x: x0, y: y, text: fl[k], font: 'italic', size: 10.5, color: GREY });
        }
      }
    }

    for (i = 0; i < pages.length; i++) {
      var label = 'Page ' + (i + 1) + ' of ' + pages.length;
      pages[i].push({ op: 'text', x: x1 - measure(label, 'regular', 8), y: H - 30, text: label, font: 'regular', size: 8, color: GREY });
    }
    return { width: W, height: H, pages: pages };
  }

  // ---------------------------------------------------------------- file writing

  function Writer() { this.chunks = []; this.length = 0; this.offsets = []; }
  Writer.prototype.raw = function (x) {
    var bytes;
    if (typeof x === 'string') {
      bytes = new Uint8Array(x.length);
      for (var i = 0; i < x.length; i++) bytes[i] = x.charCodeAt(i) & 0xFF;
    } else bytes = x;
    this.chunks.push(bytes); this.length += bytes.length;
  };
  Writer.prototype.begin = function (n) { this.offsets[n] = this.length; this.raw(n + ' 0 obj\n'); };
  Writer.prototype.end = function () { this.raw('\nendobj\n'); };
  Writer.prototype.finish = function (count) {
    var start = this.length, s = 'xref\n0 ' + (count + 1) + '\n0000000000 65535 f \n';
    for (var n = 1; n <= count; n++) s += ('0000000000' + this.offsets[n]).slice(-10) + ' 00000 n \n';
    s += 'trailer\n<< /Size ' + (count + 1) + ' /Root 1 0 R >>\nstartxref\n' + start + '\n%%EOF\n';
    this.raw(s);
    var out = new Uint8Array(this.length), at = 0;
    for (var i = 0; i < this.chunks.length; i++) { out.set(this.chunks[i], at); at += this.chunks[i].length; }
    return out;
  };

  function num(v) { return (Math.round(v * 100) / 100).toString(); }
  function rgb(c) { return num(c[0]) + ' ' + num(c[1]) + ' ' + num(c[2]); }

  function pdfString(text) {
    var t = soften(text), s = '(';
    for (var i = 0; i < t.length; i++) {
      var c = code(t.charAt(i));
      if (c < 0) c = 63;
      if (c === 40 || c === 41 || c === 92) s += '\\' + String.fromCharCode(c);
      else if (c > 126) s += '\\' + ('000' + c.toString(8)).slice(-3);
      else s += String.fromCharCode(c);
    }
    return s + ')';
  }

  var FONT_NAME = { regular: 'F1', bold: 'F2', italic: 'F3' };

  function header(w) { w.raw('%PDF-1.4\n%\u00e2\u00e3\u00cf\u00d3\n'); }

  /* Writes a laid-out document with real, selectable text. */
  function writeText(lay) {
    var w = new Writer(), n = lay.pages.length, H = lay.height, i;
    var firstPage = 6, kids = [];
    for (i = 0; i < n; i++) kids.push((firstPage + i * 2) + ' 0 R');
    header(w);
    w.begin(1); w.raw('<< /Type /Catalog /Pages 2 0 R >>'); w.end();
    w.begin(2); w.raw('<< /Type /Pages /Kids [' + kids.join(' ') + '] /Count ' + n + ' >>'); w.end();
    w.begin(3); w.raw('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>'); w.end();
    w.begin(4); w.raw('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>'); w.end();
    w.begin(5); w.raw('<< /Type /Font /Subtype /Type1 /BaseFont /Times-Italic /Encoding /WinAnsiEncoding >>'); w.end();
    for (i = 0; i < n; i++) {
      var ops = lay.pages[i], s = '';
      for (var k = 0; k < ops.length; k++) {
        var o = ops[k];
        if (o.op === 'rect') s += rgb(o.color) + ' rg ' + num(o.x) + ' ' + num(H - o.y - o.h) + ' ' + num(o.w) + ' ' + num(o.h) + ' re f\n';
        else if (o.op === 'line') s += rgb(o.color) + ' RG ' + num(o.width) + ' w ' + num(o.x1) + ' ' + num(H - o.y1) + ' m ' + num(o.x2) + ' ' + num(H - o.y2) + ' l S\n';
        else if (o.op === 'text' && o.text !== '') s += 'BT ' + rgb(o.color) + ' rg /' + FONT_NAME[o.font] + ' ' + num(o.size) + ' Tf ' + num(o.x) + ' ' + num(H - o.y) + ' Td ' + pdfString(o.text) + ' Tj ET\n';
      }
      var page = firstPage + i * 2;
      w.begin(page);
      w.raw('<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ' + num(lay.width) + ' ' + num(lay.height) + '] /Resources << /Font << /F1 3 0 R /F2 4 0 R /F3 5 0 R >> >> /Contents ' + (page + 1) + ' 0 R >>');
      w.end();
      w.begin(page + 1); w.raw('<< /Length ' + s.length + ' >>\nstream\n' + s + 'endstream'); w.end();
    }
    return w.finish(5 + n * 2);
  }

  /* Writes pages that are JPEG images: images = [{bytes: Uint8Array, width, height}] in pixels. */
  function writeImages(images, width, height) {
    var w = new Writer(), n = images.length, i, kids = [];
    for (i = 0; i < n; i++) kids.push((3 + i * 3) + ' 0 R');
    header(w);
    w.begin(1); w.raw('<< /Type /Catalog /Pages 2 0 R >>'); w.end();
    w.begin(2); w.raw('<< /Type /Pages /Kids [' + kids.join(' ') + '] /Count ' + n + ' >>'); w.end();
    for (i = 0; i < n; i++) {
      var page = 3 + i * 3, img = images[i];
      var content = 'q ' + num(width) + ' 0 0 ' + num(height) + ' 0 0 cm /Im0 Do Q\n';
      w.begin(page);
      w.raw('<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ' + num(width) + ' ' + num(height) + '] /Resources << /XObject << /Im0 ' + (page + 2) + ' 0 R >> >> /Contents ' + (page + 1) + ' 0 R >>');
      w.end();
      w.begin(page + 1); w.raw('<< /Length ' + content.length + ' >>\nstream\n' + content + 'endstream'); w.end();
      w.begin(page + 2);
      w.raw('<< /Type /XObject /Subtype /Image /Width ' + img.width + ' /Height ' + img.height + ' /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ' + img.bytes.length + ' >>\nstream\n');
      w.raw(img.bytes);
      w.raw('\nendstream');
      w.end();
    }
    return w.finish(2 + n * 3);
  }

  /* True when every string of the document can be set in the standard fonts. */
  function isPlain(doc) {
    var all = [doc.title, doc.note || ''].concat(doc.formulas || []);
    for (var i = 0; i < doc.rows.length; i++) {
      var r = doc.rows[i];
      all.push(r.symbol, r.label || '', r.prefix || '', r.value, r.suffix || '');
    }
    for (i = 0; i < all.length; i++) if (!canEncode(all[i])) return false;
    return true;
  }

  return {
    layout: layout, afmWidth: afmWidth, canEncode: canEncode, isPlain: isPlain, soften: soften,
    writeText: writeText, writeImages: writeImages, wrap: wrap
  };
});
