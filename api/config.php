<?php
$host = 'localhost';
$db   = 'имя_бд';
$user = 'пользователь';
$pass = 'пароль';

try {
    $pdo = new PDO(
        "mysql:host=$host;dbname=$db;charset=utf8mb4",
        $user,
        $pass,
        [
            PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
            PDO::ATTR_EMULATE_PREPARES => false,
        ]
    );
} catch (PDOException $e) {
    error_log('DogBuddy DB: ' . $e->getMessage());
    http_response_code(500);
    die('Ошибка подключения к базе данных');
}
