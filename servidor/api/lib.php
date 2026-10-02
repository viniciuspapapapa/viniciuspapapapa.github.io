<?php
/* =========================================================
   Honorários · TPC Advogados · núcleo do servidor
   ========================================================= */
declare(strict_types=1);

const PERFIS = ['admin', 'financeiro', 'advogado', 'captador'];
const ESCRITA = ['admin', 'financeiro'];
const COLECOES = ['contratos', 'parcelas', 'pessoas', 'entidades', 'comissoes'];
// Preferências de cada usuário (não afetam os demais).
const PESSOAIS = ['remetente', 'cargo', 'replyTo', 'ccPadrao', 'emailMode', 'emailjs', 'confirmarEnvio'];
// Configurações gerais que o financeiro também pode alterar.
const GLOBAIS_FINANCEIRO = ['templates', 'multaPct', 'jurosPct', 'diasLembrete', 'intervaloReenvio', 'cidade', 'ultimoBackup'];

function cfg(): array {
    static $c = null;
    if ($c !== null) return $c;
    $cands = [getenv('HON_CONFIG') ?: '', dirname(__DIR__, 2) . '/config-honorarios.php', __DIR__ . '/config.php'];
    foreach ($cands as $p) if ($p && is_file($p)) return $c = require $p;
    http_response_code(500);
    exit(json_encode(['erro' => 'Arquivo de configuração não encontrado. Siga o passo 3 do guia de instalação.']));
}
function db(): PDO {
    static $pdo = null;
    if ($pdo) return $pdo;
    $c = cfg()['db'];
    $pdo = new PDO("mysql:host={$c['host']};port=" . ($c['porta'] ?? 3306) . ";dbname={$c['nome']};charset=utf8mb4", $c['usuario'], $c['senha'], [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION, PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC, PDO::ATTR_EMULATE_PREPARES => false
    ]);
    return $pdo;
}
function q(string $sql, array $p = []): PDOStatement { $s = db()->prepare($sql); $s->execute($p); return $s; }
function uid(): string { return base_convert((string) (int) (microtime(true) * 1000), 10, 36) . bin2hex(random_bytes(4)); }
function agora(): string { return gmdate('Y-m-d H:i:s'); }
function hoje(): string { return (new DateTime('now', new DateTimeZone(cfg()['fuso'] ?? 'America/Sao_Paulo')))->format('Y-m-d'); }
function json_out($o, int $st = 200): never {
    http_response_code($st);
    header('Content-Type: application/json; charset=utf-8');
    header('Cache-Control: no-store');
    echo json_encode($o, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}
function erro(string $m, int $st = 400, array $extra = []): never { json_out(['erro' => $m] + $extra, $st); }
function corpo(): array { $j = json_decode(file_get_contents('php://input') ?: '[]', true); return is_array($j) ? $j : []; }
function id_valido(string $id): bool { return (bool) preg_match('/^[A-Za-z0-9_|:.\-]{1,96}$/', $id); }

/* ---------- sessão e permissões ---------- */
function iniciar_sessao(): void {
    if (session_status() === PHP_SESSION_ACTIVE) return;
    $https = !empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off' || ($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? '') === 'https';
    session_name('HONSESS');
    session_set_cookie_params(['lifetime' => 0, 'path' => '/', 'secure' => $https, 'httponly' => true, 'samesite' => 'Strict']);
    ini_set('session.use_strict_mode', '1');
    ini_set('session.gc_maxlifetime', '43200');
    if (!empty(cfg()['sessoes_dir'])) { @mkdir(cfg()['sessoes_dir'], 0700, true); session_save_path(cfg()['sessoes_dir']); }
    session_start();
    $lim = (int) (cfg()['sessao_minutos'] ?? 240) * 60;
    if (isset($_SESSION['uid']) && time() - ($_SESSION['ult'] ?? 0) > $lim) { $_SESSION = []; session_regenerate_id(true); }
    $_SESSION['ult'] = time();
}
function usuario(): ?array {
    iniciar_sessao();
    if (empty($_SESSION['uid'])) return null;
    $u = q('SELECT * FROM usuarios WHERE id = ? AND ativo = 1', [$_SESSION['uid']])->fetch();
    return $u ?: null;
}
function exigir(array $perfis = PERFIS): array {
    $u = usuario();
    if (!$u) erro('Sessão expirada. Entre novamente.', 401);
    if (!in_array($u['perfil'], $perfis, true)) erro('Seu perfil não tem permissão para esta ação.', 403);
    return $u;
}
function publico_usuario(array $u): array {
    return ['id' => $u['id'], 'nome' => $u['nome'], 'email' => $u['email'], 'perfil' => $u['perfil'], 'pessoaId' => $u['pessoa_id'] ?: null, 'trocarSenha' => (bool) $u['trocar_senha']];
}
function auditar(?array $u, string $acao, string $col = '', string $id = '', string $resumo = ''): void {
    q('INSERT INTO auditoria (em, usuario_id, usuario_nome, acao, colecao, registro_id, resumo, ip) VALUES (?,?,?,?,?,?,?,?)',
        [agora(), $u['id'] ?? null, $u['nome'] ?? 'Sistema', $acao, $col, $id, mb_substr($resumo, 0, 500), $_SERVER['REMOTE_ADDR'] ?? '']);
}
function rev(): int { return (int) q("SELECT valor FROM meta WHERE chave = 'rev'")->fetchColumn(); }
function rev_inc(): int { q("UPDATE meta SET valor = valor + 1 WHERE chave = 'rev'"); return rev(); }

/* ---------- registros (documentos JSON por coleção) ---------- */
function reg_todos(string $col): array {
    $out = [];
    foreach (q('SELECT id, dados, versao FROM registros WHERE colecao = ?', [$col])->fetchAll() as $r)
        $out[$r['id']] = ['dados' => json_decode($r['dados'], true), 'versao' => (int) $r['versao']];
    return $out;
}
function reg_get(string $col, string $id): ?array {
    $r = q('SELECT dados, versao FROM registros WHERE colecao = ? AND id = ?', [$col, $id])->fetch();
    return $r ? ['dados' => json_decode($r['dados'], true), 'versao' => (int) $r['versao']] : null;
}
function reg_put(string $col, string $id, array $dados, ?array $u): int {
    $j = json_encode($dados, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    $atual = q('SELECT versao FROM registros WHERE colecao = ? AND id = ?', [$col, $id])->fetchColumn();
    if ($atual === false) {
        q('INSERT INTO registros (colecao, id, dados, versao, atualizado_em, atualizado_por) VALUES (?,?,?,1,?,?)', [$col, $id, $j, agora(), $u['id'] ?? null]);
        return 1;
    }
    q('UPDATE registros SET dados = ?, versao = versao + 1, atualizado_em = ?, atualizado_por = ? WHERE colecao = ? AND id = ?', [$j, agora(), $u['id'] ?? null, $col, $id]);
    return (int) $atual + 1;
}
function reg_del(string $col, string $id): void { q('DELETE FROM registros WHERE colecao = ? AND id = ?', [$col, $id]); }

/* ---------- visão dos dados conforme o perfil ---------- */
function dados_para(array $u): array {
    $perfil = $u['perfil'];
    $pid = $u['pessoa_id'] ?: '__nenhuma__';
    $global = reg_get('config', 'global')['dados'] ?? [];
    $prefs = json_decode($u['prefs'] ?: '{}', true) ?: [];
    $areas = reg_get('config', 'areas')['dados']['lista'] ?? null;

    $contratos = reg_todos('contratos');
    $permitidos = [];
    foreach ($contratos as $id => $r) {
        $c = $r['dados'];
        if ($perfil === 'advogado' && ($c['responsavelId'] ?? '') !== $pid) continue;
        if ($perfil === 'captador') {
            $meus = array_values(array_filter($c['captacao'] ?? [], fn($x) => ($x['pessoaId'] ?? '') === $pid));
            if (!$meus) continue;
            $c['captacao'] = $meus;
        }
        if ($perfil === 'advogado') $c['captacao'] = [];
        $permitidos[$id] = ['dados' => $c, 'versao' => $r['versao']];
    }
    $parcelas = array_filter(reg_todos('parcelas'), fn($r) => isset($permitidos[$r['dados']['contratoId'] ?? '']));
    $pessoas = reg_todos('pessoas');
    if (!in_array($perfil, ESCRITA, true)) {
        $ref = [$pid => 1];
        foreach ($permitidos as $r) { $ref[$r['dados']['responsavelId'] ?? ''] = 1; foreach ($r['dados']['captacao'] ?? [] as $x) $ref[$x['pessoaId'] ?? ''] = 1; }
        $pessoas = array_filter($pessoas, fn($r, $id) => isset($ref[$id]), ARRAY_FILTER_USE_BOTH);
    }
    $comissoes = reg_todos('comissoes');
    if ($perfil === 'advogado') $comissoes = [];
    if ($perfil === 'captador') $comissoes = array_filter($comissoes, fn($r, $id) => str_ends_with($id, '|' . $pid), ARRAY_FILTER_USE_BOTH);

    $versoes = [];
    $lista = function (array $rs, string $col) use (&$versoes): array {
        $out = [];
        foreach ($rs as $id => $r) { $versoes[$col][$id] = $r['versao']; $out[] = $r['dados'] + ['id' => (string) $id]; }
        return $out;
    };
    $out = [
        'contratos' => $lista($permitidos, 'contratos'), 'parcelas' => $lista($parcelas, 'parcelas'),
        'pessoas' => $lista($pessoas, 'pessoas'), 'entidades' => $lista(reg_todos('entidades'), 'entidades'),
        'comissoesPagas' => (object) [], 'settings' => (object) array_merge($global, $prefs), 'areas' => $areas
    ];
    $cp = [];
    foreach ($comissoes as $id => $r) { $cp[$id] = $r['dados']; $versoes['comissoes'][$id] = $r['versao']; }
    $out['comissoesPagas'] = (object) $cp;
    return ['db' => $out, 'versoes' => (object) $versoes, 'rev' => rev(), 'usuario' => publico_usuario($u)];
}

/* ---------- arquivos ---------- */
function dir_arquivos(): string {
    $d = cfg()['arquivos_dir'] ?? (dirname(__DIR__, 2) . '/arquivos-honorarios');
    if (!is_dir($d)) @mkdir($d, 0700, true);
    return rtrim($d, '/');
}

/* ---------- e-mail (código de acesso) ---------- */
function enviar_email(string $para, string $assunto, string $texto): bool {
    if (!empty(cfg()['email_arquivo'])) { file_put_contents(cfg()['email_arquivo'], "PARA: $para\nASSUNTO: $assunto\n$texto\n\n", FILE_APPEND); return true; }
    $de = cfg()['email_remetente'] ?? ('nao-responda@' . ($_SERVER['HTTP_HOST'] ?? 'localhost'));
    $h = "From: Honorários TPC <$de>\r\nContent-Type: text/plain; charset=UTF-8\r\nContent-Transfer-Encoding: 8bit";
    return mail($para, '=?UTF-8?B?' . base64_encode($assunto) . '?=', $texto, $h);
}
