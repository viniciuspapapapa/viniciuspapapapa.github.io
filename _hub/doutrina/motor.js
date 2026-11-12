/* Motor de busca da Pesquisa doutrinária. Roda num Web Worker (criado a partir do código desta função) para não
   travar a página: guarda o texto dos livros, normaliza (sem acentos e sem maiúsculas, preservando as posições),
   localiza os termos com tolerância a singular e plural, pontua por relevância e proximidade e devolve os trechos
   com as marcações. Também pode ser carregado no Node para testes (module.exports). */
function DOUTRINA_MOTOR(escopo) {
  "use strict";
  const LIVROS = new Map(); /* id -> { paginas: [[pdf, impressa, texto]], norm: [texto normalizado] } */

  /* normalização com o mesmo comprimento do original, para que as posições sirvam ao texto exibido */
  const MAPA = {};
  const pares = { a: "áàâãäåÁÀÂÃÄÅ", e: "éèêëÉÈÊË", i: "íìîïÍÌÎÏ", o: "óòôõöÓÒÔÕÖ", u: "úùûüÚÙÛÜ", c: "çÇ", n: "ñÑ", "'": "’‘´`", '"': "“”«»", "-": "–—‐" };
  for (const k in pares) for (const ch of pares[k]) MAPA[ch] = k;
  const RE_NORM = /[A-ZÀ-ÿ’‘´`“”«»–—‐]/g;
  const norm = s => s.replace(RE_NORM, c => MAPA[c] || c.toLowerCase());

  const PARADAS = new Set("a o e é as os ao aos à às da das de do dos em na nas no nos num numa por pela pelas pelo pelos para com sem sob sobre que se um uma uns umas ou nem como mais menos muito já não sua seu suas seus lhe lhes isso isto esse essa este esta entre até também quando onde qual quais".split(" "));

  /* radical leve: retira o plural e, nas palavras longas, a vogal final; números exigem correspondência exata */
  function radical(w) {
    if (/^\d+$/.test(w)) return w;
    let r = w;
    if (r.length > 4) {
      if (/oes$|aes$/.test(r)) r = r.slice(0, -3);
      else if (/ais$/.test(r)) r = r.slice(0, -2);
      else if (/eis$|ois$/.test(r)) r = r.slice(0, -3);
      else if (/ns$/.test(r)) r = r.slice(0, -2);
      else if (/[^aeiou]es$/.test(r) && r.length > 5) r = r.slice(0, -2);
      else if (/s$/.test(r)) r = r.slice(0, -1);
    }
    if (r.length > 5 && /[aeo]$/.test(r)) r = r.slice(0, -1);
    return r;
  }
  const escRe = s => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

  /* consulta: palavras, "expressões exatas" e -exclusões */
  function interpretar(q) {
    const termos = [], nq = norm(String(q || ""));
    const re = /(-?)"([^"]+)"|(-?)([a-z0-9][a-z0-9.ºª§-]*)/g; let m;
    while ((m = re.exec(nq))) {
      if (m[2] !== undefined) {
        const ws = m[2].split(/[^a-z0-9]+/).filter(Boolean); if (!ws.length) continue;
        termos.push({ rot: m[2].trim(), neg: !!m[1], chave: ws.reduce((a, b) => b.length > a.length ? b : a), re: new RegExp("(?:^|[^a-z0-9])(" + ws.map(escRe).join("[^a-z0-9]{1,4}") + ")(?![a-z0-9])", "g") });
      } else {
        const w = m[4].replace(/[.ºª§-]+$/g, ""); if (!w) continue;
        if (!m[3] && (PARADAS.has(w) || (w.length < 2 && !/\d/.test(w)))) continue;
        const r = radical(w), num = /^\d+$/.test(r);
        termos.push({ rot: w, neg: !!m[3], chave: r, re: new RegExp("(?:^|[^a-z0-9])(" + escRe(r) + (num ? "" : "[a-z0-9]*") + ")" + (num ? "(?![0-9])" : ""), "g") });
      }
    }
    return termos;
  }
  function posicoes(t, texto, max) {
    const out = []; t.re.lastIndex = 0; let m;
    while ((m = t.re.exec(texto)) && out.length < max) { const ini = m.index + m[0].length - m[1].length; out.push([ini, ini + m[1].length]); if (m[0].length === 0) t.re.lastIndex++; }
    return out;
  }
  /* menor janela que contém uma ocorrência de cada termo presente */
  function janela(listas) {
    const ev = []; listas.forEach((l, k) => l.forEach(p => ev.push([p[0], p[1], k])));
    ev.sort((a, b) => a[0] - b[0]);
    const k = listas.filter(l => l.length).length, conta = new Map(); let ini = 0, melhor = null, cobertos = 0;
    for (let f = 0; f < ev.length; f++) {
      const c = ev[f][2]; conta.set(c, (conta.get(c) || 0) + 1); if (conta.get(c) === 1) cobertos++;
      while (cobertos === k) {
        const larg = ev[f][1] - ev[ini][0];
        if (!melhor || larg < melhor[1] - melhor[0]) melhor = [ev[ini][0], ev[f][1]];
        const ci = ev[ini][2]; conta.set(ci, conta.get(ci) - 1); if (!conta.get(ci)) cobertos--; ini++;
      }
    }
    return melhor || (ev.length ? [ev[0][0], ev[0][1]] : [0, 0]);
  }
  function recortar(texto, a, b, alvo) {
    const meio = (a + b) >> 1, metade = Math.max(alvo >> 1, ((b - a) >> 1) + 120);
    let ini = Math.max(0, meio - metade), fim = Math.min(texto.length, meio + metade);
    if (ini > 0) { const s = texto.lastIndexOf(". ", ini + 40), n = texto.lastIndexOf("\n", ini + 40), c = Math.max(s, n); if (c > ini - 260 && c < a) ini = c + (c === s ? 2 : 1); }
    if (fim < texto.length) { const s = texto.indexOf(". ", fim - 40), n = texto.indexOf("\n", fim - 40); const c = [s, n].filter(x => x >= 0 && x >= b).sort((x, y) => x - y)[0]; if (c !== undefined && c < fim + 260) fim = c + 1; }
    return [ini, fim];
  }

  function buscar(o) {
    const termos = interpretar(o.consulta), pos = termos.filter(t => !t.neg), neg = termos.filter(t => t.neg);
    if (!pos.length) return { itens: [], porLivro: {}, total: 0, termos: [], parcial: false };
    const ids = (o.ids && o.ids.length ? o.ids : [...LIVROS.keys()]).filter(id => LIVROS.has(id));
    const totalPag = ids.reduce((s, id) => s + LIVROS.get(id).norm.length, 0) || 1;
    /* frequência de cada termo (pré-filtro rápido por substring) */
    const df = pos.map(t => { let c = 0; for (const id of ids) for (const n of LIVROS.get(id).norm) if (n.indexOf(t.chave) >= 0) c++; return c; });
    const idf = df.map(d => Math.log(1 + totalPag / (1 + d)));
    const exigidos = o.minimo || pos.length;
    function avaliar(minimo) {
      const achados = [];
      for (const id of ids) {
        const L = LIVROS.get(id);
        for (let i = 0; i < L.norm.length; i++) {
          const n = L.norm[i]; let presentes = 0;
          for (const t of pos) if (n.indexOf(t.chave) >= 0) presentes++;
          if (presentes < minimo) continue;
          if (neg.some(t => n.indexOf(t.chave) >= 0 && posicoes(t, n, 1).length)) continue;
          const listas = pos.map(t => n.indexOf(t.chave) >= 0 ? posicoes(t, n, 60) : []);
          const ok = listas.filter(l => l.length).length; if (ok < minimo) continue;
          let score = 0; listas.forEach((l, k) => { if (l.length) score += idf[k] * (1 + Math.log(l.length)); });
          const [ja, jb] = janela(listas), larg = jb - ja;
          if (ok > 1) score *= larg < 250 ? 2.2 : larg < 700 ? 1.6 : larg < 1600 ? 1.15 : 1;
          if (pos.length > 1) score *= ok / pos.length;
          achados.push({ id, i, score, ja, jb, listas });
        }
      }
      return achados;
    }
    let achados = avaliar(Math.min(exigidos, pos.length)), parcial = false;
    if (achados.length < 5 && pos.length > 1 && !o.minimo) { const mais = avaliar(Math.max(1, Math.ceil(pos.length / 2))); if (mais.length > achados.length) { achados = mais; parcial = true; } }
    achados.sort((a, b) => b.score - a.score);
    const porLivro = {}; for (const a of achados) porLivro[a.id] = (porLivro[a.id] || 0) + 1;
    const usados = {}, itens = [], max = o.max || 60, cap = o.porObra || 6;
    for (const a of achados) {
      if (itens.length >= max) break;
      if ((usados[a.id] || 0) >= cap) continue; usados[a.id] = (usados[a.id] || 0) + 1;
      const L = LIVROS.get(a.id), pg = L.paginas[a.i], texto = pg[2];
      const [ini, fim] = recortar(texto, a.ja, a.jb, o.tamanho || 1100);
      const marcas = []; a.listas.forEach(l => l.forEach(p => { if (p[0] >= ini && p[1] <= fim) marcas.push([p[0] - ini, p[1] - ini]); }));
      marcas.sort((x, y) => x[0] - y[0]);
      itens.push({ id: a.id, i: a.i, pdf: pg[0], imp: pg[1], score: +a.score.toFixed(3), trecho: texto.slice(ini, fim), marcas, inicio: ini > 0, final: fim < texto.length });
    }
    return { itens, porLivro, total: achados.length, termos: termos.map(t => (t.neg ? "-" : "") + t.rot), parcial };
  }
  /* ---------------------------------------------------------------- pesquisa booleana no padrão do STJ
     Operadores: e, ou, não, adj[n] (na ordem, até n palavras), prox[n] (em qualquer ordem), com (mesmo parágrafo),
     mesmo (mesmo registro), $ ou * (truncamento), "expressão exata" e parênteses. Sem operador entre dois termos vale
     o e. Palavras vazias (de, da, do...) não contam na distância, como no STJ. Singular, plural e gênero são
     tolerados (concedido, concedida, concedidos); o truncamento amplia (custod$). */
  const OPS = { e: 1, ou: 1, nao: 1, com: 1, mesmo: 1 };
  const ehOp = w => OPS[w] || /^(adj|prox)\d{0,2}$/.test(w);
  function lexar(q) {
    const orig = String(q || ""), nq = norm(orig), out = [], re = /\(|\)|"([^"]*)"?|(-?)([a-z0-9$*?][a-z0-9$*?.ºª§/-]*)/g; let m;
    while ((m = re.exec(nq))) {
      if (m[0] === "(" || m[0] === ")") out.push({ k: m[0] });
      else if (m[1] !== undefined) { const ws = m[1].split(/[^a-z0-9$*]+/).filter(Boolean); if (ws.length) out.push({ k: "termo", frase: ws, rot: orig.substr(m.index + 1, m[1].length).trim() }); }
      else {
        const w = m[3].replace(/[.ºª§/-]+$/g, ""); if (!w) continue;
        if (!m[2] && ehOp(w)) { out.push({ k: "op", op: w }); continue; }
        const partes = w.split(/[^a-z0-9$*]+/).filter(Boolean); if (!partes.length) continue;
        if (m[2]) out.push({ k: "op", op: "nao" });
        out.push({ k: "termo", frase: partes.length > 1 ? partes : null, w: partes.length > 1 ? null : partes[0], rot: orig.substr(m.index + m[2].length, w.length) });
      }
    }
    return out;
  }
  function folha(t) {
    const ws = t.frase || [t.w];
    const pal = ws.map(w => {
      const trunc = /[$*]$/.test(w), base = w.replace(/[$*]+$/g, "");
      return { base, trunc, stop: !trunc && PARADAS.has(base), rad: trunc ? base : raiz(base), num: /^\d+$/.test(base) };
    }).filter(p => p.base);
    if (!pal.length) return null;
    if (!t.frase && (pal[0].stop || (pal[0].base.length < 2 && !pal[0].num))) return null;
    /* chave do pré-filtro: o trecho comum a todas as formas aceitas da palavra mais longa */
    const conteudo = pal.filter(p => !p.stop), maior = (conteudo.length ? conteudo : pal).reduce((a, b) => b.base.length > a.base.length ? b : a);
    let chave = maior.num || maior.trunc || maior.stop ? maior.base : maior.rad;
    if (!maior.num && !maior.trunc && !maior.stop) { const comum = (x, y) => { let k = 0; while (k < x.length && x[k] === y[k]) k++; return x.slice(0, k); }; chave = comum(comum(chave, maior.base), maior.base.replace(/ao$/, "o")); }
    return { tipo: "folha", pal, frase: !!t.frase || pal.length > 1, rot: t.rot, chave: chave.length >= 2 ? chave : maior.base };
  }
  /* precedência: adj/prox > com > mesmo > não > e > ou; termos vizinhos sem operador = e */
  function analisar(q) {
    const tk = lexar(q); let i = 0;
    const nivelDe = op => op === "ou" ? 0 : op === "e" || op === "nao" ? 1 : op === "mesmo" ? 2 : op === "com" ? 3 : 4;
    function primario() {
      const t = tk[i]; if (!t) return null;
      if (t.k === "(") { i++; const n = expr(0); if (tk[i] && tk[i].k === ")") i++; return n; }
      if (t.k === "termo") { i++; return folha(t); }
      if (t.k === "op" && t.op === "nao") { i++; const n = expr(2); return n ? { tipo: "nao", a: null, b: n } : null; }
      i++; return null; /* operador solto ou parêntese de fechamento sobrando */
    }
    function expr(nivel) {
      if (nivel > 4) return primario();
      let a = expr(nivel + 1);
      for (;;) {
        const t = tk[i]; if (!t || t.k === ")") break;
        let op;
        if (t.k === "op") { if (nivelDe(t.op.replace(/\d+$/, "")) !== nivel) { if (nivelDe(t.op.replace(/\d+$/, "")) < nivel) break; i++; continue; } op = t.op; i++; }
        else if (nivel === 1) op = "e"; else break;
        const b = expr(nivel + 1);
        if (!b) continue; if (!a) { a = op === "nao" ? { tipo: "nao", a: null, b } : b; continue; }
        const m = /^(adj|prox)(\d*)$/.exec(op);
        a = m ? { tipo: m[1], n: m[2] ? Math.min(+m[2], 99) : 1, a, b } : { tipo: op, a, b };
      }
      return a;
    }
    let raiz = expr(0);
    while (i < tk.length) { i++; const resto = expr(0); if (resto) raiz = raiz ? { tipo: "e", a: raiz, b: resto } : resto; }
    return raiz;
  }
  const folhas = (n, neg, out) => { if (!n) return out; if (n.tipo === "folha") { (neg ? out.neg : out.pos).push(n); return out; } if (n.tipo === "nao") { folhas(n.a, neg, out); folhas(n.b, !neg, out); return out; } folhas(n.a, neg, out); folhas(n.b, neg, out); return out; };
  const ROT_OP = { e: "E", ou: "OU", nao: "NÃO", com: "COM", mesmo: "MESMO" };
  function descrever(n, pai) {
    if (!n) return "";
    if (n.tipo === "folha") return n.frase ? "“" + n.rot + "”" : n.rot;
    if (n.tipo === "nao" && !n.a) return "NÃO " + descrever(n.b, "nao");
    const op = n.tipo === "adj" || n.tipo === "prox" ? n.tipo.toUpperCase() + (n.n > 1 ? n.n : "") : ROT_OP[n.tipo];
    const s = descrever(n.a, n.tipo) + " " + op + " " + descrever(n.b, n.tipo);
    return pai && pai !== n.tipo ? "(" + s + ")" : s;
  }
  /* pré-filtro barato por substring: o registro pode atender à expressão? */
  function talvez(n, t) {
    if (!n) return true;
    if (n.tipo === "folha") return t.indexOf(n.chave) >= 0;
    if (n.tipo === "ou") return talvez(n.a, t) || talvez(n.b, t);
    if (n.tipo === "nao") return n.a ? talvez(n.a, t) : true;
    return talvez(n.a, t) && talvez(n.b, t);
  }
  /* palavras do texto normalizado, com o índice que ignora as palavras vazias e o parágrafo */
  function tokens(t) {
    const out = [], re = /[a-z0-9]+/g; let m, w = -1, par = 0, ult = 0;
    while ((m = re.exec(t))) {
      for (let k = t.indexOf("\n", ult); k >= 0 && k < m.index; k = t.indexOf("\n", k + 1)) par++;
      ult = m.index + m[0].length;
      const stop = PARADAS.has(m[0]); if (!stop) w++;
      out.push({ s: m[0], a: m.index, b: ult, w: Math.max(w, 0), par, stop });
    }
    return out;
  }
  /* raiz para comparar palavra a palavra: une singular e plural (decisão, decisões; penal, penais; lei, leis) e gênero */
  function raiz(w) {
    if (/^\d+$/.test(w)) return w;
    if (w.length > 4) w = w.replace(/oes$|aes$/, "ao").replace(/ais$/, "al").replace(/eis$/, "el").replace(/ois$/, "ol");
    else if (w.length === 4 && /[aeiou]s$/.test(w)) w = w.slice(0, -1);
    return radical(w);
  }
  const casa = (p, s) => p.num ? s === p.base : p.trunc ? s.startsWith(p.base) : p.stop ? s === p.base : (s === p.base || raiz(s) === p.rad);
  function ocorrencias(f, tk) {
    const out = [], P = f.pal;
    for (let i = 0; i < tk.length; i++) {
      if (!casa(P[0], tk[i].s)) continue;
      let j = i, ok = true;
      for (let k = 1; k < P.length; k++) { j++; if (!f.frase) break; if (j >= tk.length || !casa(P[k], tk[j].s)) { ok = false; break; } }
      if (!ok) continue;
      out.push({ w0: tk[i].w, w1: tk[j].w, par: tk[i].par, m: [[tk[i].a, tk[j].b]] });
      if (out.length > 400) break;
    }
    return out;
  }
  function avaliarNo(n, tk, cache) {
    if (!n) return [];
    if (n.tipo === "folha") { if (!cache.has(n)) cache.set(n, ocorrencias(n, tk)); return cache.get(n); }
    if (n.tipo === "nao") { const b = avaliarNo(n.b, tk, cache); if (!n.a) return b.length ? [] : [{ w0: -1, w1: -1, par: -1, m: [] }]; return b.length ? [] : avaliarNo(n.a, tk, cache); }
    const A = avaliarNo(n.a, tk, cache); if (!A.length && n.tipo !== "ou") return [];
    const B = avaliarNo(n.b, tk, cache);
    if (n.tipo === "ou") return A.concat(B);
    if (!B.length) return [];
    if (n.tipo === "e" || n.tipo === "mesmo") return A.concat(B);
    const out = [];
    for (const x of A) for (const y of B) {
      let ok;
      if (n.tipo === "com") ok = x.par === y.par || x.par < 0 || y.par < 0;
      else if (n.tipo === "adj") ok = y.w0 > x.w1 && y.w0 - x.w1 <= n.n;
      else ok = (y.w0 > x.w1 && y.w0 - x.w1 <= n.n) || (x.w0 > y.w1 && x.w0 - y.w1 <= n.n);
      if (ok) { out.push({ w0: Math.min(x.w0, y.w0), w1: Math.max(x.w1, y.w1), par: x.par, m: x.m.concat(y.m) }); if (out.length > 400) return out; }
    }
    return out;
  }
  /* avalia um texto avulso (usado também na conferência da busca ao vivo) */
  function conferir(arvore, texto) {
    const n = norm(String(texto || "")); if (!arvore) return { ok: false, marcas: [], achados: [] };
    if (!talvez(arvore, n)) return { ok: false, marcas: [], achados: [] };
    const tk = tokens(n), cache = new Map(), r = avaliarNo(arvore, tk, cache);
    const fl = folhas(arvore, false, { pos: [], neg: [] }), achados = [], marcas = [];
    for (const f of fl.pos) { const oc = cache.has(f) ? cache.get(f) : ocorrencias(f, tk); if (oc.length) { achados.push(f.rot); oc.forEach(o => o.m.forEach(x => marcas.push(x))); } }
    marcas.sort((a, b) => a[0] - b[0]);
    return { ok: r.length > 0, marcas, achados, termos: fl.pos.map(f => f.rot), listas: fl.pos.map(f => (cache.get(f) || []).map(o => o.m[0])) };
  }
  function datar(s) { s = String(s || ""); let m = /(\d{2})\/(\d{2})\/(\d{4})/.exec(s); if (m) return m[3] + m[2] + m[1]; m = /(\d{4})-(\d{2})-(\d{2})/.exec(s); return m ? m[1] + m[2] + m[3] : ""; }
  /* busca booleana em toda a base: devolve a lista ordenada de [id, i, pontuação, data] e a contagem por coleção */
  function buscarBool(o) {
    const arvore = analisar(o.consulta); if (!arvore) return { erro: "Informe ao menos um termo.", lista: [], porLivro: {}, total: 0 };
    const fl = folhas(arvore, false, { pos: [], neg: [] }); if (!fl.pos.length) return { erro: "A expressão só exclui termos; informe o que deve constar.", lista: [], porLivro: {}, total: 0 };
    const ids = (o.ids && o.ids.length ? o.ids : [...LIVROS.keys()]).filter(id => LIVROS.has(id));
    const lista = [], porLivro = {}, df = fl.pos.map(() => 0); let docs = 0;
    for (const id of ids) {
      const L = LIVROS.get(id); docs += L.norm.length;
      for (let i = 0; i < L.norm.length; i++) {
        const n = L.norm[i]; fl.pos.forEach((f, k) => { if (n.indexOf(f.chave) >= 0) df[k]++; });
        if (!talvez(arvore, n)) continue;
        const c = conferir(arvore, L.paginas[i][2]); if (!c.ok) continue;
        lista.push({ id, i, c });
      }
    }
    const idf = df.map(d => Math.log(1 + (docs || 1) / (1 + d)));
    const saida = lista.map(({ id, i, c }) => {
      let score = 0; c.listas.forEach((l, k) => { if (l.length) score += idf[k] * (1 + Math.log(l.length)); });
      const presentes = c.listas.filter(l => l.length).length;
      if (presentes > 1) { const [ja, jb] = janela(c.listas.filter(l => l.length)), larg = jb - ja; score *= larg < 250 ? 2.2 : larg < 700 ? 1.6 : larg < 1600 ? 1.15 : 1; }
      porLivro[id] = (porLivro[id] || 0) + 1;
      return [id, i, +score.toFixed(3), datar(L_meta(id, i))];
    });
    if (o.ordem === "data") saida.sort((a, b) => (b[3] || "").localeCompare(a[3] || "") || b[2] - a[2]); else saida.sort((a, b) => b[2] - a[2]);
    return { lista: saida, porLivro, total: saida.length, expressao: descrever(arvore), termos: fl.pos.map(f => f.rot), excluidos: fl.neg.map(f => f.rot) };
  }
  const L_meta = (id, i) => { const p = LIVROS.get(id).paginas[i]; return p[3] || ""; };
  /* texto de um registro com as marcas da expressão */
  function marcarBool(o) {
    const arvore = analisar(o.consulta);
    return (o.itens || []).map(([id, i]) => { const L = LIVROS.get(id); if (!L || !L.paginas[i]) return null; const t = L.paginas[i][2], c = conferir(arvore, t); return { id, i, texto: t, marcas: c.marcas, achados: c.achados }; });
  }

  function pagina(id, i) { const L = LIVROS.get(id); if (!L || !L.paginas[i]) return null; const p = L.paginas[i]; return { id, i, pdf: p[0], imp: p[1], texto: p[2], total: L.paginas.length }; }
  function guardar(id, paginas) { LIVROS.set(id, { paginas, norm: paginas.map(p => norm(p[2] || "")) }); }

  const api = { norm, radical, interpretar, buscar, pagina, guardar, analisar, descrever, conferir, buscarBool, marcarBool, remover: id => LIVROS.delete(id), livros: () => [...LIVROS.keys()] };
  if (escopo && typeof escopo.postMessage === "function" && typeof escopo.document === "undefined") {
    escopo.onmessage = e => {
      const d = e.data || {};
      try {
        if (d.tipo === "livro") { guardar(d.id, d.paginas); escopo.postMessage({ tipo: "livro", id: d.id, req: d.req }); }
        else if (d.tipo === "remover") api.remover(d.id);
        else if (d.tipo === "buscar") escopo.postMessage(Object.assign({ tipo: "resultado", req: d.req }, buscar(d)));
        else if (d.tipo === "buscarBool") escopo.postMessage(Object.assign({ tipo: "resultado", req: d.req }, buscarBool(d)));
        else if (d.tipo === "marcarBool") escopo.postMessage({ tipo: "marcas", req: d.req, itens: marcarBool(d) });
        else if (d.tipo === "pagina") escopo.postMessage({ tipo: "pagina", req: d.req, pagina: pagina(d.id, d.i) });
      } catch (x) { escopo.postMessage({ tipo: "erro", req: d.req, erro: String(x && x.message || x) }); }
    };
  }
  return api;
}
if (typeof module === "object" && module.exports) module.exports = DOUTRINA_MOTOR;
