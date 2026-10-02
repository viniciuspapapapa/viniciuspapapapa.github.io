<?php
/* =========================================================
   Honorários · integração com o Asaas (boleto, PIX e NFS-e)
   ========================================================= */
declare(strict_types=1);

function asaas_cfg(): array { return cfg()['asaas'] ?? []; }
function asaas(string $method, string $path, ?array $body = null): array {
    $c = asaas_cfg();
    if (empty($c['chave_api'])) erro('A chave da API do Asaas não foi configurada no servidor.', 503);
    $base = $c['base_url'] ?? (($c['ambiente'] ?? 'production') === 'sandbox' ? 'https://api-sandbox.asaas.com/v3' : 'https://api.asaas.com/v3');
    $ch = curl_init($base . $path);
    curl_setopt_array($ch, [
        CURLOPT_CUSTOMREQUEST => $method, CURLOPT_RETURNTRANSFER => true, CURLOPT_TIMEOUT => 40,
        CURLOPT_HTTPHEADER => ['access_token: ' . $c['chave_api'], 'Content-Type: application/json', 'User-Agent: TPC-Honorarios/1.0'],
        CURLOPT_POSTFIELDS => $body !== null && $method !== 'GET' ? json_encode(array_filter($body, fn($v) => $v !== null), JSON_UNESCAPED_UNICODE) : null
    ]);
    $txt = curl_exec($ch);
    $st = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $errc = curl_error($ch);
    curl_close($ch);
    if ($txt === false) throw new RuntimeException('Asaas inacessível: ' . $errc);
    $data = json_decode($txt ?: 'null', true) ?? [];
    if ($st >= 400) {
        $msg = implode(' ', array_map(fn($e) => $e['description'] ?? '', $data['errors'] ?? [])) ?: "Asaas respondeu $st";
        throw new RuntimeException($msg);
    }
    return $data;
}
function so_digitos($s): string { return strtoupper(preg_replace('/[^0-9A-Za-z]/', '', (string) $s)); }

function asaas_cliente(array $c): string {
    $doc = so_digitos($c['doc'] ?? '');
    if (!$doc) throw new RuntimeException('Cliente sem CPF/CNPJ: o Asaas exige o documento para registrar o boleto e emitir a nota.');
    $emails = array_values(array_filter(array_map('trim', preg_split('/[,;]/', (string) ($c['email'] ?? '')))));
    $adic = array_merge(array_slice($emails, 1), !empty($c['emailCc']) ? [$c['emailCc']] : []);
    $dados = [
        'name' => $c['nome'] ?? '', 'cpfCnpj' => $doc, 'email' => $emails[0] ?? null,
        'additionalEmails' => $adic ? implode(',', $adic) : null, 'mobilePhone' => so_digitos($c['telefone'] ?? '') ?: null,
        'postalCode' => so_digitos($c['cep'] ?? '') ?: null, 'address' => $c['endereco'] ?? null,
        'externalReference' => $c['ref'] ?? null, 'notificationDisabled' => empty($c['notificarPeloAsaas'])
    ];
    $achado = asaas('GET', '/customers?limit=1&cpfCnpj=' . urlencode($doc));
    if (!empty($achado['data'][0]['id'])) {
        $id = $achado['data'][0]['id'];
        try { asaas('PUT', "/customers/$id", $dados); } catch (Throwable $e) { /* mantém o cadastro existente */ }
        return $id;
    }
    return asaas('POST', '/customers', $dados)['id'];
}
function asaas_detalhes(string $id): array {
    $o = [];
    try { $l = asaas('GET', "/payments/$id/identificationField"); $o['linha'] = $l['identificationField'] ?? null; $o['codigoBarras'] = $l['barCode'] ?? null; } catch (Throwable $e) { }
    try { $p = asaas('GET', "/payments/$id/pixQrCode"); $o['pix'] = $p['payload'] ?? null; } catch (Throwable $e) { }
    return $o;
}
function asaas_criar_boleto(array $b): array {
    $customer = asaas_cliente($b['cliente'] ?? []);
    $pay = asaas('POST', '/payments', [
        'customer' => $customer, 'billingType' => 'BOLETO', 'value' => (float) $b['valor'], 'dueDate' => $b['vencimento'],
        'description' => mb_substr((string) ($b['descricao'] ?? ''), 0, 500), 'externalReference' => $b['parcelaId'] ?? null,
        'fine' => !empty($b['multaPct']) ? ['value' => (float) $b['multaPct'], 'type' => 'PERCENTAGE'] : null,
        'interest' => !empty($b['jurosPct']) ? ['value' => (float) $b['jurosPct']] : null
    ]);
    if (!empty($b['notaAoPagar'])) q('REPLACE INTO asaas_nf_pendente (payment_id, config, criado_em) VALUES (?,?,?)', [$pay['id'], json_encode($b['notaAoPagar'], JSON_UNESCAPED_UNICODE), agora()]);
    return ['id' => $pay['id'], 'status' => $pay['status'] ?? 'PENDING', 'valor' => $pay['value'] ?? $b['valor'], 'vencimento' => $pay['dueDate'] ?? $b['vencimento'],
        'url' => $pay['bankSlipUrl'] ?? null, 'fatura' => $pay['invoiceUrl'] ?? null, 'nossoNumero' => $pay['nossoNumero'] ?? null, 'customer' => $customer] + asaas_detalhes($pay['id']);
}
function asaas_emitir_nota(array $n): array {
    $corpo = [
        'payment' => $n['paymentId'] ?? null,
        'customer' => empty($n['paymentId']) ? asaas_cliente($n['cliente'] ?? []) : null,
        'serviceDescription' => $n['descricao'] ?? '', 'observations' => $n['observacoes'] ?? '', 'externalReference' => $n['parcelaId'] ?? null,
        'value' => (float) $n['valor'], 'deductions' => (float) ($n['deducoes'] ?? 0), 'effectiveDate' => $n['data'] ?? hoje(),
        'municipalServiceId' => ($n['servico']['id'] ?? '') ?: null, 'municipalServiceCode' => ($n['servico']['codigo'] ?? '') ?: null,
        'municipalServiceName' => $n['servico']['nome'] ?? '', 'taxes' => $n['impostos'] ?? []
    ];
    $inv = asaas('POST', '/invoices', $corpo);
    $st = $inv;
    try { $st = asaas('POST', "/invoices/{$inv['id']}/authorize", []); } catch (Throwable $e) { /* agendada para hoje; a prefeitura processará */ }
    return ['id' => $inv['id'], 'status' => $st['status'] ?? $inv['status'] ?? 'SCHEDULED', 'numero' => $st['number'] ?? null, 'pdf' => $st['pdfUrl'] ?? null, 'xml' => $st['xmlUrl'] ?? null];
}

/* ---------- eventos (webhook) aplicados direto no banco ---------- */
function asaas_resumo(array $body): array {
    $p = $body['payment'] ?? null; $i = $body['invoice'] ?? null;
    return [
        'id' => (string) ($body['id'] ?? ($body['event'] . ':' . ($p['id'] ?? $i['id'] ?? '') . ':' . microtime(true))), 'evento' => (string) ($body['event'] ?? ''),
        'pagamento' => $p ? ['id' => $p['id'] ?? null, 'status' => $p['status'] ?? null, 'valor' => $p['value'] ?? null, 'pagoEm' => $p['paymentDate'] ?? $p['clientPaymentDate'] ?? null, 'ref' => $p['externalReference'] ?? null] : null,
        'nota' => $i ? ['id' => $i['id'] ?? null, 'status' => $i['status'] ?? null, 'numero' => $i['number'] ?? null, 'pdf' => $i['pdfUrl'] ?? null, 'xml' => $i['xmlUrl'] ?? null, 'pagamento' => $i['payment'] ?? null, 'ref' => $i['externalReference'] ?? null] : null
    ];
}
function asaas_gravar_evento(array $ev): void {
    q('INSERT IGNORE INTO asaas_eventos (id, evento, dados, recebido_em, processado) VALUES (?,?,?,?,0)', [$ev['id'], $ev['evento'], json_encode($ev, JSON_UNESCAPED_UNICODE), agora()]);
}
function parcela_por(?string $ref, ?string $boletoId, ?string $notaId = null): ?array {
    if ($ref && id_valido($ref) && ($r = reg_get('parcelas', $ref))) return ['id' => $ref] + $r;
    if (!$boletoId && !$notaId) return null;
    foreach (reg_todos('parcelas') as $id => $r) {
        $d = $r['dados'];
        if (($boletoId && (($d['boleto']['id'] ?? '') === $boletoId)) || ($notaId && (($d['nf']['id'] ?? '') === $notaId))) return ['id' => $id] + $r;
    }
    return null;
}
function asaas_processar(array $ev): void {
    $sis = ['id' => null, 'nome' => 'Asaas'];
    $pg = $ev['pagamento']; $nt = $ev['nota']; $mudou = false;
    if ($pg && ($p = parcela_por($pg['ref'], $pg['id']))) {
        $d = $p['dados'];
        if (isset($d['boleto']) && ($d['boleto']['id'] ?? '') === $pg['id']) { $d['boleto']['status'] = $pg['status']; $mudou = true; }
        if (in_array($ev['evento'], ['PAYMENT_RECEIVED', 'PAYMENT_CONFIRMED'], true) && ($d['status'] ?? '') !== 'paga') {
            $d['status'] = 'paga'; $d['pagoEm'] = substr((string) ($pg['pagoEm'] ?: hoje()), 0, 10); $d['valorPago'] = round((float) $pg['valor'], 2); $d['forma'] = 'Boleto/PIX (Asaas)';
            auditar($sis, 'baixa-automatica', 'parcelas', $p['id'], 'Pagamento confirmado pelo Asaas: R$ ' . number_format((float) $pg['valor'], 2, ',', '.'));
            $mudou = true;
        }
        if ($mudou) reg_put('parcelas', $p['id'], $d, null);
        if (in_array($ev['evento'], ['PAYMENT_RECEIVED', 'PAYMENT_CONFIRMED'], true)) {
            $cfgNf = q('SELECT config FROM asaas_nf_pendente WHERE payment_id = ?', [$pg['id']])->fetchColumn();
            if ($cfgNf) {
                q('DELETE FROM asaas_nf_pendente WHERE payment_id = ?', [$pg['id']]);
                try { $nf = asaas_emitir_nota(json_decode($cfgNf, true) + ['paymentId' => $pg['id'], 'data' => hoje()]); $nf['em'] = gmdate('c'); }
                catch (Throwable $e) { $nf = ['status' => 'ERRO', 'erro' => $e->getMessage(), 'em' => gmdate('c')]; }
                $atual = reg_get('parcelas', $p['id'])['dados']; $atual['nf'] = $nf; reg_put('parcelas', $p['id'], $atual, null);
                auditar($sis, 'nota-automatica', 'parcelas', $p['id'], ($nf['status'] ?? '') === 'ERRO' ? 'Falha: ' . $nf['erro'] : 'NFS-e solicitada');
                asaas_gravar_evento(['id' => 'NF_AUTO:' . $pg['id'], 'evento' => ($nf['status'] ?? '') === 'ERRO' ? 'NF_AUTO_ERRO' : 'NF_AUTO', 'pagamento' => null, 'nota' => $nf + ['ref' => $p['id'], 'pagamento' => $pg['id']]]);
                q('UPDATE asaas_eventos SET processado = 1 WHERE id = ?', ['NF_AUTO:' . $pg['id']]);
                $mudou = true;
            }
        }
    }
    if ($nt && ($p = parcela_por($nt['ref'], $nt['pagamento'], $nt['id']))) {
        $d = $p['dados'];
        $d['nf'] = array_merge($d['nf'] ?? [], array_filter(['id' => $nt['id'], 'status' => $nt['status'], 'numero' => $nt['numero'], 'pdf' => $nt['pdf'], 'xml' => $nt['xml']], fn($v) => $v !== null));
        reg_put('parcelas', $p['id'], $d, null); $mudou = true;
    }
    q('UPDATE asaas_eventos SET processado = 1 WHERE id = ?', [$ev['id']]);
    if ($mudou) rev_inc();
}
function asaas_webhook(): never {
    $tok = asaas_cfg()['webhook_token'] ?? '';
    if (!$tok || !hash_equals($tok, $_SERVER['HTTP_ASAAS_ACCESS_TOKEN'] ?? '')) { http_response_code(401); exit('negado'); }
    $ev = asaas_resumo(corpo());
    asaas_gravar_evento($ev);
    // Responde ao Asaas imediatamente e processa em seguida (a tarefa agendada cobre falhas).
    http_response_code(200); header('Content-Type: text/plain'); echo 'ok';
    if (function_exists('litespeed_finish_request')) litespeed_finish_request(); elseif (function_exists('fastcgi_finish_request')) fastcgi_finish_request(); else flush();
    try { asaas_processar($ev); } catch (Throwable $e) { error_log('Honorarios webhook: ' . $e->getMessage()); }
    exit;
}

/* ---------- rotas /api/asaas/* ---------- */
function rotas_asaas(string $r, string $m): never {
    if ($r === 'asaas/webhook' && $m === 'POST') asaas_webhook();
    if ($m !== 'GET' && ($_SERVER['HTTP_X_HONORARIOS'] ?? '') !== '1') erro('Requisição recusada.', 403);
    $u = exigir(ESCRITA);
    try {
        if ($r === 'asaas/status') { $x = asaas('GET', '/customers?limit=1'); json_out(['ok' => true, 'ambiente' => asaas_cfg()['ambiente'] ?? 'production', 'clientes' => $x['totalCount'] ?? null]); }
        if ($r === 'asaas/boleto' && $m === 'POST') { $b = corpo(); $res = asaas_criar_boleto($b); auditar($u, 'boleto', 'parcelas', (string) ($b['parcelaId'] ?? ''), 'Boleto registrado: R$ ' . number_format((float) $b['valor'], 2, ',', '.')); json_out($res); }
        if (preg_match('#^asaas/boleto/([\w-]+)$#', $r, $mm)) {
            if ($m === 'DELETE') { asaas('DELETE', "/payments/{$mm[1]}"); q('DELETE FROM asaas_nf_pendente WHERE payment_id = ?', [$mm[1]]); auditar($u, 'boleto-cancelado', 'pagamentos', $mm[1]); json_out(['ok' => true]); }
            $p = asaas('GET', "/payments/{$mm[1]}");
            json_out(['id' => $p['id'], 'status' => $p['status'], 'valor' => $p['value'], 'vencimento' => $p['dueDate'], 'pagoEm' => $p['paymentDate'] ?? $p['clientPaymentDate'] ?? null, 'url' => $p['bankSlipUrl'] ?? null, 'fatura' => $p['invoiceUrl'] ?? null, 'nossoNumero' => $p['nossoNumero'] ?? null]);
        }
        if ($r === 'asaas/nota' && $m === 'POST') { $n = corpo(); $res = asaas_emitir_nota($n); auditar($u, 'nota-fiscal', 'parcelas', (string) ($n['parcelaId'] ?? ''), 'NFS-e solicitada'); json_out($res); }
        if (preg_match('#^asaas/nota/([\w-]+)$#', $r, $mm) && $m === 'GET') json_out(asaas('GET', "/invoices/{$mm[1]}"));
        if (preg_match('#^asaas/nota/([\w-]+)/cancelar$#', $r, $mm) && $m === 'POST') { $x = asaas('POST', "/invoices/{$mm[1]}/cancel", []); auditar($u, 'nota-cancelada', 'notas', $mm[1]); json_out($x); }
        if (preg_match('#^asaas/fiscal/([A-Za-z]+)$#', $r, $mm)) { $qs = http_build_query(array_intersect_key($_GET, array_flip(['limit', 'offset', 'description']))); json_out(asaas('GET', "/fiscalInfo/{$mm[1]}?$qs")); }
        if ($r === 'asaas/eventos') {
            $desde = (string) ($_GET['desde'] ?? '');
            $rows = q('SELECT dados, recebido_em FROM asaas_eventos WHERE recebido_em > ? ORDER BY recebido_em LIMIT 500', [$desde ? gmdate('Y-m-d H:i:s', strtotime($desde)) : '1970-01-01'])->fetchAll();
            json_out(['eventos' => array_map(fn($x) => json_decode($x['dados'], true) + ['recebidoEm' => gmdate('c', strtotime($x['recebido_em'] . ' UTC'))], $rows), 'agora' => gmdate('c')]);
        }
    } catch (RuntimeException $e) { erro($e->getMessage(), 502); }
    erro('Rota inexistente.', 404);
}
