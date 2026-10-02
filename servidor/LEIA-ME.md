# Honorários · instalação no servidor (Hostinger)

Este guia coloca o sistema de honorários num servidor próprio, com login individual, perfis de acesso, dados centralizados e integração com o Asaas sem serviços intermediários. São cerca de 40 minutos, todos pelo painel da Hostinger (hPanel), sem linha de comando.

## O que contratar

Na Hostinger, qualquer plano de **hospedagem de sites** atende: o **Premium** é suficiente para o escritório e o **Business** dá folga de desempenho e backups diários. Registre também o domínio novo (ex.: `honorarios-tpc.com.br`), que costuma vir gratuito no primeiro ano dos planos anuais.

## 1. Preparar a hospedagem

1. No hPanel, vá em **Sites** e adicione o domínio contratado.
2. Em **Segurança > SSL**, ative o certificado gratuito. O sistema só deve ser acessado por `https://`.
3. Em **Avançado > Configuração do PHP**, selecione **PHP 8.2** ou superior.
4. Em **Bancos de dados > Gerenciamento**, crie um banco MySQL. Anote o **nome do banco**, o **usuário** e a **senha**.
5. Em **E-mails**, crie a caixa `sistema@seudominio` (é o remetente dos códigos de acesso).

## 2. Enviar os arquivos

1. Baixe o pacote [`dist/honorarios-hostinger.zip`](dist/honorarios-hostinger.zip).
2. No hPanel, abra **Gerenciador de Arquivos** e entre na pasta do domínio (`domains/seudominio`), **um nível acima** de `public_html`.
3. Envie o zip para essa pasta e use **Extrair**. O resultado deve ser:

```
domains/seudominio/
├── config-honorarios.php     ← configuração (fora do acesso público)
└── public_html/
    ├── index.html, contratos-app.js, img/
    └── api/                  ← servidor do sistema
```

## 3. Configurar

Abra `config-honorarios.php` no editor do Gerenciador de Arquivos e preencha os dados do banco (passo 1.4) e o `email_remetente` (passo 1.5). Os dados do Asaas podem ficar para depois (passo 7).

## 4. Instalar

Acesse `https://seudominio/api/instalar.php`, informe seu nome, e-mail e uma senha de ao menos 10 caracteres. Ao concluir, **apague o arquivo `public_html/api/instalar.php`** no Gerenciador de Arquivos.

## 5. Tarefa agendada

Em **Avançado > Cron Jobs**, crie uma tarefa **Personalizada**, a cada 10 minutos, com o comando:

```
/usr/bin/php /home/SEU_USUARIO/domains/SEUDOMINIO/public_html/api/cron.php
```

O caminho exato da sua conta aparece no topo do Gerenciador de Arquivos.

## 6. Migrar a base atual e criar os usuários

1. Na versão que você usa hoje (GitHub), vá em **Configurações > Dados > Backup** e inclua os arquivos dos contratos.
2. Entre no novo sistema (`https://seudominio`) e, em **Configurações > Dados do servidor**, use **Importar backup para o servidor**.
3. Em **Usuários > Novo usuário**, cadastre a equipe. Para **advogados** e **captadores**, vincule cada usuário à pessoa correspondente em Cadastros; é esse vínculo que define o que cada um enxerga. O sistema mostra uma senha temporária, que a pessoa troca no primeiro acesso.

| Perfil | O que acessa |
|---|---|
| Administrador | Tudo, inclusive usuários, auditoria, Asaas e importação |
| Financeiro | Contratos, cobrança, boletos, notas, baixas, comissões e relatórios |
| Advogado responsável | Consulta dos contratos sob sua responsabilidade, sem comissões |
| Captador / parceiro | Consulta dos contratos que captou e das próprias comissões |

Depois da migração, deixe de usar a versão do GitHub para evitar duas bases paralelas.

## 7. Boleto e nota fiscal (Asaas)

1. Faça no Asaas a configuração fiscal de Belo Horizonte e gere a chave da API (ver [guia do Asaas](../asaas-worker/LEIA-ME.md), passo 1).
2. Em `config-honorarios.php`, preencha `chave_api` e invente um `webhook_token` longo.
3. No Asaas, em **Integrações > Webhooks**, cadastre a URL `https://seudominio/api/asaas/webhook`, o mesmo token, e marque os eventos de **Cobranças** e **Notas fiscais**.
4. No sistema, em **Configurações > Boleto bancário e nota fiscal**, marque **Ativar** e preencha o serviço municipal, os tributos e os códigos da reforma tributária com a contabilidade.

Neste modo não é preciso o Cloudflare: o próprio servidor recebe o aviso de pagamento, dá baixa na parcela e emite a nota no mesmo instante, mesmo com o sistema fechado.

## Segurança

O acesso exige senha e um código enviado por e-mail a cada login, e a sessão expira após 4 horas sem uso. Cinco tentativas erradas bloqueiam o acesso por 15 minutos. Cada perfil recebe do servidor apenas os dados que pode ver. Toda alteração fica registrada em **Usuários > Auditoria**, com usuário, data e IP. A configuração, as senhas do banco, a chave do Asaas e os contratos anexados ficam fora da pasta pública.

Mantenha os backups automáticos da Hostinger ativos e gere, mensalmente, um backup pelo próprio sistema em **Configurações > Dados do servidor**.
