/* Reforma tributária, aba "Auditoria de notas e DANFSe": lê XMLs de NF-e, NFC-e e NFS-e, refaz o cálculo de cada item
   com grupo do IBS e da CBS pela calculadora oficial (mesma classificação, base e alíquotas declaradas), aponta as
   divergências, valida o grupo das NF-e/NFC-e contra o XSD oficial e gera o DANFSe das NFS-e pelo gerador da Receita
   Federal compilado em WebAssembly (o XML não sai do navegador). */
(function () {
  "use strict";
  const R = window.RTC, { $, esc } = R, P = window.TPC_PECA;
  let NOTAS = [];
  const TOL = 0.011;
  const tag = (el, n) => el ? el.getElementsByTagNameNS("*", n)[0] || null : null;
  const val = (el, n) => { const x = tag(el, n); return x ? x.textContent.trim() : ""; };
  const nf = s => s === "" || s == null ? null : parseFloat(s);
  const dataBr = s => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s || ""); return m ? m[3] + "/" + m[2] + "/" + m[1] : ""; };

  /* ------------------------------------------------------------------ leitura */
  function grupo(el) {
    const g = tag(el, "IBSCBS"); if (!g) return null;
    const gUF = tag(g, "gIBSUF"), gMun = tag(g, "gIBSMun"), gCBS = tag(g, "gCBS");
    return { el: g, CST: val(g, "CST"), cClassTrib: val(g, "cClassTrib"), vBC: nf(val(g, "vBC")), pIBSUF: nf(val(gUF || g, "pIBSUF")), vIBSUF: nf(val(gUF || g, "vIBSUF")), pIBSMun: nf(val(gMun || g, "pIBSMun")), vIBSMun: nf(val(gMun || g, "vIBSMun")), pCBS: nf(val(gCBS || g, "pCBS")), vCBS: nf(val(gCBS || g, "vCBS")), redCBS: nf(val(gCBS || g, "pRedAliq")) };
  }
  function ler(nome, txt) {
    const doc = new DOMParser().parseFromString(txt, "application/xml");
    if (doc.getElementsByTagName("parsererror").length) return { nome, tipo: "?", erro: "XML inválido ou corrompido." };
    const inf = doc.getElementsByTagNameNS("*", "infNFe")[0];
    if (inf) {
      const ide = tag(inf, "ide"), emit = tag(inf, "emit"), mod = val(ide, "mod");
      const n = { nome, txt, tipo: mod === "65" ? "NFC-e" : "NF-e", numero: val(ide, "nNF"), serie: val(ide, "serie"), data: val(ide, "dhEmi").slice(0, 10), dh: val(ide, "dhEmi"), mun: val(ide, "cMunFG"), uf: val(tag(emit, "enderEmit"), "UF"), emitente: val(emit, "xNome"), doc: val(emit, "CNPJ") || val(emit, "CPF"), chave: (inf.getAttribute("Id") || "").replace(/^NFe/, ""), itens: [], tot: tag(inf, "IBSCBSTot") };
      for (const d of inf.getElementsByTagNameNS("*", "det")) {
        const prod = tag(d, "prod"); n.itens.push({ n: +d.getAttribute("nItem"), desc: val(prod, "xProd"), ncm: val(prod, "NCM"), qtd: nf(val(prod, "qCom")) || 1, un: val(prod, "uCom") || "UN", vProd: nf(val(prod, "vProd")), g: grupo(tag(d, "imposto")) });
      }
      return n;
    }
    const nfse = doc.getElementsByTagNameNS("*", "infNFSe")[0];
    if (nfse) {
      const dps = tag(nfse, "infDPS"), emit = tag(nfse, "emit"), g = grupo(nfse) || grupo(dps);
      /* na NFS-e a classificação fica na DPS e os valores no grupo da nota */
      if (g) { const gd = grupo(dps); if (gd) { g.CST = g.CST || gd.CST; g.cClassTrib = g.cClassTrib || gd.cClassTrib; } }
      const n = { nome, txt, tipo: "NFS-e", numero: val(nfse, "nNFSe"), serie: val(dps, "serie"), data: (val(dps, "dhEmi") || val(nfse, "dhProc")).slice(0, 10), dh: val(dps, "dhEmi") || val(nfse, "dhProc"), mun: val(nfse, "cLocIncid") || val(dps, "cLocEmi"), uf: "", emitente: val(emit, "xNome"), doc: val(emit, "CNPJ") || val(emit, "CPF"), chave: (nfse.getAttribute("Id") || "").replace(/^NFS/, ""), itens: [] };
      n.itens.push({ n: 1, desc: val(dps, "xDescServ").slice(0, 160), nbs: val(dps, "cNBS"), qtd: 1, un: "UN", vProd: nf(val(dps, "vServ")), g });
      return n;
    }
    return { nome, tipo: "?", erro: "Não é NF-e, NFC-e nem NFS-e no leiaute nacional." };
  }

  /* ------------------------------------------------------------------ auditoria */
  async function auditar(n) {
    const comGrupo = n.itens.filter(i => i.g && i.g.cClassTrib);
    if (!comGrupo.length) { n.situacao = "sem grupo"; return; }
    const ano = +String(n.data).slice(0, 4), m = R.D().munPorCod.get(+n.mun);
    const uf = n.uf || (m ? m[2] : ""), itens = comGrupo.map(i => {
      const x = { numero: i.n, cst: i.g.CST, cClassTrib: i.g.cClassTrib, baseCalculo: i.g.vBC != null ? i.g.vBC : (i.vProd || 0), quantidade: i.qtd || 1, unidade: (i.un || "UN").toUpperCase().slice(0, 6) };
      if (i.nbs) x.nbs = R.dig(i.nbs); else x.ncm = R.dig(i.ncm);
      if (ano >= 2027 && i.g.pCBS != null) x.aliquotasNominais = { cbs: i.g.pCBS, ibsEstadual: i.g.pIBSUF || 0, ibsMunicipal: i.g.pIBSMun || 0 };
      return x;
    });
    try {
      const r = await R.calcular({ id: "aud" + Date.now(), versao: "1.0.0", dhFatoGerador: n.dh || (n.data + "T12:00:00-03:00"), municipio: +n.mun || (m ? m[0] : 0), uf, itens });
      n.simulado = r.simulado; let div = 0;
      comGrupo.forEach((i, k) => {
        const o = r.objetos[k], v = R.valoresItem(o); i.oficial = v; i.erros = (o && o.erros) || []; i.dif = [];
        if (!v) { i.dif.push({ campo: "cálculo", xml: i.g.cClassTrib, of: i.erros.map(e => e.code + ": " + e.detail).join("; ") || (o && o.estadoItem) || "não calculado" }); div++; return; }
        const cmp = (campo, a, b) => { if (a == null) return; if (Math.abs(a - b) > TOL) i.dif.push({ campo, xml: a, of: b }); };
        cmp("vCBS", i.g.vCBS, v.vCBS); cmp("vIBSUF", i.g.vIBSUF, v.vIBSUF); cmp("vIBSMun", i.g.vIBSMun, v.vIBSMun);
        if (i.g.redCBS != null || v.redCBS) cmp("redução da CBS (%)", i.g.redCBS || 0, v.redCBS || 0);
        if (i.dif.length) div++;
      });
      n.divergentes = div; n.situacao = div ? "divergência" : "conforme";
    } catch (e) { n.situacao = "erro"; n.erro = e.message || String(e); }
    /* leiaute do grupo (NF-e e NFC-e) */
    if (n.tipo !== "NFS-e" && !n.tot) n.leiaute = "a nota não traz o grupo de totais do IBS e da CBS (IBSCBSTot)";
    else if (n.tipo !== "NFS-e") {
      const ser = new XMLSerializer(), limpa = el => ser.serializeToString(el).replace(/ xmlns="http:\/\/www\.portalfiscal\.inf\.br\/nfe"/g, "");
      const xml = '<?xml version="1.0" encoding="UTF-8"?><infNFe xmlns="http://www.portalfiscal.inf.br/nfe">' + comGrupo.map(i => '<det nItem="' + i.n + '"><imposto>' + limpa(i.g.el) + "</imposto></det>").join("") + "<total>" + limpa(n.tot) + "</total></infNFe>";
      try { const v = await R.servico("xml/validar?tipo=" + (n.tipo === "NFC-e" ? "nfce" : "nfe") + "&subtipo=grupo", xml, "application/xml"); n.leiaute = v.ok ? "válido" : ((v.json && (v.json.detail || v.json.erro)) || "HTTP " + v.status); }
      catch (e) { n.leiaute = "não verificado (" + (e.message || e) + ")"; }
    }
  }
  async function processar(fs) {
    try {
      await R.dados();
      $("#aEstado").textContent = "Lendo os arquivos…";
      const arqs = (await R.abrirArquivos(fs)).filter(a => /\.xml$/i.test(a.nome));
      const novas = arqs.map(a => ler(a.nome, R.textoXml(a.buf)));
      NOTAS = NOTAS.concat(novas);
      let feito = 0; R.prog("#aBarra", 0.02);
      const fila = novas.filter(n => !n.erro);
      await Promise.all(Array.from({ length: 2 }, async () => { while (fila.length) { const n = fila.shift(); await auditar(n); feito++; R.prog("#aBarra", feito / novas.length); $("#aEstado").textContent = "Auditando " + feito + " de " + novas.length + "…"; } }));
      R.prog("#aBarra", null); mostrar();
      $("#aEstado").textContent = novas.length + " arquivos processados.";
    } catch (e) { $("#aEstado").textContent = e.message || String(e); R.prog("#aBarra", null); }
  }
  R.zona($("#aZona"), $("#aArq"), processar);

  /* ------------------------------------------------------------------ resultado */
  const seloSit = s => '<span class="selo ' + (s === "conforme" ? "ok" : s === "divergência" || s === "erro" ? "erro" : "") + '">' + esc(s || "") + "</span>";
  function mostrar() {
    $("#aRes").hidden = !NOTAS.length;
    const itens = NOTAS.reduce((s, n) => s + (n.itens || []).filter(i => i.g && i.g.cClassTrib).length, 0), div = NOTAS.reduce((s, n) => s + (n.divergentes || 0), 0);
    $("#aKpis").innerHTML = [["Documentos", String(NOTAS.length)], ["Itens com IBS/CBS auditados", String(itens)], ["Itens com divergência", String(div), div > 0], ["Documentos sem grupo IBS/CBS", String(NOTAS.filter(n => n.situacao === "sem grupo").length)], ["Leiaute inválido", String(NOTAS.filter(n => n.leiaute && n.leiaute !== "válido" && !/^não verificado/.test(n.leiaute)).length)], ["NFS-e (DANFSe)", String(NOTAS.filter(n => n.tipo === "NFS-e").length)]]
      .map(k => '<div class="kpi' + (k[2] ? " alerta" : "") + '"><small>' + esc(k[0]) + "</small><b>" + esc(k[1]) + "</b></div>").join("");
    $("#aNotas").innerHTML = '<thead><tr><th>Documento</th><th>Emissão</th><th>Emitente</th><th class="n">Itens</th><th>Situação</th><th>Leiaute</th><th></th></tr></thead><tbody>' + NOTAS.map((n, i) => "<tr><td><b>" + esc(n.tipo) + " " + esc(n.numero || "") + "</b><br><span class=\"pequeno mudo\">" + esc(n.nome) + "</span></td><td>" + esc(dataBr(n.data)) + "</td><td>" + esc(n.emitente || "") + '</td><td class="n">' + ((n.itens || []).length) + "</td><td>" + (n.erro && !n.itens ? '<span class="selo erro">' + esc(n.erro) + "</span>" : seloSit(n.situacao) + (n.erro ? '<br><span class="pequeno">' + esc(n.erro) + "</span>" : "")) + "</td><td>" + (n.leiaute ? (n.leiaute === "válido" ? '<span class="selo ok">válido</span>' : '<span class="pequeno">' + esc(String(n.leiaute).slice(0, 160)) + "</span>") : "-") + '</td><td style="white-space:nowrap">' + (n.itens ? '<button type="button" class="btn sec peq" data-ver="' + i + '">Detalhe</button> ' : "") + (n.tipo === "NFS-e" ? '<button type="button" class="btn sec peq" data-danfse="' + i + '">DANFSe</button>' : "") + "</td></tr>").join("") + "</tbody>";
    $("#aDanfseTodos").hidden = !NOTAS.some(n => n.tipo === "NFS-e");
  }
  $("#aNotas").addEventListener("click", async e => {
    const v = e.target.closest("[data-ver]"), d = e.target.closest("[data-danfse]");
    if (v) detalhe(NOTAS[+v.dataset.ver]);
    if (d) { d.disabled = true; try { const n = NOTAS[+d.dataset.danfse], pdf = await danfse(n); baixarBlob(new Blob([pdf], { type: "application/pdf" }), "DANFSe " + R.nomeArquivo(n.numero || n.nome) + ".pdf"); } catch (x) { window.HUB.toast(x.message || String(x), 6000); } finally { d.disabled = false; } }
  });
  function detalhe(n) {
    const it = n.itens.filter(i => i.g && i.g.cClassTrib);
    $("#aDet").innerHTML = '<h3 style="font-size:17px;margin:16px 0 4px">' + esc(n.tipo + " " + (n.numero || "")) + " · " + esc(n.emitente || "") + "</h3>" + (n.chave ? '<p class="pequeno mudo" style="margin:0">Chave ' + esc(n.chave) + "</p>" : "") +
      (it.length ? '<div class="rolagem" style="max-height:none"><table class="t"><thead><tr><th>Item</th><th>Classificação</th><th class="n">Base</th><th class="n">CBS (nota)</th><th class="n">CBS (oficial)</th><th class="n">IBS (nota)</th><th class="n">IBS (oficial)</th><th>Resultado</th></tr></thead><tbody>' + it.map(i => { const o = i.oficial; return "<tr><td>" + i.n + ". " + esc(i.desc || "") + '<br><span class="pequeno mudo">' + esc(i.nbs ? "NBS " + i.nbs : "NCM " + i.ncm) + "</span></td><td>" + esc(i.g.CST + " / " + i.g.cClassTrib) + '</td><td class="n">' + R.moeda(i.g.vBC) + '</td><td class="n">' + (i.g.vCBS != null ? R.moeda(i.g.vCBS) : "-") + '</td><td class="n">' + (o ? R.moeda(o.vCBS) : "-") + '</td><td class="n">' + (i.g.vIBSUF != null || i.g.vIBSMun != null ? R.moeda((i.g.vIBSUF || 0) + (i.g.vIBSMun || 0)) : "-") + '</td><td class="n">' + (o ? R.moeda(o.vIBSUF + o.vIBSMun) : "-") + "</td><td>" + (!o && !(i.dif && i.dif.length) ? '<span class="selo">não conferido</span>' : i.dif && i.dif.length ? i.dif.map(x => '<span class="selo erro">' + esc(x.campo) + "</span> " + esc(typeof x.xml === "number" ? R.fmt(x.xml) : x.xml) + " → " + esc(typeof x.of === "number" ? R.fmt(x.of) : x.of)).join("<br>") : '<span class="selo ok">conforme</span>') + "</td></tr>" + (o && o.mem.cbs ? '<tr><td></td><td colspan="7"><p class="mem">' + esc(o.mem.cbs) + "</p></td></tr>" : ""); }).join("") + "</tbody></table></div>" : '<p class="pequeno">Este documento não tem o grupo do IBS e da CBS preenchido.</p>');
    $("#aDet").scrollIntoView({ behavior: "smooth", block: "start" });
  }

  /* ------------------------------------------------------------------ DANFSe (gerador oficial em WebAssembly) */
  let wasm = null;
  function carregarWasm() {
    if (wasm) return wasm;
    wasm = (async () => {
      if (typeof Go === "undefined") await new Promise((ok, falha) => { const s = document.createElement("script"); s.src = new URL("../vendor/danfse/wasm_exec.js", location.href).href; s.onload = ok; s.onerror = () => falha(new Error("Não foi possível carregar o gerador de DANFSe.")); document.head.appendChild(s); });
      $("#aEstado").textContent = "Carregando o gerador oficial de DANFSe (cerca de 7 MB, só na primeira vez)…";
      const r = await fetch(new URL("../vendor/danfse/danfse.wasm.gz", location.href).href); if (!r.ok) throw new Error("Gerador de DANFSe indisponível (HTTP " + r.status + ").");
      const bin = await new Response(r.body.pipeThrough(new DecompressionStream("gzip"))).arrayBuffer();
      const go = new Go(), inst = await WebAssembly.instantiate(bin, go.importObject); go.run(inst.instance);
      for (let i = 0; i < 50 && !(window.danfseWasm && window.danfseWasm.ready); i++) await new Promise(ok => setTimeout(ok, 50));
      if (!window.danfseWasm || !window.danfseWasm.ready) throw new Error("O gerador de DANFSe não iniciou: " + ((window.danfseWasm && window.danfseWasm.error) || "erro desconhecido"));
      $("#aEstado").textContent = "Gerador de DANFSe pronto.";
      return window.danfseWasm;
    })().catch(e => { wasm = null; throw e; });
    return wasm;
  }
  async function danfse(n) {
    const api = await carregarWasm(), stc = 0; /* documento válido; cancelamento e substituição não são lidos do XML da nota */
    let res = api.gerarPdf(JSON.stringify({ xml: n.txt, stc, canhoto: $("#aCanhoto").value === "1" }));
    if (typeof res === "string") res = JSON.parse(res);
    if (res.error) throw new Error("DANFSe: " + res.error);
    return Uint8Array.from(atob(res.pdf), c => c.charCodeAt(0));
  }
  function baixarBlob(blob, nome) { const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = nome; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1500); }
  $("#aDanfseTodos").onclick = async () => {
    const l = NOTAS.filter(n => n.tipo === "NFS-e"); if (!l.length) return;
    $("#aDanfseTodos").disabled = true;
    try {
      const z = new JSZip(); let ok = 0, falhas = [];
      for (const n of l) { try { z.file("DANFSe " + R.nomeArquivo(n.numero || n.nome) + ".pdf", await danfse(n)); ok++; } catch (e) { falhas.push(n.nome + ": " + (e.message || e)); } }
      baixarBlob(await z.generateAsync({ type: "blob" }), "DANFSe - " + R.nomeArquivo($("#aCliente").value || "notas") + ".zip");
      $("#aEstado").textContent = ok + " DANFSe gerados." + (falhas.length ? " Falharam: " + falhas.join("; ") : "");
    } catch (e) { $("#aEstado").textContent = e.message || String(e); }
    finally { $("#aDanfseTodos").disabled = false; }
  };

  /* ------------------------------------------------------------------ planilha e relatório */
  $("#aXlsx").onclick = async () => {
    if (!NOTAS.length) return; await R.xlsx();
    const l = [["Arquivo", "Documento", "Número", "Emissão", "Emitente", "Item", "NCM/NBS", "CST", "cClassTrib", "Base", "CBS na nota", "CBS oficial", "IBS UF na nota", "IBS UF oficial", "IBS Mun na nota", "IBS Mun oficial", "Resultado", "Leiaute"]];
    NOTAS.forEach(n => (n.itens || [{}]).forEach(i => { const o = i.oficial, g = i.g || {}; l.push([n.nome, n.tipo, n.numero || "", dataBr(n.data), n.emitente || "", i.n || "", i.nbs || i.ncm || "", g.CST || "", g.cClassTrib || "", g.vBC, g.vCBS, o ? o.vCBS : "", g.vIBSUF, o ? o.vIBSUF : "", g.vIBSMun, o ? o.vIBSMun : "", !g.cClassTrib ? "sem grupo" : !o && !(i.dif && i.dif.length) ? "não conferido" : i.dif && i.dif.length ? i.dif.map(x => x.campo + ": " + x.xml + " → " + x.of).join("; ") : "conforme", n.leiaute || ""]); }));
    const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(l), "Itens");
    XLSX.writeFile(wb, "Auditoria IBS e CBS - " + R.nomeArquivo($("#aCliente").value || "notas") + ".xlsx");
  };
  $("#aWord").onclick = async () => {
    if (!NOTAS.length) return;
    const v0 = await R.versao().catch(() => null), com = NOTAS.filter(n => n.situacao === "divergência"), sem = NOTAS.filter(n => n.situacao === "sem grupo"), conf = NOTAS.filter(n => n.situacao === "conforme");
    const lay = NOTAS.filter(n => n.leiaute && n.leiaute !== "válido" && !/^não verificado/.test(n.leiaute));
    const b = [{ t: "tit", texto: "RELATÓRIO DE AUDITORIA DO IBS E DA CBS EM DOCUMENTOS FISCAIS" }];
    b.push({ t: "tab", larg: [1.4, 3], linhas: [["Cliente", $("#aCliente").value.trim() || "não informado"], ["Referência", $("#aRef").value.trim() || "-"], ["Documentos examinados", String(NOTAS.length)], ["Calculadora", "Calculadora de Tributos da Receita Federal" + (v0 ? ", versão " + String(v0.versaoApp || "").split("-")[0] + ", base " + v0.versaoDb : "")], ["Data", new Date().toLocaleDateString("pt-BR")]] });
    b.push({ t: "h", texto: "1. Metodologia" });
    b.push({ t: "p", r: "Cada item com o grupo do IBS e da CBS foi recalculado pela instância oficial da Calculadora de Tributos da Receita Federal, com a classificação tributária, a base de cálculo e as alíquotas declaradas no próprio documento, e os valores obtidos foram comparados aos destacados, com tolerância de um centavo. Nas NF-e e NFC-e, o grupo do IBS e da CBS foi também validado contra o esquema XSD oficial. A calculadora acusa ainda a incompatibilidade entre a classificação tributária e o NCM ou a NBS do item." });
    b.push({ t: "h", texto: "2. Resumo" });
    b.push({ t: "p", r: conf.length + " documentos conformes, " + com.length + " com divergência, " + sem.length + " sem o grupo do IBS e da CBS e " + lay.length + " com erro de leiaute." });
    if (com.length) {
      b.push({ t: "h", texto: "3. Divergências" });
      const linhas = []; com.forEach(n => n.itens.filter(i => i.dif && i.dif.length).forEach(i => i.dif.forEach(x => linhas.push([n.tipo + " " + (n.numero || "") + ", item " + i.n, (i.g.CST || "") + " / " + (i.g.cClassTrib || ""), x.campo, typeof x.xml === "number" ? R.fmt(x.xml) : String(x.xml), typeof x.of === "number" ? R.fmt(x.of) : String(x.of)]))));
      b.push({ t: "tab", cab: ["Documento e item", "CST / cClassTrib", "Campo", "Na nota", "Oficial"], larg: [1.6, 1.1, 1, 1, 1.6], linhas });
    }
    if (lay.length) { b.push({ t: "h", texto: (com.length ? "4" : "3") + ". Erros de leiaute" }); b.push({ t: "tab", cab: ["Documento", "Mensagem do validador"], larg: [1.4, 4], linhas: lay.map(n => [n.tipo + " " + (n.numero || ""), String(n.leiaute)]) }); }
    b.push({ t: "h", texto: "Conclusão" });
    b.push({ t: "p", r: com.length || lay.length ? "As divergências apontadas devem ser examinadas com o responsável pela emissão: em regra decorrem de classificação tributária incompatível com o produto ou serviço, de redução de alíquota aplicada sem previsão para a classificação, de erro de arredondamento ou de parametrização do sistema emissor. A correção deve ser feita por documento fiscal complementar, de ajuste ou por nova emissão, conforme o caso, antes do fechamento da apuração." : "Não foram encontradas divergências entre os valores destacados e o cálculo oficial nos documentos examinados." });
    b.push({ t: "data", texto: "Belo Horizonte, " + P.dataExtenso(new Date()) + "." });
    try { P.baixar(await P.docx(b), "Auditoria IBS e CBS - " + R.nomeArquivo($("#aCliente").value || "notas")); } catch (e) { window.HUB.toast(e.message || "Não foi possível gerar o Word.", 5000); }
  };
})();
