#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Tabelas de referência e o cruzamento município RFB × código IBGE.

A base do CNPJ identifica o município por um código **próprio da Receita
Federal** (código TOM), que **não é** o código do IBGE. Como o requisito exige
armazenar o código IBGE, este módulo constrói a correspondência:

    código RFB → nome oficial RFB → nome normalizado → código IBGE (MG)

O casamento é feito por nome normalizado (maiúsculas, sem acentos) **dentro do
território de Minas Gerais**, o que elimina a ambiguidade de municípios
homônimos em estados diferentes — os nomes são únicos dentro de uma mesma UF.

Quando não há correspondência, o código IBGE fica vazio e o caso é registrado
no relatório de qualidade. **Nada é preenchido por aproximação.**

Fonte dos códigos IBGE:
    IBGE — API de Localidades
    https://servicodados.ibge.gov.br/api/v1/localidades/estados/31/municipios
    (31 = Minas Gerais)
"""

from __future__ import annotations

import json
import os

from comum import http_get, ler_arquivo_rfb, sem_acentos, titulo

URL_IBGE_MG = ("https://servicodados.ibge.gov.br/api/v1/localidades/"
               "estados/31/municipios")


# ---------------------------------------------------------------------------
# Municípios do IBGE (MG)
# ---------------------------------------------------------------------------
def baixar_municipios_ibge(cache: str, log=print) -> dict[str, str]:
    """Baixa (ou lê do cache) os municípios de MG do IBGE.

    Retorna {nome_normalizado: codigo_ibge}.
    """
    if os.path.exists(cache):
        dados = json.load(open(cache, encoding="utf-8"))
        log(f"[i] municípios IBGE/MG do cache: {len(dados['municipios'])}")
        return {sem_acentos(m["nome"]): str(m["id"])
                for m in dados["municipios"]}

    log(f"[i] baixando municípios de MG do IBGE ...")
    bruto = json.loads(http_get(URL_IBGE_MG, log=log).decode("utf-8"))

    municipios = [{"id": m["id"], "nome": m["nome"]} for m in bruto]
    os.makedirs(os.path.dirname(os.path.abspath(cache)), exist_ok=True)
    with open(cache, "w", encoding="utf-8") as f:
        json.dump({
            "meta": {
                "fonte": "IBGE — API de Localidades",
                "url": URL_IBGE_MG,
                "uf": "MG (código IBGE 31)",
                "total": len(municipios),
            },
            "municipios": sorted(municipios, key=lambda m: m["id"]),
        }, f, ensure_ascii=False, indent=1)
    log(f"[ok] {cache}: {len(municipios)} municípios de MG.")
    return {sem_acentos(m["nome"]): str(m["id"]) for m in municipios}


# ---------------------------------------------------------------------------
# Tabelas auxiliares da própria RFB
# ---------------------------------------------------------------------------
def ler_tabela_simples(caminho: str, log=print) -> dict[str, str]:
    """Lê uma tabela de domínio da RFB no formato 'codigo;descricao'."""
    if not caminho or not os.path.exists(caminho):
        return {}
    tabela = {}
    for row in ler_arquivo_rfb(caminho, ["codigo", "descricao"], log=lambda *_: None):
        cod = row["codigo"].strip().strip('"')
        if cod:
            tabela[cod] = row["descricao"].strip().strip('"')
    log(f"[i] {os.path.basename(caminho)}: {len(tabela)} registros.")
    return tabela


class Referencias:
    """Agrega as tabelas de domínio necessárias ao pipeline."""

    def __init__(self, pasta_raw: str, cache_ibge: str, log=print):
        self.log = log
        p = lambda nome: os.path.join(pasta_raw, nome)  # noqa: E731

        self.municipios_rfb = ler_tabela_simples(p("Municipios.zip"), log)
        self.naturezas = ler_tabela_simples(p("Naturezas.zip"), log)
        self.qualificacoes = ler_tabela_simples(p("Qualificacoes.zip"), log)
        self.motivos = ler_tabela_simples(p("Motivos.zip"), log)
        self.cnaes_oficiais = ler_tabela_simples(p("Cnaes.zip"), log)

        self.ibge_por_nome = baixar_municipios_ibge(cache_ibge, log)

        # código RFB → (nome apresentável, código IBGE)
        #
        # HOMÔNIMOS: a tabela de municípios da RFB é NACIONAL e não traz a UF,
        # então nomes como "Santa Luzia" aparecem em vários estados e recebem
        # aqui, indevidamente, o código IBGE do homônimo mineiro. Isso é inócuo
        # porque `municipio()` só é chamada para registros JÁ filtrados por
        # UF = MG, e dentro de MG os nomes são únicos. Ainda assim, o conjunto
        # de códigos efetivamente resolvidos é registrado em
        # `codigos_usados` e conferido no relatório de qualidade
        # (`validar_municipios`), de modo que qualquer colisão real apareça.
        self.municipio_por_codigo_rfb: dict[str, tuple[str, str]] = {}
        self.sem_ibge: set[str] = set()
        self.codigos_usados: dict[str, str] = {}      # código RFB → código IBGE
        for cod, nome in self.municipios_rfb.items():
            norm = sem_acentos(nome)
            ibge = self.ibge_por_nome.get(norm, "")
            self.municipio_por_codigo_rfb[cod] = (titulo(nome), ibge)

    def municipio(self, codigo_rfb: str) -> tuple[str, str]:
        """Retorna (nome do município, código IBGE). Vazios se desconhecido.

        Deve ser chamada apenas para registros já filtrados por UF = MG.
        """
        cod = (codigo_rfb or "").strip()
        nome, ibge = self.municipio_por_codigo_rfb.get(cod, ("", ""))
        if nome and not ibge:
            self.sem_ibge.add(f"{cod}:{nome}")
        if ibge:
            self.codigos_usados[cod] = ibge
        return nome, ibge

    def validar_municipios(self) -> list[str]:
        """Detecta códigos IBGE atribuídos a mais de um código RFB em MG."""
        por_ibge: dict[str, list[str]] = {}
        for cod_rfb, ibge in self.codigos_usados.items():
            por_ibge.setdefault(ibge, []).append(cod_rfb)
        return [f"código IBGE {ibge} atribuído a {len(cods)} códigos RFB "
                f"distintos ({', '.join(sorted(cods))}) — conferir homônimos"
                for ibge, cods in por_ibge.items() if len(cods) > 1]

    def natureza(self, codigo: str) -> str:
        cod = (codigo or "").strip()
        return self.naturezas.get(cod, "")

    def qualificacao(self, codigo: str) -> str:
        cod = (codigo or "").strip().zfill(2)
        return self.qualificacoes.get(cod) or self.qualificacoes.get(
            (codigo or "").strip(), "")

    def motivo(self, codigo: str) -> str:
        cod = (codigo or "").strip()
        return self.motivos.get(cod, "")

    def descricao_cnae(self, codigo: str) -> str:
        return self.cnaes_oficiais.get((codigo or "").strip().zfill(7), "")
