/* Reforma tributária, aba "Diagnóstico de impacto": itens do cliente (planilha ou XMLs de notas emitidas), classificação
   tributária sugerida pelas tabelas oficiais, CBS e IBS de cada ano de 2026 a 2033 pela calculadora oficial e
   tributos atuais remanescentes pelo cronograma da transição; resultado em tabela, gráfico, planilha e relatório.

   Premissa econômica: o valor das operações sem tributos (V) fica constante. ICMS, ISS e, em 2026, PIS e COFINS são
   calculados "por dentro" do preço; CBS e IBS incidem "por fora" sobre V, que é a base unificada da calculadora
   oficial (o ICMS, o ISS e, em 2026, o PIS e a COFINS não integram a base). Em 2026, a CBS e o IBS de teste são
   compensáveis com PIS e COFINS e não aumentam a carga (LC 214/2025, arts. 343, 346 e 348). */
(function () {
  "use strict";
  const R = window.RTC, { $, esc } = R, P = window.TPC_PECA;
  let ITENS = [], RES = null;

  /* ------------------------------------------------------------------ itens */
  function tipoDe(cod) { const d = R.D(), c = R.dig(cod); return c.length === 9 && d.nbsMap.has(c) && !d.ncmMap.has(c) ? "nbs" : "ncm"; }
  function sugerir(cod) { const c = R.dig(cod); if (c.length < 8) return "000001"; const ap = R.aplicaveis(c); return (ap.itens.find(a => !a.geral) || ap.itens[0] || { cod: "000001" }).cod; }
  function novoItem(o) {
    const cod = R.dig(o.cod), tipo = tipoDe(cod);
    return { desc: o.desc || R.descricao(cod) || "", cod, tipo, cc: R.dig(o.cc).length === 6 ? R.dig(o.cc) : sugerir(cod), receita: +o.receita || 0, icms: o.icms != null ? +o.icms : (tipo === "nbs" ? 0 : R.num($("#dIcms").value)), iss: o.iss != null ? +o.iss : (tipo === "nbs" ? R.num($("#dIss").value) : 0), ipi: +o.ipi || 0, pc: o.pc != null ? +o.pc : null, origem: o.origem || "manual" };
  }
  function opcoesCc(it) {
    const ap = it.cod.length >= 8 ? R.aplicaveis(it.cod) : { itens: [] }, vis = new Set(ap.itens.map(a => a.cod));
    let o = ap.itens.map(a => '<option value="' + a.cod + '"' + (a.cod === it.cc ? " selected" : "") + ">" + a.cod + " · " + esc(a.c.d.slice(0, 60)) + "</option>").join("");
    if (it.cc && !vis.has(it.cc)) { const c = R.cc(it.cc); o += '<option value="' + esc(it.cc) + '" selected>' + esc(it.cc) + (c ? " · " + esc(c.d.slice(0, 60)) : "") + "</option>"; }
    return o + '<option value="__outro">Outra…</option>';
  }
  const pcPadrao = () => $("#dRegime").value === "real" ? 9.25 : 3.65;
  $("#dRegime").addEventListener("change", () => desenharItens());
  function desenharItens() {
    $("#dItens tbody").innerHTML = ITENS.map((it, i) => '<tr data-i="' + i + '"><td><input type="text" data-c="desc" value="' + esc(it.desc) + '" style="min-width:180px"></td><td><input type="text" data-c="cod" value="' + esc(R.fmtCod(it.cod, it.tipo)) + '" style="width:120px"></td><td><select data-c="cc" style="min-width:200px;max-width:280px">' + opcoesCc(it) + '</select></td><td class="n"><input type="text" data-c="receita" inputmode="decimal" value="' + R.fmt(it.receita) + '" style="width:130px;text-align:right"></td><td class="n"><input type="text" data-c="icms" inputmode="decimal" value="' + R.fmt(it.icms) + '" style="width:64px;text-align:right"></td><td class="n"><input type="text" data-c="iss" inputmode="decimal" value="' + R.fmt(it.iss) + '" style="width:64px;text-align:right"></td><td class="n"><input type="text" data-c="ipi" inputmode="decimal" value="' + R.fmt(it.ipi) + '" style="width:64px;text-align:right"></td><td class="n"><input type="text" data-c="pc" inputmode="decimal" value="' + R.fmt(it.pc != null ? it.pc : pcPadrao()) + '" title="' + (it.pc != null ? "PIS e COFINS próprios do item" : "PIS e COFINS do regime") + '" style="width:64px;text-align:right"></td><td><button type="button" class="btn-icone" data-rem title="Remover" aria-label="Remover">×</button></td></tr>').join("") || '<tr><td colspan="9" class="pequeno mudo">Nenhum item. Importe a planilha ou os XMLs, ou adicione manualmente.</td></tr>';
  }
  $("#dItens").addEventListener("change", e => {
    const tr = e.target.closest("tr[data-i]"); if (!tr) return; const it = ITENS[+tr.dataset.i], c = e.target.dataset.c;
    if (c === "cod") { it.cod = R.dig(e.target.value); it.tipo = tipoDe(it.cod); it.cc = sugerir(it.cod); if (!it.desc) it.desc = R.descricao(it.cod); desenharItens(); }
    else if (c === "cc") { if (e.target.value === "__outro") { const v = R.dig(prompt("Código da classificação tributária (cClassTrib, 6 dígitos):")); if (v.length === 6) it.cc = v; desenharItens(); } else it.cc = e.target.value; }
    else if (c === "desc") it.desc = e.target.value;
    else it[c] = R.num(e.target.value);
  });
  $("#dItens").addEventListener("click", e => { const b = e.target.closest("[data-rem]"); if (!b) return; ITENS.splice(+b.closest("tr").dataset.i, 1); desenharItens(); });
  $("#dMais").onclick = () => { ITENS.push(novoItem({ cod: "", receita: 0 })); desenharItens(); };
  $("#dLimpar").onclick = () => { ITENS = []; desenharItens(); $("#dRes").hidden = true; };
  R.pronto(() => { R.preencherUfs($("#dUf"), "MG"); $("#dMun").value = "Belo Horizonte"; desenharItens(); });

  $("#dModelo").onclick = async () => {
    await R.xlsx();
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([["Descrição", "NCM ou NBS", "cClassTrib (opcional)", "Receita anual (R$)", "ICMS %", "ISS %", "IPI %", "PIS e COFINS % (opcional)"], ["Arroz tipo 1", "1006.30.21", "", 1200000, 7, 0, 0, 0], ["Notebook", "8471.30.12", "", 3500000, 18, 0, 0, ""], ["Serviços de consultoria jurídica", "1.1301.10.00", "", 800000, 0, 5, 0, ""]]), "Itens");
    XLSX.writeFile(wb, "Modelo - diagnostico da reforma tributaria.xlsx");
  };

  /* ------------------------------------------------------------------ importação */
  const tag = (el, n) => el ? el.getElementsByTagNameNS("*", n)[0] || null : null;
  const val = (el, n) => { const x = tag(el, n); return x ? x.textContent.trim() : ""; };
  const nf = s => parseFloat(String(s || "0")) || 0;
  function lerXml(txt, agreg) {
    const doc = new DOMParser().parseFromString(txt, "application/xml");
    const dets = [...doc.getElementsByTagNameNS("*", "det")];
    if (dets.length) {
      for (const d of dets) {
        const prod = tag(d, "prod"), imp = tag(d, "imposto"); if (!prod) continue;
        const ncm = val(prod, "NCM"), v = nf(val(prod, "vProd")) + nf(val(prod, "vFrete")) + nf(val(prod, "vSeg")) + nf(val(prod, "vOutro")) - nf(val(prod, "vDesc"));
        const icms = imp ? [...imp.getElementsByTagNameNS("*", "ICMS")].reduce((s, g) => s + nf(val(g, "vICMS")), 0) : 0;
        const ipi = imp ? nf(val(tag(imp, "IPI"), "vIPI")) : 0, pis = imp ? nf(val(tag(imp, "PIS"), "vPIS")) : 0, cof = imp ? nf(val(tag(imp, "COFINS"), "vCOFINS")) : 0;
        const cc = imp ? val(tag(imp, "IBSCBS"), "cClassTrib") : "";
        const k = ncm + "|" + cc; if (!agreg.has(k)) agreg.set(k, { cod: ncm, cc, desc: val(prod, "xProd"), v: 0, icms: 0, ipi: 0, pc: 0, iss: 0, n: 0 });
        const a = agreg.get(k); a.v += v; a.icms += icms; a.ipi += ipi; a.pc += pis + cof; a.n++;
      }
      return true;
    }
    const nfse = doc.getElementsByTagNameNS("*", "infNFSe")[0] || doc.getElementsByTagNameNS("*", "infDPS")[0];
    if (nfse) {
      const nbs = val(nfse, "cNBS"), cc = val(tag(nfse, "IBSCBS"), "cClassTrib") || val(nfse, "cClassTrib");
      const v = nf(val(nfse, "vServ")) - nf(val(nfse, "vDescIncond")), iss = nf(val(nfse, "vISSQN")), pc = nf(val(nfse, "vPis")) + nf(val(nfse, "vCofins"));
      const k = nbs + "|" + cc; if (!agreg.has(k)) agreg.set(k, { cod: nbs, cc, desc: val(nfse, "xDescServ").slice(0, 120), v: 0, icms: 0, ipi: 0, pc: 0, iss: 0, n: 0 });
      const a = agreg.get(k); a.v += v; a.iss += iss; a.pc += pc; a.n++;
      return true;
    }
    return false;
  }
  async function importar(fs) {
    $("#dEstado").textContent = "Lendo os arquivos…";
    try {
      await R.dados();
      const arqs = await R.abrirArquivos(fs), agreg = new Map(); let nXml = 0, nPlan = 0, ignorados = 0;
      for (const a of arqs) {
        if (/\.xml$/i.test(a.nome)) { if (lerXml(R.textoXml(a.buf), agreg)) nXml++; else ignorados++; continue; }
        await R.xlsx(); const wb = XLSX.read(a.buf, { type: "array" }); const ws = wb.Sheets[wb.SheetNames[0]], l = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: "" });
        const cab = (l[0] || []).map(x => R.sem(x)), col = re => cab.findIndex(c => re.test(c));
        const iD = col(/descri/), iC = col(/ncm|nbs|codigo/), iT = col(/cclass|classifica/), iR = col(/receita|faturamento|valor/), iI = col(/^icms/), iS = col(/^iss/), iP = col(/^ipi/), iPc = col(/^pis/);
        for (const ln of l.slice(1)) { if (!ln || !String(ln[iC] || "").trim()) continue; ITENS.push(novoItem({ desc: ln[iD], cod: ln[iC], cc: iT >= 0 ? ln[iT] : "", receita: R.num(ln[iR]), icms: iI >= 0 && ln[iI] !== "" ? R.num(ln[iI]) : null, iss: iS >= 0 && ln[iS] !== "" ? R.num(ln[iS]) : null, ipi: iP >= 0 ? R.num(ln[iP]) : 0, pc: iPc >= 0 && String(ln[iPc]).trim() !== "" ? R.num(ln[iPc]) : null, origem: "planilha" })); nPlan++; }
      }
      for (const a of agreg.values()) {
        if (!a.v) continue;
        ITENS.push(novoItem({ desc: a.desc, cod: a.cod, cc: a.cc, receita: R.r2(a.v), icms: +(a.icms / a.v * 100).toFixed(4), iss: +(a.iss / a.v * 100).toFixed(4), ipi: +(a.ipi / a.v * 100).toFixed(4), pc: +(a.pc / a.v * 100).toFixed(4), origem: "xml" }));
      }
      desenharItens();
      $("#dEstado").textContent = (nXml ? nXml + " notas lidas, somadas em " + agreg.size + " itens por código e classificação. " : "") + (nPlan ? nPlan + " linhas da planilha importadas. " : "") + (ignorados ? ignorados + " arquivos XML não reconhecidos. " : "") + "Confira as classificações sugeridas antes de calcular.";
    } catch (e) { $("#dEstado").textContent = e.message || String(e); }
  }
  R.zona($("#dZona"), $("#dArq"), importar);

  /* ------------------------------------------------------------------ cálculo */
  $("#dCalcular").onclick = async () => {
    const itens = ITENS.filter(it => it.cod && it.receita > 0);
    if (!itens.length) { $("#dEstado").textContent = "Inclua itens com código e receita."; return; }
    const uf = $("#dUf").value, mun = R.municipio($("#dMun").value, uf);
    if (!mun) { $("#dEstado").textContent = "Escolha um município da lista, da UF selecionada."; return; }
    const Pm = R.parametros(), regime = $("#dRegime").value, pcReg = pcPadrao();
    const compras = R.num($("#dCompras").value), icmsComp = R.num($("#dIcmsComp").value) / 100;
    $("#dCalcular").disabled = true; R.prog("#dBarra", 0.02);
    try {
      /* valor sem tributos de cada item, a partir da receita de hoje (2026) */
      const base = itens.map(it => { const pc = (it.pc != null ? it.pc : pcReg) / 100, g = it.icms / 100 + it.iss / 100 + pc; return { it, pc, V: it.receita * (1 - g) }; });
      const anos = [];
      for (let k = 0; k < R.ANOS.length; k++) {
        const a = R.ANOS[k], al = R.ano(a, Pm);
        $("#dEstado").textContent = "Calculando " + a + " pela calculadora oficial…"; R.prog("#dBarra", (k + 0.5) / R.ANOS.length);
        const op = { id: "diag" + a + Date.now(), versao: "1.0.0", dhFatoGerador: a + "-06-15T12:00:00-03:00", municipio: mun[0], uf, itens: base.map((b, i) => {
          const it = b.it, c = R.cc(it.cc, a + "-06-15"), x = { numero: i + 1, cst: c ? c.s : "000", cClassTrib: it.cc, baseCalculo: R.r2(b.V), quantidade: 1, unidade: "UN" };
          if (it.tipo === "nbs") x.nbs = it.cod; else x.ncm = it.cod;
          if (!al.nom.teste) x.aliquotasNominais = { cbs: al.nom.cbs, ibsEstadual: al.nom.ibsEstadual, ibsMunicipal: al.nom.ibsMunicipal };
          return x;
        }) };
        const r = await R.calcular(op);
        let tICMS = 0, tISS = 0, tPC = 0, tIPI = 0, tCBS = 0, tIBS = 0, tV = 0; const porItem = [], erros = [];
        base.forEach((b, i) => {
          const it = b.it, f = al.fICMS, g = (it.icms / 100 + it.iss / 100) * f + (al.pisCofins ? b.pc : 0), preco = b.V / (1 - g);
          const icms = preco * it.icms / 100 * f, iss = preco * it.iss / 100 * f, pc = al.pisCofins ? preco * b.pc : 0, ipi = al.ipi ? preco * it.ipi / 100 : 0;
          const o = r.objetos[i], v = R.valoresItem(o);
          if (!v) erros.push({ item: it, erros: (o && o.erros) || [] });
          const cbs = v ? v.vCBS : 0, ibs = v ? v.vIBSUF + v.vIBSMun : 0;
          tICMS += icms; tISS += iss; tPC += pc; tIPI += ipi; tCBS += cbs; tIBS += ibs; tV += b.V;
          porItem.push({ it, V: b.V, icms, iss, pc, ipi, cbs, ibs, v, legado: icms + iss + pc + ipi, novo: a === 2026 ? 0 : cbs + ibs });
        });
        /* créditos estimados nas compras */
        const f = al.fICMS, credLeg = compras * icmsComp * f + (al.pisCofins && regime === "real" ? compras * 0.0925 : 0);
        const comprasV = compras * (1 - icmsComp * f - (al.pisCofins && regime === "real" ? 0.0925 : 0));
        const credNovo = a === 2026 ? 0 : comprasV * (al.nom.cbs + al.nom.ibsEstadual + al.nom.ibsMunicipal) / 100;
        const debLeg = tICMS + tISS + tPC + tIPI, debNovo = a === 2026 ? 0 : tCBS + tIBS;
        anos.push({ ano: a, al, tV, tICMS, tISS, tPC, tIPI, tCBS, tIBS, debLeg, debNovo, credLeg, credNovo, liquido: debLeg + debNovo - credLeg - credNovo, porItem, erros, simulado: r.simulado });
      }
      RES = { anos, itens, regime, uf, mun, Pm, compras, icmsComp, quando: new Date() };
      R.prog("#dBarra", null); mostrar();
      const nErr = anos[anos.length - 1].erros.length;
      $("#dEstado").textContent = "Cálculo concluído pela calculadora oficial." + (nErr ? " " + nErr + " itens não foram calculados (classificação incompatível com o código); veja o detalhe na tabela de itens." : "");
    } catch (e) { $("#dEstado").textContent = e.message || String(e); R.prog("#dBarra", null); }
    finally { $("#dCalcular").disabled = false; }
  };

  /* ------------------------------------------------------------------ resultado */
  const pctV = (x, V) => V ? x / V * 100 : 0;
  function mostrar() {
    const { anos } = RES, a26 = anos[0], a33 = anos[anos.length - 1];
    $("#dRes").hidden = false;
    const var33 = a33.liquido - a26.liquido;
    $("#dKpis").innerHTML = [
      ["Carga líquida em 2026", R.moeda(a26.liquido) + " · " + R.pct(pctV(a26.liquido, a26.tV))],
      ["Carga líquida em 2033", R.moeda(a33.liquido) + " · " + R.pct(pctV(a33.liquido, a33.tV))],
      ["Variação 2033 × 2026", (var33 >= 0 ? "+" : "") + R.moeda(var33) + " · " + (a26.liquido ? (var33 >= 0 ? "+" : "") + R.pct(var33 / a26.liquido * 100, 1) : "-"), var33 > 0],
      ["CBS e IBS em 2033 (débito)", R.moeda(a33.debNovo)],
      ["Itens analisados", String(RES.itens.length)]
    ].map(k => '<div class="kpi' + (k[2] ? " alerta" : "") + '"><small>' + esc(k[0]) + "</small><b>" + esc(k[1]) + "</b></div>").join("");
    $("#dAnos").innerHTML = '<thead><tr><th>Ano</th><th class="n">PIS e COFINS</th><th class="n">IPI</th><th class="n">ICMS</th><th class="n">ISS</th><th class="n">CBS</th><th class="n">IBS</th><th class="n">Créditos</th><th class="n">Carga líquida</th><th class="n">% sobre o valor sem tributos</th></tr></thead><tbody>' +
      anos.map(x => "<tr><td>" + x.ano + (x.ano === 2026 ? '<br><span class="pequeno mudo">CBS e IBS de teste, compensáveis</span>' : x.simulado ? '<br><span class="pequeno mudo">simulado</span>' : "") + '</td><td class="n">' + R.moeda(x.tPC) + '</td><td class="n">' + R.moeda(x.tIPI) + '</td><td class="n">' + R.moeda(x.tICMS) + '</td><td class="n">' + R.moeda(x.tISS) + '</td><td class="n">' + R.moeda(x.tCBS) + '</td><td class="n">' + R.moeda(x.tIBS) + '</td><td class="n">' + R.moeda(x.credLeg + x.credNovo) + '</td><td class="n"><b>' + R.moeda(x.liquido) + '</b></td><td class="n">' + R.pct(pctV(x.liquido, x.tV)) + "</td></tr>").join("") + "</tbody>";
    $("#dItensRes").innerHTML = '<thead><tr><th>Item</th><th>Classificação</th><th class="n">Valor sem tributos</th><th class="n">Tributos hoje</th><th class="n">CBS + IBS em 2033</th><th class="n">Variação</th></tr></thead><tbody>' +
      a33.porItem.map((p, i) => { const h = a26.porItem[i], d = p.novo - h.legado, c = R.cc(p.it.cc, "2033-06-15"), red = R.reducao(c, "2033-06-15"); return "<tr><td>" + esc(p.it.desc || "") + '<br><span class="pequeno mudo">' + esc((p.it.tipo === "nbs" ? "NBS " : "NCM ") + R.fmtCod(p.it.cod, p.it.tipo)) + "</span></td><td>" + esc(p.it.cc) + (red.CBS ? ' <span class="selo red">redução ' + R.pct(red.CBS, 0) + "</span>" : "") + (p.v ? "" : '<br><span class="selo erro">não calculado: ' + esc(((a33.erros.find(e => e.item === p.it) || {}).erros || []).map(e => e.detail).join("; ").slice(0, 160)) + "</span>") + '</td><td class="n">' + R.moeda(p.V) + '</td><td class="n">' + R.moeda(h.legado) + '</td><td class="n">' + R.moeda(p.novo) + '</td><td class="n">' + (d >= 0 ? "+" : "") + R.moeda(d) + "</td></tr>"; }).join("") + "</tbody>";
    $("#dConclusao").innerHTML = '<h3 style="font-size:17px;margin:16px 0 4px">Leitura do resultado</h3>' + conclusao().map(p => "<p>" + esc(p) + "</p>").join("");
    grafico();
  }
  function conclusao() {
    const { anos } = RES, a26 = anos[0], a33 = anos[anos.length - 1], v = a33.liquido - a26.liquido, out = [];
    out.push("Mantido constante o valor das operações sem tributos, a carga líquida estimada passa de " + R.moeda(a26.liquido) + " em 2026 (" + R.pct(pctV(a26.liquido, a26.tV)) + " do valor sem tributos) para " + R.moeda(a33.liquido) + " em 2033 (" + R.pct(pctV(a33.liquido, a33.tV)) + "), " + (Math.abs(v) < 1 ? "sem variação relevante" : v > 0 ? "um aumento de " + R.moeda(v) + " por ano" : "uma redução de " + R.moeda(-v) + " por ano") + ".");
    const comRed = a33.porItem.filter(p => { const c = R.cc(p.it.cc, "2033-06-15"); return R.reducao(c, "2033-06-15").CBS > 0; });
    if (comRed.length) out.push(comRed.length + (comRed.length === 1 ? " item está enquadrado" : " itens estão enquadrados") + " em classificação com redução de alíquota, o que exige documentação que comprove o enquadramento, já que a redução depende do cumprimento das condições da LC 214/2025 indicadas na fundamentação de cada classificação.");
    const ord = a33.porItem.map((p, i) => ({ p, d: p.novo - a26.porItem[i].legado })).sort((x, y) => y.d - x.d);
    if (ord[0] && ord[0].d > 0) out.push("O maior aumento está em " + (ord[0].p.it.desc || ord[0].p.it.cod) + " (" + R.moeda(ord[0].d) + " por ano); a revisão de preços e de contratos de longo prazo deve começar por esse item.");
    const ult = ord[ord.length - 1]; if (ult && ult.d < 0) out.push("A maior redução está em " + (ult.p.it.desc || ult.p.it.cod) + " (" + R.moeda(-ult.d) + " por ano).");
    out.push("Durante a transição, a empresa convive com os dois sistemas: de 2029 a 2032 o ICMS e o ISS diminuem enquanto o IBS cresce, e a não cumulatividade plena da CBS e do IBS depende da regularidade dos fornecedores, porque o crédito fica condicionado à extinção do débito na etapa anterior (LC 214/2025, art. 47). Recomenda-se revisar o cadastro fiscal de produtos e serviços, as cláusulas de reajuste e reequilíbrio dos contratos, a política de preços e a cadeia de fornecedores.");
    return out;
  }
  async function grafico() {
    try {
      await R.chart(); const el = $("#dGraf"); if (el._g) el._g.destroy();
      el._g = new Chart(el, { type: "bar", data: { labels: RES.anos.map(x => x.ano), datasets: [{ label: "Tributos atuais (PIS/COFINS, IPI, ICMS, ISS)", data: RES.anos.map(x => x.debLeg), backgroundColor: "#B8B8B8", stack: "d" }, { label: "CBS e IBS", data: RES.anos.map(x => x.debNovo), backgroundColor: "#EB6834", stack: "d" }, { type: "line", label: "Carga líquida (após créditos)", stack: "liquido", data: RES.anos.map(x => x.liquido), borderColor: "#2B2B2B", backgroundColor: "#2B2B2B", pointRadius: 3 }] }, options: { animation: false, responsive: true, maintainAspectRatio: false, plugins: { legend: { position: "bottom" }, tooltip: { callbacks: { label: c => c.dataset.label + ": " + R.moeda(c.parsed.y) } } }, scales: { x: { stacked: true }, y: { stacked: true, ticks: { callback: v => (v / 1000).toLocaleString("pt-BR") + " mil" } } } } });
    } catch (e) { /* sem gráfico */ }
  }

  /* ------------------------------------------------------------------ planilha e relatório */
  $("#dXlsx").onclick = async () => {
    if (!RES) return; await R.xlsx();
    const wb = XLSX.utils.book_new(), add = (n, l) => XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(l), n);
    add("Anos", [["Ano", "Valor sem tributos", "PIS e COFINS", "IPI", "ICMS", "ISS", "CBS", "IBS", "Créditos atuais", "Créditos CBS/IBS", "Carga líquida", "% sobre o valor sem tributos"], ...RES.anos.map(x => [x.ano, R.r2(x.tV), R.r2(x.tPC), R.r2(x.tIPI), R.r2(x.tICMS), R.r2(x.tISS), R.r2(x.tCBS), R.r2(x.tIBS), R.r2(x.credLeg), R.r2(x.credNovo), R.r2(x.liquido), +pctV(x.liquido, x.tV).toFixed(2)])]);
    const linhas = [["Ano", "Descrição", "NCM/NBS", "cClassTrib", "Valor sem tributos", "PIS e COFINS", "IPI", "ICMS", "ISS", "CBS", "IBS", "Memória de cálculo (CBS)"]];
    RES.anos.forEach(x => x.porItem.forEach(p => linhas.push([x.ano, p.it.desc, p.it.cod, p.it.cc, R.r2(p.V), R.r2(p.pc), R.r2(p.ipi), R.r2(p.icms), R.r2(p.iss), R.r2(p.cbs), R.r2(p.ibs), p.v ? p.v.mem.cbs || "" : "não calculado"])));
    add("Itens por ano", linhas);
    add("Premissas", [["Parâmetro", "Valor"], ["CBS de referência (%)", RES.Pm.cbs], ["IBS estadual de referência (%)", RES.Pm.ibsUf], ["IBS municipal de referência (%)", RES.Pm.ibsMun], ["Frações do IBS 2029-2032 (%)", RES.Pm.fracoes.join("; ")], ["Regime de PIS/COFINS", RES.regime === "real" ? "Lucro Real" : "Lucro Presumido"], ["Compras anuais com crédito (R$)", RES.compras], ["ICMS médio nas compras (%)", RES.icmsComp * 100]]);
    XLSX.writeFile(wb, "Diagnostico da reforma tributaria - " + R.nomeArquivo($("#dCliente").value || "cliente") + ".xlsx");
  };
  $("#dWord").onclick = async () => {
    if (!RES) return;
    const { anos, itens, Pm } = RES, a26 = anos[0], a33 = anos[anos.length - 1], v0 = await R.versao().catch(() => null), d = R.D();
    const b = [{ t: "tit", texto: "DIAGNÓSTICO DE IMPACTO DA REFORMA TRIBUTÁRIA DO CONSUMO" }];
    b.push({ t: "tab", larg: [1.4, 3], linhas: [["Cliente", ($("#dCliente").value.trim() || "não informado") + (R.dig($("#dCnpj").value).length === 14 ? ", CNPJ " + R.dig($("#dCnpj").value).replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5") : "")], ["Local das operações", RES.mun[1] + "/" + RES.uf], ["Regime atual de PIS e COFINS", RES.regime === "real" ? "Lucro Real, não cumulativo" : "Lucro Presumido, cumulativo"], ["Referência", $("#dRef").value.trim() || "-"], ["Data", new Date().toLocaleDateString("pt-BR")]] });
    b.push({ t: "h", texto: "1. Objeto" });
    b.push({ t: "p", r: "Este diagnóstico estima o efeito da Reforma Tributária do Consumo (Emenda Constitucional nº 132/2023 e Lei Complementar nº 214/2025, com as alterações da Lei Complementar nº 227/2026) sobre as operações de venda do cliente, ano a ano, de 2026 a 2033, comparando os tributos atuais (PIS, COFINS, IPI, ICMS e ISS) com a Contribuição Social sobre Bens e Serviços (CBS) e o Imposto sobre Bens e Serviços (IBS)." });
    b.push({ t: "h", texto: "2. Metodologia e premissas" });
    b.push({ t: "p", r: "A CBS e o IBS de cada item foram calculados pela instância oficial da Calculadora de Tributos da Receita Federal" + (v0 ? " (versão " + String(v0.versaoApp || "").split("-")[0] + ", base de dados " + v0.versaoDb + ")" : "") + ", que aplica a classificação tributária, as reduções de alíquota e a base de cálculo definidas na legislação e devolve a memória de cálculo com o enquadramento legal. As classificações foram atribuídas a partir das tabelas oficiais " + (d.versao.versao || "") + " de " + String(d.versao.data || "").split("-").reverse().join("/") + "." });
    b.push({ t: "p", r: "Manteve-se constante o valor das operações sem tributos. O ICMS, o ISS e, em 2026, o PIS e a COFINS foram calculados por dentro do preço, pelas alíquotas médias informadas ou extraídas das notas fiscais; a CBS e o IBS, por fora, sobre a base unificada. Os créditos sobre compras foram estimados a partir do volume anual de compras informado. As alíquotas de referência de 2027 em diante ainda não foram fixadas pelo Senado Federal e foram estimadas como segue:" });
    b.push({ t: "tab", cab: ["Ano", "CBS", "IBS estadual", "IBS municipal", "ICMS e ISS"], larg: [0.8, 1, 1, 1, 1.4], linhas: anos.map(x => [String(x.ano), R.pct(x.al.nom.cbs), R.pct(x.al.nom.ibsEstadual), R.pct(x.al.nom.ibsMunicipal), x.al.fICMS === 1 ? "integrais" : x.al.fICMS ? R.pct(x.al.fICMS * 100, 0) + " das alíquotas" : "extintos"]) });
    b.push({ t: "h", texto: "3. Classificação tributária dos itens" });
    b.push({ t: "tab", cab: ["Item", "NCM/NBS", "Classificação", "Fundamento"], larg: [1.8, 1, 2, 1.4], linhas: itens.map(it => { const c = R.cc(it.cc, "2033-06-15"), f = R.fundamentos(c, "2033-06-15"); return [it.desc || "-", R.fmtCod(it.cod, it.tipo), it.cc + (c ? " · " + c.d : ""), f.map(x => x[0]).join("; ") || "-"]; }) });
    b.push({ t: "h", texto: "4. Resultados por ano" });
    b.push({ t: "tab", cab: ["Ano", "Tributos atuais", "CBS e IBS", "Créditos", "Carga líquida", "% s/ valor"], larg: [0.7, 1.2, 1.2, 1.1, 1.2, 0.9], linhas: anos.map(x => [String(x.ano), R.moeda(x.debLeg), x.ano === 2026 ? "compensável" : R.moeda(x.debNovo), R.moeda(x.credLeg + x.credNovo), R.moeda(x.liquido), R.pct(pctV(x.liquido, x.tV))]) });
    b.push({ t: "h", texto: "5. Itens: situação atual e regime definitivo (2033)" });
    b.push({ t: "tab", cab: ["Item", "Tributos hoje", "CBS e IBS em 2033", "Variação"], larg: [2.2, 1.2, 1.2, 1.1], linhas: a33.porItem.map((p, i) => { const h = a26.porItem[i]; return [p.it.desc || p.it.cod, R.moeda(h.legado), p.v ? R.moeda(p.novo) : "não calculado", R.moeda(p.novo - h.legado)]; }) });
    b.push({ t: "h", texto: "6. Conclusões e recomendações" });
    conclusao().forEach(p => b.push({ t: "p", r: p }));
    b.push({ t: "h", texto: "7. Ressalvas" });
    b.push({ t: "p", r: "Os valores de 2027 em diante são simulações. O diagnóstico não considera benefícios fiscais de ICMS, substituição tributária, regimes específicos, Imposto Seletivo nem efeitos sobre preços e margens, que devem ser examinados no caso concreto. A classificação tributária de cada item deve ser confirmada à luz da operação efetivamente praticada e das condições legais de cada tratamento diferenciado." });
    b.push({ t: "data", texto: "Belo Horizonte, " + P.dataExtenso(new Date()) + "." });
    try { P.baixar(await P.docx(b), "Diagnostico da reforma tributaria - " + R.nomeArquivo($("#dCliente").value || "cliente")); } catch (e) { window.HUB.toast(e.message || "Não foi possível gerar o Word.", 5000); }
  };
})();
