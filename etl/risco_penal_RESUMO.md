# Análise de risco penal-tributário — Dívida Ativa (PGFN 2026-1)

**Uso interno do escritório. Não publicar.** Documento de priorização, não é
parecer nem afirmação de existência de processo/representação penal.

## O que foi feito

Sobre as **633 empresas** da base (MG — BH/RMBH + Zona da Mata, dívida ≥ R$ 250 mil),
classifiquei a **probabilidade de exposição penal-tributária** a partir da
**natureza dos tributos** inscritos em Dívida Ativa — sem acessar processos
(ver "Limites" abaixo).

### Critério jurídico
| Natureza do débito | Enquadramento possível | Tratamento |
|---|---|---|
| Contribuição previdenciária **descontada dos segurados** não repassada | **Art. 168-A, CP** (apropriação indébita previdenciária) | indício **forte** |
| Tributo **retido na fonte** (IRRF, retenções PIS/COFINS/CSLL) não recolhido | **Art. 2º, II, Lei 8.137/90** (apropriação indébita tributária) | indício **forte** |
| Glosa de compensação | Possível **art. 1º/2º, Lei 8.137/90** (fraude — a confirmar) | indício **médio** |
| Tributos **próprios** (IRPJ, CSLL, COFINS/PIS próprios, IPI, IOF) | Mera inadimplência; crime (sonegação, art. 1º) **só com fraude** | **indeterminado** |

A inscrição em Dívida Ativa pressupõe **crédito definitivamente constituído**
(Súmula Vinculante 24/STF), marco relevante para a esfera penal.

## Resultado

| Nível de risco | Empresas |
|---|---:|
| **Alto** | **389** |
| Médio | 107 |
| Indeterminado (só tributos próprios) | 137 |
| **Total** | 633 |

- **385** com indício de **art. 168-A, CP** (previdenciária retida dos segurados)
- **456** com indício de **art. 2º, II, Lei 8.137/90** (retido na fonte)
- **95** com glosa de compensação

> Quase todas as maiores devedoras combinam previdenciária de segurados **e**
> retenção na fonte — perfil clássico de apropriação indébita.

## Limites (leia)

- **Cível ≠ penal.** Dívida Ativa é cobrança cível. Ação penal é separada,
  federal (TRF6/JFMG + MPF), em regra precedida de **Representação Fiscal para
  Fins Penais (RFFP)** — dado **não** disponível nos dados abertos.
- **Não confirma processo.** Isto é probabilidade pela natureza do tributo, não
  consulta processual. JusBrasil/Escavador são pagos e não abertos; o DataJud
  (CNJ) é aberto mas **não expõe as partes**. Para confirmar, é preciso fonte
  paga (com credencial) ou checagem manual.
- **Responsabilidade é pessoal.** Recai sobre o(s) **administrador(es) à época**
  do fato, não sobre a PJ. Os dados não trazem o quadro societário — identificar
  via QSA/contrato social.
- **Punibilidade.** Parcelamento/transação em curso **suspende** a pretensão
  punitiva; **pagamento integral extingue** a punibilidade a qualquer tempo
  (art. 9º, Lei 10.684/03). Por isso "Alto" ≠ "será denunciado".

## Como confirmar (checagem manual por alvo)

1. **e-CAC / Regularize** — situação atual da inscrição e se houve RFFP.
2. **JFMG / TRF6** — consulta processual criminal (em regra sob sigilo).
3. **MPF (Procuradoria da República em MG)** — notícias de fato / ações penais.
4. **QSA do CNPJ** — identificar o responsável penal à época.
5. **Certidões criminais** (Justiça Federal) do(s) administrador(es).

## Sócios / administradores (QSA)

A planilha traz duas colunas a partir do **QSA** (Quadro de Sócios e
Administradores), dado público do cadastro CNPJ (BrasilAPI; CPF mascarado):

- **Administradores (resp. penal provável)** — sócios com poder de gestão
  (Diretor, Presidente, Sócio-Administrador, Conselheiro etc.), que são os
  candidatos a responder penalmente pelos fatos da empresa.
- **Todos os sócios (QSA)** — quadro completo.

Cobertura: **615/633** empresas com QSA (18 sem quadro público — ex.: certas
S.A./naturezas jurídicas); **1.701 sócios**, dos quais **1.107 administradores**.

> ⚠️ O QSA reflete a composição **atual**; a responsabilidade penal é de quem
> administrava **à época do fato gerador**. Confirme a data dos fatos × entrada/
> saída de cada sócio (coluna "entrada" do QSA / contrato social).
> Dado pessoal de sócios — uso interno, base legal/finalidade do escritório.

## Arquivos gerados (locais, não versionados)
- `risco_penal.xlsx` — ranking por risco penal, com **sócios/administradores**, tipificação e fundamentos.
- `risco_penal.csv` — versão CSV (sem QSA).
- `dados-captacao-com-risco-penal.json` — dataset com o campo `risco_penal` (uso interno).
- `qsa_cache.json` — cache do QSA por CNPJ (dado pessoal — não versionado).
- `analise_risco_penal.py`, `qsa_fetch.py`, `risco_penal_xlsx.py` — scripts reprodutíveis.
