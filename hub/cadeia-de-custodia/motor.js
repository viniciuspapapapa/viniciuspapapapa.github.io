/* Motor do verificador de cadeia de custódia.
   1) Ingestão local (PDF com camada de texto, OCR de páginas escaneadas e imagens, DOCX, TXT, hash SHA-256).
   2) Análise determinística: tipos de vestígio, peças processuais, critérios por etapa, identificadores e confrontos.
   Nada é enviado a servidores: todo o processamento ocorre no navegador. */
(function (root) {
  "use strict";
  const R = root.CC_REGRAS;

  /* ------------------------------------------------------------------ utilidades */
  const MARCAS = /[̀-ͯ]/g;
  function limpar(t) {
    return String(t || "")
      .normalize("NFC")
      .replace(/­/g, "")
      .replace(/(\w)-\s*\n\s*(\w)/g, "$1$2")
      .replace(/[\t\r\n\f\v ]+/g, " ")
      .replace(/ {2,}/g, " ")
      .trim();
  }
  function normalizar(t) {
    const n = t.normalize("NFD").replace(MARCAS, "").toLowerCase();
    return n.length === t.length ? n : null;
  }
  function prepararPagina(texto) {
    const orig = limpar(texto);
    const n = normalizar(orig);
    return n === null ? { texto: orig, norm: orig.normalize("NFD").replace(MARCAS, "").toLowerCase(), alinhado: false } : { texto: orig, norm: n, alinhado: true };
  }
  const cacheRe = new Map();
  function re(src) {
    let r = cacheRe.get(src);
    if (!r) { r = new RegExp(src, "g"); cacheRe.set(src, r); }
    r.lastIndex = 0;
    return r;
  }
  function trecho(pg, ini, fim, raio) {
    raio = raio || 140;
    const base = pg.alinhado ? pg.texto : pg.norm;
    const a = Math.max(0, ini - raio), b = Math.min(base.length, fim + raio);
    return { antes: (a > 0 ? "… " : "") + base.slice(a, ini), alvo: base.slice(ini, fim), depois: base.slice(fim, b) + (b < base.length ? " …" : "") };
  }
  function buscar(pg, src, max) {
    const out = []; const r = re(src); let m;
    while ((m = r.exec(pg.norm)) && out.length < (max || 50)) {
      if (m[0].length === 0) { r.lastIndex++; continue; }
      out.push({ ini: m.index, fim: m.index + m[0].length, m });
    }
    return out;
  }
  async function sha256(buf) {
    if (!(root.crypto && root.crypto.subtle)) return null;
    const h = await root.crypto.subtle.digest("SHA-256", buf);
    return Array.from(new Uint8Array(h)).map(b => b.toString(16).padStart(2, "0")).join("");
  }
  function luhn(d) {
    let s = 0;
    for (let i = 0; i < d.length; i++) {
      let x = +d[d.length - 1 - i];
      if (i % 2 === 1) { x *= 2; if (x > 9) x -= 9; }
      s += x;
    }
    return s % 10 === 0;
  }
  const MESES = { janeiro: 1, fevereiro: 2, marco: 3, abril: 4, maio: 5, junho: 6, julho: 7, agosto: 8, setembro: 9, outubro: 10, novembro: 11, dezembro: 12 };

  /* ------------------------------------------------------------------ ingestão (navegador) */
  let ocrPool = null;
  async function obterOCR(onLog) {
    if (ocrPool) return ocrPool;
    if (!root.Tesseract) throw new Error("Biblioteca de OCR indisponível (verifique a conexão).");
    const n = Math.max(1, Math.min(3, (root.navigator && navigator.hardwareConcurrency ? Math.floor(navigator.hardwareConcurrency / 2) : 2)));
    const workers = [];
    for (let i = 0; i < n; i++) {
      workers.push(await root.Tesseract.createWorker("por", 1, { logger: m => onLog && m.status && m.status.indexOf("loading") === 0 && onLog("OCR: " + m.status) }));
    }
    const fila = []; const livres = workers.slice();
    function proximo() {
      while (livres.length && fila.length) {
        const w = livres.shift(); const job = fila.shift();
        w.recognize(job.img).then(r => job.ok(r.data), job.err).finally(() => { livres.push(w); proximo(); });
      }
    }
    ocrPool = {
      reconhecer: img => new Promise((ok, err) => { fila.push({ img, ok, err }); proximo(); }),
      encerrar: async () => { for (const w of workers) await w.terminate(); ocrPool = null; },
      n
    };
    return ocrPool;
  }

  async function renderizarPagina(pdfPage, larguraAlvo) {
    const v1 = pdfPage.getViewport({ scale: 1 });
    const escala = Math.min(3, Math.max(1, (larguraAlvo || 1800) / v1.width));
    const vp = pdfPage.getViewport({ scale: escala });
    const c = document.createElement("canvas");
    c.width = Math.floor(vp.width); c.height = Math.floor(vp.height);
    const ctx = c.getContext("2d", { willReadFrequently: false });
    ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, c.width, c.height);
    await pdfPage.render({ canvasContext: ctx, viewport: vp }).promise;
    return c;
  }

  async function lerArquivo(file, opts, prog) {
    const buf = await file.arrayBuffer();
    const hash = await sha256(buf);
    const nome = file.name; const ext = (nome.split(".").pop() || "").toLowerCase();
    const doc = { id: "d" + Math.random().toString(36).slice(2, 9), nome, tipo: file.type || ext, tamanho: file.size, sha256: hash, modificado: file.lastModified ? new Date(file.lastModified).toISOString() : null, paginas: [], meta: null, especie: "outro" };
    const sinal = opts.sinal || { cancelado: false };

    if (ext === "pdf" || file.type === "application/pdf") {
      doc.especie = "pdf";
      const pdf = await root.pdfjsLib.getDocument({ data: new Uint8Array(buf.slice(0)) }).promise;
      doc._pdf = pdf;
      try { const md = await pdf.getMetadata(); doc.meta = { info: md && md.info ? md.info : null }; } catch (e) { /* sem metadados */ }
      const total = pdf.numPages;
      const pendentesOCR = [];
      for (let i = 1; i <= total; i++) {
        if (sinal.cancelado) throw new Error("Processamento cancelado.");
        const p = await pdf.getPage(i);
        const tc = await p.getTextContent();
        let t = "";
        for (const it of tc.items) { t += it.str; t += it.hasEOL ? "\n" : " "; }
        const util = t.replace(/\s/g, "").length;
        const pg = Object.assign({ n: i, ocr: false, conf: null }, prepararPagina(t));
        doc.paginas.push(pg);
        if (opts.ocr !== false && (opts.forcarOCR || util < (opts.minTexto || 40))) pendentesOCR.push({ pg, p });
        prog && prog({ etapa: "texto", arquivo: nome, atual: i, total });
      }
      if (pendentesOCR.length) {
        const pool = await obterOCR(m => prog && prog({ etapa: "log", msg: m }));
        let feitas = 0;
        await Promise.all(pendentesOCR.map(async ({ pg, p }) => {
          if (sinal.cancelado) return;
          const canvas = await renderizarPagina(p, opts.larguraOCR || 1800);
          const r = await pool.reconhecer(canvas);
          const novo = prepararPagina((opts.forcarOCR && pg.texto.length > 200 ? pg.texto + "\n" : "") + (r.text || ""));
          Object.assign(pg, novo, { ocr: true, conf: Math.round(r.confidence || 0) });
          feitas++;
          prog && prog({ etapa: "ocr", arquivo: nome, atual: feitas, total: pendentesOCR.length });
        }));
        if (sinal.cancelado) throw new Error("Processamento cancelado.");
      }
    } else if (/^(jpe?g|png|webp|bmp|gif)$/.test(ext) || /^image\//.test(file.type)) {
      doc.especie = "imagem";
      doc._url = URL.createObjectURL(file);
      if (root.exifr) {
        try { doc.meta = await root.exifr.parse(file, { tiff: true, exif: true, gps: true, xmp: true, iptc: true, icc: false, mergeOutput: true }); } catch (e) { doc.meta = null; }
      }
      try {
        const bmp = await createImageBitmap(file);
        doc.dimensoes = bmp.width + " × " + bmp.height + " px"; bmp.close && bmp.close();
      } catch (e) { /* ignora */ }
      let pg = Object.assign({ n: 1, ocr: false, conf: null }, prepararPagina(""));
      if (opts.ocr !== false) {
        prog && prog({ etapa: "ocr", arquivo: nome, atual: 0, total: 1 });
        const pool = await obterOCR(m => prog && prog({ etapa: "log", msg: m }));
        const r = await pool.reconhecer(file);
        pg = Object.assign({ n: 1, ocr: true, conf: Math.round(r.confidence || 0) }, prepararPagina(r.text || ""));
        prog && prog({ etapa: "ocr", arquivo: nome, atual: 1, total: 1 });
      }
      doc.paginas.push(pg);
    } else if (ext === "docx" && root.mammoth) {
      doc.especie = "docx";
      const r = await root.mammoth.extractRawText({ arrayBuffer: buf });
      fatiar(r.value || "").forEach((t, i) => doc.paginas.push(Object.assign({ n: i + 1, ocr: false, conf: null }, prepararPagina(t))));
    } else if (/^(txt|md|csv|html?|xml|json|rtf)$/.test(ext) || /^text\//.test(file.type)) {
      doc.especie = "texto";
      const t = new TextDecoder("utf-8").decode(buf);
      const partes = t.indexOf("\f") >= 0 ? t.split("\f") : fatiar(t);
      partes.forEach((p, i) => doc.paginas.push(Object.assign({ n: i + 1, ocr: false, conf: null }, prepararPagina(p))));
    } else {
      doc.especie = /^(mp4|mov|avi|mkv|webm|mp3|wav|ogg|m4a|opus|aac|flac|3gp)$/.test(ext) ? "midia" : "outro";
      if (doc.especie === "midia") doc._url = URL.createObjectURL(file);
    }
    return doc;
  }
  function fatiar(t) {
    const out = []; let i = 0;
    while (i < t.length) {
      let j = Math.min(t.length, i + 3500);
      if (j < t.length) { const k = t.lastIndexOf("\n", j); if (k > i + 1500) j = k; }
      out.push(t.slice(i, j)); i = j;
    }
    return out.length ? out : [""];
  }

  /* ------------------------------------------------------------------ análise */
  function indexar(docs) {
    const paginas = [];
    const multi = docs.filter(d => d.paginas.length).length > 1;
    docs.forEach((d, di) => d.paginas.forEach(p => {
      p.gid = paginas.length; p.doc = d.id; p.di = di;
      p.rot = (multi ? "Arq. " + (di + 1) + ", " : "") + "p. " + p.n;
      paginas.push(p);
    }));
    return paginas;
  }

  function classificarPecas(paginas) {
    for (const p of paginas) {
      const cabeca = p.norm.slice(0, 900);
      const achadas = [];
      for (const pc of R.PECAS) {
        const h = buscar({ norm: cabeca }, pc.re, 1);
        if (h.length) achadas.push({ id: pc.id, pos: h[0].ini });
      }
      achadas.sort((a, b) => a.pos - b.pos);
      p.pecas = achadas.map(a => a.id);
      p.peca = achadas.length ? achadas[0].id : null;
    }
    // Herança: página sem cabeçalho reconhecível continua a peça anterior do mesmo arquivo.
    let ant = null;
    for (const p of paginas) {
      if (!p.peca && ant && ant.doc === p.doc && ant.peca && p.norm.length > 0) { p.peca = ant.peca; p.herdada = true; }
      ant = p;
    }
  }

  function detectarCategorias(paginas) {
    return R.CATEGORIAS.map(c => {
      const pags = []; let mencoes = 0; const amostras = [];
      for (const p of paginas) {
        const h = buscar(p, c.termos, 200);
        if (h.length) {
          pags.push(p.gid); mencoes += h.length;
          if (amostras.length < 6) amostras.push(Object.assign({ gid: p.gid, ini: h[0].ini, fim: h[0].fim }, trecho(p, h[0].ini, h[0].fim, 110)));
        }
      }
      const ativo = mencoes >= 3 || (mencoes >= 1 && pags.length >= 1 && c.familia === "fisico" && mencoes >= 2);
      return { id: c.id, mencoes, paginas: pags, amostras, ativo: ativo || mencoes >= 3, sugerido: ativo };
    });
  }

  function paginasContexto(cat, paginas) {
    const s = new Set();
    for (const g of cat.paginas) { s.add(g); s.add(g - 1); s.add(g + 1); }
    return paginas.filter(p => s.has(p.gid) && paginas[p.gid] && paginas[p.gid].doc === p.doc);
  }

  function coletar(pags, padroes, max) {
    const ev = [];
    for (const src of padroes) {
      for (const p of pags) {
        const hs = buscar(p, src, 4);
        for (const h of hs) {
          if (ev.length >= (max || 10)) return ev;
          if (ev.some(e => e.gid === p.gid && Math.abs(e.ini - h.ini) < 40)) continue;
          ev.push(Object.assign({ gid: p.gid, ini: h.ini, fim: h.fim }, trecho(p, h.ini, h.fim)));
        }
      }
    }
    return ev;
  }

  /* ---------- identificadores ---------- */
  function grupoPeca(p) {
    if (!p.peca) return "outros";
    if (["apreensao", "flagrante", "bo", "depoimento"].includes(p.peca)) return "apreensao";
    if (p.peca === "constatacao") return "constatacao";
    if (["laudo"].includes(p.peca)) return "laudo";
    if (["custodia", "requisicao"].includes(p.peca)) return "custodia";
    return "outros";
  }

  function extrairIdentificadores(paginas, cats) {
    const ativos = new Set(cats.filter(c => c.ativo).map(c => c.id));
    const pagCat = id => new Set((cats.find(c => c.id === id) || { paginas: [] }).paginas);
    const out = { imei: [], lacres: [], hashes: [], pesos: [], capacidades: [], datas: [], hashMencoes: 0 };
    const viz = set => { const o = new Set(); for (const g of set) { o.add(g - 1); o.add(g); o.add(g + 1); } return o; };
    const pDrog = viz(pagCat("drogas")); const pInf = new Set([...pagCat("informatica"), ...pagCat("celular")]);

    for (const p of paginas) {
      const g = grupoPeca(p);
      for (const h of buscar(p, "imei\\s*(?:[0-9]\\s*)?[^0-9a-z]{0,22}((?:\\d[\\s.\\-/]?){14}\\d)", 30)) {
        const d = h.m[1].replace(/\D/g, "");
        if (d.length === 15) out.imei.push({ valor: d, valido: luhn(d), gid: p.gid, grupo: g, t: trecho(p, h.ini, h.fim, 70) });
      }
      for (const h of buscar(p, "lacres?(?: de seguranca)?(?: (?:n[º°o.]*s?|numero|sob (?:o )?(?:n[º°o.]*|numero)))?\\s*[:.\\-]?\\s*((?:[a-z]{1,4}\\s?-?\\s?)?\\d[\\d.\\-/]{2,14}\\d)", 40)) {
        const v = h.m[1].replace(/[\s.\-]/g, "").toUpperCase();
        if (/^\d{1,2}\/\d{1,2}\/\d{2,4}$/.test(h.m[1])) continue;
        out.lacres.push({ valor: v, gid: p.gid, grupo: g, t: trecho(p, h.ini, h.fim, 70) });
      }
      out.hashMencoes += buscar(p, "\\bhash\\b|sha-?(1|256|512)\\b|\\bmd5\\b", 50).length;
      for (const h of buscar(p, "\\b([0-9a-f]{128}|[0-9a-f]{64}|[0-9a-f]{40}|[0-9a-f]{32})\\b", 40)) {
        const v = h.m[1];
        if (!/[a-f]/.test(v) || !/\d/.test(v)) continue;
        const alg = { 32: "MD5", 40: "SHA-1", 64: "SHA-256", 128: "SHA-512" }[v.length];
        out.hashes.push({ valor: v, alg, gid: p.gid, grupo: g, t: trecho(p, h.ini, h.fim, 60) });
      }
      if (pDrog.has(p.gid)) {
        for (const h of buscar(p, "((?:massa|peso) (?:bruta?|liquida?|bruto|liquido|total)[^0-9]{0,25})?\\b(\\d{1,3}(?:\\.\\d{3})+|\\d+)(?:,(\\d+))?\\s?(kg|quilos?|quilogramas?|gramas?|gr|g|mg|9)\\b", 40)) {
          if (h.m[4] === "9" && !h.m[1]) continue;
          const inteiro = h.m[2].replace(/\./g, ""); const dec = h.m[3] || "0";
          let v = parseFloat(inteiro + "." + dec); const u = h.m[4];
          if (/^(kg|quilo)/.test(u)) v *= 1000; else if (u === "mg") v /= 1000;
          if (!isFinite(v) || v <= 0) continue;
          const rotulo = h.m[1] ? (/liquid/.test(h.m[1]) ? "líquida" : /brut/.test(h.m[1]) ? "bruta" : "total") : "";
          out.pesos.push({ gramas: v, rotulo, gid: p.gid, grupo: g, t: trecho(p, h.ini, h.fim, 70) });
        }
      }
      if (pInf.has(p.gid)) {
        for (const h of buscar(p, "\\b(\\d{1,4}(?:,\\d+)?)\\s?(gb|tb|mb)\\b", 20)) {
          out.capacidades.push({ valor: h.m[1].replace(",", ".") + " " + h.m[2].toUpperCase(), gid: p.gid, grupo: g, t: trecho(p, h.ini, h.fim, 60) });
        }
      }
      const cab = p.norm.slice(0, 2500);
      const vistos = new Set();
      for (const h of buscar({ norm: cab }, "\\b(\\d{1,2})[/.](\\d{1,2})[/.](\\d{4}|\\d{2})\\b", 12)) {
        let [d, m, a] = [+h.m[1], +h.m[2], +h.m[3]]; if (a < 100) a += 2000;
        if (d < 1 || d > 31 || m < 1 || m > 12 || a < 1990 || a > 2100) continue;
        const iso = a + "-" + String(m).padStart(2, "0") + "-" + String(d).padStart(2, "0");
        if (!vistos.has(iso)) { vistos.add(iso); out.datas.push({ iso, gid: p.gid, peca: p.peca, grupo: g, t: trecho(p, h.ini, h.fim, 60) }); }
      }
      for (const h of buscar({ norm: cab }, "\\b(\\d{1,2})(?:º|°|o)? de (janeiro|fevereiro|marco|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro) de (\\d{4})\\b", 6)) {
        const iso = h.m[3] + "-" + String(MESES[h.m[2]]).padStart(2, "0") + "-" + String(+h.m[1]).padStart(2, "0");
        if (!vistos.has(iso)) { vistos.add(iso); out.datas.push({ iso, gid: p.gid, peca: p.peca, grupo: g, t: trecho(p, h.ini, h.fim, 60) }); }
      }
    }
    out.ativos = ativos;
    return out;
  }

  function conjuntos(lista, campo) {
    const m = {};
    for (const x of lista) { (m[x.grupo] = m[x.grupo] || new Set()).add(x[campo]); }
    return m;
  }

  function confrontos(ids, paginas) {
    const inc = []; const calc = {};
    const rotP = gid => paginas[gid] ? paginas[gid].rot : "";
    // IMEI
    for (const x of ids.imei) if (!x.valido) inc.push({ tipo: "imei", grav: "relevante", titulo: "IMEI com dígito verificador inválido", texto: "O IMEI " + x.valor + " (" + rotP(x.gid) + ") não passa na verificação de Luhn. Trata-se de erro material ou de leitura (inclusive por OCR) que deve ser conferido, pois a identificação unívoca do aparelho é condição do juízo de mesmidade.", gids: [x.gid], prec: [19, 55] });
    const ci = conjuntos(ids.imei, "valor");
    if (ci.apreensao && ci.laudo) {
      const so1 = [...ci.apreensao].filter(v => !ci.laudo.has(v)); const so2 = [...ci.laudo].filter(v => !ci.apreensao.has(v));
      if (so1.length || so2.length) inc.push({ tipo: "imei", grav: "critico", titulo: "IMEI divergente entre apreensão e laudo", texto: (so1.length ? "Constam da apreensão e não do laudo: " + so1.join(", ") + ". " : "") + (so2.length ? "Constam do laudo e não da apreensão: " + so2.join(", ") + ". " : "") + "A divergência compromete a correspondência entre o aparelho apreendido e o aparelho examinado.", gids: ids.imei.filter(x => so1.includes(x.valor) || so2.includes(x.valor)).map(x => x.gid), prec: [19, 55] });
    }
    // Lacres
    const cl = conjuntos(ids.lacres, "valor");
    const lacApr = cl.apreensao || new Set(); const lacLau = new Set([...(cl.laudo || []), ...(cl.constatacao || [])]);
    if (lacApr.size && lacLau.size) {
      const comuns = [...lacLau].filter(v => lacApr.has(v));
      const soLaudo = [...lacLau].filter(v => !lacApr.has(v));
      if (!comuns.length) {
        calc.G12 = { status: "irregular", gids: ids.lacres.map(x => x.gid) };
        inc.push({ tipo: "lacre", grav: "critico", titulo: "Lacre do laudo não corresponde ao lacre da apreensão", texto: "Lacres registrados na apreensão: " + [...lacApr].join(", ") + ". Lacres consignados no exame: " + [...lacLau].join(", ") + ". Não há coincidência entre eles, e a diferença só se justificaria por rompimento e relacração devidamente registrados na ficha de acompanhamento (art. 158-D, § 4º, do CPP).", gids: ids.lacres.map(x => x.gid), prec: [13, 16] });
      } else {
        calc.G12 = { status: "documentado", gids: ids.lacres.filter(x => comuns.includes(x.valor)).map(x => x.gid) };
        if (soLaudo.length) inc.push({ tipo: "lacre", grav: "relevante", titulo: "Lacre adicional no exame", texto: "O exame consigna lacre(s) não registrado(s) na apreensão (" + soLaudo.join(", ") + "). Verifique se houve relacração documentada.", gids: ids.lacres.filter(x => soLaudo.includes(x.valor)).map(x => x.gid), prec: [] });
      }
    } else if (lacApr.size && !lacLau.size && paginas.some(p => grupoPeca(p) === "laudo")) {
      inc.push({ tipo: "lacre", grav: "relevante", titulo: "Laudo não consigna o lacre recebido", texto: "Há lacre registrado na apreensão (" + [...lacApr].join(", ") + "), mas nenhuma numeração de lacre foi localizada nas peças periciais, o que impede o confronto (art. 158-D do CPP).", gids: ids.lacres.map(x => x.gid), prec: [] });
      calc.G12 = { status: "ausente", gids: [] };
    }
    // Hashes
    if (ids.hashes.length) {
      const porValor = {};
      for (const h of ids.hashes) (porValor[h.valor] = porValor[h.valor] || []).push(h);
      const confrontados = Object.values(porValor).filter(l => new Set(l.map(x => x.gid)).size >= 2);
      if (confrontados.length) calc.D07 = { status: "documentado", gids: confrontados.flat().map(x => x.gid) };
      else {
        calc.D07 = { status: "ausente", gids: ids.hashes.map(x => x.gid) };
        inc.push({ tipo: "hash", grav: "relevante", titulo: "Hash registrado em um único ponto da cadeia", texto: "Foram localizados " + ids.hashes.length + " valor(es) hash, mas nenhum se repete em outra peça. Sem a repetição do valor na coleta, no exame e na cópia entregue, não há confronto que demonstre a integridade (AgRg no RHC 184.003/SP).", gids: ids.hashes.map(x => x.gid), prec: [23, 28, 35] });
      }
    } else if (ids.hashMencoes > 0) {
      inc.push({ tipo: "hash", grav: "relevante", titulo: "Menção a hash sem consignação do valor", texto: "Os autos mencionam hash (" + ids.hashMencoes + " ocorrência(s)), mas nenhum valor hexadecimal foi localizado. Sem o valor consignado, não há como conferir a integridade do material.", gids: [], prec: [22, 27] });
    }
    // Pesos de droga
    const gp = {};
    for (const x of ids.pesos) if (x.grupo !== "outros") (gp[x.grupo] = gp[x.grupo] || []).push(x);
    const grupos = Object.keys(gp);
    if (grupos.length >= 2) {
      const perto = (a, b) => Math.abs(a - b) <= Math.max(0.05, 0.02 * Math.max(a, b));
      const ref = gp.laudo || gp.constatacao; const outros = grupos.filter(g => gp[g] !== ref);
      let semPar = [];
      for (const g of outros) for (const x of gp[g]) if (!ref.some(y => perto(x.gramas, y.gramas))) semPar.push(x);
      if (semPar.length && semPar.length >= gp[outros[0]].length) {
        calc.T03 = { status: "controverso", gids: ids.pesos.map(x => x.gid) };
        const brutoLiquido = semPar.every(x => x.rotulo === "bruta") && ref.some(y => y.rotulo === "líquida");
        inc.push(brutoLiquido
          ? { tipo: "peso", grav: "relevante", titulo: "Massa bruta sem correspondência com a massa líquida periciada", texto: "A apreensão e a constatação registram apenas massa bruta (" + semPar.map(x => x.gramas.toLocaleString("pt-BR") + " g").join(", ") + "), enquanto o exame pericial informa massa líquida (" + ref.filter(y => y.rotulo === "líquida").map(y => y.gramas.toLocaleString("pt-BR") + " g").join(", ") + "). Sem a pesagem líquida inicial ou a indicação do peso das embalagens, não há como confirmar que a quantidade examinada corresponde à apreendida.", gids: ids.pesos.map(x => x.gid), prec: ["comp-01"] }
          : { tipo: "peso", grav: "critico", titulo: "Pesos não coincidentes entre as peças", texto: "Os valores de massa registrados na apreensão ou na constatação não encontram correspondência nos valores do exame pericial. Compare o quadro de pesos e verifique se a diferença decorre da distinção entre massa bruta e líquida ou de efetiva divergência do material.", gids: ids.pesos.map(x => x.gid), prec: ["comp-01"] });
      } else calc.T03 = { status: "documentado", gids: ids.pesos.map(x => x.gid) };
    }
    // Capacidades de armazenamento
    const cc = conjuntos(ids.capacidades, "valor");
    if (cc.apreensao && cc.laudo) {
      const dif = [...cc.apreensao].filter(v => !cc.laudo.has(v));
      if (dif.length) inc.push({ tipo: "capacidade", grav: "relevante", titulo: "Capacidade de armazenamento divergente", texto: "A apreensão descreve mídia(s) de " + [...cc.apreensao].join(", ") + ", enquanto o exame refere " + [...cc.laudo].join(", ") + ". Divergência dessa natureza foi decisiva no RHC 174.325/PR (pen drive de 8 GB no auto e de 16 GB na certidão).", gids: ids.capacidades.map(x => x.gid), prec: [19] });
    }
    // Cronologia
    const ev = ids.datas.filter(d => d.peca).sort((a, b) => a.iso < b.iso ? -1 : 1);
    const primeira = id => ev.find(d => d.peca === id);
    const apr = primeira("apreensao") || primeira("flagrante");
    const lau = ev.filter(d => d.peca === "laudo");
    if (apr && lau.length) {
      const ultimoLaudo = lau[lau.length - 1];
      const dias = Math.round((new Date(ultimoLaudo.iso) - new Date(apr.iso)) / 864e5);
      if (lau.every(d => d.iso < apr.iso)) inc.push({ tipo: "data", grav: "relevante", titulo: "Peça pericial datada antes da apreensão", texto: "As datas localizadas nas peças periciais são anteriores à data estimada da apreensão (" + fmtData(apr.iso) + "). Confira se se trata de erro material, de data de outro evento ou de efetiva incoerência cronológica.", gids: [apr.gid].concat(lau.map(d => d.gid)), prec: [] });
      else if (dias > 30) inc.push({ tipo: "data", grav: "info", titulo: "Lapso entre apreensão e exame", texto: "Entre a data estimada da apreensão (" + fmtData(apr.iso) + ") e a data mais recente nas peças periciais (" + fmtData(ultimoLaudo.iso) + ") decorreram cerca de " + dias + " dias. O intervalo reforça a necessidade de documentação do armazenamento e de cada acesso ao vestígio (arts. 158-B, IX, e 158-E, §§ 3º e 4º, do CPP).", gids: [apr.gid, ultimoLaudo.gid], prec: [] });
    }
    return { inc, calc, linhaDoTempo: ev };
  }
  function fmtData(iso) { const [a, m, d] = iso.split("-"); return d + "/" + m + "/" + a; }

  function avaliar(paginas, cats, calc) {
    const res = {};
    for (const cat of cats) {
      if (!cat.ativo) continue;
      const ctx = paginasContexto(cat, paginas);
      res[cat.id] = {};
      for (const c of R.CRITERIOS) {
        if (c.cats && !c.cats.includes(cat.id)) continue;
        const pags = c.contexto ? ctx : paginas;
        const pos = coletar(pags, c.pos, 8); const neg = coletar(pags, c.neg, 8);
        let status;
        if (c.inverso) status = neg.length ? "irregular" : "sem_indicio";
        else if (neg.length && pos.length) status = "controverso";
        else if (neg.length) status = "irregular";
        else if (pos.length) status = "documentado";
        else status = "ausente";
        if (c.calculado && calc[c.id] && !neg.length) {
          if (!(calc[c.id].status === "ausente" && pos.length)) status = calc[c.id].status;
        }
        if (c.id === "G12" && calc.G12 && calc.G12.status === "irregular") status = "irregular";
        res[cat.id][c.id] = { auto: status, pos, neg, calcGids: calc[c.id] ? calc[c.id].gids : [] };
      }
    }
    return res;
  }

  function alertas(paginas) {
    return R.ALERTAS.map(a => {
      const ev = [];
      for (const p of paginas) for (const h of buscar(p, a.re, 5)) { if (ev.length < 30) ev.push(Object.assign({ gid: p.gid, ini: h.ini, fim: h.fim }, trecho(p, h.ini, h.fim, 110))); }
      return Object.assign({}, a, { ev });
    }).filter(a => a.ev.length);
  }

  /* Status final de um critério, considerando a revisão humana. */
  function statusFinal(r) { return (r && r.rev) || (r && r.auto) || "ausente"; }

  const PESOS = { critico: 3, relevante: 2, formal: 1 };
  function classificar(resCat) {
    let total = 0, ok = 0, critIrreg = 0, critAus = 0, relProb = 0, controversos = 0;
    const porCrit = R.CRITERIOS.reduce((m, c) => (m[c.id] = c, m), {});
    for (const id in resCat) {
      const c = porCrit[id]; const st = statusFinal(resCat[id]);
      if (st === "na" || st === "sem_indicio") continue;
      const w = PESOS[c.peso]; total += w;
      if (st === "documentado" || st === "conforme") ok += w;
      if (st === "controverso") controversos++;
      if (c.peso === "critico" && st === "irregular") critIrreg++;
      if (c.peso === "critico" && st === "ausente") critAus++;
      if (c.peso === "relevante" && (st === "irregular" || st === "ausente")) relProb++;
    }
    let nivel, rot;
    if (critIrreg >= 1 || critAus >= 2) { nivel = "quebra"; rot = "Indicativo de quebra da cadeia"; }
    else if (critAus === 1 || relProb >= 2 || controversos >= 2) { nivel = "fragil"; rot = "Fragilidades relevantes"; }
    else if (relProb >= 1 || controversos === 1) { nivel = "formal"; rot = "Irregularidades pontuais"; }
    else { nivel = "integra"; rot = "Sem irregularidades aparentes"; }
    return { nivel, rot, conformidade: total ? Math.round(100 * ok / total) : 0, critIrreg, critAus, relProb, controversos };
  }

  function analisar(docs, opcoes) {
    opcoes = opcoes || {};
    const paginas = indexar(docs);
    classificarPecas(paginas);
    const cats = detectarCategorias(paginas);
    if (opcoes.ativos) for (const c of cats) c.ativo = opcoes.ativos.includes(c.id);
    const ids = extrairIdentificadores(paginas, cats);
    const conf = confrontos(ids, paginas);
    const crit = avaliar(paginas, cats, conf.calc);
    return {
      versao: 1, criadoEm: new Date().toISOString(),
      totalPaginas: paginas.length,
      paginasOCR: paginas.filter(p => p.ocr).length,
      paginasBaixaConf: paginas.filter(p => p.ocr && p.conf !== null && p.conf < 60).map(p => p.gid),
      paginasVazias: paginas.filter(p => p.norm.replace(/\s/g, "").length < 15).map(p => p.gid),
      categorias: cats, criterios: crit, identificadores: ids, inconsistencias: conf.inc, linhaDoTempo: conf.linhaDoTempo,
      alertas: alertas(paginas), calc: conf.calc
    };
  }

  /* Reavalia uma categoria ativada manualmente, preservando revisões existentes. */
  function reavaliar(docs, res) {
    const paginas = indexar(docs);
    const novo = analisar(docs, { ativos: res.categorias.filter(c => c.ativo).map(c => c.id) });
    for (const cat in novo.criterios) for (const id in novo.criterios[cat]) {
      const velho = res.criterios[cat] && res.criterios[cat][id];
      if (velho) { novo.criterios[cat][id].rev = velho.rev; novo.criterios[cat][id].nota = velho.nota; }
    }
    novo.ia = res.ia; novo.criadoEm = res.criadoEm;
    return { res: novo, paginas };
  }

  root.CC_MOTOR = { lerArquivo, analisar, reavaliar, indexar, classificar, statusFinal, prepararPagina, obterOCR, renderizarPagina, luhn, fmtData, encerrarOCR: async () => ocrPool && ocrPool.encerrar() };
})(typeof window !== "undefined" ? window : globalThis);
