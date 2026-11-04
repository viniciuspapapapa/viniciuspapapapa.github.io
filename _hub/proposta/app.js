/* Interface da proposta de honorários. */
(function () {
  "use strict";
  const P = window.PROPOSTA, $ = s => document.querySelector(s);
  if (window.pdfjsLib) window.pdfjsLib.GlobalWorkerOptions.workerSrc = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
  let recursos = null, clausulaEditada = false, ultimo = null, timer = null, geracao = 0;

  const num = s => { s = String(s || "").replace(/[^\d,.-]/g, ""); if (!s) return 0; if (s.includes(",")) s = s.replace(/\./g, "").replace(",", "."); else if (/\.\d{3}$/.test(s)) s = s.replace(/\./g, ""); const n = parseFloat(s); return isNaN(n) ? 0 : n; };
  const D = s => (s ? new Date(s + "T00:00:00Z") : null);
  const hojeISO = () => { const n = new Date(); return new Date(Date.UTC(n.getFullYear(), n.getMonth(), n.getDate())).toISOString().slice(0, 10); };

  async function carregar() {
    const busca = async u => { const r = await fetch(u); if (!r.ok) throw new Error("Falha ao carregar " + u); return new Uint8Array(await r.arrayBuffer()); };
    const [modelo, regular, bold] = await Promise.all([busca("modelo-proposta.pdf"), busca("../assets/fonts/Inter-Regular.ttf"), busca("../assets/fonts/Inter-Bold.ttf")]);
    recursos = { modelo, regular, bold };
  }
  function formaPagamento() { return { valor: num($("#valor").value), modo: $("#modo").value, parcelas: +$("#parcelas").value || 1, primeira: $("#primeira").value, dataPrimeira: D($("#dataPrimeira").value), entrada: num($("#entrada").value), livre: $("#livre").value }; }
  function camposModo() {
    const m = $("#modo").value;
    $("#cEntrada").hidden = m !== "entrada";
    $("#cParcelas").hidden = !(m === "parcelado" || m === "entrada");
    $("#cPrimeira").hidden = m !== "parcelado";
    $("#cDataPrimeira").hidden = !(m === "parcelado" && $("#primeira").value === "data");
    $("#cLivre").hidden = m !== "livre";
  }
  function atualizarClausula() {
    const v = num($("#valor").value);
    $("#valorExt").textContent = v ? P.comExtenso(v) : "";
    if (!clausulaEditada) $("#clausula").value = P.clausulaHonorarios(formaPagamento());
    $("#restaurar").hidden = !clausulaEditada;
  }
  function dados() {
    return { socio: { nome: $("#socioNome").value.trim(), cargo: $("#socioCargo").value.trim(), telefone: $("#socioTelefone").value.trim(), email: $("#socioEmail").value.trim() }, cliente: $("#cliente").value.trim(), data: D($("#data").value) || D(hojeISO()), escopo: $("#escopo").value, servicos: $("#servicos").value.split("\n").map(s => s.replace(/^\s*[•\-*]\s*/, "")), clausula: $("#clausula").value.trim() };
  }
  function agendar() { clearTimeout(timer); timer = setTimeout(previa, 450); }
  async function previa() {
    if (!recursos) return;
    const id = ++geracao;
    $("#estado").textContent = "Atualizando…";
    try {
      const r = await P.gerar(dados(), recursos);
      if (id !== geracao) return;
      ultimo = r;
      $("#avisos").innerHTML = r.avisos.map(a => '<div class="aviso">' + window.HUB.esc(a) + "</div>").join("");
      const doc = await window.pdfjsLib.getDocument({ data: r.bytes.slice(0) }).promise;
      const box = $("#paginas"), canv = [];
      for (let i = 1; i <= doc.numPages; i++) {
        const pg = await doc.getPage(i), vp = pg.getViewport({ scale: 1.3 });
        const c = document.createElement("canvas"); c.width = vp.width; c.height = vp.height; c.setAttribute("aria-label", "Página " + i + " da proposta");
        await pg.render({ canvasContext: c.getContext("2d"), viewport: vp }).promise; canv.push(c);
      }
      if (id !== geracao) return;
      box.replaceChildren(...canv);
      $("#estado").textContent = doc.numPages + " páginas";
    } catch (e) { console.error(e); $("#estado").textContent = "Erro: " + (e.message || e); }
  }

  ["#cliente", "#data", "#escopo", "#servicos", "#clausula"].forEach(s => $(s).addEventListener("input", agendar));
  /* sócio responsável: lembrado neste navegador */
  const K_SOCIO = "proposta_socio";
  const CAMPOS_SOCIO = { nome: "#socioNome", cargo: "#socioCargo", telefone: "#socioTelefone", email: "#socioEmail" };
  function preencherSocio(v) { for (const k in CAMPOS_SOCIO) $(CAMPOS_SOCIO[k]).value = v[k] || ""; }
  let socioSalvo = null; try { socioSalvo = JSON.parse(localStorage.getItem(K_SOCIO) || "null"); } catch (e) { /* ignora */ }
  preencherSocio(socioSalvo || P.SOCIO_PADRAO);
  function telefone(v) { const d = v.replace(/\D/g, "").slice(0, 11); if (d.length < 3) return d ? "(" + d : ""; const ddd = "(" + d.slice(0, 2) + ") ", r = d.slice(2); return ddd + (r.length > 8 ? r.slice(0, 5) + "-" + r.slice(5) : r.length > 4 ? r.slice(0, 4) + "-" + r.slice(4) : r); }
  $("#socioTelefone").addEventListener("blur", () => { $("#socioTelefone").value = telefone($("#socioTelefone").value); agendar(); });
  Object.values(CAMPOS_SOCIO).forEach(s => $(s).addEventListener("input", () => { try { localStorage.setItem(K_SOCIO, JSON.stringify(dados().socio)); } catch (e) { /* ignora */ } agendar(); }));
  $("#socioPadrao").onclick = () => { preencherSocio(P.SOCIO_PADRAO); try { localStorage.removeItem(K_SOCIO); } catch (e) { /* ignora */ } agendar(); };
  ["#valor", "#modo", "#parcelas", "#primeira", "#dataPrimeira", "#entrada", "#livre"].forEach(s => $(s).addEventListener("input", () => { camposModo(); atualizarClausula(); agendar(); }));
  $("#modo").addEventListener("change", () => { camposModo(); atualizarClausula(); agendar(); });
  $("#primeira").addEventListener("change", () => { camposModo(); atualizarClausula(); agendar(); });
  $("#clausula").addEventListener("input", () => { clausulaEditada = true; $("#restaurar").hidden = false; });
  $("#restaurar").onclick = e => { e.preventDefault(); clausulaEditada = false; atualizarClausula(); agendar(); };
  $("#baixar").onclick = async () => {
    const d = dados();
    if (!d.cliente) { window.HUB.toast("Informe o nome do cliente."); $("#cliente").focus(); return; }
    if (!d.socio.nome) { window.HUB.toast("Informe o nome do sócio responsável."); $("#socioNome").focus(); return; }
    if (d.socio.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(d.socio.email)) { window.HUB.toast("Confira o e-mail do sócio."); $("#socioEmail").focus(); return; }
    if (!num($("#valor").value) && $("#modo").value !== "livre") { window.HUB.toast("Informe o valor dos honorários."); $("#valor").focus(); return; }
    try {
      const r = await P.gerar(d, recursos);
      const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([r.bytes], { type: "application/pdf" })); a.download = P.nomeArquivo(d.cliente, d.data); document.body.appendChild(a); a.click();
      setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1500);
      if (r.avisos.length) window.HUB.toast(r.avisos[0], 5000);
    } catch (e) { window.HUB.toast("Não foi possível gerar o PDF: " + (e.message || e), 5000); }
  };
  function padrao() {
    $("#cliente").value = ""; $("#data").value = hojeISO(); $("#escopo").value = P.ESCOPO_EXEMPLO; $("#servicos").value = P.SERVICOS_PADRAO.join("\n");
    $("#valor").value = ""; $("#modo").value = "parcelado"; $("#parcelas").value = 5; $("#primeira").value = "assinatura"; $("#entrada").value = ""; $("#livre").value = ""; $("#dataPrimeira").value = "";
    clausulaEditada = false; camposModo(); atualizarClausula();
  }
  $("#limpar").onclick = () => { padrao(); agendar(); };
  $("#valor").addEventListener("blur", () => { const v = num($("#valor").value); if (v) $("#valor").value = v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }); });
  $("#entrada").addEventListener("blur", () => { const v = num($("#entrada").value); if (v) $("#entrada").value = v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }); });

  padrao();
  carregar().then(previa).catch(e => { $("#estado").textContent = e.message; });
})();
