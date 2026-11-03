/* Geração do relatório técnico e da minuta de tese defensiva. */
(function () {
  "use strict";
  const R = window.CC_REGRAS, M = window.CC_MOTOR;
  const esc = s => window.HUB.esc(s);
  const ETAPA_ORD = R.ETAPAS.reduce((m, e, i) => (m[e.id] = i, m), {});
  const PESO_ORD = { critico: 0, relevante: 1, formal: 2 };
  const STATUS = {
    documentado: { rot: "Documentado", cls: "ok" }, conforme: { rot: "Conforme", cls: "ok" },
    irregular: { rot: "Irregular", cls: "bad" }, controverso: { rot: "Controverso", cls: "warn" },
    ausente: { rot: "Não localizado", cls: "miss" }, na: { rot: "Não se aplica", cls: "na" }, sem_indicio: { rot: "Sem indícios", cls: "na" }
  };
  const NIVEL = { quebra: "bad", fragil: "warn", formal: "info", integra: "ok" };

  /* Referência de páginas com o ID do processo eletrônico: "p. 4 (ID 123, pág. 2); p. 9 (ID 456, pág. 1)". */
  function refs(gids, paginas) {
    const u = [...new Set((gids || []).filter(g => paginas[g]))].sort((a, b) => a - b);
    if (!u.length) return "";
    const multi = /^Arq\./.test(paginas[u[0]].rotPag || paginas[u[0]].rot);
    const comID = u.some(g => paginas[g].rotID);
    if (comID) return u.map(g => { const p = paginas[g]; return (p.rotPag || "p. " + p.n) + (p.rotID ? " (" + p.rotID + ")" : ""); }).join("; ");
    const porDoc = {};
    for (const g of u) { const p = paginas[g]; (porDoc[p.di] = porDoc[p.di] || []).push(p.n); }
    const docs = Object.keys(porDoc);
    const lista = ns => ns.length === 1 ? "p. " + ns[0] : "p. " + ns.slice(0, -1).join(", ") + " e " + ns[ns.length - 1];
    if (docs.length === 1 && !multi) return lista(porDoc[docs[0]]);
    return docs.map(d => "Arq. " + (+d + 1) + ", " + lista(porDoc[d])).join("; ");
  }
  const CONTR = { de: { o: "do", a: "da", os: "dos", as: "das" }, em: { o: "no", a: "na", os: "nos", as: "nas" }, a: { o: "ao", a: "à", os: "aos", as: "às" }, por: { o: "pelo", a: "pela", os: "pelos", as: "pelas" } };
  function contrair(prep, sn) {
    const m = /^(o|a|os|as) (.*)$/.exec(sn); const t = CONTR[prep.toLowerCase()];
    if (!m || !t) return prep + " " + sn;
    const r = t[m[1]];
    return (prep[0] === prep[0].toUpperCase() ? r.charAt(0).toUpperCase() + r.slice(1) : r) + " " + m[2];
  }
  function cap(s) { return s ? s.charAt(0).toUpperCase() + s.slice(1) : s; }
  function semTravessao(s) { return String(s || "").replace(/\s*[—–]\s*/g, ", ").replace(/,\s*,/g, ",").replace(/,\s*\./g, "."); }
  function preencher(txt, cat, gids, paginas) {
    const r = refs(gids, paginas);
    return txt.replace(/\b(de|em|a|por|De|Em|A|Por) \{v\}/g, (x, pr) => contrair(pr, cat.artigo)).replace(/\{v\}/g, cat.artigo).replace(/\{V\}/g, cap(cat.artigo))
      .replace(/\s*\(\{p\}\)/g, r ? " (" + r + ")" : "").replace(/\{p\}/g, r);
  }
  function precedente(chave) {
    const P = window.HUB_PRECEDENTES || [];
    return typeof chave === "string" ? P.find(p => p.id === chave) : P.find(p => p.n === chave);
  }
  function citacao(p) {
    const rel = /relator p\/ acórdão/.test(p.rel) ? "Rel. p/ acórdão Min. " + p.rel.replace(/\s*\(relator p\/ acórdão[^)]*\)|,\s*relator p\/ acórdão/g, "") : "Rel. Min. " + p.rel;
    return p.tribunal + ", " + p.proc + ", " + p.turma + ", " + rel + ", " + p.dje.replace(/^julgado em/, "j.");
  }
  function tesePrincipal(p) {
    const qs = p.questoes || [];
    const nrm = s => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
    const pontos = q => { const t = nrm(q.t); let s = 0;
      if (/onus/.test(t)) s += 3; if (/inadmiss|imprestavel/.test(t)) s += 2; if (/integridade|mesmidade|integralidade/.test(t)) s += 2; if (/hash|cadeia de custodia/.test(t)) s += 1;
      if (/retroa|sumula|reexame|habeas corpus|prequestion|^no voto|dialeticidade|\\bcpc\\b|capitulos|quanto ao recurso|competencia|suspeicao|sustentacao oral/.test(t)) s -= 4; return s; };
    const alvo = qs.slice().sort((a, b) => pontos(b) - pontos(a))[0];
    if (!alvo) return "";
    let t = alvo.t.replace(/^(Sim|N\u00e3o|Nao|Ao Estado)[.,:]\s*/i, "");
    const frases = t.split(/(?<=[.;])\s+(?=[A-Z\u00c0-\u00dd])/);
    let curto = ""; for (const f of frases) { if ((curto + " " + f).length > 420 && curto) break; curto += (curto ? " " : "") + f; }
    t = curto.trim();
    const w = (t.split(/\s+/)[0] || "").replace(/[^A-Za-z\u00c0-\u00fa]/g, "");
    if (!(w.length > 1 && w === w.toUpperCase())) t = t.charAt(0).toLowerCase() + t.slice(1);
    return semTravessao(t).replace(/[.;:,]\s*$/, "");
  }

  function problemas(est, catId) {
    const res = est.res.criterios[catId] || {};
    const out = [];
    for (const c of R.CRITERIOS) {
      const r = res[c.id]; if (!r) continue;
      const st = M.statusFinal(r);
      if (["irregular", "ausente", "controverso"].includes(st) && !(c.inverso && st === "ausente") && c.peso !== "formal") out.push({ c, r, st });
    }
    out.sort((a, b) => (ETAPA_ORD[a.c.etapa] - ETAPA_ORD[b.c.etapa]) || (PESO_ORD[a.c.peso] - PESO_ORD[b.c.peso]));
    return out;
  }
  const INC_CAT = { lacre: R.CATEGORIAS.filter(c => c.familia === "fisico" || c.id === "celular" || c.id === "informatica").map(c => c.id), imei: ["celular"], hash: ["celular", "informatica", "telematico", "audiovisual"], peso: ["drogas"], capacidade: ["informatica", "celular"], data: null };

  /* ---------------------------------------------------------------- minuta */
  function minuta(est) {
    const pg = est.paginas; const ativos = est.res.categorias.filter(c => c.ativo);
    const comProb = ativos.map(c => ({ cat: R.CATEGORIAS.find(x => x.id === c.id), probs: problemas(est, c.id), cls: M.classificar(est.res.criterios[c.id] || {}) })).filter(x => x.probs.length);
    const temDig = comProb.some(x => x.cat.familia === "digital"); const temFis = comProb.some(x => x.cat.familia === "fisico");
    const P = []; const h = (t) => P.push({ h: t }); const p = (t) => P.push({ p: semTravessao(t) });

    h("DA QUEBRA DA CADEIA DE CUSTÓDIA");
    h("1. Do regime jurídico da cadeia de custódia e do ônus estatal de sua demonstração");
    p("A Lei 13.964/2019 introduziu no Código de Processo Penal os arts. 158-A a 158-F, que disciplinam a cadeia de custódia, definida como o conjunto de todos os procedimentos utilizados para manter e documentar a história cronológica do vestígio coletado em locais ou em vítimas de crimes, para rastrear sua posse e manuseio a partir de seu reconhecimento até o descarte (art. 158-A). O legislador decompôs esse percurso em dez etapas sucessivas, do reconhecimento ao descarte (art. 158-B), e impôs garantias materiais específicas, como o lacre de numeração individualizada, a ficha de acompanhamento de cada rompimento e a guarda em central de custódia (arts. 158-D a 158-F).");
    p("A razão de ser desse regime é epistêmica. A documentação contínua do vestígio é o único meio de assegurar que o elemento apresentado em juízo corresponde exatamente àquele arrecadado no mundo dos fatos, sem adulteração no período em que permaneceu sob custódia estatal. Cuida-se do denominado princípio da mesmidade, cuja observância constitui pressuposto da própria confiabilidade da prova (PRADO, Geraldo. A cadeia de custódia da prova no processo penal. São Paulo: Marcial Pons, 2019). Como assentou o Superior Tribunal de Justiça, a exigência é logicamente indissociável do conceito de corpo de delito, presente no art. 158 do CPP desde sua redação original, e alcança inclusive fatos anteriores à reforma de 2019.");
    p("Por isso, a Quinta Turma do Superior Tribunal de Justiça consolidou o entendimento de que é ônus do Estado comprovar a integridade e a confiabilidade das fontes de prova que apresenta, sendo incabível presumir a veracidade das alegações estatais quando descumpridos os procedimentos da cadeia de custódia (" + citacao(precedente(13)) + "). A atuação dos órgãos de persecução é objeto do controle de legalidade, e não o seu parâmetro, de modo que não se pode exigir da defesa a demonstração de adulteração concreta, sob pena de se lhe impor verdadeira prova diabólica (" + citacao(precedente(53)) + ").");
    if (temFis) p("Ainda que se registre, em parte da jurisprudência, a compreensão de que a irregularidade não acarreta por si só a nulidade da prova, cabendo ao julgador aferir sua confiabilidade à luz dos demais elementos (" + citacao(precedente("comp-01")) + "), a ausência de documentação mínima dos elos da cadeia esvazia essa própria aferição, porque subtrai ao juízo qualquer parâmetro objetivo pelo qual se possa atestar a mesmidade do vestígio.");
    if (temDig) p("Tratando-se de prova digital, o rigor é ainda maior. A volatilidade dos dados exige mecanismos que permitam constatar eventuais alterações, e a auditabilidade, a repetibilidade, a reprodutibilidade e a justificabilidade são atributos essenciais da evidência digital, garantindo-se a mesmidade por algoritmo hash e por software confiável, auditável e certificado (" + citacao(precedente(17)) + "; ABNT NBR ISO/IEC 27037:2013).");
    p("Conforme exposto, a regularidade da cadeia de custódia é condição para que o elemento probatório ingresse validamente no processo, competindo ao Estado demonstrá-la. É sob essa premissa que se requer o exame das falhas a seguir apontadas, com o reconhecimento das consequências jurídicas que delas decorrem.");

    if (!comProb.length) {
      p("No caso concreto, a verificação dos autos não identificou, nas etapas críticas, falhas documentais que justifiquem a arguição. Recomenda-se, ainda assim, a conferência manual das peças, sobretudo das páginas de baixa legibilidade.");
      return P;
    }

    comProb.forEach((x, i) => {
      const { cat, probs } = x;
      h((i + 2) + ". Da quebra da cadeia de custódia relativa " + contrair("a", cat.artigo));
      const etapasFalhas = [...new Set(probs.map(q => R.ETAPAS.find(e => e.id === q.c.etapa).rot.toLowerCase()))];
      p("No que concerne " + contrair("a", cat.artigo) + ", o exame integral dos autos evidencia falhas que comprometem a rastreabilidade do vestígio em etapas essenciais da cadeia de custódia, notadamente " + (etapasFalhas.length > 1 ? etapasFalhas.slice(0, -1).join(", ") + " e " + etapasFalhas[etapasFalhas.length - 1] : etapasFalhas[0]) + ".");
      for (const q of probs) {
        const txt = q.st === "ausente" ? q.c.falta : q.c.vicio;
        if (!txt) continue;
        const gids = q.st === "ausente" ? [] : (q.r.neg.length ? q.r.neg : q.r.pos).map(e => e.gid).concat(q.r.calcGids || []);
        p(preencher(txt, cat, gids, pg) + (q.r.nota ? " " + q.r.nota : ""));
      }
      const incs = est.res.inconsistencias.filter(n => n.grav !== "info" && INC_CAT[n.tipo] && INC_CAT[n.tipo].includes(cat.id));
      for (const n of incs) {
        const r = /\bp\. \d/.test(n.texto) ? "" : refs(n.gids, pg);
        p("Soma-se a isso inconsistência documental objetiva. " + (r ? n.texto.replace(/\.\s*$/, "") + " (" + r + ")." : n.texto));
      }
      const cont = {};
      for (const q of probs) for (const k of q.c.prec || []) cont[k] = (cont[k] || 0) + (q.c.peso === "critico" ? 2 : 1);
      const GEN_FIS = ["13", "comp-02", "1", "16"];
      if (cat.familia === "fisico") cont["13"] = (cont["13"] || 0) + 5;
      const top = Object.keys(cont).filter(k => cat.familia === "digital" || GEN_FIS.includes(String(k))).sort((a, b) => cont[b] - cont[a]).map(k => precedente(isNaN(+k) ? k : +k)).filter(Boolean).filter(pp => cat.familia === "digital" ? !pp.complementar : true).slice(0, 3);
      if (top.length) {
        const frases = top.map((pp, j) => (j === 0 ? "No " : j === 1 ? "No mesmo sentido, no " : "Ainda, no ") + pp.proc + " (" + citacao(pp).replace(/^STJ, [^,]+, /, "") + "), assentou-se que " + tesePrincipal(pp) + ".");
        p("A jurisprudência do Superior Tribunal de Justiça reconhece a gravidade de vícios dessa natureza. " + frases.join(" "));
      }
      const quebra = x.cls.nivel === "quebra";
      if (quebra) {
        p("Conforme demonstrado, a cadeia de custódia relativa " + contrair("a", cat.artigo) + " não foi documentada em elos essenciais, o que impede demonstrar que o elemento examinado e apresentado em juízo corresponde ao originalmente apreendido, ônus do qual o Estado não se desincumbiu. Diante desse quadro, requer-se o reconhecimento da quebra da cadeia de custódia, com a declaração de inadmissibilidade dos elementos assim obtidos e o consequente desentranhamento dos autos (art. 5º, LVI, da CF e art. 157, caput, do CPP), estendendo-se a providência às provas derivadas (art. 157, § 1º, do CPP).");
      } else {
        p("Conforme demonstrado, há fragilidades na documentação da cadeia de custódia relativa " + contrair("a", cat.artigo) + " que, embora não esgotem a controvérsia, recaem sobre elos relevantes do percurso do vestígio. Diante desse quadro, requer-se seja o órgão acusador instado a apresentar a integralidade da documentação da cadeia de custódia, incluindo fichas de acompanhamento, termos de recebimento e registros da central de custódia, sob pena de inadmissibilidade, e, subsidiariamente, que a fragilidade demonstrada seja considerada na valoração do elemento, que não poderá, isoladamente, fundamentar juízo desfavorável ao acusado.");
      }
    });

    h((comProb.length + 2) + ". Dos pedidos");
    const quebras = comProb.filter(x => x.cls.nivel === "quebra").map(x => contrair("a", x.cat.artigo));
    const frageis = comProb.filter(x => x.cls.nivel !== "quebra").map(x => contrair("a", x.cat.artigo));
    const lista = a => a.length > 1 ? a.slice(0, -1).join(", ") + " e " + a[a.length - 1] : a[0];
    let txt = "Diante do exposto, requer-se: ";
    const itens = [];
    if (quebras.length) itens.push("o reconhecimento da quebra da cadeia de custódia relativa " + lista(quebras) + ", com a declaração de inadmissibilidade e o desentranhamento dos respectivos elementos e de todas as provas deles derivadas (art. 157, caput e § 1º, do CPP)");
    if (frageis.length) itens.push("a intimação do órgão acusador para que apresente a integralidade da documentação da cadeia de custódia relativa " + lista(frageis) + ", sob pena de inadmissibilidade");
    itens.push("subsidiariamente, a disponibilização à defesa do material que serviu de base às perícias, no ambiente do órgão oficial, para exame por assistente técnico (art. 159, §§ 5º e 6º, do CPP), bem como de cópia forense integral do material digital, se houver");
    itens.push("ainda subsidiariamente, que eventual valoração considere a fragilidade demonstrada, vedando-se que tais elementos fundamentem, isoladamente, qualquer juízo desfavorável ao acusado");
    txt += itens.map((t, i) => "(" + String.fromCharCode(97 + i) + ") " + t).join("; ") + ".";
    p(txt);
    return P;
  }

  /* ---------------------------------------------------------------- relatório técnico */
  function relatorio(est) {
    const pg = est.paginas; const res = est.res; const caso = est.caso || {};
    const ativos = res.categorias.filter(c => c.ativo);
    const linhas = [];
    const hoje = new Date().toLocaleDateString("pt-BR");
    linhas.push('<div class="rel-cab"><div class="rel-marca"><span class="marca-tpc">TPC</span> <span>ADVOGADOS · HUB CRIMINAL</span></div><div class="mudo pequeno">Relatório gerado em ' + hoje + '</div></div>');
    linhas.push("<h2>Relatório de verificação da cadeia de custódia</h2>");
    const dadosCaso = [["Autos", caso.autos], ["Assistido", caso.assistido], ["Juízo / órgão", caso.juizo], ["Responsável", caso.responsavel]].filter(x => x[1]);
    if (dadosCaso.length) linhas.push('<table class="rel-t">' + dadosCaso.map(x => "<tr><th>" + x[0] + "</th><td>" + esc(x[1]) + "</td></tr>").join("") + "</table>");
    if (caso.obs) linhas.push("<p><b>Observações:</b> " + esc(caso.obs) + "</p>");

    linhas.push("<h3>1. Material analisado</h3>");
    linhas.push('<table class="rel-t"><tr><th>Arquivo</th><th>Páginas</th><th>OCR</th><th>SHA-256</th></tr>' + est.docs.map((d, i) => "<tr><td>" + (est.docs.length > 1 ? "Arq. " + (i + 1) + ": " : "") + esc(d.nome) + "</td><td>" + d.paginas.length + "</td><td>" + d.paginas.filter(p => p.ocr).length + '</td><td class="mono">' + esc(d.sha256 || "não calculado") + "</td></tr>").join("") + "</table>");
    linhas.push('<p class="pequeno mudo">Os valores SHA-256 identificam univocamente a cópia dos autos submetida à análise e permitem demonstrar, a qualquer tempo, que o relatório se refere exatamente a esse material. Total de ' + res.totalPaginas + " páginas, das quais " + res.paginasOCR + " lidas por reconhecimento óptico de caracteres" + (res.paginasBaixaConf.length ? " (" + res.paginasBaixaConf.length + " com baixa legibilidade, a conferir manualmente)" : "") + ".</p>");

    linhas.push("<h3>2. Síntese por tipo de vestígio</h3>");
    linhas.push('<table class="rel-t"><tr><th>Vestígio</th><th>Classificação</th><th>Conformidade documental</th><th>Críticos irregulares</th><th>Críticos não localizados</th></tr>' + ativos.map(c => {
      const cat = R.CATEGORIAS.find(x => x.id === c.id); const k = M.classificar(res.criterios[c.id] || {});
      return "<tr><td>" + cat.icone + " " + esc(cat.nome) + '</td><td><span class="tag ' + NIVEL[k.nivel] + '">' + k.rot + "</span></td><td>" + k.conformidade + "%</td><td>" + k.critIrreg + "</td><td>" + k.critAus + "</td></tr>";
    }).join("") + "</table>");

    linhas.push("<h3>3. Matriz de conformidade por etapa</h3>");
    for (const c of ativos) {
      const cat = R.CATEGORIAS.find(x => x.id === c.id); const rc = res.criterios[c.id] || {};
      linhas.push("<h4>" + cat.icone + " " + esc(cat.nome) + "</h4>");
      const rows = R.CRITERIOS.filter(cr => rc[cr.id]).sort((a, b) => ETAPA_ORD[a.etapa] - ETAPA_ORD[b.etapa]).map(cr => {
        const r = rc[cr.id]; const st = M.statusFinal(r); const s = STATUS[st];
        const g = (st === "irregular" || st === "controverso") ? r.neg.map(e => e.gid) : r.pos.map(e => e.gid);
        return "<tr><td>" + R.ETAPAS.find(e => e.id === cr.etapa).rot + "</td><td>" + esc(cr.titulo) + '<div class="mudo pequeno">' + esc(cr.fund) + (r.nota ? "<br><b>Nota:</b> " + esc(r.nota) : "") + '</div></td><td><span class="tag ' + s.cls + '">' + s.rot + "</span>" + (r.rev ? ' <span class="pequeno mudo">(revisado)</span>' : "") + "</td><td>" + esc(refs(g.concat(r.calcGids || []), pg) || "") + "</td></tr>";
      });
      linhas.push('<table class="rel-t"><tr><th>Etapa</th><th>Critério</th><th>Situação</th><th>Referência</th></tr>' + rows.join("") + "</table>");
    }

    if (res.inconsistencias.length) {
      linhas.push("<h3>4. Inconsistências identificadas</h3>");
      for (const n of res.inconsistencias) linhas.push('<p><span class="tag ' + (n.grav === "critico" ? "bad" : n.grav === "info" ? "info" : "warn") + '">' + (n.grav === "critico" ? "Crítica" : n.grav === "info" ? "Informativa" : "Relevante") + "</span> <b>" + esc(n.titulo) + ".</b> " + esc(n.texto) + (n.gids.length ? " <span class=\"mudo\">(" + esc(refs(n.gids, pg)) + ")</span>" : "") + "</p>");
    }
    const ids = res.identificadores;
    const blocos = [];
    if (ids.imei.length) blocos.push(["IMEI", ids.imei.map(x => [x.valor + (x.valido ? "" : " (dígito verificador inválido)"), pg[x.gid].rot])]);
    if (ids.lacres.length) blocos.push(["Lacres", ids.lacres.map(x => [x.valor, pg[x.gid].rot])]);
    if (ids.hashes.length) blocos.push(["Hashes", ids.hashes.map(x => [x.alg + ": " + x.valor, pg[x.gid].rot])]);
    if (ids.pesos.length) blocos.push(["Pesos (drogas)", ids.pesos.map(x => [x.gramas.toLocaleString("pt-BR") + " g" + (x.rotulo ? " (massa " + x.rotulo + ")" : ""), pg[x.gid].rot])]);
    if (blocos.length) {
      linhas.push("<h3>5. Identificadores localizados</h3>");
      for (const [t, l] of blocos) linhas.push("<h4>" + t + '</h4><table class="rel-t">' + l.slice(0, 60).map(r => '<tr><td class="mono">' + esc(r[0]) + "</td><td>" + esc(r[1]) + "</td></tr>").join("") + "</table>");
    }
    const precs = new Set();
    for (const c of ativos) for (const q of problemas(est, c.id)) for (const k of q.c.prec || []) precs.add(k);
    if (precs.size) {
      linhas.push("<h3>6. Precedentes aplicáveis</h3>");
      [...precs].map(k => precedente(k)).filter(Boolean).sort((a, b) => (a.n || 99) - (b.n || 99)).forEach(pp => linhas.push("<p><b>" + esc(citacao(pp)) + ".</b> " + esc(pp.titulo) + (pp.complementar ? ' <span class="tag warn">conferir inteiro teor</span>' : "") + "</p>"));
    }
    if (res.ia && res.ia.resultado) {
      linhas.push("<h3>7. Análise complementar por IA</h3><p>" + esc(res.ia.resultado.sintese || "") + "</p>");
    }
    linhas.push('<h3>Ressalvas metodológicas</h3><p class="pequeno">A verificação é automatizada e baseada na leitura textual dos autos. A situação "não localizado" indica que não foram encontrados, no texto disponível, registros correspondentes ao critério, o que não equivale, necessariamente, à inexistência do ato. Páginas de baixa legibilidade, documentos manuscritos e anexos não digitalizados exigem conferência humana. O resultado não constitui laudo pericial nem parecer, e as conclusões devem ser confirmadas pelo profissional responsável antes de qualquer utilização processual.</p>');
    return linhas.join("\n");
  }

  function minutaHTML(est) {
    return minuta(est).map(b => b.h ? "<h3>" + esc(b.h) + "</h3>" : "<p>" + esc(b.p) + "</p>").join("\n");
  }
  function minutaTexto(est) {
    return minuta(est).map(b => b.h ? b.h.toUpperCase() : b.p).join("\n\n");
  }

  function exportarDoc(html, nome) {
    const doc = '<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40"><head><meta charset="utf-8"><title>' + esc(nome) + '</title><style>body{font-family:Calibri,Arial,sans-serif;font-size:11pt;line-height:1.4}h2{font-family:"Segoe UI Semibold",Calibri;font-size:14pt}h3{font-family:"Segoe UI Semibold",Calibri;font-size:12pt;margin-top:18pt}h4{font-size:11pt}p{text-align:justify;margin:0 0 10pt}table{border-collapse:collapse;width:100%;margin:6pt 0 12pt}td,th{border:1px solid #bbb;padding:4pt 6pt;font-size:9.5pt;vertical-align:top;text-align:left}th{background:#f2f2f2}.mono{font-family:Consolas,monospace;font-size:8.5pt}.tag{font-weight:bold}.mudo{color:#666}.pequeno{font-size:9pt}.rel-cab{border-bottom:3pt solid #F5EF90;padding-bottom:6pt;margin-bottom:12pt}.marca-tpc{border:1.5pt solid #C8C3BB;padding:0 4pt;font-weight:bold}.dz-sumario{border:1px solid #ccc;padding:6pt 10pt;margin:8pt 0}.dz-trecho{border-left:3pt solid #2f7d4f;background:#f7f6f2;padding:3pt 7pt;margin:4pt 0;font-size:9.5pt}.dz-trecho.neg{border-left-color:#b23a2c}.dz-trecho b{background:#F5EF90}.dz-ref{font-size:8pt;color:#666;font-weight:bold}.dz-falha{border:1px solid #ddd;padding:6pt 8pt;margin:8pt 0}.dz-falha-cab{background:#f4f2ed;padding:3pt 5pt;margin-bottom:4pt}.dz-qa{border-left:3pt solid #F5EF90;padding:2pt 8pt;margin:4pt 0;font-size:10pt}.dz-lei{font-size:10pt}.dz-anexo{border-top:1.5pt solid #333;padding-top:8pt;margin-top:24pt}</style></head><body>' + html + "</body></html>";
    const blob = new Blob(["﻿", doc], { type: "application/msword" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = nome + ".doc"; document.body.appendChild(a); a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  }

  window.CC_RELATORIO = { preencherTexto: preencher, contrair, relatorio, minutaHTML, minutaTexto, exportarDoc, refs, citacao, precedente, STATUS, NIVEL, tesePrincipal, problemas };
})();
