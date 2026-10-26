// Eddy offline support (web app only).
// The page itself is fetched fresh whenever there's a connection and saved for offline use; other files (icons, Basin map
// data) are served from the saved copy and refreshed in the background. Requests to other origins are never touched.
const CACHE = 'eddy-web-v4';
const PRECACHE = ['./', 'manifest.json', 'icon-180.png', 'icon-512.png'];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches
      .open(CACHE)
      .then(async (c) => {
        await c.addAll(PRECACHE);
        try {
          const idx = await (await fetch('data/basin/index.json')).json();
          await c.addAll(['data/basin/index.json', ...Object.keys(idx.rivers || {}).map((id) => `data/basin/${id}.json`)]);
        } catch {}
      })
      .then(() => self.skipWaiting())
  );
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  const key = new Request(url.origin + url.pathname);
  const page = req.mode === 'navigate' || url.pathname.endsWith('/') || url.pathname.endsWith('.html');
  e.respondWith(
    caches.open(CACHE).then(async (cache) => {
      const hit = await cache.match(key);
      const net = fetch(req, page ? { cache: 'no-store' } : undefined)
        .then((r) => {
          if (r && r.ok && r.type === 'basic') cache.put(key, r.clone());
          return r;
        })
        .catch(() => hit);
      if (page) return net.then((r) => r || hit);
      return hit || net;
    })
  );
});
