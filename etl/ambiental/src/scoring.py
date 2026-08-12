#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Score de PRIORIDADE DE PROSPECÇÃO (requisitos 9 e 22).

⚠️ O QUE O SCORE É E O QUE NÃO É
--------------------------------
O score mede **a relevância da empresa para uma verificação jurídica
posterior**. Ele combina dois eixos distintos, deliberadamente separados:

  (a) **exposição ambiental potencial** decorrente da atividade econômica
      declarada — quanto a atividade, por sua natureza, está sujeita a
      licenciamento, controle e fiscalização ambiental;
  (b) **adequação ao perfil comercial-alvo** — pequeno e médio porte,
      maturidade operacional, concentração setorial no município.

O score **NÃO** é probabilidade de infração, **NÃO** é indício de ilícito e
**NÃO** classifica ninguém como infrator. Uma empresa com score 90 e outra com
score 20 estão igualmente em situação de regularidade presumida enquanto
verificação individual em fonte oficial não demonstrar o contrário.

Cada empresa recebe também a **decomposição do score** — quanto veio de cada
fator e por quê —, de modo que qualquer pontuação possa ser conferida e
contestada. É o que o requisito 22 chama de resultado "explicável".
"""

from __future__ import annotations


class Score:
    def __init__(self, cfg: dict):
        self.cfg = cfg
        self.f = cfg["fatores"]
        self.faixas = cfg["classificacao"]["faixas"]
        self.ajustes_situacao = {
            cod: regra.get("ajuste_score", 0)
            for cod, regra in cfg["situacao_cadastral"]["regras"].items()
        }

    # -----------------------------------------------------------------
    def calcular(self, *, aval_cnae: dict, laudo_porte: dict,
                 anos_atividade: float | None, situacao_cadastral: str,
                 percentil_municipio: float | None) -> dict:
        """Calcula o score 0-100 e devolve a decomposição por fator."""
        fatores: list[dict] = []

        # --- 1. atividade dominante -----------------------------------
        c = self.f["atividade_dominante"]
        pts = min(c["pontos_max"],
                  round(aval_cnae["peso_maximo"] * c["multiplicador"], 1))
        dom = aval_cnae["atividade_dominante"]
        fatores.append({
            "fator": "Atividade de maior exposição",
            "pontos": pts,
            "maximo": c["pontos_max"],
            "porque": (f"{dom['descricao']} (CNAE {dom['codigo']}, "
                       f"{dom['posicao']}) — exposição {dom['exposicao'].lower()}, "
                       f"peso {dom['peso']}/10; Anexo VIII categoria "
                       f"{dom['categoria_anexo_viii']}, Pp/gu {dom['pp_gu']}"),
        })

        # --- 2. multiplicidade de CNAEs de risco -----------------------
        c = self.f["multiplicidade_cnaes_risco"]
        extras = min(max(aval_cnae["qtd_cnaes_risco"] - 1, 0),
                     c["maximo_cnaes_adicionais_contados"])
        pts = min(c["pontos_max"], extras * c["pontos_por_cnae_adicional"])
        fatores.append({
            "fator": "Acúmulo de atividades de risco",
            "pontos": pts,
            "maximo": c["pontos_max"],
            "porque": (f"{aval_cnae['qtd_cnaes_risco']} CNAE(s) de risco "
                       f"declarado(s)" if aval_cnae["qtd_cnaes_risco"] > 1
                       else "apenas uma atividade de risco declarada"),
        })

        # --- 3. aderência do CNAE principal ----------------------------
        c = self.f["aderencia_do_cnae_principal"]
        if aval_cnae["cnae_principal_de_risco"]:
            pts = c["principal_e_de_risco"]
            porque = "a atividade principal declarada é de exposição ambiental"
        else:
            pts = c["apenas_secundarios_de_risco"]
            porque = ("a exposição vem de atividade SECUNDÁRIA; a atividade "
                      "principal declarada não é de risco")
        fatores.append({"fator": "Aderência da atividade principal",
                        "pontos": pts, "maximo": c["pontos_max"],
                        "porque": porque})

        # --- 4. porte-alvo ---------------------------------------------
        c = self.f["porte_alvo"]
        classe = laudo_porte["porte_classificado"]
        pts = c["por_classificacao"].get(classe, 0)
        fatores.append({
            "fator": "Adequação ao perfil de porte",
            "pontos": pts,
            "maximo": c["pontos_max"],
            "porque": (f"porte classificado como {classe}"
                       + (f" ({'; '.join(laudo_porte['sinais_porte'])})"
                          if laudo_porte["sinais_porte"] else
                          " — sem sinais objetivos suficientes na base pública")),
        })

        # --- 5. maturidade operacional ---------------------------------
        c = self.f["maturidade_operacional"]
        if anos_atividade is None:
            pts, porque = 0, "data de início de atividade não informada"
        else:
            pts = 0
            for faixa in c["faixas_anos"]:
                if anos_atividade >= faixa["min"]:
                    pts = faixa["pontos"]
                    break
            porque = f"{anos_atividade:.0f} ano(s) de atividade"
        fatores.append({"fator": "Maturidade operacional", "pontos": pts,
                        "maximo": c["pontos_max"], "porque": porque})

        # --- 6. concentração setorial no município ---------------------
        c = self.f["concentracao_setorial_municipal"]
        if percentil_municipio is None:
            pts, porque = 0, "concentração municipal não calculada"
        elif percentil_municipio >= c["percentil_alto"]:
            pts = c["pontos_percentil_alto"]
            porque = ("sede em município-polo do setor (entre os de maior "
                      "concentração da atividade em MG)")
        elif percentil_municipio >= c["percentil_medio"]:
            pts = c["pontos_percentil_medio"]
            porque = "sede em município com concentração relevante do setor"
        else:
            pts, porque = 0, "município sem concentração destacada do setor"
        fatores.append({"fator": "Concentração setorial no município",
                        "pontos": pts, "maximo": c["pontos_max"],
                        "porque": porque})

        # --- total ------------------------------------------------------
        bruto = sum(f["pontos"] for f in fatores)

        ajuste = self.ajustes_situacao.get((situacao_cadastral or "").zfill(2), 0)
        if ajuste:
            fatores.append({
                "fator": "Ajuste por situação cadastral",
                "pontos": ajuste, "maximo": 0,
                "porque": ("situação cadastral diversa de ATIVA reduz a "
                           "prioridade comercial, sem excluir a empresa"),
            })
            bruto += ajuste

        score = int(max(0, min(100, round(bruto))))

        grau, rotulo = "C", "Baixa prioridade"
        for faixa in self.faixas:
            if score >= faixa["score_min"]:
                grau, rotulo = faixa["grau"], faixa["rotulo"]
                break

        return {
            "score": score,
            "grau": grau,
            "classificacao": rotulo,
            "fatores": fatores,
            "logica": self.explicar(score, grau, rotulo, fatores),
        }

    # -----------------------------------------------------------------
    @staticmethod
    def explicar(score: int, grau: str, rotulo: str,
                 fatores: list[dict]) -> str:
        """Texto curto e legível com os fatores que produziram o score."""
        relevantes = [f for f in fatores if f["pontos"]]
        relevantes.sort(key=lambda f: -abs(f["pontos"]))
        partes = [f"{f['fator']} ({f['pontos']:+g}): {f['porque']}"
                  for f in relevantes]
        return (f"Score {score}/100 — Grau {grau} ({rotulo}). "
                + " | ".join(partes)
                + " || Indicador de PRIORIDADE DE VERIFICAÇÃO, não de "
                  "irregularidade: não afirma infração nem existência de "
                  "procedimento contra a empresa.")


# ---------------------------------------------------------------------------
# Concentração setorial por município
# ---------------------------------------------------------------------------
def calcular_percentis_municipais(empresas: list[dict]) -> dict[tuple[str, str], float]:
    """Percentil de concentração de cada par (município, setor).

    Mede, dentro de um mesmo setor, como o município se posiciona em número de
    empresas frente aos demais municípios mineiros — identificando os polos
    setoriais citados no requisito 9 (Grau A).
    """
    contagem: dict[tuple[str, str], int] = {}
    for e in empresas:
        chave = (e.get("municipio", ""), e.get("setor_risco", ""))
        if all(chave):
            contagem[chave] = contagem.get(chave, 0) + 1

    # agrupa por setor para calcular o percentil dentro de cada setor
    por_setor: dict[str, list[int]] = {}
    for (_mun, setor), n in contagem.items():
        por_setor.setdefault(setor, []).append(n)
    for setor in por_setor:
        por_setor[setor].sort()

    percentis: dict[tuple[str, str], float] = {}
    for (mun, setor), n in contagem.items():
        valores = por_setor[setor]
        abaixo = sum(1 for v in valores if v < n)
        percentis[(mun, setor)] = 100.0 * abaixo / len(valores)
    return percentis
