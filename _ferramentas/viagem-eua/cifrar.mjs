#!/usr/bin/env node
// Cifra os dados e documentos do app da viagem EUA 2027 (eua2027/) com AES-256-GCM.
// A chave é derivada da senha do grupo (PBKDF2-SHA256). Nada sensível é publicado em texto claro.
//
// Cifrar:   VIAGEM_SENHA='...' node _ferramentas/viagem-eua/cifrar.mjs <pasta-fonte> eua2027
//           <pasta-fonte> contém dados.mjs (export default {...}), fotos/ e docs/.
// Decifrar: VIAGEM_SENHA='...' node _ferramentas/viagem-eua/cifrar.mjs --decifrar eua2027 <pasta-destino>
//           Recupera dados.json e os documentos originais (útil para editar e cifrar de novo).

import { webcrypto as crypto } from 'node:crypto';
import { readFile, writeFile, mkdir, access } from 'node:fs/promises';
import { join, resolve, extname } from 'node:path';
import { pathToFileURL } from 'node:url';

const MAGICA = new TextEncoder().encode('EUA27');
const VERSAO = 1;
const ITERACOES = 310000;

const senha = process.env.VIAGEM_SENHA;
if (!senha) { console.error('Defina a senha em VIAGEM_SENHA.'); process.exit(1); }

async function derivar(sal) {
  const base = await crypto.subtle.importKey('raw', new TextEncoder().encode(senha), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey({ name: 'PBKDF2', salt: sal, iterations: ITERACOES, hash: 'SHA-256' }, base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}

function montar(sal, iv, cifrado) {
  const out = new Uint8Array(MAGICA.length + 1 + 16 + 12 + cifrado.byteLength);
  out.set(MAGICA, 0); out[MAGICA.length] = VERSAO;
  out.set(sal, MAGICA.length + 1); out.set(iv, MAGICA.length + 17);
  out.set(new Uint8Array(cifrado), MAGICA.length + 29);
  return out;
}

function partes(buf) {
  const b = new Uint8Array(buf);
  for (let i = 0; i < MAGICA.length; i++) if (b[i] !== MAGICA[i]) throw new Error('Arquivo não reconhecido.');
  return { sal: b.slice(6, 22), iv: b.slice(22, 34), dados: b.slice(34) };
}

async function cifrar(chave, sal, bytes) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  return montar(sal, iv, await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, chave, bytes));
}

async function decifrar(chave, buf) {
  const p = partes(buf);
  return new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: p.iv }, chave, p.dados));
}

const hex = (b) => Buffer.from(b).toString('hex');
const sha = async (b) => hex(await crypto.subtle.digest('SHA-256', b));
const existe = (p) => access(p).then(() => true, () => false);
const MIME = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp', '.pdf': 'application/pdf' };

async function modoCifrar(fonte, saida) {
  const dados = structuredClone((await import(pathToFileURL(resolve(fonte, 'dados.mjs')).href + '?t=' + Date.now())).default);
  await mkdir(join(saida, 'docs'), { recursive: true });

  // Reaproveita o sal e os documentos já cifrados quando nada mudou (evita inflar o histórico do git).
  let sal = crypto.getRandomValues(new Uint8Array(16));
  let anteriores = {};
  const binDados = join(saida, 'dados.bin');
  if (await existe(binDados)) {
    try {
      const velho = await readFile(binDados);
      const s = partes(velho).sal;
      const ch = await derivar(s);
      const antigo = JSON.parse(new TextDecoder().decode(await decifrar(ch, velho)));
      sal = s;
      for (const d of antigo.docs || []) anteriores[d.id] = d;
    } catch { console.log('dados.bin anterior não pôde ser lido com esta senha: tudo será cifrado de novo.'); }
  }
  const chave = await derivar(sal);

  for (const p of dados.pessoas || []) {
    if (!p.foto) continue;
    const b = await readFile(join(fonte, p.foto));
    p.foto = `data:${MIME[extname(p.foto).toLowerCase()] || 'image/jpeg'};base64,${b.toString('base64')}`;
  }

  for (const d of dados.docs || []) {
    const bruto = await readFile(join(fonte, 'docs', d.arquivo));
    d.hash = await sha(bruto);
    d.tamanho = bruto.length;
    d.nome = d.arquivo;
    d.bin = `docs/${d.id}.bin`;
    const destino = join(saida, d.bin);
    if (anteriores[d.id]?.hash === d.hash && await existe(destino)) { console.log('mantido ', d.bin); continue; }
    await writeFile(destino, await cifrar(chave, sal, bruto));
    console.log('cifrado ', d.bin, `(${(bruto.length / 1024).toFixed(0)} KB)`);
  }

  dados.geradoEm = new Date().toISOString();
  await writeFile(binDados, await cifrar(chave, sal, new TextEncoder().encode(JSON.stringify(dados))));
  console.log('cifrado ', binDados);
}

async function modoDecifrar(saida, destino) {
  const velho = await readFile(join(saida, 'dados.bin'));
  const chave = await derivar(partes(velho).sal);
  const dados = JSON.parse(new TextDecoder().decode(await decifrar(chave, velho)));
  await mkdir(join(destino, 'docs'), { recursive: true });
  await writeFile(join(destino, 'dados.json'), JSON.stringify(dados, null, 2));
  for (const d of dados.docs || []) {
    await writeFile(join(destino, 'docs', d.nome), await decifrar(chave, await readFile(join(saida, d.bin))));
  }
  console.log('Decifrado em', destino);
}

const args = process.argv.slice(2);
if (args[0] === '--decifrar') await modoDecifrar(args[1], args[2]);
else if (args.length === 2) await modoCifrar(args[0], args[1]);
else { console.error('Uso: cifrar.mjs <fonte> <saida>  |  cifrar.mjs --decifrar <saida> <destino>'); process.exit(1); }
