/**
 * NFA PASSBOOK — Service Worker
 * Caches the app shell for full offline operation. All data reads/writes
 * happen through Dexie.js (IndexedDB), which is independent of this cache.
 */
const CACHE_NAME = 'nfa-passbook-v1';
const APP_SHELL = [
  './index.html',
  './manifest.json',
  './css/style.css',
  './js/core.js',
  './js/geo.js',
  './js/db.js',
  './js/sync.js',
  './js/app.js',
  './js/auth.js',
  './js/qr.js',
  './js/delivery.js',
  './js/screens-dashboard.js',
  './js/screens-passbook-list.js',
  './js/screens-passbook-form.js',
  './js/screens-passbook-detail.js',
  './js/screens-scan.js',
  './js/screens-reports.js',
  './js/screens-settings.js',
  './icons/icon-192.png',
  './icons/icon-512.png',
  'https://cdnjs.cloudflare.com/ajax/libs/dexie/3.2.4/dexie.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/jsQR/1.4.0/jsQR.js'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)).catch(() => {})
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  // Never cache Google Apps Script API calls — always go to network for live sync data
  if (event.request.url.includes('script.google.com')) return;

  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;
      return fetch(event.request)
        .then((response) => {
          if (response.ok && event.request.method === 'GET') {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          }
          return response;
        })
        .catch(() => cached);
    })
  );
});
