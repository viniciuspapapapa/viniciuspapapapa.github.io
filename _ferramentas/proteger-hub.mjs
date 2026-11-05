/* Publica o HUB protegido: lê as fontes em _hub/ (não publicadas pelo GitHub Pages, que ignora pastas iniciadas
   por "_") e grava em hub/ as páginas criptografadas com AES-256-GCM. A chave deriva da senha do escritório
   (PBKDF2-SHA256, 600 mil iterações). Os scripts e estilos locais são incorporados ao HTML antes da cifra; modelos
   (.pdf, .docx) são cifrados à parte e decifrados em tempo de execução. Fontes e imagens da marca são públicas.

   Uso: HUB_SENHA='senha do escritório' node _ferramentas/proteger-hub.mjs

   Configurações das integrações, incorporadas somente às páginas cifradas (nunca às fontes do repositório público):
     HUB_DATAJUD_URL        endereço do serviço intermediário do DataJud (padrão: datajud-tpc do escritório)
     HUB_DATAJUD_TOKEN      senha do serviço (APP_TOKEN do Worker); se ausente, usa HUB_SENHA
     HUB_OUTLOOK_CLIENT_ID  ID do aplicativo registrado no Microsoft Entra ID para o envio pelo Outlook
     HUB_OUTLOOK_TENANT     diretório do Microsoft 365 (padrão: common) */
import { promises as fs } from "node:fs";
import path from "node:path";
import { webcrypto as wc } from "node:crypto";

const RAIZ = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const FONTE = path.join(RAIZ, "_hub"), SAIDA = path.join(RAIZ, "hub");
const ITERACOES = 600000;
const CIFRAR_BINARIOS = /\.(pdf|docx)$/i;
const PUBLICOS = /\.(ttf|otf|woff2?|png|svg|jpe?g|ico|txt)$/i;
const NAO_PUBLICAR = /(^|\/)README\.md$|\.(js|css)$/i;

const senha = process.env.HUB_SENHA || "";
if (senha.length < 10) { console.error("Defina HUB_SENHA com pelo menos 10 caracteres."); process.exit(1); }

const CONFIG = {
  datajud: { url: process.env.HUB_DATAJUD_URL || "https://datajud-tpc.viniciuspapapapa.workers.dev", token: process.env.HUB_DATAJUD_TOKEN || senha },
  outlook: { clientId: process.env.HUB_OUTLOOK_CLIENT_ID || "", tenant: process.env.HUB_OUTLOOK_TENANT || "common" }
};
const SCRIPT_CONFIG = "<script>window.HUB_CONFIG=" + JSON.stringify(CONFIG).replace(/</g, "\\u003c") + ";</script>";

const b64 = u => Buffer.from(u).toString("base64");
const de64 = s => new Uint8Array(Buffer.from(s, "base64"));
async function derivar(sal) {
  const base = await wc.subtle.importKey("raw", new TextEncoder().encode(senha), "PBKDF2", false, ["deriveKey"]);
  return wc.subtle.deriveKey({ name: "PBKDF2", salt: sal, iterations: ITERACOES, hash: "SHA-256" }, base, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
}
async function cifrar(chave, dados) {
  const iv = wc.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await wc.subtle.encrypt({ name: "AES-GCM", iv }, chave, dados));
  const out = new Uint8Array(12 + ct.length); out.set(iv); out.set(ct, 12); return out;
}

/* reaproveita o sal quando a senha não mudou, para não encerrar as sessões abertas */
let sal = null;
try {
  const cfg = JSON.parse(await fs.readFile(path.join(SAIDA, "acesso.json"), "utf8"));
  const k = await (async () => { const s = de64(cfg.sal); return { s, k: await derivar(s) }; })();
  const v = de64(cfg.verificador);
  await wc.subtle.decrypt({ name: "AES-GCM", iv: v.slice(0, 12) }, k.k, v.slice(12));
  sal = k.s;
} catch (e) { /* senha nova ou primeira publicação */ }
if (!sal) sal = wc.getRandomValues(new Uint8Array(16));
const chave = await derivar(sal);

async function listar(dir, rel = "") {
  const out = [];
  for (const e of await fs.readdir(dir, { withFileTypes: true })) {
    const r = rel ? rel + "/" + e.name : e.name;
    if (e.isDirectory()) out.push(...await listar(path.join(dir, e.name), r)); else out.push(r);
  }
  return out;
}
const arquivos = await listar(FONTE);
const cifrados = arquivos.filter(r => CIFRAR_BINARIOS.test(r)).map(r => "/hub/" + r);

/* incorpora CSS e JS locais ao HTML */
async function incorporar(rel, html) {
  const dir = path.dirname(path.join(FONTE, rel));
  const ler = async href => fs.readFile(path.resolve(dir, href), "utf8");
  const local = u => !/^(https?:)?\/\//i.test(u) && !u.startsWith("data:");
  html = await substituir(html, /<link\b[^>]*rel="stylesheet"[^>]*href="([^"]+)"[^>]*>/gi, async (m, href) => local(href) ? "<style>\n" + (await ler(href)) + "\n</style>" : m);
  html = await substituir(html, /<script\b([^>]*)\bsrc="([^"]+)"([^>]*)><\/script>/gi, async (m, a, src, b) => {
    if (!local(src)) return m;
    const tipo = /type="module"/i.test(a + b) ? ' type="module"' : "";
    return "<script" + tipo + ">\n" + (await ler(src)).replace(/<\/script/gi, "<\\/script") + "\n</script>";
  });
  return html.replace(/<\/head>/i, SCRIPT_CONFIG + "\n</head>");
}
async function substituir(s, re, fn) {
  const partes = []; let ultimo = 0, m;
  re.lastIndex = 0;
  while ((m = re.exec(s))) { partes.push(s.slice(ultimo, m.index), await fn(...m)); ultimo = m.index + m[0].length; }
  partes.push(s.slice(ultimo));
  return partes.join("");
}
const LOADER = `(async function(){
var ENC=${JSON.stringify(cifrados)},LOGIN="/hub/login/";
function vai(){location.replace(LOGIN+"?volta="+encodeURIComponent(location.pathname+location.search+location.hash));}
var k=null;try{k=sessionStorage.getItem("hub_chave");if(!k){var l=JSON.parse(localStorage.getItem("hub_chave")||"null");if(l&&l.ate>Date.now()){k=l.k;sessionStorage.setItem("hub_chave",k);}else if(l){localStorage.removeItem("hub_chave");}}}catch(e){}
if(!k){vai();return;}
try{
var chave=await crypto.subtle.importKey("raw",Uint8Array.from(atob(k),function(c){return c.charCodeAt(0);}),"AES-GCM",false,["decrypt"]);
var dec=async function(u){return new Uint8Array(await crypto.subtle.decrypt({name:"AES-GCM",iv:u.slice(0,12)},chave,u.slice(12)));};
var dados=Uint8Array.from(atob(document.getElementById("hub-cifra").textContent.trim()),function(c){return c.charCodeAt(0);});
var html=new TextDecoder().decode(await dec(dados));
var orig=window.fetch.bind(window),TIPOS={pdf:"application/pdf",docx:"application/vnd.openxmlformats-officedocument.wordprocessingml.document"};
window.fetch=async function(input,init){var url;try{url=new URL(typeof input==="string"?input:(input&&input.url)||String(input),location.href);}catch(e){return orig(input,init);}
if(url.origin===location.origin&&ENC.indexOf(url.pathname)>=0){var r=await orig(url.pathname+".enc",init);if(!r.ok)return r;var b=await dec(new Uint8Array(await r.arrayBuffer()));return new Response(b,{status:200,headers:{"content-type":TIPOS[url.pathname.split(".").pop().toLowerCase()]||"application/octet-stream"}});}
return orig(input,init);};
document.open();document.write(html);document.close();
}catch(e){try{sessionStorage.removeItem("hub_chave");localStorage.removeItem("hub_chave");}catch(_){}vai();}
})();`;
const casca = cifra => `<!DOCTYPE html>
<html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover"><meta name="robots" content="noindex, nofollow"><title>HUB Criminal TPC</title>
<style>html,body{margin:0;background:#f6f4ef}@media (prefers-color-scheme:dark){html,body{background:#131312}}</style></head>
<body><script id="hub-cifra" type="application/octet-stream">${cifra}</script><script>${LOADER}</script></body></html>
`;

await fs.rm(SAIDA, { recursive: true, force: true });
let nHtml = 0, nBin = 0, nPub = 0;
for (const rel of arquivos) {
  const origem = path.join(FONTE, rel), destino = path.join(SAIDA, rel);
  await fs.mkdir(path.dirname(destino), { recursive: true });
  if (rel.startsWith("login/")) { await fs.copyFile(origem, destino); nPub++; continue; }
  if (/\.html$/i.test(rel)) {
    const html = await incorporar(rel, await fs.readFile(origem, "utf8"));
    await fs.writeFile(destino, casca(b64(await cifrar(chave, new TextEncoder().encode(html)))));
    nHtml++;
  } else if (CIFRAR_BINARIOS.test(rel)) { await fs.writeFile(destino + ".enc", await cifrar(chave, await fs.readFile(origem))); nBin++; }
  else if (PUBLICOS.test(rel)) { await fs.copyFile(origem, destino); nPub++; }
  else if (!NAO_PUBLICAR.test(rel)) console.warn("Ignorado (tipo não previsto): " + rel);
}
const verificador = await cifrar(chave, new TextEncoder().encode("HUB Criminal TPC"));
await fs.writeFile(path.join(SAIDA, "acesso.json"), JSON.stringify({ versao: 1, algoritmo: "PBKDF2-SHA256/AES-256-GCM", iteracoes: ITERACOES, sal: b64(sal), verificador: b64(verificador) }, null, 2) + "\n");
console.log("HUB protegido: " + nHtml + " páginas e " + nBin + " modelos cifrados; " + nPub + " arquivos públicos (login, fontes e imagens da marca).");
