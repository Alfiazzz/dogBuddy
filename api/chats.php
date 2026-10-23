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
    if ($method === 'GET' && $action === 'my_chats') {
        handleMyChats($pdo);
    }

    if ($method === 'GET' && $action === 'get_messages') {
        handleGetMessages($pdo);
    }

    if ($method === 'POST' && $action === 'send') {
        handleSendMessage($pdo);
    }

    if ($method === 'POST' && $action === 'mark_as_read') {
        handleMarkAsRead($pdo);
    }
} catch (PDOException $e) {
    error_log('DogBuddy chats: ' . $e->getMessage());
    $message = 'Не удалось обработать сообщение.';
    if ((string) $e->getCode() === '42S02') {
        $message = 'Сначала создайте таблицу messages в phpMyAdmin.';
    } elseif ((string) $e->getCode() === '23000') {
        $message = 'Такого чата или собаки нет в базе.';
    } elseif ((string) $e->getCode() === '42S22') {
        $message = 'Сначала добавьте колонки непрочитанных сообщений в phpMyAdmin.';
    }
    respondError($message, 500);
}

respondError('Неизвестное действие.', 405);

function handleMyChats($pdo) {
    $myDogId = findUserDogId($pdo, requestTgId($_GET));
    if ($myDogId < 1) {
        respondError('Сначала заполните анкету собаки.', 404);
    }

    $stmt = $pdo->prepare(
        'SELECT c.id AS chat_id,
                CASE WHEN m.dog_a_id = :dog_name THEN b.name ELSE a.name END AS partner_name,
                CASE WHEN m.dog_a_id = :dog_photo THEN b.photo_url ELSE a.photo_url END AS partner_photo,
                lm.last_text,
                lm.last_at,
                (
                    SELECT COUNT(*)
                    FROM messages unread
                    WHERE unread.chat_id = c.id
                      AND unread.is_read = 0
                      AND unread.sender_dog_id <> :dog_unread
                ) AS unread_count
         FROM chats c
         INNER JOIN matches m ON m.id = c.match_id
         INNER JOIN dogs a ON a.id = m.dog_a_id
         INNER JOIN dogs b ON b.id = m.dog_b_id
         LEFT JOIN (
            SELECT msg.chat_id, msg.`text` AS last_text, msg.created_at AS last_at
            FROM messages msg
            INNER JOIN (
                SELECT chat_id, MAX(id) AS max_id
                FROM messages
                GROUP BY chat_id
            ) latest ON latest.max_id = msg.id
         ) lm ON lm.chat_id = c.id
         WHERE m.dog_a_id = :dog_a OR m.dog_b_id = :dog_b
         ORDER BY (unread_count > 0) DESC, (lm.last_at IS NULL), lm.last_at DESC, c.id DESC'
    );
    $stmt->execute([
        'dog_name' => $myDogId,
        'dog_photo' => $myDogId,
        'dog_unread' => $myDogId,
        'dog_a' => $myDogId,
        'dog_b' => $myDogId,
    ]);

    $chats = [];
    foreach ($stmt->fetchAll() as $row) {
        $chats[] = [
            'chat_id' => (int) $row['chat_id'],
            'partner_name' => trim((string) $row['partner_name']) !== '' ? (string) $row['partner_name'] : 'Собеседник',
            'partner_photo' => $row['partner_photo'] !== null && $row['partner_photo'] !== ''
                ? (string) $row['partner_photo']
                : 'https://via.placeholder.com/300x300?text=No+Photo',
            'last_text' => $row['last_text'] !== null ? (string) $row['last_text'] : '',
            'last_at' => $row['last_at'] !== null ? (string) $row['last_at'] : '',
            'unread_count' => (int) $row['unread_count'],
        ];
    }

    echo json_encode([
        'ok' => true,
        'my_dog_id' => $myDogId,
        'chats' => $chats,
    ], JSON_UNESCAPED_UNICODE);
    exit;
}

function handleGetMessages($pdo) {
    $myDogId = findUserDogId($pdo, requestTgId($_GET));
    $chatCheck = validateId($_GET['chat_id'] ?? null);
    validationStop($chatCheck);
    $chatId = $chatCheck['value'];
    if ($myDogId < 1) {
        respondError('Сначала заполните анкету собаки.', 404);
    }

    $chat = findChat($pdo, $chatId);
    if (!$chat) {
        respondError('Чат не найден.', 404);
    }
    if ($myDogId !== (int) $chat['dog_a_id'] && $myDogId !== (int) $chat['dog_b_id']) {
        respondError('Эта собака не участвует в этом чате.', 403);
    }

    $stmt = $pdo->prepare(
        'SELECT id, chat_id, sender_dog_id, `text`, created_at
         FROM messages
         WHERE chat_id = :chat_id
         ORDER BY created_at DESC, id DESC
         LIMIT 50'
    );
    $stmt->execute(['chat_id' => $chatId]);
    $rows = array_reverse($stmt->fetchAll());

    $messages = [];
    foreach ($rows as $row) {
        $messages[] = formatMessage($row);
    }

    echo json_encode([
        'ok' => true,
        'partner_name' => partnerName($chat, $myDogId),
        'my_dog_id' => $myDogId,
        'messages' => $messages,
    ], JSON_UNESCAPED_UNICODE);
    exit;
}

function handleSendMessage($pdo) {
    $raw = file_get_contents('php://input');
    $data = json_decode($raw, true);
    if (!is_array($data)) {
        $data = $_POST;
    }

    $senderDogId = findUserDogId($pdo, requestTgId($data));
    $chatCheck = validateId($data['chat_id'] ?? null);
    validationStop($chatCheck);
    $textCheck = validateMessage($data['text'] ?? '');
    validationStop($textCheck);
    $chatId = $chatCheck['value'];
    $text = $textCheck['value'];

    if ($senderDogId < 1) {
        respondError('Сначала заполните анкету собаки.', 404);
    }

    $chat = findChat($pdo, $chatId);
    if (!$chat) {
        respondError('Чат не найден.', 404);
    }
    if ($senderDogId !== (int) $chat['dog_a_id'] && $senderDogId !== (int) $chat['dog_b_id']) {
        respondError('Эта собака не участвует в этом чате.', 403);
    }

    $insert = $pdo->prepare(
        'INSERT INTO messages (chat_id, sender_dog_id, `text`) VALUES (:chat_id, :sender_dog_id, :text)'
    );
    $insert->execute([
        'chat_id' => $chatId,
        'sender_dog_id' => $senderDogId,
        'text' => $text,
    ]);

    $messageId = (int) $pdo->lastInsertId();
    $saved = $pdo->prepare(
        'SELECT id, chat_id, sender_dog_id, `text`, created_at FROM messages WHERE id = :id'
    );
    $saved->execute(['id' => $messageId]);
    $row = $saved->fetch();

    echo json_encode([
        'ok' => true,
        'message' => formatMessage($row),
    ], JSON_UNESCAPED_UNICODE);
    exit;
}

function handleMarkAsRead($pdo) {
    $raw = file_get_contents('php://input');
    $data = json_decode($raw, true);
    if (!is_array($data)) {
        $data = $_POST;
    }

    $myDogId = findUserDogId($pdo, requestTgId($data));
    $chatCheck = validateId($data['chat_id'] ?? null);
    validationStop($chatCheck);
    $chatId = $chatCheck['value'];
    if ($myDogId < 1) {
        respondError('Сначала заполните анкету собаки.', 404);
    }

    $chat = findChat($pdo, $chatId);
    if (!$chat) {
        respondError('Чат не найден.', 404);
    }
    if ($myDogId !== (int) $chat['dog_a_id'] && $myDogId !== (int) $chat['dog_b_id']) {
        respondError('Эта собака не участвует в этом чате.', 403);
    }

    $update = $pdo->prepare(
        'UPDATE messages
         SET is_read = 1
         WHERE chat_id = :chat_id
           AND sender_dog_id <> :sender_dog_id
           AND is_read = 0'
    );
    $update->execute([
        'chat_id' => $chatId,
        'sender_dog_id' => $myDogId,
    ]);

    $readAt = $pdo->prepare(
        'UPDATE matches
         SET last_read_at_a = IF(dog_a_id = :dog_a, NOW(), last_read_at_a),
             last_read_at_b = IF(dog_b_id = :dog_b, NOW(), last_read_at_b)
         WHERE id = :match_id'
    );
    $readAt->execute([
        'dog_a' => $myDogId,
        'dog_b' => $myDogId,
        'match_id' => (int) $chat['match_id'],
    ]);

    echo json_encode(['ok' => true], JSON_UNESCAPED_UNICODE);
    exit;
}

function findChat($pdo, $chatId) {
    $stmt = $pdo->prepare(
        'SELECT c.id, m.id AS match_id, m.dog_a_id, m.dog_b_id, a.name AS dog_a_name, b.name AS dog_b_name
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

function partnerName($chat, $myDogId) {
    $name = (int) $chat['dog_a_id'] === (int) $myDogId ? $chat['dog_b_name'] : $chat['dog_a_name'];
    $name = trim((string) $name);
    return $name !== '' ? $name : 'Собеседник';
}

function formatMessage($row) {
    return [
        'id' => (int) $row['id'],
        'chat_id' => (int) $row['chat_id'],
        'sender_dog_id' => (int) $row['sender_dog_id'],
        'text' => (string) $row['text'],
        'created_at' => (string) $row['created_at'],
    ];
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
    header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
    header('Access-Control-Allow-Headers: Content-Type');
    header('Access-Control-Max-Age: 86400');
}
