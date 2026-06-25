# Captação CNPJ — cruzamento de clientes PF com a base de sócios da Receita Federal

Ferramenta do comitê de gestão/comercial para **identificar oportunidades de
captação**: a partir da lista de clientes **pessoa física** da área penal,
descobre em quais **empresas (CNPJ)** eles são sócios e traz dados úteis para
abordagem comercial (capital social, área de atuação/CNAE, porte, situação
cadastral, telefone e e-mail).

A ideia: o cliente PF da área penal pode ser sócio de uma PJ que **ainda não é
cliente do escritório** → novo trabalho a vender (tributário, trabalhista,
societário, compliance etc.).

---

## ⚠️ Leia antes de tudo: a limitação do CPF mascarado

A base pública da Receita expõe, na tabela de **Sócios**, o nome do sócio e o
**CPF mascarado** — apenas os 6 dígitos centrais: `***NNNNNN**`. Consequências:

- **O cruzamento é feito por NOME.** Nomes comuns geram **homônimos**
  ("ANA PAULA PEREIRA" pode ser dezenas de pessoas diferentes).
- O sistema **sinaliza** o risco de homônimo (quantos CPFs distintos existem
  para aquele nome) na coluna **Confiança**.
- **Se você adicionar uma coluna `CPF` na planilha**, o sistema calcula o CPF
  mascarado e **confirma o match com precisão**, descartando homônimos
  automaticamente (confiança "ALTA — confirmado por CPF"). **Recomendo
  fortemente** incluir o CPF dos clientes — é o que transforma a lista de
  "possíveis" em "certos".

| Cenário na planilha | Resultado |
|---|---|
| Só o nome | Funciona, mas com homônimos sinalizados (revisão manual) |
| Nome + CPF | Match confirmado, homônimos descartados sozinhos |

---

## Como funciona (arquitetura)

Três passos, todos em Python + [DuckDB](https://duckdb.org) (não precisa de
servidor de banco como Postgres):

```
baixar_dados.py   →  construir_base.py   →  cruzar_clientes.py
 (baixa da RFB)       (CSV → cnpj.duckdb)     (planilha → planilha preenchida)
```

1. **`baixar_dados.py`** — baixa e descompacta os dados abertos de CNPJ da
   Receita Federal (competência mais recente).
2. **`construir_base.py`** — carrega os CSVs em um arquivo `cnpj.duckdb` com as
   tabelas `empresas`, `socios`, `estabelecimentos` e tabelas de domínio.
3. **`cruzar_clientes.py`** — lê sua planilha, normaliza os nomes (maiúsculas,
   sem acentos), cruza com os sócios PF, junta capital social + CNAE + contato,
   e gera a **planilha preenchida**.

### Normalização de nomes
Os dois lados do cruzamento passam pela **mesma** regra: maiúsculas, sem
acentos, só letras e espaços. Assim "Aline Gonçalves Mendonça" casa com
"ALINE GONCALVES MENDONCA".

---

## Requisitos de máquina

A base completa é grande. **Não rode em servidor pequeno/sandbox.**

- **Disco:** ~5 GB (zips) + ~17 GB (CSVs) + ~15 GB (`cnpj.duckdb`) → reserve **~40 GB**.
- **RAM:** 8 GB funciona; 16 GB é confortável.
- **Tempo:** download depende da internet; a carga no DuckDB leva poucos minutos.
- **Modo enxuto** (`--enxuto`): pula a tabela Estabelecimentos (sem CNAE/e-mail/
  telefone, mas baixa ~1/3 do tamanho) caso você só queira empresa + capital social.

---

## Passo a passo

```bash
cd captacao-cnpj
pip install -r requirements.txt

# 1) baixar (detecta a competência mais recente automaticamente)
python baixar_dados.py
#    ou uma competência específica:  python baixar_dados.py 2025-05
#    ou versão menor:                python baixar_dados.py 2025-05 --enxuto

# 2) construir o banco (use a MESMA competência mostrada acima)
python construir_base.py 2025-05

# 3) cruzar com a sua planilha
python cruzar_clientes.py "Clientes_PF_TPC.xlsx" --aba ADVWin
#    se a planilha tiver coluna de CPF, ele usa automaticamente;
#    para forçar nomes de colunas:
#    python cruzar_clientes.py "Clientes_PF_TPC.xlsx" --col-cliente Cliente --col-cpf CPF
```

### O que sai

`saida/<nome>_PREENCHIDA.xlsx`, contendo:

- **Aba original** (ex.: `ADVWin`) com `Empresa` e `Capital Social` preenchidos
  com o **melhor match** (empresa de maior capital social) de cada cliente.
- **Aba `Captacao_Detalhe`** — uma linha por (cliente × empresa) com:
  Confiança · Razão Social · CNPJ · Capital Social · Porte · Natureza Jurídica ·
  Qualificação do Sócio · Entrada na Sociedade · Situação Cadastral ·
  **Área de Atuação (CNAE)** · Município/UF · Telefone · E-mail.
- **Aba `Sem_Match`** — clientes para os quais nenhuma empresa foi localizada.

---

## Dicas para priorizar a captação

Na aba `Captacao_Detalhe`, ordene/filtre por:

1. **Confiança = ALTA** (se usou CPF) ou **MÉDIA** primeiro; deixe os "BAIXA —
   homônimo" para revisão manual.
2. **Situação Cadastral = Ativa** (descarte baixadas/inaptas).
3. **Capital Social** decrescente e **Porte** (EPP/Demais primeiro) — empresas
   maiores tendem a ter mais demandas jurídicas.
4. **Área de Atuação (CNAE)** — cruze com as áreas do escritório (ex.: indústria
   → ambiental/tributário; tech → societário/contratos; transporte → trabalhista).

Telefone e e-mail já vêm da base para facilitar o primeiro contato.

---

## Por que esta abordagem (comparação dos repositórios)

Avaliei os principais projetos do ecossistema antes de montar o pipeline:

| Projeto | O que é | Uso aqui |
|---|---|---|
| **[aphonsoar/Receita_Federal…CNPJ](https://github.com/aphonsoar/Receita_Federal_do_Brasil_-_Dados_Publicos_CNPJ)** | ETL completo dos dados → **PostgreSQL** | Ótima referência de layout. Exige subir um Postgres; mais pesado de operar. |
| **[turicas/socios-brasil](https://github.com/turicas/socios-brasil)** | Extrai o quadro de sócios em formato legível | Foco exatamente no nosso problema (sócios), mas nasceu no **formato antigo** (pré-2021); requer atenção à versão dos dados. |
| **[cuducos/minha-receita](https://github.com/cuducos/minha-receita)** | Sobe uma **API** de consulta **por CNPJ** | Excelente para enriquecer um CNPJ já conhecido — **não** busca por nome de sócio (que é o nosso ponto de partida). |
| **[rictom/rede-cnpj](https://github.com/rictom/rede-cnpj)** | **Visualização de rede** sócio↔empresa | Ótimo complemento para investigar grupos econômicos depois que o match é confirmado. |
| **[fabioserpa/CNPJ-full](https://github.com/fabioserpa/CNPJ-full)** | CSV/SQLite a partir dos dados | Alternativa leve; nossa versão DuckDB segue a mesma filosofia, porém consulta os CSVs direto. |

**Decisão:** como o nosso ponto de partida é o **nome do sócio** (e não o CNPJ),
nenhuma API pronta resolve — é preciso varrer a tabela de sócios inteira. O
**DuckDB** faz esse JOIN em uma máquina comum, sem instalar servidor de banco,
lendo os CSVs oficiais direto. Os scripts seguem o **layout oficial** (o mesmo
documentado pelo aphonsoar). Para aprofundar um caso específico depois do match,
o **rede-cnpj** é a ferramenta de visualização recomendada.

---

## ⚖️ Aspectos jurídicos / LGPD (atenção)

Você é o advogado — mas registro os pontos de atenção sobre o uso da ferramenta:

- **Origem dos dados:** são **dados públicos** disponibilizados pela própria
  Receita Federal (Dados Abertos do CNPJ). O quadro societário de PJ é, por
  natureza, informação pública.
- **Finalidade e base legal (LGPD):** o tratamento para prospecção precisa de
  base legal — tipicamente **legítimo interesse** (art. 7º, IX) — com
  **finalidade específica**, registro do tratamento e respeito aos direitos do
  titular. Documente a finalidade ("desenvolvimento comercial do escritório").
- **Minimização e segurança:** trate apenas o necessário, restrinja o acesso à
  planilha de saída (contém nome + vínculos societários) e não a compartilhe
  fora do comitê.
- **Marketing/contato:** ao usar telefone/e-mail para abordagem, observe regras
  de comunicação não solicitada e ofereça opt-out.
- **Não confundir com antecedentes:** esta base é **societária/cadastral**, não
  é consulta de processos nem de antecedentes criminais do cliente.
- **Conflito de interesses:** ao prospectar a **PJ** de um cliente PF da área
  penal, avalie eventual conflito antes da abordagem.

> A ferramenta apenas organiza dados públicos; a decisão de uso e a conformidade
> ficam a cargo do escritório.

---

## Próximas melhorias possíveis

- **Matching fuzzy** (apelidos, abreviações, nome do meio faltando) com score.
- **Coluna de CPF** na planilha de origem → precisão máxima (ver acima).
- Reaproveitar `cnpj.duckdb` para outras análises (carteiras de outras áreas).
- Integrar `rede-cnpj` para mapear grupos econômicos dos clientes.
