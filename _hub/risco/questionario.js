/* Risco penal empresarial: questionário estruturado em quatro áreas (lavagem de dinheiro, crimes tributários,
   anticorrupção e ambiental), pontuação por área e redação do parecer no padrão TPC.
   Cada pergunta é um fator de risco ("fator": a resposta Sim aumenta o risco) ou um controle ("controle": a resposta
   Não aumenta o risco). Parcial vale metade. "Não se aplica" sai do cálculo. */
(function (root) {
  "use strict";

  const AREAS = [
    {
      id: "lavagem", titulo: "Lavagem de dinheiro", base: "Lei nº 9.613/1998",
      intro: "A Lei nº 9.613/1998 tipifica a ocultação ou dissimulação da natureza, origem, localização, disposição, movimentação ou propriedade de bens, direitos ou valores provenientes, direta ou indiretamente, de infração penal (art. 1º), e impõe às pessoas sujeitas ao mecanismo de controle do art. 9º deveres de identificação de clientes, manutenção de registros e comunicação de operações ao COAF (arts. 10 e 11). Desde a Lei nº 12.683/2012, qualquer infração penal pode ser antecedente, o que amplia significativamente o espectro de exposição.",
      perguntas: [
        { id: "obrigada", tipo: "fator", peso: 3, q: "A empresa integra setor obrigado ao art. 9º da Lei 9.613/1998 (instituição financeira, factoring, imobiliária, comércio de bens de luxo ou alto valor, joias, obras de arte, consultoria ou assessoria financeira, entre outros)?", risco: "o enquadramento da empresa entre as pessoas obrigadas pelo art. 9º da Lei nº 9.613/1998, o que atrai os deveres de identificação, registro e comunicação dos arts. 10 e 11", rec: "estruturar política de prevenção à lavagem de dinheiro compatível com a regulamentação do órgão supervisor do setor, com cadastro atualizado no COAF, rotina de comunicação de operações e designação formal de responsável" },
        { id: "especie", tipo: "fator", peso: 3, q: "A empresa recebe ou movimenta valores relevantes em espécie?", risco: "a movimentação relevante de numerário em espécie, tradicional vetor de colocação de recursos ilícitos no sistema econômico", rec: "limitar o recebimento em espécie, exigir identificação do pagador acima de patamares internos e registrar a origem declarada dos recursos" },
        { id: "terceiros", tipo: "fator", peso: 2, q: "Há pagamentos ou recebimentos por conta e ordem de terceiros, ou em contas que não pertencem às partes do negócio?", risco: "a realização de pagamentos e recebimentos por conta e ordem de terceiros, que rompe a correspondência entre a relação negocial e o fluxo financeiro", rec: "vedar pagamentos e recebimentos por terceiros sem justificativa documentada e aprovada pela área de compliance" },
        { id: "exterior", tipo: "fator", peso: 2, q: "A empresa realiza operações com o exterior, com jurisdições de tributação favorecida ou com estruturas societárias complexas?", risco: "a existência de operações com o exterior ou com estruturas societárias de difícil rastreamento, que dificultam a identificação do beneficiário final", rec: "identificar o beneficiário final de contrapartes estrangeiras e documentar o propósito econômico de cada estrutura" },
        { id: "cripto", tipo: "fator", peso: 2, q: "A empresa opera com ativos virtuais (criptoativos)?", risco: "a operação com ativos virtuais, que a Lei nº 14.478/2022 passou a considerar como causa de aumento de pena no crime de lavagem", rec: "operar apenas com prestadoras de serviços de ativos virtuais autorizadas e manter a rastreabilidade das carteiras utilizadas" },
        { id: "pep", tipo: "fator", peso: 2, q: "A empresa mantém relações relevantes com pessoas expostas politicamente ou seus familiares e sócios?", risco: "o relacionamento com pessoas expostas politicamente, que exige diligência reforçada", rec: "adotar diligência reforçada para pessoas expostas politicamente, com aprovação de alçada superior para o início do relacionamento" },
        { id: "kyc", ok: "procedimento formal de conhecimento de clientes, fornecedores e parceiros", tipo: "controle", peso: 3, q: "Há procedimento formal de identificação e conhecimento de clientes, fornecedores e parceiros (KYC)?", risco: "a ausência de procedimento formal de conhecimento de clientes, fornecedores e parceiros", rec: "instituir procedimento de conhecimento de clientes, fornecedores e parceiros, com verificação documental, consulta a listas restritivas e classificação por risco" },
        { id: "monitor", ok: "monitoramento de operações atípicas com registro das análises", tipo: "controle", peso: 2, q: "Há monitoramento de operações atípicas e registro das análises realizadas?", risco: "a inexistência de monitoramento de operações atípicas e de registro das análises", rec: "implementar monitoramento de operações atípicas com critérios objetivos e registro escrito das análises e das decisões de comunicar ou não comunicar" },
        { id: "treinoPld", ok: "treinamento periódico das áreas comercial e financeira", tipo: "controle", peso: 1, q: "Os empregados das áreas comercial e financeira recebem treinamento periódico sobre prevenção à lavagem?", risco: "a falta de treinamento periódico das áreas expostas", rec: "realizar treinamento anual das áreas comercial e financeira, com registro de presença e avaliação" }
      ]
    },
    {
      id: "tributario", titulo: "Crimes contra a ordem tributária", base: "Lei nº 8.137/1990 e arts. 168-A e 337-A do Código Penal",
      intro: "Os crimes contra a ordem tributária concentram-se nos arts. 1º e 2º da Lei nº 8.137/1990 e, quanto às contribuições previdenciárias, nos arts. 168-A e 337-A do Código Penal. Os crimes materiais do art. 1º somente se tipificam após o lançamento definitivo do tributo (Súmula Vinculante 24), e o Supremo Tribunal Federal, no RHC 163.334, assentou que o não recolhimento contumaz e com dolo de apropriação do ICMS declarado configura o crime do art. 2º, II, da Lei nº 8.137/1990. O pagamento integral do débito extingue a punibilidade, o que confere à gestão tributária papel central na contenção do risco penal.",
      perguntas: [
        { id: "icms", tipo: "fator", peso: 3, q: "A empresa declara e deixa de recolher tributos de forma reiterada, em especial ICMS, IPI ou contribuições retidas de empregados?", risco: "a inadimplência reiterada de tributos declarados, em especial de ICMS e de contribuições descontadas dos empregados, que pode configurar os crimes do art. 2º, II, da Lei nº 8.137/1990 e do art. 168-A do Código Penal", rec: "priorizar o recolhimento dos tributos indiretos e das contribuições retidas, ou o seu parcelamento formal, documentando as razões financeiras de eventual inadimplência para afastar o dolo de apropriação" },
        { id: "autos", tipo: "fator", peso: 3, q: "Há autos de infração relevantes, especialmente com multa qualificada por fraude, sonegação ou conluio?", risco: "a existência de autos de infração com multa qualificada, que costumam ser acompanhados de representação fiscal para fins penais", rec: "acompanhar os processos administrativos fiscais com atuação coordenada entre as defesas tributária e penal, atenta ao momento do lançamento definitivo e às hipóteses de suspensão e extinção da punibilidade" },
        { id: "planejamento", tipo: "fator", peso: 2, q: "A empresa adota planejamento tributário agressivo, com operações sem propósito negocial evidente ou interposição de pessoas?", risco: "a adoção de planejamento tributário sem propósito negocial documentado, suscetível de ser qualificado como simulação", rec: "submeter as estruturas de planejamento a parecer prévio que documente o propósito negocial e a substância econômica das operações" },
        { id: "notas", tipo: "fator", peso: 3, q: "Há aquisição de créditos ou notas fiscais de fornecedores de idoneidade duvidosa, ou vendas sem emissão de nota?", risco: "a utilização de documentos fiscais de fornecedores inidôneos ou a realização de vendas sem nota, condutas típicas do art. 1º da Lei nº 8.137/1990", rec: "verificar a regularidade cadastral e operacional dos fornecedores antes da contratação e conciliar periodicamente estoques, vendas e documentos fiscais" },
        { id: "contabil", ok: "contabilidade regular, submetida a revisão independente", tipo: "controle", peso: 2, q: "A contabilidade é regular, auditada ou revisada por profissional independente?", risco: "a ausência de revisão independente da contabilidade", rec: "contratar revisão ou auditoria independente das demonstrações contábeis e da apuração dos tributos" },
        { id: "delegacao", ok: "definição formal das atribuições e alçadas da área fiscal", tipo: "controle", peso: 2, q: "Há definição formal das atribuições e alçadas na área fiscal, de modo a delimitar quem decide sobre recolhimentos?", risco: "a falta de delimitação formal das atribuições na área fiscal, o que favorece a imputação indistinta a todos os sócios e administradores", rec: "formalizar as atribuições e alçadas da área fiscal em atas e procurações, delimitando a responsabilidade pelas decisões de recolhimento" },
        { id: "parcel", ok: "débitos tributários conhecidos parcelados ou com exigibilidade suspensa", tipo: "controle", peso: 1, q: "Os débitos tributários conhecidos estão parcelados ou com exigibilidade suspensa?", risco: "a existência de débitos conhecidos sem parcelamento ou suspensão da exigibilidade", rec: "avaliar a adesão a parcelamentos ou transações tributárias, que suspendem a pretensão punitiva durante sua vigência quando formalizados antes do recebimento da denúncia (art. 83, § 2º, da Lei nº 9.430/1996)" }
      ]
    },
    {
      id: "anticorrupcao", titulo: "Anticorrupção e licitações", base: "Lei nº 12.846/2013, Decreto nº 11.129/2022 e Código Penal",
      intro: "A Lei nº 12.846/2013 prevê a responsabilização objetiva, nas esferas administrativa e civil, das pessoas jurídicas pelos atos lesivos à administração pública, nacional ou estrangeira, praticados em seu interesse ou benefício (arts. 1º, 2º e 5º), sem prejuízo da responsabilidade penal individual dos dirigentes e colaboradores pelos crimes de corrupção ativa (art. 333 do Código Penal), tráfico de influência (art. 332) e pelos crimes em licitações e contratos (arts. 337-E a 337-P do Código Penal, incluídos pela Lei nº 14.133/2021). A existência de programa de integridade efetivo é considerada na aplicação das sanções (art. 7º, VIII), conforme os parâmetros do Decreto nº 11.129/2022.",
      perguntas: [
        { id: "contratos", tipo: "fator", peso: 3, q: "A empresa participa de licitações ou mantém contratos com a administração pública?", risco: "a participação em licitações e a execução de contratos públicos, ambiente de maior incidência dos crimes dos arts. 337-E a 337-P do Código Penal", rec: "instituir procedimento de revisão prévia das propostas e da execução contratual, com segregação de funções e registro das interações com agentes públicos" },
        { id: "licencas", tipo: "fator", peso: 2, q: "A atividade depende de licenças, autorizações ou fiscalização frequente de órgãos públicos?", risco: "a dependência de licenças e fiscalizações, que multiplica os pontos de contato com agentes públicos", rec: "documentar todas as interações relevantes com agentes públicos e conduzi-las, sempre que possível, com ao menos dois representantes da empresa" },
        { id: "intermediarios", tipo: "fator", peso: 3, q: "A empresa utiliza despachantes, consultores ou intermediários junto a órgãos públicos?", risco: "a utilização de intermediários junto a órgãos públicos, principal vetor de pagamentos indevidos indiretos", rec: "submeter intermediários a diligência prévia, contratá-los por escrito com cláusula anticorrupção e exigir comprovação dos serviços prestados" },
        { id: "brindes", tipo: "fator", peso: 1, q: "Há oferta de brindes, hospitalidades, viagens ou patrocínios a agentes públicos?", risco: "a oferta de brindes, hospitalidades e patrocínios a agentes públicos sem regra objetiva", rec: "editar política de brindes, hospitalidades e patrocínios com limites de valor, vedações e registro" },
        { id: "doacoes", tipo: "fator", peso: 1, q: "A empresa realiza doações a entidades ligadas a agentes públicos?", risco: "a realização de doações a entidades ligadas a agentes públicos", rec: "submeter doações a aprovação da alta administração, com verificação prévia de vínculos com agentes públicos" },
        { id: "programa", ok: "programa de integridade estruturado", tipo: "controle", peso: 3, q: "Há programa de integridade com código de conduta, apoio da alta administração e responsável com autonomia?", risco: "a ausência de programa de integridade estruturado, que priva a empresa da atenuação prevista no art. 7º, VIII, da Lei nº 12.846/2013", rec: "estruturar programa de integridade segundo os parâmetros do Decreto nº 11.129/2022, com código de conduta, comprometimento da alta administração, avaliação periódica de riscos e instância responsável dotada de autonomia" },
        { id: "canal", ok: "canal de denúncias e procedimento de apuração interna", tipo: "controle", peso: 2, q: "Há canal de denúncias com garantia de anonimato e procedimento de apuração interna?", risco: "a inexistência de canal de denúncias e de procedimento de investigação interna", rec: "implantar canal de denúncias com anonimato e vedação de retaliação, e regulamentar a investigação interna com preservação da cadeia de custódia das evidências" },
        { id: "dueDil", ok: "diligência prévia em operações societárias e na contratação de parceiros", tipo: "controle", peso: 2, q: "Há diligência prévia em fusões, aquisições e na contratação de parceiros relevantes?", risco: "a falta de diligência prévia em operações societárias e na contratação de parceiros, que expõe a empresa à sucessão de responsabilidades (art. 4º da Lei nº 12.846/2013)", rec: "realizar diligência prévia de integridade em operações societárias e parcerias, com cláusulas contratuais de declaração e indenização" }
      ]
    },
    {
      id: "ambiental", titulo: "Crimes ambientais", base: "Lei nº 9.605/1998 e art. 225, § 3º, da Constituição",
      intro: "A Constituição admite a responsabilidade penal da pessoa jurídica por condutas lesivas ao meio ambiente (art. 225, § 3º), disciplinada pela Lei nº 9.605/1998, que a condiciona à prática da infração por decisão de seu representante legal ou contratual, ou de seu órgão colegiado, no interesse ou benefício da entidade (art. 3º). O Supremo Tribunal Federal, no RE 548.181, afastou a exigência de dupla imputação, de modo que a pessoa jurídica pode ser processada ainda que não identificada a pessoa física responsável. Entre os tipos mais frequentes na atividade empresarial estão a poluição (art. 54), o funcionamento sem licença (art. 60), o descumprimento de obrigação de relevante interesse ambiental (art. 68) e a falsidade em procedimento de licenciamento (art. 69-A).",
      perguntas: [
        { id: "poluidora", tipo: "fator", peso: 3, q: "A atividade é potencialmente poluidora ou utilizadora de recursos naturais (indústria, mineração, agronegócio, construção, energia, saneamento, transporte de cargas perigosas)?", risco: "a natureza potencialmente poluidora da atividade, que atrai a incidência dos arts. 54 e 60 da Lei nº 9.605/1998", rec: "mapear os aspectos e impactos ambientais da operação e manter plano de prevenção e resposta a incidentes" },
        { id: "licenca", tipo: "fator", peso: 3, q: "Há unidade operando com licença ambiental vencida, pendente ou em desacordo com as condicionantes?", risco: "a operação com licença vencida, pendente ou em desacordo com as condicionantes, conduta prevista no art. 60 da Lei nº 9.605/1998", rec: "regularizar imediatamente as licenças e manter controle de prazos e de cumprimento das condicionantes, com renovação requerida no prazo legal" },
        { id: "residuos", tipo: "fator", peso: 2, q: "A empresa gera resíduos perigosos, efluentes ou emissões relevantes?", risco: "a geração de resíduos perigosos, efluentes ou emissões relevantes", rec: "contratar transportadores e destinadores licenciados, arquivar os manifestos de transporte e monitorar efluentes e emissões conforme as condicionantes" },
        { id: "historico", tipo: "fator", peso: 2, q: "Há histórico de autuações, embargos ou termos de ajustamento de conduta ambientais?", risco: "o histórico de autuações, embargos ou termos de ajustamento de conduta, que evidencia exposição concreta e pode caracterizar reincidência administrativa", rec: "cumprir integralmente os termos de ajustamento e documentar a reparação dos danos, que influencia a dosimetria e a transação penal (arts. 14, II, e 27 da Lei nº 9.605/1998)" },
        { id: "terceirizada", tipo: "fator", peso: 1, q: "Atividades com impacto ambiental são executadas por terceiros contratados?", risco: "a execução de atividades de impacto ambiental por terceiros, sem afastar a responsabilidade da contratante", rec: "exigir licenças e comprovações ambientais dos contratados e prever auditoria e cláusulas de responsabilidade" },
        { id: "gestao", ok: "responsável técnico e sistema de gestão ambiental auditado", tipo: "controle", peso: 2, q: "Há responsável técnico e sistema de gestão ambiental com auditorias periódicas?", risco: "a ausência de responsável técnico e de sistema de gestão ambiental auditado", rec: "designar responsável técnico e implantar sistema de gestão ambiental com auditorias periódicas e registro das ações corretivas" },
        { id: "estudos", ok: "revisão independente dos estudos apresentados aos órgãos ambientais", tipo: "controle", peso: 1, q: "Os estudos e relatórios apresentados aos órgãos ambientais passam por revisão independente?", risco: "a falta de revisão independente dos estudos e relatórios entregues aos órgãos ambientais, relevante diante do art. 69-A da Lei nº 9.605/1998", rec: "submeter estudos, laudos e relatórios a revisão independente antes do protocolo, preservando as versões e a memória de cálculo" }
      ]
    }
  ];

  const VALOR = { sim: 1, parcial: 0.5, nao: 0 };
  function pontuar(respostas) {
    return AREAS.map(a => {
      let max = 0, pts = 0; const riscos = [], recs = [], fortes = [];
      for (const q of a.perguntas) {
        const r = respostas[a.id + "." + q.id];
        if (!r || r === "na") continue;
        max += q.peso;
        const v = q.tipo === "fator" ? VALOR[r] : 1 - VALOR[r];
        pts += v * q.peso;
        if (v > 0) { riscos.push({ q, r, v }); recs.push(q.rec); }
        else if (q.tipo === "controle") fortes.push(q);
      }
      const pct = max ? Math.round(pts / max * 100) : null;
      const nivel = pct == null ? "não avaliado" : pct >= 65 ? "crítico" : pct >= 45 ? "elevado" : pct >= 25 ? "moderado" : "baixo";
      riscos.sort((x, y) => y.q.peso * y.v - x.q.peso * x.v);
      return { area: a, pct, nivel, riscos, recs, fortes, respondidas: max > 0 };
    });
  }

  /* ------------------------------------------------------------------ parecer */
  const lista = a => (a.length <= 1 ? a.join("") : a.slice(0, -1).join("; ") + "; e " + a[a.length - 1]);
  const listaV = a => (a.length <= 1 ? a.join("") : a.slice(0, -1).join(", ") + " e " + a[a.length - 1]);
  const ROMANOS = ["I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X"];
  const PRIORIDADE = { "crítico": "imediata", "elevado": "de curto prazo", "moderado": "de médio prazo", "baixo": "de manutenção" };

  function parecer(emp, respostas, opc) {
    opc = opc || {};
    const res = pontuar(respostas), aval = res.filter(r => r.respondidas);
    const nome = (emp.nome || "").trim() || "a empresa consulente";
    const b = [{ t: "tit", texto: "Parecer de risco penal empresarial" }];
    b.push({ t: "tab", larg: [1.2, 2.8], linhas: [["Consulente", nome + (emp.cnpj ? ", CNPJ " + emp.cnpj : "")], ["Setor de atuação", emp.setor || "não informado"], ["Porte", emp.porte || "não informado"], ["Data", opc.dataTexto || ""]] });
    let n = 0;
    const h = t => ({ t: "h", texto: ROMANOS[n++] + ". " + t });

    b.push(h("Objeto e metodologia"));
    b.push({ t: "p", r: "O presente parecer tem por objeto a avaliação preliminar da exposição penal de " + nome + " nas áreas de lavagem de dinheiro, crimes contra a ordem tributária, anticorrupção e licitações e crimes ambientais, a partir das respostas fornecidas pela própria consulente a questionário estruturado elaborado por este escritório." });
    b.push({ t: "p", r: "Cada resposta foi ponderada segundo a relevância do fator ou do controle para a configuração de responsabilidade penal, resultando em índice percentual por área, classificado como baixo, moderado, elevado ou crítico. A análise não substitui auditoria documental nem investigação interna, e as conclusões dependem da veracidade e da completude das informações prestadas." });
    b.push({ t: "p", r: "Em síntese, trata-se de diagnóstico inicial, destinado a orientar a priorização das medidas de prevenção, razão pela qual se recomenda que os pontos classificados como elevados ou críticos sejam objeto de verificação documental aprofundada." });

    b.push(h("Perfil da empresa"));
    const perfil = [];
    if (emp.setor) perfil.push("atua no setor de " + emp.setor.replace(/^\w/, c => c.toLowerCase()));
    if (emp.porte) perfil.push("é de porte " + emp.porte.toLowerCase());
    if (emp.empregados) perfil.push("conta com aproximadamente " + emp.empregados + " empregados");
    if (emp.unidades) perfil.push("opera em " + emp.unidades);
    b.push({ t: "p", r: "Segundo as informações prestadas, a consulente " + (perfil.length ? listaV(perfil) : "não detalhou seu perfil operacional") + "." + (emp.observacoes ? " " + emp.observacoes.trim().replace(/([^.])$/, "$1.") : "") });
    b.push({ t: "tab", cab: ["Área", "Índice de risco", "Classificação"], larg: [2.4, 1, 1], linhas: res.map(r => [r.area.titulo, r.pct == null ? "não avaliada" : r.pct + "%", r.nivel]) });
    const graves = aval.filter(r => r.nivel === "crítico" || r.nivel === "elevado");
    b.push({ t: "p", r: graves.length ? "Em síntese, o quadro revela exposição " + (graves.some(r => r.nivel === "crítico") ? "crítica" : "elevada") + " em " + listaV(graves.map(r => r.area.titulo.toLowerCase())) + ", o que recomenda a adoção prioritária das medidas indicadas nos tópicos correspondentes." : "Em síntese, não foram identificadas áreas de exposição elevada ou crítica, recomendando-se a manutenção e o aperfeiçoamento contínuo dos controles existentes." });

    for (const r of res) {
      b.push(h(r.area.titulo));
      b.push({ t: "p", r: r.area.intro });
      if (!r.respondidas) { b.push({ t: "p", r: "As perguntas desta área foram respondidas como não aplicáveis à atividade da consulente, razão pela qual não se atribuiu índice de risco. Recomenda-se, ainda assim, a revisão periódica dessa avaliação, sobretudo diante de mudanças no modelo de negócio." }); continue; }
      if (r.riscos.length) {
        b.push({ t: "p", r: "No caso da consulente, foram identificados como pontos de atenção " + lista(r.riscos.map(x => x.q.risco + (x.r === "parcial" ? " (de forma parcial)" : ""))) + "." });
      } else b.push({ t: "p", r: "No caso da consulente, as respostas não indicaram fatores de risco relevantes nesta área." });
      if (r.fortes.length) b.push({ t: "p", r: "Como aspectos positivos, a consulente informou contar com " + listaV(r.fortes.map(q => q.ok)) + ", controles que reduzem a exposição e devem ser preservados e documentados." });
      b.push({ t: "p", r: "O índice apurado nesta área foi de " + r.pct + "%, classificado como " + r.nivel + "." + (r.nivel === "crítico" || r.nivel === "elevado" ? " A combinação dos fatores identificados torna plausível, em caso de fiscalização ou investigação, a instauração de procedimento criminal em face dos administradores, cuja responsabilidade penal é individual e depende da demonstração de dolo e de participação concreta na conduta." : "") });
      b.push({ t: "p", r: r.recs.length ? "Em síntese, recomenda-se, em caráter " + PRIORIDADE[r.nivel] + ", " + lista(r.recs) + "." : "Em síntese, recomenda-se a manutenção dos controles existentes e sua revisão periódica, com registro documental das verificações realizadas." });
    }

    b.push(h("Conclusão"));
    const ordem = aval.slice().sort((x, y) => y.pct - x.pct);
    b.push({ t: "p", r: aval.length ? "Diante do exposto, conclui-se que a exposição penal da consulente é mais acentuada em " + ordem[0].area.titulo.toLowerCase() + " (" + ordem[0].nivel + ")" + (ordem.length > 1 ? ", seguida de " + listaV(ordem.slice(1).map(r => r.area.titulo.toLowerCase() + " (" + r.nivel + ")")) : "") + "." : "Diante do exposto, as respostas não permitiram a atribuição de índice de risco a nenhuma das áreas analisadas." });
    b.push({ t: "p", r: "As medidas recomendadas devem ser implementadas segundo a ordem de prioridade indicada, com registro documental de cada etapa, pois a demonstração de controles efetivos é relevante tanto para prevenir a ocorrência de ilícitos quanto para delimitar a responsabilidade individual dos administradores e mitigar as sanções aplicáveis à pessoa jurídica." });
    b.push({ t: "p", r: "Por fim, recomenda-se a reavaliação deste diagnóstico em doze meses ou sempre que houver alteração relevante nas atividades, na estrutura societária ou no relacionamento com o poder público, colocando-se este escritório à disposição para a verificação documental e para a estruturação das medidas propostas." });
    b.push({ t: "p", recuo: false, r: "É o parecer." });
    b.push({ t: "data", texto: (opc.local || "Belo Horizonte/MG") + ", " + (opc.dataTexto || "") + "." });
    (opc.advogados || []).forEach(a => b.push({ t: "ass", nome: a.nome, linhas: ["OAB/" + a.uf + " " + a.oab] }));
    return { blocos: b, resultado: res };
  }

  root.RISCO = { AREAS, pontuar, parecer };
})(typeof window !== "undefined" ? window : globalThis);
