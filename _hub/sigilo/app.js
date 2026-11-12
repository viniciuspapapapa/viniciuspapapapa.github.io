/* Análise de quebra de sigilo bancário: leitura de arquivos do SIMBA e de extratos (SheetJS), reconhecimento e
   mapeamento de colunas, junção de EXTRATO com ORIGEM_DESTINO por chave comum, e análises de fluxo, contrapartes,
   espécie, fracionamento, passagem rápida e compatibilidade com a renda declarada; Excel e Word. */
(function () {
  "use strict";
  const $ = s => document.querySelector(s), esc = s => window.HUB.esc(s), P = window.TPC_PECA;
  const E = { arqs: [], lanc: [], an: null };
  const sem = s => String(s == null ? "" : s).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
  const moeda = v => (+v || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  const dbr = d => d ? String(d.getDate()).padStart(2, "0") + "/" + String(d.getMonth() + 1).padStart(2, "0") + "/" + d.getFullYear() : "";
  const mesDe = d => d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0");

  function lib(nome, url, cdn, ok) {
    if (ok()) return Promise.resolve();
    return new Promise((res, rej) => { const t = i => { const u = [new URL(url, location.href).href, cdn][i]; if (!u) return rej(new Error("Não foi possível carregar " + nome + ".")); const s = document.createElement("script"); s.src = u; s.onload = () => ok() ? res() : t(i + 1); s.onerror = () => { s.remove(); t(i + 1); }; document.head.appendChild(s); }; t(0); });
  }
  const xlsx = () => lib("SheetJS", "../vendor/xlsx/xlsx.full.min.js", "https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js", () => typeof XLSX !== "undefined");
  const chart = () => lib("Chart.js", "../vendor/chartjs/chart.umd.min.js", "https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.0/chart.umd.min.js", () => typeof Chart !== "undefined");

  /* ------------------------------------------------------------------ leitura */
  const zona = $("#zona");
  ["dragenter", "dragover"].forEach(ev => zona.addEventListener(ev, e => { e.preventDefault(); zona.classList.add("sobre"); }));
  ["dragleave", "drop"].forEach(ev => zona.addEventListener(ev, e => { e.preventDefault(); zona.classList.remove("sobre"); }));
  zona.addEventListener("drop", e => adicionar([...e.dataTransfer.files]));
  $("#arquivo").addEventListener("change", e => { adicionar([...e.target.files]); e.target.value = ""; });

  function decodificar(buf) { const u = new Uint8Array(buf); try { return new TextDecoder("utf-8", { fatal: true }).decode(u); } catch (e) { return new TextDecoder("windows-1252").decode(u); } }
  function tabelaTexto(txt) {
    const ls = txt.replace(/^﻿/, "").split(/\r?\n/).filter(l => l.trim());
    const amostra = ls.slice(0, 20).join("\n"), cont = c => (amostra.match(new RegExp("\\" + c, "g")) || []).length;
    const sep = ["\t", ";", "|", ","].sort((a, b) => cont(b) - cont(a))[0];
    return ls.map(l => { const out = []; let c = "", q = false; for (let i = 0; i < l.length; i++) { const ch = l[i]; if (q) { if (ch === '"') { if (l[i + 1] === '"') { c += '"'; i++; } else q = false; } else c += ch; } else if (ch === '"') q = true; else if (ch === sep) { out.push(c.trim()); c = ""; } else c += ch; } out.push(c.trim()); return out; });
  }
  async function adicionar(files) {
    if (!files.length) return; $("#estado").textContent = "Lendo " + files.length + (files.length === 1 ? " arquivo…" : " arquivos…");
    for (const f of files) {
      try {
        const buf = await f.arrayBuffer(); let linhas;
        if (/\.(xlsx|xls|ods)$/i.test(f.name)) { await xlsx(); const wb = XLSX.read(buf, { type: "array", cellDates: true }); linhas = []; wb.SheetNames.forEach(sn => { const a = XLSX.utils.sheet_to_json(wb.Sheets[sn], { header: 1, raw: true, defval: "" }); if (a.length > linhas.length) linhas = a; }); }
        else linhas = tabelaTexto(decodificar(buf));
        linhas = linhas.filter(l => l.some(c => String(c).trim() !== ""));
        if (!linhas.length) continue;
        let hi = 0; for (let i = 0; i < Math.min(linhas.length, 15); i++) { const t = linhas[i].map(sem).join("|"); if (/(data|valor|histor|descri|lancament|natureza|credit|debit)/.test(t) && !/\d{2}\/\d{2}\/\d{4}/.test(t)) { hi = i; break; } }
        const temCab = /(data|valor|histor|descri|lancament|natureza|credit|debit|conta|cpf|cnpj)/.test(linhas[hi].map(sem).join("|"));
        const cab = temCab ? linhas[hi].map((c, i) => String(c || "Coluna " + (i + 1)).trim()) : linhas[0].map((_, i) => "Coluna " + (i + 1));
        const dados = linhas.slice(temCab ? hi + 1 : 0);
        E.arqs.push({ nome: f.name, cab, dados, mapa: mapear(cab, dados) });
      } catch (e) { window.HUB.toast("Não foi possível ler " + f.name + ": " + (e.message || e), 5000); }
    }
    $("#estado").textContent = E.arqs.length + (E.arqs.length === 1 ? " arquivo carregado" : " arquivos carregados") + " · " + E.arqs.reduce((s, a) => s + a.dados.length, 0).toLocaleString("pt-BR") + " linhas.";
    desenharMapas();
  }

  /* ------------------------------------------------------------------ mapeamento de colunas */
  const PAPEIS = [["", "(ignorar)"], ["data", "Data do lançamento"], ["valor", "Valor"], ["credito", "Valor a crédito"], ["debito", "Valor a débito"], ["natureza", "Natureza (C/D)"], ["historico", "Histórico ou descrição"], ["documento", "Número do documento"], ["codigo", "Tipo de lançamento (código)"], ["banco", "Banco da conta"], ["agencia", "Agência da conta"], ["conta", "Conta"], ["titular", "Titular da conta"], ["od_nome", "Contraparte: nome"], ["od_doc", "Contraparte: CPF ou CNPJ"], ["od_banco", "Contraparte: banco"], ["od_agencia", "Contraparte: agência"], ["od_conta", "Contraparte: conta"], ["chave", "Chave de ligação (sequencial do lançamento)"], ["saldo", "Saldo"]];
  function mapear(cab) {
    const usados = new Set(), m = cab.map(() => "");
    const regra = (papel, re, nao) => { cab.forEach((c, i) => { const s = sem(c); if (!m[i] && !usados.has(papel) && re.test(s) && !(nao && nao.test(s))) { m[i] = papel; usados.add(papel); } }); };
    const OD = /(origem|destino|contrapart|favorecid|remetente|beneficiari|\bod\b|_od\b|depositante|sacado)/;
    regra("chave", /(sequencial|seq.*lanc|id.*lanc|num.*lancamento|codigo.*lancamento.*seq)/);
    regra("od_doc", /(cpf|cnpj|documento)/, null); if (!cab.some((c, i) => m[i] === "od_doc" && OD.test(sem(c)))) { const k = m.indexOf("od_doc"); if (k >= 0) { m[k] = ""; usados.delete("od_doc"); } }
    cab.forEach((c, i) => { const s = sem(c); if (m[i]) return; if (OD.test(s)) { if (/(cpf|cnpj)/.test(s) && !usados.has("od_doc")) { m[i] = "od_doc"; usados.add("od_doc"); } else if (/nome|razao/.test(s) && !usados.has("od_nome")) { m[i] = "od_nome"; usados.add("od_nome"); } else if (/banco/.test(s) && !usados.has("od_banco")) { m[i] = "od_banco"; usados.add("od_banco"); } else if (/agencia/.test(s) && !usados.has("od_agencia")) { m[i] = "od_agencia"; usados.add("od_agencia"); } else if (/conta/.test(s) && !usados.has("od_conta")) { m[i] = "od_conta"; usados.add("od_conta"); } } });
    regra("data", /(^data$|data.*(lanc|mov|oper|transa)|^dt)/);
    regra("credito", /^(valor )?(a )?credito$|^creditos?$|entrada/);
    regra("debito", /^(valor )?(a )?debito$|^debitos?$|saida/);
    regra("valor", /(^valor$|valor.*(lanc|oper|transa|mov)|^vl|montante|quantia|importancia)/, /saldo/);
    regra("natureza", /(natureza|^d\/c$|^c\/d$|deb.*cred|cred.*deb|^tipo$|sinal)/, /saldo/);
    regra("codigo", /(tipo.*lanc|cod.*lanc|categoria)/);
    regra("historico", /(histor|descri|lancamento$|memo|complemento)/);
    regra("documento", /(documento|n.? ?doc|num.*doc)/);
    regra("titular", /(titular|correntista|nome.*cliente)/);
    regra("banco", /(^banco$|num.*banco|cod.*banco|instituicao)/);
    regra("agencia", /(agencia)/); regra("conta", /(^conta|num.*conta|conta.*corrente)/, /tipo/);
    regra("saldo", /saldo/);
    return m;
  }
  function desenharMapas() {
    $("#mapBloco").hidden = !E.arqs.length;
    $("#mapas").innerHTML = E.arqs.map((a, ai) => '<details' + (ai === 0 ? " open" : "") + ' style="margin-top:8px"><summary><b>' + esc(a.nome) + "</b> · " + a.dados.length.toLocaleString("pt-BR") + ' linhas</summary><div class="mapa-col">' +
      a.cab.map((c, ci) => '<label class="campo">' + esc(c) + ' <span class="mudo">(ex.: ' + esc(String((a.dados.find(l => String(l[ci] || "").trim()) || [])[ci] || "").slice(0, 24)) + ')</span><select data-a="' + ai + '" data-c="' + ci + '">' + PAPEIS.map(([k, r]) => '<option value="' + k + '"' + (a.mapa[ci] === k ? " selected" : "") + ">" + r + "</option>").join("") + "</select></label>").join("") + "</div></details>").join("");
    document.querySelectorAll("#mapas select").forEach(s => s.onchange = () => { E.arqs[+s.dataset.a].mapa[+s.dataset.c] = s.value; });
  }

  /* ------------------------------------------------------------------ normalização */
  function numero(v) {
    if (typeof v === "number") return v; let s = String(v == null ? "" : v).trim(); if (!s) return NaN;
    const neg = /^-|-$|^\(.*\)$|\bD$/i.test(s); s = s.replace(/[R$\s()]/g, "").replace(/[CD]$/i, "").replace(/^-|-$/g, "");
    if (s.includes(",") && s.includes(".")) s = s.lastIndexOf(",") > s.lastIndexOf(".") ? s.replace(/\./g, "").replace(",", ".") : s.replace(/,/g, "");
    else if (s.includes(",")) s = s.replace(",", ".");
    else if (/^\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, "");
    const n = parseFloat(s); return isNaN(n) ? NaN : neg ? -n : n;
  }
  function data(v) {
    if (v instanceof Date && !isNaN(v)) return new Date(v.getFullYear(), v.getMonth(), v.getDate());
    if (typeof v === "number" && v > 20000 && v < 80000) { const d = new Date(Math.round((v - 25569) * 86400000)); return new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()); }
    const s = String(v == null ? "" : v).trim(); let m;
    if ((m = s.match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{2,4})/))) return new Date(+m[3] < 100 ? 2000 + +m[3] : +m[3], +m[2] - 1, +m[1]);
    if ((m = s.match(/^(\d{4})-(\d{2})-(\d{2})/))) return new Date(+m[1], +m[2] - 1, +m[3]);
    if ((m = s.match(/^(\d{2})(\d{2})(\d{4})$/))) return new Date(+m[3], +m[2] - 1, +m[1]);
    if ((m = s.match(/^(\d{4})(\d{2})(\d{2})$/))) return new Date(+m[1], +m[2] - 1, +m[3]);
    return null;
  }
  const docLimpo = s => String(s || "").replace(/\D/g, "");
  const ESPECIE = /(saque|saq\b|espec|dinheiro|\bdin\b|\bdep\.? ?din|numerario|caixa eletr|\batm\b|cash|deposito em conta.*caixa|retirada)/i;
  function montar() {
    const lanc = [];
    const od = new Map(); /* ORIGEM_DESTINO ligado por chave */
    E.arqs.forEach(a => { const m = a.mapa, ix = k => m.indexOf(k); if (ix("chave") >= 0 && (ix("od_nome") >= 0 || ix("od_doc") >= 0) && ix("valor") < 0 && ix("credito") < 0) a.dados.forEach(l => od.set(String(l[ix("chave")]).trim(), { nome: l[ix("od_nome")], doc: l[ix("od_doc")], banco: l[ix("od_banco")], agencia: l[ix("od_agencia")], conta: l[ix("od_conta")] })); });
    E.arqs.forEach(a => {
      const m = a.mapa, ix = k => m.indexOf(k), g = (l, k) => ix(k) >= 0 ? l[ix(k)] : "";
      if (ix("data") < 0 || (ix("valor") < 0 && ix("credito") < 0 && ix("debito") < 0)) return;
      for (const l of a.dados) {
        const d = data(g(l, "data")); if (!d) continue;
        let v, nat;
        if (ix("valor") >= 0) { v = numero(g(l, "valor")); const n = sem(g(l, "natureza")); nat = /^(c|cred|credito|\+)/.test(n) ? "C" : /^(d|deb|debito|-)/.test(n) ? "D" : (v < 0 ? "D" : "C"); }
        else { const c = numero(g(l, "credito")), db = numero(g(l, "debito")); if (!isNaN(c) && c !== 0) { v = c; nat = "C"; } else if (!isNaN(db) && db !== 0) { v = db; nat = /-/.test(String(g(l, "debito"))) || db < 0 ? "D" : "D"; } else continue; }
        if (isNaN(v) || v === 0) continue; v = Math.abs(v);
        const hist = String(g(l, "historico") || "").trim(), cod = String(g(l, "codigo") || "").trim();
        const ligado = od.get(String(g(l, "chave")).trim()) || {};
        const contra = String(g(l, "od_nome") || ligado.nome || "").trim(), cdoc = docLimpo(g(l, "od_doc") || ligado.doc);
        const conta = [g(l, "banco"), g(l, "agencia"), g(l, "conta")].map(x => String(x || "").trim()).filter(Boolean).join("/") || a.nome;
        const especie = ESPECIE.test(hist) || /^220$/.test(cod) || (/^1(14|23)$/.test(cod) && /saq|espec|dinh/i.test(hist + " saque"));
        lanc.push({ data: d, valor: v, nat, hist, cod, doc: String(g(l, "documento") || "").trim(), conta, titular: String(g(l, "titular") || "").trim(), contra, cdoc, cbanco: String(g(l, "od_banco") || ligado.banco || "").trim(), especie, arq: a.nome });
      }
    });
    return lanc.sort((a, b) => a.data - b.data || (a.nat === "C" ? -1 : 1));
  }

  /* ------------------------------------------------------------------ análises */
  function analisar(lanc, renda, limite) {
    const soma = (l, n) => l.filter(x => !n || x.nat === n).reduce((s, x) => s + x.valor, 0);
    const contas = new Map(); lanc.forEach(x => { if (!contas.has(x.conta)) contas.set(x.conta, []); contas.get(x.conta).push(x); });
    const porConta = [...contas].map(([c, l]) => ({ conta: c, titular: (l.find(x => x.titular) || {}).titular || "", n: l.length, ini: l[0].data, fim: l[l.length - 1].data, cred: soma(l, "C"), deb: soma(l, "D") }));
    const meses = new Map(); lanc.forEach(x => { const k = mesDe(x.data); const o = meses.get(k) || { mes: k, cred: 0, deb: 0, n: 0, espC: 0, espD: 0 }; o[x.nat === "C" ? "cred" : "deb"] += x.valor; o.n++; if (x.especie) o[x.nat === "C" ? "espC" : "espD"] += x.valor; meses.set(k, o); });
    const mensal = [...meses.values()].sort((a, b) => a.mes.localeCompare(b.mes));
    const cps = new Map(); lanc.forEach(x => { const nome = x.contra || (x.cdoc ? "" : ""), k = x.cdoc || sem(nome); if (!k) return; const o = cps.get(k) || { nome: nome, doc: x.cdoc, cred: 0, deb: 0, nC: 0, nD: 0, ini: x.data, fim: x.data }; if (!o.nome && nome) o.nome = nome; if (x.nat === "C") { o.cred += x.valor; o.nC++; } else { o.deb += x.valor; o.nD++; } o.fim = x.data; cps.set(k, o); });
    const contrapartes = [...cps.values()].sort((a, b) => (b.cred + b.deb) - (a.cred + a.deb));
    const especie = lanc.filter(x => x.especie);
    /* fracionamento: operações em espécie de mesma natureza, cada uma abaixo do limite, somando o limite no mesmo dia ou em 7 dias */
    const frac = [];
    for (const nat of ["C", "D"]) {
      const l = especie.filter(x => x.nat === nat && x.valor < limite);
      for (const janela of [0, 6]) {
        let i = 0;
        for (let j = 0; j < l.length; j++) {
          while ((l[j].data - l[i].data) / 86400000 > janela) i++;
          const grupo = l.slice(i, j + 1), total = grupo.reduce((s, x) => s + x.valor, 0);
          if (grupo.length >= 2 && total >= limite) { const chave = nat + janela + dbr(grupo[0].data); if (!frac.some(f => f.chave === chave)) frac.push({ chave, nat, janela: janela === 0 ? "mesmo dia" : "7 dias", ini: grupo[0].data, fim: grupo[grupo.length - 1].data, n: grupo.length, total, itens: grupo }); i = j + 1; }
        }
      }
    }
    frac.sort((a, b) => a.ini - b.ini);
    const quaseLimite = especie.filter(x => x.valor >= limite * 0.8 && x.valor < limite);
    const acimaLimite = especie.filter(x => x.valor >= limite);
    const redondos = lanc.filter(x => x.valor >= 1000 && x.valor % 1000 === 0);
    /* passagem rápida: crédito seguido de débito de valor semelhante (±5%) em até 2 dias, na mesma conta */
    const passagem = [], usados = new Set();
    for (const [c, l] of contas) {
      const cr = l.filter(x => x.nat === "C" && x.valor >= 1000), db = l.filter(x => x.nat === "D" && x.valor >= 1000);
      for (const x of cr) { const y = db.find(d => !usados.has(d) && d.data >= x.data && (d.data - x.data) / 86400000 <= 2 && Math.abs(d.valor - x.valor) <= x.valor * 0.05); if (y) { usados.add(y); passagem.push({ conta: c, cred: x, deb: y }); } }
    }
    const incompat = renda > 0 ? mensal.filter(m => m.cred > renda * 1.5).map(m => Object.assign({}, m, { razao: m.cred / renda })) : [];
    return { lanc, porConta, mensal, contrapartes, especie, frac, quaseLimite, acimaLimite, redondos, passagem, incompat, renda, limite, totC: soma(lanc, "C"), totD: soma(lanc, "D"), totEspC: soma(especie, "C"), totEspD: soma(especie, "D"), ini: lanc[0] && lanc[0].data, fim: lanc.length && lanc[lanc.length - 1].data };
  }

  /* ------------------------------------------------------------------ exibição */
  $("#analisar").onclick = async () => {
    const lanc = montar();
    if (!lanc.length) { window.HUB.toast("Nenhum lançamento reconhecido: indique ao menos as colunas de data e de valor.", 5000); return; }
    const renda = numero($("#renda").value) || 0, limite = numero($("#limite").value) || 50000;
    E.an = analisar(lanc, renda, limite); $("#resBloco").hidden = false; desenhar(); $("#resBloco").scrollIntoView({ behavior: "smooth", block: "start" });
  };
  const tab = (cab, linhas, nums) => '<div class="rolagem"><table class="t"><thead><tr>' + cab.map((c, i) => "<th" + ((nums || []).includes(i) ? ' class="n"' : "") + ">" + esc(c) + "</th>").join("") + "</tr></thead><tbody>" + linhas.map(l => "<tr>" + l.map((v, i) => "<td" + ((nums || []).includes(i) ? ' class="n"' : "") + ">" + (String(v).startsWith("<") ? v : esc(v)) + "</td>").join("") + "</tr>").join("") + "</tbody></table></div>";
  const natHtml = n => n === "C" ? '<span class="cred">crédito</span>' : '<span class="deb">débito</span>';
  async function desenhar() {
    const a = E.an, alerta = (c, t, v) => '<div class="kpi' + (c ? " alerta" : "") + '"><small>' + t + "</small><b>" + v + "</b></div>";
    let h = '<div class="kpis">' + alerta(false, "Período", dbr(a.ini) + " a " + dbr(a.fim)) + alerta(false, "Lançamentos", a.lanc.length.toLocaleString("pt-BR")) + alerta(false, "Créditos", moeda(a.totC)) + alerta(false, "Débitos", moeda(a.totD)) +
      alerta(a.especie.length > 0, "Em espécie (créd. / déb.)", moeda(a.totEspC) + " / " + moeda(a.totEspD)) + alerta(a.frac.length > 0, "Possíveis fracionamentos", String(a.frac.length)) + alerta(a.passagem.length > 0, "Passagens rápidas", String(a.passagem.length)) + (a.renda ? alerta(a.incompat.length > 0, "Meses acima de 1,5 × a renda", a.incompat.length + " de " + a.mensal.length) : "") + "</div>";
    h += "<h3>Contas analisadas</h3>" + tab(["Conta", "Titular", "Lançamentos", "Período", "Créditos", "Débitos"], a.porConta.map(c => [c.conta, c.titular, c.n, dbr(c.ini) + " a " + dbr(c.fim), moeda(c.cred), moeda(c.deb)]), [2, 4, 5]);
    h += '<h3>Fluxo mensal</h3><canvas id="graf"></canvas>' + tab(["Mês", "Créditos", "Débitos", "Saldo do mês", "Espécie (créd.)", "Espécie (déb.)"].concat(a.renda ? ["Créditos ÷ renda"] : []), a.mensal.map(m => [m.mes.split("-").reverse().join("/"), moeda(m.cred), moeda(m.deb), moeda(m.cred - m.deb), moeda(m.espC), moeda(m.espD)].concat(a.renda ? [(m.cred / a.renda).toFixed(1).replace(".", ",") + "×"] : [])), [1, 2, 3, 4, 5, 6]);
    h += '<h3>Contrapartes mais relevantes</h3><p class="mudo">Por volume somado de entradas e saídas. Sem identificação da contraparte nos arquivos, esta seção fica vazia: junte o arquivo ORIGEM_DESTINO do SIMBA.</p>' + tab(["Contraparte", "CPF/CNPJ", "Recebido dela", "Nº", "Enviado a ela", "Nº", "Período"], a.contrapartes.slice(0, 60).map(c => [c.nome || "(sem nome)", c.doc, moeda(c.cred), c.nC, moeda(c.deb), c.nD, dbr(c.ini) + " a " + dbr(c.fim)]), [2, 3, 4, 5]);
    h += "<h3>Operações em espécie</h3><p class=\"mudo\">" + a.especie.length + " operações; " + a.acimaLimite.length + " iguais ou superiores ao limite de comunicação de " + moeda(a.limite) + " e " + a.quaseLimite.length + " entre 80% e 100% do limite.</p>" + tab(["Data", "Natureza", "Valor", "Histórico", "Conta"], a.especie.slice(0, 400).map(x => [dbr(x.data), natHtml(x.nat), moeda(x.valor), x.hist, x.conta]), [2]);
    h += '<h3>Possível fracionamento</h3><p class="mudo">Operações em espécie de mesma natureza, cada uma abaixo do limite, que somam o limite no mesmo dia ou em sete dias.</p>' + (a.frac.length ? tab(["Período", "Janela", "Natureza", "Operações", "Total", "Valores"], a.frac.map(f => [dbr(f.ini) + (f.fim - f.ini ? " a " + dbr(f.fim) : ""), f.janela, natHtml(f.nat), f.n, moeda(f.total), f.itens.map(x => moeda(x.valor)).join(" + ")]), [3, 4]) : '<p class="pequeno">Nenhum padrão encontrado.</p>');
    h += '<h3>Passagem rápida de recursos</h3><p class="mudo">Crédito seguido, em até dois dias, de débito de valor semelhante na mesma conta.</p>' + (a.passagem.length ? tab(["Conta", "Crédito", "Valor", "Origem", "Débito", "Valor", "Destino"], a.passagem.slice(0, 300).map(p => [p.conta, dbr(p.cred.data), moeda(p.cred.valor), p.cred.contra || p.cred.hist, dbr(p.deb.data), moeda(p.deb.valor), p.deb.contra || p.deb.hist]), [2, 5]) : '<p class="pequeno">Nenhum padrão encontrado.</p>');
    if (a.renda) h += '<h3>Compatibilidade com a renda declarada</h3><p class="mudo">Renda ou faturamento mensal informado: ' + moeda(a.renda) + ". Créditos totais do período: " + moeda(a.totC) + ", equivalentes a " + (a.totC / a.renda).toFixed(1).replace(".", ",") + " meses de renda em " + a.mensal.length + " meses analisados.</p>" + (a.incompat.length ? tab(["Mês", "Créditos", "Créditos ÷ renda"], a.incompat.map(m => [m.mes.split("-").reverse().join("/"), moeda(m.cred), m.razao.toFixed(1).replace(".", ",") + "×"]), [1, 2]) : '<p class="pequeno">Nenhum mês com créditos acima de 1,5 vez a renda informada.</p>');
    h += '<h3>Valores redondos</h3><p class="mudo">' + a.redondos.length + " lançamentos em múltiplos exatos de R$ 1.000,00 (" + (a.lanc.length ? Math.round(100 * a.redondos.length / a.lanc.length) : 0) + "% do total). Proporção elevada pode indicar operações sem lastro em notas ou contratos, mas é comum em transferências entre contas do próprio titular.</p>";
    h += '<h3>Todos os lançamentos</h3><label class="campo" style="max-width:420px">Filtrar<input type="search" id="filtro" placeholder="nome, histórico, valor ou data"></label><div id="todos"></div>';
    $("#resultado").innerHTML = h; todos("");
    $("#filtro").addEventListener("input", e => todos(e.target.value));
    try { await chart(); const ctx = $("#graf"); new Chart(ctx, { type: "bar", data: { labels: a.mensal.map(m => m.mes.split("-").reverse().join("/")), datasets: [{ label: "Créditos", data: a.mensal.map(m => m.cred), backgroundColor: "#1BAF7A" }, { label: "Débitos", data: a.mensal.map(m => m.deb), backgroundColor: "#D03B3B" }].concat(a.renda ? [{ type: "line", label: "1,5 × renda", data: a.mensal.map(() => a.renda * 1.5), borderColor: "#EB6834", pointRadius: 0 }] : []) }, options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: "bottom" } }, scales: { y: { ticks: { callback: v => (v / 1000).toLocaleString("pt-BR") + " mil" } } } } }); ctx.parentNode.style.height = "auto"; ctx.style.height = "300px"; } catch (e) { /* sem gráfico */ }
  }
  function todos(f) {
    const q = sem(f), l = E.an.lanc.filter(x => !q || sem([dbr(x.data), x.hist, x.contra, x.cdoc, moeda(x.valor), x.conta].join(" ")).includes(q));
    $("#todos").innerHTML = '<p class="pequeno mudo">' + l.length.toLocaleString("pt-BR") + " lançamentos" + (l.length > 1000 ? " (exibidos os 1.000 primeiros; a planilha traz todos)" : "") + "</p>" + tab(["Data", "Natureza", "Valor", "Histórico", "Contraparte", "CPF/CNPJ", "Conta"], l.slice(0, 1000).map(x => [dbr(x.data), natHtml(x.nat), moeda(x.valor), x.hist + (x.especie ? " [espécie]" : ""), x.contra, x.cdoc, x.conta]), [2]);
  }

  /* ------------------------------------------------------------------ Excel e Word */
  $("#xlsx").onclick = async () => {
    const a = E.an; if (!a) return; await xlsx();
    const wb = XLSX.utils.book_new(), add = (n, linhas) => XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(linhas), n);
    add("Lançamentos", [["Data", "Natureza", "Valor", "Histórico", "Código", "Documento", "Contraparte", "CPF/CNPJ", "Conta", "Espécie", "Arquivo"]].concat(a.lanc.map(x => [dbr(x.data), x.nat === "C" ? "Crédito" : "Débito", x.valor, x.hist, x.cod, x.doc, x.contra, x.cdoc, x.conta, x.especie ? "sim" : "", x.arq])));
    add("Mensal", [["Mês", "Créditos", "Débitos", "Espécie créd.", "Espécie déb."]].concat(a.mensal.map(m => [m.mes, m.cred, m.deb, m.espC, m.espD])));
    add("Contrapartes", [["Contraparte", "CPF/CNPJ", "Recebido", "Nº", "Enviado", "Nº", "Início", "Fim"]].concat(a.contrapartes.map(c => [c.nome, c.doc, c.cred, c.nC, c.deb, c.nD, dbr(c.ini), dbr(c.fim)])));
    add("Espécie", [["Data", "Natureza", "Valor", "Histórico", "Conta"]].concat(a.especie.map(x => [dbr(x.data), x.nat, x.valor, x.hist, x.conta])));
    add("Fracionamento", [["Início", "Fim", "Janela", "Natureza", "Operações", "Total"]].concat(a.frac.map(f => [dbr(f.ini), dbr(f.fim), f.janela, f.nat, f.n, f.total])));
    add("Passagem", [["Conta", "Data crédito", "Valor crédito", "Origem", "Data débito", "Valor débito", "Destino"]].concat(a.passagem.map(p => [p.conta, dbr(p.cred.data), p.cred.valor, p.cred.contra || p.cred.hist, dbr(p.deb.data), p.deb.valor, p.deb.contra || p.deb.hist])));
    XLSX.writeFile(wb, "Analise de sigilo bancario - " + ($("#caso").value.trim() || "caso").replace(/[\\/:*?"<>|]+/g, " ") + ".xlsx");
  };
  $("#relatorio").onclick = async () => {
    const a = E.an; if (!a) return;
    const b = [{ t: "tit", texto: "ANÁLISE DE DADOS DE AFASTAMENTO DE SIGILO BANCÁRIO" }];
    b.push({ t: "tab", larg: [1.4, 3], linhas: [["Processo ou caso", $("#caso").value.trim() || "não informado"], ["Investigado", $("#investigado").value.trim() || "não informado"], ["Período dos dados", dbr(a.ini) + " a " + dbr(a.fim)], ["Arquivos", E.arqs.map(x => x.nome).join("; ")], ["Lançamentos analisados", a.lanc.length.toLocaleString("pt-BR")]] });
    b.push({ t: "h", texto: "Metodologia" });
    b.push({ t: "p", r: "Os arquivos entregues pelas instituições financeiras foram lidos e consolidados, com reconhecimento das colunas de data, valor, natureza, histórico e contraparte. Foram calculados o fluxo de recursos por conta e por mês, as contrapartes de maior volume, as operações em espécie e os padrões de fracionamento (operações em espécie abaixo do limite de comunicação de " + moeda(a.limite) + " que o atingem somadas, no mesmo dia ou em sete dias) e de passagem rápida (crédito seguido de débito semelhante em até dois dias)." + (a.renda ? " Os créditos mensais foram confrontados com a renda ou o faturamento declarado de " + moeda(a.renda) + "." : "") });
    b.push({ t: "p", r: [["Ressalva: ", "bo"], ["os padrões apontados são indicadores estatísticos, e não prova de ilicitude. Movimentações fracionadas, de passagem ou em valores redondos têm explicações lícitas frequentes, que devem ser confrontadas com a documentação contábil e fiscal do investigado.", "n"]] });
    b.push({ t: "h", texto: "Resultados" });
    b.push({ t: "tab", larg: [2, 2.6], linhas: [["Créditos totais", moeda(a.totC)], ["Débitos totais", moeda(a.totD)], ["Em espécie (créditos)", moeda(a.totEspC)], ["Em espécie (débitos)", moeda(a.totEspD)], ["Operações em espécie iguais ou superiores ao limite", String(a.acimaLimite.length)], ["Possíveis fracionamentos", String(a.frac.length)], ["Passagens rápidas", String(a.passagem.length)]].concat(a.renda ? [["Meses com créditos acima de 1,5 vez a renda", a.incompat.length + " de " + a.mensal.length]] : []) });
    b.push({ t: "sub", texto: "Contas" });
    b.push({ t: "tab", cab: ["Conta", "Período", "Créditos", "Débitos"], larg: [2, 1.6, 1.2, 1.2], linhas: a.porConta.map(c => [c.conta + (c.titular ? " (" + c.titular + ")" : ""), dbr(c.ini) + " a " + dbr(c.fim), moeda(c.cred), moeda(c.deb)]) });
    b.push({ t: "sub", texto: "Fluxo mensal" });
    b.push({ t: "tab", cab: ["Mês", "Créditos", "Débitos", "Espécie"], larg: [1, 1.4, 1.4, 1.4], linhas: a.mensal.map(m => [m.mes.split("-").reverse().join("/"), moeda(m.cred), moeda(m.deb), moeda(m.espC + m.espD)]) });
    if (a.contrapartes.length) { b.push({ t: "sub", texto: "Contrapartes de maior volume" }); b.push({ t: "tab", cab: ["Contraparte", "Recebido", "Enviado"], larg: [2.6, 1.2, 1.2], linhas: a.contrapartes.slice(0, 25).map(c => [(c.nome || "(sem nome)") + (c.doc ? " · " + c.doc : ""), moeda(c.cred), moeda(c.deb)]) }); }
    if (a.frac.length) { b.push({ t: "sub", texto: "Possível fracionamento" }); b.push({ t: "tab", cab: ["Período", "Natureza", "Operações", "Total"], larg: [1.8, 1, 0.8, 1.2], linhas: a.frac.map(f => [dbr(f.ini) + (f.fim - f.ini ? " a " + dbr(f.fim) : ""), f.nat === "C" ? "crédito" : "débito", String(f.n), moeda(f.total)]) }); }
    if (a.passagem.length) { b.push({ t: "sub", texto: "Passagem rápida de recursos" }); b.push({ t: "tab", cab: ["Crédito", "Débito", "Valor"], larg: [1.8, 1.8, 1.2], linhas: a.passagem.slice(0, 40).map(p => [dbr(p.cred.data) + " · " + (p.cred.contra || p.cred.hist), dbr(p.deb.data) + " · " + (p.deb.contra || p.deb.hist), moeda(p.cred.valor)]) }); }
    b.push({ t: "data", texto: "Belo Horizonte, " + P.dataExtenso(new Date()) + "." });
    try { P.baixar(await P.docx(b), "Analise de sigilo bancario - " + ($("#caso").value.trim() || "caso").replace(/[\\/:*?"<>|]+/g, " ")); } catch (e) { window.HUB.toast(e.message || "Não foi possível gerar o Word.", 5000); }
  };
})();
