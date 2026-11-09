/* Apresentação do planejamento patrimonial e sucessório no modelo institucional da TPC Advogados.
   As lâminas institucionais são imagens fixas do modelo (pasta apresentacao/). As lâminas do caso são montadas a partir
   do formulário e do texto do diagnóstico, inclusive das edições feitas na pré-visualização, de modo que qualquer
   alteração do relatório se reflete na apresentação. Cada lâmina é descrita por elementos simples (imagem, retângulo,
   texto, linha e tabela, em polegadas sobre 13,333 x 7,5), desenhados igualmente na prévia em HTML e no PowerPoint. */
(function (root) {
  "use strict";
  const W = 13.333, H = 7.5;
  const COR = { faixa: "C8C3BE", titulo: "3C3C3C", texto: "262626", sutil: "595959", borda: "AE532F", amarelo: "F6EF90", holding: "7F7F7F", branco: "FFFFFF", fundoTab: "EFECE8" };
  const FONTE = "Aptos";
  const DIR = "apresentacao/";
  const IC = n => DIR + "icone-" + n + ".png";

  /* ------------------------------------------------------------------ utilidades de texto */
  const tx = r => typeof r === "string" ? r : (r || []).map(x => x[0]).join("");
  const runs = r => typeof r === "string" ? [{ t: r }] : (r || []).map(([t, e]) => ({ t, b: /bo/.test(e || "") }));
  const primeiroNome = s => String(s || "").trim().split(/\s+/)[0] || "";
  const sobrenome = s => { const p = String(s || "").trim().split(/\s+/).filter(w => w.length > 2 && !/^(de|da|do|dos|das|e)$/i.test(w)); return p.length > 1 ? p[p.length - 1] : ""; };
  const corta = (s, n) => { s = String(s || "").trim(); if (s.length <= n) return s; const c = s.slice(0, n); const k = Math.max(c.lastIndexOf(". "), c.lastIndexOf("; ")); return (k > n * 0.55 ? c.slice(0, k + 1) : c.replace(/\s+\S*$/, "") + "…"); };
  const ABREV = /\b(art|arts|inc|incs|n|nº|cf|p|pp|fls|ss|al|par|ex|res|sr|sra|lc|min|rel)\.$/i;
  const primeiraFrase = (s, n) => { s = String(s || "").trim(); const re = /\.\s+(?=[A-ZÀ-Ú])/g; let m; while ((m = re.exec(s))) { if (m.index < 50) continue; if (ABREV.test(s.slice(Math.max(0, m.index - 6), m.index + 1))) continue; return corta(s.slice(0, m.index + 1), n || 260); } return corta(s, n || 260); };
  /* corpo de fonte que cabe na caixa, por estimativa de caracteres por linha e de linhas */
  function caber(texto, w, h, max, min) {
    const n = String(texto || "").length + 40 * (String(texto || "").split("\n").length - 1);
    for (let s = max; s >= min; s -= 0.5) { const porLinha = w * 72 / (s * 0.5), linhas = Math.floor(h * 72 / (s * 1.3)); if (Math.ceil(n / porLinha) <= linhas) return s; }
    return min;
  }

  /* ------------------------------------------------------------------ seções do relatório */
  function secoes(blocos) {
    const o = []; let cur = { titulo: "", blocos: [] };
    (blocos || []).forEach(b => { if (b.t === "h") { o.push(cur); cur = { titulo: String(b.texto || ""), blocos: [] }; } else cur.blocos.push(b); });
    o.push(cur);
    const achar = re => o.find(x => re.test(x.titulo.replace(/^[IVXL]+\.\s*/, ""))) || null;
    return {
      achar,
      tabelas: s => s ? s.blocos.filter(b => b.t === "tab") : [],
      paragrafos: s => s ? s.blocos.filter(b => b.t === "p") : []
    };
  }
  const celula = c => typeof c === "string" || typeof c === "number" ? String(c) : tx(c);

  /* ------------------------------------------------------------------ elementos comuns */
  function cabecalho(titulo) {
    const tam = titulo.length > 30 ? 26 : 30;
    return [
      { k: "rect", x: 0, y: 0, w: W, h: 1.81, fill: COR.faixa },
      { k: "txt", x: 0.45, y: 0.3, w: 8.9, h: 1.25, texto: titulo.toUpperCase(), s: tam, b: true, c: COR.titulo, valign: "middle" },
      { k: "img", src: DIR + "logo-cabecalho.png", x: 9.52, y: 0.78, w: 2.57, h: 0.625 },
      { k: "rect", x: 0, y: H - 0.104, w: W, h: 0.104, fill: COR.amarelo }
    ];
  }
  function pessoa(x, y, w, h, icone, nome, sub, opc) {
    opc = opc || {};
    const ic = Math.min(w * 0.5, h * 0.42), el = [{ k: "rect", x, y, w, h, fill: COR.branco, line: opc.cor || COR.borda, lw: 1, r: 0.12 }];
    if (Array.isArray(icone)) { const n = icone.length, s = Math.min(ic, (w - 0.2) / n); icone.forEach((i, k) => el.push({ k: "img", src: IC(i), x: x + w / 2 - (n * s) / 2 + k * s, y: y + 0.1, w: s, h: s })); }
    else el.push({ k: "img", src: IC(icone), x: x + (w - ic) / 2, y: y + 0.1, w: ic, h: ic });
    const ty = y + 0.12 + ic;
    el.push({ k: "txt", x: x + 0.05, y: ty, w: w - 0.1, h: h - (ty - y) - 0.05, align: "center", valign: "top", s: opc.s || 10.5, c: COR.texto, runs: [{ t: nome, b: true }].concat(sub ? [{ t: "\n" + sub, s: (opc.s || 10.5) - 1.5 }] : []) });
    return el;
  }
  const seta = (x1, y, x2, rot, opc) => [{ k: "line", x1, y1: y, x2, y2: y, c: (opc && opc.c) || "7F7F7F", lw: 2.25, seta: true }].concat(rot ? [{ k: "txt", x: Math.min(x1, x2), y: y - 0.42, w: Math.abs(x2 - x1), h: 0.36, texto: rot, s: 10.5, align: "center", valign: "bottom", c: COR.texto }] : []);
  const linha = (x1, y1, x2, y2, opc) => ({ k: "line", x1, y1, x2, y2, c: (opc && opc.c) || COR.borda, lw: (opc && opc.lw) || 1, tracejado: opc && opc.tracejado });
  const holding = (x, y, w, h, nome) => [{ k: "rect", x, y, w, h, fill: COR.holding, r: 0.14 }, { k: "txt", x: x + 0.08, y, w: w - 0.16, h, texto: nome, s: 11, b: true, c: COR.branco, align: "center", valign: "middle" }];
  function paragrafo(x, y, w, h, rr, opc) {
    opc = opc || {};
    const lista = Array.isArray(rr) && rr.length && (typeof rr[0] === "string" || (Array.isArray(rr[0]) && Array.isArray(rr[0][0]))) ? rr : null;
    const texto = (lista || [rr]).map(tx).join("\n\n");
    const s = caber(texto, w, h, opc.max || 15, opc.min || 10);
    const rs = []; (lista || [rr]).forEach((p, i) => { if (i) rs.push({ t: "\n\n" }); runs(p).forEach(x => rs.push(x)); });
    return { k: "txt", x, y, w, h, runs: rs, s, c: COR.texto, align: opc.align || "justify", valign: opc.valign || "top", ls: 1.15 };
  }
  function tabela(x, y, w, cab, linhas, opc) {
    opc = opc || {};
    const n = linhas.length + (cab ? 1 : 0), s = opc.s || (n > 9 ? 10 : n > 6 ? 11 : 12);
    return { k: "tab", x, y, w, cab, linhas, s, larg: opc.larg, num: opc.num || [] };
  }

  /* ------------------------------------------------------------------ montagem */
  function montar(d, r, blocos, cfg) {
    cfg = cfg || {};
    const M = root.PAT_MOTOR, brl = M.brl, L = [], cs = d.casal || {}, cl = d.cliente || {};
    const S = secoes(blocos);
    const filhos = (d.filhos || []).filter(f => f.nome);
    const pat = cs.patriarca || "", mat = cs.matriarca || "", casal = [pat, mat].filter(Boolean);
    const casado = casal.length === 2 && !/solteir|divorc|vi[uú]v/i.test(cs.regime || "");
    const fam = sobrenome(pat) || sobrenome(mat) || sobrenome(cl.nome) || "Familiar";
    const nomeHolding = (cfg.holding || "").trim() || "Holding " + fam + " Patrimonial Ltda.";
    const tit = primeiroNome(pat) || primeiroNome(mat) || "Titular";
    const casalCurto = casal.map(primeiroNome).join(" e ") || "Titular";
    const regimeTxt = !cs.regime ? "" : /uni[aã]o/i.test(cs.regime) ? "em união estável" + (/parcial/i.test(cs.regime) ? " (comunhão parcial)" : "") : /solteir|divorc|vi[uú]v/i.test(cs.regime) ? cs.regime.toLowerCase() : (casado ? "casados" : "casado(a)") + " sob o regime da " + cs.regime.toLowerCase().replace(/^separação/, "separação") + " de bens";
    const icFilho = (f, i) => /a$/i.test(primeiroNome(f.nome)) && !/^(luca|joshua|nicola|andrea)$/i.test(primeiroNome(f.nome)) ? (i % 2 ? "filha-b" : "filha") : "filho";
    const regimeFilho = f => !f.regime ? "" : /solteir/i.test(f.regime) ? "Solteiro(a)" : /uni[aã]o/i.test(f.regime) ? "União estável (comunhão parcial)" : /divorc/i.test(f.regime) ? "Divorciado(a)" : /vi[uú]v/i.test(f.regime) ? "Viúvo(a)" : "Casado(a) (" + f.regime.toLowerCase().replace(/^separação convencional/, "separação total") + ")";
    const est = (img, nota) => L.push({ id: img, tipo: "fixa", nota, el: [{ k: "img", src: DIR + "lamina-" + img + ".jpg", x: 0, y: 0, w: W, h: H }] });
    const nova = (id, titulo, el) => L.push({ id, tipo: "caso", titulo, el: cabecalho(titulo).concat(el) });

    if (cfg.institucional !== false) ["01", "02", "03", "04", "05", "06", "07"].forEach(i => est(i, "Institucional"));
    est("08", "Abertura do tema"); est("09", "Dimensões da atuação"); est("10", "Benefícios do planejamento");

    /* planejamento patrimonial: texto de abertura */
    const apres = S.paragrafos(S.achar(/apresenta/i));
    nova("abertura", "Planejamento patrimonial", [
      paragrafo(0.9, 2.35, 7.2, 4.5, [
        [["Existem ", "n"], ["inúmeras", "bo"], [" formas de se construir um projeto de planejamento sucessório, dependendo das particularidades da família, das empresas e do patrimônio.", "n"]],
        [["A estrutura a seguir foi desenhada a partir das informações de " + (cl.nome || casalCurto) + " e ", "n"], ["será refinada", "bo"], [" com a análise documental dos bens, das declarações e dos balanços.", "n"]]
      ].concat(apres.length ? [apres[0].r] : []).slice(0, 3), { max: 17, min: 12 }),
      { k: "img", src: IC("patriarca"), x: 9.0, y: 2.9, w: 1.25, h: 1.25 }, { k: "img", src: IC("matriarca"), x: 10.25, y: 2.9, w: 1.25, h: 1.25 },
      { k: "img", src: IC("filho"), x: 8.8, y: 4.35, w: 1.0, h: 1.0 }, { k: "img", src: IC("filha"), x: 9.85, y: 4.35, w: 1.0, h: 1.0 }, { k: "img", src: IC("filha-b"), x: 10.9, y: 4.35, w: 1.0, h: 1.0 }
    ]);

    /* estrutura familiar */
    {
      const el = [], cw = casal.length > 1 ? 2.7 : 2.3, cx = W / 2 - cw / 2, cy = 2.05, ch = 1.7;
      el.push(...pessoa(cx, cy, cw, ch, casal.length > 1 ? ["patriarca", "matriarca"] : ["patriarca"], casalCurto, regimeTxt ? regimeTxt.charAt(0).toUpperCase() + regimeTxt.slice(1) : "", { s: 11 }));
      const t = r.tot, im = r.im || [], alug = r.alugueis.receita;
      const ativos = [];
      if (im.length) ativos.push({ ic: im.some(x => /rural/i.test(x.tipo || "")) && !im.some(x => !/rural/i.test(x.tipo || "")) ? "rural" : "imoveis", linhas: [brl(t.imIrpf) + " (IRPF)", brl(t.imMercado) + " (valor de mercado)"].concat(alug ? [brl(alug / 12) + " por mês (renda de aluguel)"] : []).concat([im.length + (im.length === 1 ? " imóvel" : " imóveis")]) });
      if ((r.emp || []).length) ativos.push({ ic: "empresa", linhas: [brl(t.empPl) + " (patrimônio líquido)", brl(t.empMercado) + " (valor estimado)", r.emp.map(x => x.nome).filter(Boolean).slice(0, 2).join(", ")] });
      const fin = t.aplicacoes + t.previdencia + t.exterior;
      if (fin) ativos.push({ ic: "dinheiro", linhas: [brl(t.aplicacoes) + " (aplicações)"].concat(t.previdencia ? [brl(t.previdencia) + " (previdência)"] : []).concat(t.exterior ? [brl(t.exterior) + " (exterior)"] : []) });
      /* ativos ao lado do casal: ícone e valores em linha, até dois por lado */
      const pos = ativos.length === 1 ? [{ lado: -1, y: 2.45 }] : ativos.length === 2 ? [{ lado: -1, y: 2.45 }, { lado: 1, y: 2.45 }] : [{ lado: -1, y: 1.95 }, { lado: -1, y: 3.15 }, { lado: 1, y: 2.45 }];
      ativos.slice(0, 3).forEach((a, i) => {
        const p = pos[i], y = p.y, bw = 0.95, ix = p.lado < 0 ? 0.4 : W - 0.4 - bw, tw = 2.75, txx = p.lado < 0 ? ix + bw + 0.1 : ix - 0.1 - tw;
        el.push({ k: "rect", x: ix, y, w: bw, h: bw, fill: COR.branco, line: COR.borda, lw: 1, r: 0.12 }, { k: "img", src: IC(a.ic), x: ix + 0.1, y: y + 0.1, w: bw - 0.2, h: bw - 0.2 });
        el.push({ k: "txt", x: txx, y: y - 0.05, w: tw, h: bw + 0.1, texto: a.linhas.filter(Boolean).join("\n"), s: 9.5, align: p.lado < 0 ? "left" : "right", valign: "middle", c: COR.texto });
        const ly = y + bw / 2;
        el.push(linha(p.lado < 0 ? txx + tw : cx + cw, ly, p.lado < 0 ? cx : txx, ly, { tracejado: true }));
      });
      const n = filhos.length;
      if (n) {
        const fw = Math.min(2.0, (W - 1.2) / n - 0.3), fh = 1.95, gap = (W - n * fw) / (n + 1), fy = 4.95, bus = 4.55;
        el.push(linha(W / 2, cy + ch, W / 2, bus));
        const xs = filhos.map((f, i) => gap + i * (fw + gap));
        if (n > 1) el.push(linha(xs[0] + fw / 2, bus, xs[n - 1] + fw / 2, bus));
        filhos.forEach((f, i) => { el.push(linha(xs[i] + fw / 2, bus, xs[i] + fw / 2, fy)); el.push(...pessoa(xs[i], fy, fw, fh, icFilho(f, i), f.nome.split(/\s+/).slice(0, 2).join(" ") + (f.idade ? ", " + f.idade + " anos" : ""), [regimeFilho(f), /sim/i.test(f.incapaz || "") ? "Incapaz ou com deficiência" : ""].filter(Boolean).join("\n"), { s: n > 4 ? 9.5 : 10.5 })); });
      }
      nova("familia", "Estrutura familiar", el);
    }

    /* panorama do patrimônio (seção II do relatório) */
    {
      const sec = S.achar(/retrato/i), tb = S.tabelas(sec)[0], ps = S.paragrafos(sec);
      const t = r.tot, a = r.alugueis, h = r.holding;
      const kpi = [["Patrimônio bruto", brl(t.bruto), brl(t.declarado) + " declarados"], ["Sucessão sem planejamento", brl(r.semPlan.total), M.pct(r.semPlan.monte ? r.semPlan.total / r.semPlan.monte * 100 : 0, 1) + " do monte"], ["Economia com a holding", h.imoveis ? brl(h.economia) : "Não se aplica", h.imoveis ? brl(h.economiaFuturo) + " no cenário progressivo" : "Sem imóveis"], ["Aluguéis na holding (2033)", a.receita ? brl(a.fases[2].economia) : "Não se aplica", a.receita ? "por ano, ante a pessoa física" : "Sem aluguéis"]];
      const el = [];
      kpi.forEach(([r1, v, s2], i) => { const x = 0.55 + i * 3.1; el.push({ k: "rect", x, y: 2.1, w: 2.85, h: 1.35, fill: COR.branco, line: COR.borda, lw: 1, r: 0.12 }, { k: "txt", x: x + 0.15, y: 2.15, w: 2.55, h: 1.25, runs: [{ t: r1, s: 10, c: COR.sutil }, { t: "\n" + v, s: 19, b: true }, { t: "\n" + s2, s: 9, c: COR.sutil }], c: COR.texto, valign: "middle" }); });
      if (tb) el.push(tabela(0.55, 3.75, 7.4, tb.cab, tb.linhas.map(l => l.map(celula)), { larg: [3.4, 2.2, 1.8], num: [1, 2] }));
      if (ps.length) el.push(paragrafo(8.25, 3.75, 4.55, 3.4, ps[ps.length - 1].r, { max: 14, min: 10.5, align: "left" }));
      nova("panorama", "Diagnóstico do patrimônio", el);
    }

    /* custo da sucessão (seção IV) */
    {
      const sec = S.achar(/custo da sucess/i), tb = S.tabelas(sec)[0], ps = S.paragrafos(sec);
      const el = [];
      if (tb) el.push(tabela(0.55, 2.15, 6.6, tb.cab, tb.linhas.map(l => l.map(celula)), { larg: [2.6, 2.0, 2.0], num: [1, 2] }));
      const txt = ps.length ? [ps[0].r, ps[ps.length - 1].r].filter((x, i, a) => i === 0 || tx(x) !== tx(a[0])) : [];
      if (txt.length) el.push(paragrafo(7.5, 2.15, 5.3, 5.0, txt.map(x => corta(tx(x), 520)), { max: 14, min: 10.5, align: "left" }));
      nova("sucessao", "Custo da sucessão sem planejamento", el);
    }

    /* reforma tributária e aluguéis (seção V) */
    if (r.alugueis.receita) {
      const sec = S.achar(/alugu/i), tbs = S.tabelas(sec), tb = tbs.find(t => /ano/i.test((t.cab || [])[0] || "")) || tbs[0], ps = S.paragrafos(sec);
      const el = [];
      if (tb) el.push(tabela(0.55, 2.1, 8.1, tb.cab, tb.linhas.map(l => l.map(celula)), { larg: tb.cab && tb.cab.length === 5 ? [0.7, 3.2, 1.35, 1.5, 1.35] : null, num: [2, 3, 4] }));
      if (ps.length) el.push(paragrafo(8.95, 2.1, 3.85, 5.1, corta(tx(ps[ps.length - 1].r), 650), { max: 13, min: 10, align: "left" }));
      nova("reforma", "Reforma tributária e aluguéis", el);
    }

    /* 1º passo: integralização */
    const h = r.holding, nF = filhos.length;
    if (h.imoveis) {
      const linhas = [{ ic: "patriarca", nome: tit, valor: brl(h.baseCont) + " em imóveis" + (casado ? "*" : ""), alvo: "imoveis" }].concat(filhos.map((f, i) => ({ ic: icFilho(f, i), nome: primeiroNome(f.nome), valor: "R$ 1,00 em dinheiro", alvo: "dinheiro" })));
      const n = linhas.length, top = 2.05, bot = casado ? 6.85 : 7.15, rh = Math.min(1.25, (bot - top) / n), bx = Math.min(1.05, rh - 0.12), el = [];
      const busX = 6.55, hx = 7.2, hw = 2.2, hh = 1.2, hy = top + (n * rh) / 2 - hh / 2;
      linhas.forEach((l, i) => {
        const y = top + i * rh, cy = y + bx / 2;
        el.push(...pessoa(1.0, y, bx, bx, l.ic, l.nome, "", { s: 9 }));
        el.push(...seta(1.0 + bx + 0.15, cy, 4.75, l.valor));
        el.push({ k: "rect", x: 4.9, y, w: bx, h: bx, fill: COR.branco, line: COR.borda, lw: 1, r: 0.12 }, { k: "img", src: IC(l.alvo), x: 4.9 + bx * 0.15, y: y + bx * 0.15, w: bx * 0.7, h: bx * 0.7 });
        el.push(linha(4.9 + bx, cy, busX, cy));
      });
      el.push(linha(busX, top + bx / 2, busX, top + (n - 1) * rh + bx / 2), linha(busX, hy + hh / 2, hx, hy + hh / 2));
      el.push(...holding(hx, hy, hw, hh, nomeHolding));
      el.push({ k: "txt", x: hx - 0.2, y: hy + hh + 0.05, w: hw + 0.4, h: 0.6, texto: "Capital social\n" + brl(h.baseCont + nF).replace(/(\d)$/, "$1,00"), s: 11, b: true, align: "center", c: COR.texto });
      el.push(paragrafo(9.85, 2.15, 3.0, 4.6, "A integralização pelo valor declarado no imposto de renda evita a apuração de ganho de capital (Lei 9.249/1995, art. 23). Cada filho ingressa com R$ 1,00 em dinheiro, o que constitui a sociedade com todos os herdeiros desde o início." + (h.preponderancia ? " Como a holding terá a locação como atividade preponderante, o ITBI deve ser examinado previamente (Temas 796 e 1.348 do STF)." : ""), { max: 12, min: 9.5, align: "left" }));
      if (casado) el.push({ k: "txt", x: 0.45, y: 6.95, w: 12.4, h: 0.35, texto: "*" + (primeiroNome(mat) || "O cônjuge") + " deverá assinar o contrato social como interveniente anuente (CC, art. 1.647, I).", s: 10, b: true, c: COR.texto });
      nova("passo1", "1º passo: integralizações", el);

      /* 2º passo: transferência das quotas, agrupada pela modalidade escolhida para cada filho */
      if (nF) {
        const quotas = Math.floor(h.baseCont / nF), q = quotas.toLocaleString("pt-BR") + " quotas";
        const mod = filhos.map((f, i) => ((cfg.modalidades || {})[f.nome] || "doacao"));
        ["doacao", "venda"].forEach(m => {
          const grupo = filhos.map((f, i) => ({ f, i })).filter(o => mod[o.i] === m); if (!grupo.length) return;
          const nomes = grupo.map(o => primeiroNome(o.f.nome)), lista = nomes.length > 1 ? nomes.slice(0, -1).join(", ") + " e " + nomes[nomes.length - 1] : nomes[0];
          const el2 = [{ k: "txt", x: 1.5, y: 2.0, w: 10.3, h: 0.75, texto: tit + " transferirá as quotas da " + nomeHolding + (m === "doacao" ? " por meio de doação, com reserva de usufruto, " + (grupo.length > 1 ? "aos filhos " : "a ") + lista + "." : " por meio da venda das quotas " + (grupo.length > 1 ? "aos filhos " : "a ") + lista + "."), s: 13, align: "center", valign: "middle", c: COR.texto }];
          const g = grupo.length, top = 2.95, bot = 6.9, rh = Math.min(1.9, (bot - top) / g), bw = Math.min(1.6, rh - 0.12), cy = g === 1 ? top + bw / 2 : top + ((g - 1) * rh + bw) / 2;
          el2.push(...pessoa(1.6, cy - 0.85, 1.6, 1.7, "patriarca", tit, "", { s: 11 }));
          if (g > 1) el2.push(linha(3.2, cy, 3.6, cy, { c: "7F7F7F", lw: 2.25 }), linha(3.6, top + bw / 2, 3.6, top + (g - 1) * rh + bw / 2, { c: "7F7F7F", lw: 2.25 }));
          grupo.forEach((o, k) => {
            const y = top + k * rh, yc = y + bw / 2;
            el2.push(...seta(g > 1 ? 3.6 : 3.35, yc, 7.6, q));
            el2.push(...pessoa(7.8, y, bw, bw, icFilho(o.f, o.i), primeiroNome(o.f.nome), regimeFilho(o.f), { s: 9.5 }));
          });
          const nota = m === "doacao"
            ? "Doação com cláusulas de incomunicabilidade, impenhorabilidade e inalienabilidade e reserva de usufruto (CC, arts. 1.390 e 1.911). Os bens doados não se comunicam na comunhão parcial (CC, art. 1.659, I). ITCMD estimado de " + brl(h.itcmdCont * g / nF) + " pela base contábil e de " + brl(h.itcmdMerc * g / nF) + " a valor de mercado."
            : "Venda com preço efetivamente pago e origem comprovada dos recursos de cada adquirente, consentimento dos demais descendentes e do cônjuge (CC, art. 496) e apuração de ganho de capital pelo cedente se o preço superar o custo das quotas. Não incide ITCMD.";
          el2.push(paragrafo(10.0, 2.95, 2.85, 4.1, nota, { max: 11.5, min: 9, align: "left" }));
          nova("passo2-" + m, "2º passo", el2);
        });

        /* 3º passo: usufruto */
        const el3 = [], top = 2.15, rh = Math.min(1.55, 4.9 / nF), bw = Math.min(1.35, rh - 0.15), hx = 5.0, hy = top + (nF * rh) / 2 - 0.6;
        el3.push(paragrafo(0.55, 2.15, 4.0, 5.0, cfg.textoUsufruto || (tit + " reservará para si" + (casado ? " e para " + primeiroNome(mat) : "") + " o usufruto vitalício sobre as quotas transferidas. Isso lhe garantirá o exercício do direito de voto e a consequente nomeação do representante legal da sociedade, bem como a garantia de recebimento dos frutos patrimoniais, ou seja, dos dividendos. Com o falecimento do usufrutuário, o usufruto se extingue e a propriedade plena consolida-se nos filhos, sem inventário das quotas."), { max: 14, min: 10.5 }));
        el3.push(...holding(hx, hy, 1.9, 1.2, nomeHolding));
        const bus = 7.35, pct = (100 / nF).toLocaleString("pt-BR", { maximumFractionDigits: 2 }) + "%";
        el3.push(linha(hx + 1.9, hy + 0.6, bus - 0.35, hy + 0.6, { c: "7F7F7F" }), linha(bus - 0.35, top + bw / 2, bus - 0.35, top + (nF - 1) * rh + bw / 2, { c: "7F7F7F" }));
        filhos.forEach((f, i) => { const y = top + i * rh; el3.push(linha(bus - 0.35, y + bw / 2, bus + 0.2, y + bw / 2, { c: "7F7F7F" }), { k: "txt", x: bus - 0.35, y: y + bw / 2 - 0.34, w: 0.85, h: 0.3, texto: pct, s: 10, align: "center", c: COR.texto }); el3.push(...pessoa(bus + 0.2, y, bw, bw, icFilho(f, i), primeiroNome(f.nome), "", { s: 9.5 })); });
        const ux = bus + 0.2 + bw + 0.55;
        el3.push(...pessoa(ux, top + (nF * rh) / 2 - 0.8, 2.0, 1.45, casado ? ["patriarca", "matriarca"] : ["patriarca"], casalCurto, "", { s: 10.5 }));
        el3.push(linha(bus + 0.2 + bw, top + (nF * rh) / 2, ux, top + (nF * rh) / 2, { tracejado: true }));
        el3.push({ k: "txt", x: ux, y: top + (nF * rh) / 2 + 0.7, w: 2.0, h: 0.6, texto: "100%\nusufruto", s: 11, b: true, align: "center", c: COR.texto });
        nova("passo3", "3º passo: usufruto", el3);
      }
    }

    /* estrutura alternativa, quando há empresas */
    if ((r.emp || []).length) {
      const el = [], top = 2.0, xs = filhos.slice(0, 5).map((f, i, a) => 3.6 + (i - (a.length - 1) / 2) * 1.0 + 1.45);
      filhos.slice(0, 5).forEach((f, i) => { el.push({ k: "img", src: IC(icFilho(f, i)), x: xs[i] - 0.3, y: top, w: 0.6, h: 0.6 }, { k: "txt", x: xs[i] - 0.5, y: top + 0.6, w: 1.0, h: 0.3, texto: primeiroNome(f.nome), s: 9, b: true, align: "center", c: COR.texto }); });
      const cx = 5.05;
      if (xs.length) { el.push(linha(xs[0], top + 1.0, xs[xs.length - 1], top + 1.0), linha(cx, top + 1.0, cx, 3.55)); xs.forEach(x => el.push(linha(x, top + 0.9, x, top + 1.0))); }
      el.push({ k: "rect", x: cx - 1.0, y: 3.55, w: 2.0, h: 0.75, fill: "595959", line: COR.texto, lw: 1, r: 0.06, tracejado: true }, { k: "txt", x: cx - 1.0, y: 3.55, w: 2.0, h: 0.75, texto: "Holding " + fam + "\n(consolidação)", s: 10.5, b: true, align: "center", valign: "middle", c: COR.branco });
      el.push(linha(cx, 4.3, cx, 4.65, { c: COR.texto }), linha(3.3, 4.65, 6.8, 4.65, { c: COR.texto }), linha(3.3, 4.65, 3.3, 4.85, { c: COR.texto }), linha(6.8, 4.65, 6.8, 4.85, { c: COR.texto }));
      [[3.3, "Holding\nPatrimonial", r.im.some(x => /rural/i.test(x.tipo || "")) ? ["imoveis", "rural"] : ["imoveis"]], [6.8, "Holding\nParticipações", ["participacoes"]]].forEach(([x, n, ics]) => {
        el.push({ k: "rect", x: x - 0.85, y: 4.85, w: 1.7, h: 0.7, fill: "F2F2F2", line: COR.texto, lw: 1 }, { k: "txt", x: x - 0.85, y: 4.85, w: 1.7, h: 0.7, texto: n, s: 10.5, b: true, align: "center", valign: "middle", c: COR.texto });
        el.push(linha(x, 5.55, x, 5.95), { k: "rect", x: x - 0.6, y: 5.95, w: 1.2, h: 1.0, fill: COR.branco, line: COR.borda, lw: 1, r: 0.12 });
        ics.forEach((ic, k) => el.push({ k: "img", src: IC(ic), x: x - 0.32 * ics.length + k * 0.64, y: 6.12, w: 0.64, h: 0.64 }));
      });
      el.push(...pessoa(0.55, 3.35, 1.7, 1.25, casado ? ["patriarca", "matriarca"] : ["patriarca"], casalCurto, "", { s: 9.5 }));
      el.push({ k: "txt", x: 0.4, y: 2.7, w: 2.0, h: 0.6, texto: "Administrador" + (casado ? "es" : "") + "\ne usufrutuário" + (casado ? "s" : ""), s: 9.5, b: true, align: "center", valign: "bottom", c: COR.texto });
      el.push(linha(2.25, 3.95, 3.95, 3.95, { c: COR.texto, tracejado: true }));
      const rot = [[2.25, "Conselho de família"], [3.95, "Instrumento de antecipação da legítima\nRegras de sucessão na gestão\nConselho consultivo e acordo de sócios"], [5.2, "Regras de gestão do patrimônio e das participações"], [6.45, "Regras de gestão operacional das empresas" + (r.emp.length ? ": " + r.emp.map(x => x.nome).filter(Boolean).slice(0, 2).join(", ") : "")]];
      rot.forEach(([y, t]) => { el.push(...seta(8.0, y + 0.25, 8.75, ""), { k: "txt", x: 8.9, y: y - 0.15, w: 4.0, h: 0.95, texto: t, s: 10.5, b: true, valign: "middle", c: COR.texto }); });
      nova("alternativa", "Estrutura alternativa", el);
    }

    /* cenários (seção de cenários) */
    {
      const sec = S.achar(/cen[aá]rios/i), tb = S.tabelas(sec)[0], ps = S.paragrafos(sec);
      if (tb) {
        const el = [tabela(0.55, 2.15, 12.25, tb.cab, tb.linhas.map(l => l.map(celula)), { larg: [3.2, 2.2, 6.85], num: [1], s: 12 })];
        if (ps.length) el.push(paragrafo(0.55, 5.0, 12.25, 2.1, corta(tx(ps[ps.length - 1].r), 700), { max: 14, min: 10.5 }));
        nova("cenarios", "Cenários comparativos", el);
      }
    }

    /* riscos e roteiro: itens do relatório, com o título em destaque e a primeira frase */
    const itens = re => S.paragrafos(S.achar(re)).map(p => { const rr = runs(p.r), b = rr.filter(x => x.b).map(x => x.t).join("").trim(), resto = rr.filter(x => !x.b).map(x => x.t).join("").trim(); return b ? { t: b.replace(/^\d+\.\s*/, "").replace(/[.:]\s*$/, ""), x: primeiraFrase(resto, 230) } : { t: "", x: primeiraFrase(resto, 300) }; }).filter(x => x.t || x.x);
    const blocosItens = (id, titulo, lista, porLamina) => {
      for (let k = 0; k < lista.length; k += porLamina) {
        const fat = lista.slice(k, k + porLamina), el = [], rh = 5.05 / porLamina;
        fat.forEach((it, i) => {
          const y = 2.1 + i * rh, grave = /elevado/i.test(it.t);
          el.push({ k: "rect", x: 0.55, y: y + 0.06, w: 0.09, h: rh - 0.2, fill: grave ? COR.borda : "BFBFBF" });
          el.push({ k: "txt", x: 0.8, y, w: 12.0, h: rh - 0.08, runs: [{ t: it.t, b: true }].concat(it.x ? [{ t: (it.t ? "\n" : "") + it.x }] : []), s: caber(it.t + it.x, 12.0, rh - 0.1, 13, 9.5), c: COR.texto, valign: "middle", ls: 1.1 });
        });
        nova(id + (k ? "-" + (k / porLamina + 1) : ""), titulo + (lista.length > porLamina ? " (" + (k / porLamina + 1) + "/" + Math.ceil(lista.length / porLamina) + ")" : ""), el);
      }
    };
    blocosItens("riscos", "Riscos e pontos de atenção", itens(/riscos/i), 5);
    blocosItens("roteiro", "Roteiro de ações", itens(/roteiro/i), 5);

    /* conclusão */
    {
      const ps = S.paragrafos(S.achar(/conclus/i));
      if (ps.length) nova("conclusao", "Conclusão", [paragrafo(0.9, 2.2, 11.5, 4.9, ps.slice(0, 3).map(p => corta(tx(p.r), 900)), { max: 16, min: 11 })]);
    }
    est("18", "Contatos");
    return L;
  }

  /* ------------------------------------------------------------------ prévia em HTML (960 x 540, 72 px por polegada) */
  const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const P = v => (v * 72).toFixed(1) + "px";
  function htmlLamina(l) {
    return '<div class="lam-palco">' + l.el.map(e => {
      if (e.k === "img") return '<img src="' + esc(e.src) + '" alt="" style="position:absolute;left:' + P(e.x) + ";top:" + P(e.y) + ";width:" + P(e.w) + ";height:" + P(e.h) + ';object-fit:contain">';
      if (e.k === "rect") return '<div style="position:absolute;left:' + P(e.x) + ";top:" + P(e.y) + ";width:" + P(e.w) + ";height:" + P(e.h) + ";background:" + (e.fill ? "#" + e.fill : "transparent") + ";" + (e.line ? "border:" + (e.lw || 1) + "px " + (e.tracejado ? "dashed" : "solid") + " #" + e.line + ";" : "") + "border-radius:" + P(e.r || 0) + ';box-sizing:border-box"></div>';
      if (e.k === "line") {
        const x = Math.min(e.x1, e.x2), y = Math.min(e.y1, e.y2), w = Math.abs(e.x2 - e.x1), h = Math.abs(e.y2 - e.y1), horiz = h < 0.001;
        const est = "position:absolute;left:" + P(x) + ";top:" + P(y - (horiz ? e.lw / 144 : 0)) + ";width:" + (horiz ? P(w) : (e.lw || 1) + "px") + ";height:" + (horiz ? (e.lw || 1) + "px" : P(h)) + ";" + (e.tracejado ? "background:repeating-linear-gradient(" + (horiz ? "90deg" : "180deg") + ",#" + e.c + " 0 4px,transparent 4px 7px)" : "background:#" + e.c);
        return '<div style="' + est + '"></div>' + (e.seta ? '<div style="position:absolute;left:' + P(e.x2 - 0.13) + ";top:" + P(e.y2 - 0.08) + ";width:0;height:0;border-left:" + P(0.14) + " solid #" + e.c + ";border-top:" + P(0.08) + " solid transparent;border-bottom:" + P(0.08) + ' solid transparent"></div>' : "");
      }
      if (e.k === "txt") {
        const rs = e.runs || [{ t: e.texto }];
        const corpo = rs.map(x => '<span style="' + (x.b ? "font-weight:700;" : "") + (x.s ? "font-size:" + x.s + "px;" : "") + (x.c ? "color:#" + x.c + ";" : "") + '">' + esc(x.t).replace(/\n/g, "<br>") + "</span>").join("");
        const just = e.valign === "middle" ? "center" : e.valign === "bottom" ? "flex-end" : "flex-start";
        return '<div style="position:absolute;left:' + P(e.x) + ";top:" + P(e.y) + ";width:" + P(e.w) + ";height:" + P(e.h) + ";display:flex;flex-direction:column;justify-content:" + just + ";font-size:" + e.s + "px;line-height:" + (e.ls || 1.2) + ";color:#" + (e.c || COR.texto) + ";text-align:" + (e.align || "left") + ";" + (e.b ? "font-weight:700;" : "") + 'overflow:hidden"><div>' + corpo + "</div></div>";
      }
      if (e.k === "tab") {
        const tot = (e.larg || []).reduce((a, b) => a + b, 0);
        const col = e.larg ? "<colgroup>" + e.larg.map(v => '<col style="width:' + (v / tot * 100).toFixed(2) + '%">').join("") + "</colgroup>" : "";
        const td = (c, i, cab) => "<" + (cab ? "th" : "td") + ' style="' + (e.num.includes(i) ? "text-align:right;" : "") + '">' + esc(c) + "</" + (cab ? "th" : "td") + ">";
        return '<table class="lam-tab" style="position:absolute;left:' + P(e.x) + ";top:" + P(e.y) + ";width:" + P(e.w) + ";font-size:" + e.s + 'px">' + col + (e.cab ? "<thead><tr>" + e.cab.map((c, i) => td(c, i, true)).join("") + "</tr></thead>" : "") + "<tbody>" + e.linhas.map(l => "<tr>" + l.map((c, i) => td(c, i)).join("") + "</tr>").join("") + "</tbody></table>";
      }
      return "";
    }).join("") + "</div>";
  }

  /* ------------------------------------------------------------------ PowerPoint */
  const imgCache = {};
  async function dataUrl(src) {
    if (imgCache[src]) return imgCache[src];
    const r = await fetch(src); if (!r.ok) throw new Error("Imagem da apresentação indisponível: " + src);
    const b = await r.blob();
    return imgCache[src] = await new Promise((ok, erro) => { const f = new FileReader(); f.onload = () => ok(f.result); f.onerror = erro; f.readAsDataURL(b); });
  }
  async function pptx(lams, nome, prog) {
    if (!root.PptxGenJS) throw new Error("O gerador de PowerPoint não foi carregado. Verifique a conexão e recarregue a página.");
    const p = new root.PptxGenJS(); p.layout = "LAYOUT_WIDE"; p.author = "TPC Advogados"; p.company = "TPC Advogados"; p.title = nome;
    for (let i = 0; i < lams.length; i++) {
      if (prog) prog("Montando a lâmina " + (i + 1) + " de " + lams.length + "…", i / lams.length);
      const s = p.addSlide(); s.background = { color: "FFFFFF" };
      for (const e of lams[i].el) {
        if (e.k === "img") s.addImage({ data: await dataUrl(e.src), x: e.x, y: e.y, w: e.w, h: e.h });
        else if (e.k === "rect") s.addShape(e.r ? p.ShapeType.roundRect : p.ShapeType.rect, Object.assign({ x: e.x, y: e.y, w: e.w, h: e.h, fill: e.fill ? { color: e.fill } : { type: "none" }, line: e.line ? { color: e.line, width: e.lw || 1, dashType: e.tracejado ? "dash" : "solid" } : { type: "none" } }, e.r ? { rectRadius: Math.min(0.5, e.r / Math.min(e.w, e.h) * 2) } : {}));
        else if (e.k === "line") s.addShape(p.ShapeType.line, { x: Math.min(e.x1, e.x2), y: Math.min(e.y1, e.y2), w: Math.max(0.001, Math.abs(e.x2 - e.x1)), h: Math.max(0.001, Math.abs(e.y2 - e.y1)), flipH: e.x2 < e.x1, line: { color: e.c, width: e.lw || 1, dashType: e.tracejado ? "dash" : "solid", endArrowType: e.seta ? "triangle" : undefined } });
        else if (e.k === "txt") {
          const rs = (e.runs || [{ t: e.texto }]).map(x => ({ text: x.t, options: Object.assign({}, x.b ? { bold: true } : {}, x.s ? { fontSize: x.s } : {}, x.c ? { color: x.c } : {}) }));
          s.addText(rs, { x: e.x, y: e.y, w: e.w, h: e.h, fontFace: FONTE, fontSize: e.s, color: e.c || COR.texto, bold: !!e.b, align: e.align || "left", valign: e.valign || "top", margin: 0.04, lineSpacingMultiple: e.ls || 1.1, fit: "shrink" });
        } else if (e.k === "tab") {
          const tot = (e.larg || []).reduce((a, b) => a + b, 0), cols = (e.cab || e.linhas[0] || []).length;
          const colW = e.larg && e.larg.length === cols ? e.larg.map(v => v / tot * e.w) : Array(cols).fill(e.w / cols);
          const linhaT = (l, cab) => l.map((c, i) => ({ text: String(c), options: { bold: !!cab, fill: { color: cab ? COR.faixa : "FFFFFF" }, color: COR.texto, align: e.num.includes(i) ? "right" : "left" } }));
          s.addTable((e.cab ? [linhaT(e.cab, true)] : []).concat(e.linhas.map(l => linhaT(l))), { x: e.x, y: e.y, w: e.w, colW, fontFace: FONTE, fontSize: e.s, border: { type: "solid", pt: 0.75, color: "BFBFBF" }, margin: 0.06, valign: "middle", autoPage: false });
        }
      }
      if (lams[i].tipo === "caso") s.addNotes("Lâmina gerada pelo HUB TPC a partir do diagnóstico. Confira os valores antes da reunião.");
    }
    if (prog) prog("Gerando o arquivo…", 0.98);
    return p.writeFile({ fileName: nome + ".pptx" });
  }

  root.PAT_APRES = { montar, htmlLamina, pptx, secoes, _t: { caber, corta, primeiraFrase } };
})(typeof window !== "undefined" ? window : globalThis);
