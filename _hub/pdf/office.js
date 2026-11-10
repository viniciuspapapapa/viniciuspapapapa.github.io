/* Conversões entre PDF e os formatos do Office, no navegador: Word, Excel e HTML para PDF (renderização da página),
   PowerPoint para PDF (leitura do PPTX e desenho de cada slide), PDF para PowerPoint (PptxGenJS) e PDF para Excel. */
(function (root) {
  "use strict";
  const X = root.PDFX;

  /* ------------------------------------------------------------------ HTML -> PDF (html2pdf: html2canvas + jsPDF) */
  /* A renderização ocorre num iframe isolado, sem a folha de estilo do HUB (cujas cores OKLCH o html2canvas não lê). */
  const H2P = "https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js";
  async function htmlParaPdf(conteudo, opc) {
    const mm = opc.margem || 15, orient = opc.orient === "paisagem" ? "landscape" : "portrait", larguraPx = Math.round(((orient === "landscape" ? 297 : 210) - 2 * mm) * 96 / 25.4);
    const ifr = document.createElement("iframe"); ifr.setAttribute("aria-hidden", "true"); ifr.tabIndex = -1;
    ifr.style.cssText = "position:fixed;left:-20000px;top:0;width:" + (larguraPx + 40) + "px;height:1200px;border:0;visibility:hidden";
    document.body.appendChild(ifr);
    try {
      const w = ifr.contentWindow, d = w.document;
      d.open(); d.write('<!doctype html><html><head><meta charset="utf-8"><style>html,body{margin:0;background:#fff;color:#111}</style></head><body><div id="caixa" class="conv-caixa" style="width:' + larguraPx + 'px">' + conteudo + "</div></body></html>"); d.close();
      await new Promise((ok, falha) => { const sc = d.createElement("script"); sc.src = H2P; sc.onload = ok; sc.onerror = () => falha(new Error("Não foi possível carregar o conversor de HTML.")); d.head.appendChild(sc); });
      const caixa = d.getElementById("caixa");
      await Promise.all([...caixa.querySelectorAll("img")].map(i => i.complete ? null : new Promise(ok => { i.onload = i.onerror = ok; })));
      const ab = await w.html2pdf().set({ margin: mm, image: { type: "jpeg", quality: 0.94 }, html2canvas: { scale: 2, useCORS: true, backgroundColor: "#ffffff", logging: false }, jsPDF: { unit: "mm", format: "a4", orientation: orient }, pagebreak: { mode: ["css", "legacy", "avoid-all"], avoid: ["tr", "img", "h1", "h2", "h3"] } }).from(caixa).outputPdf("arraybuffer");
      return new Uint8Array(ab.slice(0));
    } finally { ifr.remove(); }
  }
  const DOC_CSS = "<style>.conv-caixa{font-family:Calibri,Carlito,'Segoe UI',Arial,sans-serif;font-size:11pt;line-height:1.45;color:#111;background:#fff}.conv-caixa h1{font-size:20pt;margin:10pt 0 6pt}.conv-caixa h2{font-size:16pt;margin:10pt 0 5pt}.conv-caixa h3{font-size:13pt;margin:8pt 0 4pt}.conv-caixa p{margin:0 0 8pt;text-align:justify}.conv-caixa table{border-collapse:collapse;width:100%;margin:6pt 0}.conv-caixa td,.conv-caixa th{border:1px solid #999;padding:3pt 5pt;vertical-align:top}.conv-caixa img{max-width:100%;height:auto}.conv-caixa ul,.conv-caixa ol{margin:0 0 8pt 18pt;padding:0}</style>";

  async function word(arquivos, op, ui) {
    await X.carregar("mammoth", "pdflib"); const saidas = [], avisos = [];
    for (let i = 0; i < arquivos.length; i++) {
      const f = arquivos[i]; ui.prog("Convertendo " + f.name, i / arquivos.length);
      if (!/\.docx$/i.test(f.name)) throw new Error(f.name + ": apenas arquivos .docx são aceitos. Salve o .doc como .docx no Word.");
      const r = await root.mammoth.convertToHtml({ arrayBuffer: await f.arrayBuffer() }, { styleMap: ["p[style-name='Title'] => h1:fresh", "p[style-name='Subtitle'] => h2:fresh", "p[style-name='Quote'] => blockquote:fresh"] });
      if (r.messages.some(m => m.type === "error")) avisos.push(f.name + ": partes não suportadas foram omitidas.");
      saidas.push({ nome: X.base(f.name) + ".pdf", blob: X.pdfBlob(await htmlParaPdf(DOC_CSS + r.value, { margem: +op.margem || 20 })) });
    }
    return { saidas, zip: saidas.length > 1 ? "Word_em_PDF.zip" : null, nota: (avisos.join(" ") + " A conversão preserva títulos, listas, tabelas e imagens; cabeçalhos, rodapés e caixas de texto do Word podem não ser reproduzidos.").trim() };
  }

  async function excel(arquivos, op, ui) {
    await X.carregar("xlsx"); const saidas = [];
    for (let i = 0; i < arquivos.length; i++) {
      const f = arquivos[i]; ui.prog("Convertendo " + f.name, i / arquivos.length);
      const wb = root.XLSX.read(new Uint8Array(await f.arrayBuffer()), { type: "array", cellDates: true });
      let html = "<style>.conv-caixa{font-family:Calibri,Arial,sans-serif;color:#111;background:#fff}.conv-caixa h2{font-size:12pt;margin:0 0 6pt}.conv-caixa table{border-collapse:collapse;width:100%;table-layout:fixed;font-size:8pt}.conv-caixa td{padding:2pt 3pt;overflow-wrap:anywhere;vertical-align:top" + (op.grade ? ";border:1px solid #b9b9b9" : "") + "}</style>";
      wb.SheetNames.forEach((nome, k) => {
        const ws = wb.Sheets[nome]; if (!ws["!ref"]) return;
        const t = root.XLSX.utils.sheet_to_html(ws, { header: "", footer: "" }).replace(/^[\s\S]*?(<table[\s\S]*<\/table>)[\s\S]*$/i, "$1");
        html += (k ? '<div class="html2pdf__page-break"></div>' : "") + "<h2>" + root.HUB.esc(nome) + "</h2>" + t;
      });
      saidas.push({ nome: X.base(f.name) + ".pdf", blob: X.pdfBlob(await htmlParaPdf(html, { margem: 10, orient: op.orient })) });
    }
    return { saidas, zip: saidas.length > 1 ? "Planilhas_em_PDF.zip" : null };
  }

  async function html(arquivos, op, ui) {
    let codigo = "";
    if (op.fonte === "arquivo") { if (!arquivos.length) throw new Error("Anexe o arquivo .html."); codigo = await arquivos[0].text(); }
    else if (op.fonte === "codigo") { codigo = op.codigo || ""; if (!codigo.trim()) throw new Error("Cole o código HTML."); }
    else {
      const url = String(op.url || "").trim(); if (!/^https?:\/\//i.test(url)) throw new Error("Informe um endereço completo, começando por https://.");
      ui.prog("Buscando a página", 0.2);
      try { const r = await fetch(url); if (!r.ok) throw new Error(); codigo = await r.text(); codigo = codigo.replace(/<head([^>]*)>/i, '<head$1><base href="' + url + '">'); }
      catch (e) { throw new Error("O site não permite que a página seja lida por outro endereço (bloqueio de segurança do navegador). Abra a página, use Arquivo, Salvar como, Página da Web completa, e anexe o arquivo .html; ou use a impressão do navegador em PDF."); }
    }
    const d = new DOMParser().parseFromString(codigo, "text/html");
    d.querySelectorAll("script,noscript,iframe,object,embed").forEach(e => e.remove());
    const estilos = [...d.querySelectorAll("style")].map(s => s.outerHTML).join("");
    ui.prog("Gerando o PDF", 0.5);
    const out = await htmlParaPdf(estilos + '<div class="conv-html">' + d.body.innerHTML + "</div>", { margem: 12, orient: op.orient });
    const nome = op.fonte === "arquivo" ? X.base(arquivos[0].name) : (d.title || "pagina").replace(/[\\/:*?"<>|]+/g, " ").trim().slice(0, 60);
    return { saidas: [{ nome: nome + ".pdf", blob: X.pdfBlob(out) }], nota: "Scripts são desativados por segurança; páginas que dependem deles para exibir o conteúdo podem sair incompletas." };
  }

  /* ------------------------------------------------------------------ PowerPoint (PPTX) -> PDF */
  const kids = (el, n) => el ? [...el.children].filter(c => c.localName === n) : [];
  const kid = (el, n) => kids(el, n)[0] || null;
  const desc = (el, n) => el ? el.getElementsByTagNameNS("*", n)[0] || null : null;
  const caminho = (baseDir, alvo) => { const p = (baseDir + "/" + alvo).split("/"), o = []; p.forEach(s => { if (s === "..") o.pop(); else if (s && s !== ".") o.push(s); }); return o.join("/"); };
  async function ppt(arquivos, op, ui) {
    await X.carregar("jszip", "pdflib"); const saidas = [], notas = [];
    for (const f of arquivos) {
      if (!/\.pptx$/i.test(f.name)) throw new Error(f.name + ": apenas arquivos .pptx são aceitos. Salve o .ppt como .pptx no PowerPoint.");
      const z = await root.JSZip.loadAsync(await f.arrayBuffer()), xml = async p => { const e = z.file(p); return e ? new DOMParser().parseFromString(await e.async("string"), "application/xml") : null; };
      const rels = async p => { const d = await xml(p.replace(/([^/]+)$/, "_rels/$1.rels")); const o = {}; if (d) [...d.getElementsByTagNameNS("*", "Relationship")].forEach(r => { o[r.getAttribute("Id")] = { alvo: caminho(p.replace(/\/[^/]+$/, ""), r.getAttribute("Target")), tipo: r.getAttribute("Type") }; }); return o; };
      const pres = await xml("ppt/presentation.xml"), presRels = await rels("ppt/presentation.xml");
      const sz = desc(pres, "sldSz"), CX = +sz.getAttribute("cx"), CY = +sz.getAttribute("cy"), LARG = 1600, k = LARG / CX, ALT = Math.round(CY * k);
      const ids = [...pres.getElementsByTagNameNS("*", "sldId")].map(e => presRels[e.getAttributeNS("http://schemas.openxmlformats.org/officeDocument/2006/relationships", "id") || e.getAttribute("r:id")]).filter(Boolean).map(r => r.alvo);
      const out = await root.PDFLib.PDFDocument.create(), ptW = CX / 12700, ptH = CY / 12700, cacheImg = {};
      let tema = null, ocultos = 0;
      for (let s = 0; s < ids.length; s++) {
        ui.prog("Desenhando o slide " + (s + 1) + " de " + ids.length, s / ids.length);
        const sl = await xml(ids[s]); if (!sl) continue;
        if (sl.documentElement.getAttribute("show") === "0") { ocultos++; continue; }
        const slRels = await rels(ids[s]), layoutP = Object.values(slRels).find(r => /slideLayout/.test(r.tipo)), lay = layoutP ? await xml(layoutP.alvo) : null;
        const layRels = layoutP ? await rels(layoutP.alvo) : {}, masterP = Object.values(layRels).find(r => /slideMaster/.test(r.tipo)), mas = masterP ? await xml(masterP.alvo) : null, masRels = masterP ? await rels(masterP.alvo) : {};
        if (!tema) { const t = Object.values(masRels).find(r => /theme/.test(r.tipo)); const td = t ? await xml(t.alvo) : null; tema = {}; if (td) { const cs = desc(td, "clrScheme"); if (cs) [...cs.children].forEach(c => { const v = desc(c, "srgbClr") || desc(c, "sysClr"); if (v) tema[c.localName] = "#" + (v.getAttribute("val") === "windowText" ? "000000" : v.getAttribute("val") === "window" ? "FFFFFF" : v.getAttribute("lastClr") || v.getAttribute("val")); }); } }
        const cor = el => {
          if (!el) return null; const s = kid(el, "srgbClr"), sc = kid(el, "schemeClr"), sy = kid(el, "sysClr");
          if (s) return "#" + s.getAttribute("val"); if (sy) return "#" + (sy.getAttribute("lastClr") || "000000");
          if (sc) { const v = sc.getAttribute("val"), m = { tx1: "dk1", bg1: "lt1", tx2: "dk2", bg2: "lt2" }[v] || v; return tema[m] || (/bg|lt/.test(m) ? "#FFFFFF" : "#000000"); }
          return null;
        };
        const cv = document.createElement("canvas"); cv.width = LARG; cv.height = ALT; const g = cv.getContext("2d"); g.fillStyle = "#FFFFFF"; g.fillRect(0, 0, LARG, ALT);
        const imagem = async (relsMap, id) => { const r = relsMap[id]; if (!r) return null; if (!(r.alvo in cacheImg)) { const e = z.file(r.alvo); cacheImg[r.alvo] = null; if (e && !/\.(emf|wmf|svg)$/i.test(r.alvo)) { try { cacheImg[r.alvo] = await createImageBitmap(await e.async("blob")); } catch (er) { /* formato não suportado */ } } } return cacheImg[r.alvo]; };
        /* fundo: slide, layout ou mestre */
        for (const [doc, rm] of [[sl, slRels], [lay, layRels], [mas, masRels]]) {
          const bg = doc && desc(doc, "bg"); if (!bg) continue; const bp = kid(bg, "bgPr");
          if (bp) { const sf = kid(bp, "solidFill"); if (sf) { g.fillStyle = cor(sf) || "#FFFFFF"; g.fillRect(0, 0, LARG, ALT); } const bf = kid(bp, "blipFill"); if (bf) { const im = await imagem(rm, desc(bf, "blip").getAttributeNS("http://schemas.openxmlformats.org/officeDocument/2006/relationships", "embed")); if (im) g.drawImage(im, 0, 0, LARG, ALT); } const gf = kid(bp, "gradFill"); if (gf) { const gs = [...gf.getElementsByTagNameNS("*", "gs")]; const lg = g.createLinearGradient(0, 0, 0, ALT); gs.forEach(x => lg.addColorStop(+x.getAttribute("pos") / 100000, cor(x) || "#FFFFFF")); g.fillStyle = lg; g.fillRect(0, 0, LARG, ALT); } }
          break;
        }
        const estilos = { title: desc(mas, "titleStyle"), body: desc(mas, "bodyStyle"), other: desc(mas, "otherStyle") };
        const phInfo = sp => { const ph = desc(kid(sp, "nvSpPr") || kid(sp, "nvPicPr") || sp, "ph"); return ph ? { tipo: ph.getAttribute("type") || "body", idx: ph.getAttribute("idx") } : null; };
        const acharPh = (doc, ph) => { if (!doc || !ph) return null; const sps = [...doc.getElementsByTagNameNS("*", "sp")]; return sps.find(x => { const p = phInfo(x); return p && ph.idx != null && p.idx === ph.idx; }) || sps.find(x => { const p = phInfo(x); return p && p.tipo === ph.tipo; }) || null; };
        const xfrmDe = (sp, ph) => { let x = desc(kid(sp, "spPr") || kid(sp, "grpSpPr") || sp, "xfrm"); if (!x && ph) { const l = acharPh(lay, ph), m = acharPh(mas, ph); x = (l && desc(kid(l, "spPr"), "xfrm")) || (m && desc(kid(m, "spPr"), "xfrm")); } if (!x) return null; const o = kid(x, "off"), e = kid(x, "ext"); return o && e ? { x: +o.getAttribute("x"), y: +o.getAttribute("y"), w: +e.getAttribute("cx"), h: +e.getAttribute("cy"), rot: +(x.getAttribute("rot") || 0) / 60000 } : null; };
        const nivelPr = (lst, lvl) => lst ? kid(lst, "lvl" + (lvl + 1) + "pPr") : null;
        async function desenharTexto(sp, r, ph) {
          const tx = kid(sp, "txBody"); if (!tx) return;
          const bp = kid(tx, "bodyPr"), na = bp && kid(bp, "normAutofit"), escala = na && na.getAttribute("fontScale") ? +na.getAttribute("fontScale") / 100000 : 1;
          const ins = n => bp && bp.getAttribute(n) != null ? +bp.getAttribute(n) : (n[0] === "l" || n[0] === "r" ? 91440 : 45720);
          const ancora = (bp && bp.getAttribute("anchor")) || (ph && /title/i.test(ph.tipo) && ph.tipo !== "subTitle" ? "ctr" : "t");
          const est = ph ? (/title/i.test(ph.tipo) ? estilos.title : /body|obj|subTitle/i.test(ph.tipo) || ph.tipo === "body" ? estilos.body : estilos.other) : estilos.other;
          const lstLocal = kid(tx, "lstStyle"), lstLay = ph ? (() => { const l = acharPh(lay, ph); return l ? desc(kid(l, "txBody"), "lstStyle") : null; })() : null;
          const bx = (r.x + ins("lIns")) * k, by = (r.y + ins("tIns")) * k, bw = Math.max(10, (r.w - ins("lIns") - ins("rIns")) * k), bh = (r.h - ins("tIns") - ins("bIns")) * k;
          const linhas = [];
          for (const p of kids(tx, "p")) {
            const pPr = kid(p, "pPr"), lvl = pPr && pPr.getAttribute("lvl") ? +pPr.getAttribute("lvl") : 0;
            const herd = [nivelPr(lstLocal, lvl), nivelPr(lstLay, lvl), nivelPr(est, lvl)].filter(Boolean);
            const defR = herd.map(h => kid(h, "defRPr")).filter(Boolean);
            const algn = (pPr && pPr.getAttribute("algn")) || (herd.find(h => h.getAttribute("algn")) || { getAttribute: () => null }).getAttribute("algn") || "l";
            const temBullet = !(pPr && kid(pPr, "buNone")) && (pPr && (kid(pPr, "buChar") || kid(pPr, "buAutoNum")) || (!(herd[0] && kid(herd[0], "buNone")) && herd.some(h => kid(h, "buChar"))) && ph && /body|obj/.test(ph.tipo));
            const runs = [];
            for (const r2 of p.children) {
              if (!["r", "fld", "br"].includes(r2.localName)) continue;
              if (r2.localName === "br") { runs.push({ br: true }); continue; }
              const rp = kid(r2, "rPr"), t = (kid(r2, "t") || {}).textContent || "";
              const at = n => (rp && rp.getAttribute(n)) || (defR.find(d => d.getAttribute(n)) || { getAttribute: () => null }).getAttribute(n);
              const szv = at("sz"), tamPt = (szv ? +szv / 100 : (ph && /title/i.test(ph.tipo) && ph.tipo !== "subTitle" ? 40 : 18)) * escala;
              const c = (rp && cor(kid(rp, "solidFill"))) || defR.map(d => cor(kid(d, "solidFill"))).find(Boolean) || "#000000";
              runs.push({ t, tam: tamPt * 12700 * k, b: at("b") === "1", i: at("i") === "1", cor: c });
            }
            if (!runs.length) { const end = kid(p, "endParaRPr"); const szv = end && end.getAttribute("sz"); linhas.push({ itens: [], alt: (szv ? +szv / 100 : 18) * escala * 12700 * k * 1.2, algn }); continue; }
            if (temBullet && runs.some(x => x.t && x.t.trim())) runs.unshift({ t: "•  ", tam: runs[0].tam, cor: runs[0].cor });
            const recuo = lvl * 0.4 * 914400 * k;
            let atual = { itens: [], w: 0, alt: 0, algn, recuo };
            const fecha = () => { linhas.push(atual); atual = { itens: [], w: 0, alt: 0, algn, recuo }; };
            for (const run of runs) {
              if (run.br) { fecha(); continue; }
              g.font = (run.i ? "italic " : "") + (run.b ? "bold " : "") + run.tam.toFixed(1) + "px Calibri, Carlito, Arial, sans-serif";
              for (const pal of run.t.split(/(\s+)/)) {
                if (!pal) continue; const w = g.measureText(pal).width;
                if (atual.w + w > bw - recuo && atual.itens.length && pal.trim()) fecha();
                if (!atual.itens.length && !pal.trim()) continue;
                atual.itens.push({ t: pal, w, font: g.font, cor: run.cor, tam: run.tam }); atual.w += w; atual.alt = Math.max(atual.alt, run.tam * 1.2);
              }
            }
            fecha();
          }
          const total = linhas.reduce((a, l) => a + (l.alt || 0), 0);
          let y = ancora === "ctr" ? by + (bh - total) / 2 : ancora === "b" ? by + bh - total : by;
          g.save(); g.textBaseline = "alphabetic";
          for (const l of linhas) {
            const x0 = bx + (l.recuo || 0) + (l.algn === "ctr" ? (bw - (l.recuo || 0) - l.w) / 2 : l.algn === "r" ? bw - (l.recuo || 0) - l.w : 0); let x = x0;
            for (const it of l.itens) { g.font = it.font; g.fillStyle = it.cor; g.fillText(it.t, x, y + it.tam * 0.95); x += it.w; }
            y += l.alt || 0;
          }
          g.restore();
        }
        async function desenharArvore(arvore, rm, tr, pular) {
          for (const el of arvore.children) {
            const nome = el.localName;
            if (nome === "sp") {
              const ph = phInfo(el); if (pular && ph) continue;
              const r0 = xfrmDe(el, ph); if (!r0) continue; const r = tr(r0), spPr = kid(el, "spPr");
              const geo = spPr && desc(spPr, "prstGeom"), forma = geo ? geo.getAttribute("prst") : "rect";
              const fill = spPr && kid(spPr, "solidFill"), ln = spPr && kid(spPr, "ln"), lnFill = ln && kid(ln, "solidFill");
              const caminhoForma = () => { g.beginPath(); if (forma === "ellipse") g.ellipse((r.x + r.w / 2) * k, (r.y + r.h / 2) * k, r.w / 2 * k, r.h / 2 * k, 0, 0, 7); else if (forma === "roundRect" && g.roundRect) g.roundRect(r.x * k, r.y * k, r.w * k, r.h * k, Math.min(r.w, r.h) * k * 0.16); else g.rect(r.x * k, r.y * k, r.w * k, r.h * k); };
              if (fill) { g.fillStyle = cor(fill) || "#DDDDDD"; caminhoForma(); g.fill(); }
              else if (!spPr || !kid(spPr, "noFill")) { const st = kid(el, "style"), fr = st && kid(st, "fillRef"); if (fr && +fr.getAttribute("idx") > 0 && !ph) { g.fillStyle = cor(fr) || "#4472C4"; caminhoForma(); g.fill(); } }
              if (lnFill) { g.strokeStyle = cor(lnFill) || "#000"; g.lineWidth = Math.max(1, (+ln.getAttribute("w") || 12700) * k); caminhoForma(); g.stroke(); }
              await desenharTexto(el, r, ph);
            } else if (nome === "pic") {
              const r0 = xfrmDe(el, phInfo(el)); if (!r0) continue; const r = tr(r0), blip = desc(el, "blip"); if (!blip) continue;
              const im = await imagem(rm, blip.getAttributeNS("http://schemas.openxmlformats.org/officeDocument/2006/relationships", "embed")); if (!im) continue;
              const sr = desc(el, "srcRect"), c = n => sr && sr.getAttribute(n) ? +sr.getAttribute(n) / 100000 : 0;
              const sx = im.width * c("l"), sy = im.height * c("t"), sw = im.width * (1 - c("l") - c("r")), sh = im.height * (1 - c("t") - c("b"));
              g.drawImage(im, sx, sy, Math.max(1, sw), Math.max(1, sh), r.x * k, r.y * k, r.w * k, r.h * k);
            } else if (nome === "grpSp") {
              const x = desc(kid(el, "grpSpPr"), "xfrm"); if (!x) continue;
              const o = kid(x, "off"), e = kid(x, "ext"), co = kid(x, "chOff"), ce = kid(x, "chExt");
              const ox = +o.getAttribute("x"), oy = +o.getAttribute("y"), ew = +e.getAttribute("cx"), eh = +e.getAttribute("cy"), cx0 = co ? +co.getAttribute("x") : ox, cy0 = co ? +co.getAttribute("y") : oy, cw = ce ? +ce.getAttribute("cx") || ew : ew, ch = ce ? +ce.getAttribute("cy") || eh : eh;
              const sub = r1 => tr({ x: ox + (r1.x - cx0) * ew / cw, y: oy + (r1.y - cy0) * eh / ch, w: r1.w * ew / cw, h: r1.h * eh / ch });
              await desenharArvore(el, rm, sub, pular);
            } else if (nome === "graphicFrame") {
              const tbl = desc(el, "tbl"), xf = kid(el, "xfrm"); if (!tbl || !xf) continue;
              const r = tr({ x: +kid(xf, "off").getAttribute("x"), y: +kid(xf, "off").getAttribute("y"), w: +kid(xf, "ext").getAttribute("cx"), h: +kid(xf, "ext").getAttribute("cy") });
              const cols = [...desc(tbl, "tblGrid").children].map(c => +c.getAttribute("w")); let yy = r.y;
              for (const tr2 of kids(tbl, "tr")) {
                const rp0 = desc(tr2, "rPr"), sz0 = rp0 && rp0.getAttribute("sz") ? +rp0.getAttribute("sz") / 100 : 14, hh = Math.max(+tr2.getAttribute("h") || 0, sz0 * 12700 * 1.7); let xx = r.x;
                kids(tr2, "tc").forEach((tc, ci) => {
                  const w = cols[ci] || 0, tcPr = kid(tc, "tcPr"), sf = tcPr && kid(tcPr, "solidFill");
                  if (sf) { g.fillStyle = cor(sf) || "#FFF"; g.fillRect(xx * k, yy * k, w * k, hh * k); }
                  g.strokeStyle = "#9A9A9A"; g.lineWidth = 1; g.strokeRect(xx * k, yy * k, w * k, hh * k);
                  const txt = [...tc.getElementsByTagNameNS("*", "t")].map(t => t.textContent).join(" "); const rp = desc(tc, "rPr"), szv = rp && rp.getAttribute("sz");
                  g.font = ((rp && rp.getAttribute("b") === "1") ? "bold " : "") + ((szv ? +szv / 100 : 14) * 12700 * k).toFixed(1) + "px Calibri, Arial, sans-serif"; g.fillStyle = cor(rp && kid(rp, "solidFill")) || "#000";
                  g.save(); g.beginPath(); g.rect(xx * k, yy * k, w * k, hh * k); g.clip(); g.fillText(txt, xx * k + 6, yy * k + (szv ? +szv / 100 : 14) * 12700 * k * 1.1); g.restore();
                  xx += w;
                });
                yy += hh;
              }
            }
          }
        }
        const id = r => r;
        if (mas) await desenharArvore(desc(mas, "spTree"), masRels, id, true);
        if (lay) await desenharArvore(desc(lay, "spTree"), layRels, id, true);
        await desenharArvore(desc(sl, "spTree"), slRels, id, false);
        const j = await out.embedJpg(new Uint8Array(await (await X.blobDe(cv, "image/jpeg", 0.92)).arrayBuffer()));
        out.addPage([ptW, ptH]).drawImage(j, { x: 0, y: 0, width: ptW, height: ptH });
      }
      if (!out.getPageCount()) throw new Error(f.name + ": nenhum slide foi encontrado.");
      if (ocultos) notas.push(f.name + ": " + ocultos + " slides ocultos não foram incluídos.");
      saidas.push({ nome: X.base(f.name) + ".pdf", blob: X.pdfBlob(await out.save()) });
    }
    return { saidas, zip: saidas.length > 1 ? "Apresentacoes_em_PDF.zip" : null, nota: (notas.join(" ") + " Cada slide é reproduzido como imagem, com textos, imagens, formas e tabelas; animações e efeitos especiais não são reproduzidos.").trim() };
  }

  /* ------------------------------------------------------------------ PDF -> PowerPoint */
  async function pdfPpt(arquivos, op, ui) {
    await X.carregar("pptx"); const f = arquivos[0], b = await X.bytesDe(f), pdf = await X.abrirJs(b);
    const p1 = (await pdf.getPage(1)).getViewport({ scale: 1 }), W = p1.width / 72, H = p1.height / 72;
    const pres = new root.PptxGenJS(); pres.defineLayout({ name: "PDF", width: W, height: H }); pres.layout = "PDF";
    for (let i = 1; i <= pdf.numPages; i++) {
      ui.prog("Convertendo a página " + i + " de " + pdf.numPages, i / pdf.numPages);
      const pg = await pdf.getPage(i), vp = pg.getViewport({ scale: 1 }), s = Math.min(W / (vp.width / 72), H / (vp.height / 72)), sl = pres.addSlide(), L = await X.layout(pdf, i);
      const ox = (W - vp.width / 72 * s) / 2, oy = (H - vp.height / 72 * s) / 2;
      if (op.modo === "texto") {
        L.linhas.forEach(l => sl.addText(l.texto, { x: ox + l.x0 / 72 * s, y: oy + (l.y - l.fs * 0.2) / 72 * s, w: Math.max(0.3, (l.x1 - l.x0) / 72 * s * 1.1 + 0.1), h: l.fs * 1.45 / 72 * s, fontSize: Math.max(6, Math.round(l.fs * s)), bold: l.bold, italic: l.italic, fontFace: "Arial", margin: 0, valign: "top", fit: "none", color: "111111" }));
      } else {
        const cv = await X.renderizar(pg, 2); sl.addImage({ data: cv.toDataURL("image/jpeg", 0.9), x: ox, y: oy, w: vp.width / 72 * s, h: vp.height / 72 * s });
        const t = L.linhas.map(l => l.texto).join("\n"); if (t.trim()) sl.addNotes(t);
      }
    }
    const blob = await pres.write({ outputType: "blob" });
    return { saidas: [{ nome: X.base(f.name) + ".pptx", blob }], nota: op.modo === "texto" ? "Textos convertidos em caixas editáveis; imagens e gráficos da página não são incluídos nesse modo." : "Cada página virou um slide fiel ao original; o texto da página está nas anotações do slide." };
  }

  /* ------------------------------------------------------------------ PDF -> Excel */
  const numBR = s => { const t = String(s).trim(); if (!/^\(?-?\s*(R\$\s*)?[\d.]+(,\d+)?\)?%?$/.test(t) || !/\d/.test(t)) return s; const neg = /^\(|-/.test(t), pct = /%$/.test(t); let n = parseFloat(t.replace(/[^\d,]/g, "").replace(",", ".")); if (!isFinite(n)) return s; if (t.replace(/[^\d.,]/g, "").split(".").length > 1 && !/,/.test(t) && !/^\d{1,3}(\.\d{3})+$/.test(t.replace(/[^\d.]/g, ""))) return s; if (neg) n = -n; return pct ? n / 100 : n; };
  async function pdfExcel(arquivos, op, ui) {
    await X.carregar("xlsx"); const f = arquivos[0], pags = await X.textoTodo(await X.bytesDe(f), { ocr: op.ocr, prog: ui.prog }), XL = root.XLSX, wb = XL.utils.book_new();
    const folha = rows => { const ws = XL.utils.aoa_to_sheet(rows.map(r => r.map(numBR))); const larg = []; rows.forEach(r => r.forEach((c, i) => { larg[i] = Math.min(60, Math.max(larg[i] || 6, String(c).length + 2)); })); ws["!cols"] = larg.map(w => ({ wch: w })); return ws; };
    if (op.abas === "unica") { const todas = []; pags.forEach((p, i) => { if (i) todas.push([]); X.tabela(p).forEach(r => todas.push(r)); }); XL.utils.book_append_sheet(wb, folha(todas), "Dados"); }
    else pags.forEach((p, i) => XL.utils.book_append_sheet(wb, folha(X.tabela(p).length ? X.tabela(p) : [["(página sem texto)"]]), "Página " + (i + 1)));
    const ab = XL.write(wb, { type: "array", bookType: "xlsx" });
    return { saidas: [{ nome: X.base(f.name) + ".xlsx", blob: new Blob([ab], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }) }], nota: "As colunas são reconstruídas pelo alinhamento do texto; valores no formato brasileiro foram convertidos em números." };
  }

  root.PDF_OFFICE = { word, excel, html, ppt, pdfPpt, pdfExcel, htmlParaPdf };
})(window);
