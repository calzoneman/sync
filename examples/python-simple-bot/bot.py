from veretube_bot import Bot, Rank

bot = Bot(
    token="TOKEN_HERE",
    channel="CHANNEL_NAME_HERE",
    socket_url="http://localhost:1337",
    api_url="http://localhost:8080/api/v1"
)

@bot.on("chatMsg")
def on_chat(data):
    if data["msg"] == "!playlist":
        playlist = bot.api.get_playlist()
        bot.send_message(f"{len(playlist['items'])} items in queue")
    elif data["msg"].startswith("!kick "):
        name = data["msg"].split(" ", 1)[1]
        bot.kick(name, "Kicked by command")
    elif data["msg"] == "!emotes":
        emotes = bot.get_emotes()
        print(emotes)

@bot.on("changeMedia")                                                                                                                                                                    
def on_media(data):                                                                                                                                                                       
    bot.send_message(f"Now playing: {data['title']}")

bot.run()
