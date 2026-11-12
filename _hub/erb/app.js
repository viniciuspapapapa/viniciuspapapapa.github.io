/* Mapa de localização por ERB: leitura da bilhetagem (SheetJS), reconhecimento de colunas, coordenadas (da planilha,
   da relação de ERBs ou pelo endereço via OpenStreetMap), mapa Leaflet com setores e trajeto, intervalo de tempo,
   local dos fatos com distâncias, conferência na base de estações licenciadas da Anatel e relatório em Word. */
(function () {
  "use strict";
  const $ = s => document.querySelector(s), esc = s => window.HUB.esc(s), P = window.TPC_PECA;
  const CFG = (window.HUB_CONFIG && window.HUB_CONFIG.sherlock) || {}, SERV = (CFG.url || "https://sherlock-tpc.viniciuspapapapa.workers.dev").replace(/\/+$/, "");
  const H = CFG.token ? { "X-App-Token": CFG.token } : {};
  const E = { arqs: [], ev: [], erbs: new Map(), filtro: [], local: null, anatel: new Map(), proximas: [] };
  const sem = s => String(s == null ? "" : s).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
  const dhbr = d => d ? d.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "medium" }) : "";
  function lib(url, cdn, ok) { if (ok()) return Promise.resolve(); return new Promise((res, rej) => { const t = i => { const u = [new URL(url, location.href).href, cdn][i]; if (!u) return rej(new Error("Biblioteca indisponível.")); const s = document.createElement("script"); s.src = u; s.onload = () => ok() ? res() : t(i + 1); s.onerror = () => { s.remove(); t(i + 1); }; document.head.appendChild(s); }; t(0); }); }
  const xlsx = () => lib("../vendor/xlsx/xlsx.full.min.js", "https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js", () => typeof XLSX !== "undefined");
  const leaflet = () => lib("../vendor/leaflet/leaflet.js", "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.js", () => typeof L !== "undefined");
  function prog(f) { $("#barra").hidden = f == null; if (f != null) $("#barra i").style.width = Math.round(f * 100) + "%"; }

  /* ------------------------------------------------------------------ leitura */
  const zona = $("#zona");
  ["dragenter", "dragover"].forEach(ev => zona.addEventListener(ev, e => { e.preventDefault(); zona.classList.add("sobre"); }));
  ["dragleave", "drop"].forEach(ev => zona.addEventListener(ev, e => { e.preventDefault(); zona.classList.remove("sobre"); }));
  zona.addEventListener("drop", e => adicionar([...e.dataTransfer.files]));
  $("#arquivo").addEventListener("change", e => { adicionar([...e.target.files]); e.target.value = ""; });
  function decodificar(buf) { const u = new Uint8Array(buf); try { return new TextDecoder("utf-8", { fatal: true }).decode(u); } catch (e) { return new TextDecoder("windows-1252").decode(u); } }
  function tabelaTexto(txt) {
    const ls = txt.replace(/^﻿/, "").split(/\r?\n/).filter(l => l.trim()), am = ls.slice(0, 20).join("\n"), cont = c => (am.match(new RegExp("\\" + c, "g")) || []).length;
    const sep = ["\t", ";", "|", ","].sort((a, b) => cont(b) - cont(a))[0];
    return ls.map(l => { const o = []; let c = "", q = false; for (let i = 0; i < l.length; i++) { const ch = l[i]; if (q) { if (ch === '"') { if (l[i + 1] === '"') { c += '"'; i++; } else q = false; } else c += ch; } else if (ch === '"') q = true; else if (ch === sep) { o.push(c.trim()); c = ""; } else c += ch; } o.push(c.trim()); return o; });
  }
  async function adicionar(files) {
    for (const f of files) {
      try {
        const buf = await f.arrayBuffer(); let linhas;
        if (/\.(xlsx|xls|ods)$/i.test(f.name)) { await xlsx(); const wb = XLSX.read(buf, { type: "array", cellDates: true }); linhas = []; wb.SheetNames.forEach(sn => { const a = XLSX.utils.sheet_to_json(wb.Sheets[sn], { header: 1, raw: true, defval: "" }); if (a.length > linhas.length) linhas = a; }); }
        else linhas = tabelaTexto(decodificar(buf));
        linhas = linhas.filter(l => l.some(c => String(c).trim() !== "")); if (!linhas.length) continue;
        let hi = 0; for (let i = 0; i < Math.min(linhas.length, 20); i++) { const t = linhas[i].map(sem).join("|"); if (/(data|hora|erb|cgi|celula|cell|antena|latitude|azimute|endereco)/.test(t)) { hi = i; break; } }
        const cab = linhas[hi].map((c, i) => String(c || "Coluna " + (i + 1)).trim());
        E.arqs.push({ nome: f.name, cab, dados: linhas.slice(hi + 1), mapa: mapear(cab) });
      } catch (e) { window.HUB.toast("Não foi possível ler " + f.name + ": " + (e.message || e), 5000); }
    }
    $("#estado").textContent = E.arqs.length + (E.arqs.length === 1 ? " arquivo" : " arquivos") + " · " + E.arqs.reduce((s, a) => s + a.dados.length, 0).toLocaleString("pt-BR") + " linhas.";
    desenharMapas();
  }
  const PAPEIS = [["", "(ignorar)"], ["datahora", "Data e hora"], ["data", "Data"], ["hora", "Hora"], ["tipo", "Tipo (voz, SMS, dados)"], ["origem", "Número de origem (A)"], ["destino", "Número de destino (B)"], ["duracao", "Duração"], ["erb", "ERB (CGI, célula ou código)"], ["endereco", "Endereço da ERB"], ["municipio", "Município da ERB"], ["uf", "UF da ERB"], ["lat", "Latitude"], ["lon", "Longitude"], ["azimute", "Azimute"], ["operadora", "Operadora"]];
  function mapear(cab) {
    const m = cab.map(() => ""), us = new Set(), r = (p, re, nao) => cab.forEach((c, i) => { const s = sem(c); if (!m[i] && !us.has(p) && re.test(s) && !(nao && nao.test(s))) { m[i] = p; us.add(p); } });
    r("lat", /^lat|latitude/); r("lon", /^lon|^lng|longitude/); r("azimute", /azimute|azimuth|^az$/);
    r("datahora", /(data.*hora|hora.*data|timestamp|inicio.*(chamada|evento|conexao)|data_hora)/); r("data", /^data|^dt/); r("hora", /^hora|^hr/);
    r("duracao", /dura|tempo/); r("tipo", /(tipo|servico|evento)/, /tecno/);
    r("origem", /(origem|chamador|numero a|^a$|msisdn|originador|linha)/); r("destino", /(destino|chamado|numero b|^b$|terminador)/);
    r("erb", /(cgi|erb|celula|cell|^ci$|eci|site|estacao|antena|torre)/, /(endereco|munic|bairro|cidade|lat|lon|azim)/);
    r("endereco", /(endereco|logradouro|local.*erb|end\.? ?erb)/); r("municipio", /(municip|cidade)/); r("uf", /^uf$|estado/); r("operadora", /operadora|prestadora/);
    return m;
  }
  function desenharMapas() {
    $("#mapBloco").hidden = !E.arqs.length;
    $("#mapas").innerHTML = E.arqs.map((a, ai) => '<details' + (ai === 0 ? " open" : "") + ' style="margin-top:8px"><summary><b>' + esc(a.nome) + "</b> · " + a.dados.length.toLocaleString("pt-BR") + ' linhas</summary><div class="mapa-col">' + a.cab.map((c, ci) => '<label class="campo">' + esc(c) + ' <span class="mudo">(ex.: ' + esc(String((a.dados.find(l => String(l[ci] || "").trim()) || [])[ci] || "").slice(0, 22)) + ')</span><select data-a="' + ai + '" data-c="' + ci + '">' + PAPEIS.map(([k, t]) => '<option value="' + k + '"' + (a.mapa[ci] === k ? " selected" : "") + ">" + t + "</option>").join("") + "</select></label>").join("") + "</div></details>").join("");
    document.querySelectorAll("#mapas select").forEach(s => s.onchange = () => { E.arqs[+s.dataset.a].mapa[+s.dataset.c] = s.value; });
  }

  /* ------------------------------------------------------------------ normalização */
  function coord(v, eixo) {
    if (typeof v === "number") return v; const s = String(v || "").trim().replace(",", "."); if (!s) return NaN;
    const dms = s.match(/(-?\d+(?:\.\d+)?)\D+(\d+(?:\.\d+)?)\D+(\d+(?:\.\d+)?)\D*([NSEWLO])?/i);
    if (dms && !/^-?\d+\.\d+$/.test(s)) { let x = Math.abs(+dms[1]) + +dms[2] / 60 + +dms[3] / 3600; if (+dms[1] < 0 || /[SWO]/i.test(dms[4] || "")) x = -x; return x; }
    let n = parseFloat(s); if (isNaN(n)) return NaN;
    if (Math.abs(n) > 180) n = n / Math.pow(10, String(Math.trunc(Math.abs(n))).length - (eixo === "lat" ? 2 : 2)); /* coordenadas sem separador decimal */
    return n;
  }
  function dataHora(d, h) {
    let base = null;
    if (d instanceof Date && !isNaN(d)) base = new Date(d);
    else if (typeof d === "number" && d > 20000) base = new Date(Math.round((d - 25569) * 86400000) + new Date().getTimezoneOffset() * 60000);
    else { const s = String(d || "").trim(); let m; if ((m = s.match(/(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{2,4})(?:\D+(\d{1,2}):(\d{2})(?::(\d{2}))?)?/))) base = new Date(+m[3] < 100 ? 2000 + +m[3] : +m[3], +m[2] - 1, +m[1], +(m[4] || 0), +(m[5] || 0), +(m[6] || 0)); else if ((m = s.match(/(\d{4})-(\d{2})-(\d{2})(?:[T\s](\d{2}):(\d{2})(?::(\d{2}))?)?/))) base = new Date(+m[1], +m[2] - 1, +m[3], +(m[4] || 0), +(m[5] || 0), +(m[6] || 0)); }
    if (!base) return null;
    if (h != null && h !== "") { if (h instanceof Date) base.setHours(h.getHours(), h.getMinutes(), h.getSeconds()); else if (typeof h === "number" && h < 1) { const s = Math.round(h * 86400); base.setHours(Math.floor(s / 3600), Math.floor(s / 60) % 60, s % 60); } else { const m = String(h).match(/(\d{1,2}):(\d{2})(?::(\d{2}))?/); if (m) base.setHours(+m[1], +m[2], +(m[3] || 0)); } }
    return base;
  }
  const chaveErb = (id, end, lat, lon) => id ? "id:" + sem(id) : !isNaN(lat) ? "ll:" + lat.toFixed(5) + "," + lon.toFixed(5) : "end:" + sem(end);
  function montar() {
    const ev = [], ref = new Map(); /* relação de ERBs: id -> coordenadas */
    E.arqs.forEach(a => { const m = a.mapa, ix = k => m.indexOf(k); if (ix("erb") >= 0 && ix("lat") >= 0 && ix("datahora") < 0 && ix("data") < 0) a.dados.forEach(l => { const lat = coord(l[ix("lat")], "lat"), lon = coord(l[ix("lon")], "lon"); if (!isNaN(lat) && !isNaN(lon)) ref.set(sem(l[ix("erb")]), { lat, lon, az: ix("azimute") >= 0 ? +String(l[ix("azimute")]).replace(",", ".") : NaN, end: ix("endereco") >= 0 ? l[ix("endereco")] : "" }); }); });
    E.erbs = new Map();
    E.arqs.forEach(a => {
      const m = a.mapa, ix = k => m.indexOf(k), g = (l, k) => ix(k) >= 0 ? l[ix(k)] : "";
      if (ix("datahora") < 0 && ix("data") < 0) return;
      for (const l of a.dados) {
        const quando = ix("datahora") >= 0 ? dataHora(g(l, "datahora")) : dataHora(g(l, "data"), g(l, "hora")); if (!quando) continue;
        const id = String(g(l, "erb") || "").trim(), r = ref.get(sem(id)) || {};
        let lat = coord(g(l, "lat"), "lat"), lon = coord(g(l, "lon"), "lon"); if ((isNaN(lat) || isNaN(lon)) && r.lat != null) { lat = r.lat; lon = r.lon; }
        const end = [g(l, "endereco") || r.end, g(l, "municipio"), g(l, "uf")].map(x => String(x || "").trim()).filter(Boolean).join(", ");
        const az = !isNaN(+String(g(l, "azimute")).replace(",", ".")) && String(g(l, "azimute")).trim() !== "" ? +String(g(l, "azimute")).replace(",", ".") : r.az;
        if (!id && !end && isNaN(lat)) continue;
        const k = chaveErb(id, end, lat, lon);
        let e = E.erbs.get(k); if (!e) { e = { k, id, end, lat, lon, az: new Set(), uf: String(g(l, "uf") || "").trim().toUpperCase().slice(0, 2), operadora: String(g(l, "operadora") || "").trim(), n: 0, ini: quando, fim: quando }; E.erbs.set(k, e); }
        if (!isNaN(az)) e.az.add(az); if (isNaN(e.lat) && !isNaN(lat)) { e.lat = lat; e.lon = lon; } e.n++; if (quando < e.ini) e.ini = quando; if (quando > e.fim) e.fim = quando;
        ev.push({ quando, erb: k, tipo: String(g(l, "tipo") || "").trim(), a: String(g(l, "origem") || "").trim(), b: String(g(l, "destino") || "").trim(), dur: String(g(l, "duracao") || "").trim() });
      }
    });
    return ev.sort((x, y) => x.quando - y.quando);
  }
  async function geocodificar() {
    const faltam = [...E.erbs.values()].filter(e => isNaN(e.lat) && e.end).slice(0, 80); let n = 0;
    for (const e of faltam) {
      prog(n / Math.max(1, faltam.length)); $("#estado").textContent = "Localizando endereços de ERBs pelo OpenStreetMap: " + (n + 1) + " de " + faltam.length + "…";
      try { const r = await fetch(SERV + "/erb/geo?q=" + encodeURIComponent(e.end + (e.uf || /,\s*[A-Z]{2}$/.test(e.end) ? "" : ", " + $("#uf").value)), { headers: H }); const d = await r.json(); if (d.encontrado) { e.lat = d.lat; e.lon = d.lon; e.geo = true; } } catch (x) { /* segue */ }
      n++;
    }
    prog(null);
  }

  /* ------------------------------------------------------------------ mapa */
  let MAPA = null, CAMADA = null;
  const R = 6371, rad = x => x * Math.PI / 180;
  const dist = (a, b, c, d) => { const x = Math.sin(rad(c - a) / 2) ** 2 + Math.cos(rad(a)) * Math.cos(rad(c)) * Math.sin(rad(d - b) / 2) ** 2; return 2 * R * Math.asin(Math.sqrt(x)); };
  function setor(lat, lon, az, km) { const pts = [[lat, lon]]; for (let a = az - 60; a <= az + 60; a += 10) { const b = rad(a), d = km / R, la = rad(lat), lo = rad(lon); const la2 = Math.asin(Math.sin(la) * Math.cos(d) + Math.cos(la) * Math.sin(d) * Math.cos(b)), lo2 = lo + Math.atan2(Math.sin(b) * Math.sin(d) * Math.cos(la), Math.cos(d) - Math.sin(la) * Math.sin(la2)); pts.push([la2 * 180 / Math.PI, lo2 * 180 / Math.PI]); } pts.push([lat, lon]); return pts; }
  $("#mapear").onclick = async () => {
    E.ev = montar();
    if (!E.ev.length) { window.HUB.toast("Nenhum registro reconhecido: indique ao menos a data e hora e a ERB ou o endereço.", 5000); return; }
    $("#mapear").disabled = true; await geocodificar(); $("#mapear").disabled = false;
    const ini = E.ev[0].quando, fim = E.ev[E.ev.length - 1].quando, loc = d => new Date(d - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
    $("#de").value = loc(ini); $("#ate").value = loc(fim);
    $("#estado").textContent = E.ev.length.toLocaleString("pt-BR") + " registros · " + E.erbs.size + " ERBs distintas · " + [...E.erbs.values()].filter(e => isNaN(e.lat)).length + " sem coordenadas.";
    $("#resBloco").hidden = false; await leaflet();
    if (!MAPA) { MAPA = L.map("mapa"); L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19, attribution: "© OpenStreetMap" }).addTo(MAPA); }
    await aplicar(); $("#resBloco").scrollIntoView({ behavior: "smooth", block: "start" });
  };
  async function localDosFatos() {
    const s = $("#local").value.trim(); if (!s) return null;
    const m = s.match(/^\s*(-?\d+[.,]\d+)\s*[,;\s]\s*(-?\d+[.,]\d+)\s*$/); if (m) return { lat: +m[1].replace(",", "."), lon: +m[2].replace(",", "."), nome: s };
    if (E.local && E.local.q === s) return E.local;
    const r = await fetch(SERV + "/erb/geo?q=" + encodeURIComponent(s), { headers: H }); const d = await r.json().catch(() => ({}));
    if (!d.encontrado) { window.HUB.toast("Endereço do local dos fatos não encontrado; informe latitude e longitude.", 5000); return null; }
    return { lat: d.lat, lon: d.lon, nome: d.nome, q: s };
  }
  async function aplicar() {
    const de = $("#de").value ? new Date($("#de").value) : null, ate = $("#ate").value ? new Date($("#ate").value) : null;
    E.filtro = E.ev.filter(x => (!de || x.quando >= de) && (!ate || x.quando <= ate));
    E.local = await localDosFatos().catch(() => null);
    const km = +$("#raio").value || 1; if (CAMADA) CAMADA.remove(); CAMADA = L.layerGroup().addTo(MAPA);
    const usados = new Map(); E.filtro.forEach(x => usados.set(x.erb, (usados.get(x.erb) || 0) + 1));
    const pontos = [];
    for (const [k, n] of usados) {
      const e = E.erbs.get(k); if (!e || isNaN(e.lat)) continue; pontos.push([e.lat, e.lon]);
      if ($("#setores").checked) [...e.az].forEach(az => L.polygon(setor(e.lat, e.lon, az, km), { color: "#EB6834", weight: 1, fillOpacity: 0.12 }).addTo(CAMADA));
      const a = E.anatel.get(k);
      L.circleMarker([e.lat, e.lon], { radius: 6 + Math.min(14, Math.sqrt(n) * 2), color: "#2B2B2B", weight: 2, fillColor: "#E8E347", fillOpacity: 0.9 }).bindPopup("<b>" + esc(e.id || "ERB") + "</b><br>" + esc(e.end || "") + "<br>" + n + (n === 1 ? " registro" : " registros") + " no intervalo<br>" + esc(dhbr(e.ini)) + " a " + esc(dhbr(e.fim)) + (e.az.size ? "<br>Azimutes: " + [...e.az].join("°, ") + "°" : "") + (e.geo ? "<br><i>Posição pelo endereço (OpenStreetMap)</i>" : "") + (a && a.estacao ? "<br>Anatel: estação " + esc(a.estacao.estacao) + " (" + esc(a.estacao.operadora) + "), a " + Math.round(a.d * 1000) + " m" : "")).addTo(CAMADA);
    }
    if ($("#trajeto").checked) { const seq = []; E.filtro.forEach(x => { const e = E.erbs.get(x.erb); if (e && !isNaN(e.lat)) { const p = [e.lat, e.lon]; const u = seq[seq.length - 1]; if (!u || u[0] !== p[0] || u[1] !== p[1]) seq.push(p); } }); if (seq.length > 1) L.polyline(seq, { color: "#2A78D6", weight: 2, opacity: 0.7, dashArray: "6 6" }).addTo(CAMADA); }
    E.proximas.forEach(s => L.circleMarker([s.lat, s.lon], { radius: 4, color: "#8A8A8A", weight: 1, fillColor: "#B8B8B8", fillOpacity: 0.8 }).bindPopup("Estação licenciada " + esc(s.estacao) + "<br>" + esc(s.operadora) + "<br>" + esc(s.endereco) + "<br>" + esc(s.tecnologias.join(", "))).addTo(CAMADA));
    if (E.local) { L.circleMarker([E.local.lat, E.local.lon], { radius: 9, color: "#D03B3B", weight: 3, fillColor: "#D03B3B", fillOpacity: 0.5 }).bindPopup("<b>Local dos fatos</b><br>" + esc(E.local.nome)).addTo(CAMADA); L.circle([E.local.lat, E.local.lon], { radius: 2000, color: "#D03B3B", weight: 1, fill: false, dashArray: "4 4" }).addTo(CAMADA); pontos.push([E.local.lat, E.local.lon]); }
    if (pontos.length) MAPA.fitBounds(pontos, { padding: [30, 30], maxZoom: 15 }); else MAPA.setView([-19.92, -43.94], 11);
    setTimeout(() => MAPA.invalidateSize(), 50);
    resumo();
  }
  $("#filtrar").onclick = () => aplicar().catch(e => window.HUB.toast(e.message || String(e), 5000));
  ["#trajeto", "#setores"].forEach(s => $(s).addEventListener("change", () => aplicar()));

  function linhasEventos() {
    return E.filtro.map(x => { const e = E.erbs.get(x.erb) || {}; const d = E.local && !isNaN(e.lat) ? dist(e.lat, e.lon, E.local.lat, E.local.lon) : NaN; return { x, e, d }; });
  }
  function resumo() {
    const ls = linhasEventos(), com = ls.filter(l => !isNaN(l.d)), min = com.length ? Math.min(...com.map(l => l.d)) : NaN, perto = com.filter(l => l.d <= 2).length;
    let h = '<div class="kpis"><div class="kpi"><small>Registros no intervalo</small><b>' + ls.length.toLocaleString("pt-BR") + '</b></div><div class="kpi"><small>ERBs usadas</small><b>' + new Set(ls.map(l => l.x.erb)).size + "</b></div>";
    if (E.local) h += '<div class="kpi' + (min > 5 ? " alerta" : "") + '"><small>Menor distância ao local dos fatos</small><b>' + (isNaN(min) ? "—" : min.toFixed(2).replace(".", ",") + " km") + '</b></div><div class="kpi"><small>Registros a até 2 km do local</small><b>' + perto + " de " + com.length + "</b></div>";
    h += "</div>";
    if (E.local && com.length) h += '<p class="aviso">' + (min > 5 ? "No intervalo escolhido, nenhuma antena usada pelo aparelho fica a menos de " + min.toFixed(1).replace(".", ",") + " km do local dos fatos, o que é incompatível com a presença do aparelho no local, salvo em zona rural de cobertura extensa." : min <= 2 ? "Há registros em antenas a até 2 km do local dos fatos no intervalo: a presença do aparelho na região é compatível com os dados, ainda que a ERB não indique a posição exata." : "As antenas usadas ficam entre 2 e 5 km do local dos fatos: resultado inconclusivo, que depende da cobertura real das antenas na região.") + "</p>";
    $("#resumo").innerHTML = h;
    const erbs = [...new Set(ls.map(l => l.x.erb))].map(k => E.erbs.get(k));
    $("#tabelas").innerHTML = "<h3 style=\"font-size:17px;margin:18px 0 4px\">ERBs no intervalo</h3><div class=\"rolagem\"><table class=\"t\"><thead><tr><th>ERB</th><th>Endereço</th><th>Registros</th><th>Primeiro e último uso</th><th>Azimutes</th>" + (E.local ? "<th>Distância ao local</th>" : "") + "<th>Anatel</th></tr></thead><tbody>" +
      erbs.map(e => { const a = E.anatel.get(e.k), d = E.local && !isNaN(e.lat) ? dist(e.lat, e.lon, E.local.lat, E.local.lon) : NaN; return "<tr><td>" + esc(e.id) + "</td><td>" + esc(e.end) + (e.geo ? " <span class=\"mudo\">(posição pelo endereço)</span>" : "") + '</td><td class="n">' + ls.filter(l => l.x.erb === e.k).length + "</td><td>" + esc(dhbr(e.ini)) + " a " + esc(dhbr(e.fim)) + "</td><td>" + [...e.az].join("°, ") + (e.az.size ? "°" : "") + "</td>" + (E.local ? '<td class="n">' + (isNaN(d) ? "—" : d.toFixed(2).replace(".", ",") + " km") + "</td>" : "") + "<td>" + (a ? (a.estacao ? "estação " + esc(a.estacao.estacao) + " · " + esc(a.estacao.operadora) + " · a " + Math.round(a.d * 1000) + " m · " + esc(a.estacao.tecnologias.join("/")) : esc(a.erro || "sem estação licenciada no raio")) : "") + "</td></tr>"; }).join("") + "</tbody></table></div>" +
      "<h3 style=\"font-size:17px;margin:18px 0 4px\">Registros no intervalo</h3><div class=\"rolagem\"><table class=\"t\"><thead><tr><th>Data e hora</th><th>Tipo</th><th>Origem</th><th>Destino</th><th>Duração</th><th>ERB</th>" + (E.local ? "<th>Distância</th>" : "") + "</tr></thead><tbody>" +
      ls.slice(0, 2000).map(l => "<tr><td>" + esc(dhbr(l.x.quando)) + "</td><td>" + esc(l.x.tipo) + "</td><td>" + esc(l.x.a) + "</td><td>" + esc(l.x.b) + "</td><td>" + esc(l.x.dur) + "</td><td>" + esc(l.e.id || l.e.end || "") + "</td>" + (E.local ? '<td class="n">' + (isNaN(l.d) ? "—" : l.d.toFixed(2).replace(".", ",") + " km") + "</td>" : "") + "</tr>").join("") + "</tbody></table></div>";
  }

  /* ------------------------------------------------------------------ Anatel */
  const OPER = s => sem(s).replace(/telefonica|vivo/, "vivo").replace(/^tim.*/, "tim").replace(/^claro.*/, "claro").replace(/^oi.*|telemar/, "oi");
  $("#anatel").onclick = async () => {
    const lista = [...new Set(E.filtro.map(x => x.erb))].map(k => E.erbs.get(k)).filter(e => e && !isNaN(e.lat)).slice(0, 25);
    $("#anatel").disabled = true; let n = 0;
    for (const e of lista) {
      prog(n / (lista.length + 1)); $("#estado").textContent = "Consultando a Anatel: ERB " + (n + 1) + " de " + lista.length + "…";
      try {
        const r = await fetch(SERV + "/erb/anatel?lat=" + e.lat + "&lon=" + e.lon + "&raio=0.5&uf=" + (e.uf || $("#uf").value), { headers: H }); const d = await r.json();
        if (!r.ok) throw new Error(d.erro || "HTTP " + r.status);
        const cand = (d.estacoes || []).map(s => ({ s, d: dist(e.lat, e.lon, s.lat, s.lon) })).sort((a, b) => a.d - b.d);
        const mesma = e.operadora ? cand.find(c => OPER(c.s.operadora) === OPER(e.operadora)) : null, melhor = mesma || cand[0];
        E.anatel.set(e.k, melhor ? { estacao: melhor.s, d: melhor.d, todas: cand.length } : { erro: "nenhuma estação licenciada a até 500 m" });
      } catch (x) { E.anatel.set(e.k, { erro: x.message || String(x) }); }
      n++;
    }
    if (E.local) {
      $("#estado").textContent = "Consultando as estações licenciadas ao redor do local dos fatos…";
      try { const r = await fetch(SERV + "/erb/anatel?lat=" + E.local.lat + "&lon=" + E.local.lon + "&raio=2&uf=" + $("#uf").value, { headers: H }); const d = await r.json(); E.proximas = d.estacoes || []; } catch (x) { E.proximas = []; }
    }
    prog(null); $("#anatel").disabled = false; $("#estado").textContent = "Conferência na Anatel concluída" + (E.local ? "; " + E.proximas.length + " estações licenciadas a até 2 km do local dos fatos (pontos cinza no mapa)." : ".");
    aplicar();
  };

  /* ------------------------------------------------------------------ relatório */
  $("#relatorio").onclick = async () => {
    if (!E.filtro.length) return;
    const ls = linhasEventos(), erbs = [...new Set(ls.map(l => l.x.erb))].map(k => E.erbs.get(k)), com = ls.filter(l => !isNaN(l.d)), min = com.length ? Math.min(...com.map(l => l.d)) : NaN;
    const b = [{ t: "tit", texto: "ANÁLISE DE LOCALIZAÇÃO POR ESTAÇÃO RÁDIO BASE" }];
    b.push({ t: "tab", larg: [1.4, 3], linhas: [["Processo ou caso", $("#caso").value.trim() || "não informado"], ["Linha analisada", $("#linha").value.trim() || "não informada"], ["Arquivos", E.arqs.map(a => a.nome).join("; ")], ["Intervalo analisado", ($("#de").value || "").replace("T", " ") + " a " + ($("#ate").value || "").replace("T", " ")], ["Local dos fatos", E.local ? E.local.nome + " (" + E.local.lat.toFixed(5) + ", " + E.local.lon.toFixed(5) + ")" : "não informado"]] });
    b.push({ t: "h", texto: "Metodologia" });
    b.push({ t: "p", r: "Os registros de bilhetagem entregues pela operadora foram consolidados por estação rádio base (ERB). As coordenadas vieram da própria planilha ou, na falta, foram obtidas pelo endereço da ERB no OpenStreetMap. As ERBs foram conferidas na consulta pública de licenciamento de estações da Anatel (Serviço Móvel Pessoal), buscando a estação licenciada mais próxima da mesma operadora. As distâncias ao local dos fatos foram calculadas em linha reta." });
    b.push({ t: "p", r: [["Ressalva técnica: ", "bo"], ["a ERB identifica a antena que atendeu o aparelho, e não a sua posição exata. A área de cobertura varia de centenas de metros a dezenas de quilômetros conforme a região, e o aparelho nem sempre se conecta à antena mais próxima.", "n"]] });
    b.push({ t: "h", texto: "Resultados" });
    b.push({ t: "tab", larg: [2, 2.6], linhas: [["Registros no intervalo", String(ls.length)], ["ERBs utilizadas", String(erbs.length)]].concat(E.local ? [["Menor distância de ERB ao local dos fatos", isNaN(min) ? "—" : min.toFixed(2).replace(".", ",") + " km"], ["Registros em ERBs a até 2 km do local", com.filter(l => l.d <= 2).length + " de " + com.length]] : []) });
    b.push({ t: "sub", texto: "ERBs utilizadas" });
    b.push({ t: "tab", cab: ["ERB e endereço", "Uso", "Distância", "Anatel"], larg: [2.2, 1.4, 0.8, 1.8], linhas: erbs.map(e => { const a = E.anatel.get(e.k), d = E.local && !isNaN(e.lat) ? dist(e.lat, e.lon, E.local.lat, E.local.lon) : NaN; return [(e.id ? e.id + " · " : "") + (e.end || ""), dhbr(e.ini) + " a " + dhbr(e.fim), isNaN(d) ? "—" : d.toFixed(2).replace(".", ",") + " km", a ? (a.estacao ? "Estação " + a.estacao.estacao + ", " + a.estacao.operadora + ", a " + Math.round(a.d * 1000) + " m; " + a.estacao.endereco : a.erro || "") : "não conferida"]; }) });
    b.push({ t: "sub", texto: "Registros" });
    b.push({ t: "tab", cab: ["Data e hora", "Tipo", "Origem e destino", "ERB", "Distância"], larg: [1.3, 0.8, 1.6, 1.8, 0.8], linhas: ls.slice(0, 400).map(l => [dhbr(l.x.quando), l.x.tipo, [l.x.a, l.x.b].filter(Boolean).join(" → "), l.e.id || l.e.end || "", isNaN(l.d) ? "—" : l.d.toFixed(2).replace(".", ",") + " km"]) });
    b.push({ t: "data", texto: "Belo Horizonte, " + P.dataExtenso(new Date()) + "." });
    try { P.baixar(await P.docx(b), "Analise de ERB - " + ($("#caso").value.trim() || "caso").replace(/[\\/:*?"<>|]+/g, " ")); } catch (e) { window.HUB.toast(e.message || "Não foi possível gerar o Word.", 5000); }
  };
})();
