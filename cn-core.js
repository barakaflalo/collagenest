/* CollageNest 1.5.0 · cn-core.js — core: storage, i18n helpers, UI shell, mosaic engine */
/* ═══ CollageNest · AppNest — core (storage, i18n helpers, UI shell) ═══ */
'use strict';
const APP_VERSION = '1.5.0';
const STORE_URL = 'https://appnest-store.pages.dev';
const FEEDBACK_MAIL = 'appnest55@gmail.com';

/* ── error log (first, so it catches everything) ── */
function logErr(msg, src, line) {
  try {
    const a = JSON.parse(localStorage.getItem('cn_errors') || '[]');
    a.unshift({ m: String(msg).slice(0, 300), s: src ? String(src).split('/').pop() : '', l: line || 0, t: new Date().toISOString() });
    localStorage.setItem('cn_errors', JSON.stringify(a.slice(0, 10)));
  } catch (e) {}
}
addEventListener('error', e => logErr(e.message, e.filename, e.lineno));
addEventListener('unhandledrejection', e => logErr('Promise: ' + ((e.reason && e.reason.message) || e.reason)));

/* ── storage shim: localStorage → memory ── */
const Store = (() => {
  const mem = {}; let ok = true;
  try { localStorage.setItem('cn__t', '1'); localStorage.removeItem('cn__t'); } catch (e) { ok = false; }
  return {
    ok: () => ok,
    get(k, d) { try { const v = ok ? localStorage.getItem('cn_' + k) : mem[k]; return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
    set(k, v) {
      const s = JSON.stringify(v);
      if (ok) { try { localStorage.setItem('cn_' + k, s); return true; } catch (e) { mem[k] = s; toast(T('saveFail'), true); return false; } }
      mem[k] = s; return true;
    },
    del(k) { try { ok ? localStorage.removeItem('cn_' + k) : delete mem[k]; } catch (e) {} },
    clearAll() {
      try { Object.keys(localStorage).filter(k => k.startsWith('cn_')).forEach(k => localStorage.removeItem(k)); } catch (e) {}
      for (const k in mem) delete mem[k];
    }
  };
})();

/* ── IndexedDB: libs / tiles (Blob) / gallery (Blob) → memory fallback ── */
const DB = (() => {
  let db = null, mem = null;
  const STORES = ['libs', 'tiles', 'gallery', 'projects'];
  const initMem = () => { const m = {}; STORES.forEach(s => m[s] = new Map()); return m; };
  function open() {
    return new Promise(res => {
      if (!('indexedDB' in self)) { mem = initMem(); return res(false); }
      let r;
      try { r = indexedDB.open('collagenest', 2); } catch (e) { mem = initMem(); return res(false); }
      r.onupgradeneeded = () => {
        const d = r.result;
        if (!d.objectStoreNames.contains('libs')) d.createObjectStore('libs', { keyPath: 'id' });
        if (!d.objectStoreNames.contains('tiles')) { const s = d.createObjectStore('tiles', { keyPath: 'id' }); s.createIndex('lib', 'libId'); }
        if (!d.objectStoreNames.contains('gallery')) d.createObjectStore('gallery', { keyPath: 'id' });
        if (!d.objectStoreNames.contains('projects')) d.createObjectStore('projects', { keyPath: 'id' });
      };
      r.onsuccess = () => { db = r.result; res(true); };
      r.onerror = () => { mem = initMem(); res(false); };
    });
  }
  function run(store, mode, fn) {
    return new Promise((res, rej) => {
      let t; try { t = db.transaction(store, mode); } catch (e) { return rej(e); }
      const r = fn(t.objectStore(store)); let out;
      if (r) r.onsuccess = () => { out = r.result; };
      t.oncomplete = () => res(out);
      t.onerror = () => rej(t.error); t.onabort = () => rej(t.error);
    });
  }
  return {
    open, isMem: () => !!mem,
    put(store, o) { if (mem) { mem[store].set(o.id, o); return Promise.resolve(); } return run(store, 'readwrite', s => s.put(o)); },
    putMany(store, arr) {
      if (mem) { arr.forEach(o => mem[store].set(o.id, o)); return Promise.resolve(); }
      return new Promise((res, rej) => {
        const t = db.transaction(store, 'readwrite'), s = t.objectStore(store);
        arr.forEach(o => s.put(o));
        t.oncomplete = () => res(); t.onerror = () => rej(t.error); t.onabort = () => rej(t.error);
      });
    },
    get(store, id) { if (mem) return Promise.resolve(mem[store].get(id)); return run(store, 'readonly', s => s.get(id)); },
    del(store, id) { if (mem) { mem[store].delete(id); return Promise.resolve(); } return run(store, 'readwrite', s => s.delete(id)); },
    all(store) { if (mem) return Promise.resolve([...mem[store].values()]); return run(store, 'readonly', s => s.getAll()); },
    byLib(libId) {
      if (mem) return Promise.resolve([...mem.tiles.values()].filter(t => t.libId === libId));
      return run('tiles', 'readonly', s => s.index('lib').getAll(libId));
    },
    countLib(libId) {
      if (mem) return Promise.resolve([...mem.tiles.values()].filter(t => t.libId === libId).length);
      return run('tiles', 'readonly', s => s.index('lib').count(libId));
    },
    delTiles(ids) {
      if (mem) { ids.forEach(i => mem.tiles.delete(i)); return Promise.resolve(); }
      return new Promise((res, rej) => {
        const t = db.transaction('tiles', 'readwrite'), s = t.objectStore('tiles');
        ids.forEach(i => s.delete(i));
        t.oncomplete = () => res(); t.onerror = () => rej(t.error);
      });
    },
    async delLib(libId) {
      const tiles = await this.byLib(libId);
      await this.delTiles(tiles.map(t => t.id));
      await this.del('libs', libId);
    },
    clear(store) { if (mem) { mem[store].clear(); return Promise.resolve(); } return run(store, 'readwrite', s => s.clear()); }
  };
})();

/* ── settings ── */
function detectLang() {
  const l = (navigator.language || 'he').slice(0, 2).toLowerCase();
  return ['he', 'en', 'ru', 'es', 'ar'].includes(l) ? l : (l === 'iw' ? 'he' : 'en');
}
const DEF_S = {
  lang: detectLang(), theme: 'gold', mode: 'night', name: '', fmt: 'jpg', onboarded: false,
  mosaic: { cols: 50, aspect: '1:1', variety: 'med', flip: true, tint: 20, overlay: 0, grout: 0, groutColor: '#000000', shape: 'square', size: '4k', outline: 'none', outlineText: '50', shapeBg: '#ffffff' },
  collage: { ratio: '1:1', gap: 2, radius: 2, bg: '#ffffff', size: 3072 },
  auto: { count: 0, ratio: '4:3', faces: true, size: '2k', style: 'blend' },
  words: { text: '', size: 2.6, font: 'sans', bg: '#0b0b0c', boost: 1.35, exSize: '4k' },
  print: { paper: 'a4', orient: 'port', cols: 3 },
  video: { fmt: '1:1', dur: 8 }
};
let S = Object.assign({}, DEF_S, Store.get('settings', {}));
S.mosaic = Object.assign({}, DEF_S.mosaic, S.mosaic || {});
S.collage = Object.assign({}, DEF_S.collage, S.collage || {});
S.auto = Object.assign({}, DEF_S.auto, S.auto || {});
['words', 'print', 'video'].forEach(k => { S[k] = Object.assign({}, DEF_S[k], S[k] || {}); });
function saveS() { Store.set('settings', S); }

/* ── i18n ── */
function T(k, v) {
  const d = (LANG[S.lang] && LANG[S.lang][k] != null) ? LANG[S.lang][k] : (LANG.en[k] != null ? LANG.en[k] : k);
  return v ? String(d).replace(/\{(\w+)\}/g, (m, n) => v[n] != null ? v[n] : m) : d;
}
const isRTL = () => S.lang === 'he' || S.lang === 'ar';
function nf(n) { try { return new Intl.NumberFormat(S.lang).format(n); } catch (e) { return String(n); } }
function df(ts) { try { return new Date(ts).toLocaleDateString(S.lang, { day: 'numeric', month: 'short', year: 'numeric' }); } catch (e) { return new Date(ts).toDateString(); } }

/* ── tiny helpers ── */
const $ = id => document.getElementById(id);
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
const sleep = ms => new Promise(r => setTimeout(r, ms));
const yieldUI = () => new Promise(r => setTimeout(r, 0));
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const isCoarse = () => matchMedia('(pointer:coarse)').matches;

function mkCanvas(w, h) {
  if (typeof OffscreenCanvas !== 'undefined') { try { const c = new OffscreenCanvas(w, h); if (c.getContext('2d')) return c; } catch (e) {} }
  const c = document.createElement('canvas'); c.width = w; c.height = h; return c;
}
function canvasToBlob(c, type, q) {
  if (c.convertToBlob) return c.convertToBlob({ type, quality: q });
  return new Promise((res, rej) => c.toBlob(b => b ? res(b) : rej(new Error('toBlob')), type, q));
}

/* ── toast / progress ── */
let toastTimer = 0;
function toast(msg, err) {
  const r = $('toastRoot'); if (!r) return;
  r.innerHTML = '<div class="toast' + (err ? ' err' : '') + '" role="status">' + esc(msg) + '</div>';
  clearTimeout(toastTimer); toastTimer = setTimeout(() => { r.innerHTML = ''; }, err ? 4200 : 2600);
}
const Prog = {
  cur: null,
  show(title, cancellable) {
    const st = { cancelled: false };
    $('progRoot').innerHTML = '<div class="prog" role="dialog" aria-modal="true" aria-label="' + esc(title) + '"><div class="box"><b id="progT">' + esc(title) +
      '</b><div class="bar"><i id="progBar"></i></div><div class="small muted" id="progD">&nbsp;</div>' +
      (cancellable ? '<div style="margin-top:12px"><button class="btn ghost sm" id="progX" type="button">' + esc(T('cancel')) + '</button></div>' : '') + '</div></div>';
    if (cancellable) $('progX').onclick = () => { st.cancelled = true; $('progD').textContent = T('cancelling'); };
    st.set = (p, d) => { const b = $('progBar'); if (b) b.style.width = Math.round(clamp(p, 0, 1) * 100) + '%'; if (d != null && $('progD')) $('progD').textContent = d; };
    st.close = () => { $('progRoot').innerHTML = ''; Prog.cur = null; };
    this.cur = st; return st;
  }
};

/* ── modal / sheet with focus trap, Esc, Android back ── */
let modalStack = [];
function openModal(o) {
  const root = $('modalRoot');
  const wrap = document.createElement('div');
  wrap.className = 'scrim' + (o.center ? ' center' : '');
  wrap.innerHTML = '<div class="sheet" role="dialog" aria-modal="true" aria-labelledby="mt' + modalStack.length + '">' +
    (o.title ? '<h3 id="mt' + modalStack.length + '">' + esc(o.title) + '</h3>' : '') + '<div class="mb">' + (o.html || '') + '</div>' +
    (o.actions && o.actions.length ? '<div class="acts"></div>' : '') + '</div>';
  root.appendChild(wrap);
  const prevFocus = document.activeElement;
  const m = { el: wrap, body: wrap.querySelector('.mb'), close, onClose: o.onClose };
  function close() {
    if (!wrap.parentNode) return;
    wrap.remove(); modalStack = modalStack.filter(x => x !== m);
    if (o.onClose) try { o.onClose(); } catch (e) {}
    if (prevFocus && prevFocus.focus) try { prevFocus.focus(); } catch (e) {}
  }
  if (o.actions) {
    const acts = wrap.querySelector('.acts');
    o.actions.forEach(a => {
      const b = document.createElement('button'); b.type = 'button';
      b.className = 'btn ' + (a.cls || 'ghost'); b.textContent = a.label;
      b.onclick = async () => { if (a.onClick) { const r = await a.onClick(m); if (r === false) return; } if (!a.keep) close(); };
      acts.appendChild(b);
    });
  }
  const opened = Date.now(); // the tap that opened a sheet must not also close it (touch → late click on the scrim)
  wrap.addEventListener('click', e => { if (Date.now() - opened < 450) { e.preventDefault(); e.stopPropagation(); } }, true); // swallow the ghost click
  wrap.addEventListener('click', e => { if (e.target === wrap && !o.sticky) close(); });
  wrap.addEventListener('keydown', e => {
    if (e.key === 'Escape' && !o.sticky) { e.stopPropagation(); close(); }
    if (e.key === 'Tab') {
      const f = [...wrap.querySelectorAll('button,input,select,textarea,a[href],[tabindex]:not([tabindex="-1"])')].filter(x => !x.disabled && x.offsetParent !== null);
      if (!f.length) return;
      const first = f[0], last = f[f.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
  });
  modalStack.push(m);
  setTimeout(() => { const f = wrap.querySelector('input,select,textarea,button'); if (f) try { f.focus({ preventScroll: true }); } catch (e) {} }, 30);
  return m;
}
function confirmBox(msg, okLabel, danger) {
  return new Promise(res => {
    let done = false;
    openModal({
      center: true, title: T('areYouSure'), html: '<p>' + esc(msg) + '</p>',
      onClose: () => { if (!done) res(false); },
      actions: [
        { label: T('cancel'), cls: 'ghost', onClick: () => { done = true; res(false); } },
        { label: okLabel || T('ok'), cls: danger ? 'danger' : 'primary', onClick: () => { done = true; res(true); } }
      ]
    });
  });
}
function promptBox(title, val, okLabel) {
  return new Promise(res => {
    let done = false;
    const m = openModal({
      center: true, title, html: '<input type="text" id="pbIn" maxlength="60" value="' + esc(val || '') + '">',
      onClose: () => { if (!done) res(null); },
      actions: [
        { label: T('cancel'), cls: 'ghost', onClick: () => { done = true; res(null); } },
        { label: okLabel || T('save'), cls: 'primary', onClick: () => { done = true; res($('pbIn').value.trim()); } }
      ]
    });
    m.body.querySelector('input').addEventListener('keydown', e => { if (e.key === 'Enter') m.el.querySelector('.btn.primary').click(); });
  });
}

/* long-press helper (edit gesture) */
function onLongPress(el, fn) {
  let t = 0, sx = 0, sy = 0, fired = false;
  el.addEventListener('pointerdown', e => { fired = false; sx = e.clientX; sy = e.clientY; t = setTimeout(() => { fired = true; if (navigator.vibrate) try { navigator.vibrate(15); } catch (er) {} fn(e); }, 550); });
  el.addEventListener('pointermove', e => { if (Math.abs(e.clientX - sx) > 8 || Math.abs(e.clientY - sy) > 8) clearTimeout(t); });
  ['pointerup', 'pointercancel', 'pointerleave'].forEach(ev => el.addEventListener(ev, () => clearTimeout(t)));
  el.addEventListener('click', e => { if (fired) { e.preventDefault(); e.stopImmediatePropagation(); fired = false; } }, true);
  el.addEventListener('contextmenu', e => e.preventDefault());
}

/* ── file picking ── */
function pickFiles(kind) {
  return new Promise(res => {
    const inp = $(kind === 'one' ? 'fileOne' : kind === 'dir' ? 'fileDir' : kind === 'json' ? 'fileJson' : 'fileMany');
    inp.value = '';
    inp.onchange = () => { const f = [...(inp.files || [])]; inp.value = ''; res(f); };
    inp.addEventListener('cancel', () => res([]), { once: true });
    inp.click();
  });
}
const isHeic = f => /\.(heic|heif)$/i.test(f.name || '') || /hei[cf]/i.test(f.type || '');
const isImageFile = f => /^image\//.test(f.type || '') || /\.(jpe?g|png|webp|gif|bmp|avif|heic|heif)$/i.test(f.name || '');

/* multi-CDN script loader */
const _loaded = {};
function loadScript(urls, test) {
  if (test()) return Promise.resolve();
  const key = urls[0];
  if (_loaded[key]) return _loaded[key];
  _loaded[key] = (async () => {
    for (const u of urls) {
      try {
        await new Promise((res, rej) => {
          const s = document.createElement('script'); s.src = u; s.async = true; s.crossOrigin = 'anonymous';
          const to = setTimeout(() => rej(new Error('timeout')), 20000);
          s.onload = () => { clearTimeout(to); res(); }; s.onerror = () => { clearTimeout(to); rej(new Error('load')); };
          document.head.appendChild(s);
        });
        if (test()) return;
      } catch (e) {}
    }
    _loaded[key] = null;
    throw new Error('cdn');
  })();
  return _loaded[key];
}
const HEIC_URLS = [
  'https://cdn.jsdelivr.net/npm/heic2any@0.0.4/dist/heic2any.min.js',
  'https://unpkg.com/heic2any@0.0.4/dist/heic2any.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/heic2any/0.0.4/heic2any.min.js'
];

/* decode any image file → ImageBitmap (EXIF orientation respected) */
async function decodeImage(file) {
  try { return await createImageBitmap(file, { imageOrientation: 'from-image' }); } catch (e) {}
  try {
    const url = URL.createObjectURL(file);
    try {
      const img = new Image(); img.src = url; await img.decode();
      return await createImageBitmap(img);
    } finally { URL.revokeObjectURL(url); }
  } catch (e) {}
  if (isHeic(file)) {
    await loadScript(HEIC_URLS, () => typeof window.heic2any === 'function');
    const out = await window.heic2any({ blob: file, toType: 'image/jpeg', quality: 0.9 });
    return await createImageBitmap(Array.isArray(out) ? out[0] : out);
  }
  throw new Error('decode');
}

/* download & share */
function downloadBlob(blob, name) {
  const a = document.createElement('a'); const u = URL.createObjectURL(blob);
  a.href = u; a.download = name; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(u), 8000);
}
async function shareBlob(blob, name) {
  const text = S.name ? T('shareMadeBy', { name: S.name }) : T('shareMade');
  try {
    const file = new File([blob], name, { type: blob.type });
    if (navigator.canShare && navigator.canShare({ files: [file] })) { await navigator.share({ files: [file], title: 'CollageNest', text }); return; }
  } catch (e) { if (e && e.name === 'AbortError') return; }
  downloadBlob(blob, name); toast(T('shareFallback'));
}
function fileStamp() { const d = new Date(); const p = n => String(n).padStart(2, '0'); return d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate()) + '-' + p(d.getHours()) + p(d.getMinutes()); }

/* ── themes ── */
const THEMES = {
  gold:    { night: ['#0b0b0c', '#141416', '#1c1b1f', '#2c2820', '#f3efe6', '#a39d8f', '#d4af37', '#f0d278', '#111'], day: ['#faf7ef', '#ffffff', '#f2ecdd', '#e3d8bd', '#1d1a14', '#6b6457', '#9c7a12', '#c19a2b', '#fff'] },
  sapphire:{ night: ['#090c13', '#11161f', '#18202c', '#24304a', '#eaf0fb', '#94a2bb', '#6ea8ff', '#a9cbff', '#06101f'], day: ['#f4f7fc', '#ffffff', '#e9eff9', '#cfdcf2', '#121a28', '#56647c', '#2a62c9', '#4f86e8', '#fff'] },
  emerald: { night: ['#08100c', '#0f1813', '#15211a', '#21382b', '#e8f5ee', '#8fae9d', '#3fcf8e', '#86e8b9', '#04140b'], day: ['#f3faf6', '#ffffff', '#e6f4ec', '#c9e6d6', '#10201a', '#557063', '#16804f', '#2ea56c', '#fff'] },
  ruby:    { night: ['#110a0c', '#1a1013', '#23161a', '#3a2229', '#f7eaee', '#b3959d', '#ff6b81', '#ffa6b4', '#1a0509'], day: ['#fcf4f6', '#ffffff', '#f7e7eb', '#ecccd4', '#26121a', '#76525c', '#bb2b45', '#df4b66', '#fff'] },
  amethyst:{ night: ['#0d0b13', '#15121d', '#1d1928', '#302a44', '#f0ecfa', '#a39cb8', '#b48cff', '#d4bcff', '#120a22'], day: ['#f7f5fc', '#ffffff', '#efeaf9', '#dcd2f1', '#1a1528', '#625a78', '#6a43c4', '#8a66e0', '#fff'] }
};
const VARS = ['--bg', '--bg2', '--bg3', '--line', '--text', '--muted', '--accent', '--accent2', '--onaccent'];
function applyTheme() {
  const t = (THEMES[S.theme] || THEMES.gold)[S.mode === 'day' ? 'day' : 'night'];
  const r = document.documentElement;
  VARS.forEach((v, i) => r.style.setProperty(v, t[i]));
  r.setAttribute('data-mode', S.mode === 'day' ? 'day' : 'night');
  const mt = document.querySelector('meta[name=theme-color]'); if (mt) mt.setAttribute('content', t[0]);
  const mb = $('modeBtn'); if (mb) { mb.textContent = S.mode === 'day' ? '☀️' : '🌙'; mb.setAttribute('aria-label', T(S.mode === 'day' ? 'toNight' : 'toDay')); }
}
function themePicker() {
  const draw = () => '<div class="themes">' + Object.keys(THEMES).map(k => {
    const t = THEMES[k][S.mode === 'day' ? 'day' : 'night'];
    return '<button type="button" data-th="' + k + '" class="' + (S.theme === k ? 'on' : '') + '" aria-label="' + esc(T('th_' + k)) + '"><span style="background:linear-gradient(135deg,' + t[0] + ' 50%,' + t[6] + ' 50%)"></span></button>';
  }).join('') + '</div><div class="sw" style="margin-top:12px"><span>' + esc(T('dayMode')) + '</span><label class="toggle"><input type="checkbox" id="tpDay" ' + (S.mode === 'day' ? 'checked' : '') + ' aria-label="' + esc(T('dayMode')) + '"><span></span></label></div>';
  const m = openModal({ title: T('chooseTheme'), html: draw(), actions: [{ label: T('close'), cls: 'primary' }] });
  const bind = () => {
    m.body.querySelectorAll('[data-th]').forEach(b => b.onclick = () => { S.theme = b.dataset.th; saveS(); applyTheme(); m.body.innerHTML = draw(); bind(); });
    $('tpDay').onchange = e => { S.mode = e.target.checked ? 'day' : 'night'; saveS(); applyTheme(); m.body.innerHTML = draw(); bind(); };
  };
  bind();
}

/* ═══ CollageNest — mosaic engine: libraries, features (Lab 3×3), matching worker, rendering ═══ */

/* ── color: sRGB → linear → Lab ── */
const LIN = new Float32Array(256);
for (let i = 0; i < 256; i++) { const c = i / 255; LIN[i] = c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); }
function labF(t) { return t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116; }
function lin2lab(r, g, b, out, o) {
  const x = (r * 0.4124 + g * 0.3576 + b * 0.1805) / 0.95047;
  const y = r * 0.2126 + g * 0.7152 + b * 0.0722;
  const z = (r * 0.0193 + g * 0.1192 + b * 0.9505) / 1.08883;
  const fx = labF(x), fy = labF(y), fz = labF(z);
  out[o] = 116 * fy - 16; out[o + 1] = 500 * (fx - fy); out[o + 2] = 200 * (fy - fz);
}
function lin2srgb8(v) { v = v <= 0.0031308 ? v * 12.92 : 1.055 * Math.pow(v, 1 / 2.4) - 0.055; return Math.round(clamp(v, 0, 1) * 255); }

const G = 3, FD = G * G * 3; // 3×3 sub-blocks × Lab = 27 numbers per tile/cell

/* average blocks of an RGBA buffer (W×H) into G×G Lab features */
function blockFeatures(data, W, H, out, o, rgbOut, ro) {
  const bw = W / G, bh = H / G; let tr = 0, tg = 0, tb = 0;
  for (let by = 0; by < G; by++) for (let bx = 0; bx < G; bx++) {
    let r = 0, g = 0, b = 0, n = 0;
    const x0 = Math.floor(bx * bw), x1 = Math.floor((bx + 1) * bw), y0 = Math.floor(by * bh), y1 = Math.floor((by + 1) * bh);
    for (let y = y0; y < y1; y++) { let p = (y * W + x0) * 4; for (let x = x0; x < x1; x++, p += 4) { r += LIN[data[p]]; g += LIN[data[p + 1]]; b += LIN[data[p + 2]]; n++; } }
    n = n || 1; r /= n; g /= n; b /= n; tr += r; tg += g; tb += b;
    lin2lab(r, g, b, out, o + (by * G + bx) * 3);
  }
  if (rgbOut) { rgbOut[ro] = lin2srgb8(tr / 9); rgbOut[ro + 1] = lin2srgb8(tg / 9); rgbOut[ro + 2] = lin2srgb8(tb / 9); }
}
/* horizontally mirrored feature (for flipped tiles) */
function mirrorFeat(src, so, dst, d) {
  for (let by = 0; by < G; by++) for (let bx = 0; bx < G; bx++) {
    const s = so + (by * G + bx) * 3, t = d + (by * G + (G - 1 - bx)) * 3;
    dst[t] = src[s]; dst[t + 1] = src[s + 1]; dst[t + 2] = src[s + 2];
  }
}
/* crop rect of an image (bw×bh) to aspect a (=w/h), centered */
function cropToAspect(bw, bh, a) {
  if (bw / bh > a) { const sw = bh * a; return [(bw - sw) / 2, 0, sw, bh]; }
  const sh = bw / a; return [0, (bh - sh) / 2, bw, sh];
}
/* crop to aspect a around a point of interest (cx,cy ∈ 0..1) — "smart crop" of tiles */
function cropAt(bw, bh, a, cx, cy) {
  const [, , sw, sh] = cropToAspect(bw, bh, a);
  return [clamp(cx * bw - sw / 2, 0, bw - sw), clamp(cy * bh - sh / 2, 0, bh - sh), sw, sh];
}
/* cheap point of interest for a tile: centroid of colour distinctiveness + centre bias */
function interestPoint(b, cv) {
  const S2 = 16, x = cv.getContext('2d', { willReadFrequently: true });
  x.clearRect(0, 0, S2, S2); x.drawImage(b, 0, 0, S2, S2);
  const d = x.getImageData(0, 0, S2, S2).data; let mr = 0, mg = 0, mb = 0;
  for (let i = 0; i < d.length; i += 4) { mr += d[i]; mg += d[i + 1]; mb += d[i + 2]; }
  const n = S2 * S2; mr /= n; mg /= n; mb /= n;
  let sw = 0, sx = 0, sy = 0;
  for (let y = 0; y < S2; y++) for (let xx = 0; xx < S2; xx++) {
    const i = (y * S2 + xx) * 4, dx = (xx + 0.5) / S2 - 0.5, dy = (y + 0.5) / S2 - 0.5;
    const w = (Math.abs(d[i] - mr) + Math.abs(d[i + 1] - mg) + Math.abs(d[i + 2] - mb) + 8) * (1 - 1.2 * (dx * dx + dy * dy));
    sw += w; sx += w * (xx + 0.5) / S2; sy += w * (y + 0.5) / S2;
  }
  return [clamp(sx / sw, 0.3, 0.7), clamp(sy / sw, 0.3, 0.7)];
}
const ASPECTS = { '1:1': 1, '4:3': 4 / 3, '3:4': 3 / 4, 'hex': Math.sqrt(3) / 2 };

/* ── tile records (Blob ≤256px + mini ≤64px) ── */
async function scaledBlob(src, sw, sh, maxSide, q) {
  const s = Math.min(1, maxSide / Math.max(sw, sh));
  const w = Math.max(1, Math.round(sw * s)), h = Math.max(1, Math.round(sh * s));
  const c = mkCanvas(w, h), x = c.getContext('2d');
  x.imageSmoothingEnabled = true; x.imageSmoothingQuality = 'high';
  x.drawImage(src, 0, 0, w, h);
  return { c, w, h, blob: await canvasToBlob(c, 'image/jpeg', q) };
}
async function makeTileRecord(bmp, libId, sig) {
  let src = bmp, w = bmp.width, h = bmp.height;
  if (Math.max(w, h) > 1400) { const s = 1024 / Math.max(w, h); const c = mkCanvas(Math.round(w * s), Math.round(h * s)); const x = c.getContext('2d'); x.imageSmoothingQuality = 'high'; x.drawImage(bmp, 0, 0, c.width, c.height); src = c; w = c.width; h = c.height; }
  const big = await scaledBlob(src, w, h, 256, 0.86);
  const mini = await scaledBlob(big.c, big.w, big.h, 64, 0.8);
  return { id: uid(), libId, sig, w: big.w, h: big.h, blob: big.blob, mini: mini.blob, created: Date.now() };
}

async function newLibrary(name) {
  const lib = { id: uid(), name: name || T('libDefaultName', { d: df(Date.now()) }), created: Date.now(), updated: Date.now(), count: 0 };
  await DB.put('libs', lib); return lib;
}
async function refreshLibCount(libId) {
  const lib = await DB.get('libs', libId); if (!lib) return;
  lib.count = await DB.countLib(libId); lib.updated = Date.now(); await DB.put('libs', lib);
  LibCache.drop(libId);
  return lib;
}

/* import files into a library — 3 at a time, batched writes, cancellable */
async function importToLib(libId, files) {
  files = files.filter(isImageFile);
  if (!files.length) { toast(T('noImages'), true); return 0; }
  const existing = await DB.byLib(libId);
  const sigs = new Set(existing.map(t => t.sig));
  const p = Prog.show(T('importing'), true);
  let done = 0, added = 0, failed = 0, dup = 0, heicFail = 0, quota = false, i = 0;
  const batch = [];
  const flush = async () => {
    if (!batch.length) return;
    const b = batch.splice(0);
    try { await DB.putMany('tiles', b); added += b.length; }
    catch (e) { quota = true; p.cancelled = true; logErr('putMany: ' + (e && e.name)); }
  };
  const work = async f => {
    const sig = (f.name || '') + '|' + f.size + '|' + (f.lastModified || 0);
    if (sigs.has(sig)) { dup++; return; }
    sigs.add(sig);
    let bmp;
    try { bmp = await decodeImage(f); } catch (e) { failed++; if (isHeic(f)) heicFail++; return; }
    try { batch.push(await makeTileRecord(bmp, libId, sig)); } catch (e) { failed++; }
    finally { try { bmp.close(); } catch (e) {} }
  };
  const runner = async () => {
    while (i < files.length && !p.cancelled) {
      const f = files[i++];
      await work(f); done++;
      p.set(done / files.length, T('importedN', { n: nf(done), t: nf(files.length) }));
      if (batch.length >= 20) await flush();
    }
  };
  await Promise.all([runner(), runner(), runner()]);
  await flush();
  await refreshLibCount(libId);
  p.close();
  if (quota) toast(T('storageFull'), true);
  else if (heicFail) toast(T('heicFail', { n: heicFail }), true);
  else toast(T('importDone', { n: nf(added) }) + (dup ? ' · ' + T('dupSkipped', { n: nf(dup) }) : '') + (failed ? ' · ' + T('failedN', { n: nf(failed) }) : ''), !!failed && !added);
  return added;
}

/* ── demo content (procedural) — lets anyone try without photos ── */
function hsl(h, s, l) { return 'hsl(' + h + ',' + s + '%,' + l + '%)'; }
async function makeDemoLibrary() {
  const lib = await newLibrary(T('demoLib'));
  lib.demo = true; await DB.put('libs', lib);
  const p = Prog.show(T('makingDemo'), false);
  const specs = [];
  for (let hue = 0; hue < 360; hue += 24) for (const l of [18, 32, 46, 60, 74, 88]) specs.push([hue, 55 + (hue % 3) * 15, l]);
  for (const l of [6, 15, 25, 38, 52, 66, 80, 94]) specs.push([0, 0, l], [30, 12, l]);
  const recs = []; let rnd = 12345;
  const R = () => { rnd = (rnd * 16807) % 2147483647; return rnd / 2147483647; };
  for (let k = 0; k < specs.length; k++) {
    const [h, s, l] = specs[k];
    const c = mkCanvas(256, 192), x = c.getContext('2d');
    const gr = x.createLinearGradient(0, 0, 256 * R(), 192);
    gr.addColorStop(0, hsl(h, s, clamp(l + 10, 0, 100))); gr.addColorStop(1, hsl((h + 20) % 360, s, clamp(l - 10, 0, 100)));
    x.fillStyle = gr; x.fillRect(0, 0, 256, 192);
    const shapes = 3 + Math.floor(R() * 4);
    for (let j = 0; j < shapes; j++) {
      x.globalAlpha = 0.35 + R() * 0.3;
      x.fillStyle = hsl((h + (R() * 60 - 30) + 360) % 360, s, clamp(l + (R() * 30 - 15), 0, 100));
      const t = R();
      if (t < 0.5) { x.beginPath(); x.arc(R() * 256, R() * 192, 12 + R() * 50, 0, Math.PI * 2); x.fill(); }
      else if (t < 0.8) { x.fillRect(R() * 256, R() * 192, 20 + R() * 90, 10 + R() * 50); }
      else { x.beginPath(); x.moveTo(R() * 256, 192); x.lineTo(R() * 256, R() * 120); x.lineTo(R() * 256, 192); x.fill(); }
    }
    x.globalAlpha = 1;
    const blob = await canvasToBlob(c, 'image/jpeg', 0.85);
    const mini = await scaledBlob(c, 256, 192, 64, 0.8);
    recs.push({ id: uid(), libId: lib.id, sig: 'demo' + k, w: 256, h: 192, blob, mini: mini.blob, created: Date.now() });
    if (k % 20 === 0) { p.set(k / specs.length); await yieldUI(); }
  }
  await DB.putMany('tiles', recs);
  await refreshLibCount(lib.id);
  p.close();
  return lib;
}
async function makeDemoMain() {
  const W = 1200, H = 1500, c = mkCanvas(W, H), x = c.getContext('2d');
  const sky = x.createLinearGradient(0, 0, 0, H * 0.62);
  sky.addColorStop(0, '#1b1446'); sky.addColorStop(0.45, '#c2407a'); sky.addColorStop(0.8, '#ff9a3c'); sky.addColorStop(1, '#ffd36b');
  x.fillStyle = sky; x.fillRect(0, 0, W, H * 0.62);
  x.fillStyle = '#fff3c4'; x.beginPath(); x.arc(W * 0.5, H * 0.56, 170, 0, Math.PI * 2); x.fill();
  x.fillStyle = '#3a1e4f';
  x.beginPath(); x.moveTo(0, H * 0.62); x.lineTo(W * 0.18, H * 0.44); x.lineTo(W * 0.34, H * 0.56); x.lineTo(W * 0.52, H * 0.48); x.lineTo(W * 0.7, H * 0.58); x.lineTo(W * 0.86, H * 0.42); x.lineTo(W, H * 0.52); x.lineTo(W, H * 0.62); x.fill();
  const sea = x.createLinearGradient(0, H * 0.62, 0, H);
  sea.addColorStop(0, '#ff8a4c'); sea.addColorStop(0.25, '#7b3d7a'); sea.addColorStop(1, '#0d2a4f');
  x.fillStyle = sea; x.fillRect(0, H * 0.62, W, H);
  x.fillStyle = 'rgba(255,230,160,.55)';
  for (let i = 0; i < 14; i++) { const y = H * 0.64 + i * 26, w = 300 - i * 18; x.fillRect(W / 2 - w / 2, y, w, 7); }
  x.fillStyle = '#120c1c';
  x.beginPath(); x.moveTo(W * 0.12, H); x.quadraticCurveTo(W * 0.16, H * 0.8, W * 0.2, H * 0.68); x.lineTo(W * 0.215, H * 0.69); x.quadraticCurveTo(W * 0.19, H * 0.82, W * 0.17, H); x.fill();
  for (const [dx, dy] of [[-150, 30], [-120, -40], [120, -30], [150, 40], [0, -80]]) {
    x.beginPath(); x.moveTo(W * 0.205, H * 0.68); x.quadraticCurveTo(W * 0.205 + dx * 0.6, H * 0.68 + dy - 50, W * 0.205 + dx, H * 0.68 + dy + 40); x.quadraticCurveTo(W * 0.205 + dx * 0.5, H * 0.68 + dy - 20, W * 0.205, H * 0.68); x.fill();
  }
  const bmp = await createImageBitmap(c);
  return bmp;
}

/* ── library cache (decoded minis per library) ── */
const LibCache = {
  id: null, tiles: null, minis: null,
  drop(id) { if (!id || this.id === id) { if (this.minis) this.minis.forEach(b => { try { b.close(); } catch (e) {} }); this.id = null; this.tiles = null; this.minis = null; this.tc = null; } },
  async load(libId, p) {
    if (this.id === libId && this.tiles) return this;
    this.drop();
    const tiles = await DB.byLib(libId);
    const minis = new Array(tiles.length);
    let i = 0, done = 0;
    const run = async () => {
      while (i < tiles.length) {
        const k = i++;
        try { minis[k] = await createImageBitmap(tiles[k].mini); } catch (e) { minis[k] = null; }
        done++; if (p && done % 25 === 0) p.set(done / tiles.length * 0.25, T('loadingTiles', { n: nf(done), t: nf(tiles.length) }));
      }
    };
    await Promise.all([run(), run(), run(), run()]);
    const keep = []; const km = [];
    tiles.forEach((t, k) => { if (minis[k]) { keep.push(t); km.push(minis[k]); } });
    const tc = new Float32Array(km.length * 2), cv = mkCanvas(16, 16);
    km.forEach((b, k) => { const [cx, cy] = interestPoint(b, cv); tc[k * 2] = cx; tc[k * 2 + 1] = cy; });
    this.id = libId; this.tiles = keep; this.minis = km; this.tc = tc;
    return this;
  }
};

/* tile features for a given cell aspect (+ mirrored copies) */
async function tileFeatures(minis, a, allowFlip, tc) {
  const N = minis.length, M = allowFlip ? N * 2 : N;
  const feats = new Float32Array(M * FD), tileOf = new Int32Array(M), flipOf = new Uint8Array(M);
  const c = mkCanvas(24, 24), x = c.getContext('2d', { willReadFrequently: true });
  x.imageSmoothingEnabled = true; x.imageSmoothingQuality = 'high';
  for (let i = 0; i < N; i++) {
    const b = minis[i], [sx, sy, sw, sh] = tc ? cropAt(b.width, b.height, a, tc[i * 2], tc[i * 2 + 1]) : cropToAspect(b.width, b.height, a);
    x.clearRect(0, 0, 24, 24); x.drawImage(b, sx, sy, sw, sh, 0, 0, 24, 24);
    blockFeatures(x.getImageData(0, 0, 24, 24).data, 24, 24, feats, i * FD);
    tileOf[i] = i;
    if (allowFlip) { mirrorFeat(feats, i * FD, feats, (N + i) * FD); tileOf[N + i] = i; flipOf[N + i] = 1; }
    if (i % 200 === 199) await yieldUI();
  }
  return { feats, tileOf, flipOf, N, M };
}

/* grid geometry + target features.
   Square grid: cell (cx,cy) at (cx·cw, cy·ch).
   Hex grid (pointy-top, regular): odd rows shifted half a cell, rows 3/4 apart; the visible canvas is
   cropped so that every pixel is covered (left/top edges start inside the first cells). Units: ch = 1, cw = a. */
const HEX_A = Math.sqrt(3) / 2;
function gridFor(mainW, mainH, cols, key) {
  const hex = key === 'hex', a = ASPECTS[key] || 1;
  let rows, vw, vh;
  if (hex) { rows = Math.max(2, Math.round(((cols - 0.5) * a * mainH / mainW + 0.25) / 0.75)); vw = (cols - 0.5) * a; vh = 0.75 * rows - 0.25; }
  else { rows = Math.max(1, Math.round(mainH / (mainW / cols / a))); vw = cols * a; vh = rows; }
  const gar = vw / vh;
  let sw, sh; if (mainW / mainH > gar) { sh = mainH; sw = mainH * gar; } else { sw = mainW; sh = mainW / gar; }
  return { cols, rows, a, hex, src: { x: (mainW - sw) / 2, y: (mainH - sh) / 2, w: sw, h: sh } };
}
function cellPos(m, i, cw, ch) { const cx = i % m.cols, cy = (i / m.cols) | 0; return m.hex ? [(cx + (cy & 1) * 0.5 - 0.5) * cw, (cy * 0.75 - 0.25) * ch] : [cx * cw, cy * ch]; }
function canvasSize(m, cw, ch) { return m.hex ? [Math.round((m.cols - 0.5) * cw), Math.round((0.75 * m.rows - 0.25) * ch)] : [m.cols * cw, m.rows * ch]; }
function gridUnits(m) { return m.hex ? [(m.cols - 0.5) * m.a, 0.75 * m.rows - 0.25] : [m.cols * m.a, m.rows]; }
function cellAt(m, ux, uy, cw, ch) { // canvas px → cell index (or -1)
  if (!m.hex) { const cx = Math.floor(ux / cw), cy = Math.floor(uy / ch); return (cx < 0 || cy < 0 || cx >= m.cols || cy >= m.rows) ? -1 : cy * m.cols + cx; }
  const cy0 = Math.floor((uy / ch + 0.25) / 0.75); let best = -1, bd = 1e18;
  for (let cy = cy0 - 1; cy <= cy0 + 1; cy++) {
    if (cy < 0 || cy >= m.rows) continue;
    const cx0 = Math.floor(ux / cw + 0.5 - (cy & 1) * 0.5);
    for (let cx = cx0 - 1; cx <= cx0 + 1; cx++) {
      if (cx < 0 || cx >= m.cols) continue;
      const i = cy * m.cols + cx, [px, py] = cellPos(m, i, cw, ch), dx = (ux - px - cw / 2) / cw, dy = (uy - py - ch / 2) / ch, d = dx * dx + dy * dy;
      if (d < bd) { bd = d; best = i; }
    }
  }
  return bd < 0.6 ? best : -1;
}
function targetFeatures(main, g) {
  const U = G * 4; // 12 sample px per cell height and per cell width
  const exW = g.hex ? g.cols + 0.5 : g.cols, exH = g.hex ? 0.75 * (g.rows - 1) + 1 : g.rows;
  const W = Math.round(exW * U), H = Math.round(exH * U);
  const vx = g.hex ? U / 2 : 0, vy = g.hex ? U / 4 : 0, vw = g.hex ? (g.cols - 0.5) * U : W, vh = g.hex ? (0.75 * g.rows - 0.25) * U : H;
  const c = mkCanvas(W, H), x = c.getContext('2d', { willReadFrequently: true });
  x.imageSmoothingEnabled = true; x.imageSmoothingQuality = 'high';
  if (g.hex) x.drawImage(main, g.src.x, g.src.y, g.src.w, g.src.h, 0, 0, W, H); // edge padding for cells that stick out
  x.drawImage(main, g.src.x, g.src.y, g.src.w, g.src.h, vx, vy, vw, vh);
  const data = x.getImageData(0, 0, W, H).data;
  const C = g.cols * g.rows, feats = new Float32Array(C * FD), rgb = new Uint8Array(C * 3);
  const buf = new Uint8ClampedArray(U * U * 4);
  for (let cy = 0; cy < g.rows; cy++) for (let cx = 0; cx < g.cols; cx++) {
    const x0 = Math.min(W - U, Math.round(g.hex ? (cx + (cy & 1) * 0.5) * U : cx * U)), y0 = Math.min(H - U, Math.round(g.hex ? cy * 0.75 * U : cy * U));
    for (let y = 0; y < U; y++) { const s0 = ((y0 + y) * W + x0) * 4; buf.set(data.subarray(s0, s0 + U * 4), y * U * 4); }
    const ci = cy * g.cols + cx;
    blockFeatures(buf, U, U, feats, ci * FD, rgb, ci * 3);
  }
  return { feats, rgb };
}

/* ── matcher (runs in a Worker; same function is the main-thread fallback) ── */
function matchCore(d, onProg) {
  const { tf, tileOf, N, cf, C, cols, maxRep, R, seed, mask } = d;
  const D = 27, M = tileOf.length, K = Math.min(M, 40);
  let s = seed >>> 0 || 1; const rnd = () => { s ^= s << 13; s >>>= 0; s ^= s >> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
  const order = new Int32Array(C); for (let i = 0; i < C; i++) order[i] = i;
  for (let i = C - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); const t = order[i]; order[i] = order[j]; order[j] = t; }
  const uses = new Int32Array(N), pos = new Array(N); for (let i = 0; i < N; i++) pos[i] = [];
  const assign = new Int32Array(C).fill(-1), topI = new Int32Array(K), topD = new Float64Array(K);
  const near = (t, cx, cy) => { const p = pos[t]; for (let k = 0; k < p.length; k++) { const q = p[k], qx = q % cols, qy = (q / cols) | 0; if (Math.abs(qx - cx) <= R && Math.abs(qy - cy) <= R) return true; } return false; };
  const dist = (base, e, lim) => {
    let dd = 0; const o = e * D;
    for (let k = 0; k < D; k += 9) {
      for (let j = 0; j < 9; j++) { const t = cf[base + k + j] - tf[o + k + j]; dd += t * t; }
      if (dd >= lim) return dd;
    }
    return dd;
  };
  for (let ci = 0; ci < C; ci++) {
    const c = order[ci]; if (mask && !mask[c]) continue;
    const base = c * D, cx = c % cols, cy = (c / cols) | 0;
    let cnt = 0;
    for (let e = 0; e < M; e++) {
      const lim = cnt === K ? topD[K - 1] : Infinity;
      const dd = dist(base, e, lim);
      if (dd >= lim) continue;
      let j = cnt < K ? cnt++ : K - 1;
      while (j > 0 && topD[j - 1] > dd) { topD[j] = topD[j - 1]; topI[j] = topI[j - 1]; j--; }
      topD[j] = dd; topI[j] = e;
    }
    let ch = -1;
    for (let j = 0; j < cnt; j++) { const t = tileOf[topI[j]]; if (uses[t] >= maxRep) continue; if (R > 0 && near(t, cx, cy)) continue; ch = topI[j]; break; }
    if (ch < 0) { // relax step by step: full scan with all rules → without distance rule → best overall
      for (let pass = 0; pass < 2 && ch < 0; pass++) {
        let best = Infinity;
        for (let e = 0; e < M; e++) {
          const t = tileOf[e]; if (uses[t] >= maxRep) continue; if (pass === 0 && R > 0 && near(t, cx, cy)) continue;
          const dd = dist(base, e, best); if (dd < best) { best = dd; ch = e; }
        }
      }
      if (ch < 0) ch = topI[0];
    }
    assign[c] = ch; const t = tileOf[ch]; uses[t]++; pos[t].push(c);
    if (onProg && (ci & 511) === 0) onProg(ci / C);
  }
  return assign;
}
const WORKER_SRC = matchCore.toString() + '\nonmessage=function(e){var a=matchCore(e.data,function(p){postMessage({t:"p",p:p})});postMessage({t:"d",a:a},[a.buffer]);};';
let _workerURL = null;
function runMatch(data, p) {
  return new Promise((res, rej) => {
    let w = null;
    try { if (!_workerURL) _workerURL = URL.createObjectURL(new Blob([WORKER_SRC], { type: 'text/javascript' })); w = new Worker(_workerURL); } catch (e) { w = null; }
    if (!w) { // fallback: same code on main thread
      setTimeout(() => { try { res(matchCore(data, null)); } catch (e) { rej(e); } }, 30);
      return;
    }
    const iv = setInterval(() => { if (p.cancelled) { clearInterval(iv); w.terminate(); rej(new Error('cancel')); } }, 150);
    w.onmessage = e => {
      if (e.data.t === 'p') p.set(0.35 + e.data.p * 0.55, T('matching', { p: Math.round(e.data.p * 100) }));
      else { clearInterval(iv); w.terminate(); res(e.data.a); }
    };
    w.onerror = e => { clearInterval(iv); w.terminate(); logErr('worker: ' + (e.message || '')); try { res(matchCore(data, null)); } catch (er) { rej(er); } };
    w.postMessage(data);
  });
}

/* ── rendering (same function for preview, zoomed view and export = WYSIWYG) ── */
function cellPath(x, m, X, Y, W, H, st) {
  x.beginPath();
  if (m.hex) { const e = st.grout > 0 ? 0 : 0.6; x.moveTo(X + W / 2, Y - e); x.lineTo(X + W + e, Y + H / 4); x.lineTo(X + W + e, Y + H * 3 / 4); x.lineTo(X + W / 2, Y + H + e); x.lineTo(X - e, Y + H * 3 / 4); x.lineTo(X - e, Y + H / 4); x.closePath(); }
  else if (st.shape === 'circle') x.ellipse(X + W / 2, Y + H / 2, W / 2, H / 2, 0, 0, Math.PI * 2);
  else if (st.shape === 'rounded' && x.roundRect) x.roundRect(X, Y, W, H, Math.min(W, H) * 0.2);
  else x.rect(X, Y, W, H);
}
function drawCell(x, m, i, px, py, w, h, bmp, st, FW, FH) {
  const e = m.assign[i]; if (e < 0 || !bmp) return;
  const g = st.grout > 0 ? Math.max(0.5, st.grout * Math.min(w, h) / 60) : 0;
  const X = px + g / 2, Y = py + g / 2, W = w - g, H = h - g;
  const t = m.tileOf[e], [sx, sy, sw, sh] = m.tc ? cropAt(bmp.width, bmp.height, m.a, m.tc[t * 2], m.tc[t * 2 + 1]) : cropToAspect(bmp.width, bmp.height, m.a);
  x.save();
  if (m.hex || st.shape !== 'square') { cellPath(x, m, X, Y, W, H, st); x.clip(); }
  if (m.flipOf[e]) { x.save(); x.translate(X + W, Y); x.scale(-1, 1); x.drawImage(bmp, sx, sy, sw, sh, 0, 0, W, H); x.restore(); }
  else x.drawImage(bmp, sx, sy, sw, sh, X, Y, W, H);
  if (st.tint > 0) { const r = m.rgb; x.globalAlpha = st.tint / 100; x.fillStyle = 'rgb(' + r[i * 3] + ',' + r[i * 3 + 1] + ',' + r[i * 3 + 2] + ')'; x.fillRect(X, Y, W, H); }
  if (st.overlay > 0 && m.main && FW) { // the matching piece of the main photo (same mapping at every size)
    const s = m.src; x.globalAlpha = st.overlay / 100;
    x.drawImage(m.main, s.x + X / FW * s.w, s.y + Y / FH * s.h, W / FW * s.w, H / FH * s.h, X, Y, W, H);
  }
  x.restore();
}
function paintBackground(x, W, H, st, m) {
  if (m && m.mask) { x.fillStyle = st.shapeBg || '#ffffff'; x.fillRect(0, 0, W, H); return; }
  x.fillStyle = (st.grout > 0 || st.shape !== 'square' || (m && m.hex)) ? st.groutColor : '#000';
  x.fillRect(0, 0, W, H);
}
/* build preview composite from minis */
function buildComposite(m, st) {
  const [uw, uh] = gridUnits(m);
  const P = clamp(Math.floor(2400 / Math.max(uw, uh)), 8, 48);
  const cw = Math.max(2, Math.round(P * m.a)), ch = P, [W, H] = canvasSize(m, cw, ch);
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const x = c.getContext('2d'); x.imageSmoothingEnabled = true; x.imageSmoothingQuality = 'high';
  paintBackground(x, W, H, st, m);
  for (let i = 0; i < m.assign.length; i++) { const [px, py] = cellPos(m, i, cw, ch); drawCell(x, m, i, px, py, cw, ch, m.minis[m.tileOf[m.assign[i]]], st, W, H); }
  m.comp = c; m.cw = cw; m.ch = ch;
  return c;
}
function updateCompositeCell(m, i, st) {
  const x = m.comp.getContext('2d'), [px, py] = cellPos(m, i, m.cw, m.ch);
  x.save(); cellPath(x, m, px, py, m.cw, m.ch, Object.assign({}, st, { shape: 'square', grout: 1 })); x.clip();
  paintBackground(x, m.comp.width, m.comp.height, st, m); x.restore();
  drawCell(x, m, i, px, py, m.cw, m.ch, m.minis[m.tileOf[m.assign[i]]], st, m.comp.width, m.comp.height);
}
/* export size for a long side (integer cells → no seams) */
function exportDims(m, long) {
  const [uw, uh] = gridUnits(m), unit = long / Math.max(uw, uh);
  let ch = Math.max(2, Math.round(unit)), cw = Math.max(2, Math.round(unit * m.a));
  const maxArea = isCoarse() ? 24e6 : 64e6;
  let [W, H] = canvasSize(m, cw, ch);
  while (W * H > maxArea && ch > 2) { ch--; cw = Math.max(2, Math.round(ch * m.a)); [W, H] = canvasSize(m, cw, ch); }
  return { cw, ch, W, H };
}
/* full-quality export: decode each 256px tile once, draw all of its cells, release */
async function renderExport(m, st, long, p, sign) {
  const d = exportDims(m, long);
  const c = document.createElement('canvas'); c.width = d.W; c.height = d.H;
  const x = c.getContext('2d'); if (!x) throw new Error('canvas');
  x.imageSmoothingEnabled = true; x.imageSmoothingQuality = 'high';
  paintBackground(x, d.W, d.H, st, m);
  const byTile = new Map();
  for (let i = 0; i < m.assign.length; i++) { if (m.assign[i] < 0) continue; const t = m.tileOf[m.assign[i]]; if (!byTile.has(t)) byTile.set(t, []); byTile.get(t).push(i); }
  let k = 0; const n = byTile.size;
  for (const [t, cells] of byTile) {
    if (p && p.cancelled) throw new Error('cancel');
    let b = null;
    try { b = await createImageBitmap(m.tiles[t].blob); } catch (e) { b = m.minis[t]; }
    for (const i of cells) { const [px, py] = cellPos(m, i, d.cw, d.ch); drawCell(x, m, i, px, py, d.cw, d.ch, b, st, d.W, d.H); }
    if (b !== m.minis[t]) try { b.close(); } catch (e) {}
    k++; if (p && k % 20 === 0) { p.set(k / n * 0.9, T('renderingN', { n: nf(k), t: nf(n) })); await yieldUI(); }
  }
  if (sign && S.name) drawSignature(x, d.W, d.H);
  return { c, W: d.W, H: d.H };
}
function drawSignature(x, W, H) {
  const fs = Math.max(14, Math.round(Math.min(W, H) * 0.022));
  x.save(); x.font = '600 ' + fs + 'px ' + getComputedStyle(document.body).fontFamily;
  const txt = S.name + ' · CollageNest';
  const tw = x.measureText(txt).width, pad = fs * 0.5;
  x.globalAlpha = 0.55; x.fillStyle = '#000';
  x.fillRect(W - tw - pad * 3, H - fs - pad * 3, tw + pad * 2, fs + pad * 1.6);
  x.globalAlpha = 0.95; x.fillStyle = '#fff'; x.textBaseline = 'top';
  x.fillText(txt, W - tw - pad * 2, H - fs - pad * 2.2);
  x.restore();
}
async function encodeCanvas(c, fmt) {
  const type = fmt === 'png' ? 'image/png' : 'image/jpeg';
  return await canvasToBlob(c, type, 0.92);
}
async function thumbOf(src, sw, sh) { return (await scaledBlob(src, sw, sh, 360, 0.82)).blob; }

(window.__MODS = window.__MODS || {})['cn-core.js'] = '1.5.0';
