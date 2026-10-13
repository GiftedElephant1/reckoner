/* Reckoner app: screens, the calculation bar and keypad, row editing, sharing. */
(function (root) {
  'use strict';
  var E = root.ReckonerEngine, D = root.ReckonerData, PDF = root.ReckonerPDF, U = root.ReckonerUI;
  var h = U.h, icon = U.icon, clear = U.clear, T = E.T;
  var NATIVE = root.__RECKONER_NATIVE__ || null;
  var STORE_KEY = 'reckoner.state.v1';
  var VERSION = '1.0';
  var doc = root.document;

  var state = null, saveTimer = null, hostTheme = null, downloads = null, flashTimer = null;
  var els = {};
  var ui = {
    sheetId: null,
    sel: null, buf: null,                 // selected row and the digits being typed into it
    entry: null, entryOpen: false, editId: null,
    padMode: 'num', padShown: true, shift: false, padKind: '',
    link: null, bracket: null,
    editMode: false, picked: {},
    homeEdit: false,
    flash: {}
  };

  // ---------------------------------------------------------------- storage

  function b64ToText(b64) {
    var bin = root.atob(b64), bytes = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    if (typeof TextDecoder === 'function') return new TextDecoder('utf-8').decode(bytes);
    return decodeURIComponent(escape(bin));
  }
  function bytesToB64(bytes) {
    var s = '', CH = 0x8000;
    for (var i = 0; i < bytes.length; i += CH) s += String.fromCharCode.apply(null, bytes.subarray(i, i + CH));
    return root.btoa(s);
  }
  function textToBytes(text) {
    if (typeof TextEncoder === 'function') return new TextEncoder().encode(text);
    var bin = unescape(encodeURIComponent(text)), out = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }

  function nativeSend(msg) {
    try {
      if (NATIVE && root.webkit && root.webkit.messageHandlers && root.webkit.messageHandlers.reckoner) {
        root.webkit.messageHandlers.reckoner.postMessage(msg);
        return true;
      }
    } catch (e) { /* the bridge is optional */ }
    return false;
  }
  function haptic(style) { if (state && state.settings.haptics) nativeSend({ type: 'haptic', style: style || 'light' }); }

  function seedState() {
    var st = E.newState();
    D.STARTERS.forEach(function (name) {
      var spec = D.TEMPLATES.filter(function (t) { return t.name === name; })[0];
      if (!spec) return;
      var sh = E.sheetFromSpec(spec);
      sh.example = true;
      E.addSheet(st, sh);
    });
    if (st.items.length) st.view.open = st.items[0].id;
    return st;
  }

  function loadState() {
    var fromNative = null, fromLocal = null;
    try { if (NATIVE && NATIVE.state) fromNative = JSON.parse(b64ToText(NATIVE.state)); } catch (e) { fromNative = null; }
    try { var raw = root.localStorage.getItem(STORE_KEY); if (raw) fromLocal = JSON.parse(raw); } catch (e2) { fromLocal = null; }
    var pick = fromNative || fromLocal;
    if (fromNative && fromLocal && (fromLocal.savedAt || 0) > (fromNative.savedAt || 0)) pick = fromLocal;
    return pick ? E.normalizeState(pick) : seedState();
  }

  function flush() {
    clearTimeout(saveTimer); saveTimer = null;
    if (!state) return;
    var json = JSON.stringify(state);
    try { root.localStorage.setItem(STORE_KEY, json); } catch (e) { /* storage can be full or blocked */ }
    nativeSend({ type: 'save', json: json });
  }
  function save() {
    state.savedAt = Date.now();
    clearTimeout(saveTimer);
    saveTimer = setTimeout(flush, 250);
  }

  // ---------------------------------------------------------------- helpers

  function S() { return state.settings; }
  function sheet() { return ui.sheetId ? state.sheets[ui.sheetId] : null; }
  function fieldById(id) {
    var sh = sheet();
    if (!sh || !id) return null;
    for (var i = 0; i < sh.fields.length; i++) if (sh.fields[i].id === id) return sh.fields[i];
    return null;
  }
  function edOpts() { return { autoBracket: S().autoBracket }; }
  function editorNow() { return ui.entry || E.editor.create(); }
  function plural(n, one, many) { return n + ' ' + (n === 1 ? one : many); }
  function valueText(d) { return [d.prefix, d.text, d.suffix].filter(Boolean).join(' '); }
  function plainValue(f) { return E.hasValue(f) ? (f.value < 0 ? '-' : '') + E.plainNumber(f.value) : ''; }
  function digitsIn(s) { return s.replace(/[^0-9]/g, '').length; }
  function formulaText(f) { return E.tokensToText(f.formula || [], sheet(), { settings: S() }); }
  function fileName(name, ext) {
    var base = String(name || 'Sheet').replace(/[\\\/:*?"<>|\u0000-\u001f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 60) || 'Sheet';
    return base + ext;
  }

  /* Messages sit just above whatever is docked at the bottom of the screen in view. */
  function toastLift() {
    if (U.anyOpen()) return 0;
    if (els.sheet.hidden) return els.homeBar.offsetHeight;
    if (ui.editMode) return 0;
    return els.dock.offsetHeight + (els.entry.hidden ? 0 : 20);
  }
  function toast(msg, opts) {
    opts = opts || {};
    opts.lift = toastLift();
    U.toast(msg, opts);
  }

  function applyTheme() {
    var t = S().theme, el = doc.documentElement;
    if (t === 'light' || t === 'dark') el.setAttribute('data-theme', t);
    else if (hostTheme) el.setAttribute('data-theme', hostTheme);
    else el.removeAttribute('data-theme');
    nativeSend({ type: 'theme', mode: t === 'light' || t === 'dark' ? t : 'system' });
  }

  function show(which) {
    els.home.hidden = which !== 'home';
    els.sheet.hidden = which !== 'sheet';
    doc.body.classList.toggle('at-sheet', which === 'sheet');
    U.liftToast(toastLift());
  }

  // ---------------------------------------------------------------- home

  function currentFolderId() { var p = state.view.path; return p.length ? p[p.length - 1] : null; }
  function currentItems() { return E.folderItems(state, currentFolderId()); }

  function headline(sh) {
    var res = E.computeSheet(sh, S()).byId;
    for (var i = sh.fields.length - 1; i >= 0; i--) {
      var f = sh.fields[i];
      if (f.kind !== 'output') continue;
      var d = E.displayField(f, res[f.id], S());
      if (d.state === 'ok') return valueText(d);
    }
    return '';
  }

  function renderHome() {
    var path = state.view.path, folderId = currentFolderId();
    var folder = folderId ? E.findItem(state.items, folderId) : null;
    if (folderId && !folder) { state.view.path = []; folderId = null; folder = null; }
    var items = currentItems();

    clear(els.homeTop);
    if (folder) {
      var parent = path.length > 1 ? E.findItem(state.items, path[path.length - 2]) : null;
      els.homeTop.appendChild(h('button.tbtn', { onclick: function () { state.view.path.pop(); ui.homeEdit = false; save(); renderHome(); } },
        icon('back'), h('span.lbl', { text: parent ? parent.item.name : 'Reckoner' })));
    }
    els.homeTop.appendChild(h('span.grow'));
    if (items.length > 1 || ui.homeEdit) {
      els.homeTop.appendChild(h('button.tbtn' + (ui.homeEdit ? '.strong' : ''), { text: ui.homeEdit ? 'Done' : 'Reorder', onclick: function () { ui.homeEdit = !ui.homeEdit; renderHome(); } }));
    }

    clear(els.homeHead);
    if (folder) {
      els.homeHead.appendChild(h('span.badge', null, icon('folder')));
      els.homeHead.appendChild(h('button.title.small', { text: folder.item.name, 'aria-label': 'Rename folder ' + folder.item.name, onclick: function () { renameItem(folder.item); } }));
    } else {
      els.homeHead.appendChild(h('h1.title', { text: 'Reckoner' }));
    }

    clear(els.homeList);
    if (!items.length) {
      els.homeList.appendChild(h('div.empty', null, h('b', { text: folder ? 'This folder is empty' : 'No sheets yet' }),
        'Start one with New sheet. Type a sum once and it stays ready to reuse.'));
    }
    items.forEach(function (it) {
      var mainKids;
      if (it.type === 'folder') {
        var n = E.sheetIdsIn(it).length;
        mainKids = [h('span.ico.folder', null, icon('folder')),
          h('span.name', null, it.name, h('span.sub', { text: plural(n, 'sheet', 'sheets') })),
          ui.homeEdit ? h('span.grip', { 'aria-label': 'Drag to reorder' }, icon('grip')) : h('span.chev', null, icon('fwd'))];
      } else {
        var sh = state.sheets[it.id];
        if (!sh) return;
        var head = headline(sh);
        mainKids = [h('span.ico', null, sh.icon ? sh.icon : icon('sheet')),
          h('span.name', null, sh.name, h('span.sub', { text: (sh.example ? 'Example, ' : '') + plural(sh.fields.length, 'row', 'rows') })),
          head && !ui.homeEdit ? h('span.meta', { text: head }) : null,
          ui.homeEdit ? h('span.grip', { 'aria-label': 'Drag to reorder' }, icon('grip')) : null];
      }
      els.homeList.appendChild(h('div.item', { 'data-id': it.id },
        h('button.item-del', { text: 'Delete', tabindex: '-1' }),
        h('div.item-main', { role: 'button', tabindex: '0', 'aria-label': it.type === 'folder' ? 'Folder ' + it.name : 'Sheet ' + state.sheets[it.id].name }, mainKids)));
    });
  }

  function openItem(id) {
    var r = E.findItem(state.items, id);
    if (!r) return;
    if (r.item.type === 'folder') { state.view.path.push(id); ui.homeEdit = false; save(); renderHome(); }
    else openSheet(id);
  }

  function renameItem(item) {
    var isFolder = item.type === 'folder', sh = isFolder ? null : state.sheets[item.id];
    U.promptDialog({ title: isFolder ? 'Rename folder' : 'Rename sheet', value: isFolder ? item.name : sh.name, ok: 'Rename', max: 80 }).then(function (name) {
      if (name === null) return;
      if (isFolder) item.name = name; else { sh.name = name; E.touch(sh); }
      save();
      if (!els.sheet.hidden) renderSheetHead();
      renderHome();
    });
  }

  function deleteItem(id) {
    var r = E.findItem(state.items, id);
    if (!r) return;
    var item = r.item, isFolder = item.type === 'folder';
    var n = isFolder ? E.sheetIdsIn(item).length : 0;
    function doDelete() {
      var removed = E.removeItem(state, id);
      if (!removed) return;
      state.view.path = state.view.path.filter(function (pid) { return !!E.findItem(state.items, pid); });
      save(); renderHome();
      toast(isFolder ? 'Folder deleted' : 'Sheet deleted', { action: 'Undo', onAction: function () {
        removed.list.splice(Math.min(removed.index, removed.list.length), 0, removed.item);
        for (var k in removed.sheets) state.sheets[k] = removed.sheets[k];
        save(); renderHome();
      } });
    }
    if (isFolder && n > 0) {
      U.confirmDialog({ title: 'Delete \u201c' + item.name + '\u201d?', message: 'The folder and its ' + plural(n, 'sheet', 'sheets') + ' will be deleted.', ok: 'Delete', danger: true }).then(function (yes) { if (yes) doDelete(); else renderHome(); });
    } else doDelete();
  }

  function folderOptions(skipId) {
    var out = [];
    (function walk(list, depth) {
      list.forEach(function (it) {
        if (it.type !== 'folder' || it.id === skipId) return;
        out.push({ id: it.id, name: it.name, depth: depth });
        walk(it.items, depth + 1);
      });
    })(state.items, 0);
    return out;
  }

  function moveItemPanel(id) {
    var r = E.findItem(state.items, id);
    if (!r) return;
    var p, list = h('div.menu');
    function go(dest) {
      if (E.moveItem(state, id, dest)) { save(); renderHome(); toast('Moved'); }
      p.close();
    }
    list.appendChild(h('button', { onclick: function () { go(null); } }, icon('sheet'), h('span', { text: 'Top level' })));
    folderOptions(id).forEach(function (f) {
      list.appendChild(h('button', { onclick: function () { go(f.id); }, style: 'padding-left:' + (4 + f.depth * 22) + 'px' }, icon('folder'), h('span', { text: f.name })));
    });
    p = U.panel('Move to', list);
  }

  function itemMenu(id) {
    var r = E.findItem(state.items, id);
    if (!r) return;
    var item = r.item, isFolder = item.type === 'folder', p;
    function act(fn) { return function () { p.close(); fn(); }; }
    var list = h('div.menu');
    list.appendChild(h('button', { onclick: act(function () { renameItem(item); }) }, icon('pencil'), h('span', { text: 'Rename' })));
    if (!isFolder) {
      list.appendChild(h('button', { onclick: act(function () { duplicateSheet(id); }) }, icon('copy'), h('span', { text: 'Duplicate' })));
      list.appendChild(h('button', { onclick: act(function () { ui.sheetId = id; sharePanel(function () { ui.sheetId = null; }); }) }, icon('share'), h('span', { text: 'Share or export' })));
    }
    list.appendChild(h('button', { onclick: act(function () { moveItemPanel(id); }) }, icon('move'), h('span', { text: 'Move to a folder' })));
    list.appendChild(h('button.danger', { onclick: act(function () { deleteItem(id); }) }, icon('trash'), h('span', { text: 'Delete' })));
    p = U.panel(isFolder ? item.name : state.sheets[id].name, list);
    haptic('medium');
  }

  function duplicateSheet(id) {
    var src = state.sheets[id], r = E.findItem(state.items, id);
    if (!src || !r) return;
    var copy = E.duplicateSheet(src, src.name + ' copy');
    state.sheets[copy.id] = copy;
    r.list.splice(r.index + 1, 0, { type: 'sheet', id: copy.id });
    save(); renderHome();
    toast('Duplicated');
  }

  function newFolder() {
    U.promptDialog({ title: 'New folder', placeholder: 'Folder name', ok: 'Create', max: 80 }).then(function (name) {
      if (!name) return;
      E.addFolder(state, name, currentFolderId());
      save(); renderHome();
    });
  }

  function createSheet(sh, open) {
    E.addSheet(state, sh, currentFolderId());
    save();
    if (open) openSheet(sh.id); else renderHome();
  }

  function newSheetPanel() {
    var p, body = h('div');
    body.appendChild(h('button.btn.primary.block', { onclick: function () { p.close(); createSheet(E.newSheet('New sheet'), true); } }, icon('plus'), 'Blank sheet'));
    var list = h('div.menu');
    D.TEMPLATES.forEach(function (t) {
      list.appendChild(h('button', { onclick: function () { p.close(); createSheet(E.sheetFromSpec(t), true); } },
        h('span.emo', { text: t.icon }), h('span', null, t.name, h('small', { text: t.about }))));
    });
    body.appendChild(h('div.group', null, h('h3', { text: 'Start from a template' }), list));
    body.appendChild(h('div.group', null, h('button.btn.block', { onclick: function () { p.close(); pickImport(); } }, icon('importFile'), 'Open a sheet file')));
    p = U.panel('New sheet', body, { tall: true });
  }

  // ---------------------------------------------------------------- import and export

  function addImported(result) {
    var folderId = currentFolderId();
    result.sheets.forEach(function (sh) { state.sheets[sh.id] = sh; });
    if (result.backup) {
      var f = E.addFolder(state, 'Restored backup', folderId);
      f.items = result.items;
    } else {
      var list = E.folderItems(state, folderId);
      result.items.forEach(function (it) { list.push(it); });
    }
    save();
    if (els.sheet.hidden) renderHome();
    toast(result.sheets.length === 1 ? 'Added \u201c' + result.sheets[0].name + '\u201d' : 'Added ' + result.sheets.length + ' sheets');
    return result.sheets.length === 1 && !result.backup ? result.sheets[0].id : null;
  }

  function importText(text, openAfter) {
    var r = E.importFile(text);
    if (!r.ok) { toast(r.error); return false; }
    var id = addImported(r);
    if (id && openAfter) openSheet(id);
    return true;
  }

  function pickImport() {
    var input = els.fileInput;
    input.value = '';
    input.click();
  }

  function copyText(text) {
    function fallback() {
      // read-only, so focusing it does not bring up the keyboard
      var ta = h('textarea', { 'aria-hidden': 'true', readonly: true, style: 'position:fixed;top:0;left:0;width:2px;height:2px;opacity:0' });
      ta.value = text;
      doc.body.appendChild(ta);
      ta.focus({ preventScroll: true }); ta.select();
      try { ta.setSelectionRange(0, text.length); } catch (e0) { /* select() was enough */ }
      var ok = false;
      try { ok = doc.execCommand('copy'); } catch (e) { ok = false; }
      doc.body.removeChild(ta);
      return ok;
    }
    if (root.navigator.clipboard && root.navigator.clipboard.writeText) {
      return root.navigator.clipboard.writeText(text).then(function () { return true; }, function () { return fallback(); });
    }
    return Promise.resolve(fallback());
  }

  function showCopyBox(title, text, note) {
    var box = h('textarea.copybox', { readonly: true, id: 'copybox', 'aria-label': title });
    box.value = text;
    var p = U.panel(title, [
      note ? h('p.hint', { text: note, style: 'margin:0 2px 10px' }) : null,
      box,
      h('div.group', null, h('button.btn.primary.block', { onclick: function () {
        copyText(text).then(function (ok) { if (ok) { toast('Copied'); p.close(); } else { box.focus(); box.select(); } });
      } }, icon('copy'), 'Copy'))
    ]);
  }

  function inViewer() { return !NATIVE && root.claude && typeof root.claude.use === 'function'; }

  function getDownloads() {
    if (!inViewer()) return Promise.resolve(null);
    if (!downloads) {
      try { downloads = root.claude.use('downloads'); } catch (e) { downloads = Promise.resolve(null); }
    }
    return Promise.race([downloads, new Promise(function (res) { setTimeout(function () { res(null); }, 3000); })]).catch(function () { return null; });
  }

  /* Hands a file to the person: the iOS share sheet in the app, a save prompt in the
     Claude viewer, and the share sheet or a download in an ordinary browser. */
  function deliver(name, mime, data, textFallback) {
    var bytes = typeof data === 'string' ? textToBytes(data) : data;
    if (NATIVE) { nativeSend({ type: 'share', filename: name, mime: mime, base64: bytesToB64(bytes) }); return; }
    getDownloads().then(function (dl) {
      if (dl) {
        return dl.save({ filename: name, data: new Blob([bytes], { type: mime }) }).then(function () { toast('Saved ' + name); }, function (err) {
          var code = err && err.code;
          if (code === 'declined') return;
          if (code === 'rate_limited') { toast('A save is already waiting for your answer.'); return; }
          fallback();
        });
      }
      if (inViewer()) { fallback(); return; }
      var blob = new Blob([bytes], { type: mime }), file = null;
      try { file = new File([blob], name, { type: mime }); } catch (e) { file = null; }
      var nav = root.navigator;
      if (file && nav.canShare && nav.share && /iPhone|iPad|Android/i.test(nav.userAgent) && nav.canShare({ files: [file] })) {
        nav.share({ files: [file], title: name }).catch(function () { /* cancelled */ });
        return;
      }
      var url = URL.createObjectURL(blob), a = h('a', { href: url, download: name, style: 'display:none' });
      doc.body.appendChild(a); a.click(); doc.body.removeChild(a);
      setTimeout(function () { URL.revokeObjectURL(url); }, 30000);
      toast('Saved ' + name);
    });
    function fallback() {
      if (textFallback) showCopyBox(name, textFallback, 'Files can\u2019t be saved from this view, so here is the content to copy.');
      else toast('Files can\u2019t be saved from this view. The iPhone app opens the share sheet here.', { ms: 4200 });
    }
  }

  function pdfDoc(sh) {
    var res = E.computeSheet(sh, S()).byId, rows = [], formulas = [];
    sh.fields.forEach(function (f) {
      var d = E.displayField(f, res[f.id], S()), out = f.kind === 'output';
      var formula = out ? E.tokensToText(f.formula || [], sh, { settings: S() }) : '';
      rows.push({ symbol: f.symbol, label: f.desc || formula, ghost: !f.desc && out, prefix: d.prefix, value: d.state === 'ok' ? d.text : (out ? '?' : ''), suffix: d.suffix, result: out, negative: d.negative });
      if (out) formulas.push(f.symbol + ' = ' + formula);
    });
    var when = new Date();
    var date;
    try { date = when.toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' }); } catch (e) { date = when.toDateString(); }
    return { title: sh.name, note: date, rows: rows, formulas: formulas, showSymbols: S().showSymbols };
  }

  function paperSize() {
    var lang = (root.navigator.language || 'en-US');
    return /-(US|CA|MX|PH|CL|CO|VE|PR|GT|CR|PA|DO)$/i.test(lang) ? 'letter' : 'a4';
  }

  var FONT_CSS = {
    regular: function (px) { return '400 ' + px + 'px system-ui, -apple-system, "Segoe UI", Roboto, "Noto Sans", Arial, sans-serif'; },
    bold: function (px) { return '700 ' + px + 'px system-ui, -apple-system, "Segoe UI", Roboto, "Noto Sans", Arial, sans-serif'; },
    italic: function (px) { return 'italic 400 ' + px + 'px ui-serif, "New York", Georgia, "Times New Roman", serif'; }
  };
  function cssColor(c) { return 'rgb(' + Math.round(c[0] * 255) + ',' + Math.round(c[1] * 255) + ',' + Math.round(c[2] * 255) + ')'; }

  /* Draws the pages on canvases and stores them as images, for sheets whose text the
     standard PDF fonts cannot show (Chinese, Arabic, emoji and so on). */
  function pdfFromCanvas(d, paper) {
    var probe = doc.createElement('canvas').getContext('2d');
    function measure(text, font, size) { probe.font = FONT_CSS[font](size); return probe.measureText(text).width; }
    var lay = PDF.layout(d, { paper: paper }, measure), scale = 2, images = [];
    lay.pages.forEach(function (ops) {
      var c = doc.createElement('canvas');
      c.width = Math.round(lay.width * scale); c.height = Math.round(lay.height * scale);
      var g = c.getContext('2d');
      g.fillStyle = '#ffffff'; g.fillRect(0, 0, c.width, c.height);
      g.scale(scale, scale);
      g.textBaseline = 'alphabetic';
      ops.forEach(function (o) {
        if (o.op === 'rect') { g.fillStyle = cssColor(o.color); g.fillRect(o.x, o.y, o.w, o.h); }
        else if (o.op === 'line') { g.strokeStyle = cssColor(o.color); g.lineWidth = o.width; g.beginPath(); g.moveTo(o.x1, o.y1); g.lineTo(o.x2, o.y2); g.stroke(); }
        else if (o.op === 'text') { g.fillStyle = cssColor(o.color); g.font = FONT_CSS[o.font](o.size); g.fillText(o.text, o.x, o.y); }
      });
      var url = c.toDataURL('image/jpeg', 0.92), bin = root.atob(url.slice(url.indexOf(',') + 1)), bytes = new Uint8Array(bin.length);
      for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      images.push({ bytes: bytes, width: c.width, height: c.height });
      // hand the memory back now: iPhones count every live canvas against a fixed allowance
      c.width = 0; c.height = 0;
    });
    return PDF.writeImages(images, lay.width, lay.height);
  }

  function buildPDF(sh) {
    var d = pdfDoc(sh), paper = paperSize();
    if (!PDF.isPlain(d) && !PDF.canEncode(d.note)) {
      // In many languages the written-out date is the only text the built-in PDF fonts cannot
      // show. A date in figures keeps the sheet a sharp text PDF instead of pictures of pages.
      var now = new Date(), figures = now.getFullYear() + '-' + ('0' + (now.getMonth() + 1)).slice(-2) + '-' + ('0' + now.getDate()).slice(-2);
      var plain = {};
      for (var k in d) if (Object.prototype.hasOwnProperty.call(d, k)) plain[k] = d[k];
      plain.note = figures;
      if (PDF.isPlain(plain)) d = plain;
    }
    if (PDF.isPlain(d)) return PDF.writeText(PDF.layout(d, { paper: paper }, PDF.afmWidth));
    return pdfFromCanvas(d, paper);
  }

  function sharePanel(onClose) {
    var sh = sheet();
    if (!sh) return;
    var p, list = h('div.menu');
    function act(fn) { return function () { p.close(); fn(); }; }
    list.appendChild(h('button', { onclick: act(function () {
      try { deliver(fileName(sh.name, '.pdf'), 'application/pdf', buildPDF(sh)); }
      catch (e) { toast('The PDF could not be made.'); }
    }) }, icon('pdf'), h('span', null, 'PDF', h('small', { text: 'A tidy page of the sheet, with the formulas listed.' }))));
    list.appendChild(h('button', { onclick: act(function () { var csv = E.sheetToCSV(sh, S()); deliver(fileName(sh.name, '.csv'), 'text/csv', csv, csv.slice(1)); }) },
      icon('table'), h('span', null, 'CSV', h('small', { text: 'Opens in Numbers, Excel or Google Sheets.' }))));
    list.appendChild(h('button', { onclick: act(function () { var js = E.exportSheetFile(sh); deliver(fileName(sh.name, '.reckoner.json'), 'application/json', js, js); }) },
      icon('sheet'), h('span', null, 'Sheet file', h('small', { text: 'Someone with Reckoner can open it and reuse the formulas.' }))));
    list.appendChild(h('button', { onclick: act(function () {
      var text = E.sheetToText(sh, S());
      copyText(text).then(function (ok) { if (ok) toast('Copied'); else showCopyBox('Copy as text', text); });
    }) }, icon('text'), h('span', null, 'Copy as text', h('small', { text: 'Each row on a line, ready to paste.' }))));
    p = U.panel('Share or export', list, { onClose: onClose });
  }

  // ---------------------------------------------------------------- sheet screen

  function openSheet(id) {
    if (!state.sheets[id]) return;
    ui.sheetId = id; ui.sel = null; ui.buf = null; ui.entry = null; ui.entryOpen = false; ui.editId = null;
    ui.link = null; ui.bracket = null; ui.editMode = false; ui.picked = {}; ui.padShown = true; ui.padMode = 'num'; ui.shift = false; ui.flash = {};
    state.view.open = id;
    save();
    show('sheet');
    renderSheet();
    els.fields.scrollTop = 0;
  }

  function closeSheet() {
    flush();
    ui.sheetId = null; ui.entry = null; ui.entryOpen = false; ui.sel = null; ui.link = null; ui.bracket = null; ui.editMode = false;
    state.view.open = null;
    save();
    U.hideToast();
    show('home');
    renderHome();
  }

  function renderSheet() { renderSheetHead(); renderFields(); renderDock(); }

  function renderSheetHead() {
    var sh = sheet();
    if (!sh) return;
    clear(els.sheetTop);
    if (ui.editMode) {
      var n = Object.keys(ui.picked).length;
      els.sheetTop.appendChild(h('button.tbtn.danger', { disabled: !n, onclick: deletePicked, style: n ? '' : 'opacity:.4' }, icon('trash'), h('span.lbl', { text: n ? 'Delete ' + n : 'Delete' })));
      els.sheetTop.appendChild(h('span.grow'));
      els.sheetTop.appendChild(h('button.tbtn.strong', { text: 'Done', onclick: function () { setEditMode(false); } }));
    } else {
      var folderId = currentFolderId(), folder = folderId ? E.findItem(state.items, folderId) : null;
      els.sheetTop.appendChild(h('button.tbtn', { onclick: closeSheet, 'aria-label': 'Back to ' + (folder ? folder.item.name : 'all sheets') }, icon('back'), h('span.lbl', { text: folder ? folder.item.name : 'Sheets' })));
      els.sheetTop.appendChild(h('span.grow'));
      els.sheetTop.appendChild(h('button.tbtn', { 'aria-label': 'Share or export', onclick: function () { sharePanel(); } }, icon('share')));
    }
    clear(els.sheetHead);
    els.sheetHead.appendChild(h('button.badge', { 'aria-label': 'Choose an icon', onclick: iconPanel }, sh.icon ? sh.icon : icon('sheet')));
    els.sheetHead.appendChild(h('button.title.small', { text: sh.name, 'aria-label': 'Rename sheet ' + sh.name, onclick: function () { renameItem({ type: 'sheet', id: sh.id }); } }));
  }

  function canLink(f) {
    if (!ui.editId) return true;
    if (f.id === ui.editId) return false;
    return !E.dependsOn(sheet(), f.id, ui.editId);
  }

  function renderFields() {
    var sh = sheet();
    if (!sh) return;
    var res = E.computeSheet(sh, S()).byId, st = S();
    var keepScroll = els.fields.scrollTop;
    clear(els.fields);
    els.fields.className = 'fields' + (ui.link ? ' linking' : '') + (st.showSymbols ? '' : ' nosym');
    if (sh.example && !ui.editMode) {
      els.fields.appendChild(h('div.note', null, h('span', { text: 'An example to play with. Tap a number, type a new one, and the results follow.' }),
        h('button', { 'aria-label': 'Hide this note', onclick: function () { sh.example = false; save(); renderFields(); } }, icon('close'))));
    }
    if (!sh.fields.length) {
      els.fields.appendChild(h('div.empty', null, h('b', { text: 'A blank sheet' }),
        'Type a calculation below, like 12 \u00d7 5, and press the yellow key. Each number becomes a row you can change later.',
        h('div', { style: 'margin-top:16px' }, h('button.chip', { onclick: helpPanel }, icon('help'), 'How it works'))));
    }
    sh.fields.forEach(function (f) {
      var r = res[f.id], d = E.displayField(f, r, st), out = f.kind === 'output', sel = ui.sel === f.id && !ui.editMode;
      var cls = 'row ' + (out ? 'out' : 'in');
      if (d.negative) cls += ' neg';
      if (out && d.state === 'empty') cls += ' wait';
      if (d.state === 'error') cls += ' err';
      if (sel) cls += ' sel';
      if (ui.picked[f.id]) cls += ' picked';
      if (ui.flash[f.id]) cls += ' flash';
      if (ui.link && !canLink(f)) cls += ' nolink';

      var numText, blank = false;
      if (sel && !out && ui.buf !== null) { numText = E.formatTyped(ui.buf, st); blank = numText === ''; }
      else if (d.state === 'ok') numText = d.text;
      else if (out) numText = '?';
      else { numText = ''; blank = true; }
      var len = numText.length + (d.prefix ? d.prefix.length + 1 : 0) + (d.suffix ? d.suffix.length + 1 : 0);
      var val = h('span.val' + (len > 19 ? '.xlong' : len > 13 ? '.long' : ''), null,
        d.prefix ? h('span.pre', { text: d.prefix }) : null,
        h('span.num' + (blank ? '.blank' : ''), { text: numText }),
        d.suffix ? h('span.suf', { text: d.suffix }) : null);
      var label = f.desc ? h('span.desc', { text: f.desc }) : (out ? h('span.desc.ghost', { text: formulaText(f) }) : h('span.desc'));
      var spoken = (f.desc || f.symbol) + ', ' + (d.state === 'ok' ? valueText(d) : d.reason);
      var main = h('div.row-main', { role: 'button', tabindex: '0', 'aria-label': spoken },
        ui.editMode ? h('span.pick', null, icon(ui.picked[f.id] ? 'picked' : 'ring')) : null,
        st.showSymbols ? h('span.sym', { text: f.symbol }) : null,
        label, val,
        ui.editMode ? h('span.grip', { 'aria-label': 'Drag to reorder' }, icon('grip')) : null);
      var row = h('div', { class: cls, 'data-id': f.id },
        ui.editMode ? null : h('button.row-del', { text: 'Delete', tabindex: '-1' }),
        main);
      if (sel && out) {
        // an unnamed result already shows its formula as its label, so it is not repeated here
        var more = [];
        if (f.desc) more.push(h('div', { text: '= ' + formulaText(f) }));
        if (d.state === 'error') more.push(h('div.why', { text: d.reason }));
        else if (d.state === 'ok') {
          var fmt = E.fieldFormat(f, st);
          var exact = E.formatNumber(r.value, { minDec: 0, maxDec: 10 }, st);
          if (exact !== E.formatNumber(r.value, { minDec: 0, maxDec: fmt.maxDec, trunc: fmt.trunc }, st)) more.push(h('div.exact', { text: 'Unrounded ' + exact }));
        }
        row.appendChild(h('div.peek', null, more.length ? h('span.f', null, more) : null,
          h('span.acts', null,
            f.desc ? null : h('button.chip.plain', { onclick: function () { propsPanel(f.id); } }, 'Name'),
            h('button.chip', { onclick: function () { startFormulaEdit(f.id); } }, 'Edit formula'))));
      }
      els.fields.appendChild(row);
    });
    els.fields.scrollTop = keepScroll;
    els.scrim.hidden = !(ui.entryOpen && !ui.link);
  }

  function scrollToField(id) {
    var el = els.fields.querySelector('[data-id="' + id + '"]');
    if (el && el.scrollIntoView) el.scrollIntoView({ block: 'nearest' });
  }

  function flashRows(ids) {
    ui.flash = {};
    ids.forEach(function (id) { ui.flash[id] = true; });
    clearTimeout(flashTimer);
    flashTimer = setTimeout(function () {
      ui.flash = {};
      Array.prototype.forEach.call(els.fields.querySelectorAll('.flash'), function (el) { el.classList.remove('flash'); });
    }, 1000);
  }

  // ---------------------------------------------------------------- rows: taps, selection, deleting

  function deselect() { ui.sel = null; ui.buf = null; }

  function selectField(id) {
    ui.sel = id; ui.buf = null;
    ui.entryOpen = false;
    if (ui.entry && !ui.entry.tokens.length) ui.entry = null;
    if (!ui.padShown) ui.padShown = true;
    renderFields(); renderDock();
    scrollToField(id);
    haptic('select');
  }

  function rowTap(row, zone) {
    var id = row.getAttribute('data-id'), f = fieldById(id);
    if (!f) return;
    if (ui.link) { if (canLink(f)) linkPick(id); return; }
    if (ui.editMode) { if (ui.picked[id]) delete ui.picked[id]; else ui.picked[id] = true; renderSheetHead(); renderFields(); return; }
    if (zone === 'left') { propsPanel(id); return; }
    if (ui.sel === id) { if (f.kind === 'input') return; deselect(); renderFields(); renderDock(); return; }
    selectField(id);
  }

  function rowDouble(row, zone) {
    var f = fieldById(row.getAttribute('data-id'));
    if (!f || ui.link || ui.editMode || zone !== 'right') return;
    if (f.kind === 'output') startFormulaEdit(f.id);
  }

  function setEditMode(on, firstId) {
    ui.editMode = on; ui.picked = {};
    if (on) { deselect(); ui.entryOpen = false; ui.link = null; ui.bracket = null; if (firstId) ui.picked[firstId] = true; }
    renderSheet();
  }

  function rowLong(row) {
    if (ui.link || ui.editMode || ui.entryOpen) return false;
    haptic('medium');
    setEditMode(true, row.getAttribute('data-id'));
    return true;
  }

  function deleteRows(ids) {
    var sh = sheet();
    if (!sh || !ids.length) return;
    var before = JSON.stringify(sh.fields);
    var used = 0, waiting = 0;
    ids.forEach(function (id) {
      var n = E.dependentsOf(sh, id).filter(function (f) { return ids.indexOf(f.id) < 0; }).length, gone = fieldById(id);
      used += n;
      // an empty number row has nothing to leave behind in the formulas that used it
      if (n && gone && gone.kind === 'input' && !E.hasValue(gone)) waiting += n;
    });
    // a calculation still being typed may use these rows; it is rewritten like the formulas are
    var draftBefore = ui.entry ? JSON.stringify(ui.entry) : null;
    var draft = ui.entry && ui.entry.tokens.length ? { tokens: ui.entry.tokens } : null;
    E.deleteFields(sh, ids, draft);
    if (draft && draft.tokens !== ui.entry.tokens) ui.entry = { tokens: draft.tokens, cur: draft.tokens.length - 1, typing: false };
    if (ids.indexOf(ui.sel) >= 0) deselect();
    if (ui.editId && ids.indexOf(ui.editId) >= 0) { ui.entry = null; ui.entryOpen = false; ui.editId = null; ui.link = null; ui.bracket = null; }
    var draftAfter = ui.entry ? JSON.stringify(ui.entry) : null;
    save(); renderSheet();
    haptic('medium');
    var msg = ids.length === 1 ? 'Row deleted' : ids.length + ' rows deleted';
    if (waiting) msg += '. It was empty, so ' + (waiting === 1 ? 'the formula that used it now waits' : 'formulas that used it now wait') + ' for a number.';
    else if (used) msg += '. Formulas that used ' + (ids.length === 1 ? 'it' : 'them') + ' still work.';
    toast(msg, { action: 'Undo', onAction: function () {
      sh.fields = JSON.parse(before);
      E.touch(sh); save();
      if (sheet() !== sh) return;
      // put an unfinished calculation back too, unless it has been worked on since
      if (draftBefore !== draftAfter && draftBefore && JSON.stringify(ui.entry) === draftAfter) ui.entry = JSON.parse(draftBefore);
      renderSheet();
    } });
  }

  function rowDelete(row) { deleteRows([row.getAttribute('data-id')]); }
  function deletePicked() {
    var ids = Object.keys(ui.picked);
    ui.picked = {};
    deleteRows(ids);
  }

  // ---------------------------------------------------------------- the calculation bar

  function draftResult() {
    var sh = sheet();
    if (!ui.entry || !ui.entry.tokens.length) return null;
    var toks = ui.bracket ? E.editor.bracketPreview(ui.entry, ui.bracket).tokens : ui.entry.tokens;
    return E.computeSheet(sh, S(), { tokens: toks, editId: ui.editId }).draft;
  }

  function tokenEl(t, i, cur, res, ix) {
    var cls = 'tk', kids = null, text = '';
    switch (t.t) {
      case 'num': text = E.formatTyped(t.v, S()); break;
      case 'ref': {
        var f = ix.byId[t.id], r = f ? res[f.id] : null;
        if (f && r && r.status === 'ok') {
          kids = [h('i.lbl', { text: f.symbol }), E.formatNumber(r.value, E.fieldFormat(f, S()), S())];
        } else { cls += ' sym'; text = f ? f.symbol : '?'; }
        break;
      }
      case 'name': cls += ' sym'; text = t.v; break;
      case 'const': cls += ' sym'; text = t.v === 'pi' ? '\u03c0' : '\u212f'; break;
      case 'op': cls += ' op'; text = E.OP_SIGN[t.v]; break;
      case 'cmp': cls += ' op'; text = E.CMP_SIGN[t.v]; break;
      case 'neg': cls += ' op'; text = E.MINUS; break;
      case 'pct': cls += ' op'; text = '%'; break;
      case 'fact': cls += ' op'; text = '!'; break;
      case 'lp': cls += ' op'; text = '('; break;
      case 'rp': cls += ' op'; text = ')'; break;
      case 'fn': text = E.displayFnName(t.v) + '('; break;
      case 'sep': cls += ' op'; text = ','; break;
      case 'above': cls += ' all'; text = 'all rows above'; break;
    }
    if (i === cur) cls += ' cur';
    return h('span', { class: cls, 'data-i': String(i) }, kids || text);
  }

  function renderEntry() {
    var sh = sheet(), el = els.entry;
    if (!ui.entryOpen || !sh) { el.hidden = true; clear(el); return; }
    el.hidden = false;
    clear(el);
    el.className = 'entry' + (ui.bracket ? ' bracketing' : '');
    var st = ui.entry || E.editor.create(), toks = st.tokens, cur = st.cur, ghost = -1;
    if (ui.bracket) {
      var pv = E.editor.bracketPreview(st, ui.bracket);
      toks = pv.tokens; cur = pv.close; ghost = pv.open;
    }
    if (ui.editId) {
      var ef = fieldById(ui.editId);
      el.appendChild(h('div.cap', null, h('span', { style: 'flex:1 1 auto', text: 'Changing the formula of ' + (ef ? (ef.desc || ef.symbol) : 'this row') }),
        h('button.chip.plain', { text: 'Cancel', onclick: cancelEntry })));
    }
    var res = E.computeSheet(sh, S()).byId, ix = E.fieldIndex(sh);
    var expr = h('div.expr', { 'aria-label': 'Calculation' });
    if (!toks.length) expr.appendChild(h('span.ph', { text: 'Type to calculate' }));
    else {
      if (cur < 0 && !ui.bracket) expr.appendChild(h('span.caret'));
      toks.forEach(function (t, i) {
        var tk = tokenEl(t, i, cur, res, ix);
        if (i === ghost) tk.classList.add('ghostb');
        expr.appendChild(tk);
      });
    }
    el.appendChild(expr);
    var dr = draftResult(), big = '', note = '', wait = false, bad = false;
    if (!dr) { big = ''; }
    else if (dr.status === 'ok') {
      big = E.formatNumber(dr.value, { minDec: S().defMinDec, maxDec: S().defMaxDec }, S());
      var full = E.formatNumber(dr.value, { minDec: 0, maxDec: 10 }, S());
      if (full !== big) note = full;
    } else if (dr.status === 'unknown') { big = '?'; wait = true; note = 'Waiting for a value'; }
    else if (dr.code === 'syntax') { big = '?'; wait = true; }
    else { big = '?'; wait = true; bad = true; note = E.ERROR_TEXT[dr.code] || ''; }
    el.appendChild(h('div.res' + (wait ? '.wait' : '') + (big.length > 13 ? '.long' : ''), { text: big || '\u00a0', 'aria-live': 'polite' }));
    el.appendChild(h('div.res-note' + (bad ? '.bad' : ''), { text: note || '\u00a0' }));
    expr.scrollTop = expr.scrollHeight;
  }

  function renderBar() {
    var bar = els.bar, st = editorNow();
    clear(bar);
    bar.className = 'bar' + (ui.padShown ? '' : ' solo');
    bar.appendChild(h('button.ib', { 'aria-label': 'Sheet options', onclick: sheetMenu }, icon('options')));
    if (ui.entryOpen) {
      // the calculation is on show above, so the bar offers the arrows that move through it
      var busy = !!(ui.link || ui.bracket);
      bar.appendChild(h('button.ib', { 'aria-label': 'Move left', disabled: busy || !E.editor.can(st, { k: 'left' }), onclick: function () { edit({ k: 'left' }); } }, icon('back')));
      bar.appendChild(h('button.ib', { 'aria-label': 'Move right', disabled: busy || !E.editor.can(st, { k: 'right' }), onclick: function () { edit({ k: 'right' }); } }, icon('fwd')));
      bar.appendChild(h('span.grow'));
    } else {
      var has = !!(ui.entry && ui.entry.tokens.length);
      bar.appendChild(h('button.pill' + (has ? '.has' : ''), { id: 'calc-pill', text: has ? E.tokensToText(ui.entry.tokens, sheet(), { settings: S() }) : 'Calculate', 'aria-label': has ? 'Continue the calculation' : 'Start a calculation', onclick: openEntry }));
    }
    bar.appendChild(h('button.ib.mode', { text: ui.padMode === 'abc' ? '123' : 'abc', 'aria-label': ui.padMode === 'abc' ? 'Number keys' : 'Letter keys', onclick: function () { key(ui.padMode === 'abc' ? 'num' : 'abc'); } }));
    bar.appendChild(h('button.ib', { 'aria-label': ui.padShown ? 'Hide the keypad' : 'Show the keypad', onclick: function () {
      ui.padShown = !ui.padShown;
      if (!ui.padShown) { ui.entryOpen = false; ui.link = null; ui.bracket = null; deselect(); }
      renderFields(); renderDock();
    } }, icon(ui.padShown ? 'padHide' : 'padShow')));
  }

  var NUM_KEYS = [
    ['fn', '\u0192x', 'util fx', 'Functions'], ['link', '@link', 'util', 'Use a row'], ['lp', '(', 'util', 'Open bracket'], ['rp', ')', 'util', 'Close bracket'], ['op:/', '\u00f7', 'util', 'Divide'],
    ['clear', 'C', 'util clear', 'Clear'], ['d:7', '7'], ['d:8', '8'], ['d:9', '9'], ['op:*', '\u00d7', 'util', 'Multiply'],
    ['back', '@backspace', 'util', 'Delete'], ['d:4', '4'], ['d:5', '5'], ['d:6', '6'], ['op:-', '\u2212', 'util', 'Minus'],
    ['sign', '\u00b1', 'util', 'Plus or minus'], ['d:1', '1'], ['d:2', '2'], ['d:3', '3'], ['op:+', '+', 'util', 'Plus'],
    ['pct', '%', 'util', 'Percent'], ['d:0', '0'], ['dot', '.', '', 'Decimal point'], ['enter', '@enter', 'enter', 'Enter']
  ];
  var ABC_ROWS = ['qwertyuiop', 'asdfghjkl', 'zxcvbnm'];

  function keyEl(def) {
    var label = def[1], kid = label.charAt(0) === '@' ? icon(label.slice(1)) : label;
    return h('button.key' + (def[2] ? '.' + def[2].split(' ').join('.') : ''), { type: 'button', 'data-k': def[0], 'aria-label': def[3] || label }, kid);
  }

  function buildPad() {
    var pad = els.pad, kind = !ui.padShown ? 'hidden' : ui.link ? 'link' : ui.bracket ? 'bracket' : ui.padMode;
    if (kind === ui.padKind && kind !== 'link' && kind !== 'bracket') return;
    ui.padKind = kind;
    clear(pad);
    pad.hidden = kind === 'hidden';
    pad.className = 'pad' + (kind === 'abc' ? ' abc' : '');
    if (kind === 'hidden') return;
    if (kind === 'link') {
      var canAll = E.editor.can(editorNow(), { k: 'above' });
      pad.appendChild(h('div.padnote', null,
        h('b', { text: ui.link.multi ? 'Tap the rows to add up' : 'Tap a row to use it' }),
        h('span', { text: ui.link.multi ? 'Each row you tap joins the list.' : 'Its value joins your calculation and stays linked.' }),
        h('div.acts', null,
          canAll ? h('button.chip', { onclick: function () { edit({ k: 'above' }); endLink(); } }, icon('total'), 'All rows above') : null,
          h('button.chip.plain', { text: ui.link.multi && ui.link.count ? 'Done' : 'Cancel', onclick: endLink }))));
      return;
    }
    if (kind === 'bracket') {
      var b = ui.bracket;
      pad.appendChild(h('div.padnote', null,
        h('b', { text: 'Where should the bracket open?' }),
        h('span', { text: 'Move it with the arrows, or drag across the calculation.' }),
        h('div.acts', null,
          h('button.chip.plain', { 'aria-label': 'Move the bracket left', disabled: b.at <= 0, onclick: function () { moveBracket(-1); } }, icon('back')),
          h('button.chip.plain', { 'aria-label': 'Move the bracket right', disabled: b.at >= b.stops.length - 1, onclick: function () { moveBracket(1); } }, icon('fwd')),
          h('button.chip.plain', { text: 'Cancel', onclick: function () { ui.bracket = null; renderDock(); } }),
          h('button.chip.solid', { text: 'OK', onclick: function () {
            if (ui.entry && ui.bracket) ui.entry = E.editor.bracketApply(ui.entry, ui.bracket);
            ui.bracket = null; renderDock();
          } }))));
      return;
    }
    if (kind === 'abc') {
      [['fn', '\u0192x', 'util fx', 'Functions'], ['link', '@link', 'util', 'Use a row'], ['lp', '(', 'util', 'Open bracket'], ['rp', ')', 'util', 'Close bracket'], ['op:^', '^', 'util', 'To the power of'],
        ['op:/', '\u00f7', 'util', 'Divide'], ['op:*', '\u00d7', 'util', 'Multiply'], ['op:-', '\u2212', 'util', 'Minus'], ['op:+', '+', 'util', 'Plus'], ['sep', ',', 'util', 'Comma']].forEach(function (d) { pad.appendChild(keyEl(d)); });
      ABC_ROWS.forEach(function (rowChars, ri) {
        if (ri === 2) pad.appendChild(keyEl(['shift', '@shift', 'util s3', 'Capital letters']));
        rowChars.split('').forEach(function (ch, ci) {
          var k = keyEl(['ch:' + ch, ch, '', 'Letter ' + ch]);
          if (ri === 1 && ci === 0) k.classList.add('shift2');
          pad.appendChild(k);
        });
        if (ri === 2) pad.appendChild(keyEl(['back', '@backspace', 'util s3', 'Delete']));
      });
      pad.appendChild(keyEl(['num', '123', 'util word s5', 'Number keys']));
      pad.appendChild(keyEl(['clear', 'C', 'util clear s4', 'Clear']));
      pad.appendChild(keyEl(['enter', '@enter', 'enter s11', 'Enter']));
      return;
    }
    NUM_KEYS.forEach(function (d) { pad.appendChild(keyEl(d)); });
  }

  function actionFor(k) {
    if (k.charAt(1) === ':' && k.charAt(0) === 'd') return { k: 'digit', d: k.slice(2) };
    if (k.slice(0, 3) === 'op:') return { k: 'op', v: k.slice(3) };
    if (k.slice(0, 3) === 'ch:') { var ch = k.slice(3); return { k: 'letter', ch: ui.shift ? ch.toUpperCase() : ch }; }
    switch (k) {
      case 'dot': return { k: 'dot' };
      case 'lp': return { k: 'lp' };
      case 'rp': return { k: 'rp' };
      case 'sep': return { k: 'sep' };
      case 'back': return { k: 'back' };
      case 'clear': return { k: 'clear' };
      case 'sign': return { k: 'sign' };
      case 'pct': return { k: 'pct' };
    }
    return null;
  }

  function selMode() {
    if (!ui.sel || ui.entryOpen) return '';
    var f = fieldById(ui.sel);
    return f ? f.kind : '';
  }

  function refreshPad() {
    var pad = els.pad, kind = ui.padKind;
    if (kind !== 'num' && kind !== 'abc') return;
    var st = editorNow(), mode = selMode(), empty = E.editor.create(), dec = E.numFormatOf(S()).dec;
    Array.prototype.forEach.call(pad.querySelectorAll('[data-k]'), function (b) {
      var k = b.getAttribute('data-k');
      if (k === 'lp' || k === 'sep') {
        // the bracket key turns into a comma between the arguments of a function
        if (kind === 'num') {
          var wantSep = !mode && !E.editor.can(st, { k: 'lp' }) && E.editor.can(st, { k: 'sep' });
          if (wantSep && k === 'lp') { b.setAttribute('data-k', 'sep'); b.textContent = ','; b.setAttribute('aria-label', 'Comma'); k = 'sep'; }
          else if (!wantSep && k === 'sep') { b.setAttribute('data-k', 'lp'); b.textContent = '('; b.setAttribute('aria-label', 'Open bracket'); k = 'lp'; }
        }
      }
      var on = true, a = actionFor(k);
      if (k === 'abc' || k === 'num' || k === 'shift' || k === 'fn') on = true;
      else if (k === 'link') on = sheet().fields.length > 0 && (mode ? true : E.editor.can(st, { k: 'ref', id: '' }));
      else if (k === 'enter') on = mode ? true : E.editor.isComplete(st);
      else if (mode === 'input') on = k === 'dot' || k === 'back' || k === 'clear' || k === 'sign' || k === 'pct' || k.slice(0, 2) === 'd:' || k.slice(0, 3) === 'op:' ? true : (a ? E.editor.can(empty, a) : false);
      else if (mode === 'output') on = k === 'back' || k === 'clear' || k === 'pct' || k.slice(0, 3) === 'op:' ? true : (a ? E.editor.can(empty, a) : false);
      else if (k === 'clear') on = st.tokens.length > 0 || ui.entryOpen;
      else if (k === 'rp') on = E.editor.can(st, a) || canBracket();
      else on = a ? E.editor.can(st, a) : false;
      // Off keys keep receiving touches (a disabled button would swallow them): in fast typing a
      // finger can land on a key just before the key before it has made it available.
      b.classList.toggle('off', !on);
      if (on) b.removeAttribute('aria-disabled'); else b.setAttribute('aria-disabled', 'true');
      if (k === 'dot') b.textContent = dec;
      if (k === 'shift') b.classList.toggle('on', ui.shift);
      if (k.slice(0, 3) === 'ch:') b.textContent = ui.shift ? k.slice(3).toUpperCase() : k.slice(3);
    });
  }

  function renderDock() {
    // without a calculation there is nothing to link into, bracket or edit
    if (!ui.entry) { ui.link = null; ui.bracket = null; ui.editId = null; ui.entryOpen = false; }
    els.dock.hidden = ui.editMode;
    if (!ui.editMode) {
      renderEntry(); renderBar(); buildPad(); refreshPad();
      els.scrim.hidden = !(ui.entryOpen && !ui.link);
    }
    U.liftToast(toastLift());
  }

  function openEntry() {
    deselect();
    if (!ui.entry) ui.entry = E.editor.create();
    ui.entryOpen = true; ui.padShown = true;
    renderFields(); renderDock();
  }

  function cancelEntry() {
    ui.entry = null; ui.entryOpen = false; ui.editId = null; ui.link = null; ui.bracket = null;
    renderFields(); renderDock();
  }

  function collapseEntry() {
    if (ui.bracket) { ui.bracket = null; }
    if (ui.editId || !ui.entry || !ui.entry.tokens.length) { cancelEntry(); return; }
    ui.entryOpen = false; ui.link = null;
    renderFields(); renderDock();
  }

  /* Applies one editor action and redraws. */
  function edit(a) {
    var st = editorNow();
    if (!E.editor.can(st, a)) return false;
    ui.entry = E.editor.apply(st, a, edOpts());
    var wasOpen = ui.entryOpen;
    ui.entryOpen = true; deselect();
    if (!wasOpen) renderFields();
    renderDock();
    return true;
  }

  /* Starts a calculation from a row: its value, then the key that was pressed. */
  function startWithRef(id, action) {
    deselect();
    ui.editId = null;
    ui.entry = E.editor.apply(E.editor.create([T.ref(id)]), action, edOpts());
    ui.entryOpen = true;
    renderFields(); renderDock();
  }

  function advanceFrom(id) {
    var sh = sheet(), i, start = -1;
    for (i = 0; i < sh.fields.length; i++) if (sh.fields[i].id === id) { start = i; break; }
    for (i = start + 1; i < sh.fields.length; i++) {
      if (sh.fields[i].kind === 'input' && !E.hasValue(sh.fields[i])) { selectField(sh.fields[i].id); return; }
    }
    deselect(); renderFields(); renderDock();
  }

  /* Keys while a row is selected. Returns true when the key was used up. */
  function valueKey(k) {
    var sh = sheet(), f = fieldById(ui.sel);
    if (!f) { deselect(); return false; }
    if (k.slice(0, 3) === 'op:') { startWithRef(f.id, { k: 'op', v: k.slice(3) }); return true; }
    if (k === 'pct') { startWithRef(f.id, { k: 'pct' }); return true; }
    if (f.kind === 'output') {
      deselect(); renderFields();
      if (k === 'enter' || k === 'back' || k === 'clear') { renderDock(); return true; }
      return false;
    }
    var buf = ui.buf;
    if (k.slice(0, 2) === 'd:') {
      var d = k.slice(2);
      if (buf === null || buf === '0') buf = d;
      else if (buf === '-0') buf = '-' + d;
      else if (digitsIn(buf) < 15) buf += d;
    } else if (k === 'dot') {
      if (buf === null || buf === '') buf = '0.';
      else if (buf === '-') buf = '-0.';
      else if (buf.indexOf('.') < 0) buf += '.';
    } else if (k === 'back') {
      if (buf === null) buf = plainValue(f);
      buf = buf.slice(0, -1);
    } else if (k === 'clear') {
      buf = '';
    } else if (k === 'sign') {
      if (buf === null) buf = plainValue(f);
      buf = buf.charAt(0) === '-' ? buf.slice(1) : '-' + buf;
    } else if (k === 'enter') {
      haptic('light');
      advanceFrom(f.id);
      return true;
    } else {
      deselect(); renderFields();
      return false;
    }
    ui.buf = buf;
    E.setInputValue(sh, f.id, buf);
    save();
    renderFields(); renderDock();
    return true;
  }

  function commitEntry() {
    var sh = sheet(), st = ui.entry;
    if (!st || !E.editor.isComplete(st)) { shake(); return; }
    var wasEdit = !!ui.editId;
    var r = E.commit(sh, st.tokens, { mode: S().mode, editId: ui.editId });
    if (!r.ok) {
      shake();
      toast(r.error === 'cycle' ? 'That would make the formula depend on itself.' : r.error === 'symbol' ? 'Symbols are letters and digits, starting with a letter.' : 'This calculation isn\u2019t finished yet.');
      return;
    }
    ui.entry = null; ui.entryOpen = false; ui.editId = null; ui.link = null; ui.bracket = null;
    ui.sel = r.focusId || null; ui.buf = null;
    if (sh.example && !wasEdit) sh.example = false;
    flashRows(r.created.concat([r.fieldId]));
    save();
    renderFields(); renderDock();
    scrollToField(r.focusId || r.fieldId);
    haptic('success');
  }

  function shake() {
    haptic('warning');
    if (els.entry.hidden) return;
    els.entry.classList.remove('shake');
    void els.entry.offsetWidth;
    els.entry.classList.add('shake');
  }

  function key(k) {
    if (!sheet() || ui.editMode) return;
    if (k === 'abc' || k === 'num') { ui.padMode = k === 'abc' ? 'abc' : 'num'; ui.shift = false; ui.padShown = true; renderDock(); return; }
    if (k === 'shift') { ui.shift = !ui.shift; refreshPad(); return; }
    if (ui.link || ui.bracket) return;
    U.hideToast();
    haptic('light');
    if (ui.sel && !ui.entryOpen && valueKey(k)) return;
    if (k === 'fn') { functionsPanel(); return; }
    if (k === 'link') { startLink(); return; }
    if (k === 'enter') { commitEntry(); return; }
    var st = editorNow();
    if (k === 'clear' && !st.tokens.length) { cancelEntry(); return; }
    // with no bracket open, ) asks where one should open around what has been typed
    if (k === 'rp' && !E.editor.can(st, { k: 'rp' })) { startBracket(); return; }
    var a = actionFor(k);
    if (!a) return;
    if (edit(a) && a.k === 'letter' && ui.shift) { ui.shift = false; refreshPad(); }
  }

  // ---------------------------------------------------------------- linking and brackets

  function startLink() {
    var sh = sheet();
    if (!sh.fields.length) return;
    if (ui.sel) { var f = fieldById(ui.sel); deselect(); if (f) { ui.entry = E.editor.create(); } }
    if (!ui.entry) ui.entry = E.editor.create();
    var fnName = E.editor.innerFn(ui.entry);
    ui.entryOpen = true;
    ui.link = { multi: !!(fnName && E.FUNCS[fnName] && E.FUNCS[fnName].agg), count: 0 };
    renderFields(); renderDock();
  }

  function endLink() {
    ui.link = null;
    renderFields(); renderDock();
  }

  function linkPick(id) {
    var st = editorNow();
    if (ui.link.multi && ui.link.count > 0 && E.editor.can(st, { k: 'sep' })) st = E.editor.apply(st, { k: 'sep' }, edOpts());
    if (!E.editor.can(st, { k: 'ref', id: id })) { endLink(); return; }
    ui.entry = E.editor.apply(st, { k: 'ref', id: id }, edOpts());
    ui.link.count++;
    haptic('select');
    if (ui.link.multi) { renderFields(); renderDock(); } else endLink();
  }

  /* True when the bracket helper has a real choice to offer: a finished stretch of the
     calculation with at least two places where the bracket could open. */
  function canBracket() {
    if (!ui.entry || ui.link || ui.bracket) return false;
    var b = E.editor.bracketStart(ui.entry);
    return !!b && b.stops.length > 1;
  }

  function startBracket() {
    var st = ui.entry;
    if (!canBracket()) return false;
    var b = E.editor.bracketStart(st);
    if (!b) return false;
    ui.bracket = b; ui.entryOpen = true;
    haptic('medium');
    renderDock();
    return true;
  }

  function moveBracket(dir) {
    if (!ui.bracket) return;
    var next = E.editor.bracketMove(ui.bracket, dir);
    if (next.at === ui.bracket.at) return;
    ui.bracket = next;
    haptic('select');
    renderDock();
  }

  // ---------------------------------------------------------------- functions menu

  function functionsPanel() {
    var p, body = h('div');
    var seed = selMode() ? ui.sel : null;
    function base(needsOperand) { return seed && needsOperand ? E.editor.create([T.ref(seed)]) : (seed ? E.editor.create() : editorNow()); }
    function run(a, needsOperand) {
      var st = base(needsOperand);
      if (!E.editor.can(st, a)) return;
      p.close();
      deselect();
      if (seed) ui.editId = null;
      ui.entry = E.editor.apply(st, a, edOpts());
      ui.entryOpen = true; ui.padShown = true;
      renderFields(); renderDock();
    }
    function btn(label, a, small, needsOperand, cls) {
      return h('button.fbtn' + (cls ? '.' + cls : ''), { type: 'button', disabled: !E.editor.can(base(needsOperand), a), onclick: function () { run(a, needsOperand); } }, label, small ? h('small', { text: small }) : null);
    }
    function fnBtn(name, small) { return btn(E.displayFnName(name), { k: 'fn', v: name }, small, true); }
    function group(title, kids, cols) { return h('div.group', null, h('h3', { text: title }), h('div.fgrid' + (cols === 3 ? '.three' : ''), null, kids)); }

    body.appendChild(group('Everyday', [
      btn('x\u00b2', { k: 'square' }, 'squared', true, 'var'), fnBtn('sqrt', 'square root'), btn('1/x', { k: 'recip' }, 'one over', true, 'var'), btn('%', { k: 'pct' }, 'percent', true),
      btn('x\u02b8', { k: 'op', v: '^' }, 'power', true, 'var'), btn('\u03c0', { k: 'const', v: 'pi' }, 'pi', false, 'var'), btn('n!', { k: 'fact' }, 'factorial', true, 'var'), fnBtn('abs', 'no sign')
    ]));
    var totalBtn = h('button.btn.primary.block', { type: 'button', onclick: function () { p.close(); addTotal(); } }, icon('total'), 'Total of the rows above');
    body.appendChild(h('div.group', null, h('h3', { text: 'Add up rows' }), totalBtn,
      h('div.fgrid', { style: 'margin-top:7px' }, [fnBtn('sum', 'add up'), fnBtn('avg', 'average'), fnBtn('min', 'smallest'), fnBtn('max', 'largest'),
        fnBtn('count', 'how many'), fnBtn('median', 'middle'), fnBtn('sd', 'sample SD'), fnBtn('sdp', 'population SD')])));
    body.appendChild(group('Rounding', [fnBtn('round', 'nearest'), fnBtn('floor', 'down'), fnBtn('ceil', 'up'), fnBtn('mod', 'remainder')]));
    body.appendChild(group('Science', [fnBtn('sin'), fnBtn('cos'), fnBtn('tan'), fnBtn('cbrt', 'cube root'), fnBtn('asin'), fnBtn('acos'), fnBtn('atan'), btn('\u212f', { k: 'const', v: 'e' }, '2.718\u2026', false, 'var'),
      fnBtn('ln', 'natural log'), fnBtn('log', 'base 10'), fnBtn('exp', 'e to the x')]));
    body.appendChild(group('Compare and choose', [
      btn('<', { k: 'cmp', v: '<' }, null, true), btn('>', { k: 'cmp', v: '>' }, null, true), btn('\u2264', { k: 'cmp', v: '<=' }, null, true), btn('\u2265', { k: 'cmp', v: '>=' }, null, true),
      btn('=', { k: 'cmp', v: '=' }, null, true), btn('\u2260', { k: 'cmp', v: '!=' }, null, true), h('button.fbtn', { type: 'button', style: 'grid-column: span 2', disabled: !E.editor.can(base(false), { k: 'fn', v: 'if' }), onclick: function () { run({ k: 'fn', v: 'if' }, false); } }, 'if(', h('small', { text: 'test, then, otherwise' }))
    ]));
    var canBr = !seed && canBracket();
    body.appendChild(h('div.group', null, h('h3', { text: 'Brackets' }),
      h('button.btn.block', { type: 'button', disabled: !canBr, style: canBr ? '' : 'opacity:.4', onclick: function () { p.close(); startBracket(); } }, 'Bracket part of the calculation'),
      h('p.hint', { text: 'The ) key does the same when there is no open bracket for it to close.' })));
    p = U.panel('Functions', body, { tall: true });
  }

  function addTotal() {
    var sh = sheet();
    deselect();
    var r = E.commit(sh, [T.fn('sum'), T.above(), T.rp()], { mode: S().mode });
    if (!r.ok) return;
    var f = fieldById(r.fieldId);
    if (f && !f.desc) f.desc = 'Total';
    ui.entry = null; ui.entryOpen = false; ui.editId = null; ui.link = null; ui.bracket = null;
    flashRows([r.fieldId]);
    save(); renderFields(); renderDock();
    scrollToField(r.fieldId);
    haptic('success');
  }

  function startFormulaEdit(id) {
    var f = fieldById(id);
    if (!f || f.kind !== 'output') return;
    deselect();
    ui.entry = E.editor.load(f.formula || []);
    ui.editId = id; ui.entryOpen = true; ui.padShown = true; ui.link = null; ui.bracket = null;
    renderFields(); renderDock();
    haptic('select');
  }

  // ---------------------------------------------------------------- row details

  function propsPanel(id) {
    var sh = sheet(), f = fieldById(id);
    if (!f) return;
    var out = f.kind === 'output', fmt = E.fieldFormat(f, S());
    var preview = h('div.preview');
    function drawPreview() {
      var d = E.displayField(f, E.computeSheet(sh, S()).byId[f.id], S());
      clear(preview);
      preview.appendChild(h('span.sym', { text: f.symbol }));
      preview.appendChild(h('span.desc', { text: f.desc || (out ? formulaText(f) : 'No name yet') }));
      preview.appendChild(h('span.val', null, d.prefix ? h('span.pre', { text: d.prefix + ' ' }) : null, d.state === 'ok' ? d.text : (out ? '?' : '\u2014'), d.suffix ? h('span.suf', { text: ' ' + d.suffix }) : null));
    }
    function changed() { E.touch(sh); save(); drawPreview(); }

    var symHint = h('p.hint', { text: 'The short name formulas use for this row.' });
    var symInput = h('input.inp.short.var', { type: 'text', id: 'prop-symbol', value: f.symbol, maxlength: 12, autocomplete: 'off', autocapitalize: 'none', autocorrect: 'off', spellcheck: 'false', 'aria-label': 'Symbol' });
    symInput.addEventListener('input', function () {
      var v = symInput.value.trim();
      if (v === f.symbol) { symHint.className = 'hint'; symHint.textContent = 'The short name formulas use for this row.'; return; }
      var r = E.renameSymbol(sh, f.id, v);
      if (r.ok) { symHint.className = 'hint'; symHint.textContent = 'Formulas that use this row now show ' + v + '.'; changed(); }
      else { symHint.className = 'hint bad'; symHint.textContent = r.error; }
    });
    symInput.addEventListener('blur', function () { symInput.value = f.symbol; });

    var descInput = h('input.inp', { type: 'text', id: 'prop-desc', value: f.desc || '', maxlength: 300, placeholder: out ? 'What this result is' : 'What this number is', autocomplete: 'off', enterkeyhint: 'done', 'aria-label': 'Name' });
    descInput.addEventListener('input', function () { f.desc = descInput.value; changed(); });
    descInput.addEventListener('keydown', function (e) { if (e.key === 'Enter' && !e.isComposing && e.keyCode !== 229) { e.preventDefault(); descInput.blur(); } });

    function affix(kind, quick, placeholder) {
      var input = h('input.inp', { type: 'text', id: 'prop-' + kind, value: f[kind] || '', maxlength: 24, placeholder: placeholder, autocomplete: 'off', autocapitalize: 'none', autocorrect: 'off', spellcheck: 'false', 'aria-label': kind === 'prefix' ? 'Before the number' : 'After the number' });
      input.addEventListener('input', function () { f[kind] = input.value; changed(); });
      var row = h('div.quick');
      quick.forEach(function (q) { row.appendChild(h('button', { type: 'button', text: q, onclick: function () { input.value = input.value === q ? '' : q; f[kind] = input.value; changed(); } })); });
      return [input, row];
    }

    var minStep, maxStep;
    minStep = U.stepper(fmt.minDec, 0, fmt.maxDec, function (v) { f.minDec = v; f.maxDec = maxStep.get(); changed(); }, 'decimals at least');
    maxStep = U.stepper(fmt.maxDec, 0, 10, function (v) {
      f.maxDec = v;
      if (minStep.get() > v) f.minDec = v;
      else f.minDec = minStep.get();
      minStep.setLimits(0, v);
      f.minDec = minStep.get();
      changed();
    }, 'decimals at most');

    var body = h('div', null, preview);
    body.appendChild(h('div.group', null, h('h3', { text: 'Name' }),
      h('div.card', null, h('div.line.stack', null, descInput),
        h('div.line', null, h('label.lab', { 'for': 'prop-symbol', text: 'Symbol' }), symInput)), symHint));
    body.appendChild(h('div.group', null, h('h3', { text: 'Before the number' }), h('div.card', null, h('div.line.stack', null, affix('prefix', ['$', '\u20ac', '\u00a3', '\u00a5', '\u20b9', '#', '\u2248'], 'For example $')))));
    body.appendChild(h('div.group', null, h('h3', { text: 'After the number' }), h('div.card', null, h('div.line.stack', null, affix('suffix', ['%', 'kg', 'g', 'lb', 'oz', 'km', 'mi', 'm', 'cm', 'in', 'ft', 'l', 'ml', 'h', 'min', '\u00b0C', '\u00b0F'], 'For example % or kg')))));
    body.appendChild(h('div.group', null, h('h3', { text: 'Decimals' }),
      h('div.card', null,
        h('div.line.stack', null, U.seg([{ label: 'Nearest', value: 'round' }, { label: 'Round down', value: 'floor' }, { label: 'Round up', value: 'ceil' }], fmt.trunc, function (v) { f.trunc = v; changed(); }, 'Rounding')),
        h('div.line', null, h('span.lab', { text: 'At least' }), minStep),
        h('div.line', null, h('span.lab', { text: 'At most' }), maxStep)),
      h('p.hint', { text: 'With at least 2, the number 1.5 shows as 1.50.' })));
    var p;
    if (out) {
      body.appendChild(h('div.group', null, h('h3', { text: 'Formula' }),
        h('div.card', null, h('div.line', null, h('span.lab', { style: 'font: italic 400 18px/1.3 var(--font-var); overflow-wrap:anywhere', text: f.symbol + ' = ' + formulaText(f) }),
          h('button.chip', { type: 'button', text: 'Edit', onclick: function () { p.close(); startFormulaEdit(f.id); } })))));
    }
    var uses = E.dependentsOf(sh, f.id).length;
    body.appendChild(h('div.group', null, h('button.btn.block', { type: 'button', style: 'color:var(--neg)', onclick: function () { p.close(); deleteRows([f.id]); } }, icon('trash'), 'Delete this row'),
      uses ? h('p.hint', { text: plural(uses, 'formula uses', 'formulas use') + ' this row. ' + (!out && !E.hasValue(f)
        ? 'It has no number yet, so ' + (uses === 1 ? 'that formula' : 'those formulas') + ' will keep its symbol and wait for one.'
        : (out ? 'Its formula' : 'Its number') + ' will be written into ' + (uses === 1 ? 'it' : 'them') + ', so the results stay the same.') }) : null));
    drawPreview();
    // An unnamed row opens ready for its name. The panel then appears in place instead of sliding
    // up: iOS shows no caret in a field that is still off screen at the moment it is focused.
    var wantsName = !f.desc;
    p = U.panel('Row details', body, { tall: true, done: 'Done', instant: wantsName, onClose: function () { symInput.value = f.symbol; renderFields(); renderDock(); } });
    if (wantsName) descInput.focus({ preventScroll: true });
  }

  // ---------------------------------------------------------------- sheet options, icon, settings, help

  function iconPanel() {
    var sh = sheet(), p, grid = h('div.egrid');
    function pick(v) { sh.icon = v; E.touch(sh); save(); renderSheetHead(); p.close(); }
    D.EMOJI.forEach(function (em) { grid.appendChild(h('button', { type: 'button', text: em, 'aria-pressed': sh.icon === em ? 'true' : 'false', onclick: function () { pick(em); } })); });
    p = U.panel('Sheet icon', [grid, h('div.group', null, h('button.btn.block', { type: 'button', text: 'No icon', onclick: function () { pick(''); } }))], { tall: true });
  }

  function sheetMenu() {
    if (ui.bracket || ui.link) { ui.bracket = null; ui.link = null; renderFields(); renderDock(); }
    var sh = sheet(), p, list = h('div.menu');
    function act(fn) { return function () { p.close(); fn(); }; }
    function item(ic, label, small, fn, danger) {
      list.appendChild(h('button' + (danger ? '.danger' : ''), { type: 'button', onclick: act(fn) }, icon(ic), h('span', null, label, small ? h('small', { text: small }) : null)));
    }
    item('share', 'Share or export', 'PDF, CSV, a sheet file, or plain text', function () { sharePanel(); });
    if (sh.fields.length) item('grip', 'Edit rows', 'Reorder, or delete several at once', function () { setEditMode(true); });
    item('total', 'Add a total', 'Adds up every number row above it', addTotal);
    item('pencil', 'Rename sheet', null, function () { renameItem({ type: 'sheet', id: sh.id }); });
    item('smile', 'Choose an icon', null, iconPanel);
    item('copy', 'Duplicate sheet', null, function () { var id = sh.id; closeSheet(); duplicateSheet(id); });
    item('tune', 'Settings', 'How numbers become rows, decimals, appearance', settingsPanel);
    item('help', 'How it works', null, helpPanel);
    item('trash', 'Delete sheet', null, function () {
      U.confirmDialog({ title: 'Delete \u201c' + sh.name + '\u201d?', message: 'You can undo this right after.', ok: 'Delete', danger: true }).then(function (yes) {
        if (!yes) return;
        var id = sh.id; closeSheet(); deleteItem(id);
      });
    }, true);
    p = U.panel(sh.name, list);
  }

  function helpPanel() {
    var list = h('ul.tips');
    D.HELP.forEach(function (t) { list.appendChild(h('li', null, h('b', { text: t.title }), h('span', { text: t.text }))); });
    var steps = h('ol.steps');
    D.WELCOME.forEach(function (t) { steps.appendChild(h('li', null, h('b', { text: t.title }), h('span', { text: t.text }))); });
    U.panel('How it works', [steps, h('div.group', null, h('h3', { text: 'More you can do' }), list)], { tall: true });
  }

  function settingsPanel() {
    var st = S(), body = h('div');
    function set(k, v) { st[k] = v; save(); if (!els.sheet.hidden) { ui.padKind = ''; renderFields(); renderDock(); } else renderHome(); }
    function line(label, small, control) { return h('div.line', null, h('span.lab', null, label, small ? h('small', { text: small }) : null), control); }

    body.appendChild(h('div.group', null, h('h3', { text: 'Appearance' }),
      U.seg([{ label: 'Automatic', value: 'system' }, { label: 'Light', value: 'light' }, { label: 'Dark', value: 'dark' }], st.theme === 'light' || st.theme === 'dark' ? st.theme : 'system', function (v) { st.theme = v; save(); applyTheme(); }, 'Appearance')));

    body.appendChild(h('div.group', null, h('h3', { text: 'When you press the yellow key' }),
      U.seg([{ label: 'Numbers and symbols', value: 'ns' }, { label: 'Symbols only', value: 's' }], st.mode, function (v) { set('mode', v); modeHint.textContent = modeText(v); }, 'What becomes a row')));
    function modeText(v) {
      return v === 's' ? 'Only letters become rows. n \u00d7 (n + 1) \u00f7 2 gives one row for n; the 1 and the 2 stay inside the formula.'
        : 'Every number and letter you type becomes a row you can change. n \u00d7 (n + 1) \u00f7 2 gives rows for n, 1 and 2.';
    }
    var modeHint = h('p.hint', { text: modeText(st.mode) });
    body.appendChild(modeHint);

    var minStep, maxStep;
    minStep = U.stepper(st.defMinDec, 0, st.defMaxDec, function (v) { set('defMinDec', v); }, 'decimals at least');
    maxStep = U.stepper(st.defMaxDec, 0, 10, function (v) { st.defMaxDec = v; minStep.setLimits(0, v); st.defMinDec = minStep.get(); set('defMaxDec', v); }, 'decimals at most');
    body.appendChild(h('div.group', null, h('h3', { text: 'Typing and results' }),
      h('div.card', null,
        line('Bracket as you type', '34 \u00d7 2 then + becomes (34 \u00d7 2) +, as on a pocket calculator', U.toggle(st.autoBracket, function (v) { set('autoBracket', v); }, 'Bracket as you type')),
        line('Result decimals, at least', null, minStep),
        line('Result decimals, at most', 'Each row can set its own', maxStep),
        line('Show symbols', 'The small letters at the start of each row', U.toggle(st.showSymbols, function (v) { set('showSymbols', v); }, 'Show symbols')),
        line('Thousands separator', null, U.toggle(st.group, function (v) { set('group', v); }, 'Thousands separator')))));

    body.appendChild(h('div.group', null, h('h3', { text: 'Number format' }),
      U.seg([{ label: 'Auto', value: 'auto' }, { label: '1,234.5', value: 'us' }, { label: '1.234,5', value: 'eu' }, { label: '1\u202f234,5', value: 'fr' }], st.numFmt, function (v) { set('numFmt', v); }, 'Number format')));
    body.appendChild(h('div.group', null, h('h3', { text: 'Angles in sin, cos and tan' }),
      U.seg([{ label: 'Degrees', value: 'deg' }, { label: 'Radians', value: 'rad' }], st.angle, function (v) { set('angle', v); }, 'Angle unit')));

    if (NATIVE) {
      body.appendChild(h('div.group', null, h('div.card', null, line('Key taps you can feel', null, U.toggle(st.haptics, function (v) { set('haptics', v); }, 'Haptics')))));
    }

    var count = Object.keys(state.sheets).length;
    body.appendChild(h('div.group', null, h('h3', { text: 'Your sheets' }),
      h('div.card', null,
        h('div.line', null, h('span.lab', null, 'Save a backup', h('small', { text: plural(count, 'sheet', 'sheets') + ', with folders and settings, in one file' })),
          h('button.chip', { type: 'button', text: 'Save', onclick: function () { var js = E.exportBackupFile(state); deliver(fileName('Reckoner backup ' + new Date().toISOString().slice(0, 10), '.json'), 'application/json', js, js); } })),
        h('div.line', null, h('span.lab', null, 'Open a file', h('small', { text: 'A sheet file or a backup. Nothing you have is replaced.' })),
          h('button.chip', { type: 'button', text: 'Open', onclick: pickImport }))),
      h('p.hint', { text: NATIVE ? 'Sheets are kept on this iPhone and are part of its backups.' : 'Sheets are kept in this browser on this device. Save a backup if they matter.' })));

    body.appendChild(h('div.group', null, h('h3', { text: 'About' }),
      h('div.card', null, h('div.line', null, h('span.lab', null, 'Reckoner ' + VERSION, h('small', { text: 'Free, with nothing locked: no purchases, no sheet limit, no ads, no account.' })))),
      h('div', { style: 'margin-top:10px' }, h('button.btn.block', { type: 'button', onclick: helpPanel }, icon('help'), 'How it works'))));
    U.panel('Settings', body, { tall: true, done: 'Done' });
  }

  // ---------------------------------------------------------------- start-up

  function buildShell() {
    var app = doc.getElementById('app');
    clear(app);
    els.homeTop = h('header.top');
    els.homeHead = h('div.head');
    els.homeList = h('div.list', { id: 'home-list' });
    els.homeBar = h('footer.homebar', null,
      h('button.tbtn', { 'aria-label': 'Settings', onclick: settingsPanel }, icon('tune')),
      h('span.grow'),
      h('button.tbtn', { 'aria-label': 'New folder', onclick: newFolder }, icon('folderPlus')),
      h('button.cta', { id: 'new-sheet', onclick: newSheetPanel }, icon('plus'), 'New sheet'));
    els.home = h('section.screen', { id: 'home', 'aria-label': 'Sheets' }, els.homeTop, els.homeHead, els.homeList, els.homeBar);

    els.sheetTop = h('header.top');
    els.sheetHead = h('div.head');
    els.fields = h('div.fields', { id: 'fields' });
    els.scrim = h('div.scrim', { hidden: true, onclick: collapseEntry });
    els.entry = h('div.entry', { id: 'entry', hidden: true });
    els.bar = h('div.bar', { id: 'bar' });
    els.pad = h('div.pad', { id: 'pad' });
    els.dock = h('div.dock', null, els.entry, els.bar, els.pad);
    els.sheet = h('section.screen', { id: 'sheet', hidden: true, 'aria-label': 'Sheet' }, els.sheetTop, els.sheetHead,
      h('div.fields-wrap', null, els.fields, els.scrim), els.dock);

    els.fileInput = h('input', { type: 'file', id: 'file-input', accept: '.json,application/json,text/plain', hidden: true, 'aria-hidden': 'true', tabindex: '-1' });
    els.fileInput.addEventListener('change', function () {
      var file = els.fileInput.files && els.fileInput.files[0];
      if (!file) return;
      var reader = new FileReader();
      reader.onload = function () { U.closeAll(); importText(String(reader.result || ''), els.sheet.hidden); };
      reader.onerror = function () { toast('That file could not be read.'); };
      reader.readAsText(file);
    });

    app.appendChild(els.home);
    app.appendChild(els.sheet);
    app.appendChild(h('div', { id: 'overlays' }));
    app.appendChild(h('div.toast', { id: 'toast' }));
    app.appendChild(els.fileInput);

    U.listGestures(els.homeList, {
      rowSel: '.item', mainSel: '.item-main',
      onTap: function (row) { if (!ui.homeEdit) openItem(row.getAttribute('data-id')); },
      onLong: function (row) { if (ui.homeEdit) return false; itemMenu(row.getAttribute('data-id')); return true; },
      onDelete: function (row) { deleteItem(row.getAttribute('data-id')); },
      canSwipe: function () { return !ui.homeEdit; }
    });
    U.reorder(els.homeList, { rowSel: '.item', handleSel: '.grip', onMove: function (from, to) {
      var list = currentItems(), it = list.splice(from, 1)[0];
      list.splice(to, 0, it);
      save(); renderHome();
    } });
    U.listGestures(els.fields, {
      rowSel: '.row', mainSel: '.row-main',
      onTap: rowTap, onDouble: rowDouble, onLong: rowLong, onDelete: rowDelete,
      canSwipe: function () { return !ui.editMode && !ui.link && !ui.entryOpen; }
    });
    U.reorder(els.fields, { rowSel: '.row', handleSel: '.grip', onMove: function (from, to) {
      if (E.moveField(sheet(), from, to)) { save(); renderFields(); }
    } });

    // Keypad. A key acts when the finger lifts while still on it, and every finger is followed
    // on its own: iOS sends no click at all when two taps overlap, which fast two-thumb typing
    // does all the time. Holding delete repeats it; holding ) opens the bracket helper.
    var presses = {}, lastPadPress = 0;
    function keyIsOff(b) { return b.classList.contains('off') || !els.pad.contains(b); }
    function endPress(id) {
      var p = presses[id];
      if (!p) return null;
      delete presses[id];
      clearTimeout(p.t); clearInterval(p.i);
      p.b.classList.remove('down');
      return p;
    }
    els.pad.addEventListener('pointerdown', function (e) {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      endPress(e.pointerId);
      // a key that was taken away mid-press (the keys were swapped for something else) never reports its release
      for (var old in presses) if (!els.pad.contains(presses[old].b)) endPress(old);
      var b = e.target.closest('[data-k]');
      if (!b) return;
      var id = e.pointerId, k = b.getAttribute('data-k'), p = { b: b, held: false, t: null, i: null };
      presses[id] = p;
      if (!keyIsOff(b)) b.classList.add('down');
      if (k === 'back') {
        p.t = setTimeout(function () {
          if (presses[id] !== p || keyIsOff(b)) return;
          p.held = true;
          p.i = setInterval(function () { if (presses[id] !== p || keyIsOff(b)) clearInterval(p.i); else key('back'); }, 85);
        }, 420);
      } else if (k === 'rp') {
        p.t = setTimeout(function () {
          if (presses[id] !== p || !startBracket()) return;
          p.held = true;
          U.swallowClicks(6000);   // the click that follows the release belongs to nothing on the new bar
        }, 480);
      }
    });
    doc.addEventListener('pointerup', function (e) {
      var p = endPress(e.pointerId);
      if (!p) return;
      lastPadPress = Date.now();
      U.swallowClicks(700);   // the press is dealt with here; its click must not reach whatever shows up next
      if (p.held || keyIsOff(p.b)) return;
      var r = p.b.getBoundingClientRect(), slop = 14;
      if (e.clientX < r.left - slop || e.clientX > r.right + slop || e.clientY < r.top - slop || e.clientY > r.bottom + slop) return;
      key(p.b.getAttribute('data-k'));
    });
    doc.addEventListener('pointercancel', function (e) { if (endPress(e.pointerId)) { lastPadPress = Date.now(); U.swallowClicks(700); } });
    root.addEventListener('blur', function () { for (var id in presses) endPress(id); });
    // a click with no finger behind it: VoiceOver, a hardware keyboard on a focused key, or a script
    els.pad.addEventListener('click', function (e) {
      var b = e.target.closest('[data-k]');
      if (!b || keyIsOff(b) || Date.now() - lastPadPress < 700) return;
      key(b.getAttribute('data-k'));
    });

    // tap a part of the calculation to move there; drag sideways to walk the bracket
    var dragX = null;
    els.entry.addEventListener('click', function (e) {
      if (ui.bracket) return;
      var tk = e.target.closest('.tk');
      if (tk) { edit({ k: 'select', i: parseInt(tk.getAttribute('data-i'), 10) }); return; }
      if (e.target.closest('.expr') && ui.entry && ui.entry.tokens.length) edit({ k: 'select', i: ui.entry.tokens.length - 1 });
    });
    els.entry.addEventListener('pointerdown', function (e) { dragX = ui.bracket ? e.clientX : null; });
    els.entry.addEventListener('pointermove', function (e) {
      if (dragX === null || !ui.bracket) return;
      var dx = e.clientX - dragX;
      if (Math.abs(dx) >= 30) { moveBracket(dx > 0 ? 1 : -1); dragX = e.clientX; }
    });
    ['pointerup', 'pointercancel'].forEach(function (ev) { els.entry.addEventListener(ev, function () { dragX = null; }); });

    // iOS only shows pressed states when something listens for touches
    doc.addEventListener('touchstart', function () {}, { passive: true });
  }

  function onKeyDown(e) {
    var t = e.target, tag = t && t.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA') { if (e.key === 'Escape') t.blur(); return; }
    if (e.key === 'Escape') {
      if (U.closeTop()) { e.preventDefault(); return; }
      if (ui.bracket) { ui.bracket = null; renderDock(); return; }
      if (ui.link) { endLink(); return; }
      if (ui.entryOpen) { collapseEntry(); return; }
      if (ui.sel) { deselect(); renderFields(); renderDock(); return; }
      return;
    }
    if (U.anyOpen() || e.metaKey || e.ctrlKey || e.altKey) return;
    if ((tag === 'BUTTON' || (t && t.getAttribute && t.getAttribute('role') === 'button')) && (e.key === 'Enter' || e.key === ' ')) {
      if (tag !== 'BUTTON') { e.preventDefault(); t.click(); }
      return;
    }
    if (els.sheet.hidden || ui.editMode || ui.link || ui.bracket) return;
    var k = null, key1 = e.key;
    if (key1 >= '0' && key1 <= '9' && key1.length === 1) k = 'd:' + key1;
    else if (key1 === '.' || key1 === ',') k = (key1 === ',' && E.editor.can(editorNow(), { k: 'sep' }) && !selMode()) ? 'sep' : 'dot';
    else if (key1 === '+') k = 'op:+';
    else if (key1 === '-') k = 'op:-';
    else if (key1 === '*') k = 'op:*';
    else if (key1 === '/') k = 'op:/';
    else if (key1 === '^') k = 'op:^';
    else if (key1 === '(') k = 'lp';
    else if (key1 === ')') k = 'rp';
    else if (key1 === '%') k = 'pct';
    else if (key1 === '!') { e.preventDefault(); edit({ k: 'fact' }); return; }
    else if (key1 === 'Enter' || key1 === '=') k = 'enter';
    else if (key1 === 'Backspace') k = 'back';
    else if (key1 === 'Delete') k = 'clear';
    else if (key1 === 'ArrowLeft' && ui.entryOpen) { e.preventDefault(); edit({ k: 'left' }); return; }
    else if (key1 === 'ArrowRight' && ui.entryOpen) { e.preventDefault(); edit({ k: 'right' }); return; }
    else if (/^[A-Za-z]$/.test(key1)) {
      e.preventDefault();
      if (ui.sel && !ui.entryOpen) { deselect(); renderFields(); }
      edit({ k: 'letter', ch: key1 });
      return;
    }
    if (k) { e.preventDefault(); key(k); }
  }

  /* Keeps the app inside the part of the screen the on-screen keyboard leaves free. In the
     iPhone app the web view itself is resized, so this only acts in a browser. */
  function fitViewport() {
    var vv = root.visualViewport, body = doc.body;
    if (!vv || !body) return;
    var covered = root.innerHeight - vv.height;
    if (covered > 80 && Math.abs((vv.scale || 1) - 1) < 0.01) {
      body.style.height = vv.height + 'px';
      body.style.transform = vv.offsetTop ? 'translateY(' + vv.offsetTop + 'px)' : '';
    } else if (body.style.height) {
      body.style.height = '';
      body.style.transform = '';
    }
  }

  /* After the keyboard has taken its share of the screen, the field being typed in may sit
     below the fold of its panel. Scroll the panel, and only the panel, to show it. */
  function revealFocused() {
    var el = doc.activeElement;
    if (!el || (el.tagName !== 'INPUT' && el.tagName !== 'TEXTAREA')) return;
    var box = el.closest('.panel-body');
    if (!box) return;
    var r = el.getBoundingClientRect(), b = box.getBoundingClientRect();
    if (r.bottom > b.bottom - 12) box.scrollTop += r.bottom - b.bottom + 28;
    else if (r.top < b.top + 8) box.scrollTop -= b.top - r.top + 16;
  }

  function boot() {
    hostTheme = doc.documentElement.getAttribute('data-theme');
    state = loadState();
    buildShell();
    applyTheme();
    // a browser scrolls to show a focused field even where scrolling is off; put it back
    var appEl = doc.getElementById('app');
    appEl.addEventListener('scroll', function () {
      if (appEl.scrollTop) appEl.scrollTop = 0;
      if (appEl.scrollLeft) appEl.scrollLeft = 0;
    });
    if (root.visualViewport) {
      root.visualViewport.addEventListener('resize', function () { fitViewport(); setTimeout(revealFocused, 80); });
      root.visualViewport.addEventListener('scroll', fitViewport);
    }
    root.addEventListener('resize', function () { setTimeout(revealFocused, 80); });
    doc.addEventListener('focusin', function () { setTimeout(revealFocused, 420); });
    doc.addEventListener('focusout', function () { setTimeout(fitViewport, 350); });
    if (state.view.open && state.sheets[state.view.open]) openSheet(state.view.open);
    else { show('home'); renderHome(); }
    doc.addEventListener('keydown', onKeyDown);
    doc.addEventListener('visibilitychange', function () { if (doc.visibilityState === 'hidden') flush(); });
    root.addEventListener('pagehide', flush);
    if (inViewer()) getDownloads();
    nativeSend({ type: 'ready', version: VERSION });
  }

  /* Called by the iOS shell with the room the status bar and the home indicator need, in points.
     The page could read these from CSS, but the web view only passes them on after the first
     drawing, which would show for a moment with everything a little too high. */
  root.reckonerSetInsets = function (top, bottom) {
    var st = doc.documentElement.style;
    st.setProperty('--sat', (top > 0 ? +top : 0) + 'px');
    st.setProperty('--sab', (bottom > 0 ? +bottom : 0) + 'px');
    if (els.sheet) U.liftToast(toastLift());
    return true;
  };

  /* Called by the iOS shell when a sheet file is opened with the app. */
  root.reckonerImportFile = function (name, b64) {
    try { U.closeAll(); return importText(b64ToText(b64), true); } catch (e) { toast('That file could not be read.'); return false; }
  };

  root.Reckoner = {
    version: VERSION,
    engine: E,
    // a small surface for the automated checks
    test: {
      state: function () { return state; },
      ui: function () { return ui; },
      sheet: sheet,
      press: key,
      openSheet: openSheet,
      closeSheet: closeSheet,
      newBlank: function (name) { var sh = E.newSheet(name || 'New sheet'); createSheet(sh, true); return sh.id; },
      select: selectField,
      editFormula: startFormulaEdit,
      link: function (id) { startLink(); linkPick(id); },
      buildPDF: function () { return buildPDF(sheet()); },
      csv: function () { return E.sheetToCSV(sheet(), S()); },
      flush: flush,
      snapshot: function () { return JSON.stringify(state); },
      // puts back a state saved with snapshot(), so a self-test leaves no trace
      load: function (json) {
        U.closeAll(); U.hideToast();
        state = E.normalizeState(JSON.parse(json));
        ui.sheetId = null; ui.entry = null; ui.entryOpen = false; ui.sel = null; ui.buf = null; ui.link = null; ui.bracket = null; ui.editMode = false; ui.homeEdit = false; ui.padKind = '';
        applyTheme();
        if (state.view.open && state.sheets[state.view.open]) openSheet(state.view.open);
        else { show('home'); renderHome(); }
        flush();
      },
      reset: function () { try { root.localStorage.removeItem(STORE_KEY); } catch (e) { /* ignore */ } state = seedState(); ui.sheetId = null; show('home'); renderHome(); }
    }
  };

  if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', boot); else boot();
})(typeof self !== 'undefined' ? self : this);
