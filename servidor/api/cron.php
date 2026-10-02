<?php
/* =========================================================
   Honorários · tarefa agendada (hPanel > Avançado > Cron Jobs)
   Comando sugerido, a cada 10 minutos:
   /usr/bin/php /home/SEU_USUARIO/domains/SEU_DOMINIO/public_html/api/cron.php
   ========================================================= */
declare(strict_types=1);
if (PHP_SAPI !== 'cli') { http_response_code(403); exit; }
require __DIR__ . '/lib.php';
require __DIR__ . '/asaas.php';

// Reprocessa avisos do Asaas que não foram concluídos no momento do recebimento.
foreach (q('SELECT dados FROM asaas_eventos WHERE processado = 0 ORDER BY recebido_em LIMIT 200')->fetchAll() as $r) {
    try { asaas_processar(json_decode($r['dados'], true)); } catch (Throwable $e) { error_log('Honorarios cron: ' . $e->getMessage()); }
}
// Limpeza.
q('DELETE FROM codigos_login WHERE expira < ?', [agora()]);
q('DELETE FROM tentativas_login WHERE ate < ?', [agora()]);
q('DELETE FROM asaas_eventos WHERE processado = 1 AND recebido_em < ?', [gmdate('Y-m-d H:i:s', time() - 90 * 86400)]);
echo "ok\n";
