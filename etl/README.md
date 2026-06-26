# Captação de clientes — Dívida Ativa da União (MG · BH · Zona da Mata)

Sistema para identificar **empresas (CNPJ) de Minas Gerais com dívidas
relevantes** inscritas em **Dívida Ativa da União**, com foco em
**Belo Horizonte / Região Metropolitana** e na **Zona da Mata mineira**,
para prospecção de clientes do escritório (área tributária).

São duas partes:

1. **Pipeline ETL** (`captacao_divida_ativa.py`) — roda na sua máquina, baixa e
   processa os dados públicos da PGFN, filtra MG/BH/Zona da Mata, agrega por
   CNPJ, calcula um **score de oportunidade**, enriquece os maiores devedores
   com dados cadastrais (telefone, e-mail, CNAE, município) e gera
   **planilha (CSV/XLSX)** + um **JSON** para o painel.
2. **Dashboard web** (`../captacao-divida-ativa.html`) — abre o JSON e oferece
   filtros, ranking por score, exportação e um mini-CRM de captação
   (status do contato + anotações por empresa).

---

## Fonte dos dados (públicos)

- **Dívida Ativa da União** — PGFN, Dados Abertos:
  https://dadosabertos.pgfn.gov.br/
  Arquivos por **trimestre** (`AAAA-T`) e por tipo: **Não Previdenciário**,
  **Previdenciário** e **FGTS**. Colunas usadas:
  `cpf_cnpj, tipo_pessoa, tipo_devedor, nome_devedor, uf_devedor,
  unidade_responsavel, numero_inscricao, tipo_situacao_inscricao,
  situacao_inscricao, receita_principal, data_inscricao,
  indicador_ajuizado, valor_consolidado`.
- **Enriquecimento cadastral** (opcional): [BrasilAPI](https://brasilapi.com.br/)
  ou [Minha Receita](https://minhareceita.org/) — dados públicos de CNPJ.

> A região é inferida pela coluna `unidade_responsavel` (ex.:
> `DRF BELO HORIZONTE`, `DRF JUIZ DE FORA`), que indica a unidade da
> PGFN/RFB responsável pelo débito — bom indicador geográfico sem precisar
> baixar a base gigante de CNPJ da Receita. O enriquecimento traz o
> município exato.

---

## Instalação

```bash
cd etl
pip install -r requirements.txt   # opcional (download/enriquecimento/xlsx)
```

A leitura e agregação dos CSV funcionam **só com a biblioteca padrão** do
Python 3.10+. `requests`/`openpyxl` só são necessários para baixar dados,
enriquecer via API e gerar `.xlsx`.

---

## Uso

### 1) Ver a ferramenta funcionando agora (dados de exemplo)

```bash
python captacao_divida_ativa.py demo --saida ..
```
Gera `../dados-captacao.json` (sintético) e abre o dashboard já populado.
Útil para conhecer a interface antes de baixar os dados reais.

### 2) Baixar os dados reais da PGFN

Descoberta automática do trimestre:
```bash
python captacao_divida_ativa.py baixar --trimestre 2025-1 --input-dir ./pgfn_csv
```

Ou, se preferir/precisar, informe a(s) URL(s) `.zip` direto (caminho mais
confiável — copie da página https://dadosabertos.pgfn.gov.br/):
```bash
python captacao_divida_ativa.py baixar --input-dir ./pgfn_csv \
  --url https://dadosabertos.pgfn.gov.br/<arquivo_nao_previdenciario>.zip \
  --url https://dadosabertos.pgfn.gov.br/<arquivo_previdenciario>.zip
```

Os `.zip` ficam salvos em `./pgfn_csv` e **não precisam ser descompactados** —
o passo 3 lê os CSV de dentro dos zips. Se o download automático falhar, o
script lista as URLs encontradas no índice para você copiar e usar com `--url`.
Os arquivos são grandes (Brasil inteiro); o filtro de UF reduz para MG.

### 3) Processar, filtrar e gerar a planilha + JSON

```bash
python captacao_divida_ativa.py processar \
  --input-dir ./pgfn_csv \
  --saida .. \
  --valor-relevante 250000 \
  --enriquecer 300
```
Lê tanto `.csv` quanto `.zip` da pasta `--input-dir`.

Opções:

| Flag | Padrão | Descrição |
|---|---|---|
| `--input-dir` | — | pasta com os CSV da PGFN |
| `--saida` | `saida` | pasta de saída (use `..` para alimentar o dashboard) |
| `--valor-relevante` | `100000` | dívida mínima somada por empresa (R$) |
| `--todas-regioes` | desligado | não restringe a BH/Zona da Mata (mantém todo MG) |
| `--incluir-extintas` | desligado | inclui inscrições quitadas/canceladas/extintas |
| `--enriquecer N` | `0` | enriquece as **N maiores** empresas via API de CNPJ |
| `--fonte-cnpj` | `brasilapi` | `brasilapi` ou `minhareceita` |

Saídas (na pasta `--saida`):
- `dados-captacao.json` — consumido pelo dashboard;
- `empresas_divida_ativa.csv` — planilha (separador `;`, UTF-8 BOM, abre no Excel);
- `empresas_divida_ativa.xlsx` — planilha formatada (se `openpyxl` instalado).

### 4) Publicar no dashboard

Gere o JSON com `--saida ..` (raiz do repositório). O dashboard
`captacao-divida-ativa.html` carrega `dados-captacao.json` automaticamente.
Faça commit do JSON atualizado para publicar no GitHub Pages, **ou** use o
botão **“Carregar dados”** no painel para abrir o arquivo localmente (sem
subir nada).

---

## Score de oportunidade

Heurística 0–100 para priorização comercial:
- **valor da dívida** (fator principal, até 60 pts);
- **+20** se há execução fiscal **ajuizada** (dor aguda → maior propensão a contratar);
- **+1 por inscrição** (até 10) — complexidade do passivo;
- **+ antiguidade** (até 10) — risco de medidas/prescrição.

Ajuste os pesos em `calcular_score()` conforme a estratégia do escritório.

---

## Observações legais / LGPD

- A Dívida Ativa da União é **informação pública** (disponibilização oficial
  pela PGFN). O pipeline foca em **pessoas jurídicas (CNPJ)**; pessoas físicas
  (CPF) são descartadas por padrão.
- Use os dados para **prospecção B2B legítima**. **Confirme sempre a situação
  atual** de cada inscrição no [Regularize/e-CAC](https://www.regularize.pgfn.gov.br/)
  antes de qualquer abordagem — os dados abertos têm defasagem trimestral.
- As anotações de captação do dashboard ficam **somente no seu navegador**
  (localStorage); não são enviadas a lugar nenhum.

> **Nota sobre o ambiente Claude Code na web:** a política de rede deste
> ambiente bloqueia o acesso direto à PGFN e às APIs de CNPJ, por isso o
> download/enriquecimento **deve ser executado na sua máquina**. O código,
> o dashboard e o dataset de exemplo foram entregues e validados aqui.
