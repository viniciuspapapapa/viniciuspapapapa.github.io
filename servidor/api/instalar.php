<?php
/* =========================================================
   Honorários · instalação (cria as tabelas e o administrador)
   Só funciona enquanto não houver nenhum usuário cadastrado.
   ========================================================= */
declare(strict_types=1);
require __DIR__ . '/lib.php';

const SCHEMA = <<<SQL
CREATE TABLE IF NOT EXISTS usuarios (
  id VARCHAR(32) PRIMARY KEY, nome VARCHAR(160) NOT NULL, email VARCHAR(190) NOT NULL UNIQUE,
  senha_hash VARCHAR(255) NOT NULL, perfil VARCHAR(20) NOT NULL, pessoa_id VARCHAR(96) NULL,
  ativo TINYINT NOT NULL DEFAULT 1, prefs LONGTEXT NULL, trocar_senha TINYINT NOT NULL DEFAULT 0,
  criado_em DATETIME NOT NULL, ultimo_acesso DATETIME NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE TABLE IF NOT EXISTS registros (
  colecao VARCHAR(20) NOT NULL, id VARCHAR(96) NOT NULL, dados LONGTEXT NOT NULL, versao INT NOT NULL DEFAULT 1,
  atualizado_em DATETIME NOT NULL, atualizado_por VARCHAR(32) NULL, PRIMARY KEY (colecao, id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE TABLE IF NOT EXISTS arquivos (
  id VARCHAR(64) PRIMARY KEY, nome VARCHAR(200) NOT NULL, tipo VARCHAR(100) NULL, tamanho INT NOT NULL,
  criado_em DATETIME NOT NULL, criado_por VARCHAR(32) NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE TABLE IF NOT EXISTS auditoria (
  id BIGINT AUTO_INCREMENT PRIMARY KEY, em DATETIME NOT NULL, usuario_id VARCHAR(32) NULL, usuario_nome VARCHAR(160) NULL,
  acao VARCHAR(40) NOT NULL, colecao VARCHAR(20) NULL, registro_id VARCHAR(96) NULL, resumo VARCHAR(500) NULL, ip VARCHAR(64) NULL,
  INDEX (em)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE TABLE IF NOT EXISTS codigos_login (
  usuario_id VARCHAR(32) PRIMARY KEY, codigo_hash VARCHAR(255) NOT NULL, expira DATETIME NOT NULL, tentativas INT NOT NULL DEFAULT 0
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE TABLE IF NOT EXISTS tentativas_login (
  chave VARCHAR(220) PRIMARY KEY, qtd INT NOT NULL, ate DATETIME NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE TABLE IF NOT EXISTS asaas_eventos (
  id VARCHAR(120) PRIMARY KEY, evento VARCHAR(60) NOT NULL, dados LONGTEXT NOT NULL, recebido_em DATETIME NOT NULL,
  processado TINYINT NOT NULL DEFAULT 0, INDEX (recebido_em)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE TABLE IF NOT EXISTS asaas_nf_pendente (
  payment_id VARCHAR(64) PRIMARY KEY, config LONGTEXT NOT NULL, criado_em DATETIME NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE TABLE IF NOT EXISTS meta (
  chave VARCHAR(40) PRIMARY KEY, valor BIGINT NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
INSERT IGNORE INTO meta (chave, valor) VALUES ('rev', 1);
SQL;

header('Content-Type: text/html; charset=utf-8');
header('X-Frame-Options: DENY');
$msg = ''; $ok = false;
try {
    foreach (array_filter(array_map('trim', explode(';', SCHEMA))) as $sql) db()->exec($sql);
    $existe = (int) q('SELECT COUNT(*) FROM usuarios')->fetchColumn() > 0;
    if ($existe) { $ok = true; $msg = 'O sistema já está instalado. Por segurança, apague este arquivo (api/instalar.php) no Gerenciador de Arquivos.'; }
    elseif ($_SERVER['REQUEST_METHOD'] === 'POST') {
        $nome = trim($_POST['nome'] ?? ''); $email = mb_strtolower(trim($_POST['email'] ?? '')); $senha = (string) ($_POST['senha'] ?? '');
        if (!$nome || !filter_var($email, FILTER_VALIDATE_EMAIL) || mb_strlen($senha) < 10) $msg = 'Informe nome, e-mail válido e senha com ao menos 10 caracteres.';
        else {
            q('INSERT INTO usuarios (id, nome, email, senha_hash, perfil, ativo, prefs, trocar_senha, criado_em) VALUES (?,?,?,?,?,1,?,0,?)', [uid(), $nome, $email, password_hash($senha, PASSWORD_DEFAULT), 'admin', '{}', agora()]);
            auditar(null, 'instalacao', '', '', "Administrador inicial: $email");
            $ok = true; $msg = 'Instalação concluída. Apague este arquivo (api/instalar.php) e acesse o sistema pelo endereço principal.';
        }
    }
} catch (Throwable $e) { $msg = 'Falha: ' . $e->getMessage() . '. Confira os dados do banco em config-honorarios.php.'; }
$h = fn($s) => htmlspecialchars((string) $s, ENT_QUOTES);
?><!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Instalação · Honorários</title>
<style>body{font-family:system-ui,sans-serif;background:#141414;color:#EDECEC;display:grid;place-items:center;min-height:100vh;margin:0;padding:16px}form,div.box{width:min(420px,100%)}h1{font-weight:400}label{display:block;font-size:13px;margin:14px 0 6px;color:#CECCCB}input{width:100%;box-sizing:border-box;padding:10px;border-radius:4px;border:1px solid #3D3D3D;background:#1E1E1E;color:#fff;font-size:15px}button{margin-top:20px;width:100%;padding:11px;border:0;border-radius:4px;background:#F5EF90;color:#141414;font-weight:700;font-size:15px}.msg{border-left:3px solid #F5EF90;padding:10px 12px;background:#1E1E1E;margin-top:14px}</style></head><body>
<?php if ($ok): ?><div class="box"><h1>Honorários · TPC</h1><p class="msg"><?= $h($msg) ?></p><p><a href="../" style="color:#F5EF90">Ir para o sistema</a></p></div>
<?php else: ?><form method="post" autocomplete="off"><h1>Instalação</h1><p>Crie o primeiro administrador do sistema.</p>
<?php if ($msg): ?><p class="msg"><?= $h($msg) ?></p><?php endif; ?>
<label>Nome</label><input name="nome" required value="<?= $h($_POST['nome'] ?? '') ?>"><label>E-mail</label><input type="email" name="email" required value="<?= $h($_POST['email'] ?? '') ?>"><label>Senha (mínimo 10 caracteres)</label><input type="password" name="senha" required minlength="10"><button>Concluir instalação</button></form><?php endif; ?>
</body></html>
