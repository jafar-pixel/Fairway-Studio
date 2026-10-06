/* Public assets only. Never cache app HTML, API responses, signed URLs or images. */
const CACHE_PREFIX = 'fairway-public-';
const CACHE_NAME = CACHE_PREFIX + 'v1';
const STATIC_PATHS = new Set(['/offline.html', '/pwa/icon-192.png', '/pwa/icon-512.png', '/pwa/maskable-512.png', '/pwa/apple-touch-icon.png']);
function isPublicStatic(request, origin) {
  const url = new URL(request.url);
  return request.method === 'GET' && url.origin === origin && !url.search &&
    !request.headers.has('authorization') && !request.headers.has('rsc') &&
    (STATIC_PATHS.has(url.pathname) || /^\/_next\/static\/[A-Za-z0-9_./-]+\.(?:js|css|woff2?)$/.test(url.pathname));
}
self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE_NAME).then(async cache => {
    for (const path of STATIC_PATHS) {
      const response = await fetch(path, { credentials: 'omit', cache: 'reload', redirect: 'error' });
      const type = response.headers.get('content-type') || '';
      if (!response.ok || response.redirected || (path === '/offline.html' ? !type.includes('text/html') : !type.includes('image/png'))) throw new Error('Public offline asset unavailable: ' + path);
      await cache.put(path, response);
    }
  }));
  // Updates deliberately wait for explicit user confirmation.
});
self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key.startsWith(CACHE_PREFIX) && key !== CACHE_NAME).map(key => caches.delete(key)))).then(() => self.clients.claim()));
});
self.addEventListener('message', event => {
  if (event.data?.type === 'ACTIVATE_UPDATE') self.skipWaiting();
});
self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.mode === 'navigate' && request.method === 'GET' && new URL(request.url).origin === self.location.origin) {
    event.respondWith(fetch(request).catch(async () => (await caches.match('/offline.html')) || new Response('Offline. Please reconnect.', { status: 503, headers: { 'Content-Type': 'text/plain' } })));
    return;
  }
  if (!isPublicStatic(request, self.location.origin)) return;
  event.respondWith(caches.open(CACHE_NAME).then(async cache => {
    const cached = await cache.match(request);
    if (cached) return cached;
    const response = await fetch(request);
    const type = response.headers.get('content-type') || '';
    if (response.ok && !response.redirected && response.type !== 'opaque' && !/text\/html|application\/json/.test(type) && !/no-store|private/i.test(response.headers.get('cache-control') || '')) await cache.put(request, response.clone());
    return response;
  }));
});
