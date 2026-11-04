/* Capa institucional do Organizador de Documentos (padrão obrigatório da skill organizador-documentos),
   portada para pdf-lib com as mesmas medidas: margens de 85,04 pt, bloco de texto a 86% da largura útil,
   marca a 58 pt do topo, numeral de folio de 72 pt, barra amarela de 34 × 4 pt em y = 530, títulos de 21 pt,
   ementa justificada de 9,5 pt com entrelinha de 15,6 pt, rodapé com filete em y = 82 e barra de sangria de 22 pt. */
(function (root) {
  "use strict";
  const c255 = h => [parseInt(h.slice(1, 3), 16) / 255, parseInt(h.slice(3, 5), 16) / 255, parseInt(h.slice(5, 7), 16) / 255];
  const COR = { INK: c255("#3C3C3C"), INK_SOFT: c255("#6B6662"), BODY: c255("#4F4B48"), GREY: c255("#A09B9B"), GREY_DK: c255("#86817D"), GREY_LINE: c255("#C8C3BE"), GHOST: c255("#E7E3DF"), YELLOW: c255("#F5EF90") };
  const PRACAS = "BELO HORIZONTE   ·   SÃO PAULO   ·   BRASÍLIA   ·   CUIABÁ   ·   JOÃO MONLEVADE";

  function tw(txt, font, size, cs) { return font.widthOfTextAtSize(txt, size) + (cs || 0) * Math.max(txt.length - 1, 0); }
  /* único ponto de escrita: fixa o espaçamento entre caracteres e o zera em seguida */
  function put(page, x, y, txt, font, size, cor, cs, align) {
    const { rgb, setCharacterSpacing } = root.PDFLib;
    cs = cs || 0;
    const w = tw(txt, font, size, cs);
    if (align === "right") x -= w; else if (align === "center") x -= w / 2;
    if (cs) page.pushOperators(setCharacterSpacing(cs));
    page.drawText(txt, { x, y, size, font, color: rgb(...cor) });
    if (cs) page.pushOperators(setCharacterSpacing(0));
    return w;
  }
  function wrap(txt, font, size, maxw, cs) {
    const palavras = String(txt || "").split(/\s+/).filter(Boolean), linhas = []; let atual = "";
    for (const p of palavras) { const t = (atual + " " + p).trim(); if (tw(t, font, size, cs) <= maxw || !atual) atual = t; else { linhas.push(atual); atual = p; } }
    if (atual) linhas.push(atual);
    return linhas;
  }
  function justificado(page, x, y, txt, font, size, cor, maxw, leading) {
    const linhas = wrap(txt, font, size, maxw);
    linhas.forEach((ln, i) => {
      const palavras = ln.split(" "), ultima = i === linhas.length - 1;
      if (ultima || palavras.length < 2) put(page, x, y, ln, font, size, cor);
      else {
        const natural = palavras.reduce((s, p) => s + font.widthOfTextAtSize(p, size), 0);
        const vao = (maxw - natural) / (palavras.length - 1);
        if (vao > size * 1.25) put(page, x, y, ln, font, size, cor);
        else { let cx = x; for (const p of palavras) { put(page, cx, y, p, font, size, cor); cx += font.widthOfTextAtSize(p, size) + vao; } }
      }
      y -= leading;
    });
    return y + leading;
  }

  /* f = { light, regular, bold, logo } (fontes e imagem já incorporadas ao documento) */
  function desenhar(page, f, num, titulo, complemento, ementa, rodape) {
    const { rgb } = root.PDFLib;
    const { width: W, height: H } = page.getSize();
    const ML = 85.04, MR = W - 85.04, TXTW = (MR - ML) * 0.86;
    const lw = 120, lh = lw * 440 / 2112;
    page.drawImage(f.logo, { x: ML, y: H - 58 - lh, width: lw, height: lh });
    put(page, MR, H - 58 - lh + 5.5, "ANEXO DOCUMENTAL", f.bold, 7.0, COR.GREY, 1.9, "right");
    page.drawLine({ start: { x: ML, y: H - 105 }, end: { x: MR, y: H - 105 }, thickness: 0.6, color: rgb(...COR.GREY_LINE) });
    put(page, MR, H - 178, String(num).padStart(2, "0"), f.light, 72, COR.GHOST, 0, "right");
    const top = 530.0;
    page.drawRectangle({ x: ML, y: top, width: 34, height: 4, color: rgb(...COR.YELLOW) });
    put(page, ML, top - 22, "DOC. " + num, f.bold, 8.5, COR.GREY_DK, 2.3);
    let ty = top - 54;
    for (const ln of wrap(titulo, f.regular, 21, TXTW)) { put(page, ML, ty, ln, f.regular, 21, COR.INK); ty -= 27; }
    if (complemento) for (const ln of wrap(complemento, f.light, 21, TXTW)) { put(page, ML, ty, ln, f.light, 21, COR.INK_SOFT); ty -= 27; }
    ty -= 5;
    page.drawLine({ start: { x: ML, y: ty }, end: { x: ML + 210, y: ty }, thickness: 0.6, color: rgb(...COR.GREY_LINE) });
    let fimEmenta = ty - 30;
    if (ementa) fimEmenta = justificado(page, ML, ty - 30, ementa, f.regular, 9.5, COR.BODY, TXTW, 15.6);
    page.drawLine({ start: { x: ML, y: 82 }, end: { x: MR, y: 82 }, thickness: 0.5, color: rgb(...COR.GREY_LINE) });
    put(page, ML, 66, rodape || "", f.regular, 7.5, COR.GREY_DK);
    put(page, ML, 44, PRACAS, f.regular, 6.4, COR.GREY, 0.9);
    const wDom = tw(".COM.BR", f.regular, 7.2, 0.6), wNom = tw("TPCADVOGADOS", f.bold, 7.2, 0.6);
    put(page, MR - wDom - wNom, 44, "TPCADVOGADOS", f.bold, 7.2, COR.GREY, 0.6);
    put(page, MR - wDom, 44, ".COM.BR", f.regular, 7.2, COR.GREY, 0.6);
    page.drawRectangle({ x: -2, y: 0, width: W + 4, height: 22, color: rgb(...COR.YELLOW) });
    /* sinaliza colisões para a conferência: ementa sobre o filete do rodapé ou título sobre o numeral */
    return { colisaoRodape: fimEmenta - 10 < 82, linhasTitulo: wrap(titulo, f.regular, 21, TXTW).length };
  }

  async function incorporar(pdf, recursos) {
    pdf.registerFontkit(root.fontkit);
    return {
      light: await pdf.embedFont(recursos.light, { subset: true }),
      regular: await pdf.embedFont(recursos.regular, { subset: true }),
      bold: await pdf.embedFont(recursos.bold, { subset: true }),
      logo: await pdf.embedPng(recursos.logo)
    };
  }

  /* regra de divisão: o travessão separa espécie e identificador, sem alterar nenhuma palavra */
  function dividirTitulo(denominacao) {
    const m = /^(.*?)\s+[—–]\s+(.+)$/.exec(String(denominacao || "").trim());
    return m ? { titulo: m[1].trim(), complemento: m[2].trim() } : { titulo: String(denominacao || "").trim(), complemento: "" };
  }

  root.CAPA_TPC = { desenhar, incorporar, dividirTitulo, PRACAS };
})(typeof window !== "undefined" ? window : globalThis);
