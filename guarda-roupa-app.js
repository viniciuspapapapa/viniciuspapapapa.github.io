/* ============================================================================
   CLOSET — Guarda-roupa digital
   Recorte automático de peças, catalogação por tipo/cor/estilo e
   geração de looks por ocasião. 100% local (IndexedDB), offline-first.
   ========================================================================= */
'use strict';

/* ============================================================================
   1. UTILITÁRIOS
   ========================================================================= */
const $  = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const sleep = ms => new Promise(r => setTimeout(r, ms));
const nextFrame = () => new Promise(r => requestAnimationFrame(() => r()));
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const pick = a => a[Math.floor(Math.random() * a.length)];
const shuffle = a => { const r = a.slice(); for (let i = r.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1));[r[i], r[j]] = [r[j], r[i]]; } return r; };

let toastTimer;
function toast(msg) {
  const t = $('#toast');
  t.textContent = msg; t.classList.add('on');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('on'), 2400);
}
function haptic(ms = 8) { try { navigator.vibrate?.(ms); } catch (e) { } }

/* ============================================================================
   2. COR — conversões, nomes e distância perceptual
   ========================================================================= */
const Color = {
  hex2rgb(h) { const n = parseInt(h.slice(1), 16); return [n >> 16 & 255, n >> 8 & 255, n & 255]; },
  rgb2hex(r, g, b) { return '#' + [r, g, b].map(v => clamp(Math.round(v), 0, 255).toString(16).padStart(2, '0')).join(''); },

  rgb2lab(r, g, b) {
    let R = r / 255, G = g / 255, B = b / 255;
    R = R > .04045 ? Math.pow((R + .055) / 1.055, 2.4) : R / 12.92;
    G = G > .04045 ? Math.pow((G + .055) / 1.055, 2.4) : G / 12.92;
    B = B > .04045 ? Math.pow((B + .055) / 1.055, 2.4) : B / 12.92;
    let x = (R * .4124 + G * .3576 + B * .1805) / .95047;
    let y = (R * .2126 + G * .7152 + B * .0722) / 1.00000;
    let z = (R * .0193 + G * .1192 + B * .9505) / 1.08883;
    const f = t => t > .008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116;
    x = f(x); y = f(y); z = f(z);
    return [116 * y - 16, 500 * (x - y), 200 * (y - z)];
  },

  rgb2hsl(r, g, b) {
    r /= 255; g /= 255; b /= 255;
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
    let h = 0;
    if (d) {
      if (mx === r) h = ((g - b) / d + (g < b ? 6 : 0));
      else if (mx === g) h = (b - r) / d + 2;
      else h = (r - g) / d + 4;
      h *= 60;
    }
    const l = (mx + mn) / 2;
    const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
    return [h, clamp(s, 0, 1), l];
  },

  dist(l1, l2) { // ΔE76 — suficiente e barato
    const dl = l1[0] - l2[0], da = l1[1] - l2[1], db = l1[2] - l2[2];
    return Math.sqrt(dl * dl + da * da + db * db);
  },

  hueDelta(h1, h2) { const d = Math.abs(h1 - h2) % 360; return d > 180 ? 360 - d : d; }
};

/* Paleta de referência para nomear cores (pt-BR) */
const NAMED_COLORS = [
  { n: 'preto',        hex: '#101010', neutral: true },
  { n: 'grafite',      hex: '#2e3033', neutral: true },
  { n: 'cinza-escuro', hex: '#4a4d52', neutral: true },
  { n: 'cinza',        hex: '#8a8d92', neutral: true },
  { n: 'cinza-claro',  hex: '#c2c5c9', neutral: true },
  { n: 'branco',       hex: '#f6f6f4', neutral: true },
  { n: 'off-white',    hex: '#ece5d8', neutral: true },
  { n: 'creme',        hex: '#e4d7bd', neutral: true },
  { n: 'areia',        hex: '#cdbb9a', neutral: true },
  { n: 'bege',         hex: '#b9a684', neutral: true },
  { n: 'caqui',        hex: '#a3966d', neutral: true },
  { n: 'camelo',       hex: '#a9793f', neutral: true },
  { n: 'marrom',       hex: '#6b4a30', neutral: true },
  { n: 'chocolate',    hex: '#402a1d', neutral: true },
  { n: 'oliva',        hex: '#5c5c33', neutral: true },
  { n: 'verde-militar',hex: '#414a33', neutral: true },
  { n: 'verde-musgo',  hex: '#4a6046', neutral: true },
  { n: 'verde',        hex: '#3f8a52', neutral: false },
  { n: 'verde-menta',  hex: '#9ed6b6', neutral: false },
  { n: 'azul-marinho', hex: '#1f2a44', neutral: true },
  { n: 'jeans-escuro', hex: '#2f435e', neutral: true },
  { n: 'jeans',        hex: '#5878a0', neutral: true },
  { n: 'jeans-claro',  hex: '#94b0cd', neutral: true },
  { n: 'azul',         hex: '#2f6fc4', neutral: false },
  { n: 'azul-claro',   hex: '#a8c8e8', neutral: false },
  { n: 'petróleo',     hex: '#265560', neutral: true },
  { n: 'roxo',         hex: '#6a4a8f', neutral: false },
  { n: 'lilás',        hex: '#b7a4d6', neutral: false },
  { n: 'vinho',        hex: '#5e2130', neutral: true },
  { n: 'vermelho',     hex: '#bf2f2f', neutral: false },
  { n: 'terracota',    hex: '#b0603c', neutral: false },
  { n: 'coral',        hex: '#e2705e', neutral: false },
  { n: 'laranja',      hex: '#d9762a', neutral: false },
  { n: 'mostarda',     hex: '#c99a2e', neutral: false },
  { n: 'amarelo',      hex: '#e5c548', neutral: false },
  { n: 'rosa',         hex: '#d98aa5', neutral: false },
  { n: 'rosa-claro',   hex: '#eecdd6', neutral: false },
  { n: 'dourado',      hex: '#b99446', neutral: true },
  { n: 'prata',        hex: '#b9bcc2', neutral: true }
];
NAMED_COLORS.forEach(c => { c.lab = Color.rgb2lab(...Color.hex2rgb(c.hex)); });

function nameColor(hex) {
  const lab = Color.rgb2lab(...Color.hex2rgb(hex));
  let best = NAMED_COLORS[0], bd = Infinity;
  for (const c of NAMED_COLORS) { const d = Color.dist(lab, c.lab); if (d < bd) { bd = d; best = c; } }
  return best;
}

/* ============================================================================
   3. TAXONOMIA — grupos, categorias, estilos, ocasiões
   ========================================================================= */
const GROUPS = {
  top:       { label: 'Parte de cima', order: 1 },
  bottom:    { label: 'Parte de baixo', order: 2 },
  fullbody:  { label: 'Peça inteira', order: 3 },
  outer:     { label: 'Sobreposição', order: 4 },
  shoes:     { label: 'Calçados', order: 5 },
  bag:       { label: 'Bolsas e mochilas', order: 6 },
  accessory: { label: 'Acessórios', order: 7 }
};

/* formality 1 (muito casual) → 5 (formal) · warmth 1 (fresco) → 5 (muito quente) */
const CATEGORIES = [
  // ---- topo
  { id: 'camiseta',   label: 'Camiseta',    group: 'top',    formality: 2, warmth: 2, styles: ['casual'] },
  { id: 'regata',     label: 'Regata',      group: 'top',    formality: 1, warmth: 1, styles: ['casual', 'esportivo', 'praia'] },
  { id: 'camisa',     label: 'Camisa',      group: 'top',    formality: 4, warmth: 2, styles: ['social', 'casual'] },
  { id: 'polo',       label: 'Polo',        group: 'top',    formality: 3, warmth: 2, styles: ['casual', 'social'] },
  { id: 'moletom',    label: 'Moletom',     group: 'top',    formality: 1, warmth: 4, styles: ['casual', 'esportivo'] },
  { id: 'trico',      label: 'Tricô',       group: 'top',    formality: 3, warmth: 4, styles: ['casual', 'social'] },
  { id: 'blusa',      label: 'Blusa',       group: 'top',    formality: 3, warmth: 3, styles: ['casual', 'social'] },
  { id: 'camisa-time',label: 'Camisa de time', group: 'top', formality: 1, warmth: 2, styles: ['esportivo', 'casual'] },
  // ---- baixo
  { id: 'calca',      label: 'Calça',       group: 'bottom', formality: 3, warmth: 3, styles: ['casual', 'social'] },
  { id: 'alfaiataria',label: 'Calça de alfaiataria', group: 'bottom', formality: 5, warmth: 3, styles: ['social'] },
  { id: 'jeans',      label: 'Jeans',       group: 'bottom', formality: 2, warmth: 3, styles: ['casual'] },
  { id: 'bermuda',    label: 'Bermuda',     group: 'bottom', formality: 2, warmth: 1, styles: ['casual'] },
  { id: 'short',      label: 'Short',       group: 'bottom', formality: 1, warmth: 1, styles: ['casual', 'esportivo', 'praia'] },
  { id: 'saia',       label: 'Saia',        group: 'bottom', formality: 3, warmth: 2, styles: ['casual', 'social'] },
  { id: 'legging',    label: 'Legging',     group: 'bottom', formality: 1, warmth: 2, styles: ['esportivo'] },
  // ---- inteiro
  { id: 'vestido',    label: 'Vestido',     group: 'fullbody', formality: 4, warmth: 2, styles: ['social', 'casual'] },
  { id: 'macacao',    label: 'Macacão',     group: 'fullbody', formality: 3, warmth: 2, styles: ['casual'] },
  { id: 'terno',      label: 'Terno',       group: 'fullbody', formality: 5, warmth: 3, styles: ['social'] },
  // ---- sobreposição
  { id: 'jaqueta',    label: 'Jaqueta',     group: 'outer',  formality: 3, warmth: 4, styles: ['casual'] },
  { id: 'blazer',     label: 'Blazer',      group: 'outer',  formality: 5, warmth: 3, styles: ['social'] },
  { id: 'casaco',     label: 'Casaco',      group: 'outer',  formality: 4, warmth: 5, styles: ['casual', 'social'] },
  { id: 'colete',     label: 'Colete',      group: 'outer',  formality: 3, warmth: 3, styles: ['casual'] },
  { id: 'sobretudo',  label: 'Sobretudo',   group: 'outer',  formality: 5, warmth: 5, styles: ['social'] },
  { id: 'corta-vento',label: 'Corta-vento', group: 'outer',  formality: 1, warmth: 3, styles: ['esportivo', 'casual'] },
  // ---- calçados
  { id: 'tenis',      label: 'Tênis',       group: 'shoes',  formality: 2, warmth: 2, styles: ['casual', 'esportivo'] },
  { id: 'sapato',     label: 'Sapato social', group: 'shoes', formality: 5, warmth: 2, styles: ['social'] },
  { id: 'mocassim',   label: 'Mocassim',    group: 'shoes',  formality: 4, warmth: 2, styles: ['social', 'casual'] },
  { id: 'bota',       label: 'Bota',        group: 'shoes',  formality: 3, warmth: 4, styles: ['casual', 'social'] },
  { id: 'chinelo',    label: 'Chinelo',     group: 'shoes',  formality: 1, warmth: 1, styles: ['praia', 'casual'] },
  { id: 'sandalia',   label: 'Sandália',    group: 'shoes',  formality: 2, warmth: 1, styles: ['praia', 'casual'] },
  // ---- bolsas
  { id: 'mochila',    label: 'Mochila',     group: 'bag',    formality: 2, warmth: 0, styles: ['casual', 'esportivo'] },
  { id: 'shoulder',   label: 'Shoulder bag', group: 'bag',   formality: 2, warmth: 0, styles: ['casual'] },
  { id: 'bolsa',      label: 'Bolsa',       group: 'bag',    formality: 4, warmth: 0, styles: ['social', 'casual'] },
  { id: 'tote',       label: 'Tote bag',    group: 'bag',    formality: 2, warmth: 0, styles: ['casual'] },
  { id: 'pochete',    label: 'Pochete',     group: 'bag',    formality: 1, warmth: 0, styles: ['casual', 'esportivo'] },
  // ---- acessórios
  { id: 'oculos',     label: 'Óculos',      group: 'accessory', formality: 3, warmth: 0, styles: ['casual', 'social', 'praia'] },
  { id: 'bone',       label: 'Boné',        group: 'accessory', formality: 1, warmth: 0, styles: ['casual', 'esportivo'] },
  { id: 'chapeu',     label: 'Chapéu',      group: 'accessory', formality: 3, warmth: 0, styles: ['casual', 'praia'] },
  { id: 'cinto',      label: 'Cinto',       group: 'accessory', formality: 4, warmth: 0, styles: ['social', 'casual'] },
  { id: 'relogio',    label: 'Relógio',     group: 'accessory', formality: 4, warmth: 0, styles: ['social', 'casual'] },
  { id: 'colar',      label: 'Colar',       group: 'accessory', formality: 3, warmth: 0, styles: ['casual', 'social'] },
  { id: 'cachecol',   label: 'Cachecol',    group: 'accessory', formality: 3, warmth: 4, styles: ['casual', 'social'] },
  { id: 'meia',       label: 'Meia',        group: 'accessory', formality: 2, warmth: 2, styles: ['casual'] },
  { id: 'outro',      label: 'Outro',       group: 'accessory', formality: 2, warmth: 1, styles: ['casual'] }
];
const CAT = Object.fromEntries(CATEGORIES.map(c => [c.id, c]));

const STYLES = [
  { id: 'social',    label: 'Social' },
  { id: 'casual',    label: 'Casual' },
  { id: 'esportivo', label: 'Esportivo' },
  { id: 'praia',     label: 'Praia' },
  { id: 'festa',     label: 'Festa' }
];
const PATTERNS = [
  { id: 'liso',      label: 'Liso' },
  { id: 'estampado', label: 'Estampado' },
  { id: 'listrado',  label: 'Listrado' },
  { id: 'xadrez',    label: 'Xadrez' }
];
const SEASONS = [
  { id: 'calor',  label: 'Calor' },
  { id: 'ameno',  label: 'Ameno' },
  { id: 'frio',   label: 'Frio' }
];

/* Ocasiões — cada uma define alvo de formalidade, estilos aceitos e composição */
const OCCASIONS = [
  {
    id: 'trabalho', label: 'Trabalho', desc: 'Escritório, reuniões',
    icon: '<path d="M4 8h16v11H4z"/><path d="M9 8V6a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/><path d="M4 13h16"/>',
    formality: [3.4, 5], styles: ['social', 'casual'], ban: ['esportivo', 'praia'],
    prefer: ['camisa', 'polo', 'alfaiataria', 'calca', 'blazer', 'sapato', 'mocassim', 'trico', 'vestido', 'saia', 'bolsa', 'cinto', 'relogio', 'sobretudo'],
    outer: .55, bag: .4, acc: .5, maxAccent: 1
  },
  {
    id: 'diaadia', label: 'Dia a dia', desc: 'Rua, faculdade, café',
    icon: '<path d="M3 12l9-8 9 8"/><path d="M5 11v9h14v-9"/><path d="M10 20v-5h4v5"/>',
    formality: [1.5, 3.4], styles: ['casual', 'esportivo', 'social'], ban: [],
    prefer: ['camiseta', 'jeans', 'calca', 'tenis', 'jaqueta', 'mochila', 'bone', 'moletom', 'camisa', 'bermuda', 'oculos'],
    outer: .35, bag: .45, acc: .55, maxAccent: 1
  },
  {
    id: 'jantar', label: 'Jantar', desc: 'Encontro, restaurante',
    icon: '<path d="M7 3v8a2 2 0 0 0 4 0V3"/><path d="M9 11v10"/><path d="M17 3c-1.5 2-2 4-2 6h4c0-2-.5-4-2-6z"/><path d="M17 9v12"/>',
    formality: [3, 4.6], styles: ['social', 'casual'], ban: ['esportivo', 'praia'],
    prefer: ['camisa', 'trico', 'calca', 'alfaiataria', 'mocassim', 'bota', 'blazer', 'vestido', 'saia', 'bolsa', 'relogio'],
    outer: .5, bag: .3, acc: .6, maxAccent: 1
  },
  {
    id: 'noite', label: 'Noite', desc: 'Bar, show, balada',
    icon: '<path d="M20 14a8 8 0 1 1-9.5-9.8A6.5 6.5 0 0 0 20 14z"/>',
    formality: [2, 4], styles: ['casual', 'social', 'festa'], ban: ['praia'],
    prefer: ['camiseta', 'camisa', 'jeans', 'calca', 'bota', 'tenis', 'jaqueta', 'blazer', 'vestido', 'oculos', 'alfaiataria'],
    outer: .5, bag: .3, acc: .6, maxAccent: 1, darkBias: true
  },
  {
    id: 'esporte', label: 'Treino', desc: 'Academia, corrida',
    icon: '<path d="M6.5 6.5l11 11"/><path d="M4 9l2-2 2 2-2 2z"/><path d="M16 15l2-2 2 2-2 2z"/><path d="M2.5 11.5l1-1"/><path d="M20.5 12.5l1-1"/>',
    formality: [1, 2.2], styles: ['esportivo'], ban: ['social', 'festa'],
    prefer: ['regata', 'camiseta', 'short', 'legging', 'tenis', 'moletom', 'corta-vento', 'bone', 'meia', 'pochete'],
    maxWarmth: 4,
    outer: .25, bag: .2, acc: .3, maxAccent: 2
  },
  {
    id: 'praia', label: 'Praia', desc: 'Calor, sol, mar',
    icon: '<circle cx="12" cy="8" r="3.2"/><path d="M3 18c2-1.5 4-1.5 6 0s4 1.5 6 0 4-1.5 6 0"/>',
    formality: [1, 2.4], styles: ['praia', 'casual', 'esportivo'], ban: ['social'],
    prefer: ['regata', 'camiseta', 'short', 'bermuda', 'chinelo', 'sandalia', 'oculos', 'chapeu', 'tote', 'saia', 'vestido'],
    maxWarmth: 2,
    outer: .1, bag: .3, acc: .6, maxAccent: 2
  },
  {
    id: 'viagem', label: 'Viagem', desc: 'Aeroporto, estrada',
    icon: '<path d="M3 10l18-5-4 8 4 8-18-5z"/>',
    formality: [1.5, 3.2], styles: ['casual', 'esportivo', 'social'], ban: [],
    prefer: ['camiseta', 'moletom', 'trico', 'jeans', 'calca', 'tenis', 'jaqueta', 'mochila', 'corta-vento', 'bone'],
    outer: .6, bag: .8, acc: .4, maxAccent: 1
  },
  {
    id: 'formal', label: 'Cerimônia', desc: 'Casamento, gala',
    icon: '<path d="M12 3l2.5 5 5.5.8-4 3.9.9 5.5L12 15.6 7.1 18.2l.9-5.5-4-3.9L9.5 8z"/>',
    formality: [4.4, 5], styles: ['social', 'festa'], ban: ['esportivo', 'praia'],
    prefer: ['terno', 'blazer', 'alfaiataria', 'camisa', 'sapato', 'mocassim', 'vestido', 'sobretudo', 'bolsa', 'cinto', 'relogio', 'colar'],
    outer: .6, bag: .3, acc: .7, maxAccent: 0
  }
];
const OCC = Object.fromEntries(OCCASIONS.map(o => [o.id, o]));

const WEATHERS = [
  { id: 'calor',  label: 'Calor',  warmth: [0, 2.4] },
  { id: 'ameno',  label: 'Ameno',  warmth: [0, 3.6] },
  { id: 'frio',   label: 'Frio',   warmth: [2.2, 5] },
  { id: 'qualquer', label: 'Tanto faz', warmth: [0, 5] }
];
const PALETTE_MODES = [
  { id: 'neutro',    label: 'Só neutros' },
  { id: 'equilibrado', label: 'Equilibrado' },
  { id: 'cor',       label: 'Um ponto de cor' }
];

/* ============================================================================
   4. BANCO DE DADOS (IndexedDB)
   ========================================================================= */
const DB = (() => {
  const NAME = 'closet-db', VER = 1;
  let db = null;

  function open() {
    if (db) return Promise.resolve(db);
    return new Promise((res, rej) => {
      const req = indexedDB.open(NAME, VER);
      req.onupgradeneeded = e => {
        const d = e.target.result;
        if (!d.objectStoreNames.contains('items')) d.createObjectStore('items', { keyPath: 'id' });
        if (!d.objectStoreNames.contains('blobs')) d.createObjectStore('blobs', { keyPath: 'id' });
        if (!d.objectStoreNames.contains('looks')) d.createObjectStore('looks', { keyPath: 'id' });
        if (!d.objectStoreNames.contains('meta'))  d.createObjectStore('meta',  { keyPath: 'k' });
      };
      req.onsuccess = e => { db = e.target.result; res(db); };
      req.onerror = () => rej(req.error);
    });
  }
  const tx = async (store, mode, fn) => {
    const d = await open();
    return new Promise((res, rej) => {
      const t = d.transaction(store, mode);
      const s = t.objectStore(store);
      let out;
      try { out = fn(s); } catch (e) { rej(e); return; }
      t.oncomplete = () => res(out && out.result !== undefined ? out.result : out);
      t.onerror = () => rej(t.error);
    });
  };
  return {
    all:  store => tx(store, 'readonly',  s => s.getAll()),
    get:  (store, k) => tx(store, 'readonly',  s => s.get(k)),
    put:  (store, v) => tx(store, 'readwrite', s => s.put(v)),
    del:  (store, k) => tx(store, 'readwrite', s => s.delete(k)),
    clear: store => tx(store, 'readwrite', s => s.clear()),
    putMany: (store, arr) => tx(store, 'readwrite', s => { arr.forEach(v => s.put(v)); })
  };
})();

/* ============================================================================
   5. VISÃO — carregamento, recorte de fundo, análise de forma e cor
   ========================================================================= */
const Vision = {
  MAX: 1000,          // resolução máxima de trabalho
  OUT: 720,           // resolução final da peça recortada

  async fileToCanvas(file) {
    let bmp = null;
    try {
      bmp = await createImageBitmap(file, { imageOrientation: 'from-image' });
    } catch (e) {
      bmp = await new Promise((res, rej) => {
        const img = new Image();
        img.onload = () => res(img);
        img.onerror = rej;
        img.src = URL.createObjectURL(file);
      });
    }
    const w = bmp.width, h = bmp.height;
    const sc = Math.min(1, this.MAX / Math.max(w, h));
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(w * sc));
    c.height = Math.max(1, Math.round(h * sc));
    const ctx = c.getContext('2d', { willReadFrequently: true });
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(bmp, 0, 0, c.width, c.height);
    bmp.close?.();
    return c;
  },

  /* ---------- k-means simplificado em Lab, para clusterizar cores ---------- */
  kmeans(samples, k, iters = 8) {
    if (!samples.length) return [];
    k = Math.min(k, samples.length);
    let cents = [];
    // init: k pontos bem espalhados (k-means++ leve)
    cents.push(samples[Math.floor(Math.random() * samples.length)].slice());
    while (cents.length < k) {
      let best = null, bd = -1;
      for (let i = 0; i < samples.length; i += Math.max(1, Math.floor(samples.length / 220))) {
        const s = samples[i];
        let d = Infinity;
        for (const c of cents) d = Math.min(d, Color.dist(s, c));
        if (d > bd) { bd = d; best = s; }
      }
      cents.push(best.slice());
    }
    const assign = new Int32Array(samples.length);
    for (let it = 0; it < iters; it++) {
      for (let i = 0; i < samples.length; i++) {
        let bi = 0, bd = Infinity;
        for (let c = 0; c < cents.length; c++) { const d = Color.dist(samples[i], cents[c]); if (d < bd) { bd = d; bi = c; } }
        assign[i] = bi;
      }
      const sum = cents.map(() => [0, 0, 0, 0]);
      for (let i = 0; i < samples.length; i++) {
        const a = assign[i], s = samples[i];
        sum[a][0] += s[0]; sum[a][1] += s[1]; sum[a][2] += s[2]; sum[a][3]++;
      }
      for (let c = 0; c < cents.length; c++) {
        if (sum[c][3]) cents[c] = [sum[c][0] / sum[c][3], sum[c][1] / sum[c][3], sum[c][2] / sum[c][3]];
      }
    }
    const counts = new Array(cents.length).fill(0);
    for (let i = 0; i < samples.length; i++) counts[assign[i]]++;
    return cents.map((c, i) => ({ lab: c, count: counts[i] })).sort((a, b) => b.count - a.count);
  },

  /* ---------- Remoção de fundo -------------------------------------------
     1) amostra a moldura da imagem para descobrir as cores de fundo
     2) alpha suave por distância perceptual até a cor de fundo mais próxima
     3) conectividade a partir das bordas: só é fundo o que "toca" a borda
        (buracos internos pequenos — estampas, logos — voltam a ser opacos)
     4) erosão de 1px + suavização da borda + remoção de franja (despill)
     Retorna null quando o fundo não é confiável (foto com cenário).
  ----------------------------------------------------------------------- */
  cutout(canvas, tolerance = 1) {
    const w = canvas.width, h = canvas.height;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    const img = ctx.getImageData(0, 0, w, h);
    const d = img.data;
    const N = w * h;

    // --- 5.1 amostragem da moldura
    const frame = Math.max(2, Math.round(Math.min(w, h) * 0.02));
    const samples = [], sampleRGB = [];
    const step = Math.max(1, Math.round(Math.min(w, h) / 160));
    for (let y = 0; y < h; y += step) {
      for (let x = 0; x < w; x += step) {
        const onFrame = x < frame || y < frame || x >= w - frame || y >= h - frame;
        if (!onFrame) continue;
        const i = (y * w + x) * 4;
        if (d[i + 3] < 8) continue;            // já transparente (PNG recortado)
        samples.push(Color.rgb2lab(d[i], d[i + 1], d[i + 2]));
        sampleRGB.push([d[i], d[i + 1], d[i + 2]]);
      }
    }

    // imagem já vem com transparência → nada a fazer
    let alreadyAlpha = 0;
    for (let i = 3; i < d.length; i += 4 * 37) if (d[i] < 250) alreadyAlpha++;
    const alphaRatio = alreadyAlpha / (N / 37);
    if (alphaRatio > .12) return { data: img, mode: 'preexistente' };

    if (samples.length < 20) return null;

    // --- 5.2 clusters de fundo + verificação de homogeneidade
    const clusters = this.kmeans(samples, 3, 7).filter(c => c.count / samples.length > .06);
    if (!clusters.length) return null;
    let spread = 0;
    for (const s of samples) {
      let m = Infinity;
      for (const c of clusters) m = Math.min(m, Color.dist(s, c.lab));
      spread += m;
    }
    spread /= samples.length;
    if (spread > 17) return null;              // moldura muito heterogênea = cenário

    const cl = clusters.map(c => c.lab);
    const T_IN = 8 * tolerance;                // abaixo disso é fundo puro
    const T_OUT = 22 * tolerance;              // acima disso é peça pura

    // --- 5.3 alpha bruto por distância de cor
    const alpha = new Float32Array(N);
    const labCache = new Float32Array(N * 3);
    for (let p = 0; p < N; p++) {
      const i = p * 4;
      const lab = Color.rgb2lab(d[i], d[i + 1], d[i + 2]);
      labCache[p * 3] = lab[0]; labCache[p * 3 + 1] = lab[1]; labCache[p * 3 + 2] = lab[2];
      let m = Infinity;
      for (const c of cl) { const dd = Color.dist(lab, c); if (dd < m) m = dd; }
      alpha[p] = clamp((m - T_IN) / (T_OUT - T_IN), 0, 1);
    }

    // --- 5.4 conectividade: flood-fill a partir das bordas por pixels "fundo"
    const outside = new Uint8Array(N);
    const stack = new Int32Array(N);
    let sp = 0;
    const push = p => { if (!outside[p] && alpha[p] < .55) { outside[p] = 1; stack[sp++] = p; } };
    for (let x = 0; x < w; x++) { push(x); push((h - 1) * w + x); }
    for (let y = 0; y < h; y++) { push(y * w); push(y * w + w - 1); }
    while (sp > 0) {
      const p = stack[--sp];
      const x = p % w, y = (p / w) | 0;
      if (x > 0) push(p - 1);
      if (x < w - 1) push(p + 1);
      if (y > 0) push(p - w);
      if (y < h - 1) push(p + w);
    }

    let bgCount = 0;
    for (let p = 0; p < N; p++) if (outside[p]) bgCount++;
    const bgRatio = bgCount / N;
    if (bgRatio < .10) return null;            // fundo quase inexistente
    if (bgRatio > .985) return null;           // não sobrou peça nenhuma

    // buracos internos: pequenos voltam a ser opacos (logo, estampa clara)
    const holeLimit = N * 0.012;
    const visited = new Uint8Array(N);
    for (let p0 = 0; p0 < N; p0++) {
      if (visited[p0] || outside[p0] || alpha[p0] >= .55) continue;
      // componente interno
      let sp2 = 0, area = 0;
      const comp = [];
      stack[sp2++] = p0; visited[p0] = 1;
      while (sp2 > 0) {
        const p = stack[--sp2];
        comp.push(p); area++;
        const x = p % w, y = (p / w) | 0;
        const nb = [x > 0 ? p - 1 : -1, x < w - 1 ? p + 1 : -1, y > 0 ? p - w : -1, y < h - 1 ? p + w : -1];
        for (const q of nb) {
          if (q < 0 || visited[q] || outside[q] || alpha[q] >= .55) continue;
          visited[q] = 1; stack[sp2++] = q;
        }
      }
      if (area < holeLimit) for (const p of comp) alpha[p] = 1;   // detalhe da peça
      else for (const p of comp) outside[p] = 1;                  // vazado real (alça)
    }

    // --- 5.5 alpha final + erosão + suavização
    const A = new Float32Array(N);
    for (let p = 0; p < N; p++) A[p] = outside[p] ? 0 : alpha[p];

    // erosão 1px (mata a franja do fundo)
    const E = new Float32Array(N);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const p = y * w + x;
        let mn = A[p];
        if (x > 0) mn = Math.min(mn, A[p - 1]);
        if (x < w - 1) mn = Math.min(mn, A[p + 1]);
        if (y > 0) mn = Math.min(mn, A[p - w]);
        if (y < h - 1) mn = Math.min(mn, A[p + w]);
        E[p] = mn;
      }
    }
    // suavização box 3x3 na borda
    const F = new Float32Array(N);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const p = y * w + x;
        if (E[p] > .96 || E[p] < .02) { F[p] = E[p]; continue; }
        let s = 0, n = 0;
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx, ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
          s += E[ny * w + nx]; n++;
        }
        F[p] = s / n;
      }
    }

    // --- 5.6 escreve alpha + despill nas bordas semitransparentes
    const bgRGB = cl.map(lab => {
      // reconverte aproximando pela amostra mais próxima
      let best = sampleRGB[0], bd = Infinity;
      for (let i = 0; i < samples.length; i++) { const dd = Color.dist(samples[i], lab); if (dd < bd) { bd = dd; best = sampleRGB[i]; } }
      return best;
    });
    for (let p = 0; p < N; p++) {
      const a = F[p], i = p * 4;
      if (a >= .999) { d[i + 3] = 255; continue; }
      if (a <= .004) { d[i + 3] = 0; continue; }
      // despill: remove a contribuição do fundo do pixel semitransparente
      const lab = [labCache[p * 3], labCache[p * 3 + 1], labCache[p * 3 + 2]];
      let bi = 0, bd = Infinity;
      for (let c = 0; c < cl.length; c++) { const dd = Color.dist(lab, cl[c]); if (dd < bd) { bd = dd; bi = c; } }
      const bg = bgRGB[bi];
      for (let k = 0; k < 3; k++) {
        const v = (d[i + k] - (1 - a) * bg[k]) / a;
        d[i + k] = clamp(v, 0, 255);
      }
      d[i + 3] = Math.round(a * 255);
    }
    return { data: img, mode: 'recortado', bgRatio };
  },

  /* ---------- recorta para o objeto e centraliza num quadrado ---------- */
  trimAndFrame(imageData, out = null) {
    out = out || this.OUT;
    const { width: w, height: h, data: d } = imageData;
    let x0 = w, y0 = h, x1 = -1, y1 = -1;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        if (d[(y * w + x) * 4 + 3] > 24) {
          if (x < x0) x0 = x; if (x > x1) x1 = x;
          if (y < y0) y0 = y; if (y > y1) y1 = y;
        }
      }
    }
    if (x1 < 0) { x0 = 0; y0 = 0; x1 = w - 1; y1 = h - 1; }
    const ow = x1 - x0 + 1, oh = y1 - y0 + 1;

    const src = document.createElement('canvas');
    src.width = w; src.height = h;
    src.getContext('2d').putImageData(imageData, 0, 0);

    const c = document.createElement('canvas');
    c.width = out; c.height = out;
    const ctx = c.getContext('2d');
    ctx.imageSmoothingQuality = 'high';
    const pad = out * 0.06;
    const sc = Math.min((out - pad * 2) / ow, (out - pad * 2) / oh);
    const dw = ow * sc, dh = oh * sc;
    ctx.drawImage(src, x0, y0, ow, oh, (out - dw) / 2, (out - dh) / 2, dw, dh);
    return { canvas: c, ratio: oh / ow, objW: ow, objH: oh };
  },

  /* ---------- análise de silhueta a partir do alpha ---------- */
  shape(canvas) {
    const S = 64;
    const c = document.createElement('canvas');
    c.width = S; c.height = S;
    const ctx = c.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(canvas, 0, 0, S, S);
    const d = ctx.getImageData(0, 0, S, S).data;
    const m = new Uint8Array(S * S);
    let x0 = S, y0 = S, x1 = -1, y1 = -1, area = 0;
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      const a = d[(y * S + x) * 4 + 3];
      if (a > 90) {
        m[y * S + x] = 1; area++;
        if (x < x0) x0 = x; if (x > x1) x1 = x;
        if (y < y0) y0 = y; if (y > y1) y1 = y;
      }
    }
    if (x1 < 0) return null;
    const bw = x1 - x0 + 1, bh = y1 - y0 + 1;

    // largura por faixa (12 faixas verticais)
    const bands = 12, rowW = new Array(bands).fill(0), runsPerBand = new Array(bands).fill(0);
    for (let b = 0; b < bands; b++) {
      const ya = y0 + Math.floor(bh * b / bands), yb = y0 + Math.max(1, Math.floor(bh * (b + 1) / bands));
      let wsum = 0, rows = 0, runsSum = 0;
      for (let y = ya; y < yb && y <= y1; y++) {
        let cnt = 0, runs = 0, prev = 0;
        for (let x = x0; x <= x1; x++) {
          const v = m[y * S + x];
          if (v) cnt++;
          if (v && !prev) runs++;
          prev = v;
        }
        wsum += cnt / bw; runsSum += runs; rows++;
      }
      rowW[b] = rows ? wsum / rows : 0;
      runsPerBand[b] = rows ? runsSum / rows : 0;
    }
    // altura por coluna (para detectar formato deitado — calçados)
    const cols = 8, colH = new Array(cols).fill(0);
    for (let b = 0; b < cols; b++) {
      const xa = x0 + Math.floor(bw * b / cols), xb = x0 + Math.max(1, Math.floor(bw * (b + 1) / cols));
      let hsum = 0, n = 0;
      for (let x = xa; x < xb && x <= x1; x++) {
        let cnt = 0;
        for (let y = y0; y <= y1; y++) if (m[y * S + x]) cnt++;
        hsum += cnt / bh; n++;
      }
      colH[b] = n ? hsum / n : 0;
    }
    // simetria vertical
    let sym = 0, symN = 0;
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      const mx = x1 - (x - x0);
      sym += (m[y * S + x] === m[y * S + mx]) ? 1 : 0; symN++;
    }

    const legSplit = (runsPerBand[9] + runsPerBand[10] + runsPerBand[11]) / 3;
    const topRuns = (runsPerBand[0] + runsPerBand[1]) / 2;
    const shoulder = Math.max(rowW[1], rowW[2], rowW[3]);
    const waist = (rowW[5] + rowW[6] + rowW[7]) / 3;

    return {
      ar: bh / bw,                        // altura / largura
      fill: area / (bw * bh),             // solidez
      rowW, colH,
      legSplit,                           // ~2 nas faixas de baixo = pernas
      topRuns,
      shoulderToWaist: waist > .02 ? shoulder / waist : 1,
      topW: (rowW[0] + rowW[1]) / 2,
      midW: (rowW[5] + rowW[6]) / 2,
      botW: (rowW[10] + rowW[11]) / 2,
      symmetry: symN ? sym / symN : 0
    };
  },

  /* ---------- paleta e padrão da peça ---------- */
  palette(canvas) {
    const S = 96;
    const c = document.createElement('canvas');
    c.width = S; c.height = S;
    const ctx = c.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(canvas, 0, 0, S, S);
    const d = ctx.getImageData(0, 0, S, S).data;
    const labs = [], rgbs = [];
    for (let p = 0; p < S * S; p++) {
      const i = p * 4;
      if (d[i + 3] < 200) continue;
      labs.push(Color.rgb2lab(d[i], d[i + 1], d[i + 2]));
      rgbs.push([d[i], d[i + 1], d[i + 2]]);
    }
    if (labs.length < 30) return { colors: [{ hex: '#8a8d92', ratio: 1 }], pattern: 'liso', variance: 0 };

    const cs = this.kmeans(labs, 4, 8).filter(k => k.count / labs.length > .05);
    const total = cs.reduce((s, k) => s + k.count, 0);
    let colors = cs.map(k => {
      // rgb médio dos pixels do cluster
      let sr = 0, sg = 0, sb = 0, n = 0;
      for (let i = 0; i < labs.length; i++) {
        if (Color.dist(labs[i], k.lab) < 14) { sr += rgbs[i][0]; sg += rgbs[i][1]; sb += rgbs[i][2]; n++; }
      }
      const hex = n ? Color.rgb2hex(sr / n, sg / n, sb / n) : '#8a8d92';
      return { hex, ratio: k.count / total, lab: k.lab };
    });

    // clusters vizinhos viram a mesma cor para o usuário: funde por proximidade
    // perceptual e por nome, para não repetir "verde-militar" três vezes.
    const merged = [];
    for (const c of colors) {
      const near = merged.find(m => Color.dist(m.lab, c.lab) < 13 || nameColor(m.hex).n === nameColor(c.hex).n);
      if (near) near.ratio += c.ratio; else merged.push({ ...c });
    }
    colors = merged.sort((a, b) => b.ratio - a.ratio).map(c => ({ hex: c.hex, ratio: c.ratio }));

    // variância cromática → liso x estampado
    let variance = 0;
    const main = cs[0].lab;
    for (const l of labs) variance += Color.dist(l, main);
    variance /= labs.length;
    const secondary = colors[1] ? colors[1].ratio : 0;
    let pattern = 'liso';
    if (variance > 26 && secondary > .22) pattern = 'estampado';
    else if (variance > 17 && secondary > .3) pattern = 'listrado';

    return { colors, pattern, variance };
  },

  /* ---------- canvas → Blob (webp quando disponível) ---------- */
  toBlob(canvas, maxSide, quality = .92) {
    let c = canvas;
    if (maxSide && canvas.width > maxSide) {
      c = document.createElement('canvas');
      c.width = maxSide; c.height = Math.round(canvas.height * maxSide / canvas.width);
      const ctx = c.getContext('2d');
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(canvas, 0, 0, c.width, c.height);
    }
    return new Promise(res => {
      c.toBlob(b => {
        if (b) return res(b);
        c.toBlob(b2 => res(b2), 'image/png');
      }, 'image/webp', quality);
    });
  }
};

/* ============================================================================
   6. CLASSIFICADOR — heurístico (sempre) + IA opcional (CLIP zero-shot)
   ========================================================================= */
const Classifier = {
  /* ---------- 6.1 heurística de silhueta + cor ----------------------------
     Classifica primeiro o GRUPO (onde a silhueta é realmente informativa) e
     só depois a categoria dentro dele. Sinais usados:
       · ar            altura/largura do objeto
       · legSplit      nº de blocos horizontais na faixa inferior (2 = pernas)
       · shoulderToWaist  ombros/mangas mais largos que o tronco = parte de cima
       · topW          largura da faixa do topo (alça fina = bolsa)
       · botW          largura da faixa de baixo (solado largo = calçado)
  ---------------------------------------------------------------------- */
  heuristic(shape, pal) {
    if (!shape) return { catId: 'outro', confidence: .1, alternatives: [] };
    const s = shape;
    const ar = s.ar, fill = s.fill;

    const veryFlat  = ar < .40;
    const wide      = ar < .85;
    const tall      = ar > 1.45;
    const legs      = s.legSplit > 1.5;
    const sleeves   = s.shoulderToWaist > 1.08;
    const handleTop = s.topW < .45;
    const flatSole  = s.botW > .78;

    const g = { top: 0, bottom: 0, fullbody: 0, outer: 0, shoes: 0, bag: 0, accessory: 0 };

    // ---- calçados: largos, com a base (solado) sendo a parte mais larga
    if (wide) {
      g.shoes += flatSole ? 3.4 : 1.4;
      if (ar > .35 && ar < .8) g.shoes += 1.6;
      if (fill > .5) g.shoes += .4;
    }
    // ---- acessórios: muito achatados ou muito vazados
    if (veryFlat) { g.accessory += 3.2; g.shoes -= 1.2; }
    if (fill < .42 && !legs) g.accessory += 1.0;
    if (ar > 2.6 && fill < .5) g.accessory += 1.6;          // cinto, cachecol

    // ---- bolsas: alça fina no topo, corpo cheio e simétrico, sem mangas
    if (ar > .82 && ar < 1.7) {
      if (handleTop && !legs) g.bag += 3.0;
      if (fill > .62 && !sleeves && !legs) g.bag += 1.8;
      if (s.symmetry > .9 && fill > .6 && !sleeves) g.bag += .5;
    }
    // ---- parte de cima: mangas/ombros mais largos que a cintura
    if (ar > .78 && ar < 1.6) {
      g.top += sleeves ? 3.4 : 1.2;
      if (!handleTop) g.top += .8;
      if (legs) g.top -= 2.6;
    }
    // ---- parte de baixo: duas pernas na faixa inferior
    if (legs) {
      g.bottom += 3.8;
      if (tall) g.bottom += 1.0;
      g.bag -= 1.5; g.shoes -= 1.0;
    } else if (tall && !sleeves) {
      g.bottom += .8;                                        // saia, calça reta
    }
    // ---- peça inteira e sobreposição: longas, sem divisão de pernas
    if (tall && !legs) {
      g.fullbody += 1.9;
      if (sleeves) { g.outer += 2.4; g.fullbody -= .6; }
      if (s.botW > s.topW * 1.25) g.fullbody += .8;          // alarga para baixo
    }
    if (sleeves && ar >= 1.2 && ar <= 1.6) g.outer += 1.0;

    const gRank = Object.entries(g).sort((a, b) => b[1] - a[1]);
    const group = gRank[0][1] > 0 ? gRank[0][0] : 'top';
    const gap = gRank[1] ? (gRank[0][1] - gRank[1][1]) / Math.max(1, gRank[0][1]) : 1;

    // ---- cor auxiliar (jeans)
    const main = pal?.colors?.[0]?.hex;
    let denim = false;
    if (main) {
      const [hh, ss, ll] = Color.rgb2hsl(...Color.hex2rgb(main));
      denim = hh > 190 && hh < 250 && ss > .10 && ss < .55 && ll > .18 && ll < .72;
    }

    // ---- categoria dentro do grupo
    let catId;
    switch (group) {
      case 'shoes':
        catId = ar > .74 ? 'bota' : (fill < .5 && ar < .55) ? 'chinelo' : (fill > .62 && ar < .48) ? 'sapato' : 'tenis';
        break;
      case 'bag':
        catId = (fill > .68 && ar > .95) ? 'mochila' : (handleTop && ar <= 1.0) ? 'tote' : 'shoulder';
        break;
      case 'bottom':
        if (!legs && tall) catId = 'saia';
        else if (ar < 1.25) catId = ar < 1.0 ? 'short' : 'bermuda';
        else catId = denim ? 'jeans' : 'calca';
        break;
      case 'top':
        catId = (!sleeves && s.topW < .62) ? 'regata' : ar > 1.3 ? 'camisa' : 'camiseta';
        break;
      case 'outer':
        catId = ar > 1.75 ? 'casaco' : 'jaqueta';
        break;
      case 'fullbody':
        catId = 'vestido';
        break;
      default:
        catId = (ar < .3 && fill < .6) ? 'oculos' : ar > 2.6 ? 'cinto' : (ar < .6 && fill > .58) ? 'bone' : 'oculos';
    }

    const alts = CATEGORIES.filter(c => c.group === group).slice(0, 6).map(c => c.id);
    return {
      catId,
      confidence: clamp(.26 + gap * .5, .12, .75),
      alternatives: alts
    };
  },

  /* ---------- 6.3 monta o objeto final da peça ---------- */
  build(cls, pal, shape) {
    const cat = CAT[cls.catId] || CAT['outro'];
    const colors = (pal.colors || []).slice(0, 3);
    const base = colors[0]?.hex || '#8a8d92';
    const named = nameColor(base);
    const [hue, sat, lig] = Color.rgb2hsl(...Color.hex2rgb(base));

    // neutralidade: pela cor nomeada + saturação real
    const neutral = named.neutral || sat < .17 || lig < .12 || lig > .9;

    // estação a partir do warmth da categoria + tom
    const seasons = [];
    if (cat.warmth <= 2) seasons.push('calor');
    if (cat.warmth >= 2 && cat.warmth <= 4) seasons.push('ameno');
    if (cat.warmth >= 4) seasons.push('frio');
    if (!seasons.length) seasons.push('ameno');

    return {
      catId: cat.id,
      group: cat.group,
      confidence: cls.confidence,
      alternatives: cls.alternatives || [],
      colors,
      color: base,
      colorName: named.n,
      neutral,
      hue, sat, lig,
      pattern: pal.pattern || 'liso',
      styles: cat.styles.slice(),
      formality: cat.formality,
      warmth: cat.warmth,
      seasons,
      ar: shape ? +shape.ar.toFixed(2) : 1
    };
  }
};


/* ============================================================================
   6b. SEGMENTADOR DE ROUPAS
   Modelo SegFormer treinado para "human parsing": recebe a foto de uma pessoa
   vestida e devolve uma máscara por peça (blusa, calça, saia, vestido, sapato,
   bolsa, cinto, óculos, boné, cachecol). É o que permite catalogar a partir de
   uma selfie de espelho, em vez de exigir foto da peça em fundo liso.
   ========================================================================= */
const Segmenter = {
  MODEL: 'Xenova/segformer_b2_clothes',
  LIB: 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.5.1/dist/transformers.min.js',
  pipe: null, loading: null, failed: false, progress: 0,

  async load(onProgress) {
    if (this.pipe) return this.pipe;
    if (this.loading) return this.loading;
    this.loading = (async () => {
      const mod = await import(this.LIB);
      mod.env.allowLocalModels = false;
      const seen = {};
      this.pipe = await mod.pipeline('image-segmentation', this.MODEL, {
        dtype: 'q8',
        progress_callback: p => {
          if (p.status === 'progress' && p.total) {
            seen[p.file] = p.loaded / p.total;
            const vals = Object.values(seen);
            this.progress = vals.reduce((a, b) => a + b, 0) / vals.length;
            onProgress?.(this.progress);
          }
        }
      });
      return this.pipe;
    })().catch(e => {
      console.warn('[closet] segmentação indisponível:', e);
      this.failed = true; this.loading = null;
      throw e;
    });
    return this.loading;
  },

  /* rótulo do modelo → como o app trata a peça */
  MAP: {
    'Upper-clothes': { group: 'top',       min: .012 },
    'Pants':         { group: 'bottom',    min: .012 },
    'Skirt':         { group: 'bottom',    min: .012, cat: 'saia' },
    'Dress':         { group: 'fullbody',  min: .015, cat: 'vestido' },
    'Left-shoe':     { group: 'shoes',     min: .002, cat: 'tenis', merge: 'shoes' },
    'Right-shoe':    { group: 'shoes',     min: .002, cat: 'tenis', merge: 'shoes' },
    'Bag':           { group: 'bag',       min: .004 },
    'Belt':          { group: 'accessory', min: .0012, cat: 'cinto' },
    'Hat':           { group: 'accessory', min: .0025, cat: 'bone' },
    'Sunglasses':    { group: 'accessory', min: .0008, cat: 'oculos' },
    'Scarf':         { group: 'accessory', min: .004,  cat: 'cachecol' }
  },

  /* ---- estatísticas lidas direto da máscara do modelo, sem redimensionar.
          Varre de 2 em 2 pixels: bbox e área saem com precisão de sobra e o
          custo cai a um quarto. ---- */
  scan(mask) {
    const w = mask.width, h = mask.height, d = mask.data, ch = mask.channels || 1;
    let area = 0, x0 = w, y0 = h, x1 = -1, y1 = -1;
    for (let y = 0; y < h; y += 2) {
      const row = y * w;
      for (let x = 0; x < w; x += 2) {
        if (d[(row + x) * ch] <= 127) continue;
        area++;
        if (x < x0) x0 = x; if (x > x1) x1 = x;
        if (y < y0) y0 = y; if (y > y1) y1 = y;
      }
    }
    return { area: area * 4, x0, y0, x1, y1, w: x1 - x0 + 1, h: y1 - y0 + 1, mw: w, mh: h };
  },

  /* máscara → matriz booleana no tamanho do canvas (só para as peças mantidas) */
  rescale(mask, w, h) {
    const m = new Uint8Array(w * h);
    const mw = mask.width, mh = mask.height, md = mask.data, ch = mask.channels || 1;
    for (let y = 0; y < h; y++) {
      const sy = Math.min(mh - 1, (y * mh / h) | 0) * mw;
      const row = y * w;
      for (let x = 0; x < w; x++) {
        const sx = Math.min(mw - 1, (x * mw / w) | 0);
        if (md[(sy + sx) * ch] > 127) m[row + x] = 1;
      }
    }
    return m;
  },

  /* cores dominantes dos pixels cobertos pela máscara */
  colorsOf(ctx, m, w, h, st) {
    const img = ctx.getImageData(0, 0, w, h).data;
    const labs = [], rgbs = [];
    const step = Math.max(1, Math.floor(Math.sqrt(st.area / 2600)));
    for (let y = st.y0; y <= st.y1; y += step) {
      for (let x = st.x0; x <= st.x1; x += step) {
        if (!m[y * w + x]) continue;
        const i = (y * w + x) * 4;
        const r = img[i], g = img[i + 1], b = img[i + 2];
        const l = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
        if (l < .045 || l > .985) continue;          // sombra dura e estouro de luz
        labs.push(Color.rgb2lab(r, g, b)); rgbs.push([r, g, b]);
      }
    }
    if (labs.length < 20) return { colors: [{ hex: '#8a8d92', ratio: 1 }], pattern: 'liso' };

    const cs = Vision.kmeans(labs, 3, 8).filter(k => k.count / labs.length > .08);
    const total = cs.reduce((a, k) => a + k.count, 0);
    let colors = cs.map(k => {
      let sr = 0, sg = 0, sb = 0, n = 0;
      for (let i = 0; i < labs.length; i++)
        if (Color.dist(labs[i], k.lab) < 16) { sr += rgbs[i][0]; sg += rgbs[i][1]; sb += rgbs[i][2]; n++; }
      return { hex: n ? Color.rgb2hex(sr / n, sg / n, sb / n) : '#8a8d92', ratio: k.count / total, lab: k.lab };
    });
    const merged = [];
    for (const c of colors) {
      const near = merged.find(m2 => Color.dist(m2.lab, c.lab) < 15 || nameColor(m2.hex).n === nameColor(c.hex).n);
      if (near) near.ratio += c.ratio; else merged.push({ ...c });
    }
    colors = merged.sort((a, b) => b.ratio - a.ratio).map(c => ({ hex: c.hex, ratio: c.ratio }));

    let variance = 0;
    for (const l of labs) variance += Color.dist(l, cs[0].lab);
    variance /= labs.length;
    const sec = colors[1]?.ratio || 0;
    const pattern = (variance > 24 && sec > .2) ? 'estampado' : (variance > 16 && sec > .28) ? 'listrado' : 'liso';
    return { colors, pattern };
  },

  /* recorte da foto com a peça isolada — serve de comprovação visual */
  crop(src, m, w, h, st, out = 260) {
    const c = document.createElement('canvas');
    c.width = out; c.height = out;
    const ctx = c.getContext('2d');
    const tmp = document.createElement('canvas');
    tmp.width = st.w; tmp.height = st.h;
    const tctx = tmp.getContext('2d', { willReadFrequently: true });
    tctx.drawImage(src, st.x0, st.y0, st.w, st.h, 0, 0, st.w, st.h);
    const d = tctx.getImageData(0, 0, st.w, st.h);
    for (let y = 0; y < st.h; y++) for (let x = 0; x < st.w; x++)
      if (!m[(y + st.y0) * w + (x + st.x0)]) d.data[(y * st.w + x) * 4 + 3] = 0;
    tctx.putImageData(d, 0, 0);
    const sc = Math.min((out - 16) / st.w, (out - 16) / st.h);
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(tmp, (out - st.w * sc) / 2, (out - st.h * sc) / 2, st.w * sc, st.h * sc);
    return c;
  },

  /* --------- detecta todas as peças de uma foto --------- */
  BODY: ['Face', 'Hair', 'Left-arm', 'Right-arm', 'Left-leg', 'Right-leg'],

  async detect(canvas) {
    const pipe = await this.load();
    const out = await pipe(canvas.toDataURL('image/jpeg', .92));
    const w = canvas.width, h = canvas.height;

    // 1ª passada: área e caixa de cada rótulo que interessa
    const info = {};
    for (const seg of out) {
      if (!seg?.mask) continue;
      if (!this.MAP[seg.label] && !this.BODY.includes(seg.label)) continue;
      info[seg.label] = { mask: seg.mask, st: this.scan(seg.mask) };
    }
    const mtotal = (Object.values(info)[0]?.st.mw || w) * (Object.values(info)[0]?.st.mh || h);

    // evidência de pessoa: rosto, cabelo, braços e pernas. Sem isso o modelo
    // tende a inventar peças em cima de uma foto de roupa solta — quem decide
    // o que fazer com essa informação é analysePhoto().
    let person = 0;
    for (const l of this.BODY) person += info[l]?.st.area || 0;
    person /= mtotal;

    const ext = lbls => {
      let top = Infinity, bottom = -1, area = 0;
      for (const l of lbls) {
        const i = info[l]; if (!i || i.st.x1 < 0) continue;
        area += i.st.area;
        if (i.st.y0 < top) top = i.st.y0;
        if (i.st.y1 > bottom) bottom = i.st.y1;
      }
      return { top, bottom, area };
    };
    const arms = ext(['Left-arm', 'Right-arm']);
    const legs = ext(['Left-leg', 'Right-leg']);
    const shoesE = ext(['Left-shoe', 'Right-shoe']);

    // 3. sapatos viram uma peça só
    const labels = Object.keys(info).filter(l => this.MAP[l]);
    const merged = {};
    for (const l of labels) merged[l] = info[l];
    if (merged['Left-shoe'] && merged['Right-shoe']) delete merged['Right-shoe'];

    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    const found = [];
    for (const [label, i] of Object.entries(merged)) {
      const cfg = this.MAP[label];
      const share = i.st.area / mtotal;
      if (i.st.x1 < 0 || share < cfg.min) continue;

      // máscara no tamanho do canvas, agora que a peça foi aprovada
      let m = this.rescale(i.mask, w, h);
      if (label === 'Left-shoe' && info['Right-shoe']) {
        const r = this.rescale(info['Right-shoe'].mask, w, h);
        for (let k = 0; k < m.length; k++) if (r[k]) m[k] = 1;
      }
      const sx = w / i.st.mw, sy = h / i.st.mh;
      const st = {
        area: i.st.area, x0: Math.max(0, Math.floor(i.st.x0 * sx)), y0: Math.max(0, Math.floor(i.st.y0 * sy)),
        x1: Math.min(w - 1, Math.ceil(i.st.x1 * sx)), y1: Math.min(h - 1, Math.ceil(i.st.y1 * sy))
      };
      if (label === 'Left-shoe' && info['Right-shoe']) {
        const r = info['Right-shoe'].st;
        st.x0 = Math.min(st.x0, Math.floor(r.x0 * sx)); st.x1 = Math.max(st.x1, Math.ceil(r.x1 * sx));
        st.y0 = Math.min(st.y0, Math.floor(r.y0 * sy)); st.y1 = Math.max(st.y1, Math.ceil(r.y1 * sy));
      }
      st.w = st.x1 - st.x0 + 1; st.h = st.y1 - st.y0 + 1;

      const { colors, pattern } = this.colorsOf(ctx, m, w, h, st);
      let catId = cfg.cat;

      if (label === 'Upper-clothes') {
        const rel = arms.bottom >= 0 && i.st.h > 0 ? (arms.top - i.st.y0) / i.st.h : .45;
        const shareArms = i.st.area ? arms.area / i.st.area : .2;
        catId = rel > .78 ? 'camisa' : (rel < .22 || shareArms > .38) ? 'regata' : 'camiseta';
      } else if (label === 'Pants') {
        const ankle = Math.max(legs.bottom, shoesE.top >= 0 ? shoesE.top : -1);
        const span = ankle > i.st.y0 ? ankle - i.st.y0 : i.st.h;
        const cover = span > 0 ? i.st.h / span : 1;
        const [hh, ss, ll] = Color.rgb2hsl(...Color.hex2rgb(colors[0].hex));
        const denim = hh > 190 && hh < 250 && ss > .10 && ss < .55 && ll > .18 && ll < .72;
        catId = cover > .78 ? (denim ? 'jeans' : 'calca') : cover > .45 ? 'bermuda' : 'short';
      } else if (label === 'Bag') {
        catId = st.h > st.w * 1.15 ? 'mochila' : 'shoulder';
      }

      found.push({
        label, catId: catId || 'outro', group: cfg.group,
        colors, pattern, share,
        cropCanvas: this.crop(canvas, m, w, h, st)
      });
    }
    found.sort((a, b) => b.share - a.share);
    return { person, garments: found };
  }
};

/* ============================================================================
   7. GERADOR DE LOOKS
   Filosofia: elegante, discreto, sem gritar. Disciplina de neutros,
   harmonia de matiz, contraste de valor controlado e coerência de formalidade.
   ========================================================================= */
const Stylist = {
  LOOK_ADJ: ['Discreto', 'Silencioso', 'Sereno', 'Limpo', 'Depurado', 'Sóbrio', 'Elegante', 'Preciso', 'Suave', 'Contido'],

  itemColor(it) {
    const [h, s, l] = Color.rgb2hsl(...Color.hex2rgb(it.color));
    return { h, s, l, neutral: it.neutral, lab: Color.rgb2lab(...Color.hex2rgb(it.color)) };
  },

  /* ---- filtra o que pode entrar num look desta ocasião/clima ---- */
  eligible(items, occ, weather, paletteMode) {
    const w = WEATHERS.find(x => x.id === weather) || WEATHERS[3];
    return items.filter(it => {
      const cat = CAT[it.catId]; if (!cat) return false;
      const primary = (it.styles && it.styles[0]) || 'casual';
      if (occ.ban.includes(primary)) return false;
      if (!it.styles.some(s => occ.styles.includes(s))) return false;
      // barreira rígida de registro: nada de chinelo em cerimônia nem blazer no treino
      if (cat.formality < occ.formality[0] - 1.4 || cat.formality > occ.formality[1] + 1.2) return false;
      if (occ.maxWarmth && cat.warmth > occ.maxWarmth) return false;
      if (cat.warmth > 0 && (cat.warmth < w.warmth[0] - 1.0 || cat.warmth > w.warmth[1] + .6)) return false;
      if (paletteMode === 'neutro' && !it.neutral) return false;
      if (it.archived) return false;
      return true;
    });
  },

  /* ---- avaliação: média ponderada de critérios, cada um normalizado em 0..1.
          Somar bônus soltos saturava tudo em 99; assim as notas separam de fato
          o look bem resolvido do meramente aceitável. ---------------------- */
  score(look, occ, paletteMode, recent) {
    const CORE = ['top', 'bottom', 'fullbody', 'outer', 'shoes'];
    const core = look.filter(i => CORE.includes(i.group));
    const cols = look.map(i => this.itemColor(i));
    const reasons = [];
    const sub = {};

    /* ---- contenção: neutros, saturação e estampas ---- */
    const accentItems = look.filter(i => !i.neutral);
    const maxAccent = paletteMode === 'cor' ? 1 : (occ.maxAccent ?? 1);
    let neutralS;
    if (accentItems.length === 0) {
      neutralS = paletteMode === 'cor' ? .7 : 1;
      if (paletteMode !== 'cor') reasons.push('paleta inteiramente neutra');
    } else if (accentItems.length <= maxAccent) {
      neutralS = 1;
      reasons.push(`um único ponto de cor em ${accentItems[0].colorName}`);
    } else {
      neutralS = clamp(1 - (accentItems.length - maxAccent) * .42, 0, 1);
    }
    const maxSat = Math.max(0, ...cols.map(c => c.s));
    const satS = maxSat > .70 ? .12 : maxSat > .50 ? .5 : maxSat > .32 ? .82 : 1;
    if (satS === 1) reasons.push('tons dessaturados');
    const patterned = look.filter(i => i.pattern !== 'liso').length;
    const patS = patterned === 0 ? 1 : patterned === 1 ? .78 : .2;
    if (patterned === 0) reasons.push('tudo liso, sem ruído visual');
    sub.restraint = neutralS * .5 + satS * .3 + patS * .2;

    /* ---- harmonia de matiz entre as peças com cor ---- */
    const chromatic = cols.filter(c => c.s > .18);
    let harmony = 1, clashes = 0;
    for (let i = 0; i < chromatic.length; i++) {
      for (let j = i + 1; j < chromatic.length; j++) {
        const dh = Color.hueDelta(chromatic[i].h, chromatic[j].h);
        if (dh < 28) continue;
        if (dh < 55) harmony -= .08;
        else if (dh < 150) { harmony -= .34; clashes++; }
        else { harmony -= .42; clashes++; }
      }
    }
    sub.harmony = clamp(harmony, 0, 1);
    if (chromatic.length >= 2 && !clashes) reasons.push('matizes na mesma família');

    /* ---- contraste de valor entre cima e baixo ---- */
    const top = look.find(i => i.group === 'top') || look.find(i => i.group === 'fullbody');
    const bot = look.find(i => i.group === 'bottom');
    if (top && bot) {
      const ct = this.itemColor(top), cb = this.itemColor(bot);
      const dl = Math.abs(ct.l - cb.l), dh = Color.hueDelta(ct.h, cb.h);
      if (dl >= .14 && dl <= .5) { sub.contrast = 1; reasons.push('contraste de claro e escuro bem calibrado'); }
      else if (dl > .62) { sub.contrast = .82; reasons.push('contraste alto e clássico'); }
      else if (dl < .07 && dh <= 22) { sub.contrast = .88; reasons.push('leitura monocromática'); }
      else if (dl < .07) sub.contrast = .3;               // quase igual, mas não igual
      else sub.contrast = .66;
    } else sub.contrast = .75;

    /* ---- coerência: todas as peças no mesmo registro ---- */
    const fs = core.map(i => CAT[i.catId].formality);
    if (fs.length) {
      const spread = Math.max(...fs) - Math.min(...fs);
      sub.coherence = spread <= 1 ? 1 : spread === 2 ? .58 : spread === 3 ? .24 : .06;
      if (spread <= 1) reasons.push('registro de formalidade uniforme');
    } else sub.coherence = .5;

    /* ---- adequação à ocasião: janela de formalidade + peças típicas ---- */
    const avgF = fs.length ? fs.reduce((a, b) => a + b, 0) / fs.length : 3;
    const [lo, hi] = occ.formality;
    const inWindow = avgF < lo ? clamp(1 - (lo - avgF) / 1.5, 0, 1)
      : avgF > hi ? clamp(1 - (avgF - hi) / 1.5, 0, 1) : 1;
    const prefHits = look.filter(i => occ.prefer?.includes(i.catId)).length;
    const prefS = clamp(prefHits / clamp(core.length, 2, 4), 0, 1);
    sub.fit = inWindow * .68 + prefS * .32;
    if (inWindow === 1 && prefS >= .75) reasons.push(`calibrado para ${occ.label.toLowerCase()}`);

    /* ---- clima ---- */
    const wr = (WEATHERS.find(x => x.id === (occ._weather || 'qualquer')) || WEATHERS[3]).warmth;
    let viol = 0;
    for (const i of look) {
      const wm = CAT[i.catId].warmth;
      if (wm > 0 && (wm > wr[1] + .8 || wm < wr[0] - 1.2)) viol++;
    }
    sub.weather = clamp(1 - viol * .3, 0, 1);

    /* ---- completude ---- */
    const hasBase = look.some(i => i.group === 'fullbody') || (top && bot);
    const hasShoes = look.some(i => i.group === 'shoes');
    const hasLayer = look.some(i => ['outer', 'bag', 'accessory'].includes(i.group));
    sub.completeness = (hasBase ? .55 : 0) + (hasShoes ? .35 : 0) + (hasLayer ? .10 : 0);

    /* ---- acabamento: eco de couro, novidade, tom noturno ---- */
    let detail = .58;
    const shoe = look.find(i => i.group === 'shoes');
    const leather = look.filter(i => ['cinto', 'bolsa', 'shoulder', 'mochila', 'tote'].includes(i.catId));
    if (shoe && leather.length &&
        leather.some(l => Color.dist(this.itemColor(l).lab, this.itemColor(shoe).lab) < 26)) {
      detail += .32; reasons.push('calçado e couro conversando');
    }
    if (occ.darkBias) {
      const avgL = cols.reduce((a, c) => a + c.l, 0) / Math.max(1, cols.length);
      if (avgL < .38) { detail += .18; reasons.push('paleta noturna'); }
      else if (avgL > .68) detail -= .22;
    }
    detail -= look.filter(i => recent.has(i.id)).length * .1;
    sub.detail = clamp(detail, 0, 1);

    const W = { fit: 2.4, coherence: 1.5, restraint: 1.9, harmony: 1.5, contrast: 1.0, weather: .8, completeness: 1.3, detail: .5 };
    let num = 0, den = 0;
    for (const k in W) { num += W[k] * sub[k]; den += W[k]; }

    return {
      score: clamp(Math.round(num / den * 100), 5, 99),
      reasons: [...new Set(reasons)],
      sub
    };
  },

  name(look, occ) {
    const cols = look.map(i => this.itemColor(i));
    const accents = look.filter(i => !i.neutral);
    const avgL = cols.reduce((a, c) => a + c.l, 0) / Math.max(1, cols.length);
    const families = [...new Set(look.map(i => i.colorName))];
    const top = look.find(i => i.group === 'top') || look.find(i => i.group === 'fullbody');
    const bot = look.find(i => i.group === 'bottom');

    if (accents.length === 0 && families.length <= 2) return `Monocromático ${top?.colorName || families[0]}`;
    if (accents.length === 1) return `Neutro com ${accents[0].colorName}`;
    if (top && bot && Math.abs(this.itemColor(top).l - this.itemColor(bot).l) > .55) return `${top.colorName} sobre ${bot.colorName}`;
    if (avgL < .32) return `${pick(this.LOOK_ADJ)} em tons profundos`;
    if (avgL > .62) return `${pick(this.LOOK_ADJ)} em tons claros`;
    return `${pick(this.LOOK_ADJ)} · ${occ.label.toLowerCase()}`;
  },

  /* ---- montagem: sorteia composições válidas e devolve as melhores ---- */
  generate(items, opts) {
    const occ = OCC[opts.occasion] || OCCASIONS[1];
    const pool = this.eligible(items, occ, opts.weather, opts.palette);
    const byGroup = g => pool.filter(i => i.group === g);

    const tops = byGroup('top'), bottoms = byGroup('bottom'), fulls = byGroup('fullbody');
    const outers = byGroup('outer'), shoes = byGroup('shoes'), bags = byGroup('bag'), accs = byGroup('accessory');

    if (!shoes.length && !tops.length && !fulls.length) {
      return { looks: [], error: 'Cadastre pelo menos algumas peças de cima, de baixo e um calçado para gerar looks.' };
    }
    if (!fulls.length && (!tops.length || !bottoms.length)) {
      return { looks: [], error: `Faltam peças compatíveis com "${occ.label}". Adicione mais itens ou troque a ocasião/clima.` };
    }

    const recent = new Set(opts.recent || []);
    const pinned = opts.pinned ? items.find(i => i.id === opts.pinned) : null;

    occ._weather = opts.weather;
    const combos = [];
    const seen = new Set();
    const ATTEMPTS = 900;

    for (let n = 0; n < ATTEMPTS; n++) {
      const look = [];
      const useFull = fulls.length && (!tops.length || !bottoms.length || Math.random() < .22);

      if (pinned) look.push(pinned);
      const has = g => look.some(i => i.group === g);

      if (useFull && !has('top') && !has('bottom')) {
        if (!has('fullbody')) { const f = pick(fulls); if (f) look.push(f); }
      } else {
        if (!has('fullbody')) {
          if (!has('top') && tops.length) look.push(pick(tops));
          if (!has('bottom') && bottoms.length) look.push(pick(bottoms));
        }
      }
      if (!has('shoes') && shoes.length) look.push(pick(shoes));
      if (!has('outer') && outers.length && Math.random() < occ.outer) look.push(pick(outers));
      if (!has('bag') && bags.length && Math.random() < occ.bag) look.push(pick(bags));
      if (accs.length && Math.random() < occ.acc) {
        const a = pick(accs);
        if (!look.some(i => i.id === a.id)) look.push(a);
      }

      // validade mínima
      const okBase = look.some(i => i.group === 'fullbody') || (look.some(i => i.group === 'top') && look.some(i => i.group === 'bottom'));
      if (!okBase) continue;

      const key = look.map(i => i.id).sort().join('|');
      if (seen.has(key)) continue;
      seen.add(key);

      const ev = this.score(look, occ, opts.palette, recent);
      combos.push({ items: look, ...ev, key });
    }

    combos.sort((a, b) => b.score - a.score);

    // diversidade: evita 5 looks quase iguais
    const out = [];
    for (const c of combos) {
      if (out.length >= (opts.count || 6)) break;
      const dup = out.some(o => {
        const inter = o.items.filter(i => c.items.some(j => j.id === i.id)).length;
        return inter >= Math.min(o.items.length, c.items.length) - 1;
      });
      if (dup) continue;
      out.push(c);
    }
    return {
      looks: out.map(l => ({
        id: uid(),
        occasion: occ.id,
        weather: opts.weather,
        itemIds: l.items.map(i => i.id),
        items: l.items,
        score: l.score,
        reasons: l.reasons,
        title: this.name(l.items, occ),
        createdAt: Date.now()
      }))
    };
  }
};

/* ============================================================================
   8. APLICAÇÃO
   ========================================================================= */
const APP = {
  items: [], looks: [], urls: new Map(),
  view: 'closet',
  filter: { cat: 'todos', styles: [], colors: [], patterns: [], fav: false },
  grouped: true, labels: false,
  gen: { occasion: 'diaadia', weather: 'ameno', palette: 'equilibrado', pinned: null, results: [] },
  settings: { detect: true, showPhoto: false },
  queue: [], reviewIdx: 0,

  /* ---------- 8.1 boot ---------- */
  async init() {
    try {
      const s = JSON.parse(localStorage.getItem('closet.settings') || '{}');
      this.settings = { ...this.settings, ...s };
      const ui = JSON.parse(localStorage.getItem('closet.ui') || '{}');
      this.grouped = ui.grouped ?? true;
      this.labels = ui.labels ?? false;
    } catch (e) { }

    this.items = (await DB.all('items')) || [];
    this.looks = (await DB.all('looks')) || [];
    this.items.sort((a, b) => b.createdAt - a.createdAt);
    this.looks.sort((a, b) => b.createdAt - a.createdAt);

    this.bindInputs();
    this.renderCatChips();
    this.renderOccasions();
    this.renderGenControls();
    this.syncUI();
    this.render();
    this.registerSW();

  },

  registerSW() {
    if (!('serviceWorker' in navigator)) return;
    navigator.serviceWorker.register('/sw-guarda-roupa.js').catch(() => { });
  },

  bindInputs() {
    $('#pickAlbum').addEventListener('change', e => this.onFiles(e.target.files, e.target));
    $('#pickCamera').addEventListener('change', e => this.onFiles(e.target.files, e.target));
    $('#importFile').addEventListener('change', e => this.importBackup(e.target.files[0], e.target));
  },

  syncUI() {
    $('#sw-detect').classList.toggle('on', this.settings.detect);
    $('#sw-photo').classList.toggle('on', this.settings.showPhoto);
    $('#groupBtn').classList.toggle('on', this.grouped);
    $('#labelBtn').classList.toggle('on', this.labels);
    document.body.classList.toggle('labels', this.labels);
  },

  saveSettings() {
    localStorage.setItem('closet.settings', JSON.stringify(this.settings));
    localStorage.setItem('closet.ui', JSON.stringify({ grouped: this.grouped, labels: this.labels }));
  },

  /* ---------- 8.2 navegação ---------- */
  go(v) {
    this.view = v;
    $$('.view').forEach(s => s.classList.toggle('active', s.id === 'v-' + v));
    $$('.nav button').forEach(b => b.classList.toggle('on', b.dataset.v === v));
    $('#backBtn').classList.toggle('hide', v === 'closet');
    $('#fab').classList.toggle('hide', v !== 'closet');
    const titles = {
      closet: ['Closet', 'Guarda-roupa'],
      looks:  ['Estilo', 'Gerar looks'],
      saved:  ['Coleção', 'Looks salvos'],
      more:   ['Closet', 'Ajustes']
    };
    $('#topEyebrow').textContent = titles[v][0];
    $('#topTitle').textContent = titles[v][1];
    window.scrollTo({ top: 0, behavior: 'smooth' });
    haptic();
    this.render();
  },
  topAction() { if (this.view !== 'closet') this.go('closet'); },

  openMenu() {
    this.sheet(`
      <h3>Guarda-roupa</h3>
      <p class="sh-sub">${this.items.length} peça${this.items.length === 1 ? '' : 's'} cadastrada${this.items.length === 1 ? '' : 's'}.</p>
      <button class="opt" onclick="APP.closeSheet();APP.openAdd()">
        <div class="oi"><svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg></div>
        <div class="ot"><b>Adicionar peças</b><span>Álbum de fotos ou câmera</span></div></button>
      <button class="opt" onclick="APP.closeSheet();APP.go('looks')">
        <div class="oi"><svg viewBox="0 0 24 24"><path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z"/></svg></div>
        <div class="ot"><b>Gerar um look</b><span>Escolha a ocasião e receba combinações</span></div></button>
      <button class="opt" onclick="APP.closeSheet();APP.go('more')">
        <div class="oi"><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="3"/><path d="M20 12h1M3 12h1M12 3v1M12 20v1"/></svg></div>
        <div class="ot"><b>Ajustes e backup</b><span>Recorte, IA, exportar e restaurar</span></div></button>
    `);
  },

  /* ---------- 8.3 sheets ---------- */
  sheet(html) {
    $('#sheet').innerHTML = '<div class="grab"></div>' + html;
    $('#overlay').classList.add('on');
    document.body.style.overflow = 'hidden';
  },
  closeSheet() {
    $('#overlay').classList.remove('on');
    document.body.style.overflow = '';
  },
  full(title, sub, body, foot, action = '') {
    $('#fullTitle').textContent = title;
    $('#fullSub').textContent = sub || '';
    $('#fullBody').innerHTML = body;
    $('#fullFoot').innerHTML = foot || '';
    $('#fullFoot').classList.toggle('hide', !foot);
    $('#fullAction').innerHTML = action;
    $('#full').classList.add('on');
    $('#fullBody').scrollTop = 0;
    document.body.style.overflow = 'hidden';
  },
  closeFull() {
    $('#full').classList.remove('on');
    document.body.style.overflow = '';
    if (this.queue.length) { this.queue = []; }
  },

  /* ---------- 8.4 importação de fotos ---------- */
  openAdd() {
    haptic(12);
    this.sheet(`
      <h3>Adicionar peças</h3>
      <p class="sh-sub">Pode mandar várias fotos de uma vez, inclusive de você vestindo a roupa. O app identifica cada peça, extrai a cor e desenha uma reprodução dela para o catálogo.</p>
      <button class="opt" onclick="APP.closeSheet();setTimeout(()=>document.getElementById('pickAlbum').click(),180)">
        <div class="oi"><svg viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="14" rx="2.5"/><circle cx="8.5" cy="10" r="1.6"/><path d="M21 16l-5-5-5.5 5.5L8 14l-5 5"/></svg></div>
        <div class="ot"><b>Escolher do álbum</b><span>Selecione quantas fotos quiser da sua galeria</span></div>
        <div class="chev"><svg viewBox="0 0 24 24"><path d="M9 6l6 6-6 6"/></svg></div>
      </button>
      <button class="opt" onclick="APP.closeSheet();setTimeout(()=>document.getElementById('pickCamera').click(),180)">
        <div class="oi"><svg viewBox="0 0 24 24"><path d="M3 8.5A2 2 0 0 1 5 6.5h2l1.4-2h7.2L17 6.5h2a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><circle cx="12" cy="13" r="3.6"/></svg></div>
        <div class="ot"><b>Tirar foto agora</b><span>Vale foto do espelho, da peça na cama ou no cabide</span></div>
        <div class="chev"><svg viewBox="0 0 24 24"><path d="M9 6l6 6-6 6"/></svg></div>
      </button>
      <p style="font-size:12px;color:var(--mut2);line-height:1.55;margin-top:6px;padding:0 4px">
        Numa foto de corpo inteiro ele separa camisa, calça, calçado e acessórios de uma vez só.
      </p>
    `);
  },

  async onFiles(fileList, input) {
    const files = [...(fileList || [])].filter(f => f.type.startsWith('image/'));
    if (input) input.value = '';
    if (!files.length) return;
    this.closeSheet();
    await this.processFiles(files);
  },

  async processFiles(files) {
    const total = files.length;
    this.full('Analisando', `${total} foto${total > 1 ? 's' : ''}`, `
      <div class="proc">
        <div class="proc-ring">
          <svg viewBox="0 0 96 96">
            <circle class="bg" cx="48" cy="48" r="43"/>
            <circle class="fg" id="procFg" cx="48" cy="48" r="43" stroke-dasharray="270" stroke-dashoffset="270"/>
          </svg>
          <div class="pct" id="procPct">0%</div>
        </div>
        <h3 id="procTitle">Procurando as peças…</h3>
        <p id="procSub">Identificando cada roupa e extraindo as cores</p>
        <div class="proc-strip" id="procStrip"></div>
      </div>`, '');

    // o modelo de segmentação é o motor principal: carrega antes de tudo
    let useAI = this.settings.detect && !Segmenter.failed;
    if (useAI && !Segmenter.pipe) {
      $('#procTitle').textContent = 'Preparando o reconhecimento';
      $('#procSub').textContent = 'Baixando o modelo de visão (só na primeira vez)…';
      try {
        await Segmenter.load(pr => {
          const pct = Math.round(pr * 100);
          $('#procPct').textContent = pct + '%';
          $('#procFg').style.strokeDashoffset = 270 - 270 * pr;
          $('#procSub').textContent = `Baixando o modelo de visão… ${pct}%`;
        });
      } catch (e) {
        useAI = false;
        toast('Reconhecimento automático indisponível');
      }
    }

    const strip = $('#procStrip');
    files.forEach((f, i) => {
      const t = document.createElement('div');
      t.className = 't'; t.id = 'pt' + i;
      strip.appendChild(t);
    });

    const drafts = [];
    for (let i = 0; i < files.length; i++) {
      $('#procPct').textContent = Math.round(i / total * 100) + '%';
      $('#procFg').style.strokeDashoffset = 270 - 270 * (i / total);
      $('#procTitle').textContent = `Foto ${i + 1} de ${total}`;
      $('#procSub').textContent = 'Identificando cada roupa e extraindo as cores';
      await nextFrame();

      try {
        const found = await this.analysePhoto(files[i], useAI);
        drafts.push(...found);
        const t = $('#pt' + i);
        if (t && found[0]) {
          t.classList.add('done');
          const img = document.createElement('img');
          img.src = found[0].previewUrl; t.appendChild(img);
        }
      } catch (e) {
        console.warn('[closet] falha ao processar', files[i]?.name, e);
      }
      await sleep(16);
    }

    $('#procPct').textContent = '100%';
    $('#procFg').style.strokeDashoffset = 0;
    await sleep(300);

    if (!drafts.length) {
      this.closeFull();
      toast('Não consegui identificar peças nessas fotos');
      return;
    }
    this.queue = drafts;
    this.reviewIdx = 0;
    this.renderReview();
  },

  /* --------- uma foto pode virar várias peças ---------
     · foto de pessoa vestida → o modelo separa cada roupa
     · foto da peça sozinha   → usa a maior região encontrada só para pegar a
       cor certa, e deixa a silhueta dizer o tipo
     · nada disso funcionando → remoção de fundo e análise de silhueta
     O usuário pode forçar a separação em várias peças na tela de revisão.   */
  async analysePhoto(file, useAI, force = false) {
    const canvas = await Vision.fileToCanvas(file);

    // cópia menor: é o que vai para o modelo e o que guardamos para reanálise
    let seg = canvas;
    if (Math.max(canvas.width, canvas.height) > 640) {
      const sc = 640 / Math.max(canvas.width, canvas.height);
      seg = document.createElement('canvas');
      seg.width = Math.round(canvas.width * sc);
      seg.height = Math.round(canvas.height * sc);
      const sctx = seg.getContext('2d', { willReadFrequently: true });
      sctx.imageSmoothingQuality = 'high';
      sctx.drawImage(canvas, 0, 0, seg.width, seg.height);
    }
    const srcBlob = await Vision.toBlob(seg, 640, .82);
    const out = [];

    let garments = null;
    if (useAI) {
      let res = null;
      try { res = await Segmenter.detect(seg); }
      catch (e) { console.warn(e); Segmenter.failed = true; }

      if (res?.garments?.length) {
        garments = res.garments;
        // pessoa vestida na foto: cada roupa vira uma peça
        if (force || (res.person >= .012 && garments.length > 1)) {
          for (const g of garments)
            out.push(await this.makeDraft({
              catId: g.catId, colors: g.colors, pattern: g.pattern,
              evidence: g.cropCanvas, source: 'detectado', label: g.label, srcBlob
            }));
          return out;
        }
      }
    }

    // peça sozinha: a remoção de fundo dá um recorte melhor que a máscara do
    // modelo, e a silhueta limpa identifica o tipo com mais precisão
    for (const tol of [1, .72, .5]) {
      try { var cut = Vision.cutout(canvas, tol); } catch (e) { }
      if (cut) break;
    }
    if (cut) {
      const framed = Vision.trimAndFrame(cut.data);
      const pal = Vision.palette(framed.canvas);
      const cls = Classifier.heuristic(Vision.shape(framed.canvas), pal);
      out.push(await this.makeDraft({
        catId: cls.catId, colors: pal.colors, pattern: pal.pattern,
        evidence: framed.canvas, source: 'silhueta', srcBlob
      }));
      return out;
    }

    // fundo impossível de recortar, mas o modelo achou uma peça grande:
    // aproveita a máscara dela para pegar ao menos a cor certa
    if (garments && garments[0]?.share > .06) {
      const g = garments[0];
      const framed = Vision.trimAndFrame(
        g.cropCanvas.getContext('2d').getImageData(0, 0, g.cropCanvas.width, g.cropCanvas.height));
      out.push(await this.makeDraft({
        catId: g.catId, colors: g.colors, pattern: g.pattern,
        evidence: framed.canvas, source: 'detectado', label: g.label, srcBlob
      }));
      return out;
    }

    // último recurso: entrega a foto inteira para o usuário identificar
    const framed = Vision.trimAndFrame(
      canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height));
    const pal = Vision.palette(framed.canvas);
    out.push(await this.makeDraft({
      catId: 'outro', colors: pal.colors, pattern: pal.pattern,
      evidence: framed.canvas, source: 'manual', srcBlob
    }));
    return out;
  },

  /* usuário avisa que a foto tem mais de uma peça → refaz forçando a separação */
  async splitPhoto() {
    const d = this.queue[this.reviewIdx];
    if (!d?.srcBlob) return toast('Foto de origem indisponível');
    if (!this.settings.detect || Segmenter.failed) return toast('Ligue o reconhecimento em Ajustes');
    toast('Separando as peças…');
    try {
      const file = new File([d.srcBlob], 'foto.jpg', { type: d.srcBlob.type || 'image/jpeg' });
      const found = await this.analysePhoto(file, true, true);
      if (!found.length || found.length === 1) return toast('Só consegui identificar uma peça aqui');
      URL.revokeObjectURL(d.previewUrl);
      if (d.photoUrl) URL.revokeObjectURL(d.photoUrl);
      this.queue.splice(this.reviewIdx, 1, ...found);
      this.renderReview();
      haptic(15);
      toast(`${found.length} peças separadas`);
    } catch (e) { console.warn(e); toast('Não consegui separar as peças'); }
  },

  /* monta a peça: reprodução vetorial + recorte da foto como comprovação */
  async makeDraft({ catId, colors, pattern, evidence, source, label, srcBlob }) {
    const cat = CAT[catId] || CAT['outro'];
    const base = colors?.[0]?.hex || '#8a8d92';
    const named = nameColor(base);
    const [hue, sat, lig] = Color.rgb2hsl(...Color.hex2rgb(base));

    const artCanvas = await Art.toCanvas(cat.id, colors, pattern, 512);
    const artBlob = await Vision.toBlob(artCanvas, 512);
    const artThumb = await Vision.toBlob(artCanvas, 260, .9);
    const photoBlob = evidence ? await Vision.toBlob(evidence, 320, .86) : null;

    return {
      id: uid(),
      catId: cat.id, group: cat.group, source, label,
      colors: (colors || []).slice(0, 3),
      color: base, colorName: named.n,
      neutral: named.neutral || sat < .17 || lig < .12 || lig > .9,
      hue, sat, lig,
      pattern: pattern || 'liso',
      styles: cat.styles.slice(),
      seasons: cat.warmth <= 2 ? ['calor', 'ameno'] : cat.warmth >= 4 ? ['frio'] : ['ameno'],
      brand: '', notes: '', fav: false,
      artBlob, artThumb, photoBlob, srcBlob,
      previewUrl: URL.createObjectURL(artThumb),
      photoUrl: photoBlob ? URL.createObjectURL(photoBlob) : null
    };
  },

  /* redesenha a reprodução depois que o usuário muda tipo, cor ou estampa */
  async refreshArt(d) {
    try {
      const artCanvas = await Art.toCanvas(d.catId, d.colors.length ? d.colors : [{ hex: d.color, ratio: 1 }], d.pattern, 512);
      d.artBlob = await Vision.toBlob(artCanvas, 512);
      d.artThumb = await Vision.toBlob(artCanvas, 260, .9);
      URL.revokeObjectURL(d.previewUrl);
      d.previewUrl = URL.createObjectURL(d.artThumb);
    } catch (e) { console.warn(e); }
  },

  /* ---------- 8.5 tela de revisão ---------- */
  renderReview() {
    const d = this.queue[this.reviewIdx];
    if (!d) return;
    const n = this.queue.length;
    const catsOfGroup = g => CATEGORIES.filter(c => c.group === g);
    const groupOrder = Object.keys(GROUPS).sort((a, b) => GROUPS[a].order - GROUPS[b].order);
    const dots = n > 1 ? `<div class="rev-nav">${this.queue.map((_, i) => `<span class="rev-dot ${i === this.reviewIdx ? 'on' : ''}"></span>`).join('')}</div>` : '';

    const origem = {
      detectado: 'reconhecida na foto',
      silhueta: 'deduzida pela silhueta',
      manual: 'não reconhecida — confirme o tipo',
      editado: 'ajustada por você'
    }[d.source] || '';

    const body = `
      <div class="rev-stage art"><img src="${d.previewUrl}" alt=""></div>

      ${d.photoUrl ? `
      <div class="evidence">
        <img src="${d.photoUrl}" alt="">
        <div class="ev-t">
          <b>${origem}</b>
          <span>A reprodução acima usa a cor e o tipo tirados desta parte da foto. Corrija abaixo se preciso.</span>
        </div>
      </div>` : ''}
      ${dots}

      <div class="field">
        <label>Tipo da peça</label>
        <div style="display:flex;gap:8px;overflow-x:auto;padding-bottom:8px;margin:0 -16px;padding-left:16px;padding-right:16px">
          ${groupOrder.map(g => `<button class="tchip ${d.group === g ? 'on' : ''}" style="flex:none" onclick="APP.revSetGroup('${g}')">${GROUPS[g].label}</button>`).join('')}
        </div>
        <div class="wrapchips" style="margin-top:8px">
          ${catsOfGroup(d.group).map(c => `<button class="tchip ${c.id === d.catId ? 'on' : ''}" onclick="APP.revSetCat('${c.id}')">${c.label}</button>`).join('')}
        </div>
      </div>

      <div class="field">
        <label>Cor · <span style="text-transform:none;letter-spacing:0;font-weight:500">${esc(d.colorName)}</span></label>
        <div class="wrapchips">
          ${(d.colors || []).map(c => `
            <button class="tchip ${c.hex === d.color ? 'on' : ''}" onclick="APP.revSetColor('${c.hex}')">
              <span class="sw" style="background:${c.hex}"></span>${nameColor(c.hex).n}
            </button>`).join('')}
          <button class="tchip" onclick="APP.revPickColor()">outra cor…</button>
        </div>
      </div>

      <div class="field">
        <label>Padronagem</label>
        <div class="wrapchips">
          ${PATTERNS.map(p => `<button class="tchip ${d.pattern === p.id ? 'on' : ''}" onclick="APP.revSetPattern('${p.id}')">${p.label}</button>`).join('')}
        </div>
      </div>

      <div class="field">
        <label>Estilo</label>
        <div class="wrapchips">
          ${STYLES.map(s => `<button class="tchip ${d.styles.includes(s.id) ? 'on' : ''}" onclick="APP.revToggle('styles','${s.id}')">${s.label}</button>`).join('')}
        </div>
      </div>

      <div class="field">
        <label>Estação</label>
        <div class="wrapchips">
          ${SEASONS.map(s => `<button class="tchip ${d.seasons.includes(s.id) ? 'on' : ''}" onclick="APP.revToggle('seasons','${s.id}')">${s.label}</button>`).join('')}
        </div>
      </div>

      <div class="field">
        <label>Marca (opcional)</label>
        <input class="inp" type="text" value="${esc(d.brand)}" placeholder="Ex.: Adidas, Zara…" oninput="APP.revSet('brand',this.value)">
      </div>

      <div class="field">
        ${d.srcBlob && d.source !== 'detectado' ? `
        <button class="btn ghost sm" style="margin-bottom:9px" onclick="APP.splitPhoto()">
          Esta foto tem mais de uma peça
        </button>` : ''}
        <button class="btn ghost sm" onclick="APP.revDrop()">Descartar esta peça</button>
      </div>
    `;

    const foot = `
      ${n > 1 ? `<button class="btn ghost" style="flex:0 0 42%" onclick="APP.revNav(-1)" ${this.reviewIdx === 0 ? 'disabled' : ''}>Anterior</button>` : ''}
      ${this.reviewIdx < n - 1
        ? `<button class="btn primary" onclick="APP.revNav(1)">Próxima (${this.reviewIdx + 1}/${n})</button>`
        : `<button class="btn primary" onclick="APP.commitQueue()">Adicionar ${n} peça${n > 1 ? 's' : ''}</button>`}
    `;

    this.full('Revisar peças', `${this.reviewIdx + 1} de ${n}`, body, foot,
      n > 1 && this.reviewIdx < n - 1 ? `<button class="pill-btn" onclick="APP.commitQueue()">Salvar tudo</button>` : '');
  },

  revSet(k, v) { this.queue[this.reviewIdx][k] = v; },
  async revSetPattern(p) {
    const d = this.queue[this.reviewIdx];
    d.pattern = p;
    await this.refreshArt(d);
    this.renderReview();
  },
  revSetGroup(g) {
    const d = this.queue[this.reviewIdx];
    d.group = g;
    const first = CATEGORIES.find(c => c.group === g);
    if (first && CAT[d.catId]?.group !== g) return this.revSetCat(first.id);
    this.renderReview();
  },
  async revSetCat(id) {
    const d = this.queue[this.reviewIdx];
    const c = CAT[id]; if (!c) return;
    d.catId = id; d.group = c.group;
    d.styles = c.styles.slice();
    d.seasons = c.warmth <= 2 ? ['calor', 'ameno'] : c.warmth >= 4 ? ['frio'] : ['ameno'];
    d.source = 'editado';
    await this.refreshArt(d);
    this.renderReview();
  },
  async revSetColor(hex) {
    const d = this.queue[this.reviewIdx];
    d.color = hex;
    const nm = nameColor(hex);
    d.colorName = nm.n;
    const [h, s, l] = Color.rgb2hsl(...Color.hex2rgb(hex));
    d.hue = h; d.sat = s; d.lig = l;
    d.neutral = nm.neutral || s < .17 || l < .12 || l > .9;
    // a cor escolhida passa a ser a principal do desenho
    const rest = (d.colors || []).filter(c => c.hex !== hex);
    d.colors = [{ hex, ratio: .7 }, ...rest].slice(0, 3);
    await this.refreshArt(d);
    this.renderReview();
  },
  revPickColor() {
    this.sheet(`
      <h3>Escolher a cor</h3>
      <p class="sh-sub">Selecione o tom mais próximo da peça.</p>
      <div class="wrapchips">
        ${NAMED_COLORS.map(c => `<button class="tchip" onclick="APP.closeSheet();APP.revSetColor('${c.hex}')"><span class="sw" style="background:${c.hex}"></span>${c.n}</button>`).join('')}
      </div>`);
  },
  revToggle(k, v) {
    const d = this.queue[this.reviewIdx];
    const arr = d[k] || (d[k] = []);
    const i = arr.indexOf(v);
    if (i >= 0) { if (arr.length > 1) arr.splice(i, 1); } else arr.push(v);
    this.renderReview();
  },
  revNav(dir) {
    this.reviewIdx = clamp(this.reviewIdx + dir, 0, this.queue.length - 1);
    this.renderReview();
    $('#fullBody').scrollTop = 0;
  },
  revDrop() {
    const d = this.queue[this.reviewIdx];
    URL.revokeObjectURL(d.previewUrl);
    if (d.photoUrl) URL.revokeObjectURL(d.photoUrl);
    this.queue.splice(this.reviewIdx, 1);
    if (!this.queue.length) { this.closeFull(); toast('Nenhuma peça adicionada'); return; }
    this.reviewIdx = clamp(this.reviewIdx, 0, this.queue.length - 1);
    this.renderReview();
  },

  async commitQueue() {
    const now = Date.now();
    const items = [], blobs = [];
    this.queue.forEach((d, i) => {
      items.push({
        id: d.id, createdAt: now - i, catId: d.catId, group: d.group,
        color: d.color, colorName: d.colorName, colors: d.colors,
        neutral: d.neutral, hue: d.hue, sat: d.sat, lig: d.lig,
        pattern: d.pattern, styles: d.styles, seasons: d.seasons,
        formality: CAT[d.catId]?.formality ?? 3, warmth: CAT[d.catId]?.warmth ?? 2,
        brand: d.brand || '', notes: d.notes || '', fav: false,
        wearCount: 0, lastWorn: null, source: d.source, hasPhoto: !!d.photoBlob
      });
      blobs.push({ id: d.id, full: d.artBlob, thumb: d.artThumb, photo: d.photoBlob || null });
      URL.revokeObjectURL(d.previewUrl);
      if (d.photoUrl) URL.revokeObjectURL(d.photoUrl);
    });

    await DB.putMany('items', items);
    await DB.putMany('blobs', blobs);
    this.items = [...items, ...this.items].sort((a, b) => b.createdAt - a.createdAt);
    const n = this.queue.length;
    this.queue = [];
    this.closeFull();
    this.renderCatChips();
    this.render();
    haptic(20);
    toast(`${n} peça${n > 1 ? 's adicionadas' : ' adicionada'} ao guarda-roupa`);
  },

  /* ---------- 8.6 imagens ---------- */
  async url(id, kind = 'thumb') {
    const key = id + ':' + kind;
    if (this.urls.has(key)) return this.urls.get(key);
    const rec = await DB.get('blobs', id);
    if (!rec) return '';
    const blob = rec[kind] || rec.thumb || rec.full;
    if (!blob) return '';
    const u = URL.createObjectURL(blob);
    this.urls.set(key, u);
    return u;
  },
  async paintImages(root = document) {
    const nodes = $$('img[data-item]', root).filter(n => !n.src);
    await Promise.all(nodes.map(async n => {
      const u = await this.url(n.dataset.item, n.dataset.kind || 'thumb');
      if (u) n.src = u;
    }));
  },

  /* ---------- 8.7 guarda-roupa ---------- */
  renderCatChips() {
    const counts = {};
    this.items.forEach(i => { counts[i.group] = (counts[i.group] || 0) + 1; });
    const groups = Object.keys(GROUPS)
      .filter(g => counts[g])
      .sort((a, b) => GROUPS[a].order - GROUPS[b].order);
    $('#catChips').innerHTML =
      `<button class="chip ${this.filter.cat === 'todos' ? 'on' : ''}" onclick="APP.setCat('todos')">Tudo <span class="n">${this.items.length}</span></button>` +
      groups.map(g => `<button class="chip ${this.filter.cat === g ? 'on' : ''}" onclick="APP.setCat('${g}')">${GROUPS[g].label} <span class="n">${counts[g]}</span></button>`).join('') +
      `<button class="chip ${this.filter.fav ? 'on' : ''}" onclick="APP.toggleFav()">★ Favoritas</button>`;
  },
  setCat(c) { this.filter.cat = c; this.renderCatChips(); this.render(); haptic(); },
  toggleFav() { this.filter.fav = !this.filter.fav; this.renderCatChips(); this.render(); },
  toggleGroup() { this.grouped = !this.grouped; this.saveSettings(); this.syncUI(); this.render(); },
  toggleLabels() { this.labels = !this.labels; this.saveSettings(); this.syncUI(); },
  clearSearch() { $('#q').value = ''; this.render(); },

  openFilters() {
    const colorSet = [...new Set(this.items.map(i => i.colorName))];
    this.sheet(`
      <h3>Filtros</h3>
      <p class="sh-sub">Combine critérios para encontrar peças rapidamente.</p>
      <div class="field" style="margin-top:0">
        <label>Estilo</label>
        <div class="wrapchips">${STYLES.map(s => `<button class="tchip ${this.filter.styles.includes(s.id) ? 'on' : ''}" onclick="APP.filterToggle('styles','${s.id}',this)">${s.label}</button>`).join('')}</div>
      </div>
      <div class="field">
        <label>Cor</label>
        <div class="wrapchips">${colorSet.map(c => {
          const hx = NAMED_COLORS.find(x => x.n === c)?.hex || '#888';
          return `<button class="tchip ${this.filter.colors.includes(c) ? 'on' : ''}" onclick="APP.filterToggle('colors','${c}',this)"><span class="sw" style="background:${hx}"></span>${c}</button>`;
        }).join('')}</div>
      </div>
      <div class="field">
        <label>Padronagem</label>
        <div class="wrapchips">${PATTERNS.map(p => `<button class="tchip ${this.filter.patterns.includes(p.id) ? 'on' : ''}" onclick="APP.filterToggle('patterns','${p.id}',this)">${p.label}</button>`).join('')}</div>
      </div>
      <div class="btn-row">
        <button class="btn ghost" onclick="APP.resetFilters()">Limpar</button>
        <button class="btn primary" onclick="APP.closeSheet()">Ver resultados</button>
      </div>
    `);
  },
  filterToggle(k, v, el) {
    const arr = this.filter[k];
    const i = arr.indexOf(v);
    if (i >= 0) arr.splice(i, 1); else arr.push(v);
    el.classList.toggle('on');
    this.render();
  },
  resetFilters() {
    this.filter.styles = []; this.filter.colors = []; this.filter.patterns = [];
    this.closeSheet(); this.render();
  },

  filtered() {
    const q = ($('#q')?.value || '').trim().toLowerCase();
    return this.items.filter(i => {
      if (this.filter.cat !== 'todos' && i.group !== this.filter.cat) return false;
      if (this.filter.fav && !i.fav) return false;
      if (this.filter.styles.length && !this.filter.styles.some(s => i.styles.includes(s))) return false;
      if (this.filter.colors.length && !this.filter.colors.includes(i.colorName)) return false;
      if (this.filter.patterns.length && !this.filter.patterns.includes(i.pattern)) return false;
      if (q) {
        const hay = [CAT[i.catId]?.label, i.colorName, i.brand, i.pattern, ...(i.styles || [])].join(' ').toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  },

  tileHTML(i) {
    const kind = this.settings.showPhoto && i.hasPhoto ? 'photo' : 'thumb';
    return `<button class="tile" onclick="APP.openItem('${i.id}')">
      <img data-item="${i.id}" data-kind="${kind}" alt="${esc(CAT[i.catId]?.label || '')}">
      ${i.fav ? '<span class="fav"><svg viewBox="0 0 24 24"><path d="M12 21s-7-4.5-9-9a5 5 0 0 1 9-3 5 5 0 0 1 9 3c-2 4.5-9 9-9 9z"/></svg></span>' : ''}
      <span class="cat">${esc(CAT[i.catId]?.label || '')}</span>
    </button>`;
  },

  render() {
    $('#qClear')?.classList.toggle('hide', !$('#q')?.value);
    const badge = $('#filterBadge');
    const nf = this.filter.styles.length + this.filter.colors.length + this.filter.patterns.length;
    if (badge) { badge.textContent = nf; badge.classList.toggle('hide', !nf); }
    $('#filterBtn')?.classList.toggle('on', nf > 0);

    if (this.view === 'closet') this.renderCloset();
    if (this.view === 'saved') this.renderSaved();
    if (this.view === 'more') this.renderMore();
  },

  renderCloset() {
    const box = $('#closetBody');
    if (!this.items.length) {
      box.innerHTML = `
        <div class="empty">
          <div class="ico"><svg viewBox="0 0 24 24"><path d="M12 3.5a1.8 1.8 0 1 0 0 3.6c.6 0 1 .4 1 .9s-.4.8-1 1L4.3 13c-.7.4-1.1 1-1.1 1.7 0 1 .8 1.8 1.8 1.8h14c1 0 1.8-.8 1.8-1.8 0-.7-.4-1.3-1.1-1.7L12 9"/><path d="M4 20h16"/></svg></div>
          <h3>Seu guarda-roupa está vazio</h3>
          <p>Toque em <b>Criar</b> para enviar fotos das suas peças. O fundo é removido automaticamente e cada item é catalogado por tipo, cor e estilo.</p>
        </div>`;
      return;
    }
    const list = this.filtered();
    if (!list.length) {
      box.innerHTML = `<div class="empty">
        <div class="ico"><svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/></svg></div>
        <h3>Nada por aqui</h3><p>Nenhuma peça corresponde a esses filtros.</p></div>`;
      return;
    }

    if (!this.grouped || this.filter.cat !== 'todos') {
      box.innerHTML = `<div class="grid">${list.map(i => this.tileHTML(i)).join('')}</div>`;
    } else {
      const groups = {};
      list.forEach(i => (groups[i.group] = groups[i.group] || []).push(i));
      box.innerHTML = Object.keys(groups)
        .sort((a, b) => GROUPS[a].order - GROUPS[b].order)
        .map(g => `
          <div class="group-head"><span class="t">${GROUPS[g].label}</span><span class="c">${groups[g].length}</span><span class="ln"></span></div>
          <div class="grid">${groups[g].map(i => this.tileHTML(i)).join('')}</div>`).join('');
    }
    this.paintImages(box);
  },

  /* ---------- 8.8 detalhe da peça ---------- */
  async openItem(id) {
    const i = this.items.find(x => x.id === id);
    if (!i) return;
    haptic();
    const cat = CAT[i.catId] || CAT['outro'];
    const url = await this.url(id, 'full');
    this.full(cat.label, i.brand || i.colorName, `
      <div class="det-hero art"><img src="${url}" alt=""></div>
      <div class="meta-grid">
        <div class="meta"><div class="k">Tipo</div><div class="v">${cat.label}</div></div>
        <div class="meta"><div class="k">Cor</div><div class="v"><span class="sw" style="background:${i.color}"></span>${esc(i.colorName)}</div></div>
        <div class="meta"><div class="k">Formalidade</div><div class="v">${'●'.repeat(cat.formality)}<span style="color:var(--mut2)">${'○'.repeat(5 - cat.formality)}</span></div></div>
        <div class="meta"><div class="k">Usos</div><div class="v">${i.wearCount || 0}</div></div>
      </div>
      <div class="tagline">
        ${(i.styles || []).map(s => `<span class="tag">${STYLES.find(x => x.id === s)?.label || s}</span>`).join('')}
        <span class="tag">${PATTERNS.find(p => p.id === i.pattern)?.label || i.pattern}</span>
        ${(i.seasons || []).map(s => `<span class="tag">${SEASONS.find(x => x.id === s)?.label || s}</span>`).join('')}
        ${i.neutral ? '<span class="tag">neutra</span>' : '<span class="tag">cor de destaque</span>'}
      </div>
      ${i.hasPhoto ? `
      <div class="field">
        <label>Foto de origem</label>
        <div class="evidence">
          <img data-item="${i.id}" data-kind="photo" alt="">
          <div class="ev-t"><b>De onde veio</b><span>A peça no catálogo é um desenho feito a partir desta parte da foto.</span></div>
        </div>
      </div>` : ''}
      ${i.brand ? `<div class="field"><label>Marca</label><div style="font-size:15px">${esc(i.brand)}</div></div>` : ''}
      <div class="field">
        <label>Ações</label>
        <button class="opt" onclick="APP.generateFrom('${i.id}')">
          <div class="oi"><svg viewBox="0 0 24 24"><path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z"/></svg></div>
          <div class="ot"><b>Montar look com esta peça</b><span>Ela vira a âncora da combinação</span></div></button>
        <button class="opt" onclick="APP.editItem('${i.id}')">
          <div class="oi"><svg viewBox="0 0 24 24"><path d="M4 20h4L19 9a2.1 2.1 0 0 0-3-3L5 17z"/></svg></div>
          <div class="ot"><b>Editar informações</b><span>Tipo, cor, estilo, marca</span></div></button>
        <button class="opt danger" onclick="APP.deleteItem('${i.id}')">
          <div class="oi"><svg viewBox="0 0 24 24"><path d="M4 7h16M9 7V5h6v2M6 7l1 13h10l1-13"/></svg></div>
          <div class="ot"><b>Remover peça</b><span>Apaga do guarda-roupa</span></div></button>
      </div>
    `, `
      <button class="btn ghost" style="flex:0 0 30%" onclick="APP.toggleItemFav('${i.id}')">${i.fav ? '★ Favorita' : '☆ Favoritar'}</button>
      <button class="btn primary" onclick="APP.wearToday('${i.id}')">Usei hoje</button>
    `);
    this.paintImages($('#fullBody'));
  },

  async toggleItemFav(id) {
    const i = this.items.find(x => x.id === id); if (!i) return;
    i.fav = !i.fav;
    await DB.put('items', i);
    this.render(); this.openItem(id);
    toast(i.fav ? 'Adicionada às favoritas' : 'Removida das favoritas');
  },
  async wearToday(id) {
    const i = this.items.find(x => x.id === id); if (!i) return;
    i.wearCount = (i.wearCount || 0) + 1;
    i.lastWorn = Date.now();
    await DB.put('items', i);
    this.closeFull(); toast('Registrado como usado hoje'); this.render();
  },
  async deleteItem(id) {
    if (!confirm('Remover esta peça do guarda-roupa?')) return;
    await DB.del('items', id); await DB.del('blobs', id);
    this.items = this.items.filter(x => x.id !== id);
    this.looks.forEach(async l => {
      if (l.itemIds.includes(id)) { l.itemIds = l.itemIds.filter(x => x !== id); await DB.put('looks', l); }
    });
    this.closeFull(); this.renderCatChips(); this.render();
    toast('Peça removida');
  },

  editItem(id) {
    const i = this.items.find(x => x.id === id); if (!i) return;
    const groupOrder = Object.keys(GROUPS).sort((a, b) => GROUPS[a].order - GROUPS[b].order);
    this.sheet(`
      <h3>Editar peça</h3>
      <p class="sh-sub">Ajuste como ela é catalogada.</p>
      <div class="field" style="margin-top:0">
        <label>Tipo</label>
        <select class="inp" id="edCat">
          ${groupOrder.map(g => `<optgroup label="${GROUPS[g].label}">
            ${CATEGORIES.filter(c => c.group === g).map(c => `<option value="${c.id}" ${c.id === i.catId ? 'selected' : ''}>${c.label}</option>`).join('')}
          </optgroup>`).join('')}
        </select>
      </div>
      <div class="field">
        <label>Cor</label>
        <select class="inp" id="edColor">
          ${NAMED_COLORS.map(c => `<option value="${c.hex}" ${c.n === i.colorName ? 'selected' : ''}>${c.n}</option>`).join('')}
        </select>
      </div>
      <div class="field">
        <label>Estilo</label>
        <div class="wrapchips" id="edStyles">
          ${STYLES.map(s => `<button class="tchip ${i.styles.includes(s.id) ? 'on' : ''}" data-s="${s.id}" onclick="this.classList.toggle('on')">${s.label}</button>`).join('')}
        </div>
      </div>
      <div class="field">
        <label>Padronagem</label>
        <div class="wrapchips" id="edPat">
          ${PATTERNS.map(p => `<button class="tchip ${i.pattern === p.id ? 'on' : ''}" data-p="${p.id}" onclick="[...this.parentNode.children].forEach(e=>e.classList.remove('on'));this.classList.add('on')">${p.label}</button>`).join('')}
        </div>
      </div>
      <div class="field">
        <label>Marca</label>
        <input class="inp" id="edBrand" value="${esc(i.brand || '')}" placeholder="Opcional">
      </div>
      <div class="btn-row">
        <button class="btn ghost" onclick="APP.closeSheet()">Cancelar</button>
        <button class="btn primary" onclick="APP.saveEdit('${id}')">Salvar</button>
      </div>
    `);
  },
  async saveEdit(id) {
    const i = this.items.find(x => x.id === id); if (!i) return;
    const catId = $('#edCat').value, c = CAT[catId];
    i.catId = catId; i.group = c.group; i.formality = c.formality; i.warmth = c.warmth;
    const hex = $('#edColor').value;
    i.color = hex;
    const nm = nameColor(hex);
    i.colorName = nm.n;
    const [h, s, l] = Color.rgb2hsl(...Color.hex2rgb(hex));
    i.hue = h; i.sat = s; i.lig = l;
    i.neutral = nm.neutral || s < .17 || l < .12 || l > .9;
    const st = $$('#edStyles .tchip.on').map(b => b.dataset.s);
    i.styles = st.length ? st : c.styles.slice();
    i.pattern = $('#edPat .tchip.on')?.dataset.p || i.pattern;
    i.brand = $('#edBrand').value.trim();
    i.colors = [{ hex, ratio: .7 }, ...(i.colors || []).filter(c => c.hex !== hex)].slice(0, 3);
    try {
      const artCanvas = await Art.toCanvas(i.catId, i.colors, i.pattern, 512);
      const rec = (await DB.get('blobs', id)) || { id };
      rec.full = await Vision.toBlob(artCanvas, 512);
      rec.thumb = await Vision.toBlob(artCanvas, 260, .9);
      await DB.put('blobs', rec);
      for (const k of ['thumb', 'full']) {
        const key = id + ':' + k;
        if (this.urls.has(key)) { URL.revokeObjectURL(this.urls.get(key)); this.urls.delete(key); }
      }
    } catch (e) { console.warn(e); }
    await DB.put('items', i);
    this.closeSheet(); this.renderCatChips(); this.render(); this.openItem(id);
    toast('Peça atualizada');
  },

  /* ---------- 8.9 gerador de looks ---------- */
  renderOccasions() {
    $('#occGrid').innerHTML = OCCASIONS.map(o => `
      <button class="occ ${this.gen.occasion === o.id ? 'on' : ''}" onclick="APP.setOcc('${o.id}')">
        <div class="oc-i"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor">${o.icon}</svg></div>
        <div><b>${o.label}</b><span>${o.desc}</span></div>
      </button>`).join('');
  },
  setOcc(id) { this.gen.occasion = id; this.renderOccasions(); haptic(); },
  renderGenControls() {
    $('#weatherChips').innerHTML = WEATHERS.map(w =>
      `<button class="tchip ${this.gen.weather === w.id ? 'on' : ''}" onclick="APP.setGen('weather','${w.id}')">${w.label}</button>`).join('');
    $('#paletteChips').innerHTML = PALETTE_MODES.map(p =>
      `<button class="tchip ${this.gen.palette === p.id ? 'on' : ''}" onclick="APP.setGen('palette','${p.id}')">${p.label}</button>`).join('');
    this.renderPinned();
  },
  setGen(k, v) { this.gen[k] = v; this.renderGenControls(); haptic(); },
  async renderPinned() {
    const box = $('#pinnedBox');
    if (!this.gen.pinned) {
      box.innerHTML = `<button class="tchip" onclick="APP.pickPinned()">+ escolher uma peça</button>`;
      return;
    }
    const i = this.items.find(x => x.id === this.gen.pinned);
    if (!i) { this.gen.pinned = null; return this.renderPinned(); }
    box.innerHTML = `
      <div style="display:flex;align-items:center;gap:11px;background:var(--card2);border:1px solid var(--acc-line);border-radius:16px;padding:9px 12px 9px 9px">
        <div style="width:46px;height:46px;border-radius:12px;background:var(--card);display:grid;place-items:center;overflow:hidden;flex:none">
          <img data-item="${i.id}" style="width:84%;height:84%;object-fit:contain">
        </div>
        <div style="flex:1;min-width:0">
          <b style="font-size:14px;display:block">${CAT[i.catId]?.label}</b>
          <span style="font-size:12px;color:var(--mut)">${esc(i.colorName)}</span>
        </div>
        <button class="icon-btn" style="width:32px;height:32px" onclick="APP.setPinned(null)">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
        </button>
      </div>`;
    this.paintImages(box);
  },
  setPinned(id) { this.gen.pinned = id; this.renderPinned(); },
  pickPinned() {
    if (!this.items.length) return toast('Adicione peças primeiro');
    this.sheet(`
      <h3>Peça-âncora</h3>
      <p class="sh-sub">Todos os looks gerados incluirão esta peça.</p>
      <div class="grid" id="pinGrid">
        ${this.items.map(i => `<button class="tile" onclick="APP.closeSheet();APP.setPinned('${i.id}')">
          <img data-item="${i.id}"><span class="cat">${esc(CAT[i.catId]?.label || '')}</span></button>`).join('')}
      </div>`);
    this.paintImages($('#pinGrid'));
  },
  generateFrom(id) {
    this.closeFull();
    this.setPinned(id);
    this.go('looks');
    setTimeout(() => this.generate(), 260);
  },

  generate() {
    if (this.items.length < 3) {
      toast('Adicione pelo menos 3 peças para gerar looks');
      return;
    }
    haptic(15);
    const recent = this.looks.slice(0, 4).flatMap(l => l.itemIds);
    const res = Stylist.generate(this.items, {
      occasion: this.gen.occasion,
      weather: this.gen.weather,
      palette: this.gen.palette,
      pinned: this.gen.pinned,
      recent,
      count: 6
    });
    this.gen.results = res.looks || [];
    this.renderLooks(res.error);
    setTimeout(() => $('#looksResult')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 90);
  },

  lookHTML(l, saved = false) {
    const items = l.items || l.itemIds.map(id => this.items.find(x => x.id === id)).filter(Boolean);
    if (!items.length) return '';
    const occ = OCC[l.occasion];
    const why = l.reasons?.length
      ? `<b>Por que funciona:</b> ${l.reasons.slice(0, 3).join(' · ')}.`
      : '';
    const pal = [...new Set(items.map(i => i.color))].slice(0, 5);
    return `
      <div class="look">
        <div class="look-top">
          <div class="lt"><b>${esc(l.title)}</b><span>${occ ? occ.label : ''} · ${items.map(i => CAT[i.catId]?.label).join(', ')}</span></div>
          <div class="score"><svg viewBox="0 0 24 24"><path d="M12 3l2.5 6.2 6.5.5-5 4.3 1.6 6.4L12 17l-5.6 3.4L8 14 3 9.7l6.5-.5z"/></svg>${l.score ?? ''}</div>
        </div>
        <div class="look-items" style="grid-template-columns:repeat(${items.length},1fr)">
          ${items.map(i => `<button class="look-item" onclick="APP.openItem('${i.id}')">
            <img data-item="${i.id}">
            ${this.gen.pinned === i.id ? '<span class="lk"><svg viewBox="0 0 24 24"><path d="M7 11V8a5 5 0 0 1 10 0v3"/><rect x="5" y="11" width="14" height="9" rx="2"/></svg></span>' : ''}
          </button>`).join('')}
        </div>
        <div class="palette">${pal.map(c => `<span class="p" style="background:${c}"></span>`).join('')}<span class="pl">${[...new Set(items.map(i => i.colorName))].slice(0, 3).join(' · ')}</span></div>
        ${why ? `<div class="look-why">${why}</div>` : ''}
        <div class="look-acts">
          ${saved
            ? `<button onclick="APP.wearLook('${l.id}')"><svg viewBox="0 0 24 24"><path d="M20 6L9 17l-5-5"/></svg>Usei hoje</button>
               <button onclick="APP.deleteLook('${l.id}')"><svg viewBox="0 0 24 24"><path d="M4 7h16M9 7V5h6v2M6 7l1 13h10l1-13"/></svg>Excluir</button>`
            : `<button onclick="APP.saveLook('${l.id}')"><svg class="fillable" viewBox="0 0 24 24"><path d="M6 3.5h12a1 1 0 0 1 1 1v15.6a.6.6 0 0 1-.94.5L12 16.6l-6.06 4a.6.6 0 0 1-.94-.5V4.5a1 1 0 0 1 1-1z"/></svg>Salvar</button>
               <button onclick="APP.swapLook('${l.id}')"><svg viewBox="0 0 24 24"><path d="M17 2l4 4-4 4"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><path d="M7 22l-4-4 4-4"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/></svg>Trocar</button>`}
        </div>
      </div>`;
  },

  renderLooks(error) {
    const box = $('#looksResult');
    if (error) {
      box.innerHTML = `<div class="empty"><div class="ico"><svg viewBox="0 0 24 24"><path d="M12 8v5M12 16.5v.5"/><circle cx="12" cy="12" r="9"/></svg></div>
        <h3>Não deu para montar</h3><p>${esc(error)}</p></div>`;
      return;
    }
    if (!this.gen.results.length) { box.innerHTML = ''; return; }
    box.innerHTML = `
      <div class="section-head"><h2>${this.gen.results.length} look${this.gen.results.length > 1 ? 's' : ''} para você</h2>
        <button class="link" onclick="APP.generate()">Gerar de novo</button></div>
      ${this.gen.results.map(l => this.lookHTML(l)).join('')}`;
    this.paintImages(box);
  },

  async saveLook(id) {
    const l = this.gen.results.find(x => x.id === id); if (!l) return;
    const rec = {
      id: l.id, title: l.title, occasion: l.occasion, weather: l.weather,
      itemIds: l.itemIds, score: l.score, reasons: l.reasons, createdAt: Date.now(), wearCount: 0
    };
    await DB.put('looks', rec);
    this.looks.unshift(rec);
    haptic(18);
    toast('Look salvo');
  },
  swapLook(id) {
    const idx = this.gen.results.findIndex(x => x.id === id);
    if (idx < 0) return;
    const recent = this.gen.results.flatMap(l => l.itemIds);
    const res = Stylist.generate(this.items, {
      occasion: this.gen.occasion, weather: this.gen.weather, palette: this.gen.palette,
      pinned: this.gen.pinned, recent, count: 3
    });
    const fresh = (res.looks || []).find(nl => !this.gen.results.some(o => o.itemIds.join() === nl.itemIds.join()));
    if (!fresh) return toast('Sem outra combinação boa com essas peças');
    this.gen.results[idx] = fresh;
    this.renderLooks();
    haptic();
  },
  async deleteLook(id) {
    await DB.del('looks', id);
    this.looks = this.looks.filter(l => l.id !== id);
    this.renderSaved(); toast('Look excluído');
  },
  async wearLook(id) {
    const l = this.looks.find(x => x.id === id); if (!l) return;
    l.wearCount = (l.wearCount || 0) + 1;
    await DB.put('looks', l);
    for (const iid of l.itemIds) {
      const it = this.items.find(x => x.id === iid);
      if (it) { it.wearCount = (it.wearCount || 0) + 1; it.lastWorn = Date.now(); await DB.put('items', it); }
    }
    toast('Registrado! Bom look.');
  },

  renderSaved() {
    const box = $('#savedBody');
    if (!this.looks.length) {
      box.innerHTML = `<div class="empty">
        <div class="ico"><svg viewBox="0 0 24 24"><path d="M6 3.5h12a1 1 0 0 1 1 1v15.6a.6.6 0 0 1-.94.5L12 16.6l-6.06 4a.6.6 0 0 1-.94-.5V4.5a1 1 0 0 1 1-1z"/></svg></div>
        <h3>Nenhum look salvo</h3><p>Gere combinações na aba <b>Looks</b> e salve as suas favoritas para consultar depois.</p></div>`;
      return;
    }
    box.innerHTML = `<div style="margin-top:14px">${this.looks.map(l => this.lookHTML(l, true)).join('')}</div>`;
    this.paintImages(box);
  },

  /* ---------- 8.10 ajustes ---------- */
  renderMore() {
    const g = {};
    this.items.forEach(i => g[i.group] = (g[i.group] || 0) + 1);
    const neutral = this.items.filter(i => i.neutral).length;
    $('#statRow').innerHTML = `
      <div class="stat"><div class="n">${this.items.length}</div><div class="l">peças</div></div>
      <div class="stat"><div class="n">${this.looks.length}</div><div class="l">looks</div></div>
      <div class="stat"><div class="n">${this.items.length ? Math.round(neutral / this.items.length * 100) : 0}%</div><div class="l">neutras</div></div>`;
    const el = $('#aiStatus');
    if (el) {
      el.textContent = Segmenter.pipe ? 'Modelo carregado e pronto.'
        : Segmenter.failed ? 'O modelo não carregou neste aparelho. Sem ele, o app só consegue ler fotos da peça sozinha em fundo liso.'
        : this.settings.detect ? 'O modelo (27 MB) será baixado na primeira importação e fica salvo no aparelho.'
        : 'Desligado: só fotos da peça sozinha em fundo liso serão reconhecidas.';
    }
  },
  toggleSetting(k, el) {
    this.settings[k] = !this.settings[k];
    el.classList.toggle('on', this.settings[k]);
    this.saveSettings();
    haptic();
    if (k === 'detect' && this.settings.detect) toast('Ligado — o modelo baixa na próxima importação');
    if (k === 'showPhoto') this.render();
    this.renderMore();
  },
  async exportBackup() {
    toast('Preparando backup…');
    const blobs = await DB.all('blobs');
    const toB64 = b => new Promise(r => { const fr = new FileReader(); fr.onload = () => r(fr.result); fr.readAsDataURL(b); });
    const imgs = {};
    for (const b of blobs) imgs[b.id] = {
      full: await toB64(b.full), thumb: await toB64(b.thumb),
      photo: b.photo ? await toB64(b.photo) : null
    };
    const data = { v: 1, exportedAt: new Date().toISOString(), items: this.items, looks: this.looks, images: imgs };
    const blob = new Blob([JSON.stringify(data)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `closet-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    toast('Backup exportado');
  },

  async importBackup(file, input) {
    if (input) input.value = '';
    if (!file) return;
    try {
      const data = JSON.parse(await file.text());
      if (!data.items) throw new Error('formato inválido');
      const fromB64 = async u => (await fetch(u)).blob();
      const items = data.items, looks = data.looks || [];
      const blobs = [];
      for (const id in (data.images || {})) {
        const im = data.images[id];
        blobs.push({
          id, full: await fromB64(im.full), thumb: await fromB64(im.thumb),
          photo: im.photo ? await fromB64(im.photo) : null
        });
      }
      await DB.putMany('items', items);
      await DB.putMany('blobs', blobs);
      if (looks.length) await DB.putMany('looks', looks);
      const ids = new Set(this.items.map(i => i.id));
      this.items = [...items.filter(i => !ids.has(i.id)), ...this.items].sort((a, b) => b.createdAt - a.createdAt);
      const lids = new Set(this.looks.map(l => l.id));
      this.looks = [...looks.filter(l => !lids.has(l.id)), ...this.looks].sort((a, b) => b.createdAt - a.createdAt);
      this.renderCatChips(); this.render();
      toast(`${items.length} peças restauradas`);
    } catch (e) {
      console.warn(e);
      toast('Não consegui ler esse arquivo');
    }
  },

  confirmWipe() {
    this.sheet(`
      <h3>Apagar tudo?</h3>
      <p class="sh-sub">Todas as ${this.items.length} peças e ${this.looks.length} looks serão removidos deste dispositivo. Não dá para desfazer.</p>
      <div class="btn-row">
        <button class="btn ghost" onclick="APP.closeSheet()">Cancelar</button>
        <button class="btn" style="background:rgba(194,112,95,.18);border-color:rgba(194,112,95,.4);color:#e8a08f" onclick="APP.wipe()">Apagar tudo</button>
      </div>`);
  },
  async wipe() {
    await DB.clear('items'); await DB.clear('blobs'); await DB.clear('looks');
    this.items = []; this.looks = []; this.gen.results = []; this.gen.pinned = null;
    this.urls.forEach(u => URL.revokeObjectURL(u)); this.urls.clear();
    this.closeSheet(); this.renderCatChips(); this.renderGenControls(); this.render();
    toast('Guarda-roupa esvaziado');
  }
};

window.APP = APP;
document.addEventListener('DOMContentLoaded', () => APP.init());
