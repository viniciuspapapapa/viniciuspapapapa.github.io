/* Reforma Tributária (/rtc/...): ponte entre o HUB e a instância oficial da Calculadora de Tributos da Receita Federal
   (piloto-cbs.tributos.gov.br), que roda o mesmo código aberto em github.com/ReceitaFederal/calculadora-rtc-regime-regular
   (licença MIT). A instância oficial não libera CORS para o navegador; o serviço só repassa as chamadas abaixo, com
   limite de tamanho, e devolve a resposta como veio, inclusive o aviso de dados simulados.

   GET  /rtc/versao                         versão do aplicativo e da base oficial
   POST /rtc/calcular                       cálculo com observabilidade (erros por item, sem interromper os demais)
   POST /rtc/base?doc=nfe|nfse              base de cálculo unificada (NF-e/NFC-e ou NFS-e)
   POST /rtc/xml/gerar?tipo=nfe|nfce|nfse   grupos de tributação do documento a partir do resultado do cálculo
   POST /rtc/xml/validar?tipo=..&subtipo=grupo|nota   validação do XML contra o XSD oficial */

const BASE = "https://piloto-cbs.tributos.gov.br/servico/calculadora-consumo/api/calculadora";
const MAX = 4 * 1024 * 1024;
const TIPOS = new Set(["nfe", "nfce", "nfse", "cte", "cte-simplificado", "bpe", "bpe-tm", "nf3e", "nfcom"]);

async function repassar(url, opc, cors) {
  const ctl = new AbortController(), tm = setTimeout(() => ctl.abort(), 45000);
  try {
    const r = await fetch(url, Object.assign({ signal: ctl.signal, headers: Object.assign({ Accept: "application/json, application/xml;q=0.9, */*;q=0.5", "User-Agent": "Mozilla/5.0 (HUB TPC; calculadora da reforma tributaria)" }, opc.headers || {}) }, opc.body ? { method: "POST", body: opc.body } : {}));
    const corpo = await r.arrayBuffer(), tipo = r.headers.get("content-type") || "application/json";
    if (/text\/html/i.test(tipo) && !r.ok) return new Response(JSON.stringify({ erro: "A calculadora oficial recusou a consulta (HTTP " + r.status + ")." }), { status: 502, headers: Object.assign({ "Content-Type": "application/json; charset=utf-8" }, cors) });
    if (/text\/html/i.test(tipo)) return new Response(JSON.stringify({ erro: "A calculadora oficial recusou a consulta (filtro de segurança do servidor da Receita)." }), { status: 502, headers: Object.assign({ "Content-Type": "application/json; charset=utf-8" }, cors) });
    const h = Object.assign({ "Content-Type": tipo, "Cache-Control": "no-store", "Access-Control-Expose-Headers": "X-Warning-Dados-Simulados" }, cors);
    const av = r.headers.get("x-warning-dados-simulados"); if (av) h["X-Warning-Dados-Simulados"] = av;
    return new Response(corpo, { status: r.status, headers: h });
  } catch (e) {
    return new Response(JSON.stringify({ erro: e.name === "AbortError" ? "A calculadora oficial não respondeu a tempo." : "A calculadora oficial está indisponível (" + (e.message || e) + ")." }), { status: 504, headers: Object.assign({ "Content-Type": "application/json; charset=utf-8" }, cors) });
  } finally { clearTimeout(tm); }
}

export async function rtc(p, req, cors) {
  const u = new URL(req.url), q = u.searchParams;
  const corpo = async () => {
    const t = await req.arrayBuffer();
    if (!t.byteLength) throw new Error("Corpo vazio.");
    if (t.byteLength > MAX) throw new Error("Conteúdo acima de 4 MB.");
    return t;
  };
  const erro = (m, st) => new Response(JSON.stringify({ erro: m }), { status: st || 400, headers: Object.assign({ "Content-Type": "application/json; charset=utf-8" }, cors) });
  try {
    if (p === "/rtc/versao" && req.method === "GET") return repassar(BASE + "/dados-abertos/versao", {}, cors);
    if (req.method !== "POST") return null;
    if (p === "/rtc/calcular") return repassar(BASE + "/observabilidade/regime-geral", { body: await corpo(), headers: { "Content-Type": "application/json" } }, cors);
    if (p === "/rtc/base") return repassar(BASE + "/base-calculo/" + (q.get("doc") === "nfse" ? "base-calculo-unificada-nfse" : "base-calculo-unificada"), { body: await corpo(), headers: { "Content-Type": "application/json" } }, cors);
    if (p === "/rtc/xml/gerar") {
      const tipo = q.get("tipo") || "nfe"; if (!TIPOS.has(tipo)) return erro("Tipo de documento inválido.");
      return repassar(BASE + "/xml/generate?tipo=" + tipo, { body: await corpo(), headers: { "Content-Type": "application/json" } }, cors);
    }
    if (p === "/rtc/xml/validar") {
      const tipo = q.get("tipo") || "nfe", sub = q.get("subtipo") === "nota" ? "nota" : "grupo"; if (!TIPOS.has(tipo)) return erro("Tipo de documento inválido.");
      return repassar(BASE + "/xml/validate?tipo=" + tipo + "&subtipo=" + sub, { body: await corpo(), headers: { "Content-Type": "application/xml" } }, cors);
    }
  } catch (e) { return erro(e.message || String(e)); }
  return null;
}
