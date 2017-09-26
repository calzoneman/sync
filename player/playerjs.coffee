window.PlayerJSPlayer = class PlayerJSPlayer extends Player
    constructor: (data) ->
        if not (this instanceof PlayerJSPlayer)
            return new PlayerJSPlayer(data)

        @load(data)

    load: (data) ->
        @setMediaProperties(data)
        @ready = false
        @finishing = false

        if not data.meta.playerjs
            throw new Error('Invalid input: missing meta.playerjs')

        waitUntilDefined(window, 'playerjs', =>
            iframe = $('<iframe/>')
                    .attr(src: data.meta.playerjs.src)

            removeOld(iframe)

            @player = new playerjs.Player(iframe[0])
            @player.on('ready', =>
                @player.on('error', (error) =>
                    console.error('PlayerJS error', error.stack)
                )
                @player.on('ended', ->
                    # Streamable seems to not implement this since it loops
                    # gotta use the timeupdate hack below
                    if CLIENT.leader
                        socket.emit('playNext')
                )
                @player.on('timeupdate', (time) =>
                    if time.duration - time.seconds < 1 and not @finishing
                        setTimeout(=>
                            if CLIENT.leader
                                socket.emit('playNext')
                            @pause()
                        , (time.duration - time.seconds) * 1000)
                        @finishing = true
                )
                @player.on('play', ->
                    @paused = false
                    if CLIENT.leader
                        sendVideoUpdate()
                )
                @player.on('pause', ->
                    @paused = true
                    if CLIENT.leader
                        sendVideoUpdate()
                )

                @player.setVolume(VOLUME * 100)

                if not @paused
                    @player.play()

                @ready = true
            )
        )

    play: ->
        @paused = false
        if @player and @ready
            @player.play()

    pause: ->
        @paused = true
        if @player and @ready
            @player.pause()

    seekTo: (time) ->
        if @player and @ready
            @player.setCurrentTime(time)

    setVolume: (volume) ->
        if @player and @ready
            @player.setVolume(volume * 100)

    getTime: (cb) ->
        if @player and @ready
            @player.getCurrentTime(cb)
        else
            cb(0)

    getVolume: (cb) ->
        if @player and @ready
            @player.getVolume((volume) ->
                cb(volume / 100)
            )
        else
            cb(VOLUME)
