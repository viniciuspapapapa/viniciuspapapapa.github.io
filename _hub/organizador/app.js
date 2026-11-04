/* Organizador de Documentos: anexos e Google Drive -> PDF único com capas institucionais (montagem),
   ou substituição das capas de um PDF já montado (recapa). */
import Anthropic from "https://cdn.jsdelivr.net/npm/@anthropic-ai/sdk@1.1.0/+esm";

const C = window.CAPA_TPC, G = window.DRIVE, esc = window.HUB.esc;
const $ = s => document.querySelector(s);
if (window.pdfjsLib) window.pdfjsLib.GlobalWorkerOptions.workerSrc = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
const A4 = [595.276, 841.89];
const MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
const K_CHAVE = "hub_claude_chave", K_GKEY = "org_google_api_key", K_GCLIENT = "org_google_client_id";
const ler = k => { try { return localStorage.getItem(k); } catch (e) { return null; } };
const gravar = (k, v) => { try { v ? localStorage.setItem(k, v) : localStorage.removeItem(k); } catch (e) { /* ignora */ } };

const E = { modo: "montagem", docs: [], seq: 0, recapa: null, saida: null, recursos: null };

/* ------------------------------------------------------------------ utilidades */
const nomeLimpo = n => n.replace(/\.[^.]+$/, "").replace(/[_]+/g, " ").replace(/\s+/g, " ").trim();
const ePdf = (nome, tipo) => /\.pdf$/i.test(nome) || tipo === "application/pdf";
async function recursos() {
  if (E.recursos) return E.recursos;
  const b = async u => new Uint8Array(await (await fetch(u)).arrayBuffer());
  const [light, regular, bold, logo] = await Promise.all(["../assets/fonts/Lato-Light.ttf", "../assets/fonts/Lato-Regular.ttf", "../assets/fonts/Lato-Bold.ttf", "../assets/tpc-logo-completo.png"].map(b));
  return (E.recursos = { light, regular, bold, logo });
}
async function abrirPdf(bytes) { return window.pdfjsLib.getDocument({ data: new Uint8Array(bytes.slice(0)) }).promise; }
async function renderPg(pdfDoc, n, largura) {
  const pg = await pdfDoc.getPage(n), vp0 = pg.getViewport({ scale: 1 }), vp = pg.getViewport({ scale: largura / vp0.width });
  const c = document.createElement("canvas"); c.width = Math.round(vp.width); c.height = Math.round(vp.height);
  await pg.render({ canvasContext: c.getContext("2d"), viewport: vp }).promise; return c;
}
/* imagem com orientação EXIF aplicada e rotação adicional; devolve canvas no tamanho original */
async function imagemCanvas(bytes, tipo, rot, maxLado) {
  const bmp = await createImageBitmap(new Blob([bytes], { type: tipo || "image/jpeg" }), { imageOrientation: "from-image" });
  let w = bmp.width, h = bmp.height;
  const esc2 = maxLado ? Math.min(1, maxLado / Math.max(w, h)) : 1; w = Math.round(w * esc2); h = Math.round(h * esc2);
  const r = ((rot % 360) + 360) % 360, troca = r === 90 || r === 270;
  const c = document.createElement("canvas"); c.width = troca ? h : w; c.height = troca ? w : h;
  const ctx = c.getContext("2d"); ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, c.width, c.height);
  ctx.translate(c.width / 2, c.height / 2); ctx.rotate(r * Math.PI / 180); ctx.drawImage(bmp, -w / 2, -h / 2, w, h);
  bmp.close && bmp.close();
  return c;
}
const canvasJpeg = (c, q) => new Promise(res => c.toBlob(b => b.arrayBuffer().then(res), "image/jpeg", q));
function mesAtual() { const d = new Date(); return MESES[d.getMonth()] + " de " + d.getFullYear(); }
function rodape() { const cid = $("#rCidade").value.trim(), mes = $("#rMes").value.trim(); return [$("#rCliente").value.trim(), $("#rPeca").value.trim(), [cid, mes].filter(Boolean).join(", ")].filter(Boolean).join("   ·   "); }
function baixar(blob, nome) { const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = nome; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1500); }

/* ------------------------------------------------------------------ modos */
document.querySelectorAll("[data-modo]").forEach(b => b.onclick = () => {
  E.modo = b.dataset.modo;
  document.querySelectorAll("[data-modo]").forEach(x => x.setAttribute("aria-pressed", String(x === b)));
  $("#blocoDocs").hidden = E.modo !== "montagem"; $("#blocoRecapa").hidden = E.modo !== "recapa";
  $("#dicaArquivos").textContent = E.modo === "montagem" ? "PDFs e imagens (JPG, PNG). Cada arquivo começa como um documento; depois você pode agrupar frente e verso ou partes de um mesmo ato sob uma única capa." : "Anexe o PDF de anexos já montado (um único arquivo), ou informe o seu link do Google Drive.";
  $("#arquivos").multiple = E.modo === "montagem";
});

/* ------------------------------------------------------------------ entrada de arquivos */
const zona = $("#zona"), inp = $("#arquivos");
zona.onclick = () => inp.click();
zona.onkeydown = e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); inp.click(); } };
zona.ondragover = e => { e.preventDefault(); zona.classList.add("sobre"); };
zona.ondragleave = () => zona.classList.remove("sobre");
zona.ondrop = e => { e.preventDefault(); zona.classList.remove("sobre"); receber([...e.dataTransfer.files].map(f => ({ nome: f.name, tipo: f.type, ler: () => f.arrayBuffer() }))); };
inp.onchange = () => { receber([...inp.files].map(f => ({ nome: f.name, tipo: f.type, ler: () => f.arrayBuffer() }))); inp.value = ""; };

async function prepararArquivo(nome, tipo, bytes, origem) {
  const pdf = ePdf(nome, tipo);
  const a = { nome, tipo: pdf ? "application/pdf" : (tipo || (/\.png$/i.test(nome) ? "image/png" : "image/jpeg")), bytes, pdf, rot: 0, paginas: 1, texto: "", origem };
  if (pdf) {
    const d = await abrirPdf(bytes); a.paginas = d.numPages;
    const t = [];
    for (let i = 1; i <= Math.min(d.numPages, 6); i++) t.push((await (await d.getPage(i)).getTextContent()).items.map(x => x.str).join(" "));
    a.texto = t.join("\n").replace(/\s+/g, " ").trim();
    a.thumb = await renderPg(d, 1, 184);
    a.pdfjs = d;
  } else a.thumb = await imagemCanvas(bytes, a.tipo, 0, 240);
  return a;
}
async function receber(itens) {
  const aviso = $("#avisoArquivos"); aviso.innerHTML = "";
  if (E.modo === "recapa") {
    const it = itens.find(i => ePdf(i.nome, i.tipo)); if (!it) { aviso.innerHTML = '<div class="aviso">No modo de refação de capas, anexe um único PDF.</div>'; return; }
    return carregarRecapa(it.nome, await it.ler());
  }
  for (const it of itens) {
    if (!ePdf(it.nome, it.tipo) && !/^image\//.test(it.tipo || "") && !/\.(jpe?g|png|webp)$/i.test(it.nome)) { aviso.insertAdjacentHTML("beforeend", '<div class="aviso">Formato não suportado: ' + esc(it.nome) + "</div>"); continue; }
    try {
      const a = await prepararArquivo(it.nome, it.tipo, await it.ler(), it.origem || "anexo");
      const den = C.dividirTitulo(nomeLimpo(it.nome));
      E.docs.push({ id: ++E.seq, arquivos: [a], titulo: den.titulo, complemento: den.complemento, ementa: "", excluido: false });
    } catch (e) { console.error(e); aviso.insertAdjacentHTML("beforeend", '<div class="aviso">Não foi possível ler ' + esc(it.nome) + ": " + esc(e.message || e) + "</div>"); }
    renderDocs();
  }
}

/* ------------------------------------------------------------------ Google Drive */
$("#gKey").value = ler(K_GKEY) || ""; $("#gClient").value = ler(K_GCLIENT) || "";
$("#gKey").onchange = () => gravar(K_GKEY, $("#gKey").value.trim());
$("#gClient").onchange = () => gravar(K_GCLIENT, $("#gClient").value.trim());
$("#gEntrar").onclick = async () => {
  const id = $("#gClient").value.trim(); if (!id) { $("#gStatus").textContent = "Informe o ID do cliente OAuth."; return; }
  try { await G.entrar(id); $("#gStatus").textContent = "Conectado à conta Google."; $("#gSair").hidden = false; } catch (e) { $("#gStatus").textContent = e.message; }
};
$("#gSair").onclick = () => { G.sair(); $("#gStatus").textContent = "Desconectado."; $("#gSair").hidden = true; };
$("#buscarDrive").onclick = async () => {
  const st = $("#statusDrive"), cfg = { apiKey: $("#gKey").value.trim() };
  if (!G.ids($("#links").value).length) { st.textContent = "Informe ao menos um link do Google Drive."; return; }
  $("#buscarDrive").disabled = true;
  try {
    const { arquivos, ignorados } = await G.listar($("#links").value, cfg, m => (st.textContent = m));
    if (!arquivos.length) { st.textContent = "Nenhum PDF ou imagem encontrado nos links."; return; }
    const itens = [];
    for (let i = 0; i < arquivos.length; i++) { st.textContent = "Baixando " + (i + 1) + " de " + arquivos.length + ": " + arquivos[i].nome; const bytes = await G.baixar(arquivos[i], cfg); itens.push({ nome: arquivos[i].nome, tipo: /pdf/.test(arquivos[i].mime) || /google-apps/.test(arquivos[i].mime) ? "application/pdf" : arquivos[i].mime, ler: async () => bytes, origem: "Google Drive" + (arquivos[i].pasta ? " · " + arquivos[i].pasta : "") }); }
    await receber(itens);
    st.textContent = arquivos.length + " arquivo(s) obtido(s) do Google Drive." + (ignorados.length ? " Ignorados por formato: " + ignorados.slice(0, 6).join(", ") + (ignorados.length > 6 ? "…" : "") : "");
  } catch (e) { st.textContent = e.message || String(e); console.error(e); }
  finally { $("#buscarDrive").disabled = false; }
};

/* ------------------------------------------------------------------ lista de documentos (montagem) */
function ativos() { return E.docs.filter(d => !d.excluido); }
function renderDocs() {
  const box = $("#docs");
  $("#contagem").textContent = E.docs.length ? ativos().length + " documento(s), " + ativos().reduce((s, d) => s + d.arquivos.reduce((t, a) => t + a.paginas, 0), 0) + " página(s) de conteúdo" : "";
  if (!E.docs.length) { box.innerHTML = '<p class="pequeno mudo">Nenhum documento ainda.</p>'; return; }
  box.replaceChildren();
  let n = 0;
  E.docs.forEach((d, i) => {
    if (!d.excluido) n++;
    const el = document.createElement("div"); el.className = "doc" + (d.excluido ? " excluido" : "");
    el.innerHTML = '<div class="thumb"></div><div><div class="doc-cab"><b>' + (d.excluido ? "Excluído" : "Doc. " + n) + '</b><span class="arqs">' + d.arquivos.map(a => esc(a.nome) + " (" + a.paginas + " pág." + (a.rot ? ", girado " + a.rot + "°" : "") + ")").join(" + ") + '</span><span class="acoes">' +
      '<button type="button" data-a="sobe" title="Mover para cima">↑</button><button type="button" data-a="desce" title="Mover para baixo">↓</button>' + (i > 0 ? '<button type="button" data-a="agrupa" title="Agrupar com o documento anterior sob a mesma capa">Agrupar com o anterior</button>' : "") + (d.arquivos.length > 1 ? '<button type="button" data-a="separa">Separar</button>' : "") +
      '<button type="button" data-a="gira" title="Girar 90° no sentido horário">Girar ↻</button><button type="button" data-a="exclui">' + (d.excluido ? "Restaurar" : "Excluir") + "</button></span></div>" +
      '<div class="grade g2"><label class="campo">Título<input type="text" data-c="titulo" value="' + esc(d.titulo) + '"></label><label class="campo">Complemento identificador<input type="text" data-c="complemento" value="' + esc(d.complemento) + '"></label></div>' +
      '<label class="campo" style="margin-top:8px">Ementa<textarea data-c="ementa" rows="3" placeholder="Descrição substantiva de duas a quatro linhas: números de registro, datas, valores e o ponto pelo qual o documento interessa à tese.">' + esc(d.ementa) + "</textarea></label></div>";
    const th = el.querySelector(".thumb"); const t = d.arquivos[0].thumb; if (t) { const c = document.createElement("canvas"); c.width = t.width; c.height = t.height; c.getContext("2d").drawImage(t, 0, 0); if (d.arquivos[0].rot) c.style.transform = "rotate(" + d.arquivos[0].rot + "deg)"; th.appendChild(c); }
    el.querySelectorAll("[data-c]").forEach(inpt => inpt.oninput = () => { d[inpt.dataset.c] = inpt.value; });
    el.querySelectorAll("[data-a]").forEach(b => b.onclick = () => acao(b.dataset.a, i));
    box.appendChild(el);
  });
}
function acao(a, i) {
  const d = E.docs[i];
  if (a === "sobe" && i > 0) [E.docs[i - 1], E.docs[i]] = [E.docs[i], E.docs[i - 1]];
  else if (a === "desce" && i < E.docs.length - 1) [E.docs[i + 1], E.docs[i]] = [E.docs[i], E.docs[i + 1]];
  else if (a === "agrupa" && i > 0) { E.docs[i - 1].arquivos.push(...d.arquivos); E.docs.splice(i, 1); }
  else if (a === "separa") { const resto = d.arquivos.splice(1); resto.reverse().forEach(x => { const den = C.dividirTitulo(nomeLimpo(x.nome)); E.docs.splice(i + 1, 0, { id: ++E.seq, arquivos: [x], titulo: den.titulo, complemento: den.complemento, ementa: "", excluido: false }); }); }
  else if (a === "gira") d.arquivos.forEach(x => { x.rot = (x.rot + 90) % 360; });
  else if (a === "exclui") d.excluido = !d.excluido;
  renderDocs();
}

/* ------------------------------------------------------------------ classificação com IA */
const salva = ler(K_CHAVE); if (salva) { $("#chave").value = salva; $("#lembrarChave").checked = true; }
$("#lembrarChave").onchange = e => gravar(K_CHAVE, e.target.checked ? $("#chave").value.trim() : "");
$("#chave").oninput = () => { if ($("#lembrarChave").checked) gravar(K_CHAVE, $("#chave").value.trim()); };
const SISTEMA_CLASSIF = `Você classifica documentos de clientes de um escritório de advocacia criminal para a montagem de um PDF de anexos de peça processual, com uma capa por documento. Para o documento recebido (texto extraído e imagens das primeiras páginas), determine a espécie documental, a parte a quem pertence, a data ou período de referência e o órgão expedidor, e redija:

o título: a espécie documental com o identificador principal, no padrão das denominações usuais (por exemplo, "Boletim de Ocorrência", "Termo de Declaração", "Laudo Pericial nº 1.234/2026", "Certidão de Inteiro Teor", "Comprovante de Transferência", "Cédula de Identidade", "Contrato Social Consolidado", "Escritura Pública de Compra e Venda", "Procuração Pública", "Extrato Bancário", "Decisão", "Denúncia");
o complemento identificador: quando o documento pertencer a uma pessoa determinada, o nome dela; nos demais casos, o identificador que o distingue (órgão, matrícula, número do feito, banco e período, data). Deixe vazio quando o título já identificar o documento. Nunca use travessão;
a ementa: de duas a quatro linhas, substantiva, consignando números de registro, datas, valores e o ponto pelo qual o documento interessa ao caso, e não apenas repetindo o título. Escreva em português formal, sem travessões.

Não invente dados: use apenas o que estiver no documento; se algo estiver ilegível, omita ou registre a limitação. Indique se o arquivo parece ser parte de outro documento (frente ou verso, página avulsa de um mesmo ato).`;
const SCHEMA_CLASSIF = { type: "object", additionalProperties: false, required: ["especie", "titulo", "complemento", "ementa", "parte", "data_referencia", "parte_de_outro_documento"], properties: { especie: { type: "string" }, titulo: { type: "string" }, complemento: { type: "string" }, ementa: { type: "string" }, parte: { type: "string" }, data_referencia: { type: "string" }, parte_de_outro_documento: { type: "boolean" } } };
const SISTEMA_RECAPA = `Você lê páginas de capa de um PDF de anexos documentais já montado e separa o seu conteúdo nos campos da nova capa, reproduzindo o texto literalmente, sem alterar nenhuma palavra e sem corrigir erros. Separe o número do documento (o N de "Doc. N"), o título, o complemento identificador e a ementa. Quando a denominação trouxer travessão separando a espécie do identificador, a espécie é o título e o identificador é o complemento, eliminando o travessão sem alterar nenhuma palavra. Se encontrar erros de português, não os corrija: aponte-os no campo de observações, com a forma correta.`;
const SCHEMA_RECAPA = { type: "object", additionalProperties: false, required: ["numero", "titulo", "complemento", "ementa", "erros_apontados"], properties: { numero: { type: "integer" }, titulo: { type: "string" }, complemento: { type: "string" }, ementa: { type: "string" }, erros_apontados: { type: "string" } } };

function cliente() {
  const chave = $("#chave").value.trim();
  if (!chave) throw new Error("Informe a chave de API da Anthropic na seção de classificação automática.");
  if (!$("#consentimento").checked) throw new Error("Marque a autorização de envio do conteúdo à API da Anthropic.");
  return new Anthropic({ apiKey: chave, dangerouslyAllowBrowser: true, maxRetries: 3 });
}
async function perguntar(cli, sistema, schema, conteudo) {
  const r = await cli.beta.messages.create({
    model: $("#modelo").value, max_tokens: 6000, system: sistema,
    output_config: { effort: "medium", format: { type: "json_schema", schema } },
    messages: [{ role: "user", content: conteudo }],
    betas: ["server-side-fallback-2026-07-01"], fallbacks: "default"
  });
  if (r.stop_reason === "refusal") throw new Error("O modelo recusou a análise deste documento.");
  const t = r.content.filter(b => b.type === "text").map(b => b.text).join("");
  return JSON.parse(t);
}
async function imagensDoc(d, max) {
  const out = [];
  for (const a of d.arquivos) {
    if (out.length >= max) break;
    if (a.pdf) for (let p = 1; p <= Math.min(a.paginas, max - out.length); p++) out.push(await canvasJpeg(await renderPg(a.pdfjs, p, 1400), 0.82));
    else out.push(await canvasJpeg(await imagemCanvas(a.bytes, a.tipo, a.rot, 1568), 0.85));
  }
  return out.map(b => ({ type: "image", source: { type: "base64", media_type: "image/jpeg", data: b64(b) } }));
}
function b64(buf) { let s = ""; const u = new Uint8Array(buf); for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode.apply(null, u.subarray(i, i + 0x8000)); return btoa(s); }
async function emLotes(itens, n, fn) { let i = 0; await Promise.all(Array.from({ length: n }, async () => { while (i < itens.length) { const k = i++; await fn(itens[k], k); } })); }
function erroApi(e) {
  if (e instanceof Anthropic.AuthenticationError) return "Chave de API da Anthropic inválida.";
  if (e instanceof Anthropic.RateLimitError) return "Limite de uso da API atingido; aguarde e tente novamente.";
  if (e instanceof Anthropic.APIConnectionError) return "Falha de conexão com a API da Anthropic.";
  if (e instanceof Anthropic.APIError) return "Erro da API (" + e.status + "): " + e.message;
  return e.message || String(e);
}
$("#classificar").onclick = async () => {
  const st = $("#statusIA"), lista = ativos();
  if (!lista.length) { st.textContent = "Inclua documentos primeiro."; return; }
  let cli; try { cli = cliente(); } catch (e) { st.textContent = e.message; $("#chave").closest("details").open = true; return; }
  $("#classificar").disabled = true; let feitos = 0; const falhas = [];
  const ctx = "Contexto: cliente " + ($("#rCliente").value.trim() || "não informado") + "; peça " + ($("#rPeca").value.trim() || "não informada") + ".";
  try {
    await emLotes(lista, 3, async d => {
      try {
        const textos = d.arquivos.map(a => "Arquivo: " + a.nome + " (" + a.paginas + " página(s)" + (a.pdf ? "" : ", imagem") + ")\n" + (a.texto ? "Texto extraído: " + a.texto.slice(0, 9000) : "Sem texto extraível; ver imagens.")).join("\n\n");
        const imgs = await imagensDoc(d, d.arquivos.some(a => a.texto && a.texto.length > 800) ? 1 : 3);
        const r = await perguntar(cli, SISTEMA_CLASSIF, SCHEMA_CLASSIF, [...imgs, { type: "text", text: ctx + "\n\n" + textos }]);
        d.titulo = r.titulo; d.complemento = r.complemento; d.ementa = r.ementa; d.parteDeOutro = r.parte_de_outro_documento; d.dataRef = r.data_referencia;
      } catch (e) { falhas.push(d.arquivos[0].nome + ": " + erroApi(e)); if (e instanceof Anthropic.AuthenticationError) throw e; }
      st.textContent = "Classificados " + (++feitos) + " de " + lista.length + "…";
    });
    st.textContent = "Classificação concluída. Confira cada campo antes de gerar." + (falhas.length ? " Falhas: " + falhas.join("; ") : "");
    const sugestao = lista.filter(d => d.parteDeOutro).map(d => d.arquivos[0].nome);
    if (sugestao.length) $("#avisoArquivos").innerHTML = '<div class="aviso info">Possivelmente partes de outro documento (avalie agrupar sob a mesma capa): ' + esc(sugestao.join(", ")) + ".</div>";
  } catch (e) { st.textContent = erroApi(e); }
  finally { $("#classificar").disabled = false; renderDocs(); }
};

/* ------------------------------------------------------------------ recapa */
async function carregarRecapa(nome, bytes) {
  const st = $("#statusRecapa"); st.textContent = "Lendo o PDF…";
  const d = await abrirPdf(bytes);
  E.recapa = { nome, bytes, pdfjs: d, paginas: [] };
  const grade = $("#paginas"); grade.replaceChildren();
  for (let i = 1; i <= d.numPages; i++) {
    const pg = await d.getPage(i), texto = (await pg.getTextContent()).items.map(x => x.str).join(" ").replace(/\s+/g, " ").trim();
    const junto = texto.replace(/\s+/g, "");
    const m = /DOC(?:UMENTO)?\.?(?:N[ºO°.]?)?(\d{1,3})(?!\d)/i.exec(junto);
    const capa = !!m && junto.length < 1400;
    const info = { n: i, texto, capa, numero: m ? +m[1] : null, titulo: "", complemento: "", ementa: "" };
    if (capa) preencherDaCapa(info);
    E.recapa.paginas.push(info);
    const el = document.createElement("div"); el.className = "pg" + (capa ? " capa" : ""); el.title = "Clique para marcar ou desmarcar como capa";
    el.appendChild(await renderPg(d, i, 160)); el.insertAdjacentHTML("beforeend", "<div>Pág. " + i + (capa ? " · capa" : "") + "</div>");
    el.onclick = () => { info.capa = !info.capa; if (info.capa && !info.titulo) preencherDaCapa(info); el.classList.toggle("capa", info.capa); el.lastChild.textContent = "Pág. " + i + (info.capa ? " · capa" : ""); renderCapas(); };
    grade.appendChild(el);
    st.textContent = "Lendo página " + i + " de " + d.numPages + "…";
  }
  st.textContent = d.numPages + " páginas; " + E.recapa.paginas.filter(p => p.capa).length + " capa(s) identificada(s). Confira as marcações.";
  renderCapas();
}
function preencherDaCapa(info) {
  let t = info.texto.replace(/(?:\S ){3,}\S/g, " ").replace(/\bDoc(?:umento)?\.?\s*(?:n[ºo°.]?\s*)?\d{1,3}\b/i, "").replace(/ANEXO DOCUMENTAL|TPC\s*ADVOGADOS\.?(\.COM\.BR)?|TPCADVOGADOS|\.COM\.BR/gi, "").replace(/[^·]*·[^·]*·.*$/, "").replace(/^\s*\d{1,3}\s+/, "").replace(/\s+/g, " ").trim();
  const den = C.dividirTitulo(t.split(/(?<=[a-zà-ú0-9)])\s+(?=[A-ZÀ-Ú][a-zà-ú]+\s[a-zà-ú])/)[0] || t);
  info.titulo = den.titulo.slice(0, 140); info.complemento = den.complemento; info.ementa = t.slice(den.titulo.length + (den.complemento ? den.complemento.length + 3 : 0)).trim();
}
function renderCapas() {
  const box = $("#capas"); if (!E.recapa) return;
  const capas = E.recapa.paginas.filter(p => p.capa);
  box.replaceChildren();
  capas.forEach((p, k) => {
    if (p.numero == null) p.numero = k + 1;
    const el = document.createElement("div"); el.className = "doc"; el.style.gridTemplateColumns = "minmax(0,1fr)";
    el.innerHTML = '<div><div class="doc-cab"><b>Pág. ' + p.n + '</b><span class="arqs">Texto atual: ' + esc(p.texto.slice(0, 220)) + (p.texto.length > 220 ? "…" : "") + "</span></div>" +
      '<div class="grade g4"><label class="campo">Nº do documento<input type="number" min="1" data-c="numero" value="' + esc(p.numero) + '"></label><label class="campo">Título<input type="text" data-c="titulo" value="' + esc(p.titulo) + '"></label><label class="campo">Complemento<input type="text" data-c="complemento" value="' + esc(p.complemento) + '"></label></div>' +
      '<label class="campo" style="margin-top:8px">Ementa<textarea data-c="ementa" rows="3">' + esc(p.ementa) + "</textarea></label>" + (p.erros ? '<div class="aviso">Erros apontados na capa original (não corrigidos): ' + esc(p.erros) + "</div>" : "") + "</div>";
    el.querySelectorAll("[data-c]").forEach(i => i.oninput = () => { p[i.dataset.c] = i.dataset.c === "numero" ? +i.value : i.value; });
    box.appendChild(el);
  });
}
$("#lerCapasIA").onclick = async () => {
  const st = $("#statusRecapa"); if (!E.recapa) { st.textContent = "Anexe o PDF montado."; return; }
  let cli; try { cli = cliente(); } catch (e) { st.textContent = e.message; $("#chave").closest("details").open = true; return; }
  const capas = E.recapa.paginas.filter(p => p.capa); let feitos = 0;
  $("#lerCapasIA").disabled = true;
  try {
    await emLotes(capas, 3, async p => {
      const img = await canvasJpeg(await renderPg(E.recapa.pdfjs, p.n, 1200), 0.85);
      const r = await perguntar(cli, SISTEMA_RECAPA, SCHEMA_RECAPA, [{ type: "image", source: { type: "base64", media_type: "image/jpeg", data: b64(img) } }, { type: "text", text: "Texto extraído da página: " + (p.texto || "(sem texto)") }]);
      Object.assign(p, { numero: r.numero || p.numero, titulo: r.titulo, complemento: r.complemento, ementa: r.ementa, erros: r.erros_apontados && !/^(nenhum|não há|n\/a)/i.test(r.erros_apontados.trim()) ? r.erros_apontados : "" });
      st.textContent = "Capas lidas: " + (++feitos) + " de " + capas.length + "…";
    });
    st.textContent = "Capas lidas. Confira os campos antes de gerar.";
  } catch (e) { st.textContent = erroApi(e); }
  finally { $("#lerCapasIA").disabled = false; renderCapas(); }
};

/* ------------------------------------------------------------------ geração */
function progresso(m, f) { $("#progGeracao").hidden = false; $("#estado").textContent = m; if (f != null) $("#barra").style.width = Math.round(f * 100) + "%"; }
async function paginasDeImagem(pdf, a) {
  const c = await imagemCanvas(a.bytes, a.tipo, a.rot, 0);
  const jpg = await pdf.embedJpg(await canvasJpeg(c, 0.9));
  const [pw, ph] = c.width > c.height ? [A4[1], A4[0]] : A4;
  const pg = pdf.addPage([pw, ph]), m = 20, s = Math.min((pw - 2 * m) / c.width, (ph - 2 * m) / c.height);
  const w = c.width * s, h = c.height * s;
  pg.drawImage(jpg, { x: (pw - w) / 2, y: (ph - h) / 2, width: w, height: h });
}
async function paginasDePdf(pdf, a, avisos) {
  const { PDFDocument, degrees } = window.PDFLib;
  try {
    const src = await PDFDocument.load(a.bytes, { ignoreEncryption: true });
    const pgs = await pdf.copyPages(src, src.getPageIndices());
    for (const p of pgs) { if (a.rot) p.setRotation(degrees((p.getRotation().angle + a.rot) % 360)); pdf.addPage(p); }
  } catch (e) {
    avisos.push(a.nome + ": o PDF não pôde ser copiado diretamente (" + (e.message || e) + "); as páginas foram incorporadas como imagem em alta resolução.");
    for (let i = 1; i <= a.paginas; i++) {
      const c = await renderPg(a.pdfjs, i, 1654);
      const jpg = await pdf.embedJpg(await canvasJpeg(c, 0.92));
      const pg = pdf.addPage([c.width * 72 / 200, c.height * 72 / 200]); pg.drawImage(jpg, { x: 0, y: 0, width: pg.getWidth(), height: pg.getHeight() });
    }
  }
}
async function montar() {
  const { PDFDocument } = window.PDFLib;
  const lista = ativos(); if (!lista.length) throw new Error("Inclua ao menos um documento.");
  const vazios = lista.filter(d => !d.titulo.trim()); if (vazios.length) throw new Error("Há documento sem título (Doc. " + (lista.indexOf(vazios[0]) + 1) + ").");
  const pdf = await PDFDocument.create(), f = await C.incorporar(pdf, await recursos()), avisos = [], capas = [], rod = rodape();
  for (let k = 0; k < lista.length; k++) {
    const d = lista[k]; progresso("Doc. " + (k + 1) + " de " + lista.length + ": " + d.titulo, k / lista.length);
    const pg = pdf.addPage(A4); capas.push(pdf.getPageCount());
    const r = C.desenhar(pg, f, k + 1, d.titulo.trim(), d.complemento.trim(), d.ementa.trim(), rod);
    if (r.colisaoRodape) avisos.push("Doc. " + (k + 1) + ": a ementa avança sobre o rodapé; reduza o texto.");
    for (const a of d.arquivos) { if (a.pdf) await paginasDePdf(pdf, a, avisos); else await paginasDeImagem(pdf, a); }
  }
  pdf.setTitle(($("#nomeSaida").value.trim() || "Anexos").replace(/_/g, " ")); pdf.setAuthor("TPC Advogados"); pdf.setCreator("HUB Criminal TPC"); pdf.setProducer("HUB Criminal TPC");
  return { bytes: await pdf.save(), capas, avisos, docs: lista.map((d, k) => "Doc. " + (k + 1) + ": " + d.titulo + (d.complemento ? ", " + d.complemento : "")) };
}
async function recapar() {
  const { PDFDocument } = window.PDFLib;
  if (!E.recapa) throw new Error("Anexe o PDF montado.");
  const capas = E.recapa.paginas.filter(p => p.capa); if (!capas.length) throw new Error("Marque ao menos uma página de capa.");
  const src = await PDFDocument.load(E.recapa.bytes, { ignoreEncryption: true });
  const pdf = await PDFDocument.create(), f = await C.incorporar(pdf, await recursos()), avisos = [], rod = rodape();
  const copias = await pdf.copyPages(src, src.getPageIndices());
  for (let i = 0; i < copias.length; i++) {
    const info = E.recapa.paginas[i];
    if (info.capa) {
      const { width, height } = src.getPage(i).getSize(), rot = src.getPage(i).getRotation().angle % 180 !== 0;
      const pg = pdf.addPage(rot ? [height, width] : [width, height]);
      const r = C.desenhar(pg, f, info.numero || 1, (info.titulo || "").trim(), (info.complemento || "").trim(), (info.ementa || "").trim(), rod);
      if (r.colisaoRodape) avisos.push("Capa da pág. " + info.n + ": a ementa avança sobre o rodapé.");
    } else pdf.addPage(copias[i]);
    progresso("Página " + (i + 1) + " de " + copias.length, i / copias.length);
  }
  /* verificação: mesmo número de páginas e mesmas dimensões nas páginas de conteúdo */
  if (pdf.getPageCount() !== src.getPageCount()) throw new Error("Falha na verificação: o número de páginas mudou.");
  const alteradas = []; for (let i = 0; i < src.getPageCount(); i++) if (!E.recapa.paginas[i].capa) { const a = src.getPage(i).getSize(), b = pdf.getPage(i).getSize(); if (Math.abs(a.width - b.width) > 0.01 || Math.abs(a.height - b.height) > 0.01) alteradas.push(i + 1); }
  if (alteradas.length) throw new Error("Falha na verificação: páginas de conteúdo alteradas: " + alteradas.join(", "));
  pdf.setAuthor("TPC Advogados"); pdf.setCreator("HUB Criminal TPC");
  return { bytes: await pdf.save(), capas: capas.map(p => p.n), avisos, docs: capas.map(p => "Doc. " + p.numero + ": " + p.titulo + (p.complemento ? ", " + p.complemento : "")), verificado: src.getPageCount() };
}
$("#gerar").onclick = async () => {
  $("#gerar").disabled = true; $("#resultado").hidden = true;
  try {
    const r = E.modo === "montagem" ? await montar() : await recapar();
    progresso("Conferindo as capas…", 0.96);
    const blob = new Blob([r.bytes], { type: "application/pdf" }); E.saida = blob;
    const d = await abrirPdf(r.bytes);
    $("#resumo").textContent = d.numPages + " páginas, " + (blob.size / 1048576).toFixed(1) + " MB. " + r.docs.join("; ") + "." + (r.verificado ? " Verificação concluída: " + r.verificado + " páginas, com as páginas de conteúdo preservadas." : "");
    $("#avisosFinais").innerHTML = r.avisos.map(a => '<div class="aviso">' + esc(a) + "</div>").join("");
    const cont = $("#contato"); cont.replaceChildren();
    for (const n of r.capas) cont.appendChild(await renderPg(d, n, 260));
    $("#resultado").hidden = false; progresso("PDF gerado.", 1);
    $("#resultado").scrollIntoView({ behavior: "smooth", block: "start" });
  } catch (e) { console.error(e); progresso(e.message || String(e)); }
  finally { $("#gerar").disabled = false; }
};
$("#baixar").onclick = () => { if (E.saida) baixar(E.saida, (($("#nomeSaida").value.trim() || (E.modo === "recapa" && E.recapa ? nomeLimpo(E.recapa.nome) + "_capas_TPC" : "Anexos")).replace(/[\\/:*?"<>|]+/g, "_")) + ".pdf"); };
$("#limpar").onclick = () => { E.docs = []; E.recapa = null; E.saida = null; renderDocs(); $("#paginas").replaceChildren(); $("#capas").replaceChildren(); $("#resultado").hidden = true; $("#progGeracao").hidden = true; $("#avisoArquivos").innerHTML = ""; $("#statusRecapa").textContent = ""; };
["#rCliente", "#rPeca", "#rCidade", "#rMes"].forEach(s => $(s).addEventListener("input", () => { $("#rodapePrevia").textContent = rodape(); }));
$("#rMes").value = mesAtual(); $("#rodapePrevia").textContent = rodape();
window.ORG_ESTADO = E; /* usado nos testes automatizados */
renderDocs();
