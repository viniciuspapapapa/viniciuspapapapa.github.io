/* Gerador da proposta de honorários sobre o modelo do escritório (PDF), com pdf-lib e as fontes Inter.
   As posições, os corpos e as cores reproduzem a proposta original. */
(function (root) {
  "use strict";

  /* ------------------------------------------------------------------ valores por extenso */
  const UN = ["zero", "um", "dois", "três", "quatro", "cinco", "seis", "sete", "oito", "nove", "dez", "onze", "doze", "treze", "catorze", "quinze", "dezesseis", "dezessete", "dezoito", "dezenove"];
  const UN_F = ["zero", "uma", "duas"];
  const DEZ = ["", "", "vinte", "trinta", "quarenta", "cinquenta", "sessenta", "setenta", "oitenta", "noventa"];
  const CEM = ["", "cento", "duzentos", "trezentos", "quatrocentos", "quinhentos", "seiscentos", "setecentos", "oitocentos", "novecentos"];
  const CEM_F = ["", "cento", "duzentas", "trezentas", "quatrocentas", "quinhentas", "seiscentas", "setecentas", "oitocentas", "novecentas"];
  function ate999(n, fem) {
    if (n === 0) return "";
    if (n === 100) return "cem";
    const c = Math.floor(n / 100), r = n % 100, p = [];
    if (c) p.push((fem ? CEM_F : CEM)[c]);
    if (r) {
      if (r < 20) p.push(fem && r < 3 ? UN_F[r] : UN[r]);
      else { const d = Math.floor(r / 10), u = r % 10; p.push(DEZ[d] + (u ? " e " + (fem && u < 3 ? UN_F[u] : UN[u]) : "")); }
    }
    return p.join(" e ");
  }
  function inteiro(n, fem) {
    if (n === 0) return "zero";
    const grupos = []; let x = n;
    while (x > 0) { grupos.push(x % 1000); x = Math.floor(x / 1000); }
    const NOMES = [["", ""], ["mil", "mil"], ["milhão", "milhões"], ["bilhão", "bilhões"]];
    const partes = [];
    for (let i = grupos.length - 1; i >= 0; i--) {
      const g = grupos[i]; if (!g) continue;
      let t = i === 1 && g === 1 ? "mil" : ate999(g, fem && i < 2) + (i ? " " + NOMES[i][g === 1 ? 0 : 1] : "");
      partes.push({ t, g, i });
    }
    /* conector "e": antes do último grupo quando ele é menor que 100 ou centena exata */
    let s = "";
    partes.forEach((p, k) => {
      if (k === 0) s = p.t;
      else s += (k === partes.length - 1 && (p.g < 100 || p.g % 100 === 0) ? " e " : ", ") + p.t;
    });
    return s.replace(/, /g, " ");
  }
  function reais(v) {
    const cent = Math.round(v * 100), r = Math.floor(cent / 100), c = cent % 100;
    const p = [];
    if (r) { const t = inteiro(r); p.push(t + (/(milhão|milhões|bilhão|bilhões)$/.test(t) ? " de" : "") + (r === 1 ? " real" : " reais")); }
    if (c) p.push(inteiro(c) + (c === 1 ? " centavo" : " centavos"));
    return p.length ? p.join(" e ") : "zero real";
  }
  const brl = v => "R$ " + v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const comExtenso = v => brl(v) + " (" + reais(v) + ")";
  const qtd = (n, fem) => n + " (" + inteiro(n, fem) + ")";
  const MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
  const dataExtenso = d => d.getUTCDate() + " de " + MESES[d.getUTCMonth()] + " de " + d.getUTCFullYear();
  const dataBR = d => String(d.getUTCDate()).padStart(2, "0") + "/" + String(d.getUTCMonth() + 1).padStart(2, "0") + "/" + d.getUTCFullYear();

  /* ------------------------------------------------------------------ textos */
  const FIXO_P3 = [
    "Os valores acima serão corrigidos pela variação do INPC até as respectivas datas de pagamento.",
    "Em caso de desistência dos serviços jurídicos constantes na presente proposta, por escolha do contratante, os valores descritos acima ainda serão devidos ao escritório."
  ];
  const TRIBUTOS = "Se, durante a vigência da prestação de serviços, ocorrer a criação, modificação e/ou incidência de novos tributos, que repercutam na correspondente alteração de base de cálculo ou de alíquotas, e que representem incremento da carga tributária incidente sobre serviços previstos na presente proposta, o preço originalmente acordado deverá ser aumentado proporcionalmente à majoração ocorrida.";
  const SERVICOS_PADRAO = [
    "Análise e estudo aprofundado dos autos e documentos probatórios;",
    "Auxílio na produção probatória;",
    "Estratégia de atuação jurídica;",
    "Elaboração de petições, memoriais, requerimentos e demais manifestações no bojo do Procedimento Criminal;",
    "Acompanhamento de diligências e perícias, se designadas;",
    "Reuniões presenciais ou virtuais;",
    "Interlocução com autoridades, quando necessário."
  ];
  const ESCOPO_EXEMPLO = "o acompanhamento, até o término do primeiro grau, dos autos de nº ";

  function divisao(total, n) {
    const cent = Math.round(total * 100), base = Math.floor(cent / n), resto = cent - base * n;
    return { igual: resto === 0, parcela: base / 100, ultima: (base + resto) / 100 };
  }
  /* f = { valor, modo: avista|parcelado|entrada|livre, parcelas, primeira: assinatura|data, dataPrimeira, entrada, livre } */
  function clausulaHonorarios(f) {
    const v = +f.valor || 0;
    let forma = "";
    if (f.modo === "avista") forma = "a serem pagos em parcela única, na data da assinatura do contrato";
    else if (f.modo === "parcelado") {
      const n = Math.max(1, +f.parcelas || 1), d = divisao(v, n);
      const venc = f.primeira === "data" && f.dataPrimeira ? "vencendo-se a primeira em " + dataBR(f.dataPrimeira) : "vencendo-se a primeira na data da assinatura do contrato";
      if (n === 1) forma = "a serem pagos em parcela única, " + venc.replace("vencendo-se a primeira", "com vencimento");
      else if (d.igual) forma = "a serem pagos em " + qtd(n, true) + " parcelas iguais de " + comExtenso(d.parcela) + ", " + venc + " e as demais em igual dia dos meses subsequentes";
      else forma = "a serem pagos em " + qtd(n, true) + " parcelas, sendo " + qtd(n - 1, true) + " de " + comExtenso(d.parcela) + " e a última de " + comExtenso(d.ultima) + ", " + venc + " e as demais em igual dia dos meses subsequentes";
    } else if (f.modo === "entrada") {
      const e = +f.entrada || 0, saldo = Math.max(0, v - e), n = Math.max(1, +f.parcelas || 1), d = divisao(saldo, n);
      const parc = n === 1 ? "em parcela única de " + comExtenso(saldo) + ", com vencimento em 30 (trinta) dias da assinatura do contrato" : "em " + qtd(n, true) + " parcelas " + (d.igual ? "iguais de " + comExtenso(d.parcela) : ", sendo " + qtd(n - 1, true) + " de " + comExtenso(d.parcela) + " e a última de " + comExtenso(d.ultima)) + ", vencendo-se a primeira em 30 (trinta) dias da assinatura do contrato e as demais em igual dia dos meses subsequentes";
      forma = "a serem pagos mediante entrada de " + comExtenso(e) + ", na data da assinatura do contrato, e o saldo de " + comExtenso(saldo) + " " + parc;
    } else forma = String(f.livre || "").trim().replace(/[.;\s]+$/, "");
    return "Para a prestação dos serviços descritos, propomos honorários no importe de " + comExtenso(v) + (forma ? ", " + forma : "") + ".";
  }
  function paragrafoEscopo(escopo) {
    const e = String(escopo || "").trim().replace(/[.;\s]+$/, "");
    return "A presente proposta tem por objeto a prestação de serviços advocatícios especializados voltados à atuação criminal, sendo escopo do trabalho " + e + ".";
  }

  /* ------------------------------------------------------------------ diagramação */
  const H = 842.003, ASC = 0.96875;
  const AMARELO = [0.95686, 0.93333, 0.56078], CINZA_CAPA = [0xc8 / 255, 0xc3 / 255, 0xbe / 255];
  function quebrar(txt, font, size, largura) {
    const palavras = txt.split(/\s+/).filter(Boolean), linhas = []; let atual = [];
    for (const p of palavras) {
      const teste = atual.concat(p).join(" ");
      if (!atual.length || font.widthOfTextAtSize(teste, size) <= largura) atual.push(p);
      else { linhas.push(atual); atual = [p]; }
    }
    if (atual.length) linhas.push(atual);
    return linhas;
  }
  function desenharLinha(page, palavras, x, y, largura, font, size, cor, justificar) {
    const { rgb } = root.PDFLib;
    if (!justificar || palavras.length < 2) { page.drawText(palavras.join(" "), { x, y, size, font, color: rgb(...cor) }); return; }
    const natural = palavras.reduce((s, p) => s + font.widthOfTextAtSize(p, size), 0);
    const vao = (largura - natural) / (palavras.length - 1);
    let cx = x;
    for (const p of palavras) { page.drawText(p, { x: cx, y, size, font, color: rgb(...cor) }); cx += font.widthOfTextAtSize(p, size) + vao; }
  }
  /* blocos: [{ txt, gapAntes (em linhas) }]; devolve a altura usada e desenha se page != null */
  function fluxo(page, blocos, x, topoPrimeiraLinha, largura, font, size, lh) {
    let base = topoPrimeiraLinha + ASC * size, primeira = true, ultimaBase = base;
    for (const b of blocos) {
      const linhas = quebrar(b.txt, font, size, largura);
      if (!primeira) base += lh * (1 + (b.gap || 0));
      linhas.forEach((ln, i) => {
        if (i > 0) base += lh;
        if (page) desenharLinha(page, ln, x, H - base, largura, font, size, [0, 0, 0], i < linhas.length - 1);
        ultimaBase = base;
      });
      primeira = false;
    }
    return ultimaBase;
  }
  const LIMITE_BASE = 690;
  function ajustar(medir) {
    for (let lh = 28.8; lh >= 15; lh -= 0.4) if (medir(lh) <= LIMITE_BASE) return { lh, cabe: true };
    return { lh: 15, cabe: false };
  }

  /* d = { cliente, data(Date), escopo, servicos[], clausula } */
  async function gerar(d, recursos) {
    const { PDFDocument, rgb } = root.PDFLib;
    const pdf = await PDFDocument.load(recursos.modelo);
    pdf.registerFontkit(root.fontkit);
    const reg = await pdf.embedFont(recursos.regular, { subset: true });
    const bold = await pdf.embedFont(recursos.bold, { subset: true });
    const pgs = pdf.getPages();
    const avisos = [];

    /* capa */
    const capa = pgs[0];
    capa.drawText(dataExtenso(d.data) + ".", { x: 62.4, y: H - (513.8 + ASC * 18.99), size: 18.99, font: bold, color: rgb(...CINZA_CAPA) });
    let tam = 20.01; const nome = String(d.cliente || "").trim();
    while (tam > 12 && bold.widthOfTextAtSize(nome, tam) > 500) tam -= 0.5;
    capa.drawText(nome, { x: 59.5, y: H - (668.5 + ASC * 20.01) - (20.01 - tam) * 0.3, size: tam, font: bold, color: rgb(...CINZA_CAPA) });

    /* descrição dos serviços */
    const p2 = pgs[1], S = 11.99;
    const blocos2 = [{ txt: paragrafoEscopo(d.escopo) }, { txt: "Os serviços incluirão:", gap: 1 }].concat(d.servicos.filter(s => s.trim()).map((s, i) => ({ txt: "• " + s.trim(), gap: i === 0 ? 1 : 0 })));
    const a2 = ajustar(lh => fluxo(null, blocos2, 36.2, 178.6, 530, reg, S, lh));
    fluxo(p2, blocos2, 36.2, 178.6, 530, reg, S, a2.lh);
    if (!a2.cabe) avisos.push("O escopo e a lista de serviços excedem o espaço da página 2. Reduza o texto para manter o layout.");

    /* honorários e tributos */
    const p3 = pgs[2];
    const blocos3 = [{ txt: d.clausula }, { txt: FIXO_P3[0], gap: 1 }, { txt: FIXO_P3[1], gap: 1 }];
    const medir3 = lh => { const ult = fluxo(null, blocos3, 33.7, 178.4, 530, reg, S, lh); const topoTit = ult - ASC * S + 32.9; return fluxo(null, [{ txt: TRIBUTOS }], 33.7, topoTit + 72.3, 530, reg, S, lh); };
    const a3 = ajustar(medir3);
    const ult = fluxo(p3, blocos3, 33.7, 178.4, 530, reg, S, a3.lh);
    const topoTit = ult - ASC * S + 32.9;
    p3.drawText("Tributos", { x: 35.6, y: H - (topoTit + ASC * 20.01), size: 20.01, font: bold, color: rgb(0, 0, 0) });
    p3.drawLine({ start: { x: 35.6, y: H - (topoTit + 33.6) }, end: { x: 269.1, y: H - (topoTit + 33.6) }, thickness: 2.24, color: rgb(...AMARELO) });
    fluxo(p3, [{ txt: TRIBUTOS }], 33.7, topoTit + 72.3, 530, reg, S, a3.lh);
    if (!a3.cabe) avisos.push("A cláusula de honorários excede o espaço da página 3. Reduza o texto para manter o layout.");

    pdf.setTitle("Proposta Atuação Criminal" + (nome ? " · " + nome : ""));
    pdf.setAuthor("TPC Advogados"); pdf.setCreator("HUB Criminal TPC"); pdf.setProducer("HUB Criminal TPC");
    return { bytes: await pdf.save(), avisos };
  }
  function nomeArquivo(cliente, data) {
    const partes = String(cliente || "").trim().split(/\s+/).filter(p => !/^(da|de|do|das|dos|e)$/i.test(p));
    const sob = (partes[partes.length - 1] || "CLIENTE").normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase().replace(/[^A-Z0-9]/g, "");
    const dd = String(data.getUTCDate()).padStart(2, "0"), mm = String(data.getUTCMonth() + 1).padStart(2, "0"), aa = String(data.getUTCFullYear()).slice(-2);
    return "Proposta_" + sob + "_" + dd + "_" + mm + "_" + aa + ".pdf";
  }

  root.PROPOSTA = { gerar, clausulaHonorarios, paragrafoEscopo, reais, inteiro, brl, comExtenso, dataExtenso, nomeArquivo, SERVICOS_PADRAO, ESCOPO_EXEMPLO };
})(typeof window !== "undefined" ? window : globalThis);
