/* Base jurídica da ferramenta de análise de RIF.
   Fontes: estudo "Análise Judicial de RIFs" fornecido pelo escritório e Nota Técnica CACOP n. 02/2026 (MPPI).
   As sínteses foram redigidas para orientação; confira o inteiro teor das decisões antes de citar. */
window.RIF_JURIDICO = {
  precedentes: [
    { id: "tema990", tribunal: "STF", orgao: "Plenário", proc: "RE 1.055.941/SP (Tema 990 da repercussão geral)", data: "j. 4/12/2019", posicao: "base",
      tese: "É constitucional o compartilhamento dos relatórios de inteligência financeira da UIF e da íntegra do procedimento fiscalizatório da Receita Federal com os órgãos de persecução penal, sem prévia autorização judicial, devendo ser resguardado o sigilo das informações em procedimentos formalmente instaurados e sujeitos a posterior controle jurisdicional. O compartilhamento deve ser feito unicamente por comunicações formais, com garantia de sigilo, certificação do destinatário e instrumentos efetivos de apuração e correção de desvios.",
      uso: "Delimita o compartilhamento legítimo ao fluxo espontâneo, por canal formal, em procedimento formalmente instaurado e sujeito a controle judicial. Qualquer desvio dessas balizas (via informal, ausência de procedimento, falta de registro) afasta a cobertura do Tema 990." },
    { id: "stj-174173", tribunal: "STJ", orgao: "Terceira Seção", proc: "AgRg no RHC 174.173/RJ", rel: "Min. Messod Azulay Neto", data: "maio de 2025", posicao: "favoravel",
      tese: "A solicitação direta de relatórios de inteligência financeira ao COAF pelo Ministério Público ou pela autoridade policial, sem prévia autorização judicial, é inviável. O COAF não dispõe de poder para quebrar sigilo bancário, e o art. 15 da Lei 9.613/1998 trata do fornecimento voluntário de dados pela UIF, não autorizando o fluxo inverso.",
      uso: "Fundamento central para a ilicitude do RIF obtido por encomenda (RIF de intercâmbio) sem decisão judicial, com extensão às provas derivadas." },
    { id: "stf-2t", tribunal: "STF", orgao: "Segunda Turma", proc: "HC 200.569 AgR; RE 1.393.219 AgR", data: "", posicao: "favoravel",
      tese: "A requisição direta de relatórios financeiros e fiscais, sem autorização judicial, caracteriza obtenção de prova ilícita por violação à reserva de jurisdição. A ratio do Tema 990 restringe-se ao compartilhamento espontâneo.",
      uso: "Reforça, no âmbito do STF, a tese de ilicitude do fluxo inverso, em contraponto à orientação da Primeira Turma." },
    { id: "stf-1t", tribunal: "STF", orgao: "Primeira Turma", proc: "Rcl 61.944/PA", rel: "Min. Cristiano Zanin", data: "", posicao: "contraria",
      tese: "A provocação do COAF pela autoridade policial ou pelo Ministério Público não desnatura o compartilhamento, que estaria abrangido pelo Tema 990.",
      uso: "Precedente que a acusação tende a invocar. Deve ser distinguido à luz da Terceira Seção do STJ, da Segunda Turma do STF e, sobretudo, dos requisitos fixados no Tema 1.404." },
    { id: "tema1404", tribunal: "STF", orgao: "Relator, Min. Alexandre de Moraes", proc: "RE 1.537.165/SP (Tema 1.404 da repercussão geral)", data: "repercussão geral reconhecida em junho de 2025; suspensão nacional em 20/8/2025; liminar de 27/3/2026; decisão sobre eficácia temporal de 21/4/2026", posicao: "favoravel",
      tese: "A liminar de 27/3/2026 condicionou o fornecimento de RIFs a pedido a seis requisitos cumulativos: (1) procedimento formalmente instaurado (inquérito policial, PIC ou processo sancionador), com lastro documental; (2) declaração da autoridade de que o alvo figura formalmente como investigado, com cópia do ato de instauração e elementos anteriores ao pedido; (3) pertinência temática estrita e necessidade concreta, vedado o pedido genérico ou exploratório; (4) vedação à fishing expedition, pois o RIF não pode ser a primeira nem a única medida da investigação; (5) extensão das exigências ao Judiciário e às CPIs; (6) vedação de uso em notícia de fato, VPI, VPA, sindicâncias não punitivas e auditorias. O descumprimento conduz à ilicitude da prova e das derivadas. A decisão de 21/4/2026 atribuiu eficácia prospectiva aos parâmetros, sem invalidação automática de atos pretéritos, cuja legalidade se examina caso a caso.",
      uso: "Roteiro objetivo de controle de legalidade do RIF de intercâmbio. Para RIFs anteriores a 27/3/2026, a análise é caso a caso, mas os mesmos vetores (procedimento formal, investigado previamente identificado, pertinência e prova independente) seguem relevantes." },
    { id: "stj-apn1076", tribunal: "STJ", orgao: "Corte Especial", proc: "AgRg na APn 1.076/DF (Informativo 869)", rel: "Min. Nancy Andrighi", data: "j. 3/9/2025", posicao: "neutra",
      tese: "A suspensão nacional determinada no Tema 1.404 não alcança os processos em que a validade dos RIFs já havia sido apreciada e confirmada.",
      uso: "Relevante para verificar se o processo está ou não abrangido pela suspensão e para a estratégia de arguição da nulidade." },
    { id: "sv14", tribunal: "STF", orgao: "Súmula Vinculante 14; Rcl 25.872 AgR-AgR (Primeira Turma)", proc: "Súmula Vinculante 14", data: "", posicao: "favoravel",
      tese: "É direito do defensor o acesso amplo aos elementos de prova já documentados que digam respeito ao exercício do direito de defesa. A contrapartida, reconhecida pela própria NT CACOP 02/2026: aquilo que não for franqueado à defesa não pode ser utilizado como elemento de prova contra o acusado.",
      uso: "Fundamenta o pedido de acesso aos arquivos originais do RIF (com o código de controle), ao número do SEI-C, ao pedido de intercâmbio e ao ato de instauração, sob pena de inutilização do relatório." }
  ],
  normas: [
    { rot: "CF, art. 5º, X, XII, LVI e LXXIX", txt: "Intimidade e vida privada, sigilo de dados, inadmissibilidade das provas ilícitas e proteção de dados pessoais como direito fundamental (EC 115/2022)." },
    { rot: "Lei 9.613/1998, arts. 10 e 11", txt: "Deveres de registro e comunicação das pessoas obrigadas: operações que superam limites regulamentares (comunicação automática) e operações com sérios indícios de crime (comunicação de operação suspeita)." },
    { rot: "Lei 9.613/1998, art. 15", txt: "Comunicação pelo COAF às autoridades competentes quando concluir pela existência de fundados indícios. Segundo a Terceira Seção do STJ, trata do fornecimento voluntário de dados pela UIF, e não autoriza o fluxo inverso livre." },
    { rot: "Lei 9.613/1998, art. 17-B", txt: "Acesso direto a dados cadastrais (qualificação pessoal, filiação, endereço), que não se confundem com dados financeiros de movimentação." },
    { rot: "Lei 9.613/1998, art. 17-F (Lei 14.652/2023)", txt: "Tratamento de dados pelo COAF limitado ao estritamente necessário às suas finalidades legais (princípio da necessidade)." },
    { rot: "LC 105/2001", txt: "Sigilo das operações financeiras; a quebra para fins de investigação criminal exige ordem judicial fundamentada." },
    { rot: "LGPD (Lei 13.709/2018), art. 4º, III, e § 1º; art. 6º", txt: "O tratamento para fins de persecução penal deve observar proporcionalidade e necessidade; os princípios do art. 6º operam como parâmetro de conformidade." },
    { rot: "Circular BCB 3.978/2020 e Carta-Circular BCB 4.001/2020", txt: "Disciplinam os procedimentos de comunicação ao COAF e listam situações que podem configurar indícios. A lista descreve hipóteses de atipicidade a serem avaliadas pelo banco, e não condutas criminosas." },
    { rot: "Comunicado SEI-C 02/2026 (COAF)", txt: "Operacionalizou a liminar do Tema 1.404: exige comprovação documental do procedimento instaurado, declaração de que as pessoas figuram como investigadas, nexo entre indícios e CPFs/CNPJs e demonstração da pertinência e da necessidade." },
    { rot: "CPP, arts. 157 e 158-A a 158-F (por analogia)", txt: "Ilicitude e derivação; rastreabilidade do dado financeiro, que a própria NT CACOP 02/2026 equipara à cadeia de custódia da prova digital." }
  ],
  reconhecimentos: [
    "O RIF é peça de natureza indiciária, apta a orientar investigações, mas não se confunde com extrato bancário, perícia contábil, prova bancária primária ou quebra judicial de sigilo. O COAF não atesta a veracidade material de cada operação comunicada.",
    "O RIF funciona como vetor de investigação, mas não dispensa a produção de elementos autônomos de corroboração nem substitui, quando necessária, a obtenção regular de prova bancária.",
    "O relatório de análise produzido pela polícia (LAB-LD) ou pelo Ministério Público é interpretativo, não se confunde com o RIF e não deve ser apresentado como fonte primária; suas conclusões devem indicar as bases utilizadas.",
    "O RIF deve ser preservado em sua forma original; alteração ou fracionamento sem registro compromete a auditabilidade. Devem ser certificados nos autos a origem, o número do SEI-C, a data, a autoridade solicitante e a forma de recebimento.",
    "Teste da cronologia: a pessoa deve figurar formalmente como investigada no momento do pedido; inclusão posterior revela pedido exploratório e não admite convalidação retroativa.",
    "Para RIFs antigos, recomenda-se a “auditoria de proveniência”: modalidade, data e via de obtenção, procedimento então existente, delimitação do objeto, cadeia de acesso e existência de prova independente.",
    "Medidas constritivas fundadas exclusivamente no RIF são frágeis, exigindo corroboração documental."
  ],
  doutrina: [
    { autor: "Aury Lopes Jr. e Alexandre Morais da Rosa", ideia: "A fishing expedition caracteriza-se pela adoção de medidas invasivas não para corroborar suspeita fundada, mas como devassa exploratória para encontrar fortuitamente indícios de algum crime. O uso do RIF como ponto de partida, elegendo-se o alvo antes do fato, converte instrumento de inteligência em verdadeiro mandado financeiro em branco." }
  ],
  legislativo: [
    "ADI 7.624 (CFOAB, Rel. Min. Dias Toffoli): interpretação conforme do art. 15 da Lei 9.613/1998, para afastar a requisição direta de dados sem ordem judicial.",
    "PL 4.276/2025: insere capítulo sobre o RIF na Lei 9.613/1998, com intercâmbio exclusivamente por sistema eletrônico rastreável e vedação de o COAF requisitar novas informações às pessoas obrigadas a pedido de autoridades.",
    "PL 1.538/2026 (apensado): restringe o acesso às informações do COAF a órgãos jurisdicionais, mediante decisão fundamentada."
  ]
};
