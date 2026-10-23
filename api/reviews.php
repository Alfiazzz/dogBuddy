<?php
sendCorsHeaders();

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}

header('Content-Type: application/json; charset=utf-8');

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    respondError('Отправьте отзыв методом POST.', 405);
}

require_once __DIR__ . '/config.php';
require_once __DIR__ . '/user.php';
require_once __DIR__ . '/validation.php';

$raw = file_get_contents('php://input');
$data = json_decode($raw, true);
if (!is_array($data)) {
    $data = $_POST;
}

$myDogId = findUserDogId($pdo, requestTgId($data));
$walkCheck = validateId($data['walk_id'] ?? null);
validationStop($walkCheck);
$aboutCheck = validateId($data['about_dog_id'] ?? null);
validationStop($aboutCheck);
$ratingCheck = validateRating($data['rating'] ?? null);
validationStop($ratingCheck);
$textCheck = validateReviewText($data['text'] ?? '');
validationStop($textCheck);
$walkId = $walkCheck['value'];
$aboutDogId = $aboutCheck['value'];
$rating = $ratingCheck['value'];
$text = $textCheck['value'];

if ($myDogId < 1) {
    respondError('Сначала заполните анкету собаки.', 404);
}

try {
    $walk = findWalkForReview($pdo, $walkId);
    if (!$walk) {
        respondError('Прогулка не найдена.', 404);
    }
    if ($aboutDogId !== (int) $walk['dog_a_id'] && $aboutDogId !== (int) $walk['dog_b_id']) {
        respondError('Эта собака не участвовала в прогулке.', 403);
    }
    if ($myDogId !== (int) $walk['dog_a_id'] && $myDogId !== (int) $walk['dog_b_id']) {
        respondError('Эта собака не участвовала в прогулке.', 403);
    }
    if ($aboutDogId === $myDogId) {
        respondError('Нельзя оставить отзыв о своей собаке.', 400);
    }

    $pdo->beginTransaction();

    $insert = $pdo->prepare(
        'INSERT INTO reviews (walk_id, about_dog_id, rating, text) VALUES (:walk_id, :about_dog_id, :rating, :text)'
    );
    $insert->execute([
        'walk_id' => $walkId,
        'about_dog_id' => $aboutDogId,
        'rating' => $rating,
        'text' => $text,
    ]);
    $reviewId = (int) $pdo->lastInsertId();

    if ((string) $walk['status'] !== 'done') {
        $update = $pdo->prepare('UPDATE walks SET status = :status WHERE id = :id');
        $update->execute([
            'status' => 'done',
            'id' => $walkId,
        ]);
    }

    $saved = $pdo->prepare(
        'SELECT id, walk_id, about_dog_id, rating, text, created_at FROM reviews WHERE id = :id'
    );
    $saved->execute(['id' => $reviewId]);
    $review = $saved->fetch();

    $pdo->commit();
} catch (PDOException $e) {
    if ($pdo->inTransaction()) {
        $pdo->rollBack();
    }
    error_log('DogBuddy reviews: ' . $e->getMessage());
    $message = 'Не удалось сохранить отзыв.';
    if ((string) $e->getCode() === '42S02') {
        $message = 'Сначала создайте таблицу reviews в phpMyAdmin.';
    } elseif ((string) $e->getCode() === '23000') {
        $message = 'Отзыв на эту прогулку уже есть.';
    }
    respondError($message, 500);
}

echo json_encode([
    'ok' => true,
    'review' => [
        'id' => (int) $review['id'],
        'walk_id' => (int) $review['walk_id'],
        'about_dog_id' => (int) $review['about_dog_id'],
        'rating' => (int) $review['rating'],
        'text' => $review['text'] === null ? '' : (string) $review['text'],
        'created_at' => (string) $review['created_at'],
    ],
], JSON_UNESCAPED_UNICODE);
exit;

function findWalkForReview($pdo, $walkId) {
    $stmt = $pdo->prepare(
        'SELECT w.id, w.status, m.dog_a_id, m.dog_b_id
         FROM walks w
         INNER JOIN matches m ON m.id = w.match_id
         WHERE w.id = :id'
    );
    $stmt->execute(['id' => $walkId]);
    $walk = $stmt->fetch();
    return $walk ?: null;
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
    header('Access-Control-Allow-Methods: POST, OPTIONS');
    header('Access-Control-Allow-Headers: Content-Type');
    header('Access-Control-Max-Age: 86400');
}
