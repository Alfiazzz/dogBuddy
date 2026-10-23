<?php
sendCorsHeaders();

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}

header('Content-Type: application/json; charset=utf-8');

require_once __DIR__ . '/config.php';
require_once __DIR__ . '/user.php';
require_once __DIR__ . '/validation.php';

$method = $_SERVER['REQUEST_METHOD'];
$action = isset($_GET['action']) ? (string) $_GET['action'] : '';

try {
    if ($method === 'GET' && $action === 'my_walks') {
        handleMyWalks($pdo);
    }

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

function handleMyWalks($pdo) {
    $myDogId = findUserDogId($pdo, requestTgId($_GET));
    if ($myDogId < 1) {
        respondError('Сначала заполните анкету собаки.', 404);
    }

    $stmt = $pdo->prepare(
        'SELECT w.id AS walk_id, w.status, w.place, w.scheduled_at, w.proposer_id,
                CASE WHEN m.dog_a_id = :dog_name THEN b.name ELSE a.name END AS partner_name,
                CASE WHEN m.dog_a_id = :dog_photo THEN b.photo_url ELSE a.photo_url END AS partner_photo
         FROM walks w
         INNER JOIN matches m ON m.id = w.match_id
         INNER JOIN dogs a ON a.id = m.dog_a_id
         INNER JOIN dogs b ON b.id = m.dog_b_id
         WHERE m.dog_a_id = :dog_a OR m.dog_b_id = :dog_b
         ORDER BY (w.scheduled_at < NOW()),
                  CASE WHEN w.scheduled_at >= NOW() THEN w.scheduled_at END ASC,
                  w.scheduled_at DESC'
    );
    $stmt->execute([
        'dog_name' => $myDogId,
        'dog_photo' => $myDogId,
        'dog_a' => $myDogId,
        'dog_b' => $myDogId,
    ]);

    $walks = [];
    foreach ($stmt->fetchAll() as $row) {
        $walks[] = [
            'walk_id' => (int) $row['walk_id'],
            'status' => (string) $row['status'],
            'place' => (string) $row['place'],
            'scheduled_at' => (string) $row['scheduled_at'],
            'proposer_id' => (int) $row['proposer_id'],
            'partner_name' => trim((string) $row['partner_name']) !== '' ? (string) $row['partner_name'] : 'Собеседник',
            'partner_photo' => $row['partner_photo'] !== null && $row['partner_photo'] !== ''
                ? (string) $row['partner_photo']
                : 'https://via.placeholder.com/300x300?text=No+Photo',
        ];
    }

    echo json_encode([
        'ok' => true,
        'my_dog_id' => $myDogId,
        'walks' => $walks,
    ], JSON_UNESCAPED_UNICODE);
    exit;
}

function handleListWalks($pdo) {
    $myDogId = findUserDogId($pdo, requestTgId($_GET));
    $chatCheck = validateId($_GET['chat_id'] ?? null);
    validationStop($chatCheck);
    $chatId = $chatCheck['value'];
    if ($myDogId < 1) {
        respondError('Сначала заполните анкету собаки.', 404);
    }

    $chat = findChatForWalk($pdo, $chatId);
    if (!$chat) {
        respondError('Чат не найден.', 404);
    }
    if ($myDogId !== (int) $chat['dog_a_id'] && $myDogId !== (int) $chat['dog_b_id']) {
        respondError('Эта собака не участвует в этом чате.', 403);
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
    $proposerId = findUserDogId($pdo, requestTgId($data));
    $matchCheck = validateId($data['match_id'] ?? null);
    validationStop($matchCheck);
    $placeCheck = validatePlace($data['place'] ?? '');
    validationStop($placeCheck);
    $timeCheck = validateScheduledAt($data['scheduled_at'] ?? '');
    validationStop($timeCheck);
    $matchId = $matchCheck['value'];
    $place = $placeCheck['value'];
    $scheduledAt = $timeCheck['value'];
    $latRaw = $data['lat'] ?? null;
    $lonRaw = $data['lon'] ?? null;
    $lat = null;
    $lon = null;
    if (!($latRaw === null || $latRaw === '' || $lonRaw === null || $lonRaw === '')) {
        $coordsCheck = validateCoords($latRaw, $lonRaw);
        validationStop($coordsCheck);
        $lat = $coordsCheck['value']['lat'];
        $lon = $coordsCheck['value']['lon'];
    } elseif (!($latRaw === null || $latRaw === '') || !($lonRaw === null || $lonRaw === '')) {
        validationStop(validationError('Укажите и широту, и долготу места.'));
    }

    if ($proposerId < 1) {
        respondError('Сначала заполните анкету собаки.', 404);
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

    notifyWalkProposed($pdo, $match, $proposerId, $place, $scheduledAt);

    echo json_encode([
        'ok' => true,
        'walk' => formatWalk(findWalk($pdo, (int) $pdo->lastInsertId())),
    ], JSON_UNESCAPED_UNICODE);
    exit;
}

function handleUpdateWalk($pdo) {
    $data = readBody();
    $myDogId = findUserDogId($pdo, requestTgId($data));
    $walkCheck = validateId($data['walk_id'] ?? null);
    validationStop($walkCheck);
    $statusCheck = validateStatus(isset($data['status']) ? $data['status'] : '');
    validationStop($statusCheck);
    $walkId = $walkCheck['value'];
    $status = $statusCheck['value'];

    if ($myDogId < 1) {
        respondError('Сначала заполните анкету собаки.', 404);
    }
    if ($status !== 'confirmed' && $status !== 'cancelled') {
        respondError('Здесь можно только подтвердить или отменить прогулку.', 400);
    }
    $walk = findWalk($pdo, $walkId);
    if (!$walk) {
        respondError('Прогулка не найдена.', 404);
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

    if ($status === 'confirmed' && (string) $walk['status'] !== 'confirmed') {
        notifyWalkConfirmed($pdo, $match, $walk['place'], $walk['scheduled_at']);
    }

    echo json_encode([
        'ok' => true,
        'walk' => formatWalk(findWalk($pdo, $walkId)),
    ], JSON_UNESCAPED_UNICODE);
    exit;
}

function notifyWalkProposed($pdo, $match, $proposerId, $place, $scheduledAt) {
    try {
        require_once __DIR__ . '/telegram.php';
        $owners = walkOwners($pdo, (int) $match['dog_a_id'], (int) $match['dog_b_id']);
        $proposer = null;
        $partner = null;
        foreach ($owners as $owner) {
            if ((int) $owner['id'] === (int) $proposerId) {
                $proposer = $owner;
            } else {
                $partner = $owner;
            }
        }
        if (!$partner) {
            return;
        }
        $chatId = walkChatId($pdo, (int) $match['id']);
        $name = trim((string) ($proposer['name'] ?? ''));
        if ($name === '') {
            $name = 'Собака';
        }
        $link = $chatId > 0 ? rtrim(WEB_APP_URL, '/') . '/chat.html?chat_id=' . $chatId : rtrim(WEB_APP_URL, '/') . '/index.html';
        $text = '🐾 ' . $name . ' предлагает прогулку! Где: ' . $place . '. Когда: ' . $scheduledAt . '. Открой чат, чтобы подтвердить: ' . $link;
        sendTelegramMessage($partner['tg_id'], $text);
    } catch (Exception $e) {
        error_log('DogBuddy walk propose notify: ' . $e->getMessage());
    }
}

function notifyWalkConfirmed($pdo, $match, $place, $scheduledAt) {
    try {
        require_once __DIR__ . '/telegram.php';
        $owners = walkOwners($pdo, (int) $match['dog_a_id'], (int) $match['dog_b_id']);
        $text = '✅ Прогулка подтверждена: ' . trim((string) $place) . ', ' . trim((string) $scheduledAt);
        foreach ($owners as $owner) {
            sendTelegramMessage($owner['tg_id'], $text);
        }
    } catch (Exception $e) {
        error_log('DogBuddy walk confirm notify: ' . $e->getMessage());
    }
}

function walkOwners($pdo, $dogAId, $dogBId) {
    $stmt = $pdo->prepare(
        'SELECT d.id, d.name, u.tg_id
         FROM dogs d
         INNER JOIN users u ON u.id = d.user_id
         WHERE d.id = :dog_a OR d.id = :dog_b'
    );
    $stmt->execute([
        'dog_a' => $dogAId,
        'dog_b' => $dogBId,
    ]);
    return $stmt->fetchAll();
}

function walkChatId($pdo, $matchId) {
    $stmt = $pdo->prepare('SELECT id FROM chats WHERE match_id = :match_id');
    $stmt->execute(['match_id' => $matchId]);
    $chatId = $stmt->fetchColumn();
    return $chatId ? (int) $chatId : 0;
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
    header('X-Content-Type-Options: nosniff');
    if ($origin !== 'https://pereskazka-ai.ru') {
        return;
    }

    header('Access-Control-Allow-Origin: https://pereskazka-ai.ru');
    header('Vary: Origin');
    header('Access-Control-Allow-Methods: GET, POST, PATCH, OPTIONS');
    header('Access-Control-Allow-Headers: Content-Type');
    header('Access-Control-Max-Age: 86400');
}
