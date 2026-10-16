<?php

function requestTgId($source) {
    if (!is_array($source)) {
        $source = [];
    }
    $value = $source['tg_id'] ?? ($_GET['tg_id'] ?? null);
    $tgId = filter_var($value, FILTER_VALIDATE_INT);
    if ($tgId === false || $tgId < 1) {
        return 1;
    }
    return (int) $tgId;
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
