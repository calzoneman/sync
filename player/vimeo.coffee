window.VimeoPlayer = class VimeoPlayer extends Player
    constructor: (data) ->
        if not (this instanceof VimeoPlayer)
            return new VimeoPlayer(data)

        @load(data)

    load: (data) ->
        @setMediaProperties(data)

        waitUntilDefined(window, 'Vimeo', =>
            video = $('<iframe/>')
            removeOld(video)
            video.attr(
                src: "https://player.vimeo.com/video/#{data.id}"
                allow: 'autoplay; fullscreen'
            )

            @vimeo = new Vimeo.Player(video[0])

            @vimeo.on('ended', =>
                if CLIENT.leader
                    socket.emit('playNext')
            )

            @vimeo.on('pause', =>
                @paused = true
                if CLIENT.leader
                    sendVideoUpdate()
            )

            @vimeo.on('play', =>
                @paused = false
                if CLIENT.leader
                    sendVideoUpdate()
            )

            # Vimeo Player SDK playbackratechange (when the embed exposes rate UI)
            @vimeo.on('playbackratechange', =>
                if CLIENT.leader
                    sendVideoUpdateThrottled()
            )

            @play()
            @setVolume(VOLUME)
        )

    play: ->
        @paused = false
        if @vimeo
            @vimeo.play().catch((error) ->
                console.error('vimeo::play():', error)
            )

    pause: ->
        @paused = true
        if @vimeo
            @vimeo.pause().catch((error) ->
                console.error('vimeo::pause():', error)
            )

    seekTo: (time) ->
        if @vimeo
            @vimeo.setCurrentTime(time).catch((error) ->
                console.error('vimeo::setCurrentTime():', error)
            )

    setVolume: (volume) ->
        if @vimeo
            @vimeo.setVolume(volume).catch((error) ->
                console.error('vimeo::setVolume():', error)
            )

    supportsPlaybackRate: ->
        true

    setPlaybackRate: (rate) ->
        @playbackRate = rate
        if @vimeo and typeof @vimeo.setPlaybackRate == 'function'
            @vimeo.setPlaybackRate(rate).catch((error) ->
                console.error('vimeo::setPlaybackRate():', error)
            )

    getPlaybackRate: (cb) ->
        if @vimeo and typeof @vimeo.getPlaybackRate == 'function'
            @vimeo.getPlaybackRate().then((rate) ->
                cb(parseFloat(rate))
            ).catch((error) ->
                console.error('vimeo::getPlaybackRate():', error)
                cb(1)
            )
        else
            cb(@playbackRate or 1)

    getTime: (cb) ->
        if @vimeo
            @vimeo.getCurrentTime().then((time) ->
                cb(parseFloat(time))
            ).catch((error) ->
                console.error('vimeo::getCurrentTime():', error)
            )
        else
            cb(0)

    getVolume: (cb) ->
        if @vimeo
            @vimeo.getVolume().then((volume) ->
                cb(parseFloat(volume))
            ).catch((error) ->
                console.error('vimeo::getVolume():', error)
            )
        else
            cb(VOLUME)
