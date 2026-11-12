/* Bases públicas do HUB TPC usadas pela Investigação patrimonial.
   Hoje: Registro Aeronáutico Brasileiro (RAB, dados abertos da ANAC), com proprietários, operadores, gravames e
   cancelamentos. O arquivo oficial é baixado, reduzido aos campos úteis, comprimido e cifrado com a mesma chave do
   HUB (AES-256-GCM; PBKDF2 sobre a senha e o sal de hub/acesso.json). O resultado vai para o ramo "bases-publicas".

   Uso (no GitHub Actions):  HUB_SENHA='...' node _ferramentas/bases/publicas.mjs
   Variável opcional:        BASES_SAIDA  pasta de saída (padrão: base-publica) */
import { promises as fs } from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { promisify } from "node:util";
import { webcrypto as wc } from "node:crypto";

const gzip = promisify(zlib.gzip);
const RAIZ = path.resolve(path.dirname(new URL(import.meta.url).pathname), "../..");
const SAIDA = path.resolve(process.env.BASES_SAIDA || "base-publica");
const RAB = "https://sistemas.anac.gov.br/dadosabertos/Aeronaves/RAB/dados_aeronaves.csv";

const senha = process.env.HUB_SENHA || "";
if (senha.length < 10) { console.error("Defina HUB_SENHA (a senha do HUB)."); process.exit(1); }
const acesso = JSON.parse(await fs.readFile(path.join(RAIZ, "hub", "acesso.json"), "utf8"));
const de64 = s => new Uint8Array(Buffer.from(s, "base64"));
const base = await wc.subtle.importKey("raw", new TextEncoder().encode(senha), "PBKDF2", false, ["deriveKey"]);
const chave = await wc.subtle.deriveKey({ name: "PBKDF2", salt: de64(acesso.sal), iterations: acesso.iteracoes, hash: "SHA-256" }, base, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
{ const v = de64(acesso.verificador); try { await wc.subtle.decrypt({ name: "AES-GCM", iv: v.slice(0, 12) }, chave, v.slice(12)); } catch (e) { console.error("HUB_SENHA não corresponde à senha publicada do HUB."); process.exit(1); } }
async function cifrar(obj) {
  const dados = await gzip(Buffer.from(JSON.stringify(obj)), { level: 9 });
  const iv = wc.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await wc.subtle.encrypt({ name: "AES-GCM", iv }, chave, dados));
  const out = new Uint8Array(12 + ct.length); out.set(iv); out.set(ct, 12); return out;
}

/* CSV com ponto e vírgula e aspas duplas (campos podem conter JSON com aspas escapadas) */
function linhasCsv(txt) {
  const out = []; let campo = "", linha = [], aspas = false;
  for (let i = 0; i < txt.length; i++) {
    const c = txt[i];
    if (aspas) { if (c === '"') { if (txt[i + 1] === '"') { campo += '"'; i++; } else aspas = false; } else campo += c; }
    else if (c === '"') aspas = true;
    else if (c === ";") { linha.push(campo); campo = ""; }
    else if (c === "\n") { linha.push(campo.replace(/\r$/, "")); out.push(linha); linha = []; campo = ""; }
    else campo += c;
  }
  if (campo || linha.length) { linha.push(campo); out.push(linha); }
  return out;
}
const json = s => { try { const v = JSON.parse(s); return Array.isArray(v) ? v : []; } catch (e) { return []; } };
const limpo = v => { const s = String(v == null ? "" : v).trim(); return /^indispon[ií]vel$/i.test(s) ? "" : s; };

async function rab() {
  const r = await fetch(RAB, { headers: { "User-Agent": "Mozilla/5.0 (HUB TPC; dados abertos)" } });
  if (!r.ok) throw new Error("ANAC indisponível (HTTP " + r.status + ")");
  let txt = (await r.text()).replace(/^﻿/, "");
  const atualizado = (txt.match(/^Atualizado em:\s*([\d-]+)/) || [])[1] || "";
  txt = txt.slice(txt.indexOf("\n") + 1);
  const ls = linhasCsv(txt), cab = ls.shift(), ix = n => cab.indexOf(n);
  const I = { marca: ix("MARCAS"), prop: ix("PROPRIETARIOS"), op: ix("OPERADORES"), modelo: ix("DS_MODELO"), fab: ix("NM_FABRICANTE"), ano: ix("NR_ANO_FABRICACAO"), grav: ix("DS_GRAVAME"), canc: ix("DT_CANC"), mot: ix("DS_MOTIVO_CANC"), mat: ix("DT_MATRICULA"), oper: ix("TP_OPERACAO"), cat: ix("DS_CATEGORIA_HOMOLOGACAO"), serie: ix("NR_SERIE"), pass: ix("NR_PASSAGEIROS_MAX") };
  if (Object.values(I).some(v => v < 0)) throw new Error("O layout do arquivo da ANAC mudou: " + JSON.stringify(I));
  const pessoas = arr => json(arr).map(p => [limpo(p.NOME), limpo(p.DOCUMENTO), limpo(p.PERCENTUAL), limpo(p.UF)]).filter(p => p[0] || p[1]);
  const regs = [];
  for (const l of ls) {
    if (!l[I.marca]) continue;
    regs.push([l[I.marca], pessoas(l[I.prop]), pessoas(l[I.op]).map(p => [p[0], p[1], p[3]]), l[I.modelo], l[I.fab], l[I.ano], l[I.grav], l[I.canc], l[I.mot], l[I.mat], l[I.oper], l[I.cat], l[I.serie], l[I.pass]]);
  }
  return { fonte: "Registro Aeronáutico Brasileiro (ANAC, dados abertos)", url: RAB, atualizado, campos: ["marca", "proprietarios[nome,documento,percentual,uf]", "operadores[nome,documento,uf]", "modelo", "fabricante", "ano", "gravame", "cancelamento", "motivo", "matricula", "operacao", "categoria", "serie", "passageiros"], registros: regs };
}

await fs.mkdir(SAIDA, { recursive: true });
const dados = await rab();
await fs.writeFile(path.join(SAIDA, "rab.bin"), await cifrar(dados));
await fs.writeFile(path.join(SAIDA, "LEIA-ME.md"), "# Bases públicas do HUB TPC\n\nArquivos cifrados (AES-256-GCM) gerados pelo fluxo `bases-publicas.yml` a partir de dados abertos oficiais. Não edite este ramo.\n");
console.log("RAB:", dados.registros.length, "aeronaves; atualizado em", dados.atualizado || "?");
if (process.env.GITHUB_STEP_SUMMARY) await fs.appendFile(process.env.GITHUB_STEP_SUMMARY, "### Bases públicas\n\nRAB (ANAC): " + dados.registros.length + " aeronaves, atualizado em " + (dados.atualizado || "?") + ".\n");
