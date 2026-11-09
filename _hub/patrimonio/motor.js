/* Diagnóstico patrimonial e sucessório: cálculos verificáveis e relatório por regras.
   Todos os números saem das premissas exibidas na tela (editáveis); nada é estimado por IA. As regras refletem a
   legislação vigente em novembro de 2026 e as pendências estão sinalizadas como riscos:
   ITCMD em MG: Lei 14.941/2003, alíquota única de 5% (art. 10); LC 227/2026 (progressividade obrigatória até o teto de
   8% e base das quotas não negociadas pelo patrimônio líquido ajustado a mercado, dependente de lei estadual);
   IBS e CBS na locação: LC 214/2025, arts. 251 (pessoa física contribuinte), 260 (redutor social de R$ 600 por mês e
   por imóvel residencial) e 261 (redução de 70%); transição: CBS em 2027 e IBS escalonado de 2029 a 2033;
   Lucro presumido: Lei 9.249/1995 (presunção de 32% na locação) e LC 224/2025 (acréscimo de 10% na parcela da receita
   acima de R$ 5 milhões); dividendos: Lei 15.270/2025 (retenção de 10% acima de R$ 50 mil mensais e IRPF mínimo);
   ITBI na integralização: CF, art. 156, § 2º, I, Tema 796 e Tema 1.348 do STF (pendente);
   previdência: Tema 1.214 do STF (não incidência do ITCMD sobre VGBL e PGBL). */
(function (root) {
  "use strict";
  const num = v => { if (typeof v === "number") return isFinite(v) ? v : 0; const s = String(v == null ? "" : v).replace(/[^\d,.-]/g, ""); if (!s) return 0; const n = parseFloat(s.includes(",") ? s.replace(/\./g, "").replace(",", ".") : /^-?\d{1,3}(\.\d{3})+$/.test(s) ? s.replace(/\./g, "") : s); return isFinite(n) ? n : 0; };
  const brl = v => (v < 0 ? "-" : "") + "R$ " + Math.round(Math.abs(v)).toLocaleString("pt-BR");
  const pct = (v, c) => (+v).toLocaleString("pt-BR", { maximumFractionDigits: c == null ? 2 : c }) + "%";
  const soma = (l, f) => l.reduce((a, x) => a + f(x), 0);

  const PREMISSAS = {
    itcmd: { r: "Alíquota atual do ITCMD (%)", v: 5, dica: "MG: 5% (Lei 14.941/2003, art. 10)" },
    itcmdFuturo: { r: "Alíquota futura no cenário progressivo (%)", v: 8, dica: "Teto do Senado (Res. 9/1992) e da LC 227/2026" },
    honorarios: { r: "Honorários do inventário (% do monte)", v: 6, dica: "Referência de mercado; ajuste ao caso" },
    custas: { r: "Custas, emolumentos e avaliações (% do monte)", v: 2, dica: "Taxa judiciária, escritura, registros e laudos" },
    itbi: { r: "Alíquota do ITBI municipal (%)", v: 3, dica: "Belo Horizonte: 3%" },
    ivaRef: { r: "Alíquota de referência IBS + CBS (%)", v: 26.5, dica: "Estimativa oficial; a efetiva será fixada pelo Senado" },
    constituicao: { r: "Constituição da holding e atos de doação (R$)", v: 25000, dica: "Honorários, registros e escrituras" },
    manutencao: { r: "Contabilidade e manutenção da holding (R$ por mês)", v: 1800, dica: "" }
  };
  const OBJETIVOS = [
    ["custo", "Reduzir o custo da sucessão"], ["inventario", "Evitar o inventário e a indisponibilidade dos bens"],
    ["alugueis", "Eficiência na tributação dos aluguéis"], ["protecao", "Proteção patrimonial"],
    ["empresa", "Sucessão e governança da empresa familiar"], ["casamento", "Proteger o patrimônio do casamento dos herdeiros"],
    ["liquidez", "Liquidez para a sucessão"], ["venda", "Venda futura de imóveis"], ["conflitos", "Prevenir conflitos entre herdeiros"]
  ];
  const REGIMES = ["Comunhão parcial", "Comunhão universal", "Separação convencional", "Separação obrigatória", "Participação final nos aquestos", "União estável (comunhão parcial)", "Solteiro(a)", "Divorciado(a)", "Viúvo(a)"];

  /* IRPF mensal: tabela vigente desde maio de 2025 e redutor da Lei 15.270/2025 (a partir de janeiro de 2026). */
  function irMensal(b) {
    const F = [[2428.8, 0, 0], [2826.65, 0.075, 182.16], [3751.05, 0.15, 394.16], [4664.68, 0.225, 675.49], [Infinity, 0.275, 908.73]];
    const f = F.find(x => b <= x[0]); let ir = Math.max(0, b * f[1] - f[2]);
    if (b <= 5000) ir = Math.max(0, ir - 312.89); else if (b <= 7350) ir = Math.max(0, ir - (978.62 - 0.133145 * b));
    return ir;
  }

  /* Fator da transição do IBS e da CBS sobre a carga plena: 2027 e 2028 só a CBS (cerca de 8,8 dos 26,5 pontos);
     2029 a 2032 a CBS e 10%, 20%, 30% e 40% do IBS; 2033 em diante, a carga plena. */
  const FASES = [
    { id: "2026", rot: "2026 (regime atual)", fator: 0 },
    { id: "2027", rot: "2027 e 2028 (CBS)", fator: 8.8 / 26.5 },
    { id: "2033", rot: "2033 em diante (IBS e CBS plenos)", fator: 1 }
  ];

  function premissas(p) { const o = {}; Object.keys(PREMISSAS).forEach(k => { o[k] = p && p[k] !== "" && p[k] != null ? num(p[k]) : PREMISSAS[k].v; }); return o; }

  function calcular(d) {
    const P = premissas(d.prem), r = { P };
    const im = (d.imoveis || []).filter(x => x.desc || num(x.mercado) || num(x.irpf)).map(x => {
      const irpf = num(x.irpf), mercado = num(x.mercado) || irpf, aluguel = /sim|parcial/.test(x.alugado || "") ? num(x.aluguel) : 0;
      return Object.assign({}, x, { irpf, mercado, aluguel, ganho: Math.max(0, mercado - irpf), residencial: /resid/i.test(x.tipo || ""), propria: /família/i.test(x.tipo || "") });
    });
    const emp = (d.empresas || []).filter(x => x.nome || num(x.pl) || num(x.mercado)).map(x => {
      const pl = num(x.pl), mercado = num(x.mercado) || pl;
      return Object.assign({}, x, { pl, mercado, faturamento: num(x.faturamento), dividendos: num(x.dividendos), valorDividas: num(x.valorDividas), participacao: num(x.participacao) });
    });
    const f = d.fin || {}, fin = { aplicacoes: num(f.aplicacoes), previdencia: num(f.previdencia), exterior: num(f.exterior), outros: num(f.outros), dividas: num(f.dividas) };
    r.im = im; r.emp = emp; r.fin = fin;
    r.tot = {
      imIrpf: soma(im, x => x.irpf), imMercado: soma(im, x => x.mercado), empPl: soma(emp, x => x.pl), empMercado: soma(emp, x => x.mercado),
      aplicacoes: fin.aplicacoes, previdencia: fin.previdencia, exterior: fin.exterior, outros: fin.outros, dividas: fin.dividas
    };
    const t = r.tot;
    t.bruto = t.imMercado + t.empMercado + t.aplicacoes + t.previdencia + t.exterior + t.outros;
    t.declarado = t.imIrpf + t.empPl + t.aplicacoes + t.previdencia + t.exterior + t.outros;
    t.liquido = t.bruto - t.dividas;
    r.composicao = [["Imóveis", t.imMercado], ["Participações societárias", t.empMercado], ["Aplicações financeiras", t.aplicacoes], ["Previdência privada", t.previdencia], ["Bens no exterior", t.exterior], ["Outros bens", t.outros]].filter(x => x[1] > 0).map(([n, v]) => ({ n, v, p: t.bruto ? v / t.bruto * 100 : 0 }));

    /* Sucessão sem planejamento: ITCMD sobre o valor de mercado (previdência excluída, Tema 1.214 do STF), honorários e custas. */
    const monte = Math.max(0, t.bruto - t.previdencia - t.dividas);
    const s = r.semPlan = { monte, itcmd: monte * P.itcmd / 100, itcmdFuturo: monte * P.itcmdFuturo / 100, honorarios: monte * P.honorarios / 100, custas: monte * P.custas / 100 };
    s.total = s.itcmd + s.honorarios + s.custas; s.totalFuturo = s.itcmdFuturo + s.honorarios + s.custas;
    s.liquidez = t.aplicacoes + t.previdencia; s.falta = Math.max(0, s.total - s.liquidez);
    r.ganhoLatente = soma(im, x => x.ganho); r.irGanhoLatente = r.ganhoLatente * 0.15;

    /* Aluguéis: pessoa física x holding no lucro presumido, em três momentos da transição. */
    const alug = im.filter(x => x.aluguel > 0), R = soma(alug, x => x.aluguel) * 12;
    const redutorSocial = soma(alug.filter(x => x.residencial || x.propria), () => 600 * 12);
    const outras = num((d.casal || {}).outrasRendas);
    const titulares = /comunh|uni[aã]o|aquestos/i.test((d.casal || {}).regime || "") && (d.casal || {}).matriarca && (d.casal || {}).patriarca ? 2 : 1;
    const irPF = R ? (irMensal(outras + R / 12 / titulares) - irMensal(outras)) * 12 * titulares : 0;
    const pfContribuinte = R > 240000 && im.length > 3;
    const iva = (base, fator) => Math.max(0, base) * P.ivaRef / 100 * 0.3 * fator;
    const presumido = R => { const base = 0.32 * Math.min(R, 5e6) + 0.352 * Math.max(0, R - 5e6); return { irpj: 0.15 * base + 0.10 * Math.max(0, base - 240000), csll: 0.09 * base }; };
    const pj = presumido(R), manut = P.manutencao * 12;
    r.alugueis = {
      receita: R, imoveis: alug.length, redutorSocial, pfContribuinte, titulares, outras,
      fases: FASES.map(fs => {
        const ivaPF = fs.fator && pfContribuinte ? iva(R - redutorSocial, fs.fator) : 0;
        const pisCofins = fs.id === "2026" ? R * 0.0365 : 0, ivaPJ = fs.fator ? iva(R - redutorSocial, fs.fator) : 0;
        const pf = irPF + ivaPF, pjT = pj.irpj + pj.csll + pisCofins + ivaPJ;
        return { fase: fs, irPF, ivaPF, pf, irpj: pj.irpj, csll: pj.csll, pisCofins, ivaPJ, pj: pjT, pjManut: pjT + manut, economia: pf - pjT - manut };
      })
    };
    const lucroPJ = R - r.alugueis.fases[0].pj - manut;
    r.alugueis.dividendoMensal = R ? Math.max(0, lucroPJ) / 12 / titulares : 0;
    r.alugueis.retencao = r.alugueis.dividendoMensal > 50000;
    r.alugueis.efetivaPF = R ? irPF / R * 100 : 0; r.alugueis.efetivaPJ = R ? r.alugueis.fases[0].pj / R * 100 : 0;

    /* Holding patrimonial e doação das quotas com reserva de usufruto. */
    const imH = im, baseCont = soma(imH, x => x.irpf), baseMerc = soma(imH, x => x.mercado);
    const h = r.holding = { imoveis: imH.length, baseCont, baseMerc, itbi: baseMerc * P.itbi / 100, itcmdCont: baseCont * P.itcmd / 100, itcmdMerc: baseMerc * P.itcmd / 100, constituicao: P.constituicao, manutAno: manut };
    h.evitaInventario = baseMerc * (P.honorarios + P.custas) / 100;
    h.custoHoje = h.itcmdMerc + h.constituicao; h.custoHojeCont = h.itcmdCont + h.constituicao;
    h.semPlanMesmosBens = baseMerc * (P.itcmd + P.honorarios + P.custas) / 100; h.semPlanMesmosBensFuturo = baseMerc * (P.itcmdFuturo + P.honorarios + P.custas) / 100;
    h.economia = h.semPlanMesmosBens - h.custoHoje; h.economiaFuturo = h.semPlanMesmosBensFuturo - h.custoHoje;
    h.preponderancia = R > 0;

    r.cenarios = [
      { n: "Sem planejamento (alíquota atual)", sucessao: s.total, obs: "Inventário com ITCMD de " + pct(P.itcmd) + ", honorários e custas sobre o monte" },
      { n: "Sem planejamento (alíquota progressiva)", sucessao: s.totalFuturo, obs: "Mesmo inventário, se a alíquota máxima de " + pct(P.itcmdFuturo) + " for adotada" },
      { n: "Holding com doação das quotas", sucessao: h.custoHoje + Math.max(0, s.total - h.semPlanMesmosBens), obs: "ITCMD antecipado sobre os imóveis a valor de mercado e inventário apenas do restante" },
      { n: "Holding com base contábil", sucessao: h.custoHojeCont + Math.max(0, s.total - h.semPlanMesmosBens), obs: "Se aceita a base pelo valor declarado, enquanto a lei mineira não adequar a base à LC 227/2026" }
    ];

    r.familia = familia(d);
    r.riscos = riscos(d, r);
    r.acoes = acoes(d, r);
    return r;
  }

  function familia(d) {
    const c = d.casal || {}, reg = c.regime || "", filhos = (d.filhos || []).filter(x => x.nome);
    const casado = !!(c.patriarca && c.matriarca) && !/solteir|divorc|viúv/i.test(reg);
    let meacao = "", concorrencia = "";
    if (!casado) { meacao = "Não há meação a considerar: o patrimônio integra, em sua totalidade, a herança do titular."; concorrencia = "Os descendentes herdam a totalidade, em partes iguais (CC, art. 1.829, I, e art. 1.835)."; }
    else if (/universal/i.test(reg)) { meacao = "No regime da comunhão universal, o cônjuge sobrevivente é meeiro de todo o patrimônio comum (CC, art. 1.667), de modo que a herança recai sobre a metade do falecido."; concorrencia = "O cônjuge casado na comunhão universal não concorre com os descendentes (CC, art. 1.829, I): a herança cabe integralmente aos filhos."; }
    else if (/obrigat/i.test(reg)) { meacao = "Na separação obrigatória, não há meação legal, ressalvada a comunicação dos aquestos pelo esforço comum (Súmula 377 do STF, afastável por pacto, conforme o Tema 1.236 do STF)."; concorrencia = "O cônjuge casado na separação obrigatória não concorre com os descendentes (CC, art. 1.829, I)."; }
    else if (/convencional/i.test(reg)) { meacao = "Na separação convencional, não há meação: cada cônjuge é titular exclusivo de seus bens (CC, art. 1.687)."; concorrencia = "O cônjuge casado na separação convencional concorre com os descendentes sobre toda a herança (CC, art. 1.829, I, conforme a jurisprudência do STJ), o que amplia o número de herdeiros sobre o patrimônio."; }
    else { meacao = "Na comunhão parcial" + (/uni[aã]o/i.test(reg) ? ", aplicável à união estável na falta de contrato escrito (CC, art. 1.725)," : ",") + " o cônjuge sobrevivente é meeiro dos bens adquiridos onerosamente na constância da união (CC, art. 1.658), e a herança recai sobre a metade do falecido e sobre os seus bens particulares."; concorrencia = "O cônjuge concorre com os descendentes apenas sobre os bens particulares do falecido (CC, art. 1.829, I), ponto que exige o levantamento da origem de cada bem."; }
    if (/uni[aã]o/i.test(reg)) concorrencia += " O companheiro tem os mesmos direitos sucessórios do cônjuge (Temas 498 e 809 do STF).";
    const alertas = [];
    filhos.forEach(fl => {
      if (/universal/i.test(fl.regime || "")) alertas.push(fl.nome + " é casado(a) na comunhão universal: bens herdados ou doados sem cláusula de incomunicabilidade passam a integrar a comunhão (CC, art. 1.667 e art. 1.668, I).");
      else if (/parcial|uni[aã]o/i.test(fl.regime || "")) alertas.push(fl.nome + " vive em comunhão parcial ou união estável: os bens herdados ou doados não se comunicam (CC, art. 1.659, I), mas os frutos, como aluguéis e dividendos, comunicam-se (CC, art. 1.660, V).");
      if (/sim/i.test(fl.incapaz || "")) alertas.push(fl.nome + " é herdeiro incapaz ou com deficiência: o inventário tende a exigir a via judicial e a intervenção do Ministério Público, e convém estruturar a administração dos bens que lhe couberem.");
    });
    return { casado, meacao, concorrencia, filhos, alertas, legitima: "Metade do patrimônio do titular constitui a legítima dos herdeiros necessários (CC, arts. 1.789 e 1.846); a outra metade é disponível e pode ser destinada por testamento ou doação, sem prejuízo da colação das doações aos descendentes (CC, art. 2.002)." };
  }

  function riscos(d, r) {
    const o = [], sit = d.sit || {}, P = r.P;
    if (r.holding.imoveis && r.holding.preponderancia) o.push({ n: "elevado", t: "ITBI na integralização dos imóveis", x: "A holding que tem a locação como atividade preponderante pode ter negada a imunidade do art. 156, § 2º, I, da Constituição. O Tema 796 do STF limitou a imunidade ao valor do capital integralizado, e o Tema 1.348, que decidirá a situação das empresas de atividade imobiliária, está pendente, com cinco votos favoráveis à imunidade e pedido de vista na última notícia do julgamento. A contingência estimada é de " + brl(r.holding.itbi) + "." });
    if (r.holding.imoveis) o.push({ n: "moderado", t: "Base de cálculo das quotas", x: "A LC 227/2026 determina que as quotas não negociadas sejam avaliadas, no mínimo, pelo patrimônio líquido ajustado a valor de mercado. Enquanto a lei mineira não for adequada, a base contábil ainda é praticada, mas a diferença de " + brl(r.holding.itcmdMerc - r.holding.itcmdCont) + " no imposto pode ser exigida, e a vantagem tende a desaparecer." });
    o.push({ n: "moderado", t: "Progressividade do ITCMD", x: "A LC 227/2026 tornou obrigatória a progressividade, e projeto de lei com tabela progressiva tramita na Assembleia de Minas Gerais. No teto de " + pct(P.itcmdFuturo) + ", o custo da sucessão sem planejamento passaria de " + brl(r.semPlan.total) + " para " + brl(r.semPlan.totalFuturo) + ", com a observância da anterioridade." });
    if (r.semPlan.falta > 0) o.push({ n: "elevado", t: "Liquidez para a sucessão", x: "Os recursos líquidos (" + brl(r.semPlan.liquidez) + ") não cobrem o custo estimado do inventário (" + brl(r.semPlan.total) + "). Faltariam cerca de " + brl(r.semPlan.falta) + ", o que, na prática, força a venda de bens em condições desfavoráveis ou o endividamento dos herdeiros." });
    const comDivida = r.emp.filter(x => /sim/i.test(x.dividas || ""));
    if (comDivida.length || r.tot.dividas > 0 || /sim/i.test(sit.riscoProfissional || "")) o.push({ n: "elevado", t: "Credores e responsabilidade pessoal", x: "Há dívidas" + (comDivida.length ? (comDivida.length === 1 ? " na empresa " : " nas empresas ") + comDivida.map(x => x.nome.replace(/\.$/, "")).join(", ") : "") + (r.tot.dividas > 0 ? (comDivida.length ? " e" : "") + " pessoais de " + brl(r.tot.dividas) : "") + (/sim/i.test(sit.riscoProfissional || "") ? (comDivida.length || r.tot.dividas ? ", além de" : "") + " atividade profissional com responsabilidade pessoal" : "") + ". A transferência de bens com dívidas já existentes pode ser declarada ineficaz como fraude contra credores ou à execução (CC, art. 158; CPC, art. 792), e a holding não afasta a desconsideração da personalidade jurídica (CC, art. 50). O planejamento deve ser feito com patrimônio livre e documentação da finalidade legítima." });
    if (r.alugueis.retencao) o.push({ n: "moderado", t: "Tributação dos dividendos", x: "A distribuição estimada de " + brl(r.alugueis.dividendoMensal) + " mensais por sócio supera R$ 50 mil, sujeitando-se à retenção de 10% (Lei 15.270/2025), compensável no ajuste do IRPF mínimo. A Lei 15.270/2025 é questionada no STF (ADIs 7.912, 7.914, 7.917 e 7.954)." });
    if (r.alugueis.receita > 5e6) o.push({ n: "moderado", t: "Acréscimo da presunção no lucro presumido", x: "A receita de locação supera R$ 5 milhões, e a parcela excedente sofre o acréscimo de 10% na presunção (LC 224/2025), objeto de questionamento judicial." });
    if (r.alugueis.pfContribuinte) o.push({ n: "moderado", t: "Pessoa física contribuinte do IBS e da CBS", x: "Com receita anual de locação acima de R$ 240 mil e mais de três imóveis, a pessoa física passa a ser contribuinte do IBS e da CBS (LC 214/2025, art. 251), com as obrigações acessórias correspondentes." });
    if (/sim/i.test(sit.conflitos || "") || /sim/i.test(sit.outraUniao || "")) o.push({ n: "elevado", t: "Litigiosidade sucessória", x: "A existência de " + [/sim/i.test(sit.conflitos || "") ? "divergências familiares" : "", /sim/i.test(sit.outraUniao || "") ? "herdeiros de outra relação" : ""].filter(Boolean).join(" e ") + " aumenta o risco de inventário litigioso, longo e custoso, com bens indisponíveis e decisões tomadas por terceiros." });
    const comOnus = r.im.filter(x => x.onus && !/^nenhum/i.test(x.onus));
    if (comOnus.length) { const grave = comOnus.some(x => /penhora|arresto|sequestro|indisponib|arrolamento|a[çc][ãa]o/i.test(x.onus)); o.push({ n: grave ? "elevado" : "moderado", t: "Ônus e restrições registrados nos imóveis", x: "As matrículas indicam " + comOnus.map(x => (x.desc || "imóvel").split(",")[0] + ": " + x.onus).join("; ") + ". " + (grave ? "A existência de constrição judicial ou fiscal pode tornar a integralização ou a doação ineficaz perante o credor (CPC, art. 792; CTN, art. 185), de modo que a regularização deve preceder qualquer transferência." : "Os ônus acompanham o imóvel na integralização ou na doação e exigem, conforme o caso, a anuência do credor e o ajuste das cláusulas do planejamento.") }); }
    if (r.tot.exterior > 0) o.push({ n: "moderado", t: "Bens no exterior", x: "Os bens no exterior exigem atenção à tributação anual das aplicações e das entidades controladas (Lei 14.754/2023), à incidência do ITCMD sobre bens e doadores no exterior, agora disciplinada pela LC 227/2026, e à eventual necessidade de inventário no país de situação dos bens." });
    o.forEach(x => { x.x = x.x.replace(/\.{2,}/g, "."); });
    return o;
  }

  function acoes(d, r) {
    const o = [], sit = d.sit || {}, ob = d.objetivos || [], h = r.holding, a = r.alugueis;
    if (r.tot.dividas > 0 || r.emp.some(x => /sim/i.test(x.dividas || ""))) o.push({ p: 1, t: "Mapear o passivo antes de qualquer transferência", x: "Levantar dívidas, garantias e processos em curso, com certidões, para afastar a alegação de fraude e definir quais bens podem ser transferidos com segurança." });
    if (h.imoveis && (h.economia > 0 || ob.includes("inventario") || ob.includes("custo"))) o.push({ p: 1, t: "Constituir holding patrimonial e integralizar os imóveis pelo valor declarado", x: "A integralização pelo valor do IRPF evita o ganho de capital (Lei 9.249/1995, art. 23). Antes, avaliar o ITBI diante do Tema 1.348 do STF e, se for o caso, requerer o reconhecimento da imunidade ao Município." });
    if (h.imoveis) o.push({ p: 1, t: "Doar as quotas aos filhos com reserva de usufruto e cláusulas protetivas", x: "Usufruto vitalício e direitos políticos com os doadores, cláusulas de incomunicabilidade, impenhorabilidade e inalienabilidade (CC, art. 1.911), reversão (CC, art. 547) e dispensa ou não de colação, conforme o desenho familiar. Economia estimada frente ao inventário dos mesmos bens: " + brl(h.economia) + " na alíquota atual e " + brl(h.economiaFuturo) + " no cenário progressivo." });
    if (a.receita && a.fases[2].economia > 0) o.push({ p: 2, t: "Concentrar a locação na holding", x: "Na projeção para 2033, a tributação dos aluguéis na holding, já com a manutenção, fica " + brl(a.fases[2].economia) + " por ano abaixo da pessoa física. Em 2026, a diferença é de " + brl(a.fases[0].economia) + "." });
    if (!/sim/i.test(sit.testamento || "")) o.push({ p: 2, t: "Elaborar testamento", x: "O testamento organiza a parte disponível, os bens que permanecem fora da holding e as disposições pessoais, e reduz o espaço de conflito." });
    if (r.emp.length) o.push({ p: 2, t: "Firmar acordo de sócios e protocolo familiar", x: "Regras de entrada, saída, administração, distribuição de lucros e sucessão na gestão das empresas" + (/não|indef/i.test(sit.sucessorEmpresa || "") ? ", com plano de sucessão na gestão, ainda indefinida" : "") + "." });
    if (r.semPlan.falta > 0 || ob.includes("liquidez")) o.push({ p: 2, t: "Formar reserva de liquidez sucessória", x: "Previdência privada (fora do inventário e sem ITCMD, Tema 1.214 do STF) ou seguro de vida com beneficiários definidos, para cobrir o custo residual da sucessão." });
    if (r.familia.filhos.some(x => /universal|parcial|uni[aã]o/i.test(x.regime || ""))) o.push({ p: 2, t: "Revisar os regimes de bens dos herdeiros", x: "Cláusula de incomunicabilidade nas doações e, quando oportuno, pacto antenupcial ou contrato de união estável dos herdeiros." });
    const comOnusA = r.im.filter(x => x.onus && /penhora|arresto|sequestro|indisponib|arrolamento|a[çc][ãa]o/i.test(x.onus));
    if (comOnusA.length) o.push({ p: 1, t: "Regularizar as constrições registradas nas matrículas", x: "Levantar a origem e o valor das constrições em " + comOnusA.map(x => (x.desc || "imóvel").split(",")[0]).join(", ") + " e obter a baixa, a substituição da garantia ou a anuência do credor antes de integralizar ou doar esses imóveis." });
    if (r.tot.exterior > 0) o.push({ p: 3, t: "Organizar os bens no exterior", x: "Revisar a estrutura diante da Lei 14.754/2023 e da LC 227/2026 e avaliar instrumentos que evitem inventário no exterior." });
    if (r.ganhoLatente > 0 && (d.objetivos || []).includes("venda")) o.push({ p: 3, t: "Planejar a venda dos imóveis", x: "O ganho de capital latente é de " + brl(r.ganhoLatente) + " (imposto estimado de " + brl(r.irGanhoLatente) + " na pessoa física, à alíquota inicial de 15%). A venda pela holding segue a tributação da pessoa jurídica e deve ser simulada antes da integralização." });
    return o.sort((x, y) => x.p - y.p);
  }

  /* ------------------------------------------------------------------ relatório por regras (blocos do TPC_PECA) */
  function relatorio(d, r, opc) {
    opc = opc || {};
    const b = [], c = d.cliente || {}, cs = d.casal || {}, P = r.P, t = r.tot, s = r.semPlan, h = r.holding, a = r.alugueis, fam = r.familia;
    const nome = c.nome || cs.patriarca || cs.matriarca || "Família";
    const limpa = x => typeof x === "string" ? x.replace(/\.{2,}/g, ".") : x.map(([t, e]) => [t.replace(/\.{2,}/g, "."), e]);
    const p = x => b.push({ t: "p", r: limpa(x) }), H = x => b.push({ t: "h", texto: x }), sub = x => b.push({ t: "sub", texto: x });
    b.push({ t: "tit", texto: "DIAGNÓSTICO PATRIMONIAL E SUCESSÓRIO" });
    b.push({ t: "tab", larg: [1.2, 2.8], linhas: [["Cliente", nome], ["Núcleo familiar", [cs.patriarca, cs.matriarca].filter(Boolean).join(" e ") + (fam.filhos.length ? ", com " + fam.filhos.length + (fam.filhos.length === 1 ? " filho" : " filhos") : "") || "não informado"], ["Domicílio", [c.cidade, c.uf].filter(Boolean).join("/") || "não informado"], ["Data", opc.dataTexto || ""]] });

    H("I. Apresentação");
    p("Este diagnóstico examina a estrutura patrimonial de " + nome + " sob as perspectivas sucessória, tributária, societária e de proteção patrimonial, com o objetivo de quantificar o custo da transmissão do patrimônio no modelo atual e avaliar as alternativas legítimas de organização, à luz da legislação vigente e das mudanças trazidas pela reforma tributária.");
    p("Os valores foram informados pela família e devem ser tratados como estimativas. As premissas de cálculo estão indicadas ao final, e cada projeção pode ser refinada com a documentação dos bens, as declarações de imposto de renda e os balanços das empresas.");

    H("II. Retrato do patrimônio");
    p("O patrimônio bruto estimado é de " + brl(t.bruto) + " a valor de mercado, ante " + brl(t.declarado) + " declarados, com " + (t.dividas ? "dívidas pessoais de " + brl(t.dividas) + " e " : "") + "patrimônio líquido de " + brl(t.liquido) + ". A composição é a seguinte:");
    b.push({ t: "tab", cab: ["Classe de ativo", "Valor de mercado", "Participação"], larg: [2.2, 1.3, 1], linhas: r.composicao.map(x => [x.n, brl(x.v), pct(x.p, 1)]).concat([["Total", brl(t.bruto), "100%"]]) });
    if (r.im.length) { sub("Imóveis"); b.push({ t: "tab", cab: ["Imóvel", "Tipo", "Valor declarado", "Valor de mercado", "Aluguel mensal"], larg: [2.2, 1.2, 1.2, 1.2, 1.1], linhas: r.im.map(x => [x.desc || "Imóvel", x.tipo || "", brl(x.irpf), brl(x.mercado), x.aluguel ? brl(x.aluguel) : "não alugado"]) }); if (r.ganhoLatente) p("A diferença entre o valor de mercado e o valor declarado dos imóveis representa ganho de capital latente de " + brl(r.ganhoLatente) + ", relevante tanto para a venda quanto para a escolha do valor de integralização em eventual holding."); }
    if (r.emp.length) { sub("Participações societárias"); b.push({ t: "tab", cab: ["Empresa", "Regime", "Participação", "Patrimônio líquido", "Valor estimado"], larg: [2.2, 1.2, 1, 1.2, 1.2], linhas: r.emp.map(x => [x.nome + (x.atividade ? ", " + x.atividade : ""), x.regime || "", x.participacao ? pct(x.participacao, 1) : "", brl(x.pl), brl(x.mercado)]) }); }
    p("Em síntese, o patrimônio concentra-se em " + (r.composicao.slice().sort((x, y) => y.v - x.v)[0] || { n: "ativos não informados" }).n.toLowerCase() + ", o que orienta as prioridades do planejamento.");

    H("III. Núcleo familiar e regime de bens");
    p(fam.meacao); p(fam.concorrencia); p(fam.legitima);
    fam.alertas.forEach(p);
    p("Desse quadro decorre que a definição de quem recebe, em que proporção e com quais proteções deve ser tratada de forma expressa, sem depender das regras supletivas do Código Civil.");

    H("IV. Custo da sucessão sem planejamento");
    p("Mantida a estrutura atual, a transmissão do patrimônio ocorrerá por inventário, judicial ou extrajudicial, com o ITCMD calculado sobre o valor de mercado dos bens, além de honorários, custas, emolumentos e avaliações. A previdência privada foi excluída da base, porque o STF afastou a incidência do ITCMD sobre o VGBL e o PGBL (Tema 1.214).");
    b.push({ t: "tab", cab: ["Item", "Alíquota atual", "Cenário progressivo"], larg: [2.2, 1.3, 1.3], linhas: [["Monte tributável", brl(s.monte), brl(s.monte)], ["ITCMD", brl(s.itcmd) + " (" + pct(P.itcmd) + ")", brl(s.itcmdFuturo) + " (" + pct(P.itcmdFuturo) + ")"], ["Honorários", brl(s.honorarios), brl(s.honorarios)], ["Custas e emolumentos", brl(s.custas), brl(s.custas)], ["Custo total estimado", brl(s.total), brl(s.totalFuturo)]] });
    p("Além do custo, o inventário torna os bens indisponíveis até a partilha, o que paralisa a gestão de imóveis e participações e, em casos litigiosos, pode durar anos. Os recursos líquidos disponíveis somam " + brl(s.liquidez) + (s.falta > 0 ? ", insuficientes para cobrir o custo estimado, com déficit de " + brl(s.falta) + "." : ", suficientes para cobrir o custo estimado."));
    p("Conclui-se que a sucessão no modelo atual custaria cerca de " + pct(s.monte ? s.total / s.monte * 100 : 0, 1) + " do patrimônio transmitido, percentual que tende a crescer com a progressividade do ITCMD.");

    if (a.receita) {
      H("V. Tributação dos aluguéis");
      p("A receita anual de locação é de " + brl(a.receita) + ", proveniente de " + a.imoveis + (a.imoveis === 1 ? " imóvel" : " imóveis") + ". Na pessoa física, o aluguel é tributado pelo IRPF na tabela progressiva, com alíquota marginal de até 27,5%" + (a.titulares > 1 ? ", considerada a divisão da receita entre os cônjuges" : "") + ". Na holding optante pelo lucro presumido, a base é de 32% da receita, com IRPJ, adicional e CSLL, além do PIS e da COFINS até 2026.");
    p("A partir de 2027, a locação passa a sofrer a incidência da CBS e, gradualmente, do IBS, com redução de 70% das alíquotas (LC 214/2025, art. 261) e redutor social de R$ 600 mensais por imóvel residencial (art. 260). A pessoa física só é contribuinte quando a receita anual supera R$ 240 mil e possui mais de três imóveis (art. 251)" + (a.pfContribuinte ? ", hipótese em que a família se enquadra." : ", hipótese em que a família hoje não se enquadra."));
      b.push({ t: "tab", cab: ["Momento", "Pessoa física", "Holding (tributos)", "Holding (com manutenção)", "Diferença anual"], larg: [1.6, 1.1, 1.1, 1.2, 1.1], linhas: a.fases.map(x => [x.fase.rot, brl(x.pf), brl(x.pj), brl(x.pjManut), brl(x.economia)]) });
      p("A carga efetiva atual é de " + pct(a.efetivaPF, 1) + " na pessoa física e de " + pct(a.efetivaPJ, 1) + " na holding. A projeção da pessoa física não considera deduções como IPTU, condomínio e taxa de administração, que reduzem a base do IRPF, nem eventuais créditos do IBS e da CBS na holding." + (a.retencao ? " A distribuição de lucros estimada supera R$ 50 mil mensais por sócio e sofreria a retenção de 10% da Lei 15.270/2025, compensável no ajuste anual." : " A distribuição de lucros estimada fica abaixo de R$ 50 mil mensais por sócio, sem a retenção de 10% da Lei 15.270/2025."));
      p("Em síntese, a holding " + (a.fases[2].economia > 0 ? "reduz a tributação dos aluguéis em cerca de " + brl(a.fases[2].economia) + " por ano no regime pleno da reforma" : "não reduz a tributação dos aluguéis no regime pleno da reforma, de modo que a sua justificativa deve repousar na sucessão e na governança") + ".");
    }

    H((a.receita ? "VI" : "V") + ". Estruturas possíveis");
    if (h.imoveis) {
      sub("Holding patrimonial com doação das quotas");
      p("A integralização dos " + h.imoveis + " imóveis em uma holding, pelo valor declarado de " + brl(h.baseCont) + ", evita a apuração de ganho de capital (Lei 9.249/1995, art. 23). Em seguida, as quotas são doadas aos filhos com reserva de usufruto, o que mantém com os pais a renda e o controle, e retira esses bens do inventário futuro.");
      p("O ITCMD da doação é antecipado. Sobre o valor de mercado, alcança " + brl(h.itcmdMerc) + "; pela base contábil, ainda praticada enquanto a lei mineira não for adequada à LC 227/2026, " + brl(h.itcmdCont) + ". A esse valor somam-se os custos de constituição, estimados em " + brl(h.constituicao) + ", e a manutenção anual de " + brl(h.manutAno) + ".");
      p("O ITBI na integralização merece análise prévia. Como a holding terá a locação como atividade preponderante, o Município pode negar a imunidade, e o Tema 1.348 do STF, que decidirá a questão, está pendente. A contingência estimada é de " + brl(h.itbi) + ".");
    }
    sub("Testamento");
    p("O testamento organiza a parte disponível do patrimônio, os bens que permanecem fora da holding e as disposições pessoais, como a nomeação de tutor e a instituição de cláusulas sobre a legítima, desde que justificadas (CC, art. 1.848).");
    sub("Previdência privada e seguro de vida");
    p("A previdência privada e o seguro de vida não integram o inventário, são pagos diretamente aos beneficiários e não sofrem o ITCMD, segundo o Tema 1.214 do STF. São instrumentos eficientes para a formação de liquidez sucessória" + (t.previdencia ? ", e a família já mantém " + brl(t.previdencia) + " em planos dessa natureza." : "."));
    if (r.emp.length) { sub("Governança das empresas"); p("Para as participações em " + r.emp.map(x => x.nome).join(", ") + ", recomenda-se acordo de sócios e protocolo familiar, com regras de administração, distribuição de lucros, entrada e saída de herdeiros e sucessão na gestão. A eventual transferência dessas participações à holding deve ser simulada à luz do regime tributário de cada empresa e das regras de distribuição de dividendos da Lei 15.270/2025."); }

    H((a.receita ? "VII" : "VI") + ". Cenários comparativos");
    b.push({ t: "tab", cab: ["Cenário", "Custo da sucessão", "Observação"], larg: [1.7, 1.2, 2.4], linhas: r.cenarios.map(x => [x.n, brl(x.sucessao), x.obs]) });
    p("A comparação indica " + (h.economia > 0 ? "economia de " + brl(h.economia) + " com a holding na alíquota atual, que chega a " + brl(h.economiaFuturo) + " se a alíquota progressiva for adotada antes da sucessão" : "que, com os valores informados, a holding não reduz o custo da sucessão na alíquota atual, e a sua conveniência depende dos demais objetivos da família") + ". Os valores não incluem a contingência do ITBI.");

    H((a.receita ? "VIII" : "VII") + ". Riscos e pontos de atenção");
    r.riscos.forEach(x => p([[x.t + " (risco " + x.n + "). ", "bo"], [x.x, "n"]]));
    if (!r.riscos.length) p("Não foram identificados riscos relevantes com os dados informados.");

    H((a.receita ? "IX" : "VIII") + ". Roteiro de ações");
    r.acoes.forEach((x, i) => p([[(i + 1) + ". " + x.t + ". ", "bo"], [x.x + " Prioridade " + ["", "alta", "média", "complementar"][x.p] + ".", "n"]]));

    H((a.receita ? "X" : "IX") + ". Conclusão");
    p("O diagnóstico revela que a sucessão de " + nome + ", no modelo atual, custaria cerca de " + brl(s.total) + ", sem contar o tempo de indisponibilidade dos bens e o risco de conflito. As estruturas indicadas permitem antecipar e reduzir esse custo, organizar a renda dos aluguéis e proteger o patrimônio, desde que implementadas com patrimônio livre, finalidade legítima e documentação adequada.");
    p("Recomenda-se, assim, a validação dos valores com a documentação dos bens e a implementação das medidas na ordem de prioridade indicada, com reavaliação anual, sobretudo diante da regulamentação estadual da LC 227/2026, do julgamento do Tema 1.348 do STF e da transição do IBS e da CBS.");

    sub("Premissas de cálculo");
    b.push({ t: "tab", cab: ["Premissa", "Valor"], larg: [3, 1], linhas: Object.keys(PREMISSAS).map(k => [PREMISSAS[k].r, /R\$/.test(PREMISSAS[k].r) ? brl(P[k]) : pct(P[k])]) });
    p("As projeções têm caráter estimativo e não substituem a análise documental, a avaliação dos bens e o exame da legislação municipal e estadual aplicável a cada ativo.", false);
    b.push({ t: "data", texto: (opc.local || "Belo Horizonte/MG").replace(/\/.*/, "") + ", " + (opc.dataTexto || "") + "." });
    (opc.advogados || []).forEach(x => b.push({ t: "ass", nome: x.nome, linhas: ["OAB/" + x.uf + " " + x.oab] }));
    return b;
  }

  /* Resumo estruturado para a IA: dados informados e números já calculados. */
  function paraIA(d, r) {
    const a = r.alugueis, R2 = x => Math.round(x);
    return {
      cliente: d.cliente, casal: d.casal, filhos: r.familia.filhos, situacoes: d.sit, objetivos: (d.objetivos || []).map(k => (OBJETIVOS.find(o => o[0] === k) || [k, k])[1]), observacoes: d.obs,
      imoveis: r.im.map(x => ({ descricao: x.desc, tipo: x.tipo, uf: x.uf, valor_declarado: x.irpf, valor_mercado: x.mercado, aluguel_mensal: x.aluguel, registro: x.matricula || "", titulares: x.titular || "", onus_e_restricoes: x.onus || "" })),
      empresas: r.emp.map(x => ({ nome: x.nome, atividade: x.atividade, natureza: x.natureza, regime: x.regime, faturamento_anual: x.faturamento, participacao_familia_pct: x.participacao, patrimonio_liquido: x.pl, valor_estimado: x.mercado, lucros_distribuidos_ano: x.dividendos, dividas: x.dividas, valor_dividas: x.valorDividas, natureza_dividas: x.naturezaDividas })),
      financeiro: r.fin, premissas: r.P,
      calculos: {
        totais: r.tot, composicao: r.composicao, ganho_capital_latente: R2(r.ganhoLatente), ir_ganho_latente_15pct: R2(r.irGanhoLatente),
        sucessao_sem_planejamento: r.semPlan, holding: r.holding, cenarios: r.cenarios,
        alugueis: { receita_anual: a.receita, imoveis_alugados: a.imoveis, pf_contribuinte_ibs_cbs: a.pfContribuinte, carga_efetiva_pf_2026_pct: +a.efetivaPF.toFixed(2), carga_efetiva_holding_2026_pct: +a.efetivaPJ.toFixed(2), dividendo_mensal_por_socio: R2(a.dividendoMensal), retencao_10pct_dividendos: a.retencao, fases: a.fases.map(x => ({ momento: x.fase.rot, pessoa_fisica: R2(x.pf), holding_tributos: R2(x.pj), holding_com_manutencao: R2(x.pjManut), diferenca_anual: R2(x.economia) })) },
        familia: { meacao: r.familia.meacao, concorrencia: r.familia.concorrencia, alertas: r.familia.alertas },
        riscos: r.riscos, roteiro: r.acoes
      }
    };
  }

  root.PAT_MOTOR = { calcular, relatorio, paraIA, PREMISSAS, OBJETIVOS, REGIMES, brl, pct, num, irMensal };
})(typeof window !== "undefined" ? window : globalThis);
