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
    require_once __DIR__ . '/validation.php';
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
require_once __DIR__ . '/validation.php';

$raw = file_get_contents('php://input');
$data = json_decode($raw, true);
if (!is_array($data)) {
    $data = $_POST;
}

if ((string) ($_GET['action'] ?? '') === 'update_profile') {
    handleUpdateProfile($pdo, $data);
}

if ((string) ($_GET['action'] ?? '') === 'delete_account') {
    handleDeleteAccount($pdo, $data);
}

$tgId = requestTgId($data);
$firstName = actorFirstName($data);

$nameCheck = validateName($data['name'] ?? '');
validationStop($nameCheck);
$breedCheck = validateBreed($data['breed'] ?? '');
validationStop($breedCheck);
$weightCheck = validateWeight($data['weight_kg'] ?? null);
validationStop($weightCheck);
$activityCheck = validateActivity($data['activity'] ?? null);
validationStop($activityCheck);
$vaccinatedCheck = validateVaccinated($data['vaccinated'] ?? null);
validationStop($vaccinatedCheck);
$coordsCheck = validateCoords($data['home_lat'] ?? ($data['lat'] ?? null), $data['home_lon'] ?? ($data['lon'] ?? null));
validationStop($coordsCheck);
$radiusCheck = validateRadius($data['radius_m'] ?? null);
validationStop($radiusCheck);
$photoCheck = validatePhotoUrl($data['photo_url'] ?? '');
validationStop($photoCheck);

$name = $nameCheck['value'];
$breed = $breedCheck['value'];
$weight = $weightCheck['value'];
$activity = $activityCheck['value'];
$vaccinated = $vaccinatedCheck['value'];
$lat = $coordsCheck['value']['lat'];
$lon = $coordsCheck['value']['lon'];
$radius = $radiusCheck['value'];
$photoUrl = $photoCheck['value'];

if (findUserDogId($pdo, $tgId) > 0) {
    respondError('Анкета собаки уже сохранена.', 409);
}

try {
    $pdo->beginTransaction();
    $owner = findOrCreateUser($pdo, $tgId, $firstName);
    $userId = (int) $owner['id'];

    $stmt = $pdo->prepare(
        'INSERT INTO dogs (user_id, name, breed, weight_kg, activity, vaccinated, photo_url)
         VALUES (:user_id, :name, :breed, :weight_kg, :activity, :vaccinated, :photo_url)'
    );
    $stmt->execute([
        'user_id' => $userId,
        'name' => $name,
        'breed' => $breed,
        'weight_kg' => $weight,
        'activity' => $activity,
        'vaccinated' => $vaccinated,
        'photo_url' => $photoUrl,
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
        'radius_m' => $radius,
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
        'SELECT d.id, d.name, d.breed, d.weight_kg, d.activity, d.vaccinated, d.photo_url,
                g.home_lat, g.home_lon, g.radius_m
         FROM dogs d
         INNER JOIN users u ON u.id = d.user_id
         LEFT JOIN geo g ON g.dog_id = d.id
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

    echo json_encode(dogProfilePayload($tgId, $row), JSON_UNESCAPED_UNICODE);
    exit;
}

function handleUpdateProfile($pdo, $data) {
    $tgId = requestTgId($data);
    $dogId = findUserDogId($pdo, $tgId);
    if ($dogId < 1) {
        respondError('Сначала заполните анкету собаки.', 404);
    }

    $nameCheck = validateName($data['name'] ?? '');
    validationStop($nameCheck);
    $breedCheck = validateBreed($data['breed'] ?? '');
    validationStop($breedCheck);
    $weightCheck = validateWeight($data['weight_kg'] ?? null);
    validationStop($weightCheck);
    $activityCheck = validateActivity($data['activity'] ?? null);
    validationStop($activityCheck);
    $vaccinatedCheck = validateVaccinated($data['vaccinated'] ?? null);
    validationStop($vaccinatedCheck);
    $coordsCheck = validateCoords($data['home_lat'] ?? ($data['lat'] ?? null), $data['home_lon'] ?? ($data['lon'] ?? null));
    validationStop($coordsCheck);
    $radiusCheck = validateRadius($data['radius_m'] ?? null);
    validationStop($radiusCheck);

    $currentStmt = $pdo->prepare(
        'SELECT d.photo_url, g.dog_id AS geo_id
         FROM dogs d
         LEFT JOIN geo g ON g.dog_id = d.id
         WHERE d.id = :dog_id'
    );
    $currentStmt->execute(['dog_id' => $dogId]);
    $current = $currentStmt->fetch();
    if (!$current) {
        respondError('Анкета собаки не найдена.', 404);
    }

    $photoRaw = trim((string) ($data['photo_url'] ?? ''));
    if ($photoRaw === '') {
        $photoUrl = trim((string) ($current['photo_url'] ?? ''));
        if ($photoUrl === '') {
            $photoUrl = 'https://via.placeholder.com/300x300?text=No+Photo';
        }
    } else {
        $photoCheck = validatePhotoUrl($photoRaw);
        validationStop($photoCheck);
        $photoUrl = $photoCheck['value'];
    }

    $name = $nameCheck['value'];
    $breed = $breedCheck['value'];
    $weight = $weightCheck['value'];
    $activity = $activityCheck['value'];
    $vaccinated = $vaccinatedCheck['value'];
    $lat = $coordsCheck['value']['lat'];
    $lon = $coordsCheck['value']['lon'];
    $radius = $radiusCheck['value'];

    try {
        $pdo->beginTransaction();
        $dog = $pdo->prepare(
            'UPDATE dogs
             SET name = :name, breed = :breed, weight_kg = :weight_kg,
                 activity = :activity, vaccinated = :vaccinated, photo_url = :photo_url
             WHERE id = :dog_id'
        );
        $dog->execute([
            'name' => $name,
            'breed' => $breed,
            'weight_kg' => $weight,
            'activity' => $activity,
            'vaccinated' => $vaccinated,
            'photo_url' => $photoUrl,
            'dog_id' => $dogId,
        ]);

        if ($current['geo_id'] === null) {
            $geo = $pdo->prepare(
                'INSERT INTO geo (dog_id, home_lat, home_lon, radius_m)
                 VALUES (:dog_id, :home_lat, :home_lon, :radius_m)'
            );
        } else {
            $geo = $pdo->prepare(
                'UPDATE geo
                 SET home_lat = :home_lat, home_lon = :home_lon, radius_m = :radius_m
                 WHERE dog_id = :dog_id'
            );
        }
        $geo->execute([
            'dog_id' => $dogId,
            'home_lat' => $lat,
            'home_lon' => $lon,
            'radius_m' => $radius,
        ]);
        $pdo->commit();
    } catch (PDOException $e) {
        if ($pdo->inTransaction()) {
            $pdo->rollBack();
        }
        error_log('DogBuddy profile: ' . $e->getMessage());
        respondError('Не удалось обновить профиль.', 500);
    }

    echo json_encode(dogProfilePayload($tgId, [
        'id' => $dogId,
        'name' => $name,
        'breed' => $breed,
        'weight_kg' => $weight,
        'activity' => $activity,
        'vaccinated' => $vaccinated,
        'photo_url' => $photoUrl,
        'home_lat' => $lat,
        'home_lon' => $lon,
        'radius_m' => $radius,
    ], 'Профиль успешно обновлен'), JSON_UNESCAPED_UNICODE);
    exit;
}

function dogProfilePayload($tgId, $row, $message = '') {
    $photo = trim((string) ($row['photo_url'] ?? ''));
    $payload = [
        'ok' => true,
        'has_dog' => true,
        'dog_id' => (int) $row['id'],
        'name' => (string) $row['name'],
        'breed' => (string) ($row['breed'] ?? ''),
        'weight_kg' => $row['weight_kg'] !== null && $row['weight_kg'] !== '' ? (float) $row['weight_kg'] : null,
        'activity' => $row['activity'] !== null && $row['activity'] !== '' ? (int) $row['activity'] : null,
        'vaccinated' => (int) ($row['vaccinated'] ?? 0) === 1 ? 1 : 0,
        'photo_url' => $photo !== '' ? $photo : 'https://via.placeholder.com/300x300?text=No+Photo',
        'home_lat' => $row['home_lat'] !== null && $row['home_lat'] !== '' ? (float) $row['home_lat'] : null,
        'home_lon' => $row['home_lon'] !== null && $row['home_lon'] !== '' ? (float) $row['home_lon'] : null,
        'radius_m' => $row['radius_m'] !== null && $row['radius_m'] !== '' ? (int) $row['radius_m'] : 3000,
        'tg_id' => $tgId,
    ];
    if ($message !== '') {
        $payload['message'] = $message;
    }
    return $payload;
}

function handleNearby($pdo) {
    $currentDogId = findUserDogId($pdo, requestTgId($_GET));
    $coordsCheck = validateCoords($_GET['lat'] ?? null, $_GET['lon'] ?? null);
    validationStop($coordsCheck);
    $lat = $coordsCheck['value']['lat'];
    $lon = $coordsCheck['value']['lon'];

    if (!isset($_GET['radius']) || $_GET['radius'] === '') {
        $radius = 3000;
    } else {
        $radiusCheck = validateRadius($_GET['radius']);
        validationStop($radiusCheck);
        $radius = $radiusCheck['value'];
    }
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

function handleDeleteAccount($pdo, $data) {
    $tgId = requestTgId($data);
    $owner = $pdo->prepare(
        'SELECT d.id AS dog_id, u.id AS user_id
         FROM users u
         INNER JOIN dogs d ON d.user_id = u.id
         WHERE u.tg_id = :tg_id
         ORDER BY d.id ASC'
    );
    $owner->execute(['tg_id' => $tgId]);
    $rows = $owner->fetchAll();
    if (!$rows) {
        respondError('Анкета собаки не найдена.', 404);
    }

    $userId = (int) $rows[0]['user_id'];
    $hasBlocks = tableExists($pdo, 'blocks');

    try {
        $pdo->beginTransaction();
        foreach ($rows as $row) {
            if ((int) $row['user_id'] !== $userId) {
                throw new RuntimeException('owner');
            }
            deleteDogRelations($pdo, (int) $row['dog_id'], $hasBlocks);
            $dog = $pdo->prepare('DELETE FROM dogs WHERE id = :dog_id AND user_id = :user_id');
            $dog->execute([
                'dog_id' => (int) $row['dog_id'],
                'user_id' => $userId,
            ]);
        }
        $user = $pdo->prepare('DELETE FROM users WHERE id = :user_id AND tg_id = :tg_id');
        $user->execute([
            'user_id' => $userId,
            'tg_id' => $tgId,
        ]);
        $pdo->commit();
    } catch (Exception $e) {
        if ($pdo->inTransaction()) {
            $pdo->rollBack();
        }
        error_log('DogBuddy delete account: ' . $e->getMessage());
        respondError('Не удалось удалить аккаунт.', 500);
    }

    echo json_encode([
        'ok' => true,
        'message' => 'Аккаунт успешно удален',
    ], JSON_UNESCAPED_UNICODE);
    exit;
}

function deleteDogRelations($pdo, $dogId, $hasBlocks) {
    $reviews = $pdo->prepare(
        'DELETE r FROM reviews r
         INNER JOIN walks w ON w.id = r.walk_id
         LEFT JOIN matches m ON m.id = w.match_id
         WHERE r.about_dog_id = :about_dog
            OR w.proposer_id = :proposer
            OR m.dog_a_id = :dog_a
            OR m.dog_b_id = :dog_b'
    );
    $reviews->execute([
        'about_dog' => $dogId,
        'proposer' => $dogId,
        'dog_a' => $dogId,
        'dog_b' => $dogId,
    ]);

    $messages = $pdo->prepare(
        'DELETE msg FROM messages msg
         LEFT JOIN chats c ON c.id = msg.chat_id
         LEFT JOIN matches m ON m.id = c.match_id
         WHERE msg.sender_dog_id = :sender_dog
            OR m.dog_a_id = :dog_a
            OR m.dog_b_id = :dog_b'
    );
    $messages->execute([
        'sender_dog' => $dogId,
        'dog_a' => $dogId,
        'dog_b' => $dogId,
    ]);

    $chats = $pdo->prepare(
        'DELETE c FROM chats c
         INNER JOIN matches m ON m.id = c.match_id
         WHERE m.dog_a_id = :dog_a OR m.dog_b_id = :dog_b'
    );
    $chats->execute([
        'dog_a' => $dogId,
        'dog_b' => $dogId,
    ]);

    $walks = $pdo->prepare(
        'DELETE w FROM walks w
         LEFT JOIN matches m ON m.id = w.match_id
         WHERE w.proposer_id = :proposer
            OR m.dog_a_id = :dog_a
            OR m.dog_b_id = :dog_b'
    );
    $walks->execute([
        'proposer' => $dogId,
        'dog_a' => $dogId,
        'dog_b' => $dogId,
    ]);

    $geo = $pdo->prepare('DELETE FROM geo WHERE dog_id = :dog_id');
    $geo->execute(['dog_id' => $dogId]);

    $likes = $pdo->prepare(
        'DELETE FROM likes WHERE from_dog_id = :from_dog OR to_dog_id = :to_dog'
    );
    $likes->execute([
        'from_dog' => $dogId,
        'to_dog' => $dogId,
    ]);

    if ($hasBlocks) {
        $blocks = $pdo->prepare(
            'DELETE FROM blocks WHERE reporter_dog_id = :reporter OR blocked_dog_id = :blocked'
        );
        $blocks->execute([
            'reporter' => $dogId,
            'blocked' => $dogId,
        ]);
    }

    $matches = $pdo->prepare(
        'DELETE FROM matches WHERE dog_a_id = :dog_a OR dog_b_id = :dog_b'
    );
    $matches->execute([
        'dog_a' => $dogId,
        'dog_b' => $dogId,
    ]);
}

function tableExists($pdo, $name) {
    try {
        $stmt = $pdo->prepare(
            'SELECT 1
             FROM information_schema.tables
             WHERE table_schema = DATABASE() AND table_name = :table_name
             LIMIT 1'
        );
        $stmt->execute(['table_name' => $name]);
        return (bool) $stmt->fetchColumn();
    } catch (Exception $e) {
        return false;
    }
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
