# Sincronização automática do app EUA 2027

Este serviço faz com que tudo o que um integrante muda no app (gastos, checklist, reservas, voos cadastrados,
votos em lugares, roteiro escolhido e arquivos anexados) chegue sozinho aos celulares e computadores dos outros.
Ele roda de graça no Cloudflare e guarda apenas dados cifrados no navegador com a chave do grupo: quem tiver
acesso ao painel vê só texto embaralhado.

A configuração é feita uma única vez e leva cerca de 10 minutos, na mesma conta Cloudflare dos outros serviços.

## Passo a passo pelo painel

1. Em [dash.cloudflare.com](https://dash.cloudflare.com), vá em **Storage & Databases > KV** e crie um namespace
   chamado `EUA`.
2. Vá em **Compute (Workers) > Create > Start with Hello World**, dê o nome **`eua27-sync`** (exatamente assim,
   porque o app procura `https://eua27-sync.viniciuspapapapa.workers.dev`) e clique em **Deploy**.
3. Clique em **Edit code**, apague o conteúdo, cole todo o arquivo [`worker.js`](worker.js) e clique em **Deploy**.
4. Em **Settings > Bindings**, adicione um **KV namespace** com o nome de variável `EUA`, apontando para o
   namespace do passo 1.
5. Em **Settings > Variables and Secrets**, cadastre:

| Nome | Tipo | Valor |
|---|---|---|
| `SYNC_TOKEN` | Secret | o token do grupo (derivado da senha do app; peça ao responsável) |
| `ALLOWED_ORIGIN` | Text | `https://viniciuspapapapa.github.io` |

6. Confira abrindo `https://eua27-sync.viniciuspapapapa.workers.dev/status`. Deve aparecer
   `{"ok":true,"servico":"eua27-sync","configurado":true}`.

Pronto: ao abrir o app, a aba Gastos e a tela Viagem › Info passam a mostrar “Sincronizado com o grupo”.

## Como funciona

O app gera o token a partir da chave do grupo (SHA-256 de `eua27-sync:` + chave em base64), então ele muda se a
senha do app for trocada; nesse caso, atualize o `SYNC_TOKEN`. Cada registro vai cifrado com AES-256-GCM e
carrega só a data da última alteração em claro; o servidor guarda sempre a versão mais nova. O app sincroniza a
cada mudança, ao voltar para a tela e a cada 15 segundos enquanto está aberto. Sem mudanças, o serviço só lê o KV,
o que cabe com folga no plano gratuito. Arquivos anexados (até 15 MB cada) ficam no mesmo KV, também cifrados.

Enquanto o serviço não estiver no ar, o app continua funcionando com o link “Enviar ao grupo”.
