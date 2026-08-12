#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Classificação e filtro de porte (requisito 8).

O problema
----------
O projeto quer empresas de PEQUENO e MÉDIO porte. A base da RFB traz um campo
``porte`` com apenas quatro valores:

    00 NÃO INFORMADO | 01 MICRO EMPRESA | 03 EMPRESA DE PEQUENO PORTE | 05 DEMAIS

O código **05 ("DEMAIS") agrupa médio e grande porte**. Sozinho, ele não
permite excluir a grande empresa — que é justamente o que se quer excluir. E a
RFB **não publica receita bruta**, que é o critério legal de porte.

A solução adotada
-----------------
Em vez de arbitrar, combinam-se **sinais objetivos e verificáveis**, cada um
registrado individualmente em ``MOTIVO_EXCLUSAO_PORTE`` para que a decisão
seja auditável e reversível:

1. **Natureza jurídica** — companhia aberta, empresa pública e sociedade de
   economia mista não correspondem ao perfil de prospecção. Sinal categórico,
   vindo de tabela oficial da RFB.
2. **Número de estabelecimentos do mesmo CNPJ raiz** — contado na própria base
   nacional da RFB. Rede extensa é incompatível com pequeno/médio porte.
   Sinal objetivo e calculado, não estimado.
3. **Capital social** — único valor financeiro publicado na base. Usa-se o
   limiar de R$ 12 milhões, espelhado do art. 17-D, § 1º, III, da Lei nº
   6.938/1981 (que define grande porte, para fins ambientais, pela receita
   bruta anual superior a esse valor). **Capital social não é receita bruta**:
   trata-se de um *proxy* declarado, por isso a exclusão por este critério é
   marcada de forma distinta e pode ser desligada na configuração.
4. **Opção pelo Simples Nacional** — se a empresa é optante, sua receita bruta
   está, por definição legal, dentro do teto do Simples (LC nº 123/2006), o
   que a exclui de "grande porte" com base em **ato oficial**. É o sinal
   positivo mais forte disponível.

Quando nenhum sinal permite concluir, a empresa **não é excluída nem
classificada por chute**: recebe ``NAO_IDENTIFICADO`` e permanece na base,
sinalizada — exatamente como pede o requisito.
"""

from __future__ import annotations

from comum import PORTE_RFB, parse_valor

# Classificações internas de porte
MICRO = "MICRO"
PEQUENO = "PEQUENO"
MEDIO = "MEDIO"
GRANDE = "GRANDE"
MEI = "MEI"
NAO_IDENTIFICADO = "NAO_IDENTIFICADO"


class ClassificadorPorte:
    def __init__(self, cfg: dict, naturezas_oficiais: dict[str, str], log=print):
        p = cfg["porte"]
        self.limite_capital = float(p["capital_social_grande_porte"])
        self.min_estabelecimentos = int(p["min_estabelecimentos_grande_porte"])
        self.naturezas_grande = dict(p["naturezas_juridicas_grande_porte"])
        self.excluir_grande = bool(p.get("excluir_grande_porte", True))
        self.excluir_por_capital = bool(p.get("excluir_por_capital_social", True))
        self.excluir_mei = bool(p.get("excluir_mei", False))
        self._validar_naturezas(naturezas_oficiais, log)

    def _validar_naturezas(self, oficiais: dict[str, str], log) -> None:
        """Confere os códigos de natureza jurídica contra a tabela da RFB.

        Um código errado aqui excluiria empresas indevidamente — e de forma
        silenciosa. Por isso a divergência interrompe a execução em vez de
        apenas avisar.
        """
        if not oficiais:
            log("[!] tabela de naturezas jurídicas indisponível; códigos de "
                "porte não puderam ser conferidos.")
            return
        erros = []
        for cod, rotulo in self.naturezas_grande.items():
            oficial = oficiais.get(cod)
            if oficial is None:
                erros.append(f"código {cod} ({rotulo}) não existe na tabela "
                             f"oficial da RFB")
            elif rotulo.strip().upper() != oficial.strip().upper():
                erros.append(f"código {cod}: configuração diz '{rotulo}', "
                             f"tabela oficial da RFB diz '{oficial}'")
        if erros:
            raise SystemExit(
                "\n[ERRO DE CONFIGURAÇÃO] naturezas_juridicas_grande_porte em "
                "config/parametros_score.json:\n  - " + "\n  - ".join(erros) +
                "\n\nCorrija os códigos antes de prosseguir: uma natureza "
                "jurídica errada exclui empresas do público-alvo sem deixar "
                "rastro.")
        log(f"[i] naturezas jurídicas de exclusão conferidas contra a tabela "
            f"oficial: {', '.join(f'{c} ({n})' for c, n in sorted(self.naturezas_grande.items()))}")

    # -----------------------------------------------------------------
    def classificar(self, *, porte_rfb: str, capital_social: str,
                    natureza_juridica: str, qtd_estabelecimentos: int,
                    optante_simples: bool | None,
                    optante_mei: bool | None) -> dict:
        """Classifica o porte e decide inclusão. Retorna dict com o laudo."""
        cod_porte = (porte_rfb or "").strip().zfill(2)
        capital = parse_valor(capital_social)
        natureza = (natureza_juridica or "").strip()

        sinais: list[str] = []
        motivos_exclusao: list[str] = []
        # Sinais CATEGÓRICOS (forma societária, tamanho da rede) valem por si:
        # prevalecem sobre o campo `porte` da RFB. Sinais por PROXY (capital
        # social) só desempatam onde o campo `porte` é omisso ou ambíguo.
        categorico = False

        # ---- sinais de GRANDE porte -----------------------------------
        if natureza in self.naturezas_grande:
            nome = self.naturezas_grande[natureza]
            sinais.append(f"natureza jurídica {natureza} ({nome})")
            motivos_exclusao.append(
                f"natureza_juridica_incompativel: {natureza} — {nome}")
            categorico = True

        if qtd_estabelecimentos >= self.min_estabelecimentos:
            sinais.append(f"{qtd_estabelecimentos} estabelecimentos no CNPJ raiz")
            motivos_exclusao.append(
                f"rede_extensa: {qtd_estabelecimentos} estabelecimentos "
                f"(limite {self.min_estabelecimentos})")
            categorico = True

        capital_alto = capital >= self.limite_capital
        if capital_alto:
            sinais.append(f"capital social R$ {capital:,.2f}")
            if self.excluir_por_capital:
                motivos_exclusao.append(
                    f"capital_social_elevado: R$ {capital:,.2f} >= "
                    f"R$ {self.limite_capital:,.2f} (proxy do art. 17-D, § 1º, "
                    f"III, da Lei nº 6.938/1981 — capital social NÃO é receita "
                    f"bruta)")

        # ---- sinal oficial de NÃO ser grande porte ---------------------
        # Optante do Simples tem receita bruta dentro do teto legal; esse ato
        # oficial prevalece sobre os proxies acima.
        if optante_simples:
            sinais.append("optante do Simples Nacional (LC nº 123/2006)")
            # Ato oficial prevalece sobre PROXY: a opção pelo Simples comprova
            # receita bruta dentro do teto legal, o que afasta a presunção de
            # grande porte derivada do capital social. Não afasta, porém, os
            # sinais categóricos (natureza jurídica e rede de estabelecimentos),
            # que não são proxies de receita.
            motivos_exclusao = [m for m in motivos_exclusao
                                if not m.startswith("capital_social_elevado")]

        # ---- classificação ---------------------------------------------
        if categorico:
            # Companhia aberta, empresa pública, sociedade de economia mista ou
            # rede com dezenas de estabelecimentos não são público-alvo, ainda
            # que o campo `porte` da RFB diga outra coisa.
            classificacao = GRANDE
        elif optante_mei:
            classificacao = MEI
        elif cod_porte == "01":
            classificacao = MICRO
        elif cod_porte == "03":
            classificacao = PEQUENO
        elif cod_porte == "05":
            # "DEMAIS" significa apenas: acima do teto de EPP (LC nº 123/2006).
            # Isso abrange TODA a faixa entre médio e grande porte, e a base da
            # RFB não traz receita bruta para separá-las. Sem um sinal objetivo,
            # dizer "médio" seria inferência arbitrária — vedada pelo escopo — e
            # ainda por cima premiaria a empresa com a maior pontuação de porte.
            if motivos_exclusao:
                # sobrou o proxy de capital social (os sinais categóricos já
                # foram tratados acima): presunção relativa de grande porte
                classificacao = GRANDE
            elif optante_simples:
                # Ato oficial: optante do Simples tem receita dentro do teto
                # legal, o que afasta o grande porte. Resta o enquadramento
                # médio.
                classificacao = MEDIO
            else:
                # A AUSÊNCIA do proxy não prova porte médio — apenas não prova
                # grande porte. Sem sinal, não se arbitra.
                classificacao = NAO_IDENTIFICADO
        else:  # "00" — não informado
            if motivos_exclusao:
                classificacao = GRANDE
            elif optante_simples:
                classificacao = PEQUENO
            else:
                classificacao = NAO_IDENTIFICADO

        # ---- decisão de inclusão ---------------------------------------
        incluir = True
        motivo_final = ""
        if classificacao == GRANDE and self.excluir_grande:
            incluir = False
            motivo_final = " | ".join(motivos_exclusao)
        elif classificacao == MEI and self.excluir_mei:
            incluir = False
            motivo_final = "mei_excluido_por_configuracao"

        return {
            "porte_rfb": PORTE_RFB.get(cod_porte, "NÃO INFORMADO"),
            "porte_rfb_codigo": cod_porte,
            "porte_classificado": classificacao,
            "porte_nao_identificado": classificacao == NAO_IDENTIFICADO,
            "capital_social": capital,
            "qtd_estabelecimentos_raiz": qtd_estabelecimentos,
            "optante_simples": optante_simples,
            "optante_mei": optante_mei,
            "sinais_porte": sinais,
            "incluir": incluir,
            "motivo_exclusao_porte": motivo_final,
        }
