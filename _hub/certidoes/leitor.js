/* Leitura das certidões baixadas: identifica o órgão emissor, o resultado (negativa ou positiva), as datas de emissão e
   de validade, os números de processo no padrão CNJ e se o documento se refere à pessoa pesquisada. */
(function (root) {
  "use strict";
  const C = root.CERT_CAT;
  const sem = s => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ");
  const dig = s => String(s || "").replace(/\D/g, "");

  /* ------------------------------------------------------------------ órgão emissor */
  const ESTADOS = Object.entries(C.UF_NOME).map(([uf, n]) => [uf, sem(n)]).sort((a, b) => b[1].length - a[1].length);
  function estadoNo(t) { for (const [uf, n] of ESTADOS) if (new RegExp("\\b(d[oae]s?|estado d[oae])\\s+" + n.replace(/ /g, "\\s+") + "\\b").test(t)) return uf; return null; }
  function orgao(texto) {
    const t = sem(texto).slice(0, 6000);
    if (/mandado de prisao|bnmp/.test(t) && /banco nacional/.test(t)) return "bnmp";
    if (/policia federal/.test(t) && /antecedentes criminais/.test(t)) return "pf";
    if (/supremo tribunal federal/.test(t)) return "stf";
    if (/superior tribunal de justica/.test(t)) return "stj";
    if (/superior tribunal militar|justica militar da uniao/.test(t)) return "stm";
    if (/tribunal superior eleitoral|crimes eleitorais|justica eleitoral/.test(t)) return "tse";
    let m = /tribunal de justica militar d[oe] (estado d[eo] )?(minas gerais|sao paulo|rio grande do sul)/.exec(t);
    if (m) return { "minas gerais": "tjmmg", "sao paulo": "tjmsp", "rio grande do sul": "tjmrs" }[m[2]];
    m = /tribunal regional federal d[a]? ?(\d)\s*(a|ª|º|o)?\s*regiao/.exec(t) || /\btrf\s*-?\s*(\d)\b/.exec(t);
    if (m && +m[1] >= 1 && +m[1] <= 6) return "trf" + m[1];
    if (/justica federal|secao judiciaria/.test(t)) { const uf = estadoNo(t); if (uf) return "trf" + C.TRF_DA_UF[uf]; }
    if (/distrito federal e (dos )?territorios|\btjdft\b/.test(t)) return "tjdft";
    m = /\btj([a-z]{2})\b/.exec(t);
    if (m && C.UF_NOME[m[1].toUpperCase()] && m[1] !== "df") return "tj" + m[1];
    if (/tribunal de justica|poder judiciario|justica estadual|comarca/.test(t)) { const uf = estadoNo(t); if (uf) return uf === "DF" ? "tjdft" : "tj" + uf.toLowerCase(); }
    return null;
  }

  /* ------------------------------------------------------------------ resultado */
  const CNJ = /\b\d{7}-?\d{2}\.?\d{4}\.?\d\.?\d{2}\.?\d{4}\b/g;
  function cnjs(texto) { return [...new Set((String(texto).match(CNJ) || []).map(dig).filter(d => d.length === 20))]; }
  function resultado(texto) {
    const t = sem(texto);
    const nums = cnjs(texto);
    const neg = /nada consta|nao consta(m)?\b|nao (foram|foi) (encontrad|localizad)|nao (ha|existe|existem) (registro|processo|feito|acao|distribui|anotac|mandado)|inexiste(m)? (registro|processo|feito|acao|distribui|anotac)|certidao (judicial )?(criminal )?negativa(?!\s*\/?\s*positiva)|resultado:? negativ/.test(t);
    const pos = /certidao (judicial )?(criminal )?positiva|consta(m)? (o|os|a|as) seguintes?|(consta|constam|existe|existem|foram (localizad|encontrad)[oa]s?)[^.]{0,90}(processo|feito|acao|registro|distribui|inquerito|anotac)|resultado:? positiv/.test(t.replace(/nao (consta|constam|existe|existem|foram)[^.]{0,90}/g, ""));
    if (pos && (nums.length || !neg)) return { resultado: "positiva", cnjs: nums };
    if (neg && !nums.length) return { resultado: "negativa", cnjs: [] };
    if (nums.length) return { resultado: "positiva", cnjs: nums };
    if (neg) return { resultado: "negativa", cnjs: [] };
    return { resultado: "indeterminada", cnjs: nums };
  }

  /* ------------------------------------------------------------------ datas */
  const D = (d, m, a) => { const x = new Date(Date.UTC(+a, +m - 1, +d)); return isNaN(x) || +m > 12 || +d > 31 ? null : x; };
  const MESES = ["janeiro", "fevereiro", "marco", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
  function datas(texto) {
    const t = sem(texto), hoje = new Date();
    const todas = [];
    let m; const r1 = /\b(\d{1,2})\/(\d{1,2})\/(\d{4})\b/g;
    while ((m = r1.exec(t))) { const d = D(m[1], m[2], m[3]); if (d) todas.push({ d, i: m.index }); }
    const r2 = new RegExp("\\b(\\d{1,2})(?:º|o)? de (" + MESES.join("|") + ") de (\\d{4})\\b", "g");
    while ((m = r2.exec(t))) { const d = D(m[1], MESES.indexOf(m[2]) + 1, m[3]); if (d) todas.push({ d, i: m.index }); }
    let emissao = null, validade = null;
    /* emissão: data próxima de "emitida", "expedida", "gerada" ou a mais recente até hoje */
    const perto = todas.filter(x => /emiti|expedi|gerad|data (da|de) (emissao|expedicao)|certifico|em \w+ de/.test(t.slice(Math.max(0, x.i - 60), x.i)) && x.d <= hoje);
    const passadas = todas.filter(x => x.d <= hoje && x.d.getUTCFullYear() > 2000).sort((a, b) => b.d - a.d);
    emissao = (perto[perto.length - 1] || passadas[0] || {}).d || null;
    m = /valid[ao]s?[^.]{0,40}?(?:por|de|pelo prazo de)\s*(\d{1,3})\s*(dias|meses)/.exec(t);
    if (m && emissao) { validade = new Date(emissao); if (m[2] === "dias") validade.setUTCDate(validade.getUTCDate() + +m[1]); else validade.setUTCMonth(validade.getUTCMonth() + +m[1]); }
    m = /valid[ao]s? ate:?\s*(\d{1,2})\/(\d{1,2})\/(\d{4})/.exec(t);
    if (m) validade = D(m[1], m[2], m[3]);
    return { emissao, validade };
  }

  /* ------------------------------------------------------------------ análise */
  function analisar(texto, pesquisado) {
    const r = resultado(texto), dt = datas(texto), t = sem(texto);
    const cpf = dig(pesquisado && pesquisado.cpf), nome = sem(pesquisado && pesquisado.nome).trim();
    const temCpf = cpf.length === 11 && (dig(texto).includes(cpf));
    const temNome = nome.length > 5 && t.includes(nome);
    return { orgao: orgao(texto), resultado: r.resultado, cnjs: r.cnjs, emissao: dt.emissao, validade: dt.validade, confere: temCpf || temNome, temCpf, temNome };
  }
  root.CERT_LEITOR = { analisar, orgao, resultado, datas, cnjs };
})(typeof window !== "undefined" ? window : globalThis);
