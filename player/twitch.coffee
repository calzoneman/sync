window.twitchEventCallback = (events) ->
    if not (PLAYER instanceof TwitchPlayer)
        return false

    events.forEach((event) ->
        if event.event == 'playerInit'
            PLAYER.twitch.unmute()
            PLAYER.twitch.ready = true
    )

window.TwitchPlayer = class TwitchPlayer extends Player
    constructor: (data) ->
        if not (this instanceof TwitchPlayer)
            return new TwitchPlayer(data)

        @load(data)

    load: (data) ->
        @setMediaProperties(data)

        object = $('<object/>').attr(
            # NOTE: Must be protocol-relative or else flash throws errors when
            # you try to call API functions.
            data: '//www-cdn.jtvnw.net/swflibs/TwitchPlayer.swf'
            type: 'application/x-shockwave-flash'
        )
        $('<param/>').attr(
            name: 'allowScriptAccess'
            value: 'always'
        ).appendTo(object)
        $('<param/>').attr(
            name: 'allowFullScreen'
            value: 'true'
        ).appendTo(object)
        # NOTE: start_volume can be used to set the initial player volume,
        # however it is impossible to manipulate or query it from the player
        # later.
        $('<param/>').attr(
            name: 'flashvars'
            value: "embed=1&\
                hostname=localhost&\
                channel=#{data.id}&
                eventsCallback=twitchEventCallback&\
                auto_play=true&\
                start_volume=#{Math.floor(VOLUME * 100)}"
        ).appendTo(object)

        removeOld(object)

        @twitch = object[0]
