"""Exporta, do banco oficial da Calculadora de Tributos da Receita Federal (gerado pelo Flyway do repositório
ReceitaFederal/calculadora-rtc-regime-regular, licença MIT), as tabelas que a ferramenta de Reforma Tributária do HUB
usa no navegador: CST, classificações tributárias (cClassTrib) com reduções, tratamento e fundamentação legal, NCM, NBS,
vínculos NCM/NBS por classificação, itens dos anexos da LC 214/2025, municípios e versão da base.

Uso: python3 -I exportar.py <calculadora-pro.db> <saida.json.gz>"""
import gzip, json, sqlite3, sys
from datetime import datetime, timezone

db = sqlite3.connect(sys.argv[1])
q = lambda sql, *a: db.execute(sql, a).fetchall()
d10 = lambda s: (s or "")[:10] or None

cols_v = [r[1] for r in q("pragma table_info(VERSAO_BASE_DADO)")]
v = dict(zip(cols_v, q("select * from VERSAO_BASE_DADO order by rowid desc limit 1")[0]))
pega = lambda frag: next((v[c] for c in cols_v if frag in c), "")
versao = {"versao": pega("VERSAO") if str(pega("VERSAO")).startswith("V") else next((x for x in v.values() if isinstance(x, str) and x.startswith("V0")), ""),
          "data": d10(next((x for x in v.values() if isinstance(x, str) and x[:2] == "20"), "")), "descricao": next((x for x in v.values() if isinstance(x, str) and len(x) > 25), "")}

tributos = {r[0]: r[1] for r in q("select TBTO_ID, TBTO_SIGLA from TRIBUTO")}
cst = {r[0]: [r[1], r[2]] for r in q("select SITR_ID, SITR_CD, SITR_DESCRICAO from SITUACAO_TRIBUTARIA")}

fund = {}
for fid, txt, curto, ref in q("select FDLG_ID, FDLG_TEXTO, FDLG_TEXTO_CURTO, FDLG_REFERENCIA_NORMATIVA from FUNDAMENTACAO_LEGAL"):
    fund[fid] = [curto or "", (txt or "").replace("\\n", "\n")]

fundcl, tratcl, red = {}, {}, {}
for cl, fd, ini, fim in q("select FDCL_CLTR_ID, FDCL_FDLG_ID, FDCL_INICIO_VIGENCIA, FDCL_FIM_VIGENCIA from FUNDAMENTACAO_CLASSIFICACAO"):
    fundcl.setdefault(cl, []).append([fd, d10(ini), d10(fim)])
tratdesc = {r[0]: r[1] for r in q("select TRTR_ID, TRTR_DESCRICAO from TRATAMENTO_TRIBUTARIO")}
for cl, tr, ini, fim in q("select TRCL_CLTR_ID, TRCL_TRTR_ID, TRCL_INICIO_VIGENCIA, TRCL_FIM_VIGENCIA from TRATAMENTO_CLASSIFICACAO"):
    tratcl.setdefault(cl, []).append([tratdesc.get(tr, ""), d10(ini), d10(fim)])
for cl, tb, val, ini, fim in q("select PERE_CLTR_ID, PERE_TBTO_ID, PERE_VALOR, PERE_INICIO_VIGENCIA, PERE_FIM_VIGENCIA from PERCENTUAL_REDUCAO"):
    red.setdefault(cl, []).append([tributos.get(tb, str(tb)), val, d10(ini), d10(fim)])

cc = []
for (cid, cd, desc, mem, acbs, aibs, cpf, cpa, sitr, tipo, nom, ini, fim, anexo) in q(
        "select CLTR_ID, CLTR_CD, CLTR_DESCRICAO, CLTR_MEMORIA_CALCULO, CLTR_IN_APROPRIACAO_CREDITOS_ADQUIRENTES_CBS, "
        "CLTR_IN_APROPRIACAO_CREDITOS_ADQUIRENTES_IBS, CLTR_IN_CREDITO_PRESUMIDO_FORNECEDOR, CLTR_IN_CREDITO_PRESUMIDO_ADQUIRENTE, "
        "CLTR_SITR_ID, CLTR_TIPO_ALIQUOTA, CLTR_NOMENCLATURA, CLTR_INICIO_VIGENCIA, CLTR_FIM_VIGENCIA, CLTR_ANEXO "
        "from CLASSIFICACAO_TRIBUTARIA order by CLTR_CD, CLTR_INICIO_VIGENCIA"):
    s = cst.get(sitr, ["", ""])
    cc.append({"id": cid, "c": cd, "d": desc, "s": s[0], "t": tipo or "", "n": nom or "", "cr": [acbs or 0, aibs or 0], "cp": [cpf or 0, cpa or 0],
               "i": d10(ini), "e": d10(fim), "a": anexo or "", "r": red.get(cid, []), "tr": tratcl.get(cid, []), "f": fundcl.get(cid, [])})

ncm = [[r[0], r[1]] for r in q("select NCM_CD, NCM_DESCRICAO from NCM where NCM_FIM_VIGENCIA is null or NCM_FIM_VIGENCIA >= '2026' order by NCM_CD")]
nbs = [[r[0], r[1], r[2] or ""] for r in q("select NBS_CD, NBS_DESCRICAO, NBS_LC_116 from NBS order by NBS_CD")]
cdcl = {x["id"]: x["c"] for x in cc}
ncma = [[r[0], cdcl.get(r[1], ""), r[2], d10(r[3]), d10(r[4])] for r in q("select NCMA_NCM_CD, NCMA_CLTR_ID, NCMA_ANXO_ID, NCMA_INICIO_VIGENCIA, NCMA_FIM_VIGENCIA from NCM_APLICAVEL")]
nbsa = [[r[0], cdcl.get(r[1], ""), r[2], d10(r[3]), d10(r[4])] for r in q("select NBSA_NCM_CD, NBSA_CLTR_ID, NBSA_ANXO_ID, NBSA_INICIO_VIGENCIA, NBSA_FIM_VIGENCIA from NBS_APLICAVEL".replace("NBSA_NCM_CD", "NBSA_NBS_CD"))]
anx = {r[0]: [r[1], r[2], r[3]] for r in q("select ANXO_ID, ANXO_NUMERO, ANXO_NUMERO_ITEM, ANXO_TEXTO_ITEM from ANEXO")}
uf = {r[0]: r[1] for r in q("select UF_CD, UF_SIGLA from UF")}
mun = [[r[0], r[1], uf.get(r[2], "")] for r in q("select MUNI_CD, MUNI_NOME, MUNI_UF_CD from MUNICIPIO where MUNI_FIM_VIGENCIA is null order by MUNI_NOME")]

saida = {"gerado": datetime.now(timezone.utc).isoformat()[:19] + "Z", "versao": versao, "fonte": "Receita Federal do Brasil, Calculadora de Tributos da Reforma Tributária (github.com/ReceitaFederal/calculadora-rtc-regime-regular, licença MIT)",
         "cc": cc, "fund": fund, "ncm": ncm, "nbs": nbs, "ncmA": ncma, "nbsA": nbsa, "anx": anx, "mun": mun}
with gzip.open(sys.argv[2], "wt", encoding="utf-8", compresslevel=9) as f:
    json.dump(saida, f, ensure_ascii=False, separators=(",", ":"))
print("Reforma tributária:", versao, "| cClassTrib", len(cc), "| NCM", len(ncm), "| NBS", len(nbs), "| vínculos NCM", len(ncma), "| NBS", len(nbsa), "| municípios", len(mun))
