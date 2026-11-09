/* Interface da ferramenta de audiência de custódia. */
(function () {
  "use strict";
  const M = window.CUST_MOTOR, K = window.EC_CATALOGO, P = window.TPC_PECA, esc = window.HUB.esc;
  const $ = s => document.querySelector(s);
  if (window.pdfjsLib) window.pdfjsLib.GlobalWorkerOptions.workerSrc = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
  let timer = null, peca = "req", EXTR = null;
  const agendar = () => { clearTimeout(timer); timer = setTimeout(atualizar, 250); };

  /* ------------------------------------------------------------------ campos */
  const SNC = [["sim", "Sim"], ["nao", "Não"], ["nc", "Não consta"]];
  const FLAGS = [
    ["comunicacao", "Comunicação imediata ao juiz e encaminhamento em 24h (art. 306)", SNC],
    ["notaCulpa", "Nota de culpa entregue (art. 306, § 2º)", SNC],
    ["familia", "Família ou pessoa indicada comunicada (art. 306)", SNC],
    ["silencio", "Advertência do direito ao silêncio (CF, art. 5º, LXIII)", SNC],
    ["defensor", "Assistência de advogado ou Defensoria no auto", SNC],
    ["ordem304", "Ordem do art. 304 observada (condutor, testemunhas, interrogatório)", SNC],
    ["testemunhas", "Testemunhas do fato ou duas da apresentação (art. 304, § 2º)", SNC],
    ["corpoDelito", "Exame de corpo de delito realizado", SNC],
    ["agressao", "Relato ou sinal de agressão", [["nao", "Não"], ["sim", "Sim"]]],
    ["algemas", "Uso de algemas sem justificativa escrita (SV 11)", [["nao", "Não"], ["sim", "Sim"], ["verificar", "Verificar"]]],
    ["domicilio", "Ingresso em domicílio", [["nao", "Não houve"], ["mandado", "Com mandado"], ["consentimento", "Com consentimento documentado"], ["fundadas", "Com fundadas razões justificadas"], ["sem", "Sem mandado e sem justificativa"]]],
    ["busca", "Busca pessoal", [["nao", "Não houve"], ["fundada", "Com fundada suspeita"], ["fragil", "Sem fundada suspeita (atitude suspeita, nervosismo)"], ["verificar", "Verificar"]]],
    ["reconhecimento", "Reconhecimento do autuado", [["nao", "Não houve"], ["regular", "Conforme o art. 226"], ["irregular", "Informal ou sem o art. 226"]]],
    ["confissaoInformal", "Confissão informal relatada por policiais", [["nao", "Não"], ["sim", "Sim"]]],
    ["filhos", "Informação sobre filhos no auto (art. 304, § 4º)", SNC],
    ["entrevista", "Entrevista prévia reservada assegurada (art. 310, § 9º)", [["sim", "Sim"], ["nao", "Não"], ["nc", "Ainda não realizada"]]],
    ["privacidade", "Privacidade do preso na videoconferência (§ 10)", [["sim", "Sim"], ["nao", "Não"], ["nc", "Ainda não realizada"]]],
    ["falha", "Falha de conexão atribuível ao tribunal (§ 11)", [["nao", "Não"], ["sim", "Sim"]]]
  ];
  $("#flags").innerHTML = FLAGS.map(([k, r, o]) => '<label class="campo" style="grid-column:span 2">' + esc(r) + '<span class="sug" data-sug="' + k + '"></span><select data-flag="' + k + '">' + o.map(([v, t]) => '<option value="' + v + '">' + t + "</option>").join("") + "</select></label>").join("");
  FLAGS.forEach(([k, , o]) => { if (o === SNC) document.querySelector('[data-flag="' + k + '"]').value = "nc"; });
  document.querySelector('[data-flag="agressao"]').value = "nao"; document.querySelector('[data-flag="falha"]').value = "nao"; document.querySelector('[data-flag="entrevista"]').value = "nc"; document.querySelector('[data-flag="privacidade"]').value = "nc";
  const PESSOAIS = [["primario", "Primário e de bons antecedentes"], ["reincidente", "Reincidente em crime doloso"], ["residencia", "Residência fixa comprovável"], ["trabalho", "Trabalho ou ocupação lícita"], ["familia", "Família constituída e dependentes"], ["gestante", "Gestante (art. 318, IV)"], ["maeFilho12", "Mãe de filho de até 12 anos (art. 318, V)"], ["unicoResponsavel", "Único responsável por filho de até 12 anos (art. 318, VI)"], ["dependente6", "Imprescindível aos cuidados de menor de 6 anos ou pessoa com deficiência (art. 318, III)"], ["doenteGrave", "Extremamente debilitado por doença grave (art. 318, II)"], ["maior80", "Maior de 80 anos (art. 318, I)"]];
  const RISCOS = [["vd", "Violência doméstica e familiar (art. 313, III)"], ["orcrimArmada", "Organização criminosa armada (art. 310, § 2º)"], ["orcrimUltra", "Organização criminosa ultraviolenta ou milícia (art. 313, V)"], ["milicia", "Milícia (art. 310, § 2º)"], ["armaRestrito", "Porte de arma de uso restrito (art. 310, § 2º)"], ["reiteracao", "Prova de prática reiterada (art. 310, § 5º, I)"], ["liberadoCustodia", "Liberado em custódia anterior (§ 5º, III)"], ["pendencia", "Inquérito ou ação penal em curso (§ 5º, IV)"], ["fuga", "Fuga ou perigo de fuga (§ 5º, V)"], ["contraFilho", "Crime contra filho ou dependente (art. 318-A, II)"]];
  $("#pessoais").innerHTML = PESSOAIS.map(([k, r]) => '<label class="check"><input type="checkbox" data-pes="' + k + '"> ' + esc(r) + ' <span class="sug" data-sug="' + k + '"></span></label>').join("");
  $("#riscos").innerHTML = RISCOS.map(([k, r]) => '<label class="check"><input type="checkbox" data-risco="' + k + '"> ' + esc(r) + ' <span class="sug" data-sug="' + k + '"></span></label>').join("");
  $("#cautelares").innerHTML = Object.entries(M.ROT319).map(([k, r]) => '<label class="check"><input type="checkbox" data-caut="' + k + '"> ' + esc(r.replace(/ \(inciso [IVX]+\)$/, "")) + " <span class=\"dica\">" + k + "</span></label>").join("");
  $("#advs").innerHTML = P.ADVOGADOS.map(a => '<label class="check"><input type="checkbox" data-adv="' + a.id + '"' + (a.id === "vinicius" ? " checked" : "") + "> " + esc(a.nome) + ' <span class="dica">OAB/' + a.uf + " " + a.oab + "</span></label>").join("");

  /* crimes */
  const rotCrime = c => c.nome + " (" + (c.d === "CP" ? "CP, art. " + c.a : "Lei " + c.d + ", art. " + c.a) + ")";
  $("#addCrimeSel").innerHTML = '<option value="">Escolha o tipo penal…</option>' + K.CRIMES.map((c, i) => '<option value="' + i + '">' + esc(rotCrime(c)) + "</option>").join("") + '<option value="outro">Outro (preencher)</option>';
  function addCrime(c) {
    c = c || { rot: "", max: "", min: "", violencia: false };
    const el = document.createElement("div"); el.className = "crime";
    el.innerHTML = '<label class="campo rot">Crime<input type="text" data-k="rot" placeholder="Ex.: furto qualificado (CP, art. 155, § 4º)"></label><label class="campo">Pena mínima (meses)<input type="number" min="0" data-k="min"></label><label class="campo">Pena máxima (meses)<input type="number" min="0" data-k="max"></label><label class="check" style="align-self:end"><input type="checkbox" data-k="violencia"> Violência</label><button type="button" class="x" aria-label="Remover crime">×</button>';
    el.querySelector('[data-k="rot"]').value = c.rot || ""; el.querySelector('[data-k="min"]').value = c.min != null ? c.min : ""; el.querySelector('[data-k="max"]').value = c.max != null ? c.max : ""; el.querySelector('[data-k="violencia"]').checked = !!c.violencia;
    el.dataset.d = c.d || ""; el.dataset.a = c.a || "";
    el.querySelector(".x").onclick = () => { el.remove(); agendar(); };
    $("#crimes").appendChild(el);
  }
  $("#addCrime").onclick = () => {
    const v = $("#addCrimeSel").value; if (!v) return;
    if (v === "outro") addCrime(); else { const c = K.CRIMES[+v]; addCrime({ rot: rotCrime(c), min: c.pena[0], max: c.pena[1], violencia: !!c.violencia, d: c.d, a: c.a }); }
    $("#addCrimeSel").value = ""; agendar();
  };

  /* ------------------------------------------------------------------ leitura do anexo */
  $("#anexo").addEventListener("change", async e => {
    const fs = [...e.target.files]; e.target.value = ""; if (!fs.length) return;
    if (!window.EC_LEITOR || !window.EC_ANALISE) { $("#leituraEstado").textContent = "O leitor de PDF não foi carregado. Recarregue a página."; return; }
    try {
      $("#leituraEstado").textContent = "Lendo o anexo…";
      const lt = await window.EC_LEITOR.ler(fs, { prog: (m, fr) => { $("#leituraEstado").textContent = m + (fr != null ? " (" + Math.round(fr * 100) + "%)" : ""); } });
      const pgs = window.EC_ANALISE.paginas(lt), itens = window.EC_ANALISE.pecas(pgs), crimes = window.EC_ANALISE.crimes(pgs, itens);
      EXTR = M.extrair(pgs, itens, crimes);
      aplicarExtracao(EXTR);
      $("#leituraEstado").textContent = pgs.length + (pgs.length === 1 ? " página lida" : " páginas lidas") + (pgs.some(p => p.ocr) ? ", com reconhecimento de texto nas digitalizadas" : "") + ". " + Object.keys(EXTR.prova).length + " elementos identificados; confira cada um com o auto.";
    } catch (x) { $("#leituraEstado").textContent = x.message || "Não foi possível ler o PDF."; }
    agendar();
  });
  function aplicarExtracao(x) {
    const s = x.sug, marca = (k, txt) => { const el = document.querySelector('[data-sug="' + k + '"]'); if (el) el.textContent = " sugerido pelo anexo" + (txt ? ": " + txt : ""); };
    if (s.prisao) { $("#pData").value = s.prisao.data; $("#pHora").value = s.prisao.hora; marca("prisao"); }
    if (s.comunicacao) { $("#cData").value = s.comunicacao.data; $("#cHora").value = s.comunicacao.hora || ""; marca("comunicacao"); }
    ["notaCulpa", "silencio", "defensor", "familia", "corpoDelito", "agressao", "algemas", "filhos", "domicilio", "busca", "reconhecimento", "confissaoInformal"].forEach(k => {
      if (s[k] == null) return; const sel = document.querySelector('[data-flag="' + k + '"]'); if (!sel) return;
      if ([...sel.options].some(o => o.value === s[k])) sel.value = s[k]; marca(k);
    });
    if (s.testemunhas) { const sel = document.querySelector('[data-flag="testemunhas"]'); sel.value = s.testemunhas.civis + s.testemunhas.policiais >= 2 ? "sim" : "nc"; marca("testemunhas", s.testemunhas.civis + " civil(is), " + s.testemunhas.policiais + " policial(is)"); }
    if (s.reincidente) { document.querySelector('[data-pes="reincidente"]').checked = true; marca("reincidente"); }
    if (s.primario) { document.querySelector('[data-pes="primario"]').checked = true; marca("primario"); }
    if (s.vd) { document.querySelector('[data-risco="vd"]').checked = true; marca("vd"); }
    if (s.armaRestrito) { document.querySelector('[data-risco="armaRestrito"]').checked = true; marca("armaRestrito"); }
    if (s.excludente) marca("excludente", "verifique a narrativa");
    if (x.crimes.length && !$("#crimes").children.length) x.crimes.forEach(c => addCrime(c));
    $("#provas").innerHTML = Object.values(x.prova).filter(Boolean).map(p => '<div class="prova"><b>' + esc(p.rot) + '</b> <span class="ref">' + esc(p.ref) + "</span><br>" + esc(p.trecho) + "</div>").join("") + (x.crimes.length ? '<div class="prova"><b>Imputação identificada</b><br>' + x.crimes.map(c => esc(c.rot) + ' <span class="ref">' + esc(c.ref) + "</span>").join("<br>") + "</div>" : "");
  }

  /* ------------------------------------------------------------------ coleta e análise */
  const dh = (d, h) => ({ data: $(d).value, hora: $(h).value });
  function dados() {
    const flags = {}; document.querySelectorAll("[data-flag]").forEach(s => { flags[s.dataset.flag] = s.value; });
    flags.lapso = $("#lapso").checked; flags.custodiaJustificada = $("#custodiaJust").checked;
    const pessoal = {}; document.querySelectorAll("[data-pes]").forEach(i => { pessoal[i.dataset.pes] = i.checked; });
    const risco = {}; document.querySelectorAll("[data-risco]").forEach(i => { risco[i.dataset.risco] = i.checked; });
    const crimes = [...$("#crimes").children].map(el => ({ rot: el.querySelector('[data-k="rot"]').value.trim(), min: +el.querySelector('[data-k="min"]').value || 0, max: +el.querySelector('[data-k="max"]').value || 0, violencia: el.querySelector('[data-k="violencia"]').checked, d: el.dataset.d, a: el.dataset.a })).filter(c => c.rot);
    return {
      nome: $("#nome").value.trim(), g: $("#g").value, autos: $("#autos").value.trim(), juizo: $("#juizo").value.trim(), juizG: $("#juizG").value, especie: $("#especie").value,
      prisao: dh("#pData", "#pHora"), comunicacao: dh("#cData", "#cHora"), custodia: dh("#aData", "#aHora"), crimes, flags, pessoal, risco,
      endereco: $("#endereco").value.trim(), ocupacao: $("#ocupacao").value.trim(), economia: $("#economia").value, excludente: $("#excludente").value, sintese: $("#sintese").value,
      cautelares: [...document.querySelectorAll("[data-caut]:checked")].map(i => i.dataset.caut), local: $("#local").value.trim(),
      advogados: P.ADVOGADOS.filter(a => document.querySelector('[data-adv="' + a.id + '"]').checked)
    };
  }
  let cautTocadas = false;
  $("#cautelares").addEventListener("change", () => { cautTocadas = true; });
  const ed = P.editor($("#folha"), { aviso: () => { $("#descartar").hidden = false; } });
  function atualizar() {
    const d = dados(), r = M.analisar(d);
    if (!cautTocadas) document.querySelectorAll("[data-caut]").forEach(i => { i.checked = r.cautelares.includes(i.dataset.caut); });
    const h = n => (n == null ? "" : (Math.round(n * 10) / 10).toString().replace(".", ",") + " h");
    const prazos = [];
    if (r.prazos.comunicacao != null) prazos.push("da prisão ao encaminhamento do auto: " + h(r.prazos.comunicacao) + (r.prazos.comunicacao > 24 ? " (acima de 24 h)" : ""));
    if (r.prazos.custodia != null) prazos.push("da prisão à audiência de custódia: " + h(r.prazos.custodia) + (r.prazos.custodia > 48 ? " (acima do prazo do art. 310, caput e § 4º)" : r.prazos.custodia > 24 ? " (acima de 24 h)" : ""));
    $("#analise").innerHTML = (prazos.length ? '<p class="pequeno">Prazos: ' + esc(prazos.join("; ")) + ".</p>" : "") +
      (r.relax.length ? "<h3 style=\"font-size:15px;margin:8px 0 4px\">Relaxamento da prisão</h3>" + r.relax.map(t => '<div class="tese relax">' + esc(t.t) + "<small>" + esc(t.f) + "</small></div>").join("") : '<p class="pequeno mudo">Nenhuma ilegalidade apontada nos campos de legalidade; a tese principal será a liberdade provisória.</p>') +
      "<h3 style=\"font-size:15px;margin:12px 0 4px\">Liberdade provisória</h3>" + r.liberdade.filter(t => !t.fraco).map(t => '<div class="tese lib">' + esc(t.t) + "<small>" + esc(t.f) + "</small></div>").join("") +
      (r.fianca ? '<div class="tese ' + (r.fianca.cabe ? "lib" : "alerta") + '">' + esc(r.fianca.cabe ? "Fiança cabível, na faixa " + r.fianca.faixa + (r.fianca.dispensa ? "; pedido de dispensa por hipossuficiência (art. 350)" : "") : r.fianca.t) + "</div>" : "") +
      (r.domiciliar ? '<div class="tese lib">Prisão domiciliar: ' + esc(r.domiciliar.hipoteses.join("; ")) + (r.domiciliar.obrigatoria ? " (substituição obrigatória, art. 318-A)" : "") + "</div>" : "") +
      r.alertas.map(a => '<div class="tese alerta">' + esc(a.t) + "</div>").join("");
    const f = [];
    if (!d.nome) f.push("o nome do autuado");
    if (!d.crimes.length) f.push("a imputação");
    if (!d.advogados.length) f.push("ao menos um advogado");
    $("#faltas").innerHTML = f.length ? '<div class="aviso">Para gerar, preencha: ' + esc(f.join("; ")) + ".</div>" : "";
    $("#baixar").disabled = peca === "req" && f.length > 0;
    ed.mostrar(peca === "req" ? M.requerimento(d, r) : M.roteiro(d, r));
  }
  document.addEventListener("input", e => { if (!e.target.closest("#folha")) agendar(); });
  document.addEventListener("change", e => { if (!e.target.closest("#folha") && e.target.id !== "anexo") agendar(); });

  /* ------------------------------------------------------------------ peças */
  document.querySelectorAll("[data-peca]").forEach(b => b.addEventListener("click", () => {
    if (ed.editado() && !confirm("Trocar de peça descarta as edições feitas no texto. Continuar?")) return;
    peca = b.dataset.peca; document.querySelectorAll("[data-peca]").forEach(x => x.setAttribute("aria-selected", String(x === b)));
    $("#pecaTit").textContent = peca === "req" ? "Requerimento" : "Roteiro oral";
    ed.descartar(); $("#editar").textContent = "Editar texto"; $("#descartar").hidden = true; atualizar();
  }));
  $("#editar").onclick = () => { const on = !ed.editando(); ed.editar(on); $("#editar").textContent = on ? "Concluir edição" : "Editar texto"; $("#descartar").hidden = !ed.editado(); };
  $("#descartar").onclick = () => { if (!confirm("Descartar as edições feitas no texto?")) return; ed.descartar(); $("#editar").textContent = "Editar texto"; $("#descartar").hidden = true; atualizar(); };
  $("#baixar").onclick = async () => { const n = $("#nome").value.trim() || "autuado"; try { P.baixar(await P.docx(ed.blocos()), (peca === "req" ? "Requerimento - audiência de custódia - " : "Roteiro - audiência de custódia - ") + n); } catch (x) { window.HUB.toast(x.message || "Não foi possível gerar o Word.", 5000); } };
  $("#copiar").onclick = () => window.HUB_DOC.copiar(P.texto(ed.blocos()));

  atualizar();
  window.CUST_ESTADO = { dados, M };
})();
