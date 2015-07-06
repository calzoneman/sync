window.twitchEventCallback = (events) ->
    if not (PLAYER instanceof TwitchPlayer)
        return false

    events.forEach((event) ->
        if event.event == 'playerInit'
            PLAYER.twitch.unmute()
            PLAYER.twitch.ready = true
    )

window.TwitchPlayer = class TwitchPlayer extends EmbedPlayer
    constructor: (data) ->
        if not (this instanceof TwitchPlayer)
            return new TwitchPlayer(data)

        @load(data)

    load: (data) ->
        data.meta.embed =
            src: '//www-cdn.jtvnw.net/swflibs/TwitchPlayer.swf'
            tag: 'object'
            params:
                flashvars: "embed=1&\
                    hostname=localhost&\
                    channel=#{data.id}&
                    eventsCallback=twitchEventCallback&\
                    auto_play=true&\
                    start_volume=#{Math.floor(VOLUME * 100)}"
        super(data)
