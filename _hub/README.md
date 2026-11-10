# HUB Criminal · TPC Advogados

Conjunto de ferramentas web para a advocacia criminal, publicado no GitHub Pages em `/hub/`.
Tudo roda no navegador: os documentos dos clientes não são enviados a servidores.

## Acesso protegido

As fontes ficam em `_hub/`, pasta que o GitHub Pages não publica. A pasta `hub/` contém apenas a versão protegida,
gerada por `_ferramentas/proteger-hub.mjs`: cada página tem os scripts e estilos locais incorporados e é cifrada com
AES-256-GCM; os modelos (.pdf, .docx) são cifrados à parte. A chave deriva da senha do escritório (PBKDF2-SHA256,
600 mil iterações). Sem a senha, `/hub/` redireciona para `/hub/login/`; a sessão dura até fechar a aba ou, com
"manter conectado", 30 dias. Fontes e imagens da marca permanecem públicas.

O fluxo `.github/workflows/proteger_hub.yml` refaz a publicação a cada alteração em `_hub/`, usando a senha guardada no
segredo `HUB_SENHA` do repositório. Para trocar a senha: atualize o segredo e execute o fluxo "Proteger HUB" em Actions.
Como o repositório é público, o código-fonte continua visível no GitHub; para ocultá-lo, torne o repositório privado.

Edite sempre os arquivos em `_hub/`; não edite `hub/`, que é sobrescrita a cada publicação.

## Estrutura

```
_hub/  (publicada cifrada em hub/)
  index.html                  Página inicial do HUB (catálogo de ferramentas)
  login/index.html            Página de login (pública)
  assets/hub.css, hub.js      Identidade visual TPC, tema claro/escuro, utilidades
  assets/tpc-cabecalho.png    Timbrado usado nos documentos Word; tpc-barra.png, barra amarela do rodapé
  dados/
    legislacao.js             CPP 158 a 158-F, 6º, 157, 159, 169-170, 245; CF; SV 14; Marco Civil; Leis 11.343 e 9.296; normas técnicas
    doutrina.js               Sínteses doutrinárias (Prado, Badaró, Aury Lopes Jr., Brasileiro, ISO 27037)
    precedentes.js            59 precedentes do STJ (dossiê IJCrim) + precedentes complementares
    rif-juridico.js           Base da ferramenta de RIF: precedentes (Temas 990 e 1.404, STJ, STF), normas, NT CACOP 02/2026, doutrina
  cadeia-de-custodia/
    index.html                Interface da ferramenta
    regras.js                 Etapas, tipos de vestígio, peças processuais, 39 critérios e alertas (padrões editáveis)
    motor.js                  Leitura de PDF/OCR/imagens/DOCX, hash SHA-256 e análise
    relatorio.js              Relatório técnico e minuta de tese
    dossie.js                 Dossiê completo (falhas, jurisprudência aplicável e como utilizá-la, diligências, riscos, minuta)
    ia.js                     Análise complementar opcional (API do Claude, chave do próprio usuário)
    app.js                    Controlador da interface
  assets/doc.js               Exportação comum de relatórios (.doc, cópia e impressão)
  assets/peca.js              Peças no padrão TPC (endereçamento, seções, tabelas, assinaturas) em Word e pré-visualização
  assets/modelo-tpc.docx      Arquivo-base institucional comum às peças (mesmo timbrado da procuração; corpo {{BODY}})
  procuracao/
    procuracao.js             Texto e concordância (skill procuracao-tpc), substabelecimento, validação sem lacunas e .docx
    app.js                    Formulário (procuração ou substabelecimento) e pré-visualização
    modelo-procuracao.docx    Arquivo-base institucional da procuração (cabeçalho, rodapé e faixa amarela; corpo {{BODY}})
  proposta/
    proposta.js               Valores por extenso, cláusula de honorários e diagramação sobre o modelo (pdf-lib, fontes Inter)
    app.js                    Formulário e pré-visualização
    modelo-proposta.pdf       Modelo da proposta do escritório, sem dados de cliente (campos variáveis removidos)
  organizador/
    capa.js                   Capa institucional da skill organizador-documentos (medidas, paleta e fontes Lato)
    drive.js                  Google Drive API v3 (chave de API para links públicos; OAuth para arquivos privados)
    app.js                    Montagem, classificação por IA, agrupamento, orientação, refação de capas e verificação
  assets/fonts/               Inter e Lato (SIL Open Font License) para os PDFs gerados no navegador
  estudo-de-caso/
    leitor.js                 Leitura integral dos PDFs (pdf.js) com OCR (Tesseract) e marcadores de página e ID
    catalogo.js               Catálogo jurídico: tipos penais (elementos, penas, ação, teses), peças e sinais de nulidade
    analise.js                Motor do estudo por regras, sem IA: peças, cronologia, pessoas, tipificação, provas, teses e redação
    prompt.js                 Instruções do projeto Estudo de Caso Criminal, usadas apenas no aprofundamento opcional
    docx.js                   Texto marcado -> pré-visualização e Word sobre o modelo do escritório
    app.js                    Fluxo da interface; aprofundamento opcional pela API da OpenAI, com a chave do próprio usuário
    modelo-estudo.docx        Modelo Word (estilos, numeração, timbrado e rodapé do escritório, corpo vazio)
  reconhecimento/
    regras.js                 Quesitos (CPP, arts. 226 a 228; Res. CNJ 484/2022), variáveis de estimativa, avaliação e base jurídica
    app.js                    Atos de reconhecimento, sugestões a partir do texto, contaminação em cadeia e relatório
  prescricao/
    motor.js                  Cálculo da prescrição (CP, arts. 109 a 119; Lei 810/1949; Súmula 415 do STJ; Tema 788)
    app.js                    Formulário, linha do tempo e relatório
  execucao/
    motor.js                  Dosimetria (CP, arts. 59 a 68, 33, 44 e 77) e execução: art. 112 da LEP vigente (Leis
                              15.402/2026 e 15.358/2026), remição, detração, livramento (CP, art. 83); datas pelo motor da prescrição
    requerimento.js           Requerimentos de progressão e de livramento condicional no padrão TPC
    app.js                    Abas de dosimetria e de execução, memória de cálculo e requerimento
  relatorio/
    traducao.js               Tribunal pelo número CNJ, movimentações do DataJud, do texto colado ou do PDF dos autos,
                              tradução para linguagem acessível e situação atual
    relatorio.js              Relatório periódico ao cliente no padrão TPC
    base.js                   Base de processos no navegador (IndexedDB): planilha, atualização em lote, cópia de segurança
    envio.js                  Outlook (Microsoft Graph com MSAL, ou e-mail .eml pronto) e WhatsApp (wa.me)
    app.js                    Abas da base e do relatório, edição do texto na visualização e envio
  login/oauth.html            Página de retorno do login Microsoft (pública, sem conteúdo)
  custodia/
    prompt.js                 Instruções da elaboração por IA (método da skill audiencia-de-custodia, estrutura do
                              requerimento de referência, redação vigente do CPP e da Lei 11.340/2006, precedentes)
    motor.js                  Leitura do auto, rascunho por regras (sem IA) e roteiro oral
    app.js                    Anexo do processo, elaboração pelo Claude, da Anthropic (chave do usuário) e peça editável em Word
  patrimonio/
    motor.js                  Cálculos do diagnóstico patrimonial e sucessório (ITCMD, inventário, aluguéis na pessoa física
                              e na holding antes e depois da reforma, cenários, riscos e roteiro) e relatório por regras
    prompt.js                 Instruções da redação pelo Claude (base normativa autorizada, estrutura e estilo)
    documentos.js             Leitura dos documentos do cliente (matrícula, IRPF e IPTU) com OCR, extração por regras ou
                              pelo Claude, conciliação com o formulário e pontos de conferência (ônus, titularidade, divergências)
    apresentacao.js           Apresentação no modelo institucional (lâminas fixas em apresentacao/ e lâminas do caso montadas
                              do formulário e do texto do diagnóstico, inclusive editado), com prévia e PowerPoint (PptxGenJS)
    apresentacao/             Lâminas institucionais (JPG), ícones e logotipo extraídos do modelo do escritório (públicos)
    app.js                    Formulário com rascunho local, anexos com revisão antes de aplicar, panorama, redação pelo
                              Claude, diagnóstico editável (edições salvas no navegador) em Word e apresentação
  pdf/
    nucleo.js                 Bibliotecas sob demanda (pdf.js, pdf-lib, qpdf em WebAssembly, Tesseract, mammoth, SheetJS,
                              PptxGenJS, html2pdf, jsdiff), texto com posição, .docx mínimo, perfil sRGB e downloads
    visor.js                  Grade de miniaturas (selecionar, girar, reordenar) e visor de página com objetos (texto,
                              imagem, formas, desenho, assinatura, tarja, recorte e campos), com conversão para o PDF
    ferramentas.js            As 33 ferramentas: registro, opções e execução
    office.js                 Word, Excel, PowerPoint e HTML para PDF; PDF para PowerPoint e Excel
    ia.js                     Resumo, tradução e refino de Markdown pelo Claude (chave do usuário)
    app.js                    Grade das ferramentas, mesa de trabalho e resultados
  usuarios/
    app.js                    Busca de perfis por nome de usuário (porte do Sherlock): lotes paralelos ao serviço
                              sherlock-tpc (pasta sherlock-worker/ na raiz), resultados, TXT, CSV, Excel e relatório Word
  pesquisa/
    app.js                    Pesquisa por CPF/CNPJ, nome, telefone e placa em fontes públicas (DJEN do CNJ, Querido Diário,
                              Portal da Transparência pelo serviço sherlock-tpc em /publico, BrasilAPI), consultas oficiais
                              com captcha, histórico mascarado e relatório Word com finalidade e horários
  doutrina/
    app.js                    Pesquisa doutrinária: base cifrada do ramo doutrina-base (gerada por _ferramentas/doutrina/
                              no fluxo doutrina.yml), cache no navegador, busca inteligente com Claude, citação ABNT,
                              visualização do PDF do Drive, exportação em Word e botão de atualização (serviço sherlock-tpc)
    motor.js                  Motor de busca (Web Worker): normalização, radicais, expressões exatas, relevância e trechos
    obras.js                  Dados bibliográficos revisados de cada obra (por ID do Drive), usados nas citações
  vendor/                     Bibliotecas abertas hospedadas no HUB (publicadas sem cifra; versões em VERSOES.txt)
  certidoes/
    catalogo.js               Serviços oficiais de certidão criminal (27 TJs, TRF1 a TRF6, STM, TJMs, TSE, STF, STJ, PF, BNMP)
    leitor.js                 Leitura das certidões em PDF: órgão, resultado, datas, números CNJ e conferência do pesquisado
    app.js                    Painel de emissão, dados para colar, importação dos PDFs, relatório e envio à base do relatório
  risco/
    questionario.js           Questionário (lavagem, tributário, anticorrupção, ambiental), pontuação e parecer
    app.js                    Interface do questionário e do parecer
  rif/
    index.html                Interface (layout de painel analítico, abas e relatórios)
    md5.js                    MD5 para conferência do código de controle dos CSV do COAF
    motor.js                  Leitura dos CSV (Comunicações, Envolvidos, Ocorrências), fluxos por seção do relato,
                              reconciliação, dupla contagem, recursos próprios, inconsistências e pontos favoráveis
    comparador.js             Leitura do relatório policial em PDF (com OCR), reconstrução das tabelas e verificação
                              de cada transação contra o RIF
    relatorio.js              Controle de legalidade, relatório da defesa, relatório comparativo e exportação .doc
    estudo.js                 Estudo de caso criminal no padrão TPC (prosa, seções romanas, parágrafos numerados,
                              citações recuadas), gerado em .docx no navegador com timbrado e rodapé institucional
    app.js                    Controlador da interface
```

## Análise de RIF

A ferramenta recebe os três CSV do COAF (separador `;`, codificação detectada automaticamente) e o relatório policial em PDF.
Os fluxos são lidos nas seções “principais remetentes/depositantes” e “principais destinatários” do relato bancário, e não por
proximidade de palavras, para preservar o sentido real do dinheiro. Para incluir precedentes, acrescente objetos em
`dados/rif-juridico.js` (`{ id, tribunal, orgao, proc, rel?, data, posicao: base|favoravel|contraria|neutra, tese, uso }`) e
cite o `id` nos achados de `relatorio.js`.

## Como alimentar a base jurídica

Os arquivos de `dados/` são arrays JavaScript simples. Para incluir novos itens, basta acrescentar objetos no mesmo formato:

- **Legislação** (`HUB_LEGISLACAO`): `{ id, diploma, artigo, rotulo, texto, nota?, sintese?, tags[] }`. Use `sintese: true` quando o texto for resumo e não redação literal.
- **Doutrina** (`HUB_DOUTRINA`): `{ id, autor, obra, ref, ideias[], tags[] }`.
- **Precedentes** (`HUB_PRECEDENTES`): `{ id, n, proc, turma, tribunal, rel, dje, titulo, contexto, questoes: [{ q, t }], desfecho, url, tags[], fonte }`.
  As `tags` alimentam os filtros (acesso, extracao, hash, prints, copia, original, intercept, nuvem, midia, onus, derivada, pericia, whatsapp).
  Para vincular um precedente a um critério de verificação, inclua o número `n` (ou o `id`) no array `prec` do critério em `cadeia-de-custodia/regras.js`.

## Ajuste dos critérios

Cada critério em `regras.js` tem `pos` (indícios de cumprimento) e `neg` (indícios de vício), em expressões regulares aplicadas sobre texto
minúsculo e sem acentos, além das minutas `falta` e `vicio` usadas no relatório (`{v}` é o vestígio; `{p}` as páginas).

## Central de certidões

Os tribunais protegem a emissão com verificação humana (captcha), de modo que cada certidão é emitida pelo usuário no
serviço oficial; a ferramenta organiza o painel, deixa os dados prontos para colar, lê os PDFs baixados e redige o
relatório. Os endereços estão em `certidoes/catalogo.js` (conferidos em novembro de 2026): `st: "ok"` respondeu ao
teste, `"doc"` consta de documento oficial recente mas não respondeu ao teste feito do exterior, e `"portal"` leva à
página principal do órgão. Atualize o catálogo quando um tribunal mudar o endereço.

## Configurações das integrações

O endereço e a senha do serviço do DataJud e o ID do aplicativo Microsoft 365 não ficam nas fontes (o repositório é
público): `_ferramentas/proteger-hub.mjs` os incorpora apenas às páginas cifradas, a partir das variáveis
`HUB_DATAJUD_URL` (padrão: o Worker `datajud-tpc` do escritório), `HUB_DATAJUD_TOKEN` (padrão: a própria `HUB_SENHA`),
`HUB_OUTLOOK_CLIENT_ID` e `HUB_OUTLOOK_TENANT`. No fluxo "Proteger HUB", cadastre-as em Settings > Secrets and variables >
Actions (o token como segredo; as demais como variáveis). Cada navegador pode sobrepor esses valores na própria ferramenta.

## Envio pelo Outlook (Microsoft 365)

O botão "Enviar pelo Outlook" envia o e-mail com o relatório anexado pela conta Microsoft 365 do advogado, por meio do
Microsoft Graph. Para habilitá-lo, uma única vez:

1. Em <https://entra.microsoft.com>, abra Aplicativos > Registros de aplicativo > Novo registro. Nome: `HUB TPC Relatórios`.
   Tipos de conta: "Somente contas deste diretório organizacional" (ou, se o e-mail do escritório não for Microsoft 365
   corporativo, "contas de qualquer diretório e contas Microsoft pessoais").
2. Em URI de redirecionamento, escolha a plataforma "Aplicativo de página única (SPA)" e informe
   `https://viniciuspapapapa.github.io/hub/login/oauth.html`.
3. Em Permissões de API, confirme `Microsoft Graph > Delegadas > Mail.Send` (e `User.Read`). Se o diretório exigir,
   um administrador concede o consentimento.
4. Copie o "ID do aplicativo (cliente)" e o "ID do diretório (locatário)" e informe-os na ferramenta (Configuração do
   Outlook) ou nas variáveis `HUB_OUTLOOK_CLIENT_ID` e `HUB_OUTLOOK_TENANT`.

Sem essa configuração, "Abrir no Outlook" gera um e-mail .eml com destinatário, assunto, texto e anexo, que o Outlook
para Windows ou Mac abre como mensagem nova, pronta para enviar.

## Relatório processual e DataJud

A API Pública do DataJud responde a consultas de servidor, mas não envia o cabeçalho `Access-Control-Allow-Origin`, de
modo que o navegador bloqueia a consulta direta. A pasta `datajud-worker/` contém o serviço intermediário (Cloudflare
Worker gratuito) e o roteiro de instalação em `LEIA-ME.md`. O endereço do Worker e a senha são informados na própria
ferramenta e ficam salvos apenas no navegador. Sem o Worker, a ferramenta funciona com o texto dos andamentos ou com a
cópia atualizada dos autos em PDF.

A base de processos (planilha com número CNJ, cliente, identificação, e-mail e WhatsApp) fica no IndexedDB do navegador.
Ao abrir a ferramenta, os processos sem consulta há mais de 24 horas são atualizados automaticamente, três por vez. Use
"Exportar cópia de segurança" periodicamente e "Restaurar cópia" para levar a base a outro computador.

## Execução penal

As frações de progressão seguem a redação vigente do art. 112 da LEP: caput e incisos I a IV pela Lei 15.402/2026 e
incisos V a VIII pela Lei 15.358/2026. Para fatos anteriores, informe a fração da redação então vigente no campo
"Fração manual" de cada condenação (CF, art. 5º, XL).

## Bibliotecas (CDN, versões fixas)

pdf.js 3.11.174 · tesseract.js 5.1.1 (modelo `por`) · exifr 7.1.3 · mammoth 1.6.0 · pptxgenjs 3.12.0.

## Diagnóstico patrimonial: reforma tributária

O motor (`patrimonio/motor.js`) projeta a tributação dos aluguéis em três momentos e no cronograma ano a ano da
transição (EC 132/2023 e LC 214/2025): 2026 como ano de teste, CBS a partir de 2027 com o split payment, IBS em 10%,
20%, 30% e 40% de 2029 a 2032 e regime pleno em 2033. O ganho de capital latente usa as alíquotas progressivas da
Lei 13.259/2016. Essas regras foram conferidas com os materiais de referência sobre a reforma tributária indicados pelo
escritório (repositórios `AlissonSantos1/brasil-legal-skills` e `asv-digital/agents-contadores`, licença MIT); ao
atualizar alíquotas ou marcos, revise também as instruções da redação em `patrimonio/prompt.js`.

## Degravação de audiências

O programa de degravação (`transcricao.py`, na raiz do repositório) é distribuído como executável para Windows.
O fluxo `.github/workflows/build_transcricao.yml` gera o `Transcricao.exe` a cada alteração e o publica na release
`transcricao`; o botão do HUB aponta para
`https://github.com/viniciuspapapapa/viniciuspapapapa.github.io/releases/download/transcricao/Transcricao.exe`.
