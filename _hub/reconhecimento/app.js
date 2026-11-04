/* Interface da ferramenta de reconhecimento de pessoas. */
(function () {
  "use strict";
  const R = window.REC_REGRAS, esc = window.HUB.esc, DOC = window.HUB_DOC;
  const $ = s => document.querySelector(s);
  const SN = [["", "Não consta"], ["sim", "Sim"], ["nao", "Não"]];
  const D = s => (s ? new Date(s + "T00:00:00Z") : null);
  const br = d => (d ? d.toISOString().slice(0, 10).split("-").reverse().join("/") : "data não informada");
  let ultimo = null;

  $("#faseProc").innerHTML = Object.entries(R.FASE_PROC).map(([k, v]) => '<option value="' + k + '">' + esc(v) + "</option>").join("");

  /* ------------------------------------------------------------------ atos */
  const sel = (k, ops, v) => '<select data-k="' + k + '" aria-label="' + esc(k) + '">' + ops.map(([a, b]) => '<option value="' + a + '"' + ((v || "") === a ? " selected" : "") + ">" + esc(b) + "</option>").join("") + "</select>";
  function addAto(a) {
    a = a || { respostas: {}, estimadores: {} };
    const el = document.createElement("div"); el.className = "rec";
    el.innerHTML = '<div class="rec-cab"><h3>Ato de reconhecimento</h3><button type="button" class="x" title="Remover ato" aria-label="Remover ato">×</button></div>' +
      '<div class="grade g4"><label class="campo">Reconhecedor<input type="text" data-k="reconhecedor" value="' + esc(a.reconhecedor || "") + '" placeholder="Nome ou identificação"></label>' +
      '<label class="campo">Qualidade' + sel("qualidade", [["vitima", "Vítima"], ["testemunha", "Testemunha"], ["policial", "Policial"], ["outro", "Outro"]], a.qualidade) + "</label>" +
      '<label class="campo">Fase do ato' + sel("fase", Object.entries(R.FASES), a.fase) + "</label>" +
      '<label class="campo">Modalidade' + sel("modalidade", Object.entries(R.MODALIDADES), a.modalidade) + "</label>" +
      '<label class="campo">Data do fato<input type="date" data-k="dataFato" value="' + esc(a.dataFato || "") + '"></label>' +
      '<label class="campo">Data do reconhecimento<input type="date" data-k="dataRec" value="' + esc(a.dataRec || "") + '"></label>' +
      '<label class="campo">Pessoas ou fotos no alinhamento<input type="number" min="0" data-k="n" value="' + esc(a.n || "") + '" placeholder="Incluindo o suspeito"></label>' +
      '<label class="campo">Página ou ID nos autos<input type="text" data-k="ref" value="' + esc(a.ref || "") + '" placeholder="Ex.: fls. 23 ou ID 1234"></label></div>' +
      '<div class="sub">Procedimento</div>' + R.Q.map(q => '<div class="quesito"><span>' + esc(q.p) + '<span class="art">' + esc(q.art) + "</span></span>" + sel("q_" + q.id, q.ops || SN, a.respostas[q.id]) + "</div>").join("") +
      '<div class="sub">Condições de observação do fato</div>' + R.ESTIMADORES.map(e => '<div class="quesito"><span>' + esc(e.p) + "</span>" + sel("e_" + e.id, SN, a.estimadores[e.id]) + "</div>").join("") +
      '<div class="sub">Trecho do auto ou do depoimento</div><textarea data-k="texto" rows="4" placeholder="Cole aqui o auto de reconhecimento ou o trecho do depoimento sobre o ato">' + esc(a.texto || "") + '</textarea>' +
      '<div class="linha-btns" style="margin-top:8px"><button type="button" class="btn sec peq" data-pistas>Sugerir respostas a partir do texto</button></div><div class="pistas"></div>';
    el.querySelector(".x").onclick = () => { el.remove(); if (!$("#atos").children.length) addAto(); numerar(); };
    el.querySelector("[data-pistas]").onclick = () => sugerir(el);
    $("#atos").appendChild(el); numerar();
  }
  function numerar() { [...$("#atos").children].forEach((el, i) => { el.querySelector("h3").textContent = "Ato de reconhecimento " + (i + 1); }); }
  $("#addAto").onclick = () => addAto();

  function sugerir(el) {
    const txt = el.querySelector('[data-k="texto"]').value;
    const box = el.querySelector(".pistas");
    if (!txt.trim()) { box.innerHTML = '<p class="pequeno mudo">Cole o texto do auto ou do depoimento.</p>'; return; }
    const ps = R.pistas(txt);
    if (!ps.length) { box.innerHTML = '<p class="pequeno mudo">Nenhuma indicação encontrada. Responda os quesitos conforme o exame dos autos.</p>'; return; }
    box.innerHTML = ps.map((p, i) => '<div class="pista"><div><b>' + esc(p.rot) + "</b>" + (p.valor ? ' <span class="pequeno mudo">sugestão: ' + esc(p.campo === "modalidade" ? R.MODALIDADES[p.valor] : "responder “" + (p.valor === "sim" ? "Sim" : "Não") + "”") + "</span>" : "") + "<q>" + esc(p.trecho) + "</q></div>" + (p.valor ? '<button type="button" class="btn sec peq" data-i="' + i + '">Aplicar</button>' : "") + "</div>").join("");
    box.querySelectorAll("[data-i]").forEach(b => b.onclick = () => {
      const p = ps[+b.dataset.i];
      const alvo = el.querySelector('[data-k="' + (p.campo === "modalidade" ? "modalidade" : (R.Q.some(q => q.id === p.campo) ? "q_" : "e_") + p.campo) + '"]');
      if (alvo) { alvo.value = p.valor; b.textContent = "Aplicado"; b.disabled = true; }
    });
  }

  function coletar() {
    const v = { autos: $("#autos").value.trim(), assistido: $("#assistido").value.trim(), imputacao: $("#imputacao").value.trim(), faseProc: $("#faseProc").value, independente: $("#independente").value, independenteTxt: $("#independenteTxt").value.trim(), preso: $("#preso").checked };
    v.atos = [...$("#atos").children].map((el, i) => {
      const g = k => { const x = el.querySelector('[data-k="' + k + '"]'); return x ? x.value.trim() : ""; };
      const a = { i: i + 1, reconhecedor: g("reconhecedor") || "reconhecedor não identificado", qualidade: g("qualidade"), fase: g("fase"), modalidade: g("modalidade"), dataFato: D(g("dataFato")), dataRec: D(g("dataRec")), n: +g("n") || 0, ref: g("ref"), texto: g("texto"), respostas: {}, estimadores: {} };
      for (const q of R.Q) a.respostas[q.id] = g("q_" + q.id);
      for (const e of R.ESTIMADORES) a.estimadores[e.id] = g("e_" + e.id);
      return a;
    });
    return v;
  }

  /* ------------------------------------------------------------------ análise */
  const QUAL = { vitima: "vítima", testemunha: "testemunha", policial: "policial", outro: "reconhecedor" };
  const CONC = { invalido: ["Inválido", "ok", "invalido"], fragil: ["Frágil", "warn", "fragil"], indeterminado: ["Dados insuficientes", "info", ""], regular: ["Formalmente regular", "na", ""] };
  function analisar() {
    const v = coletar();
    const avs = v.atos.map(a => Object.assign({ a }, R.avaliar(a)));
    /* contaminação em cadeia: ato posterior do mesmo reconhecedor, depois de ato inválido ou sugestivo */
    for (const x of avs) {
      const antes = y => (y.a.dataRec && x.a.dataRec ? y.a.dataRec < x.a.dataRec : y.a.i < x.a.i);
      const ant = avs.find(y => y !== x && y.a.reconhecedor.toLowerCase() === x.a.reconhecedor.toLowerCase() && y.conclusao === "invalido" && !y.contaminadoPor && antes(y));
      if (ant) { x.contaminadoPor = ant; x.conclusao = "invalido"; }
    }
    ultimo = { v, avs };
    $("#resultado").innerHTML = '<h2 style="margin:10px 0 12px">Resultado</h2>' + avs.map(x => {
      const c = CONC[x.conclusao];
      return '<div class="card res ' + c[2] + '"><div class="linha-btns" style="margin-bottom:6px"><span class="tag ' + c[1] + '">' + c[0] + "</span><h3>Ato " + x.a.i + ": " + esc(x.a.reconhecedor) + "</h3></div>" +
        '<p class="pequeno mudo" style="margin:0">' + esc(QUAL[x.a.qualidade] || "") + " · " + esc(R.FASES[x.a.fase]) + " · " + esc(R.MODALIDADES[x.a.modalidade]) + " · " + br(x.a.dataRec) + (x.dias != null ? " · " + x.dias + " dias após o fato" : "") + (x.a.ref ? " · " + esc(x.a.ref) : "") + "</p>" +
        (x.contaminadoPor ? '<div class="risco">Ato contaminado: o mesmo reconhecedor participou antes do ato ' + x.contaminadoPor.a.i + ", inválido. A memória exibida neste ato deriva da exposição anterior, e a ratificação não convalida o vício.</div>" : "") +
        '<div class="tw"><table class="t"><thead><tr><th>Quesito</th><th>Resposta</th><th>Avaliação</th></tr></thead><tbody>' +
        x.itens.map(it => "<tr><td>" + esc(it.q.p) + '<br><span class="pequeno mudo">' + esc(it.q.art) + "</span></td><td>" + esc(((it.q.ops || SN).find(o => o[0] === it.v) || ["", "Não consta"])[1]) + "</td><td>" + (it.st === "conforme" ? '<span class="tag ok">Conforme</span>' : it.st === "vicio" ? '<span class="tag bad">Vício' + (it.essencial ? " essencial" : "") + "</span>" : '<span class="tag info">Requerer</span>') + "</td></tr>").join("") + "</tbody></table></div>" +
        (x.sugestivas ? '<div class="risco">' + esc(R.MODALIDADES[x.a.modalidade]) + ": procedimento sugestivo por natureza.</div>" : "") +
        (x.riscos.length ? '<div class="risco"><b>Fatores de risco à exatidão:</b> ' + esc(x.riscos.join("; ")) + ".</div>" : "") + "</div>";
    }).join("");
    $("#papel").innerHTML = relatorio(v, avs);
    $("#relatorioBox").hidden = false;
    $("#resultado").scrollIntoView({ behavior: "smooth", block: "start" });
  }
  $("#analisar").onclick = analisar;

  /* ------------------------------------------------------------------ relatório */
  const PEDIDOS = {
    inquerito: "que a autoridade policial se abstenha de utilizar o reconhecimento como elemento de autoria e, inexistindo prova independente, que o inquérito seja arquivado por ausência de justa causa",
    denuncia: "a rejeição da denúncia por ausência de justa causa (CPP, art. 395, III), uma vez que a autoria se apoia exclusivamente em reconhecimento inválido",
    instrucao: "o reconhecimento da invalidade do ato e a sua exclusão do acervo valorável, bem como que eventual reconhecimento em juízo observe integralmente o art. 226 do CPP, com descrição prévia, alinhamento justo e sem prévia exposição do acusado ao reconhecedor",
    pronuncia: "a impronúncia do acusado (CPP, art. 414), por ausência de indícios suficientes de autoria, já que o reconhecimento inválido não pode sustentar a submissão do acusado ao Júri",
    sentenca: "a absolvição do acusado, com fundamento no art. 386, incisos V e VII, do CPP, porque não há prova válida de que tenha concorrido para a infração penal",
    recurso: "o provimento do recurso para absolver o acusado (CPP, art. 386, V e VII), afastado o reconhecimento inválido que fundamentou a condenação",
    execucao: "a desconstituição da condenação pela via da revisão criminal (CPP, art. 621, I) ou do habeas corpus, porque fundada exclusivamente em reconhecimento inválido"
  };
  const lista = a => (a.length <= 1 ? a.join("") : a.slice(0, -1).join(", ") + " e " + a[a.length - 1]);
  function relatorio(v, avs) {
    const h = [], p = t => h.push("<p>" + t + "</p>"), q = (t, f) => h.push("<blockquote>" + esc(t) + (f ? " <i>(" + esc(f) + ")</i>" : "") + "</blockquote>");
    const prec = id => R.JUR.precedentes.find(x => x.id === id);
    const inval = avs.filter(x => x.conclusao === "invalido"), frag = avs.filter(x => x.conclusao === "fragil");
    h.push(DOC.cabecalho("Análise do reconhecimento de pessoas", [["Autos", v.autos], ["Assistido", v.assistido], ["Imputação", v.imputacao], ["Fase", R.FASE_PROC[v.faseProc]]]));
    h.push("<h3>1. Objeto</h3>");
    p("O presente relatório examina " + (avs.length === 1 ? "o ato de reconhecimento" : "os " + avs.length + " atos de reconhecimento") + " que vinculam " + esc(v.assistido || "o assistido") + " à autoria " + (v.imputacao ? "do crime de " + esc(v.imputacao) : "do fato imputado") + ", à luz do procedimento dos arts. 226 a 228 do Código de Processo Penal, das diretrizes da Resolução CNJ nº 484/2022 e da jurisprudência do Superior Tribunal de Justiça e do Supremo Tribunal Federal.");
    h.push("<h3>2. Parâmetro legal e jurisprudencial</h3>");
    p("O Código de Processo Penal disciplina o reconhecimento de pessoas nos seguintes termos:");
    q(R.JUR.art226, "Código de Processo Penal"); q(R.JUR.art228, "Código de Processo Penal");
    p("Por muito tempo, essas formalidades foram tratadas como meras recomendações. A orientação mudou a partir do julgamento do HC 598.886/SC pela Sexta Turma do Superior Tribunal de Justiça, que as qualificou como garantia mínima do suspeito:");
    q(prec("hc598886").tese, prec("hc598886").fonte);
    p("O Supremo Tribunal Federal acolheu o mesmo entendimento, e a Quinta Turma do STJ a ele aderiu:");
    q(prec("rhc206846").tese, prec("rhc206846").fonte);
    p("Em síntese, o procedimento do art. 226 é condição de validade do reconhecimento, e não mera recomendação. Requer-se que cada ato seja examinado à luz desse parâmetro, sem que a confirmação em juízo supra os vícios do ato original.");
    let k = 3;
    for (const x of avs) {
      const a = x.a;
      h.push("<h3>" + k++ + ". Ato " + a.i + ": reconhecimento por " + esc(a.reconhecedor) + "</h3>");
      p("O ato foi realizado " + (a.dataRec ? "em " + br(a.dataRec) + ", " : "") + "na fase de " + esc(R.FASES[a.fase].toLowerCase()) + ", pela " + esc(QUAL[a.qualidade] || "pessoa") + " " + esc(a.reconhecedor) + ", na modalidade de " + esc(R.MODALIDADES[a.modalidade].toLowerCase()) + (a.n ? ", com " + a.n + " pessoas ou fotos" : "") + (a.ref ? " (" + esc(a.ref) + ")" : "") + "." + (x.dias != null ? " Entre o fato e o reconhecimento transcorreram " + x.dias + " dias." : ""));
      for (const vi of x.vicios) p("<b>" + esc(vi.q.vicio) + ".</b> " + esc(vi.q.texto) + (vi.q.texto.includes(vi.q.art.replace(/^CPP, /, "")) || vi.q.texto.includes("Resolução CNJ 484") ? "" : " (" + esc(vi.q.art) + ")."));
      if (x.contaminadoPor) p("<b>Contaminação por ato anterior.</b> O mesmo reconhecedor participou do ato " + x.contaminadoPor.a.i + ", já inválido. A memória exibida neste ato é produto da exposição anterior ao suspeito, e não do fato, de modo que a sua aparente regularidade formal não afasta a derivação do vício.");
      if (x.fotografico && !x.vicios.length) p("<b>Reconhecimento fotográfico.</b> Ainda que observadas as formalidades, o reconhecimento por fotografia é etapa antecedente a eventual reconhecimento pessoal e não pode servir, por si, como prova em ação penal.");
      if (x.requerer.length) p("<b>Pontos não documentados.</b> Os autos não esclarecem se " + x.requerer.map(r => esc(r.q.p.replace(/\?$/, "").replace(/^[A-ZÁÉ]/, c => c.toLowerCase()))).join("; se ") + ". A ausência de documentação recai sobre a acusação, a quem incumbe demonstrar a regularidade do ato.");
      if (x.riscos.length) p("<b>Fatores de risco à exatidão.</b> As condições do fato apontam " + esc(x.riscos.join("; ")) + ". São variáveis de estimativa que, segundo a literatura científica sobre identificação de pessoas, reduzem a confiabilidade de qualquer reconhecimento, ainda que formalmente regular.");
      const sint = x.conclusao === "invalido" ? "o reconhecimento é inválido e não pode servir de lastro à imputação, ainda que confirmado em juízo. Requer-se que seja desconsiderado como elemento de autoria, com o seu desentranhamento, se for o caso" : x.conclusao === "fragil" ? "o reconhecimento apresenta vícios que comprometem a sua confiabilidade, e não pode, isoladamente, fundamentar juízo de autoria. Requer-se que seja valorado com extrema cautela e apenas se corroborado por prova independente" : x.conclusao === "indeterminado" ? "a regularidade do ato não está demonstrada nos autos. Requer-se a juntada do auto pormenorizado, da descrição prévia, das fotos ou do registro do alinhamento e da gravação, se houver, sob pena de o ato ser desconsiderado" : "o ato observou formalmente o procedimento legal, e a defesa deve concentrar-se nos fatores de risco e na eventual ausência de corroboração. Requer-se que a sua valoração considere as condições de observação do fato";
      p("Em síntese, " + sint + ".");
    }
    h.push("<h3>" + k++ + ". Prova independente de autoria</h3>");
    if (v.independente === "nao") p("Os autos não contêm prova de autoria independente do reconhecimento. Afastado o reconhecimento inválido, não resta elemento apto a vincular o assistido ao fato, e a manutenção da imputação equivaleria a fundar o juízo de autoria em ato que a própria jurisprudência declara imprestável.");
    else if (v.independente === "sim") p("Há, segundo os autos, elementos de autoria diversos do reconhecimento" + (v.independenteTxt ? ": " + esc(v.independenteTxt) : "") + ". A jurisprudência admite que o juiz se convença da autoria a partir de outras provas, desde que elas não guardem relação de causa e efeito com o ato viciado. A defesa deve, por isso, examinar se esses elementos foram obtidos a partir do reconhecimento, caso em que são derivados e igualmente imprestáveis, e se são, por si, suficientes para a autoria.");
    else p("Os autos não esclarecem se há prova de autoria independente do reconhecimento. A questão é decisiva: se a autoria depender apenas do reconhecimento inválido, a imputação carece de suporte probatório.");
    p("Em síntese, " + (v.independente === "sim" ? "a defesa deve demonstrar a derivação ou a insuficiência das demais provas. Requer-se que o juízo indique, de forma expressa, quais elementos independentes sustentariam a autoria" : "a autoria depende do reconhecimento. Requer-se que, reconhecida a sua invalidade, se extraiam as consequências processuais adiante indicadas") + ".");
    h.push("<h3>" + k++ + ". Requerimentos</h3>");
    const pedidos = [];
    if (inval.length || frag.length) pedidos.push("o reconhecimento da invalidade " + (inval.length ? (inval.length === 1 ? "do ato " : "dos atos ") + lista(inval.map(x => String(x.a.i))) : "") + (frag.length ? (inval.length ? " e a valoração restritiva dos atos " : "a valoração restritiva dos atos ") + lista(frag.map(x => String(x.a.i))) : "") + ", nos termos do art. 226 do CPP e da orientação firmada no HC 598.886/SC e no RHC 206.846/SP");
    if (avs.some(x => x.requerer.length)) pedidos.push("a juntada da documentação integral dos atos de reconhecimento, incluindo a descrição prévia, as fotos ou o registro do alinhamento, o auto pormenorizado e a gravação, se houver");
    if (v.independente !== "sim" && (inval.length || frag.length)) pedidos.push(PEDIDOS[v.faseProc]);
    else if (v.independente === "sim") pedidos.push("a exclusão das provas derivadas do reconhecimento inválido e a demonstração, pela acusação, da independência e da suficiência das demais");
    if (v.preso) pedidos.push("a revogação da prisão preventiva (CPP, art. 316), cujo fundamento de autoria repousa no reconhecimento inválido, ou a impetração de habeas corpus para esse fim");
    if (avs.some(x => x.a.fase === "inquerito") && !avs.some(x => x.a.fase !== "inquerito") && ["instrucao", "pronuncia"].includes(v.faseProc)) pedidos.push("que, se houver reconhecimento em juízo, o reconhecedor não seja exposto previamente ao acusado e que o ato observe o art. 226, consignando-se em ata que a exposição anterior contamina a memória");
    p(pedidos.length ? "Diante do exposto, requer-se: " + pedidos.map((x, i) => "(" + (i + 1) + ") " + x).join("; ") + "." : "Não foram identificados vícios que justifiquem requerimentos específicos.");
    h.push("<h3>" + k + ". Conclusão</h3>");
    p((inval.length ? "Dos " + avs.length + " atos examinados, " + inval.length + (inval.length === 1 ? " é inválido" : " são inválidos") + (frag.length ? " e " + frag.length + (frag.length === 1 ? " é frágil" : " são frágeis") : "") + ". " : frag.length ? frag.length + " dos atos examinados apresentam fragilidades. " : "Os atos examinados não apresentam vícios formais identificados. ") + "O reconhecimento de pessoas é prova sujeita a falhas de memória e a influências sugestivas, e o respeito ao procedimento legal é a única forma de reduzir o risco de condenação de inocentes. " + (inval.length && v.independente !== "sim" ? "Sem o reconhecimento, não há prova válida de autoria." : "A valoração de qualquer ato deve considerar os fatores de risco apontados."));
    h.push('<p class="pequeno mudo">Relatório gerado pela ferramenta de reconhecimento de pessoas do HUB Criminal TPC. As sínteses de precedentes destinam-se à orientação; confira o inteiro teor antes de peticionar.</p>');
    return h.join("\n");
  }
  const nomeArq = () => "reconhecimento" + (ultimo && ultimo.v.autos ? "-" + ultimo.v.autos.replace(/[^\w.-]+/g, "_") : "");
  $("#rDoc").onclick = () => DOC.exportar($("#papel").innerHTML, nomeArq());
  $("#rCopiar").onclick = () => DOC.copiar($("#papel").innerText);
  $("#rPdf").onclick = () => DOC.imprimir();

  /* ------------------------------------------------------------------ exemplo, limpeza e base */
  function limpar() {
    document.querySelectorAll("main input").forEach(i => { if (i.type === "checkbox") i.checked = false; else i.value = ""; });
    $("#independente").value = ""; $("#faseProc").value = "inquerito";
    $("#atos").innerHTML = ""; addAto();
    $("#resultado").innerHTML = ""; $("#relatorioBox").hidden = true; ultimo = null;
  }
  $("#limpar").onclick = limpar;
  $("#exemplo").onclick = () => {
    limpar();
    $("#autos").value = "0000000-00.2025.8.13.0000"; $("#assistido").value = "J. S."; $("#imputacao").value = "roubo majorado (CP, art. 157, § 2º, II)"; $("#faseProc").value = "sentenca"; $("#independente").value = "nao";
    $("#atos").innerHTML = "";
    addAto({ reconhecedor: "M. A.", qualidade: "vitima", fase: "inquerito", modalidade: "fotoUnica", dataFato: "2025-03-02", dataRec: "2025-04-15", respostas: { descricao: "nao", alinhamento: "nao", exposicao: "sim", advertencia: "nao", auto: "nao", separado: "na" }, estimadores: { breve: "sim", condicoes: "sim", arma: "sim", estresse: "sim", desconhecido: "sim" }, texto: "A vítima compareceu à delegacia, onde lhe foi mostrada pelo WhatsApp a foto do suspeito, tendo reconhecido o autor sem sombra de dúvida. O fato ocorreu à noite e o autor usava boné e portava arma de fogo." });
    addAto({ reconhecedor: "M. A.", qualidade: "vitima", fase: "juizo", modalidade: "pessoal", dataFato: "2025-03-02", dataRec: "2025-09-20", respostas: { descricao: "nao", alinhamento: "nao", exposicao: "sim", repeticao: "sim", separado: "na" }, estimadores: { breve: "sim", condicoes: "sim", arma: "sim", estresse: "sim", desconhecido: "sim" } });
    analisar();
  };
  const B = R.JUR;
  $("#base").innerHTML = "<p><b>CPP, art. 226.</b> " + esc(B.art226) + "</p><p><b>CPP, art. 228.</b> " + esc(B.art228) + "</p>" + B.precedentes.map(x => "<p><b>" + esc(x.fonte) + ".</b> " + esc(x.tese) + "</p>").join("") + B.doutrina.map(d => "<p><b>" + esc(d.autor) + ".</b> " + esc(d.ideia) + "</p>").join("") + '<p class="pequeno mudo">Sínteses para orientação; confira o inteiro teor antes de citar.</p>';
  addAto();
})();
