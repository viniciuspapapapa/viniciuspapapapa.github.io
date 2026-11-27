/* Vídeo da movimentação das viaturas: desenha cada quadro num canvas (mapa em blocos do OpenStreetMap ou da Esri,
   trajeto percorrido, paradas, local dos fatos, viaturas com direção, relógio, situação e linha do tempo) e codifica
   em MP4 (H.264) pelo WebCodecs com o mp4-muxer, quadro a quadro, sem depender do tempo real. Sem WebCodecs, grava
   em tempo real pelo MediaRecorder. Tudo roda no navegador; só os blocos do mapa são baixados. */
(function () {
  "use strict";
  const $ = s => document.querySelector(s), G = () => window.GPS, esc = s => window.HUB.esc(s);
  const FPS = 30, TILE = 256, FONTE = "'Red Hat Text', 'Segoe UI', Arial, sans-serif", MONO = "'Red Hat Mono', Consolas, monospace";
  const URLS = { ruas: (z, x, y) => "https://tile.openstreetmap.org/" + z + "/" + x + "/" + y + ".png", sat: (z, x, y) => "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/" + z + "/" + y + "/" + x };
  const ATRIB = { ruas: "Mapa © colaboradores do OpenStreetMap", sat: "Imagem © Esri, Maxar, Earthstar Geographics" };
  function lib(url, cdn, ok) { if (ok()) return Promise.resolve(); return new Promise((res, rej) => { const t = i => { const u = [new URL(url, location.href).href, cdn][i]; if (!u) return rej(new Error("Não foi possível carregar o gerador de vídeo.")); const s = document.createElement("script"); s.src = u; s.onload = () => ok() ? res() : t(i + 1); s.onerror = () => { s.remove(); t(i + 1); }; document.head.appendChild(s); }; t(0); }); }
  const muxerLib = () => lib("../vendor/mp4-muxer/mp4-muxer.js", "https://cdn.jsdelivr.net/npm/mp4-muxer@5.2.2/build/mp4-muxer.js", () => typeof Mp4Muxer !== "undefined");
  const espera = ms => new Promise(r => setTimeout(r, ms));
  let CANCELAR = false, GERANDO = false;

  /* ------------------------------------------------------------------ painel */
  $("#videoBtn").onclick = () => { const p = $("#videoPainel"); p.hidden = !p.hidden; $("#videoBtn").setAttribute("aria-expanded", String(!p.hidden)); if (!p.hidden) { preencher(); p.scrollIntoView({ behavior: "smooth", block: "nearest" }); } };
  function visiveis() { return G().R.filter(r => r.v.visivel && r.pts.length); }
  function preencher() { const rs = visiveis(), atual = $("#vVeic").value; $("#vVeic").innerHTML = rs.map((r, i) => '<option value="' + i + '">' + esc(r.v.nome) + "</option>").join(""); if (atual && +atual < rs.length) $("#vVeic").value = atual; alternar(); }
  function alternar() { const s = $("#vEnq").value === "seguir"; $("#vZoomCampo").hidden = !s; $("#vVeicCampo").hidden = !s || visiveis().length < 2; }
  $("#vEnq").onchange = alternar;
  $("#vCancelar").onclick = () => { CANCELAR = true; };
  function barra(f, txt) { $("#vBarra").hidden = f == null; if (f != null) $("#vBarra i").style.width = Math.round(f * 100) + "%"; if (txt != null) $("#vEstado").textContent = txt; }

  /* ------------------------------------------------------------------ geometria */
  const mundo = (lat, lon, z) => { const s = TILE * Math.pow(2, z), sn = Math.sin(lat * Math.PI / 180); return [(lon + 180) / 360 * s, (0.5 - Math.log((1 + sn) / (1 - sn)) / (4 * Math.PI)) * s]; };
  /* mapeamento do tempo do vídeo para o tempo do relatório; com aceleração, paradas e lacunas passam mais depressa */
  function mapaTempo(rs, T0, T1, acel) {
    const passo = Math.max(2000, (T1 - T0) / 6000), ts = [T0], cum = [0];
    for (let t = T0; t < T1;) { const t2 = Math.min(T1, t + passo), meio = (t + t2) / 2; const w = !acel ? 1 : rs.some(r => { const p = G().posicao(r, meio); return p && p.estado === "movimento"; }) ? 1 : 0.07; cum.push(cum[cum.length - 1] + (t2 - t) * w); ts.push(t2); t = t2; }
    const tot = cum[cum.length - 1] || 1;
    return f => { const alvo = Math.max(0, Math.min(1, f)) * tot; let lo = 0, hi = cum.length - 1; while (hi - lo > 1) { const m = (lo + hi) >> 1; if (cum[m] <= alvo) lo = m; else hi = m; } const d = cum[hi] - cum[lo]; return ts[lo] + (ts[hi] - ts[lo]) * (d > 0 ? (alvo - cum[lo]) / d : 0); };
  }

  /* ------------------------------------------------------------------ plano do vídeo */
  function planejar() {
    const g = G(), rs = visiveis(); if (!rs.length) throw new Error("Nenhuma viatura visível no intervalo.");
    const [W, H] = $("#vRes").value.split("x").map(Number), u = H / 720, seguir = $("#vEnq").value === "seguir";
    const T0 = Math.min(...rs.map(r => r.pts[0].t)), T1 = Math.max(...rs.map(r => r.pts[r.pts.length - 1].t));
    const nMain = (+$("#vDur").value || 60) * FPS, holdIni = Math.round(2.5 * FPS), holdFim = 3 * FPS, N = holdIni + nMain + holdFim;
    const tempoDe = mapaTempo(rs, T0, T1, $("#vAcel").checked);
    const tempos = new Float64Array(N); for (let i = 0; i < N; i++) tempos[i] = i < holdIni ? T0 : i >= holdIni + nMain ? T1 : tempoDe((i - holdIni) / Math.max(1, nMain - 1));
    const barH = Math.round((34 + 14 * Math.min(rs.length, 3)) * u), topoH = Math.round((70 + 46 * rs.length) * u);
    const area = { x0: 70 * u, x1: W - 190 * u, y0: topoH + 30 * u, y1: H - barH - 60 * u };
    const ox = (area.x0 + area.x1) / 2, oy = (area.y0 + area.y1) / 2;
    let z, k = 1; const cams = [];
    if (!seguir) {
      const lats = [], lons = []; rs.forEach(r => r.pts.forEach(p => { lats.push(p.lat); lons.push(p.lon); })); if (g.E.local) { lats.push(g.E.local.lat); lons.push(g.E.local.lon); }
      const la0 = Math.min(...lats), la1 = Math.max(...lats), lo0 = Math.min(...lons), lo1 = Math.max(...lons);
      const a = mundo(la1, lo0, 0), b = mundo(la0, lo1, 0), dx = Math.max(1e-9, b[0] - a[0]), dy = Math.max(1e-9, b[1] - a[1]);
      const fit = Math.log2(Math.min((area.x1 - area.x0) / dx, (area.y1 - area.y0) / dy)), fz = Math.max(3, Math.min(17.5, fit));
      z = Math.floor(fz); k = Math.pow(2, fz - z);
      const c = mundo((la0 + la1) / 2, (lo0 + lo1) / 2, z), m = mundo(la1, lo0, z), n = mundo(la0, lo1, z);
      const cam = { x: (m[0] + n[0]) / 2, y: (m[1] + n[1]) / 2 || c[1] }; for (let i = 0; i < N; i++) cams.push(cam);
    } else {
      z = +$("#vZoom").value || 15; k = 1; const alvo = rs[+$("#vVeic").value || 0] || rs[0]; let cam = null;
      for (let i = 0; i < N; i++) {
        const p = g.posicao(alvo, tempos[i]), w = mundo(p.lat, p.lon, z);
        if (!cam) cam = { x: w[0], y: w[1] };
        else { const dx = w[0] - cam.x, dy = w[1] - cam.y, d = Math.hypot(dx, dy), f = d > W * 0.6 ? 1 : 0.3; cam = { x: cam.x + dx * f, y: cam.y + dy * f }; }
        cams.push(cam);
      }
    }
    /* blocos do mapa necessários */
    const n2 = Math.pow(2, z), blocos = new Set();
    let ult = ""; cams.forEach(c => { const x0 = Math.floor((c.x - ox / k) / TILE), x1 = Math.floor((c.x + (W - ox) / k) / TILE), y0 = Math.floor((c.y - oy / k) / TILE), y1 = Math.floor((c.y + (H - oy) / k) / TILE), ch = x0 + "," + x1 + "," + y0 + "," + y1; if (ch === ult) return; ult = ch; for (let x = x0; x <= x1; x++) for (let y = Math.max(0, y0); y <= Math.min(n2 - 1, y1); y++) blocos.add(z + "/" + (((x % n2) + n2) % n2) + "/" + y); });
    /* coordenadas de tela pré-calculadas */
    const modo = $("#corPor").value;
    const vs = rs.map(r => { const span = Math.max(1, r.pts[r.pts.length - 1].t - r.pts[0].t); return { r, w: r.pts.map(p => mundo(p.lat, p.lon, z)), cores: r.seg.map(s => s.lac || s.salto ? "#9A9A9A" : modo === "vel" ? g.corVel(s.vel) : modo === "tempo" ? g.corTempo((s.a.t - r.pts[0].t) / span) : r.v.cor), paradas: r.paradas.map(p => ({ p, w: mundo(p.lat, p.lon, z) })), rumo: null }; });
    const local = g.E.local ? { w: mundo(g.E.local.lat, g.E.local.lon, z), rpx: g.par().raio / (156543.03392 * Math.cos(g.E.local.lat * Math.PI / 180) / n2) * k } : null;
    return { g, rs, vs, W, H, u, z, k, ox, oy, N, holdIni, nMain, holdFim, tempos, cams, blocos, T0, T1, barH, topoH, local, modo, base: g.E.base || "ruas", rastro: $("#rastro").checked, paradas: $("#mostrarParadas").checked, fato: g.E.horaFato };
  }

  /* ------------------------------------------------------------------ blocos do mapa */
  async function baixarBlocos(pl, cache) {
    const lista = [...pl.blocos].filter(k => !cache.has(pl.base + k)); let feitos = 0, falhas = 0;
    const um = k => new Promise(res => { const [z, x, y] = k.split("/"), img = new Image(); img.crossOrigin = "anonymous"; const fim = ok => { clearTimeout(to); if (!ok) falhas++; cache.set(pl.base + k, ok ? img : null); feitos++; res(); }; const to = setTimeout(() => fim(false), 20000); img.onload = () => fim(true); img.onerror = () => fim(false); img.src = URLS[pl.base](z, x, y); });
    const fila = lista.slice(); const trab = async () => { while (fila.length && !CANCELAR) { await um(fila.shift()); if (feitos % 8 === 0) barra(feitos / Math.max(1, lista.length) * 0.15, "Baixando o mapa: " + feitos + " de " + lista.length + " blocos…"); } };
    await Promise.all(Array.from({ length: 8 }, trab));
    if (falhas > lista.length * 0.3) window.HUB.toast(falhas + " blocos do mapa não carregaram; o vídeo terá áreas em cinza.", 6000);
  }

  /* ------------------------------------------------------------------ desenho */
  function rr(c, x, y, w, h, r) { c.beginPath(); c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r); c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath(); }
  function corta(c, s, max) { s = String(s || ""); if (c.measureText(s).width <= max) return s; while (s.length > 1 && c.measureText(s + "…").width > max) s = s.slice(0, -1); return s + "…"; }
  function situacao(g, r, p, T) {
    if (!p) return "";
    if (p.estado === "semsinal") return "sem registro desde " + g.hora(p.p.t);
    if (p.estado === "antes") return "primeiro registro às " + g.hora(r.pts[0].t);
    if (p.estado === "depois") return "registros encerrados às " + g.hora(r.pts[r.pts.length - 1].t);
    if (p.estado === "parada") return "parada" + (p.parada ? " há " + g.dur(T - p.parada.ini) : "");
    return "em movimento · " + Math.round(p.vel) + " km/h";
  }
  function quadro(c, pl, i, cache) {
    const { g, W, H, u, z, k, ox, oy } = pl, T = pl.tempos[i], cam = pl.cams[i], n2 = Math.pow(2, z);
    const S = w => [(w[0] - cam.x) * k + ox, (w[1] - cam.y) * k + oy];
    c.save(); c.fillStyle = "#E4E1DA"; c.fillRect(0, 0, W, H);
    /* mapa */
    const x0 = Math.floor((cam.x - ox / k) / TILE), x1 = Math.floor((cam.x + (W - ox) / k) / TILE), y0 = Math.floor((cam.y - oy / k) / TILE), y1 = Math.floor((cam.y + (H - oy) / k) / TILE);
    for (let x = x0; x <= x1; x++) for (let y = Math.max(0, y0); y <= Math.min(n2 - 1, y1); y++) { const img = cache.get(pl.base + z + "/" + (((x % n2) + n2) % n2) + "/" + y); if (img) c.drawImage(img, Math.floor((x * TILE - cam.x) * k + ox), Math.floor((y * TILE - cam.y) * k + oy), Math.ceil(TILE * k) + 1, Math.ceil(TILE * k) + 1); }
    if (pl.base === "sat") { c.fillStyle = "rgba(0,0,0,0.14)"; c.fillRect(0, 0, W, H); }
    /* local dos fatos */
    if (pl.local) { const [lx, ly] = S(pl.local.w), rp = Math.max(6 * u, pl.local.rpx); c.beginPath(); c.arc(lx, ly, rp, 0, Math.PI * 2); c.fillStyle = "rgba(192,38,45,0.16)"; c.fill(); c.setLineDash([6 * u, 5 * u]); c.lineWidth = 2 * u; c.strokeStyle = "#C0262D"; c.stroke(); c.setLineDash([]); c.beginPath(); c.arc(lx, ly, 6 * u, 0, Math.PI * 2); c.fillStyle = "#fff"; c.fill(); c.lineWidth = 3 * u; c.stroke(); c.font = "600 " + 13 * u + "px " + FONTE; const t = "Local dos fatos", tw = c.measureText(t).width; rr(c, lx - tw / 2 - 7 * u, ly + 12 * u, tw + 14 * u, 22 * u, 6 * u); c.fillStyle = "rgba(255,255,255,0.95)"; c.fill(); c.fillStyle = "#C0262D"; c.textAlign = "center"; c.textBaseline = "middle"; c.fillText(t, lx, ly + 23 * u); c.textAlign = "left"; }
    /* trajetos */
    c.lineCap = "round"; c.lineJoin = "round";
    pl.vs.forEach(v => {
      const r = v.r, pts = r.pts, seg = r.seg;
      /* desenha os trechos [de, ate); "completo" falso corta o último trecho na posição do instante T */
      const linha = (de, ate, largura, alfa, contorno, completo) => {
        let cor = null; c.globalAlpha = alfa;
        for (let j = de; j < ate; j++) {
          const s = seg[j]; if (!s) continue;
          const a = S(v.w[j]); let fim;
          if (completo || s.b.t <= T) fim = S(v.w[j + 1]);
          else { const f = (T - s.a.t) / Math.max(1, s.dt); if (f <= 0 || s.lac) continue; fim = S([v.w[j][0] + (v.w[j + 1][0] - v.w[j][0]) * f, v.w[j][1] + (v.w[j + 1][1] - v.w[j][1]) * f]); }
          if (s.lac || s.salto) { if (cor) { c.stroke(); cor = null; } if (contorno) continue; c.save(); c.setLineDash([6 * u, 7 * u]); c.strokeStyle = "#9A9A9A"; c.lineWidth = 2.5 * u; c.beginPath(); c.moveTo(a[0], a[1]); c.lineTo(fim[0], fim[1]); c.stroke(); c.restore(); continue; }
          const cr = contorno || v.cores[j];
          if (cr !== cor) { if (cor) c.stroke(); c.beginPath(); c.strokeStyle = cr; c.lineWidth = largura; c.moveTo(a[0], a[1]); cor = cr; } else c.lineTo(a[0], a[1]);
          c.lineTo(fim[0], fim[1]);
        }
        if (cor) c.stroke(); c.globalAlpha = 1;
      };
      let feito = seg.length; if (pl.rastro) { feito = 0; while (feito < seg.length && seg[feito].a.t < T) feito++; }
      if (pl.rastro) linha(0, seg.length, 3 * u, 0.38, null, true);
      linha(0, feito, 8 * u, 0.45, "#111", !pl.rastro);
      linha(0, feito, 5 * u, 1, null, !pl.rastro);
      const ini = S(v.w[0]), fim = S(v.w[pts.length - 1]);
      [[ini, "#2E8B57"], [fim, "#C0262D"]].forEach(([q, cor]) => { c.beginPath(); c.arc(q[0], q[1], 7 * u, 0, Math.PI * 2); c.fillStyle = cor; c.fill(); c.lineWidth = 2.5 * u; c.strokeStyle = "#fff"; c.stroke(); });
      if (pl.paradas) v.paradas.forEach((q, n) => { const [px, py] = S(q.w), chegou = q.p.ini <= T; c.globalAlpha = chegou ? 1 : 0.45; c.beginPath(); c.arc(px, py, 11 * u, 0, Math.PI * 2); c.fillStyle = r.v.cor; c.fill(); c.lineWidth = 2.5 * u; c.strokeStyle = "#fff"; c.stroke(); c.fillStyle = "#fff"; c.font = "700 " + 11 * u + "px " + FONTE; c.textAlign = "center"; c.textBaseline = "middle"; c.fillText(String(n + 1), px, py + 0.5 * u); c.textAlign = "left"; c.globalAlpha = 1; });
    });
    /* viaturas */
    pl.vs.forEach(v => {
      const p = g.posicao(v.r, T); if (!p) return; if (p.rumo != null) v.rumo = p.rumo; const [x, y] = S(mundo(p.lat, p.lon, z));
      const ativo = p.estado === "movimento" || p.estado === "parada"; c.globalAlpha = ativo ? 1 : 0.55;
      if (!ativo) { c.beginPath(); c.arc(x, y, 20 * u, 0, Math.PI * 2); c.setLineDash([4 * u, 4 * u]); c.lineWidth = 2 * u; c.strokeStyle = "#fff"; c.stroke(); c.setLineDash([]); }
      c.beginPath(); c.arc(x, y, 13 * u, 0, Math.PI * 2); c.fillStyle = v.r.v.cor; c.shadowColor = "rgba(0,0,0,0.5)"; c.shadowBlur = 6 * u; c.fill(); c.shadowBlur = 0; c.lineWidth = 3 * u; c.strokeStyle = "#fff"; c.stroke();
      c.save(); c.translate(x, y); c.rotate(((v.rumo == null ? 0 : v.rumo) * Math.PI) / 180); c.beginPath(); c.moveTo(0, -8 * u); c.lineTo(6 * u, 6 * u); c.lineTo(0, 3 * u); c.lineTo(-6 * u, 6 * u); c.closePath(); c.fillStyle = "#fff"; c.fill(); c.restore();
      c.font = "700 " + 13 * u + "px " + FONTE; const t = v.r.v.nome, tw = c.measureText(t).width; rr(c, x + 19 * u, y - 11 * u, tw + 14 * u, 22 * u, 6 * u); c.fillStyle = v.r.v.cor; c.fill(); c.fillStyle = "#fff"; c.textBaseline = "middle"; c.fillText(t, x + 26 * u, y + 0.5 * u); c.globalAlpha = 1;
    });
    sobreposicao(c, pl, i, T);
    c.restore();
  }
  function sobreposicao(c, pl, i, T) {
    const { g, W, H, u } = pl; c.textBaseline = "alphabetic"; c.textAlign = "left";
    /* painel das viaturas */
    const pw = Math.min(W * 0.58, 660 * u), ph = pl.topoH - 18 * u;
    rr(c, 18 * u, 18 * u, pw, ph, 12 * u); c.fillStyle = "rgba(18,18,18,0.78)"; c.fill();
    let y = 44 * u; c.fillStyle = "#E8C547"; c.font = "700 " + 12 * u + "px " + FONTE; c.fillText("TRAJETO DE VIATURA POR GPS", 34 * u, y);
    const caso = ($("#caso").value || "").trim(); if (caso) { c.fillStyle = "rgba(255,255,255,0.75)"; c.font = "500 " + 12 * u + "px " + FONTE; c.fillText(corta(c, caso, pw - 260 * u), 34 * u + c.measureText("TRAJETO DE VIATURA POR GPS").width + 40 * u, y); }
    y += 10 * u;
    pl.vs.forEach(v => {
      const p = g.posicao(v.r, T); y += 22 * u;
      c.beginPath(); c.arc(40 * u, y - 5 * u, 6 * u, 0, Math.PI * 2); c.fillStyle = v.r.v.cor; c.fill(); c.lineWidth = 1.5 * u; c.strokeStyle = "#fff"; c.stroke();
      c.font = "700 " + 16 * u + "px " + FONTE; c.fillStyle = "#fff"; c.fillText(v.r.v.nome, 54 * u, y); const nw = c.measureText(v.r.v.nome).width;
      c.font = "500 " + 15 * u + "px " + FONTE; c.fillStyle = p && (p.estado === "movimento") ? "#8FE3A8" : p && p.estado === "parada" ? "#F2D36B" : "#FF9C8F";
      const dl = g.E.local && p ? " · a " + g.km(g.dist(p, g.E.local)) + " do local" : ""; c.fillText(corta(c, situacao(g, v.r, p, T) + dl, pw - 70 * u - nw), 66 * u + nw, y);
      y += 20 * u; c.font = "400 " + 13 * u + "px " + FONTE; c.fillStyle = "rgba(255,255,255,0.72)"; c.fillText(corta(c, p && p.p ? p.p.end || "" : "", pw - 40 * u), 54 * u, y); y += 4 * u;
    });
    /* relógio */
    const rw = 250 * u, rx = W - rw - 18 * u; rr(c, rx, 18 * u, rw, 96 * u, 12 * u); c.fillStyle = "rgba(18,18,18,0.78)"; c.fill();
    const s = g.fmt(T); c.textAlign = "right"; c.fillStyle = "rgba(255,255,255,0.8)"; c.font = "500 " + 15 * u + "px " + FONTE; c.fillText(s.slice(0, 10), W - 34 * u, 44 * u);
    c.fillStyle = "#fff"; c.font = "500 " + 38 * u + "px " + MONO; c.fillText(s.slice(11), W - 34 * u, 84 * u);
    const j = Math.min(pl.N - 2, Math.max(0, i)), a = Math.max(0, j - 6), b = Math.min(pl.N - 1, j + 6), rit = (pl.tempos[b] - pl.tempos[a]) / Math.max(1, b - a) * FPS;
    c.font = "500 " + 11.5 * u + "px " + FONTE; c.fillStyle = "rgba(255,255,255,0.65)"; c.fillText(rit > 1500 ? "1 s de vídeo ≈ " + g.dur(rit) : i < pl.holdIni ? "início" : i >= pl.holdIni + pl.nMain ? "fim do período" : "1 s de vídeo ≈ " + g.dur(Math.max(1000, rit)), W - 34 * u, 104 * u);
    if (pl.fato != null && Math.abs(T - pl.fato) <= Math.max(30000, rit)) { c.font = "700 " + 13 * u + "px " + FONTE; const t = "HORÁRIO DOS FATOS", tw = c.measureText(t).width; rr(c, W - 18 * u - tw - 24 * u, 122 * u, tw + 24 * u, 28 * u, 8 * u); c.fillStyle = "#C0262D"; c.fill(); c.fillStyle = "#fff"; c.fillText(t, W - 30 * u, 141 * u); }
    c.textAlign = "left";
    /* linha do tempo */
    const by = H - pl.barH; c.fillStyle = "rgba(18,18,18,0.82)"; c.fillRect(0, by, W, pl.barH);
    const tx0 = 120 * u, tx1 = W - 120 * u, X = t => tx0 + (t - pl.T0) / Math.max(1, pl.T1 - pl.T0) * (tx1 - tx0);
    c.font = "500 " + 12 * u + "px " + MONO; c.fillStyle = "rgba(255,255,255,0.8)"; c.fillText(g.hora(pl.T0), 20 * u, by + 26 * u); c.textAlign = "right"; c.fillText(g.hora(pl.T1), W - 20 * u, by + 26 * u); c.textAlign = "left";
    pl.vs.slice(0, 3).forEach((v, n) => {
      const r = v.r, yy = by + 14 * u + n * 14 * u, hh = 8 * u;
      c.fillStyle = "rgba(255,255,255,0.12)"; c.fillRect(tx0, yy, tx1 - tx0, hh);
      c.fillStyle = "#3BAA5C"; c.fillRect(X(r.pts[0].t), yy, Math.max(1, X(r.pts[r.pts.length - 1].t) - X(r.pts[0].t)), hh);
      c.fillStyle = "#A0A0A0"; r.paradas.forEach(p => c.fillRect(X(p.ini), yy, Math.max(1.5 * u, X(p.fim) - X(p.ini)), hh));
      c.fillStyle = "#D9443C"; r.lacunas.forEach(p => c.fillRect(X(p.ini), yy, Math.max(1.5 * u, X(p.fim) - X(p.ini)), hh));
      c.beginPath(); c.arc(tx0 - 12 * u, yy + hh / 2, 4.5 * u, 0, Math.PI * 2); c.fillStyle = r.v.cor; c.fill();
    });
    const ty1 = by + 14 * u + Math.min(pl.vs.length, 3) * 14 * u - 6 * u;
    if (pl.fato != null && pl.fato >= pl.T0 && pl.fato <= pl.T1) { c.fillStyle = "#FF5A4E"; c.fillRect(X(pl.fato) - 1.5 * u, by + 8 * u, 3 * u, ty1 - by); }
    const cx = X(T); c.fillStyle = "#fff"; c.fillRect(cx - 1.5 * u, by + 6 * u, 3 * u, ty1 - by + 2 * u); c.beginPath(); c.moveTo(cx - 6 * u, by + 4 * u); c.lineTo(cx + 6 * u, by + 4 * u); c.lineTo(cx, by + 11 * u); c.closePath(); c.fill();
    c.font = "400 " + 11 * u + "px " + FONTE; c.fillStyle = "rgba(255,255,255,0.7)"; c.fillText("verde: em movimento · cinza: parada · vermelho: sem registro" + (pl.fato != null ? " · linha vermelha: horário dos fatos" : ""), tx0, H - 9 * u);
    /* legenda de velocidade e créditos */
    if (pl.modo === "vel") { const lx = 18 * u, ly = by - 40 * u; rr(c, lx, ly, 300 * u, 28 * u, 8 * u); c.fillStyle = "rgba(18,18,18,0.72)"; c.fill(); const cores = [["#2A78D6", "0"], ["#3BAA5C", "10"], ["#E8C547", "30"], ["#EB6834", "60"], ["#C0262D", "90+"]]; c.font = "500 " + 11 * u + "px " + FONTE; cores.forEach(([cor, t], n) => { const x = lx + 12 * u + n * 46 * u; c.fillStyle = cor; c.fillRect(x, ly + 11 * u, 16 * u, 6 * u); c.fillStyle = "#fff"; c.fillText(t, x + 20 * u, ly + 18 * u); }); c.fillStyle = "rgba(255,255,255,0.8)"; c.fillText("km/h", lx + 248 * u, ly + 18 * u); }
    c.font = "500 " + 11 * u + "px " + FONTE; c.textAlign = "right"; c.fillStyle = "#fff"; c.shadowColor = "rgba(0,0,0,0.8)"; c.shadowBlur = 3 * u; c.fillText(ATRIB[pl.base] + " · HUB TPC Advogados", W - 14 * u, by - 10 * u); c.shadowBlur = 0; c.textAlign = "left";
    /* abertura e encerramento */
    if (i < pl.holdIni) {
      const alfa = Math.min(1, (pl.holdIni - i) / (0.6 * FPS)); c.globalAlpha = alfa; c.fillStyle = "rgba(10,10,10,0.72)"; c.fillRect(0, 0, W, H);
      c.textAlign = "center"; c.fillStyle = "#E8C547"; c.font = "700 " + 14 * u + "px " + FONTE; c.fillText("RECONSTITUIÇÃO DO TRAJETO A PARTIR DO RELATÓRIO DE GPS", W / 2, H / 2 - 70 * u);
      c.fillStyle = "#fff"; c.font = "600 " + 34 * u + "px " + FONTE; c.fillText(pl.vs.map(v => v.r.v.nome).join("  ·  "), W / 2, H / 2 - 24 * u);
      c.font = "500 " + 17 * u + "px " + FONTE; c.fillStyle = "rgba(255,255,255,0.85)"; c.fillText(g.fmt(pl.T0) + "  a  " + g.fmt(pl.T1), W / 2, H / 2 + 14 * u);
      const ex = [caso, pl.fato != null ? "Horário dos fatos: " + g.fmt(pl.fato) : "", g.E.local ? "Local dos fatos: " + g.E.local.nome : ""].filter(Boolean);
      c.font = "400 " + 15 * u + "px " + FONTE; ex.forEach((t, n) => c.fillText(corta(c, t, W - 160 * u), W / 2, H / 2 + (48 + n * 24) * u));
      c.font = "400 " + 12 * u + "px " + FONTE; c.fillStyle = "rgba(255,255,255,0.6)"; c.fillText("Posições, horários e endereços conforme o relatório de rastreamento; trajeto entre pontos em linha reta.", W / 2, H - pl.barH - 26 * u);
      c.textAlign = "left"; c.globalAlpha = 1;
    } else if (i >= pl.holdIni + pl.nMain) {
      c.font = "600 " + 15 * u + "px " + FONTE; const t = "Fim do período analisado", tw = c.measureText(t).width; rr(c, W / 2 - tw / 2 - 16 * u, pl.topoH + 8 * u, tw + 32 * u, 32 * u, 10 * u); c.fillStyle = "rgba(18,18,18,0.82)"; c.fill(); c.fillStyle = "#fff"; c.textAlign = "center"; c.fillText(t, W / 2, pl.topoH + 29 * u); c.textAlign = "left";
    }
  }

  /* ------------------------------------------------------------------ codificação */
  async function codecH264(W, H) {
    if (typeof VideoEncoder === "undefined") return null;
    const br = Math.round(W * H * FPS * 0.11);
    for (const codec of ["avc1.640028", "avc1.4d0028", "avc1.42E028", "avc1.42E01F"]) { try { const cfg = { codec, width: W, height: H, bitrate: br, framerate: FPS, avc: { format: "avc" } }; if ((await VideoEncoder.isConfigSupported(cfg)).supported) return { cfg, mux: "avc" }; } catch (e) { /* tenta o próximo */ } }
    for (const codec of ["vp09.00.40.08", "vp09.00.31.08"]) { try { const cfg = { codec, width: W, height: H, bitrate: br, framerate: FPS }; if ((await VideoEncoder.isConfigSupported(cfg)).supported) return { cfg, mux: "vp9" }; } catch (e) { /* segue */ } }
    return null;
  }
  async function gerarWebCodecs(pl, cv, ctx, cache, cod) {
    await muxerLib();
    const muxer = new Mp4Muxer.Muxer({ target: new Mp4Muxer.ArrayBufferTarget(), video: { codec: cod.mux, width: pl.W, height: pl.H, frameRate: FPS }, fastStart: "in-memory" });
    let erro = null; const enc = new VideoEncoder({ output: (ch, meta) => muxer.addVideoChunk(ch, meta), error: e => { erro = e; } });
    enc.configure(cod.cfg);
    try {
      for (let i = 0; i < pl.N; i++) {
        if (CANCELAR) throw new Error("cancelado"); if (erro) throw erro;
        quadro(ctx, pl, i, cache);
        const f = new VideoFrame(cv, { timestamp: Math.round(i * 1e6 / FPS), duration: Math.round(1e6 / FPS) }); enc.encode(f, { keyFrame: i % (FPS * 2) === 0 }); f.close();
        while (enc.encodeQueueSize > 6) await espera(2);
        if (i % 6 === 0) { barra(0.15 + 0.85 * i / pl.N, "Gravando o vídeo: " + Math.round(i / pl.N * 100) + "%"); await espera(0); }
      }
      await enc.flush(); if (erro) throw erro; muxer.finalize();
    } finally { if (enc.state !== "closed") enc.close(); }
    return { blob: new Blob([muxer.target.buffer], { type: "video/mp4" }), ext: "mp4" };
  }
  async function gerarTempoReal(pl, cv, ctx, cache) {
    const tipo = ["video/mp4;codecs=avc1", "video/mp4", "video/webm;codecs=vp9", "video/webm"].find(t => window.MediaRecorder && MediaRecorder.isTypeSupported(t));
    if (!tipo) throw new Error("Este navegador não consegue gravar vídeo. Use o Google Chrome ou o Microsoft Edge atualizados.");
    const partes = [], rec = new MediaRecorder(cv.captureStream(FPS), { mimeType: tipo, videoBitsPerSecond: Math.round(pl.W * pl.H * FPS * 0.11) });
    rec.ondataavailable = e => { if (e.data && e.data.size) partes.push(e.data); };
    const fim = new Promise(r => { rec.onstop = r; });
    quadro(ctx, pl, 0, cache); rec.start(1000); const t0 = performance.now();
    for (let i = 0; i < pl.N; i++) { if (CANCELAR) break; quadro(ctx, pl, i, cache); if (i % 6 === 0) barra(0.15 + 0.85 * i / pl.N, "Gravando o vídeo em tempo real: " + Math.round(i / pl.N * 100) + "%"); const alvo = t0 + (i + 1) * 1000 / FPS - performance.now(); if (alvo > 0) await espera(alvo); }
    rec.stop(); await fim; if (CANCELAR) throw new Error("cancelado");
    return { blob: new Blob(partes, { type: tipo.split(";")[0] }), ext: /mp4/.test(tipo) ? "mp4" : "webm" };
  }
  const CACHE = new Map();
  $("#vGerar").onclick = async () => {
    if (GERANDO) return; const g = G(); g.pausar(); CANCELAR = false; GERANDO = true;
    $("#vGerar").disabled = true; $("#vCancelar").hidden = false; const cv = $("#vPrevia"); cv.hidden = false;
    try {
      barra(0.01, "Preparando o roteiro do vídeo…"); await espera(30);
      const pl = planejar(); cv.width = pl.W; cv.height = pl.H; const ctx = cv.getContext("2d", { alpha: false });
      try { await Promise.all([document.fonts.load("600 20px 'Red Hat Text'"), document.fonts.load("500 20px 'Red Hat Mono'")]); } catch (e) { /* fontes do sistema */ }
      if (pl.blocos.size > 2500) window.HUB.toast("O enquadramento exige muitos blocos de mapa (" + pl.blocos.size + "); o download pode demorar. Uma aproximação menor deixa o vídeo mais rápido de gerar.", 7000);
      await baixarBlocos(pl, CACHE); if (CANCELAR) throw new Error("cancelado");
      const cod = await codecH264(pl.W, pl.H), t0 = performance.now();
      const res = cod ? await gerarWebCodecs(pl, cv, ctx, CACHE, cod) : await gerarTempoReal(pl, cv, ctx, CACHE);
      const nome = "Trajeto GPS - " + g.nomeArq() + "." + res.ext; g.baixarArquivo(res.blob, nome);
      barra(null, "Vídeo gerado em " + g.dur(performance.now() - t0) + ": " + nome + " · " + Math.round(pl.N / FPS) + " s · " + pl.W + "×" + pl.H + " · " + (res.blob.size / 1048576).toFixed(1).replace(".", ",") + " MB" + (res.ext !== "mp4" ? " (formato WebM: este navegador não grava MP4; abre no Chrome, no Edge e no VLC)" : cod && cod.mux === "vp9" ? " (MP4 com VP9: se não abrir no Windows, use o VLC)" : "") + ".");
    } catch (e) { barra(null, e && e.message === "cancelado" ? "Geração cancelada." : "Não foi possível gerar o vídeo: " + (e && e.message || e)); }
    finally { GERANDO = false; CANCELAR = false; $("#vGerar").disabled = false; $("#vCancelar").hidden = true; }
  };
})();
