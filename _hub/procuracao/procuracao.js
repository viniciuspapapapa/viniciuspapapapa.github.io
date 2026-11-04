/* Procurações no padrão TPC (skill procuracao-tpc): texto com concordância de gênero e número, quatro modalidades
   (defesa nos autos, cópia dos autos, representação criminal ou notícia-crime, queixa-crime do art. 44 do CPP),
   poderes especiais e geração do .docx sobre o arquivo-base institucional (o gerador só substitui o corpo). */
(function (root) {
  "use strict";

  const ADVOGADOS = [
    { id: "renato", nome: "Renato Dilly Campos", uf: "MG", oab: "166.263", g: "m" },
    { id: "vinicius", nome: "Vinícius Papa Soares", uf: "MG", oab: "183.978", g: "m" },
    { id: "rodrigo", nome: "Rodrigo Peixoto da Silva", uf: "MG", oab: "200.789", g: "m" },
    { id: "lais", nome: "Lais Azevedo de Oliveira", uf: "MG", oab: "213.492", g: "f" },
    { id: "eduardo", nome: "Eduardo Paoliello Nicolau", uf: "MG", oab: "80.702", g: "m" }
  ];
  const PADRAO = ["renato", "vinicius", "rodrigo", "lais"];
  const SOCIEDADE = "TPC – Toledo, Paoliello, de Paula, Campos, Cunha e Cordeiro";
  const CNPJ_SOC = "15.581.482/0001-98";
  const PROCEDIMENTOS = [
    ["Ação Penal", "f"], ["Inquérito Policial", "m"], ["Procedimento Investigatório Criminal", "m"], ["Habeas Corpus", "m"],
    ["Revisão Criminal", "f"], ["Apelação Criminal", "f"], ["Execução Penal", "f"], ["Medida Cautelar", "f"],
    ["Pedido de Busca e Apreensão", "m"], ["Notícia de Fato", "f"], ["Termo Circunstanciado de Ocorrência", "m"], ["Representação Fiscal para Fins Penais", "f"]
  ];
  const MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];

  const lista = a => (a.length <= 1 ? a.join("") : a.slice(0, -1).join(", ") + " e " + a[a.length - 1]);
  const fim = s => String(s || "").trim().replace(/[.;,\s]+$/, "");
  function dataExtenso(d) { return (d.getUTCDate() === 1 ? "1º" : String(d.getUTCDate())) + " de " + MESES[d.getUTCMonth()] + " de " + d.getUTCFullYear(); }

  /* ------------------------------------------------------------------ concordância */
  function constituinte(outs) {
    const fem = outs.every(o => o.tipo === "pj" || o.g === "f");
    if (outs.length > 1) return fem ? { de: "das Constituintes", art: "as Constituintes", verbo: "concedem", nomeia: "nomeiam e constituem" } : { de: "dos Constituintes", art: "os Constituintes", verbo: "concedem", nomeia: "nomeiam e constituem" };
    return fem ? { de: "da Constituinte", art: "a Constituinte", verbo: "concede", nomeia: "nomeia e constitui" } : { de: "do Constituinte", art: "o Constituinte", verbo: "concede", nomeia: "nomeia e constitui" };
  }
  function procuradores(advs) {
    const fem = advs.every(a => a.g === "f"), um = advs.length === 1;
    return {
      seus: um ? (fem ? "sua procuradora" : "seu procurador") : (fem ? "suas procuradoras" : "seus procuradores"),
      integrantes: um ? (fem ? "integrante" : "integrante") : advs.length === 2 ? (fem ? "ambas integrantes" : "ambos integrantes") : (fem ? "todas integrantes" : "todos integrantes"),
      aos: um ? (fem ? "à Procuradora ora constituída" : "ao Procurador ora constituído") : (fem ? "às Procuradoras ora constituídas" : "aos Procuradores ora constituídos")
    };
  }
  const flex = (g, m, f) => (g === "f" ? f : m);

  /* ------------------------------------------------------------------ parágrafos (trechos [texto, estilo]) */
  function qualificacao(o) {
    if (o.tipo === "pj") {
      const r = [[o.razao, "b"], [", pessoa jurídica de direito privado, inscrita no CNPJ sob o nº " + o.cnpj + (o.sede ? ", com sede na " + fim(o.sede) : "") + ", neste ato representada por " + flex(o.repG, "seu ", "sua ") + (fim(o.cargo) || flex(o.repG, "sócio administrador", "sócia administradora")) + ", ", "n"], [o.repNome, "b"],
        [", " + (o.repNac || flex(o.repG, "brasileiro", "brasileira")) + ", " + flex(o.repG, "inscrito", "inscrita") + " no CPF sob o nº " + o.repCpf, "n"]];
      return r;
    }
    const partes = [o.nac || flex(o.g, "brasileiro", "brasileira")];
    if (o.estadoCivil) partes.push(o.estadoCivil);
    if (o.profissao) partes.push(o.profissao);
    partes.push(flex(o.g, "inscrito", "inscrita") + " no CPF sob o nº " + o.cpf);
    if (o.rg) partes.push(flex(o.g, "portador", "portadora") + " do RG nº " + o.rg);
    if (o.endereco) partes.push(flex(o.g, "residente e domiciliado", "residente e domiciliada") + " na " + fim(o.endereco));
    return [[o.nome, "b"], [", " + partes.join(", "), "n"]];
  }
  function paragrafoQualificacao(outs, advs) {
    const c = constituinte(outs), p = procuradores(advs), r = [["Pelo presente instrumento particular de mandato, ", "n"]];
    outs.forEach((o, i) => { if (i > 0) r.push([i === outs.length - 1 ? ", e " : ", ", "n"]); r.push(...qualificacao(o)); });
    r.push([", " + c.nomeia + " " + p.seus + " ", "n"]);
    advs.forEach((a, i) => {
      if (i > 0) r.push([i === advs.length - 1 ? ", e " : ", ", "n"]);
      r.push([a.nome, "b"], [", " + flex(a.g, "inscrito", "inscrita") + " na OAB/" + a.uf + " sob o nº " + a.oab, "n"]);
    });
    r.push([", " + p.integrantes + " da sociedade de advogados ", "n"], [SOCIEDADE, "b"], [", inscrita no CNPJ sob o nº " + CNPJ_SOC + ".", "n"]);
    return r;
  }
  const artigo = (g, prep) => (prep === "de" ? (g === "f" ? "da" : "do") : g === "f" ? "a" : "o");
  /* procedimentos: [{ tipo, g, numero, orgao }] */
  function autos(procs) {
    const mesmos = procs.length === 1 || procs.every(p => fim(p.orgao) && fim(p.orgao) === fim(procs[0].orgao));
    const desc = procs.map(p => artigo(p.g, "de") + " " + p.tipo + " nº " + p.numero + (!mesmos && fim(p.orgao) ? ", em trâmite perante " + fim(p.orgao) : ""));
    const fem = procs.every(p => p.g === "f");
    const amb = procs.length === 2 ? (fem ? "ambas" : "ambos") : (fem ? "todas" : "todos");
    const orgao = !procs.length || !fim(procs[0].orgao) || !mesmos ? "" : procs.length === 1 ? ", em trâmite perante " + fim(procs[0].orgao) : ", " + amb + " em trâmite perante " + fim(procs[0].orgao);
    const texto = mesmos || desc.length < 2 ? lista(desc) : desc.slice(0, -1).join(", ") + ", e " + desc[desc.length - 1];
    return { texto, orgao, varios: procs.length > 1 };
  }
  function paragrafoObjeto(d, c) {
    const procs = d.procedimentos.filter(p => fim(p.numero));
    if (d.modalidade === "copia") {
      const a = autos(procs);
      return [["Esta procuração concede poderes exclusivos para obtenção de cópia dos autos " + a.texto + a.orgao + ".", "n"]];
    }
    if (d.modalidade === "defesa") {
      const a = autos(procs);
      const ip = procs.length === 1 && /^Inquérito|^Procedimento Investigatório|^Termo Circunstanciado|^Notícia de Fato/.test(procs[0].tipo);
      let t = "O presente mandato é outorgado para a defesa dos interesses jurídicos " + c.de + " nos autos " + a.texto;
      if (ip) t += a.orgao + ", bem como da ação penal e de quaisquer procedimentos dele decorrentes, e dos recursos e demais incidentes, em qualquer instância ou tribunal";
      else if (a.varios) t += a.orgao + ", bem como de qualquer outro procedimento correlato aos feitos, e dos recursos e demais incidentes deles decorrentes, em qualquer instância ou tribunal";
      else t += ", bem como de qualquer outro procedimento correlato ao feito" + a.orgao + ", e dos recursos e demais incidentes deles decorrentes, em qualquer instância ou tribunal";
      if (d.superiores) t += ", inclusive perante o Superior Tribunal de Justiça e o Supremo Tribunal Federal";
      return [[t + ".", "n"]];
    }
    const vinc = procs.length ? ", inclusive nos autos " + autos(procs).texto + autos(procs).orgao : "";
    if (d.modalidade === "representacao") {
      const especie = { noticia: "notícia-crime", representacao: "representação criminal", ambas: "notícia-crime e representação criminal" }[d.especie];
      const base = { noticia: "do art. 5º, II, do Código de Processo Penal", representacao: "do art. 39 do Código de Processo Penal", ambas: "dos arts. 5º, II, e 39 do Código de Processo Penal" }[d.especie];
      const r = [["O presente mandato é outorgado para a representação dos interesses jurídicos " + c.de + ", na qualidade de vítima, com poderes específicos para oferecer " + especie + (d.representado ? " em face de " : ""), "n"]];
      if (d.representado) r.push([fim(d.representado), "b"]);
      r.push([", em razão do fato consistente em " + fim(d.fato) + (d.tipificacao ? ", em tese " + fim(d.tipificacao) : "") + ", nos termos " + base + vinc + ", bem como para acompanhar o respectivo procedimento investigatório e a eventual ação penal" + (d.assistente ? ", inclusive habilitando-se como assistente de acusação, nos termos dos arts. 268 e seguintes do Código de Processo Penal" : "") + ".", "n"]);
      return r;
    }
    /* queixa-crime: art. 44 do CPP exige poderes especiais, o nome do querelado e a menção ao fato criminoso */
    return [["O presente mandato é outorgado para a representação dos interesses jurídicos " + c.de + ", na qualidade de vítima, com poderes especiais para oferecer queixa-crime em face de ", "n"], [fim(d.querelado), "b"],
      [", pela prática do fato consistente em " + fim(d.fato) + (d.tipificacao ? ", em tese " + fim(d.tipificacao) : "") + ", nos termos do art. 44 do Código de Processo Penal" + vinc + ", bem como para acompanhar a respectiva ação penal privada e os recursos e demais incidentes dela decorrentes, em qualquer instância ou tribunal.", "n"]];
  }
  function paragrafosEspeciais(d, c) {
    const out = [];
    if (d.modalidade === "copia") return out;
    if (d.acordos) out.push([["O presente mandato confere, ainda, poderes especiais para negociar, aceitar e firmar acordo de não persecução penal, transação penal e suspensão condicional do processo, bem como prestar declarações em nome " + c.de + ", quando admitido em lei.", "n"]]);
    if (d.valores) out.push([["O presente mandato confere, ainda, poderes especiais para receber e dar quitação, levantar alvarás e requerer a restituição de bens e valores apreendidos.", "n"]]);
    return out;
  }
  function paragrafoPoderes(d, c, p) {
    if (d.modalidade === "copia" && !d.copiaClausulaCompleta)
      return [["Para o fiel cumprimento deste mandato, " + c.art + " " + c.verbo + " " + p.aos + " poderes para requerer vista, examinar, obter cópias, digitalizar e extrair certidões dos referidos autos, inclusive dos que tramitem sob sigilo, nos termos do art. 7º, XIII, XIV e § 10, da Lei nº 8.906/1994 e da Súmula Vinculante 14, bem como para substabelecer, no todo ou em parte, com ou sem reserva de poderes.", "n"]];
    return [["Para o fiel cumprimento deste mandato, " + c.art + " " + c.verbo + " " + p.aos + " os poderes da cláusula ", "n"], ["ad judicia et extra", "i"],
      [", podendo atuar em qualquer instância, produzir provas, fazer alegações, acompanhar depoimentos de testemunhas, interpor e arrazoar quaisquer recursos e contrarrazoar os eventualmente interpostos, receber intimações e notificações, bem como praticar todos e quaisquer atos necessários ao fiel cumprimento do presente mandato, podendo, inclusive, substabelecer no todo ou em parte, com ou sem reserva de poderes.", "n"]];
  }

  /* validação: nenhuma procuração sai com lacunas */
  const CPF = /^\d{3}\.\d{3}\.\d{3}-\d{2}$/, CNPJ = /^\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}$/;
  function validar(d) {
    const f = [];
    if (!d.outorgantes.length) f.push("ao menos um outorgante");
    d.outorgantes.forEach((o, i) => {
      const n = d.outorgantes.length > 1 ? " do outorgante " + (i + 1) : " do outorgante";
      if (o.tipo === "pj") { if (!fim(o.razao)) f.push("razão social" + n); if (!CNPJ.test(o.cnpj || "")) f.push("CNPJ" + n + " no formato 00.000.000/0000-00"); if (!fim(o.repNome)) f.push("nome do representante legal" + n); if (!CPF.test(o.repCpf || "")) f.push("CPF do representante legal" + n + " no formato 000.000.000-00"); }
      else { if (!fim(o.nome)) f.push("nome" + n); if (!CPF.test(o.cpf || "")) f.push("CPF" + n + " no formato 000.000.000-00"); }
    });
    if (!d.advogados.length) f.push("ao menos um advogado");
    d.advogados.forEach(a => { if (!fim(a.nome) || !/^[\d.]+$/.test(a.oab || "") || !/^[A-Z]{2}$/.test(a.uf || "")) f.push("nome, UF e número da OAB de cada advogado"); });
    const procs = d.procedimentos.filter(p => fim(p.numero));
    if ((d.modalidade === "defesa" || d.modalidade === "copia") && !procs.length) f.push("o número do processo ou procedimento");
    if ((d.modalidade === "defesa" || d.modalidade === "copia") && procs.some(p => !fim(p.orgao))) f.push("o órgão em que tramita cada procedimento");
    if (d.modalidade === "queixa") { if (!fim(d.querelado)) f.push("o nome do querelado (art. 44 do CPP)"); if (!fim(d.fato)) f.push("a menção ao fato criminoso (art. 44 do CPP)"); }
    if (d.modalidade === "representacao" && !fim(d.fato)) f.push("a descrição do fato");
    if (!fim(d.local)) f.push("o local");
    return [...new Set(f)];
  }

  function montar(d) {
    const c = constituinte(d.outorgantes), p = procuradores(d.advogados);
    const paragrafos = [paragrafoQualificacao(d.outorgantes, d.advogados), paragrafoObjeto(d, c), ...paragrafosEspeciais(d, c), paragrafoPoderes(d, c, p)];
    const assinaturas = d.outorgantes.map(o => (o.tipo === "pj" ? { nome: o.razao, linhas: ["CNPJ nº " + o.cnpj, "p.p. " + o.repNome] } : { nome: o.nome, linhas: ["CPF nº " + o.cpf] }));
    return { titulo: "Procuração", paragrafos, local_data: fim(d.local) + ", " + dataExtenso(d.data) + ".", assinaturas };
  }

  /* ------------------------------------------------------------------ .docx (mesmo XML do gerador da skill) */
  const X = s => String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const FONT = '<w:rFonts w:ascii="Segoe UI" w:eastAsia="Segoe UI" w:hAnsi="Segoe UI" w:cs="Segoe UI"/>';
  const RPR = { n: "<w:rPr>" + FONT + "</w:rPr>", b: "<w:rPr>" + FONT + "<w:b/><w:bCs/><w:smallCaps/></w:rPr>", bo: "<w:rPr>" + FONT + "<w:b/><w:bCs/></w:rPr>", i: "<w:rPr>" + FONT + "<w:i/><w:iCs/></w:rPr>" };
  const BODY_PPR = '<w:pPr><w:spacing w:after="240" w:line="288" w:lineRule="auto"/><w:jc w:val="both"/></w:pPr>';
  const run = (t, s) => "<w:r>" + RPR[s || "n"] + '<w:t xml:space="preserve">' + X(t) + "</w:t></w:r>";
  const para = (ppr, runs) => "<w:p>" + ppr + (runs || "") + "</w:p>";
  function corpo(spec) {
    const out = [];
    out.push(para('<w:pPr><w:spacing w:before="240" w:after="480"/><w:jc w:val="center"/><w:rPr>' + FONT + '<w:b/><w:bCs/><w:smallCaps/><w:sz w:val="28"/><w:szCs w:val="28"/></w:rPr></w:pPr>'));
    out.push(para('<w:pPr><w:spacing w:before="240" w:after="480"/><w:jc w:val="center"/><w:rPr><w:sz w:val="28"/><w:szCs w:val="28"/></w:rPr></w:pPr>',
      "<w:r><w:rPr>" + FONT + '<w:b/><w:bCs/><w:smallCaps/><w:sz w:val="28"/><w:szCs w:val="28"/></w:rPr><w:t xml:space="preserve">' + X(spec.titulo) + "</w:t></w:r>"));
    for (const p of spec.paragrafos) out.push(para(BODY_PPR, p.map(([t, s]) => run(t, s)).join("")));
    out.push(para('<w:pPr><w:spacing w:after="240" w:line="288" w:lineRule="auto"/><w:jc w:val="both"/><w:rPr>' + FONT + "</w:rPr></w:pPr>"));
    out.push(para('<w:pPr><w:keepNext/><w:spacing w:before="240" w:after="900"/></w:pPr>', run(spec.local_data)));
    const keep = '<w:pPr><w:keepNext/><w:keepLines/><w:jc w:val="center"/></w:pPr>', last = '<w:pPr><w:jc w:val="center"/></w:pPr>';
    spec.assinaturas.forEach((a, i) => {
      if (i > 0) out.push(para('<w:pPr><w:keepNext/><w:spacing w:before="0" w:after="900"/></w:pPr>'));
      const l = a.linhas || [];
      out.push(para(keep, run("_".repeat(44))));
      out.push(para(l.length ? keep : last, run(a.nome, "b")));
      l.forEach((x, j) => out.push(para(j < l.length - 1 ? keep : last, run(x))));
    });
    return out.join("");
  }
  async function docx(spec, urlModelo) {
    if (!root.JSZip) throw new Error("A biblioteca de geração do Word não foi carregada. Verifique a conexão e recarregue a página.");
    const r = await fetch(urlModelo); if (!r.ok) throw new Error("Não foi possível carregar o modelo da procuração.");
    const z = await root.JSZip.loadAsync(await r.arrayBuffer());
    const doc = await z.file("word/document.xml").async("string");
    if (!doc.includes("{{BODY}}")) throw new Error("Modelo da procuração inválido.");
    z.file("word/document.xml", doc.replace("{{BODY}}", corpo(spec)));
    const agora = new Date().toISOString().replace(/\.\d+Z$/, "Z");
    z.file("docProps/core.xml", (await z.file("docProps/core.xml").async("string")).split("{{DATA}}").join(agora));
    return z.generateAsync({ type: "blob", mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" });
  }
  /* pré-visualização */
  const esc = s => String(s == null ? "" : s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  function html(spec) {
    const tr = p => p.map(([t, s]) => (s === "b" ? '<b class="vs">' + esc(t) + "</b>" : s === "i" ? "<i>" + esc(t) + "</i>" : s === "bo" ? "<b>" + esc(t) + "</b>" : esc(t))).join("");
    return '<img class="pv-logo" src="../assets/tpc-cabecalho.png" alt="TPC Advogados"><h2 class="pv-tit">' + esc(spec.titulo) + "</h2>" + spec.paragrafos.map(p => "<p>" + tr(p) + "</p>").join("") +
      '<p class="pv-data">' + esc(spec.local_data) + "</p>" + spec.assinaturas.map(a => '<div class="pv-ass"><div>' + "_".repeat(44) + '</div><b class="vs">' + esc(a.nome) + "</b>" + (a.linhas || []).map(l => "<div>" + esc(l) + "</div>").join("") + "</div>").join("") +
      '<div class="pv-rod"><span>Belo Horizonte | São Paulo | Brasília | Cuiabá | João Monlevade</span><span><b>TPCADVOGADOS</b>.COM.BR</span></div>';
  }
  function texto(spec) { return [spec.titulo.toUpperCase(), ...spec.paragrafos.map(p => p.map(x => x[0]).join("")), spec.local_data, ...spec.assinaturas.map(a => [a.nome, ...(a.linhas || [])].join("\n"))].join("\n\n"); }

  root.PROCURACAO = { ADVOGADOS, PADRAO, PROCEDIMENTOS, montar, validar, docx, html, texto, dataExtenso };
})(typeof window !== "undefined" ? window : globalThis);
