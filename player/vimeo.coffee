window.VimeoPlayer = class VimeoPlayer extends Player
    constructor: (data) ->
        if not (this instanceof VimeoPlayer)
            return new VimeoPlayer(data)

        @load(data)

    load: (data) ->
        @setMediaProperties(data)

        waitUntilDefined(window, '$f', =>
            video = $('<iframe/>')
            removeOld(video)
            video.attr(
                src: "https://player.vimeo.com/video/#{data.id}?api=1&player_id=ytapiplayer"
                webkitallowfullscreen: true
                mozallowfullscreen: true
                allowfullscreen: true
            )

            if USEROPTS.wmode_transparent
                video.attr('wmode', 'transparent')

            $f(video[0]).addEvent('ready', =>
                @vimeo = $f(video[0])
                @play()

                @vimeo.addEvent('finish', =>
                    if CLIENT.leader
                        socket.emit('playNext')
                )

                @vimeo.addEvent('pause', =>
                    @paused = true
                    if CLIENT.leader
                        sendVideoUpdate()
                )

                @vimeo.addEvent('play', =>
                    @paused = false
                    if CLIENT.leader
                        sendVideoUpdate()
                )

                @setVolume(VOLUME)
            )
        )

    play: ->
        @paused = false
        if @vimeo
            @vimeo.api('play')

    pause: ->
        @paused = true
        if @vimeo
            @vimeo.api('pause')

    seekTo: (time) ->
        if @vimeo
            @vimeo.api('seekTo', time)

    setVolume: (volume) ->
        if @vimeo
            @vimeo.api('setVolume', volume)

    getTime: (cb) ->
        if @vimeo
            @vimeo.api('getCurrentTime', (time) ->
                # I will never understand why Vimeo returns current time as a string
                cb(parseFloat(time))
            )
        else
            cb(0)

    getVolume: (cb) ->
        if @vimeo
            @vimeo.api('getVolume', cb)
        else
            cb(VOLUME)
