# Índice de Jurisprudência — STJ (Dados Abertos)

Indexador **100% gratuito** (sem chave de API, sem assinatura paga) da
jurisprudência do STJ, a partir da base oficial de dados abertos:

https://dadosabertos.web.stj.jus.br/ — dataset **"Espelhos de Acórdãos"**,
publicado por Turma/Seção/Corte Especial, com número do processo, classe,
órgão julgador, ministro relator, **ementa**, tese jurídica, tema repetitivo,
referências legislativas, jurisprudência citada e data de publicação.

São duas partes, no mesmo espírito do pipeline de captação (`../captacao_divida_ativa.py`):

1. **ETL** (`stj_indexer.py`) — baixa e processa os JSON oficiais do STJ,
   gera `../../dados-jurisprudencia.json` para o dashboard.
2. **Dashboard web** (`../../jurisprudencia.html`) — abre o JSON e oferece
   busca por texto (ementa/tese/termos/relator), filtro por órgão/ano/tema
   repetitivo, e exportação CSV.

---

## Por que só STJ (por enquanto)

O STJ é o único tribunal superior com um portal de **dados abertos em lote**
(JSON/ZIP, atualização mensal, sem paywall) — é o que torna a indexação
gratuita viável. Para STF (Recurso Extraordinário, repercussão geral) e para
TRFs/TJs, não existe um dump equivalente; a pesquisa nesses tribunais deve
seguir sendo feita sob demanda (busca web/portal oficial) no momento em que
um caso concreto é analisado — não há como pré-indexar tudo de graça.

---

## Uso

### 1) Ver o dashboard com dados de demonstração (sem rede)

```bash
python stj_indexer.py demo --saida ../..
```

### 2) Descobrir os órgãos julgadores disponíveis

```bash
python stj_indexer.py descobrir
```

### 3) Baixar os dados reais

```bash
python stj_indexer.py baixar --input-dir ./stj_json \
  --orgao quinta-turma --orgao sexta-turma --orgao terceira-secao \
  --anos 3
```

Por padrão baixa os 3 órgãos com competência penal/penal-tributária
(Quinta Turma, Sexta Turma, Terceira Seção). Use `--orgao <slug>` para
escolher outros (veja `descobrir`) ou `--todos-orgaos` para baixar tudo
(inclui matéria cível/tributária/administrativa das demais turmas).

`--anos N` mantém só os últimos N anos de arquivos mensais (padrão: 3).
Os arquivos ficam em `./stj_json/<orgao>/AAAAMMDD.json` e **não são
versionados** (veja `../.gitignore`) — o histórico completo passa
facilmente de 100 MB.

### 4) Processar e gerar o índice do dashboard

```bash
python stj_indexer.py processar --input-dir ./stj_json --saida ../..
```

Opções:

| Flag | Padrão | Descrição |
|---|---|---|
| `--input-dir` | — | pasta com os JSON/ZIP baixados |
| `--saida` | `saida` | pasta de saída (`../..` = raiz do repo, alimenta o dashboard) |
| `--palavra-chave` | — | filtra por termo na ementa/tese/termos (repita para várias; combina em OR) |
| `--limite` | `800` | mantém só os N acórdãos mais recentes; `0` = sem limite |

**Sobre o `--limite`:** o índice completo (3 órgãos × 3 anos) tem ~40 mil
acórdãos e ~130 MB — grande demais para versionar no Git ou publicar como
página estática. O padrão (`800`, mais recentes) gera um arquivo de poucos
MB, suficiente como amostra/demonstração pública no GitHub Pages.

**Para pesquisa de verdade em um caso concreto**, gere um índice maior/mais
específico localmente (sem limite, ou filtrado pelas teses do seu caso) e
carregue-o no dashboard pelo botão **"Carregar dados"** — ele nunca precisa
ser commitado nem publicado, fica só no seu navegador/máquina:

```bash
python stj_indexer.py processar --input-dir ./stj_json --saida ./saida_local \
  --palavra-chave "apropriação indébita" --palavra-chave "art. 168-A" --limite 0
```

---

## Sobre o link para o inteiro teor

Os Espelhos de Acórdãos trazem a ementa completa, mas **não** um link direto
por acórdão. O campo `link_pesquisa` de cada registro monta uma busca no
portal processual do STJ (`processo.stj.jus.br`) pelo número de
registro/processo — **é um atalho de busca, não um permalink**; sempre
confira se o resultado bate com o acórdão antes de citar em peça.

---

## Próximo passo: skill de pesquisa profunda

Este índice é a camada de dados. A camada de "inteligência" — extrair as
teses de um processo anexado (PDFs), gerar as buscas certas neste índice
(e, sob demanda, no STF/TRFs/TJs via web search), e montar o relatório com
cotejo analítico para REsp (art. 105, III, "c", CF) — fica em uma skill do
Claude, sem custo de API adicional (roda dentro da assinatura já paga).
Ainda não construída nesta rodada — próximo passo natural depois de validar
a qualidade deste índice.

---

## Observações legais

Os Espelhos de Acórdãos são publicação oficial do STJ (dados abertos,
Lei nº 12.527/2011 — LAI). Este índice é ferramenta de **apoio à pesquisa**;
não substitui a conferência do inteiro teor nem da situação processual
atual (trânsito em julgado, superação de entendimento, modulação de
efeitos) na fonte oficial antes de qualquer uso em peça.

> **Nota sobre o ambiente Claude Code na web:** ao contrário da PGFN, o
> portal `dadosabertos.web.stj.jus.br` **é acessível diretamente** deste
> ambiente — não é necessário rodar o download na sua máquina.
