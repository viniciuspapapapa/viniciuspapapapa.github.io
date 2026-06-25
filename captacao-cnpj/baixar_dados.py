#!/usr/bin/env python3
"""
Passo 1 — Baixa os dados públicos de CNPJ da Receita Federal.

Uso:
    python baixar_dados.py                 # detecta a competência mais recente
    python baixar_dados.py 2025-05         # baixa uma competência específica
    python baixar_dados.py 2025-05 --enxuto  # pula Estabelecimentos (download menor)

Os arquivos baixam para captacao-cnpj/dados/<AAAA-MM>/ e são descompactados ali.
Downloads são retomáveis: se o .zip já existe com o tamanho certo, é pulado.

ATENÇÃO: o pacote completo tem ~5 GB compactado e ~17 GB descompactado.
Rode em uma máquina com espaço em disco e internet boa, NÃO neste sandbox.
"""
import sys
import os
import zipfile
from pathlib import Path

import requests

from comum import URL_BASE, GRUPOS_ARQUIVOS

PASTA_DADOS = Path(__file__).parent / "dados"
HEADERS = {"User-Agent": "Mozilla/5.0 (captacao-cnpj)"}


def competencia_mais_recente() -> str:
    """Tenta achar a pasta AAAA-MM mais recente listando o índice da Receita."""
    import re
    from datetime import date

    try:
        r = requests.get(URL_BASE + "/", headers=HEADERS, timeout=60)
        meses = sorted(set(re.findall(r"(\d{4}-\d{2})/", r.text)))
        if meses:
            return meses[-1]
    except Exception as e:
        print(f"  (não consegui listar o índice: {e})")
    # fallback: mês corrente
    hoje = date.today()
    return f"{hoje.year:04d}-{hoje.month:02d}"


def baixa_arquivo(url: str, destino: Path):
    # HEAD para saber o tamanho e permitir retomada
    try:
        h = requests.head(url, headers=HEADERS, timeout=60, allow_redirects=True)
        tamanho = int(h.headers.get("Content-Length", 0))
    except Exception:
        tamanho = 0

    if destino.exists() and tamanho and destino.stat().st_size == tamanho:
        print(f"  [ok] já existe: {destino.name}")
        return

    print(f"  baixando {destino.name} ...", end="", flush=True)
    with requests.get(url, headers=HEADERS, stream=True, timeout=600) as r:
        r.raise_for_status()
        with open(destino, "wb") as f:
            for chunk in r.iter_content(chunk_size=1 << 20):
                f.write(chunk)
    print(f" {destino.stat().st_size/1e6:.0f} MB")


def descompacta(zip_path: Path, pasta: Path):
    try:
        with zipfile.ZipFile(zip_path) as z:
            z.extractall(pasta)
        print(f"  [unzip] {zip_path.name}")
    except zipfile.BadZipFile:
        print(f"  [ERRO] zip corrompido, apague e rebaixe: {zip_path.name}")


def main():
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    enxuto = "--enxuto" in sys.argv

    competencia = args[0] if args else competencia_mais_recente()
    print(f"Competência: {competencia}")

    base = f"{URL_BASE}/{competencia}"
    pasta = PASTA_DADOS / competencia
    pasta.mkdir(parents=True, exist_ok=True)

    grupos = dict(GRUPOS_ARQUIVOS)
    if enxuto:
        grupos.pop("Estabelecimentos", None)
        print("Modo enxuto: sem Estabelecimentos (não traz CNAE/e-mail/telefone).")

    for grupo, arquivos in grupos.items():
        print(f"\n== {grupo} ==")
        for nome in arquivos:
            destino = pasta / nome
            try:
                baixa_arquivo(f"{base}/{nome}", destino)
                descompacta(destino, pasta)
            except requests.HTTPError as e:
                print(f"  [ERRO] {nome}: {e}")

    print(f"\nPronto. Arquivos em: {pasta}")
    print("Próximo passo:  python construir_base.py", competencia)


if __name__ == "__main__":
    main()
