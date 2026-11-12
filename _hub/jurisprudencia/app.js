/* Pesquisa de jurisprudência: base oficial local (acervo Advocacia Aberta, cifrado no ramo bases-publicas, buscado no
   navegador pelo motor da Pesquisa doutrinária) e busca ao vivo nos tribunais pelo serviço sherlock-tpc (/juris/busca,
   método Garimpo-Jurídico). Citação pronta, seleção e exportação em Word. */
(function () {
  "use strict";
  const $ = s => document.querySelector(s), esc = s => window.HUB.esc(s), P = window.TPC_PECA;
  const BASE = "https://raw.githubusercontent.com/viniciuspapapapa/viniciuspapapapa.github.io/bases-publicas/juris.bin";
  const CFG = (window.HUB_CONFIG && window.HUB_CONFIG.sherlock) || {}, SERV = (CFG.url || "https://sherlock-tpc.viniciuspapapapa.workers.dev").replace(/\/+$/, "");
  const ler = k => { try { return localStorage.getItem(k); } catch (e) { return null; } };
  const gravar = (k, v) => { try { localStorage.setItem(k, v); } catch (e) { /* ignora */ } };
  const E = { cols: [], meta: new Map(), req: 0, pend: new Map(), local: [], vivo: [], sel: new Map(), pronto: false, lista: [], mostrar: {}, arvore: null };
  const MM = DOUTRINA_MOTOR(null); /* o mesmo motor na página, para marcar os termos e conferir a busca ao vivo */
  const POR_PAGINA = 10;
  const TRIBS = [["stf", "STF"], ["stj", "STJ"], ["tjmg", "TJMG"], ["tjsp", "TJSP"], ["tjrj", "TJRJ"], ["tjrs", "TJRS"], ["tjpr", "TJPR"], ["tjdft", "TJDFT"], ["tjba", "TJBA"], ["tjgo", "TJGO"], ["tjsc", "TJSC"], ["tjpe", "TJPE"], ["tjes", "TJES"], ["tjce", "TJCE"], ["stm", "STM"], ["tse", "TSE"]];
  const marcadosTrib = new Set(JSON.parse(ler("juris_tribunais") || '["stj","stf","tjmg"]'));
  $("#tribunais").innerHTML = TRIBS.map(([k, r]) => '<label><input type="checkbox" value="' + k + '"' + (marcadosTrib.has(k) ? " checked" : "") + "> " + r + "</label>").join("");
  $("#tribunais").addEventListener("change", () => gravar("juris_tribunais", JSON.stringify([...document.querySelectorAll("#tribunais input:checked")].map(i => i.value))));

  /* ------------------------------------------------------------------ base local cifrada */
  async function chave() {
    let k = null; try { k = sessionStorage.getItem("hub_chave"); if (!k) { const l = JSON.parse(localStorage.getItem("hub_chave") || "null"); if (l && l.ate > Date.now()) k = l.k; } } catch (e) { k = null; }
    if (!k) { location.replace("../login/?volta=" + encodeURIComponent(location.pathname)); throw new Error("Sessão expirada."); }
    return crypto.subtle.importKey("raw", Uint8Array.from(atob(k), c => c.charCodeAt(0)), "AES-GCM", false, ["decrypt"]);
  }
  const DB = {
    abrir() { return this.p || (this.p = new Promise((ok, falha) => { try { const r = indexedDB.open("hub_juris", 1); r.onupgradeneeded = () => r.result.createObjectStore("base"); r.onsuccess = () => ok(r.result); r.onerror = () => falha(r.error); } catch (e) { falha(e); } })); },
    async ler() { try { const db = await this.abrir(); return await new Promise(ok => { const r = db.transaction("base").objectStore("base").get("juris"); r.onsuccess = () => ok(r.result || null); r.onerror = () => ok(null); }); } catch (e) { return null; } },
    async gravar(v) { try { const db = await this.abrir(); await new Promise(ok => { const t = db.transaction("base", "readwrite"); t.objectStore("base").put(v, "juris"); t.oncomplete = ok; t.onerror = ok; }); } catch (e) { /* sem cache */ } }
  };
  async function baixarBase() {
    const r = await fetch(BASE + "?t=" + Math.floor(Date.now() / 3600000)); if (!r.ok) throw new Error(r.status === 404 ? "A base ainda não foi gerada (fluxo Bases públicas do HUB)." : "Base indisponível (HTTP " + r.status + ").");
    const u = new Uint8Array(await r.arrayBuffer());
    let claro; try { claro = await crypto.subtle.decrypt({ name: "AES-GCM", iv: u.slice(0, 12) }, await chave(), u.slice(12)); } catch (e) { throw new Error("A base não pôde ser decifrada com a senha atual do HUB; ela será refeita na próxima atualização diária."); }
    return JSON.parse(await new Response(new Blob([claro]).stream().pipeThrough(new DecompressionStream("gzip"))).text());
  }
  const W = new Worker(URL.createObjectURL(new Blob(["(" + DOUTRINA_MOTOR.toString() + ")(self);"], { type: "text/javascript" })));
  W.onmessage = e => { const d = e.data, f = E.pend.get(d.req); if (f) { E.pend.delete(d.req); d.tipo === "erro" ? f.falha(new Error(d.erro)) : f.ok(d); } };
  const pedir = m => new Promise((ok, falha) => { const req = ++E.req; E.pend.set(req, { ok, falha }); W.postMessage(Object.assign({ req }, m)); });
  async function carregar() {
    try {
      let c = await DB.ler();
      if (!c || Date.now() - c.quando > 24 * 3600000) { $("#baseInfo").textContent = "baixando a base (cerca de 9 MB, só na primeira vez do dia)…"; const d = await baixarBase(); c = { quando: Date.now(), dados: d }; await DB.gravar(c); }
      const d = c.dados, marcadas = new Set(JSON.parse(ler("juris_colecoes") || "null") || d.colecoes.map(x => x.id));
      E.cols = d.colecoes.map(x => ({ id: x.id, nome: x.nome, n: x.registros.length }));
      for (const x of d.colecoes) { E.meta.set(x.id, x.registros); await pedir({ tipo: "livro", id: x.id, paginas: x.registros.map((r, i) => [i + 1, "", r[4] + "\n" + r[0] + " · " + r[1], r[2]]) }); }
      $("#colecoes").innerHTML = E.cols.map(c => '<label><input type="checkbox" value="' + c.id + '"' + (marcadas.has(c.id) ? " checked" : "") + "> " + esc(c.nome) + ' <span class="mudo">(' + c.n.toLocaleString("pt-BR") + ")</span></label>").join("");
      $("#colecoes").addEventListener("change", () => gravar("juris_colecoes", JSON.stringify([...document.querySelectorAll("#colecoes input:checked")].map(i => i.value))));
      $("#baseInfo").textContent = "· " + E.cols.reduce((s, c) => s + c.n, 0).toLocaleString("pt-BR") + " registros" + (d.gerado ? " · acervo de " + d.gerado.split("-").reverse().join("/") : "");
      E.pronto = true;
    } catch (e) { $("#baseInfo").textContent = "· indisponível: " + (e.message || e); }
  }
  carregar();

  /* ------------------------------------------------------------------ pesquisa */
  function marcar(txt, marcas) { let o = "", p = 0; for (const [a, b] of marcas || []) { if (a < p) continue; o += esc(txt.slice(p, a)) + "<mark>" + esc(txt.slice(a, b)) + "</mark>"; p = b; } return (o + esc(txt.slice(p))).split("\n").map(s => "<p>" + s + "</p>").join(""); }
  function prog(m, f) { $("#estado").textContent = m || ""; $("#barra").hidden = f == null; if (f != null) $("#barra i").style.width = Math.round(f * 100) + "%"; }
  async function pesquisar() {
    const q = $("#q").value.trim(); if (q.length < 3) { $("#q").focus(); return; }
    const cols = [...document.querySelectorAll("#colecoes input:checked")].map(i => i.value), tribs = [...document.querySelectorAll("#tribunais input:checked")].map(i => i.value).slice(0, 6);
    E.arvore = MM.analisar(q); if (!E.arvore) { $("#estado").textContent = "Informe ao menos um termo além dos operadores."; return; }
    $("#resBloco").hidden = false; $("#resLocal").innerHTML = ""; $("#resVivo").innerHTML = ""; E.local = []; E.vivo = []; E.lista = [];
    prog("Pesquisando…", 0.1); $("#buscar").disabled = true;
    const tarefas = [];
    if (E.pronto && cols.length) tarefas.push((async () => {
      const r = await pedir({ tipo: "buscarBool", consulta: q, ids: cols, ordem: $("#ordem").value });
      if (r.erro) { $("#resLocalInfo").textContent = r.erro; return; }
      E.lista = r.lista; E.mostrar = {}; E.porCol = r.porLivro;
      $("#resLocalInfo").innerHTML = r.total ? "<b>" + r.total.toLocaleString("pt-BR") + (r.total === 1 ? " registro atende" : " registros atendem") + "</b> à expressão " + esc(r.expressao) + "." : "Nenhum registro atende à expressão " + esc(r.expressao) + ". Experimente o operador ou entre sinônimos, o truncamento ($) ou menos termos.";
      desenharLocal();
    })().catch(e => { $("#resLocalInfo").textContent = e.message || String(e); }));
    else $("#resLocalInfo").textContent = E.pronto ? "Nenhuma coleção marcada." : "A base local ainda está carregando.";
    if (tribs.length) tarefas.push((async () => {
      const h = { "Content-Type": "application/json" }; if (CFG.token) h["X-App-Token"] = CFG.token;
      /* o buscador dos tribunais não entende os operadores: recebe os termos e traz mais acórdãos, que a página
         confere contra a expressão completa antes de mostrar */
      const fl = []; (function f(n) { if (!n) return; if (n.tipo === "folha") fl.push(n.frase ? '"' + n.rot + '"' : n.rot.replace(/[$*]+$/, "")); else if (n.tipo === "nao") f(n.a); else { f(n.a); f(n.b); } })(E.arvore);
      const r = await fetch(SERV + "/juris/busca", { method: "POST", headers: h, body: JSON.stringify({ q: fl.join(" ") || q, tribunais: tribs, limite: 30, de: $("#de").value || undefined, ate: $("#ate").value || undefined }) });
      const d = await r.json().catch(() => ({})); if (!r.ok) throw new Error(d.erro || "Serviço indisponível (HTTP " + r.status + ").");
      E.vivo = d.resultados || []; E.vivoTodos = false;
      desenharVivo();
    })().catch(e => { $("#resVivoInfo").textContent = e.message || String(e); }));
    else $("#resVivoInfo").textContent = "Nenhum tribunal marcado.";
    await Promise.all(tarefas); prog("", null); $("#buscar").disabled = false;
  }
  $("#buscar").onclick = pesquisar;
  /* barra de operadores, como na pesquisa do STJ: insere no ponto do cursor */
  document.querySelectorAll("#ops [data-op]").forEach(b => b.addEventListener("click", () => {
    const i = $("#q"), op = b.dataset.op, a = i.selectionStart ?? i.value.length, z = i.selectionEnd ?? a, v = i.value;
    let ins;
    if (op === "$") ins = "$";
    else if (op === '"') ins = a !== z ? '"' + v.slice(a, z) + '"' : '""';
    else if (op === "()") ins = a !== z ? "(" + v.slice(a, z) + ")" : "()";
    else ins = (a && !/\s$/.test(v.slice(0, a)) ? " " : "") + op + " ";
    i.value = v.slice(0, a) + ins + v.slice(z); const p = a + (op === '"' || op === "()" ? (a !== z ? ins.length : 1) : ins.length);
    i.focus(); i.setSelectionRange(p, p);
  }));
  $("#ordem").addEventListener("change", () => { gravar("juris_ordem", $("#ordem").value); if (E.lista.length) pesquisar(); });
  $("#ordem").value = ler("juris_ordem") || "relevancia";
  $("#q").addEventListener("keydown", e => { if (e.key === "Enter") { e.preventDefault(); pesquisar(); } });

  /* ------------------------------------------------------------------ exibição */
  const chaveItem = it => it.origem + ":" + (it.titulo || it.numero) + ":" + (it.data || it.julgamento || "");
  function item(it, k) {
    const sel = E.sel.has(chaveItem(it));
    return '<div class="res' + (it.atende === false ? " nao-atende" : "") + '" data-k="' + k + '">' + (it.atende === false ? '<p class="pequeno mudo" style="margin:0 0 4px">Não contém todos os termos da expressão.</p>' : "") + '<div class="res-cab"><b>' + esc(it.titulo) + "</b><small>" + esc(it.data || "") + "</small></div>" + (it.det ? '<div class="det">' + esc(it.det) + "</div>" : "") +
      (it.achados && it.achados.length ? '<div class="achados">Contém: ' + it.achados.map(t => "<span>" + esc(t) + "</span>").join("") + "</div>" : "") +
      '<div class="txt">' + marcar(it.texto, it.marcas) + "</div>" +
      '<div class="acoes"><button type="button" class="btn sec" data-a="cit">Copiar citação</button>' + (it.integral && it.integral.length > it.texto.length + 5 ? '<button type="button" class="btn sec" data-a="int">Texto integral</button>' : "") + (it.url ? '<a class="btn sec" href="' + esc(it.url) + '" target="_blank" rel="noopener">Fonte oficial</a>' : "") + (it.consulta && it.consulta !== it.url ? '<a class="btn sec" href="' + esc(it.consulta) + '" target="_blank" rel="noopener">Processo</a>' : "") +
      '<label><input type="checkbox" data-a="sel"' + (sel ? " checked" : "") + "> Selecionar</label></div></div>";
  }
  /* texto exibido: inteiro quando cabe; nos longos, o primeiro parágrafo e os parágrafos com os termos */
  function exibir(texto, marcas) {
    if (texto.length <= 2200) return { texto, marcas };
    const pars = []; let ini = 0; texto.split("\n").forEach(p => { pars.push([ini, ini + p.length]); ini += p.length + 1; });
    const usar = pars.filter((p, k) => k === 0 || marcas.some(m => m[0] >= p[0] && m[0] < p[1]));
    let out = "", mk = [];
    usar.forEach((p, k) => {
      let a = p[0], b = p[1];
      if (b - a > 1500) { const m = marcas.find(x => x[0] >= a && x[0] < b) || [a]; a = Math.max(a, m[0] - 600); b = Math.min(b, a + 1300); }
      const pre = out ? (k && usar[k - 1][1] + 1 < p[0] ? "\n[…] " : "\n") : "";
      const desl = out.length + pre.length - a;
      out += pre + (a > p[0] ? "…" : "") + texto.slice(a, b) + (b < p[1] ? "…" : "");
      marcas.forEach(m => { if (m[0] >= a && m[1] <= b) mk.push([m[0] + desl + (a > p[0] ? 1 : 0), m[1] + desl + (a > p[0] ? 1 : 0)]); });
    });
    return { texto: out, marcas: mk };
  }
  function itemLocal([col, i]) {
    const m = E.meta.get(col)[i], c = MM.conferir(E.arvore, m[4]), v = exibir(m[4], c.marcas);
    return { origem: "local", col, titulo: m[0], det: m[1], data: m[2], url: m[3], texto: v.texto, marcas: v.marcas, integral: m[4], achados: c.achados };
  }
  function desenharLocal() {
    const grupos = new Map(); for (const h of E.lista) { if (!grupos.has(h[0])) grupos.set(h[0], []); grupos.get(h[0]).push(h); }
    E.local = []; let html = "";
    for (const c of E.cols) {
      const l = grupos.get(c.id); if (!l) continue;
      const n = E.mostrar[c.id] || POR_PAGINA;
      html += '<div class="grupo"><h3>' + esc(c.nome) + ' <span class="mudo">(' + l.length.toLocaleString("pt-BR") + ")</span></h3>" + l.slice(0, n).map(h => { const it = itemLocal(h); E.local.push(it); return item(it, "L" + (E.local.length - 1)); }).join("") +
        (l.length > n ? '<button type="button" class="btn sec mais" data-mais="' + c.id + '">Mostrar mais ' + Math.min(POR_PAGINA, l.length - n) + " de " + (l.length - n).toLocaleString("pt-BR") + " restantes</button>" : "") + "</div>";
    }
    $("#resLocal").innerHTML = html;
  }
  $("#resLocal").addEventListener("click", e => { const b = e.target.closest("[data-mais]"); if (!b) return; const id = b.dataset.mais; E.mostrar[id] = (E.mostrar[id] || POR_PAGINA) + POR_PAGINA; const y = b.getBoundingClientRect().top; desenharLocal(); const nb = document.querySelector('[data-mais="' + id + '"]'); if (nb) window.scrollBy(0, nb.getBoundingClientRect().top - y); });
  function desenharVivo() {
    const lim = +$("#limite").value, lista = []; let total = 0, atendem = 0, ocultos = 0;
    E.vivo.forEach(t => {
      const brutos = [];
      t.qualificados.forEach(q => brutos.push({ origem: "vivo", grupo: t.nome, titulo: (q.tipo.charAt(0).toUpperCase() + q.tipo.slice(1)) + (q.numero ? " " + q.numero : "") + " (" + t.tribunal.toUpperCase() + ")", det: [q.titulo, q.situacao].filter(Boolean).join(" · "), data: "", url: q.link, texto: q.ementa, tribunal: t.tribunal }));
      t.acordaos.forEach(a => brutos.push({ origem: "vivo", grupo: t.nome, titulo: a.numero + " (" + t.tribunal.toUpperCase() + ")", det: [a.orgao, a.relator && "Rel. " + a.relator, a.publicacao && "publicado em " + a.publicacao].filter(Boolean).join(" · "), data: a.julgamento, url: a.link, consulta: a.consulta, texto: a.ementa, tribunal: t.tribunal, numero: a.numero, orgao: a.orgao, relator: a.relator, julgamento: a.julgamento }));
      let mostrados = 0;
      for (const it of brutos) {
        total++; const c = MM.conferir(E.arvore, it.texto); it.marcas = c.marcas; it.achados = c.achados; it.atende = c.ok;
        if (c.ok) atendem++;
        if (c.ok ? mostrados < lim : E.vivoTodos) { lista.push(it); if (c.ok) mostrados++; } else if (!c.ok) ocultos++;
      }
      if (t.erro) lista.push({ origem: "vivo", grupo: t.nome, erro: t.erro });
    });
    E.vivoLista = lista;
    const grupos = new Map(); lista.forEach((it, i) => { if (!grupos.has(it.grupo)) grupos.set(it.grupo, []); grupos.get(it.grupo).push([it, i]); });
    $("#resVivoInfo").innerHTML = "<b>" + atendem + " de " + total + "</b> acórdãos trazidos pelos tribunais atendem à expressão " + esc(MM.descrever(E.arvore)) + "." + (ocultos ? ' <button type="button" class="link" id="verTodos">Mostrar também os ' + ocultos + " que não atendem</button>" : E.vivoTodos && total > atendem ? ' <button type="button" class="link" id="verTodos">Ocultar os que não atendem</button>' : "") + " Fonte não oficial: confira o inteiro teor no portal do tribunal.";
    $("#resVivo").innerHTML = [...grupos].map(([g, l]) => '<div class="grupo"><h3>' + esc(g) + "</h3>" + l.map(([it, i]) => it.erro ? '<p class="aviso">Sem resposta deste tribunal: ' + esc(it.erro) + "</p>" : item(it, "V" + i)).join("") + "</div>").join("") || '<p class="pequeno mudo">Nenhum acórdão trazido pelos tribunais contém todos os termos. Tente a mesma expressão com ou, truncamento ($) ou menos termos.</p>';
    const vt = $("#verTodos"); if (vt) vt.onclick = () => { E.vivoTodos = !E.vivoTodos; desenharVivo(); };
  }
  const itemDe = k => k[0] === "L" ? E.local[+k.slice(1)] : E.vivoLista[+k.slice(1)];

  /* ------------------------------------------------------------------ citação, seleção e Word */
  const SIGLA_ORGAO = s => String(s || "").replace(/^T(\d)\s*-\s*/i, "").replace(/\s+/g, " ").trim().toLowerCase().replace(/(^|\s)\S/g, m => m.toUpperCase());
  function citacao(it) {
    const txt = it.texto.replace(/\s+/g, " ").trim();
    if (it.origem === "vivo" && it.numero) return it.tribunal.toUpperCase() + ", " + it.numero + (it.orgao ? ", " + SIGLA_ORGAO(it.orgao) : "") + (it.relator ? ", Rel. " + it.relator : "") + (it.julgamento ? ", julgado em " + it.julgamento : "") + ".\n“" + txt + "”";
    if (it.col === "leis") return it.titulo + ": “" + txt.replace(/^Art\.\s*[\dº°A-Z-]+\s*[-–.]?\s*/i, "") + "”";
    return it.titulo + (it.det ? " (" + it.det + ")" : "") + (it.data ? ", " + it.data : "") + ": “" + txt + "”";
  }
  async function copiar(t) { try { await navigator.clipboard.writeText(t); window.HUB.toast("Citação copiada."); } catch (e) { window.HUB.toast("Não foi possível copiar."); } }
  document.addEventListener("click", e => {
    const b = e.target.closest("[data-a]"), r = e.target.closest(".res"); if (!b || !r || b.tagName === "INPUT") return;
    const it = itemDe(r.dataset.k);
    if (b.dataset.a === "cit") copiar(citacao(it));
    else if (b.dataset.a === "int") { const c = MM.conferir(E.arvore, it.integral); r.querySelector(".txt").innerHTML = marcar(it.integral, c.marcas); b.remove(); it.texto = it.integral; it.marcas = c.marcas; }
  });
  document.addEventListener("change", e => {
    if (e.target.dataset.a !== "sel") return; const r = e.target.closest(".res"), it = itemDe(r.dataset.k), k = chaveItem(it);
    if (e.target.checked) E.sel.set(k, Object.assign({}, it)); else E.sel.delete(k); selbar();
  });
  function selbar() { const n = E.sel.size; $("#selbar").hidden = !n; $("#selInfo").textContent = n + (n === 1 ? " item selecionado" : " itens selecionados") + " para o Word"; }
  $("#limparSel").onclick = () => { E.sel.clear(); document.querySelectorAll('[data-a="sel"]').forEach(c => c.checked = false); selbar(); };
  $("#word").onclick = async () => {
    const itens = [...E.sel.values()]; if (!itens.length) return;
    const b = [{ t: "tit", texto: "PESQUISA DE JURISPRUDÊNCIA" }];
    if ($("#q").value.trim()) b.push({ t: "p", r: [["Tema: ", "bo"], [$("#q").value.trim(), "n"]] });
    const grupos = [["Precedentes qualificados e enunciados", itens.filter(i => i.origem === "local" && i.col !== "leis" && i.col !== "esp" || (i.origem === "vivo" && !i.numero))], ["Acórdãos", itens.filter(i => i.col === "esp" || (i.origem === "vivo" && i.numero))], ["Legislação", itens.filter(i => i.col === "leis")]];
    for (const [tit, l] of grupos) {
      if (!l.length) continue; b.push({ t: "h", texto: tit });
      for (const it of l) {
        b.push({ t: "sub", texto: it.titulo });
        if (it.det || it.data) b.push({ t: "p", r: [[[it.det, it.data && (it.origem === "vivo" ? "julgado em " : "") + it.data].filter(Boolean).join(" · "), "i"]] });
        b.push({ t: "cit", texto: it.texto.replace(/\s+/g, " ").trim() });
        if (it.url) b.push({ t: "p", r: [["Fonte: " + it.url, "n"]] });
      }
    }
    b.push({ t: "p", r: [["Conferir o inteiro teor no portal oficial do tribunal antes da citação em peça.", "i"]] });
    b.push({ t: "data", texto: "Belo Horizonte, " + P.dataExtenso(new Date()) + "." });
    try { P.baixar(await P.docx(b), "Pesquisa de jurisprudencia - " + ($("#q").value.trim() || "tema").replace(/[\\/:*?"<>|]+/g, " ").slice(0, 70)); } catch (e) { window.HUB.toast(e.message || "Não foi possível gerar o Word.", 5000); }
  };
})();
