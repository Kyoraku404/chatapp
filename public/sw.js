const CACHE_NAME = 'rush-offline-v1';
const OFFLINE_ASSETS = ['/offline.html', '/icons/rush-192.png', '/icons/rush-512.png'];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(OFFLINE_ASSETS)));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(Promise.all([
    caches.keys().then((keys) => Promise.all(keys.filter((key) => key.startsWith('rush-offline-') && key !== CACHE_NAME).map((key) => caches.delete(key)))),
    self.clients.claim(),
  ]));
});

self.addEventListener('fetch', (event) => {
  if (event.request.mode !== 'navigate' || new URL(event.request.url).origin !== self.location.origin) return;
  // Always use the network for private pages. Never store chats, sessions or API responses.
  event.respondWith(fetch(event.request).catch(async () => {
    const cache = await caches.open(CACHE_NAME);
    return (await cache.match('/offline.html')) || Response.error();
  }));
});
