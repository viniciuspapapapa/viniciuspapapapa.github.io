/* Núcleo das ferramentas de PDF do HUB: bibliotecas sob demanda, leitura, renderização, intervalos de páginas,
   extração do texto com posição, gerador de .docx, perfil de cor sRGB, qpdf (WebAssembly) e downloads.
   Tudo roda no navegador; nenhum arquivo é enviado a servidores, salvo nas ferramentas de IA, por decisão do usuário. */
(function (root) {
  "use strict";
  const LIBS = {
    pdflib: { url: "https://cdnjs.cloudflare.com/ajax/libs/pdf-lib/1.17.1/pdf-lib.min.js", ok: () => root.PDFLib },
    pdfjs: { url: "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js", ok: () => root.pdfjsLib },
    jszip: { url: "https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js", ok: () => root.JSZip },
    tesseract: { url: "https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js", ok: () => root.Tesseract },
    mammoth: { url: "https://cdnjs.cloudflare.com/ajax/libs/mammoth/1.6.0/mammoth.browser.min.js", ok: () => root.mammoth },
    html2pdf: { url: "https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js", ok: () => root.html2pdf },
    pptx: { url: "https://cdn.jsdelivr.net/npm/pptxgenjs@3.12.0/dist/pptxgen.bundle.js", ok: () => root.PptxGenJS },
    xlsx: { url: "https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js", ok: () => root.XLSX },
    diff: { url: "https://cdnjs.cloudflare.com/ajax/libs/jsdiff/5.1.0/diff.min.js", ok: () => root.Diff },
    qpdf: { url: "https://cdn.jsdelivr.net/npm/@neslinesli93/qpdf-wasm@0.3.1/dist/qpdf.js", ok: () => N.qpdfFabrica }
  };
  const QPDF_WASM = "https://cdn.jsdelivr.net/npm/@neslinesli93/qpdf-wasm@0.3.1/dist/qpdf.wasm";
  const PDFJS_WORKER = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
  const promessas = {};

  function carregar(...nomes) {
    return Promise.all(nomes.map(nome => {
      const L = LIBS[nome];
      if (L.ok()) return Promise.resolve();
      if (!promessas[nome]) promessas[nome] = new Promise((ok, falha) => {
        const s = document.createElement("script"); s.src = L.url; s.async = true;
        s.onload = () => {
          if (nome === "qpdf") { N.qpdfFabrica = root.Module; try { delete root.Module; } catch (e) { root.Module = undefined; } }
          if (nome === "pdfjs") root.pdfjsLib.GlobalWorkerOptions.workerSrc = PDFJS_WORKER;
          L.ok() ? ok() : falha(new Error("A biblioteca " + nome + " não foi carregada."));
        };
        s.onerror = () => { delete promessas[nome]; falha(new Error("Não foi possível carregar a biblioteca " + nome + ". Verifique a conexão.")); };
        document.head.appendChild(s);
      });
      return promessas[nome];
    }));
  }

  /* ------------------------------------------------------------------ arquivos */
  const bytesDe = async f => new Uint8Array(f instanceof Uint8Array ? f : await f.arrayBuffer());
  const ehPdf = f => /\.pdf$/i.test(f.name || "") || f.type === "application/pdf";
  const base = n => String(n || "arquivo").replace(/\.[^.]+$/, "");
  const tam = b => b < 1024 ? b + " B" : b < 1048576 ? (b / 1024).toFixed(0) + " KB" : (b / 1048576).toFixed(1).replace(".", ",") + " MB";

  async function abrirLib(bytes, opc) {
    await carregar("pdflib");
    try { return await root.PDFLib.PDFDocument.load(bytes, Object.assign({ updateMetadata: false }, opc || {})); }
    catch (e) {
      if (/encrypt/i.test(e.message)) throw new Error("O PDF está protegido por senha. Use antes a ferramenta Desbloquear PDF.");
      throw new Error("Não foi possível ler o PDF (" + e.message + "). Tente a ferramenta Reparar PDF.");
    }
  }
  async function abrirJs(bytes, senha) {
    await carregar("pdfjs");
    try { return await root.pdfjsLib.getDocument({ data: bytes.slice(0), password: senha || undefined, isEvalSupported: false }).promise; }
    catch (e) {
      if (e && e.name === "PasswordException") throw new Error(senha ? "Senha incorreta." : "O PDF está protegido por senha.");
      throw new Error("Não foi possível ler o PDF: " + (e.message || e));
    }
  }
  async function renderizar(pagina, escala, fundo) {
    const vp = pagina.getViewport({ scale: escala });
    const cv = document.createElement("canvas"); cv.width = Math.max(1, Math.round(vp.width)); cv.height = Math.max(1, Math.round(vp.height));
    const ctx = cv.getContext("2d"); ctx.fillStyle = fundo || "#fff"; ctx.fillRect(0, 0, cv.width, cv.height);
    await pagina.render({ canvasContext: ctx, viewport: vp }).promise;
    return cv;
  }
  const blobDe = (cv, tipo, q) => new Promise(ok => cv.toBlob(ok, tipo || "image/jpeg", q == null ? 0.9 : q));
  async function miniaturas(bytes, largura, aoCada) {
    const pdf = await abrirJs(bytes), out = [];
    for (let i = 1; i <= pdf.numPages; i++) {
      const pg = await pdf.getPage(i), vp = pg.getViewport({ scale: 1 });
      const cv = await renderizar(pg, (largura || 150) / vp.width);
      out.push(cv); if (aoCada) aoCada(cv, i, pdf.numPages);
    }
    return out;
  }

  /* "1-3, 5, 8-" -> [1,2,3,5,8,...,n] (base 1, sem repetição, na ordem dada) */
  function intervalos(txt, n) {
    const out = [], visto = new Set();
    String(txt || "").split(/[;,]/).map(s => s.trim()).filter(Boolean).forEach(p => {
      const m = /^(\d*)\s*[-–a]\s*(\d*)$/.exec(p.replace(/\s+/g, " ").replace(/ a /, "-"));
      let a, b;
      if (m) { a = m[1] ? +m[1] : 1; b = m[2] ? +m[2] : n; } else if (/^\d+$/.test(p)) a = b = +p; else throw new Error("Intervalo inválido: \"" + p + "\". Use, por exemplo, 1-3, 5, 8-10.");
      if (a > b) [a, b] = [b, a];
      for (let i = Math.max(1, a); i <= Math.min(n, b); i++) if (!visto.has(i)) { visto.add(i); out.push(i); }
    });
    return out;
  }
  function grupos(txt, n) {
    return String(txt || "").split(/[;,]/).map(s => s.trim()).filter(Boolean).map(p => intervalos(p, n)).filter(g => g.length);
  }

  /* ------------------------------------------------------------------ texto com posição (pdf.js) */
  async function layout(pdf, num) {
    const pg = await pdf.getPage(num), vp = pg.getViewport({ scale: 1 });
    const tc = await pg.getTextContent();
    let nomes = {};
    try { await pg.getOperatorList(); tc.items.forEach(it => { if (it.fontName && !(it.fontName in nomes)) { try { const f = pg.commonObjs.get(it.fontName); nomes[it.fontName] = (f && (f.name || f.loadedName)) || ""; } catch (e) { nomes[it.fontName] = ""; } } }); } catch (e) { nomes = {}; }
    const itens = [];
    for (const it of tc.items) {
      if (!it.str || !it.str.trim()) { if (it.str === " " && itens.length) itens[itens.length - 1].espaco = true; continue; }
      const t = it.transform, fs = Math.hypot(t[2], t[3]) || Math.hypot(t[0], t[1]) || 10;
      const [x, y] = vp.convertToViewportPoint(t[4], t[5]);
      const nome = (nomes[it.fontName] || "") + " " + ((tc.styles[it.fontName] || {}).fontFamily || "");
      itens.push({ s: it.str, x, y: y - fs, w: Math.abs(it.width), h: fs, fs, bold: /bold|black|heavy|semibold|demi/i.test(nome), italic: /italic|oblique/i.test(nome), pdfX: t[4], pdfY: t[5] });
    }
    const ord = itens.slice().sort((a, b) => a.y - b.y || a.x - b.x), linhas = [];
    for (const it of ord) {
      const l = linhas.find(l => Math.abs(l.yb - (it.y + it.h)) < Math.max(2, it.h * 0.45));
      if (l) l.itens.push(it); else linhas.push({ yb: it.y + it.h, itens: [it] });
    }
    for (const l of linhas) {
      l.itens.sort((a, b) => a.x - b.x);
      let txt = "", fim = null; const cel = []; let atual = null;
      for (const it of l.itens) {
        const gap = fim == null ? 0 : it.x - fim;
        if (fim != null && (gap > it.fs * 0.18 || /\s$/.test(txt)) && !/\s$/.test(txt)) txt += " ";
        txt += it.s;
        if (!atual || gap > Math.max(it.fs * 1.3, 9)) { atual = { x: it.x, x1: it.x + it.w, s: it.s }; cel.push(atual); } else { atual.s += (gap > it.fs * 0.18 ? " " : "") + it.s; atual.x1 = it.x + it.w; }
        fim = it.x + it.w;
      }
      l.texto = txt.replace(/\s+/g, " ").trim(); l.celulas = cel.map(c => ({ x: c.x, x1: c.x1, s: c.s.replace(/\s+/g, " ").trim() }));
      l.x0 = l.itens[0].x; l.x1 = fim; l.y = Math.min(...l.itens.map(i => i.y));
      l.fs = Math.max(...l.itens.map(i => i.fs)); l.bold = l.itens.every(i => i.bold); l.italic = l.itens.every(i => i.italic);
    }
    linhas.sort((a, b) => a.y - b.y);
    return { largura: vp.width, altura: vp.height, itens, linhas, vazio: !itens.length };
  }
  function corpoFs(paginas) {
    const c = {}; paginas.forEach(p => p.linhas.forEach(l => { const k = Math.round(l.fs * 2) / 2; c[k] = (c[k] || 0) + l.texto.length; }));
    return +Object.keys(c).sort((a, b) => c[b] - c[a])[0] || 11;
  }
  /* blocos: parágrafos e títulos a partir das linhas, com o tamanho do corpo como referência */
  function blocos(pg, corpo) {
    const out = []; let atual = null;
    for (const l of pg.linhas) {
      const tit = l.texto.length < 120 && (l.fs >= corpo * 1.18 || (l.bold && l.texto.length < 90 && l.fs >= corpo * 0.95 && !/[.;,]$/.test(l.texto)));
      const nivel = l.fs >= corpo * 1.6 ? 1 : l.fs >= corpo * 1.18 ? 2 : 3;
      const lista = /^([•●▪◦\-–*]|\(?\d{1,2}[.)]|[a-z][.)])\s+/.test(l.texto);
      const gap = atual ? l.y - atual.fimY : 0;
      if (tit) { out.push({ tipo: "h", nivel, texto: l.texto, y: l.y }); atual = null; continue; }
      if (atual && !lista && gap < l.fs * 0.9 && Math.abs(l.fs - atual.fs) < 1.2) { atual.texto += (atual.texto.endsWith("-") ? "" : " ") + l.texto; atual.texto = atual.texto.replace(/(\w)- (\w)/g, "$1$2"); atual.fimY = l.y + l.fs * 1.15; atual.bold = atual.bold && l.bold; }
      else { atual = { tipo: lista ? "li" : "p", texto: l.texto, fs: l.fs, fimY: l.y + l.fs * 1.15, bold: l.bold, italic: l.italic, y: l.y }; out.push(atual); }
    }
    return out;
  }
  /* tabela: linhas -> células alinhadas em colunas por agrupamento das posições iniciais */
  function tabela(pg) {
    const xs = []; pg.linhas.forEach(l => l.celulas.forEach(c => xs.push(c.x)));
    xs.sort((a, b) => a - b); const cols = [];
    xs.forEach(x => { const c = cols.find(c => Math.abs(c.x - x) < 9); if (c) { c.n++; c.x = (c.x * (c.n - 1) + x) / c.n; } else cols.push({ x, n: 1 }); });
    const fortes = cols.filter(c => c.n >= Math.max(2, pg.linhas.length * 0.12)).sort((a, b) => a.x - b.x);
    const base = fortes.length ? fortes : cols.sort((a, b) => a.x - b.x);
    return pg.linhas.map(l => {
      const row = new Array(base.length).fill("");
      l.celulas.forEach(c => { let k = 0; for (let i = 0; i < base.length; i++) if (base[i].x <= c.x + 6) k = i; row[k] = row[k] ? row[k] + " " + c.s : c.s; });
      return row;
    });
  }
  async function textoTodo(bytes, opc) {
    opc = opc || {};
    const pdf = await abrirJs(bytes), pags = [];
    let worker = null;
    try {
      for (let i = 1; i <= pdf.numPages; i++) {
        if (opc.prog) opc.prog("Lendo a página " + i + " de " + pdf.numPages, i / pdf.numPages);
        const L = await layout(pdf, i);
        if (opc.ocr && L.itens.length < 3) {
          await carregar("tesseract");
          if (!worker) worker = await root.Tesseract.createWorker(opc.lingua || "por");
          const cv = await renderizar(await pdf.getPage(i), 2.2);
          const r = await worker.recognize(cv);
          L.ocr = true; L.textoOcr = r.data.text;
          L.linhas = (r.data.lines || []).map(ln => ({ texto: ln.text.trim(), y: ln.bbox.y0 / 2.2, x0: ln.bbox.x0 / 2.2, fs: Math.max(6, (ln.bbox.y1 - ln.bbox.y0) / 2.2 * 0.8), bold: false, celulas: [{ x: ln.bbox.x0 / 2.2, s: ln.text.trim() }] })).filter(l => l.texto);
        }
        pags.push(L);
      }
    } finally { if (worker) await worker.terminate(); }
    pags.texto = () => pags.map(p => p.linhas.map(l => l.texto).join("\n")).join("\n\n");
    return pags;
  }

  /* ------------------------------------------------------------------ qpdf (WebAssembly) */
  let wasmBin = null;
  async function qpdf(args, entradas, saidas) {
    await carregar("qpdf");
    if (!wasmBin) { const r = await fetch(QPDF_WASM); if (!r.ok) throw new Error("Não foi possível baixar o qpdf."); wasmBin = new Uint8Array(await r.arrayBuffer()); }
    const msgs = [];
    const m = await N.qpdfFabrica({ wasmBinary: wasmBin.slice(0), noInitialRun: true, print: t => msgs.push(t), printErr: t => msgs.push(t) });
    Object.keys(entradas).forEach(nome => m.FS.writeFile(nome, entradas[nome]));
    let cod = 0;
    try { cod = m.callMain(args); } catch (e) { cod = e && typeof e.status === "number" ? e.status : 2; if (!(e && "status" in e)) msgs.push(String(e.message || e)); }
    if (cod !== 0 && cod !== 3) {
      const txt = msgs.join(" ");
      if (/invalid password/i.test(txt)) throw new Error("Senha incorreta.");
      throw new Error("O qpdf não conseguiu processar o arquivo: " + (txt.slice(0, 220) || "código " + cod));
    }
    const out = {}; (saidas || []).forEach(nome => { try { out[nome] = m.FS.readFile(nome); } catch (e) { out[nome] = null; } });
    out.avisos = msgs; return out;
  }
  async function estaCriptografado(bytes) {
    const s = new TextDecoder("latin1").decode(bytes.subarray(Math.max(0, bytes.length - 4096)));
    if (/\/Encrypt\s/.test(s)) return true;
    try { await abrirJs(bytes); return false; } catch (e) { return /senha/i.test(e.message); }
  }

  /* ------------------------------------------------------------------ .docx mínimo */
  const xe = s => String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "");
  /* blocos: {tipo:'h'|'p'|'li'|'quebra'|'img', nivel, texto | runs:[{t,b,i}], img:{bytes, w, h}} */
  async function docx(lista, opc) {
    await carregar("jszip"); opc = opc || {};
    const z = new root.JSZip(), rels = [], mid = [];
    let nImg = 0;
    const run = (t, b, i) => "<w:r><w:rPr>" + (b ? "<w:b/>" : "") + (i ? "<w:i/>" : "") + "</w:rPr><w:t xml:space=\"preserve\">" + xe(t) + "</w:t></w:r>";
    const corpo = lista.map(b => {
      if (b.tipo === "quebra") return "<w:p><w:r><w:br w:type=\"page\"/></w:r></w:p>";
      if (b.tipo === "img") {
        nImg++; const id = "rIdImg" + nImg; z.file("word/media/img" + nImg + ".jpeg", b.img.bytes); rels.push('<Relationship Id="' + id + '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/img' + nImg + '.jpeg"/>');
        const maxW = 6.3 * 914400, cx = Math.round(Math.min(maxW, b.img.w * 9525)), cy = Math.round(cx * b.img.h / b.img.w);
        return '<w:p><w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0"><wp:extent cx="' + cx + '" cy="' + cy + '"/><wp:docPr id="' + nImg + '" name="Imagem ' + nImg + '"/><a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:nvPicPr><pic:cNvPr id="' + nImg + '" name="img' + nImg + '.jpeg"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip r:embed="' + id + '"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="' + cx + '" cy="' + cy + '"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r></w:p>';
      }
      const est = b.tipo === "h" ? "Titulo" + Math.min(3, b.nivel || 1) : b.tipo === "li" ? "Lista" : "Normal";
      const rs = b.runs ? b.runs.map(r => run(r.t, r.b, r.i)).join("") : run(b.texto, b.bold, b.italic);
      return "<w:p><w:pPr><w:pStyle w:val=\"" + est + "\"/>" + (b.alinhar ? "<w:jc w:val=\"" + b.alinhar + "\"/>" : "") + "</w:pPr>" + rs + "</w:p>";
    }).join("");
    const fonte = opc.fonte || "Calibri";
    z.file("[Content_Types].xml", '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Default Extension="jpeg" ContentType="image/jpeg"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/></Types>');
    z.file("_rels/.rels", '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>');
    z.file("word/_rels/document.xml.rels", '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rIdSt" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>' + rels.join("") + mid.join("") + "</Relationships>");
    const st = (id, nome, sz, b, antes, depois, extra) => '<w:style w:type="paragraph" w:styleId="' + id + '"><w:name w:val="' + nome + '"/><w:basedOn w:val="Normal"/><w:qFormat/><w:pPr><w:spacing w:before="' + antes + '" w:after="' + depois + '"/>' + (extra || "") + '</w:pPr><w:rPr>' + (b ? "<w:b/>" : "") + '<w:sz w:val="' + sz + '"/></w:rPr></w:style>';
    z.file("word/styles.xml", '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="' + fonte + '" w:hAnsi="' + fonte + '" w:cs="' + fonte + '"/><w:sz w:val="22"/><w:lang w:val="pt-BR"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:after="160" w:line="276" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults><w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:qFormat/></w:style>' +
      st("Titulo1", "heading 1", 32, true, 360, 160, '<w:keepNext/><w:outlineLvl w:val="0"/>') + st("Titulo2", "heading 2", 27, true, 280, 120, '<w:keepNext/><w:outlineLvl w:val="1"/>') + st("Titulo3", "heading 3", 23, true, 220, 100, '<w:keepNext/><w:outlineLvl w:val="2"/>') + st("Lista", "List Paragraph", 22, false, 0, 80, '<w:ind w:left="567" w:hanging="283"/>') + "</w:styles>");
    z.file("word/document.xml", '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing"><w:body>' + corpo + '<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1417" w:right="1417" w:bottom="1417" w:left="1417" w:header="709" w:footer="709" w:gutter="0"/></w:sectPr></w:body></w:document>');
    return z.generateAsync({ type: "blob", mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" });
  }

  /* ------------------------------------------------------------------ perfil ICC sRGB (v2, para o OutputIntent do PDF/A) */
  function iccSrgb() {
    const tags = [], s15 = v => { const n = Math.round(v * 65536); return [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255]; };
    const u32 = n => [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255], asc = t => [...t].map(c => c.charCodeAt(0));
    const xyz = (x, y, z) => asc("XYZ ").concat([0, 0, 0, 0], s15(x), s15(y), s15(z));
    const desc = t => asc("desc").concat([0, 0, 0, 0], u32(t.length + 1), asc(t), [0], u32(0), u32(0), [0, 0], [0], new Array(67).fill(0));
    const curv = asc("curv").concat([0, 0, 0, 0], u32(1), [2, 51]);
    tags.push(["desc", desc("sRGB IEC61966-2.1")], ["cprt", asc("text").concat([0, 0, 0, 0], asc("Sem direitos reservados"), [0])], ["wtpt", xyz(0.9642, 1, 0.8249)],
      ["rXYZ", xyz(0.4361, 0.2225, 0.0139)], ["gXYZ", xyz(0.3851, 0.7169, 0.0971)], ["bXYZ", xyz(0.1431, 0.0606, 0.7141)], ["rTRC", curv], ["gTRC", curv], ["bTRC", curv]);
    const pad = a => a.concat(new Array((4 - a.length % 4) % 4).fill(0));
    let off = 128 + 4 + tags.length * 12; const tabela = [], dados = []; const offs = {};
    tags.forEach(([sig, d]) => {
      const key = d === curv ? "curv" : sig;
      if (offs[key] == null) { offs[key] = off; const p = pad(d); dados.push(...p); off += p.length; }
      tabela.push(...asc(sig), ...u32(offs[key]), ...u32(d.length));
    });
    const tot = off, h = new Array(128).fill(0);
    h.splice(0, 4, ...u32(tot)); h.splice(8, 4, 2, 16, 0, 0); h.splice(12, 4, ...asc("mntr")); h.splice(16, 4, ...asc("RGB ")); h.splice(20, 4, ...asc("XYZ "));
    h.splice(24, 12, 7, 234, 0, 1, 0, 1, 0, 0, 0, 0, 0, 0); h.splice(36, 4, ...asc("acsp")); h.splice(68, 12, ...s15(0.9642), ...s15(1), ...s15(0.8249));
    return new Uint8Array(h.concat(u32(tags.length), tabela, dados));
  }

  /* ------------------------------------------------------------------ saída */
  function baixar(blob, nome) {
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = nome; document.body.appendChild(a); a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 4000);
  }
  async function zip(itens) { await carregar("jszip"); const z = new root.JSZip(); itens.forEach(i => z.file(i.nome, i.blob)); return z.generateAsync({ type: "blob" }); }
  const pdfBlob = bytes => new Blob([bytes], { type: "application/pdf" });
  const corRgb = hex => { const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex || "#000000") || [0, "00", "00", "00"]; return root.PDFLib.rgb(parseInt(m[1], 16) / 255, parseInt(m[2], 16) / 255, parseInt(m[3], 16) / 255); };
  async function imagemParaJpeg(file, q) {
    const bmp = await createImageBitmap(file instanceof Blob ? file : new Blob([file]));
    const cv = document.createElement("canvas"); cv.width = bmp.width; cv.height = bmp.height;
    const ctx = cv.getContext("2d"); ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, cv.width, cv.height); ctx.drawImage(bmp, 0, 0);
    return { bytes: new Uint8Array(await (await blobDe(cv, "image/jpeg", q || 0.92)).arrayBuffer()), w: bmp.width, h: bmp.height, canvas: cv };
  }

  const N = root.PDFX = { carregar, bytesDe, ehPdf, base, tam, abrirLib, abrirJs, renderizar, blobDe, miniaturas, intervalos, grupos, layout, corpoFs, blocos, tabela, textoTodo, qpdf, estaCriptografado, docx, iccSrgb, baixar, zip, pdfBlob, corRgb, imagemParaJpeg, xe };
})(window);
