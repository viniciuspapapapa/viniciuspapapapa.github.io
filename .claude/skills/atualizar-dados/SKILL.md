---
name: atualizar-dados
description: Atualiza a base de captação com dados REAIS da Dívida Ativa da União (PGFN) — baixa, filtra MG/BH/Zona da Mata, enriquece via CNPJ, gera dados-captacao.json e publica no GitHub Pages. Use quando o usuário pedir "atualizar dados", "puxar dados reais", "rodar o ETL", "atualizar a planilha de captação" ou similar. Requer ambiente com rede liberada (PGFN/BrasilAPI).
---

# Atualizar dados de captação (Dívida Ativa — PGFN)

Executa o pipeline `etl/captacao_divida_ativa.py` para substituir os dados de
demonstração por dados **reais** e publicar no site.

## Argumentos (opcionais, vindos de $ARGUMENTS)
Interprete em linguagem natural. Padrões quando não informado:
- **trimestre**: o mais recente plausível (ex.: `2026-1`). Se falhar, tente o anterior.
- **valor mínimo** (`--valor-relevante`): `250000`
- **enriquecer N**: `300`
- **regiões**: apenas BH/RMBH + Zona da Mata (não passe `--todas-regioes` salvo se o usuário pedir "todo MG").
- **publicar**: sim (commit + push). Se o usuário disser "só gerar" / "não publicar", pule o passo de publicação.

## Passos

1. **Pré-checagem de rede.** Rode:
   `curl -sS --max-time 15 -I https://dadosabertos.pgfn.gov.br/ | head -1`
   Se retornar 403/erro de proxy, **pare** e avise o usuário que este ambiente
   está com a rede bloqueada para a PGFN — ele precisa de um ambiente com rede
   liberada (ver `etl/README.md`). Não tente contornar a política.

2. **Dependências:** `pip install -q requests openpyxl` (a partir de `etl/`).

3. **Baixar** (de `etl/`):
   `python captacao_divida_ativa.py baixar --trimestre <TRIMESTRE> --input-dir ./pgfn_csv`
   - Se a descoberta automática não achar o trimestre, o script imprime as URLs
     `.zip` do índice. Escolha as de **Não Previdenciário** e **Previdenciário**
     (e FGTS, se o usuário quiser débitos trabalhistas) e rebaixe com
     `--url <zip1> --url <zip2>`.
   - Os `.zip` não precisam ser descompactados.

4. **Processar** (de `etl/`), gravando o JSON na raiz do repo para o dashboard:
   `python captacao_divida_ativa.py processar --input-dir ./pgfn_csv --saida .. --valor-relevante <VALOR> --enriquecer <N>`
   - Confira o resumo impresso (nº de empresas, total em dívida). Se vier 0
     empresas, provavelmente o filtro de região/valor está estrito ou o
     trimestre veio vazio — investigue antes de publicar.

5. **Validar** o JSON gerado: confirme que `meta.demo` é `false` e que
   `meta.total_empresas` > 0 em `../dados-captacao.json`.

6. **Publicar** (se aplicável), da raiz do repo:
   - `git add dados-captacao.json`
   - `git commit -m "data: dados reais da Dívida Ativa (PGFN <TRIMESTRE>) — MG/BH/Zona da Mata"`
   - `git push origin main` (com retry/backoff em falha de rede). Se estiver
     numa branch de feature, peça confirmação antes de mexer na `main`.

7. **Resumir** para o usuário: quantas empresas, total em dívida, quantas
   ajuizadas, divisão BH × Zona da Mata, e o link
   https://viniciuspapapapa.github.io/captacao-divida-ativa.html
   (lembre que o GitHub Pages leva 1–2 min para atualizar). Se gerou planilha
   `etl/empresas_divida_ativa.xlsx`, ofereça enviá-la com SendUserFile.

## Notas
- Foco em pessoas jurídicas; dados públicos; uso B2B legítimo. Lembre o usuário
  de confirmar a situação atual de cada inscrição no Regularize/e-CAC antes de
  abordar (dados abertos têm defasagem trimestral).
- Os arquivos da PGFN são nacionais e grandes: download e enriquecimento podem
  levar alguns minutos. Não use `sleep` para "esperar"; rode e reporte.
