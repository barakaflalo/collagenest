/* CollageNest 1.5.0 · cn-collage.js — collage, projects/text/share, events + puzzle */
/* ═══ CollageNest — shared export flow + grid collage (templates, pan/zoom per cell, swap) ═══ */

/* generic export: size + format (+signature) → download / share / save to gallery */
function exportFlow(o) {
  const sizes = o.sizes;
  const dimTxt = k => { const d = o.dims(sizes[k]); return nf(d.W) + '×' + nf(d.H); };
  const md = openModal({
    title: T('exportTitle'),
    html: '<label class="f">' + esc(T('size')) + '</label><div class="seg" id="exSize">' +
      Object.keys(sizes).map(k => '<button type="button" data-v="' + k + '" class="' + (o.sizeKey() === k ? 'on' : '') + '">' + esc(k.toUpperCase()) + '<br><small class="muted">' + dimTxt(k) + '</small></button>').join('') + '</div>' +
      (isCoarse() ? '<div class="small muted" style="margin-top:6px">' + esc(T('phoneLimit')) + '</div>' : '') +
      '<label class="f">' + esc(T('format')) + '</label><div class="seg" id="exFmt">' + ['jpg', 'png'].map(f => '<button type="button" data-v="' + f + '" class="' + (S.fmt === f ? 'on' : '') + '">' + f.toUpperCase() + '</button>').join('') + '</div>' +
      '<div class="small muted" style="margin-top:6px">' + esc(T('fmtHint')) + '</div>' +
      (S.name ? '<div class="sw" style="margin-top:8px"><span>' + esc(T('addSignature')) + '</span><label class="toggle"><input type="checkbox" id="exSign" ' + (S.sign ? 'checked' : '') + ' aria-label="' + esc(T('addSignature')) + '"><span></span></label></div>' : ''),
    actions: [
      { label: '⬇️ ' + T('download'), cls: 'primary', keep: true, onClick: () => run('download') },
      { label: '📤 ' + T('share'), cls: '', keep: true, onClick: () => run('share') },
      { label: '💾 ' + T('saveGallery'), cls: '', keep: true, onClick: () => run('gallery') },
      { label: '🖨️ ' + T('printWall'), cls: 'ghost', onClick: () => { setTimeout(() => printWall(o), 50); } }
    ].concat((o.extra || []).map(a => ({ label: a.label, cls: 'ghost', onClick: () => { setTimeout(a.run, 50); } })))
  });
  md.body.querySelectorAll('#exSize button').forEach(b => b.onclick = () => { o.setSize(b.dataset.v); saveS(); md.body.querySelectorAll('#exSize button').forEach(z => z.classList.toggle('on', z === b)); });
  md.body.querySelectorAll('#exFmt button').forEach(b => b.onclick = () => { S.fmt = b.dataset.v; saveS(); md.body.querySelectorAll('#exFmt button').forEach(z => z.classList.toggle('on', z === b)); });
  if ($('exSign')) $('exSign').onchange = e => { S.sign = e.target.checked; saveS(); };
  async function run(kind) {
    const p = Prog.show(T('rendering'), true);
    let long = sizes[o.sizeKey()] || 4096, out = null;
    for (let tries = 0; tries < 3 && !out; tries++) {
      try {
        const r = await o.render(long, p);
        p.set(0.95, T('encoding')); await yieldUI();
        const blob = await encodeCanvas(r.c, S.fmt);
        r.c.width = r.c.height = 1;
        out = { blob, W: r.W, H: r.H };
      } catch (e) {
        if (e && e.message === 'cancel') { p.close(); toast(T('cancelled')); return; }
        logErr('export ' + long + ': ' + (e && e.message)); long = Math.round(long * 0.6);
        if (tries < 2) toast(T('exportRetry'), true);
      }
    }
    if (!out) { p.close(); toast(T('exportFail'), true); return; }
    const fname = 'CollageNest-' + o.kind + '-' + fileStamp() + '.' + (S.fmt === 'png' ? 'png' : 'jpg');
    if (kind === 'gallery') {
      p.set(0.98, T('saving'));
      try {
        await DB.put('gallery', { id: uid(), kind: o.kind, name: o.name(), created: Date.now(), W: out.W, H: out.H, fmt: S.fmt, blob: out.blob, thumb: await o.thumb() });
        if (o.onSaved) o.onSaved();
        p.close(); toast(T('savedGallery'));
      } catch (e) { p.close(); toast(T('storageFull'), true); }
      return;
    }
    p.close();
    if (kind === 'share') await shareBlob(out.blob, fname);
    else { downloadBlob(out.blob, fname); toast(T('downloaded', { w: nf(out.W), h: nf(out.H) })); }
  }
}

/* ── templates (fractions of the canvas) ── */
function gridTpl(c, r) { const a = []; for (let y = 0; y < r; y++) for (let x = 0; x < c; x++) a.push([x / c, y / r, 1 / c, 1 / r]); return a; }
const TPL = [
  gridTpl(1, 1),
  gridTpl(2, 1), gridTpl(1, 2),
  gridTpl(3, 1), gridTpl(1, 3),
  [[0, 0, .6, 1], [.6, 0, .4, .5], [.6, .5, .4, .5]],
  [[0, 0, 1, .6], [0, .6, .5, .4], [.5, .6, .5, .4]],
  gridTpl(2, 2),
  [[0, 0, .64, 1], [.64, 0, .36, 1 / 3], [.64, 1 / 3, .36, 1 / 3], [.64, 2 / 3, .36, 1 / 3]],
  [[0, 0, 1, .62], [0, .62, 1 / 3, .38], [1 / 3, .62, 1 / 3, .38], [2 / 3, .62, 1 / 3, .38]],
  [[0, 0, .5, .5], [.5, 0, .5, .5], [0, .5, 1 / 3, .5], [1 / 3, .5, 1 / 3, .5], [2 / 3, .5, 1 / 3, .5]],
  [[0, 0, .6, .6], [.6, 0, .4, .3], [.6, .3, .4, .3], [0, .6, .5, .4], [.5, .6, .5, .4]],
  gridTpl(3, 2), gridTpl(2, 3),
  [[0, 0, 2 / 3, 2 / 3], [2 / 3, 0, 1 / 3, 1 / 3], [2 / 3, 1 / 3, 1 / 3, 1 / 3], [0, 2 / 3, 1 / 3, 1 / 3], [1 / 3, 2 / 3, 1 / 3, 1 / 3], [2 / 3, 2 / 3, 1 / 3, 1 / 3]],
  [[0, 0, 1 / 3, .5], [1 / 3, 0, 1 / 3, .5], [2 / 3, 0, 1 / 3, .5], [0, .5, .25, .5], [.25, .5, .25, .5], [.5, .5, .25, .5], [.75, .5, .25, .5]],
  gridTpl(4, 2), gridTpl(2, 4),
  gridTpl(3, 3),
  [[.25, .25, .5, .5], [0, 0, .25, .25], [.25, 0, .25, .25], [.5, 0, .25, .25], [.75, 0, .25, .25], [0, .25, .25, .25], [.75, .25, .25, .25], [0, .5, .25, .25], [.75, .5, .25, .25], [0, .75, .25, .25], [.25, .75, .25, .25], [.5, .75, .25, .25], [.75, .75, .25, .25]],
  gridTpl(4, 3), gridTpl(3, 4),
  gridTpl(4, 4)
];
const RATIOS = { '1:1': 1, '4:5': 0.8, '3:4': 0.75, '9:16': 9 / 16, '16:9': 16 / 9, '4:3': 4 / 3 };
const MAX_COLLAGE = 16;
function bestTpl(n) {
  let best = 0, bd = 1e9;
  TPL.forEach((t, i) => { const d = t.length >= n ? t.length - n : (n - t.length) * 3; if (d < bd) { bd = d; best = i; } });
  return best;
}
function tplSVG(t) {
  return '<svg viewBox="0 0 100 100" aria-hidden="true">' + t.map(r => '<rect x="' + (r[0] * 100 + 3) + '" y="' + (r[1] * 100 + 3) + '" width="' + (r[2] * 100 - 6) + '" height="' + (r[3] * 100 - 6) + '" rx="6" fill="currentColor" opacity=".55"/>').join('') + '</svg>';
}

let CS = null; // collage session
async function decodeForCollage(files, n) {
  const maxSide = clamp(Math.round(3600 / Math.sqrt(Math.max(1, n))), 900, 2048);
  const out = [];
  const p = Prog.show(T('loadingPhotos'), true);
  for (let i = 0; i < files.length && !p.cancelled; i++) {
    try {
      let b = await decodeImage(files[i]);
      if (Math.max(b.width, b.height) > maxSide) {
        const s = maxSide / Math.max(b.width, b.height), c = mkCanvas(Math.round(b.width * s), Math.round(b.height * s));
        const x = c.getContext('2d'); x.imageSmoothingQuality = 'high'; x.drawImage(b, 0, 0, c.width, c.height); b.close(); b = await createImageBitmap(c);
      }
      out.push(b);
    } catch (e) { toast(isHeic(files[i]) ? T('heicFail', { n: 1 }) : T('decodeFail'), true); }
    p.set((i + 1) / files.length, nf(i + 1) + ' / ' + nf(files.length));
  }
  p.close();
  return out;
}
async function newCollage(given) {
  let files = (given && given.length ? given : await pickFiles('many')).filter(isImageFile);
  if (!files.length) return;
  if (files.length > MAX_COLLAGE) { toast(T('collageMax', { n: MAX_COLLAGE }), true); files = files.slice(0, MAX_COLLAGE); }
  const bmps = await decodeForCollage(files, files.length);
  if (!bmps.length) return;
  if (CS) CS.photos.forEach(b => { try { b.close(); } catch (e) {} });
  const ti = bestTpl(bmps.length);
  CS = { photos: bmps, tpl: ti, cells: [], sel: -1, swap: -1, saved: false, text: newText(), projectId: null };
  layoutCells();
  go('collageEd');
}
function layoutCells() {
  const t = TPL[CS.tpl], old = CS.cells;
  CS.cells = t.map((r, i) => old[i] ? old[i] : { p: -1, z: 1, ox: 0, oy: 0 });
  const used = new Set(CS.cells.map(c => c.p).filter(p => p >= 0));
  let next = 0;
  CS.cells.forEach(c => { if (c.p < 0 || c.p >= CS.photos.length) { while (next < CS.photos.length && used.has(next)) next++; if (next < CS.photos.length) { c.p = next; used.add(next); c.z = 1; c.ox = c.oy = 0; } else c.p = -1; } });
  if (CS.sel >= CS.cells.length) CS.sel = -1;
}
function cellRects(W, H) {
  const st = S.collage, g = st.gap * Math.min(W, H) / 200;
  return TPL[CS.tpl].map(r => {
    const x = g + r[0] * (W - g), y = g + r[1] * (H - g);
    return [x, y, r[2] * (W - g) - g, r[3] * (H - g) - g];
  });
}
function drawCollage(x, W, H, preview) {
  const st = S.collage, rad = st.radius * Math.min(W, H) / 200;
  x.fillStyle = st.bg; x.fillRect(0, 0, W, H);
  x.imageSmoothingEnabled = true; x.imageSmoothingQuality = 'high';
  cellRects(W, H).forEach((r, i) => {
    const c = CS.cells[i], [cx, cy, cw, ch] = r;
    if (cw <= 0 || ch <= 0) return;
    x.save(); x.beginPath();
    if (rad > 0 && x.roundRect) x.roundRect(cx, cy, cw, ch, Math.min(rad, cw / 2, ch / 2)); else x.rect(cx, cy, cw, ch);
    x.clip();
    const b = c.p >= 0 ? CS.photos[c.p] : null;
    if (b) {
      const s = Math.max(cw / b.width, ch / b.height) * c.z, dw = b.width * s, dh = b.height * s;
      x.drawImage(b, cx + (cw - dw) / 2 + c.ox * (dw - cw) / 2, cy + (ch - dh) / 2 + c.oy * (dh - ch) / 2, dw, dh);
    } else if (preview) {
      x.fillStyle = 'rgba(128,128,128,.25)'; x.fillRect(cx, cy, cw, ch);
      x.fillStyle = 'rgba(128,128,128,.9)'; x.font = Math.round(Math.min(cw, ch) * 0.3) + 'px sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle';
      x.fillText('+', cx + cw / 2, cy + ch / 2);
    }
    x.restore();
    if (preview && (i === CS.sel || i === CS.swap)) {
      x.save(); x.lineWidth = Math.max(3, Math.min(W, H) * 0.008); x.strokeStyle = i === CS.swap ? '#ff9f43' : (getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || '#d4af37');
      x.setLineDash(i === CS.swap ? [12, 8] : []); x.strokeRect(cx + 1, cy + 1, cw - 2, ch - 2); x.restore();
    }
  });
  drawTitle(x, W, H, CS.text);
}
function collageDims(long) { const a = RATIOS[S.collage.ratio] || 1; return a >= 1 ? { W: long, H: Math.round(long / a) } : { W: Math.round(long * a), H: long }; }

const CEd = {
  open() {
    const ed = $('editor');
    ed.innerHTML = '<header class="top"><button class="homebtn" id="ceBack" type="button">' + (isRTL() ? '→ ' : '← ') + esc(T('back')) + '</button><h1>' + esc(T('collage')) + '</h1></header>' +
      '<div class="stage" id="cstage" style="background:var(--bg)"><canvas id="ceCv" aria-label="' + esc(T('collageCanvas')) + '"></canvas><div class="hint" id="ceHint"></div></div>' +
      '<div class="dock"><div class="panel" id="cePanel"></div><div class="acts" id="ceActs"></div></div>';
    ed.classList.remove('hidden');
    this.cv = $('ceCv'); this.x = this.cv.getContext('2d'); this.panel = null;
    $('ceBack').onclick = () => history.back();
    if (this.ro) this.ro.disconnect();
    this.ro = new ResizeObserver(() => this.resize()); this.ro.observe($('cstage'));
    this.bind(); this.resize(); this.dockUI();
  },
  close() { if (this.ro) this.ro.disconnect(); this.ro = null; $('editor').classList.add('hidden'); $('editor').innerHTML = ''; },
  resize() {
    const st = $('cstage'); if (!st) return;
    const r = st.getBoundingClientRect(), a = RATIOS[S.collage.ratio] || 1, pad = 14;
    let w = r.width - pad * 2, h = w / a; if (h > r.height - pad * 2) { h = r.height - pad * 2; w = h * a; }
    this.dpr = Math.min(3, devicePixelRatio || 1); this.w = w; this.h = h;
    Object.assign(this.cv.style, { inset: 'auto', width: w + 'px', height: h + 'px', left: (r.width - w) / 2 + 'px', top: (r.height - h) / 2 + 'px', boxShadow: 'var(--shadow)' });
    this.cv.width = Math.round(w * this.dpr); this.cv.height = Math.round(h * this.dpr);
    this.paint();
  },
  paint() { if (!this.x) return; this.x.setTransform(this.dpr, 0, 0, this.dpr, 0, 0); drawCollage(this.x, this.w, this.h, true); if (CS && CS.saved === false) markCollageDirty(); },
  hit(px, py) { const rs = cellRects(this.w, this.h); for (let i = 0; i < rs.length; i++) { const [x, y, w, h] = rs[i]; if (px >= x && py >= y && px <= x + w && py <= y + h) return i; } return -1; },
  bind() {
    const el = this.cv, P = new Map(); let g = null;
    el.style.touchAction = 'none';
    el.addEventListener('pointerdown', e => {
      el.setPointerCapture(e.pointerId); P.set(e.pointerId, { x: e.offsetX, y: e.offsetY });
      const c = CS.sel >= 0 ? CS.cells[CS.sel] : null;
      if (P.size === 1) g = { k: 1, x: e.offsetX, y: e.offsetY, t: Date.now(), moved: false, ox: c && c.ox, oy: c && c.oy, onSel: this.hit(e.offsetX, e.offsetY) === CS.sel && CS.sel >= 0 };
      else if (P.size === 2 && c && c.p >= 0) { const [a, b] = [...P.values()]; g = { k: 2, d: Math.hypot(a.x - b.x, a.y - b.y) || 1, z: c.z, moved: true }; }
    });
    el.addEventListener('pointermove', e => {
      if (!P.has(e.pointerId) || !g) return;
      P.set(e.pointerId, { x: e.offsetX, y: e.offsetY });
      const c = CS.sel >= 0 ? CS.cells[CS.sel] : null;
      if (g.k === 1 && P.size === 1) {
        const dx = e.offsetX - g.x, dy = e.offsetY - g.y;
        if (Math.abs(dx) + Math.abs(dy) > 6) g.moved = true;
        if (g.moved && g.onSel && c && c.p >= 0) {
          const [, , cw, ch] = cellRects(this.w, this.h)[CS.sel], b = CS.photos[c.p];
          const s = Math.max(cw / b.width, ch / b.height) * c.z, ex = (b.width * s - cw) / 2, ey = (b.height * s - ch) / 2;
          c.ox = ex > 0 ? clamp(g.ox + dx / ex, -1, 1) : 0; c.oy = ey > 0 ? clamp(g.oy + dy / ey, -1, 1) : 0;
          CS.saved = false; this.paint();
        }
      } else if (g.k === 2 && c) {
        const [a, b] = [...P.values()]; c.z = clamp(g.z * (Math.hypot(a.x - b.x, a.y - b.y) || 1) / g.d, 1, 4); CS.saved = false;
        const zr = $('ceZoom'); if (zr) zr.value = c.z; this.paint();
      }
    });
    const end = e => {
      if (!P.has(e.pointerId)) return; P.delete(e.pointerId);
      if (g && g.k === 1 && !g.moved && e.type === 'pointerup' && Date.now() - g.t < 450) this.tap(e.offsetX, e.offsetY);
      if (!P.size) g = null;
    };
    el.addEventListener('pointerup', end); el.addEventListener('pointercancel', end);
  },
  async tap(px, py) {
    const i = this.hit(px, py);
    if (CS.swap >= 0) {
      if (i >= 0 && i !== CS.swap) { const a = CS.cells[CS.swap]; CS.cells[CS.swap] = CS.cells[i]; CS.cells[i] = a; CS.sel = i; CS.saved = false; }
      CS.swap = -1; this.paint(); this.dockUI(); return;
    }
    if (i < 0) { CS.sel = -1; this.paint(); this.dockUI(); return; }
    if (CS.cells[i].p < 0) { CS.sel = i; await this.replace(i); return; }
    CS.sel = CS.sel === i ? -1 : i; this.paint(); this.dockUI();
  },
  async replace(i) {
    const f = (await pickFiles('one'))[0]; if (!f) { this.paint(); this.dockUI(); return; }
    const b = (await decodeForCollage([f], CS.cells.length))[0]; if (!b) return;
    CS.photos.push(b); Object.assign(CS.cells[i], { p: CS.photos.length - 1, z: 1, ox: 0, oy: 0 }); CS.saved = false;
    this.paint(); this.dockUI();
  },
  dockUI() {
    const acts = $('ceActs'), panel = $('cePanel'); if (!acts) return;
    const c = CS.sel >= 0 ? CS.cells[CS.sel] : null;
    const hn = $('ceHint'); hn.textContent = CS.swap >= 0 ? T('swapPick') : (c ? T('cellHint') : T('collageHint')); hn.classList.remove('fade'); clearTimeout(this._ht); this._ht = setTimeout(() => hn.classList.add('fade'), CS.swap >= 0 ? 8000 : 4000);
    if (c) {
      panel.innerHTML = c.p >= 0 ? '<label class="f" for="ceZoom">' + esc(T('zoom')) + '</label><input type="range" id="ceZoom" min="1" max="4" step="0.01" value="' + c.z + '">' : '';
      acts.innerHTML = '<button class="btn" id="ceRep" type="button"><span class="i">🖼️</span><span>' + esc(T('replace')) + '</span></button>' +
        (CS.cells.length > 1 ? '<button class="btn" id="ceSwap" type="button"><span class="i">⇄</span><span>' + esc(T('swapWith')) + '</span></button>' : '') +
        (c.p >= 0 ? '<button class="btn ghost" id="ceReset" type="button"><span class="i">↺</span><span>' + esc(T('resetCell')) + '</span></button><button class="btn danger" id="ceDel" type="button"><span class="i">🗑</span><span>' + esc(T('removePhoto')) + '</span></button>' : '') +
        '<button class="btn primary" id="ceDone" type="button"><span class="i">✓</span><span>' + esc(T('done')) + '</span></button>';
      if ($('ceZoom')) $('ceZoom').oninput = e => { c.z = +e.target.value; CS.saved = false; this.paint(); };
      $('ceRep').onclick = () => this.replace(CS.sel);
      if ($('ceSwap')) $('ceSwap').onclick = () => { CS.swap = CS.sel; this.paint(); this.dockUI(); };
      if ($('ceReset')) $('ceReset').onclick = () => { Object.assign(c, { z: 1, ox: 0, oy: 0 }); this.paint(); this.dockUI(); };
      if ($('ceDel')) $('ceDel').onclick = () => { c.p = -1; CS.saved = false; this.paint(); this.dockUI(); };
      $('ceDone').onclick = () => { CS.sel = -1; this.paint(); this.dockUI(); };
      return;
    }
    const pan = this.panel;
    const st = S.collage;
    if (pan === 'tpl') panel.innerHTML = eventsRowHTML() + '<label class="f">' + esc(T('templates')) + '</label><div class="tpls">' + TPL.map((t, i) => '<button type="button" data-t="' + i + '" class="' + (i === CS.tpl ? 'on' : '') + '" aria-label="' + esc(T('tplN', { n: t.length })) + '">' + tplSVG(t) + '</button>').join('') + '</div>';
    else if (pan === 'ratio') panel.innerHTML = '<div class="seg">' + Object.keys(RATIOS).map(k => '<button type="button" data-r="' + k + '" class="' + (st.ratio === k ? 'on' : '') + '">' + k + '</button>').join('') + '</div>';
    else if (pan === 'style') panel.innerHTML = '<div class="grid2"><div><label class="f" for="ceGap">' + esc(T('spacing')) + ': <span class="val" id="vGap">' + st.gap + '</span></label><input type="range" id="ceGap" min="0" max="10" step="0.5" value="' + st.gap + '"></div>' +
      '<div><label class="f" for="ceRad">' + esc(T('corners')) + ': <span class="val" id="vRad">' + st.radius + '</span></label><input type="range" id="ceRad" min="0" max="12" step="0.5" value="' + st.radius + '"></div></div>' +
      '<label class="f">' + esc(T('background')) + '</label><div class="swatches" id="ceBg">' + ['#ffffff', '#000000', '#f3ead7', '#d4af37', '#1c2a44', '#e8d5e0'].map(cc => '<button type="button" data-c="' + cc + '" class="' + (st.bg === cc ? 'on' : '') + '" style="background:' + cc + '" aria-label="' + cc + '"></button>').join('') + '<input type="color" id="ceBgI" value="' + st.bg + '" aria-label="' + esc(T('customColor')) + '"></div>';
    else panel.innerHTML = '';
    acts.innerHTML = '<button class="btn' + (pan === 'tpl' ? ' primary' : '') + '" data-p="tpl" type="button"><span class="i">🧩</span><span>' + esc(T('template')) + '</span></button>' +
      '<button class="btn' + (pan === 'ratio' ? ' primary' : '') + '" data-p="ratio" type="button"><span class="i">📐</span><span>' + esc(T('ratio')) + '</span></button>' +
      '<button class="btn' + (pan === 'style' ? ' primary' : '') + '" data-p="style" type="button"><span class="i">🎨</span><span>' + esc(T('style')) + '</span></button>' +
      '<button class="btn" id="ceText" type="button"><span class="i">🔤</span><span>' + esc(T('text')) + '</span></button>' +
      '<button class="btn" id="ceAdd" type="button"><span class="i">➕</span><span>' + esc(T('photos')) + '</span></button>' +
      '<button class="btn primary" id="ceExport" type="button"><span class="i">⬇️</span><span>' + esc(T('exportSave')) + '</span></button>';
    acts.querySelectorAll('[data-p]').forEach(b => b.onclick = () => { this.panel = this.panel === b.dataset.p ? null : b.dataset.p; this.dockUI(); });
    panel.querySelectorAll('[data-ev]').forEach(b => b.onclick = () => { applyEventCollage(b.dataset.ev); this.paint(); toast(T('eventApplied')); });
    panel.querySelectorAll('[data-t]').forEach(b => b.onclick = () => { CS.tpl = +b.dataset.t; layoutCells(); CS.saved = false; this.paint(); this.dockUI(); });
    panel.querySelectorAll('[data-r]').forEach(b => b.onclick = () => { st.ratio = b.dataset.r; saveS(); CS.saved = false; this.resize(); this.dockUI(); });
    if ($('ceGap')) {
      $('ceGap').oninput = e => { st.gap = +e.target.value; $('vGap').textContent = st.gap; saveS(); CS.saved = false; this.paint(); };
      $('ceRad').oninput = e => { st.radius = +e.target.value; $('vRad').textContent = st.radius; saveS(); CS.saved = false; this.paint(); };
      $('ceBg').querySelectorAll('[data-c]').forEach(b => b.onclick = () => { st.bg = b.dataset.c; $('ceBgI').value = st.bg; saveS(); CS.saved = false; this.paint(); this.dockUI(); });
      $('ceBgI').oninput = e => { st.bg = e.target.value; saveS(); CS.saved = false; this.paint(); };
    }
    $('ceText').onclick = () => { if (!CS.text) CS.text = newText(); textSheet(CS.text, () => { CS.saved = false; this.paint(); }); };
    $('ceAdd').onclick = async () => {
      let files = (await pickFiles('many')).filter(isImageFile); if (!files.length) return;
      const room = MAX_COLLAGE - CS.photos.length; if (room <= 0) { toast(T('collageMax', { n: MAX_COLLAGE }), true); return; }
      if (files.length > room) { toast(T('collageMax', { n: MAX_COLLAGE }), true); files = files.slice(0, room); }
      const bm = await decodeForCollage(files, CS.photos.length + files.length);
      CS.photos.push(...bm);
      const filled = CS.cells.filter(c => c.p >= 0).length;
      if (filled + bm.length > CS.cells.length) CS.tpl = bestTpl(filled + bm.length);
      layoutCells(); CS.saved = false; this.paint(); this.dockUI();
    };
    $('ceExport').onclick = () => {
      if (!CS.cells.some(c => c.p >= 0)) { toast(T('collageEmpty'), true); return; }
      exportFlow({
        sizes: { '2k': 2048, '3k': 3072, '4k': 4096 }, sizeKey: () => ({ 2048: '2k', 3072: '3k', 4096: '4k' }[st.size] || '3k'), setSize: k => { st.size = { '2k': 2048, '3k': 3072, '4k': 4096 }[k]; },
        dims: long => collageDims(long),
        render: async long => {
          const d = collageDims(long), c = document.createElement('canvas'); c.width = d.W; c.height = d.H;
          const x = c.getContext('2d'); drawCollage(x, d.W, d.H, false); if (S.sign && S.name) drawSignature(x, d.W, d.H); return { c, W: d.W, H: d.H };
        },
        kind: 'collage', name: () => T('collage'),
        thumb: async () => { const d = collageDims(360), c = mkCanvas(d.W, d.H); drawCollage(c.getContext('2d'), d.W, d.H, false); return await canvasToBlob(c, 'image/jpeg', 0.82); },
        onSaved: () => { CS.saved = true; },
        extra: [{ label: '📁 ' + T('saveAsProject'), run: saveCollageProject }]
      });
    };
  }
};

async function renderCollageSetup() {
  $('main').innerHTML = '<div class="screen">' +
    (CS ? '<button class="btn primary big" id="cResume" type="button" style="margin-bottom:14px">✏️ ' + esc(T('resumeCollage')) + '</button>' : '') + await projectsCardHTML('collage') +
    '<div class="card"><h3>🖼️ ' + esc(T('collage')) + '</h3><p class="muted">' + esc(T('collageIntro', { n: MAX_COLLAGE })) + '</p>' +
    '<button class="pickbox" id="cPick" type="button"><span class="em">➕</span><span><b>' + esc(T('pickPhotos')) + '</b><br><small class="muted">' + esc(T('pickPhotosHint', { n: MAX_COLLAGE })) + '</small></span></button></div>' +
    '<div class="card"><h3>🧩 ' + esc(T('templates')) + '</h3><div class="tpls" style="pointer-events:none;color:var(--accent)">' + TPL.slice(0, 12).map(t => '<div class="tpl" style="padding:4px;border:1px solid var(--line);border-radius:10px;aspect-ratio:1">' + tplSVG(t) + '</div>').join('') + '</div></div></div>';
  if ($('cResume')) $('cResume').onclick = () => go('collageEd');
  bindProjects(renderCollageSetup);
  $('cPick').onclick = newCollage;
}

/* ═══ CollageNest 1.3 — mosaic projects · text/title on collages · share-to-app (share target) ═══ */

/* ── mosaic projects (IndexedDB "projects": main photo Blob + tile ids + assignment) ── */
async function bitmapToBlob(b, q) { const c = mkCanvas(b.width, b.height); c.getContext('2d').drawImage(b, 0, 0); return await canvasToBlob(c, 'image/jpeg', q || 0.92); }
const DRAFT_M = 'draft-mosaic', DRAFT_C = 'draft-collage';
async function mosaicRecord(m, id, name) {
  if (!m.mainBlob) m.mainBlob = await bitmapToBlob(m.main);
  const old = await DB.get('projects', id);
  return {
      id, kind: 'mosaic', draft: id === DRAFT_M, name: name || T('mosaic'), created: old ? old.created : Date.now(), updated: Date.now(),
      libId: m.libId, cols: m.cols, aspect: m.aspect, flip: m.tileOf.length > m.N, variety: m.variety,
      outline: m.outline || 'none', outlineText: m.outlineText || '', synthetic: !!m.synthetic,
      tileIds: m.tiles.map(t => t.id), assign: Array.from(m.assign), style: Object.assign({}, S.mosaic),
      main: m.mainBlob, thumb: await thumbOf(m.comp, m.comp.width, m.comp.height), cells: m.assign.length
  };
}
async function saveProject() {
  const m = MS; if (!m) return;
  const named = m.projectId && m.projectId !== DRAFT_M;
  const name = named ? m.name : await promptBox(T('projectName'), m.name || T('mosaic'), T('save'));
  if (name == null) return;
  const p = Prog.show(T('savingProject'), false);
  try {
    const rec = await mosaicRecord(m, named ? m.projectId : uid(), name);
    await DB.put('projects', rec);
    if (!named) await DB.del('projects', DRAFT_M); // the draft became a real project
    m.projectId = rec.id; m.name = rec.name; m.saved = true; clearTimeout(_asM); p.close(); toast(T('projectSaved'));
  } catch (e) { p.close(); logErr('saveProject: ' + (e && e.message)); toast(T('storageFull'), true); }
}
/* ── autosave: a few seconds after each change, and when the app goes to the background ── */
let _asM = 0, _asC = 0, _asBusy = false;
function markDirty() { if (!MS) return; MS.saved = false; clearTimeout(_asM); _asM = setTimeout(autoSaveMosaic, 2500); }
async function autoSaveMosaic() {
  const m = MS; if (!m || _asBusy) return; _asBusy = true;
  try { const id = m.projectId || DRAFT_M; await DB.put('projects', await mosaicRecord(m, id, id === DRAFT_M ? T('draftName') : m.name)); if (!m.projectId) m.projectId = DRAFT_M; }
  catch (e) { logErr('autosave: ' + (e && e.message)); } finally { _asBusy = false; }
}
function markCollageDirty() { if (!CS) return; CS.saved = false; clearTimeout(_asC); _asC = setTimeout(autoSaveCollage, 3000); }
async function collageRecord(c, id, name) {
  if (!c.blobs) c.blobs = [];
  for (let i = 0; i < c.photos.length; i++) if (!c.blobs[i]) c.blobs[i] = await bitmapToBlob(c.photos[i], 0.9);
  const old = await DB.get('projects', id);
  const d = collageDims(360), tc = mkCanvas(d.W, d.H); drawCollage(tc.getContext('2d'), d.W, d.H, false);
  return { id, kind: 'collage', draft: id === DRAFT_C, name: name || T('collage'), created: old ? old.created : Date.now(), updated: Date.now(),
    photos: c.blobs.slice(0, c.photos.length), tpl: c.tpl, cells: c.cells.map(x => Object.assign({}, x)), text: c.text, style: Object.assign({}, S.collage), thumb: await canvasToBlob(tc, 'image/jpeg', 0.82) };
}
async function autoSaveCollage() {
  const c = CS; if (!c || _asBusy) return; _asBusy = true;
  try { const id = c.projectId || DRAFT_C; await DB.put('projects', await collageRecord(c, id, id === DRAFT_C ? T('draftName') : c.name)); if (!c.projectId) c.projectId = DRAFT_C; }
  catch (e) { logErr('autosaveC: ' + (e && e.message)); } finally { _asBusy = false; }
}
async function saveCollageProject() {
  const c = CS; if (!c) return;
  const named = c.projectId && c.projectId !== DRAFT_C;
  const name = named ? c.name : await promptBox(T('projectName'), c.name || T('collage'), T('save'));
  if (name == null) return;
  const p = Prog.show(T('savingProject'), false);
  try {
    const rec = await collageRecord(c, named ? c.projectId : uid(), name);
    await DB.put('projects', rec); if (!named) await DB.del('projects', DRAFT_C);
    c.projectId = rec.id; c.name = rec.name; c.saved = true; clearTimeout(_asC); p.close(); toast(T('projectSaved'));
  } catch (e) { p.close(); toast(T('storageFull'), true); }
}
async function openCollageProject(id) {
  const rec = await DB.get('projects', id); if (!rec) return;
  const p = Prog.show(T('openingProject'), false);
  try {
    const photos = []; for (const b of rec.photos) photos.push(await createImageBitmap(b));
    if (CS) CS.photos.forEach(b => { try { b.close(); } catch (e) {} });
    S.collage = Object.assign({}, DEF_S.collage, rec.style || {}); saveS();
    CS = { photos, blobs: rec.photos.slice(), tpl: rec.tpl, cells: rec.cells.map(x => Object.assign({}, x)), sel: -1, swap: -1, saved: true, text: rec.text || newText(), projectId: rec.id, name: rec.name };
    p.close(); go('collageEd');
  } catch (e) { p.close(); toast(T('decodeFail'), true); }
}
addEventListener('visibilitychange', () => { if (document.visibilityState !== 'hidden') return; if (_asM) { clearTimeout(_asM); _asM = 0; autoSaveMosaic(); } if (_asC) { clearTimeout(_asC); _asC = 0; autoSaveCollage(); } });
async function openProject(id) {
  const rec = await DB.get('projects', id); if (!rec) return;
  const lib = await DB.get('libs', rec.libId);
  if (!lib) { toast(T('projectLibGone'), true); return; }
  const p = Prog.show(T('openingProject'), true);
  try {
    const main = await createImageBitmap(rec.main);
    if (Setup.main && (!MS || MS.main !== Setup.main)) try { Setup.main.close(); } catch (e) {}
    if (rec.synthetic) { Setup.main = null; Setup.mainName = ''; } else { Setup.main = main; Setup.mainName = rec.name; }
    Object.assign(S.mosaic, rec.style || {}, { lib: rec.libId, cols: rec.cols, aspect: rec.aspect, flip: rec.flip, variety: rec.variety, outline: rec.outline || 'none', outlineText: rec.outlineText || '50' }); saveS();
    const cache = await LibCache.load(rec.libId, p);
    if (!cache.tiles.length) throw new Error('empty');
    const a = ASPECTS[rec.aspect] || 1;
    p.set(0.3, T('analyzing'));
    const tf = await tileFeatures(cache.minis, a, rec.flip, cache.tc);
    const g = gridFor(main.width, main.height, rec.cols, rec.aspect);
    const tg = targetFeatures(main, g);
    const C = g.cols * g.rows, N = cache.tiles.length, idx = new Map(cache.tiles.map((t, i) => [t.id, i]));
    const oldN = rec.tileIds.length, assign = new Int32Array(C).fill(-1);
    let missing = 0;
    const pm = { cols: g.cols, rows: g.rows, a, hex: g.hex }, mask = makeMask(pm, rec.outline, rec.outlineText);
    if (rec.assign.length === C) for (let c = 0; c < C; c++) {
      if (mask && !mask[c]) continue;
      const e = rec.assign[c], flip = e >= oldN, ni = idx.get(rec.tileIds[flip ? e - oldN : e]);
      if (ni == null) { missing++; continue; }
      assign[c] = ni + (flip && rec.flip ? N : 0);
    }
    for (let c = 0; c < C; c++) if (assign[c] < 0 && (!mask || mask[c])) { // photo was removed from the library → best remaining match
      let best = 0, bd = Infinity; const base = c * FD;
      for (let e = 0; e < tf.M; e++) { let s = 0; const o = e * FD; for (let k = 0; k < FD; k++) { const t = tg.feats[base + k] - tf.feats[o + k]; s += t * t; } if (s < bd) { bd = s; best = e; } }
      assign[c] = best;
    }
    MS = { main, mainBlob: rec.main, name: rec.name, libId: rec.libId, tiles: cache.tiles, minis: cache.minis, cols: g.cols, rows: g.rows, a, hex: g.hex, aspect: rec.aspect, src: g.src,
      tf: tf.feats, tileOf: tf.tileOf, flipOf: tf.flipOf, N: tf.N, cf: tg.feats, rgb: tg.rgb, variety: rec.variety, assign, mask, tc: cache.tc, outline: rec.outline, outlineText: rec.outlineText, synthetic: rec.synthetic, undo: [], redo: [], saved: true, projectId: rec.id };
    p.set(0.95, T('drawing')); await yieldUI();
    buildComposite(MS, S.mosaic);
    p.close();
    if (missing) toast(T('projectMissing', { n: nf(missing) }), true);
    go('editor');
  } catch (e) { p.close(); if (e && e.message === 'cancel') toast(T('cancelled')); else { logErr('openProject: ' + (e && e.message)); toast(T('mosaicFail'), true); } }
}
async function editProjectDialog(id, after) {
  const it = await DB.get('projects', id); if (!it) return;
  const m = openModal({
    title: T('editProject'),
    html: '<label class="f" for="epName">' + esc(T('name')) + '</label><input type="text" id="epName" maxlength="60" value="' + esc(it.name) + '">' +
      '<p class="small muted">' + esc(df(it.updated)) + (it.kind === 'collage' ? ' · ' + esc(T('nPhotos', { n: nf(it.photos.length) })) : ' · ' + esc(T('nTiles', { n: nf(it.cells) }))) + '</p><button class="btn danger sm" id="epDel" type="button">🗑 ' + esc(T('delete')) + '</button>',
    actions: [{ label: T('cancel'), cls: 'ghost' }, { label: T('save'), cls: 'primary', onClick: async () => { it.name = $('epName').value.trim() || it.name; await DB.put('projects', it); if (MS && MS.projectId === id) MS.name = it.name; if (CS && CS.projectId === id) CS.name = it.name; it.draft = false; after && after(); } }]
  });
  $('epDel').onclick = async () => {
    if (!await confirmBox(T('deleteProjectQ'), T('delete'), true)) return;
    await DB.del('projects', id); if (MS && MS.projectId === id) MS.projectId = null; if (CS && CS.projectId === id) CS.projectId = null;
    m.close(); toast(T('deleted')); after && after();
  };
}
async function projectsCardHTML(kind) {
  kind = kind || 'mosaic';
  const ps = (await DB.all('projects')).filter(p => (p.kind || 'mosaic') === kind).sort((a, b) => (b.draft ? 1 : 0) - (a.draft ? 1 : 0) || b.updated - a.updated);
  if (!ps.length) return '';
  return '<div class="card"><h3>📁 ' + esc(T(kind === 'collage' ? 'myCollages' : 'myProjects')) + '</h3><div class="gal">' + ps.map(it => '<div class="lib" role="button" tabindex="0" data-prj="' + it.id + '" data-kind="' + kind + '"><div class="cov"><img alt="" src="' + trackURL(URL.createObjectURL(it.thumb)) + '"></div><div class="meta"><b>' + (it.draft ? '📝 ' : '') + esc(it.name) + '</b><small>' + esc(df(it.updated)) + '</small></div><button class="ed" type="button" data-pe="' + it.id + '" aria-label="' + esc(T('edit')) + '">✏️</button></div>').join('') + '</div></div>';
}
function bindProjects(after) {
  document.querySelectorAll('[data-prj]').forEach(el => {
    const open = () => el.dataset.kind === 'collage' ? openCollageProject(el.dataset.prj) : openProject(el.dataset.prj);
    el.onclick = e => { if (e.target.closest('[data-pe]')) return; open(); };
    el.onkeydown = e => { if (e.key === 'Enter') open(); };
    onLongPress(el, () => editProjectDialog(el.dataset.prj, after));
  });
  document.querySelectorAll('[data-pe]').forEach(b => b.onclick = e => { e.stopPropagation(); editProjectDialog(b.dataset.pe, after); });
}

/* ── text / title overlay (collage + AutoCollage) ── */
const newText = () => ({ text: '', size: 9, color: '#ffffff', pos: 'bottom', style: 'shadow', font: 'sans' });
const FONTS = {
  sans: '800 {s}px ' + 'system-ui,-apple-system,"Segoe UI",Roboto,"Noto Sans Hebrew","Noto Sans Arabic",Arial,sans-serif',
  serif: '700 {s}px Georgia,"Times New Roman","Noto Serif Hebrew","David",serif',
  script: 'italic 700 {s}px "Segoe Script","Brush Script MT","Comic Sans MS","Guttman Yad-Brush",cursive'
};
function drawTitle(x, W, H, t) {
  if (!t || !t.text || !t.text.trim()) return;
  const m = Math.min(W, H), fs = Math.max(10, t.size / 100 * m), lines = t.text.split('\n').map(s => s.trim()).filter(Boolean).slice(0, 4);
  const lh = fs * 1.22, block = lines.length * lh, pad = fs * 0.45, margin = m * 0.04;
  const cy = t.pos === 'top' ? margin + pad + block / 2 : t.pos === 'center' ? H / 2 : H - margin - pad - block / 2;
  x.save();
  x.font = FONTS[t.font || 'sans'].replace('{s}', Math.round(fs));
  x.textAlign = 'center'; x.textBaseline = 'middle';
  try { x.direction = /[֐-׿؀-ۿ]/.test(t.text) ? 'rtl' : 'ltr'; } catch (e) {}
  if (t.style === 'band') {
    const light = /^#?(f|e|d)/i.test(t.color.replace('#', ''));
    x.fillStyle = light ? 'rgba(0,0,0,.45)' : 'rgba(255,255,255,.6)';
    x.fillRect(0, cy - block / 2 - pad, W, block + pad * 2);
  } else if (t.style === 'shadow') { x.shadowColor = 'rgba(0,0,0,.65)'; x.shadowBlur = fs * 0.18; x.shadowOffsetY = fs * 0.05; }
  x.fillStyle = t.color;
  lines.forEach((ln, k) => x.fillText(ln, W / 2, cy - block / 2 + lh * (k + 0.5), W * 0.94));
  x.restore();
}
function textSheet(t, onChange) {
  const draw = () =>
    '<label class="f" for="txIn">' + esc(T('titleText')) + '</label><textarea id="txIn" rows="2" maxlength="120" placeholder="' + esc(T('titlePh')) + '">' + esc(t.text) + '</textarea>' +
    '<label class="f" for="txSize">' + esc(T('size')) + ': <span class="val" id="txSizeV">' + t.size + '</span></label><input type="range" id="txSize" min="3" max="20" step="0.5" value="' + t.size + '">' +
    '<label class="f">' + esc(T('textColor')) + '</label><div class="swatches" id="txCol">' + ['#ffffff', '#000000', '#d4af37', '#ff6b81', '#6ea8ff', '#3fcf8e'].map(c => '<button type="button" data-c="' + c + '" class="' + (t.color === c ? 'on' : '') + '" style="background:' + c + '" aria-label="' + c + '"></button>').join('') + '<input type="color" id="txColI" value="' + t.color + '" aria-label="' + esc(T('customColor')) + '"></div>' +
    '<label class="f">' + esc(T('position')) + '</label><div class="seg" id="txPos">' + ['top', 'center', 'bottom'].map(v => '<button type="button" data-v="' + v + '" class="' + (t.pos === v ? 'on' : '') + '">' + esc(T('pos_' + v)) + '</button>').join('') + '</div>' +
    '<label class="f">' + esc(T('textStyle')) + '</label><div class="seg" id="txSt">' + ['shadow', 'band', 'plain'].map(v => '<button type="button" data-v="' + v + '" class="' + (t.style === v ? 'on' : '') + '">' + esc(T('ts_' + v)) + '</button>').join('') + '</div>' +
    '<label class="f">' + esc(T('font')) + '</label><div class="seg" id="txFont">' + ['sans', 'serif', 'script'].map(v => '<button type="button" data-v="' + v + '" class="' + (t.font === v ? 'on' : '') + '">' + esc(T('fn_' + v)) + '</button>').join('') + '</div>';
  const m = openModal({ title: T('addText'), html: draw(), actions: [{ label: T('removeText'), cls: 'ghost', onClick: () => { t.text = ''; onChange(); } }, { label: T('done'), cls: 'primary' }] });
  m.el.style.background = 'rgba(0,0,0,.2)'; m.el.querySelector('.sheet').style.maxHeight = '56vh'; // keep the picture visible above
  let tm = 0; const ch = () => { clearTimeout(tm); tm = setTimeout(onChange, 60); };
  $('txIn').oninput = e => { t.text = e.target.value; ch(); };
  $('txSize').oninput = e => { t.size = +e.target.value; $('txSizeV').textContent = t.size; ch(); };
  m.body.querySelectorAll('#txCol [data-c]').forEach(b => b.onclick = () => { t.color = b.dataset.c; $('txColI').value = t.color; m.body.querySelectorAll('#txCol [data-c]').forEach(z => z.classList.toggle('on', z === b)); ch(); });
  $('txColI').oninput = e => { t.color = e.target.value; ch(); };
  [['txPos', 'pos'], ['txSt', 'style'], ['txFont', 'font']].forEach(([id, k]) => m.body.querySelectorAll('#' + id + ' button').forEach(b => b.onclick = () => { t[k] = b.dataset.v; m.body.querySelectorAll('#' + id + ' button').forEach(z => z.classList.toggle('on', z === b)); ch(); }));
  setTimeout(() => { try { $('txIn').focus(); } catch (e) {} }, 60);
}

/* ── share target: photos shared from the gallery arrive here (via sw.js) ── */
async function takeSharedFiles() {
  if (!('caches' in self)) return [];
  try {
    const c = await caches.open('collagenest-share'), keys = await c.keys(), files = [];
    for (const k of keys) {
      const r = await c.match(k); if (!r) continue;
      const b = await r.blob(), name = decodeURIComponent(r.headers.get('X-Name') || 'photo.jpg');
      files.push(new File([b], name, { type: b.type || 'image/jpeg', lastModified: Date.now() }));
      await c.delete(k);
    }
    return files;
  } catch (e) { logErr('share: ' + (e && e.message)); return []; }
}
async function handleShared() {
  const qs = new URLSearchParams(location.search); if (!qs.has('shared')) return;
  qs.delete('shared'); history.replaceState(history.state, '', location.pathname + (qs.toString() ? '?' + qs : '') + location.hash);
  const files = (await takeSharedFiles()).filter(isImageFile);
  if (!files.length) { toast(T('sharedNone'), true); return; }
  const one = files.length === 1;
  const m = openModal({
    title: T('sharedTitle', { n: nf(files.length) }),
    html: '<div class="seg" style="flex-direction:column">' +
      (one ? '<button type="button" data-a="main" style="justify-content:flex-start;min-height:54px">🎯 ' + esc(T('shareAsMain')) + '</button>' : '') +
      '<button type="button" data-a="lib" style="justify-content:flex-start;min-height:54px">📚 ' + esc(T('shareToLib')) + '</button>' +
      '<button type="button" data-a="auto" style="justify-content:flex-start;min-height:54px">✨ ' + esc(T('shareToAuto')) + '</button>' +
      '<button type="button" data-a="collage" style="justify-content:flex-start;min-height:54px">🖼️ ' + esc(T('shareToCollage')) + '</button></div>',
    actions: [{ label: T('cancel'), cls: 'ghost' }]
  });
  m.body.querySelectorAll('[data-a]').forEach(b => b.onclick = async () => {
    m.close(); const a = b.dataset.a;
    if (a === 'main') { const p = Prog.show(T('loadingPhoto'), false); try { await setMain(await decodeImage(files[0]), files[0].name.replace(/\.[^.]+$/, '')); } catch (e) { p.close(); toast(T('decodeFail'), true); return; } p.close(); go('mosaic'); }
    else if (a === 'auto') { await analyseFiles(files); go('auto'); }
    else if (a === 'collage') { await newCollage(files); }
    else pickLibraryFor(files);
  });
}
async function pickLibraryFor(files) {
  const libs = (await DB.all('libs')).sort((a, b) => b.updated - a.updated);
  const m = openModal({
    title: T('chooseLib'),
    html: '<div class="seg" style="flex-direction:column">' + libs.map(l => '<button type="button" data-l="' + l.id + '" style="justify-content:flex-start">📚 ' + esc(l.name) + ' · ' + esc(T('nPhotos', { n: nf(l.count) })) + '</button>').join('') +
      '<button type="button" data-l="" style="justify-content:flex-start">➕ ' + esc(T('newLib')) + '</button></div>',
    actions: [{ label: T('cancel'), cls: 'ghost' }]
  });
  m.body.querySelectorAll('[data-l]').forEach(b => b.onclick = async () => {
    m.close(); let id = b.dataset.l;
    if (!id) { const name = await promptBox(T('newLib'), T('libDefaultName', { d: df(Date.now()) }), T('create')); if (name == null) return; id = (await newLibrary(name)).id; }
    await importToLib(id, files); go('lib', id);
  });
}

/* ═══ CollageNest 1.5 — event templates · puzzle from any creation ═══ */

/* ── event templates: colours + spacing + a ready title, for collage and AutoCollage ── */
const EVENTS = {
  birthday: { em: '🎂', bg: '#ffe4ec', gap: 3, radius: 6, text: { color: '#d63384', font: 'script', pos: 'top', style: 'plain', size: 11 }, auto: 'album' },
  wedding:  { em: '💍', bg: '#fffaf0', gap: 2.5, radius: 1, text: { color: '#b8860b', font: 'serif', pos: 'bottom', style: 'plain', size: 9 }, auto: 'grid' },
  trip:     { em: '✈️', bg: '#0b2a4a', gap: 2, radius: 3, text: { color: '#ffffff', font: 'sans', pos: 'bottom', style: 'shadow', size: 9 }, auto: 'blend' },
  family:   { em: '👨‍👩‍👧', bg: '#f3ead7', gap: 2, radius: 4, text: { color: '#5a3e1b', font: 'serif', pos: 'top', style: 'plain', size: 9 }, auto: 'album' },
  baby:     { em: '🍼', bg: '#e6f3ff', gap: 3, radius: 8, text: { color: '#3a7bd5', font: 'script', pos: 'bottom', style: 'plain', size: 10 }, auto: 'grid' },
  love:     { em: '❤️', bg: '#2a0f17', gap: 2, radius: 5, text: { color: '#ff6b81', font: 'script', pos: 'center', style: 'shadow', size: 12 }, auto: 'blend' },
  holiday:  { em: '🎉', bg: '#111111', gap: 2, radius: 4, text: { color: '#d4af37', font: 'sans', pos: 'top', style: 'band', size: 9 }, auto: 'grid' }
};
function eventTitle(k) { return T('ev_' + k + '_t').replace('{y}', new Date().getFullYear()); }
function eventsRowHTML() {
  return '<label class="f">' + esc(T('eventTemplates')) + '</label><div class="seg" id="evRow">' + Object.keys(EVENTS).map(k => '<button type="button" data-ev="' + k + '">' + EVENTS[k].em + ' ' + esc(T('ev_' + k)) + '</button>').join('') + '</div>';
}
function applyEventCollage(k) {
  const ev = EVENTS[k]; if (!ev || !CS) return;
  Object.assign(S.collage, { bg: ev.bg, gap: ev.gap, radius: ev.radius }); saveS();
  CS.text = Object.assign(newText(), ev.text, { text: eventTitle(k) }); CS.saved = false;
}
async function applyEventAuto(k) {
  const ev = EVENTS[k]; if (!ev || !AS) return;
  AS.text = Object.assign(newText(), ev.text, { text: eventTitle(k) });
  if (S.auto.style !== ev.auto) { S.auto.style = ev.auto; saveS(); AEd.mode = null; AEd.dockUI(); await buildAuto(false, true, true); }
  else AEd.paint();
  toast(T('eventApplied'));
}

/* ── puzzle: swap pieces until the picture is whole ── */
const PZ = { img: null, n: 4, order: [], sel: -1, moves: 0, t0: 0, done: false, peek: false };
function pzShuffle() {
  const N = PZ.n * PZ.n, o = [...Array(N).keys()];
  do { for (let i = N - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [o[i], o[j]] = [o[j], o[i]]; } } while (o.every((v, i) => v === i));
  PZ.order = o; PZ.sel = -1; PZ.moves = 0; PZ.t0 = Date.now(); PZ.done = false;
}
async function renderPuzzle(id) {
  const it = await DB.get('gallery', id); if (!it) return go('gallery', null, true);
  if (PZ.id !== id) { if (PZ.img) try { PZ.img.close(); } catch (e) {} PZ.img = await createImageBitmap(it.blob); PZ.id = id; pzShuffle(); }
  $('main').innerHTML = '<div class="screen"><div class="seg" id="pzN" style="justify-content:center;margin-bottom:10px">' + [3, 4, 5, 6].map(n => '<button type="button" data-n="' + n + '" class="' + (PZ.n === n ? 'on' : '') + '">' + n + '×' + n + '</button>').join('') + '</div>' +
    '<canvas id="pzCv" style="width:100%;display:block;border-radius:12px;touch-action:none;box-shadow:var(--shadow)" aria-label="' + esc(T('puzzle')) + '"></canvas>' +
    '<div class="row sp" style="margin-top:10px"><span class="muted" id="pzInfo"></span><span class="row"><button class="btn ghost sm" id="pzPeek" type="button">👁 ' + esc(T('peek')) + '</button><button class="btn sm" id="pzNew" type="button">🔀 ' + esc(T('reshuffle')) + '</button></span></div>' +
    '<p class="small muted">' + esc(T('puzzleHint')) + '</p></div>';
  const cv = $('pzCv'), x = cv.getContext('2d'), img = PZ.img;
  const fit = () => { const w = Math.min(cv.parentElement.clientWidth, 760), dpr = Math.min(3, devicePixelRatio || 1); cv.width = Math.round(w * dpr); cv.height = Math.round(w * img.height / img.width * dpr); };
  const draw = () => {
    const n = PZ.n, W = cv.width, H = cv.height, pw = W / n, ph = H / n, sw = img.width / n, sh = img.height / n;
    x.fillStyle = '#000'; x.fillRect(0, 0, W, H);
    for (let k = 0; k < n * n; k++) {
      const src = PZ.peek ? k : PZ.order[k], dx = (k % n) * pw, dy = ((k / n) | 0) * ph;
      x.drawImage(img, (src % n) * sw, ((src / n) | 0) * sh, sw, sh, dx, dy, pw, ph);
      if (!PZ.done && !PZ.peek) { x.strokeStyle = 'rgba(0,0,0,.5)'; x.lineWidth = Math.max(1, W / 500); x.strokeRect(dx + 0.5, dy + 0.5, pw - 1, ph - 1); }
      if (k === PZ.sel) { x.strokeStyle = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || '#d4af37'; x.lineWidth = Math.max(3, W / 120); x.strokeRect(dx + 2, dy + 2, pw - 4, ph - 4); }
    }
    const right = PZ.order.filter((v, i) => v === i).length;
    $('pzInfo').textContent = PZ.done ? T('puzzleDone', { m: nf(PZ.moves), s: nf(Math.round((PZ.doneAt - PZ.t0) / 1000)) }) : T('puzzleInfo', { m: nf(PZ.moves), r: nf(right), t: nf(n * n) });
  };
  const cell = e => { const r = cv.getBoundingClientRect(), n = PZ.n; return clamp(Math.floor((e.clientY - r.top) / r.height * n), 0, n - 1) * n + clamp(Math.floor((e.clientX - r.left) / r.width * n), 0, n - 1); };
  const swap = (a, b) => {
    [PZ.order[a], PZ.order[b]] = [PZ.order[b], PZ.order[a]]; PZ.moves++; PZ.sel = -1;
    if (PZ.order.every((v, i) => v === i)) { PZ.done = true; PZ.doneAt = Date.now(); confetti(); toast(T('puzzleWin')); }
    draw();
  };
  let down = -1;
  cv.onpointerdown = e => { if (PZ.done) return; down = cell(e); cv.setPointerCapture(e.pointerId); };
  cv.onpointerup = e => {
    if (PZ.done || down < 0) return; const up = cell(e);
    if (up !== down) swap(down, up);                       // drag a piece onto another
    else if (PZ.sel < 0) { PZ.sel = up; draw(); }           // or tap two pieces
    else if (PZ.sel === up) { PZ.sel = -1; draw(); }
    else swap(PZ.sel, up);
    down = -1;
  };
  $('pzN').querySelectorAll('button').forEach(b => b.onclick = () => { PZ.n = +b.dataset.n; pzShuffle(); renderPuzzle(id); });
  $('pzNew').onclick = () => { pzShuffle(); draw(); };
  const peek = on => { PZ.peek = on; draw(); };
  $('pzPeek').onpointerdown = () => peek(true); ['pointerup', 'pointerleave', 'pointercancel'].forEach(ev => $('pzPeek').addEventListener(ev, () => peek(false)));
  fit(); draw();
}
function confetti() {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const c = document.createElement('canvas'); c.width = innerWidth; c.height = innerHeight;
  Object.assign(c.style, { position: 'fixed', inset: '0', pointerEvents: 'none', zIndex: 95 }); document.body.appendChild(c);
  const x = c.getContext('2d'), P = Array.from({ length: 140 }, () => ({ x: Math.random() * c.width, y: -20 - Math.random() * c.height * 0.4, v: 2 + Math.random() * 4, r: Math.random() * 6.28, s: 5 + Math.random() * 6, h: Math.floor(Math.random() * 360) }));
  const t0 = performance.now();
  const step = t => {
    x.clearRect(0, 0, c.width, c.height);
    P.forEach(p => { p.y += p.v; p.x += Math.sin((p.y + p.r * 40) / 40) * 1.4; p.r += 0.1; x.save(); x.translate(p.x, p.y); x.rotate(p.r); x.fillStyle = 'hsl(' + p.h + ',85%,60%)'; x.fillRect(-p.s / 2, -p.s / 4, p.s, p.s / 2); x.restore(); });
    if (t - t0 < 2600) requestAnimationFrame(step); else c.remove();
  };
  requestAnimationFrame(step);
}

(window.__MODS = window.__MODS || {})['cn-collage.js'] = '1.5.0';
