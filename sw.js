/* Revision Room service worker: offline copy of the app, plus the Android "Share to app" receiver. */
const VERSION = 'rr-v18';
const SHELL = ['./', 'index.html', 'manifest.webmanifest', 'pdf.min.js', 'pdf.worker.min.js', 'config.js',
  'icons/icon-192.png', 'icons/icon-512.png', 'icons/icon-maskable-512.png', 'icons/apple-touch-icon.png'];
const KEEP = [VERSION, 'rr-shared', 'rr-fonts'];

self.addEventListener('install', function (e) {
  e.waitUntil(caches.open(VERSION).then(function (c) {
    return Promise.all(SHELL.map(function (u) { return c.add(new Request(u, {cache: 'reload'})); }));
  }).then(function () { return self.skipWaiting(); }));
});
self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (ks) {
    return Promise.all(ks.filter(function (k) { return KEEP.indexOf(k) < 0; }).map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});

async function swr(req, cacheName) {
  const c = await caches.open(cacheName);
  const hit = await c.match(req);
  const net = fetch(req, {cache: 'no-cache'}).then(function (r) { if (r && (r.ok || r.type === 'opaque')) c.put(req, r.clone()); return r; }).catch(function () { return null; });
  return hit || (await net) || Response.error();
}

async function receiveShared(request) {
  const fd = await request.formData();
  const files = fd.getAll('lessons').filter(function (f) { return f && f.name; });
  const c = await caches.open('rr-shared');
  for (const k of await c.keys()) await c.delete(k);
  let i = 0;
  for (const f of files) {
    const url = new URL('shared/' + (i++) + '/' + encodeURIComponent(f.name), self.registration.scope).href;
    await c.put(new Request(url), new Response(f, {headers: {'Content-Type': f.type || 'application/octet-stream'}}));
  }
  return Response.redirect(new URL('./?shared=1', self.registration.scope).href, 303);
}

self.addEventListener('fetch', function (e) {
  const req = e.request, url = new URL(req.url);
  if (req.method === 'POST' && url.pathname.endsWith('/share-target')) { e.respondWith(receiveShared(req)); return; }
  if (req.method !== 'GET') return;
  if (req.mode === 'navigate') { e.respondWith(swr(new Request(new URL('index.html', self.registration.scope).href), VERSION)); return; }
  if (url.origin === self.location.origin) { e.respondWith(swr(req, VERSION)); return; }
  if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') { e.respondWith(swr(req, 'rr-fonts')); }
});
