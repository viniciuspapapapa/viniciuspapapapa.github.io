/* Tratamento do texto extraído dos livros: detecção de páginas ilegíveis (que vão para o OCR), identificação da
   página impressa da obra, limpeza de cabeçalhos, rodapés e hifenização, e leitura dos dados bibliográficos da
   ficha catalográfica. Funções puras, usadas pelo indexador. */

export function ilegivel(t) {
  const s = String(t || "").replace(/\s+/g, "");
  if (s.length < 60) return true;
  if (/\(cid:\d+\)/.test(t)) return true;
  const letras = (s.match(/[A-Za-zÀ-ÿ]/g) || []).length;
  return letras / s.length < 0.55;
}

/* ------------------------------------------------------------------ página impressa */
const linhasUteis = t => String(t || "").split("\n").map(l => l.trim()).filter(Boolean);
/* números isolados nas três primeiras e três últimas linhas, tolerando colchetes, barras e ruído do OCR */
export function candidatos(t) {
  const ls = linhasUteis(t), pontas = ls.slice(0, 3).concat(ls.slice(-3)), out = new Set();
  for (const l of pontas) {
    for (const re of [/^[\[(|]?\s*(\d{1,4})\s*[.\])|]?$/, /^[\[(|]?\s*(\d{1,4})\s*[.\])|]?\s+\S/, /\S\s+[\[(|]?(\d{1,4})[\])|.]?$/]) {
      const m = l.match(re); if (m) { const n = +m[1]; if (n > 0 && n < 5000) out.add(n); }
    }
  }
  return [...out];
}
/* deslocamento mais frequente entre as páginas vizinhas; "passo" 2 cobre digitalizações com duas páginas por folha */
function porDeslocamento(cand, total, passo) {
  const offs = cand.map((ns, i) => ns.map(n => passo * (i + 1) - n));
  return Array.from({ length: total }, (_, i) => {
    const conta = new Map();
    for (let q = Math.max(0, i - 15); q <= Math.min(total - 1, i + 15); q++) for (const o of offs[q]) conta.set(o, (conta.get(o) || 0) + 1);
    let melhor = null, max = 0, segundo = 0;
    for (const [o, c0] of conta) {
      const c = passo === 2 ? c0 + (conta.get(o - 1) || 0) : c0;
      if (c > max) { segundo = max; max = c; melhor = o; } else if (c > segundo && o !== melhor - 1) segundo = c;
    }
    if (melhor === null || max < 4 || max < segundo * 2) return "";
    const n = passo * (i + 1) - melhor;
    if (n < 1) return "";
    return passo === 2 ? n + "–" + (n + 1) : String(n);
  });
}
export function paginasImpressas(textos) {
  const cand = textos.map(candidatos);
  const simples = porDeslocamento(cand, textos.length, 1);
  const cobertura = simples.filter(Boolean).length / Math.max(1, textos.length);
  if (cobertura >= 0.3) return simples;
  const duplas = porDeslocamento(cand, textos.length, 2);
  return duplas.filter(Boolean).length / Math.max(1, textos.length) > cobertura ? duplas : simples;
}

/* ------------------------------------------------------------------ limpeza */
const normalizar = s => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\d+/g, "#").replace(/\s+/g, " ").trim();
export function limpar(textos) {
  const freq = new Map();
  for (const t of textos) { const ls = linhasUteis(t); for (const l of new Set(ls.slice(0, 2).concat(ls.slice(-2)).map(normalizar))) if (l.length > 3) freq.set(l, (freq.get(l) || 0) + 1); }
  const limiar = Math.max(4, textos.length * 0.04), repetidas = new Set([...freq].filter(([, c]) => c >= limiar).map(([l]) => l));
  return textos.map(t => {
    let ls = String(t || "").replace(/­/g, "").split("\n").map(l => l.replace(/\s+$/, ""));
    const ehRuido = l => { const s = l.trim(); return !s || /^[\[(|]?\s*\d{1,4}\s*[.\])|]?$/.test(s) || repetidas.has(normalizar(s)); };
    let a = 0; while (a < ls.length && a < 4 && ehRuido(ls[a])) a++;
    let b = ls.length; while (b > a && ls.length - b < 4 && ehRuido(ls[b - 1])) b--;
    ls = ls.slice(a, b);
    const par = []; let atual = "";
    for (const l of ls) {
      const s = l.trim();
      if (!s) { if (atual) { par.push(atual); atual = ""; } continue; }
      if (!atual) atual = s;
      else if (/[A-Za-zÀ-ÿ]-$/.test(atual) && /^[a-zà-ÿ]/.test(s)) atual = atual.slice(0, -1) + s;
      else atual += " " + s;
    }
    if (atual) par.push(atual);
    return par.join("\n").replace(/[ \t]{2,}/g, " ").trim();
  });
}

/* ------------------------------------------------------------------ dados bibliográficos */
const SOBRE_COMPOSTOS = /^(Jr\.?|Júnior|Junior|Filho|Neto|Sobrinho)$/i;
function nomeAbnt(n) {
  const p = n.replace(/\s+/g, " ").trim().split(" ").filter(Boolean);
  if (!p.length) return "";
  let sob = p.pop();
  if (SOBRE_COMPOSTOS.test(sob) && p.length) sob = p.pop() + " " + sob;
  return sob.toUpperCase() + (p.length ? ", " + p.join(" ") : "");
}
export function metadados(textos, arquivo) {
  const ini = textos.slice(0, 14).join("\n").replace(/­/g, "");
  const m = { autor: "", titulo: "", subtitulo: "", edicao: "", local: "", editora: "", ano: "", volume: "" };
  /* ficha catalográfica: "Título : subtítulo / Autor. – 12. ed. – Local : Editora, 2020." (pode ocupar várias linhas) */
  const corrido = ini.replace(/\s*\n\s*/g, " ");
  const cip = corrido.match(/([A-ZÁÉÍÓÚ][^\/]{3,180}?)\s\/\s([^\/]{3,140}?)\.?\s*[–—-]+\s*(\d{1,2})\s*[.ªa]?\s*ed\.?[^–—]{0,60}?[–—-]+\s*([A-ZÁÉÍÓÚ][^:]{2,40}?)\s*:\s*([^,]{2,60}?),\s*((?:19|20)\d\d)/);
  if (cip) {
    let tt = cip[1].replace(/\[livro eletr[ôo]nico\]/gi, "").trim();
    /* remove o cabeçalho da ficha ("Sobrenome, Nome, 1976-") que antecede o título */
    const primeiro = cip[2].split(/\s*(?:;|,|\se\s)\s*/)[0].replace(/\[.*?\]/g, "").trim().split(/\s+/);
    if (primeiro.length > 1) {
      let sob = primeiro[primeiro.length - 1], resto = primeiro.slice(0, -1);
      if (SOBRE_COMPOSTOS.test(sob) && resto.length > 1) { sob = resto[resto.length - 1] + " " + sob; resto = resto.slice(0, -1); }
      const esc = w => w.replace(/\./g, "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\.?";
      const re = new RegExp(sob.split(/\s+/).map(esc).join("\\s+") + ",?\\s*" + resto.map(esc).join("\\s+") + "(?:,?\\s*\\d{4}\\s*[-–]?)?\\s*", "gi");
      let ult = null, mm; while ((mm = re.exec(tt))) ult = mm;
      if (ult) tt = tt.slice(ult.index + ult[0].length);
    }
    tt = tt.replace(/^.*?\bBrasil\)\s*/, "").trim();
    const partes = tt.split(/\s*:\s+/);
    m.titulo = partes[0].trim(); m.subtitulo = partes.slice(1).join(": ").trim();
    m.edicao = cip[3] + ". ed."; m.local = cip[4].trim(); m.editora = cip[5].trim().replace(/\s+Ltda\.?$/i, ""); m.ano = cip[6];
    m.autor = cip[2].split(/\s*(?:;|,|\se\s)\s*/).map(s => s.replace(/\[.*?\]/g, "").trim()).filter(s => s.length > 2 && !/^(org|coord|ed)\.?$/i.test(s)).map(nomeAbnt).join("; ");
  }
  if (!m.ano) { const c = ini.match(/(?:Copyright|©)\s*(?:desta edição\s*)?\[?((?:19|20)\d\d)\]?/i); if (c) m.ano = c[1]; }
  if (!m.editora) { const c = ini.match(/(?:Copyright|©)[^\n]*?(?:by\s+)?(Editora [A-ZÁÉÍÓÚ][\wÀ-ÿ ]+?|[A-Z][\wÀ-ÿ]+ Editora)(?: Ltda\.?| S\.A\.?|\n|$)/); if (c) m.editora = c[1].trim(); }
  if (!m.edicao) { const e = ini.match(/(?:^|\n)\s*(\d{1,2})\s*[.ªa]\s*ed(?:\.|ição)/i); if (e) m.edicao = e[1] + ". ed."; }
  if (!m.titulo) m.titulo = String(arquivo || "").replace(/\.pdf$/i, "").replace(/[_]+/g, " ").replace(/\s*\(\d\)\s*$/, "").replace(/^\d+-/, "").replace(/-/g, " ").replace(/\s+/g, " ").trim();
  if (!m.ano) { const a = String(arquivo || "").match(/(?:19|20)\d\d/); if (a) m.ano = a[0]; }
  const v = (m.titulo + " " + m.subtitulo + " " + arquivo).match(/vol(?:ume)?\.?\s*(\d+|[IVX]+)\b/i); if (v) m.volume = v[1];
  return m;
}
