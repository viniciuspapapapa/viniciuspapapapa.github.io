/* =========================================================
   Relatório processual · TPC Advogados
   Serviço intermediário (Cloudflare Worker) para a API Pública do DataJud (CNJ).

   O DataJud não envia o cabeçalho Access-Control-Allow-Origin, por isso o navegador bloqueia a consulta feita
   diretamente pela página do HUB. Este Worker recebe o número do processo, identifica o tribunal pelo próprio
   número (padrão CNJ NNNNNNN-DD.AAAA.J.TR.OOOO), consulta o DataJud e devolve as movimentações com CORS liberado
   apenas para a origem do HUB.

   Variáveis (Settings > Variables and Secrets):
     DATAJUD_API_KEY  (secret, opcional)  chave pública do DataJud; se ausente, usa a chave pública vigente
     APP_TOKEN        (secret, opcional)  senha compartilhada com o HUB; se definida, é exigida no cabeçalho x-app-token
     ALLOWED_ORIGIN   (texto)             https://viniciuspapapapa.github.io
   ========================================================= */

const BASE = 'https://api-publica.datajud.cnj.jus.br';
/* Chave pública divulgada pelo CNJ em https://datajud-wiki.cnj.jus.br/api-publica/acesso (pode ser alterada pelo CNJ). */
const CHAVE_PUBLICA = 'cDZHYzlZa0JadVREZDJCendQbXY6SkJlTzNjLV9TRENyQk1RdnFKZGRQdw==';

const UF_TJ = { '01': 'ac', '02': 'al', '03': 'ap', '04': 'am', '05': 'ba', '06': 'ce', '07': 'dft', '08': 'es', '09': 'go', '10': 'ma', '11': 'mt', '12': 'ms', '13': 'mg', '14': 'pa', '15': 'pb', '16': 'pr', '17': 'pe', '18': 'pi', '19': 'rj', '20': 'rn', '21': 'rs', '22': 'ro', '23': 'rr', '24': 'sc', '25': 'se', '26': 'sp', '27': 'to' };

/* Endpoints conforme https://datajud-wiki.cnj.jus.br/api-publica/endpoints */
export function aliasDoNumero(numero) {
  const d = String(numero || '').replace(/\D/g, '');
  if (d.length !== 20) return null;
  const j = d[13], tr = d.slice(14, 16);
  if (j === '3') return 'stj';
  if (j === '4') return +tr >= 1 && +tr <= 6 ? 'trf' + (+tr) : null;
  if (j === '5') return tr === '00' ? 'tst' : +tr >= 1 && +tr <= 24 ? 'trt' + (+tr) : null;
  if (j === '6') return tr === '00' ? 'tse' : UF_TJ[tr] ? 'tre-' + UF_TJ[tr] : null;
  if (j === '7') return 'stm';
  if (j === '8') return UF_TJ[tr] ? 'tj' + UF_TJ[tr] : null;
  if (j === '9') return { '13': 'tjmmg', '21': 'tjmrs', '26': 'tjmsp' }[tr] || null;
  return null;
}

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    const cors = corsHeaders(env, req);
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
    try {
      if (env.APP_TOKEN && req.headers.get('x-app-token') !== env.APP_TOKEN) return json({ erro: 'Não autorizado.' }, 401, cors);
      const p = url.pathname.replace(/\/+$/, '') || '/';
      if (p === '/status' || p === '/') return json({ ok: true, servico: 'datajud', origem: env.ALLOWED_ORIGIN || '*' }, 200, cors);
      if (p === '/consulta' && req.method === 'POST') {
        const corpo = await req.json().catch(() => ({}));
        const numero = String(corpo.numero || '').replace(/\D/g, '');
        if (numero.length !== 20) return json({ erro: 'Número de processo inválido: informe os 20 dígitos do padrão CNJ.' }, 400, cors);
        const alias = corpo.tribunal ? String(corpo.tribunal).toLowerCase().replace(/[^a-z0-9-]/g, '') : aliasDoNumero(numero);
        if (!alias) return json({ erro: 'Não foi possível identificar o tribunal pelo número. O STF não integra a API Pública do DataJud.' }, 400, cors);
        const consultar = () => fetch(`${BASE}/api_publica_${alias}/_search`, {
          method: 'POST',
          headers: { 'Authorization': 'APIKey ' + (env.DATAJUD_API_KEY || CHAVE_PUBLICA), 'Content-Type': 'application/json', 'User-Agent': 'TPC-Relatorio/1.0' },
          body: JSON.stringify({ size: 10, query: { match: { numeroProcesso: numero } } })
        });
        /* o DataJud devolve 429 quando sobrecarregado: até duas novas tentativas */
        let r = await consultar();
        for (let i = 1; i <= 2 && (r.status === 429 || r.status >= 500); i++) { await new Promise(ok => setTimeout(ok, 1200 * i)); r = await consultar(); }
        const txt = await r.text();
        let data = null; try { data = JSON.parse(txt); } catch { data = null; }
        if (!r.ok || !data) return json({ erro: r.status === 429 ? 'O DataJud está sobrecarregado no momento. Tente novamente em alguns instantes.' : `O DataJud respondeu ${r.status}.`, detalhe: txt.slice(0, 300) }, 502, cors);
        const processos = (data.hits?.hits || []).map(h => h._source);
        return json({ numero, tribunal: alias, processos, consultadoEm: new Date().toISOString() }, 200, cors);
      }
      return json({ erro: 'Rota inexistente.' }, 404, cors);
    } catch (e) {
      return json({ erro: e.message || String(e) }, 502, cors);
    }
  }
};

function corsHeaders(env, req) {
  const origem = req.headers.get('Origin') || '';
  const permitida = env.ALLOWED_ORIGIN || '*';
  return {
    'Access-Control-Allow-Origin': permitida === '*' ? '*' : (origem === permitida ? origem : permitida),
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, x-app-token',
    'Access-Control-Max-Age': '86400',
    'Vary': 'Origin'
  };
}
function json(obj, status, headers) {
  return new Response(JSON.stringify(obj), { status: status || 200, headers: Object.assign({ 'Content-Type': 'application/json; charset=utf-8' }, headers) });
}
