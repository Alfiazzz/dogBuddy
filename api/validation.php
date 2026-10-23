<?php

function validationStop($check) {
    if (!empty($check['ok'])) {
        return;
    }
    http_response_code(400);
    echo json_encode([
        'ok' => false,
        'error' => isset($check['error']) ? $check['error'] : 'Проверьте введённые данные.',
    ], JSON_UNESCAPED_UNICODE);
    exit;
}

function validateName($name) {
    return validateLetters(
        $name,
        2,
        30,
        'Имя должно содержать минимум 2 символа.',
        'Имя не длиннее 30 символов.',
        'В имени можно использовать только буквы, пробелы и дефисы.'
    );
}

function validateBreed($breed) {
    return validateLetters(
        $breed,
        2,
        50,
        'Порода должна содержать минимум 2 символа.',
        'Порода не длиннее 50 символов.',
        'В породе можно использовать только буквы, пробелы и дефисы.'
    );
}

function validateWeight($weight) {
    if (is_bool($weight) || is_array($weight) || $weight === null || $weight === '' || !is_numeric($weight)) {
        return validationError('Вес должен быть числом от 0.5 до 150 кг.');
    }
    $number = (float) $weight;
    if ($number < 0.5 || $number > 150) {
        return validationError('Вес должен быть числом от 0.5 до 150 кг.');
    }
    return validationOk($number);
}

function validateActivity($activity) {
    $number = strictWholeNumber($activity);
    if ($number === null || $number < 1 || $number > 5) {
        return validationError('Выберите активность от 1 до 5.');
    }
    return validationOk($number);
}

function validateVaccinated($vaccinated) {
    $number = strictWholeNumber($vaccinated);
    if ($number === null || ($number !== 0 && $number !== 1)) {
        return validationError('Отметьте, привита ли собака.');
    }
    return validationOk($number);
}

function validateCoords($lat, $lon) {
    if ($lat === null || $lat === '' || $lon === null || $lon === '') {
        return validationError('Укажите местоположение: широту и долготу.');
    }
    if (!is_numeric($lat) || (float) $lat < -90 || (float) $lat > 90) {
        return validationError('Широта должна быть числом от -90 до 90.');
    }
    if (!is_numeric($lon) || (float) $lon < -180 || (float) $lon > 180) {
        return validationError('Долгота должна быть числом от -180 до 180.');
    }
    return validationOk([
        'lat' => (float) $lat,
        'lon' => (float) $lon,
    ]);
}

function validateRadius($radius) {
    $number = strictWholeNumber($radius);
    if ($number === null || $number < 500 || $number > 50000) {
        return validationError('Радиус поиска — от 500 до 50000 метров.');
    }
    return validationOk($number);
}

function validatePhotoUrl($url) {
    $placeholder = 'https://via.placeholder.com/300x300?text=No+Photo';
    $url = trim((string) $url);
    if ($url === '') {
        return validationOk($placeholder);
    }
    if (validationTextLength($url) > 500) {
        return validationError('Ссылка на фото слишком длинная. Загрузите фото ещё раз.');
    }
    $cloud = strpos($url, 'https://res.cloudinary.com/') === 0;
    $stub = strpos($url, 'https://via.placeholder.com/') === 0;
    if (!$cloud && !$stub) {
        return validationError('Загрузите фото ещё раз. Подойдёт только фото из облака DogBuddy.');
    }
    return validationOk($url);
}

function validateMessage($text) {
    $raw = (string) $text;
    $value = trim($raw);
    if ($value === '') {
        if (trim($raw) === '' && $raw !== '') {
            return validationError('Сообщение не может состоять только из пробелов.');
        }
        return validationError('Введите текст сообщения.');
    }
    if (validationTextLength($value) > 1000) {
        return validationError('Сообщение не длиннее 1000 символов.');
    }
    return validationOk(htmlspecialchars($value, ENT_QUOTES, 'UTF-8'));
}

function validatePlace($place) {
    $value = trim((string) $place);
    $length = validationTextLength($value);
    if ($length < 3) {
        return validationError('Место встречи — минимум 3 символа.');
    }
    if ($length > 100) {
        return validationError('Место встречи не длиннее 100 символов.');
    }
    if (preg_match('/^[\p{L}\d\s,\-]+$/u', $value) !== 1) {
        return validationError('В месте встречи можно использовать буквы, цифры, пробелы, запятые и дефисы.');
    }
    return validationOk($value);
}

function validateScheduledAt($datetime) {
    $value = trim(str_replace('T', ' ', (string) $datetime));
    if (preg_match('/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/', $value) === 1) {
        $value .= ':00';
    }
    if (preg_match('/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/', $value) !== 1) {
        return validationError('Укажите дату и время прогулки.');
    }
    $zone = new DateTimeZone('Europe/Moscow');
    $date = DateTime::createFromFormat('Y-m-d H:i:s', $value, $zone);
    if (!$date || $date->format('Y-m-d H:i:s') !== $value) {
        return validationError('Укажите дату и время прогулки.');
    }
    $now = new DateTime('now', $zone);
    if ($date <= $now) {
        return validationError('Дата прогулки должна быть в будущем.');
    }
    $min = clone $now;
    $min->modify('+15 minutes');
    if ($date < $min) {
        return validationError('Прогулку можно назначить минимум через 15 минут.');
    }
    return validationOk($value);
}

function validateStatus($status) {
    $allowed = ['proposed', 'confirmed', 'cancelled', 'done'];
    if (!in_array((string) $status, $allowed, true)) {
        return validationError('Такой статус прогулки выбрать нельзя.');
    }
    return validationOk((string) $status);
}

function validateRating($rating) {
    $number = strictWholeNumber($rating);
    if ($number === null || $number < 1 || $number > 5) {
        return validationError('Поставьте оценку от 1 до 5.');
    }
    return validationOk($number);
}

function validateReviewText($text) {
    $raw = (string) $text;
    $value = trim($raw);
    if ($value === '' && $raw !== '') {
        return validationError('Отзыв не может состоять только из пробелов.');
    }
    $length = validationTextLength($value);
    if ($length < 10) {
        return validationError('Отзыв должен содержать минимум 10 символов.');
    }
    if ($length > 1000) {
        return validationError('Отзыв не длиннее 1000 символов.');
    }
    return validationOk(htmlspecialchars($value, ENT_QUOTES, 'UTF-8'));
}

function validateId($id) {
    $number = strictWholeNumber($id);
    if ($number === null || $number < 1) {
        return validationError('Не удалось определить запись. Обновите страницу и попробуйте ещё раз.');
    }
    return validationOk($number);
}

function validateLetters($value, $min, $max, $shortMessage, $longMessage, $charsMessage) {
    $value = trim((string) $value);
    $length = validationTextLength($value);
    if ($length < $min) {
        return validationError($shortMessage);
    }
    if ($length > $max) {
        return validationError($longMessage);
    }
    if (preg_match('/^[\p{L}\s\-]+$/u', $value) !== 1) {
        return validationError($charsMessage);
    }
    return validationOk($value);
}

function strictWholeNumber($value) {
    if (is_bool($value) || is_array($value) || $value === null || $value === '') {
        return null;
    }
    if (is_int($value)) {
        return $value;
    }
    if (is_string($value) && preg_match('/^-?[0-9]+$/', $value) === 1) {
        return (int) $value;
    }
    return null;
}

function validationTextLength($value) {
    if (function_exists('mb_strlen')) {
        return mb_strlen((string) $value, 'UTF-8');
    }
    return strlen((string) $value);
}

function validationOk($value) {
    return [
        'ok' => true,
        'value' => $value,
    ];
}

function validationError($message) {
    return [
        'ok' => false,
        'error' => $message,
    ];
}
