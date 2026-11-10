/* Registro das ferramentas de PDF: nome, categoria, arquivos aceitos, opções e execução.
   Cada execução recebe { arquivos, op, ctx } e devolve { saidas: [{nome, blob}], html?, nota? }. */
(function (root) {
  "use strict";
  const X = root.PDFX, esc = s => root.HUB.esc(s);
  const PDF = ".pdf,application/pdf", IMG = "image/jpeg,image/png,image/webp,image/gif,image/bmp,.jpg,.jpeg,.png,.webp,.gif,.bmp";
  const salvar = async (doc, obj) => X.pdfBlob(await doc.save({ useObjectStreams: obj !== false }));
  const so1 = a => a[0];
  const nomeSaida = (f, suf, ext) => X.base(f.name) + (suf ? "_" + suf : "") + "." + (ext || "pdf");
  const SIMNAO = [["sim", "Sim"], ["nao", "Não"]];
  const F = [];
  const def = t => F.push(t);

  /* ================================================================== Organizar */
  def({ id: "juntar", cat: "Organizar", nome: "Juntar PDF", desc: "Una vários PDFs em um só, na ordem que preferir.", aceita: PDF, multi: true, min: 2, botao: "Juntar os PDFs", ordenar: true,
    async executar({ arquivos, ui }) {
      await X.carregar("pdflib"); const out = await root.PDFLib.PDFDocument.create();
      for (let i = 0; i < arquivos.length; i++) {
        ui.prog("Juntando " + arquivos[i].name, i / arquivos.length);
        const d = await X.abrirLib(await X.bytesDe(arquivos[i])); (await out.copyPages(d, d.getPageIndices())).forEach(p => out.addPage(p));
      }
      return { saidas: [{ nome: "PDF_unido.pdf", blob: await salvar(out) }], nota: out.getPageCount() + " páginas de " + arquivos.length + " arquivos." };
    } });

  def({ id: "dividir", cat: "Organizar", nome: "Dividir PDF", desc: "Separe intervalos de páginas ou transforme cada página em um PDF independente.", aceita: PDF, botao: "Dividir o PDF",
    opcoes: [{ id: "modo", tipo: "select", rot: "Como dividir", valores: [["intervalos", "Por intervalos"], ["fixo", "A cada N páginas"], ["todas", "Cada página em um arquivo"]], padrao: "intervalos" },
      { id: "intervalos", tipo: "texto", rot: "Intervalos (um arquivo por intervalo)", padrao: "1-2, 3-", dica: "Ex.: 1-3, 4-6, 7-", mostrar: o => o.modo === "intervalos" },
      { id: "n", tipo: "numero", rot: "Páginas por arquivo", padrao: 2, min: 1, mostrar: o => o.modo === "fixo" },
      { id: "unir", tipo: "check", rot: "Juntar os intervalos em um único PDF", mostrar: o => o.modo === "intervalos" }],
    async executar({ arquivos, op, ui }) {
      const f = so1(arquivos), d = await X.abrirLib(await X.bytesDe(f)), n = d.getPageCount();
      let gs = op.modo === "todas" ? d.getPageIndices().map(i => [i + 1]) : op.modo === "fixo" ? Array.from({ length: Math.ceil(n / Math.max(1, +op.n || 1)) }, (_, k) => Array.from({ length: Math.min(+op.n, n - k * op.n) }, (_, j) => k * op.n + j + 1)) : X.grupos(op.intervalos, n);
      if (!gs.length) throw new Error("Nenhum intervalo válido para um PDF de " + n + " páginas.");
      if (op.modo === "intervalos" && op.unir) gs = [gs.flat()];
      const saidas = [];
      for (let k = 0; k < gs.length; k++) {
        ui.prog("Gerando o arquivo " + (k + 1) + " de " + gs.length, k / gs.length);
        const o = await root.PDFLib.PDFDocument.create(); (await o.copyPages(d, gs[k].map(i => i - 1))).forEach(p => o.addPage(p));
        const g = gs[k]; saidas.push({ nome: X.base(f.name) + "_" + (g.length === 1 ? "pag" + g[0] : "pags" + g[0] + "-" + g[g.length - 1]) + ".pdf", blob: await salvar(o) });
      }
      return { saidas, zip: saidas.length > 1 ? X.base(f.name) + "_dividido.zip" : null };
    } });

  async function gradeSel(mesa, ctx, modo) {
    mesa.innerHTML = ""; ctx.grade = X.Grade(mesa, { modo: modo || "selecionar" });
    await ctx.grade.adicionar(await X.bytesDe(ctx.arquivos[0]), ctx.arquivos[0].name);
  }
  def({ id: "remover", cat: "Organizar", nome: "Remover páginas", desc: "Exclua páginas do PDF clicando nelas ou indicando os números.", aceita: PDF, botao: "Remover as páginas", interativo: (m, c) => gradeSel(m, c),
    opcoes: [{ id: "intervalos", tipo: "texto", rot: "Ou informe as páginas a remover", padrao: "", dica: "Ex.: 2, 5-7" }],
    async executar({ arquivos, op, ctx }) {
      const pags = ctx.grade.paginas(), n = pags.length, tirar = new Set(op.intervalos ? X.intervalos(op.intervalos, n) : []);
      pags.forEach((p, i) => { if (p.sel) tirar.add(i + 1); });
      if (!tirar.size) throw new Error("Selecione as páginas a remover.");
      if (tirar.size >= n) throw new Error("Não é possível remover todas as páginas.");
      const out = await ctx.grade.montar(p => !tirar.has(pags.indexOf(p) + 1));
      return { saidas: [{ nome: nomeSaida(arquivos[0], "sem_paginas"), blob: await salvar(out) }], nota: tirar.size + " páginas removidas; restaram " + (n - tirar.size) + "." };
    } });

  def({ id: "extrair", cat: "Organizar", nome: "Extrair páginas", desc: "Copie as páginas escolhidas para um novo PDF ou para arquivos separados.", aceita: PDF, botao: "Extrair as páginas", interativo: (m, c) => gradeSel(m, c),
    opcoes: [{ id: "intervalos", tipo: "texto", rot: "Ou informe as páginas a extrair", padrao: "", dica: "Ex.: 1, 3-4" }, { id: "separar", tipo: "check", rot: "Cada página em um arquivo separado" }],
    async executar({ arquivos, op, ctx }) {
      const pags = ctx.grade.paginas(), n = pags.length, sel = new Set(op.intervalos ? X.intervalos(op.intervalos, n) : []);
      pags.forEach((p, i) => { if (p.sel) sel.add(i + 1); });
      const lista = [...sel].sort((a, b) => a - b); if (!lista.length) throw new Error("Selecione as páginas a extrair.");
      const d = await X.abrirLib(await X.bytesDe(arquivos[0]));
      const gerar = async idx => { const o = await root.PDFLib.PDFDocument.create(); (await o.copyPages(d, idx.map(i => i - 1))).forEach(p => o.addPage(p)); return salvar(o); };
      const saidas = op.separar ? await Promise.all(lista.map(async i => ({ nome: nomeSaida(arquivos[0], "pag" + i), blob: await gerar([i]) }))) : [{ nome: nomeSaida(arquivos[0], "extraidas"), blob: await gerar(lista) }];
      return { saidas, zip: saidas.length > 1 ? X.base(arquivos[0].name) + "_paginas.zip" : null };
    } });

  def({ id: "organizar", cat: "Organizar", nome: "Organizar PDF", desc: "Reordene, gire, exclua e insira páginas em branco; acrescente outros PDFs.", aceita: PDF, multi: true, botao: "Salvar o PDF organizado",
    async interativo(mesa, ctx) {
      if (!ctx.grade) { mesa.innerHTML = ""; ctx.grade = X.Grade(mesa, { modo: "organizar" }); ctx.incluidos = 0; }
      while (ctx.incluidos < ctx.arquivos.length) { const f = ctx.arquivos[ctx.incluidos++]; await ctx.grade.adicionar(await X.bytesDe(f), f.name); }
    },
    async executar({ arquivos, ctx }) {
      if (!ctx.grade.paginas().length) throw new Error("Não há páginas.");
      const out = await ctx.grade.montar();
      return { saidas: [{ nome: nomeSaida(arquivos[0], "organizado"), blob: await salvar(out) }], nota: out.getPageCount() + " páginas." };
    } });

  def({ id: "digitalizar", cat: "Organizar", nome: "Digitalizar para PDF", desc: "Fotografe documentos com a câmera do celular e transforme as fotos em um PDF legível.", aceita: IMG, multi: true, captura: true, botao: "Gerar o PDF",
    opcoes: [{ id: "filtro", tipo: "select", rot: "Tratamento", valores: [["documento", "Documento (alto contraste)"], ["cinza", "Tons de cinza"], ["cor", "Cores originais"]], padrao: "documento" },
      { id: "tamanho", tipo: "select", rot: "Tamanho da página", valores: [["a4", "A4"], ["ajustar", "Igual à foto"]], padrao: "a4" }],
    async executar({ arquivos, op, ui }) {
      await X.carregar("pdflib"); const out = await root.PDFLib.PDFDocument.create();
      for (let i = 0; i < arquivos.length; i++) {
        ui.prog("Tratando a imagem " + (i + 1), i / arquivos.length);
        const bmp = await createImageBitmap(arquivos[i]), max = 2200, k = Math.min(1, max / Math.max(bmp.width, bmp.height));
        const cv = document.createElement("canvas"); cv.width = Math.round(bmp.width * k); cv.height = Math.round(bmp.height * k);
        const g = cv.getContext("2d"); g.drawImage(bmp, 0, 0, cv.width, cv.height);
        if (op.filtro !== "cor") {
          const im = g.getImageData(0, 0, cv.width, cv.height), d = im.data; let soma = 0;
          for (let p = 0; p < d.length; p += 4) { const y = 0.299 * d[p] + 0.587 * d[p + 1] + 0.114 * d[p + 2]; d[p] = d[p + 1] = d[p + 2] = y; soma += y; }
          if (op.filtro === "documento") {
            const med = soma / (d.length / 4), lo = med * 0.45, hi = Math.min(255, med * 1.02);
            for (let p = 0; p < d.length; p += 4) { const v = Math.max(0, Math.min(255, (d[p] - lo) * 255 / Math.max(1, hi - lo))); d[p] = d[p + 1] = d[p + 2] = v; }
          }
          g.putImageData(im, 0, 0);
        }
        const jpg = await out.embedJpg(new Uint8Array(await (await X.blobDe(cv, "image/jpeg", 0.85)).arrayBuffer()));
        if (op.tamanho === "a4") { const pw = cv.width > cv.height ? 841.89 : 595.28, ph = cv.width > cv.height ? 595.28 : 841.89, s = Math.min(pw / cv.width, ph / cv.height); const pg = out.addPage([pw, ph]); pg.drawImage(jpg, { x: (pw - cv.width * s) / 2, y: (ph - cv.height * s) / 2, width: cv.width * s, height: cv.height * s }); }
        else { const s = 72 / 150, pg = out.addPage([cv.width * s, cv.height * s]); pg.drawImage(jpg, { x: 0, y: 0, width: cv.width * s, height: cv.height * s }); }
      }
      return { saidas: [{ nome: "Digitalizacao.pdf", blob: await salvar(out) }] };
    } });

  /* ================================================================== Otimizar */
  async function inflar(bytes) { const s = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("deflate")); return new Uint8Array(await new Response(s).arrayBuffer()); }
  def({ id: "comprimir", cat: "Otimizar", nome: "Comprimir PDF", desc: "Reduza o tamanho do arquivo recomprimindo as imagens e a estrutura, sem perder o texto.", aceita: PDF, multi: true, botao: "Comprimir",
    opcoes: [{ id: "nivel", tipo: "select", rot: "Nível de compressão", valores: [["recomendada", "Recomendada (boa qualidade)"], ["extrema", "Extrema (menor arquivo)"], ["baixa", "Baixa (sem perda de qualidade)"]], padrao: "recomendada" }],
    async executar({ arquivos, op, ui }) {
      const { PDFName, PDFRawStream, PDFArray, PDFNumber } = (await X.carregar("pdflib"), root.PDFLib);
      const cfg = { recomendada: [1700, 0.72], extrema: [1100, 0.5], baixa: null }[op.nivel], saidas = [], notas = [];
      for (let k = 0; k < arquivos.length; k++) {
        const f = arquivos[k], orig = await X.bytesDe(f); let atual = orig, imgs = 0;
        if (cfg) {
          const doc = await X.abrirLib(orig), ctxp = doc.context, mascaras = new Set();
          const objs = ctxp.enumerateIndirectObjects();
          objs.forEach(([, o]) => { if (o instanceof PDFRawStream) { const m = o.dict.get(PDFName.of("SMask")) || o.dict.get(PDFName.of("Mask")); if (m && m.toString) mascaras.add(m.toString()); } });
          for (let i = 0; i < objs.length; i++) {
            const [ref, o] = objs[i];
            if (!(o instanceof PDFRawStream) || String(o.dict.get(PDFName.of("Subtype"))) !== "/Image" || mascaras.has(ref.toString())) continue;
            if (i % 5 === 0) ui.prog("Recomprimindo as imagens de " + f.name, (k + i / objs.length) / arquivos.length);
            try {
              let filtro = o.dict.get(PDFName.of("Filter")); if (filtro instanceof PDFArray) filtro = filtro.size() === 1 ? filtro.get(0) : null; filtro = filtro ? String(filtro) : "";
              const w = o.dict.get(PDFName.of("Width")).asNumber(), h = o.dict.get(PDFName.of("Height")).asNumber(), bpc = o.dict.get(PDFName.of("BitsPerComponent")), cs = String(o.dict.get(PDFName.of("ColorSpace")) || "");
              if (o.dict.get(PDFName.of("ImageMask")) || o.dict.get(PDFName.of("Decode")) || w * h < 40000) continue;
              let bmp = null;
              if (filtro === "/DCTDecode" && cs !== "/DeviceCMYK") bmp = await createImageBitmap(new Blob([o.contents], { type: "image/jpeg" }));
              else if (filtro === "/FlateDecode" && (cs === "/DeviceRGB" || cs === "/DeviceGray") && bpc && bpc.asNumber() === 8 && !o.dict.get(PDFName.of("DecodeParms"))) {
                const raw = await inflar(o.contents), nc = cs === "/DeviceRGB" ? 3 : 1; if (raw.length < w * h * nc) continue;
                const id = new ImageData(w, h); for (let p = 0, q = 0; p < w * h; p++, q += nc) { id.data[p * 4] = raw[q]; id.data[p * 4 + 1] = raw[q + (nc === 3 ? 1 : 0)]; id.data[p * 4 + 2] = raw[q + (nc === 3 ? 2 : 0)]; id.data[p * 4 + 3] = 255; }
                bmp = await createImageBitmap(id);
              } else continue;
              const s = Math.min(1, cfg[0] / Math.max(w, h)), cv = document.createElement("canvas"); cv.width = Math.max(1, Math.round(w * s)); cv.height = Math.max(1, Math.round(h * s));
              const g = cv.getContext("2d"); g.fillStyle = "#fff"; g.fillRect(0, 0, cv.width, cv.height); g.drawImage(bmp, 0, 0, cv.width, cv.height);
              const novo = new Uint8Array(await (await X.blobDe(cv, "image/jpeg", cfg[1])).arrayBuffer());
              if (novo.length >= o.contents.length * 0.92) continue;
              const st = ctxp.stream(novo, { Type: "XObject", Subtype: "Image", Width: cv.width, Height: cv.height, ColorSpace: "DeviceRGB", BitsPerComponent: 8, Filter: "DCTDecode" });
              ["SMask", "Interpolate", "Intent"].forEach(c => { const v = o.dict.get(PDFName.of(c)); if (v) st.dict.set(PDFName.of(c), v); });
              ctxp.assign(ref, st); imgs++;
            } catch (e) { /* imagem mantida como está */ }
          }
          atual = await doc.save({ useObjectStreams: true });
        }
        ui.prog("Otimizando a estrutura de " + f.name, (k + 0.9) / arquivos.length);
        try { const r = await X.qpdf(["/e.pdf", "--object-streams=generate", "--compress-streams=y", "--recompress-flate", "--compression-level=9", "--remove-unreferenced-resources=yes", "/s.pdf"], { "/e.pdf": atual }, ["/s.pdf"]); if (r["/s.pdf"] && r["/s.pdf"].length < atual.length) atual = r["/s.pdf"]; } catch (e) { /* mantém o resultado do pdf-lib */ }
        if (atual.length >= orig.length) atual = orig;
        const red = Math.round((1 - atual.length / orig.length) * 100);
        notas.push(f.name + ": " + X.tam(orig.length) + " para " + X.tam(atual.length) + (red > 0 ? " (" + red + "% menor" + (imgs ? ", " + imgs + " imagens recomprimidas" : "") + ")" : " (o arquivo já estava otimizado)"));
        saidas.push({ nome: nomeSaida(f, "comprimido"), blob: X.pdfBlob(atual) });
      }
      return { saidas, zip: saidas.length > 1 ? "PDFs_comprimidos.zip" : null, nota: notas.join(" ") };
    } });

  def({ id: "reparar", cat: "Otimizar", nome: "Reparar PDF", desc: "Reconstrua a estrutura de um PDF danificado e recupere o conteúdo legível.", aceita: PDF, multi: true, botao: "Reparar",
    async executar({ arquivos, ui }) {
      const saidas = [], notas = [];
      for (const f of arquivos) {
        ui.prog("Reparando " + f.name, 0.3); await X.carregar("pdflib"); const b = await X.bytesDe(f); let out = null, via = "";
        for (const extra of [[], ["--ignore-xref"]]) {
          if (out) break;
          try { const r = await X.qpdf(extra.concat(["/e.pdf", "--object-streams=preserve", "/s.pdf"]), { "/e.pdf": b }, ["/s.pdf"]); out = r["/s.pdf"]; via = extra.length || r.avisos.some(a => /warning|recover|reconstruct|expected/i.test(a)) ? "estrutura reconstruída (" + Math.max(1, r.avisos.length) + " problemas corrigidos)" : "estrutura regravada; nenhum dano encontrado"; } catch (e) { via = e.message; }
        }
        if (!out) { try { const d = await root.PDFLib.PDFDocument.load(b, { ignoreEncryption: true, throwOnInvalidObject: false }); out = await d.save(); via = "regravado pelo leitor tolerante"; } catch (e) { /* segue para a última via */ } }
        if (!out) {
          const pdf = await X.abrirJs(b), o = await root.PDFLib.PDFDocument.create();
          for (let i = 1; i <= pdf.numPages; i++) { try { const pg = await pdf.getPage(i), cv = await X.renderizar(pg, 2), j = await o.embedJpg(new Uint8Array(await (await X.blobDe(cv, "image/jpeg", 0.9)).arrayBuffer())), vp = pg.getViewport({ scale: 1 }); o.addPage([vp.width, vp.height]).drawImage(j, { x: 0, y: 0, width: vp.width, height: vp.height }); } catch (e) { /* página irrecuperável */ } }
          if (!o.getPageCount()) throw new Error(f.name + ": não foi possível recuperar nenhuma página.");
          out = await o.save(); via = "páginas recuperadas como imagem";
        }
        notas.push(f.name + ": " + via + "."); saidas.push({ nome: nomeSaida(f, "reparado"), blob: X.pdfBlob(out) });
      }
      return { saidas, zip: saidas.length > 1 ? "PDFs_reparados.zip" : null, nota: notas.join(" ") };
    } });

  def({ id: "ocr", cat: "Otimizar", nome: "OCR PDF", desc: "Torne pesquisável e selecionável o texto de um PDF digitalizado.", aceita: PDF, botao: "Aplicar OCR",
    opcoes: [{ id: "lingua", tipo: "select", rot: "Idioma do documento", valores: [["por", "Português"], ["eng", "Inglês"], ["spa", "Espanhol"], ["por+eng", "Português e inglês"]], padrao: "por" },
      { id: "pular", tipo: "check", rot: "Pular as páginas que já têm texto", padrao: true }],
    async executar({ arquivos, op, ui }) {
      await X.carregar("pdflib"); const f = so1(arquivos), b = await X.bytesDe(f), pdf = await X.abrirJs(b), doc = await X.abrirLib(b);
      ui.prog("Preparando o reconhecimento de texto (na primeira vez, o idioma é baixado)", 0.02);
      const w = await X.tesseract(op.lingua || "por"); let feitas = 0;
      try {
        for (let i = 1; i <= pdf.numPages; i++) {
          const pg = await pdf.getPage(i);
          if (op.pular) { const tc = await pg.getTextContent(); if (tc.items.filter(t => t.str.trim()).length > 8) continue; }
          ui.prog("Reconhecendo o texto da página " + i + " de " + pdf.numPages, i / pdf.numPages);
          const vp = pg.getViewport({ scale: 1, rotation: 0 }), cv = await X.renderizar(pg, 300 / 72);
          const r = await w.recognize(cv, {}, { pdf: true, text: false });
          const camada = await root.PDFLib.PDFDocument.load(new Uint8Array(r.data.pdf));
          const [emb] = await doc.embedPdf(camada, [0]), page = doc.getPage(i - 1), ang = page.getRotation().angle, { width: W, height: H } = page.getSize();
          const cw = ang % 180 ? H : W, ch = ang % 180 ? W : H;
          const tx = emb; const ops = { x: 0, y: 0, width: cw, height: ch };
          if (ang === 90) Object.assign(ops, { x: W, y: 0, rotate: root.PDFLib.degrees(90) }); else if (ang === 180) Object.assign(ops, { x: W, y: H, rotate: root.PDFLib.degrees(180) }); else if (ang === 270) Object.assign(ops, { x: 0, y: H, rotate: root.PDFLib.degrees(270) });
          page.drawPage(tx, ops); feitas++; void vp;
        }
      } finally { await w.terminate(); }
      return { saidas: [{ nome: nomeSaida(f, "OCR"), blob: await salvar(doc) }], nota: feitas ? "Texto reconhecido em " + feitas + (feitas === 1 ? " página." : " páginas.") : "Todas as páginas já tinham texto; nada foi alterado." };
    } });

  /* ================================================================== Converter em PDF */
  def({ id: "jpg-pdf", cat: "Converter em PDF", nome: "Imagem para PDF", desc: "Converta fotos e imagens (JPG, PNG, WEBP) em PDF, com orientação e margens.", aceita: IMG, multi: true, botao: "Converter em PDF", ordenar: true,
    opcoes: [{ id: "tamanho", tipo: "select", rot: "Tamanho", valores: [["a4", "A4"], ["carta", "Carta"], ["ajustar", "Igual à imagem"]], padrao: "a4" },
      { id: "orient", tipo: "select", rot: "Orientação", valores: [["auto", "Automática"], ["retrato", "Retrato"], ["paisagem", "Paisagem"]], padrao: "auto", mostrar: o => o.tamanho !== "ajustar" },
      { id: "margem", tipo: "select", rot: "Margem", valores: [["0", "Sem margem"], ["20", "Pequena"], ["40", "Grande"]], padrao: "20" },
      { id: "unir", tipo: "check", rot: "Todas as imagens em um único PDF", padrao: true }],
    async executar({ arquivos, op, ui }) {
      await X.carregar("pdflib"); const { PDFDocument } = root.PDFLib, docs = [], m = +op.margem;
      let atual = null;
      for (let i = 0; i < arquivos.length; i++) {
        ui.prog("Convertendo " + arquivos[i].name, i / arquivos.length);
        if (!atual || !op.unir) { atual = await PDFDocument.create(); docs.push({ doc: atual, f: arquivos[i] }); }
        const f = arquivos[i]; let img;
        if (/png/i.test(f.type)) img = await atual.embedPng(await X.bytesDe(f));
        else if (/jpe?g/i.test(f.type)) img = await atual.embedJpg(await X.bytesDe(f));
        else img = await atual.embedJpg((await X.imagemParaJpeg(f)).bytes);
        let pw, ph;
        if (op.tamanho === "ajustar") { pw = img.width * 0.75 + 2 * m; ph = img.height * 0.75 + 2 * m; }
        else { const [a, b] = op.tamanho === "carta" ? [612, 792] : [595.28, 841.89], deitada = op.orient === "paisagem" || (op.orient === "auto" && img.width > img.height); pw = deitada ? b : a; ph = deitada ? a : b; }
        const s = Math.min((pw - 2 * m) / img.width, (ph - 2 * m) / img.height), w = img.width * s, h = img.height * s;
        atual.addPage([pw, ph]).drawImage(img, { x: (pw - w) / 2, y: (ph - h) / 2, width: w, height: h });
      }
      const saidas = []; for (const d of docs) saidas.push({ nome: op.unir ? "Imagens.pdf" : X.base(d.f.name) + ".pdf", blob: await salvar(d.doc) });
      return { saidas, zip: saidas.length > 1 ? "Imagens_em_PDF.zip" : null };
    } });

  def({ id: "word-pdf", cat: "Converter em PDF", nome: "Word para PDF", desc: "Converta documentos DOCX em PDF, com títulos, listas, tabelas e imagens.", aceita: ".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document", multi: true, botao: "Converter em PDF",
    opcoes: [{ id: "margem", tipo: "select", rot: "Margens", valores: [["20", "Normais (2 cm)"], ["12", "Estreitas"], ["30", "Largas (3 cm)"]], padrao: "20" }],
    async executar({ arquivos, op, ui }) { return root.PDF_OFFICE.word(arquivos, op, ui); } });
  def({ id: "ppt-pdf", cat: "Converter em PDF", nome: "PowerPoint para PDF", desc: "Converta apresentações PPTX em PDF, um slide por página.", aceita: ".pptx,application/vnd.openxmlformats-officedocument.presentationml.presentation", multi: true, botao: "Converter em PDF",
    async executar({ arquivos, op, ui }) { return root.PDF_OFFICE.ppt(arquivos, op, ui); } });
  def({ id: "excel-pdf", cat: "Converter em PDF", nome: "Excel para PDF", desc: "Converta planilhas em PDF, com as colunas ajustadas à largura da página.", aceita: ".xlsx,.xls,.csv,.ods", multi: true, botao: "Converter em PDF",
    opcoes: [{ id: "orient", tipo: "select", rot: "Orientação", valores: [["paisagem", "Paisagem"], ["retrato", "Retrato"]], padrao: "paisagem" }, { id: "grade", tipo: "check", rot: "Mostrar linhas de grade", padrao: true }],
    async executar({ arquivos, op, ui }) { return root.PDF_OFFICE.excel(arquivos, op, ui); } });
  def({ id: "html-pdf", cat: "Converter em PDF", nome: "HTML para PDF", desc: "Converta uma página HTML, um arquivo .html ou um código colado em PDF.", aceita: ".html,.htm,text/html", opcional: true, botao: "Converter em PDF",
    opcoes: [{ id: "fonte", tipo: "select", rot: "Origem", valores: [["arquivo", "Arquivo .html anexado"], ["codigo", "Código HTML colado"], ["url", "Endereço da página (URL)"]], padrao: "arquivo" },
      { id: "codigo", tipo: "area", rot: "Código HTML", mostrar: o => o.fonte === "codigo" }, { id: "url", tipo: "texto", rot: "Endereço", dica: "https://...", mostrar: o => o.fonte === "url" },
      { id: "orient", tipo: "select", rot: "Orientação", valores: [["retrato", "Retrato"], ["paisagem", "Paisagem"]], padrao: "retrato" }],
    async executar({ arquivos, op, ui }) { return root.PDF_OFFICE.html(arquivos, op, ui); } });

  /* ================================================================== Converter de PDF */
  def({ id: "pdf-jpg", cat: "Converter de PDF", nome: "PDF para JPG", desc: "Transforme cada página em imagem JPG ou extraia as imagens contidas no PDF.", aceita: PDF, botao: "Converter",
    opcoes: [{ id: "modo", tipo: "select", rot: "O que gerar", valores: [["paginas", "Cada página como JPG"], ["extrair", "Extrair as imagens do PDF"]], padrao: "paginas" },
      { id: "dpi", tipo: "select", rot: "Qualidade", valores: [["150", "Normal (150 dpi)"], ["300", "Alta (300 dpi)"], ["96", "Leve (96 dpi)"]], padrao: "150", mostrar: o => o.modo === "paginas" },
      { id: "intervalos", tipo: "texto", rot: "Páginas (opcional)", dica: "Todas, se vazio", mostrar: o => o.modo === "paginas" }],
    async executar({ arquivos, op, ui }) {
      const f = so1(arquivos), b = await X.bytesDe(f), saidas = [];
      if (op.modo === "extrair") {
        const { PDFName, PDFRawStream, PDFArray } = (await X.carregar("pdflib"), root.PDFLib), doc = await X.abrirLib(b); let n = 0;
        for (const [, o] of doc.context.enumerateIndirectObjects()) {
          if (!(o instanceof PDFRawStream) || String(o.dict.get(PDFName.of("Subtype"))) !== "/Image") continue;
          let fl = o.dict.get(PDFName.of("Filter")); if (fl instanceof PDFArray) fl = fl.size() === 1 ? fl.get(0) : null;
          const w = o.dict.get(PDFName.of("Width")).asNumber(), h = o.dict.get(PDFName.of("Height")).asNumber(); if (w * h < 2500) continue;
          if (String(fl) === "/DCTDecode") { n++; saidas.push({ nome: X.base(f.name) + "_imagem" + n + ".jpg", blob: new Blob([o.contents], { type: "image/jpeg" }) }); }
          else if (String(fl) === "/JPXDecode") { n++; saidas.push({ nome: X.base(f.name) + "_imagem" + n + ".jp2", blob: new Blob([o.contents], { type: "image/jp2" }) }); }
          else if (String(fl) === "/FlateDecode") {
            const cs = String(o.dict.get(PDFName.of("ColorSpace")) || ""), bpc = o.dict.get(PDFName.of("BitsPerComponent")); if (!/DeviceRGB|DeviceGray/.test(cs) || !bpc || bpc.asNumber() !== 8 || o.dict.get(PDFName.of("DecodeParms"))) continue;
            const raw = await inflar(o.contents), nc = cs === "/DeviceRGB" ? 3 : 1; if (raw.length < w * h * nc) continue;
            const id = new ImageData(w, h); for (let p = 0, q = 0; p < w * h; p++, q += nc) { id.data[p * 4] = raw[q]; id.data[p * 4 + 1] = raw[q + (nc - 1 ? 1 : 0)]; id.data[p * 4 + 2] = raw[q + (nc - 1 ? 2 : 0)]; id.data[p * 4 + 3] = 255; }
            const cv = document.createElement("canvas"); cv.width = w; cv.height = h; cv.getContext("2d").putImageData(id, 0, 0); n++; saidas.push({ nome: X.base(f.name) + "_imagem" + n + ".png", blob: await X.blobDe(cv, "image/png") });
          }
        }
        if (!saidas.length) throw new Error("Nenhuma imagem extraível foi encontrada. Use a opção de converter cada página em JPG.");
      } else {
        const pdf = await X.abrirJs(b), pags = op.intervalos ? X.intervalos(op.intervalos, pdf.numPages) : Array.from({ length: pdf.numPages }, (_, i) => i + 1);
        for (const i of pags) { ui.prog("Convertendo a página " + i, i / pdf.numPages); const cv = await X.renderizar(await pdf.getPage(i), (+op.dpi || 150) / 72); saidas.push({ nome: X.base(f.name) + "_pagina" + String(i).padStart(String(pdf.numPages).length, "0") + ".jpg", blob: await X.blobDe(cv, "image/jpeg", 0.9) }); }
      }
      return { saidas, zip: saidas.length > 1 ? X.base(f.name) + "_imagens.zip" : null, nota: saidas.length + (saidas.length === 1 ? " imagem." : " imagens.") };
    } });

  def({ id: "pdf-word", cat: "Converter de PDF", nome: "PDF para Word", desc: "Converta o PDF em DOCX editável, com títulos, parágrafos e listas.", aceita: PDF, botao: "Converter para Word",
    opcoes: [{ id: "ocr", tipo: "check", rot: "Reconhecer texto das páginas digitalizadas (OCR)", padrao: true }, { id: "imagens", tipo: "check", rot: "Incluir a imagem das páginas sem texto", padrao: false }],
    async executar({ arquivos, op, ui }) {
      const f = so1(arquivos), b = await X.bytesDe(f), pags = await X.textoTodo(b, { ocr: op.ocr, prog: ui.prog }), corpo = X.corpoFs(pags), lista = [];
      const pdf = op.imagens ? await X.abrirJs(b) : null;
      for (let i = 0; i < pags.length; i++) {
        const P = pags[i];
        if (P.vazio && !P.ocr && pdf) { const cv = await X.renderizar(await pdf.getPage(i + 1), 1.6); lista.push({ tipo: "img", img: { bytes: new Uint8Array(await (await X.blobDe(cv, "image/jpeg", 0.85)).arrayBuffer()), w: cv.width / 1.6 * 1.33, h: cv.height / 1.6 * 1.33 } }); }
        X.blocos(P, corpo).forEach(bl => lista.push(bl.tipo === "li" ? { tipo: "li", texto: bl.texto.replace(/^[•●▪◦]\s*/, "• ") } : bl));
        if (i < pags.length - 1) lista.push({ tipo: "quebra" });
      }
      if (!lista.some(l => l.texto || l.img)) throw new Error("O PDF não tem texto reconhecível. Marque a opção de OCR.");
      return { saidas: [{ nome: X.base(f.name) + ".docx", blob: await X.docx(lista) }] };
    } });

  def({ id: "pdf-ppt", cat: "Converter de PDF", nome: "PDF para PowerPoint", desc: "Converta o PDF em apresentação PPTX, um slide por página.", aceita: PDF, botao: "Converter para PowerPoint",
    opcoes: [{ id: "modo", tipo: "select", rot: "Formato dos slides", valores: [["imagem", "Fiel ao original (página como imagem, texto nas anotações)"], ["texto", "Editável (caixas de texto na posição original)"]], padrao: "imagem" }],
    async executar({ arquivos, op, ui }) { return root.PDF_OFFICE.pdfPpt(arquivos, op, ui); } });

  def({ id: "pdf-excel", cat: "Converter de PDF", nome: "PDF para Excel", desc: "Extraia tabelas e dados do PDF para uma planilha XLSX.", aceita: PDF, botao: "Converter para Excel",
    opcoes: [{ id: "abas", tipo: "select", rot: "Organização", valores: [["pagina", "Uma aba por página"], ["unica", "Tudo em uma aba"]], padrao: "pagina" }, { id: "ocr", tipo: "check", rot: "OCR nas páginas digitalizadas", padrao: false }],
    async executar({ arquivos, op, ui }) { return root.PDF_OFFICE.pdfExcel(arquivos, op, ui); } });

  def({ id: "pdf-pdfa", cat: "Converter de PDF", nome: "PDF para PDF/A", desc: "Converta para PDF/A-2b, o padrão ISO de arquivamento de longo prazo.", aceita: PDF, botao: "Converter para PDF/A",
    opcoes: [{ id: "imagem", tipo: "select", rot: "Páginas com fontes não incorporadas", valores: [["converter", "Converter em imagem (garante a conformidade)"], ["manter", "Manter como estão"]], padrao: "converter" }, { id: "tudo", tipo: "check", rot: "Converter todas as páginas em imagem" }, { id: "ocr", tipo: "check", rot: "Manter o texto pesquisável nas páginas convertidas (OCR)", padrao: true }],
    async executar({ arquivos, op, ui }) {
      await X.carregar("pdflib"); const { PDFName, PDFDict, PDFArray, PDFRef, PDFString, PDFHexString, PDFDocument } = root.PDFLib;
      const f = so1(arquivos); let b = await X.bytesDe(f);
      if (await X.estaCriptografado(b)) { const r = await X.qpdf(["--decrypt", "/e.pdf", "/s.pdf"], { "/e.pdf": b }, ["/s.pdf"]); b = r["/s.pdf"]; }
      ui.prog("Verificando as fontes", 0.1);
      const fonte = await X.abrirLib(b), ctxp = fonte.context, semFonte = new Set(), todas = new Set(), faltam = new Set();
      const lookup = o => (o instanceof PDFRef ? ctxp.lookup(o) : o);
      const fontEmbutida = fd => { const d = lookup(fd); return !!(d && d instanceof PDFDict && (d.get(PDFName.of("FontFile")) || d.get(PDFName.of("FontFile2")) || d.get(PDFName.of("FontFile3")))); };
      const verifica = (dic, pag, vistos) => {
        if (!dic || vistos.has(dic)) return; vistos.add(dic);
        const fonts = lookup(dic.get(PDFName.of("Font")));
        if (fonts instanceof PDFDict) fonts.entries().forEach(([, ref]) => {
          const ft = lookup(ref); if (!(ft instanceof PDFDict)) return; const chave = ref instanceof PDFRef ? ref.toString() : String(ft.get(PDFName.of("BaseFont"))); todas.add(chave);
          const sub = String(ft.get(PDFName.of("Subtype")));
          if (sub === "/Type3") return;
          let ok;
          if (sub === "/Type0") { const desc = lookup(ft.get(PDFName.of("DescendantFonts"))); const d0 = desc instanceof PDFArray ? lookup(desc.get(0)) : null; ok = d0 && fontEmbutida(d0.get(PDFName.of("FontDescriptor"))); }
          else ok = fontEmbutida(ft.get(PDFName.of("FontDescriptor")));
          if (!ok) { faltam.add(chave); semFonte.add(pag); }
        });
        const xo = lookup(dic.get(PDFName.of("XObject")));
        if (xo instanceof PDFDict) xo.entries().forEach(([, ref]) => { const s = lookup(ref); if (s && s.dict && String(s.dict.get(PDFName.of("Subtype"))) === "/Form") verifica(lookup(s.dict.get(PDFName.of("Resources"))), pag, vistos); });
      };
      fonte.getPages().forEach((p, i) => { try { verifica(p.node.Resources(), i, new Set()); } catch (e) { /* página sem recursos */ } });
      const nFontes = todas.size, nSem = faltam.size, rasterizar = new Set(op.tudo ? fonte.getPageIndices() : op.imagem === "converter" ? semFonte : []);
      let doc;
      if (rasterizar.size) {
        const pdf = await X.abrirJs(b); doc = await PDFDocument.create();
        for (let i = 0; i < fonte.getPageCount(); i++) {
          ui.prog("Preparando a página " + (i + 1), 0.15 + 0.6 * i / fonte.getPageCount());
          if (rasterizar.has(i)) { const pg = await pdf.getPage(i + 1), vp = pg.getViewport({ scale: 1 }), cv = await X.renderizar(pg, 200 / 72); const j = await doc.embedJpg(new Uint8Array(await (await X.blobDe(cv, "image/jpeg", 0.88)).arrayBuffer())); doc.addPage([vp.width, vp.height]).drawImage(j, { x: 0, y: 0, width: vp.width, height: vp.height }); }
          else { const [cp] = await doc.copyPages(fonte, [i]); doc.addPage(cp); }
        }
        if (op.ocr) {
          await X.carregar("tesseract"); const w = await X.tesseract("por");
          try {
            for (const i of rasterizar) {
              ui.prog("Reconhecendo o texto da página " + (i + 1) + " para mantê-lo pesquisável", 0.75 + 0.1 * i / fonte.getPageCount());
              const cv = await X.renderizar(await pdf.getPage(i + 1), 300 / 72), r = await w.recognize(cv, {}, { pdf: true, text: false });
              const [emb] = await doc.embedPdf(await PDFDocument.load(new Uint8Array(r.data.pdf)), [0]), page = doc.getPage(i), { width: W, height: H } = page.getSize();
              page.drawPage(emb, { x: 0, y: 0, width: W, height: H });
            }
          } finally { await w.terminate(); }
        }
      } else doc = fonte;
      ui.prog("Gravando os metadados de arquivamento", 0.85);
      const cat = doc.catalog;
      ["OpenAction", "AA", "JavaScript"].forEach(k => cat.delete(PDFName.of(k)));
      const nm = lookup(cat.get(PDFName.of("Names"))); if (nm instanceof PDFDict) { nm.delete(PDFName.of("JavaScript")); nm.delete(PDFName.of("EmbeddedFiles")); }
      const agora = new Date(), titulo = X.base(f.name), prod = "HUB TPC (pdf-lib, qpdf)";
      doc.setTitle(titulo); doc.setProducer(prod); doc.setCreator("HUB TPC"); doc.setCreationDate(agora); doc.setModificationDate(agora);
      const iso = agora.toISOString().replace(/\.\d{3}Z$/, "Z"), xmlEsc = s => s.replace(/&/g, "&amp;").replace(/</g, "&lt;");
      const xmp = '<?xpacket begin="﻿" id="W5M0MpCehiHzreSzNTczkc9d"?>\n<x:xmpmeta xmlns:x="adobe:ns:meta/"><rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"><rdf:Description rdf:about="" xmlns:pdfaid="http://www.aiim.org/pdfa/ns/id/" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:xmp="http://ns.adobe.com/xap/1.0/" xmlns:pdf="http://ns.adobe.com/pdf/1.3/">' +
        '<pdfaid:part>2</pdfaid:part><pdfaid:conformance>B</pdfaid:conformance><dc:format>application/pdf</dc:format><dc:title><rdf:Alt><rdf:li xml:lang="x-default">' + xmlEsc(titulo) + '</rdf:li></rdf:Alt></dc:title>' +
        '<xmp:CreatorTool>HUB TPC</xmp:CreatorTool><xmp:CreateDate>' + iso + '</xmp:CreateDate><xmp:ModifyDate>' + iso + '</xmp:ModifyDate><xmp:MetadataDate>' + iso + '</xmp:MetadataDate><pdf:Producer>' + xmlEsc(prod) + '</pdf:Producer></rdf:Description></rdf:RDF></x:xmpmeta>\n' + " ".repeat(1200) + '\n<?xpacket end="w"?>';
      const meta = doc.context.stream(new TextEncoder().encode(xmp), { Type: "Metadata", Subtype: "XML" });
      cat.set(PDFName.of("Metadata"), doc.context.register(meta));
      const icc = doc.context.stream(X.iccSrgb(), { N: 3 });
      const oi = doc.context.obj({ Type: "OutputIntent", S: "GTS_PDFA1", OutputConditionIdentifier: PDFString.of("sRGB IEC61966-2.1"), Info: PDFString.of("sRGB IEC61966-2.1"), RegistryName: PDFString.of("http://www.color.org"), DestOutputProfile: doc.context.register(icc) });
      cat.set(PDFName.of("OutputIntents"), doc.context.obj([doc.context.register(oi)]));
      const id = PDFHexString.of([...crypto.getRandomValues(new Uint8Array(16))].map(x => x.toString(16).padStart(2, "0")).join(""));
      doc.context.trailerInfo.ID = doc.context.obj([id, id]);
      let out = await doc.save({ useObjectStreams: false, updateFieldAppearances: false });
      try { const r = await X.qpdf(["/e.pdf", "--object-streams=disable", "--compress-streams=y", "/s.pdf"], { "/e.pdf": out }, ["/s.pdf"]); if (r["/s.pdf"]) out = r["/s.pdf"]; } catch (e) { /* mantém a gravação do pdf-lib */ }
      const nota = "Gerado PDF/A-2b com perfil de cor sRGB e metadados XMP. " + (nSem ? nSem + " fontes não incorporadas" + (rasterizar.size ? "; " + rasterizar.size + " páginas convertidas em imagem para garantir a conformidade" + (op.ocr ? ", com o texto reconhecido por OCR e mantido pesquisável." : ".") : "; as páginas foram mantidas, e a conformidade pode ser recusada por validadores.") : "Todas as " + nFontes + " fontes estão incorporadas.") + " Para processos que exigem certificação, confira o arquivo no validador veraPDF.";
      return { saidas: [{ nome: nomeSaida(f, "PDFA"), blob: X.pdfBlob(out) }], nota };
    } });

  /* ================================================================== Editar */
  async function visorEdicao(mesa, ctx, cfg) {
    mesa.innerHTML = '<div class="visor"></div>';
    ctx.visor = X.Visor(mesa.querySelector(".visor"), await X.bytesDe(ctx.arquivos[0]), cfg);
    await ctx.visor.pronto;
  }
  def({ id: "editar", cat: "Editar", nome: "Editar PDF", desc: "Adicione texto, imagens, formas, destaques e desenhos ao PDF.", aceita: PDF, botao: "Salvar as alterações",
    async interativo(mesa, ctx) {
      let pend = null;
      const sel = document.createElement("input"); sel.type = "file"; sel.accept = "image/png,image/jpeg"; sel.hidden = true; mesa.after(sel);
      await visorEdicao(mesa, ctx, {
        ferramentas: [["texto", "Texto"], ["imagem", "Imagem"], ["forma", "Retângulo"], ["destaque", "Destaque"], ["desenho", "Desenho livre"], ["linha", "Linha"]],
        dica: "Escolha um recurso e clique ou arraste sobre a página. Arraste os itens para movê-los e use o canto inferior direito para redimensioná-los.",
        prop: { cor: "#111111", fundo: "#ffffff", semFundo: true },
        aoFerramenta: f => { if (f === "imagem") sel.click(); if (f === "destaque") ctx.visor.prop.cor = "#ffd400"; },
        extra: f => f === "imagem" && pend ? { url: pend.url, bytes: pend.bytes, png: pend.png, razao: pend.razao } : {},
        padrao: t => t === "imagem" && pend ? [160, 160 / pend.razao] : t === "forma" ? [120, 60] : t === "destaque" ? [140, 16] : null,
        aoCriar: o => { if (o.tipo === "imagem" && !o.url) ctx.visor.limpar(q => q === o); }
      });
      sel.onchange = async () => { const f = sel.files[0]; if (!f) return; const j = /png/i.test(f.type) ? { bytes: await X.bytesDe(f), png: true } : await X.imagemParaJpeg(f); const bmp = await createImageBitmap(f); pend = { url: URL.createObjectURL(f), bytes: j.bytes, png: !!j.png, razao: bmp.width / bmp.height }; root.HUB.toast("Agora clique na página para posicionar a imagem."); };
    },
    async executar({ arquivos, ctx }) {
      const objs = ctx.visor.objetos().filter(o => !(o.tipo === "texto" && !String(o.texto || "").trim()));
      if (!objs.length) throw new Error("Adicione ao menos um item à página.");
      const doc = await X.abrirLib(await X.bytesDe(arquivos[0])); await X.aplicarObjetos(doc, ctx.visor, objs);
      return { saidas: [{ nome: nomeSaida(arquivos[0], "editado"), blob: await salvar(doc) }], nota: objs.length + " itens aplicados." };
    } });

  def({ id: "girar", cat: "Editar", nome: "Girar PDF", desc: "Gire todas as páginas de vários arquivos ou apenas as páginas escolhidas.", aceita: PDF, multi: true, botao: "Girar",
    opcoes: [{ id: "ang", tipo: "select", rot: "Girar todas as páginas", valores: [["0", "Somente as páginas giradas abaixo"], ["90", "90° à direita"], ["180", "180°"], ["270", "90° à esquerda"]], padrao: "90" }],
    async interativo(mesa, ctx) { if (ctx.arquivos.length === 1) await gradeSel(mesa, ctx, "girar"); else { mesa.innerHTML = '<p class="pequeno mudo">Com vários arquivos, a rotação escolhida acima vale para todas as páginas de todos eles.</p>'; ctx.grade = null; } },
    async executar({ arquivos, op, ctx }) {
      await X.carregar("pdflib"); const { degrees } = root.PDFLib, saidas = [], ang = +op.ang || 0;
      for (const f of arquivos) {
        const d = await X.abrirLib(await X.bytesDe(f)), extra = ctx.grade && arquivos.length === 1 ? ctx.grade.paginas() : null;
        d.getPages().forEach((p, i) => { const r = (p.getRotation().angle + ang + (extra && extra[i] ? extra[i].rot : 0)) % 360; p.setRotation(degrees(r)); });
        saidas.push({ nome: nomeSaida(f, "girado"), blob: await salvar(d) });
      }
      return { saidas, zip: saidas.length > 1 ? "PDFs_girados.zip" : null };
    } });

  const POS9 = [["tl", "Superior esquerda"], ["tc", "Superior centro"], ["tr", "Superior direita"], ["ml", "Meio esquerda"], ["mc", "Centro"], ["mr", "Meio direita"], ["bl", "Inferior esquerda"], ["bc", "Inferior centro"], ["br", "Inferior direita"]];
  const fonteStd = (nome, b) => root.PDFLib.StandardFonts[{ Helvetica: b ? "HelveticaBold" : "Helvetica", TimesRoman: b ? "TimesRomanBold" : "TimesRoman", Courier: b ? "CourierBold" : "Courier" }[nome] || "Helvetica"];
  /* posição na página visível, considerando a rotação: devolve x, y e o ângulo para desenhar texto na horizontal visual */
  function posVisivel(page, pos, w, h, margem) {
    const ang = page.getRotation().angle, { width: W, height: H } = page.getSize(), vw = ang % 180 ? H : W, vh = ang % 180 ? W : H;
    const vx = pos[1] === "l" ? margem : pos[1] === "r" ? vw - margem - w : (vw - w) / 2, vy = pos[0] === "t" ? vh - margem - h : pos[0] === "b" ? margem : (vh - h) / 2;
    if (ang === 90) return { x: W - vy, y: vx, rot: 90 }; if (ang === 180) return { x: W - vx, y: H - vy, rot: 180 }; if (ang === 270) return { x: vy, y: H - vx, rot: 270 };
    return { x: vx, y: vy, rot: 0 };
  }
  def({ id: "numeros", cat: "Editar", nome: "Números de página", desc: "Numere as páginas escolhendo posição, formato, tamanho e fonte.", aceita: PDF, botao: "Numerar as páginas",
    opcoes: [{ id: "pos", tipo: "select", rot: "Posição", valores: POS9.filter(p => p[0][0] !== "m"), padrao: "br" },
      { id: "formato", tipo: "select", rot: "Formato", valores: [["n", "1"], ["pag", "Página 1"], ["de", "Página 1 de 10"], ["barra", "1/10"], ["fls", "fls. 1"]], padrao: "n" },
      { id: "inicio", tipo: "numero", rot: "Primeiro número", padrao: 1 }, { id: "desde", tipo: "numero", rot: "Começar na página", padrao: 1, min: 1 },
      { id: "tam", tipo: "numero", rot: "Tamanho da fonte", padrao: 11, min: 6 }, { id: "fonte", tipo: "select", rot: "Fonte", valores: [["Helvetica", "Sem serifa"], ["TimesRoman", "Com serifa"], ["Courier", "Monoespaçada"]], padrao: "Helvetica" },
      { id: "cor", tipo: "cor", rot: "Cor", padrao: "#000000" }, { id: "margem", tipo: "numero", rot: "Margem (pt)", padrao: 28, min: 0 }],
    async executar({ arquivos, op }) {
      const f = so1(arquivos), d = await X.abrirLib(await X.bytesDe(f)), font = await d.embedFont(fonteStd(op.fonte)), pages = d.getPages(), desde = Math.max(1, +op.desde || 1), ini = +op.inicio || 1;
      const total = ini + pages.length - desde;
      pages.forEach((p, i) => {
        if (i + 1 < desde) return; const n = ini + i + 1 - desde;
        const t = { n: String(n), pag: "Página " + n, de: "Página " + n + " de " + total, barra: n + "/" + total, fls: "fls. " + n }[op.formato] || String(n);
        const s = +op.tam || 11, w = font.widthOfTextAtSize(t, s), r = posVisivel(p, op.pos, w, s * 0.75, +op.margem || 0);
        p.drawText(t, { x: r.x, y: r.y, size: s, font, color: X.corRgb(op.cor), rotate: root.PDFLib.degrees(r.rot) });
      });
      return { saidas: [{ nome: nomeSaida(f, "numerado"), blob: await salvar(d) }] };
    } });

  def({ id: "marca", cat: "Editar", nome: "Marca d'água", desc: "Insira um texto ou uma imagem sobre as páginas, com posição, transparência e rotação.", aceita: PDF, botao: "Aplicar a marca d'água",
    opcoes: [{ id: "tipo", tipo: "select", rot: "Tipo", valores: [["texto", "Texto"], ["imagem", "Imagem"]], padrao: "texto" },
      { id: "texto", tipo: "texto", rot: "Texto", padrao: "CONFIDENCIAL", mostrar: o => o.tipo === "texto" }, { id: "img", tipo: "arquivo", rot: "Imagem (PNG ou JPG)", aceita: "image/png,image/jpeg", mostrar: o => o.tipo === "imagem" },
      { id: "tam", tipo: "numero", rot: "Tamanho da fonte", padrao: 54, mostrar: o => o.tipo === "texto" }, { id: "escala", tipo: "numero", rot: "Largura da imagem (% da página)", padrao: 40, mostrar: o => o.tipo === "imagem" },
      { id: "fonte", tipo: "select", rot: "Fonte", valores: [["Helvetica", "Sem serifa"], ["TimesRoman", "Com serifa"], ["Courier", "Monoespaçada"]], padrao: "Helvetica", mostrar: o => o.tipo === "texto" },
      { id: "negrito", tipo: "check", rot: "Negrito", padrao: true, mostrar: o => o.tipo === "texto" }, { id: "cor", tipo: "cor", rot: "Cor", padrao: "#c0392b", mostrar: o => o.tipo === "texto" },
      { id: "opac", tipo: "select", rot: "Transparência", valores: [["0.15", "Muito leve"], ["0.3", "Leve"], ["0.5", "Média"], ["0.8", "Forte"]], padrao: "0.3" },
      { id: "rot", tipo: "select", rot: "Rotação", valores: [["45", "45°"], ["0", "Horizontal"], ["-45", "-45°"], ["90", "Vertical"]], padrao: "45" },
      { id: "pos", tipo: "select", rot: "Posição", valores: POS9.concat([["mosaico", "Mosaico (repetida)"]]), padrao: "mc" },
      { id: "intervalos", tipo: "texto", rot: "Páginas (opcional)", dica: "Todas, se vazio" }],
    async executar({ arquivos, op }) {
      await X.carregar("pdflib"); const { degrees } = root.PDFLib, f = so1(arquivos), d = await X.abrirLib(await X.bytesDe(f)), pages = d.getPages();
      const alvo = new Set(op.intervalos ? X.intervalos(op.intervalos, pages.length) : pages.map((_, i) => i + 1));
      let font = null, img = null;
      if (op.tipo === "imagem") { const im = op.img; if (!im) throw new Error("Escolha a imagem da marca d'água."); img = /png/i.test(im.type) ? await d.embedPng(await X.bytesDe(im)) : await d.embedJpg(await X.bytesDe(im)); }
      else { if (!String(op.texto || "").trim()) throw new Error("Informe o texto da marca d'água."); font = await d.embedFont(fonteStd(op.fonte, op.negrito)); }
      const ang = +op.rot || 0, opac = +op.opac || 0.3, txt = X.limpaTxt(op.texto || "");
      pages.forEach((p, i) => {
        if (!alvo.has(i + 1)) return; const { width: W, height: H } = p.getSize();
        let w, h; if (img) { w = W * (+op.escala || 40) / 100; h = w * img.height / img.width; } else { h = +op.tam || 54; w = font.widthOfTextAtSize(txt, h); }
        const desenha = (cx, cy) => {
          const rad = ang * Math.PI / 180, x = cx - (w / 2) * Math.cos(rad) + (h / 2) * Math.sin(rad), y = cy - (w / 2) * Math.sin(rad) - (h / 2) * Math.cos(rad) * (img ? 1 : 0.7);
          if (img) p.drawImage(img, { x, y, width: w, height: h, opacity: opac, rotate: degrees(ang) }); else p.drawText(txt, { x, y, size: h, font, color: X.corRgb(op.cor), opacity: opac, rotate: degrees(ang) });
        };
        if (op.pos === "mosaico") {
          const rad = Math.abs(ang) * Math.PI / 180, bw = w * Math.cos(rad) + h * Math.sin(rad), bh = w * Math.sin(rad) + h * Math.cos(rad), passoX = bw + 50, passoY = bh + 40;
          let linha = 0; for (let y = bh / 2 + 10; y < H + bh / 2; y += passoY, linha++) for (let x = (linha % 2 ? passoX / 2 : 0) + bw / 2; x < W + bw / 2; x += passoX) desenha(x, y);
        }
        else { const m = 36, cx = op.pos[1] === "l" ? m + w / 2 : op.pos[1] === "r" ? W - m - w / 2 : W / 2, cy = op.pos[0] === "t" ? H - m - h / 2 : op.pos[0] === "b" ? m + h / 2 : H / 2; desenha(cx, cy); }
      });
      return { saidas: [{ nome: nomeSaida(f, "marca_dagua"), blob: await salvar(d) }] };
    } });

  def({ id: "recortar", cat: "Editar", nome: "Recortar PDF", desc: "Corte as margens ou selecione a área a manter, numa página ou em todas.", aceita: PDF, botao: "Recortar",
    opcoes: [{ id: "aplicar", tipo: "select", rot: "Aplicar a", valores: [["todas", "Todas as páginas"], ["atual", "Somente à página exibida"]], padrao: "todas" },
      { id: "modo", tipo: "select", rot: "Como recortar", valores: [["area", "Área desenhada na página"], ["margens", "Margens fixas"]], padrao: "area" },
      { id: "mm", tipo: "numero", rot: "Margem a cortar (mm, em cada lado)", padrao: 10, mostrar: o => o.modo === "margens" }],
    async interativo(mesa, ctx) {
      await visorEdicao(mesa, ctx, { ferramentas: [["recorte", "Selecionar área"]], dica: "Arraste sobre a página para marcar a área que deve permanecer. Se desenhar outra, a anterior é substituída.", aoCriar: o => ctx.visor.limpar(q => q.tipo === "recorte" && q !== o) });
    },
    async executar({ arquivos, op, ctx }) {
      const d = await X.abrirLib(await X.bytesDe(arquivos[0])), pages = d.getPages(), alvo = op.aplicar === "atual" ? [ctx.visor.pagina()] : pages.map((_, i) => i + 1);
      const sel = ctx.visor.objetos().find(o => o.tipo === "recorte");
      if (op.modo === "area" && !sel) throw new Error("Arraste sobre a página para marcar a área a manter, ou escolha margens fixas.");
      for (const n of alvo) {
        const p = pages[n - 1], cb = p.getCropBox();
        let r;
        if (op.modo === "margens") { const m = (+op.mm || 0) * 72 / 25.4; r = { x: cb.x + m, y: cb.y + m, w: cb.width - 2 * m, h: cb.height - 2 * m }; }
        else r = await ctx.visor.rectPdf(n, sel.x, sel.y, sel.w, sel.h);
        if (r.w < 20 || r.h < 20) throw new Error("A área de recorte ficou pequena demais.");
        p.setCropBox(r.x, r.y, r.w, r.h); p.setMediaBox(r.x, r.y, r.w, r.h); p.setTrimBox(r.x, r.y, r.w, r.h);
      }
      return { saidas: [{ nome: nomeSaida(arquivos[0], "recortado"), blob: await salvar(d) }] };
    } });

  def({ id: "formularios", cat: "Editar", nome: "Formulários PDF", desc: "Preencha os campos de um formulário PDF ou crie campos preenchíveis, inclusive por detecção automática.", aceita: PDF, botao: "Salvar o formulário",
    opcoes: [{ id: "achatar", tipo: "check", rot: "Fixar o conteúdo preenchido (o formulário deixa de ser editável)" }],
    async interativo(mesa, ctx) {
      const b = await X.bytesDe(ctx.arquivos[0]), doc = await X.abrirLib(b); let campos = [];
      try { campos = doc.getForm().getFields(); } catch (e) { campos = []; }
      ctx.campos = campos.map(c => ({ nome: c.getName(), tipo: c.constructor.name, opcoes: c.getOptions ? c.getOptions() : null, valor: c.getText ? (c.getText() || "") : c.isChecked ? c.isChecked() : c.getSelected ? (c.getSelected() || [])[0] || "" : "" }));
      mesa.innerHTML = (ctx.campos.length ? '<h3 class="sub-h">Campos existentes (' + ctx.campos.length + ')</h3><div class="grade g3 f-campos">' + ctx.campos.map((c, i) => {
        if (c.tipo === "PDFCheckBox") return '<label class="check"><input type="checkbox" data-ci="' + i + '"' + (c.valor ? " checked" : "") + "> " + esc(c.nome) + "</label>";
        if (c.opcoes) return '<label class="campo">' + esc(c.nome) + '<select data-ci="' + i + '"><option value=""></option>' + c.opcoes.map(o => '<option' + (o === c.valor ? " selected" : "") + ">" + esc(o) + "</option>").join("") + "</select></label>";
        if (c.tipo === "PDFTextField") return '<label class="campo">' + esc(c.nome) + '<input type="text" data-ci="' + i + '" value="' + esc(c.valor) + '"></label>';
        return '<p class="pequeno mudo">' + esc(c.nome) + " (tipo não editável aqui)</p>";
      }).join("") + "</div>" : '<p class="pequeno mudo">O PDF não tem campos de formulário. Crie campos abaixo, desenhando-os na página ou usando a detecção automática.</p>') +
        '<h3 class="sub-h">Criar campos</h3><div class="linha-btns" style="margin-bottom:8px"><button type="button" class="btn sec peq" data-detectar>Detectar campos automaticamente</button><span class="pequeno mudo">Procura linhas de preenchimento (____) e rótulos terminados em dois-pontos.</span></div><div class="visor"></div>';
      ctx.visor = X.Visor(mesa.querySelector(".visor"), b, {
        ferramentas: [["campo", "Campo de texto"], ["caixa", "Caixa de seleção"]], dica: "Arraste sobre a página para criar um campo. Selecione um campo para excluí-lo.",
        extra: f => { const n = (ctx.nCampo = (ctx.nCampo || 0) + 1); return { tipo: "campo", p: Object.assign({}, ctx.visor.prop, { nome: (f === "caixa" ? "opcao_" : "campo_") + n, tipoCampo: f === "caixa" ? "check" : "texto" }) }; },
        padrao: () => [140, 18]
      });
      await ctx.visor.pronto;
      mesa.querySelector("[data-detectar]").onclick = async () => {
        const pdf = ctx.visor.pdf(); let n = 0;
        for (let i = 1; i <= pdf.numPages; i++) {
          const L = await X.layout(pdf, i);
          for (const it of L.itens) {
            const m = /_{4,}|\.{6,}/.exec(it.s); if (!m) continue;
            const frac0 = m.index / it.s.length, frac1 = (m.index + m[0].length) / it.s.length;
            const x = it.x + it.w * frac0, w = Math.max(30, it.w * (frac1 - frac0));
            const o = ctx.visor.novo("campo", x, it.y - 2, w, it.h + 4); o.pg = i; o.p.nome = "campo_" + (++n); o.p.tipoCampo = "texto";
          }
          L.linhas.forEach(l => { if (/:\s*$/.test(l.texto) && l.x1 < L.largura - 120 && !L.itens.some(it => /_{4,}/.test(it.s) && Math.abs(it.y - l.y) < 4)) { const o = ctx.visor.novo("campo", l.x1 + 6, l.y - 2, Math.min(240, L.largura - l.x1 - 50), l.fs + 5); o.pg = i; o.p.nome = "campo_" + (++n); o.p.tipoCampo = "texto"; } });
        }
        ctx.visor.irPara(ctx.visor.pagina());
        root.HUB.toast(n ? n + " campos detectados. Revise, ajuste ou exclua os que não servirem." : "Nenhum campo foi detectado; desenhe os campos na página.", 4000);
      };
    },
    async executar({ arquivos, op, ctx }) {
      const d = await X.abrirLib(await X.bytesDe(arquivos[0])), form = d.getForm(), existentes = form.getFields();
      document.querySelectorAll("[data-ci]").forEach(el => {
        const c = existentes.find(f => f.getName() === ctx.campos[+el.dataset.ci].nome); if (!c) return;
        try { if (c.setText) c.setText(el.value); else if (c.check) el.checked ? c.check() : c.uncheck(); else if (c.select && el.value) c.select(el.value); } catch (e) { /* valor incompatível com o campo */ }
      });
      const novos = ctx.visor.objetos().filter(o => o.tipo === "campo"), nomes = new Set(existentes.map(f => f.getName()));
      for (const o of novos) {
        let nome = o.p.nome || "campo"; while (nomes.has(nome)) nome += "_"; nomes.add(nome);
        const r = await ctx.visor.rectPdf(o.pg, o.x, o.y, o.w, o.h), page = d.getPage(o.pg - 1);
        if (o.p.tipoCampo === "check") form.createCheckBox(nome).addToPage(page, { x: r.x, y: r.y, width: Math.min(r.w, r.h), height: Math.min(r.w, r.h) });
        else { const tf = form.createTextField(nome); tf.addToPage(page, { x: r.x, y: r.y, width: r.w, height: r.h, borderWidth: 0.6 }); tf.setFontSize(Math.max(7, Math.min(12, r.h * 0.7))); }
      }
      if (op.achatar) form.flatten();
      return { saidas: [{ nome: nomeSaida(arquivos[0], "formulario"), blob: await salvar(d) }], nota: (existentes.length ? existentes.length + " campos existentes preenchidos. " : "") + (novos.length ? novos.length + " campos criados." : "") };
    } });

  /* ================================================================== Segurança */
  def({ id: "desbloquear", cat: "Segurança", nome: "Desbloquear PDF", desc: "Remova a senha e as restrições de um PDF de que você tem o direito de uso.", aceita: PDF, multi: true, botao: "Desbloquear",
    opcoes: [{ id: "senha", tipo: "senha", rot: "Senha de abertura (se houver)" }],
    async executar({ arquivos, op, ui }) {
      const saidas = [];
      for (const f of arquivos) { ui.prog("Desbloqueando " + f.name, 0.5); const args = ["--decrypt"]; if (op.senha) args.push("--password=" + op.senha); args.push("/e.pdf", "/s.pdf"); const r = await X.qpdf(args, { "/e.pdf": await X.bytesDe(f) }, ["/s.pdf"]); saidas.push({ nome: nomeSaida(f, "desbloqueado"), blob: X.pdfBlob(r["/s.pdf"]) }); }
      return { saidas, zip: saidas.length > 1 ? "PDFs_desbloqueados.zip" : null };
    } });

  def({ id: "proteger", cat: "Segurança", nome: "Proteger PDF", desc: "Proteja o PDF com senha (AES-256) e restrinja impressão, cópia e edição.", aceita: PDF, multi: true, botao: "Proteger",
    opcoes: [{ id: "senha", tipo: "senha", rot: "Senha" }, { id: "conf", tipo: "senha", rot: "Repita a senha" },
      { id: "imprimir", tipo: "check", rot: "Permitir impressão", padrao: true }, { id: "copiar", tipo: "check", rot: "Permitir copiar o texto", padrao: true }, { id: "editar", tipo: "check", rot: "Permitir editar e anotar", padrao: false }],
    async executar({ arquivos, op, ui }) {
      if (!op.senha || op.senha.length < 4) throw new Error("Informe uma senha com pelo menos 4 caracteres.");
      if (op.senha !== op.conf) throw new Error("As senhas não conferem.");
      const dono = op.senha + "-" + Math.random().toString(36).slice(2, 12), saidas = [];
      for (const f of arquivos) {
        ui.prog("Protegendo " + f.name, 0.5);
        const args = ["--encrypt", op.senha, dono, "256", "--print=" + (op.imprimir ? "full" : "none"), "--extract=" + (op.copiar ? "y" : "n"), "--modify=" + (op.editar ? "all" : "none"), "--annotate=" + (op.editar ? "y" : "n"), "--", "/e.pdf", "/s.pdf"];
        const r = await X.qpdf(args, { "/e.pdf": await X.bytesDe(f) }, ["/s.pdf"]); saidas.push({ nome: nomeSaida(f, "protegido"), blob: X.pdfBlob(r["/s.pdf"]) });
      }
      return { saidas, zip: saidas.length > 1 ? "PDFs_protegidos.zip" : null, nota: "Guarde a senha: sem ela o arquivo não poderá ser aberto." };
    } });

  def({ id: "assinar", cat: "Segurança", nome: "Assinar PDF", desc: "Desenhe, digite ou importe sua assinatura e posicione-a no documento, com rubrica e data.", aceita: PDF, botao: "Aplicar a assinatura",
    async interativo(mesa, ctx) {
      mesa.innerHTML = '<div class="duas-a"><div class="bloco-ass card card-p"></div><div><div class="visor"></div></div></div><p class="pequeno mudo" style="margin-top:8px">Assinatura eletrônica simples, por imagem. Para assinatura com certificado digital ICP-Brasil ou pelo gov.br, use o assinador oficial sobre o PDF gerado aqui.</p>';
      let atual = null;
      X.BlocoAssinatura(mesa.querySelector(".bloco-ass"), a => { atual = a; ctx.visor.ferramenta("assinatura"); root.HUB.toast("Clique na página onde a assinatura deve ficar."); });
      ctx.visor = X.Visor(mesa.querySelector(".visor"), await X.bytesDe(ctx.arquivos[0]), {
        ferramentas: [["assinatura", "Assinatura"], ["texto", "Texto"], ["data", "Data"]], todasPaginas: true,
        dica: "Clique na página para posicionar. Arraste para mover e use o canto para ajustar o tamanho. Marque \"Em todas as páginas\" para rubricar o documento inteiro.",
        extra: f => f === "assinatura" && atual ? { url: atual.url, bytes: atual.bytes, png: true, razao: atual.razao } : {},
        padrao: t => t === "assinatura" && atual ? [150, 150 / atual.razao] : null,
        aoCriar: o => { if (o.tipo === "assinatura" && !o.url) { ctx.visor.limpar(q => q === o); root.HUB.toast("Crie a assinatura no quadro ao lado e clique em Usar esta assinatura."); } }
      });
      await ctx.visor.pronto;
    },
    async executar({ arquivos, ctx }) {
      const objs = ctx.visor.objetos().filter(o => !(["texto", "data"].includes(o.tipo) && !String(o.texto || "").trim()));
      if (!objs.some(o => o.tipo === "assinatura")) throw new Error("Posicione a assinatura na página.");
      const d = await X.abrirLib(await X.bytesDe(arquivos[0])); await X.aplicarObjetos(d, ctx.visor, objs);
      return { saidas: [{ nome: nomeSaida(arquivos[0], "assinado"), blob: await salvar(d) }] };
    } });

  const PADROES = { cpf: /\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/g, cnpj: /\b\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}\b/g, email: /[\w.+-]+@[\w-]+\.[\w.-]+/g, tel: /\(?\b\d{2}\)?\s?9?\d{4}-?\d{4}\b/g, rg: /\b(?:RG|R\.G\.)\s*(?:n[º°.]?\s*)?[\w.-]{5,14}/gi };
  def({ id: "ocultar", cat: "Segurança", nome: "Ocultar dados (tarja)", desc: "Cubra com tarja preta textos e áreas sensíveis e remova-os de forma definitiva.", aceita: PDF, botao: "Aplicar as tarjas",
    async interativo(mesa, ctx) {
      mesa.innerHTML = '<div class="grade g4" style="align-items:end;margin-bottom:10px"><label class="campo" style="grid-column:span 2">Buscar texto para ocultar<input type="text" data-busca placeholder="Ex.: nome da vítima"></label><button type="button" class="btn sec" data-buscar>Marcar ocorrências</button></div>' +
        '<div class="linha-btns" style="margin-bottom:10px"><span class="pequeno mudo">Marcar automaticamente:</span>' + [["cpf", "CPF"], ["cnpj", "CNPJ"], ["rg", "RG"], ["email", "E-mail"], ["tel", "Telefone"]].map(([k, r]) => '<button type="button" class="btn sec peq" data-pad="' + k + '">' + r + "</button>").join("") + '<button type="button" class="btn sec peq" data-limpar>Limpar marcações</button></div><div class="visor"></div>';
      ctx.visor = X.Visor(mesa.querySelector(".visor"), await X.bytesDe(ctx.arquivos[0]), { ferramentas: [["ocultar", "Tarja (arraste)"]], dica: "Arraste sobre a página para cobrir qualquer área. As páginas com tarja são convertidas em imagem, para que o conteúdo coberto seja removido de verdade." });
      await ctx.visor.pronto;
      const marcar = async re => {
        const pdf = ctx.visor.pdf(); let n = 0;
        for (let i = 1; i <= pdf.numPages; i++) {
          const L = await X.layout(pdf, i);
          for (const it of L.itens) { re.lastIndex = 0; let m; while ((m = re.exec(it.s))) { const a = m.index / it.s.length, b = (m.index + m[0].length) / it.s.length; const o = ctx.visor.novo("ocultar", it.x + it.w * a - 1, it.y - 1, it.w * (b - a) + 2, it.h + 3); o.pg = i; n++; if (!m[0].length) break; } }
          for (const l of L.linhas) { re.lastIndex = 0; const juntos = l.itens.map(x => x.s).join(""); if (l.itens.length > 1 && re.test(l.texto) && !l.itens.some(x => { re.lastIndex = 0; return re.test(x.s); })) { const o = ctx.visor.novo("ocultar", l.x0 - 1, l.y - 1, l.x1 - l.x0 + 2, l.fs + 3); o.pg = i; n++; } void juntos; }
        }
        ctx.visor.irPara(ctx.visor.pagina()); root.HUB.toast(n ? n + " ocorrências marcadas. Confira página a página antes de aplicar." : "Nenhuma ocorrência encontrada no texto do PDF.", 4000);
      };
      mesa.querySelector("[data-buscar]").onclick = () => { const t = mesa.querySelector("[data-busca]").value.trim(); if (t) marcar(new RegExp(t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi")); };
      mesa.querySelectorAll("[data-pad]").forEach(b => { b.onclick = () => marcar(new RegExp(PADROES[b.dataset.pad].source, PADROES[b.dataset.pad].flags)); });
      mesa.querySelector("[data-limpar]").onclick = () => ctx.visor.limpar(o => o.tipo === "ocultar");
    },
    async executar({ arquivos, ctx, ui }) {
      const tarjas = ctx.visor.objetos().filter(o => o.tipo === "ocultar"); if (!tarjas.length) throw new Error("Marque ao menos uma área a ocultar.");
      const b = await X.bytesDe(arquivos[0]), orig = await X.abrirLib(b), pdf = await X.abrirJs(b), out = await root.PDFLib.PDFDocument.create(), afetadas = new Set(tarjas.map(o => o.pg));
      for (let i = 1; i <= orig.getPageCount(); i++) {
        if (!afetadas.has(i)) { const [cp] = await out.copyPages(orig, [i - 1]); out.addPage(cp); continue; }
        ui.prog("Removendo o conteúdo da página " + i, i / orig.getPageCount());
        const pg = await pdf.getPage(i), vp = pg.getViewport({ scale: 1 }), k = 220 / 72, cv = await X.renderizar(pg, k), g = cv.getContext("2d");
        g.fillStyle = "#000"; tarjas.filter(o => o.pg === i).forEach(o => g.fillRect(o.x * k, o.y * k, o.w * k, o.h * k));
        const j = await out.embedJpg(new Uint8Array(await (await X.blobDe(cv, "image/jpeg", 0.88)).arrayBuffer()));
        out.addPage([vp.width, vp.height]).drawImage(j, { x: 0, y: 0, width: vp.width, height: vp.height });
      }
      out.setTitle(X.base(arquivos[0].name)); out.setProducer("HUB TPC");
      return { saidas: [{ nome: nomeSaida(arquivos[0], "tarjado"), blob: await salvar(out) }], nota: tarjas.length + " tarjas aplicadas em " + afetadas.size + " páginas, convertidas em imagem para eliminar o texto coberto. As demais páginas foram mantidas intactas." };
    } });

  def({ id: "comparar", cat: "Segurança", nome: "Comparar PDF", desc: "Compare duas versões lado a lado e veja o que foi incluído, excluído ou alterado.", aceita: PDF, multi: true, min: 2, max: 2, botao: "Comparar", ordenar: true,
    opcoes: [{ id: "modo", tipo: "select", rot: "Tipo de comparação", valores: [["texto", "Texto (palavra por palavra)"], ["visual", "Visual (página a página)"]], padrao: "texto" }],
    async executar({ arquivos, op, ui }) {
      const [a, b] = arquivos;
      if (op.modo === "visual") {
        const pa = await X.abrirJs(await X.bytesDe(a)), pb = await X.abrirJs(await X.bytesDe(b)), n = Math.max(pa.numPages, pb.numPages); let h = "", difs = 0;
        for (let i = 1; i <= n; i++) {
          ui.prog("Comparando a página " + i, i / n);
          const ca = i <= pa.numPages ? await X.renderizar(await pa.getPage(i), 1.3) : null, cb = i <= pb.numPages ? await X.renderizar(await pb.getPage(i), 1.3) : null;
          if (!ca || !cb) { h += '<div class="cmp-pg"><h4>Página ' + i + '</h4><p class="aviso">Existe apenas em ' + esc(ca ? a.name : b.name) + "</p></div>"; difs++; continue; }
          const w = Math.min(ca.width, cb.width), hh = Math.min(ca.height, cb.height), da = ca.getContext("2d").getImageData(0, 0, w, hh), db = cb.getContext("2d").getImageData(0, 0, w, hh), out = document.createElement("canvas"); out.width = w; out.height = hh;
          const g = out.getContext("2d"), r = g.createImageData(w, hh); let px = 0;
          for (let p = 0; p < da.data.length; p += 4) { const d = Math.abs(da.data[p] - db.data[p]) + Math.abs(da.data[p + 1] - db.data[p + 1]) + Math.abs(da.data[p + 2] - db.data[p + 2]); const y = 0.299 * db.data[p] + 0.587 * db.data[p + 1] + 0.114 * db.data[p + 2]; if (d > 60) { r.data[p] = 230; r.data[p + 1] = 40; r.data[p + 2] = 40; r.data[p + 3] = 255; px++; } else { r.data[p] = r.data[p + 1] = r.data[p + 2] = 160 + y * 0.37; r.data[p + 3] = 255; } }
          g.putImageData(r, 0, 0); if (px > 30) difs++;
          h += '<div class="cmp-pg"><h4>Página ' + i + (px > 30 ? ' <span class="tag bad">com diferenças</span>' : ' <span class="tag ok">igual</span>') + '</h4><div class="cmp-3"><figure><img alt="" src="' + ca.toDataURL("image/jpeg", 0.7) + '"><figcaption>' + esc(a.name) + '</figcaption></figure><figure><img alt="" src="' + out.toDataURL("image/png") + '"><figcaption>Diferenças em vermelho</figcaption></figure><figure><img alt="" src="' + cb.toDataURL("image/jpeg", 0.7) + '"><figcaption>' + esc(b.name) + "</figcaption></figure></div></div>";
        }
        const html = '<p class="pequeno">' + difs + " de " + n + " páginas com diferenças visuais.</p>" + h;
        return { html, saidas: [{ nome: "Comparacao_visual.html", blob: new Blob(['<!doctype html><meta charset="utf-8"><title>Comparação</title><style>body{font-family:sans-serif;margin:24px}.cmp-3{display:grid;grid-template-columns:repeat(3,1fr);gap:8px}img{width:100%;border:1px solid #ccc}.tag{font-size:12px;padding:2px 6px;border-radius:4px}.bad{background:#fde2e2}.ok{background:#e2f5e8}</style><h1>Comparação visual</h1>' + html], { type: "text/html" }) }] };
      }
      await X.carregar("diff");
      ui.prog("Lendo os textos", 0.2);
      const ta = (await X.textoTodo(await X.bytesDe(a))).map(p => p.linhas.map(l => l.texto).join("\n")), tb = (await X.textoTodo(await X.bytesDe(b))).map(p => p.linhas.map(l => l.texto).join("\n"));
      const norm = t => t.join("\n\n").replace(/[ \t]+/g, " ");
      const partes = root.Diff.diffWordsWithSpace(norm(ta), norm(tb)); let ins = 0, del = 0, esq = "", dir = "";
      partes.forEach(p => { const t = esc(p.value).replace(/\n/g, "<br>"); if (p.added) { ins += p.value.trim().split(/\s+/).filter(Boolean).length; dir += "<ins>" + t + "</ins>"; } else if (p.removed) { del += p.value.trim().split(/\s+/).filter(Boolean).length; esq += "<del>" + t + "</del>"; } else { esq += t; dir += t; } });
      const html = '<p class="pequeno"><span class="tag ok">' + ins + " palavras incluídas</span> <span class=\"tag bad\">" + del + ' palavras excluídas</span></p><div class="cmp-2"><div><h4>' + esc(a.name) + '</h4><div class="cmp-txt">' + esq + '</div></div><div><h4>' + esc(b.name) + '</h4><div class="cmp-txt">' + dir + "</div></div></div>";
      return { html, nota: ins || del ? "Diferenças destacadas: em verde o que entrou, em vermelho o que saiu." : "Os textos são idênticos.", saidas: [{ nome: "Comparacao_texto.html", blob: new Blob(['<!doctype html><meta charset="utf-8"><title>Comparação</title><style>body{font-family:sans-serif;margin:24px}.cmp-2{display:grid;grid-template-columns:1fr 1fr;gap:16px}.cmp-txt{border:1px solid #ccc;padding:12px;line-height:1.6}ins{background:#c9f0d3;text-decoration:none}del{background:#f8c9c9}</style><h1>Comparação de textos</h1>' + html], { type: "text/html" }) }] };
    } });

  /* ================================================================== Inteligência (IA) */
  const ia = () => { if (!root.PDF_IA) throw new Error("O módulo de IA não foi carregado: a rede pode estar bloqueando cdn.jsdelivr.net. As demais ferramentas funcionam normalmente."); return root.PDF_IA; };
  const IA_OP = [{ id: "ocr", tipo: "check", rot: "Ler páginas digitalizadas com OCR", padrao: true }];
  def({ id: "resumir", cat: "Inteligência", nome: "Resumir PDF", desc: "Gere um resumo objetivo do documento, com os pontos principais, pelo Claude.", aceita: PDF, botao: "Resumir", ia: true,
    opcoes: [{ id: "tamanho", tipo: "select", rot: "Extensão", valores: [["curto", "Curto (um parágrafo)"], ["medio", "Médio (pontos principais)"], ["detalhado", "Detalhado (por seção)"]], padrao: "medio" },
      { id: "foco", tipo: "texto", rot: "Foco (opcional)", dica: "Ex.: obrigações das partes, prazos" }].concat(IA_OP),
    async executar({ arquivos, op, ui }) {
      const f = so1(arquivos), texto = (await X.textoTodo(await X.bytesDe(f), { ocr: op.ocr, prog: ui.prog })).texto().slice(0, 600000);
      if (texto.trim().length < 40) throw new Error("O PDF não tem texto suficiente. Marque o OCR para documentos digitalizados.");
      const ext = { curto: "um único parágrafo de até 120 palavras", medio: "uma introdução de duas frases seguida dos pontos principais, em até 400 palavras", detalhado: "um resumo organizado pelas seções do documento, com os pontos relevantes de cada uma, em até 1.200 palavras" }[op.tamanho];
      const md = await ia().gerar({ sistema: "Você resume documentos com precisão, em português do Brasil, sem inventar informações. Use somente o que está no texto. Responda em Markdown, com títulos curtos quando úteis.", usuario: "Resuma o documento abaixo em " + ext + "." + (op.foco ? " Dê ênfase a: " + op.foco + "." : "") + "\n\n<documento>\n" + texto + "\n</documento>", ui });
      return { html: '<div class="md">' + mdHtml(md) + "</div>", saidas: [{ nome: X.base(f.name) + "_resumo.docx", blob: await X.docx(mdBlocos(md)) }, { nome: X.base(f.name) + "_resumo.md", blob: new Blob([md], { type: "text/markdown" }) }] };
    } });
  def({ id: "traduzir", cat: "Inteligência", nome: "Traduzir PDF", desc: "Traduza o documento pelo Claude, preservando títulos, parágrafos e listas.", aceita: PDF, botao: "Traduzir", ia: true,
    opcoes: [{ id: "lingua", tipo: "select", rot: "Traduzir para", valores: [["português do Brasil", "Português"], ["inglês", "Inglês"], ["espanhol", "Espanhol"], ["francês", "Francês"], ["italiano", "Italiano"], ["alemão", "Alemão"]], padrao: "português do Brasil" }].concat(IA_OP),
    async executar({ arquivos, op, ui }) {
      const f = so1(arquivos), pags = await X.textoTodo(await X.bytesDe(f), { ocr: op.ocr, prog: ui.prog }), md = paraMarkdown(pags);
      if (md.trim().length < 20) throw new Error("O PDF não tem texto para traduzir.");
      const partes = [], lim = 14000; let atual = "";
      md.split(/\n(?=#|\n)/).forEach(b => { if ((atual + b).length > lim && atual) { partes.push(atual); atual = ""; } atual += b + "\n"; }); if (atual.trim()) partes.push(atual);
      let saida = "";
      for (let i = 0; i < partes.length; i++) {
        ui.prog("Traduzindo a parte " + (i + 1) + " de " + partes.length, (i + 0.5) / partes.length);
        saida += (await ia().gerar({ sistema: "Você é tradutor jurídico profissional. Traduza fielmente, com terminologia técnica correta, preservando exatamente a marcação Markdown (títulos, listas, tabelas e quebras de página). Não acrescente comentários nem notas.", usuario: "Traduza para " + op.lingua + ":\n\n" + partes[i], ui, silencioso: true })) + "\n\n";
      }
      return { html: '<div class="md">' + mdHtml(saida) + "</div>", saidas: [{ nome: X.base(f.name) + "_traduzido.docx", blob: await X.docx(mdBlocos(saida)) }, { nome: X.base(f.name) + "_traduzido.md", blob: new Blob([saida], { type: "text/markdown" }) }] };
    } });

  /* Markdown local, sem IA: títulos pelo tamanho da fonte, listas, parágrafos e tabelas detectadas */
  function paraMarkdown(pags) {
    const corpo = X.corpoFs(pags), out = [];
    pags.forEach((P, i) => {
      const tab = X.tabela(P), colunas = tab.length ? tab[0].length : 0, linhasTab = tab.filter(r => r.filter(Boolean).length >= 3).length;
      if (colunas >= 3 && linhasTab >= Math.max(4, P.linhas.length * 0.6)) {
        const rows = tab.filter(r => r.some(Boolean)).map(r => "| " + r.map(c => c.replace(/\|/g, "\\|")).join(" | ") + " |");
        out.push(rows[0], "|" + " --- |".repeat(colunas), ...rows.slice(1), "");
      } else X.blocos(P, corpo).forEach(b => {
        if (b.tipo === "h") out.push("#".repeat(Math.min(3, b.nivel + (b.nivel === 3 ? 0 : 0))) + " " + b.texto, "");
        else if (b.tipo === "li") out.push("- " + b.texto.replace(/^([•●▪◦\-–*])\s*/, ""));
        else out.push((b.bold ? "**" + b.texto + "**" : b.texto), "");
      });
      if (i < pags.length - 1) out.push("", "---", "");
    });
    return out.join("\n").replace(/\n{3,}/g, "\n\n").trim() + "\n";
  }
  function mdBlocos(md) {
    return md.split("\n").map(l => l.trim()).filter(l => l && !/^\|?\s*-{3,}/.test(l)).map(l => {
      const h = /^(#{1,6})\s+(.*)$/.exec(l); if (h) return { tipo: "h", nivel: Math.min(3, h[1].length), texto: h[2].replace(/\*\*/g, "") };
      if (/^---+$/.test(l)) return { tipo: "quebra" };
      const li = /^([-*•]|\d+[.)])\s+(.*)$/.exec(l); const t = li ? (/\d/.test(li[1]) ? li[1] + " " : "• ") + li[2] : l;
      const runs = t.replace(/^\|/, "").replace(/\|$/, "").replace(/\s*\|\s*/g, " · ").split(/(\*\*[^*]+\*\*)/).filter(Boolean).map(s => /^\*\*.*\*\*$/.test(s) ? { t: s.slice(2, -2), b: true } : { t: s });
      return { tipo: li ? "li" : "p", runs };
    });
  }
  function mdHtml(md) {
    const linhas = md.split("\n"), out = []; let lista = false, tab = [];
    const inl = s => esc(s).replace(/\*\*([^*]+)\*\*/g, "<b>$1</b>").replace(/\*([^*]+)\*/g, "<i>$1</i>");
    const fechaTab = () => { if (tab.length) { out.push("<table><thead><tr>" + tab[0].map(c => "<th>" + inl(c) + "</th>").join("") + "</tr></thead><tbody>" + tab.slice(1).map(r => "<tr>" + r.map(c => "<td>" + inl(c) + "</td>").join("") + "</tr>").join("") + "</tbody></table>"); tab = []; } };
    linhas.forEach(l => {
      const t = l.trim();
      if (/^\|.*\|$/.test(t)) { if (!/^\|[\s:|-]+\|$/.test(t)) tab.push(t.slice(1, -1).split("|").map(c => c.trim())); return; } fechaTab();
      const li = /^([-*•]|\d+[.)])\s+(.*)$/.exec(t);
      if (li) { if (!lista) { out.push("<ul>"); lista = true; } out.push("<li>" + inl(li[2]) + "</li>"); return; }
      if (lista) { out.push("</ul>"); lista = false; }
      const h = /^(#{1,6})\s+(.*)$/.exec(t);
      if (h) out.push("<h" + Math.min(4, h[1].length + 1) + ">" + inl(h[2]) + "</h" + Math.min(4, h[1].length + 1) + ">"); else if (/^---+$/.test(t)) out.push("<hr>"); else if (t) out.push("<p>" + inl(t) + "</p>");
    });
    fechaTab(); if (lista) out.push("</ul>"); return out.join("");
  }
  def({ id: "markdown", cat: "Inteligência", nome: "PDF para Markdown", desc: "Converta o PDF em Markdown com títulos, listas e tabelas; opcionalmente refinado pelo Claude.", aceita: PDF, botao: "Converter para Markdown",
    opcoes: [{ id: "ocr", tipo: "check", rot: "OCR nas páginas digitalizadas", padrao: true }, { id: "refinar", tipo: "check", rot: "Refinar a estrutura com o Claude (requer a chave em Opções de IA)", padrao: false }],
    async executar({ arquivos, op, ui }) {
      const f = so1(arquivos); let md = paraMarkdown(await X.textoTodo(await X.bytesDe(f), { ocr: op.ocr, prog: ui.prog }));
      if (md.trim().length < 2) throw new Error("O PDF não tem texto reconhecível.");
      if (op.refinar) md = await ia().gerar({ sistema: "Você converte texto extraído de PDF em Markdown limpo, corrigindo quebras de linha, hifenização, títulos, listas e tabelas, sem alterar nem resumir o conteúdo.", usuario: "Reestruture este Markdown extraído de um PDF, preservando todo o conteúdo:\n\n" + md.slice(0, 400000), ui });
      return { html: '<div class="md">' + mdHtml(md) + "</div>", saidas: [{ nome: X.base(f.name) + ".md", blob: new Blob([md], { type: "text/markdown" }) }] };
    } });

  root.PDF_FERRAMENTAS = F; root.PDF_MD = { paraMarkdown, mdBlocos, mdHtml };
})(window);
