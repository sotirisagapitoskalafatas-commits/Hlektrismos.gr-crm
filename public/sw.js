const CACHE = 'atlas-crm-v2';
const SHELL = 'atlas-crm-shell-v2';

const SHELL_URLS = ['/', '/manifest.webmanifest', '/app-icon.svg', '/app-icon-maskable.svg'];
const STATIC_DESTINATIONS = new Set(['script', 'style', 'image', 'font', 'manifest']);
const STATIC_EXTENSIONS = /\\.(?:js|mjs|css|woff2?|ttf|otf|svg|png|jpe?g|webp|ico|webmanifest)$/i;

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(SHELL).then(c => c.addAll(SHELL_URLS)).catch(() => { self.skipWaiting(); }),
  );
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE && k !== SHELL).map(k => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET' || !req.url.startsWith(self.location.origin)) return;

  // Navigation requests: network-first → app-shell cache fallback.
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then(res => {
          if (res.ok) {
            const copy = res.clone();
            caches.open(CACHE).then(c => c.put(req, copy)).catch(() => {});
          }
          return res;
        })
        .catch(() => caches.match(req).then(m => m || caches.match('/')).then(m => m || Response.error())),
    );
    return;
  }

  // Cache only static assets. Never cache same-origin API/CRM data in the browser's
  // shared service-worker cache; refresh static assets from the network first so
  // a deployment cannot leave an old app bundle in control.
  const pathname = new URL(req.url).pathname;
  if (!STATIC_DESTINATIONS.has(req.destination) && !STATIC_EXTENSIONS.test(pathname)) return;

  event.respondWith(
    fetch(req)
      .then(res => {
        if (res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then(c => c.put(req, copy)).catch(() => {});
        }
        return res;
      })
      .catch(() => caches.match(req).then(cached => cached || Response.error())),
  );
});
