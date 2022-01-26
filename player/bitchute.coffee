window.BitChutePlayer = class BitChutePlayer extends Player
    constructor: (data) ->
        if not (this instanceof BitChutePlayer)
            return new BitChutePlayer(data)

        @load(data)

    load: (data) ->
        @setMediaProperties(data)
        @ready = false

        waitUntilDefined(window, 'playerjs', =>
            iframe = $('<iframe/>')
                    .attr(
                        src: '/iframe'
                        allow: 'autoplay; fullscreen'
                    )

            removeOld(iframe)
            @setupframe(iframe[0], data)

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

    setupframe: (iframe, data) ->
        iframe.addEventListener('load', =>
            iframe.contentWindow.VOLUME = VOLUME;
            iframe.contentWindow.loadMediaPlayer(Object.assign({}, data, { type: 'cm' } ))
            iframe.contentWindow.document.querySelector('#ytapiplayer').classList.add('vjs-fluid')
            adapter = iframe.contentWindow.playerjs.VideoJSAdapter(iframe.contentWindow.PLAYER.player)
            adapter.ready()
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
