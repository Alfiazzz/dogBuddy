<?php

function requestTgId($source) {
    $initData = extractInitData($source);
    $user = telegramWebAppUser($initData);
    if ($user && (int) $user['id'] > 0) {
        return (int) $user['id'];
    }
    if ($initData === '' && defined('DEBUG_MODE') && DEBUG_MODE) {
        return 1;
    }

    http_response_code(401);
    header('X-Content-Type-Options: nosniff');
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode([
        'ok' => false,
        'error' => 'Откройте приложение в Telegram.',
    ], JSON_UNESCAPED_UNICODE);
    exit;
}

function actorFirstName($source) {
    $user = telegramWebAppUser(extractInitData($source));
    if ($user && trim((string) $user['first_name']) !== '') {
        return trim((string) $user['first_name']);
    }
    return '';
}

function extractInitData($source) {
    if (is_array($source) && isset($source['init_data'])) {
        return trim((string) $source['init_data']);
    }
    if (isset($_GET['init_data'])) {
        return trim((string) $_GET['init_data']);
    }
    return '';
}

function validateTelegramInitData($initData) {
    $user = telegramWebAppUser($initData);
    if (!$user || (int) $user['id'] < 1) {
        return 0;
    }
    return (int) $user['id'];
}

function telegramWebAppUser($initData) {
    static $cacheKey = null;
    static $cacheUser = null;

    $initData = (string) $initData;
    if ($cacheKey === $initData) {
        return $cacheUser;
    }
    $cacheKey = $initData;
    $cacheUser = null;

    if ($initData === '' || !defined('BOT_TOKEN') || BOT_TOKEN === '') {
        return null;
    }

    $fields = [];
    foreach (explode('&', $initData) as $chunk) {
        if ($chunk === '' || strpos($chunk, '=') === false) {
            continue;
        }
        $pair = explode('=', $chunk, 2);
        $fields[rawurldecode($pair[0])] = rawurldecode($pair[1]);
    }
    if (empty($fields['hash']) || !isset($fields['auth_date']) || strlen((string) $fields['hash']) !== 64) {
        return null;
    }

    $authDate = (int) $fields['auth_date'];
    if ($authDate < 1 || $authDate > time() + 60 || (time() - $authDate) > 86400) {
        return null;
    }

    $hash = (string) $fields['hash'];
    unset($fields['hash']);
    ksort($fields);
    $lines = [];
    foreach ($fields as $key => $value) {
        $lines[] = $key . '=' . $value;
    }
    $secret = hash_hmac('sha256', BOT_TOKEN, 'WebAppData', true);
    $calculated = hash_hmac('sha256', implode("\n", $lines), $secret);
    if (!hash_equals($calculated, $hash)) {
        return null;
    }

    $user = json_decode(isset($fields['user']) ? $fields['user'] : '', true);
    if (!is_array($user) || !isset($user['id']) || (int) $user['id'] < 1) {
        return null;
    }
    $cacheUser = [
        'id' => (int) $user['id'],
        'first_name' => isset($user['first_name']) ? (string) $user['first_name'] : '',
    ];
    return $cacheUser;
}

function findOrCreateUser($pdo, $tgId, $firstName) {
    $firstName = trim((string) $firstName);
    if (function_exists('mb_substr')) {
        $firstName = mb_substr($firstName, 0, 100, 'UTF-8');
    } elseif (strlen($firstName) > 100) {
        $firstName = substr($firstName, 0, 100);
    }

    $stmt = $pdo->prepare('SELECT id, tg_id, first_name FROM users WHERE tg_id = :tg_id');
    $stmt->execute(['tg_id' => $tgId]);
    $user = $stmt->fetch();
    if ($user) {
        if ($firstName !== '' && (string) $user['first_name'] !== $firstName) {
            $update = $pdo->prepare('UPDATE users SET first_name = :first_name WHERE id = :id');
            $update->execute([
                'first_name' => $firstName,
                'id' => (int) $user['id'],
            ]);
        }
        return [
            'id' => (int) $user['id'],
            'tg_id' => (int) $user['tg_id'],
            'first_name' => $firstName !== '' ? $firstName : (string) $user['first_name'],
        ];
    }

    $insert = $pdo->prepare('INSERT INTO users (tg_id, first_name) VALUES (:tg_id, :first_name)');
    $insert->execute([
        'tg_id' => $tgId,
        'first_name' => $firstName !== '' ? $firstName : null,
    ]);

    return [
        'id' => (int) $pdo->lastInsertId(),
        'tg_id' => $tgId,
        'first_name' => $firstName,
    ];
}

function findUserDogId($pdo, $tgId) {
    $stmt = $pdo->prepare(
        'SELECT d.id
         FROM dogs d
         INNER JOIN users u ON u.id = d.user_id
         WHERE u.tg_id = :tg_id
         ORDER BY d.id ASC
         LIMIT 1'
    );
    $stmt->execute(['tg_id' => $tgId]);
    $id = $stmt->fetchColumn();
    return $id ? (int) $id : 0;
}
