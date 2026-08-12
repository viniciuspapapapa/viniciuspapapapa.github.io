# Empresas de MG com exposição potencial a risco ambiental

Sistema de inteligência comercial para **prospecção jurídica B2B**: identifica
empresas de pequeno e médio porte sediadas em **Minas Gerais** cuja **atividade
econômica declarada** está sujeita a licenciamento, controle e fiscalização
ambiental — e prepara a base para que a equipe jurídica faça, **manualmente e
em fonte oficial**, a verificação de eventuais procedimentos.

```
DADOS PÚBLICOS DE CNPJ (Receita Federal)
  → empresas de Minas Gerais
  → CNAEs de exposição ambiental (principal E secundários)
  → exclusão de grande porte
  → score de prioridade explicável
  → planilha de EMPRESAS  +  planilha SEPARADA de SÓCIOS
  → base pronta para pesquisa jurídica MANUAL
```

---

## ⚠️ Leia isto antes de usar

**O que o sistema faz:** seleciona empresas cuja atividade, por sua natureza,
é potencialmente poluidora ou utilizadora de recursos ambientais — segundo a
classificação oficial do **Anexo VIII da Lei nº 6.938/1981**.

**O que o sistema NÃO faz:**

- não pesquisa inquéritos, ações penais, termos circunstanciados ou denúncias;
- não afirma, não sugere e não presume que qualquer empresa listada tenha
  praticado infração administrativa, ilícito civil ou crime;
- não classifica ninguém como "infrator", "investigado" ou equivalente.

O score é **prioridade de verificação**, não probabilidade de irregularidade.
Toda empresa da base está em **situação de regularidade presumida** até que
verificação individual, em fonte oficial, demonstre o contrário.

---

## Instalação

```bash
cd etl/ambiental
pip install -r requirements.txt      # apenas openpyxl, para gerar .xlsx
```

O pipeline lê e processa os dados usando **somente a biblioteca padrão** do
Python 3.10+. `openpyxl` é necessário apenas para as planilhas `.xlsx`.

---

## Uso

### 1) Conhecer a ferramenta sem baixar nada (amostra sintética)

```bash
cd src
python gerar_amostra.py --saida ../data/raw/DEMO --empresas 400
python main.py --dados ../data/raw/DEMO --saida ../data/output_demo
```

Gera dados **fictícios** no layout exato da Receita Federal e roda o pipeline
inteiro em segundos. Serve para conhecer as planilhas e para testar alterações
de configuração. **Os dados não têm valor de prospecção.**

### 2) Baixar os dados reais da Receita Federal

```bash
./baixar.sh --listar            # ver o que há na competência
./baixar.sh --tudo              # competência inteira (~7,7 GB)
COMP=2026-07 ./baixar.sh --tudo # outra competência
```

Os downloads são **retomáveis**: reexecutar continua de onde parou. Baixar
tudo leva algumas horas em conexão doméstica. Se quiser começar menor, os
arquivos mínimos são as tabelas de domínio + `Estabelecimentos*` +
`Empresas*`:

```bash
./baixar.sh Cnaes.zip Municipios.zip Naturezas.zip Qualificacoes.zip Motivos.zip
./baixar.sh Estabelecimentos0.zip Empresas0.zip Socios0.zip Simples.zip
```

> Os arquivos `Estabelecimentos*` são particionados por hash do CNPJ, **não por
> UF**. Para cobertura completa de Minas Gerais é preciso baixar os dez.

### 3) Gerar a base

```bash
cd src
python main.py --dados ../data/raw/2026-08 --saida ../data/output
```

Recortes comerciais:

```bash
# só mineração, alta prioridade
python main.py --dados ../data/raw/2026-08 --saida ../data/output \
    --setor "Mineração" --grau A

# frigoríficos e laticínios da Zona da Mata, score mínimo 70
python main.py --dados ../data/raw/2026-08 --saida ../data/output \
    --setor "alimentos" --min-score 70 --municipio "Juiz de Fora"
```

| Flag | Padrão | Descrição |
|---|---|---|
| `--dados` | — | pasta com os arquivos da RFB |
| `--saida` | `../data/output` | pasta de saída |
| `--min-score N` | `0` | score mínimo |
| `--grau A,B` | — | filtra por grau de prioridade |
| `--setor TEXTO` | — | filtra por setor (busca parcial) |
| `--municipio TEXTO` | — | filtra por município |
| `--limite-xlsx N` | `5000` | máximo de linhas no `.xlsx` (`0` = todas) |
| `--incluir-baixadas` | desligado | mantém empresas BAIXADA/NULA |
| `--sem-socios` | desligado | não processa o quadro societário |
| `--amostra N` | `0` | lê só N linhas por arquivo (teste rápido) |

O **CSV sempre leva a base completa** (auditoria); o **XLSX leva as de maior
score** (uso comercial) — é o princípio "qualidade > quantidade".

---

## Arquivos gerados

| Arquivo | Conteúdo |
|---|---|
| `empresas_risco_ambiental_mg.xlsx` | base principal, priorizada, com abas `LEIA-ME`, `MATRIZ_CNAE`, `MAPA_MUNICIPIOS`, `PROCESSOS` e `FONTES` |
| `socios_empresas_risco_ambiental_mg.xlsx` | quadro societário — **arquivo separado**, uso restrito |
| `empresas_risco_ambiental_mg.csv` | base completa, para auditoria |
| `socios_empresas_risco_ambiental_mg.csv` | sócios, completo |
| `mapa_municipios_mg.json` | agregados por município (com código IBGE) para mapa temático |
| `relatorio_execucao.md` / `.json` | funil, distribuições, qualidade e fontes |
| `../logs/pipeline.log` | log de processamento |

---

## Como a seleção funciona

### Matriz de CNAEs — `config/cnaes_risco_ambiental.json`

**479 subclasses** CNAE (de 1.359 oficiais), cada uma com setor, categoria do
Anexo VIII, grau Pp/gu, peso 0–10, justificativa e fundamento normativo.

A matriz é **gerada a partir da lista oficial da Receita Federal**, não digitada
à mão:

```bash
cd src
python construir_matriz.py --cnaes ../data/raw/2026-08/Cnaes.zip \
    --saida ../config/cnaes_risco_ambiental.json
```

As regras são declaradas por prefixo (divisão/grupo) ou código exato e
expandidas contra a tabela oficial — **um código que não exista na tabela da
RFB não entra na matriz**, e o script avisa. As descrições são sempre as
oficiais da RFB, sem paráfrase.

Para **incluir ou ajustar um CNAE sem mexer em código**, edite o JSON e marque
`"origem": "manual"`; ao regerar, use `--preservar-manual`.

### Não é só o CNAE principal

Requisito central: a empresa entra se **qualquer** CNAE — principal **ou
secundário** — for de exposição ambiental. Uma transportadora com CNAE
secundário de extração de areia entra; um restaurante com secundário de
beneficiamento de carvão mineral entra.

A empresa é classificada pela **atividade de maior exposição**, seguindo a
regra do **art. 17-D, § 3º, da Lei nº 6.938/1981** (havendo mais de uma
atividade fiscalizável no estabelecimento, considera-se a de maior grau).

As colunas `CNAES_RISCO` e `CNAE_MAIOR_EXPOSICAO` registram exatamente quais
códigos justificaram a inclusão.

### Score — `config/parametros_score.json`

| Fator | Máx. | O que mede |
|---|---:|---|
| Atividade de maior exposição | 45 | maior peso da matriz entre todos os CNAEs |
| Acúmulo de atividades de risco | 15 | quantas atividades de risco distintas |
| Aderência da atividade principal | 10 | risco na principal (10) ou só em secundária (4) |
| Adequação ao perfil de porte | 15 | médio (15) › pequeno (12) › micro (10) › MEI (5) › grande (0) |
| Maturidade operacional | 10 | anos de atividade |
| Concentração setorial no município | 5 | município-polo do setor |

Ajuste negativo por situação cadastral diversa de ATIVA. Faixas: **A ≥ 70**,
**B 45–69**, **C < 45**.

Toda empresa traz `LOGICA_DA_CLASSIFICACAO` com a origem de cada ponto:

> Score 94/100 — Grau A (Alta prioridade). Atividade de maior exposição (+45):
> Extração de basalto e beneficiamento associado (CNAE 0810009, principal) —
> exposição muito alta, peso 10/10; Anexo VIII categoria 01, Pp/gu Alto |
> Acúmulo de atividades de risco (+12): 5 CNAEs de risco | Adequação ao perfil
> de porte (+12): porte PEQUENO (optante do Simples Nacional) | (…)

### Porte — o problema e a solução

A RFB só publica quatro valores de porte, e o código **05 ("DEMAIS") agrupa
médio E grande**. Não há receita bruta na base. Em vez de arbitrar, combinam-se
sinais objetivos, cada um registrado em `MOTIVO_EXCLUSAO_PORTE`:

| Sinal | Natureza | Efeito |
|---|---|---|
| Natureza jurídica (S.A. aberta, empresa pública, economia mista) | categórico | exclui |
| ≥ 20 estabelecimentos no CNPJ raiz | categórico, calculado na base | exclui |
| Capital social ≥ R$ 12 mi | **proxy** (art. 17-D, § 1º, III, da Lei 6.938/81) | exclui, desativável |
| Optante do Simples Nacional | ato oficial | **afasta** a presunção de grande porte |

Sem sinal suficiente, a empresa **não é excluída nem chutada**: fica
`NAO_IDENTIFICADO` e permanece na base, sinalizada.

Os códigos de natureza jurídica da configuração são **conferidos contra a
tabela oficial da RFB a cada execução** — divergência interrompe o pipeline.

### Situação cadastral

`ATIVA` inclui · `SUSPENSA` e `INAPTA` incluem com score reduzido (avaliar
separadamente) · `BAIXADA` e `NULA` excluem (reversível com
`--incluir-baixadas`).

---

## Pesquisa jurídica manual (etapa posterior)

A planilha já vem com as colunas de acompanhamento **em branco**:

- `STATUS_PESQUISA_CRIMINAL` — NÃO PESQUISADO · EM PESQUISA · SEM RESULTADOS
  IDENTIFICADOS · RESULTADO IDENTIFICADO · NECESSITA ANÁLISE · DESCARTADO
- `OBSERVACOES_PESQUISA_CRIMINAL`
- aba `PROCESSOS` — modelo vazio para registrar processos efetivamente
  identificados

> **Não existe "número CNJ" no cadastro da Receita Federal.** O identificador
> da empresa é o **CNPJ**. O número CNJ só existe quando há processo — e só
> deve ser preenchido se um processo real for localizado em fonte oficial.

Fontes para a verificação manual: TJMG, TRF6/JFMG, MPMG, MPF, Polícia Civil,
Polícia Federal, Diários Oficiais, portais de transparência, **FEAM/SEMAD/IEF e
IBAMA** (autos de infração e licenciamento).

> A **ausência de resultado** em uma fonte não significa inexistência de
> procedimento — significa apenas que aquela consulta nada retornou.

---

## Proteção de dados (LGPD)

- Dados de sócios ficam em **arquivo separado**, jamais na base principal —
  mesma lógica do projeto de Dívida Ativa deste repositório.
- O **CPF já vem mascarado pela própria Receita Federal** (`***XXXXXX**`). O
  pipeline **não desmascara, não completa e não cruza** esse dado.
- Não são coletados endereço residencial, telefone pessoal nem e-mail pessoal
  de sócio.
- Base legal do dado: registro empresarial é **público** por força do art. 29
  da Lei nº 8.934/1994. Finalidade: prospecção B2B legítima.
- A coluna `E_ADMINISTRADOR` é **indicação cadastral** de quem dirige a
  atividade — não é atribuição de responsabilidade a ninguém.

---

## Fontes

| Fonte | Uso |
|---|---|
| [Dados Abertos do CNPJ — RFB](https://arquivos.receitafederal.gov.br/) | cadastro de empresas, estabelecimentos, sócios, Simples e tabelas de domínio |
| [IBGE — API de Localidades](https://servicodados.ibge.gov.br/api/v1/localidades/estados/31/municipios) | códigos IBGE dos 853 municípios de MG |
| [Lei nº 6.938/1981, Anexo VIII](https://www.planalto.gov.br/ccivil_03/leis/l6938.htm) | classificação oficial das atividades potencialmente poluidoras e seu grau Pp/gu |
| Lei nº 9.605/1998 e resoluções CONAMA | fundamentação da exposição de cada grupo de CNAEs |

A aba `FONTES` da planilha e o `relatorio_execucao.md` trazem, para cada
fonte, os campos extraídos, a data de acesso e as **limitações**.

### Limitações que o usuário precisa conhecer

1. **O CNAE é autodeclarado.** Pode não refletir a atividade efetivamente
   exercida — para mais ou para menos. Empresa com CNAE de risco pode não
   exercê-lo; empresa sem CNAE de risco pode exercer atividade impactante.
2. **A base é um retrato mensal**, com defasagem. Confirme a situação atual
   antes de qualquer abordagem.
3. **Porte é inferido por sinais**, não medido: a RFB não publica receita bruta.
4. **A correspondência categoria do Anexo VIII → CNAE é interpretativa.** A lei
   classifica categorias de atividade, não códigos CNAE. A interpretação está
   documentada código a código na aba `MATRIZ_CNAE`.
5. **Só a sede (matriz) e os estabelecimentos registrados em MG** entram nesta
   versão. Empresa sediada em outro estado com operação relevante em MG só
   aparece se tiver estabelecimento inscrito em MG.
6. **Licenciamento ambiental não é consultado.** Saber se a empresa tem licença
   válida exige consulta aos sistemas de FEAM/SEMAD — etapa manual.

---

## Estrutura

```
etl/ambiental/
├── baixar.sh                       download resiliente e retomável (RFB)
├── config/
│   ├── cnaes_risco_ambiental.json  matriz de CNAEs (479 subclasses)
│   ├── parametros_score.json       pesos, porte, situação cadastral
│   └── municipios_mg_ibge.json     cache dos códigos IBGE de MG
├── src/
│   ├── construir_matriz.py         gera a matriz a partir da lista oficial
│   ├── comum.py                    layouts da RFB, normalização, leitura
│   ├── referencias.py              tabelas de domínio e cruzamento IBGE
│   ├── cnae.py                     avaliação principal + secundários
│   ├── filtro_porte.py             classificação e exclusão por porte
│   ├── scoring.py                  score explicável
│   ├── socios.py                   quadro societário (planilha separada)
│   ├── qualidade.py                verificações automáticas
│   ├── exportacao.py               XLSX, CSV, mapa, relatório
│   ├── gerar_amostra.py            amostra sintética para teste
│   └── main.py                     orquestração
├── testes.py                       testes de regressão (python testes.py)
├── data/{raw,processed,output}/    dados brutos e saídas (não versionados)
├── logs/
└── requirements.txt
```

Antes de alterar pesos, filtros ou configuração, rode `python testes.py` —
são 51 verificações sobre o que quebra em silêncio (validação de CNPJ,
formatos da RFB, precedência da matriz, exclusão de porte, faixas do score).

---

## Atualização periódica

A RFB publica uma competência por mês. Para atualizar:

```bash
COMP=2026-09 ./baixar.sh --tudo
cd src && python main.py --dados ../data/raw/2026-09 --saida ../data/output
```

O `CNPJ` é o identificador único e a base é reconstruída a cada execução, sem
duplicidades. `MATRIZ_FILIAL` e `CNPJ_BASICO` preservam a relação entre matriz
e filiais. Vale reexecutar `construir_matriz.py` a cada nova competência: a
tabela de CNAEs da RFB muda de tempos em tempos, e o script avisa se alguma
regra deixou de casar.
