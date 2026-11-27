/* Trajeto de viatura por GPS: leitura do relatório de rastreamento (PDF com texto ou digitalizado, planilha, GPX ou KML),
   reconstrução do trajeto, paradas, lacunas de sinal, velocidades calculadas, confronto com o local e o horário dos fatos,
   mapa Leaflet com reprodução no tempo, gráfico de velocidade, relatório Word, KML e CSV.
   Os horários são tratados como hora local do relatório (sem fuso), guardados em milissegundos "de relógio". */
(function () {
  "use strict";
  const $ = s => document.querySelector(s), $$ = s => [...document.querySelectorAll(s)], esc = s => window.HUB.esc(s), P = window.TPC_PECA, X = window.PDFX;
  const CFG = (window.HUB_CONFIG && window.HUB_CONFIG.sherlock) || {}, SERV = (CFG.url || "https://sherlock-tpc.viniciuspapapapa.workers.dev").replace(/\/+$/, "");
  const H = CFG.token ? { "X-App-Token": CFG.token } : {};
  const CORES = ["#1F5FBF", "#C0262D", "#2E8B57", "#8E44AD", "#D4880F", "#127E8A"];
  const E = { fontes: [], veic: [], local: null, horaFato: null, T0: 0, T1: 0, T: 0, tocando: false };
  const sem = s => String(s == null ? "" : s).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
  function lib(url, cdn, ok) { if (ok()) return Promise.resolve(); return new Promise((res, rej) => { const t = i => { const u = [new URL(url, location.href).href, cdn][i]; if (!u) return rej(new Error("Biblioteca indisponível.")); const s = document.createElement("script"); s.src = u; s.onload = () => ok() ? res() : t(i + 1); s.onerror = () => { s.remove(); t(i + 1); }; document.head.appendChild(s); }; t(0); }); }
  const xlsx = () => lib("../vendor/xlsx/xlsx.full.min.js", "https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js", () => typeof XLSX !== "undefined");
  const leaflet = () => lib("../vendor/leaflet/leaflet.js", "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.js", () => typeof L !== "undefined");
  const chartLib = () => lib("../vendor/chartjs/chart.umd.min.js", "https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.0/chart.umd.min.js", () => typeof Chart !== "undefined");
  function prog(f) { $("#barra").hidden = f == null; if (f != null) $("#barra i").style.width = Math.round(f * 100) + "%"; }

  /* ------------------------------------------------------------------ tempo e distância */
  const iso = t => new Date(t).toISOString().slice(0, 19);
  const fmt = t => { if (t == null || isNaN(t)) return "—"; const s = iso(t); return s.slice(8, 10) + "/" + s.slice(5, 7) + "/" + s.slice(0, 4) + " " + s.slice(11, 19); };
  const hora = t => iso(t).slice(11, 19);
  const daInput = v => v ? Date.parse(v.length === 16 ? v + ":00Z" : v + "Z") : null;
  const paraInput = t => iso(t);
  function dur(ms) { const s = Math.round(Math.abs(ms) / 1000), h = Math.floor(s / 3600), m = Math.floor(s / 60) % 60, ss = s % 60; return h ? h + " h " + String(m).padStart(2, "0") + " min" : m ? m + " min " + String(ss).padStart(2, "0") + " s" : ss + " s"; }
  const km = m => m >= 1000 ? (m / 1000).toFixed(2).replace(".", ",") + " km" : Math.round(m) + " m";
  const n1 = x => (Math.round(x * 10) / 10).toLocaleString("pt-BR");
  const rad = x => x * Math.PI / 180;
  const dist = (a, b) => { const x = Math.sin(rad(b.lat - a.lat) / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(rad(b.lon - a.lon) / 2) ** 2; return 2 * 6371000 * Math.asin(Math.min(1, Math.sqrt(x))); };
  const rumo = (a, b) => { const y = Math.sin(rad(b.lon - a.lon)) * Math.cos(rad(b.lat)), x = Math.cos(rad(a.lat)) * Math.sin(rad(b.lat)) - Math.sin(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.cos(rad(b.lon - a.lon)); return (Math.atan2(y, x) * 180 / Math.PI + 360) % 360; };
  /* data e hora de uma célula ou texto, como relógio local */
  function relogio(y, mo, d, h, mi, s) { return Date.UTC(+y < 100 ? 2000 + +y : +y, +mo - 1, +d, +(h || 0), +(mi || 0), +(s || 0)); }
  const RE_DH = /(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{2,4})[\sT,]*(?:[àa]s\s*)?(\d{1,2}):(\d{2})(?::(\d{2}))?/;
  const RE_ISO = /(\d{4})-(\d{2})-(\d{2})[T\s](\d{2}):(\d{2})(?::(\d{2}))?/;

  /* ------------------------------------------------------------------ leitura das linhas */
  /* Uma linha de relatório: data e hora, endereço, latitude e longitude; velocidade e ignição quando houver. */
  function lerLinha(txt) {
    let m = txt.match(RE_DH), t; if (m) t = relogio(m[3], m[2], m[1], m[4], m[5], m[6]); else if ((m = txt.match(RE_ISO))) t = relogio(m[1], m[2], m[3], m[4], m[5], m[6]); else return null;
    const resto = txt.replace(m[0], " ");
    const nums = [...resto.matchAll(/(^|[^\d.,])(-?\d{1,3}[.,]\d{4,})(?![\d])/g)].map(x => ({ v: +x[2].replace(",", "."), s: x[2] }));
    let par = null;
    for (let i = 0; i + 1 < nums.length; i++) { let a = nums[i].v, b = nums[i + 1].v; if (Math.abs(a) > 90 && Math.abs(b) <= 90) [a, b] = [b, a]; if (Math.abs(a) <= 90 && Math.abs(b) <= 180 && !(a === 0 && b === 0)) { if (a < -34 && b > -34 && b < 6) [a, b] = [b, a]; par = { lat: a, lon: b, s: [nums[i].s, nums[i + 1].s] }; break; } }
    if (!par) return { t, semCoord: true, txt };
    let end = resto; par.s.forEach(s => { end = end.replace(s, " "); });
    let vel = null; const mv = end.match(/(\d{1,3}(?:[.,]\d+)?)\s*km\s*\/?\s*h/i); if (mv) { vel = +mv[1].replace(",", "."); end = end.replace(mv[0], " "); }
    let ign = null; if (/\bdesligad[ao]\b|\boff\b/i.test(end)) ign = false; else if (/\bligad[ao]\b|\bon\b/i.test(end)) ign = true;
    end = end.replace(/\b(igni[cç][aã]o|desligad[ao]|ligad[ao])\b\s*:?/gi, " ").replace(/\s{2,}/g, " ").replace(/^[\s|;,-]+|[\s|;,-]+$/g, "").trim();
    return { t, lat: par.lat, lon: par.lon, end, vel, ign };
  }
  /* Junta linhas quebradas (endereço em duas linhas) e devolve os registros e os metadados do cabeçalho, em blocos:
     um mesmo arquivo pode trazer, em sequência, os relatórios de mais de uma viatura. */
  function lerTexto(linhas) {
    const blocos = []; let meta = {}, regs = [], semCoord = [], atual = null, cont = 0, pag = 0, bloco = null;
    const novo = () => { meta = {}; regs = []; semCoord = []; bloco = { meta, regs, semCoord, pagIni: pag || null, pagFim: pag || null }; blocos.push(bloco); };
    novo();
    const fecha = () => { if (!atual) return; const r = lerLinha(atual); if (r && !r.semCoord) { regs.push(r); if (pag) { if (!bloco.pagIni) bloco.pagIni = pag; bloco.pagFim = pag; } } else if (r && !/data\s*(de\s*)?(in[ií]cio|fim|emiss)|emiss[aã]o|per[ií]odo|gerad[oa]\s+em|impress/i.test(atual)) semCoord.push(atual.trim()); atual = null; };
    for (const l0 of linhas) {
      const l = String(l0).replace(/\s+$/, ""); if (!l.trim()) continue;
      let m;
      if ((m = l.match(/^\f(\d+)$/))) { fecha(); pag = +m[1]; continue; }
      if ((m = l.match(/ve[ií]culo\s*:\s*(.+?)(?:\s{2,}|\s+usu[aá]rio|$)/i))) { const v = m[1].trim(); if (meta.veiculo && meta.veiculo !== v) { fecha(); novo(); } if (!meta.veiculo) meta.veiculo = v; }
      if ((m = l.match(/(?:usu[aá]rio\s+respons[aá]vel|respons[aá]vel)\s*:\s*(.+?)(?:\s{2,}|$)/i)) && !meta.responsavel) meta.responsavel = m[1].trim();
      if ((m = l.match(/data\s*(?:de\s*)?in[ií]cio\s*:?\s*(.+?)(?:\s{2,}|data|$)/i)) && !meta.inicio) { const r = lerLinha(m[1] + " 0.0000 0.0000"); if (r) meta.inicio = r.t; }
      if ((m = l.match(/data\s*(?:de\s*)?fim\s*:?\s*(.+?)(?:\s{2,}|$)/i)) && !meta.fim) { const r = lerLinha(m[1] + " 0.0000 0.0000"); if (r) meta.fim = r.t; }
      if ((m = l.match(/data\s*de\s*emiss[aã]o\s*:?\s*(.+?)(?:\s{2,}|$)/i)) && !meta.emissao) { const r = lerLinha(m[1] + " 0.0000 0.0000"); if (r) meta.emissao = r.t; }
      if (/relat[oó]rio\s+de\s+\w+/i.test(l) && !meta.titulo) meta.titulo = l.trim().slice(0, 80);
      if (RE_DH.test(l) || RE_ISO.test(l)) { fecha(); atual = l; cont = 0; }
      else if (atual && cont < 2 && !lerLinha(atual + " ")?.lat) { atual += " " + l; cont++; }
      else fecha();
    }
    fecha();
    return blocos.filter(b => b.regs.length || b.semCoord.length);
  }
  async function textoPdf(bytes, fonte) {
    await X.carregar("pdfjs"); const pdf = await X.abrirJs(bytes), linhas = []; fonte.paginas = pdf.numPages;
    for (let p = 1; p <= pdf.numPages; p++) {
      prog(p / pdf.numPages * 0.5); const pg = await pdf.getPage(p), tc = await pg.getTextContent(); linhas.push("\f" + p);
      const it = tc.items.filter(i => i.str && i.str.trim()).map(i => ({ s: i.str, x: i.transform[4], y: i.transform[5], w: i.width || 0, h: Math.abs(i.transform[3]) || 8 })).sort((a, b) => b.y - a.y || a.x - b.x);
      const grupos = []; for (const i of it) { const g = grupos.find(g => Math.abs(g.y - i.y) <= Math.max(2, i.h * 0.45)); if (g) g.it.push(i); else grupos.push({ y: i.y, it: [i] }); }
      grupos.sort((a, b) => b.y - a.y).forEach(g => { g.it.sort((a, b) => a.x - b.x); let s = "", fimX = null; g.it.forEach(i => { if (fimX != null) s += i.x - fimX > 8 ? "   " : i.x - fimX > 0.8 ? " " : ""; s += i.s; fimX = i.x + i.w; }); linhas.push(s); });
    }
    return { linhas, pdf };
  }
  async function ocrPdf(pdf, fonte) {
    const w = await X.tesseract("por"), linhas = [];
    try {
      for (let p = 1; p <= pdf.numPages; p++) {
        prog(0.5 + p / pdf.numPages * 0.5); $("#estado").textContent = "Lendo o PDF digitalizado por OCR: página " + p + " de " + pdf.numPages + "…";
        const cv = await X.renderizar(await pdf.getPage(p), 2.4); const r = await w.recognize(cv); linhas.push("\f" + p, ...String(r.data.text || "").split(/\n/));
      }
    } finally { await w.terminate(); }
    fonte.ocr = true; return linhas;
  }
  function celula(v) {
    if (v instanceof Date && !isNaN(v)) return fmt(relogio(v.getFullYear(), v.getMonth() + 1, v.getDate(), v.getHours(), v.getMinutes(), v.getSeconds()));
    return String(v == null ? "" : v);
  }
  async function lerPlanilha(buf, nome) {
    let linhas;
    if (/\.(xlsx|xls|ods)$/i.test(nome)) { await xlsx(); const wb = XLSX.read(buf, { type: "array", cellDates: true }); linhas = []; wb.SheetNames.forEach(sn => { const a = XLSX.utils.sheet_to_json(wb.Sheets[sn], { header: 1, raw: true, defval: "" }); if (a.length > linhas.length) linhas = a; }); }
    else { let txt; try { txt = new TextDecoder("utf-8", { fatal: true }).decode(new Uint8Array(buf)); } catch (e) { txt = new TextDecoder("windows-1252").decode(new Uint8Array(buf)); } const ls = txt.replace(/^﻿/, "").split(/\r?\n/), am = ls.slice(0, 20).join("\n"), sep = ["\t", ";", "|", ","].sort((a, b) => (am.split(b).length) - (am.split(a).length))[0]; linhas = ls.map(l => l.split(sep).map(c => c.replace(/^"|"$/g, "").trim())); }
    /* colunas de velocidade e ignição sem unidade: marcadas pelo cabeçalho */
    let iv = -1, ii = -1; for (let i = 0; i < Math.min(15, linhas.length); i++) { const c = linhas[i].map(sem); const v = c.findIndex(x => /veloc|speed/.test(x)), g = c.findIndex(x => /ignic/.test(x)); if (v >= 0 || g >= 0) { iv = v; ii = g; break; } }
    return linhas.map(l => l.map((c, k) => { let s = celula(c); if (typeof c === "number" && !(c instanceof Date)) { if (c > 20000 && c < 80000 && String(c).includes(".") && Math.abs(c) > 180) { const d = new Date(Math.round((c - 25569) * 86400000)); s = fmt(relogio(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate(), d.getUTCHours(), d.getUTCMinutes(), d.getUTCSeconds())); } else s = String(c); } if (k === iv && s && !/km/i.test(s)) s += " km/h"; if (k === ii && s) s = /^(1|s|sim|true|on|ligad)/i.test(s) ? "Ligada" : /^(0|n|nao|não|false|off|deslig)/i.test(s) ? "Desligada" : s; return s; }).join("   "));
  }
  function lerXml(txt, nome) {
    const doc = new DOMParser().parseFromString(txt, "application/xml"), regs = [];
    const local = iso => { const d = new Date(iso); return isNaN(d) ? null : relogio(d.getFullYear(), d.getMonth() + 1, d.getDate(), d.getHours(), d.getMinutes(), d.getSeconds()); };
    if (/\.gpx$/i.test(nome) || doc.getElementsByTagName("gpx").length) {
      [...doc.querySelectorAll("trkpt, rtept, wpt")].forEach(p => { const tm = p.querySelector("time"), t = tm ? local(tm.textContent) : null; if (t == null) return; const sp = p.querySelector("speed"); regs.push({ t, lat: +p.getAttribute("lat"), lon: +p.getAttribute("lon"), end: (p.querySelector("name, desc") || {}).textContent || "", vel: sp ? +sp.textContent * 3.6 : null, ign: null }); });
    } else {
      const ws = doc.getElementsByTagName("when"), cs = doc.getElementsByTagNameNS("*", "coord");
      if (ws.length && cs.length === ws.length) [...ws].forEach((w, i) => { const [lon, lat] = cs[i].textContent.trim().split(/\s+/).map(Number), t = local(w.textContent); if (t != null) regs.push({ t, lat, lon, end: "", vel: null, ign: null }); });
      else [...doc.getElementsByTagName("Placemark")].forEach(pm => { const w = pm.getElementsByTagName("when")[0], c = pm.getElementsByTagName("coordinates")[0]; if (!w || !c) return; const [lon, lat] = c.textContent.trim().split(/[\s,]+/).map(Number), t = local(w.textContent); if (t != null) regs.push({ t, lat, lon, end: (pm.getElementsByTagName("name")[0] || {}).textContent || "", vel: null, ign: null }); });
    }
    return [{ meta: {}, regs, semCoord: [] }];
  }

  /* ------------------------------------------------------------------ arquivos */
  const zona = $("#zona");
  ["dragenter", "dragover"].forEach(ev => zona.addEventListener(ev, e => { e.preventDefault(); zona.classList.add("sobre"); }));
  ["dragleave", "drop"].forEach(ev => zona.addEventListener(ev, e => { e.preventDefault(); zona.classList.remove("sobre"); }));
  zona.addEventListener("drop", e => adicionar([...e.dataTransfer.files]));
  $("#arquivo").addEventListener("change", e => { adicionar([...e.target.files]); e.target.value = ""; });
  async function adicionar(files) {
    for (const f of files) {
      const fonte = { nome: f.name, paginas: 0, ocr: false };
      try {
        $("#estado").textContent = "Lendo " + f.name + "…"; prog(0.02);
        const buf = await f.arrayBuffer(); let bs;
        const total = l => l.reduce((s, b) => s + b.regs.length, 0);
        if (/\.pdf$/i.test(f.name) || f.type === "application/pdf") {
          const { linhas, pdf } = await textoPdf(new Uint8Array(buf), fonte); bs = lerTexto(linhas);
          if (total(bs) < 3) { $("#estado").textContent = "O PDF não tem texto legível; lendo por OCR (pode levar alguns minutos)…"; bs = lerTexto(await ocrPdf(pdf, fonte)); }
        } else if (/\.(gpx|kml)$/i.test(f.name)) bs = lerXml(new TextDecoder().decode(new Uint8Array(buf)), f.name);
        else bs = lerTexto(await lerPlanilha(buf, f.name));
        prog(null);
        bs = bs.filter(b => b.regs.length);
        if (!bs.length) { window.HUB.toast("Nenhum registro com data, hora e coordenadas encontrado em " + f.name + ".", 6000); continue; }
        bs.forEach(b => E.fontes.push(Object.assign({}, fonte, { meta: b.meta, regs: b.regs, semCoord: b.semCoord, pagIni: b.pagIni, pagFim: b.pagFim })));
        if (bs.length > 1) window.HUB.toast(f.name + " traz os relatórios de " + bs.length + " viaturas; cada uma aparece separada no mapa.", 6000);
      } catch (e) { prog(null); window.HUB.toast("Não foi possível ler " + f.name + ": " + (e.message || e), 6000); }
    }
    montarVeiculos();
  }
  function montarVeiculos() {
    const mapa = new Map();
    E.fontes.forEach(f => { const k = (f.meta.veiculo || f.nome.replace(/\.[^.]+$/, "")).trim(); if (!mapa.has(k)) mapa.set(k, { nome: k, fontes: [], meta: {}, brutos: [] }); const v = mapa.get(k); v.fontes.push(f); v.brutos.push(...f.regs); ["responsavel", "inicio", "fim", "emissao", "titulo"].forEach(c => { if (f.meta[c] != null && v.meta[c] == null) v.meta[c] = f.meta[c]; }); });
    E.veic = [...mapa.values()].map((v, i) => {
      let foraOrdem = 0; for (let k = 1; k < v.brutos.length; k++) if (v.brutos[k].t < v.brutos[k - 1].t) foraOrdem++;
      const vistos = new Map(), pts = []; let duplicados = 0, conflitos = 0;
      [...v.brutos].sort((a, b) => a.t - b.t).forEach(p => { const k = p.t, o = vistos.get(k); if (o) { if (Math.abs(o.lat - p.lat) < 1e-6 && Math.abs(o.lon - p.lon) < 1e-6) duplicados++; else { conflitos++; pts.push(p); } } else { vistos.set(k, p); pts.push(p); } });
      return Object.assign(v, { cor: CORES[i % CORES.length], visivel: true, pts, foraOrdem, duplicados, conflitos });
    });
    const tot = E.veic.reduce((s, v) => s + v.pts.length, 0);
    const nArq = new Set(E.fontes.map(f => f.nome)).size;
    $("#estado").textContent = nArq + (nArq === 1 ? " arquivo" : " arquivos") + " · " + E.veic.length + (E.veic.length === 1 ? " viatura" : " viaturas") + " · " + tot.toLocaleString("pt-BR") + " registros de posição" + (E.fontes.some(f => f.ocr) ? " · lido por OCR: confira os horários e coordenadas no original" : "") + ".";
    $("#fontes").innerHTML = E.fontes.length ? '<div class="rolagem" style="max-height:200px"><table class="t"><thead><tr><th>Arquivo</th><th>Viatura</th><th>Responsável</th><th>Período do relatório</th><th>Emissão</th><th class="n">Registros</th></tr></thead><tbody>' + E.fontes.map(f => "<tr><td>" + esc(f.nome) + (f.pagIni ? ' <span class="mudo">págs. ' + f.pagIni + " a " + f.pagFim + "</span>" : "") + (f.ocr ? ' <span class="mudo">(OCR)</span>' : "") + "</td><td>" + esc(f.meta.veiculo || "—") + "</td><td>" + esc(f.meta.responsavel || "—") + "</td><td>" + (f.meta.inicio ? fmt(f.meta.inicio) + " a " + fmt(f.meta.fim) : "—") + "</td><td>" + (f.meta.emissao ? fmt(f.meta.emissao) : "—") + '</td><td class="n">' + f.regs.length.toLocaleString("pt-BR") + "</td></tr>").join("") + '</tbody></table></div><div class="linha-btns" style="margin-top:10px"><button type="button" class="btn sec" id="limpar">Remover os arquivos</button></div>' : "";
    if ($("#limpar")) $("#limpar").onclick = () => { E.fontes = []; E.veic = []; pausar(); $("#resBloco").hidden = true; montarVeiculos(); $("#estado").textContent = ""; };
    if (!E.veic.length) return;
    const ts = E.veic.flatMap(v => [v.pts[0].t, v.pts[v.pts.length - 1].t]);
    $("#de").value = paraInput(Math.min(...ts)); $("#ate").value = paraInput(Math.max(...ts));
    abrirMapa().catch(e => window.HUB.toast(e.message || String(e), 6000));
  }

  /* ------------------------------------------------------------------ análise */
  const par = () => ({ raio: +$("#raio").value || 200, minParada: (+$("#minParada").value || 2) * 60000, raioParada: +$("#raioParada").value || 60, lacuna: (+$("#lacuna").value || 2) * 60000, limVel: +$("#limVel").value || 100 });
  function analisar(v) {
    const p = par(), de = daInput($("#de").value), ate = daInput($("#ate").value);
    const pts = v.pts.filter(x => (de == null || x.t >= de) && (ate == null || x.t <= ate));
    const seg = []; let total = 0, vmax = 0;
    for (let i = 1; i < pts.length; i++) { const a = pts[i - 1], b = pts[i], dt = b.t - a.t, d = dist(a, b), vel = dt > 0 ? d / dt * 3600 : 0; const lac = dt >= p.lacuna, salto = vel > 200 && d > 300; seg.push({ i, a, b, dt, d, vel, lac, salto }); if (!salto) total += d; if (!lac && !salto && vel > vmax) vmax = vel; }
    const ints = seg.map(s => s.dt).sort((x, y) => x - y), mediana = ints.length ? ints[Math.floor(ints.length / 2)] : 0;
    const paradas = []; for (let i = 0; i < pts.length;) { let j = i; while (j + 1 < pts.length && dist(pts[i], pts[j + 1]) <= p.raioParada) j++; const d = pts[j].t - pts[i].t; if (j > i && d >= p.minParada) { const grupo = pts.slice(i, j + 1), cont = new Map(); grupo.forEach(g => { if (g.end) cont.set(g.end, (cont.get(g.end) || 0) + 1); }); paradas.push({ ini: pts[i].t, fim: pts[j].t, dur: d, lat: grupo.reduce((s, g) => s + g.lat, 0) / grupo.length, lon: grupo.reduce((s, g) => s + g.lon, 0) / grupo.length, end: [...cont].sort((a, b) => b[1] - a[1])[0]?.[0] || "", n: grupo.length, lacuna: seg.slice(i, j).some(s => s.lac), i, j }); i = j + 1; } else i++; }
    const lacunas = seg.filter(s => s.lac).map(s => ({ ini: s.a.t, fim: s.b.t, dur: s.dt, d: s.d, vel: s.vel, a: s.a, b: s.b }));
    const saltos = seg.filter(s => s.salto);
    const rapidos = []; seg.forEach(s => { if (s.lac || s.salto || s.vel < p.limVel) return; const u = rapidos[rapidos.length - 1]; if (u && u.fimI === s.i - 1) { u.fim = s.b.t; u.fimI = s.i; u.vmax = Math.max(u.vmax, s.vel); u.d += s.d; } else rapidos.push({ ini: s.a.t, fim: s.b.t, fimI: s.i, vmax: s.vel, d: s.d, end: s.b.end || s.a.end }); });
    paradas.forEach(x => { x.semReg = seg.slice(x.i, x.j).filter(s => s.lac).reduce((s, y) => s + y.dt, 0); }); const parado = paradas.reduce((s, x) => s + x.dur - x.semReg, 0), semSinal = lacunas.reduce((s, x) => s + x.dur, 0), periodo = pts.length ? pts[pts.length - 1].t - pts[0].t : 0;
    const r = { v, pts, seg, total, vmax, mediana, paradas, lacunas, saltos, rapidos, parado, semSinal, periodo, movimento: Math.max(0, periodo - parado - semSinal) };
    if (E.local) {
      const dd = pts.map(x => dist(x, E.local)); let mi = -1; dd.forEach((d, i) => { if (mi < 0 || d < dd[mi]) mi = i; });
      r.menor = mi >= 0 ? { d: dd[mi], p: pts[mi] } : null;
      r.passagens = []; let at = null; pts.forEach((x, i) => { if (dd[i] <= p.raio) { if (at && i - 1 === at.ultI && x.t - pts[i - 1].t < p.lacuna) { at.fim = x.t; at.ultI = i; at.dmin = Math.min(at.dmin, dd[i]); at.n++; } else { at = { ini: x.t, fim: x.t, ultI: i, dmin: dd[i], n: 1 }; r.passagens.push(at); } } });
      if (E.horaFato != null) r.noFato = posicao(r, E.horaFato);
    }
    return r;
  }
  /* posição da viatura num instante: interpolada entre dois registros, ou marcada como sem sinal */
  function posicao(r, t) {
    const pts = r.pts; if (!pts.length) return null;
    if (t < pts[0].t) return { estado: "antes", p: pts[0], lat: pts[0].lat, lon: pts[0].lon, t };
    if (t > pts[pts.length - 1].t) return { estado: "depois", p: pts[pts.length - 1], lat: pts[pts.length - 1].lat, lon: pts[pts.length - 1].lon, t };
    let lo = 0, hi = pts.length - 1; while (hi - lo > 1) { const m = (lo + hi) >> 1; if (pts[m].t <= t) lo = m; else hi = m; }
    const a = pts[lo], b = pts[hi], dt = b.t - a.t, f = dt > 0 ? (t - a.t) / dt : 0, p = par();
    if (dt >= p.lacuna) return { estado: "semsinal", p: a, prox: b, lat: a.lat, lon: a.lon, t, i: lo };
    const lat = a.lat + (b.lat - a.lat) * f, lon = a.lon + (b.lon - a.lon) * f, d = dist(a, b), vel = dt > 0 ? d / dt * 3600 : 0;
    const parada = r.paradas.find(x => t >= x.ini && t <= x.fim);
    return { estado: parada ? "parada" : vel < 3 ? "parada" : "movimento", p: f < 0.5 ? a : b, lat, lon, vel, rumo: d > 3 ? rumo(a, b) : null, t, i: lo, parada };
  }

  /* ------------------------------------------------------------------ mapa */
  let MAPA = null, CAMADA = null, MARC = [], GRAF = null; const R = [];
  const corVel = v => v < 10 ? "#2A78D6" : v < 30 ? "#3BAA5C" : v < 60 ? "#E8C547" : v < 90 ? "#EB6834" : "#C0262D";
  const corTempo = f => "hsl(" + Math.round(220 - 220 * f) + ",70%,45%)";
  function setaIcone(cor, nome) { return L.divIcon({ className: "", iconSize: [30, 30], iconAnchor: [15, 15], html: '<div class="seta-v" title="' + esc(nome) + '"><svg width="26" height="26" viewBox="0 0 26 26"><circle cx="13" cy="13" r="11" fill="' + cor + '" stroke="#fff" stroke-width="2.5"/><path d="M13 5 L18.5 17 L13 14.3 L7.5 17 Z" fill="#fff"/></svg></div>' }); }
  async function abrirMapa() {
    $("#resBloco").hidden = false; await leaflet();
    if (!MAPA) {
      MAPA = L.map("mapa", { preferCanvas: true });
      const ruas = L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19, attribution: "© OpenStreetMap" }).addTo(MAPA);
      const sat = L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}", { maxZoom: 19, attribution: "Imagem © Esri" });
      L.control.layers({ "Mapa": ruas, "Satélite": sat }, null, { position: "topright", collapsed: false }).addTo(MAPA); L.control.scale({ imperial: false }).addTo(MAPA);
      E.base = "ruas"; MAPA.on("baselayerchange", e => { E.base = e.name === "Satélite" ? "sat" : "ruas"; });
    }
    await aplicar(true); $("#resBloco").scrollIntoView({ behavior: "smooth", block: "start" });
  }
  async function localDosFatos() {
    const s = $("#local").value.trim(); if (!s) return null;
    const m = s.match(/^\s*(-?\d+[.,]\d+)\s*[,;\s]\s*(-?\d+[.,]\d+)\s*$/); if (m) return { lat: +m[1].replace(",", "."), lon: +m[2].replace(",", "."), nome: s, q: s };
    if (E.local && E.local.q === s) return E.local;
    const r = await fetch(SERV + "/erb/geo?q=" + encodeURIComponent(s), { headers: H }); const d = await r.json().catch(() => ({}));
    if (!d.encontrado) { window.HUB.toast("Endereço do local dos fatos não encontrado; informe latitude e longitude (ex.: -19.8256, -45.9056).", 6000); return null; }
    return { lat: d.lat, lon: d.lon, nome: d.nome || s, q: s };
  }
  async function aplicar(enquadrar) {
    pausar();
    E.local = await localDosFatos().catch(() => null); E.horaFato = daInput($("#horaFato").value);
    R.length = 0; E.veic.forEach(v => R.push(analisar(v)));
    const vis = R.filter(r => r.v.visivel && r.pts.length);
    E.T0 = vis.length ? Math.min(...vis.map(r => r.pts[0].t)) : 0; E.T1 = vis.length ? Math.max(...vis.map(r => r.pts[r.pts.length - 1].t)) : 0;
    if (E.T < E.T0 || E.T > E.T1 || enquadrar) E.T = E.horaFato != null && E.horaFato >= E.T0 && E.horaFato <= E.T1 ? E.horaFato : E.T0;
    desenhar(enquadrar); veiculos(); resumo(); faixaTempo(); await grafico(); abas(); atualizar(true);
  }
  function desenhar(enquadrar) {
    if (CAMADA) CAMADA.remove(); CAMADA = L.layerGroup().addTo(MAPA); MARC = [];
    const pontos = [], modo = $("#corPor").value, renderer = L.canvas({ padding: 0.3 });
    R.forEach(r => {
      if (!r.v.visivel || !r.pts.length) return; const v = r.v, span = Math.max(1, r.pts[r.pts.length - 1].t - r.pts[0].t);
      r.linhas = r.seg.map(s => {
        const cor = s.lac || s.salto ? "#8A8A8A" : modo === "vel" ? corVel(s.vel) : modo === "tempo" ? corTempo((s.a.t - r.pts[0].t) / span) : v.cor;
        const l = L.polyline([[s.a.lat, s.a.lon], [s.b.lat, s.b.lon]], { renderer, color: cor, weight: s.lac || s.salto ? 2 : 4, opacity: 0.9, dashArray: s.lac ? "6 7" : s.salto ? "2 6" : null }).addTo(CAMADA);
        if ((s.lac && $("#mostrarLacunas").checked) || s.salto) l.bindPopup("<b>" + (s.salto ? "Salto implausível de posição" : "Sem registro por " + dur(s.dt)) + "</b><br>" + fmt(s.a.t) + " → " + fmt(s.b.t) + "<br>Deslocamento em linha reta: " + km(s.d) + (s.lac ? "<br>Velocidade média mínima: " + n1(s.vel) + " km/h" : "<br>Velocidade calculada: " + n1(s.vel) + " km/h"));
        return { l, fim: s.b.t, cor };
      });
      r.pts.forEach(p => pontos.push([p.lat, p.lon]));
      const ini = r.pts[0], fim = r.pts[r.pts.length - 1];
      L.circleMarker([ini.lat, ini.lon], { radius: 8, color: "#fff", weight: 2, fillColor: "#2E8B57", fillOpacity: 1 }).bindTooltip("Início " + hora(ini.t), { permanent: true, direction: "top", offset: [0, -6] }).bindPopup("<b>Primeiro registro</b><br>" + fmt(ini.t) + "<br>" + esc(ini.end)).addTo(CAMADA);
      L.circleMarker([fim.lat, fim.lon], { radius: 8, color: "#fff", weight: 2, fillColor: "#C0262D", fillOpacity: 1 }).bindTooltip("Fim " + hora(fim.t), { permanent: true, direction: "top", offset: [0, -6] }).bindPopup("<b>Último registro</b><br>" + fmt(fim.t) + "<br>" + esc(fim.end)).addTo(CAMADA);
      if ($("#mostrarParadas").checked) r.paradas.forEach((p, k) => L.marker([p.lat, p.lon], { icon: L.divIcon({ className: "", iconSize: [22, 22], iconAnchor: [11, 11], html: '<div class="rot-parada" style="background:' + v.cor + '">' + (k + 1) + "</div>" }), zIndexOffset: 500 }).bindPopup("<b>Parada " + (k + 1) + "</b> · " + esc(v.nome) + "<br>" + fmt(p.ini) + " a " + hora(p.fim) + "<br>Duração: <b>" + dur(p.dur) + "</b>" + (p.lacuna ? "<br><i>Inclui intervalo sem registro</i>" : "") + "<br>" + esc(p.end) + '<br><a href="#" data-ir="' + p.ini + '">Reproduzir a partir daqui</a>').addTo(CAMADA));
      if ($("#mostrarPontos").checked) r.pts.forEach(p => L.circleMarker([p.lat, p.lon], { renderer, radius: 3, color: v.cor, weight: 1, fillColor: "#fff", fillOpacity: 1 }).bindPopup(esc(v.nome) + "<br><b>" + fmt(p.t) + "</b><br>" + esc(p.end) + "<br>" + p.lat.toFixed(6) + ", " + p.lon.toFixed(6) + (p.vel != null ? "<br>Velocidade informada: " + n1(p.vel) + " km/h" : "") + (p.ign != null ? "<br>Ignição: " + (p.ign ? "ligada" : "desligada") : "")).addTo(CAMADA));
      const m = L.marker([ini.lat, ini.lon], { icon: setaIcone(v.cor, v.nome), zIndexOffset: 1000, keyboard: false }).bindTooltip(v.nome, { direction: "right", offset: [12, 0] }).addTo(CAMADA); MARC.push({ r, m });
    });
    if (E.local) { L.circle([E.local.lat, E.local.lon], { radius: par().raio, color: "#C0262D", weight: 1.5, fillOpacity: 0.08, dashArray: "4 4" }).addTo(CAMADA); L.circleMarker([E.local.lat, E.local.lon], { radius: 7, color: "#C0262D", weight: 3, fillColor: "#fff", fillOpacity: 1 }).bindTooltip("Local dos fatos", { direction: "bottom" }).bindPopup("<b>Local dos fatos</b><br>" + esc(E.local.nome)).addTo(CAMADA); pontos.push([E.local.lat, E.local.lon]); }
    if (enquadrar) { if (pontos.length) MAPA.fitBounds(pontos, { padding: [30, 30], maxZoom: 17 }); else MAPA.setView([-19.92, -43.94], 11); }
    setTimeout(() => MAPA.invalidateSize(), 60);
    $("#legenda").innerHTML = modo === "vel" ? 'Velocidade calculada: <span class="g"></span> 0 · 10 · 30 · 60 · 90+ km/h · <span style="border-top:2px dashed #8A8A8A;display:inline-block;width:26px;vertical-align:middle"></span> sem registro' : modo === "tempo" ? 'Horário: <span class="g" style="background:linear-gradient(90deg,hsl(220,70%,45%),hsl(110,70%,45%),hsl(0,70%,45%))"></span> do primeiro ao último registro' : "";
  }
  MAPA_CLIQUE();
  function MAPA_CLIQUE() { document.addEventListener("click", e => { const a = e.target.closest("[data-ir]"); if (a) { e.preventDefault(); irPara(+a.dataset.ir); } }); }
  function veiculos() {
    $("#veiculos").innerHTML = E.veic.map((v, i) => '<label class="veic"><input type="checkbox" data-v="' + i + '"' + (v.visivel ? " checked" : "") + '><i style="background:' + v.cor + '"></i><b>' + esc(v.nome) + "</b> <span class=\"mudo\">" + v.pts.length.toLocaleString("pt-BR") + " registros</span></label>").join("");
    $$("#veiculos [data-v]").forEach(c => c.onchange = () => { E.veic[+c.dataset.v].visivel = c.checked; aplicar(false); });
  }

  /* ------------------------------------------------------------------ resumo e linha do tempo */
  function resumo() {
    let h = "";
    R.filter(r => r.v.visivel).forEach(r => {
      const v = r.v, m = v.meta;
      h += (R.length > 1 ? '<h3 style="font-size:17px;margin:14px 0 0"><span class="veic"><i style="background:' + v.cor + '"></i>' + esc(v.nome) + "</span></h3>" : "") + '<div class="kpis">' +
        '<div class="kpi"><small>Registros no intervalo</small><b>' + r.pts.length.toLocaleString("pt-BR") + '</b></div><div class="kpi"><small>Primeiro e último</small><b style="font-size:15px">' + (r.pts.length ? hora(r.pts[0].t) + " a " + hora(r.pts[r.pts.length - 1].t) : "—") + '</b></div>' +
        '<div class="kpi"><small>Distância percorrida</small><b>' + km(r.total) + '</b></div><div class="kpi"><small>Intervalo usual entre registros</small><b>' + dur(r.mediana) + "</b></div>" +
        '<div class="kpi"><small>Em movimento · parada</small><b style="font-size:15px">' + dur(r.movimento) + " · " + dur(r.parado) + '</b></div><div class="kpi' + (r.lacunas.length ? " alerta" : "") + '"><small>Lacunas de sinal</small><b>' + r.lacunas.length + (r.lacunas.length ? " · " + dur(r.semSinal) : "") + "</b></div>" +
        '<div class="kpi"><small>Velocidade máxima calculada</small><b>' + n1(r.vmax) + ' km/h</b></div><div class="kpi"><small>Paradas</small><b>' + r.paradas.length + "</b></div>";
      if (E.local && r.menor) h += '<div class="kpi alerta"><small>Menor distância ao local</small><b>' + km(r.menor.d) + '</b><small>' + fmt(r.menor.p.t) + '</small></div><div class="kpi"><small>Passagens pelo raio de ' + par().raio + ' m</small><b>' + r.passagens.length + "</b></div>";
      h += "</div>";
      const av = avisos(r);
      if (av.length) h += av.map(a => '<p class="aviso">' + esc(a) + "</p>").join("");
    });
    $("#resumo").innerHTML = h;
  }
  /* pontos de atenção de uma viatura, para a tela e para o relatório */
  function avisos(r) {
      const v = r.v, m = v.meta, av = [];
      if (m.inicio != null && r.v.pts.length && r.v.pts[0].t - m.inicio > 10 * 60000) av.push("O relatório foi pedido a partir de " + fmt(m.inicio) + ", mas o primeiro registro é de " + fmt(r.v.pts[0].t) + ": não há posição da viatura nas primeiras " + dur(r.v.pts[0].t - m.inicio) + " do período.");
      if (m.fim != null && r.v.pts.length && m.fim - r.v.pts[r.v.pts.length - 1].t > 10 * 60000) av.push("O último registro é de " + fmt(r.v.pts[r.v.pts.length - 1].t) + ", " + dur(m.fim - r.v.pts[r.v.pts.length - 1].t) + " antes do fim do período pedido (" + fmt(m.fim) + ").");
      const grandes = r.lacunas.filter(l => l.d > 1000); if (grandes.length) av.push(grandes.length + (grandes.length === 1 ? " lacuna termina" : " lacunas terminam") + " com a viatura em outro lugar (deslocamento sem rastreamento): a maior, de " + dur(Math.max(...grandes.map(l => l.dur))) + ", entre " + fmt(grandes.sort((a, b) => b.dur - a.dur)[0].ini) + " e " + hora(grandes[0].fim) + ", com " + km(grandes[0].d) + " em linha reta.");
      if (r.saltos.length) av.push(r.saltos.length + (r.saltos.length === 1 ? " salto de posição com velocidade implausível (acima de 200 km/h), típico de erro do GPS." : " saltos de posição com velocidade implausível (acima de 200 km/h), típicos de erro do GPS."));
      if (v.foraOrdem) av.push(v.foraOrdem + " registros aparecem fora da ordem cronológica no documento original.");
      if (v.conflitos) av.push(v.conflitos + " horários repetidos com coordenadas diferentes.");
      if (r.noFato) { const nf = r.noFato, d = dist(nf, E.local); av.unshift(nf.estado === "semsinal" ? "No horário dos fatos (" + fmt(E.horaFato) + ") a viatura estava sem registro: último ponto às " + hora(nf.p.t) + " a " + km(dist(nf.p, E.local)) + " do local, e próximo ponto às " + hora(nf.prox.t) + " a " + km(dist(nf.prox, E.local)) + "." : nf.estado === "antes" || nf.estado === "depois" ? "O horário dos fatos (" + fmt(E.horaFato) + ") está fora do intervalo com registros desta viatura." : "No horário dos fatos (" + fmt(E.horaFato) + ") a viatura estava a " + km(d) + " do local, " + (nf.estado === "parada" ? "parada" : "em movimento, a cerca de " + n1(nf.vel) + " km/h") + ", próxima a " + (nf.p.end || "endereço não informado") + "."); }
      return av;
  }
  function faixaTempo() {
    const tot = Math.max(1, E.T1 - E.T0), x = t => ((t - E.T0) / tot * 100).toFixed(3) + "%"; let h = "";
    R.filter(r => r.v.visivel).slice(0, 1).forEach(r => {
      if (!r.pts.length) return; h += '<i style="left:' + x(r.pts[0].t) + ";width:" + ((r.pts[r.pts.length - 1].t - r.pts[0].t) / tot * 100).toFixed(3) + '%;background:#3BAA5C"></i>';
      r.paradas.forEach(p => { h += '<i style="left:' + x(p.ini) + ";width:" + Math.max(0.15, p.dur / tot * 100).toFixed(3) + '%;background:#9A9A9A" title="Parada: ' + fmt(p.ini) + " a " + hora(p.fim) + '"></i>'; });
      r.lacunas.forEach(p => { h += '<i style="left:' + x(p.ini) + ";width:" + Math.max(0.15, p.dur / tot * 100).toFixed(3) + '%;background:#C0262D" title="Sem registro: ' + fmt(p.ini) + " a " + hora(p.fim) + '"></i>'; });
    });
    if (E.horaFato != null && E.horaFato >= E.T0 && E.horaFato <= E.T1) h += '<i style="left:' + x(E.horaFato) + ';width:3px;background:#111" title="Horário dos fatos"></i>';
    $("#faixaT").innerHTML = h; $("#tIni").textContent = fmt(E.T0); $("#tFim").textContent = fmt(E.T1);
    $("#tempo").max = Math.max(1, Math.round((E.T1 - E.T0) / 1000));
  }
  async function grafico() {
    await chartLib(); if (GRAF) GRAF.destroy();
    const ds = R.filter(r => r.v.visivel && r.pts.length).map(r => { const d = [{ x: r.pts[0].t, y: 0 }]; r.seg.forEach(s => { if (s.lac) d.push({ x: s.a.t + 1, y: null }); d.push({ x: s.b.t, y: s.salto ? null : Math.round(s.vel * 10) / 10 }); }); return { label: r.v.nome, data: d, borderColor: r.v.cor, backgroundColor: r.v.cor + "22", borderWidth: 1.5, pointRadius: 0, fill: true, spanGaps: false, tension: 0.15 }; });
    const cursor = { id: "cursor", afterDatasetsDraw(c) { const xs = c.scales.x, ct = c.ctx; const linha = (t, cor, w) => { if (t == null || t < xs.min || t > xs.max) return; const px = xs.getPixelForValue(t); ct.save(); ct.strokeStyle = cor; ct.lineWidth = w; ct.beginPath(); ct.moveTo(px, c.chartArea.top); ct.lineTo(px, c.chartArea.bottom); ct.stroke(); ct.restore(); }; linha(E.horaFato, "#C0262D", 1.5); linha(E.T, "#111", 2); } };
    const cs = getComputedStyle(document.body), tinta = cs.getPropertyValue("--ink-3").trim() || "#777";
    GRAF = new Chart($("#gVel"), { type: "line", data: { datasets: ds }, plugins: [cursor], options: { animation: false, maintainAspectRatio: false, parsing: false, normalized: true, interaction: { mode: "nearest", axis: "x", intersect: false }, plugins: { legend: { display: ds.length > 1 }, tooltip: { callbacks: { title: it => it.length ? fmt(it[0].parsed.x) : "", label: it => it.dataset.label + ": " + (it.parsed.y == null ? "sem registro" : n1(it.parsed.y) + " km/h") } } },
      scales: { x: { type: "linear", min: E.T0, max: E.T1, ticks: { color: tinta, maxTicksLimit: 10, callback: v => iso(v).slice(11, 16) } }, y: { beginAtZero: true, title: { display: true, text: "km/h", color: tinta }, ticks: { color: tinta } } },
      onClick: (ev, el, c) => { const t = c.scales.x.getValueForPixel(ev.x); if (t) irPara(t); } } });
  }

  /* ------------------------------------------------------------------ reprodução */
  let raf = null, ultimo = 0, ultGraf = 0, ultLinha = {};
  function atualizar(tudo) {
    $("#relogio").textContent = fmt(E.T); $("#tempo").value = Math.round((E.T - E.T0) / 1000);
    const textos = [];
    MARC.forEach(({ r, m }) => {
      const p = posicao(r, E.T); if (!p) return; m.setLatLng([p.lat, p.lon]);
      const el = m.getElement(); if (el) { el.style.opacity = p.estado === "movimento" || p.estado === "parada" ? 1 : 0.45; const svg = el.querySelector("svg"); if (svg && p.rumo != null) svg.style.transform = "rotate(" + Math.round(p.rumo) + "deg)"; }
      const st = p.estado === "semsinal" ? "sem registro desde " + hora(p.p.t) + " (próximo às " + hora(p.prox.t) + ")" : p.estado === "antes" ? "ainda sem registros" : p.estado === "depois" ? "registros encerrados" : p.estado === "parada" ? "parada" + (p.parada ? " há " + dur(E.T - p.parada.ini) : "") : "em movimento, " + n1(p.vel) + " km/h";
      textos.push((MARC.length > 1 ? "<b>" + esc(r.v.nome) + ":</b> " : "") + esc(st) + (p.p && p.p.end ? " · " + esc(p.p.end) : "") + (E.local ? " · a " + km(dist(p, E.local)) + " do local dos fatos" : ""));
      /* trajeto percorrido em destaque */
      if (r.linhas) { const so = $("#rastro").checked, ini = tudo ? 0 : (ultLinha[r.v.nome] || 0); let k = ini; if (tudo || !so) r.linhas.forEach(x => x.l.setStyle({ opacity: !so || x.fim <= E.T ? 0.9 : 0.25 })); else { for (; k < r.linhas.length && r.linhas[k].fim <= E.T; k++) r.linhas[k].l.setStyle({ opacity: 0.9 }); } ultLinha[r.v.nome] = r.linhas.findIndex(x => x.fim > E.T); if (ultLinha[r.v.nome] < 0) ultLinha[r.v.nome] = r.linhas.length; }
      if ($("#seguir").checked && E.tocando && MARC[0].r === r && !MAPA.getBounds().pad(-0.25).contains([p.lat, p.lon])) MAPA.panTo([p.lat, p.lon], { animate: true, duration: 0.4 });
    });
    $("#onde").innerHTML = textos.join("<br>");
    const agora = performance.now(); if (GRAF && (tudo || agora - ultGraf > 180)) { GRAF.draw(); ultGraf = agora; }
  }
  function passo(ts) { const dt = ultimo ? ts - ultimo : 0; ultimo = ts; E.T = Math.min(E.T1, E.T + dt * (+$("#ritmo").value || 60)); atualizar(false); if (E.T >= E.T1) return pausar(); raf = requestAnimationFrame(passo); }
  function tocar() { if (!MARC.length) return; if (E.T >= E.T1) { E.T = E.T0; atualizar(true); } E.tocando = true; ultimo = 0; $("#play").textContent = "❚❚"; $("#play").setAttribute("aria-label", "Pausar"); raf = requestAnimationFrame(passo); }
  function pausar() { E.tocando = false; if (raf) cancelAnimationFrame(raf); raf = null; $("#play").textContent = "▶"; $("#play").setAttribute("aria-label", "Reproduzir"); }
  function irPara(t, centralizar) { E.T = Math.max(E.T0, Math.min(E.T1, t)); atualizar(true); if (centralizar !== false && MARC.length) { const p = posicao(MARC[0].r, E.T); if (p) MAPA.setView([p.lat, p.lon], Math.max(MAPA.getZoom(), 16)); } }
  $("#play").onclick = () => E.tocando ? pausar() : tocar();
  $("#tempo").addEventListener("input", e => { E.T = E.T0 + +e.target.value * 1000; atualizar(true); });
  $("#rastro").addEventListener("change", () => atualizar(true));
  document.addEventListener("keydown", e => { if ($("#resBloco").hidden || /input|select|textarea/i.test(e.target.tagName) && e.target.type !== "range") return; if (e.code === "Space") { e.preventDefault(); E.tocando ? pausar() : tocar(); } else if (e.key === "ArrowRight" || e.key === "ArrowLeft") { e.preventDefault(); irPara(E.T + (e.key === "ArrowRight" ? 1 : -1) * (e.shiftKey ? 300000 : 20000), false); } });
  $("#aplicar").onclick = () => aplicar(true).catch(e => window.HUB.toast(e.message || String(e), 6000));
  ["#corPor", "#mostrarPontos", "#mostrarParadas", "#mostrarLacunas"].forEach(s => $(s).addEventListener("change", () => { desenhar(false); atualizar(true); }));

  /* ------------------------------------------------------------------ tabelas */
  let ABA = "paradas";
  function abas() {
    const l = [["paradas", "Paradas"], ["lacunas", "Lacunas de sinal"], ["velocidade", "Velocidades"]].concat(E.local ? [["local", "Local dos fatos"]] : []).concat([["registros", "Registros"], ["integridade", "Integridade do relatório"]]);
    if (!l.some(x => x[0] === ABA)) ABA = "paradas";
    $("#abasT").innerHTML = l.map(([k, t]) => '<button type="button" role="tab" data-aba="' + k + '" aria-selected="' + (k === ABA) + '">' + t + "</button>").join("");
    $$("#abasT [data-aba]").forEach(b => b.onclick = () => { ABA = b.dataset.aba; abas(); });
    tabela();
  }
  const tab = (cab, linhas, vazio) => linhas.length ? '<div class="rolagem"><table class="t"><thead><tr>' + cab.map(c => "<th>" + c + "</th>").join("") + "</tr></thead><tbody>" + linhas.join("") + "</tbody></table></div>" : '<p class="pequeno mudo" style="margin-top:10px">' + vazio + "</p>";
  const vcol = r => R.length > 1 ? '<td><span class="veic"><i style="background:' + r.v.cor + '"></i>' + esc(r.v.nome) + "</span></td>" : "";
  const vcab = () => R.length > 1 ? ["Viatura"] : [];
  function tabela() {
    const rs = R.filter(r => r.v.visivel); let h = "";
    if (ABA === "paradas") h = tab(vcab().concat(["Nº", "Início", "Fim", "Duração", "Endereço", "Observação"]), rs.flatMap(r => r.paradas.map((p, k) => '<tr data-t="' + p.ini + '">' + vcol(r) + '<td class="n">' + (k + 1) + "</td><td>" + fmt(p.ini) + "</td><td>" + hora(p.fim) + '</td><td class="n">' + dur(p.dur) + "</td><td>" + esc(p.end) + "</td><td>" + (p.lacuna ? "inclui intervalo sem registro" : "") + (E.local ? (p.lacuna ? "; " : "") + "a " + km(dist(p, E.local)) + " do local" : "") + "</td></tr>")), "Nenhuma parada com os parâmetros escolhidos.");
    else if (ABA === "lacunas") h = tab(vcab().concat(["Sem registro de", "Até", "Duração", "Deslocamento", "Último endereço", "Endereço seguinte"]), rs.flatMap(r => r.lacunas.map(l => '<tr data-t="' + l.ini + '">' + vcol(r) + "<td>" + fmt(l.ini) + "</td><td>" + fmt(l.fim) + '</td><td class="n">' + dur(l.dur) + '</td><td class="n">' + km(l.d) + "</td><td>" + esc(l.a.end) + "</td><td>" + esc(l.b.end) + "</td></tr>")), "Nenhum intervalo sem registro acima do limite escolhido.");
    else if (ABA === "velocidade") h = tab(vcab().concat(["Tipo", "Início", "Fim", "Velocidade calculada", "Trecho"]), rs.flatMap(r => r.rapidos.map(x => '<tr data-t="' + x.ini + '">' + vcol(r) + "<td>acima de " + par().limVel + " km/h</td><td>" + fmt(x.ini) + "</td><td>" + hora(x.fim) + '</td><td class="n">até ' + n1(x.vmax) + " km/h</td><td>" + esc(x.end) + "</td></tr>").concat(r.saltos.map(s => '<tr data-t="' + s.a.t + '">' + vcol(r) + "<td>salto implausível</td><td>" + fmt(s.a.t) + "</td><td>" + hora(s.b.t) + '</td><td class="n">' + n1(s.vel) + " km/h</td><td>" + km(s.d) + " em " + dur(s.dt) + "</td></tr>"))), "Nenhum trecho acima de " + par().limVel + " km/h nem salto de posição.");
    else if (ABA === "local") h = rs.map(r => { const nf = r.noFato; return (R.length > 1 ? '<h3 style="font-size:16px;margin:14px 0 0">' + esc(r.v.nome) + "</h3>" : "") + '<p class="pequeno" style="margin-top:10px">' + (r.menor ? "Menor distância: <b>" + km(r.menor.d) + "</b> em " + fmt(r.menor.p.t) + " (" + esc(r.menor.p.end) + ")." : "") + (nf && nf.p ? " No horário dos fatos: " + (nf.estado === "semsinal" ? "sem registro" : km(dist(nf, E.local)) + " do local") + "." : E.horaFato == null ? " Informe a data e hora dos fatos para ver a posição da viatura naquele instante." : "") + "</p>" + tab(["Entrada no raio", "Saída", "Permanência", "Registros", "Menor distância"], r.passagens.map(x => '<tr data-t="' + x.ini + '"><td>' + fmt(x.ini) + "</td><td>" + hora(x.fim) + '</td><td class="n">' + dur(x.fim - x.ini) + '</td><td class="n">' + x.n + '</td><td class="n">' + km(x.dmin) + "</td></tr>"), "A viatura não passou a menos de " + par().raio + " m do local dos fatos no intervalo."); }).join("");
    else if (ABA === "registros") { const lin = []; rs.forEach(r => r.pts.forEach((p, i) => { const s = r.seg[i - 1]; if (lin.length < 5000) lin.push('<tr data-t="' + p.t + '">' + vcol(r) + "<td>" + fmt(p.t) + "</td><td>" + esc(p.end) + '</td><td class="n">' + p.lat.toFixed(6) + ", " + p.lon.toFixed(6) + '</td><td class="n">' + (s ? dur(s.dt) : "") + '</td><td class="n">' + (s ? km(s.d) : "") + '</td><td class="n">' + (s && !s.lac ? n1(s.vel) : "") + "</td>" + (E.local ? '<td class="n">' + km(dist(p, E.local)) + "</td>" : "") + "</tr>"); })); h = '<input type="search" id="filtroReg" placeholder="Filtrar por horário ou endereço" style="margin-top:10px;width:100%;max-width:420px">' + tab(vcab().concat(["Data e hora", "Endereço", "Latitude, longitude", "Intervalo", "Distância", "km/h"]).concat(E.local ? ["Até o local"] : []), lin, "Sem registros no intervalo."); }
    else if (ABA === "integridade") h = rs.map(r => { const v = r.v, m = v.meta; const l = [["Arquivos", v.fontes.map(f => f.nome + (f.pagIni ? " (páginas " + f.pagIni + " a " + f.pagFim + " de " + f.paginas + (f.ocr ? ", lido por OCR" : "") + ")" : f.ocr ? " (lido por OCR)" : "")).join("; ")], ["Viatura", v.nome], ["Usuário responsável", m.responsavel || "não informado"], ["Período pedido", m.inicio != null ? fmt(m.inicio) + " a " + fmt(m.fim) : "não informado"], ["Data de emissão", m.emissao != null ? fmt(m.emissao) : "não informada"], ["Registros lidos", v.brutos.length.toLocaleString("pt-BR")], ["Primeiro e último registro", v.pts.length ? fmt(v.pts[0].t) + " e " + fmt(v.pts[v.pts.length - 1].t) : "—"], ["Intervalo usual entre registros", dur(r.mediana)], ["Lacunas (acima de " + (par().lacuna / 60000) + " min)", r.lacunas.length + (r.lacunas.length ? ", somando " + dur(r.semSinal) : "")], ["Registros fora de ordem no documento", String(v.foraOrdem)], ["Registros duplicados (mesmo horário e posição)", String(v.duplicados)], ["Horários repetidos com posições diferentes", String(v.conflitos)], ["Saltos implausíveis de posição", String(r.saltos.length)], ["Linhas com horário sem coordenadas", String(v.fontes.reduce((s, f) => s + (f.semCoord || []).length, 0))]]; return (R.length > 1 ? '<h3 style="font-size:16px;margin:14px 0 0">' + esc(v.nome) + "</h3>" : "") + '<div class="rolagem" style="max-height:none"><table class="t"><tbody>' + l.map(x => "<tr><td style=\"width:38%\">" + esc(x[0]) + "</td><td>" + esc(x[1]) + "</td></tr>").join("") + "</tbody></table></div>"; }).join("");
    $("#tabela").innerHTML = h;
    $$("#tabela tr[data-t]").forEach(tr => tr.onclick = () => { pausar(); irPara(+tr.dataset.t); $("#mapa").scrollIntoView({ behavior: "smooth", block: "center" }); });
    const fr = $("#filtroReg"); if (fr) fr.oninput = () => { const q = sem(fr.value); $$("#tabela tbody tr").forEach(tr => { tr.hidden = q && !sem(tr.textContent).includes(q); }); };
  }

  /* ------------------------------------------------------------------ exportações */
  const nomeArq = s => (s || "trajeto").replace(/[\\/:*?"<>|]+/g, " ").trim();
  /* download com o nome e a extensão exatos (o baixar do gerador de peças acrescenta .docx) */
  function baixarArquivo(blob, nome) { const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = nome; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 4000); }
  function baixarTexto(txt, nome, tipo) { baixarArquivo(new Blob([txt], { type: tipo }), nome); }
  $("#csv").onclick = () => {
    const l = ["viatura;data_hora;latitude;longitude;endereco;intervalo_s;distancia_m;velocidade_calculada_kmh" + (E.local ? ";distancia_local_m" : "")];
    R.filter(r => r.v.visivel).forEach(r => r.pts.forEach((p, i) => { const s = r.seg[i - 1]; l.push([r.v.nome, fmt(p.t), p.lat, p.lon, '"' + String(p.end || "").replace(/"/g, '""') + '"', s ? Math.round(s.dt / 1000) : "", s ? Math.round(s.d) : "", s && !s.lac ? (Math.round(s.vel * 10) / 10).toString().replace(".", ",") : ""].concat(E.local ? [Math.round(dist(p, E.local))] : []).join(";")); }));
    baixarTexto("﻿" + l.join("\r\n"), "Trajeto GPS - " + nomeArq($("#caso").value) + ".csv", "text/csv;charset=utf-8");
  };
  $("#kml").onclick = () => {
    const xe = s => String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    const kc = c => "ff" + c.slice(5, 7) + c.slice(3, 5) + c.slice(1, 3);
    let k = '<?xml version="1.0" encoding="UTF-8"?>\n<kml xmlns="http://www.opengis.net/kml/2.2" xmlns:gx="http://www.google.com/kml/ext/2.2"><Document><name>' + xe("Trajeto GPS " + ($("#caso").value || "")) + "</name>";
    R.filter(r => r.v.visivel && r.pts.length).forEach((r, i) => {
      k += '<Style id="v' + i + '"><LineStyle><color>' + kc(r.v.cor) + "</color><width>4</width></LineStyle><IconStyle><scale>1.1</scale><Icon><href>https://maps.google.com/mapfiles/kml/shapes/cabs.png</href></Icon></IconStyle></Style>";
      k += "<Folder><name>" + xe(r.v.nome) + "</name><Placemark><name>" + xe(r.v.nome + " (linha do tempo)") + '</name><styleUrl>#v' + i + "</styleUrl><gx:Track>" + r.pts.map(p => "<when>" + iso(p.t) + "-03:00</when>").join("") + r.pts.map(p => "<gx:coord>" + p.lon + " " + p.lat + " 0</gx:coord>").join("") + "</gx:Track></Placemark>";
      k += "<Placemark><name>Trajeto</name><styleUrl>#v" + i + "</styleUrl><LineString><tessellate>1</tessellate><coordinates>" + r.pts.map(p => p.lon + "," + p.lat + ",0").join(" ") + "</coordinates></LineString></Placemark>";
      r.paradas.forEach((p, j) => { k += "<Placemark><name>Parada " + (j + 1) + " · " + dur(p.dur) + "</name><description>" + xe(fmt(p.ini) + " a " + fmt(p.fim) + " · " + p.end) + "</description><TimeSpan><begin>" + iso(p.ini) + "-03:00</begin><end>" + iso(p.fim) + "-03:00</end></TimeSpan><Point><coordinates>" + p.lon + "," + p.lat + ",0</coordinates></Point></Placemark>"; });
      k += "</Folder>";
    });
    if (E.local) k += "<Placemark><name>Local dos fatos</name><description>" + xe(E.local.nome) + "</description><Point><coordinates>" + E.local.lon + "," + E.local.lat + ",0</coordinates></Point></Placemark>";
    k += "</Document></kml>";
    baixarTexto(k, "Trajeto GPS - " + nomeArq($("#caso").value) + ".kml", "application/vnd.google-earth.kml+xml");
  };
  $("#relatorio").onclick = async () => {
    const rs = R.filter(r => r.v.visivel && r.pts.length); if (!rs.length) return;
    const p = par(), b = [{ t: "tit", texto: "ANÁLISE DO TRAJETO DE VIATURA POR GPS" }];
    b.push({ t: "tab", larg: [1.5, 3], linhas: [["Processo ou caso", $("#caso").value.trim() || "não informado"], ["Arquivos analisados", [...new Set(E.fontes.map(f => f.nome))].join("; ")], ["Intervalo analisado", fmt(daInput($("#de").value)) + " a " + fmt(daInput($("#ate").value))], ["Local dos fatos", E.local ? E.local.nome + " (" + E.local.lat.toFixed(6) + ", " + E.local.lon.toFixed(6) + ")" : "não informado"], ["Data e hora dos fatos", E.horaFato != null ? fmt(E.horaFato) : "não informada"]] });
    b.push({ t: "h", texto: "Metodologia" });
    b.push({ t: "p", r: "Os registros de posição do relatório de rastreamento (data, hora, endereço aproximado e coordenadas) foram extraídos do documento juntado aos autos e ordenados cronologicamente. Entre registros consecutivos, calcularam-se a distância em linha reta (fórmula de Haversine) e a velocidade média correspondente. Considerou-se parada a permanência da viatura num raio de " + p.raioParada + " m por pelo menos " + (p.minParada / 60000).toLocaleString("pt-BR") + " min, e lacuna de sinal o intervalo sem registro igual ou superior a " + (p.lacuna / 60000).toLocaleString("pt-BR") + " min. Velocidades acima de 200 km/h com deslocamento superior a 300 m foram tratadas como saltos de posição atribuíveis a erro do GPS." + (E.local ? " As distâncias ao local dos fatos também foram calculadas em linha reta, com raio de referência de " + p.raio + " m." : "") });
    b.push({ t: "p", r: [["Ressalvas técnicas: ", "bo"], ["a velocidade calculada é média entre dois pontos e subestima a real em curvas; o endereço de cada ponto é o informado pelo sistema de rastreamento, por aproximação; os horários são os do relatório, sem conversão de fuso; a exatidão do GPS veicular é tipicamente de alguns metros a algumas dezenas de metros.", "n"]] });
    rs.forEach(r => {
      const v = r.v, m = v.meta;
      b.push({ t: "h", texto: "Viatura " + v.nome });
      b.push({ t: "tab", larg: [2.2, 2.4], linhas: [["Usuário responsável no relatório", m.responsavel || "não informado"], ["Período pedido no relatório", m.inicio != null ? fmt(m.inicio) + " a " + fmt(m.fim) : "não informado"], ["Data de emissão", m.emissao != null ? fmt(m.emissao) : "não informada"], ["Registros no intervalo", String(r.pts.length)], ["Primeiro e último registro", fmt(r.pts[0].t) + " e " + fmt(r.pts[r.pts.length - 1].t)], ["Intervalo usual entre registros", dur(r.mediana)], ["Distância percorrida (linha reta entre pontos)", km(r.total)], ["Tempo em movimento", dur(r.movimento)], ["Tempo parada", dur(r.parado) + " em " + r.paradas.length + " paradas"], ["Tempo sem registro", dur(r.semSinal) + " em " + r.lacunas.length + " lacunas"], ["Velocidade máxima calculada", n1(r.vmax) + " km/h"], ["Registros fora de ordem / duplicados / conflitantes", v.foraOrdem + " / " + v.duplicados + " / " + v.conflitos]] });
      const av = avisos(r); if (av.length) { b.push({ t: "sub", texto: "Pontos de atenção" }); av.forEach(a => b.push({ t: "p", r: a })); }
      if (E.local) {
        b.push({ t: "sub", texto: "Confronto com o local dos fatos" });
        b.push({ t: "p", r: (r.menor ? "A menor distância entre a viatura e o local dos fatos foi de " + km(r.menor.d) + ", em " + fmt(r.menor.p.t) + " (" + (r.menor.p.end || "endereço não informado") + "). " : "") + (r.passagens.length ? "A viatura esteve no raio de " + p.raio + " m em " + r.passagens.length + (r.passagens.length === 1 ? " ocasião." : " ocasiões.") : "A viatura não esteve no raio de " + p.raio + " m do local no intervalo.") });
        if (r.passagens.length) b.push({ t: "tab", cab: ["Entrada", "Saída", "Permanência", "Menor distância"], larg: [1.4, 1.4, 1, 1], linhas: r.passagens.map(x => [fmt(x.ini), fmt(x.fim), dur(x.fim - x.ini), km(x.dmin)]) });
      }
      b.push({ t: "sub", texto: "Paradas" });
      b.push(r.paradas.length ? { t: "tab", cab: ["Nº", "Início", "Fim", "Duração", "Endereço"], larg: [0.4, 1.3, 1, 0.9, 2.6], linhas: r.paradas.map((x, k) => [String(k + 1), fmt(x.ini), hora(x.fim), dur(x.dur) + (x.lacuna ? " (com lacuna)" : ""), x.end]) } : { t: "p", r: "Nenhuma parada com os parâmetros adotados." });
      b.push({ t: "sub", texto: "Lacunas de sinal" });
      b.push(r.lacunas.length ? { t: "tab", cab: ["De", "Até", "Duração", "Deslocamento", "Endereços (antes → depois)"], larg: [1.3, 1.3, 0.9, 0.9, 2.4], linhas: r.lacunas.map(x => [fmt(x.ini), fmt(x.fim), dur(x.dur), km(x.d), (x.a.end || "?") + " → " + (x.b.end || "?")]) } : { t: "p", r: "Não houve intervalo sem registro acima do limite adotado." });
      if (r.rapidos.length || r.saltos.length) { b.push({ t: "sub", texto: "Velocidades e saltos" }); b.push({ t: "tab", cab: ["Ocorrência", "Início", "Fim", "Velocidade"], larg: [1.6, 1.3, 1, 1.2], linhas: r.rapidos.map(x => ["acima de " + p.limVel + " km/h · " + (x.end || ""), fmt(x.ini), hora(x.fim), "até " + n1(x.vmax) + " km/h"]).concat(r.saltos.map(s => ["salto implausível de " + km(s.d), fmt(s.a.t), hora(s.b.t), n1(s.vel) + " km/h"])) }); }
      b.push({ t: "sub", texto: "Registros" + (r.pts.length > 1500 ? " (primeiros 1.500; a íntegra segue na planilha CSV)" : "") });
      b.push({ t: "tab", cab: ["Data e hora", "Endereço", "Coordenadas", "km/h"], larg: [1.2, 2.8, 1.4, 0.6], linhas: r.pts.slice(0, 1500).map((x, i) => { const s = r.seg[i - 1]; return [fmt(x.t), x.end || "", x.lat.toFixed(6) + ", " + x.lon.toFixed(6), s && !s.lac ? n1(s.vel) : ""]; }) });
    });
    b.push({ t: "data", texto: "Belo Horizonte, " + P.dataExtenso(new Date()) + "." });
    try { P.baixar(await P.docx(b), "Analise de GPS - " + nomeArq($("#caso").value || rs.map(r => r.v.nome).join(", "))); } catch (e) { window.HUB.toast(e.message || "Não foi possível gerar o Word.", 5000); }
  };

  /* interface para o gerador de vídeo (video.js) */
  window.GPS = { R, E, posicao, par, fmt, hora, dur, km, n1, dist, rumo, corVel, corTempo, iso, pausar, baixarArquivo, nomeArq: () => nomeArq($("#caso").value || R.filter(r => r.v.visivel).map(r => r.v.nome).join(", ")) };
})();
