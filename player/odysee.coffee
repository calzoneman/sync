window.OdyseePlayer = class OdyseePlayer extends Player
    constructor: (data) ->
        if not (this instanceof OdyseePlayer)
            return new OdyseePlayer(data)

        @load(data)

    load: (data) ->
        @setMediaProperties(data)
        @ready = false

        waitUntilDefined(window, 'playerjs', =>
            iframe = $('<iframe/>')
                    .attr(
                        src: data.meta.embed.src
                        allow: 'autoplay; fullscreen'
                    )

            removeOld(iframe)

            @player = new playerjs.Player(iframe[0])
            @player.on('ready', =>
                @player.on('error', (error) =>
                    console.error('PlayerJS error', error.stack)
                )
                @player.on('ended', ->
                    if CLIENT.leader
                        socket.emit('playNext')
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
