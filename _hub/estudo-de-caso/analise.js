/* Motor de estudo de caso sem IA: lê o texto dos autos (com páginas e IDs), identifica peças, datas, pessoas,
   tipificação, sinais de nulidade e contradições, classifica as provas e redige o estudo no formato do modelo TPC
   (# seções, ## subseções, parágrafos, > citações e tabelas), tudo por regras, no próprio navegador. */
(function (root) {
  "use strict";
  const K = root.EC_CATALOGO;
  const sem = s => String(s || "").normalize("NFC").normalize("NFD").replace(/[̀-ͯ]/g, "");
  const baixo = s => sem(s).toLowerCase();
  const lista = a => (a.length <= 1 ? a.join("") : a.slice(0, -1).join(", ") + " e " + a[a.length - 1]);
  const n = (x, s, p) => x + " " + (x === 1 ? s : p);
  const MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
  const dataBR = d => String(d.getUTCDate()).padStart(2, "0") + "/" + String(d.getUTCMonth() + 1).padStart(2, "0") + "/" + d.getUTCFullYear();
  const pena = m => { if (!m) return "sem pena privativa de liberdade"; const a = Math.floor(m / 12), r = m % 12; return [a ? a + (a === 1 ? " ano" : " anos") : "", r ? r + (r === 1 ? " mês" : " meses") : ""].filter(Boolean).join(" e "); };

  /* ------------------------------------------------------------------ páginas */
  function paginas(leitura) {
    const varios = leitura.docs.length > 1, out = [];
    leitura.docs.forEach(d => d.paginas.forEach(p => {
      const t = String(p.texto || "").normalize("NFC");
      out.push({ ref: (varios ? d.nome.replace(/\.pdf$/i, "") + ", " : "") + "pág. " + p.n + (p.id ? ", " + p.id : ""), n: p.n, doc: d.nome, texto: t, low: baixo(t), up: sem(t).toUpperCase(), ocr: p.ocr, conf: p.conf });
    }));
    return out;
  }
  function trecho(pg, idx, max) {
    max = max || 300;
    const t = pg.texto;
    let a = Math.max(0, t.lastIndexOf(".", idx - 1) + 1), b = t.indexOf(".", idx);
    if (b < 0) b = t.length; else b += 1;
    let ini = "", fimTxt = "";
    if (idx - a > max * 0.6) { a = idx - Math.round(max * 0.6); const sp = t.indexOf(" ", a); if (sp > 0 && sp < idx) a = sp + 1; ini = "(...) "; }
    if (b - a > max) { b = a + max; const sp = t.lastIndexOf(" ", b); if (sp > a) b = sp; fimTxt = " (...)"; }
    return ini + t.slice(a, b).replace(/\s+/g, " ").trim() + fimTxt;
  }
  const refsDe = pgs => { const r = pgs.map(p => p.ref); return r.length > 4 ? r.slice(0, 4).join("; ") + " e outras" : r.join("; "); };

  /* ------------------------------------------------------------------ peças */
  function subtipo(id, up) {
    const topo = up.slice(0, 1800);
    if (id === "depoimento") return /CONDUTOR|POLICIA(L)? MILITAR|\bPM\b|SOLDADO|CABO\b|SARGENTO|INVESTIGADOR|AGENTE DE POLICIA|ESCRIVAO|GUARDA MUNICIPAL/.test(topo) ? "policial" : /VITIMA|OFENDID/.test(topo) ? "vitima" : "testemunha";
    if (id === "laudo") return /TOXICOLOGIC|DEFINITIV/.test(topo) && !/CONSTATACAO|PRELIMINAR/.test(topo) ? "toxicologico definitivo" : /CONSTATACAO|PRELIMINAR/.test(topo) ? "constatação preliminar" : /NECROSCOP|CADAVERIC/.test(topo) ? "necroscópico" : /CORPO DE DELITO|LESO|LESAO/.test(topo) ? "corpo de delito" : /ARMA|EFICIENCIA|BALISTIC/.test(topo) ? "arma de fogo" : /INFORMATICA|CELULAR|EXTRACAO|DADOS/.test(topo) ? "informática" : "pericial";
    return "";
  }
  const ROT_SUB = { policial: "Depoimento de policial", vitima: "Declarações da vítima", testemunha: "Depoimento de testemunha" };
  function pecas(pgs) {
    const itens = [];
    pgs.forEach((p, i) => {
      for (const [id, rot, re] of K.PECAS) {
        const alvo = id === "denuncia" || id === "sentenca" ? p.up.slice(0, 4000) : p.up.slice(0, 1500);
        if (!re.test(alvo)) continue;
        const sub = subtipo(id, p.up);
        const ult = itens[itens.length - 1];
        if (ult && ult.id === id && ult.sub === sub && ult.ultimo === i - 1) { ult.pgs.push(p); ult.ultimo = i; }
        else itens.push({ id, sub, rot: id === "depoimento" ? ROT_SUB[sub] : id === "laudo" ? "Laudo " + sub : rot, pgs: [p], ultimo: i });
        if (id !== "laudo" && id !== "depoimento") break;
      }
    });
    itens.forEach(it => { it.ref = refsDe(it.pgs); it.low = it.pgs.map(p => p.low).join("\n"); });
    return itens;
  }

  /* ------------------------------------------------------------------ tipificação */
  const PALAVRAS = [[/trafico de (drogas|entorpecentes)/, "11.343", "33"], [/associacao para o trafico/, "11.343", "35"], [/lavagem de (dinheiro|capitais)/, "9.613", "1"], [/organizacao criminosa/, "12.850", "2"], [/\broubo\b/, "CP", "157"], [/\bfurto\b/, "CP", "155"], [/estelionato/, "CP", "171"], [/homicidio/, "CP", "121"], [/receptacao/, "CP", "180"], [/porte ilegal de arma/, "10.826", "14"], [/embriaguez ao volante/, "9.503", "306"]];
  function crimes(pgs, itens) {
    const peso = new Map(), pagsDe = new Map();
    const fortes = new Set(itens.filter(i => ["denuncia", "recebimento", "sentenca", "relatorio", "apf"].includes(i.id)).flatMap(i => i.pgs));
    const add = (d, a, pg, w) => { const c = K.CRIMES.find(x => x.d === d && x.a === a); if (!c) return; const k = d + "|" + a; peso.set(k, (peso.get(k) || 0) + w * (fortes.has(pg) ? 5 : 1)); const s = pagsDe.get(k) || new Set(); s.add(pg); pagsDe.set(k, s); };
    for (const pg of pgs) {
      const t = pg.low, r = /\bart(?:igo)?s?\.?\s*(\d{1,3}(?:-[a-z])?)\b/g; let m;
      while ((m = r.exec(t))) {
        const art = m[1].toUpperCase(), jan = t.slice(m.index, m.index + 110);
        const lei = /lei\s*(?:n[º°o.]*\s*)?(\d{1,2}\.\d{3})/.exec(jan);
        if (lei) { add(lei[1], art.replace(/^0+/, ""), pg, 1); continue; }
        if (/processo penal|\bcpp\b|constituic|\bcf\b|execucao penal|\blep\b|civil|\bcpc\b|\bctb\b/.test(jan.slice(0, 70))) continue;
        if (/codigo penal|\bcp\b/.test(jan)) add("CP", art, pg, 1);
        else if (fortes.has(pg)) add("CP", art, pg, 0.5);
      }
      for (const [re, d, a] of PALAVRAS) if (re.test(t)) add(d, a, pg, 0.4);
    }
    return [...peso.entries()].filter(([, w]) => w >= 1).sort((a, b) => b[1] - a[1]).slice(0, 6)
      .map(([k, w]) => { const [d, a] = k.split("|"); return Object.assign({ peso: w, pgs: [...pagsDe.get(k)] }, K.CRIMES.find(x => x.d === d && x.a === a)); });
  }

  /* ------------------------------------------------------------------ datas e cronologia */
  const EVENTOS = [
    ["recebimento", "Recebimento da denúncia", /recebo a denuncia|recebimento da denuncia|recebida a denuncia/],
    ["sentenca", "Sentença", /sentenca|julgo (procedente|improcedente)|condeno|absolvo/],
    ["citacao", "Citação", /\bcitad[oa]|citacao/],
    ["audiencia", "Audiência", /audiencia (de instrucao|de custodia|una)|termo de audiencia/],
    ["denuncia", "Oferecimento da denúncia", /oferece (a presente )?denuncia|denuncia oferecida/],
    ["instauracao", "Instauração do procedimento", /instaur|portaria/],
    ["prisao", "Prisão ou flagrante", /preso|prisao|flagrante|autuad|conduzid/],
    ["fato", "Data do fato", /no dia|data do fato|data dos fatos|ocorrid|por volta|em data de|fato ocorr|nesta data|no dia de hoje/]
  ];
  function cronologia(pgs) {
    const achados = {};
    const hoje = new Date();
    for (const pg of pgs) {
      const r = /\b(\d{1,2})[\/.](\d{1,2})[\/.](\d{4}|\d{2})\b/g; let m;
      while ((m = r.exec(pg.low))) {
        let ano = +m[3]; if (ano < 100) ano += ano > 50 ? 1900 : 2000;
        const d = new Date(Date.UTC(ano, +m[2] - 1, +m[1]));
        if (isNaN(d) || +m[2] > 12 || +m[1] > 31 || ano < 1990 || d > hoje) continue;
        const antes = pg.low.slice(Math.max(0, m.index - 110), m.index), depois = pg.low.slice(m.index, m.index + 40);
        if (/nasc|nascimento|\bdn\b|expedi|emitid|validade|admiss|filiacao|rg\b|identidade/.test(antes.slice(-50))) continue;
        for (const [k, rot, re] of EVENTOS) if (re.test(antes) || (k === "fato" && re.test(depois))) {
          (achados[k] = achados[k] || []).push({ d, pg, k, rot }); break;
        }
      }
    }
    const ev = [];
    for (const [k, rot] of EVENTOS) {
      const l = achados[k]; if (!l || !l.length) continue;
      const cont = new Map(); l.forEach(x => cont.set(+x.d, (cont.get(+x.d) || 0) + 1));
      let melhor = [...cont.entries()].sort((a, b) => b[1] - a[1] || a[0] - b[0])[0][0];
      if (k === "fato") melhor = Math.min(...l.map(x => +x.d));
      const x = l.find(y => +y.d === melhor);
      ev.push({ k, rot, d: x.d, pg: x.pg, ocorrencias: l.length });
    }
    return ev.sort((a, b) => a.d - b.d);
  }

  /* ------------------------------------------------------------------ pessoas */
  const PAPEIS = [["denunciad|acusad|reu\\b|re\\b", "acusado(a)"], ["investigad|indiciad|autuad|conduzid|suspeit|flagranteado", "investigado(a)"], ["vitima|ofendid", "vítima"], ["condutor", "condutor"], ["testemunha|depoente|declarante", "testemunha ou declarante"]];
  const NAO_NOME = /MINISTERIO|PUBLICO|POLICIA|ESTADO|JUSTICA|DELEGADO|DELEGACIA|JUIZ|COMARCA|TRIBUNAL|VARA|MILITAR|CIVIL|FEDERAL|PODER|REPUBLICA|CODIGO|PENAL|PROCESSO|BRASIL|MINAS|GERAIS|LEI\b|ARTIGO|SECRETARIA/;
  const POSTOS = /^(?:(?:SD|CB|SGT|TEN|CAP|MAJ|CEL|ST|PM|PC|PF|DR|DRA|SOLDADO|CABO|SARGENTO|TENENTE|CAPITAO|INVESTIGADOR|AGENTE|ESCRIVAO|DELEGADO)\.?\s+)+/;
  function pessoas(pgs) {
    const mapa = new Map();
    for (const pg of pgs) {
      const t = sem(pg.texto), orig = pg.texto.normalize("NFC");
      const mesmo = t.length === orig.length;
      for (const [re, papel] of PAPEIS) {
        const r = new RegExp("\\b(?:" + re + ")[a-z]*\\s*(?:\\(a\\))?\\s*[:,-]?\\s*((?:[A-Z][A-Z'`]{1,}\\s+){1,6}[A-Z][A-Z'`]{1,})", "gi"); let m;
        while ((m = r.exec(t))) {
          const ini = m.index + m[0].length - m[1].length;
          let nome = (mesmo ? orig.slice(ini, ini + m[1].length) : m[1]).replace(/\s+/g, " ").trim();
          const semAc = sem(nome).replace(POSTOS, "");
          nome = nome.split(" ").slice(nome.split(" ").length - semAc.split(" ").length).join(" ");
          if (sem(nome) !== sem(nome).toUpperCase() || NAO_NOME.test(sem(nome)) || nome.split(" ").length < 2 || nome.length > 70) continue;
          const x = mapa.get(sem(nome)) || { nome, papeis: new Map(), pgs: new Set() };
          x.papeis.set(papel, (x.papeis.get(papel) || 0) + 1); x.pgs.add(pg.ref); mapa.set(sem(nome), x);
        }
      }
    }
    const tc = w => (/^(DA|DE|DO|DAS|DOS|E)$/.test(sem(w)) ? w.toLowerCase() : w.charAt(0) + w.slice(1).toLowerCase());
    return [...mapa.values()].map(x => ({ nome: x.nome.split(" ").map(tc).join(" "), papel: [...x.papeis.entries()].sort((a, b) => b[1] - a[1])[0][0], vezes: [...x.papeis.values()].reduce((a, b) => a + b, 0), pgs: [...x.pgs] }))
      .sort((a, b) => b.vezes - a.vezes).slice(0, 14);
  }

  /* ------------------------------------------------------------------ sinais, quantidades e horários */
  function sinais(pgs) {
    const out = {};
    for (const [k, re] of Object.entries(K.SINAIS)) {
      const hits = [];
      for (const pg of pgs) { const r = new RegExp(re.source, "g"); const m = r.exec(pg.low); if (m) hits.push({ pg, idx: m.index, trecho: trecho(pg, m.index) }); }
      out[k] = hits;
    }
    return out;
  }
  const SUBST = "maconha|cannabis|skunk|haxixe|cocaina|crack|ecstasy|lsd|metanfetamina";
  function quantidades(pgs) {
    const porDroga = {};
    for (const pg of pgs) {
      const r = new RegExp("(\\d+(?:[.,]\\d+)?)\\s*(kg|quilos?|gramas|grs?|g)\\b[^.\\n]{0,40}?(" + SUBST + ")|(" + SUBST + ")[^.\\n]{0,40}?(\\d+(?:[.,]\\d+)?)\\s*(kg|quilos?|gramas|grs?|g)\\b", "g"); let m;
      while ((m = r.exec(pg.low))) {
        const num = parseFloat((m[1] || m[5]).replace(/\.(?=\d{3}\b)/g, "").replace(",", ".")), un = m[2] || m[6], droga = (m[3] || m[4]).replace("cannabis", "maconha").replace("skunk", "maconha");
        const g = /kg|quilo/.test(un) ? num * 1000 : num;
        if (!g || g > 5e6) continue;
        (porDroga[droga] = porDroga[droga] || []).push({ g, pg, txt: trecho(pg, m.index, 220) });
      }
    }
    return porDroga;
  }
  function horarios(itens) {
    const out = [];
    for (const it of itens.filter(i => i.id === "depoimento" || i.id === "bo" || i.id === "apf")) {
      const r = /(?:por volta d[ae]s?|aproximadamente [aà]s|[àa]s)\s*(\d{1,2})\s*(?:h|:|horas)\s*(\d{2})?/g; let m; const set = new Set();
      while ((m = r.exec(it.low))) { const h = +m[1]; if (h < 24) set.add(String(h).padStart(2, "0") + ":" + (m[2] || "00")); }
      if (set.size) out.push({ it, horas: [...set] });
    }
    return out;
  }

  /* ------------------------------------------------------------------ análise completa */
  function analisar(leitura, caso) {
    const pgs = paginas(leitura);
    const itens = pecas(pgs), tipos = crimes(pgs, itens), crono = cronologia(pgs), gente = pessoas(pgs), S = sinais(pgs), qtd = quantidades(pgs), horas = horarios(itens);
    const tem = id => itens.some(i => i.id === id);
    const deps = itens.filter(i => i.id === "depoimento");
    const policiais = deps.filter(d => d.sub === "policial"), civis = deps.filter(d => d.sub === "testemunha");
    const principal = tipos[0] || null;
    const droga = tipos.some(t => t.d === "11.343" && (t.a === "33" || t.a === "35"));
    const ev = k => crono.find(e => e.k === k);
    const fase = tem("sentenca") ? "sentença proferida, com possível fase recursal" : tem("alegacoes") ? "alegações finais" : tem("audiencia") ? "instrução em andamento" : tem("resposta") ? "resposta à acusação apresentada" : tem("recebimento") ? "ação penal em curso, após o recebimento da denúncia" : tem("denuncia") ? "denúncia oferecida" : tem("relatorio") ? "inquérito relatado" : "investigação";

    /* teses e questões processuais */
    const T = [], Q = [], R = [];
    const tese = (forca, titulo, texto, fund, prov, cits) => T.push({ forca, titulo, texto, fund, prov, cits: cits || [] });
    const quest = (titulo, texto, fund, cits) => Q.push({ titulo, texto, fund, cits: cits || [] });
    const cit = h => h.slice(0, 2).map(x => ({ t: x.trecho, ref: x.pg.ref }));

    /* prescrição pela pena máxima em abstrato */
    if (principal && principal.pena[1] && root.PRESC_MOTOR && ev("fato")) {
      const P = root.PRESC_MOTOR, iso = d => d.toISOString().slice(0, 10);
      const r = P.calcular({ fato: iso(ev("fato").d), recebimento: ev("recebimento") ? iso(ev("recebimento").d) : "", sentenca: ev("sentenca") ? iso(ev("sentenca").d) : "" }, { penaMax: { a: 0, m: principal.pena[1] } });
      const ab = r.modalidades && r.modalidades[0];
      if (ab && ab.prescrita) tese(98, "Prescrição da pretensão punitiva", "Considerada a pena máxima cominada ao crime de " + principal.nome + " (" + pena(principal.pena[1]) + "), o prazo prescricional é de " + P.fmtPena(ab.meses) + " (CP, art. 109). Tomando as datas identificadas nos autos, o fato em " + dataBR(ev("fato").d) + (ev("recebimento") ? " e o recebimento da denúncia em " + dataBR(ev("recebimento").d) : "") + ", o prazo esgotou-se em " + dataBR(ab.prescrita.fim) + ", antes de causa interruptiva. As datas foram extraídas automaticamente e precisam ser conferidas, assim como eventuais causas de suspensão e a idade do agente (CP, art. 115).", K.FUNDAMENTOS.prescricao, "Conferir os marcos na ferramenta de prescrição e, confirmada a hipótese, requerer a declaração da extinção da punibilidade (CP, art. 107, IV; CPP, art. 61).");
      else if (ab) R.push("Pela pena máxima do crime de " + principal.nome + ", a prescrição em abstrato não se consumou com as datas identificadas; o próximo termo calculado é " + (ab.trechos.length ? dataBR(ab.trechos[ab.trechos.length - 1].fim) : "indeterminado") + ", a conferir na ferramenta de prescrição.");
    }
    /* busca pessoal */
    if (S.buscaPessoal.length) {
      const fraca = S.suspeitaFragil.length > 0;
      tese(fraca ? 86 : 55, "Ilicitude da busca pessoal", fraca ? "Os autos registram a busca pessoal justificada por elementos que a jurisprudência considera insuficientes para caracterizar a fundada suspeita exigida pelo art. 244 do CPP, como atitude suspeita, nervosismo, denúncia anônima não diligenciada, fuga ao avistar a viatura ou a presença em local conhecido como ponto de tráfico. Se confirmada a ausência de elementos objetivos e prévios, a busca é ilícita, e a ilicitude contamina a apreensão e as provas dela derivadas (CPP, art. 157, § 1º)." : "Os autos registram busca pessoal. É preciso verificar se ela foi precedida de fundada suspeita, baseada em elementos objetivos e concretos, descritos de modo verificável no momento da abordagem, e não em justificativas genéricas.", K.FUNDAMENTOS.busca, "Arguir a ilicitude da busca e de todas as provas derivadas, com o desentranhamento, e explorar em audiência as razões concretas da abordagem.", cit(fraca ? S.suspeitaFragil : S.buscaPessoal));
    }
    /* ingresso em domicílio */
    if (S.domicilio.length) {
      const semMandado = !S.mandadoBusca.length, consent = S.consentimento.length > 0, grav = S.gravacao.length > 0;
      tese(semMandado ? (consent && !grav ? 85 : 72) : 40, "Ilicitude do ingresso em domicílio", semMandado ? "Os autos indicam o ingresso dos agentes em imóvel sem mandado judicial" + (consent ? ", com a alegação de que o morador teria autorizado a entrada" : "") + ". Sem situação de flagrante evidenciada por fundadas razões prévias, e sem prova idônea do consentimento livre, o ingresso viola a inviolabilidade do domicílio" + (consent && !grav ? ". Não há notícia de registro escrito ou audiovisual do suposto consentimento, ônus que recai sobre o Estado" : "") + ", e as provas obtidas no interior do imóvel são ilícitas, com contaminação das derivadas." : "Há referência a mandado de busca. Convém verificar os limites do mandado (endereço, objeto e horário), a fundamentação da decisão que o expediu e a correspondência entre o que foi autorizado e o que foi efetivamente apreendido.", K.FUNDAMENTOS.domicilio, semMandado ? "Requerer o reconhecimento da ilicitude do ingresso e das provas obtidas no imóvel, com o desentranhamento, e indagar em audiência como e por quem a entrada teria sido autorizada." : "Requerer cópia integral do pedido e da decisão de busca, para controle de legalidade e de limites.", cit(S.domicilio));
    }
    /* celular */
    if (S.celular.length && !S.autorizacaoJudicialDados.length) tese(74, "Ilicitude do acesso a dados do aparelho celular", "Os autos mencionam conteúdo de aparelho celular (mensagens, conversas ou dados) sem notícia de autorização judicial para o acesso. A devassa do aparelho sem ordem judicial viola a intimidade e o sigilo de dados, tornando ilícita a prova e as que dela derivarem.", K.FUNDAMENTOS.celular, "Requerer a demonstração da autorização judicial para o acesso e, à falta dela, o desentranhamento do conteúdo extraído e das provas derivadas.", cit(S.celular));
    /* reconhecimento */
    if (S.reconhecimento.length || tem("reconhecimento")) tese(70, "Invalidade do reconhecimento de pessoas", "A autoria apoia-se, ao menos em parte, em reconhecimento. É indispensável verificar a observância do art. 226 do CPP (descrição prévia, alinhamento com pessoas semelhantes e auto pormenorizado), a exposição prévia do reconhecedor à imagem do suspeito e a eventual ratificação em juízo de ato viciado, que não o convalida.", K.FUNDAMENTOS.reconhecimento, "Analisar cada ato na ferramenta de reconhecimento de pessoas do HUB e arguir a invalidade dos atos viciados.", cit(S.reconhecimento));
    /* confissão informal */
    if (S.confissaoInformal.length) tese(64, "Imprestabilidade da confissão informal", "Há relato de confissão informal ou de admissão dos fatos aos policiais, fora do interrogatório formal. Essa declaração não foi precedida da advertência do direito ao silêncio e não pode, isoladamente, fundamentar a condenação, sobretudo quando não ratificada em juízo.", K.FUNDAMENTOS.confissao, "Impugnar a valoração da confissão informal e explorar, em audiência, a ausência de advertência sobre o direito ao silêncio.", cit(S.confissaoInformal));
    /* cadeia de custódia */
    if (tem("apreensao")) tese(S.lacre.length ? 42 : 72, "Quebra da cadeia de custódia", S.lacre.length ? "Há apreensão de vestígios e referências a lacre ou acondicionamento. Convém conferir a correspondência dos números de lacre entre o auto de apreensão, a requisição e o laudo, o registro de cada transferência e o armazenamento." : "Há auto de apreensão, mas não foram localizadas referências a lacre, acondicionamento ou registro da cadeia de custódia. A ausência de documentação das etapas dos arts. 158-A a 158-F do CPP compromete a rastreabilidade e a confiabilidade do vestígio.", K.FUNDAMENTOS.custodia, "Examinar os autos na ferramenta de cadeia de custódia do HUB e arguir a quebra, com a consequente imprestabilidade do vestígio.", cit(S.lacre.length ? S.lacre : []));
    /* materialidade da droga */
    if (droga && !S.laudoDefinitivo.length) tese(80, "Ausência de laudo toxicológico definitivo", "Não foi localizado laudo toxicológico definitivo nos autos" + (S.laudoPreliminar.length ? ", apenas laudo de constatação preliminar" : "") + ". O laudo de constatação basta para a prisão e para o recebimento da denúncia, mas não para a condenação, que exige a comprovação definitiva da natureza da substância.", K.FUNDAMENTOS.materialidadeDroga, "Requerer a juntada do laudo definitivo e, à sua falta ao fim da instrução, a absolvição por ausência de materialidade (CPP, art. 386, II).");
    /* quantidade e desclassificação */
    if (droga) {
      const mac = qtd.maconha || [];
      const total = mac.length ? Math.max(...mac.map(x => x.g)) : null;
      if (total != null && total <= 40) tese(80, "Desclassificação para posse para consumo (Tema 506 do STF)", "A quantidade de maconha identificada nos autos (" + String(total).replace(".", ",") + " g) está dentro do limite de 40 gramas fixado pelo STF para a presunção de uso pessoal. A presunção só cede diante de elementos concretos de mercancia, como balança, embalagens fracionadas, registros de venda ou diversidade de drogas, cuja existência deve ser verificada.", K.FUNDAMENTOS.tema506, "Requerer a desclassificação para o art. 28 da Lei 11.343/2006, com as consequências do Tema 506.", mac.slice(0, 1).map(x => ({ t: x.txt, ref: x.pg.ref })));
      tese(S.reincidencia.length ? 30 : 58, "Tráfico privilegiado", "Se o assistido for primário, de bons antecedentes e não houver prova de dedicação a atividades criminosas ou de integração a organização criminosa, impõe-se a minorante de um sexto a dois terços, com reflexos no regime, na substituição da pena e no afastamento da hediondez." + (S.reincidencia.length ? " Os autos, contudo, trazem referência a reincidência ou a antecedentes, o que enfraquece a tese." : ""), K.FUNDAMENTOS.privilegiado, "Juntar certidões de antecedentes e documentos de trabalho e residência, e requerer a aplicação da minorante na fração máxima.");
    }
    /* prova testemunhal exclusivamente policial */
    if (policiais.length && !civis.length) tese(60, "Prova testemunhal exclusivamente policial", "Os depoimentos colhidos são apenas de policiais envolvidos na diligência, sem testemunhas civis. Embora a palavra policial seja admitida, ela deve ser coerente, harmônica e corroborada por outros elementos, especialmente quando os próprios agentes têm interesse em legitimar a sua atuação.", K.FUNDAMENTOS.art155, "Explorar contradições entre os depoimentos dos policiais, requerer imagens de câmeras corporais e da viatura e arrolar testemunhas civis do local.");
    /* contradições objetivas */
    for (const [droga2, l] of Object.entries(qtd)) {
      const valores = [...new Set(l.map(x => Math.round(x.g * 100) / 100))];
      if (valores.length > 1) tese(66, "Divergência na quantidade de " + droga2, "A quantidade de " + droga2 + " varia entre as peças dos autos (" + lista(valores.map(v => String(v).replace(".", ",") + " g")) + "). A divergência, se não explicada pela pesagem com ou sem embalagem, compromete a confiabilidade da apreensão e a correspondência entre o material apreendido e o periciado.", K.FUNDAMENTOS.custodia, "Requerer esclarecimentos sobre as pesagens e confrontar o auto de apreensão com o laudo.", l.slice(0, 2).map(x => ({ t: x.txt, ref: x.pg.ref })));
    }
    if (horas.length > 1) {
      const todas = [...new Set(horas.flatMap(h => h.horas))];
      if (todas.length > 1) tese(56, "Divergência de horários entre as versões", "As peças indicam horários diferentes para os fatos (" + lista(horas.map(h => h.horas.join(" e ") + " em " + h.it.rot.toLowerCase() + " (" + h.it.ref + ")")) + "). A divergência deve ser explorada para testar a coerência da narrativa acusatória.", K.FUNDAMENTOS.art155, "Confrontar os horários em audiência e requerer registros objetivos (despacho da viatura, câmeras, registros de chamada).");
    }
    /* condições de procedibilidade e institutos despenalizadores */
    for (const c of tipos) {
      if (c.a === "171" && c.d === "CP" && !S.representacao.length) tese(74, "Ausência de representação no estelionato", "Desde a Lei 13.964/2019, o estelionato é crime de ação pública condicionada à representação, salvo as exceções do § 5º do art. 171 do CP (Administração Pública, criança ou adolescente, pessoa com deficiência mental, maior de 70 anos ou incapaz). Não foi localizada representação da vítima nos autos.", K.FUNDAMENTOS.representacao, "Verificar se alguma exceção se aplica e, não sendo o caso, arguir a ausência de condição de procedibilidade e a decadência.");
      if (["138", "139", "140"].includes(c.a) && c.d === "CP") tese(68, "Decadência do direito de queixa", "Nos crimes contra a honra, a ação é, em regra, privada, e o prazo decadencial de seis meses corre do conhecimento da autoria. A tempestividade da queixa e a regularidade da procuração com poderes especiais (CPP, art. 44) devem ser verificadas.", K.FUNDAMENTOS.queixa, "Conferir a data do conhecimento da autoria e a procuração do querelante e, se for o caso, arguir a decadência ou a nulidade da queixa.");
      if ((c.a === "147" || c.a === "129") && c.d === "CP" && !S.representacao.length && !S.violenciaDomestica.length) tese(58, "Ausência de representação", "O crime de " + c.nome + " depende de representação da vítima nas hipóteses legais, e ela não foi localizada nos autos.", K.FUNDAMENTOS.representacao, "Verificar a representação e, à falta dela, arguir a decadência.");
      if (!c.violencia && c.pena[0] && c.pena[0] < 48 && !S.violenciaDomestica.length && !S.anpp.length) tese(52, "Acordo de não persecução penal (" + c.nome + ")", "A pena mínima do crime de " + c.nome + " (" + pena(c.pena[0]) + ") é inferior a quatro anos e o tipo não envolve violência ou grave ameaça, o que, em tese, permite o acordo de não persecução penal, desde que preenchidos os demais requisitos. Não há notícia de proposta nos autos.", K.FUNDAMENTOS.anpp, "Avaliar com o cliente a conveniência do acordo e, sendo o caso, requerer a remessa ao Ministério Público para a análise da proposta.");
      if (c.pena[0] && c.pena[0] <= 12) tese(48, "Suspensão condicional do processo (" + c.nome + ")", "A pena mínima do crime de " + c.nome + " (" + pena(c.pena[0]) + ") permite, em tese, a suspensão condicional do processo, preenchidos os requisitos subjetivos.", K.FUNDAMENTOS.sursis, "Avaliar a proposta de suspensão e as suas condições com o cliente.");
      tese(45, "Tipicidade: " + c.nome, c.teses, LEI(c), "Explorar, na instrução, a ausência de prova de cada elemento do tipo.");
    }
    /* questões processuais complementares */
    if (tem("apf") && !S.audienciaCustodia.length) quest("Audiência de custódia", "Há auto de prisão em flagrante, mas não foi localizada a realização da audiência de custódia no prazo legal. A omissão deve ser verificada, pois repercute na legalidade da prisão e permite discutir o relaxamento.", K.FUNDAMENTOS.custodiaAud);
    if (ev("prisao") && !tem("sentenca")) {
      const dias = Math.round((Date.now() - ev("prisao").d) / 864e5);
      if (dias > 180) quest("Excesso de prazo da prisão cautelar", "Entre a prisão (" + dataBR(ev("prisao").d) + ") e a data de hoje transcorreram cerca de " + dias + " dias sem sentença, segundo as peças identificadas. Se o assistido permanecer preso, cabe avaliar o excesso de prazo e a revisão periódica da necessidade da prisão (CPP, art. 316, parágrafo único).", "CPP, art. 316, parágrafo único; CF, art. 5º, LXXVIII");
    }
    if (tem("interceptacao")) quest("Interceptação ou quebra de sigilo", "Há medida de interceptação ou de quebra de sigilo nos autos. Devem ser verificadas a fundamentação da decisão, a imprescindibilidade da medida, o prazo de quinze dias e a fundamentação de cada prorrogação, além da integralidade das mídias disponibilizadas à defesa.", "Lei 9.296/1996, arts. 2º, 4º e 5º; Súmula Vinculante 14");
    if (tem("rif")) quest("Relatório de inteligência financeira", "Há relatório de inteligência financeira nos autos. A forma de obtenção (espontânea ou por intercâmbio), a integridade dos arquivos e as interpretações policiais devem ser examinadas.", "STF, Temas 990 e 1.404; ver a ferramenta de análise de RIF do HUB");

    /* riscos */
    if (S.reincidencia.length) R.push("Há referências a reincidência ou a antecedentes (" + refsDe(S.reincidencia.map(x => x.pg)) + "), o que agrava a dosimetria, o regime e a possibilidade de benefícios.");
    if (tem("apf") || ev("prisao")) R.push("O caso envolve prisão, o que exige atenção permanente aos fundamentos da custódia e à sua revisão periódica.");
    if (S.violenciaDomestica.length) R.push("O contexto de violência doméstica afasta institutos despenalizadores (Lei 11.340/2006, art. 41) e aumenta o peso da palavra da vítima.");
    if (tipos.length > 1) R.push("A imputação de mais de um crime (" + lista(tipos.map(t => t.nome)) + ") pode levar ao concurso de crimes, com soma ou exasperação das penas.");
    if (principal && principal.pena[1] >= 96) R.push("A pena máxima do crime principal (" + pena(principal.pena[1]) + ") projeta regime inicial gravoso em caso de condenação.");
    if (S.negativa.length) R.push("Há registros de negativa ou de resultado negativo (" + refsDe(S.negativa.map(x => x.pg)) + "), que devem ser explorados como elementos favoráveis.");

    T.sort((a, b) => b.forca - a.forca);
    return { pgs, itens, tipos, crono, gente, S, qtd, horas, teses: T, questoes: Q, riscos: R, principal, fase, droga, policiais, civis, leitura, caso };
  }
  function LEI(c) { return (K.LEIS[c.d] || "Lei " + c.d) + ", art. " + c.a; }

  /* ------------------------------------------------------------------ classificação das provas */
  function classificar(it, A) {
    const fav = /\bnegou\b|nega (a|os) fatos|nao reconhec|nada de ilicito|nada foi encontrado|nao foi encontrad|resultado negativo|inconclusiv/.exec(it.low);
    const base = {
      bo: ["neutro", "Peça informativa, redigida a partir da versão de quem comunicou o fato, sem contraditório.", "Confrontar a narrativa do boletim com os depoimentos posteriores, em busca de acréscimos ou de mudanças de versão."],
      apf: ["desfavorável", "Documenta a prisão e as versões colhidas no momento do flagrante.", "Verificar a regularidade formal do auto, a comunicação da prisão, a nota de culpa e a audiência de custódia."],
      depoimento: { policial: ["desfavorável", "Depoimento de agente que participou da diligência e tem interesse em legitimá-la.", "Explorar contradições com os demais policiais e com o boletim, requerer imagens e registros objetivos e confrontar a narrativa com a da defesa."], vitima: ["desfavorável", "A palavra da vítima tem especial relevância, mas deve ser coerente e corroborada.", "Confrontar as versões sucessivas da vítima e verificar a existência de interesse, contradições e ausência de corroboração."], testemunha: ["neutro", "Testemunha cujo valor depende do conteúdo efetivo e da sua relação com as partes.", "Avaliar a coerência com as demais provas e explorar o que favorecer a defesa."] },
      interrogatorio: ["neutro", "Registra a versão do investigado ou acusado.", "Verificar a advertência do direito ao silêncio e a coerência da versão com a estratégia defensiva."],
      apreensao: ["desfavorável", "Documenta os objetos apreendidos e sustenta a materialidade.", "Conferir lacres, descrição dos objetos, local exato e cadeia de custódia."],
      laudo: ["desfavorável", "Prova técnica produzida sem contraditório prévio.", "Verificar quesitos, metodologia, correspondência do material periciado com o apreendido e a possibilidade de assistente técnico."],
      reconhecimento: ["desfavorável", "Prova de autoria sujeita às formalidades do art. 226 do CPP.", "Analisar o procedimento e a contaminação da memória do reconhecedor."],
      busca: ["neutro", "Delimita o que foi autorizado judicialmente.", "Confrontar os limites do mandado com a diligência efetivamente realizada."],
      interceptacao: ["desfavorável", "Prova obtida por medida invasiva de exceção.", "Verificar fundamentação, prazos, prorrogações e integralidade das mídias."],
      prisao: ["neutro", "Ato decisório sobre a liberdade.", "Verificar a fundamentação concreta e a revisão periódica da necessidade da custódia."],
      relatorio: ["neutro", "Peça opinativa da autoridade policial, sem valor probatório autônomo.", "Identificar conclusões do relatório que não encontram amparo nas provas."],
      denuncia: ["desfavorável", "Delimita a imputação e o objeto da defesa.", "Verificar a descrição individualizada da conduta e a justa causa (CPP, arts. 41 e 395)."],
      recebimento: ["neutro", "Marco interruptivo da prescrição.", "Verificar a fundamentação mínima da decisão."],
      antecedentes: [A.S.reincidencia.length ? "desfavorável" : "favorável", A.S.reincidencia.length ? "Registra antecedentes ou reincidência." : "Não indica reincidência entre os registros identificados.", "Conferir trânsito em julgado e período depurador (CP, art. 64, I)."],
      resposta: ["neutro", "Manifestação defensiva anterior.", "Verificar as teses já deduzidas e a preclusão."],
      audiencia: ["neutro", "Registra a prova oral produzida em juízo.", "Confrontar o depoimento judicial com o prestado na fase policial."],
      alegacoes: ["neutro", "Manifestação final das partes.", "Verificar as teses enfrentadas."],
      sentenca: ["desfavorável", "Decisão de mérito.", "Identificar omissões, contradições e fundamentos atacáveis em recurso."],
      rif: ["desfavorável", "Relatório de inteligência, de natureza indiciária.", "Examinar na ferramenta de análise de RIF do HUB."],
      portaria: ["neutro", "Marca a instauração do procedimento.", "Verificar o objeto da investigação e a data, para o teste de pertinência das medidas posteriores."]
    };
    let b = base[it.id]; if (b && !Array.isArray(b)) b = b[it.sub] || b.testemunha;
    b = b || ["neutro", "Peça processual.", "Avaliar o conteúdo."];
    if (fav && b[0] !== "favorável" && ["depoimento", "laudo", "interrogatorio", "audiencia", "apreensao"].includes(it.id)) {
      const re = /\bnegou\b|nega (a|os) fatos|nao reconhec|nada de ilicito|nada foi encontrado|nao foi encontrad|resultado negativo|inconclusiv/;
      const pg = it.pgs.find(x => re.test(x.low)) || it.pgs[0], m = re.exec(pg.low);
      return { classe: "favorável", motivo: "Contém registro favorável à defesa (negativa, ausência de reconhecimento ou resultado negativo ou inconclusivo).", estrategia: "Explorar o trecho em favor da defesa e confrontá-lo com a narrativa acusatória.", fav: m ? trecho(pg, m.index) : "", favRef: pg.ref };
    }
    return { classe: b[0], motivo: b[1], estrategia: b[2] };
  }

  /* ------------------------------------------------------------------ redação */
  function redigir(A) {
    const L = [], h1 = t => L.push("# " + t), h2 = t => L.push("## " + t), p = t => L.push(t), q = (t, ref) => L.push('> “' + t.replace(/[“”"]/g, "") + '” (' + ref + ")"), tab = (cab, rows) => L.push(["| " + cab.join(" | ") + " |", "|" + cab.map(() => "---").join("|") + "|"].concat(rows.map(r => "| " + r.map(c => String(c).replace(/\|/g, "/").replace(/\n/g, " ")).join(" | ") + " |")).join("\n"));
    const c = A.caso || {}, lt = A.leitura, tipos = A.tipos, prin = A.principal;
    const acus = A.gente.filter(g => /acusad|investigad/.test(g.papel)), vit = A.gente.filter(g => g.papel === "vítima");

    h1("Síntese do caso e delimitação do estudo");
    p("O presente estudo foi elaborado a partir da leitura integral de " + n(lt.paginas, "página", "páginas") + " dos autos" + (lt.ocr ? ", das quais " + lt.ocr + " lidas por reconhecimento óptico de caracteres" : "") + ", com a identificação automática de " + n(A.itens.length, "peça processual", "peças processuais") + ". A fase processual inferida das peças é a de " + A.fase + ".");
    if (tipos.length) p("A imputação identificada nos autos refere-se " + (tipos.length === 1 ? "ao crime de " : "aos crimes de ") + lista(tipos.map(t => t.nome + " (" + LEI(t) + ")")) + (prin ? ", sendo o de " + prin.nome + " o mais recorrente nas peças de maior peso (denúncia, relatório, flagrante ou sentença)" : "") + ".");
    else p("Não foi possível identificar, com segurança, a tipificação a partir das peças lidas. A delimitação da imputação deve ser feita a partir da denúncia ou da portaria.");
    if (acus.length || vit.length) p((acus.length ? "Figuram como investigados ou acusados " + lista(acus.map(g => g.nome)) + ". " : "") + (vit.length ? "Como vítima, aparece " + lista(vit.map(g => g.nome)) + "." : ""));
    if (c.orientacoes) { p("A equipe registrou o seguinte contexto, que deve ser confrontado com os autos:"); q(c.orientacoes.replace(/\s+/g, " ").slice(0, 900), "orientação da equipe"); }
    p("Em síntese, o estudo concentra-se nas fragilidades probatórias e nas questões processuais objetivamente identificáveis nas peças, e deve ser revisado à luz da leitura integral pelo advogado. A providência inicial é conferir o mapa dos autos e a cronologia abaixo, que servem de índice para toda a análise.");

    h1("Mapa dos autos");
    if (A.itens.length) tab(["Peça", "Localização", "Classificação"], A.itens.map(it => [it.rot, it.ref, classificar(it, A).classe]));
    p(A.itens.length ? "Em síntese, as peças acima foram identificadas pelos seus cabeçalhos; peças sem cabeçalho reconhecível podem não constar da relação. A providência recomendada é conferir se há documentos relevantes não identificados, como mídias, ofícios e certidões." : "Não foram reconhecidas peças pelos cabeçalhos, o que pode decorrer da qualidade da digitalização. A providência recomendada é anexar cópia com melhor resolução.");

    h1("Cronologia");
    if (A.crono.length) {
      tab(["Data", "Evento", "Localização"], A.crono.map(e => [dataBR(e.d), e.rot, e.pg.ref]));
      const f = A.crono.find(e => e.k === "fato"), rc = A.crono.find(e => e.k === "recebimento");
      if (f && rc) p("Entre a data do fato (" + dataBR(f.d) + ") e o recebimento da denúncia (" + dataBR(rc.d) + ") transcorreram cerca de " + Math.round((rc.d - f.d) / (864e5 * 30.44)) + " meses, intervalo relevante para a prescrição e para a análise de eventual demora injustificada.");
      p("Em síntese, as datas foram extraídas automaticamente a partir do contexto em que aparecem e devem ser conferidas antes de qualquer cálculo. A providência recomendada é validar os marcos na ferramenta de prescrição do HUB.");
    } else p("Não foram identificadas datas com contexto suficiente para compor a cronologia. A providência recomendada é registrar manualmente as datas do fato, da instauração, da denúncia e do recebimento.");

    h1("Imputação e tipicidade");
    if (!tipos.length) p("Sem a identificação da tipificação, a análise de tipicidade deve ser feita a partir da leitura da denúncia.");
    for (const t of tipos) {
      h2(t.nome.charAt(0).toUpperCase() + t.nome.slice(1) + " (" + LEI(t) + ")");
      p(t.el);
      p("A pena cominada é de " + pena(t.pena[0]) + " a " + pena(t.pena[1]) + ", e a ação penal é " + t.acao + ". " + t.teses);
      p("Em síntese, cada elemento do tipo deve ser confrontado com as provas efetivamente produzidas, e não apenas com a narrativa da denúncia. A providência recomendada é verificar, peça a peça, a prova de cada elemento e explorar na instrução aquele que estiver menos demonstrado.");
    }

    h1("Mapeamento probatório");
    const grupos = { "desfavorável": [], "favorável": [], "neutro": [] };
    A.itens.forEach(it => { const c2 = classificar(it, A); grupos[c2.classe].push({ it, c2 }); });
    for (const [classe, titulo] of [["desfavorável", "Elementos desfavoráveis"], ["favorável", "Elementos favoráveis"], ["neutro", "Elementos neutros"]]) {
      if (!grupos[classe].length) continue;
      h2(titulo);
      for (const { it, c2 } of grupos[classe].slice(0, 14)) {
        p("**" + it.rot + " (" + it.ref + ").** " + c2.motivo + " " + (classe === "desfavorável" ? "Como enfrentar: " : classe === "favorável" ? "Como explorar: " : "Como tratar: ") + c2.estrategia.charAt(0).toLowerCase() + c2.estrategia.slice(1));
        if (c2.fav) q(c2.fav, c2.favRef);
      }
    }
    p("Em síntese, a classificação acima é preliminar e baseada na natureza de cada peça e em sinais objetivos do seu conteúdo. A providência recomendada é revisar cada elemento desfavorável, definindo se a estratégia será descredibilizá-lo, contextualizá-lo ou neutralizá-lo.");

    h1("Questões processuais e possíveis nulidades");
    const proc = A.teses.filter(t => /Ilicitude|Invalidade|Quebra|Imprestabilidade|Ausência de laudo/.test(t.titulo));
    if (!proc.length && !A.questoes.length) p("Não foram identificados, nas peças lidas, sinais objetivos de nulidade ou de ilicitude probatória. Isso não afasta a necessidade de exame direto das diligências e das decisões.");
    for (const t of proc) { h2(t.titulo); p(t.texto); t.cits.forEach(x => q(x.t, x.ref)); p("Fundamento: " + t.fund + ". Providência: " + t.prov.charAt(0).toLowerCase() + t.prov.slice(1)); }
    for (const x of A.questoes) { h2(x.titulo); p(x.texto); p("Fundamento: " + x.fund + "."); }
    p("Em síntese, as nulidades apontadas dependem da confirmação das circunstâncias descritas nas peças. A providência recomendada é arguí-las na primeira oportunidade, para evitar a preclusão, e requerer a juntada dos registros que ainda não constem dos autos.");

    h1("Teses defensivas, da mais forte à mais fraca");
    const ordinais = ["A primeira", "A segunda", "A terceira", "A quarta", "A quinta", "A sexta", "A sétima", "A oitava", "A nona", "A décima"];
    A.teses.slice(0, 10).forEach((t, i) => p("**" + ordinais[i] + " tese é a " + t.titulo.charAt(0).toLowerCase() + t.titulo.slice(1) + ".** " + (proc.includes(t) ? "Conforme destacado na seção de questões processuais, " + t.prov.charAt(0).toLowerCase() + t.prov.slice(1) : t.texto + " Providência: " + t.prov.charAt(0).toLowerCase() + t.prov.slice(1)) + " (força estimada: " + (t.forca >= 80 ? "alta" : t.forca >= 60 ? "média" : "a confirmar") + ")."));
    if (!A.teses.length) p("Não foram identificadas teses a partir de sinais objetivos das peças; a construção das teses depende da leitura do advogado.");
    p("Em síntese, a ordem acima combina a gravidade do vício com a solidez dos sinais encontrados nos autos. A providência recomendada é concentrar a estratégia nas duas ou três primeiras teses, sem abandonar as subsidiárias, que podem ser decisivas na dosimetria.");

    h1("Riscos e pontos de atenção");
    if (A.riscos.length) A.riscos.forEach(r => p(r)); else p("Não foram identificados riscos específicos a partir dos sinais das peças, o que não dispensa a avaliação do conjunto probatório.");
    p("Em síntese, os riscos devem orientar a comunicação com o cliente e a decisão sobre acordos e institutos despenalizadores. A providência recomendada é discutir com o cliente, de forma franca, os cenários de condenação e as alternativas negociais disponíveis.");

    h1("Limitações desta análise");
    p("Este estudo foi produzido automaticamente, por regras, a partir do texto extraído dos autos, sem uso de inteligência artificial e sem custo de processamento externo. Ele identifica peças, datas, tipos penais, sinais de nulidade e contradições objetivas, mas não substitui a leitura técnica do advogado, sobretudo quanto à valoração das provas e à construção da narrativa defensiva." + (lt.ilegiveis && lt.ilegiveis.length ? " As seguintes páginas tiveram leitura precária e podem conter informações não consideradas: " + lt.ilegiveis.slice(0, 30).join(", ") + (lt.ilegiveis.length > 30 ? " e outras" : "") + "." : ""));
    p("Em síntese, o estudo serve como roteiro de trabalho e índice dos autos. A providência recomendada é revisar cada seção, completar o que depender de juízo valorativo e conferir no inteiro teor os precedentes mencionados.");
    return L.join("\n\n");
  }

  root.EC_ANALISE = { analisar, redigir, paginas, pecas, crimes, cronologia, pessoas };
})(typeof window !== "undefined" ? window : globalThis);
