/* Audiência de custódia: leitura do auto de prisão em flagrante, análise da legalidade da prisão e dos requisitos da
   preventiva, e redação do requerimento escrito e do roteiro oral (relaxamento, liberdade provisória, cautelares e
   prisão domiciliar). Base: CPP, arts. 302 a 310, 312 a 316, 318, 318-A, 319 e 321 a 350, na redação vigente (Leis
   13.964/2019, 15.272 e 15.358/2026); doutrina de Aury Lopes Jr., Eugênio Pacelli e Gustavo Badaró. */
(function (root) {
  "use strict";
  const K = root.EC_CATALOGO;
  const sem = s => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  const lista = a => (a.length <= 1 ? a.join("") : a.slice(0, -1).join(", ") + " e " + a[a.length - 1]);

  /* ------------------------------------------------------------------ leitura do auto */
  function trecho(pg, idx, tam) {
    tam = tam || 220; const t = pg.texto, a = Math.max(0, idx - Math.round(tam * 0.4)), b = Math.min(t.length, idx + Math.round(tam * 0.6));
    return (a > 0 ? "(...) " : "") + t.slice(a, b).replace(/\s+/g, " ").trim() + (b < t.length ? " (...)" : "");
  }
  function achar(pgs, re) { for (const pg of pgs) { const m = re.exec(pg.low); if (m) return { pg, idx: m.index, m }; } return null; }
  const ev = (a, rot) => (a ? { ref: a.pg.ref, trecho: trecho(a.pg, a.idx), rot } : null);

  /* pgs: páginas do EC_ANALISE.paginas (com .low sem acento); itens: EC_ANALISE.pecas; crimes: EC_ANALISE.crimes */
  function extrair(pgs, itens, crimes) {
    const S = K.SINAIS, out = { sug: {}, prova: {}, crimes: [] };
    const set = (k, v, a, rot) => { out.sug[k] = v; if (a) out.prova[k] = ev(a, rot); };
    const apf = itens.filter(i => i.id === "apf").flatMap(i => i.pgs);
    const base = apf.length ? apf.concat(pgs.filter(p => !apf.includes(p))) : pgs;
    /* data e hora da prisão */
    let a = achar(base, /(data\s*(e|\/)\s*hora|hora)\s*(da prisao|do fato|do flagrante|da ocorrencia|da conducao)[^0-9]{0,25}(\d{2})\/(\d{2})\/(\d{4})[^0-9]{0,15}(\d{1,2})\s*[:h]\s*(\d{2})/);
    if (!a) a = achar(base, /(foi preso|deu voz de prisao|voz de prisao|foi detid|foi conduzid|efetuou a prisao)[^.]{0,120}?(\d{2})\/(\d{2})\/(\d{4})[^0-9]{0,30}(\d{1,2})\s*[:h]\s*(\d{2})/);
    if (a) { const g = a.m.slice(-5); set("prisao", { data: g[2] + "-" + g[1] + "-" + g[0], hora: g[3].padStart(2, "0") + ":" + g[4] }, a, "Data e hora da prisão"); }
    /* comunicação ao juiz */
    a = achar(base, /(?:comunica\w*|encaminh\w*|remet\w*)[^.]{0,60}(?:ao|a) (?:meritissimo |exm[oa]\.? )?(?:juiz|juizo|poder judiciario|plantao judiciario|central de (?:audiencias de )?custodia)[^.]{0,90}?\d{2}\/\d{2}\/\d{4}(?:[^0-9]{0,15}\d{1,2}\s*[:h]\s*\d{2})?/);
    if (a) { const m = /(\d{2})\/(\d{2})\/(\d{4})(?:[^0-9]{0,15}(\d{1,2})\s*[:h]\s*(\d{2}))?/.exec(a.m[0].slice(a.m[0].search(/\d{2}\/\d{2}\/\d{4}/))); set("comunicacao", { data: m[3] + "-" + m[2] + "-" + m[1], hora: m[4] ? m[4].padStart(2, "0") + ":" + m[5] : "" }, a, "Comunicação ou encaminhamento ao juiz"); }
    /* nota de culpa */
    a = achar(pgs, /nota de culpa/); set("notaCulpa", a ? "sim" : "nc", a, "Nota de culpa");
    /* advertência do direito ao silêncio */
    a = achar(pgs, S.silencio); set("silencio", a ? "sim" : "nc", a, "Advertência do direito ao silêncio");
    /* defensor no interrogatório */
    const interr = itens.filter(i => i.id === "interrogatorio").flatMap(i => i.pgs);
    a = achar(interr.length ? interr : base, /(advogad[oa]|defensor[a]?|defensoria publica)[^.]{0,40}(present|acompanh|assist|constitu)|acompanhad[oa] (de|por) (seu )?(advogad|defensor)/); set("defensor", a ? "sim" : "nc", a, "Assistência de advogado ou Defensoria");
    /* comunicação à família */
    a = achar(pgs, /(comunica\w*|contato|ciencia|avisad)[^.]{0,80}(familia|familiar|esposa|companheir|mae|pai|irma|irmao|pessoa (por ele |por ela )?indicada)/); set("familia", a ? "sim" : "nc", a, "Comunicação à família");
    /* exame de corpo de delito e relato de agressão */
    a = achar(pgs, /exame (de )?corpo de delito|exame de lesoes|laudo de lesoes|\becd\b/); set("corpoDelito", a ? "sim" : "nc", a, "Exame de corpo de delito");
    a = achar(pgs, /(foi |fora |teria sido )?(agredid|espancad|apanhou)|lesoes? (aparentes|visiveis|na regiao)|escoriac|hematoma|spray de pimenta|tortur|socos? e chutes|chutes? e socos/); set("agressao", a ? "sim" : "nao", a, "Relato ou sinal de agressão");
    a = achar(pgs, /algem/); if (a) { out.sug.algemas = "verificar"; out.prova.algemas = ev(a, "Uso de algemas"); }
    /* filhos (art. 304, § 4º) */
    a = achar(pgs, /(possui|tem|pai de|mae de)\s*(\d+|um|uma|dois|duas|tres)\s*filh|filh[oa]s? menor|nao possui filhos|sem filhos/); set("filhos", a ? (/nao possui|sem filhos/.test(a.m[0]) ? "nao" : "sim") : "nc", a, "Informação sobre filhos (art. 304, § 4º)");
    /* testemunhas */
    const dep = itens.filter(i => i.id === "depoimento"), test = dep.filter(i => i.sub === "testemunha").length, pol = dep.filter(i => i.sub === "policial").length;
    out.sug.testemunhas = { civis: test, policiais: pol, achou: dep.length > 0 }; if (dep.length) out.prova.testemunhas = { ref: dep.map(i => i.ref).join("; "), trecho: test + " termo(s) de testemunha civil e " + pol + " de policial", rot: "Depoimentos" };
    /* ingresso em domicílio, busca pessoal, reconhecimento, confissão informal */
    a = achar(pgs, S.domicilio); if (a) { const mand = achar(pgs, S.mandadoBusca), cons = achar([a.pg], S.consentimento); set("domicilio", mand ? "mandado" : cons ? "consentimento" : "sem", a, "Ingresso em domicílio"); }
    a = achar(pgs, S.suspeitaFragil); if (a) set("busca", "fragil", a, "Fundamento da abordagem"); else { a = achar(pgs, S.buscaPessoal); if (a) set("busca", "verificar", a, "Busca pessoal"); }
    a = achar(pgs, S.reconhecimento); if (a) set("reconhecimento", "irregular", a, "Reconhecimento");
    a = achar(pgs, S.confissaoInformal); if (a) set("confissaoInformal", "sim", a, "Confissão informal relatada");
    /* antecedentes, violência doméstica, arma de uso restrito, drogas, excludente */
    a = achar(pgs, S.reincidencia); if (a) set("reincidente", true, a, "Indicação de reincidência ou maus antecedentes");
    a = achar(pgs, S.primario); if (a && !out.sug.reincidente) set("primario", true, a, "Indicação de primariedade");
    a = achar(pgs, S.violenciaDomestica); if (a) set("vd", true, a, "Violência doméstica");
    a = achar(pgs, /uso restrito/); if (a) set("armaRestrito", true, a, "Arma de uso restrito");
    a = achar(pgs, /(\d+(?:[.,]\d+)?)\s*(g|gramas|kg|quilos?)\b[^.]{0,60}(maconha|cocaina|crack|droga|substancia|entorpecente)|(maconha|cocaina|crack)[^.]{0,60}?(\d+(?:[.,]\d+)?)\s*(g|gramas|kg|quilos?)\b/);
    if (a) set("droga", a.m[0], a, "Quantidade de droga");
    a = achar(pgs, /legitima defesa|estado de necessidade|estrito cumprimento do dever legal|exercicio regular de direito/); if (a) set("excludente", "verificar", a, "Menção a excludente de ilicitude");
    out.crimes = (crimes || []).map(c => ({ rot: c.nome + " (" + (c.d === "CP" ? "CP, art. " + c.a : "Lei " + c.d + ", art. " + c.a) + ")", d: c.d, a: c.a, max: c.pena[1], min: c.pena[0], violencia: !!c.violencia, ref: (c.pgs || []).slice(0, 3).map(p => p.ref).join("; ") }));
    return out;
  }

  /* ------------------------------------------------------------------ análise */
  const INAFIANCAVEIS = [["11.343", "33"], ["11.343", "35"], ["CP", "217-A"], ["CP", "213"]];
  const HEDIONDOS = [["CP", "217-A"], ["CP", "213"]];
  const horas = (a, b) => (b - a) / 36e5;
  const dt = x => (x && x.data ? new Date(x.data + "T" + (x.hora || "00:00") + ":00") : null);

  /* d: dados do formulário (ver app.js) */
  function analisar(d) {
    const r = { relax: [], liberdade: [], alertas: [], cautelares: [], domiciliar: null, fianca: null, prazos: {} };
    const crimes = d.crimes || [], maxPena = crimes.reduce((m, c) => Math.max(m, +c.max || 0), 0), minPena = crimes.reduce((m, c) => Math.max(m, +c.min || 0), 0);
    const violento = crimes.some(c => c.violencia), trafico = crimes.some(c => c.d === "11.343" && c.a === "33");
    const p = dt(d.prisao), com = dt(d.comunicacao), cus = dt(d.custodia);
    if (p && com) r.prazos.comunicacao = horas(p, com);
    if (p && cus) r.prazos.custodia = horas(p, cus);
    const f = d.flags || {};

    /* I. legalidade (relaxamento) */
    if (d.especie === "nao") r.relax.push({ id: "especie", t: "Ausência de situação de flagrância", f: "CF, art. 5º, LXI; CPP, art. 302" });
    if (d.especie === "preparado") r.relax.push({ id: "preparado", t: "Flagrante preparado ou provocado", f: "Súmula 145 do STF; CPP, art. 302" });
    if ((d.especie === "III" || d.especie === "IV") && f.lapso) r.relax.push({ id: "lapso", t: "Dilatação indevida do “logo após” ou do “logo depois”", f: "CPP, art. 302, III e IV" });
    if (r.prazos.comunicacao > 24 || f.comunicacao === "nao") r.relax.push({ id: "comunicacao", t: "Encaminhamento do auto ao juiz fora do prazo de 24 horas", f: "CF, art. 5º, LXII; CPP, art. 306, § 1º" });
    if (f.notaCulpa === "nao") r.relax.push({ id: "notaCulpa", t: "Ausência de entrega da nota de culpa", f: "CF, art. 5º, LXIV; CPP, art. 306, § 2º" });
    if (f.familia === "nao") r.relax.push({ id: "familia", t: "Ausência de comunicação à família ou à pessoa indicada", f: "CF, art. 5º, LXII; CPP, art. 306, caput" });
    if (f.silencio === "nao") r.relax.push({ id: "silencio", t: "Ausência de advertência do direito ao silêncio", f: "CF, art. 5º, LXIII; CPP, art. 186" });
    if (f.ordem304 === "nao" || f.testemunhas === "nao") r.relax.push({ id: "auto", t: "Vício formal na lavratura do auto", f: "CPP, art. 304, caput e § 2º" });
    if (f.domicilio === "sem") r.relax.push({ id: "domicilio", t: "Ingresso em domicílio sem mandado e sem fundadas razões", f: "CF, art. 5º, XI e LVI; CPP, art. 157; STF, RE 603.616 (Tema 280)" });
    if (f.busca === "fragil") r.relax.push({ id: "busca", t: "Busca pessoal sem fundada suspeita", f: "CPP, arts. 240, § 2º, e 244; STJ, RHC 158.580/BA" });
    if (f.algemas === "sim") r.relax.push({ id: "algemas", t: "Uso injustificado de algemas", f: "Súmula Vinculante 11" });
    if (f.agressao === "sim") r.relax.push({ id: "agressao", t: "Relato ou sinais de violência policial", f: "CF, art. 5º, III e XLIX; Resolução CNJ 213/2015; STF, ADPF 347" });
    if (r.prazos.custodia > 48 && !f.custodiaJustificada) r.relax.push({ id: "custodia", t: "Audiência de custódia realizada após o prazo legal sem motivação idônea", f: "CPP, art. 310, caput e § 4º (observada a interpretação das ADIs 6.298, 6.300 e 6.305)" });
    if (f.entrevista === "nao" || f.privacidade === "nao" || f.falha === "sim") r.relax.push({ id: "garantias", t: "Violação das garantias da audiência por videoconferência", f: "CPP, art. 310, §§ 9º, 10 e 11" });

    const ORDEM = ["especie", "preparado", "domicilio", "busca", "custodia", "comunicacao", "notaCulpa", "silencio", "algemas", "agressao", "auto", "familia", "lapso", "garantias"];
    r.relax.sort((x, y) => ORDEM.indexOf(x.id) - ORDEM.indexOf(y.id));

    /* II. preventiva e liberdade provisória */
    const reinc = !!(d.pessoal && d.pessoal.reincidente);
    const hip313 = (maxPena > 48) || reinc || (d.risco && (d.risco.vd || d.risco.orcrimUltra));
    if (crimes.length && !hip313) r.liberdade.push({ id: "313", t: "Inadmissibilidade da preventiva: crime com pena máxima não superior a quatro anos, autuado não reincidente e fora das hipóteses do art. 313", f: "CPP, art. 313" });
    if (d.excludente && d.excludente !== "nao") r.liberdade.push({ id: "excludente", t: "Indícios de excludente de ilicitude", f: "CPP, arts. 310, § 1º, e 314; CP, art. 23" });
    r.liberdade.push({ id: "fumus", t: "Fragilidade do fumus commissi delicti", f: "CPP, art. 312, caput", fraco: !(f.reconhecimento === "irregular" || f.confissaoInformal === "sim" || f.busca === "fragil" || f.domicilio === "sem") });
    r.liberdade.push({ id: "periculum", t: "Ausência de periculum libertatis concreto e contemporâneo", f: "CPP, arts. 312, §§ 2º e 4º, e 315, §§ 1º e 2º" });
    const pessoais = d.pessoal || {};
    if (pessoais.primario || pessoais.residencia || pessoais.trabalho) r.liberdade.push({ id: "pessoais", t: "Condições pessoais favoráveis", f: "CPP, art. 282, II" });
    if (crimes.length && !violento && (minPena <= 48 || trafico)) r.liberdade.push({ id: "homogeneidade", t: "Desproporcionalidade da prisão frente à provável pena", f: "CPP, art. 282, II; CP, arts. 33, § 2º, c, e 44" + (trafico ? "; Lei 11.343/2006, art. 33, § 4º; STF, HC 118.533" : "") });
    /* alertas dos §§ 2º e 5º do art. 310 */
    const rs = d.risco || {};
    if (reinc || rs.orcrimArmada || rs.milicia || rs.armaRestrito) r.alertas.push({ id: "310p2", t: "O § 2º do art. 310 prevê a denegação da liberdade provisória ao reincidente, ao integrante de organização criminosa armada ou milícia e a quem porta arma de uso restrito. A defesa deve sustentar que a vedação não dispensa a demonstração concreta dos requisitos do art. 312 (CF, arts. 5º, LXVI, e 93, IX; CPP, art. 315; STF, HC 104.339, sobre a inconstitucionalidade da vedação abstrata à liberdade provisória)." });
    const c5 = []; if (rs.reiteracao) c5.push("prática reiterada de infrações"); if (violento) c5.push("violência ou grave ameaça"); if (rs.liberadoCustodia) c5.push("liberação em custódia anterior"); if (rs.pendencia) c5.push("inquérito ou ação penal em curso"); if (rs.fuga) c5.push("fuga ou perigo de fuga");
    if (c5.length) r.alertas.push({ id: "310p5", t: "Há circunstâncias do § 5º do art. 310 (" + lista(c5) + "), que recomendam, mas não impõem, a conversão. O § 6º exige exame fundamentado, e o art. 312, § 4º, veda a prisão por gravidade abstrata: a resposta deve mostrar por que, no caso, as cautelares do art. 319 bastam." });
    if (rs.vd) r.alertas.push({ id: "vd", t: "Em violência doméstica, a preventiva é admitida para garantir medidas protetivas (art. 313, III). Ofereça desde logo o compromisso de cumprir as protetivas e a proibição de contato (art. 319, III)." });

    /* fiança */
    const inaf = crimes.some(c => INAFIANCAVEIS.some(([dd, aa]) => c.d === dd && c.a === aa)) || crimes.some(c => HEDIONDOS.some(([dd, aa]) => c.d === dd && c.a === aa));
    if (crimes.length) r.fianca = inaf ? { cabe: false, t: "Crime inafiançável (CPP, art. 323). A inafiançabilidade não impede a liberdade provisória sem fiança (STF, HC 104.339), que deve ser requerida." }
      : { cabe: true, faixa: maxPena > 48 ? "de 10 a 200 salários mínimos (art. 325, II)" : "de 1 a 100 salários mínimos (art. 325, I)", dispensa: d.economia === "baixa", t: "" };

    /* cautelares sugeridas */
    const cs = new Set(["I", "IV"]);
    if (pessoais.residencia && pessoais.trabalho) cs.add("V");
    if (rs.vd || crimes.some(c => c.violencia)) cs.add("III");
    if (rs.vd) cs.add("II");
    r.cautelares = [...cs];

    /* prisão domiciliar */
    const dom = [];
    if (pessoais.gestante) dom.push("gestante (art. 318, IV)");
    if (pessoais.maeFilho12) dom.push("mãe de filho de até 12 anos (art. 318, V)");
    if (pessoais.unicoResponsavel) dom.push("único responsável pelos cuidados de filho de até 12 anos (art. 318, VI)");
    if (pessoais.dependente6) dom.push("imprescindível aos cuidados de pessoa menor de 6 anos ou com deficiência (art. 318, III)");
    if (pessoais.doenteGrave) dom.push("extremamente debilitado por doença grave (art. 318, II)");
    if (pessoais.maior80) dom.push("maior de 80 anos (art. 318, I)");
    if (dom.length) r.domiciliar = { hipoteses: dom, obrigatoria: (pessoais.gestante || pessoais.maeFilho12 || (d.g === "f" && pessoais.dependente6)) && !violento && !rs.contraFilho };
    return r;
  }

  /* ------------------------------------------------------------------ redação */
  const AURY = "Aury Lopes Jr.", PACELLI = "Eugênio Pacelli", BADARO = "Gustavo Badaró";
  const ROT319 = { I: "comparecimento periódico em juízo para informar e justificar atividades (inciso I)", II: "proibição de acesso ou frequência a determinados lugares (inciso II)", III: "proibição de manter contato com pessoa determinada (inciso III)", IV: "proibição de ausentar-se da comarca (inciso IV)", V: "recolhimento domiciliar no período noturno e nos dias de folga (inciso V)", VI: "suspensão do exercício de função pública ou de atividade econômica (inciso VI)", VIII: "fiança (inciso VIII)", IX: "monitoração eletrônica (inciso IX)" };
  function partes(d) {
    const f = d.g === "f", advs = d.advogados || [], todasF = advs.length && advs.every(a => a.g === "f");
    return { A: f ? "A autuada" : "O autuado", a: f ? "a autuada" : "o autuado", da: f ? "da autuada" : "do autuado", ao: f ? "à autuada" : "ao autuado", ele: f ? "ela" : "ele", qual: f ? "qualificada" : "qualificado", presa: f ? "presa" : "preso", advs: advs.length === 1 ? (advs[0].g === "f" ? "por sua advogada que esta subscreve" : "por seu advogado que esta subscreve") : todasF ? "por suas advogadas que esta subscrevem" : "por seus advogados que esta subscrevem" };
  }
  const br = s => (s ? s.split("-").reverse().join("/") : "");
  const quando = x => (x && x.data ? br(x.data) + (x.hora ? ", às " + x.hora.replace(":", "h") : "") : "data não informada");

  const TXT_RELAX = {
    especie: (d, x) => "O auto não descreve qualquer das situações do art. 302 do Código de Processo Penal. " + x.A + " não estava cometendo a infração nem acabara de cometê-la, tampouco foi perseguido logo após ou encontrado logo depois com objetos que fizessem presumir a autoria. Sem situação de flagrância, a prisão só seria possível por ordem escrita e fundamentada da autoridade judiciária (CF, art. 5º, LXI), inexistente no caso.",
    preparado: (d, x) => "A narrativa revela flagrante preparado: a atuação policial induziu a prática do fato e, ao mesmo tempo, tornou impossível a sua consumação. Nos termos da Súmula 145 do Supremo Tribunal Federal, não há crime quando a preparação do flagrante pela polícia torna impossível a sua consumação, o que retira o próprio substrato da prisão.",
    lapso: (d, x) => "O auto invoca as hipóteses de flagrante impróprio ou presumido (art. 302, III e IV), mas o lapso entre o fato e a captura, sem perseguição contínua, desnatura o “logo após” e o “logo depois” exigidos pela lei, que não admitem interpretação ampliativa em matéria de restrição da liberdade.",
    comunicacao: (d, x) => "A prisão ocorreu em " + quando(d.prisao) + (d.comunicacao && d.comunicacao.data ? ", e o auto somente foi encaminhado ao juízo em " + quando(d.comunicacao) : ", e não há nos autos comprovação do encaminhamento ao juízo no prazo legal") + ". O art. 306, § 1º, do Código de Processo Penal fixa o prazo improrrogável de 24 horas para a remessa do auto ao juiz competente, garantia que concretiza o art. 5º, LXII, da Constituição.",
    notaCulpa: (d, x) => "Não consta dos autos a entrega da nota de culpa " + x.ao + ", com o motivo da prisão e os nomes do condutor e das testemunhas, como exige o art. 306, § 2º, do Código de Processo Penal, em concretização do direito à identificação dos responsáveis pela prisão (CF, art. 5º, LXIV).",
    familia: (d, x) => "Não houve comunicação da prisão à família ou à pessoa indicada " + x.da + ", em afronta ao art. 5º, LXII, da Constituição e ao caput do art. 306 do Código de Processo Penal.",
    silencio: (d, x) => x.A + " não foi advertido do direito de permanecer em silêncio antes de ser interrogado, em violação ao art. 5º, LXIII, da Constituição e ao art. 186 do Código de Processo Penal. As declarações assim obtidas são imprestáveis e contaminam o auto que nelas se apoia.",
    auto: (d, x) => "A lavratura do auto não observou a sequência e as formalidades do art. 304 do Código de Processo Penal" + ((d.flags || {}).testemunhas === "nao" ? ", inclusive quanto à exigência de que, na falta de testemunhas da infração, o auto seja assinado por ao menos duas pessoas que tenham testemunhado a apresentação " + (d.g === "f" ? "da presa" : "do preso") + " (§ 2º)" : "") + ", o que compromete a validade do ato.",
    domicilio: (d, x) => "A prisão decorreu de ingresso em domicílio sem mandado judicial e sem fundadas razões, devidamente justificadas, de que no interior da casa ocorria situação de flagrante delito. O Supremo Tribunal Federal, no RE 603.616 (Tema 280), assentou que a entrada forçada só é lícita quando amparada em razões concretas aferíveis a posteriori, sob pena de nulidade dos atos praticados. A prova assim obtida é ilícita (CF, art. 5º, XI e LVI; CPP, art. 157) e não sustenta a prisão.",
    busca: (d, x) => "A abordagem e a busca pessoal apoiaram-se em impressões subjetivas, sem a fundada suspeita exigida pelos arts. 240, § 2º, e 244 do Código de Processo Penal. O Superior Tribunal de Justiça, no RHC 158.580/BA, firmou que a busca pessoal depende de elementos objetivos e concretos, não bastando a alegada atitude suspeita, de modo que os elementos dela decorrentes são ilícitos.",
    algemas: (d, x) => "O uso de algemas não foi justificado por escrito com base em resistência, fundado receio de fuga ou perigo à integridade física, como exige a Súmula Vinculante 11, que comina a nulidade da prisão ou do ato processual a que se refere.",
    agressao: (d, x) => x.A + " relata ter sofrido agressões no momento da prisão" + ((d.flags || {}).corpoDelito === "sim" ? ", o que deve ser confrontado com o exame de corpo de delito" : ", e não há exame de corpo de delito que afaste o relato") + ". A audiência de custódia existe justamente para coibir a violência estatal (Resolução CNJ 213/2015; STF, ADPF 347), e a notícia de maus-tratos impõe o registro em ata, a realização de exame e o encaminhamento para apuração, além de reforçar a ilegalidade da custódia.",
    custodia: (d, x) => "A prisão ocorreu em " + quando(d.prisao) + " e a audiência de custódia só foi realizada em " + quando(d.custodia) + ", após o prazo do caput do art. 310 do Código de Processo Penal e o acréscimo do § 4º, sem motivação idônea para o atraso, o que torna a prisão ilegal.",
    garantias: (d, x) => "Não foram asseguradas as garantias da audiência por videoconferência, notadamente a entrevista prévia, reservada e inviolável com a defesa, a privacidade " + (d.g === "f" ? "da presa" : "do preso") + " durante a oitiva e a repetição integral do ato em caso de falha de comunicação (CPP, art. 310, §§ 9º, 10 e 11)."
  };

  function requerimento(d, r) {
    const x = partes(d), b = [], c = d.crimes || [];
    b.push({ t: "end", texto: (d.juizG === "f" ? "Excelentíssima Senhora Juíza de Direito da " : "Excelentíssimo Senhor Juiz de Direito da ") + (d.juizo || "Central de Audiências de Custódia da Comarca de Belo Horizonte/MG").replace(/^(da|do)\s+/i, "") });
    b.push({ t: "ref", texto: "Auto de Prisão em Flagrante nº " + (d.autos || "____________") });
    b.push({ t: "p", r: [[d.nome || "NOME DO AUTUADO", "b"], [", já " + x.qual + " no auto de prisão em flagrante em epígrafe, vem, respeitosamente, à presença de Vossa Excelência, " + x.advs + ", com fundamento no art. 5º, LXV e LXVI, da Constituição da República e nos arts. 310, 312, 313, 319 e 321 do Código de Processo Penal, requerer " + (r.relax.length ? "o " : "a "), "n"], [r.relax.length ? "relaxamento da prisão em flagrante" : "concessão de liberdade provisória", "bo"], [r.relax.length ? " e, subsidiariamente, a concessão de liberdade provisória" : "", "n"], [", pelas razões de fato e de direito a seguir expostas.", "n"]] });
    let n = 0; const H = t => ({ t: "h", texto: ["I", "II", "III", "IV", "V", "VI", "VII", "VIII"][n++] + ". " + t });

    b.push(H("Síntese dos fatos"));
    b.push({ t: "p", r: x.A + " foi " + x.presa + " em " + quando(d.prisao) + (c.length ? ", sob a imputação de " + lista(c.map(z => z.rot)) : "") + ". " + (d.sintese ? d.sintese.trim().replace(/([^.])$/, "$1.") : "Segundo o auto, a prisão decorreu da atuação policial narrada no termo do condutor.") });
    b.push({ t: "p", r: "Em síntese, cuida-se de prisão em flagrante que, como adverte " + AURY + ", constitui medida pré-cautelar, precária e de brevíssima duração, que não se sustenta por si: ela apenas prepara a decisão judicial sobre a legalidade da captura e sobre a necessidade, a ser concretamente demonstrada, de uma verdadeira medida cautelar, o que se requer seja examinado por Vossa Excelência na forma do art. 310 do Código de Processo Penal." });

    if (r.relax.length) {
      b.push(H("Da ilegalidade da prisão e do necessário relaxamento"));
      r.relax.forEach(t => { b.push({ t: "sub", texto: t.t }); b.push({ t: "p", r: TXT_RELAX[t.id](d, x) }); });
      b.push({ t: "p", r: "Conforme demonstrado, a prisão em flagrante está eivada de ilegalidade, e a Constituição determina que a prisão ilegal seja imediatamente relaxada pela autoridade judiciária (art. 5º, LXV), comando reproduzido no art. 310, I, do Código de Processo Penal. Requer-se, por isso, o relaxamento da prisão " + x.da + ", com a expedição do alvará de soltura." });
    }

    b.push(H("Da ausência dos requisitos da prisão preventiva"));
    b.push({ t: "p", r: "A conversão do flagrante em preventiva exige, cumulativamente, prova da existência do crime e indício suficiente de autoria, perigo concreto gerado pelo estado de liberdade e uma das hipóteses do art. 313, além da demonstração de que as medidas cautelares diversas são inadequadas ou insuficientes (CPP, arts. 282, § 6º, 310, II, e 312). Como observa " + PACELLI + ", a presunção de inocência opera como regra de tratamento, de modo que a liberdade é a regra e a prisão anterior à condenação definitiva depende de necessidade concretamente justificada." });
    const lib = r.liberdade;
    if (lib.some(z => z.id === "313")) b.push({ t: "p", r: "De início, a preventiva é inadmissível na espécie. A pena máxima cominada " + (c.length === 1 ? "ao crime imputado" : "aos crimes imputados") + " não supera quatro anos, " + x.a + " não é reincidente em crime doloso e o caso não se enquadra nas demais hipóteses do art. 313 do Código de Processo Penal, rol taxativo que condiciona o próprio cabimento da medida." });
    if (lib.some(z => z.id === "excludente")) b.push({ t: "p", r: "Os elementos do próprio auto indicam que o fato teria sido praticado sob causa excludente de ilicitude (CP, art. 23), hipótese em que a preventiva é expressamente vedada (CPP, art. 314) e a lei autoriza a liberdade provisória mediante termo de comparecimento (CPP, art. 310, § 1º)." });
    const fumus = lib.find(z => z.id === "fumus");
    if (fumus && !fumus.fraco) b.push({ t: "p", r: "O fumus commissi delicti, na expressão de " + AURY + ", não está demonstrado com a segurança exigida, pois a autoria apoia-se em elementos de duvidosa validade" + ((d.flags || {}).reconhecimento === "irregular" ? ", como reconhecimento realizado sem as formalidades do art. 226 do Código de Processo Penal (STJ, HC 598.886/SC)" : "") + ((d.flags || {}).confissaoInformal === "sim" ? ", e em suposta confissão informal relatada pelos policiais, sem qualquer valor probatório autônomo (CF, art. 5º, LXIII)" : "") + "." });
    b.push({ t: "p", r: "Tampouco há periculum libertatis. A gravidade abstrata do delito não autoriza a prisão (CPP, art. 312, § 4º), e a decisão deve apoiar-se em fatos novos ou contemporâneos que revelem risco concreto à ordem pública, à instrução ou à aplicação da lei penal (CPP, arts. 312, § 2º, e 315, § 1º), sob pena de nulidade por fundamentação genérica (CPP, art. 315, § 2º)." + (r.alertas.some(a => a.id === "310p5") ? " Ainda que presente alguma das circunstâncias do § 5º do art. 310, a lei apenas as indica como recomendação, e o § 6º impõe o seu exame fundamentado à luz do caso concreto, sem automatismos." : "") + (r.alertas.some(a => a.id === "310p2") ? " Da mesma forma, a previsão do § 2º do art. 310 não dispensa a demonstração concreta dos requisitos cautelares, pois a Constituição assegura a liberdade provisória sempre que a lei a admitir (art. 5º, LXVI) e o Supremo Tribunal Federal repele vedações abstratas à liberdade provisória (HC 104.339)." : "") });
    const ps = d.pessoal || {};
    const cond = []; if (ps.primario) cond.push(x.A === "A autuada" ? "é primária e de bons antecedentes" : "é primário e de bons antecedentes"); if (ps.residencia) cond.push("tem residência fixa" + (d.endereco ? " em " + d.endereco : "")); if (ps.trabalho) cond.push("exerce ocupação lícita" + (d.ocupacao ? " como " + d.ocupacao : "")); if (ps.familia) cond.push("tem família constituída e dependentes");
    if (cond.length) b.push({ t: "p", r: "Some-se a isso que " + x.a + " " + lista(cond) + ", conforme documentos que acompanham este pedido, circunstâncias que, embora não assegurem por si sós a liberdade, evidenciam a suficiência de medidas menos gravosas e afastam qualquer risco à aplicação da lei penal." });
    if (lib.some(z => z.id === "homogeneidade")) b.push({ t: "p", r: "Há, ainda, manifesta desproporção entre a prisão e o provável resultado do processo. Como sustenta " + BADARO + ", a medida cautelar não pode impor ao acusado situação mais gravosa do que a decorrente de eventual condenação. Na hipótese, a pena cominada" + (c.some(z => z.d === "11.343" && z.a === "33") ? " e a provável incidência da causa de diminuição do art. 33, § 4º, da Lei 11.343/2006, que afasta a natureza hedionda do delito (STF, HC 118.533)," : "") + " indica regime inicial aberto e substituição por penas restritivas de direitos (CP, arts. 33, § 2º, c, e 44), de modo que a prisão cautelar anteciparia castigo que sequer seria imposto ao final." });
    b.push({ t: "p", r: "Em síntese, ausentes os requisitos dos arts. 312 e 313 do Código de Processo Penal, impõe-se a concessão da liberdade provisória, como determina o art. 321 do mesmo diploma, o que se requer." });

    b.push(H("Da suficiência das medidas cautelares diversas" + (r.fianca && r.fianca.cabe ? " e da fiança" : "")));
    const cs = (d.cautelares && d.cautelares.length ? d.cautelares : r.cautelares).map(k => ROT319[k]).filter(Boolean);
    b.push({ t: "p", r: "Caso Vossa Excelência entenda necessária alguma cautela, as medidas do art. 319 do Código de Processo Penal são adequadas e suficientes, na forma do art. 282, §§ 4º e 6º, que reserva a prisão às hipóteses em que nenhuma outra medida se mostre cabível. " + x.A + " desde já se compromete a cumprir " + (cs.length ? lista(cs) : "as medidas que Vossa Excelência fixar") + "." });
    if (r.fianca) {
      if (r.fianca.cabe) b.push({ t: "p", r: "O crime imputado admite fiança (CPP, arts. 322 e 323), cujo valor deve observar a faixa " + r.fianca.faixa + " e, sobretudo, a situação econômica " + x.da + " (art. 326)." + (r.fianca.dispensa ? " Diante da hipossuficiência demonstrada, requer-se a dispensa da fiança, com fundamento nos arts. 325, § 1º, I, e 350 do Código de Processo Penal, pois a impossibilidade de pagamento não pode converter-se em causa de prisão." : "") });
      else b.push({ t: "p", r: "Embora o crime imputado seja inafiançável (CPP, art. 323), a inafiançabilidade não impede a liberdade provisória sem fiança, como reconheceu o Supremo Tribunal Federal ao afastar vedações abstratas à liberdade provisória (HC 104.339)." });
    }
    b.push({ t: "p", r: "Assim, requer-se, subsidiariamente, a substituição da prisão pelas medidas cautelares diversas indicadas, que atendem integralmente a eventual necessidade cautelar." });

    if (r.domiciliar) {
      b.push(H("Da prisão domiciliar"));
      b.push({ t: "p", r: "Ainda que mantida alguma forma de custódia, " + x.a + " preenche os requisitos para a prisão domiciliar, por ser " + lista(r.domiciliar.hipoteses) + ", o que se comprova pelos documentos anexos (CPP, art. 318, parágrafo único)." + (r.domiciliar.obrigatoria ? " Tratando-se de mulher gestante ou mãe de criança, sem imputação de crime com violência ou grave ameaça nem praticado contra filho ou dependente, a substituição é obrigatória (CPP, art. 318-A; STF, HC 143.641)." : "") });
      b.push({ t: "p", r: "Requer-se, por isso, em caráter subsidiário, a substituição de eventual prisão preventiva por prisão domiciliar, cumulada, se for o caso, com as medidas do art. 319 (CPP, art. 318-B)." });
    }

    b.push(H("Dos pedidos"));
    const ped = [];
    if (r.relax.length) ped.push("o relaxamento da prisão em flagrante, por sua manifesta ilegalidade (CF, art. 5º, LXV; CPP, art. 310, I), com a imediata expedição de alvará de soltura");
    ped.push((r.relax.length ? "subsidiariamente, " : "") + "a concessão de liberdade provisória " + (r.fianca && r.fianca.cabe && !r.fianca.dispensa ? "mediante fiança em valor compatível com a situação econômica " + x.da : "sem fiança") + " (CPP, arts. 310, III, e 321)");
    ped.push("subsidiariamente, a aplicação das medidas cautelares diversas da prisão indicadas (CPP, art. 319)");
    if (r.domiciliar) ped.push("subsidiariamente, a substituição de eventual preventiva por prisão domiciliar (CPP, arts. 318 e 318-A)");
    b.push({ t: "p", r: "Diante do exposto, requer-se " + ped.join("; ") + "." });
    if ((d.flags || {}).agressao === "sim") b.push({ t: "p", r: "Requer-se, ainda, o registro em ata do relato de agressão, a requisição de exame de corpo de delito e o encaminhamento de cópias ao Ministério Público e à Corregedoria de Polícia para apuração, nos termos da Resolução CNJ 213/2015." });
    b.push({ t: "fecho", texto: "Termos em que, pede deferimento." });
    b.push({ t: "data", texto: (d.local || "Belo Horizonte/MG") + ", " + root.TPC_PECA.dataExtenso(new Date()) + "." });
    (d.advogados || []).forEach(a => b.push({ t: "ass", nome: a.nome, linhas: ["OAB/" + a.uf + " " + a.oab] }));
    return b;
  }

  function roteiro(d, r) {
    const x = partes(d), b = [{ t: "tit", texto: "Roteiro para a audiência de custódia" }];
    b.push({ t: "tab", larg: [1.2, 3], linhas: [["Autuado", d.nome || ""], ["Autos", d.autos || ""], ["Prisão", quando(d.prisao)], ["Imputação", lista((d.crimes || []).map(c => c.rot)) || "a confirmar"], ["Tese principal", r.relax.length ? "relaxamento (" + r.relax[0].t.toLowerCase() + ")" : "liberdade provisória"]] });
    b.push({ t: "h", texto: "1. Entrevista prévia e reservada (art. 310, § 9º)" });
    b.push({ t: "p", r: "Confirme com " + x.a + " o direito à entrevista reservada antes do ato e, se não for assegurado, registre a questão de ordem. Oriente-" + (d.g === "f" ? "a" : "o") + " a não falar sobre o mérito da imputação, pois a audiência de custódia não se destina à colheita de provas sobre o fato, e a responder apenas sobre as circunstâncias da prisão, o tratamento recebido e as condições pessoais." });
    b.push({ t: "p", r: "Pergunte sobre agressões, ameaças ou uso de algemas, sobre a comunicação à família, a entrega da nota de culpa e a advertência do direito ao silêncio; confirme endereço, trabalho, estudo, filhos e dependentes, problemas de saúde e uso de medicação, e reúna os documentos que comprovam essas condições." });
    if (r.relax.length) {
      b.push({ t: "h", texto: "2. Questão de ordem sobre a legalidade da prisão" });
      b.push({ t: "p", r: "Antes da manifestação final, peça a palavra pela ordem e aponte, em poucas frases, as ilegalidades: " + lista(r.relax.map(t => t.t.toLowerCase() + " (" + t.f + ")")) + "." });
      b.push({ t: "cit", texto: "Fala sugerida: “Excelência, pela ordem. A defesa requer o relaxamento da prisão, que é ilegal porque " + r.relax.map(t => t.t.toLowerCase()).slice(0, 2).join(" e ") + ". A Constituição determina o relaxamento imediato da prisão ilegal, no art. 5º, inciso LXV, e o art. 310, inciso I, do Código de Processo Penal o reproduz.”" });
    }
    b.push({ t: "h", texto: (r.relax.length ? "3" : "2") + ". Manifestação final (de três a cinco minutos)" });
    const argumentos = [];
    if (r.liberdade.some(z => z.id === "313")) argumentos.push("a preventiva é incabível pelo art. 313, porque a pena máxima não supera quatro anos e não há reincidência");
    if (r.liberdade.some(z => z.id === "excludente")) argumentos.push("há indícios de excludente de ilicitude, que vedam a preventiva (art. 314)");
    argumentos.push("não há fato concreto e contemporâneo que revele perigo na liberdade, e a gravidade abstrata não autoriza a prisão (art. 312, § 4º)");
    if ((d.pessoal || {}).primario || (d.pessoal || {}).residencia) argumentos.push("as condições pessoais são favoráveis e estão documentadas");
    if (r.liberdade.some(z => z.id === "homogeneidade")) argumentos.push("a prisão seria mais grave que a provável pena, que comporta regime aberto e substituição");
    b.push({ t: "p", r: "Sustente, nesta ordem: " + argumentos.join("; ") + ". Feche com a oferta concreta das cautelares, para que o juízo tenha uma alternativa à prisão já delineada." });
    b.push({ t: "cit", texto: "Fala sugerida: “A prisão cautelar exige fumus commissi delicti e periculum libertatis concretos, e nenhum deles está demonstrado. " + x.A + " tem residência e vínculos comprovados e se compromete a cumprir as medidas do art. 319" + ((d.cautelares && d.cautelares.length ? d.cautelares : r.cautelares).length ? ", como o comparecimento periódico e a proibição de ausentar-se da comarca" : "") + ". A defesa requer a liberdade provisória " + (r.fianca && r.fianca.cabe && !r.fianca.dispensa ? "com fiança compatível com a renda " + x.da : "sem fiança") + " e, subsidiariamente, as cautelares diversas" + (r.domiciliar ? " ou a prisão domiciliar" : "") + ".”" });
    if (r.alertas.length) { b.push({ t: "h", texto: "Pontos de atenção" }); r.alertas.forEach(a => b.push({ t: "p", r: a.t })); }
    b.push({ t: "h", texto: "Registro em ata" });
    b.push({ t: "p", r: "Peça que constem da ata " + lista(["os relatos de violência e o pedido de exame de corpo de delito, se houver", "a ausência de entrevista reservada ou de privacidade, se ocorrer", "eventual falha de conexão, com o pedido de repetição integral do ato (art. 310, § 11)", "os documentos apresentados pela defesa"]) + ". Se a prisão for convertida em preventiva, requeira cópia da decisão para a impugnação imediata por habeas corpus, examinando a fundamentação à luz do art. 315, § 2º." });
    return b;
  }

  root.CUST_MOTOR = { extrair, analisar, requerimento, roteiro, ROT319 };
})(typeof window !== "undefined" ? window : globalThis);
