/* Análise e verificação de imagens: hashes (cadeia de custódia), metadados EXIF, XMP, IPTC e GPS (exifr), indícios
   de edição, análise de nível de erro (ELA), comparação perceptual entre duas imagens, pesquisa reversa guiada e
   relatório em Word. Tudo no navegador; nada é enviado a servidores. */
(function () {
  "use strict";
  const $ = s => document.querySelector(s), esc = s => window.HUB.esc(s), P = window.TPC_PECA;
  const E = { imgs: [], cmp: [] };
  $("#responsavel").innerHTML = '<option value="">Selecione</option>' + P.ADVOGADOS.map(a => "<option>" + esc(a.nome) + "</option>").join("");
  try { const v = localStorage.getItem("imagens_responsavel"); if (v) $("#responsavel").value = v; } catch (e) { /* ignora */ }
  $("#responsavel").addEventListener("change", () => { try { localStorage.setItem("imagens_responsavel", $("#responsavel").value); } catch (e) { /* ignora */ } });

  /* biblioteca de metadados hospedada no HUB, com a CDN como reserva */
  let pExifr = null;
  function exifr() {
    if (window.exifr) return Promise.resolve(window.exifr);
    return pExifr || (pExifr = new Promise((ok, falha) => {
      const urls = [new URL("../vendor/exifr/full.umd.js", location.href).href, "https://cdn.jsdelivr.net/npm/exifr@7.1.3/dist/full.umd.js"];
      const tenta = i => { if (i >= urls.length) return falha(new Error("Não foi possível carregar o leitor de metadados.")); const s = document.createElement("script"); s.src = urls[i]; s.onload = () => window.exifr ? ok(window.exifr) : tenta(i + 1); s.onerror = () => { s.remove(); tenta(i + 1); }; document.head.appendChild(s); };
      tenta(0);
    }));
  }
  const hexDe = buf => [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, "0")).join("");
  const tam = b => b < 1048576 ? (b / 1024).toFixed(0) + " KB" : (b / 1048576).toFixed(2).replace(".", ",") + " MB";
  const dataBR = d => d instanceof Date && !isNaN(d) ? d.toLocaleString("pt-BR") : (d ? String(d) : "");

  /* ------------------------------------------------------------------ entrada */
  const zona = $("#zona");
  ["dragenter", "dragover"].forEach(ev => zona.addEventListener(ev, e => { e.preventDefault(); zona.classList.add("sobre"); }));
  ["dragleave", "drop"].forEach(ev => zona.addEventListener(ev, e => { e.preventDefault(); zona.classList.remove("sobre"); }));
  zona.addEventListener("drop", e => adicionar([...e.dataTransfer.files]));
  $("#arquivo").addEventListener("change", e => { adicionar([...e.target.files]); e.target.value = ""; });

  async function carregarImagem(file) {
    const url = URL.createObjectURL(file);
    try { const img = new Image(); img.decoding = "async"; img.src = url; await img.decode(); return { img, url }; }
    catch (e) { URL.revokeObjectURL(url); return { img: null, url: null }; }
  }
  async function adicionar(files) {
    files = files.filter(f => /^image\//.test(f.type) || /\.(heic|heif|tiff?|jpe?g|png|webp)$/i.test(f.name));
    if (!files.length) return;
    $("#estado").textContent = "Analisando " + files.length + (files.length === 1 ? " imagem…" : " imagens…");
    for (const f of files) {
      const buf = await f.arrayBuffer();
      const [s256, s512] = await Promise.all([crypto.subtle.digest("SHA-256", buf), crypto.subtle.digest("SHA-512", buf)]);
      const { img, url } = await carregarImagem(f);
      let meta = null, erroMeta = "";
      try { meta = await (await exifr()).parse(buf, { tiff: true, exif: true, gps: true, xmp: true, iptc: true, icc: false, interop: false, ifd1: false, mergeOutput: true, translateValues: true, reviveValues: true }); }
      catch (e) { erroMeta = e.message || String(e); }
      const reg = { nome: f.name, tipo: f.type || "desconhecido", bytes: f.size, modificado: f.lastModified ? new Date(f.lastModified) : null, sha256: hexDe(s256), sha512: hexDe(s512), img, url, larg: img ? img.naturalWidth : 0, alt: img ? img.naturalHeight : 0, meta: meta || {}, erroMeta, recebido: new Date() };
      reg.indicios = indicios(reg);
      E.imgs.push(reg);
    }
    $("#estado").textContent = E.imgs.length + (E.imgs.length === 1 ? " imagem analisada." : " imagens analisadas.");
    desenhar();
  }

  /* ------------------------------------------------------------------ indícios */
  const EDITORES = /photoshop|gimp|lightroom|snapseed|picsart|canva|affinity|pixelmator|paint\.net|facetune|meitu|vsco|capture one|luminar|fotor|remini|photoroom|lensa|airbrush|befunky|pixlr|inshot|faceapp/i;
  function indicios(r) {
    const m = r.meta, L = [];
    const temExif = !!(m.Make || m.Model || m.DateTimeOriginal || m.ExposureTime || m.FNumber);
    if (!Object.keys(m).length) L.push({ alerta: false, t: "Sem metadados. É o padrão das imagens reenviadas por WhatsApp, redes sociais ou capturas de tela; não indica, por si, adulteração, mas impede confirmar câmera, data e local pelo arquivo." });
    else if (!temExif) L.push({ alerta: false, t: "Sem dados de câmera (EXIF). A imagem pode ter sido gerada por captura de tela, aplicativo ou reprocessada." });
    const sw = [m.Software, m.CreatorTool, m.ProcessingSoftware, m.HistorySoftwareAgent].filter(Boolean).join(" · ");
    if (sw && EDITORES.test(sw)) L.push({ alerta: true, t: "Programa de edição registrado nos metadados: " + sw + "." });
    else if (sw) L.push({ alerta: false, t: "Programa registrado: " + sw + " (em celulares, costuma ser apenas a versão do sistema)." });
    const orig = m.DateTimeOriginal || m.CreateDate, mod = m.ModifyDate;
    if (orig instanceof Date && mod instanceof Date && Math.abs(mod - orig) > 120000) L.push({ alerta: true, t: "A data de modificação (" + dataBR(mod) + ") difere da data de captura (" + dataBR(orig) + "): o arquivo foi salvo de novo depois de fotografado." });
    if (m.History || m.HistoryAction || m.DocumentID && m.DerivedFrom) L.push({ alerta: true, t: "O arquivo traz histórico de edição no padrão XMP (" + [m.HistoryAction, m.DerivedFrom && "derivado de outro arquivo"].filter(Boolean).join(", ") + ")." });
    if (orig instanceof Date && r.modificado && r.modificado < orig - 86400000) L.push({ alerta: true, t: "A data do arquivo no computador é anterior à data de captura gravada na foto: verifique o relógio do aparelho." });
    const lado = Math.max(r.larg, r.alt);
    if (!temExif && (lado === 1600 || lado === 1280 || lado === 2560)) L.push({ alerta: false, t: "As dimensões (" + r.larg + " × " + r.alt + ") coincidem com as usadas pelo WhatsApp e redes sociais ao reduzir imagens: é provável que não seja o arquivo original." });
    if (typeof m.latitude === "number" && typeof m.longitude === "number") L.push({ alerta: false, t: "Coordenadas de GPS presentes: a foto registra onde foi feita." });
    if (m.Make && /apple|samsung|motorola|xiaomi|google|huawei|lg|sony|nikon|canon|fujifilm|olympus|panasonic|asus|oneplus|oppo|realme|vivo/i.test(m.Make) && !sw) L.push({ alerta: false, t: "Metadados compatíveis com foto original de " + m.Make + (m.Model ? " " + m.Model : "") + ", sem registro de programa de edição." });
    return L;
  }

  /* ------------------------------------------------------------------ análise de nível de erro */
  async function ela(r, qualidade, escala) {
    if (!r.img) return null;
    const lim = 1400, k = Math.min(1, lim / Math.max(r.larg, r.alt)), w = Math.round(r.larg * k), h = Math.round(r.alt * k);
    const a = document.createElement("canvas"); a.width = w; a.height = h; const ca = a.getContext("2d", { willReadFrequently: true }); ca.drawImage(r.img, 0, 0, w, h);
    const blob = await new Promise(ok => a.toBlob(ok, "image/jpeg", qualidade || 0.9));
    const rec = await createImageBitmap(blob);
    const b = document.createElement("canvas"); b.width = w; b.height = h; const cb = b.getContext("2d", { willReadFrequently: true }); cb.drawImage(rec, 0, 0);
    const da = ca.getImageData(0, 0, w, h), db = cb.getImageData(0, 0, w, h), out = cb.createImageData(w, h), s = escala || 20;
    let soma = 0;
    for (let i = 0; i < da.data.length; i += 4) {
      const d = (Math.abs(da.data[i] - db.data[i]) + Math.abs(da.data[i + 1] - db.data[i + 1]) + Math.abs(da.data[i + 2] - db.data[i + 2])) / 3; soma += d;
      const v = Math.min(255, d * s); out.data[i] = v; out.data[i + 1] = Math.min(255, v * 0.85); out.data[i + 2] = Math.min(255, v * 0.4); out.data[i + 3] = 255;
    }
    const c = document.createElement("canvas"); c.width = w; c.height = h; c.getContext("2d").putImageData(out, 0, 0);
    return { canvas: c, media: soma / (w * h) };
  }

  /* ------------------------------------------------------------------ comparação perceptual */
  function cinza(img, w, h) { const c = document.createElement("canvas"); c.width = w; c.height = h; const x = c.getContext("2d", { willReadFrequently: true }); x.drawImage(img, 0, 0, w, h); const d = x.getImageData(0, 0, w, h).data, g = new Float64Array(w * h); for (let i = 0; i < g.length; i++) g[i] = 0.299 * d[i * 4] + 0.587 * d[i * 4 + 1] + 0.114 * d[i * 4 + 2]; return g; }
  function dhash(img) { const g = cinza(img, 17, 16), b = []; for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) b.push(g[y * 17 + x] > g[y * 17 + x + 1] ? 1 : 0); return b; }
  function phash(img) {
    const N = 32, g = cinza(img, N, N), dct = new Float64Array(64), c = k => k === 0 ? Math.SQRT1_2 : 1;
    for (let u = 0; u < 8; u++) for (let v = 0; v < 8; v++) { let s = 0; for (let x = 0; x < N; x++) for (let y = 0; y < N; y++) s += g[y * N + x] * Math.cos(((2 * x + 1) * u * Math.PI) / (2 * N)) * Math.cos(((2 * y + 1) * v * Math.PI) / (2 * N)); dct[u * 8 + v] = c(u) * c(v) * s / 4; }
    const vals = [...dct].slice(1), med = vals.slice().sort((a, b) => a - b)[Math.floor(vals.length / 2)];
    return [...dct].map(v => v > med ? 1 : 0);
  }
  const semelhanca = (a, b) => 1 - a.reduce((s, v, i) => s + (v !== b[i] ? 1 : 0), 0) / a.length;
  function diferenca(ra, rb) {
    const w = 512, h = Math.round(512 * ra.alt / ra.larg) || 512;
    const pa = document.createElement("canvas"); pa.width = w; pa.height = h; const xa = pa.getContext("2d", { willReadFrequently: true }); xa.drawImage(ra.img, 0, 0, w, h);
    const pb = document.createElement("canvas"); pb.width = w; pb.height = h; const xb = pb.getContext("2d", { willReadFrequently: true }); xb.drawImage(rb.img, 0, 0, w, h);
    const a = xa.getImageData(0, 0, w, h), b = xb.getImageData(0, 0, w, h), o = xa.createImageData(w, h);
    for (let i = 0; i < a.data.length; i += 4) { const d = (Math.abs(a.data[i] - b.data[i]) + Math.abs(a.data[i + 1] - b.data[i + 1]) + Math.abs(a.data[i + 2] - b.data[i + 2])) / 3, v = d > 28 ? 255 : 0; o.data[i] = v; o.data[i + 1] = v * 0.35; o.data[i + 2] = 0; o.data[i + 3] = d > 28 ? 200 : 0; }
    const c = document.createElement("canvas"); c.width = w; c.height = h; const x = c.getContext("2d"); x.globalAlpha = 0.45; x.drawImage(ra.img, 0, 0, w, h); x.globalAlpha = 1; const t = document.createElement("canvas"); t.width = w; t.height = h; t.getContext("2d").putImageData(o, 0, 0); x.drawImage(t, 0, 0);
    return c;
  }
  $("#comparar").onclick = () => {
    const ia = +$("#cmpA").value, ib = +$("#cmpB").value, ra = E.imgs[ia], rb = E.imgs[ib];
    if (ia === ib) { $("#cmpRes").innerHTML = '<p class="pequeno">Escolha duas imagens diferentes.</p>'; return; }
    if (!ra.img || !rb.img) { $("#cmpRes").innerHTML = '<p class="pequeno">Este navegador não consegue exibir uma das imagens (por exemplo, HEIC); converta para JPG e tente de novo.</p>'; return; }
    const sp = semelhanca(phash(ra.img), phash(rb.img)), sd = semelhanca(dhash(ra.img), dhash(rb.img)), s = (sp + sd) / 2;
    const igual = ra.sha256 === rb.sha256, prop = Math.abs(ra.larg / ra.alt - rb.larg / rb.alt) < 0.02;
    const conc = igual ? "Os arquivos são idênticos (mesmo hash SHA-256)." : s >= 0.9 ? "Muito provavelmente são a mesma fotografia, com diferenças de compressão, tamanho ou ajuste leve." : s >= 0.78 ? "As imagens são semelhantes: podem ser a mesma cena em momentos próximos ou uma versão editada ou recortada da outra." : "As imagens são diferentes.";
    const r = { a: ra.nome, b: rb.nome, s, sp, sd, igual, conc, prop };
    E.cmp = E.cmp.filter(c => !(c.a === r.a && c.b === r.b)); E.cmp.push(r);
    $("#cmpRes").innerHTML = '<p style="margin:12px 0 4px"><b>Semelhança perceptual: ' + Math.round(s * 100) + "%</b> · " + esc(conc) + '</p><p class="pequeno mudo" style="margin:0">Hash perceptual por DCT ' + Math.round(sp * 100) + "%, por gradiente " + Math.round(sd * 100) + "%" + (prop ? "" : " · as proporções são diferentes, o que sugere recorte") + '. Em vermelho, as áreas que mudam de uma imagem para a outra.</p><div class="cmp"><img alt="Imagem A" src="' + ra.url + '"><img alt="Imagem B" src="' + rb.url + '"><div id="cmpDif"></div></div>';
    $("#cmpDif").appendChild(diferenca(ra, rb));
  };

  /* ------------------------------------------------------------------ exibição */
  const ROT = { Make: "Fabricante", Model: "Modelo", LensModel: "Lente", DateTimeOriginal: "Data da captura", CreateDate: "Data de criação", ModifyDate: "Data de modificação", OffsetTimeOriginal: "Fuso da captura", Software: "Programa", CreatorTool: "Ferramenta de criação", Artist: "Autor", Copyright: "Direitos", ImageDescription: "Descrição", Orientation: "Orientação", ExposureTime: "Exposição", FNumber: "Abertura", ISO: "ISO", FocalLength: "Distância focal", Flash: "Flash", City: "Cidade (IPTC)", Country: "País (IPTC)", HostComputer: "Aparelho" };
  const PRINC = ["Make", "Model", "LensModel", "DateTimeOriginal", "CreateDate", "ModifyDate", "OffsetTimeOriginal", "Software", "CreatorTool", "HostComputer", "Artist", "ImageDescription", "City", "Country"];
  const fmt = v => v instanceof Date ? dataBR(v) : Array.isArray(v) ? v.join(", ") : typeof v === "object" && v ? JSON.stringify(v).slice(0, 200) : String(v);
  function principais(r) {
    const m = r.meta, dl = [["Arquivo", r.nome], ["Tipo e tamanho", r.tipo + " · " + tam(r.bytes)], ["Dimensões", r.larg ? r.larg + " × " + r.alt + " px" : "não exibível neste navegador"]];
    PRINC.forEach(k => { if (m[k] != null && m[k] !== "") dl.push([ROT[k], fmt(m[k])]); });
    if (typeof m.latitude === "number") dl.push(["Localização (GPS)", m.latitude.toFixed(6) + ", " + m.longitude.toFixed(6) + (m.GPSAltitude != null ? " · altitude " + Math.round(m.GPSAltitude) + " m" : "")]);
    dl.push(["Data do arquivo no computador", dataBR(r.modificado)]);
    return dl;
  }
  function desenhar() {
    $("#resBloco").hidden = !E.imgs.length; $("#cmpBloco").hidden = E.imgs.length < 2;
    const ops = E.imgs.map((r, i) => '<option value="' + i + '">' + esc((i + 1) + ". " + r.nome) + "</option>").join("");
    const va = $("#cmpA").value, vb = $("#cmpB").value; $("#cmpA").innerHTML = ops; $("#cmpB").innerHTML = ops; $("#cmpA").value = va || "0"; $("#cmpB").value = vb || (E.imgs.length > 1 ? "1" : "0");
    $("#lista").innerHTML = E.imgs.map((r, i) => {
      const m = r.meta, gps = typeof m.latitude === "number";
      return '<div class="img"><div>' + (r.url ? '<img class="miniatura" alt="' + esc(r.nome) + '" src="' + r.url + '">' : '<p class="pequeno mudo">Pré-visualização indisponível neste navegador.</p>') +
        '<div class="linha-btns" style="margin-top:8px"><button type="button" class="btn sec peq" data-copiar="' + i + '">Copiar imagem</button></div>' +
        '<p class="pequeno mudo" style="margin:6px 0 2px">Pesquisa reversa (cole a imagem copiada no buscador):</p><div class="linha-btns" style="margin:0"><a class="btn sec peq" href="https://lens.google.com/" target="_blank" rel="noopener">Google Lens</a><a class="btn sec peq" href="https://www.bing.com/visualsearch" target="_blank" rel="noopener">Bing</a><a class="btn sec peq" href="https://yandex.com/images/" target="_blank" rel="noopener">Yandex</a><a class="btn sec peq" href="https://tineye.com/" target="_blank" rel="noopener">TinEye</a></div></div>' +
        "<div><h3>" + esc((i + 1) + ". " + r.nome) + "</h3>" +
        '<dl class="dl">' + principais(r).map(([a, b]) => "<dt>" + esc(a) + "</dt><dd>" + esc(b) + "</dd>").join("") + '<dt>SHA-256</dt><dd class="mono">' + r.sha256 + '</dd><dt>SHA-512</dt><dd class="mono">' + r.sha512 + "</dd></dl>" +
        (gps ? '<p class="pequeno" style="margin:6px 0 0"><a href="https://www.openstreetmap.org/?mlat=' + m.latitude + "&mlon=" + m.longitude + "#map=17/" + m.latitude + "/" + m.longitude + '" target="_blank" rel="noopener">Ver no mapa (OpenStreetMap)</a> · <a href="https://www.google.com/maps/search/?api=1&query=' + m.latitude + "," + m.longitude + '" target="_blank" rel="noopener">Google Maps</a></p>' : "") +
        '<div class="ind">' + r.indicios.map(x => '<div class="' + (x.alerta ? "alerta" : "") + '">' + esc(x.t) + "</div>").join("") + "</div>" +
        '<div class="linha-btns" style="margin-top:10px"><button type="button" class="btn sec peq" data-ela="' + i + '">Análise de nível de erro (ELA)</button></div><div id="ela' + i + '"></div>' +
        (Object.keys(m).length ? '<details class="meta"><summary>Todos os metadados (' + Object.keys(m).length + ")</summary><table>" + Object.entries(m).map(([k, v]) => "<tr><td>" + esc(k) + "</td><td>" + esc(fmt(v)) + "</td></tr>").join("") + "</table></details>" : "") +
        (r.erroMeta ? '<p class="pequeno">Metadados não lidos: ' + esc(r.erroMeta) + "</p>" : "") + "</div></div>";
    }).join("");
    document.querySelectorAll("[data-ela]").forEach(b => { b.onclick = async () => {
      const i = +b.dataset.ela, r = E.imgs[i], alvo = $("#ela" + i); b.disabled = true; alvo.innerHTML = '<p class="pequeno">Calculando…</p>';
      try { const e = await ela(r, 0.9, 20); if (!e) { alvo.innerHTML = '<p class="pequeno">Imagem não exibível neste navegador.</p>'; return; } r.elaMedia = e.media; alvo.innerHTML = '<p class="pequeno mudo" style="margin:8px 0 0">Regiões claras reagem mais à recompressão. Compare áreas de mesma textura: uma região que destoa das vizinhas merece exame pericial. Nível médio de erro: ' + e.media.toFixed(2) + '.</p><div class="ela"><img alt="Original" src="' + r.url + '"><div id="elac' + i + '"></div></div>'; $("#elac" + i).appendChild(e.canvas); }
      catch (x) { alvo.innerHTML = '<p class="pequeno">Não foi possível calcular: ' + esc(x.message || x) + "</p>"; } finally { b.disabled = false; }
    }; });
    document.querySelectorAll("[data-copiar]").forEach(b => { b.onclick = async () => {
      const r = E.imgs[+b.dataset.copiar]; if (!r.img) { window.HUB.toast("Imagem não exibível neste navegador."); return; }
      try { const c = document.createElement("canvas"); c.width = r.larg; c.height = r.alt; c.getContext("2d").drawImage(r.img, 0, 0); const blob = await new Promise(ok => c.toBlob(ok, "image/png")); await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]); window.HUB.toast("Imagem copiada. Abra o buscador e cole (Ctrl+V).", 4000); }
      catch (e) { window.HUB.toast("Não foi possível copiar; use o envio de arquivo do buscador.", 4000); }
    }; });
  }

  /* ------------------------------------------------------------------ relatório */
  $("#relatorio").onclick = async () => {
    if (!E.imgs.length) return;
    const agora = new Date(), b = [{ t: "tit", texto: "RELATÓRIO DE ANÁLISE DE IMAGENS" }];
    b.push({ t: "tab", larg: [1.4, 3], linhas: [["Processo ou caso", $("#caso").value.trim() || "não informado"], ["Responsável", $("#responsavel").value || "não informado"], ["Data e hora", agora.toLocaleString("pt-BR")], ["Arquivos analisados", String(E.imgs.length)]] });
    b.push({ t: "h", texto: "Metodologia" });
    b.push({ t: "p", r: "Os arquivos foram analisados localmente, sem envio a servidores. Para cada um, calcularam-se os hashes SHA-256 e SHA-512, que identificam o arquivo de forma única e permitem demonstrar sua integridade ao longo da cadeia de custódia (CPP, arts. 158-A a 158-F). Os metadados embutidos (EXIF, XMP, IPTC e GPS) foram lidos com a biblioteca aberta exifr, e os indícios de edição foram apurados a partir deles." });
    b.push({ t: "p", r: "As observações deste relatório são indícios técnicos, e não conclusão pericial. A ausência de metadados é comum em imagens reenviadas por aplicativos e redes sociais. A demonstração de adulteração, ou da autenticidade, exige exame pericial sobre o arquivo original." });
    E.imgs.forEach((r, i) => {
      b.push({ t: "sub", texto: (i + 1) + ". " + r.nome });
      b.push({ t: "tab", larg: [1.4, 3], linhas: principais(r).map(([a, v]) => [a, String(v)]).concat([["SHA-256", r.sha256], ["SHA-512", r.sha512]]).concat(r.elaMedia != null ? [["Nível médio de erro (ELA)", r.elaMedia.toFixed(2)]] : []) });
      if (r.indicios.length) b.push({ t: "p", r: [["Observações: ", "bo"], [r.indicios.map(x => x.t).join(" "), "n"]] });
    });
    if (E.cmp.length) {
      b.push({ t: "h", texto: "Comparações entre imagens" });
      b.push({ t: "tab", cab: ["Imagens", "Semelhança", "Conclusão"], larg: [2, 0.9, 2.6], linhas: E.cmp.map(c => [c.a + " × " + c.b, Math.round(c.s * 100) + "%", c.conc]) });
    }
    b.push({ t: "data", texto: "Belo Horizonte, " + P.dataExtenso(agora) + "." });
    const adv = P.ADVOGADOS.find(a => a.nome === $("#responsavel").value); if (adv) b.push({ t: "ass", nome: adv.nome, linhas: ["OAB/" + adv.uf + " " + adv.oab] });
    try { P.baixar(await P.docx(b), "Analise de imagens - " + ($("#caso").value.trim() || "caso").replace(/[\\/:*?"<>|]+/g, " ")); } catch (e) { window.HUB.toast(e.message || "Não foi possível gerar o Word.", 5000); }
  };
})();
