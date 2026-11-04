/* Estudo de caso: conversão do texto marcado em blocos, pré-visualização e .docx no padrão do modelo TPC
   (estilos Heading1, Heading2 e TPCNumerado; citação com recuo de 1418 e corpo 9; tabelas com corpo 8). */
(function (root) {
  "use strict";
  const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const X = s => String(s == null ? "" : s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c])).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "");

  /* ------------------------------------------------------------------ texto marcado -> blocos */
  /* # seção, ## subseção, > citação, | tabela |, parágrafos separados por linha em branco, **negrito** e *itálico* */
  function blocos(txt) {
    const L = String(txt || "").replace(/\r/g, "").split("\n");
    const B = []; let par = [], cit = [], tab = [];
    const fechaPar = () => { if (par.length) { const t = par.join(" ").replace(/\s+/g, " ").trim().replace(/^\d{1,3}[.)]\s+/, ""); if (t) B.push({ t: "p", x: t }); par = []; } };
    const fechaCit = () => { if (cit.length) { B.push({ t: "q", x: cit.join(" ").replace(/\s+/g, " ").trim() }); cit = []; } };
    const fechaTab = () => {
      if (tab.length) {
        const rows = tab.filter(l => !/^\|?\s*:?-{2,}/.test(l.replace(/\|/g, "|").trim()) && !/^\|[\s:|-]+\|$/.test(l.trim())).map(l => l.trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map(c => c.trim()));
        if (rows.length) B.push({ t: "tab", cab: rows[0], rows: rows.slice(1) });
        tab = [];
      }
    };
    for (const raw of L) {
      const l = raw.trim();
      if (!l) { fechaPar(); fechaCit(); fechaTab(); continue; }
      let m;
      if ((m = /^##\s+(.*)$/.exec(l))) { fechaPar(); fechaCit(); fechaTab(); B.push({ t: "h2", x: m[1].replace(/^[A-Z][.)]\s+/, "").replace(/\*\*/g, "").trim() }); continue; }
      if ((m = /^#\s+(.*)$/.exec(l))) { fechaPar(); fechaCit(); fechaTab(); B.push({ t: "h1", x: m[1].replace(/^[IVXLC]+[.)]\s+/, "").replace(/\*\*/g, "").trim() }); continue; }
      if (/^>/.test(l)) { fechaPar(); fechaTab(); cit.push(l.replace(/^>\s?/, "")); continue; }
      if (/^\|.*\|$/.test(l)) { fechaPar(); fechaCit(); tab.push(l); continue; }
      if (/^[-*•]\s+/.test(l)) { fechaPar(); fechaCit(); fechaTab(); par.push(l.replace(/^[-*•]\s+/, "")); fechaPar(); continue; }
      fechaCit(); fechaTab(); par.push(l);
    }
    fechaPar(); fechaCit(); fechaTab();
    return B;
  }
  /* trechos com **negrito** e *itálico* */
  function trechos(s) {
    const out = []; const r = /(\*\*([^*]+)\*\*|\*([^*\s][^*]*?)\*)/g; let p = 0, m;
    while ((m = r.exec(s))) { if (m.index > p) out.push({ t: s.slice(p, m.index) }); out.push(m[2] != null ? { t: m[2], b: true } : { t: m[3], i: true }); p = m.index + m[0].length; }
    if (p < s.length) out.push({ t: s.slice(p) });
    return out;
  }

  /* ------------------------------------------------------------------ pré-visualização */
  const ROM = n => { const v = [[1000, "M"], [900, "CM"], [500, "D"], [400, "CD"], [100, "C"], [90, "XC"], [50, "L"], [40, "XL"], [10, "X"], [9, "IX"], [5, "V"], [4, "IV"], [1, "I"]]; let s = ""; for (const [a, r] of v) while (n >= a) { s += r; n -= a; } return s; };
  const inl = s => trechos(s).map(x => (x.b ? "<b>" + esc(x.t) + "</b>" : x.i ? "<i>" + esc(x.t) + "</i>" : esc(x.t))).join("");
  function html(B, cab) {
    let h1 = 0, h2 = 0, np = 0;
    const out = [];
    if (cab) {
      out.push('<img class="ec-logo" src="../assets/tpc-cabecalho.png" alt="TPC Advogados">');
      out.push('<p class="ec-normal">' + esc(cab.titulo) + "</p><p class=\"ec-vazio\"></p>" + (cab.autos ? '<p class="ec-normal">Autos nº ' + esc(cab.autos) + "</p><p class=\"ec-vazio\"></p>" : ""));
      out.push('<p class="ec-normal">' + inl(cab.abertura) + "</p>");
    }
    for (const b of B) {
      if (b.t === "h1") { h1++; h2 = 0; out.push('<h3 class="ec-h1"><span>' + ROM(h1) + ".</span>" + esc(b.x) + "</h3>"); }
      else if (b.t === "h2") { out.push('<h4 class="ec-h2"><span>' + String.fromCharCode(65 + h2++) + ".</span>" + esc(b.x) + "</h4>"); }
      else if (b.t === "p") out.push('<p class="ec-p"><span class="ec-n">' + (++np) + ".</span>" + inl(b.x) + "</p>");
      else if (b.t === "q") out.push('<p class="ec-q">' + inl(b.x) + "</p>");
      else if (b.t === "tab") out.push('<table class="ec-tab"><tr>' + b.cab.map(c => "<th>" + inl(c) + "</th>").join("") + "</tr>" + b.rows.map(r => "<tr>" + b.cab.map((_, k) => "<td>" + inl(r[k] || "") + "</td>").join("") + "</tr>").join("") + "</table>");
    }
    return out.join("\n");
  }

  /* ------------------------------------------------------------------ OOXML */
  const run = (t, rpr) => "<w:r>" + (rpr ? "<w:rPr>" + rpr + "</w:rPr>" : "") + '<w:t xml:space="preserve">' + X(t) + "</w:t></w:r>";
  const runs = (s, base) => trechos(s).map(x => run(x.t, (x.b ? "<w:b/><w:bCs/>" : "") + (x.i ? "<w:i/><w:iCs/>" : "") + (base || ""))).join("");
  const VAZIO = '<w:p><w:pPr><w:spacing w:after="0"/></w:pPr></w:p>';
  const DESTAQUE = '<w:rStyle w:val="Ttulopetio"/><w:rFonts w:ascii="Segoe UI" w:hAnsi="Segoe UI" w:cs="Segoe UI"/><w:b/><w:bCs/><w:color w:val="auto"/><w:sz w:val="22"/>';
  function celula(txt, w, cab) {
    return '<w:tc><w:tcPr><w:tcW w:w="' + w + '" w:type="dxa"/>' + (cab ? '<w:shd w:val="clear" w:color="auto" w:fill="EFEFEF"/>' : "") + '<w:vAlign w:val="center"/></w:tcPr><w:p><w:pPr><w:spacing w:before="40" w:after="40" w:line="220" w:lineRule="auto"/><w:jc w:val="' + (cab ? "center" : "left") + '"/><w:rPr><w:sz w:val="16"/><w:szCs w:val="16"/></w:rPr></w:pPr>' + runs(txt, (cab ? "<w:b/><w:bCs/>" : "") + '<w:sz w:val="16"/><w:szCs w:val="16"/>') + "</w:p></w:tc>";
  }
  function tabela(b) {
    const n = b.cab.length, total = 8504;
    const pesos = b.cab.map((_, k) => Math.max(6, Math.min(40, Math.max(String(b.cab[k]).length, ...b.rows.map(r => String(r[k] || "").length)))));
    const soma = pesos.reduce((a, c) => a + c, 0);
    const ws = pesos.map(p => Math.round(total * p / soma)); ws[n - 1] += total - ws.reduce((a, c) => a + c, 0);
    let x = '<w:tbl><w:tblPr><w:tblStyle w:val="TableGrid"/><w:tblW w:w="8504" w:type="dxa"/><w:jc w:val="center"/><w:tblLayout w:type="fixed"/><w:tblLook w:val="04A0" w:firstRow="1" w:lastRow="0" w:firstColumn="1" w:lastColumn="0" w:noHBand="0" w:noVBand="1"/></w:tblPr><w:tblGrid>' + ws.map(w => '<w:gridCol w:w="' + w + '"/>').join("") + "</w:tblGrid>";
    x += '<w:tr><w:trPr><w:cantSplit/><w:tblHeader/><w:jc w:val="center"/></w:trPr>' + b.cab.map((c, k) => celula(c, ws[k], true)).join("") + "</w:tr>";
    for (const r of b.rows) x += '<w:tr><w:trPr><w:cantSplit/><w:jc w:val="center"/></w:trPr>' + b.cab.map((_, k) => celula(r[k] || "", ws[k], false)).join("") + "</w:tr>";
    return x + '</w:tbl><w:p><w:pPr><w:pStyle w:val="TPCNumerado"/><w:numPr><w:ilvl w:val="0"/><w:numId w:val="0"/></w:numPr><w:spacing w:after="0"/></w:pPr></w:p>';
  }
  function corpo(B, cab) {
    const out = [];
    if (cab) {
      out.push("<w:p>" + run(cab.titulo) + "</w:p>", VAZIO, VAZIO);
      if (cab.autos) out.push("<w:p>" + run("Autos nº " + cab.autos) + "</w:p>", VAZIO, VAZIO);
      out.push("<w:p>" + trechos(cab.abertura).map(x => run(x.t, x.b ? DESTAQUE : "")).join("") + "</w:p>");
    }
    for (const b of B) {
      if (b.t === "h1") out.push('<w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr>' + run(b.x) + "</w:p>");
      else if (b.t === "h2") out.push('<w:p><w:pPr><w:pStyle w:val="Heading2"/></w:pPr>' + run(b.x) + "</w:p>");
      else if (b.t === "p") out.push('<w:p><w:pPr><w:pStyle w:val="TPCNumerado"/></w:pPr>' + runs(b.x) + "</w:p>");
      else if (b.t === "q") out.push('<w:p><w:pPr><w:pStyle w:val="TPCNumerado"/><w:numPr><w:ilvl w:val="0"/><w:numId w:val="0"/></w:numPr><w:spacing w:line="240" w:lineRule="auto"/><w:ind w:left="1418"/><w:rPr><w:sz w:val="18"/><w:szCs w:val="18"/></w:rPr></w:pPr>' + runs(b.x, '<w:sz w:val="18"/><w:szCs w:val="18"/>') + "</w:p>");
      else if (b.t === "tab") out.push(tabela(b));
    }
    return out.join("");
  }
  async function gerar(B, cab, urlModelo) {
    if (!root.JSZip) throw new Error("A biblioteca de geração do Word não foi carregada. Verifique a conexão e recarregue a página.");
    const resp = await fetch(urlModelo); if (!resp.ok) throw new Error("Não foi possível carregar o modelo do documento.");
    const z = await root.JSZip.loadAsync(await resp.arrayBuffer());
    const doc = await z.file("word/document.xml").async("string");
    z.file("word/document.xml", doc.replace("{{CORPO}}", corpo(B, cab)));
    const agora = new Date().toISOString().replace(/\.\d+Z$/, "Z");
    const core = await z.file("docProps/core.xml").async("string");
    z.file("docProps/core.xml", core.replace("{{TITULO}}", X(cab ? cab.titulo + (cab.autos ? " · Autos nº " + cab.autos : "") : "Estudo de caso")).split("{{DATA}}").join(agora));
    return z.generateAsync({ type: "blob", mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" });
  }

  root.EC_DOCX = { blocos, trechos, html, corpo, gerar };
})(typeof window !== "undefined" ? window : globalThis);
