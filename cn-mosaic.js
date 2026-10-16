/* CollageNest 1.5.0 · cn-mosaic.js — mosaic screens, shapes, zoom video */
/* ═══ CollageNest — mosaic screens: setup wizard + zoomable editor (tap a tile to swap) ═══ */

const Setup = { main: null, mainName: '', thumb: null };
let MS = null; // current mosaic session

function varietyParams(v, C, N) {
  if (v === 'low') return { maxRep: C, R: 0 };
  if (v === 'high') return { maxRep: Math.max(1, Math.ceil(C / N * 1.1)), R: 4 };
  return { maxRep: Math.max(1, Math.ceil(C / N * 2)), R: 2 };
}
async function setMain(bmp, name) {
  if (Setup.main && !(MS && MS.main === Setup.main)) try { Setup.main.close(); } catch (e) {}
  const max = 3000;
  if (Math.max(bmp.width, bmp.height) > max) {
    const s = max / Math.max(bmp.width, bmp.height), c = mkCanvas(Math.round(bmp.width * s), Math.round(bmp.height * s));
    const x = c.getContext('2d'); x.imageSmoothingQuality = 'high'; x.drawImage(bmp, 0, 0, c.width, c.height);
    try { bmp.close(); } catch (e) {}
    bmp = await createImageBitmap(c);
  }
  Setup.main = bmp; Setup.mainName = name || '';
}
function drawThumbInto(canvas, bmp) {
  const s = 144; canvas.width = s; canvas.height = s;
  const x = canvas.getContext('2d'); const [sx, sy, sw, sh] = cropToAspect(bmp.width, bmp.height, 1);
  x.drawImage(bmp, sx, sy, sw, sh, 0, 0, s, s);
}

async function libCoverHTML(lib, n) {
  const tiles = (await DB.byLib(lib.id)).slice(0, n || 4);
  return tiles.map(t => '<img alt="" src="' + trackURL(URL.createObjectURL(t.mini)) + '">').join('') + '<span></span>'.repeat(Math.max(0, (n || 4) - tiles.length));
}
/* object-URL bookkeeping: revoked on every screen change */
let _urls = [];
function trackURL(u) { _urls.push(u); return u; }
function revokeURLs() { _urls.forEach(u => URL.revokeObjectURL(u)); _urls = []; }

async function renderMosaicSetup() {
  const libs = (await DB.all('libs')).sort((a, b) => b.updated - a.updated);
  if (!libs.find(l => l.id === S.mosaic.lib)) S.mosaic.lib = libs[0] ? libs[0].id : null;
  const lib = libs.find(l => l.id === S.mosaic.lib);
  const m = S.mosaic;
  let html = '';
  if (MS) html += '<button class="btn primary big" id="resumeEd" type="button" style="margin-bottom:14px">✏️ ' + esc(T('resumeMosaic')) + '</button>';
  html += await projectsCardHTML();
  html += '<div class="card"><h3><span class="num">1</span>' + esc(T('mainPhoto')) + '</h3>' +
    '<button class="pickbox" id="pickMain" type="button">' + (Setup.main ? '<canvas id="mainThumb"></canvas>' : '<span class="em">🖼️</span>') +
    '<span><b>' + esc(Setup.main ? (Setup.mainName || T('mainChosen')) : T('pickMain')) + '</b><br><small class="muted">' + esc(Setup.main ? T('tapToChange') + ' · ' + nf(Setup.main.width) + '×' + nf(Setup.main.height) : T('pickMainHint')) + '</small></span></button>' +
    '<div class="row" style="margin-top:10px"><button class="btn ghost sm" id="demoMain" type="button">✨ ' + esc(T('useSample')) + '</button></div></div>';

  html += '<div class="card"><h3><span class="num">2</span>' + esc(T('tileLib')) + '</h3>';
  if (libs.length) {
    html += '<div class="libs" id="libPick">';
    for (const l of libs) html += '<button class="lib' + (l.id === S.mosaic.lib ? ' sel' : '') + '" type="button" data-lib="' + l.id + '" aria-pressed="' + (l.id === S.mosaic.lib) + '"><div class="cov">' + await libCoverHTML(l) + '</div><div class="meta"><b>' + esc(l.name) + '</b><small>' + esc(T('nPhotos', { n: nf(l.count) })) + '</small></div></button>';
    html += '</div>';
  } else html += '<p class="muted">' + esc(T('noLibsYet')) + '</p>';
  html += '<div class="row" style="margin-top:12px"><button class="btn sm" id="addPhotos" type="button">➕ ' + esc(lib ? T('addToThisLib') : T('newLibPhotos')) + '</button>' +
    (lib ? '<button class="btn ghost sm" id="newLib" type="button">📚 ' + esc(T('newLib')) + '</button>' : '') +
    (!isCoarse() ? '<button class="btn ghost sm" id="addDir" type="button">📁 ' + esc(T('addFolder')) + '</button>' : '') +
    (!libs.some(l => l.demo) ? '<button class="btn ghost sm" id="demoLib" type="button">🎨 ' + esc(T('demoTiles')) + '</button>' : '') + '</div>';
  if (lib && lib.count < 60) html += '<div class="note">' + esc(T('fewTiles', { n: nf(lib.count) })) + '</div>';
  html += '</div>';

  const g = Setup.main ? gridFor(Setup.main.width, Setup.main.height, m.cols, m.aspect) : null;
  html += '<div class="card"><h3><span class="num">3</span>' + esc(T('mosaicSettings')) + '</h3>' +
    '<label class="f" for="colsR">' + esc(T('tilesAcross')) + ': <span class="val" id="colsV">' + nf(m.cols) + '</span></label>' +
    '<input type="range" id="colsR" min="15" max="150" step="1" value="' + m.cols + '">' +
    '<div class="small muted" id="gridInfo">' + (g ? esc(T('gridInfo', { c: nf(g.cols), r: nf(g.rows), n: nf(g.cols * g.rows) })) : esc(T('gridNeedsMain'))) + '</div>' +
    '<label class="f">' + esc(T('tileShape')) + '</label><div class="seg" data-k="aspect">' +
    ['1:1', '4:3', '3:4', 'hex'].map(a => '<button type="button" data-v="' + a + '" class="' + (m.aspect === a ? 'on' : '') + '">' + esc(T('asp_' + a.replace(':', '_'))) + '</button>').join('') + '</div>' +
    '<label class="f">' + esc(T('variety')) + '</label><div class="seg" data-k="variety">' +
    ['low', 'med', 'high'].map(v => '<button type="button" data-v="' + v + '" class="' + (m.variety === v ? 'on' : '') + '">' + esc(T('var_' + v)) + '</button>').join('') + '</div>' +
    '<div class="small muted" style="margin-top:6px">' + esc(T('varietyHint')) + '</div>' +
    '<label class="f">' + esc(T('outline')) + '</label><div class="seg" data-k="outline">' +
    OUTLINES.map(v => '<button type="button" data-v="' + v + '" class="' + (m.outline === v ? 'on' : '') + '">' + esc(T('ol_' + v)) + '</button>').join('') + '</div>' +
    (m.outline === 'text' ? '<label class="f" for="olText">' + esc(T('shapeText')) + '</label><input type="text" id="olText" maxlength="12" value="' + esc(m.outlineText || '') + '" placeholder="50">' : '') +
    (m.outline !== 'none' ? '<div class="small muted" style="margin-top:6px">' + esc(Setup.main ? T('outlineWithPhoto') : T('outlineNoPhoto')) + '</div>' +
      '<label class="f">' + esc(T('shapeBg')) + '</label><div class="swatches" id="olBg">' + ['#ffffff', '#000000', '#f3ead7', '#d4af37', '#1c2a44', '#ffe4ec'].map(c => '<button type="button" data-c="' + c + '" class="' + (m.shapeBg === c ? 'on' : '') + '" style="background:' + c + '" aria-label="' + c + '"></button>').join('') + '</div>' +
      (Setup.main ? '<div class="row" style="margin-top:8px"><button class="btn ghost sm" id="noMain" type="button">🌈 ' + esc(T('useRainbow')) + '</button></div>' : '') : '') +
    '<div class="sw" style="margin-top:8px"><span>' + esc(T('allowFlip')) + '<br><small class="muted">' + esc(T('allowFlipHint')) + '</small></span><label class="toggle"><input type="checkbox" id="flipT" ' + (m.flip ? 'checked' : '') + ' aria-label="' + esc(T('allowFlip')) + '"><span></span></label></div></div>' +
    '<button class="btn primary big" id="makeMosaic" type="button">✨ ' + esc(T('makeMosaic')) + '</button>';
  $('main').innerHTML = '<div class="screen">' + html + '</div>';

  if (Setup.main && $('mainThumb')) drawThumbInto($('mainThumb'), Setup.main);
  if ($('resumeEd')) $('resumeEd').onclick = () => go('editor');
  bindProjects(renderMosaicSetup);
  $('pickMain').onclick = async () => {
    const f = (await pickFiles('one'))[0]; if (!f) return;
    const p = Prog.show(T('loadingPhoto'), false);
    try { await setMain(await decodeImage(f), f.name.replace(/\.[^.]+$/, '')); } catch (e) { p.close(); toast(isHeic(f) ? T('heicFail', { n: 1 }) : T('decodeFail'), true); return; }
    p.close(); renderMosaicSetup();
  };
  $('demoMain').onclick = async () => { await setMain(await makeDemoMain(), T('sampleName')); renderMosaicSetup(); };
  document.querySelectorAll('#libPick [data-lib]').forEach(b => {
    b.onclick = () => { S.mosaic.lib = b.dataset.lib; saveS(); renderMosaicSetup(); };
    onLongPress(b, () => editLibDialog(b.dataset.lib, renderMosaicSetup));
  });
  const addTo = async kind => {
    const files = await pickFiles(kind); if (!files.length) return;
    let id = S.mosaic.lib;
    if (!id) { const l = await newLibrary(); id = l.id; S.mosaic.lib = id; saveS(); }
    await importToLib(id, files); renderMosaicSetup();
  };
  $('addPhotos').onclick = () => addTo('many');
  if ($('addDir')) $('addDir').onclick = () => addTo('dir');
  if ($('newLib')) $('newLib').onclick = async () => {
    const name = await promptBox(T('newLib'), T('libDefaultName', { d: df(Date.now()) }), T('create'));
    if (name == null) return;
    const l = await newLibrary(name); S.mosaic.lib = l.id; saveS();
    const files = await pickFiles('many'); if (files.length) await importToLib(l.id, files);
    renderMosaicSetup();
  };
  if ($('demoLib')) $('demoLib').onclick = async () => { const l = await makeDemoLibrary(); S.mosaic.lib = l.id; saveS(); toast(T('demoReady')); renderMosaicSetup(); };
  $('colsR').oninput = e => {
    m.cols = +e.target.value; $('colsV').textContent = nf(m.cols);
    if (Setup.main) { const g2 = gridFor(Setup.main.width, Setup.main.height, m.cols, m.aspect); $('gridInfo').textContent = T('gridInfo', { c: nf(g2.cols), r: nf(g2.rows), n: nf(g2.cols * g2.rows) }); }
  };
  $('colsR').onchange = () => saveS();
  document.querySelectorAll('.seg[data-k]').forEach(sg => sg.querySelectorAll('button').forEach(b => b.onclick = () => { m[sg.dataset.k] = b.dataset.v; saveS(); renderMosaicSetup(); }));
  $('flipT').onchange = e => { m.flip = e.target.checked; saveS(); };
  if ($('olText')) $('olText').oninput = e => { m.outlineText = e.target.value; saveS(); };
  document.querySelectorAll('#olBg [data-c]').forEach(b => b.onclick = () => { m.shapeBg = b.dataset.c; saveS(); renderMosaicSetup(); });
  if ($('noMain')) $('noMain').onclick = () => { if (Setup.main && !(MS && MS.main === Setup.main)) try { Setup.main.close(); } catch (e) {} Setup.main = null; Setup.mainName = ''; renderMosaicSetup(); };
  $('makeMosaic').onclick = () => createMosaic(false);
}

async function createMosaic(reseed) {
  reseed = reseed === true && !!MS;
  const m = S.mosaic;
  if (!reseed) {
    if (!Setup.main && m.outline === 'none') { toast(T('needMain'), true); return; }
    if (m.outline === 'text' && !String(m.outlineText || '').trim()) { toast(T('needShapeText'), true); return; }
    const lib = m.lib && await DB.get('libs', m.lib);
    if (!lib || !lib.count) { toast(T('needLib'), true); return; }
  }
  const p = Prog.show(T('creating'), true);
  try {
    let ms;
    if (reseed && MS) { ms = MS; }
    else {
      const cache = await LibCache.load(m.lib, p);
      if (!cache.tiles.length) throw new Error('empty');
      const a = ASPECTS[m.aspect];
      p.set(0.27, T('analyzing'));
      const tf = await tileFeatures(cache.minis, a, m.flip, cache.tc);
      if (p.cancelled) throw new Error('cancel');
      const synthetic = !Setup.main;
      const main = Setup.main || await makeRainbowMain(shapeRatio(m.outline, m.outlineText));
      const g = gridFor(main.width, main.height, m.cols, m.aspect);
      p.set(0.33, T('analyzing')); await yieldUI();
      const tg = targetFeatures(main, g);
      ms = { main, synthetic, outline: m.outline, outlineText: m.outlineText, tc: cache.tc, name: synthetic ? (m.outline === 'text' ? m.outlineText : T('ol_' + m.outline)) : Setup.mainName, libId: m.lib, tiles: cache.tiles, minis: cache.minis, cols: g.cols, rows: g.rows, a, hex: g.hex, aspect: m.aspect, src: g.src,
        tf: tf.feats, tileOf: tf.tileOf, flipOf: tf.flipOf, N: tf.N, cf: tg.feats, rgb: tg.rgb, variety: m.variety };
    }
    if (!reseed) ms.mask = makeMask(ms, ms.outline, ms.outlineText);
    const C = ms.cols * ms.rows, vp = varietyParams(ms.variety, ms.mask ? ms.mask.count : C, ms.N);
    const assign = await runMatch({ tf: ms.tf, tileOf: ms.tileOf, N: ms.N, cf: ms.cf, C, cols: ms.cols, maxRep: vp.maxRep, R: vp.R, seed: (Math.random() * 4e9) >>> 0, mask: ms.mask || null }, p);
    if (p.cancelled) throw new Error('cancel');
    ms.assign = assign; ms.undo = []; ms.redo = []; ms.saved = false;
    p.set(0.94, T('drawing')); await yieldUI();
    buildComposite(ms, m);
    if (!reseed) { ms.projectId = null; ms.mainBlob = null; }
    MS = ms; markDirty();
    p.close();
    if (reseed) { Ed.redraw(); Ed.syncUndo(); toast(T('reshuffled')); }
    else go('editor');
  } catch (e) {
    p.close();
    if (e && e.message === 'cancel') toast(T('cancelled'));
    else { logErr('createMosaic: ' + (e && e.message)); toast(T('mosaicFail'), true); }
  }
}

/* ── editor ── */
const Ed = {
  cv: null, x: null, dpr: 1, s: 1, tx: 0, ty: 0, sel: -1, hi: new Map(), loading: new Set(), raf: 0, ro: null,
  open() {
    const ed = $('editor');
    ed.innerHTML = '<header class="top"><button class="homebtn" id="edBack" type="button">' + (isRTL() ? '→ ' : '← ') + esc(T('back')) + '</button>' +
      '<h1>' + esc(T('mosaic')) + '</h1><button class="icobtn" id="edUndo" type="button" aria-label="' + esc(T('undo')) + '">↶</button><button class="icobtn" id="edRedo" type="button" aria-label="' + esc(T('redo')) + '">↷</button></header>' +
      '<div class="stage" id="stage"><canvas id="edCv" aria-label="' + esc(T('mosaicCanvas')) + '"></canvas><div class="hint" id="edHint"></div>' +
      '<div class="zoomctl"><button class="icobtn" id="zIn" type="button" aria-label="' + esc(T('zoomIn')) + '">＋</button><button class="icobtn" id="zOut" type="button" aria-label="' + esc(T('zoomOut')) + '">－</button><button class="icobtn" id="zFit" type="button" aria-label="' + esc(T('zoomFit')) + '">⤢</button></div></div>' +
      '<div class="dock"><div class="panel hidden" id="stylePanel"></div><div class="acts">' +
      '<button class="btn" id="edStyle" type="button" aria-expanded="false"><span class="i">🎨</span><span>' + esc(T('style')) + '</span></button>' +
      '<button class="btn primary" id="edExport" type="button"><span class="i">⬇️</span><span>' + esc(T('exportSave')) + '</span></button>' +
      '<button class="btn" id="edShuffle" type="button"><span class="i">🔀</span><span>' + esc(T('reshuffle')) + '</span></button>' +
      '<button class="btn" id="edProject" type="button"><span class="i">💾</span><span>' + esc(T('saveProject')) + '</span></button>' +
      '<button class="btn ghost" id="edSettings" type="button"><span class="i">⚙️</span><span>' + esc(T('changeSetup')) + '</span></button></div></div>';
    ed.classList.remove('hidden');
    this.cv = $('edCv'); this.x = this.cv.getContext('2d'); this.sel = -1;
    $('edBack').onclick = () => history.back();
    $('edUndo').onclick = () => this.undo(); $('edRedo').onclick = () => this.redoOp();
    $('zIn').onclick = () => this.zoomBy(1.6); $('zOut').onclick = () => this.zoomBy(1 / 1.6); $('zFit').onclick = () => { this.fit(); this.redraw(); };
    $('edStyle').onclick = () => this.toggleStyle();
    $('edExport').onclick = () => exportSheet();
    $('edShuffle').onclick = () => createMosaic(true);
    $('edProject').onclick = saveProject;
    $('edSettings').onclick = () => go('mosaic');
    this.bindGestures();
    if (this.ro) this.ro.disconnect();
    this.ro = new ResizeObserver(() => this.resize()); this.ro.observe($('stage'));
    this.resize(true); this.syncUndo();
    $('edHint').textContent = T('edHint', { n: nf(MS.cols * MS.rows) });
    clearTimeout(this._ht); this._ht = setTimeout(() => { const h = $('edHint'); if (h) h.classList.add('fade'); }, 5000);
  },
  close() { if (this.ro) this.ro.disconnect(); this.ro = null; $('editor').classList.add('hidden'); $('editor').innerHTML = ''; this.hi.forEach(b => { try { b.close(); } catch (e) {} }); this.hi.clear(); },
  resize(first) {
    const st = $('stage'); if (!st) return;
    const r = st.getBoundingClientRect(); this.dpr = Math.min(3, devicePixelRatio || 1);
    const cx = (r.width / 2 - this.tx) / this.s, cy = (r.height / 2 - this.ty) / this.s;
    this.cv.width = Math.round(r.width * this.dpr); this.cv.height = Math.round(r.height * this.dpr); this.W = r.width; this.H = r.height;
    if (first || !this._fitS) this.fit(); else { this.tx = r.width / 2 - cx * this.s; this.ty = r.height / 2 - cy * this.s; }
    this.redraw();
  },
  fit() {
    const cw = MS.comp.width, ch = MS.comp.height, pad = 12;
    this.s = this._fitS = Math.min((this.W - pad * 2) / cw, (this.H - pad * 2) / ch);
    this.tx = (this.W - cw * this.s) / 2; this.ty = (this.H - ch * this.s) / 2;
  },
  limits() { return [this._fitS * 0.6, Math.max(this._fitS * 2, 420 / MS.ch)]; },
  zoomAt(ns, px, py) {
    const [mn, mx] = this.limits(); ns = clamp(ns, mn, mx);
    const ux = (px - this.tx) / this.s, uy = (py - this.ty) / this.s;
    this.s = ns; this.tx = px - ux * ns; this.ty = py - uy * ns; this.clampPan(); this.redraw();
  },
  zoomBy(f) { this.zoomAt(this.s * f, this.W / 2, this.H / 2); },
  clampPan() {
    const w = MS.comp.width * this.s, h = MS.comp.height * this.s, m = 60;
    this.tx = clamp(this.tx, Math.min(m - w, (this.W - w) / 2), Math.max(this.W - m, (this.W - w) / 2));
    this.ty = clamp(this.ty, Math.min(m - h, (this.H - h) / 2), Math.max(this.H - m, (this.H - h) / 2));
  },
  redraw() { if (this.raf) return; this.raf = requestAnimationFrame(() => { this.raf = 0; this.paint(); }); },
  paint() {
    const x = this.x, m = MS, st = S.mosaic; if (!x || !m) return;
    x.setTransform(1, 0, 0, 1, 0, 0); x.clearRect(0, 0, this.cv.width, this.cv.height);
    x.setTransform(this.dpr * this.s, 0, 0, this.dpr * this.s, this.dpr * this.tx, this.dpr * this.ty);
    const cellPx = m.ch * this.s * this.dpr;
    x.imageSmoothingEnabled = true; x.imageSmoothingQuality = 'high';
    if (cellPx <= m.ch * 1.5) x.drawImage(m.comp, 0, 0);
    else {
      const vx0 = -this.tx / this.s, vy0 = -this.ty / this.s, vx1 = (this.W - this.tx) / this.s, vy1 = (this.H - this.ty) / this.s;
      const rs = m.hex ? 0.75 : 1, ro = m.hex ? 0.25 : 0, co = m.hex ? 0.5 : 0;
      const c0 = clamp(Math.floor(vx0 / m.cw - 1 + co), 0, m.cols - 1), c1 = clamp(Math.ceil(vx1 / m.cw + 1 + co), 0, m.cols);
      const r0 = clamp(Math.floor((vy0 / m.ch + ro) / rs - 1), 0, m.rows - 1), r1 = clamp(Math.ceil((vy1 / m.ch + ro) / rs + 1), 0, m.rows);
      x.save(); x.beginPath(); x.rect(Math.max(0, vx0), Math.max(0, vy0), Math.min(m.comp.width, vx1) - Math.max(0, vx0), Math.min(m.comp.height, vy1) - Math.max(0, vy0)); x.clip();
      paintBackground(x, m.comp.width, m.comp.height, st, m);
      const wantHi = cellPx > 70;
      for (let cy = r0; cy < r1; cy++) for (let cx = c0; cx < c1; cx++) {
        const i = cy * m.cols + cx, t = m.tileOf[m.assign[i]];
        let b = wantHi ? this.hi.get(t) : null;
        if (wantHi && !b) this.loadHi(t);
        const [px, py] = cellPos(m, i, m.cw, m.ch);
        drawCell(x, m, i, px, py, m.cw, m.ch, b || m.minis[t], st, m.comp.width, m.comp.height);
      }
      x.restore();
    }
    if (this.sel >= 0) {
      const [px, py] = cellPos(m, this.sel, m.cw, m.ch);
      x.lineWidth = 3 / this.s; x.strokeStyle = getComputedStyle(document.documentElement).getPropertyValue('--accent') || '#d4af37';
      cellPath(x, m, px, py, m.cw, m.ch, { shape: 'square', grout: 1 }); x.stroke();
    }
  },
  loadHi(t) {
    if (this.loading.has(t)) return; this.loading.add(t);
    createImageBitmap(MS.tiles[t].blob).then(b => {
      this.loading.delete(t); this.hi.set(t, b);
      if (this.hi.size > 160) { const k = this.hi.keys().next().value; try { this.hi.get(k).close(); } catch (e) {} this.hi.delete(k); }
      this.redraw();
    }).catch(() => this.loading.delete(t));
  },
  bindGestures() {
    const el = $('stage'), P = new Map(); let g = null;
    el.addEventListener('pointerdown', e => {
      if (e.target.closest('.zoomctl')) return;
      el.setPointerCapture(e.pointerId); P.set(e.pointerId, { x: e.offsetX, y: e.offsetY });
      if (P.size === 1) g = { k: 1, x: e.offsetX, y: e.offsetY, tx: this.tx, ty: this.ty, t: Date.now(), moved: false };
      else if (P.size === 2) { const [a, b] = [...P.values()]; g = { k: 2, d: Math.hypot(a.x - b.x, a.y - b.y) || 1, mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2, s: this.s, tx: this.tx, ty: this.ty, moved: true }; }
    });
    el.addEventListener('pointermove', e => {
      if (!P.has(e.pointerId) || !g) return;
      P.set(e.pointerId, { x: e.offsetX, y: e.offsetY });
      if (g.k === 1 && P.size === 1) {
        const dx = e.offsetX - g.x, dy = e.offsetY - g.y;
        if (Math.abs(dx) + Math.abs(dy) > 7) g.moved = true;
        if (g.moved) { this.tx = g.tx + dx; this.ty = g.ty + dy; this.clampPan(); this.redraw(); }
      } else if (g.k === 2 && P.size >= 2) {
        const [a, b] = [...P.values()]; const d = Math.hypot(a.x - b.x, a.y - b.y) || 1, mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
        const [mn, mxs] = this.limits(); const ns = clamp(g.s * d / g.d, mn, mxs);
        const ux = (g.mx - g.tx) / g.s, uy = (g.my - g.ty) / g.s;
        this.s = ns; this.tx = mx - ux * ns; this.ty = my - uy * ns; this.clampPan(); this.redraw();
      }
    });
    const end = e => {
      if (!P.has(e.pointerId)) return;
      P.delete(e.pointerId);
      if (g && g.k === 1 && !g.moved && Date.now() - g.t < 400 && e.type === 'pointerup') this.tap(e.offsetX, e.offsetY);
      if (P.size === 1) { const [a] = [...P.values()]; g = { k: 1, x: a.x, y: a.y, tx: this.tx, ty: this.ty, t: 0, moved: true }; }
      else if (!P.size) g = null;
    };
    el.addEventListener('pointerup', end); el.addEventListener('pointercancel', end);
    el.addEventListener('wheel', e => { e.preventDefault(); this.zoomAt(this.s * Math.pow(1.0015, -e.deltaY), e.offsetX, e.offsetY); }, { passive: false });
  },
  tap(px, py) {
    const m = MS, ux = (px - this.tx) / this.s, uy = (py - this.ty) / this.s;
    let i = (ux < 0 || uy < 0 || ux > m.comp.width || uy > m.comp.height) ? -1 : cellAt(m, ux, uy, m.cw, m.ch);
    if (i >= 0 && m.assign[i] < 0) i = -1; // outside the shape
    if (i < 0) { this.sel = -1; this.redraw(); return; }
    this.sel = i; this.redraw(); swapSheet(this.sel);
  },
  apply(i, e, rec) {
    const prev = MS.assign[i]; if (prev === e) return;
    MS.assign[i] = e; if (rec !== false) { MS.undo.push([i, prev, e]); MS.redo = []; }
    updateCompositeCell(MS, i, S.mosaic); this.redraw(); this.syncUndo(); markDirty();
  },
  undo() { const u = MS.undo.pop(); if (!u) return; MS.assign[u[0]] = u[1]; MS.redo.push(u); updateCompositeCell(MS, u[0], S.mosaic); this.sel = u[0]; this.redraw(); this.syncUndo(); markDirty(); },
  redoOp() { const u = MS.redo.pop(); if (!u) return; MS.assign[u[0]] = u[2]; MS.undo.push(u); updateCompositeCell(MS, u[0], S.mosaic); this.sel = u[0]; this.redraw(); this.syncUndo(); markDirty(); },
  syncUndo() { if ($('edUndo')) { $('edUndo').disabled = !MS.undo.length; $('edRedo').disabled = !MS.redo.length; $('edUndo').style.opacity = MS.undo.length ? 1 : .4; $('edRedo').style.opacity = MS.redo.length ? 1 : .4; } },
  toggleStyle() {
    const p = $('stylePanel'), open = p.classList.contains('hidden');
    $('edStyle').setAttribute('aria-expanded', open);
    if (!open) { p.classList.add('hidden'); return; }
    const st = S.mosaic;
    p.innerHTML = '<div class="grid2">' +
      '<div><label class="f" for="stTint">' + esc(T('tint')) + ': <span class="val" id="vTint">' + st.tint + '%</span></label><input type="range" id="stTint" min="0" max="60" value="' + st.tint + '"><div class="small muted">' + esc(T('tintHint')) + '</div></div>' +
      '<div><label class="f" for="stOver">' + esc(T('overlay')) + ': <span class="val" id="vOver">' + st.overlay + '%</span></label><input type="range" id="stOver" min="0" max="50" value="' + st.overlay + '"><div class="small muted">' + esc(T('overlayHint')) + '</div></div>' +
      '<div><label class="f" for="stGrout">' + esc(T('grout')) + ': <span class="val" id="vGrout">' + st.grout + '</span></label><input type="range" id="stGrout" min="0" max="8" value="' + st.grout + '"></div>' +
      '<div><label class="f">' + esc(T('groutColor')) + '</label><div class="swatches" id="stGC">' + ['#000000', '#ffffff', '#d4af37', '#1c2a44', '#7a1f2b'].map(c => '<button type="button" data-c="' + c + '" class="' + (st.groutColor === c ? 'on' : '') + '" style="background:' + c + '" aria-label="' + c + '"></button>').join('') +
      '<input type="color" id="stGCi" value="' + st.groutColor + '" aria-label="' + esc(T('customColor')) + '"></div></div>' +
      '</div>' + (MS.hex ? '' : '<label class="f">' + esc(T('shape')) + '</label><div class="seg" id="stShape">' +
      ['square', 'rounded', 'circle'].map(v => '<button type="button" data-v="' + v + '" class="' + (st.shape === v ? 'on' : '') + '">' + esc(T('sh_' + v)) + '</button>').join('') + '</div>');
    p.classList.remove('hidden');
    let tmr = 0;
    const rebuild = () => { clearTimeout(tmr); tmr = setTimeout(() => { buildComposite(MS, st); this.redraw(); saveS(); markDirty(); }, 60); };
    const bindR = (id, k, v, suf) => { $(id).oninput = e => { st[k] = +e.target.value; $(v).textContent = st[k] + (suf || ''); rebuild(); }; };
    bindR('stTint', 'tint', 'vTint', '%'); bindR('stOver', 'overlay', 'vOver', '%'); bindR('stGrout', 'grout', 'vGrout');
    $('stGC').querySelectorAll('[data-c]').forEach(b => b.onclick = () => { st.groutColor = b.dataset.c; $('stGC').querySelectorAll('[data-c]').forEach(z => z.classList.toggle('on', z === b)); $('stGCi').value = st.groutColor; rebuild(); });
    $('stGCi').oninput = e => { st.groutColor = e.target.value; $('stGC').querySelectorAll('[data-c]').forEach(z => z.classList.remove('on')); rebuild(); };
    if ($('stShape')) $('stShape').querySelectorAll('button').forEach(b => b.onclick = () => { st.shape = b.dataset.v; $('stShape').querySelectorAll('button').forEach(z => z.classList.toggle('on', z === b)); rebuild(); });
  }
};

/* swap sheet: best alternatives for one cell */
function swapSheet(i) {
  const m = MS, base = i * FD, M = m.tileOf.length, d = new Float32Array(M), idx = new Int32Array(M);
  for (let e = 0; e < M; e++) { let s = 0; const o = e * FD; for (let k = 0; k < FD; k++) { const t = m.cf[base + k] - m.tf[o + k]; s += t * t; } d[e] = s; idx[e] = e; }
  const order = [...idx].sort((a, b) => d[a] - d[b]);
  const cur = m.assign[i];
  const uses = new Int32Array(m.N); for (let k = 0; k < m.assign.length; k++) uses[m.tileOf[m.assign[k]]]++;
  let shown = 0;
  const mk = n => {
    let h = '';
    for (const e of order.slice(shown, shown + n)) {
      h += '<button type="button" data-e="' + e + '" class="' + (e === cur ? 'cur' : '') + '" aria-label="' + esc(T('useThis')) + '"><canvas data-e="' + e + '"></canvas>' + (m.flipOf[e] ? '<small>⇋</small>' : '') + '</button>';
    }
    shown += n; return h;
  };
  const md = openModal({
    title: T('swapTitle'),
    html: '<p class="small muted" style="margin-top:-4px">' + esc(T('swapHint', { u: nf(uses[m.tileOf[cur]]) })) + '</p><div class="alts" id="alts">' + mk(36) + '</div>' +
      '<div class="row" style="margin-top:10px"><button class="btn ghost sm" id="altMore" type="button">' + esc(T('showMore')) + '</button>' +
      '<button class="btn ghost sm" id="altFlip" type="button">⇋ ' + esc(T('flipThis')) + '</button></div>',
    onClose: () => { Ed.sel = -1; Ed.redraw(); },
    actions: [{ label: T('close'), cls: 'primary' }]
  });
  const paintAlts = () => {
    md.body.querySelectorAll('canvas[data-e]:not([data-p])').forEach(c => {
      const e = +c.dataset.e, b = m.minis[m.tileOf[e]], w = 96, h = Math.round(96 / m.a);
      c.width = w; c.height = h; c.dataset.p = 1;
      const t = m.tileOf[e], x = c.getContext('2d'), [sx, sy, sw, sh] = m.tc ? cropAt(b.width, b.height, m.a, m.tc[t * 2], m.tc[t * 2 + 1]) : cropToAspect(b.width, b.height, m.a);
      if (m.flipOf[e]) { x.translate(w, 0); x.scale(-1, 1); }
      x.drawImage(b, sx, sy, sw, sh, 0, 0, w, h);
    });
    md.body.querySelectorAll('button[data-e]:not([data-b])').forEach(b => { b.dataset.b = 1; b.onclick = () => { Ed.apply(i, +b.dataset.e); md.close(); }; });
  };
  paintAlts();
  $('altMore').onclick = () => { $('alts').insertAdjacentHTML('beforeend', mk(60)); paintAlts(); if (shown >= order.length) $('altMore').remove(); };
  const flipE = m.flipOf[cur] ? cur - m.N : cur + m.N;
  if (flipE >= 0 && flipE < M && m.tileOf[flipE] === m.tileOf[cur]) $('altFlip').onclick = () => { Ed.apply(i, flipE); md.close(); };
  else $('altFlip').remove();
}

/* export / save / share sheet (mosaic) */
function exportSheet() {
  const m = MS, st = S.mosaic;
  exportFlow({
    sizes: { '2k': 2048, '4k': 4096, '8k': 8192 }, sizeKey: () => st.size, setSize: k => { st.size = k; },
    dims: long => exportDims(m, long),
    render: (long, p) => renderExport(m, st, long, p, S.sign && !!S.name),
    kind: 'mosaic', name: () => m.name || T('mosaic'),
    thumb: () => thumbOf(m.comp, m.comp.width, m.comp.height),
    onSaved: () => { m.saved = true; },
    extra: [{ label: '🎬 ' + T('zoomVideo'), run: videoSheet }]
  });
}

/* ═══ CollageNest 1.4 — shaped mosaics: heart / circle / star / text (number, name)
   With a main photo → only cells inside the shape get tiles. Without one → a rainbow target, so the
   tiles arrange themselves by colour inside the shape. ═══ */

const OUTLINES = ['none', 'heart', 'circle', 'star', 'text'];
function outlineFont(px) { return '900 ' + px + 'px system-ui,-apple-system,"Segoe UI",Roboto,"Noto Sans Hebrew","Noto Sans Arabic",Arial,sans-serif'; }
function shapeRatio(kind, text) { // width / height of the shape itself
  if (kind !== 'text') return 1;
  const c = mkCanvas(10, 10), x = c.getContext('2d'); x.font = outlineFont(100);
  const w = x.measureText(text || '?').width; return clamp(w / 100, 0.4, 4.5);
}
function drawOutline(x, kind, text, W, H) { // filled shape centred in W×H with a small margin
  x.save(); x.fillStyle = '#000';
  const m = Math.min(W, H) * 0.04, w = W - 2 * m, h = H - 2 * m, cx = W / 2, cy = H / 2;
  x.beginPath();
  if (kind === 'circle') { x.ellipse(cx, cy, w / 2, h / 2, 0, 0, Math.PI * 2); x.fill(); }
  else if (kind === 'heart') {
    const s = Math.min(w, h), ox = cx - s / 2, oy = cy - s / 2;
    x.moveTo(ox + s * 0.5, oy + s * 0.96);
    x.bezierCurveTo(ox + s * 0.1, oy + s * 0.68, ox - s * 0.02, oy + s * 0.38, ox + s * 0.08, oy + s * 0.2);
    x.bezierCurveTo(ox + s * 0.2, oy + s * 0.0, ox + s * 0.44, oy + s * 0.02, ox + s * 0.5, oy + s * 0.2);
    x.bezierCurveTo(ox + s * 0.56, oy + s * 0.02, ox + s * 0.8, oy + s * 0.0, ox + s * 0.92, oy + s * 0.2);
    x.bezierCurveTo(ox + s * 1.02, oy + s * 0.38, ox + s * 0.9, oy + s * 0.68, ox + s * 0.5, oy + s * 0.96);
    x.fill();
  } else if (kind === 'star') {
    const R = Math.min(w, h) / 2, r = R * 0.45, yo = cy + R * 0.08;
    for (let k = 0; k < 10; k++) { const a = -Math.PI / 2 + k * Math.PI / 5, rr = k % 2 ? r : R; x[k ? 'lineTo' : 'moveTo'](cx + Math.cos(a) * rr, yo + Math.sin(a) * rr); }
    x.closePath(); x.fill();
  } else if (kind === 'text') {
    let fs = h; x.font = outlineFont(fs); let tw = x.measureText(text || '?').width;
    if (tw > w) { fs = fs * w / tw; x.font = outlineFont(fs); }
    x.textAlign = 'center'; x.textBaseline = 'middle';
    try { x.direction = /[֐-׿؀-ۿ]/.test(text) ? 'rtl' : 'ltr'; } catch (e) {}
    x.fillText(text || '?', cx, cy + fs * 0.04);
  }
  x.restore();
}
/* which cells are inside the shape (sampled at each cell centre) */
function makeMask(m, kind, text) {
  if (!kind || kind === 'none') return null;
  const [uw, uh] = gridUnits(m), MW = 600, MH = Math.max(8, Math.round(600 * uh / uw));
  const c = mkCanvas(MW, MH), x = c.getContext('2d', { willReadFrequently: true });
  drawOutline(x, kind, text, MW, MH);
  const d = x.getImageData(0, 0, MW, MH).data, C = m.cols * m.rows, mask = new Uint8Array(C);
  const cw = MW / uw * m.a, ch = MH / uh; let n = 0;
  for (let i = 0; i < C; i++) {
    const [px, py] = cellPos(m, i, cw, ch), sx = Math.round(px + cw / 2), sy = Math.round(py + ch / 2);
    if (sx >= 0 && sy >= 0 && sx < MW && sy < MH && d[(sy * MW + sx) * 4 + 3] > 127) { mask[i] = 1; n++; }
  }
  mask.count = n;
  return n ? mask : null;
}
/* rainbow target used when a shape has no main photo */
async function makeRainbowMain(ratio) {
  const W = ratio >= 1 ? 1400 : Math.round(1400 * ratio), H = ratio >= 1 ? Math.round(1400 / ratio) : 1400;
  const c = mkCanvas(W, H), x = c.getContext('2d');
  if (x.createConicGradient) {
    const g = x.createConicGradient(-Math.PI / 2, W / 2, H / 2);
    for (let k = 0; k <= 12; k++) g.addColorStop(k / 12, 'hsl(' + (k * 30) + ',75%,55%)');
    x.fillStyle = g;
  } else { const g = x.createLinearGradient(0, 0, W, H); for (let k = 0; k <= 6; k++) g.addColorStop(k / 6, 'hsl(' + (k * 60) + ',75%,55%)'); x.fillStyle = g; }
  x.fillRect(0, 0, W, H);
  const rg = x.createRadialGradient(W / 2, H / 2, 0, W / 2, H / 2, Math.max(W, H) * 0.55);
  rg.addColorStop(0, 'rgba(255,255,255,.55)'); rg.addColorStop(0.5, 'rgba(255,255,255,0)'); rg.addColorStop(1, 'rgba(0,0,0,.25)');
  x.fillStyle = rg; x.fillRect(0, 0, W, H);
  return await createImageBitmap(c);
}

/* ═══ CollageNest 1.4 — "zoom-out" video: starts on one photo and pulls back to the whole mosaic ═══
   Canvas → captureStream → MediaRecorder (MP4 when the browser can, otherwise WebM). Real-time:
   the screen must stay on while it records. Hi-res tiles for the close-up part are decoded first. */

function videoMime() {
  const c = ['video/mp4;codecs=avc1.42E01E', 'video/mp4;codecs=avc1', 'video/mp4', 'video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'];
  if (typeof MediaRecorder === 'undefined') return '';
  for (const m of c) { try { if (MediaRecorder.isTypeSupported(m)) return m; } catch (e) {} }
  return '';
}
function videoSheet() {
  const m = MS; if (!m) return;
  const st = S.video || (S.video = { fmt: '1:1', dur: 8 });
  if (!videoMime()) { toast(T('videoUnsupported'), true); return; }
  const md = openModal({
    title: T('zoomVideo'),
    html: '<p class="small muted" style="margin-top:-4px">' + esc(T('zoomVideoIntro')) + '</p>' +
      '<label class="f">' + esc(T('videoFormat')) + '</label><div class="seg" id="vfFmt">' + [['1:1', 'vf_square'], ['9:16', 'vf_story'], ['16:9', 'vf_wide']].map(([k, l]) => '<button type="button" data-v="' + k + '" class="' + (st.fmt === k ? 'on' : '') + '">' + esc(T(l)) + '</button>').join('') + '</div>' +
      '<label class="f">' + esc(T('videoLength')) + '</label><div class="seg" id="vfDur">' + [6, 8, 12, 16].map(s => '<button type="button" data-v="' + s + '" class="' + (st.dur === s ? 'on' : '') + '">' + esc(T('seconds', { n: s })) + '</button>').join('') + '</div>' +
      '<div class="note">' + esc(Ed.sel >= 0 ? T('videoFromSelected') : T('videoFromAuto')) + '<br>' + esc(T('videoKeepOn')) + '</div>',
    actions: [{ label: '🎬 ' + T('makeVideo'), cls: 'primary', keep: true, onClick: () => recordZoom(md) }]
  });
  [['vfFmt', 'fmt', v => v], ['vfDur', 'dur', v => +v]].forEach(([id, k, f]) => md.body.querySelectorAll('#' + id + ' button').forEach(b => b.onclick = () => { st[k] = f(b.dataset.v); saveS(); md.body.querySelectorAll('#' + id + ' button').forEach(z => z.classList.toggle('on', z === b)); }));
}
function pickStartCell(m) {
  if (Ed.sel >= 0 && m.assign[Ed.sel] >= 0) return Ed.sel;
  // a filled cell near the centre (inside the shape if there is one)
  const cx = m.comp.width / 2, cy = m.comp.height / 2; let best = 0, bd = Infinity;
  for (let i = 0; i < m.assign.length; i++) { if (m.assign[i] < 0) continue; const [px, py] = cellPos(m, i, m.cw, m.ch), d = (px - cx) ** 2 + (py - cy) ** 2; if (d < bd) { bd = d; best = i; } }
  return best;
}
async function recordZoom(md) {
  const m = MS, st = S.video, sty = S.mosaic, mime = videoMime();
  const [OW, OH] = st.fmt === '9:16' ? [1080, 1920] : st.fmt === '16:9' ? [1920, 1080] : [1080, 1080];
  const p = Prog.show(T('preparingVideo'), true);
  const cv = document.createElement('canvas'); cv.width = OW; cv.height = OH;
  Object.assign(cv.style, { position: 'fixed', left: '-9999px', top: '0', width: '10px', height: '10px' }); document.body.appendChild(cv);
  const x = cv.getContext('2d'); x.imageSmoothingEnabled = true; x.imageSmoothingQuality = 'high';
  const hi = new Map();
  try {
    const start = pickStartCell(m), [sx0, sy0] = cellPos(m, start, m.cw, m.ch);
    const tc = [sx0 + m.cw / 2, sy0 + m.ch / 2], ic = [m.comp.width / 2, m.comp.height / 2];
    const s0 = Math.min(OW, OH) * 0.8 / Math.max(m.cw, m.ch);                 // one tile ≈ 80% of the frame
    const s1 = Math.min(OW / m.comp.width, OH / m.comp.height) * 0.94;        // whole mosaic
    // decode hi-res tiles that appear while cells are big on screen
    const near = [], R = Math.ceil(Math.max(OW, OH) / (s0 * Math.min(m.cw, m.ch)) * 6) + 2;
    const scx = start % m.cols, scy = (start / m.cols) | 0;
    for (let y = Math.max(0, scy - R); y < Math.min(m.rows, scy + R); y++) for (let xx = Math.max(0, scx - R); xx < Math.min(m.cols, scx + R); xx++) { const i = y * m.cols + xx; if (m.assign[i] >= 0) near.push(m.tileOf[m.assign[i]]); }
    const uniq = [...new Set(near)].slice(0, 220);
    for (let k = 0; k < uniq.length; k++) {
      if (p.cancelled) throw new Error('cancel');
      try { hi.set(uniq[k], await createImageBitmap(m.tiles[uniq[k]].blob)); } catch (e) {}
      if (k % 10 === 0) p.set(0.3 * k / uniq.length, T('preparingVideo'));
    }
    const frame = t => { // t: 0..1 of the zoom part
      const e = t < 0 ? 0 : t > 1 ? 1 : (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2); // ease in-out
      const s = s0 * Math.pow(s1 / s0, e), f = (1 / s - 1 / s0) / (1 / s1 - 1 / s0);
      const cx = tc[0] + (ic[0] - tc[0]) * f, cy = tc[1] + (ic[1] - tc[1]) * f, tx = OW / 2 - cx * s, ty = OH / 2 - cy * s;
      x.setTransform(1, 0, 0, 1, 0, 0); x.fillStyle = m.mask ? (sty.shapeBg || '#fff') : '#0b0b0c'; x.fillRect(0, 0, OW, OH);
      x.setTransform(s, 0, 0, s, tx, ty);
      if (m.ch * s <= m.ch * 1.3) { x.drawImage(m.comp, 0, 0); return; }
      const vx0 = -tx / s, vy0 = -ty / s, vx1 = (OW - tx) / s, vy1 = (OH - ty) / s;
      x.save(); x.beginPath(); x.rect(0, 0, m.comp.width, m.comp.height); x.clip(); paintBackground(x, m.comp.width, m.comp.height, sty, m);
      const rs = m.hex ? 0.75 : 1, ro = m.hex ? 0.25 : 0, co = m.hex ? 0.5 : 0;
      const c0 = clamp(Math.floor(vx0 / m.cw - 1 + co), 0, m.cols - 1), c1 = clamp(Math.ceil(vx1 / m.cw + 1 + co), 0, m.cols);
      const r0 = clamp(Math.floor((vy0 / m.ch + ro) / rs - 1), 0, m.rows - 1), r1 = clamp(Math.ceil((vy1 / m.ch + ro) / rs + 1), 0, m.rows);
      for (let cy2 = r0; cy2 < r1; cy2++) for (let cx2 = c0; cx2 < c1; cx2++) {
        const i = cy2 * m.cols + cx2; if (m.assign[i] < 0) continue;
        const t2 = m.tileOf[m.assign[i]], [px, py] = cellPos(m, i, m.cw, m.ch);
        drawCell(x, m, i, px, py, m.cw, m.ch, hi.get(t2) || m.minis[t2], sty, m.comp.width, m.comp.height);
      }
      x.restore();
    };
    frame(0);
    const stream = cv.captureStream(30), rec = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 8e6 }), chunks = [];
    rec.ondataavailable = e => { if (e.data && e.data.size) chunks.push(e.data); };
    const done = new Promise(r => { rec.onstop = r; });
    rec.start(250);
    const D = st.dur * 1000, zoomPart = D * 0.82, t0 = performance.now();
    await new Promise((res, rej) => {
      const step = () => {
        if (p.cancelled) { rej(new Error('cancel')); return; }
        const el = performance.now() - t0;
        frame(Math.max(0, el - D * 0.06) / zoomPart);
        p.set(0.3 + 0.68 * Math.min(1, el / D), T('recordingVideo', { s: Math.max(0, Math.ceil((D - el) / 1000)) }));
        if (el >= D) res(); else requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    }).finally(() => { try { rec.stop(); } catch (e) {} stream.getTracks().forEach(t => t.stop()); });
    await done;
    const blob = new Blob(chunks, { type: mime.split(';')[0] }), ext = mime.includes('mp4') ? 'mp4' : 'webm';
    p.close();
    if (!blob.size) { toast(T('videoFail'), true); return; }
    const name = 'CollageNest-zoom-' + fileStamp() + '.' + ext;
    md.close();
    const vm = openModal({
      title: T('videoReady'),
      html: '<video controls playsinline autoplay muted loop style="width:100%;max-height:55vh;border-radius:12px;background:#000" src="' + trackURL(URL.createObjectURL(blob)) + '"></video>' +
        '<p class="small muted">' + esc(T('videoInfo', { s: st.dur, f: ext.toUpperCase(), mb: (blob.size / 1048576).toFixed(1) })) + (ext === 'webm' ? ' ' + esc(T('webmNote')) : '') + '</p>',
      actions: [{ label: '⬇️ ' + T('download'), cls: 'primary', keep: true, onClick: () => downloadBlob(blob, name) }, { label: '📤 ' + T('share'), keep: true, onClick: () => shareBlob(blob, name) }, { label: T('close'), cls: 'ghost' }]
    });
    window.__lastVideo = blob; void vm;
  } catch (e) {
    p.close();
    if (e && e.message === 'cancel') toast(T('cancelled')); else { logErr('video: ' + (e && e.message)); toast(T('videoFail'), true); }
  } finally { hi.forEach(b => { try { b.close(); } catch (e) {} }); cv.remove(); }
}

(window.__MODS = window.__MODS || {})['cn-mosaic.js'] = '1.5.0';
