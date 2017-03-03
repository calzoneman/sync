window.UstreamPlayer = class UstreamPlayer extends EmbedPlayer
    constructor: (data) ->
        if not (this instanceof UstreamPlayer)
            return new UstreamPlayer(data)

        @load(data)

    load: (data) ->
        data.meta.embed =
            tag: 'iframe'
            src: "/ustream_bypass/embed/#{data.id}?html5ui&autoplay=1"
        super(data)
