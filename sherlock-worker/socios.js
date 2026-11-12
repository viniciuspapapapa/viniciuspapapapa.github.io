/* Índice de sócios da Receita Federal para a ferramenta "Rede de empresas e sócios" do HUB (/socios/...).

   O fluxo bases-socios.yml processa todo mês os arquivos de sócios dos dados abertos do CNPJ e publica, como arquivos de
   uma "release" do GitHub (fora do histórico do repositório), o índice dividido em partes cifradas com a chave do HUB
   (socios.bin) e a tabela de posições de cada parte (socios.idx). Este serviço lê do arquivo apenas o trecho da parte
   pedida (requisição por faixa de bytes) e o devolve ainda cifrado: só o navegador, com a senha do HUB, abre o conteúdo. */

const REPO = "viniciuspapapapa/viniciuspapapapa.github.io", TAG = "bases-socios";
const URL_BIN = `https://github.com/${REPO}/releases/download/${TAG}/socios.bin`;
const URL_IDX = `https://github.com/${REPO}/releases/download/${TAG}/socios.idx`;
let IDX = null, IDX_ATE = 0;

async function indice() {
  if (IDX && IDX_ATE > Date.now()) return IDX;
  const r = await fetch(URL_IDX, { headers: { "User-Agent": "hub-tpc-socios" } });
  if (r.status === 404) throw Object.assign(new Error("O índice de sócios ainda não foi gerado (fluxo Base de sócios da Receita)."), { st: 503 });
  if (!r.ok) throw new Error("Índice indisponível (HTTP " + r.status + ").");
  IDX = await r.json(); IDX_ATE = Date.now() + 3600000; return IDX;
}

export async function socios(p, req, cors) {
  if (p === "/socios/info") {
    try { const i = await indice(); return new Response(JSON.stringify({ mes: i.mes, gerado: i.gerado, partes: i.n, linhas: i.linhas }), { headers: Object.assign({ "Content-Type": "application/json; charset=utf-8" }, cors) }); }
    catch (e) { return new Response(JSON.stringify({ erro: e.message }), { status: e.st || 502, headers: Object.assign({ "Content-Type": "application/json; charset=utf-8" }, cors) }); }
  }
  if (p !== "/socios/parte") return null;
  const n = +new URL(req.url).searchParams.get("n");
  try {
    const i = await indice();
    if (!Number.isInteger(n) || n < 0 || n >= i.n) return new Response(JSON.stringify({ erro: "Parte inválida." }), { status: 400, headers: Object.assign({ "Content-Type": "application/json" }, cors) });
    const [ini, tam] = i.pos[n];
    if (!tam) return new Response(new Uint8Array(0), { headers: Object.assign({ "Content-Type": "application/octet-stream", "X-Mes": i.mes }, cors) });
    const r = await fetch(URL_BIN, { headers: { Range: "bytes=" + ini + "-" + (ini + tam - 1), "User-Agent": "hub-tpc-socios" } });
    if (r.status !== 206 && r.status !== 200) throw new Error("Arquivo do índice indisponível (HTTP " + r.status + ").");
    let corpo = new Uint8Array(await r.arrayBuffer());
    if (r.status === 200) corpo = corpo.slice(ini, ini + tam); /* servidor sem suporte a faixa: recorta aqui */
    return new Response(corpo, { headers: Object.assign({ "Content-Type": "application/octet-stream", "Cache-Control": "private, max-age=3600", "X-Mes": i.mes, "Access-Control-Expose-Headers": "X-Mes" }, cors) });
  } catch (e) { return new Response(JSON.stringify({ erro: e.message || String(e) }), { status: e.st || 502, headers: Object.assign({ "Content-Type": "application/json; charset=utf-8" }, cors) }); }
}
