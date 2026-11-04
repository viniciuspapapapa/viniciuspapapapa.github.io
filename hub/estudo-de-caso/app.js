/* Interface do Estudo de Caso Criminal: leitura dos autos, elaboração pelo Claude e documento Word no modelo TPC. */
import Anthropic from "https://cdn.jsdelivr.net/npm/@anthropic-ai/sdk@1.1.0/+esm";

const L = window.EC_LEITOR, P = window.EC_PROMPT, W = window.EC_DOCX, esc = window.HUB.esc;
const $ = s => document.querySelector(s);
if (window.pdfjsLib) window.pdfjsLib.GlobalWorkerOptions.workerSrc = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";

const PRECOS = { "claude-opus-5-5": [4, 20], "claude-fable-5-1": [10, 50], "claude-sonnet-5-5": [2, 10] };
const CHARS_POR_TOKEN = 2.8;          /* estimativa conservadora para português */
const LIMITE_UNICO = 860000;          /* tokens de entrada para leitura em uma só etapa (janela de 1M) */
const BLOCO_TOKENS = 330000;          /* tamanho de cada bloco no fichamento */
const MODELO_DOCX = "modelo-estudo.docx";
const K_CHAVE = "hub_claude_chave", K_REF = "ec_referencias", K_ESTUDO = "ec_estudo";
const ler = k => { try { return localStorage.getItem(k); } catch (e) { return null; } };
const gravar = (k, v) => { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch (e) { /* armazenamento indisponível */ } };

const E = { arquivos: [], leitura: null, refs: [], cancelLeitura: false, stream: null, cancelado: false, md: "", cab: null };

/* ------------------------------------------------------------------ passo 1: arquivos e leitura */
const zona = $("#zona"), inp = $("#arquivos");
zona.onclick = () => inp.click();
zona.onkeydown = e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); inp.click(); } };
zona.ondragover = e => { e.preventDefault(); zona.classList.add("sobre"); };
zona.ondragleave = () => zona.classList.remove("sobre");
zona.ondrop = e => { e.preventDefault(); zona.classList.remove("sobre"); adicionar([...e.dataTransfer.files]); };
inp.onchange = () => { adicionar([...inp.files]); inp.value = ""; };
function adicionar(fs) {
  const pdfs = fs.filter(f => /\.pdf$/i.test(f.name) || f.type === "application/pdf");
  if (pdfs.length < fs.length) window.HUB.toast("Apenas arquivos PDF são aceitos.");
  E.arquivos.push(...pdfs); E.leitura = null; listar(); atualizar();
}
function listar() {
  $("#listaArq").innerHTML = E.arquivos.map((f, i) => '<div class="arq"><span class="nm">' + esc(f.name) + '</span><span class="pequeno mudo">' + (f.size / 1048576).toFixed(1) + ' MB</span><button type="button" data-i="' + i + '" aria-label="Remover ' + esc(f.name) + '">×</button></div>').join("");
  $("#listaArq").querySelectorAll("button").forEach(b => b.onclick = () => { E.arquivos.splice(+b.dataset.i, 1); E.leitura = null; listar(); atualizar(); });
  $("#ler").disabled = !E.arquivos.length;
}
$("#ler").onclick = async () => {
  E.cancelLeitura = false;
  $("#ler").disabled = true; $("#cancelarLeitura").hidden = false; $("#progLeitura").hidden = false; $("#kpisLeitura").hidden = true; $("#avisoLeitura").innerHTML = ""; $("#baixarTexto").hidden = true;
  const prog = (msg, f) => { $("#estadoLeitura").textContent = msg; if (f != null) $("#barraLeitura").style.width = Math.round(f * 100) + "%"; };
  try {
    E.leitura = await L.ler(E.arquivos, { prog, cancelado: () => E.cancelLeitura });
    prog("Leitura concluída.", 1);
    const r = E.leitura;
    $("#kpisLeitura").innerHTML = "<div><span>Páginas</span><b>" + r.paginas + "</b></div><div><span>Com OCR</span><b>" + r.ocr + "</b></div><div><span>Leitura precária</span><b>" + r.ilegiveis.length + "</b></div><div><span>Tokens estimados</span><b>" + Math.round(r.chars / CHARS_POR_TOKEN / 1000) + " mil</b></div>";
    $("#kpisLeitura").hidden = false; $("#baixarTexto").hidden = false;
    if (r.ilegiveis.length) $("#avisoLeitura").innerHTML = '<div class="aviso">Páginas de leitura precária, que serão tratadas como limitação da análise: ' + esc(r.ilegiveis.slice(0, 40).join(", ")) + (r.ilegiveis.length > 40 ? " e outras " + (r.ilegiveis.length - 40) : "") + ". Se forem relevantes, anexe uma cópia de melhor qualidade.</div>";
    if (r.chars / CHARS_POR_TOKEN > LIMITE_UNICO) $("#avisoLeitura").insertAdjacentHTML("beforeend", '<div class="aviso info">O processo excede a leitura em uma só etapa. Ele será lido em ' + L.blocos(r, BLOCO_TOKENS * CHARS_POR_TOKEN / 3.3).length + " blocos, cada um fichado com as referências de página, e o estudo será redigido a partir dos fichamentos.</div>");
  } catch (e) { prog(e.message || String(e)); E.leitura = null; console.error(e); }
  finally { $("#ler").disabled = !E.arquivos.length; $("#cancelarLeitura").hidden = true; atualizar(); }
};
$("#cancelarLeitura").onclick = () => { E.cancelLeitura = true; };
$("#baixarTexto").onclick = () => baixar(new Blob([E.leitura.texto], { type: "text/plain;charset=utf-8" }), "autos-texto-extraido.txt");

/* ------------------------------------------------------------------ passo 2: estudos de referência */
async function textoDe(f) {
  const buf = await f.arrayBuffer();
  if (/\.docx$/i.test(f.name)) { if (!window.mammoth) throw new Error("Leitor de Word indisponível."); return (await window.mammoth.extractRawText({ arrayBuffer: buf })).value; }
  if (/\.pdf$/i.test(f.name)) { const pdf = await window.pdfjsLib.getDocument({ data: new Uint8Array(buf) }).promise; const t = []; for (let i = 1; i <= pdf.numPages; i++) t.push((await (await pdf.getPage(i)).getTextContent()).items.map(x => x.str).join(" ")); return t.join("\n"); }
  return new TextDecoder().decode(buf);
}
$("#referencias").onchange = async e => {
  E.refs = [];
  for (const f of e.target.files) { try { E.refs.push({ nome: f.name, texto: (await textoDe(f)).replace(/\s+\n/g, "\n").trim().slice(0, 90000) }); } catch (err) { window.HUB.toast("Não foi possível ler " + f.name + "."); } }
  infoRef(); if ($("#lembrarRef").checked) gravar(K_REF, JSON.stringify(E.refs));
};
$("#lembrarRef").onchange = e => gravar(K_REF, e.target.checked && E.refs.length ? JSON.stringify(E.refs) : null);
function infoRef() { $("#refInfo").textContent = E.refs.length ? E.refs.length + " estudo(s) de referência: " + E.refs.map(r => r.nome).join(", ") : ""; }

/* ------------------------------------------------------------------ passo 3: chave, custo e consentimento */
const salva = ler(K_CHAVE); if (salva) { $("#chave").value = salva; $("#lembrarChave").checked = true; }
try { const r = JSON.parse(ler(K_REF) || "null"); if (r && r.length) { E.refs = r; $("#lembrarRef").checked = true; infoRef(); } } catch (e) { /* ignora */ }
$("#lembrarChave").onchange = e => gravar(K_CHAVE, e.target.checked ? $("#chave").value.trim() : null);
$("#chave").oninput = () => { if ($("#lembrarChave").checked) gravar(K_CHAVE, $("#chave").value.trim()); atualizar(); };
["#consentimento", "#modelo", "#esforco", "#escopo"].forEach(s => $(s).addEventListener("change", atualizar));
function estimativa() {
  if (!E.leitura) return null;
  const [pe, ps] = PRECOS[$("#modelo").value];
  const tin = E.leitura.chars / CHARS_POR_TOKEN + 6000 + E.refs.reduce((s, r) => s + r.texto.length, 0) / CHARS_POR_TOKEN;
  const etapas = tin > LIMITE_UNICO ? Math.ceil(tin / BLOCO_TOKENS) : 0;
  const saida = ($("#escopo").value === "completo" ? 45000 : 25000) + etapas * 20000;
  const entrada = tin + (etapas ? etapas * 20000 : 0);
  return { tin, etapas, custo: (entrada * pe + saida * ps) / 1e6 };
}
function atualizar() {
  const est = estimativa();
  $("#custo").hidden = !est;
  if (est) $("#custo").textContent = "Estimativa aproximada: cerca de " + Math.round(est.tin / 1000) + " mil tokens de entrada" + (est.etapas ? ", lidos em " + est.etapas + " blocos," : "") + " e custo da ordem de US$ " + est.custo.toFixed(2) + " na API, conforme o modelo e a profundidade escolhidos. O raciocínio do modelo é cobrado à parte e pode elevar esse valor.";
  $("#gerar").disabled = !(E.leitura && $("#chave").value.trim() && $("#consentimento").checked);
}

/* ------------------------------------------------------------------ elaboração */
function caso() {
  return { autos: $("#autos").value.trim(), assistido: $("#assistido").value.trim(), condicao: $("#condicao").value, fase: $("#fase").value.trim(), perspectiva: $("#perspectiva").value, escopo: $("#escopo").value, orientacoes: $("#orientacoes").value.trim(), ilegiveis: E.leitura ? E.leitura.ilegiveis : [] };
}
function cabecalho(c) {
  const fim = "Estudo de caso de uso interno, destinado a orientar a estratégia " + (c.perspectiva === "vitima" ? "da assistência à vítima" : "da defesa") + (c.fase ? ", na fase de " + c.fase : "") + ".";
  return { titulo: "Estudo de Caso Criminal", autos: c.autos, abertura: c.assistido ? "**" + c.assistido + "**, " + c.condicao + " nos autos em referência. " + fim : fim };
}
function sistema() {
  const blocos = [{ type: "text", text: P.SISTEMA }];
  if (E.refs.length) blocos.push({ type: "text", text: "Estudos de caso anteriores considerados exemplares pela equipe. Observe o padrão de análise, a estrutura, o nível de detalhe e o tom, e busque igualar ou superar esse padrão; não reproduza os seus fatos, nomes ou conclusões.\n\n" + E.refs.map(r => "<estudo_de_referencia nome=\"" + r.nome.replace(/"/g, "") + "\">\n" + r.texto + "\n</estudo_de_referencia>").join("\n\n") });
  blocos[blocos.length - 1].cache_control = { type: "ephemeral" };
  return blocos;
}
function params(modelo, esforco, system, conteudo, maxTokens) {
  return {
    model: modelo, max_tokens: maxTokens,
    thinking: { type: "adaptive", display: "summarized" },
    output_config: { effort: esforco },
    system, messages: [{ role: "user", content: conteudo }],
    betas: ["server-side-fallback-2026-07-01"], fallbacks: "default"
  };
}
function progresso(msg, f) { $("#estadoGeracao").textContent = msg; if (f != null) $("#barraGeracao").style.width = Math.round(f * 100) + "%"; }

/* executa uma chamada em streaming; devolve o texto final e o motivo de parada */
async function chamar(client, p, aoTexto) {
  const stream = client.beta.messages.stream(p);
  E.stream = stream;
  let pens = "";
  for await (const ev of stream) {
    if (ev.type === "content_block_delta") {
      if (ev.delta.type === "text_delta") aoTexto && aoTexto(ev.delta.text);
      else if (ev.delta.type === "thinking_delta") { pens = (pens + ev.delta.thinking).slice(-400); $("#pensando").textContent = pens.replace(/\s+/g, " "); }
    }
  }
  const final = await stream.finalMessage();
  E.stream = null;
  if (final.stop_reason === "refusal") throw new Error("O modelo recusou a solicitação" + (final.stop_details && final.stop_details.category ? " (categoria: " + final.stop_details.category + ")" : "") + ". Tente outro modelo ou ajuste as orientações.");
  const texto = final.content.filter(b => b.type === "text").map(b => b.text).join("");
  return { texto, stop: final.stop_reason, uso: final.usage };
}

let ultimoRender = 0;
function renderParcial(forcar) {
  const agora = Date.now(); if (!forcar && agora - ultimoRender < 1200) return; ultimoRender = agora;
  $("#folha").innerHTML = W.html(W.blocos(E.md), E.cab); $("#resultado").hidden = false;
}

$("#gerar").onclick = async () => {
  const chave = $("#chave").value.trim(), modelo = $("#modelo").value, esforco = $("#esforco").value;
  const c = caso();
  E.cab = cabecalho(c); E.md = ""; E.cancelado = false;
  $("#gerar").disabled = true; $("#cancelarGeracao").hidden = false; $("#progGeracao").hidden = false; $("#avisoGeracao").innerHTML = ""; $("#pensando").textContent = "";
  const client = new Anthropic({ apiKey: chave, dangerouslyAllowBrowser: true, maxRetries: 3 });
  const sys = sistema();
  try {
    progresso("Conferindo o tamanho dos autos…", 0.02);
    const autos = { type: "text", text: "<autos>\n" + E.leitura.texto + "\n</autos>", cache_control: { type: "ephemeral" } };
    let tokens;
    try { tokens = (await client.messages.countTokens({ model: modelo, system: sys, messages: [{ role: "user", content: [autos, { type: "text", text: P.pedido(c, "", "autos") }] }] })).input_tokens; }
    catch (e) { if (e instanceof Anthropic.AuthenticationError) throw e; tokens = Math.ceil(E.leitura.chars / CHARS_POR_TOKEN); }
    let conteudo;
    if (tokens <= LIMITE_UNICO) conteudo = [autos, { type: "text", text: P.pedido(c, "", "autos") }];
    else {
      const partes = L.blocos(E.leitura, BLOCO_TOKENS * CHARS_POR_TOKEN / 3.3);
      const fichas = [];
      for (let i = 0; i < partes.length; i++) {
        if (E.cancelado) throw new Anthropic.APIUserAbortError();
        progresso("Fichando o bloco " + (i + 1) + " de " + partes.length + " dos autos…", 0.05 + 0.5 * i / partes.length);
        const r = await chamar(client, params(modelo, esforco, [{ type: "text", text: P.FICHAMENTO, cache_control: { type: "ephemeral" } }], [{ type: "text", text: "<bloco numero=\"" + (i + 1) + "\" de=\"" + partes.length + "\">\n" + partes[i] + "\n</bloco>" }, { type: "text", text: "Elabore o fichamento analítico deste bloco." }], 32000));
        fichas.push("<fichamento bloco=\"" + (i + 1) + "\">\n" + r.texto + "\n</fichamento>");
      }
      conteudo = [{ type: "text", text: "<fichamentos>\n" + fichas.join("\n\n") + "\n</fichamentos>", cache_control: { type: "ephemeral" } }, { type: "text", text: P.pedido(c, "", "fichamentos") }];
    }
    progresso("Elaborando o estudo de caso (" + Math.round(tokens / 1000) + " mil tokens de autos). A análise aprofundada pode levar vários minutos…", 0.6);
    let chars = 0;
    const r = await chamar(client, params(modelo, esforco, sys, conteudo, 64000), t => { E.md += t; chars += t.length; progresso("Redigindo o estudo: " + Math.round(chars / 1000) + " mil caracteres escritos…", Math.min(0.97, 0.6 + chars / 260000)); renderParcial(); });
    E.md = r.texto || E.md;
    renderParcial(true);
    try { sessionStorage.setItem(K_ESTUDO, JSON.stringify({ md: E.md, cab: E.cab })); } catch (e) { /* ignora */ }
    progresso("Estudo concluído.", 1);
    if (r.stop === "max_tokens") $("#avisoGeracao").innerHTML = '<div class="aviso">O estudo atingiu o limite de extensão de uma resposta e pode ter sido interrompido no final. Considere gerar novamente com escopo mais restrito ou dividir o processo.</div>';
    $("#resultado").scrollIntoView({ behavior: "smooth", block: "start" });
  } catch (e) {
    console.error(e);
    let msg = e && e.message ? e.message : String(e);
    if (e instanceof Anthropic.APIUserAbortError || E.cancelado) msg = "Elaboração interrompida.";
    else if (e instanceof Anthropic.AuthenticationError) msg = "Chave de API inválida. Confira a chave informada.";
    else if (e instanceof Anthropic.PermissionDeniedError) msg = "A chave não tem permissão para usar este modelo.";
    else if (e instanceof Anthropic.RateLimitError) msg = "Limite de uso da API atingido. Aguarde alguns minutos e tente novamente.";
    else if (e instanceof Anthropic.BadRequestError) msg = "A API recusou a requisição: " + msg;
    else if (e instanceof Anthropic.APIConnectionError) msg = "Falha de conexão com a API da Anthropic. Verifique a internet e tente novamente.";
    else if (e instanceof Anthropic.APIError && e.status >= 500) msg = "Instabilidade no serviço da Anthropic. Tente novamente em instantes.";
    progresso(msg);
    if (E.md) { renderParcial(true); $("#avisoGeracao").innerHTML = '<div class="aviso">O texto parcial produzido até a interrupção está abaixo e pode ser baixado, mas está incompleto.</div>'; }
  } finally { E.stream = null; $("#cancelarGeracao").hidden = true; atualizar(); }
};
$("#cancelarGeracao").onclick = () => { E.cancelado = true; if (E.stream) E.stream.abort(); };

/* ------------------------------------------------------------------ resultado */
function baixar(blob, nome) { const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = nome; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1500); }
$("#baixarWord").onclick = async () => {
  try {
    const blob = await W.gerar(W.blocos(E.md), E.cab, MODELO_DOCX);
    baixar(blob, "Estudo de Caso" + (E.cab.autos ? " - " + E.cab.autos.replace(/[\\/:*?"<>|]+/g, "_") : "") + ".docx");
  } catch (e) { window.HUB.toast(e.message || "Não foi possível gerar o Word.", 5000); }
};
$("#copiar").onclick = () => window.HUB_DOC.copiar($("#folha").innerText);

/* estudo da sessão anterior (somente nesta aba) */
try { const s = JSON.parse(sessionStorage.getItem(K_ESTUDO) || "null"); if (s && s.md) { E.md = s.md; E.cab = s.cab; renderParcial(true); $("#avisoGeracao").innerHTML = '<div class="aviso info">Exibindo o último estudo gerado nesta aba.</div>'; } } catch (e) { /* ignora */ }
window.EC_ESTADO = E; /* usado nos testes automatizados */
atualizar();
