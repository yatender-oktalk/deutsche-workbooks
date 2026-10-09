/* Site-wide service worker. Navigations: network first, cache fallback (so edits show up,
   and the last-seen page still opens offline). Other same-origin GETs: stale-while-revalidate.
   vocab/ has its own narrower-scope worker and keeps using it. */
const CACHE_NAME = 'dw-site-v1';

const PRECACHE_URLS = [
  'index.html',
  'manifest.webmanifest',
  'assets/app-shell.css',
  'assets/app-shell.js',
  'assets/print-workbook.css',
  'assets/interactive.js',
  'assets/listening.js',
  'assets/glossary.js',
  'assets/glossary-data.js',
  'vocab/icons/icon-192.png',
  'vocab/icons/icon-512.png',
  'vocab/icons/apple-touch-icon.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(PRECACHE_URLS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((names) => Promise.all(names.filter((n) => n !== CACHE_NAME).map((n) => caches.delete(n))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req).then((res) => {
        if (res.ok) { const copy = res.clone(); caches.open(CACHE_NAME).then((c) => c.put(req, copy)); }
        return res;
      }).catch(() => caches.match(req).then((hit) => hit || caches.match('index.html')))
    );
    return;
  }

  event.respondWith(
    caches.match(req).then((hit) => {
      const net = fetch(req).then((res) => {
        if (res.ok) { const copy = res.clone(); caches.open(CACHE_NAME).then((c) => c.put(req, copy)); }
        return res;
      }).catch(() => hit);
      return hit || net;
    })
  );
});
