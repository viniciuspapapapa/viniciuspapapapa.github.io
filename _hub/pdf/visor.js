/* Componentes de tela das ferramentas de PDF: a grade de miniaturas (selecionar, girar, excluir, reordenar, inserir
   página em branco e acrescentar arquivos) e o visor de página com camada de objetos (texto, imagem, formas, desenho,
   assinatura, ocultação, recorte e campos de formulário), com conversão exata para as coordenadas do PDF. */
(function (root) {
  "use strict";
  const X = root.PDFX, esc = s => root.HUB.esc(s);

  /* ================================================================== grade de miniaturas */
  function Grade(el, opc) {
    opc = opc || {};
    const fontes = [], pags = [];
    let arrastado = null;
    el.innerHTML = '<div class="g-barra"></div><div class="g-lista" role="list"></div>';
    const barra = el.querySelector(".g-barra"), lista = el.querySelector(".g-lista");
    if (opc.modo === "selecionar") barra.innerHTML = '<button type="button" class="btn sec peq" data-a="todas">Selecionar todas</button><button type="button" class="btn sec peq" data-a="nenhuma">Limpar seleção</button><span class="pequeno mudo" data-cont></span>';
    else if (opc.modo === "girar") barra.innerHTML = '<button type="button" class="btn sec peq" data-a="esq">Girar todas à esquerda</button><button type="button" class="btn sec peq" data-a="dir">Girar todas à direita</button><span class="pequeno mudo">Ou clique no botão de cada página.</span>';
    else barra.innerHTML = '<span class="pequeno mudo">Arraste as páginas para reordenar. Use os botões de cada página para girar, excluir ou inserir uma página em branco depois dela.</span>';
    barra.addEventListener("click", e => {
      const a = e.target.closest("[data-a]"); if (!a) return;
      if (a.dataset.a === "todas") pags.forEach(p => p.sel = true);
      if (a.dataset.a === "nenhuma") pags.forEach(p => p.sel = false);
      if (a.dataset.a === "esq") pags.forEach(p => p.rot = (p.rot + 270) % 360);
      if (a.dataset.a === "dir") pags.forEach(p => p.rot = (p.rot + 90) % 360);
      desenhar();
    });

    async function adicionar(bytes, nome) {
      const k = fontes.length; fontes.push({ bytes, nome });
      const ini = pags.length;
      await X.miniaturas(bytes, 150, (cv, i, n) => {
        pags.push({ fonte: k, idx: i - 1, rot: 0, sel: false, cv, nome, n });
        if (i === 1 || i % 6 === 0 || i === n) desenhar();
      });
      return pags.length - ini;
    }
    function cartao(p, i) {
      const d = document.createElement("div");
      d.className = "g-pg" + (p.sel ? " sel" : "") + (p.marcada ? " fora" : ""); d.setAttribute("role", "listitem"); d.draggable = opc.modo === "organizar"; d.dataset.i = i;
      const quadro = document.createElement("div"); quadro.className = "g-quadro";
      if (p.branca) { const b = document.createElement("div"); b.className = "g-branca"; b.textContent = "Página em branco"; quadro.appendChild(b); }
      else { const c = document.createElement("canvas"); c.width = p.cv.width; c.height = p.cv.height; c.getContext("2d").drawImage(p.cv, 0, 0); c.style.transform = "rotate(" + p.rot + "deg)" + (p.rot % 180 ? " scale(" + Math.min(1, p.cv.width / p.cv.height, p.cv.height / p.cv.width).toFixed(3) + ")" : ""); quadro.appendChild(c); }
      d.appendChild(quadro);
      const rot = '<span class="g-num">' + (i + 1) + (fontes.length > 1 && !p.branca ? '<small> · ' + esc(X.base(p.nome)).slice(0, 18) + '</small>' : "") + "</span>";
      let bts = "";
      if (opc.modo === "selecionar") bts = '<label class="g-ck"><input type="checkbox" ' + (p.sel ? "checked" : "") + ' aria-label="Selecionar a página ' + (i + 1) + '"></label>';
      if (opc.modo === "girar") bts = '<button type="button" class="g-b" data-b="esq" aria-label="Girar à esquerda">↺</button><button type="button" class="g-b" data-b="dir" aria-label="Girar à direita">↻</button>';
      if (opc.modo === "organizar") bts = '<button type="button" class="g-b" data-b="antes" aria-label="Mover para antes">‹</button><button type="button" class="g-b" data-b="dir" aria-label="Girar">↻</button><button type="button" class="g-b" data-b="branca" aria-label="Inserir página em branco depois">＋</button><button type="button" class="g-b" data-b="del" aria-label="Excluir página">×</button><button type="button" class="g-b" data-b="depois" aria-label="Mover para depois">›</button>';
      const pe = document.createElement("div"); pe.className = "g-pe"; pe.innerHTML = rot + '<span class="g-bts">' + bts + "</span>"; d.appendChild(pe);
      return d;
    }
    function desenhar() {
      lista.innerHTML = ""; pags.forEach((p, i) => lista.appendChild(cartao(p, i)));
      const c = barra.querySelector("[data-cont]"); if (c) c.textContent = pags.filter(p => p.sel).length + " de " + pags.length + " selecionadas";
      if (opc.aoMudar) opc.aoMudar();
    }
    lista.addEventListener("click", e => {
      const card = e.target.closest(".g-pg"); if (!card) return; const i = +card.dataset.i, p = pags[i];
      const b = e.target.closest("[data-b]");
      if (b) {
        if (b.dataset.b === "esq") p.rot = (p.rot + 270) % 360;
        if (b.dataset.b === "dir") p.rot = (p.rot + 90) % 360;
        if (b.dataset.b === "del") pags.splice(i, 1);
        if (b.dataset.b === "branca") pags.splice(i + 1, 0, { branca: true, rot: 0, ref: p });
        if (b.dataset.b === "antes" && i > 0) pags.splice(i - 1, 0, pags.splice(i, 1)[0]);
        if (b.dataset.b === "depois" && i < pags.length - 1) pags.splice(i + 1, 0, pags.splice(i, 1)[0]);
        desenhar(); return;
      }
      if (opc.modo === "selecionar") { p.sel = !p.sel; desenhar(); }
    });
    lista.addEventListener("dragstart", e => { const c = e.target.closest(".g-pg"); if (c) { arrastado = +c.dataset.i; e.dataTransfer.effectAllowed = "move"; c.classList.add("arr"); } });
    lista.addEventListener("dragover", e => { if (arrastado != null) e.preventDefault(); });
    lista.addEventListener("drop", e => {
      e.preventDefault(); const c = e.target.closest(".g-pg"); if (arrastado == null || !c) return;
      const para = +c.dataset.i; const [m] = pags.splice(arrastado, 1); pags.splice(para, 0, m); arrastado = null; desenhar();
    });
    lista.addEventListener("dragend", () => { arrastado = null; lista.querySelectorAll(".arr").forEach(x => x.classList.remove("arr")); });

    /* monta o PDF final com a ordem, a rotação e as páginas em branco */
    async function montar(filtro) {
      await X.carregar("pdflib");
      const { PDFDocument, degrees } = root.PDFLib, out = await PDFDocument.create(), docs = [];
      for (const f of fontes) docs.push(await X.abrirLib(f.bytes));
      const usar = pags.filter(filtro || (() => true));
      for (const p of usar) {
        if (p.branca) { const ref = p.ref && !p.ref.branca ? docs[p.ref.fonte].getPage(p.ref.idx).getSize() : { width: 595.28, height: 841.89 }; out.addPage([ref.width, ref.height]); continue; }
        const [cp] = await out.copyPages(docs[p.fonte], [p.idx]);
        cp.setRotation(degrees((cp.getRotation().angle + p.rot) % 360)); out.addPage(cp);
      }
      return out;
    }
    return { adicionar, montar, paginas: () => pags, fontes: () => fontes, desenhar };
  }

  /* ================================================================== visor de página com objetos */
  function Visor(el, bytes, opc) {
    opc = opc || {};
    const estado = { pdf: null, pg: 1, n: 1, escala: 1, vp1: {}, objs: [], sel: null, ferr: opc.ferramentas ? opc.ferramentas[0][0] : null, prop: Object.assign({ cor: "#111111", tam: 14, fonte: "Helvetica", negrito: false, fundo: "#ffffff", opac: 1, espessura: 2 }, opc.prop || {}) };
    let seq = 0;
    el.innerHTML = '<div class="v-barra">' + (opc.ferramentas || []).map(([id, r]) => '<button type="button" class="btn sec peq" data-f="' + id + '" aria-pressed="false">' + esc(r) + "</button>").join("") +
      '<span class="v-props"></span><span class="espaco"></span><button type="button" class="btn sec peq" data-n="-1" aria-label="Página anterior">‹</button><span class="v-pgn pequeno"></span><button type="button" class="btn sec peq" data-n="1" aria-label="Próxima página">›</button></div>' +
      '<div class="v-palco"><div class="v-folha"><canvas></canvas><div class="v-camada" tabindex="0" aria-label="Página do PDF; clique ou arraste para inserir"></div></div></div><p class="pequeno mudo v-dica"></p>';
    const palco = el.querySelector(".v-palco"), folha = el.querySelector(".v-folha"), cv = folha.querySelector("canvas"), camada = el.querySelector(".v-camada"), props = el.querySelector(".v-props");
    el.querySelector(".v-dica").textContent = opc.dica || "";

    function ferramenta(id) {
      estado.ferr = id;
      el.querySelectorAll("[data-f]").forEach(b => b.setAttribute("aria-pressed", String(b.dataset.f === id)));
      desenharProps();
    }
    function desenharProps() {
      const f = estado.ferr, p = estado.prop, o = estado.sel ? estado.objs.find(x => x.id === estado.sel) : null, alvo = o ? o.p : p;
      const temTexto = ["texto", "data", "campo"].includes(o ? o.tipo : f), temCor = ["texto", "data", "forma", "desenho", "destaque", "linha"].includes(o ? o.tipo : f);
      let h = "";
      if (temCor) h += '<label class="v-p">Cor <input type="color" data-p="cor" value="' + alvo.cor + '"></label>';
      if (temTexto) h += '<label class="v-p">Tamanho <input type="number" min="6" max="96" data-p="tam" value="' + alvo.tam + '" style="width:64px"></label><label class="v-p">Fonte <select data-p="fonte">' + [["Helvetica", "Sem serifa"], ["TimesRoman", "Com serifa"], ["Courier", "Monoespaçada"]].map(([v, r]) => '<option value="' + v + '"' + (alvo.fonte === v ? " selected" : "") + ">" + r + "</option>").join("") + '</select></label><label class="v-p"><input type="checkbox" data-p="negrito"' + (alvo.negrito ? " checked" : "") + "> Negrito</label>";
      if ((o ? o.tipo : f) === "forma") h += '<label class="v-p">Preenchimento <input type="color" data-p="fundo" value="' + alvo.fundo + '"></label><label class="v-p"><input type="checkbox" data-p="semFundo"' + (alvo.semFundo ? " checked" : "") + "> Sem preenchimento</label>";
      if (["desenho", "forma", "linha"].includes(o ? o.tipo : f)) h += '<label class="v-p">Espessura <input type="number" min="1" max="20" data-p="espessura" value="' + alvo.espessura + '" style="width:56px"></label>';
      if (o) h += (opc.todasPaginas ? '<label class="v-p"><input type="checkbox" data-p="todas"' + (o.p.todas ? " checked" : "") + "> Em todas as páginas</label>" : "") + '<button type="button" class="btn sec peq" data-del>Excluir</button>';
      props.innerHTML = h;
    }
    props.addEventListener("input", e => {
      const k = e.target.dataset.p; if (!k) return;
      const v = e.target.type === "checkbox" ? e.target.checked : e.target.type === "number" ? +e.target.value : e.target.value;
      const o = estado.sel ? estado.objs.find(x => x.id === estado.sel) : null;
      if (o) { o.p[k] = v; desenharObjs(); } else estado.prop[k] = v;
    });
    props.addEventListener("click", e => { if (e.target.closest("[data-del]")) { estado.objs = estado.objs.filter(x => x.id !== estado.sel); estado.sel = null; desenharObjs(); desenharProps(); mudou(); } });
    el.querySelector(".v-barra").addEventListener("click", e => {
      const b = e.target.closest("[data-f]"); if (b) { ferramenta(b.dataset.f); if (opc.aoFerramenta) opc.aoFerramenta(b.dataset.f); return; }
      const n = e.target.closest("[data-n]"); if (n) irPara(estado.pg + +n.dataset.n);
    });

    async function irPara(n) {
      if (!estado.pdf || n < 1 || n > estado.n) return; estado.pg = n; estado.sel = null;
      const pg = await estado.pdf.getPage(n), vp1 = pg.getViewport({ scale: 1 });
      estado.vp1[n] = vp1;
      const larg = Math.min((palco.clientWidth || 800) - 30, 980); estado.escala = larg / vp1.width;
      const vp = pg.getViewport({ scale: estado.escala * (window.devicePixelRatio || 1) });
      cv.width = vp.width; cv.height = vp.height; cv.style.width = (vp1.width * estado.escala) + "px"; cv.style.height = (vp1.height * estado.escala) + "px";
      folha.style.width = cv.style.width; folha.style.height = cv.style.height;
      await pg.render({ canvasContext: cv.getContext("2d"), viewport: vp }).promise;
      el.querySelector(".v-pgn").textContent = "Página " + n + " de " + estado.n;
      desenharObjs(); desenharProps(); if (opc.aoPagina) opc.aoPagina(n);
    }

    /* objetos em unidades da página (pontos, origem no canto superior esquerdo da visualização) */
    function novo(tipo, x, y, w, h, extra) {
      const o = Object.assign({ id: ++seq, tipo, pg: estado.pg, x, y, w, h, p: Object.assign({}, estado.prop) }, extra || {});
      estado.objs.push(o); estado.sel = o.id; desenharObjs(); desenharProps(); mudou(); return o;
    }
    function mudou() { if (opc.aoMudar) opc.aoMudar(); }
    function desenharObjs() {
      const s = estado.escala; camada.innerHTML = "";
      estado.objs.filter(o => o.pg === estado.pg || o.p.todas).forEach(o => {
        const d = document.createElement("div"); d.className = "v-obj v-" + o.tipo + (o.id === estado.sel ? " sel" : ""); d.dataset.id = o.id;
        Object.assign(d.style, { left: o.x * s + "px", top: o.y * s + "px", width: o.w * s + "px", height: o.h * s + "px" });
        if (o.tipo === "texto" || o.tipo === "data" || o.tipo === "campo") {
          const t = document.createElement("div"); t.className = "v-txt"; t.contentEditable = o.tipo !== "campo" ? "true" : "false"; t.spellcheck = true;
          t.textContent = o.tipo === "campo" ? (o.p.nome || "campo") + (o.p.tipoCampo === "check" ? " ☐" : "") : o.texto || "";
          Object.assign(t.style, { color: o.p.cor, fontSize: (o.tipo === "campo" ? 11 : o.p.tam) * s + "px", fontWeight: o.p.negrito ? "700" : "400", fontFamily: o.p.fonte === "TimesRoman" ? "Times New Roman, serif" : o.p.fonte === "Courier" ? "Courier New, monospace" : "Helvetica, Arial, sans-serif", lineHeight: "1.2" });
          t.addEventListener("input", () => { o.texto = t.innerText.replace(/\n$/, ""); const r = t.getBoundingClientRect(); o.w = Math.max(o.w, r.width / s); o.h = Math.max(o.p.tam * 1.25, r.height / s); mudou(); });
          d.appendChild(t);
        } else if (o.tipo === "imagem" || o.tipo === "assinatura") { const im = document.createElement("img"); im.src = o.url; im.alt = ""; d.appendChild(im); }
        else if (o.tipo === "forma") { d.style.border = Math.max(1, o.p.espessura * s) + "px solid " + o.p.cor; d.style.background = o.p.semFundo ? "transparent" : o.p.fundo; }
        else if (o.tipo === "destaque") { d.style.background = o.p.cor; d.style.opacity = ".35"; }
        else if (o.tipo === "desenho" || o.tipo === "linha") {
          const ns = "http://www.w3.org/2000/svg", sv = document.createElementNS(ns, "svg"); sv.setAttribute("width", o.w * s); sv.setAttribute("height", o.h * s); sv.style.overflow = "visible";
          const pth = document.createElementNS(ns, "path"); pth.setAttribute("d", o.pontos.map((q, i) => (i ? "L" : "M") + ((q[0] - o.x) * s).toFixed(1) + " " + ((q[1] - o.y) * s).toFixed(1)).join(" "));
          pth.setAttribute("fill", "none"); pth.setAttribute("stroke", o.p.cor); pth.setAttribute("stroke-width", o.p.espessura * s); pth.setAttribute("stroke-linecap", "round"); pth.setAttribute("stroke-linejoin", "round");
          sv.appendChild(pth); d.appendChild(sv);
        }
        if (!["desenho", "linha"].includes(o.tipo)) { const al = document.createElement("span"); al.className = "v-al"; al.setAttribute("aria-hidden", "true"); d.appendChild(al); }
        camada.appendChild(d);
      });
    }
    const pos = e => { const r = camada.getBoundingClientRect(); return [(e.clientX - r.left) / estado.escala, (e.clientY - r.top) / estado.escala]; };
    let gesto = null;
    camada.addEventListener("pointerdown", e => {
      const objEl = e.target.closest(".v-obj");
      if (objEl) {
        const o = estado.objs.find(x => x.id === +objEl.dataset.id); estado.sel = o.id;
        if (e.target.closest(".v-txt") && e.target.isContentEditable) { camada.querySelectorAll(".v-obj").forEach(x => x.classList.toggle("sel", x === objEl)); desenharProps(); return; }
        const [x, y] = pos(e); gesto = { o, modo: e.target.classList.contains("v-al") ? "redim" : "mover", x, y, ox: o.x, oy: o.y, ow: o.w, oh: o.h, pts: o.pontos && o.pontos.map(q => q.slice()) };
        camada.setPointerCapture(e.pointerId); camada.querySelectorAll(".v-obj").forEach(x => x.classList.toggle("sel", x === objEl)); desenharProps(); e.preventDefault(); return;
      }
      estado.sel = null; const [x, y] = pos(e), f = estado.ferr;
      if (!f) { desenharObjs(); desenharProps(); return; }
      if (opc.aoClicar && opc.aoClicar(f, x, y)) return;
      if (f === "texto" || f === "data") { const o = novo(f, x, y, 160, estado.prop.tam * 1.3, { texto: f === "data" ? new Date().toLocaleDateString("pt-BR") : "" }); setTimeout(() => { const t = camada.querySelector('[data-id="' + o.id + '"] .v-txt'); if (t) t.focus(); }, 30); return; }
      if (f === "desenho" || f === "linha") { gesto = { criar: novo(f, x, y, 1, 1, { pontos: [[x, y]] }), x, y, linha: f === "linha" }; camada.setPointerCapture(e.pointerId); return; }
      gesto = { criar: novo(f, x, y, 1, 1, opc.extra ? opc.extra(f) : {}), x, y }; camada.setPointerCapture(e.pointerId); e.preventDefault();
    });
    camada.addEventListener("pointermove", e => {
      if (!gesto) return; const [x, y] = pos(e);
      if (gesto.criar) {
        const o = gesto.criar;
        if (o.pontos) { if (gesto.linha) o.pontos = [o.pontos[0], [x, y]]; else o.pontos.push([x, y]); const xs = o.pontos.map(q => q[0]), ys = o.pontos.map(q => q[1]); o.x = Math.min(...xs); o.y = Math.min(...ys); o.w = Math.max(1, Math.max(...xs) - o.x); o.h = Math.max(1, Math.max(...ys) - o.y); }
        else { o.x = Math.min(x, gesto.x); o.y = Math.min(y, gesto.y); o.w = Math.abs(x - gesto.x); o.h = Math.abs(y - gesto.y); if (o.razao) o.h = o.w / o.razao; }
      } else if (gesto.modo === "mover") {
        const dx = x - gesto.x, dy = y - gesto.y; gesto.o.x = gesto.ox + dx; gesto.o.y = gesto.oy + dy;
        if (gesto.pts) gesto.o.pontos = gesto.pts.map(q => [q[0] + dx, q[1] + dy]);
      } else { gesto.o.w = Math.max(8, gesto.ow + x - gesto.x); gesto.o.h = gesto.o.razao ? gesto.o.w / gesto.o.razao : Math.max(6, gesto.oh + y - gesto.y); }
      desenharObjs();
    });
    const soltar = () => {
      if (!gesto) return;
      if (gesto.criar) { const o = gesto.criar; if (!o.pontos && o.w < 4 && o.h < 4) { const pad = opc.padrao && opc.padrao(o.tipo); if (pad) { o.w = pad[0]; o.h = pad[1]; o.x -= pad[0] / 2; o.y -= pad[1] / 2; } else estado.objs = estado.objs.filter(q => q !== o); } if (opc.aoCriar) opc.aoCriar(o); }
      gesto = null; desenharObjs(); desenharProps(); mudou();
    };
    camada.addEventListener("pointerup", soltar); camada.addEventListener("pointercancel", soltar);
    camada.addEventListener("keydown", e => { if ((e.key === "Delete" || e.key === "Backspace") && estado.sel && !(document.activeElement && document.activeElement.isContentEditable)) { estado.objs = estado.objs.filter(x => x.id !== estado.sel); estado.sel = null; desenharObjs(); desenharProps(); mudou(); } });
    let tmr = null; window.addEventListener("resize", () => { clearTimeout(tmr); tmr = setTimeout(() => irPara(estado.pg), 200); });

    /* conversão: retângulo da visualização (escala 1) -> retângulo no espaço do PDF */
    async function vp1(n) { if (!estado.vp1[n]) estado.vp1[n] = (await estado.pdf.getPage(n)).getViewport({ scale: 1 }); return estado.vp1[n]; }
    async function rectPdf(n, x, y, w, h) {
      const v = await vp1(n), a = v.convertToPdfPoint(x, y), b = v.convertToPdfPoint(x + w, y + h);
      return { x: Math.min(a[0], b[0]), y: Math.min(a[1], b[1]), w: Math.abs(b[0] - a[0]), h: Math.abs(b[1] - a[1]) };
    }
    async function pontoPdf(n, x, y) { const v = await vp1(n); return v.convertToPdfPoint(x, y); }

    const pronto = (async () => {
      estado.pdf = await X.abrirJs(bytes); estado.n = estado.pdf.numPages;
      if (estado.ferr) ferramenta(estado.ferr);
      await irPara(1);
    })();
    return {
      pronto, irPara, ferramenta, novo, desenhar: () => { desenharObjs(); desenharProps(); }, rectPdf, pontoPdf, vp1,
      objetos: () => estado.objs, limpar: f => { estado.objs = estado.objs.filter(o => !f(o)); desenharObjs(); mudou(); },
      pagina: () => estado.pg, total: () => estado.n, pdf: () => estado.pdf, prop: estado.prop
    };
  }

  /* ================================================================== aplica os objetos do visor a um PDF (pdf-lib) */
  const WIN = "€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ";
  const limpaTxt = s => [...String(s || "")].map(c => c.charCodeAt(0) <= 255 || WIN.includes(c) ? c : "?").join("").replace(/\t/g, "    ");
  async function aplicarObjetos(doc, visor, objs) {
    const { StandardFonts, rgb, BlendMode, LineCapStyle } = root.PDFLib, fontes = {};
    const fonte = async (nome, neg) => { const k = nome + (neg ? "B" : ""); if (!fontes[k]) fontes[k] = await doc.embedFont(StandardFonts[{ Helvetica: neg ? "HelveticaBold" : "Helvetica", TimesRoman: neg ? "TimesRomanBold" : "TimesRoman", Courier: neg ? "CourierBold" : "Courier" }[nome] || "Helvetica"]); return fontes[k]; };
    const imgs = {};
    for (const o of objs) {
      const alvo = o.p.todas ? doc.getPages().map((_, i) => i + 1) : [o.pg];
      for (const n of alvo) {
        const page = doc.getPage(n - 1), r = await visor.rectPdf(n, o.x, o.y, o.w, o.h), cor = X.corRgb(o.p.cor);
        if (o.tipo === "texto" || o.tipo === "data") {
          const f = await fonte(o.p.fonte, o.p.negrito), lin = limpaTxt(o.texto).split("\n"), tamanho = o.p.tam;
          for (let i = 0; i < lin.length; i++) { const [px, py] = await visor.pontoPdf(n, o.x + 1, o.y + tamanho * 0.95 + i * tamanho * 1.2); page.drawText(lin[i], { x: px, y: py, size: tamanho, font: f, color: cor }); }
        } else if (o.tipo === "imagem" || o.tipo === "assinatura") {
          if (!imgs[o.url]) imgs[o.url] = o.png ? await doc.embedPng(o.bytes) : await doc.embedJpg(o.bytes);
          page.drawImage(imgs[o.url], { x: r.x, y: r.y, width: r.w, height: r.h });
        } else if (o.tipo === "forma") page.drawRectangle({ x: r.x, y: r.y, width: r.w, height: r.h, borderColor: cor, borderWidth: o.p.espessura, color: o.p.semFundo ? undefined : X.corRgb(o.p.fundo) });
        else if (o.tipo === "destaque") page.drawRectangle({ x: r.x, y: r.y, width: r.w, height: r.h, color: cor, opacity: 0.35, blendMode: BlendMode.Multiply });
        else if (o.tipo === "desenho" || o.tipo === "linha") {
          const pts = []; for (const q of o.pontos) pts.push(await visor.pontoPdf(n, q[0], q[1]));
          const d = pts.map((q, i) => (i ? "L " : "M ") + q[0].toFixed(2) + " " + (-q[1]).toFixed(2)).join(" ");
          page.drawSvgPath(d, { x: 0, y: 0, borderColor: cor, borderWidth: o.p.espessura, borderLineCap: LineCapStyle.Round });
        }
      }
    }
    return doc;
  }

  /* ================================================================== bloco de assinatura (desenho, digitação ou imagem) */
  function BlocoAssinatura(el, aoPronto) {
    el.innerHTML = '<div class="abas" role="tablist"><button type="button" class="aba" role="tab" aria-selected="true" data-m="desenhar">Desenhar</button><button type="button" class="aba" role="tab" aria-selected="false" data-m="digitar">Digitar</button><button type="button" class="aba" role="tab" aria-selected="false" data-m="imagem">Imagem</button></div>' +
      '<div data-p="desenhar"><canvas class="a-pad" width="560" height="180" aria-label="Área para desenhar a assinatura"></canvas><div class="linha-btns" style="margin-top:6px"><button type="button" class="btn sec peq" data-limpar>Limpar</button><label class="v-p">Cor <input type="color" value="#0b2a6b" data-cor></label></div></div>' +
      '<div data-p="digitar" hidden><label class="campo">Nome<input type="text" data-nome placeholder="Nome completo"></label><div class="linha-btns" style="margin-top:6px"><label class="v-p">Estilo <select data-estilo><option value="Dancing Script">Manuscrito</option><option value="Great Vibes">Caligráfico</option><option value="Caveat">Informal</option></select></label></div></div>' +
      '<div data-p="imagem" hidden><label class="btn sec" style="cursor:pointer">Escolher imagem da assinatura (PNG ou JPG)<input type="file" accept="image/png,image/jpeg" data-img hidden></label></div>' +
      '<div class="linha-btns" style="margin-top:10px"><button type="button" class="btn" data-usar>Usar esta assinatura</button><span class="pequeno mudo">Depois, clique na página para posicioná-la.</span></div>';
    let modo = "desenhar", imagem = null;
    const pad = el.querySelector(".a-pad"), ctx = pad.getContext("2d");
    let des = false, ult = null;
    const p = e => { const r = pad.getBoundingClientRect(); return [(e.clientX - r.left) * pad.width / r.width, (e.clientY - r.top) * pad.height / r.height]; };
    pad.addEventListener("pointerdown", e => { des = true; ult = p(e); pad.setPointerCapture(e.pointerId); });
    pad.addEventListener("pointermove", e => { if (!des) return; const q = p(e); ctx.strokeStyle = el.querySelector("[data-cor]").value; ctx.lineWidth = 3.2; ctx.lineCap = "round"; ctx.lineJoin = "round"; ctx.beginPath(); ctx.moveTo(ult[0], ult[1]); ctx.lineTo(q[0], q[1]); ctx.stroke(); ult = q; });
    pad.addEventListener("pointerup", () => { des = false; });
    el.querySelector("[data-limpar]").onclick = () => ctx.clearRect(0, 0, pad.width, pad.height);
    el.querySelector(".abas").addEventListener("click", e => { const b = e.target.closest("[data-m]"); if (!b) return; modo = b.dataset.m; el.querySelectorAll("[data-m]").forEach(x => x.setAttribute("aria-selected", String(x === b))); el.querySelectorAll("[data-p]").forEach(x => { x.hidden = x.dataset.p !== modo; }); });
    el.querySelector("[data-img]").onchange = e => { imagem = e.target.files[0] || null; };
    function aparar(c) {
      const d = c.getContext("2d").getImageData(0, 0, c.width, c.height).data; let x0 = c.width, y0 = c.height, x1 = 0, y1 = 0;
      for (let y = 0; y < c.height; y++) for (let x = 0; x < c.width; x++) if (d[(y * c.width + x) * 4 + 3] > 8) { if (x < x0) x0 = x; if (y < y0) y0 = y; if (x > x1) x1 = x; if (y > y1) y1 = y; }
      if (x1 <= x0) return null; const o = document.createElement("canvas"); o.width = x1 - x0 + 8; o.height = y1 - y0 + 8; o.getContext("2d").drawImage(c, x0 - 4, y0 - 4, o.width, o.height, 0, 0, o.width, o.height); return o;
    }
    el.querySelector("[data-usar]").onclick = async () => {
      let c = null;
      if (modo === "desenhar") c = aparar(pad);
      else if (modo === "digitar") {
        const nome = el.querySelector("[data-nome]").value.trim(); if (!nome) { root.HUB.toast("Digite o nome."); return; }
        const fam = el.querySelector("[data-estilo]").value; try { await document.fonts.load("64px '" + fam + "'"); } catch (e) { /* usa a fonte disponível */ }
        const t = document.createElement("canvas"); t.width = 900; t.height = 200; const g = t.getContext("2d"); g.font = "72px '" + fam + "', cursive"; g.fillStyle = "#0b2a6b"; g.textBaseline = "middle"; g.fillText(nome, 20, 100); c = aparar(t);
      } else if (imagem) { const bmp = await createImageBitmap(imagem); c = document.createElement("canvas"); c.width = bmp.width; c.height = bmp.height; c.getContext("2d").drawImage(bmp, 0, 0); }
      if (!c) { root.HUB.toast(modo === "imagem" ? "Escolha a imagem da assinatura." : "Desenhe a assinatura antes."); return; }
      const blob = await X.blobDe(c, "image/png");
      aoPronto({ bytes: new Uint8Array(await blob.arrayBuffer()), url: URL.createObjectURL(blob), razao: c.width / c.height, png: true });
    };
  }

  root.PDFX.Grade = Grade; root.PDFX.Visor = Visor; root.PDFX.aplicarObjetos = aplicarObjetos; root.PDFX.BlocoAssinatura = BlocoAssinatura; root.PDFX.limpaTxt = limpaTxt;
})(window);
