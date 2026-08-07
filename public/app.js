'use strict';
(() => {
  const i18n = window.I18N;
  i18n.applyStatic();

  // xterm UMD globals
  const XTermCtor = window.Terminal.Terminal || window.Terminal;
  const FitCtor = window.FitAddon.FitAddon;
  const LinksCtor = window.WebLinksAddon.WebLinksAddon;
  const U11Ctor = window.Unicode11Addon && window.Unicode11Addon.Unicode11Addon;
  const WebglCtor = window.WebglAddon && window.WebglAddon.WebglAddon;

  // ---- terminal themes
  const THEME = {
    background: '#181818',
    foreground: '#cccccc',
    cursor: '#cccccc',
    cursorAccent: '#181818',
    selectionBackground: '#264f78',
    selectionInactiveBackground: '#3a3d41',
    black: '#000000', red: '#cd3131', green: '#0dbc79', yellow: '#e5e510',
    blue: '#2472c8', magenta: '#bc3fbc', cyan: '#11a8cd', white: '#e5e5e5',
    brightBlack: '#666666', brightRed: '#f14c4c', brightGreen: '#23d18b',
    brightYellow: '#f5f543', brightBlue: '#3b8eea', brightMagenta: '#d670d6',
    brightCyan: '#29b8db', brightWhite: '#e5e5e5',
  };
  const LIGHT_THEME = {
    background: '#f7f7f7',
    foreground: '#1f1f1f',
    cursor: '#1f1f1f',
    cursorAccent: '#f7f7f7',
    selectionBackground: '#add6ff',
    selectionInactiveBackground: '#d9e9f7',
    black: '#000000', red: '#cd3131', green: '#008000', yellow: '#795e00',
    blue: '#0451a5', magenta: '#a31515', cyan: '#007f7f', white: '#666666',
    brightBlack: '#666666', brightRed: '#cd3131', brightGreen: '#008000',
    brightYellow: '#795e00', brightBlue: '#0451a5', brightMagenta: '#a31515',
    brightCyan: '#007f7f', brightWhite: '#333333',
  };

  // ---- device info
  const ua = navigator.userAgent;
  const isIPad = /iPad/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
  const devOS = /Windows/.test(ua) ? 'Windows'
    : /Android/.test(ua) ? 'Android'
    : /iPhone/.test(ua) ? 'iPhone'
    : isIPad ? 'iPad'
    : /Mac/.test(ua) ? 'Mac'
    : /Linux/.test(ua) ? 'Linux' : 'PC';
  const devBrowser = /Edg\//.test(ua) ? 'Edge'
    : /Chrome\//.test(ua) ? 'Chrome'
    : /Firefox\//.test(ua) ? 'Firefox'
    : /Safari\//.test(ua) ? 'Safari' : i18n.t('clip.browser');
  const isTouch = matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;
  // NOTE: many Windows PCs have touch-capable screens, so isTouch must never be
  // used to pick click semantics — use the layout breakpoint for that instead
  const mqMobile = matchMedia('(max-width: 760px)');
  const devKind = (/Android|iPhone|Mobile/.test(ua) || isIPad) ? 'mobile' : 'desktop';
  const devLabel = `${devOS} · ${devBrowser}`;
  const myKind = devKind; // wallpaper slot for this device class
  let themeMode = 'dark';
  try { if (localStorage.getItem('termbridge.theme') === 'light') themeMode = 'light'; } catch {}
  document.documentElement.classList.toggle('light', themeMode === 'light');
  const initialThemeMeta = document.querySelector('meta[name="theme-color"]');
  if (initialThemeMeta) initialThemeMeta.content = themeMode === 'light' ? '#f7f7f7' : '#181818';

  // ---- elements
  const $ = (id) => document.getElementById(id);
  const el = {
    app: $('app'), termHost: $('termHost'), termArea: $('termArea'), panelBackdrop: $('panelBackdrop'),
    tabStrip: $('tabStrip'),
    emptyState: $('emptyState'), emptyButtons: $('emptyButtons'),
    btnNew: $('btnNew'), btnPick: $('btnPick'), btnKill: $('btnKill'),
    keybar: $('keybar'), keyCtrl: $('keyCtrl'),
    remoteChip: $('remoteChip'), remoteLabel: $('remoteLabel'),
    connState: $('connState'), presence: $('presence'),
    menu: $('menu'), authOverlay: $('authOverlay'), authInput: $('authInput'),
    memoToggle: $('memoToggle'), memoPanel: $('memoPanel'),
    memoClose: $('memoClose'), memoText: $('memoText'), memoState: $('memoState'),
    fileToggle: $('fileToggle'), exPanel: $('exPanel'),
    exBtnBack: $('exBtnBack'), exBtnFwd: $('exBtnFwd'), exBtnUp: $('exBtnUp'),
    exAddr: $('exAddr'), exBtnRefresh: $('exBtnRefresh'), exBtnHidden: $('exBtnHidden'),
    exBtnNewDir: $('exBtnNewDir'), exBtnNewFile: $('exBtnNewFile'), exBtnClose: $('exBtnClose'),
    exList: $('exList'), exCount: $('exCount'), exMsg: $('exMsg'), exPins: $('exPins'),
    exCols: [...document.querySelectorAll('.ex-cols button')],
    setBtn: $('setBtn'), wpInput: $('wpInput'), toast: $('toast'),
    wpOpacityDialog: $('wpOpacityDialog'), wpOpacity: $('wpOpacity'),
    wpOpacityValue: $('wpOpacityValue'), wpOpacityCancel: $('wpOpacityCancel'),
    navTabs: $('navTabs'), navCount: $('navCount'),
    navFiles: $('navFiles'), navMemo: $('navMemo'), scrollBottom: $('scrollBottom'),
    mobWrap: $('mobWrap'), mobHist: $('mobHist'), mobLive: $('mobLive'),
    tabSheet: $('tabSheet'), sheetTabs: $('sheetTabs'), sheetShells: $('sheetShells'),
  };

  // ---- state
  const terms = new Map();
  let activeId = null;
  let ws = null;
  let wsOk = false;
  let retryMs = 1000;
  let shells = [];
  let defaultShell = null;
  let hostname = '';
  let pendingCreates = 0;
  let ctrlSticky = false;
  let appClip = ''; // in-app clipboard, synced across devices via the server
  let assetVer = null;
  let suppressTabClickUntil = 0;
  let dragActive = false;

  // ---------------------------------------------------------------- helpers

  function send(obj) {
    if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(obj));
  }

  function copyText(text) {
    appClip = text;
    send({ type: 'clip', text });
    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(text).catch(() => fallbackCopy(text));
    } else {
      fallbackCopy(text);
    }
  }

  // Reading the OS clipboard needs a secure context (https / localhost). The
  // Tailscale http URL has no such API at all — right click falls back to the
  // browser's own menu there (see armPasteCatcher).
  const clipboardApi = window.isSecureContext && navigator.clipboard && navigator.clipboard.readText
    ? navigator.clipboard
    : null;

  async function pasteToTerm(t) {
    if (!t) return false;
    let text = '';
    if (clipboardApi) {
      // The OS clipboard is the only source here: falling back to the shared
      // in-app clipboard would paste something older than what Ctrl+V gives.
      try {
        text = await clipboardApi.readText();
      } catch {
        showToast(BLOCKED_HINT());
        return false;
      }
      if (!text) {
        showToast(i18n.t('clip.empty'));
        return false;
      }
    } else {
      text = appClip;
      if (!text) {
        showToast(i18n.t('clip.http'));
        return false;
      }
    }
    t.xterm.paste(text);
    return true;
  }

  // 'unsupported' where the browser cannot report the state (Firefox): asking
  // there would pop its paste confirmation on an unrelated click.
  const clipPermState = () => (navigator.permissions
    ? navigator.permissions.query({ name: 'clipboard-read' }).then((p) => p.state).catch(() => 'unsupported')
    : Promise.resolve('unsupported'));

  const BLOCKED_HINT = () => i18n.t('clip.blocked');

  // The permission prompt only appears for a primary-button gesture — from a
  // right click the browser rejects silently, which is why no prompt ever
  // showed up. So it rides along with the first ordinary click on the terminal:
  // no button, no toast, and by the time the user right clicks the permission
  // is already settled.
  let clipPerm = 'unsupported';
  let clipPermAsked = false;

  if (clipboardApi) {
    clipPermState().then((state) => { clipPerm = state; });
    if (navigator.permissions) {
      navigator.permissions.query({ name: 'clipboard-read' })
        .then((p) => { p.onchange = () => { clipPerm = p.state; }; })
        .catch(() => {});
    }
    document.addEventListener('mousedown', (ev) => {
      if (clipPermAsked || ev.button !== 0 || clipPerm !== 'prompt') return;
      if (!el.termHost.contains(ev.target) && !el.mobWrap.contains(ev.target)) return;
      clipPermAsked = true;
      // called straight from the handler, so the gesture still counts
      clipboardApi.readText().then(() => { clipPerm = 'granted'; }).catch(() => {});
    }, true);
  }

  // Right-click paste goes through the browser's own paste command, exactly
  // like on any other site: no browser hands a page the OS clipboard without a
  // permission (and over plain http not at all), but its menu entry always
  // works. That entry needs an editable element under the pointer, and xterm's
  // textarea sits at z-index -5 where it never gets hit — so park an invisible
  // one there on the right button press.
  let pasteCatcher = null;

  function armPasteCatcher(ev) {
    if (!pasteCatcher) {
      pasteCatcher = document.createElement('textarea');
      pasteCatcher.id = 'pasteCatcher';
      pasteCatcher.setAttribute('aria-hidden', 'true');
      pasteCatcher.addEventListener('paste', (e) => {
        e.preventDefault();
        const text = e.clipboardData ? e.clipboardData.getData('text') : '';
        disarmPasteCatcher(true); // typing must land in the terminal again
        if (!text) return;
        appClip = text;
        send({ type: 'clip', text });
        const t = terms.get(activeId);
        if (t) t.xterm.paste(text);
      });
      document.body.appendChild(pasteCatcher);
      // A dismissed menu fires no event of its own, so the next thing the user
      // does hands the terminal its keyboard back.
      document.addEventListener('keydown', () => disarmPasteCatcher(true), true);
    }
    pasteCatcher.style.left = `${ev.clientX - 8}px`;
    pasteCatcher.style.top = `${ev.clientY - 8}px`;
    pasteCatcher.value = '';
    pasteCatcher.hidden = false;
    pasteCatcher.focus();
  }

  function disarmPasteCatcher(refocus) {
    if (!pasteCatcher || pasteCatcher.hidden) return;
    pasteCatcher.hidden = true;
    const t = terms.get(activeId);
    if (refocus && t) t.xterm.focus();
  }

  const catcherArmed = () => !!pasteCatcher && !pasteCatcher.hidden;

  document.addEventListener('mousedown', (ev) => {
    if (ev.button !== 2) {
      disarmPasteCatcher(true);
      return;
    }
    if (clipboardApi) return; // right click pastes directly, no menu needed
    const t = terms.get(activeId);
    if (!t) return;
    const inMirror = el.mobWrap.contains(ev.target);
    // touch keeps its long-press selection on the mirror, untouched
    if (inMirror ? isTouch : !el.termHost.contains(ev.target)) return;
    if (inMirror ? mobHasTextSelection() : t.xterm.hasSelection()) return; // that right click copies
    armPasteCatcher(ev);
  }, true);

  function fallbackCopy(text) {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.cssText = 'position:fixed;opacity:0';
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand('copy'); } catch {}
    ta.remove();
  }

  function shellIcon(shell) {
    const cls = shell === 'gitbash' ? 'shell-bash' : shell === 'cmd' ? 'shell-cmd' : 'shell-ps';
    return `<svg class="${cls}" viewBox="0 0 16 16" aria-hidden="true">` +
      `<rect x="1.5" y="2.5" width="13" height="11" rx="1.5" fill="none" stroke="currentColor" stroke-width="1.1"/>` +
      `<path d="M4.3 6.2 6.6 8.3 4.3 10.4M8.4 10.6h3.3" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
  }

  const closeIcon = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M4.5 4.5l7 7m0-7l-7 7" stroke="currentColor" stroke-width="1.1" stroke-linecap="round"/></svg>';
  const gripIcon = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M2.5 5h11M2.5 8h11M2.5 11h11" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/></svg>';
  const deskIcon = '<svg class="presence-icon" viewBox="0 0 16 16" aria-hidden="true"><rect x="1.5" y="3" width="13" height="8.5" rx="1" fill="none" stroke="currentColor" stroke-width="1.1"/><path d="M5.5 13.5h5" stroke="currentColor" stroke-width="1.1" stroke-linecap="round"/></svg>';
  const mobIcon = '<svg class="presence-icon" viewBox="0 0 16 16" aria-hidden="true"><rect x="4.5" y="1.5" width="7" height="13" rx="1.5" fill="none" stroke="currentColor" stroke-width="1.1"/><path d="M7 12.5h2" stroke="currentColor" stroke-width="1.1" stroke-linecap="round"/></svg>';

  // ---------------------------------------------------------------- terminals

  function addTerm(info, replay) {
    const container = document.createElement('div');
    container.className = 'term-container';
    el.termHost.appendChild(container);

    const xterm = new XTermCtor({
      allowProposedApi: true,
      allowTransparency: true,
      cursorBlink: false,
      cursorStyle: 'block',
      fontFamily: '"Cascadia Mono", "Cascadia Code", Consolas, Menlo, "Roboto Mono", monospace',
      fontSize: devKind === 'mobile' ? 13 : 14,
      scrollback: 5000,
      theme: themeNow(),
    });
    const fit = new FitCtor();
    xterm.loadAddon(fit);
    xterm.loadAddon(new LinksCtor());
    if (U11Ctor) {
      try { xterm.loadAddon(new U11Ctor()); xterm.unicode.activeVersion = '11'; } catch {}
    }
    xterm.open(container);
    if (WebglCtor && !isTouch) {
      try { xterm.loadAddon(new WebglCtor()); } catch {}
    }
    if (info.cols > 1 && info.rows > 1) xterm.resize(info.cols, info.rows);

    xterm.onData((d) => sendInput(info.id, d));
    xterm.onScroll(() => { if (info.id === activeId) updateScrollPill(); });
    xterm.attachCustomKeyEventHandler((ev) => {
      if (ev.type !== 'keydown') return true;
      if (ev.ctrlKey && ev.shiftKey && ev.code === 'Backquote') return false; // global: new terminal
      const key = ev.key.toLowerCase();
      if (ev.ctrlKey && !ev.altKey && key === 'c' && xterm.hasSelection()) {
        copyText(xterm.getSelection());
        xterm.clearSelection();
        return false;
      }
      // Ctrl+V / Cmd+V: left to xterm this sends ^V to the shell and cancels
      // the event, which is exactly what stops the browser from pasting.
      // Returning false keeps xterm's hands off it — the browser pastes into
      // xterm's textarea, and xterm forwards that paste to the pty.
      if ((ev.ctrlKey || ev.metaKey) && !ev.altKey && key === 'v') return false;
      return true;
    });

    const t = { id: info.id, name: info.name, shell: info.shell, custom: !!info.custom, autoTitle: '', xterm, fit, container };
    // Windows Terminal-style right click: copy the selection if there is one, else paste
    container.addEventListener('contextmenu', (ev) => {
      if (xterm.hasSelection()) {
        ev.preventDefault();
        copyText(xterm.getSelection());
        xterm.clearSelection();
        return;
      }
      if (clipboardApi) {
        ev.preventDefault();
        pasteToTerm(t);
        return;
      }
      // no API to read with: the browser's own menu is the paste path, and
      // xterm grabs focus for its textarea on this event, so take it back
      if (catcherArmed()) pasteCatcher.focus();
    });
    // cmd/PowerShell push the running command as the window title (OSC),
    // which ConPTY forwards — mirror it on the tab like Windows Terminal
    xterm.onTitleChange((title) => {
      title = title.trim();
      if (title !== t.autoTitle) {
        t.autoTitle = title;
        renderTabs();
      }
    });
    terms.set(info.id, t);
    if (replay && replay.length) replayInto(t, replay, info);
    return t;
  }

  /** Restore saved output into a fresh terminal. Each segment carries the size
      the pty had while it was produced, and has to be written at that size:
      ConPTY repaints the entire screen after a resize, and such a repaint only
      overwrites the old screen when the terminal is as tall as it was then.
      Replaying the whole log at one fixed size scrolls those repaints into the
      scrollback instead — the duplicated screens and blank padding that showed
      up on the phone, whose terminal follows the PC's size. */
  function replayInto(t, segments, info) {
    let i = 0;
    // xterm parses written data asynchronously, so each step has to wait for
    // its callback before resizing — and the mobile text mirror can only be
    // rebuilt once the last segment has been parsed, otherwise a PWA reload
    // shows just the cursor until new terminal output arrives.
    const step = () => {
      if (terms.get(info.id) !== t) return; // closed mid-replay
      if (i >= segments.length) {
        if (info.cols > 1 && info.rows > 1) t.xterm.resize(info.cols, info.rows);
        if (info.id === activeId && mobActive()) mobRefresh();
        return;
      }
      const seg = segments[i++];
      if (seg.cols > 1 && seg.rows > 1) t.xterm.resize(seg.cols, seg.rows);
      t.xterm.write(seg.data, step);
    };
    step();
  }

  function displayName(t) {
    if (t.custom) return t.name;
    if (t.autoTitle) {
      // "C:\Windows\System32\cmd.exe - ping ..." -> "cmd.exe - ping ..."
      return t.autoTitle.replace(/^[A-Za-z]:\\[^ ]*\\([^\\ ]+)/, '$1');
    }
    return t.name;
  }

  function removeTerm(id) {
    const t = terms.get(id);
    if (!t) return;
    terms.delete(id);
    try { t.xterm.dispose(); } catch {}
    t.container.remove();
    if (activeId === id) {
      activeId = null;
      const rest = [...terms.keys()];
      if (rest.length) activate(rest[rest.length - 1]);
      else mobRefresh();
    }
    refreshUi();
  }

  function activate(id, opts = {}) {
    if (!terms.has(id)) return;
    if (activeId && activeId !== id && terms.has(activeId)) {
      terms.get(activeId).container.classList.remove('active');
      send({ type: 'unview', id: activeId });
    }
    activeId = id;
    const t = terms.get(id);
    t.container.classList.add('active');
    refreshUi();
    fitActive();
    mobRefresh();
    // fitActive ran before the mirror existed, so on a phone it could not
    // measure and fell back to not sizing the terminal at all. Re-fit now that
    // there is something to measure.
    if (mobActive()) fitActiveSoon();
    if (opts.focus) t.xterm.focus();
  }

  function updateScrollPill() {
    const t = terms.get(activeId);
    if (!t) {
      el.scrollBottom.hidden = true;
      return;
    }
    if (mobActive()) {
      el.scrollBottom.hidden = mobFollowing;
      return;
    }
    const b = t.xterm.buffer.active;
    el.scrollBottom.hidden = b.viewportY >= b.baseY;
  }

  let peers = []; // everyone currently connected, from the presence message
  let fitTimer = null;
  function fitActiveSoon() {
    clearTimeout(fitTimer);
    fitTimer = setTimeout(fitActive, 60);
  }

  // How many characters the phone mirror can actually show. The hidden xterm
  // cannot be measured while the mirror is up, so measure the mirror's own font
  // instead of trusting the fit addon's fallback.
  function mobProposeDimensions() {
    if (el.mobWrap.hidden) return null;
    const probe = document.createElement('span');
    probe.textContent = '0'.repeat(40);
    probe.style.cssText = 'position:absolute;visibility:hidden;white-space:pre';
    el.mobLive.appendChild(probe);
    const box = probe.getBoundingClientRect();
    probe.remove();
    const cw = box.width / 40;
    const lh = box.height;
    if (!cw || !lh || !isFinite(cw) || !isFinite(lh)) return null;
    // clientWidth/Height include the wrapper's padding, and that padding is
    // wide enough (and the bottom one tall enough, to clear the key bar) to
    // overshoot by several columns if it is counted as usable space.
    const cs = getComputedStyle(el.mobWrap);
    const padX = parseFloat(cs.paddingLeft) + parseFloat(cs.paddingRight);
    const padY = parseFloat(cs.paddingTop) + parseFloat(cs.paddingBottom);
    return {
      cols: Math.max(20, Math.floor((el.mobWrap.clientWidth - padX) / cw)),
      rows: Math.max(6, Math.floor((el.mobWrap.clientHeight - padY) / lh)),
    };
  }

  function fitActive() {
    // self-heal the layout-mode mismatch (media-query change events can lag)
    if (!mobActive() && !el.mobWrap.hidden) mobRefresh();
    else if (mobActive() && el.mobWrap.hidden && terms.size) mobRefresh();
    const t = terms.get(activeId);
    if (!t) return;
    // The phone mirror wraps text with CSS and renders any pty width, so while
    // a PC is also watching, the phone stays out of the way and the PC keeps
    // its full columns. Alone, though, staying out of the way leaves the pty at
    // its default 80 and a full-screen TUI — claude, vim, htop — gets soft
    // wrapped mid-word into nonsense. So when nothing wider is attached, the
    // phone sizes the terminal to what it can actually display.
    if (mobActive()) {
      const d = peers.some((c) => c.kind !== 'mobile') ? null : mobProposeDimensions();
      if (!d) {
        send({ type: 'unview', id: t.id });
        return;
      }
      send({ type: 'resize', id: t.id, cols: d.cols, rows: d.rows });
      return;
    }
    const d = t.fit.proposeDimensions();
    if (!d || !isFinite(d.cols) || !isFinite(d.rows) || d.cols < 2 || d.rows < 2) return;
    if (d.cols !== t.xterm.cols || d.rows !== t.xterm.rows) t.xterm.resize(d.cols, d.rows);
    send({ type: 'resize', id: t.id, cols: d.cols, rows: d.rows });
  }

  function sendInput(id, data) {
    if (ctrlSticky && data.length === 1) {
      const c = data.toUpperCase().charCodeAt(0);
      if (c >= 64 && c <= 95) data = String.fromCharCode(c & 31);
      setCtrlSticky(false);
    }
    if (mobActive() && !mobFollowing) {
      mobFollowing = true; // typing implies returning to the live edge
      el.mobWrap.scrollTop = el.mobWrap.scrollHeight;
    }
    send({ type: 'input', id, data });
  }

  function teardownAll() {
    for (const t of terms.values()) {
      try { t.xterm.dispose(); } catch {}
      t.container.remove();
    }
    terms.clear();
    activeId = null;
  }

  // ---------------------------------------------------------------- ui rendering

  function refreshUi() {
    renderTabs();
    el.emptyState.hidden = terms.size > 0;
  }

  /** Reorder a tab by dragging it. `handle` is what starts the drag — the chip
      itself on the desktop strip, the ≡ grip in the mobile sheet — and `axis`
      picks which edge midpoints decide where the tab lands. */
  function attachReorder(item, handle, axis) {
    handle.addEventListener('pointerdown', (ev) => {
      if (ev.button > 0) return;
      // the strip scrolls horizontally on touch, so leave touch panning alone
      // there; the sheet grip exists precisely to be dragged by a finger
      if (handle === item && ev.pointerType !== 'mouse') return;
      const list = item.parentElement;
      const from = axis === 'x' ? ev.clientX : ev.clientY;
      const edge = axis === 'x' ? 'left' : 'top';
      const span = axis === 'x' ? 'width' : 'height';
      const shift = (d) => (axis === 'x' ? `translateX(${d}px)` : `translateY(${d}px)`);
      let dragging = false;
      /** untransformed positions of every tab, refreshed whenever they move */
      let slots = [];
      let home = 0; // where the dragged tab's own slot sat when the drag began

      const measure = () => {
        slots = [...list.children].map((k) => {
          const r = k.getBoundingClientRect();
          return { el: k, start: r[edge], mid: r[edge] + r[span] / 2 };
        });
      };
      const slotOf = (k) => slots.find((s) => s.el === k).start;

      /** Move the dragged tab and slide the others into their new places. The
          rects are read while every transform is cleared, so hit testing and
          the animation both work off the real layout rather than off tabs that
          are still mid-slide. */
      const reorderTo = (before) => {
        const others = [...list.children].filter((k) => k !== item);
        const was = others.map((k) => k.getBoundingClientRect()[edge]);
        for (const k of list.children) {
          k.style.transition = 'none';
          k.style.transform = '';
        }
        list.insertBefore(item, before);
        measure();
        others.forEach((k, i) => {
          const d = was[i] - slotOf(k);
          if (d) k.style.transform = shift(d);
        });
        void list.offsetWidth; // flush the untransitioned start of the slide
        for (const k of others) {
          k.style.transition = '';
          k.style.transform = '';
        }
      };

      const move = (e) => {
        const at = axis === 'x' ? e.clientX : e.clientY;
        if (!dragging) {
          if (Math.abs(at - from) < (handle === item ? 6 : 3)) return;
          dragging = true;
          dragActive = true;
          item.classList.add('dragging');
          measure();
          home = slotOf(item);
        }
        e.preventDefault();
        const before = slots.find((s) => s.el !== item && at < s.mid)?.el || null;
        if (before !== item.nextElementSibling) reorderTo(before);
        // the tab stays under the pointer, offset by however far its own slot
        // has travelled while the others made room
        item.style.transform = shift(at - from - (slotOf(item) - home));
      };

      const stop = () => {
        removeEventListener('pointermove', move);
        removeEventListener('pointerup', stop);
        removeEventListener('pointercancel', stop);
        if (!dragging) return;
        dragActive = false;
        item.classList.remove('dragging');
        item.style.transition = '';
        item.style.transform = ''; // settles into its new slot
        // the pointerup lands on a tab that has moved under the finger, so the
        // click it produces must not activate whatever ended up there
        suppressTabClickUntil = Date.now() + 250;
        const ids = [...list.children].map((c) => c.dataset.id);
        setOrder(ids); // keep terms in step so the server's echo is a no-op
        send({ type: 'reorder', ids });
        // only the dragged list moved; redraw both once the tabs have settled,
        // so the other one (the strip or the sheet) picks the new order up too
        setTimeout(() => { if (!dragActive) renderTabs(); }, 220);
      };

      // tracked on the window rather than the handle: the pointer leaves the
      // handle as soon as the tab starts moving out from under it
      addEventListener('pointermove', move);
      addEventListener('pointerup', stop);
      addEventListener('pointercancel', stop);
    });
  }

  function setOrder(ids) {
    const next = new Map();
    for (const id of ids) if (terms.has(id)) next.set(id, terms.get(id));
    for (const [id, t] of terms) next.set(id, t);
    terms.clear();
    for (const [id, t] of next) terms.set(id, t);
  }

  /** Apply a tab order announced by the server. The device that did the drag
      already holds this order, and re-rendering there would cut the tabs'
      settling animation short, so an unchanged order is left alone. */
  function applyOrder(ids) {
    const cur = [...terms.keys()];
    if (ids.length === cur.length && ids.every((id, i) => cur[i] === id)) return;
    setOrder(ids);
    refreshUi();
  }

  function renderTabs() {
    el.tabStrip.textContent = '';

    for (const t of terms.values()) {
      const chip = document.createElement('div');
      chip.className = 'strip-tab' + (t.id === activeId ? ' active' : '');
      chip.dataset.id = t.id;
      chip.setAttribute('role', 'tab');
      chip.setAttribute('aria-selected', t.id === activeId ? 'true' : 'false');
      chip.tabIndex = 0;
      chip.innerHTML = shellIcon(t.shell);
      chip.title = t.autoTitle || t.name;
      const label = document.createElement('span');
      label.className = 'tab-label';
      label.textContent = displayName(t);
      chip.appendChild(label);
      const close = document.createElement('button');
      close.className = 'strip-close';
      close.title = i18n.t('hdr.kill');
      close.innerHTML = closeIcon;
      chip.appendChild(close);
      chip.addEventListener('click', () => {
        if (Date.now() < suppressTabClickUntil) return;
        activate(t.id, { focus: true });
      });
      chip.addEventListener('dblclick', (e) => { e.preventDefault(); startRename(t, label); });
      chip.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); activate(t.id, { focus: true }); }
      });
      close.addEventListener('click', (e) => { e.stopPropagation(); send({ type: 'kill', id: t.id }); });
      el.tabStrip.appendChild(chip);
      attachReorder(chip, chip, 'x');
    }
    el.navCount.textContent = String(terms.size);
    el.navCount.dataset.zero = terms.size ? '' : '1';
    if (!el.tabSheet.hidden) renderSheet();
  }

  function escapeHtml(s) {
    return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  function startRename(t, labelEl) {
    const input = document.createElement('input');
    input.className = 'tab-rename';
    input.value = t.name;
    labelEl.replaceWith(input);
    input.focus();
    input.select();
    let done = false;
    const commit = () => {
      if (done) return;
      done = true;
      const name = input.value.trim();
      if (name && name !== t.name) send({ type: 'rename', id: t.id, name });
      renderTabs();
    };
    input.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'Enter') commit();
      if (e.key === 'Escape') { done = true; renderTabs(); }
    });
    input.addEventListener('blur', commit);
    input.addEventListener('click', (e) => e.stopPropagation());
  }

  function renderPresence(list) {
    // Kept so the phone can tell whether a PC is also watching: that decides
    // whether it may size the terminal to itself. Re-fit when it changes, so
    // the last PC leaving hands the columns back to the phone.
    const hadDesktop = peers.some((c) => c.kind !== 'mobile');
    peers = list;
    if (mobActive() && hadDesktop !== list.some((c) => c.kind !== 'mobile')) fitActiveSoon();
    const icons = list.map((c) => (c.kind === 'mobile' ? mobIcon : deskIcon)).join('');
    el.presence.innerHTML =
      `<span class="presence-full">${icons}<span>${i18n.t('presence.full', { n: list.length })}</span></span>` +
      `<span class="presence-mini">${icons}<span>${i18n.t('presence.mini', { n: list.length })}</span></span>`;
    el.presence.title = list.map((c) => c.label).join('\n');
  }

  function renderEmptyButtons() {
    el.emptyButtons.textContent = '';
    for (const s of shells) {
      const b = document.createElement('button');
      b.className = 'vs-button' + (s.key === defaultShell ? '' : ' secondary');
      b.textContent = s.label;
      b.addEventListener('click', () => createTerm(s.key));
      el.emptyButtons.appendChild(b);
    }
  }

  // Remembered so switching language can redraw whatever state we are actually in.
  let lastConn = { state: 'connecting', key: 'status.connecting', text: null };

  function setConn(state, { key = null, text = null }) {
    lastConn = { state, key, text };
    el.remoteChip.classList.toggle('connecting', state === 'connecting');
    el.remoteChip.classList.toggle('offline', state === 'offline');
    el.remoteLabel.textContent = key ? i18n.t(key) : text;
  }

  // ---------------------------------------------------------------- menu

  function showMenuItems(items, pos) {
    el.menu.textContent = '';
    for (const it of items) {
      const item = document.createElement('button');
      item.className = 'menu-item';
      item.innerHTML = (it.icon || '') + `<span>${escapeHtml(it.label)}</span>`;
      item.addEventListener('click', () => { hideMenu(); it.action(); });
      el.menu.appendChild(item);
    }
    el.menu.hidden = false;
    const mw = el.menu.offsetWidth;
    const mh = el.menu.offsetHeight;
    let x = pos.x;
    let y = pos.y;
    if (pos.anchor) {
      const r = pos.anchor.getBoundingClientRect();
      x = r.right - mw;
      y = r.bottom + 4;
    }
    el.menu.style.left = Math.max(8, Math.min(x, innerWidth - mw - 8)) + 'px';
    el.menu.style.top = Math.max(8, Math.min(y, innerHeight - mh - 8)) + 'px';
  }

  function showShellMenu(anchor) {
    showMenuItems(
      shells.map((s) => ({ icon: shellIcon(s.key), label: s.label, action: () => createTerm(s.key) })),
      { anchor }
    );
  }

  function hideMenu() { el.menu.hidden = true; }

  document.addEventListener('pointerdown', (e) => {
    if (!el.menu.hidden && !el.menu.contains(e.target) && e.target !== el.btnPick) hideMenu();
  });

  // ---------------------------------------------------------------- actions

  function createTerm(shellKey) {
    pendingCreates++;
    send({ type: 'create', shell: shellKey || defaultShell });
  }

  el.btnNew.addEventListener('click', () => createTerm(defaultShell));
  el.btnPick.addEventListener('click', (e) => {
    if (el.menu.hidden) showShellMenu(e.currentTarget); else hideMenu();
  });
  el.btnKill.addEventListener('click', () => {
    if (activeId) send({ type: 'kill', id: activeId });
  });

  window.addEventListener('keydown', (e) => {
    if (e.ctrlKey && e.shiftKey && e.code === 'Backquote') {
      e.preventDefault();
      createTerm(defaultShell);
    }
  });

  // ---------------------------------------------------------------- key bar (touch)

  if (isTouch) {
    el.keybar.hidden = false;
    for (const b of el.keybar.querySelectorAll('button[data-seq]')) {
      b.addEventListener('pointerdown', (e) => e.preventDefault()); // keep terminal focus
      b.addEventListener('click', () => {
        if (activeId) sendInput(activeId, b.dataset.seq);
      });
    }
    el.keyCtrl.addEventListener('pointerdown', (e) => e.preventDefault());
    el.keyCtrl.addEventListener('click', () => setCtrlSticky(!ctrlSticky));
    const kp = $('keyPaste');
    kp.addEventListener('pointerdown', (e) => e.preventDefault());
    kp.addEventListener('click', () => pasteToTerm(terms.get(activeId)));
    const kk = $('keyKb');
    kk.addEventListener('pointerdown', (e) => e.preventDefault());
    kk.addEventListener('click', () => {
      const t = terms.get(activeId);
      if (!t) return;
      if (document.activeElement === t.xterm.textarea) t.xterm.blur();
      else t.xterm.focus();
    });
  }

  el.scrollBottom.addEventListener('click', () => {
    if (mobActive()) {
      mobFollowing = true;
      el.mobWrap.scrollTop = el.mobWrap.scrollHeight;
      updateScrollPill();
      return;
    }
    const t = terms.get(activeId);
    if (t) t.xterm.scrollToBottom();
  });

  // ---------------------------------------------------------------- mobile live terminal view
  // On the narrow layout the terminal is mirrored into #mobWrap as real text:
  // scrollback (append-only) + live screen, updated as output arrives.
  // Scrolling is the browser's own. xterm runs invisibly for state + input.

  let mobFollowing = true;
  let mobSyncQueued = false;
  let mobSyncDeferred = false;
  let mobTouchStart = null;
  let mobSuppressFocusUntil = 0;

  const mobActive = () => mqMobile.matches;
  const lineText = (l) => (l ? l.translateToString(true) : '');

  function mobHasTextSelection() {
    const s = window.getSelection();
    if (!s || s.isCollapsed || !s.rangeCount) return false;
    return el.mobWrap.contains(s.anchorNode) || el.mobWrap.contains(s.focusNode);
  }

  // ---- colored HTML from buffer cells (fg + bold; same palette as xterm)
  const PAL16 = [
    THEME.black, THEME.red, THEME.green, THEME.yellow,
    THEME.blue, THEME.magenta, THEME.cyan, THEME.white,
    THEME.brightBlack, THEME.brightRed, THEME.brightGreen, THEME.brightYellow,
    THEME.brightBlue, THEME.brightMagenta, THEME.brightCyan, THEME.brightWhite,
  ];

  function color256(n) {
    if (n < 16) return PAL16[n];
    if (n < 232) {
      n -= 16;
      const v = [0, 95, 135, 175, 215, 255];
      return `rgb(${v[(n / 36) | 0]},${v[((n / 6) | 0) % 6]},${v[n % 6]})`;
    }
    const c = 8 + (n - 232) * 10;
    return `rgb(${c},${c},${c})`;
  }

  function lineToHtml(line, cursorX = -1) {
    if (!line) return '';
    // trim trailing unstyled blanks so pre-wrap doesn't wrap on padding
    let last = line.length - 1;
    for (; last >= 0; last--) {
      const c = line.getCell(last);
      if (!c) continue;
      const ch = c.getChars();
      if ((ch === '' || ch === ' ') && c.isFgDefault()) continue;
      break;
    }
    // The terminal cursor can sit after typed spaces. Keep those otherwise
    // trailing blanks in the mirror so the caret remains in the same column.
    if (cursorX >= 0) last = Math.max(last, cursorX - 1);
    let html = '';
    let run = '';
    let cur = null;
    const flush = () => {
      if (!run) return;
      html += cur ? `<span style="${cur}">${escapeHtml(run)}</span>` : escapeHtml(run);
      run = '';
    };
    for (let x = 0; x <= last; x++) {
      if (x === cursorX) {
        flush();
        html += '<span class="mob-caret" aria-hidden="true"></span>';
      }
      const c = line.getCell(x);
      if (!c || c.getWidth() === 0) continue; // spacer cell of a wide char
      let style = null;
      if (!c.isFgDefault()) {
        const col = c.isFgRGB()
          ? '#' + c.getFgColor().toString(16).padStart(6, '0')
          : color256(c.getFgColor());
        if (col) style = 'color:' + col;
      }
      if (c.isBold()) style = (style ? style + ';' : '') + 'font-weight:bold';
      if (style !== cur) {
        flush();
        cur = style;
      }
      run += c.getChars() || ' ';
    }
    flush();
    // cursorX may be immediately after the last non-blank cell (the normal
    // prompt position), so add it after the loop as well.
    if (cursorX > last) html += '<span class="mob-caret" aria-hidden="true"></span>';
    return html;
  }

  function mobRenderLive(t) {
    const b = t.xterm.buffer.active;
    const parts = [];
    const end = Math.min(b.length, b.baseY + t.xterm.rows);
    const cursorLine = b.baseY + b.cursorY;
    for (let i = b.baseY; i < end; i++) {
      parts.push(lineToHtml(b.getLine(i), i === cursorLine ? b.cursorX : -1));
    }
    while (parts.length && parts[parts.length - 1] === '') parts.pop();
    el.mobLive.innerHTML = parts.join('\n');
  }

  function mobRebuild(t) {
    const b = t.xterm.buffer.active;
    const parts = [];
    for (let i = 0; i < b.baseY; i++) parts.push(lineToHtml(b.getLine(i)));
    el.mobHist.innerHTML = parts.join('\n');
    t.mobHistLen = b.baseY;
    t.mobFirstLine = lineText(b.getLine(0));
    mobRenderLive(t);
  }

  function mobSync() {
    mobSyncQueued = false;
    const t = terms.get(activeId);
    if (!t || !mobActive()) return;
    // Replacing a mirrored line while iOS owns a selection cancels the native
    // selection handles. Keep the rendered text stable until it is released.
    if (mobTouchStart || mobHasTextSelection()) {
      mobSyncDeferred = true;
      return;
    }
    mobSyncDeferred = false;
    const b = t.xterm.buffer.active;
    const first = lineText(b.getLine(0));
    // A shorter scrollback means lines were dropped — `cls` / `clear` send
    // CSI 3 J, which empties it outright. Comparing the first line alone
    // misses that whenever the new top line reads the same (a bare prompt
    // after an earlier cls), leaving the whole pre-cls history on screen.
    if (t.mobHistLen === undefined || b.baseY < t.mobHistLen || first !== t.mobFirstLine) {
      mobRebuild(t); // first render, cleared screen, or a saturated scrollback
    } else if (b.baseY > t.mobHistLen) {
      const parts = [];
      for (let i = t.mobHistLen; i < b.baseY; i++) parts.push(lineToHtml(b.getLine(i)));
      // Do not read innerHTML here: it copies the whole scrollback on every
      // append, which grows expensive during long-running mobile sessions.
      el.mobHist.insertAdjacentHTML('beforeend', (t.mobHistLen ? '\n' : '') + parts.join('\n'));
      t.mobHistLen = b.baseY;
      mobRenderLive(t);
    } else {
      mobRenderLive(t);
    }
    if (mobFollowing) el.mobWrap.scrollTop = el.mobWrap.scrollHeight;
    updateScrollPill();
  }

  function mobQueueSync() {
    if (mobSyncQueued) return;
    mobSyncQueued = true;
    // Echoed input arrives from the PTY asynchronously. Rendering it on the
    // next frame keeps the mirror responsive without redrawing each byte.
    requestAnimationFrame(mobSync);
  }

  function mobRefresh() {
    const t = terms.get(activeId);
    if (mobActive() && t) {
      el.mobWrap.hidden = false;
      mobFollowing = true;
      mobRebuild(t);
      el.mobWrap.scrollTop = el.mobWrap.scrollHeight;
    } else {
      el.mobWrap.hidden = true;
    }
    updateScrollPill();
  }

  el.mobWrap.addEventListener('scroll', () => {
    mobFollowing = el.mobWrap.scrollTop + el.mobWrap.clientHeight >= el.mobWrap.scrollHeight - 60;
    updateScrollPill();
  }, { passive: true });

  // Let iOS own long-press text selection. A long hold or a drag must never
  // fall through to the regular tap handler, which would otherwise focus the
  // hidden xterm and dismiss the selection handles by opening the keyboard.
  el.mobWrap.addEventListener('touchstart', (ev) => {
    const touch = ev.touches[0];
    if (!touch) return;
    mobTouchStart = { x: touch.clientX, y: touch.clientY, at: performance.now(), moved: false };
  }, { passive: true });
  el.mobWrap.addEventListener('touchmove', (ev) => {
    const touch = ev.touches[0];
    if (!touch || !mobTouchStart) return;
    if (Math.hypot(touch.clientX - mobTouchStart.x, touch.clientY - mobTouchStart.y) > 8) {
      mobTouchStart.moved = true;
      mobSuppressFocusUntil = performance.now() + 700;
    }
  }, { passive: true });
  const finishMobTouch = () => {
    if (!mobTouchStart) return;
    if (mobTouchStart.moved || performance.now() - mobTouchStart.at > 180) {
      mobSuppressFocusUntil = performance.now() + 700;
    }
    mobTouchStart = null;
    if (mobSyncDeferred && !mobHasTextSelection()) mobQueueSync();
  };
  el.mobWrap.addEventListener('touchend', finishMobTouch, { passive: true });
  el.mobWrap.addEventListener('touchcancel', finishMobTouch, { passive: true });

  function mobTapIsAtOrBelowCaret(ev) {
    const caret = el.mobWrap.querySelector('.mob-caret');
    if (!caret) return false;
    const rect = caret.getBoundingClientRect();
    // Output above the input cursor remains a reading/selection surface. Only
    // a tap on the cursor row or below it can intentionally summon the IME.
    return ev.clientY >= rect.top - 4;
  }

  el.mobWrap.addEventListener('click', (ev) => {
    if (performance.now() < mobSuppressFocusUntil || mobHasTextSelection()) return;
    if (!mobTapIsAtOrBelowCaret(ev)) return;
    const t = terms.get(activeId);
    if (t && mobActive()) t.xterm.focus();
  });

  // In the narrow layout the visible terminal is this mirror, not xterm, so it
  // gets the same right-click copy/paste. Touch keeps its long-press selection:
  // only a real mouse gets a context menu here.
  if (!isTouch) {
    el.mobWrap.addEventListener('contextmenu', (ev) => {
      if (mobHasTextSelection()) {
        ev.preventDefault();
        copyText(String(window.getSelection()));
        window.getSelection().removeAllRanges();
        return;
      }
      if (clipboardApi) {
        ev.preventDefault();
        pasteToTerm(terms.get(activeId));
      }
      // otherwise the browser's menu pastes into the catcher, as on xterm
    });
  }

  document.addEventListener('selectionchange', () => {
    if (mobSyncDeferred && !mobHasTextSelection()) mobQueueSync();
  });

  mqMobile.addEventListener('change', () => {
    mobRefresh();
    fitActiveSoon();
    syncMobilePanelBackdrop();
  });

  function setCtrlSticky(on) {
    ctrlSticky = on;
    el.keyCtrl.classList.toggle('on', on);
  }

  // The app is ALWAYS sized to the visual viewport on touch devices — that is
  // the ground truth of what is actually visible (iOS dvh / innerHeight lie in
  // standalone mode and leave dead space at the bottom). Keyboard open/close,
  // rotation and PWA quirks all reduce to "visualViewport changed".
  if (isTouch && window.visualViewport) {
    // iOS standalone can leave the whole WebView shrunken after the keyboard
    // closes (a dead black strip below the page that no CSS can paint over).
    // Detect it — no keyboard, yet the window is far short of the screen —
    // and jolt UIKit into re-laying-out by touching the viewport meta tag.
    let lastNudge = 0;
    let wallpaperHeight = 0;
    const nudgeWebView = () => {
      const now = Date.now();
      if (now - lastNudge < 3000) return;
      lastNudge = now;
      const mv = document.querySelector('meta[name=viewport]');
      const original = mv.getAttribute('content');
      mv.setAttribute('content', original + ', height=device-height');
      setTimeout(() => mv.setAttribute('content', original), 80);
      window.scrollTo(0, 0);
    };

    const applyViewport = () => {
      const keyboardClosed = window.innerHeight - visualViewport.height < 40;
      const expected = matchMedia('(orientation: portrait)').matches
        ? Math.max(screen.height, screen.width)
        : Math.min(screen.height, screen.width);
      // iOS can report a visual viewport that stops above a small, black
      // letterbox after the keyboard has closed.  Use the real screen height
      // for that case so the app (and its wallpaper) reaches the bottom.
      // Do not use documentElement.clientHeight here: we set it below to
      // cover the dead strip, so it would make this condition oscillate.
      const layoutHeight = window.innerHeight;
      const hasDeadBottom = keyboardClosed && expected - layoutHeight > 24;
      const visibleHeight = Math.round(hasDeadBottom ? expected : visualViewport.height);
      if (keyboardClosed) wallpaperHeight = visibleHeight;
      const targetH = visibleHeight + 'px';
      // The app still shrinks above the keyboard, while the root canvas keeps
      // the wallpaper at its original crop instead of re-sizing it.
      const canvasH = (wallpaperHeight || visibleHeight) + 'px';
      const targetT = visualViewport.offsetTop > 0.5
        ? `translateY(${visualViewport.offsetTop}px)` : '';
      const root = document.documentElement;
      // #app alone cannot paint into this iOS gap: its html/body ancestors
      // still end at the smaller visual viewport and clip their children.
      if (root.style.height !== canvasH || document.body.style.height !== canvasH
          || el.app.style.height !== targetH || el.app.style.transform !== targetT) {
        root.style.height = canvasH;
        document.body.style.height = canvasH;
        el.app.style.height = targetH;
        el.app.style.transform = targetT;
        fitActiveSoon();
      }
      if (window.scrollY || window.scrollX) window.scrollTo(0, 0);
      if (hasDeadBottom) nudgeWebView();
    };
    const applyLater = () => setTimeout(applyViewport, 250);
    visualViewport.addEventListener('resize', applyViewport);
    visualViewport.addEventListener('scroll', applyViewport);
    window.addEventListener('orientationchange', applyLater);
    window.addEventListener('focus', applyLater);
    document.addEventListener('visibilitychange', applyLater);
    document.addEventListener('focusout', () => setTimeout(applyViewport, 300));
    // watchdog: self-heal even when iOS swallows the events entirely
    setInterval(() => {
      if (!document.hidden) applyViewport();
    }, 1200);
    applyViewport();
  }

  // ---------------------------------------------------------------- resize observer

  new ResizeObserver(fitActiveSoon).observe(el.termArea);

  // ---------------------------------------------------------------- websocket

  function connect() {
    setConn('connecting', { key: 'status.connecting' });
    ws = new WebSocket((location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host + '/ws');
    ws.onopen = () => {
      send({
        type: 'hello',
        token: localStorage.getItem('termbridge.token') || '',
        label: devLabel,
        kind: devKind,
      });
    };
    ws.onmessage = (e) => {
      let msg;
      try { msg = JSON.parse(e.data); } catch { return; }
      handle(msg);
    };
    ws.onclose = (ev) => {
      wsOk = false;
      if (ev.code === 4001) { showAuth(); return; }
      setConn('offline', { key: 'status.reconnecting' });
      setTimeout(connect, retryMs);
      retryMs = Math.min(retryMs * 1.7, 10_000);
    };
  }

  function handle(msg) {
    switch (msg.type) {
      case 'init': {
        // the server's client assets changed (update deployed) -> pick them up
        if (assetVer !== null && msg.assetVer && msg.assetVer !== assetVer) {
          location.reload();
          return;
        }
        assetVer = msg.assetVer || null;
        wsOk = true;
        retryMs = 1000;
        el.authOverlay.hidden = true;
        hostname = msg.hostname;
        shells = msg.shells;
        defaultShell = msg.defaultShell;
        homeDir = msg.home || '';
        if (msg.clip) appClip = msg.clip;
        wallpaperV = msg.wallpaper || {};
        applyWallpaper();
        applyMemo(msg.memo || '');
        document.title = `${hostname} — TermBridge`;
        setConn('ok', { text: hostname });
        // Prefer the address other devices can actually open. The tailnet IP is
        // only reachable when someone has bound it explicitly via `host`.
        el.connState.textContent = msg.serveUrl
          ? msg.serveUrl.replace(/^https:\/\//, '')
          : location.host;
        renderEmptyButtons();
        renderPresence(msg.clients);

        const prevActive = activeId;
        teardownAll();
        for (const info of msg.terminals) addTerm(info, info.replay);
        refreshUi();
        if (terms.size) activate(terms.has(prevActive) ? prevActive : [...terms.keys()][0]);
        else mobRefresh();
        break;
      }
      case 'created': {
        addTerm(msg.term);
        if (pendingCreates > 0) {
          pendingCreates--;
          activate(msg.term.id, { focus: !isTouch });
        } else if (pendingActivate === msg.term.id) {
          pendingActivate = null;
          activate(msg.term.id, { focus: !isTouch });
        }
        refreshUi();
        break;
      }
      case 'output': {
        const t = terms.get(msg.id);
        if (t) {
          t.xterm.write(msg.data, () => {
            if (msg.id === activeId) {
              if (mobActive()) mobQueueSync();
              else updateScrollPill();
            }
          });
        }
        break;
      }
      case 'exit':
        removeTerm(msg.id);
        break;
      case 'renamed': {
        const t = terms.get(msg.id);
        if (t) { t.name = msg.name; t.custom = true; renderTabs(); }
        break;
      }
      case 'order':
        if (Array.isArray(msg.ids)) applyOrder(msg.ids);
        break;
      case 'memo':
        applyMemo(msg.content);
        break;
      case 'clip':
        appClip = msg.text || '';
        break;
      case 'wallpaper':
        wallpaperV = msg.wallpaper || {};
        applyWallpaper();
        break;
      case 'open-url':
        showToast(
          `${escapeHtml(msg.from || '')} → <a href="${escapeHtml(msg.url)}" target="_blank" rel="noopener">${escapeHtml(msg.url)}</a>`
        );
        break;
      case 'resize': {
        const t = terms.get(msg.id);
        if (t && (t.xterm.cols !== msg.cols || t.xterm.rows !== msg.rows)) {
          t.xterm.resize(msg.cols, msg.rows);
        }
        break;
      }
      case 'presence':
        renderPresence(msg.clients);
        break;
      case 'auth-error':
        showAuth();
        break;
    }
  }

  // ---------------------------------------------------------------- wallpaper

  let wallpaperV = { desktop: null, mobile: null };

  function wallpaperInfo(kind = myKind) {
    const value = wallpaperV[kind];
    // Accept the old number-only payload too, so a rolling server update does
    // not temporarily remove a wallpaper from an already open client.
    if (typeof value !== 'object' || value === null) return { v: value, opacity: 38 };
    const opacity = Number(value.opacity);
    return {
      v: value.v,
      opacity: Number.isFinite(opacity) ? Math.max(0, Math.min(100, Math.round(opacity))) : 38,
    };
  }

  function themeNow() {
    // fully transparent over a wallpaper — the darkening comes from ONE shared
    // overlay on <body>, so every region shows the image at the same level
    const base = themeMode === 'light' ? LIGHT_THEME : THEME;
    return { ...base, background: wallpaperInfo().v ? 'rgba(0, 0, 0, 0)' : base.background };
  }

  function applyWallpaper() {
    const { v, opacity } = wallpaperInfo();
    // The root canvas stays full-height while the mobile app shrinks above the
    // software keyboard, which keeps the wallpaper fixed in place.
    const root = document.documentElement;
    root.classList.toggle('wp', !!v);
    const shade = themeMode === 'light' ? '248, 248, 248' : '18, 18, 18';
    const image = v
      ? `linear-gradient(rgba(${shade}, ${(1 - opacity / 100).toFixed(2)}), rgba(${shade}, ${(1 - opacity / 100).toFixed(2)})), url("/wallpaper/${myKind}?v=${v}")`
      : '';
    root.style.backgroundImage = image;
    root.style.backgroundSize = 'cover';
    root.style.backgroundPosition = 'center';
    root.style.setProperty('--wallpaper-layer', image || 'none');
    el.app.style.backgroundImage = '';
    el.app.style.backgroundSize = '';
    el.app.style.backgroundPosition = '';
    for (const t of terms.values()) t.xterm.options.theme = themeNow();
  }

  function setThemeMode(mode) {
    themeMode = mode === 'light' ? 'light' : 'dark';
    const root = document.documentElement;
    root.classList.toggle('light', themeMode === 'light');
    try { localStorage.setItem('termbridge.theme', themeMode); } catch {}
    const themeMeta = document.querySelector('meta[name="theme-color"]');
    if (themeMeta) themeMeta.content = themeMode === 'light' ? '#f7f7f7' : '#181818';
    applyWallpaper();
  }

  el.setBtn.addEventListener('click', () => {
    const kindLabel = myKind === 'mobile' ? i18n.t('kind.mobile') : i18n.t('kind.pc');
    const items = [
      { label: i18n.t(themeMode === 'light' ? 'set.dark' : 'set.light'), action: () => setThemeMode(themeMode === 'light' ? 'dark' : 'light') },
      {
        label: `${i18n.t('lang.switch')}: ${i18n.name(i18n.lang)}`,
        action: () => showMenuItems(
          i18n.langs.map((l) => ({ label: i18n.name(l), action: () => i18n.setLang(l) })),
          { anchor: el.setBtn },
        ),
      },
      { label: i18n.t('set.wpSet', { kind: kindLabel }), action: () => el.wpInput.click() },
    ];
    const { v, opacity } = wallpaperInfo();
    if (v) {
      items.push({
        label: i18n.t('set.wpOpacity', { n: opacity }),
        action: () => {
          el.wpOpacity.value = String(opacity);
          el.wpOpacityValue.value = `${opacity}%`;
          el.wpOpacityValue.textContent = `${opacity}%`;
          el.wpOpacityDialog.hidden = false;
          el.wpOpacity.focus();
        },
      });
      items.push({
        label: i18n.t('set.wpRemove', { kind: kindLabel }),
        action: async () => {
          try { await fsApi('POST', '/api/wallpaper/delete', { kind: myKind }); }
          catch (e) { showToast(escapeHtml(e.message)); }
        },
      });
    }
    showMenuItems(items, { anchor: el.setBtn });
  });

  function closeWallpaperOpacityDialog() {
    el.wpOpacityDialog.hidden = true;
  }

  let wallpaperOpacityTimer = null;
  function applyWallpaperOpacity(opacity) {
    const current = wallpaperInfo();
    if (!current.v) return;
    wallpaperV = { ...wallpaperV, [myKind]: { v: current.v, opacity } };
    applyWallpaper();
  }

  function saveWallpaperOpacitySoon(opacity) {
    clearTimeout(wallpaperOpacityTimer);
    wallpaperOpacityTimer = setTimeout(async () => {
      try {
        await fsApi('POST', '/api/wallpaper/opacity', { kind: myKind, opacity });
      } catch (e) {
        showToast(escapeHtml(e.message));
      }
    }, 120);
  }

  el.wpOpacity.addEventListener('input', () => {
    const opacity = Number(el.wpOpacity.value);
    el.wpOpacityValue.value = `${opacity}%`;
    el.wpOpacityValue.textContent = `${opacity}%`;
    applyWallpaperOpacity(opacity);
    saveWallpaperOpacitySoon(opacity);
  });
  el.wpOpacityCancel.addEventListener('click', closeWallpaperOpacityDialog);
  el.wpOpacityDialog.addEventListener('pointerdown', (e) => {
    if (e.target === el.wpOpacityDialog) closeWallpaperOpacityDialog();
  });

  el.wpInput.addEventListener('change', async () => {
    const f = el.wpInput.files[0];
    el.wpInput.value = '';
    if (!f) return;
    try {
      const headers = { 'Content-Type': f.type || 'image/jpeg' };
      const tok = localStorage.getItem('termbridge.token');
      if (tok) headers['x-termbridge-token'] = tok;
      const r = await fetch('/api/wallpaper?kind=' + myKind, { method: 'POST', headers, body: f });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error ? i18n.t(j.error) : 'HTTP ' + r.status);
      showToast(i18n.t('wp.done'));
    } catch (e) {
      showToast(i18n.t('wp.fail') + escapeHtml(e.message));
    }
  });

  // ---------------------------------------------------------------- toast

  let toastTimer = null;
  function showToast(html) {
    el.toast.innerHTML = html;
    el.toast.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { el.toast.hidden = true; }, 8000);
  }

  // ---------------------------------------------------------------- mobile nav + tab sheet

  function renderSheet() {
    el.sheetTabs.textContent = '';
    if (!terms.size) {
      const d = document.createElement('div');
      d.className = 'sheet-empty';
      d.textContent = i18n.t('msg.noTerm');
      el.sheetTabs.appendChild(d);
    }
    for (const t of terms.values()) {
      const row = document.createElement('div');
      row.className = 'sheet-row' + (t.id === activeId ? ' active' : '');
      row.dataset.id = t.id;
      row.setAttribute('role', 'button');
      row.innerHTML = shellIcon(t.shell);
      const nm = document.createElement('span');
      nm.className = 'sheet-name';
      nm.textContent = displayName(t);
      row.appendChild(nm);
      const cl = document.createElement('button');
      cl.className = 'sheet-close';
      cl.title = i18n.t('hdr.kill');
      cl.innerHTML = closeIcon;
      row.appendChild(cl);
      const grip = document.createElement('button');
      grip.className = 'sheet-move';
      grip.title = i18n.t('ex.dragOrder');
      grip.setAttribute('aria-label', i18n.t('ex.dragOrder'));
      grip.innerHTML = gripIcon;
      row.appendChild(grip);
      row.addEventListener('click', () => {
        if (Date.now() < suppressTabClickUntil) return;
        activate(t.id, { focus: !mqMobile.matches });
        closeSheet();
      });
      cl.addEventListener('click', (ev) => { ev.stopPropagation(); send({ type: 'kill', id: t.id }); });
      grip.addEventListener('click', (ev) => ev.stopPropagation());
      el.sheetTabs.appendChild(row);
      attachReorder(row, grip, 'y');
    }
    el.sheetShells.textContent = '';
    for (const s of shells) {
      const row = document.createElement('div');
      row.className = 'sheet-row';
      row.setAttribute('role', 'button');
      row.innerHTML = shellIcon(s.key);
      const nm = document.createElement('span');
      nm.className = 'sheet-name';
      nm.textContent = s.label;
      row.appendChild(nm);
      row.addEventListener('click', () => { createTerm(s.key); closeSheet(); });
      el.sheetShells.appendChild(row);
    }
  }

  function openSheet() {
    if (mqMobile.matches) {
      setExOpen(false);
      setMemoOpen(false);
    }
    renderSheet();
    el.tabSheet.hidden = false;
    el.navTabs.classList.add('on');
    syncMobilePanelBackdrop();
  }
  function closeSheet() {
    el.tabSheet.hidden = true;
    el.navTabs.classList.remove('on');
    syncMobilePanelBackdrop();
  }

  el.navTabs.addEventListener('click', () => {
    if (el.tabSheet.hidden) openSheet(); else closeSheet();
  });
  el.tabSheet.querySelector('.sheet-backdrop').addEventListener('click', closeSheet);
  el.navFiles.addEventListener('click', () => setExOpen(el.exPanel.hidden));
  el.navMemo.addEventListener('click', () => setMemoOpen(el.memoPanel.hidden));
  function syncMobilePanelBackdrop() {
    const open = !el.exPanel.hidden || !el.memoPanel.hidden || !el.tabSheet.hidden;
    el.panelBackdrop.hidden = !mqMobile.matches || !open;
  }

  // ---------------------------------------------------------------- explorer

  let homeDir = '';
  let exCur = null;    // current path; '' = drive list ("PC"); null = never loaded
  let exShowHidden = false;
  try { exShowHidden = localStorage.getItem('termbridge.showHidden') === '1'; } catch {}
  let exParent = null;
  let exEntries = [];
  let exSel = null;
  const exStack = { back: [], fwd: [] };
  let exSort = { key: 'name', asc: true };
  let exClip = null;   // { op: 'copy'|'cut', path, name }
  let pendingActivate = null;

  const exIcons = {
    folder: '<svg class="icon-folder" viewBox="0 0 16 16" aria-hidden="true"><path d="M1.5 4a1 1 0 0 1 1-1h3l1.5 2h6.5a1 1 0 0 1 1 1v6a1 1 0 0 1-1 1h-11a1 1 0 0 1-1-1z" fill="currentColor"/></svg>',
    drive: '<svg class="icon-drive" viewBox="0 0 16 16" aria-hidden="true"><rect x="1.5" y="5.5" width="13" height="5" rx="1" fill="none" stroke="currentColor" stroke-width="1.1"/><circle cx="12" cy="8" r="0.9" fill="currentColor"/></svg>',
    file: '<svg class="icon-file" viewBox="0 0 16 16" aria-hidden="true"><path d="M4 1.5h5.5L12.5 5v9.5h-8.5z" fill="none" stroke="currentColor" stroke-width="1.1" stroke-linejoin="round"/><path d="M9.5 1.5V5h3" fill="none" stroke="currentColor" stroke-width="1.1" stroke-linejoin="round"/></svg>',
    bat: '<svg class="icon-bat" viewBox="0 0 16 16" aria-hidden="true"><rect x="1.5" y="2.5" width="13" height="11" rx="1.5" fill="none" stroke="currentColor" stroke-width="1.1"/><path d="M4.3 6.2 6.6 8.3 4.3 10.4M8.4 10.6h3.3" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    lnk: '<svg class="icon-file" viewBox="0 0 16 16" aria-hidden="true"><path d="M4 1.5h5.5L12.5 5v9.5h-8.5z" fill="none" stroke="currentColor" stroke-width="1.1" stroke-linejoin="round"/><path d="M9.5 1.5V5h3" fill="none" stroke="currentColor" stroke-width="1.1" stroke-linejoin="round"/><path d="M5.2 12.3 8 9.5M8 9.5H5.9M8 9.5v2.1" stroke="#4fc1ff" stroke-width="1.2" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  };

  const isRunnable = (name) => /\.(bat|cmd)$/i.test(name);
  const isLnk = (name) => /\.lnk$/i.test(name);

  function exIconFor(e) {
    if (e.drive) return exIcons.drive;
    if (e.dir) return exIcons.folder;
    if (isRunnable(e.name)) return exIcons.bat;
    if (isLnk(e.name)) return exIcons.lnk;
    return exIcons.file;
  }

  function exTypeOf(e) {
    if (e.drive) return i18n.t('type.drive');
    if (e.dir) return i18n.t('type.folder');
    if (isLnk(e.name)) return i18n.t('type.shortcut');
    const i = e.name.lastIndexOf('.');
    return i > 0 ? i18n.t('type.ext', { ext: e.name.slice(i + 1).toUpperCase() }) : i18n.t('type.file');
  }

  function exJoin(dir, name) {
    if (dir === '') return name; // drive entries are already "C:\"
    return dir.endsWith('\\') ? dir + name : dir + '\\' + name;
  }

  function fmtSize(e) {
    return e.dir ? '' : Math.max(1, Math.ceil(e.size / 1024)).toLocaleString('ja-JP') + ' KB';
  }

  function fmtDate(ms) {
    if (!ms) return '';
    const d = new Date(ms);
    const p = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}/${p(d.getMonth() + 1)}/${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
  }

  async function fsApi(method, url, body) {
    const headers = {};
    const tok = localStorage.getItem('termbridge.token');
    if (tok) headers['x-termbridge-token'] = tok;
    headers['x-lang'] = i18n.lang;
    if (body) headers['Content-Type'] = 'application/json';
    const r = await fetch(url, { method, headers, body: body ? JSON.stringify(body) : undefined });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.error ? i18n.t(j.error) : 'HTTP ' + r.status);
    return j;
  }

  let exMsgTimer = null;
  function exShowMsg(text, isError) {
    el.exMsg.textContent = text || '';
    el.exMsg.classList.toggle('error', !!isError);
    clearTimeout(exMsgTimer);
    if (text) exMsgTimer = setTimeout(() => { el.exMsg.textContent = ''; }, 5000);
  }

  async function exLoad(p, opts = {}) {
    let data;
    try {
      data = await fsApi('GET', '/api/fs/list?path=' + encodeURIComponent(p) + '&showHidden=' + (exShowHidden ? '1' : '0'));
    } catch (e) {
      exShowMsg(e.message, true);
      if (opts.fallback !== undefined && opts.fallback !== p) return exLoad(opts.fallback, { push: opts.push });
      return;
    }
    if (opts.push !== false && exCur !== null && exCur !== data.path) {
      exStack.back.push(exCur);
      exStack.fwd = [];
    }
    exCur = data.path;
    exParent = data.parent;
    exEntries = data.entries;
    if (!opts.keepSel || !exEntries.some((e) => e.name === exSel)) exSel = null;
    renderEx();
  }

  function exRefreshList(keepSel = true) {
    if (exCur !== null) exLoad(exCur, { push: false, keepSel });
  }

  function exSorted() {
    const arr = [...exEntries];
    const k = exSort.key;
    arr.sort((a, b) => {
      const d = (b.dir ? 1 : 0) - (a.dir ? 1 : 0);
      if (d) return d;
      let c = 0;
      if (k === 'name') c = a.name.localeCompare(b.name, 'ja');
      else if (k === 'size') c = a.size - b.size;
      else if (k === 'mtime') c = a.mtime - b.mtime;
      else c = exTypeOf(a).localeCompare(exTypeOf(b), 'ja') || a.name.localeCompare(b.name, 'ja');
      return exSort.asc ? c : -c;
    });
    return arr;
  }

  function renderEx() {
    if (document.activeElement !== el.exAddr) el.exAddr.value = exCur === '' ? 'PC' : (exCur ?? '');
    el.exBtnHidden.classList.toggle('on', exShowHidden);
    el.exBtnHidden.title = i18n.t(exShowHidden ? 'ex.hideHidden' : 'ex.showHidden');
    el.exBtnHidden.setAttribute('aria-label', el.exBtnHidden.title);
    el.exBtnBack.disabled = exStack.back.length === 0;
    el.exBtnFwd.disabled = exStack.fwd.length === 0;
    el.exBtnUp.disabled = exCur === '';
    for (const b of el.exCols) {
      b.classList.toggle('asc', exSort.key === b.dataset.key && exSort.asc);
      b.classList.toggle('desc', exSort.key === b.dataset.key && !exSort.asc);
    }
    el.exList.textContent = '';
    for (const e of exSorted()) {
      const row = document.createElement('div');
      row.className = 'ex-row' + (e.name === exSel ? ' selected' : '');
      if (exClip && exClip.op === 'cut' && exClip.path === exJoin(exCur, e.name)) row.classList.add('cut');
      const nameCell = document.createElement('div');
      nameCell.className = 'ex-cell-name';
      nameCell.innerHTML = exIconFor(e);
      const nameSpan = document.createElement('span');
      nameSpan.textContent = e.name;
      nameCell.appendChild(nameSpan);
      row.appendChild(nameCell);
      const mk = (cls, text) => {
        const s = document.createElement('div');
        s.className = cls;
        s.textContent = text;
        row.appendChild(s);
      };
      mk('ex-cell-mtime', fmtDate(e.mtime));
      mk('ex-cell-type', exTypeOf(e));
      mk('ex-cell-size', fmtSize(e));
      if (isRunnable(e.name) || isLnk(e.name)) {
        const run = document.createElement('button');
        run.type = 'button';
        run.className = 'ex-cell-run';
        run.title = i18n.t('menu.run');
        run.setAttribute('aria-label', i18n.t('menu.runName', { name: e.name }));
        run.innerHTML = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M5 3.5 12 8 5 12.5z" fill="currentColor"/></svg>';
        run.addEventListener('click', (ev) => {
          ev.stopPropagation();
          exOpen(e);
        });
        run.addEventListener('dblclick', (ev) => ev.stopPropagation());
        row.appendChild(run);
      }
      // On phones, folders still open with one tap, but executable shortcuts
      // require the same deliberate double-click as they do on a PC.
      row.addEventListener('click', () => {
        if (row.dataset.lp) return; // a long-press menu was just shown
        exSelect(e.name);
        if (mqMobile.matches && e.dir) exOpen(e);
      });
      row.addEventListener('dblclick', () => {
        if (!mqMobile.matches || isRunnable(e.name) || isLnk(e.name)) exOpen(e);
      });
      row.addEventListener('contextmenu', (ev) => {
        ev.preventDefault();
        exSelect(e.name);
        exContextMenu(e, ev.clientX, ev.clientY);
      });
      attachLongPress(row, (x, y) => { exSelect(e.name); exContextMenu(e, x, y); });
      el.exList.appendChild(row);
    }
    el.exCount.textContent = i18n.t('ex.count', { n: exEntries.length });
  }

  function exSelect(name) {
    exSel = name;
    for (const r of el.exList.children) {
      const span = r.querySelector('.ex-cell-name span');
      r.classList.toggle('selected', !!span && span.textContent === name);
    }
  }

  function exSelEntry() {
    return exEntries.find((e) => e.name === exSel) || null;
  }

  function exOpen(e) {
    const full = exJoin(exCur, e.name);
    if (e.dir) exLoad(full);
    else if (isRunnable(e.name) || isLnk(e.name)) exRunBat(full);
    else exShowMsg(i18n.t('msg.openUnsupported'));
  }

  let lastRunAt = 0;
  async function exRunBat(full) {
    if (Date.now() - lastRunAt < 600) return; // swallow double-fire from double taps
    lastRunAt = Date.now();
    try {
      const r = await fsApi('POST', '/api/fs/run', { path: full });
      if (r.navigate) { exLoad(r.navigate); return; } // folder shortcut
      // the explorer stays open — the tab is ready in the background
      exShowMsg(i18n.t('msg.ranInTab'));
      if (terms.has(r.termId)) activate(r.termId);
      else pendingActivate = r.termId;
    } catch (e) { exShowMsg(e.message, true); }
  }

  function exCopyPath() {
    const e = exSelEntry();
    if (!e) return;
    copyText('"' + exJoin(exCur, e.name) + '"');
    exShowMsg(i18n.t('msg.pathCopied'));
  }

  async function exCreate(kind) {
    if (!exCur) return;
    try {
      const r = await fsApi('POST', kind === 'dir' ? '/api/fs/mkdir' : '/api/fs/newfile', { dir: exCur });
      await exLoad(exCur, { push: false });
      exSelect(r.name);
      exStartRename();
    } catch (e) { exShowMsg(e.message, true); }
  }

  async function exCreateShortcut() {
    const e = exSelEntry();
    if (!e || e.drive || !exCur) return;
    try {
      const r = await fsApi('POST', '/api/fs/shortcut', { path: exJoin(exCur, e.name), dir: exCur });
      await exLoad(exCur, { push: false });
      exSelect(r.name);
      exShowMsg(i18n.t('msg.shortcutCreated'));
    } catch (err) { exShowMsg(err.message, true); }
  }

  function exStartRename() {
    const e = exSelEntry();
    if (!e || e.drive) return;
    const row = [...el.exList.children].find((r) => r.classList.contains('selected'));
    const span = row && row.querySelector('.ex-cell-name span');
    if (!span) return;
    const input = document.createElement('input');
    input.className = 'ex-rename';
    input.value = e.name;
    span.replaceWith(input);
    input.focus();
    const dot = e.dir ? -1 : e.name.lastIndexOf('.');
    input.setSelectionRange(0, dot > 0 ? dot : e.name.length);
    let done = false;
    const commit = async () => {
      if (done) return;
      done = true;
      const name = input.value.trim();
      if (name && name !== e.name) {
        try {
          await fsApi('POST', '/api/fs/rename', { path: exJoin(exCur, e.name), name });
          exSel = name;
        } catch (err) { exShowMsg(err.message, true); }
      }
      exRefreshList();
    };
    input.addEventListener('keydown', (ev) => {
      ev.stopPropagation();
      if (ev.key === 'Enter') commit();
      if (ev.key === 'Escape') { done = true; exRefreshList(); }
    });
    input.addEventListener('blur', commit);
    input.addEventListener('click', (ev) => ev.stopPropagation());
    input.addEventListener('dblclick', (ev) => ev.stopPropagation());
  }

  async function exDelete() {
    const e = exSelEntry();
    if (!e || e.drive) return;
    try {
      await fsApi('POST', '/api/fs/delete', { path: exJoin(exCur, e.name) });
      exShowMsg(i18n.t('msg.trashed'));
      exRefreshList(false);
    } catch (err) { exShowMsg(err.message, true); }
  }

  function exClipSet(op) {
    const e = exSelEntry();
    if (!e || e.drive) return;
    exClip = { op, path: exJoin(exCur, e.name), name: e.name };
    exShowMsg(i18n.t(op === 'copy' ? 'msg.copy' : 'msg.cut') + e.name);
    renderEx();
  }

  async function exPaste(destDir) {
    const dest = destDir || exCur;
    if (!exClip || !dest) return;
    try {
      const r = await fsApi('POST', exClip.op === 'copy' ? '/api/fs/copy' : '/api/fs/move', { path: exClip.path, dest });
      if (exClip.op === 'cut') exClip = null;
      await exLoad(exCur, { push: false });
      if (dest === exCur) exSelect(r.name);
      exShowMsg(i18n.t('msg.pasted'));
    } catch (e) { exShowMsg(e.message, true); }
  }

  function exContextMenu(e, x, y) {
    const items = [];
    const full = exJoin(exCur, e.name);
    if (e.dir) items.push({ icon: e.drive ? exIcons.drive : exIcons.folder, label: i18n.t('menu.open'), action: () => exOpen(e) });
    else if (isRunnable(e.name)) items.push({ icon: exIcons.bat, label: i18n.t('menu.runTerm'), action: () => exOpen(e) });
    else if (isLnk(e.name)) items.push({ icon: exIcons.lnk, label: i18n.t('menu.openLink'), action: () => exOpen(e) });
    if (!e.drive) {
      items.push({ label: i18n.t('menu.copy'), action: () => exClipSet('copy') });
      items.push({ label: i18n.t('menu.cut'), action: () => exClipSet('cut') });
      if (exClip && e.dir) items.push({ label: i18n.t('menu.pasteHere'), action: () => exPaste(exJoin(exCur, e.name)) });
      items.push(pinnedHas(full)
        ? { label: i18n.t('menu.unpin'), action: () => exUnpin(full) }
        : { label: i18n.t('menu.pin'), action: () => exPin(full) });
      items.push({ label: i18n.t('menu.copyPath'), action: () => exCopyPath() });
      items.push({ icon: exIcons.lnk, label: i18n.t('menu.shortcut'), action: () => exCreateShortcut() });
      items.push({ label: i18n.t('menu.rename'), action: () => exStartRename() });
      items.push({ label: i18n.t('menu.delete'), action: () => exDelete() });
    } else {
      items.push(pinnedHas(full)
        ? { label: i18n.t('menu.unpin'), action: () => exUnpin(full) }
        : { label: i18n.t('menu.pin'), action: () => exPin(full) });
      items.push({ label: i18n.t('menu.copyPath'), action: () => exCopyPath() });
    }
    showMenuItems(items, { x, y });
  }

  // ---- pinned files (shown next to the item count, shared across devices)

  let exPinsList = [];

  async function loadPins() {
    try {
      const r = await fsApi('GET', '/api/fs/pins');
      exPinsList = r.pins || [];
      renderPins();
    } catch {}
  }

  function pinnedHas(p) {
    return exPinsList.some((x) => x.path.toLowerCase() === p.toLowerCase());
  }

  function parentOf(p) {
    const i = p.lastIndexOf('\\');
    return i <= 2 ? p.slice(0, 3) : p.slice(0, i);
  }

  async function exPin(p) {
    try {
      const r = await fsApi('POST', '/api/fs/pin', { path: p });
      exPinsList = r.pins;
      renderPins();
      exShowMsg(i18n.t('msg.pinned'));
    } catch (e) { exShowMsg(e.message, true); }
  }

  async function exUnpin(p) {
    try {
      const r = await fsApi('POST', '/api/fs/unpin', { path: p });
      exPinsList = r.pins;
      renderPins();
    } catch (e) { exShowMsg(e.message, true); }
  }

  function openPin(pin) {
    const base = pin.path.split('\\').pop() || '';
    if (pin.dir) exLoad(pin.path);
    else if (isRunnable(base) || isLnk(base)) exRunBat(pin.path);
    else exLoad(parentOf(pin.path)).then(() => exSelect(base));
  }

  function pinMenu(pin, x, y) {
    showMenuItems([
      { label: i18n.t('menu.open'), action: () => openPin(pin) },
      { label: i18n.t('menu.unpin'), action: () => exUnpin(pin.path) },
      { label: i18n.t('menu.copyPath'), action: () => { copyText('"' + pin.path + '"'); exShowMsg(i18n.t('msg.pathCopied')); } },
    ], { x, y });
  }

  function renderPins() {
    el.exPins.textContent = '';
    for (const pin of exPinsList) {
      const base = pin.path.split('\\').pop() || pin.path;
      const chip = document.createElement('div');
      chip.className = 'pin-chip';
      chip.title = pin.path;
      chip.innerHTML = pin.dir ? exIcons.folder
        : isRunnable(base) ? exIcons.bat
        : isLnk(base) ? exIcons.lnk
        : exIcons.file;
      const s = document.createElement('span');
      s.textContent = base;
      chip.appendChild(s);
      chip.addEventListener('click', () => { if (chip.dataset.lp) return; openPin(pin); });
      chip.addEventListener('contextmenu', (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        pinMenu(pin, ev.clientX, ev.clientY);
      });
      attachLongPress(chip, (x, y) => pinMenu(pin, x, y));
      el.exPins.appendChild(chip);
    }
  }

  function exEmptyMenu(x, y) {
    const items = [];
    if (exCur) {
      items.push({ label: i18n.t('menu.newFolder'), action: () => exCreate('dir') });
      items.push({ label: i18n.t('menu.newFile'), action: () => exCreate('file') });
      if (exClip) items.push({ label: i18n.t('menu.paste'), action: () => exPaste() });
    }
    items.push({ label: i18n.t('menu.refresh'), action: () => exRefreshList() });
    showMenuItems(items, { x, y });
  }

  function attachLongPress(elm, cb) {
    if (!isTouch) return;
    let timer = null;
    let sx = 0;
    let sy = 0;
    let fired = false;
    elm.addEventListener('touchstart', (ev) => {
      if (ev.touches.length !== 1) return;
      fired = false;
      const t = ev.touches[0];
      sx = t.clientX;
      sy = t.clientY;
      const target = ev.target;
      clearTimeout(timer);
      timer = setTimeout(() => {
        if (elm === el.exList && target !== el.exList) return;
        fired = true;
        elm.dataset.lp = '1';
        cb(sx, sy);
      }, 550);
    }, { passive: true });
    elm.addEventListener('touchmove', (ev) => {
      const t = ev.touches[0];
      if (Math.abs(t.clientX - sx) > 10 || Math.abs(t.clientY - sy) > 10) clearTimeout(timer);
    }, { passive: true });
    elm.addEventListener('touchend', (ev) => {
      clearTimeout(timer);
      if (fired) {
        ev.preventDefault(); // suppress the click that would follow the long-press
        setTimeout(() => { delete elm.dataset.lp; }, 400);
      }
    }, { passive: false });
  }

  function setExOpen(open) {
    if (open && mqMobile.matches) {
      setMemoOpen(false);
      closeSheet();
    }
    el.exPanel.hidden = !open;
    el.navFiles.classList.toggle('on', open);
    syncMobilePanelBackdrop();
    if (!open) return;
    if (exCur === null) {
      exLoad('C:\\', { push: false, fallback: homeDir || '' });
    } else {
      exRefreshList();
    }
    loadPins();
    if (!isTouch) el.exList.focus();
  }

  el.fileToggle.addEventListener('click', () => setExOpen(el.exPanel.hidden));
  el.exBtnClose.addEventListener('click', () => setExOpen(false));
  el.exBtnRefresh.addEventListener('click', () => exRefreshList());
  el.exBtnHidden.addEventListener('click', () => {
    exShowHidden = !exShowHidden;
    try { localStorage.setItem('termbridge.showHidden', exShowHidden ? '1' : ''); } catch {}
    exRefreshList();
  });
  el.exBtnNewDir.addEventListener('click', () => exCreate('dir'));
  el.exBtnNewFile.addEventListener('click', () => exCreate('file'));
  el.exBtnBack.addEventListener('click', () => {
    if (exStack.back.length) { exStack.fwd.push(exCur); exLoad(exStack.back.pop(), { push: false }); }
  });
  el.exBtnFwd.addEventListener('click', () => {
    if (exStack.fwd.length) { exStack.back.push(exCur); exLoad(exStack.fwd.pop(), { push: false }); }
  });
  el.exBtnUp.addEventListener('click', () => {
    if (exCur !== '' && exParent !== null) exLoad(exParent);
  });

  el.exAddr.addEventListener('keydown', (ev) => {
    ev.stopPropagation();
    if (ev.key === 'Enter') {
      const v = el.exAddr.value.trim();
      exLoad(v === '' || v === 'PC' ? '' : v);
      el.exList.focus();
    }
    if (ev.key === 'Escape') {
      el.exAddr.value = exCur === '' ? 'PC' : (exCur ?? '');
      el.exAddr.blur();
    }
  });

  for (const b of el.exCols) {
    b.addEventListener('click', () => {
      if (exSort.key === b.dataset.key) exSort.asc = !exSort.asc;
      else exSort = { key: b.dataset.key, asc: true };
      renderEx();
    });
  }

  el.exList.addEventListener('contextmenu', (ev) => {
    if (ev.target !== el.exList) return; // rows show their own menu
    ev.preventDefault();
    exEmptyMenu(ev.clientX, ev.clientY);
  });
  attachLongPress(el.exList, (x, y) => exEmptyMenu(x, y));

  el.exList.addEventListener('keydown', (ev) => {
    ev.stopPropagation();
    const rows = exSorted();
    const idx = rows.findIndex((r) => r.name === exSel);
    if (ev.key === 'ArrowDown' || ev.key === 'ArrowUp') {
      ev.preventDefault();
      const ni = ev.key === 'ArrowDown' ? Math.min(rows.length - 1, idx + 1) : Math.max(0, idx <= 0 ? 0 : idx - 1);
      if (rows[ni]) {
        exSelect(rows[ni].name);
        const rowEl = el.exList.children[ni];
        if (rowEl) rowEl.scrollIntoView({ block: 'nearest' });
      }
    } else if (ev.key === 'Enter') {
      const e = exSelEntry();
      if (e) exOpen(e);
    } else if (ev.key === 'F2') exStartRename();
    else if (ev.key === 'Delete') exDelete();
    else if (ev.key === 'Backspace') el.exBtnUp.click();
    else if (ev.key === 'Escape') setExOpen(false);
    else if (ev.ctrlKey && ev.shiftKey && ev.key.toLowerCase() === 'c') exCopyPath();
    else if (ev.ctrlKey && ev.key.toLowerCase() === 'c') exClipSet('copy');
    else if (ev.ctrlKey && ev.key.toLowerCase() === 'x') exClipSet('cut');
    else if (ev.ctrlKey && ev.key.toLowerCase() === 'v') exPaste();
  });

  // ---------------------------------------------------------------- memo

  let memoTimer = null;

  function applyMemo(content) {
    // don't clobber the user's in-progress edit; the server keeps last-writer-wins
    if (document.activeElement === el.memoText) return;
    if (el.memoText.value !== content) el.memoText.value = content;
  }

  function setMemoOpen(open) {
    if (open && mqMobile.matches) {
      setExOpen(false);
      closeSheet();
    }
    el.memoPanel.hidden = !open;
    el.navMemo.classList.toggle('on', open);
    syncMobilePanelBackdrop();
    try { localStorage.setItem('termbridge.memoOpen', open ? '1' : ''); } catch {}
    if (open && !isTouch) el.memoText.focus();
  }

  el.memoToggle.addEventListener('click', () => setMemoOpen(el.memoPanel.hidden));
  el.memoClose.addEventListener('click', () => setMemoOpen(false));

  el.memoText.addEventListener('input', () => {
    el.memoState.textContent = i18n.t('memo.syncing');
    clearTimeout(memoTimer);
    memoTimer = setTimeout(() => {
      send({ type: 'memo-set', content: el.memoText.value });
      el.memoState.textContent = i18n.t('memo.saved');
      setTimeout(() => { if (el.memoState.textContent === i18n.t('memo.saved')) el.memoState.textContent = ''; }, 2000);
    }, 500);
  });

  el.memoText.addEventListener('keydown', (e) => {
    e.stopPropagation();
    if (e.key === 'Escape') setMemoOpen(false);
  });

  if (localStorage.getItem('termbridge.memoOpen') === '1') setMemoOpen(true);

  // ---------------------------------------------------------------- auth

  function showAuth() {
    setConn('offline', { key: 'err.auth' });
    el.authOverlay.hidden = false;
    el.authInput.value = '';
    el.authInput.focus();
  }

  el.authInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      localStorage.setItem('termbridge.token', el.authInput.value);
      el.authOverlay.hidden = true;
      connect();
    }
  });

  connect();

  // Static markup is re-applied by i18n itself; these redraw the parts we build in JS.
  i18n.onChange(() => {
    renderTabs();
    renderEmptyButtons();
    renderSheet();
    renderPins();
    setConn(lastConn.state, lastConn);
    if (!el.exPanel.hidden) renderEx();
  });
})();
