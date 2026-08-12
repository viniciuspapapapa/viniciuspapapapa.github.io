#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Empresas de Minas Gerais com exposição potencial a risco ambiental
==================================================================

Pipeline de inteligência comercial para prospecção jurídica, construído sobre
os **Dados Abertos do CNPJ da Receita Federal do Brasil**.

    DADOS PÚBLICOS DE CNPJ
      → empresas de MG
      → CNAEs de exposição ambiental (principal E secundários)
      → exclusão de grande porte
      → score de prioridade explicável
      → planilha de EMPRESAS + planilha SEPARADA de SÓCIOS
      → base pronta para pesquisa jurídica MANUAL

⚠️ O QUE ESTE SISTEMA NÃO FAZ
-----------------------------
Não pesquisa inquéritos, ações penais, termos circunstanciados ou denúncias.
Não afirma, não sugere e não presume irregularidade de nenhuma empresa. O que
ele produz é uma lista de empresas cuja **atividade econômica declarada** está
sujeita a licenciamento e fiscalização ambiental — e que, por isso, merecem
verificação jurídica individualizada, feita manualmente, em fonte oficial, em
etapa posterior e independente.

Uso:
    python main.py --dados ../data/raw/2026-08 --saida ../data/output
    python main.py --dados ../data/raw/2026-08 --saida ../data/output \\
        --setor "Mineração e beneficiamento mineral" --min-score 70
"""

from __future__ import annotations

import argparse
import json
import os
import sys
from datetime import date, datetime

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import exportacao
import qualidade
from cnae import MatrizCnae
from comum import (LAYOUT_EMPRESAS, LAYOUT_ESTABELECIMENTOS, LAYOUT_SIMPLES,
                   LAYOUT_SOCIOS, MATRIZ_FILIAL, NAO_INFORMADO,
                   SITUACAO_CADASTRAL, Log, anos_desde, arquivos_do_tipo,
                   data_iso, formata_cnpj, ler_arquivo_rfb, monta_cnpj,
                   parse_valor, titulo)
from filtro_porte import ClassificadorPorte
from referencias import Referencias
from scoring import Score, calcular_percentis_municipais
from socios import CAMPOS_SOCIOS, montar_registro

FONTE_RFB = "Receita Federal do Brasil — Dados Abertos do CNPJ"
URL_RFB = "https://arquivos.receitafederal.gov.br/"


# ---------------------------------------------------------------------------
def fontes_utilizadas(competencia: str, hoje: str) -> list[dict]:
    """Requisito 30 — descrição, campos, data de acesso e limitações."""
    return [
        {
            "fonte": f"{FONTE_RFB} — Estabelecimentos",
            "descricao": (f"Cadastro público de estabelecimentos (matrizes e "
                          f"filiais), competência {competencia}. Acesso em "
                          f"{URL_RFB}"),
            "campos": ("CNPJ, matriz/filial, nome fantasia, situação cadastral, "
                       "data e motivo da situação, data de início de atividade, "
                       "CNAE principal, CNAEs secundários, endereço, CEP, UF, "
                       "município, telefone, e-mail"),
            "data_acesso": hoje,
            "limitacoes": (
                "Retrato mensal, com defasagem: a situação atual deve ser "
                "confirmada no CNPJ antes de qualquer abordagem. O município "
                "vem em código próprio da RFB (não IBGE) — a correspondência "
                "com o código IBGE é feita por nome, dentro de MG. O CNAE é "
                "AUTODECLARADO: pode não refletir a atividade efetivamente "
                "exercida, para mais ou para menos."),
        },
        {
            "fonte": f"{FONTE_RFB} — Empresas",
            "descricao": f"Cadastro público de empresas (CNPJ raiz), competência {competencia}.",
            "campos": ("razão social, natureza jurídica, qualificação do "
                       "responsável, capital social, porte"),
            "data_acesso": hoje,
            "limitacoes": (
                "O campo 'porte' tem apenas quatro valores e o código 05 "
                "('DEMAIS') agrupa médio E grande porte. A base NÃO publica "
                "receita bruta nem número de empregados, que são os critérios "
                "legais de porte. O capital social é valor de registro, não "
                "reflete faturamento nem patrimônio atual."),
        },
        {
            "fonte": f"{FONTE_RFB} — Sócios (QSA)",
            "descricao": f"Quadro de sócios e administradores, competência {competencia}.",
            "campos": ("nome do sócio, tipo, CPF/CNPJ (CPF mascarado na "
                       "origem), qualificação, data de entrada, faixa etária, "
                       "representante legal e sua qualificação"),
            "data_acesso": hoje,
            "limitacoes": (
                "CPF publicado já mascarado pela RFB. Não abrange sociedades "
                "cujo quadro não é levado a registro, nem participações "
                "indiretas. Não informa o período em que cada sócio esteve à "
                "frente da administração, apenas a data de entrada."),
        },
        {
            "fonte": f"{FONTE_RFB} — Simples Nacional",
            "descricao": f"Opção pelo Simples Nacional e pelo MEI, competência {competencia}.",
            "campos": ("opção pelo Simples, opção pelo MEI e respectivas datas "
                       "de opção e exclusão"),
            "data_acesso": hoje,
            "limitacoes": ("Arquivo opcional no pipeline. Sem ele, perde-se o "
                           "sinal oficial mais forte de que a empresa NÃO é de "
                           "grande porte."),
        },
        {
            "fonte": f"{FONTE_RFB} — Tabelas de domínio",
            "descricao": ("Tabelas oficiais de CNAEs, municípios, naturezas "
                          "jurídicas, qualificações de sócios e motivos de "
                          "situação cadastral."),
            "campos": "código e descrição de cada domínio",
            "data_acesso": hoje,
            "limitacoes": ("A tabela de municípios é nacional e não traz a UF, "
                           "o que exige o casamento por nome dentro de MG."),
        },
        {
            "fonte": "IBGE — API de Localidades",
            "descricao": ("Códigos e nomes oficiais dos 853 municípios de Minas "
                          "Gerais. https://servicodados.ibge.gov.br/api/v1/"
                          "localidades/estados/31/municipios"),
            "campos": "código IBGE do município, nome oficial",
            "data_acesso": hoje,
            "limitacoes": ("O cruzamento com a base da RFB é feito por nome "
                           "normalizado; municípios sem correspondência ficam "
                           "com o código IBGE vazio e são reportados na "
                           "verificação de qualidade — nunca preenchidos por "
                           "aproximação."),
        },
        {
            "fonte": "Lei nº 6.938/1981, Anexo VIII (Lei nº 10.165/2000)",
            "descricao": ("Relação oficial das atividades potencialmente "
                          "poluidoras e utilizadoras de recursos ambientais, "
                          "com o grau Pp/gu de cada uma das 20 categorias. "
                          "Base normativa da matriz de CNAEs."),
            "campos": "categoria, descrição das atividades, grau Pp/gu",
            "data_acesso": hoje,
            "limitacoes": ("A lei classifica CATEGORIAS DE ATIVIDADE, não "
                           "códigos CNAE. A correspondência categoria→CNAE é "
                           "interpretativa e está documentada, código a código, "
                           "na aba MATRIZ_CNAE e no arquivo de configuração."),
        },
        {
            "fonte": "Lei nº 9.605/1998 e resoluções CONAMA",
            "descricao": ("Lei de Crimes Ambientais e resoluções setoriais "
                          "(237/1997, 273/2000, 307/2002, 358/2005, 362/2005, "
                          "420/2009, 430/2011, entre outras), usadas para "
                          "fundamentar a justificativa de cada grupo de CNAEs."),
            "campos": "fundamentos normativos citados na matriz",
            "data_acesso": hoje,
            "limitacoes": ("Citadas como fundamento da CLASSIFICAÇÃO DE "
                           "EXPOSIÇÃO da atividade. Não representam imputação a "
                           "nenhuma empresa concreta."),
        },
    ]


# ---------------------------------------------------------------------------
def main() -> None:
    p = argparse.ArgumentParser(
        description="Base de empresas de MG com exposição potencial a risco "
                    "ambiental, a partir dos Dados Abertos do CNPJ.")
    p.add_argument("--dados", required=True,
                   help="pasta com os arquivos da RFB (ex.: ../data/raw/2026-08)")
    p.add_argument("--saida", default="../data/output")
    p.add_argument("--config", default="../config")
    p.add_argument("--logs", default="../logs")
    p.add_argument("--uf", default="MG")
    p.add_argument("--min-score", type=int, default=0,
                   help="score mínimo para entrar nas planilhas")
    p.add_argument("--grau", default="", help="filtra por grau (ex.: A ou A,B)")
    p.add_argument("--setor", default="", help="filtra por setor (texto parcial)")
    p.add_argument("--municipio", default="", help="filtra por município")
    p.add_argument("--limite-xlsx", type=int, default=5000,
                   help="máximo de empresas na planilha XLSX (0 = todas). "
                        "O CSV sempre leva a base completa.")
    p.add_argument("--incluir-baixadas", action="store_true",
                   help="mantém empresas BAIXADA/NULA (padrão: excluir)")
    p.add_argument("--sem-socios", action="store_true",
                   help="não processa o quadro societário")
    p.add_argument("--amostra", type=int, default=0,
                   help="lê apenas N linhas por arquivo (teste rápido)")
    args = p.parse_args()

    os.makedirs(args.saida, exist_ok=True)
    log = Log(os.path.join(args.logs, "pipeline.log"))
    hoje = date.today().isoformat()
    agora = datetime.now().isoformat(timespec="seconds")
    competencia = os.path.basename(os.path.normpath(args.dados))

    log("=" * 78)
    log("EMPRESAS DE MG COM EXPOSIÇÃO POTENCIAL A RISCO AMBIENTAL")
    log("=" * 78)
    log(f"[i] competência da base: {competencia}")
    log(f"[i] dados brutos: {args.dados}")

    # ---- configuração ---------------------------------------------------
    matriz = MatrizCnae(os.path.join(args.config, "cnaes_risco_ambiental.json"))
    cfg = json.load(open(os.path.join(args.config, "parametros_score.json"),
                         encoding="utf-8"))
    log(f"[i] matriz de CNAEs: {len(matriz)} subclasses de exposição ambiental")

    refs = Referencias(args.dados,
                       os.path.join(args.config, "municipios_mg_ibge.json"), log)
    classificador = ClassificadorPorte(cfg, refs.naturezas, log)
    scorer = Score(cfg)

    regras_situacao = cfg["situacao_cadastral"]["regras"]

    # =====================================================================
    # ETAPA 1-4 — ESTABELECIMENTOS: filtro geográfico + filtro de atividade
    # =====================================================================
    arqs_estab = arquivos_do_tipo(args.dados, "Estabelecimentos")
    if not arqs_estab:
        sys.exit(f"Nenhum arquivo 'Estabelecimentos*' em {args.dados}. "
                 f"Rode ./baixar.sh primeiro.")
    log(f"\n[ETAPA 1-4] lendo {len(arqs_estab)} arquivo(s) de estabelecimentos ...")

    selecionados: dict[str, list[dict]] = {}   # cnpj_basico → [estabelecimentos]
    lidos = mg = com_risco = excl_situacao = 0

    for caminho in arqs_estab:
        log(f"  · {os.path.basename(caminho)}")
        for n, row in enumerate(ler_arquivo_rfb(caminho, LAYOUT_ESTABELECIMENTOS,
                                                log=lambda *_: None)):
            lidos += 1
            if args.amostra and n >= args.amostra:
                break
            if lidos % 5_000_000 == 0:
                log(f"      ... {lidos:,} lidos | MG {mg:,} | risco {com_risco:,}")

            # ETAPA 3 — filtro geográfico
            if row["uf"].strip().upper() != args.uf:
                continue
            mg += 1

            # ETAPA 4 — filtro de atividade (principal E secundários)
            aval = matriz.avaliar(row["cnae_fiscal_principal"],
                                  row["cnae_fiscal_secundaria"])
            if not aval["tem_risco"]:
                continue
            com_risco += 1

            # requisito 23 — situação cadastral
            sit = (row["situacao_cadastral"] or "").strip().zfill(2)
            regra = regras_situacao.get(sit, {})
            if regra.get("acao") == "excluir" and not args.incluir_baixadas:
                excl_situacao += 1
                continue

            selecionados.setdefault(row["cnpj_basico"], []).append(
                {"row": row, "aval": aval})

    log(f"[i] estabelecimentos lidos ....... {lidos:,}")
    log(f"[i] em {args.uf} ................... {mg:,}")
    log(f"[i] com CNAE de exposição ........ {com_risco:,}")
    log(f"[i] excluídos por situação ....... {excl_situacao:,}")
    log(f"[i] CNPJ raiz distintos .......... {len(selecionados):,}")

    if not selecionados:
        sys.exit("Nenhuma empresa selecionada — verifique os filtros.")

    # =====================================================================
    # ETAPA 5a — contagem nacional de estabelecimentos por CNPJ raiz
    # =====================================================================
    # Segunda passagem, restrita aos CNPJ raiz já selecionados. É o sinal
    # objetivo de "rede extensa" usado no filtro de porte. Feita em passagem
    # separada para não exigir manter em memória um contador de todos os ~22
    # milhões de CNPJ raiz do país.
    log("\n[ETAPA 5a] contando estabelecimentos por CNPJ raiz (Brasil) ...")
    qtd_estab: dict[str, int] = {k: 0 for k in selecionados}
    for caminho in arqs_estab:
        for n, row in enumerate(ler_arquivo_rfb(caminho, LAYOUT_ESTABELECIMENTOS,
                                                log=lambda *_: None)):
            if args.amostra and n >= args.amostra:
                break
            b = row["cnpj_basico"]
            if b in qtd_estab:
                qtd_estab[b] += 1
    log(f"[i] contagem concluída para {len(qtd_estab):,} CNPJ raiz.")

    # =====================================================================
    # ETAPA 5b — dados da empresa (CNPJ raiz)
    # =====================================================================
    log("\n[ETAPA 5b] lendo cadastro de empresas ...")
    dados_empresa: dict[str, dict] = {}
    for caminho in arquivos_do_tipo(args.dados, "Empresas"):
        log(f"  · {os.path.basename(caminho)}")
        for n, row in enumerate(ler_arquivo_rfb(caminho, LAYOUT_EMPRESAS,
                                                log=lambda *_: None)):
            if args.amostra and n >= args.amostra:
                break
            if row["cnpj_basico"] in selecionados:
                dados_empresa[row["cnpj_basico"]] = row
    log(f"[i] {len(dados_empresa):,} de {len(selecionados):,} CNPJ raiz "
        f"encontrados no cadastro de empresas.")

    # ---- Simples Nacional (opcional) ------------------------------------
    simples: dict[str, tuple[bool, bool]] = {}
    arqs_simples = arquivos_do_tipo(args.dados, "Simples")
    if arqs_simples:
        log("\n[ETAPA 5c] lendo Simples Nacional ...")
        for caminho in arqs_simples:
            for n, row in enumerate(ler_arquivo_rfb(caminho, LAYOUT_SIMPLES,
                                                    log=lambda *_: None)):
                if args.amostra and n >= args.amostra:
                    break
                if row["cnpj_basico"] in selecionados:
                    simples[row["cnpj_basico"]] = (
                        row["opcao_pelo_simples"].strip().upper() == "S",
                        row["opcao_mei"].strip().upper() == "S")
        log(f"[i] {len(simples):,} CNPJ raiz com informação do Simples.")
    else:
        log("\n[i] Simples.zip ausente — o sinal oficial de enquadramento no "
            "Simples não será usado no filtro de porte.")

    # =====================================================================
    # ETAPA 5d/6 — porte, montagem dos registros e score
    # =====================================================================
    log("\n[ETAPA 5-6] classificando porte e montando registros ...")
    empresas: list[dict] = []
    excl_porte = porte_ni = 0
    seq = 0

    for basico, estabs in selecionados.items():
        emp = dados_empresa.get(basico)
        if emp is None:
            emp = {"razao_social": "", "natureza_juridica": "",
                   "capital_social": "0", "porte": "00"}

        op_simples, op_mei = simples.get(basico, (None, None))
        laudo = classificador.classificar(
            porte_rfb=emp.get("porte", ""),
            capital_social=emp.get("capital_social", ""),
            natureza_juridica=emp.get("natureza_juridica", ""),
            qtd_estabelecimentos=qtd_estab.get(basico, len(estabs)),
            optante_simples=op_simples, optante_mei=op_mei)

        if not laudo["incluir"]:
            excl_porte += len(estabs)
            continue
        if laudo["porte_nao_identificado"]:
            porte_ni += len(estabs)

        for item in estabs:
            row, aval = item["row"], item["aval"]
            seq += 1
            cnpj = monta_cnpj(row["cnpj_basico"], row["cnpj_ordem"],
                              row["cnpj_dv"])
            municipio, ibge = refs.municipio(row["municipio"])
            dom = aval["atividade_dominante"]
            anos = anos_desde(row["data_inicio_atividade"])
            sit = (row["situacao_cadastral"] or "").strip().zfill(2)

            endereco = " ".join(x for x in [
                titulo(row["tipo_logradouro"]), titulo(row["logradouro"]),
                row["numero"], titulo(row["complemento"])] if x).strip()
            tel = (f"({row['ddd_1']}) {row['telefone_1']}"
                   if row["ddd_1"] and row["telefone_1"] else "")

            empresas.append({
                # chaves internas (minúsculas) usadas pelo score e pela qualidade
                "id_empresa": f"MG{seq:06d}",
                "cnpj": cnpj,
                "cnpj_basico": basico,
                "razao_social": emp.get("razao_social", ""),
                "municipio": municipio,
                "codigo_ibge": ibge,
                "codigo_municipio_rfb": row["municipio"],
                "uf": row["uf"],
                "cnae_principal": aval["cnae_principal"],
                "setor_risco": aval["setor_principal"],
                "capital_social": laudo["capital_social"],
                "porte_nao_identificado": laudo["porte_nao_identificado"],
                "data_abertura": data_iso(row["data_inicio_atividade"]),
                "_aval": aval, "_laudo": laudo, "_anos": anos, "_sit": sit,
                "_row": row, "_emp": emp,
                # colunas da planilha
                "ID_EMPRESA": f"MG{seq:06d}",
                "CNPJ": formata_cnpj(cnpj),
                "CNPJ_BASICO": basico,
                "RAZAO_SOCIAL": emp.get("razao_social", ""),
                "NOME_FANTASIA": row["nome_fantasia"] or "",
                "SITUACAO_CADASTRAL": SITUACAO_CADASTRAL.get(sit, NAO_INFORMADO),
                "DATA_SITUACAO_CADASTRAL": data_iso(row["data_situacao_cadastral"]),
                "MOTIVO_SITUACAO_CADASTRAL": refs.motivo(
                    row["motivo_situacao_cadastral"]),
                "DATA_ABERTURA": data_iso(row["data_inicio_atividade"]),
                "ANOS_ATIVIDADE": round(anos, 1) if anos is not None else "",
                "NATUREZA_JURIDICA": (
                    f"{emp.get('natureza_juridica', '')} - "
                    f"{refs.natureza(emp.get('natureza_juridica', ''))}").strip(" -"),
                "PORTE_RFB": laudo["porte_rfb"],
                "PORTE_CLASSIFICADO": laudo["porte_classificado"],
                "MOTIVO_EXCLUSAO_PORTE": laudo["motivo_exclusao_porte"],
                "OPTANTE_SIMPLES": ("Sim" if op_simples else
                                    "Não" if op_simples is False else NAO_INFORMADO),
                "OPTANTE_MEI": ("Sim" if op_mei else
                                "Não" if op_mei is False else NAO_INFORMADO),
                "CAPITAL_SOCIAL": laudo["capital_social"],
                "QTD_ESTABELECIMENTOS_RAIZ": laudo["qtd_estabelecimentos_raiz"],
                "MATRIZ_FILIAL": MATRIZ_FILIAL.get(
                    row["identificador_matriz_filial"], NAO_INFORMADO),
                "CNAE_PRINCIPAL": aval["cnae_principal"],
                "DESCRICAO_CNAE_PRINCIPAL": refs.descricao_cnae(
                    aval["cnae_principal"]),
                "CNAES_SECUNDARIOS": ", ".join(aval["cnaes_secundarios"]),
                "CNAES_RISCO": ", ".join(aval["cnaes_risco"]),
                "QTD_CNAES_RISCO": aval["qtd_cnaes_risco"],
                "CNAE_MAIOR_EXPOSICAO": dom["codigo"],
                "DESCRICAO_CNAE_MAIOR_EXPOSICAO": dom["descricao"],
                "SETOR_RISCO": aval["setor_principal"],
                "SETORES_ADICIONAIS": ", ".join(
                    s for s in aval["setores"] if s != aval["setor_principal"]),
                "CATEGORIA_ANEXO_VIII": dom["categoria_anexo_viii"],
                "PP_GU_ANEXO_VIII": dom["pp_gu"],
                "NIVEL_RISCO_AMBIENTAL": aval["nivel_exposicao"],
                "JUSTIFICATIVA_AMBIENTAL": dom["justificativa"],
                "FUNDAMENTO_NORMATIVO": " • ".join(dom["fontes"]),
                "MUNICIPIO": municipio,
                "CODIGO_IBGE": ibge,
                "UF": row["uf"],
                "ENDERECO": endereco,
                "BAIRRO": titulo(row["bairro"]),
                "CEP": row["cep"],
                "TELEFONE": tel,
                "EMAIL": (row["correio_eletronico"] or "").lower(),
                "DATA_COLETA": hoje,
                "FONTE": f"{FONTE_RFB} ({competencia})",
                "COMPETENCIA_BASE": competencia,
                "STATUS_PESQUISA_CRIMINAL": "NÃO PESQUISADO",
                "OBSERVACOES_PESQUISA_CRIMINAL": "",
                "STATUS_PESQUISA_MANUAL": "NÃO PESQUISADO",
                "OBSERVACOES": "",
            })

    log(f"[i] estabelecimentos excluídos por porte: {excl_porte:,}")
    log(f"[i] registros montados: {len(empresas):,}")

    # ---- score (requer a base montada, para a concentração municipal) ---
    log("\n[ETAPA 6] calculando score de prioridade ...")
    percentis = calcular_percentis_municipais(empresas)
    for e in empresas:
        pct = percentis.get((e["municipio"], e["setor_risco"]))
        res = scorer.calcular(aval_cnae=e["_aval"], laudo_porte=e["_laudo"],
                              anos_atividade=e["_anos"],
                              situacao_cadastral=e["_sit"],
                              percentil_municipio=pct)
        e["SCORE_PRIORIDADE"] = res["score"]
        e["GRAU_PRIORIDADE"] = res["grau"]
        e["CLASSIFICACAO_PRIORIDADE"] = res["classificacao"]
        e["LOGICA_DA_CLASSIFICACAO"] = res["logica"]

    empresas.sort(key=lambda e: (-e["SCORE_PRIORIDADE"],
                                 -e["_aval"]["peso_maximo"],
                                 e["RAZAO_SOCIAL"]))

    # libera as estruturas intermediárias: em uma execução real são centenas de
    # milhares de registros, e elas não são mais necessárias após o score
    for e in empresas:
        for chave in ("_aval", "_laudo", "_row", "_emp", "_anos", "_sit"):
            e.pop(chave, None)
    selecionados.clear()
    dados_empresa.clear()

    # ---- filtros de recorte comercial -----------------------------------
    antes = len(empresas)
    if args.min_score:
        empresas = [e for e in empresas if e["SCORE_PRIORIDADE"] >= args.min_score]
    if args.grau:
        graus = {g.strip().upper() for g in args.grau.split(",")}
        empresas = [e for e in empresas if e["GRAU_PRIORIDADE"] in graus]
    if args.setor:
        alvo = args.setor.lower()
        empresas = [e for e in empresas if alvo in e["SETOR_RISCO"].lower()]
    if args.municipio:
        alvo = args.municipio.lower()
        empresas = [e for e in empresas if alvo in e["MUNICIPIO"].lower()]
    if len(empresas) != antes:
        log(f"[i] filtros de recorte: {len(empresas):,} de {antes:,} empresas.")

    if not empresas:
        sys.exit("Nenhuma empresa restou após os filtros de recorte.")

    # =====================================================================
    # ETAPA 8 — sócios (arquivo separado)
    # =====================================================================
    lista_socios: list[dict] = []
    if not args.sem_socios:
        log("\n[ETAPA 8] lendo quadro societário ...")
        por_basico: dict[str, list[dict]] = {}
        for e in empresas:
            por_basico.setdefault(e["cnpj_basico"], []).append(e)
        # um registro de sócio por EMPRESA (matriz), evitando repetir o QSA
        # em cada filial
        matriz_por_basico = {
            b: min(lst, key=lambda e: e["CNPJ"]) for b, lst in por_basico.items()}

        fonte_socios = f"{FONTE_RFB} — QSA ({competencia})"
        for caminho in arquivos_do_tipo(args.dados, "Socios"):
            log(f"  · {os.path.basename(caminho)}")
            for n, row in enumerate(ler_arquivo_rfb(caminho, LAYOUT_SOCIOS,
                                                    log=lambda *_: None)):
                if args.amostra and n >= args.amostra:
                    break
                alvo = matriz_por_basico.get(row["cnpj_basico"])
                if alvo:
                    lista_socios.append(montar_registro(
                        row, alvo, refs, hoje, fonte_socios))
        log(f"[i] {len(lista_socios):,} registros de sócios.")

    # =====================================================================
    # ETAPA 9 — qualidade, agregados e exportação
    # =====================================================================
    log("\n[ETAPA 9] verificando qualidade e exportando ...")
    rel_qualidade = qualidade.verificar(empresas, lista_socios, refs)
    log(qualidade.resumo_texto(rel_qualidade))

    agregados = exportacao.agregar_municipios(empresas)

    por_setor: dict[str, int] = {}
    por_grau: dict[str, int] = {}
    for e in empresas:
        por_setor[e["SETOR_RISCO"]] = por_setor.get(e["SETOR_RISCO"], 0) + 1
        por_grau[e["GRAU_PRIORIDADE"]] = por_grau.get(e["GRAU_PRIORIDADE"], 0) + 1

    meta = {"gerado_em": agora, "fontes": fontes_utilizadas(competencia, hoje)}

    # CSV completo (auditoria) + XLSX priorizado (uso comercial)
    exportacao.exportar_csv(
        empresas, os.path.join(args.saida, "empresas_risco_ambiental_mg.csv"), log)
    exportacao.exportar_csv_socios(
        lista_socios, CAMPOS_SOCIOS,
        os.path.join(args.saida, "socios_empresas_risco_ambiental_mg.csv"), log)

    limite = args.limite_xlsx or len(empresas)
    empresas_xlsx = empresas[:limite]
    if len(empresas_xlsx) < len(empresas):
        log(f"[i] XLSX limitado às {limite:,} empresas de maior score "
            f"(o CSV traz as {len(empresas):,}).")
    # junção pelo CNPJ raiz — o quadro societário é da empresa, não do
    # estabelecimento, e assim as filiais também levam seus sócios
    raizes_xlsx = {e["cnpj_basico"] for e in empresas_xlsx}
    socios_xlsx = [s for s in lista_socios if s["CNPJ_BASICO"] in raizes_xlsx]

    exportacao.exportar_xlsx(
        empresas_xlsx, socios_xlsx, CAMPOS_SOCIOS, matriz, meta, agregados,
        os.path.join(args.saida, "empresas_risco_ambiental_mg.xlsx"),
        os.path.join(args.saida, "socios_empresas_risco_ambiental_mg.xlsx"), log)

    exportacao.exportar_mapa(
        agregados, meta, os.path.join(args.saida, "mapa_municipios_mg.json"), log)

    relatorio = {
        "gerado_em": agora,
        "competencia": competencia,
        "uf": args.uf,
        "matriz_cnaes": {"total": len(matriz),
                         "total_oficiais": len(refs.cnaes_oficiais),
                         "arquivo": matriz.caminho},
        "estatisticas": {
            "estabelecimentos_lidos": lidos,
            "estabelecimentos_mg": mg,
            "com_cnae_risco": com_risco,
            "excluidos_situacao": excl_situacao,
            "excluidos_porte": excl_porte,
            "base_final": len(empresas),
            "porte_nao_identificado": sum(
                1 for e in empresas if e["porte_nao_identificado"]),
            "por_setor": por_setor,
            "por_grau": por_grau,
            "municipios_distintos": len(agregados),
        },
        "top_municipios": agregados[:50],
        "qualidade": rel_qualidade,
        "qualidade_resumo": qualidade.resumo_texto(rel_qualidade),
        "fontes": meta["fontes"],
        "aviso": (
            "Base de EXPOSIÇÃO POTENCIAL a risco ambiental em razão da atividade "
            "econômica declarada. Não afirma, não sugere e não presume a prática "
            "de infração administrativa, ilícito civil ou crime por nenhuma das "
            "empresas listadas. A verificação de eventuais procedimentos é "
            "manual, posterior e deve ser feita em fonte oficial."),
    }
    exportacao.exportar_relatorio(
        relatorio, os.path.join(args.saida, "relatorio_execucao.json"),
        os.path.join(args.saida, "relatorio_execucao.md"), log)

    log("\n" + "=" * 78)
    log(f"CONCLUÍDO — {len(empresas):,} empresas | {len(lista_socios):,} sócios")
    log(f"Saída: {os.path.abspath(args.saida)}")
    log("=" * 78)
    log.fechar()


if __name__ == "__main__":
    main()
