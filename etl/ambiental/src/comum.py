#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Utilitários compartilhados e layouts oficiais dos Dados Abertos do CNPJ.

Tudo aqui é biblioteca padrão do Python — o pipeline lê os arquivos da Receita
Federal em modo *streaming*, direto de dentro dos .zip, sem descompactar e sem
carregar a base nacional em memória.
"""

from __future__ import annotations

import csv
import io
import os
import re
import sys
import unicodedata
import zipfile
from datetime import date, datetime

# ---------------------------------------------------------------------------
# Layouts oficiais (Dados Abertos do CNPJ — Receita Federal do Brasil)
# ---------------------------------------------------------------------------
# Os arquivos NÃO têm cabeçalho: a ordem das colunas é o contrato. O pipeline
# valida a quantidade de colunas de cada arquivo lido e interrompe a execução
# se o layout divergir, em vez de produzir dados silenciosamente errados.

LAYOUT_EMPRESAS = [
    "cnpj_basico", "razao_social", "natureza_juridica",
    "qualificacao_responsavel", "capital_social", "porte",
    "ente_federativo_responsavel",
]

LAYOUT_ESTABELECIMENTOS = [
    "cnpj_basico", "cnpj_ordem", "cnpj_dv", "identificador_matriz_filial",
    "nome_fantasia", "situacao_cadastral", "data_situacao_cadastral",
    "motivo_situacao_cadastral", "nome_cidade_exterior", "pais",
    "data_inicio_atividade", "cnae_fiscal_principal", "cnae_fiscal_secundaria",
    "tipo_logradouro", "logradouro", "numero", "complemento", "bairro", "cep",
    "uf", "municipio", "ddd_1", "telefone_1", "ddd_2", "telefone_2", "ddd_fax",
    "fax", "correio_eletronico", "situacao_especial", "data_situacao_especial",
]

LAYOUT_SOCIOS = [
    "cnpj_basico", "identificador_socio", "nome_socio_razao_social",
    "cpf_cnpj_socio", "qualificacao_socio", "data_entrada_sociedade", "pais",
    "representante_legal", "nome_do_representante",
    "qualificacao_representante_legal", "faixa_etaria",
]

LAYOUT_SIMPLES = [
    "cnpj_basico", "opcao_pelo_simples", "data_opcao_simples",
    "data_exclusao_simples", "opcao_mei", "data_opcao_mei", "data_exclusao_mei",
]

# Situação cadastral (tabela oficial da RFB)
SITUACAO_CADASTRAL = {
    "01": "NULA", "02": "ATIVA", "03": "SUSPENSA", "04": "INAPTA",
    "08": "BAIXADA",
}

# Identificador matriz/filial
MATRIZ_FILIAL = {"1": "MATRIZ", "2": "FILIAL"}

# Porte (tabela oficial da RFB)
PORTE_RFB = {
    "00": "NÃO INFORMADO", "01": "MICRO EMPRESA",
    "03": "EMPRESA DE PEQUENO PORTE", "05": "DEMAIS",
}

# Identificador de sócio
TIPO_SOCIO = {"1": "PESSOA JURÍDICA", "2": "PESSOA FÍSICA", "3": "ESTRANGEIRO"}

FAIXA_ETARIA = {
    "0": "NÃO INFORMADA", "1": "0 a 12 anos", "2": "13 a 20 anos",
    "3": "21 a 30 anos", "4": "31 a 40 anos", "5": "41 a 50 anos",
    "6": "51 a 60 anos", "7": "61 a 70 anos", "8": "71 a 80 anos",
    "9": "maior de 80 anos",
}

NAO_INFORMADO = "NÃO INFORMADO"


# ---------------------------------------------------------------------------
# Normalização
# ---------------------------------------------------------------------------
def sem_acentos(s: str) -> str:
    """Maiúsculas sem acentos — para casar nomes de municípios entre bases."""
    s = (s or "").upper()
    return "".join(c for c in unicodedata.normalize("NFD", s)
                   if unicodedata.category(c) != "Mn")


def so_digitos(s: str) -> str:
    return re.sub(r"\D", "", s or "")


def monta_cnpj(basico: str, ordem: str, dv: str) -> str:
    """Reconstrói o CNPJ de 14 dígitos a partir das três colunas da RFB."""
    return f"{so_digitos(basico).zfill(8)}{so_digitos(ordem).zfill(4)}{so_digitos(dv).zfill(2)}"


def formata_cnpj(c: str) -> str:
    c = so_digitos(c).zfill(14)
    if len(c) != 14:
        return c
    return f"{c[0:2]}.{c[2:5]}.{c[5:8]}/{c[8:12]}-{c[12:14]}"


def cnpj_valido(cnpj: str) -> bool:
    """Valida os dois dígitos verificadores do CNPJ (módulo 11)."""
    c = so_digitos(cnpj)
    if len(c) != 14 or c == c[0] * 14:
        return False
    for tamanho, pesos in ((12, [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]),
                           (13, [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2])):
        soma = sum(int(c[i]) * pesos[i] for i in range(tamanho))
        resto = soma % 11
        dv = 0 if resto < 2 else 11 - resto
        if int(c[tamanho]) != dv:
            return False
    return True


def parse_valor(v: str) -> float:
    """Converte o capital social da RFB ('1234567,89' ou '1234567.89')."""
    v = (v or "").strip()
    if not v:
        return 0.0
    v = v.replace(".", "").replace(",", ".") if "," in v else v
    try:
        return float(v)
    except ValueError:
        return 0.0


def parse_data(s: str):
    """Converte AAAAMMDD (formato da RFB) em date; None se inválida/vazia."""
    s = so_digitos(s)
    if len(s) != 8 or s == "00000000":
        return None
    try:
        return datetime.strptime(s, "%Y%m%d").date()
    except ValueError:
        return None


def data_iso(s: str) -> str:
    d = parse_data(s)
    return d.isoformat() if d else ""


def anos_desde(s: str) -> float | None:
    d = parse_data(s)
    if not d:
        return None
    return (date.today() - d).days / 365.25


def titulo(s: str) -> str:
    """Title-case respeitando preposições — para endereços e municípios."""
    s = (s or "").strip()
    if not s:
        return ""
    minus = {"de", "da", "do", "das", "dos", "e", "em", "a", "o"}
    partes = s.lower().split()
    return " ".join(p if i and p in minus else p.capitalize()
                    for i, p in enumerate(partes))


# ---------------------------------------------------------------------------
# Leitura streaming dos arquivos da RFB
# ---------------------------------------------------------------------------
def _abrir_csv_do_zip(zf: zipfile.ZipFile, nome: str):
    """Devolve um leitor CSV de texto para um membro do zip (latin-1, ';')."""
    raw = zf.open(nome)
    txt = io.TextIOWrapper(raw, encoding="latin-1", newline="", errors="replace")
    return csv.reader(txt, delimiter=";", quotechar='"')


def ler_arquivo_rfb(caminho: str, layout: list[str], log=print):
    """Itera dicts de um arquivo da RFB (.zip contendo CSV, ou .csv direto).

    Valida o número de colunas contra o layout oficial e aborta se divergir —
    um layout diferente do esperado produziria uma base silenciosamente errada.
    """
    n = len(layout)

    def _linhas(reader, rotulo):
        for i, row in enumerate(reader):
            if not row:
                continue
            if len(row) != n:
                # tolera uma coluna vazia sobrando ao final (separador final)
                if len(row) == n + 1 and not row[-1].strip():
                    row = row[:n]
                else:
                    raise SystemExit(
                        f"\n[ERRO DE LAYOUT] {rotulo}, linha {i + 1}: "
                        f"{len(row)} colunas, esperadas {n}.\n"
                        f"O layout dos Dados Abertos do CNPJ mudou ou o arquivo "
                        f"está corrompido. Confira o dicionário de dados da RFB "
                        f"antes de prosseguir — a execução foi interrompida para "
                        f"não gerar base incorreta.\nLinha: {row[:6]}...")
            yield dict(zip(layout, (c.strip() for c in row)))

    if caminho.lower().endswith(".zip"):
        with zipfile.ZipFile(caminho) as zf:
            membros = [m for m in zf.namelist() if not m.endswith("/")]
            for m in membros:
                log(f"    · {os.path.basename(caminho)} → {m}")
                yield from _linhas(_abrir_csv_do_zip(zf, m),
                                   f"{os.path.basename(caminho)}:{m}")
    else:
        with open(caminho, encoding="latin-1", newline="", errors="replace") as f:
            yield from _linhas(csv.reader(f, delimiter=";", quotechar='"'),
                               os.path.basename(caminho))


def arquivos_do_tipo(pasta: str, prefixo: str) -> list[str]:
    """Lista os arquivos de um tipo (ex.: 'Estabelecimentos') na pasta bruta."""
    if not os.path.isdir(pasta):
        return []
    achados = [os.path.join(pasta, f) for f in sorted(os.listdir(pasta))
               if f.lower().startswith(prefixo.lower())
               and f.lower().endswith((".zip", ".csv"))]
    return achados


# ---------------------------------------------------------------------------
# Log de processamento (requisito 16 — auditabilidade)
# ---------------------------------------------------------------------------
class Log:
    """Log simultâneo em tela e em arquivo, com carimbo de tempo."""

    def __init__(self, caminho: str | None = None):
        self.caminho = caminho
        self._fh = None
        if caminho:
            os.makedirs(os.path.dirname(os.path.abspath(caminho)), exist_ok=True)
            self._fh = open(caminho, "a", encoding="utf-8")
            self._fh.write(f"\n{'=' * 78}\n"
                           f"EXECUÇÃO {datetime.now().isoformat(timespec='seconds')}\n"
                           f"{'=' * 78}\n")

    def __call__(self, msg: str = "") -> None:
        print(msg, flush=True)
        if self._fh:
            self._fh.write(f"{datetime.now().strftime('%H:%M:%S')} {msg}\n")
            self._fh.flush()

    def fechar(self) -> None:
        if self._fh:
            self._fh.close()


def http_get(url: str, tentativas: int = 6, timeout: int = 120,
             log=print) -> bytes:
    """GET com retentativas e espera progressiva.

    Redes corporativas e proxies derrubam conexões de forma intermitente; sem
    retentativa, uma falha transitória interromperia todo o pipeline.
    """
    import time
    import urllib.error
    import urllib.request

    ultimo = None
    for t in range(1, tentativas + 1):
        try:
            req = urllib.request.Request(
                url, headers={"User-Agent": "Mozilla/5.0",
                              "Accept-Encoding": "identity"})
            with urllib.request.urlopen(req, timeout=timeout) as r:
                corpo = r.read()
            # alguns intermediários devolvem gzip mesmo com Accept-Encoding
            # identity; detecta pelo número mágico e descomprime
            if corpo[:2] == b"\x1f\x8b":
                import gzip
                corpo = gzip.decompress(corpo)
            return corpo
        except (urllib.error.URLError, urllib.error.HTTPError, OSError) as exc:
            ultimo = exc
            if t < tentativas:
                espera = min(2 ** t, 30)
                log(f"    [!] {url} falhou ({exc}); nova tentativa em {espera}s "
                    f"({t}/{tentativas})")
                time.sleep(espera)
    raise RuntimeError(f"falha ao acessar {url} após {tentativas} tentativas: "
                       f"{ultimo}")


def barra(atual: int, total: int, largura: int = 28) -> str:
    if not total:
        return ""
    frac = min(1.0, atual / total)
    cheio = int(frac * largura)
    return f"[{'█' * cheio}{'·' * (largura - cheio)}] {frac * 100:5.1f}%"
