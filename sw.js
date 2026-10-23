const CACHE_NAME = 'almsy-desk-v1';

const APP_SHELL_ASSETS = [
  './',
  './index.html',
  './styles.css',
  './app.js',
  './manifest.webmanifest',
  './fonts/fonts.css',
  './fonts/IBMPlexSerif-Regular.ttf',
  './fonts/IBMPlexSerif-SemiBold.ttf',
  './fonts/IBMPlexSerif-Bold.ttf',
  './fonts/IBMPlexSans-Regular.ttf',
  './fonts/IBMPlexSans-Medium.ttf',
  './fonts/IBMPlexSans-SemiBold.ttf',
  './fonts/IBMPlexSans-Bold.ttf',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png',
  './lib/cra-text.js',
  './lib/money.js',
  './lib/validate.js',
  './lib/db.js',
  './lib/org-profile.js',
  './lib/parse.js',
  './lib/mapping.js',
  './lib/aggregate.js',
  './lib/numbering.js',
  './lib/receipt-model.js',
  './lib/generate-run.js',
  './pdf/layout.js',
  './fixtures/sample-140.csv',
  './fixtures/messy.csv',
  './fixtures/sample.xlsx',
  './vendor/pdf-lib.esm.js',
  './vendor/fontkit.esm.js',
  './vendor/fflate.esm.js',
  './vendor/xlsx.mjs',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(APP_SHELL_ASSETS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;
      return fetch(event.request).then((res) => {
        if (res && res.status === 200 && res.type === 'basic') {
          const clone = res.clone();
          caches.open(CACHE_NAME).then((c) => c.put(event.request, clone));
        }
        return res;
      });
    })
  );
});
