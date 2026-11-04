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
  procuracao/
    procuracao.js             Texto e concordância (skill procuracao-tpc), validação sem lacunas e .docx sobre o arquivo-base
    app.js                    Formulário e pré-visualização
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

## Bibliotecas (CDN, versões fixas)

pdf.js 3.11.174 · tesseract.js 5.1.1 (modelo `por`) · exifr 7.1.3 · mammoth 1.6.0.

## Degravação de audiências

O programa de degravação (`transcricao.py`, na raiz do repositório) é distribuído como executável para Windows.
O fluxo `.github/workflows/build_transcricao.yml` gera o `Transcricao.exe` a cada alteração e o publica na release
`transcricao`; o botão do HUB aponta para
`https://github.com/viniciuspapapapa/viniciuspapapapa.github.io/releases/download/transcricao/Transcricao.exe`.
