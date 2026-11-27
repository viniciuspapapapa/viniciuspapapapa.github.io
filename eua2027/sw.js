// Service worker do app EUA 2027: funciona offline depois do primeiro acesso.
// App e dados: rede primeiro (para receber atualizações), cache como reserva.
// Documentos cifrados e fontes: cache primeiro (não mudam).
const CACHE = 'eua27-v8';
const BASE = ['./', 'index.html', 'app.js?v=8', 'dados.bin', 'manifest.webmanifest', 'icone-192.png', 'icone-512.png'];

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

// ------------------------------------------------------------------ notificações
// O aviso chega sem conteúdo; o service worker busca o texto cifrado no serviço e o decifra com a chave do grupo,
// que o app guarda no IndexedDB deste aparelho quando os avisos são ativados.
function lerCfg() {
  return new Promise((ok, erro) => {
    const r = indexedDB.open('eua27', 2);
    r.onupgradeneeded = () => { const db = r.result; if (!db.objectStoreNames.contains('arquivos')) db.createObjectStore('arquivos', { keyPath: 'id' }); if (!db.objectStoreNames.contains('cfg')) db.createObjectStore('cfg'); };
    r.onsuccess = () => { try { const g = r.result.transaction('cfg').objectStore('cfg').get('push'); g.onsuccess = () => ok(g.result); g.onerror = () => erro(g.error); } catch (e) { erro(e); } };
    r.onerror = () => erro(r.error);
  });
}
async function textoDoAviso() {
  const cfg = await lerCfg();
  if (!cfg) return '';
  const j = await (await fetch(cfg.url + '/push/aviso', { headers: { 'x-app-token': cfg.token }, cache: 'no-store' })).json();
  if (!j.d) return '';
  const u8 = Uint8Array.from(atob(j.d), (c) => c.charCodeAt(0));
  const chave = await crypto.subtle.importKey('raw', Uint8Array.from(atob(cfg.chave), (c) => c.charCodeAt(0)), { name: 'AES-GCM' }, false, ['decrypt']);
  return new TextDecoder().decode(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: u8.slice(0, 12) }, chave, u8.slice(12)));
}
self.addEventListener('push', (e) => {
  e.waitUntil((async () => {
    let corpo = '';
    try { corpo = await textoDoAviso(); } catch { /* sem rede ou sem chave */ }
    await self.registration.showNotification('EUA 2027', { body: corpo || 'Novidade no grupo. Toque para ver.', icon: 'icone-192.png', badge: 'icone-192.png', tag: 'eua27-' + Date.now(), data: { url: './#/grupo' } });
  })());
});
self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const alvo = new URL(e.notification.data?.url || './', self.registration.scope).href;
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((cs) => {
    const c = cs.find((x) => x.url.startsWith(self.registration.scope));
    if (c) { c.focus(); return c.navigate ? c.navigate(alvo) : null; }
    return self.clients.openWindow(alvo);
  }));
});
