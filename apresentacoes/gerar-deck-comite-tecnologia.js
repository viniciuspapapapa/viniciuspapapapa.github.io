const PptxGenJS = require('pptxgenjs');
const pptx = new PptxGenJS();
pptx.layout = 'LAYOUT_WIDE';
pptx.theme = { headFontFace: 'Segoe UI', bodyFontFace: 'Segoe UI' };

const T = {
  preto: '0F0F10', cinzaEscuro: '2B2B2B', cinzaClaro: 'EDEDED',
  branco: 'FFFFFF', textoEscuro: '3A3A3A', amarelo: 'E8E347', amareloSuave: 'F2EE80',
};
const F = 'Segoe UI';
const W = 13.333;

function banda(s, cor) {
  s.addShape(pptx.ShapeType.rect, { x: 0, y: 7.35, w: W, h: 0.15,
    fill: { color: cor || T.amarelo }, line: { color: cor || T.amarelo } });
}
function selo(s, corTexto) {
  const c = corTexto || T.branco;
  s.addShape(pptx.ShapeType.rect, { x: 11.7, y: 0.32, w: 0.52, h: 0.45,
    fill: { type: 'solid', color: c, transparency: 100 }, line: { color: c, width: 1 } });
  s.addText('TPC', { x: 11.7, y: 0.32, w: 0.52, h: 0.45, fontFace: F, fontSize: 9,
    bold: true, color: c, align: 'center', valign: 'middle' });
  s.addText('ADVOGADOS.', { x: 12.25, y: 0.32, w: 1.05, h: 0.45, fontFace: F, fontSize: 7.5,
    color: c, valign: 'middle', charSpacing: 1 });
}
function rodape(s, texto, cor) {
  s.addText(texto, { x: 0.6, y: 6.85, w: 12.1, h: 0.35, fontFace: F, fontSize: 9,
    color: cor || '8A8A8A', valign: 'middle' });
}

/* ---------- L1 CAPA ---------- */
const capa = pptx.addSlide();
capa.background = { color: T.preto };
capa.addShape(pptx.ShapeType.rect, { x: 9.0, y: 0, w: 4.333, h: 3.0, fill: { color: '1A1A1B' }, line: { color: '1A1A1B' } });
capa.addShape(pptx.ShapeType.rect, { x: 10.5, y: 1.5, w: 2.833, h: 4.0, fill: { color: '232325' }, line: { color: '232325' } });
capa.addText('COMITÊ DE TECNOLOGIA', { x: 0.6, y: 1.55, w: 8.5, h: 0.4, fontFace: F,
  fontSize: 12, color: T.amarelo, charSpacing: 3 });
capa.addText('INTELIGÊNCIA ARTIFICIAL\nNA ÁREA CRIMINAL', { x: 0.6, y: 2.05, w: 8.6, h: 1.6,
  fontFace: 'Segoe UI Light', fontSize: 40, color: T.branco, charSpacing: 2, lineSpacingMultiple: 1.05 });
capa.addShape(pptx.ShapeType.line, { x: 0.62, y: 3.75, w: 3.2, h: 0, line: { color: T.amarelo, width: 2.5 } });
capa.addText('O que já está em operação e o que proponho como próximo passo', {
  x: 0.6, y: 3.9, w: 8.2, h: 0.5, fontFace: F, fontSize: 15, color: 'CFCFCF' });
capa.addShape(pptx.ShapeType.rect, { x: 0.6, y: 5.3, w: 0.7, h: 0.7, fill: { color: T.preto }, line: { color: 'A0A0A0', width: 1.5 } });
capa.addText('TPC', { x: 0.6, y: 5.3, w: 0.7, h: 0.7, fontFace: F, fontSize: 14, bold: true,
  color: T.branco, align: 'center', valign: 'middle', charSpacing: 2 });
capa.addText([
  { text: 'TOLEDO, PAOLIELLO, DE PAULA,', options: { breakLine: true } },
  { text: 'CAMPOS, CUNHA E CORDEIRO ', options: {} },
  { text: 'ADVOGADOS.', options: { bold: true } },
], { x: 1.4, y: 5.3, w: 7.0, h: 0.7, fontFace: F, fontSize: 11, color: T.branco, charSpacing: 1.5, valign: 'middle' });
capa.addText('Área de Direito Penal  ·  Agosto de 2026', { x: 0.6, y: 6.15, w: 8, h: 0.3,
  fontFace: F, fontSize: 10, color: '8A8A8A', charSpacing: 1 });
banda(capa);

/* ---------- L2 helper: conteúdo escuro ---------- */
function slideEscuro(titulo, subtitulo, itens, opts = {}) {
  const s = pptx.addSlide();
  s.background = { color: T.preto };
  s.addText(titulo, { x: 0.6, y: 0.55, w: 11.0, h: 0.7, fontFace: F, fontSize: 28,
    color: T.amarelo, charSpacing: 1 });
  selo(s);
  let y = 1.35;
  if (subtitulo) {
    s.addText(subtitulo, { x: 0.6, y, w: 11.6, h: 0.45, fontFace: F, fontSize: 14, color: 'B8B8B8' });
    y += 0.6;
  }
  s.addShape(pptx.ShapeType.line, { x: 0.62, y: y, w: 12.1, h: 0, line: { color: '3A3A3A', width: 1 } });
  y += 0.25;
  const hLinha = opts.hLinha || (5.6 - (y - 1.35)) / itens.length;
  itens.forEach((it, i) => {
    const yy = y + i * hLinha;
    const runs = [{ text: it.rotulo, options: { fontSize: 13.5, bold: true, color: T.branco,
      charSpacing: 0.5, fontFace: F, breakLine: !!it.tag } }];
    if (it.tag) runs.push({ text: it.tag, options: { fontSize: 9.5, color: T.amarelo, fontFace: 'Consolas' } });
    s.addText(runs, { x: 0.6, y: yy, w: 3.8, h: hLinha - 0.2, valign: 'top', lineSpacingMultiple: 1.15 });
    s.addText(it.texto, { x: 4.55, y: yy, w: 8.2, h: hLinha - 0.12, fontFace: F,
      fontSize: opts.corpo || (itens.length >= 6 ? 11.5 : 12), color: 'D8D8D8',
      valign: 'top', lineSpacingMultiple: 1.08 });
    if (i < itens.length - 1) {
      s.addShape(pptx.ShapeType.line, { x: 0.62, y: yy + hLinha - 0.14, w: 12.1, h: 0,
        line: { color: '2A2A2A', width: 0.75 } });
    }
  });
  if (opts.rodape) rodape(s, opts.rodape);
  banda(s);
  return s;
}

/* ---------- L3 helper: blocos claros ---------- */
function slideClaro(titulo, blocos, opts = {}) {
  const s = pptx.addSlide();
  s.background = { color: T.cinzaClaro };
  s.addShape(pptx.ShapeType.rect, { x: 0, y: 0, w: W, h: 1.15, fill: { color: T.cinzaEscuro }, line: { color: T.cinzaEscuro } });
  s.addText(titulo, { x: 0.6, y: 0.28, w: 10.8, h: 0.6, fontFace: F, fontSize: 25,
    color: T.branco, charSpacing: 1, valign: 'middle' });
  selo(s);
  const cols = opts.cols || 2;
  const larg = (12.13 - (cols - 1) * 0.55) / cols;
  const linhas = Math.ceil(blocos.length / cols);
  const altura = opts.hBloco || (5.4 / linhas);
  blocos.forEach((b, i) => {
    const c = i % cols, r = Math.floor(i / cols);
    const x = 0.6 + c * (larg + 0.55);
    const y = 1.55 + r * altura;
    s.addText(b.titulo, { x, y, w: larg, h: 0.38, fontFace: F, fontSize: 13.5, bold: true,
      color: T.textoEscuro, charSpacing: 0.8, valign: 'middle' });
    s.addShape(pptx.ShapeType.line, { x, y: y + 0.42, w: larg, h: 0, line: { color: T.amarelo, width: 2 } });
    s.addText(b.texto, { x, y: y + 0.52, w: larg, h: altura - 0.75, fontFace: F, fontSize: 11.5,
      color: T.textoEscuro, valign: 'top', lineSpacingMultiple: 1.12 });
  });
  if (opts.rodape) rodape(s, opts.rodape, '6E6E6E');
  banda(s, T.amareloSuave);
  return s;
}

/* ---------- L8 divisor ---------- */
function divisor(numero, titulo, linha) {
  const s = pptx.addSlide();
  s.background = { color: T.preto };
  s.addShape(pptx.ShapeType.rect, { x: 9.6, y: 0, w: 3.733, h: 7.5, fill: { color: '151516' }, line: { color: '151516' } });
  s.addText(numero, { x: 0.6, y: 2.1, w: 3, h: 0.5, fontFace: F, fontSize: 13, color: T.amarelo, charSpacing: 4 });
  s.addText(titulo, { x: 0.6, y: 2.7, w: 8.4, h: 1.5, fontFace: 'Segoe UI Light', fontSize: 36,
    color: T.branco, charSpacing: 1.5, lineSpacingMultiple: 1.05 });
  s.addShape(pptx.ShapeType.line, { x: 0.62, y: 4.35, w: 4.0, h: 0, line: { color: T.amarelo, width: 2.5 } });
  if (linha) s.addText(linha, { x: 0.6, y: 4.55, w: 8.2, h: 0.6, fontFace: F, fontSize: 14, color: 'B8B8B8' });
  banda(s);
  return s;
}

/* =================== SLIDE 2 — SUMÁRIO =================== */
slideEscuro('O QUE ESTE COMITÊ VAI VER', 'Roteiro da apresentação', [
  { rotulo: '01  ·  PANORAMA', texto: 'O que foi construído nos últimos três meses, em números, e a arquitetura em três camadas que sustenta tudo.' },
  { rotulo: '02  ·  EM OPERAÇÃO', texto: 'As dezoito rotinas de IA e as nove ferramentas web já usadas no dia a dia da área criminal — e as que extrapolaram para outras áreas.' },
  { rotulo: '03  ·  GOVERNANÇA', texto: 'Sigilo, LGPD, validação humana obrigatória e os limites que foram desenhados no próprio código.' },
  { rotulo: '04  ·  EM ANÁLISE', texto: 'Seis propostas de expansão, um plano de noventa dias e o que preciso do Comitê para executá-lo.' },
], { rodape: 'Toledo, Paoliello, de Paula, Campos, Cunha e Cordeiro Advogados  ·  Área Criminal' });

/* =================== SLIDE 3 — NÚMEROS =================== */
slideClaro('O QUE JÁ EXISTE, EM NÚMEROS', [
  { titulo: '18 ROTINAS DE IA', texto: 'Rotinas especializadas ("skills") escritas para o escritório, das quais 11 são exclusivas da área criminal. Cada uma carrega o método de trabalho da área, não apenas um comando.' },
  { titulo: '9 FERRAMENTAS WEB', texto: 'Aplicações próprias publicadas e acessíveis pelo navegador, sem instalação: comparador de depoimentos, índice de jurisprudência, gerador de resposta a ofícios, painéis e simuladores.' },
  { titulo: '2 BASES PRÓPRIAS', texto: 'Pipelines que baixam e organizam dados públicos oficiais: acórdãos do STJ (dados abertos) e Dívida Ativa da União (PGFN). Atualizáveis por comando, sem retrabalho manual.' },
  { titulo: '126 VERSÕES', texto: 'Todo o código está versionado e auditável desde 23 de maio de 2026, com histórico de cada alteração. Nada depende da memória ou do computador de uma pessoa só.' },
], { rodape: 'Período: 23/05/2026 a 12/08/2026  ·  desenvolvimento interno, sem contratação de fornecedor' });

/* =================== SLIDE 4 — ARQUITETURA =================== */
slideEscuro('COMO ISSO ESTÁ CONSTRUÍDO', 'Três camadas, cada uma resolvendo um tipo diferente de problema', [
  { rotulo: 'CAMADA 1', tag: 'rotinas de IA', texto: 'O método da área codificado. Cada rotina obriga a IA a seguir o mesmo fluxo que um advogado sênior seguiria: ler os autos, entregar relatório estratégico, validar jurisprudência e só então redigir. Trabalho sob demanda, iniciado por conversa.' },
  { rotulo: 'CAMADA 2', tag: 'ferramentas web', texto: 'O que precisa ser usado repetidamente, por qualquer pessoa da equipe, sem depender de IA a cada uso. Abrem no navegador, funcionam offline quando preciso e não guardam dados em servidor.' },
  { rotulo: 'CAMADA 3', tag: 'pipelines de dados', texto: 'O que precisa de dado bruto e atualização periódica. Baixam fontes oficiais e abertas, filtram, classificam e alimentam as ferramentas da camada 2. Custo zero de licença de dados.' },
], { rodape: 'Custo de infraestrutura hoje: hospedagem gratuita (GitHub Pages) + licença Claude' });

/* =================== DIVISOR I =================== */
divisor('BLOCO 01', 'O QUE JÁ ESTÁ\nEM OPERAÇÃO', 'Rotinas de IA, ferramentas web e bases de dados em uso na área criminal');

/* =================== SLIDE 6 — PEÇAS =================== */
slideEscuro('PRODUÇÃO DE PEÇAS CRIMINAIS', 'Cinco rotinas cobrem o ciclo completo de um caso, da análise dos autos à peça pronta', [
  { rotulo: 'DEFESA CRIMINAL', tag: '/defesa-criminal', texto: 'Elabora e revisa peças defensivas a partir dos PDFs dos autos: resposta à acusação, alegações finais, memoriais, HC, recursos, manifestações em inquérito, impugnação de cautelares. Fluxo em três etapas com validação do advogado antes de cada avanço.' },
  { rotulo: 'ESTUDO DE CASO', tag: '/criminal-case-study', texto: 'Documento analítico interno: reconstrução fática, mapeamento probatório favorável e desfavorável, análise de tipicidade e teses defensivas. Não vai aos autos — orienta a estratégia.' },
  { rotulo: 'ASSISTENTE DE ACUSAÇÃO', tag: '/assistente-acusacao', texto: 'A mesma profundidade, pela perspectiva da vítima: reforça a acusação, corrige fragilidades do MP e antecipa teses defensivas.' },
  { rotulo: 'RECURSO ESPECIAL', tag: '/recurso-especial-criminal', texto: 'Trata a admissibilidade como problema central: prequestionamento, cotejo analítico, dissídio jurisprudencial e Súmula 7 do STJ, antes de qualquer redação.' },
  { rotulo: 'ORGANIZADOR DE DOCUMENTOS', tag: '/organizador-documentos', texto: 'Transforma documentos avulsos do cliente em um PDF único, com capas numeradas e descritas, pronto para instruir a peça.' },
], { rodape: 'A rotina /criminal-review foi absorvida por /defesa-criminal — consolidação, não acúmulo' });

/* =================== SLIDE 7 — PADRONIZAÇÃO =================== */
slideClaro('PADRONIZAÇÃO E LEGAL DESIGN', [
  { titulo: 'TPC LEGAL DESIGN  ·  /tpc-legal-design', texto: 'Insere fluxogramas, linhas do tempo, quadros comparativos e destaques em peças já prontas, editando o arquivo original — mesmo timbre, mesma fonte, mesmas margens. Nenhuma palavra do texto é alterada. Cada elemento visual precisa ter função argumentativa: o fluxograma expõe a contradição, a linha do tempo revela a lacuna.' },
  { titulo: 'LEGAL DESIGN DOCX  ·  /legal-design-docx', texto: 'Versão genérica da anterior, aplicável a qualquer documento jurídico e a qualquer identidade visual — inclusive de outras áreas do escritório. Mesmo princípio: a integridade do conteúdo é intocável, só a estrutura visual é trabalhada.' },
  { titulo: 'APRESENTAÇÃO TPC  ·  /tpc-apresentacao', texto: 'Gera apresentações no padrão institucional do escritório: paleta, tipografia, geometria dos slides e endereços das cinco filiais. Estes slides que o Comitê está vendo foram produzidos por ela.' },
  { titulo: 'POR QUE ISSO IMPORTA', texto: 'Padronização deixa de depender de disciplina individual e passa a estar embutida na ferramenta. Quem entra na equipe produz no padrão desde a primeira peça, sem curva de adaptação.' },
], { rodape: 'Ganho principal: identidade visual e estrutura uniformes, independentemente de quem redige' });

/* =================== SLIDE 8 — INTELIGÊNCIA =================== */
slideEscuro('INTELIGÊNCIA JURÍDICA E CONTEÚDO', 'Monitoramento contínuo do que muda no direito penal, convertido em comunicação', [
  { rotulo: 'CLIPPING CRIMINAL', tag: '/conjur-criminal-news', texto: 'Levanta e resume as notícias criminais das últimas duas semanas no Consultor Jurídico e entrega um mailing pronto para circulação interna e para clientes, em linguagem clara.' },
  { rotulo: 'PAUTA CRIMINAL', tag: '/pauta-criminal-instagram', texto: 'Consolida decisões recentes do STJ e do STF em dois formatos: resumo técnico para clientes e texto acessível para redes sociais, com link de cada matéria.' },
  { rotulo: 'PROJETOS DE LEI', tag: '/projetos-lei-criminal-instagram', texto: 'Rastreia PLs penais e processuais penais na Câmara, no Senado e no Planalto, com ementa, relator e fase de tramitação — antecipando mudanças legislativas que atingem a carteira.' },
  { rotulo: 'MAILING TRIBUTÁRIO', tag: '/mailing-tributario', texto: 'Mesma lógica aplicada à área tributária: pautas de julgamento do STF e do STJ nos quinze dias seguintes, com alerta de ajuizamento preventivo. Nasceu na área criminal e foi cedida.' },
], { rodape: 'Trabalho que antes consumia horas de pesquisa manual a cada quinzena' });

/* =================== SLIDE 9 — GESTÃO =================== */
slideClaro('GESTÃO E ROTINA DA EQUIPE', [
  { titulo: 'PAUTA DE AUDIÊNCIAS  ·  /pauta-audiencias', texto: 'Varre todos os calendários do Google e devolve uma planilha com audiências, oitivas e compromissos das duas semanas seguintes, de segunda a domingo. Substitui a montagem manual da pauta semanal.' },
  { titulo: 'PAINEL DE PRODUTIVIDADE  ·  /painel-produtividade', texto: 'Nasceu de uma análise pontual de 11 mil tarefas feita para o comitê de líderes e virou painel permanente: qualquer nova exportação do ADVWin o regenera. Mede granularidade de apontamento, tempo interno versus cliente, possível duplicidade de lançamento e evolução semanal por advogado.' },
  { titulo: 'PRIVACIDADE POR DESENHO', texto: 'O painel abre sempre vazio: nenhum dado de advogado ou cliente fica embutido no arquivo publicado. Os dados são carregados pelo usuário no próprio navegador e não trafegam para servidor algum — decisão registrada no histórico do código.' },
  { titulo: 'DE ANÁLISE PONTUAL A ROTINA', texto: 'É o padrão que se repetiu em quase tudo: um trabalho manual pesado, feito uma vez, foi convertido em ferramenta que se repete a custo próximo de zero.' },
], { rodape: 'Integração automática com o ADVWin ainda depende de acesso — ver pedidos ao Comitê' });

/* =================== SLIDE 10 — FERRAMENTAS WEB =================== */
slideEscuro('FERRAMENTAS WEB PRÓPRIAS', 'Abrem no navegador, sem instalação e sem servidor guardando dados', [
  { rotulo: 'COMPARADOR DE VERSÕES', texto: 'Confronta depoimentos e versões fáticas de um mesmo caso e organiza o resultado em contradições, convergências, lacunas narrativas, afirmações isoladas, síntese e recomendações estratégicas. Trabalho artesanal de cotejo, feito de forma estruturada.' },
  { rotulo: 'ÍNDICE DE JURISPRUDÊNCIA', texto: 'Busca em acórdãos do STJ por ementa, tese, relator, órgão julgador, ano e tema repetitivo, com exportação. Base construída sobre os dados abertos oficiais do próprio tribunal.' },
  { rotulo: 'GERADOR DE RESPOSTA A OFÍCIOS', texto: 'Monta resposta a requisições de autoridade a partir dos documentos do caso, com estrutura completa: tempestividade, arquitetura da operação, repartição de responsabilidades, medidas antifraude, compliance e reserva de jurisdição.' },
  { rotulo: 'TRANSCRIÇÃO DE ÁUDIO E VÍDEO', texto: 'Aplicativo próprio para transcrever audiências, oitivas e reuniões, com fila de múltiplos arquivos e suporte aos formatos que os tribunais e celulares realmente produzem.' },
], { rodape: 'Também disponíveis: simulador da Reforma Tributária, diagnóstico patrimonial, painel de captação e Lex Dashboard' });

/* =================== SLIDE 11 — DADOS =================== */
slideClaro('BASES DE DADOS PRÓPRIAS', [
  { titulo: 'ACÓRDÃOS DO STJ  ·  custo zero', texto: 'Indexador dos "Espelhos de Acórdãos" publicados pelo próprio STJ em dados abertos: número, classe, órgão julgador, relator, ementa, tese, tema repetitivo e referências. Sem chave de API e sem assinatura. O STJ é hoje o único tribunal superior com dump em lote — por isso a base começou por ele.' },
  { titulo: 'DÍVIDA ATIVA DA UNIÃO  ·  PGFN', texto: 'Pipeline que baixa a base da PGFN, filtra Minas Gerais, agrega por CNPJ, calcula score de oportunidade e enriquece as maiores devedoras com dados cadastrais públicos. Alimenta o painel de captação da área tributária.' },
  { titulo: 'CRUZAMENTO PENAL-TRIBUTÁRIO', texto: 'Sobre essa base, classifiquei 633 empresas por probabilidade de exposição penal-tributária a partir da natureza do tributo inscrito — contribuição descontada do segurado (art. 168-A, CP) e tributo retido na fonte (art. 2º, II, Lei 8.137/90). É priorização, não parecer.' },
  { titulo: 'O LIMITE ESTÁ ESCRITO NA FERRAMENTA', texto: 'O próprio documento registra que dívida ativa é cobrança cível, que a inferência não confirma existência de ação penal, que a responsabilidade é do administrador à época e que pagamento extingue a punibilidade. A ferramenta prioriza; quem conclui é o advogado.' },
], { rodape: 'Fontes públicas e oficiais  ·  pessoas físicas descartadas por padrão  ·  material interno não publicado' });

/* =================== SLIDE 12 — FLUXO =================== */
slideEscuro('UM CASO, DE PONTA A PONTA', 'Como as peças se encaixam quando chega um inquérito novo', [
  { rotulo: '1 · LER', texto: 'Os PDFs dos autos entram no estudo de caso. Sai um documento com reconstrução fática, mapa probatório e teses candidatas — antes de qualquer decisão estratégica.' },
  { rotulo: '2 · COTEJAR', texto: 'Depoimentos e versões vão para o comparador. Contradições, lacunas e afirmações isoladas ficam explícitas e viram munição da peça.' },
  { rotulo: '3 · PESQUISAR', texto: 'A tese é confrontada com o índice de jurisprudência do STJ e com a pesquisa validada pelo advogado. Nada entra na peça sem conferência na fonte.' },
  { rotulo: '4 · REDIGIR', texto: 'A rotina de defesa criminal produz a peça em etapas, com aprovação do advogado a cada avanço, já no padrão do escritório.' },
  { rotulo: '5 · ENTREGAR', texto: 'Legal design aplica os elementos visuais argumentativos e o organizador monta o PDF de documentos com capas numeradas. Peça e anexos saem juntos.' },
], { rodape: 'Cada etapa tem parada obrigatória para validação humana — nenhuma delas é automática de ponta a ponta' });

/* =================== DIVISOR II =================== */
divisor('BLOCO 02', 'GOVERNANÇA,\nSIGILO E LIMITES', 'As restrições foram desenhadas dentro das ferramentas, não escritas depois');

/* =================== SLIDE 14 — GOVERNANÇA =================== */
slideClaro('COMO O RISCO ESTÁ CONTROLADO HOJE', [
  { titulo: 'A IA NÃO ASSINA NADA', texto: 'Todas as rotinas de produção de peça param e pedem validação do advogado antes de avançar. O produto é minuta de trabalho, submetida a revisão humana como qualquer outra.' },
  { titulo: 'JURISPRUDÊNCIA CONFERIDA NA FONTE', texto: 'A pesquisa é etapa separada e validada antes da redação, justamente para impedir citação inventada. O índice do STJ vem do dado oficial do tribunal, não de resumo de terceiro.' },
  { titulo: 'DADO DE CLIENTE NÃO É PUBLICADO', texto: 'O que é confidencial fica fora do repositório público. O painel de produtividade abre vazio e processa no navegador do usuário. O material de risco penal está marcado como interno e não foi publicado.' },
  { titulo: 'FONTES ABERTAS E LGPD', texto: 'As bases usam dados públicos oficiais (PGFN e STJ). No pipeline de captação, pessoas físicas são descartadas por padrão e o uso é prospecção entre empresas, com conferência da situação atual antes de qualquer abordagem.' },
  { titulo: 'TUDO VERSIONADO E AUDITÁVEL', texto: 'Cada alteração tem autor, data e justificativa registrados. É possível reconstruir por que uma ferramenta se comporta de determinado modo — inclusive as decisões de privacidade.' },
  { titulo: 'O QUE AINDA PRECISA DE DECISÃO', texto: 'Não existe política formal de uso de IA no escritório, nem repositório privado institucional, nem definição de quem homologa uma rotina antes de virar padrão da área. É o principal pedido desta apresentação.' },
], { cols: 2, rodape: 'Nada aqui substitui juízo profissional — as ferramentas encurtam o caminho até ele' });

/* =================== DIVISOR III =================== */
divisor('BLOCO 03', 'O QUE ESTÁ\nEM ANÁLISE', 'Seis propostas de expansão submetidas à avaliação do Comitê');

/* =================== SLIDE 16 — PROPOSTAS =================== */
slideEscuro('PROPOSTAS EM AVALIAÇÃO', 'Todas partem de algo que já funciona — são extensões, não recomeços', [
  { rotulo: 'MEMÓRIA DA ÁREA', texto: 'Banco pesquisável das peças e teses já produzidas pelo escritório. Hoje a experiência acumulada está espalhada em pastas; indexada, passaria a alimentar cada peça nova. Maior ganho potencial da lista.' },
  { rotulo: 'JURISPRUDÊNCIA AMPLIADA', texto: 'Estender o índice ao TJMG e ao TRF6, que concentram nossa carteira, e adicionar busca por sentido, não só por palavra exata. Depende de fonte de dados: fora do STJ não há dump aberto equivalente.' },
  { rotulo: 'ASSISTENTE DE AUDIÊNCIA', texto: 'Ligar a transcrição já existente ao comparador de versões: sai da audiência com o depoimento transcrito e as contradições em relação às versões anteriores já apontadas.' },
  { rotulo: 'DOSIMETRIA E ANPP', texto: 'Rotina para cálculo de pena e avaliação de requisitos de acordo de não persecução penal, com simulação de cenários de proposta. Cálculo conferível, não estimativa.' },
  { rotulo: 'PAINEL DA CARTEIRA CRIMINAL', texto: 'Visão única de fase processual, próximos atos, prazos e risco por caso. Depende de acesso de leitura ao ADVWin — hoje o dado entra por exportação manual.' },
  { rotulo: 'RESPOSTA A OFÍCIOS GENERALIZADA', texto: 'Transformar o gerador feito para um cliente específico em ferramenta para qualquer requisição de autoridade, aproveitando a estrutura já validada na prática.' },
], { rodape: 'Estimativas de esforço e ordem de execução no slide seguinte' });

/* =================== SLIDE 17 — 90 DIAS =================== */
slideClaro('PLANO SUGERIDO PARA 90 DIAS', [
  { titulo: 'DIAS 1 A 30  ·  CONSOLIDAR', texto: 'Formalizar a política de uso de IA e o repositório privado institucional. Treinar a equipe criminal nas rotinas que já existem — o maior ganho imediato não é construir mais, é fazer o que já está pronto ser usado por todos.' },
  { titulo: 'DIAS 31 A 60  ·  MEMÓRIA', texto: 'Construir o banco interno de peças e teses e ligá-lo às rotinas de produção. É a proposta com maior retorno e a que mais depende de decisão institucional sobre onde o acervo pode ficar hospedado.' },
  { titulo: 'DIAS 61 A 90  ·  INTEGRAR', texto: 'Assistente de audiência e painel da carteira criminal, ambos condicionados a acesso: um ao ambiente de transcrição, outro ao ADVWin. Dosimetria e ANPP entram aqui se houver folga.' },
  { titulo: 'COMO MEDIR', texto: 'Proponho acompanhar três indicadores simples desde o dia 1: número de peças que passaram por alguma rotina, tempo entre recebimento dos autos e primeira minuta, e adesão da equipe. Sem medição, a discussão do próximo ciclo vira opinião.' },
], { rodape: 'Execução dentro da própria área, sem contratação externa — o que muda é o tempo alocado' });

/* =================== SLIDE 18 — PEDIDOS =================== */
slideEscuro('O QUE PEÇO AO COMITÊ', 'Seis decisões destravam tudo o que foi apresentado no bloco anterior', [
  { rotulo: 'POLÍTICA DE IA', texto: 'Regra formal sobre que tipo de informação de cliente pode ser submetida a ferramenta de IA, com o crivo do sigilo profissional. Hoje o critério é individual — deveria ser institucional.' },
  { rotulo: 'REPOSITÓRIO PRIVADO', texto: 'Ambiente institucional para o que é confidencial. Parte do material já precisa ficar deliberadamente fora do repositório público por não haver alternativa.' },
  { rotulo: 'ACESSO AO ADVWIN', texto: 'Leitura automatizada dos dados de tarefas, prazos e andamentos. Sem isso, painel de produtividade e painel de carteira continuam dependendo de exportação manual.' },
  { rotulo: 'LICENÇAS E TREINAMENTO', texto: 'Licenças para a equipe criminal e tempo formalmente alocado para treinamento. Ferramenta não usada não gera retorno algum.' },
  { rotulo: 'AMBIENTE COM REDE LIBERADA', texto: 'Os pipelines de dados precisam alcançar PGFN, STJ e APIs públicas de CNPJ. Hoje essa etapa roda em máquina pessoal por restrição de rede.' },
  { rotulo: 'QUEM HOMOLOGA', texto: 'Definir quem aprova uma rotina antes de ela virar padrão da área, e como se registra essa aprovação. É a peça que falta para escalar isso para além de uma pessoa.' },
], { rodape: 'Sem essas decisões, o que existe continua funcionando — mas continua dependendo de iniciativa individual' });

/* =================== SLIDE 19 — FECHAMENTO =================== */
const fech = pptx.addSlide();
fech.background = { color: T.preto };
fech.addShape(pptx.ShapeType.rect, { x: 9.0, y: 0, w: 4.333, h: 3.4, fill: { color: '1A1A1B' }, line: { color: '1A1A1B' } });
fech.addText('EM SÍNTESE', { x: 0.6, y: 1.5, w: 8, h: 0.4, fontFace: F, fontSize: 12, color: T.amarelo, charSpacing: 3 });
fech.addText('A área criminal já opera\ncom essas ferramentas.', { x: 0.6, y: 2.0, w: 8.4, h: 1.5,
  fontFace: 'Segoe UI Light', fontSize: 34, color: T.branco, charSpacing: 1.2, lineSpacingMultiple: 1.05 });
fech.addShape(pptx.ShapeType.line, { x: 0.62, y: 3.65, w: 4.0, h: 0, line: { color: T.amarelo, width: 2.5 } });
fech.addText('O que trago ao Comitê não é um pedido de aprovação para começar, e sim as decisões institucionais que permitem transformar iniciativa individual em capacidade do escritório.', {
  x: 0.6, y: 3.95, w: 8.2, h: 1.4, fontFace: F, fontSize: 15, color: 'CFCFCF', lineSpacingMultiple: 1.2 });
banda(fech);

/* =================== SLIDE 20 — CONTATO =================== */
const contato = pptx.addSlide();
contato.background = { color: T.preto };
contato.addShape(pptx.ShapeType.rect, { x: 0.6, y: 0.6, w: 0.7, h: 0.7, fill: { color: T.preto }, line: { color: 'A0A0A0', width: 1.5 } });
contato.addText('TPC', { x: 0.6, y: 0.6, w: 0.7, h: 0.7, fontFace: F, fontSize: 14, bold: true,
  color: T.branco, align: 'center', valign: 'middle', charSpacing: 2 });
contato.addText([
  { text: 'TOLEDO, PAOLIELLO, DE PAULA,', options: { breakLine: true } },
  { text: 'CAMPOS, CUNHA E CORDEIRO ', options: {} },
  { text: 'ADVOGADOS.', options: { bold: true } },
], { x: 1.4, y: 0.6, w: 7.0, h: 0.7, fontFace: F, fontSize: 11, color: T.branco, charSpacing: 1.5, valign: 'middle' });
const enderecos = [
  { cidade: 'BELO HORIZONTE', linhas: ['Rua Yvon Magalhães Pinto, 615, 8º andar | São Bento', 'Belo Horizonte | MG | CEP 30350.560 | Tel. (31) 3527.5800'] },
  { cidade: 'SÃO PAULO', linhas: ['Rua Bandeira Paulista, 726, 17º andar | Itaim Bibi', 'São Paulo | SP | CEP 04532.002 | Tel. (11) 3056.2110'] },
  { cidade: 'BRASÍLIA', linhas: ['SHS Quadra 6, Brasil 21, Bloco A, sala 501', 'Brasília | DF | CEP 70316.102 | Tel. (61) 2193.1283'] },
  { cidade: 'CUIABÁ', linhas: ['Av. das Flores, 945, 10º andar', 'Jardim Cuiabá | Cuiabá | MT | CEP 78043.172'] },
  { cidade: 'JOÃO MONLEVADE', linhas: ['Av. Wilson Alvarenga, 1.059, sala 601 | Carneirinhos', 'João Monlevade | MG | CEP 35930.001 | Tel. (31) 3193.0191'] },
];
enderecos.forEach((e, i) => {
  const y = 2.0 + i * 1.0;
  contato.addText(e.cidade, { x: 0.6, y, w: 6, h: 0.3, fontFace: F, fontSize: 11, bold: true, color: T.branco, charSpacing: 1 });
  contato.addText(e.linhas.join('\n'), { x: 0.6, y: y + 0.3, w: 7, h: 0.6, fontFace: F, fontSize: 9, color: T.branco });
});
banda(contato);

pptx.writeFile({ fileName: process.argv[2] || 'APRESENTACAO.pptx' }).then(() => console.log('OK'));
