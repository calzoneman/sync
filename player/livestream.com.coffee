window.LivestreamPlayer = class LivestreamPlayer extends Player
    constructor: (data) ->
        if not (this instanceof LivestreamPlayer)
            return new LivestreamPlayer(data)

        @load(data)

    load: (data) ->
        @setMediaProperties(data)

        @player = $('<iframe/>').attr(
            src: "https://cdn.livestream.com/embed/#{data.id}?\
                layout=4&\
                color=0x000000&\
                iconColorOver=0xe7e7e7&\
                iconColor=0xcccccc"
            frameborder: '0'
        )
        removeOld(@player)
