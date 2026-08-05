#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Indexador de Jurisprudência — STJ Dados Abertos (Espelhos de Acórdãos)
========================================================================

Pipeline 100% gratuito (sem chave de API, sem assinatura paga) para indexar
localmente a jurisprudência do STJ a partir da base oficial de dados abertos:

    https://dadosabertos.web.stj.jus.br/  (dataset "Espelhos de Acórdãos",
    um por Turma/Seção/Corte Especial)

Cada acórdão inclui: número do processo, classe, órgão julgador, ministro
relator, ementa, decisão, tese jurídica, tema repetitivo, referências
legislativas, jurisprudência citada e data de publicação — dados oficiais,
publicados pelo próprio STJ.

O script tem 4 modos de uso:

  1) descobrir os datasets disponíveis no portal:
       python stj_indexer.py descobrir

  2) baixar os arquivos JSON de um ou mais órgãos julgadores:
       python stj_indexer.py baixar --input-dir ./stj_json \
           --orgao "quinta-turma" --orgao "sexta-turma" --orgao "terceira-secao" \
           --anos 3

  3) processar os JSON baixados e gerar o índice para o dashboard:
       python stj_indexer.py processar --input-dir ./stj_json --saida ..

  4) gerar um índice de DEMONSTRAÇÃO (sintético, sem rede):
       python stj_indexer.py demo --saida ..

Saída (pasta --saida, use ".." para publicar no GitHub Pages):
  - dados-jurisprudencia.json   (consumido pelo dashboard jurisprudencia.html)

Aviso: os Espelhos de Acórdãos são publicação oficial do STJ (dados abertos,
Lei 12.527/2011 — LAI). Este índice é uma ferramenta de apoio à pesquisa;
sempre confira o inteiro teor e a situação processual atual na fonte oficial
antes de citar em peça.
"""

from __future__ import annotations

import argparse
import glob
import io
import json
import os
import re
import sys
import time
import urllib.error
import urllib.request
import zipfile
from datetime import datetime
from typing import Any, Iterable

PORTAL_BASE = "https://dadosabertos.web.stj.jus.br"
USER_AGENT = "Mozilla/5.0 (compatible; TPC-Indexador-Jurisprudencia/1.0)"

# Fallback caso a busca dinâmica no portal falhe (lista estável desde 2022).
ORGAOS_CONHECIDOS = [
    "corte-especial",
    "primeira-secao",
    "segunda-secao",
    "terceira-secao",
    "primeira-turma",
    "segunda-turma",
    "terceira-turma",
    "quarta-turma",
    "quinta-turma",
    "sexta-turma",
]

# Órgãos com competência penal / penal-tributária — usados como padrão em
# "baixar" e "processar" para manter o índice focado na área de atuação do
# escritório. Use --orgao para customizar ou --todos-orgaos para baixar tudo.
ORGAOS_PENAIS_PADRAO = ["terceira-secao", "quinta-turma", "sexta-turma"]


# ---------------------------------------------------------------------------
# HTTP helpers
# ---------------------------------------------------------------------------
def _http_get(url: str, timeout: int = 60, tentativas: int = 3) -> bytes:
    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    ultimo_erro: Exception | None = None
    for tentativa in range(1, tentativas + 1):
        try:
            with urllib.request.urlopen(req, timeout=timeout) as resp:
                return resp.read()
        except (urllib.error.URLError, TimeoutError) as exc:
            ultimo_erro = exc
            if tentativa < tentativas:
                time.sleep(2 * tentativa)
    raise RuntimeError(f"Falha ao baixar {url}: {ultimo_erro}")


# ---------------------------------------------------------------------------
# Descoberta dos datasets (CKAN, sem API REST — parse do HTML público)
# ---------------------------------------------------------------------------
def descobrir_orgaos() -> list[str]:
    """Retorna a lista de slugs de órgão julgador com dataset de Espelhos de
    Acórdãos disponível, buscando dinamicamente no portal. Cai para a lista
    conhecida (ORGAOS_CONHECIDOS) se a busca falhar."""
    try:
        html = _http_get(f"{PORTAL_BASE}/dataset?q=espelho").decode("utf-8", "ignore")
        slugs = sorted(set(re.findall(r'href="/dataset/espelhos-de-acordaos-([a-z-]+)"', html)))
        if slugs:
            return slugs
    except RuntimeError:
        pass
    return list(ORGAOS_CONHECIDOS)


def descobrir_recursos(orgao: str) -> list[dict[str, str]]:
    """Lê a página do dataset de um órgão julgador e extrai os links de
    download (ZIP histórico + JSON mensais + dicionário de dados)."""
    url = f"{PORTAL_BASE}/dataset/espelhos-de-acordaos-{orgao}"
    html = _http_get(url).decode("utf-8", "ignore")
    links = sorted(set(re.findall(r'href="(https://dadosabertos\.web\.stj\.jus\.br/dataset/[^"]+/download/[^"]+)"', html)))
    recursos = []
    for link in links:
        nome_arquivo = link.rsplit("/", 1)[-1]
        recursos.append({"orgao": orgao, "url": link, "arquivo": nome_arquivo})
    return recursos


def cmd_descobrir(args: argparse.Namespace) -> None:
    orgaos = descobrir_orgaos()
    print(f"{len(orgaos)} órgãos julgadores com dataset de Espelhos de Acórdãos:\n")
    for orgao in orgaos:
        marcado = " (padrão penal)" if orgao in ORGAOS_PENAIS_PADRAO else ""
        print(f"  - {orgao}{marcado}")
    print(
        "\nUse: python stj_indexer.py baixar --orgao <slug> [--orgao <slug> ...] "
        "--input-dir ./stj_json"
    )


# ---------------------------------------------------------------------------
# Download
# ---------------------------------------------------------------------------
def _filtrar_por_data(nome_arquivo: str, anos: int | None) -> bool:
    """Os arquivos mensais chamam-se AAAAMMDD.json. Mantém apenas os dos
    últimos `anos` anos (None = mantém todos)."""
    m = re.match(r"(\d{8})\.json$", nome_arquivo)
    if not m or anos is None:
        return True
    data_arquivo = datetime.strptime(m.group(1), "%Y%m%d")
    limite = datetime.now().year - anos
    return data_arquivo.year >= limite


def cmd_baixar(args: argparse.Namespace) -> None:
    os.makedirs(args.input_dir, exist_ok=True)
    orgaos = ORGAOS_CONHECIDOS if args.todos_orgaos else (args.orgao or ORGAOS_PENAIS_PADRAO)

    total_baixados = 0
    total_pulados = 0
    for orgao in orgaos:
        print(f"\n== {orgao} ==")
        try:
            recursos = descobrir_recursos(orgao)
        except RuntimeError as exc:
            print(f"  [erro] não foi possível listar recursos: {exc}")
            continue

        pasta_orgao = os.path.join(args.input_dir, orgao)
        os.makedirs(pasta_orgao, exist_ok=True)

        for recurso in recursos:
            arquivo = recurso["arquivo"]
            if arquivo.endswith(".csv"):
                continue  # dicionário de dados, não é preciso baixar por órgão
            if arquivo.endswith(".zip") and not args.incluir_historico:
                continue
            if arquivo.endswith(".json") and not _filtrar_por_data(arquivo, args.anos):
                total_pulados += 1
                continue

            destino = os.path.join(pasta_orgao, arquivo)
            if os.path.exists(destino) and not args.forcar:
                total_pulados += 1
                continue

            try:
                conteudo = _http_get(recurso["url"], timeout=90)
                with open(destino, "wb") as f:
                    f.write(conteudo)
                total_baixados += 1
                print(f"  [ok] {arquivo} ({len(conteudo):,} bytes)")
            except RuntimeError as exc:
                print(f"  [erro] {arquivo}: {exc}")
            time.sleep(args.pausa)

    print(f"\nConcluído: {total_baixados} arquivo(s) baixado(s), {total_pulados} pulado(s).")
    print(f"Rode agora: python stj_indexer.py processar --input-dir {args.input_dir} --saida ..")


# ---------------------------------------------------------------------------
# Processamento
# ---------------------------------------------------------------------------
CAMPOS_MANTIDOS = [
    "id",
    "numeroProcesso",
    "numeroRegistro",
    "siglaClasse",
    "descricaoClasse",
    "nomeOrgaoJulgador",
    "ministroRelator",
    "ementa",
    "tipoDeDecisao",
    "dataDecisao",
    "decisao",
    "jurisprudenciaCitada",
    "notas",
    "informacoesComplementares",
    "termosAuxiliares",
    "teseJuridica",
    "tema",
    "referenciasLegislativas",
    "acordaosSimilares",
    "dataPublicacao",
]


def _iter_registros_arquivo(caminho: str) -> Iterable[dict[str, Any]]:
    if caminho.endswith(".json"):
        with open(caminho, "r", encoding="utf-8") as f:
            dados = json.load(f)
        yield from dados if isinstance(dados, list) else [dados]
    elif caminho.endswith(".zip"):
        with zipfile.ZipFile(caminho) as z:
            for nome in z.namelist():
                if not nome.endswith(".json"):
                    continue
                with z.open(nome) as f:
                    dados = json.load(io.TextIOWrapper(f, encoding="utf-8"))
                yield from dados if isinstance(dados, list) else [dados]


def _link_pesquisa_processual(numero_registro: str | None, numero_processo: str | None) -> str | None:
    """Monta um link de busca (não um permalink) para o portal público de
    jurisprudência do STJ, a partir do número de registro/processo. Serve
    para localizar rapidamente o inteiro teor; sempre confira o resultado."""
    termo = (numero_registro or numero_processo or "").strip()
    if not termo:
        return None
    return f"https://processo.stj.jus.br/processo/pesquisa/?termo={termo}"


def normalizar_registro(bruto: dict[str, Any], orgao_dataset: str) -> dict[str, Any] | None:
    ementa = (bruto.get("ementa") or "").strip()
    if not ementa:
        return None  # decisões monocráticas sem ementa não entram no índice de pesquisa

    numero_registro = bruto.get("numeroRegistro")
    numero_processo = bruto.get("numeroProcesso")

    jurisprudencia_citada = (bruto.get("jurisprudenciaCitada") or "").strip() or None
    if jurisprudencia_citada and len(jurisprudencia_citada) > 600:
        jurisprudencia_citada = jurisprudencia_citada[:600].rstrip() + "…"

    # referenciasLegislativas vem como lista de strings (uma por dispositivo);
    # o dashboard espera texto, então concatenamos.
    referencias = bruto.get("referenciasLegislativas")
    if isinstance(referencias, list):
        referencias = "\n".join(str(r).strip() for r in referencias if r) or None
    elif not referencias:
        referencias = None

    return {
        "id": bruto.get("id"),
        "orgao_dataset": orgao_dataset,
        "classe": bruto.get("siglaClasse"),
        "classe_extenso": bruto.get("descricaoClasse"),
        "orgao_julgador": bruto.get("nomeOrgaoJulgador"),
        "relator": bruto.get("ministroRelator"),
        "ementa": ementa,
        "tipo_decisao": bruto.get("tipoDeDecisao"),
        "data_decisao": bruto.get("dataDecisao"),
        # Nota: "decisao" (texto padrão de votação, ex. "Vistos e relatados...")
        # é omitido de propósito — não agrega valor à pesquisa de teses e
        # infla muito o tamanho do índice.
        "jurisprudencia_citada": jurisprudencia_citada,
        "tese_juridica": bruto.get("teseJuridica"),
        "tema_repetitivo": bruto.get("tema"),
        "referencias_legislativas": referencias,
        "termos_auxiliares": bruto.get("termosAuxiliares"),
        "numero_processo": numero_processo,
        "numero_registro": numero_registro,
        "data_publicacao": bruto.get("dataPublicacao"),
        "link_pesquisa": _link_pesquisa_processual(numero_registro, numero_processo),
    }


def cmd_processar(args: argparse.Namespace) -> None:
    arquivos = sorted(
        glob.glob(os.path.join(args.input_dir, "**", "*.json"), recursive=True)
        + glob.glob(os.path.join(args.input_dir, "**", "*.zip"), recursive=True)
    )
    if not arquivos:
        print(f"Nenhum arquivo .json/.zip encontrado em {args.input_dir}. Rode 'baixar' primeiro.")
        sys.exit(1)

    palavras_chave = [p.strip().lower() for p in (args.palavra_chave or []) if p.strip()]

    indice: dict[Any, dict[str, Any]] = {}  # dedupe por id (mesmo acórdão pode aparecer em 2 meses)
    for caminho in arquivos:
        orgao_dataset = os.path.basename(os.path.dirname(caminho))
        try:
            for bruto in _iter_registros_arquivo(caminho):
                registro = normalizar_registro(bruto, orgao_dataset)
                if registro is None:
                    continue
                if palavras_chave:
                    texto_busca = " ".join(
                        str(registro.get(campo) or "")
                        for campo in ("ementa", "tese_juridica", "termos_auxiliares", "notas")
                    ).lower()
                    if not any(p in texto_busca for p in palavras_chave):
                        continue
                indice[registro["id"]] = registro
        except (json.JSONDecodeError, zipfile.BadZipFile) as exc:
            print(f"  [aviso] {caminho} ignorado (arquivo corrompido/inválido): {exc}")

    registros = sorted(indice.values(), key=lambda r: r.get("data_decisao") or "", reverse=True)
    total_disponivel = len(registros)
    if args.limite:
        registros = registros[: args.limite]

    os.makedirs(args.saida, exist_ok=True)
    saida_json = os.path.join(args.saida, "dados-jurisprudencia.json")
    payload = {
        "gerado_em": datetime.now().isoformat(timespec="seconds"),
        "fonte": "STJ — Dados Abertos (Espelhos de Acórdãos)",
        "fonte_url": PORTAL_BASE,
        "total_registros": len(registros),
        "total_disponivel_antes_do_limite": total_disponivel,
        "arquivos_processados": len(arquivos),
        "filtro_palavras_chave": palavras_chave or None,
        "registros": registros,
    }
    with open(saida_json, "w", encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=False, indent=1)

    tamanho_mb = os.path.getsize(saida_json) / 1e6
    print(f"Processados {len(arquivos)} arquivo(s) -> {total_disponivel} acórdãos únicos com ementa.")
    if args.limite and total_disponivel > args.limite:
        print(f"Limitado aos {args.limite} mais recentes (use --limite 0 para não limitar).")
    print(f"Gerado: {saida_json} ({tamanho_mb:.1f} MB)")
    if tamanho_mb > 15:
        print(
            "AVISO: arquivo grande para versionar/publicar no GitHub Pages. "
            "Considere --limite, --palavra-chave ou manter este JSON só localmente "
            "(o dashboard também aceita carregar um arquivo local no botão 'Carregar dados')."
        )


# ---------------------------------------------------------------------------
# Demo (sem rede)
# ---------------------------------------------------------------------------
def cmd_demo(args: argparse.Namespace) -> None:
    registros = [
        {
            "id": "900001",
            "orgao_dataset": "quinta-turma",
            "classe": "AgRg no REsp",
            "classe_extenso": "AGRAVO REGIMENTAL NO RECURSO ESPECIAL",
            "orgao_julgador": "QUINTA TURMA",
            "relator": "MINISTRO(A) EXEMPLO",
            "ementa": (
                "PENAL. AGRAVO REGIMENTAL NO RECURSO ESPECIAL. APROPRIAÇÃO "
                "INDÉBITA PREVIDENCIÁRIA. ART. 168-A DO CP. DOLO GENÉRICO. "
                "MERA OMISSÃO NO REPASSE DAS CONTRIBUIÇÕES DESCONTADAS DOS "
                "SEGURADOS. SUFICIÊNCIA PARA CARACTERIZAÇÃO DO DELITO. "
                "AGRAVO DESPROVIDO. (REGISTRO DE DEMONSTRAÇÃO — DADO SINTÉTICO)"
            ),
            "tipo_decisao": "ACÓRDÃO",
            "data_decisao": "20250815",
            "decisao": "Vistos e relatados estes autos (dado de demonstração)...",
            "jurisprudencia_citada": None,
            "tese_juridica": "O dolo genérico é suficiente para a caracterização do art. 168-A do CP.",
            "tema_repetitivo": None,
            "referencias_legislativas": "CP, art. 168-A",
            "termos_auxiliares": "apropriação indébita previdenciária; dolo genérico",
            "numero_processo": "0000000",
            "numero_registro": "202500000000",
            "data_publicacao": "DJEN DATA:20/08/2025",
            "link_pesquisa": "https://processo.stj.jus.br/processo/pesquisa/?termo=202500000000",
        }
    ]
    os.makedirs(args.saida, exist_ok=True)
    saida_json = os.path.join(args.saida, "dados-jurisprudencia.json")
    payload = {
        "gerado_em": datetime.now().isoformat(timespec="seconds"),
        "fonte": "DEMONSTRAÇÃO (dado sintético, sem rede)",
        "fonte_url": PORTAL_BASE,
        "total_registros": len(registros),
        "arquivos_processados": 0,
        "filtro_palavras_chave": None,
        "registros": registros,
    }
    with open(saida_json, "w", encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=False, indent=1)
    print(f"Gerado dataset de demonstração: {saida_json}")


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------
def main() -> None:
    parser = argparse.ArgumentParser(description="Indexador de jurisprudência do STJ (Dados Abertos)")
    sub = parser.add_subparsers(dest="comando", required=True)

    p_descobrir = sub.add_parser("descobrir", help="Lista os órgãos julgadores disponíveis no portal")
    p_descobrir.set_defaults(func=cmd_descobrir)

    p_baixar = sub.add_parser("baixar", help="Baixa os JSON de Espelhos de Acórdãos")
    p_baixar.add_argument("--input-dir", required=True, help="Pasta onde salvar os JSON baixados")
    p_baixar.add_argument("--orgao", action="append", help="Slug do órgão (ex.: quinta-turma). Repita para vários.")
    p_baixar.add_argument("--todos-orgaos", action="store_true", help="Baixa todos os 10 órgãos julgadores")
    p_baixar.add_argument("--anos", type=int, default=3, help="Mantém apenas os últimos N anos (padrão: 3)")
    p_baixar.add_argument("--incluir-historico", action="store_true", help="Inclui também o ZIP histórico completo")
    p_baixar.add_argument("--forcar", action="store_true", help="Rebaixa arquivos já existentes")
    p_baixar.add_argument("--pausa", type=float, default=0.3, help="Pausa (s) entre downloads (padrão: 0.3)")
    p_baixar.set_defaults(func=cmd_baixar)

    p_processar = sub.add_parser("processar", help="Processa os JSON baixados e gera o índice para o dashboard")
    p_processar.add_argument("--input-dir", required=True, help="Pasta com os JSON/ZIP baixados")
    p_processar.add_argument("--saida", default="saida", help="Pasta de saída (use '..' para publicar no dashboard)")
    p_processar.add_argument(
        "--palavra-chave", action="append",
        help="Filtra por palavra-chave na ementa/tese/termos (repita para várias; OR entre elas)",
    )
    p_processar.add_argument(
        "--limite", type=int, default=800,
        help="Mantém apenas os N acórdãos mais recentes (padrão: 800; use 0 para não limitar)",
    )
    p_processar.set_defaults(func=cmd_processar)

    p_demo = sub.add_parser("demo", help="Gera um índice de demonstração (sintético, sem rede)")
    p_demo.add_argument("--saida", default="saida")
    p_demo.set_defaults(func=cmd_demo)

    args = parser.parse_args()
    args.func(args)


if __name__ == "__main__":
    main()
