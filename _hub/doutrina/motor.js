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
  function pagina(id, i) { const L = LIVROS.get(id); if (!L || !L.paginas[i]) return null; const p = L.paginas[i]; return { id, i, pdf: p[0], imp: p[1], texto: p[2], total: L.paginas.length }; }
  function guardar(id, paginas) { LIVROS.set(id, { paginas, norm: paginas.map(p => norm(p[2] || "")) }); }

  const api = { norm, radical, interpretar, buscar, pagina, guardar, remover: id => LIVROS.delete(id), livros: () => [...LIVROS.keys()] };
  if (escopo && typeof escopo.postMessage === "function" && typeof escopo.document === "undefined") {
    escopo.onmessage = e => {
      const d = e.data || {};
      try {
        if (d.tipo === "livro") { guardar(d.id, d.paginas); escopo.postMessage({ tipo: "livro", id: d.id, req: d.req }); }
        else if (d.tipo === "remover") api.remover(d.id);
        else if (d.tipo === "buscar") escopo.postMessage(Object.assign({ tipo: "resultado", req: d.req }, buscar(d)));
        else if (d.tipo === "pagina") escopo.postMessage({ tipo: "pagina", req: d.req, pagina: pagina(d.id, d.i) });
      } catch (x) { escopo.postMessage({ tipo: "erro", req: d.req, erro: String(x && x.message || x) }); }
    };
  }
  return api;
}
if (typeof module === "object" && module.exports) module.exports = DOUTRINA_MOTOR;
