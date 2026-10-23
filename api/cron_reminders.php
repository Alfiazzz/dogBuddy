<?php

require_once __DIR__ . '/config.php';
require_once __DIR__ . '/headers.php';
require_once __DIR__ . '/telegram.php';

sendSecurityHeaders();

$key = isset($_GET['key']) ? (string) $_GET['key'] : '';
if (!defined('CRON_KEY') || $key === '' || !hash_equals((string) CRON_KEY, $key)) {
    http_response_code(403);
    echo json_encode(['ok' => false, 'error' => 'Forbidden'], JSON_UNESCAPED_UNICODE);
    exit;
}

try {
    $stmt = $pdo->prepare(
        'SELECT w.id, w.place, w.scheduled_at,
                ua.tg_id AS tg_a, ub.tg_id AS tg_b,
                da.name AS name_a, db.name AS name_b
         FROM walks w
         INNER JOIN matches m ON m.id = w.match_id
         INNER JOIN dogs da ON da.id = m.dog_a_id
         INNER JOIN dogs db ON db.id = m.dog_b_id
         INNER JOIN users ua ON ua.id = da.user_id
         INNER JOIN users ub ON ub.id = db.user_id
         WHERE w.status = :status
           AND w.reminded = 0
           AND w.scheduled_at >= NOW()
           AND w.scheduled_at <= DATE_ADD(NOW(), INTERVAL 60 MINUTE)'
    );
    $stmt->execute(['status' => 'confirmed']);
    $rows = $stmt->fetchAll();
} catch (PDOException $e) {
    error_log('DogBuddy cron: ' . $e->getMessage());
    http_response_code(500);
    echo json_encode([
        'ok' => false,
        'error' => 'Не удалось прочитать прогулки. Если нет колонки reminded, добавьте её.',
    ], JSON_UNESCAPED_UNICODE);
    exit;
}

$reminded = 0;
$update = $pdo->prepare('UPDATE walks SET reminded = 1 WHERE id = :id AND reminded = 0');

foreach ($rows as $row) {
    $place = trim((string) $row['place']);
    $nameA = trim((string) $row['name_a']);
    $nameB = trim((string) $row['name_b']);
    if ($nameA === '') {
        $nameA = 'собакой';
    }
    if ($nameB === '') {
        $nameB = 'собакой';
    }
    if ($place === '') {
        $place = 'месте встречи';
    }

    $sentA = sendTelegramMessage(
        $row['tg_a'],
        '⏰ Напоминание: через час прогулка с ' . $nameB . ' в ' . $place
    );
    $sentB = sendTelegramMessage(
        $row['tg_b'],
        '⏰ Напоминание: через час прогулка с ' . $nameA . ' в ' . $place
    );

    if ($sentA || $sentB) {
        $update->execute(['id' => (int) $row['id']]);
        $reminded++;
    }
}

echo json_encode(['ok' => true, 'reminded' => $reminded], JSON_UNESCAPED_UNICODE);
