// Service worker do app EUA 2027: funciona offline depois do primeiro acesso.
// App e dados: rede primeiro (para receber atualizações), cache como reserva.
// Documentos cifrados e fontes: cache primeiro (não mudam).
const CACHE = 'eua27-v4';
const BASE = ['./', 'index.html', 'app.js?v=4', 'dados.bin', 'manifest.webmanifest', 'icone-192.png', 'icone-512.png'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(BASE)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  const mesmo = url.origin === location.origin;
  const fonte = /fonts\.(googleapis|gstatic)\.com$/.test(url.hostname);
  if (!mesmo && !fonte) return;
  if (fonte || /\/docs\/.+\.bin$/.test(url.pathname)) {
    e.respondWith(caches.match(req).then((r) => r || fetch(req).then((res) => { if (res.ok) caches.open(CACHE).then((c) => c.put(req, res.clone())); return res; })));
    return;
  }
  e.respondWith(fetch(req).then((res) => { if (res.ok) { const cp = res.clone(); caches.open(CACHE).then((c) => c.put(req, cp)); } return res; }).catch(() => caches.match(req, { ignoreSearch: url.pathname.endsWith('dados.bin') }).then((r) => r || caches.match('index.html'))));
});
