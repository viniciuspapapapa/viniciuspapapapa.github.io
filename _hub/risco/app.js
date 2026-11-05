/* Interface do questionário de risco penal empresarial. */
(function () {
  "use strict";
  const R = window.RISCO, T = window.TPC_PECA, esc = window.HUB.esc;
  const $ = s => document.querySelector(s);
  let timer = null;
  const ed = T.editor($("#folha"), { aviso: () => { $("#descartar").hidden = false; } });
  $("#editar").onclick = () => { const on = !ed.editando(); ed.editar(on); $("#editar").textContent = on ? "Concluir edição" : "Editar texto"; $("#descartar").hidden = !ed.editado(); };
  $("#descartar").onclick = () => { if (!confirm("Descartar as edições feitas no texto?")) return; ed.descartar(); $("#editar").textContent = "Editar texto"; $("#descartar").hidden = true; atualizar(); };
  const OPC = [["sim", "Sim"], ["parcial", "Parcial"], ["nao", "Não"], ["na", "N/A"]];
  const classe = n => ({ "crítico": "critico", "não avaliado": "na" }[n] || n);

  $("#areas").innerHTML = R.AREAS.map(a => '<div class="card bloco" data-area="' + a.id + '"><h2>' + esc(a.titulo) + ' <span class="nivel na" data-nivel>não avaliada</span></h2><p class="mudo">' + esc(a.base) + "</p>" +
    a.perguntas.map(q => '<div class="perg"><p><span class="tipo">' + (q.tipo === "fator" ? "Fator de risco" : "Controle") + "</span>" + esc(q.q) + '</p><div class="seg" role="radiogroup" aria-label="' + esc(q.q) + '">' +
      OPC.map(([v, r]) => '<label><input type="radio" name="' + a.id + "." + q.id + '" value="' + v + '"><span>' + r + "</span></label>").join("") + "</div></div>").join("") + "</div>").join("");

  $("#advs").innerHTML = T.ADVOGADOS.map(a => '<label class="check"><input type="checkbox" data-adv="' + a.id + '"' + (a.id === "renato" || a.id === "vinicius" ? " checked" : "") + "> " + esc(a.nome) + ' <span class="dica">OAB/' + a.uf + " " + a.oab + "</span></label>").join("");
  const dig = s => String(s || "").replace(/\D/g, "");
  $("#cnpj").addEventListener("input", e => { const d = dig(e.target.value).slice(0, 14); e.target.value = d.replace(/^(\d{2})(\d)/, "$1.$2").replace(/^(\d{2})\.(\d{3})(\d)/, "$1.$2.$3").replace(/\.(\d{3})(\d)/, ".$1/$2").replace(/(\d{4})(\d{1,2})$/, "$1-$2"); });

  document.addEventListener("input", agendar); document.addEventListener("change", agendar);
  function agendar() { clearTimeout(timer); timer = setTimeout(atualizar, 200); }
  function respostas() { const o = {}; document.querySelectorAll('#areas input[type=radio]:checked').forEach(i => { o[i.name] = i.value; }); return o; }
  function montar() {
    const emp = { nome: $("#nome").value.trim(), cnpj: $("#cnpj").value.trim(), porte: $("#porte").value, setor: $("#setor").value.trim(), empregados: $("#empregados").value, unidades: $("#unidades").value.trim(), observacoes: $("#observacoes").value.trim() };
    const d = $("#data").value ? new Date($("#data").value + "T00:00:00Z") : new Date();
    return { emp, resp: respostas(), out: R.parecer(emp, respostas(), { local: $("#local").value.trim() || "Belo Horizonte/MG", dataTexto: T.dataExtenso(d), advogados: T.ADVOGADOS.filter(a => document.querySelector('[data-adv="' + a.id + '"]').checked) }) };
  }
  function atualizar() {
    const { emp, resp, out } = montar();
    out.resultado.forEach(r => {
      const el = document.querySelector('[data-area="' + r.area.id + '"] [data-nivel]');
      el.className = "nivel " + classe(r.nivel); el.textContent = r.pct == null ? "não avaliada" : r.nivel + " · " + r.pct + "%";
    });
    $("#placar").innerHTML = out.resultado.map(r => "<div><span>" + esc(r.area.titulo) + "</span><b>" + (r.pct == null ? "—" : r.pct + "%") + '</b><span class="nivel ' + classe(r.nivel) + '" style="display:inline-block;text-transform:none;letter-spacing:0">' + esc(r.nivel) + '</span><div class="barra" style="margin-top:8px"><i style="width:' + (r.pct || 0) + '%"></i></div></div>').join("");
    const total = R.AREAS.reduce((s, a) => s + a.perguntas.length, 0), resp_n = Object.keys(resp).length, faltas = [];
    if (!emp.nome) faltas.push("a razão social");
    if (resp_n < total) faltas.push((total - resp_n) + " de " + total + " perguntas sem resposta (marque N/A quando não se aplicar)");
    if (!document.querySelector("[data-adv]:checked")) faltas.push("ao menos um advogado");
    $("#faltas").innerHTML = faltas.length ? '<div class="aviso" style="border-left:3px solid var(--warn);background:var(--warn-bg);padding:8px 12px;border-radius:0 8px 8px 0;font-size:13.5px;margin-bottom:10px">Para gerar, complete: ' + esc(faltas.join("; ")) + ".</div>" : "";
    $("#baixar").disabled = faltas.length > 0;
    ed.mostrar(out.blocos);
    if (ed.editado()) $("#faltas").insertAdjacentHTML("beforeend", '<div class="aviso" style="border-left:3px solid var(--warn);background:var(--warn-bg);padding:8px 12px;border-radius:0 8px 8px 0;font-size:13.5px;margin-bottom:10px">O texto foi editado manualmente; novas respostas só entram no parecer se você descartar as edições.</div>');
  }
  $("#baixar").onclick = async () => { const { emp } = montar(); try { T.baixar(await T.docx(ed.blocos()), "Parecer de risco penal - " + (emp.nome || "empresa")); } catch (e) { window.HUB.toast(e.message || "Não foi possível gerar o Word.", 5000); } };
  $("#copiar").onclick = () => window.HUB_DOC.copiar(T.texto(ed.blocos()));
  const h = new Date(); $("#data").value = new Date(Date.UTC(h.getFullYear(), h.getMonth(), h.getDate())).toISOString().slice(0, 10);
  atualizar();
})();
