/* Redação do relatório processual periódico ao cliente, no padrão TPC (blocos do TPC_PECA). */
(function (root) {
  "use strict";
  const T = root.REL_TRAD;
  const br = T.br;
  const minusc = s => s.replace(/^(A|O|As|Os|Foi|Foram|Houve|Terminou|Outro|Iniciou|Há)\b/, w => w.toLowerCase());
  const FONTE = { datajud: "Base pública do CNJ (DataJud)", texto: "Andamentos informados pela equipe", pdf: "Cópia atualizada dos autos" };

  function blocosProcesso(p, i, cfg) {
    const b = [];
    const cnj = T.fmtCNJ(p.numero);
    b.push({ t: "h", texto: (i + 1) + ". " + (p.apelido ? p.apelido + ", autos nº " + cnj : "Autos nº " + cnj) });
    const meta = p.meta || {}, linhas = [];
    if (meta.classe) linhas.push(["Classe", meta.classe]);
    if (meta.orgao) linhas.push(["Órgão julgador", meta.orgao]);
    if (meta.instancias && meta.instancias.length > 1) linhas.push(["Instâncias", meta.instancias.map(x => (x.grau === "G2" ? "2º grau" : x.grau === "G1" ? "1º grau" : x.grau === "JE" ? "Juizado" : x.grau) + ": " + (x.orgao || "")).filter((v, k, a) => a.findIndex(x => x.toLowerCase() === v.toLowerCase()) === k).join("; ")]);
    if (meta.ajuizamento) linhas.push(["Distribuição", br(meta.ajuizamento)]);
    linhas.push(["Fonte das informações", (FONTE[p.fonte] || "não informada") + (p.fonte === "datajud" && meta.atualizado ? ", atualizada em " + br(new Date(Date.UTC(meta.atualizado.getUTCFullYear(), meta.atualizado.getUTCMonth(), meta.atualizado.getUTCDate()))) : "")]);
    b.push({ t: "tab", larg: [1.3, 3], linhas });

    b.push({ t: "sub", texto: "Andamentos no período" });
    if (p.erro && !(p.movs || []).length) {
      b.push({ t: "p", r: "Não foi possível obter as movimentações deste processo para o período (" + p.erro + "). A equipe fará a verificação diretamente no sistema do tribunal." });
    } else {
      const todos = (p.movs || []).map(m => Object.assign({}, m, T.traduzir(m)));
      const periodo = todos.filter(m => m.data >= cfg.ini && m.data <= cfg.fim);
      const relevantes = [], vistos = new Set();
      for (const m of periodo) if (m.rel >= 2) { const k = +m.data + m.texto; if (!vistos.has(k)) { vistos.add(k); relevantes.push(m); } }
      const rotina = periodo.length - periodo.filter(m => m.rel >= 2).length;
      if (!periodo.length) {
        const ult = todos[todos.length - 1];
        b.push({ t: "p", r: "Não houve movimentação registrada no período." + (ult ? " O último andamento, de " + br(ult.data) + ", foi o seguinte: " + minusc(ult.texto) : "") });
      } else {
        const lim = 15, mostrar = relevantes.slice(-lim);
        if (relevantes.length > lim) b.push({ t: "p", r: "No período houve " + relevantes.length + " andamentos relevantes; destacam-se os " + lim + " mais recentes." });
        for (const m of mostrar) b.push({ t: "p", r: "Em " + br(m.data) + ", " + minusc(m.texto) });
        if (rotina) b.push({ t: "p", r: (rotina === 1 ? (mostrar.length ? "Além desses, foi registrado " : "No período foi registrado apenas ") + "um ato de rotina" : (mostrar.length ? "Além desses, foram registrados " : "No período foram registrados apenas ") + rotina + " atos de rotina") + (rotina === 1 ? ", de natureza meramente ordinatória, que não altera a situação do processo." : ", como expedição de documentos, publicações, juntadas e despachos de andamento, que não alteram a situação do processo.") });
      }
    }
    b.push({ t: "sub", texto: "Situação atual e próximos passos" });
    const s = T.situacao(p.movs || []);
    b.push({ t: "p", r: s.texto + (s.proximo ? " " + s.proximo : "") });
    if ((p.comentario || "").trim()) b.push({ t: "p", r: p.comentario.trim().replace(/([^.!?])$/, "$1.") });
    return b;
  }

  /* cfg: { cliente, saudacao, ini, fim, advogados, local, dataTexto, abertura } */
  function montar(cfg, processos) {
    const b = [{ t: "tit", texto: "Relatório processual" }];
    b.push({ t: "tab", larg: [1.3, 3], linhas: [["Cliente", cfg.cliente || "não informado"], ["Período", "de " + br(cfg.ini) + " a " + br(cfg.fim)], ["Processos", String(processos.length)], ["Data do relatório", cfg.dataTexto]] });
    b.push({ t: "p", recuo: false, r: (cfg.saudacao || ("Prezado(a) " + (cfg.cliente || "cliente"))).trim().replace(/[,.]?$/, ",") });
    b.push({ t: "p", r: cfg.abertura || "Apresentamos o relatório de acompanhamento " + (processos.length === 1 ? "do processo" : "dos processos") + " sob responsabilidade deste escritório, referente ao período de " + br(cfg.ini) + " a " + br(cfg.fim) + ". Os andamentos foram descritos em linguagem acessível, com a indicação da situação atual e dos próximos passos de cada feito." });
    processos.forEach((p, i) => b.push(...blocosProcesso(p, i, cfg)));
    b.push({ t: "h", texto: "Considerações finais" });
    const dj = processos.some(p => p.fonte === "datajud");
    b.push({ t: "p", r: (dj ? "As informações foram extraídas da base pública do Conselho Nacional de Justiça (DataJud), que pode apresentar pequena defasagem em relação ao sistema do tribunal, e conferidas pela equipe. " : "") + "Permanecemos à disposição para esclarecer qualquer ponto deste relatório e para agendar reunião, caso seja de seu interesse." });
    b.push({ t: "p", recuo: false, r: "Atenciosamente," });
    b.push({ t: "data", texto: (cfg.local || "Belo Horizonte/MG") + ", " + cfg.dataTexto + "." });
    (cfg.advogados || []).forEach(a => b.push({ t: "ass", nome: a.nome, linhas: ["OAB/" + a.uf + " " + a.oab] }));
    return b;
  }

  root.REL_DOC = { montar };
})(typeof window !== "undefined" ? window : globalThis);
