/* Motor de cálculo de pena e de execução penal.
   Dosimetria: CP, arts. 59, 61 a 68 (método trifásico), 33 (regime), 44 (substituição) e 77 (sursis).
   Execução: LEP, art. 112 na redação vigente (caput e incisos I a IV pela Lei 15.402/2026; incisos V a VIII pela
   Lei 15.358/2026), arts. 126 a 128 (remição), CP, arts. 42 (detração), 75 (limite) e 83 (livramento condicional).
   As datas usam o motor da prescrição (PRESC_MOTOR): Lei 810/1949 e CP, art. 10. */
(function (root) {
  "use strict";
  const PM = root.PRESC_MOTOR;
  const DIA = 864e5;
  const D = PM.D, br = PM.br, iso = PM.iso;
  const mais = (d, n) => new Date(d.getTime() + n * DIA);
  const entre = (a, b) => Math.round((b - a) / DIA);

  /* ------------------------------------------------------------------ frações */
  function fracao(s) {
    s = String(s == null ? "" : s).trim().replace(",", ".");
    if (!s) return null;
    let m = /^(\d+(?:\.\d+)?)\s*%$/.exec(s); if (m) return +m[1] / 100;
    m = /^(\d+)\s*\/\s*(\d+)$/.exec(s); if (m && +m[2]) return +m[1] / +m[2];
    const n = parseFloat(s); return isNaN(n) ? null : n > 1 ? n / 100 : n;
  }
  function fmtFracao(f) {
    const conhecidas = [[1 / 8, "1/8"], [1 / 6, "1/6"], [1 / 5, "1/5"], [1 / 4, "1/4"], [1 / 3, "1/3"], [2 / 5, "2/5"], [1 / 2, "1/2"], [3 / 5, "3/5"], [2 / 3, "2/3"]];
    for (const [v, t] of conhecidas) if (Math.abs(v - f) < 1e-9) return t;
    const p = Math.round(f * 10000) / 100; return String(p).replace(".", ",") + "%";
  }

  /* ------------------------------------------------------------------ pena em dias (dosimetria) */
  /* Na dosimetria a pena é aritmética de anos (12 meses), meses (30 dias) e dias; desprezam-se as frações de dia (CP, art. 11). */
  const emDias = p => (p ? (+p.a || 0) * 360 + (+p.m || 0) * 30 + (+p.d || 0) : 0);
  const deDias = n => { n = Math.max(0, Math.floor(n + 1e-9)); return { a: Math.floor(n / 360), m: Math.floor((n % 360) / 30), d: n % 30 }; };
  function fmt(p) {
    if (typeof p === "number") p = deDias(p);
    const o = []; if (p.a) o.push(p.a + (p.a === 1 ? " ano" : " anos")); if (p.m) o.push(p.m + (p.m === 1 ? " mês" : " meses")); if (p.d) o.push(p.d + (p.d === 1 ? " dia" : " dias"));
    return o.length ? o.join(", ").replace(/, ([^,]*)$/, " e $1") : "zero";
  }

  const CIRCUNSTANCIAS = [
    ["culpabilidade", "Culpabilidade"], ["antecedentes", "Antecedentes"], ["conduta", "Conduta social"], ["personalidade", "Personalidade do agente"],
    ["motivos", "Motivos do crime"], ["circunstancias", "Circunstâncias do crime"], ["consequencias", "Consequências do crime"], ["vitima", "Comportamento da vítima"]
  ];
  const AGRAVANTES = [
    ["reincidencia", "Reincidência (art. 61, I)"], ["futil", "Motivo fútil ou torpe (art. 61, II, a)"], ["outro", "Para facilitar ou assegurar outro crime (art. 61, II, b)"],
    ["traicao", "Traição, emboscada, dissimulação ou recurso que dificultou a defesa (art. 61, II, c)"], ["meio", "Veneno, fogo, explosivo, tortura, meio insidioso ou cruel (art. 61, II, d)"],
    ["parente", "Contra ascendente, descendente, irmão ou cônjuge (art. 61, II, e)"], ["domestica", "Abuso de autoridade, relações domésticas ou violência contra a mulher (art. 61, II, f)"],
    ["cargo", "Abuso de poder ou violação de dever do cargo (art. 61, II, g)"], ["vulneravel", "Contra criança, maior de 60 anos, enfermo ou grávida (art. 61, II, h)"],
    ["protecao", "Ofendido sob imediata proteção da autoridade (art. 61, II, i)"], ["calamidade", "Em ocasião de calamidade ou desgraça particular do ofendido (art. 61, II, j)"],
    ["embriaguez", "Embriaguez preordenada (art. 61, II, l)"], ["ensino", "Nas dependências de instituição de ensino (art. 61, II, m)"],
    ["organiza", "Promove ou organiza a cooperação no crime (art. 62, I)"], ["coage", "Coage ou induz outrem à execução (art. 62, II)"],
    ["instiga", "Instiga subordinado ou não punível (art. 62, III)"], ["paga", "Mediante paga ou promessa de recompensa (art. 62, IV)"]
  ];
  const ATENUANTES = [
    ["idade", "Menor de 21 anos na data do fato ou maior de 70 na sentença (art. 65, I)"], ["desconhecimento", "Desconhecimento da lei (art. 65, II)"],
    ["valor", "Relevante valor social ou moral (art. 65, III, a)"], ["reparacao", "Minorou as consequências ou reparou o dano (art. 65, III, b)"],
    ["coacao", "Coação resistível, ordem superior ou violenta emoção (art. 65, III, c)"], ["confissao", "Confissão espontânea (art. 65, III, d)"],
    ["multidao", "Influência de multidão em tumulto (art. 65, III, e)"], ["inominada", "Atenuante inominada (art. 66)"]
  ];
  const rotulo = (lista, id) => (lista.find(x => x[0] === id) || [, id])[1];

  /* entrada: { pmin, pmax, criterio: "oitavo"|"sexto", desfavoraveis: [ids], agravantes: [ids], atenuantes: [ids],
                fracao2: "1/6", sumula231: bool, causas: [{ tipo: "aumento"|"diminuicao", fracao, desc }],
                especie: "reclusao"|"detencao", violencia, culposo, hediondo, detracaoDias, maior70, saude, reincEspecifica } */
  function dosimetria(e) {
    const out = { fases: [], avisos: [] };
    const min = emDias(e.pmin), max = emDias(e.pmax);
    if (!min || !max || max < min) { out.erro = "Informe as penas mínima e máxima cominadas (a máxima não pode ser inferior à mínima)."; return out; }
    /* 1ª fase */
    const n = (e.desfavoraveis || []).length;
    const passo = e.criterio === "sexto" ? min / 6 : (max - min) / 8;
    let base = min + n * passo, teto1 = false;
    if (base > max) { base = max; teto1 = true; }
    base = Math.floor(base + 1e-9);
    out.fases.push({
      fase: 1, rotulo: "Pena-base (CP, art. 59)", pena: base,
      memoria: n ? n + (n === 1 ? " circunstância judicial desfavorável" : " circunstâncias judiciais desfavoráveis") + " (" + e.desfavoraveis.map(id => rotulo(CIRCUNSTANCIAS, id).toLowerCase()).join(", ") + "), à razão de " + (e.criterio === "sexto" ? "1/6 da pena mínima" : "1/8 do intervalo entre as penas mínima e máxima") + " para cada uma (" + fmt(Math.floor(passo)) + ")" + (teto1 ? ", limitada ao máximo cominado" : "")
        : "Todas as circunstâncias judiciais neutras ou favoráveis; pena-base no mínimo legal."
    });
    /* 2ª fase */
    const ag = (e.agravantes || []).length, at = (e.atenuantes || []).length, f2 = fracao(e.fracao2) || 1 / 6;
    const liquido = ag - at;
    let p2 = base + liquido * base * f2, mem2 = [];
    if (ag) mem2.push(ag + (ag === 1 ? " agravante" : " agravantes") + " (" + e.agravantes.map(id => rotulo(AGRAVANTES, id).replace(/ \(.*\)$/, "").toLowerCase()).join("; ") + ")");
    if (at) mem2.push(at + (at === 1 ? " atenuante" : " atenuantes") + " (" + e.atenuantes.map(id => rotulo(ATENUANTES, id).replace(/ \(.*\)$/, "").toLowerCase()).join("; ") + ")");
    if (ag && at) mem2.push("compensadas entre si na medida da equivalência (CP, art. 67; STJ, Tema 585, quanto à reincidência e à confissão), restando " + (liquido === 0 ? "saldo nulo" : Math.abs(liquido) + (liquido > 0 ? " agravante" : " atenuante") + (Math.abs(liquido) > 1 ? "s" : "") + " a considerar"));
    if (liquido) mem2.push((liquido > 0 ? "aumento" : "redução") + " de " + fmtFracao(f2) + " por circunstância sobre a pena-base");
    if (p2 < min && e.sumula231 !== false) { p2 = min; mem2.push("pena reconduzida ao mínimo legal, pois a atenuante não conduz a pena abaixo do mínimo na segunda fase (Súmula 231 do STJ)"); out.avisos.push("A Súmula 231 do STJ limitou a redução da segunda fase. A defesa pode sustentar sua superação, mas o entendimento segue sendo aplicado pelos tribunais."); }
    if (p2 > max) { p2 = max; mem2.push("pena limitada ao máximo cominado"); }
    p2 = Math.floor(p2 + 1e-9);
    out.fases.push({ fase: 2, rotulo: "Pena intermediária (CP, arts. 61 a 67)", pena: p2, memoria: mem2.length ? mem2.join("; ") + "." : "Sem agravantes ou atenuantes; a pena intermediária coincide com a pena-base." });
    /* 3ª fase: incidência em cascata */
    let p3 = p2; const mem3 = [];
    for (const c of e.causas || []) {
      const f = fracao(c.fracao); if (!f) continue;
      const antes = p3; p3 = c.tipo === "diminuicao" ? p3 * (1 - f) : p3 * (1 + f);
      mem3.push((c.tipo === "diminuicao" ? "Redução" : "Aumento") + " de " + fmtFracao(f) + (c.desc ? " (" + c.desc + ")" : "") + ": " + fmt(Math.floor(antes)) + " para " + fmt(Math.floor(p3 + 1e-9)));
    }
    p3 = Math.floor(p3 + 1e-9);
    out.fases.push({ fase: 3, rotulo: "Pena definitiva (CP, art. 68)", pena: p3, memoria: mem3.length ? mem3.join("; ") + ". As frações incidem sucessivamente, em cascata, sobre a pena resultante da operação anterior." : "Sem causas de aumento ou de diminuição; a pena intermediária torna-se definitiva." });
    out.pena = p3; out.penaFmt = fmt(p3); out.desfavoraveis = n;
    out.reincidente = (e.agravantes || []).includes("reincidencia");
    out.regime = regime(p3, Object.assign({}, e, { reincidente: out.reincidente, desfavoraveis: n }));
    out.substituicao = substituicao(p3, Object.assign({}, e, { reincidente: out.reincidente, desfavoraveis: n }));
    out.sursis = sursis(p3, Object.assign({}, e, { reincidente: out.reincidente, desfavoraveis: n }), out.substituicao);
    return out;
  }

  /* CP, art. 33, §§ 2º e 3º; CPP, art. 387, § 2º; Súmulas 269 e 440 do STJ; 718 e 719 do STF */
  function regime(pena, e) {
    const det = Math.max(0, +e.detracaoDias || 0), p = Math.max(0, pena - det), notas = [];
    const reclusao = e.especie !== "detencao";
    let r;
    if (reclusao) {
      if (p > 2880) r = "fechado";
      else if (p > 1440) r = e.reincidente ? "fechado" : "semiaberto";
      else r = e.reincidente ? (e.desfavoraveis ? "fechado" : "semiaberto") : "aberto";
    } else r = p > 1440 || e.reincidente ? "semiaberto" : "aberto";
    let fund = "CP, art. 33, § 2º, " + (p > 2880 ? "a" : p > 1440 ? "b" : "c");
    if (reclusao && e.reincidente && p > 1440 && p <= 2880) fund = "CP, art. 33, § 2º, b, a contrario sensu (a pena entre quatro e oito anos só admite o semiaberto ao não reincidente)";
    if (reclusao && e.reincidente && p <= 1440) fund += e.desfavoraveis ? "; reincidente com circunstâncias judiciais desfavoráveis" : "; Súmula 269 do STJ (reincidente, pena até quatro anos e circunstâncias judiciais favoráveis)";
    if (!reclusao) { fund = "CP, art. 33, caput (a pena de detenção não se inicia em regime fechado)"; if (p > 2880) notas.push("Na detenção, mesmo acima de oito anos, o regime inicial é o semiaberto; o fechado só cabe por regressão."); }
    if (det) notas.push("Detração de " + det + " dias considerada para a fixação do regime (CPP, art. 387, § 2º): pena de referência de " + fmt(p) + ".");
    if (e.desfavoraveis && r !== "fechado") notas.push("Há circunstância judicial desfavorável: o art. 33, § 3º, autoriza regime mais gravoso que o da pena, mas apenas com fundamentação concreta e idônea (Súmulas 718 e 719 do STF; Súmula 440 do STJ).");
    if (e.hediondo) notas.push("Em crime hediondo ou equiparado, o regime inicial segue o art. 33 do CP; a obrigatoriedade do regime fechado do art. 2º, § 1º, da Lei 8.072/1990 foi declarada inconstitucional pelo STF (HC 111.840).");
    return { regime: r, fundamento: fund, notas, penaReferencia: p };
  }

  /* CP, art. 44 */
  function substituicao(pena, e) {
    const motivos = [], notas = [];
    let cabe = true;
    if (!e.culposo) {
      if (pena > 1440) { cabe = false; motivos.push("pena superior a quatro anos em crime doloso (art. 44, I)"); }
      if (e.violencia) { cabe = false; motivos.push("crime doloso cometido com violência ou grave ameaça à pessoa (art. 44, I)"); }
    }
    if (e.reincidente && !e.culposo) {
      if (e.reincEspecifica) { cabe = false; motivos.push("reincidência específica (art. 44, § 3º, parte final)"); }
      else notas.push("O réu é reincidente em crime doloso (art. 44, II), mas a substituição é admitida se socialmente recomendável e a reincidência não for específica (art. 44, § 3º).");
    }
    if (e.desfavoraveis) notas.push("As circunstâncias judiciais desfavoráveis devem ser consideradas no juízo de suficiência do art. 44, III.");
    const forma = pena <= 360 ? "multa ou uma pena restritiva de direitos" : "uma pena restritiva de direitos e multa ou duas penas restritivas de direitos";
    return { cabe, motivos, notas, forma, fundamento: "CP, art. 44, § 2º" };
  }

  /* CP, art. 77 */
  function sursis(pena, e, subst) {
    const especial = e.maior70 || e.saude, limite = especial ? 1440 : 720;
    const motivos = [];
    if (pena > limite) motivos.push("pena superior a " + (especial ? "quatro" : "dois") + " anos" + (especial ? " (art. 77, § 2º)" : " (art. 77, caput)"));
    if (e.reincidente && !e.culposo) motivos.push("reincidência em crime doloso (art. 77, I)");
    if (subst && subst.cabe) motivos.push("cabível a substituição do art. 44, que prefere ao sursis (art. 77, III)");
    return { cabe: !motivos.length, motivos, periodo: especial ? "quatro a seis anos (art. 77, § 2º)" : "dois a quatro anos (art. 77, caput)" };
  }

  /* ------------------------------------------------------------------ execução: art. 112 da LEP (redação vigente) */
  const NATUREZAS = [
    ["comum", "Crime sem violência ou grave ameaça"],
    ["violento", "Crime com violência ou grave ameaça à pessoa"],
    ["titulo12", "Crime contra o Estado Democrático de Direito (Título XII do CP)"],
    ["trafico_priv", "Tráfico privilegiado (Lei 11.343/2006, art. 33, § 4º)"],
    ["hediondo", "Hediondo ou equiparado, sem resultado morte"],
    ["hediondo_morte", "Hediondo ou equiparado, com resultado morte"],
    ["feminicidio", "Feminicídio"],
    ["orcrim", "Comando de organização criminosa ultraviolenta estruturada para crime hediondo"],
    ["milicia", "Constituição de milícia privada"]
  ];
  const L402 = "Lei 15.402/2026", L358 = "Lei 15.358/2026";
  /* reinc: "primario" | "reincidente" (não específico) | "especifico" (reincidente específico em crime hediondo ou equiparado) */
  function fracaoProgressao(nat, reinc) {
    const rein = reinc !== "primario";
    switch (nat) {
      case "violento": return rein ? { f: 0.30, inciso: "inciso II", lei: L402, texto: "reincidente condenado por crime cometido com violência ou grave ameaça" } : { f: 0.25, inciso: "inciso I", lei: L402, texto: "primário condenado por crime cometido com violência ou grave ameaça" };
      case "hediondo": return reinc === "especifico" ? { f: 0.80, inciso: "inciso VII", lei: L358, texto: "reincidente na prática de crime hediondo ou equiparado" }
        : { f: 0.70, inciso: "inciso V", lei: L358, texto: "condenado por crime hediondo ou equiparado, primário", nota: rein ? "Reincidência não específica em crime hediondo: aplica-se a fração do primário (STJ, Tema 1.084), pois o inciso VII exige reincidência na prática de crime hediondo ou equiparado." : "" };
      case "hediondo_morte": return reinc === "especifico" ? { f: 0.85, inciso: "inciso VIII", lei: L358, texto: "reincidente em crime hediondo ou equiparado com resultado morte", vedaLC: true }
        : { f: 0.75, inciso: "inciso VI, alínea a", lei: L358, texto: "condenado por crime hediondo ou equiparado com resultado morte, primário", vedaLC: true, nota: rein ? "Reincidência não específica: aplica-se a fração do primário (inciso VI, a), na linha do Tema 1.084 do STJ, pois o inciso VIII exige reincidência em crime hediondo ou equiparado." : "" };
      case "feminicidio": return reinc === "especifico" ? { f: 0.85, inciso: "inciso VIII", lei: L358, texto: "reincidente em crime hediondo ou equiparado com resultado morte", vedaLC: true }
        : { f: 0.75, inciso: "inciso VI, alínea d", lei: L358, texto: "condenado pela prática de feminicídio, primário", vedaLC: true, nota: rein ? "Reincidência não específica: aplicada a fração do inciso VI, d, na linha do Tema 1.084 do STJ." : "" };
      case "orcrim": return { f: 0.75, inciso: "inciso VI, alínea b", lei: L358, texto: "condenado por exercer o comando de organização criminosa ultraviolenta estruturada para a prática de crime hediondo ou equiparado", vedaLC: true };
      case "milicia": return { f: 0.75, inciso: "inciso VI, alínea c", lei: L358, texto: "condenado pela prática do crime de constituição de milícia privada" };
      default: /* comum, título XII, tráfico privilegiado */
        return rein ? { f: 0.20, inciso: "inciso III", lei: L402, texto: "reincidente em crime diverso dos referidos nos incisos I e II" }
          : { f: 1 / 6, inciso: "caput", lei: L402, texto: "regra geral de um sexto da pena", nota: nat === "trafico_priv" ? "O tráfico privilegiado não é hediondo nem equiparado para fins de progressão (LEP, art. 112, § 5º)." : nat === "titulo12" ? "Os crimes do Título XII do CP estão excluídos dos incisos I e II e seguem a regra geral." : "" };
    }
  }
  const HEDIONDOS = ["hediondo", "hediondo_morte", "feminicidio", "orcrim"];
  /* CP, art. 83 */
  function fracaoLivramento(nat, reinc, bonsAntecedentes, prog) {
    if (prog && prog.vedaLC) return { vedado: true, motivo: "vedado pelo art. 112, " + prog.inciso + ", da LEP" };
    if (HEDIONDOS.includes(nat)) {
      if (reinc === "especifico") return { vedado: true, motivo: "reincidente específico em crime hediondo ou equiparado (CP, art. 83, V)" };
      return { f: 2 / 3, fundamento: "CP, art. 83, V (mais de dois terços)" };
    }
    if (reinc !== "primario") return { f: 1 / 2, fundamento: "CP, art. 83, II (mais da metade, reincidente em crime doloso)" };
    if (bonsAntecedentes === false) return { f: 1 / 2, fundamento: "CP, art. 83 (primário de maus antecedentes; fração de metade adotada por cautela)", nota: "O primário de maus antecedentes não se enquadra literalmente nem no inciso I nem no II do art. 83. A ferramenta adota, por cautela, a fração de metade, mas há fundamento para sustentar a de um terço, solução mais favorável diante da lacuna legal." };
    return { f: 1 / 3, fundamento: "CP, art. 83, I (mais de um terço, primário de bons antecedentes)" };
  }

  /* dias de calendário de uma pena contada a partir de `ini` (CP, art. 10; Lei 810/1949) */
  function diasPena(ini, p) {
    const meses = (+p.a || 0) * 12 + (+p.m || 0);
    return entre(ini, mais(PM.correspondente(ini, meses), +p.d || 0));
  }
  const REGIMES = ["fechado", "semiaberto", "aberto"];

  /* entrada: { inicio, dataBase, condenacoes: [{ desc, pena:{a,m,d}, natureza, reinc, fracaoManual, fracaoLCManual }],
                detracao: [{ ini, fim }], interrupcao (dias), remicao: { trabalho, estudoHoras, conclusao, leitura, outros, perdidos, posBase },
                regimeAtual, ultimaProgressao, faltaGrave, maeResponsavel, bonsAntecedentes, dataRef } */
  function execucao(e) {
    const out = { avisos: [], etapas: [], condenacoes: [] };
    const ini = D(e.inicio), ref = D(e.dataRef) || PM.hoje();
    if (!ini) { out.erro = "Informe a data de início do cumprimento da pena (prisão ou recolhimento)."; return out; }
    const cond = (e.condenacoes || []).filter(c => emDias(c.pena) > 0);
    if (!cond.length) { out.erro = "Informe ao menos uma condenação com a respectiva pena."; return out; }

    /* frações por condenação */
    let P = 0, somaProg = 0, somaLC = 0, mesesTotal = 0, vedadoLC = null;
    const mae = !!e.maeResponsavel && cond.every(c => c.reinc === "primario" && ["comum", "trafico_priv", "titulo12"].includes(c.natureza));
    if (e.maeResponsavel && !mae) out.avisos.push("A fração de 1/8 do art. 112, § 3º, exige, cumulativamente, primariedade, crime sem violência ou grave ameaça e ausência de organização criminosa; o caso informado não preenche esses requisitos, razão pela qual foi aplicada a fração ordinária.");
    for (const c of cond) {
      const dias = diasPena(ini, c.pena);
      let prog = fracaoProgressao(c.natureza, c.reinc);
      const manual = fracao(c.fracaoManual);
      if (mae) prog = { f: 1 / 8, inciso: "§ 3º", lei: "Lei 13.769/2018", texto: "mulher gestante, mãe ou responsável por criança ou pessoa com deficiência" };
      if (manual) prog = Object.assign({}, prog, { f: manual, inciso: "fração informada manualmente", manual: true });
      let lc = fracaoLivramento(c.natureza, c.reinc, e.bonsAntecedentes, prog);
      const lcManual = fracao(c.fracaoLCManual); if (lcManual) lc = { f: lcManual, fundamento: "fração informada manualmente" };
      if (lc.vedado && !vedadoLC) vedadoLC = lc.motivo;
      P += dias; somaProg += dias * prog.f; if (!lc.vedado) somaLC += dias * lc.f; mesesTotal += emDias(c.pena) / 30;
      if (prog.nota) out.avisos.push(prog.nota);
      if (lc.nota) out.avisos.push(lc.nota);
      out.condenacoes.push({ desc: c.desc, pena: c.pena, penaFmt: fmt(c.pena), dias, natureza: (NATUREZAS.find(n => n[0] === c.natureza) || [, c.natureza])[1], reinc: c.reinc, prog, lc });
    }
    const fp = somaProg / P;
    out.penaTotalDias = P; out.penaTotalFmt = fmt(deDias(Math.round(mesesTotal * 30)));
    out.fracaoProg = fp; out.fracaoProgFmt = fmtFracao(fp);
    if (out.condenacoes.some(c => c.prog.manual)) out.avisos.push("Há fração informada manualmente. Use esse recurso para fatos anteriores à vigência das Leis 15.358/2026 e 15.402/2026, aos quais se aplica a redação anterior se mais benéfica (CF, art. 5º, XL; CP, art. 2º).");
    else out.avisos.push("As frações seguem a redação vigente do art. 112 da LEP. Para fato anterior à vigência das Leis 15.358/2026 e 15.402/2026, verifique a redação então vigente e, se mais benéfica, informe a fração manualmente: a lei posterior mais gravosa não retroage (CF, art. 5º, XL).");

    /* créditos */
    const det = (e.detracao || []).map(x => ({ ini: D(x.ini), fim: D(x.fim) })).filter(x => x.ini && x.fim && x.fim >= x.ini);
    const diasDet = det.reduce((s, x) => s + entre(x.ini, x.fim) + 1, 0);
    const r = e.remicao || {};
    const remTrab = Math.floor((+r.trabalho || 0) / 3), remEst = Math.floor((+r.estudoHoras || 0) / 12);
    const remConc = r.conclusao ? Math.floor(remEst / 3) : 0;
    const remOutros = (+r.leitura || 0) + (+r.outros || 0), perdidos = Math.max(0, +r.perdidos || 0);
    const remicao = Math.max(0, remTrab + remEst + remConc + remOutros - perdidos);
    const interrup = Math.max(0, +e.interrupcao || 0);
    const creditos = diasDet + remicao;
    out.detracao = { dias: diasDet, periodos: det.map(x => ({ ini: br(x.ini), fim: br(x.fim), dias: entre(x.ini, x.fim) + 1 })) };
    out.remicao = { trabalho: remTrab, estudo: remEst, conclusao: remConc, outros: remOutros, perdidos, total: remicao, diasTrabalhados: +r.trabalho || 0, horasEstudo: +r.estudoHoras || 0 };
    out.interrupcao = interrup;
    if (perdidos) out.avisos.push("A perda de dias remidos por falta grave limita-se a um terço do tempo remido (LEP, art. 127) e exige decisão fundamentada.");

    /* pena cumprida em uma data */
    const cumprido = t => Math.max(0, entre(ini, t) - interrup + creditos);
    const limite = diasPena(ini, { a: 40 });
    const efetiva = Math.min(P, limite);
    if (P > limite) out.avisos.push("A soma das penas supera 40 anos: o tempo de cumprimento é unificado no limite do art. 75 do CP, mas os benefícios são calculados sobre a pena total (Súmula 715 do STF).");
    const termino = mais(ini, efetiva - creditos + interrup - 1);
    out.termino = termino; out.cumpridoRef = Math.min(cumprido(ref), efetiva); out.saldoRef = Math.max(0, efetiva - cumprido(ref)); out.dataRef = ref;
    out.percentual = Math.min(100, out.cumpridoRef / P * 100);

    /* data-base da contagem da próxima progressão */
    const up = D(e.ultimaProgressao), fg = D(e.faltaGrave);
    let base = ini, motivoBase = "início do cumprimento da pena";
    if (up && up > base) { base = up; motivoBase = "data da última progressão de regime"; }
    if (fg && fg > base) { base = fg; motivoBase = "data da última falta grave, que interrompe a contagem (LEP, art. 112, § 6º)"; }
    out.dataBase = base; out.motivoBase = motivoBase;
    const posBase = Math.max(0, +r.posBase || 0);

    /* progressões */
    let idx = REGIMES.indexOf(e.regimeAtual || "fechado");
    if (idx < 0) idx = 0;
    let b = base, primeira = true;
    while (idx < 2) {
      let exigido, data, saldo;
      if (+b === +ini) { saldo = P; exigido = Math.ceil(fp * P - 1e-9); data = mais(ini, Math.max(0, exigido - creditos) + interrup); }
      else {
        saldo = Math.max(0, P - cumprido(b) + (primeira ? posBase : 0));
        exigido = Math.ceil(fp * saldo - 1e-9);
        data = mais(b, Math.max(0, exigido - (primeira ? posBase : 0)));
      }
      if (data > termino) break;
      out.etapas.push({ tipo: "progressao", de: REGIMES[idx], para: REGIMES[idx + 1], base: b, saldo, exigido, data, fracao: fmtFracao(fp), atingido: data <= ref });
      b = data; idx++; primeira = false;
    }

    /* livramento condicional */
    const lc = { vedado: !!vedadoLC, motivo: vedadoLC };
    if (!lc.vedado && mesesTotal < 24) { lc.vedado = true; lc.motivo = "pena total inferior a dois anos (CP, art. 83, caput)"; }
    if (!lc.vedado) {
      const exig = Math.floor(somaLC + 1e-9) + 1; /* "mais de" a fração */
      let data = mais(ini, Math.max(0, exig - creditos) + interrup);
      lc.fracao = fmtFracao(somaLC / P); lc.exigido = exig;
      if (fg) { const doze = PM.correspondente(fg, 12); if (doze > data) { data = doze; lc.nota = "Data ajustada ao requisito de não cometimento de falta grave nos últimos doze meses (CP, art. 83, III, b). A falta grave não interrompe o prazo do livramento (Súmula 441 do STJ)."; } else lc.nota = "A falta grave não interrompe o prazo do livramento (Súmula 441 do STJ), mas exige-se a ausência de falta grave nos doze meses anteriores (CP, art. 83, III, b)."; }
      lc.data = data; lc.atingido = data <= ref;
      if (data > termino) { lc.vedado = true; lc.motivo = "o requisito temporal só seria atingido após o término da pena"; }
      lc.fundamentos = [...new Set(out.condenacoes.map(c => c.lc.fundamento).filter(Boolean))];
    }
    out.livramento = lc;
    if (fg) out.avisos.push("Bom comportamento: readquirido após um ano da falta grave ou, antes disso, ao cumprir o requisito temporal exigível (LEP, art. 112, § 7º).");
    out.avisos.push("O requisito subjetivo exige boa conduta carcerária atestada pelo diretor e o resultado do exame criminológico (LEP, art. 112, § 1º, na redação da Lei 14.843/2024). A falta de vaga no regime adequado não autoriza a permanência em regime mais gravoso (Súmula Vinculante 56).");
    return out;
  }

  root.EXEC_MOTOR = { dosimetria, regime, substituicao, sursis, execucao, fracaoProgressao, fracaoLivramento, NATUREZAS, CIRCUNSTANCIAS, AGRAVANTES, ATENUANTES, emDias, deDias, fmt, fracao, fmtFracao, diasPena, D, br, iso, rotulo };
})(typeof window !== "undefined" ? window : globalThis);
