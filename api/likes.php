<?php
sendCorsHeaders();

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}

header('Content-Type: application/json; charset=utf-8');

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode([
        'ok' => false,
        'error' => 'Отправьте лайк методом POST.',
    ], JSON_UNESCAPED_UNICODE);
    exit;
}

require_once __DIR__ . '/config.php';
require_once __DIR__ . '/user.php';

$raw = file_get_contents('php://input');
$data = json_decode($raw, true);
if (!is_array($data)) {
    $data = $_POST;
}

$toDogId = filter_var($data['to_dog_id'] ?? null, FILTER_VALIDATE_INT);
$fromDogId = findUserDogId($pdo, requestTgId($data));

if ($toDogId === false || $toDogId < 1) {
    respondError('Укажите to_dog_id.', 400);
}
if ($fromDogId < 1) {
    respondError('Сначала заполните анкету собаки.', 404);
}

if ($fromDogId === $toDogId) {
    respondError('Собака не может лайкнуть сама себя.', 400);
}

try {
    $insertLike = $pdo->prepare(
        'INSERT INTO likes (from_dog_id, to_dog_id) VALUES (:from_dog_id, :to_dog_id)'
    );
    try {
        $insertLike->execute([
            'from_dog_id' => $fromDogId,
            'to_dog_id' => $toDogId,
        ]);
    } catch (PDOException $e) {
        if ((string) $e->getCode() !== '23000') {
            throw $e;
        }
    }

    $reverse = $pdo->prepare(
        'SELECT id FROM likes WHERE from_dog_id = :from_dog_id AND to_dog_id = :to_dog_id'
    );
    $reverse->execute([
        'from_dog_id' => $toDogId,
        'to_dog_id' => $fromDogId,
    ]);

    if (!$reverse->fetch()) {
        echo json_encode([
            'ok' => true,
            'match' => false,
        ], JSON_UNESCAPED_UNICODE);
        exit;
    }

    $dogAId = min($fromDogId, $toDogId);
    $dogBId = max($fromDogId, $toDogId);

    $pdo->beginTransaction();

    $insertMatch = $pdo->prepare(
        'INSERT INTO matches (dog_a_id, dog_b_id) VALUES (:dog_a_id, :dog_b_id)'
    );
    try {
        $insertMatch->execute([
            'dog_a_id' => $dogAId,
            'dog_b_id' => $dogBId,
        ]);
        $matchId = (int) $pdo->lastInsertId();
    } catch (PDOException $e) {
        if ((string) $e->getCode() !== '23000') {
            throw $e;
        }
        $findMatch = $pdo->prepare(
            'SELECT id FROM matches WHERE dog_a_id = :dog_a_id AND dog_b_id = :dog_b_id'
        );
        $findMatch->execute([
            'dog_a_id' => $dogAId,
            'dog_b_id' => $dogBId,
        ]);
        $matchId = (int) $findMatch->fetchColumn();
    }

    $findChat = $pdo->prepare('SELECT id FROM chats WHERE match_id = :match_id');
    $findChat->execute(['match_id' => $matchId]);
    $chatId = $findChat->fetchColumn();

    if (!$chatId) {
        $insertChat = $pdo->prepare('INSERT INTO chats (match_id) VALUES (:match_id)');
        $insertChat->execute(['match_id' => $matchId]);
        $chatId = (int) $pdo->lastInsertId();
    }

    $pdo->commit();
} catch (PDOException $e) {
    if ($pdo->inTransaction()) {
        $pdo->rollBack();
    }
    error_log('DogBuddy likes: ' . $e->getMessage());
    $message = 'Не удалось сохранить лайк.';
    if ((string) $e->getCode() === '42S02') {
        $message = 'Сначала создайте таблицы likes, matches и chats в phpMyAdmin.';
    } elseif ((string) $e->getCode() === '23000') {
        $message = 'Такой собаки нет в базе.';
    }
    respondError($message, 500);
}

echo json_encode([
    'ok' => true,
    'match' => true,
    'chat_id' => (int) $chatId,
], JSON_UNESCAPED_UNICODE);
exit;

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
    header('Access-Control-Allow-Methods: POST, OPTIONS');
    header('Access-Control-Allow-Headers: Content-Type');
    header('Access-Control-Max-Age: 86400');
}
