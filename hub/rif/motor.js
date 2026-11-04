/* Motor de análise defensiva de RIF (COAF).
   Lê os três CSV (Comunicações, Envolvidos, Ocorrências), reconstrói os fluxos a partir das seções do relato
   bancário (remetentes x destinatários), separa recursos próprios ou neutros, aponta dupla contagem, comunicações
   automáticas, inconsistências de cadastro e de arquivo, e prepara a base para o confronto com o relatório policial.
   Todo o processamento ocorre no navegador. */
(function (root) {
  "use strict";

  /* ------------------------------------------------------------------ utilidades */
  const digits = s => String(s == null ? "" : s).replace(/\D/g, "");
  function fmtDoc(d) {
    d = digits(d);
    if (d.length === 11) return d.slice(0, 3) + "." + d.slice(3, 6) + "." + d.slice(6, 9) + "-" + d.slice(9);
    if (d.length === 14) return d.slice(0, 2) + "." + d.slice(2, 5) + "." + d.slice(5, 8) + "/" + d.slice(8, 12) + "-" + d.slice(12);
    return d;
  }
  function validDoc(d) {
    d = digits(d);
    if (d.length === 11) {
      if (/^(\d)\1+$/.test(d)) return false;
      for (const n of [9, 10]) { let s = 0; for (let i = 0; i < n; i++) s += +d[i] * (n + 1 - i); if ((s * 10 % 11) % 10 !== +d[n]) return false; }
      return true;
    }
    if (d.length === 14) {
      const w1 = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2], w2 = [6].concat(w1);
      for (const [w, n] of [[w1, 12], [w2, 13]]) { let s = 0; for (let i = 0; i < n; i++) s += +d[i] * w[i]; const r = s % 11; if ((r < 2 ? 0 : 11 - r) !== +d[n]) return false; }
      return true;
    }
    return false;
  }
  function money(s) {
    s = String(s == null ? "" : s).trim();
    if (!s || s === "-" || /^nan$/i.test(s)) return 0;
    const n = parseFloat(s.replace(/\./g, "").replace(",", "."));
    return isNaN(n) ? 0 : n;
  }
  function pDate(s) { const m = /(\d{2})[\/.](\d{2})[\/.](\d{4})/.exec(String(s || "")); return m ? new Date(Date.UTC(+m[3], +m[2] - 1, +m[1])) : null; }
  const dBR = d => (d ? d.toISOString().slice(0, 10).split("-").reverse().join("/") : "—");
  const isPJ = d => digits(d).length === 14;
  const sem = s => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase();
  const meses = (a, b) => (a && b ? Math.max(1, Math.round((b - a) / (864e5 * 30.4375))) : null);
  const BRL = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
  const brl = v => (v == null || isNaN(v) ? "—" : BRL.format(v));
  const perto = (a, b, tol) => Math.abs(a - b) <= Math.max(1, (tol || 0.005) * Math.max(Math.abs(a), Math.abs(b)));

  /* ------------------------------------------------------------------ leitura dos arquivos */
  async function sha256(buf) {
    if (!(root.crypto && root.crypto.subtle)) return null;
    const h = await root.crypto.subtle.digest("SHA-256", buf);
    return Array.from(new Uint8Array(h)).map(b => b.toString(16).padStart(2, "0")).join("");
  }
  function decodificar(buf) {
    try { return { texto: new TextDecoder("utf-8", { fatal: true }).decode(buf), codificacao: "UTF-8" }; }
    catch (e) { return { texto: new TextDecoder("windows-1252").decode(buf), codificacao: "Windows-1252 (ANSI)" }; }
  }
  function parseCSV(text, delim) {
    delim = delim || ";";
    const rows = []; let row = [], f = "", q = false;
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (q) { if (c === '"') { if (text[i + 1] === '"') { f += '"'; i++; } else q = false; } else f += c; }
      else if (c === '"') q = true;
      else if (c === delim) { row.push(f); f = ""; }
      else if (c === "\n") { row.push(f.replace(/\r$/, "")); rows.push(row); row = []; f = ""; }
      else f += c;
    }
    if (f || row.length) { row.push(f.replace(/\r$/, "")); rows.push(row); }
    const head = (rows.shift() || []).map(h => h.replace(/^﻿/, "").trim());
    const dados = rows.filter(r => /^\d+$/.test((r[0] || "").trim())).map(r => Object.fromEntries(head.map((h, i) => [h, (r[i] == null ? "" : r[i]).trim()])));
    const extras = rows.filter(r => !/^\d+$/.test((r[0] || "").trim())).map(r => r.join(";").replace(/;+$/, "").trim()).filter(Boolean);
    return { head, dados, extras };
  }
  /* Código de controle ao final do arquivo (32 hexadecimais) e conferência com as formas usuais de cálculo do MD5. */
  async function controleArquivo(buf, texto) {
    const m = /(?:^|\r?\n)([0-9a-fA-F]{32});*\s*$/.exec(texto);
    const r = { codigo: m ? m[1].toLowerCase() : null, confere: null, sha256: await sha256(buf) };
    if (!m || !root.CC_MD5) return r;
    const corpo = texto.slice(0, m.index);
    const linhas = corpo.split(/\r?\n/);
    const enc = s => new TextEncoder().encode(s);
    const variantes = [];
    for (let k = 0; k <= 2; k++) {
      const sub = k ? linhas.slice(0, linhas.length - k) : linhas;
      for (const sep of ["\r\n", "\n"]) for (const fim of ["", sep]) variantes.push(sub.join(sep) + fim);
    }
    const bytes = new Uint8Array(buf);
    const fimBin = (() => { const t = texto.lastIndexOf(m[1]); return t; })();
    const tentativas = variantes.map(enc);
    if (fimBin > 0) tentativas.push(bytes.slice(0, Math.max(0, bytes.length - (texto.length - fimBin))));
    r.confere = tentativas.some(b => root.CC_MD5(b) === r.codigo);
    return r;
  }

  /* ------------------------------------------------------------------ catálogo das ocorrências */
  function codigoOc(o) {
    const m = /^\s*-?\s*([IVX]+)\s*[-–]\s*(\w+)\)/.exec(o);
    if (m) return m[1] + "-" + m[2];
    if (/espécie de valor igual ou superior/i.test(o)) return "Espécie ≥ R$ 50 mil";
    return "Outro";
  }
  function normaOc(o) {
    if (/3\.542/.test(o)) return "Carta-Circular BCB 3.542/2012";
    if (/4\.001/.test(o)) return "Carta-Circular BCB 4.001/2020";
    if (/3\.461/.test(o)) return "Circular BCB 3.461/2009";
    if (/CVM/.test(o)) return "Instrução CVM";
    return "";
  }
  const descOc = o => o.replace(/,?\s*(-\s*)?Banco Central do Brasil.*$/s, "").replace(/^\s*-\s*/, "").trim();
  /* Leitura defensiva de cada hipótese: o que ela é e o que ela não demonstra. */
  const LEITURA_OC = [
    [/incompat[ií]vel com o patrim[oô]nio|incompatibilidade com a sua capacidade|incompat[ií]veis com o faturamento/i, "Hipótese de incompatibilidade aferida pelo banco com base no cadastro do cliente. Depende da atualidade e da completude da renda e do patrimônio cadastrados, que não são verificados pelo COAF."],
    [/esp[ée]cie/i, "Enquadramento ligado ao uso de espécie. Operação em espécie é lícita; o enquadramento indica atipicidade em relação ao perfil cadastral, e não origem ilícita."],
    [/diversas origens|v[áa]rias origens/i, "Diversidade de remetentes. Compatível com atividades que recebem de muitos clientes ou com rateios familiares; exige contextualização."],
    [/burla|artif[ií]cio/i, "Hipótese de burla da identificação formulada pelo banco a partir da habitualidade ou da forma das operações; não há afirmação de ocultação efetiva."],
    [/benefici[áa]rio final|terceiros/i, "Hipótese relativa a terceiros ou beneficiário final; o banco registra a impossibilidade de identificação, e não a identificação de um beneficiário oculto."],
    [/imediato d[ée]bito|imediata compra/i, "Crédito seguido de débito. Padrão comum em contas de pagamento de despesas, folha, fornecedores ou repasses familiares."],
    [/pouco movimentada|dep[óo]sito inusitado/i, "Mudança de padrão da conta. Pode decorrer de evento lícito pontual (venda de bem, herança, rescisão, empréstimo)."],
    [/agentes p[úu]blicos/i, "Enquadramento pela condição de agente público do cliente. Não decorre de característica da operação, mas da qualificação cadastral."],
    [/resist[êe]ncia ao fornecimento/i, "Registro de dificuldade cadastral relatada pelo banco, sem indicação concreta da informação recusada."],
    [/regi[õo]es de risco|munic[ií]pios/i, "Critério geográfico genérico, não relacionado a conduta do cliente."]
  ];
  const leituraOc = o => { const x = LEITURA_OC.find(([r]) => r.test(o)); return x ? x[1] : "Hipótese de atipicidade indicada pelo comunicante, que não equivale a indício de crime."; };

  /* ------------------------------------------------------------------ leitura do relato bancário */
  const RX_DOC = /(\d{2,3}\.\d{3}\.\d{3}\/\d{4}-\d{2}|\d{3}\.\d{3}\.\d{3}-\d{2}|\d{3}\.\d{3}\.\d{3}--)/g;
  const CRED_NEUTRO = [
    [/RESGATE/, "resgate de aplicação (recursos do próprio titular)"],
    [/EMPRESTIMO|FINANCIAMENTO/, "empréstimo ou financiamento bancário"],
    [/ESTORNO/, "estorno"],
    [/CHEQUE DEVOLVIDO|DOC\/TED DEVOLVIDO|DEVOLVID/, "devolução de cheque ou de transferência (o valor retorna à conta)"],
    [/JUROS/, "juros ou rendimentos de aplicação"]
  ];
  const DEB_ORDINARIO = /IMPOSTO|TARIFA|ENCARGO|ENERGIA|AGUA|TELEFONE|SEGURO|CARTAO DE CREDITO|COMPRAS|BLOQUEIO JUDICIAL|DEBITOS DIVERSOS|AUTO ATENDIMENTO/;
  const DEB_PROPRIO = [[/^APLICAC/, "aplicação financeira do próprio titular"], [/EMPRESTIMO|FINANCIAMENTO/, "pagamento de empréstimo ou financiamento"], [/ESTORNO|DEVOLUCAO/, "estorno ou devolução"]];
  const ESPECULATIVO = /segundo informa[çc][õo]es|aparentemente|suspeita-se|suspeitamos|poss[ií]vel|possibilidade|podendo configurar|pode(m)? (ser|configurar|estar)|a princ[ií]pio|sem v[ií]nculo aparente|sem aparente|n[ãa]o percebemos|teria\b|seria\b|n[ãa]o foi poss[ií]vel|fontes? (abertas|externas)|pesquisa realizada em fontes|chamou aten[çc][ãa]o|sugerindo|por entender que possam/gi;
  const EXPLICACAO_LICITA = [
    /fornecedores do marido|atividade empresarial|atividade da empresa|relacionad[oa]s? a(o)? atividade|pagamento de empregados|folha de pagamento/i,
    /s[óo]ci[oa] (nas|da|das|de) empresa|participa[çc][ãa]o(\(?[õo]es\)?)? em empresa/i,
    /mesma titularidade/i
  ];

  function secoes(tx) {
    const U = sem(tx);
    const pos = (re, de) => { re.lastIndex = 0; const r = new RegExp(re.source, "g"); r.lastIndex = de || 0; const m = r.exec(U); return m ? m.index : -1; };
    const iCred = pos(/RESUMO (DOS PRINCIPAIS )?(DE )?LAN.{1,2}AMENTOS A CR.{1,2}DITO/);
    const iRem = pos(/PRINCIPAIS REMETENTES/);
    const iDeb = pos(/RESUMO (DOS PRINCIPAIS )?(DE )?LAN.{1,2}AMENTOS A D.{1,2}BITO/);
    const iDes = pos(/PRINCIPAIS DESTINAT.{1,2}RIOS/);
    const marcos = [iCred, iRem, iDeb, iDes].filter(x => x >= 0);
    const fimDe = i => { const prox = marcos.filter(x => x > i).sort((a, b) => a - b)[0]; return prox == null ? -1 : prox; };
    let fimDes = -1;
    if (iDes >= 0) {
      const r = /(SEGUNDO INFORMA|INFORMA.{1,4}ES (ADICIONAIS|COMPLEMENTARES)|ANALISADA |ANALISADO |O ANALISADO|A ANALISADA|MOVIMENTACAO (ATIPICA|FINANCEIRA)|COMUNICAMOS|DENTRE OS ENVOLVIDOS|CHAMOU ATENCAO|CONSIDERANDO QUE|INFORMACOES:)/g;
      r.lastIndex = iDes + 30; const m = r.exec(U); fimDes = m ? m.index : U.length;
    }
    return {
      cred: iCred >= 0 ? [iCred, fimDe(iCred) >= 0 ? fimDe(iCred) : U.length] : null,
      rem: iRem >= 0 ? [iRem, fimDe(iRem) >= 0 ? fimDe(iRem) : U.length] : null,
      deb: iDeb >= 0 ? [iDeb, fimDe(iDeb) >= 0 ? fimDe(iDeb) : U.length] : null,
      des: iDes >= 0 ? [iDes, fimDes] : null
    };
  }
  function tiposLancamento(trecho) {
    const out = []; const r = /(\d+)\s+([A-ZÀ-Üa-zà-ü\/][A-ZÀ-Üa-zà-ü\/ ]{2,40}?)\s*-\s*R\$\s*([\d.]+,\d{2})/g; let m;
    while ((m = r.exec(trecho))) out.push({ qtd: +m[1], tipo: sem(m[2]).trim(), valor: money(m[3]) });
    return out;
  }
  function contrapartes(trecho, sentido, base) {
    const out = [];
    const r = /([A-ZÀ-Üa-zà-ü][A-ZÀ-Üa-zà-ü0-9&.'\/ \-–]{1,110}?)\s*[-–,]?\s*(\d{2,3}\.\d{3}\.\d{3}\/\d{4}-\d{2}|\d{3}\.\d{3}\.\d{3}-\d{2}|\d{3}\.\d{3}\.\d{3}--)?\s*(?:\(([^)]{0,140})\))?\s*(?:-\s*MIDIA\s*)?-?\s*(\d+)\s*lan.{1,2}amento\(s\)\s*no total de:\s*R\$\s*([\d.]+,\d{2})/gi;
    let m;
    while ((m = r.exec(trecho))) {
      let nome = m[1].replace(/^\s*(identificados:|recursos identificados:)\s*/i, "").replace(/[\s\-–,]+$/, "").replace(/\s+/g, " ").trim();
      nome = nome.replace(/^(.*?:\s*)/, "").trim();
      const qual = (m[3] || "").replace(/\s+/g, " ").trim();
      const mesma = /MESMA TITULARI/i.test(nome) || /MESMA TITULARI/i.test(qual);
      out.push({ nome, doc: m[2] ? digits(m[2]) : "", docTexto: m[2] || "", qualificacao: qual, n: +m[4], valor: money(m[5]), sentido, mesmaTitularidade: mesma, ini: base + m.index, fim: base + m.index + m[0].length, trecho: m[0].trim() });
    }
    return out;
  }
  function lerRelato(c) {
    const tx = c.texto;
    const sec = secoes(tx);
    const fatia = s => (s ? tx.slice(s[0], s[1]) : "");
    const r = { secoes: sec, credTipos: tiposLancamento(fatia(sec.cred)), debTipos: tiposLancamento(fatia(sec.deb)), remetentes: [], destinatarios: [] };
    if (sec.rem) r.remetentes = contrapartes(fatia(sec.rem), "entrada", sec.rem[0]);
    if (sec.des) r.destinatarios = contrapartes(fatia(sec.des), "saída", sec.des[0]);
    const tCred = /lan.{1,2}amentos a cr.{1,2}dito[^|]*\|\s*Total\s*R\$\s*([\d.]+,\d{2})/i.exec(tx);
    const tDeb = /lan.{1,2}amentos a d.{1,2}bito[^|]*\|\s*Total\s*R\$\s*([\d.]+,\d{2})/i.exec(tx);
    r.totalCredTexto = tCred ? money(tCred[1]) : null;
    r.totalDebTexto = tDeb ? money(tDeb[1]) : null;
    const per = /Per[íi?]+odo analisado:\s*(\d{2}\/\d{2}\/\d{4})\s*-\s*(\d{2}\/\d{2}\/\d{4})/i.exec(tx);
    r.periodoTexto = per ? [pDate(per[1]), pDate(per[2])] : null;
    const desde = /cliente deste Banco desde\s*(\d{2}\/\d{2}\/\d{4})/i.exec(tx);
    r.clienteDesde = desde ? pDate(desde[1]) : null;
    r.rendas = [];
    const rr = /(rendimentos?|renda)(?: totais)?(?: mensais)?(?: no total)? de\s*R\$\s*([\d.]+,\d{2})(?:\s*em\s*(\d{2}[.\/]\d{2}[.\/]\d{4}))?/gi; let m;
    while ((m = rr.exec(tx))) r.rendas.push({ valor: money(m[2]), data: m[3] ? pDate(m[3]) : null, ini: m.index, fim: m.index + m[0].length });
    const fat = /faturamento (anual|mensal|presumido)?\s*(?:é\s*)?de\s*R\$\s*([\d.]+,\d{2})(?:\s*(?:em|\(atualiza[çc][ãa]o em)\s*(\d{2}[.\/]\d{2}[.\/]\d{4}))?/gi;
    r.faturamentos = [];
    while ((m = fat.exec(tx))) r.faturamentos.push({ tipo: (m[1] || "").toLowerCase(), valor: money(m[2]), data: m[3] ? pDate(m[3]) : null, ini: m.index, fim: m.index + m[0].length, proprio: !/empresa .{0,80}$/i.test(tx.slice(Math.max(0, m.index - 160), m.index)) || /cliente deste banco desde .{0,80}explorando/i.test(tx.slice(0, m.index)) });
    const ocup = /cadastrad[oa] como:?\s*([^,.;]{3,120}?)(?:,|\s+percebendo|\s+com\s+faturamento|\s+e\s+residente)/i.exec(tx);
    r.ocupacao = ocup ? ocup[1].replace(/\s+/g, " ").trim() : (/explorando a atividade de\s*([^,]+)/i.exec(tx) || [])[1] || "";
    r.contasAnalisadasVazio = /Contas analisadas:\s*(Resumo|$)/i.test(tx.replace(/\s+/g, " "));
    r.especulativos = []; ESPECULATIVO.lastIndex = 0;
    while ((m = ESPECULATIVO.exec(tx))) r.especulativos.push({ termo: m[0], ini: m.index, fim: m.index + m[0].length });
    r.fontesAbertas = /fontes? (abertas|externas)|Portal TCU|Fonte:/i.test(tx);
    r.explicacoes = [];
    for (const re of EXPLICACAO_LICITA) { const x = re.exec(tx); if (x) r.explicacoes.push({ ini: x.index, fim: x.index + x[0].length, termo: x[0] }); }
    r.semVinculo = /n[ãa]o foi poss[ií]vel estabelecer v[ií]nculo/i.test(tx);
    r.sociedades = [];
    const soc = /(s[óo]ci[oa]s? (nas|na|da|das|de) empresas?|participa[çc][ãa]o(\(?[õo]es\)?)? em empresa\(?s?\)?|[ée] titular da empresa)[:\s]*([\s\S]{0,260})/gi;
    while ((m = soc.exec(tx))) { const d = m[4].match(/\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}/g) || []; for (const x of d) r.sociedades.push(digits(x)); }
    r.docsNoTexto = []; RX_DOC.lastIndex = 0;
    while ((m = RX_DOC.exec(tx))) r.docsNoTexto.push({ texto: m[1], doc: digits(m[1]), ini: m.index });
    return r;
  }

  /* ------------------------------------------------------------------ análise */
  function construir(arqs) {
    const com = arqs.com.dados.map(r => {
      const seg = parseInt(r.CodigoSegmento, 10) || 0;
      return {
        idx: +r.Indexador, id: (r.idComunicacao || "").replace(/\.0$/, ""), ocBC: r.NumeroOcorrenciaBC || "",
        receb: pDate(r.Data_do_Recebimento), recebTxt: r.Data_do_Recebimento, ini: pDate(r.Data_da_operacao), fim: pDate(r.DataFimFato),
        comunicante: r.nomeComunicante, cnpjCom: r.cpfCnpjComunicante, cidade: r.CidadeAgencia, uf: r.UFAgencia, agencia: r.NomeAgencia, numAg: r.NumeroAgencia,
        texto: (r.informacoesAdicionais || "").replace(/\s+/g, " ").trim(),
        A: money(r.CampoA), B: money(r.CampoB), C: money(r.CampoC), D: money(r.CampoD), E: money(r.CampoE), seg,
        raw: { A: r.CampoA, oc: r.NumeroOcorrenciaBC }
      };
    }).sort((a, b) => a.idx - b.idx);
    const env = arqs.env.dados.map(r => ({
      idx: +r.Indexador, doc: digits(r.cpfCnpjEnvolvido), docTxt: (r.cpfCnpjEnvolvido || "").trim(), nome: (r.nomeEnvolvido || "").trim().replace(/\s+/g, " "), tipo: (r.tipoEnvolvido || "").trim(),
      ag: r.agenciaEnvolvido, conta: r.contaEnvolvido, abertura: pDate(r.DataAberturaConta), atualizacao: pDate(r.DataAtualizacaoConta),
      pep: (r.bitPepCitado || "").trim(), obrigada: (r.bitPessoaObrigadaCitado || "").trim(), serv: (r.intServidorCitado || "").trim()
    }));
    const oco = arqs.oco.dados.map(r => ({ idx: +r.Indexador, id: (r.idOcorrencia || "").trim(), txt: (r.Ocorrencia || "").trim() }))
      .map(o => Object.assign(o, { codigo: codigoOc(o.txt), norma: normaOc(o.txt), desc: descOc(o.txt), leitura: leituraOc(o.txt) }));
    const byIdx = new Map(com.map(c => [c.idx, c]));
    for (const c of com) {
      c.ocs = oco.filter(o => o.idx === c.idx);
      c.env = env.filter(e => e.idx === c.idx);
      c.titular = c.env.find(e => e.tipo === "Titular") || null;
      c.relato = lerRelato(c);
      c.automatica = c.seg === 42 || c.seg === 17 || /igual ou superior/i.test(c.ocs.map(o => o.txt).join(" "));
    }
    /* entidades */
    const ents = new Map();
    const ent = (doc, nome) => {
      if (!doc) return null;
      let x = ents.get(doc);
      if (!x) { x = { doc, nome, nomes: new Set(), papeis: new Set(), idx: new Set(), titularEm: [], qualificacoes: new Map(), serv: new Set(), pep: new Set() }; ents.set(doc, x); }
      if (nome) x.nomes.add(nome.replace(/\s+/g, " ").trim().toUpperCase());
      return x;
    };
    for (const e of env) { const x = ent(e.doc, e.nome); if (!x) continue; x.papeis.add(e.tipo); x.idx.add(e.idx); if (e.tipo === "Titular") x.titularEm.push(e.idx); if (e.serv && e.serv !== "-") x.serv.add(e.serv.toUpperCase()); if (e.pep && e.pep !== "-") x.pep.add(e.pep); }
    for (const c of com) for (const cp of c.relato.remetentes.concat(c.relato.destinatarios)) {
      if (!cp.doc) continue;
      const x = ent(cp.doc, cp.nome); x.idx.add(c.idx);
      if (cp.qualificacao) { const q = cp.qualificacao.replace(/\|\s*COMUNICADO/i, "").replace(/\s*-\s*$/, "").trim().toUpperCase(); if (q) { const l = x.qualificacoes.get(q) || new Set(); l.add(c.idx); x.qualificacoes.set(q, l); } }
    }
    const nomeDe = d => { const x = ents.get(d); return x ? (x.nome || [...x.nomes][0] || fmtDoc(d)) : fmtDoc(d); };

    /* fluxos lidos por seção */
    const fluxos = [];
    for (const c of com) {
      const t = c.titular; if (!t) continue;
      for (const cp of c.relato.remetentes) fluxos.push({ idx: c.idx, de: cp.mesmaTitularidade ? t.doc : cp.doc, para: t.doc, valor: cp.valor, n: cp.n, nomeContraparte: cp.nome, mesma: cp.mesmaTitularidade, docCitado: cp.doc, sentidoFonte: "seção “principais remetentes/depositantes” do relato", cp, c });
      for (const cp of c.relato.destinatarios) fluxos.push({ idx: c.idx, de: t.doc, para: cp.mesmaTitularidade ? t.doc : cp.doc, valor: cp.valor, n: cp.n, nomeContraparte: cp.nome, mesma: cp.mesmaTitularidade, docCitado: cp.doc, sentidoFonte: "seção “principais destinatários” do relato", cp, c });
      if (c.automatica) {
        const dep = c.env.filter(e => /Depositante|Sacador|Portador/i.test(e.tipo));
        for (const d of dep) fluxos.push({ idx: c.idx, de: /Depositante/i.test(d.tipo) ? d.doc : t.doc, para: /Depositante/i.test(d.tipo) ? t.doc : d.doc, valor: /Depositante/i.test(d.tipo) ? (c.B || c.A) : (c.C || c.D || c.A), n: 1, nomeContraparte: d.nome, especie: true, sentidoFonte: "comunicação automática de operação em espécie (" + d.tipo.toLowerCase() + ")", c });
      }
    }
    for (const f of fluxos) f.semDoc = !f.de || !f.para;

    /* titulares e leitura econômica */
    const titulares = new Map();
    for (const c of com) {
      const t = c.titular; if (!t) continue;
      const T = titulares.get(t.doc) || { doc: t.doc, nome: t.nome, coms: [], pj: isPJ(t.doc) };
      T.coms.push(c); titulares.set(t.doc, T);
    }
    for (const c of com) {
      const R = c.relato, t = c.titular;
      const mm = meses(c.ini, c.fim);
      const credNeutro = []; let vNeutro = 0;
      for (const l of R.credTipos) for (const [re, rot] of CRED_NEUTRO) if (re.test(l.tipo)) { credNeutro.push(Object.assign({ motivo: rot }, l)); vNeutro += l.valor; break; }
      const mesmaCred = R.remetentes.filter(x => x.mesmaTitularidade).reduce((s, x) => s + x.valor, 0);
      const mesmaDeb = R.destinatarios.filter(x => x.mesmaTitularidade).reduce((s, x) => s + x.valor, 0);
      const debProprio = []; let vDebProprio = 0, vDebOrd = 0;
      for (const l of R.debTipos) { let ok = false; for (const [re, rot] of DEB_PROPRIO) if (re.test(l.tipo)) { debProprio.push(Object.assign({ motivo: rot }, l)); vDebProprio += l.valor; ok = true; break; } if (!ok && DEB_ORDINARIO.test(l.tipo)) vDebOrd += l.valor; }
      const credTerceiros = Math.max(0, c.B - vNeutro - mesmaCred);
      const renda = R.rendas.length ? R.rendas[0] : null;
      const rendaPeriodo = renda && mm ? renda.valor * mm : null;
      const fatProprio = R.faturamentos.find(f => f.proprio && (f.tipo === "anual" || !f.tipo));
      const fatPeriodo = fatProprio && mm ? fatProprio.valor * mm / 12 : null;
      const atualizacao = t && t.atualizacao ? t.atualizacao : null;
      c.economia = {
        meses: mm, credNeutro, vNeutro, mesmaCred, mesmaDeb, debProprio, vDebProprio, vDebOrd, credTerceiros, renda, rendaPeriodo,
        rendaDesatualizada: !c.automatica && (!!(renda && renda.data && c.ini && (c.ini - renda.data) > 365 * 864e5) || !!(atualizacao && c.ini && (c.ini - atualizacao) > 365 * 864e5)),
        atualizacao, faturamento: fatProprio || null, fatPeriodo,
        compativelFaturamento: !!(fatPeriodo && c.B <= fatPeriodo * 1.1),
        excedente: rendaPeriodo != null && !t ? null : (rendaPeriodo != null ? credTerceiros - rendaPeriodo : null),
        volumeDobrado: c.seg === 41 && c.B > 0 && c.C > 0 && perto(c.A, c.B + c.C, 0.002),
        simetrico: c.B > 0 && c.C > 0 && Math.abs(c.B - c.C) < 1
      };
    }

    /* fluxos entre titulares e ida e volta */
    const titSet = new Set(titulares.keys());
    const entreTitulares = fluxos.filter(f => !f.mesma && titSet.has(f.de) && titSet.has(f.para) && f.de !== f.para);
    const pares = new Map();
    for (const f of entreTitulares) {
      const k = [f.de, f.para].sort().join("|");
      const p = pares.get(k) || { a: [f.de, f.para].sort()[0], b: [f.de, f.para].sort()[1], fluxos: [] };
      p.fluxos.push(f); pares.set(k, p);
    }
    const duplicidades = [];
    for (const p of pares.values()) {
      /* o mesmo dinheiro aparece duas vezes quando relatado pela conta de origem e pela conta de destino em períodos sobrepostos */
      const porDirecao = {};
      for (const f of p.fluxos) { const k = f.de + ">" + f.para; (porDirecao[k] = porDirecao[k] || []).push(f); }
      for (const k in porDirecao) {
        const l = porDirecao[k];
        const lados = new Set(l.map(f => f.c.titular.doc));
        if (lados.size > 1) {
          const visto = l.filter(f => f.c.titular.doc === f.de), recebido = l.filter(f => f.c.titular.doc === f.para);
          for (const x of visto) for (const y of recebido) {
            const sobrepoe = x.c.ini && y.c.ini && x.c.ini <= y.c.fim && y.c.ini <= x.c.fim;
            if (sobrepoe) duplicidades.push({ de: x.de, para: x.para, origem: x, destino: y, menor: Math.min(x.valor, y.valor) });
          }
        }
      }
      const ida = p.fluxos.filter(f => f.de === p.a), volta = p.fluxos.filter(f => f.de === p.b);
      p.ida = ida.reduce((s, f) => s + f.valor, 0); p.volta = volta.reduce((s, f) => s + f.valor, 0);
      p.idaEVolta = ida.length > 0 && volta.length > 0;
      p.liquido = Math.abs(p.ida - p.volta);
    }

    /* totais e reconciliação */
    const tot = {
      ncom: com.length, nenv: new Set(env.map(e => e.doc).filter(Boolean)).size, ntit: titulares.size,
      somaA: com.reduce((s, c) => s + c.A, 0), cred: com.reduce((s, c) => s + c.B, 0), deb: com.reduce((s, c) => s + c.C, 0),
      neutros: com.reduce((s, c) => s + c.economia.vNeutro + c.economia.mesmaCred, 0),
      automaticas: com.filter(c => c.automatica), entreTit: entreTitulares.reduce((s, f) => s + f.valor, 0),
      duplicado: duplicidades.reduce((s, d) => s + d.menor, 0),
      ini: com.reduce((m, c) => (!m || (c.ini && c.ini < m) ? c.ini : m), null), fim: com.reduce((m, c) => (!m || (c.fim && c.fim > m) ? c.fim : m), null)
    };
    tot.credSuspeitasSemAuto = com.filter(c => !c.automatica).reduce((s, c) => s + c.B, 0);
    tot.credTerceiros = com.filter(c => !c.automatica).reduce((s, c) => s + c.economia.credTerceiros, 0);

    const ds = { com, env, oco, ents, fluxos, titulares, pares: [...pares.values()], duplicidades, tot, arqs, nomeDe, byIdx };
    ds.inconsistencias = inconsistencias(ds);
    ds.pontos = pontosFavoraveis(ds);
    return ds;
  }

  /* ------------------------------------------------------------------ inconsistências do RIF */
  function inconsistencias(ds) {
    const out = [];
    const add = (grav, cat, titulo, texto, idxs, extra) => out.push(Object.assign({ grav, cat, titulo, texto, idxs: idxs || [] }, extra || {}));
    const { com, env, ents, arqs } = ds;
    /* arquivos */
    for (const [k, rot] of [["com", "Comunicações"], ["env", "Envolvidos"], ["oco", "Ocorrências"]]) {
      const a = arqs[k];
      if (a.controle && a.controle.codigo && a.controle.confere === false) add("relevante", "Integridade dos arquivos", "Código de controle não confere (" + rot + ")", "O arquivo termina com o código " + a.controle.codigo + ", mas o MD5 calculado sobre o conteúdo recebido não coincide com ele nas formas usuais de cálculo. O resultado não prova adulteração, porque o algoritmo exato do COAF não é público, mas impõe a requisição dos arquivos originais, com a comprovação de sua integridade.", []);
      if (a.controle && !a.controle.codigo) add("relevante", "Integridade dos arquivos", "Arquivo sem código de controle (" + rot + ")", "O arquivo não traz o código de controle que acompanha os arquivos gerados pelo COAF, o que sugere tratar-se de cópia reprocessada, e não do arquivo original.", []);
    }
    const cient = com.filter(c => /E\+/i.test(c.raw.oc) || /E\+/i.test(c.raw.A || ""));
    if (cient.length) add("critico", "Integridade dos arquivos", "Arquivo alterado em planilha eletrônica", "Em " + cient.length + " comunicação(ões) o número da ocorrência no Banco Central aparece em notação científica (por exemplo, " + cient[0].raw.oc + "). Esse formato surge quando o arquivo é aberto e salvo em planilha eletrônica, o que altera dados de forma irreversível. O material juntado não é, portanto, o arquivo original do COAF, e a cadeia de custódia do dado financeiro está comprometida.", cient.map(c => c.idx));
    const corromp = com.filter(c => /\?\?/.test(c.texto) || /�/.test(c.texto));
    if (corromp.length) add("relevante", "Integridade dos arquivos", "Texto com acentuação corrompida", "O relato das comunicações " + corromp.map(c => c.idx).join(", ") + " contém caracteres corrompidos, sinal de conversão de codificação após a geração do arquivo.", corromp.map(c => c.idx));
    /* totais */
    for (const c of com) {
      if (c.seg === 41 && c.B + c.C > 0 && !perto(c.A, c.B + c.C, 0.002)) add("relevante", "Valores", "Total diferente de crédito mais débito", "Na comunicação " + c.idx + ", o CampoA (" + brl(c.A) + ") não corresponde à soma de créditos (" + brl(c.B) + ") e débitos (" + brl(c.C) + ").", [c.idx]);
      const R = c.relato;
      if (R.totalCredTexto != null && Math.abs(R.totalCredTexto - c.B) > Math.max(5, 0.002 * c.B)) add("relevante", "Valores", "Crédito do relato diverge do campo estruturado", "Na comunicação " + c.idx + ", o relato informa créditos de " + brl(R.totalCredTexto) + ", mas o CampoB registra " + brl(c.B) + ".", [c.idx]);
      if (R.periodoTexto && c.ini && c.fim && (Math.abs(R.periodoTexto[0] - c.ini) > 864e5 || Math.abs(R.periodoTexto[1] - c.fim) > 864e5)) add("relevante", "Datas", "Período do relato diverge do período estruturado", "Na comunicação " + c.idx + ", o relato indica o período de " + dBR(R.periodoTexto[0]) + " a " + dBR(R.periodoTexto[1]) + ", mas os campos estruturados indicam " + dBR(c.ini) + " a " + dBR(c.fim) + ".", [c.idx]);
      if (R.contasAnalisadasVazio) add("informativa", "Identificação da conta", "Conta analisada não identificada no relato", "Na comunicação " + c.idx + ", o campo “Contas analisadas” do relato está em branco; a conta consta apenas do arquivo de envolvidos.", [c.idx]);
      if (c.receb && c.fim) { const dias = Math.round((c.receb - c.fim) / 864e5); if (dias > 60) add("informativa", "Datas", "Comunicação tardia", "A comunicação " + c.idx + " foi recebida pelo COAF " + dias + " dias após o fim do período analisado.", [c.idx]); }
    }
    /* documentos */
    for (const x of ents.values()) {
      if (x.doc && !validDoc(x.doc)) add("relevante", "Identificação de pessoas", "CPF/CNPJ com dígito verificador inválido", fmtDoc(x.doc) + " (" + [...x.nomes][0] + ") não é um documento válido. A pessoa citada não pode ser identificada com segurança.", [...x.idx]);
      const nomes = [...x.nomes].filter(n => !/MESMA TITULARI/.test(n));
      const distintos = nomes.filter((n, i) => !nomes.slice(0, i).some(o => o.slice(0, 12) === n.slice(0, 12) || o.includes(n.slice(0, 12)) || n.includes(o.slice(0, 12))));
      if (distintos.length > 1) add("relevante", "Identificação de pessoas", "Mesmo documento com nomes diferentes", fmtDoc(x.doc) + " aparece como " + distintos.join("; ") + ".", [...x.idx]);
      if (x.qualificacoes.size > 1 && qualifDivergente([...x.qualificacoes.keys()])) add("relevante", "Identificação de pessoas", "Qualificação profissional divergente entre comunicações", fmtDoc(x.doc) + " (" + ([...x.nomes][0] || "") + ") é qualificado como " + [...x.qualificacoes.entries()].map(([q, s]) => "“" + q + "” (com. " + [...s].join(", ") + ")").join("; ") + ". A divergência revela a fragilidade das informações cadastrais usadas para afirmar incompatibilidade ou vínculo com o poder público.", [...x.idx]);
      if (new Set([...x.serv].map(s => s.toUpperCase())).size > 1) add("informativa", "Identificação de pessoas", "Indicador de servidor público inconsistente", fmtDoc(x.doc) + " tem o indicador de servidor registrado como " + [...x.serv].join(", ") + " em comunicações distintas.", [...x.idx]);
    }
    /* pessoas do texto ausentes dos envolvidos e envolvidos sem menção */
    for (const c of com) {
      const envDocs = new Set(c.env.map(e => e.doc));
      const ausentes = c.relato.docsNoTexto.filter(d => d.doc.length >= 11 && !envDocs.has(d.doc) && (!c.titular || d.doc !== c.titular.doc));
      const uniq = [...new Map(ausentes.map(a => [a.doc, a])).values()];
      if (uniq.length) add("relevante", "Correspondência entre arquivos", "Documento citado no relato e ausente do arquivo de envolvidos", "Na comunicação " + c.idx + ", o relato cita " + uniq.map(a => a.texto).join(", ") + ", que não consta(m) do arquivo de envolvidos dessa comunicação.", [c.idx]);
      const malformado = c.relato.docsNoTexto.filter(d => /--$/.test(d.texto));
      for (const d of malformado) add("relevante", "Identificação de pessoas", "CPF incompleto no relato", "Na comunicação " + c.idx + ", o relato traz o documento incompleto “" + d.texto + "”.", [c.idx]);
      const textoU = sem(c.texto);
      const vistosEnv = new Set();
      for (const e of c.env) {
        if (e.tipo === "Titular" || !e.doc || c.automatica || vistosEnv.has(e.doc)) continue;
        vistosEnv.add(e.doc);
        const citadoDoc = c.texto.includes(e.docTxt.trim()) || c.relato.docsNoTexto.some(d => d.doc === e.doc);
        const citadoNome = textoU.includes(sem(e.nome).slice(0, 14));
        if (!citadoDoc && !citadoNome) add("relevante", "Correspondência entre arquivos", "Envolvido sem menção no relato", e.nome + " (" + fmtDoc(e.doc) + ") consta como envolvido na comunicação " + c.idx + ", mas não é mencionado no relato bancário. A inclusão não tem lastro no texto da comunicação.", [c.idx]);
      }
      for (const cp of c.relato.remetentes.concat(c.relato.destinatarios)) {
        if (!cp.mesmaTitularidade || !cp.doc || !c.titular) continue;
        if (cp.doc !== c.titular.doc) add("critico", "Identificação de pessoas", "“Mesma titularidade” com CPF de outra pessoa", "Na comunicação " + c.idx + ", o lançamento descrito como de “mesma titularidade” traz o documento " + cp.docTexto + ", que não é o do titular (" + fmtDoc(c.titular.doc) + ").", [c.idx]);
      }
      for (const d of c.relato.docsNoTexto) {
        const x = ents.get(d.doc);
        if (!x) continue;
      }
    }
    /* mesmo nome com documentos diferentes */
    const porNome = new Map();
    for (const c of com) for (const d of c.relato.docsNoTexto) {
      const antes = c.texto.slice(Math.max(0, d.ini - 60), d.ini);
      const nm = (/([A-ZÀ-Ü][A-ZÀ-Ü .']{5,60})\s*[-–:,]*\s*(CPF:?\s*)?$/.exec(antes) || [])[1];
      if (!nm) continue;
      const k = sem(nm).replace(/\s+/g, " ").trim().slice(-30);
      const s = porNome.get(k) || new Map(); s.set(d.texto, c.idx); porNome.set(k, s);
    }
    for (const [nm, s] of porNome) if (!/MESMA TITULARI/.test(nm) && new Set([...s.keys()].map(digits).filter(x => x.length >= 9)).size > 1) add("relevante", "Identificação de pessoas", "Mesmo nome com documentos diferentes", "“" + nm + "” aparece com os documentos " + [...s.keys()].join(" e ") + ".", [...new Set(s.values())]);
    /* titular com qualificação divergente no próprio relato */
    for (const T of ds.titulares.values()) {
      const ocup = [...new Set(T.coms.map(c => c.relato.ocupacao).filter(Boolean).map(o => o.toUpperCase()))];
      const esferaCad = new Set(); for (const c of T.coms) for (const e of c.env) if (e.doc === T.doc && e.serv) { const k = ({ SPE: "ESTADUAL", SPF: "FEDERAL", SPM: "MUNICIPAL" })[e.serv.toUpperCase()]; if (k) esferaCad.add(k); }
      const esferaTxt = new Set(); for (const c of T.coms) { const u = sem(c.texto.slice(0, 600)); for (const k of ["MUNICIPAL", "MINICIPAL", "ESTADUAL", "FEDERAL"]) if (u.includes(k)) esferaTxt.add(k === "MINICIPAL" ? "MUNICIPAL" : k); }
      if (esferaCad.size && esferaTxt.size && ![...esferaTxt].every(k => esferaCad.has(k))) add("relevante", "Identificação de pessoas", "Esfera do vínculo público divergente", T.nome + " tem o indicador de servidor público registrado como " + [...esferaCad].map(k => k.toLowerCase()).join(" e ") + " no arquivo de envolvidos, mas os relatos o(a) descrevem como servidor(a) " + [...esferaTxt].map(k => k.toLowerCase()).join(" e ") + ". A própria condição funcional, que fundamenta enquadramentos como o de agente público, está mal definida no RIF.", T.coms.map(c => c.idx));
      if (ocup.length > 1 && qualifDivergente(ocup)) add("relevante", "Identificação de pessoas", "Ocupação do titular divergente entre comunicações", T.nome + " é descrito como " + ocup.map(o => "“" + o + "”").join(", ") + " nas comunicações " + T.coms.map(c => c.idx).join(", ") + ".", T.coms.map(c => c.idx));
      const rendas = [...new Set(T.coms.map(c => c.relato.rendas[0] && c.relato.rendas[0].valor).filter(Boolean))];
      if (rendas.length > 1) add("informativa", "Identificação de pessoas", "Renda cadastral variável entre comunicações", T.nome + " tem renda cadastral informada como " + rendas.map(brl).join(", ") + ", conforme a comunicação.", T.coms.map(c => c.idx));
    }
    return out;
  }

  /* Divergência material de qualificação: esfera pública distinta ou ocupações sem nenhuma interseção. */
  const OCUPS = ["APOSENTAD", "ESTUDANTE", "EMPRESARI", "PROPRIETARI", "PROFESSOR", "ADVOGAD", "ENFERM", "TECNIC", "ADMINISTRADOR", "ASSESSOR", "AGENTE", "PECUARIST", "PRODUTOR", "CONSTRUTOR", "TELEFONISTA", "LOTERIC", "DIRETOR"];
  function qualifDivergente(lista) {
    const info = lista.map(q => { const u = sem(q).replace("MINICIPAL", "MUNICIPAL"); return { esf: ["MUNICIPAL", "ESTADUAL", "FEDERAL"].filter(k => u.includes(k)), oc: OCUPS.filter(k => u.includes(k)).map(k => k === "PROPRIETARI" ? "EMPRESARI" : k) }; });
    const esf = new Set(info.flatMap(i => i.esf));
    if (esf.size > 1) return true;
    for (let i = 0; i < info.length; i++) for (let j = i + 1; j < info.length; j++) if (info[i].oc.length && info[j].oc.length && !info[i].oc.some(k => info[j].oc.includes(k))) return true;
    return false;
  }

  /* ------------------------------------------------------------------ pontos favoráveis */
  function pontosFavoraveis(ds) {
    const out = [];
    const add = (tipo, titulo, texto, idxs, valor) => out.push({ tipo, titulo, texto, idxs: idxs || [], valor: valor || 0 });
    const { com, tot } = ds;
    if (tot.somaA > tot.cred * 1.5) add("dupla contagem", "O “volume” do RIF soma créditos e débitos", "A soma do campo “total” das comunicações é de " + brl(tot.somaA) + ", mas esse valor resulta da adição de créditos (" + brl(tot.cred) + ") e débitos (" + brl(tot.deb) + "). O mesmo dinheiro é contado quando entra e quando sai da conta. Apresentar o total como “movimentação” praticamente dobra o valor real que circulou.", com.map(c => c.idx), tot.somaA - tot.cred);
    if (ds.duplicidades.length) add("dupla contagem", "Transferências entre titulares relatadas pelas duas contas", ds.duplicidades.length + " fluxo(s) entre titulares do RIF aparecem tanto na comunicação da conta de origem quanto na da conta de destino, em períodos sobrepostos. Somados, contam o mesmo dinheiro duas vezes; o valor potencialmente duplicado é de até " + brl(tot.duplicado) + ".", [...new Set(ds.duplicidades.flatMap(d => [d.origem.idx, d.destino.idx]))], tot.duplicado);
    const iv = ds.pares.filter(p => p.idaEVolta);
    if (iv.length) add("dupla contagem", "Fluxos de ida e volta", iv.length + " par(es) de titulares trocaram recursos nos dois sentidos. Somar ida e volta como “movimentação” infla o valor; o saldo líquido entre eles é de " + brl(iv.reduce((s, p) => s + p.liquido, 0)) + ", ante " + brl(iv.reduce((s, p) => s + p.ida + p.volta, 0)) + " de soma bruta.", [...new Set(iv.flatMap(p => p.fluxos.map(f => f.idx)))]);
    for (const c of com) {
      const e = c.economia, nm = c.titular ? c.titular.nome : "titular";
      if (c.automatica) add("comunicação automática", "Comunicação automática por valor (com. " + c.idx + ")", "A comunicação " + c.idx + " decorre de critério objetivo de valor ou de espécie (segmento " + c.seg + "), e não de juízo de suspeição do banco. Não deve ser tratada como “transação suspeita”." + (/(pagamento de empregados|folha)/i.test(c.texto) ? " O próprio registro informa a finalidade: “" + (/[^.;]*(pagamento de empregados|folha)[^.;]*/i.exec(c.texto) || [""])[0].trim() + "”." : ""), [c.idx], c.A);
      if (e.vNeutro + e.mesmaCred > 0.08 * c.B && c.B > 0) add("recursos próprios", "Créditos que não são renda de terceiros (com. " + c.idx + ")", "Dos " + brl(c.B) + " de créditos de " + nm + ", " + brl(e.vNeutro + e.mesmaCred) + " correspondem a " + e.credNeutro.map(l => l.motivo + " (" + brl(l.valor) + ")").concat(e.mesmaCred ? ["transferências de mesma titularidade (" + brl(e.mesmaCred) + ")"] : []).join(", ") + ". Esses valores não representam ingresso de recursos de terceiros nem acréscimo patrimonial.", [c.idx], e.vNeutro + e.mesmaCred);
      if (e.compativelFaturamento) add("compatibilidade", "Movimentação compatível com o faturamento (com. " + c.idx + ")", "O próprio relato informa faturamento anual de " + brl(e.faturamento.valor) + ". Para o período de " + e.meses + " meses, o faturamento proporcional é de " + brl(e.fatPeriodo) + ", superior aos créditos comunicados (" + brl(c.B) + "). A movimentação é compatível com a atividade declarada.", [c.idx]);
      if (e.rendaDesatualizada) add("cadastro", "Renda cadastral desatualizada (com. " + c.idx + ")", "A incompatibilidade foi aferida com base em renda ou cadastro anteriores ao período analisado" + (e.renda && e.renda.data ? " (renda informada em " + dBR(e.renda.data) + ")" : "") + (e.atualizacao ? " e cadastro atualizado em " + dBR(e.atualizacao) : "") + ". A comparação com dados defasados não demonstra incompatibilidade atual.", [c.idx]);
      const socios = new Set(); for (const c2 of com) if (c2.titular && c.titular && c2.titular.doc === c.titular.doc) c2.relato.sociedades.forEach(d => socios.add(d));
      const deSocio = c.relato.remetentes.filter(x => x.doc && socios.has(x.doc));
      if (deSocio.length) add("compatibilidade", "Créditos provenientes de empresa do próprio titular (com. " + c.idx + ")", "Os principais créditos de " + nm + " provêm de " + deSocio.map(x => x.nome + " (" + brl(x.valor) + ")").join(", ") + ", empresa da qual o próprio relato informa ser sócio(a). Transferências da sociedade ao sócio são compatíveis com distribuição de lucros, pró-labore ou retirada, e não indicam ingresso de recursos de origem desconhecida.", [c.idx], deSocio.reduce((s, x) => s + x.valor, 0));
      if (c.relato.semVinculo) add("relato", "O banco não identificou vínculo (com. " + c.idx + ")", "O próprio comunicante registra que “não foi possível estabelecer vínculo pessoal ou negocial” entre os principais depositantes e o titular. A afirmação é de desconhecimento do banco, e não de ausência de vínculo lícito.", [c.idx]);
      if (c.relato.explicacoes.length) add("relato", "Explicação lícita registrada no próprio relato (com. " + c.idx + ")", "O relato menciona circunstâncias que explicam a movimentação: " + c.relato.explicacoes.map(x => "“" + x.termo + "”").join(", ") + ".", [c.idx]);
      const esp = c.relato.especulativos.length;
      if (esp >= 3) add("linguagem", "Relato baseado em suposições (com. " + c.idx + ")", "O relato bancário emprega " + esp + " expressões de incerteza (" + [...new Set(c.relato.especulativos.map(x => x.termo.toLowerCase()))].slice(0, 6).join(", ") + "), o que evidencia hipóteses do analista do banco, e não fatos constatados.", [c.idx]);
      if (c.relato.fontesAbertas) add("relato", "Informações de fontes abertas não verificadas (com. " + c.idx + ")", "O relato incorpora informações obtidas em fontes abertas ou externas, sem verificação e, por vezes, relativas a fatos e pessoas estranhos à movimentação comunicada.", [c.idx]);
      if (e.simetrico && c.B > 0) add("dupla contagem", "Créditos e débitos idênticos (com. " + c.idx + ")", "Os créditos e os débitos da comunicação " + c.idx + " são iguais (" + brl(c.B) + "), o que indica totalização do banco pelo mesmo saldo de entrada e saída, e não dois fluxos distintos.", [c.idx]);
    }
    return out;
  }

  root.RIF_MOTOR = { digits, fmtDoc, validDoc, money, pDate, dBR, isPJ, sem, brl, perto, decodificar, parseCSV, controleArquivo, construir, lerRelato, leituraOc, sha256 };
})(typeof window !== "undefined" ? window : globalThis);
