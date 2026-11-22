// Offline cache: network-first for code (so updates arrive), cache-first for audio clips.
const C = 'kaizen-v1';
self.addEventListener('install', e => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));
self.addEventListener('fetch', e => {
  const u = new URL(e.request.url);
  if (e.request.method !== 'GET') return;
  const audio = u.pathname.includes('/audio/');
  e.respondWith((async () => {
    const cache = await caches.open(C);
    if (audio) { const hit = await cache.match(e.request); if (hit) return hit; }
    try { const r = await fetch(e.request); if (r.ok && (u.origin === location.origin || u.host.includes('fonts.g'))) cache.put(e.request, r.clone()); return r; }
    catch (err) { const hit = await cache.match(e.request); if (hit) return hit; throw err; }
  })());
});
