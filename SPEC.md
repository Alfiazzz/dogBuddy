# DogBuddy — SDD Specification

> **Telegram Mini App для поиска друзей для прогулок с собаками**
> 
> Версия: 1.0 | Статус: MVP | Дата: 2025

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

### Жёсткие ограничения (нельзя нарушать):
- **Бюджет:** 0 ₽ на этапе MVP
- **Формат:** Telegram Mini App (Web App), открывается внутри Telegram
- **Геолокация:** только в РФ, карты должны работать стабильно
- **152-ФЗ:** минимизация персональных данных (только tg_id + данные собак)

### Утверждённый стек:

| Слой | Технология | Обоснование |
|------|-----------|-------------|
| **Фронтенд** | React 18 + Vite + TypeScript | Быстрый, лёгкий, идеален для TMA |
| **UI** | Tailwind CSS + @telegram-apps/sdk-react | Нативный вид внутри Telegram |
| **Хостинг фронтенда** | Cloudflare Pages (Free) | Бесплатный `.pages.dev`, HTTPS, CDN в РФ |
| **БД** | PostgreSQL 16 + PostGIS (Neon.tech Free) | Геозапросы, бесплатно до 0.5 ГБ |
| **API** | Neon Functions (TypeScript/Node.js) | Serverless рядом с БД, бесплатно |
| **Фото** | Cloudinary (Free, 25 кредитов) | Авто-сжатие, CDN, готовый React-виджет |
| **Карты** | Leaflet + MapTiler (Free, 100k/мес) | Бесплатно, без лимитов-ловушек, работает в РФ |
| **Telegram-бот** | Python + aiogram 3.x (Render.com Free) | Уведомления, напоминания, фоновые задачи |
| **Аналитика** | Яндекс.Метрика | Бесплатно, работает в РФ |

### Что НЕ используем и почему:
-  **Яндекс.Карты JS API** — лимит 500 запросов/сутки, фатально для MVP
- ❌ **Прямые тайлы OSM** — риск блокировки IP за нагрузку
- ❌ **Supabase** — избыточен, данные в ЕС (152-ФЗ риск)
- ❌ **Vercel/Netlify** — возможны замедления в РФ
- ❌ **Нативное мобильное приложение** — дорого, долго, не нужно для проверки гипотезы

---

## 3. Data Model (PostgreSQL + PostGIS)

### 3.1 Схема базы данных

```sql
-- Включить расширение PostGIS для геозапросов
CREATE EXTENSION IF NOT EXISTS postgis;

-- Пользователи (владельцы)
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tg_id BIGINT UNIQUE NOT NULL,
    username VARCHAR(100),
    first_name VARCHAR(100),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    last_active_at TIMESTAMPTZ DEFAULT NOW()
);

-- Собаки (профили питомцев)
CREATE TABLE dogs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL,
    breed VARCHAR(100),
    sex VARCHAR(10) CHECK (sex IN ('male', 'female')),
    birth_date DATE,
    weight_kg DECIMAL(5,2) CHECK (weight_kg > 0 AND weight_kg < 200),
    activity SMALLINT CHECK (activity BETWEEN 1 AND 5),
    temperament TEXT[],
    vaccinated BOOLEAN DEFAULT FALSE,
    photo_url TEXT,
    bio TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    is_active BOOLEAN DEFAULT TRUE
);

-- Геолокация (домашняя точка + радиус поиска)
CREATE TABLE geo (
    dog_id UUID PRIMARY KEY REFERENCES dogs(id) ON DELETE CASCADE,
    home_lat DECIMAL(10, 7) NOT NULL CHECK (home_lat BETWEEN -90 AND 90),
    home_lon DECIMAL(10, 7) NOT NULL CHECK (home_lon BETWEEN -180 AND 180),
    home_point GEOMETRY(POINT, 4326),
    radius_m INTEGER DEFAULT 3000 CHECK (radius_m BETWEEN 500 AND 10000),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_geo_home_point ON geo USING GIST (home_point);

-- Лайки (свайпы)
CREATE TABLE likes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    from_dog_id UUID NOT NULL REFERENCES dogs(id) ON DELETE CASCADE,
    to_dog_id UUID NOT NULL REFERENCES dogs(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(from_dog_id, to_dog_id)
);

-- Мэтчи (взаимные лайки)
CREATE TABLE matches (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    dog_a_id UUID NOT NULL REFERENCES dogs(id) ON DELETE CASCADE,
    dog_b_id UUID NOT NULL REFERENCES dogs(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(dog_a_id, dog_b_id),
    CHECK (dog_a_id < dog_b_id)
);

-- Чаты (привязаны к мэтчу)
CREATE TABLE chats (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    match_id UUID UNIQUE NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Сообщения в чате
CREATE TABLE messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    chat_id UUID NOT NULL REFERENCES chats(id) ON DELETE CASCADE,
    sender_dog_id UUID NOT NULL REFERENCES dogs(id) ON DELETE CASCADE,
    text TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    read_at TIMESTAMPTZ
);

-- Прогулки
CREATE TABLE walks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    match_id UUID NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
    proposer_id UUID NOT NULL REFERENCES dogs(id) ON DELETE CASCADE,
    place VARCHAR(255) NOT NULL,
    lat DECIMAL(10, 7),
    lon DECIMAL(10, 7),
    scheduled_at TIMESTAMPTZ NOT NULL,
    status VARCHAR(20) DEFAULT 'proposed' 
        CHECK (status IN ('proposed', 'confirmed', 'done', 'cancelled')),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Отзывы после прогулки
CREATE TABLE reviews (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    walk_id UUID NOT NULL REFERENCES walks(id) ON DELETE CASCADE,
    about_dog_id UUID NOT NULL REFERENCES dogs(id) ON DELETE CASCADE,
    rating SMALLINT NOT NULL CHECK (rating BETWEEN 1 AND 5),
    text TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(walk_id, about_dog_id)
);

-- Блокировки и жалобы
CREATE TABLE blocks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    reporter_dog_id UUID NOT NULL REFERENCES dogs(id) ON DELETE CASCADE,
    blocked_dog_id UUID NOT NULL REFERENCES dogs(id) ON DELETE CASCADE,
    reason TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(reporter_dog_id, blocked_dog_id)
);
```

### 3.2 Ключевые SQL-запросы

**Поиск собак в радиусе (PostGIS):**
```sql
SELECT d.*, 
       ST_Distance(g.home_point, ST_MakePoint($user_lon, $user_lat)::geography) AS distance_m
FROM dogs d
JOIN geo g ON d.id = g.dog_id
WHERE d.id != $current_dog_id
  AND d.is_active = TRUE
  AND ST_DWithin(
      g.home_point::geography,
      ST_MakePoint($user_lon, $user_lat)::geography,
      $radius_m
  )
  AND d.id NOT IN (SELECT to_dog_id FROM likes WHERE from_dog_id = $current_dog_id)
  AND d.id NOT IN (SELECT blocked_dog_id FROM blocks WHERE reporter_dog_id = $current_dog_id)
ORDER BY distance_m
LIMIT 20;
```

---

## 4. Matching Algorithm (Совместимость собак)

Формула скоринга от 0 до 100%. Чистая математика, без ML.

```python
def calculate_compatibility(dog_a, dog_b):
    score = 50  # базовый скор
    
    # Активность (разница <= 1 по шкале 1-5)
    if abs(dog_a['activity'] - dog_b['activity']) <= 1:
        score += 15
    
    # Прививки (бейдж доверия)
    if dog_a['vaccinated'] and dog_b['vaccinated']:
        score += 10
    
    # Возрастные группы совпадают или соседние
    age_group_a = get_age_group(dog_a['birth_date'])  # puppy/adult/senior
    age_group_b = get_age_group(dog_b['birth_date'])
    if age_group_a == age_group_b or are_adjacent_groups(age_group_a, age_group_b):
        score += 10
    
    # Общие теги темперамента (+5 за каждый)
    common_tags = set(dog_a['temperament']) & set(dog_b['temperament'])
    score += 5 * len(common_tags)
    
    # Штрафы за разницу в весе
    weight_ratio = max(dog_a['weight_kg'], dog_b['weight_kg']) / min(dog_a['weight_kg'], dog_b['weight_kg'])
    if weight_ratio > 4:
        score -= 40  # опасно (овчарка + чихуахуа)
    elif weight_ratio > 2.5:
        score -= 20
    
    return max(0, min(100, score))  # ограничить 0-100
```

**Правило блокировки:** если `weight_ratio > 4`, мэтч технически возможен, но показывается предупреждение: *"Размер собак сильно отличается. Пожалуйста, контролируйте встречу."*

---

## 5. API Design (Neon Functions)

Все эндпоинты — TypeScript/Node.js функции на Neon. Аутентификация через Telegram `initData`.

### 5.1 Аутентификация

```typescript
// Middleware: проверка Telegram initData
function verifyTelegramAuth(initData: string): { tg_id: number, username?: string } {
    // Валидация HMAC-SHA256 подписи от Telegram
    // Возвращает tg_id или выбрасывает 401
}
```

### 5.2 Эндпоинты

| Метод | Путь | Описание | Request Body | Response |
|-------|------|----------|--------------|----------|
| POST | `/auth/register` | Регистрация/логин через Telegram | `{ initData }` | `{ user_id, dogs[] }` |
| GET | `/dogs/me` | Мои собаки | — | `{ dogs[] }` |
| POST | `/dogs` | Создать профиль собаки | `{ name, breed, weight_kg, activity, temperament[], vaccinated, photo_url }` | `{ dog }` |
| PATCH | `/dogs/:id` | Обновить профиль | `{ ...fields }` | `{ dog }` |
| POST | `/dogs/:id/geo` | Обновить геолокацию | `{ lat, lon, radius_m }` | `{ ok: true }` |
| GET | `/dogs/nearby` | Собаки рядом + скоринг | `?lat=&lon=&radius=` | `{ dogs: [{...dog, distance_m, compatibility}] }` |
| POST | `/likes` | Лайкнуть собаку | `{ to_dog_id }` | `{ match?: { chat_id } }` |
| GET | `/matches` | Мои мэтчи | — | `{ matches[] }` |
| GET | `/chats/:id/messages` | История чата | `?limit=50&offset=0` | `{ messages[] }` |
| POST | `/chats/:id/messages` | Отправить сообщение | `{ text }` | `{ message }` |
| POST | `/walks` | Предложить прогулку | `{ match_id, place, lat, lon, scheduled_at }` | `{ walk }` |
| PATCH | `/walks/:id` | Подтвердить/отменить | `{ status: 'confirmed'\|'cancelled' }` | `{ walk }` |
| POST | `/reviews` | Оставить отзыв | `{ walk_id, about_dog_id, rating, text }` | `{ review }` |
| POST | `/blocks` | Заблокировать собаку | `{ blocked_dog_id, reason }` | `{ ok: true }` |

### 5.3 Формат ответа

```typescript
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

## 6. Telegram Bot Integration

Бот на **aiogram 3.x** (Python), хостится на Render.com Free tier.

### 6.1 Команды бота

| Команда | Описание |
|---------|----------|
| `/start` | Приветствие + кнопка "Открыть приложение" (Web App) |
| `/profile` | Краткая сводка: мэтчи, прогулки, рейтинг |
| `/settings` | Настройки уведомлений |

### 6.2 Автоматические уведомления (push через бота)

| Событие | Текст уведомления |
|---------|-------------------|
| Новый мэтч | "🎉 У вас новый мэтч! [Имя пса] и [Имя пса] понравились друг другу. Откройте приложение, чтобы написать!" |
| Предложение прогулки | "[Имя] приглашает на прогулку: [место], [время]. Подтвердите в приложении." |
| Напоминание за 1 час | "⏰ Через час прогулка с [Имя] в [место]. Не забудьте поводок!" |
| Напоминание за 15 мин | "🚶 Через 15 минут встреча! Ждём вас." |
| Новый отзыв | "⭐ Вам оставили отзыв: [текст]. Посмотрите в приложении." |

### 6.3 Архитектура бота

```python
# aiogram 3.x
from aiogram import Bot, Dispatcher
from aiogram.filters import CommandStart
from aiogram.types import Message, WebAppInfo
from aiogram.utils.keyboard import InlineKeyboardBuilder

bot = Bot(token=os.getenv("TELEGRAM_BOT_TOKEN"))
dp = Dispatcher()

@dp.message(CommandStart())
async def cmd_start(message: Message):
    kb = InlineKeyboardBuilder()
    kb.button(text="🐕 Открыть DogBuddy", web_app=WebAppInfo(url=os.getenv("APP_URL")))
    await message.answer(
        "Привет! Я помогу найти друзей для прогулок твоему псу. 🐾",
        reply_markup=kb.as_markup()
    )

# Фоновые задачи (напоминания) — через asyncio.sleep или APScheduler
async def send_walk_reminder(bot: Bot, tg_id: int, walk: dict):
    await bot.send_message(tg_id, f"⏰ Через час прогулка с {walk['dog_name']} в {walk['place']}")
```

---

## 7. Frontend Architecture (Telegram Mini App)

### 7.1 Структура экранов

```
1. Onboarding (если первый вход)
   ── Регистрация пса (имя, порода, фото, активность, район)

2. Главная (лента)
   └── Карта с собаками рядом + карточки (свайп-лента)

3. Профиль собаки
   └── Редактирование, фото, статистика прогулок

4. Мэтчи
   └── Список совпадений + чат

5. Прогулки
   └── Календарь, создание встречи, история

6. Настройки
   └── Уведомления, геолокация, выход
```

### 7.2 Интеграция с Telegram Web App SDK

```typescript
import { useLaunchParams } from '@telegram-apps/sdk-react';

function App() {
  const lp = useLaunchParams();
  
  // Инициализация при запуске
  useEffect(() => {
    window.Telegram.WebApp.ready();
    window.Telegram.WebApp.expand();  // разворачиваем на весь экран
    
    // Получаем данные пользователя из Telegram
    const user = window.Telegram.WebApp.initDataUnsafe.user;
    // user.id, user.username, user.first_name, user.photo_url
  }, []);
  
  // Haptic feedback при лайке
  const handleLike = () => {
    window.Telegram.WebApp.HapticFeedback.impactOccurred('medium');
    // ... логика лайка
  };
}
```

### 7.3 Карты (Leaflet + MapTiler)

```typescript
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';

function DogMap({ dogs, userLocation }) {
  return (
    <MapContainer center={[userLocation.lat, userLocation.lon]} zoom={14} style={{ height: '100%' }}>
      <TileLayer
        url="https://api.maptiler.com/maps/streets/{z}/{x}/{y}.png?key=MAPTILER_KEY"
        attribution='&copy; <a href="https://www.maptiler.com/">MapTiler</a> &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
      />
      {dogs.map(dog => (
        <Marker key={dog.id} position={[dog.lat, dog.lon]}>
          <Popup>
            <b>{dog.name}</b><br />
            Совместимость: {dog.compatibility}%<br />
            <img src={dog.photo_url} width="100" />
          </Popup>
        </Marker>
      ))}
    </MapContainer>
  );
}
```

---

## 8. Edge Cases & Security

### 8.1 Критические сценарии

| Сценарий | Обработка |
|----------|-----------|
| **Холодный старт (пустая лента)** | Показывать собак из расширенного радиуса (до 10 км) + сообщение "Пригласи друзей в район" |
| **Опасный мэтч (большая разница в весе)** | Предупреждение + обязательный чекбокс "Я контролирую встречу" |
| **Спам в чате** | Чат открывается только после взаимного мэтча; кнопка "Пожаловаться" в каждом сообщении |
| **Фейковые профили** | Модерация фото через Cloudinary AI (auto-moderation addon, бесплатно) |
| **Потеря геолокации** | Fallback на ввод адреса вручную + геокодинг через Nominatim (бесплатно, OSM) |
| **Пользователь удалил Telegram** | Бот ловит ошибку 403 при отправке, помечает пользователя как неактивного |

### 8.2 Безопасность

1. **Аутентификация:** только через Telegram `initData` (HMAC-SHA256). Никаких паролей.
2. **Валидация:** все входные данные проверяются на уровне API (zod или Joi).
3. **Rate limiting:** на уровне Neon Functions — 100 запросов/мин на пользователя.
4. **Фото:** загрузка только через Cloudinary (никаких прямых URL от пользователя).
5. **152-ФЗ:** 
   - Не собираем телефоны, email, паспорта
   - Чекбокс согласия с политикой конфиденциальности при регистрации
   - Политика конфиденциальности на отдельной странице
   - При монетизации — миграция БД на российский VPS

### 8.3 Мониторинг

- **Sentry** (Free tier) — ошибки фронтенда и бэкенда
- **UptimeRobot** (Free) — проверка доступности бота и API каждые 5 минут
- **Яндекс.Метрика** — аналитика поведения пользователей

---

## 9. Roadmap (4 недели по вечерам)

### Неделя 1 — Скелет
- [ ] Настроить репозиторий + Cloudflare Pages
- [ ] Создать бота через @BotFather
- [ ] Развернуть БД на Neon.tech, применить миграции
- [ ] Telegram Mini App обёртка + экран регистрации
- [ ] CRUD профиля собаки + загрузка фото в Cloudinary
- [ ] Деплой первой версии

### Неделя 2 — Социалка
- [ ] Геолокация (HTML5 Geolocation API) + сохранение в БД
- [ ] Эндпоинт `/dogs/nearby` с PostGIS-запросом
- [ ] Карточки собак + скоринг совместимости
- [ ] Лайки + автоматическое создание мэтча
- [ ] Бот шлёт уведомление о мэтче

### Неделя 3 — Прогулки
- [ ] Чат в реальном времени (polling или SSE через Neon Functions)
- [ ] Создание прогулки (место + время)
- [ ] Кнопка "Подтвердить" + обновление статуса
- [ ] Напоминания от бота (за 1 час и за 15 минут)

### Неделя 4 — Доверие и запуск
- [ ] Отзывы и рейтинг после прогулки
- [ ] Список друзей (повторные прогулки)
- [ ] Блокировки и жалобы
- [ ] Посев: 10-15 собак друзей
- [ ] Запуск в 2-3 районных Telegram-чатах
- [ ] Сбор обратной связи

---

## 10. Метрики успеха MVP

| Метрика | Цель через 1 месяц |
|---------|---------------------|
| Зарегистрированных собак | 100+ |
| Активных пользователей в неделю | 30+ |
| Мэтчей в неделю | 20+ |
| Подтверждённых прогулок в неделю | 10+ |
| Retention (вернулись через неделю) | 40%+ |
| NPS (готовность рекомендовать) | 50+ |

---

## 11. Контакты и ссылки

- **Репозиторий:** [будет добавлен]
- **Telegram бот:** @dogbuddy_bot (пример)
- **Документация Telegram Mini App:** https://core.telegram.org/bots/webapps
- **Документация Neon:** https://neon.tech/docs
- **Документация MapTiler:** https://docs.maptiler.com
- **Документация Leaflet:** https://leafletjs.com/reference.html
