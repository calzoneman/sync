window.NicoPlayer = class NicoPlayer extends Player
    constructor: (data) ->
        if not (this instanceof NicoPlayer)
            return new NicoPlayer(data)

        @load(data)

    load: (data) ->
        @setMediaProperties(data)

        waitUntilDefined(window, 'NicovideoEmbed', =>
            @nico = new NicovideoEmbed({ playerId: 'ytapiplayer', videoId: data.id })
            removeOld($(@nico.iframe))

            @nico.on('ended', =>
                if CLIENT.leader
                    socket.emit('playNext')
            )

            @nico.on('pause', =>
                @paused = true
                if CLIENT.leader
                    sendVideoUpdate()
            )

            @nico.on('play', =>
                @paused = false
                if CLIENT.leader
                    sendVideoUpdate()
            )

            @nico.on('ready', =>
                @play()
                @setVolume(VOLUME)
            )
        )

    play: ->
        @paused = false
        if @nico
            @nico.play()

    pause: ->
        @paused = true
        if @nico
            @nico.pause()

    seekTo: (time) ->
        if @nico
            @nico.seek(time * 1000)

    setVolume: (volume) ->
        if @nico
            @nico.volumeChange(volume)

    getTime: (cb) ->
        if @nico
            cb(parseFloat(@nico.state.currentTime / 1000))
        else
            cb(0)

    getVolume: (cb) ->
        if @nico
            cb(parseFloat(@nico.state.volume))
        else
            cb(VOLUME)
