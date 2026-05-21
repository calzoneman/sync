"""
Veretube Python Show Bot example (veretube-bot 0.1.4)

Commands in chat:
  !shows                 -> list existing shows
  !mkshow                -> create an example show scheduled ~2 minutes from now
  !show <id>             -> inspect a show from API
  !runshow <id>          -> trigger immediate run of a show
"""

from datetime import datetime, timedelta, timezone
import asyncio
import os

from veretube_bot import AsyncBot, BotAPIError

BOT_TOKEN = os.getenv("BOT_TOKEN", "TOKEN_HERE")
CHANNEL = os.getenv("CHANNEL", "CHANNEL_NAME_HERE")
SOCKET_URL = os.getenv("SOCKET_URL", "http://localhost:1337")
API_BASE = os.getenv("API_BASE", "http://localhost:8080/api/v1")
SHOW_TIMEZONE = os.getenv("SHOW_TIMEZONE", "UTC")

bot = AsyncBot(
    token=BOT_TOKEN,
    channel=CHANNEL,
    socket_url=SOCKET_URL,
    api_url=API_BASE,
)


def create_example_show_payload() -> dict:
    # Schedule a couple minutes in the future to make testing easy.
    scheduled_for = datetime.now(timezone.utc) + timedelta(minutes=2)

    return {
        "name": f"Python Demo Show {scheduled_for.strftime('%H:%M:%S')}",
        "scheduled_for": scheduled_for.isoformat(),
        "timezone": SHOW_TIMEZONE,
        "recurrence": "none",
        "fill_mode": "append",
        "conflict_mode": "force",
        "start_playback": False,
        "status": "scheduled",
        "playlist": [
            {"type": "yt", "id": "dQw4w9WgXcQ", "pos": "end"},
            {"type": "yt", "id": "9bZkp7q19f0", "pos": "end"},
        ],
    }

@bot.on("chatMsg")
async def on_chat(data):
    msg = (data.get("msg") or "").strip()

    if msg == "!shows":
        try:
            shows = await bot.list_shows()
        except BotAPIError as err:
            await bot.send_message(f"shows error: {err}")
            return

        if not shows:
            await bot.send_message("No shows configured")
            return

        summary = ", ".join([f"#{s['id']} {s['name']} ({s['status']})" for s in shows[:4]])
        await bot.send_message(f"Shows: {summary}")

    elif msg == "!mkshow":
        try:
            show = await bot.create_show(create_example_show_payload())
            persisted = await bot.get_show(show["id"])
            await bot.send_message(
                f"Created show #{persisted['id']} status={persisted.get('status')} "
                f"scheduled_for={persisted.get('scheduled_for')} timezone={persisted.get('timezone')}"
            )
        except BotAPIError as err:
            await bot.send_message(f"create show error: {err}")

    elif msg.startswith("!runshow "):
        parts = msg.split()
        if len(parts) != 2 or not parts[1].isdigit():
            await bot.send_message("Usage: !runshow <show_id>")
            return

        show_id = int(parts[1])
        try:
            result = await bot.show_action(show_id, "run")
            await bot.send_message(f"Show #{result['id']} run action complete, status={result['status']}")
        except BotAPIError as err:
            await bot.send_message(f"run show error: {err}")

    elif msg.startswith("!show "):
        parts = msg.split()
        if len(parts) != 2 or not parts[1].isdigit():
            await bot.send_message("Usage: !show <show_id>")
            return

        show_id = int(parts[1])
        try:
            show = await bot.get_show(show_id)
            await bot.send_message(
                f"Show #{show['id']}: status={show.get('status')} "
                f"scheduled_for={show.get('scheduled_for')} timezone={show.get('timezone')}"
            )
        except BotAPIError as err:
            await bot.send_message(f"show lookup error: {err}")


@bot.on("changeMedia")
async def on_media(data):
    title = data.get("title", "(unknown)")
    await bot.send_message(f"Now playing: {title}")


if __name__ == "__main__":
    asyncio.run(bot.run())
