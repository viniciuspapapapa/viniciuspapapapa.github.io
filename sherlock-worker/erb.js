/* Estações rádio base (ERB) para a ferramenta "Mapa de localização por ERB" do HUB (/erb/...).

   /erb/anatel  estações do Serviço Móvel Pessoal (telefonia celular, serviço 010) licenciadas pela Anatel num raio em
                torno de um ponto, pela consulta pública do sistema de licenciamento (sistemas.anatel.gov.br/se), com
                operadora, número da estação, endereço, tecnologias, azimutes e coordenadas oficiais.
   /erb/geo     coordenadas de um endereço pelo OpenStreetMap (Nominatim), para ERBs informadas só por endereço; uma
                consulta por vez, como pede a política de uso do serviço. */

const ANATEL = "https://sistemas.anatel.gov.br/se/public/view/b/";
const UA = "Mozilla/5.0 (HUB TPC; consulta pública de estações)";

async function req(url, opc, pote) {
  const h = Object.assign({ "User-Agent": UA }, (opc && opc.headers) || {});
  if (pote && pote.size) h.Cookie = [...pote].map(([k, v]) => k + "=" + v).join("; ");
  const ctl = new AbortController(), tm = setTimeout(() => ctl.abort(), (opc && opc.timeout || 60) * 1000);
  try {
    const r = await fetch(url, Object.assign({}, opc || {}, { headers: h, signal: ctl.signal }));
    if (pote) { const sc = typeof r.headers.getSetCookie === "function" ? r.headers.getSetCookie() : []; for (const c of sc) { const m = String(c).match(/^\s*([^=;\s]+)=([^;]*)/); if (m) pote.set(m[1], m[2]); } }
    return r;
  } finally { clearTimeout(tm); }
}
/* primeiro arquivo de um ZIP (método deflate ou armazenado), lido pelo diretório central */
async function unzip1(buf) {
  const u = new Uint8Array(buf), dv = new DataView(u.buffer, u.byteOffset, u.byteLength);
  let eocd = -1; for (let i = u.length - 22; i >= Math.max(0, u.length - 65557); i--) if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  if (eocd < 0) throw new Error("Arquivo da Anatel em formato inesperado.");
  const cd = dv.getUint32(eocd + 16, true);
  if (dv.getUint32(cd, true) !== 0x02014b50) throw new Error("Arquivo da Anatel em formato inesperado.");
  const metodo = dv.getUint16(cd + 10, true), tam = dv.getUint32(cd + 20, true), loc = dv.getUint32(cd + 42, true);
  const ini = loc + 30 + dv.getUint16(loc + 26, true) + dv.getUint16(loc + 28, true), dados = u.slice(ini, ini + tam);
  if (metodo === 0) return new TextDecoder().decode(dados);
  return await new Response(new Blob([dados]).stream().pipeThrough(new DecompressionStream("deflate-raw"))).text();
}
function linhas(txt) {
  const ls = txt.replace(/^﻿/, "").split(/\r?\n/).filter(Boolean), cab = ls.shift().split("|").map(c => c.replace(/^"|"$/g, ""));
  return ls.map(l => { const v = l.split("|").map(c => c.replace(/^"|"$/g, "")), o = {}; cab.forEach((c, i) => o[c] = v[i]); return o; });
}

async function anatel(lat, lon, raio, uf) {
  const pote = new Map();
  await req(ANATEL + "licenciamento.php", {}, pote);
  const fd = new FormData();
  Object.entries({ wfid: "licencas", view: "licenciamento", fa_gsearch: "1", fa_lat: String(lat), fa_lon: String(lon), fa_dist: String(raio), fc_8: uf, fc_3: "010", skip: "0", filter: "1", rpp: "50" }).forEach(([k, v]) => fd.append(k, v));
  const r1 = await req(ANATEL + "export_licenciamento.php", { method: "POST", body: fd }, pote);
  const j = await r1.json().catch(() => null);
  if (!j || !j.redirectUrl) throw new Error((j && (j.message || j.error)) || "A Anatel não gerou o arquivo (HTTP " + r1.status + ").");
  const r2 = await req(new URL(j.redirectUrl, "https://sistemas.anatel.gov.br").href, {}, pote);
  if (!r2.ok) throw new Error("A Anatel não entregou o arquivo (HTTP " + r2.status + ").");
  const regs = linhas(await unzip1(await r2.arrayBuffer())), est = new Map();
  for (const r of regs) {
    const k = r.NumEstacao; if (!k) continue;
    let e = est.get(k);
    if (!e) { e = { estacao: k, operadora: r.NomeEntidade, endereco: [r.EnderecoEstacao, r.EndComplemento].filter(Boolean).join(", "), municipio: r["Municipio.NomeMunicipio"] || "", uf: r.SiglaUf, lat: +r.Latitude, lon: +r.Longitude, tecnologias: new Set(), azimutes: new Set(), alturas: new Set(), licenciamento: r.DataPrimeiroLicenciamento || r.DataLicenciamento || "", validade: r.DataValidade || "" }; est.set(k, e); }
    if (r.Tecnologia) e.tecnologias.add(r.Tecnologia); if (r.Azimute !== "" && r.Azimute != null) e.azimutes.add(+r.Azimute); if (r.AlturaAntena) e.alturas.add(+r.AlturaAntena);
  }
  return [...est.values()].map(e => Object.assign(e, { tecnologias: [...e.tecnologias].sort(), azimutes: [...e.azimutes].sort((a, b) => a - b), alturas: [...e.alturas].sort((a, b) => a - b) }));
}

let ultimoGeo = 0;
export async function erb(p, req0) {
  const u = new URL(req0.url);
  if (p === "/erb/anatel") {
    const lat = +u.searchParams.get("lat"), lon = +u.searchParams.get("lon"), raio = Math.min(Math.max(+u.searchParams.get("raio") || 1, 0.1), 5), uf = String(u.searchParams.get("uf") || "").toUpperCase();
    if (!isFinite(lat) || !isFinite(lon) || Math.abs(lat) > 34 || Math.abs(lon) > 75 || !/^[A-Z]{2}$/.test(uf)) return { st: 400, corpo: { erro: "Informe latitude, longitude e UF." } };
    try { const est = await anatel(lat, lon, raio, uf); return { st: 200, corpo: { fonte: "Anatel, consulta pública do licenciamento de estações (SMP, serviço 010)", centro: [lat, lon], raio, estacoes: est } }; }
    catch (e) { return { st: 502, corpo: { erro: e.message || String(e) } }; }
  }
  if (p === "/erb/geo") {
    const q = String(u.searchParams.get("q") || "").trim().slice(0, 200); if (q.length < 6) return { st: 400, corpo: { erro: "Informe o endereço." } };
    const espera = 1100 - (Date.now() - ultimoGeo); if (espera > 0) await new Promise(ok => setTimeout(ok, espera)); ultimoGeo = Date.now();
    const r = await req("https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&countrycodes=br&q=" + encodeURIComponent(q), { headers: { Accept: "application/json", "Accept-Language": "pt-BR" }, timeout: 20 });
    const d = await r.json().catch(() => []);
    if (!Array.isArray(d) || !d.length) return { st: 200, corpo: { encontrado: false } };
    return { st: 200, corpo: { encontrado: true, lat: +d[0].lat, lon: +d[0].lon, nome: d[0].display_name, fonte: "OpenStreetMap (Nominatim)" } };
  }
  return null;
}
