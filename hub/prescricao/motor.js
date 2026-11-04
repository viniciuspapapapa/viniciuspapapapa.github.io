/* Motor de cálculo da prescrição penal (CP, arts. 107, IV, e 109 a 119).
   Contagem: CP, art. 10 (inclui-se o dia do começo; calendário comum) e Lei 810/1949 (ano e mês civis; sem o dia
   correspondente, o prazo termina no primeiro dia subsequente). Todas as datas em UTC, sem horário. */
(function (root) {
  "use strict";
  const DIA = 864e5;
  const D = s => { if (!s) return null; if (s instanceof Date) return s; const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s); return m ? new Date(Date.UTC(+m[1], +m[2] - 1, +m[3])) : null; };
  const iso = d => (d ? d.toISOString().slice(0, 10) : "");
  const br = d => (d ? iso(d).split("-").reverse().join("/") : "não informada");
  const hoje = () => { const n = new Date(); return new Date(Date.UTC(n.getFullYear(), n.getMonth(), n.getDate())); };
  const mais = (d, dias) => new Date(d.getTime() + dias * DIA);
  /* data correspondente, meses depois (Lei 810/1949, arts. 1º a 3º) */
  function correspondente(d, meses) {
    const y = d.getUTCFullYear(), m = d.getUTCMonth() + meses, dia = d.getUTCDate();
    const alvoAno = y + Math.floor(m / 12), alvoMes = ((m % 12) + 12) % 12;
    const ult = new Date(Date.UTC(alvoAno, alvoMes + 1, 0)).getUTCDate();
    return dia <= ult ? new Date(Date.UTC(alvoAno, alvoMes, dia)) : new Date(Date.UTC(alvoAno, alvoMes + 1, 1));
  }
  /* último dia do prazo iniciado em `ini` (incluído), acrescido dos dias de suspensão que recaiam no intervalo */
  function termoFinal(ini, meses, suspensoes) {
    let fim = mais(correspondente(ini, meses), -1), usados = 0;
    for (let k = 0; k < 50; k++) {
      let dias = 0;
      for (const s of suspensoes || []) {
        const a = s.ini > ini ? s.ini : ini, b = s.fim < fim ? s.fim : fim;
        if (b >= a) dias += Math.round((b - a) / DIA) + 1;
      }
      if (dias === usados) break;
      fim = mais(mais(correspondente(ini, meses), -1), dias); usados = dias;
    }
    return { fim, suspensos: usados };
  }

  /* ------------------------------------------------------------------ penas e prazos */
  const fracao = s => { s = String(s || "").trim().replace(",", "."); if (!s) return 0; const m = /^(\d+)\s*\/\s*(\d+)$/.exec(s); if (m) return +m[1] / +m[2]; const n = parseFloat(s); return isNaN(n) ? 0 : n; };
  const emMeses = p => (p ? (+p.a || 0) * 12 + (+p.m || 0) + (+p.d || 0) / 30 : 0);
  function fmtPena(meses) {
    const a = Math.floor(meses / 12 + 1e-9), m = Math.floor(meses - a * 12 + 1e-9), d = Math.round((meses - a * 12 - m) * 30);
    const p = []; if (a) p.push(a + (a === 1 ? " ano" : " anos")); if (m) p.push(m + (m === 1 ? " mês" : " meses")); if (d) p.push(d + (d === 1 ? " dia" : " dias"));
    return p.length ? p.join(" e ") : "0";
  }
  const LEI_12234 = D("2010-05-06");
  /* CP, art. 109 */
  function prazoArt109(meses, dataFato) {
    if (meses > 144) return { anos: 20, inciso: "I" };
    if (meses > 96) return { anos: 16, inciso: "II" };
    if (meses > 48) return { anos: 12, inciso: "III" };
    if (meses > 24) return { anos: 8, inciso: "IV" };
    if (meses >= 12) return { anos: 4, inciso: "V" };
    const antes = dataFato && dataFato < LEI_12234;
    return { anos: antes ? 2 : 3, inciso: "VI", redacaoAnterior: !!antes };
  }
  function idadeEm(nasc, d) { if (!nasc || !d) return null; let i = d.getUTCFullYear() - nasc.getUTCFullYear(); if (d.getUTCMonth() < nasc.getUTCMonth() || (d.getUTCMonth() === nasc.getUTCMonth() && d.getUTCDate() < nasc.getUTCDate())) i--; return i; }

  /* ------------------------------------------------------------------ cálculo */
  /* entrada:
     caso = { nascimento, reincidente, imprescritivel, fato, tipoTermo, termoEspecial, vitimaNascimento,
              recebimento, pronuncia, confirmacaoPronuncia, sentenca, acordaos[], transitoAcusacao, acusacaoSemRecurso,
              transitoFinal, inicioCumprimento, evasao, penaRestante{a,m,d}, suspensoes[{ini,fim,causa,art366}], dataBase }
     crime = { nome, penaMax{a,m,d}, aumento, diminuicao, penaAplicada{a,m,d}, multaIsolada } */
  function calcular(caso, crime) {
    const hj = D(caso.dataBase) || hoje();
    const out = { crime, avisos: [], modalidades: [], marcos: [] };
    if (caso.imprescritivel) { out.imprescritivel = true; out.avisos.push("Crime imprescritível (CF, art. 5º, XLII e XLIV; STF, HC 154.248, quanto à injúria racial). Não há prescrição a calcular."); return out; }

    /* termo inicial (CP, art. 111) */
    const fato = D(caso.fato);
    let termo = fato, rotTermo = "data da consumação (CP, art. 111, I)";
    if (caso.tipoTermo === "tentativa") rotTermo = "dia em que cessou a atividade criminosa (CP, art. 111, II)";
    if (caso.tipoTermo === "permanente") rotTermo = "dia em que cessou a permanência (CP, art. 111, III)";
    if (caso.tipoTermo === "conhecimento") { termo = D(caso.termoEspecial) || fato; rotTermo = "data em que o fato se tornou conhecido (CP, art. 111, IV)"; }
    if (caso.tipoTermo === "dignidade") {
      const vn = D(caso.vitimaNascimento), rec = D(caso.recebimento);
      if (fato && fato >= D("2012-05-18") && vn) {
        const dezoito = correspondente(vn, 216);
        if (!rec || rec >= dezoito) { if (dezoito > fato) { termo = dezoito; rotTermo = "data em que a vítima completou 18 anos (CP, art. 111, V)"; } }
        else out.avisos.push("A ação penal foi proposta antes de a vítima completar 18 anos; o termo inicial segue a regra geral (CP, art. 111, V, parte final).");
      } else if (fato && fato < D("2012-05-18")) out.avisos.push("O fato é anterior à Lei 12.650/2012; a regra do art. 111, V, do CP, mais gravosa, não retroage.");
    }
    if (!termo) { out.erro = "Informe a data do fato ou do termo inicial."; return out; }
    out.termo = termo; out.rotTermo = rotTermo;

    /* redução do art. 115 */
    const nasc = D(caso.nascimento), sent = D(caso.sentenca);
    const id21 = idadeEm(nasc, fato || termo), id70 = idadeEm(nasc, sent);
    let reducao = false, rotRed = "";
    if (id21 != null && id21 < 21) { reducao = true; rotRed = "menor de 21 anos ao tempo do crime"; }
    if (id70 != null && id70 >= 70) { reducao = true; rotRed = (rotRed ? rotRed + " e " : "") + "maior de 70 anos na data da sentença"; }
    if (!sent && nasc) { const setenta = correspondente(nasc, 840); if (!reducao) out.avisos.push("Se a sentença for proferida a partir de " + br(setenta) + ", data em que o agente completa 70 anos, os prazos serão reduzidos de metade (CP, art. 115)."); }
    out.reducao = reducao; out.rotRed = rotRed;

    /* suspensões (CP, art. 116; CPP, art. 366, limitado pela Súmula 415 do STJ) */
    const penaAbs = emMeses(crime.penaMax) * (1 + fracao(crime.aumento)) * (1 - fracao(crime.diminuicao));
    const pAbs = crime.multaIsolada ? { anos: 2, inciso: "art. 114, I" } : prazoArt109(penaAbs, fato || termo);
    const mesesAbs = pAbs.anos * 12 / (reducao ? 2 : 1);
    const susp = [];
    for (const s of caso.suspensoes || []) {
      const ini = D(s.ini); if (!ini) continue;
      let fim = D(s.fim) || hj, limitada = false;
      if (s.art366) { const lim = mais(correspondente(ini, mesesAbs), -1); if (fim > lim) { fim = lim; limitada = true; } }
      susp.push({ ini, fim, causa: s.causa || "suspensão", aberta: !s.fim, limitada });
      if (!s.fim && !limitada) out.avisos.push("A suspensão iniciada em " + br(ini) + " está em curso e foi computada até a data de referência; enquanto perdurar, o termo final do prazo se desloca dia a dia.");
      if (limitada) out.avisos.push("A suspensão do art. 366 do CPP iniciada em " + br(ini) + " foi limitada ao prazo prescricional pela pena máxima, a partir do qual a prescrição volta a correr (Súmula 415 do STJ).");
    }
    out.suspensoes = susp;

    /* marcos interruptivos (CP, art. 117) */
    const marcos = [{ d: termo, rot: "Termo inicial: " + rotTermo, tipo: "termo" }];
    const add = (v, rot, tipo) => { const d = D(v); if (d) marcos.push({ d, rot, tipo }); };
    add(caso.recebimento, "Recebimento da denúncia ou queixa (art. 117, I)", "rec");
    add(caso.pronuncia, "Pronúncia (art. 117, II)", "pron");
    add(caso.confirmacaoPronuncia, "Decisão confirmatória da pronúncia (art. 117, III)", "conf");
    add(caso.sentenca, "Publicação da sentença condenatória (art. 117, IV)", "sent");
    for (const a of caso.acordaos || []) add(a, "Publicação de acórdão condenatório (art. 117, IV; STF, HC 176.473)", "ac");
    marcos.sort((a, b) => a.d - b.d);
    out.marcos = marcos;
    const transFinal = D(caso.transitoFinal);
    const fimProc = transFinal || hj;

    function verificar(lista, meses, rotulo, ateFinal) {
      const trechos = [];
      let prescrita = null;
      for (let i = 0; i < lista.length; i++) {
        const a = lista[i], b = lista[i + 1] || (ateFinal ? { d: fimProc, rot: transFinal ? "Trânsito em julgado" : "Data de referência (" + br(hj) + ")", tipo: "fim", aberto: !transFinal } : null);
        if (!b) break;
        const t = termoFinal(a.d, meses, susp);
        const ok = b.d <= t.fim;
        const tr = { de: a, ate: b, fim: t.fim, suspensos: t.suspensos, prescreve: !ok, aberto: !!b.aberto };
        trechos.push(tr);
        if (!ok && !prescrita) prescrita = tr;
      }
      return { rotulo, meses, trechos, prescrita };
    }

    /* 1. PPP pela pena máxima em abstrato */
    const ab = verificar(marcos, mesesAbs, "Prescrição da pretensão punitiva pela pena máxima em abstrato", true);
    ab.base = { pena: penaAbs, prazo: pAbs, meses: mesesAbs, fundamento: crime.multaIsolada ? "CP, art. 114, I" : "CP, art. 109, " + pAbs.inciso + (reducao ? ", c/c art. 115" : "") };
    out.modalidades.push(Object.assign({ id: "abstrata" }, ab));

    /* pena aplicada */
    const penaApl = emMeses(crime.penaAplicada);
    const podeConcreta = penaApl > 0 && sent && (caso.acusacaoSemRecurso || D(caso.transitoAcusacao));
    if (penaApl > 0 && sent && !podeConcreta) out.avisos.push("Há pena aplicada, mas não consta o trânsito em julgado para a acusação nem a ausência ou o improvimento de recurso acusatório; as modalidades pela pena em concreto são apresentadas apenas como projeção (CP, art. 110, § 1º).");
    if (penaApl > 0 && sent) {
      const pC = prazoArt109(penaApl, fato || termo), mesesC = pC.anos * 12 / (reducao ? 2 : 1);
      const base = { pena: penaApl, prazo: pC, meses: mesesC, fundamento: "CP, art. 110, § 1º, c/c art. 109, " + pC.inciso + (reducao ? " e art. 115" : "") };
      /* 2. retroativa: entre os marcos anteriores à sentença; antes da Lei 12.234/2010, também entre o fato e o recebimento */
      const antigos = fato && fato < LEI_12234;
      const ret = marcos.filter(m => m.d <= sent && (antigos || m.tipo !== "termo"));
      const r = verificar(ret, mesesC, "Prescrição retroativa (pela pena aplicada)", false);
      r.base = base; r.projecao = !podeConcreta; r.antigos = antigos;
      out.modalidades.push(Object.assign({ id: "retroativa" }, r));
      /* 3. superveniente ou intercorrente: da sentença ao trânsito em julgado */
      const sup = marcos.filter(m => m.d >= sent);
      const s2 = verificar(sup, mesesC, "Prescrição superveniente ou intercorrente (pela pena aplicada)", true);
      s2.base = base; s2.projecao = !podeConcreta;
      out.modalidades.push(Object.assign({ id: "superveniente" }, s2));
      /* 4. executória */
      if (transFinal || D(caso.transitoAcusacao)) {
        const tAc = D(caso.transitoAcusacao);
        let ini = null, rotIni = "";
        if (tAc && tAc <= D("2020-11-11")) { ini = tAc; rotIni = "trânsito em julgado para a acusação (CP, art. 112, I; trânsito anterior ao marco de modulação do Tema 788 do STF)"; }
        else if (transFinal) { ini = transFinal; rotIni = "trânsito em julgado para ambas as partes (STF, Tema 788)"; }
        let mesesE = mesesC, penaE = penaApl, rotPena = "pena aplicada";
        const ev = D(caso.evasao);
        if (ev && emMeses(caso.penaRestante) > 0) { ini = ev; penaE = emMeses(caso.penaRestante); rotPena = "pena restante (CP, art. 113)"; rotIni = "data da evasão ou da revogação do livramento ou do sursis (CP, art. 112, II)"; }
        if (ini) {
          const pE = prazoArt109(penaE, fato || termo);
          mesesE = pE.anos * 12 * (caso.reincidente ? 4 / 3 : 1) / (reducao ? 2 : 1);
          const fimE = D(caso.inicioCumprimento) && D(caso.inicioCumprimento) > ini && !ev ? { d: D(caso.inicioCumprimento), rot: "Início do cumprimento da pena (art. 117, V)", tipo: "fim" } : { d: hj, rot: "Data de referência (" + br(hj) + ")", tipo: "fim", aberto: true };
          const t = termoFinal(ini, mesesE, susp);
          const e = { rotulo: "Prescrição da pretensão executória", meses: mesesE, trechos: [{ de: { d: ini, rot: "Termo inicial: " + rotIni }, ate: fimE, fim: t.fim, suspensos: t.suspensos, prescreve: fimE.d > t.fim, aberto: !!fimE.aberto }] };
          e.prescrita = e.trechos[0].prescreve ? e.trechos[0] : null;
          e.base = { pena: penaE, prazo: pE, meses: mesesE, fundamento: "CP, art. 110, caput, c/c art. 109, " + pE.inciso + (caso.reincidente ? ", aumentado de um terço pela reincidência" : "") + (reducao ? " e art. 115" : ""), rotPena };
          out.modalidades.push(Object.assign({ id: "executoria" }, e));
        }
      }
    }
    out.extinta = out.modalidades.some(m => m.prescrita && !m.projecao);
    return out;
  }

  root.PRESC_MOTOR = { calcular, termoFinal, correspondente, prazoArt109, emMeses, fmtPena, fracao, D, iso, br, hoje, idadeEm };
})(typeof window !== "undefined" ? window : globalThis);
