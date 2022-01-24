window.LivestreamPlayer = class LivestreamPlayer extends EmbedPlayer
    constructor: (data) ->
        if not (this instanceof LivestreamPlayer)
            return new LivestreamPlayer(data)

        @load(data)

    load: (data) ->
        [ account, event ] = data.id.split(';')
        data.meta.embed =
            src: "https://livestream.com/accounts/#{account}/events/#{event}/player?\
                    enableInfoAndActivity=false&\
                    defaultDrawer=&\
                    autoPlay=true&\
                    mute=false"
            tag: 'iframe'
        super(data)
