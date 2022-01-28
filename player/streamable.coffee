window.StreamablePlayer = class StreamablePlayer extends PlayerJSPlayer
    constructor: (data) ->
        if not (this instanceof StreamablePlayer)
            return new StreamablePlayer(data)

        super(data)

    load: (data) ->
        @ready = false
        @finishing = false
        @setMediaProperties(data)

        waitUntilDefined(window, 'playerjs', =>
            iframe = $('<iframe/>')
                    .attr(
                        src: "https://streamable.com/e/#{data.id}"
                        allow: 'autoplay; fullscreen'
                    )

            removeOld(iframe)
            @setupPlayer(iframe[0])
            @player.on('ready', =>
                # Streamable does not implement ended event since it loops
                # gotta use a timeupdate hack
                @player.on('timeupdate', (time) =>
                    if time.duration - time.seconds < 1 and not @finishing
                        setTimeout(=>
                            if CLIENT.leader
                                socket.emit('playNext')
                            @pause()
                        , (time.duration - time.seconds) * 1000)
                        @finishing = true
                )
            )
        )
