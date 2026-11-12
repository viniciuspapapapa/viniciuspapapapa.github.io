/* Rede de empresas e sócios: busca da pessoa no índice cifrado de sócios da Receita (partes servidas pelo sherlock-tpc
   em /socios/parte), dados e quadro societário de cada empresa pela BrasilAPI, grafo de pessoas e empresas com
   endereços em comum (layout de forças em SVG), expansão por sócio e relatório em Word. */
(function () {
  "use strict";
  const $ = s => document.querySelector(s), esc = s => window.HUB.esc(s), P = window.TPC_PECA;
  const CFG = (window.HUB_CONFIG && window.HUB_CONFIG.sherlock) || {}, SERV = (CFG.url || "https://sherlock-tpc.viniciuspapapapa.workers.dev").replace(/\/+$/, "");
  const H = CFG.token ? { "X-App-Token": CFG.token } : {};
  const N = 4096;
  /* as mesmas funções do gerador (_ferramentas/bases/socios.mjs) */
  const norm = s => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase().replace(/[^A-Z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();
  const parte = s => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0) % N; };
  const dig = s => String(s || "").replace(/\D/g, "");
  const moeda = v => (+v || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  const br = d => { const s = String(d || ""); const m = s.match(/^(\d{4})-?(\d{2})-?(\d{2})/); return m ? m[3] + "/" + m[2] + "/" + m[1] : s; };
  const QUAL = { "05": "Administrador", "08": "Conselheiro de administração", "10": "Diretor", "16": "Presidente", "17": "Procurador", "22": "Sócio", "28": "Sócio-gerente", "29": "Sócio incapaz", "30": "Sócio menor", "31": "Sócio ostensivo", "37": "Sócio PJ no exterior", "38": "Sócio PF no exterior", "47": "Sócio PF", "48": "Sócio PJ", "49": "Sócio-administrador", "50": "Empresário", "52": "Sócio com capital", "53": "Sócio sem capital", "54": "Fundador", "59": "Produtor rural", "63": "Cotas em tesouraria", "65": "Titular (EIRELI)", "66": "Titular no exterior", "68": "Titular PJ", "69": "Beneficiário final", "70": "Administrador no exterior", "74": "Sócio-administrador no exterior" };
  const FAIXA = { "1": "até 12 anos", "2": "13 a 20 anos", "3": "21 a 30 anos", "4": "31 a 40 anos", "5": "41 a 50 anos", "6": "51 a 60 anos", "7": "61 a 70 anos", "8": "71 a 80 anos", "9": "mais de 80 anos" };
  const qual = c => QUAL[String(c).padStart(2, "0")] || (c ? "qualificação " + c : "");
  function cnpjMatriz(b8) { const b = String(b8).padStart(8, "0") + "0001", dv = (s, p) => { let t = 0; for (let i = 0; i < s.length; i++) t += +s[i] * p[i]; const r = t % 11; return r < 2 ? 0 : 11 - r; }; const d1 = dv(b, [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]), d2 = dv(b + d1, [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]); return b + d1 + d2; }
  const fmtCnpj = d => d.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5");
  function prog(f) { $("#barra").hidden = f == null; if (f != null) $("#barra i").style.width = Math.round(f * 100) + "%"; }

  /* ------------------------------------------------------------------ índice cifrado */
  let CHAVE = null;
  async function chave() {
    if (CHAVE) return CHAVE; let k = null; try { k = sessionStorage.getItem("hub_chave"); if (!k) { const l = JSON.parse(localStorage.getItem("hub_chave") || "null"); if (l && l.ate > Date.now()) k = l.k; } } catch (e) { k = null; }
    if (!k) { location.replace("../login/?volta=" + encodeURIComponent(location.pathname)); throw new Error("Sessão expirada."); }
    return (CHAVE = await crypto.subtle.importKey("raw", Uint8Array.from(atob(k), c => c.charCodeAt(0)), "AES-GCM", false, ["decrypt"]));
  }
  const cacheParte = new Map();
  async function vinculos(nome) {
    const n = norm(nome), p = parte(n); let linhas = cacheParte.get(p);
    if (!linhas) {
      const r = await fetch(SERV + "/socios/parte?n=" + p, { headers: H });
      if (!r.ok) { const d = await r.json().catch(() => ({})); throw new Error(d.erro || "Índice de sócios indisponível (HTTP " + r.status + ")."); }
      const u = new Uint8Array(await r.arrayBuffer());
      if (!u.length) linhas = [];
      else {
        let claro; try { claro = await crypto.subtle.decrypt({ name: "AES-GCM", iv: u.slice(0, 12) }, await chave(), u.slice(12)); } catch (e) { throw new Error("O índice não pôde ser decifrado com a senha atual do HUB; será refeito na próxima atualização mensal."); }
        linhas = (await new Response(new Blob([claro]).stream().pipeThrough(new DecompressionStream("gzip"))).text()).split("\n");
      }
      cacheParte.set(p, linhas);
    }
    return linhas.filter(l => l.startsWith(n + "\t")).map(l => { const c = l.split("\t"); return { nome: c[0], doc: c[1], cnpj8: c[2], qual: c[3], entrada: c[4], ident: c[5], faixa: c[6] }; });
  }
  fetch(SERV + "/socios/info", { headers: H }).then(r => r.json()).then(d => { $("#baseInfo").textContent = d.erro ? d.erro : "Base de sócios da Receita de " + String(d.mes || "").split("-").reverse().join("/") + " · " + (+d.linhas || 0).toLocaleString("pt-BR") + " vínculos."; }).catch(() => {});

  /* ------------------------------------------------------------------ empresas (BrasilAPI) */
  const EMP = new Map();
  async function empresa(cnpj14) {
    if (EMP.has(cnpj14)) return EMP.get(cnpj14);
    const p = (async () => { for (let t = 0; t < 3; t++) { const r = await fetch("https://brasilapi.com.br/api/cnpj/v1/" + cnpj14); if (r.status === 404) return null; if (r.ok) return r.json(); await new Promise(ok => setTimeout(ok, 1200 * (t + 1))); } throw new Error("Receita indisponível."); })();
    EMP.set(cnpj14, p); return p;
  }
  const endNorm = d => d ? norm([d.descricao_tipo_de_logradouro, d.logradouro, d.numero, d.cep].filter(Boolean).join(" ")) : "";
  const endTxt = d => d ? [[d.descricao_tipo_de_logradouro, d.logradouro].filter(Boolean).join(" "), d.numero, d.complemento, d.bairro, d.municipio && d.municipio + "/" + d.uf, d.cep].filter(Boolean).join(", ") : "";

  /* ------------------------------------------------------------------ grafo (estado) */
  const G = { nos: new Map(), arestas: new Map(), raiz: null };
  const idPessoa = (nome, doc) => "P:" + norm(nome) + "|" + (doc || "");
  function no(id, o) { let n = G.nos.get(id); if (!n) { n = Object.assign({ id, x: 400 + (Math.random() - 0.5) * 300, y: 300 + (Math.random() - 0.5) * 300, vx: 0, vy: 0 }, o); G.nos.set(id, n); } else Object.assign(n, Object.fromEntries(Object.entries(o).filter(([, v]) => v != null && v !== ""))); return n; }
  function aresta(a, b, o) { const k = a < b ? a + ">" + b : b + ">" + a; if (!G.arestas.has(k)) G.arestas.set(k, Object.assign({ a, b }, o)); }
  async function adicionarEmpresas(pessoaId, vincs) {
    const lista = vincs.slice(0, 60); let n = 0;
    await Promise.all(Array.from({ length: 3 }, async () => {
      while (lista.length) {
        const v = lista.shift(), cnpj = cnpjMatriz(v.cnpj8), eid = "E:" + v.cnpj8;
        no(eid, { tipo: "empresa", cnpj, rotulo: "CNPJ " + fmtCnpj(cnpj), carregando: true });
        aresta(pessoaId, eid, { rotulo: qual(v.qual), entrada: v.entrada });
        try {
          const d = await empresa(cnpj);
          if (d) {
            no(eid, { rotulo: d.razao_social || "", dados: d, situacao: d.descricao_situacao_cadastral || "", carregando: false, end: endNorm(d) });
            for (const s of d.qsa || []) {
              const pj = /^\d{14}$/.test(dig(s.cnpj_cpf_do_socio)), sid = pj ? "E:" + dig(s.cnpj_cpf_do_socio).slice(0, 8) : idPessoa(s.nome_socio, s.cnpj_cpf_do_socio);
              if (pj) no(sid, { tipo: "empresa", pjSocia: true, cnpj: dig(s.cnpj_cpf_do_socio), rotulo: s.nome_socio });
              else if (!G.nos.has(sid) || G.nos.get(sid).tipo !== "raiz") no(sid, { tipo: "pessoa", nome: s.nome_socio, doc: s.cnpj_cpf_do_socio, rotulo: s.nome_socio, faixa: s.faixa_etaria || "" });
              aresta(sid, eid, { rotulo: s.qualificacao_socio || "", entrada: s.data_entrada_sociedade });
            }
          } else no(eid, { carregando: false, rotulo: "CNPJ " + fmtCnpj(cnpj) + " (não encontrado)" });
        } catch (e) { no(eid, { carregando: false, erro: e.message }); }
        n++; prog(n / vincs.length); desenhar();
      }
    }));
    /* endereços em comum entre empresas */
    const ends = new Map(); for (const nn of G.nos.values()) if (nn.tipo === "empresa" && nn.end) { if (!ends.has(nn.end)) ends.set(nn.end, []); ends.get(nn.end).push(nn.id); }
    for (const ids of ends.values()) for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j++) aresta(ids[i], ids[j], { rotulo: "mesmo endereço", tipo: "end" });
    prog(null);
  }

  /* ------------------------------------------------------------------ busca */
  $("#buscar").onclick = async () => {
    const nome = $("#nome").value.trim(), d = dig($("#doc").value);
    if (!nome && d.length !== 14) { $("#estado").textContent = "Informe o nome completo, ou o CNPJ de uma empresa."; return; }
    G.nos.clear(); G.arestas.clear(); $("#pessoas").innerHTML = ""; $("#buscar").disabled = true;
    try {
      if (d.length === 14) {
        $("#estado").textContent = "Consultando a empresa na Receita…";
        const dados = await empresa(d); if (!dados) throw new Error("CNPJ não encontrado na Receita.");
        const id = "E:" + d.slice(0, 8); no(id, { tipo: "empresa", raiz: true, cnpj: d, rotulo: dados.razao_social, dados, situacao: dados.descricao_situacao_cadastral, end: endNorm(dados) }); G.raiz = id;
        for (const s of dados.qsa || []) { const pj = /^\d{14}$/.test(dig(s.cnpj_cpf_do_socio)), sid = pj ? "E:" + dig(s.cnpj_cpf_do_socio).slice(0, 8) : idPessoa(s.nome_socio, s.cnpj_cpf_do_socio); no(sid, pj ? { tipo: "empresa", pjSocia: true, cnpj: dig(s.cnpj_cpf_do_socio), rotulo: s.nome_socio } : { tipo: "pessoa", nome: s.nome_socio, doc: s.cnpj_cpf_do_socio, rotulo: s.nome_socio, faixa: s.faixa_etaria }); aresta(sid, id, { rotulo: s.qualificacao_socio, entrada: s.data_entrada_sociedade }); }
        G.nos.delete("__"); mostrarRede(); tabela(); $("#estado").textContent = "Rede da empresa montada. Expanda os sócios para ver as outras empresas deles.";
      } else {
        $("#estado").textContent = "Procurando o nome na base de sócios da Receita…";
        let v = await vinculos(nome);
        if (d.length === 11) v = v.filter(x => x.doc.replace(/\D/g, "") === d.slice(3, 9));
        if (!v.length) { $("#estado").textContent = "Nenhum vínculo societário com esse nome exato" + (d.length === 11 ? " e esse CPF" : "") + ". Confira a grafia completa ou parta do CNPJ de uma empresa conhecida."; return; }
        const pessoas = new Map(); v.forEach(x => { const k = x.doc + "|" + x.faixa; if (!pessoas.has(k)) pessoas.set(k, []); pessoas.get(k).push(x); });
        if (pessoas.size > 1) {
          $("#estado").textContent = "Há " + pessoas.size + " pessoas com esse nome na base (CPF parcial e faixa etária diferentes). Escolha uma ou várias:";
          $("#pessoas").innerHTML = '<div class="pessoas">' + [...pessoas].map(([k, l], i) => '<label><input type="checkbox" value="' + i + '"' + (i === 0 ? " checked" : "") + "> <span><b>" + esc(l[0].nome) + "</b> · documento " + esc(l[0].doc || "não informado") + (FAIXA[l[0].faixa] ? " · " + FAIXA[l[0].faixa] : "") + " · " + l.length + (l.length === 1 ? " empresa" : " empresas") + "</span></label>").join("") + '</div><div class="linha-btns" style="margin-top:10px"><button type="button" class="btn" id="usar">Montar com as selecionadas</button></div>';
          const grupos = [...pessoas.values()];
          $("#usar").onclick = async () => { const esc2 = [...document.querySelectorAll("#pessoas input:checked")].map(i => grupos[+i.value]); if (!esc2.length) return; $("#pessoas").innerHTML = ""; await montarPessoas(esc2); };
          return;
        }
        await montarPessoas([...pessoas.values()]);
      }
    } catch (e) { $("#estado").textContent = e.message || String(e); }
    finally { $("#buscar").disabled = false; }
  };
  async function montarPessoas(grupos) {
    $("#estado").textContent = "Consultando as empresas na Receita…"; mostrarRede();
    for (const l of grupos) { const id = idPessoa(l[0].nome, l[0].doc); no(id, { tipo: "raiz", nome: l[0].nome, doc: l[0].doc, faixa: l[0].faixa, rotulo: l[0].nome }); G.raiz = G.raiz || id; await adicionarEmpresas(id, l); }
    $("#estado").textContent = "Rede montada: " + [...G.nos.values()].filter(n => n.tipo === "empresa").length + " empresas e " + [...G.nos.values()].filter(n => n.tipo !== "empresa").length + " pessoas."; desenhar(); tabela();
  }
  async function expandir(n) {
    $("#estado").textContent = "Procurando as empresas de " + n.rotulo + "…"; prog(0.05);
    try {
      let v = await vinculos(n.nome || n.rotulo); const d6 = String(n.doc || "").replace(/\D/g, "");
      if (d6.length === 6) v = v.filter(x => x.doc.replace(/\D/g, "") === d6);
      const novos = v.filter(x => !G.nos.has("E:" + x.cnpj8) || !G.arestas.has((n.id < "E:" + x.cnpj8 ? n.id + ">E:" + x.cnpj8 : "E:" + x.cnpj8 + ">" + n.id)));
      n.expandido = true; await adicionarEmpresas(n.id, novos);
      $("#estado").textContent = novos.length ? novos.length + (novos.length === 1 ? " empresa acrescentada." : " empresas acrescentadas.") : "Nenhuma outra empresa encontrada para " + n.rotulo + " na base.";
    } catch (e) { $("#estado").textContent = e.message || String(e); prog(null); }
    desenhar(); tabela();
  }

  /* ------------------------------------------------------------------ desenho e layout de forças */
  const svg = $("#grafo"); let W = 800, Hh = 600, anim = null, arrastando = null, sel = null;
  function mostrarRede() { $("#resBloco").hidden = false; const r = svg.getBoundingClientRect(); W = r.width || 800; Hh = r.height || 600; svg.setAttribute("viewBox", "0 0 " + W + " " + Hh); iniciar(); }
  const cor = n => n.tipo === "raiz" ? "#2B2B2B" : n.tipo === "pessoa" ? "#E8E347" : n.pjSocia ? "#1BAF7A" : /ATIVA/i.test(n.situacao || "ATIVA") ? "#2A78D6" : "#B8B8B8";
  const raio = n => n.tipo === "raiz" ? 13 : n.tipo === "empresa" ? 9 : 7;
  function passo() {
    const ns = [...G.nos.values()], k = 90;
    for (const a of ns) { a.fx = 0; a.fy = 0; }
    for (let i = 0; i < ns.length; i++) for (let j = i + 1; j < ns.length; j++) { const a = ns[i], b = ns[j]; let dx = a.x - b.x, dy = a.y - b.y, d2 = dx * dx + dy * dy + 0.01, f = (k * k) / d2; if (d2 > 160000) continue; a.fx += dx * f * 0.05; a.fy += dy * f * 0.05; b.fx -= dx * f * 0.05; b.fy -= dy * f * 0.05; }
    for (const e of G.arestas.values()) { const a = G.nos.get(e.a), b = G.nos.get(e.b); if (!a || !b) continue; const dx = b.x - a.x, dy = b.y - a.y, d = Math.sqrt(dx * dx + dy * dy) + 0.01, f = (d - (e.tipo === "end" ? 120 : k)) * 0.02; a.fx += dx / d * f * d * 0.05; a.fy += dy / d * f * d * 0.05; b.fx -= dx / d * f * d * 0.05; b.fy -= dy / d * f * d * 0.05; }
    for (const a of ns) { if (a === arrastando) continue; a.fx += (W / 2 - a.x) * 0.004; a.fy += (Hh / 2 - a.y) * 0.004; a.vx = (a.vx + a.fx) * 0.6; a.vy = (a.vy + a.fy) * 0.6; a.x = Math.max(20, Math.min(W - 20, a.x + Math.max(-20, Math.min(20, a.vx)))); a.y = Math.max(20, Math.min(Hh - 20, a.y + Math.max(-20, Math.min(20, a.vy)))); }
  }
  function iniciar(it) { let n = it || 300; cancelAnimationFrame(anim); const f = () => { for (let i = 0; i < 3; i++) passo(); render(); if (--n > 0) anim = requestAnimationFrame(f); }; f(); }
  function desenhar() { if (!$("#resBloco").hidden) iniciar(160); }
  function render() {
    const ns = [...G.nos.values()], NS = "http://www.w3.org/2000/svg";
    svg.innerHTML = "";
    for (const e of G.arestas.values()) { const a = G.nos.get(e.a), b = G.nos.get(e.b); if (!a || !b) continue; const l = document.createElementNS(NS, "line"); l.setAttribute("x1", a.x); l.setAttribute("y1", a.y); l.setAttribute("x2", b.x); l.setAttribute("y2", b.y); l.setAttribute("class", "aresta" + (e.tipo === "end" ? " end" : "")); svg.appendChild(l); }
    for (const n of ns) {
      const g = document.createElementNS(NS, "g"); g.setAttribute("class", "no"); g.dataset.id = n.id;
      const c = document.createElementNS(NS, "circle"); c.setAttribute("cx", n.x); c.setAttribute("cy", n.y); c.setAttribute("r", raio(n)); c.setAttribute("fill", cor(n)); c.setAttribute("stroke", n === sel ? "#EB6834" : n.expandido ? "#2B2B2B" : "#fff"); c.setAttribute("stroke-width", n === sel ? 3 : 1.5); g.appendChild(c);
      if (ns.length <= 80 || n.tipo !== "pessoa" || n === sel) { const t = document.createElementNS(NS, "text"); t.setAttribute("x", n.x + raio(n) + 3); t.setAttribute("y", n.y + 4); t.textContent = String(n.rotulo || "").slice(0, 34) + (n.carregando ? "…" : ""); g.appendChild(t); }
      svg.appendChild(g);
    }
  }
  const pt = e => { const r = svg.getBoundingClientRect(); return [(e.clientX - r.left) * W / r.width, (e.clientY - r.top) * Hh / r.height]; };
  svg.addEventListener("pointerdown", e => { const g = e.target.closest(".no"); if (!g) return; arrastando = G.nos.get(g.dataset.id); sel = arrastando; detalhe(sel); svg.setPointerCapture(e.pointerId); });
  svg.addEventListener("pointermove", e => { if (!arrastando) return; const [x, y] = pt(e); arrastando.x = x; arrastando.y = y; render(); });
  svg.addEventListener("pointerup", () => { if (arrastando) { arrastando = null; iniciar(60); } });
  $("#reorganizar").onclick = () => { for (const n of G.nos.values()) { n.x = W / 2 + (Math.random() - 0.5) * W * 0.6; n.y = Hh / 2 + (Math.random() - 0.5) * Hh * 0.6; } iniciar(400); };

  function detalhe(n) {
    const lig = [...G.arestas.values()].filter(e => e.a === n.id || e.b === n.id).map(e => ({ outro: G.nos.get(e.a === n.id ? e.b : e.a), e })).filter(x => x.outro);
    let h = "<h3>" + esc(n.rotulo || "") + "</h3>";
    if (n.tipo === "empresa") {
      const d = n.dados;
      h += '<dl class="dl" style="display:grid;grid-template-columns:max-content 1fr;gap:2px 10px;font-size:13.5px"><dt>CNPJ</dt><dd>' + esc(fmtCnpj(n.cnpj || "")) + "</dd>" + (d ? "<dt>Situação</dt><dd>" + esc(d.descricao_situacao_cadastral || "") + "</dd><dt>Abertura</dt><dd>" + esc(br(d.data_inicio_atividade)) + "</dd><dt>Capital</dt><dd>" + esc(moeda(d.capital_social)) + "</dd><dt>Atividade</dt><dd>" + esc(d.cnae_fiscal_descricao || "") + "</dd><dt>Endereço</dt><dd>" + esc(endTxt(d)) + "</dd>" : "") + "</dl>";
    } else h += '<p class="pequeno">Documento: ' + esc(n.doc || "não divulgado") + (FAIXA[n.faixa] ? " · " + FAIXA[n.faixa] : "") + "</p>" + (n.tipo !== "raiz" && !n.expandido ? '<p><button type="button" class="btn sec peq" id="expandir">Expandir: outras empresas desta pessoa</button></p>' : "");
    h += '<p class="pequeno" style="margin:8px 0 2px"><b>Ligações (' + lig.length + ")</b></p>" + lig.map(x => '<div class="pequeno" style="padding:3px 0;border-top:1px solid var(--line)">' + esc(x.outro.rotulo || "") + ' <span class="mudo">· ' + esc(x.e.rotulo || "") + (x.e.entrada ? " desde " + esc(br(x.e.entrada)) : "") + "</span></div>").join("");
    $("#painel").innerHTML = h; render();
    const b = $("#expandir"); if (b) b.onclick = () => { b.disabled = true; expandir(n); };
  }
  function tabela() {
    const es = [...G.nos.values()].filter(n => n.tipo === "empresa" && n.dados).sort((a, b) => String(a.rotulo).localeCompare(String(b.rotulo), "pt-BR"));
    $("#tabela").innerHTML = '<table class="t"><thead><tr><th>Empresa</th><th>CNPJ</th><th>Situação</th><th>Abertura</th><th>Capital</th><th>Município</th><th>Vínculos na rede</th></tr></thead><tbody>' + es.map(n => { const d = n.dados, v = [...G.arestas.values()].filter(e => (e.a === n.id || e.b === n.id) && e.tipo !== "end").map(e => { const o = G.nos.get(e.a === n.id ? e.b : e.a); return o && o.tipo !== "empresa" ? o.rotulo + " (" + (e.rotulo || "") + ")" : ""; }).filter(Boolean); return "<tr><td>" + esc(n.rotulo) + "</td><td>" + esc(fmtCnpj(n.cnpj)) + "</td><td>" + esc(d.descricao_situacao_cadastral || "") + "</td><td>" + esc(br(d.data_inicio_atividade)) + "</td><td>" + esc(moeda(d.capital_social)) + "</td><td>" + esc((d.municipio || "") + "/" + (d.uf || "")) + "</td><td>" + esc(v.slice(0, 6).join("; ")) + (v.length > 6 ? " e mais " + (v.length - 6) : "") + "</td></tr>"; }).join("") + "</tbody></table>";
  }

  /* ------------------------------------------------------------------ relatório */
  $("#relatorio").onclick = async () => {
    const es = [...G.nos.values()].filter(n => n.tipo === "empresa" && n.dados), raizes = [...G.nos.values()].filter(n => n.tipo === "raiz" || n.raiz);
    const b = [{ t: "tit", texto: "RELATÓRIO DE REDE SOCIETÁRIA" }];
    b.push({ t: "tab", larg: [1.4, 3], linhas: [["Processo ou caso", $("#caso").value.trim() || "não informado"], ["Ponto de partida", raizes.map(r => r.rotulo + (r.doc ? " (" + r.doc + ")" : r.cnpj ? " (" + fmtCnpj(r.cnpj) + ")" : "")).join("; ")], ["Data", new Date().toLocaleString("pt-BR")], ["Empresas na rede", String(es.length)]] });
    b.push({ t: "h", texto: "Metodologia" });
    b.push({ t: "p", r: "Os vínculos entre pessoas e empresas foram extraídos da base aberta de sócios do Cadastro Nacional da Pessoa Jurídica, divulgada pela Receita Federal, pela coincidência exata do nome normalizado e, quando disponível, dos dígitos do CPF divulgados pela Receita. Os dados de cada empresa e o quadro societário atual foram obtidos da Receita Federal. Os endereços em comum consideram logradouro, número e CEP coincidentes." });
    b.push({ t: "p", r: [["Ressalva: ", "bo"], ["a coincidência de nome não comprova identidade, e a base reflete o cadastro na data de sua divulgação. Os vínculos relevantes devem ser confirmados por certidão da junta comercial.", "n"]] });
    b.push({ t: "h", texto: "Empresas" });
    b.push({ t: "tab", cab: ["Empresa e CNPJ", "Situação e abertura", "Capital", "Sócios e administradores"], larg: [1.8, 1.1, 0.9, 2.2], linhas: es.map(n => { const d = n.dados; return [n.rotulo + " · " + fmtCnpj(n.cnpj), (d.descricao_situacao_cadastral || "") + ", desde " + br(d.data_inicio_atividade), moeda(d.capital_social), (d.qsa || []).map(s => s.nome_socio + " (" + (s.qualificacao_socio || "") + ")").join("; ")]; }) });
    const ends = [...G.arestas.values()].filter(e => e.tipo === "end");
    if (ends.length) { b.push({ t: "h", texto: "Endereços em comum" }); b.push({ t: "tab", cab: ["Empresa", "Empresa", "Endereço"], larg: [1.8, 1.8, 2.2], linhas: ends.map(e => { const a = G.nos.get(e.a), c = G.nos.get(e.b); return [a.rotulo, c.rotulo, endTxt(a.dados)]; }) }); }
    const pessoas = [...G.nos.values()].filter(n => n.tipo === "pessoa").map(p => ({ p, n: [...G.arestas.values()].filter(e => e.a === p.id || e.b === p.id).length })).filter(x => x.n > 1).sort((a, b) => b.n - a.n);
    if (pessoas.length) { b.push({ t: "h", texto: "Pessoas presentes em mais de uma empresa" }); b.push({ t: "tab", cab: ["Pessoa", "Empresas"], larg: [2.4, 3], linhas: pessoas.map(x => [x.p.rotulo + (x.p.doc ? " (" + x.p.doc + ")" : ""), [...G.arestas.values()].filter(e => e.a === x.p.id || e.b === x.p.id).map(e => (G.nos.get(e.a === x.p.id ? e.b : e.a) || {}).rotulo).join("; ")]) }); }
    b.push({ t: "data", texto: "Belo Horizonte, " + P.dataExtenso(new Date()) + "." });
    try { P.baixar(await P.docx(b), "Rede societaria - " + ($("#caso").value.trim() || "caso").replace(/[\\/:*?"<>|]+/g, " ")); } catch (e) { window.HUB.toast(e.message || "Não foi possível gerar o Word.", 5000); }
  };
})();
