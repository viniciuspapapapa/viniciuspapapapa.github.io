// Serviço de sincronização do app EUA 2027 (Cloudflare Worker + KV).
// Guarda apenas dados cifrados no navegador com a chave do grupo: o servidor nunca vê o conteúdo.
//
// Rotas (todas exigem o cabeçalho x-app-token, exceto /status):
//   GET  /estado[?rev=N]   estado compartilhado { rev, em, col: { colecao: { chave: { ts, d } } } }
//   POST /estado           { col: {...} } mescla registro a registro (vence o ts mais novo) e devolve o estado
//   PUT  /arquivo/:id      grava um arquivo cifrado (até 15 MB)
//   GET  /arquivo/:id      devolve o arquivo cifrado
//   DELETE /arquivo/:id    apaga o arquivo
//
// Variáveis: SYNC_TOKEN (secret), ALLOWED_ORIGIN (texto). KV: binding EUA.

const COLECOES = new Set(['gastos', 'check', 'hoteis', 'pix', 'conf', 'voos', 'votos', 'arquivos']);
const MAX_REG = 40000;            // caracteres por registro cifrado
const MAX_ARQ = 15 * 1024 * 1024; // bytes por arquivo
const ID_ARQ = /^[a-z0-9-]{4,48}$/;

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
  async fetch(req, env) {
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
        return json({ ...estado, mudou }, 200, h);
      }
      return json({ erro: 'Método não suportado.' }, 405, h);
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
