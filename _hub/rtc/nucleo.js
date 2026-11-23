/* Reforma tributária: núcleo comum às quatro abas. Carrega as tabelas oficiais (ramo bases-publicas, gerado do
   repositório da Receita), consulta classificações por NCM/NBS, monta as alíquotas de cada ano da transição, chama a
   calculadora oficial pelo serviço sherlock-tpc (/rtc/...) e oferece utilidades de número, arquivo e relatório. */
(function () {
  "use strict";
  const $ = s => document.querySelector(s), esc = s => window.HUB.esc(s);
  const CFG = (window.HUB_CONFIG && window.HUB_CONFIG.sherlock) || {}, SERV = (CFG.url || "https://sherlock-tpc.viniciuspapapapa.workers.dev").replace(/\/+$/, "");
  const H = CFG.token ? { "X-App-Token": CFG.token } : {};
  const URL_BASE = "https://raw.githubusercontent.com/viniciuspapapapa/viniciuspapapapa.github.io/bases-publicas/rtc.json.gz";
  const ANOS = [2026, 2027, 2028, 2029, 2030, 2031, 2032, 2033];

  /* ------------------------------------------------------------------ números (pt-BR) e arredondamento bancário */
  const num = v => { if (typeof v === "number") return v; let s = String(v == null ? "" : v).trim().replace(/[R$\s%]/g, ""); if (!s) return 0; if (/,\d{1,}$/.test(s) || (s.includes(",") && s.includes("."))) s = s.replace(/\./g, "").replace(",", "."); else if (/^\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, ""); const n = parseFloat(s); return isFinite(n) ? n : 0; };
  /* HALF_EVEN no centavo, como ArredondamentoUtils da calculadora oficial */
  const r2 = v => { const x = v * 100, f = Math.floor(x), d = x - f; const e = 1e-9; let r = d > 0.5 + e ? f + 1 : d < 0.5 - e ? f : (f % 2 === 0 ? f : f + 1); return r / 100; };
  const moeda = v => (+v || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  const pct = (v, c) => (+v || 0).toLocaleString("pt-BR", { minimumFractionDigits: c == null ? 2 : c, maximumFractionDigits: c == null ? 2 : c }) + "%";
  const fmt = (v, c) => (+v || 0).toLocaleString("pt-BR", { minimumFractionDigits: c == null ? 2 : c, maximumFractionDigits: c == null ? 2 : c });
  const dig = s => String(s || "").replace(/\D/g, "");
  const sem = s => String(s == null ? "" : s).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
  const hoje = () => new Date().toISOString().slice(0, 10);

  function lib(nome, url, cdn, ok) {
    if (ok()) return Promise.resolve();
    return new Promise((res, rej) => { const t = i => { const u = [new URL(url, location.href).href, cdn][i]; if (!u) return rej(new Error("Não foi possível carregar " + nome + ".")); const s = document.createElement("script"); s.src = u; s.onload = () => ok() ? res() : t(i + 1); s.onerror = () => { s.remove(); t(i + 1); }; document.head.appendChild(s); }; t(0); });
  }
  const xlsx = () => lib("SheetJS", "../vendor/xlsx/xlsx.full.min.js", "https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js", () => typeof XLSX !== "undefined");
  const chart = () => lib("Chart.js", "../vendor/chartjs/chart.umd.min.js", "https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.0/chart.umd.min.js", () => typeof Chart !== "undefined");

  /* ------------------------------------------------------------------ tabelas oficiais (cache diário no IndexedDB) */
  const DB = {
    abrir() { return this.p || (this.p = new Promise((ok, falha) => { try { const r = indexedDB.open("hub_rtc", 1); r.onupgradeneeded = () => r.result.createObjectStore("base"); r.onsuccess = () => ok(r.result); r.onerror = () => falha(r.error); } catch (e) { falha(e); } })); },
    async ler() { try { const db = await this.abrir(); return await new Promise(ok => { const r = db.transaction("base").objectStore("base").get("rtc"); r.onsuccess = () => ok(r.result || null); r.onerror = () => ok(null); }); } catch (e) { return null; } },
    async gravar(v) { try { const db = await this.abrir(); await new Promise(ok => { const t = db.transaction("base", "readwrite"); t.objectStore("base").put(v, "rtc"); t.oncomplete = ok; t.onerror = ok; }); } catch (e) { /* sem cache */ } }
  };
  let D = null, carregando = null;
  async function dados() {
    if (D) return D;
    if (carregando) return carregando;
    carregando = (async () => {
      let c = await DB.ler();
      if (!c || Date.now() - c.quando > 24 * 3600000) {
        const r = await fetch(URL_BASE + "?t=" + Math.floor(Date.now() / 3600000));
        if (!r.ok) { if (c) return preparar(c.dados); throw new Error(r.status === 404 ? "As tabelas oficiais ainda não foram geradas (fluxo Bases públicas do HUB)." : "Tabelas indisponíveis (HTTP " + r.status + ")."); }
        const txt = await new Response(r.body.pipeThrough(new DecompressionStream("gzip"))).text();
        c = { quando: Date.now(), dados: JSON.parse(txt) }; await DB.gravar(c);
      }
      return preparar(c.dados);
    })();
    try { return await carregando; } finally { carregando = null; }
  }
  function preparar(d) {
    const porCod = new Map(); for (const c of d.cc) { if (!porCod.has(c.c)) porCod.set(c.c, []); porCod.get(c.c).push(c); }
    d.porCod = porCod;
    d.ncmMap = new Map(d.ncm.map(x => [x[0], x[1]]));
    d.nbsMap = new Map(d.nbs.map(x => [x[0], x[1]]));
    d.listadas = new Set(d.ncmA.map(x => x[1]).concat(d.nbsA.map(x => x[1])));
    d.munPorCod = new Map(d.mun.map(m => [m[0], m]));
    d.ufs = [...new Set(d.mun.map(m => m[2]))].sort();
    D = d; return d;
  }
  const vige = (ini, fim, data) => (!ini || ini <= data) && (!fim || fim >= data);
  function cc(cod, data) { const l = (D && D.porCod.get(cod)) || []; data = data || hoje(); return l.find(x => vige(x.i, x.e, data)) || l[l.length - 1] || null; }
  function reducao(c, data) { const o = { CBS: 0, IBSUF: 0, IBSMun: 0 }; if (!c) return o; for (const [t, v, i, f] of c.r || []) if (vige(i, f, data || hoje()) && t in o) o[t] = +v || 0; return o; }
  function tratamento(c, data) { const t = (c && c.tr || []).find(x => vige(x[1], x[2], data || hoje())); return t ? t[0] : ""; }
  function fundamentos(c, data) { return (c && c.f || []).filter(x => vige(x[1], x[2], data || hoje())).map(x => D.fund[x[0]] || D.fund[String(x[0])]).filter(Boolean); }
  /* classificações aplicáveis a um NCM (8 dígitos) ou NBS (9 dígitos): primeiro as vinculadas por lista oficial
     (prefixo mais longo primeiro), depois a tributação integral */
  function aplicaveis(codigo, data) {
    const c = dig(codigo), ehNbs = c.length === 9 && D.nbsMap.has(c) && !D.ncmMap.has(c), lista = ehNbs ? D.nbsA : D.ncmA;
    data = data || hoje();
    const vis = new Map();
    lista.filter(x => c.startsWith(x[0]) && vige(x[3], x[4], data)).sort((a, b) => b[0].length - a[0].length).forEach(x => { if (!vis.has(x[1])) vis.set(x[1], { cod: x[1], anexo: D.anx[x[2]] || D.anx[String(x[2])] || null, prefixo: x[0] }); });
    const out = [...vis.values()].map(v => Object.assign(v, { c: cc(v.cod, data) })).filter(v => v.c);
    const geral = cc("000001", data); if (geral && !vis.has("000001")) out.push({ cod: "000001", c: geral, geral: true });
    return { tipo: ehNbs ? "nbs" : "ncm", codigo: c, itens: out };
  }
  function descricao(codigo) { const c = dig(codigo); return D ? (D.ncmMap.get(c) || D.nbsMap.get(c) || "") : ""; }
  function buscar(q, max) {
    const s = sem(q), d = dig(q), out = []; if (!s) return out;
    const tenta = (lista, tipo) => { for (const [cod, desc] of lista) { if (out.length >= (max || 60)) return; if ((d.length >= 2 && cod.startsWith(d)) || (s.length >= 3 && !/^\d+$/.test(s.replace(/[.\s-]/g, "")) && sem(desc).includes(s))) out.push({ tipo, cod, desc }); } };
    tenta(D.ncm, "NCM"); tenta(D.nbs, "NBS"); return out;
  }
  const fmtNcm = c => c.length === 8 ? c.replace(/^(\d{4})(\d{2})(\d{2})$/, "$1.$2.$3") : c;
  const fmtNbs = c => c.length === 9 ? c.replace(/^(\d)(\d{4})(\d{2})(\d{2})$/, "$1.$2.$3.$4") : c;
  const fmtCod = (c, tipo) => (tipo === "NBS" || tipo === "nbs") ? fmtNbs(c) : fmtNcm(c);

  /* ------------------------------------------------------------------ alíquotas de cada ano da transição */
  function parametros() {
    const fr = String($("#pFracoes").value || "").split(/[;\s]+/).map(num).filter(x => x >= 0);
    return { cbs: num($("#pCbs").value), ibsUf: num($("#pIbsUf").value), ibsMun: num($("#pIbsMun").value), fracoes: [fr[0] ?? 10, fr[1] ?? 20, fr[2] ?? 30, fr[3] ?? 40] };
  }
  /* alíquotas nominais informadas à calculadora (de 2027 em diante; em 2026 a calculadora usa as de teste) e os fatores
     dos tributos atuais: PIS/COFINS e IPI até 2026; ICMS e ISS reduzidos de 2029 a 2032 e extintos em 2033 */
  function ano(a, P) {
    P = P || parametros();
    const fICMS = { 2026: 1, 2027: 1, 2028: 1, 2029: 0.9, 2030: 0.8, 2031: 0.7, 2032: 0.6 }[a] ?? 0;
    let nom = null;
    if (a === 2026) nom = { cbs: 0.9, ibsEstadual: 0.1, ibsMunicipal: 0, teste: true };
    else if (a <= 2028) nom = { cbs: Math.max(0, +(P.cbs - 0.1).toFixed(4)), ibsEstadual: 0.05, ibsMunicipal: 0.05 };
    else if (a <= 2032) { const f = P.fracoes[a - 2029] / 100; nom = { cbs: P.cbs, ibsEstadual: +(P.ibsUf * f).toFixed(4), ibsMunicipal: +(P.ibsMun * f).toFixed(4) }; }
    else nom = { cbs: P.cbs, ibsEstadual: P.ibsUf, ibsMunicipal: P.ibsMun };
    return { ano: a, nom, fICMS, pisCofins: a <= 2026, ipi: a <= 2026 };
  }

  /* ------------------------------------------------------------------ calculadora oficial */
  async function servico(caminho, corpo, tipo) {
    const h = Object.assign({ "Content-Type": tipo || "application/json" }, H), body = corpo == null ? undefined : (typeof corpo === "string" ? corpo : JSON.stringify(corpo));
    /* a instância oficial é um ambiente de testes com filtro de segurança e limite de requisições: até três tentativas,
       espaçadas, quando ela recusa ou não responde */
    for (let t = 0; ; t++) {
      let r; try { r = await fetch(SERV + "/rtc/" + caminho, { method: corpo == null ? "GET" : "POST", headers: h, body }); }
      catch (e) { if (t < 2) { await new Promise(ok => setTimeout(ok, 2000 * (t + 1))); continue; } throw new Error("Não foi possível falar com o serviço do escritório (" + (e.message || e) + ")."); }
      const txt = await r.text(); let j = null; try { j = JSON.parse(txt); } catch (e) { j = null; }
      if ((r.status === 502 || r.status === 503 || r.status === 504 || r.status === 429) && t < 2) { await new Promise(ok => setTimeout(ok, 2500 * (t + 1))); continue; }
      return { ok: r.ok, status: r.status, json: j, texto: txt, simulado: r.headers.get("x-warning-dados-simulados") };
    }
  }
  /* uma operação pela calculadora oficial, em lotes de até 150 itens; devolve os objetos na ordem dos itens */
  async function calcular(op) {
    const lotes = []; for (let i = 0; i < op.itens.length; i += 150) lotes.push(op.itens.slice(i, i + 150));
    const objetos = []; let simulado = null;
    for (const l of lotes) {
      const r = await servico("calcular", Object.assign({}, op, { itens: l }));
      if (!r.ok || !r.json || !r.json.objetos) throw new Error((r.json && (r.json.erro || r.json.detail || r.json.title)) || "A calculadora oficial respondeu HTTP " + r.status + ".");
      objetos.push(...r.json.objetos); simulado = simulado || r.simulado;
    }
    return { objetos, simulado };
  }
  const valoresItem = o => {
    const g = o && o.tribCalc && o.tribCalc.IBSCBS && o.tribCalc.IBSCBS.gIBSCBS; if (!g) return null;
    const n = x => num(x);
    return { vBC: n(g.vBC), vCBS: n(g.gCBS && g.gCBS.vCBS), vIBSUF: n(g.gIBSUF && g.gIBSUF.vIBSUF), vIBSMun: n(g.gIBSMun && g.gIBSMun.vIBSMun), pCBS: n(g.gCBS && g.gCBS.pCBS), pIBSUF: n(g.gIBSUF && g.gIBSUF.pIBSUF), pIBSMun: n(g.gIBSMun && g.gIBSMun.pIBSMun),
      redCBS: n(g.gCBS && g.gCBS.gRed && g.gCBS.gRed.pRedAliq), efCBS: g.gCBS && g.gCBS.gRed ? n(g.gCBS.gRed.pAliqEfet) : null, redIBS: n(g.gIBSUF && g.gIBSUF.gRed && g.gIBSUF.gRed.pRedAliq), mem: (o.tribCalc.IBSCBS.memoriaCalculo || {}) };
  };
  let versaoOnline = null;
  async function versao() { if (versaoOnline) return versaoOnline; const r = await servico("versao"); versaoOnline = r.ok && r.json ? r.json : null; return versaoOnline; }

  /* ------------------------------------------------------------------ interface comum */
  function preencherUfs(sel, padrao) { sel.innerHTML = D.ufs.map(u => '<option' + (u === padrao ? " selected" : "") + ">" + u + "</option>").join(""); }
  function municipio(nome, uf) { const s = sem(nome); if (!s) return null; const l = D.mun.filter(m => sem(m[1]) === s && (!uf || m[2] === uf)); return l[0] || null; }
  function zona(z, inp, aoEscolher) {
    ["dragenter", "dragover"].forEach(ev => z.addEventListener(ev, e => { e.preventDefault(); z.classList.add("sobre"); }));
    ["dragleave", "drop"].forEach(ev => z.addEventListener(ev, e => { e.preventDefault(); z.classList.remove("sobre"); }));
    z.addEventListener("drop", e => aoEscolher([...e.dataTransfer.files]));
    z.addEventListener("click", () => inp.click()); inp.addEventListener("change", () => { aoEscolher([...inp.files]); inp.value = ""; });
  }
  /* abre arquivos soltos e ZIPs; devolve [{nome, buf}] */
  async function abrirArquivos(fs) {
    const out = [];
    for (const f of fs) {
      if (/\.zip$/i.test(f.name)) { const z = await JSZip.loadAsync(await f.arrayBuffer()); for (const n of Object.keys(z.files)) if (!z.files[n].dir && /\.(xml|xlsx|xls|csv)$/i.test(n)) out.push({ nome: n.split("/").pop(), buf: await z.files[n].async("arraybuffer") }); }
      else out.push({ nome: f.name, buf: await f.arrayBuffer() });
    }
    return out;
  }
  const textoXml = buf => { const u = new Uint8Array(buf); let t = new TextDecoder("utf-8").decode(u); const m = /encoding=["']([^"']+)/i.exec(t.slice(0, 200)); if (m && /1252|8859|latin/i.test(m[1])) t = new TextDecoder("windows-1252").decode(u); return t; };
  const nomeArquivo = s => String(s || "").replace(/[\\/:*?"<>|]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 90);
  function prog(barra, f) { const b = $(barra); if (!b) return; b.hidden = f == null; if (f != null) b.querySelector("i").style.width = Math.round(f * 100) + "%"; }

  /* abas */
  document.querySelectorAll(".abas .aba").forEach(b => b.addEventListener("click", () => {
    document.querySelectorAll(".abas .aba").forEach(x => x.setAttribute("aria-selected", x === b ? "true" : "false"));
    document.querySelectorAll(".painel").forEach(p => { p.hidden = p.id !== "p-" + b.dataset.aba; });
    try { localStorage.setItem("rtc_aba", b.dataset.aba); } catch (e) { /* ignora */ }
  }));
  try { const a = localStorage.getItem("rtc_aba"); const b = a && document.querySelector('.aba[data-aba="' + a + '"]'); if (b) b.click(); } catch (e) { /* ignora */ }
  /* parâmetros de alíquota lembrados no navegador */
  ["pCbs", "pIbsUf", "pIbsMun", "pFracoes"].forEach(id => { const el = $("#" + id); try { const v = localStorage.getItem("rtc_" + id); if (v) el.value = v; } catch (e) { /* ignora */ } el.addEventListener("change", () => { try { localStorage.setItem("rtc_" + id, el.value); } catch (e) { /* ignora */ } }); });

  const prontos = [];
  dados().then(async d => {
    $("#listaMun").innerHTML = d.mun.map(m => '<option value="' + esc(m[1]) + '">' + esc(m[2]) + "</option>").join("");
    $("#baseInfo").textContent = "Tabelas oficiais " + (d.versao.versao || "") + " de " + String(d.versao.data || "").split("-").reverse().join("/") + " · " + d.cc.length + " classificações · " + d.ncm.length.toLocaleString("pt-BR") + " NCM · " + d.nbs.length.toLocaleString("pt-BR") + " NBS";
    prontos.forEach(f => { try { f(d); } catch (e) { console.error(e); } });
    const v = await versao().catch(() => null);
    if (v) $("#baseInfo").textContent += " · calculadora oficial " + (v.versaoApp || "").split("-")[0] + " (base " + (v.versaoDb || "") + ")";
    else $("#baseInfo").textContent += " · calculadora oficial indisponível no momento";
  }).catch(e => { $("#baseInfo").textContent = e.message || String(e); });

  window.RTC = { $, esc, num, r2, moeda, pct, fmt, dig, sem, hoje, ANOS, xlsx, chart, dados, cc, reducao, tratamento, fundamentos, aplicaveis, descricao, buscar, fmtCod, fmtNcm, fmtNbs, parametros, ano, servico, calcular, valoresItem, versao, preencherUfs, municipio, zona, abrirArquivos, textoXml, nomeArquivo, prog, pronto: f => { if (D) f(D); else prontos.push(f); }, D: () => D };
})();
