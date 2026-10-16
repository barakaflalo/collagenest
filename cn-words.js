/* CollageNest 1.5.0 · cn-words.js — word mosaic + print wall */
/* ═══ CollageNest 1.4 — word mosaic: the photo shows only through lines of repeated text ═══
   Text is drawn as a white mask; the (boosted) photo is clipped to it with destination-in.
   Works in every script (Hebrew, Arabic joining stays intact because whole strings are drawn). */

const WS = { main: null, name: '' };
function wordsDims(long) { const b = WS.main, a = b ? b.width / b.height : 1; return a >= 1 ? { W: long, H: Math.round(long / a) } : { W: Math.round(long * a), H: long }; }
function renderWords(W, H) {
  const st = S.words, b = WS.main;
  const c = document.createElement('canvas'); c.width = W; c.height = H; const x = c.getContext('2d');
  x.fillStyle = st.bg; x.fillRect(0, 0, W, H);
  if (!b) return c;
  // photo layer (a little brighter / more saturated so thin letters still read)
  const ph = document.createElement('canvas'); ph.width = W; ph.height = H; const px = ph.getContext('2d');
  try { px.filter = 'saturate(' + st.boost + ') contrast(1.12) brightness(' + (1 + (st.boost - 1) * 0.35) + ')'; } catch (e) {}
  px.imageSmoothingQuality = 'high'; px.drawImage(b, 0, 0, W, H); px.filter = 'none';
  // text mask
  const mk = document.createElement('canvas'); mk.width = W; mk.height = H; const mx = mk.getContext('2d');
  const lh = Math.max(4, st.size / 100 * H), fs = lh * 0.92, txt = (st.text || '').replace(/\s+/g, ' ').trim() || 'CollageNest';
  mx.font = FONTS[st.font || 'sans'].replace('{s}', Math.round(fs));
  mx.fillStyle = '#fff'; mx.textBaseline = 'middle';
  const rtl = /[֐-׿؀-ۿ]/.test(txt);
  try { mx.direction = rtl ? 'rtl' : 'ltr'; } catch (e) {}
  mx.textAlign = rtl ? 'right' : 'left';
  const unit = txt + ' · ', uw = Math.max(1, mx.measureText(unit).width), reps = Math.ceil(W / uw) + 2;
  const line = unit.repeat(reps);
  for (let y = lh / 2, r = 0; y < H + lh; y += lh, r++) {
    const shift = ((r * 0.38) % 1) * uw; // offset each row so words do not stack in columns
    mx.fillText(line, rtl ? W + shift : -shift, y);
  }
  px.globalCompositeOperation = 'destination-in'; px.drawImage(mk, 0, 0);
  x.drawImage(ph, 0, 0);
  mk.width = mk.height = ph.width = ph.height = 1;
  return c;
}
async function renderWordsSetup() {
  const st = S.words;
  $('main').innerHTML = '<div class="screen">' +
    '<div class="card"><h3>🔤 ' + esc(T('wordsTitle')) + '</h3><p class="muted" style="margin-top:0">' + esc(T('wordsIntro')) + '</p>' +
    '<button class="pickbox" id="wPick" type="button">' + (WS.main ? '<canvas id="wThumb"></canvas>' : '<span class="em">🖼️</span>') + '<span><b>' + esc(WS.main ? (WS.name || T('mainChosen')) : T('pickMain')) + '</b><br><small class="muted">' + esc(WS.main ? T('tapToChange') : T('wordsPhotoHint')) + '</small></span></button>' +
    '<div class="row" style="margin-top:10px"><button class="btn ghost sm" id="wSample" type="button">✨ ' + esc(T('useSample')) + '</button></div></div>' +
    '<div class="card"><label class="f" for="wText">' + esc(T('wordsText')) + '</label><input type="text" id="wText" maxlength="60" value="' + esc(st.text) + '" placeholder="' + esc(T('wordsPh')) + '">' +
    '<label class="f" for="wSize">' + esc(T('lineSize')) + ': <span class="val" id="wSizeV">' + st.size + '</span></label><input type="range" id="wSize" min="1.2" max="8" step="0.1" value="' + st.size + '">' +
    '<div class="small muted">' + esc(T('lineSizeHint')) + '</div>' +
    '<label class="f">' + esc(T('font')) + '</label><div class="seg" id="wFont">' + ['sans', 'serif', 'script'].map(v => '<button type="button" data-v="' + v + '" class="' + (st.font === v ? 'on' : '') + '">' + esc(T('fn_' + v)) + '</button>').join('') + '</div>' +
    '<label class="f">' + esc(T('background')) + '</label><div class="swatches" id="wBg">' + ['#0b0b0c', '#ffffff', '#1c2a44', '#2a1630', '#f3ead7'].map(c => '<button type="button" data-c="' + c + '" class="' + (st.bg === c ? 'on' : '') + '" style="background:' + c + '" aria-label="' + c + '"></button>').join('') + '<input type="color" id="wBgI" value="' + st.bg + '" aria-label="' + esc(T('customColor')) + '"></div>' +
    '<label class="f" for="wBoost">' + esc(T('colorBoost')) + ': <span class="val" id="wBoostV">' + Math.round(st.boost * 100) + '%</span></label><input type="range" id="wBoost" min="1" max="2" step="0.05" value="' + st.boost + '"></div>' +
    '<div class="card" style="padding:10px"><canvas id="wPrev" style="width:100%;border-radius:10px;display:block;background:var(--bg3)" aria-label="' + esc(T('preview')) + '"></canvas></div>' +
    '<button class="btn primary big" id="wExport" type="button"' + (WS.main ? '' : ' disabled') + '>⬇️ ' + esc(T('exportSave')) + '</button></div>';
  if (WS.main && $('wThumb')) drawThumbInto($('wThumb'), WS.main);
  const prev = () => {
    const cv = $('wPrev'); if (!cv) return;
    if (!WS.main) { cv.width = 900; cv.height = 300; const x = cv.getContext('2d'); x.fillStyle = S.words.bg; x.fillRect(0, 0, 900, 300); return; }
    const d = wordsDims(900), r = renderWords(d.W, d.H); cv.width = d.W; cv.height = d.H; cv.getContext('2d').drawImage(r, 0, 0);
  };
  let tm = 0; const later = () => { clearTimeout(tm); tm = setTimeout(prev, 90); saveS(); };
  prev();
  $('wPick').onclick = async () => {
    const f = (await pickFiles('one'))[0]; if (!f) return;
    const p = Prog.show(T('loadingPhoto'), false);
    try { const b = await decodeScaled(f, 3000); if (WS.main) try { WS.main.close(); } catch (e) {} WS.main = b; WS.name = f.name.replace(/\.[^.]+$/, ''); } catch (e) { p.close(); toast(T('decodeFail'), true); return; }
    p.close(); renderWordsSetup();
  };
  $('wSample').onclick = async () => { WS.main = await makeDemoMain(); WS.name = T('sampleName'); renderWordsSetup(); };
  $('wText').oninput = e => { st.text = e.target.value; later(); };
  $('wSize').oninput = e => { st.size = +e.target.value; $('wSizeV').textContent = st.size; later(); };
  $('wBoost').oninput = e => { st.boost = +e.target.value; $('wBoostV').textContent = Math.round(st.boost * 100) + '%'; later(); };
  $('wFont').querySelectorAll('button').forEach(b => b.onclick = () => { st.font = b.dataset.v; $('wFont').querySelectorAll('button').forEach(z => z.classList.toggle('on', z === b)); later(); });
  $('wBg').querySelectorAll('[data-c]').forEach(b => b.onclick = () => { st.bg = b.dataset.c; $('wBgI').value = st.bg; $('wBg').querySelectorAll('[data-c]').forEach(z => z.classList.toggle('on', z === b)); later(); });
  $('wBgI').oninput = e => { st.bg = e.target.value; later(); };
  $('wExport').onclick = () => {
    if (!WS.main) { toast(T('needMain'), true); return; }
    const sizes = isCoarse() ? { '2k': 2048, '3k': 3072, '4k': 4096 } : { '2k': 2048, '4k': 4096, '8k': 8192 };
    if (!sizes[st.exSize]) st.exSize = '4k';
    exportFlow({
      sizes, sizeKey: () => st.exSize, setSize: k => { st.exSize = k; },
      dims: long => wordsDims(long),
      render: async long => { const d = wordsDims(long), c = renderWords(d.W, d.H); if (S.sign && S.name) drawSignature(c.getContext('2d'), d.W, d.H); return { c, W: d.W, H: d.H }; },
      kind: 'words', name: () => (st.text || T('wordsTitle')).slice(0, 40),
      thumb: async () => { const d = wordsDims(360); return await canvasToBlob(renderWords(d.W, d.H), 'image/jpeg', 0.82); }
    });
  };
}

/* ═══ CollageNest 1.4 — print wall: any creation split into A4/A3 pages (PDF, crop marks, page labels) ═══ */

const JSPDF_URLS = [
  'https://cdn.jsdelivr.net/npm/jspdf@2.5.1/dist/jspdf.umd.min.js',
  'https://unpkg.com/jspdf@2.5.1/dist/jspdf.umd.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js'
];
const PAPERS = { a4: [210, 297], a3: [297, 420] };
function wallPlan(aspect, paper, orient, cols) { // all in mm
  let [pw, ph] = PAPERS[paper] || PAPERS.a4;
  if (orient === 'land') [pw, ph] = [ph, pw];
  const mg = 8, cw = pw - mg * 2, chh = ph - mg * 2;
  const totalW = cols * cw, totalH = totalW / aspect, rows = Math.max(1, Math.ceil(totalH / chh - 0.02));
  return { pw, ph, mg, cw, ch: chh, cols, rows, totalW, totalH, pages: cols * rows };
}
function printWall(o) {
  const st = S.print || (S.print = { paper: 'a4', orient: 'port', cols: 3 });
  const d0 = o.dims(1000), aspect = d0.W / d0.H;
  const info = () => { const w = wallPlan(aspect, st.paper, st.orient, st.cols); return T('wallInfo', { c: nf(w.cols), r: nf(w.rows), n: nf(w.pages), w: nf(Math.round(w.totalW / 10)), h: nf(Math.round(w.totalH / 10)) }); };
  const md = openModal({
    title: T('printWall'),
    html: '<p class="small muted" style="margin-top:-4px">' + esc(T('printWallIntro')) + '</p>' +
      '<label class="f">' + esc(T('paper')) + '</label><div class="seg" id="pwPaper">' + Object.keys(PAPERS).map(k => '<button type="button" data-v="' + k + '" class="' + (st.paper === k ? 'on' : '') + '">' + k.toUpperCase() + '</button>').join('') + '</div>' +
      '<label class="f">' + esc(T('orientation')) + '</label><div class="seg" id="pwOr">' + ['port', 'land'].map(k => '<button type="button" data-v="' + k + '" class="' + (st.orient === k ? 'on' : '') + '">' + esc(T('or_' + k)) + '</button>').join('') + '</div>' +
      '<label class="f" for="pwCols">' + esc(T('pagesAcross')) + ': <span class="val" id="pwColsV">' + st.cols + '</span></label><input type="range" id="pwCols" min="1" max="8" value="' + st.cols + '">' +
      '<div class="note" id="pwInfo">' + esc(info()) + '</div>',
    actions: [
      { label: '⬇️ ' + T('downloadPdf'), cls: 'primary', keep: true, onClick: () => run('download') },
      { label: '📤 ' + T('share'), keep: true, onClick: () => run('share') }
    ]
  });
  const upd = () => { $('pwInfo').textContent = info(); saveS(); };
  [['pwPaper', 'paper'], ['pwOr', 'orient']].forEach(([id, k]) => md.body.querySelectorAll('#' + id + ' button').forEach(b => b.onclick = () => { st[k] = b.dataset.v; md.body.querySelectorAll('#' + id + ' button').forEach(z => z.classList.toggle('on', z === b)); upd(); }));
  $('pwCols').oninput = e => { st.cols = +e.target.value; $('pwColsV').textContent = st.cols; upd(); };
  async function run(kind) {
    const p = Prog.show(T('makingWall'), true);
    try {
      p.set(0.02, T('loadingPdf'));
      await loadScript(JSPDF_URLS, () => !!(window.jspdf && window.jspdf.jsPDF));
      const w = wallPlan(aspect, st.paper, st.orient, st.cols);
      // resolution: aim for 150 dpi, capped by what the device can hold
      const maxArea = isCoarse() ? 24e6 : 60e6;
      let pxmm = 150 / 25.4; if (w.totalW * pxmm * w.totalH * pxmm > maxArea) pxmm = Math.sqrt(maxArea / (w.totalW * w.totalH));
      const long = Math.round(Math.max(w.totalW, w.totalH) * pxmm);
      const r = await o.render(long, p);
      if (p.cancelled) throw new Error('cancel');
      const k = r.W / w.totalW; // px per mm in the rendered image
      const pdf = new window.jspdf.jsPDF({ orientation: w.pw > w.ph ? 'landscape' : 'portrait', unit: 'mm', format: st.paper, compress: true });
      const pg = document.createElement('canvas'), px = pg.getContext('2d');
      const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
      let n = 0;
      for (let row = 0; row < w.rows; row++) for (let col = 0; col < w.cols; col++) {
        if (p.cancelled) throw new Error('cancel');
        if (n) pdf.addPage(st.paper, w.pw > w.ph ? 'landscape' : 'portrait');
        const sx = col * w.cw * k, sy = row * w.ch * k, sw = Math.min(w.cw * k, r.W - sx), sh = Math.min(w.ch * k, r.H - sy);
        if (sw > 1 && sh > 1) {
          pg.width = Math.round(sw); pg.height = Math.round(sh);
          px.drawImage(r.c, sx, sy, sw, sh, 0, 0, pg.width, pg.height);
          pdf.addImage(pg.toDataURL('image/jpeg', 0.9), 'JPEG', w.mg, w.mg, sw / k, sh / k, undefined, 'FAST');
        }
        // crop marks at the content corners + label
        const x0 = w.mg, y0 = w.mg, x1 = w.mg + w.cw, y1 = w.mg + w.ch, L = 5;
        pdf.setDrawColor(120); pdf.setLineWidth(0.2);
        [[x0, y0], [x1, y0], [x0, y1], [x1, y1]].forEach(([cx, cy]) => { pdf.line(cx - (cx === x0 ? L : -1), cy, cx + (cx === x0 ? -1 : L), cy); pdf.line(cx, cy - (cy === y0 ? L : -1), cx, cy + (cy === y0 ? -1 : L)); });
        pdf.setFontSize(8); pdf.setTextColor(110);
        pdf.text((letters[row] || ('R' + (row + 1))) + (col + 1) + '  ·  ' + (n + 1) + '/' + w.pages + '  ·  CollageNest', w.pw / 2, w.ph - 3, { align: 'center' });
        n++; p.set(0.9 + 0.09 * n / w.pages, T('pageN', { n: nf(n), t: nf(w.pages) })); await yieldUI();
      }
      r.c.width = r.c.height = 1; pg.width = pg.height = 1;
      const blob = pdf.output('blob'), name = 'CollageNest-wall-' + st.paper + '-' + w.cols + 'x' + w.rows + '-' + fileStamp() + '.pdf';
      p.close();
      if (kind === 'share') await shareBlob(blob, name); else { downloadBlob(blob, name); toast(T('wallDone', { n: nf(w.pages) })); }
    } catch (e) {
      p.close();
      if (e && e.message === 'cancel') toast(T('cancelled'));
      else { logErr('wall: ' + (e && e.message)); toast(e && e.message === 'cdn' ? T('pdfUnavailable') : T('exportFail'), true); }
    }
  }
}

(window.__MODS = window.__MODS || {})['cn-words.js'] = '1.5.0';
