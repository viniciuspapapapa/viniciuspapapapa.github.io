/* Pesquisa em fontes públicas e oficiais por CPF/CNPJ, nome, telefone e placa, com registro de finalidade.
   Consultas diretas quando a fonte permite (BrasilAPI); as demais passam pelo serviço do escritório no Cloudflare
   (sherlock-worker, rotas /publico). Fontes com captcha ou aplicativo aparecem como consultas oficiais prontas. */
(function () {
  "use strict";
  const $ = s => document.querySelector(s), esc = s => window.HUB.esc(s), P = window.TPC_PECA;
  const ler = k => { try { return localStorage.getItem(k); } catch (e) { return null; } };
  const gravar = (k, v) => { try { if (v == null || v === "") localStorage.removeItem(k); else localStorage.setItem(k, v); } catch (e) { /* armazenamento indisponível */ } };
  const CFG = (window.HUB_CONFIG && window.HUB_CONFIG.sherlock) || {}, PADRAO = "https://sherlock-tpc.viniciuspapapapa.workers.dev";
  const dig = s => String(s || "").replace(/\D/g, "");
  const E = { fontes: [], manuais: [], termos: null, quando: null };

  $("#responsavel").innerHTML = '<option value="">Selecione</option>' + P.ADVOGADOS.map(a => "<option>" + esc(a.nome) + "</option>").join("");
  $("#url").value = ler("sherlock_url") || CFG.url || PADRAO; $("#chaveT").value = ler("transparencia_chave") || "";
  $("#url").addEventListener("change", () => gravar("sherlock_url", $("#url").value.trim()));
  $("#chaveT").addEventListener("input", () => gravar("transparencia_chave", $("#chaveT").value.trim()));
  ["#finalidade", "#responsavel"].forEach(s => { const v = ler("pesquisa_" + s.slice(1)); if (v) $(s).value = v; $(s).addEventListener("change", () => gravar("pesquisa_" + s.slice(1), $(s).value)); });

  /* ------------------------------------------------------------------ máscaras e validações */
  $("#doc").addEventListener("input", e => { const d = dig(e.target.value).slice(0, 14); e.target.value = d.length <= 11 ? d.replace(/(\d{3})(\d)/, "$1.$2").replace(/(\d{3})\.(\d{3})(\d)/, "$1.$2.$3").replace(/(\d{3})-?(\d{1,2})$/, "$1-$2").replace(/^(\d{3}\.\d{3}\.\d{3})(\d)/, "$1-$2") : d.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{0,2}).*/, "$1.$2.$3/$4-$5"); });
  $("#placa").addEventListener("input", e => { e.target.value = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 7); });
  function cpfValido(c) { c = dig(c); if (c.length !== 11 || /^(\d)\1{10}$/.test(c)) return false; for (let t = 9; t < 11; t++) { let s = 0; for (let i = 0; i < t; i++) s += +c[i] * (t + 1 - i); if (((s * 10) % 11) % 10 !== +c[t]) return false; } return true; }
  function cnpjValido(c) { c = dig(c); if (c.length !== 14 || /^(\d)\1{13}$/.test(c)) return false; const calc = n => { let s = 0, p = n - 7; for (let i = 0; i < n; i++) { s += +c[i] * p--; if (p < 2) p = 9; } const r = s % 11; return r < 2 ? 0 : 11 - r; }; return calc(12) === +c[12] && calc(13) === +c[13]; }
  const REGIAO = ["RS", "DF, GO, MS, MT e TO", "AC, AM, AP, PA, RO e RR", "CE, MA e PI", "AL, PB, PE e RN", "BA e SE", "MG", "ES e RJ", "SP", "PR e SC"];
  const DDD = { 11: "SP", 12: "SP", 13: "SP", 14: "SP", 15: "SP", 16: "SP", 17: "SP", 18: "SP", 19: "SP", 21: "RJ", 22: "RJ", 24: "RJ", 27: "ES", 28: "ES", 31: "MG", 32: "MG", 33: "MG", 34: "MG", 35: "MG", 37: "MG", 38: "MG", 41: "PR", 42: "PR", 43: "PR", 44: "PR", 45: "PR", 46: "PR", 47: "SC", 48: "SC", 49: "SC", 51: "RS", 53: "RS", 54: "RS", 55: "RS", 61: "DF", 62: "GO", 63: "TO", 64: "GO", 65: "MT", 66: "MT", 67: "MS", 68: "AC", 69: "RO", 71: "BA", 73: "BA", 74: "BA", 75: "BA", 77: "BA", 79: "SE", 81: "PE", 82: "AL", 83: "PB", 84: "RN", 85: "CE", 86: "PI", 87: "PE", 88: "CE", 89: "PI", 91: "PA", 92: "AM", 93: "PA", 94: "PA", 95: "RR", 96: "AP", 97: "AM", 98: "MA", 99: "MA" };
  const mascCpf = c => "***." + c.slice(3, 6) + "." + c.slice(6, 9) + "-**";

  /* ------------------------------------------------------------------ acesso às fontes */
  const servico = () => ($("#url").value.trim() || PADRAO).replace(/\/+$/, "");
  async function viaServico(caminho, params, extra) {
    const u = new URL(servico() + caminho); Object.entries(params).forEach(([k, v]) => { if (v) u.searchParams.set(k, v); });
    const h = {}; const tok = ler("sherlock_token") || CFG.token; if (tok) h["X-App-Token"] = tok; Object.assign(h, extra || {});
    const r = await fetch(u.href, { headers: h }); const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.erro || "Serviço de consulta indisponível (" + r.status + ").");
    if (j.erro && !j.dados) throw new Error(j.http === 403 ? "A fonte bloqueou a consulta (" + j.erro + ")." : j.http === 401 ? "Chave do Portal da Transparência inválida." : j.erro);
    return j;
  }
  async function direto(url) { const r = await fetch(url, { headers: { Accept: "application/json" } }); if (!r.ok) throw Object.assign(new Error("HTTP " + r.status), { http: r.status }); return r.json(); }
  async function transp(rota, params) { const ch = $("#chaveT").value.trim(); return (await viaServico("/publico/transparencia", Object.assign({ rota }, params), ch ? { "X-Transparencia-Chave": ch } : {})).dados; }

  /* ------------------------------------------------------------------ montagem das consultas */
  const hoje = () => new Date();
  function tarefas(t) {
    const L = [], temChave = !!$("#chaveT").value.trim();
    const T = (titulo, base, fn) => L.push({ titulo, base, fn });
    if (t.cpf) {
      T("CPF: validação e região fiscal", "Cálculo dos dígitos verificadores (Receita Federal)", async () => ({ dl: [["CPF", t.cpfFmt], ["Dígitos verificadores", cpfValido(t.cpf) ? "válidos" : "inválidos"], ["Região fiscal de emissão", REGIAO[+t.cpf[8]] + " (pelo 9º dígito)"]], vazio: false }));
      if (temChave) {
        T("Portal da Transparência: cadastro da pessoa física", "CGU, API de dados, pessoa-fisica", async () => { const d = await transp("pessoa-fisica", { cpf: t.cpf }); const o = Array.isArray(d) ? d[0] : d; if (!o || !o.nome) return { vazio: true }; const v = Object.entries(o).filter(([k, x]) => x === true).map(([k]) => VINC[k] || k); return { dl: [["Nome", o.nome], ["NIS", o.nis || "não informado"], ["Vínculos com recursos públicos", v.length ? v.join("; ") : "nenhum"]], nome: o.nome }; });
        T("Servidor público federal (por CPF)", "CGU, API de dados, servidores", async () => lista(await transp("servidores", { cpf: t.cpf }), servidor));
        T("Pessoa politicamente exposta (por CPF)", "CGU, API de dados, peps", async () => lista(await transp("peps", { cpf: t.cpf }), pep));
        T("Sanções CEIS e CNEP (por CPF)", "CGU, cadastros de inidôneos e punidos", async () => lista((await transp("ceis", { codigoSancionado: t.cpf })).concat(await transp("cnep", { codigoSancionado: t.cpf })), sancao));
        T("Expulsões da Administração Federal, CEAF (por CPF)", "CGU, API de dados, ceaf", async () => lista(await transp("ceaf", { cpfSancionado: t.cpf }), sancao));
      }
    }
    if (t.cnpj) {
      T("Empresa: cadastro na Receita Federal", "Receita Federal, dados abertos do CNPJ, via BrasilAPI", async () => {
        const d = await direto("https://brasilapi.com.br/api/cnpj/v1/" + t.cnpj);
        const end = [[d.descricao_tipo_de_logradouro, d.logradouro].filter(Boolean).join(" "), d.numero, d.complemento, d.bairro, d.municipio + "/" + d.uf, "CEP " + d.cep].filter(Boolean).join(", ");
        return { dl: [["Razão social", d.razao_social], ["Nome fantasia", d.nome_fantasia || "não informado"], ["Situação", d.descricao_situacao_cadastral + (d.data_situacao_cadastral ? " desde " + br(d.data_situacao_cadastral) : "")], ["Abertura", br(d.data_inicio_atividade)], ["Atividade principal", d.cnae_fiscal_descricao], ["Natureza jurídica", d.natureza_juridica], ["Capital social", (+d.capital_social || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })], ["Endereço", end], ["Telefone", [d.ddd_telefone_1, d.ddd_telefone_2].filter(Boolean).join(" / ") || "não informado"], ["E-mail", d.email || "não informado"]],
          itens: (d.qsa || []).map(s => ({ t: s.nome_socio, s: [s.qualificacao_socio, s.cnpj_cpf_do_socio, s.data_entrada_sociedade ? "desde " + br(s.data_entrada_sociedade) : "", s.faixa_etaria].filter(Boolean).join(" · ") })), rotItens: "Quadro de sócios e administradores" };
      });
      if (temChave) {
        T("Sanções da empresa: CEIS, CNEP e CEPIM", "CGU, cadastros de sanções", async () => lista((await transp("ceis", { codigoSancionado: t.cnpj })).concat(await transp("cnep", { codigoSancionado: t.cnpj }), await transp("cepim", { cnpjSancionado: t.cnpj })), sancao));
      }
    }
    if (t.nome) {
      T("Comunicações processuais (Diário de Justiça Eletrônico Nacional)", "CNJ, DJEN, busca pelo nome da parte", async () => {
        let d; const qs = "nomeParte=" + encodeURIComponent(t.nome) + "&pagina=1&itensPorPagina=100";
        try { d = await direto("https://comunicaapi.pje.jus.br/api/v1/comunicacao?" + qs); } catch (e) { d = (await viaServico("/publico/djen", { nome: t.nome })).dados; }
        const itens = (d && (d.items || d.itens || d.content || d.data)) || [];
        const proc = new Set();
        const out = itens.map(c => { const n = c.numeroprocessocommascara || c.numero_processo || c.numeroProcesso || ""; proc.add(n); const dest = (c.destinatarios || []).map(x => x.nome + (x.polo ? " (" + x.polo + ")" : "")).join("; "); return { t: [n, c.siglaTribunal, c.nomeClasse].filter(Boolean).join(" · "), s: [br(c.data_disponibilizacao || c.dataDisponibilizacao), c.tipoComunicacao, c.nomeOrgao].filter(Boolean).join(" · "), x: [dest ? "Partes: " + dest : "", limpa(c.texto).slice(0, 360)].filter(Boolean).join(" — "), link: c.link }; });
        return { itens: out, vazio: !out.length, resumo: out.length ? out.length + " comunicações em " + proc.size + " processos" + ((d.count || 0) > out.length ? " (exibidas as " + out.length + " mais recentes de " + d.count + ")" : "") : "" };
      });
      T("Diários oficiais municipais", "Querido Diário (Open Knowledge Brasil)", async () => {
        const qs = "querystring=" + encodeURIComponent('"' + t.nome + '"') + "&excerpt_size=400&number_of_excerpts=2&size=30&sort_by=descending_date";
        let d; try { d = await direto("https://api.queridodiario.ok.org.br/gazettes?" + qs); } catch (e) { d = (await viaServico("/publico/diarios", { q: t.nome })).dados; }
        const g = (d && d.gazettes) || [];
        return { itens: g.map(x => ({ t: x.territory_name + "/" + x.state_code, s: br(x.date), x: (x.excerpts || []).map(limpa).join(" … ").slice(0, 500), link: x.url })), vazio: !g.length, resumo: g.length ? (d.total_gazettes || g.length) + ((d.total_gazettes || g.length) === 1 ? " edição com o nome" : " edições com o nome") : "" };
      });
      if (temChave) {
        T("Servidor público federal (por nome)", "CGU, API de dados, servidores", async () => lista(await transp("servidores", { nome: t.nome }), servidor));
        T("Pessoa politicamente exposta (por nome)", "CGU, API de dados, peps", async () => lista(await transp("peps", { nome: t.nome }), pep));
        T("Sanções CEIS, CNEP e CEAF (por nome)", "CGU, cadastros de sanções", async () => lista((await transp("ceis", { nomeSancionado: t.nome })).concat(await transp("cnep", { nomeSancionado: t.nome }), await transp("ceaf", { nomeSancionado: t.nome })), sancao));
      }
    }
    if (t.tel) {
      T("Telefone: DDD, região e tipo de linha", "Plano de numeração da Anatel; municípios pela BrasilAPI", async () => {
        const ddd = t.tel.slice(0, 2), num = t.tel.slice(2), cel = num.length === 9 && num[0] === "9";
        let cidades = []; try { cidades = (await direto("https://brasilapi.com.br/api/ddd/v1/" + ddd)).cities || []; } catch (e) { cidades = []; }
        return { dl: [["Número", "(" + ddd + ") " + num.replace(/(\d{4,5})(\d{4})$/, "$1-$2")], ["Estado", DDD[+ddd] || "DDD inexistente"], ["Tipo", cel ? "Celular" : num.length === 8 ? "Fixo" : "Formato não reconhecido"], ["Municípios do DDD", cidades.length ? cidades.length + " municípios, entre eles " + cidades.slice(0, 8).map(c => c.charAt(0) + c.slice(1).toLowerCase()).join(", ") : "não consultado"]] };
      });
    }
    if (t.placa) {
      T("Placa: padrão e correspondência", "Resolução Contran 780/2019 (padrão Mercosul)", async () => {
        const p = t.placa, antigo = /^[A-Z]{3}\d{4}$/.test(p), merc = /^[A-Z]{3}\d[A-Z]\d{2}$/.test(p);
        const conv = antigo ? p.slice(0, 4) + "ABCDEFGHIJ"[+p[4]] + p.slice(5) : merc ? p.slice(0, 4) + "ABCDEFGHIJ".indexOf(p[4]) + p.slice(5) : "";
        return { dl: [["Placa", p], ["Padrão", antigo ? "Antigo (cinza)" : merc ? "Mercosul" : "Formato inválido"], ["Correspondente no outro padrão", conv || "não se aplica"]] };
      });
    }
    return L;
  }
  const VINC = { favorecidoDespesas: "favorecido em despesas públicas", servidor: "servidor público", servidorInativo: "servidor inativo", pensionistaOuRepresentante: "pensionista ou representante", beneficiarioDiarias: "beneficiário de diárias", participanteLicitacao: "participante de licitação", contratado: "contratado pelo poder público", sancionadoCEIS: "sancionado no CEIS", sancionadoCNEP: "sancionado no CNEP", sancionadoCEAF: "sancionado no CEAF", permissionario: "permissionário", portadorCPGF: "portador de cartão de pagamento do governo", portadorCPDC: "portador de cartão de defesa civil", favorecidoTransferencias: "favorecido em transferências", favorecidoBolsaFamilia: "Bolsa Família", favorecidoAuxilioEmergencial: "auxílio emergencial", favorecidoSafra: "Garantia-Safra", favorecidoBPC: "BPC", favorecidoPeti: "PETI", favorecidoSeguroDefeso: "Seguro-Defeso", emitenteNfe: "emitente de nota fiscal", instituidorPensao: "instituidor de pensão" };
  const g = (o, ...ks) => { for (const k of ks) { const v = k.split(".").reduce((a, c) => a && a[c], o); if (v != null && v !== "") return v; } return ""; };
  const servidor = o => ({ t: g(o, "servidor.pessoa.nome", "pessoa.nome", "nome"), s: [g(o, "servidor.situacao", "situacao"), g(o, "fichasCargoEfetivo.0.orgaoServidorLotacao", "fichasCargoEfetivo.0.uorgLotacao", "servidor.orgaoServidorLotacao.nome"), g(o, "fichasCargoEfetivo.0.cargo", "fichasFuncao.0.funcao")].filter(Boolean).join(" · ") });
  const pep = o => ({ t: g(o, "nome"), s: [g(o, "descricao_funcao", "descricaoFuncao"), g(o, "nome_orgao", "orgaoServidorLotacao"), g(o, "dt_inicio_exercicio", "dataInicioExercicio") && "desde " + g(o, "dt_inicio_exercicio", "dataInicioExercicio")].filter(Boolean).join(" · ") });
  const sancao = o => ({ t: g(o, "sancionado.nome", "pessoa.nome", "punicao.nomeSancionado", "nomeSancionado", "pessoa.razaoSocialReceita"), s: [g(o, "tipoSancao.descricaoResumida", "tipoPunicao.descricao", "tipoSancao.descricaoPortal"), g(o, "orgaoSancionador.nome", "orgaoLotacao.nome"), g(o, "dataInicioSancao", "dataPublicacao") && "início " + g(o, "dataInicioSancao", "dataPublicacao"), g(o, "dataFimSancao") && "fim " + g(o, "dataFimSancao")].filter(Boolean).join(" · ") });
  const lista = (arr, f) => { const a = Array.isArray(arr) ? arr : arr ? [arr] : []; return { itens: a.map(f).filter(x => x.t || x.s), vazio: !a.length }; };
  const br = d => { if (!d) return ""; const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(d); return m ? m[3] + "/" + m[2] + "/" + m[1] : d; };
  const limpa = s => String(s || "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();

  function manuais(t) {
    const M = [], q = s => encodeURIComponent(s), G = s => "https://www.google.com/search?q=" + q(s);
    if (t.cpf) M.push({ id: "receita-cpf", t: "Situação cadastral do CPF (Receita Federal)", d: "Exige a data de nascimento e captcha.", url: "https://servicos.receita.fazenda.gov.br/servicos/cpf/consultasituacao/consultapublica.asp", copiar: t.cpfFmt });
    if (t.cnpj) M.push({ id: "receita-cnpj", t: "Comprovante de inscrição do CNPJ (Receita Federal)", d: "Documento oficial com captcha.", url: "https://solucoes.receita.fazenda.gov.br/servicos/cnpjreva/cnpjreva_solicitacao.asp", copiar: t.cnpjFmt });
    if (t.nome || t.cpf) M.push({ id: "bnmp", t: "Mandados de prisão (BNMP, CNJ)", d: "Pesquisa pelo nome ou CPF.", url: "https://portalbnmp.cnj.jus.br/#/pesquisa-peca", copiar: t.nome || t.cpfFmt });
    if (t.nome || t.cpf) M.push({ id: "certidoes", t: "Certidões criminais (Central do HUB)", d: "Todos os tribunais, com os dados prontos para colar.", url: "../certidoes/", copiar: t.nome || t.cpfFmt, interno: true });
    if (t.nome) {
      M.push({ id: "djen", t: "Diário de Justiça Eletrônico Nacional (portal)", d: "Conferência no portal oficial do CNJ.", url: "https://comunica.pje.jus.br/", copiar: t.nome });
      M.push({ id: "tse", t: "Candidaturas e contas eleitorais (TSE)", d: "Candidatos, bens declarados e doações.", url: "https://divulgacandcontas.tse.jus.br/divulga/#/home", copiar: t.nome });
      M.push({ id: "cna", t: "Cadastro Nacional dos Advogados (OAB)", d: "Se a pessoa for advogada.", url: "https://cna.oab.org.br/", copiar: t.nome });
      M.push({ id: "busca-processos", t: "Processos e publicações (buscadores)", d: "Jusbrasil e Escavador pelo nome exato.", url: G('"' + t.nome + '" (site:jusbrasil.com.br OR site:escavador.com)'), copiar: t.nome });
      M.push({ id: "busca-geral", t: "Busca aberta pelo nome", d: "Notícias, perfis profissionais e redes.", url: G('"' + t.nome + '"'), copiar: t.nome });
      M.push({ id: "perfis", t: "Perfis por nome de usuário (HUB)", d: "Use um apelido ou usuário conhecido.", url: "../usuarios/", copiar: t.nome.split(/\s+/)[0].toLowerCase(), interno: true });
    }
    if (t.cpf) M.push({ id: "busca-cpf", t: "Busca aberta pelo CPF", d: "Publicações oficiais que trazem o CPF.", url: G('"' + t.cpfFmt + '"'), copiar: t.cpfFmt });
    if (t.tel) {
      M.push({ id: "abr", t: "Operadora e portabilidade (ABR Telecom)", d: "Consulta oficial do número, com captcha.", url: "https://consultanumero.abrtelecom.com.br/consultanumero/consulta/consultaSituacaoAtualCtg", copiar: t.tel });
      M.push({ id: "whatsapp", t: "WhatsApp", d: "Abre a conversa e mostra se o número usa o aplicativo.", url: "https://wa.me/55" + t.tel, copiar: t.tel });
      M.push({ id: "busca-tel", t: "Busca aberta pelo telefone", d: "Anúncios, empresas e publicações com o número.", url: G('"' + t.tel.replace(/^(\d{2})(\d{4,5})(\d{4})$/, "$2-$3") + '" OR "' + t.tel + '"'), copiar: t.tel });
    }
    if (t.placa) {
      M.push({ id: "sinesp", t: "Sinesp Cidadão (aplicativo oficial)", d: "Marca, modelo, cor, ano, município e alerta de roubo ou furto.", url: "https://www.gov.br/pt-br/apps/sinesp-cidadao", copiar: t.placa });
      M.push({ id: "busca-placa", t: "Busca aberta pela placa", d: "Anúncios de venda e notícias.", url: G('"' + t.placa + '"'), copiar: t.placa });
    }
    return M;
  }

  /* ------------------------------------------------------------------ execução */
  function termos() {
    const d = dig($("#doc").value), nome = $("#nome").value.trim().replace(/\s+/g, " "), tel = dig($("#tel").value).replace(/^55(?=\d{10,11}$)/, "").replace(/^0/, ""), placa = $("#placa").value.trim().toUpperCase();
    const t = { cpf: "", cnpj: "", nome: nome.split(" ").length >= 2 ? nome : "", tel: tel.length >= 10 && tel.length <= 11 ? tel : "", placa: placa.length === 7 ? placa : "" };
    if (d.length === 11) { t.cpf = d; t.cpfFmt = d.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4"); }
    if (d.length === 14) { t.cnpj = d; t.cnpjFmt = d.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5"); }
    return t;
  }
  function prog(m, fr) { $("#progresso").textContent = m || ""; $("#barra").hidden = fr == null; if (fr != null) $("#barra i").style.width = Math.round(fr * 100) + "%"; }
  $("#pesquisar").onclick = async () => {
    const t = termos(), avisos = [];
    if (!$("#finalidade").value || !$("#caso").value.trim() || !$("#responsavel").value) { $("#estado").textContent = "Informe a finalidade, o processo ou caso e o responsável."; window.scrollTo({ top: 0, behavior: "smooth" }); return; }
    if ($("#doc").value && !t.cpf && !t.cnpj) avisos.push("o CPF ou CNPJ deve ter 11 ou 14 dígitos");
    if (t.cpf && !cpfValido(t.cpf)) avisos.push("os dígitos do CPF não conferem");
    if (t.cnpj && !cnpjValido(t.cnpj)) avisos.push("os dígitos do CNPJ não conferem");
    if ($("#nome").value.trim() && !t.nome) avisos.push("informe o nome completo, com sobrenome");
    if ($("#tel").value && !t.tel) avisos.push("o telefone deve ter DDD e número");
    if ($("#placa").value && !t.placa) avisos.push("a placa deve ter 7 caracteres");
    if (!t.cpf && !t.cnpj && !t.nome && !t.tel && !t.placa) { $("#estado").textContent = "Preencha ao menos um dado para pesquisar" + (avisos.length ? ": " + avisos.join("; ") : ".") ; return; }
    $("#estado").textContent = avisos.length ? "Atenção: " + avisos.join("; ") + "." : "";
    E.termos = t; E.quando = hoje(); E.fontes = []; E.manuais = manuais(t).map(m => Object.assign(m, { feito: false }));
    $("#pesquisar").disabled = true; $("#resBloco").hidden = false; desenharManuais();
    const L = tarefas(t); let n = 0;
    if (!$("#chaveT").value.trim() && (t.cpf || t.cnpj || t.nome)) E.fontes.push({ titulo: "Portal da Transparência (CGU)", base: "Servidores, PEP, sanções e vínculos", status: "config", msg: "Não consultado: informe a chave gratuita da API em Configuração das fontes.", quando: hoje() });
    await Promise.all(L.map(async f => {
      const reg = { titulo: f.titulo, base: f.base, status: "carregando", quando: null }; E.fontes.push(reg); desenhar();
      try { const r = await f.fn(); Object.assign(reg, r, { status: r.vazio && !r.dl ? "vazio" : "ok", quando: hoje() }); if (r.nome && !t.nome) reg.sugestao = r.nome; }
      catch (e) { Object.assign(reg, { status: "erro", msg: e.message || String(e), quando: hoje() }); }
      n++; prog("Consultando as fontes: " + n + " de " + L.length, n / L.length); desenhar();
    }));
    prog("Pesquisa concluída em " + E.quando.toLocaleString("pt-BR") + ".", null); $("#pesquisar").disabled = false;
    historico(t); desenhar();
  };

  /* ------------------------------------------------------------------ exibição */
  const TAG = { ok: ["ok", "Com resultados"], vazio: ["na", "Nada consta"], erro: ["bad", "Falha na consulta"], config: ["warn", "Configurar"], carregando: ["info", "Consultando"] };
  function desenhar() {
    const ord = ["ok", "vazio", "erro", "config", "carregando"];
    const fs = E.fontes.slice().sort((a, b) => ord.indexOf(a.status) - ord.indexOf(b.status));
    $("#resumo").textContent = "Pesquisa de " + E.quando.toLocaleString("pt-BR") + " · " + $("#finalidade").value + " · " + $("#caso").value.trim() + " · " + E.fontes.filter(f => f.status === "ok").length + " fontes com resultados";
    $("#fontes").innerHTML = fs.map(f => {
      const [cl, rot] = TAG[f.status];
      return '<div class="fonte"><div class="fonte-cab"><h3>' + esc(f.titulo) + ' <span class="tag ' + cl + '">' + rot + "</span></h3><small>" + (f.quando ? f.quando.toLocaleTimeString("pt-BR") : "") + "</small></div>" +
        '<p class="pequeno mudo" style="margin:2px 0 6px">' + esc(f.base) + "</p>" + (f.msg ? "<p>" + esc(f.msg) + "</p>" : "") + (f.resumo ? "<p><b>" + esc(f.resumo) + "</b></p>" : "") +
        (f.dl ? '<dl class="dl">' + f.dl.map(([a, b]) => "<dt>" + esc(a) + "</dt><dd>" + esc(b) + "</dd>").join("") + "</dl>" : "") +
        (f.sugestao ? '<p><button type="button" class="btn sec peq" data-nome="' + esc(f.sugestao) + '">Pesquisar também pelo nome ' + esc(f.sugestao) + "</button></p>" : "") +
        (f.itens && f.itens.length ? (f.rotItens ? '<p class="pequeno" style="margin-top:10px"><b>' + esc(f.rotItens) + "</b></p>" : "") + '<div class="itens">' + f.itens.slice(0, 60).map(i => '<div class="item"><b>' + esc(i.t || "") + "</b>" + (i.s ? '<div class="pequeno mudo">' + esc(i.s) + "</div>" : "") + (i.x ? '<div class="trecho">' + esc(i.x) + "</div>" : "") + (i.link ? '<div class="pequeno"><a href="' + esc(i.link) + '" target="_blank" rel="noopener noreferrer">Abrir na fonte</a></div>' : "") + "</div>").join("") + "</div>" + (f.itens.length > 60 ? '<p class="pequeno mudo">Exibidos 60 de ' + f.itens.length + "; todos constam do relatório.</p>" : "") : "") + "</div>";
    }).join("");
    document.querySelectorAll("[data-nome]").forEach(b => { b.onclick = () => { $("#nome").value = b.dataset.nome; $("#pesquisar").click(); }; });
  }
  function desenharManuais() {
    $("#manuais").innerHTML = E.manuais.map((m, i) => '<div class="manual"><b>' + esc(m.t) + '</b><span class="mudo">' + esc(m.d) + '</span><span class="mono">' + esc(m.copiar || "") + '</span><div class="linha-btns"><a class="btn sec peq" href="' + esc(m.url) + '"' + (m.interno ? "" : ' target="_blank" rel="noopener noreferrer"') + ' data-abrir="' + i + '">Abrir</a><button type="button" class="btn sec peq" data-copiar="' + i + '">Copiar dado</button><label class="check" style="font-size:13.5px"><input type="checkbox" data-feito="' + i + '"' + (m.feito ? " checked" : "") + "> Consultado</label></div></div>").join("");
    document.querySelectorAll("[data-copiar]").forEach(b => { b.onclick = async () => { try { await navigator.clipboard.writeText(E.manuais[+b.dataset.copiar].copiar || ""); window.HUB.toast("Copiado."); } catch (e) { window.HUB.toast("Não foi possível copiar."); } }; });
    document.querySelectorAll("[data-feito]").forEach(c => { c.onchange = () => { const m = E.manuais[+c.dataset.feito]; m.feito = c.checked; m.quando = c.checked ? hoje() : null; }; });
    document.querySelectorAll("[data-abrir]").forEach(a => { a.addEventListener("click", () => { const m = E.manuais[+a.dataset.abrir]; if (m.copiar) navigator.clipboard && navigator.clipboard.writeText(m.copiar).catch(() => {}); }); });
  }

  /* ------------------------------------------------------------------ histórico (dados mascarados) */
  function historico(t) {
    let h = []; try { h = JSON.parse(ler("pesquisa_historico") || "[]"); } catch (e) { h = []; }
    h.unshift({ quando: E.quando.toISOString(), finalidade: $("#finalidade").value, caso: $("#caso").value.trim(), responsavel: $("#responsavel").value, termos: [t.cpf && "CPF " + mascCpf(t.cpf), t.cnpj && "CNPJ " + t.cnpjFmt, t.nome && t.nome, t.tel && "tel. " + t.tel.slice(0, 2) + "****" + t.tel.slice(-2), t.placa && "placa " + t.placa].filter(Boolean).join(", ") });
    gravar("pesquisa_historico", JSON.stringify(h.slice(0, 200))); mostrarHist();
  }
  function mostrarHist() {
    let h = []; try { h = JSON.parse(ler("pesquisa_historico") || "[]"); } catch (e) { h = []; }
    $("#historico").innerHTML = h.length ? '<div style="overflow-x:auto"><table class="hist"><thead><tr><th>Data</th><th>Finalidade</th><th>Caso</th><th>Responsável</th><th>Dados</th></tr></thead><tbody>' + h.map(x => "<tr><td>" + new Date(x.quando).toLocaleString("pt-BR") + "</td><td>" + esc(x.finalidade) + "</td><td>" + esc(x.caso) + "</td><td>" + esc(x.responsavel) + "</td><td>" + esc(x.termos) + "</td></tr>").join("") + '</tbody></table></div><p class="pequeno mudo">Os dados pessoais aparecem mascarados no histórico.</p><button type="button" class="btn sec peq" id="limparHist">Apagar o histórico</button>' : '<p class="pequeno mudo">Nenhuma pesquisa registrada.</p>';
    const b = $("#limparHist"); if (b) b.onclick = () => { if (confirm("Apagar o histórico de pesquisas deste navegador?")) { gravar("pesquisa_historico", null); mostrarHist(); } };
  }
  mostrarHist();

  /* ------------------------------------------------------------------ relatório */
  $("#relatorio").onclick = async () => {
    const t = E.termos; if (!t) return;
    const b = [{ t: "tit", texto: "RELATÓRIO DE PESQUISA EM FONTES PÚBLICAS" }];
    b.push({ t: "tab", larg: [1.4, 3], linhas: [["Finalidade", $("#finalidade").value], ["Processo ou caso", $("#caso").value.trim()], ["Responsável", $("#responsavel").value], ["Data e hora", E.quando.toLocaleString("pt-BR")], ["Dados pesquisados", [t.cpf && "CPF " + t.cpfFmt, t.cnpj && "CNPJ " + t.cnpjFmt, t.nome && "Nome: " + t.nome, t.tel && "Telefone: " + t.tel, t.placa && "Placa: " + t.placa].filter(Boolean).join("; ")]] });
    b.push({ t: "h", texto: "Base legal e metodologia" });
    b.push({ t: "p", r: "A pesquisa foi realizada exclusivamente em fontes públicas e oficiais, para o exercício regular de direitos em processo judicial ou administrativo (Lei 13.709/2018, art. 7º, VI, e art. 11, II, “d”), no âmbito da investigação defensiva (Provimento 188/2018 do Conselho Federal da OAB). Não foram utilizadas bases de dados obtidas ilicitamente, o que preserva a licitude dos elementos colhidos (CPP, art. 157)." });
    b.push({ t: "p", r: "Os resultados indicam registros associados aos dados pesquisados, mas a coincidência de nome não comprova identidade. Antes do uso processual, os registros relevantes devem ser conferidos na fonte original e, quando necessário, preservados por certidão, ata notarial (CPC, art. 384) ou coleta com cadeia de custódia (CPP, arts. 158-A a 158-F)." });
    b.push({ t: "h", texto: "Resultados por fonte" });
    E.fontes.forEach(f => {
      b.push({ t: "sub", texto: f.titulo });
      b.push({ t: "p", r: [[(TAG[f.status] || ["", ""])[1] + ". ", "bo"], ["Fonte: " + f.base + ". Consulta em " + (f.quando ? f.quando.toLocaleString("pt-BR") : "") + "." + (f.msg ? " " + f.msg : "") + (f.resumo ? " " + f.resumo + "." : ""), "n"]], recuo: false });
      if (f.dl) b.push({ t: "tab", larg: [1.4, 3], linhas: f.dl.map(([a, v]) => [a, String(v)]) });
      if (f.itens && f.itens.length) b.push({ t: "tab", cab: [f.rotItens || "Registro", "Detalhes"], larg: [1.6, 3.4], linhas: f.itens.slice(0, 200).map(i => [i.t || "", [i.s, i.x, i.link].filter(Boolean).join(" — ")]) });
    });
    const feitos = E.manuais.filter(m => m.feito);
    b.push({ t: "h", texto: "Consultas oficiais com verificação humana" });
    b.push({ t: "p", r: feitos.length ? "Foram realizadas manualmente, nos portais oficiais, as consultas a seguir, cujos resultados devem ser juntados por certidão ou captura de tela." : "Nenhuma consulta manual foi marcada como realizada. As consultas indicadas para os dados pesquisados constam abaixo." });
    b.push({ t: "tab", cab: ["Consulta", "Endereço", "Situação"], larg: [1.8, 2.6, 1.0], linhas: E.manuais.map(m => [m.t, m.interno ? "HUB TPC" : m.url, m.feito ? "Consultada em " + m.quando.toLocaleString("pt-BR") : "Indicada"]) });
    b.push({ t: "data", texto: "Belo Horizonte, " + P.dataExtenso(E.quando) + "." });
    const adv = P.ADVOGADOS.find(a => a.nome === $("#responsavel").value); if (adv) b.push({ t: "ass", nome: adv.nome, linhas: ["OAB/" + adv.uf + " " + adv.oab] });
    try { P.baixar(await P.docx(b), "Pesquisa em fontes publicas - " + ($("#caso").value.trim() || "caso").replace(/[\\/:*?"<>|]+/g, " ")); } catch (e) { window.HUB.toast(e.message || "Não foi possível gerar o Word.", 5000); }
  };
})();
