# Boleto e nota fiscal: configuração do Asaas

Este guia ativa o registro de boletos (com PIX), a emissão de NFS-e de Belo Horizonte e a baixa automática dos pagamentos na plataforma de honorários. A configuração é feita uma única vez e leva cerca de 30 minutos.

O sistema funciona em três partes. A **plataforma** roda no seu navegador. O **serviço intermediário** é um pequeno programa no Cloudflare, gratuito, que guarda a chave do Asaas em segurança, fora do navegador. O **Asaas** registra os boletos no banco, emite as notas na prefeitura e avisa quando o cliente paga.

## 1. Conta e configuração fiscal no Asaas

1. Abra uma conta em [asaas.com](https://www.asaas.com) no CNPJ que fatura os honorários e conclua a aprovação cadastral.
2. Em **Notas fiscais > Configurações**, cadastre as informações fiscais do escritório para Belo Horizonte: inscrição municipal, regime tributário (sociedade uniprofissional, se for o caso), certificado digital A1 e série da nota. Confirme os dados com a contabilidade.
3. Em **Pix > Minhas chaves**, cadastre uma chave PIX. É ela que faz o QR Code do boleto continuar válido depois do dia da emissão.
4. Em **Integrações > Chaves de API**, gere uma chave e guarde-a. Ela só aparece uma vez.

> Para testar sem cobrar ninguém, use primeiro o ambiente de testes (sandbox.asaas.com) com uma chave de testes e `ASAAS_ENV = sandbox`.

## 2. Serviço intermediário no Cloudflare

1. Crie uma conta gratuita em [dash.cloudflare.com](https://dash.cloudflare.com).
2. Vá em **Storage & Databases > KV** e crie um namespace chamado `HON`.
3. Vá em **Compute (Workers) > Create > Start with Hello World**, dê o nome `honorarios-asaas` e clique em **Deploy**.
4. Clique em **Edit code**, apague o conteúdo, cole todo o arquivo [`worker.js`](worker.js) e clique em **Deploy**.
5. Em **Settings > Bindings**, adicione um **KV namespace** com o nome de variável `HON`, apontando para o namespace criado no passo 2.
6. Em **Settings > Variables and Secrets**, cadastre:

| Nome | Tipo | Valor |
|---|---|---|
| `ASAAS_API_KEY` | Secret | a chave da API gerada no Asaas |
| `APP_TOKEN` | Secret | uma senha longa inventada por você (será colada na plataforma) |
| `WEBHOOK_TOKEN` | Secret | outra senha longa (será colada no Asaas) |
| `ASAAS_ENV` | Text | `production` (ou `sandbox` para testes) |
| `ALLOWED_ORIGIN` | Text | `https://viniciuspapapapa.github.io` |

7. Anote o endereço do serviço, algo como `https://honorarios-asaas.SEU-USUARIO.workers.dev`.

## 3. Aviso de pagamento (webhook) no Asaas

Em **Integrações > Webhooks**, crie um webhook com:

- **URL:** `https://honorarios-asaas.SEU-USUARIO.workers.dev/webhook`
- **Token de autenticação:** o mesmo valor de `WEBHOOK_TOKEN`
- **Versão da API:** v3; **Tipo de envio:** sequencial
- **Eventos:** todos os de **Cobranças** e todos os de **Notas fiscais**

## 4. Plataforma

Em **Configurações > Boleto bancário e nota fiscal · Asaas**:

1. Marque **Ativar a integração**, cole a URL do serviço e o `APP_TOKEN`, e clique em **Testar conexão**.
2. Em **CNPJ da conta Asaas**, escolha a entidade de faturamento correspondente.
3. Em **Serviço municipal**, use **Buscar na lista do município** (advocacia é o item 17.14 da LC 116/2003) e confira a alíquota de ISS.
4. Preencha os tributos e os **campos da reforma tributária** (código NBS, situação tributária, classificação tributária e indicador de operação) conforme orientação da contabilidade. Desde 1º/10/2026 esses campos são exigidos e a ausência pode levar à rejeição da nota.
5. Garanta que os contratos tenham CPF/CNPJ válido do cliente, que é obrigatório para boleto e nota.

## Como funciona no dia a dia

- **Cobrar** passa a registrar o boleto automaticamente e a incluir no e-mail o link, a linha digitável e o PIX copia e cola.
- Quando o cliente paga, o Asaas avisa o serviço. Ao abrir a plataforma (e a cada 3 minutos com ela aberta), a parcela é baixada sozinha e, se a opção estiver ativa, a NFS-e é emitida automaticamente.
- Parcelas pagas por fora do Asaas têm nota emitida pelo ícone de nota fiscal na parcela.
- Parcelas vencidas geram boleto com o valor atualizado (multa e juros) e novo vencimento em 3 dias.

## Segurança

A chave do Asaas existe apenas no Cloudflare. A plataforma conhece só o `APP_TOKEN`, que fica no navegador (criptografado se a senha da plataforma estiver ativa) e não entra nos backups. O serviço só aceita chamadas do endereço da plataforma, e o webhook só aceita chamadas com o token do Asaas. Se suspeitar de vazamento, troque o `APP_TOKEN` no Cloudflare e na plataforma, e gere nova chave no Asaas.
