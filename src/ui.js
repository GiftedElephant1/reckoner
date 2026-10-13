/* Reckoner UI toolkit: element builder, icons, panels, dialogs, toast, and the two list
   gestures (swipe to delete, drag to reorder). */
(function (root) {
  'use strict';
  var D = root.ReckonerData;
  var SVG_NS = 'http://www.w3.org/2000/svg';

  function append(el, kid) {
    if (kid === null || kid === undefined || kid === false || kid === true) return;
    if (Array.isArray(kid)) { for (var i = 0; i < kid.length; i++) append(el, kid[i]); return; }
    el.appendChild(kid.nodeType ? kid : document.createTextNode(String(kid)));
  }

  /* h('button.key.util', {onclick: fn, 'aria-label': 'Clear'}, child, ...) */
  function h(spec, attrs) {
    var dot = spec.indexOf('.'), name = dot < 0 ? spec : spec.slice(0, dot);
    var el = document.createElement(name || 'div');
    if (dot >= 0) el.className = spec.slice(dot + 1).split('.').join(' ');
    var start = 1;
    if (attrs && typeof attrs === 'object' && !attrs.nodeType && !Array.isArray(attrs)) {
      start = 2;
      for (var k in attrs) {
        if (!Object.prototype.hasOwnProperty.call(attrs, k)) continue;
        var v = attrs[k];
        if (v === null || v === undefined || v === false) continue;
        if (k === 'class') { if (v) el.className = el.className ? el.className + ' ' + v : v; }
        else if (k === 'text') el.textContent = v;
        else if (k === 'value') el.value = v;
        else if (k.charAt(0) === 'o' && k.charAt(1) === 'n') el.addEventListener(k.slice(2), v);
        else if (v === true) el.setAttribute(k, '');
        else el.setAttribute(k, v);
      }
    }
    for (var i = start; i < arguments.length; i++) append(el, arguments[i]);
    return el;
  }

  function icon(name) {
    var s = document.createElementNS(SVG_NS, 'svg');
    s.setAttribute('viewBox', '0 0 24 24');
    s.setAttribute('class', 'ic');
    s.setAttribute('aria-hidden', 'true');
    s.setAttribute('focusable', 'false');
    s.innerHTML = D.ICONS[name] || '';
    return s;
  }

  function clear(el) { while (el.firstChild) el.removeChild(el.firstChild); return el; }

  // ---------------------------------------------------------------- leftover clicks

  /* On a touchscreen the browser sends a click once the finger lifts, aimed at whatever is
     under the finger by then. When the press has already been acted on (a key that acts as
     the finger lifts, a long press) that click is a leftover, and it could land on something
     that appeared in the meantime. swallowClicks() discards clicks until the next touch begins. */
  var swallowUntil = 0;
  function swallowClicks(ms) { swallowUntil = Date.now() + (ms || 700); }
  document.addEventListener('pointerdown', function () { swallowUntil = 0; }, true);
  document.addEventListener('click', function (e) {
    if (Date.now() < swallowUntil) { e.stopPropagation(); e.preventDefault(); }
  }, true);

  // ---------------------------------------------------------------- overlays

  var stack = [];

  /* content: element; opts: {center, modal, instant, onClose}. Returns {el, close}.
     instant: appear in place with no entrance movement, for overlays that focus a field at once. */
  function overlay(content, opts) {
    opts = opts || {};
    var layer = document.getElementById('overlays');
    var bg = h('div.ovl-bg');
    var el = h('div.ovl' + (opts.center ? '.center' : '') + (opts.instant ? '.open' : ''), { role: 'dialog', 'aria-modal': 'true' }, bg, content);
    var closed = false, born = Date.now();
    hideToast();
    var api = {
      el: el,
      close: function (result) {
        if (closed) return;
        closed = true;
        var i = stack.indexOf(api);
        if (i >= 0) stack.splice(i, 1);
        el.classList.remove('open');
        var active = document.activeElement;
        if (active && el.contains(active) && active.blur) active.blur();
        setTimeout(function () { if (el.parentNode) el.parentNode.removeChild(el); }, 280);
        if (opts.onClose) opts.onClose(result);
      }
    };
    // the tap that opened the overlay can arrive here a moment later on some phones; it is not a dismissal
    bg.addEventListener('click', function () { if (!opts.modal && Date.now() - born > 300) api.close(); });
    layer.appendChild(el);
    stack.push(api);
    // two frames so the starting position is painted before the transition runs
    requestAnimationFrame(function () { requestAnimationFrame(function () { el.classList.add('open'); }); });
    setTimeout(function () { el.classList.add('open'); }, 60);
    return api;
  }

  function closeTop() { if (stack.length) { stack[stack.length - 1].close(); return true; } return false; }
  function closeAll() { while (stack.length) stack[stack.length - 1].close(); }
  function anyOpen() { return stack.length > 0; }

  /* A sheet that slides up from the bottom. body: element or array. */
  function panel(title, body, opts) {
    opts = opts || {};
    var api;
    var closeBtn = h('button.tbtn', { 'aria-label': 'Close', onclick: function () { api.close(); } }, opts.done ? h('span.lbl', { text: opts.done }) : icon('close'));
    if (opts.done) closeBtn.classList.add('strong');
    var bodyEl = h('div.panel-body', null, body);
    var el = h('div.panel' + (opts.tall ? '.tall' : ''), null,
      h('div.panel-head', null, h('h2.panel-title', { text: title }), closeBtn),
      bodyEl);
    api = overlay(el, opts);
    api.body = bodyEl;
    return api;
  }

  function confirmDialog(o) {
    return new Promise(function (resolve) {
      var api, answered = false;
      function done(v) { answered = true; api.close(); resolve(v); }
      var el = h('div.dlg', null,
        h('h2', { text: o.title }),
        o.message ? h('p', { text: o.message }) : null,
        h('div.acts', null,
          h('button.btn', { text: o.cancel || 'Cancel', onclick: function () { done(false); } }),
          h('button.btn' + (o.danger ? '.danger' : '.primary'), { text: o.ok || 'OK', onclick: function () { done(true); } })));
      api = overlay(el, { center: true, onClose: function () { if (!answered) resolve(false); } });
    });
  }

  /* Asks for a short text. Must be called from a tap so the keyboard can open. */
  function promptDialog(o) {
    return new Promise(function (resolve) {
      var api, answered = false;
      var input = h('input.inp', { type: 'text', id: 'prompt-input', value: o.value || '', placeholder: o.placeholder || '', maxlength: o.max || 80,
        autocomplete: 'off', autocapitalize: 'sentences', enterkeyhint: 'done', 'aria-label': o.title });
      function done(v) { answered = true; api.close(); resolve(v); }
      function submit() { var v = input.value.trim(); if (!v && !o.allowEmpty) { input.focus(); return; } done(v); }
      // an Enter that only confirms a Japanese or Chinese candidate is not the answer yet
      input.addEventListener('keydown', function (e) { if (e.key === 'Enter' && !e.isComposing && e.keyCode !== 229) { e.preventDefault(); submit(); } });
      var el = h('div.dlg', null,
        h('h2', { text: o.title }),
        o.message ? h('p', { text: o.message }) : null,
        input,
        h('div.acts', null,
          h('button.btn', { text: 'Cancel', onclick: function () { done(null); } }),
          h('button.btn.primary', { text: o.ok || 'Save', onclick: submit })));
      api = overlay(el, { center: true, instant: true, onClose: function () { if (!answered) resolve(null); } });
      input.focus({ preventScroll: true });
      try { input.setSelectionRange(0, input.value.length); } catch (e) { /* not every input type allows it */ }
    });
  }

  // ---------------------------------------------------------------- toast

  var toastTimer = null;
  /* px: the height of whatever is docked at the bottom, which the toast must clear. */
  function liftToast(px) {
    var el = document.getElementById('toast');
    if (el) el.style.bottom = px ? (px + 10) + 'px' : '';
  }
  function toast(message, opts) {
    opts = opts || {};
    var el = document.getElementById('toast');
    clear(el);
    el.appendChild(h('span', { text: message }));
    if (opts.action) {
      el.appendChild(h('button', { text: opts.action, onclick: function () { hideToast(); opts.onAction(); } }));
    }
    liftToast(opts.lift || 0);
    el.onclick = function (e) { if (!e.target.closest('button')) hideToast(); };
    el.className = 'toast show';
    el.setAttribute('role', 'status');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(hideToast, opts.ms || (opts.action ? 5000 : 2600));
  }
  function hideToast() {
    var el = document.getElementById('toast');
    if (el) el.classList.remove('show');
    clearTimeout(toastTimer);
  }

  // ---------------------------------------------------------------- list gestures

  var SWIPE_W = 96;

  /* Taps, double taps, long presses and swipe-to-delete on the rows of a list.
     opts: rowSel, mainSel, onTap(row, zone, e), onDouble(row, zone),
           onLong(row) -> false when the hold was not used, onDelete(row), canSwipe() */
  function listGestures(container, opts) {
    // `consumed` marks a touch that already did something (closed an open row, became a swipe
    // or a long press), so the click that follows it must not also act as a tap.
    var g = null, openRow = null, lastTap = { id: null, t: 0, zone: '' }, consumed = false;

    function main(row) { return row.querySelector(opts.mainSel); }
    function setX(row, x, animate) {
      var m = main(row);
      if (!m) return;
      if (animate) m.classList.add('sliding'); else m.classList.remove('sliding');
      m.style.transform = x ? 'translateX(' + x + 'px)' : '';
      // the Delete button behind a row only exists while the row is slid aside
      clearTimeout(row._hideDel);
      if (x) row.classList.add('reveal');
      else if (animate) row._hideDel = setTimeout(function () { row.classList.remove('reveal'); }, 220);
      else row.classList.remove('reveal');
    }
    function closeOpen() { if (openRow) { setX(openRow, 0, true); openRow = null; } }
    /* Drops the gesture in progress; a row caught mid-swipe goes back to where it started. */
    function abandon() {
      if (!g) return;
      clearTimeout(g.timer);
      if (g.swiping) setX(g.row, g.wasOpen ? -SWIPE_W : 0, true);
      g = null;
    }
    // the list is redrawn often; a row that is no longer on screen cannot still be open
    function forgetStale() { if (openRow && !container.contains(openRow)) openRow = null; }

    container.addEventListener('pointerdown', function (e) {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      forgetStale();
      consumed = false;
      abandon();
      var row = e.target.closest(opts.rowSel);
      if (openRow && row !== openRow) { closeOpen(); consumed = true; }
      if (!row || e.target.closest('.grip') || e.target.closest('.chip') || e.target.closest('.row-del') || e.target.closest('.item-del')) return;
      var mine = { row: row, x0: e.clientX, y0: e.clientY, id: e.pointerId, swiping: false, moved: false, wasOpen: row === openRow, timer: null, x: 0, dx: 0,
        width: row.getBoundingClientRect().width };
      g = mine;
      if (opts.onLong && !consumed) {
        mine.timer = setTimeout(function () {
          if (g !== mine || mine.moved || mine.swiping || !container.contains(mine.row)) return;
          // a hold the list has no use for right now stays an ordinary, slow tap
          if (opts.onLong(mine.row) === false) return;
          consumed = true; mine.moved = true;
          swallowClicks(6000);
        }, 520);
      }
    });
    container.addEventListener('pointermove', function (e) {
      if (!g || e.pointerId !== g.id) return;
      if (!container.contains(g.row)) { clearTimeout(g.timer); g = null; return; }   // the list was redrawn under the finger
      var dx = e.clientX - g.x0, dy = e.clientY - g.y0;
      if (!g.swiping) {
        if (!g.moved && Math.abs(dx) > 9 && Math.abs(dx) > Math.abs(dy) * 1.3 && opts.onDelete && (!opts.canSwipe || opts.canSwipe())) {
          g.swiping = true; g.moved = true; consumed = true; clearTimeout(g.timer);
          try { container.setPointerCapture(e.pointerId); } catch (err) { /* older WebKit */ }
        } else if (Math.abs(dy) > 9 || Math.abs(dx) > 9) { g.moved = true; clearTimeout(g.timer); }
      }
      if (g.swiping) {
        var x = dx + (g.wasOpen ? -SWIPE_W : 0);
        if (x > 0) x = 0;
        if (x < -SWIPE_W) x = -SWIPE_W + (x + SWIPE_W) * 0.55;
        setX(g.row, x, false);
        g.x = x; g.dx = dx;
        e.preventDefault();
      }
    });
    function finish(e) {
      if (!g || e.pointerId !== g.id) return;
      clearTimeout(g.timer);
      if (g.swiping) {
        // a row that was redrawn mid-swipe is not the row the finger set out on
        if (!container.contains(g.row) || !(g.width > 0)) { g = null; return; }
        // a long, deliberate swipe deletes straight away
        if (g.dx < -g.width * 0.6) { var r = g.row; openRow = null; g = null; opts.onDelete(r); return; }
        if (g.x < -SWIPE_W * 0.45) { setX(g.row, -SWIPE_W, true); openRow = g.row; }
        else { setX(g.row, 0, true); if (openRow === g.row) openRow = null; }
      }
      g = null;
    }
    container.addEventListener('pointerup', finish);
    container.addEventListener('pointercancel', function (e) {
      if (g && e.pointerId === g.id) abandon();
    });
    container.addEventListener('scroll', function () { if (g) { clearTimeout(g.timer); g.moved = true; } }, { passive: true });

    // An iPhone lets the list take over a touch as soon as the finger drifts up or down, which
    // would cut a sideways swipe short. A touch that clearly sets off sideways on a row is
    // claimed here before that can happen; one that sets off up or down is left to scroll.
    var lock = null;
    container.addEventListener('touchstart', function (e) {
      lock = null;
      if (!opts.onDelete || e.touches.length !== 1) return;
      var t = e.touches[0], el = t.target;
      if (!el || !el.closest || !el.closest(opts.rowSel) || el.closest('.grip')) return;
      lock = { id: t.identifier, x0: t.clientX, y0: t.clientY, sideways: null };
    }, { passive: true });
    container.addEventListener('touchmove', function (e) {
      if (!lock) return;
      var t = e.touches.length === 1 ? e.touches[0] : null;
      if (!t || t.identifier !== lock.id) { lock = null; return; }
      if (lock.sideways === null) {
        var dx = Math.abs(t.clientX - lock.x0), dy = Math.abs(t.clientY - lock.y0);
        if (dx * dx + dy * dy < 25) return;   // too little movement to tell yet
        lock.sideways = dx > dy * 1.3 && (!opts.canSwipe || opts.canSwipe());
      }
      if (lock.sideways && e.cancelable) e.preventDefault();
    }, { passive: false });
    container.addEventListener('touchend', function () { lock = null; }, { passive: true });
    container.addEventListener('touchcancel', function () { lock = null; }, { passive: true });

    container.addEventListener('click', function (e) {
      forgetStale();
      var wasConsumed = consumed;
      consumed = false;
      var del = e.target.closest('.row-del, .item-del');
      if (del) {
        // the button only counts while its row is slid open to show it
        var dr = del.closest(opts.rowSel);
        if (dr && dr === openRow && !wasConsumed) { openRow = null; opts.onDelete(dr); }
        return;
      }
      if (wasConsumed) return;
      if (e.target.closest('.chip') || e.target.closest('.grip')) return;
      var row = e.target.closest(opts.rowSel);
      if (!row) return;
      if (openRow) { closeOpen(); return; }
      var rect = row.getBoundingClientRect();
      var zone = e.clientX - rect.left > rect.width * 0.56 ? 'right' : 'left';
      var id = row.getAttribute('data-id'), now = Date.now();
      if (opts.onDouble && lastTap.id === id && lastTap.zone === zone && now - lastTap.t < 380) {
        lastTap = { id: null, t: 0, zone: '' };
        opts.onDouble(row, zone, e);
        return;
      }
      lastTap = { id: id, t: now, zone: zone };
      opts.onTap(row, zone, e);
    });

    return { close: closeOpen };
  }

  /* Drag rows by their handle. opts: rowSel, handleSel, onMove(from, to) */
  function reorder(container, opts) {
    var d = null;
    container.addEventListener('pointerdown', function (e) {
      var handle = e.target.closest(opts.handleSel);
      if (!handle) return;
      var row = handle.closest(opts.rowSel);
      if (!row) return;
      e.preventDefault();
      var rows = Array.prototype.slice.call(container.querySelectorAll(opts.rowSel));
      d = {
        id: e.pointerId, row: row, rows: rows, from: rows.indexOf(row), to: rows.indexOf(row), y0: e.clientY,
        scroll0: container.scrollTop,
        rects: rows.map(function (r) { var b = r.getBoundingClientRect(); return { top: b.top, h: b.height }; })
      };
      row.classList.add('dragging');
      try { handle.setPointerCapture(e.pointerId); } catch (err) { /* older WebKit */ }
    });
    container.addEventListener('pointermove', function (e) {
      if (!d || e.pointerId !== d.id) return;
      e.preventDefault();
      var box = container.getBoundingClientRect();
      if (e.clientY < box.top + 44) container.scrollTop -= 12;
      else if (e.clientY > box.bottom - 44) container.scrollTop += 12;
      var dy = e.clientY - d.y0 + (container.scrollTop - d.scroll0);
      var me = d.rects[d.from], centre = me.top + me.h / 2 + dy, to = d.from, i;
      for (i = 0; i < d.rows.length; i++) {
        if (i === d.from) continue;
        var mid = d.rects[i].top + d.rects[i].h / 2;
        if (i < d.from && centre < mid) { to = Math.min(to, i); }
        if (i > d.from && centre > mid) { to = Math.max(to, i); }
      }
      d.to = to;
      d.row.style.transform = 'translateY(' + dy + 'px)';
      for (i = 0; i < d.rows.length; i++) {
        if (i === d.from) continue;
        var shift = 0;
        if (d.from < i && i <= to) shift = -me.h;
        else if (to <= i && i < d.from) shift = me.h;
        d.rows[i].classList.add('sliding');
        d.rows[i].style.transform = shift ? 'translateY(' + shift + 'px)' : '';
      }
    });
    function end(e) {
      if (!d || e.pointerId !== d.id) return;
      var from = d.from, to = d.to, rows = d.rows;
      d.row.classList.remove('dragging');
      for (var i = 0; i < rows.length; i++) { rows[i].classList.remove('sliding'); rows[i].style.transform = ''; }
      d = null;
      if (from !== to) opts.onMove(from, to);
    }
    container.addEventListener('pointerup', end);
    container.addEventListener('pointercancel', end);
  }

  // ---------------------------------------------------------------- small controls

  function seg(options, value, onChange, label) {
    var el = h('div.seg', { role: 'group', 'aria-label': label || '' });
    options.forEach(function (o) {
      el.appendChild(h('button', { type: 'button', text: o.label, 'aria-pressed': o.value === value ? 'true' : 'false', onclick: function () {
        Array.prototype.forEach.call(el.children, function (b) { b.setAttribute('aria-pressed', 'false'); });
        this.setAttribute('aria-pressed', 'true');
        onChange(o.value);
      } }));
    });
    return el;
  }

  function stepper(value, min, max, onChange, label) {
    var out = h('output', { text: String(value) });
    var minus = h('button', { type: 'button', 'aria-label': 'Fewer ' + label, text: '\u2212' });
    var plus = h('button', { type: 'button', 'aria-label': 'More ' + label, text: '+' });
    var api = h('div.step', null, minus, out, plus);
    function set(v, quiet) {
      value = Math.max(api.min, Math.min(api.max, v));
      out.textContent = String(value);
      minus.disabled = value <= api.min; plus.disabled = value >= api.max;
      if (!quiet) onChange(value);
    }
    api.min = min; api.max = max;
    api.setLimits = function (lo, hi) { api.min = lo; api.max = hi; set(value, true); };
    api.get = function () { return value; };
    minus.addEventListener('click', function () { set(value - 1); });
    plus.addEventListener('click', function () { set(value + 1); });
    set(value, true);
    return api;
  }

  function toggle(on, onChange, label) {
    var el = h('button.switch', { type: 'button', role: 'switch', 'aria-checked': on ? 'true' : 'false', 'aria-label': label });
    el.addEventListener('click', function () {
      on = !on;
      el.setAttribute('aria-checked', on ? 'true' : 'false');
      onChange(on);
    });
    return el;
  }

  root.ReckonerUI = {
    h: h, icon: icon, clear: clear, overlay: overlay, panel: panel, closeTop: closeTop, closeAll: closeAll, anyOpen: anyOpen,
    confirmDialog: confirmDialog, promptDialog: promptDialog, toast: toast, hideToast: hideToast, liftToast: liftToast, swallowClicks: swallowClicks,
    listGestures: listGestures, reorder: reorder, seg: seg, stepper: stepper, toggle: toggle
  };
})(typeof self !== 'undefined' ? self : this);
