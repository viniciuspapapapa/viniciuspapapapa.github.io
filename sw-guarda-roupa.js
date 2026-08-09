const CACHE = 'closet-v1';
const STATIC = [
  '/guarda-roupa.html',
  '/guarda-roupa-app.js',
  '/manifest-guarda-roupa.json',
  '/icon-closet-192.png',
  '/icon-closet-512.png'
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(STATIC)).catch(() => {}));
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys =>
    Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
  ));
  self.clients.claim();
});

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);

  // Modelos de IA e qualquer origem externa: sempre pela rede (cache do navegador cuida do resto).
  if (url.origin !== self.location.origin) return;

  // Network-first para HTML e JS do app, para que atualizações apareçam de imediato.
  if (url.pathname === '/guarda-roupa.html' || url.pathname === '/guarda-roupa-app.js') {
    e.respondWith(
      fetch(e.request, { cache: 'no-store' })
        .then(r => { const c = r.clone(); caches.open(CACHE).then(cc => cc.put(e.request, c)); return r; })
        .catch(() => caches.match(e.request))
    );
    return;
  }

  e.respondWith(caches.match(e.request).then(r => r || fetch(e.request)));
});
