/* Audiência de custódia: anexa o processo, lê integralmente e elabora a peça.
   Com chave da Anthropic e autorização, a peça é redigida pelo Claude (método da skill audiencia-de-custodia); sem elas,
   a ferramenta gera um rascunho por regras (motor.js), sem custo. Carregado como módulo, depois dos scripts clássicos. */
import Anthropic from "https://cdn.jsdelivr.net/npm/@anthropic-ai/sdk@1.1.0/+esm";
(function () {
  "use strict";
  const M = window.CUST_MOTOR, PR = window.CUST_PROMPT, P = window.TPC_PECA, esc = window.HUB.esc;
  const $ = s => document.querySelector(s);
  if (window.pdfjsLib) window.pdfjsLib.GlobalWorkerOptions.workerSrc = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
  const ler = k => { try { return localStorage.getItem(k); } catch (e) { return null; } };
  const gravar = (k, v) => { try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch (e) { /* armazenamento indisponível */ } };
  const K_CHAVE = "hub_claude_chave", K_CONS = "custodia_consentimento_anthropic"; /* a mesma chave do organizador */
  const PRECOS = { "claude-opus-5-5": [4, 20], "claude-sonnet-5-5": [2, 10] }; /* US$ por milhão de tokens: entrada, saída */
  const SAIDA = 25000; /* estimativa de tokens de saída (texto e raciocínio) */
  const E = { leitura: null, pgs: null, extr: null, texto: "", req: null, rot: null, peca: "req", ctrl: null, fonte: "" };

  /* ------------------------------------------------------------------ configuração */
  $("#advs").innerHTML = P.ADVOGADOS.map(a => '<label class="check"><input type="checkbox" data-adv="' + a.id + '"' + (a.id === "vinicius" ? " checked" : "") + "> " + esc(a.nome) + ' <span class="dica">OAB/' + a.uf + " " + a.oab + "</span></label>").join("");
  const salva = ler(K_CHAVE); if (salva) { $("#chave").value = salva; $("#lembrarChave").checked = true; }
  $("#consentimento").checked = ler(K_CONS) === "1";
  $("#lembrarChave").onchange = e => gravar(K_CHAVE, e.target.checked ? $("#chave").value.trim() : null);
  $("#chave").oninput = () => { if ($("#lembrarChave").checked) gravar(K_CHAVE, $("#chave").value.trim()); estado(); };
  $("#consentimento").onchange = e => { gravar(K_CONS, e.target.checked ? "1" : null); estado(); };
  ["#modelo", "#esforco"].forEach(s => $(s).addEventListener("change", estado));
  const usaIA = () => !!($("#chave").value.trim() && $("#consentimento").checked);
  const advogados = () => P.ADVOGADOS.filter(a => document.querySelector('[data-adv="' + a.id + '"]').checked);
  function estado() {
    $("#elaborar").disabled = !E.leitura || !!E.ctrl;
    $("#elaborar").textContent = usaIA() ? "Elaborar peça" : "Elaborar rascunho (sem IA)";
    $("#motorInfo").textContent = usaIA() ? "A peça será redigida pelo " + $("#modelo").selectedOptions[0].textContent.replace(/\s*\(.*$/, "") + ", da Anthropic, a partir da leitura integral do processo." : "Sem a chave da Anthropic e a autorização (em Opções), a ferramenta gera um rascunho por regras, sem custo, que deve ser complementado pela equipe.";
    if (E.texto && usaIA()) {
      const [pe, ps] = PRECOS[$("#modelo").value] || [1, 5], tin = (Math.min(E.texto.length, LIMITE) + PR.SISTEMA.length) / 3.2;
      $("#custo").textContent = "Estimativa por peça: cerca de " + Math.round(tin / 1000) + " mil tokens de entrada e até " + Math.round(SAIDA / 1000) + " mil de saída, entre texto e raciocínio, da ordem de US$ " + ((tin * pe + SAIDA * ps) / 1e6).toFixed(2) + ". Processos mais longos ou o raciocínio alto podem elevar esse valor.";
    } else $("#custo").textContent = "";
  }

  /* ------------------------------------------------------------------ leitura do processo */
  const LIMITE = 600000; /* caracteres enviados à IA (cerca de 190 mil tokens; o modelo admite 1 milhão) */
  const RUIDO = /^(número do documento|https?:\/\/pje|assinado eletronicamente|num\. \d|fl\.?$|página \d+ de \d+$)/i;
  function textoParaIA(pgs) {
    const out = []; let tam = 0;
    for (const p of pgs) {
      const t = String(p.texto || "").split("\n").map(l => l.trim()).filter(l => l && !RUIDO.test(l)).join("\n");
      const b = "[[" + p.ref + "]]\n" + t;
      if (tam + b.length > LIMITE) return { texto: out.join("\n\n"), parcial: true };
      out.push(b); tam += b.length;
    }
    return { texto: out.join("\n\n"), parcial: false };
  }
  $("#anexo").addEventListener("change", async e => {
    const fs = [...e.target.files]; e.target.value = ""; if (!fs.length) return;
    if (!window.EC_LEITOR || !window.EC_ANALISE) { $("#leituraEstado").textContent = "O leitor de PDF não foi carregado. Recarregue a página."; return; }
    try {
      $("#leituraEstado").textContent = "Lendo o processo…";
      const lt = await window.EC_LEITOR.ler(fs, { prog: (m, fr) => { $("#leituraEstado").textContent = m + (fr != null ? " (" + Math.round(fr * 100) + "%)" : ""); } });
      const pgs = window.EC_ANALISE.paginas(lt), itens = window.EC_ANALISE.pecas(pgs), crimes = window.EC_ANALISE.crimes(pgs, itens);
      E.leitura = lt; E.pgs = pgs; E.extr = M.extrair(pgs, itens, crimes);
      const t = textoParaIA(pgs); E.texto = t.texto; E.parcial = t.parcial;
      const s = E.extr.sug;
      $("#leituraEstado").innerHTML = "<b>" + esc(fs.map(f => f.name).join(", ")) + "</b>: " + pgs.length + (pgs.length === 1 ? " página lida" : " páginas lidas") + (pgs.some(p => p.ocr) ? ", com reconhecimento de texto nas digitalizadas" : "") + "." + (s.nome ? " Autuado: " + esc(s.nome) + "." : "") + (s.autos ? " Autos nº " + esc(s.autos) + "." : "") + (s.juizo ? " Juízo: " + esc(s.juizo) + "." : "") + (E.parcial ? " O processo é extenso: será enviada à IA a parte inicial, até o limite." : "");
    } catch (x) { $("#leituraEstado").textContent = x.message || "Não foi possível ler o PDF."; }
    estado();
  });

  /* ------------------------------------------------------------------ texto marcado da IA -> blocos */
  function blocosDe(txt) {
    const b = []; let tab = null;
    const fechaTab = () => { if (tab && tab.length) { const [cab, ...linhas] = tab; b.push({ t: "tab", cab, linhas: linhas.length ? linhas : [cab.map(() => "")] }); } tab = null; };
    for (const bruto of String(txt).split("\n")) {
      const l = bruto.trim();
      if (/^\|.*\|$/.test(l)) { const cel = l.slice(1, -1).split("|").map(c => c.trim()); if (cel.every(c => /^:?-{2,}:?$/.test(c))) continue; (tab = tab || []).push(cel); continue; }
      fechaTab();
      if (!l) continue;
      const lim = s => s.replace(/\*\*/g, "").trim();
      if (/^@end\s/i.test(l)) b.push({ t: "end", texto: lim(l.slice(4)) });
      else if (/^@ref\s/i.test(l)) b.push({ t: "ref", texto: lim(l.slice(4)) });
      else if (/^@fecho\s/i.test(l)) b.push({ t: "fecho", texto: lim(l.slice(6)) });
      else if (/^@data\s/i.test(l)) b.push({ t: "data", texto: lim(l.slice(5)) });
      else if (/^#{1,3}\s/.test(l)) b.push({ t: "h", texto: lim(l.replace(/^#{1,3}\s+/, "")) });
      else if (/^>\s?/.test(l)) b.push({ t: "cit", texto: lim(l.replace(/^>\s?/, "")).replace(/^["“]|["”]$/g, "") });
      else if (/^@/.test(l)) continue;
      else b.push({ t: "p", r: lim(l) });
    }
    fechaTab();
    advogados().forEach(a => b.push({ t: "ass", nome: a.nome, linhas: ["OAB/" + a.uf + " " + a.oab] }));
    return b;
  }

  /* ------------------------------------------------------------------ rascunho por regras */
  function dadosRegras() {
    const s = E.extr.sug, f = {};
    ["notaCulpa", "silencio", "defensor", "familia", "corpoDelito", "agressao", "filhos", "domicilio", "busca", "reconhecimento", "confissaoInformal"].forEach(k => { if (s[k] != null) f[k] = s[k]; });
    const local = s.comarca ? s.comarca + "/MG" : "Belo Horizonte/MG";
    return {
      nome: s.nome || "", g: "m", autos: s.autos || "", juizo: s.juizo || "", juizG: "m", especie: "II",
      prisao: s.prisao || {}, comunicacao: s.comunicacao || {}, custodia: {}, crimes: E.extr.crimes.map(c => ({ rot: c.rot, min: c.min, max: c.max, violencia: c.violencia, d: c.d, a: c.a, contravencao: c.contravencao })),
      flags: f, pessoal: { primario: !!s.primario, reincidente: !!s.reincidente, familia: s.filhos === "sim" }, risco: { vd: !!s.vd, armaRestrito: !!s.armaRestrito },
      economia: "media", excludente: "nao", sintese: "", cautelares: [], local, advogados: advogados()
    };
  }

  /* ------------------------------------------------------------------ elaboração */
  function progresso(t, fr) { $("#progresso").textContent = t; $("#barra").hidden = fr == null; if (fr != null) $("#barra i").style.width = Math.round(fr * 100) + "%"; }
  $("#elaborar").onclick = async () => {
    if (!E.leitura) return;
    if (ed.editado() && !confirm("Elaborar novamente descarta as edições feitas no texto. Continuar?")) return;
    ed.descartar(); $("#editar").textContent = "Editar texto"; $("#descartar").hidden = true;
    E.rot = M.roteiro(dadosRegras(), M.analisar(dadosRegras()));
    $("#pecaBloco").hidden = false; abrir("req");
    if (!usaIA()) {
      const d = dadosRegras(); E.req = M.requerimento(d, M.analisar(d)); E.fonte = "regras";
      mostrar(); progresso("Rascunho por regras gerado. Revise e complemente: a elaboração completa, no padrão da skill, exige a chave da Anthropic (em Opções).", null);
      $("#pecaBloco").scrollIntoView({ behavior: "smooth" }); return;
    }
    const s = E.extr.sug, hoje = P.dataExtenso(new Date());
    const usuario = "<processo" + (E.parcial ? ' parcial="sim"' : "") + ">\n" + E.texto + "\n</processo>\n\n" + PR.pedido({ advogados: advogados().map(a => a.nome + " (OAB/" + a.uf + " " + a.oab + ")").join(", "), local: s.comarca ? s.comarca + "/MG" : "", hoje, parcial: E.parcial, orientacao: $("#orientacao").value.trim() });
    E.ctrl = new AbortController(); estado(); $("#cancelar").hidden = false;
    progresso("Enviando o processo à Anthropic…", 0.04);
    let txt = "", motivo = "";
    try {
      const cli = new Anthropic({ apiKey: $("#chave").value.trim(), dangerouslyAllowBrowser: true, maxRetries: 3 });
      const fluxo = cli.beta.messages.stream({
        model: $("#modelo").value, max_tokens: 64000,
        thinking: { type: "adaptive" }, output_config: { effort: $("#esforco").value },
        betas: ["server-side-fallback-2026-07-01"], fallbacks: "default", /* recusa indevida do classificador: a própria API refaz em outro modelo */
        system: PR.SISTEMA, messages: [{ role: "user", content: usuario }]
      }, { signal: E.ctrl.signal });
      let ultimo = 0;
      for await (const ev of fluxo) {
        if (ev.type === "content_block_start" && ev.content_block.type === "thinking" && !txt) progresso("O Claude está lendo o processo e estruturando a análise…", 0.1);
        if (ev.type !== "content_block_delta" || ev.delta.type !== "text_delta") continue;
        txt += ev.delta.text;
        if (Date.now() - ultimo > 900) { ultimo = Date.now(); E.req = blocosDe(txt); E.fonte = "ia"; if (E.peca === "req") mostrar(); progresso("Redigindo a peça: " + Math.round(txt.length / 1000) + " mil caracteres…", Math.min(0.95, 0.15 + txt.length / 45000)); }
      }
      const fim = await fluxo.finalMessage(); motivo = fim.stop_reason;
      if (motivo === "refusal") throw new Error("O modelo recusou a elaboração desta peça" + (txt ? "; o texto parcial foi descartado" : "") + ".");
      if (!txt.trim()) throw new Error("A Anthropic não devolveu texto.");
      E.req = blocosDe(txt); E.fonte = "ia"; mostrar();
      progresso("Peça elaborada. Revise cada informação com o processo antes de protocolar." + (motivo === "max_tokens" ? " O texto atingiu o limite de extensão e pode estar incompleto no final." : ""), null);
    } catch (x0) {
      const x = x0 instanceof Anthropic.APIUserAbortError ? Object.assign(new Error(""), { name: "AbortError" }) : x0 instanceof Anthropic.APIError || x0 instanceof Anthropic.APIConnectionError ? new Error(erroApi(x0)) : x0;
      if (motivo === "refusal") txt = "";
      if (x.name === "AbortError") progresso("Elaboração interrompida." + (txt ? " O texto parcial está abaixo." : ""), null);
      else {
        progresso((x.message || String(x)) + " Foi gerado um rascunho por regras para não perder o trabalho.", null);
        if (!txt) { const d = dadosRegras(); E.req = M.requerimento(d, M.analisar(d)); E.fonte = "regras"; mostrar(); }
      }
    } finally { E.ctrl = null; $("#cancelar").hidden = true; estado(); }
  };
  $("#cancelar").onclick = () => { if (E.ctrl) E.ctrl.abort(); };
  function erroApi(e) {
    const msg = String(e.message || "");
    if (e instanceof Anthropic.AuthenticationError) return "Chave da API da Anthropic inválida.";
    if (/credit balance/i.test(msg)) return "A conta da Anthropic está sem créditos. Adicione créditos em console.anthropic.com, em Billing.";
    if (e instanceof Anthropic.PermissionDeniedError) return "A chave da Anthropic não tem permissão para este modelo.";
    if (e instanceof Anthropic.RateLimitError) return "Limite de uso da API da Anthropic atingido; aguarde alguns minutos e tente novamente.";
    if (e instanceof Anthropic.APIConnectionError) return "Falha de conexão com a API da Anthropic.";
    if (e.status === 529 || e.status === 503) return "A API da Anthropic está sobrecarregada no momento; tente novamente em alguns minutos.";
    return "Erro da API da Anthropic" + (e.status ? " (" + e.status + ")" : "") + (msg ? ": " + msg.replace(/^\d{3}\s*/, "").slice(0, 200) : "") + ".";
  }

  /* ------------------------------------------------------------------ peça */
  const ed = P.editor($("#folha"), { aviso: () => { $("#descartar").hidden = false; } });
  function mostrar() {
    const bl = E.peca === "req" ? E.req : E.rot;
    $("#avisos").innerHTML = E.peca === "req" && E.fonte === "regras" ? '<div class="aviso">Rascunho por regras: a estrutura e os fundamentos estão prontos, mas a narrativa dos fatos e a análise das particularidades do caso devem ser complementadas. Para a peça completa, configure a chave da Anthropic em Opções.</div>' : E.peca === "rot" ? '<div class="aviso">Roteiro gerado por regras a partir dos elementos identificados no processo.</div>' : "";
    ed.mostrar(bl || []);
  }
  function abrir(qual) { E.peca = qual; document.querySelectorAll("[data-peca]").forEach(x => x.setAttribute("aria-selected", String(x.dataset.peca === qual))); }
  document.querySelectorAll("[data-peca]").forEach(b => b.addEventListener("click", () => {
    if (ed.editado() && !confirm("Trocar de documento descarta as edições feitas no texto. Continuar?")) return;
    ed.descartar(); $("#editar").textContent = "Editar texto"; $("#descartar").hidden = true; abrir(b.dataset.peca); mostrar();
  }));
  $("#advs").addEventListener("change", () => { if (E.fonte === "regras" && E.req) { const d = dadosRegras(); E.req = M.requerimento(d, M.analisar(d)); mostrar(); } });
  $("#editar").onclick = () => { const on = !ed.editando(); ed.editar(on); $("#editar").textContent = on ? "Concluir edição" : "Editar texto"; $("#descartar").hidden = !ed.editado(); };
  $("#descartar").onclick = () => { if (!confirm("Descartar as edições feitas no texto?")) return; ed.descartar(); $("#editar").textContent = "Editar texto"; $("#descartar").hidden = true; mostrar(); };
  $("#baixar").onclick = async () => { const n = (E.extr && E.extr.sug.nome) || "autuado"; try { P.baixar(await P.docx(ed.blocos()), (E.peca === "req" ? "Liberdade provisória - " : "Roteiro da audiência de custódia - ") + n); } catch (x) { window.HUB.toast(x.message || "Não foi possível gerar o Word.", 5000); } };
  $("#copiar").onclick = () => window.HUB_DOC.copiar(P.texto(ed.blocos()));

  estado();
  window.CUST_ESTADO = { E, blocosDe };
})();
