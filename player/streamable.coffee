window.StreamablePlayer = class StreamablePlayer extends PlayerJSPlayer
    constructor: (data) ->
        if not (this instanceof StreamablePlayer)
            return new StreamablePlayer(data)

        super(data)

    load: (data) ->
        data.meta.playerjs =
            src: "https://streamable.com/e/#{data.id}"

        super(data)
