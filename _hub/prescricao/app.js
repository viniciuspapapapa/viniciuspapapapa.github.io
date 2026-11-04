/* Interface da ferramenta de prescrição penal. */
(function () {
  "use strict";
  const P = window.PRESC_MOTOR, esc = window.HUB.esc, DOC = window.HUB_DOC;
  const $ = s => document.querySelector(s);
  const { br, D } = P;
  let ultimo = null;

  /* ------------------------------------------------------------------ formulário dinâmico */
  const CAUSAS = [
    ["art366", "Citação por edital, réu ausente (CPP, art. 366)"],
    ["sursis", "Suspensão condicional do processo (Lei 9.099/1995, art. 89, § 6º)"],
    ["anpp", "Acordo de não persecução penal em cumprimento (CP, art. 116, IV)"],
    ["prejudicial", "Questão prejudicial (CP, art. 116, I)"],
    ["exterior", "Cumprimento de pena no exterior (CP, art. 116, II)"],
    ["inadmissivel", "Embargos ou recursos aos tribunais superiores inadmissíveis (CP, art. 116, III)"],
    ["preso", "Preso por outro motivo, só para a executória (CP, art. 116, parágrafo único)"],
    ["parlamentar", "Imunidade parlamentar, sustação do processo (CF, art. 53, § 5º)"],
    ["outra", "Outra causa legal"]
  ];
  const rotCausa = v => (CAUSAS.find(c => c[0] === v) || CAUSAS[CAUSAS.length - 1])[1];
  function penaInputs(pref, v) {
    v = v || {};
    return '<span class="pena"><input type="number" min="0" data-k="' + pref + 'A" placeholder="anos" aria-label="Anos" value="' + esc(v.a || "") + '"><input type="number" min="0" data-k="' + pref + 'M" placeholder="meses" aria-label="Meses" value="' + esc(v.m || "") + '"><input type="number" min="0" data-k="' + pref + 'D" placeholder="dias" aria-label="Dias" value="' + esc(v.d || "") + '"></span>';
  }
  function addCrime(c) {
    c = c || {};
    const el = document.createElement("div"); el.className = "crime";
    el.innerHTML = '<div class="crime-cab"><input type="text" data-k="nome" placeholder="Crime (ex.: furto qualificado, CP, art. 155, § 4º)" value="' + esc(c.nome || "") + '" aria-label="Crime"><button type="button" class="x" title="Remover crime" aria-label="Remover crime">×</button></div>' +
      '<div class="grade g4"><label class="campo">Pena máxima cominada' + penaInputs("max", c.penaMax) + '</label>' +
      '<label class="campo">Aumento máximo<input type="text" data-k="aumento" placeholder="ex.: 1/2" value="' + esc(c.aumento || "") + '"><span class="dica">Fração da causa de aumento</span></label>' +
      '<label class="campo">Diminuição mínima<input type="text" data-k="diminuicao" placeholder="ex.: 1/3" value="' + esc(c.diminuicao || "") + '"><span class="dica">Tentativa: 1/3</span></label>' +
      '<label class="campo">Pena aplicada' + penaInputs("apl", c.penaAplicada) + '<span class="dica">Sem acréscimo da continuidade</span></label></div>' +
      '<label class="check" style="margin-top:8px"><input type="checkbox" data-k="multaIsolada"' + (c.multaIsolada ? " checked" : "") + "> Pena de multa isolada (CP, art. 114, I)</label>";
    el.querySelector(".x").onclick = () => { el.remove(); if (!$("#crimes").children.length) addCrime(); };
    $("#crimes").appendChild(el);
  }
  function addSusp(s) {
    s = s || {};
    const el = document.createElement("div"); el.className = "linha-susp";
    el.innerHTML = '<label class="campo">Causa<select data-k="causa">' + CAUSAS.map(([v, t]) => '<option value="' + v + '"' + (s.causa === v ? " selected" : "") + ">" + esc(t) + "</option>").join("") + '</select></label><label class="campo">Início<input type="date" data-k="ini" value="' + esc(s.ini || "") + '"></label><label class="campo">Fim<input type="date" data-k="fim" value="' + esc(s.fim || "") + '"></label><button type="button" class="x" title="Remover" aria-label="Remover suspensão">×</button>';
    el.querySelector(".x").onclick = () => el.remove();
    $("#suspensoes").appendChild(el);
  }
  $("#addCrime").onclick = () => addCrime();
  $("#addSusp").onclick = () => addSusp();
  function termoUI() {
    const t = $("#tipoTermo").value;
    $("#campoConhecimento").hidden = t !== "conhecimento";
    $("#campoVitima").hidden = t !== "dignidade";
    $("#rotFato").textContent = t === "tentativa" ? "Cessação da atividade" : t === "permanente" ? "Cessação da permanência" : "Data do fato";
  }
  $("#tipoTermo").onchange = termoUI;

  const CAMPOS = ["autos", "assistido", "nascimento", "dataBase", "tipoTermo", "fato", "termoEspecial", "vitimaNascimento", "recebimento", "pronuncia", "confirmacaoPronuncia", "sentenca", "acordao1", "acordao2", "transitoAcusacao", "transitoFinal", "inicioCumprimento", "evasao"];
  function coletar() {
    const v = {}; for (const k of CAMPOS) v[k] = $("#" + k).value.trim();
    v.reincidente = $("#reincidente").checked; v.imprescritivel = $("#imprescritivel").checked; v.acusacaoSemRecurso = $("#acusacaoSemRecurso").checked;
    v.acordaos = [v.acordao1, v.acordao2].filter(Boolean);
    v.penaRestante = { a: $("#prA").value, m: $("#prM").value, d: $("#prD").value };
    v.suspensoes = [...$("#suspensoes").children].map(el => { const g = k => el.querySelector('[data-k="' + k + '"]').value; return { causa: g("causa"), ini: g("ini"), fim: g("fim"), art366: g("causa") === "art366" }; }).filter(s => s.ini).map(s => Object.assign(s, { causaTxt: rotCausa(s.causa) }));
    v.crimes = [...$("#crimes").children].map((el, i) => { const g = k => { const x = el.querySelector('[data-k="' + k + '"]'); return x.type === "checkbox" ? x.checked : x.value.trim(); }; return { nome: g("nome") || "Crime " + (i + 1), penaMax: { a: g("maxA"), m: g("maxM"), d: g("maxD") }, aumento: g("aumento"), diminuicao: g("diminuicao"), penaAplicada: { a: g("aplA"), m: g("aplM"), d: g("aplD") }, multaIsolada: g("multaIsolada") }; });
    return v;
  }

  /* ------------------------------------------------------------------ resultado */
  function tempo(a, b) {
    let y = b.getUTCFullYear() - a.getUTCFullYear(), m = b.getUTCMonth() - a.getUTCMonth(), d = b.getUTCDate() - a.getUTCDate();
    if (d < 0) { m--; d += new Date(Date.UTC(b.getUTCFullYear(), b.getUTCMonth(), 0)).getUTCDate(); }
    if (m < 0) { y--; m += 12; }
    const p = []; if (y) p.push(y + (y === 1 ? " ano" : " anos")); if (m) p.push(m + (m === 1 ? " mês" : " meses")); if (d) p.push(d + (d === 1 ? " dia" : " dias"));
    return p.length ? p.join(", ").replace(/, ([^,]*)$/, " e $1") : "menos de um dia";
  }
  const prazoTxt = meses => P.fmtPena(meses);
  function veredito(r) {
    const vig = r.modalidades.filter(m => !m.projecao);
    const pres = vig.filter(m => m.prescrita);
    if (r.imprescritivel) return { cls: "", tag: '<span class="tag na">Imprescritível</span>', txt: "Crime imprescritível." };
    if (pres.length) return { cls: "prescrita", tag: '<span class="tag ok">Prescrição consumada</span>', txt: pres.map(m => m.rotulo.toLowerCase().replace(/^prescrição/, "prescrição") + " em " + br(m.prescrita.fim)).join("; ") };
    const ab = r.modalidades.find(m => m.id === "abstrata");
    const aberto = r.modalidades.flatMap(m => m.trechos.filter(t => t.aberto && !m.projecao).map(t => ({ m, t }))).sort((a, b) => a.t.fim - b.t.fim)[0];
    return { cls: "viva", tag: '<span class="tag warn">Não prescrito</span>', txt: aberto ? "Se não sobrevier marco interruptivo, a " + aberto.m.rotulo.toLowerCase() + " consumar-se-á em " + br(mais1(aberto.t.fim)) + " (último dia do prazo: " + br(aberto.t.fim) + ")." : (ab ? "Nenhum intervalo superou o prazo." : "") };
  }
  const mais1 = d => new Date(d.getTime() + 864e5);
  function linhaTempo(r) {
    const pts = r.marcos.map(m => m.d);
    for (const m of r.modalidades) for (const t of m.trechos) { pts.push(t.fim, t.ate.d); }
    const ini = new Date(Math.min(...pts)), fim = new Date(Math.max(...pts));
    const W = 900, padL = 90, padR = 90, x = d => padL + (W - padL - padR) * ((d - ini) / Math.max(1, fim - ini));
    const mods = r.modalidades;
    const H = 70 + mods.length * 34;
    let s = '<svg viewBox="0 0 ' + W + " " + H + '" role="img" aria-label="Linha do tempo da prescrição">';
    s += '<line x1="' + padL + '" x2="' + (W - padR) + '" y1="40" y2="40" stroke="var(--line-2)" stroke-width="2"/>';
    const curto = rot => rot.replace(/^Termo inicial.*/, "Termo inicial").replace(/ \(.*$/, "").replace("Recebimento da denúncia ou queixa", "Recebimento").replace("Publicação da sentença condenatória", "Sentença").replace("Publicação de acórdão condenatório", "Acórdão").replace("Decisão confirmatória da pronúncia", "Confirmação");
    r.marcos.forEach((m, i) => { const xx = x(m.d); s += '<circle cx="' + xx + '" cy="40" r="5" fill="var(--brand)"/><text x="' + xx + '" y="' + (i % 2 ? 62 : 26) + '" font-size="11" text-anchor="middle" fill="var(--ink-2)">' + esc(curto(m.rot)) + " · " + br(m.d).slice(0, 10) + "</text>"; });
    mods.forEach((m, k) => {
      const y = 82 + k * 34;
      s += '<text x="' + 16 + '" y="' + (y - 6) + '" font-size="11" fill="var(--ink-3)">' + esc(m.rotulo) + (m.projecao ? " (projeção)" : "") + "</text>";
      for (const t of m.trechos) {
        const a = x(t.de.d), b = x(t.fim), c = x(t.ate.d);
        s += '<rect x="' + a + '" y="' + y + '" width="' + Math.max(1, b - a) + '" height="8" rx="3" fill="' + (t.prescreve ? "var(--ok)" : "var(--stone)") + '" opacity="' + (m.projecao ? 0.45 : 0.9) + '"><title>Prazo de ' + br(t.de.d) + " a " + br(t.fim) + "</title></rect>";
        s += '<line x1="' + c + '" x2="' + c + '" y1="' + (y - 3) + '" y2="' + (y + 11) + '" stroke="var(--ink)" stroke-width="1.5"/>';
      }
    });
    return s + "</svg>";
  }
  function htmlModalidade(m) {
    return '<div class="mod-h"><h4>' + esc(m.rotulo) + (m.projecao ? ' <span class="tag na">projeção</span>' : "") + '</h4><span class="pequeno mudo">' + esc(m.base.fundamento) + ": pena de " + esc(P.fmtPena(m.base.pena)) + ", prazo de " + esc(prazoTxt(m.meses)) + "</span></div>" +
      '<div class="tw"><table class="t"><thead><tr><th>De</th><th>Até</th><th>Tempo decorrido</th><th>Último dia do prazo</th><th>Situação</th></tr></thead><tbody>' +
      (m.trechos.length ? m.trechos.map(t => "<tr><td>" + esc(t.de.rot) + "<br><b>" + br(t.de.d) + "</b></td><td>" + esc(t.ate.rot) + "<br><b>" + br(t.ate.d) + "</b></td><td>" + tempo(t.de.d, t.ate.d) + (t.suspensos ? '<br><span class="dica">' + t.suspensos + " dia(s) suspenso(s)</span>" : "") + "</td><td>" + br(t.fim) + "</td><td>" + (t.prescreve ? '<span class="tag ok">' + (t.aberto ? "Prescrito" : "Prescrito antes do marco") + "</span>" : '<span class="tag na">' + (t.aberto ? "Em curso" : "Interrompido a tempo") + "</span>") + "</td></tr>").join("") : '<tr><td colspan="5" class="mudo">Sem intervalos a verificar com os marcos informados.</td></tr>') + "</tbody></table></div>";
  }
  function calcular() {
    const v = coletar();
    if (!v.fato && v.tipoTermo !== "conhecimento") { HUB.toast("Informe a data do fato."); $("#fato").focus(); return; }
    const res = v.crimes.map(c => P.calcular(v, c));
    const erro = res.find(r => r.erro); if (erro) { HUB.toast(erro.erro); return; }
    const semPena = v.crimes.filter(c => !c.multaIsolada && !P.emMeses(c.penaMax)); if (semPena.length) { HUB.toast("Informe a pena máxima de " + semPena[0].nome + "."); return; }
    ultimo = { v, res };
    $("#resultado").innerHTML = '<h2 style="margin:10px 0 12px">Resultado</h2>' + res.map(r => {
      const vd = veredito(r);
      const ab = r.modalidades[0];
      return '<div class="card res ' + vd.cls + '"><div class="veredito">' + vd.tag + "<h3>" + esc(r.crime.nome) + "</h3></div><p style=\"margin:0\">" + esc(vd.txt) + "</p>" +
        (r.imprescritivel ? "" : '<div class="kp"><div><span>Pena máxima considerada</span><b>' + esc(P.fmtPena(ab.base.pena)) + "</b></div><div><span>Prazo em abstrato</span><b>" + esc(prazoTxt(ab.meses)) + "</b></div><div><span>Termo inicial</span><b>" + br(r.termo) + "</b></div><div><span>Redução do art. 115</span><b>" + (r.reducao ? "Sim" : "Não") + "</b></div></div>" +
          (r.reducao ? '<p class="pequeno mudo" style="margin:0 0 6px">Prazos reduzidos de metade: agente ' + esc(r.rotRed) + ".</p>" : "") +
          '<div class="linha-tempo">' + linhaTempo(r) + "</div>" + r.modalidades.map(htmlModalidade).join("")) +
        r.avisos.map(a => '<div class="aviso">' + esc(a) + "</div>").join("") + "</div>";
    }).join("");
    $("#papel").innerHTML = relatorio(v, res);
    $("#relatorioBox").hidden = false;
    $("#resultado").scrollIntoView({ behavior: "smooth", block: "start" });
  }
  $("#calcular").onclick = calcular;

  /* ------------------------------------------------------------------ relatório */
  const minus = s => (/^[A-ZÀ-Ü]{2,}\b/.test(s) ? s : s.charAt(0).toLowerCase() + s.slice(1));
  const marcoCurto = rot => minus(rot.replace(/\s*\([^)]*\)\s*$/, "").replace(/^Termo inicial:\s*/, ""));
  function relatorio(v, res) {
    const h = [], p = t => h.push("<p>" + t + "</p>");
    h.push(DOC.cabecalho("Análise da prescrição penal", [["Autos", v.autos], ["Assistido", v.assistido], ["Data de referência", br(D(v.dataBase) || P.hoje())]]));
    h.push("<h3>1. Marcos considerados</h3>");
    const r0 = res.find(r => r.marcos && r.marcos.length) || res[0];
    if (r0 && r0.marcos) h.push("<table><tr><th>Marco</th><th>Data</th></tr>" + r0.marcos.map(m => "<tr><td>" + esc(m.rot) + "</td><td>" + br(m.d) + "</td></tr>").join("") + (v.transitoAcusacao ? "<tr><td>Trânsito em julgado para a acusação</td><td>" + br(D(v.transitoAcusacao)) + "</td></tr>" : "") + (v.transitoFinal ? "<tr><td>Trânsito em julgado para ambas as partes</td><td>" + br(D(v.transitoFinal)) + "</td></tr>" : "") + (v.inicioCumprimento ? "<tr><td>Início do cumprimento da pena</td><td>" + br(D(v.inicioCumprimento)) + "</td></tr>" : "") + "</table>");
    if (r0 && r0.suspensoes && r0.suspensoes.length) p("Foram consideradas as seguintes causas suspensivas: " + r0.suspensoes.map(s => esc(rotCausa((v.suspensoes.find(x => D(x.ini) && +D(x.ini) === +s.ini) || {}).causa)) + ", de " + br(s.ini) + " a " + (s.aberta && !s.limitada ? "data de referência" : br(s.fim)) + (s.limitada ? ", com o limite da Súmula 415 do STJ" : "")).join("; ") + ".");
    p("A contagem observa o art. 10 do Código Penal, que inclui o dia do começo e adota o calendário comum, de modo que o prazo se encerra no dia anterior à data correspondente do ano ou do mês de vencimento. Cada crime foi examinado isoladamente, na forma do art. 119 do Código Penal.");
    res.forEach((r, i) => {
      h.push("<h3>" + (i + 2) + ". " + esc(r.crime.nome) + "</h3>");
      if (r.imprescritivel) { p("O crime é imprescritível, nos termos do art. 5º, incisos XLII e XLIV, da Constituição Federal, razão pela qual não há prescrição a reconhecer."); return; }
      const ab = r.modalidades[0];
      p("O termo inicial do prazo é " + br(r.termo) + ", correspondente à " + esc(r.rotTermo) + ". A pena máxima considerada é de " + esc(P.fmtPena(ab.base.pena)) + (r.crime.aumento || r.crime.diminuicao ? ", já computadas a causa de aumento na fração máxima e a de diminuição na fração mínima" : "") + ", o que conduz ao prazo prescricional de " + esc(prazoTxt(ab.meses)) + " (" + esc(ab.base.fundamento) + ")" + (r.reducao ? ", reduzido de metade porque o agente era " + esc(r.rotRed) : "") + ".");
      for (const m of r.modalidades) {
        const pres = m.trechos.filter(t => t.prescreve);
        const desc = m.trechos.map(t => "entre " + br(t.de.d) + " e " + br(t.ate.d) + " decorreram " + tempo(t.de.d, t.ate.d) + (t.suspensos ? ", descontados " + t.suspensos + " dia(s) de suspensão" : "")).join("; ");
        if (!m.trechos.length) continue;
        p("<b>" + esc(m.rotulo) + ".</b> " + (m.id !== "abstrata" ? "Considerada a " + esc(m.base.rotPena || "pena aplicada") + " de " + esc(P.fmtPena(m.base.pena)) + ", o prazo é de " + esc(prazoTxt(m.meses)) + " (" + esc(m.base.fundamento) + "). " : "") + (m.projecao ? "Trata-se de projeção, porque ainda não consta o trânsito em julgado para a acusação nem a ausência ou o improvimento de recurso acusatório. " : "") + (m.antigos && m.id === "retroativa" ? "Como o fato é anterior à Lei 12.234/2010, admite-se a retroativa também entre o fato e o recebimento da denúncia. " : "") + "No período examinado, " + desc + ". " + (pres.length ? "O prazo esgotou-se em " + br(pres[0].fim) + (pres[0].aberto ? ", sem que sobreviesse causa interruptiva" : ", antes do marco seguinte (" + esc(marcoCurto(pres[0].ate.rot)) + ", em " + br(pres[0].ate.d) + ")") + ", de modo que se consumou a prescrição." : "Em nenhum intervalo o prazo foi superado."));
      }
      const vig = r.modalidades.filter(m => !m.projecao && m.prescrita).sort((a, b) => a.prescrita.fim - b.prescrita.fim);
      const proj = r.modalidades.filter(m => m.projecao && m.prescrita);
      for (const a of r.avisos) p(esc(a));
      if (vig.length) p("Em síntese, está consumada a " + esc(vig[0].rotulo.toLowerCase()) + " quanto ao crime de " + esc(minus(r.crime.nome)) + ", desde " + br(vig[0].prescrita.fim) + ". Requer-se, por isso, o reconhecimento da extinção da punibilidade, com fundamento no art. 107, inciso IV, do Código Penal, a ser declarada de ofício e em qualquer fase do processo, nos termos do art. 61 do Código de Processo Penal.");
      else if (proj.length) p("Em síntese, a prescrição pela pena aplicada estará configurada tão logo se verifique o trânsito em julgado para a acusação ou o improvimento de seu recurso, pois o prazo de " + esc(prazoTxt(proj[0].meses)) + " foi superado em " + br(proj[0].prescrita.fim) + ". Requer-se, verificada essa condição, a declaração da extinção da punibilidade (CP, art. 107, IV; CPP, art. 61).");
      else { const vd = veredito(r); p("Em síntese, não há prescrição consumada na data de referência. " + esc(vd.txt) + " Recomenda-se o acompanhamento do prazo, com a arguição imediata da extinção da punibilidade caso ele se esgote sem causa interruptiva, observada a vedação da prescrição em perspectiva (Súmula 438 do STJ)."); }
    });
    h.push('<p class="pequeno mudo">Relatório gerado pela ferramenta de prescrição do HUB Criminal TPC. Confira os marcos nos autos e o inteiro teor dos precedentes antes de peticionar.</p>');
    return h.join("\n");
  }
  const nomeArq = () => "prescricao" + (ultimo && ultimo.v.autos ? "-" + ultimo.v.autos.replace(/[^\w.-]+/g, "_") : "");
  $("#rDoc").onclick = () => DOC.exportar($("#papel").innerHTML, nomeArq());
  $("#rCopiar").onclick = () => DOC.copiar($("#papel").innerText);
  $("#rPdf").onclick = () => DOC.imprimir();

  /* ------------------------------------------------------------------ exemplo, limpeza e base */
  function limpar() {
    document.querySelectorAll("main input").forEach(i => { if (i.type === "checkbox") i.checked = false; else i.value = ""; });
    $("#tipoTermo").value = "consumacao"; termoUI();
    $("#crimes").innerHTML = ""; $("#suspensoes").innerHTML = ""; addCrime();
    $("#resultado").innerHTML = ""; $("#relatorioBox").hidden = true; ultimo = null;
    $("#dataBase").value = P.iso(P.hoje());
  }
  $("#limpar").onclick = limpar;
  $("#exemplo").onclick = () => {
    limpar();
    const set = (k, x) => { $("#" + k).value = x; };
    set("autos", "0000000-00.2016.8.13.0000"); set("nascimento", "1996-03-15"); set("fato", "2016-08-20"); set("recebimento", "2017-02-10");
    set("sentenca", "2021-06-14"); set("transitoAcusacao", "2021-07-05");
    $("#crimes").innerHTML = "";
    addCrime({ nome: "Furto qualificado (CP, art. 155, § 4º, I)", penaMax: { a: 8 }, penaAplicada: { a: 2 } });
    addCrime({ nome: "Receptação (CP, art. 180, caput)", penaMax: { a: 4 }, penaAplicada: { a: 1, m: 2 } });
    calcular();
  };
  const BASE = [
    ["CP, art. 109", "Prazos da prescrição antes do trânsito em julgado, regulados pelo máximo da pena privativa de liberdade cominada: 3 anos (pena inferior a 1 ano, redação da Lei 12.234/2010), 4, 8, 12, 16 e 20 anos."],
    ["CP, art. 110, caput e § 1º", "Depois da sentença condenatória com trânsito em julgado para a acusação, ou improvido o seu recurso, a prescrição regula-se pela pena aplicada e não pode ter por termo inicial data anterior à da denúncia ou queixa (Lei 12.234/2010, irretroativa). A reincidência aumenta de um terço o prazo da executória."],
    ["CP, art. 111", "Termo inicial: consumação; cessação da atividade, na tentativa; cessação da permanência; conhecimento do fato, na bigamia e na falsificação de registro civil; e, nos crimes contra a dignidade sexual ou que envolvam violência contra criança ou adolescente, a data em que a vítima completar 18 anos, salvo se já proposta a ação penal."],
    ["CP, art. 112", "Termo inicial da executória: trânsito em julgado da sentença condenatória (para a acusação, na redação legal, lida pelo STF no Tema 788 como trânsito para ambas as partes) e revogação da suspensão condicional da pena ou do livramento condicional; interrupção da execução, salvo quando o tempo deva ser computado na pena."],
    ["CP, arts. 113 a 115", "Evasão e revogação do livramento: prescrição pelo tempo que resta da pena. Multa: 2 anos quando for a única cominada ou aplicada. Redução de metade quando o agente era, ao tempo do crime, menor de 21 anos, ou, na data da sentença, maior de 70 anos."],
    ["CP, art. 116", "Causas impeditivas: questão prejudicial; cumprimento de pena no exterior; embargos de declaração ou recursos aos tribunais superiores, quando inadmissíveis; e o acordo de não persecução penal, enquanto não cumprido ou rescindido. Depois da condenação, a prescrição não corre enquanto o condenado está preso por outro motivo."],
    ["CP, art. 117", "Causas interruptivas: recebimento da denúncia ou queixa; pronúncia; decisão confirmatória da pronúncia; publicação da sentença ou acórdão condenatórios recorríveis; início ou continuação do cumprimento da pena; reincidência."],
    ["CP, art. 119", "No concurso de crimes, a extinção da punibilidade incide sobre a pena de cada um, isoladamente."],
    ["Súmula 146 do STF", "A prescrição da ação penal regula-se pela pena concretizada na sentença, quando não há recurso da acusação."],
    ["Súmula 497 do STF", "Quando se tratar de crime continuado, a prescrição regula-se pela pena imposta na sentença, não se computando o acréscimo decorrente da continuação."],
    ["Súmula 191 do STJ", "A pronúncia é causa interruptiva da prescrição, ainda que o Tribunal do Júri venha a desclassificar o crime."],
    ["Súmula 220 do STJ", "A reincidência não influi no prazo da prescrição da pretensão punitiva."],
    ["Súmula 415 do STJ", "O período de suspensão do prazo prescricional é regulado pelo máximo da pena cominada."],
    ["Súmula 438 do STJ", "É inadmissível a extinção da punibilidade pela prescrição da pretensão punitiva com fundamento em pena hipotética, independentemente da existência ou sorte do processo penal."],
    ["STF, Plenário, HC 176.473/RR", "O acórdão condenatório sempre interrompe a prescrição, inclusive quando confirmatório da sentença, seja mantendo, reduzindo ou aumentando a pena (síntese; conferir inteiro teor)."],
    ["STF, Plenário, ARE 848.107/DF (Tema 788)", "O prazo da prescrição executória tem como marco inicial o trânsito em julgado para ambas as partes, com modulação para os casos em que o trânsito para a acusação ocorreu após 12/11/2020 (síntese; conferir inteiro teor)."]
  ];
  $("#base").innerHTML = BASE.map(([k, t]) => "<p><b>" + esc(k) + ".</b> " + esc(t) + "</p>").join("");
  $("#dataBase").value = P.iso(P.hoje());
  addCrime(); termoUI();
})();
