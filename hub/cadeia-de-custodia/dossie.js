/* Dossiê completo da análise da cadeia de custódia.
   Reúne, em documento único: síntese, material analisado, índice dos documentos (IDs), quadro geral de falhas,
   análise por vestígio, inconsistências, alertas, identificadores, cronologia, jurisprudência aplicável com
   possibilidades de utilização, pontos de cautela, fundamentos legais, doutrina, diligências, riscos e a minuta. */
(function () {
  "use strict";
  const R = window.CC_REGRAS, M = window.CC_MOTOR, REL = window.CC_RELATORIO;
  const esc = s => window.HUB.esc(s);
  const ETAPA_ORD = R.ETAPAS.reduce((m, e, i) => (m[e.id] = i, m), {});
  const PESO_ORD = { critico: 0, relevante: 1, formal: 2 };
  const GRAV = { critico: "Crítica", relevante: "Relevante", formal: "Formal" };
  const CAT = id => R.CATEGORIAS.find(c => c.id === id);
  const ETAPA = id => R.ETAPAS.find(e => e.id === id);
  const PECA = id => R.PECAS.find(p => p.id === id);
  const PREC = () => window.HUB_PRECEDENTES || [];
  const semTrav = s => String(s || "").replace(/\s*[—–]\s*/g, ", ");
  const minus = s => { s = String(s || ""); const w = s.split(" ")[0]; return w.length > 1 && w === w.toUpperCase() ? s : s.charAt(0).toLowerCase() + s.slice(1); };
  const TAG_KW = { acesso: /autoriza|ordem judicial|acess|devass/, hash: /hash/, extracao: /extra[cç]|cellebrite|ferramenta|espelh/, prints: /print|captura/, copia: /c[oó]pia|integral|acesso da defesa|disponibiliz/, original: /extravi|corromp|perd(a|eu|ido|idos)\b|desapare/, intercept: /intercepta/, nuvem: /provedor|e-mail|nuvem|geofenc|telem/, midia: /v[ií]deo|[aá]udio|grava|filmag/, onus: /[oô]nus|presum/, pericia: /per[ií]cia|laudo|perito/, derivada: /deriva|fonte independente|contamin/, whatsapp: /whatsapp/ };
  function questoesRelevantes(p, tags) {
    const pts = q => { const t = (q.q + " " + q.t).toLowerCase(); let s = 0; for (const k of tags) if (TAG_KW[k] && TAG_KW[k].test(t)) s += 2; if (/cadeia de cust[oó]dia|integridade|inadmiss|mesmidade/.test(t)) s += 1; if (/s[uú]mula|reexame|habeas corpus substitutivo|dialeticidade|prequestion|compet[eê]ncia|suspei[cç]/.test(t)) s -= 4; return s; };
    const ord = p.questoes.map((q, i) => ({ q, i, s: pts(q) })).sort((a, b) => b.s - a.s).slice(0, 2).sort((a, b) => a.i - b.i);
    return { lista: ord.map(x => x.q), omitidas: p.questoes.length - ord.length };
  }

  /* Temas de cada critério, para relacioná-lo aos precedentes da base. */
  const CRIT_TAGS = {
    G01: ["onus"], G02: ["onus"], G07: ["onus"], G08: ["onus"], G11: ["pericia"], G12: ["onus"], G13: ["original"], G14: ["pericia", "copia"], G15: ["original"],
    D01: ["acesso"], D04: ["extracao"], D05: ["hash", "original"], D06: ["hash"], D07: ["hash"], D08: ["extracao", "pericia"], D09: ["copia"], D10: ["prints"],
    D11: ["acesso", "extracao"], D12: ["midia"], D13: ["intercept", "copia"], D14: ["nuvem"]
  };
  const PROPOSITO = {
    acesso: "o acesso ao conteúdo de dispositivos sem prévia autorização judicial torna ilícita a prova assim obtida e contamina as que dela derivam",
    extracao: "a extração de dados sem ferramenta forense, sem registro auditável e sem documentação mínima compromete a confiabilidade da prova digital",
    hash: "sem o cálculo e o confronto de valores hash não é possível demonstrar a integridade e a mesmidade dos dados",
    prints: "capturas de tela desacompanhadas de mecanismo de verificação de autenticidade não se prestam, por si sós, a sustentar a acusação",
    copia: "a defesa tem direito de acesso à integralidade do material, e não apenas a recortes selecionados unilateralmente pela acusação",
    original: "a perda, o extravio ou a corrupção do material sob custódia estatal é de responsabilidade do Estado, que deve suportar suas consequências",
    intercept: "a seleção unilateral de trechos de interceptação compromete o contraditório e a paridade de armas",
    nuvem: "dados obtidos de provedores exigem documentação de integridade e delimitação precisa da ordem judicial",
    midia: "a mídia audiovisual sem origem e integralidade documentadas não oferece garantia mínima de autenticidade",
    onus: "é do Estado o ônus de demonstrar a integridade da fonte de prova, sendo vedado presumi-la a partir da autoproclamada regularidade da atuação estatal",
    pericia: "a ausência ou a deficiência do exame pericial impede a aferição técnica da prova e o exercício da contraprova",
    derivada: "a inadmissibilidade alcança as provas derivadas, salvo demonstração concreta de fonte independente",
    whatsapp: "as conversas de aplicativos de mensagem exigem preservação técnica que assegure sua autenticidade e integridade"
  };
  /* Precedentes cujo desfecho exige cautela, por terem preservado a acusação ou admitido a renovação da prova. */
  const CAUTELA = {
    3: "A ação penal foi preservada porque o trabalho investigativo anterior à apreensão constituiu fonte independente. No caso, convém demonstrar que os demais elementos derivam do vício ou dele dependem.",
    8: "Reconhecida a ilicitude do acesso, a condenação foi mantida com base em provas independentes. É o principal contra-argumento a antecipar: a defesa deve mapear o nexo entre a prova viciada e os demais elementos.",
    10: "Foram desentranhados os prints do WhatsApp Web, mas as demais provas permaneceram válidas.",
    24: "A extração foi anulada sem prejuízo de nova produção por decisão da autoridade competente, o que indica a possibilidade de renovação do ato pela acusação.",
    52: "Excluído o áudio por quebra da cadeia de custódia, a condenação foi mantida com base em provas independentes.",
    53: "A inadmissibilidade foi declarada no estado atual da prova, ressalvada perícia sobre os arquivos originais, de modo que a acusação pode buscar sanar o vício.",
    56: "A condenação foi mantida sem o desentranhamento do áudio, por se ter valorado apenas o fato do envio, e não o seu conteúdo.",
    54: "Os prints produzidos pela vítima foram inadmitidos, mas os vídeos juntados sem preservação técnica foram mantidos, porque permaneceram acessíveis às partes e a defesa não demonstrou vício específico na mesmidade. Em relação a mídias audiovisuais, convém apontar concretamente o risco à autenticidade e à integridade.",
    59: "O laudo do celular foi desentranhado, mas a condenação subsistiu com base em outros elementos."
  };
  const DILIG = {
    G01: "Requer-se a juntada do auto de apreensão ou do auto circunstanciado de busca relativo {v}, com identificação do agente responsável pelo reconhecimento e pela preservação do vestígio (arts. 158-A, § 2º, e 245, § 7º, do CPP).",
    G02: "Requer-se a juntada de documento que relacione, de modo individualizado, os identificadores do objeto apreendido aos do objeto examinado, de modo a permitir o juízo de mesmidade.",
    G03: "Requer-se a juntada dos registros de isolamento e preservação do local e a oitiva do primeiro agente a nele chegar, sobre as condições em que os vestígios foram encontrados (arts. 6º, I, e 169 do CPP).",
    G04: "Requer-se a juntada de fotografias, filmagens ou croquis que fixem o estado original do vestígio (art. 158-B, III, do CPP).",
    G05: "Requer-se a identificação de quem realizou a coleta do vestígio e a juntada do respectivo registro (arts. 158-B, IV, e 158-C do CPP).",
    G06: "Requer-se a juntada da ficha de acompanhamento do vestígio, com o registro de todos os rompimentos de lacre e relacrações (art. 158-D, § 4º, do CPP), bem como a exibição em juízo dos recipientes e dos lacres originais e rompidos (art. 158-D, § 5º).",
    G09: "Requer-se a juntada da guia de remessa e do termo de recebimento pelo órgão pericial, com os elementos mínimos do art. 158-B, VII, do CPP.",
    G11: "Requer-se a juntada do laudo pericial completo, com a descrição da metodologia e do material recebido, e a intimação do perito para esclarecimentos (art. 159, § 5º, I, do CPP).",
    G13: "Requer-se seja oficiada a central de custódia para que informe as entradas, saídas e acessos ao vestígio, com identificação dos responsáveis, datas e horários (art. 158-E, §§ 2º a 4º, do CPP).",
    G14: "Requer-se a disponibilização do material que serviu de base à perícia, no ambiente do órgão oficial, para exame por assistente técnico (art. 159, §§ 3º e 6º, do CPP).",
    G15: "Requer-se a informação sobre a destinação final do vestígio, com a juntada da decisão autorizadora e do auto de destruição ou restituição (art. 158-B, X, do CPP).",
    D01: "Requer-se a juntada da decisão judicial que teria autorizado o acesso aos dados e, inexistente esta, a declaração de ilicitude das provas obtidas a partir do acesso e das delas derivadas, com o desentranhamento dos autos (art. 157, caput e § 1º, do CPP).",
    D02: "Requer-se o esclarecimento, pelo perito, sobre o estado do aparelho na apreensão, o isolamento de rede e o método de desbloqueio empregado.",
    D04: "Requer-se a juntada do relatório integral de extração gerado pela ferramenta forense, com o registro de aquisição, a versão do software, o responsável e a data, bem como da imagem forense correspondente, e a intimação do perito para esclarecimentos.",
    D06: "Requer-se a apresentação dos valores hash calculados na aquisição e sua conferência, por perícia ou assistente técnico, com a cópia disponibilizada à defesa.",
    D09: "Requer-se a disponibilização da cópia forense integral do material digital, e não apenas de trechos selecionados, com prazo compatível para exame por assistente técnico.",
    D10: "Requer-se a realização de perícia sobre as capturas de tela, com a apresentação dos dispositivos de origem, ou, subsidiariamente, a declaração de sua imprestabilidade.",
    D11: "Requer-se a oitiva dos agentes que manusearam o aparelho antes da perícia e a juntada de todos os registros produzidos nesse período.",
    D12: "Requer-se a apresentação do arquivo original da mídia, com seus metadados, e a identificação do equipamento de origem e do responsável pela cópia.",
    D13: "Requer-se a disponibilização da íntegra das gravações interceptadas e do auto circunstanciado, com identificação de quem selecionou os trechos transcritos (Lei 9.296/1996, art. 6º).",
    D14: "Requer-se a juntada das respostas dos provedores em sua forma original, com os valores hash fornecidos, e da decisão que delimitou alvos e período.",
    T01: "Requer-se a juntada do laudo de constatação e do laudo toxicológico definitivo, com indicação das massas bruta e líquida e explicação de eventuais divergências.",
    T04: "Requer-se a informação sobre a amostra preservada para contraprova e a juntada do auto de destruição da droga (Lei 11.343/2006, art. 50, §§ 3º a 5º).",
    A01: "Requer-se a juntada do laudo de identificação e de eficiência da arma e, se houver projéteis ou estojos, do exame de confronto balístico.",
    B01: "Requer-se a documentação das condições de conservação e transporte da amostra biológica e das cautelas contra contaminação.",
    L01: "Requer-se a juntada do laudo de exame de local, com fotografias e croquis, e o registro das alterações do estado das coisas (art. 169 do CPP)."
  };
  const DILIG_ALIAS = { G07: "G06", G08: "G06", G12: "G06", G10: "G09", D03: "D02", D05: "D04", D07: "D06", D08: "D04", T02: "T01", T03: "T01", A02: "A01", B02: "B01", L02: "L01" };
  const STATUS_FRASE = { irregular: "há registro de vício", ausente: "não se localiza documentação", controverso: "há indícios contraditórios" };

  function falhas(est) {
    const out = [];
    for (const c of est.res.categorias.filter(x => x.ativo)) {
      const rc = est.res.criterios[c.id] || {};
      for (const cr of R.CRITERIOS) {
        const r = rc[cr.id]; if (!r) continue;
        const st = M.statusFinal(r);
        if (!["irregular", "ausente", "controverso"].includes(st)) continue;
        const gids = (st === "ausente" ? [] : (r.neg.length ? r.neg : r.pos).map(e => e.gid)).concat(r.calcGids || []);
        out.push({ cat: CAT(c.id), cr, r, st, gids, ev: st === "ausente" ? [] : (r.neg.length ? r.neg : r.pos) });
      }
    }
    out.sort((a, b) => (PESO_ORD[a.cr.peso] - PESO_ORD[b.cr.peso]) || ((a.st === "irregular" ? 0 : a.st === "controverso" ? 1 : 2) - (b.st === "irregular" ? 0 : b.st === "controverso" ? 1 : 2)) || (ETAPA_ORD[a.cr.etapa] - ETAPA_ORD[b.cr.etapa]));
    out.forEach((f, i) => f.num = i + 1);
    return out;
  }

  function aplicabilidade(est, fs) {
    const mapa = {};
    const peso = f => (f.cr.peso === "critico" ? 3 : f.cr.peso === "relevante" ? 2 : 1) * (f.st === "irregular" ? 1.5 : 1);
    const add = (p, pts, f, exp) => { const m = mapa[p.id] = mapa[p.id] || { p, score: 0, fs: [], tags: {}, explicito: false }; m.score += pts; if (exp) m.explicito = true; if (f && !m.fs.includes(f)) m.fs.push(f); };
    for (const f of fs) {
      const explicit = (f.cr.prec || []).map(k => REL.precedente(k)).filter(Boolean);
      const tags = CRIT_TAGS[f.cr.id] || [];
      for (const p of PREC()) {
        const isExp = explicit.includes(p);
        const tagHit = tags.filter(t => p.tags.includes(t));
        if (f.cat.familia === "fisico" && !isExp && !(p.complementar || [13, 16, 1, 2].includes(p.n))) continue;
        if (f.cat.familia === "digital" && p.complementar) continue;
        if (isExp) add(p, 3 * peso(f), f, true);
        else if (tagHit.length && f.cat.familia === "digital") add(p, peso(f) * (tagHit.length > 1 ? 1.5 : 1), f);
        else if (f.cat.familia === "fisico" && tags.includes("onus") && p.tags.includes("onus")) add(p, peso(f), f);
        if (mapa[p.id]) for (const t of tagHit) mapa[p.id].tags[t] = (mapa[p.id].tags[t] || 0) + 1;
      }
    }
    for (const n of est.res.inconsistencias) for (const k of n.prec || []) { const p = REL.precedente(k); if (p) { add(p, n.grav === "critico" ? 6 : 3, null, true); (mapa[p.id].incs = mapa[p.id].incs || []).push(n); } }
    return Object.values(mapa).filter(m => m.score > 0).sort((a, b) => b.score - a.score || (a.p.n || 99) - (b.p.n || 99));
  }

  function tabela(cols, linhas) {
    return '<table class="rel-t"><tr>' + cols.map(c => "<th>" + c + "</th>").join("") + "</tr>" + linhas.join("") + "</table>";
  }
  function trechoHTML(e, pg, neg) {
    const p = pg[e.gid];
    return '<div class="dz-trecho' + (neg ? " neg" : "") + '"><div class="dz-ref">' + esc(REL.refs([e.gid], pg)) + (p && p.peca ? " · " + esc(PECA(p.peca).rot) : "") + "</div>“" + esc(e.antes) + "<b>" + esc(e.alvo) + "</b>" + esc(e.depois) + "”</div>";
  }

  function gerar(est) {
    const pg = est.paginas, res = est.res, caso = est.caso || {};
    const ativos = res.categorias.filter(c => c.ativo);
    const fs = falhas(est);
    const crit = fs.filter(f => f.cr.peso === "critico");
    const aplic = aplicabilidade(est, fs);
    const h = [];
    const P = t => h.push("<p>" + esc(semTrav(t)) + "</p>");
    let sec = 0; const S = t => { sec++; h.push('<h3 id="dz' + sec + '">' + sec + ". " + esc(t) + "</h3>"); return sec; };
    const hoje = new Date();
    const temIDs = pg.some(p => p.rotID);

    /* ---------- capa ---------- */
    h.push('<div class="rel-cab"><div class="rel-marca"><span class="marca-tpc">TPC</span> <span>ADVOGADOS · HUB CRIMINAL</span></div><div class="mudo pequeno">Documento sigiloso. Uso exclusivo da defesa.</div></div>');
    h.push('<h2 style="margin-bottom:4px">Dossiê de análise da cadeia de custódia</h2><p class="mudo" style="margin-top:0">Gerado em ' + hoje.toLocaleDateString("pt-BR") + " às " + hoje.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }) + "</p>");
    const dc = [["Autos", caso.autos], ["Assistido", caso.assistido], ["Juízo / órgão", caso.juizo], ["Responsável", caso.responsavel], ["Observações", caso.obs]].filter(x => x[1]);
    if (dc.length) h.push('<table class="rel-t">' + dc.map(x => "<tr><th style=\"width:180px\">" + x[0] + "</th><td>" + esc(x[1]) + "</td></tr>").join("") + "</table>");
    const titulos = ["Síntese executiva", "Material analisado e registro de integridade", "Verificação crítica dos vestígios", "Índice dos documentos dos autos", "Quadro geral de falhas", "Análise detalhada por vestígio", "Inconsistências documentais", "Alertas identificados no texto", "Identificadores localizados", "Cronologia", "Jurisprudência aplicável e possibilidades de utilização", "Precedentes que exigem cautela", "Fundamentos legais aplicáveis", "Doutrina de apoio", "Diligências e requerimentos recomendados", "Riscos e contra-argumentos previsíveis", "Limitações da análise"].concat(res.ia && res.ia.resultado ? ["Análise complementar por IA"] : []).concat(["Anexo: minuta de tese"]);
    h.push('<div class="dz-sumario"><b>Sumário</b><ol>' + titulos.map(t => "<li>" + esc(t) + "</li>").join("") + "</ol></div>");

    /* ---------- 1. síntese ---------- */
    S("Síntese executiva");
    const nomes = ativos.map(c => CAT(c.id).nome.toLowerCase());
    const listaPt = a => a.length > 1 ? a.slice(0, -1).join(", ") + " e " + a[a.length - 1] : (a[0] || "");
    P("A análise abrangeu " + est.docs.length + " arquivo(s), com " + res.totalPaginas + " página(s), das quais " + res.paginasOCR + " foram lidas por reconhecimento óptico de caracteres" + (temIDs ? ", e cada página foi associada ao respectivo identificador do documento no processo eletrônico" : "") + ". Foram examinados " + ativos.length + " tipo(s) de vestígio sujeitos à cadeia de custódia: " + listaPt(nomes) + ".");
    for (const c of ativos) {
      const k = M.classificar(res.criterios[c.id] || {}); const cat = CAT(c.id);
      const fc = fs.filter(f => f.cat.id === c.id);
      P("Quanto " + REL.contrair("a", cat.artigo) + ", a classificação resultante é \"" + k.rot.toLowerCase() + "\", com conformidade documental de " + k.conformidade + "% e " + fc.length + " falha(s) apontada(s), sendo " + k.critIrreg + " crítica(s) com registro expresso de vício e " + k.critAus + " crítica(s) sem documentação localizada.");
    }
    if (crit.length) {
      const top = crit.filter(f => f.st !== "ausente").slice(0, 6);
      if (top.length) P("Os pontos de maior gravidade, por revelarem vício documentado nos próprios autos, são os seguintes: " + top.map(f => minus(f.cr.titulo) + " (" + f.cat.curto.toLowerCase() + (f.gids.length ? ", " + REL.refs(f.gids, pg) : "") + ")").join("; ") + ".");
    }
    if (res.inconsistencias.filter(n => n.grav !== "info").length) P("Os confrontos automáticos entre as peças revelaram " + res.inconsistencias.filter(n => n.grav !== "info").length + " inconsistência(s) documental(is) objetiva(s), entre as quais " + listaPt(res.inconsistencias.filter(n => n.grav !== "info").map(n => minus(n.titulo))) + ".");
    const quebra = ativos.filter(c => M.classificar(res.criterios[c.id] || {}).nivel === "quebra").map(c => REL.contrair("a", CAT(c.id).artigo));
    if (quebra.length) P("Diante desse quadro, a tese principal recomendada é a de quebra da cadeia de custódia relativa " + listaPt(quebra) + ", com a consequente inadmissibilidade e o desentranhamento dos elementos e das provas deles derivadas (art. 157, caput e § 1º, do CPP), sustentada no entendimento de que cabe ao Estado demonstrar a integridade da fonte de prova (AgRg no RHC 143.169/RJ). Subsidiariamente, recomenda-se a formulação das diligências indicadas neste dossiê e o pedido de que eventual valoração considere a fragilidade demonstrada.");
    else if (fs.length) P("Diante desse quadro, recomenda-se, em vez da arguição imediata de inadmissibilidade, a formulação das diligências indicadas neste dossiê, para compelir o Estado a documentar os elos faltantes, sob pena de inadmissibilidade, sem prejuízo da valoração das fragilidades apontadas.");
    else P("A verificação não identificou falhas documentais relevantes nas etapas examinadas. Recomenda-se, ainda assim, a conferência manual das páginas de baixa legibilidade e das peças eventualmente não anexadas.");
    if (aplic.length) P("A base de precedentes forneceu " + Math.min(15, aplic.filter(m => m.explicito || m.score >= 8).length) + " julgado(s) com pertinência direta às falhas identificadas e " + Math.max(0, aplic.length - Math.min(15, aplic.filter(m => m.explicito || m.score >= 8).length)) + " relacionado(s) por tema, analisados no item 10, com a indicação de como cada um pode ser utilizado no caso. O item 11 reúne os precedentes cujo desfecho exige cautela, por terem preservado a acusação com base em provas independentes ou admitido a renovação da prova.");
    h.push(tabela(["Vestígio", "Classificação", "Conformidade", "Falhas", "Críticas irregulares", "Críticas não localizadas"], ativos.map(c => { const k = M.classificar(res.criterios[c.id] || {}); return "<tr><td>" + CAT(c.id).icone + " " + esc(CAT(c.id).nome) + "</td><td><b>" + k.rot + "</b></td><td>" + k.conformidade + "%</td><td>" + fs.filter(f => f.cat.id === c.id).length + "</td><td>" + k.critIrreg + "</td><td>" + k.critAus + "</td></tr>"; })));

    /* ---------- 2. material ---------- */
    S("Material analisado e registro de integridade");
    P("Os arquivos abaixo foram analisados integralmente. O valor SHA-256 identifica univocamente o conteúdo de cada arquivo e permite demonstrar, a qualquer tempo, que este dossiê se refere exatamente ao material recebido pela defesa, além de possibilitar o confronto com a cópia disponibilizada pela acusação.");
    h.push(tabela(["Arquivo", "Páginas", "OCR", "Sistema de origem", "SHA-256"], est.docs.map((d, i) => {
      const sis = [...new Set(d.paginas.filter(p => p.idProc).map(p => p.idProc.sis === "manual" ? "ID informado" : p.idProc.sis))].join(", ") || "não identificado";
      return "<tr><td>" + (est.docs.length > 1 ? "Arq. " + (i + 1) + ": " : "") + esc(d.nome) + "</td><td>" + d.paginas.length + "</td><td>" + d.paginas.filter(p => p.ocr).length + "</td><td>" + esc(sis) + '</td><td class="mono">' + esc(d.sha256 || "não calculado") + "</td></tr>";
    })));
    P("Metodologia: o texto de cada página foi extraído e, nas páginas sem camada textual, obtido por OCR; as páginas foram classificadas segundo a peça processual e associadas ao identificador do documento no processo eletrônico (" + (temIDs ? "carimbo do sistema ou informação manual" : "não identificado nos arquivos; recomenda-se informá-lo manualmente na aba Arquivos") + "); os vestígios foram agrupados por tipo e confrontados com " + R.CRITERIOS.length + " critérios relativos às etapas do art. 158-B do CPP e às garantias de legalidade, integridade e acesso da defesa; e foram realizados confrontos objetivos entre peças. As situações refletem a triagem automática e as revisões feitas pelo advogado.");

    /* ---------- verificação crítica ---------- */
    S("Verificação crítica dos vestígios");
    P("Antes da verificação das etapas, cada tipo de vestígio mencionado nos autos foi lido na frase em que aparece, para distinguir o vestígio efetivamente apreendido, coletado, examinado ou juntado da mera menção ao termo. Assim, o veículo citado como local do fato ou meio de locomoção, o celular citado como número de contato, a droga ou a arma citadas como nome do crime e a referência à gravação audiovisual de atos processuais não foram tratados como vestígios sujeitos à cadeia de custódia.");
    const lidas = res.categorias.filter(c => c.mencoes || (c.confirmacoes && c.confirmacoes.length) || c.ativo);
    const VER = { confirmado: "Apreensão, coleta, exame ou juntada confirmada", mencionado: "Apenas mencionado", negado: "Apreensão negada nos autos", ausente: "Não mencionado" };
    h.push(tabela(["Vestígio", "Leitura crítica", "Situação na análise", "Fundamento", "Localização"], lidas.map(c => {
      const cat = CAT(c.id); const conf = c.confirmacoes || []; const desc = (c.negacoes || []).concat(c.descartes || []);
      const sit = c.ativo ? (c.veredito === "confirmado" ? "Incluído" : "Incluído manualmente pelo revisor") : (c.veredito === "confirmado" ? "Excluído manualmente pelo revisor" : "Descartado");
      const fund = conf.length ? [...new Set(conf.map(e => e.base))].join("; ") : (desc[0] ? desc[0].motivo : "sem registro de apreensão, coleta, exame ou juntada");
      return "<tr><td>" + cat.icone + " " + esc(cat.nome) + "</td><td>" + esc(VER[c.veredito] || c.veredito) + "</td><td>" + esc(sit) + "</td><td>" + esc(fund) + "</td><td>" + esc(REL.refs((conf.length ? conf : desc).map(e => e.gid).slice(0, 5), pg)) + "</td></tr>";
    })));
    for (const c of lidas) {
      const cat = CAT(c.id); const conf = c.confirmacoes || []; const desc = (c.negacoes || []).concat(c.descartes || []);
      if (conf.length) {
        h.push("<h4>" + cat.icone + " " + esc(cat.nome) + ": fundamentos da inclusão</h4>");
        for (const e of conf.slice(0, 3)) h.push(trechoHTML(e, pg, false).replace('<div class="dz-ref">', '<div class="dz-ref">' + esc(e.base) + " · "));
        if (desc.length) P("Foram ainda descartadas " + desc.length + " menção(ões) a este tipo de vestígio, por não se referirem ao objeto apreendido (por exemplo: " + desc[0].motivo + "; " + REL.refs([desc[0].gid], pg) + ").");
      } else if (desc.length) {
        h.push("<h4>" + cat.icone + " " + esc(cat.nome) + ": motivos do descarte</h4>");
        for (const e of desc.slice(0, 3)) h.push(trechoHTML(e, pg, true).replace('<div class="dz-ref">', '<div class="dz-ref">' + esc(e.motivo) + " · "));
      }
      if (c.forcado) P("Atenção: o tipo de vestígio \"" + cat.nome + "\" foi incluído na análise pelo revisor, embora os autos não registrem sua apreensão, coleta, exame ou juntada; as conclusões a seu respeito devem ser lidas com essa ressalva.");
    }

    /* ---------- 3. índice ---------- */
    S("Índice dos documentos dos autos");
    const idx = M.indiceDocumentos(pg);
    const catsPg = {}; for (const c of res.categorias) for (const g of c.paginas) (catsPg[g] = catsPg[g] || new Set()).add(CAT(c.id).curto);
    if (!temIDs) P("Não foram localizados identificadores de documento (ID do PJe, evento do eproc, folhas do e-SAJ ou movimentação do PROJUDI) nos arquivos. As referências deste dossiê indicam, por isso, apenas a página do arquivo; o ID pode ser informado manualmente, por arquivo, na aba Arquivos e imagens.");
    h.push(tabela(["Documento (ID)", "Peça predominante", "Páginas do arquivo", "Vestígios mencionados"], idx.slice(0, 600).map(g => {
      const ps = g.gids.map(x => pg[x]); const ini = ps[0], fim = ps[ps.length - 1];
      const vs = new Set(); g.gids.forEach(x => (catsPg[x] || []).forEach(v => vs.add(v)));
      return "<tr><td>" + esc(g.rotulo || "sem identificação") + "</td><td>" + esc(g.peca ? PECA(g.peca).rot : "não classificada") + "</td><td>" + esc(ini.rotPag + (fim !== ini ? " a " + fim.n : "")) + "</td><td>" + esc([...vs].join(", ")) + "</td></tr>";
    })));

    /* ---------- 4. quadro geral de falhas ---------- */
    S("Quadro geral de falhas");
    if (!fs.length) P("Não foram apontadas falhas nas etapas verificadas.");
    else {
      P("Foram apontadas " + fs.length + " falha(s), ordenadas por gravidade e natureza do apontamento. \"Irregular\" indica vício registrado nos próprios autos; \"controverso\", indícios simultâneos de cumprimento e de vício; \"não localizado\", ausência de documentação no material analisado, o que não equivale, por si só, à inexistência do ato.");
      h.push(tabela(["Nº", "Vestígio", "Etapa", "Falha", "Gravidade", "Situação", "Localização (página e ID)", "Fundamento"], fs.map(f => "<tr><td>" + f.num + "</td><td>" + esc(f.cat.curto) + "</td><td>" + esc(ETAPA(f.cr.etapa).rot) + "</td><td>" + esc(f.cr.titulo) + (f.r.rev ? ' <span class="mudo">(revisado)</span>' : "") + "</td><td>" + GRAV[f.cr.peso] + "</td><td>" + REL.STATUS[f.st].rot + "</td><td>" + esc(REL.refs(f.gids, pg) || "não localizado nos autos") + "</td><td>" + esc(f.cr.fund) + "</td></tr>")));
    }

    /* ---------- 5. análise por vestígio ---------- */
    const s5 = S("Análise detalhada por vestígio");
    ativos.forEach((c, i) => {
      const cat = CAT(c.id); const rc = res.criterios[c.id] || {}; const k = M.classificar(rc);
      h.push("<h4>" + s5 + "." + (i + 1) + ". " + cat.icone + " " + esc(cat.nome) + "</h4>");
      P("Classificação: " + k.rot.toLowerCase() + ". Conformidade documental de " + k.conformidade + "%. O vestígio é mencionado " + c.mencoes + " vez(es), em " + c.paginas.length + " página(s)" + (c.paginas.length ? ", entre as quais " + REL.refs(c.paginas.slice(0, 8), pg) : "") + ".");
      h.push(tabela(["Etapa", "Critério", "Situação", "Localização"], R.CRITERIOS.filter(cr => rc[cr.id]).sort((a, b) => ETAPA_ORD[a.etapa] - ETAPA_ORD[b.etapa]).map(cr => {
        const r = rc[cr.id]; const st = M.statusFinal(r);
        const g = (st === "irregular" || st === "controverso") ? r.neg.map(e => e.gid) : r.pos.map(e => e.gid);
        return "<tr><td>" + esc(ETAPA(cr.etapa).rot) + "</td><td>" + esc(cr.titulo) + "</td><td>" + REL.STATUS[st].rot + (r.rev ? " (revisado)" : "") + "</td><td>" + esc(REL.refs(g.concat(r.calcGids || []), pg)) + "</td></tr>";
      })));
      for (const f of fs.filter(x => x.cat.id === c.id)) {
        const txt = f.st === "ausente" ? f.cr.falta : f.cr.vicio;
        h.push('<div class="dz-falha"><div class="dz-falha-cab"><b>Falha nº ' + f.num + ". " + esc(f.cr.titulo) + "</b> · " + GRAV[f.cr.peso] + " · " + REL.STATUS[f.st].rot + "</div>");
        h.push('<p class="pequeno mudo" style="margin:4px 0 6px">' + esc(f.cr.pergunta) + " Fundamento: " + esc(f.cr.fund) + ".</p>");
        if (txt) P(REL.preencherTexto(txt, f.cat, f.gids, pg));
        for (const e of f.ev.slice(0, 4)) h.push(trechoHTML(e, pg, f.st !== "documentado"));
        if (f.r.nota) h.push('<p class="pequeno"><b>Anotação do revisor:</b> ' + esc(f.r.nota) + "</p>");
        const pr = (f.cr.prec || []).map(x => REL.precedente(x)).filter(Boolean);
        if (pr.length) h.push('<p class="pequeno"><b>Precedentes vinculados:</b> ' + esc(pr.map(p => (p.n ? "#" + p.n + " " : "") + p.proc).join("; ")) + ".</p>");
        h.push("</div>");
      }
      const docs = R.CRITERIOS.filter(cr => rc[cr.id] && ["documentado", "conforme"].includes(M.statusFinal(rc[cr.id])));
      if (docs.length) P("Etapas com documentação localizada, que a defesa deve conferir para verificar sua suficiência: " + docs.map(cr => minus(cr.titulo) + (rc[cr.id].pos.length ? " (" + REL.refs(rc[cr.id].pos.map(e => e.gid).slice(0, 3), pg) + ")" : "")).join("; ") + ".");
    });

    /* ---------- 6. inconsistências ---------- */
    S("Inconsistências documentais");
    if (!res.inconsistencias.length) P("Os confrontos automáticos entre peças (IMEI, lacres, hashes, pesos, capacidades de mídia e datas) não revelaram inconsistências objetivas.");
    for (const n of res.inconsistencias) {
      h.push('<div class="dz-falha"><div class="dz-falha-cab"><b>' + esc(n.titulo) + "</b> · " + (n.grav === "critico" ? "Crítica" : n.grav === "info" ? "Informativa" : "Relevante") + "</div>");
      P(n.texto + (n.gids.length ? " Localização: " + REL.refs(n.gids, pg) + "." : ""));
      if (n.prec && n.prec.length) h.push('<p class="pequeno"><b>Precedentes:</b> ' + esc(n.prec.map(x => REL.precedente(x)).filter(Boolean).map(p => (p.n ? "#" + p.n + " " : "") + p.proc).join("; ")) + ".</p>");
      h.push("</div>");
    }

    /* ---------- 7. alertas ---------- */
    S("Alertas identificados no texto");
    if (!res.alertas.length) P("Nenhuma das expressões de alerta monitoradas foi encontrada no texto dos autos.");
    else P("As expressões abaixo costumam revelar vícios na cadeia de custódia e merecem leitura atenta das passagens indicadas.");
    for (const a of res.alertas) {
      h.push("<h4>" + esc(a.rot) + " (" + a.ev.length + " ocorrência" + (a.ev.length > 1 ? "s" : "") + ")</h4>");
      for (const e of a.ev.slice(0, 8)) h.push(trechoHTML(e, pg, a.grav === "critico"));
      if (a.ev.length > 8) h.push('<p class="pequeno mudo">Demais ocorrências: ' + esc(REL.refs(a.ev.slice(8).map(e => e.gid), pg)) + ".</p>");
    }

    /* ---------- 8. identificadores ---------- */
    S("Identificadores localizados");
    const ids = res.identificadores; const grp = g => ({ apreensao: "Apreensão / ocorrência", constatacao: "Constatação", laudo: "Perícia", custodia: "Custódia / remessa", outros: "Outras peças" })[g] || g;
    const blocos = [
      ["IMEI", ["Valor", "Verificação", "Peça", "Localização"], ids.imei.map(x => '<tr><td class="mono">' + x.valor + "</td><td>" + (x.valido ? "válido" : "dígito verificador inválido") + "</td><td>" + grp(x.grupo) + "</td><td>" + esc(REL.refs([x.gid], pg)) + "</td></tr>")],
      ["Lacres", ["Numeração", "Peça", "Localização"], ids.lacres.map(x => '<tr><td class="mono">' + esc(x.valor) + "</td><td>" + grp(x.grupo) + "</td><td>" + esc(REL.refs([x.gid], pg)) + "</td></tr>")],
      ["Valores hash", ["Algoritmo", "Valor", "Peça", "Localização"], ids.hashes.map(x => "<tr><td>" + x.alg + '</td><td class="mono">' + x.valor + "</td><td>" + grp(x.grupo) + "</td><td>" + esc(REL.refs([x.gid], pg)) + "</td></tr>")],
      ["Massas e pesos", ["Valor", "Natureza", "Peça", "Localização"], ids.pesos.map(x => "<tr><td>" + x.gramas.toLocaleString("pt-BR", { maximumFractionDigits: 3 }) + " g</td><td>" + (x.rotulo ? "massa " + x.rotulo : "não especificada") + "</td><td>" + grp(x.grupo) + "</td><td>" + esc(REL.refs([x.gid], pg)) + "</td></tr>")],
      ["Capacidades de mídia", ["Valor", "Peça", "Localização"], ids.capacidades.map(x => "<tr><td>" + esc(x.valor) + "</td><td>" + grp(x.grupo) + "</td><td>" + esc(REL.refs([x.gid], pg)) + "</td></tr>")]
    ].filter(b => b[2].length);
    if (!blocos.length) P("Não foram localizados IMEIs, lacres, valores hash, pesos ou capacidades de mídia no texto.");
    for (const [t, c, l] of blocos) { h.push("<h4>" + t + "</h4>"); h.push(tabela(c, l.slice(0, 120))); }

    /* ---------- 9. cronologia ---------- */
    S("Cronologia");
    const vistos = new Set();
    const ev = res.linhaDoTempo.filter(d => { const k = d.iso + d.peca + d.gid; if (vistos.has(k)) return false; vistos.add(k); return true; }).slice(0, 150);
    if (!ev.length) P("Não foram localizadas datas associadas às peças classificadas.");
    else { P("Datas localizadas no início de cada peça, em ordem cronológica. Trata-se de estimativa automática: confira se cada data corresponde ao ato documentado."); h.push(tabela(["Data", "Peça", "Localização", "Contexto"], ev.map(d => "<tr><td>" + M.fmtData(d.iso) + "</td><td>" + esc(PECA(d.peca).rot) + "</td><td>" + esc(REL.refs([d.gid], pg)) + '</td><td class="pequeno">' + esc(d.t.antes.slice(-60) + d.t.alvo + d.t.depois.slice(0, 60)) + "</td></tr>"))); }

    /* ---------- 10. jurisprudência ---------- */
    const s10 = S("Jurisprudência aplicável e possibilidades de utilização");
    if (!aplic.length) P("Nenhum precedente da base guarda correspondência direta com as falhas apontadas.");
    else P("Os precedentes abaixo foram selecionados na base de " + PREC().filter(p => !p.complementar).length + " julgados do Superior Tribunal de Justiça que reconheceram a quebra da cadeia de custódia da prova digital (dossiê IJCrim), acrescida de precedentes complementares, e estão ordenados pelo grau de pertinência com as falhas deste caso. Para cada um, indicam-se as falhas a que se aplica, a controvérsia e a tese fixada, a forma de utilização sugerida, o desfecho e eventuais pontos de cautela.");
    const detalhados = aplic.filter(m => m.explicito || m.score >= 8).slice(0, 15);
    const resumidos = aplic.filter(m => !detalhados.includes(m));
    detalhados.forEach((m, i) => {
      const p = m.p; const nivel = m.score >= 9 ? "Alta" : m.score >= 4 ? "Média" : "Complementar";
      h.push('<div class="dz-prec"><h4>' + s10 + "." + (i + 1) + ". " + esc((p.n ? "#" + p.n + " · " : "") + p.proc) + '</h4><p class="pequeno mudo" style="margin-top:-4px">' + esc(p.tribunal + ", " + p.turma + ", Rel. " + p.rel + ", " + p.dje) + " · Pertinência " + nivel.toLowerCase() + (p.complementar ? " · precedente complementar, conferir o inteiro teor" : "") + "</p>");
      h.push("<p><b>" + esc(p.titulo) + "</b></p>");
      const fsP = m.fs.slice(0, 6);
      if (fsP.length) P("Falhas do caso a que se aplica: " + fsP.map(f => "nº " + f.num + ", " + minus(f.cr.titulo) + " (" + f.cat.curto.toLowerCase() + "; " + STATUS_FRASE[f.st] + (f.gids.length ? "; " + REL.refs(f.gids, pg) : "") + ")").join("; ") + (m.fs.length > 6 ? "; e outras " + (m.fs.length - 6) : "") + ".");
      if (m.incs && m.incs.length) P("Inconsistências do caso a que se aplica: " + m.incs.map(n => minus(n.titulo) + (n.gids.length ? " (" + REL.refs(n.gids.slice(0, 4), pg) + ")" : "")).join("; ") + ".");
      const qr = questoesRelevantes(p, Object.keys(m.tags).concat(p.tags));
      for (const q of qr.lista) h.push('<div class="dz-qa"><div><b>Controvérsia.</b> ' + esc(q.q) + "</div><div><b>Tese.</b> " + esc(semTrav(q.t)) + "</div></div>");
      if (qr.omitidas > 0) h.push('<p class="pequeno mudo">O acórdão enfrenta ainda ' + qr.omitidas + " outra(s) questão(ões), disponível(is) na Base jurídica da ferramenta e no inteiro teor.</p>");
      const textoTeses = qr.lista.map(q => (q.q + " " + q.t).toLowerCase()).join(" ");
      const cand = [...new Set(Object.keys(m.tags).concat(p.tags))].filter(t => PROPOSITO[t]);
      const nota = t => (m.tags[t] || 0) + (TAG_KW[t] && TAG_KW[t].test(textoTeses) ? 3 : 0) + (t === "onus" ? 0.5 : 0) + (t === "acesso" && /sem (pr[eé]via )?(autoriza|ordem)/.test(textoTeses) ? 3 : 0);
      const tag = cand.sort((a, b) => nota(b) - nota(a))[0] || "onus";
      const fsUso = m.fs.slice().sort((a, b) => ((CRIT_TAGS[b.cr.id] || []).includes(tag) ? 1 : 0) - ((CRIT_TAGS[a.cr.id] || []).includes(tag) ? 1 : 0) || a.num - b.num);
      const catsAlvo = [...new Set(m.fs.map(f => f.cat))];
      const ondeUsar = catsAlvo.length ? "no tópico relativo " + listaPt(catsAlvo.map(c => REL.contrair("a", c.artigo))) : "na fundamentação geral sobre a cadeia de custódia";
      P("Como utilizar: recomenda-se invocar o precedente " + ondeUsar + ", para demonstrar que " + PROPOSITO[tag] + ". A tese pode ser transcrita na forma acima, seguida da demonstração de que, no caso concreto, " + (fsUso.length ? fsUso.slice(0, 3).map(f => STATUS_FRASE[f.st] + " quanto " + REL.contrair("a", "a etapa de " + minus(f.cr.titulo)).replace(/^à etapa/, "à etapa") + (f.gids.length ? " (" + REL.refs(f.gids.slice(0, 3), pg) + ")" : "")).join("; ") : "as inconsistências indicadas se amoldam à mesma ratio") + ". Citação sugerida: " + REL.citacao(p) + ".");
      P("Desfecho no STJ: " + p.desfecho);
      if (CAUTELA[p.n]) P("Ponto de cautela: " + CAUTELA[p.n]);
      if (p.url) h.push('<p class="pequeno">Inteiro teor: <a href="' + esc(p.url) + '">' + esc(p.url) + "</a></p>");
      h.push("</div>");
    });
    if (resumidos.length) {
      h.push("<h4>" + s10 + "." + (detalhados.length + 1) + ". Precedentes relacionados por tema</h4>");
      P("Os julgados a seguir tratam dos mesmos temas das falhas apontadas, sem vínculo tão direto quanto os anteriores. Podem reforçar a fundamentação ou servir de alternativa caso algum dos precedentes principais seja distinguido.");
      h.push(tabela(["Nº", "Processo", "Questão central", "Temas em comum", "Falhas relacionadas"], resumidos.map(m => "<tr><td>" + (m.p.n || "+") + "</td><td>" + esc(m.p.proc + ", " + m.p.turma + ", " + m.p.dje) + "</td><td>" + esc(m.p.titulo) + "</td><td class=\"pequeno\">" + esc(Object.keys(m.tags).map(t => ({ acesso: "acesso sem ordem", hash: "hash", extracao: "extração", prints: "prints", copia: "cópia integral", original: "extravio/original", intercept: "interceptação", nuvem: "nuvem", midia: "áudio e vídeo", onus: "ônus do Estado", pericia: "perícia", derivada: "derivadas", whatsapp: "WhatsApp" })[t] || t).join(", ")) + "</td><td>" + esc(m.fs.map(f => "nº " + f.num).slice(0, 10).join(", ")) + "</td></tr>")));
    }
    const usados = new Set(aplic.map(m => m.p.id));
    const restantes = PREC().filter(p => !usados.has(p.id));
    if (restantes.length) {
      h.push("<h4>" + s10 + "." + (detalhados.length + (resumidos.length ? 2 : 1)) + ". Demais precedentes da base</h4>");
      P("Os precedentes a seguir não guardam correspondência direta com as falhas apontadas, mas integram a base e podem ser úteis para a fundamentação geral ou para desdobramentos do caso.");
      h.push(tabela(["Nº", "Processo", "Questão central", "Desfecho"], restantes.map(p => "<tr><td>" + (p.n || "+") + "</td><td>" + esc(p.proc + ", " + p.turma) + "</td><td>" + esc(p.titulo) + "</td><td class=\"pequeno\">" + esc(semTrav(p.desfecho)) + "</td></tr>")));
    }

    /* ---------- 11. cautela ---------- */
    S("Precedentes que exigem cautela");
    P("Os julgados abaixo, embora reconheçam vícios na cadeia de custódia, preservaram a acusação com base em provas independentes ou admitiram a renovação da prova. A acusação poderá invocá-los, razão pela qual convém antecipar a resposta, demonstrando o nexo de dependência entre a prova viciada e os demais elementos (art. 157, §§ 1º e 2º, do CPP).");
    h.push(tabela(["Nº", "Processo", "Questão central", "Por que exige cautela"], Object.keys(CAUTELA).map(n => REL.precedente(+n)).filter(Boolean).map(p => "<tr><td>" + p.n + "</td><td>" + esc(p.proc + ", " + p.turma) + "</td><td>" + esc(p.titulo) + "</td><td class=\"pequeno\">" + esc(CAUTELA[p.n]) + "</td></tr>")));

    /* ---------- 12. legislação ---------- */
    S("Fundamentos legais aplicáveis");
    const fundTxt = fs.map(f => f.cr.fund).join(" ") + " 158-A 158-B 157";
    const L = (window.HUB_LEGISLACAO || []).filter(l => {
      const art = l.artigo.replace(/^Arts?\. /, "").split(/[ ,]/)[0];
      if (l.id === "cf-5") return /CF/.test(fundTxt);
      if (l.id === "sv-14") return /SV 14|Súmula Vinculante 14/.test(fundTxt);
      if (l.id === "mci-7") return /12\.965/.test(fundTxt);
      if (l.id === "l11343-50") return /11\.343/.test(fundTxt);
      if (l.id === "l9296") return /9\.296/.test(fundTxt);
      if (l.id === "iso-27037") return /27037/.test(fundTxt);
      if (l.id === "senasp-82") return false;
      return fundTxt.indexOf(art) >= 0;
    });
    P("Dispositivos invocados nas falhas apontadas, com a respectiva redação para consulta e transcrição.");
    for (const l of L) { h.push("<h4>" + esc(l.diploma + ", " + l.artigo + " · " + l.rotulo) + "</h4>"); h.push('<p class="dz-lei">' + esc(l.texto).replace(/\n/g, "<br>") + "</p>"); if (l.nota) h.push('<p class="pequeno mudo">' + esc(l.nota) + "</p>"); }

    /* ---------- 13. doutrina ---------- */
    S("Doutrina de apoio");
    const temDig = ativos.some(c => CAT(c.id).familia === "digital");
    const D = (window.HUB_DOUTRINA || []).filter(d => temDig || d.id !== "iso");
    P("Sínteses doutrinárias para apoio à fundamentação. As passagens devem ser conferidas nas obras antes de transcritas.");
    for (const d of D) { h.push("<h4>" + esc(d.autor) + "</h4>"); for (const ideia of d.ideias) P(ideia); h.push('<p class="pequeno mudo">' + esc(d.ref) + "</p>"); }

    /* ---------- 14. diligências ---------- */
    S("Diligências e requerimentos recomendados");
    const dil = new Map();
    for (const f of fs) {
      const k = DILIG[f.cr.id] ? f.cr.id : DILIG_ALIAS[f.cr.id]; if (!k) continue;
      const atual = dil.get(k) || { k, cats: [], falhas: [] };
      if (!atual.cats.includes(f.cat)) atual.cats.push(f.cat);
      atual.falhas.push(f); dil.set(k, atual);
    }
    if (!dil.size) P("Não há diligências específicas recomendadas a partir das falhas apontadas.");
    for (const d of dil.values()) {
      const t = DILIG[d.k].replace(/relativo \{v\}/, "relativo " + listaPt(d.cats.map(c => REL.contrair("a", c.artigo)))).replace(/\{v\}/g, d.cats[0].artigo);
      P(d.cats.map(c => c.curto).join(" e ") + ". " + t + " Falha(s) relacionada(s): " + d.falhas.map(f => "nº " + f.num).join(", ") + (d.falhas.some(f => f.gids.length) ? "; localização: " + REL.refs([].concat(...d.falhas.map(f => f.gids)).slice(0, 6), pg) : "") + ".");
    }
    if (dil.size) P("Em síntese, as diligências acima destinam-se a compelir o Estado a demonstrar, documentalmente, a integridade e a rastreabilidade dos vestígios, ônus que lhe incumbe. Sua não satisfação reforça a tese de inadmissibilidade, motivo pelo qual se recomenda requerê-las com a expressa advertência de que a omissão conduzirá ao reconhecimento da quebra da cadeia de custódia.");

    /* ---------- 15. riscos ---------- */
    S("Riscos e contra-argumentos previsíveis");
    P("O primeiro contra-argumento previsível é o de que a irregularidade na cadeia de custódia não gera, por si só, nulidade ou inadmissibilidade, devendo ser apenas valorada pelo julgador (STJ, HC 653.515/RJ). A resposta está no próprio fundamento do instituto: sem a documentação dos elos, não há parâmetro objetivo para a valoração, e o ônus de demonstrar a integridade é do Estado (AgRg no RHC 143.169/RJ; AgRg no AREsp 2.985.235/MT).");
    P("O segundo é a existência de provas independentes que sustentariam, por si, a acusação (art. 157, §§ 1º e 2º, do CPP), linha que preservou condenações nos precedentes indicados no item 11. Convém, por isso, mapear desde logo quais elementos do processo derivam da prova viciada, especialmente depoimentos de agentes que relatam o conteúdo acessado e relatórios policiais elaborados a partir dela.");
    if (fs.some(f => f.cr.id === "D01")) P("Quanto ao acesso aos dados sem ordem judicial, é previsível a alegação de consentimento do titular, de fornecimento espontâneo da senha ou de urgência. O STJ só admite o acesso imediato em hipótese de urgência excepcional, aferida concretamente (RHC 76.324/DF), considera ineficaz a autorização judicial posterior à devassa (HC 454.396/SP) e afastou o consentimento do investigado e a autorização posterior como fatores de convalidação quando evidenciado o nexo com o ato originariamente ilícito (AgRg no HC 1.041.047/GO).");
    if (fs.some(f => f.cr.id === "D10" || f.cat.id === "mensagens")) P("Quanto às capturas de tela, a acusação poderá sustentar que foram fornecidas pela vítima ou corroboradas por outros elementos. A jurisprudência recente tem exigido mecanismos de verificação de autenticidade, inclusive quando os prints são produzidos pela própria vítima (AREsp 3.126.435/MT; AREsp 3.132.918/RS), o que deve ser enfrentado com a demonstração de que não houve perícia nem extração forense.");
    P("Por fim, recomenda-se arguir a quebra da cadeia de custódia na primeira oportunidade processual, em regra na resposta à acusação, para afastar a alegação de preclusão. Se o vício só se revelar posteriormente, por exemplo em perícia requerida pela defesa, a arguição deve ser feita assim que ele se tornar conhecido, hipótese em que o STJ afastou a preclusão mesmo após a pronúncia (AgRg no HC 902.195/RS).");

    /* ---------- 16. limitações ---------- */
    S("Limitações da análise");
    P("A verificação é automatizada e depende da qualidade do texto dos autos. A situação \"não localizado\" indica ausência de registro no material analisado, e não necessariamente a inexistência do ato. Páginas manuscritas, carimbos e tabelas complexas podem não ter sido reconhecidos. Os identificadores marcados como inferidos foram atribuídos por continuidade, a partir da página anterior, e devem ser conferidos.");
    if (res.paginasBaixaConf.length) P("Páginas lidas por OCR com baixa confiança, a conferir manualmente: " + REL.refs(res.paginasBaixaConf.slice(0, 60), pg) + ".");
    if (res.paginasVazias.length) P("Páginas sem texto legível: " + REL.refs(res.paginasVazias.slice(0, 60), pg) + ".");
    P("Este dossiê não constitui laudo pericial nem parecer e deve ser revisado pelo profissional responsável antes de qualquer utilização processual.");

    if (res.ia && res.ia.resultado) {
      S("Análise complementar por IA");
      const ia = res.ia.resultado;
      P("Análise gerada pelo modelo " + res.ia.modelo + " em " + new Date(res.ia.em).toLocaleString("pt-BR") + ", a ser conferida nas páginas indicadas.");
      P(ia.sintese);
      for (const a of ia.achados || []) P((CAT(a.categoria) || { curto: a.categoria }).curto + ", " + a.criterio + " (" + a.status + "; " + (a.paginas || []).join(", ") + "): " + a.fundamentacao);
      if (ia.estrategia) P("Estratégia sugerida: " + ia.estrategia);
      for (const d of ia.diligencias || []) P("Diligência sugerida: " + d);
    }

    /* ---------- anexo ---------- */
    sec++; h.push('<h3 id="dz' + sec + '" class="dz-anexo">Anexo: minuta de tese</h3>');
    h.push(REL.minutaHTML(est).replace(/<h3>/g, "<h4>").replace(/<\/h3>/g, "</h4>"));
    return h.join("\n");
  }

  /* ---------------------------------------------------------------- relatório resumido */
  function resumo(est) {
    const pg = est.paginas, res = est.res, caso = est.caso || {};
    const ativos = res.categorias.filter(c => c.ativo);
    const fs = falhas(est);
    const aplic = aplicabilidade(est, fs).filter(m => m.explicito || m.score >= 8);
    const h = [];
    const P = t => h.push("<p>" + esc(semTrav(t)) + "</p>");
    const listaPt = a => a.length > 1 ? a.slice(0, -1).join(", ") + " e " + a[a.length - 1] : (a[0] || "");
    const cita = e => {
      const p = pg[e.gid];
      if (p && M.limitesFrase) {
        const [a, b] = M.limitesFrase(p.norm, e.ini, e.fim); const base = p.alinhado ? p.texto : p.norm;
        let t = base.slice(a, b).trim(); if (t.length > 280) { t = t.slice(0, 280); t = t.slice(0, t.lastIndexOf(" ")) + " (…)"; }
        return "“" + t + "”";
      }
      return "“" + (e.antes + e.alvo + e.depois).replace(/^…\s*|\s*…$/g, "").trim() + "”";
    };
    let n = 0; const H = t => { n++; h.push("<h3>" + n + ". " + esc(t) + "</h3>"); };
    const hoje = new Date();

    h.push('<div class="rel-cab"><div class="rel-marca"><span class="marca-tpc">TPC</span> <span>ADVOGADOS · HUB CRIMINAL</span></div><div class="mudo pequeno">Documento sigiloso. Uso exclusivo da defesa.</div></div>');
    h.push('<h2 style="margin-bottom:4px">Relatório resumido da cadeia de custódia</h2><p class="mudo" style="margin-top:0">' + esc([caso.autos ? "Autos " + caso.autos : "", caso.assistido, "gerado em " + hoje.toLocaleDateString("pt-BR")].filter(Boolean).join(" · ")) + "</p>");

    /* 1. conclusão */
    H("Conclusão");
    const niveis = ativos.map(c => ({ c, cat: CAT(c.id), k: M.classificar(res.criterios[c.id] || {}) }));
    const quebra = niveis.filter(x => x.k.nivel === "quebra"), frageis = niveis.filter(x => x.k.nivel === "fragil" || x.k.nivel === "formal");
    const decisivos = fs.filter(f => f.cr.peso === "critico" && f.st === "irregular");
    if (!ativos.length) P("Nenhum vestígio sujeito à cadeia de custódia teve sua apreensão, coleta, exame ou juntada confirmada nos autos analisados.");
    else if (quebra.length) {
      P("A análise indica a quebra da cadeia de custódia relativa " + listaPt(quebra.map(x => REL.contrair("a", x.cat.artigo))) + (decisivos.length ? ", sobretudo em razão de " + listaPt([...new Set(decisivos.slice(0, 4).map(f => minus(f.cr.titulo)))]) : ", pela ausência de documentação de elos críticos da cadeia") + "." + (frageis.length ? " Há, ainda, fragilidades relevantes quanto " + listaPt(frageis.map(x => REL.contrair("a", x.cat.artigo))) + "." : ""));
      P("Recomenda-se arguir a inadmissibilidade dos elementos assim obtidos e das provas deles derivadas (art. 157, caput e § 1º, do CPP), com fundamento no ônus estatal de demonstrar a integridade da fonte de prova (AgRg no RHC 143.169/RJ), e requerer, subsidiariamente, as providências indicadas no item 5.");
    } else if (frageis.length) {
      P("A análise não revela, por ora, vício documentado de natureza crítica, mas aponta fragilidades relevantes quanto " + listaPt(frageis.map(x => REL.contrair("a", x.cat.artigo))) + ". Recomenda-se requerer as providências indicadas no item 5, para compelir o Estado a documentar os elos faltantes, sob pena de inadmissibilidade, sem prejuízo da valoração das fragilidades.");
    } else P("Não foram identificadas falhas relevantes nas etapas verificadas. Recomenda-se conferir manualmente as páginas de baixa legibilidade e as peças eventualmente não anexadas.");

    /* 2. vestígios */
    H("Vestígios analisados");
    if (niveis.length) h.push(tabela(["Vestígio", "Classificação", "Conformidade", "Ponto central"], niveis.map(x => {
      const f = fs.find(y => y.cat.id === x.c.id);
      return "<tr><td>" + x.cat.icone + " " + esc(x.cat.nome) + "</td><td><b>" + esc(x.k.rot) + "</b></td><td>" + x.k.conformidade + "%</td><td>" + (f ? esc(f.cr.titulo + " (" + REL.STATUS[f.st].rot.toLowerCase() + (f.gids.length ? "; " + REL.refs(f.gids.slice(0, 2), pg) : "") + ")") : "sem falhas relevantes") + "</td></tr>";
    })));
    const descartados = res.categorias.filter(c => !c.ativo && (c.mencoes || 0) > 0 && c.veredito !== "confirmado");
    if (descartados.length) P("Não integram a análise, por terem sido apenas mencionados nos autos, sem registro de apreensão, coleta, exame ou juntada: " + listaPt(descartados.map(c => minus(CAT(c.id).nome) + " (" + ((c.negacoes || [])[0] || (c.descartes || [])[0] || { motivo: "menção sem registro" }).motivo + ")")) + ".");

    /* 3. pontos decisivos */
    H("Pontos decisivos");
    const ordem = f => (f.cr.peso === "critico" ? 0 : 3) + (f.st === "irregular" ? 0 : f.st === "controverso" ? 1 : 2);
    const pontos = fs.filter(f => f.cr.peso !== "formal").slice().sort((a, b) => ordem(a) - ordem(b) || a.num - b.num);
    const incs = res.inconsistencias.filter(x => x.grav === "critico");
    const itens = [];
    /* agrupa a mesma falha verificada em vestígios distintos, com a mesma prova */
    const grupos = [];
    for (const f of pontos) {
      const chave = f.cr.id + "|" + f.st + "|" + [...new Set(f.gids)].sort().join(",");
      const g = grupos.find(x => x.chave === chave);
      if (g) g.fs.push(f); else grupos.push({ chave, fs: [f], f });
    }
    for (const g of grupos.filter(g => ordem(g.f) <= 1).slice(0, 5)) itens.push({ g });
    for (const x of incs.slice(0, 3)) itens.push({ x });
    for (const g of grupos.filter(g => ordem(g.f) > 1)) { if (itens.length >= 8) break; itens.push({ g }); }
    if (!itens.length) P("Não há pontos decisivos a destacar.");
    itens.forEach((it, i) => {
      if (it.g) {
        const f = it.g.f; const e = f.ev[0]; const fsg = it.g.fs;
        P((i + 1) + ". " + f.cr.titulo + " (" + listaPt(fsg.map(x => x.cat.curto.toLowerCase())) + "; " + (fsg.length > 1 ? "falhas nº " + listaPt(fsg.map(x => String(x.num))) : "falha nº " + f.num) + " do dossiê). " + (f.st === "ausente" ? "Não se localiza nos autos documentação relativa a esta etapa, exigida pelo " + f.cr.fund.replace(/^CPP, /, "CPP, ") + "." : (f.st === "irregular" ? "Há registro de vício nos próprios autos" : "Há indícios contraditórios nos autos") + (e ? ": " + cita(e) + " (" + REL.refs([e.gid], pg) + ")." : ".")) + (f.r.nota ? " Anotação: " + f.r.nota : ""));
      } else {
        const x = it.x;
        P((i + 1) + ". " + x.titulo + ". " + x.texto.replace(/\.\s*$/, "") + (x.gids.length ? " (" + REL.refs([...new Set(x.gids)].slice(0, 3), pg) + ")." : "."));
      }
    });

    /* 4. precedentes */
    H("Precedentes-chave");
    if (!aplic.length) P("Nenhum precedente da base guarda correspondência direta com as falhas apontadas.");
    aplic.slice(0, 4).forEach(m => {
      const p = m.p;
      P(p.proc + " (" + p.turma + ", " + p.dje + "): " + REL.tesePrincipal(p) + ". Aplica-se, no caso, " + (m.fs.length ? "às falhas nº " + m.fs.slice(0, 5).map(f => f.num).join(", ") : "às inconsistências documentais apontadas") + "." + (CAUTELA[p.n] ? " Cautela: " + CAUTELA[p.n] : ""));
    });

    /* 5. providências */
    H("Providências prioritárias");
    const dil = new Map();
    for (const f of pontos) {
      const k = DILIG[f.cr.id] ? f.cr.id : DILIG_ALIAS[f.cr.id]; if (!k) continue;
      const atual = dil.get(k) || { k, cats: [], nums: [] }; if (!atual.cats.includes(f.cat)) atual.cats.push(f.cat); atual.nums.push(f.num); dil.set(k, atual);
    }
    const dl = [...dil.values()].slice(0, 5);
    if (!dl.length) P("Não há providências específicas a recomendar.");
    dl.forEach((d, i) => P((i + 1) + ". " + DILIG[d.k].replace(/relativo \{v\}/, "relativo " + listaPt(d.cats.map(c => REL.contrair("a", c.artigo)))).replace(/\{v\}/g, d.cats[0].artigo)));

    /* 6. atenção */
    H("Pontos de atenção");
    P("A acusação poderá sustentar que a irregularidade não gera, por si só, a inadmissibilidade da prova (HC 653.515/RJ) e que há provas independentes aptas a sustentar a imputação (art. 157, §§ 1º e 2º, do CPP). Convém demonstrar desde logo que os demais elementos derivam da prova viciada ou dela dependem.");
    if (fs.some(f => f.cr.id === "D01" && f.st !== "ausente")) P("Quanto ao acesso aos dados sem ordem judicial, é previsível a alegação de consentimento ou de fornecimento da senha; o STJ afastou esses fatores de convalidação quando evidenciado o nexo com o ato ilícito (AgRg no HC 1.041.047/GO).");
    if (res.paginasBaixaConf.length) P("Há " + res.paginasBaixaConf.length + " página(s) de baixa legibilidade que devem ser conferidas manualmente antes da utilização processual.");
    h.push('<p class="pequeno mudo">Este resumo sintetiza a análise. A fundamentação integral, os trechos dos autos, a jurisprudência completa e a minuta constam do dossiê completo.</p>');
    return h.join("\n");
  }

  window.CC_DOSSIE = { gerar, resumo, falhas, aplicabilidade };
})();
