/* Peças no padrão institucional TPC (mesmo arquivo-base da procuração: logotipo no cabeçalho, rodapé com a faixa
   amarela, corpo em Segoe UI). Recebe uma lista de blocos e gera o .docx (o gerador só substitui o corpo) e a
   pré-visualização em HTML. Usado pelo requerimento de execução penal, pelo relatório ao cliente e pelo parecer de risco.

   Blocos: { t: "end", texto }        endereçamento (negrito, caixa alta)
           { t: "ref", texto }        referência dos autos (negrito)
           { t: "tit", texto }        título centralizado em versalete
           { t: "h", texto }          título de seção (negrito, versalete)
           { t: "sub", texto }        subtítulo (negrito)
           { t: "p", r, recuo }       parágrafo; r = texto ou [[texto, estilo]] com estilo n, b (versalete), bo, i
           { t: "cit", texto }        citação recuada
           { t: "tab", cab, linhas, larg }  tabela (larg: proporções das colunas)
           { t: "fecho", texto }      fecho centralizado ("Termos em que, pede deferimento.")
           { t: "data", texto }       local e data
           { t: "ass", nome, linhas } assinatura */
(function (root) {
  "use strict";
  const X = s => String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const FONT = '<w:rFonts w:ascii="Segoe UI" w:eastAsia="Segoe UI" w:hAnsi="Segoe UI" w:cs="Segoe UI"/>';
  const RPR = {
    n: FONT, b: FONT + "<w:b/><w:bCs/><w:smallCaps/>", bo: FONT + "<w:b/><w:bCs/>", i: FONT + "<w:i/><w:iCs/>",
    bi: FONT + "<w:b/><w:bCs/><w:i/><w:iCs/>", c: FONT + "<w:b/><w:bCs/><w:caps/>"
  };
  const run = (t, s, sz) => "<w:r><w:rPr>" + RPR[s || "n"] + (sz ? '<w:sz w:val="' + sz + '"/><w:szCs w:val="' + sz + '"/>' : "") + '</w:rPr><w:t xml:space="preserve">' + X(t) + "</w:t></w:r>";
  const runs = (r, sz) => (typeof r === "string" ? run(r, "n", sz) : (r || []).map(([t, s]) => run(t, s, sz)).join(""));
  const para = (ppr, conteudo) => "<w:p><w:pPr>" + ppr + "</w:pPr>" + (conteudo || "") + "</w:p>";
  const CORPO = '<w:spacing w:after="240" w:line="312" w:lineRule="auto"/>';

  function tabela(b) {
    const n = b.cab ? b.cab.length : (b.linhas[0] || []).length, total = 8506;
    const prop = b.larg && b.larg.length === n ? b.larg : Array(n).fill(1), soma = prop.reduce((a, x) => a + x, 0);
    const w = prop.map(p => Math.round(total * p / soma));
    const borda = '<w:top w:val="single" w:sz="4" w:color="C8C3BE"/><w:left w:val="single" w:sz="4" w:color="C8C3BE"/><w:bottom w:val="single" w:sz="4" w:color="C8C3BE"/><w:right w:val="single" w:sz="4" w:color="C8C3BE"/><w:insideH w:val="single" w:sz="4" w:color="C8C3BE"/><w:insideV w:val="single" w:sz="4" w:color="C8C3BE"/>';
    const cel = (txt, i, cab) => '<w:tc><w:tcPr><w:tcW w:w="' + w[i] + '" w:type="dxa"/>' + (cab ? '<w:shd w:val="clear" w:color="auto" w:fill="EFEFEF"/>' : "") + '</w:tcPr><w:p><w:pPr><w:spacing w:before="40" w:after="40"/></w:pPr>' + (typeof txt === "string" || typeof txt === "number" ? run(String(txt), cab ? "bo" : "n", 18) : runs(txt, 18)) + "</w:p></w:tc>";
    const linha = (l, cab) => "<w:tr>" + (cab ? "<w:trPr><w:tblHeader/></w:trPr>" : "<w:trPr><w:cantSplit/></w:trPr>") + l.map((c, i) => cel(c, i, cab)).join("") + "</w:tr>";
    return '<w:tbl><w:tblPr><w:tblW w:w="' + total + '" w:type="dxa"/><w:tblBorders>' + borda + '</w:tblBorders><w:tblLayout w:type="fixed"/><w:tblCellMar><w:left w:w="90" w:type="dxa"/><w:right w:w="90" w:type="dxa"/></w:tblCellMar></w:tblPr><w:tblGrid>' +
      w.map(x => '<w:gridCol w:w="' + x + '"/>').join("") + "</w:tblGrid>" + (b.cab ? linha(b.cab, true) : "") + b.linhas.map(l => linha(l)).join("") + "</w:tbl>" + para('<w:spacing w:after="120"/>');
  }

  function corpo(blocos) {
    const out = [];
    let assinaturas = 0;
    for (const b of blocos) {
      switch (b.t) {
        case "end": out.push(para('<w:spacing w:after="720" w:line="312" w:lineRule="auto"/><w:jc w:val="both"/>', run(b.texto, "c"))); break;
        case "ref": out.push(para('<w:spacing w:after="480"/>', runs(typeof b.texto === "string" ? [[b.texto, "bo"]] : b.texto))); break;
        case "tit": out.push(para('<w:spacing w:before="120" w:after="360"/><w:jc w:val="center"/>', '<w:r><w:rPr>' + RPR.b + '<w:sz w:val="28"/><w:szCs w:val="28"/></w:rPr><w:t xml:space="preserve">' + X(b.texto) + "</w:t></w:r>")); break;
        case "h": out.push(para('<w:keepNext/><w:spacing w:before="360" w:after="200"/><w:jc w:val="both"/>', run(b.texto, "b"))); break;
        case "sub": out.push(para('<w:keepNext/><w:spacing w:before="200" w:after="160"/><w:jc w:val="both"/>', run(b.texto, "bo"))); break;
        case "p": out.push(para(CORPO + (b.recuo === false ? "" : '<w:ind w:firstLine="1134"/>') + '<w:jc w:val="both"/>', runs(b.r))); break;
        case "cit": out.push(para('<w:spacing w:after="240" w:line="264" w:lineRule="auto"/><w:ind w:left="2268"/><w:jc w:val="both"/>', runs(typeof b.texto === "string" ? [[b.texto, "i"]] : b.texto, 20))); break;
        case "tab": out.push(tabela(b)); break;
        case "fecho": out.push(para('<w:keepNext/><w:spacing w:before="240" w:after="240"/><w:jc w:val="center"/>', runs(b.texto))); break;
        case "data": out.push(para('<w:keepNext/><w:spacing w:before="240" w:after="900"/>' + (b.centro ? '<w:jc w:val="center"/>' : ""), run(b.texto))); break;
        case "ass": {
          const l = b.linhas || [], keep = '<w:keepNext/><w:keepLines/><w:jc w:val="center"/>', last = '<w:jc w:val="center"/>';
          if (assinaturas++ > 0) out.push(para('<w:keepNext/><w:spacing w:before="0" w:after="900"/>'));
          out.push(para(keep, run("_".repeat(44))));
          out.push(para(l.length ? keep : last, run(b.nome, "b")));
          l.forEach((x, j) => out.push(para(j < l.length - 1 ? keep : last, run(x))));
          break;
        }
        default: break;
      }
    }
    return out.join("");
  }

  async function docx(blocos, urlModelo) {
    if (!root.JSZip) throw new Error("A biblioteca de geração do Word não foi carregada. Verifique a conexão e recarregue a página.");
    const r = await fetch(urlModelo || "../assets/modelo-tpc.docx"); if (!r.ok) throw new Error("Não foi possível carregar o modelo institucional.");
    const z = await root.JSZip.loadAsync(await r.arrayBuffer());
    const doc = await z.file("word/document.xml").async("string");
    if (!doc.includes("{{BODY}}")) throw new Error("Modelo institucional inválido.");
    z.file("word/document.xml", doc.replace("{{BODY}}", corpo(blocos)));
    const agora = new Date().toISOString().replace(/\.\d+Z$/, "Z");
    z.file("docProps/core.xml", (await z.file("docProps/core.xml").async("string")).split("{{DATA}}").join(agora));
    return z.generateAsync({ type: "blob", mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" });
  }
  function baixar(blob, nome) {
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = String(nome).replace(/[\\/:*?"<>|]+/g, "_") + ".docx";
    document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1500);
  }

  /* ------------------------------------------------------------------ pré-visualização */
  const esc = s => String(s == null ? "" : s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const hr = r => (typeof r === "string" ? esc(r) : (r || []).map(([t, s]) => (s === "b" ? '<b class="vs">' + esc(t) + "</b>" : s === "i" ? "<i>" + esc(t) + "</i>" : s === "bi" ? "<b><i>" + esc(t) + "</i></b>" : s === "bo" || s === "c" ? "<b>" + esc(t) + "</b>" : esc(t))).join(""));
  function html(blocos, opc) {
    const ed = !!(opc && opc.editavel), at = (i, extra) => (ed ? ' data-b="' + i + '"' + (extra || "") : "");
    const o = ['<img class="pv-logo" src="../assets/tpc-cabecalho.png" alt="TPC Advogados">'];
    blocos.forEach((b, i) => {
      if (b.t === "end") o.push('<p class="pv-end"' + at(i) + ">" + esc(b.texto) + "</p>");
      else if (b.t === "ref") o.push('<p class="pv-ref"' + at(i) + ">" + (typeof b.texto === "string" ? "<b>" + esc(b.texto) + "</b>" : hr(b.texto)) + "</p>");
      else if (b.t === "tit") o.push('<h2 class="pv-tit"' + at(i) + ">" + esc(b.texto) + "</h2>");
      else if (b.t === "h") o.push('<h3 class="pv-h vs"' + at(i) + ">" + esc(b.texto) + "</h3>");
      else if (b.t === "sub") o.push('<h4 class="pv-sub"' + at(i) + ">" + esc(b.texto) + "</h4>");
      else if (b.t === "p") o.push("<p" + (b.recuo === false ? "" : ' class="pv-rec"') + at(i) + ">" + hr(b.r) + "</p>");
      else if (b.t === "cit") o.push('<blockquote class="pv-cit"' + at(i) + ">" + (typeof b.texto === "string" ? "<i>" + esc(b.texto) + "</i>" : hr(b.texto)) + "</blockquote>");
      else if (b.t === "tab") o.push('<div class="pv-tw"><table class="pv-tab">' + (b.cab ? "<thead><tr>" + b.cab.map((c, k) => "<th" + at(i, ' data-r="-1" data-c="' + k + '"') + ">" + esc(c) + "</th>").join("") + "</tr></thead>" : "") + "<tbody>" + b.linhas.map((l, r) => "<tr>" + l.map((c, k) => "<td" + at(i, ' data-r="' + r + '" data-c="' + k + '"') + ">" + (typeof c === "string" || typeof c === "number" ? esc(c) : hr(c)) + "</td>").join("") + "</tr>").join("") + "</tbody></table></div>");
      else if (b.t === "fecho") o.push('<p class="pv-fecho"' + at(i) + ">" + hr(b.texto) + "</p>");
      else if (b.t === "data") o.push('<p class="pv-data"' + (b.centro ? ' style="text-align:center"' : "") + at(i) + ">" + esc(b.texto) + "</p>");
      else if (b.t === "ass") o.push('<div class="pv-ass"><div>' + "_".repeat(44) + '</div><b class="vs"' + at(i, ' data-c="nome"') + ">" + esc(b.nome) + "</b>" + (b.linhas || []).map((l, k) => "<div" + at(i, ' data-c="' + k + '"') + ">" + esc(l) + "</div>").join("") + "</div>");
    });
    o.push('<div class="pv-rod"><span>Belo Horizonte | São Paulo | Brasília | Cuiabá | João Monlevade</span><span><b>TPCADVOGADOS</b>.COM.BR</span></div>');
    return o.join("");
  }

  /* Edição do texto na própria pré-visualização. O editor guarda os blocos exibidos e, ao ler o que foi digitado,
     substitui o texto de cada bloco; parágrafo apagado sai do documento e quebra de linha cria novo parágrafo. */
  function editor(folha, opc) {
    opc = opc || {};
    let gerados = [], base = null, editados = null, editando = false;
    const clone = x => JSON.parse(JSON.stringify(x));
    const limpa = el => String(el.innerText || "").replace(/\u00a0/g, " ");
    function render(bl) {
      base = clone(bl);
      folha.innerHTML = html(base, { editavel: true });
      folha.classList.toggle("editando", editando);
      folha.querySelectorAll("[data-b]").forEach(el => { el.contentEditable = editando ? "true" : "false"; el.spellcheck = true; });
    }
    function capturar() {
      if (!editando || !base) return;
      const out = [];
      base.forEach((b, i) => {
        const els = [...folha.querySelectorAll('[data-b="' + i + '"]')];
        if (!els.length) { out.push(b); return; }
        const n = clone(b);
        if (b.t === "p") {
          const original = typeof b.r === "string" ? b.r : (b.r || []).map(x => x[0]).join("");
          const novo = limpa(els[0]).trim();
          if (novo === original.trim()) { out.push(n); return; }
          novo.split(/\n+/).map(x => x.trim()).filter(Boolean).forEach(x => out.push(Object.assign({}, n, { r: x })));
          return;
        }
        if (b.t === "tab") { els.forEach(el => { const r = +el.dataset.r, c = +el.dataset.c, v = limpa(el).trim(); if (r < 0) n.cab[c] = v; else { const at = n.linhas[r][c], txt = typeof at === "string" || typeof at === "number" ? String(at) : at.map(x => x[0]).join(""); if (v !== txt) n.linhas[r][c] = v; } }); out.push(n); return; }
        if (b.t === "ass") { els.forEach(el => { const v = limpa(el).trim(); if (el.dataset.c === "nome") n.nome = v; else n.linhas[+el.dataset.c] = v; }); n.linhas = (n.linhas || []).filter(Boolean); if (n.nome) out.push(n); return; }
        const original = typeof b.texto === "string" ? b.texto : (b.texto || []).map(x => x[0]).join("");
        const novo = limpa(els[0]).replace(/\s*\n\s*/g, " ").trim();
        if (!novo) return;
        if (novo !== original.trim()) n.texto = novo;
        out.push(n);
      });
      editados = out;
    }
    folha.addEventListener("input", () => { capturar(); if (opc.aoEditar) opc.aoEditar(); });
    return {
      mostrar(bl) { gerados = bl || []; if (!editados) render(gerados); else if (opc.aviso) opc.aviso(); },
      blocos() { capturar(); return editados || gerados; },
      editar(ligar) {
        if (ligar) { editando = true; if (!editados) editados = clone(gerados); render(editados); const el = folha.querySelector("[data-b]"); if (el) el.focus(); }
        else { capturar(); editando = false; render(editados || gerados); }
      },
      descartar() { editados = null; editando = false; render(gerados); },
      carregar(bl) { editados = clone(bl || []); render(editados); },
      editado: () => !!editados,
      editando: () => editando
    };
  }
  /* texto simples (para copiar em e-mail) */
  const tx = r => (typeof r === "string" ? r : (r || []).map(x => x[0]).join(""));
  function texto(blocos) {
    return blocos.map(b => {
      if (b.t === "tab") return [(b.cab || []).join(" | "), ...b.linhas.map(l => l.map(c => (typeof c === "string" || typeof c === "number" ? c : tx(c))).join(" | "))].filter(Boolean).join("\n");
      if (b.t === "ass") return ["_".repeat(30), b.nome, ...(b.linhas || [])].join("\n");
      if (b.t === "h" || b.t === "tit" || b.t === "end") return String(b.texto).toUpperCase();
      return tx(b.r != null ? b.r : b.texto);
    }).join("\n\n");
  }
  /* CSS da folha de pré-visualização (injetado uma vez) */
  const CSS = ".folha{background:var(--doc-paper);color:var(--doc-ink);border:0;box-shadow:0 0 0 1px var(--line),var(--shadow);border-radius:3px;padding:clamp(18px,6vw,60px) clamp(16px,7vw,66px) 24px;font-family:'Segoe UI','Open Sans',Arial,sans-serif;font-size:14px;line-height:1.6;overflow-wrap:anywhere}" +
    ".folha p{text-align:justify;margin:0 0 12px}.folha .pv-rec{text-indent:2em}.folha .vs{font-variant:small-caps;font-weight:700}.folha .pv-logo{width:min(300px,75%);display:block;margin-bottom:26px}" +
    ".folha .pv-end{font-weight:700;text-transform:uppercase;margin-bottom:34px}.folha .pv-ref{margin-bottom:24px}.folha .pv-tit{font-family:'Segoe UI','Open Sans',Arial,sans-serif;font-variant:small-caps;text-align:center;font-size:21px;font-weight:700;margin:6px 0 20px}" +
    ".folha .pv-h{font-family:'Segoe UI','Open Sans',Arial,sans-serif;font-size:15px;margin:22px 0 10px;font-weight:700}.folha .pv-sub{font-size:14px;margin:14px 0 8px;font-weight:700}" +
    ".folha .pv-cit{margin:0 0 12px 22%;font-size:13px;text-align:justify}.folha .pv-tw{overflow-x:auto;margin:0 0 14px}.folha .pv-tab{width:100%;border-collapse:collapse;font-size:12px}.folha .pv-tab th,.folha .pv-tab td{border:1px solid var(--doc-rule);padding:4px 6px;text-align:left;vertical-align:top}.folha .pv-tab th{background:var(--doc-head)}" +
    ".folha.editando [data-b]{outline:1px dashed var(--doc-edit);outline-offset:2px;border-radius:2px;cursor:text}.folha.editando [data-b]:focus{outline:2px solid var(--doc-edit);background:var(--doc-edit-bg)}" +
    ".folha .pv-fecho{text-align:center;margin:18px 0}.folha .pv-data{margin:18px 0 46px}.folha .pv-ass{text-align:center;margin-bottom:40px}.folha .pv-rod{border-top:6px solid var(--doc-mark);padding-top:10px;margin-top:26px;text-align:center;font-size:11px;color:var(--doc-muted);display:grid;gap:4px}";
  if (typeof document !== "undefined" && !document.getElementById("peca-css")) { const s = document.createElement("style"); s.id = "peca-css"; s.textContent = CSS; document.head.appendChild(s); }

  const MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
  function dataExtenso(d) { d = d || new Date(); const u = d instanceof Date ? d : new Date(d + "T00:00:00Z"); return (u.getUTCDate() === 1 ? "1º" : String(u.getUTCDate())) + " de " + MESES[u.getUTCMonth()] + " de " + u.getUTCFullYear(); }
  const ADVOGADOS = [
    { id: "renato", nome: "Renato Dilly Campos", uf: "MG", oab: "166.263", g: "m" },
    { id: "vinicius", nome: "Vinícius Papa Soares", uf: "MG", oab: "183.978", g: "m" },
    { id: "rodrigo", nome: "Rodrigo Peixoto da Silva", uf: "MG", oab: "200.789", g: "m" },
    { id: "lais", nome: "Lais Azevedo de Oliveira", uf: "MG", oab: "213.492", g: "f" },
    { id: "eduardo", nome: "Eduardo Paoliello Nicolau", uf: "MG", oab: "80.702", g: "m" }
  ];
  const lista = a => (a.length <= 1 ? a.join("") : a.slice(0, -1).join(", ") + " e " + a[a.length - 1]);

  root.TPC_PECA = { corpo, docx, baixar, html, editor, texto, dataExtenso, ADVOGADOS, lista };
})(typeof window !== "undefined" ? window : globalThis);
