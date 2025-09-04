/* Offline-first App Shell caching */
const CACHE_NAME = 'sns-draft-app-v3';
const APP_SHELL = [
  './',
  './index.html',
  './styles.css',
  './manifest.webmanifest',
  './js/app.js',
  './js/db.js',
  './icons/sd.svg',
  './icons/actions/pin-white.png',
  './icons/actions/trash-white.png',
  './icons/ui/copy-black.png',
  './icons/ui/save-black.png',
  './icons/ui/delete-red.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))))
  );
  self.clients.claim();
});

// Offline-first: try cache, then network, update cache
self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  event.respondWith(
    caches.match(req).then((cached) => {
      const fetchPromise = fetch(req).then((networkRes) => {
        const copy = networkRes.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(req, copy)).catch(()=>{});
        return networkRes;
      }).catch(() => cached);
      return cached || fetchPromise;
    })
  );
});
