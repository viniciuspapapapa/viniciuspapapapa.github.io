/* Interface do relatório processual ao cliente. */
(function () {
  "use strict";
  const T = window.REL_TRAD, D = window.REL_DOC, P = window.TPC_PECA, esc = window.HUB.esc;
  const $ = s => document.querySelector(s);
  if (window.pdfjsLib) window.pdfjsLib.GlobalWorkerOptions.workerSrc = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
  const ler = (k, padrao) => { try { return JSON.parse(localStorage.getItem(k)) || padrao; } catch (e) { return padrao; } };
  const gravar = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* armazenamento indisponível */ } };
  let timer = null;
  const agendar = () => { clearTimeout(timer); timer = setTimeout(previa, 250); };

  /* ------------------------------------------------------------------ conexão com o DataJud */
  const cfg = () => ler("relatorio_datajud", {});
  function resumo() { const c = cfg(); $("#djResumo").textContent = c.url ? "· configurada" : "· não configurada"; }
  (function () { const c = cfg(); $("#djUrl").value = c.url || ""; $("#djToken").value = c.token || ""; if (!c.url) $("#cfgDj").open = true; resumo(); })();
  const base = () => String(cfg().url || "").replace(/\/+$/, "");
  async function chamar(caminho, corpo) {
    const c = cfg();
    if (!c.url) throw new Error("Configure a conexão com o DataJud (endereço do serviço intermediário) ou use o texto dos andamentos ou o PDF dos autos.");
    let r;
    try { r = await fetch(base() + caminho, { method: corpo ? "POST" : "GET", headers: Object.assign({ "Content-Type": "application/json" }, c.token ? { "x-app-token": c.token } : {}), body: corpo ? JSON.stringify(corpo) : undefined }); }
    catch (e) { throw new Error("Não foi possível alcançar o serviço intermediário. Verifique o endereço e a variável ALLOWED_ORIGIN do Worker."); }
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.erro || "O serviço respondeu " + r.status + ".");
    return j;
  }
  $("#djSalvar").onclick = async () => {
    gravar("relatorio_datajud", { url: $("#djUrl").value.trim(), token: $("#djToken").value.trim() }); resumo();
    const e = $("#djEstado"); e.className = "estado info"; e.textContent = "Testando…";
    try { await chamar("/status"); e.className = "estado ok"; e.textContent = "Conexão funcionando."; }
    catch (x) { e.className = "estado erro"; e.textContent = x.message; }
  };

  /* ------------------------------------------------------------------ processos */
  const mCNJ = v => { const d = T.dig(v).slice(0, 20); let o = d.slice(0, 7); if (d.length > 7) o += "-" + d.slice(7, 9); if (d.length > 9) o += "." + d.slice(9, 13); if (d.length > 13) o += "." + d[13]; if (d.length > 14) o += "." + d.slice(14, 16); if (d.length > 16) o += "." + d.slice(16); return o; };
  let seq = 0;
  function addProc(v) {
    v = v || {}; const id = "p" + (++seq);
    const el = document.createElement("div"); el.className = "item"; el._dados = null;
    el.innerHTML = '<div class="item-cab"><b>Processo</b><button type="button" class="btn sec peq" data-consultar>Consultar DataJud</button><button type="button" class="x" aria-label="Remover processo">×</button></div>' +
      '<div class="grade g2"><label class="campo">Número (CNJ)<input type="text" data-k="numero" inputmode="numeric" placeholder="0000000-00.0000.0.00.0000"></label><label class="campo">Identificação para o cliente (opcional)<input type="text" data-k="apelido" placeholder="Ex.: Ação penal na 3ª Vara Criminal"></label></div>' +
      '<div class="fontes" role="radiogroup" aria-label="Fonte dos andamentos"><label class="check"><input type="radio" name="f' + id + '" value="datajud" checked> DataJud</label><label class="check"><input type="radio" name="f' + id + '" value="texto"> Colar andamentos</label><label class="check"><input type="radio" name="f' + id + '" value="pdf"> Cópia dos autos (PDF)</label></div>' +
      '<label class="campo" data-fonte="texto" hidden>Andamentos copiados do sistema do tribunal<textarea data-k="texto" rows="5" placeholder="12/10/2026 14:30 Recebida a denúncia&#10;20/10/2026 Audiência de instrução e julgamento designada"></textarea><span class="dica">Uma movimentação por linha, iniciando pela data.</span></label>' +
      '<label class="campo" data-fonte="pdf" hidden>Cópia integral e atualizada dos autos<input type="file" data-k="pdf" accept="application/pdf"><span class="dica">As peças são identificadas e datadas pela assinatura eletrônica. Leitura local, sem envio a servidores.</span></label>' +
      '<label class="campo" style="margin-top:8px">Comentário da equipe (opcional)<textarea data-k="comentario" rows="2" placeholder="Orientação ou explicação adicional ao cliente sobre este processo."></textarea></label>' +
      '<div class="estado info" data-estado></div>';
    const q = k => el.querySelector('[data-k="' + k + '"]');
    q("numero").value = v.numero ? mCNJ(v.numero) : ""; q("apelido").value = v.apelido || "";
    q("numero").addEventListener("input", e => { const p = e.target.selectionStart === e.target.value.length; e.target.value = mCNJ(e.target.value); if (p) e.target.selectionStart = e.target.selectionEnd = e.target.value.length; el._dados = null; estado(el, "", "info"); agendar(); });
    el.querySelectorAll('input[type=radio]').forEach(r => r.addEventListener("change", () => { fonteUI(el); el._dados = null; if (fonte(el) === "texto") lerTexto(el); agendar(); }));
    q("texto").addEventListener("input", () => { lerTexto(el); agendar(); });
    q("pdf").addEventListener("change", () => lerPdf(el));
    ["apelido", "comentario"].forEach(k => q(k).addEventListener("input", agendar));
    el.querySelector("[data-consultar]").onclick = () => consultar(el);
    el.querySelector(".x").onclick = () => { el.remove(); if (!$("#procs").children.length) addProc(); agendar(); };
    $("#procs").appendChild(el); fonteUI(el);
    return el;
  }
  const fonte = el => el.querySelector('input[type=radio]:checked').value;
  function fonteUI(el) { const f = fonte(el); el.querySelectorAll("[data-fonte]").forEach(x => { x.hidden = x.dataset.fonte !== f; }); el.querySelector("[data-consultar]").hidden = f !== "datajud"; }
  function estado(el, txt, tipo) { const e = el.querySelector("[data-estado]"); e.className = "estado " + (tipo || "info"); e.textContent = txt; }
  const resumoMovs = d => { const u = d.movs[d.movs.length - 1]; return d.movs.length + (d.movs.length === 1 ? " movimentação" : " movimentações") + (u ? "; último andamento em " + T.br(u.data) : "") + (d.meta.classe ? " · " + d.meta.classe : "") + (d.meta.orgao ? " · " + d.meta.orgao : "") + "."; };

  async function consultar(el) {
    const num = el.querySelector('[data-k="numero"]').value;
    if (T.dig(num).length !== 20) { estado(el, "Informe os 20 dígitos do número CNJ.", "erro"); return; }
    if (!T.tribunal(num)) { estado(el, "Tribunal não identificado pelo número; o STF não integra o DataJud. Use o texto ou o PDF.", "erro"); return; }
    estado(el, "Consultando o DataJud (" + T.tribunal(num).toUpperCase() + ")…", "info");
    try {
      const r = await chamar("/consulta", { numero: T.dig(num) });
      if (!r.processos || !r.processos.length) { el._dados = { movs: [], meta: {}, erro: "processo não localizado na base pública" }; estado(el, "Processo não localizado no DataJud: pode estar em segredo de justiça ou ainda não indexado. Use o texto dos andamentos ou o PDF dos autos.", "erro"); }
      else { el._dados = T.doDatajud(r); estado(el, resumoMovs(el._dados), "ok"); if (!el.querySelector('[data-k="apelido"]').value && el._dados.meta.classe) el.querySelector('[data-k="apelido"]').placeholder = el._dados.meta.classe; }
    } catch (x) { el._dados = { movs: [], meta: {}, erro: x.message }; estado(el, x.message, "erro"); if (/Configure/.test(x.message)) $("#cfgDj").open = true; }
    agendar();
  }
  function lerTexto(el) {
    const d = T.doTexto(el.querySelector('[data-k="texto"]').value);
    el._dados = d; estado(el, d.movs.length ? resumoMovs(d) : "Nenhuma linha iniciada por data foi encontrada.", d.movs.length ? "ok" : "info");
  }
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
  $("#consultarTodos").onclick = async () => { for (const el of $("#procs").children) if (fonte(el) === "datajud" && T.dig(el.querySelector('[data-k="numero"]').value).length === 20) await consultar(el); };

  /* ------------------------------------------------------------------ carteiras salvas */
  function carregarCarteiras() {
    const c = ler("relatorio_carteiras", {}), sel = $("#carteiras"), atual = sel.value;
    sel.innerHTML = '<option value="">Nova</option>' + Object.keys(c).sort().map(n => '<option value="' + esc(n) + '">' + esc(n) + "</option>").join("");
    if (c[atual]) sel.value = atual;
  }
  $("#carteiras").onchange = () => {
    const c = ler("relatorio_carteiras", {})[$("#carteiras").value]; if (!c) return;
    $("#cliente").value = $("#carteiras").value; $("#saudacao").value = c.saudacao || "";
    $("#procs").innerHTML = ""; (c.processos || []).forEach(p => addProc(p)); if (!$("#procs").children.length) addProc();
    agendar();
  };
  $("#salvarCarteira").onclick = () => {
    const nome = $("#cliente").value.trim(); if (!nome) { window.HUB.toast("Informe o nome do cliente."); return; }
    const c = ler("relatorio_carteiras", {});
    c[nome] = { saudacao: $("#saudacao").value.trim(), processos: [...$("#procs").children].map(el => ({ numero: T.dig(el.querySelector('[data-k="numero"]').value), apelido: el.querySelector('[data-k="apelido"]').value.trim() })).filter(p => p.numero) };
    gravar("relatorio_carteiras", c); carregarCarteiras(); $("#carteiras").value = nome; window.HUB.toast("Carteira salva neste navegador.");
  };
  $("#excluirCarteira").onclick = () => { const n = $("#carteiras").value; if (!n) return; const c = ler("relatorio_carteiras", {}); delete c[n]; gravar("relatorio_carteiras", c); carregarCarteiras(); window.HUB.toast("Carteira excluída."); };

  /* ------------------------------------------------------------------ relatório */
  $("#advs").innerHTML = P.ADVOGADOS.map(a => '<label class="check"><input type="checkbox" data-adv="' + a.id + '"' + (a.id === "vinicius" ? " checked" : "") + "> " + esc(a.nome) + ' <span class="dica">OAB/' + a.uf + " " + a.oab + "</span></label>").join("");
  $("#advs").addEventListener("change", agendar);
  ["#cliente", "#ini", "#fim", "#saudacao", "#local", "#abertura"].forEach(s => { $(s).addEventListener("input", agendar); $(s).addEventListener("change", agendar); });
  const dataDe = id => { const v = $(id).value; return v ? new Date(v + "T00:00:00Z") : null; };
  function montar() {
    const processos = [...$("#procs").children].map(el => {
      const d = el._dados || { movs: [], meta: {} };
      return { numero: el.querySelector('[data-k="numero"]').value, apelido: el.querySelector('[data-k="apelido"]').value.trim(), fonte: fonte(el), movs: d.movs || [], meta: d.meta || {}, erro: d.erro || (!el._dados ? "andamentos ainda não carregados" : ""), comentario: el.querySelector('[data-k="comentario"]').value };
    }).filter(p => T.dig(p.numero));
    const h = new Date(), hoje = new Date(Date.UTC(h.getFullYear(), h.getMonth(), h.getDate()));
    const c = { cliente: $("#cliente").value.trim(), saudacao: $("#saudacao").value.trim(), ini: dataDe("#ini") || hoje, fim: dataDe("#fim") || hoje, local: $("#local").value.trim(), dataTexto: P.dataExtenso(hoje), abertura: $("#abertura").value.trim(), advogados: P.ADVOGADOS.filter(a => document.querySelector('[data-adv="' + a.id + '"]').checked) };
    return { c, processos };
  }
  function previa() {
    const { c, processos } = montar(), faltas = [], avisos = [];
    if (!c.cliente) faltas.push("o nome do cliente");
    if (!processos.length) faltas.push("ao menos um processo");
    if (!c.advogados.length) faltas.push("ao menos um advogado");
    if (c.ini > c.fim) faltas.push("um período válido");
    processos.forEach(p => { if (T.dig(p.numero).length === 20 && !T.validoCNJ(p.numero)) avisos.push("O número " + T.fmtCNJ(p.numero) + " não confere com o dígito verificador do padrão CNJ."); if (p.erro && !p.movs.length) avisos.push("Processo " + T.fmtCNJ(p.numero) + ": " + p.erro + "."); });
    $("#faltas").innerHTML = (faltas.length ? '<div class="aviso">Para gerar, preencha: ' + esc(faltas.join("; ")) + ".</div>" : "") + avisos.map(a => '<div class="aviso">' + esc(a) + "</div>").join("");
    $("#baixar").disabled = faltas.length > 0;
    $("#folha").innerHTML = processos.length ? P.html(D.montar(c, processos)) : "";
  }
  $("#baixar").onclick = async () => { const { c, processos } = montar(); try { P.baixar(await P.docx(D.montar(c, processos)), "Relatório processual - " + (c.cliente || "cliente") + " - " + T.br(c.fim).replace(/\//g, "-")); } catch (x) { window.HUB.toast(x.message || "Não foi possível gerar o Word.", 5000); } };
  $("#copiar").onclick = () => { const { c, processos } = montar(); window.HUB_DOC.copiar(P.texto(D.montar(c, processos))); };

  const h = new Date(), hoje = new Date(Date.UTC(h.getFullYear(), h.getMonth(), h.getDate()));
  $("#fim").value = hoje.toISOString().slice(0, 10); $("#ini").value = new Date(hoje - 30 * 864e5).toISOString().slice(0, 10);
  carregarCarteiras(); addProc(); previa();
  window.REL_ESTADO = { addProc, consultar };
})();
