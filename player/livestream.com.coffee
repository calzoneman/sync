window.LivestreamPlayer = class LivestreamPlayer extends EmbedPlayer
    constructor: (data) ->
        if not (this instanceof LivestreamPlayer)
            return new LivestreamPlayer(data)

        @load(data)

    load: (data) ->
        data.meta.embed =
            src: "https://cdn.livestream.com/embed/#{data.id}?\
                    layout=4&\
                    color=0x000000&\
                    iconColorOver=0xe7e7e7&\
                    iconColor=0xcccccc"
            tag: 'iframe'
        super(data)
