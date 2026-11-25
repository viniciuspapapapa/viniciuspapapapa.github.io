/* Gestão da carteira: painel dos processos da área a partir da planilha exportada do ADVWin.
   A planilha é lida no navegador; a base e as anotações (verificações, discussões, providências, prioridade e
   etiquetas) ficam no IndexedDB deste computador, cifradas com a chave do HUB, e nunca vão a um servidor.
   Os casos são reconhecidos pelo código da pasta, de modo que uma nova importação preserva as anotações. */
(function () {
  "use strict";
  const $ = s => document.querySelector(s), $$ = s => [...document.querySelectorAll(s)], esc = s => window.HUB.esc(s), P = window.TPC_PECA;
  const sem = s => String(s == null ? "" : s).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
  const dig = s => String(s || "").replace(/\D/g, "");
  const hojeISO = () => new Date().toISOString().slice(0, 10);
  const dBr = s => s ? String(s).slice(0, 10).split("-").reverse().join("/") : "";
  const dias = (a, b) => Math.round((new Date(b + "T12:00:00") - new Date(a + "T12:00:00")) / 86400000);
  const maisDias = (iso, n) => { const d = new Date(iso + "T12:00:00"); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };
  const nfmt = n => (+n || 0).toLocaleString("pt-BR");
  const pctf = (a, b) => b ? (a / b * 100).toLocaleString("pt-BR", { maximumFractionDigits: 1 }) + "%" : "0%";
  /* nome em caixa normal, preservando siglas curtas (BH, BTC, MG) e partículas em minúscula */
  const PART = new Set(["de", "da", "do", "das", "dos", "e", "em", "na", "no", "para", "por", "a", "o"]);
  const titulo = s => String(s || "").split(/(\s+)/).map((w, i) => { if (/^\s+$/.test(w) || !w) return w; const l = w.toLowerCase(); if (i > 0 && PART.has(l)) return l; if (w.length <= 3 && /^[A-ZÀ-Ý]+$/.test(w) && !PART.has(l)) return w; return l.replace(/(^|[(/-])([a-zà-ÿ])/g, (m, a, b) => a + b.toUpperCase()); }).join("");
  function lib(nome, url, cdn, ok) {
    if (ok()) return Promise.resolve();
    return new Promise((res, rej) => { const t = i => { const u = [new URL(url, location.href).href, cdn][i]; if (!u) return rej(new Error("Não foi possível carregar " + nome + ".")); const s = document.createElement("script"); s.src = u; s.onload = () => ok() ? res() : t(i + 1); s.onerror = () => { s.remove(); t(i + 1); }; document.head.appendChild(s); }; t(0); });
  }
  /* cada biblioteca é carregada uma única vez, mesmo com várias chamadas simultâneas */
  const umaVez = f => { let p = null; return () => p || (p = f().catch(e => { p = null; throw e; })); };
  const xlsx = umaVez(() => lib("SheetJS", "../vendor/xlsx/xlsx.full.min.js", "https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js", () => typeof XLSX !== "undefined"));
  const chartLib = umaVez(() => lib("Chart.js", "../vendor/chartjs/chart.umd.min.js", "https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.0/chart.umd.min.js", () => typeof Chart !== "undefined"));

  /* ------------------------------------------------------------------ armazenamento cifrado */
  let CHAVE = null;
  async function chave() {
    if (CHAVE) return CHAVE;
    let k = null; try { k = sessionStorage.getItem("hub_chave"); if (!k) { const l = JSON.parse(localStorage.getItem("hub_chave") || "null"); if (l && l.ate > Date.now()) k = l.k; } } catch (e) { k = null; }
    if (!k) { location.replace("../login/?volta=" + encodeURIComponent(location.pathname)); throw new Error("Sessão expirada."); }
    return (CHAVE = await crypto.subtle.importKey("raw", Uint8Array.from(atob(k), c => c.charCodeAt(0)), "AES-GCM", false, ["encrypt", "decrypt"]));
  }
  const DB = {
    abrir() { return this.p || (this.p = new Promise((ok, falha) => { try { const r = indexedDB.open("hub_carteira", 1); r.onupgradeneeded = () => r.result.createObjectStore("dados"); r.onsuccess = () => ok(r.result); r.onerror = () => falha(r.error); } catch (e) { falha(e); } })); },
    async ler(k) { const db = await this.abrir(); return new Promise(ok => { const r = db.transaction("dados").objectStore("dados").get(k); r.onsuccess = () => ok(r.result || null); r.onerror = () => ok(null); }); },
    async gravar(k, v) { const db = await this.abrir(); return new Promise(ok => { const t = db.transaction("dados", "readwrite"); t.objectStore("dados").put(v, k); t.oncomplete = ok; t.onerror = ok; }); },
    async apagar(k) { const db = await this.abrir(); return new Promise(ok => { const t = db.transaction("dados", "readwrite"); t.objectStore("dados").delete(k); t.oncomplete = ok; t.onerror = ok; }); }
  };
  async function cifrar(obj, k) { const iv = crypto.getRandomValues(new Uint8Array(12)); const ct = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, k, new TextEncoder().encode(JSON.stringify(obj)))); return { iv, ct }; }
  async function decifrar(reg, k) { return JSON.parse(new TextDecoder().decode(await crypto.subtle.decrypt({ name: "AES-GCM", iv: reg.iv }, k, reg.ct))); }
  const CFG_PADRAO = { autor: "", intervalos: { estrategico: 7, reuPreso: 7, importante: 15, fisico: 30 }, parado: 120 };
  let S = { base: null, anot: {}, cfg: JSON.parse(JSON.stringify(CFG_PADRAO)), historico: [] };
  let tmSalvar = null;
  function salvar() { clearTimeout(tmSalvar); tmSalvar = setTimeout(async () => { try { await DB.gravar("estado", await cifrar(S, await chave())); } catch (e) { window.HUB.toast("Não foi possível salvar: " + (e.message || e), 5000); } }, 300); }
  async function carregar() {
    const reg = await DB.ler("estado"); if (!reg) return false;
    try { const o = await decifrar(reg, await chave()); S = Object.assign(S, o); S.cfg = Object.assign(JSON.parse(JSON.stringify(CFG_PADRAO)), o.cfg || {}); S.cfg.intervalos = Object.assign({}, CFG_PADRAO.intervalos, (o.cfg || {}).intervalos || {}); return true; }
    catch (e) { $("#estadoVazio").textContent = "Há dados salvos neste navegador, mas eles não puderam ser decifrados com a senha atual do HUB (a senha pode ter mudado). Restaure a cópia de segurança em Dados e configurações ou importe a planilha novamente."; return false; }
  }

  /* ------------------------------------------------------------------ leitura da planilha do ADVWin */
  const COLS = {
    cod: /codigo da pasta/, cliente: /^cliente$/, grupo: /grupo economico/, contraria: /parte contraria/, tipo: /tipo de acao/, numero: /numero (do )?processo/,
    comarca: /comarca/, tribunal: /^tribunal$/, sistema: /sistema/, assunto: /assunto/, tags: /tags/, natureza: /natureza/, advResp: /advogado responsavel/, advLider: /advogado lider/,
    entrada: /data de entrada/, distribuicao: /data de distribuicao/, ultAtualizacao: /ultima atualizacao/, comentarios: /^comentarios/, decisao: /^decisao/, idAutojur: /id pasta/, subpasta: /subpasta/, status: /status/, vara: /vara|juizo|orgao/
  };
  const iso = v => { if (v == null || v === "") return ""; if (v instanceof Date) return isNaN(v) ? "" : new Date(v.getTime() - v.getTimezoneOffset() * 60000).toISOString().slice(0, 10); const s = String(v).trim(); let m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s); if (m) return m[0]; m = /^(\d{2})\/(\d{2})\/(\d{4})/.exec(s); if (m) return m[3] + "-" + m[2] + "-" + m[1]; if (/^\d{5}(\.\d+)?$/.test(s)) { const d = new Date(Date.UTC(1899, 11, 30) + parseFloat(s) * 86400000); return d.toISOString().slice(0, 10); } return ""; };
  const TEMAS = [[/contravencao/i, "Contravenção penal (art. 50 da LCP)"], [/procedimentos_administrativos|procedimentos administrativos/i, "Procedimentos administrativos e inquéritos"], [/maria_da_penha|maria da penha/i, "Lei Maria da Penha"], [/anpp|nao_persecucao/i, "Acordo de não persecução penal"], [/suspensao_condicional|suspensao condicional/i, "Suspensão condicional do processo"], [/transacao/i, "Transação penal"], [/inquerito_policial|inquerito policial/i, "Inquérito policial"], [/acao_penal|acao penal/i, "Ação penal"]];
  const MARCAS = { importante: /processo_importante/i, estrategico: /estrategic/i, segredo: /segredo/i, reuPreso: /reu_preso|reu preso/i };
  function temaDe(tag) { const s = sem(tag); for (const [re, rot] of TEMAS) if (re.test(s)) return rot; return titulo(String(tag).replace(/^criminal_/i, "").replace(/_/g, " ")); }
  const FASES = [[/execucao/, "Execução penal"], [/apelacao|recurso|agravo|embargos|habeas|revisao criminal|mandado de seguranca|reclamacao/, "Recursos e tribunais"], [/acao penal|queixa|denuncia|ação penal/, "Ação penal"], [/inquerito|termo circunstanciado|noticia|representacao|investigacao|procedimento|flagrante|pic\b/, "Investigação"], [/cautelar|medida protetiva|busca e apreensao|restituicao|sequestro|incidente|precatoria|quebra/, "Medidas e incidentes"], [/indeniza|civel|cobranca/, "Cível"]];
  const faseDe = (tipo, natureza) => { const s = sem(tipo); if (/civel/.test(sem(natureza))) return "Cível"; for (const [re, f] of FASES) if (re.test(s)) return f; return "Outros"; };
  const ASSUNTOS = [[/tribut|sonegac|ordem tributaria|8\.137/, "Crimes tributários"], [/lavagem/, "Lavagem de dinheiro"], [/contraven|jogo do bicho|jogo de azar|art\.? ?50/, "Contravenção (jogo)"], [/estelionato|fraude|171/, "Estelionato e fraudes"], [/furto|roubo|receptac|155|157/, "Patrimônio (furto, roubo)"], [/apropriacao indebita|168/, "Apropriação indébita"], [/maria da penha|violencia domestica|ameaca|lesao corporal/, "Violência doméstica, ameaça e lesão"], [/calunia|difamac|injuria|honra/, "Crimes contra a honra"], [/drogas|trafico|entorpecente|11\.343/, "Drogas"], [/homicidio|feminicidio|vida/, "Crimes contra a vida"], [/licitac|peculato|corrupc|administracao publica|concussao|prevaricac/, "Administração pública"], [/organizacao criminosa|12\.850|associacao criminosa/, "Organização criminosa"], [/falsidade|falsificac|uso de documento/, "Falsidades"], [/ambiental|9\.605/, "Ambiental"], [/transito|embriaguez|9\.503/, "Trânsito"], [/sistema financeiro|7\.492|evasao de divisas/, "Sistema financeiro"], [/consumidor|8\.078|economia popular/, "Consumo e economia popular"], [/estupro|sexual|dignidade sexual|vulneravel/, "Crimes sexuais"]];
  const assuntoDe = a => { const s = sem(a); if (!s) return "Não informado"; for (const [re, r] of ASSUNTOS) if (re.test(s)) return r; return "Outros"; };
  const JUSTICA = { 1: "STF", 2: "CNJ", 3: "STJ", 4: "Justiça Federal", 5: "Justiça do Trabalho", 6: "Justiça Eleitoral", 7: "Justiça Militar da União", 8: "Justiça Estadual", 9: "Justiça Militar Estadual" };
  function caso(r) {
    const tags = String(r.tags || "").split(/[,;]+/).map(s => s.trim()).filter(Boolean);
    const num = String(r.numero || "").trim(), nd = dig(num), cnj = nd.length === 20;
    const temas = [...new Set(tags.filter(t => !Object.values(MARCAS).some(re => re.test(t))).map(temaDe))];
    const contravencao = temas.some(t => /Contravenção/.test(t));
    let grupo = String(r.grupo || "").trim(); if (/sem grupo/i.test(grupo)) grupo = "";
    const sistema = String(r.sistema || "").trim() || "Não informado";
    const fisicoSistema = /fisic/.test(sem(sistema));
    return {
      cod: String(r.cod || "").trim(), contravencao, grupoOrig: grupo, cliente: String(r.cliente || "").trim() || "(sem cliente)", grupo, chaveCli: grupo || String(r.cliente || "").trim() || "(sem cliente)",
      contraria: String(r.contraria || "").replace(/\s*\n\s*/g, " · ").trim(), tipo: String(r.tipo || "").trim() || "Não informado", numero: num, cnj, semNumero: !nd || /pre-?cadastro|pendente/i.test(num),
      justica: cnj ? (JUSTICA[nd[13]] || "") : "", anoCnj: cnj ? nd.slice(9, 13) : "", fisico: !cnj || fisicoSistema, fisicoSistema,
      comarca: String(r.comarca || "").trim() || "Não informada", tribunal: String(r.tribunal || "").trim(), vara: String(r.vara || "").trim(), sistema: fisicoSistema ? "Físico" : sistema, assunto: String(r.assunto || "").trim(), assuntoCat: assuntoDe(r.assunto),
      tags, temas: temas.length ? temas : ["Sem tema"], importante: MARCAS.importante.test(tags.join(",")), estrategico: MARCAS.estrategico.test(tags.join(",")), segredo: MARCAS.segredo.test(tags.join(",")), reuPreso: MARCAS.reuPreso.test(tags.join(",")),
      natureza: String(r.natureza || "").trim(), fase: faseDe(r.tipo, r.natureza), advResp: String(r.advResp || "").trim() || "Sem responsável", advLider: String(r.advLider || "").trim(),
      entrada: iso(r.entrada), distribuicao: iso(r.distribuicao), ultAtualizacao: iso(r.ultAtualizacao), comentarios: String(r.comentarios || "").trim(), decisao: String(r.decisao || "").trim(),
      idAutojur: String(r.idAutojur || "").trim(), subpasta: /sub/i.test(String(r.subpasta || "")), status: String(r.status || "").trim()
    };
  }
  /* os processos de contravenção penal são de um mesmo grupo econômico: o configurado, ou o predominante entre eles */
  function grupoContravencao(linhas) {
    if (S.cfg.grupoContravencao) return S.cfg.grupoContravencao;
    const m = new Map(); linhas.filter(c => c.contravencao && c.grupoOrig).forEach(c => m.set(c.grupoOrig, (m.get(c.grupoOrig) || 0) + 1));
    return [...m].sort((a, b) => b[1] - a[1]).map(x => x[0])[0] || "";
  }
  function aplicarRegras(linhas) {
    const g = grupoContravencao(linhas);
    for (const c of linhas) { c.grupo = c.contravencao && g ? g : (c.grupoOrig != null ? c.grupoOrig : c.grupo); c.chaveCli = c.grupo || c.cliente || "(sem cliente)"; }
    S.grupoContrav = g;
  }
  async function lerPlanilha(f) {
    await xlsx();
    const wb = XLSX.read(await f.arrayBuffer(), { type: "array", cellDates: true });
    let melhor = null;
    for (const n of wb.SheetNames) {
      const l = XLSX.utils.sheet_to_json(wb.Sheets[n], { header: 1, raw: true, defval: "" });
      const iCab = l.findIndex(x => x.some(c => /c[oó]digo da pasta/i.test(String(c))) || (x.some(c => /^cliente$/i.test(String(c).trim())) && x.some(c => /processo/i.test(String(c)))));
      if (iCab >= 0 && (!melhor || l.length > melhor.l.length)) melhor = { l, iCab };
    }
    if (!melhor) throw new Error("A planilha não tem as colunas esperadas do ADVWin (código da pasta, cliente, número do processo…).");
    const cab = melhor.l[melhor.iCab].map(c => sem(c)), mapa = {};
    for (const [k, re] of Object.entries(COLS)) { const i = cab.findIndex(c => re.test(c)); if (i >= 0) mapa[k] = i; }
    if (mapa.cod == null) throw new Error("Não encontrei a coluna \"Código da Pasta\", que identifica cada caso.");
    const linhas = [];
    for (const l of melhor.l.slice(melhor.iCab + 1)) { if (!l || !String(l[mapa.cod] || "").trim()) continue; const r = {}; for (const [k, i] of Object.entries(mapa)) r[k] = l[i]; linhas.push(caso(r)); }
    return { linhas, colunas: Object.keys(mapa) };
  }
  async function importar(f) {
    const est = $("#estadoImport"), estV = $("#estadoVazio"), msg = t => { est.textContent = t; estV.textContent = t; };
    msg("Lendo a planilha…");
    try {
      const { linhas, colunas } = await lerPlanilha(f); aplicarRegras(linhas);
      const antes = new Map(((S.base && S.base.linhas) || []).map(c => [c.cod, c])), agora = new Set(linhas.map(c => c.cod));
      const novos = linhas.filter(c => !antes.has(c.cod)), saidas = [...antes.values()].filter(c => !agora.has(c.cod));
      S.base = { arquivo: f.name, importado: new Date().toISOString(), colunas, linhas, saidas: saidas.map(c => ({ cod: c.cod, cliente: c.cliente, numero: c.numero, tipo: c.tipo })) };
      S.historico.unshift({ data: new Date().toISOString(), arquivo: f.name, n: linhas.length, novos: antes.size ? novos.length : linhas.length, saidas: saidas.length });
      S.historico = S.historico.slice(0, 30);
      salvar(); iniciar();
      msg(linhas.length + " casos importados" + (antes.size ? ": " + novos.length + " novos e " + saidas.length + " que deixaram de constar na base." : "."));
    } catch (e) { msg(e.message || String(e)); }
  }
  const zona = (z, aoEscolher) => {
    ["dragenter", "dragover"].forEach(ev => z.addEventListener(ev, e => { e.preventDefault(); z.classList.add("sobre"); }));
    ["dragleave", "drop"].forEach(ev => z.addEventListener(ev, e => { e.preventDefault(); z.classList.remove("sobre"); }));
    z.addEventListener("drop", e => { const f = e.dataTransfer.files[0]; if (f) aoEscolher(f); });
    z.addEventListener("click", () => $("#arq").click());
  };
  $("#arq").addEventListener("change", e => { const f = e.target.files[0]; e.target.value = ""; if (f) importar(f); });
  $("#btImportar").onclick = () => $("#arq").click();
  zona($("#zona"), importar); zona($("#zona2"), importar);

  /* ------------------------------------------------------------------ anotações e acompanhamento */
  const A = cod => S.anot[cod] || (S.anot[cod] = { prioridade: "", verificarDias: null, verificacoes: [], discussoes: [], providencias: [], etiquetas: [], favorito: false });
  const anotDe = cod => S.anot[cod] || null;
  function intervalo(c) {
    const a = anotDe(c.cod); if (a && a.verificarDias) return +a.verificarDias;
    const I = S.cfg.intervalos, l = [];
    if (c.estrategico) l.push(I.estrategico); if (c.reuPreso) l.push(I.reuPreso); if (c.importante) l.push(I.importante); if (c.fisico) l.push(I.fisico);
    if (a && a.prioridade === "alta") l.push(I.importante);
    return l.length ? Math.min(...l) : null;
  }
  function verificacao(c) {
    const n = intervalo(c); if (!n) return null;
    const a = anotDe(c.cod), ult = a && a.verificacoes.length ? a.verificacoes[a.verificacoes.length - 1].data : "";
    const prox = ult ? maisDias(ult, n) : hojeISO(), falta = dias(hojeISO(), prox);
    return { intervalo: n, ultima: ult, proxima: prox, falta, status: !ult || falta < 0 ? "atrasada" : falta <= 3 ? "proxima" : "em-dia" };
  }
  const provAbertas = c => { const a = anotDe(c.cod); return a ? a.providencias.filter(p => p.status !== "concluida") : []; };
  const parado = c => !c.ultAtualizacao || dias(c.ultAtualizacao, hojeISO()) > S.cfg.parado;

  /* ------------------------------------------------------------------ filtros */
  const FIL = { busca: "", adv: "", cli: "", tema: "", tipo: "", comarca: "", sit: new Set(), extra: {} };
  const EXTRAS = { fase: "Fase", sistema: "Sistema", assuntoCat: "Assunto", decisao: "Decisão", mes: "Entrada em", justica: "Justiça" };
  function filtrar(lista) {
    const q = sem(FIL.busca), qd = dig(FIL.busca);
    return lista.filter(c => {
      if (FIL.adv && c.advResp !== FIL.adv) return false;
      if (FIL.cli && c.chaveCli !== FIL.cli) return false;
      if (FIL.tema && !c.temas.includes(FIL.tema)) return false;
      if (FIL.tipo && c.tipo !== FIL.tipo) return false;
      if (FIL.comarca && c.comarca !== FIL.comarca) return false;
      for (const s of FIL.sit) {
        if (s === "fisico" && !c.fisico) return false;
        if (s === "verifAtrasada") { const v = verificacao(c); if (!v || v.status !== "atrasada") return false; }
        else if (s === "provAberta") { if (!provAbertas(c).length) return false; }
        else if (s === "principal") { if (c.subpasta) return false; }
        else if (s === "parado") { if (!parado(c)) return false; }
        else if (s !== "fisico" && !c[s]) return false;
      }
      for (const [k, v] of Object.entries(FIL.extra)) { if (k === "mes") { if (!c.entrada.startsWith(v)) return false; } else if (k === "decisao") { if ((c.decisao || "Sem decisão registrada") !== v) return false; } else if (c[k] !== v) return false; }
      if (q) {
        const a = anotDe(c.cod), alvo = sem([c.cliente, c.grupo, c.contraria, c.tipo, c.numero, c.cod, c.assunto, c.comarca, c.tribunal, c.advResp, c.idAutojur, a ? a.etiquetas.join(" ") : ""].join(" "));
        if (!q.split(/\s+/).every(t => alvo.includes(t)) && !(qd.length >= 5 && dig(c.numero).includes(qd))) return false;
      }
      return true;
    });
  }
  const conta = (l, f) => { const m = new Map(); for (const c of l) for (const k of [].concat(f(c))) m.set(k, (m.get(k) || 0) + 1); return [...m].sort((a, b) => b[1] - a[1]); };
  function preencherSelects() {
    const L = S.base.linhas, opt = (sel, rot, pares) => { const v = sel.value; sel.innerHTML = '<option value="">' + rot + "</option>" + pares.map(([k, n]) => '<option value="' + esc(k) + '">' + esc(k) + " (" + n + ")</option>").join(""); sel.value = pares.some(p => p[0] === v) ? v : ""; };
    opt($("#fAdv"), "Todos os advogados", conta(L, c => c.advResp));
    opt($("#fCliente"), "Todos os clientes e grupos", conta(L, c => c.chaveCli).sort((a, b) => a[0].localeCompare(b[0], "pt-BR")));
    opt($("#fTema"), "Todos os temas", conta(L, c => c.temas));
    opt($("#fTipo"), "Todos os tipos de ação", conta(L, c => c.tipo));
    opt($("#fComarca"), "Todas as comarcas", conta(L, c => c.comarca));
    const resp = [...new Set(L.map(c => c.advResp))].sort();
    $("#provResp").innerHTML = '<option value="">Todos os responsáveis</option>' + resp.map(r => '<option>' + esc(r) + "</option>").join("");
  }
  const ligar = (id, k) => $(id).addEventListener("change", e => { FIL[k] = e.target.value; atualizar(); });
  ligar("#fAdv", "adv"); ligar("#fCliente", "cli"); ligar("#fTema", "tema"); ligar("#fTipo", "tipo"); ligar("#fComarca", "comarca");
  let tmBusca = null; $("#fBusca").addEventListener("input", e => { clearTimeout(tmBusca); tmBusca = setTimeout(() => { FIL.busca = e.target.value; atualizar(); }, 200); });
  $("#chipsSituacao").addEventListener("click", e => { const b = e.target.closest("[data-s]"); if (!b) return; const s = b.dataset.s; FIL.sit.has(s) ? FIL.sit.delete(s) : FIL.sit.add(s); atualizar(); });
  $("#limpar").onclick = () => { Object.assign(FIL, { busca: "", adv: "", cli: "", tema: "", tipo: "", comarca: "", extra: {} }); FIL.sit.clear(); ["#fBusca", "#fAdv", "#fCliente", "#fTema", "#fTipo", "#fComarca"].forEach(s => $(s).value = ""); atualizar(); };
  $("#chipsAtivos").addEventListener("click", e => { const b = e.target.closest("[data-x]"); if (!b) return; const k = b.dataset.x; if (k.startsWith("extra.")) delete FIL.extra[k.slice(6)]; else { FIL[k] = ""; $({ adv: "#fAdv", cli: "#fCliente", tema: "#fTema", tipo: "#fTipo", comarca: "#fComarca" }[k]).value = ""; } atualizar(); });
  function filtrarPor(k, v) {
    const sel = { adv: "#fAdv", cli: "#fCliente", tema: "#fTema", tipo: "#fTipo", comarca: "#fComarca" }[k];
    if (sel) { FIL[k] = FIL[k] === v ? "" : v; $(sel).value = FIL[k]; } else if (FIL.extra[k] === v) delete FIL.extra[k]; else FIL.extra[k] = v;
    atualizar();
  }
  function chipsAtivos() {
    const rot = { adv: "Advogado", cli: "Cliente", tema: "Tema", tipo: "Tipo", comarca: "Comarca" }, l = [];
    for (const k of Object.keys(rot)) if (FIL[k]) l.push('<button type="button" class="chip ativo-f" data-x="' + k + '">' + rot[k] + ": " + esc(FIL[k]) + '<span class="x">×</span></button>');
    for (const [k, v] of Object.entries(FIL.extra)) l.push('<button type="button" class="chip ativo-f" data-x="extra.' + k + '">' + EXTRAS[k] + ": " + esc(k === "mes" ? v.split("-").reverse().join("/") : v) + '<span class="x">×</span></button>');
    $("#chipsAtivos").innerHTML = l.join("");
    $$("#chipsSituacao [data-s]").forEach(b => b.setAttribute("aria-pressed", FIL.sit.has(b.dataset.s) ? "true" : "false"));
  }

  /* ------------------------------------------------------------------ painel */
  let L = [], ABA = "painel";
  const graficos = {};
  const CORES = ["#EB6834", "#2B2B2B", "#2A78D6", "#1BAF7A", "#E8E347", "#8E6CC9", "#D03B3B", "#7A9CC6", "#B8B8B8", "#C58B4E", "#5BB5A2", "#D97BA8", "#6B7F3A", "#4D4D4D"];
  async function grafico(id, cfg, campo, valores) {
    try { await chartLib(); } catch (e) { return; }
    const el = $("#" + id); if (!el) return;
    if (graficos[id]) graficos[id].destroy(); const antigo = Chart.getChart(el); if (antigo) antigo.destroy();
    cfg.options = Object.assign({ responsive: true, maintainAspectRatio: false, animation: false, plugins: { legend: { display: cfg.type === "doughnut", position: "right", labels: { boxWidth: 12, font: { size: 11 } } }, tooltip: { callbacks: {} } } }, cfg.options || {});
    if (campo) { cfg.options.onClick = (ev, els) => { if (els.length) filtrarPor(campo, valores[els[0].index]); }; cfg.options.onHover = (ev, els) => { ev.native.target.style.cursor = els.length ? "pointer" : "default"; }; }
    graficos[id] = new Chart(el, cfg);
  }
  const barrasH = (pares, cor) => ({ type: "bar", data: { labels: pares.map(p => p[0].length > 38 ? p[0].slice(0, 36) + "…" : p[0]), datasets: [{ data: pares.map(p => p[1]), backgroundColor: cor || "#EB6834", borderRadius: 4 }] }, options: { indexAxis: "y", scales: { x: { ticks: { precision: 0 } }, y: { ticks: { font: { size: 11 } } } }, plugins: { legend: { display: false }, tooltip: { callbacks: { title: it => pares[it[0].dataIndex][0] } } } } });
  function kpis() {
    const t = L.length, principais = L.filter(c => !c.subpasta).length, cli = new Set(L.map(c => c.chaveCli)).size;
    const imp = L.filter(c => c.importante).length, est = L.filter(c => c.estrategico).length, preso = L.filter(c => c.reuPreso).length, fis = L.filter(c => c.fisico).length, seg = L.filter(c => c.segredo).length;
    const atras = L.filter(c => { const v = verificacao(c); return v && v.status === "atrasada"; }).length, prov = L.reduce((s, c) => s + provAbertas(c).length, 0), provV = L.reduce((s, c) => s + provAbertas(c).filter(p => p.prazo && p.prazo < hojeISO()).length, 0);
    const par = L.filter(parado).length, ano = String(new Date().getFullYear()), novos = L.filter(c => c.entrada.startsWith(ano)).length;
    const k = [
      ["Pastas na seleção", t, principais + " principais · " + (t - principais) + " subpastas", null],
      ["Clientes e grupos", cli, "média de " + (cli ? (t / cli).toLocaleString("pt-BR", { maximumFractionDigits: 1 }) : 0) + " pastas por cliente", null],
      ["Importantes", imp, pctf(imp, t) + " da seleção", "importante"],
      ["Estratégicos", est, "acompanhamento próximo", "estrategico", est > 0],
      ["Réu preso", preso, "prioridade absoluta", "reuPreso", preso > 0],
      ["Físicos e sem CNJ", fis, "atualização manual recorrente", "fisico"],
      ["Segredo de justiça", seg, pctf(seg, t), "segredo"],
      ["Verificações atrasadas", atras, "conforme a agenda de verificação", "verifAtrasada", atras > 0],
      ["Providências abertas", prov, provV + " vencidas", "provAberta", provV > 0],
      ["Entradas em " + ano, novos, "novas pastas no ano", "__ano"],
      ["Sem atualização no ADVWin", par, "há mais de " + S.cfg.parado + " dias ou sem registro", "parado"]
    ];
    $("#kpis").innerHTML = k.map(x => '<button type="button" class="kpi' + (x[4] ? " alerta" : "") + '"' + (x[3] ? ' data-k="' + x[3] + '"' : "") + "><small>" + esc(x[0]) + "</small><b>" + nfmt(x[1]) + "</b><span>" + esc(x[2]) + "</span></button>").join("");
  }
  $("#kpis").addEventListener("click", e => { const b = e.target.closest("[data-k]"); if (!b) return; const k = b.dataset.k; if (k === "__ano") { filtrarPor("mes", String(new Date().getFullYear())); return; } FIL.sit.has(k) ? FIL.sit.delete(k) : FIL.sit.add(k); atualizar(); });
  function painel() {
    kpis();
    const adv = conta(L, c => c.advResp); grafico("gAdv", { type: "bar", data: { labels: adv.map(a => titulo(a[0])), datasets: [{ label: "Pastas", data: adv.map(a => a[1]), backgroundColor: "#2B2B2B", borderRadius: 4 }, { label: "Importantes", data: adv.map(a => L.filter(c => c.advResp === a[0] && c.importante).length), backgroundColor: "#EB6834", borderRadius: 4 }] }, options: { plugins: { legend: { display: true, position: "bottom" } }, scales: { y: { ticks: { precision: 0 } } } } }, "adv", adv.map(a => a[0]));
    const tem = conta(L, c => c.temas); grafico("gTema", barrasH(tem, "#EB6834"), "tema", tem.map(a => a[0]));
    const cli = conta(L, c => c.chaveCli).slice(0, 12); grafico("gCli", barrasH(cli.map(c => [titulo(c[0]), c[1]]), "#2A78D6"), "cli", cli.map(a => a[0]));
    const tip = conta(L, c => c.tipo).slice(0, 12); grafico("gTipo", barrasH(tip.map(c => [titulo(c[0]), c[1]]), "#1BAF7A"), "tipo", tip.map(a => a[0]));
    const com = conta(L, c => c.comarca).slice(0, 12); grafico("gComarca", barrasH(com, "#8E6CC9"), "comarca", com.map(a => a[0]));
    const sis = conta(L, c => c.sistema); grafico("gSistema", { type: "doughnut", data: { labels: sis.map(s => s[0]), datasets: [{ data: sis.map(s => s[1]), backgroundColor: sis.map((s, i) => s[0] === "Físico" ? "#E8E347" : CORES[i % CORES.length]) }] } }, "sistema", sis.map(a => a[0]));
    const fas = conta(L, c => c.fase); grafico("gFase", { type: "doughnut", data: { labels: fas.map(s => s[0]), datasets: [{ data: fas.map(s => s[1]), backgroundColor: CORES }] } }, "fase", fas.map(a => a[0]));
    const dec = conta(L, c => c.decisao || "Sem decisão registrada").filter(d => d[0] !== "Sem decisão registrada"); grafico("gDecisao", { type: "doughnut", data: { labels: dec.map(s => s[0]), datasets: [{ data: dec.map(s => s[1]), backgroundColor: CORES }] } }, "decisao", dec.map(a => a[0]));
    /* entradas por mês */
    const meses = []; const d0 = new Date(); d0.setDate(1); for (let i = 23; i >= 0; i--) { const d = new Date(d0.getFullYear(), d0.getMonth() - i, 1); meses.push(d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0")); }
    const porMes = meses.map(m => L.filter(c => c.entrada.startsWith(m)).length);
    let acum = L.filter(c => c.entrada && c.entrada < meses[0]).length; const acumulado = porMes.map(n => (acum += n));
    grafico("gEntrada", { type: "bar", data: { labels: meses.map(m => m.slice(5) + "/" + m.slice(2, 4)), datasets: [{ label: "Novas pastas", data: porMes, backgroundColor: "#EB6834", borderRadius: 3, yAxisID: "y" }, { type: "line", label: "Acumulado", data: acumulado, borderColor: "#2B2B2B", backgroundColor: "#2B2B2B", pointRadius: 2, yAxisID: "y2" }] }, options: { plugins: { legend: { display: true, position: "bottom" } }, scales: { y: { ticks: { precision: 0 }, title: { display: true, text: "por mês" } }, y2: { position: "right", grid: { drawOnChartArea: false }, title: { display: true, text: "acumulado" } } } } }, "mes", meses);
    /* matriz advogado × tema */
    const advs = adv.map(a => a[0]), temas = tem.map(t => t[0]).slice(0, 9), mx = Math.max(1, ...advs.flatMap(a => temas.map(t => L.filter(c => c.advResp === a && c.temas.includes(t)).length)));
    $("#matriz").innerHTML = "<thead><tr><th>Advogado</th>" + temas.map(t => '<th class="n" title="' + esc(t) + '">' + esc(t.length > 22 ? t.slice(0, 20) + "…" : t) + "</th>").join("") + '<th class="n">Total</th></tr></thead><tbody>' + advs.map(a => "<tr><td>" + esc(titulo(a)) + "</td>" + temas.map(t => { const n = L.filter(c => c.advResp === a && c.temas.includes(t)).length; return '<td class="h" data-a="' + esc(a) + '" data-t="' + esc(t) + '" style="cursor:pointer;background:rgb(235 104 52 / ' + (n / mx * 0.75).toFixed(2) + ')">' + (n || "") + "</td>"; }).join("") + '<td class="n"><b>' + L.filter(c => c.advResp === a).length + "</b></td></tr>").join("") + "</tbody>";
    $("#insights").innerHTML = insights().map(p => "<p>" + esc(p) + "</p>").join("");
  }
  $("#matriz").addEventListener("click", e => { const td = e.target.closest("td[data-a]"); if (!td) return; FIL.adv = td.dataset.a; FIL.tema = td.dataset.t; $("#fAdv").value = FIL.adv; $("#fTema").value = FIL.tema; atualizar(); });
  function insights() {
    const t = L.length, out = []; if (!t) return ["Nenhum caso na seleção."];
    const cli = conta(L, c => c.chaveCli), top5 = cli.slice(0, 5).reduce((s, c) => s + c[1], 0);
    out.push("Os cinco maiores clientes ou grupos concentram " + pctf(top5, t) + " da seleção (" + cli.slice(0, 5).map(c => titulo(c[0]) + ", " + c[1]).join("; ") + ").");
    const gc = S.grupoContrav, lot = gc ? L.filter(c => c.chaveCli === gc).length : 0; if (lot) out.push("O grupo " + titulo(gc) + " responde por " + nfmt(lot) + " pastas (" + pctf(lot, t) + "), em sua maioria de contravenção penal, com volume alto e baixa complexidade individual: convém tratá-las em lote, com modelos e rotinas padronizadas.");
    const adv = conta(L, c => c.advResp); if (adv.length > 1) out.push("A carga está distribuída entre " + adv.length + " advogados; " + titulo(adv[0][0]) + " concentra " + pctf(adv[0][1], t) + " das pastas" + (adv[1] ? ", seguido de " + titulo(adv[1][0]) + " (" + pctf(adv[1][1], t) + ")" : "") + ". Entre os importantes, a maior parte está com " + titulo((conta(L.filter(c => c.importante), c => c.advResp)[0] || ["-"])[0]) + ".");
    const fis = L.filter(c => c.fisico), fisSem = fis.filter(c => { const v = verificacao(c); return !v || !v.ultima; }).length; if (fis.length) out.push(nfmt(fis.length) + " casos são físicos ou não têm numeração CNJ (inquéritos, procedimentos administrativos, pré-cadastros) e não são alcançados por consultas automáticas; " + nfmt(fisSem) + " deles ainda não têm verificação registrada no painel.");
    const preso = L.filter(c => c.reuPreso); if (preso.length) out.push(nfmt(preso.length) + (preso.length === 1 ? " caso tem" : " casos têm") + " réu preso, o que impõe controle de prazos de prisão e de reavaliação da custódia (CPP, art. 316, parágrafo único).");
    const semNum = L.filter(c => c.semNumero).length; if (semNum) out.push(nfmt(semNum) + " pastas estão sem número de processo ou em pré-cadastro e precisam ser completadas no ADVWin.");
    const fases = conta(L, c => c.fase); out.push("Por fase, predominam " + fases.slice(0, 3).map(f => f[0].toLowerCase() + " (" + pctf(f[1], t) + ")").join(", ") + ".");
    const ano = new Date().getFullYear(), n1 = L.filter(c => c.entrada.startsWith(String(ano))).length, n0 = L.filter(c => c.entrada.startsWith(String(ano - 1))).length;
    if (n0) out.push("Entraram " + nfmt(n1) + " pastas em " + ano + ", contra " + nfmt(n0) + " em " + (ano - 1) + (n1 > n0 ? ", crescimento de " + pctf(n1 - n0, n0) : "") + ".");
    const comar = conta(L, c => c.comarca), bh = (comar.find(c => c[0] === "Belo Horizonte") || [0, 0])[1]; out.push("A atuação alcança " + comar.length + " comarcas; " + (bh ? pctf(bh, t) + " dos casos estão em Belo Horizonte, e " : "") + nfmt(L.filter(c => c.comarca !== "Belo Horizonte").length) + " fora da capital, relevantes para o planejamento de diligências e audiências.");
    const atr = L.filter(c => { const v = verificacao(c); return v && v.status === "atrasada"; }).length; if (atr) out.push(nfmt(atr) + " casos estão com a verificação periódica atrasada; a lista está na aba Acompanhamento.");
    const par = L.filter(parado).length; if (par) out.push(nfmt(par) + " pastas não têm atualização registrada no ADVWin há mais de " + S.cfg.parado + " dias (ou nunca tiveram), o que sugere revisar a alimentação do sistema.");
    return out;
  }

  /* ------------------------------------------------------------------ processos */
  let ORD = { campo: "entrada", dir: -1 }, PAG = 0; const POR = 50;
  const COLUNAS = [["fav", "★", null], ["cod", "Pasta", c => c.cod], ["cliente", "Cliente", c => c.cliente], ["contraria", "Parte contrária", c => c.contraria], ["tipo", "Tipo", c => c.tipo], ["numero", "Número", c => c.numero], ["comarca", "Comarca", c => c.comarca], ["advResp", "Responsável", c => c.advResp], ["marcas", "Marcadores", null], ["entrada", "Entrada", c => c.entrada], ["verif", "Verificação", c => { const v = verificacao(c); return v ? v.proxima : "9999"; }], ["prov", "Providências", c => provAbertas(c).length]];
  function marcadores(c) {
    const a = anotDe(c.cod), v = verificacao(c), m = [];
    if (c.reuPreso) m.push('<span class="mk preso">réu preso</span>'); if (c.estrategico) m.push('<span class="mk est">estratégico</span>'); if (c.importante) m.push('<span class="mk imp">importante</span>');
    if (c.segredo) m.push('<span class="mk seg">segredo</span>'); if (c.fisico) m.push('<span class="mk fis">' + (c.semNumero ? "sem número" : c.cnj ? "físico" : "sem CNJ") + "</span>");
    if (a && a.prioridade) m.push('<span class="mk">prioridade ' + esc(a.prioridade) + "</span>");
    if (a) a.etiquetas.forEach(t => m.push('<span class="mk">' + esc(t) + "</span>"));
    c.temas.filter(t => t !== "Sem tema").forEach(t => m.push('<span class="mk" title="tema">' + esc(t.replace(/ \(art.*\)/, "")) + "</span>"));
    return m.join("");
  }
  const celVerif = c => { const v = verificacao(c); if (!v) return '<span class="pequeno mudo">-</span>'; return v.status === "atrasada" ? '<span class="mk atr">' + (v.ultima ? "atrasada " + -v.falta + "d" : "nunca verificada") + "</span>" : v.status === "proxima" ? '<span class="mk fis">em ' + v.falta + "d</span>" : '<span class="mk ok">' + dBr(v.proxima) + "</span>"; };
  function processos() {
    const col = COLUNAS.find(c => c[0] === ORD.campo), f = col && col[2];
    const l = f ? [...L].sort((a, b) => { const x = f(a), y = f(b); return (typeof x === "number" ? x - y : String(x || "").localeCompare(String(y || ""), "pt-BR")) * ORD.dir; }) : L;
    const pags = Math.max(1, Math.ceil(l.length / POR)); PAG = Math.min(PAG, pags - 1);
    const pg = l.slice(PAG * POR, PAG * POR + POR);
    $("#tabela").innerHTML = "<thead><tr>" + COLUNAS.map(c => "<th" + (c[2] ? ' data-ord="' + c[0] + '"' : "") + ">" + esc(c[1]) + (ORD.campo === c[0] ? (ORD.dir > 0 ? " ▲" : " ▼") : "") + "</th>").join("") + "</tr></thead><tbody>" +
      pg.map(c => { const a = anotDe(c.cod); return '<tr class="clic" data-cod="' + esc(c.cod) + '"><td>' + (a && a.favorito ? "★" : "") + '</td><td class="num">' + esc(c.cod) + (c.subpasta ? '<br><span class="pequeno mudo">subpasta</span>' : "") + "</td><td>" + esc(c.cliente) + (c.grupo && c.grupo !== c.cliente ? '<br><span class="pequeno mudo">' + esc(c.grupo) + "</span>" : "") + "</td><td>" + esc(c.contraria.slice(0, 60)) + "</td><td>" + esc(titulo(c.tipo)) + '</td><td class="num">' + esc(c.numero) + "</td><td>" + esc(c.comarca) + "</td><td>" + esc(titulo(c.advResp)) + "</td><td>" + marcadores(c) + "</td><td>" + dBr(c.entrada) + "</td><td>" + celVerif(c) + '</td><td class="n">' + (provAbertas(c).length || "") + "</td></tr>"; }).join("") + "</tbody>";
    $("#pagInfo").textContent = l.length ? "Mostrando " + (PAG * POR + 1) + " a " + Math.min(l.length, PAG * POR + POR) + " de " + nfmt(l.length) : "Nenhum processo com esses filtros.";
    $("#pagAnt").disabled = PAG === 0; $("#pagProx").disabled = PAG >= pags - 1;
  }
  $("#tabela").addEventListener("click", e => { const th = e.target.closest("th[data-ord]"); if (th) { ORD = { campo: th.dataset.ord, dir: ORD.campo === th.dataset.ord ? -ORD.dir : 1 }; processos(); return; } const tr = e.target.closest("tr[data-cod]"); if (tr) ficha(tr.dataset.cod); });
  $("#pagAnt").onclick = () => { PAG--; processos(); }; $("#pagProx").onclick = () => { PAG++; processos(); };

  /* ------------------------------------------------------------------ clientes */
  function clientes() {
    const g = new Map(); for (const c of L) { if (!g.has(c.chaveCli)) g.set(c.chaveCli, []); g.get(c.chaveCli).push(c); }
    const ord = $("#cliOrdem").value, mx = Math.max(1, ...[...g.values()].map(l => l.length));
    const lista = [...g].sort((a, b) => ord === "nome" ? a[0].localeCompare(b[0], "pt-BR") : ord === "imp" ? b[1].filter(c => c.importante).length - a[1].filter(c => c.importante).length || b[1].length - a[1].length : ord === "rec" ? String(b[1].map(c => c.entrada).sort().pop()).localeCompare(String(a[1].map(c => c.entrada).sort().pop())) : b[1].length - a[1].length);
    $("#clientes").innerHTML = lista.slice(0, 300).map(([k, l]) => {
      const imp = l.filter(c => c.importante).length, est = l.filter(c => c.estrategico).length, preso = l.filter(c => c.reuPreso).length, fis = l.filter(c => c.fisico).length, membros = new Set(l.map(c => c.cliente));
      const advs = conta(l, c => c.advResp).map(a => titulo(a[0]) + " (" + a[1] + ")").join(", "), temas = conta(l, c => c.temas).slice(0, 4).map(t => t[0] + " (" + t[1] + ")").join(", ");
      return '<details class="cliente"><summary><b>' + esc(titulo(k)) + '</b><span class="pequeno mudo">' + l.length + (l.length === 1 ? " pasta" : " pastas") + (membros.size > 1 ? " · " + membros.size + " clientes no grupo" : "") + "</span>" + (imp ? '<span class="mk imp">' + imp + " importantes</span>" : "") + (est ? '<span class="mk est">' + est + " estratégicos</span>" : "") + (preso ? '<span class="mk preso">' + preso + " réu preso</span>" : "") + (fis ? '<span class="mk fis">' + fis + " físicos/sem CNJ</span>" : "") + '<span class="barra-h"><i style="width:' + (l.length / mx * 100).toFixed(1) + '%"></i></span></summary>' +
        '<p class="pequeno" style="margin:6px 0">Responsáveis: ' + esc(advs) + "<br>Temas: " + esc(temas) + '</p><div class="linha-btns" style="margin:0 0 6px"><button type="button" class="mini" data-cli="' + esc(k) + '">Filtrar o painel por este cliente</button></div>' +
        '<div class="rolagem"><table class="t"><tbody>' + l.sort((a, b) => b.entrada.localeCompare(a.entrada)).map(c => '<tr class="clic" data-cod="' + esc(c.cod) + '"><td class="num">' + esc(c.cod) + "</td><td>" + esc(c.cliente) + "</td><td>" + esc(titulo(c.tipo)) + '</td><td class="num">' + esc(c.numero) + "</td><td>" + esc(c.comarca) + "</td><td>" + marcadores(c) + "</td></tr>").join("") + "</tbody></table></div></details>";
    }).join("") + (lista.length > 300 ? '<p class="pequeno mudo">Mostrando os 300 primeiros; use os filtros para restringir.</p>' : "");
  }
  $("#cliOrdem").addEventListener("change", clientes);
  $("#clientes").addEventListener("click", e => { const b = e.target.closest("[data-cli]"); if (b) { filtrarPor("cli", b.dataset.cli); $('.aba[data-aba="painel"]').click(); return; } const tr = e.target.closest("tr[data-cod]"); if (tr) ficha(tr.dataset.cod); });

  /* ------------------------------------------------------------------ equipe */
  function equipe() {
    const advs = conta(L, c => c.advResp);
    $("#equipe").innerHTML = advs.map(([a, n]) => {
      const l = L.filter(c => c.advResp === a), atr = l.filter(c => { const v = verificacao(c); return v && v.status === "atrasada"; }).length;
      const provs = Object.values(S.anot).flatMap(x => x.providencias).filter(p => p.status !== "concluida" && sem(p.responsavel) === sem(a)), venc = provs.filter(p => p.prazo && p.prazo < hojeISO()).length;
      const linha = (rot, v, f) => "<dt>" + (f ? '<button type="button" data-adv="' + esc(a) + '" data-f="' + f + '">' + esc(rot) + "</button>" : esc(rot)) + "</dt><dd>" + v + "</dd>";
      return '<div class="card pessoa"><h3>' + esc(titulo(a)) + '</h3><dl>' + linha("Pastas", nfmt(n) + " (" + pctf(n, L.length) + ")", "todas") + linha("Clientes distintos", new Set(l.map(c => c.chaveCli)).size) + linha("Importantes", l.filter(c => c.importante).length, "importante") + linha("Estratégicos", l.filter(c => c.estrategico).length, "estrategico") + linha("Réu preso", l.filter(c => c.reuPreso).length, "reuPreso") + linha("Físicos e sem CNJ", l.filter(c => c.fisico).length, "fisico") + linha("Verificações atrasadas", atr, "verifAtrasada") + linha("Providências abertas", provs.length + (venc ? " · " + venc + " vencidas" : "")) + linha("Entradas nos últimos 90 dias", l.filter(c => c.entrada && dias(c.entrada, hojeISO()) <= 90).length) + "</dl></div>";
    }).join("");
    const temas = conta(L, c => c.temas).map(t => t[0]).slice(0, 8);
    grafico("gEquipe", { type: "bar", data: { labels: advs.map(a => titulo(a[0])), datasets: temas.map((t, i) => ({ label: t, data: advs.map(a => L.filter(c => c.advResp === a[0] && c.temas.includes(t)).length), backgroundColor: CORES[i % CORES.length] })) }, options: { plugins: { legend: { display: true, position: "bottom", labels: { boxWidth: 12, font: { size: 11 } } } }, scales: { x: { stacked: true }, y: { stacked: true, ticks: { precision: 0 } } } } }, "adv", advs.map(a => a[0]));
  }
  $("#equipe").addEventListener("click", e => { const b = e.target.closest("[data-adv]"); if (!b) return; FIL.adv = b.dataset.adv; $("#fAdv").value = FIL.adv; FIL.sit.clear(); if (b.dataset.f !== "todas") FIL.sit.add(b.dataset.f); $('.aba[data-aba="processos"]').click(); atualizar(); });

  /* ------------------------------------------------------------------ acompanhamento */
  function acompanhamento() {
    const vis = new Set($$("#agendaFiltro [aria-pressed=true]").map(b => b.dataset.v));
    const ag = L.map(c => ({ c, v: verificacao(c) })).filter(x => x.v && vis.has(x.v.status)).sort((a, b) => a.v.proxima.localeCompare(b.v.proxima) || (b.c.reuPreso - a.c.reuPreso) || (b.c.estrategico - a.c.estrategico));
    $("#agenda").innerHTML = '<thead><tr><th>Situação</th><th>Pasta</th><th>Cliente</th><th>Tipo e número</th><th>Responsável</th><th>Marcadores</th><th class="n">A cada</th><th>Última</th><th></th></tr></thead><tbody>' +
      (ag.map(({ c, v }) => '<tr class="clic" data-cod="' + esc(c.cod) + '"><td>' + celVerif(c) + '</td><td class="num">' + esc(c.cod) + "</td><td>" + esc(c.cliente) + "</td><td>" + esc(titulo(c.tipo)) + '<br><span class="num">' + esc(c.numero) + "</span></td><td>" + esc(titulo(c.advResp)) + "</td><td>" + marcadores(c) + '</td><td class="n">' + v.intervalo + "d</td><td>" + (v.ultima ? dBr(v.ultima) : "-") + '</td><td><button type="button" class="mini" data-verif="' + esc(c.cod) + '">Verificado hoje</button></td></tr>').join("") || '<tr><td colspan="9" class="pequeno mudo">Nada nesta situação.</td></tr>') + "</tbody>";
    const resp = $("#provResp").value, todas = [];
    for (const c of S.base.linhas) { const a = anotDe(c.cod); if (!a) continue; a.providencias.forEach(p => { if (!resp || p.responsavel === resp) todas.push({ c, p }); }); }
    const cols = [["a-fazer", "A fazer"], ["andamento", "Em andamento"], ["concluida", "Concluídas"]];
    $("#quadro").innerHTML = cols.map(([k, rot]) => { const l = todas.filter(x => (x.p.status || "a-fazer") === k).sort((a, b) => (a.p.prazo || "9999").localeCompare(b.p.prazo || "9999")); return '<div class="coluna"><h3>' + rot + "<span>" + l.length + "</span></h3>" + (k === "concluida" ? l.slice(-15).reverse() : l).map(({ c, p }) => provCartao(c, p)).join("") + "</div>"; }).join("");
    const ev = []; for (const c of S.base.linhas) { const a = anotDe(c.cod); if (a) a.discussoes.forEach(d => ev.push({ c, d })); }
    ev.sort((a, b) => String(b.d.data).localeCompare(String(a.d.data)));
    $("#discussoes").innerHTML = ev.slice(0, 40).map(({ c, d }) => '<div class="evento"><div class="meta">' + dBr(d.data) + (d.autor ? " · " + esc(d.autor) : "") + ' · <a href="#" data-cod="' + esc(c.cod) + '">' + esc(c.cliente) + " · " + esc(c.cod) + "</a></div><p>" + esc(d.texto) + "</p></div>").join("") || '<p class="pequeno mudo">Nenhuma discussão registrada. Registre-as na ficha de cada processo.</p>';
    const atr = S.base.linhas.filter(c => { const v = verificacao(c); return v && v.status === "atrasada"; }).length; $("#contAcomp").textContent = atr || "";
  }
  function provCartao(c, p) {
    const venc = p.status !== "concluida" && p.prazo && p.prazo < hojeISO();
    return '<div class="prov' + (venc ? " venc" : "") + '"><div>' + esc(p.texto) + '</div><div class="meta"><a href="#" data-cod="' + esc(c.cod) + '">' + esc(c.cliente) + " · " + esc(c.cod) + "</a>" + (p.responsavel ? "<span>" + esc(titulo(p.responsavel)) + "</span>" : "") + (p.prazo ? "<span>" + (venc ? "venceu em " : "prazo ") + dBr(p.prazo) + "</span>" : "") + '</div><div class="acoes">' + (p.status !== "andamento" && p.status !== "concluida" ? '<button type="button" data-pst="andamento" data-c="' + esc(c.cod) + '" data-p="' + p.id + '">Iniciar</button>' : "") + (p.status !== "concluida" ? '<button type="button" data-pst="concluida" data-c="' + esc(c.cod) + '" data-p="' + p.id + '">Concluir</button>' : '<button type="button" data-pst="a-fazer" data-c="' + esc(c.cod) + '" data-p="' + p.id + '">Reabrir</button>') + "</div></div>";
  }
  function mudarProv(cod, id, st) { const p = A(cod).providencias.find(x => x.id === id); if (!p) return; p.status = st; p.concluida = st === "concluida" ? hojeISO() : ""; salvar(); atualizar(); if (!$("#gaveta").hidden) ficha(cod); }
  function verificar(cod, nota) { const a = A(cod); a.verificacoes.push({ data: hojeISO(), autor: S.cfg.autor || "", nota: nota || "" }); if (nota) a.discussoes.push({ data: hojeISO(), autor: S.cfg.autor || "", texto: "Verificação de andamento: " + nota }); salvar(); }
  document.addEventListener("click", e => {
    const v = e.target.closest("[data-verif]"); if (v) { e.stopPropagation(); const nota = prompt("Verificação registrada hoje. Observação sobre o andamento (opcional):", ""); if (nota === null) return; verificar(v.dataset.verif, nota.trim()); atualizar(); window.HUB.toast("Verificação registrada."); return; }
    const ps = e.target.closest("[data-pst]"); if (ps) { e.stopPropagation(); mudarProv(ps.dataset.c, ps.dataset.p, ps.dataset.pst); return; }
    const lk = e.target.closest("a[data-cod]"); if (lk) { e.preventDefault(); ficha(lk.dataset.cod); }
  });
  $("#agendaFiltro").addEventListener("click", e => { const b = e.target.closest("[data-v]"); if (!b) return; b.setAttribute("aria-pressed", b.getAttribute("aria-pressed") === "true" ? "false" : "true"); acompanhamento(); });
  $("#agenda").addEventListener("click", e => { if (e.target.closest("button")) return; const tr = e.target.closest("tr[data-cod]"); if (tr) ficha(tr.dataset.cod); });
  $("#provResp").addEventListener("change", acompanhamento);

  /* ------------------------------------------------------------------ ficha do processo */
  let FICHA = null;
  function ficha(cod) {
    const c = S.base.linhas.find(x => x.cod === cod) || (S.base.saidas || []).find(x => x.cod === cod); if (!c) return; FICHA = cod;
    const a = A(cod), v = c.temas ? verificacao(c) : null, resp = [...new Set(S.base.linhas.map(x => x.advResp))].sort();
    const campo = (r, val) => val ? "<dt>" + r + "</dt><dd>" + val + "</dd>" : "";
    let h = '<div class="cab"><div><div class="sobretitulo">Pasta ' + esc(c.cod) + (c.subpasta ? " · subpasta" : "") + "</div><h2>" + esc(c.cliente) + '</h2><p class="pequeno mudo" style="margin:2px 0 0">' + esc(titulo(c.tipo || "")) + (c.numero ? " · " + esc(c.numero) : "") + '</p></div><button type="button" class="btn-icone" id="fecharFicha" aria-label="Fechar">×</button></div>';
    h += '<div style="margin-top:8px">' + (c.temas ? marcadores(c) : "") + "</div>";
    h += "<dl>" + campo("Grupo econômico", esc(c.grupo || "")) + campo("Parte contrária", esc(c.contraria || "")) + campo("Número", c.numero ? '<span class="num">' + esc(c.numero) + '</span> <button type="button" class="mini" id="copiarNum">copiar</button>' + (c.cnj ? ' <span class="pequeno mudo">CNJ · ' + esc(c.justica) + " · " + esc(c.anoCnj) + "</span>" : ' <span class="mk fis">sem numeração CNJ</span>') : "") + campo("Comarca", esc(c.comarca || "")) + campo("Tribunal", esc(c.tribunal || "")) + campo("Vara ou juízo", esc(c.vara || "")) + campo("Sistema", esc(c.sistema || "")) + campo("Assunto", esc(c.assunto || "")) + campo("Fase", esc(c.fase || "")) + campo("Responsável", esc(titulo(c.advResp || ""))) + campo("Advogado líder", esc(titulo(c.advLider || ""))) + campo("Entrada", dBr(c.entrada)) + campo("Distribuição", dBr(c.distribuicao)) + campo("Última atualização no ADVWin", dBr(c.ultAtualizacao)) + campo("Decisão", esc(c.decisao || "")) + campo("ID Autojur", esc(c.idAutojur || "")) + campo("Tags do ADVWin", esc((c.tags || []).join(", "))) + "</dl>";
    if (c.cnj) h += '<div class="linha-btns" style="margin:0"><a class="btn sec peq" href="../relatorio/" target="_blank" rel="noopener">Abrir o relatório processual (DataJud)</a></div>';
    h += '<h3>Gestão do caso</h3><div class="grade g3"><label class="campo">Prioridade<select id="fxPrio"><option value="">Sem prioridade definida</option><option value="alta">Alta</option><option value="media">Média</option><option value="baixa">Baixa</option></select></label><label class="campo">Verificar a cada (dias)<input type="number" id="fxInt" min="1" max="365" placeholder="' + (v ? v.intervalo + " (padrão)" : "sem verificação") + '"></label><label class="campo">Etiquetas próprias<input type="text" id="fxEtq" placeholder="separadas por vírgula"></label></div>';
    h += '<div class="linha-btns" style="margin-top:8px"><label class="pequeno" style="display:inline-flex;gap:6px;align-items:center"><input type="checkbox" id="fxFav"> Destacar com estrela</label><button type="button" class="btn sec peq" data-verif="' + esc(cod) + '">Registrar verificação hoje</button><span class="pequeno mudo">' + (v ? (v.ultima ? "Última verificação em " + dBr(v.ultima) + "; próxima em " + dBr(v.proxima) : "Ainda não verificado") : "") + "</span></div>";
    h += '<h3>Providências</h3><div id="fxProv">' + (a.providencias.length ? a.providencias.map(p => provCartao(c, p)).join("") : '<p class="pequeno mudo">Nenhuma providência.</p>') + '</div><div class="grade g3" style="margin-top:6px"><label class="campo" style="grid-column:span 3">Nova providência<input type="text" id="npTexto" placeholder="Ex.: peticionar requerendo acesso aos autos; despachar com o juiz; reavaliar a prisão"></label><label class="campo">Responsável<select id="npResp">' + resp.map(r => '<option' + (r === c.advResp ? " selected" : "") + ">" + esc(r) + "</option>").join("") + '</select></label><label class="campo">Prazo<input type="date" id="npPrazo"></label><button type="button" class="btn" id="npAdd" style="align-self:end">Incluir</button></div>';
    h += '<h3>Discussões e registros</h3><div class="grade g3"><label class="campo" style="grid-column:span 3">Registro<textarea id="ndTexto" placeholder="Reunião, estratégia definida, orientação ao cliente, conversa com o MP…"></textarea></label><label class="campo">Data<input type="date" id="ndData" value="' + hojeISO() + '"></label><label class="campo">Autor<input type="text" id="ndAutor" value="' + esc(S.cfg.autor || "") + '"></label><button type="button" class="btn" id="ndAdd" style="align-self:end">Registrar</button></div>';
    const evs = a.discussoes.map((d, i) => ({ d, i })).sort((x, y) => String(y.d.data).localeCompare(String(x.d.data)));
    h += '<div class="linha-tempo" style="margin-top:10px">' + evs.map(({ d, i }) => '<div class="evento"><div class="meta">' + dBr(d.data) + (d.autor ? " · " + esc(d.autor) : "") + ' · <a href="#" data-rmd="' + i + '">apagar</a></div><p>' + esc(d.texto) + "</p></div>").join("") + (c.comentarios ? '<div class="evento"><div class="meta">Comentário no ADVWin</div><p>' + esc(c.comentarios) + "</p></div>" : "") + (a.verificacoes.length ? '<div class="evento"><div class="meta">Verificações</div><p>' + a.verificacoes.map(x => dBr(x.data) + (x.autor ? " (" + esc(x.autor) + ")" : "")).join(", ") + "</p></div>" : "") + "</div>";
    $("#gaveta").innerHTML = h; $("#gaveta").hidden = false; $("#veu").hidden = false;
    $("#fxPrio").value = a.prioridade || ""; $("#fxInt").value = a.verificarDias || ""; $("#fxEtq").value = a.etiquetas.join(", "); $("#fxFav").checked = !!a.favorito;
    $("#fecharFicha").onclick = fecharFicha;
    const cp = $("#copiarNum"); if (cp) cp.onclick = () => navigator.clipboard.writeText(c.numero).then(() => window.HUB.toast("Número copiado."));
    $("#fxPrio").onchange = e => { a.prioridade = e.target.value; salvar(); atualizar(); };
    $("#fxInt").onchange = e => { a.verificarDias = +e.target.value || null; salvar(); atualizar(); ficha(cod); };
    $("#fxEtq").onchange = e => { a.etiquetas = e.target.value.split(",").map(s => s.trim()).filter(Boolean); salvar(); atualizar(); };
    $("#fxFav").onchange = e => { a.favorito = e.target.checked; salvar(); atualizar(); };
    $("#npAdd").onclick = () => { const t = $("#npTexto").value.trim(); if (!t) return; a.providencias.push({ id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6), texto: t, responsavel: $("#npResp").value, prazo: $("#npPrazo").value, status: "a-fazer", criada: hojeISO(), autor: S.cfg.autor || "" }); salvar(); atualizar(); ficha(cod); };
    $("#ndAdd").onclick = () => { const t = $("#ndTexto").value.trim(); if (!t) return; a.discussoes.push({ data: $("#ndData").value || hojeISO(), autor: $("#ndAutor").value.trim(), texto: t }); if ($("#ndAutor").value.trim() && !S.cfg.autor) { S.cfg.autor = $("#ndAutor").value.trim(); $("#cfgAutor").value = S.cfg.autor; } salvar(); atualizar(); ficha(cod); };
    $("#gaveta").querySelectorAll("[data-rmd]").forEach(x => x.onclick = ev => { ev.preventDefault(); if (!confirm("Apagar este registro?")) return; a.discussoes.splice(+x.dataset.rmd, 1); salvar(); atualizar(); ficha(cod); });
  }
  function fecharFicha() { $("#gaveta").hidden = true; $("#veu").hidden = true; FICHA = null; }
  $("#veu").onclick = fecharFicha; document.addEventListener("keydown", e => { if (e.key === "Escape" && FICHA) fecharFicha(); });
  /* depois de registrar verificação pela ficha, recarrega-a */
  document.addEventListener("click", e => { if (e.target.closest("#gaveta [data-verif]") && FICHA) setTimeout(() => ficha(FICHA), 50); }, true);

  /* ------------------------------------------------------------------ dados, configurações e cópia de segurança */
  function dados() {
    $("#historico").innerHTML = S.historico.length ? '<table class="t"><thead><tr><th>Data</th><th>Arquivo</th><th class="n">Casos</th><th class="n">Novos</th><th class="n">Saíram da base</th></tr></thead><tbody>' + S.historico.map(h => "<tr><td>" + new Date(h.data).toLocaleString("pt-BR") + "</td><td>" + esc(h.arquivo) + '</td><td class="n">' + h.n + '</td><td class="n">' + h.novos + '</td><td class="n">' + h.saidas + "</td></tr>").join("") + "</tbody></table>" + ((S.base.saidas || []).length ? '<p class="pequeno" style="margin-top:8px">Casos que deixaram de constar na última importação: ' + S.base.saidas.map(s => '<a href="#" data-cod="' + esc(s.cod) + '">' + esc(s.cod) + "</a> (" + esc(s.cliente) + ")").join(", ") + ". Suas anotações continuam guardadas.</p>" : "") : '<p class="pequeno mudo">Nenhuma importação.</p>';
    $("#cfgAutor").value = S.cfg.autor || ""; $("#cfgGrupo").value = S.cfg.grupoContravencao || ""; $("#cfgGrupo").placeholder = S.grupoContrav ? "predominante na base: " + titulo(S.grupoContrav) : "nenhum identificado"; $("#cfgEst").value = S.cfg.intervalos.estrategico; $("#cfgPreso").value = S.cfg.intervalos.reuPreso; $("#cfgImp").value = S.cfg.intervalos.importante; $("#cfgFis").value = S.cfg.intervalos.fisico; $("#cfgParado").value = S.cfg.parado;
  }
  [["#cfgGrupo", v => { S.cfg.grupoContravencao = v.toUpperCase(); aplicarRegras(S.base.linhas); preencherSelects(); }], ["#cfgAutor", v => S.cfg.autor = v], ["#cfgEst", v => S.cfg.intervalos.estrategico = Math.max(1, +v || 7)], ["#cfgPreso", v => S.cfg.intervalos.reuPreso = Math.max(1, +v || 7)], ["#cfgImp", v => S.cfg.intervalos.importante = Math.max(1, +v || 15)], ["#cfgFis", v => S.cfg.intervalos.fisico = Math.max(1, +v || 30)], ["#cfgParado", v => S.cfg.parado = Math.max(15, +v || 120)]]
    .forEach(([id, f]) => $(id).addEventListener("change", e => { f(e.target.value.trim()); salvar(); atualizar(); }));
  async function chaveSenha(senha, sal) { const b = await crypto.subtle.importKey("raw", new TextEncoder().encode(senha), "PBKDF2", false, ["deriveKey"]); return crypto.subtle.deriveKey({ name: "PBKDF2", salt: sal, iterations: 250000, hash: "SHA-256" }, b, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]); }
  const b64 = u => { let s = ""; for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode.apply(null, u.subarray(i, i + 0x8000)); return btoa(s); };
  const deb64 = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));
  $("#btBackup").onclick = async () => {
    if (!S.base) return;
    const senha = prompt("Escolha uma senha para proteger a cópia de segurança (mínimo de 8 caracteres). Ela será pedida para restaurar:"); if (senha == null) return;
    if (senha.length < 8) { $("#estadoBackup").textContent = "A senha precisa ter ao menos 8 caracteres."; return; }
    const sal = crypto.getRandomValues(new Uint8Array(16)), { iv, ct } = await cifrar(S, await chaveSenha(senha, sal));
    const blob = new Blob([JSON.stringify({ tipo: "hub-carteira", versao: 1, criado: new Date().toISOString(), sal: b64(sal), iv: b64(iv), dados: b64(ct) })], { type: "application/json" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = "Carteira HUB " + hojeISO() + ".hubcarteira"; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1500);
    $("#estadoBackup").textContent = "Cópia de segurança exportada.";
  };
  $("#btRestaurar").onclick = () => $("#arqBackup").click();
  $("#arqBackup").addEventListener("change", async e => {
    const f = e.target.files[0]; e.target.value = ""; if (!f) return;
    try {
      const o = JSON.parse(await f.text()); if (o.tipo !== "hub-carteira") throw new Error("O arquivo não é uma cópia de segurança da carteira.");
      const senha = prompt("Senha da cópia de segurança:"); if (senha == null) return;
      let dadosR; try { dadosR = await decifrar({ iv: deb64(o.iv), ct: deb64(o.dados) }, await chaveSenha(senha, deb64(o.sal))); } catch (x) { throw new Error("Senha incorreta ou arquivo corrompido."); }
      if (S.base && !confirm("Substituir a base e as anotações deste navegador pelas da cópia de segurança?")) return;
      S = Object.assign({ base: null, anot: {}, cfg: JSON.parse(JSON.stringify(CFG_PADRAO)), historico: [] }, dadosR); salvar(); iniciar();
      $("#estadoBackup").textContent = "Cópia de segurança restaurada: " + ((S.base && S.base.linhas.length) || 0) + " casos.";
    } catch (x) { $("#estadoBackup").textContent = x.message || String(x); }
  });
  $("#btApagar").onclick = async () => { if (!confirm("Apagar a base e todas as anotações deste navegador? Exporte antes uma cópia de segurança se quiser guardá-las.")) return; await DB.apagar("estado"); location.reload(); };

  /* ------------------------------------------------------------------ exportação e relatório */
  $("#btXlsx").onclick = async () => {
    await xlsx();
    const linhas = [["Pasta", "Subpasta", "Cliente", "Grupo econômico", "Parte contrária", "Tipo de ação", "Fase", "Número", "CNJ", "Comarca", "Tribunal", "Sistema", "Assunto", "Temas", "Importante", "Estratégico", "Réu preso", "Segredo", "Responsável", "Entrada", "Última atualização ADVWin", "Prioridade", "Próxima verificação", "Providências abertas", "Última discussão"]];
    for (const c of L) { const a = anotDe(c.cod), v = verificacao(c), ud = a && a.discussoes.length ? a.discussoes.slice().sort((x, y) => String(y.data).localeCompare(String(x.data)))[0] : null; linhas.push([c.cod, c.subpasta ? "sim" : "", c.cliente, c.grupo, c.contraria, c.tipo, c.fase, c.numero, c.cnj ? "sim" : "não", c.comarca, c.tribunal, c.sistema, c.assunto, c.temas.join("; "), c.importante ? "sim" : "", c.estrategico ? "sim" : "", c.reuPreso ? "sim" : "", c.segredo ? "sim" : "", c.advResp, dBr(c.entrada), dBr(c.ultAtualizacao), a ? a.prioridade : "", v ? (v.status === "atrasada" ? "atrasada" : dBr(v.proxima)) : "", provAbertas(c).map(p => p.texto + (p.prazo ? " (" + dBr(p.prazo) + ")" : "")).join("; "), ud ? dBr(ud.data) + ": " + ud.texto : ""]); }
    const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(linhas), "Processos");
    XLSX.writeFile(wb, "Carteira da area - " + hojeISO() + ".xlsx");
  };
  function descreverFiltros() { const l = []; const r = { adv: "advogado", cli: "cliente", tema: "tema", tipo: "tipo de ação", comarca: "comarca" }; for (const k of Object.keys(r)) if (FIL[k]) l.push(r[k] + " " + titulo(FIL[k])); for (const s of FIL.sit) l.push(($('[data-s="' + s + '"]') || { textContent: s }).textContent.toLowerCase()); for (const [k, v] of Object.entries(FIL.extra)) l.push(EXTRAS[k].toLowerCase() + " " + v); if (FIL.busca) l.push("busca \"" + FIL.busca + "\""); return l.length ? l.join("; ") : "carteira completa"; }
  $("#btWord").onclick = async () => {
    const t = L.length, b = [{ t: "tit", texto: "RELATÓRIO GERENCIAL DA CARTEIRA" }];
    b.push({ t: "tab", larg: [1.4, 3], linhas: [["Data", new Date().toLocaleDateString("pt-BR")], ["Base", (S.base.arquivo || "") + ", importada em " + new Date(S.base.importado).toLocaleString("pt-BR")], ["Seleção", descreverFiltros()], ["Pastas", nfmt(t) + " (" + L.filter(c => !c.subpasta).length + " principais)"]] });
    b.push({ t: "h", texto: "1. Panorama" });
    b.push({ t: "tab", cab: ["Indicador", "Quantidade", "Proporção"], larg: [2.4, 1, 1], linhas: [["Clientes e grupos", String(new Set(L.map(c => c.chaveCli)).size), ""], ["Importantes", String(L.filter(c => c.importante).length), pctf(L.filter(c => c.importante).length, t)], ["Estratégicos", String(L.filter(c => c.estrategico).length), pctf(L.filter(c => c.estrategico).length, t)], ["Réu preso", String(L.filter(c => c.reuPreso).length), pctf(L.filter(c => c.reuPreso).length, t)], ["Físicos e sem numeração CNJ", String(L.filter(c => c.fisico).length), pctf(L.filter(c => c.fisico).length, t)], ["Segredo de justiça", String(L.filter(c => c.segredo).length), pctf(L.filter(c => c.segredo).length, t)], ["Verificações atrasadas", String(L.filter(c => { const v = verificacao(c); return v && v.status === "atrasada"; }).length), ""], ["Providências abertas", String(L.reduce((s, c) => s + provAbertas(c).length, 0)), ""]] });
    insights().forEach(p => b.push({ t: "p", r: p }));
    b.push({ t: "h", texto: "2. Distribuição por advogado" });
    b.push({ t: "tab", cab: ["Advogado", "Pastas", "Importantes", "Estratégicos", "Réu preso", "Físicos", "Verif. atrasadas"], larg: [2, 0.8, 0.9, 0.9, 0.8, 0.8, 0.9], linhas: conta(L, c => c.advResp).map(([a, n]) => { const l = L.filter(c => c.advResp === a); return [titulo(a), String(n), String(l.filter(c => c.importante).length), String(l.filter(c => c.estrategico).length), String(l.filter(c => c.reuPreso).length), String(l.filter(c => c.fisico).length), String(l.filter(c => { const v = verificacao(c); return v && v.status === "atrasada"; }).length)]; }) });
    b.push({ t: "h", texto: "3. Temas e fases" });
    b.push({ t: "tab", cab: ["Tema", "Pastas", "Proporção"], larg: [3, 1, 1], linhas: conta(L, c => c.temas).map(([k, n]) => [k, String(n), pctf(n, t)]) });
    b.push({ t: "tab", cab: ["Fase", "Pastas", "Proporção"], larg: [3, 1, 1], linhas: conta(L, c => c.fase).map(([k, n]) => [k, String(n), pctf(n, t)]) });
    b.push({ t: "h", texto: "4. Principais clientes" });
    b.push({ t: "tab", cab: ["Cliente ou grupo", "Pastas", "Importantes", "Responsáveis"], larg: [2.4, 0.8, 0.9, 2.2], linhas: conta(L, c => c.chaveCli).slice(0, 20).map(([k, n]) => { const l = L.filter(c => c.chaveCli === k); return [titulo(k), String(n), String(l.filter(c => c.importante).length), conta(l, c => c.advResp).map(a => titulo(a[0])).join(", ")]; }) });
    const crit = L.filter(c => c.estrategico || c.reuPreso || (anotDe(c.cod) || {}).prioridade === "alta");
    if (crit.length) {
      b.push({ t: "h", texto: "5. Casos estratégicos, com réu preso e de prioridade alta" });
      b.push({ t: "tab", cab: ["Cliente e pasta", "Tipo e número", "Responsável", "Situação e providências"], larg: [1.8, 1.8, 1.2, 2.6], linhas: crit.map(c => { const a = anotDe(c.cod), v = verificacao(c), ud = a && a.discussoes.length ? a.discussoes.slice().sort((x, y) => String(y.data).localeCompare(String(x.data)))[0] : null; return [c.cliente + " · " + c.cod, titulo(c.tipo) + " · " + c.numero, titulo(c.advResp), [c.reuPreso ? "réu preso" : "", c.estrategico ? "estratégico" : "", v ? (v.ultima ? "verificado em " + dBr(v.ultima) : "sem verificação registrada") : "", provAbertas(c).map(p => "providência: " + p.texto + (p.prazo ? " (até " + dBr(p.prazo) + ")" : "")).join("; "), ud ? "último registro (" + dBr(ud.data) + "): " + ud.texto : ""].filter(Boolean).join("; ")]; }) });
    }
    const provs = []; L.forEach(c => provAbertas(c).forEach(p => provs.push([c.cliente + " · " + c.cod, p.texto, titulo(p.responsavel || ""), p.prazo ? dBr(p.prazo) + (p.prazo < hojeISO() ? " (vencida)" : "") : "-"])));
    if (provs.length) { b.push({ t: "h", texto: "6. Providências em aberto" }); b.push({ t: "tab", cab: ["Caso", "Providência", "Responsável", "Prazo"], larg: [1.8, 3, 1.2, 1], linhas: provs.sort((x, y) => x[3].localeCompare(y[3])) }); }
    const atr = L.filter(c => { const v = verificacao(c); return v && v.status === "atrasada"; });
    if (atr.length) { b.push({ t: "h", texto: "7. Verificações de andamento atrasadas" }); b.push({ t: "tab", cab: ["Caso", "Tipo e número", "Responsável", "Última verificação"], larg: [2, 2, 1.3, 1.1], linhas: atr.slice(0, 120).map(c => { const v = verificacao(c); return [c.cliente + " · " + c.cod, titulo(c.tipo) + " · " + c.numero, titulo(c.advResp), v.ultima ? dBr(v.ultima) : "nunca"]; }) }); if (atr.length > 120) b.push({ t: "p", r: [["E mais " + (atr.length - 120) + " casos; a lista completa está no painel.", "i"]] }); }
    b.push({ t: "data", texto: "Belo Horizonte, " + P.dataExtenso(new Date()) + "." });
    try { P.baixar(await P.docx(b), "Relatorio gerencial da carteira - " + hojeISO()); } catch (e) { window.HUB.toast(e.message || "Não foi possível gerar o Word.", 5000); }
  };

  /* ------------------------------------------------------------------ ciclo */
  $$("#abas .aba").forEach(b => b.addEventListener("click", () => {
    $$("#abas .aba").forEach(x => x.setAttribute("aria-selected", x === b ? "true" : "false")); ABA = b.dataset.aba;
    $$(".painel").forEach(p => { p.hidden = p.id !== "p-" + ABA; }); try { localStorage.setItem("carteira_aba", ABA); } catch (e) { /* ignora */ }
    renderAba();
  }));
  function renderAba() { if (!S.base) return; ({ painel, processos, clientes, equipe, acompanhamento, dados })[ABA](); }
  function atualizar() { if (!S.base) return; L = filtrar(S.base.linhas); PAG = 0; chipsAtivos(); $("#contagem").textContent = nfmt(L.length) + " de " + nfmt(S.base.linhas.length) + " pastas"; renderAba(); if (ABA !== "acompanhamento") { const atr = S.base.linhas.filter(c => { const v = verificacao(c); return v && v.status === "atrasada"; }).length; $("#contAcomp").textContent = atr || ""; } }
  function iniciar() {
    const tem = !!(S.base && S.base.linhas && S.base.linhas.length);
    $("#vazio").hidden = tem; $("#barraFiltros").hidden = !tem; $("#abas").hidden = !tem; $("#btXlsx").disabled = !tem; $("#btWord").disabled = !tem;
    if (!tem) { $$(".painel").forEach(p => p.hidden = true); return; }
    aplicarRegras(S.base.linhas);
    $("#baseInfo").textContent = "Base " + (S.base.arquivo || "") + ", importada em " + new Date(S.base.importado).toLocaleString("pt-BR") + " · " + nfmt(S.base.linhas.length) + " pastas. Dados guardados somente neste computador.";
    preencherSelects();
    let a = "painel"; try { a = localStorage.getItem("carteira_aba") || "painel"; } catch (e) { /* ignora */ }
    const b = $('#abas .aba[data-aba="' + a + '"]') || $('#abas .aba[data-aba="painel"]'); b.click(); atualizar();
  }
  carregar().then(() => iniciar()).catch(e => { $("#estadoVazio").textContent = e.message || String(e); });
})();
