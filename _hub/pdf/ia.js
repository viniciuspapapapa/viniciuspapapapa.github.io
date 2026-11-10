/* IA das ferramentas de PDF (resumir, traduzir e refinar Markdown) pela API da Anthropic, com a chave do próprio usuário,
   guardada apenas no navegador e a mesma das demais ferramentas do HUB. Carregado como módulo. */
import Anthropic from "https://cdn.jsdelivr.net/npm/@anthropic-ai/sdk@1.1.0/+esm";
(function () {
  "use strict";
  const $ = s => document.querySelector(s);
  const ler = k => { try { return localStorage.getItem(k); } catch (e) { return null; } };
  const gravar = (k, v) => { try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch (e) { /* armazenamento indisponível */ } };
  const K_CHAVE = "hub_claude_chave", K_CONS = "pdf_consentimento_anthropic";
  const salva = ler(K_CHAVE); if (salva) { $("#chave").value = salva; $("#lembrarChave").checked = true; }
  $("#consentimento").checked = ler(K_CONS) === "1";
  $("#lembrarChave").onchange = e => gravar(K_CHAVE, e.target.checked ? $("#chave").value.trim() : null);
  $("#chave").oninput = () => { if ($("#lembrarChave").checked) gravar(K_CHAVE, $("#chave").value.trim()); };
  $("#consentimento").onchange = e => gravar(K_CONS, e.target.checked ? "1" : null);

  function erroApi(e) {
    const msg = String(e.message || "");
    if (e instanceof Anthropic.AuthenticationError) return "Chave da API da Anthropic inválida.";
    if (/credit balance/i.test(msg)) return "A conta da Anthropic está sem créditos. Adicione créditos em console.anthropic.com, em Billing.";
    if (e instanceof Anthropic.RateLimitError) return "Limite de uso da API da Anthropic atingido; aguarde alguns minutos.";
    if (e instanceof Anthropic.APIConnectionError) return "Falha de conexão com a API da Anthropic.";
    if (e.status === 529 || e.status === 503) return "A API da Anthropic está sobrecarregada; tente em alguns minutos.";
    return "Erro da API da Anthropic" + (e.status ? " (" + e.status + ")" : "") + (msg ? ": " + msg.replace(/^\d{3}\s*/, "").slice(0, 200) : "") + ".";
  }

  async function gerar({ sistema, usuario, ui, silencioso }) {
    const chave = $("#chave").value.trim();
    if (!chave || !$("#consentimento").checked) { const d = $("#iaOpcoes"); if (d) d.open = true; throw new Error("Informe a chave da API da Anthropic e marque a autorização em Opções de IA."); }
    const cli = new Anthropic({ apiKey: chave, dangerouslyAllowBrowser: true, maxRetries: 3 });
    let txt = "", ultimo = 0;
    try {
      const fluxo = cli.beta.messages.stream({
        model: $("#modelo").value, max_tokens: 64000, thinking: { type: "adaptive" }, output_config: { effort: $("#esforco").value },
        betas: ["server-side-fallback-2026-07-01"], fallbacks: "default", system: sistema, messages: [{ role: "user", content: usuario }]
      });
      for await (const ev of fluxo) {
        if (ev.type === "content_block_start" && ev.content_block.type === "thinking" && !txt && !silencioso) ui.prog("O Claude está analisando o documento…", 0.6);
        if (ev.type === "content_block_delta" && ev.delta.type === "text_delta") { txt += ev.delta.text; if (!silencioso && Date.now() - ultimo > 700) { ultimo = Date.now(); ui.prog("Redigindo: " + Math.round(txt.length / 100) / 10 + " mil caracteres", Math.min(0.97, 0.65 + txt.length / 60000)); } }
      }
      const fim = await fluxo.finalMessage();
      if (fim.stop_reason === "refusal") throw new Error("O modelo recusou processar este documento.");
      if (!txt.trim()) throw new Error("A Anthropic não devolveu texto.");
      return txt.trim();
    } catch (e) {
      if (e instanceof Anthropic.APIError || e instanceof Anthropic.APIConnectionError) throw new Error(erroApi(e));
      throw e;
    }
  }
  window.PDF_IA = { gerar };
})();
