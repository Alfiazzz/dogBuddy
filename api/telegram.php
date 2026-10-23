<?php

require_once __DIR__ . '/config.php';

function sendTelegramMessage($tgId, $text) {
    $tgId = (int) $tgId;
    $text = trim((string) $text);
    if ($tgId < 1 || $text === '' || !defined('BOT_TOKEN') || BOT_TOKEN === '') {
        error_log('DogBuddy telegram: не задан получатель или токен.');
        return false;
    }

    $url = 'https://api.telegram.org/bot' . BOT_TOKEN . '/sendMessage';
    $payload = http_build_query([
        'chat_id' => $tgId,
        'text' => $text,
    ]);

    try {
        if (function_exists('curl_init')) {
            $ch = curl_init($url);
            if ($ch === false) {
                error_log('DogBuddy telegram: не удалось открыть curl.');
                return false;
            }
            curl_setopt($ch, CURLOPT_POST, true);
            curl_setopt($ch, CURLOPT_POSTFIELDS, $payload);
            curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
            curl_setopt($ch, CURLOPT_CONNECTTIMEOUT, 5);
            curl_setopt($ch, CURLOPT_TIMEOUT, 8);
            $result = curl_exec($ch);
            $errno = curl_errno($ch);
            curl_close($ch);
            if ($result === false || $errno) {
                error_log('DogBuddy telegram curl: ' . $errno);
                return false;
            }
        } else {
            $context = stream_context_create([
                'http' => [
                    'method' => 'POST',
                    'header' => "Content-Type: application/x-www-form-urlencoded\r\n",
                    'content' => $payload,
                    'timeout' => 8,
                ],
            ]);
            $result = @file_get_contents($url, false, $context);
            if ($result === false) {
                error_log('DogBuddy telegram: запрос не выполнен.');
                return false;
            }
        }

        $data = json_decode($result, true);
        if (!is_array($data) || empty($data['ok'])) {
            error_log('DogBuddy telegram: Telegram не принял сообщение.');
            return false;
        }
        return true;
    } catch (Exception $e) {
        error_log('DogBuddy telegram: ' . $e->getMessage());
        return false;
    }
}
