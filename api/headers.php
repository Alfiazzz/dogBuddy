<?php

function sendSecurityHeaders() {
    header('X-Content-Type-Options: nosniff');
    header('Content-Type: application/json; charset=utf-8');

    $allowed = 'https://pereskazka-ai.ru';
    $origin = isset($_SERVER['HTTP_ORIGIN']) ? (string) $_SERVER['HTTP_ORIGIN'] : '';
    if ($origin === $allowed) {
        header('Access-Control-Allow-Origin: ' . $allowed);
        header('Vary: Origin');
        header('Access-Control-Allow-Methods: GET, POST, PATCH, OPTIONS');
        header('Access-Control-Allow-Headers: Content-Type');
        header('Access-Control-Max-Age: 86400');
    }
}
