/* ── AppNest · Cloudflare Pages fix (Oct 2026) ──
   Cloudflare redirects *.html to clean URLs (/index.html -> /). Chrome refuses a
   "redirected" response that a Service Worker hands to a page load (ERR_FAILED).
   This strips the redirect flag from every response the SW fetches or reads from cache. */
(function(){
  var NB={101:1,204:1,205:1,304:1};
  function clean(r){
    if(!r||!r.redirected||NB[r.status])return r;
    return r.blob().then(function(b){return new Response(b,{status:r.status,statusText:r.statusText,headers:r.headers});});
  }
  var _fetch=self.fetch.bind(self);
  self.fetch=function(input,init){
    if(input&&typeof input==='object'&&input.mode==='navigate')input=input.url;
    return _fetch(input,init).then(clean);
  };
  var cm=Cache.prototype.match;
  Cache.prototype.match=function(){return cm.apply(this,arguments).then(clean);};
  var sm=CacheStorage.prototype.match;
  CacheStorage.prototype.match=function(){return sm.apply(this,arguments).then(clean);};
})();

/* ═══ CollageNest service worker ═══
   - shell saved file-by-file (allSettled), never one atomic addAll
   - navigation: network-first (4s) → cache → friendly offline page, never an error
   - only the app root is cached as "./" (other pages under their own URL)
   - same-origin files: network (no-cache/ETag) with cache fallback
   - CDN libraries (heic2any): cache-first in a separate vendor cache
   Bump VERSION on every update. */
var VERSION = '1.1.0';
var APP_CACHE = 'collagenest-app-' + VERSION;
var VENDOR_CACHE = 'collagenest-vendor-v1';
var SHELL = ['./', './manifest.json', './icon-192.png', './icon-512.png', './privacy_policy.html'];

self.addEventListener('install', function (e) {
  e.waitUntil(
    caches.open(APP_CACHE).then(function (c) {
      return Promise.allSettled(SHELL.map(function (u) {
        return fetch(u, { cache: 'no-cache' }).then(function (r) { if (r && r.ok) return c.put(u, r); });
      }));
    }).then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener('activate', function (e) {
  e.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.filter(function (k) { return k.indexOf('collagenest-app-') === 0 && k !== APP_CACHE; }).map(function (k) { return caches.delete(k); }));
    }).then(function () { return self.clients.claim(); })
  );
});

function isRoot(url) {
  var base = new URL(self.registration.scope).pathname, p = url.pathname;
  return p === base || p === base + 'index.html' || p === base + 'index';
}
function offlinePage() {
  var html = '<!doctype html><html lang="he" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>CollageNest</title>' +
    '<style>body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:#0b0b0c;color:#f3efe6;font-family:system-ui,sans-serif;text-align:center;padding:24px}' +
    'b{color:#d4af37;font-size:22px}button{margin-top:18px;min-height:48px;padding:0 22px;border-radius:12px;border:1.5px solid #d4af37;background:#d4af37;color:#111;font-weight:700;font-size:16px}</style></head>' +
    '<body><div><b>CollageNest</b><p>אין חיבור כרגע, והאפליקציה עוד לא נשמרה במכשיר.<br>No connection right now, and the app is not saved on this device yet.</p>' +
    '<button onclick="location.reload()">נסה שוב · Try again</button></div></body></html>';
  return new Response(html, { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8' } });
}
function fromCache(req, root) {
  return caches.open(APP_CACHE).then(function (c) {
    return c.match(root ? './' : req, { ignoreSearch: true }).then(function (h) { return h || (root ? null : c.match(req.url, { ignoreSearch: true })); });
  });
}
function navResponse(req) {
  var url = new URL(req.url), root = isRoot(url);
  var net = fetch(req).then(function (r) {
    if (r && r.ok) { var cp = r.clone(); caches.open(APP_CACHE).then(function (c) { return c.put(root ? './' : req.url, cp); }); }
    return r;
  });
  var timer = new Promise(function (res) { setTimeout(function () { res('timeout'); }, 4000); });
  return Promise.race([net, timer]).then(function (r) {
    if (r !== 'timeout') return r;
    return fromCache(req, root).then(function (h) { return h || net; });
  }).catch(function () {
    return fromCache(req, root).then(function (h) { return h || offlinePage(); });
  });
}

self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET') return;
  var url = new URL(req.url);
  if (url.origin !== self.location.origin) {
    if (/(^|\.)(cdn\.jsdelivr\.net|unpkg\.com|cdnjs\.cloudflare\.com)$/.test(url.hostname)) {
      e.respondWith(caches.open(VENDOR_CACHE).then(function (c) {
        return c.match(req).then(function (hit) {
          return hit || fetch(req).then(function (r) { if (r && (r.ok || r.type === 'opaque')) c.put(req, r.clone()); return r; });
        });
      }));
    }
    return;
  }
  if (req.mode === 'navigate') { e.respondWith(navResponse(req)); return; }
  e.respondWith(
    fetch(req.url, { cache: 'no-cache' }).then(function (r) {
      if (r && r.ok) { var cp = r.clone(); caches.open(APP_CACHE).then(function (c) { return c.put(req, cp); }); }
      return r;
    }).catch(function () {
      return caches.match(req, { ignoreSearch: true }).then(function (h) { return h || Response.error(); });
    })
  );
});
