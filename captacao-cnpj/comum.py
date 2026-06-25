"""
Funções e constantes compartilhadas pelo pipeline de captação CNPJ.

A base pública de CNPJ da Receita Federal (formato CSV, vigente desde 2021)
vem em arquivos separados por ';', sem cabeçalho e codificados em LATIN-1
(ISO-8859-1). Aqui centralizamos o layout das tabelas, os de/para de códigos
e a expressão de normalização de nomes para que o "construir_base" e o
"cruzar_clientes" usem exatamente a mesma regra.
"""

# ---------------------------------------------------------------------------
# Download
# ---------------------------------------------------------------------------
# Base oficial dos dados abertos. Cada competência é uma pasta AAAA-MM.
URL_BASE = "https://arquivos.receitafederal.gov.br/dados/cnpj/dados_abertos_cnpj"

# Arquivos que realmente precisamos para o cruzamento sócio -> empresa.
# (Estabelecimentos é grande, mas traz CNAE, e-mail, telefone e UF — ouro para
#  captação. Se quiser uma versão enxuta, dá para pular Estabelecimentos.)
GRUPOS_ARQUIVOS = {
    "Empresas": [f"Empresas{i}.zip" for i in range(10)],
    "Socios": [f"Socios{i}.zip" for i in range(10)],
    "Estabelecimentos": [f"Estabelecimentos{i}.zip" for i in range(10)],
    "Cnaes": ["Cnaes.zip"],
    "Naturezas": ["Naturezas.zip"],
    "Qualificacoes": ["Qualificacoes.zip"],
    "Municipios": ["Municipios.zip"],
}

# ---------------------------------------------------------------------------
# Layout das colunas (ordem dos campos em cada CSV)
# ---------------------------------------------------------------------------
COLUNAS_SOCIOS = [
    "cnpj_basico",
    "identificador_socio",        # 1=PJ, 2=PF, 3=estrangeiro
    "nome_socio",                 # nome da PF ou razão social da PJ sócia
    "cpf_cnpj_socio",             # CPF mascarado p/ PF: ***NNNNNN**
    "qualificacao_socio",         # código -> Qualificacoes
    "data_entrada_sociedade",     # AAAAMMDD
    "pais",
    "representante_legal",
    "nome_representante",
    "qualificacao_representante",
    "faixa_etaria",
]

COLUNAS_EMPRESAS = [
    "cnpj_basico",
    "razao_social",
    "natureza_juridica",          # código -> Naturezas
    "qualificacao_responsavel",
    "capital_social",             # decimal com vírgula no CSV
    "porte_empresa",              # 00/01/03/05
    "ente_federativo",
]

COLUNAS_ESTABELECIMENTOS = [
    "cnpj_basico",
    "cnpj_ordem",
    "cnpj_dv",
    "matriz_filial",              # 1=matriz, 2=filial
    "nome_fantasia",
    "situacao_cadastral",         # 01 nula, 02 ativa, 03 suspensa, 04 inapta, 08 baixada
    "data_situacao_cadastral",
    "motivo_situacao",
    "nome_cidade_exterior",
    "pais",
    "data_inicio_atividade",
    "cnae_principal",
    "cnae_secundaria",
    "tipo_logradouro",
    "logradouro",
    "numero",
    "complemento",
    "bairro",
    "cep",
    "uf",
    "municipio",                  # código -> Municipios
    "ddd_1",
    "telefone_1",
    "ddd_2",
    "telefone_2",
    "ddd_fax",
    "fax",
    "email",
    "situacao_especial",
    "data_situacao_especial",
]

# Tabelas de domínio simples: codigo;descricao
COLUNAS_DOMINIO = ["codigo", "descricao"]

# ---------------------------------------------------------------------------
# De/para de códigos
# ---------------------------------------------------------------------------
PORTE = {
    "00": "Não informado",
    "01": "Microempresa (ME)",
    "03": "Empresa de Pequeno Porte (EPP)",
    "05": "Demais (médio/grande)",
}

SITUACAO_CADASTRAL = {
    "01": "Nula",
    "02": "Ativa",
    "03": "Suspensa",
    "04": "Inapta",
    "08": "Baixada",
}

MATRIZ_FILIAL = {"1": "Matriz", "2": "Filial"}

# ---------------------------------------------------------------------------
# Normalização de nomes — usada IDÊNTICA dos dois lados do JOIN
# ---------------------------------------------------------------------------
# Regra: maiúsculas, sem acentos, só letras e espaços, espaços colapsados.
# strip_accents() e regexp_replace() são nativos do DuckDB, então conseguimos
# normalizar tanto a planilha do cliente quanto a tabela gigante de sócios com
# exatamente a mesma expressão SQL.
def sql_normaliza(coluna: str) -> str:
    return (
        "trim(regexp_replace("
        f"regexp_replace(upper(strip_accents({coluna})), '[^A-Z ]', ' ', 'g'),"
        " ' +', ' ', 'g'))"
    )


def normaliza_py(nome: str) -> str:
    """Versão Python equivalente (para uso fora do DuckDB)."""
    import re
    import unicodedata

    if nome is None:
        return ""
    s = unicodedata.normalize("NFKD", str(nome))
    s = "".join(c for c in s if not unicodedata.combining(c))
    s = s.upper()
    s = re.sub(r"[^A-Z ]", " ", s)
    s = re.sub(r" +", " ", s).strip()
    return s


def cpf_mascarado(cpf: str):
    """
    Converte um CPF completo no formato mascarado da Receita (***NNNNNN**),
    que expõe apenas os 6 dígitos centrais. Permite confirmar um match e
    descartar homônimos quando a planilha tiver o CPF do cliente.
    Retorna None se não houver 11 dígitos.
    """
    if cpf is None:
        return None
    digitos = "".join(c for c in str(cpf) if c.isdigit())
    if len(digitos) != 11:
        return None
    return "***" + digitos[3:9] + "**"
