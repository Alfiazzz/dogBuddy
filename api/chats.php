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
    if ($method === 'GET' && $action === 'get_messages') {
        handleGetMessages($pdo);
    }

    if ($method === 'POST' && $action === 'send') {
        handleSendMessage($pdo);
    }
} catch (PDOException $e) {
    error_log('DogBuddy chats: ' . $e->getMessage());
    $message = 'Не удалось обработать сообщение.';
    if ((string) $e->getCode() === '42S02') {
        $message = 'Сначала создайте таблицу messages в phpMyAdmin.';
    } elseif ((string) $e->getCode() === '23000') {
        $message = 'Такого чата или собаки нет в базе.';
    }
    respondError($message, 500);
}

respondError('Неизвестное действие.', 405);

function handleGetMessages($pdo) {
    $chatId = filter_var($_GET['chat_id'] ?? null, FILTER_VALIDATE_INT);
    if ($chatId === false || $chatId < 1) {
        respondError('Укажите chat_id.', 400);
    }

    $chat = findChat($pdo, $chatId);
    if (!$chat) {
        respondError('Чат не найден.', 404);
    }
    $myDogId = findUserDogId($pdo, requestTgId($_GET));
    if ($myDogId < 1) {
        respondError('Сначала заполните анкету собаки.', 404);
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

    $chatId = filter_var($data['chat_id'] ?? null, FILTER_VALIDATE_INT);
    $senderDogId = findUserDogId($pdo, requestTgId($data));
    $text = trim((string) ($data['text'] ?? ''));
    $length = function_exists('mb_strlen') ? mb_strlen($text, 'UTF-8') : strlen($text);

    if ($chatId === false || $chatId < 1) {
        respondError('Укажите chat_id.', 400);
    }
    if ($senderDogId < 1) {
        respondError('Сначала заполните анкету собаки.', 404);
    }
    if ($text === '') {
        respondError('Введите текст сообщения.', 400);
    }
    if ($length > 1000) {
        respondError('Сообщение длиннее 1000 символов.', 400);
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

function findChat($pdo, $chatId) {
    $stmt = $pdo->prepare(
        'SELECT c.id, m.dog_a_id, m.dog_b_id, a.name AS dog_a_name, b.name AS dog_b_name
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
    $allowedOrigin = is_string($origin) && preg_match(
        '#^https://([a-z0-9-]+\.)+(pages\.dev|workers\.dev)$#i',
        $origin
    ) === 1;
    if (!$allowedOrigin) {
        return;
    }

    header('Access-Control-Allow-Origin: ' . $origin);
    header('Vary: Origin');
    header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
    header('Access-Control-Allow-Headers: Content-Type');
    header('Access-Control-Max-Age: 86400');
}
