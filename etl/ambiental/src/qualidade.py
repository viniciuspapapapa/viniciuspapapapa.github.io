#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Verificações automáticas de qualidade da base (requisito 24).

Produz um relatório com as inconsistências encontradas, sem alterar os dados.
A regra é sempre a mesma: **apontar, nunca corrigir por inferência**. Um dado
ausente permanece ausente e é contabilizado; não é substituído por estimativa.
"""

from __future__ import annotations

from comum import cnpj_valido


def verificar(empresas: list[dict], socios: list[dict], referencias,
              matriz) -> dict:
    """Roda as verificações e devolve o relatório estruturado."""
    problemas: dict[str, list[str]] = {}
    contagens: dict[str, int] = {}

    def registrar(chave: str, detalhe: str) -> None:
        problemas.setdefault(chave, [])
        contagens[chave] = contagens.get(chave, 0) + 1
        if len(problemas[chave]) < 25:            # amostra, para não inflar
            problemas[chave].append(detalhe)

    vistos_cnpj: dict[str, int] = {}

    for e in empresas:
        cnpj = e["cnpj"]
        rotulo = f"{cnpj} ({e.get('razao_social', '')[:40]})"

        if not cnpj_valido(cnpj):
            registrar("cnpj_invalido",
                      f"{rotulo} — dígitos verificadores não conferem")

        vistos_cnpj[cnpj] = vistos_cnpj.get(cnpj, 0) + 1

        if not e.get("razao_social"):
            registrar("sem_razao_social", rotulo)

        if not e.get("municipio"):
            registrar("municipio_desconhecido",
                      f"{rotulo} — código RFB {e.get('codigo_municipio_rfb', '?')}")
        elif not e.get("codigo_ibge"):
            registrar("municipio_sem_codigo_ibge",
                      f"{rotulo} — {e.get('municipio')}")

        if not e.get("cnae_principal"):
            registrar("sem_cnae", rotulo)
        elif not referencias.descricao_cnae(e["cnae_principal"]):
            registrar("cnae_inexistente_na_tabela_oficial",
                      f"{rotulo} — CNAE {e['cnae_principal']}")

        if e.get("porte_nao_identificado"):
            registrar("porte_nao_identificado", rotulo)

        if not e.get("data_abertura"):
            registrar("sem_data_abertura", rotulo)

        if e.get("capital_social", 0) <= 0:
            registrar("capital_social_zerado_ou_ausente", rotulo)

        if e.get("uf") != "MG":
            registrar("uf_divergente",
                      f"{rotulo} — UF {e.get('uf')} (esperado MG)")

    duplicados = [c for c, n in vistos_cnpj.items() if n > 1]
    for c in duplicados[:25]:
        registrar("cnpj_duplicado", c)
    contagens["cnpj_duplicado"] = len(duplicados)

    # ---- sócios ---------------------------------------------------------
    # A cobertura societária é medida por EMPRESA (CNPJ raiz), não por
    # estabelecimento: o quadro societário é único para matriz e filiais, e
    # contá-lo por estabelecimento subestimaria a cobertura.
    raizes_base = {e["cnpj_basico"] for e in empresas}
    for s in socios:
        if s["CNPJ_BASICO"] not in raizes_base:
            registrar("socio_orfao",
                      f"{s['CNPJ']} — sócio sem empresa correspondente")
        if not s.get("NOME_SOCIO"):
            registrar("socio_sem_nome", s["CNPJ"])

    raizes_com_socio = {s["CNPJ_BASICO"] for s in socios} & raizes_base
    sem_socio = len(raizes_base - raizes_com_socio)

    # ---- homônimos de município -----------------------------------------
    for aviso in referencias.validar_municipios():
        registrar("municipio_homonimo", aviso)

    return {
        "total_empresas": len(empresas),
        "total_empresas_cnpj_raiz": len(raizes_base),
        "total_socios": len(socios),
        "empresas_sem_dados_societarios": sem_socio,
        "empresas_com_dados_societarios": len(raizes_com_socio),
        "contagens": dict(sorted(contagens.items(), key=lambda kv: -kv[1])),
        "amostras": problemas,
        "observacao": (
            "Nenhuma inconsistência foi corrigida automaticamente. Campos "
            "ausentes permanecem vazios ou marcados como NÃO INFORMADO; nada "
            "foi preenchido por inferência ou aproximação."),
    }


def resumo_texto(rel: dict) -> str:
    linhas = [
        f"Estabelecimentos na base final ...... {rel['total_empresas']:,}",
        f"Empresas distintas (CNPJ raiz) ...... {rel['total_empresas_cnpj_raiz']:,}",
        f"Registros de sócios ................. {rel['total_socios']:,}",
        f"Empresas com dados societários ...... {rel['empresas_com_dados_societarios']:,}",
        f"Empresas sem dados societários ...... {rel['empresas_sem_dados_societarios']:,}",
    ]
    if rel["contagens"]:
        linhas.append("Inconsistências detectadas:")
        for chave, n in rel["contagens"].items():
            linhas.append(f"    {chave:.<44} {n:,}")
    else:
        linhas.append("Nenhuma inconsistência detectada.")
    return "\n".join(linhas)
