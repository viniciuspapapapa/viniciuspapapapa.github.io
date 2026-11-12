/* Base local da Pesquisa de jurisprudência do HUB, a partir do acervo aberto do projeto Advocacia Aberta
   (github.com/emidio-trancoso/advocacia-aberta, licença MIT): súmulas vinculantes, súmulas do STF e do STJ, temas de
   repercussão geral, temas repetitivos, Jurisprudência em Teses, Informativo do STF, espelhos de acórdãos do STJ e as
   leis de interesse penal. Textos oficiais (Lei 9.610/1998, art. 8º, IV). A base é cifrada com a chave do HUB.

   Uso:  HUB_SENHA='...' node _ferramentas/bases/juris.mjs <pasta advocacia-aberta>   (saída: base-publica/juris.bin) */
import { promises as fs } from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { promisify } from "node:util";
import { webcrypto as wc } from "node:crypto";

const gzip = promisify(zlib.gzip);
const RAIZ = path.resolve(path.dirname(new URL(import.meta.url).pathname), "../..");
const SAIDA = path.resolve(process.env.BASES_SAIDA || "base-publica");
const AA = path.resolve(process.argv[2] || "advocacia-aberta"), DADOS = path.join(AA, "ferramentas/pesquisa/vade-mecum/data");
const senha = process.env.HUB_SENHA || "";
if (senha.length < 10) { console.error("Defina HUB_SENHA."); process.exit(1); }
const acesso = JSON.parse(await fs.readFile(path.join(RAIZ, "hub", "acesso.json"), "utf8"));
const de64 = s => new Uint8Array(Buffer.from(s, "base64"));
const base = await wc.subtle.importKey("raw", new TextEncoder().encode(senha), "PBKDF2", false, ["deriveKey"]);
const chave = await wc.subtle.deriveKey({ name: "PBKDF2", salt: de64(acesso.sal), iterations: acesso.iteracoes, hash: "SHA-256" }, base, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
{ const v = de64(acesso.verificador); try { await wc.subtle.decrypt({ name: "AES-GCM", iv: v.slice(0, 12) }, chave, v.slice(12)); } catch (e) { console.error("HUB_SENHA não corresponde à senha publicada do HUB."); process.exit(1); } }
async function cifrar(obj) {
  const dados = await gzip(Buffer.from(JSON.stringify(obj)), { level: 9 });
  const iv = wc.getRandomValues(new Uint8Array(12)), ct = new Uint8Array(await wc.subtle.encrypt({ name: "AES-GCM", iv }, chave, dados));
  const out = new Uint8Array(12 + ct.length); out.set(iv); out.set(ct, 12); return out;
}
const ler = async f => JSON.parse(await fs.readFile(path.join(DADOS, f), "utf8"));
const s = v => (v == null ? "" : String(v)).replace(/\s+/g, " ").trim();
const link = l => { if (!l) return ""; if (typeof l === "string") return l; const v = Object.values(l).find(x => typeof x === "string" && /^https?:/.test(x)); return v || ""; };
const vals = o => Object.values(o || {});

const col = [];
{ const d = await ler("sumulas_vinculantes.json"); col.push({ id: "sv", nome: "Súmulas vinculantes (STF)", registros: vals(d.sumulas).map(x => ["Súmula Vinculante " + x.numero, [x.ramo, x.status].filter(Boolean).join(" · "), s(x.data), link(x.url), s(x.enunciado)]) }); }
{ const d = await ler("sumulas_stf.json"); col.push({ id: "sumstf", nome: "Súmulas do STF", registros: vals(d.sumulas).map(x => ["Súmula " + x.numero + " do STF", [x.area, x.status].filter(Boolean).join(" · "), s(x.data), link(x.url), s(x.enunciado)]) }); }
{ const d = await ler("sumulas_stj.json"); col.push({ id: "sumstj", nome: "Súmulas do STJ", registros: vals(d.sumulas).map(x => ["Súmula " + x.numero + " do STJ", [x.orgao, x.area, x.tema, x.status].filter(Boolean).map(s).join(" · "), s(x.data), link(x.url), s(x.enunciado)]) }); }
{ const d = await ler("temas_rg_stf.json"); col.push({ id: "rg", nome: "Repercussão geral (STF)", registros: vals(d.temas).map(x => ["Tema " + x.numero + " da repercussão geral", [x.leadingCase, x.relator, x.situacao].filter(Boolean).map(s).join(" · "), s(x.dataTese || x.dataJulgamento), link(x.links), [s(x.titulo), x.tese ? "Tese: " + s(x.tese) : "", s(x.descricao)].filter(Boolean).join("\n")]) }); }
{ const d = await ler("flash_temas_stj.json"); col.push({ id: "rep", nome: "Temas repetitivos (STJ)", registros: vals(d.temas).map(x => ["Tema repetitivo " + x.numero + " do STJ", [x.processo, x.orgaoJulgador, x.relator, x.situacao].filter(Boolean).map(s).join(" · "), s(x.dataJulgamento), link(x.links), [x.teseFirmada ? "Tese: " + s(x.teseFirmada) : "", "Questão: " + s(x.questao)].filter(Boolean).join("\n")]) }); }
{ const d = await ler("jt_stj.json"); col.push({ id: "jt", nome: "Jurisprudência em Teses (STJ)", registros: vals(d.teses).map(x => ["Jurisprudência em Teses, edição " + x.edicao + ", tese " + x.tese_numero, s(x.edicao_titulo) + (x.ramo_direito ? " · " + s(x.ramo_direito) : ""), s(x.data_publicacao), link(x.url), s(x.enunciado)]) }); }
{ const d = await ler("informativo_stf.json"); col.push({ id: "inf", nome: "Informativo do STF", registros: vals(d.informativos).map(x => ["Informativo " + x.edicao + " do STF · " + [x.classeProcesso, x.numeroProcesso].filter(Boolean).join(" "), [x.orgaoJulgador, x.relator, x.ramoDireito].filter(Boolean).map(s).join(" · "), s(x.dataJulgamento), link(x.links), [s(x.titulo), x.teseJulgado ? "Tese: " + s(x.teseJulgado) : "", s(x.resumo)].filter(Boolean).join("\n")]) }); }
{ const d = await ler("espelhos_stj.json"); col.push({ id: "esp", nome: "Acórdãos do STJ (Corte Especial e Seções)", registros: vals(d.espelhos).map(x => [[x.classe, x.numeroProcesso].filter(Boolean).join(" ") + " (STJ)", [x.orgao, x.relator && "Rel. Min. " + s(x.relator)].filter(Boolean).join(" · "), s(x.dataPublicacao), link(x.links), [s(x.ementa), x.teseJuridica ? "Tese: " + s(x.teseJuridica) : ""].filter(Boolean).join("\n")]) }); }

const LEIS = { cf: "CF", cp: "CP", cpp: "CPP", lep: "LEP", ld: "Lei 11.343/2006", lcp: "LCP", lmp: "Lei 11.340/2006", lje: "Lei 9.099/1995", l9613: "Lei 9.613/1998", l12850: "Lei 12.850/2013", l8137: "Lei 8.137/1990", l7492: "Lei 7.492/1986", l8072: "Lei 8.072/1990", l9296: "Lei 9.296/1996", l13869: "Lei 13.869/2019", l9605: "Lei 9.605/1998", ctb: "CTB", eca: "ECA", l12846: "Lei 12.846/2013", l9455: "Lei 9.455/1997", l7716: "Lei 7.716/1989", l9807: "Lei 9.807/1999", l12037: "Lei 12.037/2009", l8038: "Lei 8.038/1990", lia: "Lei 8.429/1992", lgpd: "LGPD", mci: "Marco Civil da Internet" };
const leis = [];
for (const [id, sigla] of Object.entries(LEIS)) {
  let d; try { d = await ler("lei_" + id + ".json"); } catch (e) { continue; }
  const nome = (d._meta && (d._meta.titulo || d._meta.nome)) || sigla;
  for (const a of vals(d.artigos)) leis.push([sigla + ", art. " + a.numero, nome, "", link(a.url), s(a.texto)]);
}
col.push({ id: "leis", nome: "Legislação penal e processual", registros: leis });

let gerado = ""; try { gerado = (await ler("sumulas_stj.json"))._meta.gerado_em || ""; } catch (e) { /* sem data */ }
const dados = { fonte: "Advocacia Aberta (acervo aberto de fontes oficiais)", gerado: String(gerado).slice(0, 10), montado: new Date().toISOString(), colecoes: col };
await fs.mkdir(SAIDA, { recursive: true });
await fs.writeFile(path.join(SAIDA, "juris.bin"), await cifrar(dados));
console.log("Jurisprudência:", col.map(c => c.id + "=" + c.registros.length).join(" "));
if (process.env.GITHUB_STEP_SUMMARY) await fs.appendFile(process.env.GITHUB_STEP_SUMMARY, "Jurisprudência (Advocacia Aberta): " + col.map(c => c.nome + " " + c.registros.length).join("; ") + ".\n");
