/* Estudo de caso criminal (padrão TPC Advogados) a partir da análise do RIF.
   Documento de uso interno da defesa: prosa contínua, seções em algarismos romanos, parágrafos numerados,
   citações recuadas, síntese e providência ao final de cada seção. Gera a pré-visualização em HTML e o .docx
   (OOXML montado no navegador, com timbrado, rodapé com barra amarela e numeração de páginas). */
(function (root) {
  "use strict";
  const M = root.RIF_MOTOR, R = root.RIF_RELATORIO, J = root.RIF_JURIDICO;
  const { brl, dBR, fmtDoc } = M;
  const lista = a => (a.length <= 1 ? a.join("") : a.slice(0, -1).join(", ") + " e " + a[a.length - 1]);
  const n = (x, s, p) => x + " " + (x === 1 ? s : p);
  const prec = id => J.precedentes.find(p => p.id === id);
  const fonte = id => { const p = prec(id); return p ? p.tribunal + ", " + p.orgao + ", " + p.proc + (p.rel ? ", " + p.rel : "") : ""; };
  const minus = s => (/^[A-ZÀ-Ü]{2,}\b/.test(s) ? s : s.charAt(0).toLowerCase() + s.slice(1));
  const pct = (a, b) => (b ? Math.round(100 * a / b) + "%" : "0%");
  const limpa = s => String(s || "").replace(/^[\s\-–—]+|[\s\-–—]+$/g, "").replace(/\s*[–—]\s*/g, ", ").replace(/\s+-\s+/g, ", ");

  /* ------------------------------------------------------------------ conteúdo */
  function blocos(S) {
    const ds = S.ds, t = ds.tot, c = S.caso || {}, B = [];
    const h1 = x => B.push({ t: "h1", x }), h2 = x => B.push({ t: "h2", x }), p = (x, lead) => B.push({ t: "p", x, lead }), q = (x, f) => B.push({ t: "q", x, f }), tab = (cols, rows) => B.push({ t: "tab", cols, rows });
    const tit = [...ds.titulares.values()];
    const autoCred = t.automaticas.reduce((s, x) => s + x.B, 0);
    const integ = ds.inconsistencias.filter(i => i.cat === "Integridade dos arquivos");
    const outras = ds.inconsistencias.filter(i => i.cat !== "Integridade dos arquivos");
    const leg = R.legalidade(S.legal, ds);
    const legCrit = leg.filter(a => a.grav === "critico");
    const cmp = S.cmp, ruins = cmp ? cmp.verif.filter(v => v.status !== "confirmada") : [];
    const L = S.legal || {};
    B.push({ t: "capa", titulo: "Estudo de caso", sub: "Análise defensiva do Relatório de Inteligência Financeira" + (S.rif ? " nº " + S.rif : ""), dados: [["Autos", c.autos], ["Assistido", c.assistido], ["Juízo", c.juizo], ["Tipo penal", c.tipo], ["RIF", S.rif ? "nº " + S.rif : ""], ["Data", new Date().toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" })]].filter(x => x[1]) });

    /* I */
    h1("Síntese do caso e objeto do estudo");
    p("O presente estudo examina, sob a perspectiva da defesa" + (c.assistido ? " de " + c.assistido : "") + ", o Relatório de Inteligência Financeira" + (S.rif ? " nº " + S.rif : "") + " encaminhado pelo COAF" + (c.autos ? " e juntado aos autos " + c.autos : "") + (c.tipo ? ", no contexto de imputação relativa a " + c.tipo : "") + ". O RIF reúne " + n(t.ncom, "comunicação", "comunicações") + " de operações financeiras, relativas a " + n(t.ntit, "titular", "titulares") + " de conta, com " + n(t.nenv, "pessoa física ou jurídica envolvida", "pessoas físicas e jurídicas envolvidas") + " e operações compreendidas entre " + dBR(t.ini) + " e " + dBR(t.fim) + ".");
    p("Os titulares comunicados são " + lista(tit.map(T => T.nome + " (" + fmtDoc(T.doc) + ")")) + ". Das comunicações, " + n(t.automaticas.length, "decorre", "decorrem") + " de critério objetivo de valor ou de espécie, sem juízo de suspeição do banco, e as demais de comunicações de operações atípicas, formuladas a partir do monitoramento interno das instituições financeiras.");
    p("O estudo parte exclusivamente dos arquivos estruturados do COAF, lidos integralmente, e não de relatórios de análise produzidos a partir deles" + (cmp ? ", sem prejuízo do confronto, transação por transação, com o relatório policial que os interpretou" : "") + ". Os fluxos foram reconstruídos a partir das seções próprias do relato bancário, o que permite identificar o sentido real do dinheiro e evitar as inversões típicas da leitura por proximidade de palavras.");
    p("Em síntese, o objeto do estudo é demonstrar o que o RIF efetivamente registra, o que dele não pode ser extraído e quais vícios comprometem a sua utilização. A providência imediata é assegurar que qualquer afirmação acusatória sobre a movimentação financeira seja confrontada com o material primário aqui examinado.");

    /* II */
    h1("Natureza e valor probatório do RIF");
    p("O RIF é produto de inteligência financeira. As comunicações que o compõem são redigidas pelas instituições obrigadas a partir de critérios internos de monitoramento, e o COAF não atesta a veracidade material de cada operação comunicada. Não se trata de extrato bancário, de perícia contábil nem de quebra judicial de sigilo, mas de relato unilateral, produzido fora de qualquer contraditório.");
    p("Essa natureza é reconhecida pelo próprio órgão acusador. A Nota Técnica CACOP nº 02/2026, do Ministério Público, registra premissas que limitam o alcance do material e que podem ser invocadas em favor da defesa:");
    for (const r of J.reconhecimentos.slice(0, 3)) q(r, "NT CACOP nº 02/2026, síntese dos reconhecimentos");
    p("As hipóteses de enquadramento indicadas pelos bancos, previstas na Carta-Circular BCB 3.542/2012 e na Carta-Circular BCB 4.001/2020, descrevem situações que podem configurar indícios a serem avaliados pelo próprio comunicante, e não condutas criminosas. Nas comunicações examinadas, os enquadramentos são formulados como hipóteses, e não como constatações, e muitos decorrem de critérios cadastrais, geográficos ou de valor, sem relação com conduta concreta.");
    if (/lavagem|9\.613/i.test(c.tipo || "")) p("Há, ainda, um ponto de tipicidade que deve ser explorado desde logo. O crime do art. 1º da Lei 9.613/1998 exige que os bens, direitos ou valores sejam provenientes, direta ou indiretamente, de infração penal. O RIF descreve atipicidade financeira em relação ao perfil cadastral, mas não identifica nenhuma infração penal antecedente, de modo que a movimentação comunicada, por si, não preenche o elemento normativo do tipo.");
    p("Em síntese, o RIF é elemento meramente informativo, insuscetível de, isoladamente, fundamentar juízo de autoria, materialidade ou medida constritiva. A providência recomendada é sustentar, em todas as manifestações, a necessidade de prova bancária regular, produzida sob contraditório, para qualquer afirmação sobre a origem ou o destino dos recursos.");

    /* III */
    h1("Integridade dos arquivos e cadeia de custódia do dado financeiro");
    if (integ.length) {
      p("O exame técnico dos arquivos revelou " + n(integ.length, "problema", "problemas") + " de integridade, que comprometem a rastreabilidade do dado financeiro e a própria confiabilidade do material juntado.");
      for (const i of integ) p(i.texto, i.titulo + ".");
    } else p("Não foram identificados sinais de alteração nos arquivos recebidos. A integridade, contudo, depende da comprovação de que esses arquivos são os mesmos gerados pelo COAF, o que exige a certificação de sua origem.");
    tab([{ rot: "Arquivo", w: 2100 }, { rot: "Registros", w: 1100 }, { rot: "Código de controle", w: 2800 }, { rot: "Codificação", w: 2504 }],
      [["com", "Comunicações"], ["env", "Envolvidos"], ["oco", "Ocorrências"]].filter(([k]) => S.arqs[k]).map(([k, rot]) => { const a = S.arqs[k], ct = a.controle || {}; return [rot, String(a.dados.length), ct.codigo ? ct.codigo + (ct.confere ? " (confere)" : " (não reproduzido)") : "ausente", a.codificacao]; }));
    p("A NT CACOP 02/2026 reconhece que o RIF deve ser preservado em sua forma original e que alteração ou fracionamento sem registro compromete a auditabilidade, devendo ser certificados nos autos a origem, o número do SEI-C, a data, a autoridade solicitante e a forma de recebimento. A exigência decorre, por analogia, do regime da cadeia de custódia:");
    q("Art. 158-A. Considera-se cadeia de custódia o conjunto de todos os procedimentos utilizados para manter e documentar a história cronológica do vestígio coletado em locais ou em vítimas de crimes, para rastrear sua posse e manuseio a partir de seu reconhecimento até o descarte.", "Código de Processo Penal, art. 158-A");
    p("Em síntese, " + (integ.some(i => i.grav === "critico") ? "os arquivos juntados não são os originais do COAF, e a cadeia de custódia do dado financeiro está comprometida" : "a integridade dos arquivos não está demonstrada nos autos") + ". A providência recomendada é requerer ao juízo a requisição dos arquivos originais, com o código de controle e a certificação de origem, e, enquanto não demonstrada a integridade, sustentar a inutilização do material.");

    /* IV */
    h1("Reconstrução e reconciliação da movimentação");
    p("O número mais citado a respeito de um RIF costuma ser o seu “volume”, obtido pela soma do campo total de cada comunicação. Esse número adiciona créditos e débitos da mesma conta, de modo que o mesmo dinheiro é contado quando entra e quando sai. No presente caso, a soma bruta é de " + brl(t.somaA) + ", ao passo que os créditos efetivamente comunicados somam " + brl(t.cred) + ", o equivalente a " + pct(t.cred, t.somaA) + " daquele valor.");
    tab([{ rot: "Componente", w: 6004 }, { rot: "Valor", w: 2500, num: true }], R.reconciliacao(ds).map(([k, v]) => [k, brl(v)]));
    p("Dos créditos comunicados, " + brl(t.neutros) + " correspondem a recursos do próprio titular ou neutros, como resgates de aplicação, empréstimos, estornos, devoluções e transferências de mesma titularidade, que não representam ingresso de recursos de terceiros nem acréscimo patrimonial." + (t.automaticas.length ? " Outros " + brl(autoCred) + " decorrem de comunicações automáticas de espécie." : "") + (t.duplicado ? " Há, ainda, transferências entre os próprios titulares relatadas tanto pela conta de origem quanto pela de destino, em períodos sobrepostos, que, somadas, contam o mesmo dinheiro duas vezes, até o limite de " + brl(t.duplicado) + "." : ""));
    p("Em síntese, qualquer referência a “movimentação” de " + brl(t.somaA) + " superdimensiona a realidade retratada no RIF; os créditos de terceiros nas comunicações por atipicidade somam " + brl(t.credTerceiros) + ". A providência recomendada é impugnar toda referência ao volume bruto e requerer perícia contábil sobre extratos obtidos regularmente, com indicação de assistente técnico.");

    /* V */
    h1("Análise individualizada dos titulares");
    tab([{ rot: "Titular", w: 2504 }, { rot: "Com.", w: 900 }, { rot: "Créditos", w: 1700, num: true }, { rot: "Próprios ou neutros", w: 1700, num: true }, { rot: "Terceiros", w: 1700, num: true }],
      tit.map(T => { const cs = T.coms; return [T.nome, cs.map(x => x.idx).join(", "), brl(cs.reduce((s, x) => s + x.B, 0)), brl(cs.reduce((s, x) => s + x.economia.vNeutro + x.economia.mesmaCred, 0)), brl(cs.filter(x => !x.automatica).reduce((s, x) => s + x.economia.credTerceiros, 0))]; }));
    for (const T of tit) {
      const cs = T.coms, cred = cs.reduce((s, x) => s + x.B, 0), neu = cs.reduce((s, x) => s + x.economia.vNeutro + x.economia.mesmaCred, 0);
      const ocup = [...new Set(cs.map(x => limpa(x.relato.ocupacao)).filter(Boolean))];
      const pts = ds.pontos.filter(pt => pt.idxs.length && pt.idxs.every(i => cs.some(x => x.idx === i)));
      const incs = ds.inconsistencias.filter(i => i.idxs.length && i.idxs.every(x => cs.some(y => y.idx === x)) && i.cat !== "Integridade dos arquivos");
      h2(T.nome);
      p(T.nome + " (" + fmtDoc(T.doc) + ") é titular " + (cs.length === 1 ? "da comunicação " : "das comunicações ") + lista(cs.map(x => String(x.idx))) + (ocup.length ? ", e os bancos o(a) qualificam como " + lista(ocup.map(o => "“" + o + "”")) : "") + ". Os créditos comunicados somam " + brl(cred) + ", dos quais " + brl(neu) + " são recursos próprios ou neutros.");
      for (const x of cs) {
        const e = x.economia, partes = [];
        if (e.renda) partes.push("renda cadastral de " + brl(e.renda.valor) + (e.renda.data ? ", informada em " + dBR(e.renda.data) : "") + (e.rendaPeriodo ? ", equivalente a " + brl(e.rendaPeriodo) + " em " + e.meses + " meses" : ""));
        if (e.faturamento) partes.push("faturamento anual declarado de " + brl(e.faturamento.valor) + (e.fatPeriodo ? ", ou " + brl(e.fatPeriodo) + " proporcionalmente ao período" : ""));
        p("Na comunicação " + x.idx + ", de " + x.comunicante + ", relativa ao período de " + dBR(x.ini) + " a " + dBR(x.fim) + (x.automatica ? " e de natureza automática" : "") + ", os créditos somam " + brl(x.B) + " e os débitos " + brl(x.C) + "." + (partes.length ? " O relato registra " + partes.join(" e ") + "." : "") + (x.relato.remetentes.length ? " Os principais remetentes são " + lista(x.relato.remetentes.slice(0, 4).map(r => r.nome + " (" + brl(r.valor) + ")")) + "." : "") + (x.relato.destinatarios.length ? " Os principais destinatários são " + lista(x.relato.destinatarios.slice(0, 4).map(r => r.nome + " (" + brl(r.valor) + ")")) + "." : ""));
      }
      for (const pt of pts) p(pt.texto, pt.titulo + ".");
      if (incs.length) p("Quanto a " + T.nome + ", o RIF apresenta ainda as seguintes falhas: " + incs.map(i => minus(i.titulo)).join("; ") + ".");
      p("Em síntese, a movimentação atribuída a " + T.nome + " deve ser lida à luz dos elementos acima, registrados pelo próprio comunicante. A providência recomendada é reunir documentação da atividade econômica, da renda atualizada e das relações com as contrapartes, para neutralizar a leitura de incompatibilidade.");
    }

    /* VI */
    h1("Inconsistências do RIF");
    if (outras.length) {
      p("O confronto entre os três arquivos e o relato bancário revelou " + n(outras.length, "inconsistência", "inconsistências") + " além das já examinadas, das quais " + outras.filter(i => i.grav === "critico").length + " de natureza crítica e " + outras.filter(i => i.grav === "relevante").length + " relevantes.");
      for (const cat of [...new Set(outras.map(i => i.cat))]) {
        h2(cat);
        for (const i of outras.filter(x => x.cat === cat && x.grav !== "informativa")) p(i.texto, i.titulo + ".");
        const inf = outras.filter(x => x.cat === cat && x.grav === "informativa");
        if (inf.length) p("Registram-se, em caráter informativo, " + inf.map(i => minus(i.titulo) + " (com. " + i.idxs.join(", ") + ")").join("; ") + ".");
      }
      p("Em síntese, o RIF não é retrato fiel e seguro das operações, mas compilação de relatos com falhas de identificação, de valores e de correspondência entre arquivos. A providência recomendada é requerer que a autoridade esclareça cada divergência e que as informações afetadas sejam desconsideradas como elemento de convicção.");
    } else p("Não foram identificadas inconsistências entre os arquivos além das já mencionadas.");

    /* VII */
    if (cmp) {
      const porSt = {}; for (const v of cmp.verif) porSt[v.status] = (porSt[v.status] || 0) + 1;
      h1("Confronto com o relatório policial");
      p("O relatório policial" + (S.rel ? ", " + S.rel.nome + "," : "") + " foi lido integralmente, e cada transação nele afirmada foi verificada contra o relato bancário da comunicação indicada como fonte. " + (cmp.linhas.length ? "Das " + cmp.linhas.length + " transações relacionadas, que somam " + brl(cmp.vTot) + ", " + (porSt["confirmada"] || 0) + " foram confirmadas e " + ruins.length + " apresentam problema, no total de " + brl(cmp.vRuim) + "." : "Não foi possível reconstruir a tabela de transações do relatório; os achados abaixo decorrem da leitura do texto."));
      if (ruins.length) {
        const ord = { "sentido invertido": 0, "não é transação": 1, "sem lastro": 2, "valor divergente": 3, "automática": 4 };
        const l = ruins.slice().sort((a, b) => (ord[a.status] - ord[b.status]) || b.row.valor - a.row.valor);
        tab([{ rot: "Pág.", w: 650 }, { rot: "Origem e destino segundo o relatório", w: 3600 }, { rot: "Valor", w: 1650, num: true }, { rot: "Com.", w: 650 }, { rot: "Situação no RIF", w: 1954 }],
          l.slice(0, 40).map(v => [String(v.row.pagina), v.row.origem.nome + " para " + v.row.destino.nome, brl(v.row.valor), String(v.row.com || ""), v.status]));
        if (l.length > 40) p("A relação acima traz as 40 primeiras ocorrências; as demais constam do relatório comparativo da ferramenta.");
      }
      for (const a of cmp.achados.filter(a => a.grav !== "informativa")) p(a.texto, a.titulo + ".");
      p("Em síntese, o relatório policial, que a própria NT CACOP 02/2026 reconhece ser interpretativo e insuscetível de apresentação como fonte primária, contém afirmações que não correspondem ao RIF que lhe serve de base. A providência recomendada é requerer a retificação ou o desentranhamento do relatório quanto às transações não confirmadas, a intimação do analista responsável para indicar a base documental de cada uma e, se necessário, a sua oitiva como testemunha.");
    }

    /* VIII */
    h1("Legalidade da obtenção e do compartilhamento");
    p("O Supremo Tribunal Federal, no Tema 990, admitiu o compartilhamento de RIFs com os órgãos de persecução sem prévia autorização judicial, mas apenas por comunicações formais, em procedimentos formalmente instaurados e sujeitos a posterior controle jurisdicional:");
    q(prec("tema990").tese, fonte("tema990"));
    p("O fluxo inverso, em que a autoridade solicita o relatório ao COAF, recebeu tratamento distinto. A Terceira Seção do Superior Tribunal de Justiça assentou a sua inviabilidade sem prévia autorização judicial:");
    q(prec("stj-174173").tese, fonte("stj-174173"));
    p("No Supremo Tribunal Federal, a liminar proferida no Tema 1.404 condicionou o fornecimento de RIFs a pedido a requisitos cumulativos, cujo descumprimento conduz à ilicitude da prova e das derivadas:");
    q(prec("tema1404").tese, fonte("tema1404"));
    const intercambio = L.modalidade === "intercambio";
    if (leg.length) {
      p("Aplicadas essas balizas às informações disponíveis sobre a obtenção do RIF" + (L.modalidade ? ", que é " + R.MODALIDADES[L.modalidade] : "") + (L.procedimento ? " e foi requerido ou recebido no âmbito de " + R.PROCEDIMENTOS[L.procedimento] : "") + ", identificam-se os seguintes pontos.");
      for (const a of leg) p(a.texto + (a.pedido ? " Providência: " + a.pedido.charAt(0).toLowerCase() + a.pedido.slice(1) : ""), a.titulo + ".");
    }
    p("Em síntese, " + (legCrit.length ? "há " + n(legCrit.length, "vício crítico", "vícios críticos") + " na obtenção do RIF, aptos a ensejar o reconhecimento da ilicitude da prova e das derivadas (CPP, art. 157)" : intercambio ? "a legalidade do RIF de intercâmbio depende de elementos que devem ser exigidos da autoridade" : "a legalidade do RIF depende de elementos que, em regra, não constam dos autos") + ". A providência recomendada é requerer a juntada do pedido de intercâmbio, se houver, do ato de instauração vigente à data do pedido, da declaração de que os alvos figuravam formalmente como investigados e da certificação de origem do RIF" + (legCrit.length ? ", e arguir desde logo a ilicitude, inclusive pela via do habeas corpus, se houver constrangimento atual" : "") + ".");

    /* IX */
    h1("Riscos e pontos de atenção");
    p("A honestidade analítica impõe registrar os pontos em que a posição da defesa encontra resistência. O primeiro deles é jurisprudencial: a Primeira Turma do Supremo Tribunal Federal, na Rcl 61.944/PA, admitiu a provocação do COAF pela autoridade sem desnaturar o compartilhamento, e a acusação tende a invocá-la. A distinção deve ser construída a partir da orientação da Terceira Seção do STJ, da Segunda Turma do STF e, sobretudo, dos requisitos do Tema 1.404.");
    p("O segundo risco é temporal. A decisão de 21/4/2026 atribuiu eficácia prospectiva aos requisitos do Tema 1.404, de modo que, para pedidos anteriores a 27/3/2026, a legalidade é aferida caso a caso. Além disso, segundo a Corte Especial do STJ (AgRg na APn 1.076/DF), a suspensão nacional não alcança processos em que a validade do RIF já tenha sido apreciada e confirmada" + (L.dataPedido ? "; no caso, o pedido data de " + dBR(new Date(L.dataPedido + "T00:00:00Z")) : "") + ".");
    p("O terceiro risco é material. Depuradas as duplicidades, os recursos próprios e as comunicações automáticas, ainda subsistem " + brl(t.credTerceiros) + " em créditos de terceiros nas comunicações por atipicidade. Embora esse valor não indique, por si, ilicitude, a defesa deve estar preparada para explicar a origem desses recursos com documentação própria, pois a mera desqualificação do RIF não afasta eventual prova bancária obtida regularmente." + (integ.some(i => /controle/i.test(i.titulo)) ? " Registra-se, por fim, que a divergência do código de controle não prova, por si, adulteração, pois o algoritmo do COAF não é público; deve ser apresentada como ausência de demonstração de integridade, e não como afirmação de falsidade." : ""));
    p("Em síntese, os riscos não infirmam as teses defensivas, mas determinam a sua ordem e a sua forma de apresentação. A providência recomendada é conduzir a impugnação em duas frentes paralelas, a da ilicitude e a da imprestabilidade material do RIF, de modo que o eventual insucesso de uma não comprometa a outra.");

    /* X */
    h1("Estratégia defensiva e providências");
    const teses = [];
    if (legCrit.length) teses.push("a ilicitude da obtenção do RIF, com extensão às provas derivadas, fundada " + lista(legCrit.map(a => "na constatação de " + minus(a.titulo))));
    if (integ.length) teses.push("a quebra da cadeia de custódia do dado financeiro, demonstrada pelos sinais de alteração dos arquivos e pela ausência de certificação de origem");
    if (cmp && ruins.length) teses.push("a imprestabilidade do relatório policial, que inverte o sentido de fluxos, converte dados cadastrais em transações e soma duas vezes o mesmo dinheiro");
    teses.push("o superdimensionamento dos valores, que confunde o volume bruto com movimentação e ignora recursos próprios, neutros e comunicações automáticas");
    if (ds.pontos.some(x => x.tipo === "compatibilidade" || x.tipo === "relato")) teses.push("a existência de explicações lícitas registradas no próprio RIF, como a compatibilidade com o faturamento, a condição de sócio e os vínculos econômicos declarados");
    p("A partir do exame realizado, a defesa dispõe das seguintes linhas de atuação, em ordem de prioridade: " + teses.map((x, i) => "(" + (i + 1) + ") " + x).join("; ") + ".");
    p("No plano imediato, recomenda-se requerimento ao juízo para a requisição ao COAF dos arquivos originais com o código de controle, a certificação do número do SEI-C, da data, da autoridade solicitante e da forma de recebimento, e a juntada do pedido de intercâmbio e do ato de instauração, com fundamento na Súmula Vinculante 14, sob pena de inutilização do material que não for franqueado à defesa.");
    p("Em seguida, conforme o resultado dessas diligências e a fase processual, cabe arguir a ilicitude do RIF e das provas derivadas, em resposta à acusação ou por habeas corpus, se houver constrangimento atual, requerer perícia contábil sob contraditório e impugnar medidas constritivas fundadas exclusivamente no RIF, cuja fragilidade é reconhecida pela própria NT CACOP 02/2026." + (cmp ? " Quanto ao relatório policial, recomenda-se requerer a sua retificação e a intimação do analista responsável, e explorar as inversões e duplicidades em eventual inquirição." : ""));
    p("Em síntese, a estratégia combina o controle de legalidade da obtenção com a desconstrução material do RIF e de suas interpretações. A providência inicial, de baixo custo e alto rendimento, é o requerimento de acesso e de certificação de origem, cuja resposta orientará as etapas seguintes.");

    /* XI */
    h1("Conclusão");
    p("O RIF examinado é material indiciário, produzido a partir de relatos bancários que formulam hipóteses de atipicidade, e não constatações de ilicitude. A reconciliação dos valores demonstra que o volume citado superdimensiona a movimentação real, que parte relevante dos créditos corresponde a recursos próprios, neutros ou a comunicações automáticas, e que o RIF contém " + n(ds.inconsistencias.filter(i => i.grav === "critico").length, "inconsistência crítica", "inconsistências críticas") + " e " + n(ds.inconsistencias.filter(i => i.grav === "relevante").length, "relevante", "relevantes") + "." + (cmp ? " O relatório policial não reproduz fielmente o RIF, com " + ruins.length + " das " + cmp.verif.length + " transações afirmadas sem respaldo exato no relato bancário." : ""));
    p("Por essas razões, o RIF não autoriza, por si, conclusão sobre a prática de crime. A defesa deve exigir o controle de legalidade da obtenção e a produção de prova bancária regular, sob contraditório, antes de qualquer juízo sobre os fatos.");
    p("Estudo gerado pela ferramenta RIF Defesa do HUB Criminal TPC, com processamento local dos arquivos. As sínteses de precedentes destinam-se à orientação e devem ser conferidas no inteiro teor antes de citação em peça.", "Nota.");
    return B;
  }

  /* ------------------------------------------------------------------ pré-visualização */
  const ROM = ["I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X", "XI", "XII", "XIII", "XIV", "XV"];
  const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, ch => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]));
  function html(B) {
    let i1 = 0, np = 0;
    return B.map(b => {
      if (b.t === "capa") return '<div class="estudo-capa"><img src="../assets/tpc-cabecalho.png" alt="TPC Advogados" class="estudo-logo"><p class="estudo-tit">' + esc(b.titulo.toUpperCase()) + '</p><p class="estudo-sub">' + esc(b.sub) + "</p><table>" + b.dados.map(([k, v]) => "<tr><th>" + esc(k) + "</th><td>" + esc(v) + "</td></tr>").join("") + "</table></div>";
      if (b.t === "h1") return "<h3>" + ROM[i1++] + ". " + esc(b.x) + "</h3>";
      if (b.t === "h2") return "<h4>" + esc(b.x) + "</h4>";
      if (b.t === "p") return '<p class="estudo-p"><span class="estudo-n">' + (++np) + ".</span>" + (b.lead ? "<b>" + esc(b.lead) + "</b> " : "") + esc(b.x) + "</p>";
      if (b.t === "q") return '<blockquote class="estudo-q">' + esc(b.x) + (b.f ? "<br><span>(" + esc(b.f) + ")</span>" : "") + "</blockquote>";
      if (b.t === "tab") return "<table><tr>" + b.cols.map(c => "<th" + (c.num ? ' class="num"' : "") + ">" + esc(c.rot) + "</th>").join("") + "</tr>" + b.rows.map(r => "<tr>" + r.map((v, k) => "<td" + (b.cols[k].num ? ' class="num"' : "") + ">" + esc(v) + "</td>").join("") + "</tr>").join("") + "</table>";
      return "";
    }).join("\n");
  }

  /* ------------------------------------------------------------------ OOXML */
  const X = s => String(s == null ? "" : s).replace(/[&<>"]/g, ch => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[ch])).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "");
  const NS = 'xmlns:wpc="http://schemas.microsoft.com/office/word/2010/wordprocessingCanvas" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"';
  const HDR = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';
  const run = (t, rpr) => '<w:r>' + (rpr ? "<w:rPr>" + rpr + "</w:rPr>" : "") + '<w:t xml:space="preserve">' + X(t) + "</w:t></w:r>";
  const SEMI = '<w:rFonts w:ascii="Segoe UI Semibold" w:hAnsi="Segoe UI Semibold" w:cs="Segoe UI Semibold"/><w:b/>';
  function celula(txt, w, opt) {
    opt = opt || {};
    return '<w:tc><w:tcPr><w:tcW w:w="' + w + '" w:type="dxa"/>' + (opt.fill ? '<w:shd w:val="clear" w:color="auto" w:fill="' + opt.fill + '"/>' : "") + '<w:tcMar><w:top w:w="60" w:type="dxa"/><w:left w:w="100" w:type="dxa"/><w:bottom w:w="60" w:type="dxa"/><w:right w:w="100" w:type="dxa"/></w:tcMar></w:tcPr>' +
      '<w:p><w:pPr><w:spacing w:before="0" w:after="0" w:line="240" w:lineRule="auto"/><w:jc w:val="' + (opt.num ? "right" : "left") + '"/></w:pPr>' + run(txt, (opt.head ? SEMI + '<w:color w:val="3D3D3D"/>' : "") + '<w:sz w:val="18"/><w:szCs w:val="18"/>') + "</w:p></w:tc>";
  }
  function tabelaX(cols, rows, cabecalhoLateral) {
    const bd = '<w:tblBorders>' + ["top", "left", "bottom", "right", "insideH", "insideV"].map(k => '<w:' + k + ' w:val="single" w:sz="4" w:space="0" w:color="C8C3BE"/>').join("") + "</w:tblBorders>";
    let x = '<w:tbl><w:tblPr><w:tblW w:w="8504" w:type="dxa"/>' + bd + '<w:tblLayout w:type="fixed"/><w:tblLook w:val="04A0" w:firstRow="1" w:lastRow="0" w:firstColumn="1" w:lastColumn="0" w:noHBand="0" w:noVBand="1"/></w:tblPr><w:tblGrid>' + cols.map(c => '<w:gridCol w:w="' + c.w + '"/>').join("") + "</w:tblGrid>";
    if (!cabecalhoLateral) x += '<w:tr><w:trPr><w:tblHeader/></w:trPr>' + cols.map(c => celula(c.rot, c.w, { head: true, fill: "F5F3F0", num: c.num })).join("") + "</w:tr>";
    for (const r of rows) x += "<w:tr><w:trPr><w:cantSplit/></w:trPr>" + r.map((v, k) => celula(v, cols[k].w, { num: cols[k].num, head: cabecalhoLateral && k === 0, fill: cabecalhoLateral && k === 0 ? "F5F3F0" : null })).join("") + "</w:tr>";
    return x + "</w:tbl>" + '<w:p><w:pPr><w:spacing w:after="120"/></w:pPr></w:p>';
  }
  function corpo(B) {
    const out = [];
    for (const b of B) {
      if (b.t === "capa") {
        out.push('<w:p><w:pPr><w:spacing w:before="2400" w:after="240"/><w:jc w:val="center"/></w:pPr>' + run(b.titulo.toUpperCase(), SEMI + '<w:spacing w:val="40"/>') + "</w:p>");
        out.push('<w:p><w:pPr><w:spacing w:after="1200"/><w:jc w:val="center"/></w:pPr>' + run(b.sub) + "</w:p>");
        out.push(tabelaX([{ rot: "", w: 2600 }, { rot: "", w: 5904 }], b.dados, true));
        out.push('<w:p><w:r><w:br w:type="page"/></w:r></w:p>');
      } else if (b.t === "h1") out.push('<w:p><w:pPr><w:pStyle w:val="Ttulo1"/></w:pPr>' + run(b.x) + "</w:p>");
      else if (b.t === "h2") out.push('<w:p><w:pPr><w:pStyle w:val="Ttulo2"/></w:pPr>' + run(b.x) + "</w:p>");
      else if (b.t === "p") out.push('<w:p><w:pPr><w:pStyle w:val="PargrafodaLista"/></w:pPr>' + (b.lead ? run(b.lead + " ", SEMI) : "") + run(b.x) + "</w:p>");
      else if (b.t === "q") out.push('<w:p><w:pPr><w:pStyle w:val="Citao"/></w:pPr>' + run(b.x) + (b.f ? run(" (" + b.f + ")", "<w:i/>") : "") + "</w:p>");
      else if (b.t === "tab") out.push(tabelaX(b.cols, b.rows));
    }
    return out.join("");
  }
  const EMU_LOGO = { cx: 3802380, cy: Math.round(3802380 * 132 / 1377) };
  function desenho(rid, id, nome, cx, cy, anc) {
    const g = '<a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:nvPicPr><pic:cNvPr id="' + id + '" name="' + nome + '"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip r:embed="' + rid + '"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="' + cx + '" cy="' + cy + '"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic>';
    if (!anc) return '<w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0"><wp:extent cx="' + cx + '" cy="' + cy + '"/><wp:effectExtent l="0" t="0" r="0" b="0"/><wp:docPr id="' + id + '" name="' + nome + '"/><wp:cNvGraphicFramePr><a:graphicFrameLocks xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" noChangeAspect="1"/></wp:cNvGraphicFramePr>' + g + "</wp:inline></w:drawing>";
    return '<w:drawing><wp:anchor distT="0" distB="0" distL="0" distR="0" simplePos="0" relativeHeight="251658240" behindDoc="1" locked="1" layoutInCell="1" allowOverlap="1"><wp:simplePos x="0" y="0"/><wp:positionH relativeFrom="page"><wp:posOffset>0</wp:posOffset></wp:positionH><wp:positionV relativeFrom="page"><wp:posOffset>' + (10692130 - cy) + '</wp:posOffset></wp:positionV><wp:extent cx="' + cx + '" cy="' + cy + '"/><wp:effectExtent l="0" t="0" r="0" b="0"/><wp:wrapNone/><wp:docPr id="' + id + '" name="' + nome + '"/><wp:cNvGraphicFramePr/>' + g + "</wp:anchor></w:drawing>";
  }
  function partes(B, titulo) {
    const cinza = '<w:color w:val="A6A6A6"/><w:sz w:val="16"/><w:szCs w:val="16"/>';
    const f = {};
    f["[Content_Types].xml"] = HDR + '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Default Extension="png" ContentType="image/png"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/><Override PartName="/word/numbering.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.numbering+xml"/><Override PartName="/word/settings.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.settings+xml"/><Override PartName="/word/header1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.header+xml"/><Override PartName="/word/footer1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.footer+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/><Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/></Types>';
    f["_rels/.rels"] = HDR + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/></Relationships>';
    const agora = new Date().toISOString().replace(/\.\d+Z$/, "Z");
    f["docProps/core.xml"] = HDR + '<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>' + X(titulo) + '</dc:title><dc:creator>TPC Advogados</dc:creator><dcterms:created xsi:type="dcterms:W3CDTF">' + agora + '</dcterms:created><dcterms:modified xsi:type="dcterms:W3CDTF">' + agora + "</dcterms:modified></cp:coreProperties>";
    f["docProps/app.xml"] = HDR + '<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties"><Application>HUB Criminal TPC</Application></Properties>';
    f["word/_rels/document.xml.rels"] = HDR + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/numbering" Target="numbering.xml"/><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/settings" Target="settings.xml"/><Relationship Id="rId4" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/header" Target="header1.xml"/><Relationship Id="rId5" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/footer" Target="footer1.xml"/></Relationships>';
    f["word/_rels/header1.xml.rels"] = HDR + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/logo.png"/></Relationships>';
    f["word/_rels/footer1.xml.rels"] = HDR + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/barra.png"/></Relationships>';
    f["word/settings.xml"] = HDR + '<w:settings xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:defaultTabStop w:val="720"/><w:hyphenationZone w:val="425"/><w:characterSpacingControl w:val="doNotCompress"/><w:compat><w:compatSetting w:name="compatibilityMode" w:uri="http://schemas.microsoft.com/office/word" w:val="15"/></w:compat></w:settings>';
    f["word/numbering.xml"] = HDR + '<w:numbering xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">' +
      '<w:abstractNum w:abstractNumId="0"><w:multiLevelType w:val="singleLevel"/><w:lvl w:ilvl="0"><w:start w:val="1"/><w:numFmt w:val="decimal"/><w:lvlText w:val="%1."/><w:lvlJc w:val="left"/><w:pPr><w:tabs><w:tab w:val="num" w:pos="720"/></w:tabs><w:ind w:left="0" w:firstLine="0"/></w:pPr></w:lvl></w:abstractNum>' +
      '<w:abstractNum w:abstractNumId="1"><w:multiLevelType w:val="singleLevel"/><w:lvl w:ilvl="0"><w:start w:val="1"/><w:numFmt w:val="upperRoman"/><w:lvlText w:val="%1."/><w:lvlJc w:val="left"/><w:pPr><w:tabs><w:tab w:val="num" w:pos="567"/></w:tabs><w:ind w:left="567" w:hanging="567"/></w:pPr></w:lvl></w:abstractNum>' +
      '<w:num w:numId="1"><w:abstractNumId w:val="0"/></w:num><w:num w:numId="2"><w:abstractNumId w:val="1"/></w:num></w:numbering>';
    f["word/styles.xml"] = HDR + '<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">' +
      '<w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Segoe UI" w:eastAsia="Segoe UI" w:hAnsi="Segoe UI" w:cs="Segoe UI"/><w:color w:val="000000"/><w:sz w:val="22"/><w:szCs w:val="22"/><w:lang w:val="pt-BR" w:eastAsia="en-US" w:bidi="ar-SA"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:after="200" w:line="298" w:lineRule="auto"/><w:jc w:val="both"/></w:pPr></w:pPrDefault></w:docDefaults>' +
      '<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:qFormat/></w:style>' +
      '<w:style w:type="character" w:default="1" w:styleId="Fontepargpadro"><w:name w:val="Default Paragraph Font"/><w:uiPriority w:val="1"/><w:semiHidden/></w:style>' +
      '<w:style w:type="paragraph" w:styleId="Ttulo1"><w:name w:val="heading 1"/><w:basedOn w:val="Normal"/><w:next w:val="PargrafodaLista"/><w:qFormat/><w:pPr><w:keepNext/><w:keepLines/><w:numPr><w:numId w:val="2"/></w:numPr><w:spacing w:before="480" w:after="360"/><w:jc w:val="left"/><w:outlineLvl w:val="0"/></w:pPr><w:rPr><w:rFonts w:ascii="Segoe UI Semibold" w:hAnsi="Segoe UI Semibold" w:cs="Segoe UI Semibold"/><w:b/><w:caps/><w:spacing w:val="10"/><w:kern w:val="22"/></w:rPr></w:style>' +
      '<w:style w:type="paragraph" w:styleId="Ttulo2"><w:name w:val="heading 2"/><w:basedOn w:val="Normal"/><w:next w:val="PargrafodaLista"/><w:qFormat/><w:pPr><w:keepNext/><w:keepLines/><w:spacing w:before="360" w:after="240"/><w:jc w:val="left"/><w:outlineLvl w:val="1"/></w:pPr><w:rPr><w:rFonts w:ascii="Segoe UI Semibold" w:hAnsi="Segoe UI Semibold" w:cs="Segoe UI Semibold"/><w:b/></w:rPr></w:style>' +
      '<w:style w:type="paragraph" w:styleId="PargrafodaLista"><w:name w:val="List Paragraph"/><w:basedOn w:val="Normal"/><w:qFormat/><w:pPr><w:numPr><w:numId w:val="1"/></w:numPr><w:spacing w:after="200"/><w:jc w:val="both"/></w:pPr></w:style>' +
      '<w:style w:type="paragraph" w:styleId="Citao"><w:name w:val="Quote"/><w:basedOn w:val="Normal"/><w:qFormat/><w:pPr><w:spacing w:after="240" w:line="240" w:lineRule="auto"/><w:ind w:left="1418"/><w:jc w:val="both"/></w:pPr><w:rPr><w:color w:val="3D3D3D"/></w:rPr></w:style>' +
      '<w:style w:type="paragraph" w:styleId="Cabealho"><w:name w:val="header"/><w:basedOn w:val="Normal"/><w:pPr><w:spacing w:after="0" w:line="240" w:lineRule="auto"/><w:jc w:val="left"/></w:pPr></w:style>' +
      '<w:style w:type="paragraph" w:styleId="Rodap"><w:name w:val="footer"/><w:basedOn w:val="Normal"/><w:pPr><w:spacing w:after="0" w:line="240" w:lineRule="auto"/><w:jc w:val="center"/></w:pPr></w:style>' +
      '<w:style w:type="table" w:default="1" w:styleId="Tabelanormal"><w:name w:val="Normal Table"/><w:semiHidden/><w:tblPr><w:tblInd w:w="0" w:type="dxa"/><w:tblCellMar><w:top w:w="0" w:type="dxa"/><w:left w:w="108" w:type="dxa"/><w:bottom w:w="0" w:type="dxa"/><w:right w:w="108" w:type="dxa"/></w:tblCellMar></w:tblPr></w:style>' +
      "</w:styles>";
    f["word/header1.xml"] = HDR + "<w:hdr " + NS + '><w:p><w:pPr><w:pStyle w:val="Cabealho"/></w:pPr><w:r>' + desenho("rId1", 101, "Timbrado TPC", EMU_LOGO.cx, EMU_LOGO.cy) + "</w:r></w:p></w:hdr>";
    f["word/footer1.xml"] = HDR + "<w:ftr " + NS + ">" +
      '<w:p><w:pPr><w:pStyle w:val="Rodap"/><w:jc w:val="right"/></w:pPr><w:r><w:rPr><w:color w:val="595959"/><w:sz w:val="18"/></w:rPr><w:fldChar w:fldCharType="begin"/></w:r><w:r><w:rPr><w:color w:val="595959"/><w:sz w:val="18"/></w:rPr><w:instrText xml:space="preserve"> PAGE </w:instrText></w:r><w:r><w:rPr><w:color w:val="595959"/><w:sz w:val="18"/></w:rPr><w:fldChar w:fldCharType="separate"/></w:r><w:r><w:rPr><w:color w:val="595959"/><w:sz w:val="18"/></w:rPr><w:t>1</w:t></w:r><w:r><w:rPr><w:color w:val="595959"/><w:sz w:val="18"/></w:rPr><w:fldChar w:fldCharType="end"/></w:r></w:p>' +
      '<w:p><w:pPr><w:pStyle w:val="Rodap"/></w:pPr><w:r>' + desenho("rId1", 102, "Barra TPC", 7560310, 321149, true) + "</w:r>" + run("BH  |  SP  |  BSB  |  Cuiabá  |  João Monlevade", cinza) + "</w:p>" +
      '<w:p><w:pPr><w:pStyle w:val="Rodap"/><w:spacing w:after="120"/></w:pPr>' + run("TPCADVOGADOS", "<w:b/>" + cinza) + run(".COM.BR", cinza) + "</w:p></w:ftr>";
    f["word/document.xml"] = HDR + "<w:document " + NS + "><w:body>" + corpo(B) +
      '<w:sectPr><w:headerReference w:type="default" r:id="rId4"/><w:footerReference w:type="default" r:id="rId5"/><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1701" w:right="1701" w:bottom="2269" w:left="1701" w:header="794" w:footer="397" w:gutter="0"/><w:cols w:space="720"/></w:sectPr></w:body></w:document>';
    return f;
  }
  async function docx(B, titulo) {
    if (!root.JSZip) throw new Error("A biblioteca de geração do Word não foi carregada. Verifique a conexão e recarregue a página.");
    const z = new root.JSZip(), f = partes(B, titulo);
    for (const k in f) z.file(k, f[k]);
    const img = async u => new Uint8Array(await (await fetch(u)).arrayBuffer());
    z.file("word/media/logo.png", await img("../assets/tpc-cabecalho.png"));
    z.file("word/media/barra.png", await img("../assets/tpc-barra.png"));
    return z.generateAsync({ type: "blob", mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" });
  }
  async function baixar(S, nome) {
    const B = blocos(S);
    const blob = await docx(B, "Estudo de caso: RIF" + (S.rif ? " nº " + S.rif : ""));
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = nome + ".docx"; document.body.appendChild(a); a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1500);
  }

  root.RIF_ESTUDO = { blocos, html, partes, docx, baixar };
})(typeof window !== "undefined" ? window : globalThis);
