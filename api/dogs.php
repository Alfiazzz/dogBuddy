<?php
sendCorsHeaders();

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}

header('Content-Type: application/json; charset=utf-8');

if ($_SERVER['REQUEST_METHOD'] === 'GET' && (($_GET['action'] ?? '') === 'nearby' || ($_GET['action'] ?? '') === 'me')) {
    require_once __DIR__ . '/config.php';
    require_once __DIR__ . '/user.php';
    if (($_GET['action'] ?? '') === 'me') {
        handleMe($pdo);
    } else {
        handleNearby($pdo);
    }
    exit;
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode([
        'ok' => false,
        'error' => 'Отправьте анкету методом POST.',
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

$name = trim((string) ($data['name'] ?? ''));
$breed = trim((string) ($data['breed'] ?? ''));
$weightRaw = $data['weight_kg'] ?? null;
$activity = filter_var($data['activity'] ?? null, FILTER_VALIDATE_INT);
$vaccinated = filter_var($data['vaccinated'] ?? false, FILTER_VALIDATE_BOOLEAN);

if ($name === '' || textLength($name) > 100) {
    respondError('Укажите имя собаки, не длиннее 100 символов.', 400);
}

if (textLength($breed) > 100) {
    respondError('Порода не должна быть длиннее 100 символов.', 400);
}

if (!is_numeric($weightRaw) || (float) $weightRaw <= 0 || (float) $weightRaw >= 200) {
    respondError('Укажите вес больше 0 и меньше 200 кг.', 400);
}

if ($activity === false || $activity < 1 || $activity > 5) {
    respondError('Активность должна быть числом от 1 до 5.', 400);
}

$lat = normalizeCoordinate($data['lat'] ?? null, -90, 90);
$lon = normalizeCoordinate($data['lon'] ?? null, -180, 180);
if ($lat === null) {
    respondError('Укажите широту от -90 до 90.', 400);
}
if ($lon === null) {
    respondError('Укажите долготу от -180 до 180.', 400);
}

$tgId = requestTgId($data);
$firstName = trim((string) ($data['first_name'] ?? ''));

if (findUserDogId($pdo, $tgId) > 0) {
    respondError('Анкета собаки уже сохранена.', 409);
}

try {
    $pdo->beginTransaction();
    $owner = findOrCreateUser($pdo, $tgId, $firstName);
    $userId = (int) $owner['id'];

    $stmt = $pdo->prepare(
        'INSERT INTO dogs (user_id, name, breed, weight_kg, activity, vaccinated)
         VALUES (:user_id, :name, :breed, :weight_kg, :activity, :vaccinated)'
    );
    $stmt->execute([
        'user_id' => $userId,
        'name' => $name,
        'breed' => $breed === '' ? null : $breed,
        'weight_kg' => $weightRaw,
        'activity' => $activity,
        'vaccinated' => $vaccinated ? 1 : 0,
    ]);

    $dogId = (int) $pdo->lastInsertId();
    $geo = $pdo->prepare(
        'INSERT INTO geo (dog_id, home_lat, home_lon, radius_m)
         VALUES (:dog_id, :home_lat, :home_lon, :radius_m)'
    );
    $geo->execute([
        'dog_id' => $dogId,
        'home_lat' => $lat,
        'home_lon' => $lon,
        'radius_m' => 3000,
    ]);

    $pdo->commit();
} catch (PDOException $e) {
    if ($pdo->inTransaction()) {
        $pdo->rollBack();
    }
    error_log('DogBuddy dogs: ' . $e->getMessage());
    $message = 'Не удалось сохранить собаку.';
    $sqlState = (string) $e->getCode();
    if ($sqlState === '42S02') {
        $message = 'Сначала создайте таблицу geo в phpMyAdmin.';
    } elseif ($sqlState === '23000') {
        $message = 'Не удалось привязать собаку к пользователю Telegram.';
    }
    respondError($message, 500);
}

http_response_code(200);
echo json_encode([
    'ok' => true,
    'message' => 'Собака добавлена',
    'dog_id' => $dogId,
    'tg_id' => $tgId,
], JSON_UNESCAPED_UNICODE);
exit;

function handleMe($pdo) {
    $tgId = requestTgId($_GET);
    $stmt = $pdo->prepare(
        'SELECT d.id, d.name
         FROM dogs d
         INNER JOIN users u ON u.id = d.user_id
         WHERE u.tg_id = :tg_id
         ORDER BY d.id ASC
         LIMIT 1'
    );
    $stmt->execute(['tg_id' => $tgId]);
    $row = $stmt->fetch();

    if (!$row) {
        echo json_encode([
            'ok' => true,
            'has_dog' => false,
            'tg_id' => $tgId,
        ], JSON_UNESCAPED_UNICODE);
        exit;
    }

    echo json_encode([
        'ok' => true,
        'has_dog' => true,
        'dog_id' => (int) $row['id'],
        'name' => (string) $row['name'],
        'tg_id' => $tgId,
    ], JSON_UNESCAPED_UNICODE);
    exit;
}

function handleNearby($pdo) {
    $lat = normalizeCoordinate($_GET['lat'] ?? null, -90, 90);
    $lon = normalizeCoordinate($_GET['lon'] ?? null, -180, 180);
    if ($lat === null || $lon === null) {
        respondError('Укажите координаты lat и lon.', 400);
    }

    $radius = filter_var($_GET['radius'] ?? 3000, FILTER_VALIDATE_INT);
    if ($radius === false || $radius < 500 || $radius > 10000) {
        $radius = 3000;
    }

    $currentDogId = findUserDogId($pdo, requestTgId($_GET));
    if ($currentDogId < 1) {
        respondError('Сначала заполните анкету собаки.', 404);
    }

    try {
        $currentStmt = $pdo->prepare(
            'SELECT id, activity, vaccinated, birth_date, temperament, weight_kg
             FROM dogs
             WHERE id = ?'
        );
        $currentStmt->execute([$currentDogId]);
        $currentDog = $currentStmt->fetch();
        if (!$currentDog) {
            respondError('Текущая собака не найдена.', 404);
        }

        $sql = 'SELECT d.id, d.name, d.breed, d.weight_kg, d.activity, d.vaccinated,
                       d.birth_date, d.temperament, d.photo_url,
                       (6371000 * acos(LEAST(1, GREATEST(-1,
                           cos(radians(?)) * cos(radians(g.home_lat)) *
                           cos(radians(g.home_lon) - radians(?)) +
                           sin(radians(?)) * sin(radians(g.home_lat))
                       )))) AS distance_m
                FROM dogs d
                JOIN geo g ON d.id = g.dog_id
                WHERE d.id != ?
                  AND d.is_active = 1
                  AND (6371000 * acos(LEAST(1, GREATEST(-1,
                      cos(radians(?)) * cos(radians(g.home_lat)) *
                      cos(radians(g.home_lon) - radians(?)) +
                      sin(radians(?)) * sin(radians(g.home_lat))
                  )))) <= ?
                ORDER BY distance_m
                LIMIT 20';
        $nearbyStmt = $pdo->prepare($sql);
        $nearbyStmt->execute([$lat, $lon, $lat, $currentDogId, $lat, $lon, $lat, $radius]);
        $rows = $nearbyStmt->fetchAll();
    } catch (PDOException $e) {
        error_log('DogBuddy nearby: ' . $e->getMessage());
        respondError('Не удалось найти собак рядом.', 500);
    }

    $dogs = [];
    foreach ($rows as $row) {
        $dogs[] = [
            'id' => (int) $row['id'],
            'name' => $row['name'],
            'breed' => $row['breed'],
            'weight_kg' => $row['weight_kg'],
            'vaccinated' => (int) $row['vaccinated'],
            'distance_m' => (int) round((float) $row['distance_m']),
            'compatibility' => calculateCompatibility($currentDog, $row),
            'photo_url' => $row['photo_url'],
        ];
    }

    echo json_encode([
        'ok' => true,
        'my_dog_id' => $currentDogId,
        'dogs' => $dogs,
    ], JSON_UNESCAPED_UNICODE);
    exit;
}

function calculateCompatibility($dog_a, $dog_b) {
    $score = 50;

    if (isset($dog_a['activity'], $dog_b['activity']) && abs($dog_a['activity'] - $dog_b['activity']) <= 1) {
        $score += 15;
    }

    if (!empty($dog_a['vaccinated']) && !empty($dog_b['vaccinated'])) {
        $score += 10;
    }

    $ageGroupA = getAgeGroup($dog_a['birth_date'] ?? null);
    $ageGroupB = getAgeGroup($dog_b['birth_date'] ?? null);
    if ($ageGroupA && $ageGroupB && ($ageGroupA === $ageGroupB || areAdjacentGroups($ageGroupA, $ageGroupB))) {
        $score += 10;
    }

    $tagsA = temperamentTags($dog_a['temperament'] ?? '');
    $tagsB = temperamentTags($dog_b['temperament'] ?? '');
    $score += 5 * count(array_intersect($tagsA, $tagsB));

    $weightA = (float) ($dog_a['weight_kg'] ?? 0);
    $weightB = (float) ($dog_b['weight_kg'] ?? 0);
    if ($weightA > 0 && $weightB > 0) {
        $weightRatio = max($weightA, $weightB) / min($weightA, $weightB);
        if ($weightRatio > 4) {
            $score -= 40;
        } elseif ($weightRatio > 2.5) {
            $score -= 20;
        }
    }

    return max(0, min(100, $score));
}

function getAgeGroup($birthDate) {
    if (!$birthDate) {
        return null;
    }

    $timestamp = strtotime($birthDate);
    if ($timestamp === false) {
        return null;
    }

    $ageYears = (time() - $timestamp) / (365.25 * 24 * 3600);
    if ($ageYears < 1) {
        return 'puppy';
    }
    if ($ageYears < 7) {
        return 'adult';
    }

    return 'senior';
}

function areAdjacentGroups($groupA, $groupB) {
    $order = ['puppy' => 1, 'adult' => 2, 'senior' => 3];
    if (!isset($order[$groupA], $order[$groupB])) {
        return false;
    }

    return abs($order[$groupA] - $order[$groupB]) === 1;
}

function temperamentTags($value) {
    $parts = explode(',', (string) $value);
    $tags = [];
    foreach ($parts as $part) {
        $tag = trim($part);
        if ($tag !== '') {
            $tags[] = $tag;
        }
    }

    return $tags;
}

function respondError($message, $status) {
    http_response_code($status);
    echo json_encode([
        'ok' => false,
        'error' => $message,
    ], JSON_UNESCAPED_UNICODE);
    exit;
}

function normalizeCoordinate($value, $min, $max) {
    if (!is_numeric($value)) {
        return null;
    }

    $number = (float) $value;
    if ($number < $min || $number > $max) {
        return null;
    }

    return $number;
}

function textLength($value) {
    if (function_exists('mb_strlen')) {
        return mb_strlen($value, 'UTF-8');
    }

    return strlen($value);
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
