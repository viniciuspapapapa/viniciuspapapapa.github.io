/* Exportação de relatórios do HUB: Word (.doc em HTML), cópia do texto e impressão. */
(function () {
  "use strict";
  const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const CSS = 'body{font-family:"Segoe UI",Calibri,Arial,sans-serif;font-size:11pt;line-height:1.45}h2{font-family:"Segoe UI Semibold","Segoe UI",Calibri;font-size:13pt}h3{font-family:"Segoe UI Semibold","Segoe UI",Calibri;font-size:11.5pt;margin-top:18pt;text-transform:uppercase}h4{font-size:11pt}p{text-align:justify;margin:0 0 10pt}blockquote{margin:0 0 10pt 25mm;font-size:10.5pt;color:#3d3d3d}table{border-collapse:collapse;width:100%;margin:6pt 0 12pt}td,th{border:1px solid #c8c3be;padding:4pt 6pt;font-size:9.5pt;vertical-align:top;text-align:left}th{background:#f5f3f0}.num{text-align:right}.mudo{color:#666}.pequeno{font-size:9pt}.rel-cab{border-bottom:3pt solid #F5EF90;padding-bottom:6pt;margin-bottom:12pt;letter-spacing:.15em;font-size:9pt}.marca-tpc{border:1.5pt solid #C8C3BB;padding:0 4pt;font-weight:bold}';
  function exportar(html, nome) {
    const doc = '<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40"><head><meta charset="utf-8"><title>' + esc(nome) + "</title><style>" + CSS + "</style></head><body>" + html + "</body></html>";
    const blob = new Blob(["﻿", doc], { type: "application/msword" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = nome + ".doc"; document.body.appendChild(a); a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  }
  function copiar(txt) {
    const ok = () => window.HUB.toast("Texto copiado.");
    const fb = () => { const t = document.createElement("textarea"); t.value = txt; document.body.appendChild(t); t.select(); try { document.execCommand("copy"); ok(); } catch (e) { window.HUB.toast("Não foi possível copiar."); } t.remove(); };
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(txt).then(ok, fb); else fb();
  }
  function imprimir() { document.body.classList.add("imprimindo"); window.print(); setTimeout(() => document.body.classList.remove("imprimindo"), 600); }
  function cabecalho(titulo, dados) {
    const hoje = new Date().toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" });
    const linhas = (dados || []).filter(x => x[1]);
    return '<div class="rel-cab"><span class="marca-tpc">TPC</span> ADVOGADOS · HUB CRIMINAL · ' + esc(hoje) + "</div><h2>" + esc(titulo) + "</h2>" +
      (linhas.length ? "<table>" + linhas.map(([k, v]) => '<tr><th style="width:30%">' + esc(k) + "</th><td>" + esc(v) + "</td></tr>").join("") + "</table>" : "");
  }
  window.HUB_DOC = { exportar, copiar, imprimir, cabecalho, esc };
})();
