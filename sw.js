// Eddy offline support (web app only).
// The whole app is one HTML file, so: serve the saved copy immediately (works with no signal), refresh it in the
// background, and never touch requests to other origins (sync and sign-in always go straight to the network).
const CACHE = 'eddy-web-v2';
const PRECACHE = ['./', 'manifest.json', 'icon-180.png', 'icon-512.png'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(PRECACHE)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  const key = new Request(url.origin + url.pathname); // ignore ?join=CODE and other query strings
  e.respondWith(
    caches.open(CACHE).then(async (cache) => {
      const hit = await cache.match(key);
      const net = fetch(req)
        .then((r) => {
          if (r && r.ok && r.type === 'basic') cache.put(key, r.clone());
          return r;
        })
        .catch(() => hit);
      return hit || net;
    })
  );
});
