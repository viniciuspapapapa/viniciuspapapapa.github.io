# HUB Criminal · TPC Advogados

Conjunto de ferramentas web para a advocacia criminal, publicado no GitHub Pages em `/hub/`.
Tudo roda no navegador: os documentos dos clientes não são enviados a servidores.

## Estrutura

```
hub/
  index.html                  Página inicial do HUB (catálogo de ferramentas)
  assets/hub.css, hub.js      Identidade visual TPC, tema claro/escuro, utilidades
  dados/
    legislacao.js             CPP 158 a 158-F, 6º, 157, 159, 169-170, 245; CF; SV 14; Marco Civil; Leis 11.343 e 9.296; normas técnicas
    doutrina.js               Sínteses doutrinárias (Prado, Badaró, Aury Lopes Jr., Brasileiro, ISO 27037)
    precedentes.js            59 precedentes do STJ (dossiê IJCrim) + precedentes complementares
  cadeia-de-custodia/
    index.html                Interface da ferramenta
    regras.js                 Etapas, tipos de vestígio, peças processuais, 39 critérios e alertas (padrões editáveis)
    motor.js                  Leitura de PDF/OCR/imagens/DOCX, hash SHA-256 e análise
    relatorio.js              Relatório técnico e minuta de tese
    dossie.js                 Dossiê completo (falhas, jurisprudência aplicável e como utilizá-la, diligências, riscos, minuta)
    ia.js                     Análise complementar opcional (API do Claude, chave do próprio usuário)
    app.js                    Controlador da interface
```

## Como alimentar a base jurídica

Os arquivos de `dados/` são arrays JavaScript simples. Para incluir novos itens, basta acrescentar objetos no mesmo formato:

- **Legislação** (`HUB_LEGISLACAO`): `{ id, diploma, artigo, rotulo, texto, nota?, sintese?, tags[] }`. Use `sintese: true` quando o texto for resumo e não redação literal.
- **Doutrina** (`HUB_DOUTRINA`): `{ id, autor, obra, ref, ideias[], tags[] }`.
- **Precedentes** (`HUB_PRECEDENTES`): `{ id, n, proc, turma, tribunal, rel, dje, titulo, contexto, questoes: [{ q, t }], desfecho, url, tags[], fonte }`.
  As `tags` alimentam os filtros (acesso, extracao, hash, prints, copia, original, intercept, nuvem, midia, onus, derivada, pericia, whatsapp).
  Para vincular um precedente a um critério de verificação, inclua o número `n` (ou o `id`) no array `prec` do critério em `cadeia-de-custodia/regras.js`.

## Ajuste dos critérios

Cada critério em `regras.js` tem `pos` (indícios de cumprimento) e `neg` (indícios de vício), em expressões regulares aplicadas sobre texto
minúsculo e sem acentos, além das minutas `falta` e `vicio` usadas no relatório (`{v}` é o vestígio; `{p}` as páginas).

## Bibliotecas (CDN, versões fixas)

pdf.js 3.11.174 · tesseract.js 5.1.1 (modelo `por`) · exifr 7.1.3 · mammoth 1.6.0.
