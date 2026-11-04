/* Interface da ferramenta RIF Defesa: importação dos CSV do COAF, visões analíticas, controle de legalidade,
   confronto com o relatório policial e relatórios. Nada é enviado a servidores. */
(function () {
  "use strict";
  const M = window.RIF_MOTOR, C = window.RIF_COMPARADOR, R = window.RIF_RELATORIO, J = window.RIF_JURIDICO;
  const { brl, dBR, fmtDoc } = M;
  const esc = window.HUB.esc;
  const $ = s => document.querySelector(s);
  const root = $("#root");
  if (window.pdfjsLib) window.pdfjsLib.GlobalWorkerOptions.workerSrc = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";

  const S = { arqs: {}, ds: null, rif: "", rel: null, cmp: null, legal: {}, caso: {}, view: "visao", sel: null, q: "", fst: "", abertos: new Set(), tipoRel: "defesa" };

  /* ------------------------------------------------------------------ utilidades de interface */
  function status(t, m) { $("#st-l").textContent = t; if (m != null) $("#st-m").textContent = m; }
  function ctx() {
    $("#ctx").textContent = S.ds ? "RIF " + (S.rif || "s/nº") + " · " + S.ds.tot.ncom + " com." + (S.cmp ? " · relatório policial" : "") : "";
    $("#st-m").textContent = S.ds ? S.ds.tot.ncom + " comunicações · " + S.ds.tot.nenv + " envolvidos · " + S.ds.oco.length + " ocorrências" : "";
  }
  const chip = (t, k) => '<span class="chip' + (k ? " " + k : "") + '">' + esc(t) + "</span>";
  const st = (t, k) => '<span class="st ' + k + '">' + esc(t) + "</span>";
  const GRAV = { critico: ["Crítica", "bad"], relevante: ["Relevante", "warn"], informativa: ["Informativa", "info"], requerer: ["Requerer", "info"] };
  const ST_POL = { "confirmada": "ok", "sentido invertido": "bad", "não é transação": "bad", "sem lastro": "bad", "valor divergente": "warn", "automática": "warn" };
  function secH(tit, sub, cor) { return '<div class="sec-h"><h2>' + (cor ? '<i style="background:' + cor + '"></i>' : "") + esc(tit) + "</h2>" + (sub ? "<p>" + sub + "</p>" : "") + "</div>"; }
  function setView(v) {
    S.view = v;
    document.querySelectorAll(".tb-tab").forEach(b => b.setAttribute("aria-pressed", String(b.dataset.view === v)));
    render();
    window.scrollTo(0, 0);
  }

  /* ------------------------------------------------------------------ importação */
  const modalImp = $("#imp"), modalPol = $("#pol");
  const abrir = m => { m.classList.add("open"); const f = m.querySelector("input,button"); f && f.focus(); };
  const fechar = m => m.classList.remove("open");
  $("#imp-cancel").onclick = () => fechar(modalImp);
  $("#pol-cancel").onclick = () => fechar(modalPol);
  [modalImp, modalPol].forEach(m => m.addEventListener("click", e => { if (e.target === m) fechar(m); }));
  document.addEventListener("keydown", e => { if (e.key === "Escape") { fechar(modalImp); fechar(modalPol); } });

  const arquivos = { com: null, env: null, oco: null };
  const tipoPorNome = n => (/comunica/i.test(n) ? "com" : /envolv/i.test(n) ? "env" : /ocorr/i.test(n) ? "oco" : null);
  const numRif = n => (/rif[_\s-]*(\d+)/i.exec(n) || [])[1] || "";
  for (const k of ["com", "env", "oco"]) $("#f-" + k).addEventListener("change", e => { arquivos[k] = e.target.files[0] || null; if (arquivos[k] && !$("#f-rif").value) $("#f-rif").value = numRif(arquivos[k].name); });
  function arrastar(zona, cb) {
    zona.addEventListener("dragover", e => { e.preventDefault(); zona.classList.add("over"); });
    zona.addEventListener("dragleave", () => zona.classList.remove("over"));
    zona.addEventListener("drop", e => { e.preventDefault(); zona.classList.remove("over"); cb([...e.dataTransfer.files]); });
  }
  arrastar($("#drop"), fs => {
    const nao = [];
    for (const f of fs) { const k = tipoPorNome(f.name); if (k) { arquivos[k] = f; if (!$("#f-rif").value) $("#f-rif").value = numRif(f.name); } else nao.push(f.name); }
    const ok = ["com", "env", "oco"].filter(k => arquivos[k]).map(k => arquivos[k].name);
    $("#imp-err").className = "err" + (nao.length ? "" : " ok");
    $("#imp-err").textContent = (ok.length ? "Recebidos: " + ok.join(", ") + ". " : "") + (nao.length ? "Não identificados pelo nome: " + nao.join(", ") + " (use os campos acima)." : "");
  });

  async function lerCSV(f) {
    const buf = await f.arrayBuffer();
    const dec = M.decodificar(buf);
    const p = M.parseCSV(dec.texto);
    p.nome = f.name; p.codificacao = dec.codificacao; p.controle = await M.controleArquivo(buf, dec.texto);
    return p;
  }
  /* identifica o arquivo pelo cabeçalho, para tolerar arquivos trocados entre os campos */
  const tipoPorCab = h => (h.includes("informacoesAdicionais") || h.includes("CampoA") ? "com" : h.includes("nomeEnvolvido") || h.includes("tipoEnvolvido") ? "env" : h.includes("Ocorrencia") ? "oco" : null);

  $("#imp-go").onclick = async () => {
    const err = $("#imp-err"); err.className = "err";
    const lista = ["com", "env", "oco"].map(k => arquivos[k]).filter(Boolean);
    if (lista.length < 3) { err.textContent = "Carregue os três arquivos: Comunicações, Envolvidos e Ocorrências."; return; }
    try {
      status("Lendo arquivos…");
      const lidos = {};
      for (const f of lista) { const p = await lerCSV(f); const k = tipoPorCab(p.head); if (!k) throw new Error("O arquivo " + f.name + " não tem o cabeçalho de um CSV do COAF."); if (lidos[k]) throw new Error("Dois arquivos do mesmo tipo (" + lidos[k].nome + " e " + f.name + ")."); lidos[k] = p; }
      for (const k of ["com", "env", "oco"]) if (!lidos[k]) throw new Error("Falta o arquivo de " + ({ com: "Comunicações", env: "Envolvidos", oco: "Ocorrências" })[k] + ".");
      if (!lidos.com.dados.length) throw new Error("O arquivo de Comunicações não contém registros.");
      status("Reconstruindo fluxos…");
      S.arqs = lidos; S.ds = M.construir(lidos); S.rif = $("#f-rif").value.trim(); S.cmp = null; S.rel = null; S.sel = null; S.abertos = new Set();
      fechar(modalImp); ctx(); setView("visao");
      status("RIF processado");
      window.HUB.toast("RIF processado: " + S.ds.tot.ncom + " comunicações.");
    } catch (e) { err.textContent = e.message || String(e); status("Erro na importação"); console.error(e); }
  };

  /* relatório policial */
  let arqPol = null;
  $("#f-pol").addEventListener("change", e => { arqPol = e.target.files[0] || null; });
  arrastar($("#drop-pol"), fs => { arqPol = fs.find(f => /\.pdf$/i.test(f.name)) || null; $("#pol-err").className = "err" + (arqPol ? " ok" : ""); $("#pol-err").textContent = arqPol ? "Recebido: " + arqPol.name : "Envie um arquivo PDF."; });
  $("#pol-go").onclick = async () => {
    const err = $("#pol-err"); err.className = "err";
    if (!S.ds) { err.textContent = "Importe primeiro os arquivos do RIF."; return; }
    if (!arqPol) { err.textContent = "Selecione o PDF do relatório policial."; return; }
    if (!window.pdfjsLib) { err.textContent = "O leitor de PDF não foi carregado. Verifique a conexão e recarregue a página."; return; }
    const btn = $("#pol-go"); btn.disabled = true;
    try {
      const prog = t => { err.className = "err ok"; err.textContent = t; status(t); };
      prog("Abrindo o PDF…");
      S.rel = await C.lerPDF(arqPol, prog);
      prog("Confrontando com o RIF…");
      S.cmp = C.comparar(S.ds, S.rel);
      fechar(modalPol); ctx(); setView("pol");
      status("Confronto concluído");
      window.HUB.toast("Relatório policial confrontado: " + S.cmp.linhas.length + " transações verificadas.");
    } catch (e) { err.className = "err"; err.textContent = "Não foi possível ler o PDF: " + (e.message || e); console.error(e); }
    finally { btn.disabled = false; }
  };

  document.querySelectorAll("[data-act]").forEach(b => b.addEventListener("click", () => {
    const a = b.dataset.act;
    if (a === "import") abrir(modalImp);
    else if (a === "policial") { if (!S.ds) { window.HUB.toast("Importe primeiro os arquivos do RIF."); abrir(modalImp); } else abrir(modalPol); }
    else if (a === "novo") {
      if (S.ds && !confirm("Descartar a análise atual? Os dados não ficam salvos no navegador.")) return;
      Object.assign(S, { arqs: {}, ds: null, rif: "", rel: null, cmp: null, legal: {}, caso: {}, sel: null, q: "", fst: "", abertos: new Set() });
      arquivos.com = arquivos.env = arquivos.oco = null; arqPol = null;
      ["#f-com", "#f-env", "#f-oco", "#f-pol", "#f-rif"].forEach(s => { $(s).value = ""; });
      $("#imp-err").textContent = ""; $("#pol-err").textContent = "";
      ctx(); setView("visao"); status("Pronto");
    }
  }));
  document.querySelectorAll(".tb-tab").forEach(b => b.addEventListener("click", () => setView(b.dataset.view)));

  /* ------------------------------------------------------------------ renderização */
  function render() {
    if (S.view === "base") return (root.innerHTML = vBase());
    if (!S.ds) return (root.innerHTML = vVazio(), ligarVazio());
    const v = { visao: vVisao, com: vCom, inc: vInc, legal: vLegal, pol: vPol, rel: vRel }[S.view] || vVisao;
    root.innerHTML = v();
    ({ visao: ligarVisao, com: ligarCom, legal: ligarLegal, pol: ligarPol, rel: ligarRel }[S.view] || (() => {}))();
  }

  function vVazio() {
    return '<div class="empty-state"><h1>Análise defensiva do RIF</h1>' +
      "<p>Importe os três arquivos CSV do COAF (Comunicações, Envolvidos e Ocorrências). A plataforma reconstrói os fluxos a partir das seções do relato bancário, separa recursos próprios, comunicações automáticas e duplicidades, aponta inconsistências e falhas de integridade e verifica a legalidade da obtenção.</p>" +
      "<p>Depois, insira o relatório da Polícia Civil em PDF para gerar o relatório comparativo, transação por transação.</p>" +
      '<div class="tools" style="justify-content:center;margin-top:14px"><button type="button" class="btn pri" id="e-imp">Importar CSV do COAF</button><button type="button" class="btn" id="e-base">Consultar a base jurídica</button></div>' +
      '<p class="tiny" style="margin-top:18px">Processamento integralmente local: os arquivos não saem do seu navegador e nada é armazenado.</p></div>';
  }
  function ligarVazio() { $("#e-imp").onclick = () => abrir(modalImp); $("#e-base").onclick = () => setView("base"); }

  /* ---------------- visão defensiva */
  function invertidos() { const s = new Set(); if (S.cmp) for (const v of S.cmp.verif) if (v.status === "sentido invertido" && v.fluxo) s.add(v.fluxo); return s; }
  function duplicados() { const s = new Set(); for (const d of S.ds.duplicidades) { s.add(d.origem); s.add(d.destino); } return s; }

  function vVisao() {
    const ds = S.ds, t = ds.tot;
    const auto = t.automaticas.reduce((s, c) => s + c.B, 0);
    const crit = ds.inconsistencias.filter(i => i.grav === "critico").length;
    const h = [];
    h.push('<div class="hero"><div><h1>RIF ' + esc(S.rif || "sem número") + " · visão defensiva</h1><p>" + t.ncom + " comunicações de " + t.ntit + " titular(es), operações de " + dBR(t.ini) + " a " + dBR(t.fim) + ". Os valores abaixo partem dos campos estruturados e das seções do relato bancário, com o sentido real do dinheiro.</p></div>" +
      '<div class="tools"><button type="button" class="btn" data-go="rel">Relatório da defesa</button><button type="button" class="btn pri" data-go="pol-ins">' + (S.cmp ? "Ver confronto policial" : "Inserir relatório policial") + "</button></div></div>");
    h.push('<div class="sum">' +
      '<div><span>Volume bruto informado</span><b class="bad">' + brl(t.somaA) + "</b><small>soma de créditos e débitos</small></div>" +
      "<div><span>Créditos efetivos</span><b>" + brl(t.cred) + "</b><small>" + Math.round(100 * t.cred / (t.somaA || 1)) + "% do volume bruto</small></div>" +
      '<div><span>Recursos próprios ou neutros</span><b class="fav">' + brl(t.neutros) + "</b><small>resgates, empréstimos, estornos, mesma titularidade</small></div>" +
      '<div><span>Comunicações automáticas</span><b class="fav">' + t.automaticas.length + "</b><small>" + brl(auto) + " em créditos, sem juízo de suspeição</small></div>" +
      '<div><span>Possível dupla contagem</span><b class="fav">' + brl(t.duplicado) + "</b><small>" + ds.duplicidades.length + " fluxo(s) relatado(s) pelas duas contas</small></div>" +
      '<div><span>Inconsistências do RIF</span><b class="fav">' + ds.inconsistencias.length + "</b><small>" + crit + " crítica(s) · " + ds.pontos.length + " pontos favoráveis</small></div></div>");

    h.push(secH("Reconciliação dos valores", "Do “volume” que costuma ser citado aos créditos de terceiros que efetivamente ingressaram nas contas comunicadas por atipicidade."));
    const rec = R.reconciliacao(ds), max = Math.max(...rec.map(r => r[1]), 1);
    const cores = ["var(--out)", "var(--fg2)", "var(--fav)", "var(--info)", "var(--fav)", "var(--warn)", "var(--warn)", "var(--c-titular)"];
    h.push('<div class="card"><div class="recon">' + rec.map(([k, v], i) => '<div class="ln"><span>' + esc(k) + '</span><span class="bar"><i style="width:' + (100 * v / max).toFixed(2) + "%;background:" + cores[i] + '"></i></span><span class="v">' + brl(v) + "</span></div>").join("") + "</div></div>");

    h.push(secH("Titulares comunicados", "Selecione um titular para destacar seus fluxos no diagrama e na tabela."));
    h.push('<div class="grid">' + [...ds.titulares.values()].map(T => {
      const coms = T.coms, cred = coms.reduce((s, c) => s + c.B, 0), neu = coms.reduce((s, c) => s + c.economia.vNeutro + c.economia.mesmaCred, 0);
      const terc = coms.filter(c => !c.automatica).reduce((s, c) => s + c.economia.credTerceiros, 0);
      const ren = coms.map(c => c.economia).find(e => e.rendaPeriodo), fat = coms.map(c => c.economia).find(e => e.fatPeriodo);
      const tipos = [...new Set(ds.pontos.filter(p => p.idxs.length && p.idxs.every(i => coms.some(c => c.idx === i))).map(p => p.tipo))];
      const incs = ds.inconsistencias.filter(i => i.idxs.some(x => coms.some(c => c.idx === x))).length;
      return '<button type="button" class="pcard" data-tit="' + T.doc + '" aria-pressed="' + (S.sel === T.doc) + '"><span class="nm">' + esc(T.nome) + '</span><span class="dc">' + fmtDoc(T.doc) + " · com. " + coms.map(c => c.idx).join(", ") + "</span>" +
        '<span class="nums"><span><span>Créditos</span><b>' + brl(cred) + "</b></span><span><span>Próprios ou neutros</span><b>" + brl(neu) + "</b></span><span><span>Terceiros (atipicidade)</span><b>" + brl(terc) + "</b></span>" +
        (fat ? "<span><span>Faturamento no período</span><b>" + brl(fat.fatPeriodo) + "</b></span>" : ren ? "<span><span>Renda × " + ren.meses + " meses</span><b>" + brl(ren.rendaPeriodo) + "</b></span>" : "<span><span>Automáticas</span><b>" + coms.filter(c => c.automatica).length + "</b></span>") + "</span>" +
        '<span class="chips">' + tipos.map(x => chip(x)).join("") + (incs ? chip(incs + " inconsistência(s)", "warn") : "") + "</span></button>";
    }).join("") + "</div>");

    h.push(secH("Diagrama de fluxos", "Setas no sentido real do dinheiro, conforme as seções de remetentes e destinatários do relato. " + (S.cmp ? "Em vermelho, fluxos que o relatório policial apresenta invertidos; " : "") + "em laranja, transferências relatadas pelas duas contas."));
    h.push('<div class="net" id="net"><div class="tip" id="tip"></div></div><div class="legend"><span><i style="background:var(--c-titular)"></i>Titular comunicado</span><span><i style="background:var(--c-contra)"></i>Contraparte citada</span><span><span class="ln"></span>Fluxo</span>' + (S.cmp ? '<span><span class="ln" style="border-color:var(--c-alerta)"></span>Invertido no relatório policial</span>' : "") + '<span><span class="ln" style="border-color:var(--warn);border-top-style:dashed"></span>Relatado pelas duas contas</span></div>');

    h.push(secH("Fluxos reconstruídos", "Cada linha corresponde a um item das seções do relato bancário ou a uma comunicação automática de espécie."));
    h.push('<div class="filterbar"><input type="search" id="q" placeholder="Filtrar por nome ou documento" value="' + esc(S.q) + '" aria-label="Filtrar fluxos">' + (S.sel ? '<button type="button" class="btn" id="limpa-sel">Mostrar todos os titulares</button>' : "") + '<span class="tiny" id="nfl"></span></div><div class="twrap" id="tfl"></div>');
    return h.join("");
  }
  function tabelaFluxos() {
    const ds = S.ds, inv = invertidos(), dup = duplicados(), q = M.sem(S.q).trim();
    const fl = ds.fluxos.filter(f => (!S.sel || f.de === S.sel || f.para === S.sel) && (!q || M.sem(ds.nomeDe(f.de) + " " + ds.nomeDe(f.para) + " " + f.de + " " + f.para + " " + (f.nomeContraparte || "")).includes(q)));
    $("#nfl").textContent = fl.length + " fluxo(s) · " + brl(fl.reduce((s, f) => s + f.valor, 0));
    $("#tfl").innerHTML = '<table class="txt"><thead><tr><th>Com.</th><th>Origem</th><th>Destino</th><th class="num">Valor</th><th class="num">Lanç.</th><th>Fonte no RIF</th><th>Observações</th></tr></thead><tbody>' +
      (fl.length ? fl.map(f => {
        const obs = [];
        if (f.mesma) obs.push(chip("mesma titularidade"));
        if (f.especie) obs.push(chip("espécie · automática"));
        if (dup.has(f)) obs.push(chip("relatado pelas duas contas", "warn"));
        if (inv.has(f)) obs.push(chip("invertido no relatório policial", "bad"));
        if (f.semDoc) obs.push(chip("sem documento", "neu"));
        const nm = d => (d ? esc(ds.nomeDe(d)) + '<br><span class="tiny mono">' + fmtDoc(d) + "</span>" : esc(f.nomeContraparte || "não identificado"));
        return "<tr><td>" + f.idx + "</td><td>" + nm(f.de) + "</td><td>" + nm(f.para) + '</td><td class="num">' + brl(f.valor) + '</td><td class="num">' + (f.n || "") + '</td><td class="tiny">' + esc(f.sentidoFonte) + '</td><td><div class="chips">' + obs.join("") + "</div></td></tr>";
      }).join("") : '<tr><td colspan="7" class="empty">Nenhum fluxo para o filtro.</td></tr>') + "</tbody></table>";
  }
  function ligarVisao() {
    root.querySelectorAll("[data-go]").forEach(b => b.onclick = () => { const g = b.dataset.go; if (g === "pol-ins") { if (S.cmp) setView("pol"); else abrir(modalPol); } else setView(g); });
    root.querySelectorAll(".pcard").forEach(b => b.onclick = () => { S.sel = S.sel === b.dataset.tit ? null : b.dataset.tit; render(); document.getElementById("net").scrollIntoView({ block: "start" }); });
    const ls = $("#limpa-sel"); if (ls) ls.onclick = () => { S.sel = null; render(); };
    $("#q").addEventListener("input", e => { S.q = e.target.value; tabelaFluxos(); });
    tabelaFluxos();
    grafo();
  }

  function grafo() {
    const box = $("#net"); if (!box || !window.d3) { if (box) box.insertAdjacentHTML("beforeend", '<div class="empty">Biblioteca de gráficos indisponível.</div>'); return; }
    const d3 = window.d3, ds = S.ds, inv = invertidos(), dup = duplicados();
    const arestas = new Map();
    for (const f of ds.fluxos) {
      if (!f.de || !f.para || f.de === f.para) continue;
      const k = f.de + ">" + f.para;
      const a = arestas.get(k) || { source: f.de, target: f.para, valor: 0, n: 0, coms: new Set(), inv: false, dup: false };
      a.valor += f.valor; a.n += f.n || 0; a.coms.add(f.idx); if (inv.has(f)) a.inv = true; if (dup.has(f)) a.dup = true;
      arestas.set(k, a);
    }
    const links = [...arestas.values()];
    const ids = new Set(links.flatMap(l => [l.source, l.target]));
    const vol = new Map(); for (const l of links) { vol.set(l.source, (vol.get(l.source) || 0) + l.valor); vol.set(l.target, (vol.get(l.target) || 0) + l.valor); }
    const nodes = [...ids].map(id => ({ id, nome: ds.nomeDe(id), tit: ds.titulares.has(id), vol: vol.get(id) || 0 }));
    if (!nodes.length) { box.insertAdjacentHTML("beforeend", '<div class="empty">Sem fluxos identificados no relato.</div>'); return; }
    const W = box.clientWidth, H = box.clientHeight;
    const r = d3.scaleSqrt().domain([0, d3.max(nodes, n => n.vol) || 1]).range([4, 22]);
    const w = d3.scaleSqrt().domain([0, d3.max(links, l => l.valor) || 1]).range([0.8, 7]);
    const svg = d3.select(box).append("svg").attr("viewBox", [0, 0, W, H]).attr("role", "img").attr("aria-label", "Diagrama dos fluxos financeiros reconstruídos do RIF");
    const defs = svg.append("defs");
    for (const [id, cor] of [["seta", "var(--fg3)"], ["seta-inv", "var(--c-alerta)"], ["seta-dup", "var(--warn)"]]) defs.append("marker").attr("id", id).attr("viewBox", "0 -5 10 10").attr("refX", 10).attr("markerWidth", 6).attr("markerHeight", 6).attr("orient", "auto").append("path").attr("d", "M0,-5L10,0L0,5").attr("fill", cor);
    const g = svg.append("g");
    svg.call(d3.zoom().scaleExtent([0.2, 5]).on("zoom", e => g.attr("transform", e.transform)));
    const foco = S.sel;
    const lk = g.append("g").selectAll("path").data(links).join("path").attr("fill", "none")
      .attr("stroke", l => (l.inv ? "var(--c-alerta)" : l.dup ? "var(--warn)" : "var(--fg3)")).attr("stroke-dasharray", l => (l.dup && !l.inv ? "5 3" : null))
      .attr("stroke-width", l => w(l.valor)).attr("marker-end", l => "url(#" + (l.inv ? "seta-inv" : l.dup ? "seta-dup" : "seta") + ")")
      .attr("opacity", l => (!foco || l.source === foco || l.target === foco ? 0.85 : 0.08));
    const nd = g.append("g").selectAll("g").data(nodes).join("g").style("cursor", "pointer");
    nd.append("circle").attr("r", n => r(n.vol)).attr("fill", n => (n.tit ? "var(--c-titular)" : "var(--c-contra)")).attr("stroke", "var(--panel)").attr("stroke-width", 1.5)
      .attr("opacity", n => (!foco || n.id === foco || links.some(l => (l.source === foco && l.target === n.id) || (l.target === foco && l.source === n.id)) ? 1 : 0.15));
    nd.filter(n => n.tit).append("text").text(n => n.nome.length > 28 ? n.nome.slice(0, 27) + "…" : n.nome).attr("x", n => r(n.vol) + 4).attr("y", 4).attr("font-size", 11).attr("fill", "var(--fg)").attr("paint-order", "stroke").attr("stroke", "var(--panel)").attr("stroke-width", 3);
    const tip = $("#tip");
    const mostra = (e, html) => { tip.innerHTML = html; tip.style.display = "block"; const b = box.getBoundingClientRect(); let x = e.clientX - b.left + 12, y = e.clientY - b.top + 12; if (x + 320 > b.width) x = Math.max(4, b.width - 324); tip.style.left = x + "px"; tip.style.top = y + "px"; };
    nd.on("mousemove", (e, n) => mostra(e, '<div class="h">' + (n.tit ? "Titular comunicado" : "Contraparte citada") + "</div><b>" + esc(n.nome) + '</b><div class="mono">' + fmtDoc(n.id) + "</div><div>Fluxos: " + brl(n.vol) + "</div>")).on("mouseleave", () => (tip.style.display = "none"))
      .on("click", (e, n) => { if (n.tit) { S.sel = S.sel === n.id ? null : n.id; render(); } });
    lk.on("mousemove", (e, l) => mostra(e, '<div class="h">Com. ' + [...l.coms].join(", ") + "</div><b>" + esc(ds.nomeDe(l.source.id || l.source)) + " → " + esc(ds.nomeDe(l.target.id || l.target)) + "</b><div>" + brl(l.valor) + (l.n ? " · " + l.n + " lançamento(s)" : "") + "</div>" + (l.inv ? '<div style="color:var(--c-alerta)">O relatório policial apresenta este fluxo no sentido inverso.</div>' : "") + (l.dup ? '<div style="color:var(--warn)">Relatado pela conta de origem e pela de destino.</div>' : ""))).on("mouseleave", () => (tip.style.display = "none"));
    const sim = d3.forceSimulation(nodes).force("link", d3.forceLink(links).id(n => n.id).distance(l => 60 + (l.source.tit && l.target.tit ? 80 : 0)).strength(0.5))
      .force("charge", d3.forceManyBody().strength(n => (n.tit ? -500 : -90))).force("center", d3.forceCenter(W / 2, H / 2)).force("collide", d3.forceCollide(n => r(n.vol) + 3))
      .force("x", d3.forceX(W / 2).strength(0.04)).force("y", d3.forceY(H / 2).strength(0.06));
    nd.call(d3.drag().on("start", (e, n) => { if (!e.active) sim.alphaTarget(0.3).restart(); n.fx = n.x; n.fy = n.y; }).on("drag", (e, n) => { n.fx = e.x; n.fy = e.y; }).on("end", (e, n) => { if (!e.active) sim.alphaTarget(0); n.fx = null; n.fy = null; }));
    sim.on("tick", () => {
      lk.attr("d", l => { const dx = l.target.x - l.source.x, dy = l.target.y - l.source.y, d = Math.hypot(dx, dy) || 1, rt = r(l.target.vol) + 2; const tx = l.target.x - dx / d * rt, ty = l.target.y - dy / d * rt; const curva = arestas.has(l.target.id + ">" + l.source.id) ? d * 0.6 : 0; return curva ? "M" + l.source.x + "," + l.source.y + "A" + curva + "," + curva + " 0 0,1 " + tx + "," + ty : "M" + l.source.x + "," + l.source.y + "L" + tx + "," + ty; });
      nd.attr("transform", n => "translate(" + n.x + "," + n.y + ")");
    });
  }

  /* ---------------- comunicações */
  function marcar(c) {
    const R2 = c.relato, ms = [];
    for (const x of R2.especulativos) ms.push([x.ini, x.fim, "esp"]);
    for (const x of R2.explicacoes) ms.push([x.ini, x.fim, "fav"]);
    for (const x of R2.docsNoTexto) ms.push([x.ini, x.ini + x.texto.length, "doc"]);
    ms.sort((a, b) => a[0] - b[0]);
    let out = "", p = 0;
    for (const [i, f, k] of ms) { if (i < p) continue; out += esc(c.texto.slice(p, i)) + '<mark class="' + k + '">' + esc(c.texto.slice(i, f)) + "</mark>"; p = f; }
    return out + esc(c.texto.slice(p));
  }
  function vCom() {
    const ds = S.ds, h = [];
    h.push('<div class="hero"><div><h1>Comunicações do COAF</h1><p>Cada comunicação com a leitura econômica, as contrapartes extraídas das seções do relato, os enquadramentos com a sua leitura defensiva e o texto integral, com destaque para expressões de incerteza (amarelo), explicações lícitas (verde) e documentos citados (azul).</p></div><div class="tools"><button type="button" class="btn" id="abre-tudo">Expandir todas</button><button type="button" class="btn" id="fecha-tudo">Recolher todas</button></div></div>');
    for (const c of ds.com) {
      const e = c.economia, ab = S.abertos.has(c.idx), t = c.titular;
      const pts = ds.pontos.filter(p => p.idxs.length === 1 && p.idxs[0] === c.idx);
      const incs = ds.inconsistencias.filter(i => i.idxs.includes(c.idx));
      h.push('<div class="cc" id="cc-' + c.idx + '"><div class="cc-h"><button type="button" class="cc-tg" data-cc="' + c.idx + '" aria-expanded="' + ab + '" aria-label="' + (ab ? "Recolher" : "Expandir") + ' comunicação">' + (ab ? "−" : "+") + '</button><div class="cc-main">' +
        '<div class="cc-l1"><span>Com. ' + c.idx + "</span><span>ID " + esc(c.id) + "</span><span>" + esc(c.comunicante) + "</span><span>Ag. " + esc(c.numAg || "") + " " + esc(c.cidade || "") + "/" + esc(c.uf || "") + "</span><span>Recebida em " + esc(c.recebTxt || "") + "</span></div>" +
        '<div class="cc-l2"><h3 data-cc="' + c.idx + '">' + esc(t ? t.nome : "Titular não identificado") + "</h3>" + (c.automatica ? chip("comunicação automática", "info") : chip("comunicação por atipicidade", "neu")) + chip("segmento " + c.seg, "neu") + (incs.length ? chip(incs.length + " inconsistência(s)", "warn") : "") + (pts.length ? chip(pts.length + " ponto(s) favorável(is)") : "") + "</div>" +
        '<div class="cc-l3"><span>' + dBR(c.ini) + " a " + dBR(c.fim) + (e.meses ? " (" + e.meses + " meses)" : "") + "</span><span>" + c.ocs.length + " enquadramento(s)</span><span>" + c.env.length + " envolvido(s)</span>" + (t ? '<span class="mono">' + fmtDoc(t.doc) + "</span>" : "") + "</div></div>" +
        '<div class="cc-vol"><span>Créditos · Débitos</span><b>' + brl(c.B) + "</b><small>" + brl(c.C) + ' em débitos</small><small class="tiny">soma bruta ' + brl(c.A) + "</small></div></div>");
      if (ab) {
        const rows = [["Créditos comunicados", brl(c.B)], ["Recursos neutros nos créditos", brl(e.vNeutro)], ["Mesma titularidade (créditos)", brl(e.mesmaCred)], ["Créditos de terceiros", brl(e.credTerceiros)], ["Débitos para o próprio titular", brl(e.vDebProprio + e.mesmaDeb)], ["Débitos ordinários (tributos, tarifas, contas)", brl(e.vDebOrd)]];
        if (e.renda) rows.push(["Renda cadastral" + (e.renda.data ? " (" + dBR(e.renda.data) + ")" : ""), brl(e.renda.valor) + (e.rendaPeriodo ? " · " + brl(e.rendaPeriodo) + " no período" : "")]);
        if (e.faturamento) rows.push(["Faturamento " + (e.faturamento.tipo || "declarado"), brl(e.faturamento.valor) + (e.fatPeriodo ? " · " + brl(e.fatPeriodo) + " no período" : "")]);
        if (e.atualizacao) rows.push(["Cadastro atualizado em", dBR(e.atualizacao)]);
        const cps = (l, tit) => '<div class="cf"><div class="cf-h"><span>' + tit + "</span><span>" + brl(l.reduce((s, x) => s + x.valor, 0)) + "</span></div>" + (l.length ? l.map(x => '<div class="cf-row"><span>' + esc(x.nome) + (x.docTexto ? ' <span class="tiny mono">' + esc(x.docTexto) + "</span>" : "") + (x.qualificacao ? '<br><span class="tiny">' + esc(x.qualificacao) + "</span>" : "") + (x.mesmaTitularidade ? " " + chip("mesma titularidade") : "") + '</span><span class="num">' + brl(x.valor) + '<br><span class="tiny">' + x.n + " lanç.</span></span></div>").join("") : '<div class="tiny">Seção ausente no relato.</div>') + "</div>";
        h.push('<div class="cc-b"><div class="two"><div class="cf"><div class="cf-h"><span>Leitura econômica</span></div>' + rows.map(([k, v]) => '<div class="cf-row"><span>' + esc(k) + '</span><span class="num">' + v + "</span></div>").join("") + "</div>" + cps(c.relato.remetentes, "Principais remetentes") + cps(c.relato.destinatarios, "Principais destinatários") + "</div>");
        if (pts.length || incs.length) h.push('<div class="two">' + (pts.length ? "<div>" + pts.map(p => '<div class="ach fav"><div class="hd"><b>' + esc(p.titulo) + "</b></div><p>" + esc(p.texto) + "</p></div>").join("") + "</div>" : "") + (incs.length ? "<div>" + incs.map(i => '<div class="ach ' + i.grav + '"><div class="hd">' + st(GRAV[i.grav][0], GRAV[i.grav][1]) + "<b>" + esc(i.titulo) + "</b></div><p>" + esc(i.texto) + "</p></div>").join("") + "</div>" : "") + "</div>");
        h.push('<h4 class="cc-sh">Enquadramentos indicados pelo banco</h4><div>' + c.ocs.map(o => '<div class="oc"><div class="oc-h"><span class="tag">' + esc(o.codigo) + '</span><span class="tiny">' + esc(o.norma) + "</span></div><p>" + esc(o.desc) + '</p><div class="def">' + esc(o.leitura) + "</div></div>").join("") + "</div>");
        h.push('<h4 class="cc-sh">Envolvidos</h4><div class="twrap"><table class="txt"><thead><tr><th>Tipo</th><th>Nome</th><th>CPF/CNPJ</th><th>Agência/conta</th><th>Abertura</th><th>Atualização</th><th>PEP</th><th>Servidor</th></tr></thead><tbody>' + c.env.map(x => "<tr><td>" + esc(x.tipo) + "</td><td>" + esc(x.nome) + '</td><td class="mono">' + esc(x.docTxt) + (x.doc && !M.validDoc(x.doc) ? " " + chip("inválido", "bad") : "") + '</td><td class="mono">' + esc((x.ag || "") + (x.conta ? " / " + x.conta : "")) + "</td><td>" + dBR(x.abertura) + "</td><td>" + dBR(x.atualizacao) + "</td><td>" + esc(x.pep) + "</td><td>" + esc(x.serv) + "</td></tr>").join("") + "</tbody></table></div>");
        h.push('<h4 class="cc-sh">Relato do comunicante</h4><div class="cc-txt">' + marcar(c) + "</div></div>");
      }
      h.push("</div>");
    }
    return h.join("");
  }
  function ligarCom() {
    root.querySelectorAll("[data-cc]").forEach(b => b.onclick = () => { const i = +b.dataset.cc; S.abertos.has(i) ? S.abertos.delete(i) : S.abertos.add(i); const y = window.scrollY; render(); window.scrollTo(0, y); });
    $("#abre-tudo").onclick = () => { S.ds.com.forEach(c => S.abertos.add(c.idx)); render(); };
    $("#fecha-tudo").onclick = () => { S.abertos.clear(); render(); };
  }

  /* ---------------- inconsistências e pontos favoráveis */
  function vInc() {
    const ds = S.ds, h = [];
    const n = g => ds.inconsistencias.filter(i => i.grav === g).length;
    h.push('<div class="hero"><div><h1>Inconsistências e pontos favoráveis</h1><p>Falhas de integridade, de valores, de datas e de identificação extraídas do confronto entre os três arquivos e o relato bancário, seguidas dos elementos do próprio RIF que favorecem a defesa.</p></div></div>');
    h.push('<div class="sum"><div><span>Críticas</span><b class="bad">' + n("critico") + '</b></div><div><span>Relevantes</span><b>' + n("relevante") + '</b></div><div><span>Informativas</span><b>' + n("informativa") + '</b></div><div><span>Pontos favoráveis</span><b class="fav">' + ds.pontos.length + "</b></div></div>");
    const ordem = { critico: 0, relevante: 1, informativa: 2 };
    const cats = [...new Set(ds.inconsistencias.map(i => i.cat))];
    for (const cat of cats) {
      const l = ds.inconsistencias.filter(i => i.cat === cat).sort((a, b) => ordem[a.grav] - ordem[b.grav]);
      h.push(secH(cat, l.length + " apontamento(s)", "var(--warn)"));
      h.push(l.map(i => '<div class="ach ' + i.grav + '"><div class="hd">' + st(GRAV[i.grav][0], GRAV[i.grav][1]) + "<b>" + esc(i.titulo) + "</b>" + (i.idxs.length ? '<span class="tiny">com. ' + i.idxs.join(", ") + "</span>" : "") + "</div><p>" + esc(i.texto) + "</p></div>").join(""));
    }
    if (!cats.length) h.push('<div class="card empty">Nenhuma inconsistência identificada.</div>');
    const tipos = [...new Set(ds.pontos.map(p => p.tipo))];
    h.push(secH("Pontos favoráveis extraídos do RIF", "Elementos que o próprio comunicante registrou e que afastam ou atenuam a leitura acusatória.", "var(--fav)"));
    for (const tp of tipos) h.push('<h4 class="cc-sh" style="margin:12px 0 6px;text-transform:capitalize">' + esc(tp) + "</h4>" + ds.pontos.filter(p => p.tipo === tp).map(p => '<div class="ach fav"><div class="hd"><b>' + esc(p.titulo) + "</b>" + (p.valor ? '<span class="tag">' + brl(p.valor) + "</span>" : "") + "</div><p>" + esc(p.texto) + "</p></div>").join(""));
    return h.join("");
  }

  /* ---------------- legalidade */
  function vLegal() {
    const L = S.legal, h = [];
    const sel = (id, rot, ops) => "<label>" + rot + '<select id="' + id + '">' + ops.map(([v, t]) => '<option value="' + v + '"' + ((L[id] || "") === v ? " selected" : "") + ">" + esc(t) + "</option>").join("") + "</select></label>";
    const sn = [["", "Não informado"], ["sim", "Sim"], ["nao", "Não"]];
    const data = (id, rot) => "<label>" + rot + '<input type="date" id="' + id + '" value="' + esc(L[id] || "") + '"></label>';
    h.push('<div class="hero"><div><h1>Controle de legalidade da obtenção</h1><p>Informe o que consta dos autos sobre a forma de obtenção do RIF. A avaliação aplica o Tema 990, a orientação da Terceira Seção do STJ, a Segunda Turma do STF, os requisitos do Tema 1.404 e o teste da cronologia. Campos não informados geram pedidos de esclarecimento.</p></div></div>');
    h.push('<div class="card"><div class="form">' +
      sel("modalidade", "Modalidade do RIF", Object.entries(R.MODALIDADES).map(([k, v]) => [k, k ? v.charAt(0).toUpperCase() + v.slice(1) : "Não informada"])) +
      sel("procedimento", "Procedimento em que foi requerido ou recebido", Object.entries(R.PROCEDIMENTOS).map(([k, v]) => [k, k ? v.charAt(0).toUpperCase() + v.slice(1) : "Não informado"])) +
      sel("autorizacao", "Houve autorização judicial prévia?", sn) +
      data("dataInstauracao", "Data de instauração do procedimento") + data("dataPedido", "Data do pedido ao COAF") + data("dataInclusao", "Data em que o assistido passou a figurar como investigado") +
      sel("portaria", "O pedido foi instruído com o ato de instauração?", sn) + sel("sei", "Há certificação do SEI-C, data e autoridade?", sn) + sel("primeira", "O RIF foi a primeira ou única medida?", sn) +
      data("fatosIni", "Início dos fatos investigados") + data("fatosFim", "Fim dos fatos investigados") + sel("acesso", "A defesa teve acesso integral?", sn) +
      '</div></div><div id="leg-res"></div>');
    return h.join("");
  }
  function resLegal() {
    const ach = R.legalidade(S.legal, S.ds);
    const ordem = { critico: 0, relevante: 1, requerer: 2, informativa: 3 };
    ach.sort((a, b) => ordem[a.grav] - ordem[b.grav]);
    $("#leg-res").innerHTML = secH("Avaliação", ach.filter(a => a.grav === "critico").length + " vício(s) crítico(s), " + ach.filter(a => a.grav === "relevante").length + " relevante(s) e " + ach.filter(a => a.grav === "requerer").length + " ponto(s) a requerer.") +
      (ach.length ? ach.map(a => '<div class="ach ' + (a.grav === "requerer" ? "informativa" : a.grav) + '"><div class="hd">' + st(GRAV[a.grav][0], GRAV[a.grav][1]) + "<b>" + esc(a.titulo) + "</b></div><p>" + esc(a.texto) + "</p>" + (a.pedido ? '<p style="margin-top:6px"><b>Providência:</b> ' + esc(a.pedido) + "</p>" : "") + (a.fund.length ? '<p class="tiny" style="margin-top:6px">' + a.fund.map(id => esc(R.cit(id))).join(" · ") + "</p>" : "") + "</div>").join("") : '<div class="card empty">Nenhum vício identificado com as informações prestadas.</div>');
  }
  function ligarLegal() {
    root.querySelectorAll(".form select, .form input").forEach(el => el.addEventListener("change", () => { S.legal[el.id] = el.value; resLegal(); }));
    resLegal();
  }

  /* ---------------- confronto com o relatório policial */
  function vPol() {
    const h = [];
    if (!S.cmp) {
      h.push('<div class="empty-state"><h1>Relatório policial × RIF</h1><p>Insira o relatório elaborado pela Polícia Civil (PDF). A plataforma reconstrói as tabelas de transações e de alvos, verifica cada transação contra o relato bancário da comunicação indicada e aponta valores sem lastro, sentido invertido, valores que não são transação, dupla contagem, comunicações automáticas tratadas como suspeitas, linguagem conclusiva e omissões.</p><div class="tools" style="justify-content:center"><button type="button" class="btn pri" id="p-ins">Inserir relatório policial (PDF)</button></div></div>');
      return h.join("");
    }
    const r = S.cmp, porSt = {};
    for (const v of r.verif) porSt[v.status] = (porSt[v.status] || 0) + 1;
    h.push('<div class="hero"><div><h1>Relatório policial × RIF</h1><p>' + esc(S.rel.nome) + " · " + S.rel.paginas.length + " página(s)" + (S.rel.paginas.some(p => p.ocr) ? " · OCR aplicado" : "") + (r.labld ? " · padrão LAB-LD identificado" : "") + '</p></div><div class="tools"><button type="button" class="btn" id="p-ins">Substituir PDF</button><button type="button" class="btn pri" id="p-rel">Relatório comparativo</button></div></div>');
    h.push('<div class="sum"><div><span>Transações afirmadas</span><b>' + r.linhas.length + "</b><small>" + brl(r.vTot) + '</small></div><div><span>Confirmadas no RIF</span><b>' + (porSt["confirmada"] || 0) + '</b></div><div><span>Com problema</span><b class="fav">' + (r.linhas.length - (porSt["confirmada"] || 0)) + "</b><small>" + brl(r.vRuim) + '</small></div><div><span>Sentido invertido</span><b class="fav">' + (porSt["sentido invertido"] || 0) + '</b></div><div><span>Duplicidades</span><b class="fav">' + r.dupl.length + '</b></div><div><span>Alvos com fundamento algorítmico</span><b class="fav">' + r.alvos.filter(a => /centralidade/i.test(a.fundamento || "")).length + "</b><small>de " + r.alvos.length + " alvo(s)</small></div></div>");
    h.push(secH("Falhas do relatório policial", r.achados.length + " apontamento(s)", "var(--out)"));
    h.push(r.achados.map(a => '<div class="ach ' + a.grav + '"><div class="hd">' + st(GRAV[a.grav][0], GRAV[a.grav][1]) + '<span class="tag">' + esc(a.cat) + "</span><b>" + esc(a.titulo) + "</b></div><p>" + esc(a.texto) + "</p></div>").join("") || '<div class="card empty">Nenhuma falha identificada.</div>');
    h.push(secH("Transações do relatório verificadas contra o RIF", "Cada linha da tabela de transações do relatório, com a página do PDF e a situação no relato bancário."));
    const sts = Object.keys(porSt);
    h.push('<div class="filterbar"><select id="fst" aria-label="Filtrar por situação"><option value="">Todas as situações</option>' + sts.map(s => '<option value="' + esc(s) + '"' + (S.fst === s ? " selected" : "") + ">" + esc(s) + " (" + porSt[s] + ")</option>").join("") + '</select><span class="tiny" id="npol"></span></div><div class="twrap" id="tpol"></div>');
    if (r.alvos.length) {
      h.push(secH("Alvos definidos pelo relatório", "Entradas atribuídas pelo relatório comparadas aos recursos próprios ou neutros identificados no RIF."));
      h.push('<div class="twrap"><table class="txt"><thead><tr><th>Nome</th><th>CPF/CNPJ</th><th>Com.</th><th class="num">Entradas (relatório)</th><th class="num">Próprios ou neutros (RIF)</th><th>Fundamento</th></tr></thead><tbody>' + r.alvos.map(a => { const T = S.ds.titulares.get(a.doc); const neu = T ? T.coms.reduce((s, c) => s + c.economia.vNeutro + c.economia.mesmaCred, 0) : null; return "<tr><td>" + esc(a.nome) + '</td><td class="mono">' + fmtDoc(a.doc) + "</td><td>" + a.coms.join(", ") + '</td><td class="num">' + brl(a.entradas) + '</td><td class="num">' + (neu == null ? "não é titular" : brl(neu)) + "</td><td>" + esc(a.fundamento) + (/centralidade/i.test(a.fundamento || "") ? " " + chip("algorítmico", "warn") : "") + "</td></tr>"; }).join("") + "</tbody></table></div>");
    }
    return h.join("");
  }
  function tabelaPol() {
    const l = S.cmp.verif.filter(v => !S.fst || v.status === S.fst);
    $("#npol").textContent = l.length + " transação(ões) · " + brl(l.reduce((s, v) => s + v.row.valor, 0));
    $("#tpol").innerHTML = '<table class="txt"><thead><tr><th>#</th><th>Pág.</th><th>Data</th><th>Origem (relatório)</th><th>Destino (relatório)</th><th class="num">Valor</th><th>Com.</th><th>Situação</th><th>Verificação</th></tr></thead><tbody>' +
      (l.length ? l.map(v => "<tr><td>" + v.row.n + "</td><td>" + v.row.pagina + '</td><td class="tiny">' + esc(v.row.data || "") + "</td><td>" + esc(v.row.origem.nome) + '<br><span class="tiny mono">' + esc(v.row.origem.docTxt) + "</span></td><td>" + esc(v.row.destino.nome) + '<br><span class="tiny mono">' + esc(v.row.destino.docTxt) + '</span></td><td class="num">' + brl(v.row.valor) + "</td><td>" + (v.row.com || "") + "</td><td>" + st(v.status, ST_POL[v.status] || "info") + '</td><td class="tiny" style="min-width:260px">' + v.achados.map(a => "<b>" + esc(a.titulo) + ".</b> " + esc(a.texto)).join("<br>") + "</td></tr>").join("") : '<tr><td colspan="9" class="empty">Nenhuma transação.</td></tr>') + "</tbody></table>";
  }
  function ligarPol() {
    const pi = $("#p-ins"); if (pi) pi.onclick = () => abrir(modalPol);
    if (!S.cmp) return;
    $("#p-rel").onclick = () => { S.tipoRel = "comparativo"; setView("rel"); };
    $("#fst").addEventListener("change", e => { S.fst = e.target.value; tabelaPol(); });
    tabelaPol();
  }

  /* ---------------- relatórios */
  function vRel() {
    const c = S.caso, h = [];
    if (S.tipoRel === "comparativo" && !S.cmp) S.tipoRel = "defesa";
    h.push('<div class="hero"><div><h1>Relatórios</h1><p>O relatório da defesa reúne a natureza do RIF, a integridade dos arquivos, a reconciliação dos valores, a análise por titular, as inconsistências, a legalidade e, se inserido, o confronto com o relatório policial, com síntese e pedido ao final de cada tópico.</p></div>' +
      '<div class="tools"><select id="tipo-rel" aria-label="Tipo de relatório"><option value="defesa"' + (S.tipoRel === "defesa" ? " selected" : "") + '>Relatório da defesa</option><option value="comparativo"' + (S.tipoRel === "comparativo" ? " selected" : "") + (S.cmp ? "" : " disabled") + ">Relatório comparativo" + (S.cmp ? "" : " (insira o relatório policial)") + '</option></select><button type="button" class="btn" id="r-cop">Copiar texto</button><button type="button" class="btn" id="r-doc">Baixar .doc</button><button type="button" class="btn pri" id="r-pdf">Imprimir ou salvar PDF</button></div></div>');
    h.push('<div class="card" style="margin-bottom:14px"><div class="form"><label>Autos<input type="text" id="c-autos" value="' + esc(c.autos || "") + '" placeholder="Nº do processo ou inquérito"></label><label>Assistido<input type="text" id="c-assistido" value="' + esc(c.assistido || "") + '"></label><label>Juízo ou órgão<input type="text" id="c-juizo" value="' + esc(c.juizo || "") + '"></label></div>' + (Object.keys(S.legal).length ? "" : '<p class="tiny" style="margin:8px 0 0">O tópico de legalidade usa as informações da aba Legalidade; enquanto não preenchidas, o relatório indica o que requerer.</p>') + "</div>");
    h.push('<div class="papel" id="papel"></div>');
    return h.join("");
  }
  function papel() { $("#papel").innerHTML = S.tipoRel === "comparativo" && S.cmp ? R.relatorioComparativo(S) : R.relatorioDefesa(S); }
  function ligarRel() {
    papel();
    $("#tipo-rel").onchange = e => { S.tipoRel = e.target.value; papel(); };
    for (const k of ["autos", "assistido", "juizo"]) $("#c-" + k).addEventListener("input", e => { S.caso[k] = e.target.value; clearTimeout(ligarRel._t); ligarRel._t = setTimeout(papel, 250); });
    const nome = () => (S.tipoRel === "comparativo" ? "relatorio-comparativo-rif" : "relatorio-defesa-rif") + (S.rif ? "-" + S.rif : "") + (S.caso.autos ? "-" + S.caso.autos.replace(/[^\w.-]+/g, "_") : "");
    $("#r-doc").onclick = () => R.exportarDoc($("#papel").innerHTML, nome());
    $("#r-pdf").onclick = () => { document.body.classList.add("imprimindo"); window.print(); setTimeout(() => document.body.classList.remove("imprimindo"), 500); };
    $("#r-cop").onclick = () => copiar($("#papel").innerText);
  }
  function copiar(txt) {
    const ok = () => window.HUB.toast("Texto copiado.");
    const fb = () => { const t = document.createElement("textarea"); t.value = txt; document.body.appendChild(t); t.select(); try { document.execCommand("copy"); ok(); } catch (e) { window.HUB.toast("Não foi possível copiar."); } t.remove(); };
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(txt).then(ok, fb); else fb();
  }

  /* ---------------- base jurídica */
  function vBase() {
    const POS = { base: ["Paradigma", "info"], favoravel: ["Favorável", "ok"], contraria: ["Contrária", "bad"], neutra: ["Processual", "warn"] };
    const h = [];
    h.push('<div class="hero"><div><h1>Base jurídica</h1><p>Precedentes, normas, reconhecimentos da NT CACOP 02/2026, doutrina e iniciativas legislativas utilizados pela ferramenta. As sínteses destinam-se à orientação; confira o inteiro teor antes de citar.</p></div></div>');
    h.push(secH("Precedentes"));
    h.push('<div class="grid">' + J.precedentes.map(p => '<div class="card"><div class="chips" style="margin-bottom:6px">' + st(POS[p.posicao][0], POS[p.posicao][1]) + '<span class="tag">' + esc(p.tribunal) + "</span></div><h3>" + esc(p.proc) + '</h3><p class="tiny" style="margin:0 0 6px">' + esc(p.orgao) + (p.rel ? " · " + esc(p.rel) : "") + (p.data ? " · " + esc(p.data) : "") + '</p><p style="margin:0 0 6px;font-size:13px">' + esc(p.tese) + '</p><p class="muted" style="margin:0;font-size:12.5px"><b>Uso:</b> ' + esc(p.uso) + "</p></div>").join("") + "</div>");
    h.push(secH("Normas"));
    h.push('<div class="twrap"><table class="txt"><tbody>' + J.normas.map(n => '<tr><td style="white-space:nowrap;font-weight:500">' + esc(n.rot) + "</td><td>" + esc(n.txt) + "</td></tr>").join("") + "</tbody></table></div>");
    h.push(secH("Reconhecimentos da NT CACOP 02/2026", "Admissões do próprio Ministério Público, utilizáveis em favor da defesa."));
    h.push(J.reconhecimentos.map(t => '<div class="ach fav"><p>' + esc(t) + "</p></div>").join(""));
    h.push(secH("Doutrina"));
    h.push(J.doutrina.map(d => '<div class="card" style="margin-bottom:8px"><h3>' + esc(d.autor) + '</h3><p style="margin:0">' + esc(d.ideia) + "</p></div>").join(""));
    h.push(secH("Iniciativas legislativas e controle concentrado"));
    h.push(J.legislativo.map(t => '<div class="ach informativa"><p>' + esc(t) + "</p></div>").join(""));
    return h.join("");
  }

  ctx();
  render();
})();
