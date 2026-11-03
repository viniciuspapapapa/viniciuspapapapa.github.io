/* Interface do verificador de cadeia de custódia. */
(function () {
  "use strict";
  const R = window.CC_REGRAS, M = window.CC_MOTOR, REL = window.CC_RELATORIO, IA = window.CC_IA;
  const esc = s => HUB.esc(s);
  const $ = s => document.querySelector(s);
  const CAT = id => R.CATEGORIAS.find(c => c.id === id);
  const ETAPA = id => R.ETAPAS.find(e => e.id === id);
  const PECA = id => R.PECAS.find(p => p.id === id);

  if (window.pdfjsLib) pdfjsLib.GlobalWorkerOptions.workerSrc = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";

  const E = { arquivos: [], docs: [], paginas: [], res: null, caso: {}, sub: "painel", catSel: null, soProb: false, sinal: null, relModo: "minuta", base: "etapas", jurisFiltro: { q: "", tag: "", turma: "" } };
  window.CC_ESTADO = E;

  /* ------------------------------------------------------------ abas principais */
  function abrirAba(id) {
    document.querySelectorAll(".aba").forEach(b => b.setAttribute("aria-selected", b.dataset.aba === id ? "true" : "false"));
    ["analisar", "resultado", "base", "sobre"].forEach(a => { $("#p-" + a).hidden = a !== id; });
    if (id === "base") renderBase();
    window.scrollTo({ top: Math.min(window.scrollY, document.querySelector(".abas").offsetTop - 70), behavior: "smooth" });
  }
  document.querySelectorAll(".aba").forEach(b => b.addEventListener("click", () => !b.disabled && abrirAba(b.dataset.aba)));

  /* ------------------------------------------------------------ arquivos */
  const zona = $("#zona"), entrada = $("#entrada");
  zona.addEventListener("click", () => entrada.click());
  zona.addEventListener("keydown", e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); entrada.click(); } });
  ["dragenter", "dragover"].forEach(ev => zona.addEventListener(ev, e => { e.preventDefault(); zona.classList.add("sobre"); }));
  ["dragleave", "drop"].forEach(ev => zona.addEventListener(ev, e => { e.preventDefault(); zona.classList.remove("sobre"); }));
  zona.addEventListener("drop", e => adicionar(e.dataTransfer.files));
  entrada.addEventListener("change", () => { adicionar(entrada.files); entrada.value = ""; });
  function adicionar(lista) {
    for (const f of lista) if (!E.arquivos.some(x => x.name === f.name && x.size === f.size)) E.arquivos.push(f);
    renderArquivos();
  }
  function tamanho(b) { return b > 1048576 ? (b / 1048576).toFixed(1) + " MB" : Math.max(1, Math.round(b / 1024)) + " KB"; }
  function renderArquivos() {
    $("#listaArq").innerHTML = E.arquivos.map((f, i) => '<div class="arq"><span>' + iconeArq(f.name) + '</span><span class="nm" title="' + esc(f.name) + '">' + esc(f.name) + '</span><span class="mudo pequeno">' + tamanho(f.size) + '</span><button type="button" aria-label="Remover ' + esc(f.name) + '" data-rm="' + i + '">×</button></div>').join("");
    $("#listaArq").querySelectorAll("[data-rm]").forEach(b => b.onclick = () => { E.arquivos.splice(+b.dataset.rm, 1); renderArquivos(); });
    $("#btnAnalisar").disabled = !E.arquivos.length;
  }
  function iconeArq(n) {
    const x = n.split(".").pop().toLowerCase();
    return x === "pdf" ? "📕" : /jpe?g|png|webp|bmp|gif/.test(x) ? "🖼️" : /mp4|mov|avi|mkv|webm|3gp/.test(x) ? "🎞️" : /mp3|wav|ogg|m4a|opus|aac/.test(x) ? "🎙️" : "📄";
  }

  /* ------------------------------------------------------------ processamento */
  function lerCaso() {
    E.caso = { autos: $("#cAutos").value.trim(), assistido: $("#cAssistido").value.trim(), juizo: $("#cJuizo").value.trim(), responsavel: $("#cResp").value.trim(), obs: $("#cObs").value.trim() };
  }
  function escreverCaso() {
    const c = E.caso || {};
    $("#cAutos").value = c.autos || ""; $("#cAssistido").value = c.assistido || ""; $("#cJuizo").value = c.juizo || ""; $("#cResp").value = c.responsavel || ""; $("#cObs").value = c.obs || "";
  }
  function progresso(on) {
    $("#progresso").hidden = !on;
    $("#btnAnalisar").disabled = on || !E.arquivos.length; $("#btnManual").disabled = on; $("#btnImportar").disabled = on;
    if (on) { $("#progLog").textContent = ""; $("#progBarra").style.width = "0%"; }
  }
  function logar(m) { const l = $("#progLog"); l.textContent += m + "\n"; l.scrollTop = l.scrollHeight; }

  $("#btnCancelar").onclick = () => { if (E.sinal) { E.sinal.cancelado = true; logar("Cancelando…"); } };
  $("#btnAnalisar").onclick = async () => {
    lerCaso();
    E.sinal = { cancelado: false };
    progresso(true);
    const opts = { ocr: $("#oOCR").checked, forcarOCR: $("#oForcar").checked, larguraOCR: +$("#oQual").value, sinal: E.sinal };
    const docs = [];
    const t0 = performance.now();
    try {
      for (let i = 0; i < E.arquivos.length; i++) {
        const f = E.arquivos[i];
        $("#progTit").textContent = "Lendo " + (i + 1) + " de " + E.arquivos.length + ": " + f.name;
        logar("▸ " + f.name + " (" + tamanho(f.size) + ")");
        const doc = await M.lerArquivo(f, opts, ev => {
          if (ev.etapa === "log") { logar(ev.msg); return; }
          const frac = ev.total ? ev.atual / ev.total : 0;
          const base = i / E.arquivos.length, peso = 1 / E.arquivos.length;
          const parte = ev.etapa === "texto" ? frac * 0.35 : 0.35 + frac * 0.65;
          $("#progBarra").style.width = Math.round(100 * (base + peso * parte)) + "%";
          $("#progTxt").textContent = (ev.etapa === "texto" ? "Extraindo texto" : "Reconhecimento óptico (OCR)") + ": " + ev.atual + " de " + ev.total + (ev.etapa === "texto" ? " páginas" : " páginas/imagens");
        });
        docs.push(doc);
        logar("  " + doc.paginas.length + " página(s); " + doc.paginas.filter(p => p.ocr).length + " por OCR; SHA-256 " + (doc.sha256 || "").slice(0, 16) + "…");
      }
      $("#progTit").textContent = "Analisando a cadeia de custódia…";
      await new Promise(r => setTimeout(r, 30));
      E.docs = docs;
      E.res = M.analisar(docs);
      E.paginas = todasPaginas();
      restaurarRevisoes();
      logar("Concluído em " + Math.round((performance.now() - t0) / 1000) + " s.");
      progresso(false);
      mostrarResultado();
    } catch (err) {
      progresso(false);
      HUB.toast(err.message || String(err), 5000);
      console.error(err);
    }
  };
  function todasPaginas() {
    const ps = []; for (const d of E.docs) for (const p of d.paginas) ps.push(p);
    return ps.sort((a, b) => a.gid - b.gid);
  }

  $("#btnManual").onclick = () => {
    lerCaso();
    E.docs = []; E.paginas = [];
    E.res = M.analisar([], { ativos: [] });
    mostrarResultado();
    HUB.toast("Selecione, no painel, os tipos de vestígio a verificar.");
  };

  /* ------------------------------------------------------------ salvar / importar / revisões */
  function chaveRev() { return "cc_rev_" + E.docs.map(d => (d.sha256 || d.nome).slice(0, 24)).sort().join("_"); }
  function salvarRevisoes() {
    if (!E.res || !E.docs.length) return;
    const revs = {};
    for (const c in E.res.criterios) for (const id in E.res.criterios[c]) { const r = E.res.criterios[c][id]; if (r.rev || r.nota) (revs[c] = revs[c] || {})[id] = { rev: r.rev || null, nota: r.nota || "" }; }
    try { localStorage.setItem(chaveRev(), JSON.stringify({ revs, ativos: E.res.categorias.filter(c => c.ativo).map(c => c.id), caso: E.caso })); } catch (e) { /* armazenamento indisponível */ }
  }
  function restaurarRevisoes() {
    let dados = null;
    try { dados = JSON.parse(localStorage.getItem(chaveRev()) || "null"); } catch (e) { dados = null; }
    if (!dados) return;
    const ativosAtuais = E.res.categorias.filter(c => c.ativo).map(c => c.id).sort().join();
    if (dados.ativos && dados.ativos.slice().sort().join() !== ativosAtuais) {
      E.res.categorias.forEach(c => c.ativo = dados.ativos.includes(c.id));
      E.res = M.reavaliar(E.docs, E.res).res;
    }
    aplicarRevs(dados.revs);
    if (!E.caso.autos && dados.caso) { E.caso = dados.caso; escreverCaso(); }
    HUB.toast("Revisões anteriores deste material foram restauradas.");
  }
  function aplicarRevs(revs) {
    for (const c in revs || {}) for (const id in revs[c]) { const r = E.res.criterios[c] && E.res.criterios[c][id]; if (r) { r.rev = revs[c][id].rev || undefined; r.nota = revs[c][id].nota || ""; } }
  }
  $("#btnSalvar").onclick = () => {
    const revs = {};
    for (const c in E.res.criterios) for (const id in E.res.criterios[c]) { const r = E.res.criterios[c][id]; if (r.rev || r.nota) (revs[c] = revs[c] || {})[id] = { rev: r.rev || null, nota: r.nota || "" }; }
    const dados = {
      formato: "hub-cadeia-custodia", versao: 1, exportadoEm: new Date().toISOString(), caso: E.caso,
      ativos: E.res.categorias.filter(c => c.ativo).map(c => c.id), revs, ia: E.res.ia || null,
      docs: E.docs.map(d => ({ id: d.id, nome: d.nome, tipo: d.tipo, tamanho: d.tamanho, sha256: d.sha256, especie: d.especie, modificado: d.modificado, meta: d.meta, dimensoes: d.dimensoes, paginas: d.paginas.map(p => ({ n: p.n, texto: p.texto, ocr: p.ocr, conf: p.conf })) }))
    };
    const blob = new Blob([JSON.stringify(dados)], { type: "application/json" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob);
    a.download = "cadeia-custodia" + (E.caso.autos ? "-" + E.caso.autos.replace(/[^\w.-]+/g, "_") : "") + ".json";
    document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 800);
    HUB.toast("Análise salva. O arquivo contém o texto dos autos: guarde-o com o mesmo sigilo do processo.", 4200);
  };
  $("#btnImportar").onclick = () => $("#entradaJSON").click();
  $("#entradaJSON").onchange = async () => {
    const f = $("#entradaJSON").files[0]; $("#entradaJSON").value = "";
    if (!f) return;
    try {
      const d = JSON.parse(await f.text());
      if (d.formato !== "hub-cadeia-custodia") throw new Error("Arquivo não reconhecido.");
      E.caso = d.caso || {}; escreverCaso();
      E.docs = d.docs.map(x => Object.assign({}, x, { paginas: x.paginas.map(p => Object.assign({ n: p.n, ocr: p.ocr, conf: p.conf }, M.prepararPagina(p.texto || ""))) }));
      E.res = M.analisar(E.docs, { ativos: d.ativos });
      E.res.ia = d.ia || null;
      E.paginas = todasPaginas();
      aplicarRevs(d.revs);
      mostrarResultado();
      HUB.toast("Análise importada. Para visualizar as páginas originais, reanexe os arquivos.", 4200);
    } catch (e) { HUB.toast("Não foi possível importar: " + e.message, 4500); }
  };
  $("#btnNova").onclick = () => { if (confirm("Iniciar nova análise? As revisões ficam salvas neste navegador para o mesmo material.")) { salvarRevisoes(); abrirAba("analisar"); } };

  /* ------------------------------------------------------------ resultado */
  function mostrarResultado() {
    $("#abaResultado").disabled = false;
    const ativos = E.res.categorias.filter(c => c.ativo);
    E.catSel = ativos.length ? ativos[0].id : null;
    $("#resSobre").textContent = E.caso.autos ? "Autos " + E.caso.autos : (E.docs.length ? E.docs.length + " arquivo(s) analisado(s)" : "Checklist manual");
    $("#resTitulo").textContent = E.caso.assistido ? "Análise · " + E.caso.assistido : "Análise da cadeia de custódia";
    abrirAba("resultado");
    abrirSub("painel");
  }
  document.querySelectorAll("#subnav button").forEach(b => b.addEventListener("click", () => abrirSub(b.dataset.sub)));
  function abrirSub(id) {
    E.sub = id;
    document.querySelectorAll("#subnav button").forEach(b => b.setAttribute("aria-selected", b.dataset.sub === id ? "true" : "false"));
    ({ painel: renderPainel, matriz: renderMatriz, vestigios: renderVestigios, inconsistencias: renderInconsistencias, mapa: renderMapa, arquivos: renderArquivosRes, ia: renderIA, relatorio: renderRelatorio })[id]();
  }
  const C = () => $("#subconteudo");

  const RANK = { irregular: 4, controverso: 3, ausente: 2, documentado: 1, conforme: 1 };
  const CLS = { irregular: "s-bad", controverso: "s-warn", ausente: "s-miss", documentado: "s-ok", conforme: "s-ok" };
  function elos(catId) {
    const rc = E.res.criterios[catId] || {};
    return R.ETAPAS.map((e, i) => {
      let pior = null;
      for (const cr of R.CRITERIOS) {
        if (cr.etapa !== e.id || !rc[cr.id]) continue;
        const st = M.statusFinal(rc[cr.id]);
        if (RANK[st] && (!pior || RANK[st] > RANK[pior])) pior = st;
      }
      const romano = i < 10 ? ["I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X"][i] : ["L", "Ig", "D"][i - 10];
      const rot = e.rot + " (" + e.art + "): " + (pior ? REL.STATUS[pior].rot : "sem critério aplicável");
      return '<span class="elo ' + (pior ? CLS[pior] : "s-na") + (i === 10 ? " sep" : "") + '" title="' + esc(rot) + '" aria-label="' + esc(rot) + '">' + romano.replace("Ig", "G") + "</span>";
    }).join("");
  }
  const LEGENDA = '<div class="legenda"><span><i style="background:var(--ok)"></i>Documentado</span><span><i style="background:var(--warn)"></i>Controverso</span><span><i style="background:var(--miss-bg);border:2px solid var(--miss)"></i>Não localizado</span><span><i style="background:var(--bad)"></i>Irregular</span><span>I a X: etapas do art. 158-B · L, G, D: legalidade, integridade e acesso da defesa</span></div>';

  function renderPainel() {
    const r = E.res;
    const ativos = r.categorias.filter(c => c.ativo);
    const criticas = r.inconsistencias.filter(i => i.grav === "critico").length;
    const alertasCrit = r.alertas.filter(a => a.grav === "critico").reduce((s, a) => s + a.ev.length, 0);
    let h = '<div class="kpis">' +
      '<div class="card kpi"><div class="v">' + r.totalPaginas + '</div><div class="r">Páginas lidas</div></div>' +
      '<div class="card kpi"><div class="v">' + r.paginasOCR + '</div><div class="r">Por OCR</div></div>' +
      '<div class="card kpi"><div class="v">' + ativos.length + '</div><div class="r">Tipos de vestígio</div></div>' +
      '<div class="card kpi ' + (criticas ? "alerta" : "") + '"><div class="v">' + criticas + '</div><div class="r">Inconsistências críticas</div></div>' +
      '<div class="card kpi ' + (alertasCrit ? "alerta" : "") + '"><div class="v">' + alertasCrit + '</div><div class="r">Alertas críticos</div></div></div>';
    if (r.paginasBaixaConf.length) h += '<div class="aviso" style="margin-top:14px">' + r.paginasBaixaConf.length + ' página(s) foram lidas por OCR com baixa confiança. Confira-as manualmente: ' + r.paginasBaixaConf.slice(0, 40).map(g => pgChip(g)).join("") + "</div>";
    if (r.paginasVazias.length && E.docs.length) h += '<div class="aviso info" style="margin-top:10px">' + r.paginasVazias.length + " página(s) sem texto legível" + (r.paginasOCR ? "" : " (o OCR está desativado ou não foi aplicado)") + ". " + r.paginasVazias.slice(0, 30).map(g => pgChip(g)).join("") + "</div>";

    h += '<h3 style="margin-top:26px">Tipos de vestígio</h3><p class="pequeno mudo" style="margin-top:-4px">Os destacados foram identificados nos autos; os tracejados foram mencionados poucas vezes. Ative ou desative para refazer a verificação.</p><div class="chips" id="chipsCat">' +
      r.categorias.map(c => { const cat = CAT(c.id); return '<button type="button" class="chip' + (c.mencoes && !c.ativo ? " sug" : "") + '" aria-pressed="' + c.ativo + '" data-cat="' + c.id + '">' + cat.icone + " " + esc(cat.curto) + (c.mencoes ? ' <span class="n">' + c.mencoes + "</span>" : "") + "</button>"; }).join("") + "</div>";

    if (!ativos.length) h += '<div class="card card-p" style="margin-top:16px">Nenhum tipo de vestígio ativo. Selecione acima os vestígios que devem ser verificados.</div>';
    else {
      h += '<h3 style="margin-top:26px">Situação por vestígio</h3>' + LEGENDA + '<div class="catcards" style="margin-top:12px">' + ativos.map(c => {
        const cat = CAT(c.id); const k = M.classificar(r.criterios[c.id] || {});
        return '<div class="card catcard"><div class="cab"><span class="ic">' + cat.icone + '</span><h3>' + esc(cat.nome) + '</h3></div>' +
          '<div><span class="tag ' + REL.NIVEL[k.nivel] + '">' + k.rot + '</span> <span class="pequeno mudo">' + c.mencoes + " menções em " + c.paginas.length + ' página(s)</span></div>' +
          '<div class="elos">' + elos(c.id) + '</div>' +
          '<div><div class="pequeno mudo" style="display:flex;justify-content:space-between"><span>Conformidade documental</span><b>' + k.conformidade + '%</b></div><div class="barra"><i style="width:' + k.conformidade + '%"></i></div></div>' +
          '<div class="pequeno">' + (k.critIrreg ? '<span class="tag bad">' + k.critIrreg + " crítico(s) irregular(es)</span> " : "") + (k.critAus ? '<span class="tag miss">' + k.critAus + " crítico(s) não localizado(s)</span> " : "") + (k.controversos ? '<span class="tag warn">' + k.controversos + " controverso(s)</span>" : "") + "</div>" +
          '<div><button class="btn sec peq" data-abre="' + c.id + '">Abrir matriz</button></div></div>';
      }).join("") + "</div>";
    }
    const top = r.inconsistencias.filter(i => i.grav === "critico").slice(0, 4);
    if (top.length) h += '<h3 style="margin-top:26px">Pontos de maior gravidade</h3><div class="grade">' + top.map(incHTML).join("") + '</div><p><button class="btn sec peq" data-ir="inconsistencias">Ver todas as inconsistências e alertas</button></p>';
    C().innerHTML = h;
    C().querySelectorAll("[data-cat]").forEach(b => b.onclick = () => alternarCat(b.dataset.cat));
    C().querySelectorAll("[data-abre]").forEach(b => b.onclick = () => { E.catSel = b.dataset.abre; abrirSub("matriz"); });
    C().querySelectorAll("[data-ir]").forEach(b => b.onclick = () => abrirSub(b.dataset.ir));
    ligarPg(C());
  }
  function alternarCat(id) {
    const c = E.res.categorias.find(x => x.id === id); c.ativo = !c.ativo;
    E.res = M.reavaliar(E.docs, E.res).res;
    E.paginas = todasPaginas();
    if (!E.res.categorias.find(x => x.id === E.catSel && x.ativo)) { const a = E.res.categorias.find(x => x.ativo); E.catSel = a ? a.id : null; }
    salvarRevisoes();
    renderPainel();
  }

  function pgChip(gid, rotulo) {
    const p = E.paginas[gid]; if (!p) return "";
    return '<button type="button" class="pgchip" data-pg="' + gid + '">' + esc(rotulo || p.rot) + "</button>";
  }
  function ligarPg(raiz) {
    raiz.querySelectorAll("[data-pg]").forEach(b => b.addEventListener("click", e => { e.stopPropagation(); abrirPagina(+b.dataset.pg, b.dataset.ini ? { ini: +b.dataset.ini, fim: +b.dataset.fim, neg: b.dataset.neg === "1" } : null); }));
    raiz.querySelectorAll("[data-prec]").forEach(b => b.addEventListener("click", e => { e.stopPropagation(); abrirPrecedente(b.dataset.prec); }));
  }
  function evHTML(e, neg) {
    const p = E.paginas[e.gid];
    return '<div class="ev' + (neg ? " neg" : "") + '" data-pg="' + e.gid + '" data-ini="' + e.ini + '" data-fim="' + e.fim + '" data-neg="' + (neg ? 1 : 0) + '" role="button" tabindex="0"><div class="pg">' + esc(p ? p.rot : "") + (p && p.peca ? " · " + esc(PECA(p.peca).rot) : "") + "</div>" + esc(e.antes) + "<mark" + (neg ? ' class="mark-neg"' : "") + ">" + esc(e.alvo) + "</mark>" + esc(e.depois) + "</div>";
  }
  function precChip(k) {
    const p = REL.precedente(isNaN(+k) ? k : +k); if (!p) return "";
    return '<button type="button" class="tag" style="cursor:pointer" data-prec="' + esc(p.id) + '" title="' + esc(p.titulo) + '">' + (p.n ? "#" + p.n + " " : "") + esc(p.proc) + "</button>";
  }

  /* ---------- matriz ---------- */
  function renderMatriz() {
    const ativos = E.res.categorias.filter(c => c.ativo);
    if (!ativos.length) { C().innerHTML = '<div class="card card-p">Ative ao menos um tipo de vestígio no Painel.</div>'; return; }
    if (!E.catSel || !ativos.some(c => c.id === E.catSel)) E.catSel = ativos[0].id;
    const rc = E.res.criterios[E.catSel] || {}; const k = M.classificar(rc); const cat = CAT(E.catSel);
    let h = '<div class="chips" style="margin-bottom:14px">' + ativos.map(c => '<button type="button" class="chip" aria-pressed="' + (c.id === E.catSel) + '" data-sel="' + c.id + '">' + CAT(c.id).icone + " " + esc(CAT(c.id).curto) + "</button>").join("") + "</div>";
    h += '<div class="card card-p" style="display:grid;gap:10px"><div style="display:flex;gap:10px;flex-wrap:wrap;align-items:center"><b style="font-size:17px;flex:1">' + cat.icone + " " + esc(cat.nome) + '</b><span class="tag ' + REL.NIVEL[k.nivel] + '">' + k.rot + '</span><span class="pequeno mudo">Conformidade documental ' + k.conformidade + '%</span></div><div class="elos">' + elos(E.catSel) + "</div>" + LEGENDA +
      '<label class="check pequeno"><input type="checkbox" id="soProb"' + (E.soProb ? " checked" : "") + "> Mostrar apenas pendências (irregulares, controversos e não localizados)</label></div>";
    for (const et of R.ETAPAS) {
      const crits = R.CRITERIOS.filter(c => c.etapa === et.id && rc[c.id]).filter(c => !E.soProb || ["irregular", "controverso", "ausente"].includes(M.statusFinal(rc[c.id])) && !(c.inverso && M.statusFinal(rc[c.id]) === "sem_indicio"));
      if (!crits.length) continue;
      h += '<div class="etapa-grp"><h4>' + esc(et.rot) + ' <span style="text-transform:none;letter-spacing:0">art. ' + esc(et.art) + "</span></h4>" + crits.map(c => critHTML(c, rc[c.id])).join("") + "</div>";
    }
    C().innerHTML = h;
    C().querySelectorAll("[data-sel]").forEach(b => b.onclick = () => { E.catSel = b.dataset.sel; renderMatriz(); });
    $("#soProb").onchange = e => { E.soProb = e.target.checked; renderMatriz(); };
    religarMatriz();
  }
  function religarMatriz() {
    C().querySelectorAll("[data-rev]").forEach(b => b.onclick = () => {
      const [cid, val] = b.dataset.rev.split("|"); const r = E.res.criterios[E.catSel][cid];
      r.rev = val === "auto" ? undefined : val; salvarRevisoes();
      const det = b.closest("details"); const novo = document.createElement("div"); novo.innerHTML = critHTML(R.CRITERIOS.find(x => x.id === cid), r, true);
      det.replaceWith(novo.firstElementChild); religarMatriz();
    });
    C().querySelectorAll("[data-nota]").forEach(t => t.oninput = () => { E.res.criterios[E.catSel][t.dataset.nota].nota = t.value; clearTimeout(t._t); t._t = setTimeout(salvarRevisoes, 400); });
    ligarPg(C());
  }
  function critHTML(c, r, aberto) {
    const st = M.statusFinal(r); const s = REL.STATUS[st];
    const pesoTag = c.peso === "critico" ? '<span class="tag bad" style="background:none;border:1px solid currentColor">crítico</span>' : c.peso === "relevante" ? '<span class="tag">relevante</span>' : '<span class="tag na">formal</span>';
    const nEv = r.pos.length + r.neg.length;
    let h = '<details class="crit"' + (aberto ? " open" : "") + '><summary><span class="tag ' + s.cls + '">' + s.rot + "</span>" + '<span class="t">' + esc(c.titulo) + "</span>" + pesoTag + (r.rev ? '<span class="tag acc">revisado</span>' : "") + '<span class="pequeno mudo">' + nEv + " trecho(s)</span></summary><div class=\"corpo\">";
    h += "<div>" + esc(c.pergunta) + '<div class="pequeno mudo" style="margin-top:4px">Fundamento: ' + esc(c.fund) + "</div></div>";
    if (r.auto !== st) h += '<div class="pequeno">Triagem automática: <span class="tag ' + REL.STATUS[r.auto].cls + '">' + REL.STATUS[r.auto].rot + "</span></div>";
    if (r.neg.length) h += '<div><div class="pequeno" style="font-weight:600;color:var(--bad);margin-bottom:6px">Indícios de vício</div><div class="grade" style="gap:6px">' + r.neg.map(e => evHTML(e, true)).join("") + "</div></div>";
    if (r.pos.length) h += '<div><div class="pequeno" style="font-weight:600;color:var(--ok);margin-bottom:6px">Indícios de cumprimento</div><div class="grade" style="gap:6px">' + r.pos.map(e => evHTML(e, false)).join("") + "</div></div>";
    if (r.calcGids && r.calcGids.length) h += '<div class="pequeno">Confronto automático entre peças: ' + [...new Set(r.calcGids)].slice(0, 20).map(g => pgChip(g)).join("") + "</div>";
    if (!nEv && st === "ausente") h += '<div class="pequeno mudo">Nenhum registro correspondente foi localizado no texto dos autos. Verifique se a peça existe fora dos arquivos anexados ou em páginas de baixa legibilidade.</div>';
    if (c.prec && c.prec.length) h += '<div class="pequeno"><span class="mudo">Precedentes: </span>' + c.prec.map(precChip).join(" ") + "</div>";
    h += '<div><div class="pequeno mudo" style="margin-bottom:6px">Sua revisão</div><div class="rev">' +
      [["conforme", "Conforme"], ["irregular", "Irregular"], ["ausente", "Ausente"], ["controverso", "Controverso"], ["na", "Não se aplica"]].map(([v, l]) => '<button type="button" class="' + (r.rev === v ? "on" : "") + '" data-rev="' + c.id + "|" + v + '">' + l + "</button>").join("") +
      (r.rev ? '<button type="button" data-rev="' + c.id + '|auto">Restaurar automático</button>' : "") + "</div></div>";
    h += '<label class="campo">Anotação (entra no relatório e na minuta)<textarea data-nota="' + c.id + '" placeholder="Ex.: o termo de recebimento de fl. 212 não identifica quem transportou o material.">' + esc(r.nota || "") + "</textarea></label>";
    return h + "</div></details>";
  }

  /* ---------- vestígios ---------- */
  function renderVestigios() {
    const r = E.res; const ids = r.identificadores;
    let h = "";
    const comMen = r.categorias.filter(c => c.mencoes);
    h += '<div class="catcards">' + (comMen.length ? comMen.map(c => {
      const cat = CAT(c.id);
      return '<div class="card catcard"><div class="cab"><span class="ic">' + cat.icone + '</span><h3>' + esc(cat.nome) + "</h3>" + (c.ativo ? '<span class="tag ok">em análise</span>' : '<span class="tag na">inativo</span>') + '</div><div class="pequeno mudo">' + c.mencoes + " menções em " + c.paginas.length + " página(s)</div><div>" + c.paginas.slice(0, 24).map(g => pgChip(g)).join("") + (c.paginas.length > 24 ? ' <span class="pequeno mudo">e mais ' + (c.paginas.length - 24) + "</span>" : "") + '</div><div class="grade" style="gap:6px">' + c.amostras.slice(0, 3).map(e => evHTML(Object.assign({ ini: 0, fim: 0 }, e), false)).join("") + "</div></div>";
    }).join("") : '<div class="card card-p">Nenhum vestígio identificado no texto.</div>') + "</div>";

    const tabela = (tit, cols, linhas, nota) => linhas.length ? '<h3 style="margin-top:26px">' + tit + "</h3>" + (nota ? '<p class="pequeno mudo" style="margin-top:-4px">' + nota + "</p>" : "") + '<div class="card rolagem"><table class="tabela"><tr>' + cols.map(c => "<th>" + c + "</th>").join("") + "</tr>" + linhas.join("") + "</table></div>" : "";
    const grp = g => ({ apreensao: "Apreensão / ocorrência", constatacao: "Constatação", laudo: "Perícia", custodia: "Custódia / remessa", outros: "Outras peças" })[g] || g;
    h += tabela("IMEI", ["Valor", "Dígito verificador", "Peça", "Página"], ids.imei.map(x => '<tr><td class="mono">' + x.valor + "</td><td>" + (x.valido ? '<span class="tag ok">válido</span>' : '<span class="tag bad">inválido</span>') + "</td><td>" + grp(x.grupo) + "</td><td>" + pgChip(x.gid) + "</td></tr>"), "O IMEI possui 15 dígitos, sendo o último verificador (algoritmo de Luhn). Um IMEI inválido indica erro material, erro de leitura ou divergência na identificação do aparelho.");
    h += tabela("Lacres", ["Numeração", "Peça", "Página"], ids.lacres.map(x => '<tr><td class="mono">' + esc(x.valor) + "</td><td>" + grp(x.grupo) + "</td><td>" + pgChip(x.gid) + "</td></tr>"), "Compare a numeração aposta na apreensão com a consignada no recebimento e no laudo (art. 158-D do CPP).");
    h += tabela("Valores hash", ["Algoritmo", "Valor", "Peça", "Página"], ids.hashes.map(x => "<tr><td>" + x.alg + '</td><td class="mono">' + x.valor + "</td><td>" + grp(x.grupo) + "</td><td>" + pgChip(x.gid) + "</td></tr>"), "O mesmo valor deve reaparecer na coleta, no exame e na cópia entregue à defesa; um hash isolado não demonstra integridade.");
    h += tabela("Massas e pesos (drogas)", ["Valor", "Natureza", "Peça", "Página"], ids.pesos.map(x => "<tr><td>" + x.gramas.toLocaleString("pt-BR", { maximumFractionDigits: 3 }) + " g</td><td>" + (x.rotulo ? "massa " + x.rotulo : "não especificada") + "</td><td>" + grp(x.grupo) + "</td><td>" + pgChip(x.gid) + "</td></tr>"), "A diferença entre massa bruta (com embalagem) e líquida é esperada; a ausência de correspondência entre as peças deve ser explicada.");
    h += tabela("Capacidades de mídia", ["Valor", "Peça", "Página"], ids.capacidades.map(x => "<tr><td>" + esc(x.valor) + "</td><td>" + grp(x.grupo) + "</td><td>" + pgChip(x.gid) + "</td></tr>"));
    C().innerHTML = h; ligarPg(C());
  }

  /* ---------- inconsistências ---------- */
  function incHTML(n) {
    return '<div class="card inc ' + (n.grav === "critico" ? "critico" : n.grav === "info" ? "info" : "") + '"><div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-bottom:4px"><span class="tag ' + (n.grav === "critico" ? "bad" : n.grav === "info" ? "info" : "warn") + '">' + (n.grav === "critico" ? "Crítica" : n.grav === "info" ? "Informativa" : "Relevante") + "</span><b>" + esc(n.titulo) + '</b></div><div class="pequeno">' + esc(n.texto) + "</div>" + (n.gids.length ? '<div style="margin-top:6px">' + [...new Set(n.gids)].slice(0, 24).map(g => pgChip(g)).join("") + "</div>" : "") + (n.prec && n.prec.length ? '<div class="pequeno" style="margin-top:6px"><span class="mudo">Precedentes: </span>' + n.prec.map(precChip).join(" ") + "</div>" : "") + "</div>";
  }
  function renderInconsistencias() {
    const r = E.res;
    let h = '<h3>Inconsistências documentais</h3><p class="pequeno mudo" style="margin-top:-4px">Confrontos automáticos entre peças (IMEI, lacres, hashes, pesos, capacidades e datas).</p>';
    h += r.inconsistencias.length ? '<div class="grade">' + r.inconsistencias.map(incHTML).join("") + "</div>" : '<div class="card card-p">Nenhuma inconsistência objetiva foi detectada nos confrontos automáticos.</div>';
    h += '<h3 style="margin-top:28px">Alertas no texto dos autos</h3><p class="pequeno mudo" style="margin-top:-4px">Expressões que costumam revelar vícios na cadeia de custódia. Toque em um trecho para ver a página.</p>';
    h += r.alertas.length ? r.alertas.map(a => '<details class="crit"' + (a.grav === "critico" ? " open" : "") + '><summary><span class="tag ' + (a.grav === "critico" ? "bad" : "warn") + '">' + a.ev.length + '</span><span class="t">' + esc(a.rot) + '</span></summary><div class="corpo"><div class="grade" style="gap:6px">' + a.ev.slice(0, 12).map(e => evHTML(Object.assign({ ini: 0, fim: 0 }, e), a.grav === "critico")).join("") + "</div>" + (a.ev.length > 12 ? '<div class="pequeno mudo">E mais ' + (a.ev.length - 12) + " ocorrência(s). Use a busca nos autos.</div>" : "") + "</div></details>").join("") : '<div class="card card-p">Nenhum alerta textual encontrado.</div>';
    C().innerHTML = h; ligarPg(C());
  }

  /* ---------- mapa e busca ---------- */
  function renderMapa() {
    const r = E.res;
    let h = '<div class="card card-p"><label class="campo">Pesquisar nos autos<input type="search" id="busca" placeholder="Ex.: lacre 004512, cellebrite, termo de recebimento, nome do perito"></label><div id="buscaRes" style="margin-top:10px"></div></div>';
    if (r.linhaDoTempo.length) {
      const vistos = new Set();
      const ev = r.linhaDoTempo.filter(d => { const k = d.iso + d.peca; if (vistos.has(k)) return false; vistos.add(k); return true; }).slice(0, 80);
      h += '<h3 style="margin-top:26px">Linha do tempo estimada</h3><p class="pequeno mudo" style="margin-top:-4px">Datas localizadas no início de cada peça. Trata-se de estimativa: confira se a data corresponde ao ato documentado.</p><div class="card rolagem"><table class="tabela"><tr><th>Data</th><th>Peça</th><th>Página</th><th>Trecho</th></tr>' + ev.map(d => "<tr><td>" + M.fmtData(d.iso) + "</td><td>" + esc(PECA(d.peca).rot) + "</td><td>" + pgChip(d.gid) + '</td><td class="pequeno">' + esc(d.t.antes.slice(-50)) + "<mark>" + esc(d.t.alvo) + "</mark>" + esc(d.t.depois.slice(0, 50)) + "</td></tr>").join("") + "</table></div>";
    }
    const opts = '<option value="">Todas as peças</option>' + R.PECAS.map(p => '<option value="' + p.id + '">' + esc(p.rot) + "</option>").join("") + '<option value="__">Não classificadas</option>';
    h += '<h3 style="margin-top:26px">Mapa dos autos</h3><div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:10px"><select id="filtroPeca" style="max-width:320px">' + opts + '</select></div><div class="card rolagem" id="mapaTab"></div>';
    C().innerHTML = h;
    const desenhar = () => {
      const f = $("#filtroPeca").value;
      const ps = E.paginas.filter(p => !f || (f === "__" ? !p.peca : p.peca === f)).slice(0, 1500);
      const catsPg = {}; for (const c of r.categorias) for (const g of c.paginas) (catsPg[g] = catsPg[g] || []).push(CAT(c.id).icone);
      $("#mapaTab").innerHTML = '<table class="tabela"><tr><th>Página</th><th>Peça</th><th>Leitura</th><th>Vestígios</th><th>Início do texto</th></tr>' + ps.map(p => '<tr class="clic" data-pg="' + p.gid + '"><td style="white-space:nowrap">' + esc(p.rot) + "</td><td>" + (p.peca ? '<span class="tag" style="border-color:' + PECA(p.peca).cor + ';color:' + PECA(p.peca).cor + '">' + esc(PECA(p.peca).rot) + "</span>" + (p.herdada ? ' <span class="pequeno mudo">(cont.)</span>' : "") : '<span class="mudo pequeno">não classificada</span>') + "</td><td>" + (p.ocr ? '<span class="tag ' + (p.conf < 60 ? "warn" : "info") + '">OCR ' + p.conf + "%</span>" : '<span class="tag na">texto</span>') + "</td><td>" + (catsPg[p.gid] || []).join(" ") + '</td><td class="pequeno mudo">' + esc(p.texto.slice(0, 110)) + "</td></tr>").join("") + "</table>" + (E.paginas.length > 1500 ? '<p class="pequeno mudo" style="padding:0 10px">Exibindo as 1.500 primeiras páginas do filtro.</p>' : "");
      ligarPg($("#mapaTab"));
    };
    $("#filtroPeca").onchange = desenhar; desenhar();
    let tb;
    $("#busca").oninput = e => { clearTimeout(tb); tb = setTimeout(() => buscarAutos(e.target.value), 250); };
  }
  function buscarAutos(q) {
    const alvo = q.trim().normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
    const caixa = $("#buscaRes");
    if (alvo.length < 3) { caixa.innerHTML = ""; return; }
    const res = []; let total = 0;
    for (const p of E.paginas) {
      let i = p.norm.indexOf(alvo);
      while (i >= 0) {
        total++;
        if (res.length < 60) { const base = p.alinhado ? p.texto : p.norm; res.push({ gid: p.gid, ini: i, fim: i + alvo.length, antes: (i > 90 ? "… " : "") + base.slice(Math.max(0, i - 90), i), alvo: base.slice(i, i + alvo.length), depois: base.slice(i + alvo.length, i + alvo.length + 90) + " …" }); }
        i = p.norm.indexOf(alvo, i + alvo.length);
      }
    }
    caixa.innerHTML = '<div class="pequeno mudo" style="margin-bottom:6px">' + total + " ocorrência(s)" + (total > 60 ? "; exibindo 60" : "") + '</div><div class="grade" style="gap:6px">' + res.map(e => evHTML(e, false)).join("") + "</div>";
    ligarPg(caixa);
  }

  /* ---------- arquivos e imagens ---------- */
  const EDITORES = /photoshop|gimp|snapseed|lightroom|canva|picsart|pixlr|affinity|facetune|meitu|vsco|remini/i;
  function analiseExif(d) {
    const m = d.meta || {}; const flags = [];
    if (d.especie !== "imagem") return flags;
    const temExif = m && (m.Make || m.Model || m.DateTimeOriginal || m.CreateDate || m.Software);
    if (!temExif) flags.push(["warn", "Imagem sem metadados EXIF de câmera. É o padrão de capturas de tela e de imagens reencaminhadas por aplicativos de mensagem, que removem os metadados; a origem e a data de captura não podem ser confirmadas pelo arquivo."]);
    if (m.Software && EDITORES.test(m.Software)) flags.push(["bad", "Metadado de software de edição: " + m.Software + ". Indica que a imagem passou por programa de edição após a captura."]);
    else if (m.Software) flags.push(["info", "Software registrado: " + m.Software + "."]);
    const dto = m.DateTimeOriginal || m.CreateDate, mod = m.ModifyDate;
    if (dto && mod && Math.abs(new Date(mod) - new Date(dto)) > 60000) flags.push(["warn", "Data de modificação (" + new Date(mod).toLocaleString("pt-BR") + ") diversa da data de captura (" + new Date(dto).toLocaleString("pt-BR") + ")."]);
    if (m.latitude && m.longitude) flags.push(["info", "Coordenadas GPS embutidas: " + (+m.latitude).toFixed(6) + ", " + (+m.longitude).toFixed(6) + "."]);
    return flags;
  }
  function renderArquivosRes() {
    if (!E.docs.length) { C().innerHTML = '<div class="card card-p">Checklist manual: nenhum arquivo anexado.</div>'; return; }
    const hoje = new Date().toLocaleString("pt-BR");
    const cert = "Registro de integridade dos arquivos analisados\nData e hora: " + hoje + (E.caso.autos ? "\nAutos: " + E.caso.autos : "") + "\n\n" + E.docs.map((d, i) => (i + 1) + ". " + d.nome + " (" + tamanho(d.tamanho) + ")\n   SHA-256: " + (d.sha256 || "não calculado")).join("\n") + "\n\nOs valores acima identificam univocamente o conteúdo de cada arquivo. Qualquer alteração, ainda que de um único bit, produziria valor distinto.";
    let h = '<div class="card card-p"><div style="display:flex;gap:10px;flex-wrap:wrap;align-items:center;justify-content:space-between"><div><div class="sobretitulo" style="margin:0">Cadeia de custódia da própria defesa</div><b>Registro de integridade (SHA-256)</b></div><button class="btn sec peq" id="copiaCert">Copiar registro</button></div><p class="pequeno mudo">Documente o material recebido: o hash permite demonstrar, a qualquer tempo, que a cópia analisada não foi alterada e confrontá-la com a disponibilizada pela acusação.</p><pre class="mono" style="white-space:pre-wrap;background:var(--surface-2);padding:10px;border-radius:8px;margin:0">' + esc(cert) + "</pre></div>";
    h += '<div class="grade" style="margin-top:14px">' + E.docs.map((d, i) => {
      const flags = analiseExif(d); const m = d.meta || {};
      let x = '<div class="card card-p"><div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap"><span style="font-size:22px">' + iconeArq(d.nome) + '</span><b style="flex:1;min-width:0;word-break:break-word">' + (E.docs.length > 1 ? "Arq. " + (i + 1) + ": " : "") + esc(d.nome) + '</b><span class="pequeno mudo">' + tamanho(d.tamanho) + (d.paginas.length ? " · " + d.paginas.length + " pág. · " + d.paginas.filter(p => p.ocr).length + " por OCR" : "") + "</span></div>";
      x += '<div class="mono mudo" style="margin-top:6px">SHA-256 ' + esc(d.sha256 || "não calculado") + "</div>";
      if (d.especie === "imagem") {
        x += '<div class="grade g2" style="margin-top:12px;align-items:start">' + (d._url ? '<img src="' + d._url + '" alt="' + esc(d.nome) + '" style="max-width:100%;border-radius:8px;border:1px solid var(--line);cursor:zoom-in" data-pg="' + (d.paginas[0] ? d.paginas[0].gid : "") + '">' : '<div class="mudo pequeno">Reanexe a imagem para visualizá-la.</div>') + "<div>" + flags.map(f => '<div class="exif-flag"><span class="tag ' + f[0] + '">' + (f[0] === "bad" ? "atenção" : f[0] === "warn" ? "observação" : "dado") + "</span> " + esc(f[1]) + "</div>").join("") +
          '<table class="tabela" style="margin-top:8px">' + [["Dimensões", d.dimensoes], ["Fabricante", m.Make], ["Modelo", m.Model], ["Software", m.Software], ["Data de captura", m.DateTimeOriginal && new Date(m.DateTimeOriginal).toLocaleString("pt-BR")], ["Data de criação", m.CreateDate && new Date(m.CreateDate).toLocaleString("pt-BR")], ["Data de modificação", m.ModifyDate && new Date(m.ModifyDate).toLocaleString("pt-BR")], ["Arquivo modificado em", d.modificado && new Date(d.modificado).toLocaleString("pt-BR")]].filter(z => z[1]).map(z => "<tr><th>" + z[0] + "</th><td>" + esc(z[1]) + "</td></tr>").join("") + "</table></div></div>";
      } else if (d.especie === "midia") {
        x += d._url ? (/\.(mp3|wav|ogg|m4a|opus|aac|flac)$/i.test(d.nome) ? '<audio controls src="' + d._url + '" style="width:100%;margin-top:10px"></audio>' : '<video controls src="' + d._url + '" style="width:100%;max-height:360px;margin-top:10px;border-radius:8px;background:#000"></video>') : "";
        x += '<p class="pequeno mudo" style="margin:8px 0 0">Mídia registrada com hash. A degravação será feita pela ferramenta específica do HUB.</p>';
      } else if (d.especie === "pdf" && d.meta && d.meta.info) {
        const inf = d.meta.info;
        const campos = [["Produtor", inf.Producer], ["Criador", inf.Creator], ["Criado em", inf.CreationDate], ["Modificado em", inf.ModDate]].filter(z => z[1]);
        if (campos.length) x += '<table class="tabela" style="margin-top:8px">' + campos.map(z => "<tr><th>" + z[0] + "</th><td>" + esc(String(z[1]).replace(/^D:/, "")) + "</td></tr>").join("") + "</table>";
      } else if (d.especie === "outro") x += '<p class="pequeno mudo" style="margin:8px 0 0">Formato não lido; apenas o hash foi registrado.</p>';
      return x + "</div>";
    }).join("") + "</div>";
    C().innerHTML = h;
    $("#copiaCert").onclick = () => copiar(cert);
    ligarPg(C());
  }

  /* ---------- IA ---------- */
  function renderIA() {
    if (!E.paginas.length) { C().innerHTML = '<div class="card card-p">A análise por IA exige autos anexados.</div>'; return; }
    let chave = ""; try { chave = sessionStorage.getItem("cc_ia_chave") || localStorage.getItem("cc_ia_chave") || ""; } catch (e) { /* ignora */ }
    const r = E.res;
    let h = '<div class="grade g2" style="align-items:start"><div class="card card-p"><div class="sobretitulo">Opcional</div><h3>Análise aprofundada com Claude</h3><p class="pequeno">A triagem automática trabalha com padrões textuais. A análise por IA lê os trechos relevantes dos autos, revisa a triagem critério a critério, aponta inconsistências adicionais e sugere estratégia e diligências, sempre com indicação das páginas.</p>' +
      '<div class="aviso"><b>Atenção ao sigilo.</b> Ao executar, os trechos selecionados dos autos serão enviados à API da Anthropic, utilizando a sua chave e sob a sua responsabilidade. Avalie a compatibilidade com o sigilo do processo, com o dever de confidencialidade profissional e com a LGPD antes de prosseguir.</div>' +
      '<div class="grade" style="margin-top:12px"><label class="campo">Chave de API da Anthropic<input type="password" id="iaChave" autocomplete="off" placeholder="sk-ant-…" value="' + esc(chave) + '"></label>' +
      '<label class="check pequeno"><input type="checkbox" id="iaLembrar"' + (localStorage.getItem && (function () { try { return localStorage.getItem("cc_ia_chave"); } catch (e) { return null; } })() ? " checked" : "") + '> Lembrar a chave neste navegador</label>' +
      '<label class="campo">Modelo<select id="iaModelo">' + IA.MODELOS.map(m => '<option value="' + m.id + '">' + esc(m.rot) + "</option>").join("") + "</select></label>" +
      '<label class="campo">Volume máximo de texto enviado<select id="iaLimite"><option value="150000">Até 150 mil caracteres</option><option value="400000" selected>Até 400 mil caracteres</option><option value="900000">Até 900 mil caracteres</option><option value="2400000">Até 2,4 milhões de caracteres</option></select></label>' +
      '<div class="pequeno mudo" id="iaEstim"></div>' +
      '<label class="check pequeno"><input type="checkbox" id="iaCiente"> Estou ciente de que trechos dos autos serão enviados à API externa.</label>' +
      '<div class="linha-btns"><button class="btn" id="iaRodar" disabled>Executar análise por IA</button><button class="btn sec" id="iaParar" hidden>Interromper</button></div><div class="pequeno" id="iaStatus"></div></div></div>' +
      '<div id="iaRes">' + (r.ia && r.ia.resultado ? iaResHTML(r.ia) : '<div class="card card-p mudo">O resultado aparecerá aqui.</div>') + "</div></div>";
    C().innerHTML = h;
    const atual = () => { const est = IA.estimativa(E, $("#iaModelo").value, +$("#iaLimite").value); $("#iaEstim").textContent = "Serão enviadas " + est.sel.paginas + " de " + est.sel.de + " páginas relevantes, cerca de " + est.tokens.toLocaleString("pt-BR") + " tokens de entrada (custo estimado de US$ " + est.custo.toFixed(2) + ")."; };
    const hab = () => { $("#iaRodar").disabled = !($("#iaCiente").checked && $("#iaChave").value.trim().length > 20); };
    $("#iaModelo").onchange = atual; $("#iaLimite").onchange = atual; atual();
    $("#iaCiente").onchange = hab; $("#iaChave").oninput = hab; hab();
    let ctrl = null;
    $("#iaParar").onclick = () => ctrl && ctrl.abort();
    $("#iaRodar").onclick = async () => {
      const k = $("#iaChave").value.trim();
      try { sessionStorage.setItem("cc_ia_chave", k); if ($("#iaLembrar").checked) localStorage.setItem("cc_ia_chave", k); else localStorage.removeItem("cc_ia_chave"); } catch (e) { /* ignora */ }
      ctrl = new AbortController();
      $("#iaRodar").disabled = true; $("#iaParar").hidden = false;
      $("#iaStatus").textContent = "Enviando e aguardando a análise. Processos extensos podem levar alguns minutos…";
      try {
        const out = await IA.executar(E, k, $("#iaModelo").value, +$("#iaLimite").value, ctrl.signal);
        E.res.ia = out;
        $("#iaRes").innerHTML = iaResHTML(out); ligarIA();
        $("#iaStatus").textContent = "Análise concluída.";
      } catch (e) {
        $("#iaStatus").innerHTML = '<span style="color:var(--bad)">' + esc(e.name === "AbortError" ? "Análise interrompida." : e.message) + "</span>";
      } finally { $("#iaRodar").disabled = false; $("#iaParar").hidden = true; hab(); }
    };
    ligarIA();
  }
  function rotPg(s) {
    const p = E.paginas.find(x => x.rot.toLowerCase() === String(s).trim().toLowerCase());
    return p ? pgChip(p.gid) : '<span class="tag">' + esc(s) + "</span>";
  }
  function iaResHTML(ia) {
    const r = ia.resultado;
    let h = '<div class="card card-p"><div class="sobretitulo">Resultado da IA · ' + esc(ia.modelo) + " · " + new Date(ia.em).toLocaleString("pt-BR") + "</div><p>" + esc(r.sintese) + "</p>";
    if (r.achados.length) h += '<h4>Achados por critério</h4><div class="linha-btns" style="margin-bottom:8px"><button class="btn sec peq" id="iaAplicarTodos">Aplicar todas as sugestões como revisão</button></div>' + r.achados.map((a, i) => {
      const cr = R.CRITERIOS.find(c => c.id === a.criterio); const st = a.status === "conforme" ? "conforme" : a.status;
      const aplicavel = cr && E.res.criterios[a.categoria] && E.res.criterios[a.categoria][a.criterio];
      return '<div class="ev ' + (st === "irregular" ? "neg" : "") + '" style="cursor:default;margin-bottom:6px"><div class="pg">' + esc((CAT(a.categoria) || {}).curto || a.categoria) + " · " + esc(cr ? cr.id + " " + cr.titulo : "Outro") + ' · <span class="tag ' + REL.STATUS[st].cls + '">' + REL.STATUS[st].rot + "</span></div>" + esc(a.fundamentacao) + (a.trecho ? '<div class="pequeno mudo" style="margin-top:4px">“' + esc(a.trecho) + "”</div>" : "") + "<div>" + a.paginas.map(rotPg).join("") + (aplicavel ? ' <button class="btn sec peq" data-iaap="' + i + '">Aplicar</button>' : "") + "</div></div>";
    }).join("");
    if (r.inconsistencias.length) h += "<h4>Inconsistências apontadas</h4>" + r.inconsistencias.map(n => '<p class="pequeno"><span class="tag ' + (n.gravidade === "critica" ? "bad" : n.gravidade === "informativa" ? "info" : "warn") + '">' + esc(n.gravidade) + "</span> " + esc(n.descricao) + " " + n.paginas.map(rotPg).join("") + "</p>").join("");
    if (r.estrategia) h += "<h4>Estratégia sugerida</h4><p>" + esc(r.estrategia) + "</p>";
    if (r.diligencias.length) h += "<h4>Diligências e requerimentos</h4>" + r.diligencias.map(d => '<p class="pequeno">' + esc(d) + "</p>").join("");
    return h + '<p class="pequeno mudo">Conteúdo gerado por IA: confira cada afirmação nas páginas indicadas antes de utilizá-lo.</p></div>';
  }
  function ligarIA() {
    const ia = E.res.ia; if (!ia || !ia.resultado) return;
    const aplicar = a => { const r = E.res.criterios[a.categoria] && E.res.criterios[a.categoria][a.criterio]; if (r) { r.rev = a.status; r.nota = (r.nota ? r.nota + " " : "") + "[IA] " + a.fundamentacao; } };
    C().querySelectorAll("[data-iaap]").forEach(b => b.onclick = () => { aplicar(ia.resultado.achados[+b.dataset.iaap]); salvarRevisoes(); b.textContent = "Aplicado"; b.disabled = true; });
    const t = $("#iaAplicarTodos"); if (t) t.onclick = () => { ia.resultado.achados.forEach(aplicar); salvarRevisoes(); HUB.toast("Sugestões aplicadas como revisão. Confira na Matriz por etapa."); };
    ligarPg(C());
  }

  /* ---------- relatório ---------- */
  function renderRelatorio() {
    const est = { docs: E.docs, paginas: E.paginas, res: E.res, caso: E.caso };
    const html = E.relModo === "minuta" ? '<div class="rel-cab"><div class="rel-marca"><span class="marca-tpc">TPC</span> <span>ADVOGADOS</span></div><div class="mudo pequeno">Minuta gerada a partir da verificação · revise antes de protocolar</div></div>' + REL.minutaHTML(est) : REL.relatorio(est);
    C().innerHTML = '<div class="linha-btns nao-imprimir" style="margin-bottom:14px"><div class="sub" style="margin:0"><button data-rm="minuta" aria-selected="' + (E.relModo === "minuta") + '">Minuta de tese</button><button data-rm="relatorio" aria-selected="' + (E.relModo === "relatorio") + '">Relatório técnico</button></div><div class="espaco"></div><button class="btn sec peq" id="rCopiar">Copiar texto</button><button class="btn sec peq" id="rDoc">Baixar .doc (Word)</button><button class="btn peq" id="rPrint">Imprimir / PDF</button></div>' +
      (E.relModo === "minuta" ? '<div class="aviso info nao-imprimir" style="margin-bottom:14px">A minuta reflete a triagem e as suas revisões na Matriz por etapa. As referências de página correspondem às páginas dos arquivos anexados; ajuste-as para a numeração de folhas ou IDs do processo eletrônico.</div>' : "") +
      '<article class="papel" id="relPreview">' + html + "</article>";
    C().querySelectorAll("[data-rm]").forEach(b => b.onclick = () => { E.relModo = b.dataset.rm; renderRelatorio(); });
    $("#rCopiar").onclick = () => copiar(E.relModo === "minuta" ? REL.minutaTexto(est) : $("#relPreview").innerText);
    $("#rDoc").onclick = () => REL.exportarDoc($("#relPreview").innerHTML, (E.relModo === "minuta" ? "minuta-cadeia-custodia" : "relatorio-cadeia-custodia") + (E.caso.autos ? "-" + E.caso.autos.replace(/[^\w.-]+/g, "_") : ""));
    $("#rPrint").onclick = () => { document.body.classList.add("imprimindo-rel"); window.print(); setTimeout(() => document.body.classList.remove("imprimindo-rel"), 500); };
  }

  function copiar(txt) {
    const ok = () => HUB.toast("Copiado para a área de transferência.");
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(txt).then(ok, () => fallback());
    else fallback();
    function fallback() { const t = document.createElement("textarea"); t.value = txt; document.body.appendChild(t); t.select(); try { document.execCommand("copy"); ok(); } catch (e) { HUB.toast("Não foi possível copiar."); } t.remove(); }
  }

  /* ------------------------------------------------------------ visualizador de páginas */
  const modal = $("#modal");
  function abrirModal(tit, corpo, acoes) { $("#modalTit").textContent = tit; $("#modalCorpo").innerHTML = corpo; $("#modalAcoes").innerHTML = acoes || ""; modal.classList.add("aberto"); modal.setAttribute("aria-hidden", "false"); document.body.style.overflow = "hidden"; }
  function fecharModal() { modal.classList.remove("aberto"); modal.setAttribute("aria-hidden", "true"); document.body.style.overflow = ""; }
  modal.addEventListener("click", e => { if (e.target === modal) fecharModal(); });
  document.addEventListener("keydown", e => { if (e.key === "Escape" && modal.classList.contains("aberto")) fecharModal(); });

  async function abrirPagina(gid, destaque) {
    const p = E.paginas[gid]; if (!p) return;
    const d = E.docs.find(x => x.id === p.doc);
    const tit = (E.docs.length > 1 ? d.nome + " · " : "") + p.rot + (p.peca ? " · " + PECA(p.peca).rot : "") + (p.ocr ? " · OCR " + p.conf + "%" : "");
    const base = p.alinhado ? p.texto : p.norm;
    let txt;
    if (destaque && destaque.fim > destaque.ini) txt = esc(base.slice(0, destaque.ini)) + '<mark id="alvoTxt"' + (destaque.neg ? ' class="mark-neg"' : "") + ">" + esc(base.slice(destaque.ini, destaque.fim)) + "</mark>" + esc(base.slice(destaque.fim));
    else txt = esc(base);
    const temImg = (d._pdf || d._url) && d.especie !== "midia";
    abrirModal(tit, '<div class="visor">' + (temImg ? '<div class="visor-img" id="visorImg"><span class="mudo pequeno">Carregando a página…</span></div>' : '<div class="visor-img"><span class="mudo pequeno" style="padding:16px;text-align:center">Imagem original indisponível (análise importada). Reanexe o arquivo para visualizar.</span></div>') + '<div class="visor-txt">' + (txt || '<span class="mudo">Página sem texto reconhecido.</span>') + "</div></div>",
      '<button class="btn sec peq" id="pgAnt"' + (gid <= 0 ? " disabled" : "") + '>‹ Anterior</button><button class="btn sec peq" id="pgProx"' + (gid >= E.paginas.length - 1 ? " disabled" : "") + ">Próxima ›</button>");
    $("#pgAnt").onclick = () => abrirPagina(gid - 1); $("#pgProx").onclick = () => abrirPagina(gid + 1);
    const alvo = $("#alvoTxt"); if (alvo) alvo.scrollIntoView({ block: "center" });
    if (temImg) {
      const caixa = $("#visorImg");
      try {
        if (d._pdf) {
          const pg = await d._pdf.getPage(p.n);
          const canvas = await M.renderizarPagina(pg, Math.min(1400, Math.max(700, caixa.clientWidth * (window.devicePixelRatio || 1))));
          canvas.style.width = "100%"; caixa.innerHTML = ""; caixa.appendChild(canvas);
        } else { caixa.innerHTML = '<img src="' + d._url + '" alt="">'; }
      } catch (e) { caixa.innerHTML = '<span class="mudo pequeno">Não foi possível renderizar a página.</span>'; }
    }
  }

  function abrirPrecedente(id) {
    const p = (window.HUB_PRECEDENTES || []).find(x => x.id === id); if (!p) return;
    abrirModal((p.n ? "#" + p.n + " · " : "") + p.proc, precedenteHTML(p, true), '<button class="btn sec peq" id="copCit">Copiar citação</button>');
    $("#copCit").onclick = () => copiar(REL.citacao(p) + ".");
  }
  function precedenteHTML(p, completo) {
    return '<div><div class="sobretitulo" style="margin-bottom:4px">' + esc(p.tribunal + " · " + p.turma + " · Rel. " + p.rel + " · " + p.dje) + '</div><h3 style="font-family:var(--sans);font-weight:500;font-size:19px">' + esc(p.titulo) + "</h3>" + (p.complementar ? '<div class="aviso" style="margin:8px 0">Precedente complementar inserido pela plataforma. Confira o inteiro teor antes de citar.</div>' : "") +
      '<p class="pequeno"><b>Contexto.</b> ' + esc(p.contexto) + "</p>" + p.questoes.map(q => '<div class="qa"><div class="q">' + esc(q.q) + '</div><div class="pequeno" style="margin-top:4px">' + esc(q.t) + "</div></div>").join("") +
      '<p class="pequeno"><b>Desfecho.</b> ' + esc(p.desfecho) + "</p>" + (p.url ? '<p><a class="btn sec peq" href="' + esc(p.url) + '" target="_blank" rel="noopener">Abrir inteiro teor no acervo do IJCrim ↗</a></p>' : "") + '<p class="pequeno mudo" style="margin:0">Fonte: ' + esc(p.fonte) + "</p></div>";
  }

  /* ------------------------------------------------------------ base jurídica */
  const TAGS = { acesso: "Acesso sem ordem judicial", extracao: "Extração de dados", hash: "Hash", prints: "Prints", copia: "Cópia integral / acesso", original: "Extravio / original", intercept: "Interceptação", nuvem: "Nuvem / telemático", midia: "Áudio e vídeo", onus: "Ônus do Estado", derivada: "Provas derivadas", pericia: "Perícia", whatsapp: "WhatsApp" };
  document.querySelectorAll("#basenav button").forEach(b => b.addEventListener("click", () => { E.base = b.dataset.base; renderBase(); }));
  function renderBase() {
    document.querySelectorAll("#basenav button").forEach(b => b.setAttribute("aria-selected", b.dataset.base === E.base ? "true" : "false"));
    const alvo = $("#baseconteudo");
    if (E.base === "etapas") {
      alvo.innerHTML = '<div class="grade g2" style="align-items:start"><div class="card card-p"><div class="sobretitulo">Fase externa</div><div class="etapas-exp">' + etapasExp(0, 6) + '</div></div><div class="card card-p"><div class="sobretitulo">Fase interna</div><div class="etapas-exp">' + etapasExp(6, 10) + '</div><div class="aviso info" style="margin-top:14px">Garantias materiais: recipiente adequado à natureza do vestígio e lacre com numeração individualizada (art. 158-D, §§ 1º e 2º); abertura apenas pelo perito ou pessoa autorizada, com registro na ficha de acompanhamento de cada rompimento e guarda do lacre rompido no novo recipiente (§§ 3º a 5º); central de custódia com protocolo de entradas, saídas e acessos (art. 158-E) e retorno do material após a perícia (art. 158-F).</div></div></div>';
    } else if (E.base === "leis") {
      alvo.innerHTML = '<input type="search" id="bLei" placeholder="Filtrar dispositivos (ex.: lacre, hash, perito)" style="max-width:420px;margin-bottom:12px"><div class="grade" id="bLeiL"></div>';
      const des = () => { const q = norm($("#bLei").value); $("#bLeiL").innerHTML = window.HUB_LEGISLACAO.filter(l => !q || norm(l.artigo + " " + l.rotulo + " " + l.texto).includes(q)).map(l => '<details class="crit"><summary><span class="tag">' + esc(l.diploma) + '</span><span class="t">' + esc(l.artigo) + " · " + esc(l.rotulo) + "</span>" + (l.sintese ? '<span class="tag warn">síntese</span>' : "") + '</summary><div class="corpo"><div class="lei-txt">' + esc(l.texto) + "</div>" + (l.nota ? '<div class="aviso info">' + esc(l.nota) + "</div>" : "") + "</div></details>").join(""); };
      $("#bLei").oninput = des; des();
    } else if (E.base === "juris") {
      const f = E.jurisFiltro;
      alvo.innerHTML = '<div class="grade" style="grid-template-columns:minmax(0,2fr) minmax(0,1fr);margin-bottom:10px" id="jFiltros"><input type="search" id="jQ" placeholder="Pesquisar (ex.: hash, Cellebrite, prints, ônus, espelhamento)" value="' + esc(f.q) + '"><select id="jTurma"><option value="">Todas as turmas</option><option>Quinta Turma</option><option>Sexta Turma</option><option>Terceira Seção</option></select></div><div class="chips" style="margin-bottom:12px">' + Object.entries(TAGS).map(([k, v]) => '<button type="button" class="chip" aria-pressed="' + (f.tag === k) + '" data-tag="' + k + '">' + esc(v) + "</button>").join("") + '</div><div class="pequeno mudo" id="jCont"></div><div class="grade" id="jL" style="margin-top:8px"></div>';
      $("#jTurma").value = f.turma;
      const des = () => {
        const q = norm(f.q);
        const L = window.HUB_PRECEDENTES.filter(p => (!f.tag || p.tags.includes(f.tag)) && (!f.turma || p.turma === f.turma) && (!q || norm(p.proc + " " + p.titulo + " " + p.contexto + " " + p.questoes.map(x => x.q + " " + x.t).join(" ") + " " + p.desfecho + " " + p.rel).includes(q)));
        $("#jCont").textContent = L.length + " precedente(s)";
        $("#jL").innerHTML = L.map(p => '<details class="crit"><summary><span class="prec num" style="padding:0;font-family:var(--serif);font-size:22px;font-weight:700;color:var(--accent-ink);min-width:34px">' + (p.n ? String(p.n).padStart(2, "0") : "+") + '</span><span class="t">' + esc(p.titulo) + '<div class="pequeno mudo" style="font-weight:400">' + esc(p.proc + " · " + p.turma + " · " + p.dje) + '</div></span></summary><div class="corpo">' + precedenteHTML(p) + '<div><button class="btn sec peq" data-cit="' + esc(p.id) + '">Copiar citação</button></div></div></details>').join("");
        $("#jL").querySelectorAll("[data-cit]").forEach(b => b.onclick = () => copiar(REL.citacao(window.HUB_PRECEDENTES.find(x => x.id === b.dataset.cit)) + "."));
      };
      $("#jQ").oninput = e => { f.q = e.target.value; des(); };
      $("#jTurma").onchange = e => { f.turma = e.target.value; des(); };
      alvo.querySelectorAll("[data-tag]").forEach(b => b.onclick = () => { f.tag = f.tag === b.dataset.tag ? "" : b.dataset.tag; alvo.querySelectorAll("[data-tag]").forEach(x => x.setAttribute("aria-pressed", x.dataset.tag === f.tag)); des(); });
      des();
    } else {
      alvo.innerHTML = '<div class="grade g2" style="align-items:start">' + window.HUB_DOUTRINA.map(d => '<div class="card card-p"><div class="sobretitulo">' + esc(d.autor) + '</div><h3 style="font-size:20px">' + esc(d.obra) + "</h3>" + d.ideias.map(i => '<p class="pequeno" style="margin:0 0 8px">' + esc(i) + "</p>").join("") + '<p class="pequeno mudo" style="margin:10px 0 0;border-top:1px solid var(--line);padding-top:8px">' + esc(d.ref) + "</p></div>").join("") + '</div><p class="pequeno mudo">As sínteses doutrinárias foram redigidas para orientação. Antes de citar em peça, confira edição, página e literalidade nas obras.</p>';
    }
  }
  function etapasExp(a, b) {
    const desc = ["Distinguir o elemento como de potencial interesse pericial. Quem reconhece torna-se responsável pela preservação (art. 158-A, § 2º).", "Evitar que se altere o estado das coisas, isolando o ambiente imediato, mediato e relacionado aos vestígios.", "Descrever detalhadamente o vestígio e sua posição, com fotografias, filmagens ou croqui; descrição indispensável no laudo.", "Recolher o vestígio respeitando suas características e natureza, preferencialmente por perito oficial (art. 158-C).", "Embalar cada vestígio individualmente, com anotação de data, hora e responsável; recipiente selado por lacre numerado.", "Transferir o vestígio em condições adequadas, garantindo a manutenção de suas características e o controle da posse.", "Ato formal de transferência da posse, com protocolo, origem, quem transportou, código de rastreamento e quem recebeu.", "Exame pericial com metodologia adequada, formalizado em laudo produzido por perito.", "Guarda em condições adequadas, inclusive para contraperícia, vinculada ao número do laudo, em central de custódia.", "Liberação do vestígio conforme a legislação e, quando pertinente, mediante autorização judicial."];
    return R.ETAPAS.slice(a, b).map((e, i) => '<div class="etapa-exp' + (a >= 6 ? " int" : "") + '"><div class="n">' + ["I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X"][a + i] + '</div><div><b>' + esc(e.rot) + '</b> <span class="pequeno mudo">art. ' + esc(e.art) + '</span><div class="pequeno">' + esc(desc[a + i]) + "</div></div></div>").join("");
  }
  function norm(s) { return String(s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim(); }

  window.CC_APP = { fecharModal, abrirPagina, abrirPrecedente, estado: E };
  window.addEventListener("beforeunload", salvarRevisoes);
})();
