/* Consultas a fontes públicas e oficiais para a ferramenta de pesquisa do HUB (/publico/...).
   Somente rotas e parâmetros de uma lista fechada são repassados; nada é armazenado.
   Portal da Transparência (CGU): exige a chave gratuita da API, enviada pelo HUB (X-Transparencia-Chave) ou guardada
   no segredo TRANSPARENCIA_KEY. DJEN (CNJ): comunicações processuais por nome da parte. Querido Diário: diários
   oficiais municipais. */

const TRANSP = "https://api.portaldatransparencia.gov.br/api-de-dados/";
const ROTAS_T = {
  "pessoa-fisica": ["cpf", "nis"], "pessoa-juridica": ["cnpj"], "servidores": ["cpf", "nome", "pagina"], "peps": ["cpf", "nome", "pagina"],
  "ceis": ["codigoSancionado", "nomeSancionado", "pagina"], "cnep": ["codigoSancionado", "nomeSancionado", "pagina"],
  "ceaf": ["cpfSancionado", "nomeSancionado", "pagina"], "cepim": ["cnpjSancionado", "nomeSancionado", "pagina"]
};
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36";

async function buscar(url, opc) {
  const ctl = new AbortController(), t = setTimeout(() => ctl.abort(), (opc && opc.timeout || 25) * 1000);
  try {
    const r = await fetch(url, { headers: Object.assign({ "Accept": "application/json", "User-Agent": UA }, (opc && opc.headers) || {}), signal: ctl.signal });
    const txt = await r.text(); let dados = null; try { dados = JSON.parse(txt); } catch (e) { dados = null; }
    return { http: r.status, dados, erro: r.ok ? null : (dados && (dados.Erro || dados.erro || dados.message)) || txt.slice(0, 160) };
  } catch (e) { return { http: 0, dados: null, erro: e && e.name === "AbortError" ? "Tempo esgotado" : "Falha de conexão com a fonte" }; }
  finally { clearTimeout(t); }
}

export async function publico(p, url, req, env) {
  const q = url.searchParams;
  if (p === "/publico/transparencia") {
    const rota = q.get("rota"), permitidos = ROTAS_T[rota];
    if (!permitidos) return { st: 400, corpo: { erro: "Consulta não permitida." } };
    const chave = req.headers.get("X-Transparencia-Chave") || env.TRANSPARENCIA_KEY || "";
    if (!chave) return { st: 400, corpo: { erro: "Informe a chave da API do Portal da Transparência." } };
    const alvo = new URL(TRANSP + rota);
    permitidos.forEach(k => { const v = q.get(k); if (v) alvo.searchParams.set(k, v.slice(0, 120)); });
    if (permitidos.includes("pagina") && !alvo.searchParams.get("pagina")) alvo.searchParams.set("pagina", "1");
    const r = await buscar(alvo.href, { headers: { "chave-api-dados": chave } });
    return { st: 200, corpo: { fonte: "Portal da Transparência (CGU)", rota, url: alvo.href.replace(/chave[^&]*/i, ""), http: r.http, erro: r.erro, dados: r.dados } };
  }
  if (p === "/publico/djen") {
    const nome = (q.get("nome") || "").trim(); if (nome.length < 5) return { st: 400, corpo: { erro: "Informe o nome completo." } };
    const alvo = new URL("https://comunicaapi.pje.jus.br/api/v1/comunicacao");
    alvo.searchParams.set("nomeParte", nome.slice(0, 120)); alvo.searchParams.set("pagina", q.get("pagina") || "1"); alvo.searchParams.set("itensPorPagina", "100");
    if (q.get("desde")) alvo.searchParams.set("dataDisponibilizacaoInicio", q.get("desde"));
    const r = await buscar(alvo.href);
    return { st: 200, corpo: { fonte: "Diário de Justiça Eletrônico Nacional (CNJ)", url: alvo.href, http: r.http, erro: r.erro, dados: r.dados } };
  }
  if (p === "/publico/diarios") {
    const termo = (q.get("q") || "").trim(); if (termo.length < 5) return { st: 400, corpo: { erro: "Informe o termo." } };
    const alvo = new URL("https://api.queridodiario.ok.org.br/gazettes");
    alvo.searchParams.set("querystring", '"' + termo.slice(0, 120).replace(/"/g, "") + '"'); alvo.searchParams.set("excerpt_size", "400"); alvo.searchParams.set("number_of_excerpts", "2"); alvo.searchParams.set("size", "30"); alvo.searchParams.set("sort_by", "descending_date");
    const r = await buscar(alvo.href);
    return { st: 200, corpo: { fonte: "Querido Diário (diários oficiais municipais)", url: alvo.href, http: r.http, erro: r.erro, dados: r.dados } };
  }
  return null;
}
