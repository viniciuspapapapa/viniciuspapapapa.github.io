const CACHE = 'sabor-v1';
const STATIC = ['/receitas.html', '/manifest-receitas.json', '/receitas-data.js', '/receitas-app.js'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(STATIC)));
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys =>
    Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
  ));
  self.clients.claim();
});

// Network-first for HTML so updates are picked up; cache fallback when offline.
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (url.pathname === '/receitas.html') {
    e.respondWith(
      fetch(e.request, { cache: 'no-store' })
        .then(r => { caches.open(CACHE).then(c => c.put(e.request, r.clone())); return r; })
        .catch(() => caches.match('/receitas.html'))
    );
    return;
  }
  e.respondWith(caches.match(e.request).then(r => r || fetch(e.request)));
});
