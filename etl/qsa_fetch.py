#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Busca o QSA (Quadro de Sócios e Administradores) dos CNPJs do dataset.

Dados públicos do cadastro CNPJ (RFB) via BrasilAPI. CPF vem mascarado
(formato público). Uso interno: a responsabilidade penal-tributária é pessoal
e recai sobre o(s) administrador(es) à época do fato.

Grava um cache JSON {cnpj: [socios]} para alimentar o relatório de risco penal.
"""
from __future__ import annotations
import argparse, json, os, time, urllib.request, urllib.error

# qualificações que indicam poder de administração (responsável penal provável)
ADMIN_KW = ("ADMINISTRADOR", "DIRETOR", "PRESIDENTE", "SOCIO-ADMINISTRADOR",
            "SOCIO ADMINISTRADOR", "TITULAR", "GERENTE", "CONSELHEIRO",
            "PROPRIETARIO")


def eh_admin(qualificacao: str) -> bool:
    q = (qualificacao or "").upper()
    return any(k in q for k in ADMIN_KW)


def busca_qsa(cnpj: str) -> list[dict]:
    url = f"https://brasilapi.com.br/api/cnpj/v1/{cnpj}"
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
    with urllib.request.urlopen(req, timeout=30) as r:
        j = json.load(r)
    out = []
    for s in (j.get("qsa") or []):
        out.append({
            "nome": s.get("nome_socio") or "",
            "qualificacao": s.get("qualificacao_socio") or "",
            "cpf_cnpj": s.get("cnpj_cpf_do_socio") or "",
            "entrada": s.get("data_entrada_sociedade") or "",
            "faixa_etaria": s.get("faixa_etaria") or "",
            "admin": eh_admin(s.get("qualificacao_socio")),
            "repr_legal": s.get("nome_representante_legal") or "",
        })
    return out


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--entrada", default="../dados-captacao.json")
    p.add_argument("--cache", default="./qsa_cache.json")
    p.add_argument("--sleep", type=float, default=0.8)
    args = p.parse_args()

    empresas = json.load(open(args.entrada, encoding="utf-8"))["empresas"]
    cache = {}
    if os.path.exists(args.cache):
        cache = json.load(open(args.cache, encoding="utf-8"))

    pend = [e for e in empresas if e["cnpj"] not in cache]
    print(f"[i] {len(empresas)} empresas; {len(pend)} pendentes de QSA.")
    ok = falhas = 0
    for i, e in enumerate(pend, 1):
        cnpj = e["cnpj"]
        try:
            cache[cnpj] = busca_qsa(cnpj)
            ok += 1
            if i % 25 == 0 or i == len(pend):
                json.dump(cache, open(args.cache, "w", encoding="utf-8"),
                          ensure_ascii=False)
                print(f"    [{i}/{len(pend)}] ok (salvo); socios={len(cache[cnpj])}")
        except (urllib.error.HTTPError, urllib.error.URLError, Exception) as exc:  # noqa
            falhas += 1
            cache.setdefault(cnpj, [])
            print(f"    [{i}/{len(pend)}] {cnpj} falhou: {exc}")
        time.sleep(args.sleep)
    json.dump(cache, open(args.cache, "w", encoding="utf-8"), ensure_ascii=False)
    print(f"[ok] {args.cache}: {ok} ok, {falhas} falhas, {len(cache)} no total.")


if __name__ == "__main__":
    main()
