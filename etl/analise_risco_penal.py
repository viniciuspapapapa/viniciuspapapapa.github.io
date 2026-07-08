#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Indicador de risco penal-tributário — Dívida Ativa da União (PGFN)
==================================================================

Lê o dataset gerado pelo pipeline (``dados-captacao.json``) e acrescenta, em
cada empresa, um campo ``risco_penal`` com:

  - ``nivel``           : Alto / Médio / Baixo / Indeterminado
  - ``score``           : 0-100 (heurística de priorização)
  - ``tipificacoes``    : crimes tributários POSSÍVEIS, com fundamento legal
  - ``fundamentos``     : por que a empresa foi marcada
  - ``observacoes``     : ressalvas (suspensão/extinção da punibilidade etc.)

⚠️ AVISO METODOLÓGICO E JURÍDICO (leia antes de usar)
------------------------------------------------------
Este indicador é uma HEURÍSTICA DE PRIORIZAÇÃO comercial/jurídica, **não** uma
afirmação de que existe processo, inquérito ou representação penal.

  * A Dívida Ativa é **cobrança CÍVEL** (execução fiscal). Crime tributário é
    AÇÃO PENAL SEPARADA, de competência federal, em regra precedida de
    Representação Fiscal para Fins Penais (RFFP) da RFB ao MPF — dado que NÃO
    consta dos dados abertos da PGFN.
  * A heurística infere PROBABILIDADE a partir do TIPO de tributo:
      - tributo RETIDO/DESCONTADO de terceiro e não repassado
        (contrib. previdenciária dos segurados, IRRF, retenções na fonte)
        caracteriza, em tese, APROPRIAÇÃO INDÉBITA — indício forte;
      - tributo PRÓPRIO declarado e não pago (IRPJ, CSLL, COFINS/PIS próprios,
        IPI, IOF) é, em regra, MERA INADIMPLÊNCIA — só vira crime (sonegação,
        art. 1º da Lei 8.137/90) se houver fraude/omissão dolosa, o que NÃO se
        infere destes dados.
  * Súmula Vinculante 24/STF: o crime material do art. 1º só se tipifica após a
    constituição definitiva do crédito. A inscrição em Dívida Ativa pressupõe
    crédito definitivamente constituído — por isso a inscrição é, ela própria,
    um marco relevante para a esfera penal.
  * RESPONSABILIDADE PENAL É PESSOAL: recai sobre o(s) administrador(es) à
    época do fato (sócio-gerente/diretor), não sobre a pessoa jurídica. Os
    dados abertos não trazem o quadro societário — identifique o responsável
    via QSA (CNPJ) / contrato social antes de qualquer juízo.
  * Causas de suspensão/extinção da punibilidade: parcelamento/transação em
    curso SUSPENDE a pretensão punitiva; o PAGAMENTO INTEGRAL EXTINGUE a
    punibilidade a qualquer tempo (art. 9º da Lei 10.684/03; art. 83 da Lei
    9.430/96). Por isso situações de parcelamento/negociação atenuam o quadro,
    e a rescisão de parcelamento o reativa.

Use exclusivamente para PRIORIZAR a checagem manual (TRF6/JFMG, MPF, RFFP no
e-CAC, certidões criminais). Confirme sempre na fonte oficial.

⚠️ NÃO PUBLICAR: a saída é de USO INTERNO. O dataset público do site
(``../dados-captacao.json``) traz apenas dados oficiais da Dívida Ativa; rótulos
de "risco penal" sobre empresas nominadas são inferências e NÃO devem ir para o
GitHub Pages (risco de difamação/LGPD). Por isso a saída padrão é um arquivo
LOCAL (``./dados-captacao-com-risco-penal.json``), ignorado pelo git.

Uso:
    python analise_risco_penal.py --entrada ../dados-captacao.json \
        --saida-json ./dados-captacao-com-risco-penal.json \
        --relatorio ./risco_penal.csv
"""

from __future__ import annotations

import argparse
import csv
import json
import os


def _norm(s: str) -> str:
    """upper + remove acentos para casar descrições de receita/situação."""
    s = (s or "").upper()
    repl = (("Á", "A"), ("À", "A"), ("Â", "A"), ("Ã", "A"), ("É", "E"),
            ("Ê", "E"), ("Í", "I"), ("Ó", "O"), ("Ô", "O"), ("Õ", "O"),
            ("Ú", "U"), ("Ç", "C"))
    for a, b in repl:
        s = s.replace(a, b)
    return s


# ---------------------------------------------------------------------------
# Classificação das receitas por natureza penal
# ---------------------------------------------------------------------------
# Tributo RETIDO/DESCONTADO dos segurados (empregados) e não repassado:
#   art. 168-A do Código Penal (apropriação indébita previdenciária).
PADROES_PREV_RETIDA = (
    "PREVIDENCIARIA SEGURADOS",
    "SEGURADOS",
    "SUJEITA A RETENCAO PREVIDENCIARIA",
    "RETENCAO PREVIDENCIARIA",
    "RET. CONTRIB",
    "RET CONTRIB",
    "PAGAM. PJ A PJ",
    "PAGAM PJ A PJ",
)

# Tributo descontado/cobrado de terceiro e não recolhido:
#   art. 2º, II, da Lei 8.137/90 (apropriação indébita tributária).
PADROES_RETIDO_FONTE = (
    "IRRF",
    "RETENCAO NA FONTE",
    "RETIDO NA FONTE",
)

# Compensação glosada — pode indicar declaração/compensação fraudulenta:
#   art. 1º/2º da Lei 8.137/90 (a confirmar no auto de infração).
PADROES_COMPENSACAO = (
    "GLOSA DE COMPENSACAO",
    "COMPENSACAO INDEVIDA",
)

# Encargos da própria empresa sobre a folha (patronal e de terceiros) — NÃO
# são retidos do empregado; não caracterizam, por si, apropriação indébita.
PADROES_FOLHA_EMPRESA = (
    "CONTRIBUICAO EMPRESA", "EMPREGADOR", "CONTRIBUICAO TERCEIROS",
    "SALARIO EDUCACAO", "INCRA", "SENAI", "SESI", "SESC", "SENAC",
    "SEST", "SENAT", "SEBRAE", "RISCO AMBIENTAL", "RECEITA BRUTA",
)


def classificar_receitas(receitas: list[str]) -> dict:
    rec = [_norm(r) for r in receitas]

    def tem(padroes):
        return any(any(p in r for p in padroes) for r in rec)

    return {
        "prev_retida": tem(PADROES_PREV_RETIDA),
        "retido_fonte": tem(PADROES_RETIDO_FONTE),
        "compensacao": tem(PADROES_COMPENSACAO),
    }


def situacao_flags(situacoes: list[str]) -> dict:
    sit = [_norm(s) for s in situacoes]
    txt = " | ".join(sit)
    rescindido = "RESCINDIDO" in txt or "RESCISAO" in txt
    # parcelamento/negociação ATIVOS (suspendem a pretensão punitiva)
    ativo = (("PARCEL" in txt or "NEGOCIAD" in txt or "NEGOCIACAO" in txt
              or "MORATORIA" in txt) and not rescindido)
    return {"parcelamento_rescindido": rescindido, "beneficio_ativo": ativo}


def avaliar(empresa: dict) -> dict:
    rc = classificar_receitas(empresa.get("receitas", []))
    sf = situacao_flags(empresa.get("situacoes", []))
    valor = float(empresa.get("divida_total", 0.0) or 0.0)

    tipificacoes: list[str] = []
    fundamentos: list[str] = []
    observacoes: list[str] = []
    score = 0

    if rc["prev_retida"]:
        score += 45
        tipificacoes.append(
            "Apropriação indébita previdenciária (art. 168-A, CP) — "
            "contribuição descontada dos segurados não repassada ao INSS")
        fundamentos.append(
            "Há débito de contribuição previdenciária retida dos segurados.")
    if rc["retido_fonte"]:
        score += 40
        tipificacoes.append(
            "Apropriação indébita tributária (art. 2º, II, Lei 8.137/90) — "
            "tributo retido/descontado de terceiros e não recolhido")
        fundamentos.append(
            "Há débito de tributo retido na fonte (IRRF/retenções).")
    if rc["compensacao"]:
        score += 20
        tipificacoes.append(
            "Possível fraude em compensação (art. 1º/2º, Lei 8.137/90) — "
            "verificar se houve declaração falsa (a confirmar no auto)")
        fundamentos.append("Há glosa de compensação previdenciária.")

    # faixa de valor — relevância para RFFP/atuação do MPF
    if valor >= 10_000_000:
        score += 25
    elif valor >= 1_000_000:
        score += 15
    elif valor >= 500_000:
        score += 8
    else:
        score += 3

    if sf["parcelamento_rescindido"]:
        score += 10
        fundamentos.append(
            "Parcelamento rescindido — pretensão punitiva volta a correr.")
    if sf["beneficio_ativo"]:
        observacoes.append(
            "Há parcelamento/negociação em curso: pode SUSPENDER a pretensão "
            "punitiva penal enquanto vigente (art. 83, §§, Lei 9.430/96).")

    score = max(0, min(100, score))

    tem_retido = rc["prev_retida"] or rc["retido_fonte"]
    if tem_retido:
        if score >= 70:
            nivel = "Alto"
        elif score >= 45:
            nivel = "Médio"
        else:
            nivel = "Médio-baixo"
    elif rc["compensacao"]:
        nivel = "Médio"
    else:
        nivel = "Indeterminado"
        fundamentos.append(
            "Apenas tributos próprios (IRPJ/CSLL/COFINS/PIS/IPI/IOF) "
            "declarados e não pagos: em regra mera inadimplência; crime "
            "(sonegação, art. 1º) só com fraude — não inferível destes dados.")

    observacoes.append(
        "Responsabilidade penal é pessoal (administrador à época) — "
        "identificar o responsável via QSA/contrato social.")
    observacoes.append(
        "Pagamento integral extingue a punibilidade a qualquer tempo "
        "(art. 9º, Lei 10.684/03).")

    return {
        "nivel": nivel,
        "score": score,
        "tipificacoes": tipificacoes,
        "fundamentos": fundamentos,
        "observacoes": observacoes,
    }


def main():
    p = argparse.ArgumentParser(
        description="Indicador heurístico de risco penal-tributário sobre o "
                    "dataset da Dívida Ativa (PGFN).")
    p.add_argument("--entrada", default="../dados-captacao.json")
    p.add_argument("--saida-json", default="./dados-captacao-com-risco-penal.json",
                   help="arquivo LOCAL (uso interno) com o campo risco_penal "
                        "por empresa. NÃO use o dataset público do site aqui.")
    p.add_argument("--relatorio", default="./risco_penal.csv",
                   help="CSV/planilha priorizada por risco penal")
    args = p.parse_args()

    with open(args.entrada, encoding="utf-8") as f:
        dados = json.load(f)
    empresas = dados.get("empresas", [])

    dist = {"Alto": 0, "Médio": 0, "Médio-baixo": 0, "Indeterminado": 0}
    n168, nart2, ncomp = 0, 0, 0
    for e in empresas:
        rp = avaliar(e)
        e["risco_penal"] = rp
        dist[rp["nivel"]] = dist.get(rp["nivel"], 0) + 1
        joined = " ".join(rp["tipificacoes"])
        if "168-A" in joined:
            n168 += 1
        if "art. 2º, II" in joined:
            nart2 += 1
        if "compensação" in joined.lower():
            ncomp += 1

    # metadados da análise
    dados.setdefault("meta", {})["analise_risco_penal"] = {
        "metodo": "heurística por natureza do tributo (retido x próprio) + "
                  "valor + situação; NÃO confirma existência de ação penal",
        "distribuicao_nivel": dist,
        "com_indicio_168A_CP": n168,
        "com_indicio_art2_II_Lei8137": nart2,
        "com_glosa_compensacao": ncomp,
        "aviso": "Indicador de priorização. Confirme RFFP/processo na fonte "
                 "oficial (e-CAC/MPF/TRF6). Responsabilidade penal é pessoal.",
    }

    with open(args.saida_json, "w", encoding="utf-8") as f:
        json.dump(dados, f, ensure_ascii=False, indent=1)
    print(f"[ok] {args.saida_json} (campo risco_penal adicionado)")

    # relatório priorizado
    ordem = {"Alto": 0, "Médio": 1, "Médio-baixo": 2, "Indeterminado": 3}
    empresas_ord = sorted(
        empresas,
        key=lambda e: (ordem.get(e["risco_penal"]["nivel"], 9),
                       -e["risco_penal"]["score"], -e.get("divida_total", 0)))

    campos = ["risco_nivel", "risco_score", "razao_social", "cnpj",
              "divida_total", "regiao", "municipio", "telefone",
              "tipificacoes_possiveis", "fundamentos", "observacoes"]
    with open(args.relatorio, "w", encoding="utf-8-sig", newline="") as f:
        w = csv.writer(f, delimiter=";")
        w.writerow(campos)
        for e in empresas_ord:
            rp = e["risco_penal"]
            w.writerow([
                rp["nivel"], rp["score"], e.get("razao_social", ""),
                e.get("cnpj", ""),
                f'{e.get("divida_total", 0):.2f}'.replace(".", ","),
                e.get("regiao", ""), e.get("municipio", ""),
                e.get("telefone", ""),
                " | ".join(rp["tipificacoes"]),
                " | ".join(rp["fundamentos"]),
                " | ".join(rp["observacoes"]),
            ])
    print(f"[ok] {args.relatorio}")

    print("\n=== Distribuição de risco penal ===")
    for k in ("Alto", "Médio", "Médio-baixo", "Indeterminado"):
        print(f"  {k:14} {dist.get(k, 0)}")
    print(f"\n  indício art. 168-A CP (prev. retida): {n168}")
    print(f"  indício art. 2º, II, Lei 8.137/90 (retido fonte): {nart2}")
    print(f"  com glosa de compensação: {ncomp}")


if __name__ == "__main__":
    main()
