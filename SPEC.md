# DogBuddy — SDD Specification (Простой стек)

> **Telegram Mini App для поиска друзей для прогулок с собаками**
> 
> Версия: 2.0 | Статус: MVP | Дата: 2025
> Стек: HTML + PHP + MySQL (для обычного хостинга)

---

## 1. Overview

**Продукт:** DogBuddy — веб-приложение в формате Telegram Mini App, где владельцы собак находят "бадди" для совместных прогулок в своём районе.

**Core Loop (главный цикл пользователя):**
```
Регистрация пса → Лента собак рядом → Лайк → Мэтч → Чат → 
Назначить прогулку → Напоминание → Прогулка → Отзыв и рейтинг → 
Пёс в списке друзей → Повторная прогулка
```

**North Star Metric:** количество подтверждённых прогулок на активную собаку в неделю.

**Целевая аудитория:** владельцы собак в крупных городах РФ, 18-45 лет, активные пользователи Telegram.

**MVP-гипотеза:** владельцы собак готовы использовать Telegram Mini App (без установки отдельного приложения) для поиска компании для прогулок, если видят собак в радиусе 1-3 км с оценкой совместимости.

---

## 2. Tech Stack & Constraints

### Жёсткие ограничения:
- **Бюджет:** ~200-300 ₽/мес за хостинг (или бесплатно на старте через бесплатные тарифы)
- **Формат:** Telegram Mini App (Web App), открывается внутри Telegram
- **Геолокация:** только в РФ, карты должны работать стабильно
- **152-ФЗ:** минимизация персональных данных (только tg_id + данные собак)
- **Простота:** никакой сложной настройки, работает на обычном хостинге

### Утверждённый стек:

| Слой | Технология | Обоснование |
|------|-----------|-------------|
| **Фронтенд** | HTML5 + CSS3 + JavaScript (vanilla) | Работает на любом хостинге, не требует сборки |
| **Стили** | Tailwind CSS через CDN | Быстрая стилизация без npm |
| **Бэкенд** | PHP 7.4+ | Есть на любом хостинге из коробки |
| **База данных** | MySQL / MariaDB | Есть на любом хостинге, создаётся в панели управления |
| **Хостинг** | Timeweb / Reg.ru / Beget (shared hosting) | ~200-300 ₽/мес, PHP + MySQL + HTTPS из коробки |
| **Карты** | Leaflet + MapTiler (Free, 100k/мес) | Бесплатно, работает в РФ |
| **Фото** | Cloudinary (Free, 25 кредитов) | Авто-сжатие, CDN, простая загрузка |
| **Telegram-бот** | Python + aiogram 3.x на Render.com (Free) | Уведомления, напоминания (отдельно от сайта) |
| **Аналитика** | Яндекс.Метрика | Бесплатно, работает в РФ |

### Что НЕ используем и почему:
- ❌ **React, Vite, Node.js** — требуют настройки, npm, сборки
- ❌ **PostgreSQL, Neon** — не на всех хостингах есть
- ❌ **Serverless функции** — сложно для новичка
- ❌ **Яндекс.Карты JS API** — лимит 500 запросов/сутки
- ❌ **Нативное мобильное приложение** — дорого, долго

---

## 3. Структура проекта

```
dogbuddy/
├── index.html              # Главная страница (лента собак)
├── chat.html               # Страница чата
├── profile.html            # Профиль собаки
├── walk.html               # Создание прогулки
├── style.css               # Все стили
├── app.js                  # Вся логика фронтенда
├── api/
│   ├── config.php          # Подключение к БД
│   ├── auth.php            # Регистрация/логин через Telegram
│   ├── dogs.php            # CRUD собак
│   ├── likes.php           # Лайки и мэтчи
│   ├── chats.php           # Чаты и сообщения
│   ├── walks.php           # Прогулки
│   └── reviews.php         # Отзывы
├── uploads/                # Папка для фото (если не используем Cloudinary)
└── .htaccess               # Настройки Apache (редиректы, безопасность)
```

---

## 4. База данных (MySQL)

### 4.1 Схема базы данных

```sql
-- Таблица пользователей (владельцев)
CREATE TABLE users (
    id INT PRIMARY KEY AUTO_INCREMENT,
    tg_id BIGINT UNIQUE NOT NULL,
    username VARCHAR(100),
    first_name VARCHAR(100),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_active_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- Таблица собак
CREATE TABLE dogs (
    id INT PRIMARY KEY AUTO_INCREMENT,
    user_id INT NOT NULL,
    name VARCHAR(100) NOT NULL,
    breed VARCHAR(100),
    sex ENUM('male', 'female'),
    birth_date DATE,
    weight_kg DECIMAL(5,2),
    activity TINYINT CHECK (activity BETWEEN 1 AND 5),
    temperament VARCHAR(255), -- теги через запятую: "игривый,дружелюбный"
    vaccinated BOOLEAN DEFAULT FALSE,
    photo_url TEXT,
    bio TEXT,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Геолокация
CREATE TABLE geo (
    dog_id INT PRIMARY KEY,
    home_lat DECIMAL(10, 7) NOT NULL,
    home_lon DECIMAL(10, 7) NOT NULL,
    radius_m INT DEFAULT 3000,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (dog_id) REFERENCES dogs(id) ON DELETE CASCADE
);

-- Лайки
CREATE TABLE likes (
    id INT PRIMARY KEY AUTO_INCREMENT,
    from_dog_id INT NOT NULL,
    to_dog_id INT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY unique_like (from_dog_id, to_dog_id),
    FOREIGN KEY (from_dog_id) REFERENCES dogs(id) ON DELETE CASCADE,
    FOREIGN KEY (to_dog_id) REFERENCES dogs(id) ON DELETE CASCADE
);

-- Мэтчи
CREATE TABLE matches (
    id INT PRIMARY KEY AUTO_INCREMENT,
    dog_a_id INT NOT NULL,
    dog_b_id INT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY unique_match (dog_a_id, dog_b_id),
    FOREIGN KEY (dog_a_id) REFERENCES dogs(id) ON DELETE CASCADE,
    FOREIGN KEY (dog_b_id) REFERENCES dogs(id) ON DELETE CASCADE
);

-- Чаты
CREATE TABLE chats (
    id INT PRIMARY KEY AUTO_INCREMENT,
    match_id INT UNIQUE NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (match_id) REFERENCES matches(id) ON DELETE CASCADE
);

-- Сообщения
CREATE TABLE messages (
    id INT PRIMARY KEY AUTO_INCREMENT,
    chat_id INT NOT NULL,
    sender_dog_id INT NOT NULL,
    text TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    read_at TIMESTAMP NULL,
    FOREIGN KEY (chat_id) REFERENCES chats(id) ON DELETE CASCADE,
    FOREIGN KEY (sender_dog_id) REFERENCES dogs(id) ON DELETE CASCADE
);

-- Прогулки
CREATE TABLE walks (
    id INT PRIMARY KEY AUTO_INCREMENT,
    match_id INT NOT NULL,
    proposer_id INT NOT NULL,
    place VARCHAR(255) NOT NULL,
    lat DECIMAL(10, 7),
    lon DECIMAL(10, 7),
    scheduled_at DATETIME NOT NULL,
    status ENUM('proposed', 'confirmed', 'done', 'cancelled') DEFAULT 'proposed',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (match_id) REFERENCES matches(id) ON DELETE CASCADE,
    FOREIGN KEY (proposer_id) REFERENCES dogs(id) ON DELETE CASCADE
);

-- Отзывы
CREATE TABLE reviews (
    id INT PRIMARY KEY AUTO_INCREMENT,
    walk_id INT NOT NULL,
    about_dog_id INT NOT NULL,
    rating TINYINT CHECK (rating BETWEEN 1 AND 5),
    text TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY unique_review (walk_id, about_dog_id),
    FOREIGN KEY (walk_id) REFERENCES walks(id) ON DELETE CASCADE,
    FOREIGN KEY (about_dog_id) REFERENCES dogs(id) ON DELETE CASCADE
);

-- Блокировки
CREATE TABLE blocks (
    id INT PRIMARY KEY AUTO_INCREMENT,
    reporter_dog_id INT NOT NULL,
    blocked_dog_id INT NOT NULL,
    reason TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY unique_block (reporter_dog_id, blocked_dog_id),
    FOREIGN KEY (reporter_dog_id) REFERENCES dogs(id) ON DELETE CASCADE,
    FOREIGN KEY (blocked_dog_id) REFERENCES dogs(id) ON DELETE CASCADE
);

-- Индексы для производительности
CREATE INDEX idx_geo_coords ON geo(home_lat, home_lon);
CREATE INDEX idx_dogs_user ON dogs(user_id);
CREATE INDEX idx_likes_from ON likes(from_dog_id);
CREATE INDEX idx_messages_chat ON messages(chat_id);
```

### 4.2 Ключевые SQL-запросы

**Поиск собак в радиусе (формула Haversine для MySQL):**
```sql
SELECT d.*, 
       (6371000 * acos(
           cos(radians(:user_lat)) * cos(radians(g.home_lat)) * 
           cos(radians(g.home_lon) - radians(:user_lon)) + 
           sin(radians(:user_lat)) * sin(radians(g.home_lat))
       )) AS distance_m
FROM dogs d
JOIN geo g ON d.id = g.dog_id
WHERE d.id != :current_dog_id
  AND d.is_active = TRUE
  AND (6371000 * acos(
      cos(radians(:user_lat)) * cos(radians(g.home_lat)) * 
      cos(radians(g.home_lon) - radians(:user_lon)) + 
      sin(radians(:user_lat)) * sin(radians(g.home_lat))
  )) <= :radius_m
  AND d.id NOT IN (SELECT to_dog_id FROM likes WHERE from_dog_id = :current_dog_id)
  AND d.id NOT IN (SELECT blocked_dog_id FROM blocks WHERE reporter_dog_id = :current_dog_id)
ORDER BY distance_m
LIMIT 20;
```

---

## 5. Matching Algorithm (Совместимость собак)

Формула скоринга от 0 до 100%. Чистая математика, без ML.

```php
function calculateCompatibility($dog_a, $dog_b) {
    $score = 50; // базовый скор
    
    // Активность (разница <= 1 по шкале 1-5)
    if (abs($dog_a['activity'] - $dog_b['activity']) <= 1) {
        $score += 15;
    }
    
    // Прививки (бейдж доверия)
    if ($dog_a['vaccinated'] && $dog_b['vaccinated']) {
        $score += 10;
    }
    
    // Возрастные группы
    $age_group_a = getAgeGroup($dog_a['birth_date']);
    $age_group_b = getAgeGroup($dog_b['birth_date']);
    if ($age_group_a == $age_group_b || areAdjacentGroups($age_group_a, $age_group_b)) {
        $score += 10;
    }
    
    // Общие теги темперамента (+5 за каждый)
    $tags_a = explode(',', $dog_a['temperament']);
    $tags_b = explode(',', $dog_b['temperament']);
    $common_tags = array_intersect($tags_a, $tags_b);
    $score += 5 * count($common_tags);
    
    // Штрафы за разницу в весе
    $weight_ratio = max($dog_a['weight_kg'], $dog_b['weight_kg']) / min($dog_a['weight_kg'], $dog_b['weight_kg']);
    if ($weight_ratio > 4) {
        $score -= 40; // опасно
    } elseif ($weight_ratio > 2.5) {
        $score -= 20;
    }
    
    return max(0, min(100, $score));
}

function getAgeGroup($birth_date) {
    $age_years = (time() - strtotime($birth_date)) / (365.25 * 24 * 3600);
    if ($age_years < 1) return 'puppy';
    if ($age_years < 7) return 'adult';
    return 'senior';
}
```

**Правило блокировки:** если `weight_ratio > 4`, показывается предупреждение.

---

## 6. API Design (PHP)

Все эндпоинты — PHP файлы в папке `api/`. Аутентификация через Telegram `initData`.

### 6.1 Аутентификация

```php
// api/auth.php
// Проверка Telegram initData (HMAC-SHA256)
function verifyTelegramAuth($initData) {
    // Валидация подписи от Telegram
    // Возвращает tg_id или false
}
```

### 6.2 Эндпоинты

| Метод | Файл | Описание | Параметры | Ответ |
|-------|------|----------|-----------|-------|
| POST | `api/auth.php` | Регистрация/логин | `initData` | `{user_id, dogs[]}` |
| GET | `api/dogs.php?action=me` | Мои собаки | — | `{dogs[]}` |
| POST | `api/dogs.php` | Создать собаку | `name, breed, weight_kg, activity, temperament, vaccinated, photo_url` | `{dog}` |
| POST | `api/dogs.php?action=geo` | Обновить геолокацию | `dog_id, lat, lon, radius_m` | `{ok: true}` |
| GET | `api/dogs.php?action=nearby` | Собаки рядом | `lat, lon, radius` | `{dogs: [{...dog, distance_m, compatibility}]}` |
| POST | `api/likes.php` | Лайкнуть собаку | `from_dog_id, to_dog_id` | `{match?: {chat_id}}` |
| GET | `api/chats.php?action=messages` | История чата | `chat_id, limit, offset` | `{messages[]}` |
| POST | `api/chats.php` | Отправить сообщение | `chat_id, sender_dog_id, text` | `{message}` |
| POST | `api/walks.php` | Предложить прогулку | `match_id, proposer_id, place, lat, lon, scheduled_at` | `{walk}` |
| POST | `api/reviews.php` | Оставить отзыв | `walk_id, about_dog_id, rating, text` | `{review}` |

### 6.3 Формат ответа

```json
// Успех
{
  "ok": true,
  "data": { ... }
}

// Ошибка
{
  "ok": false,
  "error": {
    "code": "DOG_NOT_FOUND",
    "message": "Собака не найдена"
  }
}
```

---

## 7. Telegram Bot Integration

Бот на **aiogram 3.x** (Python), хостится на **Render.com Free tier** (отдельно от сайта).

### 7.1 Команды бота

| Команда | Описание |
|---------|----------|
| `/start` | Приветствие + кнопка "Открыть приложение" (Web App) |
| `/profile` | Краткая сводка: мэтчи, прогулки, рейтинг |
| `/settings` | Настройки уведомлений |

### 7.2 Автоматические уведомления

| Событие | Текст уведомления |
|---------|-------------------|
| Новый мэтч | "🎉 У вас новый мэтч! [Имя пса] и [Имя пса] понравились друг другу!" |
| Предложение прогулки | "[Имя] приглашает на прогулку: [место], [время]" |
| Напоминание за 1 час | "⏰ Через час прогулка с [Имя] в [место]" |
| Напоминание за 15 мин | "🚶 Через 15 минут встреча!" |

---

## 8. Frontend Architecture

### 8.1 Структура экранов

1. **index.html** — Главная (лента собак + карта)
2. **chat.html** — Чат с мэтчем
3. **profile.html** — Профиль собаки
4. **walk.html** — Создание прогулки

### 8.2 Интеграция с Telegram Web App SDK

```html
<!-- В каждом HTML файле -->
<script src="https://telegram.org/js/telegram-web-app.js"></script>
<script>
  // Инициализация
  window.Telegram.WebApp.ready();
  window.Telegram.WebApp.expand();
  
  // Получаем данные пользователя
  const user = window.Telegram.WebApp.initDataUnsafe.user;
  // user.id, user.username, user.first_name
</script>
```

### 8.3 Карты (Leaflet + MapTiler)

```html
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>

<div id="map" style="height: 400px;"></div>
<script>
  const map = L.map('map').setView([55.7558, 37.6173], 13);
  L.tileLayer('https://api.maptiler.com/maps/streets/{z}/{x}/{y}.png?key=MAPTILER_KEY', {
    attribution: '© MapTiler © OpenStreetMap'
  }).addTo(map);
</script>
```

---

## 9. Edge Cases & Security

### 9.1 Критические сценарии

| Сценарий | Обработка |
|----------|-----------|
| **Холодный старт** | Показывать собак из расширенного радиуса (до 10 км) |
| **Опасный мэтч** | Предупреждение + чекбокс "Я контролирую встречу" |
| **Спам в чате** | Чат только после мэтча; кнопка "Пожаловаться" |
| **Потеря геолокации** | Fallback на ввод адреса вручную |

### 9.2 Безопасность

1. **Аутентификация:** через Telegram `initData` (HMAC-SHA256)
2. **Валидация:** все входные данные проверяются в PHP (filter_var, prepared statements)
3. **SQL-инъекции:** только prepared statements (PDO)
4. **XSS:** htmlspecialchars() при выводе данных
5. **152-ФЗ:** не собираем телефоны, email; чекбокс согласия с политикой

---

## 10. Roadmap (4 недели по вечерам)

### Неделя 1 — Скелет
- [ ] Купить хостинг (Timeweb/Reg.ru)
- [ ] Создать базу данных MySQL в панели хостинга
- [ ] Применить SQL-схему из раздела 4
- [ ] Создать index.html + style.css + app.js
- [ ] Подключить Telegram Web App SDK
- [ ] Экран регистрации собаки

### Неделя 2 — Социалка
- [ ] API для собак (api/dogs.php)
- [ ] Геолокация + поиск собак рядом
- [ ] Карточки собак + скоринг совместимости
- [ ] Лайки + мэтчи (api/likes.php)

### Неделя 3 — Прогулки
- [ ] Чат (api/chats.php + chat.html)
- [ ] Создание прогулки (api/walks.php + walk.html)
- [ ] Настроить бота на Render.com
- [ ] Напоминания от бота

### Неделя 4 — Запуск
- [ ] Отзывы (api/reviews.php)
- [ ] Блокировки
- [ ] Посев: 10-15 собак друзей
- [ ] Запуск в районных чатах

---

## 11. Деплой (как залить на хостинг)

### Шаг 1: Покупка хостинга
- Timeweb / Reg.ru / Beget: ~200-300 ₽/мес
- Обязательно: PHP 7.4+, MySQL, HTTPS (Let's Encrypt)

### Шаг 2: Создание базы данных
- В панели хостинга: "Базы данных" → "Создать БД"
- Скопировать: имя БД, пользователь, пароль, хост

### Шаг 3: Загрузка файлов
- Через FTP (FileZilla) или файловый менеджер в панели хостинга
- Загрузить все файлы в папку `public_html/` или `www/`

### Шаг 4: Настройка config.php
```php
<?php
// api/config.php
$host = 'localhost';
$db = 'имя_бд';
$user = 'пользователь';
$pass = 'пароль';

try {
    $pdo = new PDO("mysql:host=$host;dbname=$db;charset=utf8", $user, $pass);
    $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
} catch (PDOException $e) {
    die("Ошибка подключения: " . $e->getMessage());
}
?>
```

### Шаг 5: Подключение домена к Telegram
- В @BotFather: `/newapp` → указать URL твоего сайта (https://твой-домен.ru/index.html)

---

## 12. Метрики успеха MVP

| Метрика | Цель через 1 месяц |
|---------|---------------------|
| Зарегистрированных собак | 100+ |
| Активных пользователей в неделю | 30+ |
| Мэтчей в неделю | 20+ |
| Подтверждённых прогулок в неделю | 10+ |

---

## 13. Контакты и ссылки

- **Telegram бот:** @dogbuddy_bot (пример)
- **Документация Telegram Mini App:** https://core.telegram.org/bots/webapps
- **Документация MapTiler:** https://docs.maptiler.com
- **Документация Leaflet:** https://leafletjs.com/reference.html
