/* Serviço intermediário da busca de perfis do HUB TPC (Cloudflare Worker "sherlock-tpc").
   O navegador não pode ler as respostas de outros sites (CORS); este serviço faz as consultas do Sherlock e devolve
   apenas o resultado de cada site. Não guarda nada e só consulta os sites do manifesto do Sherlock.

   Variáveis (Cloudflare, Settings, Variables and Secrets):
     ALLOWED_ORIGIN  (texto)   https://viniciuspapapapa.github.io
     APP_TOKEN       (segredo) opcional; quando definido, o HUB precisa enviar o mesmo valor em X-App-Token
     GITHUB_TOKEN    (segredo) opcional; token do GitHub (Actions: Read and write) para o botão "Atualizar base" da
                     Pesquisa doutrinária */
import DADOS from "./data.json" with { type: "json" };
import EXCLUSOES from "./exclusoes.json" with { type: "json" };
import { manifesto, verificar } from "./sherlock.js";
import { publico } from "./publico.js";
import { doutrina, doutrinaPdf } from "./doutrina.js";
import { SITES_EMAIL, verificarEmail, extrasEmail } from "./email.js";

const SITES = manifesto(DADOS, EXCLUSOES);
const MAX_LOTE = 8;

export default {
  async fetch(req, env) {
    const origem = req.headers.get("Origin") || "", permitida = env.ALLOWED_ORIGIN || "*";
    const cors = { "Access-Control-Allow-Origin": permitida === "*" ? "*" : permitida, "Access-Control-Allow-Methods": "GET, POST, OPTIONS", "Access-Control-Allow-Headers": "Content-Type, X-App-Token, X-Transparencia-Chave", "Access-Control-Max-Age": "86400", "Vary": "Origin" };
    const json = (o, st) => new Response(JSON.stringify(o), { status: st || 200, headers: Object.assign({ "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" }, cors) });
    if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
    const p = new URL(req.url).pathname.replace(/\/+$/, "") || "/";
    if (p === "/" || p === "/status") return json({ ok: true, servico: "sherlock", versao: 4, sites: Object.keys(SITES).length, publico: ["transparencia", "djen", "diarios", "email"], emailSites: Object.keys(SITES_EMAIL).length, doutrina: !!env.GITHUB_TOKEN });
    if (permitida !== "*" && origem && origem !== permitida) return json({ erro: "Origem não autorizada." }, 403);
    if (env.APP_TOKEN && req.headers.get("X-App-Token") !== env.APP_TOKEN) return json({ erro: "Token inválido." }, 401);

    if (p.startsWith("/publico/")) { const r = await publico(p, new URL(req.url), req, env); if (r) return json(r.corpo, r.st); }
    if (p.startsWith("/publico/email")) {
      const valido = e => /^[^\s@]{1,64}@[^\s@]+\.[^\s@]{2,}$/.test(e) && e.length <= 254;
      if (p === "/publico/email/sites") return json({ sites: Object.entries(SITES_EMAIL).map(([nome, s]) => ({ nome, cat: s.cat, url: s.url })) });
      if (p === "/publico/email/extras") { const e = String(new URL(req.url).searchParams.get("email") || "").trim(); if (!valido(e)) return json({ erro: "E-mail inválido." }, 400); return json(await extrasEmail(e, env)); }
      if (p === "/publico/email" && req.method === "POST") {
        let c; try { c = await req.json(); } catch (x) { return json({ erro: "JSON inválido." }, 400); }
        const e = String(c.email || "").trim(); if (!valido(e)) return json({ erro: "E-mail inválido." }, 400);
        const nomes = (Array.isArray(c.sites) ? c.sites : []).filter(n => SITES_EMAIL[n]).slice(0, 6);
        if (!nomes.length) return json({ erro: "Nenhum site válido no lote." }, 400);
        return json({ email: e, resultados: await Promise.all(nomes.map(n => verificarEmail(n, e))) });
      }
    }
    if (p === "/doutrina/pdf") return doutrinaPdf(new URL(req.url), env, Object.assign({ "Access-Control-Expose-Headers": "Content-Length" }, cors));
    if (p.startsWith("/doutrina/")) { const r = await doutrina(p, req, env); if (r) return json(r.corpo, r.st); }
    if (p === "/sites") return json({ sites: Object.entries(SITES).map(([nome, s]) => ({ nome, urlMain: s.urlMain || "", url: s.url, nsfw: !!s.isNSFW, tipo: s.errorType })) });

    if (p === "/verificar" && req.method === "POST") {
      let corpo; try { corpo = await req.json(); } catch (e) { return json({ erro: "JSON inválido." }, 400); }
      const usuario = String(corpo.usuario || "").trim();
      if (!usuario || usuario.length > 100) return json({ erro: "Informe o nome de usuário." }, 400);
      const nomes = (Array.isArray(corpo.sites) ? corpo.sites : []).filter(n => SITES[n]).slice(0, MAX_LOTE);
      if (!nomes.length) return json({ erro: "Nenhum site válido no lote." }, 400);
      const timeout = Math.min(30, Math.max(5, +corpo.timeout || 20));
      const resultados = await Promise.all(nomes.map(n => verificar(n, SITES[n], usuario, { timeout }).catch(e => ({ site: n, url: "", status: "desconhecido", http: "?", ms: 0, contexto: String(e && e.message || e).slice(0, 120) }))));
      return json({ usuario, resultados });
    }
    return json({ erro: "Rota não encontrada." }, 404);
  }
};
