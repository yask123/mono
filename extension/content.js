// Mono — content script.
// Sets the look on <html>, draws the frame and status line, and tags media so
// a recipe can fold it. Styling lives in the CSS; this file holds no colours.
(() => {
  'use strict';
  if (window.top !== window || window.__monoLoaded) return;
  window.__monoLoaded = true;

  const api = globalThis.browser ?? globalThis.chrome;
  const store = api?.storage?.local;
  const LOOKS = ['phosphor', 'neon', 'paper'];
  const STATES = [...LOOKS, 'off'];
  const KEY = 'look'; // the current state: a look, or "off"
  const LAST = 'last'; // the look to come back to when Mono is switched on again
  const CACHE = '__mono_look'; // per-site copy, read synchronously to avoid a flash
  const root = document.documentElement;

  // Path prefixes that are sections of the site rather than a profile.
  const SECTIONS = ['home', 'explore', 'notifications', 'messages', 'search', 'settings', 'i'];
  // A post's media, and the parts of a post that are never media.
  const COVER = '[data-testid="article-cover-image"]'; // the picture on a quoted X Article
  const MEDIA = `[data-testid="tweetPhoto"], [data-testid^="card.layout"][data-testid$=".media"], ${COVER}`;
  const TEXT = '[data-testid="tweetText"], [data-testid="User-Name"]';

  let look = 'phosphor';
  let last = 'phosphor';
  let bar = null;
  let pathEl = null;
  let caret = null;
  let lastPath = null;

  try {
    const cached = localStorage.getItem(CACHE);
    if (STATES.includes(cached)) look = cached;
    const cachedLast = localStorage.getItem(CACHE + '_last');
    if (LOOKS.includes(cachedLast)) last = cachedLast;
  } catch {}
  if (look !== 'off') last = look;
  paint();

  store?.get([KEY, LAST]).then((saved) => {
    if (LOOKS.includes(saved?.[LAST])) last = saved[LAST];
    const value = saved?.[KEY];
    if (STATES.includes(value)) {
      look = value;
      if (look !== 'off') last = look;
      cache();
      paint();
    } else {
      store.set({ [KEY]: look, [LAST]: last });
    }
  }).catch(() => {});

  // Another tab or the toolbar popup changed the look.
  api?.storage?.onChanged?.addListener((changes, area) => {
    if (area !== 'local') return;
    if (LOOKS.includes(changes[LAST]?.newValue)) last = changes[LAST].newValue;
    const value = changes[KEY]?.newValue;
    if (!STATES.includes(value) || value === look) return;
    look = value;
    if (look !== 'off') last = look;
    cache();
    paint();
  });

  function cache() {
    try {
      localStorage.setItem(CACHE, look);
      localStorage.setItem(CACHE + '_last', last);
    } catch {}
  }

  function setLook(next) {
    look = next;
    if (look !== 'off') last = look;
    cache();
    store?.set({ [KEY]: look, [LAST]: last });
    paint();
  }

  // On/off, coming back to the look you had.
  function toggle() {
    setLook(look === 'off' ? last : 'off');
  }

  function nextLook() {
    setLook(look === 'off' ? last : LOOKS[(LOOKS.indexOf(look) + 1) % LOOKS.length]);
  }

  function paint() {
    if (look === 'off') root.removeAttribute('data-mono');
    else root.setAttribute('data-mono', look);
    if (bar) {
      bar.toggleAttribute('data-off', look === 'off');
      for (const b of bar.querySelectorAll('button[data-look]')) {
        b.setAttribute('aria-pressed', String(b.dataset.look === look));
      }
    }
    if (look !== 'off') tagMedia();
    placeCaret();
  }

  // ── Frame and status line ────────────────────────────────────────────
  function el(tag, cls, text) {
    const node = document.createElement(tag);
    if (cls) node.className = cls;
    if (text) node.textContent = text;
    return node;
  }

  function mount() {
    if (bar) return;
    const frame = el('div');
    frame.id = 'mono-frame';
    bar = el('div');
    bar.id = 'mono-bar';
    const tag = el('button', 'mono-tag', 'MONO');
    tag.dataset.act = 'toggle';
    tag.title = 'Mono on / off  (⌥⇧M)';
    pathEl = el('span', 'mono-path');
    bar.append(tag, pathEl, el('span', 'mono-space'), el('span', 'mono-label', 'look'));
    for (const name of LOOKS) {
      const b = el('button', 'mono-look', name);
      b.dataset.look = name;
      bar.append(b);
    }
    bar.append(el('span', 'mono-key', '⌥⇧L next · ⌥⇧M off'));
    bar.addEventListener('click', (e) => {
      const b = e.target.closest('button');
      if (!b) return;
      if (b.dataset.act === 'toggle') toggle();
      else if (b.dataset.look) setLook(b.dataset.look);
    });
    root.append(frame, bar);
    if (!CSS.supports('caret-shape', 'block')) {
      caret = el('div');
      caret.id = 'mono-caret';
      root.append(caret);
    }
    paint();
    lastPath = null; // the path label did not exist the first time page() ran
    page();
  }

  // ── Which page this is, for recipes that care ────────────────────────
  function page() {
    const path = location.pathname;
    if (path === lastPath) return;
    lastPath = path;
    const first = path.split('/')[1] || 'home';
    // The composer is a dialog over whatever page you were on, so it gets its
    // own flag and leaves the page kind alone.
    const composing = first === 'compose';
    root.toggleAttribute('data-mono-compose', composing);
    if (!composing || !root.hasAttribute('data-mono-page')) {
      const kind = composing ? 'home' : path.includes('/status/') ? 'status' : SECTIONS.includes(first) ? first : 'profile';
      root.setAttribute('data-mono-page', kind);
    }
    if (pathEl) pathEl.textContent = location.host.replace(/^www\./, '') + path;
    placeCaret();
  }

  // ── Block cursor in the composer ─────────────────────────────────────
  // Only where the browser cannot draw one itself (see #mono-caret).
  function placeCaret() {
    if (!caret) return;
    const sel = document.getSelection();
    const node = sel && sel.isCollapsed && sel.rangeCount ? sel.anchorNode : null;
    const at = node && (node.nodeType === Node.ELEMENT_NODE ? node : node.parentElement);
    if (look === 'off' || !root.hasAttribute('data-mono-compose') || !at?.closest('[data-testid^="tweetTextarea_"]')) {
      caret.style.display = 'none';
      return;
    }
    // An empty line has no caret rectangle; fall back to the line itself.
    const spot = sel.getRangeAt(0).getClientRects()[0];
    const line = at.getBoundingClientRect();
    const box = spot && spot.height ? spot : { left: line.left, top: line.top + (line.height - 21) / 2, height: 21 };
    caret.style.cssText = `display:block;left:${box.left}px;top:${box.top}px;height:${box.height}px;animation:none`;
    void caret.offsetWidth; // restart the blink so the block is solid while you type
    caret.style.animation = '';
  }

  document.addEventListener('selectionchange', placeCaret);
  window.addEventListener('scroll', placeCaret, true);
  window.addEventListener('resize', placeCaret);

  // ── Media tagging ────────────────────────────────────────────────────
  // Marks the outermost box that holds only a post's media, so a look can
  // fold it to a single line ("▸ 2 images").
  function tagMedia() {
    for (const media of document.querySelectorAll(`article :is(${MEDIA})`)) {
      if (media.closest('[data-mono-media]')) continue;
      // An article's cover sits beside its title, so it is its own box. Other
      // media climbs to the outermost wrapper that holds nothing but media.
      const cover = media.matches(COVER);
      let box = media;
      for (let up = box.parentElement; up && !cover; up = box.parentElement) {
        if (up.tagName === 'ARTICLE' || up.hasAttribute('aria-labelledby') || up.querySelector(TEXT)) break;
        box = up;
      }
      const photos = box.querySelectorAll('[data-testid="tweetPhoto"]').length;
      let label = 'link preview';
      if (cover) label = 'cover image';
      else if (box.querySelector('video, [data-testid="videoPlayer"]')) label = 'video';
      else if (photos > 1) label = `${photos} images`;
      else if (photos === 1) label = 'image';
      box.setAttribute('data-mono-media', label);
    }
  }

  // A folded box opens on click; its label line folds it again.
  document.addEventListener('click', (e) => {
    if (look !== 'phosphor' || !(e.target instanceof Element)) return;
    const box = e.target.closest('[data-mono-media]');
    if (!box) return;
    const open = box.hasAttribute('data-mono-open');
    if (open && e.target !== box) return;
    box.toggleAttribute('data-mono-open', !open);
    e.preventDefault();
    e.stopPropagation();
  }, true);

  // ⌥⇧M switches Mono on and off; ⌥⇧L steps to the next look.
  document.addEventListener('keydown', (e) => {
    if (!e.altKey || !e.shiftKey || e.metaKey || e.ctrlKey) return;
    if (e.code === 'KeyM') toggle();
    else if (e.code === 'KeyL') nextLook();
    else return;
    e.preventDefault();
    e.stopPropagation();
  }, true);

  let queued = false;
  new MutationObserver(() => {
    if (queued || look === 'off') return;
    queued = true;
    setTimeout(() => {
      queued = false;
      tagMedia();
    }, 120);
  }).observe(root, { childList: true, subtree: true });

  setInterval(page, 400);
  page();
  if (document.body) mount();
  else document.addEventListener('DOMContentLoaded', mount, { once: true });
})();
