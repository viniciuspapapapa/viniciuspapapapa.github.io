/* Índice de sócios da Receita Federal para a Rede de empresas e sócios do HUB.
   Lê os arquivos Socios0.zip a Socios9.zip dos dados abertos do CNPJ (pasta já baixada), agrupa as linhas pelo nome do
   sócio normalizado em 4.096 partes (hash FNV-1a), comprime e cifra cada parte com a chave do HUB e grava:
     socios.bin  as partes concatenadas
     socios.idx  { mes, gerado, n, linhas, pos: [[início, tamanho], ...] }
   Processa em duas passagens (64 baldes temporários em disco) para caber na memória do executor.

   Uso:  HUB_SENHA='...' node _ferramentas/bases/socios.mjs <pasta com SociosN.zip> <AAAA-MM> <pasta de saída> */
import { promises as fs, createWriteStream } from "node:fs";
import path from "node:path";
import os from "node:os";
import zlib from "node:zlib";
import readline from "node:readline";
import { spawn } from "node:child_process";
import { promisify } from "node:util";
import { webcrypto as wc } from "node:crypto";

const gzip = promisify(zlib.gzip);
const RAIZ = path.resolve(path.dirname(new URL(import.meta.url).pathname), "../..");
const [ORIGEM, MES, SAIDA] = [path.resolve(process.argv[2] || "socios-zip"), process.argv[3] || "", path.resolve(process.argv[4] || "socios-saida")];
const N = 4096, BALDES = 64;
const senha = process.env.HUB_SENHA || "";
if (senha.length < 10) { console.error("Defina HUB_SENHA."); process.exit(1); }
const acesso = JSON.parse(await fs.readFile(path.join(RAIZ, "hub", "acesso.json"), "utf8"));
const de64 = s => new Uint8Array(Buffer.from(s, "base64"));
const base = await wc.subtle.importKey("raw", new TextEncoder().encode(senha), "PBKDF2", false, ["deriveKey"]);
const chave = await wc.subtle.deriveKey({ name: "PBKDF2", salt: de64(acesso.sal), iterations: acesso.iteracoes, hash: "SHA-256" }, base, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
{ const v = de64(acesso.verificador); try { await wc.subtle.decrypt({ name: "AES-GCM", iv: v.slice(0, 12) }, chave, v.slice(12)); } catch (e) { console.error("HUB_SENHA não corresponde à senha publicada do HUB."); process.exit(1); } }

/* as mesmas funções do navegador (rede/app.js): mudar aqui exige mudar lá */
export const norm = s => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase().replace(/[^A-Z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();
export const parte = s => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0) % N; };

const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "socios-"));
const baldes = Array.from({ length: BALDES }, (_, i) => createWriteStream(path.join(tmp, "b" + i + ".txt"), { encoding: "utf8" }));
const escrever = (b, l) => new Promise(ok => { if (!baldes[b].write(l)) baldes[b].once("drain", ok); else ok(); });
let linhas = 0;
const zips = (await fs.readdir(ORIGEM)).filter(f => /^Socios\d\.zip$/i.test(f)).sort();
if (zips.length < 10) { console.error("Esperava Socios0.zip a Socios9.zip em " + ORIGEM + "; encontrei " + zips.length + "."); process.exit(1); }
for (const z of zips) {
  const p = spawn("unzip", ["-p", path.join(ORIGEM, z)]); p.stdout.setEncoding("latin1");
  const rl = readline.createInterface({ input: p.stdout, crlfDelay: Infinity });
  for await (const l of rl) {
    const c = l.split('";"').map(x => x.replace(/^"|"$/g, "").trim()); if (c.length < 6) continue;
    const nome = norm(c[2]); if (!nome) continue;
    const s = parte(nome);
    /* nome, documento (CPF mascarado ou CNPJ), CNPJ básico da empresa, qualificação, data de entrada, identificador (1 PJ, 2 PF, 3 estrangeiro), faixa etária */
    await escrever(s % BALDES, s + "\t" + [nome, c[3], c[0], c[4], c[5], c[1], c[10] || ""].join("\t") + "\n");
    linhas++;
  }
  console.log(z, "lido;", linhas.toLocaleString("pt-BR"), "linhas até aqui");
}
await Promise.all(baldes.map(b => new Promise(ok => b.end(ok))));

await fs.mkdir(SAIDA, { recursive: true });
const saida = await fs.open(path.join(SAIDA, "socios.bin"), "w");
const pos = Array.from({ length: N }, () => [0, 0]); let off = 0;
for (let b = 0; b < BALDES; b++) {
  const txt = await fs.readFile(path.join(tmp, "b" + b + ".txt"), "utf8"), grupos = new Map();
  for (const l of txt.split("\n")) { if (!l) continue; const i = l.indexOf("\t"), s = +l.slice(0, i); if (!grupos.has(s)) grupos.set(s, []); grupos.get(s).push(l.slice(i + 1)); }
  for (const [s, ls] of grupos) {
    ls.sort();
    const dados = await gzip(Buffer.from(ls.join("\n"), "utf8"), { level: 9 }), iv = wc.getRandomValues(new Uint8Array(12));
    const ct = new Uint8Array(await wc.subtle.encrypt({ name: "AES-GCM", iv }, chave, dados)), bloco = Buffer.concat([Buffer.from(iv), Buffer.from(ct)]);
    await saida.write(bloco); pos[s] = [off, bloco.length]; off += bloco.length;
  }
  await fs.rm(path.join(tmp, "b" + b + ".txt"));
}
await saida.close();
await fs.writeFile(path.join(SAIDA, "socios.idx"), JSON.stringify({ mes: MES, gerado: new Date().toISOString(), n: N, linhas, pos }));
await fs.rm(tmp, { recursive: true, force: true });
console.log("Índice de sócios:", linhas.toLocaleString("pt-BR"), "vínculos;", (off / 1048576).toFixed(0), "MB");
if (process.env.GITHUB_STEP_SUMMARY) await fs.appendFile(process.env.GITHUB_STEP_SUMMARY, "### Base de sócios da Receita\n\n" + linhas.toLocaleString("pt-BR") + " vínculos, dados de " + MES + ", " + (off / 1048576).toFixed(0) + " MB.\n");
