/* Pesquisa doutrinária: carrega a base cifrada (ramo doutrina-base), guarda os livros no navegador (IndexedDB),
   busca por termos num Web Worker, faz a busca inteligente com o Claude, formata as citações em ABNT, mostra a
   página do livro original (baixado do Drive) e exporta a seleção em Word. */
import Anthropic from "https://cdn.jsdelivr.net/npm/@anthropic-ai/sdk@1.1.0/+esm";

const $ = s => document.querySelector(s), esc = s => window.HUB.esc(s), P = window.TPC_PECA;
const BASE = "https://raw.githubusercontent.com/viniciuspapapapa/viniciuspapapapa.github.io/doutrina-base/";
const DRIVE_VER = id => "https://drive.google.com/file/d/" + encodeURIComponent(id) + "/view";
const DRIVE_BAIXAR = id => "https://drive.usercontent.google.com/download?id=" + encodeURIComponent(id) + "&export=download&confirm=t";
const SERVICO = ((window.HUB_CONFIG || {}).sherlock || {});
const K_CHAVE = "hub_claude_chave", K_CONS = "doutrina_consentimento_anthropic", K_SEL = "doutrina_selecao";
const OBRAS = window.DOUTRINA_OBRAS || {};
const E = { manifesto: null, livros: new Map(), carregados: new Set(), req: 0, pend: new Map(), res: null, filtroObra: "", selecao: new Map(), ia: null, ocupado: false };

/* ------------------------------------------------------------------ cifra e cache */
let CHAVE = null;
async function chave() {
  if (CHAVE) return CHAVE;
  let k = null;
  try { k = sessionStorage.getItem("hub_chave"); if (!k) { const l = JSON.parse(localStorage.getItem("hub_chave") || "null"); if (l && l.ate > Date.now()) k = l.k; } } catch (e) { k = null; }
  if (!k) { location.replace("../login/?volta=" + encodeURIComponent(location.pathname)); throw new Error("Sessão expirada."); }
  CHAVE = await crypto.subtle.importKey("raw", Uint8Array.from(atob(k), c => c.charCodeAt(0)), "AES-GCM", false, ["decrypt"]);
  return CHAVE;
}
async function abrir(buf) {
  const u = new Uint8Array(buf), k = await chave();
  let claro;
  try { claro = await crypto.subtle.decrypt({ name: "AES-GCM", iv: u.slice(0, 12) }, k, u.slice(12)); }
  catch (e) { throw new Error("A base não pôde ser decifrada com a senha atual do HUB. Clique em Atualizar base para gerá-la novamente."); }
  if (typeof DecompressionStream !== "function") throw new Error("Este navegador é antigo demais para a pesquisa doutrinária. Atualize o Chrome, o Edge, o Firefox ou o Safari.");
  const txt = await new Response(new Blob([claro]).stream().pipeThrough(new DecompressionStream("gzip"))).text();
  return JSON.parse(txt);
}
const DB = {
  abrir() { return this.p || (this.p = new Promise((ok, falha) => { try { const r = indexedDB.open("hub_doutrina", 1); r.onupgradeneeded = () => r.result.createObjectStore("livros"); r.onsuccess = () => ok(r.result); r.onerror = () => falha(r.error); } catch (e) { falha(e); } })); },
  async ler(id) { try { const db = await this.abrir(); return await new Promise(ok => { const r = db.transaction("livros").objectStore("livros").get(id); r.onsuccess = () => ok(r.result || null); r.onerror = () => ok(null); }); } catch (e) { return null; } },
  async gravar(id, v) { try { const db = await this.abrir(); await new Promise(ok => { const t = db.transaction("livros", "readwrite"); t.objectStore("livros").put(v, id); t.oncomplete = ok; t.onerror = ok; t.onabort = ok; }); } catch (e) { /* sem cache */ } },
  async chaves() { try { const db = await this.abrir(); return await new Promise(ok => { const r = db.transaction("livros").objectStore("livros").getAllKeys(); r.onsuccess = () => ok(r.result || []); r.onerror = () => ok([]); }); } catch (e) { return []; } },
  async apagar(id) { try { const db = await this.abrir(); await new Promise(ok => { const t = db.transaction("livros", "readwrite"); t.objectStore("livros").delete(id); t.oncomplete = ok; t.onerror = ok; }); } catch (e) { /* ignora */ } }
};

/* ------------------------------------------------------------------ worker de busca */
const W = new Worker(URL.createObjectURL(new Blob(["(" + DOUTRINA_MOTOR.toString() + ")(self);"], { type: "text/javascript" })));
W.onmessage = e => { const d = e.data, f = E.pend.get(d.req); if (f) { E.pend.delete(d.req); d.tipo === "erro" ? f.falha(new Error(d.erro)) : f.ok(d); } };
const pedir = msg => new Promise((ok, falha) => { const req = ++E.req; E.pend.set(req, { ok, falha }); W.postMessage(Object.assign({ req }, msg)); });

/* ------------------------------------------------------------------ dados das obras e citação ABNT */
function meta(id) {
  const l = E.livros.get(id) || {}, auto = l.meta || {}, man = OBRAS[id] || {}, m = {};
  for (const k of ["tipo", "autor", "titulo", "subtitulo", "edicao", "local", "editora", "ano", "volume", "periodico", "paginas", "mes", "semImpressa"]) m[k] = man[k] !== undefined && man[k] !== "" ? man[k] : (auto[k] || "");
  m.area = man.area || l.area || "Outras obras";
  m.tipo = m.tipo || "livro";
  return m;
}
function sobrenomes(autor) {
  const a = String(autor || "").replace(/\s*\((?:coord|org|ed)s?\.\)\s*/gi, "");
  if (!a.trim()) return "";
  if (/et al\./i.test(a)) return a.split(",")[0].trim().toUpperCase() + " et al.";
  return a.split(";").map(s => s.split(",")[0].trim().toUpperCase()).filter(Boolean).join("; ");
}
function referencia(id, pag, html) {
  const m = meta(id), b = s => html ? "<b>" + esc(s) + "</b>" : s, t = s => html ? esc(s) : s;
  const titulo = m.titulo + (m.subtitulo ? ": " + m.subtitulo : "");
  if (m.tipo === "artigo") {
    return [t(m.autor ? m.autor + ". " : ""), t(titulo + ". "), b(m.periodico || ""), t((m.local ? ", " + m.local : "") + (m.volume ? ", v. " + m.volume : "") + (pag ? ", p. " + pag : m.paginas ? ", p. " + m.paginas : "") + ", " + [m.mes, m.ano].filter(Boolean).join(" ") + ".")].join("");
  }
  const pub = (m.local || "[S. l.]") + ": " + (m.editora || "[s. n.]") + ", " + (m.ano || "[s. d.]") + ".";
  return t(m.autor ? m.autor + ". " : "") + b(titulo) + t(". " + (m.edicao ? m.edicao + " " : "") + pub + (m.volume ? " v. " + m.volume + "." : "") + (pag ? " p. " + pag + "." : ""));
}
const autorData = (id, pag) => { const m = meta(id); return "(" + [sobrenomes(m.autor) || m.titulo.toUpperCase(), m.ano || "[s. d.]"].join(", ") + (pag ? ", p. " + pag : "") + ")"; };
const paginaPadrao = it => { const m = meta(it.id); return m.semImpressa ? "" : (it.imp || ""); };
const nomeCurto = id => { const m = meta(id); return (sobrenomes(m.autor) || "") + (sobrenomes(m.autor) ? " · " : "") + m.titulo + (m.volume ? ", v. " + m.volume : "") + (m.edicao || m.ano ? " (" + [m.edicao, m.ano].filter(Boolean).join(" ") + ")" : ""); };

/* ------------------------------------------------------------------ base */
function infoBase() {
  const M = E.manifesto; if (!M) return;
  const n = M.livros.length, pags = M.livros.reduce((s, l) => s + l.paginas, 0), ok = E.carregados.size;
  const quando = new Date(M.atualizado).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
  $("#baseInfo").innerHTML = "<b>" + n + "</b> " + (n === 1 ? "obra" : "obras") + " · " + pags.toLocaleString("pt-BR") + " páginas · base atualizada em " + quando + (ok < n ? " · <span class=\"mudo\">" + ok + " de " + n + " carregadas neste navegador</span>" : "");
  const avisos = [];
  if (M.pendentes && M.pendentes.length) avisos.push(M.pendentes.length + (M.pendentes.length === 1 ? " livro aguarda" : " livros aguardam") + " processamento na próxima atualização: " + M.pendentes.join("; ") + ".");
  if (M.erros && M.erros.length) avisos.push("Não foi possível processar: " + M.erros.map(e => e.arquivo + " (" + e.erro + ")").join("; ") + ".");
  if (avisos.length && !$("#baseEstado").dataset.fixo) $("#baseEstado").textContent = avisos.join(" ");
}
function filtros() {
  const M = E.manifesto; if (!M) return;
  const areas = [...new Set(M.livros.map(l => meta(l.id).area))].sort((a, b) => a.localeCompare(b, "pt-BR"));
  const fa = $("#fArea"), va = fa.value; fa.innerHTML = '<option value="">Todas as áreas</option>' + areas.map(a => "<option>" + esc(a) + "</option>").join(""); fa.value = va;
  const fo = $("#fObra"), vo = fo.value;
  const obras = M.livros.filter(l => !fa.value || meta(l.id).area === fa.value).sort((a, b) => nomeCurto(a.id).localeCompare(nomeCurto(b.id), "pt-BR"));
  fo.innerHTML = '<option value="">Todas as obras</option>' + obras.map(l => '<option value="' + esc(l.id) + '">' + esc(nomeCurto(l.id)) + "</option>").join(""); fo.value = obras.some(l => l.id === vo) ? vo : "";
  $("#obras").innerHTML = '<table class="tabela" style="width:100%;font-size:14px;border-collapse:collapse"><thead><tr><th style="text-align:left">Obra</th><th style="text-align:left">Área</th><th style="text-align:right">Páginas</th><th style="text-align:right">OCR</th><th style="text-align:right">Pág. impressa</th></tr></thead><tbody>' +
    M.livros.slice().sort((a, b) => nomeCurto(a.id).localeCompare(nomeCurto(b.id), "pt-BR")).map(l => '<tr><td><a href="' + DRIVE_VER(l.id) + '" target="_blank" rel="noopener">' + esc(nomeCurto(l.id)) + "</a>" + (E.carregados.has(l.id) ? "" : ' <span class="mudo">(carregando)</span>') + "</td><td>" + esc(meta(l.id).area) + '</td><td style="text-align:right">' + l.paginas + '</td><td style="text-align:right">' + (l.ocr || 0) + '</td><td style="text-align:right">' + (meta(l.id).semImpressa ? "não" : Math.round(100 * (l.impressas || 0) / Math.max(1, l.paginas)) + "%") + "</td></tr>").join("") + "</tbody></table>" +
    '<p class="pequeno mudo" style="margin:8px 0 0">"Pág. impressa" indica em quantas páginas foi identificada a numeração da obra publicada. Nos e-books sem numeração, informe a página da edição física no campo de página antes de copiar a citação.</p>';
}
function barra(f) { const b = $("#barra"); if (f == null) { b.hidden = true; return; } b.hidden = false; b.querySelector("i").style.width = Math.round(Math.min(1, f) * 100) + "%"; }
async function baixarBin(url) { const r = await fetch(url, { cache: "no-cache" }); if (!r.ok) throw Object.assign(new Error("HTTP " + r.status), { status: r.status }); return r.arrayBuffer(); }
async function carregarBase() {
  $("#baseInfo").textContent = "Carregando a base de livros…";
  let M;
  try { M = await abrir(await baixarBin(BASE + "manifesto.bin?t=" + Date.now())); }
  catch (e) {
    if (e.status === 404) { $("#baseInfo").textContent = "A base ainda não foi gerada."; $("#baseEstado").textContent = "Clique em Atualizar base para processar os livros da pasta do Drive. A primeira geração, com o OCR dos livros digitalizados, leva cerca de meia hora."; return; }
    $("#baseInfo").textContent = "Não foi possível carregar a base."; $("#baseEstado").textContent = e.message || String(e); return;
  }
  E.manifesto = M; M.livros.forEach(l => E.livros.set(l.id, l)); filtros(); infoBase();
  const ids = new Set(M.livros.map(l => l.id));
  for (const k of await DB.chaves()) if (!ids.has(k)) DB.apagar(k);
  let feitos = 0, bytes = 0; const total = M.livros.length, falhas = [];
  barra(0);
  const fila = M.livros.slice();
  await Promise.all(Array.from({ length: 4 }, async () => {
    while (fila.length) {
      const l = fila.shift();
      try {
        let c = await DB.ler(l.id);
        if (!c || c.v !== l.v) { const buf = await baixarBin(BASE + "livros/" + l.id + ".bin?v=" + l.v); bytes += buf.byteLength; const d = await abrir(buf); c = { v: l.v, paginas: d.paginas }; await DB.gravar(l.id, c); }
        await pedir({ tipo: "livro", id: l.id, paginas: c.paginas }); E.carregados.add(l.id);
      } catch (e) { falhas.push(meta(l.id).titulo + ": " + (e.message || e)); }
      feitos++; barra(feitos / total);
      $("#baseEstado").textContent = feitos < total ? "Preparando a base neste navegador: " + feitos + " de " + total + " obras" + (bytes ? " (" + (bytes / 1048576).toFixed(1).replace(".", ",") + " MB baixados; nas próximas visitas, só os livros novos serão baixados)" : "") + "…" : "";
      if (feitos % 4 === 0 || feitos === total) infoBase();
    }
  }));
  barra(null); infoBase(); filtros();
  if (falhas.length) { $("#baseEstado").dataset.fixo = "1"; $("#baseEstado").textContent = "Algumas obras não carregaram: " + falhas.join("; ") + ". Recarregue a página para tentar de novo."; }
  else { delete $("#baseEstado").dataset.fixo; infoBase(); }
  if ($("#q").value.trim() && !E.res) buscar();
}

/* ------------------------------------------------------------------ atualização (GitHub Actions via serviço) */
async function servico(rota, metodo) {
  if (!SERVICO.url) throw new Error("O serviço de consulta do HUB não está configurado.");
  const r = await fetch(SERVICO.url.replace(/\/$/, "") + rota, { method: metodo || "GET", headers: SERVICO.token ? { "X-App-Token": SERVICO.token } : {} });
  let d = null; try { d = await r.json(); } catch (e) { d = null; }
  if (!r.ok) throw new Error((d && d.erro) || "Serviço indisponível (HTTP " + r.status + ").");
  return d;
}
let vigia = null;
function mostraExecucao(d) {
  if (!d || !d.estado) return false;
  const quando = d.iniciado ? new Date(d.iniciado).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }) : "";
  if (d.estado === "queued" || d.estado === "in_progress" || d.estado === "waiting" || d.estado === "pending") {
    $("#baseEstado").dataset.fixo = "1";
    $("#baseEstado").innerHTML = "Atualização em andamento" + (quando ? " (iniciada às " + quando + ")" : "") + ". Os livros novos são baixados do Drive e lidos com OCR quando digitalizados, o que pode levar alguns minutos por livro. A base será recarregada ao final." + (d.url ? ' <a href="' + esc(d.url) + '" target="_blank" rel="noopener">Acompanhar</a>' : "");
    $("#atualizar").disabled = true; return true;
  }
  $("#atualizar").disabled = false; return false;
}
async function acompanhar() {
  clearInterval(vigia);
  vigia = setInterval(async () => {
    try {
      const d = await servico("/doutrina/status");
      if (!mostraExecucao(d)) {
        clearInterval(vigia); delete $("#baseEstado").dataset.fixo;
        if (d.conclusao && d.conclusao !== "success") $("#baseEstado").textContent = "A última atualização terminou com falha (" + d.conclusao + "). Tente de novo ou avise o administrador do HUB.";
        else { window.HUB.toast("Base atualizada.", 4000); E.carregados.clear(); await carregarBase(); }
      }
    } catch (e) { /* tenta na próxima */ }
  }, 30000);
}
$("#atualizar").onclick = async () => {
  $("#atualizar").disabled = true;
  try {
    const d = await servico("/doutrina/atualizar", "POST");
    window.HUB.toast(d.jaEmAndamento ? "Já há uma atualização em andamento." : "Atualização iniciada. Os livros novos do Drive serão processados.", 5000);
    mostraExecucao(Object.assign({ estado: "queued" }, d.execucao || {})); acompanhar();
  } catch (e) { $("#atualizar").disabled = false; window.HUB.toast(e.message || String(e), 7000); }
};
servico("/doutrina/status").then(d => { if (mostraExecucao(d)) acompanhar(); }).catch(() => { /* serviço sem a rota ainda */ });

/* ------------------------------------------------------------------ busca */
function idsFiltrados() {
  const M = E.manifesto; if (!M) return [];
  const o = $("#fObra").value, a = $("#fArea").value;
  return M.livros.filter(l => (!o || l.id === o) && (!a || meta(l.id).area === a)).map(l => l.id);
}
async function buscar() {
  const q = $("#q").value.trim(); if (!q) { $("#q").focus(); return; }
  if (!E.carregados.size) { $("#estado").textContent = "A base ainda está carregando; a busca começa assim que houver obras disponíveis."; return; }
  E.ia = null; E.filtroObra = "";
  const t0 = performance.now();
  const r = await pedir({ tipo: "buscar", consulta: q, ids: idsFiltrados(), porObra: +$("#fPor").value, max: 80 });
  E.res = r; $("#sintese").hidden = true;
  $("#estado").textContent = r.total ? "" : "Nenhum trecho encontrado. Tente sinônimos, menos palavras ou a busca inteligente.";
  mostrar(r.itens, "Busca por " + r.termos.join(", ") + ": " + r.total.toLocaleString("pt-BR") + (r.total === 1 ? " página" : " páginas") + " em " + Object.keys(r.porLivro).length + (Object.keys(r.porLivro).length === 1 ? " obra" : " obras") + (r.parcial ? " (nem todas as palavras aparecem juntas)" : "") + " · " + Math.round(performance.now() - t0) + " ms");
}
function marcar(txt, marcas) {
  let out = "", p = 0;
  for (const [a, b] of marcas) { if (a < p) continue; out += esc(txt.slice(p, a)) + "<mark>" + esc(txt.slice(a, b)) + "</mark>"; p = b; }
  out += esc(txt.slice(p));
  return out.split("\n").map(s => "<p>" + s + "</p>").join("");
}
const chaveItem = it => it.id + ":" + it.i + ":" + (it.trecho || "").length;
function mostrar(itens, resumo) {
  E.itens = itens;
  $("#resBloco").hidden = false; $("#resumo").textContent = resumo || "";
  const lista = E.filtroObra ? itens.filter(it => it.id === E.filtroObra) : itens;
  $("#lista").innerHTML = lista.length ? lista.map((it, k) => {
    const idx = itens.indexOf(it), m = meta(it.id), pag = paginaPadrao(it), sel = E.selecao.has(chaveItem(it));
    return '<article class="trecho" data-k="' + idx + '"><div class="trecho-cab"><h3>' + esc(nomeCurto(it.id)) + "</h3><small>" + (pag ? "p. " + esc(pag) + " · " : "") + "pág. " + it.pdf + " do PDF" + (it.ia ? " · [" + esc(it.ia) + "]" : "") + "</small></div>" +
      '<div class="txt">' + (it.inicio ? "<p class=\"mudo\" style=\"margin:0\">[…]</p>" : "") + marcar(it.trecho, it.marcas || []) + (it.final ? "<p class=\"mudo\" style=\"margin:0\">[…]</p>" : "") + "</div>" +
      (it.motivo ? '<p class="motivo">' + esc(it.motivo) + "</p>" : "") +
      '<div class="acoes"><button type="button" class="btn sec" data-a="cit">Copiar citação</button><button type="button" class="btn sec" data-a="ref">Copiar referência</button><button type="button" class="btn sec" data-a="pag">Página inteira</button><button type="button" class="btn sec" data-a="ver">Ver no livro</button><a class="btn sec" href="' + DRIVE_VER(it.id) + '" target="_blank" rel="noopener">Drive</a>' +
      '<label class="pag">p.<input type="text" inputmode="numeric" data-a="p" value="' + esc(pag) + '" placeholder="' + (m.semImpressa || !it.imp ? "?" : "") + '" title="Página para a citação"></label>' +
      '<label class="sel"><input type="checkbox" data-a="sel"' + (sel ? " checked" : "") + "> Selecionar</label></div></article>";
  }).join("") : '<p class="vazio">Nenhum trecho para exibir.</p>';
  const cont = {}; itens.forEach(it => cont[it.id] = (cont[it.id] || 0) + 1);
  const por = E.res && !E.ia ? E.res.porLivro : cont;
  $("#lado").innerHTML = Object.keys(por).length ? "<h3>Por obra</h3>" + Object.entries(por).sort((a, b) => b[1] - a[1]).map(([id, n]) => '<button type="button" class="obra" data-obra="' + esc(id) + '" aria-pressed="' + (E.filtroObra === id) + '"><span>' + esc(nomeCurto(id)) + "</span><b>" + n + "</b></button>").join("") + (E.filtroObra ? '<button type="button" class="obra" data-obra=""><span>Mostrar todas</span></button>' : "") + (E.res && !E.ia ? '<p class="pequeno mudo" style="margin:8px 0 0">Número de páginas com ocorrência. A lista mostra os trechos mais relevantes de cada obra; escolha uma obra para ver só os dela.</p>' : "") : "";
  selbar();
}
$("#lado").addEventListener("click", async e => {
  const b = e.target.closest("[data-obra]"); if (!b) return;
  const id = b.dataset.obra;
  if (id && E.res && !E.ia && $("#fObra").value !== id && (E.res.porLivro[id] || 0) > E.itens.filter(it => it.id === id).length) {
    const r = await pedir({ tipo: "buscar", consulta: $("#q").value.trim(), ids: [id], porObra: 40, max: 40 });
    E.filtroObra = id; const outros = E.itens.filter(it => it.id !== id); mostrar(outros.concat(r.itens), $("#resumo").textContent); return;
  }
  E.filtroObra = id; mostrar(E.itens, $("#resumo").textContent);
});
$("#buscar").onclick = buscar;
$("#q").addEventListener("keydown", e => { if (e.key === "Enter") { e.preventDefault(); buscar(); } });
$("#fArea").onchange = () => { filtros(); if (E.res) buscar(); };
$("#fObra").onchange = () => { if (E.res) buscar(); };
$("#fPor").onchange = () => { if (E.res && !E.ia) buscar(); };

/* ------------------------------------------------------------------ ações dos trechos */
function textoSelecionado(art) {
  const s = window.getSelection(); if (!s || s.isCollapsed) return "";
  const r = s.getRangeAt(0); if (!art.querySelector(".txt").contains(r.commonAncestorContainer)) return "";
  return s.toString().replace(/\s*\n\s*/g, " ").trim();
}
async function copiar(texto, html) {
  try {
    if (html && window.ClipboardItem && navigator.clipboard.write) await navigator.clipboard.write([new ClipboardItem({ "text/plain": new Blob([texto], { type: "text/plain" }), "text/html": new Blob([html], { type: "text/html" }) })]);
    else await navigator.clipboard.writeText(texto);
    return true;
  } catch (e) { try { await navigator.clipboard.writeText(texto); return true; } catch (x) { return false; } }
}
function citacao(it, trecho, pag) {
  const t = trecho.replace(/\s+/g, " ").trim(), ad = autorData(it.id, pag), longa = t.length > 300; /* ABNT: mais de três linhas vai em recuo de 4 cm, sem aspas */
  const texto = longa ? t + " " + ad + "." : "“" + t + "” " + ad + ".";
  const html = longa ? '<p style="margin:0 0 0 4cm;font-size:10pt;text-align:justify;line-height:1">' + esc(t) + " " + esc(ad) + ".</p>" : "<p>“" + esc(t) + "” " + esc(ad) + ".</p>";
  return { texto, html, longa };
}
$("#lista").addEventListener("click", async e => {
  const b = e.target.closest("[data-a]"), art = e.target.closest(".trecho"); if (!b || !art) return;
  const it = E.itens[+art.dataset.k], pag = art.querySelector('[data-a="p"]').value.trim(), a = b.dataset.a;
  if (a === "cit") {
    const sel = textoSelecionado(art), c = citacao(it, sel || it.trecho, pag);
    const ok = await copiar(c.texto, c.html);
    window.HUB.toast(ok ? (sel ? "Citação do trecho selecionado copiada" : "Citação copiada") + (c.longa ? " (citação longa: no Word, fica em recuo de 4 cm, sem aspas)" : "") + (pag ? "." : ". Atenção: sem número de página.") : "Não foi possível copiar.", 4500);
  } else if (a === "ref") {
    const ok = await copiar(referencia(it.id, pag, false), "<p>" + referencia(it.id, pag, true) + "</p>");
    window.HUB.toast(ok ? "Referência copiada." : "Não foi possível copiar.", 3000);
  } else if (a === "pag") {
    const d = await pedir({ tipo: "pagina", id: it.id, i: it.i }); if (!d.pagina) return;
    const txt = art.querySelector(".txt"), termos = (E.res && E.res.termos) || [];
    txt.innerHTML = marcar(d.pagina.texto, marcasDe(d.pagina.texto, termos)) + '<p class="pequeno mudo">Página ' + d.pagina.pdf + " de " + d.pagina.total + " do PDF" + (d.pagina.imp ? " (p. " + esc(d.pagina.imp) + " da obra)" : "") + "</p>";
    it.trecho = d.pagina.texto; it.marcas = marcasDe(d.pagina.texto, termos); it.inicio = it.final = false; b.remove();
  } else if (a === "ver") verLivro(it.id, it.pdf);
});
function marcasDe(texto, termos) {
  const M = DOUTRINA_MOTOR(null), n = M.norm(texto), out = [];
  for (const t of M.interpretar(termos.filter(x => x[0] !== "-").map(x => /\s/.test(x) ? '"' + x + '"' : x).join(" "))) { t.re.lastIndex = 0; let m; while ((m = t.re.exec(n)) && out.length < 400) { const i = m.index + m[0].length - m[1].length; out.push([i, i + m[1].length]); } }
  return out.sort((a, b) => a[0] - b[0]);
}
$("#lista").addEventListener("change", e => {
  const art = e.target.closest(".trecho"); if (!art) return;
  const it = E.itens[+art.dataset.k];
  if (e.target.dataset.a === "sel") {
    const k = chaveItem(it);
    if (e.target.checked) E.selecao.set(k, { it: Object.assign({}, it), pag: art.querySelector('[data-a="p"]').value.trim(), trecho: textoSelecionado(art) || it.trecho }); else E.selecao.delete(k);
    selbar();
  } else if (e.target.dataset.a === "p") { const s = E.selecao.get(chaveItem(it)); if (s) s.pag = e.target.value.trim(); }
});
function selbar() {
  const n = E.selecao.size; $("#selbar").hidden = !n;
  $("#selInfo").textContent = n + (n === 1 ? " trecho selecionado" : " trechos selecionados") + " para o Word";
}
$("#limparSel").onclick = () => { E.selecao.clear(); document.querySelectorAll('[data-a="sel"]').forEach(c => c.checked = false); selbar(); };

/* ------------------------------------------------------------------ Word */
$("#word").onclick = async () => {
  const itens = [...E.selecao.values()]; if (!itens.length) return;
  const tema = $("#q").value.trim(), blocos = [{ t: "tit", texto: "Pesquisa doutrinária" }];
  if (tema) blocos.push({ t: "p", r: [["Tema: ", "bo"], [tema, "n"]] });
  if (E.ia && E.ia.sintese) { blocos.push({ t: "h", texto: "Síntese" }); E.ia.sintese.split(/\n+/).filter(Boolean).forEach(s => blocos.push({ t: "p", r: s })); }
  const grupos = new Map(); itens.forEach(s => { if (!grupos.has(s.it.id)) grupos.set(s.it.id, []); grupos.get(s.it.id).push(s); });
  blocos.push({ t: "h", texto: "Trechos selecionados" });
  for (const [id, lista] of grupos) {
    blocos.push({ t: "sub", texto: nomeCurto(id) });
    for (const s of lista) {
      const t = s.trecho.replace(/\s+/g, " ").trim(), ad = autorData(id, s.pag);
      if (t.length > 300) blocos.push({ t: "cit", texto: t + " " + ad + "." });
      else blocos.push({ t: "p", r: "“" + t + "” " + ad + "." });
      if (!s.pag) blocos.push({ t: "p", r: [["Página não identificada na obra (página " + s.it.pdf + " do PDF): confira na edição antes de citar.", "i"]] });
    }
  }
  blocos.push({ t: "h", texto: "Referências" });
  [...grupos.keys()].map(id => referencia(id, "", false)).sort((a, b) => a.localeCompare(b, "pt-BR")).forEach(r => blocos.push({ t: "p", r }));
  blocos.push({ t: "data", texto: "Belo Horizonte, " + P.dataExtenso(new Date()) + "." });
  try { P.baixar(await P.docx(blocos), "Pesquisa doutrinaria - " + (tema || "tema").replace(/[\\/:*?"<>|]+/g, " ").slice(0, 80)); }
  catch (e) { window.HUB.toast(e.message || "Não foi possível gerar o Word.", 5000); }
};

/* ------------------------------------------------------------------ visualização do livro (PDF do Drive) */
const PDFS = new Map();
function script(url) { return new Promise((ok, falha) => { const s = document.createElement("script"); s.src = url; s.onload = ok; s.onerror = () => falha(new Error("Não foi possível carregar o visualizador de PDF.")); document.head.appendChild(s); }); }
async function pdfjs() {
  if (window.pdfjsLib) return window.pdfjsLib;
  const V = new URL("../vendor/pdfjs/", location.href).href;
  try { await script(V + "pdf.min.js"); window.pdfjsLib.GlobalWorkerOptions.workerSrc = V + "pdf.worker.min.js"; }
  catch (e) { await script("https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js"); window.pdfjsLib.GlobalWorkerOptions.workerSrc = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js"; }
  return window.pdfjsLib;
}
const V = { id: null, doc: null, p: 1, gen: 0 };
async function verLivro(id, p) {
  const dlg = $("#visor"), corpo = $("#vCorpo"), g = ++V.gen;
  $("#vTitulo").textContent = nomeCurto(id); $("#vDrive").href = DRIVE_VER(id); $("#vPag").textContent = "";
  corpo.innerHTML = '<p class="pequeno">Baixando o livro do Drive…</p>';
  if (!dlg.open) dlg.showModal();
  try {
    const lib = await pdfjs();
    if (!PDFS.has(id)) {
      /* o serviço do HUB repassa o PDF da pasta de doutrina; o download direto do Drive é a segunda opção */
      const fontes = (SERVICO.url ? [SERVICO.url.replace(/\/$/, "") + "/doutrina/pdf?id=" + encodeURIComponent(id)] : []).concat([DRIVE_BAIXAR(id)]);
      let r = null;
      for (const u of fontes) { try { const x = await fetch(u, u.indexOf(SERVICO.url || "\u0000") === 0 && SERVICO.token ? { headers: { "X-App-Token": SERVICO.token } } : {}); if (x.ok) { r = x; break; } } catch (e) { /* tenta a próxima */ } }
      if (!r) { if (g === V.gen) previa(id, p); return; }
      const total = +r.headers.get("content-length") || 0, leitor = r.body.getReader(), partes = []; let lido = 0;
      for (;;) { const { done, value } = await leitor.read(); if (done) break; partes.push(value); lido += value.length; if (g === V.gen) corpo.innerHTML = '<p class="pequeno">Baixando o livro do Drive: ' + (lido / 1048576).toFixed(1).replace(".", ",") + (total ? " de " + (total / 1048576).toFixed(1).replace(".", ",") : "") + " MB…</p>"; }
      const buf = new Uint8Array(lido); let o = 0; for (const pt of partes) { buf.set(pt, o); o += pt.length; }
      if (PDFS.size >= 2) PDFS.delete(PDFS.keys().next().value);
      PDFS.set(id, await lib.getDocument({ data: buf, isEvalSupported: false }).promise);
    }
    if (g !== V.gen) return;
    V.id = id; V.doc = PDFS.get(id); V.p = Math.min(Math.max(1, p), V.doc.numPages); await pagina();
  } catch (e) { if (g === V.gen) corpo.innerHTML = '<p class="aviso">' + esc(e.message || String(e)) + ' Use o botão "Abrir no Drive".</p>'; }
}
/* último recurso: a prévia do próprio Drive, embutida, com a indicação da página */
function previa(id, p) {
  V.doc = null; $("#vPag").textContent = "vá à pág. " + p + " do PDF";
  $("#vCorpo").innerHTML = '<p class="pequeno" style="margin:0 0 8px;width:100%">Não foi possível baixar o livro para o visualizador do HUB; abaixo, a prévia do Drive. Avance até a página ' + p + " do PDF.</p>" +
    '<iframe src="https://drive.google.com/file/d/' + encodeURIComponent(id) + '/preview" style="width:100%;height:calc(100% - 30px);border:0;background:#fff" allow="autoplay" title="Prévia do livro no Drive"></iframe>';
}
async function pagina() {
  const pg = await V.doc.getPage(V.p), corpo = $("#vCorpo"), larg = Math.min(corpo.clientWidth - 28, 900);
  const vp0 = pg.getViewport({ scale: 1 }), escala = larg / vp0.width, dpr = window.devicePixelRatio || 1, vp = pg.getViewport({ scale: escala * dpr });
  const cv = document.createElement("canvas"); cv.width = vp.width; cv.height = vp.height; cv.style.width = Math.round(vp.width / dpr) + "px";
  await pg.render({ canvasContext: cv.getContext("2d"), viewport: vp }).promise;
  corpo.innerHTML = ""; corpo.appendChild(cv); corpo.scrollTop = 0;
  const l = E.livros.get(V.id);
  $("#vPag").textContent = "pág. " + V.p + " de " + V.doc.numPages + " do PDF";
  if (l) pedir({ tipo: "pagina", id: V.id, i: V.p - 1 }).then(d => { if (d.pagina && d.pagina.imp && d.pagina.pdf === V.p && !meta(V.id).semImpressa) $("#vPag").textContent += " · p. " + d.pagina.imp + " da obra"; }).catch(() => {});
}
$("#vAnt").onclick = () => { if (V.doc && V.p > 1) { V.p--; pagina(); } };
$("#vProx").onclick = () => { if (V.doc && V.p < V.doc.numPages) { V.p++; pagina(); } };
$("#vFechar").onclick = () => $("#visor").close();
$("#visor").addEventListener("keydown", e => { if (e.key === "ArrowLeft") $("#vAnt").click(); if (e.key === "ArrowRight") $("#vProx").click(); });

/* ------------------------------------------------------------------ busca inteligente (Claude) */
try { const k = localStorage.getItem(K_CHAVE); if (k) { $("#chave").value = k; $("#lembrarChave").checked = true; } if (localStorage.getItem(K_CONS) === "1") $("#consentimento").checked = true; } catch (e) { /* ignora */ }
$("#lembrarChave").onchange = () => { try { if ($("#lembrarChave").checked && $("#chave").value.trim()) localStorage.setItem(K_CHAVE, $("#chave").value.trim()); else if (!$("#lembrarChave").checked) localStorage.removeItem(K_CHAVE); } catch (e) { /* ignora */ } };
$("#chave").onchange = () => $("#lembrarChave").onchange();
$("#consentimento").onchange = () => { try { localStorage.setItem(K_CONS, $("#consentimento").checked ? "1" : "0"); } catch (e) { /* ignora */ } };

const SISTEMA_TERMOS = "Você auxilia advogados criminalistas brasileiros na pesquisa em livros de doutrina jurídica. Recebe um tema e devolve expressões de busca que localizem, no texto corrido de manuais, cursos e tratados brasileiros, os trechos que desenvolvem esse tema. Use o vocabulário técnico da doutrina brasileira: o nome usual do instituto e suas variações, institutos e teorias correlatos, expressões latinas consagradas, nomenclaturas alternativas e os dispositivos legais pertinentes no formato em que aparecem nos livros (por exemplo, art. 157). Cada expressão deve ter de uma a quatro palavras, tal como escritas nos livros; prefira expressões específicas e evite palavras genéricas isoladas (como prova, crime, processo). Não inclua nomes de autores nem de tribunais.";
const SCHEMA_TERMOS = { type: "object", additionalProperties: false, required: ["expressoes"], properties: { expressoes: { type: "array", items: { type: "string" } } } };
const SISTEMA_SELECAO = "Você seleciona, entre trechos de livros de doutrina jurídica brasileira, os mais úteis para fundamentar uma peça de um advogado criminalista sobre o tema indicado. Avalie a pertinência substantiva: o trecho efetivamente define o instituto, expõe uma posição doutrinária, apresenta requisitos, critica ou fundamenta, e não apenas menciona o tema de passagem. Nunca reescreva nem resuma o conteúdo dos trechos como se fossem citações; apenas os indique pelo identificador. Ordene do mais útil para o menos útil, escolhendo até doze trechos e evitando repetir o mesmo conteúdo. Para cada um, escreva uma frase objetiva dizendo o que ele oferece à argumentação (por exemplo: define o instituto e seus requisitos; posição favorável à defesa quanto a; diverge da corrente majoritária). Depois, escreva uma síntese em português formal, em até dois parágrafos, do que a doutrina selecionada sustenta sobre o tema, indicando entre colchetes o identificador dos trechos em que cada afirmação se apoia (por exemplo, [t3]). Se nenhum trecho for pertinente, devolva a lista vazia e explique na síntese.";
const SCHEMA_SELECAO = { type: "object", additionalProperties: false, required: ["selecionados", "sintese"], properties: { selecionados: { type: "array", items: { type: "object", additionalProperties: false, required: ["id", "contribuicao"], properties: { id: { type: "string" }, contribuicao: { type: "string" } } } }, sintese: { type: "string" } } };
function erroApi(e) {
  const msg = String(e && e.message || "");
  if (e instanceof Anthropic.AuthenticationError) return "Chave da API da Anthropic inválida.";
  if (/credit balance/i.test(msg)) return "A conta da Anthropic está sem créditos. Adicione créditos em console.anthropic.com, em Billing.";
  if (e instanceof Anthropic.PermissionDeniedError) return "A chave da Anthropic não tem permissão para este modelo.";
  if (e instanceof Anthropic.RateLimitError) return "Limite de uso da API da Anthropic atingido; aguarde alguns minutos e tente novamente.";
  if (e instanceof Anthropic.APIConnectionError) return "Falha de conexão com a API da Anthropic.";
  if (e && (e.status === 529 || e.status === 503)) return "A API da Anthropic está sobrecarregada no momento; tente novamente em alguns minutos.";
  if (e instanceof Anthropic.APIError) return "Erro da API da Anthropic" + (e.status ? " (" + e.status + ")" : "") + (msg ? ": " + msg.replace(/^\d{3}\s*/, "").slice(0, 200) : "") + ".";
  return msg || String(e);
}
async function perguntar(cli, sistema, schema, conteudo, esforco) {
  const r = await cli.beta.messages.create({
    model: $("#modelo").value, max_tokens: 8000, system: sistema,
    thinking: { type: "adaptive" }, output_config: { effort: esforco, format: { type: "json_schema", schema } },
    messages: [{ role: "user", content: conteudo }],
    betas: ["server-side-fallback-2026-07-01"], fallbacks: "default"
  });
  if (r.stop_reason === "refusal") throw new Error("O modelo recusou a análise deste tema.");
  if (r.stop_reason === "max_tokens") throw new Error("A resposta do modelo excedeu o limite; tente um tema mais específico.");
  return JSON.parse(r.content.filter(b => b.type === "text").map(b => b.text).join(""));
}
$("#buscarIA").onclick = async () => {
  const tema = $("#q").value.trim(); if (!tema) { $("#q").focus(); return; }
  if (!$("#chave").value.trim() || !$("#consentimento").checked) { $("#iaCfg").open = true; $("#estado").textContent = "Para a busca inteligente, informe a chave da API da Anthropic e marque a autorização de envio."; $("#chave").focus(); return; }
  if (!E.carregados.size) { $("#estado").textContent = "A base ainda está carregando."; return; }
  if (E.ocupado) return; E.ocupado = true; $("#buscarIA").disabled = true;
  try {
    const cli = new Anthropic({ apiKey: $("#chave").value.trim(), dangerouslyAllowBrowser: true, maxRetries: 3 });
    $("#estado").textContent = "O Claude está traduzindo o tema para o vocabulário da doutrina…";
    const t = await perguntar(cli, SISTEMA_TERMOS, SCHEMA_TERMOS, "Tema: " + tema + "\n\nDevolva de 6 a 14 expressões de busca.", "low");
    const expressoes = [tema].concat((t.expressoes || []).map(s => String(s).trim()).filter(Boolean)).slice(0, 15);
    $("#estado").textContent = "Buscando " + expressoes.length + " expressões nos livros…";
    const ids = idsFiltrados(), vistos = new Map();
    for (const [k, ex] of expressoes.entries()) {
      const r = await pedir({ tipo: "buscar", consulta: ex, ids, porObra: 3, max: 12, tamanho: 900 });
      r.itens.forEach((it, pos) => { const c = it.id + ":" + it.i, s = (k === 0 ? 1.3 : 1) / (1 + pos * 0.35); const v = vistos.get(c); if (v) { v.s += s; v.expr.add(ex); } else vistos.set(c, { it, s, expr: new Set([ex]) }); });
    }
    const porObra = {}, cand = [...vistos.values()].sort((a, b) => b.s - a.s).filter(v => (porObra[v.it.id] = (porObra[v.it.id] || 0) + 1) <= 4).slice(0, 36);
    if (!cand.length) { $("#estado").textContent = "Nenhum trecho encontrado para as expressões sugeridas: " + expressoes.join("; ") + "."; return; }
    cand.forEach((c, i) => c.tid = "t" + (i + 1));
    $("#estado").textContent = "O Claude está lendo " + cand.length + " trechos candidatos e escolhendo os mais pertinentes…";
    const conteudo = "<tema>" + tema + "</tema>\n\n" + cand.map(c => '<trecho id="' + c.tid + '" obra="' + nomeCurto(c.it.id).replace(/"/g, "'") + '">\n' + c.it.trecho.replace(/\s+/g, " ").trim() + "\n</trecho>").join("\n\n");
    const sel = await perguntar(cli, SISTEMA_SELECAO, SCHEMA_SELECAO, conteudo, $("#esforco").value);
    const porId = new Map(cand.map(c => [c.tid, c]));
    const itens = (sel.selecionados || []).map(s => { const c = porId.get(String(s.id).trim()); return c ? Object.assign({}, c.it, { motivo: s.contribuicao, ia: c.tid }) : null; }).filter(Boolean);
    E.ia = { sintese: sel.sintese || "", expressoes }; E.res = null; E.filtroObra = "";
    $("#sintese").hidden = !E.ia.sintese;
    $("#sintese").innerHTML = '<p class="pequeno mudo" style="margin:0 0 6px">Síntese do Claude a partir dos trechos abaixo (confira nos trechos antes de usar):</p>' + E.ia.sintese.split(/\n+/).filter(Boolean).map(p => "<p>" + esc(p) + "</p>").join("") + '<p class="pequeno mudo" style="margin:6px 0 0">Expressões pesquisadas: ' + esc(expressoes.join("; ")) + ".</p>";
    $("#estado").textContent = itens.length ? "" : "O Claude não considerou pertinente nenhum dos trechos encontrados. Veja a síntese e tente reformular o tema.";
    mostrar(itens, "Busca inteligente: " + itens.length + (itens.length === 1 ? " trecho selecionado" : " trechos selecionados") + " entre " + cand.length + " candidatos");
    $("#resBloco").scrollIntoView({ behavior: "smooth", block: "start" });
  } catch (e) { $("#estado").textContent = erroApi(e); }
  finally { E.ocupado = false; $("#buscarIA").disabled = false; }
};

/* ------------------------------------------------------------------ início */
const prm = new URLSearchParams(location.search); if (prm.get("q")) $("#q").value = prm.get("q");
carregarBase().catch(e => { $("#baseInfo").textContent = "Não foi possível carregar a base."; $("#baseEstado").textContent = e.message || String(e); });
