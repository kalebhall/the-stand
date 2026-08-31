const CACHE_NAME = 'the-stand-offline-v1';

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  const cacheable = url.origin === self.location.origin && (
    url.pathname.startsWith('/_next/static/') ||
    url.pathname === '/sw.js' ||
    (url.pathname.startsWith('/stand/') && url.pathname.endsWith('/offline'))
  );
  if (!cacheable) return;
  event.respondWith(
    fetch(event.request)
      .then((response) => {
        const copy = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy)).catch(() => undefined);
        return response;
      })
      .catch(() => caches.match(event.request).then((cached) => cached ?? new Response('Offline copy unavailable.', { status: 503 })))
  );
});
