/* Reforma tributária, aba "Simples Nacional": IBS e CBS dentro ou fora do DAS, de 2027 a 2033.

   Regras reproduzidas no navegador (a calculadora oficial do Simples não tem versão online):
   · alíquota efetiva = (RBT12 × alíquota nominal − parcela a deduzir) / RBT12, pelas tabelas dos Anexos I a V da
     LC 123/2006 na redação dos Anexos XVIII a XXII da LC 214/2025 (window.RTC_SIMPLES);
   · pCBSSN e pIBSSN = alíquota efetiva × percentual de repartição da CBS e do IBS na faixa e no ano; nos Anexos III e
     IV, quando o ISS da 5ª faixa passa do teto, vale a repartição da linha especial ((efetiva − teto) × percentual);
   · na 6ª faixa (acima do sublimite), o IBS e o ICMS/ISS são recolhidos fora do DAS;
   · valores arredondados no centavo pelo método bancário (HALF_EVEN), como na calculadora oficial.
   Dentro do DAS, o adquirente do regime regular credita-se do valor pago no Simples (LC 214/2025, art. 47, § 9º);
   fora dele (LC 123/2006, art. 18, § 9º), credita-se do valor integral destacado e a empresa apura créditos nas compras. */
(function () {
  "use strict";
  const R = window.RTC, { $, esc } = R, P = window.TPC_PECA, S = window.RTC_SIMPLES;
  let RES = null;

  function faixaDe(anexo, rbt12, ano) {
    const A = S.anexos[anexo], tab = A.aliquotas[ano >= 2029 ? "2029" : "2027"];
    const f = tab.find(x => rbt12 <= x.ate + 0.001) || tab[tab.length - 1];
    const ef = rbt12 <= 0 ? f.nominal : Math.max(0, (rbt12 * f.nominal / 100 - f.deduzir) / rbt12 * 100);
    const per = A.periodos.find(p => p.anos.includes(ano)) || A.periodos[A.periodos.length - 1];
    return { A, f, ef: f.faixa === 1 ? f.nominal : ef, per };
  }
  /* partilha efetiva (em pontos percentuais da receita) de cada tributo na faixa e no ano */
  function partilha(anexo, rbt12, ano) {
    const { f, ef, per } = faixaDe(anexo, rbt12, ano), p = per.partilha[String(f.faixa)] || {};
    let parc = {}, especial = false;
    const issNormal = p.ISS != null ? ef * p.ISS / 100 : 0;
    if (per.teto_iss && f.faixa === 5 && issNormal > per.teto_iss && per.faixa5_acima && !per.faixa5_acima._erro) {
      especial = true; parc.ISS = per.teto_iss;
      for (const [k, v] of Object.entries(per.faixa5_acima)) parc[k] = (ef - per.teto_iss) * v / 100;
    } else for (const [k, v] of Object.entries(p)) parc[k] = ef * v / 100;
    return { faixa: f.faixa, nominal: f.nominal, deduzir: f.deduzir, ef, parc, especial, colunas: per.colunas, periodo: per.rotulo, sublimite: f.faixa === 6 };
  }

  $("#sSimular").onclick = () => {
    try {
      const anexo = $("#sAnexo").value, rbt12 = R.num($("#sRbt12").value), mensal = R.num($("#sMensal").value), anual = mensal * 12;
      const b2b = Math.min(100, Math.max(0, R.num($("#sB2b").value))) / 100, red = R.num($("#sRed").value) / 100;
      const compras = R.num($("#sCompras").value) * 12, compReg = Math.min(100, Math.max(0, R.num($("#sCompReg").value))) / 100;
      if (!(rbt12 > 0) || !(mensal > 0)) { $("#sEstado").textContent = "Informe a receita bruta dos últimos 12 meses e o faturamento mensal."; return; }
      if (rbt12 > 4800000) { $("#sEstado").textContent = "Receita bruta acima de R$ 4,8 milhões: a empresa não pode permanecer no Simples Nacional."; return; }
      const Pm = R.parametros(), anos = [];
      for (const a of R.ANOS.filter(x => x >= 2027)) {
        const al = R.ano(a, Pm), pt = partilha(anexo, rbt12, a);
        const pCBSSN = pt.parc.CBS || 0, pIBSSN = pt.parc.IBS || 0;
        const das = R.r2(anual * pt.ef / 100), cbsSN = R.r2(anual * pCBSSN / 100), ibsSN = R.r2(anual * pIBSSN / 100);
        /* dentro: crédito do cliente = valor pago no Simples sobre as vendas a contribuintes do regime regular */
        const credCliDentro = R.r2(anual * b2b * (pCBSSN + pIBSSN) / 100);
        /* na 6ª faixa o IBS já é recolhido fora do DAS pelas regras gerais */
        const aliqReg = (al.nom.cbs + al.nom.ibsEstadual + al.nom.ibsMunicipal) * (1 - red), aliqIbsReg = (al.nom.ibsEstadual + al.nom.ibsMunicipal) * (1 - red);
        const ibsNomCompras = al.nom.ibsEstadual + al.nom.ibsMunicipal;
        const ibsFora6 = pt.sublimite ? R.r2(anual * aliqIbsReg / 100 - compras * compReg * ibsNomCompras / 100) : 0;
        const custoDentro = R.r2(das + ibsFora6);
        /* fora: DAS sem as parcelas de CBS e IBS; CBS e IBS pelo regime regular, com crédito das compras */
        const dasFora = R.r2(das - cbsSN - ibsSN);
        const debito = R.r2(anual * aliqReg / 100);
        const aliqCompras = al.nom.cbs + al.nom.ibsEstadual + al.nom.ibsMunicipal;
        const credCompras = R.r2(compras * compReg * aliqCompras / 100);
        const regular = R.r2(debito - credCompras);
        const custoFora = R.r2(dasFora + regular);
        const credCliFora = R.r2(anual * b2b * aliqReg / 100);
        const extra = R.r2(custoFora - custoDentro), ganhoCli = R.r2(credCliFora - credCliDentro - (pt.sublimite ? anual * b2b * aliqIbsReg / 100 : 0));
        const equilibrio = (aliqReg - pCBSSN - pIBSSN) > 0 ? extra / (anual * (aliqReg - pCBSSN - pIBSSN) / 100) * 100 : null;
        anos.push({ ano: a, al, pt, pCBSSN, pIBSSN, das, cbsSN, ibsSN, credCliDentro, custoDentro, dasFora, debito, credCompras, regular, custoFora, credCliFora, extra, ganhoCli, saldo: R.r2(ganhoCli - extra), equilibrio, aliqReg });
      }
      RES = { anexo, rbt12, mensal, anual, b2b, red, compras, compReg, Pm, anos };
      mostrar(); $("#sEstado").textContent = "Simulação concluída com as tabelas oficiais da LC 214/2025.";
    } catch (e) { $("#sEstado").textContent = e.message || String(e); }
  };

  function mostrar() {
    const { anos } = RES, a27 = anos[0], a33 = anos[anos.length - 1];
    $("#sRes").hidden = false;
    $("#sKpis").innerHTML = [
      ["Faixa e alíquota efetiva (2027)", a27.pt.faixa + "ª faixa · " + R.pct(a27.pt.ef, 4)],
      ["pCBSSN e pIBSSN em 2027", R.pct(a27.pCBSSN, 4) + " e " + R.pct(a27.pIBSSN, 4)],
      ["Custo adicional fora do DAS (2027)", (a27.extra >= 0 ? "+" : "") + R.moeda(a27.extra), a27.extra > 0],
      ["Crédito adicional aos clientes (2027)", R.moeda(a27.ganhoCli)],
      ["Saldo em 2033 (crédito adicional − custo)", (a33.saldo >= 0 ? "+" : "") + R.moeda(a33.saldo), a33.saldo < 0]
    ].map(k => '<div class="kpi' + (k[2] ? " alerta" : "") + '"><small>' + esc(k[0]) + "</small><b>" + esc(k[1]) + "</b></div>").join("");
    $("#sAnos").innerHTML = '<thead><tr><th>Ano</th><th class="n">Alíquota efetiva</th><th class="n">DAS (dentro)</th><th class="n">Crédito do cliente (dentro)</th><th class="n">DAS sem CBS/IBS</th><th class="n">CBS e IBS regular (líquido)</th><th class="n">Custo total (fora)</th><th class="n">Diferença de custo</th><th class="n">Crédito do cliente (fora)</th><th class="n">Saldo</th></tr></thead><tbody>' +
      anos.map(x => "<tr><td>" + x.ano + (x.pt.especial ? '<br><span class="pequeno mudo">teto do ISS</span>' : "") + (x.pt.sublimite ? '<br><span class="pequeno mudo">acima do sublimite</span>' : "") + '</td><td class="n">' + R.pct(x.pt.ef, 4) + '</td><td class="n">' + R.moeda(x.custoDentro) + '</td><td class="n">' + R.moeda(x.credCliDentro) + '</td><td class="n">' + R.moeda(x.dasFora) + '</td><td class="n">' + R.moeda(x.regular) + '</td><td class="n">' + R.moeda(x.custoFora) + '</td><td class="n">' + (x.extra >= 0 ? "+" : "") + R.moeda(x.extra) + '</td><td class="n">' + R.moeda(x.credCliFora) + '</td><td class="n"><b>' + (x.saldo >= 0 ? "+" : "") + R.moeda(x.saldo) + "</b></td></tr>").join("") + "</tbody>";
    $("#sDoc").innerHTML = '<thead><tr><th>Ano</th><th>Período da tabela</th><th class="n">Faixa</th><th class="n">pCBSSN</th><th class="n">pIBSSN</th><th class="n">CBS numa nota de R$ 1.000,00</th><th class="n">IBS numa nota de R$ 1.000,00</th></tr></thead><tbody>' +
      anos.map(x => "<tr><td>" + x.ano + "</td><td>" + esc(x.pt.periodo) + '</td><td class="n">' + x.pt.faixa + 'ª</td><td class="n">' + R.pct(x.pCBSSN, 4) + '</td><td class="n">' + R.pct(x.pIBSSN, 4) + '</td><td class="n">' + R.moeda(R.r2(1000 * x.pCBSSN / 100)) + '</td><td class="n">' + R.moeda(R.r2(1000 * x.pIBSSN / 100)) + "</td></tr>").join("") + "</tbody>";
    $("#sConclusao").innerHTML = '<h3 style="font-size:17px;margin:16px 0 4px">Leitura do resultado</h3>' + conclusao().map(p => "<p>" + esc(p) + "</p>").join("");
    grafico();
  }
  function conclusao() {
    const { anos, b2b } = RES, a27 = anos[0], a33 = anos[anos.length - 1], out = [];
    out.push("Com receita bruta de " + R.moeda(RES.rbt12) + " nos últimos doze meses, a empresa está na " + a27.pt.faixa + "ª faixa do Anexo " + RES.anexo + ", com alíquota efetiva de " + R.pct(a27.pt.ef, 4) + " em 2027. Dentro do DAS, a CBS e o IBS correspondem a " + R.pct(a27.pCBSSN + a27.pIBSSN, 4) + " do faturamento, e é esse o crédito que os clientes do regime regular podem aproveitar.");
    out.push("Fora do DAS, a empresa paga a CBS e o IBS pelas alíquotas do regime regular (" + R.pct(a27.aliqReg) + " em 2027 e " + R.pct(a33.aliqReg) + " em 2033, já consideradas as reduções informadas), descontados os créditos das compras, e os clientes passam a se creditar do valor integral destacado na nota. Em 2027, isso custa " + (a27.extra >= 0 ? R.moeda(a27.extra) + " a mais" : R.moeda(-a27.extra) + " a menos") + " por ano e gera " + R.moeda(a27.ganhoCli) + " de crédito adicional aos clientes; em 2033, " + (a33.extra >= 0 ? R.moeda(a33.extra) + " a mais" : R.moeda(-a33.extra) + " a menos") + " e " + R.moeda(a33.ganhoCli) + ", respectivamente.");
    if (a33.equilibrio != null) out.push("O ponto de equilíbrio em 2033 está em " + R.pct(Math.max(0, a33.equilibrio), 1) + " das vendas destinadas a contribuintes do regime regular; a empresa informou " + R.pct(b2b * 100, 0) + ". " + (b2b * 100 >= a33.equilibrio ? "Acima desse ponto, o crédito adicional supera o custo, e a saída do DAS tende a ser vantajosa se o preço puder absorver parte do crédito transferido." : "Abaixo desse ponto, o custo adicional supera o crédito transferido, e a permanência no DAS tende a ser mais vantajosa."));
    out.push("A opção é semestral e irretratável no semestre: exerce-se em setembro, para o semestre que começa em janeiro, e em março, para o que começa em julho (LC 123/2006, art. 18, § 10, com a redação da LC 227/2026). Fora do DAS, a empresa passa a cumprir as obrigações do regime regular do IBS e da CBS, e a decisão deve ser revista a cada semestre, à luz da composição da clientela, das margens e dos créditos de compras.");
    return out;
  }
  async function grafico() {
    try {
      await R.chart(); const el = $("#sGraf"); if (el._g) el._g.destroy();
      el._g = new Chart(el, { type: "bar", data: { labels: RES.anos.map(x => x.ano), datasets: [{ label: "Custo dentro do DAS", data: RES.anos.map(x => x.custoDentro), backgroundColor: "#B8B8B8" }, { label: "Custo fora do DAS", data: RES.anos.map(x => x.custoFora), backgroundColor: "#EB6834" }, { type: "line", label: "Crédito adicional aos clientes", data: RES.anos.map(x => x.ganhoCli), borderColor: "#1BAF7A", backgroundColor: "#1BAF7A", pointRadius: 3 }] }, options: { animation: false, responsive: true, maintainAspectRatio: false, plugins: { legend: { position: "bottom" }, tooltip: { callbacks: { label: c => c.dataset.label + ": " + R.moeda(c.parsed.y) } } }, scales: { y: { ticks: { callback: v => (v / 1000).toLocaleString("pt-BR") + " mil" } } } } });
    } catch (e) { /* sem gráfico */ }
  }

  $("#sXlsx").onclick = async () => {
    if (!RES) return; await R.xlsx();
    const wb = XLSX.utils.book_new(), add = (n, l) => XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(l), n);
    add("Comparação", [["Ano", "Faixa", "Alíquota efetiva (%)", "pCBSSN (%)", "pIBSSN (%)", "Custo dentro do DAS", "Crédito do cliente dentro", "DAS sem CBS/IBS", "Débito CBS/IBS regular", "Crédito das compras", "CBS/IBS regular líquido", "Custo fora do DAS", "Diferença de custo", "Crédito do cliente fora", "Crédito adicional", "Saldo"], ...RES.anos.map(x => [x.ano, x.pt.faixa, +x.pt.ef.toFixed(6), +x.pCBSSN.toFixed(6), +x.pIBSSN.toFixed(6), x.custoDentro, x.credCliDentro, x.dasFora, x.debito, x.credCompras, x.regular, x.custoFora, x.extra, x.credCliFora, x.ganhoCli, x.saldo])]);
    add("Premissas", [["Parâmetro", "Valor"], ["Anexo", RES.anexo], ["RBT12 (R$)", RES.rbt12], ["Faturamento mensal (R$)", RES.mensal], ["Vendas a contribuintes do regime regular (%)", RES.b2b * 100], ["Redução de alíquota (%)", RES.red * 100], ["Compras anuais com crédito (R$)", RES.compras], ["Compras de fornecedores do regime regular (%)", RES.compReg * 100], ["CBS de referência (%)", RES.Pm.cbs], ["IBS estadual de referência (%)", RES.Pm.ibsUf], ["IBS municipal de referência (%)", RES.Pm.ibsMun]]);
    XLSX.writeFile(wb, "Simples Nacional dentro ou fora do DAS - " + R.nomeArquivo($("#sEmpresa").value || "empresa") + ".xlsx");
  };
  $("#sWord").onclick = async () => {
    if (!RES) return;
    const { anos } = RES, b = [{ t: "tit", texto: "PARECER: IBS E CBS DENTRO OU FORA DO SIMPLES NACIONAL" }];
    b.push({ t: "tab", larg: [1.4, 3], linhas: [["Empresa", ($("#sEmpresa").value.trim() || "não informada") + (R.dig($("#sCnpj").value).length === 14 ? ", CNPJ " + R.dig($("#sCnpj").value).replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5") : "")], ["Anexo do Simples Nacional", "Anexo " + RES.anexo + " da LC 123/2006"], ["Receita bruta em 12 meses", R.moeda(RES.rbt12)], ["Faturamento anual considerado", R.moeda(RES.anual)], ["Vendas a contribuintes do regime regular", R.pct(RES.b2b * 100, 0)], ["Referência", $("#sRef").value.trim() || "-"], ["Data", new Date().toLocaleDateString("pt-BR")]] });
    b.push({ t: "h", texto: "1. Consulta" });
    b.push({ t: "p", r: "Indaga-se se é mais vantajoso à empresa, optante pelo Simples Nacional, manter o recolhimento do IBS e da CBS no regime único (DAS) ou exercer a faculdade de apurá-los e recolhê-los pelo regime regular, prevista no art. 18, § 9º, da Lei Complementar nº 123/2006, com a redação da Lei Complementar nº 227/2026." });
    b.push({ t: "h", texto: "2. Fundamentos" });
    b.push({ t: "p", r: "Dentro do DAS, o adquirente sujeito ao regime regular apropria crédito do IBS e da CBS em montante equivalente ao efetivamente pago pelo optante no regime único (LC 214/2025, art. 47, § 9º, II), calculado pela alíquota efetiva e pelos percentuais de repartição dos Anexos I a V da LC 123/2006, na redação dos Anexos XVIII a XXII da LC 214/2025. Fora do DAS, a empresa recolhe o IBS e a CBS pelas alíquotas do regime regular, com direito aos créditos de suas aquisições, e o adquirente se credita do valor integral destacado no documento fiscal. A opção é semestral e irretratável no período, exercida em setembro e em março (LC 123/2006, art. 18, § 10)." });
    b.push({ t: "h", texto: "3. Simulação" });
    b.push({ t: "tab", cab: ["Ano", "Alíquota efetiva", "Custo dentro", "Custo fora", "Diferença", "Crédito adicional aos clientes"], larg: [0.6, 1, 1.1, 1.1, 1, 1.3], linhas: anos.map(x => [String(x.ano), R.pct(x.pt.ef, 4), R.moeda(x.custoDentro), R.moeda(x.custoFora), R.moeda(x.extra), R.moeda(x.ganhoCli)]) });
    b.push({ t: "p", r: "Alíquotas do documento fiscal dentro do DAS, informadas à calculadora oficial do Simples Nacional:" });
    b.push({ t: "tab", cab: ["Ano", "Faixa", "pCBSSN", "pIBSSN"], larg: [0.8, 0.8, 1.2, 1.2], linhas: anos.map(x => [String(x.ano), x.pt.faixa + "ª", R.pct(x.pCBSSN, 4), R.pct(x.pIBSSN, 4)]) });
    b.push({ t: "h", texto: "4. Conclusão" });
    conclusao().forEach(p => b.push({ t: "p", r: p }));
    b.push({ t: "h", texto: "5. Ressalvas" });
    b.push({ t: "p", r: "As alíquotas de referência do IBS e da CBS de 2027 em diante ainda serão fixadas pelo Senado Federal, de modo que os valores do regime regular são estimativas. A simulação pressupõe faturamento e receita bruta constantes, créditos de compras nas proporções informadas e não considera efeitos de preço, margem e fluxo de caixa, que devem ser avaliados na decisão de cada semestre." });
    b.push({ t: "data", texto: "Belo Horizonte, " + P.dataExtenso(new Date()) + "." });
    try { P.baixar(await P.docx(b), "Parecer Simples Nacional IBS e CBS - " + R.nomeArquivo($("#sEmpresa").value || "empresa")); } catch (e) { window.HUB.toast(e.message || "Não foi possível gerar o Word.", 5000); }
  };
  window.RTC_SN = { faixaDe, partilha };
})();
