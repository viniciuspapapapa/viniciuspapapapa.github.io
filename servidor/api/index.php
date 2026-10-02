<?php
/* =========================================================
   Honorários · TPC Advogados · API
   ========================================================= */
declare(strict_types=1);
require __DIR__ . '/lib.php';
require __DIR__ . '/asaas.php';

header('X-Content-Type-Options: nosniff');
header('Referrer-Policy: same-origin');
header('X-Frame-Options: DENY');

$r = trim((string) ($_GET['r'] ?? ''), '/');
$m = $_SERVER['REQUEST_METHOD'];

if (str_starts_with($r, 'asaas/')) rotas_asaas($r, $m);

// Proteção contra requisições forjadas: toda escrita exige o cabeçalho próprio da plataforma.
if ($m !== 'GET' && ($_SERVER['HTTP_X_HONORARIOS'] ?? '') !== '1') erro('Requisição recusada.', 403);

try {
    switch (true) {
        case $r === 'sessao':
            $u = usuario();
            json_out(['logado' => (bool) $u, 'usuario' => $u ? publico_usuario($u) : null, 'doisFatores' => (bool) (cfg()['dois_fatores'] ?? true)]);

        case $r === 'login' && $m === 'POST': login(); break;
        case $r === 'login/codigo' && $m === 'POST': login_codigo(); break;
        case $r === 'sair' && $m === 'POST':
            iniciar_sessao(); $u = usuario(); if ($u) auditar($u, 'saida');
            $_SESSION = []; session_destroy(); json_out(['ok' => true]);

        case $r === 'senha' && $m === 'POST':
            $u = exigir(); $b = corpo();
            if (!password_verify((string) ($b['atual'] ?? ''), $u['senha_hash'])) erro('Senha atual incorreta.');
            if (mb_strlen((string) ($b['nova'] ?? '')) < 10) erro('A nova senha deve ter ao menos 10 caracteres.');
            q('UPDATE usuarios SET senha_hash = ?, trocar_senha = 0 WHERE id = ?', [password_hash($b['nova'], PASSWORD_DEFAULT), $u['id']]);
            auditar($u, 'senha-alterada'); json_out(['ok' => true]);

        case $r === 'dados': json_out(dados_para(exigir()));
        case $r === 'rev': exigir(); json_out(['rev' => rev()]);
        case $r === 'sync' && $m === 'POST': sincronizar(exigir(ESCRITA)); break;

        case $r === 'arquivos' && $m === 'POST': salvar_arquivo(exigir(ESCRITA)); break;
        case (bool) preg_match('#^arquivos/([A-Za-z0-9_-]{1,64})$#', $r, $mm):
            if ($m === 'DELETE') { $u = exigir(ESCRITA); apagar_arquivo($mm[1]); auditar($u, 'arquivo-excluido', 'arquivos', $mm[1]); json_out(['ok' => true]); }
            baixar_arquivo(exigir(), $mm[1]); break;

        case $r === 'usuarios' && $m === 'GET':
            exigir(['admin']);
            json_out(['usuarios' => array_map(fn($x) => publico_usuario($x) + ['ativo' => (bool) $x['ativo'], 'ultimoAcesso' => $x['ultimo_acesso']], q('SELECT * FROM usuarios ORDER BY nome')->fetchAll())]);
        case $r === 'usuarios' && $m === 'POST': salvar_usuario(exigir(['admin'])); break;

        case $r === 'auditoria':
            exigir(['admin']);
            json_out(['registros' => q('SELECT em, usuario_nome, acao, colecao, registro_id, resumo, ip FROM auditoria ORDER BY id DESC LIMIT 400')->fetchAll()]);

        case $r === 'importar' && $m === 'POST': importar(exigir(['admin'])); break;
    }
} catch (PDOException $e) {
    error_log('Honorarios DB: ' . $e->getMessage());
    erro('Falha no banco de dados. Tente novamente.', 500);
}
erro('Rota inexistente.', 404);

/* ---------- login em duas etapas ---------- */
function limitar_tentativas(string $chave): void {
    q('DELETE FROM tentativas_login WHERE ate < ?', [agora()]);
    $n = (int) q('SELECT qtd FROM tentativas_login WHERE chave = ?', [$chave])->fetchColumn();
    if ($n >= 6) erro('Muitas tentativas. Aguarde 15 minutos e tente novamente.', 429);
}
function falhou(string $chave): void {
    q('INSERT INTO tentativas_login (chave, qtd, ate) VALUES (?, 1, ?) ON DUPLICATE KEY UPDATE qtd = qtd + 1', [$chave, gmdate('Y-m-d H:i:s', time() + 900)]);
}
function abrir_sessao(array $u): never {
    iniciar_sessao(); session_regenerate_id(true);
    $_SESSION['uid'] = $u['id']; $_SESSION['ult'] = time();
    q('UPDATE usuarios SET ultimo_acesso = ? WHERE id = ?', [agora(), $u['id']]);
    auditar($u, 'entrada');
    json_out(['ok' => true, 'usuario' => publico_usuario($u)]);
}
function login(): never {
    $b = corpo(); $email = mb_strtolower(trim((string) ($b['email'] ?? '')));
    $ip = 'ip:' . ($_SERVER['REMOTE_ADDR'] ?? ''); $ch = 'em:' . $email;
    limitar_tentativas($ch); limitar_tentativas($ip);
    $u = q('SELECT * FROM usuarios WHERE email = ? AND ativo = 1', [$email])->fetch();
    if (!$u || !password_verify((string) ($b['senha'] ?? ''), $u['senha_hash'])) { falhou($ch); falhou($ip); erro('E-mail ou senha incorretos.', 401); }
    if (!(cfg()['dois_fatores'] ?? true)) abrir_sessao($u);
    $codigo = (string) random_int(100000, 999999);
    q('REPLACE INTO codigos_login (usuario_id, codigo_hash, expira, tentativas) VALUES (?,?,?,0)', [$u['id'], password_hash($codigo, PASSWORD_DEFAULT), gmdate('Y-m-d H:i:s', time() + 600)]);
    if (!enviar_email($u['email'], "Código de acesso: $codigo", "Olá, {$u['nome']}.\n\nSeu código de acesso ao sistema de honorários é: $codigo\n\nEle vale por 10 minutos. Se não foi você quem tentou entrar, avise o administrador.\n"))
        erro('Não foi possível enviar o código por e-mail. Verifique a configuração de e-mail do servidor.', 500);
    json_out(['codigo' => true, 'email' => preg_replace('/(^.).*(@.*$)/', '$1•••$2', $u['email'])]);
}
function login_codigo(): never {
    $b = corpo(); $email = mb_strtolower(trim((string) ($b['email'] ?? '')));
    $ch = 'em:' . $email; limitar_tentativas($ch);
    $u = q('SELECT * FROM usuarios WHERE email = ? AND ativo = 1', [$email])->fetch();
    $c = $u ? q('SELECT * FROM codigos_login WHERE usuario_id = ?', [$u['id']])->fetch() : null;
    if (!$u || !$c || $c['expira'] < agora() || $c['tentativas'] >= 5) erro('Código expirado. Entre novamente para receber outro.', 401);
    if (!password_verify(preg_replace('/\D/', '', (string) ($b['codigo'] ?? '')), $c['codigo_hash'])) {
        q('UPDATE codigos_login SET tentativas = tentativas + 1 WHERE usuario_id = ?', [$u['id']]); falhou($ch); erro('Código incorreto.', 401);
    }
    q('DELETE FROM codigos_login WHERE usuario_id = ?', [$u['id']]);
    abrir_sessao($u);
}

/* ---------- gravação com controle de versão ---------- */
function resumo_registro(string $col, array $d): string {
    return match ($col) {
        'contratos' => ($d['numero'] ?? '') . ' · ' . ($d['cliente']['nome'] ?? ''),
        'parcelas' => 'parcela ' . ($d['n'] ?? '') . ' · ' . ($d['status'] ?? '') . ' · R$ ' . number_format((float) ($d['valor'] ?? 0), 2, ',', '.'),
        'pessoas', 'entidades' => (string) ($d['nome'] ?? $d['razao'] ?? ''),
        default => ''
    };
}
function sincronizar(array $u): never {
    $b = corpo(); $conflitos = []; $versoes = [];
    db()->beginTransaction();
    foreach (COLECOES as $col) {
        foreach ($b['upserts'][$col] ?? [] as $item) {
            $id = (string) ($item['id'] ?? '');
            if (!id_valido($id) || !is_array($item['dados'] ?? null)) continue;
            $atual = q('SELECT versao FROM registros WHERE colecao = ? AND id = ? FOR UPDATE', [$col, $id])->fetchColumn();
            $base = $item['versao'] ?? null;
            if ($atual !== false && (int) $base !== (int) $atual) { $conflitos[] = ['colecao' => $col, 'id' => $id]; continue; }
            $dados = $item['dados']; unset($dados['id']);
            $versoes[$col][$id] = reg_put($col, $id, $dados, $u);
            auditar($u, $atual === false ? 'criou' : 'alterou', $col, $id, resumo_registro($col, $dados));
        }
        foreach ($b['deletes'][$col] ?? [] as $id) {
            $id = (string) $id; if (!id_valido($id)) continue;
            $ant = reg_get($col, $id); if (!$ant) continue;
            reg_del($col, $id); auditar($u, 'excluiu', $col, $id, resumo_registro($col, $ant['dados']));
        }
    }
    if (isset($b['settings']) && is_array($b['settings'])) {
        $s = $b['settings'];
        $prefs = array_intersect_key($s, array_flip(PESSOAIS));
        q('UPDATE usuarios SET prefs = ? WHERE id = ?', [json_encode($prefs, JSON_UNESCAPED_UNICODE), $u['id']]);
        $global = reg_get('config', 'global')['dados'] ?? [];
        $permitidas = $u['perfil'] === 'admin' ? array_diff(array_keys($s), PESSOAIS) : GLOBAIS_FINANCEIRO;
        $novo = array_merge($global, array_intersect_key($s, array_flip($permitidas)));
        if ($novo != $global) { reg_put('config', 'global', $novo, $u); auditar($u, 'configuracoes'); }
    }
    if (isset($b['areas']) && is_array($b['areas'])) reg_put('config', 'areas', ['lista' => array_values(array_map('strval', $b['areas']))], $u);
    if ($conflitos) {
        db()->rollBack();
        erro('Outro usuário alterou estes dados ao mesmo tempo. A tela foi atualizada; refaça a última alteração.', 409, ['conflitos' => $conflitos]);
    }
    db()->commit();
    json_out(['ok' => true, 'versoes' => $versoes, 'rev' => rev_inc()]);
}

/* ---------- arquivos dos contratos ---------- */
function salvar_arquivo(array $u): never {
    $id = (string) ($_POST['id'] ?? '');
    $f = $_FILES['arquivo'] ?? null;
    if (!preg_match('/^[A-Za-z0-9_-]{1,64}$/', $id) || !$f || $f['error'] !== UPLOAD_ERR_OK) erro('Arquivo inválido.');
    if ($f['size'] > 30 * 1024 * 1024) erro('Arquivo acima de 30 MB.');
    if (!move_uploaded_file($f['tmp_name'], dir_arquivos() . '/' . $id)) erro('Não foi possível gravar o arquivo.', 500);
    q('REPLACE INTO arquivos (id, nome, tipo, tamanho, criado_em, criado_por) VALUES (?,?,?,?,?,?)', [$id, mb_substr((string) $f['name'], 0, 200), mb_substr((string) $f['type'], 0, 100), (int) $f['size'], agora(), $u['id']]);
    auditar($u, 'arquivo-enviado', 'arquivos', $id, (string) $f['name']);
    json_out(['ok' => true, 'id' => $id]);
}
function baixar_arquivo(array $u, string $id): never {
    $a = q('SELECT * FROM arquivos WHERE id = ?', [$id])->fetch();
    if (!$a || !is_file(dir_arquivos() . '/' . $id)) erro('Arquivo não encontrado.', 404);
    if (!in_array($u['perfil'], ESCRITA, true)) {
        $ok = false;
        foreach (dados_para($u)['db']['contratos'] as $c) if (($c['arquivoId'] ?? '') === $id) { $ok = true; break; }
        if (!$ok) erro('Sem permissão para este arquivo.', 403);
    }
    // Só PDF e imagens são exibidos no navegador; o resto é baixado (evita execução de conteúdo ativo).
    $seguro = in_array($a['tipo'], ['application/pdf', 'image/png', 'image/jpeg', 'image/webp'], true);
    header('Content-Type: ' . ($seguro ? $a['tipo'] : 'application/octet-stream'));
    header('Content-Security-Policy: default-src \'none\'; img-src \'self\'; style-src \'unsafe-inline\'; sandbox');
    header('Content-Disposition: ' . ($seguro ? 'inline' : 'attachment') . '; filename*=UTF-8\'\'' . rawurlencode($a['nome']));
    header('Cache-Control: private, no-store');
    readfile(dir_arquivos() . '/' . $id);
    exit;
}
function apagar_arquivo(string $id): void { @unlink(dir_arquivos() . '/' . $id); q('DELETE FROM arquivos WHERE id = ?', [$id]); }

/* ---------- usuários ---------- */
function salvar_usuario(array $adm): never {
    $b = corpo();
    $nome = trim((string) ($b['nome'] ?? '')); $email = mb_strtolower(trim((string) ($b['email'] ?? ''))); $perfil = (string) ($b['perfil'] ?? '');
    if (!$nome || !filter_var($email, FILTER_VALIDATE_EMAIL) || !in_array($perfil, PERFIS, true)) erro('Informe nome, e-mail válido e perfil.');
    if (in_array($perfil, ['advogado', 'captador'], true) && empty($b['pessoaId'])) erro('Vincule o usuário a uma pessoa cadastrada (advogado ou captador).');
    $ativo = !empty($b['ativo']) ? 1 : 0; $id = (string) ($b['id'] ?? '');
    $dup = q('SELECT id FROM usuarios WHERE email = ? AND id <> ?', [$email, $id])->fetchColumn();
    if ($dup) erro('Já existe usuário com este e-mail.');
    $senha = null;
    if ($id) {
        $ant = q('SELECT * FROM usuarios WHERE id = ?', [$id])->fetch() ?: erro('Usuário não encontrado.', 404);
        if ($ant['perfil'] === 'admin' && ($perfil !== 'admin' || !$ativo) && (int) q("SELECT COUNT(*) FROM usuarios WHERE perfil = 'admin' AND ativo = 1")->fetchColumn() <= 1) erro('O sistema precisa de ao menos um administrador ativo.');
        q('UPDATE usuarios SET nome = ?, email = ?, perfil = ?, pessoa_id = ?, ativo = ? WHERE id = ?', [$nome, $email, $perfil, $b['pessoaId'] ?: null, $ativo, $id]);
        if (!empty($b['redefinirSenha'])) { $senha = senha_temporaria(); q('UPDATE usuarios SET senha_hash = ?, trocar_senha = 1 WHERE id = ?', [password_hash($senha, PASSWORD_DEFAULT), $id]); }
        auditar($adm, 'usuario-alterado', 'usuarios', $id, "$nome · $perfil" . ($senha ? ' · senha redefinida' : ''));
    } else {
        $id = uid(); $senha = senha_temporaria();
        q('INSERT INTO usuarios (id, nome, email, senha_hash, perfil, pessoa_id, ativo, prefs, trocar_senha, criado_em) VALUES (?,?,?,?,?,?,?,?,1,?)', [$id, $nome, $email, password_hash($senha, PASSWORD_DEFAULT), $perfil, $b['pessoaId'] ?: null, $ativo, '{}', agora()]);
        auditar($adm, 'usuario-criado', 'usuarios', $id, "$nome · $perfil");
    }
    json_out(['ok' => true, 'id' => $id, 'senhaTemporaria' => $senha]);
}
function senha_temporaria(): string { $a = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789'; $s = ''; for ($i = 0; $i < 12; $i++) $s .= $a[random_int(0, strlen($a) - 1)]; return $s; }

/* ---------- importação da base local (backup) ---------- */
function importar(array $u): never {
    $b = corpo(); $d = $b['db'] ?? null;
    if (!is_array($d) || !isset($d['contratos'])) erro('Backup inválido.');
    db()->beginTransaction();
    q("DELETE FROM registros WHERE colecao IN ('contratos','parcelas','pessoas','entidades','comissoes')");
    foreach (['contratos', 'parcelas', 'pessoas', 'entidades'] as $col)
        foreach ($d[$col] ?? [] as $x) { if (!isset($x['id']) || !id_valido((string) $x['id'])) continue; $id = (string) $x['id']; unset($x['id']); reg_put($col, $id, $x, $u); }
    foreach ($d['comissoesPagas'] ?? [] as $k => $v) if (id_valido((string) $k)) reg_put('comissoes', (string) $k, (array) $v, $u);
    $s = $d['settings'] ?? [];
    foreach (['ai', 'webhook'] as $k) unset($s[$k]);
    if (isset($s['asaas'])) { unset($s['asaas']['url'], $s['asaas']['token']); }
    reg_put('config', 'global', array_diff_key($s, array_flip(PESSOAIS)), $u);
    q('UPDATE usuarios SET prefs = ? WHERE id = ?', [json_encode(array_intersect_key($s, array_flip(PESSOAIS)), JSON_UNESCAPED_UNICODE), $u['id']]);
    if (isset($d['areas'])) reg_put('config', 'areas', ['lista' => array_values($d['areas'])], $u);
    db()->commit();
    $n = 0;
    foreach ($b['files'] ?? [] as $id => $f) {
        if (!preg_match('/^[A-Za-z0-9_-]{1,64}$/', (string) $id)) continue;
        $bin = base64_decode((string) ($f['b64'] ?? ''), true); if ($bin === false) continue;
        file_put_contents(dir_arquivos() . '/' . $id, $bin);
        q('REPLACE INTO arquivos (id, nome, tipo, tamanho, criado_em, criado_por) VALUES (?,?,?,?,?,?)', [$id, mb_substr((string) ($f['name'] ?? 'arquivo'), 0, 200), (string) ($f['type'] ?? ''), strlen($bin), agora(), $u['id']]);
        $n++;
    }
    auditar($u, 'importacao', '', '', count($d['contratos']) . ' contratos, ' . $n . ' arquivos');
    json_out(['ok' => true, 'contratos' => count($d['contratos']), 'arquivos' => $n, 'rev' => rev_inc()]);
}
