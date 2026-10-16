import asyncio
import os

from aiohttp import web
from aiogram import Bot, Dispatcher, F
from aiogram.filters import Command
from aiogram.types import CallbackQuery, InlineKeyboardButton, InlineKeyboardMarkup, Message, WebAppInfo
from dotenv import load_dotenv

load_dotenv()

BOT_TOKEN = os.getenv("BOT_TOKEN")
SITE = "https://pereskazka-ai.ru/dogbuddy"

# callback_data -> подпись кнопки и страница мини-приложения
SECTIONS = {
    "profile": ("🐕 Мой профиль", f"{SITE}/profile.html"),
    "feed": ("🔍 Найти друзей", f"{SITE}/feed.html"),
    "walks": ("📅 Мои прогулки", f"{SITE}/walks.html"),
    "chats": ("💬 Чаты", f"{SITE}/chats.html"),
    "settings": ("⚙️ Настройки", f"{SITE}/settings.html"),
}

dp = Dispatcher()


def menu_keyboard() -> InlineKeyboardMarkup:
    rows = []
    for key, (title, _url) in SECTIONS.items():
        rows.append([InlineKeyboardButton(text=title, callback_data=f"open:{key}")])
    return InlineKeyboardMarkup(inline_keyboard=rows)


def webapp_keyboard(title: str, url: str) -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup(
        inline_keyboard=[
            [InlineKeyboardButton(text=title, web_app=WebAppInfo(url=url))]
        ]
    )


@dp.message(Command("start"))
async def start(message: Message):
    await message.answer(
        "Привет! Я помогу найти друзей для прогулок твоему псу 🐾\n\nВыбери раздел:",
        reply_markup=menu_keyboard(),
    )


@dp.message(Command("menu"))
async def menu(message: Message):
    await message.answer("Меню DogBuddy:", reply_markup=menu_keyboard())


@dp.callback_query(F.data.startswith("open:"))
async def open_section(callback: CallbackQuery):
    key = (callback.data or "").split(":", 1)[1]
    section = SECTIONS.get(key)
    if section is None:
        await callback.answer("Такого раздела нет")
        return

    title, url = section
    await callback.answer()
    if callback.message is not None:
        await callback.message.answer(title, reply_markup=webapp_keyboard(title, url))


@dp.message(Command("help"))
async def help_command(message: Message):
    await message.answer(
        "Доступные команды:\n"
        "/start — приветствие и меню\n"
        "/menu — меню разделов\n"
        "/help — список команд\n"
        "/profile — профиль"
    )


@dp.message(Command("profile"))
async def profile(message: Message):
    title, url = SECTIONS["profile"]
    await message.answer(title, reply_markup=webapp_keyboard(title, url))


async def start_health_server():
    port = int(os.getenv("PORT", "8080"))

    async def health(request):
        return web.Response(text="DogBuddy bot is running")

    app = web.Application()
    app.router.add_get("/", health)
    runner = web.AppRunner(app)
    await runner.setup()
    await web.TCPSite(runner, "0.0.0.0", port).start()


async def main():
    if not BOT_TOKEN:
        raise SystemExit("Не задан BOT_TOKEN. Создайте файл bot/.env")

    bot = Bot(token=BOT_TOKEN)
    await start_health_server()
    await bot.delete_webhook(drop_pending_updates=True)
    await dp.start_polling(bot)


if __name__ == "__main__":
    asyncio.run(main())
