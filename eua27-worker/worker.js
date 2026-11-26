// Serviço de sincronização do app EUA 2027 (Cloudflare Worker + KV).
// Guarda apenas dados cifrados no navegador com a chave do grupo: o servidor nunca vê o conteúdo.
//
// Rotas (todas exigem o cabeçalho x-app-token, exceto /status):
//   GET  /estado[?rev=N]   estado compartilhado { rev, em, col: { colecao: { chave: { ts, d } } } }
//   POST /estado           { col: {...} } mescla registro a registro (vence o ts mais novo) e devolve o estado
//   PUT  /arquivo/:id      grava um arquivo cifrado (até 15 MB)
//   GET  /arquivo/:id      devolve o arquivo cifrado
//   DELETE /arquivo/:id    apaga o arquivo
//   GET  /push/chave       chave pública VAPID (gerada e guardada no KV na primeira chamada)
//   POST /push/inscrever   { id, sub, pessoa } registra um aparelho para receber avisos
//   POST /push/cancelar    { id } remove o aparelho
//   GET  /push/aviso       último aviso (cifrado pelo app); o service worker o lê ao receber a notificação
//   POST /push/teste       { id } envia um aviso de teste só para esse aparelho
//   As notificações vão sem conteúdo (o texto fica cifrado em /push/aviso), então não exigem criptografia de payload.
//
// Variáveis: SYNC_TOKEN (secret), ALLOWED_ORIGIN (texto). KV: binding EUA.

const COLECOES = new Set(['gastos', 'check', 'hoteis', 'pix', 'conf', 'voos', 'votos', 'arquivos']);
const MAX_REG = 40000;            // caracteres por registro cifrado
const MAX_ARQ = 15 * 1024 * 1024; // bytes por arquivo
const ID_ARQ = /^[a-z0-9-]{4,48}$/;
const ID_PUSH = /^[a-f0-9]{16,64}$/;
const SUB_CONTATO = 'https://viniciuspapapapa.github.io';

const b64u = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const txt = (s) => new TextEncoder().encode(s);

async function chavesVapid(env) {
  const salvo = await env.EUA.get('vapid', { type: 'json' });
  if (salvo) return salvo;
  const par = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
  const novo = { pub: b64u(await crypto.subtle.exportKey('raw', par.publicKey)), priv: await crypto.subtle.exportKey('jwk', par.privateKey) };
  await env.EUA.put('vapid', JSON.stringify(novo));
  return novo;
}
async function jwtVapid(vapid, endpoint) {
  const cab = b64u(txt(JSON.stringify({ typ: 'JWT', alg: 'ES256' })));
  const corpo = b64u(txt(JSON.stringify({ aud: new URL(endpoint).origin, exp: Math.floor(Date.now() / 1000) + 12 * 3600, sub: SUB_CONTATO })));
  const chave = await crypto.subtle.importKey('jwk', vapid.priv, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
  const assin = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, chave, txt(`${cab}.${corpo}`));
  return `${cab}.${corpo}.${b64u(assin)}`;
}
async function enviarPush(env, filtro) {
  const inscr = (await env.EUA.get('inscricoes', { type: 'json' })) || {};
  const alvos = Object.entries(inscr).filter(([id, i]) => filtro(id, i));
  if (!alvos.length) return 0;
  const vapid = await chavesVapid(env);
  let removidos = 0, enviados = 0;
  await Promise.all(alvos.map(async ([id, i]) => {
    try {
      const r = await fetch(i.sub.endpoint, { method: 'POST', headers: { TTL: '86400', Urgency: 'normal', Authorization: `vapid t=${await jwtVapid(vapid, i.sub.endpoint)}, k=${vapid.pub}` } });
      if (r.status === 404 || r.status === 410) { delete inscr[id]; removidos++; } else if (r.ok) enviados++;
    } catch { /* aparelho indisponível */ }
  }));
  if (removidos) await env.EUA.put('inscricoes', JSON.stringify(inscr));
  return enviados;
}

function cabecalhos(env, req) {
  const origem = req.headers.get('Origin') || '';
  const permitidas = String(env.ALLOWED_ORIGIN || 'https://viniciuspapapapa.github.io').split(',').map((s) => s.trim());
  return {
    'Access-Control-Allow-Origin': permitidas.includes(origem) ? origem : permitidas[0],
    'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
    'Access-Control-Allow-Headers': 'content-type,x-app-token',
    'Access-Control-Max-Age': '86400',
    'Cache-Control': 'no-store',
    Vary: 'Origin',
  };
}
const json = (obj, status, h) => new Response(JSON.stringify(obj), { status, headers: { ...h, 'content-type': 'application/json; charset=utf-8' } });

function iguais(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

export function mesclar(estado, col) {
  let mudou = 0;
  for (const [c, regs] of Object.entries(col || {})) {
    if (!COLECOES.has(c) || !regs || typeof regs !== 'object') continue;
    estado.col[c] ||= {};
    for (const [k, v] of Object.entries(regs)) {
      if (typeof k !== 'string' || k.length > 120 || !v || typeof v.ts !== 'number' || typeof v.d !== 'string' || v.d.length > MAX_REG) continue;
      const atual = estado.col[c][k];
      if (!atual || v.ts > atual.ts) { estado.col[c][k] = { ts: v.ts, d: v.d }; mudou++; }
    }
  }
  return mudou;
}

export default {
  async fetch(req, env, ctx) {
    const h = cabecalhos(env, req);
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: h });
    const url = new URL(req.url);
    if (url.pathname === '/status') return json({ ok: true, servico: 'eua27-sync', configurado: Boolean(env.SYNC_TOKEN && env.EUA) }, 200, h);
    if (!env.SYNC_TOKEN || !env.EUA) return json({ erro: 'Serviço sem SYNC_TOKEN ou sem o KV EUA.' }, 500, h);
    if (!iguais(req.headers.get('x-app-token') || '', env.SYNC_TOKEN)) return json({ erro: 'Token inválido.' }, 401, h);

    if (url.pathname === '/estado') {
      const estado = (await env.EUA.get('estado', { type: 'json' })) || { rev: 0, em: 0, col: {} };
      if (req.method === 'GET') {
        if (url.searchParams.get('rev') === String(estado.rev)) return json({ rev: estado.rev, igual: true }, 200, h);
        return json(estado, 200, h);
      }
      if (req.method === 'POST') {
        let corpo;
        try { corpo = await req.json(); } catch { return json({ erro: 'JSON inválido.' }, 400, h); }
        const mudou = mesclar(estado, corpo?.col);
        if (mudou) { estado.rev = (estado.rev || 0) + 1; estado.em = Date.now(); await env.EUA.put('estado', JSON.stringify(estado)); }
        if (typeof corpo?.aviso === 'string' && corpo.aviso.length < 4000) {
          const autor = typeof corpo.autor === 'string' ? corpo.autor.slice(0, 40) : '';
          await env.EUA.put('aviso', JSON.stringify({ ts: Date.now(), d: corpo.aviso, autor }));
          const envio = enviarPush(env, (id, i) => !autor || i.pessoa !== autor);
          if (ctx?.waitUntil) ctx.waitUntil(envio); else await envio;
        }
        return json({ ...estado, mudou }, 200, h);
      }
      return json({ erro: 'Método não suportado.' }, 405, h);
    }

    if (url.pathname.startsWith('/push/')) {
      const rota = url.pathname.slice(6);
      if (rota === 'chave' && req.method === 'GET') return json({ chave: (await chavesVapid(env)).pub }, 200, h);
      if (rota === 'aviso' && req.method === 'GET') return json((await env.EUA.get('aviso', { type: 'json' })) || {}, 200, h);
      if (req.method !== 'POST') return json({ erro: 'Método não suportado.' }, 405, h);
      let corpo;
      try { corpo = await req.json(); } catch { return json({ erro: 'JSON inválido.' }, 400, h); }
      if (!ID_PUSH.test(String(corpo?.id || ''))) return json({ erro: 'Identificador inválido.' }, 400, h);
      const inscr = (await env.EUA.get('inscricoes', { type: 'json' })) || {};
      if (rota === 'inscrever') {
        const sub = corpo.sub;
        if (!sub || typeof sub.endpoint !== 'string' || !/^https:\/\//.test(sub.endpoint) || JSON.stringify(sub).length > 2000) return json({ erro: 'Inscrição inválida.' }, 400, h);
        inscr[corpo.id] = { sub, pessoa: String(corpo.pessoa || '').slice(0, 40), em: Date.now() };
        await env.EUA.put('inscricoes', JSON.stringify(inscr));
        return json({ ok: true }, 200, h);
      }
      if (rota === 'cancelar') { delete inscr[corpo.id]; await env.EUA.put('inscricoes', JSON.stringify(inscr)); return json({ ok: true }, 200, h); }
      if (rota === 'teste') {
        await env.EUA.put('aviso', JSON.stringify({ ts: Date.now(), d: typeof corpo.aviso === 'string' ? corpo.aviso.slice(0, 4000) : '', autor: '' }));
        return json({ ok: true, enviados: await enviarPush(env, (id) => id === corpo.id) }, 200, h);
      }
      return json({ erro: 'Rota não encontrada.' }, 404, h);
    }

    const m = url.pathname.match(/^\/arquivo\/([^/]+)$/);
    if (m) {
      const id = m[1];
      if (!ID_ARQ.test(id)) return json({ erro: 'Identificador inválido.' }, 400, h);
      const chave = 'arq:' + id;
      if (req.method === 'GET') {
        const dados = await env.EUA.get(chave, { type: 'arrayBuffer' });
        if (!dados) return json({ erro: 'Arquivo não encontrado.' }, 404, h);
        return new Response(dados, { status: 200, headers: { ...h, 'content-type': 'application/octet-stream' } });
      }
      if (req.method === 'PUT') {
        const dados = await req.arrayBuffer();
        if (!dados.byteLength || dados.byteLength > MAX_ARQ) return json({ erro: 'Arquivo vazio ou maior que 15 MB.' }, 413, h);
        await env.EUA.put(chave, dados);
        return json({ ok: true, tamanho: dados.byteLength }, 200, h);
      }
      if (req.method === 'DELETE') { await env.EUA.delete(chave); return json({ ok: true }, 200, h); }
      return json({ erro: 'Método não suportado.' }, 405, h);
    }
    return json({ erro: 'Rota não encontrada.' }, 404, h);
  },
};
