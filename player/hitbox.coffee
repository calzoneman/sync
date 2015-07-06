HITBOX_ERROR = 'Hitbox.tv only serves its content over plain HTTP, but you are
    viewing this page over secure HTTPS.  Your browser therefore blocks the
    hitbox embed due to mixed content policy.  In order to view hitbox, you must
    view this page over plain HTTP (change "https://" to "http://" in the address
    bar)-- your websocket will still be connected using secure HTTPS.  This is
    something I have asked Hitbox to fix but they have not done so yet.'

window.HitboxPlayer = class HitboxPlayer extends EmbedPlayer
    constructor: (data) ->
        if not (this instanceof HitboxPlayer)
            return new HitboxPlayer(data)

        @load(data)

    load: (data) ->
        data.meta.embed =
            src: "http://hitbox.tv/embed/#{data.id}"
            tag: 'iframe'
        super(data)

    mixedContentError: HITBOX_ERROR
