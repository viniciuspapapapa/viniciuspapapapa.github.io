/* Interface da central de certidões. */
(function () {
  "use strict";
  const C = window.CERT_CAT, L = window.CERT_LEITOR, P = window.TPC_PECA, esc = window.HUB.esc;
  const $ = s => document.querySelector(s);
  if (window.pdfjsLib) window.pdfjsLib.GlobalWorkerOptions.workerSrc = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
  const ler = (k, p) => { try { return JSON.parse(localStorage.getItem(k)) || p; } catch (e) { return p; } };
  const gravar = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* armazenamento indisponível */ } };
  const dig = s => String(s || "").replace(/\D/g, "");
  const br = d => { if (!d) return ""; const x = new Date(d); return String(x.getUTCDate()).padStart(2, "0") + "/" + String(x.getUTCMonth() + 1).padStart(2, "0") + "/" + x.getUTCFullYear(); };
  const fmtCNJ = n => (window.REL_TRAD ? window.REL_TRAD.fmtCNJ(n) : n);
  const CHAVE = "certidoes_pesquisas";
  const STATUS = [["pendente", "Pendente"], ["solicitada", "Solicitada"], ["aguardando", "Aguardando envio"], ["negativa", "Negativa"], ["positiva", "Positiva"], ["presencial", "Exige atendimento presencial"], ["na", "Não se aplica"]];
  const ROT = Object.fromEntries(STATUS);
  let P_ATUAL = null; /* { pesquisado, grupos, alcance, ufs, itens: { id: { status, obs, url, doc } }, atualizado } */

  /* ------------------------------------------------------------------ CPF */
  function cpfValido(c) {
    const d = dig(c); if (d.length !== 11 || /^(\d)\1+$/.test(d)) return false;
    const dv = n => { let s = 0; for (let i = 0; i < n; i++) s += +d[i] * (n + 1 - i); const r = (s * 10) % 11; return r === 10 ? 0 : r; };
    return dv(9) === +d[9] && dv(10) === +d[10];
  }
  $("#cpf").addEventListener("input", e => { const d = dig(e.target.value).slice(0, 11); e.target.value = d.replace(/^(\d{3})(\d)/, "$1.$2").replace(/^(\d{3})\.(\d{3})(\d)/, "$1.$2.$3").replace(/\.(\d{3})(\d{1,2})$/, ".$1-$2"); $("#cpfAviso").innerHTML = d.length === 11 && !cpfValido(d) ? '<div class="aviso">O CPF informado não confere com os dígitos verificadores.</div>' : ""; });

  /* ------------------------------------------------------------------ abrangência */
  $("#grupos").innerHTML = C.GRUPOS.map(([id, r]) => '<label class="check"><input type="checkbox" data-grupo="' + id + '" checked> ' + esc(r) + "</label>").join("");
  $("#ufs").innerHTML = Object.keys(C.UF_NOME).sort().map(uf => '<label title="' + esc(C.UF_NOME[uf]) + '"><input type="checkbox" data-uf="' + uf + '"' + (uf === "MG" ? " checked" : "") + "> " + uf + "</label>").join("");
  document.querySelectorAll('input[name="alc"]').forEach(r => r.addEventListener("change", () => { $("#ufs").style.opacity = alcance() === "brasil" ? ".45" : "1"; }));
  const alcance = () => document.querySelector('input[name="alc"]:checked').value;
  function selecao() {
    const grupos = [...document.querySelectorAll("[data-grupo]:checked")].map(i => i.dataset.grupo);
    const ufs = [...document.querySelectorAll("[data-uf]:checked")].map(i => i.dataset.uf);
    const br_ = alcance() === "brasil", regioes = new Set(ufs.map(u => C.TRF_DA_UF[u]));
    return C.ITENS.filter(it => {
      if (!grupos.includes(it.grupo)) return false;
      if (it.grupo === "estadual") return br_ || ufs.includes(it.uf);
      if (it.grupo === "federal") return br_ || regioes.has(it.regiao);
      if (it.grupo === "militar" && it.uf) return br_ || ufs.includes(it.uf);
      return true;
    });
  }
  const pesquisado = () => ({ nome: $("#nome").value.trim(), cpf: $("#cpf").value.trim(), nasc: $("#nasc").value, mae: $("#mae").value.trim(), pai: $("#pai").value.trim(), rg: $("#rg").value.trim(), rgOrgao: $("#rgOrgao").value.trim(), email: $("#email").value.trim(), finalidade: $("#finalidade").value });

  $("#montar").onclick = () => {
    const p = pesquisado();
    if (!p.nome || dig(p.cpf).length !== 11) { window.HUB.toast("Informe o nome completo e o CPF."); return; }
    const itens = selecao(); if (!itens.length) { window.HUB.toast("Selecione ao menos um grupo e um estado."); return; }
    const antigo = (ler(CHAVE, {})[dig(p.cpf)] || {}).itens || (P_ATUAL && dig(P_ATUAL.pesquisado.cpf) === dig(p.cpf) ? P_ATUAL.itens : {});
    P_ATUAL = { pesquisado: p, alcance: alcance(), grupos: [...document.querySelectorAll("[data-grupo]:checked")].map(i => i.dataset.grupo), ufs: [...document.querySelectorAll("[data-uf]:checked")].map(i => i.dataset.uf), itens: {}, atualizado: Date.now() };
    itens.forEach(it => { P_ATUAL.itens[it.id] = antigo[it.id] || { status: "pendente", obs: "" }; });
    salvar(); mostrar(); $("#painelBloco").scrollIntoView({ behavior: "smooth" });
  };
  ["#nome", "#cpf", "#nasc", "#mae", "#pai", "#rg", "#rgOrgao", "#email", "#finalidade"].forEach(s => $(s).addEventListener("change", () => { if (P_ATUAL && dig($("#cpf").value) === dig(P_ATUAL.pesquisado.cpf)) { P_ATUAL.pesquisado = pesquisado(); salvar(); colar(); relatorio(); } }));

  /* ------------------------------------------------------------------ persistência */
  function salvar() { if (!P_ATUAL) return; const t = ler(CHAVE, {}); P_ATUAL.atualizado = Date.now(); t[dig(P_ATUAL.pesquisado.cpf)] = P_ATUAL; gravar(CHAVE, t); listarSalvas(); }
  function listarSalvas() {
    const t = ler(CHAVE, {}), atual = P_ATUAL ? dig(P_ATUAL.pesquisado.cpf) : "";
    $("#salvas").innerHTML = '<option value="">Nova pesquisa</option>' + Object.entries(t).sort((a, b) => b[1].atualizado - a[1].atualizado).map(([k, v]) => '<option value="' + k + '"' + (k === atual ? " selected" : "") + ">" + esc(v.pesquisado.nome) + " · " + esc(v.pesquisado.cpf) + "</option>").join("");
  }
  $("#salvas").onchange = () => {
    const v = ler(CHAVE, {})[$("#salvas").value];
    if (!v) { P_ATUAL = null; ["#nome", "#cpf", "#nasc", "#mae", "#pai", "#rg", "#rgOrgao"].forEach(s => { $(s).value = ""; }); mostrar(); return; }
    P_ATUAL = v; const p = v.pesquisado;
    $("#nome").value = p.nome; $("#cpf").value = p.cpf; $("#nasc").value = p.nasc || ""; $("#mae").value = p.mae || ""; $("#pai").value = p.pai || ""; $("#rg").value = p.rg || ""; $("#rgOrgao").value = p.rgOrgao || ""; $("#email").value = p.email || ""; $("#finalidade").value = p.finalidade || "Defesa criminal";
    document.querySelectorAll("[data-grupo]").forEach(i => { i.checked = (v.grupos || []).includes(i.dataset.grupo); });
    document.querySelectorAll("[data-uf]").forEach(i => { i.checked = (v.ufs || []).includes(i.dataset.uf); });
    const r = document.querySelector('input[name="alc"][value="' + (v.alcance || "ufs") + '"]'); if (r) r.checked = true;
    mostrar();
  };
  $("#excluir").onclick = () => {
    const k = $("#salvas").value; if (!k) return;
    if (!confirm("Excluir a pesquisa salva deste CPF, com a situação de cada certidão?")) return;
    const t = ler(CHAVE, {}); delete t[k]; gravar(CHAVE, t); P_ATUAL = null; listarSalvas(); mostrar();
  };

  /* ------------------------------------------------------------------ dados para colar */
  function colar() {
    if (!P_ATUAL) { $("#colar").hidden = true; return; }
    const p = P_ATUAL.pesquisado, n = p.nasc ? p.nasc.split("-").reverse().join("/") : "";
    const campos = [["Nome", p.nome], ["CPF", p.cpf], ["CPF só números", dig(p.cpf)], ["Mãe", p.mae], ["Pai", p.pai], ["Nascimento", n], ["RG", p.rg], ["Órgão do RG", p.rgOrgao], ["E-mail", p.email]].filter(x => x[1]);
    $("#colarLinha").innerHTML = campos.map(([r, v]) => '<button type="button" data-v="' + esc(v) + '" title="Copiar ' + esc(r) + '"><b>' + esc(r) + "</b>" + esc(v) + "</button>").join("");
    $("#colar").hidden = false;
  }
  $("#colarLinha").addEventListener("click", e => {
    const b = e.target.closest("button[data-v]"); if (!b) return;
    const v = b.dataset.v, ok = () => { b.classList.add("ok"); setTimeout(() => b.classList.remove("ok"), 1200); window.HUB.toast("Copiado: " + v); };
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(v).then(ok, () => window.HUB_DOC.copiar(v)); else window.HUB_DOC.copiar(v);
  });

  /* ------------------------------------------------------------------ painel */
  const item = id => C.ITENS.find(i => i.id === id);
  function mostrar() {
    const vis = !!P_ATUAL;
    ["#painelBloco", "#importBloco", "#relBloco"].forEach(s => { $(s).hidden = !vis; });
    colar(); listarSalvas();
    if (!vis) return;
    const ids = Object.keys(P_ATUAL.itens);
    $("#painel").innerHTML = C.GRUPOS.map(([g, rot]) => {
      const lista = C.ITENS.filter(i => i.grupo === g && ids.includes(i.id)); if (!lista.length) return "";
      return '<h3 class="grupo-t">' + esc(rot) + "</h3>" + lista.map(it => {
        const e = P_ATUAL.itens[it.id], d = e.doc;
        return '<div class="org ' + e.status + '" data-id="' + it.id + '"><div class="nome"><b>' + esc(it.sigla) + "</b>" + esc(it.nome) + (it.st === "doc" ? ' <span class="tag warn" title="O servidor não respondeu ao teste automático; endereço indicado em documento oficial">confirmar endereço</span>' : it.st === "portal" ? ' <span class="tag info">via portal</span>' : "") + "</div>" +
          '<div class="acoes"><a class="btn peq" href="' + esc(e.url || it.url) + '" target="_blank" rel="noopener" data-abrir>Abrir</a><a class="btn sec peq" href="' + esc(it.portal) + '" target="_blank" rel="noopener">Portal</a><select data-status aria-label="Situação">' + STATUS.map(([v, r]) => '<option value="' + v + '"' + (v === e.status ? " selected" : "") + ">" + r + "</option>").join("") + "</select></div>" +
          (it.nota ? '<div class="nota">' + esc(it.nota) + "</div>" : "") +
          (d ? '<div class="doc">Certidão importada: <b>' + esc(d.arquivo) + "</b>, " + esc(ROT[d.resultado] || d.resultado) + (d.emissao ? ", emitida em " + br(d.emissao) : "") + (d.validade ? ", válida até " + br(d.validade) : "") + (d.cnjs && d.cnjs.length ? ". Processos: " + d.cnjs.map(fmtCNJ).join(", ") : "") + (d.confere === false ? ' <span class="tag warn">nome e CPF não localizados no texto</span>' : "") + "</div>" : "") +
          '<div class="nota"><input type="text" data-obs placeholder="Observação (protocolo do pedido, previsão de envio...)" value="' + esc(e.obs || "") + '" style="width:100%"></div></div>';
      }).join("");
    }).join("");
    progresso(); relatorio();
  }
  $("#painel").addEventListener("click", e => {
    const a = e.target.closest("[data-abrir]"); if (!a) return;
    const id = a.closest(".org").dataset.id, it = P_ATUAL.itens[id];
    if (it.status === "pendente") { it.status = "solicitada"; salvar(); setTimeout(mostrar, 50); }
  });
  $("#painel").addEventListener("change", e => {
    const org = e.target.closest(".org"); if (!org) return; const it = P_ATUAL.itens[org.dataset.id];
    if (e.target.matches("[data-status]")) { it.status = e.target.value; salvar(); mostrar(); }
    if (e.target.matches("[data-obs]")) { it.obs = e.target.value.trim(); salvar(); relatorio(); }
  });
  function progresso() {
    const v = Object.values(P_ATUAL.itens), total = v.filter(x => x.status !== "na").length, feitas = v.filter(x => ["negativa", "positiva"].includes(x.status)).length, pos = v.filter(x => x.status === "positiva").length;
    $("#progBarra").style.width = (total ? Math.round(feitas / total * 100) : 0) + "%";
    $("#progTxt").textContent = feitas + " de " + total + " certidões obtidas" + (pos ? "; " + pos + (pos === 1 ? " positiva" : " positivas") : "") + ".";
  }

  /* ------------------------------------------------------------------ importação dos PDFs */
  let DOCS = [];
  $("#pdfs").addEventListener("change", async e => {
    const fs = [...e.target.files]; e.target.value = ""; if (!fs.length || !P_ATUAL) return;
    if (!window.EC_LEITOR) { $("#importEstado").textContent = "O leitor de PDF não foi carregado. Recarregue a página."; return; }
    for (const [k, f] of fs.entries()) {
      $("#importEstado").textContent = "Lendo " + (k + 1) + " de " + fs.length + ": " + f.name + "…";
      try {
        const lt = await window.EC_LEITOR.ler([f], { prog: m => { $("#importEstado").textContent = f.name + ": " + m; } });
        const texto = lt.docs.map(d => d.paginas.map(p => p.texto).join("\n")).join("\n");
        const r = L.analisar(texto, P_ATUAL.pesquisado);
        const doc = { arquivo: f.name, resultado: r.resultado, emissao: r.emissao, validade: r.validade, cnjs: r.cnjs, confere: r.confere, orgao: r.orgao && P_ATUAL.itens[r.orgao] ? r.orgao : (r.orgao || "") };
        DOCS.push(doc); aplicar(doc);
      } catch (x) { DOCS.push({ arquivo: f.name, resultado: "erro", erro: x.message || "falha na leitura", orgao: "" }); }
    }
    $("#importEstado").textContent = fs.length + (fs.length === 1 ? " certidão lida." : " certidões lidas.") + " Confira o órgão e o resultado na tabela; corrija o que for preciso.";
    salvar(); tabelaDocs(); mostrar();
  });
  function aplicar(doc) {
    if (!doc.orgao) return;
    if (!P_ATUAL.itens[doc.orgao]) P_ATUAL.itens[doc.orgao] = { status: "pendente", obs: "" };
    const it = P_ATUAL.itens[doc.orgao];
    it.doc = { arquivo: doc.arquivo, resultado: doc.resultado, emissao: doc.emissao, validade: doc.validade, cnjs: doc.cnjs || [], confere: doc.confere };
    if (doc.resultado === "negativa" || doc.resultado === "positiva") it.status = doc.resultado;
  }
  function tabelaDocs() {
    $("#docsTw").hidden = !DOCS.length;
    $("#docs").innerHTML = DOCS.map((d, i) => "<tr><td>" + esc(d.arquivo) + (d.confere === false ? '<br><span class="tag warn">nome e CPF não localizados</span>' : "") + "</td>" +
      '<td><select data-doc-org="' + i + '"><option value="">Não identificado</option>' + C.ITENS.map(it => '<option value="' + it.id + '"' + (it.id === d.orgao ? " selected" : "") + ">" + esc(it.sigla) + "</option>").join("") + "</select></td>" +
      '<td><select data-doc-res="' + i + '">' + [["negativa", "Negativa"], ["positiva", "Positiva"], ["indeterminada", "Indeterminada"], ["erro", "Erro de leitura"]].map(([v, r]) => '<option value="' + v + '"' + (v === d.resultado ? " selected" : "") + ">" + r + "</option>").join("") + "</select></td>" +
      "<td>" + br(d.emissao) + "</td><td>" + br(d.validade) + "</td><td>" + (d.cnjs || []).map(fmtCNJ).join("<br>") + "</td></tr>").join("");
    const nums = DOCS.flatMap(d => d.cnjs || []);
    $("#levarBase").hidden = !nums.length || !window.REL_BASE;
  }
  $("#docs").addEventListener("change", e => {
    const io = e.target.dataset.docOrg, ir = e.target.dataset.docRes;
    if (io != null) { DOCS[+io].orgao = e.target.value; aplicar(DOCS[+io]); }
    if (ir != null) { DOCS[+ir].resultado = e.target.value; aplicar(DOCS[+ir]); }
    salvar(); mostrar();
  });
  $("#levarBase").onclick = async () => {
    const nums = [...new Set(DOCS.flatMap(d => d.cnjs || []).concat(Object.values(P_ATUAL.itens).flatMap(x => (x.doc && x.doc.cnjs) || [])))];
    if (!nums.length) return;
    const B = window.REL_BASE, base = await B.carregar();
    const r = B.mesclar(base, nums.map(n => ({ numero: n, cliente: P_ATUAL.pesquisado.nome, apelido: "Processo apontado em certidão", bruto: n })));
    await B.salvar(base);
    window.HUB.toast(r.novos + (r.novos === 1 ? " processo incluído" : " processos incluídos") + " na base do relatório processual" + (r.atualizados ? " (" + r.atualizados + " já existiam)" : "") + ".", 5000);
  };

  /* ------------------------------------------------------------------ relatório */
  $("#advs").innerHTML = P.ADVOGADOS.map(a => '<label class="check"><input type="checkbox" data-adv="' + a.id + '"' + (a.id === "vinicius" ? " checked" : "") + "> " + esc(a.nome) + ' <span class="dica">OAB/' + a.uf + " " + a.oab + "</span></label>").join("");
  $("#advs").addEventListener("change", relatorio); $("#local").addEventListener("input", relatorio);
  const ed = P.editor($("#folha"), { aviso: () => { $("#descartar").hidden = false; } });
  $("#editar").onclick = () => { const on = !ed.editando(); ed.editar(on); $("#editar").textContent = on ? "Concluir edição" : "Editar texto"; $("#descartar").hidden = !ed.editado(); };
  $("#descartar").onclick = () => { if (!confirm("Descartar as edições feitas no texto?")) return; ed.descartar(); $("#editar").textContent = "Editar texto"; $("#descartar").hidden = true; relatorio(); };
  const lista = a => (a.length <= 1 ? a.join("") : a.slice(0, -1).join(", ") + " e " + a[a.length - 1]);
  function blocos() {
    const p = P_ATUAL.pesquisado, its = Object.entries(P_ATUAL.itens).map(([id, e]) => ({ it: item(id), e })).filter(x => x.it && x.e.status !== "na");
    const neg = its.filter(x => x.e.status === "negativa"), pos = its.filter(x => x.e.status === "positiva"), pend = its.filter(x => !["negativa", "positiva"].includes(x.e.status));
    const hoje = P.dataExtenso(new Date());
    const b = [{ t: "tit", texto: "Relatório de certidões criminais" }];
    b.push({ t: "tab", larg: [1.3, 3], linhas: [["Pesquisado", p.nome], ["CPF", p.cpf], ["Filiação", [p.mae, p.pai].filter(Boolean).join(" e ") || "não informada"], ["Nascimento", p.nasc ? p.nasc.split("-").reverse().join("/") : "não informado"], ["Finalidade", p.finalidade], ["Data", hoje]] });
    b.push({ t: "h", texto: "I. Abrangência da pesquisa" });
    const NOMES = { estadual: "a Justiça Estadual", federal: "a Justiça Federal", militar: "a Justiça Militar", eleitoral: "a Justiça Eleitoral", superior: "o Supremo Tribunal Federal e o Superior Tribunal de Justiça", policia: "a Polícia Federal e o Banco Nacional de Mandados de Prisão" };
    const grupos = C.GRUPOS.filter(([g]) => its.some(x => x.it.grupo === g)).map(([g]) => NOMES[g]);
    b.push({ t: "p", r: "Foram pesquisados " + its.length + (its.length === 1 ? " órgão" : " órgãos") + ", abrangendo " + lista(grupos) + (P_ATUAL.alcance === "brasil" ? ", em todo o território nacional" : ", com relação " + (P_ATUAL.ufs.length === 1 ? "ao estado de " + C.UF_NOME[P_ATUAL.ufs[0]] : "aos estados de " + lista(P_ATUAL.ufs.map(u => C.UF_NOME[u])))) + ". As certidões foram obtidas nos serviços oficiais de cada órgão, a partir do nome completo e do CPF do pesquisado, complementados, quando exigido, pela filiação e pela data de nascimento." });
    b.push({ t: "p", r: "Em síntese, a pesquisa cobre os órgãos indicados no quadro do tópico seguinte, e sua conclusão deve ser lida dentro desse alcance, sem prejuízo de diligências complementares em outras unidades da Federação em que o pesquisado tenha residido ou atuado." });
    b.push({ t: "h", texto: "II. Resultado" });
    b.push({ t: "tab", cab: ["Órgão", "Resultado", "Emissão", "Validade", "Processos"], larg: [2.2, 1.3, 1, 1, 2.2], linhas: its.map(x => [x.it.sigla, ROT[x.e.status] + (x.e.obs ? " (" + x.e.obs + ")" : ""), x.e.doc ? br(x.e.doc.emissao) : "", x.e.doc ? br(x.e.doc.validade) : "", x.e.doc && x.e.doc.cnjs && x.e.doc.cnjs.length ? x.e.doc.cnjs.map(fmtCNJ).join("; ") : ""]) });
    b.push({ t: "p", r: "Do total, " + neg.length + (neg.length === 1 ? " certidão resultou negativa" : " certidões resultaram negativas") + ", " + pos.length + (pos.length === 1 ? " resultou positiva" : " resultaram positivas") + " e " + pend.length + (pend.length === 1 ? " permanece pendente ou depende de atendimento presencial." : " permanecem pendentes ou dependem de atendimento presencial.") });
    pos.forEach(x => { const n = (x.e.doc && x.e.doc.cnjs) || []; b.push({ t: "p", r: "A certidão " + (x.it.grupo === "policia" ? "da " : "do ") + x.it.sigla + " é positiva" + (n.length ? " e aponta " + (n.length === 1 ? "os autos nº " + fmtCNJ(n[0]) : "os autos nº " + lista(n.map(fmtCNJ))) : ", sem indicação legível do número dos autos") + "." }); });
    b.push({ t: "p", r: pos.length ? "Em síntese, há apontamentos que exigem a verificação individualizada de cada feito, na forma recomendada adiante." : pend.length ? "Em síntese, as certidões já obtidas não apontam registros, mas a conclusão depende da obtenção das certidões ainda pendentes." : "Em síntese, nenhuma das certidões obtidas aponta registro criminal em nome do pesquisado." });
    b.push({ t: "h", texto: "III. Conclusão" });
    if (pos.length) b.push({ t: "p", r: "Recomenda-se a obtenção de certidão de objeto e pé de cada processo apontado, a fim de verificar a fase, o desfecho e eventual trânsito em julgado. A mera existência de inquéritos e ações penais em curso não autoriza a valoração negativa dos antecedentes (Súmula 444 do STJ), de modo que apenas as condenações definitivas, observado o período depurador do art. 64, I, do Código Penal, repercutem na reincidência." });
    else b.push({ t: "p", r: "Os resultados obtidos demonstram a inexistência de registros criminais em nome do pesquisado nos órgãos consultados, o que permite a juntada das certidões para comprovar a primariedade e os bons antecedentes, circunstâncias relevantes para a dosimetria (CP, art. 59) e para a análise das medidas cautelares." });
    if (pend.length) b.push({ t: "p", r: "Permanecem pendentes as certidões " + lista(pend.map(x => (x.it.grupo === "policia" ? "da " : "do ") + x.it.sigla)) + ", cuja obtenção se recomenda antes da juntada, a fim de que a comprovação seja completa." });
    b.push({ t: "p", r: "É o relatório, que se submete à apreciação para as providências cabíveis." });
    b.push({ t: "data", texto: ($("#local").value.trim() || "Belo Horizonte/MG") + ", " + hoje + "." });
    P.ADVOGADOS.filter(a => document.querySelector('[data-adv="' + a.id + '"]').checked).forEach(a => b.push({ t: "ass", nome: a.nome, linhas: ["OAB/" + a.uf + " " + a.oab] }));
    return b;
  }
  function relatorio() { if (P_ATUAL) ed.mostrar(blocos()); }
  $("#baixar").onclick = async () => { try { P.baixar(await P.docx(ed.blocos()), "Relatório de certidões - " + P_ATUAL.pesquisado.nome); } catch (x) { window.HUB.toast(x.message || "Não foi possível gerar o Word.", 5000); } };
  $("#copiar").onclick = () => window.HUB_DOC.copiar(P.texto(ed.blocos()));

  listarSalvas();
  window.CERT_ESTADO = () => P_ATUAL;
})();
