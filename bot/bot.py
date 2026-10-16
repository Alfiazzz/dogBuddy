import asyncio
import os

from aiohttp import web
from aiogram import Bot, Dispatcher
from aiogram.filters import Command
from aiogram.types import InlineKeyboardButton, InlineKeyboardMarkup, MenuButtonWebApp, Message, WebAppInfo
from dotenv import load_dotenv

load_dotenv()

BOT_TOKEN = os.getenv("BOT_TOKEN")
WEBAPP_URL = "https://pereskazka-ai.ru/dogbuddy/index.html"

dp = Dispatcher()


def open_keyboard() -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup(
        inline_keyboard=[
            [
                InlineKeyboardButton(
                    text="Открыть DogBuddy",
                    web_app=WebAppInfo(url=WEBAPP_URL),
                )
            ]
        ]
    )


@dp.message(Command("start"))
async def start(message: Message):
    await message.answer(
        "Привет! Я помогу найти друзей для прогулок твоему псу 🐾",
        reply_markup=open_keyboard(),
    )


@dp.message(Command("menu"))
async def menu(message: Message):
    await message.answer(
        "Откройте DogBuddy: внутри будет анкета или меню.",
        reply_markup=open_keyboard(),
    )


@dp.message(Command("help"))
async def help_command(message: Message):
    await message.answer(
        "Доступные команды:\n"
        "/start — открыть DogBuddy\n"
        "/menu — открыть DogBuddy\n"
        "/help — список команд\n"
        "/profile — открыть DogBuddy"
    )


@dp.message(Command("profile"))
async def profile(message: Message):
    await message.answer(
        "Профиль открывается внутри DogBuddy.",
        reply_markup=open_keyboard(),
    )


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
    await bot.set_chat_menu_button(
        menu_button=MenuButtonWebApp(
            text="Открыть DogBuddy",
            web_app=WebAppInfo(url=WEBAPP_URL),
        )
    )
    await start_health_server()
    await bot.delete_webhook(drop_pending_updates=True)
    await dp.start_polling(bot)


if __name__ == "__main__":
    asyncio.run(main())
