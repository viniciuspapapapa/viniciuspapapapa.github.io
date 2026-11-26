/* EUA 2027 — app da viagem do grupo.
   Os dados ficam em dados.bin e docs/*.bin, cifrados com AES-256-GCM (chave derivada da senha do grupo).
   O estado de cada aparelho (gastos, checklist, reservas, votos) fica no localStorage e é trocado entre
   os amigos por um link de sincronização, também cifrado. Arquivos enviados ficam no IndexedDB do aparelho. */
'use strict';

const VERSAO_APP = 1;
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
const MES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
const dt = (iso) => { const [y, m, d] = iso.slice(0, 10).split('-').map(Number); return new Date(y, m - 1, d); };
const isoHoje = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const ddmm = (iso) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
const semana = (iso) => SEM[dt(iso).getDay()];
const hora = (iso) => iso.slice(11, 16);
const diasEntre = (a, b) => Math.round((dt(b) - dt(a)) / 86400000);
const somaDias = (iso, n) => { const d = dt(iso); d.setDate(d.getDate() + n); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const usd = (v) => 'US$ ' + (Math.round(v * 100) / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const brl = (v) => 'R$ ' + (Math.round(v * 100) / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const numero = (s) => { if (typeof s === 'number') return s; const t = String(s).trim().replace(/\s/g, ''); const n = t.includes(',') ? t.replace(/\./g, '').replace(',', '.') : t; return parseFloat(n) || 0; };
const mapsIr = (q) => `https://www.google.com/maps/dir/?api=1&destination=${enc(q)}`;
const mapsVer = (q) => `https://www.google.com/maps/search/?api=1&query=${enc(q)}`;
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
  case: '<path d="M16 20V4a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/><rect width="20" height="14" x="2" y="6" rx="2"/>',
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
  msg: '<path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z"/>',
  lock: '<rect width="18" height="11" x="3" y="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>',
  search: '<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>',
  flame: '<path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.07-2.14-.22-4.05 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.15.43-2.29 1-3a2.5 2.5 0 0 0 2.5 2.5z"/>',
  heart: '<path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/>',
  rv: '<path d="M18 19V9a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v8a2 2 0 0 0 2 2h2"/><path d="M2 9h12"/><circle cx="8" cy="19" r="2"/><path d="M10 19h12v-2"/><rect width="4" height="4" x="10" y="9"/>',
  copy: '<rect width="14" height="14" x="8" y="8" rx="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/>',
  clock: '<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2"/><path d="M12 20v2"/><path d="m4.93 4.93 1.41 1.41"/><path d="m17.66 17.66 1.41 1.41"/><path d="M2 12h2"/><path d="M20 12h2"/><path d="m6.34 17.66-1.41 1.41"/><path d="m19.07 4.93-1.41 1.41"/>',
  moon: '<path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/>',
  folder: '<path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z"/>',
  users: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
  dice: '<rect width="18" height="18" x="3" y="3" rx="2"/><path d="M16 8h.01"/><path d="M8 8h.01"/><path d="M8 16h.01"/><path d="M16 16h.01"/><path d="M12 12h.01"/>',
  trash: '<path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/>',
  chev: '<path d="m9 18 6-6-6-6"/>',
  ext: '<path d="M15 3h6v6"/><path d="M10 14 21 3"/><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>',
  cal: '<rect width="18" height="18" x="3" y="4" rx="2"/><path d="M16 2v4"/><path d="M8 2v4"/><path d="M3 10h18"/>',
  ticket: '<path d="M2 9a3 3 0 0 1 0 6v2a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-2a3 3 0 0 1 0-6V7a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2Z"/><path d="M13 5v2"/><path d="M13 17v2"/><path d="M13 11v2"/>',
  info: '<circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/>',
  list: '<path d="m3 17 2 2 4-4"/><path d="m3 7 2 2 4-4"/><path d="M13 6h8"/><path d="M13 12h8"/><path d="M13 18h8"/>',
  bulb: '<path d="M15 14c.2-1 .7-1.7 1.5-2.5 1-.9 1.5-2.2 1.5-3.5A6 6 0 0 0 6 8c0 1 .2 2.2 1.5 3.5.7.7 1.3 1.5 1.5 2.5"/><path d="M9 18h6"/><path d="M10 22h4"/>',
  temp: '<path d="M14 4v10.54a4 4 0 1 1-4 0V4a2 2 0 0 1 4 0Z"/>',
};
const ic = (n, cls = '') => `<svg class="i ${cls}" viewBox="0 0 24 24" aria-hidden="true">${P[n] || ''}</svg>`;
const ICAT = { balada: 'music', bar: 'bar', piscina: 'waves', comer: 'food', show: 'ticket', atracao: 'landmark', natureza: 'mountain', camping: 'tent', compras: 'bag', apoio: 'fuel' };
const ITIPO = { voo: 'plane', transporte: 'car', atividade: 'spark', comida: 'food', noite: 'music', show: 'ticket', hotel: 'bed' };
const CATG = [
  { id: 'hospedagem', nome: 'Hospedagem', ic: 'bed' }, { id: 'motorhome', nome: 'Motorhome', ic: 'rv' }, { id: 'transporte', nome: 'Transporte', ic: 'car' },
  { id: 'combustivel', nome: 'Combustível', ic: 'fuel' }, { id: 'comida', nome: 'Comida', ic: 'food' }, { id: 'mercado', nome: 'Mercado', ic: 'bag' },
  { id: 'balada', nome: 'Bebida e balada', ic: 'bar' }, { id: 'ingressos', nome: 'Ingressos', ic: 'ticket' }, { id: 'outros', nome: 'Outros', ic: 'spark' },
];

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
async function abrirBin(buf, chave = CHAVE) {
  const p = partes(buf);
  return new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: p.iv }, chave, p.dados));
}
async function lacrar(bytes) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const c = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, CHAVE, bytes));
  const out = new Uint8Array(12 + c.length); out.set(iv); out.set(c, 12); return out;
}
async function deslacrar(u8) {
  return new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: u8.slice(0, 12) }, CHAVE, u8.slice(12)));
}
async function comprimir(u8) {
  if (!('CompressionStream' in window)) return u8;
  const s = new Blob([u8]).stream().pipeThrough(new CompressionStream('deflate-raw'));
  return new Uint8Array(await new Response(s).arrayBuffer());
}
async function descomprimir(u8) {
  if (!('DecompressionStream' in window)) return u8;
  const s = new Blob([u8]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
  return new Uint8Array(await new Response(s).arrayBuffer());
}

// ------------------------------------------------------------------ estado local
let D = null; // dados da viagem (decifrados)
let S = carregar();
function carregar() {
  let s = {};
  try { s = JSON.parse(localStorage.getItem(K_ESTADO) || '{}'); } catch { s = {}; }
  s.sync ||= {};
  for (const c of ['gastos', 'check', 'hoteis', 'pix', 'conf', 'voos', 'votos']) s.sync[c] ||= {};
  s.cambio ||= 5.5;
  s.ui ||= {};
  return s;
}
function salvar() { try { localStorage.setItem(K_ESTADO, JSON.stringify(S)); } catch { toast('Não foi possível salvar neste aparelho.'); } }
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

// ------------------------------------------------------------------ IndexedDB (arquivos enviados)
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
  async tx(modo, fn) { const db = await this.abrir(); return new Promise((ok, erro) => { const t = db.transaction('arquivos', modo); const st = t.objectStore('arquivos'); const r = fn(st); t.oncomplete = () => ok(r?.result); t.onerror = () => erro(t.error); }); },
  put(o) { return this.tx('readwrite', (st) => st.put(o)); },
  del(id) { return this.tx('readwrite', (st) => st.delete(id)); },
  get(id) { return this.tx('readonly', (st) => st.get(id)); },
  all() { return this.tx('readonly', (st) => st.getAll()); },
};
let ARQ = []; // metadados dos arquivos locais
async function recarregarArquivos() { try { ARQ = (await idb.all()).map(({ blob, ...m }) => m).sort((a, b) => b.criado - a.criado); } catch { ARQ = []; } }

// ------------------------------------------------------------------ interface básica
function toast(msg) {
  const t = $('#toast'); t.textContent = msg; t.classList.add('on');
  clearTimeout(toast.h); toast.h = setTimeout(() => t.classList.remove('on'), 3200);
}
async function copiar(txt, msg = 'Copiado') {
  try { await navigator.clipboard.writeText(txt); toast(msg); } catch { prompt('Copie:', txt); }
}
function abrirSheet(titulo, html, aoMontar) {
  fecharSheet(true);
  const scrim = document.createElement('div'); scrim.className = 'scrim'; scrim.dataset.a = 'fechar';
  const sh = document.createElement('div'); sh.className = 'sheet'; sh.setAttribute('role', 'dialog'); sh.setAttribute('aria-modal', 'true'); sh.setAttribute('aria-label', titulo);
  sh.innerHTML = `<div class="grab"></div><div class="sh"><h2>${esc(titulo)}</h2><button class="iconbtn" data-a="fechar" aria-label="Fechar">${ic('x')}</button></div><div class="sb">${html}</div>`;
  document.body.append(scrim, sh);
  requestAnimationFrame(() => { scrim.classList.add('on'); sh.classList.add('on'); });
  document.body.style.overflow = 'hidden';
  aoMontar?.(sh);
  setTimeout(() => sh.querySelector('input,select,textarea,button:not([data-a="fechar"])')?.focus({ preventScroll: true }), 280);
  return sh;
}
function fecharSheet(imediato) {
  const sh = $('.sheet'), sc = $('.scrim');
  if (!sh) return;
  document.body.style.overflow = '';
  if (imediato) { sh.remove(); sc?.remove(); return; }
  sh.classList.remove('on'); sc?.classList.remove('on');
  setTimeout(() => { sh.remove(); sc?.remove(); }, 220);
}
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') fecharSheet(); });

const pessoa = (id) => D.pessoas.find((p) => p.id === id);
const av = (id, cls = '') => { const p = pessoa(id); return p ? `<img class="av ${cls}" src="${p.foto}" alt="${esc(p.curto)}" width="40" height="40">` : ''; };
const fimPessoa = (p) => p.ate || '2027-04-24';
const presentes = (iso) => D.pessoas.filter((p) => p.de <= iso && iso <= fimPessoa(p)).map((p) => p.id);
const avs = (ids, cls = 'sm') => `<span class="avs">${ids.map((i) => av(i, cls)).join('')}</span>`;
const flames = (n) => `<span class="flames" aria-label="Animação ${n} de 3">${[1, 2, 3].map((i) => `<svg class="i ${i > n ? 'off' : ''}" viewBox="0 0 24 24">${P.flame}</svg>`).join('')}</span>`;
const corFase = (f) => `var(--${f || 'pre'})`;
const btnIr = (q, txt = 'Ir') => `<a class="btn sm primary" href="${mapsIr(q)}" target="_blank" rel="noopener">${ic('nav', 'sm')}${txt}</a>`;
const btnMapa = (q) => `<a class="btn sm" href="${mapsVer(q)}" target="_blank" rel="noopener">${ic('pin', 'sm')}Mapa</a>`;

// ------------------------------------------------------------------ dias combinados (fixos + roteiro do motorhome)
function diasViagem() {
  const r = D.roteiros.find((x) => x.id === rotaAtual()) || D.roteiros[0];
  const porData = Object.fromEntries(D.dias.map((d) => [d.data, d]));
  const out = [];
  for (let iso = '2027-04-09'; iso <= D.fim; iso = somaDias(iso, 1)) {
    const fixo = porData[iso];
    const rd = r.dias.find((x) => x.data === iso);
    if (rd) {
      out.push({ data: iso, fase: 'rv', titulo: rd.titulo, cidade: D.cidades.find((c) => c.id === rd.cidade)?.nome, cidadeId: rd.cidade, rv: rd, itens: fixo?.itens || [], pernoite: rd.camp?.nome });
    } else if (fixo) {
      out.push({ ...fixo, cidadeId: fixo.fase === 'la' ? 'la' : 'lv' });
    }
  }
  return out;
}

// ------------------------------------------------------------------ desbloqueio
function telaBloqueio(erro = '') {
  document.body.style.paddingBottom = '0';
  $('#app').innerHTML = `
  <section class="lock">
    <div class="sunl"></div>
    <div class="in">
      <p class="eyebrow" style="color:rgba(255,255,255,.8)">Los Angeles · Las Vegas · Cânions</p>
      <h1>EUA 2027</h1>
      <p>Roteiro, motorhome, documentos e gastos do grupo. O conteúdo é cifrado: digite a senha combinada.</p>
      <form id="flock" autocomplete="on">
        <label class="sr" for="senha">Senha do grupo</label>
        <input class="inp" id="senha" name="password" type="password" autocomplete="current-password" placeholder="Senha do grupo" required>
        <label class="rem"><input type="checkbox" id="lembrar" checked> Lembrar neste aparelho</label>
        <button class="btn primary block" type="submit">${ic('lock')}Entrar</button>
        <p class="err" role="alert">${esc(erro)}</p>
      </form>
    </div>
  </section>`;
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
    } catch (err) {
      telaBloqueio(err?.name === 'OperationError' ? 'Senha incorreta.' : 'Não foi possível abrir os dados. Verifique a conexão.');
    }
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
    CHAVE = null;
    return false;
  }
}

function iniciar(dados) {
  D = dados;
  D.lugares.forEach((l) => { l.id = slug(l.cidade + '-' + l.nome); });
  for (const g of D.gastosIniciais || []) if (!S.sync.gastos[g.id]) S.sync.gastos[g.id] = { ...g, ts: 1 };
  salvar();
  document.body.style.paddingBottom = '';
  recarregarArquivos().then(() => { if (/viagem/.test(location.hash)) render(); });
  aplicarTema();
  if (location.hash.startsWith('#s=')) { importarHash(location.hash.slice(3)); history.replaceState(null, '', location.pathname + '#/gastos'); }
  render();
  if (!S.eu) setTimeout(escolherEu, 400);
}

// ------------------------------------------------------------------ roteamento
const TABS = [
  { id: 'inicio', nome: 'Início', ic: 'home' },
  { id: 'roteiro', nome: 'Roteiro', ic: 'map' },
  { id: 'explorar', nome: 'Explorar', ic: 'compass' },
  { id: 'gastos', nome: 'Gastos', ic: 'wallet' },
  { id: 'viagem', nome: 'Viagem', ic: 'case' },
];
function rota() { const h = location.hash.replace(/^#\/?/, '').split('/'); return { tab: TABS.some((t) => t.id === h[0]) ? h[0] : 'inicio', sub: h[1] || '' }; }
window.addEventListener('hashchange', () => {
  if (!D) return;
  if (location.hash.startsWith('#s=')) { importarHash(location.hash.slice(3)); history.replaceState(null, '', location.pathname + '#/gastos'); }
  fecharSheet(true); render(); window.scrollTo(0, 0);
});

function render() {
  const r = rota();
  const corpo = { inicio: vInicio, roteiro: vRoteiro, explorar: vExplorar, gastos: vGastos, viagem: vViagem }[r.tab](r.sub);
  $('#app').innerHTML = `<main class="wrap view">${corpo}<p class="foot">EUA 2027 · dados cifrados · ${D.geradoEm ? 'atualizado em ' + new Date(D.geradoEm).toLocaleDateString('pt-BR') : ''}</p></main>
  ${r.tab === 'gastos' ? `<button class="btn primary fab" data-a="novoGasto">${ic('plus')}Novo gasto</button>` : ''}
  <nav class="tabs" aria-label="Navegação principal"><div class="in">${TABS.map((t) => `<a href="#/${t.id}" ${t.id === r.tab ? 'aria-current="page"' : ''}>${ic(t.ic)}<span>${t.nome}</span></a>`).join('')}</div></nav>`;
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
  else if (hoje <= D.fim) { const n = diasEntre(D.inicio, hoje) + 1; contador = `<b>Dia ${Math.max(1, n)}</b><span>de 17 da viagem</span>`; }
  else contador = `<b>Valeu!</b><span>viagem concluída</span>`;

  const diaHoje = dias.find((d) => d.data === hoje);
  const proximo = hoje < embarque ? dias[0] : dias.find((d) => d.data > hoje);
  const ck = D.checklist.filter((c) => S.sync.check[c.id]?.v).length;
  const pend = D.checklist.filter((c) => !S.sync.check[c.id]?.v).slice(0, 3);

  const fases = D.fases.map((f) => {
    const ids = D.pessoas.filter((p) => p.de <= f.ate && fimPessoa(p) >= f.de).map((p) => p.id);
    const now = hoje >= f.de && hoje <= f.ate;
    return `<a class="phase ${now ? 'now' : ''}" style="--c:${corFase(f.id)}" href="#/roteiro"><b>${esc(f.nome)}</b><span class="xs num">${ddmm(f.de)} a ${ddmm(f.ate)}</span>${avs(ids, 'xs')}</a>`;
  }).join('');

  return `
  <section class="hero" style="margin-top:8px">
    <div class="sun"></div>
    <div class="between" style="position:relative;z-index:1;align-items:flex-start">
      <div><p class="eyebrow">Abril de 2027</p><h1>${esc(D.titulo)}</h1><p class="lead">${esc(D.subtitulo)}</p></div>
      <button class="iconbtn" data-a="ajustes" aria-label="Ajustes" style="background:rgba(255,255,255,.15);border-color:rgba(255,255,255,.3);color:#fff;box-shadow:none">${S.eu ? av(S.eu, 'sm') : ic('users')}</button>
    </div>
    <div class="count">${contador}</div>
    <div class="crew">${D.pessoas.map((p) => `<button data-a="pessoa" data-id="${p.id}">${av(p.id)}<span>${esc(p.curto)}</span></button>`).join('')}</div>
  </section>

  ${diaHoje ? `<h2 class="sec">Hoje <a class="link" href="#/roteiro">Roteiro completo</a></h2>${cardDia(diaHoje, true)}<div id="clima"></div>` : ''}
  ${!diaHoje && proximo ? `<h2 class="sec">Próximo compromisso</h2>
    <a class="card row" href="#/roteiro" style="--c:${corFase(proximo.fase)}">
      <div class="dayhead" style="margin:0"><div class="date"><small>${semana(proximo.data)}</small><b>${proximo.data.slice(8)}</b></div></div>
      <div class="grow"><h3>${esc(proximo.titulo)}</h3><p class="small mute">${esc(proximo.itens?.[0] ? `${proximo.itens[0].hora} · ${proximo.itens[0].titulo}` : proximo.cidade || '')}</p></div>${ic('chev')}
    </a>` : ''}

  <h2 class="sec">As fases</h2>
  <div class="phases">${fases}</div>

  <h2 class="sec">Pontos de atenção <span class="tag bad">${D.alertas.filter((a) => a.nivel === 'alto').length} importantes</span></h2>
  ${D.alertas.map((a) => `<div class="alert ${a.nivel}"><span class="dot">${ic(a.nivel === 'baixo' ? 'info' : 'alert', 'sm')}</span><div><h3>${esc(a.titulo)}</h3><p>${esc(a.texto)}</p></div></div>`).join('')}

  <h2 class="sec">Pendências <a class="link" href="#/viagem/checklist">Ver todas</a></h2>
  <div class="card">
    <div class="between"><b class="num">${ck} de ${D.checklist.length} concluídas</b><span class="mute small num">${Math.round((ck / D.checklist.length) * 100)}%</span></div>
    <div class="bar" style="margin-top:8px"><i style="width:${(ck / D.checklist.length) * 100}%"></i></div>
    ${pend.map((c) => `<button class="chk" role="checkbox" aria-checked="false" data-a="check" data-id="${c.id}"><span class="box">${ic('check', 'sm')}</span><span class="txt small">${esc(c.texto)}</span></button>`).join('')}
  </div>

  <h2 class="sec">Atalhos</h2>
  <div class="card flat">
    <a class="li" href="#/viagem/docs"><span class="ic">${ic('file')}</span><div class="grow"><h3>Documentos</h3><p class="small mute">Contrato do motorhome, roteiro e passagens</p></div>${ic('chev')}</a>
    <a class="li" href="#/viagem/motorhome"><span class="ic">${ic('rv')}</span><div class="grow"><h3>Motorhome</h3><p class="small mute">Retirada em 14/04, devolução em 24/04</p></div>${ic('chev')}</a>
    <a class="li" href="#/gastos"><span class="ic">${ic('sync')}</span><div class="grow"><h3>Gastos e sincronização</h3><p class="small mute">Quem deve quanto para quem</p></div>${ic('chev')}</a>
    <a class="li" href="${D.drive}" target="_blank" rel="noopener"><span class="ic">${ic('folder')}</span><div class="grow"><h3>Pasta do grupo no Drive</h3><p class="small mute">Onde guardar os comprovantes de todos</p></div>${ic('ext')}</a>
  </div>`;
}
depoisRender.inicio = async () => {
  const el = $('#clima'); if (!el) return;
  const d = diasViagem().find((x) => x.data === isoHoje()); if (!d) return;
  const c = D.cidades.find((x) => x.id === d.cidadeId); if (!c) return;
  try {
    const r = await (await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${c.lat}&longitude=${c.lon}&daily=temperature_2m_max,temperature_2m_min,precipitation_probability_max&timezone=auto&forecast_days=1`)).json();
    el.innerHTML = `<div class="tip" style="margin-top:12px">${ic('temp', 'sm')}<span>Previsão para ${esc(c.nome)}: máxima de <b>${Math.round(r.daily.temperature_2m_max[0])}°</b>, mínima de <b>${Math.round(r.daily.temperature_2m_min[0])}°</b>, chuva ${r.daily.precipitation_probability_max[0] ?? 0}%.</span></div>`;
  } catch { /* sem rede */ }
};

function cardDia(d, compacto = false) {
  const pres = presentes(d.data < D.inicio ? D.inicio : d.data);
  const rv = d.rv;
  const itens = (d.itens || []).map((it) => `
    <div class="tli">
      <div><div class="ic">${ic(ITIPO[it.tipo] || 'spark')}</div></div>
      <div class="bd">
        <div class="between"><span class="hr">${esc(it.hora || '')}</span></div>
        <h3>${esc(it.titulo)}</h3>
        ${it.desc ? `<p>${esc(it.desc)}</p>` : ''}
        ${it.q ? `<div class="acts">${btnIr(it.q)}${btnMapa(it.q)}</div>` : ''}
      </div>
    </div>`).join('');
  const blocoRv = rv ? `
    <div class="card" style="--c:${corFase('rv')}">
      <div class="between"><span class="tag acc">${ic('rv', 'sm')}${rv.milhas} milhas · ${esc(rv.horas)}</span>${d.data !== '2027-04-14' ? '' : '<span class="tag">Dia 1 do motorhome</span>'}</div>
      <ul class="dots">${rv.destaques.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>
      ${rv.rota?.length ? `<div class="stops">${rv.rota.map((s, i) => `<a class="stop" href="${mapsIr(s)}" target="_blank" rel="noopener"><span class="n">${i + 1}</span><span class="grow">${esc(s.split(',')[0])}</span>${ic('nav', 'sm')}</a>`).join('')}</div>
      <div class="acts"><a class="btn sm primary" href="${mapsRota(rv.rota)}" target="_blank" rel="noopener">${ic('map', 'sm')}Abrir rota completa</a></div>` : ''}
      ${rv.camp ? `<div class="divider"></div><div class="row"><span class="ic" style="width:40px;height:40px;border-radius:12px;display:grid;place-items:center;background:var(--surface2)">${ic('tent')}</span><div class="grow"><p class="xs mute">Pernoite</p><h3>${esc(rv.camp.nome)}</h3></div>${btnIr(rv.camp.q)}</div>` : ''}
      ${rv.dica ? `<div class="tip">${ic('bulb', 'sm')}<span>${esc(rv.dica)}</span></div>` : ''}
    </div>` : '';
  return `
  <article class="day" id="d-${d.data}" style="--c:${corFase(d.fase)}">
    <div class="dayhead">
      <div class="date"><small>${semana(d.data)}</small><b>${d.data.slice(8)}</b></div>
      <div class="grow">
        <h3>${esc(d.titulo)}</h3>
        <div class="meta">${d.cidade ? `<span class="tag">${ic('pin', 'sm')}${esc(d.cidade)}</span>` : ''}${d.clima ? `<span class="tag">${ic('temp', 'sm')}${esc(d.clima)}</span>` : ''}${d.pernoite && !rv ? `<span class="tag">${ic('bed', 'sm')}${esc(d.pernoite)}</span>` : ''}</div>
        ${compacto ? '' : `<div class="row" style="margin-top:8px;gap:8px">${avs(pres, 'xs')}<span class="xs mute">${pres.length} no grupo</span></div>`}
      </div>
    </div>
    ${itens ? `<div class="tl">${itens}</div>` : ''}
    ${blocoRv}
  </article>`;
}

// ------------------------------------------------------------------ ROTEIRO
function vRoteiro(sub) {
  const aba = sub || 'dias';
  const seg = `<div class="seg" role="tablist">${[['dias', 'Dia a dia'], ['motorhome', 'Motorhome'], ['alternativas', 'Alternativas']].map(([k, n]) => `<button role="tab" aria-selected="${aba === k}" data-a="go" data-h="#/roteiro/${k}">${n}</button>`).join('')}</div>`;
  if (aba === 'motorhome') return `<div class="pagehead"><div><p class="eyebrow">14 a 24 de abril</p><h1 class="title">Roteiros do motorhome</h1><p class="sub">Todos voltam a Las Vegas em 20/04 para o voo do Victor.</p></div></div>${seg}${vOpcoesRv()}`;
  if (aba === 'alternativas') return `<div class="pagehead"><div><p class="eyebrow">Plano B, C e D</p><h1 class="title">Alternativas</h1><p class="sub">Outras formas de viver LA, a estrada e Vegas.</p></div></div>${seg}${vAlternativas()}`;
  const dias = diasViagem();
  const hoje = isoHoje();
  const r = D.roteiros.find((x) => x.id === rotaAtual());
  return `
  <div class="pagehead"><div><p class="eyebrow">09 a 26 de abril</p><h1 class="title">Roteiro</h1><p class="sub">Motorhome: opção ${r.id}, ${esc(r.nome)}. <a href="#/roteiro/motorhome" style="color:var(--acc-text);font-weight:700">Trocar</a></p></div></div>
  ${seg}
  <div class="datepills"><div class="chips">${dias.map((d) => `<button class="dp ${d.data === hoje ? 'today' : ''}" style="--c:${corFase(d.fase)}" data-a="irDia" data-id="${d.data}"><small>${semana(d.data)}</small><b>${d.data.slice(8)}</b></button>`).join('')}</div></div>
  ${dias.map((d) => cardDia(d)).join('')}`;
}
depoisRender.roteiro = (sub) => {
  if (sub && sub !== 'dias') return;
  const h = isoHoje(); const el = document.getElementById('d-' + h);
  if (el && !S.ui.rolouHoje) { S.ui.rolouHoje = true; setTimeout(() => el.scrollIntoView({ block: 'start' }), 100); }
};

function vOpcoesRv() {
  const atual = rotaAtual();
  return D.roteiros.map((r) => `
    <article class="card" style="--c:${corFase('rv')};${r.id === atual ? 'border-color:var(--acc);box-shadow:0 0 0 1px var(--acc),var(--shadow)' : ''}">
      <div class="between"><span class="tag acc">Opção ${r.id} · ${esc(r.selo)}</span><span class="small mute num">${esc(r.milhas)}</span></div>
      <h3 style="font-size:18px;margin-top:8px">${esc(r.nome)}</h3>
      <p class="small" style="color:var(--ink2);margin-top:4px">${esc(r.resumo)}</p>
      <div style="margin-top:12px">${r.dias.map((d) => `<div class="li" style="min-height:44px;padding:8px 0"><span class="num small" style="width:56px;font-weight:800;color:var(--acc-text)">${semana(d.data)} ${ddmm(d.data)}</span><span class="grow small">${esc(d.titulo)}</span><span class="xs mute num">${d.milhas} mi</span></div>`).join('')}</div>
      <div class="btnrow">${r.id === atual ? `<span class="btn soft">${ic('check')}Roteiro escolhido</span>` : `<button class="btn primary" data-a="usarRota" data-id="${r.id}">Usar este roteiro</button>`}</div>
    </article>`).join('') + `
    <div class="tip" style="margin-top:16px">${ic('info', 'sm')}<span>A escolha entra no link de sincronização: quando alguém trocar, todos recebem ao importar. O guia original em PDF está em Viagem › Documentos.</span></div>`;
}

function vAlternativas() {
  const nomes = { la: 'Los Angeles', estrada: 'Estrada LA → Vegas', lv: 'Las Vegas' };
  const grupos = ['la', 'estrada', 'lv'].map((f) => `
    <h2 class="sec">${nomes[f]}</h2>
    ${D.alternativas.filter((a) => a.fase === f).map((a) => `
      <article class="card" style="--c:${corFase(f === 'estrada' ? 'lv' : f)}">
        <h3>${esc(a.titulo)}</h3><p class="small" style="color:var(--ink2);margin-top:4px">${esc(a.resumo)}</p>
        <div class="stops">${a.itens.map(([n, q], i) => `<a class="stop" href="${mapsIr(q)}" target="_blank" rel="noopener"><span class="n">${i + 1}</span><span class="grow">${esc(n)}</span>${ic('nav', 'sm')}</a>`).join('')}</div>
        ${a.itens.length > 1 ? `<div class="acts"><a class="btn sm" href="${mapsRota(a.itens.map((x) => x[1]))}" target="_blank" rel="noopener">${ic('map', 'sm')}Rota com todas as paradas</a></div>` : ''}
      </article>`).join('')}`).join('');
  return grupos + `
    <h2 class="sec">Eventos para checar</h2>
    ${D.eventos.map((e) => `<article class="card"><div class="row top"><span class="ic" style="width:44px;height:44px;border-radius:14px;display:grid;place-items:center;background:var(--acc-soft);color:var(--acc-text)">${ic('ticket')}</span><div class="grow"><h3>${esc(e.titulo)}</h3><p class="small mute">${esc(e.quando)} · ${esc(e.onde)}</p><div class="acts"><a class="btn sm" href="${e.link}" target="_blank" rel="noopener">${ic('ext', 'sm')}Agenda</a>${btnMapa(e.q)}</div></div></div></article>`).join('')}`;
}

// ------------------------------------------------------------------ EXPLORAR
const F = { cidade: 'todas', cat: 'todas', q: '', animados: false, votados: false };
function votosDe(lid) { return D.pessoas.filter((p) => S.sync.votos[`${lid}|${p.id}`]?.v).map((p) => p.id); }
function filtrarLugares() {
  const q = slug(F.q).replace(/-/g, ' ');
  let l = D.lugares.filter((x) => (F.cidade === 'todas' || x.cidade === F.cidade) && (F.cat === 'todas' || x.cat === F.cat) && (!F.animados || x.energia >= 3) && (!q || slug(`${x.nome} ${x.desc} ${x.dica} ${x.cat}`).replace(/-/g, ' ').includes(q)));
  if (F.votados) l = l.filter((x) => votosDe(x.id).length).sort((a, b) => votosDe(b.id).length - votosDe(a.id).length);
  return l;
}
function cardLugar(x) {
  const v = votosDe(x.id);
  const meu = S.eu && v.includes(S.eu);
  const cid = D.cidades.find((c) => c.id === x.cidade);
  const cat = D.categorias.find((c) => c.id === x.cat);
  return `<article class="card place">
    <div class="top"><span class="ic">${ic(ICAT[x.cat] || 'pin')}</span>
      <div class="grow"><h3>${esc(x.nome)}</h3>
        <div class="meta"><span class="tag">${esc(cat?.nome || x.cat)}</span>${F.cidade === 'todas' ? `<span class="tag">${esc(cid?.nome || '')}</span>` : ''}${x.preco ? `<span class="tag num">${esc(x.preco)}</span>` : ''}${flames(x.energia)}</div>
      </div></div>
    <p>${esc(x.desc)}</p>
    ${x.dica ? `<div class="tip">${ic('bulb', 'sm')}<span>${esc(x.dica)}</span></div>` : ''}
    <div class="acts" style="align-items:center">${btnIr(x.q)}${btnMapa(x.q)}<button class="btn sm vote" aria-pressed="${meu}" data-a="votar" data-id="${x.id}">${ic('heart', 'sm')}${meu ? 'Quero ir' : 'Quero ir'}</button>${v.length ? avs(v, 'xs') : ''}</div>
  </article>`;
}
function vExplorar() {
  const cidades = [{ id: 'todas', nome: 'Todas' }, ...D.cidades];
  const cats = [{ id: 'todas', nome: 'Tudo' }, ...D.categorias];
  return `
  <div class="pagehead"><div><p class="eyebrow">${D.lugares.length} lugares</p><h1 class="title">Explorar</h1><p class="sub">Bares, baladas, restaurantes e passeios. Toque em “Ir” para abrir o GPS.</p></div></div>
  <label class="search">${ic('search')}<span class="sr">Buscar</span><input id="busca" type="search" placeholder="Buscar: rooftop, pizza, trilha…" value="${esc(F.q)}" autocomplete="off"></label>
  <div class="chips" style="margin-top:12px">${cidades.map((c) => `<button class="chip" aria-pressed="${F.cidade === c.id}" data-a="fCidade" data-id="${c.id}">${esc(c.nome)}</button>`).join('')}</div>
  <div class="chips" style="margin-top:4px">${cats.map((c) => `<button class="chip" aria-pressed="${F.cat === c.id}" data-a="fCat" data-id="${c.id}">${c.id !== 'todas' ? ic(ICAT[c.id], 'sm') : ''}${esc(c.nome)}</button>`).join('')}</div>
  <div class="chips" style="margin-top:4px"><button class="chip" aria-pressed="${F.animados}" data-a="fAnimados">${ic('flame', 'sm')}Só os mais animados</button><button class="chip" aria-pressed="${F.votados}" data-a="fVotados">${ic('heart', 'sm')}Favoritos do grupo</button></div>
  <div id="lista" class="stack" style="margin-top:16px">${listaLugares()}</div>`;
}
function listaLugares() {
  const l = filtrarLugares();
  if (!l.length) return `<div class="empty">${ic('compass')}<p>Nada com esses filtros.${F.votados ? ' Marquem “Quero ir” nos lugares para montar a lista do grupo.' : ''}</p></div>`;
  return l.map(cardLugar).join('');
}
depoisRender.explorar = () => {
  const i = $('#busca');
  i?.addEventListener('input', () => { F.q = i.value; clearTimeout(i.t); i.t = setTimeout(() => { $('#lista').innerHTML = listaLugares(); }, 150); });
};

// ------------------------------------------------------------------ GASTOS
const marcoZero = () => Math.max(Date.parse(D.gastosZeradosEm || '') || 0, conf('gastosDesde', 0));
const gastosAtivos = () => Object.values(S.sync.gastos).filter((g) => !g.del && (g.ts || 0) >= marcoZero()).sort((a, b) => (b.data || '').localeCompare(a.data || '') || (b.ts || 0) - (a.ts || 0));
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
  const out = [];
  let i = 0, j = 0;
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
  const gs = gastosAtivos();
  const s = saldos();
  const total = gs.reduce((a, g) => a + emUSD(g), 0);
  const eu = S.eu && s[S.eu];
  const ac = acertos(s);
  const porData = {};
  for (const g of gs) (porData[g.data || 'sem data'] ||= []).push(g);
  return `
  <div class="pagehead"><div><p class="eyebrow">Divisão de despesas</p><h1 class="title">Gastos</h1><p class="sub">Câmbio usado: <button data-a="cambio" style="color:var(--acc-text);font-weight:700">US$ 1 = ${brl(S.cambio)}</button></p></div></div>
  <div class="kpis">
    <div class="kpi"><span class="xs">Total do grupo</span><b>${usd(total)}</b><span class="small mute num">${brl(total * S.cambio)}</span></div>
    <div class="kpi"><span class="xs">${eu ? 'Seu saldo' : 'Quem é você?'}</span>${eu ? `<b class="${eu.saldo >= 0 ? 'amt pos' : 'amt neg'}" style="text-align:left">${eu.saldo >= 0 ? '+' : '−'}${usd(Math.abs(eu.saldo)).replace('US$ ', 'US$ ')}</b><span class="small mute">${eu.saldo >= 0 ? 'a receber' : 'a pagar'}</span>` : `<button class="btn sm soft" data-a="escolherEu" style="margin-top:6px">Escolher</button>`}</div>
  </div>

  <div class="btnrow">
    <button class="btn" data-a="sincronizar">${ic('share', 'sm')}Enviar ao grupo</button>
    <button class="btn" data-a="importar">${ic('sync', 'sm')}Importar</button>
    <button class="btn" data-a="ferramentas">${ic('dice', 'sm')}Ferramentas</button>
  </div>

  <h2 class="sec">Saldos</h2>
  <div class="card">${D.pessoas.map((p) => { const x = s[p.id]; return `<div class="bal">${av(p.id)}<div class="grow"><h3>${esc(p.curto)}</h3><p class="xs mute num">pagou ${usd(x.pagou)} · parte ${usd(x.deve)}</p></div><div><div class="amt ${x.saldo >= 0.005 ? 'pos' : x.saldo <= -0.005 ? 'neg' : ''}">${x.saldo >= 0.005 ? '+' : x.saldo <= -0.005 ? '−' : ''}${usd(Math.abs(x.saldo))}</div><div class="xs mute num" style="text-align:right">${brl(Math.abs(x.saldo) * S.cambio)}</div></div></div>`; }).join('')}</div>

  <h2 class="sec">Acertos sugeridos <button class="link" data-a="pix" style="font-size:14px;font-weight:700;color:var(--acc-text)">Chaves Pix</button></h2>
  ${ac.length ? `<div class="card">${ac.map((a) => { const pix = S.sync.pix[a.para]?.v; return `<div class="bal">${av(a.de, 'sm')}${ic('chev', 'sm')}${av(a.para, 'sm')}<div class="grow"><p class="small"><b>${esc(pessoa(a.de).curto)}</b> paga <b>${esc(pessoa(a.para).curto)}</b></p>${pix ? `<button class="xs" data-a="copiar" data-v="${esc(pix)}" style="color:var(--acc-text);font-weight:700">${ic('copy', 'sm')} Pix: ${esc(pix)}</button>` : ''}</div><div><div class="amt">${usd(a.v)}</div><button class="xs mute num" data-a="copiar" data-v="${(a.v * S.cambio).toFixed(2).replace('.', ',')}" style="text-align:right;display:block">${brl(a.v * S.cambio)}</button></div></div>`; }).join('')}</div>
  <p class="xs mute" style="margin-top:8px">O número mínimo de transferências para zerar tudo. Toque no valor em reais para copiar.</p>` : `<div class="card empty">${ic('check')}<p>Tudo acertado por enquanto.</p></div>`}

  <h2 class="sec">Lançamentos <span class="small mute num">${gs.length}</span></h2>
  ${gs.length ? Object.entries(porData).map(([data, l]) => `<p class="xs mute" style="margin:16px 0 4px;font-weight:700;text-transform:uppercase;letter-spacing:.06em">${data === 'sem data' ? data : `${semana(data)}, ${ddmm(data)}`}</p><div class="card" style="padding:4px 16px">${l.map((g) => { const c = CATG.find((x) => x.id === g.cat) || CATG[8]; const parts = Object.keys(g.pesos || {}).filter((k) => g.pesos[k] > 0); return `<button class="exp" data-a="editarGasto" data-id="${g.id}"><span class="ic">${ic(c.ic)}</span><div class="grow"><h3 style="font-size:15px">${esc(g.desc)}</h3><p class="xs mute">${esc(pessoa(g.pagou)?.curto || '?')} pagou · ${parts.length === D.pessoas.length ? 'todos' : parts.map((k) => pessoa(k)?.curto).join(', ')}</p></div><div><div class="amt">${g.moeda === 'BRL' ? brl(g.valor) : usd(g.valor)}</div>${g.moeda === 'BRL' ? `<div class="xs mute num" style="text-align:right">${usd(emUSD(g))}</div>` : ''}</div></button>`; }).join('')}</div>`).join('') : `<div class="card empty">${ic('wallet')}<p>Nenhum gasto ainda.</p></div>`}

  <div class="tip" style="margin-top:20px">${ic('info', 'sm')}<span>Cada celular guarda os próprios lançamentos. Depois de lançar, toque em “Enviar ao grupo” e mande o link no WhatsApp: quem abrir recebe tudo mesclado, sem duplicar. Prefere outro app? Splitwise e Tricount fazem o mesmo; dá para exportar a planilha em Ferramentas.</span></div>`;
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
      <label class="f"><span>Data</span><input class="inp" type="date" name="data" value="${esc(g.data)}"></label>
      <div class="f" style="margin-top:14px"><span class="xs mute" style="font-weight:700;display:block;margin-bottom:6px">Quem pagou</span><div class="pick" data-g="pagou">${D.pessoas.map((p) => `<button type="button" aria-pressed="${g.pagou === p.id}" data-id="${p.id}">${av(p.id, 'sm')}${esc(p.curto)}</button>`).join('')}</div></div>
      <div class="f" style="margin-top:14px"><span class="xs mute" style="font-weight:700;display:block;margin-bottom:6px">Dividir entre</span><div class="pick" data-g="pesos">${D.pessoas.map((p) => `<button type="button" aria-pressed="${(g.pesos?.[p.id] || 0) > 0}" data-id="${p.id}">${av(p.id, 'sm')}${esc(p.curto)}</button>`).join('')}</div>
        <details style="margin-top:8px"><summary class="small" style="cursor:pointer;color:var(--acc-text);font-weight:700;min-height:32px">Dividir com pesos diferentes</summary>
          <div class="row" style="flex-wrap:wrap;margin-top:8px">${D.pessoas.map((p) => `<label class="small" style="display:flex;align-items:center;gap:6px">${esc(p.curto)}<input class="inp num" style="width:72px;min-height:40px" inputmode="decimal" data-peso="${p.id}" value="${String(g.pesos?.[p.id] ?? 0).replace('.', ',')}"></label>`).join('')}</div>
          <p class="xs mute" style="margin-top:6px">Ex.: 1 para cada um e 0,7 para quem ficou só 7 de 10 noites.</p></details></div>
      <div class="f" style="margin-top:14px"><span class="xs mute" style="font-weight:700;display:block;margin-bottom:6px">Categoria</span><div class="pick" data-g="cat">${CATG.map((c) => `<button type="button" class="noav" aria-pressed="${g.cat === c.id}" data-id="${c.id}">${ic(c.ic, 'sm')}${c.nome}</button>`).join('')}</div></div>
      <label class="f"><span>Observação (opcional)</span><input class="inp" name="nota" maxlength="140" value="${esc(g.nota || '')}"></label>
      <p class="err small" style="color:var(--bad);min-height:21px;margin-top:8px" role="alert"></p>
      <button class="btn primary block" type="submit" style="margin-top:4px">${ic('check')}${novo ? 'Lançar' : 'Salvar'}</button>
      ${novo ? '' : `<button class="btn danger block" type="button" data-a="apagarGasto" data-id="${g.id}" style="margin-top:8px">${ic('trash')}Apagar</button>`}
    </form>`);
  let moeda = g.moeda;
  const pes = { ...(g.pesos || {}) };
  sh.querySelectorAll('[data-m]').forEach((b) => b.addEventListener('click', () => { moeda = b.dataset.m; sh.querySelectorAll('[data-m]').forEach((x) => x.setAttribute('aria-selected', x === b)); }));
  sh.querySelectorAll('.pick').forEach((grp) => grp.addEventListener('click', (e) => {
    const b = e.target.closest('button'); if (!b) return;
    if (grp.dataset.g === 'pesos') {
      const on = b.getAttribute('aria-pressed') !== 'true'; b.setAttribute('aria-pressed', on); pes[b.dataset.id] = on ? 1 : 0;
      const inp = sh.querySelector(`[data-peso="${b.dataset.id}"]`); if (inp) inp.value = on ? '1' : '0';
    } else grp.querySelectorAll('button').forEach((x) => x.setAttribute('aria-pressed', x === b));
  }));
  sh.querySelectorAll('[data-peso]').forEach((i) => i.addEventListener('change', () => { pes[i.dataset.peso] = numero(i.value); sh.querySelector(`[data-g="pesos"] [data-id="${i.dataset.peso}"]`).setAttribute('aria-pressed', pes[i.dataset.peso] > 0); }));
  sh.querySelector('input[name="data"]').addEventListener('change', (e) => {
    if (!novo) return;
    const pr = presentes(e.target.value);
    D.pessoas.forEach((p) => { pes[p.id] = pr.includes(p.id) ? 1 : 0; sh.querySelector(`[data-g="pesos"] [data-id="${p.id}"]`).setAttribute('aria-pressed', pes[p.id] > 0); const inp = sh.querySelector(`[data-peso="${p.id}"]`); if (inp) inp.value = String(pes[p.id]); });
  });
  sh.querySelector('#fg').addEventListener('submit', (e) => {
    e.preventDefault();
    const f = new FormData(e.target);
    const valor = numero(f.get('valor'));
    const err = sh.querySelector('.err');
    if (!(valor > 0)) { err.textContent = 'Informe um valor maior que zero.'; sh.querySelector('[name="valor"]').focus(); return; }
    if (!Object.values(pes).some((w) => w > 0)) { err.textContent = 'Escolha pelo menos uma pessoa para dividir.'; return; }
    const pagou = sh.querySelector('[data-g="pagou"] [aria-pressed="true"]')?.dataset.id;
    const cat = sh.querySelector('[data-g="cat"] [aria-pressed="true"]')?.dataset.id || 'outros';
    S.sync.gastos[g.id] = { ...g, desc: String(f.get('desc')).trim(), valor, moeda, data: f.get('data'), pagou, cat, pesos: pes, nota: String(f.get('nota') || '').trim(), cambio: moeda === 'BRL' ? (g.cambio || S.cambio) : undefined, ts: Date.now(), por: S.eu || '' };
    salvar(); fecharSheet(); render(); toast(novo ? 'Gasto lançado. Lembre de enviar ao grupo.' : 'Gasto atualizado.');
    navigator.vibrate?.(15);
  });
}

async function linkSync() {
  const payload = { v: 1, de: S.eu || '', em: Date.now(), col: S.sync };
  const z = await comprimir(new TextEncoder().encode(JSON.stringify(payload)));
  return `${location.origin}${location.pathname}#s=${b64.url(await lacrar(z))}`;
}
async function importarHash(codigo) {
  try {
    const bruto = await deslacrar(b64.deUrl(codigo.trim().replace(/^.*#s=/, '')));
    const p = JSON.parse(new TextDecoder().decode(await descomprimir(bruto)));
    const n = mesclar(p.col);
    toast(n ? `Sincronizado com ${pessoa(p.de)?.curto || 'o grupo'}: ${n} atualizaç${n === 1 ? 'ão' : 'ões'}.` : 'Você já estava em dia.');
    render();
  } catch { toast('Código de sincronização inválido.'); }
}

// ------------------------------------------------------------------ VIAGEM (documentos, voos, hotéis, motorhome, checklist, info)
const SUBS = [['docs', 'Documentos', 'file'], ['voos', 'Passagens', 'plane'], ['hoteis', 'Hotéis', 'bed'], ['motorhome', 'Motorhome', 'rv'], ['checklist', 'Checklist', 'list'], ['info', 'Info', 'info']];
function vViagem(sub) {
  const a = SUBS.some((s) => s[0] === sub) ? sub : 'docs';
  const corpo = { docs: vDocs, voos: vVoos, hoteis: vHoteis, motorhome: vMotorhome, checklist: vChecklist, info: vInfo }[a]();
  return `<div class="pagehead"><div><p class="eyebrow">Central da viagem</p><h1 class="title">${SUBS.find((s) => s[0] === a)[1]}</h1></div></div>
  <div class="chips">${SUBS.map(([k, n, i]) => `<a class="chip" aria-pressed="${a === k}" href="#/viagem/${k}">${ic(i, 'sm')}${n}</a>`).join('')}</div>
  <div style="margin-top:16px">${corpo}</div>`;
}
const tam = (b) => (b > 1048576 ? (b / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(b / 1024)) + ' KB');
function linhaDoc(d) {
  return `<div class="li"><span class="ic">${ic(d.tipo.startsWith('image') ? 'img' : 'file')}</span><div class="grow"><h3 style="font-size:15px">${esc(d.titulo)}</h3><p class="xs mute">${esc(d.desc || '')} ${d.tamanho ? '· ' + tam(d.tamanho) : ''}</p></div><button class="iconbtn" data-a="abrirDoc" data-id="${d.id}" aria-label="Abrir ${esc(d.titulo)}">${ic('down')}</button></div>`;
}
function linhaArq(a) {
  const kind = { hotel: 'Hotel', voo: 'Passagem', doc: 'Documento' }[a.kind] || 'Arquivo';
  return `<div class="li"><span class="ic">${ic(a.tipo?.startsWith('image') ? 'img' : 'file')}</span><div class="grow"><h3 style="font-size:15px">${esc(a.titulo)}</h3><p class="xs mute">${kind}${a.pessoa ? ' · ' + esc(pessoa(a.pessoa)?.curto || '') : ''} · ${tam(a.tamanho || 0)} · neste aparelho</p></div><button class="iconbtn" data-a="abrirArq" data-id="${a.id}" aria-label="Abrir">${ic('down')}</button><button class="iconbtn" data-a="compartilharArq" data-id="${a.id}" aria-label="Compartilhar">${ic('share')}</button></div>`;
}
function vDocs() {
  const mot = D.docs.filter((d) => d.cat === 'motorhome');
  const voo = D.docs.filter((d) => d.cat === 'voo');
  const meus = ARQ.filter((a) => a.kind === 'doc');
  return `
  <h2 class="sec" style="margin-top:8px">Motorhome</h2><div class="card" style="padding:4px 16px">${mot.map(linhaDoc).join('')}</div>
  <h2 class="sec">Passagens enviadas</h2><div class="card" style="padding:4px 16px">${voo.map(linhaDoc).join('')}</div>
  <h2 class="sec">Arquivos deste aparelho <button class="link" data-a="upload" data-kind="doc" style="font-size:14px;font-weight:700;color:var(--acc-text)">${ic('up', 'sm')} Adicionar</button></h2>
  ${meus.length ? `<div class="card" style="padding:4px 16px">${meus.map(linhaArq).join('')}</div>` : `<div class="card empty">${ic('up')}<p>Seguro-viagem, vistos, ingressos: guarde aqui para abrir mesmo sem internet.</p><button class="btn soft" data-a="upload" data-kind="doc" style="margin-top:12px">${ic('up', 'sm')}Adicionar arquivo</button></div>`}
  <a class="card row" href="${D.drive}" target="_blank" rel="noopener" style="margin-top:16px"><span class="ic" style="width:44px;height:44px;border-radius:14px;display:grid;place-items:center;background:var(--acc-soft);color:var(--acc-text)">${ic('folder')}</span><div class="grow"><h3>Pasta compartilhada no Drive</h3><p class="small mute">Os arquivos adicionados aqui ficam só neste celular. Para todos verem, enviem também para a pasta.</p></div>${ic('ext')}</a>`;
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
      <div class="between"><span>${avs(v.pessoas || [], 'xs')}</span>${v.localizador ? `<button class="tag acc" data-a="copiar" data-v="${esc(v.localizador.split(' ')[0])}">${ic('copy', 'sm')}${esc(v.localizador)}</button>` : ''}</div>
      ${v.obs ? `<p style="margin-top:8px">${esc(v.obs)}</p>` : ''}
      <div class="acts">${v.doc ? `<button class="btn sm" data-a="abrirDoc" data-id="${v.doc}">${ic('ticket', 'sm')}Bilhete</button>` : ''}${v.manual ? `<button class="btn sm danger" data-a="apagarVoo" data-id="${v.id}">${ic('trash', 'sm')}Remover</button>` : ''}</div>
    </div>
  </article>`;
}
function vVoos() {
  const extras = Object.values(S.sync.voos).filter((v) => !v.del).map((v) => ({ ...v, manual: true }));
  const todos = [...D.voos, ...extras];
  const meus = ARQ.filter((a) => a.kind === 'voo');
  return D.pessoas.map((p) => {
    const ida = todos.filter((v) => v.pessoas.includes(p.id) && v.grupo === 'ida').sort((a, b) => a.saida.localeCompare(b.saida));
    const volta = todos.filter((v) => v.pessoas.includes(p.id) && v.grupo === 'volta').sort((a, b) => a.saida.localeCompare(b.saida));
    const pendente = (grupo, lista) => D.voosPendentes.filter((x) => x.pessoa === p.id && (x.grupo || 'volta') === grupo && !lista.length)
      .map((x) => `<div class="alert medio"><span class="dot">${ic('alert', 'sm')}</span><div class="grow"><h3>Pendente</h3><p>${esc(x.texto)}</p><button class="btn sm soft" data-a="novoVoo" data-p="${p.id}" data-g="${grupo}" style="margin-top:8px">${ic('plus', 'sm')}Cadastrar voo</button></div></div>`).join('');
    const vazio = (grupo, lista, pend) => (lista.length || pend ? '' : '<p class="small mute">Sem voos cadastrados.</p>');
    const pIda = pendente('ida', ida), pVolta = pendente('volta', volta);
    return `<section style="margin-top:24px">
      <div class="row">${av(p.id, 'lg')}<div class="grow"><h2 style="font-size:20px;font-weight:800">${esc(p.nome)}</h2><p class="small mute">${esc(p.papel)}</p></div></div>
      <p class="eyebrow" style="margin:16px 0 8px">Ida</p>${ida.map(cardVoo).join('')}${pIda}${vazio('ida', ida, pIda)}
      <p class="eyebrow" style="margin:16px 0 8px">Volta</p>${volta.map(cardVoo).join('')}${pVolta}${vazio('volta', volta, pVolta)}
    </section>`;
  }).join('') + `
  <h2 class="sec">Bilhetes deste aparelho <button class="link" data-a="upload" data-kind="voo" style="font-size:14px;font-weight:700;color:var(--acc-text)">${ic('up', 'sm')} Adicionar</button></h2>
  ${meus.length ? `<div class="card" style="padding:4px 16px">${meus.map(linhaArq).join('')}</div>` : `<div class="card empty">${ic('ticket')}<p>Salve aqui o cartão de embarque e o e-ticket de cada um.</p></div>`}
  <div class="btnrow"><button class="btn" data-a="novoVoo">${ic('plus', 'sm')}Cadastrar outro voo</button></div>`;
}
function formVoo(pid, grupoIni = 'volta') {
  abrirSheet('Cadastrar voo', `<form id="fv">
    <div class="f" style="margin-top:8px"><span class="xs mute" style="font-weight:700;display:block;margin-bottom:6px">Passageiros</span><div class="pick" data-g="pes">${D.pessoas.map((p) => `<button type="button" aria-pressed="${p.id === pid}" data-id="${p.id}">${av(p.id, 'sm')}${esc(p.curto)}</button>`).join('')}</div></div>
    <div class="seg" style="margin-top:14px" role="radiogroup"><button type="button" role="radio" aria-selected="${grupoIni === 'ida'}" data-gr="ida">Ida</button><button type="button" role="radio" aria-selected="${grupoIni === 'volta'}" data-gr="volta">Volta</button></div>
    <div class="row"><label class="f grow"><span>Companhia</span><input class="inp" name="cia" required placeholder="American Airlines"></label><label class="f" style="width:120px"><span>Voo</span><input class="inp" name="numero" required placeholder="AA 1234"></label></div>
    <div class="row"><label class="f grow"><span>De (IATA)</span><input class="inp" name="de" required maxlength="3" placeholder="LAS" style="text-transform:uppercase"></label><label class="f grow"><span>Para (IATA)</span><input class="inp" name="para" required maxlength="3" placeholder="MIA" style="text-transform:uppercase"></label></div>
    <label class="f"><span>Saída (horário local)</span><input class="inp" type="datetime-local" name="saida" required value="${grupoIni === 'ida' ? '2027-04-09T22:00' : '2027-04-24T12:00'}"></label>
    <label class="f"><span>Chegada (horário local)</span><input class="inp" type="datetime-local" name="chegada"></label>
    <label class="f"><span>Localizador</span><input class="inp" name="localizador" style="text-transform:uppercase"></label>
    <label class="f"><span>Observação</span><input class="inp" name="obs"></label>
    <button class="btn primary block" style="margin-top:16px">${ic('check')}Salvar e sincronizar</button></form>`, (sh) => {
    let grupo = grupoIni;
    sh.querySelectorAll('[data-gr]').forEach((b) => b.addEventListener('click', () => { grupo = b.dataset.gr; sh.querySelectorAll('[data-gr]').forEach((x) => x.setAttribute('aria-selected', x === b)); }));
    sh.querySelector('[data-g="pes"]').addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) b.setAttribute('aria-pressed', b.getAttribute('aria-pressed') !== 'true'); });
    sh.querySelector('#fv').addEventListener('submit', (e) => {
      e.preventDefault();
      const f = new FormData(e.target);
      const pessoas = [...sh.querySelectorAll('[data-g="pes"] [aria-pressed="true"]')].map((b) => b.dataset.id);
      if (!pessoas.length) { toast('Escolha ao menos um passageiro.'); return; }
      const id = 'v-' + uid();
      S.sync.voos[id] = { id, grupo, pessoas, cia: f.get('cia'), numero: String(f.get('numero')).toUpperCase(), de: String(f.get('de')).toUpperCase(), para: String(f.get('para')).toUpperCase(), saida: f.get('saida'), chegada: f.get('chegada') || '', localizador: String(f.get('localizador') || '').toUpperCase(), obs: f.get('obs') || '', ts: Date.now(), por: S.eu || '' };
      salvar(); fecharSheet(); render(); toast('Voo salvo. Envie ao grupo pela aba Gastos.');
    });
  });
}

function vHoteis() {
  return D.hoteis.map((h) => {
    const r = S.sync.hoteis[h.id];
    const reservado = r && !r.del && r.nome;
    const comp = ARQ.filter((a) => a.kind === 'hotel' && a.ref === h.id);
    const noites = diasEntre(h.checkin, h.checkout);
    return `<section style="margin-top:8px;margin-bottom:28px">
      <div class="between"><div><p class="eyebrow">${semana(h.checkin)} ${ddmm(h.checkin)} → ${semana(h.checkout)} ${ddmm(h.checkout)} · ${noites} ${noites === 1 ? 'noite' : 'noites'}</p><h2 style="font-size:20px;font-weight:800">${esc(h.titulo)}</h2></div>${avs(h.hospedes, 'xs')}</div>
      <div class="card" style="margin-top:12px">
        ${reservado ? `<div class="row top"><span class="tag ok">${ic('check', 'sm')}Reservado</span></div><h3 style="margin-top:8px;font-size:18px">${esc(r.nome)}</h3>${r.endereco ? `<p class="small mute">${esc(r.endereco)}</p>` : ''}${r.codigo ? `<button class="tag acc" style="margin-top:8px" data-a="copiar" data-v="${esc(r.codigo)}">${ic('copy', 'sm')}Código ${esc(r.codigo)}</button>` : ''}${r.valor ? `<p class="small" style="margin-top:6px">Valor: <b>${esc(r.valor)}</b></p>` : ''}${r.obs ? `<p class="small mute" style="margin-top:4px">${esc(r.obs)}</p>` : ''}
          <div class="acts">${btnIr(r.endereco || r.nome)}<button class="btn sm" data-a="reservaHotel" data-id="${h.id}">Editar</button></div>`
        : `<div class="row top"><span class="tag warn">${ic('alert', 'sm')}A reservar</span></div><p class="small" style="margin-top:8px;color:var(--ink2)">${esc(h.nota)}</p><div class="acts"><button class="btn sm primary" data-a="reservaHotel" data-id="${h.id}">${ic('check', 'sm')}Registrar reserva</button></div>`}
        <div class="divider"></div>
        <div class="between"><h3 style="font-size:15px">Comprovantes</h3><button class="btn sm soft" data-a="upload" data-kind="hotel" data-ref="${h.id}">${ic('up', 'sm')}Anexar</button></div>
        ${comp.length ? comp.map(linhaArq).join('') : '<p class="xs mute" style="margin-top:6px">PDF ou print da confirmação. Fica salvo neste aparelho.</p>'}
      </div>
      <p class="eyebrow" style="margin:16px 0 8px">Sugestões com preço real (Booking.com)</p>
      ${h.sugestoes.map((s) => `<article class="card"><div class="between"><h3>${esc(s.nome)}</h3><span class="tag ${s.nota >= 9 ? 'ok' : ''} num">${s.nota.toFixed(1).replace('.', ',')}</span></div><p class="small mute">${'★'.repeat(s.estrelas)} · ${esc(s.destaque)}</p><div class="between" style="margin-top:8px"><b class="num">${esc(s.preco)}</b><span class="xs mute">total no período</span></div><div class="acts"><a class="btn sm primary" href="${s.url}" target="_blank" rel="noopener">${ic('ext', 'sm')}Ver no Booking</a>${btnMapa(s.q)}</div></article>`).join('')}
    </section>`;
  }).join('') + `<div class="tip">${ic('info', 'sm')}<span>Preços consultados em 26/11/2026, para conferência. A reserva é feita no próprio Booking.com (o app não guarda dados de cartão).</span></div>`;
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
      const sug = h.sugestoes.find((s) => s.nome === f.nome);
      if (!f.endereco && sug) f.endereco = sug.q;
      S.sync.hoteis[id] = { ...f, ts: Date.now(), por: S.eu || '' }; salvar(); fecharSheet(); render(); toast('Reserva salva. Envie ao grupo pela aba Gastos.');
    });
  });
}

function vMotorhome() {
  const m = D.motorhome;
  const ponto = (t, x) => `<article class="card"><p class="eyebrow">${t}</p><h3 style="font-size:20px;margin-top:4px">${semana(x.data)}, ${ddmm(x.data)} · ${esc(x.janela)}</h3><p class="small mute">${esc(x.endereco)}</p><div class="acts">${btnIr(x.endereco)}<a class="btn sm" href="tel:${x.tel.replace(/[^+\d]/g, '')}">${ic('phone', 'sm')}${esc(x.tel)}</a></div></article>`;
  return `
  <article class="card" style="background:linear-gradient(150deg,var(--acc-soft),var(--surface))"><div class="row">${ic('rv', 'lg')}<div class="grow"><h3 style="font-size:18px">${esc(m.locadora)} · ${esc(m.modelo)}</h3><p class="small mute">Intermediação ${esc(m.intermediaria)} · ${esc(m.viajantes)}</p></div></div><div class="acts"><button class="btn sm primary" data-a="abrirDoc" data-id="contrato-motorhome">${ic('file', 'sm')}Contrato</button><button class="btn sm" data-a="abrirDoc" data-id="roteiro-canions">${ic('map', 'sm')}Guia da rota</button></div></article>
  ${ponto('Retirada', m.retirada)}${ponto('Devolução', m.devolucao)}
  <h2 class="sec">Valores</h2><div class="card" style="padding:4px 16px">${m.valores.map(([k, v]) => `<div class="li" style="min-height:48px"><span class="grow small">${esc(k)}</span><b class="num small">${esc(v)}</b></div>`).join('')}</div>
  <h2 class="sec">Incluso na reserva</h2><div class="card"><ul class="dots">${m.servicos.map((s) => `<li>${esc(s)}</li>`).join('')}</ul></div>
  <h2 class="sec">Levar na retirada</h2><div class="card"><ul class="dots">${m.levar.map((s) => `<li>${esc(s)}</li>`).join('')}</ul></div>
  <h2 class="sec">Antes de devolver</h2><div class="card"><ul class="dots">${m.devolver.map((s) => `<li>${esc(s)}</li>`).join('')}</ul></div>
  <h2 class="sec">Combustível</h2><div class="card"><p class="small" style="color:var(--ink2)">${esc(m.combustivel)}</p></div>
  <h2 class="sec">Assistência</h2><div class="card"><p class="small" style="color:var(--ink2)">${esc(m.assistencia)}</p><div class="acts"><a class="btn sm primary" href="https://wa.me/554126264040" target="_blank" rel="noopener">${ic('msg', 'sm')}WhatsApp Motorhome Trips</a></div></div>
  <h2 class="sec">Cancelamento e alterações</h2><div class="card"><p class="small" style="color:var(--ink2)">${esc(m.cancelamento)}</p></div>`;
}

function vChecklist() {
  const grupos = [...new Set(D.checklist.map((c) => c.grupo))];
  const ck = D.checklist.filter((c) => S.sync.check[c.id]?.v).length;
  return `<div class="card"><div class="between"><b class="num">${ck} de ${D.checklist.length}</b><span class="small mute num">${Math.round((ck / D.checklist.length) * 100)}%</span></div><div class="bar" style="margin-top:8px"><i style="width:${(ck / D.checklist.length) * 100}%"></i></div></div>
  ${grupos.map((g) => `<h2 class="sec">${esc(g)}</h2><div class="card" style="padding:4px 16px">${D.checklist.filter((c) => c.grupo === g).map((c) => { const st = S.sync.check[c.id]; const on = !!st?.v; const quem = pessoa(c.quem); return `<button class="chk" role="checkbox" aria-checked="${on}" data-a="check" data-id="${c.id}"><span class="box">${ic('check', 'sm')}</span><span class="grow"><span class="txt small" style="display:block">${esc(c.texto)}</span><span class="xs mute">${quem ? esc(quem.curto) : esc(c.quem)}${on && st.por ? ' · marcado por ' + esc(pessoa(st.por)?.curto || '') : ''}</span></span></button>`; }).join('')}</div>`).join('')}`;
}

function vInfo() {
  const tzs = [['Brasília', 'America/Sao_Paulo'], ['LA e Vegas', 'America/Los_Angeles'], ['Arizona', 'America/Phoenix'], ['Utah', 'America/Denver']];
  return `
  <h2 class="sec" style="margin-top:8px">Relógios</h2>
  <div class="clock" id="relogios">${tzs.map(([n, z]) => `<div><span class="xs mute">${n}</span><b data-tz="${z}">--:--</b></div>`).join('')}</div>
  <h2 class="sec">Contatos</h2>
  <div class="card" style="padding:4px 16px">${D.contatos.map((c) => `<div class="li"><span class="ic">${ic(c.tel ? 'phone' : c.link ? 'ext' : 'pin')}</span><div class="grow"><h3 style="font-size:15px">${esc(c.nome)}</h3>${c.tel ? `<p class="xs mute num">${esc(c.tel)}</p>` : ''}${c.email ? `<p class="xs mute">${esc(c.email)}</p>` : ''}</div>
    ${c.whatsapp ? `<a class="iconbtn" href="https://wa.me/${c.whatsapp}" target="_blank" rel="noopener" aria-label="WhatsApp">${ic('msg')}</a>` : ''}${c.tel ? `<a class="iconbtn" href="tel:${c.tel}" aria-label="Ligar">${ic('phone')}</a>` : ''}${c.q ? `<a class="iconbtn" href="${mapsIr(c.q)}" target="_blank" rel="noopener" aria-label="Rota">${ic('nav')}</a>` : ''}${c.link ? `<a class="iconbtn" href="${c.link}" target="_blank" rel="noopener" aria-label="Abrir site">${ic('ext')}</a>` : ''}</div>`).join('')}</div>
  <h2 class="sec">Dicas</h2>
  ${D.dicas.map((d) => `<details class="card" style="padding:0"><summary style="padding:16px;cursor:pointer;font-weight:700;list-style:none" class="between">${esc(d.titulo)}${ic('chev', 'sm')}</summary><p class="small" style="padding:0 16px 16px;color:var(--ink2)">${esc(d.texto)}</p></details>`).join('')}
  <h2 class="sec">Este aparelho</h2>
  <div class="card" style="padding:4px 16px">
    <button class="li btnlike" data-a="escolherEu"><span class="ic">${S.eu ? av(S.eu, 'sm') : ic('users')}</span><div class="grow"><h3 style="font-size:15px">Quem é você</h3><p class="xs mute">${S.eu ? esc(pessoa(S.eu).nome) : 'Não escolhido'}</p></div>${ic('chev')}</button>
    <button class="li btnlike" data-a="tema"><span class="ic">${ic(document.documentElement.dataset.theme === 'dark' ? 'sun' : 'moon')}</span><div class="grow"><h3 style="font-size:15px">Tema</h3><p class="xs mute">${{ dark: 'Escuro', light: 'Claro' }[S.tema] || 'Automático'}</p></div>${ic('chev')}</button>
    <button class="li btnlike" data-a="instalar"><span class="ic">${ic('down')}</span><div class="grow"><h3 style="font-size:15px">Instalar na tela inicial</h3><p class="xs mute">Funciona offline como app</p></div>${ic('chev')}</button>
    <button class="li btnlike" data-a="bloquear"><span class="ic">${ic('lock')}</span><div class="grow"><h3 style="font-size:15px">Bloquear</h3><p class="xs mute">Esquece a senha neste aparelho</p></div>${ic('chev')}</button>
  </div>`;
}
depoisRender.viagem = (sub) => {
  if (sub !== 'info') return;
  const tick = () => $$('#relogios [data-tz]').forEach((b) => { b.textContent = new Intl.DateTimeFormat('pt-BR', { timeZone: b.dataset.tz, hour: '2-digit', minute: '2-digit' }).format(new Date()); });
  tick(); clearInterval(depoisRender.t); depoisRender.t = setInterval(() => { if (!$('#relogios')) return clearInterval(depoisRender.t); tick(); }, 15000);
};

// ------------------------------------------------------------------ arquivos
async function abrirBlob(blob, nome) {
  const url = URL.createObjectURL(blob);
  if (blob.type.startsWith('image/')) {
    abrirSheet(nome, `<img src="${url}" alt="${esc(nome)}" style="border-radius:16px;width:100%;height:auto"><div class="btnrow"><a class="btn primary" href="${url}" download="${esc(nome)}">${ic('down', 'sm')}Baixar</a><button class="btn" data-a="shareBlob">${ic('share', 'sm')}Compartilhar</button></div>`, (sh) => {
      sh.querySelector('[data-a="shareBlob"]').addEventListener('click', (e) => { e.stopPropagation(); compartilharBlob(blob, nome); });
    });
  } else {
    abrirSheet(nome, `<p class="small mute">${tam(blob.size)} · PDF</p><div class="btnrow"><a class="btn primary" href="${url}" target="_blank" rel="noopener">${ic('ext', 'sm')}Abrir</a><a class="btn" href="${url}" download="${esc(nome)}">${ic('down', 'sm')}Baixar</a><button class="btn" data-a="shareBlob">${ic('share', 'sm')}Compartilhar</button></div>`, (sh) => {
      sh.querySelector('[data-a="shareBlob"]').addEventListener('click', (e) => { e.stopPropagation(); compartilharBlob(blob, nome); });
    });
  }
}
async function compartilharBlob(blob, nome) {
  const f = new File([blob], nome, { type: blob.type });
  if (navigator.canShare?.({ files: [f] })) { try { await navigator.share({ files: [f], title: nome }); } catch { /* cancelado */ } }
  else { const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = nome; a.click(); }
}
async function abrirDoc(id) {
  const d = D.docs.find((x) => x.id === id); if (!d) return;
  toast('Abrindo ' + d.titulo + '…');
  try {
    const buf = await (await fetch(d.bin)).arrayBuffer();
    const blob = new Blob([await abrirBin(buf)], { type: d.tipo });
    abrirBlob(blob, d.nome);
  } catch { toast('Não foi possível abrir. Verifique a conexão.'); }
}
function upload(kind, ref) {
  const inp = document.createElement('input'); inp.type = 'file'; inp.accept = 'image/*,application/pdf'; inp.multiple = true;
  inp.onchange = async () => {
    for (const file of inp.files) {
      await idb.put({ id: uid(), kind, ref: ref || '', titulo: file.name.replace(/\.[^.]+$/, ''), nome: file.name, tipo: file.type, tamanho: file.size, pessoa: S.eu || '', criado: Date.now(), blob: file });
    }
    await recarregarArquivos(); render(); toast(inp.files.length > 1 ? 'Arquivos salvos neste aparelho.' : 'Arquivo salvo neste aparelho.');
  };
  inp.click();
}

// ------------------------------------------------------------------ ajustes
function escolherEu() {
  abrirSheet('Quem é você?', `<p class="small mute">Usado para marcar quem lançou gastos, votou em lugares e concluiu tarefas.</p>
    <div class="stack" style="margin-top:16px">${D.pessoas.map((p) => `<button class="card row" data-a="souEu" data-id="${p.id}" style="width:100%;text-align:left;${S.eu === p.id ? 'border-color:var(--acc)' : ''}">${av(p.id, 'lg')}<div class="grow"><h3 style="font-size:18px">${esc(p.nome)}</h3><p class="small mute">${esc(p.papel)}</p></div>${S.eu === p.id ? ic('check') : ''}</button>`).join('')}</div>`);
}
function aplicarTema() { if (S.tema) document.documentElement.dataset.theme = S.tema; else delete document.documentElement.dataset.theme; }
let promptInstalar = null;
window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); promptInstalar = e; });

// ------------------------------------------------------------------ ações
const A = {
  fechar: () => fecharSheet(),
  go: (t) => { location.hash = t.dataset.h; },
  ajustes: () => { location.hash = '#/viagem/info'; },
  pessoa: (t) => {
    const p = pessoa(t.dataset.id);
    const voos = [...D.voos, ...Object.values(S.sync.voos).filter((v) => !v.del)].filter((v) => v.pessoas.includes(p.id)).sort((a, b) => a.saida.localeCompare(b.saida));
    abrirSheet(p.nome, `<div class="row">${av(p.id, 'xl')}<div class="grow"><p class="small" style="color:var(--ink2)">${esc(p.papel)}</p><p class="small mute" style="margin-top:4px">No grupo de ${ddmm(p.de)} a ${p.ate ? ddmm(p.ate) : 'a definir'}</p></div></div>
      <div style="margin-top:16px">${voos.map(cardVoo).join('') || '<p class="small mute">Sem voos cadastrados.</p>'}</div>`);
  },
  irDia: (t) => document.getElementById('d-' + t.dataset.id)?.scrollIntoView({ behavior: 'smooth', block: 'start' }),
  usarRota: (t) => { setConf('rota', t.dataset.id); render(); toast('Roteiro ' + t.dataset.id + ' escolhido. Envie ao grupo pela aba Gastos.'); },
  fCidade: (t) => { F.cidade = t.dataset.id; render(); },
  fCat: (t) => { F.cat = t.dataset.id; render(); },
  fAnimados: () => { F.animados = !F.animados; render(); },
  fVotados: () => { F.votados = !F.votados; render(); },
  votar: (t) => {
    if (!S.eu) return escolherEu();
    const k = `${t.dataset.id}|${S.eu}`; const on = !S.sync.votos[k]?.v;
    S.sync.votos[k] = { v: on ? 1 : 0, ts: Date.now() }; salvar();
    const card = t.closest('.place'); const x = D.lugares.find((l) => l.id === t.dataset.id);
    if (card && x) { const tmp = document.createElement('div'); tmp.innerHTML = cardLugar(x); card.replaceWith(tmp.firstElementChild); }
    navigator.vibrate?.(10);
  },
  check: (t) => {
    const id = t.dataset.id; const on = !S.sync.check[id]?.v;
    S.sync.check[id] = { v: on, ts: Date.now(), por: S.eu || '' }; salvar();
    if (rota().tab === 'inicio') render(); else { t.setAttribute('aria-checked', on); render(); }
    navigator.vibrate?.(10);
  },
  novoGasto: () => formGasto(),
  editarGasto: (t) => formGasto(S.sync.gastos[t.dataset.id]),
  apagarGasto: (t) => {
    if (!confirm('Apagar este gasto para todos? (a exclusão também é sincronizada)')) return;
    const g = S.sync.gastos[t.dataset.id];
    S.sync.gastos[t.dataset.id] = { ...g, del: true, ts: Date.now() }; salvar(); fecharSheet(); render();
    toast('Gasto apagado.');
  },
  sincronizar: async () => {
    const url = await linkSync();
    const texto = `EUA 2027: atualização de gastos e reservas${S.eu ? ' enviada por ' + pessoa(S.eu).curto : ''}. Abra o link para sincronizar:`;
    if (navigator.share) { try { await navigator.share({ title: 'EUA 2027', text: texto, url }); return; } catch (e) { if (e?.name === 'AbortError') return; } }
    abrirSheet('Enviar ao grupo', `<p class="small mute">Copie e mande no grupo do WhatsApp. O conteúdo vai cifrado: só abre com a senha do grupo.</p><textarea class="inp" readonly style="margin-top:12px;font-size:13px;min-height:120px">${esc(url)}</textarea><div class="btnrow"><button class="btn primary" data-a="copiar" data-v="${esc(url)}">${ic('copy', 'sm')}Copiar link</button><a class="btn" href="https://wa.me/?text=${enc(texto + ' ' + url)}" target="_blank" rel="noopener">${ic('msg', 'sm')}WhatsApp</a></div>`);
  },
  importar: () => {
    abrirSheet('Importar do grupo', `<p class="small mute">Normalmente basta tocar no link recebido. Se ele abrir no navegador errado, cole aqui.</p><form id="fi"><textarea class="inp" name="c" required style="margin-top:12px" placeholder="https://…#s=…"></textarea><button class="btn primary block" style="margin-top:12px">${ic('sync')}Sincronizar</button></form>`, (sh) => {
      sh.querySelector('#fi').addEventListener('submit', (e) => { e.preventDefault(); fecharSheet(); importarHash(new FormData(e.target).get('c')); });
    });
  },
  cambio: () => {
    abrirSheet('Câmbio', `<form id="fc"><label class="f"><span>US$ 1 vale (R$)</span><input class="inp num" name="v" inputmode="decimal" value="${String(S.cambio).replace('.', ',')}"></label><button type="button" class="btn soft block" data-a="buscarCambio" style="margin-top:12px">${ic('sync', 'sm')}Buscar cotação de agora</button><button class="btn primary block" style="margin-top:8px">${ic('check')}Salvar</button><p class="xs mute" style="margin-top:8px">Gastos em reais guardam o câmbio do dia em que foram lançados.</p></form>`, (sh) => {
      sh.querySelector('#fc').addEventListener('submit', (e) => { e.preventDefault(); const v = numero(new FormData(e.target).get('v')); if (v > 0) { S.cambio = v; salvar(); } fecharSheet(); render(); });
    });
  },
  buscarCambio: async () => {
    try {
      const r = await (await fetch('https://economia.awesomeapi.com.br/json/last/USD-BRL')).json();
      const v = parseFloat(r.USDBRL.bid); const i = $('#fc [name="v"]'); if (i && v) i.value = v.toFixed(4).replace('.', ',');
      toast('Dólar comercial: R$ ' + v.toFixed(2).replace('.', ',') + '. Cartão costuma cobrar uns 4% a mais.');
    } catch { toast('Sem conexão para buscar a cotação.'); }
  },
  pix: () => {
    abrirSheet('Chaves Pix', `<form id="fp">${D.pessoas.map((p) => `<label class="f"><span>${esc(p.curto)}</span><div class="row">${av(p.id, 'sm')}<input class="inp" name="${p.id}" value="${esc(S.sync.pix[p.id]?.v || '')}" placeholder="CPF, celular, e-mail ou chave aleatória"></div></label>`).join('')}<button class="btn primary block" style="margin-top:16px">${ic('check')}Salvar e sincronizar</button><p class="xs mute" style="margin-top:8px">As chaves viajam cifradas no link de sincronização.</p></form>`, (sh) => {
      sh.querySelector('#fp').addEventListener('submit', (e) => {
        e.preventDefault(); const f = new FormData(e.target);
        for (const p of D.pessoas) { const v = String(f.get(p.id) || '').trim(); if (v !== (S.sync.pix[p.id]?.v || '')) S.sync.pix[p.id] = { v, ts: Date.now() }; }
        salvar(); fecharSheet(); render();
      });
    });
  },
  ferramentas: () => {
    abrirSheet('Ferramentas', `
      <div class="card"><h3>Gorjeta e divisão da conta</h3>
        <div class="row" style="align-items:flex-end"><label class="f grow"><span>Conta (US$)</span><input class="inp num" id="gv" inputmode="decimal" placeholder="0,00"></label><label class="f" style="width:96px"><span>Pessoas</span><input class="inp num" id="gp" inputmode="numeric" value="${presentes(isoHoje() >= D.inicio ? isoHoje() : D.inicio).length}"></label></div>
        <div class="seg" id="gt" style="margin-top:12px">${[18, 20, 22].map((p) => `<button type="button" aria-selected="${p === 20}" data-p="${p}">${p}%</button>`).join('')}</div>
        <div id="gr" class="small" style="color:var(--ink2)">Digite o valor da conta.</div></div>
      <div class="card"><h3>Conversor</h3><div class="row" style="align-items:flex-end"><label class="f grow"><span>US$</span><input class="inp num" id="cu" inputmode="decimal"></label><label class="f grow"><span>R$</span><input class="inp num" id="cb" inputmode="decimal"></label></div><p class="xs mute" style="margin-top:6px">Câmbio de ${brl(S.cambio)}.</p></div>
      <div class="card"><h3>Sorteio</h3><p class="small mute">Quem paga a rodada, quem dirige, quem dorme no beliche.</p><div id="sorteio" class="row" style="justify-content:center;min-height:96px;margin-top:8px">${avs(presentes(isoHoje() >= D.inicio ? isoHoje() : D.inicio), 'lg')}</div><button class="btn primary block" id="sortear">${ic('dice')}Sortear</button></div>
      <div class="card"><h3>Exportar</h3><p class="small mute">Planilha CSV com todos os gastos, para abrir no Excel, Splitwise ou Google Sheets.</p><button class="btn block" data-a="csv" style="margin-top:12px">${ic('down', 'sm')}Baixar CSV</button></div>
      <div class="card"><h3>Zerar gastos</h3><p class="small mute">Apaga todos os lançamentos e saldos. Depois, envie ao grupo para zerar também nos outros celulares.</p><button class="btn danger block" data-a="zerarGastos" style="margin-top:12px">${ic('trash', 'sm')}Zerar todos os gastos</button></div>`, (sh) => {
      let pct = 20;
      const calc = () => { const v = numero($('#gv', sh).value); const n = Math.max(1, parseInt($('#gp', sh).value) || 1); if (!v) return; const t = v * (1 + pct / 100); $('#gr', sh).innerHTML = `Gorjeta ${usd(v * pct / 100)} · total <b>${usd(t)}</b> · cada um <b>${usd(t / n)}</b> (${brl((t / n) * S.cambio)})`; };
      $('#gv', sh).addEventListener('input', calc); $('#gp', sh).addEventListener('input', calc);
      $$('#gt button', sh).forEach((b) => b.addEventListener('click', () => { pct = +b.dataset.p; $$('#gt button', sh).forEach((x) => x.setAttribute('aria-selected', x === b)); calc(); }));
      $('#cu', sh).addEventListener('input', (e) => { $('#cb', sh).value = (numero(e.target.value) * S.cambio).toFixed(2).replace('.', ','); });
      $('#cb', sh).addEventListener('input', (e) => { $('#cu', sh).value = (numero(e.target.value) / S.cambio).toFixed(2).replace('.', ','); });
      $('#sortear', sh).addEventListener('click', () => {
        const ids = presentes(isoHoje() >= D.inicio && isoHoje() <= D.fim ? isoHoje() : D.inicio);
        let n = 0; const alvo = ids[Math.floor(Math.random() * ids.length)];
        const giro = setInterval(() => { $('#sorteio', sh).innerHTML = av(ids[n++ % ids.length], 'xl'); if (n > 14) { clearInterval(giro); $('#sorteio', sh).innerHTML = `<div style="text-align:center">${av(alvo, 'xl')}<h3 style="margin-top:8px;font-size:20px">${esc(pessoa(alvo).curto)}!</h3></div>`; navigator.vibrate?.([30, 40, 30]); } }, 90);
      });
    });
  },
  csv: () => {
    const linhas = [['data', 'descricao', 'valor', 'moeda', 'valor_usd', 'pagou', 'dividido_entre', 'categoria', 'obs']];
    for (const g of gastosAtivos()) linhas.push([g.data, g.desc, g.valor, g.moeda, emUSD(g).toFixed(2), pessoa(g.pagou)?.curto, Object.keys(g.pesos).filter((k) => g.pesos[k] > 0).map((k) => `${pessoa(k)?.curto}${g.pesos[k] !== 1 ? ' x' + g.pesos[k] : ''}`).join(' + '), g.cat, g.nota || '']);
    const csv = '﻿' + linhas.map((l) => l.map((c) => `"${String(c ?? '').replace(/"/g, '""')}"`).join(';')).join('\n');
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' })); a.download = 'gastos-eua-2027.csv'; a.click();
  },
  zerarGastos: () => {
    if (!confirm('Zerar todos os gastos? Os lançamentos e saldos somem para todos depois da sincronização.')) return;
    if (!confirm('Confirma? Esta ação não pode ser desfeita pelo app. Se quiser, baixe o CSV antes.')) return;
    setConf('gastosDesde', Date.now()); fecharSheet(); render(); toast('Gastos zerados. Envie ao grupo para zerar nos outros celulares.');
  },
  copiar: (t) => copiar(t.dataset.v),
  abrirDoc: (t) => abrirDoc(t.dataset.id),
  abrirArq: async (t) => { const a = await idb.get(t.dataset.id); if (a) abrirBlob(a.blob, a.nome); },
  compartilharArq: async (t) => { const a = await idb.get(t.dataset.id); if (a) compartilharBlob(a.blob, a.nome); },
  upload: (t) => upload(t.dataset.kind, t.dataset.ref),
  novoVoo: (t) => formVoo(t.dataset.p, t.dataset.g || 'volta'),
  apagarVoo: (t) => { if (!confirm('Remover este voo?')) return; S.sync.voos[t.dataset.id] = { ...S.sync.voos[t.dataset.id], del: true, ts: Date.now() }; salvar(); render(); },
  reservaHotel: (t) => formHotel(t.dataset.id),
  limparHotel: (t) => { S.sync.hoteis[t.dataset.id] = { del: true, ts: Date.now() }; salvar(); fecharSheet(); render(); },
  escolherEu: () => escolherEu(),
  souEu: (t) => { S.eu = t.dataset.id; salvar(); fecharSheet(); render(); toast('Olá, ' + pessoa(S.eu).curto + '!'); },
  tema: () => { S.tema = { undefined: 'dark', dark: 'light', light: undefined }[String(S.tema)]; salvar(); aplicarTema(); render(); },
  instalar: async () => {
    if (promptInstalar) { promptInstalar.prompt(); promptInstalar = null; return; }
    abrirSheet('Instalar na tela inicial', `<p class="small" style="color:var(--ink2)"><b>iPhone:</b> no Safari, toque em Compartilhar e depois em “Adicionar à Tela de Início”.</p><p class="small" style="color:var(--ink2);margin-top:12px"><b>Android:</b> no Chrome, menu ⋮ e “Instalar app”.</p>`);
  },
  bloquear: () => { if (!confirm('Esquecer a senha neste aparelho? Os gastos e arquivos salvos aqui continuam guardados.')) return; localStorage.removeItem(K_CHAVE); CHAVE = null; D = null; location.hash = ''; telaBloqueio(); },
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
