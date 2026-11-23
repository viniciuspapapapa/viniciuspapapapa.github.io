"""Extrai dos Anexos XVIII a XXII da LC 214/2025 (texto consolidado da Câmara, convertido com pdftotext -layout)
as tabelas de alíquotas e de partilha do Simples Nacional de 2027 em diante e grava simples-lc214.json.
Cada linha de partilha é conferida: a soma dos percentuais precisa dar 100%.
Uso: python3 -I simples_lc214.py <lc214.txt> <saida.json>"""
import json, re, sys

txt = open(sys.argv[1], encoding="utf-8").read().split("\n")
ini = next(i for i, l in enumerate(txt) if re.match(r"\s*ANEXO XVIII\s*$", l))
fim = next(i for i, l in enumerate(txt) if re.match(r"\s*ANEXO XXIII\s*$", l))
linhas = txt[ini:fim]
pct = lambda s: float(s.replace(".", "").replace(",", "."))
RE_P = r"(\d{1,3},\d{1,2})\s*%"
anexos, atual, periodo = {}, None, None


def novo_periodo(rot, anos):
    global periodo
    periodo = {"rotulo": rot, "anos": anos, "colunas": None, "partilha": {}, "teto_iss": None, "faixa5_acima": None}
    atual["periodos"].append(periodo)


i = 0
while i < len(linhas):
    l = linhas[i]
    m = re.match(r"\s*ANEXO (I|II|III|IV|V)\s*$", l)
    if m:
        atual = anexos[m.group(1)] = {"anexo": m.group(1), "titulo": "", "aliquotas": {}, "periodos": []}
        atual["titulo"] = re.sub(r"\s+", " ", (linhas[i + 1] + " " + (linhas[i + 2] if "Vigência" not in linhas[i + 2] else ""))).strip()
        i += 1; continue
    m = re.search(r"Para os anos-calendário (\d{4}) e (\d{4})", l)
    if m: novo_periodo(m.group(0), [int(m.group(1)), int(m.group(2))])
    m = re.search(r"Para o ano-calendário (\d{4})", l)
    if m: novo_periodo(m.group(0), [int(m.group(1))])
    m = re.search(r"A partir do ano-calendário (\d{4})", l)
    if m:
        a = int(m.group(1))
        # bloco "Alíquotas ... a partir de 2029" (só a tabela de alíquotas) não abre período de partilha
        prox = " ".join(linhas[i:i + 14])
        if "Repartição" in prox and "Valor a Deduzir" not in " ".join(linhas[i:i + 6]): novo_periodo(m.group(0), list(range(a, 2041)) if a == 2033 else [a])
        else: atual["_aliq_desde"] = a
    # tabela de alíquotas nominais
    m = re.match(r"\s*(\d)[ªa] Faixa\s+(Até|De)\s+([\d.,]+)(?:\s+a\s+([\d.,]+))?\s+" + RE_P + r"\s+([\d.,]+|[-–])", l)
    if m:
        chave = str(atual.get("_aliq_desde", 2027))
        atual["aliquotas"].setdefault(chave, []).append({"faixa": int(m.group(1)), "ate": pct(m.group(4) or m.group(3)), "nominal": pct(m.group(5)), "deduzir": 0.0 if m.group(6) in "-–" else pct(m.group(6))})
        i += 1; continue
    # cabeçalho de colunas da partilha
    if periodo is not None and re.match(r"\s*(Faixas\s+)?IRPJ\s+CSLL", l) and not periodo["partilha"]:
        periodo["colunas"] = [c.replace("(*)", "").strip() for c in re.findall(r"IRPJ|CSLL|CBS|CPP|ICMS|ISS(?:\s*\(\*\))?|IBS|IPI", l)]
    m = re.search(r"máximo devido ao ISS será de ([\d,]+)%", l)
    if m and periodo is not None: periodo["teto_iss"] = pct(m.group(1))
    # linha especial da 5ª faixa acima do teto do ISS: valores atribuídos à coluna pela posição no texto
    if periodo is not None and periodo["teto_iss"] is not None and periodo["faixa5_acima"] is None and re.match(r"\s*5ª\s+Faixa,", l):
        k = i - 1
        while k > i - 6 and not ("IRPJ" in linhas[k] and "CSLL" in linhas[k]): k -= 1
        cab = linhas[k] if "IRPJ" in linhas[k] else linhas[i]
        centros = [(m2.group(0).split()[0], (m2.start() + m2.end()) / 2) for m2 in re.finditer(r"IRPJ|CSLL|CBS|CPP|ISS|IBS|IPI", cab)]
        achados = {}
        j = i
        while j < len(linhas) and j < i + 8:
            t = linhas[j]
            for m2 in re.finditer(r"(\d{1,3}(?:,\d{1,2})?)\s*%", t):
                v = pct(m2.group(1))
                if abs(v - periodo["teto_iss"]) < 1e-9: continue
                x = (m2.start() + m2.end()) / 2
                col = min(centros, key=lambda c: abs(c[1] - x))[0]
                if col != "ISS": achados.setdefault(col, v)
            if re.search(r"superior", t): break
            j += 1
        periodo["faixa5_acima"] = achados
    mf = re.match(r"\s*(\d)ª\s+Faixa\s+(.*)$", l)
    if mf and periodo is not None and periodo["colunas"] and "Faixa," not in l and "com" not in mf.group(2)[:5]:
        f = int(mf.group(1)); vals = [pct(x) for x in re.findall(RE_P, mf.group(2))]
        # valor do ISS/ICMS diagramado na linha de cima
        if len(vals) == len(periodo["colunas"]) - 1 and f < 6:
            acima = re.findall(RE_P, linhas[i - 1]) or re.findall(RE_P, linhas[i - 2])
            if len(acima) == 1:
                k = next(k for k, c in enumerate(periodo["colunas"]) if c in ("ISS", "ICMS"))
                vals.insert(k, pct(acima[0]))
        if vals and f not in periodo["partilha"]: periodo["partilha"][f] = vals
    i += 1

# a linha especial da 5ª faixa: os percentuais (Alíquota efetiva - teto) x p% são lidos na ordem das colunas
for a in anexos.values():
    a.pop("_aliq_desde", None)
    for p in a["periodos"]:
        if p["faixa5_acima"]:
            cols = [c for c in p["colunas"] if c != "ISS"]
            if sorted(p["faixa5_acima"]) != sorted(cols): p["faixa5_acima"] = {"_erro": p["faixa5_acima"]}
        p["partilha"] = {str(f): dict(zip(p["colunas"], v)) for f, v in sorted(p["partilha"].items())}

erros = []
for a in anexos.values():
    for k, tab in a["aliquotas"].items():
        if [x["faixa"] for x in tab] != [1, 2, 3, 4, 5, 6]: erros.append(a["anexo"] + " alíquotas " + k)
    for p in a["periodos"]:
        if sorted(p["partilha"]) != ["1", "2", "3", "4", "5", "6"]: erros.append(a["anexo"] + " " + p["rotulo"] + " faixas " + str(sorted(p["partilha"])))
        for f, d in p["partilha"].items():
            s = sum(d.values())
            if abs(s - 100) > 0.051: erros.append("%s %s faixa %s soma %.2f %s" % (a["anexo"], p["rotulo"], f, s, d))
        if p["faixa5_acima"]:
            s = sum(v for c, v in p["faixa5_acima"].items() if c != "_erro") if "_erro" not in p["faixa5_acima"] else -1
            if abs(s - 100) > 0.051: erros.append("%s %s faixa 5 acima do teto soma %.2f %s" % (a["anexo"], p["rotulo"], s, p["faixa5_acima"]))
for e in erros: print("CONFERIR:", e)
(lambda dados: open(sys.argv[2], "w", encoding="utf-8").write(("window.RTC_SIMPLES = " + json.dumps(dados, ensure_ascii=False, separators=(",", ":")) + ";\n") if sys.argv[2].endswith(".js") else json.dumps(dados, ensure_ascii=False, indent=1)))({"fonte": "LC 214/2025, Anexos XVIII a XXII (redação consolidada, com a LC 227/2026), que dão nova redação aos Anexos I a V da LC 123/2006", "anexos": anexos})
print("anexos:", {k: [p["rotulo"] for p in v["periodos"]] for k, v in anexos.items()})
