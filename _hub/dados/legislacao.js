/* Base normativa do HUB.
   Cada item: { id, diploma, artigo, rotulo, texto, nota?, tags[] }.
   "texto" reproduz a redação legal; quando o campo "sintese" for true, o texto é resumo
   elaborado pela plataforma e deve ser conferido na fonte oficial (planalto.gov.br) antes de citar.
   Para acrescentar dispositivos, inclua novos objetos no array (ver hub/README.md). */
window.HUB_LEGISLACAO = [
  {
    id: "cpp-158", diploma: "CPP", artigo: "Art. 158", rotulo: "Exame de corpo de delito",
    texto: "Quando a infração deixar vestígios, será indispensável o exame de corpo de delito, direto ou indireto, não podendo supri-lo a confissão do acusado.\nParágrafo único. Dar-se-á prioridade à realização do exame de corpo de delito quando se tratar de crime que envolva: I - violência doméstica e familiar contra mulher; II - violência contra criança, adolescente, idoso ou pessoa com deficiência.",
    nota: "O STJ assentou que a exigência de preservação da cadeia de custódia é logicamente indissociável do conceito de corpo de delito, razão pela qual também se aplica a fatos anteriores à Lei 13.964/2019 (AgRg no RHC 143.169/RJ).",
    tags: ["geral"]
  },
  {
    id: "cpp-158a", diploma: "CPP", artigo: "Art. 158-A", rotulo: "Conceito de cadeia de custódia",
    texto: "Considera-se cadeia de custódia o conjunto de todos os procedimentos utilizados para manter e documentar a história cronológica do vestígio coletado em locais ou em vítimas de crimes, para rastrear sua posse e manuseio a partir de seu reconhecimento até o descarte.\n§ 1º O início da cadeia de custódia dá-se com a preservação do local de crime ou com procedimentos policiais ou periciais nos quais seja detectada a existência de vestígio.\n§ 2º O agente público que reconhecer um elemento como de potencial interesse para a produção da prova pericial fica responsável por sua preservação.\n§ 3º Vestígio é todo objeto ou material bruto, visível ou latente, constatado ou recolhido, que se relaciona à infração penal.",
    tags: ["geral"]
  },
  {
    id: "cpp-158b", diploma: "CPP", artigo: "Art. 158-B", rotulo: "Etapas do rastreamento do vestígio",
    texto: "A cadeia de custódia compreende o rastreamento do vestígio nas seguintes etapas:\nI - reconhecimento: ato de distinguir um elemento como de potencial interesse para a produção da prova pericial;\nII - isolamento: ato de evitar que se altere o estado das coisas, devendo isolar e preservar o ambiente imediato, mediato e relacionado aos vestígios e local de crime;\nIII - fixação: descrição detalhada do vestígio conforme se encontra no local de crime ou no corpo de delito, e a sua posição na área de exames, podendo ser ilustrada por fotografias, filmagens ou croqui, sendo indispensável a sua descrição no laudo pericial produzido pelo perito responsável pelo atendimento;\nIV - coleta: ato de recolher o vestígio que será submetido à análise pericial, respeitando suas características e natureza;\nV - acondicionamento: procedimento por meio do qual cada vestígio coletado é embalado de forma individualizada, de acordo com suas características físicas, químicas e biológicas, para posterior análise, com anotação da data, hora e nome de quem realizou a coleta e o acondicionamento;\nVI - transporte: ato de transferir o vestígio de um local para o outro, utilizando as condições adequadas (embalagens, veículos, temperatura, entre outras), de modo a garantir a manutenção de suas características originais, bem como o controle de sua posse;\nVII - recebimento: ato formal de transferência da posse do vestígio, que deve ser documentado com, no mínimo, informações referentes ao número de procedimento e unidade de polícia judiciária relacionada, local de origem, nome de quem transportou o vestígio, código de rastreamento, natureza do exame, tipo do vestígio, protocolo, assinatura e identificação de quem o recebeu;\nVIII - processamento: exame pericial em si, manipulação do vestígio de acordo com a metodologia adequada às suas características biológicas, físicas e químicas, a fim de se obter o resultado desejado, que deverá ser formalizado em laudo produzido por perito;\nIX - armazenamento: procedimento referente à guarda, em condições adequadas, do material a ser processado, guardado para realização de contraperícia, descartado ou transportado, com vinculação ao número do laudo correspondente;\nX - descarte: procedimento referente à liberação do vestígio, respeitando a legislação vigente e, quando pertinente, mediante autorização judicial.",
    nota: "A doutrina costuma agrupar as etapas I a VI na fase externa (do local à chegada ao órgão pericial) e as etapas VII a X na fase interna (do recebimento ao descarte).",
    tags: ["geral"]
  },
  {
    id: "cpp-158c", diploma: "CPP", artigo: "Art. 158-C", rotulo: "Coleta por perito oficial",
    texto: "A coleta dos vestígios deverá ser realizada preferencialmente por perito oficial, que dará o encaminhamento necessário para a central de custódia, mesmo quando for necessária a realização de exames complementares.\n§ 1º Todos vestígios coletados no decurso do inquérito ou processo devem ser tratados como descrito nesta Lei, ficando órgão central de perícia oficial de natureza criminal responsável por detalhar a forma do seu cumprimento.\n§ 2º É proibida a entrada em locais isolados bem como a remoção de quaisquer vestígios de locais de crime antes da liberação por parte do perito responsável, sendo tipificada como fraude processual a sua realização.",
    tags: ["geral"]
  },
  {
    id: "cpp-158d", diploma: "CPP", artigo: "Art. 158-D", rotulo: "Recipientes, lacres e ficha de acompanhamento",
    texto: "O recipiente para acondicionamento do vestígio será determinado pela natureza do material.\n§ 1º Todos os recipientes deverão ser selados com lacres, com numeração individualizada, de forma a garantir a inviolabilidade e a idoneidade do vestígio durante o transporte.\n§ 2º O recipiente deverá individualizar o vestígio, preservar suas características, impedir contaminação e vazamento, ter resistência adequada e espaço para registro de informações sobre seu conteúdo.\n§ 3º O recipiente só poderá ser aberto pelo perito que vai proceder à análise e, motivadamente, por pessoa autorizada.\n§ 4º Após cada rompimento de lacre, deve se fazer constar na ficha de acompanhamento de vestígio o nome e a matrícula do responsável, a data, o local, a finalidade, bem como as informações referentes ao novo lacre utilizado.\n§ 5º O lacre rompido deverá ser acondicionado no interior do novo recipiente.",
    tags: ["geral"]
  },
  {
    id: "cpp-158e", diploma: "CPP", artigo: "Art. 158-E", rotulo: "Central de custódia",
    texto: "Todos os Institutos de Criminalística deverão ter uma central de custódia destinada à guarda e controle dos vestígios, e sua gestão deve ser vinculada diretamente ao órgão central de perícia oficial de natureza criminal.\n§ 1º Toda central de custódia deve possuir os serviços de protocolo, com local para conferência, recepção, devolução de materiais e documentos, possibilitando a seleção, a classificação e a distribuição de materiais, devendo ser um espaço seguro e apresentar condições ambientais que não interfiram nas características do vestígio.\n§ 2º Na central de custódia, a entrada e a saída de vestígio deverão ser protocoladas, consignando-se informações sobre a ocorrência no inquérito que a eles se relacionam.\n§ 3º Todas as pessoas que tiverem acesso ao vestígio armazenado deverão ser identificadas e deverão ser registrados a data e a hora do acesso.\n§ 4º Por ocasião da tramitação do vestígio armazenado, todas as ações deverão ser registradas, consignando-se a identificação do responsável pela tramitação, a destinação, a data e horário da ação.",
    tags: ["geral"]
  },
  {
    id: "cpp-158f", diploma: "CPP", artigo: "Art. 158-F", rotulo: "Retorno à central após a perícia",
    texto: "Após a realização da perícia, o material deverá ser devolvido à central de custódia, devendo nela permanecer.\nParágrafo único. Caso a central de custódia não possua espaço ou condições de armazenar determinado material, deverá a autoridade policial ou judiciária determinar as condições de depósito do referido material em local diverso, mediante requerimento do diretor do órgão central de perícia oficial de natureza criminal.",
    tags: ["geral"]
  },
  {
    id: "cpp-6", diploma: "CPP", artigo: "Art. 6º, I a III", rotulo: "Deveres da autoridade policial no local",
    texto: "Logo que tiver conhecimento da prática da infração penal, a autoridade policial deverá:\nI - dirigir-se ao local, providenciando para que não se alterem o estado e conservação das coisas, até a chegada dos peritos criminais;\nII - apreender os objetos que tiverem relação com o fato, após liberados pelos peritos criminais;\nIII - colher todas as provas que servirem para o esclarecimento do fato e suas circunstâncias;",
    tags: ["geral", "local"]
  },
  {
    id: "cpp-157", diploma: "CPP", artigo: "Art. 157", rotulo: "Provas ilícitas e derivadas",
    texto: "São inadmissíveis, devendo ser desentranhadas do processo, as provas ilícitas, assim entendidas as obtidas em violação a normas constitucionais ou legais.\n§ 1º São também inadmissíveis as provas derivadas das ilícitas, salvo quando não evidenciado o nexo de causalidade entre umas e outras, ou quando as derivadas puderem ser obtidas por uma fonte independente das primeiras.\n§ 2º Considera-se fonte independente aquela que por si só, seguindo os trâmites típicos e de praxe, próprios da investigação ou instrução criminal, seria capaz de conduzir ao fato objeto da prova.\n§ 3º Preclusa a decisão de desentranhamento da prova declarada inadmissível, esta será inutilizada por decisão judicial, facultado às partes acompanhar o incidente.\n§ 5º O juiz que conhecer do conteúdo da prova declarada inadmissível não poderá proferir a sentença ou acórdão.",
    nota: "O § 5º, incluído pela Lei 13.964/2019, foi declarado inconstitucional pelo STF no julgamento das ADIs 6.298, 6.299, 6.300 e 6.305. Confira a situação atual antes de invocá-lo.",
    tags: ["geral"]
  },
  {
    id: "cpp-159", diploma: "CPP", artigo: "Art. 159", rotulo: "Perito oficial, assistente técnico e acesso ao material",
    texto: "O exame de corpo de delito e outras perícias serão realizados por perito oficial, portador de diploma de curso superior.\n§ 1º Na falta de perito oficial, o exame será realizado por 2 (duas) pessoas idôneas, portadoras de diploma de curso superior preferencialmente na área específica, dentre as que tiverem habilitação técnica relacionada com a natureza do exame.\n§ 2º Os peritos não oficiais prestarão o compromisso de bem e fielmente desempenhar o encargo.\n§ 3º Serão facultadas ao Ministério Público, ao assistente de acusação, ao ofendido, ao querelante e ao acusado a formulação de quesitos e indicação de assistente técnico.\n§ 4º O assistente técnico atuará a partir de sua admissão pelo juiz e após a conclusão dos exames e elaboração do laudo pelos peritos oficiais, sendo as partes intimadas desta decisão.\n§ 5º Durante o curso do processo judicial, é permitido às partes, quanto à perícia: I - requerer a oitiva dos peritos para esclarecerem a prova ou para responderem a quesitos, desde que o mandado de intimação e os quesitos ou questões a serem esclarecidas sejam encaminhados com antecedência mínima de 10 (dez) dias, podendo apresentar as respostas em laudo complementar; II - indicar assistentes técnicos que poderão apresentar pareceres em prazo a ser fixado pelo juiz ou ser inquiridos em audiência.\n§ 6º Havendo requerimento das partes, o material probatório que serviu de base à perícia será disponibilizado no ambiente do órgão oficial, que manterá sempre sua guarda, e na presença de perito oficial, para exame pelos assistentes, salvo se for impossível a sua conservação.\n§ 7º Tratando-se de perícia complexa que abranja mais de uma área de conhecimento especializado, poder-se-á designar a atuação de mais de um perito oficial, e a parte indicar mais de um assistente técnico.",
    tags: ["geral"]
  },
  {
    id: "cpp-169-170", diploma: "CPP", artigo: "Arts. 169 e 170", rotulo: "Exame de local e reserva de material",
    texto: "Art. 169. Para o efeito de exame do local onde houver sido praticada a infração, a autoridade providenciará imediatamente para que não se altere o estado das coisas até a chegada dos peritos, que poderão instruir seus laudos com fotografias, desenhos ou esquemas elucidativos.\nParágrafo único. Os peritos registrarão, no laudo, as alterações do estado das coisas e discutirão, no relatório, as conseqüências dessas alterações na dinâmica dos fatos.\nArt. 170. Nas perícias de laboratório, os peritos guardarão material suficiente para a eventualidade de nova perícia. Sempre que conveniente, os laudos serão ilustrados com provas fotográficas, ou microfotográficas, desenhos ou esquemas.",
    tags: ["local", "drogas", "biologico"]
  },
  {
    id: "cpp-245", diploma: "CPP", artigo: "Art. 245, § 7º", rotulo: "Auto circunstanciado da busca",
    texto: "Finda a diligência, os executores lavrarão auto circunstanciado, assinando-o com duas testemunhas presenciais, sem prejuízo do disposto no § 4º.",
    tags: ["geral"]
  },
  {
    id: "cf-5", diploma: "CF", artigo: "Art. 5º, X, XII, LV, LVI e LXXIX", rotulo: "Garantias constitucionais",
    texto: "X - são invioláveis a intimidade, a vida privada, a honra e a imagem das pessoas, assegurado o direito a indenização pelo dano material ou moral decorrente de sua violação;\nXII - é inviolável o sigilo da correspondência e das comunicações telegráficas, de dados e das comunicações telefônicas, salvo, no último caso, por ordem judicial, nas hipóteses e na forma que a lei estabelecer para fins de investigação criminal ou instrução processual penal;\nLV - aos litigantes, em processo judicial ou administrativo, e aos acusados em geral são assegurados o contraditório e ampla defesa, com os meios e recursos a ela inerentes;\nLVI - são inadmissíveis, no processo, as provas obtidas por meios ilícitos;\nLXXIX - é assegurado, nos termos da lei, o direito à proteção dos dados pessoais, inclusive nos meios digitais.",
    tags: ["geral", "digital"]
  },
  {
    id: "sv-14", diploma: "STF", artigo: "Súmula Vinculante 14", rotulo: "Acesso da defesa aos elementos documentados",
    texto: "É direito do defensor, no interesse do representado, ter acesso amplo aos elementos de prova que, já documentados em procedimento investigatório realizado por órgão com competência de polícia judiciária, digam respeito ao exercício do direito de defesa.",
    tags: ["geral", "digital"]
  },
  {
    id: "mci-7", diploma: "Lei 12.965/2014", artigo: "Art. 7º, II e III", rotulo: "Marco Civil da Internet",
    texto: "O acesso à internet é essencial ao exercício da cidadania, e ao usuário são assegurados os seguintes direitos: [...] II - inviolabilidade e sigilo do fluxo de suas comunicações pela internet, salvo por ordem judicial, na forma da lei; III - inviolabilidade e sigilo de suas comunicações privadas armazenadas, salvo por ordem judicial;",
    tags: ["digital"]
  },
  {
    id: "l11343-50", diploma: "Lei 11.343/2006", artigo: "Arts. 50 e 50-A", rotulo: "Laudo de constatação, laudo definitivo e destruição de drogas",
    sintese: true,
    texto: "Síntese: para a lavratura do auto de prisão em flagrante e o estabelecimento da materialidade, basta o laudo de constatação da natureza e quantidade da droga, firmado por perito oficial ou, na falta deste, por pessoa idônea (§ 1º); o perito que subscrever o laudo de constatação não fica impedido de participar da elaboração do laudo definitivo (§ 2º). O juiz deve certificar a regularidade formal do laudo de constatação e determinar a destruição das drogas apreendidas, guardando-se amostra necessária à preservação da prova (§ 3º), em procedimento acompanhado pelo Ministério Público e pela autoridade sanitária, com auto circunstanciado e vistoria do local (§§ 4º e 5º). O art. 50-A disciplina a destruição das drogas apreendidas sem prisão em flagrante, igualmente com guarda de amostra.",
    nota: "Texto em síntese. Confira a redação vigente antes de citar.",
    tags: ["drogas"]
  },
  {
    id: "l9296", diploma: "Lei 9.296/1996", artigo: "Arts. 6º, 8º e 9º", rotulo: "Interceptação telefônica",
    sintese: true,
    texto: "Síntese: deferida a interceptação, a autoridade policial conduzirá os procedimentos, dando ciência ao Ministério Público; havendo gravação, será determinada a sua transcrição, e, cumprida a diligência, o resultado será encaminhado ao juiz acompanhado de auto circunstanciado com o resumo das operações realizadas (art. 6º). A interceptação ocorrerá em autos apartados, preservando-se o sigilo das diligências, gravações e transcrições (art. 8º). A gravação que não interessar à prova será inutilizada por decisão judicial, facultado o acompanhamento pelo acusado ou por seu representante legal (art. 9º).",
    nota: "Texto em síntese. Confira a redação vigente antes de citar.",
    tags: ["digital", "interceptacao"]
  },
  {
    id: "senasp-82", diploma: "Portaria SENASP/MJ nº 82/2014", artigo: "Diretrizes", rotulo: "Diretrizes sobre cadeia de custódia (antecedente normativo)",
    sintese: true,
    texto: "Síntese: estabeleceu diretrizes nacionais sobre os procedimentos de cadeia de custódia de vestígios, com a sistematização das etapas de reconhecimento, isolamento, fixação, coleta, acondicionamento, transporte, recebimento, processamento, armazenamento e descarte, posteriormente incorporadas ao CPP pela Lei 13.964/2019.",
    tags: ["geral"]
  },
  {
    id: "iso-27037", diploma: "ABNT NBR ISO/IEC 27037:2013", artigo: "Norma técnica", rotulo: "Identificação, coleta, aquisição e preservação de evidência digital",
    sintese: true,
    texto: "Síntese: orienta o tratamento da evidência digital segundo os princípios da auditabilidade, repetibilidade, reprodutibilidade e justificabilidade, com preservação do original, aquisição por cópia forense verificável (inclusive por funções hash), documentação de cada intervenção e registro das alterações inevitáveis. O STJ invocou expressamente esses parâmetros ao reconhecer a quebra da cadeia de custódia da prova digital (AgRg no HC 828.054/RN).",
    tags: ["digital"]
  }
];
