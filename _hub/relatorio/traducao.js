/* Relatório processual ao cliente: identificação do tribunal pelo número CNJ, normalização das movimentações
   (DataJud, texto colado ou peças extraídas do PDF dos autos), tradução para linguagem acessível e leitura da
   situação atual do processo. */
(function (root) {
  "use strict";
  const DIA = 864e5;
  const UF = { "01": "ac", "02": "al", "03": "ap", "04": "am", "05": "ba", "06": "ce", "07": "dft", "08": "es", "09": "go", "10": "ma", "11": "mt", "12": "ms", "13": "mg", "14": "pa", "15": "pb", "16": "pr", "17": "pe", "18": "pi", "19": "rj", "20": "rn", "21": "rs", "22": "ro", "23": "rr", "24": "sc", "25": "se", "26": "sp", "27": "to" };
  const dig = s => String(s || "").replace(/\D/g, "");
  /* endpoints: https://datajud-wiki.cnj.jus.br/api-publica/endpoints */
  function tribunal(numero) {
    const d = dig(numero); if (d.length !== 20) return null;
    const j = d[13], tr = d.slice(14, 16);
    if (j === "3") return "stj";
    if (j === "4") return +tr >= 1 && +tr <= 6 ? "trf" + +tr : null;
    if (j === "5") return tr === "00" ? "tst" : +tr >= 1 && +tr <= 24 ? "trt" + +tr : null;
    if (j === "6") return tr === "00" ? "tse" : UF[tr] ? "tre-" + UF[tr] : null;
    if (j === "7") return "stm";
    if (j === "8") return UF[tr] ? "tj" + UF[tr] : null;
    if (j === "9") return { "13": "tjmmg", "21": "tjmrs", "26": "tjmsp" }[tr] || null;
    return null;
  }
  function fmtCNJ(n) { const d = dig(n); return d.length === 20 ? d.slice(0, 7) + "-" + d.slice(7, 9) + "." + d.slice(9, 13) + "." + d[13] + "." + d.slice(14, 16) + "." + d.slice(16) : String(n || "").trim(); }
  function validoCNJ(n) {
    const d = dig(n); if (d.length !== 20) return false;
    /* dígito verificador (Resolução CNJ 65/2008, módulo 97) */
    const nnn = d.slice(0, 7), dv = d.slice(7, 9), resto = d.slice(9);
    const r = BigInt(nnn + resto + "00") % 97n;
    return String(98n - r).padStart(2, "0") === dv;
  }
  const semAcento = s => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  const br = d => d ? String(d.getUTCDate()).padStart(2, "0") + "/" + String(d.getUTCMonth() + 1).padStart(2, "0") + "/" + d.getUTCFullYear() : "";

  /* ------------------------------------------------------------------ tradução */
  /* cada regra: [regex sobre "nome | complementos" sem acento, texto, relevância 0 a 3, marcador de situação] */
  const AUD = c => { const t = /instrucao e julgamento/.test(c) ? "de instrução e julgamento" : /custodia/.test(c) ? "de custódia" : /preliminar/.test(c) ? "preliminar" : /conciliacao/.test(c) ? "de conciliação" : /instrucao/.test(c) ? "de instrução" : /justificacao/.test(c) ? "de justificação" : /admonit/.test(c) ? "admonitória" : /plenario|juri/.test(c) ? "de julgamento pelo Tribunal do Júri" : ""; return "audiência" + (t ? " " + t : ""); };
  const REGRAS = [
    [/transito em julgado/, () => "A decisão transitou em julgado, isto é, não cabe mais recurso.", 3, "transito"],
    [/baixa definitiva/, () => "O processo recebeu baixa definitiva.", 3, "arquivado"],
    [/desarquiv/, () => "O processo foi desarquivado para a prática de novos atos.", 2, "desarquivado"],
    [/arquivamento|^definitivo|\| definitivo|provisorio/, c => /provisorio/.test(c) ? "O processo foi arquivado provisoriamente." : "O processo foi arquivado.", 3, "arquivado"],
    [/determinacao de arquivamento de procedimentos investigatorios/, () => "Foi determinado o arquivamento da investigação.", 3, "arquivado"],
    [/morte do agente/, () => "Foi declarada extinta a punibilidade pela morte do agente.", 3, "extinto"],
    [/prescricao/, () => "Foi declarada extinta a punibilidade pela prescrição.", 3, "extinto"],
    [/decadencia|perempcao/, () => "Foi declarada extinta a punibilidade por decadência ou perempção.", 3, "extinto"],
    [/extincao da punibilidade|extinta a punibilidade|cumprimento da pena/, () => "Foi declarada extinta a punibilidade.", 3, "extinto"],
    [/impronuncia/, () => "O juiz impronunciou o réu: não há, por ora, elementos para submetê-lo ao Tribunal do Júri.", 3, "sentenca"],
    [/pronuncia/, () => "O réu foi pronunciado e será submetido a julgamento pelo Tribunal do Júri.", 3, "pronuncia"],
    [/absolvicao sumaria/, () => "O juiz absolveu sumariamente o réu, encerrando a ação penal em seu favor.", 3, "sentenca"],
    [/procedencia em parte|parcialmente procedente/, () => "Foi proferida sentença de procedência parcial, com condenação por parte das imputações.", 3, "sentenca"],
    [/improcedencia/, () => "Foi proferida sentença de improcedência, com a absolvição.", 3, "sentenca"],
    [/procedencia/, () => "Foi proferida sentença de procedência, com condenação.", 3, "sentenca"],
    [/desclassific/, () => "O juiz desclassificou o crime imputado para outro de menor gravidade ou de competência diversa.", 3, "decisao"],
    [/nao acolhimento de embargos/, () => "Os embargos de declaração foram rejeitados.", 2, "decisao"],
    [/acolhimento de embargos/, () => "Os embargos de declaração foram acolhidos.", 2, "decisao"],
    [/homologacao do acordo de nao persecucao/, () => "Foi homologado o acordo de não persecução penal (ANPP).", 3, "acordo"],
    [/revogacao do acordo de nao persecucao/, () => "O acordo de não persecução penal foi revogado.", 3, "decisao"],
    [/acordo de nao persecucao/, () => "Houve movimentação relativa ao acordo de não persecução penal (ANPP).", 2, null],
    [/revogacao da suspensao condicional/, () => "A suspensão condicional do processo foi revogada.", 3, "decisao"],
    [/suspensao condicional do processo/, () => "Foi aplicada a suspensão condicional do processo, que fica suspenso durante o período de prova.", 3, "acordo"],
    [/transacao penal/, () => "Houve movimentação relativa à transação penal.", 3, "acordo"],
    [/manutencao da prisao/, () => "O juiz manteve a prisão preventiva.", 3, "decisao"],
    [/revogacao da prisao|relaxamento/, () => "A prisão foi revogada ou relaxada.", 3, "decisao"],
    [/liberdade provisoria/, () => "Foi concedida liberdade provisória.", 3, "decisao"],
    [/medida cautelar diversa|medidas cautelares/, () => "Foram fixadas medidas cautelares diversas da prisão.", 3, "decisao"],
    [/prisao preventiva|decretacao de prisao|^prisao/, () => "Houve decisão sobre prisão.", 3, "decisao"],
    [/medida protetiva/, () => "Houve decisão sobre medida protetiva de urgência.", 3, "decisao"],
    [/revel/, () => "Foi decretada a revelia do réu.", 3, "decisao"],
    [/citado por edital|suspensao do processo e do prazo prescricional/, () => "O réu foi citado por edital e o processo pode ficar suspenso até que ele compareça.", 3, "decisao"],
    [/insanidade mental/, () => "Foi instaurado incidente de insanidade mental, com realização de perícia.", 3, "decisao"],
    [/incompetencia/, () => "O juízo declarou-se incompetente e o processo deverá ser remetido a outro juízo.", 3, "decisao"],
    [/julgamento em diligencia/, () => "O julgamento foi convertido em diligência para a produção de prova ou providência complementar.", 2, "decisao"],
    [/denuncia oferecida|oferecimento da denuncia/, () => "O Ministério Público ofereceu denúncia.", 3, null],
    [/auto de prisao em flagrante/, () => "Foi lavrado auto de prisão em flagrante.", 3, null],
    [/relatorio final/, () => "A autoridade policial concluiu o inquérito e apresentou relatório final.", 3, null],
    [/resposta a acusacao/, () => "A defesa apresentou resposta à acusação.", 2, null],
    [/alegacoes finais|memoriais/, () => "Foram apresentadas alegações finais.", 2, null],
    [/interrogatorio/, () => "Foi realizado o interrogatório do réu.", 3, null],
    [/laudo/, () => "Foi juntado laudo pericial.", 2, null],
    [/termo de depoimento/, () => "Foi juntado termo de depoimento.", 1, null],
    [/provimento|provido|conhecido/, () => "O tribunal julgou o recurso.", 3, "sentenca"],
    [/efeito suspensivo|efeito devolutivo/, () => "O recurso foi recebido e definido o efeito em que tramitará.", 1, null],
    [/levantamento da suspensao/, () => "O processo voltou a tramitar após período de suspensão.", 2, null],
    [/^denuncia|recebida a denuncia|recebimento da denuncia|^queixa/, c => /queixa/.test(c) ? "A queixa-crime foi recebida pelo juiz, dando início à ação penal." : "A denúncia foi recebida pelo juiz: a investigação deu lugar à ação penal.", 3, "recebimento"],
    [/audiencia|de instrucao|preliminar|de conciliacao|de custodia|de justificacao/, c => {
      const a = AUD(c);
      if (/redesignad/.test(c)) return "A " + a + " foi redesignada para nova data.";
      if (/cancelad|nao-realizad|nao realizad/.test(c)) return "A " + a + " não foi realizada.";
      if (/realizad/.test(c)) return "Foi realizada a " + a + ".";
      if (/designad/.test(c)) return "Foi designada " + a + ".";
      return "Houve movimentação relativa à " + a + ".";
    }, 3, "audiencia"],
    [/inclusao em pauta|pauta de julgamento/, () => "O recurso foi incluído na pauta de julgamento do tribunal.", 2, "remessa"],
    [/conclus/, c => /julgamento|sentenca/.test(c) ? "Os autos foram enviados ao juiz para sentença." : /decisao/.test(c) ? "Os autos foram enviados ao juiz para decisão." : "Os autos foram enviados ao juiz para despacho.", 2, "concluso"],
    [/remessa.*(grau de recurso|instancia superior)/, () => "Os autos foram enviados ao tribunal para julgamento de recurso.", 3, "remessa"],
    [/remessa/, c => /grau de recurso|instancia superior|tribunal/.test(c) ? "Os autos foram enviados ao tribunal para julgamento de recurso." : /cejusc/.test(c) ? "Os autos foram enviados ao centro de conciliação." : "Os autos foram remetidos a outro setor ou órgão.", 1, "remessa"],
    [/recebimento/, c => /instancia superior|grau de recurso/.test(c) ? "O tribunal recebeu os autos para julgamento do recurso." : "Os autos foram recebidos no setor responsável.", 0, null],
    [/redistribui/, () => "O processo foi redistribuído a outro juízo.", 2, null],
    [/distribui/, () => "O processo foi distribuído ao juízo responsável.", 1, null],
    [/evolucao da classe|mudanca de classe|retificacao de classe/, () => "A classe do processo foi atualizada no sistema do tribunal, por exemplo, de inquérito para ação penal.", 1, null],
    [/\bcarga\b|\bvista\b/, () => "Os autos foram disponibilizados a uma das partes, como o Ministério Público ou a defesa, para manifestação.", 1, "vista"],
    [/mandado/, c => /nao entregue/.test(c) ? "O mandado não foi cumprido, em regra porque o destinatário não foi localizado." : /entregue|cumprid/.test(c) ? "O mandado foi cumprido pelo oficial de justiça." : "Foi expedido mandado para cumprimento por oficial de justiça.", 1, null],
    [/expedicao de documento|^documento|expedida\/certificada|ato ordinatorio/, c => /carta precatoria/.test(c) ? "Foi expedida carta precatória, pedido para que ato seja praticado em outra comarca." : /mandado/.test(c) ? "Foi expedido mandado para cumprimento por oficial de justiça." : /oficio/.test(c) ? "Foi expedido ofício a outro órgão." : /intimacao|notificacao/.test(c) ? "Foi expedida intimação." : /citacao/.test(c) ? "Foi expedida citação." : /alvara/.test(c) ? "Foi expedido alvará." : /acordao/.test(c) ? "Foi juntado acórdão do tribunal." : /ato ordinatorio/.test(c) ? "O cartório praticou ato de rotina, sem decisão judicial." : "O cartório expediu ou juntou documento.", 0, null],
    [/citacao|citado/, () => "O réu foi citado para responder à acusação.", 2, null],
    [/intimacao|intimado/, () => "Foi realizada intimação.", 1, null],
    [/decurso de prazo/, () => "Terminou o prazo concedido para manifestação de uma das partes.", 1, null],
    [/disponibilizacao no diario|publicacao/, () => "O ato foi publicado no Diário da Justiça; a partir da publicação correm os prazos.", 1, null],
    [/parecer/, () => "Foi juntado parecer, em regra do Ministério Público.", 2, null],
    [/peticao|juntada/, () => "Foi juntada petição aos autos.", 1, null],
    [/mero expediente|despacho/, () => "O juiz proferiu despacho de andamento, sem decidir questão de mérito.", 1, null],
    [/outras decisoes|decisao/, () => "O juiz proferiu decisão no processo.", 2, "decisao"],
    [/acordao|julgamento/, () => "Houve julgamento no tribunal.", 3, "sentenca"],
    [/sentenca/, () => "Foi proferida sentença.", 3, "sentenca"],
    [/apensamento|desapensamento|desmembramento/, c => /desapens/.test(c) ? "Outro processo foi desvinculado deste." : /desmembr/.test(c) ? "O processo foi desmembrado em relação a parte dos investigados ou réus." : "Outro processo foi vinculado (apensado) a este.", 1, null],
    [/tramitacao direta/, () => "Iniciou-se a tramitação direta da investigação entre o Ministério Público e a polícia.", 1, null],
    [/calculo|custas/, () => "Foi elaborado cálculo de custas ou de valores.", 1, null],
    [/suspens|sobrestamento/, () => "O processo foi suspenso.", 2, "suspenso"]
  ];
  function traduzir(m) {
    const c = semAcento([m.nome, ...(m.compl || [])].filter(Boolean).join(" | "));
    for (const [re, txt, rel, sit] of REGRAS) if (re.test(c)) return { texto: txt(c), rel, sit };
    return { texto: "Movimentação registrada: " + String(m.nome || "").trim().replace(/[.]$/, "") + ".", rel: 1, sit: null };
  }

  /* ------------------------------------------------------------------ normalização */
  function doDatajud(resp) {
    const procs = (resp && resp.processos) || [];
    const vistos = new Set(), movs = [];
    for (const p of procs) for (const m of p.movimentos || []) {
      const d = new Date(m.dataHora); if (isNaN(d)) continue;
      const chave = m.dataHora.slice(0, 16) + "|" + m.codigo + "|" + (m.nome || "");
      if (vistos.has(chave)) continue; vistos.add(chave);
      movs.push({ data: new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())), hora: m.dataHora, nome: m.nome || "", compl: (m.complementosTabelados || []).map(x => x.nome).filter(Boolean), codigo: m.codigo, grau: p.grau, orgao: (m.orgaoJulgador || {}).nome || (p.orgaoJulgador || {}).nome });
    }
    movs.sort((a, b) => (a.hora < b.hora ? -1 : a.hora > b.hora ? 1 : 0));
    const atual = procs.slice().sort((a, b) => String(b.dataHoraUltimaAtualizacao).localeCompare(String(a.dataHoraUltimaAtualizacao)));
    const g1 = atual.find(p => p.grau === "G1") || atual[0] || {};
    const graus = [...new Set(procs.map(p => p.grau))];
    const instancias = atual.map(p => ({ grau: p.grau, classe: (p.classe || {}).nome, orgao: (p.orgaoJulgador || {}).nome, sistema: (p.sistema || {}).nome }));
    const aj = String(g1.dataAjuizamento || ""); const ajD = /^\d{8}/.test(aj) ? new Date(Date.UTC(+aj.slice(0, 4), +aj.slice(4, 6) - 1, +aj.slice(6, 8))) : null;
    return { movs, meta: { classe: (g1.classe || {}).nome, orgao: (g1.orgaoJulgador || {}).nome, ajuizamento: ajD, graus, instancias, atualizado: atual[0] ? new Date(atual[0].dataHoraUltimaAtualizacao) : null, sigilo: g1.nivelSigilo } };
  }
  /* texto colado: cada andamento começa com uma data (dd/mm/aaaa, com ou sem hora) */
  function doTexto(txt) {
    const linhas = String(txt || "").split(/\r?\n/).map(l => l.trim()).filter(Boolean), movs = [];
    const re = /^(\d{2})[\/.-](\d{2})[\/.-](\d{4})(?:\s*(?:às|-|,)?\s*\d{1,2}:\d{2}(?::\d{2})?)?\s*[-–:|]?\s*(.*)$/;
    for (const l of linhas) {
      const m = re.exec(l);
      if (m) movs.push({ data: new Date(Date.UTC(+m[3], +m[2] - 1, +m[1])), nome: m[4] || "", compl: [], hora: m[3] + m[2] + m[1] + String(movs.length).padStart(4, "0") });
      else if (movs.length) movs[movs.length - 1].nome += (movs[movs.length - 1].nome ? " " : "") + l;
    }
    movs.sort((a, b) => a.data - b.data);
    return { movs, meta: {} };
  }
  /* PDF dos autos: peças identificadas pelo estudo de caso, datadas pela assinatura eletrônica */
  const PECA_MOV = { denuncia: "Denúncia oferecida", recebimento: "Recebida a denúncia", resposta: "Petição: resposta à acusação", audiencia: "Audiência realizada", alegacoes: "Petição: alegações finais", sentenca: "Sentença", prisao: "Decisão sobre prisão ou medidas cautelares", relatorio: "Relatório final do inquérito", busca: "Decisão de busca e apreensão", laudo: "Documento: laudo pericial", depoimento: "Documento: termo de depoimento", interrogatorio: "Interrogatório", apf: "Auto de prisão em flagrante" };
  function doPdf(pgs, pecas) {
    const movs = [];
    const dataDe = pg => {
      let m = /assinad[oa] eletronicamente[^\n]{0,120}?(\d{2})\/(\d{2})\/(\d{4})/i.exec(pg.texto) || /(\d{2})\/(\d{2})\/(\d{4})\s+\d{2}:\d{2}/.exec(pg.texto);
      return m ? new Date(Date.UTC(+m[3], +m[2] - 1, +m[1])) : null;
    };
    for (const it of pecas) {
      const d = it.pgs.map(dataDe).find(Boolean); if (!d) continue;
      let nome = PECA_MOV[it.id] || it.rot;
      if (it.id === "sentenca") { const t = it.low; nome = /\bcondeno\b/.test(t) && /\babsolvo\b/.test(t) ? "Sentença de procedência em parte" : /\bcondeno\b/.test(t) ? "Sentença de procedência" : /\babsolvo\b/.test(t) ? "Sentença de improcedência" : "Sentença"; }
      movs.push({ data: d, nome, compl: [], hora: d.toISOString() + String(movs.length).padStart(4, "0"), ref: it.ref });
    }
    movs.sort((a, b) => a.data - b.data);
    return { movs, meta: {} };
  }

  /* ------------------------------------------------------------------ situação atual */
  function situacao(movs) {
    const t = movs.map(m => Object.assign({}, m, traduzir(m)));
    const ultimo = sit => { for (let i = t.length - 1; i >= 0; i--) if (t[i].sit === sit) return t[i]; return null; };
    const ult = t[t.length - 1];
    if (!ult) return { texto: "Não há movimentações disponíveis para indicar a situação atual do processo.", proximo: "" };
    const trans = ultimo("transito"), arq = ultimo("arquivado"), desarq = ultimo("desarquivado"), ext = ultimo("extinto");
    if (ext && (!desarq || ext.data >= desarq.data)) return { texto: "A punibilidade foi declarada extinta em " + br(ext.data) + ".", proximo: "Resta apenas o eventual arquivamento definitivo, sem providências pendentes para o cliente." };
    if (arq && (!desarq || arq.data >= desarq.data)) return { texto: "O processo encontra-se arquivado desde " + br(arq.data) + ".", proximo: "Não há providências pendentes, salvo eventual desarquivamento." };
    if (trans && trans === t.slice().reverse().find(x => x.rel >= 3)) return { texto: "A decisão transitou em julgado em " + br(trans.data) + ".", proximo: "Seguem-se as providências de cumprimento da decisão e o posterior arquivamento." };
    const relevantes = t.filter(x => x.rel >= 2), r = relevantes[relevantes.length - 1] || ult;
    switch (r.sit) {
      case "audiencia": return /designad|redesignad/.test(semAcento(r.compl.join(" ") + " " + r.nome)) ? { texto: "Há audiência designada, conforme andamento de " + br(r.data) + ".", proximo: "Aguarda-se a realização da audiência; a equipe confirmará a data, o horário e o formato e orientará o cliente previamente." } : { texto: "A última audiência registrada ocorreu em " + br(r.data) + ".", proximo: "Após a audiência, seguem-se, em regra, as alegações finais das partes e a sentença." };
      case "concluso": return { texto: "O processo está concluso ao juiz desde " + br(r.data) + ".", proximo: /senten/.test(r.texto) ? "Aguarda-se a prolação da sentença." : /decis/.test(r.texto) ? "Aguarda-se decisão judicial." : "Aguarda-se despacho judicial para o prosseguimento." };
      case "sentenca": return { texto: "Foi proferida sentença ou julgamento em " + br(r.data) + ".", proximo: "Está em curso o prazo para recurso ou o processamento de recurso já interposto; a estratégia recursal será discutida com o cliente." };
      case "pronuncia": return { texto: "O réu foi pronunciado em " + br(r.data) + ".", proximo: "Cabe recurso em sentido estrito; mantida a pronúncia, o processo seguirá para a preparação do julgamento em plenário." };
      case "recebimento": return { texto: "A denúncia foi recebida em " + br(r.data) + ".", proximo: "Segue-se a citação e a apresentação da resposta à acusação, no prazo de dez dias (CPP, art. 396)." };
      case "remessa": if (/pauta/.test(r.texto)) return { texto: "O recurso foi incluído na pauta de julgamento em " + br(r.data) + ".", proximo: "Aguarda-se a sessão de julgamento no tribunal; a equipe avaliará a conveniência de sustentação oral e de memoriais." };
        return /tribunal/.test(r.texto) ? { texto: "Os autos foram remetidos ao tribunal em " + br(r.data) + ".", proximo: "Aguarda-se o julgamento do recurso." } : { texto: "O processo segue em tramitação; o último ato relevante ocorreu em " + br(r.data) + ".", proximo: "Aguarda-se o prosseguimento regular." };
      case "acordo": return { texto: "Há acordo ou benefício processual em curso desde " + br(r.data) + ".", proximo: "Acompanha-se o cumprimento das condições, ao fim do qual se requererá a extinção da punibilidade." };
      case "suspenso": return { texto: "O processo encontra-se suspenso desde " + br(r.data) + ".", proximo: "Aguarda-se o término da causa de suspensão." };
      case "vista": return { texto: "Os autos estão com vista para manifestação desde " + br(r.data) + ".", proximo: "Aguarda-se a manifestação da parte intimada." };
      default: return { texto: "O processo segue em tramitação regular; a última movimentação ocorreu em " + br(ult.data) + ".", proximo: "Não há providência pendente por parte do cliente no momento." };
    }
  }

  root.REL_TRAD = { tribunal, fmtCNJ, validoCNJ, traduzir, doDatajud, doTexto, doPdf, situacao, br, dig };
})(typeof window !== "undefined" ? window : globalThis);
