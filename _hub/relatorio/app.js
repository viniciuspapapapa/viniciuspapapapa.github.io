/* Interface do relatório processual: base de processos, atualização no DataJud, relatório editável e envio. */
(async function () {
  "use strict";
  const T = window.REL_TRAD, D = window.REL_DOC, P = window.TPC_PECA, B = window.REL_BASE, E = window.REL_ENVIO, esc = window.HUB.esc;
  const $ = s => document.querySelector(s);
  if (window.pdfjsLib) window.pdfjsLib.GlobalWorkerOptions.workerSrc = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
  const ler = (k, padrao) => { try { return JSON.parse(localStorage.getItem(k)) || padrao; } catch (e) { return padrao; } };
  const gravar = (k, v) => { try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* armazenamento indisponível */ } };
  const ESCRITORIO = window.HUB_CONFIG || {};
  const dataHora = d => d ? T.br(new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()))) + " " + String(d.getHours()).padStart(2, "0") + ":" + String(d.getMinutes()).padStart(2, "0") : "";
  let timer = null;
  const agendar = () => { clearTimeout(timer); timer = setTimeout(previa, 250); };

  /* ------------------------------------------------------------------ abas */
  document.querySelectorAll("[data-aba]").forEach(b => b.addEventListener("click", () => abrirAba(b.dataset.aba)));
  function abrirAba(id) {
    document.querySelectorAll("[data-aba]").forEach(b => b.setAttribute("aria-selected", String(b.dataset.aba === id)));
    $("#aba-base").hidden = id !== "base"; $("#aba-relatorio").hidden = id !== "relatorio";
    if (id === "relatorio") previa();
  }

  /* ------------------------------------------------------------------ conexão com o DataJud */
  const cfg = () => { const l = ler("relatorio_datajud", null); return l && l.url ? l : (ESCRITORIO.datajud || {}); };
  function resumoCfg() {
    const l = ler("relatorio_datajud", null), c = cfg();
    $("#djResumo").textContent = l && l.url ? "· configuração deste navegador" : c.url ? "· configurada pelo escritório" : "· não configurada";
    $("#djUrl").value = l && l.url ? l.url : ""; $("#djToken").value = l && l.url ? l.token || "" : "";
    $("#djUrl").placeholder = (ESCRITORIO.datajud || {}).url || "https://datajud-tpc.seu-usuario.workers.dev";
    if (!c.url) $("#cfgDj").open = true;
  }
  async function chamar(caminho, corpo) {
    const c = cfg();
    if (!c.url) throw new Error("Configure a conexão com o DataJud ou use o texto dos andamentos ou o PDF dos autos.");
    let r;
    try { r = await fetch(String(c.url).replace(/\/+$/, "") + caminho, { method: corpo ? "POST" : "GET", headers: Object.assign({ "Content-Type": "application/json" }, c.token ? { "x-app-token": c.token } : {}), body: corpo ? JSON.stringify(corpo) : undefined }); }
    catch (e) { throw new Error("Não foi possível alcançar o serviço intermediário do DataJud. Verifique a conexão."); }
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(r.status === 401 ? "Senha do serviço do DataJud recusada." : j.erro || "O serviço respondeu " + r.status + ".");
    return j;
  }
  const consultarDJ = n => chamar("/consulta", { numero: T.dig(n) });
  $("#djSalvar").onclick = async () => {
    gravar("relatorio_datajud", $("#djUrl").value.trim() ? { url: $("#djUrl").value.trim(), token: $("#djToken").value.trim() } : null); resumoCfg();
    const e = $("#djEstado"); e.className = "estado info"; e.textContent = "Testando…";
    try { await chamar("/status"); e.className = "estado ok"; e.textContent = "Conexão funcionando."; } catch (x) { e.className = "estado erro"; e.textContent = x.message; }
  };
  $("#djPadrao").onclick = () => { gravar("relatorio_datajud", null); resumoCfg(); $("#djSalvar").click(); };

  /* ------------------------------------------------------------------ base */
  let BASE = await B.carregar();
  /* migra as carteiras da versão anterior */
  (function () {
    const antigas = ler("relatorio_carteiras", null); if (!antigas) return;
    for (const [nome, c] of Object.entries(antigas)) {
      B.mesclar(BASE, (c.processos || []).map(p => ({ numero: T.dig(p.numero), cliente: nome, apelido: p.apelido, bruto: p.numero, aba: "", linha: 0 })));
      BASE.clientes[nome] = Object.assign({ email: "", telefone: "", saudacao: "" }, BASE.clientes[nome], c.saudacao ? { saudacao: c.saudacao } : {});
    }
    gravar("relatorio_carteiras", null); B.salvar(BASE);
  })();
  const processos = () => Object.values(BASE.processos);
  const clientes = () => [...new Set(processos().map(p => p.cliente).filter(Boolean).concat(Object.keys(BASE.clientes)))].sort((a, b) => a.localeCompare(b, "pt-BR"));
  const sel = new Set();
  let ocupado = false, cancelar = false;

  function ultimo(p) { const m = p.dados && p.dados.movs && p.dados.movs[p.dados.movs.length - 1]; return m ? Object.assign({}, m, T.traduzir(m)) : null; }
  function ultimoRelevante(p) { const ms = (p.dados && p.dados.movs) || []; for (let i = ms.length - 1; i >= 0; i--) { const t = T.traduzir(ms[i]); if (t.rel >= 2) return Object.assign({}, ms[i], t); } return ultimo(p); }
  function filtrados() {
    const c = $("#fCliente").value, q = $("#fBusca").value.trim().toLowerCase(), m = $("#fMostrar").value;
    return processos().filter(p => {
      if (c === "__sem" ? p.cliente : c && p.cliente !== c) return false;
      if (m === "novas" && !p.novas) return false;
      if (m === "erro" && !p.erro) return false;
      if (m === "nunca" && p.atualizadoEm) return false;
      if (q) { const u = ultimoRelevante(p); const alvo = (T.fmtCNJ(p.numero) + " " + p.numero + " " + (p.apelido || "") + " " + (p.classe || "") + " " + (p.cliente || "") + " " + (u ? u.texto : "")).toLowerCase(); if (!alvo.includes(q)) return false; }
      return true;
    }).sort((a, b) => (a.cliente || "").localeCompare(b.cliente || "", "pt-BR") || a.numero.localeCompare(b.numero));
  }
  function render() {
    const ps = processos(), cs = clientes();
    $("#contBase").textContent = ps.length;
    const at = ps.map(p => p.atualizadoEm).filter(Boolean).sort((a, b) => b - a)[0];
    const novas = ps.reduce((s, p) => s + (p.novas || 0), 0);
    $("#baseResumo").textContent = ps.length ? ps.length + (ps.length === 1 ? " processo" : " processos") + " de " + cs.length + (cs.length === 1 ? " cliente" : " clientes") + "." + (at ? " Última consulta em " + dataHora(at) + "." : " Nenhum processo consultado ainda.") + (novas ? " " + novas + (novas === 1 ? " movimentação nova." : " movimentações novas.") : "") + " A base fica guardada neste navegador." : "A base está vazia. Importe a planilha de processos do escritório ou inclua processos um a um.";
    const fc = $("#fCliente").value, rc = $("#clienteSel").value;
    $("#fCliente").innerHTML = '<option value="">Todos os clientes</option>' + cs.map(c => "<option>" + esc(c) + "</option>").join("") + (ps.some(p => !p.cliente) ? '<option value="__sem">(sem cliente)</option>' : "");
    $("#fCliente").value = cs.includes(fc) || fc === "__sem" ? fc : "";
    $("#clienteSel").innerHTML = '<option value="">Selecione…</option>' + cs.map(c => "<option>" + esc(c) + "</option>").join("");
    $("#clienteSel").value = cs.includes(rc) ? rc : "";
    $("#listaClientes").innerHTML = cs.map(c => '<option value="' + esc(c) + '">').join("");
    const lista = filtrados();
    $("#tabela tbody").innerHTML = lista.length ? lista.map(p => {
      const u = ultimoRelevante(p);
      return '<tr><td><input type="checkbox" data-sel="' + p.numero + '"' + (sel.has(p.numero) ? " checked" : "") + ' aria-label="Selecionar ' + T.fmtCNJ(p.numero) + '"></td>' +
        '<td><span class="num">' + T.fmtCNJ(p.numero) + "</span>" + (p.novas ? '<span class="novas">' + p.novas + (p.novas === 1 ? " nova" : " novas") + "</span>" : "") + '<span class="mini">' + esc(p.apelido || p.classe || (p.dados && p.dados.meta.classe) || "") + (p.tribunal ? " · " + p.tribunal.toUpperCase() : "") + "</span></td>" +
        "<td>" + esc(p.cliente || "") + "</td>" +
        "<td>" + (u ? "<b>" + T.br(u.data) + "</b> " + esc(u.texto) : '<span class="mini">sem movimentações carregadas</span>') + "</td>" +
        '<td style="white-space:nowrap">' + (p.atualizadoEm ? '<span class="mini">' + dataHora(p.atualizadoEm) + "</span>" : '<span class="mini">nunca</span>') + (p.erro ? '<span class="falha">' + esc(p.erro) + "</span>" : "") + '<button type="button" class="lnk" data-atu="' + p.numero + '">atualizar</button></td></tr>';
    }).join("") : '<tr><td colspan="5" class="mudo">Nenhum processo encontrado.</td></tr>';
    $("#rodapeTabela").textContent = lista.length + " exibidos; " + sel.size + " selecionados.";
    $("#selTodos").checked = lista.length > 0 && lista.every(p => sel.has(p.numero));
  }
  ["#fCliente", "#fMostrar"].forEach(s => $(s).addEventListener("change", render));
  $("#fBusca").addEventListener("input", () => { clearTimeout(render.t); render.t = setTimeout(render, 200); });
  $("#tabela").addEventListener("change", e => { const n = e.target.dataset.sel; if (!n) return; if (e.target.checked) sel.add(n); else sel.delete(n); $("#rodapeTabela").textContent = filtrados().length + " exibidos; " + sel.size + " selecionados."; });
  $("#tabela").addEventListener("click", e => { const n = e.target.dataset.atu; if (n) atualizarLote([n]); });
  $("#selTodos").addEventListener("change", e => { filtrados().forEach(p => { if (e.target.checked) sel.add(p.numero); else sel.delete(p.numero); }); render(); });

  async function atualizarLote(numeros, rotulo) {
    if (ocupado) { window.HUB.toast("Já há uma atualização em andamento."); return; }
    if (!numeros.length) { window.HUB.toast("Nenhum processo a atualizar."); return; }
    if (!cfg().url) { $("#cfgDj").open = true; window.HUB.toast("Configure a conexão com o DataJud."); return; }
    ocupado = true; cancelar = false; $("#progresso").hidden = false; $("#progBarra").style.width = "0";
    $("#progTxt").textContent = (rotulo || "Atualizando") + " 0 de " + numeros.length + "…";
    const r = await B.atualizar(BASE, numeros, consultarDJ, { paralelo: 3, cancelado: () => cancelar, prog: x => { $("#progBarra").style.width = Math.round(x.feitos / x.total * 100) + "%"; $("#progTxt").textContent = (rotulo || "Atualizando") + " " + x.feitos + " de " + x.total + "…"; } });
    ocupado = false;
    $("#progTxt").textContent = (cancelar ? "Atualização interrompida. " : "Atualização concluída. ") + r.ok + (r.ok === 1 ? " processo atualizado" : " processos atualizados") + (r.novidades ? ", com " + r.novidades + (r.novidades === 1 ? " movimentação nova" : " movimentações novas") : "") + (r.falhas ? "; " + r.falhas + " com falha (veja a coluna Consulta)" : "") + ".";
    render(); sincronizarRelatorio();
    setTimeout(() => { if (!ocupado) $("#progresso").hidden = true; }, 15000);
    return r;
  }
  $("#cancelar").onclick = () => { cancelar = true; };
  $("#atuSel").onclick = () => atualizarLote([...sel]);
  $("#atuTodos").onclick = () => atualizarLote(filtrados().map(p => p.numero));
  $("#lidos").onclick = async () => { const alvo = sel.size ? [...sel] : filtrados().map(p => p.numero); alvo.forEach(n => { if (BASE.processos[n]) BASE.processos[n].novas = 0; }); await B.salvar(BASE); render(); };
  $("#remSel").onclick = async () => {
    if (!sel.size) { window.HUB.toast("Selecione os processos a remover."); return; }
    if (!confirm("Remover " + sel.size + (sel.size === 1 ? " processo" : " processos") + " da base?")) return;
    sel.forEach(n => delete BASE.processos[n]); sel.clear(); await B.salvar(BASE); render();
  };
  $("#relSel").onclick = () => {
    if (!sel.size) { window.HUB.toast("Selecione os processos do relatório."); return; }
    const ps = [...sel].map(n => BASE.processos[n]).filter(Boolean), cs = [...new Set(ps.map(p => p.cliente).filter(Boolean))];
    if (cs.length === 1) { $("#clienteSel").value = cs[0]; preencherCliente(cs[0], ps); } else { $("#clienteSel").value = ""; $("#procs").innerHTML = ""; ps.forEach(p => addProc(deBase(p))); }
    abrirAba("relatorio");
  };

  /* inclusão manual, planilha e cópia de segurança */
  const mCNJ = v => { const d = T.dig(v).slice(0, 20); let o = d.slice(0, 7); if (d.length > 7) o += "-" + d.slice(7, 9); if (d.length > 9) o += "." + d.slice(9, 13); if (d.length > 13) o += "." + d[13]; if (d.length > 14) o += "." + d.slice(14, 16); if (d.length > 16) o += "." + d.slice(16); return o; };
  $("#nNumero").addEventListener("input", e => { e.target.value = mCNJ(e.target.value); });
  $("#novoProc").onclick = () => { $("#formNovo").hidden = !$("#formNovo").hidden; if (!$("#formNovo").hidden) $("#nNumero").focus(); };
  $("#nIncluir").onclick = async () => {
    const n = T.dig($("#nNumero").value);
    if (n.length !== 20) { window.HUB.toast("Informe os 20 dígitos do número CNJ."); return; }
    if (!T.validoCNJ(n) && !confirm("O número não confere com o dígito verificador do padrão CNJ. Incluir assim mesmo?")) return;
    B.mesclar(BASE, [{ numero: n, cliente: $("#nCliente").value.trim(), apelido: $("#nApelido").value.trim(), bruto: n }]);
    await B.salvar(BASE); $("#nNumero").value = ""; $("#nApelido").value = ""; render();
    if (cfg().url) atualizarLote([n], "Consultando");
  };
  $("#planilha").addEventListener("change", async e => {
    const f = e.target.files[0]; e.target.value = ""; if (!f) return;
    try {
      const linhas = B.linhasDaPlanilha(await f.arrayBuffer(), f.name);
      if (!linhas.length) throw new Error("Nenhum número de processo encontrado na planilha. Use a planilha modelo ou uma coluna com o título “Número CNJ”.");
      const antes = new Set(Object.keys(BASE.processos));
      const r = B.mesclar(BASE, linhas); await B.salvar(BASE); render();
      const novos = Object.keys(BASE.processos).filter(n => !antes.has(n));
      $("#importInfo").innerHTML = '<div class="aviso" style="margin-top:12px">Planilha “' + esc(f.name) + "” importada: " + r.novos + (r.novos === 1 ? " processo novo" : " processos novos") + " e " + r.atualizados + (r.atualizados === 1 ? " já existente atualizado" : " já existentes atualizados") + "." +
        (r.invalidos.length ? " " + r.invalidos.length + (r.invalidos.length === 1 ? " linha não tem" : " linhas não têm") + " número CNJ válido: " + esc(r.invalidos.slice(0, 8).join("; ")) + (r.invalidos.length > 8 ? " e outras" : "") + ". Se o Excel converteu o número em notação científica, formate a coluna como texto." : "") +
        (r.semTribunal.length ? " Não foi possível identificar o tribunal de " + esc(r.semTribunal.slice(0, 5).join(", ")) + (r.semTribunal.length > 5 ? " e outros" : "") + "." : "") + "</div>";
      if (novos.length && cfg().url) atualizarLote(novos.filter(n => T.tribunal(n)), "Consultando os novos processos:");
    } catch (x) { $("#importInfo").innerHTML = '<div class="aviso" style="margin-top:12px">' + esc(x.message) + "</div>"; }
  });
  $("#modelo").onclick = () => { try { B.modeloPlanilha(); } catch (x) { window.HUB.toast(x.message, 5000); } };
  $("#exportar").onclick = () => B.exportar(BASE);
  $("#restaurar").addEventListener("change", async e => {
    const f = e.target.files[0]; e.target.value = ""; if (!f) return;
    try {
      const nova = B.revive(JSON.parse(await f.text())); if (!nova.processos) throw new Error("Arquivo inválido.");
      if (!confirm("Substituir a base atual (" + processos().length + " processos) pela cópia com " + Object.keys(nova.processos).length + " processos?")) return;
      BASE = nova; await B.salvar(BASE); sel.clear(); render(); window.HUB.toast("Base restaurada.");
    } catch (x) { window.HUB.toast("Não foi possível restaurar: " + x.message, 5000); }
  });
  $("#autoAtualizar").checked = ler("relatorio_auto", true) !== false;
  $("#autoAtualizar").addEventListener("change", e => gravar("relatorio_auto", e.target.checked));

  /* ------------------------------------------------------------------ processos do relatório */
  let seq = 0;
  const deBase = p => ({ numero: p.numero, apelido: p.apelido || "", dados: p.dados, base: true, atualizadoEm: p.atualizadoEm, erro: p.erro });
  function addProc(v) {
    v = v || {}; const id = "p" + (++seq);
    const el = document.createElement("div"); el.className = "item"; el._dados = v.dados ? { movs: v.dados.movs, meta: v.dados.meta } : null;
    el.innerHTML = '<div class="item-cab"><b>Processo</b><button type="button" class="btn sec peq" data-consultar>Atualizar no DataJud</button><button type="button" class="x" aria-label="Retirar do relatório">×</button></div>' +
      '<div class="grade g2"><label class="campo">Número (CNJ)<input type="text" data-k="numero" inputmode="numeric" placeholder="0000000-00.0000.0.00.0000"></label><label class="campo">Identificação para o cliente (opcional)<input type="text" data-k="apelido" placeholder="Ex.: Ação penal na 3ª Vara Criminal"></label></div>' +
      '<div class="fontes" role="radiogroup" aria-label="Fonte dos andamentos"><label class="check"><input type="radio" name="f' + id + '" value="datajud" checked> DataJud</label><label class="check"><input type="radio" name="f' + id + '" value="texto"> Colar andamentos</label><label class="check"><input type="radio" name="f' + id + '" value="pdf"> Cópia dos autos (PDF)</label></div>' +
      '<label class="campo" data-fonte="texto" hidden>Andamentos copiados do sistema do tribunal<textarea data-k="texto" rows="5" placeholder="12/10/2026 14:30 Recebida a denúncia&#10;20/10/2026 Audiência de instrução e julgamento designada"></textarea><span class="dica">Uma movimentação por linha, iniciando pela data.</span></label>' +
      '<label class="campo" data-fonte="pdf" hidden>Cópia integral e atualizada dos autos<input type="file" data-k="pdf" accept="application/pdf"><span class="dica">As peças são identificadas e datadas pela assinatura eletrônica. Leitura local, sem envio a servidores.</span></label>' +
      '<label class="campo" style="margin-top:8px">Comentário da equipe (opcional)<textarea data-k="comentario" rows="2" placeholder="Orientação ou explicação adicional ao cliente sobre este processo."></textarea></label>' +
      '<div class="estado info" data-estado></div>';
    const q = k => el.querySelector('[data-k="' + k + '"]');
    q("numero").value = v.numero ? mCNJ(v.numero) : ""; q("apelido").value = v.apelido || "";
    if (v.base) estado(el, v.dados ? "Da base: " + resumoMovs(el._dados) + (v.atualizadoEm ? " Consulta em " + dataHora(v.atualizadoEm) + "." : "") : "Processo da base ainda não consultado no DataJud.", v.dados ? "ok" : "info");
    q("numero").addEventListener("input", e => { const p = e.target.selectionStart === e.target.value.length; e.target.value = mCNJ(e.target.value); if (p) e.target.selectionStart = e.target.selectionEnd = e.target.value.length; const b = BASE.processos[T.dig(e.target.value)]; el._dados = b && b.dados ? { movs: b.dados.movs, meta: b.dados.meta } : null; estado(el, b ? (b.dados ? "Da base: " + resumoMovs(b.dados) : "Processo da base ainda não consultado.") : "", "info"); agendar(); });
    el.querySelectorAll("input[type=radio]").forEach(r => r.addEventListener("change", () => { fonteUI(el); el._dados = null; if (fonte(el) === "texto") lerTexto(el); if (fonte(el) === "datajud") { const b = BASE.processos[T.dig(q("numero").value)]; if (b && b.dados) el._dados = { movs: b.dados.movs, meta: b.dados.meta }; } agendar(); }));
    q("texto").addEventListener("input", () => { lerTexto(el); agendar(); });
    q("pdf").addEventListener("change", () => lerPdf(el));
    ["apelido", "comentario"].forEach(k => q(k).addEventListener("input", agendar));
    el.querySelector("[data-consultar]").onclick = () => consultar(el);
    el.querySelector(".x").onclick = () => { el.remove(); agendar(); };
    $("#procs").appendChild(el); fonteUI(el);
    return el;
  }
  const fonte = el => el.querySelector("input[type=radio]:checked").value;
  function fonteUI(el) { const f = fonte(el); el.querySelectorAll("[data-fonte]").forEach(x => { x.hidden = x.dataset.fonte !== f; }); el.querySelector("[data-consultar]").hidden = f !== "datajud"; }
  function estado(el, txt, tipo) { const e = el.querySelector("[data-estado]"); e.className = "estado " + (tipo || "info"); e.textContent = txt; }
  const resumoMovs = d => { const u = d.movs[d.movs.length - 1]; return d.movs.length + (d.movs.length === 1 ? " movimentação" : " movimentações") + (u ? "; último andamento em " + T.br(u.data) : "") + (d.meta && d.meta.classe ? " · " + d.meta.classe : "") + (d.meta && d.meta.orgao ? " · " + d.meta.orgao : "") + "."; };

  async function consultar(el) {
    const num = T.dig(el.querySelector('[data-k="numero"]').value);
    if (num.length !== 20) { estado(el, "Informe os 20 dígitos do número CNJ.", "erro"); return; }
    if (!T.tribunal(num)) { estado(el, "Tribunal não identificado pelo número; o STF não integra o DataJud. Use o texto ou o PDF.", "erro"); return; }
    if (!BASE.processos[num]) { B.mesclar(BASE, [{ numero: num, cliente: $("#clienteSel").value || $("#cliente").value.trim(), apelido: el.querySelector('[data-k="apelido"]').value.trim(), bruto: num }]); }
    estado(el, "Consultando o DataJud (" + T.tribunal(num).toUpperCase() + ")…", "info");
    try { await chamar("/status"); } catch (x) { estado(el, x.message, "erro"); if (/Configure/.test(x.message)) $("#cfgDj").open = true; return; }
    await B.atualizar(BASE, [num], consultarDJ, { paralelo: 1 });
    const p = BASE.processos[num];
    if (p.dados && !p.erro) { el._dados = { movs: p.dados.movs, meta: p.dados.meta }; estado(el, resumoMovs(el._dados), "ok"); }
    else { el._dados = { movs: (p.dados && p.dados.movs) || [], meta: (p.dados && p.dados.meta) || {}, erro: p.erro }; estado(el, "Falha na consulta: " + p.erro + ". Use o texto dos andamentos ou o PDF dos autos.", "erro"); }
    render(); agendar();
  }
  function lerTexto(el) { const d = T.doTexto(el.querySelector('[data-k="texto"]').value); el._dados = d; estado(el, d.movs.length ? resumoMovs(d) : "Nenhuma linha iniciada por data foi encontrada.", d.movs.length ? "ok" : "info"); }
  async function lerPdf(el) {
    const f = el.querySelector('[data-k="pdf"]').files[0]; if (!f) return;
    if (!window.EC_LEITOR || !window.EC_ANALISE) { estado(el, "O leitor de PDF não foi carregado. Recarregue a página.", "erro"); return; }
    try {
      estado(el, "Lendo o PDF…", "info");
      const leitura = await window.EC_LEITOR.ler([f], { prog: (m, fr) => estado(el, m + (fr != null ? " (" + Math.round(fr * 100) + "%)" : ""), "info") });
      const pgs = window.EC_ANALISE.paginas(leitura), itens = window.EC_ANALISE.pecas(pgs);
      el._dados = T.doPdf(pgs, itens);
      estado(el, el._dados.movs.length ? resumoMovs(el._dados) + " Peças identificadas no PDF de " + pgs.length + " páginas." : "Não foi possível datar peças no PDF. Cole os andamentos como texto.", el._dados.movs.length ? "ok" : "erro");
    } catch (x) { estado(el, x.message || "Falha na leitura do PDF.", "erro"); }
    agendar();
  }
  $("#addProc").onclick = () => { addProc(); agendar(); };
  $("#consultarTodos").onclick = async () => {
    const els = [...$("#procs").children].filter(el => fonte(el) === "datajud" && T.dig(el.querySelector('[data-k="numero"]').value).length === 20);
    const nums = els.map(el => T.dig(el.querySelector('[data-k="numero"]').value));
    nums.forEach((n, i) => { if (!BASE.processos[n]) B.mesclar(BASE, [{ numero: n, cliente: $("#clienteSel").value || $("#cliente").value.trim(), apelido: els[i].querySelector('[data-k="apelido"]').value.trim(), bruto: n }]); });
    els.forEach(el => estado(el, "Na fila de atualização…", "info"));
    await atualizarLote(nums, "Atualizando os processos do relatório:");
  };
  /* depois de atualizar a base, os processos do relatório passam a usar os dados novos */
  function sincronizarRelatorio() {
    for (const el of $("#procs").children) {
      if (fonte(el) !== "datajud") continue;
      const p = BASE.processos[T.dig(el.querySelector('[data-k="numero"]').value)]; if (!p) continue;
      if (p.dados) { el._dados = { movs: p.dados.movs, meta: p.dados.meta, erro: p.erro && !p.dados.movs.length ? p.erro : "" }; estado(el, (p.erro ? "Falha na última consulta (" + p.erro + "); dados anteriores: " : "") + resumoMovs(p.dados) + (p.atualizadoEm ? " Consulta em " + dataHora(p.atualizadoEm) + "." : ""), p.erro ? "erro" : "ok"); }
      else if (p.erro) { el._dados = { movs: [], meta: {}, erro: p.erro }; estado(el, "Falha na consulta: " + p.erro + ".", "erro"); }
    }
    agendar();
  }

  /* ------------------------------------------------------------------ cliente do relatório */
  function preencherCliente(nome, lista) {
    const c = BASE.clientes[nome] || {};
    $("#cliente").value = nome; $("#saudacao").value = c.saudacao || ""; $("#email").value = c.email || ""; $("#telefone").value = c.telefone || "";
    $("#procs").innerHTML = "";
    (lista || processos().filter(p => p.cliente === nome)).forEach(p => addProc(deBase(p)));
    if (!$("#procs").children.length) addProc();
    mensagemSuja = false; agendar();
  }
  $("#clienteSel").addEventListener("change", () => { const n = $("#clienteSel").value; if (n) preencherCliente(n); });
  ["#saudacao", "#email", "#telefone"].forEach(s => $(s).addEventListener("change", async () => {
    const n = $("#clienteSel").value; if (!n) return;
    BASE.clientes[n] = Object.assign({ email: "", telefone: "", saudacao: "" }, BASE.clientes[n], { saudacao: $("#saudacao").value.trim(), email: $("#email").value.trim(), telefone: $("#telefone").value.trim() });
    await B.salvar(BASE);
  }));

  /* ------------------------------------------------------------------ relatório editável */
  $("#advs").innerHTML = P.ADVOGADOS.map(a => '<label class="check"><input type="checkbox" data-adv="' + a.id + '"' + (a.id === "vinicius" ? " checked" : "") + "> " + esc(a.nome) + ' <span class="dica">OAB/' + a.uf + " " + a.oab + "</span></label>").join("");
  $("#advs").addEventListener("change", agendar);
  ["#cliente", "#ini", "#fim", "#saudacao", "#local", "#abertura"].forEach(s => { $(s).addEventListener("input", agendar); $(s).addEventListener("change", agendar); });
  const ed = P.editor($("#folha"), { aviso: () => avisoEdicao(true) });
  function avisoEdicao(mudou) { $("#descartar").hidden = !ed.editado(); const el = $("#avisoEd"); if (el) el.hidden = !(ed.editado() && mudou); }
  $("#editar").onclick = () => {
    if (ed.editando()) { ed.editar(false); $("#editar").textContent = "Editar texto"; }
    else { ed.editar(true); $("#editar").textContent = "Concluir edição"; }
    avisoEdicao(false);
  };
  $("#descartar").onclick = () => { if (!confirm("Descartar as edições feitas no texto e voltar ao relatório gerado?")) return; ed.descartar(); $("#editar").textContent = "Editar texto"; avisoEdicao(false); previa(); };
  const dataDe = id => { const v = $(id).value; return v ? new Date(v + "T00:00:00Z") : null; };
  function montar() {
    const processosRel = [...$("#procs").children].map(el => {
      const d = el._dados || { movs: [], meta: {} };
      return { numero: el.querySelector('[data-k="numero"]').value, apelido: el.querySelector('[data-k="apelido"]').value.trim(), fonte: fonte(el), movs: d.movs || [], meta: d.meta || {}, erro: d.erro || (!el._dados ? "andamentos ainda não carregados" : ""), comentario: el.querySelector('[data-k="comentario"]').value };
    }).filter(p => T.dig(p.numero));
    const h = new Date(), hoje = new Date(Date.UTC(h.getFullYear(), h.getMonth(), h.getDate()));
    const c = { cliente: $("#cliente").value.trim(), saudacao: $("#saudacao").value.trim(), ini: dataDe("#ini") || hoje, fim: dataDe("#fim") || hoje, local: $("#local").value.trim(), dataTexto: P.dataExtenso(hoje), abertura: $("#abertura").value.trim(), advogados: P.ADVOGADOS.filter(a => document.querySelector('[data-adv="' + a.id + '"]').checked) };
    return { c, processos: processosRel };
  }
  function faltasDe(c, ps) {
    const f = [];
    if (!c.cliente) f.push("o nome do cliente");
    if (!ps.length) f.push("ao menos um processo");
    if (!c.advogados.length) f.push("ao menos um advogado");
    if (c.ini > c.fim) f.push("um período válido");
    return f;
  }
  function previa() {
    const { c, processos: ps } = montar(), faltas = faltasDe(c, ps), avisos = [];
    ps.forEach(p => { if (T.dig(p.numero).length === 20 && !T.validoCNJ(p.numero)) avisos.push("O número " + T.fmtCNJ(p.numero) + " não confere com o dígito verificador do padrão CNJ."); if (p.erro && !p.movs.length) avisos.push("Processo " + T.fmtCNJ(p.numero) + ": " + p.erro + "."); });
    $("#faltas").innerHTML = (faltas.length ? '<div class="aviso">Para gerar, preencha: ' + esc(faltas.join("; ")) + ".</div>" : "") + avisos.map(a => '<div class="aviso">' + esc(a) + "</div>").join("") +
      '<div class="aviso" id="avisoEd" hidden>O texto foi editado manualmente. Alterações nos campos ao lado só aparecerão no documento se você descartar as edições.</div>';
    ["#baixar", "#enviarOutlook", "#abrirOutlook", "#whats"].forEach(s => { $(s).disabled = faltas.length > 0; });
    ed.mostrar(ps.length ? D.montar(c, ps) : []);
    avisoEdicao(ed.editado());
    mensagemPadrao();
  }

  /* ------------------------------------------------------------------ envio */
  let mensagemSuja = false;
  $("#mensagem").addEventListener("input", () => { mensagemSuja = true; });
  $("#assunto").addEventListener("input", () => { $("#assunto").dataset.suja = "1"; });
  const advPrincipal = c => c.advogados[0];
  function resumos(ps) { return ps.map(p => { const s = T.situacao(p.movs || []); return { rot: p.apelido || "Autos nº " + T.fmtCNJ(p.numero), num: T.fmtCNJ(p.numero), texto: s.texto + (s.proximo ? " " + s.proximo : "") }; }); }
  function mensagemPadrao() {
    const { c, processos: ps } = montar();
    if (!$("#assunto").dataset.suja) $("#assunto").value = "Relatório processual de " + (c.cliente || "cliente") + ", período de " + T.br(c.ini) + " a " + T.br(c.fim);
    if (mensagemSuja) return;
    const a = advPrincipal(c), um = ps.length === 1;
    $("#mensagem").value = [(c.saudacao || ("Prezado(a) " + (c.cliente || ""))).replace(/[,.]?$/, ","), "Encaminhamos, em anexo, o relatório de acompanhamento " + (um ? "do processo" : "dos processos") + " sob nossa responsabilidade, referente ao período de " + T.br(c.ini) + " a " + T.br(c.fim) + ".",
      ...resumos(ps).map(r => "Quanto " + (/^Autos/.test(r.rot) ? "aos autos nº " + r.num : "ao processo " + r.rot + " (nº " + r.num + ")") + ": " + r.texto.replace(/^./, x => x.toLowerCase())),
      "Permanecemos à disposição para quaisquer esclarecimentos.", "Atenciosamente,", (a ? a.nome + "\nOAB/" + a.uf + " " + a.oab + "\n" : "") + "TPC Advogados"].join("\n\n");
  }
  const htmlMensagem = () => '<div style="font-family:Segoe UI,Calibri,Arial,sans-serif;font-size:11pt;color:#222">' + $("#mensagem").value.split(/\n{2,}/).map(p => '<p style="margin:0 0 12px">' + esc(p).replace(/\n/g, "<br>") + "</p>").join("") + "</div>";
  async function anexo() { const { c } = montar(); const nome = "Relatório processual - " + (c.cliente || "cliente") + " - " + T.br(c.fim).replace(/\//g, "-"); return { nome: nome.replace(/[\\/:*?"<>|]+/g, "_") + ".docx", base: nome, blob: await P.docx(ed.blocos()) }; }
  $("#baixar").onclick = async () => { try { const a = await anexo(); P.baixar(a.blob, a.base); } catch (x) { window.HUB.toast(x.message || "Não foi possível gerar o Word.", 5000); } };
  $("#copiar").onclick = () => window.HUB_DOC.copiar(P.texto(ed.blocos()));

  const cfgOL = () => { const l = ler("relatorio_outlook", null); return l && l.clientId ? l : (ESCRITORIO.outlook || {}); };
  async function contaOL() { const c = cfgOL(); if (!c.clientId) { $("#outlookConta").textContent = "O envio automático exige a configuração do aplicativo Microsoft 365 do escritório (abaixo). Enquanto isso, use a opção de abrir no Outlook."; return; } const u = await E.conta(c); $("#outlookConta").textContent = u ? "Conectado como " + u + ". O envio é imediato, com o relatório anexado e cópia em Itens Enviados." : "Na primeira vez, a Microsoft pedirá o login da conta do escritório e a autorização para enviar e-mails em seu nome."; }
  $("#redir").textContent = E.REDIRECT();
  (function () { const l = ler("relatorio_outlook", null) || {}; $("#olClient").value = l.clientId || ""; $("#olTenant").value = l.tenant || ""; $("#olClient").placeholder = (ESCRITORIO.outlook || {}).clientId || "00000000-0000-0000-0000-000000000000"; })();
  $("#olSalvar").onclick = () => { gravar("relatorio_outlook", $("#olClient").value.trim() ? { clientId: $("#olClient").value.trim(), tenant: $("#olTenant").value.trim() || "common" } : null); contaOL(); window.HUB.toast("Configuração do Outlook salva neste navegador."); };
  $("#olSair").onclick = async () => { try { await E.sair(cfgOL()); } catch (x) { /* ignora */ } contaOL(); };
  $("#enviarOutlook").onclick = async () => {
    const para = E.lista($("#email").value);
    if (!para.length) { window.HUB.toast("Informe o e-mail do cliente."); $("#email").focus(); return; }
    if (!cfgOL().clientId) { $("#cfgOutlook").open = true; window.HUB.toast("Configure o aplicativo Microsoft 365 ou use “Abrir no Outlook”.", 5000); return; }
    if (!confirm("Enviar agora o relatório para " + para.join(", ") + "?")) return;
    const b = $("#enviarOutlook"); b.disabled = true; b.textContent = "Enviando…";
    try {
      const a = await anexo();
      await E.enviarGraph(cfgOL(), { para: para.join(";"), cc: $("#cc").value, assunto: $("#assunto").value.trim(), html: htmlMensagem(), anexo: { nome: a.nome, blob: a.blob } });
      const n = $("#clienteSel").value; if (n) { BASE.clientes[n] = Object.assign({}, BASE.clientes[n], { ultimoEnvio: new Date() }); await B.salvar(BASE); }
      window.HUB.toast("Relatório enviado para " + para.join(", ") + ".", 5000); contaOL();
    } catch (x) { window.HUB.toast(x.message || "Não foi possível enviar.", 7000); }
    b.disabled = false; b.textContent = "Enviar pelo Outlook";
  };
  $("#abrirOutlook").onclick = async () => {
    try {
      const a = await anexo();
      const blob = await E.eml({ para: $("#email").value, cc: $("#cc").value, assunto: $("#assunto").value.trim(), html: htmlMensagem(), anexo: { nome: a.nome, blob: a.blob } });
      const l = document.createElement("a"); l.href = URL.createObjectURL(blob); l.download = "E-mail - " + a.base.replace(/[\\/:*?"<>|]+/g, "_") + ".eml"; document.body.appendChild(l); l.click(); setTimeout(() => { URL.revokeObjectURL(l.href); l.remove(); }, 1500);
      window.HUB.toast("Abra o arquivo baixado: o Outlook mostrará a mensagem pronta, com o relatório anexado.", 6000);
    } catch (x) { window.HUB.toast(x.message, 5000); }
  };
  $("#whats").onclick = () => {
    const { c, processos: ps } = montar();
    const txt = [(c.saudacao || ("Prezado(a) " + c.cliente)).replace(/[,.]?$/, ","), "segue o resumo do relatório processual do período de " + T.br(c.ini) + " a " + T.br(c.fim) + ".", ...resumos(ps).map(r => "*" + r.rot + "*" + (/^Autos/.test(r.rot) ? "" : " (nº " + r.num + ")") + "\n" + r.texto), "O relatório completo segue por e-mail. Permanecemos à disposição.", "TPC Advogados"].join("\n\n");
    window.open(E.whatsapp($("#telefone").value, txt), "_blank", "noopener");
  };

  /* ------------------------------------------------------------------ início */
  const h = new Date(), hoje = new Date(Date.UTC(h.getFullYear(), h.getMonth(), h.getDate()));
  $("#fim").value = hoje.toISOString().slice(0, 10); $("#ini").value = new Date(hoje - 30 * 864e5).toISOString().slice(0, 10);
  resumoCfg(); render(); addProc(); previa(); contaOL();
  if ($("#autoAtualizar").checked && cfg().url) {
    const velhos = processos().filter(p => p.tribunal && (!p.atualizadoEm || Date.now() - p.atualizadoEm > 24 * 36e5)).map(p => p.numero);
    if (velhos.length) atualizarLote(velhos, "Atualização automática:");
  }
  window.REL_ESTADO = { addProc, consultar, base: () => BASE, atualizarLote };
})();
