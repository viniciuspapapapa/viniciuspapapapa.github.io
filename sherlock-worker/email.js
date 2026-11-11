/* Pesquisa por e-mail da ferramenta "Pesquisa em fontes públicas" do HUB (/publico/email...).

   Verificações por site portadas do projeto aberto user-scanner (github.com/kaifcodec/user-scanner, licença MIT,
   cópia em LICENSE-user-scanner.txt), que consulta os mesmos endereços usados pelas páginas de cadastro de cada
   serviço. Só entram aqui as verificações NÃO INTRUSIVAS: as que perguntam se o e-mail já está cadastrado (ou quais
   são os métodos de entrada) sem enviar código, link de recuperação ou e-mail ao titular, sem tentar entrar na
   conta com senha e sem criar cadastro. Ficam de fora as categorias que revelariam dados sensíveis (LGPD, art. 5º,
   II: vida sexual e saúde), como sites adultos, de relacionamento e de saúde.

   Além dos sites, /publico/email/extras reúne fontes públicas sobre o e-mail: provedor (registros MX), registro do
   domínio (RDAP, inclusive Registro.br), chaves PGP publicadas (keys.openpgp.org) e commits públicos no GitHub.

   Facebook, Netflix, Etsy, Emirates e Quizlet foram retirados: recusam as consultas vindas da Cloudflare. */

const UA = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/144.0.0.0 Safari/537.36";
const UA_MOB = "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/144.0.0.0 Mobile Safari/537.36";
const UA_IOS = "Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1";
const SIM = "encontrado", NAO = "nao_encontrado";
class Indefinido extends Error {}
const falha = m => { throw new Indefinido(m); };
const hex = () => [...crypto.getRandomValues(new Uint8Array(8))].map(b => b.toString(16).padStart(2, "0")).join("");

/* requisição com tempo limite e "pote" de cookies opcional (para os sites que exigem token de sessão) */
async function req(url, opc) {
  opc = opc || {};
  const ctl = new AbortController(), t = setTimeout(() => ctl.abort(), (opc.timeout || 15) * 1000);
  const h = Object.assign({ "User-Agent": UA, "Accept": "application/json, text/plain, */*", "Accept-Language": "en-US,en;q=0.9" }, opc.headers || {});
  if (opc.pote && opc.pote.size) h["Cookie"] = [...opc.pote].map(([k, v]) => k + "=" + v).join("; ");
  let body = opc.body;
  if (opc.json !== undefined) { body = JSON.stringify(opc.json); if (!Object.keys(h).some(k => k.toLowerCase() === "content-type")) h["Content-Type"] = "application/json"; }
  if (opc.form) { body = new URLSearchParams(opc.form).toString(); if (!Object.keys(h).some(k => k.toLowerCase() === "content-type")) h["Content-Type"] = "application/x-www-form-urlencoded"; }
  try {
    const r = await fetch(url, { method: opc.metodo || (body !== undefined ? "POST" : "GET"), headers: h, body, redirect: opc.redirecionar === false ? "manual" : "follow", signal: ctl.signal });
    if (opc.pote) { const sc = typeof r.headers.getSetCookie === "function" ? r.headers.getSetCookie() : (r.headers.get("set-cookie") || "").split(/,(?=\s*[^;,=\s]+=)/); for (const c of sc) { const m = String(c).match(/^\s*([^=;\s]+)=([^;]*)/); if (m) opc.pote.set(m[1], m[2]); } }
    const txt = await r.text(); let json = null; try { json = JSON.parse(txt); } catch (e) { json = null; }
    return { st: r.status, txt, json, h: r.headers };
  } catch (e) { falha(e && e.name === "AbortError" ? "Tempo esgotado" : "Falha de conexão"); }
  finally { clearTimeout(t); }
}
const q = (base, p) => base + (base.includes("?") ? "&" : "?") + new URLSearchParams(p).toString();
const bloqueio = r => { if (r.st === 403) falha("Bloqueado pelo site (403)"); if (r.st === 429) falha("Limite de consultas do site (429)"); };
const bool = (v, extra) => v === true ? (extra ? { st: SIM, extra } : SIM) : v === false ? NAO : falha("Resposta inesperada do site");
const firebase = (chave, origem) => async email => {
  const r = await req(q("https://identitytoolkit.googleapis.com/v1/accounts:createAuthUri", { key: chave }), { json: { identifier: email, continueUri: origem }, headers: { Origin: origem.replace(/\/[^/]*$/, ""), Referer: origem } });
  bloqueio(r); if (!r.json || typeof r.json.registered !== "boolean") falha("O site não informa cadastros (proteção contra enumeração)");
  return bool(r.json.registered);
};

/* hashes do Gravatar: SHA-256 (padrão atual) e MD5 (legado; o runtime da Cloudflare aceita MD5 no digest) */
async function hashHex(alg, s) { try { return [...new Uint8Array(await crypto.subtle.digest(alg, new TextEncoder().encode(s)))].map(b => b.toString(16).padStart(2, "0")).join(""); } catch (e) { return null; } }

export const SITES_EMAIL = {
  "Gravatar": { cat: "Redes e perfis", url: "https://gravatar.com", fn: async email => {
    const e = email.trim().toLowerCase(), hs = [await hashHex("SHA-256", e), await hashHex("MD5", e)].filter(Boolean);
    for (const h of hs) {
      const r = await req("https://www.gravatar.com/avatar/" + h + "?d=404", { headers: { Accept: "image/*" } });
      if (r.st === 200) {
        const extra = { foto: "https://www.gravatar.com/avatar/" + h + "?s=200" };
        const p = await req("https://api.gravatar.com/v3/profiles/" + hs[0]).catch(() => null);
        const d = p && p.st === 200 && p.json ? p.json : null;
        if (d) {
          if (d.display_name) extra.nome = d.display_name; if (d.location) extra.local = d.location; if (d.job_title) extra.cargo = d.job_title; if (d.company) extra.empresa = d.company;
          if (d.description) extra.bio = String(d.description).slice(0, 300); if (d.profile_url) extra.perfil = d.profile_url;
          if (Array.isArray(d.verified_accounts) && d.verified_accounts.length) extra.contas = d.verified_accounts.map(a => (a.service_label || a.service_type || "") + ": " + (a.url || "")).slice(0, 12).join(" · ");
        }
        return { st: SIM, extra, url: extra.perfil || "https://gravatar.com/" + h };
      }
      if (r.st !== 404) falha("HTTP " + r.st);
    }
    return NAO;
  } },
  "X (Twitter)": { cat: "Redes e perfis", url: "https://x.com", fn: async email => {
    const r = await req(q("https://api.x.com/i/users/email_available.json", { email }), { headers: { "User-Agent": UA_MOB, "x-twitter-client-language": "en", "x-twitter-active-user": "yes", Origin: "https://x.com" } });
    bloqueio(r); return bool(r.json && r.json.taken);
  } },
  "Instagram": { cat: "Redes e perfis", url: "https://instagram.com", fn: async email => {
    const pote = new Map(), h = { "User-Agent": UA_IOS };
    const r0 = await req("https://www.instagram.com/", { headers: Object.assign({ Accept: "text/html" }, h), pote });
    const csrf = pote.get("csrftoken") || ((r0.txt.match(/["']csrf_token["']\s*:\s*["']([^"']+)["']/) || [])[1]);
    if (!csrf) falha("Não foi possível obter o token do Instagram");
    const r = await req("https://www.instagram.com/api/v1/users/check_email/", { form: { email, sign_up_code: "" }, pote, headers: Object.assign({ "x-csrftoken": csrf, "x-ig-app-id": "936619743392459", "x-requested-with": "XMLHttpRequest", Origin: "https://www.instagram.com", Referer: "https://www.instagram.com/", Accept: "*/*" }, h) });
    if (r.st === 200 && r.json) { if (r.json.error_type === "email_is_taken") return SIM; if (r.json.available === true) return NAO; }
    if (r.st === 400 && r.json && r.json.spam === true) return NAO;
    bloqueio(r); falha("Resposta inesperada (HTTP " + r.st + ")");
  } },
  "Pinterest": { cat: "Redes e perfis", url: "https://pinterest.com", fn: async email => {
    const data = JSON.stringify({ options: { url: "/v3/register/exists/", data: { email } }, context: {} });
    const r = await req(q("https://www.pinterest.com/resource/ApiResource/get/", { source_url: "/signup/step1/", data, _: String(Date.now()) }), { headers: { "User-Agent": UA_MOB, Accept: "application/json, text/javascript, */*, q=0.01", "x-pinterest-pws-handler": "www/signup/[step].js", "x-app-version": "2503cde", "x-requested-with": "XMLHttpRequest", "x-pinterest-source-url": "/signup/step1/", "x-pinterest-appstate": "active", Origin: "https://www.pinterest.com", Referer: "https://www.pinterest.com/" } });
    bloqueio(r); return bool(r.json && r.json.resource_response && r.json.resource_response.data);
  } },
  "Microsoft 365 (corporativo ou escolar)": { cat: "Contas e serviços", url: "https://office.com", fn: async email => {
    const r = await req("https://outlook.office365.com/autodiscover/autodiscover.json/v1.0/" + encodeURIComponent(email) + "?Protocol=Autodiscoverv1", { headers: { "User-Agent": "Microsoft Office/16.0 (Windows NT 10.0; Microsoft Outlook 16.0.12026; Pro)", Accept: "application/json" }, redirecionar: false });
    bloqueio(r); return r.st === 200 ? SIM : NAO;
  } },
  "Apple (ID Apple)": { cat: "Contas e serviços", url: "https://account.apple.com", fn: async email => {
    const r = await req("https://idmsa.apple.com/appleauth/auth/federate?isRememberMeEnabled=false", { json: { accountName: email, rememberMe: false }, headers: { Accept: "application/json, text/javascript, */*; q=0.01", "X-Apple-Domain-Id": "2", "X-Apple-Locale": "en_us", "X-Apple-Auth-Context": "tv", "X-Requested-With": "XMLHttpRequest", Origin: "https://idmsa.apple.com", Referer: "https://idmsa.apple.com/" } });
    bloqueio(r); if (r.st !== 200 || !r.json) falha("HTTP " + r.st); return "primaryAuthOptions" in r.json ? SIM : NAO;
  } },
  "Adobe": { cat: "Contas e serviços", url: "https://adobe.com", fn: async email => {
    const r = await req("https://auth.services.adobe.com/signin/v2/users/accounts", { json: { username: email, usernameType: "EMAIL" }, headers: { "User-Agent": UA_MOB, "x-ims-clientid": "BehanceWebSusi1", Origin: "https://auth.services.adobe.com", Referer: "https://www.behance.net/" } });
    bloqueio(r); if (!Array.isArray(r.json)) falha("Resposta inesperada (HTTP " + r.st + ")"); return r.json.length ? SIM : NAO;
  } },
  "Dropbox": { cat: "Contas e serviços", url: "https://dropbox.com", fn: async email => {
    const pote = new Map(), h = { "User-Agent": "Mozilla/5.0 (X11; Linux x86_64; rv:150.0) Gecko/20100101 Firefox/150.0", Referer: "https://www.dropbox.com", Origin: "https://www.dropbox.com" };
    await req("https://www.dropbox.com", { headers: Object.assign({ Accept: "text/html" }, h), pote });
    const t = pote.get("t"); if (!t) falha("Não foi possível obter o token do Dropbox");
    const r = await req("https://www.dropbox.com/2/account/check_user_with_email_exists", { json: { email }, pote, headers: Object.assign({ "X-CSRF-Token": t }, h) });
    bloqueio(r); if (r.st !== 200 || !r.json) falha("HTTP " + r.st);
    if (r.json.exists === true) return SIM;
    if (r.json.exists_as_recovery_email === true) return { st: SIM, extra: { observacao: "cadastrado como e-mail de recuperação de outra conta" } };
    return bool(r.json.exists);
  } },
  "Firefox (Conta Mozilla)": { cat: "Contas e serviços", url: "https://accounts.firefox.com", fn: async email => {
    const r = await req("https://api.accounts.firefox.com/v1/account/status", { json: { email } });
    bloqueio(r); return bool(r.json && r.json.exists);
  } },
  "WordPress.com": { cat: "Contas e serviços", url: "https://wordpress.com", fn: async email => {
    const r = await req("https://public-api.wordpress.com/rest/v1.1/users/" + encodeURIComponent(email) + "/auth-options?http_envelope=1", { headers: { Referer: "https://public-api.wordpress.com/wp-admin/rest-proxy/?v=2.0" } });
    bloqueio(r); const d = r.json || {}, err = d.body && d.body.error;
    if (d.code === 200) return SIM; if (d.code === 403 && err === "email_login_not_allowed") return SIM; if (d.code === 404 && err === "unknown_user") return NAO;
    falha("Resposta inesperada do WordPress");
  } },
  "Wix": { cat: "Contas e serviços", url: "https://wix.com", fn: async email => {
    const r = await req("https://users.wix.com/wix-users/v1/userAccountsByEmail", { json: { email }, headers: { "x-wix-client-artifact-id": "login-react-app", Origin: "https://users.wix.com", Referer: "https://users.wix.com/signin/signup" } });
    if (r.st === 200 && r.json && Array.isArray(r.json.accountsData) && r.json.accountsData.length) return SIM; if (r.st === 404) return NAO;
    bloqueio(r); falha("HTTP " + r.st);
  } },
  "Zoho": { cat: "Contas e serviços", url: "https://zoho.com", fn: async email => {
    const pote = new Map(), h = { Origin: "https://accounts.zoho.com", Referer: "https://accounts.zoho.com/", Accept: "*/*" };
    await req("https://accounts.zoho.com/signin", { headers: Object.assign({}, h, { Accept: "text/html" }), pote });
    const c = pote.get("iamcsr"); if (!c) falha("Não foi possível obter o token do Zoho");
    const r = await req("https://accounts.zoho.com/signin/v2/lookup/" + encodeURIComponent(email), { form: { mode: "primary", servicename: "ZohoCRM", serviceurl: "https://crm.zoho.com/crm/ShowHomePage.do", service_language: "en" }, pote, headers: Object.assign({ "X-ZCSRF-TOKEN": "iamcsrcoo=" + c, "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8" }, h) });
    bloqueio(r); const d = r.json || {};
    if (d.status_code === 201 || d.message === "User exists" || /User exists in another DC/.test(d.message || "")) return SIM; if (d.status_code === 400) return NAO;
    falha("Resposta inesperada do Zoho");
  } },
  "Hugging Face": { cat: "Contas e serviços", url: "https://huggingface.co", fn: async email => {
    const r = await req("https://huggingface.co/api/check-user-email", { json: { email }, headers: { Referer: "https://huggingface.co/join" } });
    bloqueio(r); if (r.txt.includes("already exists")) return SIM; if (r.txt.includes("This email address is available.")) return NAO; falha("HTTP " + r.st);
  } },
  "HackerRank": { cat: "Contas e serviços", url: "https://hackerrank.com", fn: async email => {
    const r = await req("https://www.hackerrank.com/auth/valid_email", { json: { email }, headers: { Origin: "https://www.hackerrank.com", Referer: "https://www.hackerrank.com/" } });
    bloqueio(r); if (r.st !== 200 || !r.json) falha("HTTP " + r.st); const d = r.json;
    if (d.internal_status_code === "already_registered" || /already registered/i.test(String(d.errors || ""))) return SIM; if (d.status === true) return NAO; falha("Resposta inesperada do HackerRank");
  } },
  "Any.do": { cat: "Contas e serviços", url: "https://any.do", fn: async email => {
    const r = await req("https://sm-prod2.any.do/check_email", { json: { email }, headers: { "Content-Type": "application/json; charset=UTF-8", Origin: "https://desktop.any.do", Referer: "https://desktop.any.do/" } });
    bloqueio(r); return bool(r.json && r.json.user_exists);
  } },
  "Spotify": { cat: "Entretenimento", url: "https://spotify.com", fn: async email => {
    const r = await req("https://spclient.wg.spotify.com/signup/public/v2/account/validate", { json: { fields: [{ field: "FIELD_EMAIL", value: email }], client_info: { api_key: "a1e486e2729f46d6bb368d6b2bcda326", app_version: "v2", capabilities: [1], installation_id: crypto.randomUUID(), platform: "www", client_id: "" }, tracking: { creation_flow: "", creation_point: "https://www.spotify.com/us/signup", referrer: "", origin_vertical: "", origin_surface: "" } }, headers: { Origin: "https://www.spotify.com", Referer: "https://www.spotify.com/" } });
    bloqueio(r); const d = r.json || {}; if (d.error && JSON.stringify(d.error).includes("already_exists")) return SIM; if ("success" in d) return NAO; falha("Resposta inesperada do Spotify");
  } },
  "Deezer": { cat: "Entretenimento", url: "https://deezer.com", fn: async email => {
    const pote = new Map(), h = { "Content-Type": "text/plain;charset=UTF-8", Origin: "https://account.deezer.com", Referer: "https://account.deezer.com/" }, gw = "https://www.deezer.com/ajax/gw-light.php";
    const r0 = await req(q(gw, { method: "deezer.getUserData", input: "3", api_version: "1.0", api_token: "" }), { body: JSON.stringify({ APP_NAME: "Deezer" }), headers: h, pote });
    const tok = r0.json && r0.json.results && r0.json.results.checkForm; if (!tok) falha("Não foi possível obter o token do Deezer");
    const r = await req(q(gw, { method: "user_checkRegisterConstraints", input: "3", api_version: "1.0", api_token: tok }), { body: JSON.stringify({ APP_NAME: "Deezer", EMAIL: email }), headers: h, pote });
    bloqueio(r); const res = r.json && r.json.results; if (!res || typeof res !== "object" || !("errors" in res)) falha("Resposta inesperada do Deezer");
    const e = ((res.errors || {}).email || {}).error; return e === "email_already_used" ? SIM : NAO;
  } },
  "Disney (Disney+, ESPN)": { cat: "Entretenimento", url: "https://disneyplus.com", fn: async email => {
    const r = await req("https://registerdisney.go.com/jgc/v8/client/ESPN-ONESITE.WEB-PROD/guest-flow?langPref=en&feature=no-password-reuse", { json: { email }, headers: { Origin: "https://cdn.registerdisney.go.com", Referer: "https://cdn.registerdisney.go.com/" } });
    bloqueio(r); const f = r.json && r.json.data && r.json.data.guestFlow; if (f === "LOGIN_FLOW") return SIM; if (f === "REGISTRATION_FLOW") return NAO; falha("Resposta inesperada da Disney");
  } },
  "JustWatch": { cat: "Entretenimento", url: "https://justwatch.com", fn: firebase("AIzaSyDv6JIzdDvbTBS-JWdR4Kl22UvgWGAyuo8", "https://www.justwatch.com/") },
  "MyAnimeList": { cat: "Entretenimento", url: "https://myanimelist.net", fn: async email => {
    const r = await req("https://myanimelist.net/signup/email/validate", { form: { email }, headers: { "x-requested-with": "XMLHttpRequest", Origin: "https://myanimelist.net", Referer: "https://myanimelist.net/register.php?" } });
    bloqueio(r); const d = r.json || {}; if ((d.errors || []).some(e => /already have an account/.test(e.message || ""))) return SIM; if (Array.isArray(d.data) && !d.data.length) return NAO; falha("HTTP " + r.st);
  } },
  "Rappi": { cat: "Compras e serviços", url: "https://rappi.com.br", fn: async email => {
    const ts = String(Date.now());
    const r = await req("https://services.rappi.com.ar/api/rocket/user/account/check-email", { json: { email }, timeout: 10, headers: { "User-Agent": "okhttp/4.12.0", user_id: "", custom_country_code: "AR", deviceid: hex(), "app-version": "88721", "app-version-name": "8.35.20260724-88721", "store-platform": "google", "amplitude-session-id": ts, timestamp: ts, request_timestamp: ts, language: "en", "country-code": "AR", "content-type": "application/json; charset=UTF-8" } });
    bloqueio(r); return bool(r.json && r.json.exists);
  } },
  "Eventbrite": { cat: "Compras e serviços", url: "https://eventbrite.com", fn: async email => {
    const pote = new Map(), h = { Accept: "*/*", Referer: "https://www.eventbrite.com/signin/", "X-Requested-With": "XMLHttpRequest", Origin: "https://www.eventbrite.com" };
    await req("https://www.eventbrite.com/signin/", { headers: Object.assign({}, h, { Accept: "text/html" }), pote });
    const c = pote.get("csrftoken"); if (!c) falha("Não foi possível obter o token do Eventbrite");
    const r = await req("https://www.eventbrite.com/api/v3/users/lookup/", { json: { email }, pote, headers: Object.assign({ "X-CSRFToken": c }, h) });
    bloqueio(r); return bool(r.json && r.json.exists);
  } },
  "Skyscanner": { cat: "Viagens e esportes", url: "https://skyscanner.com.br", fn: async email => {
    const r = await req("https://mobile.ds.skyscanner.net/g/traveller-auth-service/accounts/v2/search", { json: { email }, headers: { Origin: "https://www.skyscanner.net", "x-skyscanner-client": "skyscanner_android_app", "x-skyscanner-client-version": "7.198", "x-skyscanner-client-type": "net.skyscanner.android.main", "x-skyscanner-authenticated": "false", "x-skyscanner-device-os-type": "Android", "x-skyscanner-device-os-version": "11", "x-skyscanner-device": "Android-phone", "x-skyscanner-device-class": "phone", "x-skyscanner-client-network-type": "WIFI", "x-skyscanner-currency": "USD", "x-skyscanner-locale": "en-US", "x-skyscanner-market": "US", "content-type": "application/json; charset=UTF-8" } });
    const d = r.json || {};
    if (r.st === 200 && Array.isArray(d.providers) && d.providers.length) return SIM; if (r.st === 404 && (d.code === 404 || /Not Found/.test(d.message || ""))) return NAO;
    bloqueio(r); falha("HTTP " + r.st);
  } },
  "Komoot": { cat: "Viagens e esportes", url: "https://komoot.com", fn: async email => {
    const r = await req("https://www.komoot.com/v1/signin", { json: { email, reason: "header", new_tab: false }, headers: { Origin: "https://www.komoot.com", Referer: "https://www.komoot.com/signin?referrer=www.google.com&reason=header" } });
    bloqueio(r); const t = r.json && r.json.type; if (t === "login") return SIM; if (t === "register") return NAO; falha("HTTP " + r.st);
  } },
  "MyFitnessPal": { cat: "Viagens e esportes", url: "https://myfitnesspal.com", fn: async email => {
    const r = await req(q("https://www.myfitnesspal.com/api/idm/user-exists", { email }), { headers: { Referer: "https://www.myfitnesspal.com/account/create" } });
    bloqueio(r); return bool(r.json && r.json.emailExists);
  } },
  "Chess.com": { cat: "Viagens e esportes", url: "https://chess.com", fn: async email => {
    const r = await req("https://www.chess.com/rpc/chesscom.authentication.v1.EmailValidationService/Validate", { json: { email }, headers: { "connect-protocol-version": "1", Origin: "https://www.chess.com", Referer: "https://www.chess.com/register" } });
    bloqueio(r); const s = r.json && r.json.status; if (s === "EMAIL_STATUS_TAKEN") return SIM; if (s === "EMAIL_STATUS_AVAILABLE") return NAO; falha("HTTP " + r.st);
  } },
  "Duolingo": { cat: "Educação", url: "https://duolingo.com", fn: async email => {
    const r = await req(q("https://www.duolingo.com/2017-06-30/users", { email }), { headers: { Referer: "https://www.duolingo.com/" } });
    bloqueio(r); if (r.st !== 200 || !r.json) falha("HTTP " + r.st); const u = (r.json.users || [])[0];
    if (!u) return NAO; const extra = {}; if (u.name) extra.nome = u.name; if (u.username) extra.usuario = u.username;
    return { st: SIM, extra, url: u.username ? "https://www.duolingo.com/profile/" + encodeURIComponent(u.username) : "https://duolingo.com" };
  } },
  "Coursera": { cat: "Educação", url: "https://coursera.org", fn: async email => {
    const r = await req(q("https://www.coursera.org/api/userAccounts.v1", { action: "getLoginMethods", email }), { json: {}, headers: { Accept: "application/json", "X-Requested-With": "XMLHttpRequest", "X-Coursera-Application": "front-page", Origin: "https://www.coursera.org", Referer: "https://www.coursera.org/?authMode=signup" } });
    bloqueio(r); const m = r.json && r.json.loginMethods; if (!Array.isArray(m)) falha("HTTP " + r.st); return m.length ? SIM : NAO;
  } },
};

export async function verificarEmail(nome, email) {
  const s = SITES_EMAIL[nome], t0 = Date.now();
  try {
    const r = await s.fn(email), o = typeof r === "string" ? { st: r } : r;
    return { site: nome, cat: s.cat, url: o.url || s.url, status: o.st, extra: o.extra || null, ms: Date.now() - t0 };
  } catch (e) {
    return { site: nome, cat: s.cat, url: s.url, status: "desconhecido", detalhe: e instanceof Indefinido ? e.message : "Erro: " + String(e && e.message || e).slice(0, 120), ms: Date.now() - t0 };
  }
}

/* ------------------------------------------------------------------ fontes públicas complementares */
const LIVRES = { "gmail.com": "Google (Gmail)", "googlemail.com": "Google (Gmail)", "hotmail.com": "Microsoft (Outlook/Hotmail)", "outlook.com": "Microsoft (Outlook)", "live.com": "Microsoft (Live)", "msn.com": "Microsoft (MSN)", "hotmail.com.br": "Microsoft (Hotmail)", "outlook.com.br": "Microsoft (Outlook)", "yahoo.com": "Yahoo", "yahoo.com.br": "Yahoo", "ymail.com": "Yahoo", "icloud.com": "Apple (iCloud)", "me.com": "Apple (iCloud)", "mac.com": "Apple (iCloud)", "bol.com.br": "BOL (UOL)", "uol.com.br": "UOL", "terra.com.br": "Terra", "ig.com.br": "iG", "globo.com": "Globo", "globomail.com": "Globo", "r7.com": "R7", "protonmail.com": "Proton", "proton.me": "Proton", "pm.me": "Proton", "tutanota.com": "Tuta", "zoho.com": "Zoho", "gmx.com": "GMX", "aol.com": "AOL", "yandex.com": "Yandex", "mail.ru": "Mail.ru" };
function provedorMx(hosts) {
  const h = hosts.join(" ").toLowerCase();
  if (/google\.com|googlemail/.test(h)) return "Google Workspace"; if (/outlook\.com|protection\.outlook/.test(h)) return "Microsoft 365";
  if (/zoho/.test(h)) return "Zoho Mail"; if (/protonmail|proton\.ch/.test(h)) return "Proton Mail"; if (/secureserver/.test(h)) return "GoDaddy";
  if (/hostinger/.test(h)) return "Hostinger"; if (/locaweb/.test(h)) return "Locaweb"; if (/kinghost/.test(h)) return "KingHost"; if (/uol\.com\.br|uolhost/.test(h)) return "UOL Host";
  if (/mimecast/.test(h)) return "Mimecast"; if (/pphosted|proofpoint/.test(h)) return "Proofpoint"; if (/icloud/.test(h)) return "Apple iCloud"; if (/yahoodns/.test(h)) return "Yahoo";
  return "";
}
export async function extrasEmail(email, env) {
  const dominio = email.split("@")[1].toLowerCase(), out = { dominio, livre: LIVRES[dominio] || "" };
  const tarefas = [];
  tarefas.push((async () => {
    try {
      const r = await req("https://cloudflare-dns.com/dns-query?name=" + encodeURIComponent(dominio) + "&type=MX", { headers: { Accept: "application/dns-json" }, timeout: 8 });
      const mx = ((r.json && r.json.Answer) || []).filter(a => a.type === 15).map(a => String(a.data).split(" ").pop().replace(/\.$/, ""));
      out.mx = mx; out.provedor = out.livre || provedorMx(mx) || (mx.length ? "servidor próprio ou outro provedor" : "");
      out.aceitaEmail = mx.length > 0;
    } catch (e) { out.mx = null; }
  })());
  if (!out.livre) tarefas.push((async () => {
    try {
      const base = /\.br$/.test(dominio) ? "https://rdap.registro.br/domain/" : "https://rdap.org/domain/";
      const r = await req(base + encodeURIComponent(dominio), { headers: { Accept: "application/rdap+json, application/json" }, timeout: 10 });
      if (r.st !== 200 || !r.json) { out.rdap = { erro: r.st === 404 ? "domínio não encontrado no registro" : "registro indisponível (HTTP " + r.st + ")" }; return; }
      const d = r.json, ev = {}; (d.events || []).forEach(e => { ev[e.eventAction] = (e.eventDate || "").slice(0, 10); });
      const ent = []; (function cole(lista) { (lista || []).forEach(e => { const fn = ((e.vcardArray || [])[1] || []).find(v => v[0] === "fn"); const doc = (e.publicIds || []).map(p => p.type + " " + p.identifier).join(", "); if (fn || doc) ent.push(((e.roles || []).join("/") || "entidade") + ": " + [fn && fn[3], doc].filter(Boolean).join(" · ")); cole(e.entities); }); })(d.entities);
      out.rdap = { fonte: /\.br$/.test(dominio) ? "Registro.br (RDAP)" : "RDAP", registro: ev.registration || "", expiracao: ev.expiration || "", alteracao: ev["last changed"] || "", entidades: ent.slice(0, 8), servidores: (d.nameservers || []).map(n => n.ldhName).slice(0, 4), url: base + dominio };
    } catch (e) { out.rdap = { erro: e.message || "registro indisponível" }; }
  })());
  tarefas.push((async () => {
    try { const r = await req("https://keys.openpgp.org/vks/v1/by-email/" + encodeURIComponent(email), { headers: { Accept: "application/pgp-keys" }, timeout: 8 }); out.pgp = r.st === 200 ? { publicada: true, url: "https://keys.openpgp.org/search?q=" + encodeURIComponent(email) } : { publicada: false }; }
    catch (e) { out.pgp = null; }
  })());
  tarefas.push((async () => {
    try {
      const h = { Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28", "User-Agent": "hub-tpc-pesquisa" };
      if (env && env.GITHUB_TOKEN) h.Authorization = "Bearer " + env.GITHUB_TOKEN;
      const r = await req("https://api.github.com/search/commits?per_page=20&q=" + encodeURIComponent("author-email:" + email), { headers: h, timeout: 10 });
      if (r.st !== 200 || !r.json) { out.github = { erro: "GitHub indisponível (HTTP " + r.st + ")" }; return; }
      const contas = new Map(), repos = new Set(), nomes = new Set();
      (r.json.items || []).forEach(it => { if (it.author && it.author.login) contas.set(it.author.login, it.author.html_url); if (it.repository) repos.add(it.repository.full_name); if (it.commit && it.commit.author && it.commit.author.name) nomes.add(it.commit.author.name); });
      out.github = { commits: r.json.total_count || 0, contas: [...contas].map(([l, u]) => ({ login: l, url: u })), nomes: [...nomes].slice(0, 5), repositorios: [...repos].slice(0, 8) };
    } catch (e) { out.github = { erro: e.message || "GitHub indisponível" }; }
  })());
  await Promise.all(tarefas);
  return out;
}
