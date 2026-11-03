/* Análise complementar opcional com a API do Claude (Anthropic).
   Desligada por padrão. Só envia trechos dos autos quando o usuário fornece a própria chave e confirma o envio.
   Chamada HTTP direta, pois o site é estático e não possui etapa de build para o SDK. */
(function () {
  "use strict";
  const R = window.CC_REGRAS, M = window.CC_MOTOR;
  const URL_API = "https://api.anthropic.com/v1/messages";
  const MODELOS = [
    { id: "claude-opus-5-5", rot: "Claude Opus 5.5 (recomendado)", entrada: 4, saida: 20, fallback: true },
    { id: "claude-sonnet-5-5", rot: "Claude Sonnet 5.5 (mais econômico)", entrada: 2, saida: 10, fallback: true },
    { id: "claude-haiku-5-5", rot: "Claude Haiku 5.5 (triagem rápida)", entrada: 0.1, saida: 0.5, fallback: false }
  ];
  const PECAS_RELEVANTES = new Set(["apreensao", "flagrante", "bo", "constatacao", "laudo", "requisicao", "custodia", "relatorio", "decisao", "degravacao"]);

  function selecionarPaginas(est, limite) {
    const ativos = est.res.categorias.filter(c => c.ativo);
    const relevantes = new Set();
    for (const c of ativos) for (const g of c.paginas) relevantes.add(g);
    for (const a of est.res.alertas) for (const e of a.ev) relevantes.add(e.gid);
    for (const p of est.paginas) if (p.peca && PECAS_RELEVANTES.has(p.peca)) relevantes.add(p.gid);
    const lista = est.paginas.filter(p => relevantes.has(p.gid));
    let total = 0; const out = [];
    for (const p of lista) {
      const bloco = "\n[" + p.rot + (p.peca ? " | " + (R.PECAS.find(x => x.id === p.peca) || {}).rot : "") + (p.ocr ? " | OCR " + p.conf + "%" : "") + "]\n" + p.texto + "\n";
      if (total + bloco.length > limite) break;
      out.push(bloco); total += bloco.length;
    }
    return { texto: out.join(""), paginas: out.length, de: lista.length, chars: total };
  }

  const SCHEMA = {
    type: "object",
    properties: {
      sintese: { type: "string" },
      achados: {
        type: "array",
        items: {
          type: "object",
          properties: {
            categoria: { type: "string" },
            criterio: { type: "string" },
            status: { type: "string", enum: ["conforme", "irregular", "ausente", "controverso"] },
            paginas: { type: "array", items: { type: "string" } },
            fundamentacao: { type: "string" },
            trecho: { type: "string" }
          },
          required: ["categoria", "criterio", "status", "paginas", "fundamentacao", "trecho"],
          additionalProperties: false
        }
      },
      inconsistencias: {
        type: "array",
        items: {
          type: "object",
          properties: {
            descricao: { type: "string" },
            paginas: { type: "array", items: { type: "string" } },
            gravidade: { type: "string", enum: ["critica", "relevante", "informativa"] }
          },
          required: ["descricao", "paginas", "gravidade"],
          additionalProperties: false
        }
      },
      estrategia: { type: "string" },
      diligencias: { type: "array", items: { type: "string" } }
    },
    required: ["sintese", "achados", "inconsistencias", "estrategia", "diligencias"],
    additionalProperties: false
  };

  const SISTEMA = "Você atua como assistente técnico de advocacia criminal brasileira, especializado em cadeia de custódia da prova (arts. 158-A a 158-F do CPP), prova digital (ABNT NBR ISO/IEC 27037:2013) e jurisprudência do Superior Tribunal de Justiça. Sua tarefa é examinar trechos de autos de processo penal e verificar, vestígio por vestígio, se cada etapa da cadeia de custódia foi documentada. Baseie cada afirmação exclusivamente no texto fornecido e indique as páginas exatamente como rotuladas nos colchetes (por exemplo, \"p. 12\" ou \"Arq. 2, p. 3\"). Quando um registro não for encontrado, diga que não foi localizado nos trechos enviados, sem afirmar que o ato não existiu. Não invente números de lacre, IMEI, hash, datas ou precedentes. Escreva em português jurídico formal, em parágrafos, sem travessões, com foco nas fragilidades probatórias úteis à defesa, mas sem exageros que não se sustentem nos autos.";

  function montarPedido(est, modelo, limite) {
    const ativos = est.res.categorias.filter(c => c.ativo);
    const linhas = [];
    linhas.push("VESTÍGIOS EM ANÁLISE E CRITÉRIOS (use os identificadores de categoria e de critério abaixo nos achados):");
    for (const c of ativos) {
      const cat = R.CATEGORIAS.find(x => x.id === c.id);
      linhas.push("\nCategoria \"" + cat.id + "\" (" + cat.nome + "):");
      const rc = est.res.criterios[c.id] || {};
      for (const cr of R.CRITERIOS) if (rc[cr.id]) linhas.push("  " + cr.id + " [" + cr.peso + "] " + cr.pergunta + " Situação na triagem automática: " + M.statusFinal(rc[cr.id]) + ".");
    }
    if (est.res.inconsistencias.length) {
      linhas.push("\nINCONSISTÊNCIAS JÁ APONTADAS PELA TRIAGEM AUTOMÁTICA (confirme ou refute):");
      for (const n of est.res.inconsistencias) linhas.push("  " + n.titulo + ": " + n.texto);
    }
    const sel = selecionarPaginas(est, limite);
    linhas.push("\nINSTRUÇÕES: revise a triagem automática à luz do texto; para cada critério relevante, informe o status que o texto efetivamente sustenta, com páginas e trecho literal curto; aponte inconsistências adicionais (datas, lacres, quantidades, identificação de aparelhos, manuseio prévio, acesso sem ordem judicial, prints sem perícia); proponha estratégia defensiva e diligências (requerimentos) cabíveis. Use \"outro\" como critério quando o achado não se enquadrar em nenhum identificador.");
    linhas.push("\nTRECHOS DOS AUTOS (" + sel.paginas + " de " + sel.de + " páginas relevantes):\n" + sel.texto);
    const m = MODELOS.find(x => x.id === modelo) || MODELOS[0];
    const corpo = {
      model: m.id,
      max_tokens: 16000,
      system: SISTEMA,
      output_config: { effort: "high", format: { type: "json_schema", schema: SCHEMA } },
      messages: [{ role: "user", content: linhas.join("\n") }]
    };
    if (m.fallback) corpo.fallbacks = "default";
    return { corpo, sel, modelo: m };
  }

  function estimativa(est, modelo, limite) {
    const { corpo, sel, modelo: m } = montarPedido(est, modelo, limite);
    const chars = JSON.stringify(corpo).length;
    const tokens = Math.round(chars / 3.6);
    const custo = tokens / 1e6 * m.entrada + 8000 / 1e6 * m.saida;
    return { tokens, custo, sel };
  }

  async function executar(est, chave, modelo, limite, sinal) {
    const { corpo, sel, modelo: m } = montarPedido(est, modelo, limite);
    const cab = {
      "content-type": "application/json",
      "x-api-key": chave,
      "anthropic-version": "2026-10-21",
      "anthropic-dangerous-direct-browser-access": "true"
    };
    if (m.fallback) cab["anthropic-beta"] = "server-side-fallback-2026-07-01";
    const resp = await fetch(URL_API, { method: "POST", headers: cab, body: JSON.stringify(corpo), signal: sinal });
    let dados = null;
    try { dados = await resp.json(); } catch (e) { /* corpo vazio */ }
    if (!resp.ok) {
      const msg = dados && dados.error ? dados.error.message : "HTTP " + resp.status;
      const dica = resp.status === 401 ? " Verifique a chave de API." : resp.status === 429 ? " Limite de requisições atingido; aguarde e tente novamente." : resp.status >= 500 ? " Instabilidade no serviço; tente novamente em instantes." : "";
      throw new Error(msg + dica);
    }
    if (dados.stop_reason === "refusal") throw new Error("O modelo recusou a solicitação" + (dados.stop_details && dados.stop_details.explanation ? ": " + dados.stop_details.explanation : "."));
    if (dados.stop_reason === "max_tokens") throw new Error("A resposta excedeu o limite de saída. Reduza o volume de páginas enviadas.");
    const txt = (dados.content || []).filter(b => b.type === "text").map(b => b.text).join("");
    let resultado;
    try { resultado = JSON.parse(txt); } catch (e) { throw new Error("Resposta em formato inesperado."); }
    return { resultado, modelo: dados.model || m.id, uso: dados.usage || null, paginas: sel.paginas, em: new Date().toISOString() };
  }

  window.CC_IA = { MODELOS, estimativa, executar };
})();
