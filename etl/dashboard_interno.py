#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Gera um dashboard HTML AUTOCONTIDO (uso interno) com risco penal + sócios.

Lê dados-captacao-com-risco-penal.json + qsa_cache.json e embute os dados num
único arquivo HTML que abre offline (duplo-clique), sem servidor. Inclui marca
CONFIDENCIAL, filtros por nível de risco/região, busca e o QSA por empresa.

⚠️ CONFIDENCIAL — USO INTERNO. Contém inferência penal + dados pessoais de
sócios. NÃO publicar (somente repositório privado / máquina do escritório).
"""
from __future__ import annotations
import argparse, json, html


def fcnpj(c: str) -> str:
    c = "".join(ch for ch in c if ch.isdigit()).zfill(14)
    return f"{c[0:2]}.{c[2:5]}.{c[5:8]}/{c[8:12]}-{c[12:14]}"


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--risco", default="./dados-captacao-com-risco-penal.json")
    p.add_argument("--qsa", default="./qsa_cache.json")
    p.add_argument("--saida", default="./captacao-interna.html")
    args = p.parse_args()

    dados = json.load(open(args.risco, encoding="utf-8"))
    emp = dados["empresas"]
    qsa = json.load(open(args.qsa, encoding="utf-8"))

    compact = []
    for e in emp:
        rp = e["risco_penal"]
        socios = [
            {"n": s.get("nome", ""), "q": s.get("qualificacao", ""),
             "a": bool(s.get("admin")), "e": s.get("entrada", ""),
             "c": s.get("cpf_cnpj", "")}
            for s in qsa.get(e["cnpj"], []) if s.get("nome")
        ]
        compact.append({
            "rs": e.get("razao_social", ""),
            "nf": e.get("nome_fantasia", ""),
            "cnpj": fcnpj(e["cnpj"]),
            "div": e.get("divida_total", 0),
            "reg": e.get("regiao", ""),
            "mun": e.get("municipio", ""),
            "tel": e.get("telefone", ""),
            "mail": e.get("email", ""),
            "insc": e.get("qtd_inscricoes", 0),
            "rn": rp["nivel"],
            "rsc": rp["score"],
            "tip": rp["tipificacoes"],
            "fun": rp["fundamentos"],
            "soc": socios,
        })

    meta = dados.get("meta", {})
    payload = json.dumps({"empresas": compact, "meta": meta},
                         ensure_ascii=False)

    html_doc = TEMPLATE.replace("/*__DATA__*/", payload)
    with open(args.saida, "w", encoding="utf-8") as f:
        f.write(html_doc)
    print(f"[ok] {args.saida}: {len(compact)} empresas embutidas.")


TEMPLATE = r"""<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta name="robots" content="noindex, nofollow">
<title>⚠️ INTERNO — Captação + Risco Penal · Dívida Ativa MG</title>
<style>
  :root{--bg:#f4f6fb;--surface:#fff;--border:#e6e9f2;--ink:#0f172a;--muted:#64748b;
    --brand:#1d4ed8;--red:#dc2626;--red-soft:#fef2f2;--amber:#d97706;--amber-soft:#fffbeb;
    --gray-soft:#f3f4f6;--green:#059669;--shadow:0 1px 2px rgba(15,23,42,.04),0 8px 24px -12px rgba(15,23,42,.12)}
  *{box-sizing:border-box;margin:0;padding:0}
  body{background:var(--bg);color:var(--ink);font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;line-height:1.5;padding-bottom:60px}
  .conf{background:repeating-linear-gradient(45deg,#7f1d1d,#7f1d1d 14px,#991b1b 14px,#991b1b 28px);color:#fff;text-align:center;font-weight:800;font-size:12.5px;letter-spacing:.04em;padding:7px}
  header{background:linear-gradient(120deg,#1e3a8a,#1d4ed8 60%,#2563eb);color:#fff;padding:20px 0 24px}
  .wrap{max-width:1340px;margin:0 auto;padding:0 22px}
  h1{font-size:20px;font-weight:800;letter-spacing:-.02em}
  .sub{font-size:12.5px;color:#dbeafe;margin-top:3px}
  main{max-width:1340px;margin:18px auto;padding:0 22px}
  .alert{background:var(--red-soft);border:1px solid #fecaca;color:#991b1b;border-radius:11px;padding:11px 15px;font-size:12.5px;margin-bottom:16px}
  .stats{display:flex;gap:12px;flex-wrap:wrap;margin-bottom:16px}
  .stat{background:var(--surface);border:1px solid var(--border);border-radius:13px;padding:12px 16px;box-shadow:var(--shadow);min-width:120px}
  .stat .v{font-size:21px;font-weight:800}.stat .l{font-size:11.5px;color:var(--muted)}
  .controls{display:flex;gap:10px;flex-wrap:wrap;margin-bottom:16px;align-items:center}
  input,select{font:inherit;padding:9px 12px;border:1px solid var(--border);border-radius:10px;background:#fff}
  input[type=search]{flex:1;min-width:220px}
  .card{background:var(--surface);border:1px solid var(--border);border-radius:13px;padding:14px 16px;box-shadow:var(--shadow);margin-bottom:11px}
  .row1{display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap;align-items:flex-start}
  .rs{font-weight:800;font-size:15px}.meta{font-size:12.5px;color:var(--muted);margin-top:2px}
  .badge{font-size:11px;font-weight:800;padding:4px 10px;border-radius:999px;white-space:nowrap}
  .b-Alto{background:var(--red-soft);color:#991b1b;border:1px solid #fecaca}
  .b-Médio{background:var(--amber-soft);color:#92400e;border:1px solid #fde68a}
  .b-Médio-baixo{background:#e0f2fe;color:#075985;border:1px solid #bae6fd}
  .b-Indeterminado{background:var(--gray-soft);color:#374151;border:1px solid #e5e7eb}
  .div{font-size:15px;font-weight:800;color:var(--brand)}
  .tip{font-size:12px;color:#7f1d1d;margin-top:8px}
  .tip b{font-weight:700}
  .soc{margin-top:9px;border-top:1px dashed var(--border);padding-top:9px}
  .soc h4{font-size:11.5px;color:var(--muted);text-transform:uppercase;letter-spacing:.03em;margin-bottom:5px}
  .sline{font-size:12.5px;padding:2px 0}
  .sadmin{font-weight:700}.qual{color:var(--muted)}
  .adm-tag{font-size:10px;font-weight:800;color:#7c2d12;background:#ffedd5;padding:1px 6px;border-radius:6px;margin-left:5px}
  .cpf{color:var(--muted);font-size:11.5px}
  footer{max-width:1340px;margin:24px auto;padding:0 22px;font-size:11.5px;color:var(--muted)}
  .empty{text-align:center;color:var(--muted);padding:40px}
</style>
</head>
<body>
<div class="conf">⚠️ CONFIDENCIAL · USO INTERNO DO ESCRITÓRIO · NÃO PUBLICAR · contém inferência penal e dados pessoais (LGPD)</div>
<header><div class="wrap">
  <h1>Captação + Risco Penal-Tributário</h1>
  <div class="sub">Dívida Ativa da União (PGFN) · MG — BH/RMBH e Zona da Mata · documento de priorização</div>
</div></header>
<main>
  <div class="alert"><b>Aviso:</b> o "risco penal" é uma <b>inferência heurística</b> pela natureza do tributo — <b>não confirma</b> processo, inquérito ou representação penal. Responsabilidade penal é pessoal (administrador à época do fato). Parcelamento suspende e pagamento integral extingue a punibilidade. Confirme sempre na fonte oficial (e-CAC, JFMG/TRF6, MPF) antes de qualquer uso.</div>
  <div class="stats" id="stats"></div>
  <div class="controls">
    <input type="search" id="q" placeholder="Buscar por razão social, CNPJ ou nome de sócio...">
    <select id="fnivel"><option value="">Todos os níveis</option><option>Alto</option><option>Médio</option><option>Indeterminado</option></select>
    <select id="freg"><option value="">Todas as regiões</option><option>Belo Horizonte / RMBH</option><option>Zona da Mata</option></select>
  </div>
  <div id="list"></div>
</main>
<footer id="foot"></footer>
<script>
const DB = /*__DATA__*/;
const fmt = v => 'R$ '+(v||0).toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2});
const norm = s => (s||'').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'');
const el = (h)=>{const d=document.createElement('div');d.innerHTML=h;return d.firstElementChild;};

function stats(list){
  const n=list.length, alto=list.filter(e=>e.rn==='Alto').length;
  const total=list.reduce((s,e)=>s+(e.div||0),0);
  const soc=list.reduce((s,e)=>s+e.soc.filter(x=>x.a).length,0);
  document.getElementById('stats').innerHTML=[
    ['Empresas',n],['Risco Alto',alto],['Dívida somada',fmt(total)],['Administradores',soc]
  ].map(([l,v])=>`<div class="stat"><div class="v">${typeof v==='number'?v.toLocaleString('pt-BR'):v}</div><div class="l">${l}</div></div>`).join('');
}
function card(e){
  const tip = e.tip.length?`<div class="tip"><b>Tipificações possíveis:</b> ${e.tip.map(t=>t.split(' — ')[0]).join('; ')}</div>`:'';
  const soc = e.soc.length?`<div class="soc"><h4>Sócios / administradores (QSA)</h4>${
    e.soc.slice().sort((a,b)=>b.a-a.a).map(s=>`<div class="sline ${s.a?'sadmin':''}">${s.n}${s.a?'<span class="adm-tag">ADMIN</span>':''} <span class="qual">— ${s.q||'—'}</span> ${s.c?`<span class="cpf">${s.c}</span>`:''}${s.e?` <span class="cpf">· desde ${s.e}</span>`:''}</div>`).join('')
  }</div>`:`<div class="soc"><h4>Sócios</h4><div class="sline qual">QSA não disponível no cadastro público</div></div>`;
  return el(`<div class="card">
    <div class="row1">
      <div><div class="rs">${e.rs}</div><div class="meta">${e.cnpj} · ${e.mun||'—'} · ${e.reg} ${e.tel?'· '+e.tel:''} ${e.mail?'· '+e.mail:''}</div></div>
      <div style="text-align:right"><span class="badge b-${e.rn}">RISCO ${e.rn.toUpperCase()} · ${e.rsc}</span><div class="div" style="margin-top:6px">${fmt(e.div)}</div></div>
    </div>${tip}${soc}</div>`);
}
function render(){
  const q=norm(document.getElementById('q').value), nv=document.getElementById('fnivel').value, rg=document.getElementById('freg').value;
  let list=DB.empresas.filter(e=>{
    if(nv && e.rn!==nv) return false;
    if(rg && e.reg!==rg) return false;
    if(q){const hay=norm(e.rs+' '+e.cnpj+' '+e.soc.map(s=>s.n).join(' '));if(!hay.includes(q))return false;}
    return true;
  });
  const order={Alto:0,'Médio':1,'Médio-baixo':2,Indeterminado:3};
  list.sort((a,b)=>(order[a.rn]-order[b.rn])||(b.rsc-a.rsc)||(b.div-a.div));
  stats(list);
  const c=document.getElementById('list');
  c.innerHTML='';
  if(!list.length){c.innerHTML='<div class="empty">Nenhuma empresa para os filtros.</div>';return;}
  const frag=document.createDocumentFragment();
  list.slice(0,800).forEach(e=>frag.appendChild(card(e)));
  c.appendChild(frag);
  if(list.length>800)c.appendChild(el(`<div class="empty">Mostrando 800 de ${list.length}. Refine a busca.</div>`));
}
['q','fnivel','freg'].forEach(id=>document.getElementById(id).addEventListener('input',render));
document.getElementById('foot').textContent='Gerado de '+(DB.meta.gerado_em||'')+' · Fonte: '+(DB.meta.fonte||'PGFN')+' · QSA: cadastro público CNPJ (CPF mascarado). Uso interno.';
render();
</script>
</body>
</html>"""


if __name__ == "__main__":
    main()
