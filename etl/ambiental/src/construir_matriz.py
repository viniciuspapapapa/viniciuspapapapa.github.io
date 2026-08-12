#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Construtor da MATRIZ DE CNAEs DE EXPOSIÇÃO AMBIENTAL
=====================================================

Gera ``config/cnaes_risco_ambiental.json`` a partir da **lista oficial de
subclasses CNAE publicada pela Receita Federal** (arquivo ``Cnaes.zip`` dos
Dados Abertos do CNPJ), aplicando regras de classificação explícitas e
auditáveis.

Por que um script e não um JSON escrito à mão
---------------------------------------------
O requisito é não usar uma lista "inventada" de CNAEs. Aqui:

1. **Nenhum código é digitado à mão como se fosse oficial.** As regras são
   declaradas por *prefixo* (divisão/grupo/classe) ou por código exato, e são
   então **expandidas contra a lista oficial da RFB**. Se um código não existe
   na lista oficial, ele não entra na matriz — e o script avisa.
2. **A descrição é sempre a descrição oficial da RFB**, nunca uma paráfrase.
3. Cada regra carrega **setor, enquadramento normativo, grau de potencial
   poluidor, peso, justificativa e fonte** — o "porquê" de cada grupo.
4. O JSON gerado é **editável à mão** depois: incluir um CNAE novo é
   acrescentar uma entrada no JSON, sem tocar em código (requisito 6.10).
   Reexecutar este script regenera a matriz-base; use ``--preservar-manual``
   para não sobrescrever entradas marcadas com ``"origem": "manual"``.

Âncoras normativas usadas na classificação
------------------------------------------
* **Lei nº 6.938/1981, Anexo VIII** (incluído pela Lei nº 10.165/2000) —
  relação oficial das *Atividades Potencialmente Poluidoras e Utilizadoras de
  Recursos Ambientais*, com o **Pp/gu** (potencial de poluição / grau de
  utilização de recursos naturais) de cada uma das 20 categorias: Pequeno,
  Médio ou Alto. É a classificação federal vigente e é o eixo desta matriz.
* **Lei nº 6.938/1981, art. 17-D, § 3º** — quando o estabelecimento exerce mais
  de uma atividade sujeita à fiscalização, considera-se **a de maior valor**.
  É o fundamento normativo para, nesta matriz, a exposição da empresa ser
  determinada pelo **CNAE de maior peso**, principal ou secundário.
* **Resolução CONAMA nº 237/1997, Anexo 1** — atividades sujeitas a
  licenciamento ambiental.
* **Lei nº 9.605/1998** (Lei de Crimes Ambientais) — tipos penais que dão
  relevância *jurídico-criminal* a determinadas atividades (p. ex. arts. 29-37
  fauna; 38-53 flora; 54-61 poluição; 55 extração mineral irregular; 56
  produtos perigosos; 60 funcionamento sem licença).
* **Deliberação Normativa COPAM/MG nº 217/2017** — critérios de classificação
  de empreendimentos por porte e potencial poluidor no Estado de Minas Gerais.
  Referenciada como moldura estadual; o vínculo código-a-código entre CNAE e
  código DN COPAM **não é feito automaticamente** aqui (a DN usa nomenclatura
  própria, não CNAE), e por isso **não é afirmado** em nenhum registro.

⚠️ Natureza da classificação
---------------------------
O peso mede **exposição potencial a risco ambiental em razão da atividade
econômica declarada** — e nada além disso. Não é indício de infração, de
irregularidade ou de prática criminosa por qualquer empresa concreta.

Uso:
    python construir_matriz.py --cnaes ../data/raw/2026-08/Cnaes.zip \
        --saida ../config/cnaes_risco_ambiental.json
"""

from __future__ import annotations

import argparse
import csv
import io
import json
import os
import zipfile
from datetime import date

# ---------------------------------------------------------------------------
# Categorias do Anexo VIII da Lei 6.938/1981 (texto oficial, verificado em
# https://www.planalto.gov.br/ccivil_03/leis/l6938.htm)
# ---------------------------------------------------------------------------
ANEXO_VIII = {
    "01": ("Extração e Tratamento de Minerais", "Alto"),
    "02": ("Indústria de Produtos Minerais Não Metálicos", "Médio"),
    "03": ("Indústria Metalúrgica", "Alto"),
    "04": ("Indústria Mecânica", "Médio"),
    "05": ("Indústria de Material Elétrico, Eletrônico e Comunicações", "Médio"),
    "06": ("Indústria de Material de Transporte", "Médio"),
    "07": ("Indústria de Madeira", "Médio"),
    "08": ("Indústria de Papel e Celulose", "Alto"),
    "09": ("Indústria de Borracha", "Pequeno"),
    "10": ("Indústria de Couros e Peles", "Alto"),
    "11": ("Indústria Têxtil, de Vestuário, Calçados e Artefatos de Tecidos", "Médio"),
    "12": ("Indústria de Produtos de Matéria Plástica", "Pequeno"),
    "13": ("Indústria do Fumo", "Médio"),
    "14": ("Indústrias Diversas", "Pequeno"),
    "15": ("Indústria Química", "Alto"),
    "16": ("Indústria de Produtos Alimentares e Bebidas", "Médio"),
    "17": ("Serviços de Utilidade", "Médio"),
    "18": ("Transporte, Terminais, Depósitos e Comércio", "Alto"),
    "19": ("Turismo", "Pequeno"),
    "20": ("Uso de Recursos Naturais", "Médio"),
}

FONTE_ANEXO = ("Lei nº 6.938/1981, Anexo VIII (incluído pela Lei nº 10.165/2000) — "
               "categoria {cat} ({nome}), Pp/gu {pp}")
FONTE_CONAMA = "Resolução CONAMA nº 237/1997, Anexo 1 (atividades sujeitas a licenciamento)"

# ---------------------------------------------------------------------------
# REGRAS DE CLASSIFICAÇÃO
# ---------------------------------------------------------------------------
# Cada regra é aplicada a todos os CNAEs oficiais que casem com `prefixos`
# (casamento por início de código) ou `codigos` (código exato de 7 dígitos).
#
# PRECEDÊNCIA: vence sempre a regra MAIS ESPECÍFICA, não a declarada por
# último. Um código exato (7 dígitos) prevalece sobre um prefixo de classe
# (4 dígitos), que prevalece sobre um prefixo de divisão (2 dígitos). Assim é
# possível declarar um padrão amplo para a divisão e refinar subclasses em
# qualquer ordem, sem que a ordem do arquivo produza efeitos silenciosos.
# Empate de especificidade: vence a regra declarada por último.
#
# Campos:
#   setor       — agrupamento comercial usado nos filtros da planilha
#   anexo       — categoria do Anexo VIII da Lei 6.938/81 (chave de ANEXO_VIII)
#   peso        — 0 a 10: intensidade da exposição ambiental potencial
#   justificativa — por que este grupo entrou e o que caracteriza a exposição
#   fontes      — referências normativas adicionais (além do Anexo VIII)
# ---------------------------------------------------------------------------

AGRO = "Agropecuária e atividades rurais"
FLOR = "Produção florestal e madeira"
ALIM = "Indústria de alimentos e bebidas"
MINE = "Mineração e beneficiamento mineral"
META = "Siderurgia e metalurgia"
QUIM = "Indústria química"
RESI = "Resíduos, efluentes e saneamento"
COUR = "Curtumes e couro"
CONS = "Construção, terraplenagem e parcelamento do solo"
COMB = "Combustíveis e produtos perigosos"
PAPE = "Papel e celulose"
ENER = "Energia e infraestrutura"
CERA = "Cerâmica, cimento e minerais não metálicos"
TEXT = "Têxtil — beneficiamento e tingimento"
COML = "Comércio e logística de produtos sensíveis"
FAUN = "Fauna, flora e áreas protegidas"

REGRAS: list[dict] = [

    # =======================================================================
    # 1. AGROPECUÁRIA E ATIVIDADES RURAIS  (§ 6.1)
    # =======================================================================
    dict(prefixos=["011", "012", "013", "014"], setor=AGRO, anexo="20", peso=6,
         justificativa=(
             "Lavouras temporárias e permanentes. Exposição típica: supressão de "
             "vegetação nativa e intervenção em Área de Preservação Permanente e "
             "Reserva Legal, uso e descarte de agrotóxicos e suas embalagens, "
             "captação e uso de água sem outorga, queima de resíduos vegetais."),
         fontes=["Lei nº 12.651/2012 (Código Florestal), arts. 4º a 24",
                 "Lei nº 9.605/1998, arts. 38, 39, 41, 50-A, 54 e 56",
                 "Lei nº 14.785/2023 (agrotóxicos)"]),

    dict(codigos=["0113000"], setor=AGRO, anexo="20", peso=7,
         justificativa=(
             "Cultivo de cana-de-açúcar. Além da exposição comum às lavouras, "
             "historicamente associado a queima de palha e a grande demanda "
             "hídrica, com regulação específica."),
         fontes=["Lei nº 12.651/2012", "Lei nº 9.605/1998, arts. 41 e 54"]),

    dict(prefixos=["0151", "0152", "0153"], setor=AGRO, anexo="20", peso=7,
         justificativa=(
             "Criação de bovinos e demais herbívoros de grande porte. Exposição "
             "típica: abertura de pastagem com supressão de vegetação nativa, "
             "ocupação e degradação de APP por acesso do rebanho a cursos d'água, "
             "manejo de dejetos e transporte/origem irregular de animais."),
         fontes=["Lei nº 12.651/2012, art. 4º", "Lei nº 9.605/1998, arts. 38, 48 e 54"]),

    dict(codigos=["0154700"], setor=AGRO, anexo="20", peso=8,
         justificativa=(
             "Suinocultura. Atividade de confinamento com geração concentrada de "
             "dejetos líquidos de altíssima carga orgânica; o lançamento sem "
             "tratamento adequado em solo ou corpo hídrico é a hipótese clássica "
             "de poluição do art. 54 da Lei de Crimes Ambientais. Sujeita a "
             "licenciamento ambiental."),
         fontes=["Lei nº 9.605/1998, art. 54", FONTE_CONAMA,
                 "Resolução CONAMA nº 430/2011 (condições de lançamento de efluentes)"]),

    dict(prefixos=["0155"], setor=AGRO, anexo="20", peso=7,
         justificativa=(
             "Avicultura. Confinamento com geração de cama de aviário, efluentes e "
             "mortalidade; exige destinação adequada e licenciamento."),
         fontes=["Lei nº 9.605/1998, art. 54", FONTE_CONAMA]),

    dict(prefixos=["0159"], setor=AGRO, anexo="20", peso=6,
         justificativa=(
             "Criação de outros animais. Enquadra-se no uso de recursos naturais; "
             "quando envolve fauna silvestre ou exótica, soma-se a exigência de "
             "autorização do órgão ambiental."),
         fontes=["Lei nº 9.605/1998, arts. 29 a 32"]),

    dict(codigos=["0161001"], setor=AGRO, anexo="20", peso=7,
         justificativa=(
             "Serviço de pulverização e controle de pragas agrícolas. Manuseio, "
             "aplicação e descarte de agrotóxicos por terceiros — exposição direta "
             "ao tipo do art. 56 (produto tóxico/perigoso em desacordo com a "
             "legislação) e ao art. 54 (poluição), inclusive por deriva."),
         fontes=["Lei nº 9.605/1998, arts. 54 e 56", "Lei nº 14.785/2023"]),

    dict(codigos=["0161003"], setor=AGRO, anexo="20", peso=7,
         justificativa=(
             "Serviço de preparação de terreno, cultivo e colheita. Executa a "
             "operação material de limpeza e preparo do solo, etapa em que ocorrem "
             "supressão de vegetação e intervenção em APP."),
         fontes=["Lei nº 9.605/1998, arts. 38, 39 e 50-A", "Lei nº 12.651/2012"]),

    dict(codigos=["0161002", "0161099", "0162801", "0162802", "0162803",
                  "0162899", "0163600"], setor=AGRO, anexo="20", peso=5,
         justificativa=(
             "Atividades de apoio à agricultura e à pecuária e pós-colheita. "
             "Exposição indireta, majoritariamente ligada a resíduos, efluentes de "
             "lavagem e armazenamento de insumos."),
         fontes=[FONTE_CONAMA]),

    dict(codigos=["0170900"], setor=FAUN, anexo="20", peso=9,
         justificativa=(
             "Caça e serviços relacionados. Atividade cujo objeto se sobrepõe "
             "diretamente aos tipos penais de proteção à fauna; qualquer "
             "irregularidade de autorização tem repercussão criminal imediata."),
         fontes=["Lei nº 9.605/1998, arts. 29 a 32",
                 "Lei nº 5.197/1967 (Proteção à Fauna)"]),

    dict(prefixos=["031", "032"], setor=FAUN, anexo="20", peso=7,
         justificativa=(
             "Pesca e aquicultura. Exploração de recursos aquáticos vivos, "
             "expressamente listada na categoria 20 do Anexo VIII; sujeita a "
             "defeso, cotas e autorização, com tipos penais próprios."),
         fontes=["Lei nº 9.605/1998, arts. 33 a 36",
                 "Lei nº 11.959/2009 (Política Nacional de Desenvolvimento da Pesca)"]),

    # =======================================================================
    # 2. PRODUÇÃO FLORESTAL E MADEIRA  (§ 6.3)
    # =======================================================================
    dict(prefixos=["0210"], setor=FLOR, anexo="20", peso=6,
         justificativa=(
             "Silvicultura (florestas plantadas). Expressamente listada na "
             "categoria 20 do Anexo VIII. Exposição ligada a corte, transporte e "
             "comprovação de origem do produto florestal."),
         fontes=["Lei nº 12.651/2012, arts. 35 e 36"]),

    dict(codigos=["0210107"], setor=FLOR, anexo="20", peso=7,
         justificativa=(
             "Extração de madeira em florestas plantadas. Exige controle de origem "
             "(DOF/GF) mesmo em floresta plantada, e é o ponto em que se confunde, "
             "na prática fiscalizatória, produto plantado e produto nativo."),
         fontes=["Lei nº 12.651/2012, art. 36",
                 "Lei nº 9.605/1998, art. 46"]),

    dict(codigos=["0210108"], setor=FLOR, anexo="20", peso=8,
         justificativa=(
             "Produção de carvão vegetal a partir de florestas plantadas. Cadeia "
             "sob controle estrito de origem em Minas Gerais em razão do consumo "
             "pelo parque siderúrgico; o carvão é o elo em que se materializa o "
             "art. 46 da Lei de Crimes Ambientais."),
         fontes=["Lei nº 9.605/1998, art. 46", "Lei nº 12.651/2012, arts. 35 e 36"]),

    dict(codigos=["0220901"], setor=FLOR, anexo="20", peso=10,
         justificativa=(
             "Extração de madeira em florestas NATIVAS. Máxima exposição do setor "
             "florestal: depende de plano de manejo aprovado e de autorização de "
             "supressão; a exploração fora desses limites configura, em tese, os "
             "tipos dos arts. 38, 39, 45 e 50-A da Lei nº 9.605/1998."),
         fontes=["Lei nº 9.605/1998, arts. 38, 39, 45, 46 e 50-A",
                 "Lei nº 12.651/2012, arts. 21, 26 e 31"]),

    dict(codigos=["0220902"], setor=FLOR, anexo="20", peso=10,
         justificativa=(
             "Produção de carvão vegetal a partir de florestas NATIVAS. Atividade "
             "no centro da fiscalização florestal mineira, por ligar diretamente "
             "supressão de vegetação nativa e consumo industrial (guseiras)."),
         fontes=["Lei nº 9.605/1998, arts. 38, 45 e 46", "Lei nº 12.651/2012"]),

    dict(codigos=["0220903", "0220904", "0220905", "0220999"], setor=FLOR,
         anexo="20", peso=7,
         justificativa=(
             "Coleta de produtos não-madeireiros em florestas nativas. Uso direto "
             "de recursos naturais em vegetação nativa, com exigência de "
             "autorização e comprovação de origem."),
         fontes=["Lei nº 12.651/2012", "Lei nº 9.605/1998, art. 44"]),

    dict(codigos=["0220906"], setor=FLOR, anexo="20", peso=4,
         justificativa=(
             "Conservação de florestas nativas. Atividade de baixa exposição "
             "própria, mantida na matriz por operar sobre vegetação nativa e, "
             "portanto, sujeita ao mesmo marco de autorização e fiscalização."),
         fontes=["Lei nº 12.651/2012"]),

    dict(codigos=["0230600"], setor=FLOR, anexo="20", peso=7,
         justificativa=(
             "Atividades de apoio à produção florestal. Executa materialmente o "
             "corte, o transporte e o carregamento do produto florestal — posição "
             "operacional relevante para a responsabilização."),
         fontes=["Lei nº 9.605/1998, arts. 46 e 50-A"]),

    dict(prefixos=["1610"], setor=FLOR, anexo="07", peso=8,
         justificativa=(
             "Serrarias e desdobramento de madeira. Primeiro elo industrial da "
             "cadeia: recebe a matéria-prima florestal e responde por exigir e "
             "conservar a documentação de origem, conduta descrita no art. 46 da "
             "Lei de Crimes Ambientais. Somam-se resíduos e tratamento químico da "
             "madeira (preservantes)."),
         fontes=["Lei nº 9.605/1998, art. 46", "Lei nº 12.651/2012, art. 35",
                 FONTE_CONAMA]),

    dict(codigos=["1621800"], setor=FLOR, anexo="07", peso=7,
         justificativa=(
             "Fabricação de madeira laminada, compensada, prensada e aglomerada. "
             "Consumo intensivo de madeira e uso de resinas e adesivos, com "
             "emissões e efluentes industriais."),
         fontes=["Lei nº 9.605/1998, arts. 46 e 54", FONTE_CONAMA]),

    dict(prefixos=["1622", "1623", "1629"], setor=FLOR, anexo="07", peso=6,
         justificativa=(
             "Artefatos e estruturas de madeira. Exposição sobretudo pela origem "
             "da matéria-prima florestal e por resíduos e acabamento (solventes, "
             "vernizes)."),
         fontes=["Lei nº 9.605/1998, art. 46"]),

    dict(codigos=["3101200"], setor=FLOR, anexo="07", peso=5,
         justificativa=(
             "Fabricação de móveis com predominância de madeira. Expressamente "
             "incluída na categoria 07 do Anexo VIII ('fabricação de estruturas de "
             "madeira e de móveis'); exposição pela origem da madeira e por "
             "acabamento com solventes."),
         fontes=["Lei nº 9.605/1998, art. 46"]),

    dict(codigos=["4671100"], setor=FLOR, anexo="18", peso=8,
         justificativa=(
             "Comércio atacadista de madeira e produtos derivados. Ainda que seja "
             "atividade comercial, o art. 46 da Lei nº 9.605/1998 tipifica "
             "expressamente as condutas de RECEBER e ADQUIRIR madeira sem exigir a "
             "licença do vendedor — razão pela qual o comércio atacadista de "
             "madeira tem exposição equivalente à do elo industrial."),
         fontes=["Lei nº 9.605/1998, art. 46", "Lei nº 12.651/2012, art. 35"]),

    dict(codigos=["4744002"], setor=FLOR, anexo="18", peso=6,
         justificativa=(
             "Comércio varejista de madeira e artefatos. Mesma lógica do art. 46 "
             "da Lei nº 9.605/1998, em escala menor."),
         fontes=["Lei nº 9.605/1998, art. 46"]),

    dict(codigos=["4613300"], setor=FLOR, anexo="18", peso=5,
         justificativa=(
             "Representantes comerciais de madeira e material de construção. "
             "Intermediação na cadeia florestal e mineral; exposição indireta, "
             "relevante para mapear a rede de fornecedores."),
         fontes=["Lei nº 9.605/1998, art. 46"]),

    # =======================================================================
    # 3. PAPEL E CELULOSE
    # =======================================================================
    dict(codigos=["1710900"], setor=PAPE, anexo="08", peso=9,
         justificativa=(
             "Fabricação de celulose e pastas. Categoria de Pp/gu ALTO no Anexo "
             "VIII; efluentes de alta carga, compostos organoclorados e emissões "
             "atmosféricas características."),
         fontes=["Lei nº 9.605/1998, art. 54", FONTE_CONAMA,
                 "Resolução CONAMA nº 430/2011"]),

    dict(prefixos=["172", "173", "174"], setor=PAPE, anexo="08", peso=6,
         justificativa=(
             "Fabricação de papel, papelão e artefatos. Integra a categoria 08 "
             "(Pp/gu Alto) do Anexo VIII; a exposição concentra-se em consumo "
             "hídrico, efluentes e resíduos, sendo menor que na produção de "
             "celulose virgem."),
         fontes=["Lei nº 9.605/1998, art. 54", FONTE_CONAMA]),

    # =======================================================================
    # 4. MINERAÇÃO E BENEFICIAMENTO MINERAL  (§ 6.4)
    # =======================================================================
    dict(prefixos=["05", "06", "07"], setor=MINE, anexo="01", peso=10,
         justificativa=(
             "Extração e beneficiamento de minerais energéticos e metálicos. "
             "Categoria 01 do Anexo VIII, Pp/gu ALTO. Em Minas Gerais é o setor de "
             "maior densidade fiscalizatória e litigiosidade ambiental. A "
             "atividade depende cumulativamente de título minerário e de "
             "licenciamento ambiental, e a extração sem uma dessas autorizações "
             "configura, em tese, o art. 55 da Lei nº 9.605/1998."),
         fontes=["Lei nº 9.605/1998, arts. 54, 55 e 60",
                 "Decreto-Lei nº 227/1967 (Código de Mineração)",
                 FONTE_CONAMA,
                 "Lei nº 14.066/2020 (segurança de barragens de mineração)"]),

    dict(prefixos=["0810"], setor=MINE, anexo="01", peso=10,
         justificativa=(
             "Extração de areia, argila, brita, cascalho, saibro, calcário, "
             "granito, ardósia e demais materiais para construção, com "
             "beneficiamento associado. É a faixa de mineração de pequeno e médio "
             "porte mais numerosa e mais frequentemente autuada — extração fora "
             "dos limites do título, sem licença ou em APP —, e por isso a de "
             "maior interesse para prospecção jurídica."),
         fontes=["Lei nº 9.605/1998, arts. 55, 54 e 60",
                 "Decreto-Lei nº 227/1967", FONTE_CONAMA,
                 "Lei nº 12.651/2012, art. 4º (APP)"]),

    dict(prefixos=["0891", "0892", "0893", "0899"], setor=MINE, anexo="01", peso=9,
         justificativa=(
             "Extração de outros minerais não metálicos (insumos para adubos, sal, "
             "gemas, grafita, quartzo, amianto e demais). Categoria 01, Pp/gu Alto; "
             "mesma dupla exigência de título minerário e licença ambiental."),
         fontes=["Lei nº 9.605/1998, art. 55", "Decreto-Lei nº 227/1967", FONTE_CONAMA]),

    dict(prefixos=["09"], setor=MINE, anexo="01", peso=8,
         justificativa=(
             "Atividades de apoio à extração de minerais. Prestadores que executam "
             "materialmente a lavra e o beneficiamento para terceiros, posição "
             "relevante na cadeia de responsabilização."),
         fontes=["Lei nº 9.605/1998, arts. 55 e 60"]),

    dict(codigos=["4689301"], setor=MINE, anexo="18", peso=7,
         justificativa=(
             "Comércio atacadista de produtos da extração mineral. Elo de "
             "circulação do produto mineral, sujeito à comprovação de origem "
             "regular."),
         fontes=["Lei nº 9.605/1998, art. 55", "Lei nº 12.844/2013"]),

    dict(codigos=["4649410"], setor=MINE, anexo="18", peso=6,
         justificativa=(
             "Comércio atacadista de joias e de pedras preciosas e semipreciosas "
             "lapidadas. Exposição ligada à comprovação da origem legal da gema, "
             "tema recorrente em investigações sobre garimpo."),
         fontes=["Lei nº 9.605/1998, art. 55", "Lei nº 12.844/2013"]),

    dict(codigos=["4662100"], setor=MINE, anexo="18", peso=5,
         justificativa=(
             "Comércio atacadista de máquinas e equipamentos para terraplenagem, "
             "mineração e construção. Exposição indireta; mantido na matriz por ser "
             "elo de suporte a atividades de alto impacto."),
         fontes=[FONTE_CONAMA]),

    # =======================================================================
    # 5. CERÂMICA, CIMENTO E MINERAIS NÃO METÁLICOS  (§ 6.9)
    # =======================================================================
    dict(prefixos=["23"], setor=CERA, anexo="02", peso=6,
         justificativa=(
             "Indústria de produtos minerais não metálicos. Categoria 02 do Anexo "
             "VIII (Pp/gu Médio): beneficiamento de minerais não metálicos não "
             "associado à extração e fabricação de material cerâmico, cimento, "
             "gesso, vidro e similares."),
         fontes=[FONTE_CONAMA, "Lei nº 9.605/1998, art. 54"]),

    dict(codigos=["2320600"], setor=CERA, anexo="02", peso=8,
         justificativa=(
             "Fabricação de cimento. Grande consumo energético e mineral, emissões "
             "atmosféricas expressivas e, com frequência, coprocessamento de "
             "resíduos — que agrega o regime dos resíduos perigosos."),
         fontes=["Lei nº 9.605/1998, arts. 54 e 56", FONTE_CONAMA,
                 "Resolução CONAMA nº 264/1999 (coprocessamento em fornos de clínquer)"]),

    dict(codigos=["2391501"], setor=CERA, anexo="02", peso=8,
         justificativa=(
             "Britamento de pedras não associado à extração. Emissão de material "
             "particulado, ruído e vibração, além da dependência de origem "
             "regular da rocha; frequentemente contíguo a frentes de lavra."),
         fontes=["Lei nº 9.605/1998, arts. 54 e 55", FONTE_CONAMA]),

    dict(codigos=["2391502", "2391503"], setor=CERA, anexo="02", peso=6,
         justificativa=(
             "Aparelhamento e beneficiamento de pedras. Geração de lama abrasiva e "
             "material particulado; exposição à comprovação de origem da rocha."),
         fontes=["Lei nº 9.605/1998, art. 54"]),

    dict(codigos=["2392300"], setor=CERA, anexo="02", peso=7,
         justificativa=(
             "Fabricação de cal e gesso. Fornos com emissões atmosféricas e, "
             "historicamente, consumo de lenha — o que conecta a atividade à cadeia "
             "florestal e à comprovação de origem do combustível."),
         fontes=["Lei nº 9.605/1998, arts. 46 e 54", FONTE_CONAMA]),

    dict(prefixos=["2342", "2349"], setor=CERA, anexo="02", peso=7,
         justificativa=(
             "Cerâmica vermelha e branca (olarias, telhas, blocos, pisos, louças). "
             "Setor pulverizado e numeroso em Minas Gerais, com dupla exposição: "
             "extração de argila (frequentemente em várzea/APP) e queima em fornos "
             "alimentados a lenha."),
         fontes=["Lei nº 9.605/1998, arts. 46, 54 e 55",
                 "Lei nº 12.651/2012, art. 4º", FONTE_CONAMA]),

    dict(codigos=["2330305"], setor=CERA, anexo="14", peso=5,
         justificativa=(
             "Preparação de massa de concreto e argamassa. As usinas de produção de "
             "concreto constam expressamente da categoria 14 do Anexo VIII (Pp/gu "
             "Pequeno); exposição por efluentes de lavagem e material particulado."),
         fontes=[FONTE_CONAMA]),

    # =======================================================================
    # 6. SIDERURGIA E METALURGIA  (§ 6.5)
    # =======================================================================
    dict(prefixos=["24"], setor=META, anexo="03", peso=9,
         justificativa=(
             "Indústria metalúrgica. Categoria 03 do Anexo VIII, Pp/gu ALTO. "
             "Emissões atmosféricas, efluentes com metais, escórias e resíduos "
             "classificados; atividade sujeita a licenciamento em qualquer porte."),
         fontes=["Lei nº 9.605/1998, arts. 54, 56 e 60", FONTE_CONAMA,
                 "Resolução CONAMA nº 430/2011"]),

    dict(codigos=["2411300"], setor=META, anexo="03", peso=10,
         justificativa=(
             "Produção de ferro-gusa. Em Minas Gerais, as guseiras a carvão vegetal "
             "acumulam a exposição metalúrgica (emissões, escória, efluentes) com a "
             "exposição florestal, por dependerem da comprovação de origem do "
             "carvão consumido — conduta descrita no art. 46 da Lei nº 9.605/1998."),
         fontes=["Lei nº 9.605/1998, arts. 46, 54 e 60", FONTE_CONAMA]),

    dict(codigos=["2412100"], setor=META, anexo="03", peso=9,
         justificativa=(
             "Produção de ferroligas. Fornos elétricos de redução com emissões "
             "expressivas de material particulado e geração de escórias."),
         fontes=["Lei nº 9.605/1998, art. 54", FONTE_CONAMA]),

    dict(codigos=["2451200", "2452100"], setor=META, anexo="03", peso=9,
         justificativa=(
             "Fundição de ferro, aço e metais não-ferrosos. Expressamente citada na "
             "categoria 03 do Anexo VIII; areias de fundição e escórias são "
             "resíduos com classificação e destinação controladas."),
         fontes=["Lei nº 9.605/1998, arts. 54 e 56", "NBR 10.004 (classificação de resíduos)",
                 FONTE_CONAMA]),

    dict(codigos=["2539002"], setor=META, anexo="03", peso=10,
         justificativa=(
             "Serviços de tratamento e revestimento em metais (galvanoplastia). A "
             "galvanoplastia é citada NOMINALMENTE e por três vezes na categoria 03 "
             "do Anexo VIII. Gera efluentes com metais pesados e cianetos e "
             "borras classificadas como resíduo perigoso — combinação que a torna "
             "uma das atividades de maior exposição criminal-ambiental entre as "
             "empresas de pequeno e médio porte."),
         fontes=["Lei nº 9.605/1998, arts. 54, § 2º, e 56", "NBR 10.004",
                 FONTE_CONAMA, "Resolução CONAMA nº 430/2011"]),

    dict(codigos=["2449103"], setor=META, anexo="03", peso=8,
         justificativa=(
             "Fabricação de ânodos para galvanoplastia. Insumo direto da cadeia de "
             "tratamento superficial, citada na categoria 03 do Anexo VIII."),
         fontes=["Lei nº 9.605/1998, art. 54"]),

    dict(codigos=["2539000"], setor=META, anexo="03", peso=8,
         justificativa=(
             "Serviços de usinagem, solda, TRATAMENTO E REVESTIMENTO em metais "
             "(código de classe). Por abranger o tratamento superficial, empresas "
             "registradas neste código podem exercer galvanoplastia sem que isso "
             "apareça em subclasse específica — o que exige verificação individual "
             "e justifica peso elevado."),
         fontes=["Lei nº 9.605/1998, arts. 54 e 56", "NBR 10.004",
                 "Resolução CONAMA nº 362/2005 (óleo lubrificante usado)"]),

    dict(codigos=["2539001"], setor=META, anexo="03", peso=6,
         justificativa=(
             "Serviços de usinagem, tornearia e solda. Exposição por fluidos de "
             "corte, óleos usados e resíduos metálicos; menor que a da "
             "galvanoplastia, mas dentro da categoria 03."),
         fontes=["Resolução CONAMA nº 362/2005 (óleo lubrificante usado)"]),

    dict(prefixos=["25"], setor=META, anexo="03", peso=6,
         justificativa=(
             "Fabricação de produtos de metal. A categoria 03 do Anexo VIII abrange "
             "expressamente a fabricação de estruturas e artefatos de ferro, aço e "
             "metais não-ferrosos 'com ou sem tratamento de superfície'. Exposição "
             "por resíduos metálicos, óleos e eventual tratamento superficial."),
         fontes=["Lei nº 9.605/1998, art. 54",
                 "Resolução CONAMA nº 362/2005"]),

    dict(codigos=["4685100"], setor=META, anexo="18", peso=5,
         justificativa=(
             "Comércio atacadista de produtos siderúrgicos e metalúrgicos. Elo de "
             "circulação; exposição indireta, útil para mapear a cadeia."),
         fontes=[]),

    # =======================================================================
    # 7. INDÚSTRIA QUÍMICA  (§ 6.6)
    # =======================================================================
    dict(prefixos=["20"], setor=QUIM, anexo="15", peso=9,
         justificativa=(
             "Indústria química. Categoria 15 do Anexo VIII, Pp/gu ALTO. Produção e "
             "manipulação de substâncias perigosas, com exposição simultânea a "
             "poluição (art. 54), a produtos perigosos em desacordo com a "
             "legislação (art. 56) e a resíduos classificados."),
         fontes=["Lei nº 9.605/1998, arts. 54 e 56", FONTE_CONAMA,
                 "NBR 10.004"]),

    dict(codigos=["2051700"], setor=QUIM, anexo="15", peso=10,
         justificativa=(
             "Fabricação de defensivos agrícolas. Produto de alta toxicidade sob "
             "regime específico de registro, produção, embalagem e destinação; "
             "exposição direta ao art. 56 da Lei de Crimes Ambientais."),
         fontes=["Lei nº 9.605/1998, art. 56", "Lei nº 14.785/2023",
                 FONTE_CONAMA]),

    dict(codigos=["2092401", "2092402", "2092403"], setor=QUIM, anexo="15", peso=10,
         justificativa=(
             "Fabricação de pólvoras, explosivos, detonantes e artigos "
             "pirotécnicos. Citada expressamente na categoria 15 do Anexo VIII; "
             "acumula controle ambiental e controle de produtos controlados."),
         fontes=["Lei nº 9.605/1998, art. 56", FONTE_CONAMA]),

    dict(codigos=["2013400", "2013401", "2013402", "2012600"], setor=QUIM,
         anexo="15", peso=9,
         justificativa=(
             "Fabricação de adubos, fertilizantes e seus intermediários. Citada "
             "expressamente na categoria 15; risco de contaminação de solo e água "
             "por nitrogenados e por metais presentes em matérias-primas."),
         fontes=["Lei nº 9.605/1998, arts. 54 e 56", FONTE_CONAMA]),

    dict(codigos=["2071100", "2072000", "2073800"], setor=QUIM, anexo="15", peso=9,
         justificativa=(
             "Fabricação de tintas, vernizes, esmaltes, lacas, impermeabilizantes e "
             "solventes. Citada expressamente na categoria 15; emissão de compostos "
             "orgânicos voláteis e geração de resíduos perigosos (borras, solventes "
             "contaminados)."),
         fontes=["Lei nº 9.605/1998, arts. 54 e 56", "NBR 10.004", FONTE_CONAMA]),

    dict(codigos=["2052500", "2061400", "2062200"], setor=QUIM, anexo="15", peso=8,
         justificativa=(
             "Fabricação de desinfestantes domissanitários, sabões, detergentes e "
             "produtos de limpeza. Citada expressamente na categoria 15; efluentes "
             "e manipulação de princípios ativos regulados."),
         fontes=["Lei nº 9.605/1998, arts. 54 e 56", FONTE_CONAMA]),

    dict(prefixos=["19"], setor=COMB, anexo="15", peso=9,
         justificativa=(
             "Coquerias, refino de petróleo, formulação de combustíveis e "
             "biocombustíveis. Categoria 15 do Anexo VIII (fabricação de produtos "
             "derivados do processamento de petróleo e de combustíveis não "
             "derivados de petróleo), Pp/gu Alto."),
         fontes=["Lei nº 9.605/1998, arts. 54 e 56", FONTE_CONAMA]),

    dict(codigos=["1922502"], setor=RESI, anexo="15", peso=10,
         justificativa=(
             "Rerrefino de óleos lubrificantes. Opera sobre óleo lubrificante "
             "usado ou contaminado — resíduo perigoso com regime próprio de coleta "
             "e destinação obrigatória; a atividade é lícita e necessária, mas "
             "qualquer desvio na cadeia recai nos arts. 54, § 2º, e 56."),
         fontes=["Resolução CONAMA nº 362/2005", "Lei nº 9.605/1998, arts. 54 e 56",
                 "Lei nº 12.305/2010 (Política Nacional de Resíduos Sólidos)"]),

    dict(codigos=["1931400", "1932200"], setor=QUIM, anexo="15", peso=8,
         justificativa=(
             "Fabricação de álcool e de biocombustíveis. Produção de álcool "
             "etílico consta expressamente da categoria 15; a vinhaça e demais "
             "efluentes têm alta carga orgânica e disposição regulada."),
         fontes=["Lei nº 9.605/1998, art. 54", FONTE_CONAMA]),

    dict(prefixos=["21"], setor=QUIM, anexo="15", peso=7,
         justificativa=(
             "Fabricação de produtos farmoquímicos, medicamentos e produtos "
             "veterinários. Citada expressamente na categoria 15 do Anexo VIII; "
             "exposição por efluentes, resíduos de princípios ativos e descarte de "
             "produtos vencidos."),
         fontes=["Lei nº 9.605/1998, arts. 54 e 56",
                 "Resolução CONAMA nº 358/2005 (resíduos de serviços de saúde)"]),

    dict(codigos=["2211100", "2212900"], setor=RESI, anexo="09", peso=7,
         justificativa=(
             "Fabricação e reforma de pneumáticos. Embora a categoria 09 do Anexo "
             "VIII tenha Pp/gu Pequeno, o pneu inservível está sujeito a logística "
             "reversa obrigatória e a destinação controlada, o que desloca a "
             "exposição para o regime de resíduos."),
         fontes=["Resolução CONAMA nº 416/2009", "Lei nº 12.305/2010",
                 "Lei nº 9.605/1998, art. 56"]),

    # =======================================================================
    # 8. CURTUMES E COURO  (§ 6.8)
    # =======================================================================
    dict(codigos=["1510600"], setor=COUR, anexo="10", peso=10,
         justificativa=(
             "Curtimento e outras preparações de couro. Categoria 10 do Anexo VIII, "
             "Pp/gu ALTO. Efluentes com cromo, sulfetos e alta carga orgânica, além "
             "de resíduos sólidos classificados como perigosos — o curtume é o caso "
             "paradigmático de poluição hídrica industrial do art. 54."),
         fontes=["Lei nº 9.605/1998, art. 54, § 2º", "NBR 10.004",
                 "Resolução CONAMA nº 430/2011", FONTE_CONAMA]),

    dict(codigos=["4623102"], setor=COUR, anexo="10", peso=6,
         justificativa=(
             "Comércio atacadista de couros, lãs, peles e outros subprodutos não "
             "comestíveis de origem animal. Elo de circulação da cadeia; a "
             "categoria 10 do Anexo VIII abrange a secagem e a salga de couros e "
             "peles, etapas frequentemente executadas nesse elo."),
         fontes=["Lei nº 9.605/1998, art. 54"]),

    dict(prefixos=["152", "153", "154"], setor=COUR, anexo="11", peso=4,
         justificativa=(
             "Fabricação de artefatos de couro e de calçados. Categoria 11 do Anexo "
             "VIII (Pp/gu Médio); exposição menor, ligada a colas, solventes e "
             "acabamento, e não ao curtimento."),
         fontes=[FONTE_CONAMA]),

    # =======================================================================
    # 9. INDÚSTRIA DE ALIMENTOS E BEBIDAS  (§ 6.2)
    # =======================================================================
    dict(prefixos=["10"], setor=ALIM, anexo="16", peso=5,
         justificativa=(
             "Indústria de produtos alimentares. Categoria 16 do Anexo VIII (Pp/gu "
             "Médio); exposição por efluentes orgânicos, resíduos e emissões de "
             "caldeiras."),
         fontes=["Lei nº 9.605/1998, art. 54", FONTE_CONAMA]),

    dict(prefixos=["1011", "1012"], setor=ALIM, anexo="16", peso=8,
         justificativa=(
             "Frigoríficos, matadouros e abatedouros. Citados nominalmente na "
             "categoria 16 do Anexo VIII. Efluentes de altíssima carga orgânica, "
             "sangue, resíduos de abate e graxaria: é a atividade alimentar com "
             "maior histórico de autuação por lançamento irregular em curso "
             "d'água, hipótese do art. 54."),
         fontes=["Lei nº 9.605/1998, art. 54, § 2º",
                 "Resolução CONAMA nº 430/2011", FONTE_CONAMA]),

    dict(codigos=["1013901", "1013902"], setor=ALIM, anexo="16", peso=7,
         justificativa=(
             "Fabricação de produtos de carne e preparação de subprodutos do abate "
             "(graxarias). Citadas na categoria 16 ('derivados de origem animal'); "
             "efluentes gordurosos e emissões odoríferas características."),
         fontes=["Lei nº 9.605/1998, art. 54", FONTE_CONAMA]),

    dict(prefixos=["1020"], setor=ALIM, anexo="16", peso=7,
         justificativa=(
             "Preparação e conservas de pescado. Citada nominalmente na categoria "
             "16; efluentes orgânicos e exposição adicional quanto à origem do "
             "pescado (defeso e espécies protegidas)."),
         fontes=["Lei nº 9.605/1998, arts. 34 e 54"]),

    dict(codigos=["1051100", "1052000"], setor=ALIM, anexo="16", peso=7,
         justificativa=(
             "Preparação do leite e fabricação de laticínios. Citada nominalmente "
             "na categoria 16 do Anexo VIII. O soro do leite tem carga orgânica "
             "muito elevada e seu lançamento irregular é passivo recorrente no "
             "parque leiteiro mineiro — setor numeroso e majoritariamente de "
             "pequeno e médio porte."),
         fontes=["Lei nº 9.605/1998, art. 54, § 2º",
                 "Resolução CONAMA nº 430/2011", FONTE_CONAMA]),

    dict(codigos=["1071600", "1072401", "1072402"], setor=ALIM, anexo="16", peso=7,
         justificativa=(
             "Fabricação e refino de açúcar. Citada nominalmente na categoria 16; "
             "vinhaça, torta de filtro e água de lavagem com alta carga orgânica."),
         fontes=["Lei nº 9.605/1998, art. 54", FONTE_CONAMA]),

    dict(codigos=["1081301", "1081302"], setor=ALIM, anexo="16", peso=6,
         justificativa=(
             "Beneficiamento, torrefação e moagem de café. Citada nominalmente na "
             "categoria 16 ('beneficiamento, moagem, torrefação'). A água "
             "residuária do café e a palha são passivos característicos das regiões "
             "cafeeiras de Minas Gerais."),
         fontes=["Lei nº 9.605/1998, art. 54", FONTE_CONAMA]),

    dict(codigos=["1041400", "1042200", "1043100", "1065102", "1065103"],
         setor=ALIM, anexo="16", peso=6,
         justificativa=(
             "Fabricação e refino de óleos e gorduras. Citada nominalmente na "
             "categoria 16; efluentes gordurosos e uso de solventes na extração."),
         fontes=["Lei nº 9.605/1998, art. 54", FONTE_CONAMA]),

    dict(codigos=["1066000"], setor=ALIM, anexo="16", peso=6,
         justificativa=(
             "Fabricação de alimentos para animais. Citada nominalmente na "
             "categoria 16 ('rações balanceadas'); emissões, resíduos e, quando usa "
             "subprodutos de abate, exposição da cadeia animal."),
         fontes=["Lei nº 9.605/1998, art. 54", FONTE_CONAMA]),

    dict(prefixos=["11"], setor=ALIM, anexo="16", peso=6,
         justificativa=(
             "Fabricação de bebidas. Citada nominalmente na categoria 16 do Anexo "
             "VIII (cervejas, chopes, maltes, vinhos, vinagre, bebidas "
             "não-alcoólicas e engarrafamento de águas minerais). Exposição por "
             "efluentes, captação hídrica e outorga."),
         fontes=["Lei nº 9.605/1998, art. 54", FONTE_CONAMA,
                 "Lei nº 9.433/1997 (outorga de uso de recursos hídricos)"]),

    dict(codigos=["1111901", "1111902"], setor=ALIM, anexo="16", peso=7,
         justificativa=(
             "Fabricação de aguardente de cana e de outras bebidas destiladas. O "
             "vinhoto gerado na destilação tem carga orgânica muito elevada; "
             "alambiques são numerosos e de pequeno porte em Minas Gerais."),
         fontes=["Lei nº 9.605/1998, art. 54", FONTE_CONAMA]),

    dict(codigos=["1121600"], setor=ALIM, anexo="16", peso=7,
         justificativa=(
             "Fabricação de águas envasadas. Depende de outorga de uso de recurso "
             "hídrico e de autorização mineral para água mineral, acumulando o "
             "regime hídrico e o minerário."),
         fontes=["Lei nº 9.433/1997", "Decreto-Lei nº 7.841/1945 (Código de Águas Minerais)",
                 "Lei nº 9.605/1998, art. 55"]),

    dict(prefixos=["12"], setor=ALIM, anexo="13", peso=6,
         justificativa=(
             "Indústria do fumo. Categoria 13 do Anexo VIII (Pp/gu Médio): "
             "beneficiamento do fumo e fabricação de produtos derivados."),
         fontes=[FONTE_CONAMA]),

    # =======================================================================
    # 10. RESÍDUOS, EFLUENTES E SANEAMENTO  (§ 6.7)
    # =======================================================================
    dict(codigos=["3811400"], setor=RESI, anexo="17", peso=8,
         justificativa=(
             "Coleta de resíduos não perigosos. Elo inicial do gerenciamento de "
             "resíduos sólidos; responde pela destinação a local licenciado e pela "
             "rastreabilidade da carga."),
         fontes=["Lei nº 12.305/2010", "Lei nº 9.605/1998, art. 54, § 2º, V"]),

    dict(codigos=["3812200"], setor=RESI, anexo="17", peso=10,
         justificativa=(
             "Coleta de resíduos PERIGOSOS. Manuseio e transporte de resíduos "
             "classificados, sob exigência de licença específica, manifesto de "
             "transporte e destinação certificada. Exposição direta aos arts. 54, "
             "§ 2º, V, e 56 da Lei de Crimes Ambientais."),
         fontes=["Lei nº 12.305/2010", "Lei nº 9.605/1998, arts. 54, § 2º, V, e 56",
                 "NBR 10.004", FONTE_CONAMA]),

    dict(codigos=["3821100"], setor=RESI, anexo="17", peso=9,
         justificativa=(
             "Tratamento e disposição de resíduos não perigosos (aterros e usinas "
             "de triagem). Citada expressamente na categoria 17 do Anexo VIII; a "
             "operação de área de disposição sem licença ou em desacordo com ela é "
             "hipótese nuclear do art. 54, § 2º, V."),
         fontes=["Lei nº 12.305/2010", "Lei nº 9.605/1998, arts. 54, § 2º, V, e 60",
                 FONTE_CONAMA]),

    dict(codigos=["3822000"], setor=RESI, anexo="17", peso=10,
         justificativa=(
             "Tratamento e disposição de resíduos PERIGOSOS. Máxima exposição do "
             "setor: a categoria 17 do Anexo VIII cita expressamente o tratamento e "
             "a destinação de resíduos industriais e especiais, inclusive de "
             "agroquímicos e de serviços de saúde."),
         fontes=["Lei nº 12.305/2010", "Lei nº 9.605/1998, arts. 54, § 2º, V, e 56",
                 "NBR 10.004", FONTE_CONAMA]),

    dict(prefixos=["383"], setor=RESI, anexo="17", peso=7,
         justificativa=(
             "Recuperação de materiais (reciclagem de metais, plásticos, papel e "
             "compostagem). Atividade ambientalmente desejável, mas que opera sobre "
             "resíduos e depende de licenciamento, controle de origem da sucata e "
             "destinação dos rejeitos do próprio processo."),
         fontes=["Lei nº 12.305/2010", "Lei nº 9.605/1998, art. 54", FONTE_CONAMA]),

    dict(codigos=["3900500"], setor=RESI, anexo="17", peso=9,
         justificativa=(
             "Descontaminação e outros serviços de gestão de resíduos. Citada "
             "expressamente na categoria 17 do Anexo VIII ('recuperação de áreas "
             "contaminadas ou degradadas'); atua justamente sobre passivos "
             "ambientais já instalados."),
         fontes=["Lei nº 12.305/2010", "Lei nº 9.605/1998, art. 54",
                 "Resolução CONAMA nº 420/2009 (áreas contaminadas)"]),

    dict(codigos=["3701100", "3702900"], setor=RESI, anexo="17", peso=8,
         justificativa=(
             "Gestão de redes de esgoto e atividades relacionadas. Citada "
             "expressamente na categoria 17 ('destinação de resíduos de esgotos "
             "sanitários', inclusive de fossas); o lançamento de esgoto sem "
             "tratamento é hipótese direta do art. 54."),
         fontes=["Lei nº 9.605/1998, art. 54", "Resolução CONAMA nº 430/2011",
                 "Lei nº 11.445/2007 (saneamento básico)"]),

    dict(prefixos=["36"], setor=RESI, anexo="17", peso=6,
         justificativa=(
             "Captação, tratamento e distribuição de água. Exposição por outorga de "
             "uso de recurso hídrico, proteção de mananciais e destinação de lodo "
             "de estação de tratamento."),
         fontes=["Lei nº 9.433/1997", "Lei nº 9.605/1998, art. 54"]),

    dict(codigos=["4687701", "4687702", "4687703"], setor=RESI, anexo="18", peso=7,
         justificativa=(
             "Comércio atacadista de resíduos e sucatas. Elo de circulação de "
             "resíduos; exposição concentrada na comprovação de origem regular e no "
             "licenciamento do pátio de armazenamento."),
         fontes=["Lei nº 12.305/2010", "Lei nº 9.605/1998, art. 54", FONTE_CONAMA]),

    dict(prefixos=["861"], setor=RESI, anexo="17", peso=6,
         justificativa=(
             "Atendimento hospitalar. Gerador de resíduos de serviços de saúde, "
             "citados expressamente na categoria 17 do Anexo VIII, com regime "
             "próprio de segregação, acondicionamento e destinação."),
         fontes=["Resolução CONAMA nº 358/2005", "Lei nº 12.305/2010",
                 "Lei nº 9.605/1998, art. 56"]),

    dict(codigos=["7500100"], setor=RESI, anexo="17", peso=4,
         justificativa=(
             "Atividades veterinárias. Geradoras de resíduos de serviços de saúde "
             "em menor escala; incluídas para completude da cadeia."),
         fontes=["Resolução CONAMA nº 358/2005"]),

    dict(codigos=["8122200"], setor=QUIM, anexo="15", peso=7,
         justificativa=(
             "Imunização e controle de pragas urbanas. Aplicação profissional de "
             "produtos domissanitários e biocidas, com exposição aos arts. 54 e 56 "
             "e a regime sanitário específico."),
         fontes=["Lei nº 9.605/1998, arts. 54 e 56"]),

    dict(codigos=["9601701", "9601702"], setor=TEXT, anexo="11", peso=6,
         justificativa=(
             "Lavanderias e tinturarias. Efluentes com tensoativos e corantes e, na "
             "lavagem a seco, uso de percloroetileno — solvente clorado cujo "
             "descarte irregular contamina solo e água subterrânea."),
         fontes=["Lei nº 9.605/1998, arts. 54 e 56",
                 "Resolução CONAMA nº 430/2011"]),

    # =======================================================================
    # 11. TÊXTIL — BENEFICIAMENTO E TINGIMENTO
    # =======================================================================
    dict(prefixos=["131", "132", "133", "135"], setor=TEXT, anexo="11", peso=5,
         justificativa=(
             "Fiação, tecelagem e fabricação de artefatos têxteis. Categoria 11 do "
             "Anexo VIII (Pp/gu Médio); exposição principal por consumo hídrico e "
             "efluentes."),
         fontes=[FONTE_CONAMA]),

    dict(codigos=["1340501", "1340502", "1340599"], setor=TEXT, anexo="11", peso=8,
         justificativa=(
             "Estamparia, alvejamento, tingimento e acabamento têxtil. Citada "
             "nominalmente na categoria 11 do Anexo VIII. É a etapa que concentra a "
             "carga poluidora do setor: efluentes coloridos, com metais e "
             "recalcitrantes, de tratamento complexo."),
         fontes=["Lei nº 9.605/1998, art. 54, § 2º",
                 "Resolução CONAMA nº 430/2011", FONTE_CONAMA]),

    # =======================================================================
    # 12. COMBUSTÍVEIS E PRODUTOS PERIGOSOS  (categoria 18 — Pp/gu Alto)
    # =======================================================================
    dict(codigos=["4731800"], setor=COMB, anexo="18", peso=9,
         justificativa=(
             "Comércio varejista de combustíveis para veículos automotores (postos "
             "revendedores). A categoria 18 do Anexo VIII cita expressamente o "
             "'comércio de combustíveis, derivados de petróleo'. Os tanques "
             "subterrâneos são fonte reconhecida de contaminação de solo e água "
             "subterrânea, com licenciamento ambiental obrigatório em resolução "
             "própria do CONAMA — e são estabelecimentos tipicamente de pequeno e "
             "médio porte."),
         fontes=["Resolução CONAMA nº 273/2000 (postos de combustíveis)",
                 "Resolução CONAMA nº 420/2009", "Lei nº 9.605/1998, arts. 54 e 60"]),

    dict(prefixos=["4681"], setor=COMB, anexo="18", peso=8,
         justificativa=(
             "Comércio atacadista de combustíveis, derivados de petróleo e "
             "lubrificantes. Citado expressamente na categoria 18; armazenamento em "
             "grande volume e transporte de produto perigoso."),
         fontes=["Lei nº 9.605/1998, arts. 54 e 56", "Resolução CONAMA nº 273/2000"]),

    dict(codigos=["4682600", "4784900"], setor=COMB, anexo="18", peso=7,
         justificativa=(
             "Comércio atacadista e varejista de GLP. Depósito de produto "
             "perigoso, hipótese expressa da categoria 18 do Anexo VIII."),
         fontes=["Lei nº 9.605/1998, art. 56"]),

    dict(codigos=["4732600"], setor=COMB, anexo="18", peso=6,
         justificativa=(
             "Comércio varejista de lubrificantes. Recebe e acumula óleo "
             "lubrificante usado, resíduo perigoso com destinação obrigatória a "
             "rerrefino."),
         fontes=["Resolução CONAMA nº 362/2005", "Lei nº 9.605/1998, art. 56"]),

    dict(codigos=["4683400"], setor=COMB, anexo="18", peso=8,
         justificativa=(
             "Comércio atacadista de defensivos agrícolas, adubos, fertilizantes e "
             "corretivos do solo. Depósito e revenda de produtos perigosos, com "
             "obrigação de logística reversa das embalagens vazias."),
         fontes=["Lei nº 14.785/2023", "Lei nº 12.305/2010",
                 "Lei nº 9.605/1998, art. 56"]),

    dict(codigos=["4684299", "4612500"], setor=COMB, anexo="18", peso=7,
         justificativa=(
             "Comércio atacadista e representação de produtos químicos e "
             "petroquímicos. Depósito de produtos químicos, hipótese expressa da "
             "categoria 18 do Anexo VIII."),
         fontes=["Lei nº 9.605/1998, art. 56"]),

    dict(codigos=["4930203"], setor=COMB, anexo="18", peso=9,
         justificativa=(
             "Transporte rodoviário de produtos perigosos. Primeira hipótese "
             "expressa da categoria 18 do Anexo VIII ('transporte de cargas "
             "perigosas'); regime específico de habilitação, sinalização e "
             "resposta a emergências, com exposição aos arts. 54 e 56."),
         fontes=["Lei nº 9.605/1998, arts. 54 e 56",
                 "Resolução ANTT nº 5.998/2022 (transporte terrestre de produtos perigosos)"]),

    dict(codigos=["4940000"], setor=COMB, anexo="18", peso=7,
         justificativa=(
             "Transporte dutoviário. Citado expressamente na categoria 18 do Anexo "
             "VIII ('transporte por dutos')."),
         fontes=["Lei nº 9.605/1998, art. 54", FONTE_CONAMA]),

    dict(codigos=["5211701", "5211799"], setor=COML, anexo="18", peso=5,
         justificativa=(
             "Armazéns gerais e depósitos de mercadorias para terceiros. A "
             "categoria 18 do Anexo VIII abrange depósitos de produtos químicos e "
             "perigosos; como o CNAE é genérico quanto à natureza da carga, o peso "
             "é moderado e a confirmação depende de verificação individual."),
         fontes=["Lei nº 9.605/1998, art. 56"]),

    dict(codigos=["4520001", "4520002", "4520005"], setor=RESI, anexo="18", peso=5,
         justificativa=(
             "Oficinas mecânicas, funilaria e pintura, e lavagem de veículos. "
             "Geram óleo lubrificante usado (resíduo perigoso com destinação "
             "obrigatória), efluentes oleosos e resíduos de tinta e solvente."),
         fontes=["Resolução CONAMA nº 362/2005", "Lei nº 9.605/1998, arts. 54 e 56"]),

    # =======================================================================
    # 13. CONSTRUÇÃO, TERRAPLENAGEM E PARCELAMENTO DO SOLO  (§ 6.9)
    # =======================================================================
    dict(codigos=["4313400"], setor=CONS, anexo="14", peso=8,
         justificativa=(
             "Obras de terraplenagem. Movimentação de solo em grande volume, "
             "supressão de cobertura vegetal, alteração de drenagem e assoreamento "
             "de cursos d'água; é a operação em que se materializa a intervenção "
             "física em APP."),
         fontes=["Lei nº 12.651/2012, art. 4º",
                 "Lei nº 9.605/1998, arts. 38, 39, 50-A e 54", FONTE_CONAMA]),

    dict(codigos=["4311802", "4319300"], setor=CONS, anexo="14", peso=7,
         justificativa=(
             "Preparação de canteiro, limpeza e preparação de terreno. Executa a "
             "supressão de vegetação e a remoção de solo que antecedem a obra."),
         fontes=["Lei nº 12.651/2012", "Lei nº 9.605/1998, arts. 38, 39 e 50-A"]),

    dict(codigos=["4311801"], setor=CONS, anexo="14", peso=6,
         justificativa=(
             "Demolição de edifícios e outras estruturas. Geração de resíduos da "
             "construção civil em volume, com destinação regulada, e exposição a "
             "amianto em edificações antigas."),
         fontes=["Resolução CONAMA nº 307/2002 (resíduos da construção civil)",
                 "Lei nº 12.305/2010", "Lei nº 9.605/1998, art. 56"]),

    dict(codigos=["4312600", "4399105"], setor=CONS, anexo="14", peso=7,
         justificativa=(
             "Perfurações, sondagens e construção de poços de água. Captação "
             "subterrânea depende de outorga; a perfuração irregular é vetor de "
             "contaminação de aquífero."),
         fontes=["Lei nº 9.433/1997", "Lei nº 9.605/1998, art. 54",
                 "Resolução CONAMA nº 396/2008 (águas subterrâneas)"]),

    dict(codigos=["6810203"], setor=CONS, anexo="14", peso=8,
         justificativa=(
             "Loteamento de imóveis próprios. O parcelamento do solo altera o uso e "
             "a cobertura vegetal de áreas extensas, é vedado em APP e em terreno "
             "sem condições sanitárias, e possui tipo penal próprio na Lei de "
             "Parcelamento do Solo Urbano além da exposição ambiental."),
         fontes=["Lei nº 6.766/1979, arts. 3º, parágrafo único, e 50",
                 "Lei nº 12.651/2012, art. 4º",
                 "Lei nº 9.605/1998, arts. 38, 40 e 64"]),

    dict(codigos=["4110700"], setor=CONS, anexo="14", peso=6,
         justificativa=(
             "Incorporação de empreendimentos imobiliários. Responsável pela "
             "concepção do empreendimento e, portanto, pela obtenção do "
             "licenciamento e pelo cumprimento das restrições de uso do solo."),
         fontes=["Lei nº 6.766/1979", "Lei nº 12.651/2012",
                 "Lei nº 9.605/1998, art. 60"]),

    dict(codigos=["4221901"], setor=CONS, anexo="14", peso=9,
         justificativa=(
             "Construção de barragens e represas para geração de energia elétrica. "
             "Intervenção de grande porte em corpo hídrico, com supressão de "
             "vegetação, deslocamento de fauna e regime específico de segurança de "
             "barragens."),
         fontes=["Lei nº 12.334/2010 e Lei nº 14.066/2020 (segurança de barragens)",
                 "Lei nº 9.605/1998, arts. 38, 40 e 54", FONTE_CONAMA]),

    dict(codigos=["4291000"], setor=CONS, anexo="14", peso=8,
         justificativa=(
             "Obras portuárias, marítimas e fluviais. Intervenção direta em corpo "
             "d'água, com dragagem e derrocamento — hipóteses expressas da "
             "categoria 17 do Anexo VIII."),
         fontes=["Lei nº 9.605/1998, arts. 54 e 60", FONTE_CONAMA]),

    dict(codigos=["4211101", "4213800", "4222702"], setor=CONS, anexo="14", peso=7,
         justificativa=(
             "Construção de rodovias e ferrovias, obras de urbanização e obras de "
             "irrigação. Obras lineares e de infraestrutura com supressão de "
             "vegetação, travessia de cursos d'água e exploração de áreas de "
             "empréstimo (jazidas) — que agregam o regime minerário."),
         fontes=["Lei nº 12.651/2012", "Lei nº 9.605/1998, arts. 38, 50-A e 55",
                 FONTE_CONAMA]),

    dict(codigos=["4222701", "4223500"], setor=CONS, anexo="14", peso=6,
         justificativa=(
             "Construção de redes de água, esgoto e dutos. Obras lineares com "
             "intervenção em faixa de domínio e travessia de corpos hídricos."),
         fontes=["Lei nº 12.651/2012", "Lei nº 9.605/1998, art. 54"]),

    dict(codigos=["4120400"], setor=CONS, anexo="14", peso=4,
         justificativa=(
             "Construção de edifícios. Exposição menor e majoritariamente ligada a "
             "resíduos da construção civil e a licenças urbanísticas; mantida na "
             "matriz em prioridade baixa por ser o elo final de empreendimentos que "
             "podem envolver supressão vegetal."),
         fontes=["Resolução CONAMA nº 307/2002"]),

    # =======================================================================
    # 14. ENERGIA E INFRAESTRUTURA
    # =======================================================================
    dict(codigos=["3511500", "3511501"], setor=ENER, anexo="17", peso=8,
         justificativa=(
             "Geração de energia elétrica. A categoria 17 do Anexo VIII cita "
             "expressamente a produção de energia termoelétrica; pequenas centrais "
             "hidrelétricas envolvem barramento de curso d'água, supressão de "
             "vegetação e alteração de regime hídrico."),
         fontes=["Lei nº 9.605/1998, arts. 38, 40 e 54", FONTE_CONAMA,
                 "Lei nº 12.334/2010"]),

    dict(codigos=["3520401", "3520402"], setor=ENER, anexo="15", peso=8,
         justificativa=(
             "Produção e processamento de gás e sua distribuição por rede. "
             "Processamento de derivado de petróleo (categoria 15) e manuseio de "
             "produto perigoso."),
         fontes=["Lei nº 9.605/1998, arts. 54 e 56", FONTE_CONAMA]),

    dict(codigos=["3530100"], setor=ENER, anexo="17", peso=6,
         justificativa=(
             "Produção e distribuição de vapor e água quente. Operação de caldeiras "
             "com emissões atmosféricas e, frequentemente, queima de biomassa — o "
             "que conecta a atividade à comprovação de origem do combustível "
             "florestal."),
         fontes=["Lei nº 9.605/1998, arts. 46 e 54"]),

    # =======================================================================
    # 15. FAUNA, FLORA E ÁREAS PROTEGIDAS
    # =======================================================================
    dict(codigos=["4789004"], setor=FAUN, anexo="20", peso=6,
         justificativa=(
             "Comércio varejista de animais vivos. Exposição concentrada na origem "
             "legal do animal e na exigência de criadouro autorizado; o comércio de "
             "espécime da fauna silvestre sem autorização é conduta expressamente "
             "tipificada."),
         fontes=["Lei nº 9.605/1998, art. 29, § 1º, III, e art. 32"]),

    dict(codigos=["4623101", "4633803"], setor=FAUN, anexo="20", peso=5,
         justificativa=(
             "Comércio atacadista de animais vivos. Elo de circulação da cadeia "
             "animal, com exigência de documentação sanitária e de origem."),
         fontes=["Lei nº 9.605/1998, art. 29"]),

    dict(codigos=["9103100"], setor=FAUN, anexo="19", peso=6,
         justificativa=(
             "Jardins botânicos, zoológicos, parques nacionais, reservas ecológicas "
             "e áreas de proteção ambiental. Manutenção de fauna em cativeiro sob "
             "autorização e gestão de área especialmente protegida, com tipo penal "
             "próprio para dano a unidade de conservação."),
         fontes=["Lei nº 9.605/1998, arts. 32 e 40",
                 "Lei nº 9.985/2000 (SNUC)"]),

    dict(codigos=["8130300"], setor=FAUN, anexo="20", peso=4,
         justificativa=(
             "Atividades paisagísticas. Executa poda e supressão de vegetação em "
             "área urbana, sujeita a autorização municipal, e utiliza defensivos."),
         fontes=["Lei nº 9.605/1998, arts. 49 e 50"]),
]


# ---------------------------------------------------------------------------
# Construção
# ---------------------------------------------------------------------------
def rotulo_exposicao(peso: int) -> str:
    if peso >= 9:
        return "Muito alta"
    if peso >= 7:
        return "Alta"
    if peso >= 5:
        return "Média"
    return "Baixa"


def carregar_cnaes_oficiais(caminho: str) -> dict[str, str]:
    """Lê a tabela oficial de CNAEs (Cnaes.zip ou .csv) da Receita Federal."""
    linhas: list[list[str]] = []
    if caminho.lower().endswith(".zip"):
        with zipfile.ZipFile(caminho) as zf:
            nomes = [n for n in zf.namelist() if not n.endswith("/")]
            if not nomes:
                raise SystemExit(f"{caminho}: zip vazio.")
            with zf.open(nomes[0]) as f:
                txt = io.TextIOWrapper(f, encoding="latin-1", newline="")
                linhas = list(csv.reader(txt, delimiter=";"))
    else:
        with open(caminho, encoding="latin-1", newline="") as f:
            linhas = list(csv.reader(f, delimiter=";"))

    tabela = {}
    for row in linhas:
        if len(row) < 2:
            continue
        codigo = row[0].strip().strip('"')
        desc = row[1].strip().strip('"')
        if codigo.isdigit():
            tabela[codigo.zfill(7)] = desc
    if not tabela:
        raise SystemExit(f"{caminho}: nenhum CNAE lido.")
    return tabela


def construir(tabela: dict[str, str]) -> tuple[dict, list[str]]:
    """Aplica as REGRAS sobre a tabela oficial. Retorna (matriz, avisos).

    Vence a regra de maior especificidade (código exato > prefixo longo >
    prefixo curto); em caso de empate, a declarada por último.
    """
    matriz: dict[str, dict] = {}
    especificidade: dict[str, tuple[int, int]] = {}   # cnae -> (specif., ordem)
    avisos: list[str] = []

    for i, regra in enumerate(REGRAS):
        # (código, especificidade do casamento)
        alvos: list[tuple[str, int]] = []

        for cod in regra.get("codigos", []):
            if cod in tabela:
                alvos.append((cod, len(cod)))       # 7 = máxima especificidade
            else:
                avisos.append(
                    f"regra #{i} ({regra['setor']}): código {cod} NÃO existe na "
                    f"tabela oficial da RFB — ignorado.")

        for pref in regra.get("prefixos", []):
            achados = [c for c in tabela if c.startswith(pref)]
            if not achados:
                avisos.append(
                    f"regra #{i} ({regra['setor']}): prefixo {pref} não casou com "
                    f"nenhum CNAE oficial — ignorado.")
            alvos.extend((c, len(pref)) for c in achados)

        cat = regra["anexo"]
        nome_cat, pp = ANEXO_VIII[cat]
        fonte_anexo = FONTE_ANEXO.format(cat=cat, nome=nome_cat, pp=pp)

        for cod, spec in alvos:
            if especificidade.get(cod, (-1, -1)) > (spec, i):
                continue                            # já há regra mais específica
            especificidade[cod] = (spec, i)
            matriz[cod] = {
                "codigo": cod,
                "descricao": tabela[cod],           # descrição OFICIAL da RFB
                "setor": regra["setor"],
                "categoria_anexo_viii": f"{cat} - {nome_cat}",
                "pp_gu_anexo_viii": pp,
                "exposicao_ambiental": rotulo_exposicao(regra["peso"]),
                "peso": regra["peso"],
                "justificativa": regra["justificativa"],
                "fontes": [fonte_anexo] + list(regra.get("fontes", [])),
                "origem": "regra_automatica",
                "regra": i,
            }

    return matriz, avisos


def main() -> None:
    p = argparse.ArgumentParser(
        description="Constrói a matriz de CNAEs de exposição ambiental a partir "
                    "da lista oficial de subclasses da Receita Federal.")
    p.add_argument("--cnaes", required=True,
                   help="Cnaes.zip (ou .csv) dos Dados Abertos do CNPJ")
    p.add_argument("--saida", default="../config/cnaes_risco_ambiental.json")
    p.add_argument("--preservar-manual", action="store_true",
                   help="mantém entradas com \"origem\": \"manual\" já existentes "
                        "no arquivo de saída")
    args = p.parse_args()

    tabela = carregar_cnaes_oficiais(args.cnaes)
    print(f"[i] tabela oficial da RFB: {len(tabela)} subclasses CNAE.")

    matriz, avisos = construir(tabela)
    for a in avisos:
        print(f"[!] {a}")

    manuais = 0
    if args.preservar_manual and os.path.exists(args.saida):
        antigo = json.load(open(args.saida, encoding="utf-8"))
        for cod, item in (antigo.get("cnaes") or {}).items():
            if item.get("origem") == "manual":
                matriz[cod] = item
                manuais += 1
        print(f"[i] {manuais} entrada(s) manual(is) preservada(s).")

    por_setor: dict[str, int] = {}
    por_exposicao: dict[str, int] = {}
    for item in matriz.values():
        por_setor[item["setor"]] = por_setor.get(item["setor"], 0) + 1
        por_exposicao[item["exposicao_ambiental"]] = \
            por_exposicao.get(item["exposicao_ambiental"], 0) + 1

    doc = {
        "meta": {
            "gerado_em": date.today().isoformat(),
            "gerado_por": "src/construir_matriz.py",
            "total_cnaes_na_matriz": len(matriz),
            "total_cnaes_oficiais": len(tabela),
            "cobertura_percentual": round(100 * len(matriz) / len(tabela), 1),
            "base_oficial_cnae": (
                "Receita Federal do Brasil — Dados Abertos do CNPJ, tabela "
                "Cnaes.zip (subclasses CNAE 2.3). Todas as descrições são as "
                "descrições oficiais da RFB, sem paráfrase."),
            "ancoras_normativas": [
                "Lei nº 6.938/1981, Anexo VIII (incluído pela Lei nº 10.165/2000) "
                "— Atividades Potencialmente Poluidoras e Utilizadoras de Recursos "
                "Ambientais, com o grau Pp/gu de cada categoria",
                "Lei nº 6.938/1981, art. 17-D, § 3º — prevalece a atividade de "
                "maior grau quando o estabelecimento exerce mais de uma",
                "Resolução CONAMA nº 237/1997, Anexo 1 — atividades sujeitas a "
                "licenciamento ambiental",
                "Lei nº 9.605/1998 — Lei de Crimes Ambientais",
                "Deliberação Normativa COPAM/MG nº 217/2017 — moldura estadual de "
                "classificação por porte e potencial poluidor (referência de "
                "contexto; não há vínculo automático código-a-código com o CNAE)",
            ],
            "escala_peso": {
                "10": "exposição potencial máxima",
                "9": "muito alta",
                "7-8": "alta",
                "5-6": "média",
                "1-4": "baixa",
            },
            "aviso": (
                "O peso mede EXPOSIÇÃO POTENCIAL a risco ambiental em razão da "
                "atividade econômica declarada. NÃO indica, sugere ou presume "
                "infração, irregularidade ou prática de crime por qualquer empresa. "
                "Serve exclusivamente para priorizar verificação documental "
                "posterior, individualizada e em fonte oficial."),
            "como_editar": (
                "Para incluir ou ajustar um CNAE sem reexecutar o script, edite "
                "diretamente a chave em \"cnaes\" e marque \"origem\": \"manual\". "
                "Reexecutando com --preservar-manual, essas entradas são mantidas."),
            "distribuicao_por_setor": dict(sorted(por_setor.items(),
                                                  key=lambda kv: -kv[1])),
            "distribuicao_por_exposicao": por_exposicao,
        },
        "cnaes": dict(sorted(matriz.items())),
    }

    os.makedirs(os.path.dirname(os.path.abspath(args.saida)), exist_ok=True)
    with open(args.saida, "w", encoding="utf-8") as f:
        json.dump(doc, f, ensure_ascii=False, indent=1)

    print(f"[ok] {args.saida}: {len(matriz)} CNAEs "
          f"({doc['meta']['cobertura_percentual']}% da tabela oficial).")
    print("[i] por setor:")
    for setor, n in sorted(por_setor.items(), key=lambda kv: -kv[1]):
        print(f"      {n:4d}  {setor}")
    print("[i] por exposição:", por_exposicao)


if __name__ == "__main__":
    main()
