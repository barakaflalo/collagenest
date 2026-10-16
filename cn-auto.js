/* CollageNest 1.5.0 · cn-auto.js — AutoCollage */
/* ═══ CollageNest — AutoCollage: analyse → pick best → layout → seams → multi-band blend (worker) ═══
   Face detection: face-api (TinyFaceDetector) loaded lazily from CDN, runs on the device.
   No faces library (offline / blocked)? → saliency-only, with an honest notice. */

const FACE_VER = '1.7.15';
const FACE_JS = ['https://cdn.jsdelivr.net/npm/@vladmandic/face-api@' + FACE_VER + '/dist/face-api.js', 'https://unpkg.com/@vladmandic/face-api@' + FACE_VER + '/dist/face-api.js'];
const FACE_MODEL = ['https://cdn.jsdelivr.net/npm/@vladmandic/face-api@' + FACE_VER + '/model/', 'https://unpkg.com/@vladmandic/face-api@' + FACE_VER + '/model/'];
const AUTO_MAX = 200;
let _faces = null;
function loadFaces() {
  if (_faces) return _faces;
  _faces = (async () => {
    await loadScript(FACE_JS, () => typeof window.faceapi === 'object' && !!window.faceapi.nets);
    const fa = window.faceapi;
    try { await fa.tf.setBackend('webgl'); await fa.tf.ready(); } catch (e) { await fa.tf.setBackend('cpu'); await fa.tf.ready(); }
    let ok = false;
    for (const u of FACE_MODEL) { try { await fa.nets.tinyFaceDetector.loadFromUri(u); ok = true; break; } catch (e) {} }
    if (!ok) throw new Error('model');
    return fa;
  })();
  _faces.catch(() => { _faces = null; });
  return _faces;
}
async function detectFaces(fa, canvas) {
  const r = await fa.detectAllFaces(canvas, new fa.TinyFaceDetectorOptions({ inputSize: 320, scoreThreshold: 0.6 }));
  return r.map(d => ({ x: d.box.x / canvas.width, y: d.box.y / canvas.height, w: d.box.width / canvas.width, h: d.box.height / canvas.height, s: d.score }))
    .filter(f => f.w > 0.02 && f.h > 0.02);
}

/* decode at reduced size (fast JPEG downscale when the browser supports it) */
async function decodeScaled(file, maxSide) {
  try {
    const b = await createImageBitmap(file, { imageOrientation: 'from-image', resizeWidth: maxSide, resizeQuality: 'high' });
    if (b.height <= maxSide * 1.05) return b;
    const h = await createImageBitmap(file, { imageOrientation: 'from-image', resizeHeight: maxSide, resizeQuality: 'high' }); b.close(); return h;
  } catch (e) {}
  const b = await decodeImage(file);
  const s = Math.min(1, maxSide / Math.max(b.width, b.height)); if (s >= 1) return b;
  const c = mkCanvas(Math.round(b.width * s), Math.round(b.height * s)), x = c.getContext('2d');
  x.imageSmoothingQuality = 'high'; x.drawImage(b, 0, 0, c.width, c.height); b.close();
  return await createImageBitmap(c);
}

/* per-photo analysis: thumb, colour histogram, sharpness, exposure, saliency grid, faces, ROI */
async function analysePhoto(file, fa) {
  const bmp = await decodeScaled(file, 512);
  const W = bmp.width, H = bmp.height, A = W / H;
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const x = c.getContext('2d', { willReadFrequently: true }); x.drawImage(bmp, 0, 0);
  const tb = await scaledBlob(c, W, H, 200, 0.8);
  // small working copy
  const sw = 96, sh = Math.max(8, Math.round(96 / A));
  const sc = document.createElement('canvas'); sc.width = sw; sc.height = sh;
  const sx = sc.getContext('2d', { willReadFrequently: true }); sx.imageSmoothingQuality = 'high'; sx.drawImage(bmp, 0, 0, sw, sh);
  const d = sx.getImageData(0, 0, sw, sh).data;
  const hist = new Float32Array(64); let lum = 0, lum2 = 0, sat = 0; const n = sw * sh;
  const gray = new Float32Array(n), lab = new Float32Array(n * 3);
  for (let i = 0, p = 0; i < n; i++, p += 4) {
    const r = d[p], g = d[p + 1], b = d[p + 2];
    hist[(r >> 6) * 16 + (g >> 6) * 4 + (b >> 6)] += 1 / n;
    const y = 0.299 * r + 0.587 * g + 0.114 * b; gray[i] = y; lum += y; lum2 += y * y;
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b); sat += mx ? (mx - mn) / mx : 0;
    lin2lab(LIN[r], LIN[g], LIN[b], lab, i * 3);
  }
  lum /= n; const contrast = Math.sqrt(Math.max(0, lum2 / n - lum * lum)); sat /= n;
  // sharpness: variance of Laplacian on a mid-size grey copy
  const gw = 256, gh = Math.max(8, Math.round(256 / A));
  const gc = document.createElement('canvas'); gc.width = gw; gc.height = gh;
  const gx = gc.getContext('2d', { willReadFrequently: true }); gx.drawImage(bmp, 0, 0, gw, gh);
  const gd = gx.getImageData(0, 0, gw, gh).data; let ls = 0, ls2 = 0, ln = 0;
  const gy = k => 0.299 * gd[k * 4] + 0.587 * gd[k * 4 + 1] + 0.114 * gd[k * 4 + 2];
  for (let y = 1; y < gh - 1; y++) for (let xx = 1; xx < gw - 1; xx++) { const k = y * gw + xx; const L = 4 * gy(k) - gy(k - 1) - gy(k + 1) - gy(k - gw) - gy(k + gw); ls += L; ls2 += L * L; ln++; }
  const sharp = ls2 / ln - (ls / ln) * (ls / ln);
  // saliency: colour distinctiveness + local contrast + soft centre bias, on a 24-wide grid
  const SW = 24, SH = Math.max(6, Math.round(24 / A)), sal = new Float32Array(SW * SH);
  let mL = 0, ma = 0, mb = 0; for (let i = 0; i < n; i++) { mL += lab[i * 3]; ma += lab[i * 3 + 1]; mb += lab[i * 3 + 2]; } mL /= n; ma /= n; mb /= n;
  const cell = new Float32Array(SW * SH * 3), cnt = new Float32Array(SW * SH);
  for (let y = 0; y < sh; y++) for (let xx = 0; xx < sw; xx++) { const i = y * sw + xx, k = Math.min(SH - 1, Math.floor(y / sh * SH)) * SW + Math.min(SW - 1, Math.floor(xx / sw * SW)); cell[k * 3] += lab[i * 3]; cell[k * 3 + 1] += lab[i * 3 + 1]; cell[k * 3 + 2] += lab[i * 3 + 2]; cnt[k]++; }
  for (let k = 0; k < SW * SH; k++) { const m = cnt[k] || 1; cell[k * 3] /= m; cell[k * 3 + 1] /= m; cell[k * 3 + 2] /= m; }
  let smax = 1e-6;
  for (let y = 0; y < SH; y++) for (let xx = 0; xx < SW; xx++) {
    const k = y * SW + xx, L = cell[k * 3], a = cell[k * 3 + 1], b = cell[k * 3 + 2];
    const glob = Math.hypot(L - mL, (a - ma) * 1.3, (b - mb) * 1.3);
    let loc = 0, ln2 = 0;
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) { const yy = y + dy, x2 = xx + dx; if ((dx || dy) && yy >= 0 && x2 >= 0 && yy < SH && x2 < SW) { const q = yy * SW + x2; loc += Math.hypot(L - cell[q * 3], a - cell[q * 3 + 1], b - cell[q * 3 + 2]); ln2++; } }
    const cx = (xx + 0.5) / SW - 0.5, cy = (y + 0.5) / SH - 0.5;
    const v = (glob * 0.6 + (loc / (ln2 || 1)) * 0.9) * (1 - 0.9 * (cx * cx + cy * cy));
    sal[k] = v; if (v > smax) smax = v;
  }
  for (let k = 0; k < sal.length; k++) sal[k] /= smax;
  let faces = [];
  if (fa) { try { faces = await detectFaces(fa, c); } catch (e) { logErr('faces: ' + (e && e.message)); } }
  for (const f of faces) {
    const x0 = Math.floor((f.x - f.w * 0.3) * SW), x1 = Math.ceil((f.x + f.w * 1.3) * SW), y0 = Math.floor((f.y - f.h * 0.4) * SH), y1 = Math.ceil((f.y + f.h * 1.4) * SH);
    for (let y = Math.max(0, y0); y < Math.min(SH, y1); y++) for (let xx = Math.max(0, x0); xx < Math.min(SW, x1); xx++) sal[y * SW + xx] = Math.max(sal[y * SW + xx], 1);
  }
  // ROI: box around strong saliency (and all faces), at least 45% of each side
  let rx0 = 1, ry0 = 1, rx1 = 0, ry1 = 0;
  for (let y = 0; y < SH; y++) for (let xx = 0; xx < SW; xx++) if (sal[y * SW + xx] > 0.55) { rx0 = Math.min(rx0, xx / SW); ry0 = Math.min(ry0, y / SH); rx1 = Math.max(rx1, (xx + 1) / SW); ry1 = Math.max(ry1, (y + 1) / SH); }
  for (const f of faces) { rx0 = Math.min(rx0, f.x - f.w * 0.25); ry0 = Math.min(ry0, f.y - f.h * 0.35); rx1 = Math.max(rx1, f.x + f.w * 1.25); ry1 = Math.max(ry1, f.y + f.h * 1.25); }
  if (rx1 <= rx0) { rx0 = 0.25; ry0 = 0.25; rx1 = 0.75; ry1 = 0.75; }
  const grow = (a0, a1, min) => { let w = a1 - a0; if (w < min) { const c2 = (a0 + a1) / 2; a0 = c2 - min / 2; a1 = c2 + min / 2; } if (a0 < 0) { a1 -= a0; a0 = 0; } if (a1 > 1) { a0 -= a1 - 1; a1 = 1; } return [Math.max(0, a0), Math.min(1, a1)]; };
  [rx0, rx1] = grow(rx0, rx1, 0.45); [ry0, ry1] = grow(ry0, ry1, 0.45);
  bmp.close();
  const expo = 1 - Math.min(1, Math.abs(lum - 125) / 125) * 0.8 - (contrast < 25 ? 0.3 : 0);
  const LGW = 48, LGH = Math.max(4, sh >> 1), lg = new Float32Array(LGW * LGH * 3);
  for (let y = 0; y < LGH; y++) for (let xx = 0; xx < LGW; xx++) for (let c = 0; c < 3; c++) {
    let v = 0, m = 0; for (let dy = 0; dy < 2; dy++) for (let dx = 0; dx < 2; dx++) { const yy = Math.min(sh - 1, y * 2 + dy), x2 = Math.min(sw - 1, xx * 2 + dx); v += lab[(yy * sw + x2) * 3 + c]; m++; }
    lg[(y * LGW + xx) * 3 + c] = v / m;
  }
  return { file, name: file.name || '', w: W, h: H, a: A, thumb: tb.blob, hist, sharp, expo, sat, contrast, sal, sw: SW, sh: SH, lg, lgw: LGW, lgh: LGH, faces, roi: { x: rx0, y: ry0, w: rx1 - rx0, h: ry1 - ry0 }, boost: 0, mode: 'auto' };
}
const histDist = (a, b) => { let s = 0; for (let i = 0; i < 64; i++) s += Math.abs(a[i] - b[i]); return s / 2; };

/* choose K photos: quality + faces, then variety; near-duplicates are skipped */
function autoK(n) { return n <= 6 ? n : clamp(Math.round(3 + Math.sqrt(n)), 5, 10); }
function selectPhotos(ps, K) {
  const sh = ps.map(p => Math.log(1 + p.sharp)), smx = Math.max(...sh, 1e-6), smn = Math.min(...sh);
  ps.forEach((p, i) => {
    p.q = 0.45 * ((sh[i] - smn) / ((smx - smn) || 1)) + 0.3 * clamp(p.expo, 0, 1) + 0.25 * clamp(p.sat * 2, 0, 1);
    p.qf = p.q + (p.faces.length ? 0.35 + Math.min(0.25, p.faces.reduce((s, f) => s + f.w * f.h, 0) * 2) : 0);
    p.dup = -1; p.sel = false;
  });
  // mark near-duplicates (keep the better one)
  const order = ps.map((p, i) => i).sort((a, b) => ps[b].qf - ps[a].qf);
  const kept = [];
  for (const i of order) { const j = kept.find(k => histDist(ps[i].hist, ps[k].hist) < 0.09 && Math.abs(ps[i].a - ps[k].a) < 0.15); if (j != null) ps[i].dup = j; else kept.push(i); }
  const chosen = ps.map((p, i) => i).filter(i => ps[i].mode === 'pin');
  const pool = ps.map((p, i) => i).filter(i => ps[i].mode === 'auto' && ps[i].dup < 0);
  while (chosen.length < K && pool.length) {
    let best = -1, bv = -1e9;
    for (const i of pool) {
      const div = chosen.length ? Math.min(...chosen.map(c => histDist(ps[i].hist, ps[c].hist))) : 0.5;
      const v = ps[i].qf * 0.55 + div * 0.9; if (v > bv) { bv = v; best = i; }
    }
    chosen.push(best); pool.splice(pool.indexOf(best), 1);
  }
  if (chosen.length < Math.min(K, 2)) { // allow duplicates when nothing else is left
    for (const i of order) if (chosen.length < K && !chosen.includes(i) && ps[i].mode !== 'out') chosen.push(i);
  }
  chosen.forEach(i => ps[i].sel = true);
  return chosen;
}

/* ── layout in a virtual canvas (height 1000) ── */
function seeded(seed) { let s = seed >>> 0 || 7; return () => { s ^= s << 13; s >>>= 0; s ^= s >> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; }; }
function placeIn(p, i, r) { // photo p (index i) into region r: ROI centred, photo covers the region with room to blend
  const iw = p.a * 1000, ih = 1000;
  const sCover = Math.max(r.w / iw, r.h / ih) * 1.18;
  const sRoi = Math.min(r.w * 0.94 / (p.roi.w * iw), r.h * 0.94 / (p.roi.h * ih));
  const s = clamp(sRoi, sCover, sCover * 1.7), dw = iw * s, dh = ih * s;
  let ox = r.x + r.w / 2 - (p.roi.x + p.roi.w / 2) * dw, oy = r.y + r.h / 2 - (p.roi.y + p.roi.h / 2) * dh;
  ox = clamp(ox, r.x + r.w - dw, r.x); oy = clamp(oy, r.y + r.h - dh, r.y);
  return { i, rect: r, ox, oy, dw, dh };
}
function makeLayout(ps, chosen, ratio, seed) {
  const R = seeded(seed), VH = 1000, VW = Math.round(1000 * ratio);
  const items = chosen.map(i => ({ i, w: 1 + (ps[i].faces.length ? 0.7 : 0) + ps[i].boost + R() * 0.25 }));
  for (let k = items.length - 1; k > 0; k--) { const j = Math.floor(R() * (k + 1)); [items[k], items[j]] = [items[j], items[k]]; }
  const leaves = [];
  (function split(rect, its) {
    if (its.length === 1) { leaves.push({ rect, w: its[0].w }); return; }
    const tot = its.reduce((s, t) => s + t.w, 0); let best = 1, bd = 1e9, acc = 0;
    for (let k = 1; k < its.length; k++) { acc += its[k - 1].w; const dd = Math.abs(acc - tot / 2); if (dd < bd) { bd = dd; best = k; } }
    const L = its.slice(0, best), Rr = its.slice(best);
    const f = clamp(L.reduce((s, t) => s + t.w, 0) / tot + (R() - 0.5) * 0.08, 0.28, 0.72);
    if (rect.w >= rect.h) { const w1 = rect.w * f; split({ x: rect.x, y: rect.y, w: w1, h: rect.h }, L); split({ x: rect.x + w1, y: rect.y, w: rect.w - w1, h: rect.h }, Rr); }
    else { const h1 = rect.h * f; split({ x: rect.x, y: rect.y, w: rect.w, h: h1 }, L); split({ x: rect.x, y: rect.y + h1, w: rect.w, h: rect.h - h1 }, Rr); }
  })({ x: 0, y: 0, w: VW, h: VH }, items);
  // assign photos to leaves: big leaves first, best aspect match (faces prefer bigger leaves)
  leaves.sort((a, b) => b.rect.w * b.rect.h - a.rect.w * a.rect.h);
  const free = chosen.slice(), place = [];
  for (const lf of leaves) {
    const la = lf.rect.w / lf.rect.h; let bi = 0, bv = 1e9;
    free.forEach((i, k) => { const p = ps[i], ra = p.a * p.roi.w / p.roi.h; const v = Math.abs(Math.log(ra / la)) - (p.faces.length ? 0.25 : 0) - p.boost * 0.3; if (v < bv) { bv = v; bi = k; } });
    const i = free.splice(bi, 1)[0];
    place.push(placeIn(ps[i], i, lf.rect));
  }
  return { VW, VH, place };
}

/* label map: which photo shows at each spot.
   Unary = saliency + own region + protected faces; pairwise = seam cost that is low where the two
   photos look alike there (graph-cut style energy, minimised with ICM) → seams hide in similar areas. */
function labelMap(ps, L, cons) {
  const LW = L.VW >= L.VH ? 200 : Math.round(200 * L.VW / L.VH), LH = Math.round(LW * L.VH / L.VW), c = L.VW / LW, N = LW * LH;
  const K = L.place.length, sc = new Float32Array(N * K).fill(-1e9), col = new Float32Array(N * K * 3), lab = new Int8Array(N), face = new Int8Array(N).fill(-1);
  const diag = Math.hypot(L.VW, L.VH);
  L.place.forEach((pl, k) => {
    const p = ps[pl.i], r = pl.rect;
    for (let y = 0; y < LH; y++) for (let x = 0; x < LW; x++) {
      const px = (x + 0.5) * c, py = (y + 0.5) * c, u = (px - pl.ox) / pl.dw, v = (py - pl.oy) / pl.dh;
      if (u < 0.004 || v < 0.004 || u > 0.996 || v > 0.996) continue;
      const q = y * LW + x;
      const sx = Math.min(p.sw - 1, Math.floor(u * p.sw)), sy = Math.min(p.sh - 1, Math.floor(v * p.sh)), sal = p.sal[sy * p.sw + sx];
      const gx = Math.min(p.lgw - 1, Math.floor(u * p.lgw)), gy = Math.min(p.lgh - 1, Math.floor(v * p.lgh)), gi = (gy * p.lgw + gx) * 3;
      col[(q * K + k) * 3] = p.lg[gi]; col[(q * K + k) * 3 + 1] = p.lg[gi + 1]; col[(q * K + k) * 3 + 2] = p.lg[gi + 2];
      const dx = Math.max(r.x - px, 0, px - (r.x + r.w)), dy = Math.max(r.y - py, 0, py - (r.y + r.h)), dd = Math.hypot(dx, dy) / diag;
      const prior = dd === 0 ? 1 : Math.max(-1.5, 1 - dd * 10);
      const edge = Math.min(u, v, 1 - u, 1 - v) < 0.05 ? -1 : 0;
      const dark = p.lg[gi] < 6 ? -0.6 : 0; // black borders / vignettes lose
      sc[q * K + k] = sal * 1.1 + prior * 1.3 + edge + dark + p.boost * 0.5;
    }
    for (const f of p.faces) {
      const fx0 = pl.ox + (f.x - f.w * 0.2) * pl.dw, fx1 = pl.ox + (f.x + f.w * 1.2) * pl.dw, fy0 = pl.oy + (f.y - f.h * 0.35) * pl.dh, fy1 = pl.oy + (f.y + f.h * 1.2) * pl.dh;
      for (let y = Math.max(0, Math.floor(fy0 / c)); y < Math.min(LH, Math.ceil(fy1 / c)); y++) for (let x = Math.max(0, Math.floor(fx0 / c)); x < Math.min(LW, Math.ceil(fx1 / c)); x++) {
        const q = y * LW + x; if (sc[q * K + k] > -1e8) { sc[q * K + k] += 3; if (face[q] < 0) face[q] = k; }
      }
    }
  });
  if (cons && cons.N === N && cons.K === K) for (let q = 0; q < N; q++) { // brush: green = keep what is shown here, red = remove it
    for (let k = 0; k < K; k++) if (cons.hide[q * K + k] && sc[q * K + k] > -1e8) { sc[q * K + k] -= 40; if (face[q] === k) face[q] = -1; } // the user's "remove" beats face protection
    const kk = cons.keep[q]; if (kk >= 0 && sc[q * K + kk] > -1e8) { sc[q * K + kk] += 6; face[q] = kk; }
  }
  for (let q = 0; q < N; q++) { let b = 0, bv = -1e10; for (let k = 0; k < K; k++) if (sc[q * K + k] > bv) { bv = sc[q * K + k]; b = k; } lab[q] = b; }
  const lam = 0.42, kap = 0.07;
  const seam = (q, n, a, b) => { // cost of a seam between cell q (label a) and neighbour n (label b)
    const ia = (q * K + a) * 3, ib = (q * K + b) * 3, na = (n * K + a) * 3, nb = (n * K + b) * 3;
    let d = 0;
    if (sc[q * K + b] > -1e8) d += Math.abs(col[ia] - col[ib]) + Math.abs(col[ia + 1] - col[ib + 1]) + Math.abs(col[ia + 2] - col[ib + 2]); else d += 60;
    if (sc[n * K + a] > -1e8) d += Math.abs(col[na] - col[nb]) + Math.abs(col[na + 1] - col[nb + 1]) + Math.abs(col[na + 2] - col[nb + 2]); else d += 60;
    return lam * (1 + kap * d);
  };
  const nb4 = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1]];
  for (let it = 0; it < 10; it++) {
    for (let y = 0; y < LH; y++) for (let x = 0; x < LW; x++) {
      const q = y * LW + x; if (face[q] >= 0) { lab[q] = face[q]; continue; }
      let best = lab[q], bE = 1e18;
      for (let k = 0; k < K; k++) {
        if (sc[q * K + k] < -1e8) continue;
        let E = -sc[q * K + k];
        for (let j = 0; j < 8; j++) { const xx = x + nb4[j][0], yy = y + nb4[j][1]; if (xx < 0 || yy < 0 || xx >= LW || yy >= LH) continue; const n = yy * LW + xx, l = lab[n]; if (l !== k) E += seam(q, n, k, l) * (j < 4 ? 1 : 0.7); }
        if (E < bE) { bE = E; best = k; }
      }
      lab[q] = best;
    }
  }
  const area = new Float32Array(K); for (let q = 0; q < N; q++) area[lab[q]]++;
  return { LW, LH, N, K, lab, area: [...area].map(a => a / N) };
}

/* ── multi-band (Laplacian pyramid) blending worker ── */
function blendWorkerCore() {
  let W, H, NL, acc = [], dims = [];
  function down(src, w, h, ch) { // binomial 5-tap blur + decimate
    const w2 = Math.max(1, (w + 1) >> 1), h2 = Math.max(1, (h + 1) >> 1), tmp = new Float32Array(w2 * h * ch), out = new Float32Array(w2 * h2 * ch);
    const K = [1, 4, 6, 4, 1];
    for (let y = 0; y < h; y++) for (let x = 0; x < w2; x++) for (let c = 0; c < ch; c++) { let s = 0; for (let k = -2; k <= 2; k++) { const xx = Math.min(w - 1, Math.max(0, 2 * x + k)); s += K[k + 2] * src[(y * w + xx) * ch + c]; } tmp[(y * w2 + x) * ch + c] = s / 16; }
    for (let y = 0; y < h2; y++) for (let x = 0; x < w2; x++) for (let c = 0; c < ch; c++) { let s = 0; for (let k = -2; k <= 2; k++) { const yy = Math.min(h - 1, Math.max(0, 2 * y + k)); s += K[k + 2] * tmp[(yy * w2 + x) * ch + c]; } out[(y * w2 + x) * ch + c] = s / 16; }
    return out;
  }
  function up(src, w2, h2, w, h, ch) { // bilinear expand to w×h
    const out = new Float32Array(w * h * ch);
    for (let y = 0; y < h; y++) { const fy = Math.min(h2 - 1, Math.max(0, (y + 0.5) / 2 - 0.5)), y0 = Math.floor(fy), y1 = Math.min(h2 - 1, y0 + 1), ty = fy - y0;
      for (let x = 0; x < w; x++) { const fx = Math.min(w2 - 1, Math.max(0, (x + 0.5) / 2 - 0.5)), x0 = Math.floor(fx), x1 = Math.min(w2 - 1, x0 + 1), tx = fx - x0;
        for (let c = 0; c < ch; c++) { const a = src[(y0 * w2 + x0) * ch + c], b = src[(y0 * w2 + x1) * ch + c], d = src[(y1 * w2 + x0) * ch + c], e = src[(y1 * w2 + x1) * ch + c];
          out[(y * w + x) * ch + c] = (a * (1 - tx) + b * tx) * (1 - ty) + (d * (1 - tx) + e * tx) * ty; } } }
    return out;
  }
  onmessage = e => {
    const m = e.data;
    if (m.t === 'init') {
      W = m.W; H = m.H; NL = m.L; acc = []; dims = []; let w = W, h = H;
      for (let l = 0; l <= NL; l++) { dims.push([w, h]); acc.push(new Float32Array(w * h * 3)); w = Math.max(1, (w + 1) >> 1); h = Math.max(1, (h + 1) >> 1); }
      postMessage({ t: 'ok' });
    } else if (m.t === 'add') {
      const n = W * H; let g = new Float32Array(n * 3), mk = new Float32Array(n);
      for (let i = 0; i < n; i++) { g[i * 3] = m.rgba[i * 4]; g[i * 3 + 1] = m.rgba[i * 4 + 1]; g[i * 3 + 2] = m.rgba[i * 4 + 2]; mk[i] = m.mask[i] / 255; }
      for (let l = 0; l <= NL; l++) {
        const [w, h] = dims[l], A = acc[l];
        if (l < NL) {
          const [w2, h2] = dims[l + 1], gn = down(g, w, h, 3), mn = down(mk, w, h, 1), u = up(gn, w2, h2, w, h, 3);
          for (let i = 0; i < w * h; i++) { const a = mk[i]; if (a) { A[i * 3] += (g[i * 3] - u[i * 3]) * a; A[i * 3 + 1] += (g[i * 3 + 1] - u[i * 3 + 1]) * a; A[i * 3 + 2] += (g[i * 3 + 2] - u[i * 3 + 2]) * a; } }
          g = gn; mk = mn;
        } else for (let i = 0; i < w * h; i++) { const a = mk[i]; A[i * 3] += g[i * 3] * a; A[i * 3 + 1] += g[i * 3 + 1] * a; A[i * 3 + 2] += g[i * 3 + 2] * a; }
      }
      postMessage({ t: 'ok' });
    } else if (m.t === 'done') {
      let o = acc[NL];
      for (let l = NL - 1; l >= 0; l--) { const [w, h] = dims[l], [w2, h2] = dims[l + 1], u = up(o, w2, h2, w, h, 3), A = acc[l]; for (let i = 0; i < u.length; i++) u[i] += A[i]; o = u; }
      const out = new Uint8ClampedArray(W * H * 4);
      for (let i = 0; i < W * H; i++) { out[i * 4] = o[i * 3]; out[i * 4 + 1] = o[i * 3 + 1]; out[i * 4 + 2] = o[i * 3 + 2]; out[i * 4 + 3] = 255; }
      acc = []; postMessage({ t: 'res', out }, [out.buffer]);
    }
  };
}
let _blendURL = null;
function blendWorker() {
  if (!_blendURL) _blendURL = URL.createObjectURL(new Blob(['(' + blendWorkerCore.toString() + ')();'], { type: 'text/javascript' }));
  const w = new Worker(_blendURL); let res = null, rej = null;
  w.onmessage = e => { const r = res; res = rej = null; r && r(e.data); };
  w.onerror = e => { const r = rej; res = rej = null; r && r(new Error(e.message || 'worker')); };
  return { call(msg, tr) { return new Promise((a, b) => { res = a; rej = b; w.postMessage(msg, tr || []); }); }, end() { w.terminate(); } };
}

/* render a layout at a given output height → canvas */
async function renderAuto(ps, L, LM, OH, p, p0, p1) {
  const f = OH / L.VH, OW = Math.round(L.VW * f);
  const NL = Math.max(1, Math.min(6, Math.floor(Math.log2(Math.min(OW, OH) / 40))));
  const wk = blendWorker();
  try {
    await wk.call({ t: 'init', W: OW, H: OH, L: NL });
    const cv = document.createElement('canvas'); cv.width = OW; cv.height = OH;
    const x = cv.getContext('2d', { willReadFrequently: true });
    const mc = document.createElement('canvas'); mc.width = LM.LW; mc.height = LM.LH; const mx = mc.getContext('2d', { willReadFrequently: true });
    const big = document.createElement('canvas'); big.width = OW; big.height = OH; const bx = big.getContext('2d', { willReadFrequently: true });
    for (let k = 0; k < L.place.length; k++) {
      if (p && p.cancelled) throw new Error('cancel');
      const pl = L.place[k], ph = ps[pl.i];
      const need = Math.ceil(Math.max(pl.dw, pl.dh) * f * 1.05);
      const b = await decodeScaled(ph.file, clamp(need, 256, 4096));
      x.save(); x.filter = 'blur(' + Math.round(OH / 30) + 'px)';
      const s0 = Math.max(OW / b.width, OH / b.height) * 1.1; x.drawImage(b, (OW - b.width * s0) / 2, (OH - b.height * s0) / 2, b.width * s0, b.height * s0); x.restore();
      x.imageSmoothingQuality = 'high'; x.drawImage(b, pl.ox * f, pl.oy * f, pl.dw * f, pl.dh * f); b.close();
      const rgba = x.getImageData(0, 0, OW, OH).data;
      const md = mx.createImageData(LM.LW, LM.LH);
      for (let q = 0; q < LM.lab.length; q++) { const v = LM.lab[q] === k ? 255 : 0; md.data[q * 4] = md.data[q * 4 + 1] = md.data[q * 4 + 2] = v; md.data[q * 4 + 3] = 255; }
      mx.putImageData(md, 0, 0);
      bx.imageSmoothingEnabled = true; bx.imageSmoothingQuality = 'high'; bx.drawImage(mc, 0, 0, OW, OH);
      const bd = bx.getImageData(0, 0, OW, OH).data, mask = new Uint8Array(OW * OH);
      for (let i = 0; i < mask.length; i++) mask[i] = bd[i * 4];
      if (p) p.set(p0 + (p1 - p0) * (k + 0.5) / L.place.length, T('blendingN', { n: nf(k + 1), t: nf(L.place.length) }));
      await wk.call({ t: 'add', rgba, mask }, [rgba.buffer, mask.buffer]);
    }
    if (p) p.set(p1, T('finishing'));
    const r = await wk.call({ t: 'done' });
    x.putImageData(new ImageData(r.out, OW, OH), 0, 0);
    big.width = big.height = mc.width = mc.height = 1;
    return { c: cv, W: OW, H: OH };
  } finally { wk.end(); }
}


/* ── tidy styles: "album" (framed prints, slight tilt, shadow) and "grid" (clean layout, thin gaps) ── */
function cropAround(bw, bh, a, roi) {
  const [, , cw, ch] = cropToAspect(bw, bh, a);
  const cx = (roi.x + roi.w / 2) * bw, cy = (roi.y + roi.h / 2) * bh;
  return [clamp(cx - cw / 2, 0, bw - cw), clamp(cy - ch / 2, 0, bh - ch), cw, ch];
}
function albumBoxes(L, f, seed) { // shared by render + tap hit-test
  const R = seeded((seed ^ 0x9e3779b9) >>> 0);
  return L.place.map((pl, k) => {
    const r = pl.rect, sz = 0.84 + R() * 0.1;
    return { k, cx: (r.x + r.w / 2 + (R() - 0.5) * r.w * 0.06) * f, cy: (r.y + r.h / 2 + (R() - 0.5) * r.h * 0.06) * f, w: r.w * f * sz, h: r.h * f * sz, rot: (R() - 0.5) * 0.17, area: r.w * r.h };
  }).sort((a, b) => b.area - a.area); // big first → small ones on top, so every photo is seen
}
async function renderSimple(ps, L, OH, style, p, seed) {
  const f = OH / L.VH, OW = Math.round(L.VW * f), m = Math.min(OW, OH);
  const c = document.createElement('canvas'); c.width = OW; c.height = OH; const x = c.getContext('2d');
  x.imageSmoothingEnabled = true; x.imageSmoothingQuality = 'high';
  if (style === 'grid') { x.fillStyle = S.auto.gridBg || '#ffffff'; x.fillRect(0, 0, OW, OH); }
  else { const g = x.createRadialGradient(OW / 2, OH / 2, m * 0.1, OW / 2, OH / 2, Math.hypot(OW, OH) / 1.5); g.addColorStop(0, '#f7f1e4'); g.addColorStop(1, '#cdbd9f'); x.fillStyle = g; x.fillRect(0, 0, OW, OH); }
  const boxes = style === 'album' ? albumBoxes(L, f, seed != null ? seed : AS.seed) : L.place.map((pl, k) => ({ k }));
  for (let n = 0; n < boxes.length; n++) {
    if (p && p.cancelled) throw new Error('cancel');
    const bx = boxes[n], pl = L.place[bx.k], ph = ps[pl.i];
    let rx, ry, rw, rh;
    if (style === 'grid') { const g = m * 0.007; rx = pl.rect.x * f + g; ry = pl.rect.y * f + g; rw = pl.rect.w * f - 2 * g; rh = pl.rect.h * f - 2 * g; }
    else { rw = bx.w; rh = bx.h; }
    const b = await decodeScaled(ph.file, clamp(Math.ceil(Math.max(rw, rh) * 1.25), 256, 4096));
    const [sx, sy, sw, sh] = cropAround(b.width, b.height, rw / rh, ph.roi);
    if (style === 'grid') {
      x.save(); x.beginPath(); if (x.roundRect) x.roundRect(rx, ry, rw, rh, m * 0.006); else x.rect(rx, ry, rw, rh); x.clip();
      x.drawImage(b, sx, sy, sw, sh, rx, ry, rw, rh); x.restore();
    } else {
      const bd = m * 0.016;
      x.save(); x.translate(bx.cx, bx.cy); x.rotate(bx.rot);
      x.shadowColor = 'rgba(0,0,0,.38)'; x.shadowBlur = m * 0.025; x.shadowOffsetY = m * 0.007;
      x.fillStyle = '#fdfcf8'; x.fillRect(-rw / 2 - bd, -rh / 2 - bd, rw + bd * 2, rh + bd * 3.2);
      x.shadowColor = 'transparent'; x.drawImage(b, sx, sy, sw, sh, -rw / 2, -rh / 2, rw, rh);
      x.restore();
    }
    b.close();
    if (p) p.set(0.1 + 0.85 * (n + 1) / boxes.length, T('drawingN', { n: nf(n + 1), t: nf(boxes.length) }));
  }
  return { c, W: OW, H: OH };
}
function renderAutoAny(OH, p, p0, p1) {
  return S.auto.style === 'blend' ? renderAuto(AS.ps, AS.L, AS.LM, OH, p, p0, p1) : renderSimple(AS.ps, AS.L, OH, S.auto.style, p);
}

/* ── session + screens ── */
let AS = null; // { ps:[], chosen:[], ratio, seed, L, LM, prev:{c,W,H}, saved }
const AUTO_RATIOS = { '4:3': 4 / 3, '3:2': 1.5, '16:9': 16 / 9, '1:1': 1, '4:5': 0.8, '9:16': 9 / 16 };
async function analyseFiles(files) {
  files = files.filter(isImageFile);
  if (!files.length) return;
  if (files.length > AUTO_MAX) { toast(T('autoMax', { n: AUTO_MAX }), true); files = files.slice(0, AUTO_MAX); }
  const p = Prog.show(T('analysingPhotos'), true);
  let fa = null;
  if (S.auto.faces) {
    p.set(0.02, T('loadingFaces'));
    try { fa = await loadFaces(); AS_faceState = 'ok'; } catch (e) { AS_faceState = 'fail'; logErr('faceapi: ' + (e && e.message)); }
  } else AS_faceState = 'off';
  const ps = AS && AS.ps ? AS.ps.slice() : [];
  const have = new Set(ps.map(x => x.name + '|' + x.file.size));
  let failed = 0;
  for (let i = 0; i < files.length && !p.cancelled; i++) {
    const f = files[i]; if (have.has(f.name + '|' + f.size)) continue;
    try { ps.push(await analysePhoto(f, fa)); } catch (e) { failed++; }
    p.set(0.05 + 0.95 * (i + 1) / files.length, T('analysedN', { n: nf(i + 1), t: nf(files.length) }));
    if (i % 4 === 3) await yieldUI();
  }
  p.close();
  if (!ps.length) { toast(T('decodeFail'), true); return; }
  AS = { ps, text: (AS && AS.text) || newText(), chosen: [], ratio: S.auto.ratio, seed: (Math.random() * 4e9) >>> 0, L: null, LM: null, prev: null, saved: false };
  reselect();
  if (AS_faceState === 'fail') toast(T('facesUnavailable'), true);
  else if (failed) toast(T('failedN', { n: nf(failed) }), true);
}
let AS_faceState = 'idle';
function reselect() { const K = S.auto.count ? Math.min(S.auto.count, AS.ps.filter(p => p.mode !== 'out').length) : autoK(AS.ps.filter(p => p.mode !== 'out').length); AS.chosen = selectPhotos(AS.ps, Math.max(1, K)); }

async function renderAutoSetup() {
  const st = S.auto; let html = '<div class="screen">';
  if (AS && AS.prev) html += '<button class="btn primary big" id="aResume" type="button" style="margin-bottom:14px">✏️ ' + esc(T('resumeAuto')) + '</button>';
  html += '<div class="card"><h3>✨ ' + esc(T('autoTitle')) + '</h3><p class="muted" style="margin-top:0">' + esc(T('autoIntro')) + '</p>' +
    '<button class="pickbox" id="aPick" type="button"><span class="em">📸</span><span><b>' + esc(AS ? T('addMorePhotos') : T('pickTripPhotos')) + '</b><br><small class="muted">' + esc(T('pickTripHint', { n: AUTO_MAX })) + '</small></span></button>';
  if (AS) {
    const ps = AS.ps, faces = ps.reduce((s, p) => s + p.faces.length, 0), dups = ps.filter(p => p.dup >= 0).length;
    html += '<div class="note">' + esc(T('autoPicked', { k: nf(AS.chosen.length), n: nf(ps.length) })) + (faces ? ' · 🙂 ' + esc(T('facesFound', { n: nf(faces) })) : '') + (dups ? ' · ' + esc(T('dupsFound', { n: nf(dups) })) : '') + '</div>' +
      '<div class="small muted" style="margin-bottom:8px">' + esc(T('autoTapHint')) + '</div><div class="thumbs" id="aThumbs">' +
      ps.map((p, i) => '<button type="button" data-i="' + i + '" class="ath ' + (p.sel ? 'on ' : '') + (p.mode === 'out' ? 'out ' : '') + '" aria-pressed="' + p.sel + '" aria-label="' + esc(T('photo') + ' ' + (i + 1)) + '"><img alt="" src="' + trackURL(URL.createObjectURL(p.thumb)) + '">' +
        (p.mode === 'pin' ? '<i class="tg">📌</i>' : p.mode === 'out' ? '<i class="tg">🚫</i>' : p.sel ? '<i class="tg">✓</i>' : p.dup >= 0 ? '<i class="tg sm">' + esc(T('dupShort')) + '</i>' : '') + (p.faces.length ? '<i class="fc">🙂' + p.faces.length + '</i>' : '') + '</button>').join('') + '</div>' +
      '<div class="row" style="margin-top:10px"><button class="btn ghost sm" id="aClear" type="button">🧹 ' + esc(T('startOver')) + '</button></div>';
  }
  html += '</div><div class="card"><h3>⚙️ ' + esc(T('mosaicSettings')) + '</h3>' +
    '<label class="f" for="aCount">' + esc(T('photosInCollage')) + ': <span class="val" id="aCountV">' + esc(st.count ? nf(st.count) : T('autoWord')) + '</span></label>' +
    '<input type="range" id="aCount" min="0" max="15" value="' + (st.count || 0) + '"><div class="small muted">' + esc(T('countHint')) + '</div>' +
    '<label class="f">' + esc(T('ratio')) + '</label><div class="seg" id="aRatio">' + Object.keys(AUTO_RATIOS).map(k => '<button type="button" data-v="' + k + '" class="' + (st.ratio === k ? 'on' : '') + '">' + k + '</button>').join('') + '</div>' +
    '<label class="f">' + esc(T('style')) + '</label><div class="seg" id="aStyle">' + ['blend', 'album', 'grid'].map(k => '<button type="button" data-v="' + k + '" class="' + (st.style === k ? 'on' : '') + '">' + esc(T('st_' + k)) + '</button>').join('') + '</div>' +
    '<div class="sw" style="margin-top:8px"><span>' + esc(T('faceDetect')) + '<br><small class="muted">' + esc(AS_faceState === 'fail' ? T('facesUnavailable') : T('faceDetectHint')) + '</small></span><label class="toggle"><input type="checkbox" id="aFaces" ' + (st.faces ? 'checked' : '') + ' aria-label="' + esc(T('faceDetect')) + '"><span></span></label></div></div>' +
    '<button class="btn primary big" id="aMake" type="button"' + (AS ? '' : ' disabled') + '>✨ ' + esc(T('makeAuto')) + '</button></div>';
  $('main').innerHTML = html;
  if ($('aResume')) $('aResume').onclick = () => go('autoEd');
  $('aPick').onclick = async () => { const f = await pickFiles('many'); if (!f.length) return; await analyseFiles(f); renderAutoSetup(); };
  if ($('aClear')) $('aClear').onclick = () => { AS = null; renderAutoSetup(); };
  document.querySelectorAll('#aThumbs [data-i]').forEach(b => b.onclick = () => {
    const p = AS.ps[+b.dataset.i];
    p.mode = p.sel ? 'out' : (p.mode === 'out' ? 'auto' : 'pin'); // selected → excluded → auto → pinned
    reselect(); AS.prev = null; renderAutoSetup();
  });
  $('aCount').oninput = e => { st.count = +e.target.value; $('aCountV').textContent = st.count ? nf(st.count) : T('autoWord'); };
  $('aCount').onchange = () => { saveS(); if (AS) { reselect(); AS.prev = null; renderAutoSetup(); } };
  $('aRatio').querySelectorAll('button').forEach(b => b.onclick = () => { st.ratio = b.dataset.v; saveS(); if (AS) AS.prev = null; renderAutoSetup(); });
  $('aStyle').querySelectorAll('button').forEach(b => b.onclick = () => { st.style = b.dataset.v; saveS(); if (AS) AS.prev = null; renderAutoSetup(); });
  $('aFaces').onchange = e => { st.faces = e.target.checked; saveS(); if (st.faces && AS) toast(T('facesNextAdd')); };
  $('aMake').onclick = () => buildAuto(false);
}

async function buildAuto(reseed, keepLayout, quiet) {
  if (!AS || !AS.chosen.length) { toast(T('needPhotos'), true); return; }
  if (reseed) AS.seed = (Math.random() * 4e9) >>> 0;
  AS.ratio = S.auto.ratio;
  const p = Prog.show(T('creatingAuto'), true);
  try {
    p.set(0.04, T('layingOut'));
    if (!keepLayout || !AS.L) { AS.L = makeLayout(AS.ps, AS.chosen, AUTO_RATIOS[AS.ratio] || 4 / 3, AS.seed); AS.cons = null; }
    AS.LM = labelMap(AS.ps, AS.L, AS.cons);
    await yieldUI();
    const r = await renderAutoAny(AUTO_RATIOS[AS.ratio] >= 1 ? 900 : 1300, p, 0.08, 0.96);
    AS.prev = r; AS.saved = false; p.close();
    if (cur.s === 'autoEd') { AEd.paint(); if (!quiet) toast(T('newLayout')); } else go('autoEd');
  } catch (e) {
    p.close();
    if (e && e.message === 'cancel') toast(T('cancelled')); else { logErr('auto: ' + (e && e.message)); toast(T('autoFail'), true); }
  }
}

const AEd = {
  mode: null, bsize: 5, bkind: 'keep',
  open() {
    const ed = $('editor');
    ed.innerHTML = '<header class="top"><button class="homebtn" id="aeBack" type="button">' + (isRTL() ? '→ ' : '← ') + esc(T('back')) + '</button><h1>' + esc(T('autoTitle')) + '</h1></header>' +
      '<div class="stage" id="astage" style="background:var(--bg)"><canvas id="aeCv" aria-label="' + esc(T('autoCanvas')) + '"></canvas><div class="hint" id="aeHint"></div></div>' +
      '<div class="dock"><div class="panel" id="aePanel"></div><div class="acts" id="aeActs"></div></div>';
    ed.classList.remove('hidden');
    this.cv = $('aeCv'); this.x = this.cv.getContext('2d'); this.seams = false; this.mode = null;
    $('aeBack').onclick = () => { if (this.mode) { this.setMode(null); return; } history.back(); };
    this.bindPointer();
    if (this.ro) this.ro.disconnect();
    this.ro = new ResizeObserver(() => this.resize()); this.ro.observe($('astage'));
    this.dockUI(); this.resize();
  },
  close() { if (this.ro) this.ro.disconnect(); this.ro = null; this.mode = null; $('editor').classList.add('hidden'); $('editor').innerHTML = ''; },
  hint(t, keep) { const h = $('aeHint'); if (!h) return; h.textContent = t; h.classList.remove('fade'); clearTimeout(this._ht); if (!keep) this._ht = setTimeout(() => h.classList.add('fade'), 5000); },
  setMode(m) { this.mode = m; if (m !== 'move') { this.mv = null; } this.dockUI(); this.paint(); },
  dockUI() {
    const acts = $('aeActs'), panel = $('aePanel'); if (!acts) return;
    const blend = S.auto.style === 'blend', B = (id, i, l, c) => '<button class="btn' + (c ? ' ' + c : '') + '" id="' + id + '" type="button"><span class="i">' + i + '</span><span>' + esc(l) + '</span></button>';
    panel.innerHTML = '';
    if (this.mode === 'brush') {
      this.hint(T('brushHint'), true);
      panel.innerHTML = '<div class="seg" id="brKind">' + [['keep', '🟢 ' + T('brushKeep')], ['hide', '🔴 ' + T('brushHide')]].map(([k, l]) => '<button type="button" data-v="' + k + '" class="' + (this.bkind === k ? 'on' : '') + '">' + esc(l) + '</button>').join('') + '</div>' +
        '<label class="f" for="brSize">' + esc(T('brushSize')) + '</label><input type="range" id="brSize" min="2" max="14" value="' + this.bsize + '">';
      acts.innerHTML = B('brApply', '✓', T('apply'), 'primary') + B('brClear', '🧹', T('clear')) + B('brDone', '✕', T('done'), 'ghost');
      panel.querySelectorAll('#brKind button').forEach(b => b.onclick = () => { this.bkind = b.dataset.v; panel.querySelectorAll('#brKind button').forEach(z => z.classList.toggle('on', z === b)); });
      $('brSize').oninput = e => { this.bsize = +e.target.value; };
      $('brApply').onclick = async () => { await buildAuto(false, true, true); this.paint(); toast(T('brushApplied')); };
      $('brClear').onclick = async () => { AS.cons = null; await buildAuto(false, true, true); this.paint(); };
      $('brDone').onclick = () => this.setMode(null);
      return;
    }
    if (this.mode === 'move') {
      this.hint(T('moveHint'), true);
      panel.innerHTML = '<label class="f" for="mvZoom">' + esc(T('zoom')) + '</label><input type="range" id="mvZoom" min="0.6" max="1.8" step="0.01" value="' + (this.mv ? this.mv.z : 1) + '">';
      acts.innerHTML = B('mvApply', '✓', T('apply'), 'primary') + B('mvCancel', '✕', T('cancel'), 'ghost');
      $('mvZoom').oninput = e => { if (!this.mv) return; this.mv.z = +e.target.value; this.paint(); };
      $('mvApply').onclick = async () => {
        const mv = this.mv; if (!mv) return;
        const pl = AS.L.place[mv.k], dw = mv.dw * mv.z, dh = mv.dh * mv.z, cx = mv.ox + mv.dw / 2, cy = mv.oy + mv.dh / 2;
        Object.assign(pl, { ox: cx - dw / 2, oy: cy - dh / 2, dw, dh, rect: mv.rect });
        AS.cons = null; this.setMode(null); await buildAuto(false, true, true);
      };
      $('mvCancel').onclick = () => this.setMode(null);
      return;
    }
    if (this.mode === 'swap') {
      this.hint(T('swapPhotoHint'), true);
      acts.innerHTML = B('swCancel', '✕', T('cancel'), 'ghost');
      $('swCancel').onclick = () => this.setMode(null);
      return;
    }
    this.hint(T('autoEdHint'));
    acts.innerHTML = B('aeShuffle', '🔀', T('otherLayout')) + (blend ? B('aeBrush', '🖌️', T('brush')) : '') + B('aeText', '🔤', T('text')) + B('aeStyle', '🎨', T('style')) +
      (blend ? B('aeSeams', '👁', T('showSeams'), this.seams ? 'primary' : '') : '') + B('aeExport', '⬇️', T('exportSave'), 'primary');
    $('aeShuffle').onclick = compareLayouts;
    if ($('aeBrush')) $('aeBrush').onclick = () => this.setMode('brush');
    if ($('aeSeams')) $('aeSeams').onclick = () => { this.seams = !this.seams; this.dockUI(); this.paint(); };
    $('aeExport').onclick = autoExport;
    $('aeStyle').onclick = autoStyleSheet;
    $('aeText').onclick = () => { if (!AS.text) AS.text = newText(); textSheet(AS.text, () => this.paint()); };
  },
  resize() {
    const st = $('astage'); if (!st || !AS || !AS.prev) return;
    const r = st.getBoundingClientRect(), a = AS.prev.W / AS.prev.H, pad = 14;
    let w = r.width - pad * 2, h = w / a; if (h > r.height - pad * 2) { h = r.height - pad * 2; w = h * a; }
    this.w = w; this.h = h; this.dpr = Math.min(3, devicePixelRatio || 1);
    Object.assign(this.cv.style, { inset: 'auto', width: w + 'px', height: h + 'px', left: (r.width - w) / 2 + 'px', top: (r.height - h) / 2 + 'px', boxShadow: 'var(--shadow)', borderRadius: '6px', touchAction: 'none' });
    this.cv.width = Math.round(w * this.dpr); this.cv.height = Math.round(h * this.dpr); this.paint();
  },
  paint() {
    if (!this.x || !AS || !AS.prev) return;
    const x = this.x, W = this.cv.width, H = this.cv.height;
    if (this.cv.style.width && Math.abs(parseFloat(this.cv.style.width) / parseFloat(this.cv.style.height) - AS.prev.W / AS.prev.H) > 0.01) { this.resize(); return; }
    x.setTransform(1, 0, 0, 1, 0, 0); x.imageSmoothingQuality = 'high'; x.drawImage(AS.prev.c, 0, 0, W, H);
    const LM = AS.LM, cw = W / LM.LW, ch = H / LM.LH;
    if (this.seams && S.auto.style === 'blend') {
      x.fillStyle = '#ffdd55';
      for (let y = 0; y < LM.LH; y++) for (let xx = 0; xx < LM.LW; xx++) { const q = y * LM.LW + xx; if ((xx < LM.LW - 1 && LM.lab[q] !== LM.lab[q + 1]) || (y < LM.LH - 1 && LM.lab[q] !== LM.lab[q + LM.LW])) x.fillRect(xx * cw, y * ch, Math.max(1.5, cw), Math.max(1.5, ch)); }
    }
    if (this.mode === 'brush' && AS.cons) {
      const c = AS.cons;
      for (let q = 0; q < c.N; q++) {
        let hid = false; for (let k = 0; k < c.K && !hid; k++) if (c.hide[q * c.K + k]) hid = true;
        if (c.keep[q] >= 0) { x.fillStyle = 'rgba(40,220,110,.38)'; x.fillRect((q % LM.LW) * cw, ((q / LM.LW) | 0) * ch, cw + 0.5, ch + 0.5); }
        else if (hid) { x.fillStyle = 'rgba(240,60,60,.38)'; x.fillRect((q % LM.LW) * cw, ((q / LM.LW) | 0) * ch, cw + 0.5, ch + 0.5); }
      }
    }
    if (this.mode === 'move' && this.mv && this.mv.bmp) {
      const mv = this.mv, f = W / AS.L.VW, dw = mv.dw * mv.z, dh = mv.dh * mv.z, cx = mv.ox + mv.dw / 2, cy = mv.oy + mv.dh / 2;
      x.globalAlpha = 0.82; x.drawImage(mv.bmp, (cx - dw / 2) * f, (cy - dh / 2) * f, dw * f, dh * f); x.globalAlpha = 1;
      x.lineWidth = 3; x.setLineDash([10, 6]); x.strokeStyle = '#ffdd55'; x.strokeRect((cx - dw / 2) * f, (cy - dh / 2) * f, dw * f, dh * f); x.setLineDash([]);
    }
    drawTitle(x, W, H, AS.text);
  },
  bindPointer() {
    const el = this.cv, P = new Map(); let g = null;
    el.addEventListener('pointerdown', e => {
      el.setPointerCapture(e.pointerId); P.set(e.pointerId, { x: e.offsetX, y: e.offsetY });
      g = { x: e.offsetX, y: e.offsetY, t: Date.now(), moved: false, ox: this.mv && this.mv.ox, oy: this.mv && this.mv.oy, z: this.mv && this.mv.z, d: 0 };
      if (P.size === 2) { const [a, b] = [...P.values()]; g.d = Math.hypot(a.x - b.x, a.y - b.y) || 1; }
      if (this.mode === 'brush') this.brushAt(e.offsetX, e.offsetY);
    });
    el.addEventListener('pointermove', e => {
      if (!P.has(e.pointerId) || !g) return;
      P.set(e.pointerId, { x: e.offsetX, y: e.offsetY });
      if (Math.abs(e.offsetX - g.x) + Math.abs(e.offsetY - g.y) > 6) g.moved = true;
      if (this.mode === 'brush') this.brushAt(e.offsetX, e.offsetY);
      else if (this.mode === 'move' && this.mv) {
        if (P.size >= 2 && g.d) { const [a, b] = [...P.values()]; this.mv.z = clamp(g.z * (Math.hypot(a.x - b.x, a.y - b.y) || 1) / g.d, 0.6, 1.8); const zr = $('mvZoom'); if (zr) zr.value = this.mv.z; }
        else { const k = AS.L.VW / this.w; this.mv.ox = g.ox + (e.offsetX - g.x) * k; this.mv.oy = g.oy + (e.offsetY - g.y) * k; }
        this.paint();
      }
    });
    const end = e => {
      if (!P.has(e.pointerId)) return; P.delete(e.pointerId);
      if (g && !g.moved && e.type === 'pointerup' && Date.now() - g.t < 450 && (!this.mode || this.mode === 'swap')) this.tap(e.offsetX, e.offsetY);
      if (this.mode === 'move' && this.mv && !P.size) { const mv = this.mv, dx = mv.ox - mv.base.ox, dy = mv.oy - mv.base.oy, r = mv.base.rect; mv.rect = { x: clamp(r.x + dx, 0, AS.L.VW - r.w), y: clamp(r.y + dy, 0, AS.L.VH - r.h), w: r.w, h: r.h }; }
      if (!P.size) g = null;
    };
    el.addEventListener('pointerup', end); el.addEventListener('pointercancel', end);
  },
  brushAt(px, py) {
    const LM = AS.LM, N = LM.N, K = LM.K;
    if (!AS.cons || AS.cons.N !== N || AS.cons.K !== K) AS.cons = { N, K, keep: new Int8Array(N).fill(-1), hide: new Uint8Array(N * K) };
    const c = AS.cons, gx = px / this.w * LM.LW, gy = py / this.h * LM.LH, r = this.bsize;
    for (let y = Math.max(0, Math.floor(gy - r)); y < Math.min(LM.LH, Math.ceil(gy + r)); y++) for (let x = Math.max(0, Math.floor(gx - r)); x < Math.min(LM.LW, Math.ceil(gx + r)); x++) {
      if ((x + 0.5 - gx) ** 2 + (y + 0.5 - gy) ** 2 > r * r) continue;
      const q = y * LM.LW + x, k = LM.lab[q];
      if (this.bkind === 'keep') { c.keep[q] = k; for (let j = 0; j < K; j++) c.hide[q * K + j] = 0; }
      else { c.hide[q * K + k] = 1; c.keep[q] = -1; }
    }
    this.paint();
  },
  hit(px, py) { // which placement is shown at a point
    const LM = AS.LM, L = AS.L;
    if (S.auto.style === 'blend') { const q = Math.min(LM.LH - 1, Math.floor(py / this.h * LM.LH)) * LM.LW + Math.min(LM.LW - 1, Math.floor(px / this.w * LM.LW)); return LM.lab[q]; }
    const vx = px / this.w * L.VW, vy = py / this.h * L.VH;
    if (S.auto.style === 'album') {
      const bs = albumBoxes(L, 1, AS.seed);
      for (let n = bs.length - 1; n >= 0; n--) { const b = bs[n], dx = vx - b.cx, dy = vy - b.cy, c = Math.cos(-b.rot), s2 = Math.sin(-b.rot), ux = dx * c - dy * s2, uy = dx * s2 + dy * c; if (Math.abs(ux) <= b.w / 2 && Math.abs(uy) <= b.h / 2 + b.h * 0.05) return b.k; }
      return -1;
    }
    return L.place.findIndex(pl => vx >= pl.rect.x && vx <= pl.rect.x + pl.rect.w && vy >= pl.rect.y && vy <= pl.rect.y + pl.rect.h);
  },
  async tap(px, py) {
    if (!AS || !AS.LM) return;
    const L = AS.L, k = this.hit(px, py); if (k < 0) return;
    if (this.mode === 'swap') { // swap the photos of two places
      const k0 = this.swapK; this.setMode(null);
      if (k0 == null || k0 === k) return;
      const a = L.place[k0], b = L.place[k];
      L.place[k0] = placeIn(AS.ps[b.i], b.i, a.rect); L.place[k] = placeIn(AS.ps[a.i], a.i, b.rect);
      AS.cons = null; await buildAuto(false, true, true); return;
    }
    const share = S.auto.style === 'blend' ? AS.LM.area[k] : L.place[k].rect.w * L.place[k].rect.h / (L.VW * L.VH);
    const pi = L.place[k].i, ph = AS.ps[pi];
    const others = AS.ps.map((p, i) => i).filter(i => !AS.chosen.includes(i) && AS.ps[i].mode !== 'out');
    const md = openModal({
      title: T('thisPhoto'),
      html: '<div class="row"><img alt="" style="width:96px;height:96px;object-fit:cover;border-radius:12px" src="' + trackURL(URL.createObjectURL(ph.thumb)) + '"><div class="small muted">' + esc(T('photoShare', { p: Math.round(share * 100) })) + (ph.faces.length ? '<br>🙂 ' + esc(T('facesFound', { n: ph.faces.length })) : '') + '</div></div>' +
        '<div class="row" style="margin-top:10px">' + (S.auto.style === 'blend' ? '<button class="btn sm" id="phMove" type="button">✋ ' + esc(T('moveResize')) + '</button>' : '') + (L.place.length > 1 ? '<button class="btn sm" id="phSwap" type="button">⇄ ' + esc(T('swapPlace')) + '</button>' : '') + '</div>' +
        (others.length ? '<label class="f">' + esc(T('replaceWith')) + '</label><div class="thumbs" id="aRep">' + others.slice(0, 40).map(i => '<button type="button" data-i="' + i + '"><img alt="" src="' + trackURL(URL.createObjectURL(AS.ps[i].thumb)) + '"></button>').join('') + '</div>' : ''),
      actions: [
        { label: '⬆️ ' + T('bigger'), cls: 'primary', onClick: () => { ph.boost = Math.min(2, ph.boost + 0.7); buildAuto(false); } },
        { label: '⬇️ ' + T('smaller'), onClick: () => { ph.boost = Math.max(-0.8, ph.boost - 0.6); buildAuto(false); } },
        { label: '🗑 ' + T('removePhoto'), cls: 'danger', onClick: () => { if (AS.chosen.length <= 1) { toast(T('needPhotos'), true); return false; } ph.mode = 'out'; AS.chosen = AS.chosen.filter(i => i !== pi); ph.sel = false; buildAuto(false); } }
      ]
    });
    md.body.querySelectorAll('#aRep [data-i]').forEach(b => b.onclick = () => {
      const ni = +b.dataset.i; AS.chosen = AS.chosen.map(i => i === pi ? ni : i); ph.sel = false; AS.ps[ni].sel = true; AS.ps[ni].mode = 'pin'; md.close();
      L.place[k] = placeIn(AS.ps[ni], ni, L.place[k].rect); AS.cons = null; buildAuto(false, true, true); // same layout, new photo
    });
    if ($('phMove')) $('phMove').onclick = async () => {
      md.close(); const pl = L.place[k];
      this.mv = { k, ox: pl.ox, oy: pl.oy, dw: pl.dw, dh: pl.dh, z: 1, rect: pl.rect, base: { ox: pl.ox, oy: pl.oy, rect: pl.rect }, bmp: await createImageBitmap(ph.thumb) };
      this.mode = 'move'; this.dockUI(); this.paint();
    };
    if ($('phSwap')) $('phSwap').onclick = () => { md.close(); this.swapK = k; this.setMode('swap'); };
  }
};
/* three layout suggestions side by side → pick one */
async function compareLayouts() {
  if (!AS) return;
  const p = Prog.show(T('makingOptions'), true), opts = [];
  try {
    for (let n = 0; n < 3; n++) {
      if (p.cancelled) throw new Error('cancel');
      const seed = (Math.random() * 4e9) >>> 0, L = makeLayout(AS.ps, AS.chosen, AUTO_RATIOS[AS.ratio] || 4 / 3, seed), LM = labelMap(AS.ps, L, null);
      const OH = AUTO_RATIOS[AS.ratio] >= 1 ? 240 : 380;
      const r = S.auto.style === 'blend' ? await renderAuto(AS.ps, L, LM, OH, null) : await renderSimple(AS.ps, L, OH, S.auto.style, null, seed);
      opts.push({ seed, L, LM, src: r.c.toDataURL('image/jpeg', 0.8) });
      p.set((n + 1) / 3, T('optionN', { n: n + 1 }));
    }
  } catch (e) { p.close(); if (e.message !== 'cancel') toast(T('autoFail'), true); return; }
  p.close();
  const m = openModal({
    title: T('pickLayout'),
    html: '<div style="display:grid;gap:10px">' + opts.map((o, i) => '<button type="button" data-o="' + i + '" style="padding:0;border:2px solid var(--line);border-radius:12px;overflow:hidden;background:none"><img alt="' + esc(T('optionN', { n: i + 1 })) + '" src="' + o.src + '" style="width:100%;display:block"></button>').join('') + '</div>',
    actions: [{ label: '🔀 ' + T('moreOptions'), keep: true, onClick: () => { m.close(); setTimeout(compareLayouts, 30); } }, { label: T('cancel'), cls: 'ghost' }]
  });
  m.body.querySelectorAll('[data-o]').forEach(b => b.onclick = async () => {
    const o = opts[+b.dataset.o]; m.close();
    AS.seed = o.seed; AS.L = o.L; AS.cons = null; await buildAuto(false, true, true);
  });
}
function autoExport() {
  const ratio = AUTO_RATIOS[AS.ratio] || 4 / 3;
  const longToH = long => ratio >= 1 ? Math.round(long / ratio) : long;
  const sizes = isCoarse() ? { '1.6k': 1600, '2k': 2048, '2.4k': 2400 } : { '2k': 2048, '3k': 3072, '4k': 4096 };
  if (!sizes[S.auto.size]) S.auto.size = '2k';
  exportFlow({
    sizes, sizeKey: () => S.auto.size, setSize: k => { S.auto.size = k; },
    dims: long => { const H = longToH(long); return { W: Math.round(H * ratio), H }; },
    render: (long, p) => renderAutoAny(longToH(long), p, 0.02, 0.92).then(r => { drawTitle(r.c.getContext('2d'), r.W, r.H, AS.text); if (S.sign && S.name) drawSignature(r.c.getContext('2d'), r.W, r.H); return r; }),
    kind: 'autocollage', name: () => T('autoTitle'),
    thumb: () => thumbOf(AS.prev.c, AS.prev.W, AS.prev.H),
    onSaved: () => { AS.saved = true; }
  });
}

function autoStyleSheet() {
  const opts = [['blend', '🌊'], ['album', '📷'], ['grid', '▦']];
  const m = openModal({
    title: T('style'),
    html: '<div class="seg" style="flex-direction:column">' + opts.map(([k, e]) => '<button type="button" data-s="' + k + '" class="' + (S.auto.style === k ? 'on' : '') + '" style="justify-content:flex-start;text-align:start;min-height:58px;padding:8px 14px"><span style="font-size:22px;margin-inline-end:10px">' + e + '</span><span><b>' + esc(T('st_' + k)) + '</b><br><small class="muted">' + esc(T('st_' + k + '_d')) + '</small></span></button>').join('') + '</div>' + eventsRowHTML(),
    actions: [{ label: T('close'), cls: 'ghost' }]
  });
  m.body.querySelectorAll('[data-ev]').forEach(b => b.onclick = () => { m.close(); applyEventAuto(b.dataset.ev); });
  m.body.querySelectorAll('[data-s]').forEach(b => b.onclick = async () => {
    S.auto.style = b.dataset.s; saveS(); m.close();
    AEd.mode = null; AEd.dockUI();
    await buildAuto(false, true, true);
  });
}

(window.__MODS = window.__MODS || {})['cn-auto.js'] = '1.5.0';
