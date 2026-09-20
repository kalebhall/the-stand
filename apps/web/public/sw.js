const CACHE_NAME = 'the-stand-offline-v2';
let cacheGeneration = 0;
let cacheWrites = Promise.resolve();

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) =>
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key.startsWith('the-stand-offline-') && key !== CACHE_NAME).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  )
);

self.addEventListener('message', (event) => {
  if (event.data?.type !== 'CLEAR_OFFLINE_CACHE') return;
  cacheGeneration += 1;
  event.waitUntil(
    cacheWrites
      .catch(() => undefined)
      .then(() => caches.delete(CACHE_NAME))
  );
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  if (event.request.mode === 'navigate' && /^\/stand\/[^/]+$/.test(url.pathname)) {
    const offlineUrl = `${url.pathname}/offline`;
    event.respondWith(
      fetch(event.request).catch(() =>
        caches.match(offlineUrl).then((cached) => cached ?? new Response('Offline copy unavailable.', { status: 503 }))
      )
    );
    return;
  }
  const cacheable =
    url.origin === self.location.origin &&
    !url.pathname.startsWith('/api/') &&
    (url.pathname.startsWith('/_next/static/') ||
      url.pathname === '/sw.js' ||
      (url.pathname.startsWith('/stand/') && url.pathname.endsWith('/offline')));
  if (!cacheable) return;
  const requestGeneration = cacheGeneration;
  event.respondWith(
    fetch(event.request)
      .then((response) => {
        const copy = response.clone();
        const write = cacheWrites.then(async () => {
          if (requestGeneration !== cacheGeneration) return;
          const cache = await caches.open(CACHE_NAME);
          await cache.put(event.request, copy);
          if (requestGeneration !== cacheGeneration) await caches.delete(CACHE_NAME);
        });
        cacheWrites = write.catch(() => undefined);
        event.waitUntil(cacheWrites);
        return response;
      })
      .catch(() => caches.match(event.request).then((cached) => cached ?? new Response('Offline copy unavailable.', { status: 503 })))
  );
});
