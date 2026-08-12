#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Gerador de AMOSTRA SINTÉTICA no layout dos Dados Abertos do CNPJ.

Para que serve
--------------
Permite exercitar o pipeline inteiro — filtros, matriz de CNAEs, porte, score,
planilhas — **sem baixar os 7,7 GB** da Receita Federal, e serve de teste de
regressão do código.

⚠️ OS DADOS GERADOS SÃO FICTÍCIOS
---------------------------------
Razões sociais, CNPJs, endereços e sócios são inventados por sorteio. Não
correspondem a nenhuma empresa ou pessoa real. A saída produzida a partir
desta amostra **não tem valor de prospecção** e é marcada como ``DEMO`` na
competência, em todos os arquivos gerados.

Uso:
    python gerar_amostra.py --saida ../data/raw/DEMO --empresas 400
"""

from __future__ import annotations

import argparse
import csv
import json
import os
import random
import zipfile
from datetime import date, timedelta

# CNAEs de municípios/atividades usados na amostra são lidos da matriz real,
# para que o teste exercite a classificação de verdade.
TERMOS = ["Alpha", "Beta", "Gama", "Delta", "Ipê", "Jacarandá", "Aroeira",
          "Serra", "Vale", "Rio Claro", "Boa Vista", "Monte Alto", "Pedra Azul",
          "Campo Belo", "Santa Rita", "São Bento", "Nova Aurora", "Bom Jardim"]
TIPOS = ["Indústria", "Comércio", "Agropecuária", "Mineração", "Transportes",
         "Beneficiamento", "Serviços", "Empreendimentos"]
SUFIXOS = ["Ltda", "S/A", "ME", "EPP", "Eireli"]
NATUREZAS = ["2062", "2135", "2046", "2240", "2305", "2011"]
PORTES = ["01", "03", "05", "00"]
SITUACOES = ["02", "02", "02", "02", "03", "04", "08"]


def _nome_ficticio(rnd: random.Random) -> str:
    return (f"{rnd.choice(TERMOS)} {rnd.choice(TIPOS)} "
            f"{rnd.choice(TERMOS)} {rnd.choice(SUFIXOS)}").upper()


def _data(rnd: random.Random, ini: int, fim: int) -> str:
    d = date(rnd.randint(ini, fim), rnd.randint(1, 12), rnd.randint(1, 28))
    return d.strftime("%Y%m%d")


def _zipar(caminho_zip: str, nome_interno: str, linhas: list[list[str]]) -> None:
    import io
    buf = io.StringIO()
    w = csv.writer(buf, delimiter=";", quotechar='"', quoting=csv.QUOTE_MINIMAL,
                   lineterminator="\n")
    w.writerows(linhas)
    with zipfile.ZipFile(caminho_zip, "w", zipfile.ZIP_DEFLATED) as z:
        z.writestr(nome_interno, buf.getvalue().encode("latin-1", "replace"))


def main() -> None:
    p = argparse.ArgumentParser(description="Gera amostra sintética no layout da RFB.")
    p.add_argument("--saida", default="../data/raw/DEMO")
    p.add_argument("--empresas", type=int, default=400)
    p.add_argument("--matriz", default="../config/cnaes_risco_ambiental.json")
    p.add_argument("--municipios", default="../config/municipios_mg_ibge.json")
    p.add_argument("--municipios-rfb", default="../data/raw/2026-08/Municipios.zip")
    p.add_argument("--seed", type=int, default=42)
    args = p.parse_args()

    rnd = random.Random(args.seed)
    os.makedirs(args.saida, exist_ok=True)

    matriz = json.load(open(args.matriz, encoding="utf-8"))["cnaes"]
    cnaes_risco = sorted(matriz)
    cnaes_neutros = ["6204000", "4781400", "5611201", "9602501", "8599604",
                     "6911701", "7020400", "4712100"]

    # códigos de município da RFB que existem em MG — extraídos da própria
    # tabela oficial, para que o cruzamento com o IBGE seja exercitado
    codigos_mg: list[str] = []
    if os.path.exists(args.municipios_rfb):
        import sys
        sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
        from comum import ler_arquivo_rfb, sem_acentos
        nomes_mg = {sem_acentos(m["nome"]) for m in
                    json.load(open(args.municipios, encoding="utf-8"))["municipios"]}
        for row in ler_arquivo_rfb(args.municipios_rfb, ["codigo", "descricao"],
                                   log=lambda *_: None):
            if sem_acentos(row["descricao"]) in nomes_mg:
                codigos_mg.append(row["codigo"])
    if not codigos_mg:
        codigos_mg = ["4123", "4115", "4127", "4201", "4285"]

    estabelecimentos: list[list[str]] = []
    empresas: list[list[str]] = []
    socios: list[list[str]] = []
    simples: list[list[str]] = []

    for i in range(args.empresas):
        basico = f"{rnd.randint(10_000_000, 99_999_999):08d}"
        razao = _nome_ficticio(rnd)
        natureza = rnd.choice(NATUREZAS)
        porte = rnd.choice(PORTES)
        capital = rnd.choice([0, 10_000, 50_000, 200_000, 1_000_000,
                              5_000_000, 30_000_000])

        empresas.append([basico, razao, natureza, "49", f"{capital:.2f}",
                         porte, ""])

        op_simples = "S" if porte in ("01", "03") and rnd.random() < 0.8 else "N"
        op_mei = "S" if porte == "01" and rnd.random() < 0.15 else "N"
        simples.append([basico, op_simples,
                        _data(rnd, 2010, 2020) if op_simples == "S" else "00000000",
                        "00000000", op_mei,
                        _data(rnd, 2010, 2020) if op_mei == "S" else "00000000",
                        "00000000"])

        # 80% das empresas com atividade de risco; 20% neutras (para exercitar
        # o filtro). Entre as de risco, 30% têm o risco APENAS em secundário —
        # justamente o caso que o requisito 7 manda capturar.
        de_risco = rnd.random() < 0.8
        so_secundario = de_risco and rnd.random() < 0.3
        if de_risco and not so_secundario:
            principal = rnd.choice(cnaes_risco)
        else:
            principal = rnd.choice(cnaes_neutros)
        secundarios = []
        if de_risco:
            secundarios = rnd.sample(cnaes_risco, rnd.randint(1, 4))
        secundarios += rnd.sample(cnaes_neutros, rnd.randint(0, 2))
        rnd.shuffle(secundarios)

        n_estab = rnd.choices([1, 1, 1, 2, 3, 25], weights=[50, 20, 10, 10, 8, 2])[0]
        for ordem in range(1, n_estab + 1):
            estabelecimentos.append([
                basico, f"{ordem:04d}", f"{rnd.randint(0, 99):02d}",
                "1" if ordem == 1 else "2",
                razao.split()[0] if rnd.random() < 0.6 else "",
                rnd.choice(SITUACOES), _data(rnd, 2015, 2026),
                rnd.choice(["00", "01", "21"]), "", "105",
                _data(rnd, 1995, 2024), principal, ",".join(secundarios),
                rnd.choice(["RUA", "AVENIDA", "RODOVIA"]),
                f"{rnd.choice(TERMOS)} {rnd.choice(TERMOS)}".upper(),
                str(rnd.randint(1, 3000)), "",
                rnd.choice(["CENTRO", "INDUSTRIAL", "ZONA RURAL"]),
                f"{rnd.randint(30000, 39999):05d}000", "MG",
                rnd.choice(codigos_mg),
                "31", f"{rnd.randint(30000000, 39999999)}", "", "", "", "",
                f"contato{i}@exemplo-ficticio.com.br"
                if rnd.random() < 0.5 else "", "", "",
            ])

        for _ in range(rnd.randint(1, 4)):
            socios.append([
                basico, rnd.choice(["1", "2", "2", "2"]),
                f"{rnd.choice(TERMOS).upper()} {rnd.choice(TERMOS).upper()} "
                f"(FICTÍCIO)",
                f"***{rnd.randint(100000, 999999)}**",
                rnd.choice(["49", "22", "05", "10", "16"]),
                _data(rnd, 1995, 2024), "105", "", "", "00",
                str(rnd.randint(1, 9)),
            ])

    _zipar(os.path.join(args.saida, "Estabelecimentos0.zip"),
           "DEMO.ESTABELE", estabelecimentos)
    _zipar(os.path.join(args.saida, "Empresas0.zip"), "DEMO.EMPRECSV", empresas)
    _zipar(os.path.join(args.saida, "Socios0.zip"), "DEMO.SOCIOCSV", socios)
    _zipar(os.path.join(args.saida, "Simples.zip"), "DEMO.SIMPLES", simples)

    # tabelas de domínio: copia as oficiais, se disponíveis
    origem = os.path.dirname(os.path.abspath(args.municipios_rfb))
    import shutil
    for nome in ("Municipios.zip", "Cnaes.zip", "Naturezas.zip",
                 "Qualificacoes.zip", "Motivos.zip"):
        orig = os.path.join(origem, nome)
        if os.path.exists(orig):
            shutil.copy(orig, os.path.join(args.saida, nome))

    print(f"[ok] amostra SINTÉTICA em {args.saida}")
    print(f"     {len(empresas):,} empresas | {len(estabelecimentos):,} "
          f"estabelecimentos | {len(socios):,} sócios")
    print("     ⚠️  dados FICTÍCIOS — não usar para prospecção.")


if __name__ == "__main__":
    main()
