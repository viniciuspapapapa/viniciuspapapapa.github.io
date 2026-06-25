#!/usr/bin/env python3
"""
Passo 2 — Carrega os CSVs da Receita em um banco DuckDB consultável.

Uso:
    python construir_base.py 2025-05

Gera captacao-cnpj/cnpj.duckdb com as tabelas:
    empresas, socios, estabelecimentos, cnaes, naturezas, qualificacoes, municipios

DuckDB lê os CSVs gigantes direto do disco e roda o JOIN em um notebook comum.
Não precisa de servidor de banco (Postgres etc.).
"""
import sys
from pathlib import Path

import duckdb

from comum import (
    COLUNAS_SOCIOS,
    COLUNAS_EMPRESAS,
    COLUNAS_ESTABELECIMENTOS,
    COLUNAS_DOMINIO,
    sql_normaliza,
)

PASTA = Path(__file__).parent
BANCO = PASTA / "cnpj.duckdb"


def colunas_struct(colunas):
    # força tudo como VARCHAR; convertemos os campos relevantes depois
    return "{" + ", ".join(f"'{c}': 'VARCHAR'" for c in colunas) + "}"


def read_csv(glob, colunas):
    return (
        f"read_csv('{glob}', delim=';', header=false, quote='\"', "
        f"encoding='latin-1', columns={colunas_struct(colunas)}, "
        f"ignore_errors=true, null_padding=true)"
    )


def main():
    if len(sys.argv) < 2:
        sys.exit("Informe a competência. Ex.: python construir_base.py 2025-05")
    competencia = sys.argv[1]
    dados = PASTA / "dados" / competencia
    if not dados.exists():
        sys.exit(f"Pasta não encontrada: {dados}. Rode baixar_dados.py antes.")

    con = duckdb.connect(str(BANCO))

    g = lambda padrao: str(dados / padrao)

    print("Carregando empresas ...")
    con.execute(f"""
        CREATE OR REPLACE TABLE empresas AS
        SELECT
            cnpj_basico,
            razao_social,
            natureza_juridica,
            TRY_CAST(replace(capital_social, ',', '.') AS DOUBLE) AS capital_social,
            porte_empresa
        FROM {read_csv(g('*EMPRECSV'), COLUNAS_EMPRESAS)};
    """)

    print("Carregando sócios (e normalizando nomes) ...")
    con.execute(f"""
        CREATE OR REPLACE TABLE socios AS
        SELECT
            cnpj_basico,
            identificador_socio,
            nome_socio,
            {sql_normaliza('nome_socio')} AS nome_norm,
            cpf_cnpj_socio,
            qualificacao_socio,
            data_entrada_sociedade
        FROM {read_csv(g('*SOCIOCSV'), COLUNAS_SOCIOS)};
    """)

    # Estabelecimentos é opcional (pode não existir no modo enxuto)
    if list(dados.glob("*ESTABELE")):
        print("Carregando estabelecimentos ...")
        con.execute(f"""
            CREATE OR REPLACE TABLE estabelecimentos AS
            SELECT
                cnpj_basico, cnpj_ordem, cnpj_dv,
                matriz_filial, nome_fantasia, situacao_cadastral,
                data_inicio_atividade, cnae_principal,
                uf, municipio, ddd_1, telefone_1, email
            FROM {read_csv(g('*ESTABELE'), COLUNAS_ESTABELECIMENTOS)};
        """)
    else:
        print("(sem Estabelecimentos — modo enxuto)")
        con.execute("CREATE OR REPLACE TABLE estabelecimentos AS SELECT NULL AS cnpj_basico WHERE false;")

    for tabela, padrao in [
        ("cnaes", "*CNAECSV"),
        ("naturezas", "*NATJUCSV"),
        ("qualificacoes", "*QUALSCSV"),
        ("municipios", "*MUNICCSV"),
    ]:
        if list(dados.glob(padrao)):
            print(f"Carregando {tabela} ...")
            con.execute(f"""
                CREATE OR REPLACE TABLE {tabela} AS
                SELECT codigo, descricao FROM {read_csv(g(padrao), COLUNAS_DOMINIO)};
            """)

    print("Criando índices ...")
    con.execute("CREATE INDEX IF NOT EXISTS ix_socios_nome ON socios(nome_norm);")
    con.execute("CREATE INDEX IF NOT EXISTS ix_socios_cnpj ON socios(cnpj_basico);")
    con.execute("CREATE INDEX IF NOT EXISTS ix_emp_cnpj ON empresas(cnpj_basico);")
    try:
        con.execute("CREATE INDEX IF NOT EXISTS ix_est_cnpj ON estabelecimentos(cnpj_basico);")
    except Exception:
        pass

    n_soc = con.execute("SELECT count(*) FROM socios").fetchone()[0]
    n_emp = con.execute("SELECT count(*) FROM empresas").fetchone()[0]
    print(f"\nPronto: {n_soc:,} sócios, {n_emp:,} empresas em {BANCO}")
    print("Próximo passo:  python cruzar_clientes.py <planilha.xlsx>")
    con.close()


if __name__ == "__main__":
    main()
