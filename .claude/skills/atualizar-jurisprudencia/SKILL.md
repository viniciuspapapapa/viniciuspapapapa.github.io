---
name: atualizar-jurisprudencia
description: Atualiza o índice de jurisprudência do STJ (dados abertos oficiais, gratuito) — baixa Espelhos de Acórdãos, filtra por órgão julgador/anos/palavra-chave, gera dados-jurisprudencia.json e publica no GitHub Pages. Use quando o usuário pedir "atualizar jurisprudência", "puxar acórdãos do STJ", "rodar o indexador de jurisprudência", "atualizar o índice de jurisprudência" ou similar.
---

# Atualizar índice de jurisprudência (STJ — Dados Abertos)

Executa o pipeline `etl/jurisprudencia/stj_indexer.py` para (re)gerar
`dados-jurisprudencia.json` a partir dos Espelhos de Acórdãos do STJ —
dados públicos e gratuitos, sem chave de API.

## Argumentos (opcionais, vindos de $ARGUMENTS)
Interprete em linguagem natural. Padrões quando não informado:
- **órgãos**: `quinta-turma`, `sexta-turma`, `terceira-secao` (competência
  penal/penal-tributária). Se o usuário pedir matéria tributária/cível
  também, adicione `primeira-turma`, `segunda-turma`, `primeira-secao`.
- **anos**: `3` (últimos 3 anos de arquivos mensais).
- **palavra-chave**: nenhuma por padrão (mantém tudo dos órgãos escolhidos).
  Se o usuário descrever um caso/tese específica, use os termos dele aqui —
  isso reduz MUITO o volume e produz um índice mais útil e mais leve.
- **limite**: `800` para o índice público do dashboard (fica leve, poucos
  MB). Se o pedido for para pesquisa de um caso concreto (não para publicar
  no site), use `--limite 0` e gere em `--saida ./saida_local` (não
  commitar — veja abaixo).
- **publicar**: sim (commit + push), salvo se o usuário disser "só gerar"/
  "não publicar".

## Passos

1. **Pré-checagem de rede** (opcional — este portal costuma estar acessível
   mesmo em ambientes com rede restrita, ao contrário da PGFN):
   `curl -sS --max-time 15 -I https://dadosabertos.web.stj.jus.br/ | head -1`

2. **Baixar** (a partir de `etl/jurisprudencia/`):
   ```
   python stj_indexer.py baixar --input-dir ./stj_json \
     --orgao <ORGAO1> --orgao <ORGAO2> ... --anos <ANOS>
   ```
   Repita `--orgao` para cada órgão. Os arquivos baixados **não são
   versionados** (grandes demais) — ficam só localmente.

3. **Processar**, gravando o JSON na raiz do repo (índice público) ou em
   pasta local (pesquisa de caso, não publicada):
   ```
   # índice público (dashboard):
   python stj_indexer.py processar --input-dir ./stj_json --saida ../.. \
     [--palavra-chave "..."] --limite 800

   # pesquisa de um caso específico (não publicar):
   python stj_indexer.py processar --input-dir ./stj_json --saida ./saida_local \
     --palavra-chave "<tese do caso>" --limite 0
   ```
   Confira o aviso de tamanho impresso pelo script — se `--limite 0` gerar
   um arquivo grande (>15 MB) e for para publicar, prefira reduzir o limite
   ou filtrar por palavra-chave em vez de subir um JSON gigante ao Git.

4. **Validar**: confira `total_registros` e `fonte` no
   `dados-jurisprudencia.json` gerado (não deve dizer "DEMONSTRAÇÃO").

5. **Publicar** (se aplicável), da raiz do repo:
   - `git add dados-jurisprudencia.json`
   - `git commit -m "data: atualiza índice de jurisprudência do STJ"`
   - `git push origin <branch>` (com retry/backoff em falha de rede).

6. **Resumir** para o usuário: quantos acórdãos, quais órgãos/período,
   e o link `https://viniciuspapapapa.github.io/jurisprudencia.html`
   (GitHub Pages leva 1–2 min para atualizar).

## Notas
- Fonte oficial (STJ, Lei nº 12.527/2011 — LAI). Ferramenta de apoio à
  pesquisa; sempre lembrar o usuário de conferir o inteiro teor e a
  situação processual atual antes de citar em peça.
- STF, TRFs e TJs não têm dump de dados abertos equivalente — não tente
  indexá-los em lote; pesquisa nesses tribunais é feita sob demanda
  (web search) quando um caso concreto é analisado.
