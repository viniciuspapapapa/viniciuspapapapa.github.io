/* Regras da ferramenta de reconhecimento de pessoas: quesitos do procedimento (CPP, arts. 226 a 228; Resolução
   CNJ 484/2022), variáveis de estimativa da memória, avaliação da validade e base jurídica. */
(function (root) {
  "use strict";

  const MODALIDADES = {
    pessoal: "Reconhecimento pessoal por alinhamento",
    fotografico: "Reconhecimento fotográfico por conjunto de fotos",
    fotoUnica: "Exibição de foto única do suspeito",
    showup: "Apresentação isolada do suspeito (show-up), inclusive em viatura ou na delegacia",
    redes: "Imagens de redes sociais ou de aplicativo de mensagens",
    video: "Reconhecimento por vídeo ou imagens de câmeras",
    voz: "Reconhecimento por voz"
  };
  const FASES = { inquerito: "Inquérito policial", juizo: "Instrução em juízo", plenario: "Plenário do Júri" };
  const FASE_PROC = {
    inquerito: "Inquérito em curso, sem denúncia",
    denuncia: "Denúncia oferecida, ainda não recebida",
    instrucao: "Ação penal em instrução",
    pronuncia: "Fase de pronúncia (Júri)",
    sentenca: "Alegações finais ou sentença",
    recurso: "Grau recursal",
    execucao: "Condenação definitiva (revisão criminal)"
  };

  /* quesitos: id, pergunta, opções, avaliação por resposta: [status, gravidade] */
  const Q = [
    { id: "descricao", grupo: "procedimento", art: "CPP, art. 226, I", p: "O reconhecedor descreveu previamente a pessoa, e a descrição foi registrada antes do ato?", vicio: "Ausência de descrição prévia registrada", texto: "O art. 226, I, do CPP impõe que o reconhecedor seja convidado a descrever a pessoa antes de qualquer exibição. Sem descrição prévia registrada, não há parâmetro para aferir se a pessoa apontada corresponde à memória original, e o ato perde a sua função de controle." },
    { id: "compat", grupo: "procedimento", art: "CPP, art. 226, I", p: "A descrição prévia é compatível com as características do reconhecido?", ops: [["", "Não consta"], ["sim", "Sim"], ["parcial", "Parcialmente"], ["nao", "Não"]], vicio: "Descrição prévia incompatível com o reconhecido", texto: "A descrição dada antes do ato não corresponde, no todo ou em parte, às características da pessoa reconhecida. A divergência entre a memória original e a pessoa apontada é indicativo objetivo de erro de identificação." },
    { id: "alinhamento", grupo: "procedimento", art: "CPP, art. 226, II", p: "O suspeito foi colocado ao lado de outras pessoas (ou entre outras fotos) para o reconhecimento?", vicio: "Ausência de alinhamento", texto: "O art. 226, II, do CPP exige que a pessoa a ser reconhecida seja colocada ao lado de outras que com ela tenham semelhança. A apresentação isolada do suspeito equivale a sugerir ao reconhecedor quem deve ser apontado." },
    { id: "semelhanca", grupo: "procedimento", art: "CPP, art. 226, II", p: "As demais pessoas ou fotos tinham semelhança física relevante com o suspeito e com a descrição prévia?", vicio: "Alinhamento sem semelhança entre os participantes", texto: "Alinhamento composto por pessoas ou fotos sem semelhança com o suspeito ou com a descrição prévia é sugestivo: o suspeito se destaca dos demais, e a escolha deixa de depender da memória." },
    { id: "exposicao", grupo: "contaminacao", art: "CPP, art. 226; Res. CNJ 484/2022", p: "O reconhecedor viu antes a imagem ou a pessoa do suspeito (foto exibida por policial, redes sociais, imprensa, viatura, algemado)?", inverso: true, vicio: "Exposição prévia do reconhecedor ao suspeito", texto: "A exposição prévia à imagem ou à pessoa do suspeito contamina a memória do reconhecedor, que passa a reconhecer o rosto visto depois do fato, e não o do autor. A contaminação é irreversível e se transmite a todos os reconhecimentos posteriores." },
    { id: "advertencia", grupo: "boas", art: "Res. CNJ 484/2022", p: "O reconhecedor foi advertido de que o autor poderia não estar entre as pessoas ou fotos apresentadas?", vicio: "Ausência de advertência de que o autor pode não estar presente", texto: "Sem a advertência de que o autor pode não estar entre os apresentados, o reconhecedor tende a escolher a pessoa mais parecida, presumindo que a polícia já identificou o culpado. A Resolução CNJ 484/2022 recomenda expressamente essa instrução." },
    { id: "cego", grupo: "boas", art: "Res. CNJ 484/2022; literatura científica", p: "O ato foi conduzido por pessoa que não sabia quem era o suspeito (procedimento cego)?", vicio: "Condução por agente que conhecia o suspeito", texto: "Quando o condutor sabe quem é o suspeito, sinais involuntários (olhares, pausas, reforços) influenciam a escolha. A condução cega é a principal salvaguarda recomendada pela literatura científica sobre identificação de pessoas." },
    { id: "confianca", grupo: "boas", art: "Res. CNJ 484/2022", p: "O grau de confiança do reconhecedor foi registrado logo após o ato, com as suas palavras?", vicio: "Confiança não registrada no momento do ato", texto: "A confiança só tem valor informativo quando registrada imediatamente. A certeza manifestada depois, sobretudo em juízo, costuma ser inflada por reforços posteriores e não se correlaciona com a exatidão do reconhecimento." },
    { id: "auto", grupo: "procedimento", art: "CPP, art. 226, IV", p: "Foi lavrado auto pormenorizado, assinado pela autoridade, pelo reconhecedor e por duas testemunhas presenciais?", vicio: "Ausência de auto pormenorizado com testemunhas", texto: "O art. 226, IV, do CPP exige auto pormenorizado, subscrito pela autoridade, pelo reconhecedor e por duas testemunhas presenciais. Sem ele, não há documentação de como o ato se realizou, e o reconhecimento se converte em mera declaração." },
    { id: "gravacao", grupo: "boas", art: "Res. CNJ 484/2022", p: "O ato foi gravado em áudio e vídeo?", vicio: "Ato não gravado", texto: "A ausência de gravação impede a verificação posterior das condições do ato, das instruções dadas e da reação do reconhecedor, que ficam dependentes da versão de quem o conduziu." },
    { id: "separado", grupo: "procedimento", art: "CPP, art. 228", p: "Havendo mais de um reconhecedor, cada um fez o reconhecimento separadamente, sem comunicação com os demais?", ops: [["", "Não consta"], ["sim", "Sim"], ["nao", "Não"], ["na", "Não se aplica (um só reconhecedor)"]], vicio: "Reconhecedores sem isolamento", texto: "O art. 228 do CPP determina que, havendo vários reconhecedores, cada um faça a prova em separado, evitando-se qualquer comunicação entre eles. O reconhecimento conjunto ou precedido de conversa entre reconhecedores produz conformidade de memória." },
    { id: "repeticao", grupo: "contaminacao", art: "STJ, HC 598.886/SC", p: "Este ato repete reconhecimento anterior feito pelo mesmo reconhecedor (por exemplo, ratificação em juízo de reconhecimento feito na delegacia)?", inverso: true, vicio: "Repetição de reconhecimento anterior", texto: "O reconhecimento é prova de natureza irrepetível: a segunda exibição do mesmo suspeito reativa a memória formada no primeiro ato, e não a do fato. A ratificação em juízo de reconhecimento viciado não o convalida." }
  ];
  const ESTIMADORES = [
    { id: "breve", p: "O reconhecedor viu o autor por tempo muito breve (segundos)?", risco: "observação de curta duração" },
    { id: "condicoes", p: "As condições de observação eram adversas (pouca luz, distância, ângulo, rosto parcialmente coberto por capuz, boné, capacete ou máscara)?", risco: "condições adversas de observação" },
    { id: "arma", p: "Havia arma visível durante o fato?", risco: "efeito do foco na arma, que desvia a atenção do rosto do autor" },
    { id: "estresse", p: "Houve violência ou estresse intenso durante o fato?", risco: "estresse elevado, que prejudica a codificação da memória do rosto" },
    { id: "raca", p: "Reconhecedor e reconhecido pertencem a grupos étnico-raciais diferentes?", risco: "efeito da outra raça, que reduz a exatidão do reconhecimento de rostos de grupo diverso" },
    { id: "desconhecido", p: "O autor era pessoa desconhecida do reconhecedor antes do fato?", risco: "autor desconhecido do reconhecedor" }
  ];

  const ESSENCIAIS = ["descricao", "alinhamento", "semelhanca", "exposicao", "auto", "repeticao"];
  function avaliar(r) {
    const itens = [], vicios = [], requerer = [], riscos = [];
    const sugestivas = ["fotoUnica", "showup", "redes"].includes(r.modalidade);
    for (const q of Q) {
      if (q.id === "separado" && r.respostas.separado === "na") continue;
      if (q.id === "compat" && r.respostas.descricao === "nao") continue;
      if ((q.id === "semelhanca") && r.respostas.alinhamento === "nao") continue;
      const v = r.respostas[q.id] || "";
      let st;
      if (!v) st = "requerer";
      else if (q.inverso) st = v === "sim" ? "vicio" : "conforme";
      else st = v === "sim" ? "conforme" : v === "parcial" ? "vicio" : "vicio";
      const it = { q, v, st, essencial: ESSENCIAIS.includes(q.id) };
      itens.push(it);
      if (st === "vicio") vicios.push(it); else if (st === "requerer") requerer.push(it);
    }
    if (sugestivas) vicios.unshift({ q: { id: "modalidade", art: "STJ, HC 598.886/SC; STF, RHC 206.846/SP", vicio: MODALIDADES[r.modalidade], texto: r.modalidade === "fotoUnica" ? "A exibição de foto única do suspeito é procedimento intrinsecamente sugestivo, que dispensa o reconhecedor de qualquer escolha e induz a confirmação da suspeita policial." : r.modalidade === "showup" ? "A apresentação isolada do suspeito, sobretudo detido, algemado ou em viatura, comunica ao reconhecedor que a polícia já identificou o autor, e é a forma mais sugestiva de identificação." : "O uso de imagens de redes sociais ou de aplicativos de mensagens, fora de qualquer alinhamento, expõe o reconhecedor a fotos isoladas e escolhidas por terceiros, contaminando a memória." }, st: "vicio", essencial: true });
    for (const e of ESTIMADORES) if (r.estimadores[e.id] === "sim") riscos.push(e.risco);
    const dias = r.dataFato && r.dataRec ? Math.round((r.dataRec - r.dataFato) / 864e5) : null;
    if (dias != null && dias > 30) riscos.push("intervalo de " + dias + " dias entre o fato e o reconhecimento, período em que a memória decai e se torna mais suscetível a sugestões");
    const fotografico = ["fotografico", "fotoUnica", "redes", "video"].includes(r.modalidade);
    const essenciais = vicios.filter(v => v.essencial);
    let conclusao;
    if (essenciais.length) conclusao = "invalido";
    else if (vicios.length) conclusao = "fragil";
    else if (requerer.length) conclusao = "indeterminado";
    else conclusao = "regular";
    return { itens, vicios, requerer, riscos, dias, fotografico, sugestivas, conclusao };
  }

  /* pistas no texto do auto ou dos depoimentos: são apenas sugestões, confirmadas pelo usuário */
  const PISTAS = [
    { re: /\b(fotografias?|fotos?|[áa]lbum|imagens? (do|de) suspeito)/i, campo: "modalidade", valor: "fotografico", rot: "Menção a fotografias ou álbum" },
    { re: /\b(whats\s?app|instagram|facebook|rede(s)? socia(l|is)|perfil)/i, campo: "modalidade", valor: "redes", rot: "Menção a redes sociais ou aplicativo de mensagens" },
    { re: /\b(uma [úu]nica foto|apenas uma foto|somente uma foto|foto do (suspeito|acusado|investigado|conduzido))/i, campo: "modalidade", valor: "fotoUnica", rot: "Indício de foto única" },
    { re: /\b(viatura|algemad[oa]|foi apresentad[oa]|apresentaram o|conduzid[oa] at[ée] a v[íi]tima|na pr[óo]pria delegacia)/i, campo: "exposicao", valor: "sim", rot: "Indício de apresentação isolada ou exposição prévia" },
    { re: /\b(ao lado de|juntamente com outr|outras? pessoas?|demais pessoas|semelhan)/i, campo: "alinhamento", valor: "sim", rot: "Menção a outras pessoas no ato" },
    { re: /\b(descreveu|descri[çc][ãa]o|estatura|cor da pele|tatuagem|cabelo|compleição)/i, campo: "descricao", valor: "sim", rot: "Menção a descrição de características" },
    { re: /\b(sem sombra de d[úu]vida|com (absoluta |total )?certeza|100\s?%|n[ãa]o tem d[úu]vida)/i, campo: "confianca", valor: null, rot: "Afirmação de certeza (verifique quando foi registrada)" },
    { re: /\b(testemunhas? (presenciais|instrument[áa]rias)|assinam|subscrevem)/i, campo: "auto", valor: "sim", rot: "Menção a testemunhas ou assinaturas do auto" },
    { re: /\b(capuz|capacete|m[áa]scara|bon[ée]|encapuzad)/i, campo: "condicoes", valor: "sim", rot: "Rosto parcialmente encoberto" },
    { re: /\b(arma|rev[óo]lver|pistola|faca|simulacro)/i, campo: "arma", valor: "sim", rot: "Arma presente no fato" },
    { re: /\b([àa] noite|escuro|pouca (luz|ilumina)|madrugada)/i, campo: "condicoes", valor: "sim", rot: "Observação noturna ou com pouca luz" }
  ];
  function pistas(texto) {
    const out = [];
    for (const p of PISTAS) {
      const r = new RegExp(p.re.source, "gi"); let m;
      while ((m = r.exec(texto))) { out.push(Object.assign({ trecho: texto.slice(Math.max(0, m.index - 90), m.index + m[0].length + 90).replace(/\s+/g, " ").trim(), achado: m[0] }, p)); if (out.filter(x => x.rot === p.rot).length >= 2) break; }
    }
    return out;
  }

  const JUR = {
    art226: "Art. 226. Quando houver necessidade de fazer-se o reconhecimento de pessoa, proceder-se-á pela seguinte forma: I - a pessoa que tiver de fazer o reconhecimento será convidada a descrever a pessoa que deva ser reconhecida; II - a pessoa, cujo reconhecimento se pretender, será colocada, se possível, ao lado de outras que com ela tiverem qualquer semelhança, convidando-se quem tiver de fazer o reconhecimento a apontá-la; III - se houver razão para recear que a pessoa chamada para o reconhecimento, por efeito de intimidação ou outra influência, não diga a verdade em face da pessoa que deve ser reconhecida, a autoridade providenciará para que esta não veja aquela; IV - do ato de reconhecimento lavrar-se-á auto pormenorizado, subscrito pela autoridade, pela pessoa chamada para proceder ao reconhecimento e por duas testemunhas presenciais. Parágrafo único. O disposto no III deste artigo não terá aplicação na fase da instrução criminal ou em plenário de julgamento.",
    art228: "Art. 228. Se várias forem as pessoas chamadas a efetuar o reconhecimento de pessoa ou de objeto, cada uma fará a prova em separado, evitando-se qualquer comunicação entre elas.",
    precedentes: [
      { id: "hc598886", fonte: "STJ, Sexta Turma, HC 598.886/SC, Rel. Min. Rogerio Schietti Cruz, j. 27/10/2020", tese: "O reconhecimento de pessoas deve observar o procedimento previsto no art. 226 do CPP, cujas formalidades constituem garantia mínima para quem se encontra na condição de suspeito. A inobservância do procedimento torna inválido o reconhecimento, que não poderá servir de lastro a eventual condenação, mesmo se confirmado em juízo. O juiz pode realizar em juízo o reconhecimento formal, observado o procedimento, e pode convencer-se da autoria a partir de outras provas que não guardem relação de causa e efeito com o ato viciado. O reconhecimento por mera exibição de fotografias, além de seguir o mesmo procedimento, é etapa antecedente a eventual reconhecimento pessoal e não pode servir como prova em ação penal, ainda que confirmado em juízo." },
      { id: "rhc206846", fonte: "STF, Segunda Turma, RHC 206.846/SP, Rel. Min. Gilmar Mendes, j. 22/2/2022", tese: "O reconhecimento de pessoas, presencial ou por fotografia, deve observar o procedimento do art. 226 do CPP, cujas formalidades constituem garantia mínima para o suspeito; a inobservância torna inválido o reconhecimento, que não pode lastrear condenação, ainda que confirmado em juízo, e o reconhecimento fotográfico deve ser visto como etapa antecedente ao pessoal." },
      { id: "hc652284", fonte: "STJ, Quinta Turma, HC 652.284/SC, Rel. Min. Reynaldo Soares da Fonseca, j. 27/4/2021", tese: "A Quinta Turma aderiu à orientação firmada pela Sexta Turma, reconhecendo que a inobservância do art. 226 do CPP invalida o reconhecimento e impede que ele, isoladamente, sustente a condenação." },
      { id: "cnj484", fonte: "Resolução CNJ nº 484, de 19/12/2022", tese: "Estabelece diretrizes para a realização do reconhecimento de pessoas em procedimentos e processos criminais e sua avaliação pelo Poder Judiciário, com ênfase na entrevista prévia e no registro da descrição, no alinhamento justo com pessoas semelhantes, na advertência de que o autor pode não estar presente, no registro imediato da confiança, na gravação do ato e na vedação de procedimentos sugestivos, como a exibição de foto única ou a apresentação isolada do suspeito." }
    ],
    doutrina: [
      { autor: "Aury Lopes Jr.", ideia: "O reconhecimento é prova de natureza irrepetível e altamente suscetível a falsas memórias; a inobservância do art. 226 não é mera irregularidade, mas vício que compromete a própria confiabilidade do ato." },
      { autor: "Lilian Milnitsky Stein (org.), Falsas memórias", ideia: "A memória é reconstrutiva e sensível a sugestões posteriores ao fato; a exposição a imagens, comentários e reforços altera a lembrança original de forma imperceptível para quem recorda." },
      { autor: "Gary L. Wells e pesquisadores da identificação ocular", ideia: "Distinção entre variáveis do sistema, controláveis pela polícia (alinhamento, instruções, condução cega, registro da confiança), e variáveis de estimativa, ligadas às condições do fato (tempo de exposição, luz, distância, arma, estresse, diferença étnico-racial), que reduzem a exatidão do reconhecimento." }
    ]
  };

  root.REC_REGRAS = { MODALIDADES, FASES, FASE_PROC, Q, ESTIMADORES, avaliar, pistas, JUR };
})(typeof window !== "undefined" ? window : globalThis);
