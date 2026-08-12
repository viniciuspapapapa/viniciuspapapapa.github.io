#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Avaliação de CNAEs contra a matriz de exposição ambiental.

Requisito central (item 7 do escopo): **não considerar apenas o CNAE
principal**. Muitas empresas declaram atividade principal neutra — comércio,
serviços, holding — e mantêm, entre as atividades secundárias, uma atividade
de exposição relevante. O corte por CNAE principal perderia exatamente essas
empresas.

Aqui, portanto:
  1. avalia-se o CNAE principal;
  2. avaliam-se TODOS os CNAEs secundários;
  3. identifica-se a atividade de MAIOR exposição — a regra é a do art. 17-D,
     § 3º, da Lei nº 6.938/1981, que manda considerar, no estabelecimento com
     mais de uma atividade fiscalizável, aquela de maior grau;
  4. registra-se QUAIS CNAEs justificaram a inclusão da empresa;
  5. a pontuação decorre desse conjunto, não de um único código.
"""

from __future__ import annotations

import json


class MatrizCnae:
    """Matriz de CNAEs de exposição ambiental (config/cnaes_risco_ambiental.json)."""

    def __init__(self, caminho: str):
        with open(caminho, encoding="utf-8") as f:
            doc = json.load(f)
        self.meta = doc.get("meta", {})
        self.cnaes: dict[str, dict] = doc["cnaes"]
        self.caminho = caminho

    def __len__(self) -> int:
        return len(self.cnaes)

    def get(self, codigo: str) -> dict | None:
        return self.cnaes.get((codigo or "").strip().zfill(7))

    # -----------------------------------------------------------------
    def avaliar(self, cnae_principal: str, cnaes_secundarios: str) -> dict:
        """Avalia a empresa contra a matriz.

        `cnaes_secundarios` é a string da RFB, com códigos separados por
        vírgula. Retorna dicionário com o resultado ou ``{"tem_risco": False}``.
        """
        principal = (cnae_principal or "").strip().zfill(7)
        secundarios = [c.strip().zfill(7)
                       for c in (cnaes_secundarios or "").split(",")
                       if c.strip() and c.strip() != "0000000"]

        # de-duplica preservando a ordem, e nunca conta o principal duas vezes
        vistos: set[str] = {principal}
        secundarios_unicos: list[str] = []
        for c in secundarios:
            if c not in vistos:
                vistos.add(c)
                secundarios_unicos.append(c)

        item_principal = self.get(principal)
        achados_secundarios = [(c, self.get(c)) for c in secundarios_unicos]
        achados_secundarios = [(c, it) for c, it in achados_secundarios if it]

        if not item_principal and not achados_secundarios:
            return {"tem_risco": False}

        # ---- conjunto de CNAEs de risco -------------------------------
        de_risco: list[dict] = []
        if item_principal:
            de_risco.append({**item_principal, "posicao": "principal"})
        for c, it in achados_secundarios:
            de_risco.append({**it, "posicao": "secundario"})

        # atividade dominante: maior peso; desempate pelo CNAE principal
        dominante = max(de_risco,
                        key=lambda i: (i["peso"], i["posicao"] == "principal"))

        setores = sorted({i["setor"] for i in de_risco})
        peso_max = dominante["peso"]

        return {
            "tem_risco": True,
            "cnae_principal": principal,
            "cnae_principal_de_risco": bool(item_principal),
            "cnaes_secundarios": secundarios_unicos,
            "cnaes_risco": [i["codigo"] for i in de_risco],
            "qtd_cnaes_risco": len(de_risco),
            "peso_maximo": peso_max,
            "atividade_dominante": {
                "codigo": dominante["codigo"],
                "descricao": dominante["descricao"],
                "setor": dominante["setor"],
                "posicao": dominante["posicao"],
                "peso": peso_max,
                "exposicao": dominante["exposicao_ambiental"],
                "categoria_anexo_viii": dominante["categoria_anexo_viii"],
                "pp_gu": dominante["pp_gu_anexo_viii"],
                "justificativa": dominante["justificativa"],
                "fontes": dominante["fontes"],
            },
            "setor_principal": dominante["setor"],
            "setores": setores,
            "nivel_exposicao": dominante["exposicao_ambiental"],
        }
        # Nota: o detalhamento de cada CNAE de risco não é mantido aqui de
        # propósito. Ele seria replicado para cada um dos milhares de
        # estabelecimentos selecionados, e a informação já está disponível sem
        # custo: a coluna CNAES_RISCO lista os códigos e a aba MATRIZ_CNAE traz
        # descrição, peso, justificativa e fontes de cada um.
