/* Interface da calculadora de pena e de execução penal. */
(function () {
  "use strict";
  const M = window.EXEC_MOTOR, R = window.EXEC_REQ, T = window.TPC_PECA, esc = window.HUB.esc;
  const $ = s => document.querySelector(s);
  const num = id => +($(id).value || 0);
  const br = M.br;
  let tD = null, tE = null, ultimaExec = null;

  /* ------------------------------------------------------------------ abas */
  document.querySelectorAll("[data-aba]").forEach(b => b.addEventListener("click", () => abrirAba(b.dataset.aba)));
  function abrirAba(id) {
    document.querySelectorAll("[data-aba]").forEach(b => b.setAttribute("aria-selected", String(b.dataset.aba === id)));
    $("#aba-dosimetria").hidden = id !== "dosimetria"; $("#aba-execucao").hidden = id !== "execucao";
  }

  /* ------------------------------------------------------------------ dosimetria */
  const chk = (lista, pref) => lista.map(([id, r]) => '<label class="check"><input type="checkbox" data-' + pref + '="' + id + '"> ' + esc(r) + "</label>").join("");
  $("#dCirc").innerHTML = chk(M.CIRCUNSTANCIAS, "circ");
  $("#dAgrav").innerHTML = chk(M.AGRAVANTES, "agr");
  $("#dAten").innerHTML = chk(M.ATENUANTES, "ate");
  function addCausa(tipo, fr, desc) {
    const el = document.createElement("div"); el.className = "causa";
    el.innerHTML = '<label class="campo">Tipo<select data-k="tipo"><option value="aumento">Aumento</option><option value="diminuicao">Diminuição</option></select></label><label class="campo">Fração<input type="text" data-k="fracao" placeholder="1/3"></label><label class="campo desc">Fundamento<input type="text" data-k="desc" placeholder="Ex.: concurso de agentes (art. 157, § 2º, II)"></label><button type="button" class="x" aria-label="Remover causa">×</button>';
    if (tipo) el.querySelector('[data-k="tipo"]').value = tipo;
    if (fr) el.querySelector('[data-k="fracao"]').value = fr;
    if (desc) el.querySelector('[data-k="desc"]').value = desc;
    el.querySelector(".x").onclick = () => { el.remove(); agD(); };
    $("#dCausas").appendChild(el);
  }
  $("#dAddCausa").onclick = () => { addCausa(); agD(); };
  $("#aba-dosimetria").addEventListener("input", agD); $("#aba-dosimetria").addEventListener("change", agD);
  function agD() { clearTimeout(tD); tD = setTimeout(calcularD, 200); }
  const marcados = pref => [...document.querySelectorAll("[data-" + pref + "]:checked")].map(i => i.dataset[pref]);
  function entradaD() {
    return {
      crime: $("#dCrime").value.trim(),
      pmin: { a: num("#dMinA"), m: num("#dMinM"), d: num("#dMinD") }, pmax: { a: num("#dMaxA"), m: num("#dMaxM"), d: num("#dMaxD") },
      criterio: $("#dCriterio").value, desfavoraveis: marcados("circ"), agravantes: marcados("agr"), atenuantes: marcados("ate"),
      fracao2: $("#dFracao2").value, sumula231: $("#dSum231").checked,
      causas: [...$("#dCausas").children].map(el => ({ tipo: el.querySelector('[data-k="tipo"]').value, fracao: el.querySelector('[data-k="fracao"]').value, desc: el.querySelector('[data-k="desc"]').value.trim() })),
      especie: $("#dEspecie").value, violencia: $("#dViolencia").checked, culposo: $("#dCulposo").checked, hediondo: $("#dHediondo").checked,
      reincEspecifica: $("#dReincEsp").checked, maior70: $("#dMaior70").checked, detracaoDias: num("#dDetracao")
    };
  }
  let ultimaD = null;
  function calcularD() {
    const e = entradaD();
    if (!M.emDias(e.pmin) && !M.emDias(e.pmax)) { $("#dRes").innerHTML = ""; ultimaD = null; return; }
    const r = M.dosimetria(e); ultimaD = { e, r };
    if (r.erro) { $("#dRes").innerHTML = '<div class="falta">' + esc(r.erro) + "</div>"; return; }
    const reg = r.regime, sub = r.substituicao, su = r.sursis;
    $("#dRes").innerHTML = '<div class="card res"><h3>Pena definitiva: ' + esc(r.penaFmt) + "</h3>" +
      '<div class="kp"><div><span>Pena-base</span><b>' + esc(M.fmt(r.fases[0].pena)) + '</b></div><div><span>Intermediária</span><b>' + esc(M.fmt(r.fases[1].pena)) + '</b></div><div><span>Regime inicial</span><b>' + esc(reg.regime) + '</b></div><div><span>Substituição</span><b>' + (sub.cabe ? "Cabível" : "Incabível") + "</b></div></div>" +
      '<div class="tw"><table class="t"><thead><tr><th>Fase</th><th>Pena</th><th>Memória de cálculo</th></tr></thead><tbody>' + r.fases.map(f => "<tr><td>" + esc(f.rotulo) + "</td><td style=\"white-space:nowrap\">" + esc(M.fmt(f.pena)) + "</td><td>" + esc(f.memoria) + "</td></tr>").join("") + "</tbody></table></div>" +
      '<p><b>Regime inicial ' + esc(reg.regime) + ".</b> " + esc(reg.fundamento) + ".</p>" + reg.notas.map(n => '<div class="aviso">' + esc(n) + "</div>").join("") +
      "<p><b>Substituição por restritivas de direitos:</b> " + (sub.cabe ? "cabível, na forma de " + esc(sub.forma) + " (" + esc(sub.fundamento) + ")." : "incabível, por " + esc(sub.motivos.join("; ")) + ".") + "</p>" + sub.notas.map(n => '<div class="aviso">' + esc(n) + "</div>").join("") +
      "<p><b>Suspensão condicional da pena:</b> " + (su.cabe ? "cabível, com período de prova de " + esc(su.periodo) + "." : "incabível, por " + esc(su.motivos.join("; ")) + ".") + "</p>" +
      r.avisos.map(n => '<div class="aviso">' + esc(n) + "</div>").join("") +
      '<div class="linha-btns" style="margin-top:12px"><button type="button" class="btn sec peq" id="dCopiar">Copiar memória</button><button type="button" class="btn sec peq" id="dWord">Baixar memória em Word</button><button type="button" class="btn peq" id="dLevar">Levar a pena para a execução</button></div></div>';
    $("#dCopiar").onclick = () => window.HUB_DOC.copiar(T.texto(blocosDosimetria()));
    $("#dWord").onclick = async () => { try { T.baixar(await T.docx(blocosDosimetria()), "Dosimetria - " + (e.crime || "cálculo")); } catch (x) { window.HUB.toast(x.message, 5000); } };
    $("#dLevar").onclick = levarParaExecucao;
  }
  function blocosDosimetria() {
    const { e, r } = ultimaD, reg = r.regime, sub = r.substituicao, su = r.sursis;
    const b = [{ t: "tit", texto: "Memória de cálculo da pena" }];
    b.push({ t: "p", recuo: false, r: [["Crime: ", "bo"], [e.crime || "não informado", "n"], ["   Pena cominada: ", "bo"], [M.fmt(e.pmin) + " a " + M.fmt(e.pmax) + " de " + (e.especie === "detencao" ? "detenção" : "reclusão"), "n"]] });
    b.push({ t: "tab", cab: ["Fase", "Pena", "Memória de cálculo"], larg: [1.4, 1.1, 3.5], linhas: r.fases.map(f => [f.rotulo, M.fmt(f.pena), f.memoria]) });
    b.push({ t: "p", r: "A pena definitiva resulta em " + r.penaFmt + ", a ser cumprida inicialmente em regime " + reg.regime + " (" + reg.fundamento + "). " + reg.notas.join(" ") });
    b.push({ t: "p", r: "Quanto à substituição por penas restritivas de direitos, " + (sub.cabe ? "a medida é cabível, na forma de " + sub.forma + " (" + sub.fundamento + ")." : "a medida é incabível, por " + sub.motivos.join("; ") + ".") + " " + sub.notas.join(" ") });
    b.push({ t: "p", r: "Quanto à suspensão condicional da pena, " + (su.cabe ? "o benefício é cabível, com período de prova de " + su.periodo + "." : "o benefício é incabível, por " + su.motivos.join("; ") + ".") });
    if (r.avisos.length) b.push({ t: "p", r: r.avisos.join(" ") });
    b.push({ t: "data", texto: "Belo Horizonte/MG, " + T.dataExtenso(new Date()) + "." });
    return b;
  }
  function levarParaExecucao() {
    if (!ultimaD || ultimaD.r.erro) return;
    const { e, r } = ultimaD, p = M.deDias(r.pena);
    const nat = e.hediondo ? "hediondo" : e.violencia ? "violento" : "comum";
    const reinc = r.reincidente ? (e.hediondo && e.reincEspecifica ? "especifico" : "reincidente") : "primario";
    addCond({ desc: e.crime, pena: p, natureza: nat, reinc });
    if (!$("#eRegime").dataset.tocado) $("#eRegime").value = r.regime.regime;
    abrirAba("execucao"); agE(); window.HUB.toast("Pena levada para a execução.");
    $("#eConds").lastElementChild.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  /* ------------------------------------------------------------------ execução */
  function addCond(v) {
    v = v || {};
    const el = document.createElement("div"); el.className = "item";
    el.innerHTML = '<div class="item-cab"><b>Condenação</b><button type="button" class="x" aria-label="Remover condenação">×</button></div>' +
      '<div class="grade g4"><label class="campo" style="grid-column:span 2">Descrição<input type="text" data-k="desc" placeholder="Ex.: roubo majorado, autos nº ..."></label>' +
      '<div class="campo" style="grid-column:span 2">Pena<div class="pena"><input type="number" min="0" data-k="a" placeholder="anos" aria-label="Pena, anos"><input type="number" min="0" data-k="m" placeholder="meses" aria-label="Pena, meses"><input type="number" min="0" data-k="d" placeholder="dias" aria-label="Pena, dias"></div></div>' +
      '<label class="campo" style="grid-column:span 2">Natureza<select data-k="natureza">' + M.NATUREZAS.map(([id, r]) => '<option value="' + id + '">' + esc(r) + "</option>").join("") + "</select></label>" +
      '<label class="campo">Reincidência<select data-k="reinc"><option value="primario">Primário</option><option value="reincidente">Reincidente</option><option value="especifico">Reincidente específico em hediondo</option></select></label>' +
      '<label class="campo">Fração manual (opcional)<input type="text" data-k="fracaoManual" placeholder="Ex.: 2/5 ou 40%"></label></div>' +
      '<div class="dica" data-k="info" style="margin-top:6px"></div>';
    const set = (k, x) => { if (x != null && x !== "") el.querySelector('[data-k="' + k + '"]').value = x; };
    set("desc", v.desc); if (v.pena) { set("a", v.pena.a || ""); set("m", v.pena.m || ""); set("d", v.pena.d || ""); } set("natureza", v.natureza); set("reinc", v.reinc);
    el.querySelector(".x").onclick = () => { el.remove(); if (!$("#eConds").children.length) addCond(); agE(); };
    $("#eConds").appendChild(el);
  }
  function addDet() {
    const el = document.createElement("div"); el.className = "periodo";
    el.innerHTML = '<label class="campo">De<input type="date" data-k="ini"></label><label class="campo">Até<input type="date" data-k="fim"></label><button type="button" class="x" aria-label="Remover período">×</button>';
    el.querySelector(".x").onclick = () => { el.remove(); agE(); };
    $("#eDet").appendChild(el);
  }
  $("#eAddCond").onclick = () => { addCond(); agE(); };
  $("#eAddDet").onclick = () => { addDet(); agE(); };
  $("#eRegime").addEventListener("change", () => { $("#eRegime").dataset.tocado = "1"; });
  $("#aba-execucao").addEventListener("input", ev => { if (!ev.target.closest("#eReqBloco")) agE(); else agR(); });
  $("#aba-execucao").addEventListener("change", ev => { if (!ev.target.closest("#eReqBloco")) agE(); else agR(); });
  function agE() { clearTimeout(tE); tE = setTimeout(calcularE, 220); }
  const k = (el, x) => { const i = el.querySelector('[data-k="' + x + '"]'); return i ? i.value.trim() : ""; };
  function entradaE() {
    return {
      apenado: $("#eApenado").value.trim(), g: $("#eG").value, autos: $("#eAutos").value.trim(),
      inicio: $("#eInicio").value, regimeAtual: $("#eRegime").value, ultimaProgressao: $("#eUltProg").value, faltaGrave: $("#eFalta").value,
      interrupcao: num("#eInterrup"), dataRef: $("#eRef").value, bonsAntecedentes: $("#eBonsAnt").checked, maeResponsavel: $("#eMae").checked,
      condenacoes: [...$("#eConds").children].map(el => ({ desc: k(el, "desc"), pena: { a: +k(el, "a") || 0, m: +k(el, "m") || 0, d: +k(el, "d") || 0 }, natureza: k(el, "natureza"), reinc: k(el, "reinc"), fracaoManual: k(el, "fracaoManual") })),
      detracao: [...$("#eDet").children].map(el => ({ ini: k(el, "ini"), fim: k(el, "fim") })),
      remicao: { trabalho: num("#eTrab"), estudoHoras: num("#eEst"), conclusao: $("#eConc").checked, leitura: num("#eLeit"), outros: num("#eOutros"), perdidos: num("#ePerd"), posBase: num("#ePosBase") }
    };
  }
  function calcularE() {
    const e = entradaE();
    /* fração de cada condenação, ao lado do formulário */
    [...$("#eConds").children].forEach((el, i) => {
      const c = e.condenacoes[i], p = M.fracaoProgressao(c.natureza, c.reinc), lc = M.fracaoLivramento(c.natureza, c.reinc, e.bonsAntecedentes, p);
      el.querySelector('[data-k="info"]').textContent = "Progressão: " + M.fmtFracao(p.f) + " (art. 112, " + p.inciso + ", " + p.lei + "). Livramento: " + (lc.vedado ? "vedado" : "mais de " + M.fmtFracao(lc.f)) + ".";
    });
    if (!e.inicio || !e.condenacoes.some(c => M.emDias(c.pena))) { $("#eRes").innerHTML = '<div class="card bloco"><p class="mudo" style="margin:0">Informe o início do cumprimento e ao menos uma condenação para calcular.</p></div>'; $("#eReqBloco").hidden = true; ultimaExec = null; return; }
    const r = M.execucao(e); ultimaExec = { e, r };
    if (r.erro) { $("#eRes").innerHTML = '<div class="falta">' + esc(r.erro) + "</div>"; $("#eReqBloco").hidden = true; return; }
    const st = (d, ok) => '<span class="' + (ok ? "ok" : "pend") + '">' + (ok ? "Atingido" : "A atingir") + "</span>";
    const linhas = r.etapas.map(x => "<tr><td>Progressão ao regime " + x.para + "</td><td>" + esc(x.fracao) + " de " + x.saldo + " dias</td><td>" + x.exigido + " dias desde " + br(x.base) + "</td><td><b>" + br(x.data) + "</b></td><td>" + st(x.data, x.atingido) + "</td></tr>");
    const lc = r.livramento;
    linhas.push("<tr><td>Livramento condicional</td><td>" + (lc.vedado ? "Vedado" : "mais de " + esc(lc.fracao)) + "</td><td>" + (lc.vedado ? esc(lc.motivo) : lc.exigido + " dias desde " + br(M.D(e.inicio))) + "</td><td><b>" + (lc.vedado ? "—" : br(lc.data)) + "</b></td><td>" + (lc.vedado ? "" : st(lc.data, lc.atingido)) + "</td></tr>");
    linhas.push("<tr><td>Término da pena</td><td></td><td>" + Math.max(0, r.penaTotalDias - r.detracao.dias - r.remicao.total) + " dias a cumprir desde o início</td><td><b>" + br(r.termino) + "</b></td><td></td></tr>");
    $("#eRes").innerHTML = '<div class="card res"><h3>Cálculo de execução</h3>' +
      '<div class="kp"><div><span>Pena total</span><b>' + esc(r.penaTotalFmt) + "</b></div><div><span>Cumprido em " + br(r.dataRef) + "</span><b>" + r.cumpridoRef + " dias (" + r.percentual.toFixed(1).replace(".", ",") + "%)</b></div><div><span>Detração e remição</span><b>" + r.detracao.dias + " + " + r.remicao.total + " dias</b></div><div><span>Fração de progressão</span><b>" + esc(r.fracaoProgFmt) + "</b></div></div>" +
      '<div class="tw"><table class="t"><thead><tr><th>Benefício</th><th>Fração</th><th>Tempo exigido</th><th>Data</th><th>Situação</th></tr></thead><tbody>' + linhas.join("") + "</tbody></table></div>" +
      '<div class="tw"><table class="t"><thead><tr><th>Condenação</th><th>Pena</th><th>Progressão</th><th>Livramento</th></tr></thead><tbody>' + r.condenacoes.map(c => "<tr><td>" + esc(c.desc || "Condenação") + "<br><span class=\"dica\">" + esc(c.natureza) + "</span></td><td>" + esc(c.penaFmt) + "</td><td>" + esc(M.fmtFracao(c.prog.f)) + "<br><span class=\"dica\">art. 112, " + esc(c.prog.inciso) + " (" + esc(c.prog.lei) + ")</span></td><td>" + (c.lc.vedado ? "Vedado<br><span class=\"dica\">" + esc(c.lc.motivo) + "</span>" : "mais de " + esc(M.fmtFracao(c.lc.f)) + "<br><span class=\"dica\">" + esc(c.lc.fundamento) + "</span>") + "</td></tr>").join("") + "</tbody></table></div>" +
      '<p class="pequeno">Data-base da próxima progressão: <b>' + br(r.dataBase) + "</b> (" + esc(r.motivoBase) + "). Remição: " + r.remicao.trabalho + " dias por trabalho, " + r.remicao.estudo + " por estudo" + (r.remicao.conclusao ? " e " + r.remicao.conclusao + " pela conclusão do curso" : "") + (r.remicao.outros ? ", " + r.remicao.outros + " por leitura e outros" : "") + (r.remicao.perdidos ? ", menos " + r.remicao.perdidos + " revogados" : "") + "." + (lc.nota ? " " + esc(lc.nota) : "") + "</p>" +
      r.avisos.map(n => '<div class="aviso">' + esc(n) + "</div>").join("") +
      '<div class="linha-btns" style="margin-top:12px"><button type="button" class="btn sec peq" id="eCopiar">Copiar cálculo</button><button type="button" class="btn sec peq" id="eWord">Baixar cálculo em Word</button></div></div>';
    $("#eCopiar").onclick = () => window.HUB_DOC.copiar(T.texto(blocosCalculo()));
    $("#eWord").onclick = async () => { try { T.baixar(await T.docx(blocosCalculo()), "Cálculo de execução - " + (e.apenado || "apenado")); } catch (x) { window.HUB.toast(x.message, 5000); } };
    $("#eReqBloco").hidden = false;
    agR();
  }
  function blocosCalculo() {
    const { e, r } = ultimaExec, lc = r.livramento;
    const b = [{ t: "tit", texto: "Cálculo de execução penal" }];
    b.push({ t: "tab", linhas: [["Apenado", e.apenado || "não informado"], ["Autos", e.autos || "não informados"], ["Início do cumprimento", br(M.D(e.inicio))], ["Regime atual", e.regimeAtual], ["Pena total", r.penaTotalFmt + " (" + r.penaTotalDias + " dias)"], ["Detração", r.detracao.dias + " dias"], ["Remição", r.remicao.total + " dias"], ["Data de referência", br(r.dataRef)], ["Pena cumprida", r.cumpridoRef + " dias (" + r.percentual.toFixed(1).replace(".", ",") + "%)"]], larg: [1.3, 2.7] });
    b.push({ t: "tab", cab: ["Condenação", "Pena", "Progressão", "Livramento"], larg: [2, 1.4, 1.8, 1.8], linhas: r.condenacoes.map(c => [c.desc || "Condenação", c.penaFmt, M.fmtFracao(c.prog.f) + " (art. 112, " + c.prog.inciso + ")", c.lc.vedado ? "vedado" : "mais de " + M.fmtFracao(c.lc.f)]) });
    const l = r.etapas.map(x => ["Progressão ao regime " + x.para, x.fracao + " de " + x.saldo + " dias", br(x.data)]);
    l.push(["Livramento condicional", lc.vedado ? "vedado: " + lc.motivo : "mais de " + lc.fracao, lc.vedado ? "não se aplica" : br(lc.data)]);
    l.push(["Término da pena", "", br(r.termino)]);
    b.push({ t: "tab", cab: ["Benefício", "Requisito", "Data"], larg: [2, 2.4, 1.2], linhas: l });
    b.push({ t: "p", r: r.avisos.join(" ") });
    b.push({ t: "data", texto: "Belo Horizonte/MG, " + T.dataExtenso(new Date()) + "." });
    return b;
  }

  /* ------------------------------------------------------------------ requerimento */
  $("#rAdvs").innerHTML = T.ADVOGADOS.map(a => '<label class="check"><input type="checkbox" data-adv="' + a.id + '"' + (a.id === "vinicius" || a.id === "renato" ? " checked" : "") + "> " + esc(a.nome) + ' <span class="dica">OAB/' + a.uf + " " + a.oab + "</span></label>").join("");
  let tR = null;
  function agR() { clearTimeout(tR); tR = setTimeout(previaR, 200); }
  function dadosR() {
    const { e } = ultimaExec;
    return Object.assign({}, e, {
      juizo: $("#rJuizo").value, juizG: $("#rJuizG").value, exame: $("#rExame").value, reparacao: $("#rRepar").value, ocupacao: $("#rOcup").value,
      local: $("#rLocal").value, data: $("#rData").value, atestado: $("#rAtestado").checked, remicaoPendente: $("#rRemPend").checked, trabalho: $("#rTrab").checked,
      remicaoPosBase: e.remicao.posBase, advogados: T.ADVOGADOS.filter(a => document.querySelector('[data-adv="' + a.id + '"]').checked)
    });
  }
  function blocosR() {
    if (!ultimaExec) return { faltas: ["calcule a execução"] };
    const d = dadosR(), r = ultimaExec.r, tipo = $("#rTipo").value, faltas = [];
    if (!d.apenado) faltas.push("o nome do apenado");
    if (!d.autos) faltas.push("o número dos autos da execução");
    if (!d.advogados.length) faltas.push("ao menos um advogado");
    let blocos = null;
    if (tipo === "progressao") { blocos = R.progressao(d, r); if (!blocos) faltas.push("não há progressão a requerer (regime aberto ou término da pena)"); }
    else { blocos = R.livramento(d, r); if (!blocos) faltas.push("o livramento condicional é incabível: " + (r.livramento.motivo || "requisitos ausentes")); }
    const aviso = [];
    if (blocos && tipo === "progressao" && r.etapas[0] && !r.etapas[0].atingido) aviso.push("O requisito objetivo só será atingido em " + br(r.etapas[0].data) + "; o texto foi redigido no futuro.");
    if (blocos && tipo === "livramento" && !r.livramento.atingido) aviso.push("O requisito temporal do livramento só será atingido em " + br(r.livramento.data) + ".");
    return { blocos, faltas, aviso };
  }
  function previaR() {
    document.querySelectorAll("[data-lc]").forEach(x => { x.hidden = $("#rTipo").value !== "livramento"; });
    const { blocos, faltas, aviso } = blocosR();
    $("#rFaltas").innerHTML = (faltas.length ? '<div class="falta">Para gerar, preencha ou ajuste: ' + esc(faltas.join("; ")) + ".</div>" : "") + (aviso || []).map(a => '<div class="aviso">' + esc(a) + "</div>").join("");
    $("#rFolha").innerHTML = blocos ? T.html(blocos) : "";
    $("#rBaixar").disabled = !!faltas.length;
  }
  $("#rBaixar").onclick = async () => {
    const { blocos, faltas } = blocosR();
    if (faltas.length) { window.HUB.toast("Preencha: " + faltas[0] + "."); return; }
    try { T.baixar(await T.docx(blocos), ($("#rTipo").value === "progressao" ? "Requerimento de progressão - " : "Requerimento de livramento condicional - ") + $("#eApenado").value.trim()); }
    catch (x) { window.HUB.toast(x.message || "Não foi possível gerar o Word.", 5000); }
  };
  $("#rCopiar").onclick = () => { const { blocos } = blocosR(); if (blocos) window.HUB_DOC.copiar(T.texto(blocos)); };

  const h = new Date(), hoje = new Date(Date.UTC(h.getFullYear(), h.getMonth(), h.getDate())).toISOString().slice(0, 10);
  $("#rData").value = hoje;
  addCond(); addDet(); calcularE();
})();
