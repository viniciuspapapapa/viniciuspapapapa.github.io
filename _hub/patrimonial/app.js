/* Investigação patrimonial e de dívidas: aeronaves (RAB/ANAC, base cifrada do ramo bases-publicas), empresas e
   quadro societário (Receita Federal pela BrasilAPI), dívida ativa da União (base de captação do escritório,
   PGFN), roteiro guiado de diligências com anotações e relatório em Word. */
(function () {
  "use strict";
  const $ = s => document.querySelector(s), esc = s => window.HUB.esc(s), P = window.TPC_PECA;
  const ler = k => { try { return localStorage.getItem(k); } catch (e) { return null; } };
  const gravar = (k, v) => { try { if (v == null || v === "") localStorage.removeItem(k); else localStorage.setItem(k, v); } catch (e) { /* sem armazenamento */ } };
  const BASES = "https://raw.githubusercontent.com/viniciuspapapapa/viniciuspapapapa.github.io/bases-publicas/";
  const dig = s => String(s || "").replace(/\D/g, "");
  const E = { fontes: [], roteiro: [], t: null, quando: null };

  $("#responsavel").innerHTML = '<option value="">Selecione</option>' + P.ADVOGADOS.map(a => "<option>" + esc(a.nome) + "</option>").join("");
  ["#finalidade", "#responsavel", "#uf"].forEach(s => { const v = ler("patrimonial_" + s.slice(1)); if (v) $(s).value = v; $(s).addEventListener("change", () => gravar("patrimonial_" + s.slice(1), $(s).value)); });
  $("#doc").addEventListener("input", e => {
    const d = dig(e.target.value).slice(0, 14);
    e.target.value = d.length <= 11 ? d.replace(/(\d{3})(\d)/, "$1.$2").replace(/(\d{3})\.(\d{3})(\d)/, "$1.$2.$3").replace(/(\d{3})\.(\d{3})\.(\d{3})(\d)/, "$1.$2.$3-$4") : d.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{0,2}).*/, "$1.$2.$3/$4-$5");
  });
  const fmtCnpj = d => d.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5");
  const fmtCpf = d => d.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4");
  function cpfValido(c) { if (c.length !== 11 || /^(\d)\1{10}$/.test(c)) return false; for (let t = 9; t < 11; t++) { let s = 0; for (let i = 0; i < t; i++) s += +c[i] * (t + 1 - i); if (((10 * s) % 11) % 10 !== +c[t]) return false; } return true; }
  function cnpjValido(c) { if (c.length !== 14 || /^(\d)\1{13}$/.test(c)) return false; const calc = n => { let s = 0, p = n - 7; for (let i = 0; i < n; i++) { s += +c[i] * p--; if (p < 2) p = 9; } const r = s % 11; return r < 2 ? 0 : 11 - r; }; return calc(12) === +c[12] && calc(13) === +c[13]; }
  const norm = s => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase().replace(/[^A-Z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();
  const PARTICULAS = new Set(["DE", "DA", "DO", "DAS", "DOS", "E", "D"]);
  const tokens = s => norm(s).split(" ").filter(w => w.length > 1 && !PARTICULAS.has(w));
  /* mesmo nome: todas as palavras do nome pesquisado aparecem, a primeira coincide e há pelo menos duas */
  function mesmoNome(alvo, nome) { const a = tokens(alvo), b = new Set(tokens(nome)); if (a.length < 2) return norm(alvo) === norm(nome); return a[0] === tokens(nome)[0] && a.every(w => b.has(w)); }
  const moeda = v => (+v || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  const br = d => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(d || ""); return m ? m[3] + "/" + m[2] + "/" + m[1] : (d || ""); };

  /* ------------------------------------------------------------------ bases cifradas (chave do HUB) */
  let CHAVE = null;
  async function chave() {
    if (CHAVE) return CHAVE;
    let k = null; try { k = sessionStorage.getItem("hub_chave"); if (!k) { const l = JSON.parse(localStorage.getItem("hub_chave") || "null"); if (l && l.ate > Date.now()) k = l.k; } } catch (e) { k = null; }
    if (!k) { location.replace("../login/?volta=" + encodeURIComponent(location.pathname)); throw new Error("Sessão expirada."); }
    return (CHAVE = await crypto.subtle.importKey("raw", Uint8Array.from(atob(k), c => c.charCodeAt(0)), "AES-GCM", false, ["decrypt"]));
  }
  async function base(nome) {
    const r = await fetch(BASES + nome + "?t=" + Math.floor(Date.now() / 3600000)); if (!r.ok) throw new Error(r.status === 404 ? "A base ainda não foi gerada (fluxo Bases públicas do HUB)." : "Base indisponível (HTTP " + r.status + ").");
    const u = new Uint8Array(await r.arrayBuffer());
    let claro; try { claro = await crypto.subtle.decrypt({ name: "AES-GCM", iv: u.slice(0, 12) }, await chave(), u.slice(12)); } catch (e) { throw new Error("A base não pôde ser decifrada com a senha atual do HUB; ela será refeita na próxima atualização diária."); }
    return JSON.parse(await new Response(new Blob([claro]).stream().pipeThrough(new DecompressionStream("gzip"))).text());
  }

  /* ------------------------------------------------------------------ consultas automáticas */
  async function aeronaves(t) {
    const d = await base("rab.bin"), achados = [];
    for (const r of d.registros) {
      const papeis = [];
      const confere = (p, papel) => {
        const doc = dig(p[1]), porDoc = t.cnpj ? doc === t.cnpj : t.cpf && /^\d{3}X{6}\d{2}$/i.test(p[1]) ? p[1].slice(0, 3) === t.cpf.slice(0, 3) && p[1].slice(-2) === t.cpf.slice(-2) : false;
        const porNome = t.nome && mesmoNome(t.nome, p[0]);
        if (porDoc || porNome) papeis.push({ papel, nome: p[0], doc: p[1], pct: papel === "proprietário" ? p[2] : "", uf: papel === "proprietário" ? p[3] : p[2], forte: (porDoc && porNome) || (porDoc && !!t.cnpj) || (porNome && !t.cpf && !t.cnpj) });
      };
      r[1].forEach(p => confere(p, "proprietário")); r[2].forEach(p => confere(p, "operador"));
      if (papeis.length) achados.push({ r, papeis });
    }
    achados.sort((a, b) => (b.papeis.some(p => p.forte) - a.papeis.some(p => p.forte)) || (!!a.r[7] - !!b.r[7]));
    const itens = achados.slice(0, 80).map(({ r, papeis }) => ({
      t: r[0].replace(/^(..)(...)$/, "$1-$2") + " · " + [r[4], r[3]].filter(Boolean).join(" ") + (r[5] && r[5] !== "0" ? " (" + r[5] + ")" : ""),
      s: papeis.map(p => p.papel + ": " + p.nome + (p.doc ? " (" + p.doc + ")" : "") + (p.pct ? ", " + p.pct + "%" : "") + (p.uf ? ", " + p.uf : "") + (p.forte ? "" : " · coincidência parcial, confirmar")).join("; "),
      x: [r[7] ? "matrícula cancelada em " + br(r[7]) + (r[8] ? " (" + r[8].toLowerCase() + ")" : "") : "matrícula ativa", r[6] && !/NENHUM GRAVAME/i.test(r[6]) ? "gravame: " + r[6].toLowerCase() : "sem gravame", r[10] ? "operação " + r[10].toLowerCase() : ""].filter(Boolean).join(" · "),
      link: "https://sistemas.anac.gov.br/aeronaves/cons_rab_resposta.asp?textMarca=" + encodeURIComponent(r[0]), destaque: papeis.some(p => p.forte) && !r[7]
    }));
    const ativas = achados.filter(a => !a.r[7]).length;
    return { resumo: achados.length ? achados.length + (achados.length === 1 ? " aeronave vinculada" : " aeronaves vinculadas") + " (" + ativas + (ativas === 1 ? " com matrícula ativa" : " com matrícula ativa") + ")" : "", itens, rotItens: "Aeronaves", vazio: !achados.length, nadaConsta: !achados.length,
      dl: [["Base", d.fonte + ", atualizada em " + br(d.atualizado)]].concat(achados.length > 80 ? [["Exibição", "as 80 primeiras, com prioridade para as matrículas ativas e as coincidências mais seguras; a lista completa está na consulta oficial do RAB"]] : []).concat([["Critério", (t.cnpj ? "CNPJ do proprietário ou operador" : t.cpf ? "CPF parcial divulgado pela ANAC (3 primeiros e 2 últimos dígitos)" : "") + (t.nome ? ((t.cpf || t.cnpj) ? " ou " : "") + "nome completo" : "")]]) };
  }
  async function empresa(cnpj, t) {
    const r = await fetch("https://brasilapi.com.br/api/cnpj/v1/" + cnpj); if (r.status === 404) return { vazio: true, msg: "CNPJ não encontrado na Receita Federal." }; if (!r.ok) throw new Error("Receita Federal indisponível (HTTP " + r.status + ").");
    const d = await r.json(), end = [[d.descricao_tipo_de_logradouro, d.logradouro].filter(Boolean).join(" "), d.numero, d.complemento, d.bairro, d.municipio && d.municipio + "/" + d.uf, d.cep].filter(Boolean).join(", ");
    const qsa = (d.qsa || []).map(s => ({ t: s.nome_socio || s.nome, s: [s.qualificacao_socio, s.data_entrada_sociedade && "desde " + br(s.data_entrada_sociedade), s.cnpj_cpf_do_socio && "documento " + s.cnpj_cpf_do_socio, s.nome_representante_legal && "representante: " + s.nome_representante_legal].filter(Boolean).join(" · "), destaque: !!(t.nome && mesmoNome(t.nome, s.nome_socio || "")) }));
    const vinc = qsa.filter(q => q.destaque);
    return { resumo: (d.razao_social || "") + " · " + (d.descricao_situacao_cadastral || "") + (vinc.length ? " · o investigado consta do quadro societário" : ""),
      dl: [["CNPJ", fmtCnpj(cnpj)], ["Razão social", d.razao_social], d.nome_fantasia && ["Nome fantasia", d.nome_fantasia], ["Situação", (d.descricao_situacao_cadastral || "") + (d.data_situacao_cadastral ? " desde " + br(d.data_situacao_cadastral) : "")], ["Abertura", br(d.data_inicio_atividade)], ["Capital social", moeda(d.capital_social)], ["Porte e natureza", [d.porte, d.natureza_juridica].filter(Boolean).join(" · ")], ["Atividade principal", [d.cnae_fiscal, d.cnae_fiscal_descricao].filter(Boolean).join(" ")], ["Endereço", end], d.email && ["E-mail", d.email], d.ddd_telefone_1 && ["Telefone", d.ddd_telefone_1]].filter(Boolean),
      itens: qsa, rotItens: "Quadro de sócios e administradores", capital: +d.capital_social || 0, razao: d.razao_social, socio: vinc.length > 0 };
  }
  let DIVIDA = null;
  async function divida(cnpjs) {
    if (!DIVIDA) { const r = await fetch("/dados-captacao.json", { cache: "no-cache" }); if (!r.ok) throw new Error("Base de dívida ativa indisponível."); DIVIDA = await r.json(); }
    const mapa = new Map((DIVIDA.empresas || []).map(e => [e.cnpj, e])), achados = cnpjs.map(c => mapa.get(c)).filter(Boolean);
    const meta = DIVIDA.meta || {};
    return { resumo: achados.length ? achados.length + (achados.length === 1 ? " empresa com dívida ativa relevante" : " empresas com dívida ativa relevante") + ", total de " + moeda(achados.reduce((s, e) => s + (+e.divida_total || 0), 0)) : "", vazio: !achados.length, nadaConsta: !achados.length,
      itens: achados.map(e => ({ t: e.razao_social + " · " + fmtCnpj(e.cnpj), s: moeda(e.divida_total) + " em " + e.qtd_inscricoes + (e.qtd_inscricoes === 1 ? " inscrição" : " inscrições") + (e.qtd_ajuizadas ? ", " + e.qtd_ajuizadas + " ajuizadas" : "") + " · " + (e.unidade_responsavel || ""), x: (e.receitas || []).slice(0, 6).join("; "), destaque: true })),
      rotItens: "Dívida ativa da União",
      dl: [["Base", "Dados abertos da PGFN processados pelo escritório" + (meta.gerado_em || meta.atualizado ? ", gerada em " + br(String(meta.gerado_em || meta.atualizado).slice(0, 10)) : "")], ["Alcance", "somente empresas de Minas Gerais com dívida relevante (base de captação); para os demais casos, use a Lista de Devedores da PGFN no roteiro"]] };
  }

  /* ------------------------------------------------------------------ roteiro guiado */
  const G = q => "https://www.google.com/search?q=" + encodeURIComponent(q);
  function roteiro(t) {
    const doc = t.cpf ? fmtCpf(t.cpf) : t.cnpj ? fmtCnpj(t.cnpj) : "", nome = t.nome, chave = doc || nome, R = [];
    const add = (grupo, id, titulo, desc, url, copiar) => R.push({ grupo, id, titulo, desc, url, copiar: copiar || chave, feito: false, nota: "" });
    add("Imóveis", "onr", "Pesquisa de bens no Registro de Imóveis (ONR)", "Busca por CPF ou CNPJ em todos os cartórios de registro de imóveis do país; serviço pago, com certificado digital ou cadastro.", "https://registradores.onr.org.br/", doc);
    add("Imóveis", "cnib", "Central Nacional de Indisponibilidade de Bens (CNIB)", "Ordens de indisponibilidade registradas contra o CPF ou CNPJ; exige certificado digital.", "https://www.indisponibilidade.org.br/", doc);
    add("Imóveis", "sigef", "Imóveis rurais georreferenciados (SIGEF/INCRA)", "Parcelas certificadas, com consulta pelo nome ou CPF/CNPJ do detentor.", "https://sigef.incra.gov.br/consultar/parcelas/", chave);
    add("Imóveis", "car", "Cadastro Ambiental Rural (SICAR)", "Imóveis rurais declarados, com mapa; útil quando se conhece o município.", "https://consultapublica.car.gov.br/publico/imoveis/index", nome);
    add("Veículos, aeronaves e outros bens", "rab", "Registro Aeronáutico Brasileiro (ANAC)", "Conferência oficial da aeronave e emissão de certidão de propriedade e ônus.", "https://sistemas.anac.gov.br/aeronaves/cons_rab.asp", nome);
    add("Veículos, aeronaves e outros bens", "detran", "Veículos no Detran (situação e débitos)", "Exige placa e Renavam; o bloqueio judicial é feito pelo juízo via Renajud.", t.uf === "MG" ? "https://transito.mg.gov.br/" : G("Detran " + t.uf + " consulta situação do veículo"), nome);
    add("Veículos, aeronaves e outros bens", "inpi", "Marcas e patentes (INPI)", "Marcas registradas em nome do investigado: ativo intangível penhorável.", "https://busca.inpi.gov.br/pePI/", nome);
    add("Veículos, aeronaves e outros bens", "tse", "Bens declarados à Justiça Eleitoral (TSE)", "Se o investigado já foi candidato: declaração de bens de cada eleição.", "https://divulgacandcontas.tse.jus.br/divulga/", nome);
    add("Empresas e participações", "junta", "Junta Comercial (" + t.uf + ")", "Atos societários, contratos sociais e participações, inclusive em empresas encerradas.", t.uf === "MG" ? "https://portalservicos.jucemg.mg.gov.br/" : G("Junta Comercial " + t.uf + " pesquisa empresa"), chave);
    add("Empresas e participações", "socios", "Participações societárias (busca aberta)", "Empresas em que o nome aparece como sócio ou administrador; confirme cada CNPJ e acrescente-o às empresas relacionadas.", G('"' + nome + '" sócio CNPJ'), nome);
    add("Empresas e participações", "transparencia", "Recursos públicos recebidos e contratos (Portal da Transparência)", "Pagamentos, contratos e convênios com a União: créditos que podem ser penhorados.", "https://portaldatransparencia.gov.br/busca?termo=" + encodeURIComponent(doc || nome), chave);
    add("Dívidas, protestos e certidões", "pgfn", "Lista de Devedores da União (PGFN)", "Dívida ativa federal, previdenciária e do FGTS, por CPF, CNPJ ou nome.", "https://www.listadevedores.pgfn.gov.br/", chave);
    add("Dívidas, protestos e certidões", "cnd", "Certidão de débitos federais (Receita Federal e PGFN)", "Certidão negativa ou positiva de tributos federais e dívida ativa da União.", "https://servicos.receitafederal.gov.br/servico/certidoes/#/home", doc);
    add("Dívidas, protestos e certidões", "estadual", "Dívida ativa estadual (" + t.uf + ")", "Certidão de débitos tributários estaduais.", t.uf === "MG" ? "https://www2.fazenda.mg.gov.br/sol/ctrl/SOL/CDT/SERVICO_829?ACAO=INICIAR" : G("certidão de débitos tributários " + t.uf + " Secretaria da Fazenda"), doc);
    add("Dívidas, protestos e certidões", "protesto", "Protestos em cartório (CENPROT)", "Consulta nacional gratuita de títulos protestados por CPF ou CNPJ.", "https://www.pesquisaprotesto.com.br/", doc);
    add("Dívidas, protestos e certidões", "cndt", "Débitos trabalhistas (CNDT, TST)", "Execuções trabalhistas inadimplidas por CPF ou CNPJ.", "https://cndt-certidao.tst.jus.br/inicio.faces", doc);
    if (t.cnpj || t.cnpjs.length) add("Dívidas, protestos e certidões", "fgts", "Regularidade do FGTS (CRF, Caixa)", "Certificado de regularidade do empregador.", "https://consulta-crf.caixa.gov.br/consultacrf/pages/consultaEmpregador.jsf", t.cnpj ? fmtCnpj(t.cnpj) : fmtCnpj(t.cnpjs[0]));
    add("Processos, execuções e leilões", "djen", "Publicações processuais (DJEN, CNJ)", "Execuções, penhoras, falência e recuperação judicial pelo nome da parte.", "https://comunica.pje.jus.br/", nome);
    add("Processos, execuções e leilões", "execucoes", "Execuções e penhoras (buscadores)", "Jusbrasil e Escavador: execuções, cumprimentos de sentença e penhoras.", G('"' + nome + '" (execução OR penhora OR "cumprimento de sentença") (site:jusbrasil.com.br OR site:escavador.com)'), nome);
    add("Processos, execuções e leilões", "leiloes", "Leilões judiciais e extrajudiciais", "Bens do investigado levados a leilão, que revelam patrimônio e credores.", G('"' + nome + '" leilão'), nome);
    add("Processos, execuções e leilões", "certidoes", "Certidões cíveis e criminais (Central do HUB)", "Distribuidores de todos os tribunais, com os dados prontos para colar.", "../certidoes/", chave);
    return R;
  }

  /* ------------------------------------------------------------------ execução */
  function prog(m, fr) { $("#progresso").textContent = m || ""; $("#barra").hidden = fr == null; if (fr != null) $("#barra i").style.width = Math.round(fr * 100) + "%"; }
  $("#investigar").onclick = async () => {
    if (!$("#finalidade").value || !$("#caso").value.trim() || !$("#responsavel").value) { $("#estado").textContent = "Informe a finalidade, o processo ou caso e o responsável."; window.scrollTo({ top: 0, behavior: "smooth" }); return; }
    const nome = $("#nome").value.trim().replace(/\s+/g, " "), d = dig($("#doc").value), cnpjs = [...new Set(dig($("#cnpjs").value.replace(/[,;\n]+/g, " ").replace(/[^\d ]/g, "")).length ? $("#cnpjs").value.split(/[\s,;]+/).map(dig).filter(x => x.length === 14) : [])];
    const t = { nome: nome.split(" ").length >= 2 ? nome : "", cpf: d.length === 11 ? d : "", cnpj: d.length === 14 ? d : "", cnpjs: cnpjs.filter(c => c !== d), uf: $("#uf").value }, avisos = [];
    if ($("#doc").value && !t.cpf && !t.cnpj) avisos.push("o CPF ou CNPJ deve ter 11 ou 14 dígitos");
    if (t.cpf && !cpfValido(t.cpf)) avisos.push("os dígitos do CPF não conferem");
    if (t.cnpj && !cnpjValido(t.cnpj)) avisos.push("os dígitos do CNPJ não conferem");
    if (nome && !t.nome) avisos.push("informe o nome completo, com sobrenome");
    const invalidos = cnpjs.filter(c => !cnpjValido(c)); if (invalidos.length) avisos.push(invalidos.length + " CNPJ relacionado com dígitos inválidos");
    if (!t.nome && !t.cpf && !t.cnpj) { $("#estado").textContent = "Informe o nome completo ou o CPF/CNPJ do investigado" + (avisos.length ? ": " + avisos.join("; ") : ".") ; return; }
    $("#estado").textContent = avisos.length ? "Atenção: " + avisos.join("; ") + "." : "";
    E.t = t; E.quando = new Date(); E.fontes = []; E.roteiro = roteiro(t);
    $("#investigar").disabled = true; $("#resBloco").hidden = false; $("#rotBloco").hidden = false; desenharRoteiro();
    const L = [], todos = (t.cnpj ? [t.cnpj] : []).concat(t.cnpjs.filter(cnpjValido));
    L.push({ titulo: "Aeronaves registradas na ANAC", base: "Registro Aeronáutico Brasileiro (dados abertos da ANAC)", fn: () => aeronaves(t) });
    todos.forEach(c => L.push({ titulo: "Empresa " + fmtCnpj(c) + (c === t.cnpj ? " (investigada)" : " (relacionada)"), base: "Receita Federal, dados abertos do CNPJ, via BrasilAPI", fn: () => empresa(c, t), cnpj: c }));
    if (todos.length) L.push({ titulo: "Dívida ativa da União das empresas", base: "PGFN, dados abertos (base de captação do escritório)", fn: () => divida(todos) });
    let n = 0;
    await Promise.all(L.map(async f => {
      const reg = { titulo: f.titulo, base: f.base, status: "carregando", quando: null }; E.fontes.push(reg); desenhar();
      try { const r = await f.fn(); Object.assign(reg, r, { status: r.nadaConsta || (r.vazio && !r.dl) ? "vazio" : "ok", quando: new Date() }); }
      catch (e) { Object.assign(reg, { status: "erro", msg: e.message || String(e), quando: new Date() }); }
      n++; prog("Consultando: " + n + " de " + L.length, n / L.length); desenhar();
    }));
    const cap = E.fontes.filter(f => f.capital && f.socio).reduce((s, f) => s + f.capital, 0);
    if (cap) E.capitalSocio = cap;
    prog("Investigação concluída em " + E.quando.toLocaleString("pt-BR") + ". Siga o roteiro de diligências abaixo.", null); $("#investigar").disabled = false;
    historico(t); desenhar();
  };

  /* ------------------------------------------------------------------ exibição */
  const TAG = { ok: ["ok", "Com resultados"], vazio: ["na", "Nada consta"], erro: ["bad", "Falha na consulta"], carregando: ["info", "Consultando"] };
  function desenhar() {
    const ord = ["ok", "vazio", "erro", "carregando"], fs = E.fontes.slice().sort((a, b) => ord.indexOf(a.status) - ord.indexOf(b.status));
    $("#resumo").textContent = "Investigação de " + E.quando.toLocaleString("pt-BR") + " · " + $("#finalidade").value + " · " + $("#caso").value.trim() + (E.capitalSocio ? " · capital social das empresas em que o investigado é sócio: " + moeda(E.capitalSocio) : "");
    $("#fontes").innerHTML = fs.map(f => {
      const [cl, rot] = TAG[f.status];
      return '<div class="fonte"><div class="fonte-cab"><h3>' + esc(f.titulo) + ' <span class="tag ' + cl + '">' + rot + "</span></h3><small>" + (f.quando ? f.quando.toLocaleTimeString("pt-BR") : "") + "</small></div>" +
        '<p class="pequeno mudo" style="margin:2px 0 6px">' + esc(f.base) + "</p>" + (f.msg ? "<p>" + esc(f.msg) + "</p>" : "") + (f.resumo ? "<p><b>" + esc(f.resumo) + "</b></p>" : "") +
        (f.dl ? '<dl class="dl">' + f.dl.map(([a, b]) => "<dt>" + esc(a) + "</dt><dd>" + esc(b) + "</dd>").join("") + "</dl>" : "") +
        (f.itens && f.itens.length ? '<p class="pequeno" style="margin-top:10px"><b>' + esc(f.rotItens || "Registros") + '</b></p><div class="itens">' + f.itens.map(i => '<div class="item' + (i.destaque ? " destaque" : "") + '"><b>' + esc(i.t || "") + "</b>" + (i.s ? '<div class="pequeno mudo">' + esc(i.s) + "</div>" : "") + (i.x ? '<div class="pequeno">' + esc(i.x) + "</div>" : "") + (i.link ? '<div class="pequeno"><a href="' + esc(i.link) + '" target="_blank" rel="noopener">Abrir na fonte oficial</a></div>' : "") + "</div>").join("") + "</div>" : "") + "</div>";
    }).join("");
  }
  function desenharRoteiro() {
    const grupos = [...new Set(E.roteiro.map(p => p.grupo))];
    $("#roteiro").innerHTML = grupos.map(g => "<h3>" + esc(g) + "</h3>" + E.roteiro.map((p, i) => p.grupo !== g ? "" : '<div class="passo"><input type="checkbox" data-feito="' + i + '" aria-label="Consultado: ' + esc(p.titulo) + '"' + (p.feito ? " checked" : "") + '><div class="txt"><b>' + esc(p.titulo) + '</b><div class="mudo">' + esc(p.desc) + "</div>" +
      '<div class="linha-btns"><a class="btn sec peq" data-abrir="' + i + '" href="' + esc(p.url) + '"' + (/^\.\.\//.test(p.url) ? "" : ' target="_blank" rel="noopener"') + ">Abrir</a>" + (p.copiar ? '<button type="button" class="btn sec peq" data-copiar="' + i + '">Copiar ' + esc(p.copiar.length > 28 ? p.copiar.slice(0, 26) + "…" : p.copiar) + "</button>" : "") + "</div>" +
      '<textarea data-nota="' + i + '" placeholder="Resultado da consulta (ex.: matrícula 12.345 do 2º Ofício de BH; nada consta; protesto de R$ 15.000,00)">' + esc(p.nota) + "</textarea></div></div>").join("")).join("");
    document.querySelectorAll("[data-copiar]").forEach(b => { b.onclick = async () => { try { await navigator.clipboard.writeText(E.roteiro[+b.dataset.copiar].copiar); window.HUB.toast("Copiado."); } catch (e) { window.HUB.toast("Não foi possível copiar."); } }; });
    document.querySelectorAll("[data-abrir]").forEach(a => a.addEventListener("click", () => { const p = E.roteiro[+a.dataset.abrir]; if (p.copiar && navigator.clipboard) navigator.clipboard.writeText(p.copiar).catch(() => {}); }));
    document.querySelectorAll("[data-feito]").forEach(c => { c.onchange = () => { const p = E.roteiro[+c.dataset.feito]; p.feito = c.checked; p.quando = c.checked ? new Date() : null; }; });
    document.querySelectorAll("[data-nota]").forEach(x => { x.oninput = () => { const p = E.roteiro[+x.dataset.nota]; p.nota = x.value; if (x.value.trim() && !p.feito) { p.feito = true; p.quando = new Date(); const c = document.querySelector('[data-feito="' + x.dataset.nota + '"]'); if (c) c.checked = true; } }; });
  }

  /* ------------------------------------------------------------------ histórico (mascarado) */
  function historico(t) {
    let h = []; try { h = JSON.parse(ler("patrimonial_historico") || "[]"); } catch (e) { h = []; }
    h.unshift({ quando: E.quando.toISOString(), finalidade: $("#finalidade").value, caso: $("#caso").value.trim(), responsavel: $("#responsavel").value, dados: [t.nome, t.cpf && "CPF ***." + t.cpf.slice(3, 6) + "." + t.cpf.slice(6, 9) + "-**", t.cnpj && "CNPJ " + fmtCnpj(t.cnpj), t.cnpjs.length && t.cnpjs.length + " empresa(s) relacionada(s)"].filter(Boolean).join(", ") });
    gravar("patrimonial_historico", JSON.stringify(h.slice(0, 200))); mostrarHist();
  }
  function mostrarHist() {
    let h = []; try { h = JSON.parse(ler("patrimonial_historico") || "[]"); } catch (e) { h = []; }
    $("#historico").innerHTML = h.length ? '<div style="overflow-x:auto"><table class="hist" style="width:100%;font-size:14px;border-collapse:collapse"><thead><tr><th style="text-align:left">Data</th><th style="text-align:left">Finalidade</th><th style="text-align:left">Caso</th><th style="text-align:left">Responsável</th><th style="text-align:left">Investigado</th></tr></thead><tbody>' + h.map(x => "<tr><td>" + new Date(x.quando).toLocaleString("pt-BR") + "</td><td>" + esc(x.finalidade) + "</td><td>" + esc(x.caso) + "</td><td>" + esc(x.responsavel) + "</td><td>" + esc(x.dados) + "</td></tr>").join("") + '</tbody></table></div><p><button type="button" class="btn sec peq" id="limparHist">Apagar histórico</button></p>' : '<p class="pequeno mudo">Nenhuma investigação registrada neste navegador.</p>';
    const b = $("#limparHist"); if (b) b.onclick = () => { if (confirm("Apagar o histórico de investigações deste navegador?")) { gravar("patrimonial_historico", null); mostrarHist(); } };
  }
  mostrarHist();

  /* ------------------------------------------------------------------ relatório */
  $("#relatorio").onclick = async () => {
    const t = E.t; if (!t) return;
    const b = [{ t: "tit", texto: "RELATÓRIO DE INVESTIGAÇÃO PATRIMONIAL" }];
    b.push({ t: "tab", larg: [1.4, 3], linhas: [["Finalidade", $("#finalidade").value], ["Processo ou caso", $("#caso").value.trim()], ["Responsável", $("#responsavel").value], ["Data e hora", E.quando.toLocaleString("pt-BR")], ["Investigado", [t.nome, t.cpf && "CPF " + fmtCpf(t.cpf), t.cnpj && "CNPJ " + fmtCnpj(t.cnpj)].filter(Boolean).join("; ")], ["Empresas relacionadas", t.cnpjs.map(fmtCnpj).join("; ") || "não informadas"]] });
    b.push({ t: "h", texto: "Base legal e metodologia" });
    b.push({ t: "p", r: "O levantamento foi realizado exclusivamente em fontes públicas e oficiais, para o exercício regular de direitos em processo judicial ou administrativo (Lei 13.709/2018, art. 7º, VI), no âmbito da investigação defensiva (Provimento 188/2018 do Conselho Federal da OAB) e do acesso à informação pública (Lei 12.527/2011). Nenhuma base de dados vazada ou de origem ilícita foi utilizada, o que preserva a licitude da prova." });
    b.push({ t: "p", r: "Os registros indicam bens e vínculos associados ao investigado, mas a coincidência de nome não comprova identidade, e os dados das bases públicas podem estar desatualizados. Antes do uso processual, cada bem relevante deve ser confirmado por certidão da fonte oficial (matrícula do imóvel, certidão do RAB, certidão da junta comercial). Em execução, a indicação de bens pelo próprio executado é dever processual (CPC, art. 774, V), e a pesquisa por sistemas restritos (Sisbajud, Renajud, Infojud, CNIB) deve ser requerida ao juízo." });
    b.push({ t: "h", texto: "Resultados das consultas automáticas" });
    E.fontes.forEach(f => {
      b.push({ t: "sub", texto: f.titulo });
      b.push({ t: "p", r: [[(TAG[f.status] || ["", ""])[1] + ". ", "bo"], ["Fonte: " + f.base + ". Consulta em " + (f.quando ? f.quando.toLocaleString("pt-BR") : "") + "." + (f.msg ? " " + f.msg : "") + (f.resumo ? " " + f.resumo + "." : ""), "n"]] });
      if (f.dl) b.push({ t: "tab", larg: [1.4, 3], linhas: f.dl.map(([a, v]) => [a, String(v)]) });
      if (f.itens && f.itens.length) b.push({ t: "tab", cab: [f.rotItens || "Registro", "Detalhes"], larg: [1.8, 3.2], linhas: f.itens.map(i => [i.t || "", [i.s, i.x].filter(Boolean).join(". ")]) });
    });
    if (E.capitalSocio) b.push({ t: "p", r: [["Capital social somado das empresas em que o investigado consta do quadro societário: ", "bo"], [moeda(E.capitalSocio) + ". O capital social é declaratório e não equivale ao valor de mercado das quotas.", "n"]] });
    b.push({ t: "h", texto: "Diligências em fontes oficiais" });
    const feitos = E.roteiro.filter(p => p.feito || p.nota.trim());
    b.push({ t: "p", r: feitos.length ? "As consultas a seguir foram realizadas manualmente nos portais oficiais, com os resultados anotados; os comprovantes devem ser juntados por certidão ou captura de tela." : "Nenhuma diligência manual foi registrada. O roteiro abaixo indica as consultas recomendadas para o caso." });
    b.push({ t: "tab", cab: ["Grupo", "Consulta", "Situação e resultado"], larg: [1.2, 2.0, 2.6], linhas: E.roteiro.map(p => [p.grupo, p.titulo, (p.feito ? "Consultada" + (p.quando ? " em " + p.quando.toLocaleString("pt-BR") : "") : "Recomendada") + (p.nota.trim() ? ". " + p.nota.trim() : "")]) });
    b.push({ t: "data", texto: "Belo Horizonte, " + P.dataExtenso(E.quando) + "." });
    const adv = P.ADVOGADOS.find(a => a.nome === $("#responsavel").value); if (adv) b.push({ t: "ass", nome: adv.nome, linhas: ["OAB/" + adv.uf + " " + adv.oab] });
    try { P.baixar(await P.docx(b), "Investigacao patrimonial - " + ($("#caso").value.trim() || "caso").replace(/[\\/:*?"<>|]+/g, " ")); } catch (e) { window.HUB.toast(e.message || "Não foi possível gerar o Word.", 5000); }
  };
})();
