/* Confronto entre o relatório policial (PDF) e os arquivos do RIF.
   Reconstrói as tabelas do relatório (padrão LAB-LD e similares) a partir da posição do texto no PDF,
   verifica cada transação afirmada contra o relato bancário e aponta valores sem lastro, sentido invertido,
   valores que não são transação (faturamento, renda), dupla contagem, comunicações automáticas tratadas como
   suspeitas, linguagem conclusiva e omissões de elementos favoráveis. */
(function (root) {
  "use strict";
  const M = root.RIF_MOTOR;
  const { digits, fmtDoc, money, brl, perto, sem } = M;

  /* ------------------------------------------------------------------ leitura do PDF */
  async function lerPDF(file, prog) {
    const buf = await file.arrayBuffer();
    const sha = await M.sha256(buf);
    const pdf = await root.pdfjsLib.getDocument({ data: new Uint8Array(buf.slice(0)) }).promise;
    const paginas = [];
    for (let i = 1; i <= pdf.numPages; i++) {
      const pg = await pdf.getPage(i);
      const tc = await pg.getTextContent();
      const itens = tc.items.filter(it => it.str && it.str.trim()).map(it => ({ x: it.transform[4], y: it.transform[5], s: it.str }));
      let texto = linhasDe(itens).map(l => l.map(i => i.s).join(" ")).join("\n");
      let ocr = false;
      if (texto.replace(/\s/g, "").length < 40 && root.Tesseract) {
        prog && prog("Página " + i + " sem texto: aplicando OCR…");
        const vp = pg.getViewport({ scale: 2 });
        const cv = document.createElement("canvas"); cv.width = vp.width; cv.height = vp.height;
        await pg.render({ canvasContext: cv.getContext("2d"), viewport: vp }).promise;
        const w = await root.Tesseract.createWorker("por");
        const r = await w.recognize(cv); await w.terminate();
        texto = r.data.text || ""; ocr = true;
      }
      paginas.push({ n: i, itens, texto, ocr });
      prog && prog("Lendo página " + i + " de " + pdf.numPages);
    }
    return { nome: file.name, sha256: sha, paginas, texto: paginas.map(p => p.texto).join("\n\f\n") };
  }
  function linhasDe(itens) {
    const ord = itens.slice().sort((a, b) => b.y - a.y || a.x - b.x);
    const linhas = [];
    for (const it of ord) {
      const l = linhas.find(l => Math.abs(l.y - it.y) < 2.5);
      if (l) l.push(it); else { const n = [it]; n.y = it.y; linhas.push(n); }
    }
    return linhas.map(l => l.sort((a, b) => a.x - b.x));
  }

  /* ------------------------------------------------------------------ reconstrução de tabelas */
  /* rotulos: [{ rot, re }] com expressão exata do cabeçalho; ancora: rótulo da coluna que define cada linha. */
  function tabela(paginas, rotulos, ancora, reAncora, fimRe) {
    const linhas = [];
    let ativo = false;
    const casa = (r, i) => r.re.test(i.s.trim());
    for (const pg of paginas) {
      const its = pg.itens;
      if (!its.length) continue;
      const rA = rotulos.find(r => r.rot === ancora);
      const candidatos = its.filter(i => casa(rA, i));
      let yCab = null;
      for (const a of candidatos) if (rotulos.every(r => its.some(i => casa(r, i) && Math.abs(i.y - a.y) < 9))) { yCab = a.y; break; }
      const temCab = yCab != null;
      if (!temCab) { ativo = false; continue; }
      ativo = true;
      const cols = rotulos.map(r => { const c = its.find(i => casa(r, i) && Math.abs(i.y - yCab) < 9); return { rot: r.rot, x: c.x }; }).sort((a, b) => a.x - b.x);
      /* cabeçalhos centralizados e células alinhadas à esquerda: o limite entre colunas é o ponto médio entre cabeçalhos vizinhos */
      const limites = cols.map((c, i) => (i === 0 ? -Infinity : (cols[i - 1].x + c.x) / 2));
      const colDe = x => { let k = 0; for (let i = 0; i < cols.length; i++) if (x >= limites[i]) k = i; return cols[k].rot; };
      let yFim = -Infinity;
      if (fimRe) { const f = its.find(i => i.y < yCab - 4 && fimRe.test(sem(i.s))); if (f) { yFim = f.y; ativo = false; } }
      const corpo = its.filter(i => i.y < yCab - 6 && i.y > yFim + 1);
      const anc = corpo.filter(i => colDe(i.x) === ancora && reAncora.test(i.s.trim())).sort((a, b) => b.y - a.y);
      const linhasPg = anc.map(a => ({ y: a.y, celulas: {}, pagina: pg.n }));
      for (const it of corpo) {
        if (!linhasPg.length) break;
        let melhor = null, dist = Infinity;
        for (const l of linhasPg) { const d = Math.abs(l.y - it.y); if (d < dist) { dist = d; melhor = l; } }
        if (dist > 30) continue;
        const col = colDe(it.x);
        (melhor.celulas[col] = melhor.celulas[col] || []).push(it);
      }
      for (const l of linhasPg) {
        const r = { pagina: l.pagina };
        for (const c of cols) r[c.rot] = (l.celulas[c.rot] || []).sort((a, b) => b.y - a.y || a.x - b.x).map(i => i.s).join(" ").replace(/\s+/g, " ").trim();
        linhas.push(r);
      }
    }
    return linhas;
  }
  function pessoa(txt) {
    const m = /(\d{2,3}\.\d{3}\.\d{3}\/\d{4}-\d{2}|\d{3}\.\d{3}\.\d{3}-\d{2})/.exec(txt || "");
    return { nome: (txt || "").replace(/\(?\s*(\d{2,3}\.\d{3}\.\d{3}\/\d{4}-\d{2}|\d{3}\.\d{3}\.\d{3}-\d{2})\s*\)?/, "").trim(), doc: m ? digits(m[1]) : "", docTxt: m ? m[1] : "" };
  }
  function extrairTransacoes(rel) {
    const rot = [{ rot: "Data", re: /^Data$/i }, { rot: "Origem", re: /^Origem/i }, { rot: "Destino", re: /^Destino/i }, { rot: "Valor", re: /^Valor$/i }, { rot: "Sentido", re: /^Sentido/i }, { rot: "Co", re: /^Co(m\.?)?$/i }, { rot: "Comunicante", re: /^Comunicante$/i }, { rot: "Códigos", re: /^C[óo]digos$/i }];
    const rows = tabela(rel.paginas, rot, "Valor", /^R\$\s*[\d.]+,\d{2}$/, /DAS OCORRENCIAS|CONSIDERACOES FINAIS/);
    return rows.map((r, i) => {
      const o = pessoa(r.Origem), d = pessoa(r.Destino);
      return { n: i + 1, pagina: r.pagina, data: r.Data, origem: o, destino: d, valor: money((r.Valor || "").replace(/R\$\s*/, "")), sentido: r.Sentido, com: parseInt(digits(r.Co || ""), 10) || null, codigos: r["Códigos"], bruto: r };
    }).filter(r => r.valor > 0);
  }
  function extrairAlvos(rel) {
    const rot = [{ rot: "Nome", re: /^Nome/i }, { rot: "CPF/CNPJ", re: /^CPF\/CNPJ$/i }, { rot: "Com.", re: /^Com\.?$/i }, { rot: "Entradas", re: /^Entradas/i }, { rot: "Saídas", re: /^Sa[íi]das/i }, { rot: "Fundamento", re: /^Fundamento$/i }];
    const rows = tabela(rel.paginas, rot, "CPF/CNPJ", /^\d{2,3}\.\d{3}\.\d{3}(\/\d{4})?-\d{2}$/, /DOS ALVOS SECUNDARIOS|DO DIAGRAMA/);
    return rows.map(r => ({ nome: r.Nome, doc: digits(r["CPF/CNPJ"]), coms: (r["Com."] || "").split(/[,\s]+/).map(x => parseInt(x, 10)).filter(Boolean), entradas: money((r.Entradas || "").replace(/R\$\s*/, "")), saidas: money((r["Saídas"] || "").replace(/R\$\s*/, "")), fundamento: r.Fundamento, pagina: r.pagina }));
  }

  /* ------------------------------------------------------------------ verificações */
  const NAO_TRANSACAO = [
    [/faturamento/i, "faturamento declarado de empresa"], [/rendimento|renda|percebendo/i, "renda cadastral"], [/capital social/i, "capital social"],
    [/valor total atualizado|recolherem|tesouro|TCU/i, "valor de processo administrativo (TCU) citado em fonte aberta"], [/total R\$|\| Total/i, "total de lançamentos da conta"],
    [/patrim[oô]nio/i, "patrimônio declarado"], [/condenad|devolver aos cofres/i, "valor de condenação citado em fonte aberta"]
  ];
  function contextoValor(texto, valor) {
    const alvo = valor.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const out = []; let i = texto.indexOf(alvo);
    while (i >= 0) { out.push({ ini: i, antes: texto.slice(Math.max(0, i - 140), i), depois: texto.slice(i + alvo.length, i + alvo.length + 60) }); i = texto.indexOf(alvo, i + 1); }
    return out;
  }
  function verificarLinha(row, ds) {
    const c = row.com ? ds.byIdx.get(row.com) : null;
    const achados = [];
    const res = { row, status: "confirmada", achados, fluxo: null };
    const add = (grav, titulo, texto) => achados.push({ grav, titulo, texto });
    if (!c) { res.status = "sem lastro"; add("critico", "Comunicação inexistente", "O relatório atribui a transação à comunicação nº " + (row.com || "?") + ", que não consta do RIF."); return res; }
    const o = row.origem.doc, d = row.destino.doc;
    const fl = ds.fluxos.filter(f => f.idx === c.idx);
    const igual = fl.filter(f => f.de === o && f.para === d);
    const inv = fl.filter(f => f.de === d && f.para === o);
    const okV = igual.find(f => perto(f.valor, row.valor));
    const invV = inv.find(f => perto(f.valor, row.valor));
    if (okV) { res.fluxo = okV; }
    else if (invV) {
      res.status = "sentido invertido"; res.fluxo = invV;
      add("critico", "Sentido do dinheiro invertido", "O relatório afirma que " + row.origem.nome + " enviou " + brl(row.valor) + " a " + row.destino.nome + ". No relato da comunicação " + c.idx + ", porém, " + (invV.c.titular.doc === invV.de ? row.destino.nome + " é o titular e " + row.origem.nome + " consta entre os destinatários dos recursos" : row.origem.nome + " é o titular e " + row.destino.nome + " consta entre os remetentes") + ". O dinheiro percorreu o caminho inverso: de " + row.destino.nome + " para " + row.origem.nome + ". O erro também contamina o diagrama de vínculos.");
    } else if (igual.length) {
      res.status = "valor divergente"; res.fluxo = igual[0];
      let oque = "";
      for (const x of contextoValor(c.texto, row.valor)) for (const [re, rot] of NAO_TRANSACAO) if (!oque && re.test(x.antes.slice(-90))) oque = rot;
      if (oque) res.status = "não é transação";
      add("critico", oque ? "Valor que não corresponde a transação" : "Valor divergente do relato", "O relatório indica " + brl(row.valor) + ", mas o relato da comunicação " + c.idx + " registra " + brl(igual[0].valor) + " (" + igual[0].n + " lançamento(s)) entre as mesmas partes." + (oque ? " O valor de " + brl(row.valor) + " aparece no relato como " + oque + ", e foi convertido pelo relatório em transferência." : ""));
    } else if (inv.length) {
      res.status = "sentido invertido"; res.fluxo = inv[0];
      add("critico", "Sentido invertido e valor divergente", "O relato da comunicação " + c.idx + " registra o fluxo no sentido oposto (de " + row.destino.nome + " para " + row.origem.nome + ") e no valor de " + brl(inv[0].valor) + ", e não " + brl(row.valor) + ".");
    } else {
      const ctx = contextoValor(c.texto, row.valor);
      let motivo = null;
      for (const x of ctx) for (const [re, rot] of NAO_TRANSACAO) if (re.test(x.antes.slice(-90))) { motivo = rot; break; }
      if (motivo) { res.status = "não é transação"; add("critico", "Valor que não corresponde a transação", "O valor de " + brl(row.valor) + " aparece no relato da comunicação " + c.idx + " como " + motivo + ", e não como transferência entre " + row.origem.nome + " e " + row.destino.nome + ". O relatório converteu um dado cadastral ou contextual em “transação suspeita”." + (() => { const r = fl.find(f => (f.de === o || f.para === o) && (f.de === d || f.para === d)); return r ? " O relato registra, entre essas partes, " + brl(r.valor) + " em " + r.n + " lançamento(s)." : ""; })()); }
      else if (c.automatica) { res.status = "automática"; add("relevante", "Comunicação automática sem correspondência nominal", "A comunicação " + c.idx + " é automática (operação em espécie) e não descreve transferência entre " + row.origem.nome + " e " + row.destino.nome + "; a vinculação foi inferida do arquivo de envolvidos."); }
      else { res.status = "sem lastro"; add("critico", "Transação sem lastro no relato", "Não há, no relato da comunicação " + c.idx + ", registro de valor de " + brl(row.valor) + " entre " + row.origem.nome + " e " + row.destino.nome + "."); }
    }
    if (c.automatica) add("relevante", "Comunicação automática tratada como suspeita", "A comunicação " + c.idx + " decorre de critério objetivo de valor (operação em espécie), sem juízo de suspeição do banco, mas foi incluída entre as “transações suspeitas”.");
    const f = res.fluxo;
    if (f && f.mesma) add("relevante", "Recursos de mesma titularidade", "O lançamento corresponde a transferência entre contas de mesma titularidade, sem ingresso de recursos de terceiros.");
    if (row.data && / a /.test(row.data)) res.semData = true;
    return res;
  }

  const CONCLUSIVO = [
    [/lavagem de (dinheiro|capitais)/gi, "lavagem de dinheiro"], [/organiza[çc][ãa]o criminosa/gi, "organização criminosa"], [/\besquemas?\b/gi, "esquema"], [/\blaranjas?\b/gi, "laranja"],
    [/testas? de ferro/gi, "testa de ferro"], [/\bdesvi(o|ou|aram|ados?)\b/gi, "desvio"], [/\bpropinas?\b/gi, "propina"], [/oculta[çc][ãa]o|ocult(ou|aram)/gi, "ocultação"],
    [/dissimula[çc][ãa]o|dissimul(ou|aram)/gi, "dissimulação"], [/empresas? de fachada|empresas? fantasmas?/gi, "empresa de fachada"], [/\bcomprova(m|do|da)?\b/gi, "comprova"], [/\bcertamente\b|\binequivoc/gi, "afirmação categórica"]
  ];
  const RESSALVA = /ind[ií]cios? de|ind[ií]cios? do crime de|poss[ií]vel|suposta?|em tese|a apurar|podendo|eventual|hip[óo]tese|contra a?|lei (n[º°o.]?\s*)?9\.613|preven[çc][ãa]o (à|a)|combate (à|a)|\(\s*$/i;

  function comparar(ds, rel) {
    const achados = [];
    const add = (grav, cat, titulo, texto, extra) => achados.push(Object.assign({ grav, cat, titulo, texto }, extra || {}));
    const T = rel.texto, TU = sem(T);
    const labld = /LABORATORIO DE TECNOLOGIA CONTRA LAVAGEM|DAS TRANSACOES SUSPEITAS/.test(TU);
    const linhas = extrairTransacoes(rel);
    const verif = linhas.map(r => verificarLinha(r, ds));
    const alvos = extrairAlvos(rel);

    /* transações */
    const ruins = verif.filter(v => v.status !== "confirmada");
    const vRuim = ruins.reduce((s, v) => s + v.row.valor, 0), vTot = verif.reduce((s, v) => s + v.row.valor, 0);
    if (linhas.length) {
      const porStatus = {};
      for (const v of verif) porStatus[v.status] = (porStatus[v.status] || 0) + 1;
      add(ruins.length ? "critico" : "informativa", "Transações", "Verificação das " + linhas.length + " transações afirmadas no relatório", "Das " + linhas.length + " transações relacionadas pelo relatório (" + brl(vTot) + "), " + (linhas.length - ruins.length) + " foram confirmadas no relato bancário e " + ruins.length + " apresentam problema (" + Object.entries(porStatus).filter(([k]) => k !== "confirmada").map(([k, n]) => n + " " + k).join(", ") + "), somando " + brl(vRuim) + ".");
    }
    /* duplicidade: o mesmo dinheiro relatado pelas duas contas aparece duas vezes no relatório */
    const dupl = [];
    for (const dd of ds.duplicidades) {
      const a = verif.find(v => v.fluxo === dd.origem), b = verif.find(v => v.fluxo === dd.destino);
      if (a && b) dupl.push({ dd, a, b });
    }
    if (dupl.length) add("critico", "Dupla contagem", "O mesmo dinheiro contado duas vezes", dupl.length + " transferência(s) entre titulares aparecem duas vezes no relatório: uma pela comunicação da conta de origem e outra pela da conta de destino, em períodos sobrepostos. " + dupl.map(x => ds.nomeDe(x.dd.de) + " para " + ds.nomeDe(x.dd.para) + " (com. " + x.dd.origem.idx + ", " + brl(x.dd.origem.valor) + "; com. " + x.dd.destino.idx + ", " + brl(x.dd.destino.valor) + ")").join("; ") + ". Somadas, inflam o total em até " + brl(dupl.reduce((s, x) => s + x.dd.menor, 0)) + ".");
    const semData = verif.filter(v => v.semData).length;
    if (semData) add("relevante", "Datas", "Transações sem data, com o período da comunicação", semData + " das transações do relatório não têm data: o relatório adota o período inteiro da comunicação. Os valores são totais agregados informados pelo banco, e não operações individualizadas.");

    /* totais */
    const totRel = [...T.matchAll(/totalizando\s*R\$\s*([\d.]+,\d{2})/gi)].map(m => money(m[1]));
    for (const v of totRel) if (Math.abs(v - vTot) < 1 && ruins.length) add("critico", "Totais", "Total do relatório inclui valores não confirmados", "O relatório totaliza " + brl(v) + " em “transações suspeitas”, mas " + brl(vRuim) + " correspondem a transações não confirmadas no RIF (sem lastro, invertidas, com valor divergente, valores que não são transação ou comunicações automáticas). O total confirmável é de " + brl(v - vRuim) + ", antes ainda da exclusão de duplicidades.");
    const valores = [...T.matchAll(/R\$\s*([\d.]+,\d{2})/g)].map(m => ({ v: money(m[1]), i: m.index }));
    const usados = new Set();
    for (const x of valores) {
      if (usados.has(x.v)) continue;
      if (perto(x.v, ds.tot.somaA, 0.0005)) { usados.add(x.v); add("critico", "Dupla contagem", "Volume bruto apresentado como movimentação", "O relatório cita " + brl(x.v) + ", que corresponde à soma de créditos e débitos de todas as comunicações. O mesmo dinheiro é contado na entrada e na saída; os créditos efetivos somam " + brl(ds.tot.cred) + "."); continue; }
      const cA = ds.com.find(c => c.seg === 41 && perto(x.v, c.A, 0.0005) && c.B > 0 && c.C > 0);
      if (cA) { usados.add(x.v); add("relevante", "Dupla contagem", "Total bruto de comunicação citado como valor movimentado", "O valor de " + brl(x.v) + " é o total da comunicação " + cA.idx + " (créditos de " + brl(cA.B) + " somados a débitos de " + brl(cA.C) + ")."); }
    }
    /* alvos principais */
    for (const a of alvos) {
      const T2 = ds.titulares.get(a.doc);
      if (/centralidade/i.test(a.fundamento || "")) { add("relevante", "Metodologia", "Alvo definido por algoritmo de rede: " + a.nome, "O relatório fundamenta a condição de “alvo principal” de " + a.nome + " em “" + a.fundamento + "”, isto é, na posição do nome em um grafo de vínculos montado automaticamente, e não em conduta concreta. Centralidade mede conexões, não ilicitude."); }
      if (T2) {
        const auto = T2.coms.filter(c => c.automatica).reduce((s, c) => s + c.B, 0);
        const neutro = T2.coms.reduce((s, c) => s + c.economia.vNeutro + c.economia.mesmaCred, 0);
        if (a.entradas && (auto + neutro) > 0.05 * a.entradas) add("relevante", "Recursos próprios", "Entradas atribuídas a " + a.nome + " incluem recursos próprios ou automáticos", "O relatório atribui a " + a.nome + " entradas de " + brl(a.entradas) + ". Desse total, " + brl(neutro) + " correspondem a resgates de aplicação, empréstimos, estornos, devoluções ou transferências de mesma titularidade" + (auto ? ", e " + brl(auto) + " a comunicações automáticas de espécie" : "") + ". Os créditos de terceiros somam " + brl(Math.max(0, a.entradas - neutro - auto)) + ".");
      }
    }
    /* pessoas citadas */
    const docsRel = [...T.matchAll(/(\d{2,3}\.\d{3}\.\d{3}\/\d{4}-\d{2}|\d{3}\.\d{3}\.\d{3}-\d{2})/g)].map(m => ({ doc: digits(m[1]), txt: m[1], i: m.index }));
    const fora = [...new Map(docsRel.filter(d => !ds.ents.has(d.doc) && !ds.com.some(c => c.texto.includes(d.txt))).map(d => [d.doc, d])).values()];
    if (fora.length) add("critico", "Pessoas", "Pessoas citadas no relatório e ausentes do RIF", "O relatório menciona " + fora.map(d => d.txt).join(", ") + ", documento(s) que não constam dos arquivos nem dos relatos do RIF.");
    const soOutros = [...new Set(linhas.flatMap(r => [r.origem.doc, r.destino.doc]))].filter(d => d && ds.ents.has(d) && !ds.titulares.has(d));
    if (soOutros.length && labld) add("relevante", "Pessoas", "Contrapartes tratadas como alvos secundários", soOutros.length + " pessoas físicas e jurídicas aparecem no relatório como “alvos secundários” apenas por terem transacionado com titulares. No RIF, elas não são comunicadas: figuram como contrapartes citadas pelo banco, sem qualquer juízo de atipicidade sobre suas próprias contas.");

    /* linguagem */
    for (const [re, rot] of CONCLUSIVO) {
      const ms = [...T.matchAll(re)].filter(m => !RESSALVA.test(T.slice(Math.max(0, m.index - 40), m.index)) && !/^\s*\)/.test(T.slice(m.index + m[0].length, m.index + m[0].length + 3)));
      if (ms.length) add("relevante", "Linguagem", "Afirmação conclusiva: “" + rot + "” (" + ms.length + ")", "O relatório emprega “" + rot + "” sem ressalva, enquanto o RIF se limita a hipóteses (“podendo configurar indícios”). Trecho: “" + T.slice(Math.max(0, ms[0].index - 90), ms[0].index + 90).replace(/\s+/g, " ").trim() + "”.");
    }
    if (/TRANSACOES SUSPEITAS/.test(TU) && ds.tot.automaticas.length) add("relevante", "Linguagem", "“Transações suspeitas” abrangendo comunicações automáticas", "O relatório denomina “transações suspeitas” o conjunto das operações, mas " + ds.tot.automaticas.length + " comunicação(ões) do RIF (" + ds.tot.automaticas.map(c => c.idx).join(", ") + ") são automáticas, sem juízo de suspeição.");
    if (/EXTRAIDOS DAS INFORMACOES ADICIONAIS/.test(TU)) add("relevante", "Metodologia", "Valores extraídos do texto livre do banco", "O próprio relatório declara que valores, contrapartes e datas foram “extraídos das informações adicionais redigidas pelas instituições comunicantes”. Trata-se de leitura interpretativa de texto livre, e não de extrato bancário; a nota técnica do Ministério Público (NT CACOP 02/2026) reconhece que o relatório de análise é interpretativo e não pode ser apresentado como fonte primária.");

    /* omissões */
    const omis = [];
    const p = ds.pontos;
    const temTipo = t => p.some(x => x.tipo === t);
    if (temTipo("comunicação automática") && !/AUTOMATIC|IGUAL OU SUPERIOR|ESPECIE/.test(TU)) omis.push("a natureza automática de " + ds.tot.automaticas.length + " comunicação(ões) de espécie, que não envolvem juízo de suspeição");
    if (temTipo("recursos próprios") && !/RESGATE|MESMA TITULARIDADE|EMPRESTIMO/.test(TU)) omis.push("os resgates de aplicação, empréstimos, estornos e transferências de mesma titularidade que compõem parte relevante dos créditos (" + brl(ds.tot.neutros) + ")");
    if (p.some(x => /faturamento/.test(x.titulo)) && !/FATURAMENTO/.test(TU)) omis.push("a compatibilidade da movimentação com o faturamento declarado no próprio relato");
    if (p.some(x => /empresa do próprio titular/.test(x.titulo)) && !/SOCI[OA]/.test(TU)) omis.push("a condição de sócio(a) do titular na empresa remetente, que explica parte dos créditos");
    if (ds.com.some(c => c.relato.semVinculo) && !/NAO FOI POSSIVEL ESTABELECER/.test(TU)) omis.push("o registro do próprio banco de que não foi possível estabelecer vínculo, o que revela desconhecimento, e não ilicitude");
    if (ds.inconsistencias.some(i => /planilha/.test(i.titulo)) && !/NOTACAO|CORROMPID|PLANILHA/.test(TU)) omis.push("os sinais de alteração dos arquivos em planilha eletrônica");
    if (ds.inconsistencias.some(i => /Mesma titularidade/.test(i.titulo))) omis.push("o lançamento de “mesma titularidade” vinculado a CPF de outra pessoa");
    if (omis.length) add("relevante", "Omissões", "Elementos favoráveis presentes no RIF e omitidos no relatório", "O relatório não menciona: " + omis.join("; ") + ".");

    const ordem = { critico: 0, relevante: 1, informativa: 2 };
    achados.sort((a, b) => ordem[a.grav] - ordem[b.grav]);
    return { labld, linhas, verif, alvos, achados, vTot, vRuim, dupl };
  }

  root.RIF_COMPARADOR = { lerPDF, comparar, extrairTransacoes, extrairAlvos, verificarLinha };
})(typeof window !== "undefined" ? window : globalThis);
