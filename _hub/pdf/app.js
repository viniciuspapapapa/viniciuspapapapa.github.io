/* Interface das ferramentas de PDF: grade das ferramentas, mesa de trabalho (arquivos, opções, área interativa),
   execução e resultados para baixar. */
(function () {
  "use strict";
  const X = window.PDFX, T = window.PDF_FERRAMENTAS, esc = s => window.HUB.esc(s);
  const $ = s => document.querySelector(s);
  const CATS = [["Organizar", "Organizar"], ["Otimizar", "Otimizar"], ["Converter em PDF", "Converter em PDF"], ["Converter de PDF", "Converter de PDF"], ["Editar", "Editar"], ["Segurança", "Segurança"], ["Inteligência", "Inteligência artificial"]];
  const E = { t: null, arquivos: [], ctx: {}, ocupado: false, gen: 0 };

  /* ------------------------------------------------------------------ grade */
  function grade(filtro) {
    const f = String(filtro || "").toLowerCase();
    $("#grade").innerHTML = CATS.map(([c, r]) => {
      const fs = T.filter(t => t.cat === c && (!f || (t.nome + " " + t.desc).toLowerCase().includes(f)));
      if (!fs.length) return "";
      return '<section class="cat"><h2>' + esc(r) + '</h2><div class="cards">' + fs.map(t => '<a class="card ferr-pdf" href="#' + t.id + '"><b>' + esc(t.nome) + "</b><span>" + esc(t.desc) + "</span>" + (t.ia ? '<i class="tag info">Claude</i>' : "") + "</a>").join("") + "</div></section>";
    }).join("") || '<p class="mudo">Nenhuma ferramenta encontrada.</p>';
  }
  $("#busca").addEventListener("input", e => grade(e.target.value));

  /* ------------------------------------------------------------------ mesa */
  function abrir(id) {
    const t = T.find(x => x.id === id);
    E.gen++; E.t = t; E.arquivos = []; E.ctx = {}; E.ocupado = false;
    $("#inicio").hidden = !!t; $("#mesa").hidden = !t;
    if (!t) { document.title = "Ferramentas de PDF · HUB TPC"; return; }
    document.title = t.nome + " · HUB TPC";
    $("#mTitulo").textContent = t.nome; $("#mDesc").textContent = t.desc; $("#mCat").textContent = t.cat;
    const inp = $("#arquivo"); inp.accept = t.aceita; inp.multiple = !!t.multi; if (t.captura) inp.setAttribute("capture", "environment"); else inp.removeAttribute("capture");
    $("#zonaTxt").textContent = t.captura ? "Toque para fotografar ou escolher fotos" : "Arraste " + (t.multi ? "os arquivos" : "o arquivo") + " aqui ou clique para selecionar";
    $("#zonaSub").textContent = rotAceita(t);
    $("#zona").hidden = false; $("#lista").innerHTML = ""; $("#area").innerHTML = ""; $("#res").innerHTML = ""; $("#erro").textContent = "";
    $("#executar").textContent = t.botao; $("#iaOpcoes").hidden = !(t.ia || t.id === "markdown"); $("#opcoesBloco").hidden = !(t.opcoes || []).length && $("#iaOpcoes").hidden;
    opcoes(); estado(); window.scrollTo({ top: 0 });
  }
  function rotAceita(t) {
    if (t.aceita.includes(".pdf")) return t.multi ? "Arquivos PDF" + (t.min ? ", no mínimo " + t.min : "") + (t.max ? " e no máximo " + t.max : "") : "Um arquivo PDF";
    if (t.aceita.includes("image")) return "Imagens JPG, PNG, WEBP ou GIF";
    if (t.aceita.includes(".docx")) return "Documentos .docx";
    if (t.aceita.includes(".pptx")) return "Apresentações .pptx";
    if (t.aceita.includes(".xlsx")) return "Planilhas .xlsx, .xls, .ods ou .csv";
    if (t.aceita.includes(".html")) return "Arquivo .html (ou use as opções abaixo)";
    return "";
  }
  window.addEventListener("hashchange", () => abrir(location.hash.slice(1)));
  $("#voltar").onclick = () => { history.pushState("", "", location.pathname); abrir(null); };

  /* ------------------------------------------------------------------ arquivos */
  const zona = $("#zona");
  ["dragenter", "dragover"].forEach(ev => zona.addEventListener(ev, e => { e.preventDefault(); zona.classList.add("sobre"); }));
  ["dragleave", "drop"].forEach(ev => zona.addEventListener(ev, e => { e.preventDefault(); zona.classList.remove("sobre"); }));
  zona.addEventListener("drop", e => adicionar([...e.dataTransfer.files]));
  $("#arquivo").addEventListener("change", e => { adicionar([...e.target.files]); e.target.value = ""; });
  function aceito(t, f) {
    const n = f.name.toLowerCase();
    if (t.aceita.includes(".pdf")) return /\.pdf$/.test(n) || f.type === "application/pdf";
    if (t.aceita.includes("image")) return /^image\//.test(f.type) || /\.(jpe?g|png|webp|gif|bmp)$/.test(n);
    return t.aceita.split(",").some(a => a.startsWith(".") && n.endsWith(a));
  }
  async function adicionar(fs) {
    const t = E.t; if (!t || E.ocupado) return;
    const ok = fs.filter(f => aceito(t, f)), recusados = fs.length - ok.length;
    if (recusados) window.HUB.toast(recusados + (recusados === 1 ? " arquivo ignorado" : " arquivos ignorados") + ": formato não aceito por esta ferramenta.", 4000);
    if (!ok.length) return;
    if (!t.multi) E.arquivos = [ok[0]]; else E.arquivos = E.arquivos.concat(ok).slice(0, t.max || 200);
    lista(); estado();
    if (t.interativo) {
      const g = E.gen; $("#area").innerHTML = '<p class="pequeno mudo">Preparando as páginas…</p>';
      if (!t.multi || t.id !== "organizar") { E.ctx = {}; }
      try { E.ctx.arquivos = E.arquivos; await t.interativo($("#area"), E.ctx); } catch (e) { if (g === E.gen) $("#area").innerHTML = '<p class="aviso">' + esc(e.message || e) + "</p>"; }
    }
  }
  function lista() {
    const t = E.t;
    $("#lista").innerHTML = E.arquivos.map((f, i) => '<div class="arq"><span class="arq-n">' + (t.multi && t.ordenar ? (i + 1) + ". " : "") + esc(f.name) + ' <small class="mudo">' + X.tam(f.size) + "</small></span>" +
      (t.multi && t.ordenar ? '<button type="button" class="x" data-m="-1" data-i="' + i + '" aria-label="Mover para cima">↑</button><button type="button" class="x" data-m="1" data-i="' + i + '" aria-label="Mover para baixo">↓</button>' : "") +
      '<button type="button" class="x" data-r="' + i + '" aria-label="Remover ' + esc(f.name) + '">×</button></div>').join("");
    $("#zona").classList.toggle("compacta", E.arquivos.length > 0);
  }
  $("#lista").addEventListener("click", e => {
    const b = e.target.closest("button"); if (!b || E.ocupado) return;
    if (b.dataset.r != null) { E.arquivos.splice(+b.dataset.r, 1); if (E.t.interativo) { E.ctx = {}; $("#area").innerHTML = ""; if (E.arquivos.length) { const fs = E.arquivos; E.arquivos = []; adicionar(fs); return; } } }
    else { const i = +b.dataset.i, j = i + +b.dataset.m; if (j >= 0 && j < E.arquivos.length) [E.arquivos[i], E.arquivos[j]] = [E.arquivos[j], E.arquivos[i]]; }
    lista(); estado();
  });

  /* ------------------------------------------------------------------ opções */
  function opcoes() {
    const t = E.t, el = $("#opcoes");
    el.innerHTML = (t.opcoes || []).map(o => {
      const id = "op_" + o.id, pad = o.padrao;
      if (o.tipo === "check") return '<label class="check" data-op="' + o.id + '"><input type="checkbox" id="' + id + '"' + (pad ? " checked" : "") + "> " + esc(o.rot) + "</label>";
      let c;
      if (o.tipo === "select") c = '<select id="' + id + '">' + o.valores.map(([v, r]) => '<option value="' + esc(v) + '"' + (v === pad ? " selected" : "") + ">" + esc(r) + "</option>").join("") + "</select>";
      else if (o.tipo === "area") c = '<textarea id="' + id + '" rows="6" placeholder="&lt;html&gt;…"></textarea>';
      else if (o.tipo === "numero") c = '<input type="number" id="' + id + '" value="' + (pad == null ? "" : pad) + '"' + (o.min != null ? ' min="' + o.min + '"' : "") + ">";
      else if (o.tipo === "cor") c = '<input type="color" id="' + id + '" value="' + (pad || "#000000") + '">';
      else if (o.tipo === "arquivo") c = '<input type="file" id="' + id + '" accept="' + esc(o.aceita || "") + '">';
      else c = '<input type="' + (o.tipo === "senha" ? "password" : "text") + '" id="' + id + '" value="' + esc(pad || "") + '"' + (o.dica ? ' placeholder="' + esc(o.dica) + '"' : "") + (o.tipo === "senha" ? ' autocomplete="new-password"' : "") + ">";
      return '<label class="campo' + (o.tipo === "area" ? " larga" : "") + '" data-op="' + o.id + '">' + esc(o.rot) + c + "</label>";
    }).join("");
    el.hidden = !(t.opcoes || []).length; visiveis();
  }
  function valores() {
    const o = {};
    (E.t.opcoes || []).forEach(s => { const el = document.getElementById("op_" + s.id); if (!el) return; o[s.id] = s.tipo === "check" ? el.checked : s.tipo === "arquivo" ? el.files[0] || null : s.tipo === "numero" ? (el.value === "" ? s.padrao : +el.value) : el.value; });
    return o;
  }
  function visiveis() { const v = valores(); (E.t.opcoes || []).forEach(s => { const el = document.querySelector('[data-op="' + s.id + '"]'); if (el) el.hidden = !!(s.mostrar && !s.mostrar(v)); }); }
  $("#opcoes").addEventListener("change", () => { visiveis(); estado(); });
  $("#opcoes").addEventListener("input", estado);

  function estado() {
    const t = E.t; if (!t) return;
    const n = E.arquivos.length, falta = t.opcional ? 0 : Math.max(t.min || 1, 1) - n;
    $("#executar").disabled = E.ocupado || falta > 0;
    $("#estado").textContent = falta > 0 ? (n ? "Adicione mais " + falta + (falta === 1 ? " arquivo." : " arquivos.") : "") : "";
  }

  /* ------------------------------------------------------------------ execução */
  function prog(msg, fr) { $("#progresso").textContent = msg || ""; $("#barra").hidden = fr == null; if (fr != null) $("#barra i").style.width = Math.round(Math.max(0.03, Math.min(1, fr)) * 100) + "%"; }
  $("#executar").onclick = async () => {
    const t = E.t; if (!t || E.ocupado) return;
    E.ocupado = true; estado(); $("#erro").textContent = ""; $("#res").innerHTML = ""; prog("Processando…", 0.02);
    const g = E.gen;
    try {
      const r = await t.executar({ arquivos: E.arquivos, op: valores(), ctx: E.ctx, ui: { prog } });
      if (g !== E.gen) return;
      resultado(r);
    } catch (e) { if (g === E.gen) $("#erro").textContent = e.message || String(e); console.error(e); }
    finally { if (g === E.gen) { E.ocupado = false; prog("", null); estado(); } }
  };
  function resultado(r) {
    const s = r.saidas || [], el = $("#res");
    el.innerHTML = '<div class="card card-p resultado"><h2>Pronto</h2>' + (r.nota ? '<p class="pequeno">' + esc(r.nota) + "</p>" : "") +
      '<div class="linha-btns">' + (r.zip && s.length > 1 ? '<button type="button" class="btn" data-zip>Baixar tudo (.zip)</button>' : s.length === 1 ? '<button type="button" class="btn" data-b="0">Baixar ' + esc(s[0].nome) + "</button>" : "") +
      '<button type="button" class="btn sec" data-novo>Recomeçar</button></div>' +
      (s.length > 1 ? '<div class="saidas">' + s.map((x, i) => '<div class="arq"><span class="arq-n">' + esc(x.nome) + ' <small class="mudo">' + X.tam(x.blob.size) + '</small></span><button type="button" class="btn sec peq" data-b="' + i + '">Baixar</button></div>').join("") + "</div>" : '<p class="pequeno mudo">' + (s[0] ? X.tam(s[0].blob.size) : "") + "</p>") +
      (r.html ? '<div class="previa">' + r.html + "</div>" : "") + "</div>";
    el.querySelectorAll("[data-b]").forEach(b => { b.onclick = () => X.baixar(s[+b.dataset.b].blob, s[+b.dataset.b].nome); });
    const z = el.querySelector("[data-zip]"); if (z) z.onclick = async () => X.baixar(await X.zip(s), r.zip);
    el.querySelector("[data-novo]").onclick = () => abrir(E.t.id);
    el.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  grade(); if (location.hash.length > 1) abrir(location.hash.slice(1));
  /* verificação inicial dos componentes, para avisar logo quando a rede bloqueia algo */
  X.carregar("pdflib", "pdfjs").catch(e => {
    const av = document.createElement("p"); av.className = "aviso"; av.setAttribute("role", "alert"); av.textContent = e.message;
    document.querySelector("main").prepend(av);
  });
  window.PDF_APP = { E, abrir, adicionar };

  /* ------------------------------------------------------------------ diagnóstico */
  async function diagnostico() {
    const out = $("#diagRes"), linhas = [], add = (n, ok, d) => { linhas.push((ok ? "OK    " : "FALHA ") + n + (d ? ": " + d : "")); out.textContent = linhas.join("\n"); };
    $("#diag").disabled = true; out.textContent = "Verificando…";
    add("Navegador", true, navigator.userAgent);
    add("Endereço", true, location.href.split("#")[0]);
    add("WebAssembly", typeof WebAssembly === "object", typeof WebAssembly === "object" ? "" : "desativado (segurança reforçada do Edge ou política da empresa); OCR, PDF/A e reparo não funcionarão");
    add("Web Workers", typeof Worker === "function");
    for (const [nome, rot] of [["pdflib", "pdf-lib"], ["pdfjs", "pdf.js"], ["jszip", "JSZip"], ["mammoth", "mammoth"], ["xlsx", "SheetJS"], ["pptx", "PptxGenJS"], ["diff", "jsdiff"], ["html2pdf", "html2pdf"], ["qpdf", "qpdf"]]) {
      const t0 = performance.now();
      try { await X.carregar(nome); add(rot, true, Math.round(performance.now() - t0) + " ms"); } catch (e) { add(rot, false, e.message); }
    }
    try {
      const doc = await window.PDFLib.PDFDocument.create(); doc.addPage([200, 200]); const bytes = await doc.save();
      const pdf = await X.abrirJs(bytes); const pag = await pdf.getPage(1); await X.renderizar(pag, 1); add("Leitura e geração de PDF", true, pdf.numPages + " página de teste");
    } catch (e) { add("Leitura e geração de PDF", false, e.message || String(e)); }
    if (typeof WebAssembly === "object") {
      try { const w = await X.tesseract("por"); await w.terminate(); add("OCR (Tesseract)", true); } catch (e) { add("OCR (Tesseract)", false, e.message || String(e)); }
    }
    if ((window.PDF_FALHAS || []).length) add("Erros registrados na página", false, window.PDF_FALHAS.join(" · "));
    linhas.push("", "Data: " + new Date().toLocaleString("pt-BR")); out.textContent = linhas.join("\n");
    $("#diag").disabled = false; $("#diagCopiar").hidden = false;
  }
  $("#diag").addEventListener("click", diagnostico);
  $("#diagCopiar").addEventListener("click", async () => {
    try { await navigator.clipboard.writeText($("#diagRes").textContent); window.HUB.toast("Resultado copiado."); } catch (e) { window.HUB.toast("Selecione o texto e copie manualmente."); }
  });
})();
