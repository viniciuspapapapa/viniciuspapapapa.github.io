/* Relatórios da ferramenta de RIF: relatório técnico da defesa, relatório comparativo (relatório policial × RIF),
   controle de legalidade da obtenção e exportação para Word. Redação em parágrafos, com síntese e pedido ao final
   de cada tópico. */
(function (root) {
  "use strict";
  const M = root.RIF_MOTOR, J = root.RIF_JURIDICO;
  const { brl, dBR, fmtDoc } = M;
  const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const P = t => "<p>" + t + "</p>";
  const prec = id => J.precedentes.find(p => p.id === id);
  const cit = id => { const p = prec(id); return p ? p.tribunal + ", " + p.orgao + ", " + p.proc + (p.rel ? ", " + p.rel : "") + (p.data && p.data.length < 40 ? ", " + p.data : "") : id; };
  const lista = a => (a.length <= 1 ? a.join("") : a.slice(0, -1).join(", ") + " e " + a[a.length - 1]);
  const pct = (a, b) => (b ? Math.round(100 * a / b) + "%" : "0%");
  const hoje = () => new Date().toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" });

  /* ------------------------------------------------------------------ controle de legalidade */
  const MODALIDADES = { "": "não informada", espontaneo: "espontâneo (disseminação de ofício pelo COAF)", intercambio: "de intercâmbio (a pedido da autoridade)" };
  const PROCEDIMENTOS = { "": "não informado", ip: "inquérito policial", pic: "procedimento investigatório criminal (PIC)", sancionador: "processo administrativo sancionador", vpi: "verificação preliminar de informações (VPI/VPA)", nf: "notícia de fato", bo: "boletim de ocorrência ou registro sem instauração", sindicancia: "sindicância não punitiva ou auditoria", nenhum: "nenhum procedimento formal" };
  const INFORMAIS = ["vpi", "nf", "bo", "sindicancia", "nenhum"];
  const LIMINAR_1404 = new Date(Date.UTC(2026, 2, 27));

  function legalidade(L, ds) {
    L = L || {};
    const out = [];
    const add = (grav, titulo, texto, fund, pedido) => out.push({ grav, titulo, texto, fund: fund || [], pedido: pedido || "" });
    const d = s => (s ? new Date(s + "T00:00:00Z") : null);
    const dPed = d(L.dataPedido), dInst = d(L.dataInstauracao), dIncl = d(L.dataInclusao);
    const posLiminar = dPed ? dPed >= LIMINAR_1404 : null;
    const intercambio = L.modalidade === "intercambio";

    if (!L.modalidade) add("requerer", "Modalidade do RIF não informada", "Os autos não esclarecem se o RIF foi disseminado espontaneamente pelo COAF ou produzido a pedido da autoridade. A distinção é decisiva, porque o Tema 990 cobre o compartilhamento espontâneo, ao passo que o RIF de intercâmbio se submete aos requisitos do Tema 1.404 e, segundo a Terceira Seção do STJ, à prévia autorização judicial.", ["tema990", "stj-174173", "tema1404"], "Requisição ao COAF e à autoridade da certidão da modalidade do RIF, do número do SEI-C, da data, da autoridade solicitante e da forma de recebimento.");
    if (intercambio && L.autorizacao !== "sim") add("critico", "RIF de intercâmbio sem autorização judicial prévia", "O RIF foi obtido a pedido da autoridade" + (L.autorizacao === "nao" ? ", sem decisão judicial que o autorizasse" : ", e os autos não indicam decisão judicial prévia") + ". Para a Terceira Seção do STJ, a solicitação direta ao COAF, sem autorização judicial, é inviável, pois o art. 15 da Lei 9.613/1998 disciplina apenas o fornecimento voluntário de dados pela UIF. A Segunda Turma do STF segue a mesma orientação. A Primeira Turma do STF admite o fluxo inverso (Rcl 61.944/PA), mas o precedente deve ser distinguido à luz dos requisitos fixados no Tema 1.404.", ["stj-174173", "stf-2t", "stf-1t", "tema1404"], "Reconhecimento da ilicitude do RIF e das provas dele derivadas, com o desentranhamento (CPP, art. 157).");
    if (intercambio && INFORMAIS.includes(L.procedimento)) add("critico", "Pedido formulado fora de procedimento formalmente instaurado", "O pedido ao COAF foi feito no âmbito de " + PROCEDIMENTOS[L.procedimento] + ". O Tema 990 exige procedimento formalmente instaurado e sujeito a controle jurisdicional, e a liminar do Tema 1.404 veda expressamente o uso do RIF em notícia de fato, VPI, VPA, sindicâncias não punitivas e auditorias (requisitos 1 e 6).", ["tema990", "tema1404"], "Reconhecimento da ilicitude do RIF por ausência de procedimento formal, com extensão às provas derivadas.");
    if (!intercambio && INFORMAIS.includes(L.procedimento)) add("relevante", "RIF utilizado fora de procedimento formal", "O RIF ingressou na persecução no âmbito de " + PROCEDIMENTOS[L.procedimento] + ". Mesmo no compartilhamento espontâneo, o Tema 990 condiciona o uso a procedimento formalmente instaurado e sujeito a posterior controle judicial.", ["tema990"], "Juntada do ato formal de instauração e demonstração do controle jurisdicional, sob pena de inutilização do RIF.");
    if (dPed && dInst && dPed < dInst) add("critico", "Pedido anterior à instauração do procedimento", "O pedido ao COAF (" + dBR(dPed) + ") antecede a instauração do procedimento (" + dBR(dInst) + "). O RIF não foi meio de prova de investigação existente, mas o próprio ponto de partida da apuração.", ["tema1404", "tema990"], "Reconhecimento de que o RIF serviu como ato inaugural exploratório e declaração de sua ilicitude.");
    if (dPed && dIncl && dIncl > dPed) add("critico", "Teste da cronologia: investigado incluído após o pedido", "A pessoa passou a figurar formalmente como investigada em " + dBR(dIncl) + ", depois do pedido ao COAF (" + dBR(dPed) + "). A própria NT CACOP 02/2026 reconhece que a inclusão posterior revela pedido exploratório e não admite convalidação retroativa.", ["tema1404"], "Reconhecimento da ilicitude do RIF quanto ao investigado incluído posteriormente, com desentranhamento das informações a ele relativas.");
    if (intercambio && L.portaria === "nao") add("critico", "Pedido desacompanhado do ato de instauração", "O pedido não veio instruído com a cópia do ato de instauração nem com a declaração de que o alvo figurava formalmente como investigado, exigências do requisito 2 do Tema 1.404 e do Comunicado SEI-C 02/2026.", ["tema1404"], "Juntada integral do pedido de intercâmbio e de seus anexos; na ausência, reconhecimento da ilicitude.");
    if (L.primeira === "sim") add("critico", "RIF como primeira ou única medida investigativa", "O RIF figura como primeira ou única medida da investigação. A liminar do Tema 1.404 veda o uso do RIF como ponto de partida (requisito 4), e a doutrina qualifica essa prática como fishing expedition: elege-se o alvo antes do fato e busca-se, na devassa financeira, algum indício.", ["tema1404"], "Reconhecimento da prática de fishing expedition e da ilicitude do RIF e das provas derivadas.");
    if (L.sei === "nao") add("relevante", "Ausência de certificação de origem (SEI-C)", "Os autos não informam o número do SEI-C, a data, a autoridade solicitante e a forma de recebimento do RIF. Sem esses dados, a rastreabilidade do dado financeiro, que a própria NT CACOP 02/2026 equipara à cadeia de custódia (CPP, arts. 158-A a 158-F, por analogia), não pode ser auditada.", ["tema990"], "Certificação, nos autos, da origem do RIF (SEI-C, data, autoridade solicitante, forma de recebimento) e da cadeia de acesso.");
    if (L.fatosIni && L.fatosFim && ds && ds.tot.ini && ds.tot.fim) {
      const fi = d(L.fatosIni), ff = d(L.fatosFim);
      const antes = ds.tot.ini < fi ? Math.round((fi - ds.tot.ini) / 864e5) : 0, depois = ds.tot.fim > ff ? Math.round((ds.tot.fim - ff) / 864e5) : 0;
      if (antes > 30 || depois > 30) add("relevante", "Período do RIF excede os fatos investigados", "Os fatos investigados situam-se entre " + dBR(fi) + " e " + dBR(ff) + ", mas o RIF abrange operações de " + dBR(ds.tot.ini) + " a " + dBR(ds.tot.fim) + (antes > 30 ? ", alcançando " + antes + " dias anteriores" : "") + (depois > 30 ? (antes > 30 ? " e " : ", alcançando ") + depois + " dias posteriores" : "") + ". A ausência de pertinência temporal estrita contraria o requisito 3 do Tema 1.404 e o princípio da necessidade (Lei 9.613/1998, art. 17-F; LGPD, art. 6º).", ["tema1404"], "Desentranhamento das informações relativas a período estranho aos fatos investigados.");
    }
    if (L.acesso === "nao") add("relevante", "Acesso incompleto da defesa", "A defesa não teve acesso integral ao RIF e aos documentos de sua obtenção. Nos termos da Súmula Vinculante 14, o acesso aos elementos documentados é direito do defensor; a contrapartida, reconhecida pela própria NT CACOP 02/2026, é que aquilo que não for franqueado à defesa não pode ser utilizado como prova.", ["sv14"], "Acesso integral aos arquivos originais, ao pedido de intercâmbio e ao ato de instauração, sob pena de inutilização do RIF.");
    if (posLiminar === false && intercambio) add("informativa", "RIF anterior à liminar do Tema 1.404", "O pedido é anterior a 27/3/2026. A decisão de 21/4/2026 atribuiu eficácia prospectiva aos requisitos, de modo que a legalidade é aferida caso a caso. Os vetores do Tema 1.404 (procedimento formal, investigado previamente identificado, pertinência e prova independente) permanecem, contudo, parâmetros de controle, somados à orientação da Terceira Seção do STJ.", ["tema1404", "stj-174173"], "");
    if (posLiminar === true && intercambio) add("informativa", "RIF posterior à liminar do Tema 1.404", "O pedido é posterior a 27/3/2026, de modo que os seis requisitos cumulativos do Tema 1.404 incidem integralmente, e o descumprimento de qualquer deles conduz à ilicitude da prova e das derivadas.", ["tema1404"], "");
    if (!L.procedimento && intercambio) add("requerer", "Procedimento de origem não informado", "Não se sabe em que procedimento o pedido foi formulado.", ["tema1404"], "Juntada do ato de instauração vigente à data do pedido.");
    if (intercambio && !L.dataPedido) add("requerer", "Data do pedido não informada", "Sem a data do pedido, não é possível aplicar o teste da cronologia nem definir o regime do Tema 1.404 aplicável.", ["tema1404"], "Requisição do pedido de intercâmbio, com a data de protocolo no SEI-C.");
    return out;
  }

  /* ------------------------------------------------------------------ peças comuns */
  function cabecalho(titulo, sub, S) {
    const c = S.caso || {};
    const dados = [["RIF nº", S.rif], ["Autos", c.autos], ["Assistido", c.assistido], ["Juízo / órgão", c.juizo]].filter(x => x[1]);
    return '<div class="cab rel-cab"><span><b class="marca-tpc">TPC</b> ADVOGADOS · HUB CRIMINAL</span><span>' + esc(hoje()) + "</span></div>" +
      "<h2>" + esc(titulo) + "</h2>" + (sub ? '<p class="mudo">' + esc(sub) + "</p>" : "") +
      (dados.length ? "<table>" + dados.map(([k, v]) => "<tr><th style=\"width:28%\">" + esc(k) + "</th><td>" + esc(v) + "</td></tr>").join("") + "</table>" : "");
  }
  function tabArquivos(S) {
    const rot = { com: "Comunicações", env: "Envolvidos", oco: "Ocorrências" };
    return "<table><tr><th>Arquivo</th><th>Registros</th><th>Codificação</th><th>Código de controle</th><th>SHA-256 do arquivo recebido</th></tr>" +
      Object.keys(rot).map(k => { const a = S.arqs[k]; if (!a) return ""; const ct = a.controle || {};
        return "<tr><td>" + esc(rot[k]) + "<br><span class=\"mono\">" + esc(a.nome) + "</span></td><td>" + a.dados.length + "</td><td>" + esc(a.codificacao) + "</td><td class=\"mono\">" + (ct.codigo ? esc(ct.codigo) + "<br>" + (ct.confere ? "confere" : "não reproduzido pelo MD5") : "ausente") + "</td><td class=\"mono\" style=\"word-break:break-all\">" + esc(ct.sha256 || "") + "</td></tr>"; }).join("") + "</table>";
  }
  function reconciliacao(ds) {
    const t = ds.tot;
    const auto = t.automaticas.reduce((s, c) => s + c.B, 0);
    return [
      ["Soma do campo “total” das comunicações (créditos + débitos)", t.somaA],
      ["Créditos comunicados (entradas efetivas)", t.cred],
      ["Créditos de comunicações automáticas (espécie, sem juízo de suspeição)", auto],
      ["Créditos de comunicações por atipicidade", t.credSuspeitasSemAuto],
      ["Recursos próprios ou neutros (resgates, empréstimos, estornos, devoluções, mesma titularidade)", t.neutros],
      ["Fluxos entre os próprios titulares do RIF", t.entreTit],
      ["Valor potencialmente contado duas vezes (mesma transferência relatada pelas duas contas)", t.duplicado],
      ["Créditos de terceiros nas comunicações por atipicidade", t.credTerceiros]
    ];
  }
  function blocoFund(ids) {
    const ps = ids.map(prec).filter(Boolean);
    return ps.length ? '<p class="pequeno mudo">Fundamentos: ' + ps.map(p => esc(cit(p.id))).join("; ") + ".</p>" : "";
  }

  /* ------------------------------------------------------------------ relatório da defesa */
  function relatorioDefesa(S) {
    const ds = S.ds, t = ds.tot, h = [];
    const n = (x, s, p) => x + " " + (x === 1 ? s : p);
    const tit = [...ds.titulares.values()];
    const crit = ds.inconsistencias.filter(i => i.grav === "critico"), relv = ds.inconsistencias.filter(i => i.grav === "relevante");
    h.push(cabecalho("Relatório técnico da defesa sobre o Relatório de Inteligência Financeira", "Análise dos arquivos estruturados do COAF (Comunicações, Envolvidos e Ocorrências), com reconstrução dos fluxos, reconciliação dos valores e controle de legalidade.", S));

    /* 1 */
    h.push("<h3>1. Objeto e material examinado</h3>");
    h.push(P("O presente relatório examina o RIF" + (S.rif ? " nº " + esc(S.rif) : "") + ", composto por " + n(t.ncom, "comunicação", "comunicações") + " de operações, " + n(t.nenv, "pessoa física ou jurídica envolvida", "pessoas físicas e jurídicas envolvidas") + " e " + n(ds.oco.length, "enquadramento", "enquadramentos") + " nas hipóteses normativas de atipicidade, abrangendo operações realizadas entre " + dBR(t.ini) + " e " + dBR(t.fim) + ". As comunicações dizem respeito a " + n(t.ntit, "titular", "titulares") + " de conta: " + esc(lista(tit.map(T => T.nome + " (" + fmtDoc(T.doc) + ")"))) + "."));
    h.push(P("A análise partiu exclusivamente dos arquivos estruturados encaminhados pelo COAF, lidos integralmente, e não de relatórios de análise ou resumos produzidos a partir deles. Os valores, contrapartes e sentidos dos fluxos foram reconstruídos a partir das seções próprias do relato bancário (“principais remetentes/depositantes” e “principais destinatários”), e não da proximidade entre palavras no texto livre, de modo a evitar a inversão do sentido do dinheiro."));
    h.push(tabArquivos(S));
    h.push(P("Em síntese, o exame recai sobre o material primário do RIF, identificado pelos códigos de controle e pelas impressões digitais dos arquivos acima. Requer-se, por isso, que qualquer conclusão sobre a movimentação financeira dos investigados seja confrontada com esse material, e não com interpretações dele derivadas."));

    /* 2 */
    h.push("<h3>2. Natureza jurídica do RIF e limites de sua utilização</h3>");
    h.push(P("O RIF é produto de inteligência financeira. As comunicações que o compõem são redigidas pelas instituições financeiras a partir de critérios internos de monitoramento, e o COAF não atesta a veracidade material de cada operação comunicada. A própria Nota Técnica CACOP nº 02/2026, do Ministério Público, reconhece que o RIF é peça de natureza indiciária, apta a orientar investigações, mas que não se confunde com extrato bancário, perícia contábil, prova bancária primária ou quebra judicial de sigilo."));
    h.push(P("O mesmo documento reconhece que o relatório de análise produzido pela polícia ou pelo Ministério Público é interpretativo, não pode ser apresentado como fonte primária e deve indicar as bases utilizadas, e que medidas constritivas fundadas exclusivamente no RIF são frágeis, exigindo corroboração documental. Essas premissas, extraídas de documento do próprio órgão acusador, delimitam o valor probatório de tudo o que se segue."));
    h.push(P("As hipóteses de enquadramento indicadas pelos bancos (Carta-Circular BCB 3.542/2012 e Carta-Circular BCB 4.001/2020) descrevem situações que podem configurar indícios a serem avaliados pelo próprio banco, e não condutas criminosas. Nas " + n(t.ncom, "comunicação", "comunicações") + " examinadas, os enquadramentos são formulados como hipóteses, e não como constatações."));
    h.push(P("Por essas razões, requer-se que o RIF seja recebido como mero elemento informativo, insuscetível de, isoladamente, fundamentar juízo de autoria, materialidade ou medida constritiva, e que se exija a produção regular de prova bancária, sob contraditório, para qualquer afirmação sobre a origem ou o destino dos recursos."));
    h.push(blocoFund(["tema990"]));

    /* 3 */
    const integ = ds.inconsistencias.filter(i => i.cat === "Integridade dos arquivos");
    h.push("<h3>3. Integridade e rastreabilidade dos arquivos</h3>");
    if (integ.length) {
      h.push(P("O exame técnico dos arquivos revelou " + n(integ.length, "problema", "problemas") + " de integridade, que comprometem a rastreabilidade do dado financeiro."));
      for (const i of integ) h.push(P("<b>" + esc(i.titulo) + ".</b> " + esc(i.texto)));
    } else h.push(P("Não foram identificados sinais de alteração dos arquivos recebidos. A integridade, contudo, depende da comprovação de que esses arquivos são os mesmos gerados pelo COAF, o que exige a certificação de sua origem."));
    h.push(P("A NT CACOP 02/2026 reconhece que o RIF deve ser preservado em sua forma original e que alteração ou fracionamento sem registro compromete a auditabilidade, devendo ser certificados nos autos a origem, o número do SEI-C, a data, a autoridade solicitante e a forma de recebimento. Trata-se de exigência que decorre, por analogia, dos arts. 158-A a 158-F do Código de Processo Penal."));
    h.push(P("Diante disso, requer-se a requisição ao COAF dos arquivos originais do RIF, acompanhados do código de controle e da certificação de origem, para confronto com os arquivos juntados aos autos" + (integ.some(i => i.grav === "critico") ? ", e, enquanto não demonstrada a integridade, o reconhecimento da quebra da cadeia de custódia do dado financeiro, com a consequente inutilização do material" : "") + "."));

    /* 4 */
    h.push("<h3>4. Reconciliação dos valores</h3>");
    h.push(P("O dado mais repetido sobre um RIF costuma ser o seu “volume”, obtido pela soma do campo total de cada comunicação. Esse número, porém, adiciona os créditos e os débitos da mesma conta, de modo que o mesmo dinheiro é contado quando entra e quando sai. No presente RIF, a soma bruta é de " + brl(t.somaA) + ", enquanto os créditos efetivamente comunicados somam " + brl(t.cred) + " (" + pct(t.cred, t.somaA) + " do valor bruto)."));
    h.push("<table><tr><th>Componente</th><th class=\"num\">Valor</th></tr>" + reconciliacao(ds).map(([k, v]) => "<tr><td>" + esc(k) + "</td><td class=\"num\">" + brl(v) + "</td></tr>").join("") + "</table>");
    h.push(P("Dos créditos comunicados, " + brl(t.neutros) + " correspondem a recursos do próprio titular ou neutros (resgates de aplicação, empréstimos, estornos, devoluções e transferências de mesma titularidade), que não representam ingresso de recursos de terceiros. " + (t.automaticas.length ? n(t.automaticas.length, "comunicação decorre", "comunicações decorrem") + " de critério objetivo de valor ou de espécie (comunicações automáticas), sem qualquer juízo de suspeição do banco. " : "") + (t.duplicado ? "Há, ainda, transferências entre os próprios titulares relatadas tanto pela conta de origem quanto pela de destino, em períodos sobrepostos, que somadas contam o mesmo dinheiro duas vezes (até " + brl(t.duplicado) + "). " : "") + "Feitas essas depurações, os créditos de terceiros nas comunicações por atipicidade somam " + brl(t.credTerceiros) + "."));
    h.push(P("Conclui-se que qualquer referência a “movimentação” de " + brl(t.somaA) + " superdimensiona a realidade financeira retratada no RIF. Requer-se que eventuais referências a valores sejam depuradas na forma acima, e que a apuração de valores seja feita por perícia contábil sobre extratos obtidos regularmente, sob contraditório."));

    /* 5 */
    h.push("<h3>5. Análise por titular</h3>");
    for (const T of tit) {
      const coms = T.coms, cred = coms.reduce((s, c) => s + c.B, 0), neutro = coms.reduce((s, c) => s + c.economia.vNeutro + c.economia.mesmaCred, 0);
      const auto = coms.filter(c => c.automatica);
      const pts = ds.pontos.filter(p => p.idxs.some(i => coms.some(c => c.idx === i)) && p.idxs.length <= coms.length);
      h.push("<h4>" + esc(T.nome) + " (" + fmtDoc(T.doc) + ")</h4>");
      const ocup = [...new Set(coms.map(c => c.relato.ocupacao.replace(/^[\s\-–]+|[\s\-–]+$/g, "").replace(/\s*[-–]\s*/g, ", ")).filter(Boolean))];
      h.push(P(esc(T.nome) + " é titular " + (coms.length === 1 ? "da comunicação " : "das comunicações ") + lista(coms.map(c => String(c.idx))) + (ocup.length ? ", sendo qualificado(a) pelos bancos como " + esc(lista(ocup.map(o => "“" + o + "”"))) : "") + ". Os créditos comunicados somam " + brl(cred) + ", dos quais " + brl(neutro) + " são recursos próprios ou neutros" + (auto.length ? " e " + brl(auto.reduce((s, c) => s + c.B, 0)) + " decorrem de comunicações automáticas" : "") + "."));
      for (const c of coms) {
        const e = c.economia, partes = [];
        if (e.renda) partes.push("renda cadastral de " + brl(e.renda.valor) + (e.renda.data ? " (informada em " + dBR(e.renda.data) + ")" : "") + (e.rendaPeriodo ? ", equivalente a " + brl(e.rendaPeriodo) + " em " + e.meses + " meses" : ""));
        if (e.faturamento) partes.push("faturamento anual declarado de " + brl(e.faturamento.valor) + (e.fatPeriodo ? ", ou " + brl(e.fatPeriodo) + " proporcionalmente ao período" : ""));
        h.push(P("Na comunicação " + c.idx + " (" + esc(c.comunicante) + ", " + dBR(c.ini) + " a " + dBR(c.fim) + (c.automatica ? ", comunicação automática" : "") + "), os créditos somam " + brl(c.B) + " e os débitos " + brl(c.C) + "." + (partes.length ? " O relato registra " + partes.join(" e ") + "." : "") + (c.relato.remetentes.length ? " Principais remetentes: " + esc(lista(c.relato.remetentes.slice(0, 5).map(r => r.nome + " (" + brl(r.valor) + ")"))) + "." : "") + (c.relato.destinatarios.length ? " Principais destinatários: " + esc(lista(c.relato.destinatarios.slice(0, 5).map(r => r.nome + " (" + brl(r.valor) + ")"))) + "." : "")));
      }
      if (pts.length) h.push(P("Elementos favoráveis extraídos do próprio RIF: " + pts.map(p => esc(p.texto)).join(" ")));
      h.push(P("Em síntese, a movimentação atribuída a " + esc(T.nome) + " deve ser lida à luz desses elementos, que o próprio comunicante registrou. Requer-se que nenhuma conclusão sobre incompatibilidade patrimonial seja extraída sem o exame do cadastro atualizado, da renda e da atividade econômica efetivamente exercida."));
    }

    /* 6 */
    h.push("<h3>6. Inconsistências do RIF</h3>");
    const outras = ds.inconsistencias.filter(i => i.cat !== "Integridade dos arquivos");
    if (outras.length) {
      h.push(P("Além dos problemas de integridade já mencionados, o confronto entre os três arquivos e o relato bancário revelou " + n(outras.length, "inconsistência", "inconsistências") + ", das quais " + outras.filter(i => i.grav === "critico").length + " de natureza crítica e " + outras.filter(i => i.grav === "relevante").length + " relevantes."));
      const cats = [...new Set(outras.map(i => i.cat))];
      for (const cat of cats) {
        h.push("<h4>" + esc(cat) + "</h4>");
        for (const i of outras.filter(x => x.cat === cat)) h.push(P("<b>" + esc(i.titulo) + ".</b> " + esc(i.texto)));
      }
      h.push(P("As inconsistências revelam que o RIF não é retrato fiel e seguro das operações, mas compilação de relatos com falhas de identificação, de valores e de correspondência entre arquivos. Requer-se que as informações afetadas sejam desconsideradas como elemento de convicção e que a autoridade esclareça cada divergência apontada."));
    } else h.push(P("Não foram identificadas inconsistências entre os arquivos além das já mencionadas."));

    /* 7 */
    const leg = legalidade(S.legal, ds);
    h.push("<h3>7. Legalidade da obtenção e do compartilhamento</h3>");
    h.push(P("O Supremo Tribunal Federal, no Tema 990, admitiu o compartilhamento de RIFs com os órgãos de persecução sem prévia autorização judicial, mas apenas por comunicações formais, em procedimentos formalmente instaurados e sujeitos a posterior controle jurisdicional. O fluxo inverso, em que a autoridade solicita o relatório ao COAF, recebeu da Terceira Seção do STJ (AgRg no RHC 174.173/RJ) e da Segunda Turma do STF a qualificação de prova ilícita quando ausente decisão judicial, e foi submetido pelo Tema 1.404 a seis requisitos cumulativos."));
    if (leg.length) for (const a of leg) h.push(P("<b>" + esc(a.titulo) + ".</b> " + esc(a.texto) + (a.pedido ? " <i>Providência:</i> " + esc(a.pedido) : "")));
    h.push(P("Os elementos de legalidade dependem de informações que, em regra, não constam dos autos com o RIF. Por isso, requer-se a juntada do pedido de intercâmbio, se houver, do ato de instauração vigente à data do pedido, da declaração de que os alvos figuravam formalmente como investigados e da certificação de origem do RIF, e, constatada qualquer das irregularidades acima, o reconhecimento da ilicitude do RIF e das provas dele derivadas, com o desentranhamento (CPP, art. 157)."));
    h.push(blocoFund(["tema990", "stj-174173", "stf-2t", "tema1404", "sv14"]));

    /* 8 */
    if (S.cmp) h.push(secaoComparativa(S, 8));

    /* requerimentos */
    const k = S.cmp ? 9 : 8;
    h.push("<h3>" + k + ". Requerimentos</h3>");
    const req = [
      "a requisição ao COAF dos arquivos originais do RIF, com o código de controle, e a certificação, nos autos, do número do SEI-C, da data, da autoridade solicitante e da forma de recebimento",
      "a juntada integral do pedido de intercâmbio, se houver, e do ato de instauração do procedimento vigente à data do pedido, com a declaração de que os alvos figuravam formalmente como investigados",
      "o reconhecimento da ilicitude do RIF e das provas dele derivadas, com o desentranhamento, caso constatada qualquer das irregularidades de obtenção apontadas no tópico 7",
      "a depuração dos valores atribuídos aos investigados, com a exclusão dos recursos próprios ou neutros, das comunicações automáticas e das duplicidades, na forma do tópico 4"
    ];
    if (S.cmp) req.push("a retificação ou o desentranhamento do relatório policial quanto às transações não confirmadas no RIF, discriminadas no tópico 8, e a intimação do analista responsável para esclarecer a metodologia empregada");
    req.push("a realização de perícia contábil sobre extratos obtidos regularmente, sob contraditório, com a possibilidade de indicação de assistente técnico", "o acesso integral da defesa a todos os elementos relativos ao RIF, nos termos da Súmula Vinculante 14, sob pena de inutilização do material");
    h.push(P("Diante do exposto, requer-se: " + req.map((r, i) => "(" + (i + 1) + ") " + r).join("; ") + "."));

    /* conclusão */
    h.push("<h3>" + (k + 1) + ". Conclusão</h3>");
    h.push(P("O RIF examinado é material indiciário, produzido a partir de relatos bancários que formulam hipóteses de atipicidade, e não constatações de ilicitude. A reconciliação dos valores demonstra que o “volume” do relatório superdimensiona a movimentação real, que parte relevante dos créditos corresponde a recursos próprios, neutros ou a comunicações automáticas, e que o RIF contém " + n(crit.length, "inconsistência crítica", "inconsistências críticas") + " e " + n(relv.length, "relevante", "relevantes") + "." + (S.cmp ? " O confronto com o relatório policial revelou que " + S.cmp.verif.filter(v => v.status !== "confirmada").length + " das " + S.cmp.verif.length + " transações nele afirmadas não encontram respaldo fiel no RIF." : "")));
    h.push(P("Por essas razões, o RIF não autoriza, por si, conclusão sobre a prática de crime, e sua utilização deve ser precedida do controle de legalidade e da produção de prova bancária regular, sob contraditório."));
    h.push('<p class="pequeno mudo">Relatório gerado pela ferramenta RIF Defesa do HUB Criminal TPC, com processamento local dos arquivos. As sínteses de precedentes destinam-se à orientação; confira o inteiro teor antes de citar.</p>');
    return h.join("\n");
  }

  /* ------------------------------------------------------------------ confronto com o relatório policial */
  const ORDEM_ST = { "sentido invertido": 0, "não é transação": 1, "sem lastro": 2, "valor divergente": 3, "automática": 4, "confirmada": 5 };
  function secaoComparativa(S, num) {
    const ds = S.ds, r = S.cmp, h = [];
    const ruins = r.verif.filter(v => v.status !== "confirmada").sort((a, b) => ORDEM_ST[a.status] - ORDEM_ST[b.status] || b.row.valor - a.row.valor);
    const porSt = {}; for (const v of r.verif) porSt[v.status] = (porSt[v.status] || 0) + 1;
    h.push("<h3>" + num + ". Confronto com o relatório policial</h3>");
    h.push(P("O relatório policial" + (S.rel ? " (" + esc(S.rel.nome) + ", SHA-256 " + esc((S.rel.sha256 || "").slice(0, 16)) + "…)" : "") + " foi lido integralmente, e cada transação nele afirmada foi verificada contra o relato bancário da comunicação indicada como fonte. " + (r.linhas.length ? "Das " + r.linhas.length + " transações relacionadas (" + brl(r.vTot) + "), " + (porSt["confirmada"] || 0) + " foram confirmadas e " + ruins.length + " apresentam problema, somando " + brl(r.vRuim) + "." : "Não foi possível reconstruir a tabela de transações do relatório; os achados abaixo decorrem da leitura do texto.")));
    if (ruins.length) {
      h.push("<table><tr><th>#</th><th>Pág.</th><th>Origem → destino (relatório)</th><th class=\"num\">Valor</th><th>Com.</th><th>Situação no RIF</th></tr>" +
        ruins.map(v => "<tr><td>" + v.row.n + "</td><td>" + v.row.pagina + "</td><td>" + esc(v.row.origem.nome) + " → " + esc(v.row.destino.nome) + "</td><td class=\"num\">" + brl(v.row.valor) + "</td><td>" + (v.row.com || "") + "</td><td><b>" + esc(v.status) + "</b><br>" + esc((v.achados[0] || {}).texto || "") + "</td></tr>").join("") + "</table>");
    }
    for (const a of r.achados) h.push(P("<b>" + esc(a.titulo) + ".</b> " + esc(a.texto)));
    h.push(P("O relatório policial, que a própria NT CACOP 02/2026 reconhece ser interpretativo e insuscetível de apresentação como fonte primária, contém afirmações que não correspondem ao RIF que lhe serve de base. Requer-se a retificação do relatório ou o seu desentranhamento quanto às transações não confirmadas, e a intimação do analista responsável para indicar, transação por transação, a base documental utilizada."));
    return h.join("\n");
  }

  function relatorioComparativo(S) {
    const h = [];
    h.push(cabecalho("Relatório comparativo: relatório policial × RIF", "Verificação, transação por transação, das afirmações do relatório policial contra os arquivos estruturados do COAF.", S));
    h.push("<h3>1. Material confrontado</h3>");
    h.push(P("Confrontaram-se o relatório policial" + (S.rel ? " “" + esc(S.rel.nome) + "” (" + S.rel.paginas.length + " páginas" + (S.rel.paginas.some(p => p.ocr) ? ", parte delas lida por OCR" : "") + ")" : "") + " e os arquivos do RIF" + (S.rif ? " nº " + esc(S.rif) : "") + ". A verificação considerou, para cada linha da tabela de transações do relatório, a comunicação indicada como fonte, as partes, o sentido e o valor."));
    h.push(tabArquivos(S));
    h.push(secaoComparativa(S, 2));
    const r = S.cmp;
    if (r.alvos.length) {
      h.push("<h3>3. Alvos definidos pelo relatório</h3>");
      h.push("<table><tr><th>Nome</th><th>CPF/CNPJ</th><th class=\"num\">Entradas (relatório)</th><th class=\"num\">Recursos próprios ou neutros (RIF)</th><th>Fundamento indicado</th></tr>" + r.alvos.map(a => { const T = S.ds.titulares.get(a.doc); const neu = T ? T.coms.reduce((s, c) => s + c.economia.vNeutro + c.economia.mesmaCred, 0) : 0; return "<tr><td>" + esc(a.nome) + "</td><td class=\"mono\">" + fmtDoc(a.doc) + "</td><td class=\"num\">" + brl(a.entradas) + "</td><td class=\"num\">" + (T ? brl(neu) : "não é titular") + "</td><td>" + esc(a.fundamento) + "</td></tr>"; }).join("") + "</table>");
      h.push(P("A eleição de alvos por medida de centralidade em grafo, sem indicação de conduta concreta, não atende ao dever de fundamentação. Requer-se que a autoridade indique, para cada alvo, os fatos concretos que justificam a sua inclusão."));
    }
    h.push("<h3>" + (r.alvos.length ? 4 : 3) + ". Conclusão</h3>");
    h.push(P("O confronto evidencia que o relatório policial não reproduz fielmente o RIF: " + (r.vRuim ? brl(r.vRuim) + " em transações afirmadas não encontram correspondência exata no relato bancário" : "não foram identificadas divergências de valores nas transações") + (r.dupl.length ? ", e há transferências contadas duas vezes" : "") + ". Requer-se, por isso, a retificação ou o desentranhamento do relatório quanto aos pontos indicados, e que eventual juízo sobre os fatos se apoie diretamente no material primário e em prova bancária regular."));
    h.push('<p class="pequeno mudo">Relatório gerado pela ferramenta RIF Defesa do HUB Criminal TPC, com processamento local dos arquivos.</p>');
    return h.join("\n");
  }

  /* ------------------------------------------------------------------ exportação */
  function exportarDoc(html, nome) {
    const doc = '<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40"><head><meta charset="utf-8"><title>' + esc(nome) + '</title><style>body{font-family:Calibri,Arial,sans-serif;font-size:11pt;line-height:1.4}h2{font-family:"Segoe UI Semibold",Calibri;font-size:14pt}h3{font-family:"Segoe UI Semibold",Calibri;font-size:12pt;margin-top:18pt;text-transform:uppercase}h4{font-size:11pt}p{text-align:justify;margin:0 0 10pt}table{border-collapse:collapse;width:100%;margin:6pt 0 12pt}td,th{border:1px solid #bbb;padding:4pt 6pt;font-size:9.5pt;vertical-align:top;text-align:left}th{background:#f2f2f2}.num{text-align:right;font-family:Consolas,monospace}.mono{font-family:Consolas,monospace;font-size:8.5pt}.mudo{color:#666}.pequeno{font-size:9pt}.rel-cab{border-bottom:3pt solid #F5EF90;padding-bottom:6pt;margin-bottom:12pt}.marca-tpc{border:1.5pt solid #C8C3BB;padding:0 4pt;font-weight:bold}</style></head><body>' + html + "</body></html>";
    const blob = new Blob(["﻿", doc], { type: "application/msword" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = nome + ".doc"; document.body.appendChild(a); a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  }

  root.RIF_RELATORIO = { legalidade, relatorioDefesa, relatorioComparativo, exportarDoc, reconciliacao, MODALIDADES, PROCEDIMENTOS, cit };
})(typeof window !== "undefined" ? window : globalThis);
