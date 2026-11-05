/* Base de processos do escritório: guardada no navegador (IndexedDB), alimentada por planilha (.xlsx, .xls, .csv) e
   atualizada no DataJud pelo serviço intermediário, em lote e com controle de concorrência.
   Estrutura: { processos: { [numero20]: { numero, cliente, apelido, tribunal, dados: { movs, meta }, atualizadoEm,
                erro, novas } }, clientes: { [nome]: { email, telefone, saudacao } }, versao } */
(function (root) {
  "use strict";
  const T = root.REL_TRAD;
  const DB = "hub_relatorio", LOJA = "kv", CHAVE = "base";

  /* ------------------------------------------------------------------ armazenamento */
  function abrir() {
    return new Promise((ok, erro) => {
      if (!root.indexedDB) { erro(new Error("Este navegador não permite armazenamento local.")); return; }
      const r = root.indexedDB.open(DB, 1);
      r.onupgradeneeded = () => r.result.createObjectStore(LOJA);
      r.onsuccess = () => ok(r.result); r.onerror = () => erro(r.error);
    });
  }
  async function op(modo, fn) {
    const db = await abrir();
    return new Promise((ok, erro) => { const tx = db.transaction(LOJA, modo), s = tx.objectStore(LOJA); const r = fn(s); tx.oncomplete = () => ok(r && r.result); tx.onerror = () => erro(tx.error); });
  }
  const vazia = () => ({ versao: 1, processos: {}, clientes: {} });
  async function carregar() {
    try { const b = await op("readonly", s => s.get(CHAVE)); return b && b.processos ? b : vazia(); }
    catch (e) { return vazia(); }
  }
  async function salvar(base) { await op("readwrite", s => s.put(base, CHAVE)); }

  /* ------------------------------------------------------------------ planilha */
  const norm = s => String(s == null ? "" : s).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
  const COLUNAS = {
    numero: /processo|cnj|^numero|^autos/,
    cliente: /cliente|constituinte|assistido|parte|nome/,
    apelido: /identifica|descri|assunto|acao|classe|observa|objeto|vara|comarca/,
    email: /e-?mail|correio/,
    telefone: /whats|telefone|celular|fone|contato/
  };
  /* número do processo vindo do Excel: com ou sem máscara; quando gravado como número, o Excel apaga os zeros à esquerda */
  function numeroDe(v) {
    let d = T.dig(v);
    if (/e\+?\d+/i.test(String(v))) return null; /* notação científica: o Excel perdeu dígitos */
    if (d.length > 0 && d.length < 20 && d.length >= 14) { const p = d.padStart(20, "0"); if (T.validoCNJ(p)) d = p; }
    return d.length === 20 ? d : null;
  }
  function linhasDaPlanilha(buf, nomeArquivo) {
    if (!root.XLSX) throw new Error("A biblioteca de planilhas não foi carregada. Verifique a conexão e recarregue a página.");
    const wb = /\.csv$/i.test(nomeArquivo || "") ? root.XLSX.read(new TextDecoder().decode(buf), { type: "string", raw: false }) : root.XLSX.read(buf, { type: "array", raw: false });
    const todas = [];
    for (const nome of wb.SheetNames) {
      const aoa = root.XLSX.utils.sheet_to_json(wb.Sheets[nome], { header: 1, raw: false, defval: "" });
      if (!aoa.length) continue;
      /* cabeçalho: primeira linha, entre as dez primeiras, que nomeia a coluna do processo */
      let cab = -1, mapa = {};
      for (let i = 0; i < Math.min(10, aoa.length) && cab < 0; i++) {
        const m = {};
        aoa[i].forEach((c, j) => { const n = norm(c); if (!n) return; for (const [k, re] of Object.entries(COLUNAS)) if (m[k] == null && re.test(n) && !(k === "cliente" && /processo/.test(n))) { m[k] = j; break; } });
        if (m.numero != null) { cab = i; mapa = m; }
      }
      if (cab < 0) {
        /* sem cabeçalho: a coluna do processo é a que mais tem números no padrão CNJ */
        const cont = {};
        aoa.forEach(l => l.forEach((c, j) => { if (numeroDe(c)) cont[j] = (cont[j] || 0) + 1; }));
        const j = Object.keys(cont).sort((a, b) => cont[b] - cont[a])[0];
        if (j == null) continue;
        mapa = { numero: +j };
      }
      aoa.slice(cab + 1).forEach((l, k) => {
        const bruto = l[mapa.numero];
        if (!String(bruto || "").trim()) return;
        const g = c => (mapa[c] != null ? String(l[mapa[c]] || "").trim() : "");
        todas.push({ linha: cab + 2 + k, aba: nome, bruto: String(bruto), numero: numeroDe(bruto), cliente: g("cliente"), apelido: g("apelido"), email: g("email"), telefone: g("telefone") });
      });
    }
    return todas;
  }
  function mesclar(base, linhas) {
    const r = { novos: 0, atualizados: 0, invalidos: [], semTribunal: [] };
    for (const l of linhas) {
      if (!l.numero) { r.invalidos.push(l.bruto + " (" + l.aba + ", linha " + l.linha + ")"); continue; }
      const trib = T.tribunal(l.numero);
      if (!trib) r.semTribunal.push(T.fmtCNJ(l.numero));
      const p = base.processos[l.numero];
      if (p) { if (l.cliente) p.cliente = l.cliente; if (l.apelido) p.apelido = l.apelido; p.tribunal = trib; r.atualizados++; }
      else { base.processos[l.numero] = { numero: l.numero, cliente: l.cliente, apelido: l.apelido, tribunal: trib, dados: null, atualizadoEm: null, erro: "", novas: 0 }; r.novos++; }
      if (l.cliente) {
        const c = base.clientes[l.cliente] = base.clientes[l.cliente] || { email: "", telefone: "", saudacao: "" };
        if (l.email) c.email = l.email; if (l.telefone) c.telefone = l.telefone;
      }
    }
    return r;
  }
  function modeloPlanilha() {
    const aoa = [["Número CNJ", "Cliente", "Identificação do processo", "E-mail do cliente", "WhatsApp do cliente"], ["0000000-00.0000.8.13.0024", "Nome do cliente", "Ação penal na 1ª Vara Criminal de Belo Horizonte", "cliente@exemplo.com.br", "(31) 90000-0000"]];
    const ws = root.XLSX.utils.aoa_to_sheet(aoa);
    ws["!cols"] = [{ wch: 28 }, { wch: 30 }, { wch: 46 }, { wch: 30 }, { wch: 20 }];
    for (let i = 2; i <= 500; i++) { ws["A" + i] = ws["A" + i] || { t: "s", v: "" }; ws["A" + i].z = "@"; }
    ws["!ref"] = "A1:E500";
    const wb = root.XLSX.utils.book_new(); root.XLSX.utils.book_append_sheet(wb, ws, "Processos");
    root.XLSX.writeFile(wb, "Modelo - base de processos TPC.xlsx");
  }

  /* ------------------------------------------------------------------ atualização no DataJud */
  /* consultar(numero) -> resposta do serviço; prog({ feitos, total, numero, ok }) ; cancelado() */
  async function atualizar(base, numeros, consultar, op) {
    op = op || {};
    const fila = numeros.slice(), total = fila.length, res = { ok: 0, falhas: 0, novidades: 0 };
    let feitos = 0;
    async function trabalhador() {
      while (fila.length && !(op.cancelado && op.cancelado())) {
        const n = fila.shift(), p = base.processos[n];
        if (!p) { feitos++; continue; }
        try {
          const r = await consultar(n);
          if (!r.processos || !r.processos.length) { p.erro = "não localizado no DataJud (segredo de justiça ou não indexado)"; p.atualizadoEm = new Date(); res.falhas++; }
          else {
            const d = T.doDatajud(r), antes = p.dados && p.dados.movs.length ? p.dados.movs[p.dados.movs.length - 1].hora : null;
            const novas = antes ? d.movs.filter(m => m.hora > antes).length : 0;
            p.dados = d; p.erro = ""; p.atualizadoEm = new Date(); p.novas = (p.novas || 0) + novas; res.ok++; res.novidades += novas;
            if (!p.apelido && d.meta.classe) p.classe = d.meta.classe;
          }
        } catch (e) { p.erro = e.message; res.falhas++; }
        feitos++;
        if (op.prog) op.prog({ feitos, total, numero: n });
        if (feitos % 10 === 0) await salvar(base).catch(() => {});
      }
    }
    await Promise.all(Array.from({ length: Math.min(op.paralelo || 3, total) }, trabalhador));
    await salvar(base);
    return res;
  }

  function exportar(base) {
    const blob = new Blob([JSON.stringify(base)], { type: "application/json" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = "Base de processos TPC - " + new Date().toISOString().slice(0, 10) + ".json";
    document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1500);
  }
  /* restaura as datas ao ler o backup em JSON */
  function revive(base) {
    for (const p of Object.values(base.processos || {})) {
      if (p.atualizadoEm) p.atualizadoEm = new Date(p.atualizadoEm);
      if (p.dados) { (p.dados.movs || []).forEach(m => { m.data = new Date(m.data); }); const me = p.dados.meta || {}; if (me.ajuizamento) me.ajuizamento = new Date(me.ajuizamento); if (me.atualizado) me.atualizado = new Date(me.atualizado); }
    }
    base.clientes = base.clientes || {};
    return base;
  }

  root.REL_BASE = { carregar, salvar, linhasDaPlanilha, mesclar, modeloPlanilha, atualizar, exportar, revive };
})(typeof window !== "undefined" ? window : globalThis);
