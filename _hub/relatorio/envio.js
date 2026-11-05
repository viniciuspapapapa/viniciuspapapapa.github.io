/* Envio do relatório ao cliente.
   1. Outlook com envio automático: Microsoft Graph (/me/sendMail), com login Microsoft 365 pela biblioteca MSAL.
      Exige um aplicativo registrado no Microsoft Entra ID (ID do aplicativo, plataforma SPA, permissão Mail.Send).
   2. Outlook sem configuração: arquivo .eml com X-Unsent, que o Outlook abre como mensagem pronta para enviar,
      com destinatário, assunto, texto e o relatório anexado.
   3. WhatsApp: link wa.me com a mensagem preenchida (o anexo é enviado manualmente). */
(function (root) {
  "use strict";
  const ESCOPOS = ["Mail.Send"];
  const REDIRECT = () => location.origin + "/hub/login/oauth.html";
  let app = null, appCfg = "";

  async function cliente(cfg) {
    if (!cfg || !cfg.clientId) throw new Error("O envio automático pelo Outlook ainda não foi configurado: informe o ID do aplicativo registrado no Microsoft Entra ID.");
    if (!root.msal) throw new Error("A biblioteca de autenticação da Microsoft não foi carregada. Verifique a conexão e recarregue a página.");
    const chave = cfg.clientId + "|" + (cfg.tenant || "common");
    if (app && appCfg === chave) return app;
    app = new root.msal.PublicClientApplication({
      auth: { clientId: cfg.clientId, authority: "https://login.microsoftonline.com/" + (cfg.tenant || "common"), redirectUri: REDIRECT(), navigateToLoginRequestUrl: false },
      cache: { cacheLocation: "localStorage" }
    });
    if (app.initialize) await app.initialize();
    appCfg = chave;
    return app;
  }
  async function token(cfg) {
    const a = await cliente(cfg);
    const conta = a.getAllAccounts()[0];
    if (conta) { try { return (await a.acquireTokenSilent({ scopes: ESCOPOS, account: conta })).accessToken; } catch (e) { /* segue para o login */ } }
    const r = await a.acquireTokenPopup({ scopes: ESCOPOS, prompt: conta ? undefined : "select_account" });
    return r.accessToken;
  }
  async function conta(cfg) { try { const a = await cliente(cfg); const c = a.getAllAccounts()[0]; return c ? c.username : ""; } catch (e) { return ""; } }
  async function sair(cfg) { const a = await cliente(cfg); const c = a.getAllAccounts()[0]; if (c) await a.logoutPopup({ account: c, postLogoutRedirectUri: REDIRECT() }).catch(() => {}); }

  const lista = s => String(s || "").split(/[;,\s]+/).map(x => x.trim()).filter(x => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(x));
  async function b64(blob) { const u = new Uint8Array(await blob.arrayBuffer()); let s = ""; for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode.apply(null, u.subarray(i, i + 0x8000)); return btoa(s); }

  /* msg = { para, cc, assunto, html, anexo: { nome, blob } } */
  async function enviarGraph(cfg, msg) {
    const para = lista(msg.para); if (!para.length) throw new Error("Informe ao menos um e-mail válido do cliente.");
    const t = await token(cfg);
    const corpo = { message: { subject: msg.assunto, body: { contentType: "HTML", content: msg.html }, toRecipients: para.map(e => ({ emailAddress: { address: e } })), ccRecipients: lista(msg.cc).map(e => ({ emailAddress: { address: e } })), attachments: [] }, saveToSentItems: true };
    if (msg.anexo) corpo.message.attachments.push({ "@odata.type": "#microsoft.graph.fileAttachment", name: msg.anexo.nome, contentType: msg.anexo.blob.type || "application/octet-stream", contentBytes: await b64(msg.anexo.blob) });
    const r = await fetch("https://graph.microsoft.com/v1.0/me/sendMail", { method: "POST", headers: { Authorization: "Bearer " + t, "Content-Type": "application/json" }, body: JSON.stringify(corpo) });
    if (r.status !== 202) { const j = await r.json().catch(() => ({})); throw new Error("O Outlook recusou o envio: " + ((j.error && j.error.message) || "código " + r.status) + "."); }
    return true;
  }

  /* .eml pronto para enviar (X-Unsent: 1) */
  const cab = s => "=?UTF-8?B?" + btoa(unescape(encodeURIComponent(s))) + "?=";
  const quebra = s => s.replace(/.{1,76}/g, "$&\r\n");
  async function eml(msg) {
    const fr = "tpc" + Math.random().toString(36).slice(2);
    const partes = ["X-Unsent: 1", "To: " + lista(msg.para).join(", "), lista(msg.cc).length ? "Cc: " + lista(msg.cc).join(", ") : "", "Subject: " + cab(msg.assunto), "MIME-Version: 1.0", 'Content-Type: multipart/mixed; boundary="' + fr + '"', "", "--" + fr, 'Content-Type: text/html; charset="UTF-8"', "Content-Transfer-Encoding: base64", "", quebra(btoa(unescape(encodeURIComponent(msg.html))))].filter((x, i) => x !== "" || i > 5);
    if (msg.anexo) partes.push("--" + fr, "Content-Type: " + (msg.anexo.blob.type || "application/octet-stream") + '; name="' + cab(msg.anexo.nome) + '"', 'Content-Disposition: attachment; filename="' + cab(msg.anexo.nome) + '"', "Content-Transfer-Encoding: base64", "", quebra(await b64(msg.anexo.blob)));
    partes.push("--" + fr + "--", "");
    return new Blob([partes.join("\r\n")], { type: "message/rfc822" });
  }

  /* WhatsApp: número brasileiro com DDD; sem número, o próprio WhatsApp pede o contato */
  function whatsapp(telefone, texto) {
    let d = String(telefone || "").replace(/\D/g, "");
    if (d && (d.length === 10 || d.length === 11)) d = "55" + d;
    return "https://wa.me/" + (d.length >= 12 ? d : "") + "?text=" + encodeURIComponent(texto);
  }

  root.REL_ENVIO = { enviarGraph, eml, whatsapp, conta, sair, lista, REDIRECT };
})(typeof window !== "undefined" ? window : globalThis);
