#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Testes de regressão do pipeline.

Sem dependências externas — roda com a biblioteca padrão:

    python testes.py

Cobre as decisões que, se quebrarem em silêncio, produzem uma base errada sem
dar erro: validação de CNPJ, conversão dos formatos da RFB, avaliação de CNAEs
principal × secundários, classificação de porte e faixas do score.
"""

from __future__ import annotations

import json
import os
import sys

AQUI = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(AQUI, "src"))

from cnae import MatrizCnae                                       # noqa: E402
from comum import (cnpj_valido, formata_cnpj, monta_cnpj,         # noqa: E402
                   parse_data, parse_valor, sem_acentos, titulo)
from filtro_porte import ClassificadorPorte                       # noqa: E402
from scoring import Score, calcular_percentis_municipais          # noqa: E402

_ok = 0
_falhas: list[str] = []


def checar(nome: str, obtido, esperado) -> None:
    global _ok
    if obtido == esperado:
        _ok += 1
    else:
        _falhas.append(f"{nome}: obtido {obtido!r}, esperado {esperado!r}")


# ---------------------------------------------------------------------------
def testes_comum() -> None:
    # CNPJ da matriz do Banco do Brasil — dígitos verificadores reais
    checar("cnpj válido", cnpj_valido("00000000000191"), True)
    checar("cnpj com DV errado", cnpj_valido("00000000000192"), False)
    checar("cnpj de dígitos repetidos", cnpj_valido("11111111111111"), False)
    checar("cnpj curto", cnpj_valido("123"), False)

    # capital social vem em pt-BR na base da RFB
    checar("capital pt-BR", parse_valor("120000000000,00"), 120000000000.0)
    checar("capital com ponto", parse_valor("1000.50"), 1000.50)
    checar("capital vazio", parse_valor(""), 0.0)
    checar("capital inválido", parse_valor("abc"), 0.0)

    checar("monta CNPJ", monta_cnpj("42858754", "0001", "09"), "42858754000109")
    checar("formata CNPJ", formata_cnpj("42858754000109"), "42.858.754/0001-09")

    checar("data AAAAMMDD", parse_data("20221213").isoformat(), "2022-12-13")
    checar("data zerada", parse_data("00000000"), None)
    checar("data vazia", parse_data(""), None)
    checar("data inválida", parse_data("20221345"), None)

    checar("sem acentos", sem_acentos("São João del-Rei"), "SAO JOAO DEL-REI")
    checar("título", titulo("SAO JOAO DEL REI"), "Sao Joao Del Rei")
    checar("título com preposição", titulo("PEDRA DO ANTA"), "Pedra do Anta")


def testes_cnae(matriz: MatrizCnae) -> None:
    # Requisito 7: a empresa entra pelo CNAE SECUNDÁRIO
    r = matriz.avaliar("5611201", "0810006,6204000")   # restaurante + areia
    checar("entra por CNAE secundário", r["tem_risco"], True)
    checar("principal não é de risco", r["cnae_principal_de_risco"], False)
    checar("dominante é o secundário", r["atividade_dominante"]["codigo"],
           "0810006")
    checar("peso máximo", r["peso_maximo"], 10)

    checar("sem nenhum CNAE de risco",
           matriz.avaliar("6204000", "4781400")["tem_risco"], False)

    # empate de peso: vence o principal
    r2 = matriz.avaliar("0810006", "0500301")
    checar("empate resolvido pelo principal",
           r2["atividade_dominante"]["posicao"], "principal")

    # o CNAE principal não pode ser contado também como secundário
    checar("sem contagem em dobro",
           matriz.avaliar("0810006", "0810006,0810007")["qtd_cnaes_risco"], 2)
    checar("secundário vazio",
           matriz.avaliar("0810006", "")["qtd_cnaes_risco"], 1)
    checar("secundário preenchido com zeros",
           matriz.avaliar("0810006", "0000000")["qtd_cnaes_risco"], 1)

    # a matriz deve refletir as decisões documentadas
    checar("galvanoplastia peso 10", matriz.get("2539002")["peso"], 10)
    checar("carvão de mata nativa peso 10", matriz.get("0220902")["peso"], 10)
    checar("curtume peso 10", matriz.get("1510600")["peso"], 10)
    checar("ferro-gusa peso 10", matriz.get("2411300")["peso"], 10)
    checar("posto de combustível peso 9", matriz.get("4731800")["peso"], 9)
    checar("regra ampla não sobrescreve a específica",
           matriz.get("2539002")["peso"] > matriz.get("2511000")["peso"], True)
    # toda entrada precisa de justificativa e fonte
    sem_just = [c for c, i in matriz.cnaes.items()
                if not i.get("justificativa") or not i.get("fontes")]
    checar("todas as entradas têm justificativa e fonte", sem_just, [])


def testes_porte(cfg: dict, naturezas: dict) -> None:
    c = ClassificadorPorte(cfg, naturezas, log=lambda *_: None)

    base = dict(capital_social="50000,00", natureza_juridica="2062",
                qtd_estabelecimentos=1, optante_simples=None, optante_mei=None)

    checar("ME é PEQUENO/MICRO",
           c.classificar(porte_rfb="01", **base)["porte_classificado"], "MICRO")
    checar("EPP é PEQUENO",
           c.classificar(porte_rfb="03", **base)["porte_classificado"], "PEQUENO")

    # natureza jurídica categórica prevalece sobre o campo `porte`
    r = c.classificar(porte_rfb="01", **{**base, "natureza_juridica": "2046"})
    checar("S.A. aberta é GRANDE mesmo declarada ME",
           r["porte_classificado"], "GRANDE")
    checar("S.A. aberta é excluída", r["incluir"], False)
    checar("motivo da exclusão registrado",
           "natureza_juridica_incompativel" in r["motivo_exclusao_porte"], True)

    # rede extensa é sinal categórico
    r = c.classificar(porte_rfb="05", **{**base, "qtd_estabelecimentos": 40})
    checar("rede extensa é GRANDE", r["porte_classificado"], "GRANDE")

    # capital social é PROXY: o Simples (ato oficial) o afasta
    r = c.classificar(porte_rfb="05",
                      **{**base, "capital_social": "20000000,00"})
    checar("capital alto exclui", r["incluir"], False)
    r = c.classificar(porte_rfb="05", **{**base, "capital_social": "20000000,00",
                                         "optante_simples": True})
    checar("Simples afasta a presunção por capital", r["incluir"], True)

    # sem sinal nenhum não se arbitra
    r = c.classificar(porte_rfb="00", capital_social="", natureza_juridica="2062",
                      qtd_estabelecimentos=0, optante_simples=None,
                      optante_mei=None)
    checar("sem sinal → NAO_IDENTIFICADO",
           r["porte_classificado"], "NAO_IDENTIFICADO")
    checar("não identificado permanece na base", r["incluir"], True)

    # "DEMAIS" abrange médio E grande: sem sinal objetivo NÃO se chuta "médio".
    # (Regressão: o ramo NAO_IDENTIFICADO já foi inalcançável porque o número de
    # estabelecimentos, sempre >= 1, era tratado como sinal de porte médio.)
    r = c.classificar(porte_rfb="05", **{**base, "optante_simples": None})
    checar("DEMAIS sem sinal → NAO_IDENTIFICADO",
           r["porte_classificado"], "NAO_IDENTIFICADO")
    r = c.classificar(porte_rfb="05", **{**base, "optante_simples": False})
    checar("DEMAIS não-optante → NAO_IDENTIFICADO",
           r["porte_classificado"], "NAO_IDENTIFICADO")
    r = c.classificar(porte_rfb="05", **{**base, "optante_simples": True})
    checar("DEMAIS optante do Simples → MEDIO",
           r["porte_classificado"], "MEDIO")
    r = c.classificar(porte_rfb="05", **{**base, "capital_social": "5000000,00",
                                         "optante_simples": None})
    checar("capital abaixo do limiar não vira prova de porte médio",
           r["porte_classificado"], "NAO_IDENTIFICADO")

    # a conferência dos códigos contra a tabela oficial precisa abortar
    ruim = json.loads(json.dumps(cfg))
    ruim["porte"]["naturezas_juridicas_grande_porte"]["2062"] = "S.A. Fechada"
    try:
        ClassificadorPorte(ruim, naturezas, log=lambda *_: None)
        checar("natureza jurídica divergente aborta", "não abortou", "abortou")
    except SystemExit:
        checar("natureza jurídica divergente aborta", "abortou", "abortou")


def testes_score(cfg: dict, matriz: MatrizCnae, naturezas: dict) -> None:
    s = Score(cfg)
    c = ClassificadorPorte(cfg, naturezas, log=lambda *_: None)
    laudo = c.classificar(porte_rfb="03", capital_social="100000,00",
                          natureza_juridica="2062", qtd_estabelecimentos=1,
                          optante_simples=True, optante_mei=None)

    # mineração de pequeno porte, madura, em município-polo → Grau A
    r = s.calcular(aval_cnae=matriz.avaliar("0810006", "0810007"),
                   laudo_porte=laudo, anos_atividade=25.0,
                   situacao_cadastral="02", percentil_municipio=95.0)
    checar("mineração PME madura é Grau A", r["grau"], "A")
    checar("score dentro da faixa", 0 <= r["score"] <= 100, True)
    checar("lógica menciona a ressalva",
           "não afirma infração" in r["logica"], True)
    checar("lógica lista os fatores", len(r["fatores"]) >= 6, True)

    # atividade de baixa exposição, empresa nova → prioridade menor
    r2 = s.calcular(aval_cnae=matriz.avaliar("4120400", ""),
                    laudo_porte=laudo, anos_atividade=1.0,
                    situacao_cadastral="02", percentil_municipio=10.0)
    checar("baixa exposição pontua menos", r2["score"] < r["score"], True)

    # situação cadastral diversa de ATIVA reduz o score
    r3 = s.calcular(aval_cnae=matriz.avaliar("0810006", "0810007"),
                    laudo_porte=laudo, anos_atividade=25.0,
                    situacao_cadastral="04", percentil_municipio=95.0)
    checar("INAPTA reduz o score", r3["score"] < r["score"], True)

    # percentis municipais
    pct = calcular_percentis_municipais([
        {"municipio": "A", "setor_risco": "X"},
        {"municipio": "A", "setor_risco": "X"},
        {"municipio": "B", "setor_risco": "X"},
    ])
    checar("município com mais empresas tem percentil maior",
           pct[("A", "X")] > pct[("B", "X")], True)


def main() -> int:
    cfg = json.load(open(os.path.join(AQUI, "config", "parametros_score.json"),
                         encoding="utf-8"))
    matriz = MatrizCnae(os.path.join(AQUI, "config",
                                     "cnaes_risco_ambiental.json"))
    # tabela mínima de naturezas jurídicas, com as descrições oficiais da RFB
    naturezas = {"2011": "Empresa Pública",
                 "2038": "Sociedade de Economia Mista",
                 "2046": "Sociedade Anônima Aberta",
                 "2054": "Sociedade Anônima Fechada",
                 "2062": "Sociedade Empresária Limitada"}

    testes_comum()
    testes_cnae(matriz)
    testes_porte(cfg, naturezas)
    testes_score(cfg, matriz, naturezas)

    print(f"\n{_ok} verificações passaram, {len(_falhas)} falharam")
    for f in _falhas:
        print(f"  ✗ {f}")
    return 1 if _falhas else 0


if __name__ == "__main__":
    sys.exit(main())
