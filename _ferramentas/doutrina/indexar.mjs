/* Indexador da Pesquisa doutrinária do HUB TPC.
   Lê a pasta pública do Google Drive com os livros do escritório (e as subpastas, que viram áreas temáticas),
   baixa somente os livros novos ou alterados, extrai o texto de cada página, aplica OCR (Tesseract, português)
   às páginas escaneadas ou ilegíveis, identifica a página impressa da obra e grava a base cifrada com a mesma
   chave do HUB (AES-256-GCM; PBKDF2 sobre a senha do escritório e o sal de hub/acesso.json).

   O texto integral das obras nunca é publicado em claro: a base fica no ramo "doutrina-base", cifrada, e o texto
   em claro fica apenas no cache privado do GitHub Actions (pasta de trabalho), para evitar refazer o OCR.

   Uso (no GitHub Actions; requer poppler-utils e tesseract-ocr-por):
     HUB_SENHA='...' node _ferramentas/doutrina/indexar.mjs
   Variáveis opcionais:
     DOUTRINA_PASTA     ID da pasta do Drive (padrão: pasta de doutrina do escritório)
     DOUTRINA_SAIDA     pasta da base cifrada (padrão: base-doutrina)
     DOUTRINA_TRABALHO  pasta de trabalho com o texto em claro (padrão: trabalho-doutrina)
     DOUTRINA_LIMITE    minutos de processamento por execução (padrão: 300)
     DOUTRINA_REFAZER   "todos" ou IDs separados por vírgula, para reprocessar
     DOUTRINA_SO        IDs separados por vírgula, para processar apenas esses livros (testes) */
import { promises as fs } from "node:fs";
import path from "node:path";
import os from "node:os";
import zlib from "node:zlib";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { webcrypto as wc, createHash } from "node:crypto";
import { ilegivel, paginasImpressas, limpar, metadados } from "./texto.mjs";

const sh = promisify(execFile);
const gzip = promisify(zlib.gzip), gunzip = promisify(zlib.gunzip);
const RAIZ = path.resolve(path.dirname(new URL(import.meta.url).pathname), "../..");
const PASTA = process.env.DOUTRINA_PASTA || "1gfp6mt_FsaxZC1Lj9FW40btN5XQwR5G3";
const SAIDA = path.resolve(process.env.DOUTRINA_SAIDA || "base-doutrina");
const TRAB = path.resolve(process.env.DOUTRINA_TRABALHO || "trabalho-doutrina");
const LIMITE_MS = (+process.env.DOUTRINA_LIMITE || 300) * 60000;
const REFAZER = String(process.env.DOUTRINA_REFAZER || "").split(",").map(s => s.trim()).filter(Boolean);
const NUCLEOS = Math.max(1, Math.min(8, os.cpus().length));
const UA = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36";
const VERSAO_FORMATO = 1;
const inicio = Date.now();
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);

/* ------------------------------------------------------------------ chave */
const senha = process.env.HUB_SENHA || "";
if (senha.length < 10) { console.error("Defina HUB_SENHA (a senha do HUB)."); process.exit(1); }
const acesso = JSON.parse(await fs.readFile(path.join(RAIZ, "hub", "acesso.json"), "utf8"));
const de64 = s => new Uint8Array(Buffer.from(s, "base64"));
const base = await wc.subtle.importKey("raw", new TextEncoder().encode(senha), "PBKDF2", false, ["deriveKey"]);
const chave = await wc.subtle.deriveKey({ name: "PBKDF2", salt: de64(acesso.sal), iterations: acesso.iteracoes, hash: "SHA-256" }, base, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
{ const v = de64(acesso.verificador); try { await wc.subtle.decrypt({ name: "AES-GCM", iv: v.slice(0, 12) }, chave, v.slice(12)); } catch (e) { console.error("HUB_SENHA não corresponde à senha publicada do HUB."); process.exit(1); } }
const marcaChave = createHash("sha256").update(acesso.sal + acesso.verificador).digest("hex").slice(0, 12);
async function cifrar(obj) {
  const dados = await gzip(Buffer.from(JSON.stringify(obj)), { level: 9 });
  const iv = wc.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await wc.subtle.encrypt({ name: "AES-GCM", iv }, chave, dados));
  const out = new Uint8Array(12 + ct.length); out.set(iv); out.set(ct, 12); return out;
}
async function decifrar(bytes) {
  const b = new Uint8Array(bytes);
  return JSON.parse((await gunzip(Buffer.from(await wc.subtle.decrypt({ name: "AES-GCM", iv: b.slice(0, 12) }, chave, b.slice(12))))).toString("utf8"));
}

/* ------------------------------------------------------------------ Drive */
async function obter(url, opc, tentativas = 4) {
  for (let i = 0; ; i++) {
    try {
      const r = await fetch(url, Object.assign({ headers: { "User-Agent": UA } }, opc || {}));
      if (r.status >= 500 || r.status === 429) throw new Error("HTTP " + r.status);
      return r;
    } catch (e) { if (i >= tentativas - 1) throw e; await new Promise(ok => setTimeout(ok, 2000 * 2 ** i)); }
  }
}
const ent = s => s.replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">");
async function listarPasta(id, area, vistos = new Set()) {
  if (vistos.has(id)) return []; vistos.add(id);
  const r = await obter("https://drive.google.com/embeddedfolderview?id=" + encodeURIComponent(id));
  if (!r.ok) throw new Error("Não foi possível ler a pasta do Drive (HTTP " + r.status + "). Confira se o compartilhamento está como \"Qualquer pessoa com o link\".");
  const html = await r.text(), out = [];
  const re = /<div class="flip-entry" id="entry-([A-Za-z0-9_-]+)"[\s\S]*?<a href="([^"]+)"[\s\S]*?<div class="flip-entry-title">([^<]*)<\/div>/g;
  let m;
  while ((m = re.exec(html))) {
    const [, fid, href, titulo] = m, nome = ent(titulo).trim();
    if (/\/folders\//.test(href)) out.push(...await listarPasta(fid, nome, vistos));
    else if (/\.pdf$/i.test(nome) || /application\/pdf/.test(html.slice(m.index, m.index + 1500))) out.push({ id: fid, arquivo: nome, area: area || "" });
  }
  return out;
}
const urlBaixar = id => "https://drive.usercontent.google.com/download?id=" + encodeURIComponent(id) + "&export=download&confirm=t";
async function tamanho(id) {
  const r = await obter(urlBaixar(id), { headers: { "User-Agent": UA, Range: "bytes=0-0" } });
  const cr = r.headers.get("content-range") || ""; try { await r.arrayBuffer(); } catch (e) { /* ignora */ }
  const m = cr.match(/\/(\d+)$/); return m ? +m[1] : 0;
}
async function baixar(id, destino) {
  const r = await obter(urlBaixar(id));
  if (!r.ok) throw new Error("download HTTP " + r.status);
  const buf = Buffer.from(await r.arrayBuffer());
  if (buf.slice(0, 5).toString() !== "%PDF-") throw new Error("o Drive não entregou um PDF (arquivo grande demais para download direto, ou acesso restrito)");
  await fs.writeFile(destino, buf); return buf.length;
}

/* ------------------------------------------------------------------ texto e OCR */
async function paginasPdf(arq) {
  const { stdout } = await sh("pdfinfo", [arq], { maxBuffer: 1 << 24 });
  const m = stdout.match(/^Pages:\s+(\d+)/m); return m ? +m[1] : 0;
}
async function textoPdf(arq) {
  const { stdout } = await sh("pdftotext", ["-enc", "UTF-8", arq, "-"], { maxBuffer: 1 << 30 });
  return stdout.split("\f");
}
async function ocrPagina(arq, p, tmp) {
  const img = path.join(tmp, "p" + p);
  await sh("pdftoppm", ["-f", String(p), "-l", String(p), "-r", "300", "-gray", "-png", "-singlefile", arq, img], { maxBuffer: 1 << 26 });
  try {
    const { stdout } = await sh("tesseract", [img + ".png", "-", "-l", "por", "--psm", "3"], { maxBuffer: 1 << 26, env: Object.assign({}, process.env, { OMP_THREAD_LIMIT: "1" }) });
    return stdout;
  } finally { await fs.rm(img + ".png", { force: true }); }
}
async function emParalelo(itens, n, fn) {
  let i = 0; const trabalhadores = Array.from({ length: Math.min(n, itens.length) }, async () => { while (i < itens.length) { const k = i++; await fn(itens[k], k); } });
  await Promise.all(trabalhadores);
}

/* ------------------------------------------------------------------ processamento de um livro */
async function processar(livro, tmp) {
  const arq = path.join(tmp, livro.id + ".pdf");
  log("Baixando", livro.arquivo);
  const bytes = await baixar(livro.id, arq);
  try {
    const n = await paginasPdf(arq);
    let textos = await textoPdf(arq);
    textos = textos.slice(0, n); while (textos.length < n) textos.push("");
    const ocr = []; textos.forEach((t, i) => { if (ilegivel(t)) ocr.push(i + 1); });
    if (ocr.length) {
      log("OCR de", ocr.length, "de", n, "páginas em", NUCLEOS, "processos");
      let feitas = 0;
      await emParalelo(ocr, NUCLEOS, async p => {
        try { const t = await ocrPagina(arq, p, tmp); if (t.replace(/\s+/g, "").length > textos[p - 1].replace(/\s+/g, "").length) textos[p - 1] = t; } catch (e) { /* mantém o texto original */ }
        if (++feitas % 50 === 0) log("  OCR", feitas + "/" + ocr.length);
      });
    }
    const impressas = paginasImpressas(textos), limpos = limpar(textos);
    const paginas = limpos.map((t, i) => [i + 1, impressas[i], t]);
    return { id: livro.id, arquivo: livro.arquivo, area: livro.area, tamanho: bytes, paginas: n, ocr: ocr.length, meta: metadados(textos, livro.arquivo), texto: paginas };
  } finally { await fs.rm(arq, { force: true }); }
}

/* ------------------------------------------------------------------ execução */
await fs.mkdir(path.join(SAIDA, "livros"), { recursive: true });
await fs.mkdir(TRAB, { recursive: true });
const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "doutrina-"));

let anterior = null;
try { anterior = await decifrar(await fs.readFile(path.join(SAIDA, "manifesto.bin"))); } catch (e) { anterior = null; }
const chaveMudou = !anterior || anterior.chave !== marcaChave;
const antes = new Map(((anterior && anterior.livros) || []).map(l => [l.id, l]));

log("Lendo a pasta do Drive", PASTA);
const SO = String(process.env.DOUTRINA_SO || "").split(",").filter(Boolean);
const lista = (await listarPasta(PASTA, "")).filter(l => !SO.length || SO.includes(l.id));
log(lista.length, "PDFs encontrados");
const livros = [], pendentes = [], erros = [];
let processados = 0;
for (const item of lista) {
  let tam = 0; try { tam = await tamanho(item.id); } catch (e) { tam = 0; }
  const cacheArq = path.join(TRAB, item.id + ".json.gz");
  let dados = null; try { dados = JSON.parse((await gunzip(await fs.readFile(cacheArq))).toString("utf8")); } catch (e) { dados = null; }
  const refazer = REFAZER.includes("todos") || REFAZER.includes(item.id);
  const valido = dados && dados.formato === VERSAO_FORMATO && (!tam || dados.tamanho === tam) && !refazer;
  if (!valido) {
    if (Date.now() - inicio > LIMITE_MS) { pendentes.push(item.arquivo); const a = antes.get(item.id); if (a) livros.push(Object.assign({}, a, { area: item.area, arquivo: item.arquivo })); continue; }
    try { dados = Object.assign({ formato: VERSAO_FORMATO }, await processar(item, tmp)); await fs.writeFile(cacheArq, await gzip(Buffer.from(JSON.stringify(dados)))); processados++; }
    catch (e) { log("Falha em", item.arquivo + ":", e.message); erros.push({ arquivo: item.arquivo, erro: String(e.message || e).slice(0, 200) }); const a = antes.get(item.id); if (a) livros.push(a); continue; }
  }
  dados.area = item.area; dados.arquivo = item.arquivo;
  const conteudo = { id: dados.id, paginas: dados.texto };
  const v = createHash("sha256").update(JSON.stringify(conteudo)).digest("hex").slice(0, 16);
  const destino = path.join(SAIDA, "livros", item.id + ".bin"), a = antes.get(item.id);
  let existe = false; try { await fs.access(destino); existe = true; } catch (e) { existe = false; }
  if (chaveMudou || !a || a.v !== v || !existe) await fs.writeFile(destino, await cifrar(conteudo));
  const bin = (await fs.stat(destino)).size;
  livros.push({ id: dados.id, arquivo: dados.arquivo, area: dados.area, paginas: dados.paginas, ocr: dados.ocr, impressas: dados.texto.filter(p => p[1]).length, meta: dados.meta, v, bytes: bin });
}
/* remove da base os livros que saíram do Drive */
const ids = new Set(lista.map(l => l.id));
for (const f of await fs.readdir(path.join(SAIDA, "livros"))) if (!ids.has(f.replace(/\.bin$/, ""))) await fs.rm(path.join(SAIDA, "livros", f), { force: true });
for (const f of await fs.readdir(TRAB)) if (!ids.has(f.replace(/\.json\.gz$/, ""))) await fs.rm(path.join(TRAB, f), { force: true });

const manifesto = { formato: VERSAO_FORMATO, chave: marcaChave, atualizado: new Date().toISOString(), pasta: PASTA, livros, pendentes, erros };
await fs.writeFile(path.join(SAIDA, "manifesto.bin"), await cifrar(manifesto));
await fs.writeFile(path.join(SAIDA, "LEIA-ME.md"), "# Base da Pesquisa doutrinária do HUB TPC\n\nArquivos cifrados (AES-256-GCM) gerados automaticamente pelo fluxo `doutrina.yml`. Não edite este ramo.\n");
await fs.rm(tmp, { recursive: true, force: true });
log("Base gravada:", livros.length, "livros;", processados, "processados nesta execução;", pendentes.length, "pendentes;", erros.length, "com erro.");
if (process.env.GITHUB_STEP_SUMMARY) await fs.appendFile(process.env.GITHUB_STEP_SUMMARY, "### Pesquisa doutrinária\n\n" + livros.length + " livros na base, " + processados + " processados nesta execução, " + pendentes.length + " pendentes, " + erros.length + " com erro.\n" + erros.map(e => "\n- " + e.arquivo + ": " + e.erro).join("") + "\n");
