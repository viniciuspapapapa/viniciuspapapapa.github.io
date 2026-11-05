/* Interface da ferramenta de procurações. */
(function () {
  "use strict";
  const P = window.PROCURACAO, esc = window.HUB.esc;
  const $ = s => document.querySelector(s);
  let timer = null;

  /* máscaras */
  const dig = s => String(s || "").replace(/\D/g, "");
  const mCPF = v => { const d = dig(v).slice(0, 11); return d.replace(/^(\d{3})(\d)/, "$1.$2").replace(/^(\d{3})\.(\d{3})(\d)/, "$1.$2.$3").replace(/\.(\d{3})(\d{1,2})$/, ".$1-$2"); };
  const mCNPJ = v => { const d = dig(v).slice(0, 14); return d.replace(/^(\d{2})(\d)/, "$1.$2").replace(/^(\d{2})\.(\d{3})(\d)/, "$1.$2.$3").replace(/\.(\d{3})(\d)/, ".$1/$2").replace(/(\d{4})(\d{1,2})$/, "$1-$2"); };
  function mascarar(el) { el.querySelectorAll("[data-m]").forEach(i => i.addEventListener("input", () => { const p = i.selectionStart === i.value.length; i.value = i.dataset.m === "cpf" ? mCPF(i.value) : mCNPJ(i.value); if (p) i.selectionStart = i.selectionEnd = i.value.length; })); }
  const generoSel = (k, v) => '<select data-k="' + k + '"><option value="m"' + (v !== "f" ? " selected" : "") + '>Masculino</option><option value="f"' + (v === "f" ? " selected" : "") + ">Feminino</option></select>";

  /* ------------------------------------------------------------------ outorgantes */
  function addOutorgante(tipo) {
    const el = document.createElement("div"); el.className = "item"; el.dataset.tipo = tipo;
    el.innerHTML = tipo === "pj"
      ? '<div class="item-cab"><b>Pessoa jurídica</b><button type="button" class="x" aria-label="Remover outorgante">×</button></div><div class="grade g2"><label class="campo">Razão social<input type="text" data-k="razao"></label><label class="campo">CNPJ<input type="text" data-k="cnpj" data-m="cnpj" inputmode="numeric" placeholder="00.000.000/0000-00"></label><label class="campo">Sede (opcional)<input type="text" data-k="sede" placeholder="Rua..., nº..., Cidade/UF"></label><label class="campo">Representante legal<input type="text" data-k="repNome"></label><label class="campo">Gênero do representante' + generoSel("repG") + '</label><label class="campo">CPF do representante<input type="text" data-k="repCpf" data-m="cpf" inputmode="numeric" placeholder="000.000.000-00"></label><label class="campo">Cargo (opcional)<input type="text" data-k="cargo" placeholder="sócio administrador"></label><label class="campo">Nacionalidade (opcional)<input type="text" data-k="repNac" placeholder="brasileiro"></label></div>'
      : '<div class="item-cab"><b>Pessoa física</b><button type="button" class="x" aria-label="Remover outorgante">×</button></div><div class="grade g2"><label class="campo">Nome completo<input type="text" data-k="nome"></label><label class="campo">CPF<input type="text" data-k="cpf" data-m="cpf" inputmode="numeric" placeholder="000.000.000-00"></label><label class="campo">Gênero<span class="dica">para a concordância do texto</span>' + generoSel("g") + '</label><label class="campo">Nacionalidade (opcional)<input type="text" data-k="nac" placeholder="brasileiro(a)"></label></div><details style="margin-top:8px"><summary class="pequeno" style="cursor:pointer">Qualificação completa (opcional)</summary><div class="grade g2" style="margin-top:8px"><label class="campo">Estado civil<input type="text" data-k="estadoCivil" placeholder="solteira"></label><label class="campo">Profissão<input type="text" data-k="profissao" placeholder="empresária"></label><label class="campo">RG<input type="text" data-k="rg" placeholder="MG-0.000.000"></label><label class="campo">Endereço<input type="text" data-k="endereco" placeholder="Rua..., nº..., bairro, cidade/UF, CEP"></label></div></details>';
    el.querySelector(".x").onclick = () => { el.remove(); if (!$("#outorgantes").children.length) addOutorgante("pf"); agendar(); };
    mascarar(el); el.addEventListener("input", agendar); el.addEventListener("change", agendar);
    $("#outorgantes").appendChild(el);
  }
  $("#addPF").onclick = () => { addOutorgante("pf"); agendar(); };
  $("#addPJ").onclick = () => { addOutorgante("pj"); agendar(); };

  /* ------------------------------------------------------------------ advogados */
  $("#advs").innerHTML = P.ADVOGADOS.map(a => '<label class="check"><input type="checkbox" data-adv="' + a.id + '"' + (P.PADRAO.includes(a.id) ? " checked" : "") + "> " + esc(a.nome) + ' <span class="dica">OAB/' + a.uf + " " + a.oab + "</span></label>").join("");
  $("#advs").addEventListener("change", agendar);
  function addAdv() {
    const el = document.createElement("div"); el.className = "item";
    el.innerHTML = '<div class="item-cab"><b>Outro advogado</b><button type="button" class="x" aria-label="Remover advogado">×</button></div><div class="grade g4"><label class="campo">Nome completo<input type="text" data-k="nome"></label><label class="campo">UF da OAB<input type="text" data-k="uf" maxlength="2" value="MG"></label><label class="campo">Número da OAB<input type="text" data-k="oab" placeholder="000.000"></label><label class="campo">Gênero' + generoSel("g") + "</label></div>";
    el.querySelector(".x").onclick = () => { el.remove(); agendar(); };
    el.addEventListener("input", agendar); el.addEventListener("change", agendar);
    $("#outrosAdv").appendChild(el);
  }
  $("#addAdv").onclick = () => { addAdv(); agendar(); };

  /* ------------------------------------------------------------------ procedimentos */
  function addProc() {
    const el = document.createElement("div"); el.className = "item";
    el.innerHTML = '<div class="item-cab"><b>Procedimento</b><button type="button" class="x" aria-label="Remover procedimento">×</button></div><div class="grade g2"><label class="campo">Tipo<select data-k="tipo">' + P.PROCEDIMENTOS.map(([t]) => "<option>" + esc(t) + "</option>").join("") + '<option value="__outro">Outro…</option></select></label><label class="campo">Número<input type="text" data-k="numero" placeholder="0000000-00.0000.0.00.0000"></label><label class="campo" data-outro hidden>Tipo (outro)<input type="text" data-k="tipoOutro" placeholder="Ex.: Agravo em Execução"></label><label class="campo" data-outro hidden>Gênero do tipo<select data-k="gOutro"><option value="m">o (masculino)</option><option value="f">a (feminino)</option></select></label><label class="campo" style="grid-column:1/-1">Em trâmite perante<input type="text" data-k="orgao" placeholder="a 1ª Vara Criminal da Comarca de Belo Horizonte/MG"></label></div>';
    const tipo = el.querySelector('[data-k="tipo"]');
    tipo.onchange = () => { el.querySelectorAll("[data-outro]").forEach(x => { x.hidden = tipo.value !== "__outro"; }); agendar(); };
    el.querySelector(".x").onclick = () => { el.remove(); if (!$("#procs").children.length) addProc(); agendar(); };
    el.addEventListener("input", agendar);
    $("#procs").appendChild(el);
  }
  $("#addProc").onclick = () => { addProc(); agendar(); };

  /* ------------------------------------------------------------------ substabelecimento */
  $("#sDe").innerHTML = P.ADVOGADOS.map(a => '<option value="' + a.id + '"' + (a.id === "vinicius" ? " selected" : "") + ">" + esc(a.nome) + "</option>").join("") + '<option value="__outro">Outro advogado…</option>';
  $("#sPara").innerHTML = P.ADVOGADOS.map(a => '<label class="check"><input type="checkbox" data-sub-adv="' + a.id + '"> ' + esc(a.nome) + ' <span class="dica">OAB/' + a.uf + " " + a.oab + "</span></label>").join("");
  function addSubPara() {
    const el = document.createElement("div"); el.className = "item";
    el.innerHTML = '<div class="item-cab"><b>Advogado externo</b><button type="button" class="x" aria-label="Remover advogado">×</button></div><div class="grade g4"><label class="campo">Nome completo<input type="text" data-k="nome"></label><label class="campo">UF da OAB<input type="text" data-k="uf" maxlength="2" value="MG"></label><label class="campo">Número da OAB<input type="text" data-k="oab" placeholder="000.000"></label><label class="campo">Gênero' + generoSel("g") + "</label></div>";
    el.querySelector(".x").onclick = () => { el.remove(); agendar(); };
    el.addEventListener("input", agendar); el.addEventListener("change", agendar);
    $("#sParaOutros").appendChild(el);
  }
  $("#sAddPara").onclick = () => { addSubPara(); agendar(); };
  ["#sCliente", "#sDe", "#sReserva", "#sDeNome", "#sDeUf", "#sDeOab", "#sDeG", "#sPoderes", "#sPoderesTexto"].forEach(x => { $(x).addEventListener("input", agendar); $(x).addEventListener("change", agendar); });
  $("#sPara").addEventListener("change", agendar);
  const documento = () => document.querySelector('input[name="doc"]:checked').value;
  function dadosSubst() {
    const base = dados(), id = $("#sDe").value;
    const de = id === "__outro" ? { nome: $("#sDeNome").value.trim(), uf: $("#sDeUf").value.trim().toUpperCase(), oab: $("#sDeOab").value.trim(), g: $("#sDeG").value } : P.ADVOGADOS.find(a => a.id === id);
    const para = P.ADVOGADOS.filter(a => document.querySelector('[data-sub-adv="' + a.id + '"]').checked)
      .concat([...$("#sParaOutros").children].map(el => ({ nome: val(el, "nome"), uf: val(el, "uf").toUpperCase(), oab: val(el, "oab"), g: val(el, "g") })));
    return { substabelecente: de, substabelecidos: para, reserva: $("#sReserva").value, poderes: $("#sPoderes").value, poderesTexto: $("#sPoderesTexto").value.trim(), cliente: $("#sCliente").value.trim(), procedimentos: base.procedimentos, local: base.local, data: base.data };
  }
  function camposDocumento() {
    const sub = documento() === "substabelecimento";
    document.querySelectorAll("[data-proc]").forEach(x => { x.hidden = sub; });
    document.querySelectorAll("[data-sub]").forEach(x => { x.hidden = !sub; });
    $("#sDeOutro").hidden = $("#sDe").value !== "__outro";
    $("#sPoderesTxt").hidden = $("#sPoderes").value !== "especificos";
    $("#tituloFecho").textContent = sub ? "Local e data" : "Poderes e fecho";
    camposModalidade();
    if (sub) { $("#blocoFato").hidden = true; $("#tituloProc").textContent = "Processo ou procedimento (opcional)"; }
  }
  document.querySelectorAll('input[name="doc"]').forEach(r => r.addEventListener("change", () => { camposDocumento(); agendar(); }));
  ["#sDe", "#sPoderes"].forEach(x => $(x).addEventListener("change", camposDocumento));
  function atual() {
    if (documento() === "substabelecimento") { const d = dadosSubst(); return { spec: P.montarSubst(d), faltas: P.validarSubst(d), nome: "Substabelecimento - " + (d.cliente || "cliente") }; }
    const d = dados(), o = d.outorgantes[0] || {}, nome = (o.tipo === "pj" ? o.razao : o.nome) + (d.outorgantes.length > 1 ? " e outros" : "");
    return { spec: P.montar(d), faltas: P.validar(d), nome: "Procuração - " + nome };
  }

  /* ------------------------------------------------------------------ coleta e prévia */
  const val = (el, k) => { const x = el.querySelector('[data-k="' + k + '"]'); return x ? x.value.trim() : ""; };
  function modalidade() { return document.querySelector('input[name="mod"]:checked').value; }
  function dados() {
    const outorgantes = [...$("#outorgantes").children].map(el => el.dataset.tipo === "pj"
      ? { tipo: "pj", razao: val(el, "razao"), cnpj: val(el, "cnpj"), sede: val(el, "sede"), repNome: val(el, "repNome"), repG: val(el, "repG"), repCpf: val(el, "repCpf"), cargo: val(el, "cargo"), repNac: val(el, "repNac") }
      : { tipo: "pf", nome: val(el, "nome"), cpf: val(el, "cpf"), g: val(el, "g"), nac: val(el, "nac"), estadoCivil: val(el, "estadoCivil"), profissao: val(el, "profissao"), rg: val(el, "rg"), endereco: val(el, "endereco") });
    const advogados = P.ADVOGADOS.filter(a => document.querySelector('[data-adv="' + a.id + '"]').checked)
      .concat([...$("#outrosAdv").children].map(el => ({ nome: val(el, "nome"), uf: val(el, "uf").toUpperCase(), oab: val(el, "oab"), g: val(el, "g") })));
    const procedimentos = [...$("#procs").children].map(el => { const t = val(el, "tipo"); const outro = t === "__outro"; const g = outro ? val(el, "gOutro") : (P.PROCEDIMENTOS.find(p => p[0] === t) || [, "m"])[1]; return { tipo: outro ? val(el, "tipoOutro") : t, g, numero: val(el, "numero"), orgao: val(el, "orgao") }; });
    const d = $("#data").value ? new Date($("#data").value + "T00:00:00Z") : new Date();
    return { modalidade: modalidade(), outorgantes, advogados, procedimentos, especie: $("#especie").value, representado: $("#representado").value.trim(), querelado: $("#querelado").value.trim(), fato: $("#fato").value.trim(), tipificacao: $("#tipificacao").value.trim(), assistente: $("#assistente").checked, superiores: $("#superiores").checked, acordos: $("#acordos").checked, valores: $("#valores").checked, copiaClausulaCompleta: $("#copiaCompleta").checked, local: $("#local").value.trim(), data: d };
  }
  function camposModalidade() {
    const m = modalidade();
    $("#blocoFato").hidden = !(m === "representacao" || m === "queixa");
    $("#tituloFato").textContent = m === "queixa" ? "Querelado e fato (art. 44 do CPP)" : "Fato e poderes";
    $("#cEspecie").hidden = m !== "representacao"; $("#cRepresentado").hidden = m !== "representacao"; $("#cAssistente").hidden = m !== "representacao"; $("#cQuerelado").hidden = m !== "queixa";
    $("#tituloProc").textContent = m === "representacao" || m === "queixa" ? "Procedimento já instaurado (opcional)" : "Processo ou procedimento";
    $("#cSuperiores").hidden = m !== "defesa"; $("#cAcordos").hidden = m === "copia"; $("#cValores").hidden = m === "copia"; $("#cCopiaCompleta").hidden = m !== "copia";
  }
  document.querySelectorAll('input[name="mod"]').forEach(r => r.addEventListener("change", () => { camposModalidade(); agendar(); }));
  ["#especie", "#representado", "#querelado", "#fato", "#tipificacao", "#assistente", "#superiores", "#acordos", "#valores", "#copiaCompleta", "#local", "#data"].forEach(s => { $(s).addEventListener("input", agendar); $(s).addEventListener("change", agendar); });
  function agendar() { clearTimeout(timer); timer = setTimeout(previa, 250); }
  function previa() {
    const { spec, faltas } = atual();
    $("#faltas").innerHTML = faltas.length ? '<div class="falta">Para gerar, preencha: ' + esc(faltas.join("; ")) + ".</div>" : "";
    $("#folha").innerHTML = P.html(spec);
    $("#baixar").disabled = faltas.length > 0;
  }
  $("#baixar").onclick = async () => {
    const { spec, faltas, nome } = atual();
    if (faltas.length) { window.HUB.toast("Preencha: " + faltas[0] + "."); return; }
    try {
      const blob = await P.docx(spec, "modelo-procuracao.docx");
      const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = nome.replace(/[\\/:*?"<>|]+/g, "_") + ".docx"; document.body.appendChild(a); a.click();
      setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1500);
    } catch (e) { window.HUB.toast(e.message || "Não foi possível gerar o Word.", 5000); }
  };
  $("#copiar").onclick = () => window.HUB_DOC.copiar(P.texto(atual().spec));

  const hoje = new Date(); $("#data").value = new Date(Date.UTC(hoje.getFullYear(), hoje.getMonth(), hoje.getDate())).toISOString().slice(0, 10);
  addOutorgante("pf"); addProc(); camposDocumento(); previa();
})();
