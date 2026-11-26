/* EUA 2027 — app da viagem do grupo (versão 5).
   Conteúdo base: dados.bin e docs/*.bin, cifrados com AES-256-GCM (chave derivada da senha do grupo).
   Estado compartilhado (gastos, checklist, reservas, voos, votos, arquivos, lugares do grupo, comentários):
   localStorage + sincronização automática com o serviço eua27-sync (Cloudflare), registro a registro e cifrado.
   Lugares do grupo e comentários vivem na coleção "conf" (chaves "l:" e "c:"), já aceita pelo serviço. */
'use strict';

const K_CHAVE = 'eua27:chave';
const K_ESTADO = 'eua27:estado';
const ITERACOES = 310000;
const MAGICA = 'EUA27';

// ------------------------------------------------------------------ utilidades
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const enc = encodeURIComponent;
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
const slug = (s) => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
const SEM = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];
const dt = (iso) => { const [y, m, d] = iso.slice(0, 10).split('-').map(Number); return new Date(y, m - 1, d); };
const isoDe = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const isoHoje = () => isoDe(new Date());
const ddmm = (iso) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
const semana = (iso) => SEM[dt(iso).getDay()];
const hora = (iso) => iso.slice(11, 16);
const diasEntre = (a, b) => Math.round((dt(b) - dt(a)) / 86400000);
const somaDias = (iso, n) => { const d = dt(iso); d.setDate(d.getDate() + n); return isoDe(d); };
const hhmm = (ts) => new Date(ts).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
const rotuloDia = (ts) => { const i = isoDe(new Date(ts)); const h = isoHoje(); return i === h ? 'Hoje' : i === somaDias(h, -1) ? 'Ontem' : `${semana(i)}, ${ddmm(i)}`; };
const quando = (ts) => `${rotuloDia(ts) === 'Hoje' ? 'às ' : rotuloDia(ts).toLowerCase() + ' às '}${hhmm(ts)}`;
const usd = (v) => 'US$ ' + (Math.round(v * 100) / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const brl = (v) => 'R$ ' + (Math.round(v * 100) / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const numero = (s) => { if (typeof s === 'number') return s; const t = String(s).trim().replace(/\s/g, ''); const n = t.includes(',') ? t.replace(/\./g, '').replace(',', '.') : t; return parseFloat(n) || 0; };
const ehUrl = (q) => /^https?:\/\//i.test(String(q || '').trim());
const mapsIr = (q) => (ehUrl(q) ? q : `https://www.google.com/maps/dir/?api=1&destination=${enc(q)}`);
const mapsVer = (q) => (ehUrl(q) ? q : `https://www.google.com/maps/search/?api=1&query=${enc(q)}`);
const mapsRota = (paradas) => {
  const p = paradas.filter(Boolean);
  if (p.length < 2) return mapsIr(p[0] || '');
  let u = `https://www.google.com/maps/dir/?api=1&origin=${enc(p[0])}&destination=${enc(p[p.length - 1])}&travelmode=driving`;
  if (p.length > 2) u += `&waypoints=${enc(p.slice(1, -1).join('|'))}`;
  return u;
};
const b64 = {
  de: (u8) => { let s = ''; for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000)); return btoa(s); },
  para: (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0)),
  url: (u8) => b64.de(u8).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''),
  deUrl: (s) => b64.para(s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4)),
};

// ------------------------------------------------------------------ ícones (Lucide)
const P = {
  home: '<path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><path d="M9 22V12h6v10"/>',
  map: '<polygon points="3 6 9 3 15 6 21 3 21 18 15 21 9 18 3 21"/><line x1="9" x2="9" y1="3" y2="18"/><line x1="15" x2="15" y1="6" y2="21"/>',
  compass: '<circle cx="12" cy="12" r="10"/><polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76"/>',
  wallet: '<path d="M19 7V4a1 1 0 0 0-1-1H5a2 2 0 0 0 0 4h15a1 1 0 0 1 1 1v4h-3a2 2 0 0 0 0 4h3a1 1 0 0 0 1-1v-2a1 1 0 0 0-1-1"/><path d="M3 5v14a2 2 0 0 0 2 2h15a1 1 0 0 0 1-1v-4"/>',
  users: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
  plane: '<path d="M17.8 19.2 16 11l3.5-3.5C21 6 21.5 4 21 3c-1-.5-3 0-4.5 1.5L13 8 4.8 6.2c-.5-.1-.9.1-1.1.5l-.3.5c-.2.5-.1 1 .3 1.3L9 12l-2 3H4l-1 1 3 2 2 3 1-1v-3l3-2 3.5 5.3c.3.4.8.5 1.3.3l.5-.2c.4-.3.6-.7.5-1.2z"/>',
  car: '<path d="M19 17h2c.6 0 1-.4 1-1v-3c0-.9-.7-1.7-1.5-1.9C18.7 10.6 16 10 16 10s-1.3-1.4-2.2-2.3c-.5-.4-1.1-.7-1.8-.7H5c-.6 0-1.1.4-1.4.9l-1.4 2.9A3.7 3.7 0 0 0 2 12v4c0 .6.4 1 1 1h2"/><circle cx="7" cy="17" r="2"/><path d="M9 17h6"/><circle cx="17" cy="17" r="2"/>',
  food: '<path d="M3 2v7c0 1.1.9 2 2 2h4a2 2 0 0 0 2-2V2"/><path d="M7 2v20"/><path d="M21 15V2a5 5 0 0 0-5 5v6c0 1.1.9 2 2 2h3Zm0 0v7"/>',
  bar: '<path d="M8 22h8"/><path d="M12 11v11"/><path d="m19 3-7 8-7-8Z"/>',
  music: '<path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/>',
  spark: '<path d="M9.94 15.5A2 2 0 0 0 8.5 14.06l-6.14-1.58a.5.5 0 0 1 0-.96L8.5 9.94A2 2 0 0 0 9.94 8.5l1.58-6.14a.5.5 0 0 1 .96 0L14.06 8.5A2 2 0 0 0 15.5 9.94l6.14 1.58a.5.5 0 0 1 0 .96L15.5 14.06a2 2 0 0 0-1.44 1.44l-1.58 6.14a.5.5 0 0 1-.96 0z"/>',
  mountain: '<path d="m8 3 4 8 5-5 5 15H2L8 3z"/>',
  tent: '<path d="M3.5 21 14 3"/><path d="M20.5 21 10 3"/><path d="M15.5 21 12 15l-3.5 6"/><path d="M2 21h20"/>',
  waves: '<path d="M2 6c.6.5 1.2 1 2.5 1C7 7 7 5 9.5 5c2.6 0 2.4 2 5 2 2.5 0 2.5-2 5-2 1.3 0 1.9.5 2.5 1"/><path d="M2 12c.6.5 1.2 1 2.5 1 2.5 0 2.5-2 5-2 2.6 0 2.4 2 5 2 2.5 0 2.5-2 5-2 1.3 0 1.9.5 2.5 1"/><path d="M2 18c.6.5 1.2 1 2.5 1 2.5 0 2.5-2 5-2 2.6 0 2.4 2 5 2 2.5 0 2.5-2 5-2 1.3 0 1.9.5 2.5 1"/>',
  bag: '<path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z"/><path d="M3 6h18"/><path d="M16 10a4 4 0 0 1-8 0"/>',
  landmark: '<line x1="3" x2="21" y1="22" y2="22"/><line x1="6" x2="6" y1="18" y2="11"/><line x1="10" x2="10" y1="18" y2="11"/><line x1="14" x2="14" y1="18" y2="11"/><line x1="18" x2="18" y1="18" y2="11"/><polygon points="12 2 20 7 4 7"/>',
  fuel: '<line x1="3" x2="15" y1="22" y2="22"/><line x1="4" x2="14" y1="9" y2="9"/><path d="M14 22V4a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v18"/><path d="M14 13h2a2 2 0 0 1 2 2v2a2 2 0 0 0 2 2 2 2 0 0 0 2-2V9.83a2 2 0 0 0-.59-1.42L18 5"/>',
  bed: '<path d="M2 4v16"/><path d="M2 8h18a2 2 0 0 1 2 2v10"/><path d="M2 17h20"/><path d="M6 8v9"/>',
  nav: '<polygon points="3 11 22 2 13 21 11 13 3 11"/>',
  pin: '<path d="M20 10c0 5-5.54 10.19-7.4 11.8a1 1 0 0 1-1.2 0C9.54 20.19 4 15 4 10a8 8 0 0 1 16 0"/><circle cx="12" cy="10" r="3"/>',
  file: '<path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/><path d="M16 13H8"/><path d="M16 17H8"/><path d="M10 9H8"/>',
  img: '<rect width="18" height="18" x="3" y="3" rx="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.09-3.09a2 2 0 0 0-2.82 0L6 21"/>',
  down: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" x2="12" y1="15" y2="3"/>',
  up: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" x2="12" y1="3" y2="15"/>',
  plus: '<path d="M5 12h14"/><path d="M12 5v14"/>',
  x: '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
  check: '<path d="M20 6 9 17l-5-5"/>',
  alert: '<path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3"/><path d="M12 9v4"/><path d="M12 17h.01"/>',
  share: '<path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/><polyline points="16 6 12 2 8 6"/><line x1="12" x2="12" y1="2" y2="15"/>',
  sync: '<path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/><path d="M8 16H3v5"/>',
  phone: '<path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.8 19.8 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.12 4.18 2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.91.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92z"/>',
  wa: '<path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z"/>',
  chat: '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>',
  send: '<path d="m22 2-7 20-4-9-9-4Z"/><path d="M22 2 11 13"/>',
  edit: '<path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/>',
  lock: '<rect width="18" height="11" x="3" y="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>',
  search: '<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>',
  flame: '<path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.07-2.14-.22-4.05 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.15.43-2.29 1-3a2.5 2.5 0 0 0 2.5 2.5z"/>',
  heart: '<path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/>',
  rv: '<path d="M18 19V9a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v8a2 2 0 0 0 2 2h2"/><path d="M2 9h12"/><circle cx="8" cy="19" r="2"/><path d="M10 19h12v-2"/><rect width="4" height="4" x="10" y="9"/>',
  copy: '<rect width="14" height="14" x="8" y="8" rx="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2"/><path d="M12 20v2"/><path d="m4.93 4.93 1.41 1.41"/><path d="m17.66 17.66 1.41 1.41"/><path d="M2 12h2"/><path d="M20 12h2"/><path d="m6.34 17.66-1.41 1.41"/><path d="m19.07 4.93-1.41 1.41"/>',
  moon: '<path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/>',
  folder: '<path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z"/>',
  dice: '<rect width="18" height="18" x="3" y="3" rx="2"/><path d="M16 8h.01"/><path d="M8 8h.01"/><path d="M8 16h.01"/><path d="M16 16h.01"/><path d="M12 12h.01"/>',
  trash: '<path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/>',
  chev: '<path d="m9 18 6-6-6-6"/>',
  ext: '<path d="M15 3h6v6"/><path d="M10 14 21 3"/><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>',
  ticket: '<path d="M2 9a3 3 0 0 1 0 6v2a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-2a3 3 0 0 1 0-6V7a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2Z"/><path d="M13 5v2"/><path d="M13 17v2"/><path d="M13 11v2"/>',
  info: '<circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/>',
  list: '<path d="m3 17 2 2 4-4"/><path d="m3 7 2 2 4-4"/><path d="M13 6h8"/><path d="M13 12h8"/><path d="M13 18h8"/>',
  bulb: '<path d="M15 14c.2-1 .7-1.7 1.5-2.5 1-.9 1.5-2.2 1.5-3.5A6 6 0 0 0 6 8c0 1 .2 2.2 1.5 3.5.7.7 1.3 1.5 1.5 2.5"/><path d="M9 18h6"/><path d="M10 22h4"/>',
  temp: '<path d="M14 4v10.54a4 4 0 1 1-4 0V4a2 2 0 0 1 4 0Z"/>',
  star: '<polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>',
  shield: '<path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"/>',
};
const ic = (n, cls = '') => `<svg class="i ${cls}" viewBox="0 0 24 24" aria-hidden="true">${P[n] || ''}</svg>`;
const ICAT = { balada: 'music', bar: 'bar', piscina: 'waves', comer: 'food', show: 'ticket', atracao: 'landmark', natureza: 'mountain', camping: 'tent', compras: 'bag', apoio: 'fuel', hotel: 'bed', outro: 'pin' };
const ITIPO = { voo: 'plane', transporte: 'car', atividade: 'spark', comida: 'food', noite: 'music', show: 'ticket', hotel: 'bed' };
const CATG = [
  { id: 'hospedagem', nome: 'Hospedagem', ic: 'bed' }, { id: 'motorhome', nome: 'Motorhome', ic: 'rv' }, { id: 'transporte', nome: 'Transporte', ic: 'car' },
  { id: 'combustivel', nome: 'Combustível', ic: 'fuel' }, { id: 'comida', nome: 'Comida', ic: 'food' }, { id: 'mercado', nome: 'Mercado', ic: 'bag' },
  { id: 'balada', nome: 'Bebida e balada', ic: 'bar' }, { id: 'ingressos', nome: 'Ingressos', ic: 'ticket' }, { id: 'outros', nome: 'Outros', ic: 'spark' },
];
const TIPOS_LUGAR = [['hotel', 'Hotel'], ['comer', 'Restaurante'], ['bar', 'Bar'], ['balada', 'Balada'], ['atracao', 'Passeio'], ['natureza', 'Natureza'], ['compras', 'Compras'], ['outro', 'Outro']];
const TIPOS_ARQ = [['doc', 'Documento', 'file'], ['voo', 'Passagem', 'plane'], ['hotel', 'Hotel', 'bed'], ['ingresso', 'Ingresso', 'ticket'], ['seguro', 'Seguro', 'shield'], ['outro', 'Outro', 'folder']];
const ROT_ARQ = Object.fromEntries(TIPOS_ARQ.map(([k, n]) => [k, n]));

// ------------------------------------------------------------------ cripto
let CHAVE = null;
async function derivar(senha, sal) {
  const base = await crypto.subtle.importKey('raw', new TextEncoder().encode(senha), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey({ name: 'PBKDF2', salt: sal, iterations: ITERACOES, hash: 'SHA-256' }, base, { name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']);
}
function partes(buf) {
  const b = new Uint8Array(buf);
  if (String.fromCharCode(...b.slice(0, 5)) !== MAGICA) throw new Error('formato');
  return { sal: b.slice(6, 22), iv: b.slice(22, 34), dados: b.slice(34) };
}
async function abrirBin(buf, chave = CHAVE) { const p = partes(buf); return new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: p.iv }, chave, p.dados)); }
async function lacrar(bytes) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const c = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, CHAVE, bytes));
  const out = new Uint8Array(12 + c.length); out.set(iv); out.set(c, 12); return out;
}
async function deslacrar(u8) { return new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: u8.slice(0, 12) }, CHAVE, u8.slice(12))); }
async function comprimir(u8) { if (!('CompressionStream' in window)) return u8; return new Uint8Array(await new Response(new Blob([u8]).stream().pipeThrough(new CompressionStream('deflate-raw'))).arrayBuffer()); }
async function descomprimir(u8) { if (!('DecompressionStream' in window)) return u8; return new Uint8Array(await new Response(new Blob([u8]).stream().pipeThrough(new DecompressionStream('deflate-raw'))).arrayBuffer()); }

// ------------------------------------------------------------------ estado local
let D = null;
let S = carregar();
function carregar() {
  let s = {};
  try { s = JSON.parse(localStorage.getItem(K_ESTADO) || '{}'); } catch { s = {}; }
  s.sync ||= {};
  for (const c of ['gastos', 'check', 'hoteis', 'pix', 'conf', 'voos', 'votos', 'arquivos']) s.sync[c] ||= {};
  s.pendUp ||= [];
  s.cambio ||= 5.5;
  s.ui ||= {};
  return s;
}
function salvar(semSync) {
  try { localStorage.setItem(K_ESTADO, JSON.stringify(S)); } catch { toast('Não foi possível salvar neste aparelho.'); }
  if (!semSync) agendarSync();
}
const conf = (k, padrao) => S.sync.conf[k]?.v ?? padrao;
function setConf(k, v) { S.sync.conf[k] = { v, ts: Date.now(), por: S.eu || '' }; salvar(); }
const rotaAtual = () => conf('rota', 'A');
function mesclar(outro) {
  let novos = 0;
  for (const col of Object.keys(outro || {})) {
    S.sync[col] ||= {};
    for (const [k, v] of Object.entries(outro[col] || {})) {
      const meu = S.sync[col][k];
      if (!meu || (v.ts || 0) > (meu.ts || 0)) { S.sync[col][k] = v; novos++; }
    }
  }
  salvar();
  return novos;
}

// ------------------------------------------------------------------ IndexedDB (conteúdo dos arquivos anexados)
const idb = {
  db: null,
  abrir() {
    if (this.db) return Promise.resolve(this.db);
    return new Promise((ok, erro) => {
      const r = indexedDB.open('eua27', 1);
      r.onupgradeneeded = () => r.result.createObjectStore('arquivos', { keyPath: 'id' });
      r.onsuccess = () => { this.db = r.result; ok(this.db); };
      r.onerror = () => erro(r.error);
    });
  },
  async tx(modo, fn) { const db = await this.abrir(); return new Promise((ok, erro) => { const t = db.transaction('arquivos', modo); const r = fn(t.objectStore('arquivos')); t.oncomplete = () => ok(r?.result); t.onerror = () => erro(t.error); }); },
  put(o) { return this.tx('readwrite', (st) => st.put(o)); },
  del(id) { return this.tx('readwrite', (st) => st.delete(id)); },
  get(id) { return this.tx('readonly', (st) => st.get(id)); },
  all() { return this.tx('readonly', (st) => st.getAll()); },
};
let LOCAIS = new Set();
async function recarregarArquivos() { try { LOCAIS = new Set((await idb.all()).map((a) => a.id)); } catch { LOCAIS = new Set(); } }
const anexos = () => Object.values(S.sync.arquivos).filter((a) => a && !a.del && a.id).sort((a, b) => (b.criado || 0) - (a.criado || 0));
// Dono do arquivo: o escolhido ao anexar; para anexos antigos, o nome da pessoa no título; senão, quem enviou.
const donoDe = (a) => {
  if (a.dono) return a.dono;
  if (a.kind === 'hotel') return 'grupo';
  const t = ' ' + slug(a.titulo || a.nome || '').replace(/-/g, ' ') + ' ';
  const achou = D?.pessoas.find((p) => slug(p.nome).split('-').some((n) => n.length > 3 && t.includes(' ' + n + ' ')));
  return achou?.id || a.pessoa || 'grupo';
};

// ------------------------------------------------------------------ sincronização automática (serviço Cloudflare)
const SYNC = { url: '', token: '', status: 'off', ultimo: 0, rodando: false, denovo: false, pend: false, t: null, timer: null };
let SRV = null;
const autoSync = () => SYNC.status === 'ok';
const aviso = () => (autoSync() || SYNC.status === 'offline' ? '' : ' Envie ao grupo em Ajustes.');
function agendarSync() { if (!SYNC.url) return; clearTimeout(SYNC.t); SYNC.t = setTimeout(sincronizar, 800); }
async function iniciarSync() {
  SYNC.url = String(D.sincronizacao?.url || '').replace(/\/+$/, '');
  if (!SYNC.url || !CHAVE) return;
  const raw = new Uint8Array(await crypto.subtle.exportKey('raw', CHAVE));
  const h = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode('eua27-sync:' + b64.de(raw))));
  SYNC.token = [...h].map((b) => b.toString(16).padStart(2, '0')).join('');
  SYNC.status = 'conectando'; atualizarIndicador();
  await sincronizar();
  clearInterval(SYNC.timer);
  SYNC.timer = setInterval(() => { if (document.visibilityState === 'visible') sincronizar(); }, 15000);
}
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && SYNC.token) sincronizar(); });
window.addEventListener('online', () => { if (SYNC.token) sincronizar(); });
async function pedir(caminho, opc = {}) {
  const r = await fetch(SYNC.url + caminho, { ...opc, cache: 'no-store', headers: { 'x-app-token': SYNC.token, ...(opc.headers || {}) } });
  if (!r.ok) throw new Error('HTTP ' + r.status);
  return r;
}
const cifrarReg = async (v) => b64.de(await lacrar(new TextEncoder().encode(JSON.stringify(v))));
const decifrarReg = async (d) => JSON.parse(new TextDecoder().decode(await deslacrar(b64.para(d))));
async function adotar(srv) {
  let n = 0;
  for (const [c, regs] of Object.entries(srv?.col || {})) {
    S.sync[c] ||= {};
    for (const [k, r] of Object.entries(regs || {})) {
      const meu = S.sync[c][k];
      if (!meu || r.ts > (meu.ts || 0)) { try { S.sync[c][k] = await decifrarReg(r.d); n++; } catch { /* outra chave */ } }
    }
  }
  return n;
}
async function diferenca(srv) {
  const out = {}; let n = 0;
  for (const [c, regs] of Object.entries(S.sync)) {
    for (const [k, v] of Object.entries(regs || {})) {
      const s = srv?.col?.[c]?.[k];
      if (!s || (v.ts || 0) > s.ts) { (out[c] ||= {})[k] = { ts: v.ts || 0, d: await cifrarReg(v) }; n++; }
    }
  }
  return n ? out : null;
}
async function sincronizar() {
  if (!SYNC.url || !SYNC.token) return;
  if (SYNC.rodando) { SYNC.denovo = true; return; }
  SYNC.rodando = true;
  let novos = 0;
  try {
    const r = await (await pedir('/estado' + (SRV ? '?rev=' + SRV.rev : ''))).json();
    if (!r.igual) SRV = r;
    novos += await adotar(SRV);
    await enviarArquivos();
    const d = await diferenca(SRV);
    if (d) { SRV = await (await pedir('/estado', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ col: d }) })).json(); novos += await adotar(SRV); }
    SYNC.status = 'ok'; SYNC.ultimo = Date.now();
  } catch {
    SYNC.status = SYNC.status === 'ok' || SYNC.status === 'offline' ? 'offline' : 'indisponivel';
  } finally {
    SYNC.rodando = false;
    if (novos) { salvar(true); atualizarTela(); } else atualizarIndicador();
    if (SYNC.denovo) { SYNC.denovo = false; setTimeout(sincronizar, 300); }
  }
}
function atualizarTela() {
  const th = $('.sheet [data-thread]');
  if (th) th.innerHTML = listaComentarios(th.dataset.thread);
  const digitando = document.activeElement && /INPUT|TEXTAREA/.test(document.activeElement.tagName);
  if ($('.sheet') || digitando) { SYNC.pend = true; atualizarIndicador(); return; }
  const y = window.scrollY; render(); window.scrollTo(0, y);
}
function pillSync() {
  return {
    ok: `<span class="tag ok">${ic('check', 'sm')}Sincronizado com o grupo às ${SYNC.ultimo ? hhmm(SYNC.ultimo) : ''}</span>`,
    conectando: `<span class="tag">${ic('sync', 'sm')}Conectando ao grupo…</span>`,
    offline: `<span class="tag warn">${ic('alert', 'sm')}Sem conexão: as mudanças vão quando a internet voltar</span>`,
    indisponivel: `<span class="tag warn">${ic('alert', 'sm')}Sincronização automática indisponível</span>`,
  }[SYNC.status] || '';
}
function atualizarIndicador() {
  $$('.syncpill').forEach((el) => { el.innerHTML = pillSync(); });
  const n = naoLidas(); const b = $('nav.tabs [data-badge]');
  if (b) { b.textContent = n > 9 ? '9+' : String(n); b.classList.toggle('hidden', !n); }
}
async function enviarArquivos() {
  for (const id of [...(S.pendUp || [])]) {
    const meta = S.sync.arquivos[id];
    const loc = await idb.get(id).catch(() => null);
    if (!meta || meta.del || !loc) { S.pendUp = S.pendUp.filter((x) => x !== id); continue; }
    await pedir('/arquivo/' + id, { method: 'PUT', body: await lacrar(new Uint8Array(await loc.blob.arrayBuffer())) });
    S.sync.arquivos[id] = { ...meta, remoto: true, ts: Date.now() };
    S.pendUp = S.pendUp.filter((x) => x !== id);
    salvar(true);
  }
}
async function obterBlob(id) {
  const loc = await idb.get(id).catch(() => null);
  if (loc) return loc;
  const meta = S.sync.arquivos[id];
  if (!meta) return null;
  if (!meta.remoto || !SYNC.token) { toast(`Ainda não enviado pelo aparelho de ${nome(meta.pessoa)}.`); return null; }
  toast('Baixando ' + meta.titulo + '…');
  try {
    const bytes = await deslacrar(new Uint8Array(await (await pedir('/arquivo/' + id)).arrayBuffer()));
    const reg = { ...meta, blob: new Blob([bytes], { type: meta.tipo }) };
    await idb.put(reg); LOCAIS.add(id);
    return reg;
  } catch { toast('Não foi possível baixar. Verifique a conexão.'); return null; }
}
async function migrarArquivos() {
  try {
    for (const a of await idb.all()) {
      if (S.sync.arquivos[a.id]) continue;
      const { blob, ...m } = a;
      S.sync.arquivos[a.id] = { ...m, remoto: false, ts: a.criado || Date.now() };
      if (!S.pendUp.includes(a.id)) S.pendUp.push(a.id);
    }
    salvar();
  } catch { /* sem IndexedDB */ }
}

// ------------------------------------------------------------------ interface básica
function toast(msg) { const t = $('#toast'); t.textContent = msg; t.classList.add('on'); clearTimeout(toast.h); toast.h = setTimeout(() => t.classList.remove('on'), 3200); }
async function copiar(txt, msg = 'Copiado') { try { await navigator.clipboard.writeText(txt); toast(msg); } catch { prompt('Copie:', txt); } }
function abrirSheet(titulo, html, aoMontar) {
  fecharSheet(true);
  const scrim = document.createElement('div'); scrim.className = 'scrim'; scrim.dataset.a = 'fechar';
  const sh = document.createElement('div'); sh.className = 'sheet'; sh.setAttribute('role', 'dialog'); sh.setAttribute('aria-modal', 'true'); sh.setAttribute('aria-label', titulo);
  sh.innerHTML = `<div class="grab"></div><div class="sh"><h2>${esc(titulo)}</h2><button class="iconbtn" data-a="fechar" aria-label="Fechar">${ic('x')}</button></div><div class="sb">${html}</div>`;
  document.body.append(scrim, sh);
  requestAnimationFrame(() => { scrim.classList.add('on'); sh.classList.add('on'); });
  document.body.style.overflow = 'hidden';
  aoMontar?.(sh);
  return sh;
}
function fecharSheet(imediato) {
  const sh = $('.sheet'), sc = $('.scrim');
  if (!sh) return;
  document.body.style.overflow = '';
  if (imediato) { sh.remove(); sc?.remove(); return; }
  sh.classList.remove('on'); sc?.classList.remove('on');
  setTimeout(() => { sh.remove(); sc?.remove(); if (SYNC.pend && !$('.sheet')) { SYNC.pend = false; atualizarTela(); } }, 220);
}
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') fecharSheet(); });

const pessoa = (id) => D.pessoas.find((p) => p.id === id);
const nome = (id) => (id === 'grupo' ? 'Grupo' : pessoa(id)?.curto || 'Alguém');
const av = (id, cls = '') => { const p = pessoa(id); return p ? `<img class="av ${cls}" src="${p.foto}" alt="${esc(p.curto)}" width="40" height="40">` : `<span class="av ${cls}" style="display:grid;place-items:center;color:var(--mute)">${ic('users', 'sm')}</span>`; };
const fimPessoa = (p) => p.ate || '2027-04-24';
const presentes = (iso) => D.pessoas.filter((p) => p.de <= iso && iso <= fimPessoa(p)).map((p) => p.id);
const avs = (ids, cls = 'sm') => `<span class="avs">${ids.map((i) => av(i, cls)).join('')}</span>`;
const flames = (n) => (n ? `<span class="flames" aria-label="Animação ${n} de 3">${[1, 2, 3].map((i) => `<svg class="i ${i > n ? 'off' : ''}" viewBox="0 0 24 24">${P.flame}</svg>`).join('')}</span>` : '');
const corFase = (f) => `var(--${f || 'pre'})`;
const btnIr = (q, txt = 'Ir') => `<a class="btn sm primary" href="${esc(mapsIr(q))}" target="_blank" rel="noopener">${ic('nav', 'sm')}${txt}</a>`;
const btnGoogle = (q, cls = 'primary') => `<a class="btn sm ${cls}" href="${esc(mapsVer(q))}" target="_blank" rel="noopener">${ic('star', 'sm')}Ver no Google</a>`;
const btnMapa = (q) => `<a class="btn sm" href="${esc(mapsVer(q))}" target="_blank" rel="noopener">${ic('pin', 'sm')}Mapa</a>`;
const cab = (eyebrow, titulo, sub = '') => `<div class="pagehead"><div class="grow"><p class="eyebrow">${eyebrow}</p><h1 class="title">${esc(titulo)}</h1>${sub ? `<p class="sub">${sub}</p>` : ''}</div><button class="me" data-a="ajustes" aria-label="Ajustes e contatos">${S.eu ? av(S.eu) : `<span class="iconbtn">${ic('users')}</span>`}</button></div>`;
const seg = (base, atual, opcoes) => `<div class="seg" role="tablist">${opcoes.map(([k, n]) => `<button role="tab" aria-selected="${atual === k}" data-a="go" data-h="#/${base}/${k}">${n}</button>`).join('')}</div>`;
const tam = (b) => (b > 1048576 ? (b / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(b / 1024)) + ' KB');

// ------------------------------------------------------------------ dados derivados
const reserva = (slot) => { const r = S.sync.hoteis[slot]; return r && !r.del && r.nome ? r : null; };
function diasViagem() {
  const r = D.roteiros.find((x) => x.id === rotaAtual()) || D.roteiros[0];
  const porData = Object.fromEntries(D.dias.map((d) => [d.data, d]));
  const out = [];
  for (let iso = '2027-04-09'; iso <= D.fim; iso = somaDias(iso, 1)) {
    const fixo = porData[iso];
    const rd = r.dias.find((x) => x.data === iso);
    if (rd) out.push({ data: iso, fase: 'rv', titulo: rd.titulo, cidade: D.cidades.find((c) => c.id === rd.cidade)?.nome, cidadeId: rd.cidade, rv: rd, itens: fixo?.itens || [], pernoite: rd.camp?.nome });
    else if (fixo) {
      const res = fixo.hotel && reserva(fixo.hotel);
      out.push({ ...fixo, pernoite: res ? res.nome : fixo.pernoite, cidadeId: fixo.fase === 'la' ? 'la' : 'lv' });
    }
  }
  return out;
}
function lugares() {
  const base = D.lugares.map((l) => ({ ...l }));
  const meus = Object.entries(S.sync.conf).filter(([k, v]) => k.startsWith('l:') && v && !v.del && v.v).map(([k, v]) => ({ id: k, ...v.v, energia: 0, preco: '', custom: true, por: v.por, criado: v.criado || v.ts }));
  meus.sort((a, b) => b.criado - a.criado);
  return [...meus, ...base];
}
const lugarPorId = (id) => lugares().find((l) => l.id === id);
function comentarios(alvo) {
  return Object.entries(S.sync.conf).filter(([k, v]) => k.startsWith('c:') && v && !v.del && v.v?.alvo === alvo).map(([k, v]) => ({ id: k, ...v })).sort((a, b) => a.ts - b.ts);
}
const nComent = (alvo) => comentarios(alvo).length;
function nomeAlvo(alvo) {
  if (alvo.startsWith('dia:')) { const i = alvo.slice(4); return `o dia ${semana(i)}, ${ddmm(i)}`; }
  return lugarPorId(alvo)?.nome || 'um lugar';
}
const votosDe = (lid) => D.pessoas.filter((p) => S.sync.votos[`${lid}|${p.id}`]?.v).map((p) => p.id);

// Linha do tempo do grupo: cada registro compartilhado vira um evento com autor e horário.
let EVS = [];
function eventos() {
  const ev = [];
  const add = (ts, por, icone, txt, acao) => { if (ts > 1000) ev.push({ ts, por: por || '', ic: icone, txt, acao }); };
  const marco = marcoZero();
  for (const g of Object.values(S.sync.gastos)) {
    if (!g || (g.ts || 0) < marco) continue;
    const valor = g.moeda === 'BRL' ? brl(g.valor) : usd(g.valor);
    const edit = g.criado && g.ts - g.criado > 5000;
    add(g.ts, g.por || g.pagou, 'wallet', g.del ? `apagou o gasto “${esc(g.desc)}”` : `${edit ? 'editou' : 'lançou'} o gasto “${esc(g.desc)}” (${valor}, pago por ${esc(nome(g.pagou))})`, g.del ? null : { a: 'editarGasto', id: g.id });
  }
  for (const [k, v] of Object.entries(S.sync.check)) {
    const c = D.checklist.find((x) => x.id === k); if (!c || !v) continue;
    add(v.ts, v.por, 'list', `${v.v ? 'concluiu' : 'reabriu'} a tarefa “${esc(c.texto)}”`, { a: 'checklist' });
  }
  for (const [k, r] of Object.entries(S.sync.hoteis)) {
    const h = D.hoteis.find((x) => x.id === k); if (!h || !r) continue;
    add(r.ts, r.por, 'bed', r.del ? `removeu a reserva de hotel de ${esc(h.titulo)}` : `registrou a reserva no ${esc(r.nome)} (${esc(h.titulo)})`, { h: '#/roteiro/reservas' });
  }
  for (const v of Object.values(S.sync.voos)) {
    if (!v) continue;
    add(v.ts, v.por, 'plane', v.del ? `removeu o voo ${esc(v.numero)}` : `cadastrou o voo ${esc(v.numero)} (${esc(v.de)} → ${esc(v.para)}) de ${esc((v.pessoas || []).map(nome).join(', '))}`, v.del ? null : { a: 'verVoo', id: v.id });
  }
  for (const [k, v] of Object.entries(S.sync.votos)) {
    if (!v?.v) continue;
    const [lid, pid] = k.split('|'); const l = lugarPorId(lid); if (!l) continue;
    add(v.ts, v.por || pid, 'heart', `quer ir a ${esc(l.nome)}`, { a: 'lugar', id: lid });
  }
  for (const [k, v] of Object.entries(S.sync.pix)) if (v) add(v.ts, v.por || k, 'wallet', `atualizou a chave Pix de ${esc(nome(k))}`, { h: '#/gastos' });
  for (const a of Object.values(S.sync.arquivos)) {
    if (!a) continue;
    const dono = donoDe(a);
    add(a.del ? a.ts : a.criado || a.ts, a.pessoa, a.del ? 'trash' : 'file', a.del ? `apagou o arquivo “${esc(a.titulo)}”` : `anexou “${esc(a.titulo)}”${dono !== a.pessoa ? ` em ${dono === 'grupo' ? 'arquivos do grupo' : 'arquivos de ' + esc(nome(dono))}` : ''}`, a.del ? null : { a: 'abrirArq', id: a.id });
  }
  for (const [k, v] of Object.entries(S.sync.conf)) {
    if (!v) continue;
    if (k === 'rota') add(v.ts, v.por, 'map', `escolheu o roteiro ${esc(v.v)} do motorhome`, { h: '#/roteiro/motorhome' });
    else if (k === 'gastosDesde') add(v.ts, v.por, 'trash', 'zerou os gastos', { h: '#/gastos' });
    else if (k.startsWith('l:') && v.v) add(v.ts, v.por, v.del ? 'trash' : ICAT[v.v.cat] || 'pin', v.del ? `removeu o lugar ${esc(v.v.nome)}` : `${v.criado && v.ts - v.criado > 5000 ? 'editou' : 'adicionou'} o lugar ${esc(v.v.nome)}`, v.del ? null : { a: 'lugar', id: k });
    else if (k.startsWith('c:') && v.v && !v.del) add(v.ts, v.por, 'chat', `comentou em ${esc(nomeAlvo(v.v.alvo))}: “${esc(String(v.v.texto).slice(0, 90))}”`, { a: 'comentar', alvo: v.v.alvo });
  }
  return ev.sort((a, b) => b.ts - a.ts);
}
const naoLidas = () => (D ? eventos().filter((e) => e.por !== S.eu && e.ts > (S.ui.visto || 0)).length : 0);
function linhaEvento(e, i) {
  return `<button class="ev" ${e.acao ? `data-a="evento" data-i="${i}"` : 'disabled style="opacity:1"'}>${av(e.por, 'sm')}<span class="tipo">${ic(e.ic)}</span><span class="grow"><span class="txt"><b>${esc(nome(e.por))}</b> ${e.txt}</span><span class="hr" style="display:block">${quando(e.ts)}</span></span>${e.acao ? ic('chev', 'sm') : ''}</button>`;
}

// ------------------------------------------------------------------ desbloqueio
function telaBloqueio(erro = '') {
  document.body.style.paddingBottom = '0';
  $('#app').innerHTML = `
  <section class="lock"><div class="sunl"></div><div class="in">
    <p class="eyebrow" style="color:rgba(255,255,255,.8)">Los Angeles · Las Vegas · Cânions</p>
    <h1>EUA 2027</h1>
    <p>Roteiro, motorhome, documentos e gastos do grupo. O conteúdo é cifrado: digite a senha combinada.</p>
    <form id="flock" autocomplete="on">
      <label class="sr" for="senha">Senha do grupo</label>
      <input class="inp" id="senha" name="password" type="password" autocomplete="current-password" placeholder="Senha do grupo" required>
      <label class="rem"><input type="checkbox" id="lembrar" checked> Lembrar neste aparelho</label>
      <button class="btn primary block" type="submit">${ic('lock')}Entrar</button>
      <p class="err" role="alert">${esc(erro)}</p>
    </form></div></section>`;
  $('#flock').addEventListener('submit', async (e) => {
    e.preventDefault();
    const b = e.target.querySelector('button'); b.disabled = true; b.innerHTML = 'Abrindo…';
    try {
      const buf = await (await fetch('dados.bin', { cache: 'no-cache' })).arrayBuffer();
      const chave = await derivar($('#senha').value, partes(buf).sal);
      const dados = JSON.parse(new TextDecoder().decode(await abrirBin(buf, chave)));
      CHAVE = chave;
      if ($('#lembrar').checked) localStorage.setItem(K_CHAVE, b64.de(new Uint8Array(await crypto.subtle.exportKey('raw', chave))));
      iniciar(dados);
    } catch (err) { telaBloqueio(err?.name === 'OperationError' ? 'Senha incorreta.' : 'Não foi possível abrir os dados. Verifique a conexão.'); }
  });
}
async function tentarChaveSalva() {
  const k = localStorage.getItem(K_CHAVE);
  if (!k) return false;
  try {
    CHAVE = await crypto.subtle.importKey('raw', b64.para(k), { name: 'AES-GCM' }, true, ['encrypt', 'decrypt']);
    const buf = await (await fetch('dados.bin', { cache: 'no-cache' })).arrayBuffer();
    iniciar(JSON.parse(new TextDecoder().decode(await abrirBin(buf))));
    return true;
  } catch (e) {
    if (e?.name === 'OperationError') localStorage.removeItem(K_CHAVE);
    CHAVE = null; return false;
  }
}
function iniciar(dados) {
  D = dados;
  D.lugares.forEach((l) => { l.id = slug(l.cidade + '-' + l.nome); });
  if (!D.categorias.some((c) => c.id === 'hotel')) D.categorias.unshift({ id: 'hotel', nome: 'Hotéis' });
  if (S.ui.visto === undefined) S.ui.visto = Date.now();
  salvar(true);
  document.body.style.paddingBottom = '';
  aplicarTema();
  if (location.hash.startsWith('#s=')) { importarHash(location.hash.slice(3)); history.replaceState(null, '', location.pathname + '#/gastos'); }
  render();
  recarregarArquivos().then(migrarArquivos).then(() => { if (!$('.sheet')) render(); iniciarSync(); });
  if (!S.eu) setTimeout(escolherEu, 400);
}

// ------------------------------------------------------------------ roteamento
const TABS = [
  { id: 'inicio', nome: 'Início', ic: 'home' },
  { id: 'roteiro', nome: 'Roteiro', ic: 'map' },
  { id: 'lugares', nome: 'Lugares', ic: 'compass' },
  { id: 'gastos', nome: 'Gastos', ic: 'wallet' },
  { id: 'grupo', nome: 'Grupo', ic: 'users' },
];
const ALIAS = { explorar: 'lugares', 'viagem/docs': 'grupo/arquivos', 'viagem/voos': 'roteiro/reservas', 'viagem/hoteis': 'roteiro/reservas', 'viagem/motorhome': 'roteiro/motorhome', 'viagem/checklist': 'inicio', 'viagem/info': 'ajustes', viagem: 'grupo/arquivos', 'roteiro/alternativas': 'lugares' };
function rota() {
  let h = location.hash.replace(/^#\/?/, '');
  if (ALIAS[h]) h = ALIAS[h];
  const [tab, sub] = h.split('/');
  if (tab === 'ajustes') return { tab: 'ajustes', sub: '' };
  return { tab: TABS.some((t) => t.id === tab) ? tab : 'inicio', sub: sub || '' };
}
window.addEventListener('hashchange', () => {
  if (!D) return;
  if (location.hash.startsWith('#s=')) { importarHash(location.hash.slice(3)); history.replaceState(null, '', location.pathname + '#/gastos'); }
  fecharSheet(true); render(); window.scrollTo(0, 0);
});
function render() {
  const r = rota();
  const corpo = { inicio: vInicio, roteiro: vRoteiro, lugares: vLugares, gastos: vGastos, grupo: vGrupo, ajustes: vAjustes }[r.tab](r.sub);
  const n = naoLidas();
  const fab = r.tab === 'gastos' ? `<button class="btn primary fab" data-a="novoGasto">${ic('plus')}Novo gasto</button>`
    : r.tab === 'lugares' ? `<button class="btn primary fab" data-a="novoLugar">${ic('plus')}Adicionar</button>`
      : r.tab === 'grupo' && r.sub === 'arquivos' ? `<button class="btn primary fab" data-a="anexar">${ic('up')}Anexar</button>` : '';
  $('#app').innerHTML = `<main class="wrap view">${corpo}<p class="foot">EUA 2027 · dados cifrados</p></main>${fab}
  <nav class="tabs" aria-label="Navegação principal"><div class="in">${TABS.map((t) => `<a href="#/${t.id}" ${t.id === r.tab ? 'aria-current="page"' : ''}>${ic(t.ic)}<span>${t.nome}</span>${t.id === 'grupo' ? `<span class="badge ${n ? '' : 'hidden'}" data-badge>${n > 9 ? '9+' : n}</span>` : ''}</a>`).join('')}</div></nav>`;
  depoisRender[r.tab]?.(r.sub);
}
const depoisRender = {};

// ------------------------------------------------------------------ INÍCIO
function vInicio() {
  const hoje = isoHoje();
  const dias = diasViagem();
  const embarque = '2027-04-09';
  let contador;
  if (hoje < embarque) { const n = diasEntre(hoje, embarque); contador = `<b>${n}</b><span>${n === 1 ? 'dia' : 'dias'} para o embarque</span>`; }
  else if (hoje <= D.fim) contador = `<b>Dia ${Math.max(1, diasEntre(D.inicio, hoje) + 1)}</b><span>de 17 da viagem</span>`;
  else contador = '<b>Valeu!</b><span>viagem concluída</span>';
  const diaHoje = dias.find((d) => d.data === hoje);
  const proximo = hoje < embarque ? dias[0] : dias.find((d) => d.data > hoje);
  const ck = D.checklist.filter((c) => S.sync.check[c.id]?.v).length;
  const pend = D.checklist.filter((c) => !S.sync.check[c.id]?.v).slice(0, 3);
  EVS = eventos();
  const altos = D.alertas.filter((a) => a.nivel === 'alto').length;
  return `
  <section class="hero" style="margin-top:8px"><div class="sun"></div>
    <div class="between" style="position:relative;z-index:1;align-items:flex-start">
      <div><p class="eyebrow">Abril de 2027</p><h1>${esc(D.titulo)}</h1><p class="lead">${esc(D.subtitulo)}</p></div>
      <button class="iconbtn" data-a="ajustes" aria-label="Ajustes e contatos" style="background:rgba(255,255,255,.15);border-color:rgba(255,255,255,.3);color:#fff;box-shadow:none">${S.eu ? av(S.eu, 'sm') : ic('users')}</button>
    </div>
    <div class="count">${contador}</div>
    <div class="crew">${D.pessoas.map((p) => `<button data-a="pessoa" data-id="${p.id}">${av(p.id)}<span>${esc(p.curto)}</span></button>`).join('')}</div>
  </section>

  ${diaHoje ? `<h2 class="sec">Hoje <a class="link" href="#/roteiro">Roteiro</a></h2>${cardDia(diaHoje, true)}<div id="clima"></div>` : ''}
  ${!diaHoje && proximo ? `<h2 class="sec">Próximo</h2>
    <a class="card row" href="#/roteiro" style="--c:${corFase(proximo.fase)}">
      <div class="dayhead" style="margin:0"><div class="date"><small>${semana(proximo.data)}</small><b>${proximo.data.slice(8)}</b></div></div>
      <div class="grow"><h3>${esc(proximo.titulo)}</h3><p class="small mute">${esc(proximo.itens?.[0] ? `${proximo.itens[0].hora} · ${proximo.itens[0].titulo}` : proximo.cidade || '')}</p></div>${ic('chev')}</a>` : ''}

  <h2 class="sec">Novidades do grupo <a class="link" href="#/grupo">Ver todas</a></h2>
  <div class="card" style="padding:4px 16px">${EVS.length ? EVS.slice(0, 3).map(linhaEvento).join('') : `<p class="small mute" style="padding:12px 0">Nada por aqui ainda. O que alguém lançar aparece aqui.</p>`}</div>

  <h2 class="sec">Pendências</h2>
  <div class="card">
    <div class="between"><b class="num">${ck} de ${D.checklist.length} concluídas</b><button class="link small" data-a="checklist" style="color:var(--acc-text);font-weight:700">Ver lista</button></div>
    <div class="bar" style="margin-top:8px"><i style="width:${(ck / D.checklist.length) * 100}%"></i></div>
    ${pend.map((c) => `<button class="chk" role="checkbox" aria-checked="false" data-a="check" data-id="${c.id}"><span class="box">${ic('check', 'sm')}</span><span class="txt small">${esc(c.texto)}</span></button>`).join('')}
  </div>

  <details class="card sum" style="margin-top:12px"><summary><span class="row">${ic('alert')}<span>${D.alertas.length} pontos de atenção</span>${altos ? `<span class="tag bad">${altos} importantes</span>` : ''}</span>${ic('chev', 'sm chevd')}</summary>
    <div style="margin-top:8px">${D.alertas.map((a) => `<div class="alert ${a.nivel}"><span class="dot">${ic(a.nivel === 'baixo' ? 'info' : 'alert', 'sm')}</span><div><h3>${esc(a.titulo)}</h3><p>${esc(a.texto)}</p></div></div>`).join('')}</div>
  </details>

  <div class="card" style="padding:4px 16px;margin-top:12px">
    <a class="li" href="#/roteiro/reservas"><span class="ic">${ic('ticket')}</span><div class="grow"><h3>Voos e hotéis</h3></div>${ic('chev')}</a>
    <a class="li" href="#/grupo/querem"><span class="ic">${ic('heart')}</span><div class="grow"><h3>Onde cada um quer ir</h3></div>${ic('chev')}</a>
    <a class="li" href="#/grupo/arquivos"><span class="ic">${ic('folder')}</span><div class="grow"><h3>Arquivos por pessoa</h3></div>${ic('chev')}</a>
    <a class="li" href="#/ajustes"><span class="ic">${ic('phone')}</span><div class="grow"><h3>Contatos, dicas e ajustes</h3></div>${ic('chev')}</a>
  </div>`;
}
depoisRender.inicio = async () => {
  const el = $('#clima'); if (!el) return;
  const d = diasViagem().find((x) => x.data === isoHoje()); const c = d && D.cidades.find((x) => x.id === d.cidadeId); if (!c) return;
  try {
    const r = await (await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${c.lat}&longitude=${c.lon}&daily=temperature_2m_max,temperature_2m_min,precipitation_probability_max&timezone=auto&forecast_days=1`)).json();
    el.innerHTML = `<div class="tip" style="margin-top:12px">${ic('temp', 'sm')}<span>${esc(c.nome)}: máxima de <b>${Math.round(r.daily.temperature_2m_max[0])}°</b>, mínima de <b>${Math.round(r.daily.temperature_2m_min[0])}°</b>, chuva ${r.daily.precipitation_probability_max[0] ?? 0}%.</span></div>`;
  } catch { /* sem rede */ }
};

function cardDia(d, compacto = false) {
  const pres = presentes(d.data < D.inicio ? D.inicio : d.data);
  const rv = d.rv;
  const nc = nComent('dia:' + d.data);
  const itens = (d.itens || []).map((it) => {
    const res = it.hotel && reserva(it.hotel);
    const desc = res ? `Hotel: ${res.nome}. ${it.desc || ''}` : it.desc;
    const q = res ? res.endereco || res.nome : it.q;
    return `<div class="tli"><div><div class="ic">${ic(ITIPO[it.tipo] || 'spark')}</div></div>
      <div class="bd"><span class="hr">${esc(it.hora || '')}</span><h3>${esc(it.titulo)}</h3>${desc ? `<p>${esc(desc)}</p>` : ''}${q ? `<div class="acts">${btnIr(q)}</div>` : ''}</div></div>`;
  }).join('');
  const blocoRv = rv ? `
    <div class="card" style="--c:${corFase('rv')}">
      <span class="tag acc">${ic('rv', 'sm')}${rv.milhas} milhas · ${esc(rv.horas)}</span>
      <ul class="dots">${rv.destaques.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>
      ${rv.rota?.length ? `<div class="stops">${rv.rota.map((s, i) => `<a class="stop" href="${esc(mapsIr(s))}" target="_blank" rel="noopener"><span class="n">${i + 1}</span><span class="grow">${esc(s.split(',')[0])}</span>${ic('nav', 'sm')}</a>`).join('')}</div>
      <div class="acts"><a class="btn sm primary" href="${esc(mapsRota(rv.rota))}" target="_blank" rel="noopener">${ic('map', 'sm')}Rota completa</a></div>` : ''}
      ${rv.camp ? `<div class="divider"></div><div class="row"><span class="ic" style="width:40px;height:40px;border-radius:12px;display:grid;place-items:center;background:var(--surface2)">${ic('tent')}</span><div class="grow"><p class="xs mute">Pernoite</p><h3>${esc(rv.camp.nome)}</h3></div>${btnIr(rv.camp.q)}</div>` : ''}
      ${rv.dica ? `<div class="tip">${ic('bulb', 'sm')}<span>${esc(rv.dica)}</span></div>` : ''}
    </div>` : '';
  return `
  <article class="day" id="d-${d.data}" style="--c:${corFase(d.fase)}">
    <div class="dayhead">
      <div class="date"><small>${semana(d.data)}</small><b>${d.data.slice(8)}</b></div>
      <div class="grow">
        <h3>${esc(d.titulo)}</h3>
        <div class="meta">${d.cidade ? `<span class="tag">${ic('pin', 'sm')}${esc(d.cidade)}</span>` : ''}${d.pernoite && !rv ? `<span class="tag">${ic('bed', 'sm')}${esc(d.pernoite)}</span>` : ''}</div>
        ${compacto ? '' : `<div class="row" style="margin-top:8px;gap:8px">${avs(pres, 'xs')}<span class="grow"></span><button class="mini" data-a="comentar" data-alvo="dia:${d.data}">${ic('chat')}${nc ? nc + (nc === 1 ? ' comentário' : ' comentários') : 'Comentar'}</button></div>`}
      </div>
    </div>
    ${itens ? `<div class="tl">${itens}</div>` : ''}${blocoRv}
  </article>`;
}

// ------------------------------------------------------------------ ROTEIRO (dia a dia, voos e hotéis, motorhome)
function vRoteiro(sub) {
  const aba = ['reservas', 'motorhome'].includes(sub) ? sub : 'dias';
  const s = seg('roteiro', aba, [['dias', 'Dia a dia'], ['reservas', 'Voos e hotéis'], ['motorhome', 'Motorhome']]);
  if (aba === 'reservas') return cab('Reservas', 'Voos e hotéis') + s + vReservas();
  if (aba === 'motorhome') return cab('14 a 24 de abril', 'Motorhome') + s + vMotorhome();
  const dias = diasViagem(); const hoje = isoHoje();
  const r = D.roteiros.find((x) => x.id === rotaAtual());
  return cab('09 a 26 de abril', 'Roteiro', `Motorhome: opção ${r.id}, ${esc(r.nome)}`) + s + `
  <div class="datepills"><div class="chips">${dias.map((d) => `<button class="dp ${d.data === hoje ? 'today' : ''}" style="--c:${corFase(d.fase)}" data-a="irDia" data-id="${d.data}"><small>${semana(d.data)}</small><b>${d.data.slice(8)}</b></button>`).join('')}</div></div>
  ${dias.map((d) => cardDia(d)).join('')}`;
}
depoisRender.roteiro = (sub) => {
  if (sub && sub !== 'dias') return;
  const el = document.getElementById('d-' + isoHoje());
  if (el && !S.ui.rolouHoje) { S.ui.rolouHoje = true; setTimeout(() => el.scrollIntoView({ block: 'start' }), 100); }
};

const todosVoos = () => [...D.voos, ...Object.values(S.sync.voos).filter((v) => v && !v.del).map((v) => ({ ...v, manual: true }))];
function vReservas() {
  const voos = todosVoos();
  const blocoVoos = D.pessoas.map((p) => {
    const vs = voos.filter((v) => v.pessoas.includes(p.id)).sort((a, b) => a.saida.localeCompare(b.saida));
    return `<div class="person">${av(p.id)}<h2 class="grow">${esc(p.curto)}</h2></div>
    <div class="card" style="padding:4px 16px">${vs.length ? vs.map((v) => `<button class="fl" data-a="verVoo" data-id="${v.id}"><span class="ic">${ic('plane')}</span><span class="grow"><b style="display:block">${esc(v.numero)} · ${esc(v.de)} → ${esc(v.para)}</b><span class="xs mute">${v.grupo === 'ida' ? 'Ida' : 'Volta'} · ${semana(v.saida)}, ${ddmm(v.saida)} · ${hora(v.saida)}${v.chegada ? ' → ' + hora(v.chegada) : ''}</span></span>${ic('chev', 'sm')}</button>`).join('') : '<p class="small mute" style="padding:12px 0">Nenhum voo cadastrado.</p>'}</div>`;
  }).join('');
  const blocoHoteis = D.hoteis.map((h) => {
    const r = reserva(h.id);
    const comp = anexos().filter((a) => a.kind === 'hotel' && a.ref === h.id);
    const noites = diasEntre(h.checkin, h.checkout);
    return `<article class="card">
      <div class="between"><div><p class="eyebrow">${semana(h.checkin)} ${ddmm(h.checkin)} → ${semana(h.checkout)} ${ddmm(h.checkout)} · ${noites} ${noites === 1 ? 'noite' : 'noites'}</p><h3 style="font-size:18px">${esc(h.titulo)}</h3></div>${r ? `<span class="tag ok">${ic('check', 'sm')}Reservado</span>` : `<span class="tag warn">A reservar</span>`}</div>
      ${r ? `<p style="margin-top:8px;font-weight:700">${esc(r.nome)}</p>${r.codigo ? `<button class="tag acc" style="margin-top:6px" data-a="copiar" data-v="${esc(r.codigo)}">${ic('copy', 'sm')}${esc(r.codigo)}</button>` : ''}${r.obs ? `<p class="small mute">${esc(r.obs)}</p>` : ''}<p class="xs mute" style="margin-top:4px">Registrado por ${esc(nome(r.por))}</p>` : ''}
      <div class="acts">${r ? btnIr(r.endereco || r.nome) : ''}<button class="btn sm ${r ? '' : 'primary'}" data-a="reservaHotel" data-id="${h.id}">${r ? ic('edit', 'sm') + 'Editar' : ic('check', 'sm') + 'Registrar reserva'}</button><button class="btn sm" data-a="anexar" data-kind="hotel" data-ref="${h.id}">${ic('up', 'sm')}Comprovante</button></div>
      ${comp.length ? `<div style="margin-top:8px">${comp.map(linhaArq).join('')}</div>` : ''}
      <details class="sum" style="margin-top:8px"><summary class="small mute">Sugestões com preço (${h.sugestoes.length})${ic('chev', 'sm chevd')}</summary>
        ${h.sugestoes.map((s) => `<a class="fl" href="${esc(s.url)}" target="_blank" rel="noopener"><span class="grow"><b style="display:block;font-size:14px">${esc(s.nome)}</b><span class="xs mute">${s.nota.toFixed(1).replace('.', ',')} · ${esc(s.destaque)}</span></span><span class="small num" style="font-weight:700">${esc(s.preco)}</span>${ic('ext', 'sm')}</a>`).join('')}
        <p class="xs mute">${esc(h.nota)}</p></details>
    </article>`;
  }).join('');
  return `<h2 class="sec" style="margin-top:8px">Voos <button class="link small" data-a="novoVoo" style="color:var(--acc-text);font-weight:700">${ic('plus', 'sm')} Cadastrar</button></h2>${blocoVoos}
  <h2 class="sec">Hotéis</h2><div class="stack">${blocoHoteis}</div>`;
}
function cardVoo(v) {
  return `<article class="flight">
    <div class="fh"><span>${esc(v.cia)} · ${esc(v.numero)}</span><span class="num">${semana(v.saida)}, ${ddmm(v.saida)}</span></div>
    <div class="fb">
      <div><div class="iata">${esc(v.de)}</div><div class="t">${hora(v.saida)}</div><div class="c">${esc(v.deCidade || '')}</div></div>
      <div class="mid">${ic('plane')}<span class="xs">${v.chegada && v.chegada.slice(0, 10) !== v.saida.slice(0, 10) ? 'chega ' + ddmm(v.chegada) : ''}</span></div>
      <div style="text-align:right"><div class="iata">${esc(v.para)}</div><div class="t">${v.chegada ? hora(v.chegada) : ''}</div><div class="c">${esc(v.paraCidade || '')}</div></div>
    </div>
    <div class="perf"></div>
    <div class="ff" style="padding-top:12px">
      <div class="between"><span>${avs(v.pessoas || [], 'xs')}</span>${v.localizador ? `<button class="tag acc" data-a="copiar" data-v="${esc(String(v.localizador).split(' ')[0])}">${ic('copy', 'sm')}${esc(v.localizador)}</button>` : ''}</div>
      ${v.obs ? `<p style="margin-top:8px">${esc(v.obs)}</p>` : ''}
      ${v.manual ? `<p class="xs mute" style="margin-top:6px">Cadastrado por ${esc(nome(v.por))}</p>` : ''}
      <div class="acts">${v.doc ? `<button class="btn sm" data-a="abrirDoc" data-id="${v.doc}">${ic('ticket', 'sm')}Bilhete</button>` : ''}${v.manual ? `<button class="btn sm" data-a="editarVoo" data-id="${v.id}">${ic('edit', 'sm')}Editar</button><button class="btn sm danger" data-a="apagarVoo" data-id="${v.id}">${ic('trash', 'sm')}Remover</button>` : ''}</div>
    </div></article>`;
}

function vMotorhome() {
  const m = D.motorhome; const atual = rotaAtual();
  const ponto = (t, x) => `<div class="fl"><span class="ic">${ic(t === 'Retirada' ? 'up' : 'down')}</span><span class="grow"><b style="display:block">${t}: ${semana(x.data)}, ${ddmm(x.data)}</b><span class="xs mute">${esc(x.janela)} · Henderson</span></span><a class="iconbtn" href="tel:${x.tel.replace(/[^+\d]/g, '')}" aria-label="Ligar">${ic('phone')}</a><a class="iconbtn" href="${esc(mapsIr(x.endereco))}" target="_blank" rel="noopener" aria-label="Rota">${ic('nav')}</a></div>`;
  const det = (t, html) => `<details class="sum" style="border-top:1px solid var(--line)"><summary>${t}${ic('chev', 'sm chevd')}</summary><div style="padding-bottom:12px">${html}</div></details>`;
  const lista = (l) => `<ul class="dots">${l.map((s) => `<li>${esc(s)}</li>`).join('')}</ul>`;
  return `
  <article class="card"><div class="row">${ic('rv', 'lg')}<div class="grow"><h3>${esc(m.locadora)} · C30</h3><p class="xs mute">${esc(m.intermediaria)} · ${esc(m.viajantes)}</p></div></div>
    ${ponto('Retirada', m.retirada)}${ponto('Devolução', m.devolucao)}
    <div class="acts"><button class="btn sm" data-a="abrirDoc" data-id="contrato-motorhome">${ic('file', 'sm')}Contrato</button><button class="btn sm" data-a="abrirDoc" data-id="roteiro-canions">${ic('map', 'sm')}Guia da rota</button><a class="btn sm" href="https://wa.me/554126264040" target="_blank" rel="noopener">${ic('wa', 'sm')}Assistência</a></div>
  </article>
  <h2 class="sec">Qual roteiro fazer</h2>
  <div class="stack">${D.roteiros.map((r) => `<article class="card" style="${r.id === atual ? 'border-color:var(--acc);box-shadow:0 0 0 1px var(--acc)' : ''}">
    <div class="between"><span class="tag acc">Opção ${r.id} · ${esc(r.selo)}</span><span class="xs mute num">${esc(r.milhas)}</span></div>
    <h3 style="margin-top:8px">${esc(r.nome)}</h3><p class="small mute clamp">${esc(r.resumo)}</p>
    <details class="sum"><summary class="small mute">Ver os ${r.dias.length} dias${ic('chev', 'sm chevd')}</summary>${r.dias.map((d) => `<div class="li" style="min-height:40px;padding:6px 0"><span class="num small" style="width:56px;font-weight:800;color:var(--acc-text)">${ddmm(d.data)}</span><span class="grow small">${esc(d.titulo)}</span><span class="xs mute num">${d.milhas} mi</span></div>`).join('')}</details>
    ${r.id === atual ? `<span class="btn sm soft" style="margin-top:4px">${ic('check', 'sm')}Escolhido${S.sync.conf.rota?.por ? ' por ' + esc(nome(S.sync.conf.rota.por)) : ''}</span>` : `<button class="btn sm primary" data-a="usarRota" data-id="${r.id}" style="margin-top:4px">Usar este</button>`}
  </article>`).join('')}</div>
  <h2 class="sec">Contrato e regras</h2>
  <div class="card" style="padding:0 16px">
    ${det('Valores', m.valores.map(([k, v]) => `<div class="between small" style="padding:6px 0"><span>${esc(k)}</span><b class="num">${esc(v)}</b></div>`).join(''))}
    ${det('O que levar na retirada', lista(m.levar))}${det('Antes de devolver', lista(m.devolver))}${det('Incluso na reserva', lista(m.servicos))}
    ${det('Combustível', `<p class="small mute">${esc(m.combustivel)}</p>`)}${det('Assistência', `<p class="small mute">${esc(m.assistencia)}</p>`)}${det('Cancelamento', `<p class="small mute">${esc(m.cancelamento)}</p>`)}
  </div>`;
}

// ------------------------------------------------------------------ LUGARES
const F = { cidade: 'todas', cat: 'todas', q: '' };
const nomeCat = (c) => D.categorias.find((x) => x.id === c)?.nome || TIPOS_LUGAR.find((t) => t[0] === c)?.[1] || '';
function filtrarLugares() {
  const q = slug(F.q).replace(/-/g, ' ');
  let l = lugares().filter((x) => (F.cidade === 'todas' || x.cidade === F.cidade) && (!q || slug(`${x.nome} ${x.desc || ''} ${x.dica || ''} ${x.cat}`).replace(/-/g, ' ').includes(q)));
  if (F.cat === 'fav') l = l.filter((x) => votosDe(x.id).length).sort((a, b) => votosDe(b.id).length - votosDe(a.id).length);
  else if (F.cat === 'grupo') l = l.filter((x) => x.custom);
  else if (F.cat !== 'todas') l = l.filter((x) => x.cat === F.cat);
  return l;
}
function cardLugar(x) {
  const v = votosDe(x.id); const meu = S.eu && v.includes(S.eu); const nc = nComent(x.id);
  const cid = D.cidades.find((c) => c.id === x.cidade)?.nome || '';
  return `<article class="card place">
    <button class="top" data-a="lugar" data-id="${esc(x.id)}" style="width:100%;text-align:left"><span class="ic">${ic(ICAT[x.cat] || 'pin')}</span>
      <span class="grow"><h3>${esc(x.nome)}</h3><span class="meta"><span class="tag">${esc(nomeCat(x.cat))}</span>${F.cidade === 'todas' && cid ? `<span class="tag">${esc(cid)}</span>` : ''}${x.custom ? `<span class="tag acc">por ${esc(nome(x.por))}</span>` : ''}${x.preco ? `<span class="tag num">${esc(x.preco)}</span>` : ''}${flames(x.energia)}</span>
      ${x.desc ? `<p class="clamp">${esc(x.desc)}</p>` : ''}</span></button>
    <div class="acts" style="align-items:center">${x.q ? btnGoogle(x.q) : ''}<button class="mini vote" aria-pressed="${!!meu}" data-a="votar" data-id="${esc(x.id)}">${ic('heart')}Quero ir</button><button class="mini" data-a="lugar" data-id="${esc(x.id)}" aria-label="Comentários">${ic('chat')}${nc || ''}</button>${v.length ? avs(v, 'xs') : ''}</div>
  </article>`;
}
function vLugares() {
  const cidades = [{ id: 'todas', nome: 'Todas as cidades' }, ...D.cidades];
  const cats = [['todas', 'Tudo'], ['fav', 'Favoritos'], ['grupo', 'Do grupo'], ...D.categorias.map((c) => [c.id, c.nome]), ['ideias', 'Ideias de roteiro']];
  return cab(`${lugares().length} lugares`, 'Lugares', '“Ver no Google” abre fotos, avaliações e horários. Adicione o que quiser e comente.') + `
  <label class="search">${ic('search')}<span class="sr">Buscar</span><input id="busca" type="search" placeholder="Buscar: rooftop, pizza, trilha…" value="${esc(F.q)}" autocomplete="off"></label>
  <div class="chips" style="margin-top:12px">${cats.map(([id, n]) => `<button class="chip" aria-pressed="${F.cat === id}" data-a="fCat" data-id="${id}">${id === 'fav' ? ic('heart', 'sm') : id === 'grupo' ? ic('users', 'sm') : ICAT[id] ? ic(ICAT[id], 'sm') : ''}${esc(n)}</button>`).join('')}</div>
  ${F.cat === 'ideias' ? '' : `<div class="chips" style="margin-top:4px">${cidades.map((c) => `<button class="chip" aria-pressed="${F.cidade === c.id}" data-a="fCidade" data-id="${c.id}">${esc(c.nome)}</button>`).join('')}</div>`}
  <div id="lista" class="stack" style="margin-top:16px">${F.cat === 'ideias' ? vIdeias() : listaLugares()}</div>`;
}
function listaLugares() {
  const l = filtrarLugares();
  if (!l.length) return `<div class="empty">${ic('compass')}<p>${F.cat === 'fav' ? 'Marquem “Quero ir” para montar a lista do grupo. A lista por pessoa fica em Grupo › Quero ir.' : F.cat === 'grupo' ? 'Nenhum lugar adicionado ainda. Toque em “Adicionar”.' : 'Nada com esses filtros.'}</p></div>`;
  return l.map(cardLugar).join('');
}
function vIdeias() {
  const nomes = { la: 'Los Angeles', estrada: 'Estrada LA → Vegas', lv: 'Las Vegas' };
  return D.alternativas.map((a) => `<article class="card"><span class="tag">${nomes[a.fase]}</span><h3 style="margin-top:6px">${esc(a.titulo)}</h3><p class="small mute">${esc(a.resumo)}</p>
    <div class="stops">${a.itens.map(([n, q], i) => `<a class="stop" style="--c:var(--acc)" href="${esc(mapsVer(q))}" target="_blank" rel="noopener" aria-label="${esc(n)}: ver no Google"><span class="n">${i + 1}</span><span class="grow">${esc(n)}</span>${ic('star', 'sm')}</a>`).join('')}</div></article>`).join('')
    + `<h2 class="sec">Eventos para checar</h2>` + D.eventos.map((e) => `<a class="card row" href="${esc(e.link)}" target="_blank" rel="noopener"><span class="ic" style="width:40px;height:40px;border-radius:12px;display:grid;place-items:center;background:var(--acc-soft);color:var(--acc-text)">${ic('ticket')}</span><span class="grow"><h3>${esc(e.titulo)}</h3><span class="small mute">${esc(e.quando)}</span></span>${ic('ext', 'sm')}</a>`).join('');
}
depoisRender.lugares = () => {
  const i = $('#busca');
  i?.addEventListener('input', () => { F.q = i.value; clearTimeout(i.t); i.t = setTimeout(() => { if (F.cat !== 'ideias') $('#lista').innerHTML = listaLugares(); }, 150); });
};
function detalheLugar(id) {
  const x = lugarPorId(id); if (!x) return;
  const v = votosDe(x.id); const meu = S.eu && v.includes(S.eu);
  abrirSheet(x.nome, `
    <div class="meta">${x.cat ? `<span class="tag">${ic(ICAT[x.cat] || 'pin', 'sm')}${esc(nomeCat(x.cat))}</span>` : ''}<span class="tag">${esc(D.cidades.find((c) => c.id === x.cidade)?.nome || '')}</span>${x.preco ? `<span class="tag">${esc(x.preco)}</span>` : ''}${flames(x.energia)}</div>
    ${x.desc ? `<p style="margin-top:12px;color:var(--ink2)">${esc(x.desc)}</p>` : ''}
    ${x.dica ? `<div class="tip">${ic('bulb', 'sm')}<span>${esc(x.dica)}</span></div>` : ''}
    ${x.custom ? `<p class="xs mute" style="margin-top:8px">Adicionado por ${esc(nome(x.por))} ${quando(x.criado)}</p>` : ''}
    <div class="acts">${x.q ? btnGoogle(x.q) : ''}${x.link ? `<a class="btn sm" href="${esc(x.link)}" target="_blank" rel="noopener">${ic('ext', 'sm')}Site</a>` : ''}<button class="btn sm vote" aria-pressed="${!!meu}" data-a="votar" data-id="${esc(x.id)}">${ic('heart', 'sm')}Quero ir</button>${x.custom ? `<button class="btn sm" data-a="editarLugar" data-id="${esc(x.id)}">${ic('edit', 'sm')}Editar</button>` : ''}</div>
    ${v.length ? `<div class="row" style="margin-top:12px;gap:8px">${avs(v, 'xs')}<span class="xs mute">${esc(v.map(nome).join(', '))} ${v.length === 1 ? 'quer' : 'querem'} ir</span></div>` : ''}
    <h3 style="margin-top:24px">Comentários</h3>${blocoComentarios(x.id)}`, montarComentarios);
}
function formLugar(id) {
  const reg = id ? S.sync.conf[id] : null; const x = reg?.v || {};
  const dHoje = diasViagem().find((d) => d.data === isoHoje());
  const cidade = x.cidade || (F.cidade !== 'todas' ? F.cidade : dHoje?.cidadeId || 'lv');
  const cat = x.cat || (TIPOS_LUGAR.some((t) => t[0] === F.cat) ? F.cat : 'comer');
  abrirSheet(id ? 'Editar lugar' : 'Adicionar lugar', `<form id="fl">
    <label class="f"><span>Nome</span><input class="inp" name="nome" required maxlength="80" value="${esc(x.nome || '')}" placeholder="Ex.: Pizzaria do Joe"></label>
    <div class="f" style="margin-top:14px"><span class="xs mute" style="font-weight:700;display:block;margin-bottom:6px">Tipo</span><div class="pick" data-g="cat">${TIPOS_LUGAR.map(([k, n]) => `<button type="button" class="noav" aria-pressed="${cat === k}" data-id="${k}">${ic(ICAT[k], 'sm')}${n}</button>`).join('')}</div></div>
    <div class="f" style="margin-top:14px"><span class="xs mute" style="font-weight:700;display:block;margin-bottom:6px">Cidade</span><div class="pick" data-g="cidade">${D.cidades.filter((c) => c.id !== 'estrada').map((c) => `<button type="button" class="noav" aria-pressed="${cidade === c.id}" data-id="${c.id}">${esc(c.nome)}</button>`).join('')}</div></div>
    <label class="f"><span>Endereço ou link do Google (opcional)</span><input class="inp" name="q" value="${esc(x.q || '')}" placeholder="Se deixar vazio, o Google busca pelo nome"></label>
    <label class="f"><span>Por que vale a pena (opcional)</span><textarea class="inp" name="desc" maxlength="400">${esc(x.desc || '')}</textarea></label>
    <label class="f"><span>Site ou link de reserva (opcional)</span><input class="inp" name="link" type="url" value="${esc(x.link || '')}" placeholder="https://"></label>
    <button class="btn primary block" style="margin-top:16px">${ic('check')}${id ? 'Salvar' : 'Adicionar para o grupo'}</button>
    ${id ? `<button type="button" class="btn danger block" style="margin-top:8px" data-a="apagarLugar" data-id="${esc(id)}">${ic('trash')}Remover</button>` : ''}</form>`, (sh) => {
    sh.querySelectorAll('.pick').forEach((g) => g.addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) g.querySelectorAll('button').forEach((y) => y.setAttribute('aria-pressed', y === b)); }));
    sh.querySelector('#fl').addEventListener('submit', (e) => {
      e.preventDefault(); const f = new FormData(e.target);
      const k = id || 'l:' + uid();
      const v = { nome: String(f.get('nome')).trim(), cat: sh.querySelector('[data-g="cat"] [aria-pressed="true"]')?.dataset.id || 'outro', cidade: sh.querySelector('[data-g="cidade"] [aria-pressed="true"]')?.dataset.id || 'lv', desc: String(f.get('desc') || '').trim(), link: String(f.get('link') || '').trim() };
      v.q = String(f.get('q') || '').trim() || `${v.nome}, ${D.cidades.find((c) => c.id === v.cidade)?.nome || ''}`;
      S.sync.conf[k] = { v, ts: Date.now(), por: reg?.por || S.eu || '', criado: reg?.criado || Date.now() };
      salvar(); fecharSheet(); F.cat = 'grupo'; F.cidade = 'todas'; render(); toast(id ? 'Lugar atualizado.' : 'Lugar adicionado para o grupo.' + aviso());
    });
  });
}

// ------------------------------------------------------------------ comentários
function listaComentarios(alvo) {
  const cs = comentarios(alvo);
  if (!cs.length) return '<p class="small mute">Nenhum comentário ainda. Comece a conversa.</p>';
  return cs.map((c) => `<div class="msg ${c.por === S.eu ? 'eu' : ''}">${av(c.por, 'sm')}<div class="bub"><small>${esc(nome(c.por))} · ${quando(c.ts)}${c.por === S.eu ? ` · <button data-a="apagarComent" data-id="${esc(c.id)}" style="color:var(--bad);font-size:11px">apagar</button>` : ''}</small><p>${esc(c.v.texto)}</p></div></div>`).join('');
}
const blocoComentarios = (alvo) => `<div class="thread" data-thread="${esc(alvo)}">${listaComentarios(alvo)}</div>
  <form class="sendbar" data-coment="${esc(alvo)}"><label class="sr" for="ctx">Comentário</label><textarea class="inp" id="ctx" name="t" rows="1" maxlength="1000" placeholder="Escreva um comentário…" required></textarea><button class="btn primary" aria-label="Enviar">${ic('send')}</button></form>`;
function montarComentarios(sh) {
  const f = sh.querySelector('[data-coment]'); if (!f) return;
  const ta = f.querySelector('textarea');
  ta.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); f.requestSubmit(); } });
  f.addEventListener('submit', (e) => {
    e.preventDefault();
    if (!S.eu) return escolherEu();
    const texto = ta.value.trim(); if (!texto) return;
    S.sync.conf['c:' + uid()] = { v: { alvo: f.dataset.coment, texto }, ts: Date.now(), por: S.eu };
    salvar(); ta.value = '';
    const th = sh.querySelector('[data-thread]'); th.innerHTML = listaComentarios(f.dataset.coment);
    th.lastElementChild?.scrollIntoView({ block: 'nearest' });
    SYNC.pend = true;
    navigator.vibrate?.(10);
  });
}

// ------------------------------------------------------------------ GASTOS
const marcoZero = () => Math.max(Date.parse(D.gastosZeradosEm || '') || 0, conf('gastosDesde', 0));
const gastosAtivos = () => Object.values(S.sync.gastos).filter((g) => g && !g.del && (g.ts || 0) >= marcoZero()).sort((a, b) => (b.data || '').localeCompare(a.data || '') || (b.ts || 0) - (a.ts || 0));
const emUSD = (g) => (g.moeda === 'BRL' ? g.valor / (g.cambio || S.cambio) : g.valor);
function saldos() {
  const s = Object.fromEntries(D.pessoas.map((p) => [p.id, { pagou: 0, deve: 0 }]));
  for (const g of gastosAtivos()) {
    const v = emUSD(g);
    if (s[g.pagou]) s[g.pagou].pagou += v;
    const pesos = Object.entries(g.pesos || {}).filter(([id, w]) => s[id] && w > 0);
    const tot = pesos.reduce((a, [, w]) => a + w, 0);
    for (const [id, w] of pesos) s[id].deve += (v * w) / tot;
  }
  for (const k in s) s[k].saldo = s[k].pagou - s[k].deve;
  return s;
}
function acertos(s) {
  const cred = Object.entries(s).filter(([, x]) => x.saldo > 0.005).map(([id, x]) => ({ id, v: x.saldo })).sort((a, b) => b.v - a.v);
  const deb = Object.entries(s).filter(([, x]) => x.saldo < -0.005).map(([id, x]) => ({ id, v: -x.saldo })).sort((a, b) => b.v - a.v);
  const out = []; let i = 0, j = 0;
  while (i < deb.length && j < cred.length) {
    const v = Math.min(deb[i].v, cred[j].v);
    if (v > 0.005) out.push({ de: deb[i].id, para: cred[j].id, v });
    deb[i].v -= v; cred[j].v -= v;
    if (deb[i].v < 0.005) i++;
    if (cred[j].v < 0.005) j++;
  }
  return out;
}
function vGastos() {
  const gs = gastosAtivos(); const s = saldos();
  const total = gs.reduce((a, g) => a + emUSD(g), 0);
  const eu = S.eu && s[S.eu]; const ac = acertos(s);
  const porData = {}; for (const g of gs) (porData[g.data || 'sem data'] ||= []).push(g);
  return cab('Divisão de despesas', 'Gastos', `US$ 1 = <button data-a="cambio" style="color:var(--acc-text);font-weight:700">${brl(S.cambio)}</button>`) + `
  <div class="kpis">
    <div class="kpi"><span class="xs">Total do grupo</span><b>${usd(total)}</b><span class="small mute num">${brl(total * S.cambio)}</span></div>
    <div class="kpi"><span class="xs">${eu ? 'Seu saldo' : 'Quem é você?'}</span>${eu ? `<b class="${eu.saldo >= -0.005 ? 'amt pos' : 'amt neg'}" style="text-align:left">${eu.saldo >= -0.005 ? '+' : '−'}${usd(Math.abs(eu.saldo))}</b><span class="small mute">${eu.saldo >= -0.005 ? 'a receber' : 'a pagar'}</span>` : `<button class="btn sm soft" data-a="escolherEu" style="margin-top:6px">Escolher</button>`}</div>
  </div>
  <div class="between" style="margin-top:12px"><div class="syncpill">${pillSync()}</div><button class="mini" data-a="ferramentas">${ic('dice')}Ferramentas</button></div>
  ${!autoSync() && SYNC.status !== 'conectando' ? `<div class="btnrow"><button class="btn sm" data-a="sincronizar">${ic('share', 'sm')}Enviar ao grupo</button><button class="btn sm" data-a="importar">${ic('sync', 'sm')}Importar</button></div>` : ''}

  ${ac.length ? `<h2 class="sec">Quem paga quem <button class="link small" data-a="pix" style="color:var(--acc-text);font-weight:700">Chaves Pix</button></h2>
  <div class="card">${ac.map((a) => { const pix = S.sync.pix[a.para]?.v; return `<div class="bal">${av(a.de, 'sm')}${ic('chev', 'sm')}${av(a.para, 'sm')}<div class="grow"><p class="small"><b>${esc(nome(a.de))}</b> paga <b>${esc(nome(a.para))}</b></p>${pix ? `<button class="xs" data-a="copiar" data-v="${esc(pix)}" style="color:var(--acc-text);font-weight:700">Pix: ${esc(pix)}</button>` : ''}</div><div><div class="amt">${usd(a.v)}</div><button class="xs mute num" data-a="copiar" data-v="${(a.v * S.cambio).toFixed(2).replace('.', ',')}" style="display:block;text-align:right">${brl(a.v * S.cambio)}</button></div></div>`; }).join('')}</div>` : ''}

  <h2 class="sec">Saldos</h2>
  <div class="card">${D.pessoas.map((p) => { const x = s[p.id]; return `<div class="bal">${av(p.id)}<div class="grow"><h3>${esc(p.curto)}</h3><p class="xs mute num">pagou ${usd(x.pagou)} · parte ${usd(x.deve)}</p></div><div class="amt ${x.saldo >= 0.005 ? 'pos' : x.saldo <= -0.005 ? 'neg' : ''}">${x.saldo >= 0.005 ? '+' : x.saldo <= -0.005 ? '−' : ''}${usd(Math.abs(x.saldo))}</div></div>`; }).join('')}</div>

  <h2 class="sec">Lançamentos <span class="small mute num">${gs.length}</span></h2>
  ${gs.length ? Object.entries(porData).map(([data, l]) => `<p class="feedday">${data === 'sem data' ? data : `${semana(data)}, ${ddmm(data)}`}</p><div class="card" style="padding:4px 16px">${l.map((g) => { const c = CATG.find((x) => x.id === g.cat) || CATG[8]; const parts = Object.keys(g.pesos || {}).filter((k) => g.pesos[k] > 0); return `<button class="exp" data-a="editarGasto" data-id="${g.id}"><span class="ic">${ic(c.ic)}</span><div class="grow"><h3 style="font-size:15px">${esc(g.desc)}</h3><p class="xs mute">${esc(nome(g.pagou))} pagou · ${parts.length === D.pessoas.length ? 'todos' : esc(parts.map(nome).join(', '))}${g.por && g.por !== g.pagou ? ` · lançado por ${esc(nome(g.por))}` : ''}</p></div><div><div class="amt">${g.moeda === 'BRL' ? brl(g.valor) : usd(g.valor)}</div>${g.moeda === 'BRL' ? `<div class="xs mute num" style="text-align:right">${usd(emUSD(g))}</div>` : ''}</div></button>`; }).join('')}</div>`).join('') : `<div class="card empty">${ic('wallet')}<p>Nenhum gasto ainda. Toque em “Novo gasto”.</p></div>`}`;
}
function formGasto(g) {
  const novo = !g;
  const hoje = isoHoje();
  const data = g?.data || (hoje >= D.inicio && hoje <= D.fim ? hoje : D.inicio);
  g ||= { id: uid(), desc: '', valor: '', moeda: 'USD', pagou: S.eu || 'vinicius', cat: 'comida', data, pesos: Object.fromEntries(presentes(data).map((i) => [i, 1])) };
  const sh = abrirSheet(novo ? 'Novo gasto' : 'Editar gasto', `
    <form id="fg">
      <label class="f"><span>Descrição</span><input class="inp" name="desc" required maxlength="80" value="${esc(g.desc)}" placeholder="Ex.: jantar no Hell’s Kitchen"></label>
      <div class="row" style="align-items:flex-end">
        <label class="f grow"><span>Valor</span><input class="inp num" name="valor" inputmode="decimal" required value="${g.valor === '' ? '' : String(g.valor).replace('.', ',')}" placeholder="0,00"></label>
        <div class="seg" style="margin:0 0 4px;width:132px" role="radiogroup" aria-label="Moeda">${['USD', 'BRL'].map((m) => `<button type="button" role="radio" aria-selected="${g.moeda === m}" data-m="${m}">${m === 'USD' ? 'US$' : 'R$'}</button>`).join('')}</div>
      </div>
      <div class="f" style="margin-top:14px"><span class="xs mute" style="font-weight:700;display:block;margin-bottom:6px">Quem pagou</span><div class="pick" data-g="pagou">${D.pessoas.map((p) => `<button type="button" aria-pressed="${g.pagou === p.id}" data-id="${p.id}">${av(p.id, 'sm')}${esc(p.curto)}</button>`).join('')}</div></div>
      <div class="f" style="margin-top:14px"><span class="xs mute" style="font-weight:700;display:block;margin-bottom:6px">Dividir entre</span><div class="pick" data-g="pesos">${D.pessoas.map((p) => `<button type="button" aria-pressed="${(g.pesos?.[p.id] || 0) > 0}" data-id="${p.id}">${av(p.id, 'sm')}${esc(p.curto)}</button>`).join('')}</div></div>
      <details class="sum" style="margin-top:8px"><summary class="small" style="color:var(--acc-text)">Mais opções${ic('chev', 'sm chevd')}</summary>
        <label class="f"><span>Data</span><input class="inp" type="date" name="data" value="${esc(g.data)}"></label>
        <div class="f" style="margin-top:14px"><span class="xs mute" style="font-weight:700;display:block;margin-bottom:6px">Categoria</span><div class="pick" data-g="cat">${CATG.map((c) => `<button type="button" class="noav" aria-pressed="${g.cat === c.id}" data-id="${c.id}">${ic(c.ic, 'sm')}${c.nome}</button>`).join('')}</div></div>
        <div class="f" style="margin-top:14px"><span class="xs mute" style="font-weight:700;display:block;margin-bottom:6px">Pesos diferentes (ex.: 0,7 para quem ficou menos noites)</span><div class="row" style="flex-wrap:wrap">${D.pessoas.map((p) => `<label class="small" style="display:flex;align-items:center;gap:6px">${esc(p.curto)}<input class="inp num" style="width:72px;min-height:40px" inputmode="decimal" data-peso="${p.id}" value="${String(g.pesos?.[p.id] ?? 0).replace('.', ',')}"></label>`).join('')}</div></div>
        <label class="f"><span>Observação</span><input class="inp" name="nota" maxlength="140" value="${esc(g.nota || '')}"></label>
      </details>
      <p class="err small" style="color:var(--bad);min-height:21px;margin-top:8px" role="alert"></p>
      <button class="btn primary block" type="submit">${ic('check')}${novo ? 'Lançar' : 'Salvar'}</button>
      ${novo ? '' : `<p class="xs mute" style="margin-top:8px;text-align:center">Lançado por ${esc(nome(g.por))}${g.criado ? ' ' + quando(g.criado) : ''}</p><button class="btn danger block" type="button" data-a="apagarGasto" data-id="${g.id}" style="margin-top:8px">${ic('trash')}Apagar</button>`}
    </form>`);
  let moeda = g.moeda; const pes = { ...(g.pesos || {}) };
  sh.querySelectorAll('[data-m]').forEach((b) => b.addEventListener('click', () => { moeda = b.dataset.m; sh.querySelectorAll('[data-m]').forEach((x) => x.setAttribute('aria-selected', x === b)); }));
  sh.querySelectorAll('.pick').forEach((grp) => grp.addEventListener('click', (e) => {
    const b = e.target.closest('button'); if (!b) return;
    if (grp.dataset.g === 'pesos') { const on = b.getAttribute('aria-pressed') !== 'true'; b.setAttribute('aria-pressed', on); pes[b.dataset.id] = on ? 1 : 0; const inp = sh.querySelector(`[data-peso="${b.dataset.id}"]`); if (inp) inp.value = on ? '1' : '0'; }
    else grp.querySelectorAll('button').forEach((x) => x.setAttribute('aria-pressed', x === b));
  }));
  sh.querySelectorAll('[data-peso]').forEach((i) => i.addEventListener('change', () => { pes[i.dataset.peso] = numero(i.value); sh.querySelector(`[data-g="pesos"] [data-id="${i.dataset.peso}"]`).setAttribute('aria-pressed', pes[i.dataset.peso] > 0); }));
  sh.querySelector('input[name="data"]').addEventListener('change', (e) => {
    if (!novo) return;
    const pr = presentes(e.target.value);
    D.pessoas.forEach((p) => { pes[p.id] = pr.includes(p.id) ? 1 : 0; sh.querySelector(`[data-g="pesos"] [data-id="${p.id}"]`).setAttribute('aria-pressed', pes[p.id] > 0); const inp = sh.querySelector(`[data-peso="${p.id}"]`); if (inp) inp.value = String(pes[p.id]); });
  });
  sh.querySelector('#fg').addEventListener('submit', (e) => {
    e.preventDefault();
    const f = new FormData(e.target); const valor = numero(f.get('valor')); const err = sh.querySelector('.err');
    if (!(valor > 0)) { err.textContent = 'Informe um valor maior que zero.'; sh.querySelector('[name="valor"]').focus(); return; }
    if (!Object.values(pes).some((w) => w > 0)) { err.textContent = 'Escolha pelo menos uma pessoa para dividir.'; return; }
    S.sync.gastos[g.id] = { ...g, desc: String(f.get('desc')).trim(), valor, moeda, data: f.get('data'), pagou: sh.querySelector('[data-g="pagou"] [aria-pressed="true"]')?.dataset.id, cat: sh.querySelector('[data-g="cat"] [aria-pressed="true"]')?.dataset.id || 'outros', pesos: pes, nota: String(f.get('nota') || '').trim(), cambio: moeda === 'BRL' ? (g.cambio || S.cambio) : undefined, ts: Date.now(), por: novo ? S.eu || '' : g.por || S.eu || '', criado: g.criado || Date.now() };
    salvar(); fecharSheet(); render(); toast((novo ? 'Gasto lançado.' : 'Gasto atualizado.') + (novo ? aviso() : '')); navigator.vibrate?.(15);
  });
}
async function linkSync() {
  const z = await comprimir(new TextEncoder().encode(JSON.stringify({ v: 1, de: S.eu || '', em: Date.now(), col: S.sync })));
  return `${location.origin}${location.pathname}#s=${b64.url(await lacrar(z))}`;
}
async function importarHash(codigo) {
  try {
    const p = JSON.parse(new TextDecoder().decode(await descomprimir(await deslacrar(b64.deUrl(codigo.trim().replace(/^.*#s=/, ''))))));
    const n = mesclar(p.col);
    toast(n ? `Sincronizado com ${nome(p.de)}: ${n} atualizaç${n === 1 ? 'ão' : 'ões'}.` : 'Você já estava em dia.');
    render();
  } catch { toast('Código de sincronização inválido.'); }
}

// ------------------------------------------------------------------ GRUPO (atualizações e arquivos por pessoa)
const FG = { quem: 'todos' };
function vGrupo(sub) {
  const aba = ['arquivos', 'querem'].includes(sub) ? sub : 'atualizacoes';
  const s = seg('grupo', aba, [['atualizacoes', 'Atualizações'], ['querem', 'Quero ir'], ['arquivos', 'Arquivos']]);
  return cab('Quem fez o quê', 'Grupo') + s + (aba === 'arquivos' ? vArquivos() : aba === 'querem' ? vQuerem() : vAtualizacoes());
}
// Desejos do grupo: os lugares marcados com "Quero ir", em comum e por pessoa.
function vQuerem() {
  const ordemCid = (c) => { const i = D.cidades.findIndex((x) => x.id === c); return i < 0 ? 99 : i; };
  const nomeCid = (c) => D.cidades.find((x) => x.id === c)?.nome || '';
  const votados = lugares().map((l) => ({ l, v: votosDe(l.id) })).filter((x) => x.v.length);
  const porRoteiro = (a, b) => ordemCid(a.l.cidade) - ordemCid(b.l.cidade) || a.l.nome.localeCompare(b.l.nome);
  const linha = (x, outros) => `<button class="fl" data-a="lugar" data-id="${esc(x.l.id)}"><span class="ic">${ic(ICAT[x.l.cat] || 'pin')}</span><span class="grow"><b style="display:block;font-size:15px">${esc(x.l.nome)}</b><span class="xs mute">${esc(nomeCat(x.l.cat))} · ${esc(nomeCid(x.l.cidade))}</span></span>${outros.length ? avs(outros, 'xs') : ''}${ic('chev', 'sm')}</button>`;
  if (!votados.length) return `<div class="card empty" style="margin-top:8px">${ic('heart')}<p>Ninguém marcou “Quero ir” ainda. Em Lugares, toque no coração dos bares, restaurantes e passeios que vocês querem conhecer: eles aparecem aqui, separados por pessoa.</p><a class="btn soft" href="#/lugares" style="margin-top:12px">${ic('compass', 'sm')}Ir para Lugares</a></div>`;
  const comum = votados.filter((x) => x.v.length >= 2).sort((a, b) => b.v.length - a.v.length || porRoteiro(a, b));
  const blocoComum = comum.length ? `<div class="person"><span class="iconbtn" style="box-shadow:none;color:var(--acc-text)">${ic('heart')}</span><h2 class="grow">Em comum</h2><span class="tag acc num">${comum.length}</span></div>
    <div class="card" style="padding:4px 16px">${comum.map((x) => linha(x, x.v)).join('')}</div>` : '';
  const pessoas = D.pessoas.map((p) => {
    const meus = votados.filter((x) => x.v.includes(p.id)).sort(porRoteiro);
    return `<div class="person">${av(p.id)}<h2 class="grow">${esc(p.curto)}</h2><span class="tag num">${meus.length}</span></div>
    <div class="card" style="padding:4px 16px">${meus.length ? meus.map((x) => linha(x, x.v.filter((i) => i !== p.id))).join('') : `<p class="small mute" style="padding:12px 0">${p.id === S.eu ? 'Você ainda não marcou nenhum lugar.' : 'Nenhum lugar marcado ainda.'}</p>`}</div>`;
  }).join('');
  return `<p class="small mute">${votados.length} ${votados.length === 1 ? 'lugar marcado' : 'lugares marcados'} com “Quero ir”. As fotos ao lado mostram quem mais quer ir ao mesmo lugar.</p>${blocoComum}${pessoas}
    <a class="btn soft block" href="#/lugares" style="margin-top:20px">${ic('compass', 'sm')}Marcar mais lugares</a>`;
}
function vAtualizacoes() {
  EVS = eventos();
  const lista = EVS.map((e, i) => ({ e, i })).filter(({ e }) => FG.quem === 'todos' || e.por === FG.quem);
  let dia = '', html = '';
  for (const { e, i } of lista.slice(0, 200)) {
    const r = rotuloDia(e.ts);
    if (r !== dia) { html += `${dia ? '</div>' : ''}<p class="feedday">${r}</p><div class="card" style="padding:4px 16px">`; dia = r; }
    html += linhaEvento(e, i);
  }
  if (dia) html += '</div>';
  return `<div class="chips"><button class="chip" aria-pressed="${FG.quem === 'todos'}" data-a="fQuem" data-id="todos">Todos</button>${D.pessoas.map((p) => `<button class="chip" aria-pressed="${FG.quem === p.id}" data-a="fQuem" data-id="${p.id}" style="padding-left:4px">${av(p.id, 'xs')}${esc(p.curto)}</button>`).join('')}</div>
    <div class="syncpill" style="margin-top:12px">${pillSync()}</div>
    ${html || `<div class="card empty" style="margin-top:16px">${ic('users')}<p>Nenhuma atualização${FG.quem !== 'todos' ? ' de ' + esc(nome(FG.quem)) : ''} ainda.</p></div>`}`;
}
depoisRender.grupo = (sub) => {
  if (sub === 'arquivos' || sub === 'querem') return;
  S.ui.visto = Date.now(); salvar(true); atualizarIndicador();
};
function linhaDoc(d) {
  return `<button class="fl" data-a="abrirDoc" data-id="${d.id}"><span class="ic">${ic(d.tipo.startsWith('image') ? 'img' : 'file')}</span><span class="grow"><b style="display:block;font-size:15px">${esc(d.titulo)}</b><span class="xs mute">${d.cat === 'voo' ? 'Passagem' : 'Documento'} · ${tam(d.tamanho || 0)}</span></span>${ic('down', 'sm')}</button>`;
}
function linhaArq(a) {
  const st = a.remoto ? '' : LOCAIS.has(a.id) ? (SYNC.url ? ' · enviando…' : ' · só neste aparelho') : ` · aguardando envio de ${esc(nome(a.pessoa))}`;
  return `<button class="fl" data-a="abrirArq" data-id="${a.id}"><span class="ic">${ic(a.tipo?.startsWith('image') ? 'img' : (TIPOS_ARQ.find((t) => t[0] === a.kind)?.[2] || 'file'))}</span><span class="grow"><b style="display:block;font-size:15px">${esc(a.titulo)}</b><span class="xs mute">${esc(ROT_ARQ[a.kind] || 'Arquivo')} · enviado por ${esc(nome(a.pessoa))} ${a.criado ? quando(a.criado) : ''}${st}</span></span>${ic('down', 'sm')}</button>`;
}
function vArquivos() {
  const todos = anexos();
  const secao = (id, titulo, docs, ups, avatar) => {
    const n = docs.length + ups.length;
    return `<div class="person">${avatar}<h2 class="grow">${esc(titulo)}</h2><span class="tag num">${n}</span><button class="mini" data-a="anexar" data-dono="${id}" aria-label="Anexar para ${esc(titulo)}">${ic('plus')}</button></div>
    <div class="card" style="padding:4px 16px">${n ? docs.map(linhaDoc).join('') + ups.map(linhaArq).join('') : '<p class="small mute" style="padding:12px 0">Nenhum arquivo.</p>'}</div>`;
  };
  const geral = secao('grupo', 'Do grupo', D.docs.filter((d) => d.cat !== 'voo'), todos.filter((a) => donoDe(a) === 'grupo'), `<span class="iconbtn" style="box-shadow:none">${ic('folder')}</span>`);
  const pessoas = D.pessoas.map((p) => secao(p.id, p.nome, D.docs.filter((d) => d.cat === 'voo' && (d.pessoas || []).includes(p.id)), todos.filter((a) => donoDe(a) === p.id), av(p.id))).join('');
  return `<p class="small mute">Passagens, comprovantes e documentos de cada um. O que é anexado aqui fica disponível para todos.</p>${geral}${pessoas}
    <a class="card row" href="${esc(D.drive)}" target="_blank" rel="noopener" style="margin-top:24px"><span class="ic" style="width:40px;height:40px;border-radius:12px;display:grid;place-items:center;background:var(--surface2)">${ic('folder')}</span><span class="grow"><h3>Pasta do Drive</h3><span class="xs mute">Cópia de segurança</span></span>${ic('ext', 'sm')}</a>`;
}

// ------------------------------------------------------------------ AJUSTES (contatos, dicas, este aparelho)
function vAjustes() {
  const tzs = [['Brasília', 'America/Sao_Paulo'], ['LA e Vegas', 'America/Los_Angeles'], ['Arizona', 'America/Phoenix'], ['Utah', 'America/Denver']];
  return cab('Ajustes', 'Contatos e dicas') + `
  <div class="card"><div class="syncpill">${pillSync() || '<span class="tag">Sincronização desligada</span>'}</div><p class="small mute" style="margin-top:8px">Tudo o que alguém faz no app chega sozinho aos outros celulares e computadores.</p>
    <div class="btnrow"><button class="btn sm" data-a="syncAgora">${ic('sync', 'sm')}Atualizar agora</button>${autoSync() ? '' : `<button class="btn sm" data-a="sincronizar">${ic('share', 'sm')}Enviar por link</button><button class="btn sm" data-a="importar">Importar link</button>`}</div></div>
  <h2 class="sec">Contatos</h2>
  <div class="card" style="padding:4px 16px">${D.contatos.map((c) => `<div class="li"><div class="grow"><h3 style="font-size:15px">${esc(c.nome)}</h3>${c.tel ? `<p class="xs mute num">${esc(c.tel)}</p>` : ''}</div>
    ${c.whatsapp ? `<a class="iconbtn" href="https://wa.me/${c.whatsapp}" target="_blank" rel="noopener" aria-label="WhatsApp">${ic('wa')}</a>` : ''}${c.tel ? `<a class="iconbtn" href="tel:${c.tel}" aria-label="Ligar">${ic('phone')}</a>` : ''}${c.q ? `<a class="iconbtn" href="${esc(mapsIr(c.q))}" target="_blank" rel="noopener" aria-label="Rota">${ic('nav')}</a>` : ''}${c.link ? `<a class="iconbtn" href="${esc(c.link)}" target="_blank" rel="noopener" aria-label="Site">${ic('ext')}</a>` : ''}</div>`).join('')}</div>
  <h2 class="sec">Relógios</h2>
  <div class="clock" id="relogios">${tzs.map(([n, z]) => `<div><span class="xs mute">${n}</span><b data-tz="${z}">--:--</b></div>`).join('')}</div>
  <h2 class="sec">Dicas</h2>
  <div class="card" style="padding:0 16px">${D.dicas.map((d, i) => `<details class="sum" ${i ? 'style="border-top:1px solid var(--line)"' : ''}><summary>${esc(d.titulo)}${ic('chev', 'sm chevd')}</summary><p class="small" style="padding-bottom:12px;color:var(--ink2)">${esc(d.texto)}</p></details>`).join('')}</div>
  <h2 class="sec">Este aparelho</h2>
  <div class="card" style="padding:4px 16px">
    <button class="li btnlike" data-a="escolherEu">${S.eu ? av(S.eu, 'sm') : `<span class="ic">${ic('users')}</span>`}<div class="grow"><h3 style="font-size:15px">Quem é você</h3><p class="xs mute">${S.eu ? esc(pessoa(S.eu).nome) : 'Não escolhido'}</p></div>${ic('chev')}</button>
    <button class="li btnlike" data-a="tema"><span class="ic">${ic(S.tema === 'dark' ? 'sun' : 'moon')}</span><div class="grow"><h3 style="font-size:15px">Tema</h3><p class="xs mute">${{ dark: 'Escuro', light: 'Claro' }[S.tema] || 'Automático'}</p></div>${ic('chev')}</button>
    <button class="li btnlike" data-a="instalar"><span class="ic">${ic('down')}</span><div class="grow"><h3 style="font-size:15px">Instalar na tela inicial</h3></div>${ic('chev')}</button>
    <button class="li btnlike" data-a="bloquear"><span class="ic">${ic('lock')}</span><div class="grow"><h3 style="font-size:15px">Bloquear</h3><p class="xs mute">Esquece a senha neste aparelho</p></div>${ic('chev')}</button>
  </div>`;
}
depoisRender.ajustes = () => {
  const tick = () => $$('#relogios [data-tz]').forEach((b) => { b.textContent = new Intl.DateTimeFormat('pt-BR', { timeZone: b.dataset.tz, hour: '2-digit', minute: '2-digit' }).format(new Date()); });
  tick(); clearInterval(depoisRender.t); depoisRender.t = setInterval(() => { if (!$('#relogios')) return clearInterval(depoisRender.t); tick(); }, 15000);
};

// ------------------------------------------------------------------ voos, hotéis, checklist (formulários)
function formVoo(pid, grupoIni = 'volta', v = null) {
  abrirSheet(v ? 'Editar voo' : 'Cadastrar voo', `<form id="fv">
    <div class="f" style="margin-top:8px"><span class="xs mute" style="font-weight:700;display:block;margin-bottom:6px">Passageiros</span><div class="pick" data-g="pes">${D.pessoas.map((p) => `<button type="button" aria-pressed="${v ? v.pessoas.includes(p.id) : p.id === pid}" data-id="${p.id}">${av(p.id, 'sm')}${esc(p.curto)}</button>`).join('')}</div></div>
    <div class="seg" style="margin-top:14px" role="radiogroup">${[['ida', 'Ida'], ['volta', 'Volta']].map(([k, n]) => `<button type="button" role="radio" aria-selected="${(v?.grupo || grupoIni) === k}" data-gr="${k}">${n}</button>`).join('')}</div>
    <div class="row"><label class="f grow"><span>Companhia</span><input class="inp" name="cia" required value="${esc(v?.cia || '')}" placeholder="Copa Airlines"></label><label class="f" style="width:120px"><span>Voo</span><input class="inp" name="numero" required value="${esc(v?.numero || '')}" placeholder="CM 253"></label></div>
    <div class="row"><label class="f grow"><span>De (aeroporto)</span><input class="inp" name="de" required maxlength="3" value="${esc(v?.de || '')}" placeholder="LAS" style="text-transform:uppercase"></label><label class="f grow"><span>Para</span><input class="inp" name="para" required maxlength="3" value="${esc(v?.para || '')}" placeholder="PTY" style="text-transform:uppercase"></label></div>
    <label class="f"><span>Saída (horário local)</span><input class="inp" type="datetime-local" name="saida" required value="${esc(v?.saida || ((v?.grupo || grupoIni) === 'ida' ? '2027-04-09T22:00' : '2027-04-24T12:00'))}"></label>
    <label class="f"><span>Chegada (horário local)</span><input class="inp" type="datetime-local" name="chegada" value="${esc(v?.chegada || '')}"></label>
    <label class="f"><span>Localizador</span><input class="inp" name="localizador" value="${esc(v?.localizador || '')}" style="text-transform:uppercase"></label>
    <label class="f"><span>Observação</span><input class="inp" name="obs" value="${esc(v?.obs || '')}"></label>
    <button class="btn primary block" style="margin-top:16px">${ic('check')}Salvar</button></form>`, (sh) => {
    let grupo = v?.grupo || grupoIni;
    sh.querySelectorAll('[data-gr]').forEach((b) => b.addEventListener('click', () => { grupo = b.dataset.gr; sh.querySelectorAll('[data-gr]').forEach((x) => x.setAttribute('aria-selected', x === b)); }));
    sh.querySelector('[data-g="pes"]').addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) b.setAttribute('aria-pressed', b.getAttribute('aria-pressed') !== 'true'); });
    sh.querySelector('#fv').addEventListener('submit', (e) => {
      e.preventDefault(); const f = new FormData(e.target);
      const pessoas = [...sh.querySelectorAll('[data-g="pes"] [aria-pressed="true"]')].map((b) => b.dataset.id);
      if (!pessoas.length) { toast('Escolha ao menos um passageiro.'); return; }
      const id = v?.id || 'v-' + uid();
      S.sync.voos[id] = { id, grupo, pessoas, cia: f.get('cia'), numero: String(f.get('numero')).toUpperCase(), de: String(f.get('de')).toUpperCase(), para: String(f.get('para')).toUpperCase(), saida: f.get('saida'), chegada: f.get('chegada') || '', localizador: String(f.get('localizador') || '').toUpperCase(), obs: f.get('obs') || '', ts: Date.now(), por: v?.por || S.eu || '' };
      salvar(); fecharSheet(); render(); toast('Voo salvo.' + aviso());
    });
  });
}
function formHotel(id) {
  const h = D.hoteis.find((x) => x.id === id); const r = S.sync.hoteis[id] || {};
  abrirSheet('Reserva: ' + h.titulo, `<form id="fh">
    <label class="f"><span>Hotel</span><input class="inp" name="nome" required value="${esc(r.nome || '')}" list="sugh"><datalist id="sugh">${h.sugestoes.map((s) => `<option value="${esc(s.nome)}">`).join('')}</datalist></label>
    <label class="f"><span>Endereço</span><input class="inp" name="endereco" value="${esc(r.endereco || '')}"></label>
    <label class="f"><span>Código da reserva</span><input class="inp" name="codigo" value="${esc(r.codigo || '')}"></label>
    <label class="f"><span>Valor total</span><input class="inp" name="valor" value="${esc(r.valor || '')}" placeholder="US$ 500 + resort fee"></label>
    <label class="f"><span>Observações</span><textarea class="inp" name="obs">${esc(r.obs || '')}</textarea></label>
    <button class="btn primary block" style="margin-top:16px">${ic('check')}Salvar</button>
    ${r.nome ? `<button type="button" class="btn danger block" style="margin-top:8px" data-a="limparHotel" data-id="${id}">${ic('trash')}Remover reserva</button>` : ''}</form>`, (sh) => {
    sh.querySelector('#fh').addEventListener('submit', (e) => {
      e.preventDefault(); const f = Object.fromEntries(new FormData(e.target));
      const sug = h.sugestoes.find((s) => s.nome === f.nome); if (!f.endereco && sug) f.endereco = sug.q;
      S.sync.hoteis[id] = { ...f, ts: Date.now(), por: S.eu || '' }; salvar(); fecharSheet(); render(); toast('Reserva salva.' + aviso());
    });
  });
}
function abrirChecklist() {
  const grupos = [...new Set(D.checklist.map((c) => c.grupo))];
  abrirSheet('Checklist', grupos.map((g) => `<h3 style="margin-top:16px">${esc(g)}</h3><div class="card" style="padding:4px 16px;margin-top:8px">${D.checklist.filter((c) => c.grupo === g).map((c) => { const st = S.sync.check[c.id]; const on = !!st?.v; return `<button class="chk" role="checkbox" aria-checked="${on}" data-a="check" data-id="${c.id}"><span class="box">${ic('check', 'sm')}</span><span class="grow"><span class="txt small" style="display:block">${esc(c.texto)}</span><span class="xs mute" data-quem>${on && st.por ? 'feito por ' + esc(nome(st.por)) : esc(pessoa(c.quem)?.curto || c.quem)}</span></span></button>`; }).join('')}</div>`).join(''));
}

// ------------------------------------------------------------------ arquivos
async function abrirBlob(blob, nomeArq, idArq) {
  const url = URL.createObjectURL(blob);
  const meta = idArq ? S.sync.arquivos[idArq] : null;
  const img = blob.type.startsWith('image/');
  const info = meta ? `<p class="xs mute" style="margin-bottom:12px">${esc(ROT_ARQ[meta.kind] || 'Arquivo')} de ${esc(nome(donoDe(meta)))} · enviado por ${esc(nome(meta.pessoa))} ${meta.criado ? quando(meta.criado) : ''}</p>` : '';
  const botoes = `<div class="btnrow">${img ? '' : `<a class="btn primary" href="${url}" target="_blank" rel="noopener">${ic('ext', 'sm')}Abrir</a>`}<a class="btn ${img ? 'primary' : ''}" href="${url}" download="${esc(nomeArq)}">${ic('down', 'sm')}Baixar</a><button class="btn" data-a="shareBlob">${ic('share', 'sm')}Compartilhar</button>${idArq ? `<button class="btn danger" data-a="apagarArq" data-id="${idArq}">${ic('trash', 'sm')}Apagar</button>` : ''}</div>`;
  abrirSheet(meta?.titulo || nomeArq, info + (img ? `<img src="${url}" alt="${esc(nomeArq)}" style="border-radius:16px;width:100%;height:auto">` : `<p class="small mute">${tam(blob.size)} · PDF</p>`) + botoes, (sh) => {
    sh.querySelector('[data-a="shareBlob"]').addEventListener('click', (e) => { e.stopPropagation(); compartilharBlob(blob, nomeArq); });
  });
}
async function compartilharBlob(blob, nomeArq) {
  const f = new File([blob], nomeArq, { type: blob.type });
  if (navigator.canShare?.({ files: [f] })) { try { await navigator.share({ files: [f], title: nomeArq }); } catch { /* cancelado */ } }
  else { const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = nomeArq; a.click(); }
}
async function abrirDoc(id) {
  const d = D.docs.find((x) => x.id === id); if (!d) return;
  toast('Abrindo ' + d.titulo + '…');
  try { abrirBlob(new Blob([await abrirBin(await (await fetch(d.bin)).arrayBuffer())], { type: d.tipo }), d.nome); }
  catch { toast('Não foi possível abrir. Verifique a conexão.'); }
}
async function salvarAnexo(file, meta) {
  if (file.size > 15 * 1024 * 1024) { toast(file.name + ' passa de 15 MB e não foi anexado.'); return false; }
  const m = { id: uid(), titulo: file.name.replace(/\.[^.]+$/, ''), nome: file.name, tipo: file.type || 'application/octet-stream', tamanho: file.size, pessoa: S.eu || '', criado: Date.now(), ...meta };
  await idb.put({ ...m, blob: file });
  S.sync.arquivos[m.id] = { ...m, remoto: false, ts: Date.now() };
  S.pendUp.push(m.id); LOCAIS.add(m.id);
  return true;
}
function anexar(kind, ref, dono) {
  const inp = document.createElement('input'); inp.type = 'file'; inp.accept = 'image/*,application/pdf';
  inp.onchange = async () => {
    const file = inp.files[0]; if (!file) return;
    if (kind === 'hotel') {
      if (await salvarAnexo(file, { kind: 'hotel', ref, dono: 'grupo' })) { salvar(); render(); toast('Comprovante anexado' + (SYNC.url ? ' e enviado ao grupo.' : '.')); }
      return;
    }
    let d = dono || S.eu || 'grupo'; let k = kind || 'doc';
    abrirSheet('Anexar arquivo', `<form id="fa">
      <p class="small mute">${esc(file.name)} · ${tam(file.size)}</p>
      <label class="f"><span>Nome</span><input class="inp" name="titulo" required value="${esc(file.name.replace(/\.[^.]+$/, ''))}"></label>
      <div class="f" style="margin-top:14px"><span class="xs mute" style="font-weight:700;display:block;margin-bottom:6px">De quem é</span><div class="pick" data-g="dono">${D.pessoas.map((p) => `<button type="button" aria-pressed="${d === p.id}" data-id="${p.id}">${av(p.id, 'sm')}${esc(p.curto)}</button>`).join('')}<button type="button" class="noav" aria-pressed="${d === 'grupo'}" data-id="grupo">${ic('folder', 'sm')}Grupo</button></div></div>
      <div class="f" style="margin-top:14px"><span class="xs mute" style="font-weight:700;display:block;margin-bottom:6px">Tipo</span><div class="pick" data-g="kind">${TIPOS_ARQ.filter(([t]) => t !== 'hotel').map(([t, n, i]) => `<button type="button" class="noav" aria-pressed="${k === t}" data-id="${t}">${ic(i, 'sm')}${n}</button>`).join('')}</div></div>
      <button class="btn primary block" style="margin-top:16px">${ic('up')}Anexar para o grupo</button></form>`, (sh) => {
      sh.querySelectorAll('.pick').forEach((g) => g.addEventListener('click', (e) => { const b = e.target.closest('button'); if (!b) return; g.querySelectorAll('button').forEach((y) => y.setAttribute('aria-pressed', y === b)); if (g.dataset.g === 'dono') d = b.dataset.id; else k = b.dataset.id; }));
      sh.querySelector('#fa').addEventListener('submit', async (e) => {
        e.preventDefault();
        if (await salvarAnexo(file, { kind: k, ref: '', dono: d, titulo: String(new FormData(e.target).get('titulo')).trim() })) {
          salvar(); fecharSheet(true);
          if (location.hash !== '#/grupo/arquivos') location.hash = '#/grupo/arquivos'; else render();
          toast('Arquivo anexado' + (SYNC.url ? ' e enviado ao grupo.' : '.'));
        }
      });
    });
  };
  inp.click();
}

// ------------------------------------------------------------------ ajustes
function escolherEu() {
  abrirSheet('Quem é você?', `<p class="small mute">Assim o grupo sabe quem lançou cada gasto, comentário e arquivo.</p>
    <div class="stack" style="margin-top:16px">${D.pessoas.map((p) => `<button class="card row" data-a="souEu" data-id="${p.id}" style="width:100%;text-align:left;${S.eu === p.id ? 'border-color:var(--acc)' : ''}">${av(p.id, 'lg')}<div class="grow"><h3 style="font-size:18px">${esc(p.nome)}</h3><p class="small mute">${esc(p.papel)}</p></div>${S.eu === p.id ? ic('check') : ''}</button>`).join('')}</div>`);
}
function aplicarTema() { if (S.tema) document.documentElement.dataset.theme = S.tema; else delete document.documentElement.dataset.theme; }
let promptInstalar = null;
window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); promptInstalar = e; });

// ------------------------------------------------------------------ ações
const A = {
  fechar: () => fecharSheet(),
  go: (t) => { location.hash = t.dataset.h; },
  ajustes: () => { location.hash = '#/ajustes'; },
  pessoa: (t) => {
    const p = pessoa(t.dataset.id);
    const vs = todosVoos().filter((v) => v.pessoas.includes(p.id)).sort((a, b) => a.saida.localeCompare(b.saida));
    abrirSheet(p.nome, `<div class="row">${av(p.id, 'xl')}<div class="grow"><p class="small" style="color:var(--ink2)">${esc(p.papel)}</p><p class="small mute" style="margin-top:4px">No grupo de ${ddmm(p.de)} a ${p.ate ? ddmm(p.ate) : 'a definir'}</p></div></div>
      <div class="btnrow"><button class="btn sm" data-a="go" data-h="#/grupo/arquivos">${ic('folder', 'sm')}Arquivos</button></div>
      <div style="margin-top:16px">${vs.map(cardVoo).join('') || '<p class="small mute">Sem voos cadastrados.</p>'}</div>`);
  },
  irDia: (t) => document.getElementById('d-' + t.dataset.id)?.scrollIntoView({ behavior: 'smooth', block: 'start' }),
  usarRota: (t) => { setConf('rota', t.dataset.id); render(); toast('Roteiro ' + t.dataset.id + ' escolhido.' + aviso()); },
  fCidade: (t) => { F.cidade = t.dataset.id; render(); },
  fCat: (t) => { F.cat = t.dataset.id; render(); },
  fQuem: (t) => { FG.quem = t.dataset.id; render(); },
  lugar: (t) => detalheLugar(t.dataset.id),
  novoLugar: () => { if (!S.eu) return escolherEu(); formLugar(); },
  editarLugar: (t) => formLugar(t.dataset.id),
  apagarLugar: (t) => { if (!confirm('Remover este lugar para todos?')) return; const r = S.sync.conf[t.dataset.id]; S.sync.conf[t.dataset.id] = { ...r, del: true, ts: Date.now(), por: S.eu || r.por }; salvar(); fecharSheet(); render(); toast('Lugar removido.'); },
  comentar: (t) => { const alvo = t.dataset.alvo; if (alvo.startsWith('dia:')) abrirSheet('Comentários · ' + nomeAlvo(alvo).replace(/^o /, ''), blocoComentarios(alvo), montarComentarios); else detalheLugar(alvo); },
  apagarComent: (t) => { const r = S.sync.conf[t.dataset.id]; if (!r) return; S.sync.conf[t.dataset.id] = { ...r, del: true, ts: Date.now() }; salvar(); SYNC.pend = true; const th = $('.sheet [data-thread]'); if (th) th.innerHTML = listaComentarios(th.dataset.thread); },
  evento: (t) => { const e = EVS[+t.dataset.i]; if (!e?.acao) return; if (e.acao.h) location.hash = e.acao.h; else A[e.acao.a]?.({ dataset: { id: e.acao.id, alvo: e.acao.alvo } }); },
  votar: (t) => {
    if (!S.eu) return escolherEu();
    const k = `${t.dataset.id}|${S.eu}`; const on = !S.sync.votos[k]?.v;
    S.sync.votos[k] = { v: on ? 1 : 0, ts: Date.now(), por: S.eu }; salvar();
    t.setAttribute('aria-pressed', on);
    if (!$('.sheet')) render(); else SYNC.pend = true;
    navigator.vibrate?.(10);
  },
  check: (t) => {
    const id = t.dataset.id; const on = !S.sync.check[id]?.v;
    S.sync.check[id] = { v: on, ts: Date.now(), por: S.eu || '' }; salvar();
    t.setAttribute('aria-checked', on);
    const q = t.querySelector('[data-quem]'); if (q) q.textContent = on ? 'feito por ' + nome(S.eu) : '';
    if (!$('.sheet')) render(); else SYNC.pend = true;
    navigator.vibrate?.(10);
  },
  checklist: () => abrirChecklist(),
  novoGasto: () => formGasto(),
  editarGasto: (t) => { const g = S.sync.gastos[t.dataset.id]; if (g) formGasto(g); },
  apagarGasto: (t) => {
    if (!confirm('Apagar este gasto para todos?')) return;
    S.sync.gastos[t.dataset.id] = { ...S.sync.gastos[t.dataset.id], del: true, ts: Date.now(), por: S.eu || '' }; salvar(); fecharSheet(); render(); toast('Gasto apagado.');
  },
  syncAgora: async () => { toast('Atualizando…'); await sincronizar(); if (!$('.sheet')) render(); toast(autoSync() ? 'Tudo em dia com o grupo.' : 'Sem conexão com o servidor agora.'); },
  sincronizar: async () => {
    const url = await linkSync();
    const texto = 'EUA 2027: atualização do app. Abra o link para sincronizar:';
    if (navigator.share) { try { await navigator.share({ title: 'EUA 2027', text: texto, url }); return; } catch (e) { if (e?.name === 'AbortError') return; } }
    abrirSheet('Enviar ao grupo', `<textarea class="inp" readonly style="font-size:13px;min-height:120px">${esc(url)}</textarea><div class="btnrow"><button class="btn primary" data-a="copiar" data-v="${esc(url)}">${ic('copy', 'sm')}Copiar link</button><a class="btn" href="https://wa.me/?text=${enc(texto + ' ' + url)}" target="_blank" rel="noopener">${ic('wa', 'sm')}WhatsApp</a></div>`);
  },
  importar: () => {
    abrirSheet('Importar do grupo', `<form id="fi"><textarea class="inp" name="c" required placeholder="https://…#s=…"></textarea><button class="btn primary block" style="margin-top:12px">${ic('sync')}Sincronizar</button></form>`, (sh) => {
      sh.querySelector('#fi').addEventListener('submit', (e) => { e.preventDefault(); fecharSheet(); importarHash(new FormData(e.target).get('c')); });
    });
  },
  cambio: () => {
    abrirSheet('Câmbio', `<form id="fc"><label class="f"><span>US$ 1 vale (R$)</span><input class="inp num" name="v" inputmode="decimal" value="${String(S.cambio).replace('.', ',')}"></label><button type="button" class="btn soft block" data-a="buscarCambio" style="margin-top:12px">${ic('sync', 'sm')}Buscar cotação de agora</button><button class="btn primary block" style="margin-top:8px">${ic('check')}Salvar</button></form>`, (sh) => {
      sh.querySelector('#fc').addEventListener('submit', (e) => { e.preventDefault(); const v = numero(new FormData(e.target).get('v')); if (v > 0) { S.cambio = v; salvar(true); } fecharSheet(); render(); });
    });
  },
  buscarCambio: async () => {
    try { const r = await (await fetch('https://economia.awesomeapi.com.br/json/last/USD-BRL')).json(); const v = parseFloat(r.USDBRL.bid); const i = $('#fc [name="v"]'); if (i && v) i.value = v.toFixed(4).replace('.', ','); toast('Dólar comercial: R$ ' + v.toFixed(2).replace('.', ',') + '. Cartão costuma cobrar uns 4% a mais.'); }
    catch { toast('Sem conexão para buscar a cotação.'); }
  },
  pix: () => {
    abrirSheet('Chaves Pix', `<form id="fp">${D.pessoas.map((p) => `<label class="f"><span>${esc(p.curto)}</span><div class="row">${av(p.id, 'sm')}<input class="inp" name="${p.id}" value="${esc(S.sync.pix[p.id]?.v || '')}" placeholder="CPF, celular, e-mail ou chave aleatória"></div></label>`).join('')}<button class="btn primary block" style="margin-top:16px">${ic('check')}Salvar</button></form>`, (sh) => {
      sh.querySelector('#fp').addEventListener('submit', (e) => {
        e.preventDefault(); const f = new FormData(e.target);
        for (const p of D.pessoas) { const v = String(f.get(p.id) || '').trim(); if (v !== (S.sync.pix[p.id]?.v || '')) S.sync.pix[p.id] = { v, ts: Date.now(), por: S.eu || '' }; }
        salvar(); fecharSheet(); render();
      });
    });
  },
  ferramentas: () => {
    const pres = presentes(isoHoje() >= D.inicio && isoHoje() <= D.fim ? isoHoje() : D.inicio);
    abrirSheet('Ferramentas', `
      <div class="card"><h3>Gorjeta e divisão da conta</h3>
        <div class="row" style="align-items:flex-end"><label class="f grow"><span>Conta (US$)</span><input class="inp num" id="gv" inputmode="decimal" placeholder="0,00"></label><label class="f" style="width:96px"><span>Pessoas</span><input class="inp num" id="gp" inputmode="numeric" value="${pres.length}"></label></div>
        <div class="seg" id="gt" style="margin-top:12px">${[18, 20, 22].map((p) => `<button type="button" aria-selected="${p === 20}" data-p="${p}">${p}%</button>`).join('')}</div>
        <div id="gr" class="small" style="color:var(--ink2)">Digite o valor da conta.</div></div>
      <div class="card"><h3>Conversor</h3><div class="row" style="align-items:flex-end"><label class="f grow"><span>US$</span><input class="inp num" id="cu" inputmode="decimal"></label><label class="f grow"><span>R$</span><input class="inp num" id="cb" inputmode="decimal"></label></div></div>
      <div class="card"><h3>Sorteio</h3><p class="small mute">Quem paga a rodada, quem dirige, quem dorme no beliche.</p><div id="sorteio" class="row" style="justify-content:center;min-height:96px;margin-top:8px">${avs(pres, 'lg')}</div><button class="btn primary block" id="sortear">${ic('dice')}Sortear</button></div>
      <div class="card"><h3>Planilha</h3><button class="btn block" data-a="csv" style="margin-top:8px">${ic('down', 'sm')}Baixar CSV dos gastos</button></div>
      <div class="card"><h3>Zerar gastos</h3><p class="small mute">Apaga todos os lançamentos e saldos, para todos.</p><button class="btn danger block" data-a="zerarGastos" style="margin-top:12px">${ic('trash', 'sm')}Zerar todos os gastos</button></div>`, (sh) => {
      let pct = 20;
      const calc = () => { const v = numero($('#gv', sh).value); const n = Math.max(1, parseInt($('#gp', sh).value) || 1); if (!v) return; const t = v * (1 + pct / 100); $('#gr', sh).innerHTML = `Gorjeta ${usd(v * pct / 100)} · total <b>${usd(t)}</b> · cada um <b>${usd(t / n)}</b> (${brl((t / n) * S.cambio)})`; };
      $('#gv', sh).addEventListener('input', calc); $('#gp', sh).addEventListener('input', calc);
      $$('#gt button', sh).forEach((b) => b.addEventListener('click', () => { pct = +b.dataset.p; $$('#gt button', sh).forEach((x) => x.setAttribute('aria-selected', x === b)); calc(); }));
      $('#cu', sh).addEventListener('input', (e) => { $('#cb', sh).value = (numero(e.target.value) * S.cambio).toFixed(2).replace('.', ','); });
      $('#cb', sh).addEventListener('input', (e) => { $('#cu', sh).value = (numero(e.target.value) / S.cambio).toFixed(2).replace('.', ','); });
      $('#sortear', sh).addEventListener('click', () => {
        let n = 0; const alvo = pres[Math.floor(Math.random() * pres.length)];
        const giro = setInterval(() => { $('#sorteio', sh).innerHTML = av(pres[n++ % pres.length], 'xl'); if (n > 14) { clearInterval(giro); $('#sorteio', sh).innerHTML = `<div style="text-align:center">${av(alvo, 'xl')}<h3 style="margin-top:8px;font-size:20px">${esc(nome(alvo))}!</h3></div>`; navigator.vibrate?.([30, 40, 30]); } }, 90);
      });
    });
  },
  csv: () => {
    const linhas = [['data', 'descricao', 'valor', 'moeda', 'valor_usd', 'pagou', 'dividido_entre', 'categoria', 'lancado_por', 'obs']];
    for (const g of gastosAtivos()) linhas.push([g.data, g.desc, g.valor, g.moeda, emUSD(g).toFixed(2), nome(g.pagou), Object.keys(g.pesos).filter((k) => g.pesos[k] > 0).map((k) => `${nome(k)}${g.pesos[k] !== 1 ? ' x' + g.pesos[k] : ''}`).join(' + '), g.cat, nome(g.por), g.nota || '']);
    const csv = '﻿' + linhas.map((l) => l.map((c) => `"${String(c ?? '').replace(/"/g, '""')}"`).join(';')).join('\n');
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' })); a.download = 'gastos-eua-2027.csv'; a.click();
  },
  zerarGastos: () => {
    if (!confirm('Zerar todos os gastos? Os lançamentos e saldos somem para todos.')) return;
    if (!confirm('Confirma? Se quiser, baixe a planilha antes.')) return;
    setConf('gastosDesde', Date.now()); fecharSheet(); render(); toast('Gastos zerados.');
  },
  copiar: (t) => copiar(t.dataset.v),
  abrirDoc: (t) => abrirDoc(t.dataset.id),
  abrirArq: async (t) => { const a = await obterBlob(t.dataset.id); if (a) abrirBlob(a.blob, a.nome, t.dataset.id); },
  apagarArq: async (t) => {
    if (!confirm('Apagar este arquivo para todos?')) return;
    const id = t.dataset.id; const meta = S.sync.arquivos[id];
    S.sync.arquivos[id] = { ...meta, del: true, ts: Date.now() }; S.pendUp = S.pendUp.filter((x) => x !== id);
    await idb.del(id).catch(() => {}); LOCAIS.delete(id);
    if (meta?.remoto && SYNC.token) pedir('/arquivo/' + id, { method: 'DELETE' }).catch(() => {});
    salvar(); fecharSheet(); render(); toast('Arquivo apagado.');
  },
  anexar: (t) => { if (!S.eu) return escolherEu(); anexar(t.dataset.kind, t.dataset.ref, t.dataset.dono); },
  verVoo: (t) => { const v = todosVoos().find((x) => x.id === t.dataset.id); if (v) abrirSheet(`${v.numero} · ${v.de} → ${v.para}`, cardVoo(v)); },
  novoVoo: (t) => formVoo(t.dataset.p || S.eu, t.dataset.g || 'volta'),
  editarVoo: (t) => { const v = S.sync.voos[t.dataset.id]; if (v) formVoo(null, v.grupo, v); },
  apagarVoo: (t) => { if (!confirm('Remover este voo?')) return; S.sync.voos[t.dataset.id] = { ...S.sync.voos[t.dataset.id], del: true, ts: Date.now(), por: S.eu || '' }; salvar(); fecharSheet(); render(); },
  reservaHotel: (t) => formHotel(t.dataset.id),
  limparHotel: (t) => { S.sync.hoteis[t.dataset.id] = { del: true, ts: Date.now(), por: S.eu || '' }; salvar(); fecharSheet(); render(); },
  escolherEu: () => escolherEu(),
  souEu: (t) => { S.eu = t.dataset.id; salvar(true); fecharSheet(); render(); toast('Olá, ' + nome(S.eu) + '!'); },
  tema: () => { S.tema = { undefined: 'dark', dark: 'light', light: undefined }[String(S.tema)]; salvar(true); aplicarTema(); render(); },
  instalar: async () => {
    if (promptInstalar) { promptInstalar.prompt(); promptInstalar = null; return; }
    abrirSheet('Instalar na tela inicial', `<p class="small" style="color:var(--ink2)"><b>iPhone:</b> no Safari, toque em Compartilhar e depois em “Adicionar à Tela de Início”.</p><p class="small" style="color:var(--ink2);margin-top:12px"><b>Android:</b> no Chrome, menu ⋮ e “Instalar app”.</p><p class="small" style="color:var(--ink2);margin-top:12px"><b>Computador:</b> no Chrome ou Edge, ícone de instalar na barra de endereço.</p>`);
  },
  bloquear: () => { if (!confirm('Esquecer a senha neste aparelho?')) return; localStorage.removeItem(K_CHAVE); CHAVE = null; clearInterval(SYNC.timer); SYNC.token = ''; SYNC.status = 'off'; D = null; location.hash = ''; telaBloqueio(); },
};
document.addEventListener('click', (e) => {
  const t = e.target.closest('[data-a]');
  if (!t || !A[t.dataset.a]) return;
  if (t.tagName === 'A' && t.getAttribute('href')) return;
  e.preventDefault();
  A[t.dataset.a](t, e);
});

// ------------------------------------------------------------------ partida
if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
(async () => { if (!(await tentarChaveSalva())) telaBloqueio(); })();
