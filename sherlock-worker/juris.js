/* Busca de jurisprudência ao vivo para a ferramenta "Pesquisa de jurisprudência" do HUB (/juris/...).

   Método portado do projeto aberto Garimpo-Jurídico (github.com/leorochasf/garimpo-mcp, licença MIT, cópia em
   LICENSE-garimpo.txt): consulta a busca direta do JurisprudênciaIA, tribunal a tribunal, e devolve dados crus e
   verificáveis (ementa como veio, número, órgão, relator, datas e link oficial do tribunal). Como no Garimpo: no
   máximo 2 consultas simultâneas por pedido, uma única nova tentativa em 429/503 e nenhum link fora de .jus.br.
   O JurisprudênciaIA não é fonte oficial e sua busca direta não tem documentação pública; pode mudar sem aviso. */

const SITE = "https://www.jurisprudenciaia.com.br";
const EXTRAS = {
  stf: { include_rg: true, rg_only: false, rg_limit: 5, rg_score_threshold: 0.45, sumulas_limit: 5, sumulas_vinc_limit: 5, qualified_strict: true },
  stj: { sumulas_limit: 5, repetitivos_limit: 5, iacs_limit: 5, puil_limit: 5, qualified_strict: true }
};
export const TRIBUNAIS_JURIS = {
  stf: "Supremo Tribunal Federal", stj: "Superior Tribunal de Justiça", tst: "Tribunal Superior do Trabalho", tse: "Tribunal Superior Eleitoral", stm: "Superior Tribunal Militar",
  tjac: "TJAC", tjal: "TJAL", tjam: "TJAM", tjap: "TJAP", tjba: "TJBA", tjce: "TJCE", tjdft: "TJDFT", tjes: "TJES", tjgo: "TJGO", tjma: "TJMA", tjmg: "TJMG", tjms: "TJMS", tjmt: "TJMT", tjpa: "TJPA",
  tjpb: "TJPB", tjpe: "TJPE", tjpi: "TJPI", tjpr: "TJPR", tjrj: "TJRJ", tjrn: "TJRN", tjro: "TJRO", tjrr: "TJRR", tjrs: "TJRS", tjsc: "TJSC", tjse: "TJSE", tjsp: "TJSP", tjto: "TJTO"
};
const t = v => (v == null || v === "None" || v === "null" ? "" : String(v).trim());
const dt = v => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(t(v)); return m ? m[3] + "/" + m[2] + "/" + m[1] : t(v); };
const doTribunal = u => { const s = t(u); try { const h = new URL(s).hostname; return /^https:$/.test(new URL(s).protocol) && /(^|\.)jus\.br$/.test(h) ? s : ""; } catch (e) { return ""; } };

async function consultar(tribunal, corpo) {
  for (let i = 0; i < 2; i++) {
    const ctl = new AbortController(), tm = setTimeout(() => ctl.abort(), 25000);
    try {
      const r = await fetch(SITE + "/api/tribunais/" + tribunal + "/search", { method: "POST", headers: { "Content-Type": "application/json", Origin: SITE, Referer: SITE + "/", "User-Agent": "Mozilla/5.0 (HUB TPC; pesquisa de jurisprudência)" }, body: JSON.stringify(corpo), signal: ctl.signal });
      if ((r.status === 429 || r.status === 503) && i === 0) { await new Promise(ok => setTimeout(ok, 2500)); continue; }
      if (!r.ok) throw new Error("A fonte respondeu HTTP " + r.status);
      return await r.json();
    } catch (e) { if (i === 1 || e.name !== "AbortError") throw new Error(e.name === "AbortError" ? "Tempo esgotado na fonte" : e.message); }
    finally { clearTimeout(tm); }
  }
}
function acordao(trib, x) {
  const sigla = t(x.sigla_classe), num = t(x.numero_processo) || t(x.numero_processo_cnj);
  return { tipo: "acórdão", tribunal: trib, id: trib + ":" + t(x.id), numero: num ? (sigla && !num.startsWith(sigla) ? sigla + " " + num : num) : "", cnj: t(x.numero_processo_cnj), classe: t(x.classe_processual), relator: t(x.relator), orgao: t(x.orgao_julgador), julgamento: dt(x.data_julgamento), publicacao: dt(x.data_publicacao_extraida), ementa: t(x.texto_ementa).replace(/\s+/g, " "), link: doTribunal(x.link_pdf), consulta: doTribunal(x.link_consulta || x.url_acordao || x.link_processo), relevancia: +x.rerank_score || +x.fusedScore || 0 };
}
function qualificado(trib, tipo, q) {
  return { tipo, tribunal: trib, numero: t(q.numero || q.numero_tema || q.numero_sumula || q.tema || q.id), ementa: t(q.tese_firmada || q.tese || q.enunciado || q.texto || q.texto_sumula || q.titulo || q.questao || q.descricao).replace(/\s+/g, " "), titulo: t(q.titulo || q.questao_submetida || q.descricao || ""), situacao: t(q.situacao || q.status), link: doTribunal(q.link || q.url || q.link_tema) };
}

export async function juris(p, req) {
  if (p === "/juris/tribunais") return { st: 200, corpo: { tribunais: TRIBUNAIS_JURIS } };
  if (p !== "/juris/busca" || req.method !== "POST") return null;
  let c; try { c = await req.json(); } catch (e) { return { st: 400, corpo: { erro: "JSON inválido." } }; }
  const q = String(c.q || "").trim().slice(0, 500), lim = Math.min(Math.max(+c.limite || 10, 1), 30);
  if (q.length < 3) return { st: 400, corpo: { erro: "Informe o tema da pesquisa." } };
  const tribs = (Array.isArray(c.tribunais) ? c.tribunais : []).map(x => String(x).toLowerCase()).filter(x => TRIBUNAIS_JURIS[x]).slice(0, 6);
  if (!tribs.length) return { st: 400, corpo: { erro: "Escolha ao menos um tribunal." } };
  const out = [], fila = tribs.slice();
  await Promise.all([0, 1].map(async () => {
    while (fila.length) {
      const tr = fila.shift(), corpo = Object.assign({ query: q, limit: lim, vector_mode: "auto" }, EXTRAS[tr] || {});
      if (c.de) corpo.from = String(c.de).slice(0, 10); if (c.ate) corpo.to = String(c.ate).slice(0, 10);
      try {
        const d = await consultar(tr, corpo), lista = Array.isArray(d.reranked_results) && d.reranked_results.length ? d.reranked_results.filter(x => !x.__kind || x.__kind === "juris") : (d.results || d.juris || []);
        const vistos = new Set(), acs = [];
        for (const x of lista) { const a = acordao(tr, x), k = a.numero + "|" + a.julgamento + "|" + a.ementa.slice(0, 120); if (vistos.has(k)) continue; vistos.add(k); acs.push(a); }
        const qual = [];
        (d.sumulas_vinc || []).forEach(x => qual.push(qualificado(tr, "súmula vinculante", x)));
        (d.sumulas || []).forEach(x => qual.push(qualificado(tr, "súmula", x)));
        (d.rg || []).forEach(x => qual.push(qualificado(tr, "repercussão geral", x)));
        (d.repetitivos || []).forEach(x => qual.push(qualificado(tr, "tema repetitivo", x)));
        (d.iacs || []).forEach(x => qual.push(qualificado(tr, "IAC", x)));
        out.push({ tribunal: tr, nome: TRIBUNAIS_JURIS[tr], acordaos: acs, qualificados: qual.filter(x => x.ementa) });
      } catch (e) { out.push({ tribunal: tr, nome: TRIBUNAIS_JURIS[tr], erro: e.message || String(e), acordaos: [], qualificados: [] }); }
    }
  }));
  out.sort((a, b) => tribs.indexOf(a.tribunal) - tribs.indexOf(b.tribunal));
  return { st: 200, corpo: { q, fonte: "JurisprudênciaIA (busca direta, não oficial), pelo método do Garimpo-Jurídico", resultados: out } };
}
