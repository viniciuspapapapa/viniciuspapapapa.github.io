/* Interface do Estudo de Caso Criminal: leitura dos autos, estudo gerado por regras na própria plataforma (sem IA e
   sem custo) e, opcionalmente, aprofundamento com a API da OpenAI, com a chave informada pelo usuário. */
(function () {
  "use strict";
  const L = window.EC_LEITOR, P = window.EC_PROMPT, W = window.EC_DOCX, AN = window.EC_ANALISE, esc = window.HUB.esc;
  const $ = s => document.querySelector(s);
  if (window.pdfjsLib) window.pdfjsLib.GlobalWorkerOptions.workerSrc = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";

  const PRECOS = { "gpt-5.4-mini": [0.75, 4.5], "gpt-5.5": [5, 30] }; /* US$ por milhão de tokens, estimativa de referência */
  const LIMITE_IA = 180000; /* tokens de autos enviados no aprofundamento */
  const MODELO_DOCX = "modelo-estudo.docx";
  const K_CHAVE = "hub_openai_chave", K_REF = "ec_referencias", K_ESTUDO = "ec_estudo";
  const ler = k => { try { return localStorage.getItem(k); } catch (e) { return null; } };
  const gravar = (k, v) => { try { v == null || v === "" ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch (e) { /* ignora */ } };
  const E = { arquivos: [], leitura: null, refs: [], cancelLeitura: false, ctrl: null, md: "", cab: null, analise: null };

  /* ------------------------------------------------------------------ passo 1: leitura */
  const zona = $("#zona"), inp = $("#arquivos");
  zona.onclick = () => inp.click();
  zona.onkeydown = e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); inp.click(); } };
  zona.ondragover = e => { e.preventDefault(); zona.classList.add("sobre"); };
  zona.ondragleave = () => zona.classList.remove("sobre");
  zona.ondrop = e => { e.preventDefault(); zona.classList.remove("sobre"); adicionar([...e.dataTransfer.files]); };
  inp.onchange = () => { adicionar([...inp.files]); inp.value = ""; };
  function adicionar(fs) {
    const pdfs = fs.filter(f => /\.pdf$/i.test(f.name) || f.type === "application/pdf");
    if (pdfs.length < fs.length) window.HUB.toast("Apenas arquivos PDF são aceitos.");
    E.arquivos.push(...pdfs); E.leitura = null; listar(); atualizar();
  }
  function listar() {
    $("#listaArq").innerHTML = E.arquivos.map((f, i) => '<div class="arq"><span class="nm">' + esc(f.name) + '</span><span class="pequeno mudo">' + (f.size / 1048576).toFixed(1) + ' MB</span><button type="button" data-i="' + i + '" aria-label="Remover ' + esc(f.name) + '">×</button></div>').join("");
    $("#listaArq").querySelectorAll("button").forEach(b => b.onclick = () => { E.arquivos.splice(+b.dataset.i, 1); E.leitura = null; listar(); atualizar(); });
    $("#ler").disabled = !E.arquivos.length;
  }
  $("#ler").onclick = async () => {
    E.cancelLeitura = false;
    $("#ler").disabled = true; $("#cancelarLeitura").hidden = false; $("#progLeitura").hidden = false; $("#kpisLeitura").hidden = true; $("#avisoLeitura").innerHTML = ""; $("#baixarTexto").hidden = true;
    const prog = (msg, f) => { $("#estadoLeitura").textContent = msg; if (f != null) $("#barraLeitura").style.width = Math.round(f * 100) + "%"; };
    try {
      E.leitura = await L.ler(E.arquivos, { prog, cancelado: () => E.cancelLeitura });
      prog("Leitura concluída.", 1);
      const r = E.leitura;
      $("#kpisLeitura").innerHTML = "<div><span>Páginas</span><b>" + r.paginas + "</b></div><div><span>Com OCR</span><b>" + r.ocr + "</b></div><div><span>Leitura precária</span><b>" + r.ilegiveis.length + "</b></div><div><span>Caracteres</span><b>" + Math.round(r.chars / 1000) + " mil</b></div>";
      $("#kpisLeitura").hidden = false; $("#baixarTexto").hidden = false;
      if (r.ilegiveis.length) $("#avisoLeitura").innerHTML = '<div class="aviso">Páginas de leitura precária, que serão tratadas como limitação da análise: ' + esc(r.ilegiveis.slice(0, 40).join(", ")) + (r.ilegiveis.length > 40 ? " e outras " + (r.ilegiveis.length - 40) : "") + ". Se forem relevantes, anexe uma cópia de melhor qualidade.</div>";
    } catch (e) { prog(e.message || String(e)); E.leitura = null; console.error(e); }
    finally { $("#ler").disabled = !E.arquivos.length; $("#cancelarLeitura").hidden = true; atualizar(); }
  };
  $("#cancelarLeitura").onclick = () => { E.cancelLeitura = true; };
  $("#baixarTexto").onclick = () => baixar(new Blob([E.leitura.texto], { type: "text/plain;charset=utf-8" }), "autos-texto-extraido.txt");

  /* ------------------------------------------------------------------ passo 2: referências (usadas no aprofundamento) */
  async function textoDe(f) {
    const buf = await f.arrayBuffer();
    if (/\.docx$/i.test(f.name)) { if (!window.mammoth) throw new Error("Leitor de Word indisponível."); return (await window.mammoth.extractRawText({ arrayBuffer: buf })).value; }
    if (/\.pdf$/i.test(f.name)) { const pdf = await window.pdfjsLib.getDocument({ data: new Uint8Array(buf) }).promise; const t = []; for (let i = 1; i <= pdf.numPages; i++) t.push((await (await pdf.getPage(i)).getTextContent()).items.map(x => x.str).join(" ")); return t.join("\n"); }
    return new TextDecoder().decode(buf);
  }
  $("#referencias").onchange = async e => {
    E.refs = [];
    for (const f of e.target.files) { try { E.refs.push({ nome: f.name, texto: (await textoDe(f)).replace(/\s+\n/g, "\n").trim().slice(0, 60000) }); } catch (err) { window.HUB.toast("Não foi possível ler " + f.name + "."); } }
    infoRef(); if ($("#lembrarRef").checked) gravar(K_REF, JSON.stringify(E.refs));
  };
  $("#lembrarRef").onchange = e => gravar(K_REF, e.target.checked && E.refs.length ? JSON.stringify(E.refs) : null);
  function infoRef() { $("#refInfo").textContent = E.refs.length ? E.refs.length + " estudo(s) de referência: " + E.refs.map(r => r.nome).join(", ") + ". Usados apenas no aprofundamento opcional." : ""; }
  try { const r = JSON.parse(ler(K_REF) || "null"); if (r && r.length) { E.refs = r; $("#lembrarRef").checked = true; infoRef(); } } catch (e) { /* ignora */ }

  /* ------------------------------------------------------------------ passo 3: estudo por regras */
  function caso() { return { autos: $("#autos").value.trim(), assistido: $("#assistido").value.trim(), condicao: $("#condicao").value, fase: $("#fase").value.trim(), perspectiva: $("#perspectiva").value, escopo: $("#escopo").value, orientacoes: $("#orientacoes").value.trim(), ilegiveis: E.leitura ? E.leitura.ilegiveis : [] }; }
  function cabecalho(c) {
    const fim = "Estudo de caso de uso interno, destinado a orientar a estratégia " + (c.perspectiva === "vitima" ? "da assistência à vítima" : "da defesa") + (c.fase ? ", na fase de " + c.fase : "") + ".";
    return { titulo: "Estudo de Caso Criminal", autos: c.autos, abertura: c.assistido ? "**" + c.assistido + "**, " + c.condicao + " nos autos em referência. " + fim : fim };
  }
  function progresso(msg, f) { $("#progGeracao").hidden = false; $("#estadoGeracao").textContent = msg; if (f != null) $("#barraGeracao").style.width = Math.round(f * 100) + "%"; }
  function render() { $("#folha").innerHTML = W.html(W.blocos(E.md), E.cab); $("#resultado").hidden = false; }
  function guardar() { try { sessionStorage.setItem(K_ESTUDO, JSON.stringify({ md: E.md, cab: E.cab })); } catch (e) { /* ignora */ } }
  $("#gerar").onclick = () => {
    if (!E.leitura) return;
    const c = caso();
    progresso("Analisando as peças dos autos…", 0.3);
    setTimeout(() => {
      try {
        E.analise = AN.analisar(E.leitura, c);
        E.cab = cabecalho(c); E.md = AN.redigir(E.analise);
        render(); guardar();
        progresso("Estudo concluído: " + E.analise.itens.length + " peças identificadas, " + E.analise.teses.length + " teses e " + E.analise.questoes.length + " questões processuais.", 1);
        $("#avisoGeracao").innerHTML = c.perspectiva === "vitima" ? '<div class="aviso info">O motor da plataforma analisa os autos sob a ótica da defesa. Para a perspectiva da vítima, leia as teses como os pontos que a defesa tende a explorar.</div>' : "";
        $("#resultado").scrollIntoView({ behavior: "smooth", block: "start" });
      } catch (e) { console.error(e); progresso("Não foi possível gerar o estudo: " + (e.message || e)); }
      atualizar();
    }, 30);
  };

  /* ------------------------------------------------------------------ aprofundamento opcional (OpenAI) */
  const salva = ler(K_CHAVE); if (salva) { $("#chave").value = salva; $("#lembrarChave").checked = true; }
  $("#lembrarChave").onchange = e => gravar(K_CHAVE, e.target.checked ? $("#chave").value.trim() : null);
  $("#chave").oninput = () => { if ($("#lembrarChave").checked) gravar(K_CHAVE, $("#chave").value.trim()); atualizar(); };
  ["#consentimento", "#modelo", "#esforco"].forEach(s => $(s).addEventListener("change", atualizar));
  /* trechos dos autos para o aprofundamento: as páginas das peças identificadas e as dos sinais relevantes, até o limite */
  function autosParaIA() {
    const lim = LIMITE_IA * 3;
    if (E.leitura.texto.length <= lim) return { texto: E.leitura.texto, parcial: false };
    const A = E.analise, escolhidas = new Set();
    A.itens.forEach(it => it.pgs.forEach(p => escolhidas.add(p)));
    Object.values(A.S).forEach(l => l.forEach(x => escolhidas.add(x.pg)));
    const out = []; let tam = 0;
    for (const p of A.pgs) if (escolhidas.has(p)) { const b = "[[" + p.ref + "]]\n" + p.texto; if (tam + b.length > lim) break; out.push(b); tam += b.length; }
    return { texto: out.join("\n\n"), parcial: true };
  }
  function atualizar() {
    $("#gerar").disabled = !E.leitura;
    const pode = !!(E.md && E.leitura && $("#chave").value.trim() && $("#consentimento").checked);
    $("#aprofundar").disabled = !pode;
    if (E.leitura && E.md) {
      const [pe, ps] = PRECOS[$("#modelo").value] || [1, 5];
      const tin = Math.min(E.leitura.chars, LIMITE_IA * 3) / 3 + E.md.length / 3 + 5000;
      $("#custo").hidden = false; $("#custo").textContent = "Estimativa de custo na OpenAI: cerca de " + Math.round(tin / 1000) + " mil tokens de entrada e até 30 mil de saída, da ordem de US$ " + ((tin * pe + 30000 * ps) / 1e6).toFixed(2) + ", conforme o modelo. O raciocínio do modelo pode elevar esse valor.";
    } else $("#custo").hidden = true;
  }
  $("#aprofundar").onclick = async () => {
    const chave = $("#chave").value.trim(), modelo = $("#modelo").value, c = caso();
    const a = autosParaIA();
    const sistema = P.SISTEMA + (E.refs.length ? "\n\nEstudos de caso anteriores considerados exemplares pela equipe (referência de padrão, estrutura e tom; não reproduza os seus fatos):\n\n" + E.refs.map(r => "<estudo_de_referencia>\n" + r.texto + "\n</estudo_de_referencia>").join("\n\n") : "");
    const usuario = "<autos" + (a.parcial ? ' parcial="sim"' : "") + ">\n" + a.texto + "\n</autos>\n\n<pre_estudo_da_plataforma>\n" + E.md + "\n</pre_estudo_da_plataforma>\n\n" + P.pedido(c, "", "autos") + "\n\nUse o pré-estudo da plataforma como ponto de partida: confirme ou corrija cada apontamento à luz dos autos, aprofunde a análise e acrescente o que ele não identificou." + (a.parcial ? " Os autos foram enviados parcialmente (as páginas das peças identificadas); registre essa limitação." : "");
    E.ctrl = new AbortController();
    $("#aprofundar").disabled = true; $("#cancelarGeracao").hidden = false;
    progresso("Enviando à OpenAI…", 0.05);
    const anterior = E.md; let novo = "";
    try {
      const r = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST", signal: E.ctrl.signal,
        headers: { "Authorization": "Bearer " + chave, "Content-Type": "application/json" },
        body: JSON.stringify({ model: modelo, stream: true, reasoning_effort: $("#esforco").value, max_completion_tokens: 32000, messages: [{ role: "system", content: sistema }, { role: "user", content: usuario }] })
      });
      if (!r.ok) {
        let msg = ""; try { const j = await r.json(); msg = j.error && (j.error.code === "insufficient_quota" || j.error.code === "credit_balance_exhausted") ? "A conta da OpenAI está sem créditos. Adicione créditos em platform.openai.com." : (j.error && j.error.message) || ""; } catch (e) { /* ignora */ }
        throw new Error(r.status === 401 ? "Chave da OpenAI inválida." : r.status === 429 && !msg ? "Limite de uso da OpenAI atingido; tente mais tarde." : msg || "Erro da OpenAI (" + r.status + ").");
      }
      const leitor = r.body.getReader(), dec = new TextDecoder(); let buf = "", ultimo = 0, motivo = "";
      for (;;) {
        const { done, value } = await leitor.read(); if (done) break;
        buf += dec.decode(value, { stream: true });
        let i;
        while ((i = buf.indexOf("\n")) >= 0) {
          const linha = buf.slice(0, i).trim(); buf = buf.slice(i + 1);
          if (!linha.startsWith("data:")) continue;
          const dado = linha.slice(5).trim(); if (dado === "[DONE]") continue;
          try { const j = JSON.parse(dado), ch = j.choices && j.choices[0]; if (ch && ch.delta && ch.delta.content) novo += ch.delta.content; if (ch && ch.finish_reason) motivo = ch.finish_reason; } catch (e) { /* fragmento */ }
        }
        if (novo && Date.now() - ultimo > 1200) { ultimo = Date.now(); E.md = novo; render(); progresso("Redigindo: " + Math.round(novo.length / 1000) + " mil caracteres…", Math.min(0.95, 0.1 + novo.length / 200000)); }
      }
      if (!novo.trim()) throw new Error("A OpenAI não devolveu texto.");
      E.md = novo; render(); guardar();
      progresso("Estudo aprofundado concluído." + (motivo === "length" ? " O texto atingiu o limite de extensão e pode estar incompleto no final." : ""), 1);
    } catch (e) {
      console.error(e);
      if (!novo) { E.md = anterior; render(); }
      progresso(e.name === "AbortError" ? "Aprofundamento interrompido." + (novo ? " O texto parcial está abaixo." : " O estudo da plataforma foi mantido.") : (e.message || String(e)) + " O estudo da plataforma foi mantido.");
      if (novo && e.name !== "AbortError") { E.md = anterior; render(); }
    } finally { E.ctrl = null; $("#cancelarGeracao").hidden = true; atualizar(); }
  };
  $("#cancelarGeracao").onclick = () => { if (E.ctrl) E.ctrl.abort(); };

  /* ------------------------------------------------------------------ resultado */
  function baixar(blob, nome) { const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = nome; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1500); }
  $("#baixarWord").onclick = async () => {
    try { const blob = await W.gerar(W.blocos(E.md), E.cab, MODELO_DOCX); baixar(blob, "Estudo de Caso" + (E.cab.autos ? " - " + E.cab.autos.replace(/[\\/:*?"<>|]+/g, "_") : "") + ".docx"); }
    catch (e) { window.HUB.toast(e.message || "Não foi possível gerar o Word.", 5000); }
  };
  $("#copiar").onclick = () => window.HUB_DOC.copiar($("#folha").innerText);

  try { const s = JSON.parse(sessionStorage.getItem(K_ESTUDO) || "null"); if (s && s.md) { E.md = s.md; E.cab = s.cab; render(); $("#avisoGeracao").innerHTML = '<div class="aviso info">Exibindo o último estudo gerado nesta aba.</div>'; } } catch (e) { /* ignora */ }
  window.EC_ESTADO = E;
  atualizar();
})();
