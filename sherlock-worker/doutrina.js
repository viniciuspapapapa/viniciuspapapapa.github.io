/* Atualização da base da Pesquisa doutrinária do HUB (/doutrina/...).
   O botão "Atualizar base" pede a este serviço que dispare o fluxo doutrina.yml no GitHub Actions; o serviço também
   informa o estado da última execução. Exige o segredo GITHUB_TOKEN: um token "fine-grained" do GitHub restrito a
   este repositório, com a permissão Actions: Read and write. Nada mais é feito com o token. */

const REPO_PADRAO = "viniciuspapapapa/viniciuspapapapa.github.io";
const FLUXO = "doutrina.yml";

async function gh(env, caminho, opc) {
  const r = await fetch("https://api.github.com/repos/" + (env.GITHUB_REPO || REPO_PADRAO) + caminho, Object.assign({}, opc || {}, {
    headers: Object.assign({ "Accept": "application/vnd.github+json", "Authorization": "Bearer " + env.GITHUB_TOKEN, "X-GitHub-Api-Version": "2022-11-28", "User-Agent": "hub-tpc-doutrina" }, (opc && opc.headers) || {})
  }));
  let dados = null; try { dados = r.status === 204 ? null : await r.json(); } catch (e) { dados = null; }
  return { st: r.status, ok: r.ok, dados };
}
async function ultima(env) {
  const r = await gh(env, "/actions/workflows/" + FLUXO + "/runs?per_page=1");
  if (!r.ok) return { erro: r.st === 404 ? "O fluxo da base doutrinária não foi encontrado no repositório." : r.st === 401 || r.st === 403 ? "O token do GitHub do serviço é inválido ou não tem permissão de Actions." : "GitHub indisponível (HTTP " + r.st + ")." };
  const run = r.dados && r.dados.workflow_runs && r.dados.workflow_runs[0];
  return run ? { estado: run.status, conclusao: run.conclusion, iniciado: run.run_started_at || run.created_at, atualizado: run.updated_at, evento: run.event, url: run.html_url } : { estado: null };
}

/* PDF original para o visualizador do HUB: o navegador nem sempre recebe do Drive a permissão de leitura (CORS).
   Só repassa arquivos que estejam na pasta de doutrina (ou nas suas subpastas), para não servir de intermediário
   aberto. A lista da pasta fica em cache por alguns minutos. */
const PASTA_PADRAO = "1gfp6mt_FsaxZC1Lj9FW40btN5XQwR5G3";
let CACHE_PASTA = { ate: 0, ids: new Set() };
async function idsDaPasta(env) {
  if (CACHE_PASTA.ate > Date.now()) return CACHE_PASTA.ids;
  const ids = new Set(), vistos = new Set(), fila = [env.DOUTRINA_PASTA || PASTA_PADRAO];
  while (fila.length && vistos.size < 30) {
    const id = fila.shift(); if (vistos.has(id)) continue; vistos.add(id);
    const r = await fetch("https://drive.google.com/embeddedfolderview?id=" + encodeURIComponent(id), { headers: { "User-Agent": "Mozilla/5.0" } });
    if (!r.ok) continue;
    const html = await r.text(), re = /<div class="flip-entry" id="entry-([A-Za-z0-9_-]+)"[\s\S]*?<a href="([^"]+)"/g; let m;
    while ((m = re.exec(html))) { if (/\/folders\//.test(m[2])) fila.push(m[1]); else ids.add(m[1]); }
  }
  CACHE_PASTA = { ate: Date.now() + 5 * 60000, ids };
  return ids;
}
async function pdf(url, cors) {
  const id = url.searchParams.get("id") || "";
  if (!/^[A-Za-z0-9_-]{20,80}$/.test(id)) return new Response(JSON.stringify({ erro: "Arquivo inválido." }), { status: 400, headers: Object.assign({ "Content-Type": "application/json" }, cors) });
  return { id };
}

export async function doutrinaPdf(url, env, cors) {
  const v = await pdf(url, cors); if (v instanceof Response) return v;
  const ids = await idsDaPasta(env);
  if (!ids.has(v.id)) return new Response(JSON.stringify({ erro: "Arquivo fora da pasta de doutrina." }), { status: 403, headers: Object.assign({ "Content-Type": "application/json" }, cors) });
  const r = await fetch("https://drive.usercontent.google.com/download?id=" + encodeURIComponent(v.id) + "&export=download&confirm=t", { headers: { "User-Agent": "Mozilla/5.0" } });
  if (!r.ok) return new Response(JSON.stringify({ erro: "O Drive não entregou o arquivo (HTTP " + r.status + ")." }), { status: 502, headers: Object.assign({ "Content-Type": "application/json" }, cors) });
  const h = Object.assign({ "Content-Type": "application/pdf", "Cache-Control": "private, max-age=3600" }, cors);
  if (r.headers.get("content-length")) h["Content-Length"] = r.headers.get("content-length");
  return new Response(r.body, { status: 200, headers: h });
}

export async function doutrina(p, req, env) {
  if (p !== "/doutrina/status" && p !== "/doutrina/atualizar") return null;
  if (!env.GITHUB_TOKEN) return { st: 503, corpo: { erro: "Cadastre o segredo GITHUB_TOKEN no serviço sherlock-tpc para habilitar a atualização pelo HUB." } };
  if (p === "/doutrina/status") { const u = await ultima(env); return { st: u.erro ? 502 : 200, corpo: u }; }
  if (req.method !== "POST") return { st: 405, corpo: { erro: "Use POST." } };
  const u = await ultima(env);
  if (u.erro) return { st: 502, corpo: u };
  if (["queued", "in_progress", "waiting", "pending", "requested"].includes(u.estado)) return { st: 200, corpo: { ok: true, jaEmAndamento: true, execucao: u } };
  const r = await gh(env, "/actions/workflows/" + FLUXO + "/dispatches", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ref: "main" }) });
  if (!r.ok) return { st: 502, corpo: { erro: r.st === 401 || r.st === 403 ? "O token do GitHub do serviço não tem permissão para disparar o fluxo (Actions: Read and write)." : "Não foi possível disparar a atualização (HTTP " + r.st + ")." } };
  return { st: 200, corpo: { ok: true, jaEmAndamento: false, execucao: { estado: "queued", iniciado: new Date().toISOString() } } };
}
