/* Leitura dos documentos do cliente no diagnóstico patrimonial: matrícula do imóvel, declaração do imposto de renda
   (IRPF) e carnê ou certidão de IPTU. O texto é obtido no navegador (pdf.js e, nas páginas digitalizadas e nas
   fotografias, OCR do Tesseract em português) e os dados são extraídos por regras, sem envio a terceiros. A leitura
   pelo Claude é opcional e usa o mesmo formato de saída (ESQUEMA), de modo que a conferência e o preenchimento do
   formulário são idênticos nos dois modos. Nada é aplicado sem a confirmação do usuário. */
(function (root) {
  "use strict";

  /* ------------------------------------------------------------------ utilidades */
  /* remove acentos preservando o comprimento, para que os índices do texto normalizado valham no original */
  const sa = s => String(s || "").replace(/[À-ÿ]/g, c => c.normalize("NFD")[0]);
  const DINHEIRO = /\d{1,3}(?:\.\d{3})*,\d{2}(?!\d)/g;
  const valor = s => { if (s == null) return 0; const t = String(s).trim(); if (!t) return 0; const n = parseFloat(t.replace(/\./g, "").replace(",", ".")); return isFinite(n) ? n : 0; };
  const limpa = s => String(s || "").replace(/\s+/g, " ").replace(/\s+([,.;:])/g, "$1").trim();
  const titulo = s => limpa(s).toLowerCase().replace(/(^|[\s(\/-])([a-zà-ÿ])/g, (m, a, b) => a + b.toUpperCase()).replace(/\b(De|Da|Do|Das|Dos|E)\b/g, x => x.toLowerCase());
  const digitos = s => String(s || "").replace(/\D/g, "");
  const UFS = "AC AL AP AM BA CE DF ES GO MA MT MS MG PA PB PR PE PI RJ RN RS RO RR SC SP SE TO".split(" ");
  const ESTADOS = { "ACRE": "AC", "ALAGOAS": "AL", "AMAPA": "AP", "AMAZONAS": "AM", "BAHIA": "BA", "CEARA": "CE", "DISTRITO FEDERAL": "DF", "ESPIRITO SANTO": "ES", "GOIAS": "GO", "MARANHAO": "MA", "MATO GROSSO DO SUL": "MS", "MATO GROSSO": "MT", "MINAS GERAIS": "MG", "PARA": "PA", "PARAIBA": "PB", "PARANA": "PR", "PERNAMBUCO": "PE", "PIAUI": "PI", "RIO DE JANEIRO": "RJ", "RIO GRANDE DO NORTE": "RN", "RIO GRANDE DO SUL": "RS", "RONDONIA": "RO", "RORAIMA": "RR", "SANTA CATARINA": "SC", "SAO PAULO": "SP", "SERGIPE": "SE", "TOCANTINS": "TO" };
  const TIPOS = ["Residência da família", "Residencial (locação ou outro uso)", "Comercial", "Rural", "Terreno ou lote"];

  /* primeira ocorrência de uma expressão sobre o texto sem acentos, devolvendo os grupos lidos do texto original */
  function achar(T, N, re, desde) {
    const r = new RegExp(re.source, re.flags.replace("g", "") + "g"); r.lastIndex = desde || 0;
    const m = r.exec(N); if (!m) return null;
    const out = [T.substr(m.index, m[0].length)]; out.index = m.index; out.fim = m.index + m[0].length;
    let pos = m.index;
    for (let i = 1; i < m.length; i++) { if (m[i] == null) { out.push(undefined); continue; } const k = N.indexOf(m[i], pos); out.push(k >= 0 ? T.substr(k, m[i].length) : m[i]); }
    return out;
  }
  function todos(N, re) { const r = new RegExp(re.source, re.flags.includes("g") ? re.flags : re.flags + "g"), o = []; let m; while ((m = r.exec(N))) { o.push(m); if (!m[0].length) r.lastIndex++; } return o; }
  function ufDe(N) {
    const m = /(?:[\/–-]\s*|\bUF:?\s*|\bESTADO:?\s*)([A-Z]{2})\b/.exec(N.toUpperCase().replace(/\s+/g, " "));
    if (m && UFS.includes(m[1])) return m[1];
    const U = N.toUpperCase();
    for (const nome of Object.keys(ESTADOS).sort((a, b) => b.length - a.length)) if (U.includes("ESTADO DE " + nome) || U.includes("ESTADO DO " + nome) || U.includes("ESTADO DA " + nome) || new RegExp("\\b" + nome + "\\b").test(U)) return ESTADOS[nome];
    return "";
  }
  function tipoPorTexto(N) {
    const n = N.toLowerCase();
    if (/\b(fazenda|sitio|chacara|gleba|terra nua|hectares?|\bha\b|imovel rural|propriedade rural|ccir|nirf|car\b)/.test(n)) return "Rural";
    if (/\b(loja|sala|conjunto comercial|galpao|predio comercial|ponto comercial|escritorio|deposito|armazem|andar corrido)/.test(n)) return "Comercial";
    if (/\b(apartamento|casa|residencia|cobertura|flat|sobrado|predio residencial|unidade residencial)/.test(n)) return "Residencial (locação ou outro uso)";
    if (/\b(lote|terreno|area de terreno)\b/.test(n)) return "Terreno ou lote";
    return "";
  }
  function endereco(T, N) {
    const m = achar(T, N, /\b(rua|r\.|avenida|av\.|alameda|al\.|praca|rodovia|estrada|travessa|largo|beco|via|quadra)\s+[^,;\n]{2,70}?(?:,\s*(?:n[ºo°.]*\s*)?\d+(?:\.\d{3})*[a-z-]*|\s+n[ºo°.]+\s*\d+(?:\.\d{3})*[a-z-]*)?(?=[,;\n.]|$)/i);
    return m ? limpa(m[0]) : "";
  }
  const dataBR = s => { const m = /(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{4})/.exec(s || ""); return m ? m[1].padStart(2, "0") + "/" + m[2].padStart(2, "0") + "/" + m[3] : ""; };
  function idade(data) { const m = /(\d{2})\/(\d{2})\/(\d{4})/.exec(data || ""); if (!m) return ""; const n = new Date(+m[3], +m[2] - 1, +m[1]), h = new Date(); let a = h.getFullYear() - n.getFullYear(); if (h.getMonth() < n.getMonth() || (h.getMonth() === n.getMonth() && h.getDate() < n.getDate())) a--; return a >= 0 && a < 120 ? String(a) : ""; }

  /* estrutura vazia comum às leituras por regras e pelo Claude */
  const vazio = tipo => ({ tipo, resumo: "", titular: { nome: "", cpf: "" }, endereco_domicilio: { municipio: "", uf: "", logradouro: "" }, profissao: "", imoveis: [], empresas: [], dependentes: [], financeiro: { aplicacoes: 0, previdencia: 0, exterior: 0, outros_bens: 0, dividas: 0 }, rendimentos: { alugueis_ano: 0, lucros_dividendos_ano: 0 }, alertas: [] });
  const imovelVazio = () => ({ descricao: "", tipo_imovel: "", endereco: "", municipio: "", uf: "", matricula: "", cartorio: "", inscricao_municipal: "", area: "", titulares: "", valor_irpf: 0, valor_aquisicao: 0, valor_referencia: 0, origem_referencia: "", onus: "", data_aquisicao: "" });

  /* ------------------------------------------------------------------ leitura do arquivo */
  async function lerArquivo(f, prog) {
    prog = prog || (() => {});
    const tipo = (f.type || "").toLowerCase(), nome = f.name || "arquivo";
    if (tipo === "application/pdf" || /\.pdf$/i.test(nome)) {
      if (!root.EC_LEITOR) throw new Error("O leitor de PDF não foi carregado. Recarregue a página.");
      const lt = await root.EC_LEITOR.ler([f], { prog });
      const pgs = lt.docs[0].paginas;
      return { texto: pgs.map(p => p.texto).join("\n\n"), paginas: lt.paginas, ocr: lt.ocr, conf: lt.ocr ? Math.round(pgs.filter(p => p.ocr).reduce((a, p) => a + (p.conf || 0), 0) / lt.ocr) : null, ilegiveis: lt.ilegiveis };
    }
    if (/^image\//.test(tipo) || /\.(jpe?g|png|webp|bmp|tiff?)$/i.test(nome)) {
      if (!root.Tesseract) throw new Error("O módulo de OCR não foi carregado. Verifique a conexão e recarregue a página.");
      prog("OCR de " + nome, 0.1);
      const w = await root.Tesseract.createWorker("por");
      try { const r = await w.recognize(f); const c = Math.round(r.data.confidence || 0); return { texto: (r.data.text || "").replace(/[ \t]+/g, " ").trim(), paginas: 1, ocr: 1, conf: c, ilegiveis: c < 55 ? [nome] : [] }; }
      finally { await w.terminate(); }
    }
    if (/^text\//.test(tipo) || /\.txt$/i.test(nome)) return { texto: await f.text(), paginas: 1, ocr: 0, conf: null, ilegiveis: [] };
    throw new Error("Formato não suportado. Anexe PDF, foto (JPG ou PNG) ou texto.");
  }

  /* ------------------------------------------------------------------ classificação */
  function classificar(texto) {
    const N = sa(texto).toUpperCase();
    const irpf = [/DECLARACAO DE AJUSTE ANUAL/, /IMPOSTO SOBRE A RENDA\s*-?\s*PESSOA FISICA/, /BENS E DIREITOS/, /ANO[- ]CALENDARIO/, /RENDIMENTOS (TRIBUTAVEIS|ISENTOS)/].filter(r => r.test(N)).length;
    if (irpf >= 2) return "irpf";
    const mat = [/REGISTRO (GERAL )?DE IMOVEIS/, /\bMATRICULA\b/, /\b(R|AV)\s*[-.]?\s*1\b/, /PROPRIETARI/, /\bIMOVEL\s*:/, /LIVRO\s*(N[ºO°.]*\s*)?2/].filter(r => r.test(N)).length;
    const iptu = [/\bIPTU\b|IMPOSTO PREDIAL/, /VALOR VENAL/, /INDICE CADASTRAL|INSCRICAO (IMOBILIARIA|MUNICIPAL|CADASTRAL)/].filter(r => r.test(N)).length;
    if (mat >= 3 && mat >= iptu) return "matricula";
    if (iptu >= 2) return "iptu";
    if (mat >= 2) return "matricula";
    return "outro";
  }

  /* ------------------------------------------------------------------ matrícula */
  const ONUS = [
    ["Alienação fiduciária", /alienacao fiduciaria|propriedade fiduciaria/],
    ["Hipoteca", /hipoteca|hipotecari/],
    ["Penhora", /penhora/], ["Arresto", /\barresto/], ["Sequestro", /sequestro/],
    ["Indisponibilidade", /indisponibilidade/], ["Arrolamento fiscal", /arrolamento/],
    ["Usufruto", /usufruto/],
    ["Cláusula de inalienabilidade", /inalienabilidade/], ["Cláusula de impenhorabilidade", /impenhorabilidade/], ["Cláusula de incomunicabilidade", /incomunicabilidade/],
    ["Servidão", /servidao/], ["Ação judicial averbada", /(averbacao|ajuizamento|distribuicao) d[ae] acao|citacao em acao|acao (real|reipersecutoria|de execucao)/],
    ["Promessa de compra e venda", /promessa de compra e venda|compromisso de compra e venda/]
  ];
  const TRANSMISSAO = /compra e venda|doacao|permuta|formal de partilha|partilha|adjudicacao|arrematacao|integralizacao|dacao em pagamento|usucapiao|heranca|carta de sentenca|consolidacao da propriedade|transmissao/;

  function matricula(T) {
    const N = sa(T), e = vazio("matricula"), im = imovelVazio();
    let m = achar(T, N, /\bmatricula\s*(?:n[ºo°.]*|numero|:)?\s*(\d{1,3}(?:\.\d{3})+|\d{1,7})\b/i); if (m) im.matricula = m[1];
    m = achar(T, N, /(\d{1,2})\s*[ºo°ª]?\s*(?:oficio|cartorio|servico|ofcio)\s+(?:de\s+)?registro\s+(?:geral\s+)?de\s+imoveis(?:\s+d[aeo]\s+(?:comarca\s+de\s+)?([a-z][a-z ]{2,40}?))?(?=[\n,.;\/-]|\s+-|$)/i);
    if (m) im.cartorio = m[1] + "º Ofício de Registro de Imóveis" + (m[2] ? " de " + titulo(m[2]) : "");
    else { m = achar(T, N, /(cartorio|oficio|servico)[^\n]{0,40}?registro\s+(?:geral\s+)?de\s+imoveis[^\n]{0,60}/i); if (m) im.cartorio = titulo(m[0]); }
    m = achar(T, N, /comarca\s+de\s+([a-z][a-z ]{2,40}?)\s*(?:[\/–-]\s*([a-z]{2})\b|,|\.|\n|$)/i) || achar(T, N, /municipio\s+de\s+([a-z][a-z ]{2,40}?)\s*(?:[\/–-]\s*([a-z]{2})\b|,|\.|\n|$)/i);
    if (m) { im.municipio = titulo(m[1]); if (m[2] && UFS.includes(m[2].toUpperCase())) im.uf = m[2].toUpperCase(); }
    if (!im.municipio && m === null) { const c = /registro de imoveis de ([^,.;\n]+)$/i.exec(sa(im.cartorio)); if (c) im.municipio = titulo(im.cartorio.substr(c.index + c[0].length - c[1].length)); }
    if (!im.uf) im.uf = ufDe(N.slice(0, 1500)) || ufDe(N);

    /* descrição: o trecho após "IMÓVEL:" até os proprietários ou o primeiro ato */
    m = achar(T, N, /\bimovel\s*:\s*([\s\S]{20,900}?)(?=propriet|registro anterior|\n\s*(?:r|av)\s*[-.]?\s*1\b|$)/i)
      || achar(T, N, /\b((?:o|um|uma|a)\s+(?:apartamento|casa|lote|terreno|loja|sala|galpao|imovel|fazenda|gleba|sitio|predio)[\s\S]{20,700}?)(?=propriet|registro anterior|\n\s*(?:r|av)\s*[-.]?\s*1\b|$)/i);
    const desc = m ? limpa(m[1]) : "";
    im.descricao = desc.length > 420 ? desc.slice(0, 417).replace(/\s+\S*$/, "") + "…" : desc;
    const ND = sa(desc);
    im.tipo_imovel = tipoPorTexto(ND || N.slice(0, 2000));
    im.endereco = endereco(desc || T, ND || N);
    m = achar(desc || T, ND || N, /\bbairro\s*:?\s*([^,;\n.]{2,40})/i); if (m && im.endereco && !sa(im.endereco).toLowerCase().includes(sa(m[1]).toLowerCase())) im.endereco += ", " + titulo(m[1]);
    m = achar(desc || T, ND || N, /area\s+(?:privativa|total|real|construida|util|do terreno)?[^\d\n]{0,40}([\d.]+(?:,\d+)?)\s*(m²|m2|metros quadrados|hectares|ha)(?![a-z])/i) || achar(T, N, /([\d.]+(?:,\d+)?)\s*(m²|m2|metros quadrados|hectares)(?![a-z])/i);
    if (m) im.area = m[1] + " " + (/hect|^ha$/i.test(m[2]) ? "ha" : "m²");
    m = achar(T, N, /(?:indice cadastral|inscricao (?:municipal|imobiliaria|cadastral|no cadastro)|cadastro (?:municipal|imobiliario)|iptu)\s*(?:n[ºo°.]*)?\s*:?\s*([\d][\d.\-\/ ]{4,28}\d)/i)
      || achar(T, N, /\b(ccir|nirf|cib|car)\s*(?:n[ºo°.]*)?\s*:?\s*([\w.\-\/]{5,40})/i);
    if (m) im.inscricao_municipal = (m.length > 2 && m[2] ? m[1].toUpperCase() + " " + m[2] : m[1]).trim();

    /* atos: R-n e AV-n, com a cadeia de transmissões e os ônus vigentes */
    const marcas = todos(N, /(?:^|\n|\s)((R|AV)\s*[-.]?\s*(\d{1,3}))\s*(?:[-./]\s*(?:M\s*[-.]?\s*)?\d[\d.]*)?\s*[-–:.(]/gi).map(x => ({ i: x.index + x[0].indexOf(x[1]), tipo: x[2].toUpperCase(), n: +x[3] }));
    const atos = marcas.map((a, k) => { const fim = k + 1 < marcas.length ? marcas[k + 1].i : T.length; return Object.assign(a, { t: T.slice(a.i, fim), N: N.slice(a.i, fim).toLowerCase(), rot: a.tipo + "-" + a.n }); });
    const cabeca = marcas.length ? T.slice(0, marcas[0].i) : T, NC = sa(cabeca);
    const nomes = (t, n) => { const o = []; todos(n, /(?:proprietari[oa]s?|adquirentes?|compradore?s?|outorgad[oa]s?\s+compradore?s?|donatari[oa]s?|herdeir[oa]s?|cessionari[oa]s?|arrematantes?)\s*(?:\(s\))?\s*:\s*([^;]{4,160})/gi).forEach(x => { const s = t.substr(x.index + x[0].length - x[1].length, x[1].length).replace(/\s+/g, " "); const nm = s.split(/[,:(]|\s+(?:registro|matricula|r\s*-\s*\d|av\s*-\s*\d|rg\b|brasileir|portador|inscrit|cpf|casad|solteir|divorciad|viuv|residente|nascid|maior|menor|empresari|aposentad|advogad|medic|engenheir|comerciante|do lar)/i)[0]; if (nm && /[a-zà-ÿ]{3,}\s+[a-zà-ÿ]{2,}/i.test(nm)) o.push(titulo(nm.replace(/^(o|a|os|as|sr\.?|sra\.?)\s+/i, ""))); }); return o; };
    const transm = atos.filter(a => a.tipo === "R" && TRANSMISSAO.test(a.N) && !/cancel/.test(a.N.slice(0, 120)));
    const ult = transm[transm.length - 1];
    const sl = x => x.replace(/\n/g, " ");
    let tit = ult ? nomes(sl(ult.t), sl(sa(ult.t))) : []; if (!tit.length) tit = nomes(sl(cabeca), sl(NC));
    im.titulares = [...new Set(tit)].join("; ");
    if (ult) {
      im.data_aquisicao = dataBR(ult.t);
      const v = achar(ult.t, sa(ult.t), /(?:valor|preco|importancia|quantia)\s+(?:total\s+)?(?:de\s+|da\s+transacao\s+de\s+|declarad[oa]\s+de\s+)?R\$\s*(\d{1,3}(?:\.\d{3})*,\d{2})/i) || achar(ult.t, sa(ult.t), /R\$\s*(\d{1,3}(?:\.\d{3})*,\d{2})/i);
      if (v) im.valor_aquisicao = valor(v[1]);
      if (/doacao|heranca|partilha/.test(ult.N)) e.alertas.push("A aquisição atual (" + ult.rot + ") decorre de " + (/doacao/.test(ult.N) ? "doação" : "herança ou partilha") + ": verifique a natureza de bem particular, a colação e eventuais cláusulas restritivas.");
    }
    const av = todos(N, /(?:avaliacao(?:\s+fiscal)?|avaliad[oa]|valor venal|valor fiscal|base de calculo(?:\s+do\s+itbi)?|valor de referencia)[^R\n]{0,70}R\$\s*(\d{1,3}(?:\.\d{3})*,\d{2})/gi);
    if (av.length) { const x = av[av.length - 1]; im.valor_referencia = valor(x[1]); im.origem_referencia = "avaliação fiscal ou valor venal registrado na matrícula"; }

    const onus = [];
    atos.forEach(a => {
      if (/cancel|baixa|extincao|quitacao|levantamento|desconstitui|consolidacao da propriedade/.test(a.N.slice(0, 220))) return;
      ONUS.forEach(([rot, re]) => {
        if (!re.test(a.N)) return;
        if (rot === "Usufruto" && /extin|cancel|renuncia/.test(a.N)) return;
        const cancelado = atos.some(b => b.i > a.i && /cancel|baixa|extin|quitacao|levantamento|renuncia|consolidacao/.test(b.N) && (new RegExp("\\b" + a.tipo.toLowerCase() + "\\s*[-.]?\\s*" + a.n + "\\b").test(b.N) || re.test(b.N)));
        if (cancelado) return;
        const cr = /(?:em favor d[aoe]s?|credor(?:a)?\s*:?|exequente\s*:?|usufrutuari[oa]s?\s*:?)\s+([^,;\n]{3,80})/i.exec(a.t);
        onus.push(rot + " (" + a.rot + (cr ? "; " + limpa(cr[1]).replace(/\.$/, "") : "") + ")");
      });
    });
    im.onus = [...new Set(onus)].join("; ");
    if (/promessa|compromisso/.test(im.onus.toLowerCase())) e.alertas.push("Há promessa de compra e venda registrada: confirme se o imóvel ainda integra o patrimônio da família.");
    if (/usufruto/i.test(im.onus)) e.alertas.push("Há usufruto vigente sobre o imóvel " + (im.matricula ? "da matrícula " + im.matricula : "") + ": a nua-propriedade e o usufruto devem ser tratados separadamente no planejamento.");
    if (/indisponibilidade|penhora|arresto|sequestro|arrolamento/i.test(im.onus)) e.alertas.push("Constrição judicial ou fiscal vigente no imóvel " + (im.matricula ? "da matrícula " + im.matricula : "") + ": a transferência a holding ou a doação pode ser ineficaz perante o credor e deve ser precedida de análise do passivo.");
    if (!atos.length) e.alertas.push("Não foi possível identificar os atos (R e AV) da matrícula. Confira a leitura, sobretudo se o documento foi fotografado.");
    e.imoveis.push(im);
    if (tit.length) e.titular.nome = tit[0];
    e.resumo = "Matrícula" + (im.matricula ? " nº " + im.matricula : "") + (im.cartorio ? ", " + im.cartorio : "") + (im.municipio ? ", " + im.municipio + (im.uf ? "/" + im.uf : "") : "");
    return e;
  }

  /* ------------------------------------------------------------------ IPTU */
  function iptu(T) {
    const N = sa(T), e = vazio("iptu"), im = imovelVazio();
    let m = achar(T, N, /(?:indice cadastral|inscricao (?:imobiliaria|municipal|cadastral)|cadastro imobiliario|n[ºo°.]?\s*do imovel)\s*(?:n[ºo°.]*)?\s*:?\s*([\d][\d.\-\/ ]{4,28}\d)/i); if (m) im.inscricao_municipal = m[1].trim();
    m = achar(T, N, /valor venal\s*(?:total|do imovel|territorial e predial)?[^\d\n]{0,25}(\d{1,3}(?:\.\d{3})*,\d{2})/i); if (m) { im.valor_referencia = valor(m[1]); im.origem_referencia = "valor venal do IPTU"; }
    im.endereco = endereco(T, N); im.uf = ufDe(N); im.tipo_imovel = tipoPorTexto(N);
    m = achar(T, N, /(?:prefeitura|municipio)\s+(?:municipal\s+)?de\s+([a-z][a-z ]{2,40}?)(?=[\n,.;\/-]|$)/i); if (m) im.municipio = titulo(m[1]);
    m = achar(T, N, /area\s+(?:construida|edificada|do terreno|total)?[^\d\n]{0,25}([\d.]+(?:,\d+)?)\s*(m²|m2)/i); if (m) im.area = m[1] + " m²";
    m = achar(T, N, /(?:contribuinte|proprietario|compromissario)\s*:?\s*([^\n;]{4,80})/i); if (m) { im.titulares = titulo(m[1].split(/,|\s+cpf/i)[0]); e.titular.nome = im.titulares; }
    im.descricao = [im.tipo_imovel ? im.tipo_imovel.replace(/ \(.*\)/, "") : "Imóvel", im.endereco].filter(Boolean).join(", ");
    e.imoveis.push(im);
    e.resumo = "IPTU" + (im.inscricao_municipal ? " do índice " + im.inscricao_municipal : "") + (im.municipio ? ", " + im.municipio : "");
    return e;
  }

  /* ------------------------------------------------------------------ IRPF */
  const SECOES = /\n\s*(?:BENS E DIREITOS|DIVIDAS E ONUS REAIS|DOACOES E HERANCAS|DEPENDENTES|ALIMENTANDOS|PAGAMENTOS EFETUADOS|RENDIMENTOS (?:TRIBUTAVEIS|ISENTOS|SUJEITOS)|RESUMO DA DECLARACAO|INFORMACOES DO CONJUGE|IMPOSTO PAGO|ESPOLIO|ATIVIDADE RURAL|GANHOS DE CAPITAL|RENDA VARIAVEL|DOACOES EFETUADAS|DEMONSTRATIVO|EVOLUCAO PATRIMONIAL|OUTRAS INFORMACOES|RECIBO DE ENTREGA)\b/g;
  function secao(T, N, re) {
    const U = N.toUpperCase(), m = re.exec(U); if (!m) return null;
    const ini = m.index + m[0].length; SECOES.lastIndex = ini + 1; let fim = T.length, s;
    while ((s = SECOES.exec(U))) { if (s.index > ini + 2) { fim = s.index; break; } }
    return { T: T.slice(ini, fim), N: N.slice(ini, fim) };
  }
  function valoresSituacao(t, n, ano) {
    const lab = todos(n, /31\/12\/(\d{4})\s*(?:\(R\$\))?\s*:?\s*(?:R\$\s*)?(\d{1,3}(?:\.\d{3})*,\d{2})/gi);
    if (lab.length) { const o = {}; lab.forEach(x => { o[x[1]] = valor(x[2]); }); const anos = Object.keys(o).sort(); return { atual: o[ano] != null ? o[ano] : o[anos[anos.length - 1]], anterior: anos.length > 1 ? o[anos[anos.length - 2]] : 0 }; }
    const v = todos(n, DINHEIRO).filter(x => !/^\s*(m²|m2|ha\b|hectare)/i.test(n.slice(x.index + x[0].length, x.index + x[0].length + 10)) && !/area[^\n]{0,20}$/i.test(n.slice(Math.max(0, x.index - 25), x.index))).map(x => valor(x[0]));
    return { atual: v.length ? v[v.length - 1] : 0, anterior: v.length > 1 ? v[v.length - 2] : 0 };
  }
  const IMOVEL_COD = { "01": "Residencial (locação ou outro uso)", "11": "Residencial (locação ou outro uso)", "12": "Residencial (locação ou outro uso)", "02": "Comercial", "03": "Comercial", "15": "Comercial", "18": "Comercial", "13": "Terreno ou lote", "14": "Rural" };

  function irpf(T) {
    const N = sa(T), U = N.toUpperCase(), e = vazio("irpf");
    let m = /ANO[- ]CALENDARIO\s*:?\s*(\d{4})/.exec(U); const ano = m ? m[1] : "";
    m = /EXERCICIO\s*:?\s*(\d{4})/.exec(U); const exerc = m ? m[1] : (ano ? String(+ano + 1) : "");
    m = achar(T, N, /\bnome(?:\s+do\s+contribuinte)?\s*:?\s*([a-z][a-z .'-]{4,80}?)\s*(?:cpf|\n|$)/i); if (m) e.titular.nome = titulo(m[1]);
    m = /CPF\s*:?\s*(\d{3}\.?\d{3}\.?\d{3}-?\d{2})/.exec(U); if (m) e.titular.cpf = m[1];
    m = achar(T, N, /municipio\s*:?\s*([a-z][a-z .'-]{2,40}?)\s+(?:uf\s*:?\s*)?([a-z]{2})\b/i); if (m && UFS.includes(m[2].toUpperCase())) { e.endereco_domicilio.municipio = titulo(m[1]); e.endereco_domicilio.uf = m[2].toUpperCase(); }
    m = achar(T, N, /(?:endereco|logradouro)\s*:?\s*((?:rua|avenida|av\.|alameda|praca|rodovia|estrada|travessa)[^\n]{3,80})/i); if (m) e.endereco_domicilio.logradouro = limpa(m[1]);
    m = achar(T, N, /ocupacao principal\s*:?\s*(?:\d{2,3}\s*-\s*)?([^\n]{3,80})/i); if (m) e.profissao = limpa(m[1]).replace(/\s+(natureza|tipo).*$/i, "");

    /* bens e direitos */
    const B = secao(T, N, /\bBENS E DIREITOS\b/);
    if (B) {
      let marcas = todos(B.N, /grupo\s*:?\s*(\d{2})\b[\s\S]{0,90}?codigo\s*:?\s*(\d{2})\b/gi);
      if (marcas.length < 1) marcas = todos(B.N, /(?:^|\n)\s*(0[1-8]|99)\s+(\d{2})\s+(?=\S)/g);
      marcas.forEach((x, k) => {
        const ini = x.index, fim = k + 1 < marcas.length ? marcas[k + 1].index : (/\n\s*TOTAL\b/i.exec(B.N.slice(ini)) ? ini + /\n\s*TOTAL\b/i.exec(B.N.slice(ini)).index : B.N.length);
        const t = B.T.slice(ini, fim), n = B.N.slice(ini, fim), g = x[1], c = x[2];
        const { atual } = valoresSituacao(t, n, ano);
        let disc = (achar(t, n, /discriminacao\s*:?\s*([\s\S]{3,600}?)(?=situacao em|\n\s*(?:localizacao|cnpj|cpf|data de aquisicao|area|inscricao|logradouro|municipio|nome do cartorio|matricula)\b|$)/i) || [])[1];
        if (!disc) disc = t.replace(/^\s*(?:grupo[\s\S]{0,90}?codigo\s*:?\s*\d{2}(?:\s*-\s*[^\n]*)?|\d{2}\s+\d{2})\s*/i, "").replace(DINHEIRO, "").replace(/\s{2,}/g, " ");
        disc = limpa(disc).replace(/\s*\d{1,3}(?:\.\d{3})*,\d{2}\s*$/, "");
        const nd = sa(disc).toLowerCase();
        const pais = /localizacao(?:\s*\(pais\))?\s*:?\s*(\d{3})\s*-\s*([a-z ]+)/i.exec(n);
        const exterior = (pais && pais[1] !== "105") || /\b(exterior|offshore|eua|estados unidos|portugal|miami|nova york|paris|londres)\b/.test(nd) && !/brasil/.test(nd);
        if (!atual) return;
        if (exterior) { e.financeiro.exterior += atual; return; }
        if (g === "01") {
          const im = imovelVazio();
          im.descricao = disc.length > 420 ? disc.slice(0, 417).replace(/\s+\S*$/, "") + "…" : disc;
          im.valor_irpf = atual; im.tipo_imovel = tipoPorTexto(nd) || IMOVEL_COD[c] || "";
          im.endereco = endereco(disc, sa(disc));
          let y = achar(t, n, /matricula(?:\s+do\s+imovel)?\s*(?:n[ºo°.]*)?\s*:?\s*(\d{1,3}(?:\.\d{3})+|\d{1,7})\b/i); if (y) im.matricula = y[1];
          y = achar(t, n, /(?:nome do cartorio|cartorio)\s*:?\s*([^\n]{3,80})/i); if (y) im.cartorio = limpa(y[1]);
          y = achar(t, n, /inscricao municipal(?:\s*\(iptu\))?\s*:?\s*([\d][\d.\-\/ ]{3,28}\d)/i); if (y) im.inscricao_municipal = y[1].trim();
          y = achar(t, n, /municipio\s*:?\s*([a-z][a-z .'-]{2,40}?)\s+(?:uf\s*:?\s*)?([a-z]{2})\b/i);
          if (y && UFS.includes(y[2].toUpperCase())) { im.municipio = titulo(y[1]); im.uf = y[2].toUpperCase(); }
          else { y = achar(disc, sa(disc), /([a-z][a-z ]{2,40})\s*[\/–-]\s*([a-z]{2})\b/i); if (y && UFS.includes(y[2].toUpperCase())) { im.municipio = titulo(y[1]); im.uf = y[2].toUpperCase(); } }
          y = achar(t, n, /data de aquisicao\s*:?\s*(\d{2}\/\d{2}\/\d{4})/i); if (y) im.data_aquisicao = y[1];
          y = achar(t, n, /area total\s*:?\s*([\d.]+(?:,\d+)?)\s*(?:unidade\s*:?\s*)?(m²|m2|ha|hectares)?/i); if (y) im.area = y[1] + " " + (/h/i.test(y[2] || "") ? "ha" : "m²");
          if (!im.matricula) { y = achar(disc, sa(disc), /matricula\s*(?:n[ºo°.]*)?\s*:?\s*(\d{1,3}(?:\.\d{3})+|\d{1,7})\b/i); if (y) im.matricula = y[1]; }
          if (/\b(fracao|50%|metade|parte ideal|\d{1,2}%\s+d[oe])/.test(nd)) im.titulares = "Fração declarada: " + ((/(\d{1,3}(?:,\d+)?)\s*%/.exec(disc) || [])[0] || "parte ideal");
          e.imoveis.push(im); return;
        }
        if (g === "03" && (c !== "01" || /cnpj|ltda|eireli|s\/a|\bsa\b|holding|quotas?/.test(nd)) && !/\b(b3|bolsa|listad)/.test(nd)) {
          const cnpj = /(\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2})/.exec(t);
          let nome = (/(?:quotas?|acoes|participacao)\s+(?:de capital\s+)?(?:d[aeo]|na)\s+(?:empresa\s+)?([^,;\n]{3,80}?)(?=,|;|\s+cnpj|\s+inscrit|\s+com sede|$)/i.exec(nd) || [])[1];
          nome = nome ? titulo(disc.substr(nd.indexOf(nome), nome.length)) : (cnpj ? "" : disc.slice(0, 80));
          const pct = /(\d{1,3}(?:,\d+)?)\s*%/.exec(disc);
          e.empresas.push({ nome: nome.replace(/\b(Ltda|Eireli|S\/a|Me|Epp)\b/gi, x => x.toUpperCase()), cnpj: cnpj ? cnpj[1] : "", participacao_pct: pct ? valor(pct[1]) : 0, valor_declarado: atual, descricao: disc.slice(0, 200) });
          return;
        }
        if (/vgbl|pgbl|previdencia/.test(nd)) { e.financeiro.previdencia += atual; return; }
        if (["03", "04", "06", "07", "08"].includes(g)) { e.financeiro.aplicacoes += atual; return; }
        if (g === "05") { e.financeiro.outros_bens += atual; e.alertas.push("Crédito declarado (" + disc.slice(0, 80) + "): avalie a cobrança ou a conversão antes da sucessão."); return; }
        e.financeiro.outros_bens += atual;
      });
      if (!marcas.length) e.alertas.push("A seção de bens e direitos foi localizada, mas os itens não puderam ser separados. Confira a leitura ou use a leitura pelo Claude.");
    } else e.alertas.push("A seção de bens e direitos não foi localizada nesta declaração.");

    /* dívidas e ônus reais */
    const D = secao(T, N, /\bDIVIDAS E ONUS REAIS\b/);
    if (D) {
      const tot = /\n\s*TOTAL\b([^\n]*)/i.exec(D.N);
      if (tot) { const v = todos(tot[1], DINHEIRO).map(x => valor(x[0])); if (v.length) e.financeiro.dividas = v.length >= 3 ? v[v.length - 2] : v[v.length - 1]; }
      if (!e.financeiro.dividas) {
        const it = todos(D.N, /(?:^|\n)\s*(\d{2})\s+(?=\S)/g);
        it.forEach((x, k) => { const t = D.N.slice(x.index, k + 1 < it.length ? it[k + 1].index : D.N.length), v = todos(t, DINHEIRO).map(y => valor(y[0])); if (v.length >= 2) e.financeiro.dividas += v.length >= 3 ? v[v.length - 2] : v[v.length - 1]; });
      }
    }

    /* dependentes */
    const P = secao(T, N, /\bDEPENDENTES\b/);
    if (P) {
      const vistos = new Set();
      const add = (cod, nome, nasc) => { const nm = titulo(nome); if (!nm || vistos.has(nm) || /^(nome|cpf|data)/i.test(nm)) return; vistos.add(nm); e.dependentes.push({ nome: nm, data_nascimento: nasc, parentesco: cod }); };
      todos(P.N, /(?:tipo de dependente|codigo)\s*:?\s*(\d{2})[^\n]*\n?[\s\S]{0,80}?nome\s*:?\s*([a-z][a-z .'-]{4,80}?)\s*(?:\n|cpf|data)[\s\S]{0,80}?(\d{2}\/\d{2}\/\d{4})/gi).forEach(x => add(x[1], P.T.substr(P.N.indexOf(x[2], x.index), x[2].length), x[3]));
      todos(P.N, /(?:^|\n)\s*(\d{2})\s+(?:-\s*)?([a-z][a-z .'-]{4,80}?)\s+(\d{2}\/\d{2}\/\d{4})/gi).forEach(x => add(x[1], P.T.substr(P.N.indexOf(x[2], x.index), x[2].length), x[3]));
    }

    /* rendimentos de interesse */
    m = /lucros e dividendos[^\n]{0,80}?(\d{1,3}(?:\.\d{3})*,\d{2})/i.exec(N); if (m) e.rendimentos.lucros_dividendos_ano = valor(m[1]);
    let alug = 0; todos(N, /alugue(?:is|l)[^\n\d]{0,40}(\d{1,3}(?:\.\d{3})*,\d{2})/gi).forEach(x => { alug = Math.max(alug, valor(x[1])); }); e.rendimentos.alugueis_ano = alug;

    e.resumo = "Declaração de IRPF" + (exerc ? " do exercício " + exerc + (ano ? " (ano-calendário " + ano + ")" : "") : "") + (e.titular.nome ? ", de " + e.titular.nome : "");
    if (ano && +ano < new Date().getFullYear() - 1) e.alertas.push("A declaração é do ano-calendário " + ano + ": confirme se houve aquisições, vendas ou doações posteriores.");
    return e;
  }

  function extrair(texto) {
    const tipo = classificar(texto);
    if (tipo === "irpf") return irpf(texto);
    if (tipo === "matricula") return matricula(texto);
    if (tipo === "iptu") return iptu(texto);
    const e = vazio("outro"); e.resumo = "Documento não identificado como matrícula, declaração de IRPF ou IPTU."; return e;
  }

  /* ------------------------------------------------------------------ leitura pelo Claude */
  const S = { type: "string" }, NUM = { type: "number" };
  const obj = p => ({ type: "object", properties: p, required: Object.keys(p), additionalProperties: false });
  const ESQUEMA = obj({
    tipo: { type: "string", enum: ["matricula", "irpf", "iptu", "outro"] }, resumo: S,
    titular: obj({ nome: S, cpf: S }), endereco_domicilio: obj({ municipio: S, uf: S, logradouro: S }), profissao: S,
    imoveis: { type: "array", items: obj({ descricao: S, tipo_imovel: { type: "string", enum: TIPOS.concat([""]) }, endereco: S, municipio: S, uf: S, matricula: S, cartorio: S, inscricao_municipal: S, area: S, titulares: S, valor_irpf: NUM, valor_aquisicao: NUM, valor_referencia: NUM, origem_referencia: S, onus: S, data_aquisicao: S }) },
    empresas: { type: "array", items: obj({ nome: S, cnpj: S, participacao_pct: NUM, valor_declarado: NUM, descricao: S }) },
    dependentes: { type: "array", items: obj({ nome: S, data_nascimento: S, parentesco: S }) },
    financeiro: obj({ aplicacoes: NUM, previdencia: NUM, exterior: NUM, outros_bens: NUM, dividas: NUM }),
    rendimentos: obj({ alugueis_ano: NUM, lucros_dividendos_ano: NUM }),
    alertas: { type: "array", items: S }
  });
  const INSTRUCOES = [
    "Você extrai dados de documentos patrimoniais brasileiros para um diagnóstico de planejamento patrimonial e sucessório feito por advogados. O documento anexado é uma matrícula de imóvel (certidão do Registro de Imóveis), uma declaração de ajuste anual do IRPF, um carnê ou certidão de IPTU, ou outro documento.",
    "Regras gerais: transcreva apenas o que consta do documento, sem estimar nem completar; use string vazia ou 0 quando a informação não existir. Valores monetários em reais, como número (1234567.89). Datas em dd/mm/aaaa. UF com duas letras. Nomes de pessoas como constam, em grafia normal (não tudo em maiúsculas).",
    "Matrícula: um item em imoveis com número da matrícula, cartório, descrição resumida (tipo, unidade, edifício, endereço, área), endereço, município e UF; titulares atuais segundo o último ato de transmissão (R) não cancelado; valor_aquisicao do último ato de transmissão; valor_referencia com a avaliação fiscal ou o valor venal mais recente registrado, indicando a origem; onus com os ônus e restrições vigentes, com o número do ato e o credor ou beneficiário (alienação fiduciária, hipoteca, penhora, arresto, indisponibilidade, arrolamento, usufruto, cláusulas de inalienabilidade, impenhorabilidade e incomunicabilidade, servidão, ações averbadas), desconsiderando os que tenham sido cancelados por averbação posterior. Em alertas, registre pontos relevantes ao planejamento: aquisição por doação ou herança, usufruto, constrições, divergência de área ou de titularidade, imóvel em condomínio com terceiros, pendências de averbação de construção.",
    "IRPF: titular (nome e CPF), município e UF do domicílio, ocupação principal; cada bem do grupo 01 em imoveis, com valor_irpf igual à situação em 31/12 do ano-calendário (o mais recente), e com matrícula, cartório, inscrição municipal, município, UF, área e data de aquisição quando informados; participações societárias fechadas (quotas e ações não negociadas em bolsa) em empresas, com CNPJ, percentual e valor declarado; em financeiro, a soma das situações mais recentes de aplicações, depósitos, fundos, ações em bolsa e criptoativos (aplicacoes), VGBL e PGBL (previdencia), bens situados no exterior de qualquer grupo (exterior, sem repeti-los nas demais rubricas), veículos, créditos e demais bens (outros_bens) e o total das dívidas e ônus reais (dividas). Dependentes com nome, nascimento e o código ou a descrição do parentesco. Rendimentos: aluguéis recebidos no ano (pessoa física e jurídica) e lucros e dividendos isentos. Em alertas, registre divergências e pontos de atenção (bens em condomínio com o cônjuge, valores desatualizados, bens no exterior, dívidas relevantes).",
    "IPTU: um item em imoveis com inscrição ou índice cadastral, endereço, município, área e valor_referencia com o valor venal (origem: valor venal do IPTU)."
  ].join("\n\n");

  async function extrairComClaude(cli, f, opc) {
    const buf = new Uint8Array(await f.arrayBuffer()); let bin = ""; for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode.apply(null, buf.subarray(i, i + 0x8000));
    const dados = btoa(bin), pdf = (f.type || "").includes("pdf") || /\.pdf$/i.test(f.name);
    const mime = pdf ? "application/pdf" : (/png$/i.test(f.type || f.name) ? "image/png" : /webp$/i.test(f.type || f.name) ? "image/webp" : "image/jpeg");
    const bloco = pdf ? { type: "document", source: { type: "base64", media_type: mime, data: dados } } : { type: "image", source: { type: "base64", media_type: mime, data: dados } };
    const resp = await cli.beta.messages.create({
      model: opc.modelo, max_tokens: 16000,
      thinking: { type: "adaptive" }, output_config: { effort: "medium", format: { type: "json_schema", schema: ESQUEMA } },
      betas: ["server-side-fallback-2026-07-01"], fallbacks: "default",
      system: INSTRUCOES,
      messages: [{ role: "user", content: [bloco, { type: "text", text: "Extraia os dados deste documento (" + f.name + ") conforme o esquema." }] }]
    }, { signal: opc.signal });
    if (resp.stop_reason === "refusal") throw new Error("O modelo recusou a leitura deste documento.");
    if (resp.stop_reason === "max_tokens") throw new Error("A resposta excedeu o limite de extensão.");
    const txt = resp.content.filter(b => b.type === "text").map(b => b.text).join("");
    let e; try { e = JSON.parse(txt); } catch (x) { throw new Error("A resposta do Claude não pôde ser interpretada."); }
    return e;
  }

  /* ------------------------------------------------------------------ conciliação com o formulário */
  const matNum = s => { const m = /matr[ií]cula\s*(?:n[ºo°.]*)?\s*:?\s*(\d[\d.]*)/i.exec(s || ""); return m ? m[1] : (/^\s*[\d.]+\s*$/.test(s || "") ? s : ""); };
  const insNum = s => { const m = /inscri[cç][aã]o\s*:?\s*([\d][\d.\-\/ ]{3,28}\d)/i.exec(s || ""); return m ? m[1] : ""; };
  const chaveEnd = s => { const n = sa(s).toLowerCase().replace(/(\d)\.(\d)/g, "$1$2").replace(/\b(rua|r|avenida|av|alameda|al|praca|rodovia|estrada|travessa|n|no|numero)\b\.?/g, " ").replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim(); const num = (/\b(\d{1,5})\b/.exec(n) || [])[1] || ""; const pal = n.split(" ").filter(w => w.length > 3 && !/^\d+$/.test(w)).slice(0, 3).join(" "); return pal ? pal + "|" + num : ""; };
  function mesmoImovel(a, b) {
    const ma = digitos(a.matricula), mb = digitos(b.matricula);
    if (ma && mb) return ma === mb;
    const ia = digitos(a.inscricao_municipal), ib = digitos(b.inscricao_municipal);
    if (ia && ib && ia.length > 4) return ia === ib;
    const ea = chaveEnd(a.endereco || a.descricao), eb = chaveEnd(b.endereco || b.descricao);
    if (ea && eb) { const [pa, na] = ea.split("|"), [pb, nb] = eb.split("|"); return pa.split(" ")[0] === pb.split(" ")[0] && (!na || !nb || na === nb) && pa.split(" ").some(w => pb.includes(w)); }
    return false;
  }
  /* une os imóveis lidos em documentos diferentes (matrícula, IRPF, IPTU) que se referem ao mesmo bem */
  function unirImoveis(extracoes) {
    const out = [];
    extracoes.forEach(x => (x.e.imoveis || []).forEach(im => {
      const atual = out.find(o => mesmoImovel(o, im));
      const fonte = { arq: x.nome, tipo: x.e.tipo };
      if (!atual) { out.push(Object.assign(imovelVazio(), im, { fontes: [fonte] })); return; }
      atual.fontes.push(fonte);
      Object.keys(im).forEach(k => {
        const v = im[k]; if (!v) return;
        if (k === "valor_irpf") atual.valor_irpf = (atual.valor_irpf || 0) + v;
        else if (k === "descricao") { if (x.e.tipo === "matricula" || !atual.descricao) atual.descricao = v; }
        else if (k === "titulares") { if (x.e.tipo === "matricula" || !atual.titulares) atual.titulares = v; }
        else if (k === "onus") atual.onus = [atual.onus, v].filter(Boolean).join("; ");
        else if (k === "valor_referencia") { if (!atual.valor_referencia || x.e.tipo === "iptu") { atual.valor_referencia = v; atual.origem_referencia = im.origem_referencia; } }
        else if (!atual[k]) atual[k] = v;
      });
    }));
    return out;
  }
  const nomeChave = s => sa(s).toLowerCase().replace(/[^a-z ]/g, "").split(" ").filter(w => w.length > 2 && !["dos", "das", "de", "da", "do"].includes(w));
  const mesmaPessoa = (a, b) => { const x = nomeChave(a), y = nomeChave(b); return !!(x.length && y.length && x[0] === y[0] && (x.length === 1 || y.length === 1 || x[x.length - 1] === y[y.length - 1])); };

  /* propõe as alterações do formulário; cada proposta tem um rótulo, o detalhe e a ação (aplicada pelo controlador) */
  function propostas(extracoes, d, brl) {
    const P = [], conf = [];
    const irpfs = extracoes.filter(x => x.e.tipo === "irpf"), mats = extracoes.filter(x => x.e.tipo === "matricula");
    extracoes.forEach(x => (x.e.alertas || []).forEach(a => conf.push(x.nome + ": " + a)));

    /* família */
    const tit = irpfs.map(x => x.e.titular).filter(t => t && t.nome);
    const casal = d.casal || {};
    tit.forEach(t => {
      if ([casal.patriarca, casal.matriarca].some(n => n && mesmaPessoa(n, t.nome))) return;
      const vago = !casal.patriarca ? "patriarca" : !casal.matriarca ? "matriarca" : "";
      if (!vago) return;
      P.push({ grupo: "Família", rot: t.nome, det: "Titular da declaração de IRPF" + (t.cpf ? ", CPF " + t.cpf : ""), escolha: [["casal.patriarca", "Patriarca"], ["casal.matriarca", "Matriarca"]], padrao: "casal." + vago, acao: { tipo: "campo", valor: t.nome } });
    });
    const dom = irpfs.map(x => x.e.endereco_domicilio).find(z => z && z.municipio);
    if (dom) {
      if (!(d.cliente || {}).cidade) P.push({ grupo: "Família", rot: "Cidade: " + dom.municipio, det: "Domicílio fiscal declarado no IRPF", acao: { tipo: "campo", chave: "cliente.cidade", valor: dom.municipio } });
      if (!(d.cliente || {}).uf && dom.uf) P.push({ grupo: "Família", rot: "UF do domicílio: " + dom.uf, det: "Domicílio fiscal declarado no IRPF", acao: { tipo: "campo", chave: "cliente.uf", valor: dom.uf } });
    }
    const prof = irpfs.map(x => x.e.profissao).find(Boolean);
    if (prof && !(d.cliente || {}).profissao) P.push({ grupo: "Família", rot: "Profissão: " + prof, det: "Ocupação principal declarada no IRPF", acao: { tipo: "campo", chave: "cliente.profissao", valor: prof } });
    const filhosAtuais = (d.filhos || []).filter(f => f.nome);
    const deps = []; irpfs.forEach(x => (x.e.dependentes || []).forEach(dp => { if (!/^(11|12|31|41|51)$/.test(dp.parentesco) && !deps.some(o => mesmaPessoa(o.nome, dp.nome))) deps.push(dp); }));
    deps.forEach(dp => {
      const existe = filhosAtuais.find(f => mesmaPessoa(f.nome, dp.nome)), id = idade(dp.data_nascimento);
      if (existe && (existe.idade || !id)) return;
      P.push({ grupo: "Família", rot: (existe ? "Atualizar idade de " : "Filho: ") + dp.nome + (id ? ", " + id + " anos" : ""), det: "Dependente no IRPF" + (dp.data_nascimento ? ", nascido(a) em " + dp.data_nascimento : "") + (dp.parentesco && !/^2[1-2]$/.test(dp.parentesco) ? " (código " + dp.parentesco + "; confirme o parentesco)" : ""), marcado: /^2[1-2]$/.test(dp.parentesco) || /filh/i.test(dp.parentesco) || !dp.parentesco, acao: { tipo: "filho", nome: existe ? existe.nome : dp.nome, idade: id } });
    });

    /* imóveis */
    const ims = unirImoveis(extracoes), atuais = (d.imoveis || []).map((x, i) => ({ i, x })).filter(o => o.x.desc || o.x.irpf || o.x.mercado || o.x.matricula);
    const usados = new Set();
    const domEnd = dom && dom.logradouro ? chaveEnd(dom.logradouro) : "";
    const mesmoEnd = (a, b) => { if (!a || !b) return false; const [pa, na] = a.split("|"), [pb, nb] = b.split("|"); return pa.split(" ")[0] === pb.split(" ")[0] && !!na && na === nb; };
    ims.forEach(im => {
      const alvo = atuais.find(o => !usados.has(o.i) && mesmoImovel({ matricula: matNum(o.x.matricula), inscricao_municipal: insNum(o.x.matricula), endereco: endereco(o.x.desc || "", sa(o.x.desc || "")) || o.x.desc, descricao: o.x.desc }, im));
      if (alvo) usados.add(alvo.i);
      const desc = im.descricao || [im.tipo_imovel ? im.tipo_imovel.replace(/ \(.*\)/, "") : "Imóvel", im.endereco].filter(Boolean).join(", ");
      const local = [im.municipio, im.uf].filter(Boolean).join("/");
      const descFinal = desc + (local && !sa(desc).toLowerCase().includes(sa(im.municipio || "~").toLowerCase()) ? ", " + local : "") + (im.area && !desc.includes(im.area) ? ", " + im.area : "");
      let tipo = im.tipo_imovel || "";
      if (/Residencial/.test(tipo) && domEnd && im.endereco && mesmoEnd(chaveEnd(im.endereco), domEnd)) tipo = "Residência da família";
      const campos = {};
      if (descFinal && (!alvo || !alvo.x.desc)) campos.desc = descFinal;
      if (tipo && TIPOS.includes(tipo) && (!alvo || !alvo.x.desc)) campos.tipo = tipo;
      if (im.uf) campos.uf = im.uf;
      if (im.valor_irpf) campos.irpf = Math.round(im.valor_irpf).toLocaleString("pt-BR");
      const mat = [im.matricula ? "Matrícula " + im.matricula : "", im.cartorio, im.inscricao_municipal ? "Inscrição " + im.inscricao_municipal : ""].filter(Boolean).join(", ");
      if (mat) campos.matricula = mat;
      if (im.titulares) campos.titular = im.titulares;
      if (/\b(alugad[oa]|locad[oa]|em locacao)\b/.test(sa(im.descricao).toLowerCase()) && (!alvo || alvo.x.alugado !== "sim")) campos.alugado = "sim";
      if (im.onus) campos.onus = im.onus; else if (im.fontes.some(f => f.tipo === "matricula")) campos.onus = "Nenhum ônus vigente identificado na matrícula";
      if (alvo) Object.keys(campos).forEach(k => { if (String(alvo.x[k] || "").trim() === String(campos[k]).trim()) delete campos[k]; });
      const fontes = [...new Set(im.fontes.map(f => f.arq))].join(", ");
      const det = [fontes, im.valor_irpf ? "IRPF " + brl(im.valor_irpf) : "", im.valor_aquisicao ? "aquisição " + brl(im.valor_aquisicao) + (im.data_aquisicao ? " em " + im.data_aquisicao : "") : "", im.onus ? "ônus: " + im.onus : ""].filter(Boolean).join(" · ");
      if (Object.keys(campos).length) P.push({ grupo: "Imóveis", rot: (alvo ? "Atualizar Imóvel " + (alvo.i + 1) + ": " : "Novo imóvel: ") + (descFinal || "sem descrição").slice(0, 120), det, acao: { tipo: "imovel", idx: alvo ? alvo.i : -1, campos } });
      if (im.valor_referencia && (!alvo || !alvo.x.mercado)) P.push({ grupo: "Imóveis", rot: "Valor de mercado provisório de " + (descFinal || "imóvel").slice(0, 60) + ": " + brl(im.valor_referencia), det: "Referência: " + (im.origem_referencia || "valor registrado") + ". O valor venal e a avaliação fiscal costumam ficar abaixo do mercado; ajuste se houver estimativa melhor.", marcado: false, acao: { tipo: "imovelMercado", ref: P.length - 1, idx: alvo ? alvo.i : -1, valor: Math.round(im.valor_referencia).toLocaleString("pt-BR") } });
      /* conferências cruzadas */
      const doIr = im.fontes.some(f => f.tipo === "irpf"), daMat = im.fontes.some(f => f.tipo === "matricula");
      if (daMat && irpfs.length && !doIr) conf.push("O imóvel " + (im.matricula ? "da matrícula " + im.matricula : descFinal.slice(0, 60)) + " não foi localizado nas declarações de IRPF anexadas. Verifique se está declarado (talvez na declaração do cônjuge) ou se foi alienado.");
      if (doIr && mats.length && !daMat && im.matricula) conf.push("A declaração menciona a matrícula " + im.matricula + ", que não foi anexada.");
      if (daMat && im.titulares && tit.length && !tit.some(t => im.titulares.split(";").some(n => mesmaPessoa(n, t.nome)))) conf.push("Os titulares da matrícula " + (im.matricula || "") + " (" + im.titulares + ") não coincidem com o titular da declaração de IRPF anexada. Confirme a titularidade e o regime de bens.");
      if (doIr && im.valor_aquisicao && im.valor_irpf && Math.abs(im.valor_aquisicao - im.valor_irpf) / Math.max(im.valor_irpf, 1) > 0.5) conf.push("O valor de aquisição na matrícula " + (im.matricula || "") + " (" + brl(im.valor_aquisicao) + ") diverge do valor no IRPF (" + brl(im.valor_irpf) + "). Pode tratar-se de fração ideal, benfeitorias declaradas ou valor desatualizado.");
    });
    if (mats.length && irpfs.length) { const decl = ims.filter(x => x.fontes.some(f => f.tipo === "irpf") && !x.fontes.some(f => f.tipo === "matricula")).length; if (decl) conf.push(decl + (decl === 1 ? " imóvel declarado no IRPF não teve a matrícula anexada." : " imóveis declarados no IRPF não tiveram a matrícula anexada.") + " A matrícula atualizada é necessária para verificar ônus e titularidade."); }

    /* empresas */
    const emps = []; irpfs.forEach(x => (x.e.empresas || []).forEach(em => { const ex = emps.find(o => (digitos(o.cnpj) && digitos(o.cnpj) === digitos(em.cnpj)) || (o.nome && em.nome && sa(o.nome).toLowerCase() === sa(em.nome).toLowerCase())); if (ex) { ex.valor_declarado += em.valor_declarado; ex.participacao_pct += em.participacao_pct; } else emps.push(Object.assign({}, em)); }));
    emps.forEach(em => {
      const alvo = (d.empresas || []).map((x, i) => ({ i, x })).find(o => (digitos(o.x.cnpj) && digitos(o.x.cnpj) === digitos(em.cnpj)) || (o.x.nome && em.nome && mesmaPessoa(o.x.nome, em.nome)));
      const campos = {}; if (em.nome && (!alvo || !alvo.x.nome)) campos.nome = em.nome; if (alvo && !alvo.x.cnpj && !em.cnpj) delete campos.cnpj; if (em.cnpj && (!alvo || !alvo.x.cnpj)) campos.cnpj = em.cnpj; if (em.participacao_pct && (!alvo || !alvo.x.participacao)) campos.participacao = String(em.participacao_pct).replace(".", ",");
      if (Object.keys(campos).length) P.push({ grupo: "Empresas", rot: (alvo ? "Atualizar Empresa " + (alvo.i + 1) + ": " : "Nova empresa: ") + (em.nome || em.cnpj || em.descricao.slice(0, 60)), det: [em.cnpj ? "CNPJ " + em.cnpj : "", em.participacao_pct ? em.participacao_pct + "%" : "", "valor declarado " + brl(em.valor_declarado)].filter(Boolean).join(" · "), acao: { tipo: "empresa", idx: alvo ? alvo.i : -1, campos } });
      if (em.valor_declarado && (!alvo || !alvo.x.pl)) P.push({ grupo: "Empresas", rot: "Patrimônio líquido provisório de " + (em.nome || em.cnpj || "participação") + ": " + brl(em.valor_declarado), det: "O IRPF registra o custo de aquisição das quotas, que raramente coincide com o patrimônio líquido. Use apenas até obter o balanço.", marcado: false, acao: { tipo: "empresaPl", ref: Object.keys(campos).length ? P.length - 1 : -1, idx: alvo ? alvo.i : -1, valor: Math.round(em.valor_declarado).toLocaleString("pt-BR") } });
    });
    const div = irpfs.reduce((a, x) => a + (x.e.rendimentos.lucros_dividendos_ano || 0), 0);
    if (div) { const um = (d.empresas || []).filter(x => x.nome).length + emps.filter(e => !(d.empresas || []).some(x => mesmaPessoa(x.nome || "", e.nome || ""))).length === 1; conf.push("Lucros e dividendos recebidos no ano: " + brl(div) + "." + (um ? " Informe o valor no campo de lucros distribuídos da empresa." : " Distribua o valor entre as empresas no campo de lucros distribuídos.")); }
    const alug = irpfs.reduce((a, x) => a + (x.e.rendimentos.alugueis_ano || 0), 0);
    if (alug) conf.push("Aluguéis localizados na declaração: " + brl(alug) + " no ano (cerca de " + brl(alug / 12) + " por mês). Marque os imóveis alugados e informe o aluguel mensal de cada um.");

    /* ativos financeiros: soma das declarações anexadas */
    const fin = { aplicacoes: 0, previdencia: 0, exterior: 0, outros: 0, dividas: 0 };
    irpfs.forEach(x => { const f = x.e.financeiro || {}; fin.aplicacoes += f.aplicacoes || 0; fin.previdencia += f.previdencia || 0; fin.exterior += f.exterior || 0; fin.outros += f.outros_bens || 0; fin.dividas += f.dividas || 0; });
    const ROT = { aplicacoes: "Aplicações financeiras", previdencia: "Previdência privada", exterior: "Bens no exterior", outros: "Outros bens", dividas: "Dívidas e ônus reais" };
    Object.keys(fin).forEach(k => { if (!fin[k]) return; const atual = (d.fin || {})[k]; if (atual && Math.round(valor(String(atual).replace(/\./g, "") + ",00")) === Math.round(fin[k])) return; P.push({ grupo: "Ativos financeiros e dívidas", rot: ROT[k] + ": " + brl(fin[k]), det: (irpfs.length > 1 ? "Soma das " + irpfs.length + " declarações anexadas" : "Declaração de IRPF") + (atual ? "; substitui o valor informado (" + brl(valor(String(atual).replace(/\./g, "")) || +String(atual).replace(/\D/g, "")) + ")" : ""), acao: { tipo: "campo", chave: "fin." + k, valor: Math.round(fin[k]).toLocaleString("pt-BR") } }); });
    if (fin.exterior) conf.push("Há bens no exterior na declaração: informe a forma de detenção (diretamente ou por offshore ou trust) no bloco de ativos financeiros.");
    if (irpfs.length > 1) conf.push("Foram anexadas " + irpfs.length + " declarações de IRPF. Se os cônjuges declaram em separado, confira se os bens comuns não foram contados em duplicidade (cada um costuma declarar a sua metade, ou um deles declara o bem inteiro).");

    if (conf.length && !String(d.obs || "").includes(conf[0])) P.push({ grupo: "Observações", rot: "Registrar os pontos de conferência nas observações", det: conf.length + (conf.length === 1 ? " ponto" : " pontos") + " a conferir, listados abaixo", marcado: false, acao: { tipo: "obs", texto: conf.join("\n") } });
    return { propostas: P, conferencias: conf };
  }

  root.PAT_DOCS = { lerArquivo, classificar, extrair, extrairComClaude, propostas, unirImoveis, ESQUEMA, INSTRUCOES, _t: { matricula, irpf, iptu, idade, mesmoImovel, mesmaPessoa } };
})(typeof window !== "undefined" ? window : globalThis);
