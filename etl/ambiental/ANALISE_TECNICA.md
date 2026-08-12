# Análise técnica do projeto

Documento de decisões de arquitetura, anterior e paralelo ao código. Responde
aos itens A–I do escopo.

---

## A. Arquitetura proposta

**Decisão central: processamento local sobre a base bruta da Receita Federal,
sem API de consulta individual.**

A alternativa óbvia — consultar CNPJ a CNPJ em APIs públicas (BrasilAPI, Minha
Receita) — foi descartada como fonte primária por três razões:

1. **Não permite descobrir.** Uma API de consulta responde "o que é este CNPJ";
   ela não responde "quais empresas de MG têm CNAE de mineração". A pergunta do
   projeto é de *seleção*, não de *consulta*.
2. **Rate limit.** Selecionar sobre ~1,5 milhão de estabelecimentos mineiros
   exigiria milhões de requisições.
3. **Reprodutibilidade.** A base bruta é uma competência datada e imutável; a
   API responde o estado do momento, o que impede reexecutar e obter o mesmo
   resultado.

A API pública permanece útil como **enriquecimento pontual** de um recorte
pequeno (telefone/e-mail atualizados dos 200 melhores leads) — exatamente o
papel que ela tem no projeto de Dívida Ativa deste repositório.

**Fluxo:**

```
ETAPA 1  ingestão      baixar.sh — WebDAV da RFB, retomável
ETAPA 2  limpeza       normalização de CNPJ, datas, valores, municípios, CNAEs
ETAPA 3  geografia     filtro UF = MG
ETAPA 4  atividade     matriz de CNAEs — principal E secundários
ETAPA 5  porte         sinais objetivos, exclusão auditável
ETAPA 6  score         6 fatores, explicável linha a linha
ETAPA 7  enriquecimento  natureza jurídica, Simples/MEI, código IBGE
ETAPA 8  sócios        planilha separada
ETAPA 9  exportação    XLSX + CSV + mapa + relatório
ETAPA 10 (manual)      pesquisa jurídica individualizada pela equipe
```

**Stack: Python 3.10+ e biblioteca padrão.** Nem Pandas, nem Polars, nem banco.

Justificativa: o processamento é um *scan* sequencial com filtro — o padrão de
acesso é streaming, não analítico. Ler os `.zip` com `zipfile` + `csv` e
filtrar linha a linha mantém o uso de memória proporcional ao **resultado**
(empresas de MG com CNAE de risco), não à **entrada** (~66 milhões de
estabelecimentos). Carregar tudo em DataFrame exigiria dezenas de GB de RAM
sem ganho: não há junção complexa nem agregação analítica pesada.

Consequência prática: **roda no notebook de qualquer pessoa da equipe**, sem
instalar nada além de `openpyxl` (e este só para o `.xlsx`).

O módulo `comum.py` valida o número de colunas de cada arquivo contra o layout
oficial e **aborta** se divergir — o layout da RFB já mudou antes, e falhar
alto é melhor do que gerar base silenciosamente errada.

---

## B. Fontes de dados

| Fonte | Papel | Situação |
|---|---|---|
| **Dados Abertos do CNPJ (RFB)** | fonte primária: estabelecimentos, empresas, sócios, Simples, tabelas de domínio | ✅ verificada e em uso |
| **IBGE — API de Localidades** | códigos IBGE dos 853 municípios de MG | ✅ verificada e em uso |
| **Lei 6.938/81, Anexo VIII** | classificação oficial de atividade potencialmente poluidora e grau Pp/gu | ✅ texto conferido no Planalto |
| **Lei 9.605/98 + resoluções CONAMA** | fundamentação jurídica da exposição de cada grupo | ✅ citadas na matriz |
| **DN COPAM/MG 217/2017** | moldura estadual de porte × potencial poluidor | ⚠️ referenciada, **não** vinculada código a código |
| **SISEMA / FEAM / IEF (autos e licenças)** | autos de infração e licenciamento em MG | ❌ fora desta versão |
| **Tribunais, MP, polícias** | procedimentos criminais | ❌ **deliberadamente fora** (requisito 13) |

**Nota importante sobre o endereço da RFB.** A Receita migrou os Dados Abertos
do CNPJ para um compartilhamento público SERPRO+ (Nextcloud). O endereço antigo
(`dadosabertos.rfb.gov.br/CNPJ/`) não responde mais. O acesso atual é por
WebDAV em `arquivos.receitafederal.gov.br`, com o token público do
compartilhamento — está implementado em `baixar.sh`.

**Sobre a DN COPAM 217/2017.** Seria a âncora estadual ideal, por classificar
atividades por porte e potencial poluidor especificamente em Minas Gerais. Mas
ela usa **nomenclatura própria de atividades, não CNAE**. Construir a
correspondência DN↔CNAE automaticamente produziria vínculos inventados — o que
o escopo proíbe. Por isso a DN é citada como moldura, e o vínculo por código
fica como enriquecimento manual futuro, a ser feito por quem conheça a
listagem.

---

## C. Matriz de CNAEs

**Problema:** o escopo veda uma "lista genérica inventada de CNAEs".

**Solução: regras declarativas expandidas contra a lista oficial da RFB.**

`src/construir_matriz.py` declara regras por prefixo (divisão/grupo) ou código
exato, cada uma com setor, categoria do Anexo VIII, peso, justificativa e
fontes. As regras são então expandidas contra as **1.359 subclasses oficiais**
do arquivo `Cnaes.zip` da RFB. Disso decorre que:

- **nenhum código é digitado como se fosse oficial** — se não existe na tabela
  da RFB, não entra, e o script avisa;
- **a descrição é sempre a oficial da RFB**, sem paráfrase;
- a precedência é por **especificidade** (código exato > prefixo longo >
  prefixo curto), não por ordem no arquivo — evita que uma regra ampla anule
  silenciosamente um refinamento;
- o JSON gerado é editável à mão (`"origem": "manual"` + `--preservar-manual`),
  atendendo à exigência de atualização sem reconstruir o código.

**Resultado:** 479 subclasses, 35,2% da tabela oficial.

| Exposição | CNAEs |
|---|---:|
| Muito alta (peso 9–10) | 106 |
| Alta (7–8) | 140 |
| Média (5–6) | 221 |
| Baixa (1–4) | 12 |

**Como o peso é atribuído.** A base é o grau **Pp/gu** da categoria do Anexo
VIII (Alto/Médio/Pequeno). Sobre ela incidem ajustes documentados por
relevância **jurídico-criminal** e por **realidade mineira**. Exemplos:

- **Galvanoplastia (2539002) → 10.** O Anexo VIII cita galvanoplastia
  nominalmente três vezes na categoria 03. Efluentes com metais pesados e
  cianetos, borras perigosas — e é atividade típica de pequeno porte.
- **Carvão vegetal de floresta nativa (0220902) → 10.** Liga supressão de
  vegetação nativa ao consumo do parque siderúrgico mineiro; é o elo em que se
  materializa o art. 46 da Lei 9.605/98.
- **Ferro-gusa (2411300) → 10.** Acumula exposição metalúrgica e florestal, pela
  dependência da comprovação de origem do carvão.
- **Extração de areia/argila/brita (0810*) → 10.** Faixa de mineração de
  pequeno porte mais numerosa e mais autuada em MG.
- **Comércio atacadista de madeira (4671100) → 8**, apesar de ser comércio: o
  art. 46 da Lei 9.605/98 tipifica expressamente *receber* e *adquirir* madeira
  sem exigir licença.
- **Borracha e plástico → 4–7**, ainda que o Anexo VIII os classifique como
  Pp/gu *Pequeno*, porque pneu inservível tem logística reversa obrigatória.

Cada entrada carrega sua justificativa e suas fontes, e todas são exportadas na
aba `MATRIZ_CNAE` — a classificação é conferível e contestável linha a linha.

---

## D. Critério de porte

**Problema:** o campo `porte` da RFB tem quatro valores e o código **05
("DEMAIS") agrupa médio E grande porte**. A base **não publica receita bruta**
nem número de empregados — os critérios legais de porte. Excluir grande porte
usando só esse campo é impossível.

**Solução: múltiplos sinais, cada um registrado, nenhum arbitrado.**

| Sinal | Natureza | Efeito | Fundamento |
|---|---|---|---|
| S.A. aberta, empresa pública, economia mista | **categórico** | exclui | tabela oficial de naturezas jurídicas da RFB |
| ≥ 20 estabelecimentos no CNPJ raiz | **categórico**, calculado na base | exclui | contagem nacional na própria base da RFB |
| Capital social ≥ R$ 12 mi | **proxy** | exclui (desativável) | limiar do art. 17-D, § 1º, III, da Lei 6.938/81 |
| Optante do Simples Nacional | **ato oficial** | afasta presunção de grande porte | LC 123/2006 |

Distinções que sustentam a defensabilidade:

- **Categórico prevalece sobre o campo `porte`.** Companhia aberta não é
  público-alvo ainda que a RFB registre outro porte.
- **Proxy não prevalece sobre ato oficial.** Se a empresa é optante do Simples,
  a receita está por definição dentro do teto legal e a presunção derivada do
  capital social cai. Capital social **não é** receita bruta — isso está dito
  na configuração e no relatório, e o critério pode ser desligado.
- **Sem sinal suficiente, não se chuta.** A empresa recebe
  `NAO_IDENTIFICADO`, permanece na base e é sinalizada, exatamente como manda o
  escopo. `MOTIVO_EXCLUSAO_PORTE` torna toda exclusão auditável e reversível.

**Salvaguarda contra erro de configuração.** Um código de natureza jurídica
errado excluiria empresas do público-alvo sem deixar rastro. Por isso os
códigos configurados são **conferidos contra a tabela oficial da RFB a cada
execução**, e a divergência **interrompe** o pipeline. Essa proteção foi
acrescentada depois que um erro real ocorreu durante o desenvolvimento: o
código 2062 havia sido rotulado como "S.A. Fechada de Capital Autorizado"
quando, na tabela oficial, é **Sociedade Empresária Limitada** — a forma
societária mais comum entre PMEs. Sem a conferência, o filtro teria eliminado
boa parte do público-alvo silenciosamente.

---

## E. Modelo de dados

```
EMPRESAS                                  SOCIOS
├── ID_EMPRESA        (MG000001)  ←──┐    ├── ID_EMPRESA
├── CNPJ              (14 díg.)      ├───→├── CNPJ_BASICO   ← chave de junção
├── CNPJ_BASICO       (raiz, 8)  ←───┘    ├── CNPJ
├── ...52 colunas                         ├── NOME_SOCIO
└── STATUS_PESQUISA_CRIMINAL              ├── QUALIFICACAO
                                          ├── E_ADMINISTRADOR
PROCESSOS  (vazia — só se houver processo)└── ...18 colunas
├── ID_EMPRESA / CNPJ
├── NUMERO_PROCESSO_CNJ
└── ...14 colunas                    MAPA_MUNICIPIOS
                                     ├── MUNICIPIO / CODIGO_IBGE
MATRIZ_CNAE  (documentação)          ├── QTD_EMPRESAS / SCORE_MEDIO
└── CNAE / peso / justificativa      └── SETORES_PREDOMINANTES
```

**A chave de junção com SOCIOS é o `CNPJ_BASICO`, não o CNPJ completo.** O
quadro societário é da **empresa** (raiz), não do estabelecimento; usar o CNPJ
completo deixaria toda filial sem sócios. `MATRIZ_FILIAL` + `CNPJ_BASICO`
preservam a relação matriz–filial exigida pelo item 17 do escopo, sem tratar
filial como empresa independente.

**Sobre o "número CNJ".** Não existe número CNJ no cadastro da Receita Federal.
O identificador da empresa é o **CNPJ**. O número CNJ só passa a existir quando
há processo — por isso a tabela `PROCESSOS` é separada e nasce **vazia**, para
preenchimento apenas quando um processo real for localizado em fonte oficial.

---

## F. Algoritmo de score

Seis fatores, soma 100, cada um com máximo e justificativa própria:

| Fator | Máx. | Eixo |
|---|---:|---|
| Atividade de maior exposição | 45 | risco ambiental |
| Acúmulo de atividades de risco | 15 | risco ambiental |
| Aderência da atividade principal | 10 | risco ambiental |
| Adequação ao perfil de porte | 15 | comercial |
| Maturidade operacional | 10 | comercial |
| Concentração setorial no município | 5 | comercial |

**Decisões de projeto:**

1. **O fator dominante é a atividade de MAIOR exposição, não o CNAE
   principal** — fundamento no art. 17-D, § 3º, da Lei 6.938/81, que manda
   considerar a atividade de maior grau quando há mais de uma. É o que faz o
   requisito 7 funcionar de verdade.
2. **Os dois eixos são declarados e separados.** Exposição ambiental e
   adequação comercial são coisas distintas; misturá-las sem dizer produziria
   um número que ninguém sabe interpretar. Empresa de grande porte zera o fator
   comercial mas mantém o de exposição — porque a exposição existe, apenas ela
   não é público-alvo.
3. **Concentração municipal é calculada sobre a própria base**, por percentil
   dentro de cada setor — identifica os polos setoriais (o requisito cita
   "regiões com forte concentração dessas atividades") sem lista fixa de
   municípios.
4. **O resultado é explicável.** `LOGICA_DA_CLASSIFICACAO` traz, por empresa, a
   origem de cada ponto, e termina sempre com a ressalva de que o indicador é
   de prioridade de verificação, não de irregularidade.

Todos os pesos e faixas estão em `config/parametros_score.json` e podem ser
ajustados sem tocar em código.

---

## G. Estrutura dos arquivos produzidos

| Arquivo | Público | Conteúdo |
|---|---|---|
| `empresas_risco_ambiental_mg.xlsx` | equipe comercial/jurídica | base priorizada + abas `LEIA-ME`, `MATRIZ_CNAE`, `MAPA_MUNICIPIOS`, `PROCESSOS`, `FONTES` |
| `socios_empresas_risco_ambiental_mg.xlsx` | **acesso restrito** | quadro societário, arquivo separado |
| `empresas_risco_ambiental_mg.csv` | auditoria | base completa, sem corte |
| `mapa_municipios_mg.json` | futura visualização | agregados por município com código IBGE |
| `relatorio_execucao.md` / `.json` | auditoria | funil, distribuições, qualidade, fontes |
| `logs/pipeline.log` | auditoria | log de processamento |

O XLSX leva as de maior score (padrão 5.000) e o CSV leva a base completa — o
princípio "qualidade > quantidade" aplicado sem perder rastreabilidade. A aba
`LEIA-ME` abre a planilha dizendo o que ela é e o que ela **não** é: quem
receber o arquivo sem contexto lê o aviso antes dos dados.

---

## H. Limitações

**Jurídicas**

1. **Exposição não é indício.** Atividade potencialmente poluidora é atividade
   **lícita e regulada**. Nada na base sugere irregularidade de quem quer que
   seja, e a linguagem de toda a saída foi construída para não permitir essa
   leitura.
2. **Licenciamento não é consultado.** Saber se a empresa tem licença válida
   exige consulta ao SISEMA/FEAM — etapa manual.
3. **LGPD.** Dado de sócio é pessoal. Fica em arquivo separado, com CPF
   mascarado na origem, sem endereço/telefone/e-mail pessoal, sob finalidade
   legítima declarada (art. 7º, IX, e art. 10 da Lei 13.709/2018) e base legal
   de publicidade do registro empresarial (art. 29 da Lei 8.934/1994).
4. **Risco reputacional.** Uma lista de empresas nominadas com rótulo de "risco
   ambiental" pode ser lida como acusação se circular fora de contexto. Por
   isso a saída **não é publicada** no GitHub Pages e o `.gitignore` bloqueia
   os artefatos gerados — mesma decisão já adotada no projeto de Dívida Ativa.

**Técnicas**

5. **O CNAE é autodeclarado** — pode não refletir a atividade real, para mais
   ou para menos. É a limitação mais relevante de todas, porque afeta tanto
   falsos positivos quanto falsos negativos.
6. **Defasagem mensal** da base.
7. **Porte é inferido por sinais**, não medido.
8. **A correspondência Anexo VIII → CNAE é interpretativa** — a lei classifica
   categorias de atividade, não códigos CNAE.
9. **Cobertura geográfica**: apenas estabelecimentos inscritos em MG. Empresa
   de outro estado com operação relevante em MG, sem inscrição local, não
   aparece.
10. **Municípios homônimos**: a tabela de municípios da RFB é nacional e não
    traz UF. O casamento é feito por nome dentro de MG — seguro porque o filtro
    de UF precede a resolução, e conferido no relatório de qualidade.

---

## H-bis. Dimensionamento medido

Execução real sobre `Estabelecimentos0.zip` (≈45% da base nacional):

| Etapa | Registros |
|---|---:|
| Estabelecimentos lidos | 30.008.723 |
| Em Minas Gerais | 3.246.043 |
| Com CNAE de exposição | 568.412 (17,5% de MG) |
| Excluídos por situação cadastral | 221.512 |
| Base resultante | 343.745 |

Custo: **712 s e 3,36 GB de pico**. Extrapolado para a competência inteira:
~26 min, ~8 GB, CSV de ~1,5 GB.

Duas consequências de projeto vieram desta medição:

1. **`--min-peso` filtra na leitura.** A memória passa a ser proporcional ao
   recorte desejado, não ao total de empresas com qualquer exposição. Com
   `--min-peso 7` (exposição Alta e Muito alta) a base cai para ~29% e a
   memória para 2–3 GB — o que devolve o pipeline ao notebook da equipe.
2. **`JUSTIFICATIVA_AMBIENTAL` e `FUNDAMENTO_NORMATIVO` saem do CSV.** São
   constantes por CNAE; repetidas por linha custavam ~650 bytes por registro,
   mais de um terço do arquivo, sem acrescentar informação. Continuam no XLSX e
   na aba `MATRIZ_CNAE`, relacionadas pela coluna `CNAE_MAIOR_EXPOSICAO`. A
   explicação **por empresa** (`LOGICA_DA_CLASSIFICACAO`) permanece no CSV — é
   ela que torna o score auditável.

A distribuição por nível de exposição (Muito alta 6,4%; Alta 22,2%; Média
64,1%; Baixa 7,3%) mostra que o volume está na faixa Média, formada por
atividades numerosas e de exposição difusa — oficinas, comércio, pequenas
agroindústrias. É exatamente a faixa que o corte por peso remove quando o
objetivo é prospecção, e que se mantém quando o objetivo é auditoria.

---

## I. Plano de implementação

| Etapa | Escopo | Estado |
|---|---|---|
| 1 | Mapeamento e validação das fontes; acesso ao WebDAV da RFB | ✅ concluída |
| 2 | Matriz de CNAEs a partir da lista oficial + âncoras normativas | ✅ concluída — 479 subclasses |
| 3 | Pipeline modular (ingestão → limpeza → filtros → porte → score → sócios → exportação) | ✅ concluída |
| 4 | Amostra sintética e validação ponta a ponta | ✅ concluída |
| 5 | Execução sobre a base real de MG | ⏳ em andamento — validada em 45% da base |
| 6 | Enriquecimento pontual dos melhores leads via API de CNPJ | 🔜 próxima |
| 7 | Vínculo CNAE ↔ DN COPAM 217/2017 (manual, com revisão jurídica) | 🔜 futura |
| 8 | Cruzamento com autos de infração e licenças do SISEMA/FEAM | 🔜 futura |
| 9 | Mapa temático de MG (dados já preparados com código IBGE) | 🔜 futura |
| 10 | Painel web de prospecção, nos moldes de `captacao-divida-ativa.html` | 🔜 futura |

A etapa 5 é a única que depende de tempo de rede, não de desenvolvimento: o
código está pronto e validado, e o comando é um só.
