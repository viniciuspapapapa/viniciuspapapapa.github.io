#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Quadro societário — planilha SEPARADA (requisitos 10, 11 e 28).

Por que separado
----------------
Segue a lógica já adotada no projeto de Dívida Ativa deste repositório: dados
de pessoas naturais **não se misturam** ao cadastro empresarial. Ficam em
arquivo próprio, relacionável por ``ID_EMPRESA`` e ``CNPJ``, de modo que a
base principal possa circular internamente sem carregar dado pessoal.

Proteção de dados
-----------------
* O CPF do sócio **já vem mascarado pela própria Receita Federal** no formato
  ``***XXXXXX**`` (apenas os seis dígitos centrais). Este pipeline **não
  desmascara, não completa e não cruza** esse dado com nenhuma outra base.
* Não são coletados endereço residencial, telefone pessoal nem e-mail pessoal
  de sócio — a base de sócios da RFB não os traz, e nada é buscado em outra
  fonte para supri-los.
* A finalidade é legítima e delimitada: identificar o administrador
  responsável pela atividade, informação necessária a qualquer atuação
  jurídica empresarial, e que é **pública por determinação legal** (art. 29 da
  Lei nº 8.934/1994 — os atos de registro do comércio são públicos).
* Campo não informado pela fonte fica **vazio**. Nada é preenchido por
  inferência (requisito 29).
"""

from __future__ import annotations

from comum import FAIXA_ETARIA, NAO_INFORMADO, TIPO_SOCIO, data_iso

# Qualificações que indicam poder de administração. A responsabilidade — civil,
# administrativa ou penal — por atos da atividade recai, em regra, sobre quem
# a dirige. Mesma lógica do projeto de Dívida Ativa (etl/qsa_fetch.py).
PALAVRAS_ADMIN = (
    "ADMINISTRADOR", "DIRETOR", "PRESIDENTE", "TITULAR", "GERENTE",
    "CONSELHEIRO", "PROPRIETARIO", "SOCIO-ADMINISTRADOR", "SOCIO ADMINISTRADOR",
)


def eh_administrador(qualificacao: str) -> bool:
    q = (qualificacao or "").upper()
    return any(p in q for p in PALAVRAS_ADMIN)


def montar_registro(row: dict, empresa: dict, referencias,
                    data_coleta: str, fonte: str) -> dict:
    """Monta uma linha da planilha SOCIOS a partir do registro bruto da RFB."""
    qualificacao = referencias.qualificacao(row.get("qualificacao_socio", ""))
    qualif_repr = referencias.qualificacao(
        row.get("qualificacao_representante_legal", ""))
    tipo = TIPO_SOCIO.get((row.get("identificador_socio") or "").strip(), "")

    # CPF/CNPJ do sócio: preservado exatamente como publicado pela RFB
    # (CPF já mascarado na origem). Nunca reconstruído nem completado.
    doc = (row.get("cpf_cnpj_socio") or "").strip()

    repr_legal = (row.get("nome_do_representante") or "").strip()
    doc_repr = (row.get("representante_legal") or "").strip()

    return {
        "ID_EMPRESA": empresa["ID_EMPRESA"],
        # CNPJ_BASICO é a chave de junção correta: o quadro societário é da
        # EMPRESA (raiz), não do estabelecimento. Permite relacionar os sócios
        # a qualquer linha da planilha EMPRESAS, matriz ou filial.
        "CNPJ_BASICO": empresa["cnpj_basico"],
        "CNPJ": empresa["CNPJ"],
        "RAZAO_SOCIAL": empresa["razao_social"],
        "MUNICIPIO": empresa.get("municipio", ""),
        "NOME_SOCIO": (row.get("nome_socio_razao_social") or "").strip(),
        "TIPO_SOCIO": tipo or NAO_INFORMADO,
        "CPF_CNPJ_SOCIO": doc,
        "QUALIFICACAO": qualificacao or NAO_INFORMADO,
        "E_ADMINISTRADOR": "Sim" if eh_administrador(qualificacao) else "Não",
        "DATA_ENTRADA": data_iso(row.get("data_entrada_sociedade", "")),
        "FAIXA_ETARIA": FAIXA_ETARIA.get(
            (row.get("faixa_etaria") or "").strip(), ""),
        "REPRESENTANTE_LEGAL": repr_legal,
        "CPF_REPRESENTANTE_LEGAL": doc_repr if repr_legal else "",
        "QUALIFICACAO_REPRESENTANTE": qualif_repr if repr_legal else "",
        "FONTE": fonte,
        "DATA_COLETA": data_coleta,
        "OBSERVACOES": "",
    }


CAMPOS_SOCIOS = [
    "ID_EMPRESA", "CNPJ_BASICO", "CNPJ", "RAZAO_SOCIAL", "MUNICIPIO", "NOME_SOCIO",
    "TIPO_SOCIO", "CPF_CNPJ_SOCIO", "QUALIFICACAO", "E_ADMINISTRADOR",
    "DATA_ENTRADA", "FAIXA_ETARIA", "REPRESENTANTE_LEGAL",
    "CPF_REPRESENTANTE_LEGAL", "QUALIFICACAO_REPRESENTANTE", "FONTE",
    "DATA_COLETA", "OBSERVACOES",
]
