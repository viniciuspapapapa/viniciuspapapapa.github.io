<?php
/* =========================================================
   Honorários · TPC Advogados · configuração do servidor
   Salve como "config-honorarios.php" na pasta do domínio,
   FORA da public_html (ex.: domains/seudominio.com.br/).
   ========================================================= */
return [
    'db' => [
        'host' => 'localhost',
        'nome' => 'u000000000_honorarios',      // hPanel > Bancos de dados MySQL
        'usuario' => 'u000000000_honorarios',
        'senha' => 'SENHA_DO_BANCO',
    ],
    'fuso' => 'America/Sao_Paulo',
    'sessao_minutos' => 240,                   // encerra a sessão após 4 h sem uso
    'dois_fatores' => true,                    // código de acesso por e-mail a cada login
    'email_remetente' => 'sistema@seudominio.com.br', // crie a caixa em hPanel > E-mails

    // Pasta dos contratos anexados (fora da public_html).
    // Se omitida, usa domains/seudominio.com.br/arquivos-honorarios
    // 'arquivos_dir' => '/home/u000000000/domains/seudominio.com.br/arquivos-honorarios',

    'asaas' => [
        'ambiente' => 'production',            // 'sandbox' para testes
        'chave_api' => '',                     // Asaas > Integrações > Chaves de API
        'webhook_token' => '',                 // senha longa; a mesma do webhook no Asaas
    ],
];
