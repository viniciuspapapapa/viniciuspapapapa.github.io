/* Porte da lógica de verificação do Sherlock (github.com/sherlock-project/sherlock, licença MIT) para JavaScript.
   Reproduz sherlock_project/sherlock.py: interpolação do usuário, regexCheck (ILEGAL), urlProbe, request_method e
   request_payload, cabeçalhos, HEAD para status_code, redirecionamento desligado para response_url, detecção de WAF e
   as três regras de decisão (message, status_code e response_url), além das exclusões de falso positivo e do NSFW. */

export const UA = "Mozilla/5.0 (X11; Linux x86_64; rv:129.0) Gecko/20100101 Firefox/129.0";
export const WAF = [
  ".loading-spinner{visibility:hidden}body.no-js .challenge-running{display:none}body.dark{background-color:#222;color:#d9d9d9}body.dark a{color:#fff}body.dark a:hover{color:#ee730a;text-decoration:underline}body.dark .lds-ring div{border-color:#999 transparent transparent}body.dark .font-red{color:#b20f03}body.dark",
  '<span id="challenge-error-text">',
  "AwsWafIntegration.forceRefreshToken",
  '{return l.onPageView}}),Object.defineProperty(r,"perimeterxIdentifiers",{enumerable:'
];
export const SIMBOLOS = ["_", "-", "."];

export function interpolar(v, u) {
  if (typeof v === "string") return v.split("{}").join(u);
  if (Array.isArray(v)) return v.map(x => interpolar(x, u));
  if (v && typeof v === "object") { const o = {}; for (const k of Object.keys(v)) o[k] = interpolar(v[k], u); return o; }
  return v;
}
/* "{?}" gera as variações com "_", "-" e "." (multiple_usernames) */
export function variacoes(u) { return u.includes("{?}") ? SIMBOLOS.map(s => u.split("{?}").join(s)) : [u]; }

/* regexCheck em sintaxe Python: converte as diferenças mais comuns; se não for possível, a verificação é ignorada */
const cacheRe = new Map();
function regex(src) {
  if (cacheRe.has(src)) return cacheRe.get(src);
  let flags = "", s = src;
  const m = /^\(\?([aiLmsux]+)\)/.exec(s); if (m) { s = s.slice(m[0].length); if (m[1].includes("i")) flags += "i"; if (m[1].includes("s")) flags += "s"; if (m[1].includes("m")) flags += "m"; }
  s = s.replace(/\\Z/g, "$").replace(/\\A/g, "^").replace(/\(\?P</g, "(?<").replace(/\(\?P=(\w+)\)/g, "\\k<$1>");
  let re = null; try { re = new RegExp(s, flags + "u"); } catch (e) { try { re = new RegExp(s, flags); } catch (e2) { re = null; } }
  cacheRe.set(src, re); return re;
}

/* manifesto: sites do data.json sem as exclusões; NSFW só quando pedido */
export function manifesto(dados, exclusoes) {
  const excl = new Set(exclusoes || []), out = {};
  for (const [nome, s] of Object.entries(dados)) { if (nome === "$schema" || excl.has(nome) || !s || !s.url) continue; out[nome] = s; }
  return out;
}

/* verifica um site; devolve { site, url, status, http, ms, contexto }
   status: "encontrado" (CLAIMED), "disponivel" (AVAILABLE), "ilegal" (ILLEGAL), "waf" (WAF) ou "desconhecido" (UNKNOWN) */
export async function verificar(nome, info, usuario, opc) {
  opc = opc || {};
  const t0 = Date.now(), url = interpolar(info.url, usuario.replace(/ /g, "%20"));
  const base = { site: nome, url, urlMain: info.urlMain || "" };
  if (info.regexCheck) { const re = regex(info.regexCheck); if (re && !re.test(usuario)) return Object.assign(base, { status: "ilegal", url: "", http: "", ms: 0 }); }
  const tipos = Array.isArray(info.errorType) ? info.errorType : [info.errorType];
  const probe = info.urlProbe ? interpolar(info.urlProbe, usuario) : url;
  const metodo = info.request_method || (tipos.length === 1 && tipos[0] === "status_code" ? "HEAD" : "GET");
  const payload = info.request_payload != null ? interpolar(info.request_payload, usuario) : null;
  const headers = Object.assign({ "User-Agent": UA }, info.headers || {});
  if (payload != null) headers["Content-Type"] = "application/json";
  const ctl = new AbortController(), tmr = setTimeout(() => ctl.abort(), (opc.timeout || 20) * 1000);
  let r, texto = "";
  try {
    r = await (opc.fetch || fetch)(probe, { method: metodo, headers, body: payload != null ? JSON.stringify(payload) : undefined, redirect: tipos.includes("response_url") ? "manual" : "follow", signal: ctl.signal });
    if (metodo !== "HEAD") texto = await lerTexto(r, opc.limite || 600000);
  } catch (e) {
    clearTimeout(tmr);
    return Object.assign(base, { status: "desconhecido", http: "?", ms: Date.now() - t0, contexto: e && e.name === "AbortError" ? "Tempo esgotado" : "Erro de conexão" });
  }
  clearTimeout(tmr);
  const http = r.status;
  let status = "desconhecido", contexto = null;
  let cods = info.errorCode; if (typeof cods === "number") cods = [cods];
  if (WAF.some(w => texto.includes(w))) status = "waf";
  /* refinamento do HUB: bloqueio (401, 403), limite de requisições (429) e falhas do servidor (5xx) não provam nada; o Sherlock original
     os classificaria pela regra do site, o que gera falsos positivos e negativos */
  else if ((http === 401 || http === 403 || http === 429 || http >= 500) && !(cods && cods.includes(http))) { status = "desconhecido"; contexto = http === 429 ? "Limite de requisições do site" : http >= 500 ? "Erro do servidor do site (" + http + ")" : "Acesso bloqueado pelo site (" + http + ")"; }
  else if (tipos.some(t => !["message", "status_code", "response_url"].includes(t))) contexto = "Tipo de erro desconhecido: " + tipos.join(", ");
  else {
    if (tipos.includes("message")) {
      const erros = Array.isArray(info.errorMsg) ? info.errorMsg : [info.errorMsg];
      status = erros.some(e => e != null && texto.includes(e)) ? "disponivel" : "encontrado";
    }
    if (tipos.includes("status_code") && status !== "disponivel") {
      let cod = info.errorCode; if (typeof cod === "number") cod = [cod];
      status = "encontrado";
      if (cod && cod.includes(http)) status = "disponivel"; else if (http >= 300 || http < 200) status = "disponivel";
    }
    if (tipos.includes("response_url") && status !== "disponivel") status = http >= 200 && http < 300 ? "encontrado" : "disponivel";
  }
  return Object.assign(base, { status, http, ms: Date.now() - t0, contexto });
}

async function lerTexto(r, limite) {
  if (!r.body) return "";
  const leitor = r.body.getReader(), dec = new TextDecoder("utf-8", { fatal: false }); let out = "", n = 0;
  while (true) {
    const { done, value } = await leitor.read(); if (done) break;
    n += value.length; out += dec.decode(value, { stream: true });
    if (n >= limite) { try { await leitor.cancel(); } catch (e) { /* encerra a leitura */ } break; }
  }
  return out + dec.decode();
}
