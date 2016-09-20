window.HitboxPlayer = class HitboxPlayer extends EmbedPlayer
    constructor: (data) ->
        if not (this instanceof HitboxPlayer)
            return new HitboxPlayer(data)

        @load(data)

    load: (data) ->
        data.meta.embed =
            src: "https://www.hitbox.tv/embed/#{data.id}"
            tag: 'iframe'
        super(data)
