/* Diagnóstico patrimonial e sucessório: formulário, panorama e relatório.
   O texto por regras (motor.js) é gerado na hora, sem envio de dados. Com chave da Anthropic e autorização, o Claude
   redige a análise a partir dos mesmos números. Carregado como módulo, depois dos scripts clássicos. */
import Anthropic from "https://cdn.jsdelivr.net/npm/@anthropic-ai/sdk@1.1.0/+esm";
(function () {
  "use strict";
  const M = window.PAT_MOTOR, PR = window.PAT_PROMPT, P = window.TPC_PECA, esc = window.HUB.esc;
  const $ = s => document.querySelector(s), $$ = s => [...document.querySelectorAll(s)];
  const ler = k => { try { return localStorage.getItem(k); } catch (e) { return null; } };
  const gravar = (k, v) => { try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch (e) { /* armazenamento indisponível */ } };
  const K_CHAVE = "hub_claude_chave", K_CONS = "patrimonio_consentimento_anthropic", K_RASC = "patrimonio_rascunho";
  const PRECOS = { "claude-opus-5-5": [4, 20], "claude-sonnet-5-5": [2, 10] }, SAIDA = 22000;
  const E = { r: null, d: null, blocos: null, fonte: "regras", ctrl: null, iaDados: "" };

  /* ------------------------------------------------------------------ listas dinâmicas */
  const SIMNAO = '<option value="">Selecione</option><option value="sim">Sim</option><option value="nao">Não</option>';
  const REG = '<option value="">Selecione</option>' + M.REGIMES.map(x => "<option>" + esc(x) + "</option>").join("");
  const UFS = "AC AL AP AM BA CE DF ES GO MA MT MS MG PA PB PR PE PI RJ RN RS RO RR SC SP SE TO".split(" ");
  const LISTAS = {
    filhos: { rot: "Filho", campos: [["nome", "Nome", "text", 2], ["idade", "Idade", "number"], ["regime", "Estado civil e regime", "sel:" + REG], ["incapaz", "Incapaz ou com deficiência?", "sel:" + SIMNAO]] },
    imoveis: { rot: "Imóvel", campos: [["desc", "Descrição e localidade", "text", 2], ["tipo", "Tipo", "sel:<option>Residência da família</option><option>Residencial (locação ou outro uso)</option><option>Comercial</option><option>Rural</option><option>Terreno ou lote</option>"], ["uf", "UF", "sel:" + UFS.map(u => "<option" + (u === "MG" ? " selected" : "") + ">" + u + "</option>").join("")], ["irpf", "Valor no IRPF (R$)", "moeda"], ["mercado", "Valor de mercado (R$)", "moeda"], ["alugado", "Alugado?", "sel:<option value=\"nao\">Não</option><option value=\"sim\">Sim</option><option value=\"parcial\">Parcialmente</option>"], ["aluguel", "Aluguel mensal (R$)", "moeda"], ["matricula", "Matrícula, cartório e inscrição", "text", 2], ["titular", "Titular(es) no registro", "text", 2], ["onus", "Ônus e restrições (matrícula)", "text", 4]] },
    empresas: { rot: "Empresa", campos: [["nome", "Razão social", "text", 2], ["cnpj", "CNPJ", "text"], ["atividade", "Atividade principal", "text"], ["natureza", "Natureza jurídica", "sel:<option value=\"\">Selecione</option><option>Sociedade limitada</option><option>Sociedade limitada unipessoal</option><option>Sociedade anônima</option><option>Empresário individual</option><option>Holding patrimonial</option><option>Produtor rural</option>"], ["regime", "Regime tributário", "sel:<option value=\"\">Selecione</option><option>Simples Nacional</option><option>Lucro presumido</option><option>Lucro real</option><option>Pessoa física (rural)</option>"], ["faturamento", "Faturamento anual (R$)", "moeda"], ["participacao", "Participação da família (%)", "number"], ["pl", "Patrimônio líquido da participação (R$)", "moeda"], ["mercado", "Valor de mercado da participação (R$)", "moeda"], ["dividendos", "Lucros distribuídos por ano (R$)", "moeda"], ["dividas", "Possui dívidas relevantes?", "sel:" + SIMNAO], ["valorDividas", "Valor das dívidas (R$)", "moeda"], ["naturezaDividas", "Natureza das dívidas", "text", 2]] }
  };
  function campoHtml([k, rot, tipo, span]) {
    const st = span ? ' style="grid-column:span ' + span + '"' : "";
    if (tipo.startsWith("sel:")) return '<label class="campo"' + st + ">" + esc(rot) + '<select data-c="' + k + '">' + tipo.slice(4) + "</select></label>";
    if (tipo === "moeda") return '<label class="campo"' + st + ">" + esc(rot) + '<input type="text" inputmode="numeric" class="moeda" data-c="' + k + '"></label>';
    return '<label class="campo"' + st + ">" + esc(rot) + '<input type="' + tipo + '"' + (tipo === "number" ? ' min="0"' : "") + ' data-c="' + k + '"></label>';
  }
  function adicionar(lista, valores) {
    const L = LISTAS[lista], el = document.createElement("div"); el.className = "item"; el.dataset.lista = lista;
    el.innerHTML = '<div class="item-cab"><span data-rot></span><button type="button" class="x" aria-label="Remover">×</button></div><div class="grade g4">' + L.campos.map(campoHtml).join("") + "</div>";
    el.querySelector(".x").onclick = () => { el.remove(); renumerar(lista); mudou(); };
    $("#" + lista).appendChild(el);
    if (valores) Object.keys(valores).forEach(k => { const c = el.querySelector('[data-c="' + k + '"]'); if (c && valores[k] != null) c.value = valores[k]; });
    renumerar(lista); return el;
  }
  function renumerar(lista) { $$("#" + lista + " .item").forEach((el, i) => { el.querySelector("[data-rot]").textContent = LISTAS[lista].rot + " " + (i + 1); }); }
  $$("[data-add]").forEach(b => b.addEventListener("click", () => { adicionar(b.dataset.add).querySelector("input,select").focus(); mudou(); }));

  /* ------------------------------------------------------------------ campos fixos */
  $("#regimeCasal").innerHTML = REG;
  $("#objetivos").innerHTML = M.OBJETIVOS.map(([k, r]) => '<label class="check"><input type="checkbox" data-obj="' + k + '"> ' + esc(r) + "</label>").join("");
  $("#premissas").innerHTML = Object.keys(M.PREMISSAS).map(k => { const p = M.PREMISSAS[k]; return '<label class="campo" style="grid-column:span 2">' + esc(p.r) + '<input type="text" inputmode="decimal" data-prem="' + k + '" placeholder="' + String(p.v).replace(".", ",") + '">' + (p.dica ? '<span class="dica">' + esc(p.dica) + "</span>" : "") + "</label>"; }).join("");
  $("#advs").innerHTML = P.ADVOGADOS.map(a => '<label class="check"><input type="checkbox" data-adv="' + a.id + '"' + (a.id === "vinicius" ? " checked" : "") + "> " + esc(a.nome) + ' <span class="dica">OAB/' + a.uf + " " + a.oab + "</span></label>").join("");
  const fmtMoeda = el => { const v = M.num(el.value); el.value = v ? Math.round(v).toLocaleString("pt-BR") : ""; };
  document.addEventListener("focusout", e => { if (e.target.classList && e.target.classList.contains("moeda")) { fmtMoeda(e.target); mudou(); } });

  function coletar() {
    const d = { cliente: {}, casal: {}, fin: {}, sit: {}, prem: {}, objetivos: [], obs: "" };
    $$("[data-k]").forEach(el => { const [a, b] = el.dataset.k.split("."); if (b) d[a][b] = el.value.trim(); else d[a] = el.value.trim(); });
    Object.keys(LISTAS).forEach(l => { d[l] = $$("#" + l + " .item").map(it => { const o = {}; it.querySelectorAll("[data-c]").forEach(c => { o[c.dataset.c] = c.value.trim(); }); return o; }); });
    $$("[data-prem]").forEach(el => { if (el.value.trim()) d.prem[el.dataset.prem] = el.value.trim(); });
    d.objetivos = $$("[data-obj]:checked").map(x => x.dataset.obj);
    return d;
  }
  function restaurar(d) {
    $$("[data-k]").forEach(el => { const [a, b] = el.dataset.k.split("."); const v = b ? (d[a] || {})[b] : d[a]; if (v != null) el.value = v; });
    Object.keys(LISTAS).forEach(l => { $("#" + l).innerHTML = ""; (d[l] || []).forEach(v => adicionar(l, v)); });
    $$("[data-prem]").forEach(el => { el.value = (d.prem || {})[el.dataset.prem] || ""; });
    $$("[data-obj]").forEach(x => { x.checked = (d.objetivos || []).includes(x.dataset.obj); });
  }
  $("#novo").onclick = () => {
    if (!confirm("Iniciar um novo diagnóstico apaga os dados preenchidos neste navegador. Continuar?")) return;
    gravar(K_RASC, null); restaurar({ filhos: [{}], imoveis: [{}], empresas: [] }); $$("[data-k]").forEach(el => { if (el.tagName === "SELECT") el.selectedIndex = 0; else el.value = ""; });
    E.fonte = "regras"; E.iaDados = ""; ed.descartar(); mudou();
  };

  /* ------------------------------------------------------------------ panorama */
  const CORES = ["var(--serie-1)", "var(--serie-2)", "var(--serie-3)", "var(--serie-4)", "var(--serie-5)", "var(--serie-6)"];
  const tabela = (cab, linhas, num) => '<table class="pt"><thead><tr>' + cab.map((c, i) => "<th" + (num && num.includes(i) ? ' style="text-align:right"' : "") + ">" + esc(c) + "</th>").join("") + "</tr></thead><tbody>" + linhas.map(l => "<tr>" + l.map((c, i) => "<td" + (num && num.includes(i) ? ' class="v"' : "") + ">" + esc(c) + "</td>").join("") + "</tr>").join("") + "</tbody></table>";
  function painel(r) {
    const t = r.tot, vazio = !t.bruto;
    $("#painelVazio").hidden = !vazio; $("#painelConteudo").hidden = vazio; if (vazio) return;
    const a = r.alugueis, h = r.holding;
    $("#placar").innerHTML = [
      ["Patrimônio bruto", M.brl(t.bruto), M.brl(t.declarado) + " declarados"],
      ["Sucessão sem planejamento", M.brl(r.semPlan.total), M.pct(r.semPlan.monte ? r.semPlan.total / r.semPlan.monte * 100 : 0, 1) + " do monte; " + M.brl(r.semPlan.totalFuturo) + " no progressivo"],
      ["Economia com a holding", h.imoveis ? M.brl(h.economia) : "—", h.imoveis ? M.brl(h.economiaFuturo) + " no cenário progressivo" : "Sem imóveis informados"],
      ["Aluguéis na holding (2033)", a.receita ? M.brl(a.fases[2].economia) : "—", !a.receita ? "Sem aluguéis informados" : a.fases[2].economia > 0 ? "Economia anual ante a pessoa física" : "A holding não reduz a carga anual"]
    ].map(([s, b, m]) => "<div><span>" + esc(s) + "</span><b>" + esc(b) + "</b><small>" + esc(m) + "</small></div>").join("");
    $("#comp").innerHTML = r.composicao.map((x, i) => '<i style="width:' + x.p.toFixed(2) + "%;background:" + CORES[i % CORES.length] + '" title="' + esc(x.n) + '"></i>').join("");
    $("#leg").innerHTML = r.composicao.map((x, i) => '<span style="--c:' + CORES[i % CORES.length] + '">' + esc(x.n) + " " + M.pct(x.p, 1) + "</span>").join("");
    $("#cenarios").innerHTML = tabela(["Cenário", "Custo da sucessão", "Observação"], r.cenarios.map(x => [x.n, M.brl(x.sucessao), x.obs]), [1]);
    $("#alugBloco").hidden = !a.receita;
    if (a.receita) $("#alugueis").innerHTML = tabela(["Momento", "Pessoa física", "Holding", "Holding com manutenção", "Diferença"], a.fases.map(x => [x.fase.rot, M.brl(x.pf), M.brl(x.pj), M.brl(x.pjManut), M.brl(x.economia)]), [1, 2, 3, 4]);
    $("#riscos").innerHTML = r.riscos.length ? r.riscos.map(x => '<div class="risco ' + x.n + '"><b>' + esc(x.t) + " · risco " + esc(x.n) + "</b>" + esc(x.x) + "</div>").join("") : '<p class="pequeno mudo">Nenhum risco relevante com os dados informados.</p>';
    $("#acoes").innerHTML = tabela(["Prioridade", "Medida"], r.acoes.map(x => [["", "Alta", "Média", "Complementar"][x.p], x.t]), []);
  }

  /* ------------------------------------------------------------------ relatório */
  const ed = P.editor($("#folha"), { aviso: () => { $("#descartar").hidden = false; } });
  const advogados = () => P.ADVOGADOS.filter(a => document.querySelector('[data-adv="' + a.id + '"]').checked);
  const opcRel = () => ({ dataTexto: P.dataExtenso(new Date()), local: $("#local").value.trim() || "Belo Horizonte/MG", advogados: advogados() });
  function regras() { return M.relatorio(E.d, E.r, opcRel()); }
  function mostrar() {
    $("#fonte").textContent = E.fonte === "ia" ? "Diagnóstico redigido pelo Claude" : "Diagnóstico por regras";
    $("#regras").hidden = E.fonte !== "ia" || !!E.ctrl;
    $("#avisos").innerHTML = E.fonte === "ia" && E.iaDados && E.iaDados !== JSON.stringify(E.d) ? '<div class="aviso">Os dados foram alterados depois da redação pelo Claude. Redija novamente para atualizar a análise, ou volte ao texto por regras.</div>' : "";
    ed.mostrar(E.blocos || []);
  }
  let timer = null;
  function mudou() { clearTimeout(timer); timer = setTimeout(atualizar, 250); }
  function atualizar() {
    E.d = coletar(); E.r = M.calcular(E.d); gravar(K_RASC, JSON.stringify(E.d));
    painel(E.r); estado();
    if (E.fonte === "regras" && !ed.editado() && !E.ctrl) { E.blocos = regras(); mostrar(); }
    else if (E.fonte === "ia") mostrar();
  }
  document.addEventListener("input", e => { if (e.target.closest("main") && !e.target.closest("#folha") && !e.target.closest("details.cfg #chave")) mudou(); });
  document.addEventListener("change", e => { if (e.target.closest("main") && !e.target.closest("#folha")) mudou(); });

  /* ------------------------------------------------------------------ Claude */
  const salva = ler(K_CHAVE); if (salva) { $("#chave").value = salva; $("#lembrarChave").checked = true; }
  $("#consentimento").checked = ler(K_CONS) === "1";
  $("#lembrarChave").onchange = e => gravar(K_CHAVE, e.target.checked ? $("#chave").value.trim() : null);
  $("#chave").oninput = () => { if ($("#lembrarChave").checked) gravar(K_CHAVE, $("#chave").value.trim()); estado(); };
  $("#consentimento").onchange = e => { gravar(K_CONS, e.target.checked ? "1" : null); estado(); };
  const usaIA = () => !!($("#chave").value.trim() && $("#consentimento").checked);
  function estado() {
    const tem = E.r && E.r.tot.bruto > 0;
    $("#elaborar").disabled = !tem || !!E.ctrl || !usaIA();
    $("#motorInfo").textContent = !tem ? "Preencha os bens da família para gerar o diagnóstico." : usaIA() ? "O " + $("#modelo").selectedOptions[0].textContent.replace(/\s*\(.*$/, "") + " redigirá a análise a partir dos números do panorama, sem alterá-los." : "O diagnóstico por regras abaixo já está pronto. Para a redação aprofundada pelo Claude, informe a chave e a autorização em Opções.";
    if (tem && usaIA()) { const [pe, ps] = PRECOS[$("#modelo").value] || [4, 20], tin = (PR.SISTEMA.length + JSON.stringify(M.paraIA(E.d, E.r)).length) / 3.2; $("#custo").textContent = "Estimativa por diagnóstico: cerca de " + Math.round(tin / 1000) + " mil tokens de entrada e até " + Math.round(SAIDA / 1000) + " mil de saída, entre texto e raciocínio, da ordem de US$ " + ((tin * pe + SAIDA * ps) / 1e6).toFixed(2) + "."; }
    else $("#custo").textContent = "";
  }
  ["#modelo", "#esforco"].forEach(s => $(s).addEventListener("change", estado));

  function linhaRuns(l) {
    const partes = l.split(/(\*\*[^*]+\*\*)/).filter(Boolean);
    return partes.length === 1 && !/^\*\*/.test(partes[0]) ? l : partes.map(x => /^\*\*.*\*\*$/.test(x) ? [x.slice(2, -2), "bo"] : [x, "n"]);
  }
  function blocosDe(txt) {
    const b = [], cab = regras(), ini = cab.slice(0, 2), fim = cab.slice(cab.findIndex(x => x.t === "sub" && /Premissas/.test(x.texto)));
    let tab = null;
    const fechaTab = () => { if (tab && tab.length) { const [c, ...linhas] = tab; b.push({ t: "tab", cab: c, linhas: linhas.length ? linhas : [c.map(() => "")] }); } tab = null; };
    for (const bruto of String(txt).split("\n")) {
      const l = bruto.trim();
      if (/^\|.*\|$/.test(l)) { const cel = l.slice(1, -1).split("|").map(c => c.trim().replace(/\*\*/g, "")); if (cel.every(c => /^:?-{2,}:?$/.test(c))) continue; (tab = tab || []).push(cel); continue; }
      fechaTab(); if (!l) continue;
      if (/^#\s/.test(l)) continue;
      if (/^##\s/.test(l)) b.push({ t: "h", texto: l.replace(/^##\s+/, "").replace(/\*\*/g, "") });
      else if (/^#{3,}\s/.test(l)) b.push({ t: "sub", texto: l.replace(/^#+\s+/, "").replace(/\*\*/g, "") });
      else b.push({ t: "p", r: linhaRuns(l.replace(/^[-*]\s+/, "")) });
    }
    fechaTab();
    return ini.concat(b, fim);
  }
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
  function progresso(t, fr) { $("#progresso").textContent = t; $("#barra").hidden = fr == null; if (fr != null) $("#barra i").style.width = Math.round(fr * 100) + "%"; }
  $("#elaborar").onclick = async () => {
    if (!E.r || !usaIA()) return;
    if (ed.editado() && !confirm("Redigir novamente descarta as edições feitas no texto. Continuar?")) return;
    ed.descartar(); $("#editar").textContent = "Editar texto"; $("#descartar").hidden = true;
    const dadosAntes = E.blocos, fonteAntes = E.fonte, snap = JSON.stringify(E.d);
    const usuario = PR.pedido({ dados: M.paraIA(E.d, E.r), hoje: P.dataExtenso(new Date()), orientacao: $("#orientacao").value.trim() });
    E.ctrl = new AbortController(); estado(); $("#cancelar").hidden = false; $("#regras").hidden = true;
    progresso("Enviando os dados à Anthropic…", 0.04);
    let txt = "", motivo = "";
    try {
      const cli = new Anthropic({ apiKey: $("#chave").value.trim(), dangerouslyAllowBrowser: true, maxRetries: 3 });
      const fluxo = cli.beta.messages.stream({
        model: $("#modelo").value, max_tokens: 64000,
        thinking: { type: "adaptive" }, output_config: { effort: $("#esforco").value },
        betas: ["server-side-fallback-2026-07-01"], fallbacks: "default",
        system: PR.SISTEMA, messages: [{ role: "user", content: usuario }]
      }, { signal: E.ctrl.signal });
      let ultimo = 0;
      for await (const ev of fluxo) {
        if (ev.type === "content_block_start" && ev.content_block.type === "thinking" && !txt) progresso("O Claude está analisando a estrutura patrimonial…", 0.1);
        if (ev.type !== "content_block_delta" || ev.delta.type !== "text_delta") continue;
        txt += ev.delta.text;
        if (Date.now() - ultimo > 900) { ultimo = Date.now(); E.blocos = blocosDe(txt); E.fonte = "ia"; E.iaDados = snap; mostrar(); progresso("Redigindo o diagnóstico: " + Math.round(txt.length / 1000) + " mil caracteres…", Math.min(0.95, 0.15 + txt.length / 40000)); }
      }
      const fim = await fluxo.finalMessage(); motivo = fim.stop_reason;
      if (motivo === "refusal") throw new Error("O modelo recusou a redação deste diagnóstico.");
      if (!txt.trim()) throw new Error("A Anthropic não devolveu texto.");
      E.blocos = blocosDe(txt); E.fonte = "ia"; E.iaDados = snap;
      progresso("Diagnóstico redigido. Confira os valores e as conclusões antes de entregar à família." + (motivo === "max_tokens" ? " O texto atingiu o limite de extensão e pode estar incompleto no final." : ""), null);
    } catch (x0) {
      const abortou = x0 instanceof Anthropic.APIUserAbortError || x0.name === "AbortError";
      const msg = abortou ? "" : x0 instanceof Anthropic.APIError || x0 instanceof Anthropic.APIConnectionError ? erroApi(x0) : (x0.message || String(x0));
      if (abortou && txt) progresso("Redação interrompida. O texto parcial está abaixo.", null);
      else { E.blocos = dadosAntes; E.fonte = fonteAntes; progresso(abortou ? "Redação interrompida." : msg + " O diagnóstico por regras continua disponível.", null); }
    } finally { E.ctrl = null; $("#cancelar").hidden = true; estado(); mostrar(); }
  };
  $("#cancelar").onclick = () => { if (E.ctrl) E.ctrl.abort(); };
  $("#regras").onclick = () => { if (ed.editado() && !confirm("Voltar ao texto por regras descarta as edições e o texto do Claude. Continuar?")) return; ed.descartar(); E.fonte = "regras"; E.iaDados = ""; E.blocos = regras(); $("#editar").textContent = "Editar texto"; $("#descartar").hidden = true; progresso("", null); mostrar(); };

  /* ------------------------------------------------------------------ edição e saída */
  $("#editar").onclick = () => { const on = !ed.editando(); ed.editar(on); $("#editar").textContent = on ? "Concluir edição" : "Editar texto"; $("#descartar").hidden = !ed.editado(); };
  $("#descartar").onclick = () => { if (!confirm("Descartar as edições feitas no texto?")) return; ed.descartar(); $("#editar").textContent = "Editar texto"; $("#descartar").hidden = true; if (E.fonte === "regras") E.blocos = regras(); mostrar(); };
  $("#baixar").onclick = async () => { const n = (E.d && (E.d.cliente.nome || E.d.casal.patriarca)) || "família"; try { P.baixar(await P.docx(ed.blocos()), "Diagnóstico patrimonial e sucessório - " + n); } catch (x) { window.HUB.toast(x.message || "Não foi possível gerar o Word.", 5000); } };
  $("#copiar").onclick = () => window.HUB_DOC.copiar(P.texto(ed.blocos()));

  /* ------------------------------------------------------------------ documentos do cliente */
  const DOCS = window.PAT_DOCS, ROT_TIPO = { matricula: "Matrícula", irpf: "IRPF", iptu: "IPTU", outro: "Não identificado" };
  if (window.pdfjsLib) window.pdfjsLib.GlobalWorkerOptions.workerSrc = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
  const K_CONS_DOCS = "patrimonio_consentimento_docs";
  const DOC = { itens: [], fila: Promise.resolve(), props: [] };
  $("#consDocs").checked = ler(K_CONS_DOCS) === "1";
  const claudeDocs = () => $("#modoLeitura").value === "claude" && !!$("#chave").value.trim() && $("#consDocs").checked;
  function infoModo() {
    const cl = $("#modoLeitura").value === "claude";
    $("#consDocs").closest("div").hidden = !cl;
    $("#modoInfo").textContent = !cl ? "Os documentos são lidos neste navegador e não saem do computador. Em documentos digitalizados de baixa qualidade, a leitura pelo Claude tende a ser mais precisa."
      : !$("#chave").value.trim() ? "Informe a chave da API da Anthropic em 7. Diagnóstico, Opções da redação pelo Claude. Sem ela, a leitura é feita por regras."
      : !$("#consDocs").checked ? "Marque a autorização para enviar os documentos à Anthropic. Sem ela, a leitura é feita por regras."
      : "Cada documento será enviado à Anthropic e lido pelo " + $("#modelo").selectedOptions[0].textContent.replace(/\s*\(.*$/, "") + ". Custo aproximado: alguns centavos de dólar por documento.";
  }
  $("#modoLeitura").onchange = infoModo;
  $("#consDocs").onchange = e => { gravar(K_CONS_DOCS, e.target.checked ? "1" : null); infoModo(); };
  $("#chave").addEventListener("input", infoModo); $("#modelo").addEventListener("change", infoModo);

  function desenharDocs() {
    $("#listaDocs").innerHTML = DOC.itens.map(it => {
      const tag = it.erro ? '<span class="tag bad">Erro</span>' : it.e ? '<span class="tag ' + (it.e.tipo === "outro" ? "warn" : "ok") + '">' + ROT_TIPO[it.e.tipo] + "</span>" : '<span class="tag na">' + (it.estado || "Na fila") + "</span>";
      const lt = it.leitura;
      const det = it.erro ? esc(it.erro) : it.e ? esc(it.e.resumo || "") + (lt ? " · " + lt.paginas + (lt.paginas === 1 ? " página" : " páginas") + (lt.ocr ? ", OCR em " + lt.ocr + " (confiança média de " + lt.conf + "%)" : "") : "") + (it.modo === "claude" ? " · lido pelo Claude" : "") + (lt && lt.ilegiveis && lt.ilegiveis.length ? ' · <span style="color:var(--bad)">trechos de leitura duvidosa, confira</span>' : "") : esc(it.prog || "");
      return '<div class="doc"><b>' + esc(it.f.name) + "</b>" + tag + '<span class="det">' + det + "</span>" + (lt && lt.texto ? "<details><summary>Ver o texto lido</summary><pre>" + esc(lt.texto.slice(0, 60000)) + "</pre></details>" : "") + "</div>";
    }).join("");
  }
  async function processar(it) {
    it.estado = "Lendo"; desenharDocs();
    try {
      const prog = (m, fr) => { it.prog = m + (fr != null ? " (" + Math.round(fr * 100) + "%)" : ""); desenharDocs(); };
      if (claudeDocs()) {
        it.modo = "claude"; prog("Enviando à Anthropic e aguardando a leitura…", null);
        const cli = new Anthropic({ apiKey: $("#chave").value.trim(), dangerouslyAllowBrowser: true, maxRetries: 3 });
        it.e = await DOCS.extrairComClaude(cli, it.f, { modelo: $("#modelo").value });
      } else {
        it.modo = "regras"; it.leitura = await DOCS.lerArquivo(it.f, prog);
        it.e = DOCS.extrair(it.leitura.texto);
        if (it.leitura.ocr && it.leitura.conf < 70) it.e.alertas.push("A leitura por OCR teve confiança média de " + it.leitura.conf + "%: confira os valores com o documento" + ($("#chave").value.trim() ? " ou refaça a leitura pelo Claude." : "."));
      }
    } catch (x) { it.erro = x instanceof Anthropic.APIError || x instanceof Anthropic.APIConnectionError ? erroApi(x) : (x.message || String(x)); }
    it.estado = ""; desenharDocs(); revisar();
  }
  function anexar(lista) {
    [...lista].forEach(f => { const it = { f }; DOC.itens.push(it); DOC.fila = DOC.fila.then(() => processar(it)); });
    desenharDocs();
  }
  $("#arquivos").onchange = e => { anexar(e.target.files); e.target.value = ""; };
  const zona = $("#zona");
  ["dragenter", "dragover"].forEach(t => zona.addEventListener(t, e => { e.preventDefault(); zona.classList.add("sobre"); }));
  ["dragleave", "drop"].forEach(t => zona.addEventListener(t, e => { e.preventDefault(); zona.classList.remove("sobre"); }));
  zona.addEventListener("drop", e => { if (e.dataTransfer && e.dataTransfer.files.length) anexar(e.dataTransfer.files); });
  $("#limparDocs").onclick = () => { DOC.itens = DOC.itens.filter(it => !it.e && !it.erro); desenharDocs(); revisar(); };

  function revisar() {
    const prontos = DOC.itens.filter(it => it.e && it.e.tipo !== "outro").map(it => ({ nome: it.f.name, e: it.e }));
    $("#revisao").hidden = !DOC.itens.some(it => it.e || it.erro);
    if (!prontos.length) { $("#propostas").innerHTML = DOC.itens.some(it => it.e) ? '<p class="pequeno mudo">Nenhum dado aproveitável foi encontrado nos documentos lidos.</p>' : ""; $("#conferencias").innerHTML = ""; $("#aplicar").disabled = true; DOC.props = []; return; }
    const { propostas, conferencias } = DOCS.propostas(prontos, coletar(), M.brl);
    DOC.props = propostas; let g = "";
    $("#propostas").innerHTML = propostas.length ? propostas.map((p, i) => {
      const cab = p.grupo !== g ? '<div class="prop-g">' + esc(g = p.grupo) + "</div>" : "";
      const sel = p.escolha ? '<select data-esc="' + i + '" aria-label="Preencher como">' + p.escolha.map(([k, r]) => '<option value="' + k + '"' + (k === p.padrao ? " selected" : "") + ">" + esc(r) + "</option>").join("") + "</select>" : "";
      return cab + '<label class="prop"><input type="checkbox" data-prop="' + i + '"' + (p.marcado === false ? "" : " checked") + '><span class="t">' + esc(p.rot) + '</span><span class="d">' + esc(p.det || "") + "</span>" + sel + "</label>";
    }).join("") : '<p class="pequeno mudo">Os dados dos documentos já constam do formulário.</p>';
    $("#conferencias").innerHTML = conferencias.length ? '<h3 class="sub-h">Pontos de conferência</h3>' + conferencias.map(c => '<div class="aviso">' + esc(c) + "</div>").join("") : "";
    $("#aplicar").disabled = !propostas.length;
  }
  $("#aplicar").onclick = () => {
    const P = DOC.props, criados = {};
    const valorEm = (el, k, v) => { const c = el.querySelector('[data-c="' + k + '"]'); if (!c) return; if (c.tagName === "SELECT" && ![...c.options].some(o => (o.value || o.textContent) === v)) return; c.value = v; };
    const itemLista = (lista, idx) => idx >= 0 ? $$("#" + lista + " .item")[idx] : null;
    const vazioLista = lista => $$("#" + lista + " .item").find(el => [...el.querySelectorAll("input[data-c]")].every(c => !c.value.trim()));
    let n = 0;
    P.forEach((p, i) => {
      const ck = document.querySelector('[data-prop="' + i + '"]'); if (!ck || !ck.checked) return;
      const a = p.acao; n++;
      if (a.tipo === "campo") { const chave = p.escolha ? document.querySelector('[data-esc="' + i + '"]').value : a.chave; const el = document.querySelector('[data-k="' + chave + '"]'); if (el) el.value = a.valor; }
      else if (a.tipo === "filho") {
        const el = $$("#filhos .item").find(x => x.querySelector('[data-c="nome"]').value.trim() && DOCS._t.mesmaPessoa(x.querySelector('[data-c="nome"]').value, a.nome)) || vazioLista("filhos") || adicionar("filhos");
        if (!el.querySelector('[data-c="nome"]').value.trim()) valorEm(el, "nome", a.nome);
        if (a.idade) valorEm(el, "idade", a.idade);
      }
      else if (a.tipo === "imovel" || a.tipo === "empresa") { const lista = a.tipo === "imovel" ? "imoveis" : "empresas"; const el = itemLista(lista, a.idx) || vazioLista(lista) || adicionar(lista); criados[i] = el; Object.keys(a.campos).forEach(k => valorEm(el, k, a.campos[k])); }
      else if (a.tipo === "imovelMercado" || a.tipo === "empresaPl") { const lista = a.tipo === "imovelMercado" ? "imoveis" : "empresas"; const el = criados[a.ref] || itemLista(lista, a.idx); if (el) valorEm(el, a.tipo === "imovelMercado" ? "mercado" : "pl", a.valor); }
      else if (a.tipo === "obs") { const el = document.querySelector('[data-k="obs"]'); const cab = "Pontos de conferência dos documentos:"; el.value = (el.value.split(cab)[0].trim() + "\n\n" + cab + "\n" + a.texto).trim(); }
    });
    ["imoveis", "empresas", "filhos"].forEach(renumerar);
    atualizar(); revisar();
    window.HUB.toast(n ? n + (n === 1 ? " informação aplicada" : " informações aplicadas") + " ao formulário. Confira os blocos abaixo." : "Nenhuma informação marcada.", 4000);
  };
  infoModo();

  /* ------------------------------------------------------------------ início */
  let rasc = null; try { rasc = JSON.parse(ler(K_RASC) || "null"); } catch (e) { rasc = null; }
  if (rasc) restaurar(rasc); else { adicionar("filhos"); adicionar("imoveis"); }
  atualizar();
  window.PAT_ESTADO = { E, blocosDe, coletar, restaurar };
})();
