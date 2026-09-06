const CACHE_NAME = 'vokabeltrainer-v12';

const PRECACHE_URLS = [
  'index.html',
  'practice.html',
  'stats.html',
  'vocab.css',
  'manifest.json',
  'js/app.js',
  'js/data.js',
  'js/db.js',
  'js/practice.js',
  'js/srs.js',
  'js/stats.js',
  'data/a1.js',
  'data/a2.js',
  'data/b1.js',
  'data/b2.js',
  '../assets/listening.js',
  '../assets/app-shell.css',
  '../assets/app-shell.js',
  '../assets/glossary.js',
  '../assets/glossary-data.js',
  '../assets/interactive.js',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/apple-touch-icon.png',
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
      .then((names) => Promise.all(
        names.filter((name) => name !== CACHE_NAME).map((name) => caches.delete(name))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;

      return fetch(event.request).then((response) => {
        if (response.ok) {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
        }
        return response;
      }).catch(() => cached);
    })
  );
});
