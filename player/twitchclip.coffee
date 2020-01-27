window.TwitchClipPlayer = class TwitchClipPlayer extends EmbedPlayer
    constructor: (data) ->
        if not (this instanceof TwitchClipPlayer)
            return new TwitchClipPlayer(data)

        @load(data)

    load: (data) ->
        data.meta.embed =
            tag: 'iframe'
            src: "https://clips.twitch.tv/embed?clip=#{data.id}"
        super(data)
