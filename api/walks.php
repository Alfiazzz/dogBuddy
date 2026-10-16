<?php
sendCorsHeaders();

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}

header('Content-Type: application/json; charset=utf-8');

require_once __DIR__ . '/config.php';
require_once __DIR__ . '/user.php';

$method = $_SERVER['REQUEST_METHOD'];
$action = isset($_GET['action']) ? (string) $_GET['action'] : '';

try {
    if ($method === 'GET' && $action === 'list') {
        handleListWalks($pdo);
    }

    if ($method === 'POST' && $action === 'create') {
        handleCreateWalk($pdo);
    }

    if (($method === 'POST' || $method === 'PATCH') && $action === 'update') {
        handleUpdateWalk($pdo);
    }
} catch (PDOException $e) {
    error_log('DogBuddy walks: ' . $e->getMessage());
    $message = 'Не удалось сохранить прогулку.';
    if ((string) $e->getCode() === '42S02') {
        $message = 'Сначала создайте таблицу walks в phpMyAdmin.';
    } elseif ((string) $e->getCode() === '23000') {
        $message = 'Такого мэтча или собаки нет в базе.';
    }
    respondError($message, 500);
}

respondError('Неизвестное действие.', 405);

function handleListWalks($pdo) {
    $chatId = filter_var($_GET['chat_id'] ?? null, FILTER_VALIDATE_INT);
    if ($chatId === false || $chatId < 1) {
        respondError('Укажите chat_id.', 400);
    }

    $chat = findChatForWalk($pdo, $chatId);
    if (!$chat) {
        respondError('Чат не найден.', 404);
    }
    $myDogId = findUserDogId($pdo, requestTgId($_GET));
    if ($myDogId < 1) {
        respondError('Сначала заполните анкету собаки.', 404);
    }

    $stmt = $pdo->prepare(
        'SELECT id, match_id, proposer_id, place, lat, lon, scheduled_at, status, created_at
         FROM walks
         WHERE match_id = :match_id
         ORDER BY scheduled_at ASC, id ASC'
    );
    $stmt->execute(['match_id' => (int) $chat['match_id']]);

    $walks = [];
    foreach ($stmt->fetchAll() as $row) {
        $walks[] = formatWalk($row);
    }

    echo json_encode([
        'ok' => true,
        'match_id' => (int) $chat['match_id'],
        'partner_name' => partnerNameFromChat($chat, $myDogId),
        'partner_dog_id' => partnerDogIdFromChat($chat, $myDogId),
        'my_dog_id' => $myDogId,
        'walks' => $walks,
    ], JSON_UNESCAPED_UNICODE);
    exit;
}

function handleCreateWalk($pdo) {
    $data = readBody();
    $matchId = filter_var($data['match_id'] ?? null, FILTER_VALIDATE_INT);
    $proposerId = findUserDogId($pdo, requestTgId($data));
    $place = trim((string) ($data['place'] ?? ''));
    $placeLength = function_exists('mb_strlen') ? mb_strlen($place, 'UTF-8') : strlen($place);
    $scheduledAt = normalizeDateTime($data['scheduled_at'] ?? '');
    $lat = optionalCoordinate($data['lat'] ?? null, -90, 90);
    $lon = optionalCoordinate($data['lon'] ?? null, -180, 180);

    if ($matchId === false || $matchId < 1) {
        respondError('Укажите match_id.', 400);
    }
    if ($proposerId < 1) {
        respondError('Сначала заполните анкету собаки.', 404);
    }
    if ($place === '' || $placeLength > 255) {
        respondError('Укажите место встречи, не длиннее 255 символов.', 400);
    }
    if ($scheduledAt === null) {
        respondError('Укажите дату и время прогулки.', 400);
    }
    if ($lat === false || $lon === false) {
        respondError('Координаты места указаны неверно.', 400);
    }

    $match = findMatch($pdo, $matchId);
    if (!$match) {
        respondError('Мэтч не найден.', 404);
    }
    if ($proposerId !== (int) $match['dog_a_id'] && $proposerId !== (int) $match['dog_b_id']) {
        respondError('Эта собака не участвует в мэтче.', 403);
    }

    $insert = $pdo->prepare(
        'INSERT INTO walks (match_id, proposer_id, place, lat, lon, scheduled_at, status)
         VALUES (:match_id, :proposer_id, :place, :lat, :lon, :scheduled_at, :status)'
    );
    $insert->execute([
        'match_id' => $matchId,
        'proposer_id' => $proposerId,
        'place' => $place,
        'lat' => $lat,
        'lon' => $lon,
        'scheduled_at' => $scheduledAt,
        'status' => 'proposed',
    ]);

    echo json_encode([
        'ok' => true,
        'walk' => formatWalk(findWalk($pdo, (int) $pdo->lastInsertId())),
    ], JSON_UNESCAPED_UNICODE);
    exit;
}

function handleUpdateWalk($pdo) {
    $data = readBody();
    $walkId = filter_var($data['walk_id'] ?? null, FILTER_VALIDATE_INT);
    $status = isset($data['status']) ? (string) $data['status'] : '';

    if ($walkId === false || $walkId < 1) {
        respondError('Укажите walk_id.', 400);
    }
    if ($status !== 'confirmed' && $status !== 'cancelled') {
        respondError('Статус может быть confirmed или cancelled.', 400);
    }
    $walk = findWalk($pdo, $walkId);
    if (!$walk) {
        respondError('Прогулка не найдена.', 404);
    }
    $myDogId = findUserDogId($pdo, requestTgId($data));
    if ($myDogId < 1) {
        respondError('Сначала заполните анкету собаки.', 404);
    }
    $match = findMatch($pdo, (int) $walk['match_id']);
    if (!$match || ($myDogId !== (int) $match['dog_a_id'] && $myDogId !== (int) $match['dog_b_id'])) {
        respondError('Эта собака не участвует в прогулке.', 403);
    }

    $update = $pdo->prepare('UPDATE walks SET status = :status WHERE id = :id');
    $update->execute([
        'status' => $status,
        'id' => $walkId,
    ]);

    echo json_encode([
        'ok' => true,
        'walk' => formatWalk(findWalk($pdo, $walkId)),
    ], JSON_UNESCAPED_UNICODE);
    exit;
}

function findChatForWalk($pdo, $chatId) {
    $stmt = $pdo->prepare(
        'SELECT c.id, c.match_id, m.dog_a_id, m.dog_b_id, a.name AS dog_a_name, b.name AS dog_b_name
         FROM chats c
         INNER JOIN matches m ON m.id = c.match_id
         INNER JOIN dogs a ON a.id = m.dog_a_id
         INNER JOIN dogs b ON b.id = m.dog_b_id
         WHERE c.id = :chat_id'
    );
    $stmt->execute(['chat_id' => $chatId]);
    $chat = $stmt->fetch();
    return $chat ?: null;
}

function findMatch($pdo, $matchId) {
    $stmt = $pdo->prepare('SELECT id, dog_a_id, dog_b_id FROM matches WHERE id = :id');
    $stmt->execute(['id' => $matchId]);
    $match = $stmt->fetch();
    return $match ?: null;
}

function findWalk($pdo, $walkId) {
    $stmt = $pdo->prepare(
        'SELECT id, match_id, proposer_id, place, lat, lon, scheduled_at, status, created_at
         FROM walks
         WHERE id = :id'
    );
    $stmt->execute(['id' => $walkId]);
    $walk = $stmt->fetch();
    return $walk ?: null;
}

function partnerNameFromChat($chat, $myDogId) {
    $name = (int) $chat['dog_a_id'] === (int) $myDogId ? $chat['dog_b_name'] : $chat['dog_a_name'];
    $name = trim((string) $name);
    return $name !== '' ? $name : 'Собеседник';
}

function partnerDogIdFromChat($chat, $myDogId) {
    return (int) $chat['dog_a_id'] === (int) $myDogId ? (int) $chat['dog_b_id'] : (int) $chat['dog_a_id'];
}

function formatWalk($row) {
    return [
        'id' => (int) $row['id'],
        'match_id' => (int) $row['match_id'],
        'proposer_id' => (int) $row['proposer_id'],
        'place' => (string) $row['place'],
        'lat' => $row['lat'] === null ? null : (float) $row['lat'],
        'lon' => $row['lon'] === null ? null : (float) $row['lon'],
        'scheduled_at' => (string) $row['scheduled_at'],
        'status' => (string) $row['status'],
        'created_at' => (string) $row['created_at'],
    ];
}

function normalizeDateTime($value) {
    $value = trim(str_replace('T', ' ', (string) $value));
    if (preg_match('/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/', $value) === 1) {
        $value .= ':00';
    }
    if (preg_match('/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/', $value) !== 1) {
        return null;
    }
    $date = DateTime::createFromFormat('Y-m-d H:i:s', $value);
    if (!$date || $date->format('Y-m-d H:i:s') !== $value) {
        return null;
    }
    return $value;
}

function optionalCoordinate($value, $min, $max) {
    if ($value === null || $value === '') {
        return null;
    }
    if (!is_numeric($value)) {
        return false;
    }
    $number = (float) $value;
    if ($number < $min || $number > $max) {
        return false;
    }
    return $number;
}

function readBody() {
    $raw = file_get_contents('php://input');
    $data = json_decode($raw, true);
    if (!is_array($data)) {
        $data = $_POST;
    }
    return $data;
}

function respondError($message, $status) {
    http_response_code($status);
    echo json_encode([
        'ok' => false,
        'error' => $message,
    ], JSON_UNESCAPED_UNICODE);
    exit;
}

function sendCorsHeaders() {
    $origin = $_SERVER['HTTP_ORIGIN'] ?? '';
    $allowedOrigin = is_string($origin) && preg_match(
        '#^https://([a-z0-9-]+\.)+(pages\.dev|workers\.dev)$#i',
        $origin
    ) === 1;
    if (!$allowedOrigin) {
        return;
    }

    header('Access-Control-Allow-Origin: ' . $origin);
    header('Vary: Origin');
    header('Access-Control-Allow-Methods: GET, POST, PATCH, OPTIONS');
    header('Access-Control-Allow-Headers: Content-Type');
    header('Access-Control-Max-Age: 86400');
}
