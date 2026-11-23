/* Reforma tributária, aba "Consulta e cálculo": pesquisa de NCM/NBS, classificações aplicáveis com redução, tratamento
   e fundamentação legal, e cálculo de uma operação pela calculadora oficial, com memória de cálculo em Word. */
(function () {
  "use strict";
  const R = window.RTC, { $, esc } = R, P = window.TPC_PECA;
  let ultimo = null;

  /* ------------------------------------------------------------------ pesquisa */
  let tm = null;
  $("#cBusca").addEventListener("input", () => { clearTimeout(tm); tm = setTimeout(listar, 180); });
  function listar() {
    if (!R.D()) return;
    const q = $("#cBusca").value.trim(); $("#cDet").innerHTML = "";
    if (q.length < 2) { $("#cLista").innerHTML = ""; return; }
    const l = R.buscar(q, 80);
    $("#cLista").innerHTML = l.length ? l.map((x, i) => '<button type="button" data-i="' + i + '"><code>' + x.tipo + " " + esc(R.fmtCod(x.cod, x.tipo)) + "</code><span>" + esc(x.desc) + "</span></button>").join("") : '<p class="pequeno mudo">Nada encontrado. Tente outra palavra ou só os primeiros dígitos do código.</p>';
    $("#cLista").onclick = e => { const b = e.target.closest("button"); if (!b) return; $("#cLista").querySelectorAll("button").forEach(x => x.classList.toggle("ativo", x === b)); detalhe(l[+b.dataset.i]); };
    if (l.length === 1 || (l[0] && (R.dig(q) === l[0].cod))) { $("#cLista button").classList.add("ativo"); detalhe(l[0]); }
  }
  function blocoCc(c, data, extra) {
    const red = R.reducao(c, data), fund = R.fundamentos(c, data), tr = R.tratamento(c, data);
    const reds = [["CBS", red.CBS], ["IBS estadual", red.IBSUF], ["IBS municipal", red.IBSMun]].filter(x => x[1]);
    return '<div class="cc"><div class="cc-cab"><code>' + esc(c.c) + '</code><span class="selo">CST ' + esc(c.s) + "</span>" + (reds.length ? reds.map(x => '<span class="selo red">' + esc(x[0]) + " reduzida em " + R.pct(x[1], 0) + "</span>").join("") : "") + (tr ? '<span class="selo">' + esc(tr) + "</span>" : "") + (c.cr[0] || c.cr[1] ? '<span class="selo ok">gera crédito ao adquirente</span>' : "") + "</div>" +
      "<div>" + esc(c.d) + "</div>" + (extra || "") +
      (fund.length ? "<details><summary class=\"pequeno\">Fundamentação legal: " + esc(fund.map(f => f[0]).join("; ")) + '</summary><div class="fund">' + esc(fund.map(f => f[1]).join("\n\n")) + "</div></details>" : "") + "</div>";
  }
  function detalhe(x) {
    const data = R.hoje(), ap = R.aplicaveis(x.cod, data);
    let h = '<h3 style="font-size:17px;margin:14px 0 2px">' + x.tipo + " " + esc(R.fmtCod(x.cod, x.tipo)) + "</h3><p class=\"pequeno\" style=\"margin:0\">" + esc(x.desc) + "</p>";
    if ((x.tipo === "NCM" && x.cod.length < 8) || (x.tipo === "NBS" && x.cod.length < 9)) h += '<p class="pequeno mudo">Este código é um agrupamento; as classificações abaixo valem para os códigos completos que começam por ele.</p>';
    h += ap.itens.map(a => blocoCc(a.c, data, a.anexo ? '<p class="pequeno mudo" style="margin:4px 0 0">Anexo ' + esc(a.anexo[0]) + " da LC 214/2025, item " + esc(a.anexo[1]) + ": " + esc(a.anexo[2]) + "</p>" : a.geral ? '<p class="pequeno mudo" style="margin:4px 0 0">Regra geral, quando a operação não se enquadra em tratamento diferenciado.</p>' : "")).join("");
    h += '<div class="linha-btns" style="margin-top:8px"><button type="button" class="btn sec" id="cUsar">Usar no cálculo abaixo</button></div>';
    $("#cDet").innerHTML = h;
    $("#cUsar").onclick = () => { adicionarItem({ cod: x.cod, cc: ap.itens[0] && ap.itens[0].cod }); $("#cItens").scrollIntoView({ behavior: "smooth", block: "center" }); };
  }

  /* ------------------------------------------------------------------ cálculo de uma operação */
  function opcoesCc(cod, atual) {
    const ap = R.dig(cod).length >= 8 ? R.aplicaveis(cod) : { itens: [] }, vis = new Set(ap.itens.map(a => a.cod));
    let o = ap.itens.map(a => '<option value="' + a.cod + '"' + (a.cod === atual ? " selected" : "") + ">" + a.cod + " · " + esc(a.c.d.slice(0, 70)) + "</option>").join("");
    if (atual && !vis.has(atual)) { const c = R.cc(atual); o += '<option value="' + esc(atual) + '" selected>' + esc(atual) + (c ? " · " + esc(c.d.slice(0, 70)) : "") + "</option>"; }
    return o + '<option value="__outro">Outra classificação…</option>';
  }
  function adicionarItem(v) {
    v = v || {}; const tb = $("#cItens tbody"), tr = document.createElement("tr"), n = tb.rows.length + 1;
    tr.innerHTML = "<td>" + n + '</td><td><input type="text" class="ccod" value="' + esc(v.cod ? R.fmtCod(v.cod, v.cod.length === 9 ? "NBS" : "NCM") : "") + '" placeholder="NCM ou NBS" style="width:130px"></td><td><select class="ccc" style="min-width:220px">' + opcoesCc(v.cod || "", v.cc) + '</select></td><td class="n"><input type="text" class="cbase" inputmode="decimal" value="' + esc(v.base || "1.000,00") + '" style="width:120px;text-align:right"></td><td class="n"><input type="text" class="cqtd" inputmode="decimal" value="' + esc(v.qtd || "1") + '" style="width:80px;text-align:right"></td><td><input type="text" class="cun" value="' + esc(v.un || "UN") + '" style="width:60px"></td><td><button type="button" class="btn-icone" title="Remover" aria-label="Remover">×</button></td>';
    tb.appendChild(tr);
    tr.querySelector(".ccod").addEventListener("change", e => { tr.querySelector(".ccc").innerHTML = opcoesCc(e.target.value); });
    tr.querySelector(".ccc").addEventListener("change", e => { if (e.target.value === "__outro") { const c = prompt("Código da classificação tributária (cClassTrib, 6 dígitos):"); const cod = R.dig(c); e.target.innerHTML = opcoesCc(tr.querySelector(".ccod").value, cod.length === 6 ? cod : undefined); } });
    tr.querySelector("button").onclick = () => { tr.remove(); [...tb.rows].forEach((r, i) => r.cells[0].textContent = i + 1); };
  }
  $("#cMais").onclick = () => adicionarItem();
  R.pronto(() => {
    $("#cData").value = R.hoje(); R.preencherUfs($("#cUf"), "MG"); $("#cMun").value = "Belo Horizonte";
    if (!$("#cItens tbody").rows.length) adicionarItem({ cod: "113011000", cc: "200052", base: "10.000,00" });
  });

  $("#cCalcular").onclick = async () => {
    const data = $("#cData").value || R.hoje(), a = +data.slice(0, 4), uf = $("#cUf").value, mun = R.municipio($("#cMun").value, uf);
    if (!mun) { $("#cEstado").textContent = "Escolha um município da lista, da UF selecionada."; return; }
    const linhas = [...$("#cItens tbody").rows];
    if (!linhas.length) { $("#cEstado").textContent = "Inclua ao menos um item."; return; }
    const al = R.ano(Math.min(Math.max(a, 2026), 2033));
    const itens = linhas.map((tr, i) => {
      const cod = R.dig(tr.querySelector(".ccod").value), cc = tr.querySelector(".ccc").value, c = R.cc(cc, data);
      const it = { numero: i + 1, cst: c ? c.s : "000", cClassTrib: cc, baseCalculo: R.num(tr.querySelector(".cbase").value), quantidade: R.num(tr.querySelector(".cqtd").value) || 1, unidade: (tr.querySelector(".cun").value || "UN").toUpperCase() };
      if (cod.length === 9 && R.D().nbsMap.has(cod) && !R.D().ncmMap.has(cod)) it.nbs = cod; else it.ncm = cod;
      if (!al.nom.teste) it.aliquotasNominais = { cbs: al.nom.cbs, ibsEstadual: al.nom.ibsEstadual, ibsMunicipal: al.nom.ibsMunicipal };
      return it;
    });
    $("#cEstado").textContent = "Consultando a calculadora oficial…"; $("#cCalcular").disabled = true;
    try {
      const r = await R.calcular({ id: "hub" + Date.now(), versao: "1.0.0", dhFatoGerador: data + "T12:00:00-03:00", municipio: mun[0], uf, itens });
      ultimo = { data, uf, mun, itens, r, al };
      mostrar(); $("#cWord").hidden = false;
      $("#cEstado").textContent = r.simulado ? "Cálculo simulado: de 2027 em diante a calculadora oficial usa as alíquotas informadas no alto da página." : "Cálculo pela calculadora oficial.";
    } catch (e) { $("#cEstado").textContent = e.message || String(e); }
    finally { $("#cCalcular").disabled = false; }
  };
  function mostrar() {
    const { r, itens } = ultimo; let tCbs = 0, tIbs = 0, tBc = 0;
    let h = '<div class="rolagem" style="max-height:none"><table class="t"><thead><tr><th>#</th><th>Item</th><th>Situação</th><th class="n">Base</th><th class="n">CBS</th><th class="n">IBS estadual</th><th class="n">IBS municipal</th><th class="n">Total</th></tr></thead><tbody>';
    r.objetos.forEach((o, i) => {
      const it = itens[i], v = R.valoresItem(o), cod = it.ncm || it.nbs;
      if (v) { tCbs += v.vCBS; tIbs += v.vIBSUF + v.vIBSMun; tBc += v.vBC; }
      h += "<tr><td>" + (i + 1) + "</td><td>" + esc((it.nbs ? "NBS " : "NCM ") + R.fmtCod(cod, it.nbs ? "NBS" : "NCM")) + "<br><span class=\"pequeno mudo\">" + esc(it.cClassTrib) + "</span></td><td>" + (o.erros ? '<span class="selo erro">' + esc(o.estadoItem || "erro") + "</span>" : '<span class="selo ok">' + esc((o.estadoItem || "calculado").toLowerCase().replace(/_/g, " ")) + "</span>") + "</td>" +
        (v ? '<td class="n">' + R.moeda(v.vBC) + '</td><td class="n">' + R.moeda(v.vCBS) + "<br><span class=\"pequeno mudo\">" + R.pct(v.efCBS != null ? v.efCBS : v.pCBS, v.efCBS != null && String(v.efCBS).split(".")[1] && String(v.efCBS).split(".")[1].length > 2 ? 3 : 2) + '</span></td><td class="n">' + R.moeda(v.vIBSUF) + '</td><td class="n">' + R.moeda(v.vIBSMun) + '</td><td class="n">' + R.moeda(v.vCBS + v.vIBSUF + v.vIBSMun) + "</td>" : '<td colspan="5">' + esc((o.erros || []).map(e => e.code + ": " + e.detail).join("; ")) + "</td>") + "</tr>";
      if (v && (v.mem.cbs || v.mem.ibsUF)) h += '<tr><td></td><td colspan="7"><p class="mem">' + esc(v.mem.cbs || "") + "</p></td></tr>";
    });
    h += '<tr class="tot"><td></td><td colspan="2">Total</td><td class="n">' + R.moeda(tBc) + '</td><td class="n">' + R.moeda(tCbs) + '</td><td class="n" colspan="2">' + R.moeda(tIbs) + '</td><td class="n">' + R.moeda(tCbs + tIbs) + "</td></tr></tbody></table></div>";
    $("#cResultado").innerHTML = h;
  }
  $("#cWord").onclick = async () => {
    if (!ultimo) return;
    const { r, itens, data, mun, uf } = ultimo, v0 = await R.versao().catch(() => null);
    const b = [{ t: "tit", texto: "MEMÓRIA DE CÁLCULO DO IBS E DA CBS" }];
    b.push({ t: "tab", larg: [1.4, 3], linhas: [["Data do fato gerador", data.split("-").reverse().join("/")], ["Local da operação", mun[1] + "/" + uf], ["Calculadora", "Calculadora de Tributos da Receita Federal" + (v0 ? ", versão " + String(v0.versaoApp || "").split("-")[0] + ", base " + v0.versaoDb : "")], ["Natureza do cálculo", r.simulado ? "Simulado, com alíquotas de referência estimadas" : "Alíquotas vigentes fixadas em lei"]] });
    r.objetos.forEach((o, i) => {
      const it = itens[i], v = R.valoresItem(o), c = R.cc(it.cClassTrib, data), fund = R.fundamentos(c, data);
      b.push({ t: "h", texto: "Item " + (i + 1) + ": " + (it.nbs ? "NBS " + R.fmtNbs(it.nbs) : "NCM " + R.fmtNcm(it.ncm)) });
      b.push({ t: "p", r: [["Descrição: ", "bo"], [R.descricao(it.nbs || it.ncm) || "não informada", "n"]] });
      b.push({ t: "p", r: [["Classificação: ", "bo"], [it.cClassTrib + ", CST " + it.cst + (c ? ", " + c.d : ""), "n"]] });
      if (v) {
        b.push({ t: "tab", cab: ["Tributo", "Alíquota", "Redução", "Valor"], larg: [1.6, 1, 1, 1.2], linhas: [["CBS", R.pct(v.pCBS), v.redCBS ? R.pct(v.redCBS) : "-", R.moeda(v.vCBS)], ["IBS estadual", R.pct(v.pIBSUF), v.redIBS ? R.pct(v.redIBS) : "-", R.moeda(v.vIBSUF)], ["IBS municipal", R.pct(v.pIBSMun), v.redIBS ? R.pct(v.redIBS) : "-", R.moeda(v.vIBSMun)]] });
        if (v.mem.cbs) b.push({ t: "cit", texto: v.mem.cbs });
      } else b.push({ t: "p", r: [["Não calculado: ", "bo"], [(o.erros || []).map(e => e.code + " " + e.detail).join("; "), "n"]] });
      if (fund.length) b.push({ t: "p", r: [["Fundamentação: ", "bo"], [fund.map(f => f[0]).join("; "), "n"]] });
    });
    b.push({ t: "p", r: [["Cálculo efetuado pela instância oficial da Calculadora de Tributos da Receita Federal. Os valores de 2027 em diante são simulações enquanto não fixadas as alíquotas de referência pelo Senado Federal.", "i"]] });
    b.push({ t: "data", texto: "Belo Horizonte, " + P.dataExtenso(new Date()) + "." });
    try { P.baixar(await P.docx(b), "Memoria de calculo IBS CBS - " + data); } catch (e) { window.HUB.toast(e.message || "Não foi possível gerar o Word.", 5000); }
  };
})();
