/* CollageNest 1.5.0 · cn-app.js — screens, router, init (loads last) */
/* ═══ CollageNest — screens: home, libraries, gallery, settings, about, guide, diagnostics, router, init ═══ */

/* ── router (Android back button friendly) ── */
const SCREENS = {
  home: renderHome, mosaic: renderMosaicSetup, collage: renderCollageSetup, libs: renderLibs, lib: renderLib,
  gallery: renderGallery, auto: renderAutoSetup, words: renderWordsSetup, puzzle: renderPuzzle, view: renderViewer, settings: renderSettings, about: renderAbout, guide: renderGuide, diag: renderDiag
};
let cur = { s: 'home', a: null }, SHOW_SEQ = 0;
function go(s, a, replace) { const st = { s, a: a == null ? null : a }; if (replace) history.replaceState(st, ''); else history.pushState(st, ''); return show(st); }
async function show(st) {
  if (!st || (!SCREENS[st.s] && st.s !== 'editor' && st.s !== 'collageEd' && st.s !== 'autoEd')) st = { s: 'home', a: null };
  if (cur.s === 'editor' && st.s !== 'editor') Ed.close();
  if (cur.s === 'collageEd' && st.s !== 'collageEd') CEd.close();
  if (cur.s === 'autoEd' && st.s !== 'autoEd') AEd.close();
  if (st.s === 'lib' && (cur.s !== 'lib' || cur.a !== st.a)) { libSel = null; libShowAll = false; }
  if (st.s === 'gallery' && cur.s !== 'gallery' && cur.s !== 'view') galSel = null;
  revokeURLs(); cur = st;
  const home = st.s === 'home';
  $('homeBtn').classList.toggle('hidden', home);
  $('title').innerHTML = home ? '<span class="brand">Collage</span>Nest' : esc(T('scr_' + st.s));
  if (st.s === 'editor') { if (!MS) return go('mosaic', null, true); Ed.open(); return; }
  if (st.s === 'collageEd') { if (!CS) return go('collage', null, true); CEd.open(); return; }
  if (st.s === 'autoEd') { if (!AS || !AS.prev) return go('auto', null, true); AEd.open(); return; }
  const tok = ++SHOW_SEQ;
  try { await SCREENS[st.s](st.a); if (tok !== SHOW_SEQ && SCREENS[cur.s]) await SCREENS[cur.s](cur.a); /* a slower, older screen finished last → draw the current one again */ } catch (e) { logErr('screen ' + st.s + ': ' + (e && e.message)); $('main').innerHTML = '<div class="empty"><span class="em">⚠️</span>' + esc(T('screenFail')) + '</div>'; }
  window.scrollTo(0, 0);
}
addEventListener('popstate', e => {
  if (modalStack.length) { modalStack[modalStack.length - 1].close(); history.pushState(cur, ''); return; }
  if (Prog.cur) { history.pushState(cur, ''); return; }
  show(e.state || { s: 'home' });
});

/* ── home ── */
async function renderHome() {
  const libs = await DB.all('libs'), gal = await DB.all('gallery');
  const warn = location.protocol === 'file:' ? '<div class="banner">⚠️ ' + esc(T('fileWarn')) + '</div>' : '';
  const memWarn = DB.isMem() ? '<div class="banner">⚠️ ' + esc(T('memWarn')) + '</div>' : '';
  $('main').innerHTML = '<div class="screen">' + warn + memWarn +
    '<div class="hero"><img class="logo" src="icon-192.png" alt=""><h2><span>Collage</span>Nest</h2><p>' + esc(T('tagline')) + '</p>' +
    (S.name ? '<div class="hello">' + esc(T('hello', { name: S.name })) + '</div>' : '') + '</div>' +
    '<div class="tiles">' +
    '<button class="tile big" type="button" data-go="mosaic"><span class="em">🧩</span><b>' + esc(T('mosaicTitle')) + '</b><small>' + esc(T('mosaicDesc')) + '</small></button>' +
    '<button class="tile big" type="button" data-go="auto"><span class="em">✨</span><b>' + esc(T('autoTitle')) + '</b><small>' + esc(T('autoDesc')) + '</small></button>' +
    '<button class="tile" type="button" data-go="collage"><span class="em">🖼️</span><b>' + esc(T('collage')) + '</b><small>' + esc(T('collageDesc')) + '</small></button>' +
    '<button class="tile" type="button" data-go="words"><span class="em">🔤</span><b>' + esc(T('wordsTitle')) + '</b><small>' + esc(T('wordsDesc')) + '</small></button>' +
    '<button class="tile" type="button" data-go="libs"><span class="em">📚</span><b>' + esc(T('scr_libs')) + '</b><small>' + esc(T('nLibs', { n: nf(libs.length) })) + '</small></button>' +
    '<button class="tile" type="button" data-go="gallery"><span class="em">🗂️</span><b>' + esc(T('scr_gallery')) + '</b><small>' + esc(T('nItems', { n: nf(gal.length) })) + '</small></button>' +
    '<button class="tile" type="button" data-go="settings"><span class="em">⚙️</span><b>' + esc(T('scr_settings')) + '</b><small>' + esc(T('settingsDesc')) + '</small></button>' +
    '</div><div class="quick">' +
    '<button class="chip" type="button" data-go="guide">📖 ' + esc(T('scr_guide')) + '</button>' +
    '<button class="chip" type="button" data-go="about">ℹ️ ' + esc(T('scr_about')) + '</button>' +
    '<button class="chip" type="button" id="hLang">🌐 ' + esc(LANG[S.lang].langName) + '</button>' +
    '<button class="chip" type="button" id="hTheme">🎨 ' + esc(T('chooseTheme')) + '</button></div>' +
    '<span class="badge"><b>AppNest</b> · CollageNest v' + APP_VERSION + '</span></div>';
  document.querySelectorAll('[data-go]').forEach(b => b.onclick = () => go(b.dataset.go));
  $('hLang').onclick = langPicker; $('hTheme').onclick = themePicker;
}
function langPicker() {
  const m = openModal({ title: T('language'), html: '<div class="seg" style="flex-direction:column">' + Object.keys(LANG).map(k => '<button type="button" data-l="' + k + '" class="' + (S.lang === k ? 'on' : '') + '" style="justify-content:flex-start;text-align:start">' + esc(LANG[k].langName) + '</button>').join('') + '</div>', actions: [{ label: T('close'), cls: 'primary' }] });
  m.body.querySelectorAll('[data-l]').forEach(b => b.onclick = () => { setLang(b.dataset.l); m.close(); });
}
function setLang(l) { S.lang = l; saveS(); applyLang(); show(cur); }
function applyLang() {
  const r = document.documentElement; r.lang = S.lang; r.dir = isRTL() ? 'rtl' : 'ltr';
  $('skipLink').textContent = T('skip');
  $('homeBtn').textContent = '🏠 ' + T('home'); $('homeBtn').onclick = () => go('home');
  $('themeBtn').setAttribute('aria-label', T('chooseTheme'));
  applyTheme();
}

/* ── libraries ── */
async function editLibDialog(id, after) {
  const lib = await DB.get('libs', id); if (!lib) return;
  const m = openModal({
    title: T('editLib'),
    html: '<label class="f" for="elName">' + esc(T('name')) + '</label><input type="text" id="elName" maxlength="60" value="' + esc(lib.name) + '">' +
      '<p class="small muted">' + esc(T('nPhotos', { n: nf(lib.count) })) + ' · ' + esc(df(lib.created)) + '</p>' +
      '<button class="btn danger sm" id="elDel" type="button" style="margin-top:6px">🗑 ' + esc(T('deleteLib')) + '</button>',
    actions: [{ label: T('cancel'), cls: 'ghost' }, { label: T('save'), cls: 'primary', onClick: async () => { lib.name = $('elName').value.trim() || lib.name; await DB.put('libs', lib); after && after(); } }]
  });
  $('elDel').onclick = async () => {
    if (!await confirmBox(T('deleteLibQ', { name: lib.name }), T('delete'), true)) return;
    await DB.delLib(id); LibCache.drop(id); if (MS && MS.libId === id) MS = null;
    m.close(); toast(T('deleted')); after && after();
  };
}
async function renderLibs() {
  const libs = (await DB.all('libs')).sort((a, b) => b.updated - a.updated);
  let html = '<div class="screen"><p class="muted">' + esc(T('libsIntro')) + '</p><div class="row" style="margin-bottom:14px"><button class="btn primary" id="lNew" type="button">➕ ' + esc(T('newLib')) + '</button>' +
    (!libs.some(l => l.demo) ? '<button class="btn ghost" id="lDemo" type="button">🎨 ' + esc(T('demoTiles')) + '</button>' : '') + '</div>';
  if (!libs.length) html += '<div class="empty"><span class="em">📚</span>' + esc(T('noLibsYet')) + '</div>';
  else {
    html += '<div class="libs">';
    for (const l of libs) html += '<div class="lib" data-lib="' + l.id + '" role="button" tabindex="0"><div class="cov">' + await libCoverHTML(l) + '</div><div class="meta"><b>' + esc(l.name) + '</b><small>' + esc(T('nPhotos', { n: nf(l.count) })) + '</small></div><button class="ed" type="button" data-ed="' + l.id + '" aria-label="' + esc(T('edit')) + '">✏️</button></div>';
    html += '</div>';
  }
  $('main').innerHTML = html + '</div>';
  $('lNew').onclick = async () => {
    const name = await promptBox(T('newLib'), T('libDefaultName', { d: df(Date.now()) }), T('create')); if (name == null) return;
    const l = await newLibrary(name); go('lib', l.id);
  };
  if ($('lDemo')) $('lDemo').onclick = async () => { await makeDemoLibrary(); toast(T('demoReady')); renderLibs(); };
  document.querySelectorAll('[data-lib]').forEach(el => {
    el.onclick = e => { if (e.target.closest('[data-ed]')) return; go('lib', el.dataset.lib); };
    el.onkeydown = e => { if (e.key === 'Enter') go('lib', el.dataset.lib); };
    onLongPress(el, () => editLibDialog(el.dataset.lib, renderLibs));
  });
  document.querySelectorAll('[data-ed]').forEach(b => b.onclick = e => { e.stopPropagation(); editLibDialog(b.dataset.ed, renderLibs); });
}
let libSel = null, libShowAll = false;
async function renderLib(id) {
  const lib = await DB.get('libs', id); if (!lib) return go('libs', null, true);
  const tiles = (await DB.byLib(id)).sort((a, b) => a.created - b.created);
  revokeURLs();
  const lim = libShowAll ? tiles.length : Math.min(tiles.length, 400);
  $('title').textContent = lib.name;
  let html = '<div class="screen"><div class="card"><div class="row sp"><div><b style="font-size:18px">' + esc(lib.name) + '</b><br><small class="muted">' + esc(T('nPhotos', { n: nf(tiles.length) })) + '</small></div><button class="btn ghost sm" id="lbEdit" type="button">✏️ ' + esc(T('edit')) + '</button></div>' +
    '<div class="row" style="margin-top:12px"><button class="btn primary sm" id="lbAdd" type="button">➕ ' + esc(T('addPhotos')) + '</button>' +
    (!isCoarse() ? '<button class="btn ghost sm" id="lbDir" type="button">📁 ' + esc(T('addFolder')) + '</button>' : '') +
    (tiles.length ? '<button class="btn ghost sm" id="lbSel" type="button">' + (libSel ? '✓ ' + esc(T('doneSelecting')) : '☑️ ' + esc(T('selectToRemove'))) + '</button>' : '') +
    '<button class="btn sm" id="lbUse" type="button">🧩 ' + esc(T('useForMosaic')) + '</button></div>' +
    (libSel ? '<div class="row" style="margin-top:10px"><span class="muted" id="selN">' + esc(T('selectedN', { n: nf(libSel.size) })) + '</span><button class="btn danger sm" id="lbRemove" type="button">🗑 ' + esc(T('remove')) + '</button></div>' : '') +
    '<div class="note">' + esc(T('libTip')) + '</div></div>';
  if (!tiles.length) html += '<div class="empty"><span class="em">🖼️</span>' + esc(T('libEmpty')) + '</div>';
  else {
    html += '<div class="thumbs">' + tiles.slice(0, lim).map(t => '<button type="button" data-t="' + t.id + '" class="' + (libSel && libSel.has(t.id) ? 'sel' : '') + '" aria-label="' + esc(T('photo')) + '"><img loading="lazy" alt="" src="' + trackURL(URL.createObjectURL(t.mini)) + '"></button>').join('') + '</div>';
    if (lim < tiles.length) html += '<div class="row" style="justify-content:center;margin-top:12px"><button class="btn ghost" id="lbAll" type="button">' + esc(T('showAllN', { n: nf(tiles.length) })) + '</button></div>';
  }
  $('main').innerHTML = html + '</div>';
  const add = async k => { const f = await pickFiles(k); if (!f.length) return; await importToLib(id, f); renderLib(id); };
  $('lbAdd').onclick = () => add('many'); if ($('lbDir')) $('lbDir').onclick = () => add('dir');
  $('lbEdit').onclick = () => editLibDialog(id, async () => { if (await DB.get('libs', id)) renderLib(id); else go('libs', null, true); });
  $('lbUse').onclick = () => { S.mosaic.lib = id; saveS(); go('mosaic'); };
  if ($('lbAll')) $('lbAll').onclick = () => { libShowAll = true; renderLib(id); };
  if ($('lbSel')) $('lbSel').onclick = () => { libSel = libSel ? null : new Set(); renderLib(id); };
  if ($('lbRemove')) $('lbRemove').onclick = async () => {
    if (!libSel.size) return;
    if (!await confirmBox(T('removeQ', { n: nf(libSel.size) }), T('remove'), true)) return;
    await DB.delTiles([...libSel]); libSel = null; await refreshLibCount(id); toast(T('deleted')); renderLib(id);
  };
  document.querySelectorAll('.thumbs [data-t]').forEach(b => b.onclick = () => {
    if (!libSel) { libSel = new Set([b.dataset.t]); renderLib(id); return; }
    libSel.has(b.dataset.t) ? libSel.delete(b.dataset.t) : libSel.add(b.dataset.t);
    b.classList.toggle('sel'); if ($('selN')) $('selN').textContent = T('selectedN', { n: nf(libSel.size) });
  });
}

/* ── gallery ── */
async function editGalDialog(id, after) {
  const it = await DB.get('gallery', id); if (!it) return;
  const m = openModal({
    title: T('editItem'),
    html: '<label class="f" for="egName">' + esc(T('name')) + '</label><input type="text" id="egName" maxlength="60" value="' + esc(it.name) + '">' +
      '<p class="small muted">' + esc(df(it.created)) + ' · ' + nf(it.W) + '×' + nf(it.H) + '</p><button class="btn danger sm" id="egDel" type="button">🗑 ' + esc(T('delete')) + '</button>',
    actions: [{ label: T('cancel'), cls: 'ghost' }, { label: T('save'), cls: 'primary', onClick: async () => { it.name = $('egName').value.trim() || it.name; await DB.put('gallery', it); after && after(); } }]
  });
  $('egDel').onclick = async () => {
    if (!await confirmBox(T('deleteItemQ'), T('delete'), true)) return;
    await DB.del('gallery', id); m.close(); toast(T('deleted')); after && after(true);
  };
}
async function renderGallery() {
  const items = (await DB.all('gallery')).sort((a, b) => b.created - a.created);
  let html = '<div class="screen">';
  if (!items.length) html += '<div class="empty"><span class="em">🗂️</span>' + esc(T('galEmpty')) + '</div><button class="btn primary big" type="button" data-go="mosaic">🧩 ' + esc(T('makeMosaic')) + '</button>';
  else html += '<p class="muted small">' + esc(T('galNote')) + '</p><div class="row" style="margin-bottom:10px"><button class="btn ghost sm" id="gSel" type="button">' + (galSel ? '✓ ' + esc(T('doneSelecting')) : '☑️ ' + esc(T('selectMany'))) + '</button>' +
    (galSel ? '<span class="muted small" id="gSelN">' + esc(T('selectedN', { n: nf(galSel.size) })) + '</span><button class="btn sm primary" id="gShare" type="button">📤 ' + esc(T('share')) + '</button><button class="btn sm" id="gDl" type="button">⬇️ ' + esc(T('download')) + '</button><button class="btn sm danger" id="gDel" type="button">🗑 ' + esc(T('delete')) + '</button>' : '') + '</div>' +
    '<div class="gal">' + items.map(it => '<div class="lib' + (galSel && galSel.has(it.id) ? ' sel' : '') + '" role="button" tabindex="0" data-g="' + it.id + '"><div class="cov"><img alt="" src="' + trackURL(URL.createObjectURL(it.thumb || it.blob)) + '"></div><div class="meta"><b>' + (it.kind === 'mosaic' ? '🧩 ' : it.kind === 'autocollage' ? '✨ ' : it.kind === 'words' ? '🔤 ' : '🖼️ ') + esc(it.name) + '</b><small>' + esc(df(it.created)) + '</small></div><button class="ed" type="button" data-ed="' + it.id + '" aria-label="' + esc(T('edit')) + '">✏️</button></div>').join('') + '</div>';
  $('main').innerHTML = html + '</div>';
  document.querySelectorAll('[data-go]').forEach(b => b.onclick = () => go(b.dataset.go));
  document.querySelectorAll('[data-g]').forEach(el => {
    el.onclick = e => {
      if (e.target.closest('[data-ed]')) return;
      if (galSel) { const id = el.dataset.g; galSel.has(id) ? galSel.delete(id) : galSel.add(id); el.classList.toggle('sel'); const n = $('gSelN'); if (n) n.textContent = T('selectedN', { n: nf(galSel.size) }); return; }
      go('view', el.dataset.g);
    };
    el.onkeydown = e => { if (e.key === 'Enter') go('view', el.dataset.g); };
    onLongPress(el, () => { if (!galSel) { galSel = new Set([el.dataset.g]); renderGallery(); } });
  });
  document.querySelectorAll('[data-ed]').forEach(b => b.onclick = e => { e.stopPropagation(); editGalDialog(b.dataset.ed, renderGallery); });
  if ($('gSel')) $('gSel').onclick = () => { galSel = galSel ? null : new Set(); renderGallery(); };
  const chosen = async () => { const out = []; for (const id of galSel || []) { const it = await DB.get('gallery', id); if (it) out.push(it); } return out; };
  const fileOf = it => new File([it.blob], 'CollageNest-' + (it.kind || 'image') + '-' + it.id + '.' + (it.fmt === 'png' ? 'png' : 'jpg'), { type: it.blob.type || 'image/jpeg' });
  if ($('gShare')) $('gShare').onclick = async () => {
    const its = await chosen(); if (!its.length) { toast(T('selectFirst'), true); return; }
    const files = its.map(fileOf);
    try { if (navigator.canShare && navigator.canShare({ files })) { await navigator.share({ files, title: 'CollageNest', text: S.name ? T('shareMadeBy', { name: S.name }) : T('shareMade') }); return; } } catch (e) { if (e && e.name === 'AbortError') return; }
    files.forEach((f, i) => setTimeout(() => downloadBlob(f, f.name), i * 400)); toast(T('shareFallback'));
  };
  if ($('gDl')) $('gDl').onclick = async () => { const its = await chosen(); if (!its.length) { toast(T('selectFirst'), true); return; } its.map(fileOf).forEach((f, i) => setTimeout(() => downloadBlob(f, f.name), i * 400)); toast(T('downloadingN', { n: nf(its.length) })); };
  if ($('gDel')) $('gDel').onclick = async () => {
    if (!galSel.size) { toast(T('selectFirst'), true); return; }
    if (!await confirmBox(T('deleteManyQ', { n: nf(galSel.size) }), T('delete'), true)) return;
    for (const id of galSel) await DB.del('gallery', id); galSel = null; toast(T('deleted')); renderGallery();
  };
}
let galSel = null;
async function renderViewer(id) {
  const it = await DB.get('gallery', id); if (!it) return go('gallery', null, true);
  $('title').textContent = it.name;
  const ext = it.fmt === 'png' ? 'png' : 'jpg', fname = 'CollageNest-' + (it.kind || 'image') + '-' + id + '.' + ext;
  $('main').innerHTML = '<div class="screen viewer"><img alt="' + esc(it.name) + '" src="' + trackURL(URL.createObjectURL(it.blob)) + '">' +
    '<p class="muted small" style="text-align:center">' + esc(df(it.created)) + ' · ' + nf(it.W) + '×' + nf(it.H) + ' · ' + ext.toUpperCase() + '</p>' +
    '<div class="row" style="justify-content:center"><button class="btn primary" id="vDl" type="button">⬇️ ' + esc(T('download')) + '</button><button class="btn" id="vSh" type="button">📤 ' + esc(T('share')) + '</button><button class="btn ghost" id="vEd" type="button">✏️ ' + esc(T('edit')) + '</button><button class="btn" id="vPz" type="button">🧩 ' + esc(T('playPuzzle')) + '</button></div></div>';
  $('vDl').onclick = () => downloadBlob(it.blob, fname);
  $('vSh').onclick = () => shareBlob(it.blob, fname);
  $('vEd').onclick = () => editGalDialog(id, gone => gone ? history.back() : renderViewer(id));
  $('vPz').onclick = () => go('puzzle', id);
}

/* ── settings ── */
async function storageInfo() {
  let persisted = null, est = null;
  try { if (navigator.storage && navigator.storage.persisted) persisted = await navigator.storage.persisted(); } catch (e) {}
  try { if (navigator.storage && navigator.storage.estimate) est = await navigator.storage.estimate(); } catch (e) {}
  return { persisted, est };
}
const mb = b => nf(Math.round(b / 1048576 * 10) / 10) + ' MB';
async function renderSettings() {
  const si = await storageInfo();
  $('main').innerHTML = '<div class="screen">' +
    '<div class="card"><h3>👤 ' + esc(T('profile')) + '</h3><label class="f" for="sName">' + esc(T('userName')) + '</label><input type="text" id="sName" maxlength="40" value="' + esc(S.name) + '" placeholder="' + esc(T('userNamePh')) + '"><div class="small muted" style="margin-top:6px">' + esc(T('userNameHint')) + '</div></div>' +
    '<div class="card"><h3>🌐 ' + esc(T('language')) + ' · 🎨 ' + esc(T('look')) + '</h3><select id="sLang" aria-label="' + esc(T('language')) + '">' + Object.keys(LANG).map(k => '<option value="' + k + '"' + (S.lang === k ? ' selected' : '') + '>' + esc(LANG[k].langName) + '</option>').join('') + '</select>' +
    '<div class="row" style="margin-top:12px"><button class="btn" id="sTheme" type="button">🎨 ' + esc(T('chooseTheme')) + '</button></div>' +
    '<div class="sw"><span>' + esc(T('dayMode')) + '</span><label class="toggle"><input type="checkbox" id="sDay" ' + (S.mode === 'day' ? 'checked' : '') + ' aria-label="' + esc(T('dayMode')) + '"><span></span></label></div></div>' +
    '<div class="card"><h3>⬇️ ' + esc(T('exportDefaults')) + '</h3><div class="seg" id="sFmt">' + ['jpg', 'png'].map(f => '<button type="button" data-v="' + f + '" class="' + (S.fmt === f ? 'on' : '') + '">' + f.toUpperCase() + '</button>').join('') + '</div>' +
    '<div class="sw" style="margin-top:8px"><span>' + esc(T('addSignature')) + '<br><small class="muted">' + esc(T('signHint')) + '</small></span><label class="toggle"><input type="checkbox" id="sSign" ' + (S.sign ? 'checked' : '') + ' aria-label="' + esc(T('addSignature')) + '"><span></span></label></div></div>' +
    '<div class="card"><h3>💾 ' + esc(T('dataBackup')) + '</h3><div class="kv"><b>' + esc(T('storage')) + '</b><span>' + esc(si.persisted ? T('persistYes') : si.persisted === false ? T('persistNo') : T('unknown')) + '</span>' +
    (si.est ? '<b>' + esc(T('used')) + '</b><span>' + mb(si.est.usage || 0) + (si.est.quota ? ' / ' + mb(si.est.quota) : '') + '</span>' : '') + '</div>' +
    '<div class="note">' + esc(T('backupNote')) + '</div>' +
    '<div class="row"><button class="btn" id="sBk1" type="button">📄 ' + esc(T('backupSettings')) + '</button><button class="btn" id="sBk2" type="button">📦 ' + esc(T('backupFull')) + '</button><button class="btn ghost" id="sRestore" type="button">♻️ ' + esc(T('restore')) + '</button></div></div>' +
    '<div class="card"><h3>❓ ' + esc(T('help')) + '</h3><div class="row"><button class="btn ghost" type="button" data-go="guide">📖 ' + esc(T('scr_guide')) + '</button><button class="btn ghost" id="sOnb" type="button">👋 ' + esc(T('replayIntro')) + '</button><button class="btn ghost" type="button" data-go="diag">🩺 ' + esc(T('scr_diag')) + '</button><button class="btn ghost" type="button" data-go="about">ℹ️ ' + esc(T('scr_about')) + '</button></div></div>' +
    '<div class="card"><h3>⚠️ ' + esc(T('dangerZone')) + '</h3><button class="btn danger" id="sWipe" type="button">🗑 ' + esc(T('deleteAll')) + '</button></div>' +
    '<span class="badge"><b>AppNest</b> · CollageNest v' + APP_VERSION + '</span></div>';
  let nt = 0;
  $('sName').oninput = e => { clearTimeout(nt); nt = setTimeout(() => { S.name = e.target.value.trim(); saveS(); }, 300); };
  $('sLang').onchange = e => setLang(e.target.value);
  $('sTheme').onclick = themePicker;
  $('sDay').onchange = e => { S.mode = e.target.checked ? 'day' : 'night'; saveS(); applyTheme(); };
  $('sFmt').querySelectorAll('button').forEach(b => b.onclick = () => { S.fmt = b.dataset.v; saveS(); $('sFmt').querySelectorAll('button').forEach(z => z.classList.toggle('on', z === b)); });
  $('sSign').onchange = e => { S.sign = e.target.checked; saveS(); if (S.sign && !S.name) toast(T('signNeedsName')); };
  $('sBk1').onclick = () => backup(false); $('sBk2').onclick = () => backup(true); $('sRestore').onclick = restore;
  $('sOnb').onclick = onboarding;
  document.querySelectorAll('[data-go]').forEach(b => b.onclick = () => go(b.dataset.go));
  $('sWipe').onclick = wipeAll;
}

/* ── backup / restore ── */
function blobToDataURL(b) { return new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(b); }); }
function dataURLToBlob(u) {
  const i = u.indexOf(','), meta = u.slice(5, i), bin = atob(u.slice(i + 1)), arr = new Uint8Array(bin.length);
  for (let k = 0; k < bin.length; k++) arr[k] = bin.charCodeAt(k);
  return new Blob([arr], { type: meta.split(';')[0] || 'image/jpeg' });
}
async function backup(full) {
  const head = { app: 'CollageNest', v: APP_VERSION, type: full ? 'full' : 'settings', date: new Date().toISOString(), user: S.name || '', settings: Object.assign({}, S, { onboarded: true }) };
  const parts = [JSON.stringify(head).slice(0, -1)];
  if (full) {
    const libs = await DB.all('libs'), p = Prog.show(T('backingUp'), true);
    const total = libs.reduce((s, l) => s + (l.count || 0), 0) || 1; let done = 0;
    parts.push(',"libs":[');
    for (let li = 0; li < libs.length; li++) {
      if (p.cancelled) { p.close(); toast(T('cancelled')); return; }
      const tiles = await DB.byLib(libs[li].id);
      parts.push((li ? ',' : '') + '{"lib":' + JSON.stringify(libs[li]) + ',"tiles":[');
      for (let k = 0; k < tiles.length; k++) {
        const t = tiles[k];
        parts.push((k ? ',' : '') + JSON.stringify({ id: t.id, sig: t.sig, w: t.w, h: t.h, created: t.created, blob: await blobToDataURL(t.blob), mini: await blobToDataURL(t.mini) }));
        done++; if (done % 30 === 0) p.set(done / total, nf(done) + ' / ' + nf(total));
      }
      parts.push(']}');
    }
    parts.push(']');
    p.close();
  }
  parts.push('}');
  const blob = new Blob(parts, { type: 'application/json' });
  downloadBlob(blob, 'CollageNest-' + (full ? 'full' : 'settings') + '-backup-' + fileStamp() + '.json');
  toast(T('backupDone', { s: mb(blob.size) }));
}
async function restore() {
  const f = (await pickFiles('json'))[0]; if (!f) return;
  let data;
  try { data = JSON.parse(await f.text()); } catch (e) { toast(T('restoreBad'), true); return; }
  if (!data || data.app !== 'CollageNest' || !data.settings) { toast(T('restoreBad'), true); return; }
  const full = data.type === 'full' && Array.isArray(data.libs);
  if (!await confirmBox(full ? T('restoreFullQ') : T('restoreSetQ'), T('restore'), true)) return;
  S = Object.assign({}, DEF_S, data.settings); S.mosaic = Object.assign({}, DEF_S.mosaic, S.mosaic || {}); S.collage = Object.assign({}, DEF_S.collage, S.collage || {}); S.onboarded = true; saveS();
  if (full) {
    const p = Prog.show(T('restoring'), false);
    await DB.clear('tiles'); await DB.clear('libs'); LibCache.drop(); MS = null;
    for (let li = 0; li < data.libs.length; li++) {
      const L = data.libs[li]; await DB.put('libs', L.lib);
      const recs = (L.tiles || []).map(t => ({ id: t.id, libId: L.lib.id, sig: t.sig, w: t.w, h: t.h, created: t.created, blob: dataURLToBlob(t.blob), mini: dataURLToBlob(t.mini) }));
      for (let k = 0; k < recs.length; k += 50) { await DB.putMany('tiles', recs.slice(k, k + 50)); p.set((li + k / Math.max(1, recs.length)) / data.libs.length); }
      await refreshLibCount(L.lib.id);
    }
    p.close();
  }
  applyLang(); toast(T('restored')); go('home', null, true);
}
async function wipeAll() {
  if (!await confirmBox(T('deleteAllQ1'), T('continue'), true)) return;
  if (!await confirmBox(T('deleteAllQ2'), T('deleteAll'), true)) return;
  await DB.clear('tiles'); await DB.clear('libs'); await DB.clear('gallery'); await DB.clear('projects');
  Store.clearAll(); LibCache.drop(); MS = null; CS = null;
  S = JSON.parse(JSON.stringify(DEF_S)); S.lang = detectLang();
  applyLang(); toast(T('allDeleted')); go('home', null, true); setTimeout(onboarding, 400);
}

/* ── guide / onboarding ── */
const GUIDE = [['👋', 'g1t', 'g1'], ['🧩', 'g2t', 'g2'], ['📚', 'g3t', 'g3'], ['🔍', 'g4t', 'g4'], ['✨', 'g7t', 'g7'], ['🖼️', 'g5t', 'g5'], ['🖨️', 'g8t', 'g8'], ['🎉', 'g9t', 'g9'], ['🔒', 'g6t', 'g6']];
function onboarding() {
  let i = 0;
  const draw = () => '<div class="guide-em">' + GUIDE[i][0] + '</div><h3 style="text-align:center">' + esc(T(GUIDE[i][1])) + '</h3><p style="text-align:center" class="muted">' + esc(T(GUIDE[i][2])) + '</p><div class="steps">' + GUIDE.map((g, k) => '<i class="' + (k === i ? 'on' : '') + '"></i>').join('') + '</div>' +
    '<div class="acts"><button class="btn ghost" id="obSkip" type="button">' + esc(T('skip')) + '</button>' + (i ? '<button class="btn ghost" id="obPrev" type="button">' + esc(T('prev')) + '</button>' : '') + '<button class="btn primary" id="obNext" type="button">' + esc(i === GUIDE.length - 1 ? T('start') : T('next')) + '</button></div>';
  const m = openModal({ center: true, html: draw(), onClose: () => { S.onboarded = true; saveS(); } });
  const bind = () => {
    $('obSkip').onclick = () => m.close();
    if ($('obPrev')) $('obPrev').onclick = () => { i--; m.body.innerHTML = draw(); bind(); };
    $('obNext').onclick = () => { if (i === GUIDE.length - 1) { m.close(); return; } i++; m.body.innerHTML = draw(); bind(); $('obNext').focus(); };
  };
  bind();
}
function renderGuide() {
  $('main').innerHTML = '<div class="screen">' + GUIDE.map(g => '<div class="card"><h3>' + g[0] + ' ' + esc(T(g[1])) + '</h3><p class="muted" style="margin:0">' + esc(T(g[2])) + '</p></div>').join('') +
    '<div class="card"><h3>💡 ' + esc(T('tipsTitle')) + '</h3><ul class="muted" style="margin:0;padding-inline-start:20px">' + ['tip1', 'tip2', 'tip3', 'tip4', 'tip5', 'tip6', 'tip7'].map(k => '<li style="margin-bottom:6px">' + esc(T(k)) + '</li>').join('') + '</ul></div>' +
    '<button class="btn primary big" id="gStart" type="button">👋 ' + esc(T('replayIntro')) + '</button></div>';
  $('gStart').onclick = onboarding;
}

/* ── about ── */
function renderAbout() {
  const url = location.href.split('#')[0].split('?')[0];
  $('main').innerHTML = '<div class="screen"><div class="hero"><img class="logo" src="icon-192.png" alt=""><h2><span>Collage</span>Nest</h2><p>' + esc(T('version')) + ' ' + APP_VERSION + '</p></div>' +
    '<div class="card"><div class="kv"><b>' + esc(T('version')) + '</b><span>' + APP_VERSION + '</span><b>' + esc(T('developer')) + '</b><span>Barak Aflalo</span><b>' + esc(T('platform')) + '</b><span>PWA · HTML5</span><b>' + esc(T('storage')) + '</b><span>' + esc(T('onDeviceOnly')) + '</span><b>' + esc(T('license')) + '</b><span>© AppNest 2026</span></div></div>' +
    '<div class="card"><div class="row" style="flex-direction:column;align-items:stretch">' +
    '<a class="btn" href="' + STORE_URL + '" target="_blank" rel="noopener">🏪 ' + esc(T('storeLink')) + '</a>' +
    '<button class="btn" id="aShare" type="button">📤 ' + esc(T('shareApp')) + '</button>' +
    '<a class="btn" href="mailto:' + FEEDBACK_MAIL + '?subject=' + encodeURIComponent('CollageNest ' + APP_VERSION) + '">✉️ ' + esc(T('feedback')) + '</a>' +
    '<button class="btn ghost" type="button" data-go="guide">📖 ' + esc(T('scr_guide')) + '</button>' +
    '<a class="btn ghost" href="privacy_policy.html" target="_blank" rel="noopener">🔒 ' + esc(T('privacy')) + '</a></div></div>' +
    '<div class="note">' + esc(T('disclaimer')) + '</div><span class="badge"><b>AppNest</b> · CollageNest v' + APP_VERSION + '</span></div>';
  $('aShare').onclick = async () => {
    const text = T('shareAppText') + (S.name ? ' — ' + S.name : '');
    try { if (navigator.share) { await navigator.share({ title: 'CollageNest', text, url }); return; } } catch (e) { if (e.name === 'AbortError') return; }
    try { await navigator.clipboard.writeText(url); toast(T('linkCopied')); } catch (e) { toast(url); }
  };
  document.querySelectorAll('[data-go]').forEach(b => b.onclick = () => go(b.dataset.go));
}

/* ── diagnostics (no photos, no personal content) ── */
async function diagReport() {
  const si = await storageInfo();
  let errs = []; try { errs = JSON.parse(localStorage.getItem('cn_errors') || '[]'); } catch (e) {}
  const libs = await DB.all('libs'), gal = await DB.all('gallery');
  const sw = 'serviceWorker' in navigator ? (navigator.serviceWorker.controller ? 'active' : 'registered/none') : 'unsupported';
  const L = [
    'CollageNest ' + APP_VERSION + ' · ' + new Date().toISOString(),
    'URL: ' + location.origin + location.pathname,
    'UA: ' + navigator.userAgent,
    'Lang: ' + S.lang + ' · Theme: ' + S.theme + '/' + S.mode,
    'Screen: ' + screen.width + 'x' + screen.height + ' @' + (devicePixelRatio || 1) + ' · pointer: ' + (isCoarse() ? 'coarse' : 'fine'),
    'CPU cores: ' + (navigator.hardwareConcurrency || '?') + ' · RAM(GB): ' + (navigator.deviceMemory || '?'),
    'IndexedDB: ' + (DB.isMem() ? 'NO (memory fallback)' : 'ok') + ' · localStorage: ' + (Store.ok() ? 'ok' : 'NO'),
    'Storage persisted: ' + si.persisted + (si.est ? ' · used ' + mb(si.est.usage || 0) + ' / ' + mb(si.est.quota || 0) : ''),
    'Service Worker: ' + sw + ' · online: ' + navigator.onLine,
    'OffscreenCanvas: ' + (typeof OffscreenCanvas !== 'undefined') + ' · createImageBitmap: ' + (typeof createImageBitmap === 'function') + ' · Worker: ' + (typeof Worker !== 'undefined'),
    'Share files: ' + !!(navigator.canShare) + ' · crossOriginIsolated: ' + !!self.crossOriginIsolated,
    'Libraries: ' + libs.length + ' · tiles: ' + libs.reduce((s, l) => s + (l.count || 0), 0) + ' · gallery: ' + gal.length,
    'Face detection: ' + AS_faceState + (window.faceapi && window.faceapi.tf ? ' (' + window.faceapi.tf.getBackend() + ')' : '') + ' · AutoCollage: ' + (AS ? AS.ps.length + ' photos' : 'none'),
    'Projects: ' + (await DB.all('projects')).length + ' · share target: ' + ('serviceWorker' in navigator),
    'Mosaic session: ' + (MS ? MS.cols + 'x' + MS.rows + ' / ' + MS.N + ' tiles' : 'none'),
    '— Last errors (' + errs.length + ') —'
  ].concat(errs.map(e => e.t + ' ' + e.m + (e.s ? ' @' + e.s + ':' + e.l : '')));
  return L.join('\n');
}
async function renderDiag() {
  const rep = await diagReport();
  $('main').innerHTML = '<div class="screen"><p class="muted">' + esc(T('diagIntro')) + '</p><pre class="diag" id="dRep">' + esc(rep) + '</pre>' +
    '<div class="row"><button class="btn primary" id="dCopy" type="button">📋 ' + esc(T('copy')) + '</button><a class="btn" id="dMail" href="mailto:' + FEEDBACK_MAIL + '?subject=' + encodeURIComponent('CollageNest diagnostics') + '&body=' + encodeURIComponent(rep.slice(0, 1800)) + '">✉️ ' + esc(T('sendReport')) + '</a>' +
    '<button class="btn ghost" id="dClr" type="button">🧹 ' + esc(T('clearErrors')) + '</button><button class="btn ghost" id="dPersist" type="button">🔒 ' + esc(T('askPersist')) + '</button></div></div>';
  $('dCopy').onclick = async () => { try { await navigator.clipboard.writeText(rep); toast(T('copied')); } catch (e) { toast(T('copyFail'), true); } };
  $('dClr').onclick = () => { try { localStorage.removeItem('cn_errors'); } catch (e) {} renderDiag(); };
  $('dPersist').onclick = async () => { const ok = await requestPersist(); toast(ok ? T('persistYes') : T('persistNo'), !ok); renderDiag(); };
}
async function requestPersist() { try { if (navigator.storage && navigator.storage.persist) return await navigator.storage.persist(); } catch (e) {} return false; }

/* ── service worker ── */
function registerSW() {
  if (!('serviceWorker' in navigator) || !/^https?:$/.test(location.protocol) || /[?&]nosw\b/.test(location.search)) return;
  navigator.serviceWorker.register('sw.js').catch(e => logErr('sw: ' + e.message));
}

/* ── init ── */
(async function init() {
  const need = ['cn-core.js', 'cn-mosaic.js', 'cn-collage.js', 'cn-auto.js', 'cn-words.js', 'cn-lang.js'], miss = need.filter(n => !(window.__MODS || {})[n]);
  if (miss.length) { showUpdateBanner(miss); return; }
  applyLang();
  $('themeBtn').onclick = themePicker;
  $('modeBtn').onclick = () => { S.mode = S.mode === 'day' ? 'night' : 'day'; saveS(); applyTheme(); };
  document.addEventListener('keydown', e => { if (e.key !== 'Escape' || Prog.cur) return; if (modalStack.length) { modalStack[modalStack.length - 1].close(); return; } if (cur.s !== 'home') history.back(); });
  await DB.open();
  const st = history.state && history.state.s ? history.state : { s: 'home', a: null };
  history.replaceState(st, '');
  await show(st);
  if (!S.onboarded) onboarding();
  handleShared();
  registerSW();
  requestPersist();
  window.__CN_READY = true;
})();

(window.__MODS = window.__MODS || {})['cn-app.js'] = '1.5.0';
