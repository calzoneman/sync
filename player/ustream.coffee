window.UstreamPlayer = class UstreamPlayer extends CustomEmbedPlayer
    constructor: (data) ->
        if not (this instanceof UstreamPlayer)
            return new UstreamPlayer(data)

        @load(data)

    load: (data) ->
        data.meta.embed =
            tag: 'iframe'
            src: "https://www.ustream.tv/embed/#{data.id}?v=3&wmode=direct&autoplay=1"
        super(data)
