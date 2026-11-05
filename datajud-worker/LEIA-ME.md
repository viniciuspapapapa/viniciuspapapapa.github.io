# Serviço intermediário do DataJud (Cloudflare Worker)

A ferramenta **Relatório processual ao cliente** do HUB consulta as movimentações dos processos na API Pública do DataJud (CNJ). O teste realizado em novembro de 2026 mostrou que a API responde normalmente a consultas feitas por servidor, mas **não envia o cabeçalho `Access-Control-Allow-Origin`**, de modo que o navegador bloqueia a consulta feita diretamente pela página do HUB. Este Worker resolve o bloqueio: a página envia o número do processo ao Worker, que consulta o DataJud e devolve o resultado com a permissão de origem restrita ao endereço do HUB.

O Worker identifica o tribunal pelo próprio número do processo (segmentos J e TR do padrão CNJ), segundo a lista oficial de endpoints em <https://datajud-wiki.cnj.jus.br/api-publica/endpoints>. O STF não integra a API Pública.

## Configuração pelo painel (sem instalar nada)

1. Acesse <https://dash.cloudflare.com>, crie uma conta gratuita se necessário e abra **Workers & Pages > Create > Create Worker**.
2. Dê o nome `datajud-tpc` e clique em **Deploy**. Em seguida, clique em **Edit code**, apague o conteúdo, cole o arquivo `worker.js` desta pasta e clique em **Deploy**.
3. Em **Settings > Variables and Secrets**, adicione:
   - `ALLOWED_ORIGIN` (texto) com o valor `https://viniciuspapapapa.github.io`;
   - `APP_TOKEN` (secret, opcional, recomendado) com uma senha de sua escolha;
   - `DATAJUD_API_KEY` (secret, opcional) somente se o CNJ alterar a chave pública. Sem ela, o Worker usa a chave pública vigente.
4. Copie o endereço do Worker (algo como `https://datajud-tpc.SEU-USUARIO.workers.dev`).
5. No HUB, abra **Relatório processual**, clique em **Configurar DataJud**, cole o endereço e, se tiver criado o `APP_TOKEN`, a mesma senha. As configurações ficam salvas apenas no navegador.

## Worker ligado ao GitHub (Workers Builds)

Se o Worker foi criado a partir deste repositório, o Cloudflare refaz a implantação a cada publicação no GitHub. Sem
ajuste, ele implanta a raiz do repositório, que não contém o código do serviço, e o endereço passa a responder 404 em
branco. Para corrigir, abra o Worker, vá a Settings > Build e informe `datajud-worker` em "Root directory" (os comandos
de build ficam vazios e o de implantação é `npx wrangler deploy`). Depois, clique em "Retry build" ou faça nova
implantação. A partir daí, cada publicação implanta o código correto, e o `APP_TOKEN`, como segredo, é preservado.

## Configuração pela linha de comando

```bash
cd datajud-worker
npx wrangler deploy
npx wrangler secret put APP_TOKEN
```

## Testar

```bash
curl -s https://datajud-tpc.SEU-USUARIO.workers.dev/status
```

```bash
curl -s -X POST https://datajud-tpc.SEU-USUARIO.workers.dev/consulta -H "Content-Type: application/json" -H "x-app-token: SUA-SENHA" -d '{"numero":"0000000-00.0000.8.13.0000"}'
```

## Observações

O plano gratuito do Cloudflare Workers comporta 100 mil requisições por dia, muito acima do uso esperado. O Worker não armazena dados: apenas repassa a consulta. As informações do DataJud são públicas e podem ter defasagem em relação ao sistema do tribunal; processos em segredo de justiça não são retornados.
