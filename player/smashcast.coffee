window.SmashcastPlayer = class SmashcastPlayer extends EmbedPlayer
    constructor: (data) ->
        if not (this instanceof SmashcastPlayer)
            return new SmashcastPlayer(data)

        @load(data)

    load: (data) ->
        data.meta.embed =
            src: "https://www.smashcast.tv/embed/#{data.id}"
            tag: 'iframe'
        super(data)
