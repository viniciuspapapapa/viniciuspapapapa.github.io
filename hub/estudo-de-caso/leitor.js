/* Leitura integral da cópia do processo: texto dos PDFs (pdf.js), OCR das páginas digitalizadas (Tesseract, português)
   e identificação de página e ID do processo eletrônico para ancorar o estudo nos autos. */
(function (root) {
  "use strict";
  const MIN_TEXTO = 60;

  function linhas(itens) {
    const ord = itens.slice().sort((a, b) => b.y - a.y || a.x - b.x);
    const out = [];
    for (const it of ord) { const l = out.find(l => Math.abs(l.y - it.y) < 3); if (l) l.push(it); else { const n = [it]; n.y = it.y; out.push(n); } }
    return out.map(l => l.sort((a, b) => a.x - b.x).map(i => i.s).join(" ").replace(/\s+/g, " ").trim()).filter(Boolean).join("\n");
  }
  function idProcesso(t) {
    let m = /Num\.\s*(\d{5,})\s*-\s*P[áa]g\.\s*(\d+)/i.exec(t); if (m) return "ID " + m[1] + ", pág. " + m[2];
    m = /Evento\s+(\d+)\s*[,-]?\s*([A-Z]{2,}\d*)/.exec(t); if (m) return "evento " + m[1] + " " + m[2];
    m = /\bfls?\.\s*(\d{1,5})\b/i.exec(t.slice(-300)); if (m) return "fls. " + m[1];
    return "";
  }

  /* arquivos: File[]; op: { prog(msg, fracao), cancelado() } */
  async function ler(arquivos, op) {
    op = op || {};
    const prog = op.prog || (() => {}), cancel = op.cancelado || (() => false);
    if (!root.pdfjsLib) throw new Error("O leitor de PDF não foi carregado. Verifique a conexão e recarregue a página.");
    const docs = [];
    let worker = null, totalPg = 0, feitas = 0, ocrPg = 0;
    const pdfs = [];
    for (const f of arquivos) { const buf = await f.arrayBuffer(); const pdf = await root.pdfjsLib.getDocument({ data: new Uint8Array(buf) }).promise; pdfs.push({ f, pdf }); totalPg += pdf.numPages; }
    try {
      for (const { f, pdf } of pdfs) {
        const doc = { nome: f.name, paginas: [] };
        for (let i = 1; i <= pdf.numPages; i++) {
          if (cancel()) throw new Error("Leitura cancelada.");
          const pg = await pdf.getPage(i);
          const tc = await pg.getTextContent();
          let texto = linhas(tc.items.filter(it => it.str && it.str.trim()).map(it => ({ x: it.transform[4], y: it.transform[5], s: it.str })));
          let ocr = false, conf = null;
          if (texto.replace(/\s/g, "").length < MIN_TEXTO) {
            if (!root.Tesseract) throw new Error("O módulo de OCR não foi carregado. Verifique a conexão e recarregue a página.");
            prog("OCR da página " + i + " de " + f.name + " (" + (feitas + 1) + "/" + totalPg + ")", feitas / totalPg);
            if (!worker) worker = await root.Tesseract.createWorker("por");
            const vp = pg.getViewport({ scale: 2 });
            const cv = document.createElement("canvas"); cv.width = vp.width; cv.height = vp.height;
            await pg.render({ canvasContext: cv.getContext("2d"), viewport: vp }).promise;
            const r = await worker.recognize(cv);
            texto = (r.data.text || "").replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim(); ocr = true; conf = Math.round(r.data.confidence || 0); ocrPg++;
            cv.width = cv.height = 0;
          } else prog("Lendo " + f.name + ", página " + i + " (" + (feitas + 1) + "/" + totalPg + ")", feitas / totalPg);
          doc.paginas.push({ n: i, texto, ocr, conf, id: idProcesso(texto) });
          feitas++;
          pg.cleanup();
        }
        docs.push(doc);
      }
    } finally { if (worker) await worker.terminate(); }
    const varios = docs.length > 1;
    const partes = [];
    for (const d of docs) for (const p of d.paginas) {
      partes.push("[[" + (varios ? d.nome + " | " : "") + "pág. " + p.n + (p.id ? " | " + p.id : "") + (p.ocr ? " | OCR " + p.conf + "%" : "") + "]]\n" + (p.texto || "(página sem texto legível)"));
    }
    const texto = partes.join("\n\n");
    const ilegiveis = docs.flatMap(d => d.paginas.filter(p => (p.ocr && p.conf < 55) || !p.texto.replace(/\s/g, "")).map(p => (varios ? d.nome + ", " : "") + "pág. " + p.n));
    return { docs, texto, paginas: totalPg, ocr: ocrPg, ilegiveis, chars: texto.length, tokens: Math.ceil(texto.length / 3.3) };
  }

  /* divide o texto em blocos por página, sem cortar páginas, com limite aproximado de tokens */
  function blocos(leitura, limiteTokens) {
    const lim = limiteTokens * 3.3, out = []; let cur = [], tam = 0;
    const varios = leitura.docs.length > 1;
    for (const d of leitura.docs) for (const p of d.paginas) {
      const t = "[[" + (varios ? d.nome + " | " : "") + "pág. " + p.n + (p.id ? " | " + p.id : "") + (p.ocr ? " | OCR " + p.conf + "%" : "") + "]]\n" + (p.texto || "(página sem texto legível)");
      if (tam + t.length > lim && cur.length) { out.push(cur.join("\n\n")); cur = []; tam = 0; }
      cur.push(t); tam += t.length + 2;
    }
    if (cur.length) out.push(cur.join("\n\n"));
    return out;
  }

  root.EC_LEITOR = { ler, blocos };
})(typeof window !== "undefined" ? window : globalThis);
