'use strict';
/* =========================================================
   Honorários · gestão de contratos, cobrança e prognóstico
   Dados armazenados no IndexedDB do navegador (opcionalmente
   criptografados com AES-GCM a partir de senha).
   ========================================================= */

/* ---------- utilitários ---------- */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const BRL = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const brl = n => BRL.format(Number(n) || 0);
const round2 = n => Math.round((Number(n) || 0) * 100) / 100;
const pct = n => (Number(n) || 0).toLocaleString('pt-BR', { maximumFractionDigits: 1 }) + '%';
const icon = (n, cls = '') => `<svg class="i ${cls}"><use href="#i-${n}"/></svg>`;
function num(v) {
  if (typeof v === 'number') return isFinite(v) ? v : 0;
  let s = String(v ?? '').trim().replace(/[R$\s%]/g, '');
  if (!s) return 0;
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
  else if (/^-?\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, '');
  const n = parseFloat(s);
  return isFinite(n) ? n : 0;
}
const pad = n => String(n).padStart(2, '0');
const isoOf = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const today = () => isoOf(new Date());
const dt = iso => { const [y, m, d] = iso.split('-').map(Number); return new Date(y, m - 1, d || 1); };
const fdate = iso => iso ? iso.slice(0, 10).split('-').reverse().join('/') : '—';
const fdatetime = s => { if (!s) return '—'; const d = new Date(s); return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`; };
const diffDays = (a, b) => Math.round((dt(b) - dt(a)) / 86400000);
const addDaysISO = (iso, k) => { const d = dt(iso); d.setDate(d.getDate() + k); return isoOf(d); };
function addMonthsISO(iso, k, day) {
  const d = dt(iso); const y = d.getFullYear(), m = d.getMonth() + k;
  const last = new Date(y, m + 1, 0).getDate();
  return isoOf(new Date(y, m, Math.min(day || d.getDate(), last)));
}
function parseDate(v) {
  if (v == null || v === '') return '';
  if (v instanceof Date && !isNaN(v)) return isoOf(v);
  if (typeof v === 'number' && v > 20000 && v < 80000) { const d = new Date(Math.round((v - 25569) * 86400000)); return isoOf(new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())); }
  const s = String(v).trim();
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return `${m[1]}-${pad(m[2])}-${pad(m[3])}`;
  m = s.match(/^(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{2,4})/);
  if (m) { let y = +m[3]; if (y < 100) y += 2000; return `${y}-${pad(m[2])}-${pad(m[1])}`; }
  return '';
}
const ym = iso => iso.slice(0, 7);
const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
const MESES_EXT = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
const ymLabel = k => { const [y, m] = k.split('-'); return `${MESES[+m - 1]}/${y.slice(2)}`; };
const dataExtenso = iso => { const d = dt(iso); return `${d.getDate()} de ${MESES_EXT[d.getMonth()]} de ${d.getFullYear()}`; };
const onlyDigits = s => String(s || '').replace(/\D/g, '');
const norm = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');
const ascii = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\x20-\x7E]/g, '');
const emailOk = e => String(e || '').split(/[,;]/).every(x => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(x.trim()));
function cpfOk(c) {
  c = onlyDigits(c); if (c.length !== 11 || /^(\d)\1+$/.test(c)) return false;
  let s = 0; for (let i = 0; i < 9; i++) s += +c[i] * (10 - i);
  let d = (s * 10) % 11 % 10; if (d !== +c[9]) return false;
  s = 0; for (let i = 0; i < 10; i++) s += +c[i] * (11 - i);
  d = (s * 10) % 11 % 10; return d === +c[10];
}
// Aceita o CNPJ numérico e o alfanumérico (IN RFB 2.229/2024).
function cnpjOk(c) {
  c = String(c || '').toUpperCase().replace(/[^0-9A-Z]/g, '');
  if (c.length !== 14 || !/^[0-9A-Z]{12}\d{2}$/.test(c) || /^(\w)\1+$/.test(c)) return false;
  const v = ch => ch.charCodeAt(0) - 48;
  const calc = n => { let s = 0, p = n - 7; for (let i = 0; i < n; i++) { s += v(c[i]) * p--; if (p < 2) p = 9; } const r = s % 11; return r < 2 ? 0 : 11 - r; };
  return calc(12) === +c[12] && calc(13) === +c[13];
}
const docOk = d => { const s = String(d || '').replace(/[^0-9A-Za-z]/g, ''); return s.length === 11 ? cpfOk(s) : cnpjOk(s); };
function fmtDoc(d) {
  const s = String(d || '').toUpperCase().replace(/[^0-9A-Z]/g, '');
  if (s.length === 11) return s.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
  if (s.length === 14) return s.replace(/(\w{2})(\w{3})(\w{3})(\w{4})(\d{2})/, '$1.$2.$3/$4-$5');
  return d || '';
}
function extenso(v) {
  v = round2(v); const reais = Math.floor(v), cent = Math.round((v - reais) * 100);
  const u = ['', 'um', 'dois', 'três', 'quatro', 'cinco', 'seis', 'sete', 'oito', 'nove', 'dez', 'onze', 'doze', 'treze', 'quatorze', 'quinze', 'dezesseis', 'dezessete', 'dezoito', 'dezenove'];
  const dz = ['', '', 'vinte', 'trinta', 'quarenta', 'cinquenta', 'sessenta', 'setenta', 'oitenta', 'noventa'];
  const ce = ['', 'cento', 'duzentos', 'trezentos', 'quatrocentos', 'quinhentos', 'seiscentos', 'setecentos', 'oitocentos', 'novecentos'];
  const ate999 = n => {
    if (!n) return ''; if (n === 100) return 'cem';
    const p = [], c = Math.floor(n / 100), r = n % 100;
    if (c) p.push(ce[c]);
    if (r) p.push(r < 20 ? u[r] : (r % 10 ? dz[Math.floor(r / 10)] + ' e ' + u[r % 10] : dz[r / 10]));
    return p.join(' e ');
  };
  const esc_ = [['', ''], ['mil', 'mil'], ['milhão', 'milhões'], ['bilhão', 'bilhões']];
  const grupos = []; let n = reais; while (n > 0) { grupos.push(n % 1000); n = Math.floor(n / 1000); }
  const partes = [];
  for (let i = grupos.length - 1; i >= 0; i--) {
    const g = grupos[i]; if (!g) continue;
    partes.push({ i, g, t: i === 1 && g === 1 ? 'mil' : ate999(g) + (i ? ' ' + (g === 1 ? esc_[i][0] : esc_[i][1]) : '') });
  }
  let txt = '';
  partes.forEach((p, k) => { txt += k === 0 ? p.t : ((k === partes.length - 1 && (p.g < 100 || p.g % 100 === 0)) ? ' e ' : ' ') + p.t; });
  const out = [];
  if (reais) out.push(txt + (reais >= 1e6 && grupos[0] === 0 && grupos[1] === 0 ? ' de reais' : reais === 1 ? ' real' : ' reais'));
  if (cent) out.push(ate999(cent) + (cent === 1 ? ' centavo' : ' centavos'));
  return out.join(' e ') || 'zero real';
}

/* ---------- PIX (BR Code estático, padrão EMV do Banco Central) ---------- */
function crc16(str) {
  let crc = 0xFFFF;
  for (let i = 0; i < str.length; i++) {
    crc ^= str.charCodeAt(i) << 8;
    for (let j = 0; j < 8; j++) { crc = (crc & 0x8000) ? ((crc << 1) ^ 0x1021) : (crc << 1); crc &= 0xFFFF; }
  }
  return crc.toString(16).toUpperCase().padStart(4, '0');
}
const emv = (id, v) => id + String(v.length).padStart(2, '0') + v;
function pixKey(ent) {
  let k = String(ent?.pixChave || '').trim(); const t = ent?.pixTipo;
  if (t === 'cpf' || t === 'cnpj') k = k.replace(/[^0-9A-Za-z]/g, '').toUpperCase();
  if (t === 'telefone') { k = onlyDigits(k); if (!k.startsWith('55')) k = '55' + k; k = '+' + k; }
  return k;
}
function pixPayload(ent, valor, txid, desc) {
  const chave = pixKey(ent); if (!chave) return '';
  const gui = emv('00', 'br.gov.bcb.pix') + emv('01', chave) + (desc ? emv('02', ascii(desc).slice(0, 30)) : '');
  let p = emv('00', '01') + emv('26', gui) + emv('52', '0000') + emv('53', '986') +
    (valor > 0 ? emv('54', Number(valor).toFixed(2)) : '') + emv('58', 'BR') +
    emv('59', (ascii(ent.pixNome || ((ent.razao || '').length > 25 && ent.fantasia ? ent.fantasia : ent.razao)).toUpperCase().slice(0, 25)) || 'RECEBEDOR') +
    emv('60', (ascii(ent.cidade).toUpperCase().slice(0, 15)) || 'BRASIL') +
    emv('62', emv('05', ascii(txid).replace(/[^A-Za-z0-9]/g, '').slice(0, 25) || '***'));
  p += '6304';
  return p + crc16(p);
}

/* ---------- IndexedDB + criptografia ---------- */
let idb = null, cryptoKey = null, meta = {};
function idbOpen() {
  return new Promise((res, rej) => {
    const r = indexedDB.open('honorarios_contratos', 1);
    r.onupgradeneeded = () => { r.result.createObjectStore('kv'); r.result.createObjectStore('files'); };
    r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
  });
}
const idbReq = (store, mode, fn) => new Promise((res, rej) => { const tx = idb.transaction(store, mode); const r = fn(tx.objectStore(store)); tx.oncomplete = () => res(r?.result); tx.onerror = () => rej(tx.error); });
const idbGet = (s, k) => idbReq(s, 'readonly', o => o.get(k));
const idbPut = (s, k, v) => idbReq(s, 'readwrite', o => o.put(v, k));
const idbDel = (s, k) => idbReq(s, 'readwrite', o => o.delete(k));
const idbKeys = s => idbReq(s, 'readonly', o => o.getAllKeys());
async function deriveKey(pass, salt) {
  const base = await crypto.subtle.importKey('raw', new TextEncoder().encode(pass), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey({ name: 'PBKDF2', salt, iterations: 250000, hash: 'SHA-256' }, base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}
async function encBuf(buf, key = cryptoKey) { const iv = crypto.getRandomValues(new Uint8Array(12)); return { iv, ct: await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, buf) }; }
const decBuf = (rec, key = cryptoKey) => crypto.subtle.decrypt({ name: 'AES-GCM', iv: rec.iv }, key, rec.ct);
async function saveFile(id, file, key = cryptoKey) {
  const buf = file instanceof ArrayBuffer ? file : await file.arrayBuffer();
  const rec = { name: file.name || 'arquivo', type: file.type || 'application/octet-stream', size: buf.byteLength, enc: !!key, data: key ? await encBuf(buf, key) : buf };
  await idbPut('files', id, rec);
}
async function getFile(id) {
  const rec = await idbGet('files', id); if (!rec) return null;
  const buf = rec.enc ? await decBuf(rec.data) : rec.data;
  return new File([buf], rec.name, { type: rec.type });
}
async function recriptografar(newKey) {
  for (const id of await idbKeys('files')) { const f = await getFile(id); if (f) await saveFile(id, f, newKey); }
}

/* ---------- modelo de dados ---------- */
const AREAS_PADRAO = ['Penal Empresarial', 'Penal', 'Investigações e Compliance', 'Tributário', 'Cível', 'Empresarial', 'Trabalhista', 'Família e Sucessões', 'Administrativo', 'Consultivo'];
const TIPOS = { fixo: 'Fixo parcelado', mensal: 'Mensal (partido)', exito: 'Êxito', hibrido: 'Fixo + êxito', avulso: 'Ato avulso' };
const STATUS_CT = { ativo: ['Ativo', 'ok'], suspenso: ['Suspenso', 'warn'], encerrado: ['Encerrado', 'muted'], rescindido: ['Rescindido', 'danger'] };
const TIPO_PESSOA = { socio: 'Sócio', advogado: 'Advogado', parceiro: 'Parceiro externo' };
const FORMAS = ['PIX', 'Transferência', 'Boleto', 'Cartão', 'Dinheiro', 'Cheque', 'Outro'];
const MODOS_EMAIL = {
  mailto: 'Outlook instalado no computador (abre a mensagem pronta)',
  outlook: 'Outlook na web / Microsoft 365 (abre a mensagem pronta)',
  emailjs: 'Envio direto, sem abrir o Outlook (EmailJS conectado à conta Outlook)'
};
const DIRETO = m => m === 'emailjs';
const TEMPLATES_PADRAO = {
  lembrete: {
    nome: 'Lembrete antes do vencimento',
    assunto: 'Lembrete de vencimento | Parcela {parcela} | Contrato {contrato}',
    corpo: `Prezado(a) {contato},

Esperamos que esteja bem.

Por meio desta mensagem, recordamos que a parcela {parcela} dos honorários advocatícios relativos ao contrato {contrato}, referente a {escopo}, no valor de {valor}, tem vencimento previsto para {vencimento}.

O pagamento poderá ser realizado por transferência bancária ou PIX, conforme os dados abaixo.

{dados_pagamento}

Caso o pagamento já tenha sido providenciado, pedimos a gentileza de desconsiderar esta mensagem e, se possível, encaminhar o respectivo comprovante em resposta a este e-mail.

Permanecemos à disposição para quaisquer esclarecimentos.

Atenciosamente,

{remetente}
{cargo}
{escritorio}`
  },
  vencimento: {
    nome: 'Cobrança no dia do vencimento',
    assunto: 'Vencimento hoje | Parcela {parcela} | Contrato {contrato}',
    corpo: `Prezado(a) {contato},

Informamos que a parcela {parcela} dos honorários advocatícios pactuados no contrato {contrato}, no valor de {valor}, vence hoje, {vencimento}.

Para sua comodidade, seguem os dados para pagamento.

{dados_pagamento}

Solicitamos, por gentileza, o envio do comprovante em resposta a esta mensagem, a fim de viabilizar a baixa em nossos controles.

Atenciosamente,

{remetente}
{cargo}
{escritorio}`
  },
  atraso: {
    nome: 'Cobrança de parcela em atraso',
    assunto: 'Pendência financeira | Parcela {parcela} vencida em {vencimento} | Contrato {contrato}',
    corpo: `Prezado(a) {contato},

Em verificação de rotina, constatamos que a parcela {parcela} dos honorários advocatícios relativos ao contrato {contrato}, vencida em {vencimento}, no valor original de {valor}, permanece em aberto há {dias_atraso} dias.

Nos termos contratualmente ajustados, o valor atualizado, acrescido de multa de {multa} e juros de {juros} ao mês, corresponde nesta data a {valor_atualizado}.

Solicitamos a regularização do pagamento por meio dos dados abaixo.

{dados_pagamento}

Caso o pagamento já tenha sido efetuado, pedimos que desconsidere esta mensagem e nos encaminhe o comprovante. Havendo qualquer dificuldade, estamos abertos ao diálogo para encontrar a melhor solução.

Atenciosamente,

{remetente}
{cargo}
{escritorio}`
  },
  recibo: {
    nome: 'Confirmação de pagamento (recibo)',
    assunto: 'Confirmação de recebimento | Parcela {parcela} | Contrato {contrato}',
    corpo: `Prezado(a) {contato},

Confirmamos o recebimento, em {data_pagamento}, da importância de {valor_pago} ({valor_pago_extenso}), referente à parcela {parcela} dos honorários advocatícios pactuados no contrato {contrato}.

Agradecemos a pontualidade e permanecemos à disposição.

Atenciosamente,

{remetente}
{cargo}
{escritorio}`
  }
};
const PLACEHOLDERS = ['boleto_link', 'linha_digitavel', 'cliente', 'contato', 'contrato', 'escopo', 'area', 'parcela', 'valor', 'valor_atualizado', 'vencimento', 'dias_atraso', 'multa', 'juros', 'dados_pagamento', 'pix_copia_cola', 'escritorio', 'razao_social', 'cnpj', 'responsavel', 'remetente', 'cargo', 'data_pagamento', 'valor_pago', 'valor_pago_extenso'];

function defaultDB() {
  return {
    version: 1,
    settings: {
      remetente: '', cargo: 'Departamento Financeiro', replyTo: '', ccPadrao: '', cidade: '',
      multaPct: 2, jurosPct: 1, diasLembrete: 3, intervaloReenvio: 7,
      emailMode: 'mailto', confirmarEnvio: false,
      emailjs: { serviceId: '', templateId: '', publicKey: '' },
      templates: structuredClone(TEMPLATES_PADRAO),
      ultimoBackup: null,
      asaas: { ativo: false, url: '', token: '', entidadeId: '', gerarAoCobrar: true, notificarPeloAsaas: false, nfAoPagar: true, ultimoEvento: '', ultimaSync: '',
        nf: { servicoId: '', servicoCodigo: '', servicoNome: '', descricao: 'Honorários advocatícios referentes a {escopo}. Contrato {contrato}, parcela {parcela}.', observacoes: '', iss: 0, retemIss: false, pis: 0, cofins: 0, csll: 0, ir: 0, inss: 0, nbsCode: '', taxSituationCode: '', taxClassificationCode: '', operationIndicatorCode: '' } }
    },
    entidades: [], pessoas: [], areas: [...AREAS_PADRAO],
    contratos: [], parcelas: [], comissoesPagas: {}, log: []
  };
}
function migrate(d) {
  const base = defaultDB();
  if (!d || typeof d !== 'object') return base;
  const out = { ...base, ...d, settings: { ...base.settings, ...(d.settings || {}) } };
  out.settings.templates = { ...base.settings.templates, ...(d.settings?.templates || {}) };
  ['emailjs'].forEach(k => out.settings[k] = { ...base.settings[k], ...(d.settings?.[k] || {}) });
  if (!MODOS_EMAIL[out.settings.emailMode]) out.settings.emailMode = 'mailto';
  out.settings.asaas = { ...base.settings.asaas, ...(d.settings?.asaas || {}) };
  out.settings.asaas.nf = { ...base.settings.asaas.nf, ...(d.settings?.asaas?.nf || {}) };
  delete out.settings.ai; delete out.settings.webhook;
  return out;
}

/* ---------- estado ---------- */
let db = null;
const ui = {
  route: 'painel', param: null, charts: [], fila: [],
  f: { ct: { q: '', status: 'ativo', area: '', capt: '', ent: '' }, rec: { aba: 'atrasadas', q: '' }, com: { pessoa: '', status: 'apagar', mes: '' }, prog: { h: 12 }, cad: 'entidades', ver: 'erro' },
  sel: new Set()
};
let saveTimer = null;
function save() { clearTimeout(saveTimer); setSave('Salvando…'); saveTimer = setTimeout(persist, 250); }
async function persist() {
  try {
    const json = JSON.stringify(db);
    if (cryptoKey) await idbPut('kv', 'db', { enc: 1, ...(await encBuf(new TextEncoder().encode(json))) });
    else await idbPut('kv', 'db', json);
    setSave('Salvo neste navegador');
  } catch (e) { console.error(e); setSave('Erro ao salvar', true); }
}
function setSave(t, err) { const el = $('#save-state'); el.classList.toggle('err', !!err); el.lastElementChild.textContent = t; }
function log(acao, detalhe) { db.log.unshift({ em: new Date().toISOString(), acao, detalhe }); db.log.length = Math.min(db.log.length, 500); }

/* ---------- consultas de domínio ---------- */
const ctById = id => db.contratos.find(c => c.id === id);
const pessoa = id => db.pessoas.find(p => p.id === id);
const entidade = id => db.entidades.find(e => e.id === id);
const valida = p => p.status !== 'cancelada' && p.status !== 'renegociada';
const parcelasDe = id => db.parcelas.filter(p => p.contratoId === id).sort((a, b) => a.venc.localeCompare(b.venc) || (a.n || 0) - (b.n || 0));
const pago = p => p.valorPago ?? p.valor;
function stP(p) {
  if (p.status === 'paga') return 'paga';
  if (p.status === 'cancelada') return 'cancelada';
  if (p.status === 'renegociada') return 'renegociada';
  const t = today();
  if (p.venc < t) return 'atrasada';
  if (p.venc === t) return 'hoje';
  if (diffDays(t, p.venc) <= db.settings.diasLembrete) return 'proxima';
  return 'aberta';
}
const ST_P = { paga: ['Paga', 'ok'], cancelada: ['Cancelada', 'muted'], renegociada: ['Renegociada', 'violet'], atrasada: ['Em atraso', 'danger'], hoje: ['Vence hoje', 'warn'], proxima: ['A vencer', 'info'], aberta: ['Em aberto', ''] };
const chipP = p => { const s = stP(p); const [l, c] = ST_P[s]; return `<span class="chip ${c}">${l}${s === 'atrasada' ? ` · ${atraso(p)}d` : ''}</span>`; };
const atraso = p => Math.max(0, diffDays(p.venc, today()));
function encargos(c) {
  const v = (x, d) => (x === '' || x == null) ? +d : +x;
  return { multa: v(c?.multaPct, db.settings.multaPct), juros: v(c?.jurosPct, db.settings.jurosPct) };
}
function atualizado(p) {
  const d = atraso(p); if (!d || p.status === 'paga') return p.valor;
  const { multa, juros } = encargos(ctById(p.contratoId));
  return round2(p.valor * (1 + multa / 100) + p.valor * (juros / 100) * d / 30);
}
function resumoCt(c) {
  const ps = parcelasDe(c.id).filter(valida), t = today();
  let total = 0, recebido = 0, aberto = 0, atrasado = 0, nAtr = 0, maxAtr = 0;
  ps.forEach(p => {
    total += p.valor;
    if (p.status === 'paga') recebido += pago(p);
    else { aberto += p.valor; if (p.venc < t) { atrasado += p.valor; nAtr++; maxAtr = Math.max(maxAtr, atraso(p)); } }
  });
  return { ps, total: round2(total), recebido: round2(recebido), aberto: round2(aberto), atrasado: round2(atrasado), nAtr, maxAtr, prox: ps.find(p => p.status !== 'paga' && p.venc >= t) };
}
const totalParcelas = c => db.parcelas.filter(p => p.contratoId === c.id && valida(p)).reduce((s, p) => s + p.valor, 0);
function comissaoValor(r, c, base) {
  if (r.tipo === 'fixo') { const tot = totalParcelas(c); return tot ? (+r.valor || 0) * base / tot : 0; }
  return base * (+r.valor || 0) / 100;
}
function comissoes() {
  const out = [];
  db.parcelas.forEach(p => {
    if (p.status !== 'paga') return; const c = ctById(p.contratoId); if (!c) return;
    (c.captacao || []).forEach(r => {
      if (!r.pessoaId) return; const key = p.id + '|' + r.pessoaId; const base = pago(p);
      out.push({ key, p, c, pessoaId: r.pessoaId, regra: r, base, valor: round2(comissaoValor(r, c, base)), pagoInfo: db.comissoesPagas[key] || null });
    });
  });
  return out.sort((a, b) => (b.p.pagoEm || '').localeCompare(a.p.pagoEm || ''));
}
function comissaoProjetada(pessoaId) {
  let s = 0;
  db.parcelas.forEach(p => { if (!valida(p) || p.status === 'paga') return; const c = ctById(p.contratoId); if (!c || c.status !== 'ativo') return; (c.captacao || []).forEach(r => { if (r.pessoaId === pessoaId) s += comissaoValor(r, c, p.valor); }); });
  return round2(s);
}
function taxaInad() {
  const t = today(), ini = addMonthsISO(t, -12), lim = addDaysISO(t, -30); let tot = 0, nao = 0;
  db.parcelas.forEach(p => { if (!valida(p)) return; if (p.venc >= ini && p.venc <= lim) { tot += p.valor; if (p.status !== 'paga') nao += p.valor; } });
  return tot ? nao / tot : 0;
}
function prognostico(meses, passado = 0) {
  const t = today(), base = ym(t), inad = taxaInad(), keys = [];
  for (let i = -passado; i < meses; i++) keys.push(ym(addMonthsISO(base + '-01', i, 1)));
  const m = Object.fromEntries(keys.map(k => [k, { k, contratual: 0, recebido: 0, aberto: 0, exito: 0, comissao: 0, ajustado: 0, liquido: 0, porArea: {} }]));
  db.parcelas.forEach(p => {
    if (!valida(p)) return; const c = ctById(p.contratoId); if (!c) return;
    const kv = ym(p.venc), area = c.area || 'Sem área';
    if (m[kv]) m[kv].contratual += p.valor;
    if (p.status === 'paga') {
      const kp = ym(p.pagoEm || p.venc);
      if (m[kp]) { m[kp].recebido += pago(p); (c.captacao || []).forEach(r => m[kp].comissao += comissaoValor(r, c, pago(p))); m[kp].porArea[area] = (m[kp].porArea[area] || 0) + pago(p); }
    } else if (m[kv] && p.venc >= t && c.status !== 'rescindido') {
      m[kv].aberto += p.valor;
      (c.captacao || []).forEach(r => m[kv].comissao += comissaoValor(r, c, p.valor) * (1 - inad));
      m[kv].porArea[area] = (m[kv].porArea[area] || 0) + p.valor * (1 - inad);
    }
  });
  db.contratos.forEach(c => {
    const e = c.exito; if (c.status !== 'ativo' || !e || !(+e.pct > 0) || !e.data) return;
    const k = ym(e.data); const v = (+e.base || 0) * (+e.pct / 100) * ((+e.prob || 0) / 100);
    if (m[k] && v > 0) { m[k].exito += v; (c.captacao || []).forEach(r => { if (r.tipo === 'pct') m[k].comissao += v * r.valor / 100; }); }
  });
  keys.forEach(k => { const x = m[k]; x.ajustado = x.recebido + x.aberto * (1 - inad) + x.exito; x.liquido = x.ajustado - x.comissao; });
  return { meses: keys.map(k => m[k]), inad, base };
}
function verificar(c) {
  const out = [], add = (nivel, msg, dica) => out.push({ nivel, msg, dica });
  const r = resumoCt(c), cl = c.cliente || {};
  if (!cl.email) add('erro', 'Cliente sem e-mail de cobrança', 'Sem e-mail não é possível enviar a cobrança automática.');
  else if (!emailOk(cl.email)) add('erro', 'E-mail do cliente em formato inválido');
  if (!cl.doc) add('aviso', 'CPF/CNPJ do cliente não informado', 'Necessário para recibos e emissão de nota fiscal.');
  else if (!docOk(cl.doc)) add('erro', 'CPF/CNPJ do cliente com dígito verificador inválido');
  if (!c.entidadeId || !entidade(c.entidadeId)) add('erro', 'Sem dados de faturamento vinculados', 'Vincule a sociedade ou o CNPJ que emitirá a cobrança.');
  if (!c.escopo?.trim()) add('aviso', 'Escopo do contrato não descrito');
  if (!c.area) add('aviso', 'Área de atuação não definida');
  if (!(c.captacao || []).length) add('info', 'Captação não atribuída a sócio, advogado ou parceiro');
  const pctTot = (c.captacao || []).filter(x => x.tipo === 'pct').reduce((s, x) => s + (+x.valor || 0), 0);
  if (pctTot > 30) add('aviso', `Comissões de captação somam ${pct(pctTot)} dos honorários`);
  if (['fixo', 'hibrido', 'avulso'].includes(c.tipo)) {
    if (!r.ps.length) add('erro', 'Contrato sem cronograma de parcelas');
    else { const esperado = (+c.valorTotal || 0) + (+c.ajusteReneg || 0); if (c.valorTotal && Math.abs(r.total - esperado) > 0.05) add('erro', `Soma das parcelas (${brl(r.total)}) diverge do valor contratado (${brl(esperado)})`); }
  }
  if (c.tipo === 'mensal' && c.status === 'ativo' && !r.ps.some(p => p.venc >= today())) add('aviso', 'Contrato mensal ativo sem competências futuras', 'Gere novas competências para manter cobrança e prognóstico.');
  if (['exito', 'hibrido'].includes(c.tipo) && !(+c.exito?.pct > 0)) add('aviso', 'Percentual de êxito não informado');
  if (['exito', 'hibrido'].includes(c.tipo) && +c.exito?.pct > 0 && !c.exito?.data) add('info', 'Êxito sem data estimada de realização (fora do prognóstico)');
  if (c.status === 'ativo' && c.fim && c.fim < today()) add('aviso', 'Vigência encerrada com contrato ainda ativo');
  if (c.tipo === 'mensal' && c.reajuste && c.reajuste !== 'Nenhum' && c.inicio && diffDays(c.ultimoReajuste || c.inicio, today()) > 365) add('aviso', 'Reajuste anual pendente', `Índice contratado: ${c.reajuste}.`);
  if (!c.arquivoId) add('info', 'Via assinada do contrato não anexada');
  if (asaasOk()) {
    const semNf = r.ps.filter(p => p.status === 'paga' && (!p.nf || ['ERRO', 'ERROR', 'CANCELED'].includes(p.nf.status))).length;
    if (semNf) add('aviso', `${semNf} parcela(s) paga(s) sem nota fiscal emitida`, 'Emita a NFS-e pelo ícone de nota fiscal na parcela.');
    if (db.settings.asaas.entidadeId && c.entidadeId && c.entidadeId !== db.settings.asaas.entidadeId) add('info', 'Faturamento por CNPJ diferente do vinculado ao Asaas', 'Boletos e notas deste contrato não podem ser emitidos pela conta Asaas configurada.');
  }
  if (!c.dataAssinatura) add('info', 'Data de assinatura não informada');
  if (r.maxAtr > 60) add('erro', `Parcela em atraso há ${r.maxAtr} dias`, 'Avaliar notificação extrajudicial, renegociação ou suspensão dos serviços, conforme o contrato.');
  else if (r.maxAtr > 30) add('aviso', `Parcela em atraso há ${r.maxAtr} dias`);
  if (c.status === 'ativo' && r.ps.length && r.aberto === 0 && c.tipo !== 'mensal' && !(+c.exito?.pct > 0)) add('info', 'Todas as parcelas quitadas; avaliar o encerramento do contrato');
  return out;
}
const NIVEL = { erro: ['Crítico', 'danger'], aviso: ['Atenção', 'warn'], info: ['Informativo', 'info'], ia: ['Análise do contrato', 'violet'] };

/* ---------- mensagens ---------- */
const fill = (s, v) => String(s || '').replace(/\{(\w+)\}/g, (m, k) => k in v ? v[k] : m);
function dadosPagamento(ent, p, c) {
  if (!ent) return '[Dados de faturamento não cadastrados]';
  const l = [];
  l.push(`Favorecido: ${ent.razao}`);
  if (ent.cnpj) l.push(`CNPJ: ${fmtDoc(ent.cnpj)}`);
  if (ent.banco) l.push(`Banco: ${ent.banco}${ent.agencia ? `, agência ${ent.agencia}` : ''}${ent.conta ? `, conta ${ent.conta}` : ''}`);
  const bol = boletoAtivo(p);
  if (bol) {
    l.push(`Boleto (${brl(bol.valor)}, vencimento ${fdate(bol.vencimento)}): ${bol.url}`);
    if (bol.linha) l.push(`Linha digitável: ${bol.linha}`);
    if (bol.pix) { l.push(`PIX copia e cola: ${bol.pix}`); if (ent.instrucoes) l.push(ent.instrucoes); return l.join('\n'); }
  }
  if (ent.pixChave) l.push(`Chave PIX (${ent.pixTipo || 'chave'}): ${ent.pixChave}`);
  const code = p ? pixPayload(ent, atualizado(p), `${c.numero || ''}P${p.n || ''}`) : '';
  if (code) l.push(`PIX copia e cola: ${code}`);
  if (ent.instrucoes) l.push(ent.instrucoes);
  return l.join('\n');
}
function varsParcela(p, c) {
  const ent = entidade(c.entidadeId), { multa, juros } = encargos(c);
  const nTot = parcelasDe(c.id).filter(valida).length;
  const resp = pessoa(c.responsavelId);
  return {
    cliente: c.cliente.nome, contato: c.cliente.contato || c.cliente.nome, contrato: c.numero || 's/n',
    escopo: (c.escopo || 'serviços advocatícios').replace(/\s+/g, ' ').slice(0, 160).replace(/[\s.;,]+$/, ''), area: c.area || '',
    parcela: `${p.n}/${nTot}` + (p.desc && !/^(parcela|mensalidade)$/i.test(p.desc.trim()) ? ` (${p.desc.trim().toLowerCase()})` : ''), valor: brl(p.valor), valor_atualizado: brl(atualizado(p)),
    vencimento: fdate(p.venc), dias_atraso: String(atraso(p)), multa: pct(multa), juros: pct(juros),
    dados_pagamento: dadosPagamento(ent, p, c), pix_copia_cola: ent ? pixPayload(ent, atualizado(p), `${c.numero || ''}P${p.n || ''}`) : '',
    escritorio: ent?.fantasia || ent?.razao || '', razao_social: ent?.razao || '', cnpj: fmtDoc(ent?.cnpj),
    responsavel: resp?.nome || '', remetente: db.settings.remetente || '', cargo: db.settings.cargo || '',
    data_pagamento: fdate(p.pagoEm), valor_pago: brl(pago(p)), valor_pago_extenso: extenso(pago(p)),
    boleto_link: boletoAtivo(p)?.url || '', linha_digitavel: boletoAtivo(p)?.linha || ''
  };
}
function tipoCobranca(p) { const s = stP(p); return s === 'paga' ? 'recibo' : s === 'atrasada' ? 'atraso' : s === 'hoje' ? 'vencimento' : 'lembrete'; }
function montar(p, tipo) {
  const c = ctById(p.contratoId), tpl = db.settings.templates[tipo], v = varsParcela(p, c);
  return { para: (c.cliente.email || '').replace(/;/g, ','), cc: [c.cliente.emailCc, db.settings.ccPadrao].filter(Boolean).join(',').replace(/;/g, ','), assunto: fill(tpl.assunto, v), corpo: fill(tpl.corpo, v) };
}
const htmlEmail = t => `<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.6;color:#1a2130">${esc(t).replace(/\n/g, '<br>')}</div>`;
async function transporte(msg) {
  const s = db.settings, m = s.emailMode, q = encodeURIComponent;
  if (m === 'mailto') {
    const head = `mailto:${msg.para}?${msg.cc ? `cc=${q(msg.cc)}&` : ''}subject=${q(msg.assunto)}`;
    const full = `${head}&body=${q(msg.corpo)}`;
    // O Outlook para Windows não aceita links mailto acima de ~2.000 caracteres.
    if (full.length <= 2000) { location.href = full; return; }
    let copiou = false;
    try { await navigator.clipboard.writeText(msg.corpo); copiou = true; } catch (e) { }
    location.href = `${head}&body=${q(copiou ? '' : 'Texto da cobrança: copie da pré-visualização do sistema.')}`;
    if (copiou) toast('O texto completo foi copiado. No Outlook, clique no corpo da mensagem e cole com Ctrl+V.', 'ok');
    return;
  }
  if (m === 'outlook') { if (!window.open(`https://outlook.office.com/mail/deeplink/compose?to=${q(msg.para)}&cc=${q(msg.cc)}&subject=${q(msg.assunto)}&body=${q(msg.corpo)}`, '_blank')) throw new Error('o navegador bloqueou a nova aba'); return; }
  if (m === 'emailjs') {
    const e = s.emailjs; if (!e.serviceId || !e.templateId || !e.publicKey) throw new Error('configure o EmailJS em Configurações');
    const r = await fetch('https://api.emailjs.com/api/v1.0/email/send', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ service_id: e.serviceId, template_id: e.templateId, user_id: e.publicKey, template_params: { to_email: msg.para, cc_email: msg.cc, subject: msg.assunto, message: msg.corpo, message_html: htmlEmail(msg.corpo), from_name: s.remetente, reply_to: s.replyTo } }) });
    if (!r.ok) throw new Error(await r.text() || ('HTTP ' + r.status));
    return;
  }
}
function registrar(p, tipo, canal, para) {
  (p.cobrancas ||= []).push({ em: new Date().toISOString(), tipo, canal, para });
  const c = ctById(p.contratoId); log('cobranca', `${db.settings.templates[tipo]?.nome || tipo} · ${c?.cliente.nome} · parcela ${p.n}`);
  save();
}
async function cobrar(pid, opts = {}) {
  const p = db.parcelas.find(x => x.id === pid); if (!p) return false;
  const tipo = opts.tipo || tipoCobranca(p);
  let msg = montar(p, tipo);
  if (!msg.para) { toast('Cliente sem e-mail cadastrado. Edite o contrato para incluir.', 'err'); return false; }
  const geraBoleto = tipo !== 'recibo' && p.status !== 'paga' && asaasOk() && db.settings.asaas.gerarAoCobrar && !boletoAtivo(p);
  if (!opts.semPreview && (db.settings.confirmarEnvio || opts.preview)) { previewMsg(p, tipo, msg, geraBoleto); return false; }
  // O boleto só é registrado no envio efetivo, nunca na pré-visualização.
  if (geraBoleto) {
    try { await emitirBoleto(p.id, { silencioso: true }); msg = montar(p, tipo); }
    catch (e) { toast('Boleto não emitido (' + e.message + '). A cobrança seguirá com PIX e dados bancários.', 'err'); }
  }
  try { await transporte(msg); } catch (e) { toast('Falha no envio: ' + e.message, 'err'); return false; }
  registrar(p, tipo, db.settings.emailMode, msg.para);
  if (!opts.lote) { toast(DIRETO(db.settings.emailMode) ? `E-mail enviado para ${msg.para}` : 'Mensagem pronta aberta no seu e-mail.', 'ok'); rerender(); }
  return true;
}
function previewMsg(p, tipo, msg, geraBoleto) {
  openModal({
    title: 'Pré-visualização da mensagem', wide: false,
    body: `<div class="field"><label>Modelo</label><select id="pv-tipo">${Object.entries(db.settings.templates).map(([k, t]) => `<option value="${k}" ${k === tipo ? 'selected' : ''}>${esc(t.nome)}</option>`).join('')}</select></div>
      <dl class="dl" style="margin:14px 0"><dt>Para</dt><dd>${esc(msg.para)}</dd>${msg.cc ? `<dt>Cópia</dt><dd>${esc(msg.cc)}</dd>` : ''}<dt>Assunto</dt><dd id="pv-ass">${esc(msg.assunto)}</dd></dl>
      <div class="pre" id="pv-corpo">${esc(msg.corpo)}</div>
      <p class="hint" style="margin-top:8px">Canal: ${esc(MODOS_EMAIL[db.settings.emailMode])}${geraBoleto ? '. Ao enviar, o boleto será registrado no Asaas e seus dados entrarão no texto.' : ''}</p>`,
    foot: `<button class="btn ghost" data-act="modal-close">Fechar</button><button class="btn" data-act="copy-msg">Copiar texto</button><button class="btn primary" data-act="pv-send" data-id="${p.id}">${icon('send')} Enviar agora</button>`,
    onMount: () => {
      $('#pv-tipo').onchange = e => { const m2 = montar(p, e.target.value); $('#pv-ass').textContent = m2.assunto; $('#pv-corpo').textContent = m2.corpo; };
    }
  });
}
function whatsapp(pid) {
  const p = db.parcelas.find(x => x.id === pid), c = ctById(p.contratoId);
  let tel = onlyDigits(c.cliente.telefone); if (!tel) return toast('Cliente sem telefone cadastrado.', 'err');
  if (tel.length <= 11) tel = '55' + tel;
  const v = varsParcela(p, c), s = stP(p), ent = entidade(c.entidadeId);
  const txt = s === 'atrasada'
    ? `Olá, ${v.contato}. Identificamos que a parcela ${v.parcela} dos honorários (contrato ${v.contrato}), vencida em ${v.vencimento}, segue em aberto. Valor atualizado: ${v.valor_atualizado}.${ent?.pixChave ? ` Chave PIX: ${ent.pixChave}.` : ''} Se já pagou, pode desconsiderar e nos enviar o comprovante. ${v.escritorio}`
    : `Olá, ${v.contato}. Lembramos que a parcela ${v.parcela} dos honorários (contrato ${v.contrato}), no valor de ${v.valor}, vence em ${v.vencimento}.${ent?.pixChave ? ` Chave PIX: ${ent.pixChave}.` : ''} Qualquer dúvida, estamos à disposição. ${v.escritorio}`;
  window.open(`https://wa.me/${tel}?text=${encodeURIComponent(txt)}`, '_blank');
  registrar(p, tipoCobranca(p), 'whatsapp', tel); rerender();
}
function filaHoje() {
  const s = db.settings, t = today(), out = [];
  db.parcelas.forEach(p => {
    if (!valida(p) || p.status === 'paga') return; const c = ctById(p.contratoId);
    if (!c || c.pausarCobranca || c.status === 'encerrado') return;
    const st = stP(p), hist = p.cobrancas || [], ult = hist.length ? hist[hist.length - 1] : null;
    if (st === 'proxima' && !hist.some(h => h.tipo === 'lembrete')) out.push({ p, tipo: 'lembrete' });
    else if (st === 'hoje' && !hist.some(h => h.tipo === 'vencimento' && h.em.slice(0, 10) === t)) out.push({ p, tipo: 'vencimento' });
    else if (st === 'atrasada' && (!ult || diffDays(ult.em.slice(0, 10), t) >= s.intervaloReenvio)) out.push({ p, tipo: 'atraso' });
  });
  return out.sort((a, b) => a.p.venc.localeCompare(b.p.venc));
}
async function enviarLote(itens) {
  itens = itens.filter(x => ctById(x.p.contratoId)?.cliente.email);
  if (!itens.length) return toast('Nenhuma parcela com e-mail de cliente cadastrado.', 'err');
  if (DIRETO(db.settings.emailMode)) {
    if (!await confirmBox(`Enviar ${itens.length} e-mail(s) de cobrança agora?`)) return;
    let ok = 0; for (const x of itens) { if (await cobrar(x.p.id, { tipo: x.tipo, lote: true, semPreview: true })) ok++; await new Promise(r => setTimeout(r, 350)); }
    toast(`${ok} de ${itens.length} e-mail(s) enviados.`, ok ? 'ok' : 'err'); rerender(); return;
  }
  // Nos modos que abrem o e-mail, cada mensagem exige um clique (bloqueio de pop-ups do navegador).
  let i = 0;
  const passo = () => {
    if (i >= itens.length) { closeModal(); toast('Fila concluída.', 'ok'); rerender(); return; }
    const x = itens[i], c = ctById(x.p.contratoId);
    $('#lote-info').innerHTML = `<b>${i + 1} de ${itens.length}</b> · ${esc(c.cliente.nome)} · parcela ${x.p.n} · ${brl(x.p.valor)} · ${esc(db.settings.templates[x.tipo].nome)}`;
  };
  openModal({
    title: 'Fila de cobrança',
    body: `<p class="hint">Seu canal de e-mail abre uma mensagem pronta por vez. Clique em <b>Abrir próxima</b> para cada cobrança. Para envio totalmente automático em lote, configure o envio direto em Configurações.</p><p id="lote-info" style="margin-top:14px"></p>`,
    foot: `<button class="btn ghost" data-act="modal-close">Encerrar</button><button class="btn primary" id="lote-next">${icon('send')} Abrir próxima</button>`,
    onMount: () => { passo(); $('#lote-next').onclick = async () => { const x = itens[i]; await cobrar(x.p.id, { tipo: x.tipo, lote: true, semPreview: true }); i++; passo(); }; }
  });
}

/* ---------- UI genérica ---------- */
function toast(msg, type = '') { const el = document.createElement('div'); el.className = 'toast ' + type; el.textContent = msg; $('#toasts').append(el); setTimeout(() => el.remove(), type === 'err' ? 6000 : 3500); }
let modalOnClose = null;
function openModal({ title, body, foot = '', wide = false, onMount, onClose }) {
  closeModal(true);
  $('#modal-root').innerHTML = `<div class="modal-scrim" data-scrim><div class="modal ${wide ? 'wide' : ''}" role="dialog" aria-modal="true" aria-label="${esc(title)}"><div class="modal-h"><h2>${esc(title)}</h2><button class="icon-btn" data-act="modal-close" aria-label="Fechar">${icon('x')}</button></div><div class="modal-b">${body}</div>${foot ? `<div class="modal-f">${foot}</div>` : ''}</div></div>`;
  document.body.classList.add('lock'); modalOnClose = onClose || null; onMount?.();
  const f = $('#modal-root input:not([type=hidden]):not([type=checkbox]),#modal-root select,#modal-root textarea'); if (f && !wide) f.focus();
}
function closeModal(silent) { if (!$('#modal-root').innerHTML) return; $('#modal-root').innerHTML = ''; document.body.classList.remove('lock'); const cb = modalOnClose; modalOnClose = null; if (!silent) cb?.(); }
function confirmBox(msg, ok = 'Confirmar', danger = false) {
  return new Promise(res => {
    const root = document.createElement('div');
    root.innerHTML = `<div class="modal-scrim" style="z-index:90;align-items:center"><div class="modal" style="width:min(440px,100%)"><div class="modal-b"><p>${esc(msg)}</p></div><div class="modal-f"><button class="btn ghost" data-r="0">Cancelar</button><button class="btn ${danger ? 'danger' : 'primary'}" data-r="1">${esc(ok)}</button></div></div></div>`;
    document.body.append(root);
    root.addEventListener('click', e => { const b = e.target.closest('[data-r]'); if (b) { root.remove(); res(b.dataset.r === '1'); } });
  });
}
function download(name, content, type = 'text/plain') { const a = document.createElement('a'); a.href = URL.createObjectURL(content instanceof Blob ? content : new Blob([content], { type })); a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000); }
function csv(rows) { const e = v => { const s = String(v ?? ''); return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; }; return '﻿' + rows.map(r => r.map(e).join(';')).join('\r\n'); }
const n2 = v => (Number(v) || 0).toFixed(2).replace('.', ',');
function printDoc(title, html) {
  const w = window.open('', '_blank'); if (!w) return toast('Permita pop-ups para imprimir.', 'err');
  w.document.write(`<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>${esc(title)}</title><style>body{font-family:Calibri,'Segoe UI',Arial,sans-serif;color:#1E1E1E;max-width:760px;margin:40px auto;padding:0 24px;line-height:1.6;font-size:14px}h1{font-size:20px;text-align:center;letter-spacing:.06em;text-transform:uppercase;margin-bottom:24px}table{width:100%;border-collapse:collapse;font-family:Arial,sans-serif;font-size:12px;margin-top:12px}th,td{border-bottom:1px solid #ccc;padding:6px;text-align:left}td.r,th.r{text-align:right}.head{font-family:Arial,sans-serif;font-size:12px;color:#444;border-bottom:3px solid #F5EF90;padding-bottom:12px;margin-bottom:28px}.sig{margin-top:64px;text-align:center}.sig div{border-top:1px solid #333;width:320px;margin:0 auto;padding-top:6px}.small{font-size:11px;color:#555;font-family:Arial,sans-serif}@media print{body{margin:0 auto}}</style></head><body>${html}<script>setTimeout(()=>print(),300)<\/script></body></html>`);
  w.document.close();
}
const LOGO_URL = () => new URL('img/tpc-logo.png', location.href).href;
const cabecalho = ent => ent ? `<div class="head"><img src="${LOGO_URL()}" alt="TPC Advogados" style="height:34px;display:block;margin-bottom:10px"><b>${esc(ent.razao)}</b>${ent.cnpj ? ` · CNPJ ${esc(fmtDoc(ent.cnpj))}` : ''}${ent.endereco ? `<br>${esc(ent.endereco)}` : ''}${ent.email ? ` · ${esc(ent.email)}` : ''}${ent.telefone ? ` · ${esc(ent.telefone)}` : ''}</div>` : '';
function loadScript(src) { return new Promise((res, rej) => { if ($(`script[src="${src}"]`)) return res(); const s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = () => rej(new Error('Falha ao carregar ' + src)); document.head.append(s); }); }
const cssVar = n => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
const optList = (arr, sel, empty) => (empty != null ? `<option value="">${esc(empty)}</option>` : '') + arr.map(([v, l]) => `<option value="${esc(v)}" ${String(v) === String(sel ?? '') ? 'selected' : ''}>${esc(l)}</option>`).join('');

/* ---------- roteamento ---------- */
function route() {
  const h = location.hash.replace(/^#\/?/, ''); const [r, p] = h.split('/');
  ui.route = VIEWS[r] ? r : 'painel'; ui.param = p ? decodeURIComponent(p) : null; ui.sel.clear();
  const go = () => { render(); window.scrollTo(0, 0); countUp(); $('#main').focus({ preventScroll: true }); };
  if (document.startViewTransition && !REDUZ()) document.startViewTransition(go); else go();
}
const REDUZ = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
function countUp() {
  if (REDUZ()) return;
  $$('[data-count]').forEach(el => {
    const to = +el.dataset.count, f = v => el.dataset.fmt === 'pct' ? pct(v) : brl(v), t0 = performance.now(), d = 700;
    const step = n => { const k = Math.min(1, (n - t0) / d); el.textContent = f(to * (1 - Math.pow(1 - k, 3))); if (k < 1) requestAnimationFrame(step); else el.textContent = f(to); };
    requestAnimationFrame(step);
  });
}
function render() {
  ui.charts.forEach(c => c.destroy()); ui.charts = [];
  const v = VIEWS[ui.route];
  $('#main').innerHTML = `<div class="view">${v.render()}</div>`;
  v.mount?.(); updateNav();
  $('#topbar-title').textContent = v.title || 'Honorários';
  document.body.classList.remove('nav-open');
}
const rerender = () => { if (db) render(); };
function updateNav() {
  $$('[data-nav]').forEach(a => a.classList.toggle('active', a.dataset.nav === ui.route || (ui.route === 'contrato' && a.dataset.nav === 'contratos')));
  const at = db.parcelas.filter(p => stP(p) === 'atrasada').length;
  $('#n-atraso').textContent = at || '';
  $('#n-contratos').textContent = db.contratos.filter(c => c.status === 'ativo').length || '';
  const ver = db.contratos.filter(c => c.status === 'ativo' && verificar(c).some(x => x.nivel === 'erro')).length;
  $('#n-verif').textContent = ver || ''; $('#n-verif').classList.toggle('alert', ver > 0);
  $('#n-fila').textContent = ui.fila.length || '';
  $('#btn-lock').hidden = !cryptoKey;
}
const EYEBROW = { painel: 'Visão geral', contratos: 'Carteira', contrato: 'Contrato', recebiveis: 'Régua de cobrança', prognostico: 'Planejamento', comissoes: 'Captação', verificacao: 'Conformidade', importar: 'Dados', cadastros: 'Administração', config: 'Administração' };
const pageH = (t, sub, actions = '') => `<div class="page-h"><div><div class="eyebrow">${EYEBROW[ui.route] || 'Honorários'}</div><h1>${t}</h1>${sub ? `<p class="sub">${sub}</p>` : ''}</div><div class="actions">${actions}</div></div>`;
const emptyBox = (t, d, a = '') => `<div class="empty"><h3>${t}</h3><p>${d}</p>${a ? `<div class="actions" style="margin-top:18px">${a}</div>` : ''}</div>`;
function spark(vals) {
  const w = 160, h = 28, mx = Math.max(1, ...vals), st = w / Math.max(1, vals.length - 1);
  const pts = vals.map((v, i) => [i * st, h - 3 - (v / mx) * (h - 6)]);
  const d = pts.map((p, i) => (i ? 'L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join(' ');
  const last = pts[pts.length - 1];
  return `<svg class="spark" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" aria-hidden="true"><path class="area" d="${d} L${w} ${h} L0 ${h} Z"/><path d="${d}" vector-effect="non-scaling-stroke"/><circle cx="${last[0]}" cy="${last[1]}" r="2.2"/></svg>`;
}
const kpi = (o) => `<${o.href ? `a href="${o.href}"` : 'div'} class="kpi ${o.cls || ''}"><div class="lbl">${o.lbl}</div><div class="val"${o.n != null ? ` data-count="${o.n}" data-fmt="${o.fmt || 'brl'}"` : ''}>${o.val}</div>${o.spark || ''}<div class="sub">${o.sub}</div>${o.href ? icon('arrow', 'i-sm go') : ''}</${o.href ? 'a' : 'div'}>`;

/* =========================================================
   VIEWS
   ========================================================= */
const VIEWS = {};

/* ---------- Painel ---------- */
VIEWS.painel = {
  title: 'Painel',
  render() {
    if (!db.contratos.length) return pageH('Painel financeiro', 'Gestão de honorários, cobrança e prognóstico de receitas') +
      `<div class="card">${emptyBox('Nenhum contrato cadastrado', 'Importe a carteira existente por planilha ou pelos próprios arquivos dos contratos, ou cadastre o primeiro contrato manualmente.', `<a class="btn primary" href="#/importar">${icon('upload')} Importar contratos</a><button class="btn" data-act="ct-new">${icon('plus')} Novo contrato</button><button class="btn ghost" data-act="demo">Carregar dados de exemplo</button>`)}</div>`;
    const t = today(), mes = ym(t), inad = taxaInad();
    let aReceberMes = 0, recebidoMes = 0, atrasado = 0, carteira = 0; const clientesAtr = new Set();
    const aging = [0, 0, 0, 0];
    db.parcelas.forEach(p => {
      if (!valida(p)) return;
      if (p.status === 'paga') { if (ym(p.pagoEm || p.venc) === mes) recebidoMes += pago(p); return; }
      carteira += p.valor;
      if (ym(p.venc) === mes && p.venc >= t) aReceberMes += p.valor;
      if (p.venc < t) { atrasado += p.valor; clientesAtr.add(p.contratoId); const d = atraso(p); aging[d <= 30 ? 0 : d <= 60 ? 1 : d <= 90 ? 2 : 3] += p.valor; }
    });
    const comAPagar = comissoes().filter(x => !x.pagoInfo).reduce((s, x) => s + x.valor, 0);
    const fila = filaHoje();
    const prox = db.parcelas.filter(p => valida(p) && p.status !== 'paga' && p.venc >= t && p.venc <= addDaysISO(t, 10)).sort((a, b) => a.venc.localeCompare(b.venc)).slice(0, 8);
    const devedores = db.contratos.map(c => ({ c, r: resumoCt(c) })).filter(x => x.r.atrasado > 0).sort((a, b) => b.r.atrasado - a.r.atrasado).slice(0, 6);
    const porArea = {}; db.parcelas.forEach(p => { if (!valida(p) || p.status === 'paga') return; const c = ctById(p.contratoId); if (!c) return; porArea[c.area || 'Sem área'] = (porArea[c.area || 'Sem área'] || 0) + p.valor; });
    const maxA = Math.max(1, ...Object.values(porArea)), maxAg = Math.max(1, ...aging);
    const pend = db.contratos.filter(c => c.status === 'ativo').map(c => ({ c, v: verificar(c).filter(x => x.nivel === 'erro') })).filter(x => x.v.length);
    const semBackup = !db.settings.ultimoBackup || diffDays(db.settings.ultimoBackup.slice(0, 10), t) > 7;
    const hist = prognostico(1, 5).meses;
    return pageH('Painel financeiro', `${dataExtenso(t)} · ${db.contratos.filter(c => c.status === 'ativo').length} contratos ativos`, `<button class="btn" data-act="ct-new">${icon('plus')} Novo contrato</button>${fila.length ? `<button class="btn primary" data-act="fila-send">${icon('send')} Enviar cobranças do dia <span class="count alert">${fila.length}</span></button>` : ''}`) +
      (semBackup ? `<div class="notice warn">${icon('alert')}<div>Os dados ficam armazenados neste navegador. ${db.settings.ultimoBackup ? `O último backup foi feito em ${fdate(db.settings.ultimoBackup)}.` : 'Nenhum backup foi feito ainda.'} <a href="#" data-act="backup">Fazer backup agora</a>.</div></div>` : '') +
      `<div class="kpis k6 stagger">
        ${kpi({ cls: 'hl', href: '#/recebiveis', lbl: `A receber em ${MESES_EXT[new Date().getMonth()]}`, n: aReceberMes, val: brl(aReceberMes), sub: 'parcelas a vencer no mês' })}
        ${kpi({ lbl: 'Recebido no mês', n: recebidoMes, val: brl(recebidoMes), spark: spark(hist.map(m => m.recebido)), sub: 'evolução dos últimos 6 meses' })}
        ${kpi({ cls: atrasado ? 'danger' : '', href: '#/recebiveis', lbl: 'Em atraso', n: atrasado, val: brl(atrasado), sub: `${clientesAtr.size} contrato(s) inadimplente(s)` })}
        ${kpi({ lbl: 'Inadimplência · 12 meses', n: inad * 100, fmt: 'pct', val: pct(inad * 100), sub: 'vencidas há mais de 30 dias' })}
        ${kpi({ href: '#/prognostico', lbl: 'Carteira a receber', n: carteira, val: brl(carteira), sub: 'todas as parcelas em aberto' })}
        ${kpi({ href: '#/comissoes', lbl: 'Comissões a pagar', n: comAPagar, val: brl(comAPagar), sub: 'sobre honorários recebidos' })}
      </div>
      <div class="grid g-2-1">
        <div class="card"><div class="card-h"><div><h2>Prognóstico de receitas</h2><p class="hint">Clique em um mês para ver as parcelas que o compõem</p></div>
          <div class="seg" role="group" aria-label="Horizonte">${[6, 12, 18].map(h => `<button data-act="painel-h" data-h="${h}" class="${(ui.f.painelH || 6) === h ? 'on' : ''}" aria-pressed="${(ui.f.painelH || 6) === h}">${h} meses</button>`).join('')}</div></div>
          <div class="chart-legend" id="ch-prog-lg"></div><div class="chart-box"><canvas id="ch-prog" role="img" aria-label="Gráfico de receitas recebidas e previstas por mês"></canvas></div></div>
        <div class="card"><div class="card-h"><div><h2>Atraso por faixa</h2><p class="hint">Valor original das parcelas vencidas</p></div></div><div class="bars">${['1 a 30 dias', '31 a 60 dias', '61 a 90 dias', 'Acima de 90 dias'].map((l, i) => `<button class="bar-row" data-act="ir-atraso"><span class="lbl">${l}</span><div class="bar"><span style="width:${aging[i] / maxAg * 100}%;background:${i ? 'var(--danger)' : 'var(--warning)'};opacity:${.55 + i * .15}"></span></div><span class="num">${brl(aging[i])}</span></button>`).join('')}</div>
          <div class="card-h" style="margin-top:26px"><div><h2>Carteira por área</h2><p class="hint">Clique para filtrar os contratos</p></div></div><div class="bars">${Object.entries(porArea).sort((a, b) => b[1] - a[1]).map(([a, v]) => `<button class="bar-row" data-act="area-filtro" data-a="${esc(a)}"><span class="lbl" title="${esc(a)}">${esc(a)}</span><div class="bar"><span style="width:${v / maxA * 100}%"></span></div><span class="num">${brl(v)}</span></button>`).join('') || '<p class="hint">Sem parcelas em aberto.</p>'}</div></div>
      </div>
      <div class="grid g-2-1" style="margin-top:18px">
        <div class="card"><div class="card-h"><div><h2>Próximos vencimentos</h2><p class="hint">Próximos 10 dias</p></div><a class="btn sm" href="#/recebiveis">Abrir cobrança ${icon('arrow', 'i-sm')}</a></div>${prox.length ? tabelaParcelas(prox, { compacta: true }) : '<p class="hint">Nenhum vencimento nos próximos 10 dias.</p>'}</div>
        <div class="card"><div class="card-h"><div><h2>Maiores pendências</h2><p class="hint">Contratos com parcelas vencidas</p></div></div>${devedores.length ? `<div class="table-wrap"><table class="tbl"><tbody>${devedores.map(({ c, r }) => `<tr class="click" data-go="contrato/${c.id}"><td><div class="cell-main">${esc(c.cliente.nome)}</div><div class="cell-sub">${r.nAtr} parcela(s) · maior atraso ${r.maxAtr} dias</div></td><td class="right num t-danger">${brl(r.atrasado)}</td></tr>`).join('')}</tbody></table></div>` : '<p class="hint">Nenhum contrato em atraso.</p>'}
          ${pend.length ? `<div class="notice danger" style="margin:16px 0 0">${icon('shield')}<div>${pend.length} contrato(s) ativo(s) com pendência crítica de cadastro ou cobrança. <a href="#/verificacao">Ver verificação</a></div></div>` : ''}</div>
      </div>`;
  },
  mount() { if (db.contratos.length) { const h = ui.f.painelH || 6; chartProg('ch-prog', prognostico(h + 1, Math.max(3, 12 - h - 1))); } }
};
function chartProg(id, prog) {
  const el = document.getElementById(id); if (!el || !window.Chart) return;
  const base = prog.base, idxBase = prog.meses.findIndex(m => m.k === base);
  Chart.defaults.font.family = "'Instrument Sans', 'Segoe UI', sans-serif";
  Chart.defaults.font.size = 12;
  const banda = { id: 'banda', beforeDatasetsDraw(ch) { if (idxBase < 0) return; const x = ch.scales.x, a = ch.chartArea, w = x.width / ch.data.labels.length; const ctx = ch.ctx; ctx.save(); ctx.fillStyle = cssVar('--c-band'); ctx.fillRect(x.getPixelForValue(idxBase) - w / 2, a.top, w, a.bottom - a.top); ctx.restore(); } };
  const series = [
    { type: 'bar', label: 'Recebido', data: prog.meses.map(m => round2(m.recebido)), backgroundColor: cssVar('--c-recebido'), stack: 's', borderRadius: 0, barPercentage: .62, categoryPercentage: .9 },
    { type: 'bar', label: 'A receber (ajustado)', data: prog.meses.map(m => m.k >= base ? round2(m.aberto * (1 - prog.inad) + m.exito) : 0), backgroundColor: cssVar('--c-previsto'), stack: 's', borderRadius: 0, barPercentage: .62, categoryPercentage: .9 },
    { type: 'line', label: 'Contratado no mês', data: prog.meses.map(m => round2(m.contratual)), borderColor: cssVar('--c-linha'), backgroundColor: cssVar('--c-linha'), stack: 'l', tension: .3, pointRadius: 2.5, pointHoverRadius: 5, borderWidth: 1.6, borderDash: [5, 4] }
  ];
  const ch = new Chart(el, {
    data: { labels: prog.meses.map(m => ymLabel(m.k)), datasets: series }, plugins: [banda],
    options: {
      responsive: true, maintainAspectRatio: false, interaction: { mode: 'index', intersect: false },
      animation: REDUZ() ? false : { duration: 650, easing: 'easeOutCubic' },
      onHover: (e, els) => { e.native.target.style.cursor = els.length ? 'pointer' : 'default'; },
      onClick: (e, els) => { if (els.length) detalheMes(prog.meses[els[0].index].k); },
      plugins: {
        legend: { display: false },
        tooltip: { backgroundColor: '#1E1E1E', titleColor: '#F5EF90', bodyColor: '#EDECEC', footerColor: '#B9B5B1', padding: 12, cornerRadius: 3, boxPadding: 4, titleFont: { family: 'Jost', size: 13, weight: '500' },
          callbacks: { title: it => { const k = prog.meses[it[0].dataIndex].k; return ymLabel(k) + (k === base ? ' · mês atual' : k < base ? ' · realizado' : ' · previsão'); }, label: c => ` ${c.dataset.label}: ${brl(c.parsed.y)}`, footer: () => 'Clique para detalhar' } }
      },
      scales: {
        x: { stacked: true, grid: { display: false }, border: { color: cssVar('--border-strong') }, ticks: { color: cssVar('--muted'), maxRotation: 0, autoSkip: true, autoSkipPadding: 10 } },
        y: { stacked: true, border: { display: false }, ticks: { color: cssVar('--muted'), maxTicksLimit: 6, callback: v => v >= 1e6 ? 'R$ ' + (v / 1e6).toLocaleString('pt-BR') + ' mi' : v >= 1000 ? 'R$ ' + (v / 1000).toLocaleString('pt-BR') + ' mil' : 'R$ ' + v }, grid: { color: cssVar('--c-grid'), drawTicks: false } }
      }
    }
  });
  ui.charts.push(ch);
  const lg = document.getElementById(id + '-lg');
  if (lg) {
    lg.innerHTML = series.map((d, i) => `<button class="lg" data-i="${i}" aria-pressed="true"><i style="background:${d.type === 'line' ? 'transparent' : d.backgroundColor};${d.type === 'line' ? `border-top:2px dashed ${d.borderColor};height:0` : ''}"></i>${d.label}</button>`).join('');
    lg.onclick = e => { const b = e.target.closest('.lg'); if (!b) return; const i = +b.dataset.i, vis = ch.isDatasetVisible(i); ch.setDatasetVisibility(i, !vis); b.classList.toggle('off', vis); b.setAttribute('aria-pressed', String(!vis)); ch.update(); };
  }
}
function detalheMes(k) {
  const t = today();
  const doMes = db.parcelas.filter(p => ctById(p.contratoId) && valida(p) && ((p.status === 'paga' && ym(p.pagoEm || p.venc) === k) || (p.status !== 'paga' && ym(p.venc) === k))).sort((a, b) => a.venc.localeCompare(b.venc));
  const rec = doMes.filter(p => p.status === 'paga').reduce((s, p) => s + pago(p), 0), ab = doMes.filter(p => p.status !== 'paga').reduce((s, p) => s + p.valor, 0);
  const [y, m] = k.split('-');
  openModal({
    title: `${MESES_EXT[+m - 1][0].toUpperCase() + MESES_EXT[+m - 1].slice(1)} de ${y}`, wide: true,
    body: `<div class="kpis" style="box-shadow:none">${kpi({ lbl: 'Recebido', val: brl(rec), sub: `${doMes.filter(p => p.status === 'paga').length} parcela(s)` })}${kpi({ lbl: k < ym(t) ? 'Não pago' : 'Em aberto', cls: k < ym(t) && ab ? 'danger' : '', val: brl(ab), sub: `${doMes.filter(p => p.status !== 'paga').length} parcela(s)` })}${kpi({ lbl: 'Total do mês', val: brl(rec + ab), sub: 'recebido e em aberto' })}</div>
      ${doMes.length ? tabelaParcelas(doMes, {}) : '<p class="hint">Nenhuma parcela neste mês.</p>'}`,
    foot: `<button class="btn ghost" data-act="modal-close">Fechar</button>`
  });
}

/* ---------- paleta de comandos (Ctrl K) ---------- */
function openPalette() {
  if ($('.palette') || !db) return;
  const el = document.createElement('div'); el.className = 'palette';
  el.innerHTML = `<div class="palette-box" role="dialog" aria-modal="true" aria-label="Buscar"><input type="text" placeholder="Buscar cliente, nº do contrato ou ação" aria-label="Buscar" autocomplete="off"><div class="palette-list" role="listbox"></div></div>`;
  document.body.append(el);
  const inp = $('input', el), list = $('.palette-list', el); let sel = 0, items = [];
  const nav = [['painel', 'Painel', 'home'], ['contratos', 'Contratos', 'file'], ['recebiveis', 'Cobrança', 'cash'], ['prognostico', 'Prognóstico', 'chart'], ['comissoes', 'Comissões', 'percent'], ['verificacao', 'Verificação', 'shield'], ['importar', 'Importar', 'upload'], ['cadastros', 'Cadastros', 'building'], ['config', 'Configurações', 'gear']]
    .map(([r, l, i]) => ({ g: 'Ir para', l, i, run: () => location.hash = '#/' + r }));
  const acoes = [
    { g: 'Ações', l: 'Novo contrato', i: 'plus', run: () => formContrato() },
    { g: 'Ações', l: 'Enviar cobranças do dia', i: 'send', run: () => enviarLote(filaHoje()) },
    { g: 'Ações', l: 'Importar planilha da carteira', i: 'upload', run: () => pick('planilha') },
    { g: 'Ações', l: 'Importar arquivos de contratos', i: 'file', run: () => pick('contratos') },
    { g: 'Ações', l: 'Fazer backup', i: 'download', run: () => gerarBackup() },
    { g: 'Ações', l: 'Alternar tema claro ou escuro', i: 'sun', run: () => ACT.theme() }
  ];
  const draw = () => {
    const q = norm(inp.value);
    const cts = db.contratos.filter(c => q && norm([c.cliente.nome, c.numero, c.cliente.doc, c.area].join(' ')).includes(q)).slice(0, 8)
      .map(c => ({ g: 'Contratos', l: c.cliente.nome, s: `${c.numero || ''} · ${brl(resumoCt(c).aberto)} em aberto`, i: 'file', run: () => location.hash = '#/contrato/' + c.id }));
    items = [...cts, ...[...acoes, ...nav].filter(a => !q || norm(a.l).includes(q))];
    sel = Math.max(0, Math.min(sel, items.length - 1));
    let g = '';
    list.innerHTML = items.map((it, i) => `${it.g !== g ? `<div class="palette-group">${(g = it.g)}</div>` : ''}<button class="palette-item ${i === sel ? 'sel' : ''}" data-i="${i}" role="option" aria-selected="${i === sel}">${icon(it.i || 'arrow', 'i-sm')}<span>${esc(it.l)}</span>${it.s ? `<small>${esc(it.s)}</small>` : ''}</button>`).join('') || '<p class="hint" style="padding:14px">Nada encontrado.</p>';
    list.querySelector('.sel')?.scrollIntoView({ block: 'nearest' });
  };
  const close = () => el.remove(), run = i => { const it = items[i]; close(); it?.run(); };
  inp.addEventListener('input', () => { sel = 0; draw(); });
  inp.addEventListener('keydown', e => {
    if (e.key === 'ArrowDown') { sel = Math.min(items.length - 1, sel + 1); draw(); e.preventDefault(); }
    else if (e.key === 'ArrowUp') { sel = Math.max(0, sel - 1); draw(); e.preventDefault(); }
    else if (e.key === 'Enter') { e.preventDefault(); run(sel); }
    else if (e.key === 'Escape') { e.stopPropagation(); close(); }
  });
  el.addEventListener('click', e => { e.stopPropagation(); const b = e.target.closest('[data-i]'); if (b) run(+b.dataset.i); else if (e.target === el) close(); });
  draw(); inp.focus();
}

/* ---------- tabela de parcelas reutilizável ---------- */
function tabelaParcelas(ps, o = {}) {
  const linhas = ps.map(p => {
    const c = ctById(p.contratoId), s = stP(p), ult = (p.cobrancas || []).slice(-1)[0];
    const tipo = tipoCobranca(p), lbl = { lembrete: 'Lembrar', vencimento: 'Cobrar', atraso: 'Cobrar', recibo: 'Recibo' }[tipo];
    return `<tr>
      ${o.sel ? `<td><input type="checkbox" data-sel="${p.id}" ${ui.sel.has(p.id) ? 'checked' : ''} aria-label="Selecionar"></td>` : ''}
      <td class="num">${fdate(p.venc)}</td>
      ${o.semCliente ? '' : `<td style="min-width:${o.compacta ? 170 : 200}px"><a href="#/contrato/${c.id}" class="cell-main" style="color:inherit">${esc(c.cliente.nome)}</a><div class="cell-sub">${esc(c.numero || '')}${c.area && !o.compacta ? ' · ' + esc(c.area) : ''}</div></td>`}
      <td style="white-space:nowrap">${esc(p.desc || 'Parcela')} ${p.n ? `<span class="muted">${p.n}</span>` : ''}</td>
      <td class="right num">${brl(p.valor)}${s === 'atrasada' && !o.compacta ? `<div class="cell-sub">${brl(atualizado(p))} atualiz.</div>` : ''}${s === 'paga' && pago(p) !== p.valor ? `<div class="cell-sub">pago ${brl(pago(p))}</div>` : ''}</td>
      <td>${chipP(p)}${s === 'paga' && p.pagoEm ? `<div class="cell-sub">em ${fdate(p.pagoEm)}</div>` : ''}${boletoAtivo(p) && s !== 'paga' ? `<div class="cell-sub">boleto emitido</div>` : ''}${p.nf ? `<div class="cell-sub">${p.nf.numero ? 'NF nº ' + esc(p.nf.numero) : 'NF ' + esc(NF_ST[p.nf.status] || p.nf.status || '').toLowerCase()}</div>` : ''}</td>
      ${o.compacta ? '' : `<td class="cell-sub">${ult ? `${fdatetime(ult.em)}<br>${esc(ult.canal)} · ${(p.cobrancas || []).length}x` : '—'}</td>`}
      <td class="acts">
        ${s === 'paga' ? `${asaasOk() ? `<button class="icon-btn" title="Nota fiscal" data-act="nota" data-id="${p.id}">${icon('receipt')}</button>` : ''}<button class="icon-btn" title="Imprimir recibo" data-act="recibo" data-id="${p.id}">${icon('printer')}</button><button class="icon-btn" title="Enviar recibo por e-mail" data-act="cobrar" data-tipo="recibo" data-id="${p.id}">${icon('mail')}</button>${o.compacta ? '' : `<button class="icon-btn" title="Desfazer baixa" data-act="estornar" data-id="${p.id}">${icon('undo')}</button>`}`
        : valida(p) ? `<button class="btn sm primary" title="Enviar e-mail de cobrança com um clique" data-act="cobrar" data-id="${p.id}">${icon('send', 'i-sm')} ${lbl}</button>
          <button class="icon-btn" title="Pré-visualizar mensagem" data-act="preview" data-id="${p.id}">${icon('eye')}</button>
          ${asaasOk() ? `<button class="icon-btn" title="Boleto bancário" data-act="boleto" data-id="${p.id}">${icon('barcode')}</button>` : ''}
          ${o.compacta ? '' : `<button class="icon-btn" title="WhatsApp" data-act="whats" data-id="${p.id}">${icon('chat')}</button><button class="icon-btn" title="QR Code PIX" data-act="pix" data-id="${p.id}">${icon('qr')}</button>`}
          <button class="icon-btn" title="Registrar pagamento" data-act="pagar" data-id="${p.id}">${icon('check')}</button>` : ''}
        ${o.editar ? `<button class="icon-btn" title="Editar parcela" data-act="parc-edit" data-id="${p.id}">${icon('edit')}</button>` : ''}
      </td></tr>`;
  }).join('');
  return `<div class="table-wrap"><table class="tbl"><thead><tr>${o.sel ? `<th><input type="checkbox" data-act="sel-all" aria-label="Selecionar todas"></th>` : ''}<th>Vencimento</th>${o.semCliente ? '' : '<th>Cliente</th>'}<th>Parcela</th><th class="right">Valor</th><th>Situação</th>${o.compacta ? '' : '<th>Última cobrança</th>'}<th></th></tr></thead><tbody>${linhas}</tbody></table></div>`;
}

/* ---------- Contratos ---------- */
VIEWS.contratos = {
  title: 'Contratos',
  render() {
    const f = ui.f.ct, q = norm(f.q);
    const lista = db.contratos.filter(c => (!f.status || c.status === f.status) && (!f.area || c.area === f.area) && (!f.ent || c.entidadeId === f.ent) && (!f.capt || (c.captacao || []).some(x => x.pessoaId === f.capt)) && (!q || norm([c.cliente.nome, c.numero, c.cliente.doc, c.escopo, c.area].join(' ')).includes(q)))
      .sort((a, b) => a.cliente.nome.localeCompare(b.cliente.nome, 'pt-BR'));
    const rows = lista.map(c => {
      const r = resumoCt(c), v = verificar(c), err = v.filter(x => x.nivel === 'erro').length, av = v.filter(x => x.nivel === 'aviso').length;
      return `<tr class="click" data-go="contrato/${c.id}">
        <td><div class="cell-main">${esc(c.cliente.nome)}</div><div class="cell-sub">${esc(c.numero || 's/n')}${c.cliente.doc ? ' · ' + esc(fmtDoc(c.cliente.doc)) : ''}</div></td>
        <td>${esc(c.area || '—')}<div class="cell-sub">${TIPOS[c.tipo] || ''}</div></td>
        <td class="right num">${brl(c.valorTotal || r.total)}</td>
        <td class="right num t-success">${brl(r.recebido)}</td>
        <td class="right num">${brl(r.aberto)}${r.atrasado ? `<div class="cell-sub t-danger">${brl(r.atrasado)} em atraso</div>` : ''}</td>
        <td>${r.prox ? `${fdate(r.prox.venc)}<div class="cell-sub">${brl(r.prox.valor)}</div>` : '—'}</td>
        <td class="cell-sub">${(c.captacao || []).map(x => esc(pessoa(x.pessoaId)?.nome || '?')).join(', ') || '—'}</td>
        <td><span class="chip ${STATUS_CT[c.status]?.[1]}">${STATUS_CT[c.status]?.[0]}</span></td>
        <td>${err ? `<span class="chip danger" title="Pendências críticas">${err}</span>` : av ? `<span class="chip warn">${av}</span>` : `<span class="chip ok">${icon('check', 'i-sm')}</span>`}</td></tr>`;
    }).join('');
    const tot = lista.reduce((a, c) => { const r = resumoCt(c); a.v += +(c.valorTotal || r.total); a.r += r.recebido; a.a += r.aberto; return a; }, { v: 0, r: 0, a: 0 });
    return pageH('Contratos', `${lista.length} de ${db.contratos.length} contratos`, `<button class="btn" data-act="exp-contratos">${icon('download')} Exportar</button><a class="btn" href="#/importar">${icon('upload')} Importar</a><button class="btn primary" data-act="ct-new">${icon('plus')} Novo contrato</button>`) +
      `<div class="card"><div class="toolbar">
        <div class="search">${icon('search')}<input type="search" placeholder="Buscar cliente, número, CPF/CNPJ, escopo" value="${esc(f.q)}" data-f="ct.q"></div>
        <select data-f="ct.status" style="width:auto">${optList(Object.entries(STATUS_CT).map(([k, v]) => [k, v[0]]), f.status, 'Todos os status')}</select>
        <select data-f="ct.area" style="width:auto">${optList(db.areas.map(a => [a, a]), f.area, 'Todas as áreas')}</select>
        <select data-f="ct.capt" style="width:auto">${optList(db.pessoas.map(p => [p.id, p.nome]), f.capt, 'Toda captação')}</select>
        ${db.entidades.length > 1 ? `<select data-f="ct.ent" style="width:auto">${optList(db.entidades.map(e => [e.id, e.fantasia || e.razao]), f.ent, 'Todas as entidades')}</select>` : ''}
      </div>
      ${lista.length ? `<div class="table-wrap"><table class="tbl"><thead><tr><th>Cliente / contrato</th><th>Área</th><th class="right">Contratado</th><th class="right">Recebido</th><th class="right">Em aberto</th><th>Próximo venc.</th><th>Captação</th><th>Status</th><th>Verif.</th></tr></thead><tbody>${rows}</tbody><tfoot><tr><td colspan="2">Total</td><td class="right num">${brl(tot.v)}</td><td class="right num">${brl(tot.r)}</td><td class="right num">${brl(tot.a)}</td><td colspan="4"></td></tr></tfoot></table></div>` : emptyBox('Nenhum contrato encontrado', 'Ajuste os filtros ou cadastre um novo contrato.')}</div>`;
  }
};

/* ---------- Detalhe do contrato ---------- */
VIEWS.contrato = {
  title: 'Contrato',
  render() {
    const c = ctById(ui.param);
    if (!c) return emptyBox('Contrato não encontrado', '', '<a class="btn" href="#/contratos">Voltar</a>');
    const r = resumoCt(c), ent = entidade(c.entidadeId), resp = pessoa(c.responsavelId), v = verificar(c), cl = c.cliente;
    const { multa, juros } = encargos(c);
    const ps = parcelasDe(c.id);
    const hist = ps.flatMap(p => (p.cobrancas || []).map(h => ({ ...h, p }))).sort((a, b) => b.em.localeCompare(a.em));
    const prog = (r.total ? r.recebido / r.total * 100 : 0);
    return `<a class="back" href="#/contratos">← Todos os contratos</a>` +
      pageH(esc(cl.nome), `Contrato ${esc(c.numero || 's/n')} · ${esc(c.area || 'área não definida')} · <span class="chip ${STATUS_CT[c.status]?.[1]}">${STATUS_CT[c.status]?.[0]}</span>${c.pausarCobranca ? ' <span class="chip warn">cobrança automática pausada</span>' : ''}`,
        `${c.arquivoId ? `<button class="btn" data-act="ver-arquivo" data-id="${c.id}">${icon('file')} Ver contrato</button>` : ''}<button class="btn" data-act="extrato" data-id="${c.id}">${icon('printer')} Extrato</button>${r.atrasado ? `<button class="btn" data-act="reneg" data-id="${c.id}">${icon('repeat')} Renegociar</button>` : ''}<button class="btn primary" data-act="ct-edit" data-id="${c.id}">${icon('edit')} Editar</button>`) +
      `<div class="kpis">
        <div class="kpi"><div class="lbl">Valor contratado</div><div class="val">${brl(c.valorTotal || r.total)}</div><div class="sub">${TIPOS[c.tipo] || ''}</div></div>
        <div class="kpi success"><div class="lbl">Recebido</div><div class="val">${brl(r.recebido)}</div><div class="progress"><span style="width:${Math.min(100, prog)}%"></span></div></div>
        <div class="kpi"><div class="lbl">Em aberto</div><div class="val">${brl(r.aberto)}</div><div class="sub">${r.prox ? `próximo: ${fdate(r.prox.venc)}` : 'sem vencimentos futuros'}</div></div>
        <div class="kpi ${r.atrasado ? 'danger' : ''}"><div class="lbl">Em atraso</div><div class="val">${brl(r.atrasado)}</div><div class="sub">${r.nAtr ? `${r.nAtr} parcela(s), até ${r.maxAtr} dias` : 'em dia'}</div></div>
      </div>
      <div class="grid g3">
        <div class="card"><div class="card-h"><h3>Cliente</h3></div><dl class="dl">
          <dt>Nome</dt><dd>${esc(cl.nome)}</dd><dt>CPF/CNPJ</dt><dd>${esc(fmtDoc(cl.doc)) || '—'} ${cl.doc && !docOk(cl.doc) ? '<span class="chip danger">inválido</span>' : ''}</dd>
          <dt>Contato</dt><dd>${esc(cl.contato || '—')}</dd><dt>E-mail</dt><dd>${esc(cl.email || '—')}${cl.emailCc ? `<div class="cell-sub">cópia: ${esc(cl.emailCc)}</div>` : ''}</dd>
          <dt>Telefone</dt><dd>${esc(cl.telefone || '—')}</dd><dt>Endereço</dt><dd>${esc(cl.endereco || '—')}</dd></dl></div>
        <div class="card"><div class="card-h"><h3>Contrato</h3></div><dl class="dl">
          <dt>Escopo</dt><dd>${esc(c.escopo || '—')}</dd><dt>Área</dt><dd>${esc(c.area || '—')}</dd>
          <dt>Assinatura</dt><dd>${fdate(c.dataAssinatura)}</dd><dt>Vigência</dt><dd>${fdate(c.inicio)} a ${c.fim ? fdate(c.fim) : 'indeterminado'}</dd>
          <dt>Responsável</dt><dd>${esc(resp?.nome || '—')}</dd><dt>Encargos</dt><dd>multa ${pct(multa)} · juros ${pct(juros)} a.m.</dd>
          ${c.reajuste ? `<dt>Reajuste</dt><dd>${esc(c.reajuste)}${c.ultimoReajuste ? ` · último ${fdate(c.ultimoReajuste)}` : ''}</dd>` : ''}
          ${+c.exito?.pct ? `<dt>Êxito</dt><dd>${pct(c.exito.pct)} sobre ${brl(c.exito.base)} · prob. ${pct(c.exito.prob || 0)}${c.exito.data ? ` · prev. ${fdate(c.exito.data)}` : ''}${c.exito.desc ? `<div class="cell-sub">${esc(c.exito.desc)}</div>` : ''}</dd>` : ''}</dl></div>
        <div class="card"><div class="card-h"><h3>Faturamento e captação</h3></div><dl class="dl">
          <dt>Faturar por</dt><dd>${ent ? `${esc(ent.razao)}<div class="cell-sub">${esc(fmtDoc(ent.cnpj))}${ent.pixChave ? ' · PIX ' + esc(ent.pixChave) : ''}</div>` : '<span class="chip danger">não vinculado</span>'}</dd>
          ${(c.captacao || []).map(x => { const pe = pessoa(x.pessoaId); return `<dt>Captação</dt><dd>${esc(pe?.nome || '?')} <span class="cell-sub">${esc(TIPO_PESSOA[pe?.tipo] || '')}</span><div class="cell-sub">${x.tipo === 'pct' ? pct(x.valor) + ' dos honorários recebidos' : brl(x.valor) + ' (rateado nas parcelas)'} · total estimado ${brl(comissaoValor(x, c, r.total))}</div></dd>`; }).join('') || '<dt>Captação</dt><dd>—</dd>'}
        </dl></div>
      </div>
      <div class="card" style="margin-top:16px"><div class="card-h"><div><h2>Cronograma de pagamento</h2><p class="hint">O botão de cobrança escolhe o modelo adequado: lembrete, vencimento ou atraso.</p></div><div class="actions">${c.tipo === 'mensal' ? `<button class="btn sm" data-act="renovar" data-id="${c.id}">${icon('repeat')} Gerar novas competências</button>` : ''}<button class="btn sm" data-act="parc-add" data-id="${c.id}">${icon('plus')} Parcela avulsa / êxito</button></div></div>
        ${ps.length ? tabelaParcelas(ps, { semCliente: true, editar: true }) : '<p class="hint">Nenhuma parcela cadastrada.</p>'}</div>
      <div class="grid g2" style="margin-top:16px">
        <div class="card"><div class="card-h"><div><h2>Verificação automática</h2><p class="hint">Conferência de cadastro, cronograma, encargos e riscos</p></div></div>
          ${v.length ? `<div class="alert-list">${v.map(x => `<div class="alert-item"><span class="dot ${x.nivel}"></span><div><b>${esc(x.msg)}</b> <span class="chip ${NIVEL[x.nivel][1]}">${NIVEL[x.nivel][0]}</span>${x.dica ? `<div class="hint">${esc(x.dica)}</div>` : ''}</div></div>`).join('')}</div>` : `<p class="t-success">${icon('check')} Nenhuma inconsistência encontrada.</p>`}</div>
        <div class="card"><div class="card-h"><h2>Histórico de cobranças</h2></div>${hist.length ? `<div class="timeline">${hist.slice(0, 40).map(h => `<div><time>${fdatetime(h.em)}</time><span>${esc(db.settings.templates[h.tipo]?.nome || h.tipo)} · parcela ${h.p.n} · ${esc(h.canal)}</span></div>`).join('')}</div>` : '<p class="hint">Nenhuma cobrança enviada.</p>'}
          ${c.obs ? `<div class="card-h" style="margin-top:20px"><h3>Observações</h3></div><p style="white-space:pre-wrap">${esc(c.obs)}</p>` : ''}</div>
      </div>
      <p style="margin-top:20px;text-align:right"><button class="btn ghost sm t-danger" data-act="ct-del" data-id="${c.id}">${icon('trash')} Excluir contrato</button></p>`;
  }
};

/* ---------- Cobrança (recebíveis) ---------- */
VIEWS.recebiveis = {
  title: 'Cobrança',
  render() {
    const t = today(), f = ui.f.rec, q = norm(f.q), mes = ym(t), prox = ym(addMonthsISO(t, 1, 1));
    const abertas = db.parcelas.filter(p => valida(p) && p.status !== 'paga');
    const abas = {
      atrasadas: ['Em atraso', abertas.filter(p => p.venc < t)],
      semana: ['Próximos 7 dias', abertas.filter(p => p.venc >= t && p.venc <= addDaysISO(t, 7))],
      mes: ['Este mês', abertas.filter(p => ym(p.venc) === mes)],
      prox: ['Próximo mês', abertas.filter(p => ym(p.venc) === prox)],
      abertas: ['Todas em aberto', abertas],
      pagas: ['Pagas no mês', db.parcelas.filter(p => p.status === 'paga' && ym(p.pagoEm || p.venc) === mes)]
    };
    let ps = abas[f.aba][1].filter(p => { const c = ctById(p.contratoId); return c && (!q || norm(c.cliente.nome + ' ' + c.numero).includes(q)); });
    ps.sort((a, b) => f.aba === 'pagas' ? (b.pagoEm || '').localeCompare(a.pagoEm || '') : a.venc.localeCompare(b.venc));
    const soma = ps.reduce((s, p) => s + (p.status === 'paga' ? pago(p) : p.valor), 0);
    const fila = filaHoje();
    return pageH('Cobrança', 'Régua de cobrança, envio com um clique e baixa de pagamentos', `<button class="btn" data-act="exp-parcelas">${icon('download')} Exportar</button>`) +
      `<div class="card" style="margin-bottom:16px"><div class="card-h"><div><h2>Fila de cobrança de hoje</h2><p class="hint">Lembretes ${db.settings.diasLembrete} dia(s) antes do vencimento, aviso no dia e reiteração de atrasos a cada ${db.settings.intervaloReenvio} dias. Canal: ${esc(MODOS_EMAIL[db.settings.emailMode])}.</p></div>
        ${fila.length ? `<button class="btn primary" data-act="fila-send">${icon('send')} Enviar ${fila.length} cobrança(s)</button>` : '<span class="chip ok">Nada pendente hoje</span>'}</div>
        ${fila.length ? `<div class="bars">${['lembrete', 'vencimento', 'atraso'].map(k => { const n = fila.filter(x => x.tipo === k); return n.length ? `<div class="bar-row wide"><span class="lbl">${esc(db.settings.templates[k].nome)}</span><span class="hint">${n.length} parcela(s)</span><span class="num">${brl(n.reduce((s, x) => s + x.p.valor, 0))}</span></div>` : ''; }).join('')}</div>` : ''}</div>
      <div class="card"><div class="tabs">${Object.entries(abas).map(([k, [l, arr]]) => `<button class="tab ${f.aba === k ? 'active' : ''}" data-act="aba" data-k="${k}">${l}<span class="count ${k === 'atrasadas' && arr.length ? 'alert' : ''}">${arr.length || ''}</span></button>`).join('')}</div>
        <div class="toolbar"><div class="search">${icon('search')}<input type="search" placeholder="Filtrar por cliente ou contrato" value="${esc(f.q)}" data-f="rec.q"></div>
          <span class="hint">${ps.length} parcela(s) · <b>${brl(soma)}</b></span>
          ${f.aba !== 'pagas' && asaasOk() ? `<button class="btn sm" data-act="lote-boletos" ${ui.sel.size ? '' : 'disabled'} id="btn-lote-bol">${icon('barcode', 'i-sm')} Emitir boletos</button>` : ''}${f.aba !== 'pagas' ? `<button class="btn sm" data-act="lote-sel" ${ui.sel.size ? '' : 'disabled'} id="btn-lote">${icon('send', 'i-sm')} Cobrar selecionadas${ui.sel.size ? ` (${ui.sel.size})` : ''}</button>` : ''}</div>
        ${ps.length ? tabelaParcelas(ps, { sel: f.aba !== 'pagas' }) : emptyBox('Nada por aqui', 'Nenhuma parcela nesta situação.')}</div>`;
  }
};

/* ---------- Prognóstico ---------- */
VIEWS.prognostico = {
  title: 'Prognóstico',
  render() {
    const h = ui.f.prog.h, prog = prognostico(h, 6), base = prog.base;
    const fut = prog.meses.filter(m => m.k >= base), tot = k => fut.reduce((s, m) => s + m[k], 0);
    const areas = {}; fut.forEach(m => Object.entries(m.porArea).forEach(([a, v]) => areas[a] = (areas[a] || 0) + v));
    const maxA = Math.max(1, ...Object.values(areas));
    const pagas = db.parcelas.filter(p => p.status === 'paga' && p.pagoEm);
    const prazoMedio = pagas.length ? pagas.reduce((s, p) => s + diffDays(p.venc, p.pagoEm), 0) / pagas.length : 0;
    const atrasado = db.parcelas.filter(p => valida(p) && p.status !== 'paga' && p.venc < today()).reduce((s, p) => s + p.valor, 0);
    return pageH('Prognóstico de receitas', `Previsão mensal atualizada a partir dos cronogramas, ajustada pela inadimplência histórica de ${pct(prog.inad * 100)} e pelos êxitos ponderados por probabilidade`,
      `<select data-f="prog.h" style="width:auto">${optList([[6, 'Próximos 6 meses'], [12, 'Próximos 12 meses'], [24, 'Próximos 24 meses']], h)}</select><button class="btn" data-act="exp-prog">${icon('download')} Exportar</button>`) +
      `<div class="kpis">
        <div class="kpi"><div class="lbl">Contratado no período</div><div class="val">${brl(tot('aberto'))}</div><div class="sub">parcelas a vencer</div></div>
        <div class="kpi success"><div class="lbl">Previsão ajustada</div><div class="val">${brl(tot('ajustado'))}</div><div class="sub">inclui êxitos ponderados</div></div>
        <div class="kpi"><div class="lbl">Comissões previstas</div><div class="val">${brl(tot('comissao'))}</div><div class="sub">captação</div></div>
        <div class="kpi"><div class="lbl">Líquido previsto</div><div class="val">${brl(tot('liquido'))}</div><div class="sub">após comissões</div></div>
        <div class="kpi danger"><div class="lbl">Atraso a recuperar</div><div class="val">${brl(atrasado)}</div><div class="sub">fora do prognóstico mensal</div></div>
        <div class="kpi"><div class="lbl">Prazo médio de pagamento</div><div class="val">${prazoMedio > 0 ? '+' : ''}${prazoMedio.toFixed(1).replace('.', ',')} dias</div><div class="sub">em relação ao vencimento</div></div>
      </div>
      <div class="card" style="margin-bottom:18px"><div class="card-h"><div><h2>Receitas mês a mês</h2><p class="hint">Faixa destacada indica o mês atual. Clique em um mês para detalhar.</p></div></div><div class="chart-legend" id="ch-prog2-lg"></div><div class="chart-box" style="height:360px"><canvas id="ch-prog2" role="img" aria-label="Gráfico do prognóstico mensal de receitas"></canvas></div></div>
      <div class="grid g-2-1">
        <div class="card"><div class="card-h"><h2>Mês a mês</h2></div><div class="table-wrap"><table class="tbl"><thead><tr><th>Mês</th><th class="right">Contratado</th><th class="right">Recebido</th><th class="right">A receber</th><th class="right">Êxito pond.</th><th class="right">Previsão ajustada</th><th class="right">Comissões</th><th class="right">Líquido</th></tr></thead>
          <tbody>${prog.meses.map(m => `<tr class="click" data-act="mes" data-k="${m.k}" ${m.k === base ? 'style="background:var(--accent-soft)"' : ''}><td>${ymLabel(m.k)}${m.k < base ? ' <span class="cell-sub">realizado</span>' : ''}</td><td class="right num">${brl(m.contratual)}</td><td class="right num t-success">${brl(m.recebido)}</td><td class="right num">${brl(m.aberto)}</td><td class="right num">${brl(m.exito)}</td><td class="right num"><b>${brl(m.ajustado)}</b></td><td class="right num">${brl(m.comissao)}</td><td class="right num">${brl(m.liquido)}</td></tr>`).join('')}</tbody></table></div></div>
        <div class="card"><div class="card-h"><h2>Previsão por área</h2></div><div class="bars">${Object.entries(areas).sort((a, b) => b[1] - a[1]).map(([a, v]) => `<div class="bar-row"><span class="lbl" title="${esc(a)}">${esc(a)}</span><div class="bar"><span style="width:${v / maxA * 100}%"></span></div><span class="num">${brl(v)}</span></div>`).join('') || '<p class="hint">Sem previsão no período.</p>'}</div>
          <p class="hint" style="margin-top:16px">A previsão ajustada aplica a taxa de inadimplência dos últimos 12 meses sobre as parcelas a vencer. Os honorários de êxito entram no mês estimado, multiplicados pela probabilidade informada no contrato.</p></div>
      </div>`;
  },
  mount() { chartProg('ch-prog2', prognostico(ui.f.prog.h, 6)); }
};

/* ---------- Comissões ---------- */
VIEWS.comissoes = {
  title: 'Comissões',
  render() {
    const f = ui.f.com, todas = comissoes();
    const lista = todas.filter(x => (!f.pessoa || x.pessoaId === f.pessoa) && (f.status === 'todas' || (f.status === 'apagar' ? !x.pagoInfo : !!x.pagoInfo)) && (!f.mes || ym(x.p.pagoEm || x.p.venc) === f.mes));
    const porPessoa = db.pessoas.map(pe => { const xs = todas.filter(x => x.pessoaId === pe.id); return { pe, gerado: xs.reduce((s, x) => s + x.valor, 0), pagoV: xs.filter(x => x.pagoInfo).reduce((s, x) => s + x.valor, 0), apagar: xs.filter(x => !x.pagoInfo).reduce((s, x) => s + x.valor, 0), proj: comissaoProjetada(pe.id) }; }).filter(x => x.gerado || x.proj);
    const meses = [...new Set(todas.map(x => ym(x.p.pagoEm || x.p.venc)))].sort().reverse();
    return pageH('Comissões de captação', 'Valores devidos a sócios, advogados e parceiros sobre os honorários efetivamente recebidos', `<button class="btn" data-act="exp-com">${icon('download')} Exportar</button>`) +
      `<div class="card" style="margin-bottom:16px"><div class="card-h"><h2>Por responsável pela captação</h2></div>${porPessoa.length ? `<div class="table-wrap"><table class="tbl"><thead><tr><th>Nome</th><th class="right">Gerado</th><th class="right">Pago</th><th class="right">A pagar</th><th class="right">A gerar (carteira)</th><th></th></tr></thead><tbody>${porPessoa.map(x => `<tr><td><div class="cell-main">${esc(x.pe.nome)}</div><div class="cell-sub">${esc(TIPO_PESSOA[x.pe.tipo] || '')}</div></td><td class="right num">${brl(x.gerado)}</td><td class="right num t-success">${brl(x.pagoV)}</td><td class="right num"><b>${brl(x.apagar)}</b></td><td class="right num muted">${brl(x.proj)}</td><td class="acts"><button class="btn sm" data-act="demonstrativo" data-id="${x.pe.id}">${icon('printer', 'i-sm')} Demonstrativo</button></td></tr>`).join('')}</tbody></table></div>` : '<p class="hint">Nenhuma comissão gerada. Vincule captadores aos contratos e registre os recebimentos.</p>'}</div>
      <div class="card"><div class="toolbar">
        <select data-f="com.pessoa" style="width:auto">${optList(db.pessoas.map(p => [p.id, p.nome]), f.pessoa, 'Todos os captadores')}</select>
        <select data-f="com.status" style="width:auto">${optList([['apagar', 'A pagar'], ['pagas', 'Pagas'], ['todas', 'Todas']], f.status)}</select>
        <select data-f="com.mes" style="width:auto">${optList(meses.map(m => [m, 'Recebidos em ' + ymLabel(m)]), f.mes, 'Todos os meses')}</select>
        <span class="hint">${lista.length} lançamento(s) · <b>${brl(lista.reduce((s, x) => s + x.valor, 0))}</b></span>
        ${f.status !== 'pagas' ? `<button class="btn sm primary" data-act="com-pagar" ${lista.some(x => !x.pagoInfo) ? '' : 'disabled'}>${icon('check', 'i-sm')} Marcar listadas como pagas</button>` : ''}
      </div>
      ${lista.length ? `<div class="table-wrap"><table class="tbl"><thead><tr><th>Recebido em</th><th>Captador</th><th>Cliente</th><th>Parcela</th><th class="right">Base</th><th>Regra</th><th class="right">Comissão</th><th>Situação</th><th></th></tr></thead><tbody>${lista.map(x => `<tr><td class="num">${fdate(x.p.pagoEm)}</td><td>${esc(pessoa(x.pessoaId)?.nome || '?')}</td><td><a href="#/contrato/${x.c.id}" style="color:inherit">${esc(x.c.cliente.nome)}</a></td><td>${x.p.n}</td><td class="right num">${brl(x.base)}</td><td class="cell-sub">${x.regra.tipo === 'pct' ? pct(x.regra.valor) : 'valor fixo rateado'}</td><td class="right num"><b>${brl(x.valor)}</b></td><td>${x.pagoInfo ? `<span class="chip ok">Paga em ${fdate(x.pagoInfo.em)}</span>` : '<span class="chip warn">A pagar</span>'}</td><td class="acts"><button class="icon-btn" data-act="com-toggle" data-k="${esc(x.key)}" data-v="${x.valor}" title="${x.pagoInfo ? 'Desfazer pagamento' : 'Marcar como paga'}">${icon(x.pagoInfo ? 'undo' : 'check')}</button></td></tr>`).join('')}</tbody></table></div>` : emptyBox('Nenhum lançamento', 'Não há comissões para os filtros selecionados.')}</div>`;
  }
};

/* ---------- Verificação ---------- */
VIEWS.verificacao = {
  title: 'Verificação',
  render() {
    const nivel = ui.f.ver;
    const todos = db.contratos.filter(c => c.status === 'ativo' || c.status === 'suspenso').map(c => ({ c, v: verificar(c) }));
    const cont = k => todos.reduce((s, x) => s + x.v.filter(y => y.nivel === k).length, 0);
    const lista = todos.map(x => ({ ...x, v: x.v.filter(y => nivel === 'todos' || y.nivel === nivel) })).filter(x => x.v.length);
    return pageH('Verificação automática', 'Auditoria contínua dos contratos ativos: cadastro, faturamento, cronograma, encargos, reajustes e inadimplência') +
      `<div class="card"><div class="tabs">${[['erro', 'Críticos'], ['aviso', 'Atenção'], ['info', 'Informativos'], ['todos', 'Todos']].map(([k, l]) => `<button class="tab ${nivel === k ? 'active' : ''}" data-act="ver-aba" data-k="${k}">${l}<span class="count ${k === 'erro' && cont('erro') ? 'alert' : ''}">${k === 'todos' ? '' : cont(k) || ''}</span></button>`).join('')}</div>
      ${lista.length ? lista.map(({ c, v }) => `<div style="padding:12px 0;border-bottom:1px solid var(--border)"><div class="card-h" style="margin-bottom:8px"><div><a href="#/contrato/${c.id}" class="cell-main" style="color:inherit">${esc(c.cliente.nome)}</a> <span class="cell-sub">${esc(c.numero || '')} · ${esc(c.area || '')}</span></div><button class="btn sm" data-act="ct-edit" data-id="${c.id}">${icon('edit', 'i-sm')} Corrigir</button></div><div class="alert-list">${v.map(x => `<div class="alert-item"><span class="dot ${x.nivel}"></span><div>${esc(x.msg)}${x.dica ? `<div class="hint">${esc(x.dica)}</div>` : ''}</div></div>`).join('')}</div></div>`).join('') : emptyBox('Tudo em ordem', 'Nenhuma ocorrência nesta categoria.')}</div>`;
  }
};

/* ---------- Importar ---------- */
const CAMPOS_IMP = [
  ['numero', 'Nº do contrato', ['numero', 'numerodocontrato', 'numerocontrato', 'contrato', 'codigo', 'id']],
  ['cliente', 'Cliente *', ['cliente', 'nome', 'nomecliente', 'contratante', 'razaosocial', 'nomedocliente']],
  ['doc', 'CPF/CNPJ', ['cpfcnpj', 'cpf', 'cnpj', 'documento', 'doc']],
  ['email', 'E-mail', ['email', 'emailcliente', 'emaildocliente']],
  ['emailCc', 'E-mail em cópia', ['emailcopia', 'emailcc', 'cc', 'emailfinanceiro']],
  ['telefone', 'Telefone', ['telefone', 'celular', 'whatsapp', 'fone']],
  ['contato', 'Contato', ['contato', 'aoscuidadosde', 'responsavelcliente']],
  ['area', 'Área de atuação', ['area', 'areadeatuacao', 'areaatuacao', 'pratica']],
  ['escopo', 'Escopo', ['escopo', 'objeto', 'descricao', 'servico', 'servicos']],
  ['tipo', 'Tipo de honorário', ['tipo', 'tipohonorario', 'tipodehonorario', 'modalidade']],
  ['valorTotal', 'Valor total', ['valortotal', 'valor', 'honorarios', 'valorhonorarios', 'valorcontrato', 'valordocontrato']],
  ['entrada', 'Entrada', ['entrada', 'valorentrada', 'sinal']],
  ['dataEntrada', 'Data da entrada', ['dataentrada', 'vencimentoentrada', 'datadaentrada']],
  ['nParcelas', 'Nº de parcelas', ['parcelas', 'nparcelas', 'numeroparcelas', 'numerodeparcelas', 'qtdparcelas', 'quantidadeparcelas']],
  ['valorParcela', 'Valor da parcela', ['valorparcela', 'valordaparcela', 'valormensal', 'mensalidade']],
  ['primeiroVenc', '1º vencimento', ['primeirovencimento', '1vencimento', 'vencimento', 'datavencimento', 'iniciocobranca']],
  ['parcelasPagas', 'Parcelas já pagas', ['parcelaspagas', 'pagas', 'qtdpagas', 'quantidadepagas']],
  ['captador', 'Captador', ['captador', 'captacao', 'responsavelcaptacao', 'responsavelpelacaptacao', 'originador', 'indicacao', 'parceiro']],
  ['comissaoPct', 'Comissão de captação (%)', ['comissao', 'comissaopct', 'percentualcaptacao', 'comissaocaptacao', 'comissaodecaptacao']],
  ['responsavel', 'Responsável técnico', ['responsavel', 'advogadoresponsavel', 'responsaveltecnico', 'socioresponsavel']],
  ['entidade', 'Entidade de faturamento', ['entidade', 'faturamento', 'cnpjfaturamento', 'escritorio', 'dadosfaturamento']],
  ['assinatura', 'Data de assinatura', ['assinatura', 'dataassinatura', 'datadeassinatura', 'data']],
  ['status', 'Status', ['status', 'situacao']],
  ['exitoPct', 'Êxito (%)', ['exito', 'exitopct', 'percentualexito', 'exitopercentual']],
  ['obs', 'Observações', ['obs', 'observacoes', 'observacao', 'notas']]
];
VIEWS.importar = {
  title: 'Importar',
  render() {
    return pageH('Importar contratos', 'Traga a carteira existente e cadastre novos contratos a partir dos próprios arquivos') +
      (ui.fila.length ? `<div class="card" style="margin-bottom:16px"><div class="card-h"><div><h2>Contratos aguardando revisão</h2><p class="hint">Confira os dados extraídos e salve cada contrato.</p></div></div><div class="table-wrap"><table class="tbl"><tbody>${ui.fila.map((x, i) => `<tr><td><div class="cell-main">${esc(x.contrato.cliente?.nome || x.file?.name)}</div><div class="cell-sub">${esc(x.file?.name || '')} · ${x.origem}${x.erro ? ' · <span class="t-danger">' + esc(x.erro) + '</span>' : ''}</div></td><td class="right num">${brl(x.contrato.valorTotal)}</td><td class="acts"><button class="btn sm primary" data-act="fila-rev" data-i="${i}">Revisar e salvar</button><button class="icon-btn" data-act="fila-del" data-i="${i}" title="Descartar">${icon('x')}</button></td></tr>`).join('')}</tbody></table></div></div>` : '') +
      `<div class="grid g3">
        <div class="card"><div class="card-h"><h2>1. Planilha da carteira</h2></div>
          <p class="hint">Excel (.xlsx) ou CSV com um contrato por linha. As colunas são reconhecidas automaticamente e o cronograma de parcelas é gerado a partir do número de parcelas, valor e primeiro vencimento. Parcelas já quitadas podem ser informadas para baixa automática.</p>
          <div class="drop" data-drop="planilha" style="margin-top:14px">${icon('upload')}<p style="margin-top:6px">Arraste a planilha aqui</p><button class="btn sm" data-act="pick" data-k="planilha" style="margin-top:8px">Selecionar arquivo</button></div>
          <p style="margin-top:12px"><a href="#" data-act="modelo-csv">${icon('download', 'i-sm')} Baixar planilha modelo</a></p></div>
        <div class="card"><div class="card-h"><h2>2. Arquivos dos contratos</h2></div>
          <p class="hint">PDF, Word (.docx), imagem (JPG ou PNG) ou texto. Cada arquivo tem os dados extraídos automaticamente (cliente, CPF/CNPJ, e-mail, valores, parcelas, vencimentos, encargos, área e escopo) e segue para revisão, ficando anexado ao contrato. Contratos digitalizados são lidos por OCR no próprio navegador, sem envio do documento a terceiros.</p>
          <div class="drop" data-drop="contratos" style="margin-top:14px">${icon('file')}<p style="margin-top:6px">Arraste um ou vários contratos</p><button class="btn sm" data-act="pick" data-k="contratos" style="margin-top:8px">Selecionar arquivos</button></div>
          <p class="hint" id="imp-status" style="margin-top:10px"></p></div>
        <div class="card"><div class="card-h"><h2>3. Backup</h2></div>
          <p class="hint">Cópia integral da base (contratos, parcelas, cadastros, histórico e, opcionalmente, arquivos anexos). Use para guardar uma cópia de segurança ou transferir a base para outro computador.</p>
          <div class="actions" style="margin-top:14px"><button class="btn" data-act="backup">${icon('download')} Gerar backup</button><button class="btn" data-act="pick" data-k="backup">${icon('upload')} Restaurar backup</button></div></div>
      </div>`;
  },
  mount() {
    $$('[data-drop]').forEach(z => {
      z.addEventListener('dragover', e => { e.preventDefault(); z.classList.add('over'); });
      z.addEventListener('dragleave', () => z.classList.remove('over'));
      z.addEventListener('drop', e => { e.preventDefault(); z.classList.remove('over'); handleFiles(z.dataset.drop, [...e.dataTransfer.files]); });
    });
  }
};
function pick(kind) {
  const inp = $('#file-any');
  inp.accept = { planilha: '.xlsx,.xls,.csv', contratos: '.pdf,.docx,.txt,.jpg,.jpeg,.png,.webp', backup: '.json' }[kind];
  inp.multiple = kind === 'contratos'; inp.value = '';
  inp.onchange = () => handleFiles(kind, [...inp.files]);
  inp.click();
}
async function handleFiles(kind, files) {
  if (!files.length) return;
  try {
    if (kind === 'planilha') await importarPlanilha(files[0]);
    else if (kind === 'backup') await restaurarBackup(files[0]);
    else await importarArquivos(files);
  } catch (e) { console.error(e); toast('Erro: ' + e.message, 'err'); }
}
async function lerTexto(file) {
  const buf = await file.arrayBuffer();
  let t = new TextDecoder('utf-8').decode(buf);
  if (t.includes('�')) t = new TextDecoder('windows-1252').decode(buf);
  return t;
}
function parseCSV(text) {
  const first = text.split(/\r?\n/)[0] || ''; const sep = (first.match(/;/g) || []).length >= (first.match(/,/g) || []).length ? ';' : ',';
  const rows = []; let row = [], cur = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) { if (ch === '"') { if (text[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += ch; }
    else if (ch === '"') q = true;
    else if (ch === sep) { row.push(cur); cur = ''; }
    else if (ch === '\n' || ch === '\r') { if (ch === '\r' && text[i + 1] === '\n') i++; row.push(cur); rows.push(row); row = []; cur = ''; }
    else cur += ch;
  }
  if (cur || row.length) { row.push(cur); rows.push(row); }
  const head = (rows.shift() || []).map(h => h.replace(/^﻿/, '').trim());
  return { head, rows: rows.filter(r => r.some(c => String(c).trim())).map(r => Object.fromEntries(head.map((h, i) => [h, r[i] ?? '']))) };
}
async function importarPlanilha(file) {
  let head, rows;
  if (/\.csv$/i.test(file.name)) ({ head, rows } = parseCSV(await lerTexto(file)));
  else {
    await loadScript('https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js');
    const wb = XLSX.read(await file.arrayBuffer(), { type: 'array', cellDates: true });
    const ws = wb.Sheets[wb.SheetNames[0]];
    rows = XLSX.utils.sheet_to_json(ws, { defval: '', raw: true });
    head = Object.keys(rows[0] || {});
  }
  if (!rows.length) return toast('A planilha está vazia.', 'err');
  const map = {};
  CAMPOS_IMP.forEach(([k, , al]) => { const h = head.find(h => al.includes(norm(h))); if (h) map[k] = h; });
  openModal({
    title: `Importar planilha · ${rows.length} linha(s)`, wide: true,
    body: `<p class="hint" style="margin-bottom:14px">Confira a correspondência entre os campos do sistema e as colunas da sua planilha. Campos sem coluna ficam em branco e poderão ser completados depois; a tela de Verificação indicará o que falta.</p>
      <div class="form-grid">${CAMPOS_IMP.map(([k, l]) => `<div class="field"><label>${l}</label><select data-map="${k}">${optList(head.map(h => [h, h]), map[k], 'Não importar')}</select></div>`).join('')}</div>
      <div class="field" style="margin-top:14px"><label>Entidade de faturamento padrão (quando a planilha não indicar)</label><select id="imp-ent">${optList(db.entidades.map(e => [e.id, e.razao]), db.entidades[0]?.id, 'Nenhuma')}</select></div>
      <h3 style="font-size:14px;margin:18px 0 8px">Pré-visualização</h3><div id="imp-prev"></div>`,
    foot: `<button class="btn ghost" data-act="modal-close">Cancelar</button><button class="btn primary" id="imp-go">${icon('upload')} Importar ${rows.length} contrato(s)</button>`,
    onMount: () => {
      const getMap = () => Object.fromEntries($$('[data-map]').map(s => [s.dataset.map, s.value]).filter(x => x[1]));
      const prev = () => { const m = getMap(); const cts = rows.slice(0, 5).map(r => linhaParaContrato(r, m, '')); $('#imp-prev').innerHTML = `<div class="table-wrap"><table class="tbl"><thead><tr><th>Cliente</th><th>Área</th><th>Tipo</th><th class="right">Valor</th><th>Parcelas</th><th>Captador</th></tr></thead><tbody>${cts.map(x => `<tr><td>${esc(x.c.cliente.nome || '(sem nome)')}</td><td>${esc(x.c.area)}</td><td>${TIPOS[x.c.tipo]}</td><td class="right num">${brl(x.c.valorTotal)}</td><td>${x.ps.length} · ${x.ps.filter(p => p.status === 'paga').length} paga(s)</td><td>${esc(x.captNome || '')}</td></tr>`).join('')}</tbody></table></div>`; };
      $$('[data-map]').forEach(s => s.onchange = prev); prev();
      $('#imp-go').onclick = () => {
        const m = getMap(); if (!m.cliente) return toast('Indique a coluna do nome do cliente.', 'err');
        const ent = $('#imp-ent').value; let n = 0;
        rows.forEach(r => { const x = linhaParaContrato(r, m, ent); if (!x.c.cliente.nome) return; aplicarImport(x); n++; });
        log('importacao', `${n} contrato(s) importados de ${file.name}`); save(); closeModal();
        toast(`${n} contrato(s) importados.`, 'ok'); location.hash = '#/contratos';
      };
    }
  });
}
function pessoaPorNome(nome, tipo, criar) {
  if (!nome) return null; const n = norm(nome);
  let p = db.pessoas.find(x => norm(x.nome) === n);
  if (!p && criar) { p = { id: uid(), nome: String(nome).trim(), tipo, email: '' }; db.pessoas.push(p); }
  return p;
}
function tipoDeTexto(t) { const s = norm(t); if (!s) return 'fixo'; if (s.includes('mens') || s.includes('partido') || s.includes('recorr')) return 'mensal'; if (s.includes('exito') && (s.includes('fix') || s.includes('hibr') || s.includes('pro'))) return 'hibrido'; if (s.includes('exito')) return 'exito'; if (s.includes('avulso') || s.includes('ato')) return 'avulso'; return 'fixo'; }
function areaDeTexto(t) { if (!t) return ''; const n = norm(t); const a = db.areas.find(x => norm(x) === n) || db.areas.find(x => n.includes(norm(x)) || norm(x).includes(n)); if (a) return a; db.areas.push(String(t).trim()); return String(t).trim(); }
function statusDeTexto(t) { const s = norm(t); if (s.startsWith('susp')) return 'suspenso'; if (s.startsWith('enc') || s.startsWith('fin') || s.startsWith('conc')) return 'encerrado'; if (s.startsWith('resc') || s.startsWith('canc')) return 'rescindido'; return 'ativo'; }
function gerarCronograma({ total = 0, entrada = 0, dataEntrada = '', n = 0, valorParcela = 0, primeiro = '' }) {
  const ps = []; total = round2(total); entrada = round2(entrada); n = Math.max(0, Math.round(n));
  if (entrada > 0) ps.push({ desc: 'Entrada', venc: dataEntrada || primeiro || today(), valor: entrada });
  if (n > 0) {
    const vp = valorParcela > 0 ? round2(valorParcela) : round2((total - entrada) / n);
    const ini = primeiro || addMonthsISO(today(), 1); const dia = dt(ini).getDate();
    for (let i = 0; i < n; i++) ps.push({ desc: 'Parcela', venc: addMonthsISO(ini, i, dia), valor: vp });
    if (!(valorParcela > 0) && total > 0) ps[ps.length - 1].valor = round2(total - entrada - vp * (n - 1));
  } else if (total - entrada > 0) ps.push({ desc: 'Parcela única', venc: primeiro || today(), valor: round2(total - entrada) });
  return ps;
}
function linhaParaContrato(r, m, entPadrao) {
  const g = k => m[k] ? r[m[k]] : '';
  const c = novoContrato();
  c.numero = String(g('numero') || '').trim();
  c.cliente = { nome: String(g('cliente') || '').trim(), doc: String(g('doc') || '').trim(), email: String(g('email') || '').trim(), emailCc: String(g('emailCc') || '').trim(), telefone: String(g('telefone') || '').trim(), contato: String(g('contato') || '').trim(), endereco: '' };
  c.area = String(g('area') || '').trim(); c.escopo = String(g('escopo') || '').trim(); c.tipo = tipoDeTexto(g('tipo'));
  c.valorTotal = round2(num(g('valorTotal'))); c.dataAssinatura = parseDate(g('assinatura')); c.inicio = c.dataAssinatura;
  c.status = statusDeTexto(g('status')); c.obs = String(g('obs') || '');
  if (num(g('exitoPct')) > 0) { c.exito = { pct: num(g('exitoPct')), base: 0, prob: 50, data: '', desc: '' }; if (c.tipo === 'fixo') c.tipo = 'hibrido'; }
  const entTxt = String(g('entidade') || '').trim();
  const ent = entTxt ? db.entidades.find(e => onlyDigits(e.cnpj) && onlyDigits(e.cnpj) === onlyDigits(entTxt) || norm(e.razao) === norm(entTxt) || norm(e.fantasia) === norm(entTxt)) : null;
  c.entidadeId = ent?.id || entPadrao || '';
  const n = num(g('nParcelas')), vp = num(g('valorParcela'));
  if (!c.valorTotal && n && vp) c.valorTotal = round2(n * vp + num(g('entrada')));
  const ps = c.tipo === 'exito' && !n ? [] : gerarCronograma({ total: c.valorTotal, entrada: num(g('entrada')), dataEntrada: parseDate(g('dataEntrada')), n, valorParcela: vp, primeiro: parseDate(g('primeiroVenc')) || (c.dataAssinatura ? addMonthsISO(c.dataAssinatura, 1) : '') });
  const k = Math.round(num(g('parcelasPagas')));
  ps.forEach((p, i) => { p.n = i + 1; p.status = i < k ? 'paga' : 'aberta'; if (i < k) p.pagoEm = p.venc; });
  return { c, ps, captNome: String(g('captador') || '').trim(), comPct: num(g('comissaoPct')), respNome: String(g('responsavel') || '').trim() };
}
function aplicarImport(x) {
  const c = x.c; c.area = areaDeTexto(c.area);
  if (x.captNome) { const pe = pessoaPorNome(x.captNome, 'parceiro', true); c.captacao = [{ pessoaId: pe.id, tipo: 'pct', valor: x.comPct || 0 }]; }
  if (x.respNome) c.responsavelId = pessoaPorNome(x.respNome, 'advogado', true).id;
  if (!c.numero) c.numero = proximoNumero();
  db.contratos.push(c);
  x.ps.forEach(p => db.parcelas.push({ id: uid(), contratoId: c.id, cobrancas: [], ...p }));
}
let ocrWorker = null;
async function ocr(imagens, status) {
  await loadScript('https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js');
  if (!ocrWorker) { status?.('preparando o OCR (primeira vez pode levar alguns segundos)…'); ocrWorker = await Tesseract.createWorker('por'); }
  let t = '';
  for (const [i, img] of imagens.entries()) { status?.(`reconhecendo texto, página ${i + 1} de ${imagens.length}…`); t += (await ocrWorker.recognize(img)).data.text + '\n'; }
  return t;
}
async function extrairTexto(file, status) {
  if (/\.pdf$/i.test(file.name) || file.type === 'application/pdf') {
    await loadScript('https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js');
    pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
    const pdf = await pdfjsLib.getDocument({ data: await file.arrayBuffer() }).promise; let t = '';
    for (let i = 1; i <= pdf.numPages; i++) { const pg = await pdf.getPage(i); const tc = await pg.getTextContent(); t += tc.items.map(it => it.str + (it.hasEOL ? '\n' : ' ')).join('') + '\n'; }
    // PDF digitalizado (sem camada de texto): renderiza as páginas e aplica OCR.
    if (t.replace(/\s/g, '').length < 60 * pdf.numPages) {
      const imgs = [];
      for (let i = 1; i <= Math.min(pdf.numPages, 25); i++) {
        status?.(`preparando página ${i} para OCR…`);
        const pg = await pdf.getPage(i), vp = pg.getViewport({ scale: 2.2 });
        const cv = document.createElement('canvas'); cv.width = vp.width; cv.height = vp.height;
        await pg.render({ canvasContext: cv.getContext('2d'), viewport: vp }).promise; imgs.push(cv);
      }
      const o = await ocr(imgs, status); if (o.replace(/\s/g, '').length > t.replace(/\s/g, '').length) { t = o; file._ocr = true; }
    }
    return t;
  }
  if (/\.(jpe?g|png|webp|bmp|tiff?)$/i.test(file.name) || /^image\//.test(file.type)) { file._ocr = true; return ocr([file], status); }
  if (/\.docx$/i.test(file.name)) {
    await loadScript('https://cdnjs.cloudflare.com/ajax/libs/mammoth/1.6.0/mammoth.browser.min.js');
    return (await mammoth.extractRawText({ arrayBuffer: await file.arrayBuffer() })).value;
  }
  return lerTexto(file);
}
const NUM_EXT = { uma: 1, um: 1, duas: 2, dois: 2, tres: 3, quatro: 4, cinco: 5, seis: 6, sete: 7, oito: 8, nove: 9, dez: 10, onze: 11, doze: 12, treze: 13, quatorze: 14, catorze: 14, quinze: 15, dezesseis: 16, dezoito: 18, vinte: 20, vinteequatro: 24, trinta: 30, trintaeseis: 36 };
function heuristica(texto) {
  const t = texto.replace(/ /g, ' '), flat = t.replace(/\s+/g, ' ').replace(/([\w.+-])\s*@\s*([\w-])/g, '$1@$2');
  const r = { cliente: {}, parcelas: {}, entrada: {}, exito: {} };
  r.cliente.email = (flat.match(/[\w.+-]+@[\w-]+\.[\w.-]+/g) || []).find(e => !db.entidades.some(en => norm(en.email) === norm(e))) || '';
  if (!r.cliente.email) { // OCR costuma ler "@" como "(D", "©" ou "(a)"
    const m = flat.match(/e-?mail[:\s]*([\w.+-]+)\s*(?:@|\(D|\(@|\(a\)|©|®)\s*([\w-]+\.[a-z]{2,}(?:\.[a-z]{2})?)/i);
    if (m) r.cliente.email = `${m[1]}@${m[2]}`.toLowerCase();
  }
  const docs = (flat.match(/\b\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}\b|\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/g) || []).filter(d => !db.entidades.some(e => onlyDigits(e.cnpj) === onlyDigits(d)));
  r.cliente.doc = docs.find(docOk) || docs[0] || '';
  const mNome = flat.match(/CONTRATANTE[S]?\s*[:,]?\s*(?:a\s+empresa\s+|o\s+senhor\s+|a\s+senhora\s+|sr\.?\s+|sra\.?\s+)?([A-ZÀ-Ý][A-Za-zÀ-ÿ0-9&.\s'-]{3,90}?)(?:,|\s+-\s+|\s+pessoa|\s+inscrit|\s+brasileir|\s+com sede|\s+portador)/);
  if (mNome) r.cliente.nome = mNome[1].trim();
  const tel = flat.match(/\(?\d{2}\)?\s?9?\d{4}-?\d{4}/); if (tel) r.cliente.telefone = tel[0];
  const vals = [...flat.matchAll(/R\$\s?([\d.]+,\d{2})/g)].map(m => ({ v: num(m[1]), i: m.index }));
  const iHon = flat.search(/honor[aá]rios/i);
  const pos = vals.filter(v => iHon < 0 || v.i > iHon);
  r.valorTotal = pos.length ? Math.max(...pos.slice(0, 6).map(v => v.v)) : 0;
  const mParc = flat.match(/(\d{1,2}|[a-zç]+(?:\s+e\s+[a-zç]+)?)\s*(?:\([^)]{1,30}\)\s*)?parcelas\s*(?:mensais|iguais|sucessivas|consecutivas|,|\s|e)*(?:no valor\s*)?(?:de\s*)?R\$\s?([\d.]+,\d{2})/i);
  if (mParc) { r.parcelas.quantidade = /^\d+$/.test(mParc[1]) ? +mParc[1] : NUM_EXT[norm(mParc[1])] || 0; r.parcelas.valor = num(mParc[2]); }
  const mEnt = flat.match(/(?:entrada|sinal|à vista)[^R]{0,40}R\$\s?([\d.]+,\d{2})/i); if (mEnt) r.entrada.valor = num(mEnt[1]);
  const mMens = flat.match(/(?:mensal(?:mente)?|por mês|mensais)[^R]{0,60}R\$\s?([\d.]+,\d{2})|R\$\s?([\d.]+,\d{2})[^.]{0,60}(?:mensais|por mês|mensalmente)/i);
  const mDia = flat.match(/(?:todo|até o|no)\s+dia\s+(\d{1,2})\s*(?:\([^)]*\)\s*)?(?:de cada m[eê]s|do m[eê]s)/i); if (mDia) r.parcelas.diaVencimento = +mDia[1];
  const mEx = flat.match(/(\d{1,2}(?:,\d+)?)\s*%\s*(?:\([^)]*\)\s*)?(?:a título de |de |sobre o |do )?(?:honor[aá]rios de )?[eê]xito|[eê]xito[^%]{0,80}?(\d{1,2}(?:,\d+)?)\s*%/i);
  if (mEx) r.exito.pct = num(mEx[1] || mEx[2]);
  const mMulta = flat.match(/multa[^%]{0,40}?(\d{1,2}(?:,\d+)?)\s*%/i); if (mMulta) r.multaPct = num(mMulta[1]);
  const mJuros = flat.match(/juros[^%]{0,40}?(\d(?:,\d+)?)\s*%\s*(?:\([^)]*\)\s*)?(?:ao|a\.?)\s*m/i); if (mJuros) r.jurosPct = num(mJuros[1]);
  if (/IPCA/.test(flat)) r.reajuste = 'IPCA'; else if (/IGP-?M/i.test(flat)) r.reajuste = 'IGP-M'; else if (/INPC/.test(flat)) r.reajuste = 'INPC';
  r.tipo = mMens && !mParc ? 'mensal' : (r.exito.pct && (r.valorTotal || mParc) ? 'hibrido' : r.exito.pct ? 'exito' : 'fixo');
  if (r.tipo === 'mensal') { r.parcelas.valor = num(mMens[1] || mMens[2]); r.parcelas.quantidade = 12; }
  const mObj = t.match(/(?:DO\s+OBJETO|CL[ÁA]USULA\s+PRIMEIRA)[^\n]*\n?([\s\S]{20,700}?)(?:\n\s*\n|CL[ÁA]USULA\s+SEGUNDA|DOS?\s+HONOR)/i);
  r.escopo = mObj ? mObj[1].replace(/\s+/g, ' ').trim().slice(0, 600) : '';
  const datas = [...flat.matchAll(/(\d{1,2})\s+de\s+(janeiro|fevereiro|mar[cç]o|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro)\s+de\s+(\d{4})/gi)];
  if (datas.length) { const d = datas[datas.length - 1]; const mi = MESES_EXT.findIndex(x => norm(x) === norm(d[2])); r.dataAssinatura = `${d[3]}-${pad(mi + 1)}-${pad(d[1])}`; }
  const area = { 'Penal Empresarial': /crimes?\s+(?:contra a ordem tribut|financeir|societ|empresar)|lavagem|colarinho|compliance criminal/i, 'Penal': /criminal|penal|inqu[eé]rito|den[uú]ncia|habeas|a[cç][aã]o penal/i, 'Tributário': /tribut|fiscal|ICMS|execu[cç][aã]o fiscal|PIS|COFINS/i, 'Trabalhista': /trabalhist|reclama[cç][aã]o trabalhista|CLT/i, 'Família e Sucessões': /div[oó]rcio|invent[aá]rio|guarda|alimentos|sucess/i, 'Empresarial': /societ[aá]ri|recupera[cç][aã]o judicial|fal[eê]ncia|M&A/i, 'Cível': /c[ií]vel|indeniza|cobran[cç]a|despejo/i };
  r.area = Object.keys(area).find(k => area[k].test(flat) && db.areas.includes(k)) || Object.keys(area).find(k => area[k].test(flat)) || '';
  return r;
}
function extracaoParaRascunho(x, file, origem) {
  const c = novoContrato();
  c.cliente = { nome: x.cliente?.nome || '', doc: x.cliente?.doc || '', email: x.cliente?.email || '', telefone: x.cliente?.telefone || '', endereco: x.cliente?.endereco || '', contato: x.cliente?.contato || '', emailCc: '' };
  c.numero = x.numero || ''; c.area = x.area ? areaDeTexto(x.area) : ''; c.escopo = x.escopo || ''; c.tipo = TIPOS[x.tipo] ? x.tipo : 'fixo';
  c.dataAssinatura = parseDate(x.dataAssinatura); c.inicio = c.dataAssinatura; c.fim = parseDate(x.vigenciaFim);
  if (x.multaPct) c.multaPct = x.multaPct; if (x.jurosPct) c.jurosPct = x.jurosPct;
  if (x.reajuste && x.reajuste !== 'Nenhum') c.reajuste = x.reajuste;
  if (+x.exito?.pct) c.exito = { pct: +x.exito.pct, base: 0, prob: 50, data: '', desc: x.exito.descricao || '' };
  c.entidadeId = db.entidades[0]?.id || '';
  if (x.alertas?.length) c.analiseIA = { em: new Date().toISOString(), alertas: x.alertas.filter(Boolean).slice(0, 8) };
  if (x.captador) { const pe = pessoaPorNome(x.captador, 'parceiro', false); if (pe) c.captacao = [{ pessoaId: pe.id, tipo: 'pct', valor: 0 }]; else c.captacao = [{ pessoaId: '__new', novoNome: x.captador, tipo: 'pct', valor: 0 }]; }
  const pq = x.parcelas || {}; const n = +pq.quantidade || 0, vp = +pq.valor || 0;
  c.valorTotal = round2(+x.valorTotal || (n * vp + (+x.entrada?.valor || 0)));
  let primeiro = parseDate(pq.primeiroVencimento);
  if (!primeiro && pq.diaVencimento) { const base = c.dataAssinatura || today(); primeiro = addMonthsISO(base, 1, +pq.diaVencimento); }
  const ps = c.tipo === 'exito' && !n ? [] : gerarCronograma({ total: c.valorTotal, entrada: +x.entrada?.valor || 0, dataEntrada: parseDate(x.entrada?.data) || c.dataAssinatura, n, valorParcela: vp, primeiro });
  ps.forEach((p, i) => { p.n = i + 1; p.status = 'aberta'; });
  return { contrato: c, parcelas: ps, file, origem };
}
async function importarArquivos(files) {
  const st = $('#imp-status');
  for (const [i, f] of files.entries()) {
    const status = msg => { const el = $('#imp-status'); if (el) el.textContent = `Arquivo ${i + 1} de ${files.length} · ${f.name} · ${msg}`; };
    status('lendo…');
    let texto = '', item, erro = '';
    try { texto = await extrairTexto(f, status); } catch (e) { console.warn(e); erro = 'Não foi possível ler o arquivo: ' + e.message; }
    if (!erro && texto.replace(/\s/g, '').length < 40) erro = 'Nenhum texto legível foi reconhecido; preencha os dados manualmente a partir do arquivo anexado.';
    item = extracaoParaRascunho(texto ? heuristica(texto) : {}, f, erro ? 'revisão manual' : (f._ocr ? 'reconhecidos por OCR' : 'extraídos automaticamente'));
    if (erro) item.erro = erro;
    else if (f._ocr) item.erro = 'Contrato digitalizado lido por OCR: confira com atenção valores, datas e documentos.';
    if (!item.contrato.cliente.nome) item.contrato.cliente.nome = f.name.replace(/\.[^.]+$/, '');
    ui.fila.push(item);
  }
  if (st) st.textContent = '';
  toast(`${files.length} arquivo(s) prontos para revisão.`, 'ok'); rerender();
}
/* ---------- Backup ---------- */
async function gerarBackup() {
  const comArq = await confirmBox('Incluir os arquivos dos contratos anexados no backup? O arquivo ficará maior.', 'Incluir arquivos');
  const files = {};
  if (comArq) for (const id of await idbKeys('files')) { const f = await getFile(id); if (f) files[id] = { name: f.name, type: f.type, b64: await new Promise(res => { const fr = new FileReader(); fr.onload = () => res(fr.result.split(',')[1]); fr.readAsDataURL(f); }) }; }
  db.settings.ultimoBackup = new Date().toISOString(); await persist();
  const copia = structuredClone(db); copia.settings.asaas.token = '';
  download(`backup-honorarios-${today()}.json`, JSON.stringify({ app: 'honorarios-contratos', versao: 1, geradoEm: new Date().toISOString(), db: copia, files }), 'application/json');
  toast('Backup gerado. Guarde-o em local seguro, pois contém dados de clientes.', 'ok'); rerender();
}
async function restaurarBackup(file) {
  const j = JSON.parse(await lerTexto(file));
  if (j.app !== 'honorarios-contratos' || !j.db) throw new Error('arquivo de backup não reconhecido');
  if (!await confirmBox(`Restaurar o backup de ${fdatetime(j.geradoEm)}? A base atual deste navegador (${db.contratos.length} contratos) será substituída.`, 'Substituir base', true)) return;
  const tokenAtual = db.settings.asaas?.token; db = migrate(j.db); if (!db.settings.asaas.token) db.settings.asaas.token = tokenAtual || '';
  for (const [id, f] of Object.entries(j.files || {})) { const bin = Uint8Array.from(atob(f.b64), ch => ch.charCodeAt(0)); await saveFile(id, new File([bin], f.name, { type: f.type })); }
  await persist(); toast('Backup restaurado.', 'ok'); location.hash = '#/painel'; rerender();
}

/* ---------- Cadastros ---------- */
VIEWS.cadastros = {
  title: 'Cadastros',
  render() {
    const aba = ui.f.cad;
    let body = '';
    if (aba === 'entidades') body = `<div class="card-h"><div><h2>Dados do escritório para faturamento</h2><p class="hint">Sociedades, filiais ou CNPJs que emitem cobranças. Os dados bancários e a chave PIX entram automaticamente nos e-mails.</p></div><button class="btn primary sm" data-act="ent-edit">${icon('plus', 'i-sm')} Nova entidade</button></div>` +
      (db.entidades.length ? `<div class="grid g2">${db.entidades.map(e => `<div class="card" style="box-shadow:none"><div class="card-h"><h3>${esc(e.fantasia || e.razao)}</h3><div><button class="icon-btn" data-act="ent-edit" data-id="${e.id}" title="Editar">${icon('edit')}</button><button class="icon-btn" data-act="ent-del" data-id="${e.id}" title="Excluir">${icon('trash')}</button></div></div><dl class="dl"><dt>Razão social</dt><dd>${esc(e.razao)}</dd><dt>CNPJ</dt><dd>${esc(fmtDoc(e.cnpj)) || '—'} ${e.cnpj && !cnpjOk(e.cnpj) ? '<span class="chip danger">inválido</span>' : ''}</dd><dt>Banco</dt><dd>${esc([e.banco, e.agencia && 'ag. ' + e.agencia, e.conta && 'c/c ' + e.conta].filter(Boolean).join(' · ')) || '—'}</dd><dt>PIX</dt><dd>${esc(e.pixChave || '—')}</dd><dt>Contratos</dt><dd>${db.contratos.filter(c => c.entidadeId === e.id).length}</dd></dl></div>`).join('')}</div>` : emptyBox('Nenhuma entidade cadastrada', 'Cadastre os dados de faturamento do escritório para incluí-los nas cobranças.'));
    if (aba === 'pessoas') body = `<div class="card-h"><div><h2>Sócios, advogados e parceiros</h2><p class="hint">Responsáveis técnicos e responsáveis pela captação, base das comissões.</p></div><button class="btn primary sm" data-act="pes-edit">${icon('plus', 'i-sm')} Nova pessoa</button></div>` +
      (db.pessoas.length ? `<div class="table-wrap"><table class="tbl"><thead><tr><th>Nome</th><th>Vínculo</th><th>E-mail</th><th>Comissão padrão</th><th class="right">Contratos captados</th><th></th></tr></thead><tbody>${db.pessoas.map(p => `<tr><td class="cell-main">${esc(p.nome)}</td><td>${esc(TIPO_PESSOA[p.tipo] || '')}</td><td>${esc(p.email || '—')}</td><td>${p.comissaoPadrao ? pct(p.comissaoPadrao) : '—'}</td><td class="right">${db.contratos.filter(c => (c.captacao || []).some(x => x.pessoaId === p.id)).length}</td><td class="acts"><button class="icon-btn" data-act="pes-edit" data-id="${p.id}">${icon('edit')}</button><button class="icon-btn" data-act="pes-del" data-id="${p.id}">${icon('trash')}</button></td></tr>`).join('')}</tbody></table></div>` : emptyBox('Nenhuma pessoa cadastrada', 'Cadastre sócios, advogados e parceiros.'));
    if (aba === 'areas') body = `<div class="card-h"><div><h2>Áreas de atuação</h2><p class="hint">Usadas na classificação dos contratos e no prognóstico por área.</p></div></div>
      <div class="toolbar"><input type="text" id="nova-area" placeholder="Nova área de atuação" style="max-width:320px"><button class="btn sm primary" data-act="area-add">${icon('plus', 'i-sm')} Adicionar</button></div>
      <div class="actions">${db.areas.map((a, i) => `<span class="chip" style="font-size:13px;padding:5px 6px 5px 12px">${esc(a)} <button class="icon-btn" style="width:22px;height:22px" data-act="area-del" data-i="${i}" aria-label="Remover">${icon('x', 'i-sm')}</button></span>`).join('')}</div>`;
    return pageH('Cadastros') + `<div class="tabs">${[['entidades', 'Faturamento'], ['pessoas', 'Sócios, advogados e parceiros'], ['areas', 'Áreas de atuação']].map(([k, l]) => `<button class="tab ${aba === k ? 'active' : ''}" data-act="cad-aba" data-k="${k}">${l}</button>`).join('')}</div><div class="card">${body}</div>`;
  }
};
function formEntidade(id) {
  const e = entidade(id) || { pixTipo: 'cnpj' };
  const f = (n, l, cls = '', type = 'text') => `<div class="field ${cls}"><label>${l}</label><input type="${type}" name="${n}" value="${esc(e[n] || '')}"></div>`;
  openModal({
    title: id ? 'Editar entidade de faturamento' : 'Nova entidade de faturamento', wide: true,
    body: `<form id="ent-form" class="form-grid">${f('razao', 'Razão social *', 'span2')}${f('fantasia', 'Nome de exibição')}${f('cnpj', 'CNPJ')}${f('inscricao', 'Inscrição municipal')}${f('email', 'E-mail financeiro', '', 'email')}${f('telefone', 'Telefone')}${f('endereco', 'Endereço', 'span2')}${f('cidade', 'Cidade (usada no PIX)')}
      ${f('banco', 'Banco')}${f('agencia', 'Agência')}${f('conta', 'Conta')}
      <div class="field"><label>Tipo da chave PIX</label><select name="pixTipo">${optList([['cnpj', 'CNPJ'], ['cpf', 'CPF'], ['email', 'E-mail'], ['telefone', 'Telefone'], ['aleatoria', 'Chave aleatória']], e.pixTipo)}</select></div>${f('pixChave', 'Chave PIX')}${f('pixNome', 'Nome do recebedor no PIX')}
      <div class="field span3"><label>Instruções adicionais de pagamento (opcional)</label><textarea name="instrucoes" rows="2">${esc(e.instrucoes || '')}</textarea></div></form>`,
    foot: `<button class="btn ghost" data-act="modal-close">Cancelar</button><button class="btn primary" id="ent-save">Salvar</button>`,
    onMount: () => $('#ent-save').onclick = () => {
      const d = Object.fromEntries($$('#ent-form [name]').map(i => [i.name, i.value.trim()]));
      if (!d.razao) return toast('Informe a razão social.', 'err');
      if (d.cnpj && !cnpjOk(d.cnpj)) toast('Atenção: o CNPJ informado não passou na validação.', 'err');
      if (id) Object.assign(entidade(id), d); else db.entidades.push({ id: uid(), ...d });
      save(); closeModal(); rerender();
    }
  });
}
function formPessoa(id) {
  const p = pessoa(id) || { tipo: 'socio' };
  openModal({
    title: id ? 'Editar pessoa' : 'Nova pessoa',
    body: `<form id="pes-form" class="form-grid" style="grid-template-columns:repeat(2,minmax(0,1fr))"><div class="field span2"><label>Nome *</label><input type="text" name="nome" value="${esc(p.nome || '')}"></div>
      <div class="field"><label>Vínculo</label><select name="tipo">${optList(Object.entries(TIPO_PESSOA), p.tipo)}</select></div><div class="field"><label>Comissão padrão de captação (%)</label><input type="number" step="0.1" name="comissaoPadrao" value="${esc(p.comissaoPadrao || '')}"></div>
      <div class="field"><label>E-mail</label><input type="email" name="email" value="${esc(p.email || '')}"></div><div class="field"><label>OAB / documento</label><input type="text" name="oab" value="${esc(p.oab || '')}"></div>
      <div class="field span2"><label>Dados para pagamento de comissões (PIX ou conta)</label><input type="text" name="pix" value="${esc(p.pix || '')}"></div></form>`,
    foot: `<button class="btn ghost" data-act="modal-close">Cancelar</button><button class="btn primary" id="pes-save">Salvar</button>`,
    onMount: () => $('#pes-save').onclick = () => {
      const d = Object.fromEntries($$('#pes-form [name]').map(i => [i.name, i.value.trim()]));
      if (!d.nome) return toast('Informe o nome.', 'err'); d.comissaoPadrao = num(d.comissaoPadrao);
      if (id) Object.assign(pessoa(id), d); else db.pessoas.push({ id: uid(), ...d });
      save(); closeModal(); rerender();
    }
  });
}

/* ---------- Configurações ---------- */
VIEWS.config = {
  title: 'Configurações',
  render() {
    const s = db.settings, m = s.emailMode;
    return pageH('Configurações') + `<div class="grid g2">
      <div class="card"><div class="card-h"><div><h2>Envio de e-mails</h2><p class="hint">Define o que acontece ao apertar o botão de cobrança.</p></div></div>
        <div class="field"><label>Canal de envio</label><select data-s="emailMode">${optList(Object.entries(MODOS_EMAIL), m)}</select></div>
        <div ${m === 'emailjs' ? '' : 'hidden'} style="margin-top:12px">
          <div class="notice">${icon('mail')}<div>Permite que o botão envie a cobrança sem abrir o Outlook, inclusive em lote. Crie uma conta gratuita em emailjs.com, adicione o serviço <b>Outlook</b> (ou Microsoft 365) com a conta do financeiro e crie um modelo cujo destinatário seja {{to_email}}, com cópia {{cc_email}}, assunto {{subject}}, corpo {{{message_html}}} e resposta para {{reply_to}}. As mensagens ficam registradas nos itens enviados.</div></div>
          <div class="form-grid"><div class="field"><label>Service ID</label><input type="text" data-s="emailjs.serviceId" value="${esc(s.emailjs.serviceId)}"></div><div class="field"><label>Template ID</label><input type="text" data-s="emailjs.templateId" value="${esc(s.emailjs.templateId)}"></div><div class="field"><label>Public key</label><input type="text" data-s="emailjs.publicKey" value="${esc(s.emailjs.publicKey)}"></div></div></div>
        ${DIRETO(m) ? '' : '<p class="hint" style="margin-top:10px">Neste canal o botão abre a mensagem já preenchida (destinatário, assunto, texto, dados bancários e PIX); basta confirmar o envio. Se a cobrança for longa demais para o Outlook instalado, o texto é copiado automaticamente e basta colá-lo (Ctrl+V). Para envio sem nenhuma confirmação, inclusive em lote, escolha o envio direto.</p>'}
        <div class="form-grid" style="margin-top:14px;grid-template-columns:repeat(2,minmax(0,1fr))">
          <div class="field"><label>Nome do remetente / assinatura</label><input type="text" data-s="remetente" value="${esc(s.remetente)}"></div>
          <div class="field"><label>Cargo ou setor</label><input type="text" data-s="cargo" value="${esc(s.cargo)}"></div>
          <div class="field"><label>Responder para</label><input type="email" data-s="replyTo" value="${esc(s.replyTo)}"></div>
          <div class="field"><label>Cópia em todas as cobranças</label><input type="text" data-s="ccPadrao" value="${esc(s.ccPadrao)}" placeholder="financeiro@..."></div>
        </div>
        <label class="check" style="margin-top:12px"><input type="checkbox" data-s="confirmarEnvio" ${s.confirmarEnvio ? 'checked' : ''}> Mostrar pré-visualização antes de cada envio</label>
        <div class="actions" style="margin-top:14px"><button class="btn sm" data-act="teste-email">${icon('send', 'i-sm')} Enviar e-mail de teste</button></div></div>
      <div class="card"><div class="card-h"><div><h2>Régua de cobrança e encargos</h2><p class="hint">Valores padrão; cada contrato pode ter encargos próprios.</p></div></div>
        <div class="form-grid" style="grid-template-columns:repeat(2,minmax(0,1fr))">
          <div class="field"><label>Lembrete: dias antes do vencimento</label><input type="number" min="0" data-s="diasLembrete" value="${s.diasLembrete}"></div>
          <div class="field"><label>Reiterar cobrança em atraso a cada (dias)</label><input type="number" min="1" data-s="intervaloReenvio" value="${s.intervaloReenvio}"></div>
          <div class="field"><label>Multa moratória (%)</label><input type="number" step="0.1" data-s="multaPct" value="${s.multaPct}"></div>
          <div class="field"><label>Juros de mora (% ao mês)</label><input type="number" step="0.1" data-s="jurosPct" value="${s.jurosPct}"></div>
          <div class="field span2"><label>Cidade para recibos</label><input type="text" data-s="cidade" value="${esc(s.cidade)}"></div>
        </div>
</div>
      <div class="card" style="grid-column:1/-1"><div class="card-h"><div><h2>Modelos de mensagem</h2><p class="hint">Variáveis disponíveis: ${PLACEHOLDERS.map(p => `<code>{${p}}</code>`).join(' ')}</p></div><button class="btn sm" data-act="tpl-reset">Restaurar textos padrão</button></div>
        <div class="grid g2">${Object.entries(s.templates).map(([k, t]) => `<div><div class="field"><label>${esc(t.nome)} · assunto</label><input type="text" data-s="templates.${k}.assunto" value="${esc(t.assunto)}"></div><div class="field" style="margin-top:8px"><label>Texto</label><textarea rows="12" data-s="templates.${k}.corpo">${esc(t.corpo)}</textarea></div></div>`).join('')}</div></div>
      ${cardAsaas()}
      <div class="card"><div class="card-h"><div><h2>Segurança</h2><p class="hint">Criptografa a base e os arquivos anexos neste navegador (AES-256). Sem a senha não há como recuperar os dados; mantenha backups.</p></div></div>
        ${cryptoKey ? `<p class="t-success" style="margin-bottom:12px">${icon('lock')} Criptografia ativa.</p><div class="actions"><button class="btn sm" data-act="senha">Alterar senha</button><button class="btn sm" data-act="senha-off">Remover senha</button><button class="btn sm" data-act="lock-now">Bloquear agora</button></div>` : `<div class="actions"><button class="btn sm primary" data-act="senha">${icon('lock', 'i-sm')} Proteger com senha</button></div>`}</div>
      <div class="card"><div class="card-h"><div><h2>Dados</h2><p class="hint">Armazenados apenas neste navegador. ${db.settings.ultimoBackup ? `Último backup: ${fdatetime(db.settings.ultimoBackup)}.` : 'Nenhum backup realizado.'}</p></div></div>
        <div class="actions"><button class="btn sm" data-act="backup">${icon('download', 'i-sm')} Backup</button><button class="btn sm" data-act="pick" data-k="backup">${icon('upload', 'i-sm')} Restaurar</button>${db.contratos.some(c => c.demo) ? '<button class="btn sm" data-act="demo-off">Remover dados de exemplo</button>' : '<button class="btn sm" data-act="demo">Carregar dados de exemplo</button>'}<button class="btn sm danger" data-act="wipe">Apagar tudo</button></div></div>
    </div>`;
  }
};
function setPath(obj, path, val) { const ks = path.split('.'); let o = obj; ks.slice(0, -1).forEach(k => o = o[k]); o[ks[ks.length - 1]] = val; }

/* ---------- Formulário de contrato ---------- */
let F = null;
function proximoNumero() { const y = new Date().getFullYear(); const nums = db.contratos.map(c => (String(c.numero).match(new RegExp('^' + y + '/(\\d+)')) || [])[1]).filter(Boolean).map(Number); return `${y}/${String((nums.length ? Math.max(...nums) : 0) + 1).padStart(3, '0')}`; }
function novoContrato() { return { id: uid(), numero: '', cliente: { nome: '', doc: '', email: '', emailCc: '', telefone: '', contato: '', endereco: '' }, area: '', escopo: '', tipo: 'fixo', valorTotal: 0, dataAssinatura: today(), inicio: today(), fim: '', status: 'ativo', entidadeId: db.entidades[0]?.id || '', responsavelId: '', captacao: [], multaPct: '', jurosPct: '', reajuste: '', exito: null, obs: '', criadoEm: new Date().toISOString() }; }
function formContrato(id, draft, filaIdx) {
  const orig = id ? ctById(id) : null;
  const c = orig ? structuredClone(orig) : (draft?.contrato || novoContrato());
  F = { id: c.id, novo: !orig, parcelas: orig ? parcelasDe(orig.id).map(p => ({ ...p })) : (draft?.parcelas || []).map(p => ({ ...p })), captacao: (c.captacao || []).map(x => ({ ...x })), file: draft?.file || null, filaIdx };
  const cl = c.cliente, ex = c.exito || {};
  const inp = (n, l, v, cls = '', type = 'text', extra = '') => `<div class="field ${cls}"><label>${l}</label><input type="${type}" name="${n}" value="${esc(v ?? '')}" ${extra}></div>`;
  openModal({
    title: orig ? `Editar contrato · ${cl.nome}` : (draft ? 'Revisar contrato importado' : 'Novo contrato'), wide: true,
    body: `<form id="ctform" autocomplete="off">
      ${draft?.erro ? `<div class="notice warn">${icon('alert')}<div>${esc(draft.erro)}</div></div>` : ''}
      ${draft ? `<div class="notice">${icon('spark')}<div>Dados ${esc(draft.origem)} de <b>${esc(draft.file?.name || '')}</b>. Confira cada campo antes de salvar; o arquivo será anexado ao contrato.</div></div>` : ''}
      <fieldset class="fs"><legend>Cliente</legend><div class="form-grid">
        ${inp('cl_nome', 'Nome ou razão social *', cl.nome, 'span2')}${inp('cl_doc', 'CPF/CNPJ', fmtDoc(cl.doc))}
        ${inp('cl_email', 'E-mail para cobrança', cl.email, '', 'text', 'placeholder="separe vários por vírgula"')}${inp('cl_emailCc', 'E-mail em cópia', cl.emailCc)}${inp('cl_tel', 'Telefone / WhatsApp', cl.telefone, '', 'tel')}
        ${inp('cl_contato', 'Pessoa de contato', cl.contato)}${inp('cl_cep', 'CEP', cl.cep, '', 'text', 'inputmode="numeric"')}${inp('cl_end', 'Endereço', cl.endereco)}</div></fieldset>
      <fieldset class="fs"><legend>Contrato</legend><div class="form-grid">
        ${inp('numero', 'Número', c.numero || (orig ? '' : proximoNumero()))}
        <div class="field"><label>Área de atuação</label><select name="area">${optList(db.areas.map(a => [a, a]), c.area, 'Selecione')}</select></div>
        <div class="field"><label>Status</label><select name="status">${optList(Object.entries(STATUS_CT).map(([k, v]) => [k, v[0]]), c.status)}</select></div>
        <div class="field span3"><label>Escopo do contrato</label><textarea name="escopo" rows="3" placeholder="Objeto contratado, limites da atuação, instâncias abrangidas">${esc(c.escopo)}</textarea></div>
        ${inp('assinatura', 'Data de assinatura', c.dataAssinatura, '', 'date')}${inp('inicio', 'Início da vigência', c.inicio, '', 'date')}${inp('fim', 'Fim da vigência', c.fim, '', 'date')}
        <div class="field"><label>Faturar por</label><select name="entidadeId">${optList(db.entidades.map(e => [e.id, e.fantasia || e.razao]), c.entidadeId, db.entidades.length ? 'Selecione' : 'Cadastre em Cadastros')}</select></div>
        <div class="field"><label>Responsável técnico</label><select name="responsavelId">${optList(db.pessoas.filter(p => p.tipo !== 'parceiro').map(p => [p.id, p.nome]), c.responsavelId, 'Selecione')}</select></div>
        <div class="field"><label>Arquivo do contrato</label><input type="file" name="arquivo" accept=".pdf,.docx,.doc,.jpg,.png">${c.arquivoNome || F.file ? `<span class="hint">${esc(F.file?.name || c.arquivoNome)}</span>` : ''}</div>
      </div></fieldset>
      <fieldset class="fs"><legend>Honorários</legend><div class="form-grid">
        <div class="field"><label>Modalidade</label><select name="tipo">${optList(Object.entries(TIPOS), c.tipo)}</select></div>
        ${inp('valorTotal', 'Valor total contratado (R$)', c.valorTotal ? n2(c.valorTotal) : '', '', 'text', 'inputmode="decimal"')}
        <div class="field"><label>Reajuste</label><select name="reajuste">${optList(['IPCA', 'IGP-M', 'INPC', 'Nenhum'].map(x => [x, x]), c.reajuste, 'Não se aplica')}</select></div>
        ${inp('multaPct', `Multa (%) · padrão ${db.settings.multaPct}`, c.multaPct, '', 'number', 'step="0.1"')}${inp('jurosPct', `Juros a.m. (%) · padrão ${db.settings.jurosPct}`, c.jurosPct, '', 'number', 'step="0.1"')}
        <label class="check" style="align-self:end;min-height:38px"><input type="checkbox" name="pausar" ${c.pausarCobranca ? 'checked' : ''}> Pausar cobrança automática</label>
      </div>
      <div id="exito-box" style="margin-top:12px" ${['exito', 'hibrido'].includes(c.tipo) ? '' : 'hidden'}><div class="form-grid">
        ${inp('ex_pct', 'Êxito (%)', ex.pct, '', 'number', 'step="0.1"')}${inp('ex_base', 'Base estimada do proveito (R$)', ex.base ? n2(ex.base) : '', '', 'text', 'inputmode="decimal"')}${inp('ex_prob', 'Probabilidade de êxito (%)', ex.prob ?? 50, '', 'number')}
        ${inp('ex_data', 'Data estimada de recebimento', ex.data, '', 'date')}${inp('ex_desc', 'Evento que caracteriza o êxito', ex.desc, 'span2')}</div></div>
      <h4 class="lbl-s" style="margin:16px 0 8px">Gerar cronograma</h4>
      <div class="form-grid" style="grid-template-columns:repeat(5,minmax(0,1fr))">
        ${inp('g_entrada', 'Entrada (R$)', '', '', 'text', 'inputmode="decimal"')}${inp('g_dataEntrada', 'Data da entrada', '', '', 'date')}${inp('g_n', 'Nº de parcelas', '', '', 'number', 'min="0"')}${inp('g_valor', 'Valor da parcela (R$)', '', '', 'text', 'inputmode="decimal" placeholder="automático"')}${inp('g_primeiro', '1º vencimento', addMonthsISO(today(), 1), '', 'date')}
      </div>
      <div class="actions" style="margin-top:10px"><button type="button" class="btn sm" data-act="gerar-cron">${icon('repeat', 'i-sm')} Gerar parcelas</button><button type="button" class="btn sm ghost" data-act="cron-add">${icon('plus', 'i-sm')} Adicionar linha</button><span class="hint">Parcelas já pagas são preservadas.</span></div>
      <div id="cron" style="margin-top:10px"></div></fieldset>
      <fieldset class="fs"><legend>Captação e comissões</legend><div id="capt"></div><button type="button" class="btn sm ghost" data-act="capt-add" style="margin-top:8px">${icon('plus', 'i-sm')} Adicionar responsável pela captação</button></fieldset>
      <div class="field"><label>Observações internas</label><textarea name="obs" rows="2">${esc(c.obs)}</textarea></div>
    </form>`,
    foot: `<button class="btn ghost" data-act="modal-close">Cancelar</button><button class="btn primary" data-act="ct-save">${icon('check')} Salvar contrato</button>`,
    onMount: () => {
      renderCron(); renderCapt();
      $('#ctform [name=tipo]').onchange = e => $('#exito-box').hidden = !['exito', 'hibrido'].includes(e.target.value);
      $('#ctform').addEventListener('input', e => {
        const t = e.target;
        if (t.dataset.ci != null) { const p = F.parcelas[+t.dataset.ci]; p[t.dataset.k] = t.dataset.k === 'valor' ? num(t.value) : t.value; somaCron(); }
        if (t.dataset.ki != null) { const x = F.captacao[+t.dataset.ki]; x[t.dataset.k] = t.value; if (t.dataset.k === 'pessoaId') renderCapt(); }
        if (t.name === 'valorTotal') somaCron();
      });
    }
  });
}
function renderCron() {
  const el = $('#cron'); if (!el) return;
  F.parcelas.sort((a, b) => (a.venc || '').localeCompare(b.venc || '')); F.parcelas.forEach((p, i) => p.n = i + 1);
  el.innerHTML = F.parcelas.length ? `<div class="table-wrap"><table class="tbl cron-tbl"><thead><tr><th>#</th><th>Descrição</th><th>Vencimento</th><th>Valor (R$)</th><th>Situação</th><th></th></tr></thead><tbody>${F.parcelas.map((p, i) => {
    const lock = p.status === 'paga';
    return `<tr><td>${p.n}</td><td><input type="text" data-ci="${i}" data-k="desc" value="${esc(p.desc || '')}" ${lock ? 'disabled' : ''}></td><td><input type="date" data-ci="${i}" data-k="venc" value="${esc(p.venc)}" ${lock ? 'disabled' : ''}></td><td><input type="text" inputmode="decimal" data-ci="${i}" data-k="valor" value="${n2(p.valor)}" ${lock ? 'disabled' : ''}></td><td>${p.id ? chipP(p) : '<span class="chip info">nova</span>'}</td><td>${lock ? '' : `<button type="button" class="icon-btn" data-act="cron-del" data-i="${i}" aria-label="Remover">${icon('trash')}</button>`}</td></tr>`;
  }).join('')}</tbody></table></div><div class="cron-sum" id="cron-sum"></div>` : '<p class="hint">Nenhuma parcela. Use o gerador acima ou adicione linhas manualmente.</p>';
  somaCron();
}
function somaCron() {
  const el = $('#cron-sum'); if (!el) return;
  const soma = F.parcelas.filter(valida).reduce((s, p) => s + (+p.valor || 0), 0), tot = num($('#ctform [name=valorTotal]').value);
  const dif = round2(tot - soma);
  el.innerHTML = `<span>Soma das parcelas: <b>${brl(soma)}</b></span>${tot ? `<span class="${Math.abs(dif) > 0.05 ? 't-danger' : 't-success'}">${Math.abs(dif) > 0.05 ? `Diferença em relação ao contratado: ${brl(dif)}` : 'Confere com o valor contratado'}</span>` : ''}`;
}
function renderCapt() {
  const el = $('#capt'); if (!el) return;
  el.innerHTML = F.captacao.length ? F.captacao.map((x, i) => `<div class="form-grid" style="grid-template-columns:minmax(0,2fr) minmax(0,1.3fr) minmax(0,1fr) minmax(0,1.3fr) auto;align-items:end;margin-bottom:8px">
    <div class="field"><label>Captador</label><select data-ki="${i}" data-k="pessoaId">${optList([...db.pessoas.map(p => [p.id, `${p.nome} (${TIPO_PESSOA[p.tipo] || ''})`]), ['__new', '+ Cadastrar novo']], x.pessoaId, 'Selecione')}</select></div>
    ${x.pessoaId === '__new' ? `<div class="field"><label>Nome do novo captador</label><input type="text" data-ki="${i}" data-k="novoNome" value="${esc(x.novoNome || '')}"></div>` : `<div class="field"><label>Forma</label><select data-ki="${i}" data-k="tipo">${optList([['pct', '% sobre o recebido'], ['fixo', 'Valor fixo total']], x.tipo || 'pct')}</select></div>`}
    <div class="field"><label>${x.tipo === 'fixo' ? 'Valor (R$)' : 'Percentual (%)'}</label><input type="text" inputmode="decimal" data-ki="${i}" data-k="valor" value="${esc(x.valor ?? '')}"></div>
    ${x.pessoaId === '__new' ? `<div class="field"><label>Vínculo</label><select data-ki="${i}" data-k="novoTipo">${optList(Object.entries(TIPO_PESSOA), x.novoTipo || 'parceiro')}</select></div>` : '<div></div>'}
    <button type="button" class="icon-btn" data-act="capt-del" data-i="${i}" aria-label="Remover">${icon('trash')}</button></div>`).join('') : '<p class="hint">Nenhum responsável pela captação informado.</p>';
}
function gerarCronForm() {
  const g = n => $(`#ctform [name="${n}"]`).value;
  const tipo = g('tipo'); let total = num(g('valorTotal'));
  const n = Math.round(num(g('g_n'))), vp = num(g('g_valor')), entrada = num(g('g_entrada'));
  if (!n && !entrada && !total) return toast('Informe o valor total ou o número e valor das parcelas.', 'err');
  const pagas = F.parcelas.filter(p => p.status === 'paga'), jaPago = pagas.reduce((s, p) => s + p.valor, 0);
  if (tipo === 'mensal' && !total && n && vp) { total = n * vp + entrada; $('#ctform [name=valorTotal]').value = n2(total); }
  const novas = gerarCronograma({ total: Math.max(0, total - jaPago), entrada, dataEntrada: g('g_dataEntrada'), n, valorParcela: vp, primeiro: g('g_primeiro') });
  F.parcelas = [...pagas, ...F.parcelas.filter(p => p.status !== 'paga' && !valida(p)), ...novas.map(p => ({ ...p, id: null, status: 'aberta', cobrancas: [] }))];
  if (!total) $('#ctform [name=valorTotal]').value = n2(F.parcelas.filter(valida).reduce((s, p) => s + p.valor, 0));
  renderCron();
}
async function salvarContrato() {
  const g = n => $(`#ctform [name="${n}"]`);
  const nome = g('cl_nome').value.trim(); if (!nome) return toast('Informe o nome do cliente.', 'err');
  if (F.parcelas.some(p => !p.venc)) return toast('Há parcela sem data de vencimento.', 'err');
  const orig = ctById(F.id);
  const c = orig || { id: F.id, criadoEm: new Date().toISOString() };
  Object.assign(c, {
    numero: g('numero').value.trim(), area: g('area').value, status: g('status').value, escopo: g('escopo').value.trim(),
    dataAssinatura: g('assinatura').value, inicio: g('inicio').value, fim: g('fim').value, entidadeId: g('entidadeId').value, responsavelId: g('responsavelId').value,
    tipo: g('tipo').value, valorTotal: round2(num(g('valorTotal').value)), reajuste: g('reajuste').value, multaPct: g('multaPct').value, jurosPct: g('jurosPct').value,
    pausarCobranca: g('pausar').checked, obs: g('obs').value,
    cliente: { nome, doc: g('cl_doc').value.trim(), email: g('cl_email').value.trim(), emailCc: g('cl_emailCc').value.trim(), telefone: g('cl_tel').value.trim(), contato: g('cl_contato').value.trim(), endereco: g('cl_end').value.trim(), cep: g('cl_cep').value.trim() }
  });
  if (['exito', 'hibrido'].includes(c.tipo)) c.exito = { pct: num(g('ex_pct').value), base: num(g('ex_base').value), prob: num(g('ex_prob').value), data: g('ex_data').value, desc: g('ex_desc').value.trim() }; else c.exito = null;
  c.captacao = F.captacao.map(x => {
    if (x.pessoaId === '__new') { if (!x.novoNome?.trim()) return null; const pe = pessoaPorNome(x.novoNome, x.novoTipo || 'parceiro', true); return { pessoaId: pe.id, tipo: 'pct', valor: num(x.valor) }; }
    return x.pessoaId ? { pessoaId: x.pessoaId, tipo: x.tipo || 'pct', valor: num(x.valor) } : null;
  }).filter(Boolean);
  if (!c.valorTotal) c.valorTotal = round2(F.parcelas.filter(valida).reduce((s, p) => s + p.valor, 0));
  const file = g('arquivo').files[0] || F.file;
  if (file) { const fid = uid(); await saveFile(fid, file); if (c.arquivoId) await idbDel('files', c.arquivoId); c.arquivoId = fid; c.arquivoNome = file.name; }
  if (!orig) db.contratos.push(c);
  const ids = new Set(F.parcelas.filter(p => p.id).map(p => p.id));
  db.parcelas = db.parcelas.filter(p => p.contratoId !== c.id || ids.has(p.id) || p.status === 'paga');
  F.parcelas.forEach(fp => {
    if (fp.id) { const p = db.parcelas.find(x => x.id === fp.id); if (p && p.status !== 'paga') Object.assign(p, { desc: fp.desc, venc: fp.venc, valor: round2(num(fp.valor)), n: fp.n }); else if (p) p.n = fp.n; }
    else db.parcelas.push({ id: uid(), contratoId: c.id, n: fp.n, desc: fp.desc || 'Parcela', venc: fp.venc, valor: round2(num(fp.valor)), status: 'aberta', cobrancas: [] });
  });
  log(orig ? 'contrato-editado' : 'contrato-criado', `${c.numero} · ${nome}`);
  if (F.filaIdx != null) ui.fila.splice(F.filaIdx, 1);
  save(); closeModal(); toast('Contrato salvo.', 'ok');
  if (F.filaIdx != null && ui.fila.length) rerender(); else location.hash = '#/contrato/' + c.id;
  rerender();
}

/* ---------- ações sobre parcelas ---------- */
function formPagamento(pid) {
  const p = db.parcelas.find(x => x.id === pid), c = ctById(p.contratoId), sug = atualizado(p);
  openModal({
    title: `Registrar pagamento · parcela ${p.n}`,
    body: `<p class="hint" style="margin-bottom:12px">${esc(c.cliente.nome)} · vencimento ${fdate(p.venc)} · valor ${brl(p.valor)}${sug !== p.valor ? ` · atualizado ${brl(sug)}` : ''}</p>
      <div class="form-grid" style="grid-template-columns:repeat(2,minmax(0,1fr))"><div class="field"><label>Data do pagamento</label><input type="date" id="pg-data" value="${today()}"></div><div class="field"><label>Valor recebido (R$)</label><input type="text" inputmode="decimal" id="pg-valor" value="${n2(p.valor)}"></div>
      <div class="field"><label>Forma</label><select id="pg-forma">${optList(FORMAS.map(f => [f, f]), 'PIX')}</select></div><div class="field"><label>Observação</label><input type="text" id="pg-obs"></div></div>
      ${c.cliente.email ? `<label class="check" style="margin-top:12px"><input type="checkbox" id="pg-recibo"> Enviar confirmação de recebimento ao cliente</label>` : ''}`,
    foot: `<button class="btn ghost" data-act="modal-close">Cancelar</button><button class="btn primary" id="pg-ok">${icon('check')} Confirmar baixa</button>`,
    onMount: () => $('#pg-ok').onclick = async () => {
      Object.assign(p, { status: 'paga', pagoEm: $('#pg-data').value || today(), valorPago: round2(num($('#pg-valor').value)), forma: $('#pg-forma').value, obsPg: $('#pg-obs').value });
      log('pagamento', `${c.cliente.nome} · parcela ${p.n} · ${brl(p.valorPago)}`); save(); const env = $('#pg-recibo')?.checked; closeModal();
      toast('Pagamento registrado.', 'ok'); if (env) await cobrar(p.id, { tipo: 'recibo', semPreview: true }); rerender();
    }
  });
}
function formParcela(pid, contratoId) {
  const p = pid ? db.parcelas.find(x => x.id === pid) : { desc: 'Honorários de êxito', venc: today(), valor: 0, status: 'aberta' };
  openModal({
    title: pid ? `Editar parcela ${p.n}` : 'Nova parcela avulsa',
    body: `<div class="form-grid" style="grid-template-columns:repeat(2,minmax(0,1fr))"><div class="field span2"><label>Descrição</label><input type="text" id="pa-desc" value="${esc(p.desc || '')}"></div>
      <div class="field"><label>Vencimento</label><input type="date" id="pa-venc" value="${esc(p.venc)}"></div><div class="field"><label>Valor (R$)</label><input type="text" inputmode="decimal" id="pa-valor" value="${n2(p.valor)}"></div>
      ${pid && p.status !== 'paga' ? `<div class="field"><label>Situação</label><select id="pa-status">${optList([['aberta', 'Em aberto'], ['cancelada', 'Cancelada']], p.status)}</select></div>` : ''}
      <div class="field span2"><label>Observação</label><input type="text" id="pa-obs" value="${esc(p.obs || '')}"></div></div>
      ${!pid ? '<p class="hint" style="margin-top:10px">Use para honorários de êxito realizados, atos avulsos ou despesas reembolsáveis. A parcela passa a integrar o cronograma, a cobrança e o prognóstico.</p>' : ''}`,
    foot: `${pid && p.status !== 'paga' ? `<button class="btn ghost t-danger" id="pa-del" style="margin-right:auto">Excluir</button>` : ''}<button class="btn ghost" data-act="modal-close">Cancelar</button><button class="btn primary" id="pa-ok">Salvar</button>`,
    onMount: () => {
      $('#pa-ok').onclick = () => {
        const d = { desc: $('#pa-desc').value.trim(), venc: $('#pa-venc').value, valor: round2(num($('#pa-valor').value)), obs: $('#pa-obs').value };
        if (!d.venc) return toast('Informe o vencimento.', 'err');
        if (pid) { Object.assign(p, d); if ($('#pa-status')) p.status = $('#pa-status').value; }
        else { const c = ctById(contratoId); db.parcelas.push({ id: uid(), contratoId, n: parcelasDe(contratoId).length + 1, status: 'aberta', cobrancas: [], ...d }); if (!['mensal'].includes(c.tipo)) c.ajusteReneg = round2((+c.ajusteReneg || 0) + d.valor); }
        const cid = pid ? p.contratoId : contratoId; parcelasDe(cid).forEach((x, i) => x.n = i + 1);
        save(); closeModal(); rerender();
      };
      $('#pa-del')?.addEventListener('click', async () => { if (!await confirmBox('Excluir esta parcela definitivamente?', 'Excluir', true)) return; db.parcelas = db.parcelas.filter(x => x.id !== pid); save(); closeModal(); rerender(); });
    }
  });
}
function formReneg(cid) {
  const c = ctById(cid), atr = parcelasDe(cid).filter(p => valida(p) && p.status !== 'paga' && p.venc < today());
  const tot = atr.reduce((s, p) => s + atualizado(p), 0);
  openModal({
    title: 'Renegociar parcelas em atraso',
    body: `<p class="hint">${atr.length} parcela(s) em atraso, somando ${brl(atr.reduce((s, p) => s + p.valor, 0))} (atualizado: ${brl(tot)}). As parcelas originais serão marcadas como renegociadas e substituídas pelo novo cronograma.</p>
      <div class="form-grid" style="grid-template-columns:repeat(3,minmax(0,1fr));margin-top:14px"><div class="field"><label>Valor renegociado (R$)</label><input type="text" id="rn-valor" value="${n2(tot)}"></div><div class="field"><label>Nº de parcelas</label><input type="number" id="rn-n" min="1" value="3"></div><div class="field"><label>1º vencimento</label><input type="date" id="rn-data" value="${addDaysISO(today(), 7)}"></div></div>`,
    foot: `<button class="btn ghost" data-act="modal-close">Cancelar</button><button class="btn primary" id="rn-ok">Confirmar renegociação</button>`,
    onMount: () => $('#rn-ok').onclick = () => {
      const v = round2(num($('#rn-valor').value)), n = Math.max(1, Math.round(num($('#rn-n').value)));
      atr.forEach(p => p.status = 'renegociada');
      gerarCronograma({ total: v, n, primeiro: $('#rn-data').value }).forEach(p => db.parcelas.push({ id: uid(), contratoId: cid, status: 'aberta', cobrancas: [], ...p, desc: 'Renegociação' }));
      c.ajusteReneg = round2((+c.ajusteReneg || 0) + v - atr.reduce((s, p) => s + p.valor, 0));
      parcelasDe(cid).forEach((x, i) => x.n = i + 1);
      log('renegociacao', `${c.cliente.nome} · ${brl(v)} em ${n}x`); save(); closeModal(); toast('Renegociação registrada.', 'ok'); rerender();
    }
  });
}
function formRenovar(cid) {
  const c = ctById(cid), ps = parcelasDe(cid).filter(valida), ult = ps[ps.length - 1];
  openModal({
    title: 'Gerar novas competências',
    body: `<div class="form-grid" style="grid-template-columns:repeat(3,minmax(0,1fr))"><div class="field"><label>Quantidade de meses</label><input type="number" id="rv-n" value="12" min="1"></div><div class="field"><label>Valor mensal atual (R$)</label><input type="text" id="rv-v" value="${n2(ult?.valor || 0)}"></div><div class="field"><label>Reajuste a aplicar (%)</label><input type="number" step="0.01" id="rv-r" value="0"></div></div>
      <p class="hint" style="margin-top:10px">As competências começam no mês seguinte ao último vencimento (${fdate(ult?.venc)}). ${c.reajuste ? `Índice contratual: ${esc(c.reajuste)}.` : ''}</p>`,
    foot: `<button class="btn ghost" data-act="modal-close">Cancelar</button><button class="btn primary" id="rv-ok">Gerar</button>`,
    onMount: () => $('#rv-ok').onclick = () => {
      const n = Math.max(1, Math.round(num($('#rv-n').value))), r = num($('#rv-r').value), v = round2(num($('#rv-v').value) * (1 + r / 100));
      const ini = ult ? addMonthsISO(ult.venc, 1) : addMonthsISO(today(), 1);
      gerarCronograma({ n, valorParcela: v, primeiro: ini }).forEach(p => db.parcelas.push({ id: uid(), contratoId: cid, status: 'aberta', cobrancas: [], ...p, desc: 'Mensalidade' }));
      if (r > 0) c.ultimoReajuste = today();
      c.valorTotal = round2(parcelasDe(cid).filter(valida).reduce((s, p) => s + p.valor, 0));
      parcelasDe(cid).forEach((x, i) => x.n = i + 1);
      save(); closeModal(); toast(`${n} competência(s) geradas.`, 'ok'); rerender();
    }
  });
}
function modalPix(pid) {
  const p = db.parcelas.find(x => x.id === pid), c = ctById(p.contratoId), ent = entidade(c.entidadeId);
  if (!ent?.pixChave) return toast('Cadastre a chave PIX na entidade de faturamento.', 'err');
  const v = atualizado(p), code = pixPayload(ent, v, `${c.numero || ''}P${p.n}`);
  openModal({
    title: 'PIX da parcela',
    body: `<div style="display:grid;place-items:center;gap:12px"><div id="qr" style="background:#fff;padding:12px;border-radius:12px"></div><p><b>${brl(v)}</b> · ${esc(ent.razao)}</p><div class="code" style="white-space:pre-wrap;word-break:break-all;width:100%">${esc(code)}</div></div>`,
    foot: `<button class="btn ghost" data-act="modal-close">Fechar</button><button class="btn primary" id="pix-copy">Copiar código</button>`,
    onMount: () => { if (window.QRCode) new QRCode($('#qr'), { text: code, width: 220, height: 220, correctLevel: QRCode.CorrectLevel.M }); $('#pix-copy').onclick = () => navigator.clipboard.writeText(code).then(() => toast('Código PIX copiado.', 'ok')); }
  });
}
function imprimirRecibo(pid) {
  const p = db.parcelas.find(x => x.id === pid), c = ctById(p.contratoId), ent = entidade(c.entidadeId), v = pago(p);
  printDoc('Recibo', `${cabecalho(ent)}<h1>Recibo de honorários advocatícios</h1><p style="text-align:right;font-family:Arial;font-weight:bold">${brl(v)}</p>
    <p>Recebemos de <b>${esc(c.cliente.nome)}</b>${c.cliente.doc ? `, inscrito(a) no ${onlyDigits(c.cliente.doc).length === 11 ? 'CPF' : 'CNPJ'} sob o nº ${esc(fmtDoc(c.cliente.doc))}` : ''}, a importância de <b>${brl(v)}</b> (${extenso(v)}), referente à parcela ${p.n} dos honorários advocatícios pactuados no contrato nº ${esc(c.numero || 's/n')}, relativo a ${esc(c.escopo || 'serviços advocatícios')}, paga em ${fdate(p.pagoEm)}${p.forma ? ' por meio de ' + esc(p.forma.toLowerCase()) : ''}.</p>
    <p>Para clareza e como prova de quitação da referida parcela, firmamos o presente recibo.</p>
    <p style="margin-top:28px">${esc(db.settings.cidade || ent?.cidade || '')}${db.settings.cidade || ent?.cidade ? ', ' : ''}${dataExtenso(p.pagoEm || today())}.</p>
    <div class="sig"><div>${esc(ent?.razao || '')}${ent?.cnpj ? `<br><span class="small">CNPJ ${esc(fmtDoc(ent.cnpj))}</span>` : ''}</div></div>`);
}
function imprimirExtrato(cid) {
  const c = ctById(cid), ent = entidade(c.entidadeId), r = resumoCt(c);
  printDoc('Extrato', `${cabecalho(ent)}<h1>Extrato de honorários</h1><p><b>Cliente:</b> ${esc(c.cliente.nome)} ${c.cliente.doc ? '· ' + esc(fmtDoc(c.cliente.doc)) : ''}<br><b>Contrato:</b> ${esc(c.numero || 's/n')} · ${esc(c.area || '')}<br><b>Objeto:</b> ${esc(c.escopo || '—')}<br><b>Emitido em:</b> ${fdate(today())}</p>
    <table><thead><tr><th>#</th><th>Descrição</th><th>Vencimento</th><th class="r">Valor</th><th>Situação</th><th>Pagamento</th><th class="r">Valor pago</th></tr></thead><tbody>${parcelasDe(cid).map(p => `<tr><td>${p.n}</td><td>${esc(p.desc || '')}</td><td>${fdate(p.venc)}</td><td class="r">${brl(p.valor)}</td><td>${ST_P[stP(p)][0]}</td><td>${p.status === 'paga' ? fdate(p.pagoEm) : '—'}</td><td class="r">${p.status === 'paga' ? brl(pago(p)) : '—'}</td></tr>`).join('')}</tbody></table>
    <p style="margin-top:18px;font-family:Arial;font-size:13px"><b>Total contratado:</b> ${brl(c.valorTotal || r.total)} · <b>Recebido:</b> ${brl(r.recebido)} · <b>Em aberto:</b> ${brl(r.aberto)}${r.atrasado ? ` · <b>Em atraso:</b> ${brl(r.atrasado)}` : ''}</p>
    ${ent ? `<p class="small" style="margin-top:18px">${esc(dadosPagamento(ent)).replace(/\n/g, '<br>')}</p>` : ''}`);
}
function imprimirDemonstrativo(pid) {
  const pe = pessoa(pid), xs = comissoes().filter(x => x.pessoaId === pid);
  printDoc('Demonstrativo de comissões', `<div class="head"><img src="${LOGO_URL()}" alt="TPC Advogados" style="height:34px;display:block"></div><h1>Demonstrativo de comissões de captação</h1><p><b>Beneficiário:</b> ${esc(pe.nome)} (${esc(TIPO_PESSOA[pe.tipo] || '')})${pe.pix ? `<br><b>Dados para pagamento:</b> ${esc(pe.pix)}` : ''}<br><b>Emitido em:</b> ${fdate(today())}</p>
    <table><thead><tr><th>Recebido em</th><th>Cliente</th><th>Contrato</th><th>Parcela</th><th class="r">Base</th><th class="r">Comissão</th><th>Situação</th></tr></thead><tbody>${xs.map(x => `<tr><td>${fdate(x.p.pagoEm)}</td><td>${esc(x.c.cliente.nome)}</td><td>${esc(x.c.numero || '')}</td><td>${x.p.n}</td><td class="r">${brl(x.base)}</td><td class="r">${brl(x.valor)}</td><td>${x.pagoInfo ? 'Paga em ' + fdate(x.pagoInfo.em) : 'A pagar'}</td></tr>`).join('')}</tbody></table>
    <p style="margin-top:16px;font-family:Arial"><b>Total gerado:</b> ${brl(xs.reduce((s, x) => s + x.valor, 0))} · <b>Pago:</b> ${brl(xs.filter(x => x.pagoInfo).reduce((s, x) => s + x.valor, 0))} · <b>A pagar:</b> ${brl(xs.filter(x => !x.pagoInfo).reduce((s, x) => s + x.valor, 0))}</p>`);
}


/* =========================================================
   BOLETO E NOTA FISCAL (Asaas, via serviço intermediário)
   ========================================================= */
const NF_ST = { SCHEDULED: 'Agendada', SYNCHRONIZED: 'Enviada à prefeitura', AUTHORIZED: 'Emitida', PROCESSING_CANCELLATION: 'Cancelando', CANCELED: 'Cancelada', CANCELLATION_DENIED: 'Cancelamento negado', ERROR: 'Erro', ERRO: 'Erro' };
const BOL_ST = { PENDING: 'Aguardando pagamento', RECEIVED: 'Pago', CONFIRMED: 'Pago (compensando)', OVERDUE: 'Vencido', REFUNDED: 'Estornado', DELETED: 'Cancelado', RECEIVED_IN_CASH: 'Pago em dinheiro' };
const asaasOk = () => { const a = db?.settings.asaas; return !!(a && a.ativo && a.url && a.token); };
const boletoAtivo = p => p?.boleto && !['DELETED', 'REFUNDED'].includes(p.boleto.status) ? p.boleto : null;
async function api(path, opt = {}) {
  const a = db.settings.asaas;
  let r;
  try { r = await fetch(a.url.replace(/\/+$/, '') + path, { method: opt.method || 'GET', headers: { 'Content-Type': 'application/json', 'x-app-token': a.token }, body: opt.body ? JSON.stringify(opt.body) : undefined }); }
  catch (e) { throw new Error('serviço do Asaas inacessível; confira a URL em Configurações'); }
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.erro || ('erro ' + r.status));
  return j;
}
function conferirEntidade(c) {
  const a = db.settings.asaas;
  if (a.entidadeId && c.entidadeId && c.entidadeId !== a.entidadeId) throw new Error('o contrato fatura por CNPJ diferente do vinculado à conta Asaas');
  if (!c.cliente.doc || !docOk(c.cliente.doc)) throw new Error('informe um CPF/CNPJ válido do cliente no contrato');
}
function nfPayload(p, c, valor) {
  const n = db.settings.asaas.nf, v = varsParcela(p, c);
  const impostos = { retainIss: !!n.retemIss, iss: +n.iss || 0, pis: +n.pis || 0, cofins: +n.cofins || 0, csll: +n.csll || 0, ir: +n.ir || 0, inss: +n.inss || 0 };
  ['nbsCode', 'taxSituationCode', 'taxClassificationCode', 'operationIndicatorCode'].forEach(k => { if (String(n[k] || '').trim()) impostos[k] = String(n[k]).trim(); });
  return { parcelaId: p.id, descricao: fill(n.descricao, v).slice(0, 2000), observacoes: fill(n.observacoes || '', v), valor: round2(valor), deducoes: 0, servico: { id: n.servicoId || '', codigo: n.servicoCodigo || '', nome: n.servicoNome || '' }, impostos };
}
function clienteAsaas(c) { return { nome: c.cliente.nome, doc: c.cliente.doc, email: c.cliente.email, emailCc: c.cliente.emailCc, telefone: c.cliente.telefone, endereco: c.cliente.endereco, cep: c.cliente.cep, ref: c.id, notificarPeloAsaas: !!db.settings.asaas.notificarPeloAsaas }; }
async function emitirBoleto(pid, o = {}) {
  const p = db.parcelas.find(x => x.id === pid), c = ctById(p.contratoId);
  if (p.status === 'paga') throw new Error('parcela já paga');
  conferirEntidade(c);
  const atrasada = p.venc < today();
  const venc = atrasada ? addDaysISO(today(), 3) : p.venc, valor = atrasada ? atualizado(p) : p.valor, { multa, juros } = encargos(c);
  const nTot = parcelasDe(c.id).filter(valida).length;
  if (!o.silencioso) toast('Registrando boleto…');
  const r = await api('/boleto', { method: 'POST', body: {
    cliente: clienteAsaas(c), parcelaId: p.id, valor: round2(valor), vencimento: venc, multaPct: multa, jurosPct: juros,
    descricao: `Honorários advocatícios · contrato ${c.numero || 's/n'} · parcela ${p.n}/${nTot}${atrasada ? ` (vencida em ${fdate(p.venc)}, valor atualizado)` : ''}`,
    notaAoPagar: db.settings.asaas.nfAoPagar ? nfPayload(p, c, valor) : null
  } });
  if (p.boleto) (p.boletosAnteriores ||= []).push(p.boleto);
  p.boleto = { ...r, criadoEm: new Date().toISOString() }; delete p.boleto.pixImagem;
  log('boleto', `${c.cliente.nome} · parcela ${p.n} · ${brl(r.valor)}`); save();
  if (!o.silencioso) { toast('Boleto registrado no banco.', 'ok'); rerender(); }
  return p.boleto;
}
async function loteBoletos(ids) {
  const ps = ids.map(id => db.parcelas.find(p => p.id === id)).filter(p => p && p.status !== 'paga' && !boletoAtivo(p));
  if (!ps.length) return toast('As parcelas selecionadas já têm boleto ou estão pagas.', 'err');
  if (!await confirmBox(`Registrar ${ps.length} boleto(s) no Asaas?`)) return;
  let ok = 0; const erros = [];
  for (const p of ps) { try { await emitirBoleto(p.id, { silencioso: true }); ok++; } catch (e) { erros.push(`${ctById(p.contratoId).cliente.nome}: ${e.message}`); } }
  toast(`${ok} boleto(s) registrados.${erros.length ? ' Falhas: ' + erros.join('; ') : ''}`, erros.length ? 'err' : 'ok'); rerender();
}
function modalBoleto(pid) {
  const p = db.parcelas.find(x => x.id === pid), c = ctById(p.contratoId), b = boletoAtivo(p);
  if (!b) {
    openModal({ title: `Boleto · ${c.cliente.nome}`, body: `<p>Registrar boleto para a parcela ${p.n} (${brl(p.venc < today() ? atualizado(p) : p.valor)}, vencimento ${fdate(p.venc < today() ? addDaysISO(today(), 3) : p.venc)})?</p><p class="hint" style="margin-top:10px">O boleto é registrado no banco pelo Asaas, já com PIX. ${p.venc < today() ? 'Como a parcela está vencida, o boleto sai com o valor atualizado e novo vencimento em 3 dias. ' : ''}${db.settings.asaas.nfAoPagar ? 'A nota fiscal será emitida automaticamente quando o pagamento for confirmado.' : ''}</p>`,
      foot: `<button class="btn ghost" data-act="modal-close">Cancelar</button><button class="btn primary" data-act="bol-emitir" data-id="${p.id}">${icon('barcode')} Registrar boleto</button>` });
    return;
  }
  openModal({
    title: `Boleto · ${c.cliente.nome}`,
    body: `<dl class="dl"><dt>Situação</dt><dd><span class="chip ${['RECEIVED', 'CONFIRMED', 'RECEIVED_IN_CASH'].includes(b.status) ? 'ok' : b.status === 'OVERDUE' ? 'danger' : 'info'}">${esc(BOL_ST[b.status] || b.status)}</span></dd><dt>Valor</dt><dd>${brl(b.valor)}</dd><dt>Vencimento</dt><dd>${fdate(b.vencimento)}</dd><dt>Nosso número</dt><dd>${esc(b.nossoNumero || '—')}</dd><dt>Registrado em</dt><dd>${fdatetime(b.criadoEm)}</dd></dl>
      ${b.linha ? `<div class="field" style="margin-top:16px"><label>Linha digitável</label><div class="code" style="white-space:pre-wrap;word-break:break-all">${esc(b.linha)}</div><button class="btn sm" style="margin-top:6px;align-self:flex-start" data-act="copiar" data-txt="${esc(b.linha)}">Copiar linha digitável</button></div>` : ''}
      ${b.pix ? `<div class="field" style="margin-top:14px"><label>PIX copia e cola (baixa automática)</label><div class="code" style="white-space:pre-wrap;word-break:break-all;max-height:90px">${esc(b.pix)}</div><button class="btn sm" style="margin-top:6px;align-self:flex-start" data-act="copiar" data-txt="${esc(b.pix)}">Copiar PIX</button></div>` : ''}`,
    foot: `<button class="btn ghost t-danger" data-act="bol-cancelar" data-id="${p.id}" style="margin-right:auto">Cancelar boleto</button><button class="btn" data-act="bol-atualizar" data-id="${p.id}">${icon('repeat', 'i-sm')} Atualizar situação</button>${b.fatura ? `<a class="btn" href="${esc(b.fatura)}" target="_blank" rel="noopener">Fatura online</a>` : ''}<a class="btn" href="${esc(b.url)}" target="_blank" rel="noopener">${icon('download', 'i-sm')} Abrir boleto</a><button class="btn primary" data-act="cobrar" data-id="${p.id}">${icon('send', 'i-sm')} Enviar ao cliente</button>`
  });
}
async function atualizarBoleto(pid) {
  const p = db.parcelas.find(x => x.id === pid);
  try { const r = await api('/boleto/' + p.boleto.id); Object.assign(p.boleto, r); if (['RECEIVED', 'CONFIRMED', 'RECEIVED_IN_CASH'].includes(r.status) && p.status !== 'paga') darBaixa(p, r.pagoEm, r.valor); save(); toast('Situação: ' + (BOL_ST[r.status] || r.status), 'ok'); closeModal(); rerender(); }
  catch (e) { toast(e.message, 'err'); }
}
async function cancelarBoleto(pid) {
  const p = db.parcelas.find(x => x.id === pid);
  if (!await confirmBox('Cancelar este boleto no banco? O cliente não conseguirá mais pagá-lo.', 'Cancelar boleto', true)) return;
  try { await api('/boleto/' + p.boleto.id, { method: 'DELETE' }); p.boleto.status = 'DELETED'; save(); closeModal(); toast('Boleto cancelado.', 'ok'); rerender(); }
  catch (e) { toast(e.message, 'err'); }
}
function darBaixa(p, data, valor) {
  Object.assign(p, { status: 'paga', pagoEm: (data || today()).slice(0, 10), valorPago: round2(valor || p.valor), forma: 'Boleto/PIX (Asaas)' });
  if (p.boleto) p.boleto.status = 'RECEIVED';
  const c = ctById(p.contratoId); log('pagamento', `Baixa automática · ${c?.cliente.nome} · parcela ${p.n} · ${brl(p.valorPago)}`);
}
function modalNota(pid) {
  const p = db.parcelas.find(x => x.id === pid), c = ctById(p.contratoId), nf = p.nf, n = db.settings.asaas.nf;
  if (!nf || ['CANCELED', 'ERRO', 'ERROR'].includes(nf.status)) {
    const pl = nfPayload(p, c, pago(p));
    openModal({ title: `Nota fiscal · ${c.cliente.nome}`,
      body: `${nf?.erro ? `<div class="notice danger">${icon('alert')}<div>Tentativa anterior falhou: ${esc(nf.erro)}</div></div>` : ''}<dl class="dl"><dt>Tomador</dt><dd>${esc(c.cliente.nome)} · ${esc(fmtDoc(c.cliente.doc))}</dd><dt>Valor</dt><dd>${brl(pago(p))}</dd><dt>Serviço municipal</dt><dd>${esc(n.servicoNome || n.servicoCodigo || 'não configurado')}</dd><dt>Discriminação</dt><dd>${esc(pl.descricao)}</dd><dt>ISS</dt><dd>${pct(n.iss)}${n.retemIss ? ' (retido pelo tomador)' : ''}</dd></dl>
        ${!n.servicoNome && !n.servicoCodigo && !n.servicoId ? `<div class="notice warn" style="margin-top:14px">${icon('alert')}<div>Configure o serviço municipal e os tributos em Configurações antes de emitir.</div></div>` : ''}`,
      foot: `<button class="btn ghost" data-act="modal-close">Cancelar</button><button class="btn primary" data-act="nf-emitir" data-id="${p.id}" ${!n.servicoNome && !n.servicoCodigo && !n.servicoId ? 'disabled' : ''}>${icon('receipt')} Emitir NFS-e</button>` });
    return;
  }
  openModal({ title: `Nota fiscal · ${c.cliente.nome}`,
    body: `<dl class="dl"><dt>Situação</dt><dd><span class="chip ${nf.status === 'AUTHORIZED' ? 'ok' : 'info'}">${esc(NF_ST[nf.status] || nf.status)}</span></dd><dt>Número</dt><dd>${esc(nf.numero || 'aguardando a prefeitura')}</dd><dt>Valor</dt><dd>${brl(pago(p))}</dd><dt>Solicitada em</dt><dd>${fdatetime(nf.em)}</dd></dl>`,
    foot: `${nf.status === 'AUTHORIZED' ? `<button class="btn ghost t-danger" data-act="nf-cancelar" data-id="${p.id}" style="margin-right:auto">Cancelar nota</button>` : ''}<button class="btn" data-act="nf-atualizar" data-id="${p.id}">${icon('repeat', 'i-sm')} Atualizar</button>${nf.xml ? `<a class="btn" href="${esc(nf.xml)}" target="_blank" rel="noopener">XML</a>` : ''}${nf.pdf ? `<a class="btn primary" href="${esc(nf.pdf)}" target="_blank" rel="noopener">${icon('download', 'i-sm')} PDF da nota</a>` : ''}` });
}
async function emitirNota(pid) {
  const p = db.parcelas.find(x => x.id === pid), c = ctById(p.contratoId);
  try {
    conferirEntidade(c);
    const pagoPeloAsaas = p.boleto && p.forma === 'Boleto/PIX (Asaas)';
    const body = { ...nfPayload(p, c, pago(p)), data: today(), paymentId: pagoPeloAsaas ? p.boleto.id : undefined, cliente: pagoPeloAsaas ? undefined : clienteAsaas(c) };
    toast('Enviando a nota à prefeitura…');
    const r = await api('/nota', { method: 'POST', body });
    p.nf = { ...r, em: new Date().toISOString() }; log('nota-fiscal', `${c.cliente.nome} · parcela ${p.n}`); save();
    closeModal(); toast(r.status === 'AUTHORIZED' ? 'Nota fiscal emitida.' : 'Nota enviada; o número chega quando a prefeitura autorizar.', 'ok'); rerender();
  } catch (e) { toast('Nota não emitida: ' + e.message, 'err'); }
}
async function atualizarNota(pid) {
  const p = db.parcelas.find(x => x.id === pid);
  try { const r = await api('/nota/' + p.nf.id); Object.assign(p.nf, { status: r.status, numero: r.number || p.nf.numero, pdf: r.pdfUrl || p.nf.pdf, xml: r.xmlUrl || p.nf.xml }); save(); closeModal(); modalNota(pid); rerender(); }
  catch (e) { toast(e.message, 'err'); }
}
async function cancelarNota(pid) {
  const p = db.parcelas.find(x => x.id === pid);
  if (!await confirmBox('Solicitar o cancelamento desta nota fiscal à prefeitura?', 'Cancelar nota', true)) return;
  try { await api(`/nota/${p.nf.id}/cancelar`, { method: 'POST' }); p.nf.status = 'PROCESSING_CANCELLATION'; save(); closeModal(); toast('Cancelamento solicitado.', 'ok'); rerender(); }
  catch (e) { toast(e.message, 'err'); }
}
let syncando = false;
async function sincronizar(o = {}) {
  if (!asaasOk() || syncando) return; syncando = true;
  try {
    const a = db.settings.asaas, r = await api('/eventos?desde=' + encodeURIComponent(a.ultimoEvento || ''));
    let baixas = 0, notas = 0;
    const porRef = ref => ref && db.parcelas.find(p => p.id === ref);
    for (const ev of r.eventos || []) {
      const pg = ev.pagamento, nt = ev.nota;
      if (pg) {
        const p = porRef(pg.ref) || db.parcelas.find(x => x.boleto?.id === pg.id); if (!p) continue;
        if (p.boleto?.id === pg.id) p.boleto.status = pg.status;
        if ((ev.evento === 'PAYMENT_RECEIVED' || ev.evento === 'PAYMENT_CONFIRMED') && p.status !== 'paga') { darBaixa(p, pg.pagoEm, pg.valor); baixas++; }
      }
      if (nt) {
        const p = porRef(nt.ref) || db.parcelas.find(x => (x.nf && x.nf.id === nt.id) || (nt.pagamento && x.boleto?.id === nt.pagamento)); if (!p) continue;
        if (ev.evento === 'NF_AUTO_ERRO') p.nf = { status: 'ERRO', erro: nt.erro, em: ev.recebidoEm };
        else { p.nf = { ...(p.nf || {}), id: nt.id || p.nf?.id, status: ev.evento === 'NF_AUTO' ? nt.status : nt.status, numero: nt.numero || p.nf?.numero || null, pdf: nt.pdf || p.nf?.pdf || null, xml: nt.xml || p.nf?.xml || null, em: p.nf?.em || ev.recebidoEm }; if (ev.evento === 'INVOICE_AUTHORIZED' || nt.status === 'AUTHORIZED') notas++; }
      }
    }
    a.ultimoEvento = r.agora || new Date().toISOString(); a.ultimaSync = new Date().toISOString();
    save(); setAsaasState();
    if (baixas || notas) { toast([baixas && `${baixas} pagamento(s) baixado(s) automaticamente`, notas && `${notas} nota(s) fiscal(is) emitida(s)`].filter(Boolean).join(' · '), 'ok'); rerender(); }
    else if (!o.silencioso) toast('Sincronizado. Nenhuma novidade.', 'ok');
  } catch (e) { if (!o.silencioso) toast('Sincronização falhou: ' + e.message, 'err'); setAsaasState(e.message); }
  finally { syncando = false; }
}
function setAsaasState(erro) {
  const el = $('#asaas-state'); if (!el) return;
  el.hidden = !asaasOk();
  el.classList.toggle('err', !!erro);
  el.lastElementChild.textContent = erro ? 'Asaas: falha na conexão' : `Asaas sincronizado ${db.settings.asaas.ultimaSync ? 'às ' + fdatetime(db.settings.asaas.ultimaSync).slice(11) : ''}`;
}
async function testarAsaas() {
  try { const r = await api('/status'); toast(`Conexão estabelecida com o Asaas (${r.ambiente === 'sandbox' ? 'ambiente de testes' : 'produção'}).`, 'ok'); }
  catch (e) { toast('Falha: ' + e.message, 'err'); }
}
async function buscarFiscal(tipo) {
  const termo = prompt(tipo === 'services' ? 'Buscar serviço municipal (ex.: 17.14 ou advocacia):' : 'Buscar código NBS (ex.: advocacia ou 1.1301):', tipo === 'services' ? 'advoc' : 'jurídic');
  if (termo == null) return;
  try {
    const r = await api(`/fiscal/${tipo}?limit=50&description=${encodeURIComponent(termo)}`);
    const itens = r.data || [];
    openModal({ title: tipo === 'services' ? 'Serviços municipais' : 'Códigos NBS',
      body: itens.length ? `<div class="bars">${itens.map((x, i) => `<button class="bar-row wide" data-pick="${i}"><span class="lbl" style="white-space:normal">${esc(x.description || x.name || x.code)}</span><span class="hint">${esc(x.code || x.id || '')}</span><span class="num">${x.issTax != null ? 'ISS ' + pct(x.issTax) : ''}</span></button>`).join('')}</div>` : '<p class="hint">Nenhum resultado. Para Belo Horizonte, caso a lista não esteja disponível, informe o código do serviço manualmente (advocacia: item 17.14 da lista da LC 116/2003).</p>',
      foot: `<button class="btn ghost" data-act="modal-close">Fechar</button>`,
      onMount: () => $$('[data-pick]').forEach(b => b.onclick = () => {
        const x = itens[+b.dataset.pick], n = db.settings.asaas.nf;
        if (tipo === 'services') { n.servicoId = x.id || ''; n.servicoNome = x.description || ''; if (x.issTax != null) n.iss = x.issTax; }
        else n.nbsCode = x.code || x.id || '';
        save(); closeModal(); rerender(); toast('Configuração preenchida.', 'ok');
      })
    });
  } catch (e) { toast('Busca falhou: ' + e.message, 'err'); }
}
function cardAsaas() {
  const a = db.settings.asaas, n = a.nf;
  const f = (k, l, v, extra = '', cls = '') => `<div class="field ${cls}"><label>${l}</label><input ${extra} data-s="asaas.${k}" value="${esc(v ?? '')}"></div>`;
  return `<div class="card" style="grid-column:1/-1"><div class="card-h"><div><h2>Boleto bancário e nota fiscal · Asaas</h2><p class="hint">Boletos registrados com PIX, NFS-e de Belo Horizonte e baixa automática dos pagamentos. A chave da API do Asaas fica no serviço intermediário, nunca neste navegador. <a href="https://github.com/viniciuspapapapa/viniciuspapapapa.github.io/blob/main/asaas-worker/LEIA-ME.md" target="_blank" rel="noopener">Guia de configuração</a></p></div>
      <div class="actions"><button class="btn sm" data-act="asaas-teste">Testar conexão</button><button class="btn sm" data-act="asaas-sync">${icon('repeat', 'i-sm')} Sincronizar agora</button></div></div>
    <div class="form-grid">
      <label class="check span3"><input type="checkbox" data-s="asaas.ativo" ${a.ativo ? 'checked' : ''}> Ativar a integração com o Asaas</label>
      ${f('url', 'URL do serviço intermediário', a.url, 'type="url" placeholder="https://honorarios-asaas.SEU-USUARIO.workers.dev"', 'span2')}
      ${f('token', 'Senha do serviço (APP_TOKEN)', a.token, 'type="password" autocomplete="off"')}
      <div class="field"><label>CNPJ da conta Asaas</label><select data-s="asaas.entidadeId">${optList(db.entidades.map(e => [e.id, e.fantasia || e.razao]), a.entidadeId, 'Qualquer entidade')}</select></div>
      <label class="check"><input type="checkbox" data-s="asaas.gerarAoCobrar" ${a.gerarAoCobrar ? 'checked' : ''}> Gerar boleto automaticamente ao enviar cobrança</label>
      <label class="check"><input type="checkbox" data-s="asaas.nfAoPagar" ${a.nfAoPagar ? 'checked' : ''}> Emitir NFS-e automaticamente ao confirmar o pagamento</label>
      <label class="check span3"><input type="checkbox" data-s="asaas.notificarPeloAsaas" ${a.notificarPeloAsaas ? 'checked' : ''}> Permitir que o Asaas também envie lembretes próprios ao cliente (desmarcado, apenas o escritório se comunica)</label>
    </div>
    <h4 class="lbl-s" style="margin:22px 0 10px">Nota fiscal de serviço (padrão para todas as notas)</h4>
    <div class="form-grid">
      ${f('nf.servicoNome', 'Serviço municipal (descrição)', n.servicoNome, 'type="text" placeholder="17.14 · Advocacia"', 'span2')}
      <div class="field"><label>&nbsp;</label><button class="btn" data-act="asaas-busca" data-k="services">${icon('search', 'i-sm')} Buscar na lista do município</button></div>
      ${f('nf.servicoCodigo', 'Código do serviço (se a lista não estiver disponível)', n.servicoCodigo, 'type="text"')}
      ${f('nf.iss', 'Alíquota de ISS (%)', n.iss, 'type="number" step="0.01"')}
      <label class="check" style="align-self:end;min-height:40px"><input type="checkbox" data-s="asaas.nf.retemIss" ${n.retemIss ? 'checked' : ''}> ISS retido pelo tomador</label>
      ${f('nf.pis', 'PIS (%)', n.pis, 'type="number" step="0.01"')}${f('nf.cofins', 'COFINS (%)', n.cofins, 'type="number" step="0.01"')}${f('nf.csll', 'CSLL (%)', n.csll, 'type="number" step="0.01"')}
      ${f('nf.ir', 'IR (%)', n.ir, 'type="number" step="0.01"')}${f('nf.inss', 'INSS (%)', n.inss, 'type="number" step="0.01"')}<div></div>
      <div class="field span3"><label>Discriminação do serviço (aceita as variáveis dos modelos de mensagem)</label><textarea rows="2" data-s="asaas.nf.descricao">${esc(n.descricao)}</textarea></div>
      <div class="field span3"><label>Observações da nota</label><input type="text" data-s="asaas.nf.observacoes" value="${esc(n.observacoes)}" placeholder="Ex.: Sociedade uniprofissional, ISS recolhido na forma do regime fixo anual."></div>
    </div>
    <div class="notice warn" style="margin:18px 0 12px">${icon('alert')}<div><b>Reforma tributária (IBS/CBS).</b> Desde 1º de outubro de 2026, a NFS-e exige os campos abaixo para os contribuintes obrigados, sob pena de rejeição pela prefeitura. Os códigos corretos devem ser definidos pela contabilidade do escritório.</div></div>
    <div class="form-grid">
      ${f('nf.nbsCode', 'Código NBS', n.nbsCode, 'type="text"')}
      <div class="field"><label>&nbsp;</label><button class="btn" data-act="asaas-busca" data-k="nbsCodes">${icon('search', 'i-sm')} Buscar código NBS</button></div><div></div>
      ${f('nf.taxSituationCode', 'Situação tributária (CST IBS/CBS)', n.taxSituationCode, 'type="text"')}${f('nf.taxClassificationCode', 'Classificação tributária (cClassTrib)', n.taxClassificationCode, 'type="text"')}${f('nf.operationIndicatorCode', 'Indicador de operação', n.operationIndicatorCode, 'type="text"')}
    </div></div>`;
}

/* ---------- exportações ---------- */
function exportar(tipo) {
  if (tipo === 'contratos') download(`contratos-${today()}.csv`, csv([['Número', 'Cliente', 'CPF/CNPJ', 'E-mail', 'Telefone', 'Área', 'Escopo', 'Modalidade', 'Valor contratado', 'Recebido', 'Em aberto', 'Em atraso', 'Status', 'Captação', 'Responsável', 'Faturamento', 'Assinatura'], ...db.contratos.map(c => { const r = resumoCt(c); return [c.numero, c.cliente.nome, fmtDoc(c.cliente.doc), c.cliente.email, c.cliente.telefone, c.area, c.escopo, TIPOS[c.tipo], n2(c.valorTotal || r.total), n2(r.recebido), n2(r.aberto), n2(r.atrasado), STATUS_CT[c.status]?.[0], (c.captacao || []).map(x => `${pessoa(x.pessoaId)?.nome} (${x.tipo === 'pct' ? x.valor + '%' : 'R$ ' + x.valor})`).join(', '), pessoa(c.responsavelId)?.nome || '', entidade(c.entidadeId)?.razao || '', fdate(c.dataAssinatura)]; })]));
  if (tipo === 'parcelas') download(`parcelas-${today()}.csv`, csv([['Contrato', 'Cliente', 'E-mail', 'Parcela', 'Descrição', 'Vencimento', 'Valor', 'Situação', 'Dias de atraso', 'Valor atualizado', 'Pago em', 'Valor pago', 'Forma', 'Cobranças enviadas', 'Última cobrança'], ...db.parcelas.map(p => { const c = ctById(p.contratoId); if (!c) return null; const u = (p.cobrancas || []).slice(-1)[0]; return [c.numero, c.cliente.nome, c.cliente.email, p.n, p.desc, fdate(p.venc), n2(p.valor), ST_P[stP(p)][0], atraso(p) && p.status !== 'paga' ? atraso(p) : '', n2(atualizado(p)), fdate(p.pagoEm), p.status === 'paga' ? n2(pago(p)) : '', p.forma || '', (p.cobrancas || []).length, u ? fdatetime(u.em) : '']; }).filter(Boolean)]));
  if (tipo === 'prog') { const pr = prognostico(ui.f.prog.h, 6); download(`prognostico-${today()}.csv`, csv([['Mês', 'Contratado', 'Recebido', 'A receber', 'Êxito ponderado', 'Previsão ajustada', 'Comissões', 'Líquido'], ...pr.meses.map(m => [ymLabel(m.k), n2(m.contratual), n2(m.recebido), n2(m.aberto), n2(m.exito), n2(m.ajustado), n2(m.comissao), n2(m.liquido)])])); }
  if (tipo === 'com') download(`comissoes-${today()}.csv`, csv([['Captador', 'Cliente', 'Contrato', 'Parcela', 'Recebido em', 'Base', 'Regra', 'Comissão', 'Situação', 'Pago em'], ...comissoes().map(x => [pessoa(x.pessoaId)?.nome, x.c.cliente.nome, x.c.numero, x.p.n, fdate(x.p.pagoEm), n2(x.base), x.regra.tipo === 'pct' ? x.regra.valor + '%' : 'fixo', n2(x.valor), x.pagoInfo ? 'Paga' : 'A pagar', x.pagoInfo ? fdate(x.pagoInfo.em) : ''])]));
}
function modeloCSV() {
  const h = CAMPOS_IMP.map(c => c[1].replace(' *', ''));
  const ex = ['2025/001', 'Empresa Exemplo Ltda', '11.222.333/0001-81', 'financeiro@exemplo.com.br', '', '(31) 99999-0000', 'Maria Souza', 'Penal Empresarial', 'Defesa em inquérito policial e eventual ação penal', 'Fixo parcelado', '60.000,00', '10.000,00', '05/01/2025', '10', '5.000,00', '05/02/2025', '3', 'Dr. Fulano', '10', 'Dra. Beltrana', '', '02/01/2025', 'Ativo', '', ''];
  download('modelo-importacao-contratos.csv', csv([h, ex]));
}

/* ---------- dados de exemplo ---------- */
function carregarDemo() {
  const t = today(), ent = { id: uid(), razao: 'Escritório Exemplo Sociedade de Advogados', fantasia: 'Escritório Exemplo', cnpj: '11222333000181', banco: 'Banco Exemplo (000)', agencia: '0001', conta: '12345-6', pixTipo: 'cnpj', pixChave: '11.222.333/0001-81', cidade: 'Belo Horizonte', email: 'financeiro@exemplo.com.br', demo: true };
  db.entidades.push(ent);
  const P = [['Sócio A', 'socio'], ['Sócia B', 'socio'], ['Advogado C', 'advogado'], ['Parceiro Externo D', 'parceiro']].map(([nome, tipo]) => ({ id: uid(), nome, tipo, email: '', demo: true }));
  db.pessoas.push(...P);
  const mk = (nome, doc, area, escopo, tipo, total, n, ini, capt, pagas, extra = {}) => {
    const c = Object.assign(novoContrato(), { numero: proximoNumero(), area, escopo, tipo, valorTotal: total, dataAssinatura: addMonthsISO(ini, -1), inicio: addMonthsISO(ini, -1), entidadeId: ent.id, responsavelId: P[2].id, captacao: capt, demo: true, cliente: { nome, doc, email: 'cliente.exemplo@example.com', emailCc: '', telefone: '(31) 98888-0000', contato: 'Diretoria Financeira', endereco: 'Belo Horizonte/MG' } }, extra);
    db.contratos.push(c);
    gerarCronograma({ total, n, primeiro: ini }).forEach((p, i) => db.parcelas.push({ id: uid(), contratoId: c.id, n: i + 1, status: i < pagas ? 'paga' : 'aberta', pagoEm: i < pagas ? addDaysISO(p.venc, i % 3) : undefined, cobrancas: [], ...p }));
    return c;
  };
  mk('Alfa Indústria Ltda (exemplo)', '11444777000161', 'Penal Empresarial', 'Defesa técnica em inquérito policial por crime contra a ordem tributária e acompanhamento de eventual ação penal.', 'fixo', 120000, 12, addMonthsISO(t, -5, 10), [{ pessoaId: P[0].id, tipo: 'pct', valor: 10 }], 4);
  mk('Beta Comércio S.A. (exemplo)', '', 'Investigações e Compliance', 'Investigação interna e programa de integridade.', 'mensal', 72000, 12, addMonthsISO(t, -3, 5), [{ pessoaId: P[3].id, tipo: 'pct', valor: 15 }], 3, { reajuste: 'IPCA' });
  mk('Carlos Exemplo da Silva', '52998224725', 'Penal', 'Defesa em ação penal, primeira instância.', 'hibrido', 45000, 6, addMonthsISO(t, -4, 15), [{ pessoaId: P[1].id, tipo: 'pct', valor: 5 }], 2, { exito: { pct: 10, base: 300000, prob: 40, data: addMonthsISO(t, 5), desc: 'Absolvição ou trancamento' } });
  mk('Delta Transportes Ltda (exemplo)', '', 'Tributário', 'Defesa em execução fiscal e exceção de pré-executividade.', 'fixo', 30000, 5, addMonthsISO(t, -1, 20), [], 1);
  mk('Épsilon Participações (exemplo)', '11222333000181', 'Penal Empresarial', 'Parecer sobre risco penal em operação societária.', 'avulso', 25000, 2, addMonthsISO(t, 0, 28), [{ pessoaId: P[0].id, tipo: 'fixo', valor: 2500 }], 0);
  db.settings.cidade ||= 'Belo Horizonte';
  save(); toast('Dados de exemplo carregados.', 'ok'); rerender();
}
function removerDemo() {
  const ids = new Set(db.contratos.filter(c => c.demo).map(c => c.id));
  db.contratos = db.contratos.filter(c => !c.demo); db.parcelas = db.parcelas.filter(p => !ids.has(p.contratoId));
  db.pessoas = db.pessoas.filter(p => !p.demo); db.entidades = db.entidades.filter(e => !e.demo);
  save(); toast('Dados de exemplo removidos.', 'ok'); rerender();
}

/* ---------- senha ---------- */
function formSenha() {
  openModal({
    title: cryptoKey ? 'Alterar senha' : 'Proteger com senha',
    body: `<div class="field"><label>Nova senha (mínimo 8 caracteres)</label><input type="password" id="pw1" autocomplete="new-password"></div><div class="field" style="margin-top:10px"><label>Confirme a senha</label><input type="password" id="pw2" autocomplete="new-password"></div><p class="hint" style="margin-top:10px">A senha não é armazenada em lugar algum. Se for esquecida, os dados só poderão ser recuperados a partir de um backup.</p>`,
    foot: `<button class="btn ghost" data-act="modal-close">Cancelar</button><button class="btn primary" id="pw-ok">Aplicar</button>`,
    onMount: () => $('#pw-ok').onclick = async () => {
      const a = $('#pw1').value, b = $('#pw2').value;
      if (a.length < 8) return toast('Use pelo menos 8 caracteres.', 'err'); if (a !== b) return toast('As senhas não coincidem.', 'err');
      const salt = crypto.getRandomValues(new Uint8Array(16)), key = await deriveKey(a, salt);
      await recriptografar(key); cryptoKey = key; meta = { enc: true, salt }; await idbPut('kv', 'meta', meta); await persist();
      closeModal(); toast('Base criptografada.', 'ok'); rerender();
    }
  });
}
async function removerSenha() {
  if (!await confirmBox('Remover a senha e armazenar os dados sem criptografia neste navegador?', 'Remover', true)) return;
  await recriptografar(null); cryptoKey = null; meta = {}; await idbPut('kv', 'meta', meta); await persist(); toast('Criptografia removida.'); rerender();
}

/* =========================================================
   EVENTOS
   ========================================================= */
const ACT = {
  'nav-open': () => document.body.classList.add('nav-open'),
  palette: () => openPalette(),
  boleto: d => modalBoleto(d.id),
  nota: d => modalNota(d.id),
  'bol-cancelar': d => cancelarBoleto(d.id),
  'bol-atualizar': d => atualizarBoleto(d.id),
  'nf-atualizar': d => atualizarNota(d.id),
  'nf-cancelar': d => cancelarNota(d.id),
  'nf-emitir': d => emitirNota(d.id),
  'bol-emitir': async d => { try { await emitirBoleto(d.id); modalBoleto(d.id); } catch (e) { toast(e.message, 'err'); } },
  copiar: d => navigator.clipboard.writeText(d.txt).then(() => toast('Copiado.', 'ok')),
  'lote-boletos': () => loteBoletos([...ui.sel]),
  'asaas-teste': () => testarAsaas(),
  'asaas-sync': () => sincronizar(),
  'asaas-busca': d => buscarFiscal(d.k),
  'painel-h': d => { ui.f.painelH = +d.h; rerender(); },
  'ir-atraso': () => { ui.f.rec.aba = 'atrasadas'; location.hash = '#/recebiveis'; },
  'area-filtro': d => { Object.assign(ui.f.ct, { area: d.a === 'Sem área' ? '' : d.a, status: '', q: '' }); location.hash = '#/contratos'; },
  mes: d => detalheMes(d.k),
  'nav-close': () => document.body.classList.remove('nav-open'),
  'modal-close': () => closeModal(),
  theme: () => { const cur = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark'; const f = () => { document.documentElement.setAttribute('data-theme', cur); rerender(); }; if (document.startViewTransition && !REDUZ()) document.startViewTransition(f); else f(); try { localStorage.setItem('hon_theme', cur); } catch (e) { } },
  'lock-now': () => location.reload(),
  'ct-new': () => formContrato(),
  'ct-edit': d => formContrato(d.id),
  'ct-save': () => salvarContrato(),
  'ct-del': async d => { const c = ctById(d.id); if (!await confirmBox(`Excluir o contrato de ${c.cliente.nome}, com todas as parcelas e o histórico de cobranças?`, 'Excluir', true)) return; db.contratos = db.contratos.filter(x => x.id !== d.id); db.parcelas = db.parcelas.filter(p => p.contratoId !== d.id); if (c.arquivoId) await idbDel('files', c.arquivoId); log('contrato-excluido', c.cliente.nome); save(); location.hash = '#/contratos'; },
  'gerar-cron': () => gerarCronForm(),
  'cron-add': () => { const last = F.parcelas[F.parcelas.length - 1]; F.parcelas.push({ id: null, desc: 'Parcela', venc: last ? addMonthsISO(last.venc, 1) : addMonthsISO(today(), 1), valor: last?.valor || 0, status: 'aberta', cobrancas: [] }); renderCron(); },
  'cron-del': d => { F.parcelas.splice(+d.i, 1); renderCron(); },
  'capt-add': () => { F.captacao.push({ pessoaId: '', tipo: 'pct', valor: '' }); renderCapt(); },
  'capt-del': d => { F.captacao.splice(+d.i, 1); renderCapt(); },
  cobrar: d => cobrar(d.id, { tipo: d.tipo }),
  preview: d => cobrar(d.id, { preview: true }),
  'pv-send': d => { const p = db.parcelas.find(x => x.id === d.id), tipo = $('#pv-tipo').value; closeModal(); cobrar(p.id, { tipo, semPreview: true }); },
  'copy-msg': () => navigator.clipboard.writeText($('#pv-ass').textContent + '\n\n' + $('#pv-corpo').textContent).then(() => toast('Texto copiado.', 'ok')),
  whats: d => whatsapp(d.id),
  pix: d => modalPix(d.id),
  pagar: d => formPagamento(d.id),
  estornar: async d => { const p = db.parcelas.find(x => x.id === d.id); if (!await confirmBox('Desfazer a baixa desta parcela?')) return; p.status = 'aberta'; delete p.pagoEm; delete p.valorPago; delete p.forma; save(); rerender(); },
  recibo: d => imprimirRecibo(d.id),
  extrato: d => imprimirExtrato(d.id),
  'parc-edit': d => formParcela(d.id),
  'parc-add': d => formParcela(null, d.id),
  reneg: d => formReneg(d.id),
  renovar: d => formRenovar(d.id),
  'ver-arquivo': async d => { const f = await getFile(ctById(d.id).arquivoId); if (!f) return toast('Arquivo não encontrado neste navegador.', 'err'); window.open(URL.createObjectURL(f), '_blank'); },
  'fila-send': () => enviarLote(filaHoje()),
  'lote-sel': () => enviarLote([...ui.sel].map(id => db.parcelas.find(p => p.id === id)).filter(Boolean).map(p => ({ p, tipo: tipoCobranca(p) }))),
  'sel-all': (d, el) => { $$('[data-sel]').forEach(c => { c.checked = el.checked; el.checked ? ui.sel.add(c.dataset.sel) : ui.sel.delete(c.dataset.sel); }); updLote(); },
  aba: d => { ui.f.rec.aba = d.k; ui.sel.clear(); rerender(); },
  'ver-aba': d => { ui.f.ver = d.k; rerender(); },
  'cad-aba': d => { ui.f.cad = d.k; rerender(); },
  'ent-edit': d => formEntidade(d.id),
  'ent-del': async d => { if (db.contratos.some(c => c.entidadeId === d.id)) return toast('Há contratos vinculados a esta entidade.', 'err'); if (!await confirmBox('Excluir esta entidade?', 'Excluir', true)) return; db.entidades = db.entidades.filter(e => e.id !== d.id); save(); rerender(); },
  'pes-edit': d => formPessoa(d.id),
  'pes-del': async d => { if (db.contratos.some(c => c.responsavelId === d.id || (c.captacao || []).some(x => x.pessoaId === d.id))) return toast('Esta pessoa está vinculada a contratos.', 'err'); if (!await confirmBox('Excluir esta pessoa?', 'Excluir', true)) return; db.pessoas = db.pessoas.filter(p => p.id !== d.id); save(); rerender(); },
  'area-add': () => { const v = $('#nova-area').value.trim(); if (v && !db.areas.includes(v)) { db.areas.push(v); save(); rerender(); } },
  'area-del': d => { db.areas.splice(+d.i, 1); save(); rerender(); },
  'com-toggle': d => { if (db.comissoesPagas[d.k]) delete db.comissoesPagas[d.k]; else db.comissoesPagas[d.k] = { em: today(), valor: +d.v }; save(); rerender(); },
  'com-pagar': async () => {
    const f = ui.f.com, xs = comissoes().filter(x => !x.pagoInfo && (!f.pessoa || x.pessoaId === f.pessoa) && (!f.mes || ym(x.p.pagoEm || x.p.venc) === f.mes));
    if (!await confirmBox(`Marcar ${xs.length} comissão(ões), no total de ${brl(xs.reduce((s, x) => s + x.valor, 0))}, como pagas hoje?`)) return;
    xs.forEach(x => db.comissoesPagas[x.key] = { em: today(), valor: x.valor }); save(); rerender();
  },
  demonstrativo: d => imprimirDemonstrativo(d.id),
  pick: d => pick(d.k),
  'modelo-csv': () => modeloCSV(),
  'fila-rev': d => { const x = ui.fila[+d.i]; formContrato(null, x, +d.i); },
  'fila-del': d => { ui.fila.splice(+d.i, 1); rerender(); },
  backup: () => gerarBackup(),
  'exp-contratos': () => exportar('contratos'), 'exp-parcelas': () => exportar('parcelas'), 'exp-prog': () => exportar('prog'), 'exp-com': () => exportar('com'),
  demo: () => carregarDemo(),
  'demo-off': () => removerDemo(),
  wipe: async () => { if (!await confirmBox('Apagar definitivamente todos os contratos, parcelas, cadastros e arquivos deste navegador?', 'Apagar tudo', true)) return; if (!await confirmBox('Confirma? Esta ação não pode ser desfeita.', 'Sim, apagar', true)) return; const s = db.settings; db = defaultDB(); db.settings = { ...db.settings, ...s }; for (const k of await idbKeys('files')) await idbDel('files', k); await persist(); rerender(); },
  'tpl-reset': async () => { if (!await confirmBox('Restaurar os textos padrão dos modelos de mensagem?')) return; db.settings.templates = structuredClone(TEMPLATES_PADRAO); save(); rerender(); },
  'teste-email': async () => {
    const para = db.settings.replyTo || prompt('Enviar o teste para qual e-mail?'); if (!para) return;
    try { await transporte({ para, cc: '', assunto: 'Teste de envio · Honorários', corpo: 'Este é um e-mail de teste do sistema de gestão de honorários. Se você o recebeu, o canal de envio está configurado corretamente.' }); toast(DIRETO(db.settings.emailMode) ? `Teste enviado para ${para}. Confira a caixa de entrada.` : 'Mensagem de teste aberta.', 'ok'); }
    catch (e) { toast('Falha: ' + e.message, 'err'); }
  },
  senha: () => formSenha(),
  'senha-off': () => removerSenha()
};
function updLote() { const bb = $('#btn-lote-bol'); if (bb) bb.disabled = !ui.sel.size; const b = $('#btn-lote'); if (b) { b.disabled = !ui.sel.size; b.innerHTML = `${icon('send', 'i-sm')} Cobrar selecionadas${ui.sel.size ? ` (${ui.sel.size})` : ''}`; } }
document.addEventListener('click', e => {
  const go = e.target.closest('[data-go]');
  const a = e.target.closest('[data-act]');
  if (a && (a.tagName !== 'INPUT' || a.type === 'checkbox')) {
    if (a.tagName === 'A' || a.tagName === 'BUTTON') e.preventDefault();
    const fn = ACT[a.dataset.act]; if (fn) { e.stopPropagation(); fn(a.dataset, a, e); } return;
  }
  if (e.target.closest('a,button,input,select,textarea,label')) return;
  if (go) location.hash = '#/' + go.dataset.go;
  if (e.target.matches('[data-scrim]')) closeModal();
});
document.addEventListener('change', e => {
  const t = e.target;
  if (t.dataset.sel) { t.checked ? ui.sel.add(t.dataset.sel) : ui.sel.delete(t.dataset.sel); updLote(); return; }
  if (t.dataset.f && t.tagName === 'SELECT') { const [g, k] = t.dataset.f.split('.'); ui.f[g][k] = t.tagName === 'SELECT' && k === 'h' ? +t.value : t.value; rerender(); return; }
  if (t.dataset.s) { setPath(db.settings, t.dataset.s, t.type === 'checkbox' ? t.checked : t.type === 'number' ? num(t.value) : t.value); save(); if (t.dataset.s === 'emailMode' || t.dataset.s === 'asaas.ativo') rerender(); if (t.dataset.s.startsWith('asaas.')) setAsaasState(); }
});
let qTimer = null;
document.addEventListener('input', e => {
  const t = e.target;
  if (t.dataset.f && t.type === 'search') { const [g, k] = t.dataset.f.split('.'); ui.f[g][k] = t.value; clearTimeout(qTimer); qTimer = setTimeout(() => { const pos = t.selectionStart; rerender(); const n = $(`[data-f="${g}.${k}"]`); if (n) { n.focus(); n.setSelectionRange(pos, pos); } }, 220); }
});
document.addEventListener('keydown', e => {
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); openPalette(); return; }
  if (e.key === '/' && !/INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName || '') && !$('#modal-root').innerHTML) { e.preventDefault(); openPalette(); return; }
  if (e.key === 'Escape' && $('#modal-root').innerHTML) closeModal();
});

/* ---------- inicialização ---------- */
let idleTimer = null;
function armIdle() { clearTimeout(idleTimer); if (cryptoKey) idleTimer = setTimeout(() => location.reload(), 30 * 60 * 1000); }
['click', 'keydown'].forEach(ev => document.addEventListener(ev, armIdle, { passive: true }));
function start() {
  setAsaasState();
  if (asaasOk()) { setTimeout(() => sincronizar({ silencioso: true }), 1500); setInterval(() => sincronizar({ silencioso: true }), 3 * 60 * 1000); }
  $('#lock').hidden = true; $('#app').hidden = false;
  window.addEventListener('hashchange', route); route(); armIdle();
  navigator.storage?.persist?.();
}
async function boot() {
  try { idb = await idbOpen(); }
  catch (e) { document.body.innerHTML = '<p style="padding:24px;font-family:sans-serif">Este navegador não permite armazenamento local (IndexedDB). Desative o modo anônimo ou use outro navegador.</p>'; return; }
  meta = await idbGet('kv', 'meta') || {};
  const raw = await idbGet('kv', 'db');
  if (raw && raw.enc) {
    $('#lock').hidden = false;
    $('#lock-form').onsubmit = async e => {
      e.preventDefault();
      try {
        const key = await deriveKey($('#lock-pass').value, meta.salt);
        const txt = new TextDecoder().decode(await decBuf(raw, key));
        cryptoKey = key; db = migrate(JSON.parse(txt)); start();
      } catch (err) { $('#lock-err').hidden = false; $('#lock-pass').select(); }
    };
    return;
  }
  db = migrate(raw ? JSON.parse(raw) : null);
  start();
}
boot();
