/* Base doutrinária do HUB.
   As sínteses abaixo foram redigidas para orientação e não substituem a leitura das obras.
   Antes de citar em peça, confira edição, página e literalidade.
   Para acrescentar artigos ou obras, inclua novos objetos no array (ver hub/README.md). */
window.HUB_DOUTRINA = [
  {
    id: "prado",
    autor: "Geraldo Prado",
    obra: "A cadeia de custódia da prova no processo penal",
    ref: "PRADO, Geraldo. A cadeia de custódia da prova no processo penal. São Paulo: Marcial Pons, 2019. Ver também: PRADO, Geraldo. Prova penal e sistema de controles epistêmicos: a quebra da cadeia de custódia das provas obtidas por métodos ocultos. São Paulo: Marcial Pons, 2014.",
    ideias: [
      "A cadeia de custódia é instrumento de controle epistêmico da prova: sem a documentação contínua do percurso do vestígio, o juiz não dispõe de meios racionais para aferir se o elemento apresentado em juízo é o mesmo que foi recolhido (princípio da mesmidade).",
      "A desconfiabilidade da prova decorre da impossibilidade de rastrear sua origem e seu manuseio, e não da demonstração concreta de adulteração. Exigir da defesa a prova da manipulação inverte o ônus e transforma em presunção aquilo que o Estado deveria demonstrar.",
      "A quebra da cadeia de custódia repercute no plano da admissibilidade, e não apenas no da valoração, porque o elemento cuja integridade não pode ser verificada não reúne as condições mínimas para ingressar no acervo probatório.",
      "A preservação da cadeia assegura a paridade de armas, permitindo à defesa acesso às mesmas fontes de prova manejadas pela acusação, especialmente nas provas obtidas por métodos ocultos de investigação."
    ],
    tags: ["mesmidade", "onus", "admissibilidade", "digital"]
  },
  {
    id: "badaro",
    autor: "Gustavo Henrique Badaró",
    obra: "A cadeia de custódia e sua relevância para a prova penal; Epistemologia judiciária e prova penal",
    ref: "BADARÓ, Gustavo Henrique. A cadeia de custódia e sua relevância para a prova penal. In: SIDI, Ricardo; LOPES, Anderson Bezerra (org.). Temas atuais da investigação preliminar no processo penal. Belo Horizonte: D'Plácido, 2017. BADARÓ, Gustavo Henrique. Epistemologia judiciária e prova penal. São Paulo: Revista dos Tribunais, 2019.",
    ideias: [
      "A cadeia de custódia se destina a garantir a autenticidade (o elemento é aquilo que se afirma ser) e a integridade (o elemento não sofreu alterações) da fonte de prova, condições para que o resultado pericial seja epistemicamente confiável.",
      "A documentação de cada elo da cadeia é o meio de demonstrar autenticidade e integridade; quem introduz a prova no processo tem o ônus de comprovar que sua fonte foi preservada.",
      "A prova digital, por sua volatilidade e facilidade de alteração sem vestígios aparentes, exige padrões metodológicos próprios, como a cópia forense, o cálculo de funções hash e o registro de cada operação técnica.",
      "A gravidade da falha deve ser examinada no caso concreto, distinguindo-se a irregularidade que compromete a própria confiabilidade da fonte daquela meramente formal, sem reflexo na integridade."
    ],
    tags: ["autenticidade", "integridade", "onus", "digital"]
  },
  {
    id: "aury",
    autor: "Aury Lopes Jr.",
    obra: "Direito Processual Penal; A importância da cadeia de custódia para preservar a prova penal (com Alexandre Morais da Rosa)",
    ref: "LOPES JR., Aury. Direito processual penal. São Paulo: SaraivaJur, edição atualizada. LOPES JR., Aury; ROSA, Alexandre Morais da. A importância da cadeia de custódia para preservar a prova penal. Consultor Jurídico, 16 jan. 2015.",
    ideias: [
      "A cadeia de custódia integra o devido processo legal probatório: a prova cuja história não pode ser reconstruída carece de fiabilidade e não pode ser legitimamente valorada.",
      "A quebra da cadeia de custódia conduz à ilicitude ou ilegitimidade da prova, com a consequente inadmissibilidade e desentranhamento, estendendo-se às provas dela derivadas nos termos do art. 157, § 1º, do CPP.",
      "A defesa tem direito de acesso ao material bruto e integral, e não apenas a recortes produzidos unilateralmente pelos órgãos de persecução."
    ],
    tags: ["admissibilidade", "derivadas", "acesso"]
  },
  {
    id: "brasileiro",
    autor: "Renato Brasileiro de Lima",
    obra: "Manual de Processo Penal",
    ref: "LIMA, Renato Brasileiro de. Manual de processo penal. Salvador: JusPodivm, edição atualizada.",
    ideias: [
      "As etapas do art. 158-B do CPP podem ser compreendidas em duas fases: a externa, que vai do reconhecimento ao transporte do vestígio, e a interna, que compreende o recebimento, o processamento, o armazenamento e o descarte no âmbito do órgão pericial.",
      "O agente que reconhece o vestígio torna-se responsável por sua preservação (art. 158-A, § 2º), o que torna relevante identificar, em cada etapa, quem detinha a posse e a responsabilidade pela guarda.",
      "Na análise das consequências da quebra, a doutrina e a jurisprudência oscilam entre a inadmissibilidade e a valoração do elemento, cabendo ao intérprete examinar a extensão do comprometimento no caso concreto."
    ],
    tags: ["etapas", "consequencias"]
  },
  {
    id: "iso",
    autor: "ABNT NBR ISO/IEC 27037:2013",
    obra: "Diretrizes para identificação, coleta, aquisição e preservação de evidência digital",
    ref: "ASSOCIAÇÃO BRASILEIRA DE NORMAS TÉCNICAS. ABNT NBR ISO/IEC 27037: Tecnologia da informação. Técnicas de segurança. Diretrizes para identificação, coleta, aquisição e preservação de evidência digital. Rio de Janeiro: ABNT, 2013.",
    ideias: [
      "Auditabilidade: todas as ações devem ser documentadas de modo que terceiro avaliador possa verificar se os métodos foram corretamente aplicados.",
      "Repetibilidade e reprodutibilidade: os mesmos resultados devem ser obtidos com os mesmos procedimentos, ferramentas e condições, inclusive por outro examinador.",
      "Justificabilidade: cada decisão técnica deve ser justificada como a melhor escolha disponível para preservar a evidência.",
      "Preservação do original e aquisição por cópia verificável, com cálculo e registro de valores hash, e documentação de quaisquer alterações inevitáveis."
    ],
    tags: ["digital", "hash", "metodologia"]
  }
];
