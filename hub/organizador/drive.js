/* Acesso ao Google Drive pela API v3, direto do navegador.
   Arquivos e pastas compartilhados com "qualquer pessoa com o link" são lidos com a chave de API do Google;
   arquivos privados exigem login com a conta Google (OAuth, escopo somente leitura). */
(function (root) {
  "use strict";
  const API = "https://www.googleapis.com/drive/v3/files";
  const ESCOPO = "https://www.googleapis.com/auth/drive.readonly";
  let token = null;

  const EXPORTA = {
    "application/vnd.google-apps.document": "application/pdf",
    "application/vnd.google-apps.spreadsheet": "application/pdf",
    "application/vnd.google-apps.presentation": "application/pdf",
    "application/vnd.google-apps.drawing": "application/pdf"
  };
  const ACEITOS = /^(application\/pdf|image\/(jpeg|png|webp|gif|bmp|tiff))$/;
  const PASTA = "application/vnd.google-apps.folder";

  /* identifica arquivos e pastas em links do Drive, Docs, Sheets e Slides */
  function ids(texto) {
    const out = [];
    for (const raw of String(texto || "").split(/[\s,;]+/)) {
      if (!raw) continue;
      let m = /\/folders\/([\w-]{10,})/.exec(raw) || /\/(?:file|document|spreadsheets|presentation|drawings)\/d\/([\w-]{10,})/.exec(raw) || /[?&]id=([\w-]{10,})/.exec(raw);
      if (m) out.push({ id: m[1], link: raw });
      else if (/^[\w-]{25,}$/.test(raw)) out.push({ id: raw, link: raw });
    }
    return [...new Map(out.map(x => [x.id, x])).values()];
  }

  async function chamar(url, cfg, tipo) {
    const u = new URL(url);
    u.searchParams.set("supportsAllDrives", "true");
    const h = {};
    if (token) h.Authorization = "Bearer " + token;
    else if (cfg.apiKey) u.searchParams.set("key", cfg.apiKey);
    else throw new Error("Configure a chave de API do Google ou entre com a conta Google para acessar o Drive.");
    const r = await fetch(u.toString(), { headers: h });
    if (!r.ok) {
      let msg = "";
      try { msg = (await r.json()).error.message; } catch (e) { /* ignora */ }
      if (r.status === 404) throw new Error("Arquivo ou pasta não encontrado. Se for privado, entre com a conta Google; se for público, confira o compartilhamento “qualquer pessoa com o link”.");
      if (r.status === 403) throw new Error("Acesso negado pelo Google Drive" + (msg ? ": " + msg : "") + ".");
      if (r.status === 400 && /API key/i.test(msg)) throw new Error("Chave de API do Google inválida ou restrita.");
      throw new Error("Erro do Google Drive (" + r.status + ")" + (msg ? ": " + msg : "") + ".");
    }
    return tipo === "bin" ? r.arrayBuffer() : r.json();
  }
  const meta = (id, cfg) => chamar(API + "/" + encodeURIComponent(id) + "?fields=id,name,mimeType,size,shortcutDetails", cfg);
  async function filhos(id, cfg) {
    const out = []; let page = "";
    do {
      const u = new URL(API);
      u.searchParams.set("q", "'" + id + "' in parents and trashed = false");
      u.searchParams.set("fields", "nextPageToken, files(id,name,mimeType,size,shortcutDetails)");
      u.searchParams.set("pageSize", "200"); u.searchParams.set("includeItemsFromAllDrives", "true"); u.searchParams.set("orderBy", "folder,name_natural");
      if (page) u.searchParams.set("pageToken", page);
      const r = await chamar(u.toString(), cfg);
      out.push(...r.files); page = r.nextPageToken || "";
    } while (page);
    return out;
  }
  /* percorre os links e devolve a lista de arquivos aceitos (pastas: até dois níveis) */
  async function listar(texto, cfg, prog) {
    const arquivos = [], ignorados = [];
    async function visitar(f, caminho, nivel) {
      if (f.mimeType === "application/vnd.google-apps.shortcut" && f.shortcutDetails) f = Object.assign({}, f, { id: f.shortcutDetails.targetId, mimeType: f.shortcutDetails.targetMimeType });
      if (f.mimeType === PASTA) {
        if (nivel > 2) { ignorados.push(caminho + f.name + "/ (subpasta profunda)"); return; }
        prog && prog("Listando a pasta " + f.name + "…");
        for (const g of await filhos(f.id, cfg)) await visitar(g, caminho + f.name + "/", nivel + 1);
      } else if (ACEITOS.test(f.mimeType) || EXPORTA[f.mimeType]) arquivos.push({ id: f.id, nome: f.name + (EXPORTA[f.mimeType] ? ".pdf" : ""), mime: f.mimeType, pasta: caminho });
      else ignorados.push(caminho + f.name);
    }
    for (const x of ids(texto)) {
      prog && prog("Consultando " + x.id.slice(0, 10) + "…");
      await visitar(await meta(x.id, cfg), "", 0);
    }
    return { arquivos, ignorados };
  }
  async function baixar(arq, cfg) {
    if (EXPORTA[arq.mime]) return chamar(API + "/" + encodeURIComponent(arq.id) + "/export?mimeType=" + encodeURIComponent(EXPORTA[arq.mime]), cfg, "bin");
    return chamar(API + "/" + encodeURIComponent(arq.id) + "?alt=media", cfg, "bin");
  }

  /* login com a conta Google (Google Identity Services), quando houver ID de cliente OAuth configurado */
  function entrar(clientId) {
    return new Promise((resolve, reject) => {
      if (!root.google || !root.google.accounts || !root.google.accounts.oauth2) return reject(new Error("O serviço de login do Google não foi carregado. Verifique a conexão."));
      const cli = root.google.accounts.oauth2.initTokenClient({
        client_id: clientId, scope: ESCOPO,
        callback: r => { if (r.error) reject(new Error("Login não concluído: " + r.error)); else { token = r.access_token; resolve(true); } },
        error_callback: e => reject(new Error("Login não concluído: " + (e && e.type ? e.type : "erro")))
      });
      cli.requestAccessToken({ prompt: "" });
    });
  }
  function sair() { if (token && root.google && root.google.accounts) root.google.accounts.oauth2.revoke(token, () => {}); token = null; }
  const conectado = () => !!token;

  root.DRIVE = { ids, listar, baixar, entrar, sair, conectado };
})(typeof window !== "undefined" ? window : globalThis);
