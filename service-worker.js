const CACHE_NAME = 'weekly-timetable-v7';
const BASE = self.location.pathname.replace(/service-worker\.js$/, '');
const APP_SHELL = [
  BASE,
  `${BASE}index.html`,
  `${BASE}styles.css`,
  `${BASE}app.js`,
  `${BASE}manifest.json`,
  `${BASE}schedule.csv`,
  `${BASE}exams.csv`,
  `${BASE}icon-192.png`,
  `${BASE}icon-512.png`,
  `${BASE}icon.svg`
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)))).then(() => self.clients.claim()));
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  const requestUrl = new URL(event.request.url);
  const sameOrigin = requestUrl.origin === self.location.origin;
  const networkFirst = sameOrigin && (
    ['document', 'script', 'style', 'manifest'].includes(event.request.destination)
    || requestUrl.pathname.endsWith('.csv')
  );

  if (networkFirst) {
    event.respondWith(
      fetch(event.request).then((response) => {
        const copy = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
        return response;
      }).catch(() => caches.match(event.request).then((cached) => cached || caches.match(`${BASE}index.html`)))
    );
    return;
  }

  event.respondWith(
    caches.match(event.request).then((cached) => cached || fetch(event.request).then((response) => {
      if (sameOrigin) {
        const copy = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
      }
      return response;
    }).catch(() => caches.match(`${BASE}index.html`)))
  );
});
