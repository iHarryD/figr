(function () {
  'use strict';

  var hostWindow = null;
  var seq = 0;
  var mode = 'select';
  var _devIgnoreNextHello = false;
  var _devThrowNextTreeQuery = false;
  var _devThrowNextClick = false;

  window.onerror = function (message, source, lineno) {
    send('pageError', { message: String(message) + (source ? ' (' + source + ':' + lineno + ')' : '') });
    return false;
  };

  window.addEventListener('unhandledrejection', function (event) {
    var reason = event.reason;
    var msg = reason instanceof Error ? reason.message : String(reason);
    send('pageError', { message: 'Unhandled rejection: ' + msg });
  });

  window.addEventListener('pagehide', function () {
    send('navigated', {});
  });

  function send(kind, payload) {
    if (!hostWindow) return;
    hostWindow.postMessage({ v: 1, id: 'a' + (++seq), kind: kind, payload: payload || {} }, '*');
  }

  function computeEid(el) {
    var key = el.getAttribute && el.getAttribute('data-key');
    if (key) return 'key:' + key;
    var parts = [];
    var cur = el;
    while (cur && cur !== document.documentElement) {
      var parent = cur.parentElement;
      var idx = 0;
      if (parent) {
        var siblings = parent.children;
        for (var i = 0; i < siblings.length; i++) {
          if (siblings[i] === cur) { idx = i; break; }
        }
      }
      parts.unshift(cur.tagName.toLowerCase() + '[' + idx + ']');
      cur = parent;
    }
    return 'path:' + parts.join('>');
  }

  function findByEid(eid) {
    if (eid === 'body') return document.body;
    if (eid.startsWith('key:')) {
      return document.querySelector('[data-key="' + eid.slice(4) + '"]');
    }
    if (!eid.startsWith('path:')) return null;
    var parts = eid.slice(5).split('>');
    var el = document.documentElement;
    for (var i = 0; i < parts.length; i++) {
      var match = parts[i].match(/^(.+)\[(\d+)\]$/);
      if (!match) return null;
      var tag = match[1];
      var idx = parseInt(match[2], 10);
      var child = el.children[idx];
      if (!child || child.tagName.toLowerCase() !== tag) return null;
      el = child;
    }
    return el;
  }

  function getName(el) {
    var dataName = el.getAttribute('data-name');
    if (dataName) return dataName;
    var tag = el.tagName.toLowerCase();
    var firstClass = el.classList && el.classList[0];
    if (firstClass) return tag + '.' + firstClass;
    if (el.id) return tag + '#' + el.id;
    return tag;
  }

  function getRect(el) {
    var r = el.getBoundingClientRect();
    return { x: r.left + window.scrollX, y: r.top + window.scrollY, width: r.width, height: r.height };
  }

  var lastHoveredEl = null;
  var hoverRafId = null;
  var lastClientX = 0;
  var lastClientY = 0;

  function onPointerMove(event) {
    lastClientX = event.clientX;
    lastClientY = event.clientY;
    if (hoverRafId) return;
    hoverRafId = requestAnimationFrame(function () {
      hoverRafId = null;
      var el = document.elementFromPoint(lastClientX, lastClientY);
      if (!el || el === document.documentElement || el === document.body) {
        if (lastHoveredEl !== null) {
          lastHoveredEl = null;
          send('pointer', { eid: null, name: null, rect: null });
        }
        return;
      }
      if (el === lastHoveredEl) return;
      lastHoveredEl = el;
      send('pointer', { eid: computeEid(el), name: getName(el), rect: getRect(el) });
    });
  }

  function onPointerLeave() {
    if (hoverRafId) { cancelAnimationFrame(hoverRafId); hoverRafId = null; }
    lastHoveredEl = null;
    send('pointer', { eid: null, name: null, rect: null });
  }

  var subscriptions = {};
  var pendingRectUpdates = {};
  var rectRafId = null;

  function flushRects() {
    rectRafId = null;
    var updates = Object.keys(pendingRectUpdates).map(function (eid) {
      return { eid: eid, rect: pendingRectUpdates[eid] };
    });
    pendingRectUpdates = {};
    if (updates.length > 0) send('rects', { updates: updates });
  }

  function queueRectUpdate(eid, el) {
    if (!el.isConnected) return;
    pendingRectUpdates[eid] = getRect(el);
    if (!rectRafId) rectRafId = requestAnimationFrame(flushRects);
  }

  function subscribeEl(eid, el) {
    if (subscriptions[eid]) return;
    var sub = { el: el, scrollEls: [], scrollHandlers: [] };
    var ro = new ResizeObserver(function () { queueRectUpdate(eid, el); });
    ro.observe(el);
    sub.ro = ro;
    var p = el.parentElement;
    while (p) {
      (function (scrollEl) {
        var handler = function () { queueRectUpdate(eid, el); };
        scrollEl.addEventListener('scroll', handler, { passive: true });
        sub.scrollEls.push(scrollEl);
        sub.scrollHandlers.push(handler);
      })(p);
      p = p.parentElement;
    }
    queueRectUpdate(eid, el);
    subscriptions[eid] = sub;
    ensureMutationObserver();
  }

  function subscribeEid(eid) {
    var el = findByEid(eid);
    if (!el) return;
    subscribeEl(eid, el);
  }

  function unsubscribeEid(eid) {
    var sub = subscriptions[eid];
    if (!sub) return;
    if (sub.ro) sub.ro.disconnect();
    sub.scrollEls.forEach(function (el, i) {
      el.removeEventListener('scroll', sub.scrollHandlers[i]);
    });
    delete subscriptions[eid];
    delete pendingRectUpdates[eid];
  }

  var mo = null;
  var mutationDebounceId = null;
  var mutatedParents = [];

  function processMutations() {
    mutationDebounceId = null;
    rematchEids();

    var parents = mutatedParents;
    mutatedParents = [];
    parents.forEach(function (parent) {
      if (parent && parent.isConnected && parent !== document.body) {
        send('mutation', { parentEid: computeEid(parent) });
      } else if (parent === document.body) {
        send('mutation', { parentEid: 'body' });
      }
    });
  }

  function ensureMutationObserver() {
    if (mo) return;
    mo = new MutationObserver(function (records) {
      records.forEach(function (r) {
        if (r.type === 'childList' && r.target) {
          mutatedParents.push(r.target);
        }
      });
      if (!mutationDebounceId) {
        mutationDebounceId = setTimeout(processMutations, 16);
      }
    });
    mo.observe(document.body || document.documentElement, { childList: true, subtree: true });
  }

  function rematchEids() {
    var eids = Object.keys(subscriptions);
    if (eids.length === 0) return;
    var remaps = [];
    var removed = [];
    eids.forEach(function (eid) {
      var sub = subscriptions[eid];
      var el = sub.el;
      if (el.isConnected) {
        var newEid = computeEid(el);
        if (newEid !== eid) {
          sub.ro && sub.ro.disconnect();
          sub.scrollEls.forEach(function (e, i) { e.removeEventListener('scroll', sub.scrollHandlers[i]); });
          delete subscriptions[eid];
          delete pendingRectUpdates[eid];
          subscribeEl(newEid, el);
          remaps.push({ old: eid, new: newEid });
        }
      } else {
        var freshEl = findByEid(eid);
        if (freshEl && freshEl.isConnected) {
          sub.ro && sub.ro.disconnect();
          sub.scrollEls.forEach(function (e, i) { e.removeEventListener('scroll', sub.scrollHandlers[i]); });
          delete subscriptions[eid];
          subscribeEl(eid, freshEl);
        } else {
          removed.push(eid);
          unsubscribeEid(eid);
        }
      }
    });
    if (remaps.length > 0 || removed.length > 0) {
      send('eidRemap', { remaps: remaps, removed: removed });
    }
  }

  var liveSubscriptions = {};
  var liveRafPending = {};

  function getLiveData(eid, el) {
    var cs = window.getComputedStyle(el);
    var r = el.getBoundingClientRect();
    return {
      eid: eid,
      name: getName(el),
      tag: el.tagName.toLowerCase(),
      id: el.id || '',
      classes: (el.getAttribute('class') || '').trim(),
      w: Math.round(r.width),
      h: Math.round(r.height),
      x: Math.round(r.left + window.scrollX),
      y: Math.round(r.top + window.scrollY),
      text: (el.textContent || '').slice(0, 120).trim(),
      color: cs.color,
      bg: cs.backgroundColor,
      fontFamily: cs.fontFamily,
      fontSize: cs.fontSize,
      fontWeight: cs.fontWeight,
    };
  }

  function queueLiveUpdate(eid, el) {
    if (liveRafPending[eid]) return;
    liveRafPending[eid] = requestAnimationFrame(function () {
      delete liveRafPending[eid];
      if (liveSubscriptions[eid]) send('live', getLiveData(eid, el));
    });
  }

  function teardownLiveSub(eid) {
    var sub = liveSubscriptions[eid];
    if (!sub) return;
    if (sub.ro) sub.ro.disconnect();
    if (sub.mo) sub.mo.disconnect();
    if (liveRafPending[eid]) {
      cancelAnimationFrame(liveRafPending[eid]);
      delete liveRafPending[eid];
    }
    delete liveSubscriptions[eid];
  }

  var captureHandlers = null;

  var interactModeKeys = ['v', 'V', 'i', 'I', 'Escape'];
  function onInteractKey(e) {
    if (interactModeKeys.indexOf(e.key) !== -1) {
      send('key', { key: e.key, shift: e.shiftKey, ctrl: e.ctrlKey, meta: e.metaKey });
    }
  }

  function installSelectMode() {
    document.removeEventListener('keydown', onInteractKey);
    if (captureHandlers) return;
    captureHandlers = {};

    var blocked = ['mousedown', 'mouseup', 'submit', 'contextmenu'];
    blocked.forEach(function (name) {
      captureHandlers[name] = function (e) {
        e.preventDefault();
        e.stopImmediatePropagation();
      };
      document.addEventListener(name, captureHandlers[name], true);
    });

    captureHandlers['click'] = function (e) {
      if (_devThrowNextClick) {
        _devThrowNextClick = false;
        e.preventDefault();
        e.stopImmediatePropagation();
        throw new Error('[dev] click handler throw');
      }
      var el = e.target;
      if (el && el !== document.documentElement && el !== document.body) {
        send('click', { eid: computeEid(el), rect: getRect(el), name: getName(el), shift: e.shiftKey });
      } else {
        send('click', { eid: null, rect: null, name: null, shift: false });
      }
      e.preventDefault();
      e.stopImmediatePropagation();
    };
    document.addEventListener('click', captureHandlers['click'], true);

    captureHandlers['keydown'] = function (e) {
      var tag = e.target && e.target.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') {
        e.preventDefault();
        e.stopImmediatePropagation();
        return;
      }
      var navKeys = ['Enter', 'Tab', 'Escape', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'];
      var modeKeys = ['v', 'V', 'i', 'I'];
      if (navKeys.indexOf(e.key) !== -1 || modeKeys.indexOf(e.key) !== -1) {
        send('key', { key: e.key, shift: e.shiftKey, ctrl: e.ctrlKey, meta: e.metaKey });
        e.preventDefault();
        e.stopImmediatePropagation();
      }
    };
    document.addEventListener('keydown', captureHandlers['keydown'], true);

    document.addEventListener('pointermove', onPointerMove);
    document.addEventListener('pointerleave', onPointerLeave);

    if (document.activeElement && document.activeElement !== document.body) {
      document.activeElement.blur();
    }
  }

  function uninstallSelectMode() {
    if (!captureHandlers) return;
    Object.keys(captureHandlers).forEach(function (name) {
      document.removeEventListener(name, captureHandlers[name], true);
    });
    captureHandlers = null;
    document.removeEventListener('pointermove', onPointerMove);
    document.removeEventListener('pointerleave', onPointerLeave);
    if (hoverRafId) { cancelAnimationFrame(hoverRafId); hoverRafId = null; }
    lastHoveredEl = null;
    send('pointer', { eid: null, name: null, rect: null });
    document.addEventListener('keydown', onInteractKey);
  }

  window.addEventListener('message', function (event) {
    var msg = event.data;
    if (!msg || msg.v !== 1) return;

    if (msg.kind === 'hello') {
      if (_devIgnoreNextHello) { _devIgnoreNextHello = false; return; }
      hostWindow = event.source;
      send('ready', {});
      return;
    }

    if (msg.kind === 'devFail') {
      if (msg.payload.kind === 'pageError') {
        setTimeout(function () { throw new Error('[dev] test page error'); }, 0);
      } else if (msg.payload.kind === 'treeQuery') {
        _devThrowNextTreeQuery = true;
      } else if (msg.payload.kind === 'handshake') {
        _devIgnoreNextHello = true;
      } else if (msg.payload.kind === 'clickHandler') {
        _devThrowNextClick = true;
      }
      return;
    }

    if (msg.kind === 'setMode') {
      mode = msg.payload.mode;
      if (mode === 'select') installSelectMode();
      else uninstallSelectMode();
      return;
    }

    if (msg.kind === 'subscribeRects') {
      var nextEids = msg.payload.eids;
      Object.keys(subscriptions).forEach(function (eid) {
        if (nextEids.indexOf(eid) === -1) unsubscribeEid(eid);
      });
      nextEids.forEach(function (eid) { subscribeEid(eid); });
      return;
    }

    if (msg.kind === 'unsubscribeRects') {
      msg.payload.eids.forEach(function (eid) { unsubscribeEid(eid); });
      return;
    }

    if (msg.kind === 'getRelatives') {
      var el = findByEid(msg.payload.eid);
      var result = {};
      if (el) {
        var parent = el.parentElement;
        if (parent && parent !== document.documentElement && parent !== document.body) {
          result.parent = { eid: computeEid(parent), rect: getRect(parent), name: getName(parent) };
        }
        var firstChild = el.children[0];
        if (firstChild) result.firstChild = { eid: computeEid(firstChild), rect: getRect(firstChild), name: getName(firstChild) };
        var prev = el.previousElementSibling;
        if (prev) result.prevSibling = { eid: computeEid(prev), rect: getRect(prev), name: getName(prev) };
        var next = el.nextElementSibling;
        if (next) result.nextSibling = { eid: computeEid(next), rect: getRect(next), name: getName(next) };
        if (parent && parent !== document.documentElement) {
          var parentKids = parent.children;
          if (parentKids.length > 0) {
            result.firstSibling = { eid: computeEid(parentKids[0]), rect: getRect(parentKids[0]), name: getName(parentKids[0]) };
            result.lastSibling = { eid: computeEid(parentKids[parentKids.length - 1]), rect: getRect(parentKids[parentKids.length - 1]), name: getName(parentKids[parentKids.length - 1]) };
          }
        }
      }
      send('response', { to: msg.id, ok: true, data: result });
      return;
    }

    if (msg.kind === 'getChildren') {
      if (_devThrowNextTreeQuery) {
        _devThrowNextTreeQuery = false;
        send('response', { to: msg.id, ok: false, error: '[dev] tree query failure' });
        return;
      }
      var parentEl = msg.payload.eid === 'body' ? document.body : findByEid(msg.payload.eid);
      var children = [];
      if (parentEl) {
        var kids = parentEl.children;
        for (var i = 0; i < kids.length; i++) {
          var child = kids[i];
          children.push({
            eid: computeEid(child),
            name: getName(child),
            tag: child.tagName.toLowerCase(),
            hasChildren: child.children.length > 0,
          });
        }
      }
      send('response', { to: msg.id, ok: true, data: { children: children } });
      return;
    }

    if (msg.kind === 'getAncestors') {
      var el = findByEid(msg.payload.eid);
      var ancestors = [];
      if (el) {
        var cur = el.parentElement;
        while (cur && cur !== document.body && cur !== document.documentElement) {
          ancestors.unshift({
            eid: computeEid(cur),
            name: getName(cur),
            tag: cur.tagName.toLowerCase(),
            hasChildren: true,
          });
          cur = cur.parentElement;
        }
      }
      send('response', { to: msg.id, ok: true, data: { ancestors: ancestors } });
      return;
    }

    if (msg.kind === 'search') {
      var query = (msg.payload.query || '').toLowerCase();
      var results = [];
      if (query && document.body) {
        var allEls = document.body.querySelectorAll('*');
        for (var i = 0; i < allEls.length && results.length < 100; i++) {
          var el = allEls[i];
          var name = getName(el);
          var tag = el.tagName.toLowerCase();
          if (!name.toLowerCase().includes(query) && !tag.includes(query)) continue;
          var eid = computeEid(el);
          var ancestorChain = [];
          var cur = el.parentElement;
          while (cur && cur !== document.body && cur !== document.documentElement) {
            ancestorChain.unshift({ eid: computeEid(cur), name: getName(cur) });
            cur = cur.parentElement;
          }
          results.push({ eid: eid, name: name, tag: tag, ancestorChain: ancestorChain });
        }
      }
      send('response', { to: msg.id, ok: true, data: { results: results } });
      return;
    }

    if (msg.kind === 'getLive') {
      var newEids = msg.payload.eids;
      Object.keys(liveSubscriptions).forEach(function (eid) {
        if (newEids.indexOf(eid) === -1) teardownLiveSub(eid);
      });
      newEids.forEach(function (eid) {
        if (liveSubscriptions[eid]) return;
        var el = findByEid(eid);
        if (!el) return;
        var sub = {};
        var ro = new ResizeObserver(function () { queueLiveUpdate(eid, el); });
        ro.observe(el);
        sub.ro = ro;
        var mo = new MutationObserver(function () { queueLiveUpdate(eid, el); });
        mo.observe(el, { attributes: true, characterData: true, childList: true, subtree: true });
        sub.mo = mo;
        liveSubscriptions[eid] = sub;
        send('live', getLiveData(eid, el));
      });
      return;
    }

    if (msg.kind === 'scrollIntoView') {
      var el = findByEid(msg.payload.eid);
      if (el) el.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      return;
    }
  });

  window.addEventListener(
    'wheel',
    function (event) {
      if ((!event.ctrlKey && !event.metaKey) || !hostWindow) return;
      event.preventDefault();
      send('wheel', { deltaY: event.deltaY, clientX: event.clientX, clientY: event.clientY, ctrlKey: true });
    },
    { passive: false }
  );
})();
