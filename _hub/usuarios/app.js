/* Busca de perfis por nome de usuário: interface do porte do Sherlock. As consultas são feitas pelo serviço do
   escritório no Cloudflare (sherlock-worker), em lotes paralelos; a decisão de cada site segue as regras do Sherlock. */
(function () {
  "use strict";
  const $ = s => document.querySelector(s), $$ = s => [...document.querySelectorAll(s)], esc = s => window.HUB.esc(s);
  const ler = k => { try { return localStorage.getItem(k); } catch (e) { return null; } };
  const gravar = (k, v) => { try { if (v == null || v === "") localStorage.removeItem(k); else localStorage.setItem(k, v); } catch (e) { /* armazenamento indisponível */ } };
  const CFG = (window.HUB_CONFIG && window.HUB_CONFIG.sherlock) || {}, PADRAO = "https://sherlock-tpc.viniciuspapapapa.workers.dev";
  const LOTE = 8, PARALELO = 4, SIMB = ["_", "-", "."];
  const ROT = { encontrado: "Encontrado", disponivel: "Não encontrado", ilegal: "Usuário inválido no site", waf: "Bloqueado pelo site", desconhecido: "Inconclusivo" };
  const TAG = { encontrado: "ok", disponivel: "na", ilegal: "na", waf: "warn", desconhecido: "warn" };
  const E = { sites: [], escolhidos: new Set(JSON.parse(ler("sherlock_escolhidos") || "[]")), res: [], parar: false, rodando: false, ver: "encontrado", inicio: null, fim: null, usuarios: [] };

  /* ------------------------------------------------------------------ serviço */
  const url = () => ($("#url").value.trim() || PADRAO).replace(/\/+$/, "");
  const cab = () => { const t = $("#token").value.trim(); return Object.assign({ "Content-Type": "application/json" }, t ? { "X-App-Token": t } : {}); };
  $("#url").value = ler("sherlock_url") || CFG.url || PADRAO; $("#token").value = ler("sherlock_token") || CFG.token || "";
  async function api(caminho, corpo, tentativas) {
    let ultimo = null;
    for (let i = 0; i < (tentativas || 2); i++) {
      try {
        const r = await fetch(url() + caminho, corpo ? { method: "POST", headers: cab(), body: JSON.stringify(corpo) } : { headers: cab() });
        const j = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(r.status === 401 ? "Chave do serviço inválida (APP_TOKEN)." : r.status === 403 ? "O serviço não autorizou este endereço (ALLOWED_ORIGIN)." : j.erro || "Erro do serviço (" + r.status + ").");
        return j;
      } catch (e) { ultimo = e; if (/inválida|autorizou/.test(e.message)) break; await new Promise(ok => setTimeout(ok, 600 * (i + 1))); }
    }
    throw ultimo && /fetch|network|Failed/i.test(ultimo.message) ? new Error("Não foi possível alcançar o serviço de consulta em " + url() + ". Ele precisa estar implantado no Cloudflare (veja Serviço de consulta).") : ultimo;
  }
  async function carregarSites() {
    $("#servicoEstado").textContent = "Conectando ao serviço…";
    try {
      const j = await api("/sites"); E.sites = j.sites.sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
      $("#servicoEstado").textContent = "Serviço conectado: " + E.sites.length + " sites disponíveis (" + E.sites.filter(s => s.nsfw).length + " de conteúdo adulto).";
      listaSites(); estado(); return true;
    } catch (e) { $("#servicoEstado").textContent = e.message; $("#servico").open = true; estado(); return false; }
  }
  $("#testar").onclick = () => { gravar("sherlock_url", $("#url").value.trim()); gravar("sherlock_token", $("#token").value.trim()); carregarSites(); };

  /* ------------------------------------------------------------------ escolha dos sites */
  function listaSites() {
    const f = $("#filtro").value.trim().toLowerCase(), nsfw = $("#nsfw").checked;
    $("#listaSites").innerHTML = E.sites.filter(s => (nsfw || !s.nsfw) && (!f || s.nome.toLowerCase().includes(f) || s.urlMain.toLowerCase().includes(f)))
      .map(s => '<label class="check"><input type="checkbox" data-site="' + esc(s.nome) + '"' + (E.escolhidos.has(s.nome) ? " checked" : "") + "> " + esc(s.nome) + "</label>").join("") || '<p class="pequeno mudo">Nenhum site com esse nome.</p>';
    $("#nSel").textContent = E.escolhidos.size;
  }
  $("#filtro").addEventListener("input", listaSites);
  $("#listaSites").addEventListener("change", e => { const s = e.target.dataset.site; if (!s) return; e.target.checked ? E.escolhidos.add(s) : E.escolhidos.delete(s); gravar("sherlock_escolhidos", JSON.stringify([...E.escolhidos])); $("#nSel").textContent = E.escolhidos.size; estado(); });
  $("#marcarVis").onclick = () => { $$("[data-site]").forEach(c => { c.checked = true; E.escolhidos.add(c.dataset.site); }); gravar("sherlock_escolhidos", JSON.stringify([...E.escolhidos])); listaSites(); estado(); };
  $("#limparSel").onclick = () => { E.escolhidos.clear(); gravar("sherlock_escolhidos", "[]"); listaSites(); estado(); };
  $("#escopo").onchange = () => { $("#escolha").hidden = $("#escopo").value !== "selecionados"; if (!$("#escolha").hidden) $("#escolha").open = true; estado(); };
  $("#nsfw").onchange = () => { listaSites(); estado(); };
  $("#usuarios").addEventListener("input", estado);

  /* ------------------------------------------------------------------ busca */
  function usuarios() {
    const base = $("#usuarios").value.split(/[\n,;]+/).map(s => s.trim().replace(/^@/, "")).filter(Boolean), out = [];
    base.forEach(u => (u.includes("{?}") ? SIMB.map(s => u.split("{?}").join(s)) : [u]).forEach(v => { if (!out.includes(v)) out.push(v); }));
    return out.slice(0, 30);
  }
  function alvo() { const nsfw = $("#nsfw").checked, sel = $("#escopo").value === "selecionados"; return E.sites.filter(s => (nsfw || !s.nsfw) && (!sel || E.escolhidos.has(s.nome))).map(s => s.nome); }
  function estado() {
    const us = usuarios(), n = E.sites.length ? alvo().length : 0;
    $("#buscar").disabled = E.rodando || !us.length || !n;
    $("#estado").textContent = !E.sites.length ? "" : us.length ? us.length + (us.length === 1 ? " usuário" : " usuários") + " × " + n + " sites = " + (us.length * n) + " verificações" : "";
  }
  function prog(t, fr) { $("#progresso").textContent = t || ""; $("#barra").hidden = fr == null; if (fr != null) $("#barra i").style.width = Math.round(fr * 100) + "%"; }
  $("#parar").onclick = () => { E.parar = true; prog("Interrompendo…", null); };
  $("#buscar").onclick = async () => {
    const us = usuarios(), sites = alvo(); if (!us.length || !sites.length) return;
    E.rodando = true; E.parar = false; E.res = []; E.inicio = new Date(); E.usuarios = us; estado();
    $("#erro").hidden = true; $("#parar").hidden = false; $("#resBloco").hidden = false;
    const tarefas = []; us.forEach(u => { for (let i = 0; i < sites.length; i += LOTE) tarefas.push({ u, sites: sites.slice(i, i + LOTE) }); });
    const total = us.length * sites.length; let feitas = 0, falhas = 0, ultimo = 0;
    const timeout = +$("#timeout").value;
    async function trabalhador() {
      while (tarefas.length && !E.parar) {
        const t = tarefas.shift();
        try {
          const j = await api("/verificar", { usuario: t.u, sites: t.sites, timeout }, 2);
          const agora = new Date();
          j.resultados.forEach(r => E.res.push(Object.assign({ usuario: t.u, quando: agora }, r)));
        } catch (e) {
          if (/inválida|autorizou|alcançar/.test(e.message) && !E.res.length) { E.parar = true; $("#erro").textContent = e.message; $("#erro").hidden = false; }
          falhas++; t.sites.forEach(s => E.res.push({ usuario: t.u, site: s, url: "", status: "desconhecido", http: "?", ms: 0, contexto: "Falha do serviço: " + e.message.slice(0, 80), quando: new Date() }));
        }
        feitas += t.sites.length;
        if (Date.now() - ultimo > 400) { ultimo = Date.now(); prog("Verificando " + t.u + ": " + feitas + " de " + total, feitas / total); mostrar(); }
      }
    }
    await Promise.all(Array.from({ length: PARALELO }, trabalhador));
    E.fim = new Date(); E.rodando = false; $("#parar").hidden = true;
    const enc = E.res.filter(r => r.status === "encontrado").length;
    prog((E.parar ? "Busca interrompida. " : "Busca concluída. ") + enc + (enc === 1 ? " perfil encontrado" : " perfis encontrados") + " em " + Math.round((E.fim - E.inicio) / 1000) + " s." + (falhas ? " " + falhas + " lotes falharam e aparecem como inconclusivos." : ""), null);
    mostrar(); estado();
  };

  /* ------------------------------------------------------------------ resultados */
  const inconclusivo = r => r.status === "desconhecido" || r.status === "waf";
  function mostrar() {
    const c = { encontrado: 0, disponivel: 0, inc: 0, ilegal: 0 };
    E.res.forEach(r => { if (r.status === "encontrado") c.encontrado++; else if (r.status === "disponivel") c.disponivel++; else if (r.status === "ilegal") c.ilegal++; else c.inc++; });
    $("#placar").innerHTML = [["Perfis encontrados", c.encontrado], ["Não encontrados", c.disponivel], ["Inconclusivos", c.inc], ["Nome inválido no site", c.ilegal]].map(([r, v]) => "<div><span>" + r + "</span><b>" + v + "</b></div>").join("");
    const lista = E.res.filter(r => E.ver === "todos" || (E.ver === "encontrado" ? r.status === "encontrado" : inconclusivo(r))).sort((a, b) => a.usuario.localeCompare(b.usuario) || a.site.localeCompare(b.site, "pt-BR"));
    const varios = E.usuarios.length > 1;
    $("#tabela").innerHTML = lista.length ? '<table class="res"><thead><tr>' + (varios ? "<th>Usuário</th>" : "") + "<th>Site</th><th>Resultado</th><th>Endereço</th><th>HTTP</th><th>Verificado em</th></tr></thead><tbody>" +
      lista.map(r => "<tr>" + (varios ? "<td>" + esc(r.usuario) + "</td>" : "") + "<td>" + esc(r.site) + '</td><td><span class="tag ' + TAG[r.status] + '">' + ROT[r.status] + "</span>" + (r.contexto ? '<br><small class="mudo">' + esc(r.contexto) + "</small>" : "") + "</td><td>" + (r.url ? '<a href="' + esc(r.url) + '" target="_blank" rel="noopener noreferrer">' + esc(r.url) + "</a>" : "") + '</td><td class="n">' + esc(r.http) + '</td><td class="n">' + r.quando.toLocaleString("pt-BR") + "</td></tr>").join("") + "</tbody></table>"
      : '<p class="pequeno mudo">' + (E.rodando ? "Aguardando resultados…" : E.ver === "encontrado" ? "Nenhum perfil encontrado." : "Nada a exibir.") + "</p>";
  }
  $$("[data-ver]").forEach(b => b.addEventListener("click", () => { E.ver = b.dataset.ver; $$("[data-ver]").forEach(x => x.setAttribute("aria-selected", String(x === b))); mostrar(); }));

  /* ------------------------------------------------------------------ exportação (formatos do Sherlock e relatório TPC) */
  const nomeArq = () => "Perfis - " + (E.usuarios.length === 1 ? E.usuarios[0] : E.usuarios.length + " usuarios") + " - " + E.inicio.toISOString().slice(0, 10);
  const baixar = (blob, nome) => window.TPC_PECA.baixar(blob, nome);
  const linhas = () => E.res.slice().sort((a, b) => a.usuario.localeCompare(b.usuario) || a.site.localeCompare(b.site, "pt-BR")).map(r => ({ username: r.usuario, name: r.site, url_main: r.urlMain || "", url_user: r.url || "", exists: { encontrado: "Claimed", disponivel: "Available", ilegal: "Illegal", waf: "WAF", desconhecido: "Unknown" }[r.status], resultado: ROT[r.status], http_status: r.http, response_time_s: r.ms ? (r.ms / 1000).toFixed(2) : "", verificado_em: r.quando.toLocaleString("pt-BR") }));
  $("#baixarTxt").onclick = () => { const t = E.usuarios.map(u => { const f = E.res.filter(r => r.usuario === u && r.status === "encontrado"); return f.map(r => r.url).join("\n") + "\nTotal Websites Username Detected On : " + f.length; }).join("\n\n"); baixar(new Blob([t + "\n"], { type: "text/plain" }), nomeArq() + ".txt"); };
  $("#baixarCsv").onclick = () => { const l = linhas(), k = Object.keys(l[0] || {}); const csv = [k.join(",")].concat(l.map(o => k.map(c => '"' + String(o[c]).replace(/"/g, '""') + '"').join(","))).join("\r\n"); baixar(new Blob(["﻿" + csv], { type: "text/csv" }), nomeArq() + ".csv"); };
  $("#baixarXlsx").onclick = async () => {
    if (!window.XLSX) await new Promise((ok, falha) => { const s = document.createElement("script"); s.src = "../vendor/xlsx/xlsx.full.min.js"; s.onload = ok; s.onerror = () => falha(new Error("Não foi possível carregar o gerador de planilhas.")); document.head.appendChild(s); }).catch(e => window.HUB.toast(e.message));
    if (!window.XLSX) return;
    const wb = window.XLSX.utils.book_new(), ws = window.XLSX.utils.json_to_sheet(linhas()); ws["!cols"] = [14, 22, 30, 50, 10, 22, 10, 12, 20].map(w => ({ wch: w }));
    window.XLSX.utils.book_append_sheet(wb, ws, "Resultados"); baixar(new Blob([window.XLSX.write(wb, { type: "array", bookType: "xlsx" })], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }), nomeArq() + ".xlsx");
  };
  $("#baixarDocx").onclick = async () => {
    const P = window.TPC_PECA, b = [], dt = P.dataExtenso(E.inicio);
    b.push({ t: "tit", texto: "RELATÓRIO DE VERIFICAÇÃO DE NOMES DE USUÁRIO" });
    b.push({ t: "tab", larg: [1.4, 3], linhas: [["Usuários pesquisados", E.usuarios.join(", ")], ["Início da verificação", E.inicio.toLocaleString("pt-BR")], ["Término", (E.fim || new Date()).toLocaleString("pt-BR")], ["Sites consultados", String(new Set(E.res.map(r => r.site)).size)]] });
    b.push({ t: "h", texto: "Metodologia" });
    b.push({ t: "p", r: "A verificação seguiu a metodologia e a base de sites do projeto aberto Sherlock (sherlock-project, licença MIT). Para cada site, o endereço público do perfil foi consultado, e a existência da conta foi inferida pela resposta do servidor: o código HTTP, a presença de mensagem de perfil inexistente ou o redirecionamento para página de erro, conforme a regra própria de cada site. Respostas de bloqueio, limite de requisições ou falha do servidor foram classificadas como inconclusivas." });
    b.push({ t: "p", r: "A coincidência de nome de usuário indica a existência de um perfil público com esse identificador, mas não comprova, por si só, a titularidade. A utilização processual recomenda a preservação do conteúdo com data e hora, por ata notarial (CPC, art. 384) ou por coleta com cadeia de custódia (CPP, arts. 158-A a 158-F), e a confirmação da identidade por outros elementos." });
    E.usuarios.forEach(u => {
      const f = E.res.filter(r => r.usuario === u && r.status === "encontrado").sort((a, c) => a.site.localeCompare(c.site, "pt-BR")), inc = E.res.filter(r => r.usuario === u && inconclusivo(r)).length;
      b.push({ t: "h", texto: "Usuário " + u });
      b.push({ t: "p", r: f.length ? "Foram encontrados " + f.length + (f.length === 1 ? " perfil" : " perfis") + " com o nome de usuário “" + u + "”." + (inc ? " Em " + inc + " sites o resultado foi inconclusivo." : "") : "Nenhum perfil foi encontrado com o nome de usuário “" + u + "”." + (inc ? " Em " + inc + " sites o resultado foi inconclusivo." : "") });
      if (f.length) b.push({ t: "tab", cab: ["Site", "Endereço do perfil", "HTTP", "Verificado em"], larg: [1.2, 3.2, 0.5, 1.3], linhas: f.map(r => [r.site, r.url, String(r.http), r.quando.toLocaleString("pt-BR")]) });
    });
    b.push({ t: "data", texto: "Belo Horizonte, " + dt + "." });
    try { P.baixar(await P.docx(b), nomeArq()); } catch (e) { window.HUB.toast(e.message || "Não foi possível gerar o Word.", 5000); }
  };

  carregarSites(); estado();
  window.SHERLOCK_ESTADO = E;
})();
