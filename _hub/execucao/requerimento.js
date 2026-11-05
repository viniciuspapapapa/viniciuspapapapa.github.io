/* Requerimentos de progressão de regime e de livramento condicional no padrão TPC, a partir do cálculo do EXEC_MOTOR.
   Cada tópico termina com parágrafo de síntese e pedido. Saída em blocos do TPC_PECA (Word e pré-visualização). */
(function (root) {
  "use strict";
  const M = root.EXEC_MOTOR, P = root.TPC_PECA;
  const br = M.br;
  const fim = s => String(s || "").trim().replace(/[.;,\s]+$/, "");

  function partes(d) {
    const f = d.g === "f";
    const advs = d.advogados || [], todasF = advs.length && advs.every(a => a.g === "f");
    return {
      Req: f ? "A requerente" : "O requerente", req: f ? "a requerente" : "o requerente", doReq: f ? "da requerente" : "do requerente", aoReq: f ? "à requerente" : "ao requerente",
      qualificado: f ? "devidamente qualificada" : "devidamente qualificado",
      advs: advs.length === 1 ? (advs[0].g === "f" ? "por sua advogada que esta subscreve" : "por seu advogado que esta subscreve") : todasF ? "por suas advogadas que esta subscrevem" : "por seus advogados que esta subscrevem"
    };
  }
  function enderecamento(d) {
    const j = fim(d.juizo) || "Vara de Execuções Penais da Comarca de Belo Horizonte/MG";
    return (d.juizG === "f" ? "Excelentíssima Senhora Juíza de Direito da " : "Excelentíssimo Senhor Juiz de Direito da ") + j.replace(/^(da|do)\s+/i, "");
  }
  const regimeNome = r => ({ fechado: "fechado", semiaberto: "semiaberto", aberto: "aberto" }[r] || r);

  function sintese(d, res, x) {
    const n = res.condenacoes.length, b = [];
    b.push({ t: "h", texto: "I. Síntese da execução" });
    b.push({ t: "p", r: x.Req + " cumpre pena privativa de liberdade que totaliza " + res.penaTotalFmt + ", resultante de " + (n === 1 ? "uma condenação" : n + " condenações") + ", conforme a guia de execução que instrui estes autos, tendo iniciado o cumprimento em " + br(M.D(d.inicio)) + " e encontrando-se atualmente no regime " + regimeNome(d.regimeAtual) + "." });
    b.push({ t: "tab", cab: ["Condenação", "Pena", "Natureza", "Progressão (LEP, art. 112)"], larg: [2.2, 1.6, 2.6, 2], linhas: res.condenacoes.map(c => [c.desc || "Condenação", c.penaFmt, c.natureza, M.fmtFracao(c.prog.f) + (c.prog.manual ? " (fração informada)" : ", " + c.prog.inciso)]) });
    const cred = [];
    if (res.detracao.dias) cred.push(res.detracao.dias + " dias de prisão provisória, computados por força do art. 42 do Código Penal");
    if (res.remicao.total) cred.push(res.remicao.total + " dias remidos, que o art. 128 da LEP manda considerar como pena cumprida para todos os efeitos");
    if (cred.length) b.push({ t: "p", r: "Ao tempo de pena efetivamente cumprido somam-se " + P.lista(cred) + "." + (res.interrupcao ? " Descontam-se, de outro lado, " + res.interrupcao + " dias de interrupção do cumprimento." : "") });
    if (/falta grave/.test(res.motivoBase)) b.push({ t: "p", r: "Registre-se que a contagem do requisito objetivo foi reiniciada em " + br(res.dataBase) + ", em razão da falta grave então anotada, passando a fração a incidir sobre a pena remanescente, nos termos do art. 112, § 6º, da LEP." });
    else if (/progressão/.test(res.motivoBase)) b.push({ t: "p", r: "Por força da progressão deferida em " + br(res.dataBase) + ", a fração para o novo benefício incide sobre o saldo da pena existente naquela data, que passa a constituir a data-base da contagem." });
    b.push({ t: "p", r: "Em síntese, trata-se de execução cujos marcos e créditos se encontram documentados nos autos e permitem aferir, com exatidão, o implemento do requisito temporal adiante demonstrado, o que se requer seja considerado por Vossa Excelência na apreciação do presente pedido." });
    return b;
  }

  function fracoesTexto(res, chave) {
    const cs = res.condenacoes;
    if (chave === "prog") {
      if (cs.length === 1) { const c = cs[0]; return c.prog.manual ? "a condenação sujeita-se à fração de " + M.fmtFracao(c.prog.f) + ", correspondente à redação do art. 112 vigente à data do fato, por força da irretroatividade da lei penal mais gravosa (CF, art. 5º, XL)" : "a condenação enquadra-se no " + c.prog.inciso + " do art. 112 (" + c.prog.texto + "), que exige o cumprimento de " + M.fmtFracao(c.prog.f) + " da pena"; }
      return "as condenações sujeitam-se a frações distintas, a saber, " + P.lista(cs.map(c => M.fmtFracao(c.prog.f) + " para a condenação por " + (c.desc || "crime não especificado") + " (" + (c.prog.manual ? "fração informada" : c.prog.inciso) + ")")) + ", de modo que o requisito objetivo corresponde à soma das frações aplicadas a cada pena, o que equivale a " + res.fracaoProgFmt + " da pena total";
    }
    return P.lista(res.livramento.fundamentos || []);
  }

  function assinaturas(d) {
    const b = [{ t: "fecho", texto: "Termos em que, pede deferimento." }, { t: "data", texto: fim(d.local || "Belo Horizonte/MG") + ", " + P.dataExtenso(d.data ? new Date(d.data + "T00:00:00Z") : new Date()) + "." }];
    (d.advogados || []).forEach(a => b.push({ t: "ass", nome: a.nome, linhas: ["OAB/" + a.uf + " " + a.oab] }));
    return b;
  }

  function progressao(d, res) {
    const x = partes(d), et = res.etapas[0];
    if (!et) return null;
    const b = [{ t: "end", texto: enderecamento(d) }, { t: "ref", texto: "Execução Penal nº " + (fim(d.autos) || "____________") }];
    b.push({ t: "p", r: [[fim(d.apenado) || "NOME DO APENADO", "b"], [", já " + x.qualificado + " nos autos da execução penal em epígrafe, vem, respeitosamente, à presença de Vossa Excelência, " + x.advs + ", com fundamento no art. 112 da Lei nº 7.210/1984 (Lei de Execução Penal) e no art. 33, § 2º, do Código Penal, requerer a ", "n"], ["progressão ao regime " + regimeNome(et.para), "bo"], [", pelas razões de fato e de direito a seguir expostas.", "n"]] });
    b.push(...sintese(d, res, x));

    b.push({ t: "h", texto: "II. Do requisito objetivo" });
    b.push({ t: "p", r: "O art. 112 da Lei de Execução Penal, na redação conferida pela Lei nº 15.402/2026 e, quanto aos crimes hediondos e equiparados, pela Lei nº 15.358/2026, determina que a pena privativa de liberdade seja executada de forma progressiva, com a transferência para regime menos rigoroso quando o preso tiver cumprido a fração legal da pena no regime anterior e seu mérito indicar a progressão." });
    b.push({ t: "p", r: "No caso, " + fracoesTexto(res, "prog") + ". A fração incide sobre " + (+et.base === +M.D(d.inicio) ? "a pena total, a partir do início do cumprimento" : "o saldo da pena existente na data-base, conforme a orientação consolidada no Superior Tribunal de Justiça") + ", e o tempo de prisão provisória e os dias remidos são computados como pena cumprida." });
    const linhas = [["Data-base", br(et.base) + " (" + res.motivoBase + ")"], ["Pena considerada", et.saldo + " dias"], ["Fração aplicável", et.fracao], ["Tempo exigido", et.exigido + " dias"]];
    if (+et.base === +M.D(d.inicio) && (res.detracao.dias || res.remicao.total)) linhas.push(["Detração e remição abatidas", (res.detracao.dias + res.remicao.total) + " dias"]);
    else if (+et.base !== +M.D(d.inicio) && d.remicaoPosBase) linhas.push(["Remição posterior à data-base", d.remicaoPosBase + " dias"]);
    linhas.push(["Implemento do requisito", br(et.data)]);
    b.push({ t: "tab", cab: ["Cálculo", "Resultado"], larg: [1.3, 2.7], linhas });
    b.push({ t: "p", r: "Com efeito, o requisito objetivo " + (et.atingido ? "foi implementado em " : "será implementado em ") + br(et.data) + ", conforme o cálculo acima, elaborado segundo a contagem do art. 10 do Código Penal, que inclui o dia do começo e considera os meses e os anos pelo calendário comum." });
    b.push({ t: "p", r: "Conforme demonstrado, encontra-se " + (et.atingido ? "satisfeito" : "em vias de ser satisfeito") + " o requisito temporal do art. 112 da LEP, razão pela qual se requer seja reconhecido o seu implemento em " + br(et.data) + ", data que deverá servir de marco para a contagem dos benefícios subsequentes." });

    b.push({ t: "h", texto: "III. Do requisito subjetivo" });
    b.push({ t: "p", r: "O § 1º do art. 112 da LEP, na redação da Lei nº 14.843/2024, condiciona a progressão à boa conduta carcerária, comprovada pelo diretor do estabelecimento, e aos resultados do exame criminológico, respeitadas as normas que vedam a progressão." });
    b.push({ t: "p", r: x.Req + " ostenta bom comportamento carcerário, conforme atestado de conduta emitido pela direção do estabelecimento prisional" + (d.atestado ? ", que acompanha o presente pedido" : ", cuja juntada desde já se requer") + "." + (d.faltaGrave ? " Embora conste registro de falta grave em " + br(M.D(d.faltaGrave)) + ", o bom comportamento foi readquirido, nos termos do art. 112, § 7º, da LEP, que o restabelece após um ano do fato ou, antes disso, com o cumprimento do requisito temporal exigível, exatamente como se verifica na espécie." : " Não há registro de falta grave apta a obstar o benefício.") });
    if (d.exame === "favoravel") b.push({ t: "p", r: "O exame criminológico já realizado concluiu de forma favorável " + x.aoReq + ", evidenciando a aptidão para o cumprimento da pena em regime menos rigoroso e afastando qualquer dúvida quanto ao mérito exigido pela lei." });
    else b.push({ t: "p", r: "Quanto ao exame criminológico, caso ainda não realizado, requer-se a sua imediata determinação, com fixação de prazo para a conclusão do laudo, a fim de que a demora administrativa não se converta em óbice ao exercício de direito cujo requisito temporal já se encontra implementado. A omissão do Estado na realização do exame não pode ser suportada pelo apenado, e a decisão a respeito deve ser fundamentada, como exige a Súmula Vinculante 26." });
    b.push({ t: "p", r: "Assim, também o requisito subjetivo encontra-se presente, o que autoriza o deferimento da progressão, sem que se possa exigir do apenado qualquer condição não prevista em lei, conforme se requer." });

    b.push({ t: "h", texto: "IV. Dos pedidos" });
    b.push({ t: "p", r: "Diante do exposto, requer-se, ouvido o Ministério Público, nos termos do art. 112, § 2º, da LEP, seja deferida a progressão " + x.doReq + " ao regime " + regimeNome(et.para) + ", com a expedição das comunicações necessárias à imediata transferência." });
    b.push({ t: "p", r: "Requer-se, ainda, que, inexistindo vaga em estabelecimento adequado ao novo regime, seja assegurado o cumprimento da pena em regime menos gravoso ou em prisão domiciliar, com monitoração eletrônica se necessária, até a disponibilização da vaga, em observância à Súmula Vinculante 56 e aos parâmetros fixados pelo Supremo Tribunal Federal no RE 641.320." });
    b.push({ t: "p", r: "Requer-se, por fim, a retificação do atestado de pena a cumprir, para que dele conste a data de implemento do requisito como marco dos benefícios subsequentes" + (d.remicaoPendente ? ", bem como a declaração dos dias remidos, nos termos do art. 126, § 8º, da LEP" : "") + "." });
    b.push(...assinaturas(d));
    return b;
  }

  function livramento(d, res) {
    const x = partes(d), lc = res.livramento;
    if (!lc || lc.vedado) return null;
    const b = [{ t: "end", texto: enderecamento(d) }, { t: "ref", texto: "Execução Penal nº " + (fim(d.autos) || "____________") }];
    b.push({ t: "p", r: [[fim(d.apenado) || "NOME DO APENADO", "b"], [", já " + x.qualificado + " nos autos da execução penal em epígrafe, vem, respeitosamente, à presença de Vossa Excelência, " + x.advs + ", com fundamento no art. 83 do Código Penal e no art. 131 da Lei nº 7.210/1984 (Lei de Execução Penal), requerer a concessão de ", "n"], ["livramento condicional", "bo"], [", pelas razões de fato e de direito a seguir expostas.", "n"]] });
    b.push(...sintese(d, res, x));

    b.push({ t: "h", texto: "II. Do requisito objetivo" });
    b.push({ t: "p", r: "O art. 83 do Código Penal autoriza o livramento condicional ao condenado a pena privativa de liberdade igual ou superior a dois anos, desde que cumprida a fração legal da pena, a qual varia conforme a primariedade, os antecedentes e a natureza do crime. No caso, a pena total supera dois anos e a fração aplicável decorre do " + fracoesTexto(res, "lc") + ", o que corresponde a " + lc.fracao + " da pena total." });
    const linhas = [["Início do cumprimento", br(M.D(d.inicio))], ["Pena total", res.penaTotalFmt + " (" + res.penaTotalDias + " dias)"], ["Fração aplicável", "mais de " + lc.fracao], ["Tempo exigido", lc.exigido + " dias"]];
    if (res.detracao.dias || res.remicao.total) linhas.push(["Detração e remição abatidas", (res.detracao.dias + res.remicao.total) + " dias"]);
    linhas.push(["Implemento do requisito", br(lc.data)]);
    b.push({ t: "tab", cab: ["Cálculo", "Resultado"], larg: [1.3, 2.7], linhas });
    b.push({ t: "p", r: "Ressalte-se que o prazo do livramento condicional não se interrompe pela prática de falta grave, como assentado na Súmula 441 do Superior Tribunal de Justiça, de modo que a contagem se faz a partir do início do cumprimento, computados a prisão provisória e os dias remidos." });
    b.push({ t: "p", r: "Conforme demonstrado, o requisito temporal " + (lc.atingido ? "encontra-se implementado desde " : "será implementado em ") + br(lc.data) + ", razão pela qual se requer seja reconhecido o seu preenchimento para fins de concessão do benefício." });

    b.push({ t: "h", texto: "III. Dos requisitos subjetivos" });
    b.push({ t: "p", r: "O inciso III do art. 83 do Código Penal exige a comprovação de bom comportamento durante a execução, do não cometimento de falta grave nos últimos doze meses, do bom desempenho no trabalho atribuído e da aptidão para prover a própria subsistência mediante trabalho honesto." });
    b.push({ t: "p", r: x.Req + " apresenta bom comportamento carcerário, conforme atestado de conduta " + (d.atestado ? "que acompanha o presente pedido" : "cuja juntada desde já se requer") + ", e " + (d.faltaGrave ? "não registra falta grave nos doze meses anteriores ao implemento do requisito, pois a última anotação data de " + br(M.D(d.faltaGrave)) : "não registra falta grave durante a execução") + "." + (d.trabalho ? " O bom desempenho no trabalho atribuído encontra-se demonstrado pelos registros laborais que, inclusive, fundamentaram a remição de pena." : "") + (fim(d.ocupacao) ? " Quanto à subsistência, " + x.req + " dispõe de " + fim(d.ocupacao) + ", o que evidencia a aptidão exigida pela alínea d." : "") });
    if (d.reparacao === "reparado") b.push({ t: "p", r: "O dano causado pela infração foi reparado, satisfazendo-se o inciso IV do art. 83 do Código Penal." });
    else if (d.reparacao === "impossivel") b.push({ t: "p", r: "Quanto à reparação do dano, prevista no inciso IV do art. 83 do Código Penal, demonstra-se a efetiva impossibilidade de fazê-lo, em razão da condição econômica " + x.doReq + ", hipótese expressamente ressalvada pela própria norma." });
    if (res.condenacoes.some(c => /violência|morte|Feminicídio|organização|milícia/i.test(c.natureza))) b.push({ t: "p", r: "Por se tratar de condenação por crime cometido com violência ou grave ameaça à pessoa, o parágrafo único do art. 83 exige a constatação de condições pessoais que façam presumir que o liberado não voltará a delinquir, o que se extrai do comportamento ao longo da execução e dos elementos técnicos constantes dos autos." });
    b.push({ t: "p", r: "Assim, encontram-se presentes os requisitos subjetivos do livramento condicional, o que se requer seja reconhecido por Vossa Excelência." });

    b.push({ t: "h", texto: "IV. Dos pedidos" });
    b.push({ t: "p", r: "Diante do exposto, requer-se, ouvido o Ministério Público, nos termos do art. 112, § 2º, da LEP, e dispensado o parecer do Conselho Penitenciário, por força da redação conferida ao art. 70, I, da LEP pela Lei nº 10.792/2003, seja concedido o livramento condicional " + x.aoReq + ", com a especificação das condições previstas no art. 132 da LEP e a expedição da respectiva carta de livramento, nos termos do art. 136 da mesma lei." });
    if (d.remicaoPendente) b.push({ t: "p", r: "Requer-se, ainda, a declaração dos dias remidos ainda pendentes de apreciação, nos termos do art. 126, § 8º, da LEP, com a consequente retificação do atestado de pena a cumprir." });
    b.push(...assinaturas(d));
    return b;
  }

  root.EXEC_REQ = { progressao, livramento };
})(typeof window !== "undefined" ? window : globalThis);
