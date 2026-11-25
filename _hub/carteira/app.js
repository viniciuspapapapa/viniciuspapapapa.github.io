/* Gestão da carteira: panorama dos processos da área a partir da planilha do ADVWin.
   A planilha é lida no navegador. A base, as correções e as anotações ficam no IndexedDB deste computador, cifradas
   com a chave do HUB; nenhum dado vai a servidor ou ao repositório. Os casos são reconhecidos pelo código da pasta.
   Correções feitas aqui valem na hora e geram a lista de alterações a enviar ao ADVWin; quando uma nova planilha
   traz o valor corrigido, a correção é dada como concluída. Ao incluir uma tarefa numa pasta, o painel prepara o
   e-mail ao advogado responsável (Outlook pelo Microsoft Graph, arquivo .eml ou o e-mail padrão), editável antes do envio. */
(function () {
  "use strict";
  const $ = s => document.querySelector(s), $$ = s => [...document.querySelectorAll(s)], esc = s => window.HUB.esc(s), P = window.TPC_PECA;
  const sem = s => String(s == null ? "" : s).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
  const dig = s => String(s || "").replace(/\D/g, "");
  const hoje = () => new Date().toISOString().slice(0, 10);
  const dBr = s => s ? String(s).slice(0, 10).split("-").reverse().join("/") : "";
  const dias = (a, b) => Math.round((new Date(b + "T12:00:00") - new Date(a + "T12:00:00")) / 86400000);
  const somaDias = (iso, n) => { const d = new Date(iso + "T12:00:00"); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };
  const nf = n => (+n || 0).toLocaleString("pt-BR");
  const pct = (a, b) => b ? Math.round(a / b * 100) + "%" : "0%";
  const PART = new Set(["de", "da", "do", "das", "dos", "e", "em", "na", "no", "para", "por", "a", "o"]);
  const titulo = s => String(s || "").split(/(\s+)/).map((w, i) => { if (!w || /^\s+$/.test(w)) return w; const l = w.toLowerCase(); if (i > 0 && PART.has(l)) return l; if (w.length <= 3 && /^[A-ZÀ-Ý]+$/.test(w)) return w; return l.replace(/(^|[(/-])([a-zà-ÿ])/g, (m, a, b) => a + b.toUpperCase()); }).join("");
  const curto = s => { const p = titulo(s).split(" ").filter((w, i) => i === 0 || !PART.has(w.toLowerCase())); return p.slice(0, 2).join(" "); };
  const primeiro = s => titulo(s).split(" ")[0] || "";
  function lib(nome, url, cdn, ok) {
    if (ok()) return Promise.resolve();
    return new Promise((res, rej) => { const t = i => { const u = [new URL(url, location.href).href, cdn][i]; if (!u) return rej(new Error("Não foi possível carregar " + nome + ".")); const s = document.createElement("script"); s.src = u; s.onload = () => ok() ? res() : t(i + 1); s.onerror = () => { s.remove(); t(i + 1); }; document.head.appendChild(s); }; t(0); });
  }
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
  const CFG0 = () => ({ autor: "", intervalos: { reuPreso: 7, estrategico: 7, importante: 15, manual: 30 }, grupoContravencao: "", emails: {}, avisar: true });
  const novoEstado = () => ({ versao: 2, base: null, edit: {}, alt: [], anot: {}, desde: {}, cfg: CFG0(), historico: [] });
  let S = novoEstado(), tmSalvar = null;
  function salvar() { clearTimeout(tmSalvar); tmSalvar = setTimeout(async () => { try { await DB.gravar("estado", await cifrar(S, await chave())); } catch (e) { window.HUB.toast("Não foi possível salvar: " + (e.message || e), 5000); } }, 250); }
  /* estado da versão anterior: base derivada, sem colunas originais nem correções */
  function migrar(o) {
    if (o.versao === 2) { const n = Object.assign(novoEstado(), o); n.cfg = Object.assign(CFG0(), o.cfg || {}); n.cfg.intervalos = Object.assign(CFG0().intervalos, (o.cfg || {}).intervalos || {}); n.cfg.emails = Object.assign({}, (o.cfg || {}).emails || {}); return n; }
    const n = novoEstado(); n.historico = o.historico || []; n.cfg.autor = (o.cfg || {}).autor || ""; n.cfg.grupoContravencao = (o.cfg || {}).grupoContravencao || "";
    if (o.base && o.base.linhas) {
      n.base = { arquivo: o.base.arquivo, importado: o.base.importado, colunas: o.base.colunas || [], saidas: o.base.saidas || [], raw: o.base.linhas.map(c => ({ cod: c.cod, cliente: c.cliente, grupo: c.grupoOrig != null ? c.grupoOrig : c.grupo, contraria: c.contraria, tipo: c.tipo, numero: c.numero, comarca: c.comarca === "Não informada" ? "" : c.comarca, tribunal: c.tribunal, vara: c.vara, sistema: c.fisicoSistema ? "Outros - Físico" : (c.sistema === "Não informado" ? "" : c.sistema), assunto: c.assunto, tags: (c.tags || []).join(","), natureza: c.natureza, advResp: c.advResp === "Sem responsável" ? "" : c.advResp, advLider: c.advLider, entrada: c.entrada, distribuicao: c.distribuicao, ultAtualizacao: c.ultAtualizacao, comentarios: c.comentarios, decisao: c.decisao, idAutojur: c.idAutojur, subpasta: c.subpasta ? "Subpasta" : "Principal", status: c.status })) };
      const d = (o.base.importado || "").slice(0, 10) || hoje(); n.base.raw.forEach(r => { n.desde[r.cod] = d; });
    }
    for (const [cod, a] of Object.entries(o.anot || {})) n.anot[cod] = { complexidade: "", intervalo: a.verificarDias || null, conferencias: (a.verificacoes || []).map(v => ({ data: v.data, autor: v.autor, nota: v.nota })), historico: (a.discussoes || []).map(d => ({ data: d.data, autor: d.autor, texto: d.texto })), providencias: (a.providencias || []).map(p => ({ id: p.id, texto: p.texto, responsavel: p.responsavel, prazo: p.prazo, feita: p.status === "concluida", feitaEm: p.concluida || "" })) };
    return n;
  }
  async function carregar() {
    const reg = await DB.ler("estado"); if (!reg) return;
    try { S = migrar(await decifrar(reg, await chave())); }
    catch (e) { $("#estadoVazio").textContent = "Há dados guardados neste navegador que não puderam ser abertos com a senha atual do HUB. Restaure a cópia de segurança (⚙) ou importe a planilha de novo."; }
  }

  /* ------------------------------------------------------------------ leitura da planilha */
  const COLS = [["cod", /codigo da pasta|^pasta$|^codigo$/], ["cliente", /^cliente$|^nome do cliente/], ["grupo", /grupo economico/], ["contraria", /parte contraria|^contrari/], ["tipo", /tipo de acao|^acao$/], ["numero", /numero (do )?processo|^processo$|^n[ºo°]? do processo/],
    ["comarca", /comarca|cidade/], ["tribunal", /^tribunal$|^orgao$/], ["vara", /vara|juizo/], ["sistema", /sistema/], ["assunto", /assunto|resumo/], ["tags", /tags/], ["natureza", /natureza|^area$/], ["advResp", /advogado responsavel|^responsavel$/], ["advLider", /advogado lider/],
    ["entrada", /data de entrada|^entrada$/], ["distribuicao", /distribuicao/], ["ultAtualizacao", /ultima atualizacao/], ["comentarios", /^comentarios/], ["decisao", /^decisao/], ["idAutojur", /id pasta/], ["subpasta", /subpasta/], ["status", /status/]];
  const ROTULO = { cod: "Código da pasta", cliente: "Cliente", grupo: "Grupo econômico", contraria: "Parte contrária", tipo: "Tipo de ação", numero: "Número do processo", comarca: "Comarca", tribunal: "Tribunal", vara: "Vara ou juízo", sistema: "Sistema do tribunal", assunto: "Assunto/Resumo", tags: "Tags de controle", natureza: "Natureza", advResp: "Advogado responsável", advLider: "Advogado líder", entrada: "Data de entrada", distribuicao: "Data de distribuição", ultAtualizacao: "Última atualização", comentarios: "Comentários", decisao: "Decisão", idAutojur: "ID Autojur", subpasta: "Subpasta", status: "Status da pasta", cnj: "Numeração CNJ", livre: "Observação" };
  const ESSENCIAIS = ["cod", "cliente", "numero", "tipo", "advResp", "tags", "comarca"];
  const isoData = v => { if (v == null || v === "") return ""; if (v instanceof Date) return isNaN(v) ? "" : new Date(v.getTime() - v.getTimezoneOffset() * 60000).toISOString().slice(0, 10); const s = String(v).trim(); let m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s); if (m) return m[0]; m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})/.exec(s); if (m) return m[3] + "-" + m[2].padStart(2, "0") + "-" + m[1].padStart(2, "0"); if (/^\d{5}(\.\d+)?$/.test(s)) return new Date(Date.UTC(1899, 11, 30) + parseFloat(s) * 86400000).toISOString().slice(0, 10); return ""; };
  async function lerPlanilha(f) {
    await xlsx();
    const wb = XLSX.read(await f.arrayBuffer(), { type: "array", cellDates: true });
    let melhor = null;
    for (const n of wb.SheetNames) {
      const l = XLSX.utils.sheet_to_json(wb.Sheets[n], { header: 1, raw: true, defval: "" });
      for (let i = 0; i < Math.min(l.length, 30); i++) {
        const cab = (l[i] || []).map(sem), acertos = COLS.filter(([, re]) => cab.some(c => re.test(c))).length;
        if (acertos >= 4 && (!melhor || acertos > melhor.acertos)) melhor = { l, i, acertos, aba: n };
      }
    }
    if (!melhor) throw new Error("Não reconheci a planilha: ela precisa ter o cabeçalho do ADVWin (código da pasta, cliente, número do processo…).");
    const cab = melhor.l[melhor.i].map(sem), mapa = {};
    for (const [k, re] of COLS) { const i = cab.findIndex((c, j) => re.test(c) && !Object.values(mapa).includes(j)); if (i >= 0) mapa[k] = i; }
    if (mapa.cod == null) throw new Error("Não encontrei a coluna \"Código da Pasta\", que identifica cada caso.");
    const raw = [], vistos = new Set(); let repetidos = 0;
    for (const l of melhor.l.slice(melhor.i + 1)) {
      const cod = String((l || [])[mapa.cod] || "").trim(); if (!cod) continue;
      if (vistos.has(cod)) { repetidos++; continue; } vistos.add(cod);
      const r = {}; for (const [k] of COLS) { const v = mapa[k] != null ? l[mapa[k]] : ""; r[k] = /^(entrada|distribuicao|ultAtualizacao)$/.test(k) ? isoData(v) : String(v == null ? "" : v).replace(/\r/g, "").trim(); }
      raw.push(r);
    }
    return { raw, colunas: Object.keys(mapa), faltam: ESSENCIAIS.filter(k => mapa[k] == null), repetidos };
  }

  /* ------------------------------------------------------------------ do registro do ADVWin ao caso */
  const TEMAS = [[/contravencao/, "Contravenção penal"], [/procedimentos_administrativos|procedimentos administrativos/, "Procedimentos e inquéritos"], [/maria_da_penha|maria da penha/, "Maria da Penha"], [/anpp|nao_persecucao/, "ANPP"], [/suspensao_condicional|suspensao condicional/, "Suspensão condicional"], [/transacao/, "Transação penal"], [/inquerito_policial|inquerito policial/, "Inquérito policial"], [/acao_penal|acao penal/, "Ação penal"]];
  const MARCAS = { importante: /processo_importante/i, estrategico: /estrategic/i, segredo: /segredo/i, reuPreso: /reu_preso|reu preso/i };
  const temaDe = tag => { const s = sem(tag); for (const [re, rot] of TEMAS) if (re.test(s)) return rot; return titulo(String(tag).replace(/^criminal_/i, "").replace(/_/g, " ")); };
  const FASES = [[/execucao/, "Execução penal"], [/apelacao|recurso|agravo|embargos|habeas|revisao criminal|mandado de seguranca|reclamacao/, "Recursos"], [/acao penal|queixa|denuncia/, "Ação penal"], [/inquerito|termo circunstanciado|noticia|representacao|investigacao|procedimento|flagrante/, "Investigação"], [/cautelar|medida protetiva|busca e apreensao|restituicao|sequestro|incidente|precatoria|quebra/, "Medidas e incidentes"], [/indeniza|civel|cobranca/, "Cível"]];
  const faseDe = (tipo, natureza) => { const s = sem(tipo); if (/civel/.test(sem(natureza))) return "Cível"; for (const [re, f] of FASES) if (re.test(s)) return f; return "Outros"; };
  const MATERIAS = [[/tribut|sonegac|ordem tributaria|8\.137/, "crimes tributários"], [/lavagem/, "lavagem de dinheiro"], [/organizacao criminosa|12\.850/, "organização criminosa"], [/sistema financeiro|7\.492|evasao de divisas/, "sistema financeiro"], [/licitac|peculato|corrupc|administracao publica|concussao/, "crimes contra a administração pública"], [/homicidio|feminicidio/, "crimes contra a vida"], [/estupro|dignidade sexual|vulneravel/, "crimes sexuais"]];
  const materiaComplexa = a => { const s = sem(a); for (const [re, r] of MATERIAS) if (re.test(s)) return r; return ""; };
  function cnjValido(d) { if (!/^\d{20}$/.test(d)) return false; try { const v = BigInt(d.slice(0, 7) + d.slice(9, 13) + d[13] + d.slice(14, 16) + d.slice(16, 20) + "00"); return 98n - (v % 97n) === BigInt(+d.slice(7, 9)); } catch (e) { return false; } }
  const fmtCnj = d => d.replace(/^(\d{7})(\d{2})(\d{4})(\d)(\d{2})(\d{4})$/, "$1-$2.$3.$4.$5.$6");
  function caso(r) {
    const tags = String(r.tags || "").split(/[,;]+/).map(s => s.trim()).filter(Boolean), tagTxt = tags.join(",");
    const num = String(r.numero || "").trim(), nd = dig(num), cnjDecl = /^sim$/i.test(String(r.cnj || "").trim()), cnj = nd.length === 20 || cnjDecl, fisicoSist = /fisic/.test(sem(r.sistema));
    const temas = [...new Set(tags.filter(t => !Object.values(MARCAS).some(re => re.test(t))).map(temaDe))];
    const c = { cod: r.cod, cliente: r.cliente || "(sem cliente)", grupo: /sem grupo/i.test(r.grupo || "") ? "" : (r.grupo || ""), contraria: String(r.contraria || "").replace(/\s*\n\s*/g, " · "), tipo: r.tipo || "Não informado", numero: num, nd, cnj, cnjOk: nd.length === 20 ? cnjValido(nd) : cnjDecl, cnjIncompleto: cnjDecl && nd.length !== 20,
      semNumero: !nd || /pre-?cadastro|pendente/i.test(num), manual: !cnj || (fisicoSist && !cnjDecl), fisicoSist, comarca: r.comarca || "Não informada", tribunal: r.tribunal || "", vara: r.vara || "", sistema: r.sistema || "Não informado", assunto: r.assunto || "",
      tags, temas: temas.length ? temas : ["Sem tema"], importante: MARCAS.importante.test(tagTxt), estrategico: MARCAS.estrategico.test(tagTxt), segredo: MARCAS.segredo.test(tagTxt), reuPreso: MARCAS.reuPreso.test(tagTxt),
      natureza: r.natureza || "", fase: faseDe(r.tipo, r.natureza), advResp: r.advResp || "Sem responsável", advLider: r.advLider || "", entrada: r.entrada || "", distribuicao: r.distribuicao || "", ultAtualizacao: r.ultAtualizacao || "", comentarios: r.comentarios || "", decisao: r.decisao || "", idAutojur: r.idAutojur || "", subpasta: /sub/i.test(r.subpasta || ""), editado: false };
    c.contravencao = c.temas.includes("Contravenção penal");
    c.materia = materiaComplexa(c.assunto);
    c.superior = /superior|supremo|stj|stf/i.test(c.tribunal) || /especial|extraordinario/.test(sem(c.tipo));
    return c;
  }
  /* casos efetivos: registro do ADVWin + correções feitas aqui; contravenções no grupo econômico predominante */
  let CASOS = [], PORCOD = new Map(), GRUPO_CONTRAV = "";
  const rawDe = cod => S.base.raw.find(x => x.cod === cod);
  function montar() {
    if (!S.base) { CASOS = []; PORCOD = new Map(); return; }
    CASOS = S.base.raw.map(r => { const ed = S.edit[r.cod]; const c = caso(ed ? Object.assign({}, r, ed) : r); c.editado = !!(ed && Object.keys(ed).length); return c; });
    const m = new Map(); CASOS.filter(c => c.contravencao && c.grupo).forEach(c => m.set(c.grupo, (m.get(c.grupo) || 0) + 1));
    GRUPO_CONTRAV = S.cfg.grupoContravencao || [...m].sort((a, b) => b[1] - a[1]).map(x => x[0])[0] || "";
    for (const c of CASOS) { if (c.contravencao && !c.grupo && GRUPO_CONTRAV) c.grupoInferido = GRUPO_CONTRAV; c.chaveCli = c.grupo || c.grupoInferido || c.cliente; c.cx = complexidade(c); }
    PORCOD = new Map(CASOS.map(c => [c.cod, c]));
  }

  /* ------------------------------------------------------------------ complexidade */
  const PESO = { baixa: 1, media: 2, alta: 3 }, NIVEL_ROT = { alta: "Alta", media: "Média", baixa: "Baixa" };
  function complexidade(c, semAjuste) {
    const m = [], soma = (p, t) => m.push([p, t]);
    if (c.reuPreso) soma(3, "réu preso");
    if (c.estrategico) soma(3, "caso estratégico");
    if (c.importante) soma(2, "marcado como importante");
    if (c.fase === "Recursos") soma(2, "fase recursal");
    if (c.superior) soma(1, "tribunal superior");
    if (c.fase === "Ação penal") soma(1, "ação penal em curso");
    if (c.fase === "Execução penal") soma(1, "execução penal");
    if (c.materia) soma(2, "matéria de maior complexidade (" + c.materia + ")");
    if (c.segredo) soma(1, "segredo de justiça");
    if (c.contravencao) soma(-1, "contravenção, tratada em rotina padronizada");
    if (/termo circunstanciado/.test(sem(c.tipo))) soma(-1, "termo circunstanciado");
    const pontos = m.reduce((s, x) => s + x[0], 0), a = S.anot[c.cod];
    let nivel = pontos >= 5 ? "alta" : pontos >= 2 ? "media" : "baixa", manual = false;
    if (!semAjuste && a && a.complexidade) { nivel = a.complexidade; manual = true; }
    return { nivel, pontos, motivos: m.filter(x => x[0] > 0).map(x => x[1]), atenuantes: m.filter(x => x[0] < 0).map(x => x[1]), manual };
  }
  const cxHtml = c => '<span class="cx ' + c.cx.nivel + '"><i></i>' + NIVEL_ROT[c.cx.nivel] + "</span>";

  /* ------------------------------------------------------------------ acompanhamento */
  const A = cod => S.anot[cod] || (S.anot[cod] = { complexidade: "", intervalo: null, conferencias: [], historico: [], providencias: [] });
  const anot = cod => S.anot[cod] || null;
  function intervalo(c) {
    const a = anot(c.cod); if (a && a.intervalo) return +a.intervalo;
    const I = S.cfg.intervalos, l = [];
    if (c.reuPreso) l.push(I.reuPreso); if (c.estrategico) l.push(I.estrategico); if (c.importante) l.push(I.importante); if (c.manual) l.push(I.manual);
    return l.length ? Math.min(...l) : null;
  }
  /* andamento a conferir: caso prioritário cujo andamento não foi conferido dentro do intervalo combinado,
     contado da última conferência ou da data em que o caso entrou no painel */
  function conferencia(c) {
    const n = intervalo(c); if (!n) return null;
    const a = anot(c.cod), ult = a && a.conferencias.length ? a.conferencias[a.conferencias.length - 1].data : "", base = ult || S.desde[c.cod] || hoje();
    const prox = somaDias(base, n), falta = dias(hoje(), prox);
    return { intervalo: n, ultima: ult, proxima: prox, falta, aConferir: falta <= 0 };
  }
  const provPend = c => { const a = anot(c.cod); return a ? a.providencias.filter(p => !p.feita) : []; };
  const provVencida = p => p.prazo && p.prazo <= hoje();
  function conferir(cod, nota) { const a = A(cod); a.conferencias.push({ data: hoje(), autor: S.cfg.autor || "", nota: nota || "" }); if (nota) a.historico.push({ data: hoje(), autor: S.cfg.autor || "", texto: "Andamento conferido: " + nota }); salvar(); }

  /* ------------------------------------------------------------------ e-mail ao responsável */
  const EQUIPE = [["lais azevedo", "laisa@tpcadvogados.com.br"], ["rodrigo peixoto", "rodrigop@tpcadvogados.com.br"], ["vinicius papa", "viniciuss@tpcadvogados.com.br"], ["renato dilly", "renato.campos@tpcadvogados.com.br"]];
  function emailDe(nome) { const s = sem(nome); if (!s) return ""; if (S.cfg.emails[s] != null) return S.cfg.emails[s]; const p = EQUIPE.find(([k]) => s.includes(k)); return p ? p[1] : ""; }
  const cfgOutlook = () => { try { const l = JSON.parse(localStorage.getItem("relatorio_outlook") || "null"); if (l && l.clientId) return l; } catch (e) { /* ignora */ } return (window.HUB_CONFIG && window.HUB_CONFIG.outlook) || {}; };
  function mensagemPadrao(c, p) {
    const resp = p.responsavel || c.advResp, quem = S.cfg.autor || "";
    const assunto = "Pasta " + c.cod + " · Nova tarefa: " + (p.texto.length > 70 ? p.texto.slice(0, 68) + "…" : p.texto);
    const corpo = "Olá, " + primeiro(resp) + ".\n\nFoi incluída uma tarefa na pasta " + c.cod + ".\n\nO que deve ser feito: " + p.texto + "\nPrazo: " + (p.prazo ? dBr(p.prazo) : "sem prazo definido") +
      "\n\nCliente: " + c.cliente + (c.contraria ? "\nParte contrária: " + c.contraria : "") + "\nProcesso: " + titulo(c.tipo) + (c.numero ? ", nº " + c.numero : "") + "\nComarca: " + c.comarca + (c.tribunal ? " · " + c.tribunal : "") +
      "\n\nPor favor, confirme quando concluir.\n\n" + (quem ? quem + "\n" : "") + "Enviado pela Gestão da carteira do HUB TPC";
    return { para: emailDe(resp), cc: "", assunto, corpo };
  }
  const htmlDe = t => '<div style="font-family:Segoe UI,Arial,sans-serif;font-size:14px;line-height:1.5">' + esc(t).replace(/\n/g, "<br>") + "</div>";
  function compor(cod, pid) {
    const c = PORCOD.get(cod), a = A(cod), p = a.providencias.find(x => x.id === pid); if (!c || !p) return;
    FICHA = cod; const m = mensagemPadrao(c, p), cfg = cfgOutlook();
    $("#gaveta").innerHTML = '<div class="cab"><div><div class="sobretitulo">Pasta ' + esc(c.cod) + " · " + esc(c.cliente) + '</div><h2>Avisar o responsável</h2></div><button type="button" class="btn-icone" id="fechar" aria-label="Fechar">×</button></div>' +
      '<p class="motivos" style="margin-top:10px">Revise e ajuste o e-mail antes de enviar. O assunto leva o número da pasta.</p>' +
      '<div class="grade" style="margin-top:12px"><label class="campo">Para<input type="email" id="mPara" multiple value="' + esc(m.para) + '" placeholder="e-mail do responsável"></label><label class="campo">Com cópia (opcional)<input type="text" id="mCc" placeholder="separe por vírgula"></label><label class="campo">Assunto<input type="text" id="mAssunto" value="' + esc(m.assunto) + '"></label><label class="campo">Mensagem<textarea id="mCorpo" rows="14" style="min-height:280px">' + esc(m.corpo) + "</textarea></label></div>" +
      (m.para ? "" : '<p class="aviso-num nao">Não há e-mail cadastrado para ' + esc(titulo(p.responsavel || c.advResp)) + ". Informe-o acima ou em ⚙ Configurações.</p>") +
      '<div class="linha-btns" style="margin-top:14px">' + (cfg.clientId ? '<button type="button" class="btn" id="mEnviar">Enviar pelo Outlook</button><button type="button" class="btn sec" id="mEml">Abrir no Outlook para revisar</button>' : '<button type="button" class="btn" id="mEml">Abrir no Outlook</button>') + '<button type="button" class="btn sec" id="mMailto">Abrir no e-mail padrão</button><button type="button" class="btn sec" id="mVoltar">Não enviar</button></div>' +
      '<p class="pequeno mudo" id="mEstado" style="margin-top:8px">' + (cfg.clientId ? "O envio pelo Outlook usa a sua conta Microsoft 365 e guarda a cópia em Itens Enviados." : "Abrir no Outlook gera a mensagem pronta para enviar. Para enviar direto daqui, configure o aplicativo Microsoft 365 do escritório no Relatório processual.") + "</p>";
    $("#gaveta").hidden = false; $("#veu").hidden = false;
    $("#fechar").onclick = fecharFicha; $("#mVoltar").onclick = () => ficha(cod, "afazer");
    const msg = () => ({ para: $("#mPara").value, cc: $("#mCc").value, assunto: $("#mAssunto").value.trim(), corpo: $("#mCorpo").value, html: htmlDe($("#mCorpo").value) });
    const registrar = via => { const x = msg(); p.avisos = (p.avisos || []).concat({ data: hoje(), para: x.para, via }); a.historico.push({ data: hoje(), autor: S.cfg.autor || "", texto: "Tarefa comunicada por e-mail a " + (x.para || "destinatário a definir") + " (" + via + "): " + p.texto }); salvar(); };
    const valida = () => { const x = msg(); if (!window.REL_ENVIO || !window.REL_ENVIO.lista(x.para).length) { $("#mEstado").textContent = "Informe ao menos um e-mail válido em Para."; $("#mPara").focus(); return null; } return x; };
    const b = $("#mEnviar"); if (b) b.onclick = async () => { const x = valida(); if (!x) return; b.disabled = true; $("#mEstado").textContent = "Enviando pelo Outlook…"; try { await window.REL_ENVIO.enviarGraph(cfg, { para: x.para, cc: x.cc, assunto: x.assunto, html: x.html }); registrar("Outlook"); window.HUB.toast("E-mail enviado a " + x.para + "."); ficha(cod, "afazer"); } catch (e) { $("#mEstado").textContent = e.message || String(e); b.disabled = false; } };
    $("#mEml").onclick = async () => { const x = valida(); if (!x) return; const blob = await window.REL_ENVIO.eml({ para: x.para, cc: x.cc, assunto: x.assunto, html: x.html }); const l = document.createElement("a"); l.href = URL.createObjectURL(blob); l.download = "Pasta " + c.cod + " - tarefa.eml"; document.body.appendChild(l); l.click(); setTimeout(() => { URL.revokeObjectURL(l.href); l.remove(); }, 1500); registrar("Outlook, arquivo .eml"); $("#mEstado").textContent = "Mensagem gerada: abra o arquivo baixado no Outlook e clique em Enviar."; };
    $("#mMailto").onclick = () => { const x = valida(); if (!x) return; const lista = window.REL_ENVIO.lista; location.href = "mailto:" + lista(x.para).join(",") + "?" + [lista(x.cc).length ? "cc=" + encodeURIComponent(lista(x.cc).join(",")) : "", "subject=" + encodeURIComponent(x.assunto), "body=" + encodeURIComponent(x.corpo)].filter(Boolean).join("&"); registrar("e-mail padrão"); $("#mEstado").textContent = "O programa de e-mail abriu a mensagem; confira e envie."; };
  }

  /* ------------------------------------------------------------------ correções para o ADVWin */
  const EDITAVEIS = ["cliente", "grupo", "contraria", "tipo", "numero", "cnj", "comarca", "tribunal", "vara", "sistema", "assunto", "advResp", "natureza", "distribuicao", "tags"];
  const igual = (a, b) => sem(a) === sem(b);
  function registrarCorrecao(cod, novos) {
    const r = rawDe(cod); if (!r) return 0;
    const ed = S.edit[cod] || {}; let n = 0;
    for (const campo of EDITAVEIS) {
      if (!(campo in novos)) continue;
      const v = String(novos[campo] == null ? "" : novos[campo]).trim(), atual = campo in ed ? ed[campo] : r[campo];
      if (igual(v, atual)) continue;
      const i = S.alt.findIndex(x => x.cod === cod && x.campo === campo && x.status !== "aplicada");
      if (igual(v, r[campo])) { delete ed[campo]; if (i >= 0) S.alt.splice(i, 1); n++; continue; }
      ed[campo] = v; n++;
      if (i >= 0) Object.assign(S.alt[i], { para: v, data: hoje(), autor: S.cfg.autor || S.alt[i].autor, status: "pendente", enviadaEm: "" });
      else S.alt.push({ id: novoId(), cod, campo, de: campo === "cnj" ? "" : r[campo] || "", para: v, data: hoje(), autor: S.cfg.autor || "", status: "pendente" });
    }
    if (Object.keys(ed).length) S.edit[cod] = ed; else delete S.edit[cod];
    salvar(); montar(); return n;
  }
  const novoId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  /* solicitação livre ao setor do ADVWin: outro campo ou observação, sem efeito automático no painel */
  function registrarSolicitacao(cod, rotulo, texto) { S.alt.push({ id: novoId(), cod, campo: "livre", rotulo: rotulo || "Observação", de: "", para: texto, data: hoje(), autor: S.cfg.autor || "", status: "pendente" }); salvar(); }
  /* textos legíveis de cada correção, para a tela e para os arquivos enviados ao setor */
  function textoAlt(a) {
    const r = rawDe(a.cod) || {};
    if (a.campo === "cnj") return { campo: "Numeração CNJ", de: "Número sem padrão CNJ" + (r.numero ? " (" + r.numero + ")" : ""), para: a.para ? "Processo com numeração CNJ" + (dig(r.numero).length === 20 ? "" : "; incluir o número completo no padrão CNJ") : "Processo sem numeração CNJ" };
    if (a.campo === "livre") return { campo: a.rotulo || "Observação", de: "", para: a.para };
    return { campo: ROTULO[a.campo] || a.campo, de: a.de, para: a.para };
  }
  function desfazerCorrecao(id) { const a = S.alt.find(x => x.id === id); if (!a) return; if (a.campo !== "livre") { const ed = S.edit[a.cod]; if (ed) { delete ed[a.campo]; if (!Object.keys(ed).length) delete S.edit[a.cod]; } } S.alt = S.alt.filter(x => x !== a); salvar(); montar(); }
  /* nova planilha: correções que o ADVWin já incorporou são concluídas */
  function conciliar() {
    const porCod = new Map(S.base.raw.map(r => [r.cod, r])); let concl = 0;
    for (const a of S.alt) {
      if (a.status === "aplicada" || a.campo === "livre") continue; const r = porCod.get(a.cod); if (!r) continue;
      if (a.campo === "cnj" ? (a.para && dig(r.numero).length === 20) : igual(r[a.campo], a.para)) { a.status = "aplicada"; a.aplicadaEm = hoje(); concl++; const ed = S.edit[a.cod]; if (ed) { delete ed[a.campo]; if (!Object.keys(ed).length) delete S.edit[a.cod]; } }
      else if (a.campo !== "cnj" && !igual(r[a.campo], a.de)) { a.obs = "O ADVWin agora traz: " + (r[a.campo] || "(vazio)"); a.de = r[a.campo] || ""; }
    }
    return concl;
  }

  /* ------------------------------------------------------------------ importação */
  async function importar(f) {
    const msg = t => { $("#estadoVazio").textContent = t; const e = $("#estadoImport"); if (e) e.textContent = t; window.HUB.toast(t, 6000); };
    msg("Lendo a planilha…");
    try {
      const { raw, colunas, faltam, repetidos } = await lerPlanilha(f);
      const antes = new Set(((S.base && S.base.raw) || []).map(r => r.cod)), agora = new Set(raw.map(r => r.cod));
      const novos = raw.filter(r => !antes.has(r.cod)).length, saidas = ((S.base && S.base.raw) || []).filter(r => !agora.has(r.cod));
      S.base = { arquivo: f.name, importado: new Date().toISOString(), colunas, faltam, raw, saidas: saidas.map(r => ({ cod: r.cod, cliente: r.cliente, numero: r.numero })) };
      raw.forEach(r => { if (!S.desde[r.cod]) S.desde[r.cod] = hoje(); });
      const concl = conciliar();
      S.historico.unshift({ data: new Date().toISOString(), arquivo: f.name, n: raw.length, novos: antes.size ? novos : raw.length, saidas: saidas.length, concluidas: concl });
      S.historico = S.historico.slice(0, 30);
      salvar(); iniciar();
      msg(nf(raw.length) + " pastas lidas" + (antes.size ? ": " + novos + " novas, " + saidas.length + " saíram da base" + (concl ? ", " + concl + " correções confirmadas pelo ADVWin" : "") : "") + "." + (faltam.length ? " Colunas não encontradas: " + faltam.map(k => ROTULO[k]).join(", ") + "." : "") + (repetidos ? " " + repetidos + " linhas repetidas foram ignoradas." : ""));
    } catch (e) { msg(e.message || String(e)); }
  }
  function zona(z) {
    ["dragenter", "dragover"].forEach(ev => z.addEventListener(ev, e => { e.preventDefault(); z.classList.add("sobre"); }));
    ["dragleave", "drop"].forEach(ev => z.addEventListener(ev, e => { e.preventDefault(); z.classList.remove("sobre"); }));
    z.addEventListener("drop", e => { const f = e.dataTransfer.files[0]; if (f) importar(f); });
    z.addEventListener("click", () => $("#arq").click());
  }
  $("#arq").addEventListener("change", e => { const f = e.target.files[0]; e.target.value = ""; if (f) importar(f); });
  $("#btAtualizar").onclick = () => $("#arq").click();
  zona($("#zona"));

  /* ------------------------------------------------------------------ filtros */
  const FIL = { adv: "", busca: "", cli: "", tema: "", fase: "", cx: "", tipo: "", comarca: "", sit: "", pasta: "", mes: "" };
  const ROT_FIL = { cli: "Cliente", tema: "Tema", fase: "Fase", cx: "Complexidade", tipo: "Tipo", comarca: "Comarca", sit: "Situação", pasta: "Pastas", mes: "Entrada" };
  const ROT_SIT = { reuPreso: "com réu preso", estrategico: "estratégicos", importante: "importantes", manual: "acompanhamento manual", conferir: "andamento a conferir", providencia: "com providência pendente", editado: "com correção para o ADVWin", segredo: "segredo de justiça" };
  function passa(c, ignorarAdv) {
    if (!ignorarAdv && FIL.adv && c.advResp !== FIL.adv) return false;
    if (FIL.cli && c.chaveCli !== FIL.cli) return false;
    if (FIL.tema && !c.temas.includes(FIL.tema)) return false;
    if (FIL.fase && c.fase !== FIL.fase) return false;
    if (FIL.cx && c.cx.nivel !== FIL.cx) return false;
    if (FIL.tipo && c.tipo !== FIL.tipo) return false;
    if (FIL.comarca && c.comarca !== FIL.comarca) return false;
    if (FIL.pasta === "principal" && c.subpasta) return false;
    if (FIL.mes && !c.entrada.startsWith(FIL.mes)) return false;
    if (FIL.sit) {
      const s = FIL.sit;
      if (s === "conferir") { const v = conferencia(c); if (!v || !v.aConferir) return false; }
      else if (s === "providencia") { if (!provPend(c).length) return false; }
      else if (!c[s]) return false;
    }
    if (FIL.busca) {
      const q = sem(FIL.busca), qd = dig(FIL.busca), alvo = sem([c.cliente, c.grupo, c.grupoInferido, c.contraria, c.tipo, c.numero, c.cod, c.assunto, c.comarca, c.tribunal, c.idAutojur].join(" "));
      if (!q.split(" ").every(t => alvo.includes(t)) && !(qd.length >= 5 && c.nd.includes(qd))) return false;
    }
    return true;
  }
  const filtrados = () => CASOS.filter(c => passa(c));
  const conta = (l, f) => { const m = new Map(); for (const c of l) for (const k of [].concat(f(c))) m.set(k, (m.get(k) || 0) + 1); return [...m].sort((a, b) => b[1] - a[1]); };
  function definir(k, v) { FIL[k] = FIL[k] === v ? "" : v; sincronizarSelects(); render(); }
  function sincronizarSelects() { const m = { cli: "#fCliente", tema: "#fTema", fase: "#fFase", cx: "#fComplex", tipo: "#fTipo", comarca: "#fComarca", sit: "#fSit", pasta: "#fPasta" }; for (const [k, s] of Object.entries(m)) if ($(s)) $(s).value = FIL[k]; $("#busca").value = FIL.busca; }
  function lente(el) {
    const advs = conta(CASOS, c => c.advResp);
    el.innerHTML = '<span class="rot">Ver:</span><button type="button" class="pilula" data-adv="" aria-pressed="' + (!FIL.adv) + '">Equipe toda<small>' + nf(CASOS.length) + "</small></button>" + advs.map(([a, n]) => '<button type="button" class="pilula" data-adv="' + esc(a) + '" aria-pressed="' + (FIL.adv === a) + '" title="' + esc(titulo(a)) + '">' + esc(curto(a)) + "<small>" + n + "</small></button>").join("");
  }
  function ativos(el, comLink) {
    const l = [];
    for (const k of Object.keys(ROT_FIL)) if (FIL[k]) { let v = FIL[k]; if (k === "cx") v = NIVEL_ROT[v]; if (k === "sit") v = ROT_SIT[v]; if (k === "pasta") v = "só principais"; if (k === "mes") v = v.length === 4 ? v : v.split("-").reverse().join("/"); if (k === "cli") v = titulo(v); l.push('<button type="button" data-tira="' + k + '">' + ROT_FIL[k] + ": " + esc(v) + " ×</button>"); }
    if (FIL.busca) l.push('<button type="button" data-tira="busca">Busca: ' + esc(FIL.busca) + " ×</button>");
    el.innerHTML = l.length ? "Filtrando por " + l.join("") + '<button type="button" class="limpar" data-tira="*">limpar</button>' + (comLink ? '<button type="button" class="limpar" data-ver-proc>ver os ' + nf(filtrados().length) + " processos</button>" : "") : "";
  }

  /* ------------------------------------------------------------------ gráficos */
  const graficos = {}, CORES = ["#EB6834", "#2B2B2B", "#2A78D6", "#1BAF7A", "#E8E347", "#8E6CC9", "#D03B3B", "#7A9CC6", "#B8B8B8", "#C58B4E"];
  const COR_CX = { alta: "#D03B3B", media: "#EB6834", baixa: "#C9C3B8" };
  async function grafico(id, cfg, aoClicar) {
    try { await chartLib(); } catch (e) { return; }
    const el = $("#" + id); if (!el) return;
    if (graficos[id]) graficos[id].destroy(); const v = Chart.getChart(el); if (v) v.destroy();
    cfg.options = Object.assign({ responsive: true, maintainAspectRatio: false, animation: false, plugins: { legend: { display: false } } }, cfg.options || {});
    if (aoClicar) { cfg.options.onClick = (ev, els) => { if (els.length) aoClicar(els[0].index, els[0].datasetIndex); }; cfg.options.onHover = (ev, els) => { ev.native.target.style.cursor = els.length ? "pointer" : "default"; }; }
    graficos[id] = new Chart(el, cfg);
  }
  const barrasH = (rot, val, cor) => ({ type: "bar", data: { labels: rot.map(r => r.length > 34 ? r.slice(0, 32) + "…" : r), datasets: [{ data: val, backgroundColor: cor, borderRadius: 4, maxBarThickness: 22 }] }, options: { indexAxis: "y", scales: { x: { ticks: { precision: 0 }, grid: { display: false } }, y: { grid: { display: false }, ticks: { font: { size: 12 } } } }, plugins: { legend: { display: false }, tooltip: { callbacks: { title: it => rot[it[0].dataIndex] } } } } });

  /* ------------------------------------------------------------------ visão geral */
  function geral() {
    lente($("#lenteGeral")); ativos($("#ativosGeral"), true);
    const L = filtrados(), t = L.length, princ = L.filter(c => !c.subpasta).length, cli = new Set(L.map(c => c.chaveCli)).size;
    const alta = L.filter(c => c.cx.nivel === "alta").length, man = L.filter(c => c.manual).length;
    const conf = L.filter(c => { const v = conferencia(c); return v && v.aConferir; }).length, prov = L.reduce((s, c) => s + provPend(c).filter(provVencida).length, 0);
    const card = (rot, n, txt, acao, atencao) => '<button type="button" class="numero' + (atencao ? " atencao" : "") + '" data-acao="' + acao + '"><span class="rot">' + rot + "</span><b>" + nf(n) + "</b><p>" + txt + "</p></button>";
    $("#numeros").innerHTML = card("Processos", t, nf(princ) + " pastas principais e " + nf(t - princ) + " subpastas, de " + nf(cli) + " clientes", "processos")
      + card("Complexidade alta", alta, "Pedem mais dedicação: réu preso, casos estratégicos, recursos e matérias complexas", "cx-alta")
      + card("Acompanhamento manual", man, "Sem numeração CNJ ou físicos: não aparecem nas consultas automáticas e precisam ser conferidos à mão", "manual")
      + card("Para hoje", conf + prov, (conf ? nf(conf) + (conf === 1 ? " andamento a conferir" : " andamentos a conferir") : "Nenhum andamento a conferir") + (prov ? " e " + nf(prov) + (prov === 1 ? " tarefa vencida ou do dia" : " tarefas vencidas ou do dia") : "") + ". Veja na aba Advogados.", "hoje", conf + prov > 0);
    /* carga da equipe por complexidade (ignora o filtro de advogado, para comparar) */
    const LA = CASOS.filter(c => passa(c, true)), advs = conta(LA, c => c.advResp).map(a => a[0]);
    grafico("gCarga", { type: "bar", data: { labels: advs.map(curto), datasets: ["alta", "media", "baixa"].map(n => ({ label: "Complexidade " + NIVEL_ROT[n].toLowerCase(), data: advs.map(a => LA.filter(c => c.advResp === a && c.cx.nivel === n).length), backgroundColor: COR_CX[n], borderRadius: 3, maxBarThickness: 46 })) }, options: { plugins: { legend: { display: true, position: "bottom", labels: { boxWidth: 12 } } }, scales: { x: { stacked: true, grid: { display: false } }, y: { stacked: true, ticks: { precision: 0 } } } } }, (i, ds) => { FIL.adv = advs[i]; FIL.cx = ["alta", "media", "baixa"][ds]; sincronizarSelects(); abrirAba("processos"); });
    const fas = conta(L, c => c.fase); grafico("gFase", { type: "doughnut", data: { labels: fas.map(f => f[0]), datasets: [{ data: fas.map(f => f[1]), backgroundColor: CORES, borderWidth: 1 }] }, options: { cutout: "58%", plugins: { legend: { display: true, position: "right", labels: { boxWidth: 12 } } } } }, i => definir("fase", fas[i][0]));
    const tem = conta(L, c => c.temas).slice(0, 10); grafico("gTema", barrasH(tem.map(x => x[0]), tem.map(x => x[1]), "#EB6834"), i => definir("tema", tem[i][0]));
    const cl = conta(L, c => c.chaveCli).slice(0, 10); grafico("gCli", barrasH(cl.map(x => titulo(x[0])), cl.map(x => x[1]), "#2A78D6"), i => definir("cli", cl[i][0]));
    const meses = []; const d0 = new Date(); d0.setDate(1); for (let i = 23; i >= 0; i--) { const d = new Date(d0.getFullYear(), d0.getMonth() - i, 1); meses.push(d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0")); }
    grafico("gEntrada", { type: "bar", data: { labels: meses.map(m => m.slice(5) + "/" + m.slice(2, 4)), datasets: [{ data: meses.map(m => L.filter(c => c.entrada.startsWith(m)).length), backgroundColor: "#2B2B2B", borderRadius: 3 }] }, options: { scales: { x: { grid: { display: false } }, y: { ticks: { precision: 0 } } } } }, i => definir("mes", meses[i]));
    $("#leitura").innerHTML = leitura(L).map(p => "<p>" + p + "</p>").join("");
  }
  $("#numeros").addEventListener("click", e => {
    const b = e.target.closest("[data-acao]"); if (!b) return; const a = b.dataset.acao;
    if (a === "processos") abrirAba("processos");
    else if (a === "cx-alta") { FIL.cx = "alta"; sincronizarSelects(); abrirAba("processos"); }
    else if (a === "manual") { FIL.sit = "manual"; sincronizarSelects(); abrirAba("processos"); }
    else if (a === "hoje") abrirAba("advogados");
  });
  function leitura(L) {
    const t = L.length, out = []; if (!t) return ["Nenhum processo com esses filtros."];
    const cli = conta(L, c => c.chaveCli), top = cli.slice(0, 5).reduce((s, c) => s + c[1], 0);
    out.push("Os cinco maiores clientes concentram <b>" + pct(top, t) + "</b> dos processos: " + esc(cli.slice(0, 5).map(c => titulo(c[0]) + " (" + c[1] + ")").join(", ")) + ".");
    if (GRUPO_CONTRAV) { const n = L.filter(c => c.chaveCli === GRUPO_CONTRAV).length; if (n > 20) out.push("O grupo " + esc(titulo(GRUPO_CONTRAV)) + " soma <b>" + nf(n) + "</b> processos, quase todos de contravenção penal: volume alto e baixa complexidade individual, o que favorece o trabalho em lote, com modelos padronizados."); }
    const advs = conta(L, c => c.advResp).filter(a => a[1] >= 5);
    if (advs.length > 1) { const pesos = advs.map(([a]) => [a, L.filter(c => c.advResp === a).reduce((s, c) => s + PESO[c.cx.nivel], 0)]).sort((x, y) => y[1] - x[1]); const topAlta = (conta(L.filter(c => c.cx.nivel === "alta"), c => c.advResp)[0] || [""])[0]; out.push("Pela carga ponderada, que considera a complexidade, " + esc(curto(pesos[0][0])) + " tem a carteira mais pesada (" + nf(pesos[0][1]) + " pontos), seguido de " + esc(pesos.slice(1, 3).map(p => curto(p[0]) + " (" + nf(p[1]) + ")").join(" e ")) + "." + (topAlta ? " " + esc(curto(topAlta)) + " concentra a maior parte dos casos de complexidade alta." : "")); }
    const man = L.filter(c => c.manual).length; if (man) out.push("<b>" + nf(man) + "</b> processos não têm numeração CNJ ou tramitam em meio físico e não aparecem em consultas automáticas; o andamento deles precisa ser conferido à mão, a cada " + S.cfg.intervalos.manual + " dias.");
    const preso = L.filter(c => c.reuPreso).length; if (preso) out.push("<b>" + nf(preso) + "</b> " + (preso === 1 ? "processo tem" : "processos têm") + " réu preso, com controle de prazos da prisão e de reavaliação da custódia (CPP, art. 316, parágrafo único).");
    const ano = new Date().getFullYear(), n1 = L.filter(c => c.entrada.startsWith(String(ano))).length, n0 = L.filter(c => c.entrada.startsWith(String(ano - 1))).length;
    if (n0) out.push("Entraram <b>" + nf(n1) + "</b> casos em " + ano + ", contra " + nf(n0) + " em " + (ano - 1) + (n1 > n0 ? ", um crescimento de " + pct(n1 - n0, n0) : "") + ".");
    const inc = inconsistencias().reduce((s, g) => s + g.casos.length, 0); if (inc) out.push("A leitura da base apontou <b>" + nf(inc) + "</b> possíveis erros de cadastro, listados na aba Correções para o ADVWin.");
    return out;
  }

  /* ------------------------------------------------------------------ advogados */
  let ADV = "";
  function advogados() {
    const advs = conta(CASOS, c => c.advResp);
    if (!ADV || !advs.some(a => a[0] === ADV)) ADV = FIL.adv || (advs[0] || [""])[0];
    const grandes = advs.filter(a => a[1] >= 5), mediaPeso = grandes.reduce((s, [a]) => s + CASOS.filter(c => c.advResp === a).reduce((x, c) => x + PESO[c.cx.nivel], 0), 0) / Math.max(1, grandes.length);
    $("#equipe").innerHTML = advs.map(([a, n]) => {
      const l = CASOS.filter(c => c.advResp === a), q = k => l.filter(c => c.cx.nivel === k).length, peso = l.reduce((s, c) => s + PESO[c.cx.nivel], 0);
      const hojeN = l.filter(c => { const v = conferencia(c); return v && v.aConferir; }).length + l.reduce((s, c) => s + provPend(c).filter(provVencida).length, 0);
      return '<button type="button" class="adv" data-sel="' + esc(a) + '" aria-pressed="' + (a === ADV) + '"><h3>' + esc(titulo(a)) + '</h3><div class="linha"><span>Processos</span><b>' + n + '</b></div><div class="linha"><span>Carga ponderada</span><b>' + peso + '</b></div><div class="linha"><span>Para hoje</span><b>' + hojeN + '</b></div><div class="pilha" title="Alta ' + q("alta") + " · média " + q("media") + " · baixa " + q("baixa") + '"><i style="width:' + (q("alta") / n * 100) + "%;background:" + COR_CX.alta + '"></i><i style="width:' + (q("media") / n * 100) + "%;background:" + COR_CX.media + '"></i><i style="width:' + (q("baixa") / n * 100) + "%;background:" + COR_CX.baixa + '"></i></div></button>';
    }).join("");
    detalheAdv(mediaPeso);
  }
  $("#equipe").addEventListener("click", e => { const b = e.target.closest("[data-sel]"); if (!b) return; ADV = b.dataset.sel; advogados(); $("#detalheAdv").scrollIntoView({ behavior: "smooth", block: "start" }); });
  function detalheAdv(mediaPeso) {
    const a = ADV, l = CASOS.filter(c => c.advResp === a); if (!l.length) { $("#detalheAdv").innerHTML = ""; return; }
    const peso = l.reduce((s, c) => s + PESO[c.cx.nivel], 0), q = k => l.filter(c => c.cx.nivel === k).length;
    const itens = [];
    for (const c of CASOS) for (const p of provPend(c)) if (c.advResp === a || sem(p.responsavel) === sem(a)) itens.push({ q: p.prazo || "9999", html: '<div class="quando' + (provVencida(p) ? " venc" : "") + '">' + (p.prazo ? (p.prazo < hoje() ? "venceu " : p.prazo === hoje() ? "hoje " : "") + dBr(p.prazo) : "sem prazo") + '</div><div class="o-que"><b>' + esc(p.texto) + '</b><br><span class="sec2"><a href="#" data-cod="' + esc(c.cod) + '">' + esc(c.cliente) + "</a> · pasta " + esc(c.cod) + (sem(p.responsavel) !== sem(a) && p.responsavel ? " · com " + esc(curto(p.responsavel)) : "") + '</span></div><button type="button" class="mini" data-feita="' + esc(c.cod) + "|" + p.id + '">Feita</button>' });
    for (const c of l) { const v = conferencia(c); if (v && v.falta <= 3) itens.push({ q: v.proxima, html: '<div class="quando' + (v.aConferir ? " venc" : "") + '">' + (v.aConferir ? (v.falta < 0 ? "há " + -v.falta + " dias" : "hoje") : "em " + v.falta + " dias") + '</div><div class="o-que">Conferir o andamento<br><span class="sec2"><a href="#" data-cod="' + esc(c.cod) + '">' + esc(c.cliente) + "</a> · " + esc(titulo(c.tipo)) + " · " + (c.manual ? "acompanhamento manual" : esc(c.numero)) + '</span></div><button type="button" class="mini" data-conferir="' + esc(c.cod) + '">Conferi hoje</button>' }); }
    itens.sort((x, y) => x.q.localeCompare(y.q));
    const complexos = l.filter(c => c.cx.nivel === "alta").sort((x, y) => y.cx.pontos - x.cx.pontos);
    const fas = conta(l, c => c.fase), cl = conta(l, c => c.chaveCli).slice(0, 6);
    $("#detalheAdv").innerHTML = '<div class="card detalhe-adv" style="padding:20px"><div class="cab"><h2 style="margin:0">' + esc(titulo(a)) + '</h2><span class="sec2">' + l.length + " processos · " + q("alta") + " de complexidade alta, " + q("media") + " média e " + q("baixa") + " baixa · carga ponderada " + peso + (mediaPeso ? " (média da equipe: " + Math.round(mediaPeso) + ")" : "") + "</span></div>" +
      '<div class="duas"><div><h3 style="font-size:16px;margin:0 0 4px">Próximos dias</h3><p class="sec2" style="margin:0 0 8px">Tarefas pendentes e andamentos a conferir nos próximos 3 dias. Um andamento fica "a conferir" quando o caso é prioritário e ninguém conferiu o processo no intervalo combinado.</p>' + (itens.length ? itens.slice(0, 30).map(i => '<div class="agenda-item">' + i.html + "</div>").join("") : '<p class="vazio-p">Nada para os próximos dias.</p>') + "</div>" +
      '<div><h3 style="font-size:16px;margin:0 0 8px">Processos mais complexos</h3>' + (complexos.length ? '<table class="t"><tbody>' + complexos.slice(0, 12).map(c => '<tr class="clic" data-cod="' + esc(c.cod) + '"><td><b>' + esc(c.cliente) + '</b><br><span class="sec2">' + esc(titulo(c.tipo)) + " · " + esc(c.cx.motivos.slice(0, 3).join(", ")) + "</span></td></tr>").join("") + "</tbody></table>" + (complexos.length > 12 ? '<p class="sec2"><a href="#" data-ver-alta>ver os ' + complexos.length + " casos de complexidade alta</a></p>" : "") : '<p class="vazio-p">Nenhum processo de complexidade alta.</p>') +
      '<h3 style="font-size:16px;margin:18px 0 6px">Composição da carteira</h3><p class="sec2" style="margin:0">Fases: ' + esc(fas.map(f => f[0] + " " + f[1]).join(" · ")) + "<br>Principais clientes: " + esc(cl.map(c => titulo(c[0]) + " " + c[1]).join(" · ")) + "</p></div></div></div>";
  }

  /* ------------------------------------------------------------------ processos */
  let ORD = { k: "cx", dir: -1 }, PAG = 0; const POR = 50;
  const ORDENS = { cliente: c => sem(c.cliente), processo: c => sem(c.tipo), adv: c => sem(c.advResp), cx: c => PESO[c.cx.nivel] * 100 + c.cx.pontos, prov: c => (provPend(c).map(p => p.prazo || "9999").sort()[0] || "z") };
  function situacao(c) {
    const m = [], v = conferencia(c);
    if (c.reuPreso) m.push('<span class="mk preso">réu preso</span>'); if (c.estrategico) m.push('<span class="mk est">estratégico</span>'); if (c.importante) m.push('<span class="mk imp">importante</span>');
    if (c.manual) m.push('<span class="mk man">' + (c.semNumero ? "sem número" : "manual") + "</span>");
    if (c.cnjIncompleto) m.push('<span class="mk ok">CNJ informado</span>');
    if (v && v.aConferir) m.push('<span class="mk alerta">conferir andamento</span>');
    if (c.editado) m.push('<span class="mk ok">corrigido</span>');
    return m.join("");
  }
  function opcoes(sel, rot, pares, fmt) { const v = sel.value; sel.innerHTML = '<option value="">' + rot + "</option>" + pares.map(([k, n]) => '<option value="' + esc(k) + '">' + esc(fmt ? fmt(k) : k) + " (" + n + ")</option>").join(""); sel.value = pares.some(p => p[0] === v) ? v : ""; }
  function preencherFiltros() {
    opcoes($("#fCliente"), "Todos os clientes", conta(CASOS, c => c.chaveCli).sort((a, b) => a[0].localeCompare(b[0], "pt-BR")), titulo);
    opcoes($("#fTema"), "Todos os temas", conta(CASOS, c => c.temas)); opcoes($("#fFase"), "Todas as fases", conta(CASOS, c => c.fase));
    opcoes($("#fTipo"), "Todos os tipos de ação", conta(CASOS, c => c.tipo), titulo); opcoes($("#fComarca"), "Todas as comarcas", conta(CASOS, c => c.comarca));
    sincronizarSelects();
  }
  [["#fCliente", "cli"], ["#fTema", "tema"], ["#fFase", "fase"], ["#fComplex", "cx"], ["#fTipo", "tipo"], ["#fComarca", "comarca"], ["#fSit", "sit"], ["#fPasta", "pasta"]].forEach(([s, k]) => $(s).addEventListener("change", e => { FIL[k] = e.target.value; PAG = 0; render(); }));
  let tmB = null; $("#busca").addEventListener("input", e => { clearTimeout(tmB); tmB = setTimeout(() => { FIL.busca = e.target.value.trim(); PAG = 0; render(); }, 200); });
  $("#btFiltros").onclick = () => { const f = $("#filtrosMais"); f.hidden = !f.hidden; $("#btFiltros").setAttribute("aria-expanded", String(!f.hidden)); $("#btFiltros").textContent = f.hidden ? "Mais filtros" : "Menos filtros"; };
  function processos() {
    lente($("#lenteProc")); ativos($("#ativosProc"), false);
    const f = ORDENS[ORD.k], L = filtrados().sort((a, b) => { const x = f(a), y = f(b); return (x < y ? -1 : x > y ? 1 : 0) * ORD.dir || sem(a.cliente).localeCompare(sem(b.cliente)); });
    const pags = Math.max(1, Math.ceil(L.length / POR)); PAG = Math.min(PAG, pags - 1);
    const th = (k, r) => "<th" + (k ? ' data-ord="' + k + '"' : "") + ">" + r + (ORD.k === k ? (ORD.dir > 0 ? " ▲" : " ▼") : "") + "</th>";
    $("#tabela").innerHTML = "<thead><tr>" + th("cliente", "Cliente") + th("processo", "Processo") + th("adv", "Responsável") + th("cx", "Complexidade") + th("", "Situação") + th("prov", "Próxima tarefa") + "</tr></thead><tbody>" +
      (L.slice(PAG * POR, PAG * POR + POR).map(c => { const p = provPend(c).sort((x, y) => (x.prazo || "9").localeCompare(y.prazo || "9"))[0]; return '<tr class="clic" data-cod="' + esc(c.cod) + '"><td><b>' + esc(c.cliente) + '</b><br><span class="sec2">Pasta ' + esc(c.cod) + (c.subpasta ? " · subpasta" : "") + "</span></td><td>" + esc(titulo(c.tipo)) + '<br><span class="sec2"><span class="num">' + esc(c.numero || "sem número") + "</span> · " + esc(c.comarca) + "</span></td><td>" + esc(curto(c.advResp)) + "</td><td>" + cxHtml(c) + "</td><td>" + situacao(c) + "</td><td>" + (p ? esc(p.texto.slice(0, 50)) + '<br><span class="sec2"' + (provVencida(p) ? ' style="color:#a02424"' : "") + ">" + (p.prazo ? dBr(p.prazo) : "sem prazo") + "</span>" : '<span class="sec2">-</span>') + "</td></tr>"; }).join("") || '<tr><td colspan="6" class="vazio-p">Nenhum processo com esses filtros.</td></tr>') + "</tbody>";
    $("#pagInfo").textContent = L.length ? nf(L.length) + " processos · mostrando " + (PAG * POR + 1) + " a " + Math.min(L.length, PAG * POR + POR) : "";
    $("#pagAnt").disabled = PAG === 0; $("#pagProx").disabled = PAG >= pags - 1;
  }
  $("#tabela").addEventListener("click", e => { const th = e.target.closest("th[data-ord]"); if (th) { ORD = { k: th.dataset.ord, dir: ORD.k === th.dataset.ord ? -ORD.dir : (th.dataset.ord === "cx" ? -1 : 1) }; processos(); } });
  $("#pagAnt").onclick = () => { PAG--; processos(); }; $("#pagProx").onclick = () => { PAG++; processos(); };

  /* ------------------------------------------------------------------ correções e erros da base */
  function inconsistencias() {
    const g = (id, tit, desc, f, sugestao) => ({ id, tit, desc, casos: CASOS.filter(f), sugestao });
    return [
      g("dv", "Número CNJ com dígito verificador que não confere", "Provável erro de digitação no número.", c => c.nd.length === 20 && !c.cnjOk),
      g("semnum", "Pasta sem número de processo", "Em pré-cadastro, pendente ou em branco.", c => c.semNumero),
      g("mascara", "Número CNJ sem pontuação", "Cadastrado só com os 20 dígitos; o formato padrão facilita a busca nos tribunais.", c => c.nd.length === 20 && c.cnjOk && !/[-.]/.test(c.numero), c => ({ numero: fmtCnj(c.nd) })),
      g("cnjinc", "Numeração CNJ informada, mas o número está incompleto", "Marcado como CNJ no painel; falta cadastrar o número completo.", c => c.cnjIncompleto),
      g("fisicocnj", "Marcado como físico, mas com numeração CNJ", "Confira se o processo não migrou para o meio eletrônico.", c => c.fisicoSist && c.nd.length === 20),
      g("semresp", "Sem advogado responsável", "", c => c.advResp === "Sem responsável"),
      g("semcomarca", "Sem comarca", "", c => c.comarca === "Não informada" && c.fase !== "Recursos"),
      g("semgrupo", "Contravenção sem grupo econômico", "O painel já as reúne no grupo predominante; a correção leva o grupo ao ADVWin.", c => c.contravencao && !c.grupo && GRUPO_CONTRAV, () => ({ grupo: GRUPO_CONTRAV }))
    ].filter(x => x.casos.length);
  }
  const rotCampo = k => ROTULO[k] || k;
  function alteracoes() {
    const pend = S.alt.filter(a => a.status === "pendente"), env = S.alt.filter(a => a.status === "enviada"), concl = S.alt.filter(a => a.status === "aplicada");
    const linha = (a, chk) => { const c = PORCOD.get(a.cod), tx = textoAlt(a); return "<tr>" + (chk ? '<td><input type="checkbox" class="selAlt" value="' + a.id + '" aria-label="Selecionar"></td>' : "") + '<td><a href="#" data-cod="' + esc(a.cod) + '"><b>' + esc(c ? c.cliente : a.cod) + '</b></a><br><span class="sec2">Pasta ' + esc(a.cod) + "</span></td><td>" + esc(tx.campo) + "</td><td>" + esc(a.campo === "livre" ? "-" : tx.de || "(vazio)") + "</td><td><b>" + esc(tx.para || "(vazio)") + "</b>" + (a.obs ? '<br><span class="sec2">' + esc(a.obs) + "</span>" : "") + '</td><td class="sec2">' + dBr(a.data) + (a.autor ? "<br>" + esc(a.autor) : "") + (a.enviadaEm ? "<br>enviada " + dBr(a.enviadaEm) : "") + (a.aplicadaEm ? "<br>concluída " + dBr(a.aplicadaEm) : "") + "</td>" + (a.status !== "aplicada" ? '<td><button type="button" class="mini" data-desfaz="' + a.id + '">Desfazer</button>' + (a.status === "enviada" ? ' <button type="button" class="mini" data-repend="' + a.id + '">Reabrir</button> <button type="button" class="mini" data-concluir="' + a.id + '" title="O setor já fez a alteração no ADVWin">Concluída</button>' : "") + "</td>" : "") + "</tr>"; };
    const tab = (l, chk, vazio) => l.length ? '<div class="rolagem"><table class="t"><thead><tr>' + (chk ? '<th><input type="checkbox" id="selTodas" aria-label="Selecionar todas"></th>' : "") + "<th>Pasta</th><th>Campo</th><th>Como está no ADVWin</th><th>Como deve ficar</th><th>Registro</th>" + (l[0].status !== "aplicada" ? "<th></th>" : "") + "</tr></thead><tbody>" + l.map(a => linha(a, chk)).join("") + "</tbody></table></div>" : '<p class="vazio-p">' + vazio + "</p>";
    $("#altPend").innerHTML = formSolicitacao() + tab(pend, true, "Nenhuma correção a enviar. Para corrigir uma pasta, abra-a e use a aba Corrigir dados, ou inclua uma solicitação acima.");
    $("#altEnv").innerHTML = tab(env, false, "Nenhuma correção aguardando o ADVWin.");
    $("#altConcl").innerHTML = tab(concl, false, "Nenhuma correção concluída ainda."); $("#contConcl").textContent = concl.length ? "(" + concl.length + ")" : "";
    ["#altXlsx", "#altWord", "#altEnviar"].forEach(s => $(s).disabled = !pend.length);
    const inc = inconsistencias();
    $("#inconsist").innerHTML = inc.length ? inc.map(g => '<details style="border-top:1px solid var(--line);padding:10px 0"><summary style="cursor:pointer"><b>' + esc(g.tit) + '</b> <span class="sec2">' + g.casos.length + (g.desc ? " · " + esc(g.desc) : "") + "</span></summary>" + (g.sugestao ? '<div class="linha-btns" style="margin:8px 0"><button type="button" class="mini" data-sug-todas="' + g.id + '">Corrigir as ' + g.casos.length + " de uma vez</button></div>" : "") + '<table class="t"><tbody>' + g.casos.slice(0, 200).map(c => '<tr class="clic" data-cod="' + esc(c.cod) + '" data-aba-ficha="corrigir"><td><b>' + esc(c.cliente) + '</b><br><span class="sec2">Pasta ' + esc(c.cod) + "</span></td><td>" + esc(titulo(c.tipo)) + '<br><span class="num">' + esc(c.numero || "sem número") + "</span></td><td>" + (g.sugestao ? '<span class="sec2">sugestão: ' + esc(Object.values(g.sugestao(c))[0]) + "</span>" : "") + "</td></tr>").join("") + "</tbody></table></details>").join("") : '<p class="vazio-p">Nenhum erro aparente na base.</p>';
  }
  const CAMPOS_SOLIC = ["Incluir a numeração CNJ", "Número do processo", "Assunto/Resumo", "Tipo de ação", "Parte contrária", "Comarca", "Vara ou juízo", "Tribunal", "Sistema do tribunal", "Data de distribuição", "Advogado responsável", "Tags de controle", "Cliente", "Grupo econômico", "Encerramento ou arquivamento da pasta", "Outro campo", "Observação"];
  function formSolicitacao() {
    return '<details style="margin-bottom:12px"><summary style="cursor:pointer" class="pequeno"><b>Incluir outra solicitação</b> <span class="mudo">(outro campo, inclusão de dado ou comentário ao setor)</span></summary><div class="grade g3" style="margin-top:10px"><label class="campo">Pasta<input type="text" id="nsPasta" list="lsPastas" placeholder="código ou cliente"></label><label class="campo">Assunto da solicitação<select id="nsCampo">' + CAMPOS_SOLIC.map(x => "<option>" + esc(x) + "</option>").join("") + '</select></label><span></span><label class="campo" style="grid-column:1/-1">O que deve ser feito<textarea id="nsTexto" placeholder="Ex.: incluir o número CNJ 1234567-89.2024.8.13.0024; corrigir o assunto para estelionato (art. 171 do CP)"></textarea></label><button type="button" class="btn" id="nsIncluir" style="justify-self:start">Incluir na lista</button></div><datalist id="lsPastas">' + CASOS.map(c => '<option value="' + esc(c.cod + " · " + c.cliente) + '">').join("") + "</datalist></details>";
  }
  const selecionadas = () => { const ids = $$(".selAlt:checked").map(x => x.value); const pend = S.alt.filter(a => a.status === "pendente"); return ids.length ? pend.filter(a => ids.includes(a.id)) : pend; };
  $("#altEnviar").onclick = () => { const l = selecionadas(); if (!l.length) return; l.forEach(a => { a.status = "enviada"; a.enviadaEm = hoje(); }); salvar(); render(); window.HUB.toast(l.length + " correções marcadas como enviadas."); };
  const linhasExport = l => l.map(a => { const c = PORCOD.get(a.cod), r = rawDe(a.cod) || {}, tx = textoAlt(a); return { pasta: a.cod, cliente: c ? c.cliente : r.cliente || "", numero: r.numero || "", campo: tx.campo, de: a.campo === "livre" ? "-" : tx.de || "", para: tx.para || "", autor: a.autor || "", data: dBr(a.data) }; });
  $("#altXlsx").onclick = async () => {
    const l = linhasExport(selecionadas()); if (!l.length) return; await xlsx();
    const ws = XLSX.utils.aoa_to_sheet([["Código da pasta", "Cliente", "Número do processo (ADVWin)", "Campo a alterar", "Como está no ADVWin", "Como deve ficar", "Solicitado por", "Data"], ...l.map(x => [x.pasta, x.cliente, x.numero, x.campo, x.de, x.para, x.autor, x.data])]);
    ws["!cols"] = [{ wch: 14 }, { wch: 36 }, { wch: 28 }, { wch: 22 }, { wch: 36 }, { wch: 36 }, { wch: 18 }, { wch: 11 }];
    const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, "Correções"); XLSX.writeFile(wb, "Correcoes para o ADVWin - " + hoje() + ".xlsx");
  };
  $("#altWord").onclick = async () => {
    const l = linhasExport(selecionadas()); if (!l.length) return;
    const pastas = [...new Set(l.map(x => x.pasta))];
    const b = [{ t: "tit", texto: "SOLICITAÇÃO DE ATUALIZAÇÃO CADASTRAL NO ADVWIN" }];
    b.push({ t: "p", r: "Solicitamos a atualização dos dados abaixo no ADVWin, conferidos pela área criminal. São " + l.length + (l.length === 1 ? " alteração" : " alterações") + " em " + pastas.length + (pastas.length === 1 ? " pasta" : " pastas") + ". Para cada uma, indicamos como o dado está hoje no sistema e como deve ficar." });
    b.push({ t: "tab", cab: ["Pasta", "Cliente e processo", "Campo", "Como está", "Como deve ficar"], larg: [1, 1.9, 1.2, 1.6, 1.6], linhas: l.map(x => [x.pasta, x.cliente + (x.numero ? " · " + x.numero : ""), x.campo, x.de || "(vazio)", x.para || "(vazio)"]) });
    b.push({ t: "p", r: [["Nas observações e inclusões, a coluna \"Como deve ficar\" descreve o que deve ser feito.", "i"]] });
    b.push({ t: "p", r: [["Solicitado por: ", "bo"], [(S.cfg.autor || [...new Set(l.map(x => x.autor).filter(Boolean))].join(", ") || "área criminal"), "n"]] });
    b.push({ t: "data", texto: "Belo Horizonte, " + P.dataExtenso(new Date()) + "." });
    try { P.baixar(await P.docx(b), "Correcoes para o ADVWin - " + hoje()); } catch (e) { window.HUB.toast(e.message || "Não foi possível gerar o Word.", 5000); }
  };

  /* ------------------------------------------------------------------ ficha do processo */
  let FICHA = null;
  function ficha(cod, abaF) {
    const c = PORCOD.get(cod); if (!c) { if ((S.base.saidas || []).some(x => x.cod === cod)) window.HUB.toast("A pasta " + cod + " não consta mais na base do ADVWin."); return; }
    FICHA = cod; abaF = abaF || "resumo";
    const a = A(cod), v = conferencia(c), ed = S.edit[cod] || {}, cx = c.cx, r0 = rawDe(cod);
    const val = (campo, txt) => (campo && campo in ed ? '<span class="editado" title="Corrigido aqui; no ADVWin: ' + esc(r0[campo] || "(vazio)") + '">' + txt + "</span>" : txt);
    const linha = (rot, campo, txt) => txt ? "<dt>" + rot + "</dt><dd>" + val(campo, txt) + "</dd>" : "";
    let h = '<div class="cab"><div><div class="sobretitulo">Pasta ' + esc(c.cod) + (c.subpasta ? " · subpasta" : "") + "</div><h2>" + esc(c.cliente) + '</h2><p class="sec2" style="margin:4px 0 0">' + esc(titulo(c.tipo)) + " · " + esc(curto(c.advResp)) + '</p><div style="margin-top:8px">' + cxHtml(c) + " " + situacao(c) + '</div></div><button type="button" class="btn-icone" id="fechar" aria-label="Fechar">×</button></div>';
    h += '<div class="abas-f" role="tablist">' + [["resumo", "Resumo"], ["afazer", "Tarefas" + (provPend(c).length ? " (" + provPend(c).length + ")" : "")], ["historico", "Histórico"], ["corrigir", "Corrigir dados"]].map(([k, rt]) => '<button type="button" role="tab" data-af="' + k + '" aria-selected="' + (abaF === k) + '">' + rt + "</button>").join("") + "</div>";
    if (abaF === "resumo") {
      h += '<h3>Processo</h3><dl>' + linha("Número", "numero", (c.numero ? '<span class="num">' + esc(c.numero) + "</span>" : '<span class="mk man">sem número</span>') + (c.cnjIncompleto ? ' <span class="mk ok">CNJ informado</span> <span class="sec2">falta o número completo</span> <button type="button" class="mini" data-cnj="nao">Não é CNJ</button>' : c.cnj ? (c.cnjOk ? ' <span class="mk ok">CNJ</span>' : ' <span class="mk alerta">CNJ com dígito inválido</span>') : (c.numero ? ' <span class="mk man">sem numeração CNJ</span>' : "") + ' <button type="button" class="mini" data-cnj="sim" title="Informe que o processo tem numeração CNJ; o painel se atualiza e a informação vai para a lista do ADVWin">É numeração CNJ</button>')) + linha("Parte contrária", "contraria", esc(c.contraria)) + linha("Grupo econômico", "grupo", esc(c.grupo || (c.grupoInferido ? c.grupoInferido + " (atribuído pelo painel)" : ""))) + linha("Comarca", "comarca", esc(c.comarca)) + linha("Tribunal", "tribunal", esc(c.tribunal)) + linha("Vara ou juízo", "vara", esc(c.vara)) + linha("Sistema", "sistema", esc(c.sistema)) + linha("Assunto", "assunto", esc(c.assunto)) + linha("Fase", "", esc(c.fase)) + linha("Entrada", "", dBr(c.entrada)) + linha("Última atualização no ADVWin", "", dBr(c.ultAtualizacao)) + linha("Decisão", "", esc(c.decisao)) + linha("Tags do ADVWin", "tags", esc(c.tags.join(", "))) + "</dl>";
      h += "<h3>Complexidade " + NIVEL_ROT[cx.nivel].toLowerCase() + '</h3><p class="motivos">' + (cx.manual ? "Definida manualmente. " : "") + (cx.motivos.length ? "Pesam: " + esc(cx.motivos.join("; ")) + "." : "Sem fatores de complexidade.") + (cx.atenuantes.length ? " Reduzem: " + esc(cx.atenuantes.join("; ")) + "." : "") + '</p><label class="campo" style="max-width:320px;margin-top:8px">Ajustar a complexidade<select id="fxCx"><option value="">Calculada pelo painel (' + NIVEL_ROT[complexidade(c, true).nivel].toLowerCase() + ')</option><option value="alta">Alta</option><option value="media">Média</option><option value="baixa">Baixa</option></select></label>';
      if (c.comentarios) h += '<h3>Comentário no ADVWin</h3><p class="motivos">' + esc(c.comentarios) + "</p>";
      if (c.nd.length === 20) h += '<p style="margin-top:16px"><a class="btn sec peq" href="../relatorio/" target="_blank" rel="noopener">Consultar andamentos no DataJud</a> <button type="button" class="mini" id="copiar">Copiar número</button></p>';
    } else if (abaF === "afazer") {
      const pend = a.providencias.filter(p => !p.feita), feitas = a.providencias.filter(p => p.feita);
      h += "<h3>Tarefas</h3>" + (pend.length ? pend.map(p => '<div class="prov"><input type="checkbox" data-pfeita="' + p.id + '" aria-label="Marcar como feita"><div class="txt" style="flex:1"><b>' + esc(p.texto) + '</b><div class="meta">' + (p.responsavel ? esc(curto(p.responsavel)) + " · " : "") + (p.prazo ? (provVencida(p) ? '<span style="color:#a02424">prazo ' + dBr(p.prazo) + "</span>" : "prazo " + dBr(p.prazo)) : "sem prazo") + (p.avisos && p.avisos.length ? " · e-mail enviado em " + dBr(p.avisos[p.avisos.length - 1].data) : "") + '</div></div><button type="button" class="mini" data-pmail="' + p.id + '">' + (p.avisos && p.avisos.length ? "Reenviar e-mail" : "Enviar por e-mail") + "</button></div>").join("") : '<p class="vazio-p">Nenhuma tarefa pendente nesta pasta.</p>');
      h += '<div class="grade g3" style="margin-top:10px"><label class="campo" style="grid-column:1/-1">Nova tarefa<input type="text" id="npTexto" placeholder="O que precisa ser feito"></label><label class="campo">Responsável<select id="npResp">' + [...new Set(CASOS.map(x => x.advResp))].sort().map(rr => '<option value="' + esc(rr) + '"' + (rr === c.advResp ? " selected" : "") + ">" + esc(curto(rr)) + "</option>").join("") + '</select></label><label class="campo">Prazo<input type="date" id="npPrazo"></label><button type="button" class="btn" id="npAdd" style="align-self:end">Incluir tarefa</button></div><label class="pequeno" style="display:inline-flex;gap:6px;align-items:center;margin-top:8px"><input type="checkbox" id="npAvisar"' + (S.cfg.avisar !== false ? " checked" : "") + "> Avisar o responsável por e-mail ao incluir</label>";
      if (feitas.length) h += '<details style="margin-top:12px"><summary class="sec2" style="cursor:pointer">' + feitas.length + (feitas.length === 1 ? " feita" : " feitas") + "</summary>" + feitas.map(p => '<div class="prov feita"><input type="checkbox" checked data-pfeita="' + p.id + '" aria-label="Reabrir"><div class="txt">' + esc(p.texto) + '<div class="meta">feita em ' + dBr(p.feitaEm) + "</div></div></div>").join("") + "</details>";
      h += '<h3>Conferência de andamento</h3><p class="motivos">' + (v ? "Caso prioritário: o andamento deve ser conferido a cada " + v.intervalo + " dias. " + (v.ultima ? "Última conferência em " + dBr(v.ultima) + ". " : "Ainda não conferido pelo painel. ") + (v.aConferir ? "<b>Está na hora de conferir.</b>" : "Próxima em " + dBr(v.proxima) + ".") : "Este caso não exige conferência periódica, mas você pode definir um intervalo.") + '</p><div class="linha-btns" style="margin-top:8px;align-items:end"><button type="button" class="btn sec peq" data-conferir="' + esc(cod) + '">Conferi o andamento hoje</button><label class="campo" style="max-width:220px">Conferir a cada (dias)<input type="number" id="fxInt" min="1" max="365" value="' + (a.intervalo || "") + '" placeholder="' + (v ? v.intervalo + " (padrão)" : "não conferir") + '"></label></div>';
    } else if (abaF === "historico") {
      h += '<h3>Registrar</h3><div class="grade g3"><label class="campo" style="grid-column:1/-1">O que aconteceu<textarea id="hTexto" placeholder="Reunião, estratégia definida, orientação ao cliente, contato com o MP…"></textarea></label><label class="campo">Data<input type="date" id="hData" value="' + hoje() + '"></label><label class="campo">Por<input type="text" id="hAutor" value="' + esc(S.cfg.autor || "") + '"></label><button type="button" class="btn" id="hAdd" style="align-self:end">Registrar</button></div>';
      const ev = a.historico.map((x, i) => ({ x, i })).sort((p, q) => String(q.x.data).localeCompare(String(p.x.data)));
      h += '<div style="margin-top:14px">' + (ev.map(({ x, i }) => '<div class="evento"><div class="meta">' + dBr(x.data) + (x.autor ? " · " + esc(x.autor) : "") + ' · <a href="#" data-hrm="' + i + '">apagar</a></div><p>' + esc(x.texto) + "</p></div>").join("") || '<p class="vazio-p">Nenhum registro. Use o campo acima para guardar discussões e decisões sobre o caso.</p>') + (a.conferencias.length ? '<div class="evento"><div class="meta">Conferências de andamento</div><p>' + a.conferencias.map(x => dBr(x.data) + (x.autor ? " (" + esc(x.autor) + ")" : "")).join(", ") + "</p></div>" : "") + "</div>";
    } else {
      const r = Object.assign({}, r0, ed), marca = k => MARCAS[k].test(r.tags || "");
      const sistemas = [...new Set(S.base.raw.map(x => x.sistema).filter(Boolean))].sort(), advs = [...new Set(S.base.raw.map(x => x.advResp).filter(Boolean))].sort();
      const campo = (k, rot, extra) => '<label class="campo"' + (extra || "") + ">" + rot + '<input type="text" data-ed="' + k + '" value="' + esc(r[k] || "") + '"' + (k === "sistema" ? ' list="lsSist"' : "") + "></label>";
      h += '<p class="motivos" style="margin-top:14px">Corrija o que estiver errado. A correção vale aqui na hora e entra na lista a enviar ao setor que atualiza o ADVWin.</p><div class="grade g2" style="margin-top:10px">' + campo("numero", "Número do processo", ' style="grid-column:1/-1"') + '<div id="avisoNum" class="aviso-num" style="grid-column:1/-1;margin-top:-4px"></div><label class="pequeno" style="grid-column:1/-1;display:inline-flex;gap:6px;align-items:center;margin-top:-2px"><input type="checkbox" id="edCnj"' + (/^sim$/i.test(r.cnj || "") ? " checked" : "") + '> O processo tem numeração CNJ, ainda que o número acima esteja incompleto</label>' + campo("cliente", "Cliente") + campo("grupo", "Grupo econômico") + campo("contraria", "Parte contrária", ' style="grid-column:1/-1"') + campo("tipo", "Tipo de ação") + campo("comarca", "Comarca") + campo("tribunal", "Tribunal") + campo("vara", "Vara ou juízo") + campo("sistema", "Sistema (físico ou eletrônico)") + '<label class="campo">Advogado responsável<select data-ed="advResp">' + (r.advResp ? "" : '<option value="">(sem responsável)</option>') + advs.map(x => '<option value="' + esc(x) + '"' + (x === r.advResp ? " selected" : "") + ">" + esc(titulo(x)) + "</option>").join("") + "</select></label>" + campo("assunto", "Assunto", ' style="grid-column:1/-1"') + '</div><datalist id="lsSist">' + sistemas.map(x => '<option value="' + esc(x) + '">').join("") + "</datalist>";
      h += '<h3>Marcadores (tags do ADVWin)</h3><div class="linha-btns" style="margin:0">' + [["importante", "Importante", "Processo_Importante"], ["estrategico", "Estratégico", "Estrategico"], ["reuPreso", "Réu preso", "Criminal_Reu_Preso"], ["segredo", "Segredo de justiça", "Segredo_de_Justica"]].map(([k, rt, tag]) => '<label class="pequeno" style="display:inline-flex;gap:6px;align-items:center;margin-right:12px"><input type="checkbox" data-marca="' + tag + '" data-chave="' + k + '"' + (marca(k) ? " checked" : "") + "> " + rt + "</label>").join("") + "</div>";
      h += '<div class="linha-btns" style="margin-top:16px"><button type="button" class="btn" id="salvarCorr">Salvar correções</button><span class="sec2" id="estadoCorr"></span></div>';
      h += '<h3>Outra solicitação ao ADVWin</h3><p class="motivos">Para pedir a inclusão de um dado ou deixar um comentário ao setor, sem alterar o painel.</p><div class="grade g2" style="margin-top:8px"><label class="campo">Assunto da solicitação<select id="fsCampo">' + CAMPOS_SOLIC.map(x => "<option>" + esc(x) + "</option>").join("") + '</select></label><span></span><label class="campo" style="grid-column:1/-1">O que deve ser feito<textarea id="fsTexto" placeholder="Ex.: incluir a vara (2ª Vara Criminal de Contagem); corrigir o tipo de ação para queixa-crime"></textarea></label><button type="button" class="btn sec" id="fsIncluir" style="justify-self:start">Incluir na lista</button></div>';
      const pendPasta = S.alt.filter(x => x.cod === cod && x.status !== "aplicada");
      if (pendPasta.length) h += '<h3>Já na lista desta pasta</h3>' + pendPasta.map(x => { const tx = textoAlt(x); return '<div class="evento"><div class="meta">' + esc(tx.campo) + " · " + (x.status === "enviada" ? "enviada em " + dBr(x.enviadaEm) : "a enviar") + '</div><p>' + esc(tx.para) + "</p></div>"; }).join("");
    }
    $("#gaveta").innerHTML = h; $("#gaveta").hidden = false; $("#veu").hidden = false;
    $("#fechar").onclick = fecharFicha;
    $$("#gaveta [data-af]").forEach(b => b.onclick = () => ficha(cod, b.dataset.af));
    if (abaF === "resumo") {
      $("#fxCx").value = a.complexidade || ""; $("#fxCx").onchange = e => { a.complexidade = e.target.value; salvar(); montar(); render(); ficha(cod, "resumo"); };
      const cp = $("#copiar"); if (cp) cp.onclick = () => navigator.clipboard.writeText(c.numero).then(() => window.HUB.toast("Número copiado."));
      $$("#gaveta [data-cnj]").forEach(x => x.onclick = () => marcarCnj(cod, x.dataset.cnj === "sim"));
    } else if (abaF === "afazer") {
      $("#fxInt").onchange = e => { a.intervalo = +e.target.value || null; salvar(); render(); ficha(cod, "afazer"); };
      $$("#gaveta [data-pfeita]").forEach(x => x.onchange = () => { const p = a.providencias.find(y => y.id === x.dataset.pfeita); p.feita = x.checked; p.feitaEm = x.checked ? hoje() : ""; salvar(); render(); ficha(cod, "afazer"); });
      $$("#gaveta [data-pmail]").forEach(x => x.onclick = () => compor(cod, x.dataset.pmail));
      $("#npAvisar").onchange = e => { S.cfg.avisar = e.target.checked; salvar(); };
      $("#npAdd").onclick = () => {
        const t = $("#npTexto").value.trim(); if (!t) { $("#npTexto").focus(); return; }
        const p = { id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6), texto: t, responsavel: $("#npResp").value, prazo: $("#npPrazo").value, feita: false, criada: hoje(), avisos: [] };
        a.providencias.push(p); salvar(); render();
        if ($("#npAvisar").checked) compor(cod, p.id); else ficha(cod, "afazer");
      };
    } else if (abaF === "historico") {
      $("#hAdd").onclick = () => { const t = $("#hTexto").value.trim(); if (!t) { $("#hTexto").focus(); return; } const autor = $("#hAutor").value.trim(); a.historico.push({ data: $("#hData").value || hoje(), autor, texto: t }); if (autor && !S.cfg.autor) S.cfg.autor = autor; salvar(); ficha(cod, "historico"); };
      $$("#gaveta [data-hrm]").forEach(x => x.onclick = ev => { ev.preventDefault(); if (!confirm("Apagar este registro?")) return; a.historico.splice(+x.dataset.hrm, 1); salvar(); ficha(cod, "historico"); });
    } else {
      $("#fsIncluir").onclick = () => { const t = $("#fsTexto").value.trim(); if (!t) { $("#fsTexto").focus(); return; } registrarSolicitacao(cod, $("#fsCampo").value, t); render(); ficha(cod, "corrigir"); window.HUB.toast("Solicitação incluída na lista a enviar ao ADVWin."); };
      const aviso = () => { const n = dig($('[data-ed="numero"]').value), el = $("#avisoNum"); if ($("#edCnj").checked && n.length !== 20) { el.className = "aviso-num ok"; el.textContent = "Marcado como numeração CNJ: o caso sai do acompanhamento manual. Informe o número completo quando possível."; return; } if (!n) { el.className = "aviso-num nao"; el.textContent = "Sem número: o caso fica em acompanhamento manual."; } else if (n.length === 20) { const ok = cnjValido(n); el.className = "aviso-num " + (ok ? "ok" : "nao"); el.textContent = ok ? "Número CNJ válido (" + fmtCnj(n) + "): o caso passa a ser tratado como eletrônico, com consulta automática." : "Tem 20 dígitos, mas o dígito verificador não confere: confira a digitação."; } else { el.className = "aviso-num nao"; el.textContent = "Não segue o padrão CNJ (20 dígitos): o caso fica em acompanhamento manual."; } };
      $('[data-ed="numero"]').addEventListener("input", aviso); $("#edCnj").addEventListener("change", aviso); aviso();
      $("#salvarCorr").onclick = () => {
        const novos = {}; $$("#gaveta [data-ed]").forEach(x => { novos[x.dataset.ed] = x.value; });
        const n = dig(novos.numero); if (n.length === 20 && cnjValido(n) && !/[-.]/.test(novos.numero)) novos.numero = fmtCnj(n);
        novos.cnj = $("#edCnj").checked && n.length !== 20 ? "sim" : "";
        let tags = String(Object.assign({}, r0, S.edit[cod] || {}).tags || "").split(/[,;]+/).map(s => s.trim()).filter(Boolean);
        $$("#gaveta [data-marca]").forEach(x => { const re = MARCAS[x.dataset.chave], tem = tags.some(y => re.test(y)); if (x.checked && !tem) tags.push(x.dataset.marca); if (!x.checked && tem) tags = tags.filter(y => !re.test(y)); });
        novos.tags = tags.join(",");
        const q = registrarCorrecao(cod, novos); render();
        if (q) { window.HUB.toast(q === 1 ? "Correção registrada para envio ao ADVWin." : q + " correções registradas para envio ao ADVWin."); ficha(cod, "resumo"); } else $("#estadoCorr").textContent = "Nada mudou.";
      };
    }
  }
  /* "É numeração CNJ": com o número completo, corrige o número; sem ele, registra que o processo tem numeração CNJ */
  function marcarCnj(cod, sim) {
    if (!sim) { registrarCorrecao(cod, { cnj: "" }); render(); ficha(cod, "resumo"); window.HUB.toast("Marcação de numeração CNJ desfeita."); return; }
    const t = prompt("Se tiver o número completo no padrão CNJ (20 dígitos), informe-o. Deixe em branco para só registrar que o processo tem numeração CNJ:", ""); if (t === null) return;
    const n = dig(t), novos = { cnj: "sim" };
    if (n) {
      if (n.length !== 20) { window.HUB.toast("O número CNJ tem 20 dígitos; confira e tente de novo.", 5000); return; }
      if (!cnjValido(n) && !confirm("O dígito verificador deste número não confere. Registrar assim mesmo?")) return;
      novos.numero = fmtCnj(n); novos.cnj = "";
    }
    const q = registrarCorrecao(cod, novos); render(); ficha(cod, "resumo");
    window.HUB.toast(q ? "Numeração CNJ registrada: o caso saiu do acompanhamento manual e a informação entrou na lista do ADVWin." : "Nada mudou.");
  }
  function fecharFicha() { $("#gaveta").hidden = true; $("#veu").hidden = true; FICHA = null; }
  $("#veu").onclick = fecharFicha;
  document.addEventListener("keydown", e => { if (e.key === "Escape") { if (!$("#gaveta").hidden) fecharFicha(); $("#menuExportar").hidden = true; } });

  /* ------------------------------------------------------------------ cliques gerais */
  document.addEventListener("click", e => {
    const lb = e.target.closest(".lente [data-adv]"); if (lb) { FIL.adv = lb.dataset.adv; render(); return; }
    const t = e.target.closest("[data-tira]"); if (t) { const k = t.dataset.tira; if (k === "*") Object.keys(FIL).forEach(x => { if (x !== "adv") FIL[x] = ""; }); else FIL[k] = ""; sincronizarSelects(); render(); return; }
    if (e.target.closest("[data-ver-proc]")) { abrirAba("processos"); return; }
    const f = e.target.closest("[data-feita]"); if (f) { const [cod, id] = f.dataset.feita.split("|"); const p = A(cod).providencias.find(x => x.id === id); if (p) { p.feita = true; p.feitaEm = hoje(); salvar(); render(); window.HUB.toast("Tarefa concluída."); } return; }
    const cf = e.target.closest("[data-conferir]"); if (cf) { const nota = prompt("Andamento conferido hoje. Se houver novidade, descreva (opcional):", ""); if (nota === null) return; conferir(cf.dataset.conferir, nota.trim()); render(); if (!$("#gaveta").hidden && FICHA === cf.dataset.conferir) ficha(FICHA, "afazer"); window.HUB.toast("Conferência registrada."); return; }
    const va = e.target.closest("[data-ver-alta]"); if (va) { e.preventDefault(); FIL.adv = ADV; FIL.cx = "alta"; sincronizarSelects(); abrirAba("processos"); return; }
    const d = e.target.closest("[data-desfaz]"); if (d) { desfazerCorrecao(d.dataset.desfaz); render(); return; }
    const rp = e.target.closest("[data-repend]"); if (rp) { const a = S.alt.find(x => x.id === rp.dataset.repend); if (a) { a.status = "pendente"; a.enviadaEm = ""; salvar(); render(); } return; }
    const cc = e.target.closest("[data-concluir]"); if (cc) { const a = S.alt.find(x => x.id === cc.dataset.concluir); if (a) { a.status = "aplicada"; a.aplicadaEm = hoje(); salvar(); render(); window.HUB.toast("Solicitação marcada como concluída."); } return; }
    const ns = e.target.closest("#nsIncluir"); if (ns) { const cod = (($("#nsPasta").value.match(/^\s*([^\s·]+)/) || [])[1] || "").trim(), c = PORCOD.get(cod), rot = $("#nsCampo").value, t = $("#nsTexto").value.trim(); if (!c) { window.HUB.toast("Escolha uma pasta da lista."); $("#nsPasta").focus(); return; } if (!t) { $("#nsTexto").focus(); return; } registrarSolicitacao(cod, rot, t); render(); window.HUB.toast("Solicitação incluída na lista a enviar."); return; }
    const sg = e.target.closest("[data-sug-todas]"); if (sg) { const g = inconsistencias().find(x => x.id === sg.dataset.sugTodas); if (!g) return; if (!confirm("Registrar " + g.casos.length + " correções (" + g.tit.toLowerCase() + ")? Elas entram na lista a enviar ao ADVWin.")) return; let n = 0; for (const c of g.casos) n += registrarCorrecao(c.cod, g.sugestao(c)) ? 1 : 0; render(); window.HUB.toast(n + " correções registradas."); return; }
    const lk = e.target.closest("a[data-cod], tr[data-cod]"); if (lk && !e.target.closest("button, input, select") && !e.target.closest("#gaveta .abas-f")) { e.preventDefault(); ficha(lk.dataset.cod, lk.dataset.abaFicha); }
  });
  document.addEventListener("change", e => { if (e.target.id === "selTodas") $$(".selAlt").forEach(x => x.checked = e.target.checked); });

  /* ------------------------------------------------------------------ configurações e cópia de segurança */
  $("#btConfig").onclick = () => {
    FICHA = null;
    const advs = [...new Set(CASOS.map(c => c.advResp))].filter(a => a !== "Sem responsável").sort();
    const h = '<div class="cab"><div><div class="sobretitulo">Gestão da carteira</div><h2>Configurações</h2></div><button type="button" class="btn-icone" id="fechar" aria-label="Fechar">×</button></div>' +
      '<h3>Atualizar a base</h3><p class="motivos">Solte a nova planilha do ADVWin. Os casos são reconhecidos pelo código da pasta: as anotações e as correções são mantidas, e as correções que o ADVWin já incorporou são concluídas.</p><div class="zona" id="zona2" style="margin-top:8px;padding:18px"><b>Arraste a nova planilha</b><span class="pequeno mudo">ou clique para escolher</span></div><p class="pequeno" id="estadoImport"></p>' +
      (S.historico.length ? '<table class="t" style="margin-top:6px"><thead><tr><th>Importação</th><th class="n">Pastas</th><th class="n">Novas</th><th class="n">Saíram</th></tr></thead><tbody>' + S.historico.slice(0, 8).map(x => "<tr><td>" + new Date(x.data).toLocaleString("pt-BR") + '<br><span class="sec2">' + esc(x.arquivo) + '</span></td><td class="n">' + x.n + '</td><td class="n">' + x.novos + '</td><td class="n">' + x.saidas + "</td></tr>").join("") + "</tbody></table>" : "") +
      (S.base && S.base.faltam && S.base.faltam.length ? '<p class="motivos">Colunas que a última planilha não trouxe: ' + esc(S.base.faltam.map(k => ROTULO[k]).join(", ")) + ".</p>" : "") +
      '<h3>E-mails da equipe</h3><p class="motivos">Usados para avisar o advogado responsável quando uma tarefa é incluída numa pasta.</p><div class="grade g2" style="margin-top:8px">' + advs.map(a => '<label class="campo">' + esc(titulo(a)) + '<input type="email" data-email="' + esc(sem(a)) + '" value="' + esc(emailDe(a)) + '" placeholder="e-mail"></label>').join("") + "</div>" +
      '<h3>Conferência de andamento</h3><p class="motivos">Intervalo, em dias, para conferir o andamento dos casos prioritários. Quando o intervalo passa sem conferência, o caso aparece como "andamento a conferir" na agenda do advogado.</p><div class="grade g2"><label class="campo">Réu preso<input type="number" min="1" data-int="reuPreso" value="' + S.cfg.intervalos.reuPreso + '"></label><label class="campo">Estratégicos<input type="number" min="1" data-int="estrategico" value="' + S.cfg.intervalos.estrategico + '"></label><label class="campo">Importantes<input type="number" min="1" data-int="importante" value="' + S.cfg.intervalos.importante + '"></label><label class="campo">Acompanhamento manual (sem CNJ)<input type="number" min="1" data-int="manual" value="' + S.cfg.intervalos.manual + '"></label></div>' +
      '<h3>Preferências</h3><div class="grade g2"><label class="campo">Seu nome (registros, correções e e-mails)<input type="text" id="cfgAutor" value="' + esc(S.cfg.autor || "") + '"></label><label class="campo">Grupo econômico das contravenções<input type="text" id="cfgGrupo" value="' + esc(S.cfg.grupoContravencao || "") + '" placeholder="' + esc(GRUPO_CONTRAV ? "identificado na base: " + titulo(GRUPO_CONTRAV) : "nenhum identificado") + '"></label></div>' +
      '<h3>Cópia de segurança</h3><p class="motivos">Os dados ficam só neste navegador. Para levá-los a outro computador, exporte a cópia (protegida por uma senha que você escolhe) e restaure-a lá. A cópia contém dados de clientes: guarde-a em local seguro.</p><div class="linha-btns" style="margin-top:8px"><button type="button" class="btn sec" id="btBackup">Exportar cópia</button><button type="button" class="btn sec" id="btRestaurar">Restaurar cópia</button><input type="file" id="arqBackup" accept=".hubcarteira,.json" hidden></div><p class="pequeno" id="estadoBackup"></p>' +
      '<h3>Apagar</h3><p class="motivos">Remove a base, as correções e as anotações deste navegador.</p><button type="button" class="btn sec" id="btApagar">Apagar os dados deste navegador</button>';
    $("#gaveta").innerHTML = h; $("#gaveta").hidden = false; $("#veu").hidden = false; $("#fechar").onclick = fecharFicha;
    zona($("#zona2"));
    $$("#gaveta [data-email]").forEach(x => x.onchange = () => { S.cfg.emails[x.dataset.email] = x.value.trim(); salvar(); });
    $$("#gaveta [data-int]").forEach(x => x.onchange = () => { S.cfg.intervalos[x.dataset.int] = Math.max(1, +x.value || S.cfg.intervalos[x.dataset.int]); salvar(); render(); });
    $("#cfgAutor").onchange = e => { S.cfg.autor = e.target.value.trim(); salvar(); };
    $("#cfgGrupo").onchange = e => { S.cfg.grupoContravencao = e.target.value.trim().toUpperCase(); salvar(); montar(); preencherFiltros(); render(); };
    $("#btBackup").onclick = exportarCopia; $("#btRestaurar").onclick = () => $("#arqBackup").click(); $("#arqBackup").onchange = restaurarCopia;
    $("#btApagar").onclick = async () => { if (!confirm("Apagar a base, as correções e as anotações deste navegador? Exporte antes uma cópia se quiser guardá-las.")) return; await DB.apagar("estado"); location.reload(); };
  };
  async function chaveSenha(senha, sal) { const b = await crypto.subtle.importKey("raw", new TextEncoder().encode(senha), "PBKDF2", false, ["deriveKey"]); return crypto.subtle.deriveKey({ name: "PBKDF2", salt: sal, iterations: 250000, hash: "SHA-256" }, b, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]); }
  const b64 = u => { let s = ""; for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode.apply(null, u.subarray(i, i + 0x8000)); return btoa(s); };
  const deb64 = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));
  async function exportarCopia() {
    const senha = prompt("Escolha uma senha para a cópia (mínimo de 8 caracteres). Ela será pedida para restaurar:"); if (senha == null) return;
    if (senha.length < 8) { $("#estadoBackup").textContent = "A senha precisa ter ao menos 8 caracteres."; return; }
    const sal = crypto.getRandomValues(new Uint8Array(16)), { iv, ct } = await cifrar(S, await chaveSenha(senha, sal));
    const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([JSON.stringify({ tipo: "hub-carteira", versao: 2, criado: new Date().toISOString(), sal: b64(sal), iv: b64(iv), dados: b64(ct) })], { type: "application/json" })); a.download = "Carteira HUB " + hoje() + ".hubcarteira"; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1500);
    $("#estadoBackup").textContent = "Cópia exportada.";
  }
  async function restaurarCopia(e) {
    const f = e.target.files[0]; e.target.value = ""; if (!f) return;
    const est = t => { const el = $("#estadoBackup"); if (el) el.textContent = t; };
    try {
      const o = JSON.parse(await f.text()); if (o.tipo !== "hub-carteira") throw new Error("Este arquivo não é uma cópia da gestão da carteira.");
      const senha = prompt("Senha da cópia:"); if (senha == null) return;
      let d; try { d = await decifrar({ iv: deb64(o.iv), ct: deb64(o.dados) }, await chaveSenha(senha, deb64(o.sal))); } catch (x) { throw new Error("Senha incorreta ou arquivo danificado."); }
      if (S.base && !confirm("Substituir os dados deste navegador pelos da cópia?")) return;
      S = migrar(d); salvar(); iniciar(); window.HUB.toast("Cópia restaurada: " + ((S.base && S.base.raw.length) || 0) + " pastas."); est("Cópia restaurada.");
    } catch (x) { est(x.message || String(x)); window.HUB.toast(x.message || String(x), 5000); }
  }

  /* ------------------------------------------------------------------ exportação */
  $("#btExportar").onclick = e => { e.stopPropagation(); const m = $("#menuExportar"); m.hidden = !m.hidden; $("#btExportar").setAttribute("aria-expanded", String(!m.hidden)); };
  document.addEventListener("click", e => { if (!e.target.closest("#menuExportar") && !e.target.closest("#btExportar")) $("#menuExportar").hidden = true; });
  $("#menuExportar").addEventListener("click", e => { const b = e.target.closest("[data-exp]"); if (!b) return; $("#menuExportar").hidden = true; ({ word: relatorio, xlsx: planilha, alteracoes: () => abrirAba("alteracoes") })[b.dataset.exp](); });
  async function planilha() {
    await xlsx(); const L = filtrados();
    const l = [["Pasta", "Subpasta", "Cliente", "Grupo econômico", "Parte contrária", "Tipo de ação", "Fase", "Número", "CNJ", "Comarca", "Tribunal", "Sistema", "Assunto", "Temas", "Responsável", "Complexidade", "Fatores de complexidade", "Réu preso", "Estratégico", "Importante", "Entrada", "Próxima conferência", "Tarefas pendentes", "Último registro", "Corrigido para o ADVWin"]];
    for (const c of L) { const a = anot(c.cod), v = conferencia(c), u = a && a.historico.length ? a.historico.slice().sort((x, y) => String(y.data).localeCompare(String(x.data)))[0] : null; l.push([c.cod, c.subpasta ? "sim" : "", c.cliente, c.grupo || c.grupoInferido || "", c.contraria, c.tipo, c.fase, c.numero, c.cnj ? (c.cnjOk ? "sim" : "dígito inválido") : "não", c.comarca, c.tribunal, c.sistema, c.assunto, c.temas.join("; "), c.advResp, NIVEL_ROT[c.cx.nivel], c.cx.motivos.join("; "), c.reuPreso ? "sim" : "", c.estrategico ? "sim" : "", c.importante ? "sim" : "", dBr(c.entrada), v ? (v.aConferir ? "a conferir" : dBr(v.proxima)) : "", provPend(c).map(p => p.texto + (p.prazo ? " (" + dBr(p.prazo) + ")" : "")).join("; "), u ? dBr(u.data) + ": " + u.texto : "", c.editado ? "sim" : ""]); }
    const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(l), "Processos"); XLSX.writeFile(wb, "Carteira da area - " + hoje() + ".xlsx");
  }
  const semHtml = s => String(s).replace(/<[^>]+>/g, "").replace(/&amp;/g, "&").replace(/&quot;/g, "\"").replace(/&#39;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">");
  async function relatorio() {
    const L = filtrados(), t = L.length, b = [{ t: "tit", texto: "RELATÓRIO DA CARTEIRA DA ÁREA" }];
    const filtro = [FIL.adv && "advogado " + titulo(FIL.adv), ...Object.keys(ROT_FIL).filter(k => FIL[k]).map(k => ROT_FIL[k].toLowerCase() + " " + (k === "cx" ? NIVEL_ROT[FIL[k]] : k === "sit" ? ROT_SIT[FIL[k]] : FIL[k])), FIL.busca && "busca \"" + FIL.busca + "\""].filter(Boolean).join("; ");
    b.push({ t: "tab", larg: [1.4, 3], linhas: [["Data", new Date().toLocaleDateString("pt-BR")], ["Base", S.base.arquivo + ", importada em " + new Date(S.base.importado).toLocaleDateString("pt-BR")], ["Recorte", filtro || "carteira completa"], ["Processos", nf(t)]] });
    b.push({ t: "h", texto: "1. Panorama" }); leitura(L).forEach(p => b.push({ t: "p", r: semHtml(p) }));
    b.push({ t: "h", texto: "2. Carga por advogado" });
    b.push({ t: "tab", cab: ["Advogado", "Processos", "Alta", "Média", "Baixa", "Carga ponderada", "Para hoje"], larg: [2, 0.9, 0.7, 0.7, 0.7, 1, 0.8], linhas: conta(L, c => c.advResp).map(([a, n]) => { const l = L.filter(c => c.advResp === a); return [titulo(a), String(n), String(l.filter(c => c.cx.nivel === "alta").length), String(l.filter(c => c.cx.nivel === "media").length), String(l.filter(c => c.cx.nivel === "baixa").length), String(l.reduce((s, c) => s + PESO[c.cx.nivel], 0)), String(l.filter(c => { const v = conferencia(c); return v && v.aConferir; }).length + l.reduce((s, c) => s + provPend(c).filter(provVencida).length, 0))]; }) });
    b.push({ t: "p", r: [["Complexidade: ", "bo"], ["calculada a partir dos marcadores do ADVWin e dos dados do processo (réu preso e caso estratégico, 3 pontos; importante, fase recursal e matéria complexa, 2; tribunal superior, ação penal, execução e segredo de justiça, 1; contravenção e termo circunstanciado, menos 1). Alta a partir de 5 pontos; média de 2 a 4. Carga ponderada: baixa vale 1, média 2 e alta 3.", "n"]] });
    const crit = L.filter(c => c.cx.nivel === "alta").sort((x, y) => y.cx.pontos - x.cx.pontos);
    if (crit.length) { b.push({ t: "h", texto: "3. Processos de complexidade alta" }); b.push({ t: "tab", cab: ["Cliente e pasta", "Processo", "Responsável", "Fatores e tarefas"], larg: [1.8, 1.8, 1.1, 2.6], linhas: crit.slice(0, 80).map(c => [c.cliente + " · " + c.cod, titulo(c.tipo) + " · " + (c.numero || "sem número"), curto(c.advResp), [c.cx.motivos.join(", "), provPend(c).map(p => "tarefa: " + p.texto + (p.prazo ? " (" + dBr(p.prazo) + ")" : "")).join("; ")].filter(Boolean).join("; ")]) }); }
    const provs = []; L.forEach(c => provPend(c).forEach(p => provs.push([c.cliente + " · " + c.cod, p.texto, curto(p.responsavel || c.advResp), p.prazo ? dBr(p.prazo) + (provVencida(p) ? " (vencida)" : "") : "-"])));
    if (provs.length) { b.push({ t: "h", texto: (crit.length ? "4" : "3") + ". Tarefas pendentes" }); b.push({ t: "tab", cab: ["Caso", "Tarefa", "Responsável", "Prazo"], larg: [1.8, 3, 1.1, 1], linhas: provs.sort((x, y) => x[3].localeCompare(y[3])) }); }
    const altAbertas = S.alt.filter(x => x.status !== "aplicada" && (!FIL.adv || (PORCOD.get(x.cod) || {}).advResp === FIL.adv));
    if (altAbertas.length) { b.push({ t: "h", texto: "Correções e solicitações ao ADVWin" }); b.push({ t: "tab", cab: ["Pasta", "Campo", "Como está", "Como deve ficar", "Situação"], larg: [1.6, 1.1, 1.5, 1.8, 0.9], linhas: linhasExport(altAbertas).map((x, i) => [x.pasta + " · " + x.cliente, x.campo, x.de || "-", x.para || "-", altAbertas[i].status === "enviada" ? "enviada" : "a enviar"]) }); }
    b.push({ t: "data", texto: "Belo Horizonte, " + P.dataExtenso(new Date()) + "." });
    try { P.baixar(await P.docx(b), "Relatorio da carteira - " + hoje()); } catch (e) { window.HUB.toast(e.message || "Não foi possível gerar o Word.", 5000); }
  }

  /* ------------------------------------------------------------------ ciclo */
  let ABA = "geral";
  function abrirAba(a) { ABA = a; $$("#abas .aba").forEach(x => x.setAttribute("aria-selected", x.dataset.aba === a ? "true" : "false")); $$(".painel").forEach(p => p.hidden = p.id !== "p-" + a); try { localStorage.setItem("carteira_aba2", a); } catch (e) { /* ignora */ } render(); window.scrollTo({ top: Math.max(0, $("#abas").offsetTop - 70), behavior: "smooth" }); }
  $$("#abas .aba").forEach(b => b.addEventListener("click", () => abrirAba(b.dataset.aba)));
  function render() { if (!S.base) return; ({ geral, advogados, processos, alteracoes })[ABA](); $("#contAlt").textContent = S.alt.filter(a => a.status === "pendente").length || ""; }
  function iniciar() {
    montar();
    const tem = CASOS.length > 0;
    $("#vazio").hidden = tem; $("#abas").hidden = !tem; $("#acoesTopo").hidden = !tem;
    if (!tem) { $$(".painel").forEach(p => p.hidden = true); $("#baseInfo").textContent = ""; return; }
    $("#baseInfo").textContent = nf(CASOS.length) + " pastas · base do ADVWin de " + new Date(S.base.importado).toLocaleDateString("pt-BR") + " · guardada só neste computador";
    preencherFiltros();
    let a = "geral"; try { a = localStorage.getItem("carteira_aba2") || "geral"; } catch (e) { /* ignora */ }
    ABA = ["geral", "advogados", "processos", "alteracoes"].includes(a) ? a : "geral";
    $$("#abas .aba").forEach(x => x.setAttribute("aria-selected", x.dataset.aba === ABA ? "true" : "false")); $$(".painel").forEach(p => p.hidden = p.id !== "p-" + ABA);
    render();
  }
  carregar().then(iniciar).catch(e => { $("#estadoVazio").textContent = e.message || String(e); });
})();
