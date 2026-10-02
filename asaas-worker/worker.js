/* =========================================================
   Honorários · TPC Advogados
   Serviço intermediário (Cloudflare Worker) para o Asaas.

   Guarda a chave da API fora do navegador, registra boletos,
   emite NFS-e e recebe os webhooks de pagamento e de nota.

   Variáveis (Settings > Variables and Secrets):
     ASAAS_API_KEY   (secret)  chave da API do Asaas
     APP_TOKEN       (secret)  senha compartilhada com a plataforma
     WEBHOOK_TOKEN   (secret)  token configurado no webhook do Asaas
     ASAAS_ENV       (texto)   "production" ou "sandbox"
     ALLOWED_ORIGIN  (texto)   https://viniciuspapapapa.github.io
   Binding KV: HON
   ========================================================= */

const BASES = { production: 'https://api.asaas.com/v3', sandbox: 'https://api-sandbox.asaas.com/v3' };
const MAX_EVENTOS = 800;

export default {
  async fetch(req, env, ctx) {
    const url = new URL(req.url);
    const cors = corsHeaders(env, req);
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });

    try {
      if (url.pathname === '/webhook' && req.method === 'POST') return await webhook(req, env, ctx);

      if (!env.APP_TOKEN || req.headers.get('x-app-token') !== env.APP_TOKEN) return json({ erro: 'Não autorizado.' }, 401, cors);

      const p = url.pathname.replace(/\/+$/, '');
      let m;
      if (p === '/status' && req.method === 'GET') {
        const r = await asaas(env, 'GET', '/customers?limit=1');
        return json({ ok: true, ambiente: env.ASAAS_ENV || 'production', clientes: r.totalCount ?? null }, 200, cors);
      }
      if (p === '/boleto' && req.method === 'POST') return json(await criarBoleto(await req.json(), env), 200, cors);
      if ((m = p.match(/^\/boleto\/([\w-]+)$/))) {
        if (req.method === 'GET') return json(await consultarBoleto(m[1], env), 200, cors);
        if (req.method === 'DELETE') { await asaas(env, 'DELETE', `/payments/${m[1]}`); await env.HON?.delete('nf:' + m[1]); return json({ ok: true }, 200, cors); }
      }
      if (p === '/nota' && req.method === 'POST') return json(await emitirNota(await req.json(), env), 200, cors);
      if ((m = p.match(/^\/nota\/([\w-]+)$/)) && req.method === 'GET') return json(await asaas(env, 'GET', `/invoices/${m[1]}`), 200, cors);
      if ((m = p.match(/^\/nota\/([\w-]+)\/cancelar$/)) && req.method === 'POST') return json(await asaas(env, 'POST', `/invoices/${m[1]}/cancel`, {}), 200, cors);
      if ((m = p.match(/^\/fiscal\/([A-Za-z]+)$/)) && req.method === 'GET') return json(await asaas(env, 'GET', `/fiscalInfo/${m[1]}${url.search}`), 200, cors);
      if (p === '/eventos' && req.method === 'GET') {
        const desde = url.searchParams.get('desde') || '';
        const lista = (await lerEventos(env)).filter(e => e.recebidoEm > desde);
        return json({ eventos: lista, agora: new Date().toISOString() }, 200, cors);
      }
      return json({ erro: 'Rota inexistente.' }, 404, cors);
    } catch (e) {
      return json({ erro: e.message || String(e), detalhe: e.detalhe || null }, e.status && e.status < 500 ? e.status : 502, cors);
    }
  }
};

/* ---------- Asaas ---------- */
async function asaas(env, method, path, body) {
  const base = env.ASAAS_BASE_URL || BASES[env.ASAAS_ENV] || BASES.production;
  const r = await fetch(base + path, {
    method,
    headers: { 'access_token': env.ASAAS_API_KEY, 'Content-Type': 'application/json', 'User-Agent': 'TPC-Honorarios/1.0' },
    body: body && method !== 'GET' ? JSON.stringify(body) : undefined
  });
  const txt = await r.text();
  let data = null; try { data = txt ? JSON.parse(txt) : null; } catch { data = { raw: txt }; }
  if (!r.ok) {
    const msg = data?.errors?.map(x => x.description).join(' ') || `Asaas respondeu ${r.status}`;
    const err = new Error(msg); err.status = r.status === 401 ? 502 : r.status; err.detalhe = data; throw err;
  }
  return data;
}
const soDigitos = s => String(s || '').replace(/[^0-9A-Za-z]/g, '').toUpperCase();

async function clienteAsaas(c, env) {
  const doc = soDigitos(c.doc);
  if (!doc) { const e = new Error('Cliente sem CPF/CNPJ: o Asaas exige o documento para registrar o boleto e emitir a nota.'); e.status = 400; throw e; }
  const achado = await asaas(env, 'GET', `/customers?cpfCnpj=${encodeURIComponent(doc)}&limit=1`);
  const dados = {
    name: c.nome, cpfCnpj: doc, email: (c.email || '').split(/[,;]/)[0].trim() || undefined,
    additionalEmails: (c.email || '').split(/[,;]/).slice(1).concat(c.emailCc ? [c.emailCc] : []).map(x => x.trim()).filter(Boolean).join(',') || undefined,
    mobilePhone: soDigitos(c.telefone) || undefined, postalCode: soDigitos(c.cep) || undefined,
    address: c.endereco || undefined, addressNumber: c.numero || undefined,
    externalReference: c.ref || undefined, notificationDisabled: !c.notificarPeloAsaas
  };
  if (achado?.data?.length) {
    const id = achado.data[0].id;
    await asaas(env, 'PUT', `/customers/${id}`, dados).catch(() => null);
    return id;
  }
  return (await asaas(env, 'POST', '/customers', dados)).id;
}

async function criarBoleto(b, env) {
  const customer = await clienteAsaas(b.cliente || {}, env);
  const pay = await asaas(env, 'POST', '/payments', {
    customer, billingType: 'BOLETO', value: Number(b.valor), dueDate: b.vencimento,
    description: String(b.descricao || '').slice(0, 500), externalReference: b.parcelaId,
    fine: b.multaPct ? { value: Number(b.multaPct), type: 'PERCENTAGE' } : undefined,
    interest: b.jurosPct ? { value: Number(b.jurosPct) } : undefined
  });
  const extra = await detalhesPagamento(pay.id, env);
  if (b.notaAoPagar && env.HON) await env.HON.put('nf:' + pay.id, JSON.stringify(b.notaAoPagar), { expirationTtl: 60 * 60 * 24 * 400 });
  return { id: pay.id, status: pay.status, valor: pay.value, vencimento: pay.dueDate, url: pay.bankSlipUrl, fatura: pay.invoiceUrl, nossoNumero: pay.nossoNumero, customer, ...extra };
}
async function detalhesPagamento(id, env) {
  const out = {};
  try { const l = await asaas(env, 'GET', `/payments/${id}/identificationField`); out.linha = l.identificationField; out.codigoBarras = l.barCode; } catch { }
  try { const q = await asaas(env, 'GET', `/payments/${id}/pixQrCode`); out.pix = q.payload; out.pixImagem = q.encodedImage; } catch { }
  return out;
}
async function consultarBoleto(id, env) {
  const p = await asaas(env, 'GET', `/payments/${id}`);
  return { id: p.id, status: p.status, valor: p.value, valorLiquido: p.netValue, vencimento: p.dueDate, pagoEm: p.paymentDate || p.clientPaymentDate || null, url: p.bankSlipUrl, fatura: p.invoiceUrl, nossoNumero: p.nossoNumero };
}
async function emitirNota(n, env) {
  const corpo = {
    payment: n.paymentId || undefined,
    customer: n.paymentId ? undefined : await clienteAsaas(n.cliente || {}, env),
    serviceDescription: n.descricao, observations: n.observacoes || '', externalReference: n.parcelaId,
    value: Number(n.valor), deductions: Number(n.deducoes || 0), effectiveDate: n.data,
    municipalServiceId: n.servico?.id || undefined, municipalServiceCode: n.servico?.codigo || undefined, municipalServiceName: n.servico?.nome || '',
    taxes: n.impostos
  };
  const inv = await asaas(env, 'POST', '/invoices', corpo);
  let st = inv;
  try { st = await asaas(env, 'POST', `/invoices/${inv.id}/authorize`, {}); } catch { /* já agendada para hoje; a prefeitura processará */ }
  return { id: inv.id, status: st.status || inv.status, numero: st.number || null, pdf: st.pdfUrl || null, xml: st.xmlUrl || null };
}

/* ---------- webhook e fila de eventos ---------- */
async function lerEventos(env) { return env.HON ? (await env.HON.get('eventos', 'json')) || [] : []; }
async function gravarEvento(env, ev) {
  if (!env.HON) return;
  const lista = await lerEventos(env);
  if (lista.some(e => e.id === ev.id)) return;
  lista.push(ev);
  await env.HON.put('eventos', JSON.stringify(lista.slice(-MAX_EVENTOS)));
}
function resumo(body) {
  const p = body.payment, i = body.invoice;
  return {
    id: body.id || `${body.event}:${p?.id || i?.id}:${Date.now()}`, evento: body.event, recebidoEm: new Date().toISOString(),
    pagamento: p ? { id: p.id, status: p.status, valor: p.value, valorLiquido: p.netValue, pagoEm: p.paymentDate || p.clientPaymentDate || null, ref: p.externalReference || null, forma: p.billingType } : null,
    nota: i ? { id: i.id, status: i.status, numero: i.number || null, pdf: i.pdfUrl || null, xml: i.xmlUrl || null, pagamento: i.payment || null, ref: i.externalReference || null } : null
  };
}
async function webhook(req, env, ctx) {
  if (!env.WEBHOOK_TOKEN || req.headers.get('asaas-access-token') !== env.WEBHOOK_TOKEN) return new Response('negado', { status: 401 });
  const body = await req.json().catch(() => ({}));
  const ev = resumo(body);
  await gravarEvento(env, ev);
  if ((ev.evento === 'PAYMENT_RECEIVED' || ev.evento === 'PAYMENT_CONFIRMED') && ev.pagamento?.id) ctx.waitUntil(notaAutomatica(ev.pagamento, env));
  return new Response('ok', { status: 200 });
}
async function notaAutomatica(pg, env) {
  const cfg = await env.HON.get('nf:' + pg.id, 'json'); if (!cfg) return;
  await env.HON.delete('nf:' + pg.id);
  try {
    const r = await emitirNota({ ...cfg, paymentId: pg.id, data: new Date().toISOString().slice(0, 10) }, env);
    await gravarEvento(env, { id: 'NF_AUTO:' + pg.id, evento: 'NF_AUTO', recebidoEm: new Date().toISOString(), nota: { ...r, pagamento: pg.id, ref: cfg.parcelaId } });
  } catch (e) {
    await gravarEvento(env, { id: 'NF_AUTO_ERRO:' + pg.id, evento: 'NF_AUTO_ERRO', recebidoEm: new Date().toISOString(), nota: { pagamento: pg.id, ref: cfg.parcelaId, erro: e.message } });
  }
}

/* ---------- utilidades HTTP ---------- */
function corsHeaders(env, req) {
  const origin = req.headers.get('Origin') || '';
  const permitidos = String(env.ALLOWED_ORIGIN || '').split(',').map(s => s.trim()).filter(Boolean);
  return {
    'Access-Control-Allow-Origin': permitidos.includes(origin) ? origin : (permitidos[0] || 'null'),
    'Access-Control-Allow-Methods': 'GET,POST,DELETE,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, x-app-token',
    'Access-Control-Max-Age': '86400', 'Vary': 'Origin'
  };
}
const json = (o, status, headers) => new Response(JSON.stringify(o), { status, headers: { ...headers, 'Content-Type': 'application/json; charset=utf-8' } });
