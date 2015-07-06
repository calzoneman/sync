window.ImgurPlayer = class ImgurPlayer extends EmbedPlayer
    constructor: (data) ->
        if not (this instanceof ImgurPlayer)
            return new ImgurPlayer(data)

        @load(data)

    load: (data) ->
        data.meta.embed =
            tag: 'iframe'
            src: "https://imgur.com/a/#{data.id}/embed"
        super(data)
