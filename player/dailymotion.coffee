window.DailymotionPlayer = class DailymotionPlayer extends Player
    constructor: (data) ->
        if not (this instanceof DailymotionPlayer)
            return new DailymotionPlayer(data)

        @setMediaProperties(data)
        @initialVolumeSet = false

        waitUntilDefined(window, 'DM', =>
            removeOld()

            params =
                autoplay: 1
                wmode: if USEROPTS.wmode_transparent then 'transparent' else 'opaque'
                logo: 0

            quality = @mapQuality(USEROPTS.default_quality)
            if quality != 'auto'
                params.quality = quality

            @dm = DM.player('ytapiplayer',
                video: data.id
                width: parseInt(VWIDTH, 10)
                height: parseInt(VHEIGHT, 10)
                params: params
            )

            @dm.addEventListener('apiready', =>
                @dm.ready = true
                @dm.addEventListener('ended', ->
                    if CLIENT.leader
                        socket.emit('playNext')
                )

                @dm.addEventListener('pause', =>
                    @paused = true
                    if CLIENT.leader
                        sendVideoUpdate()
                )

                @dm.addEventListener('playing', =>
                    @paused = false
                    if CLIENT.leader
                        sendVideoUpdate()

                    if not @initialVolumeSet
                        @setVolume(VOLUME)
                        @initialVolumeSet = true
                )
            )
        )

    load: (data) ->
        @setMediaProperties(data)
        if @dm and @dm.ready
            @dm.load(data.id)
            @dm.seek(data.currentTime)
        else
            console.error('WTF?  DailymotionPlayer::load() called but dm is not ready')

    pause: ->
        if @dm and @dm.ready
            @paused = true
            @dm.pause()

    play: ->
        if @dm and @dm.ready
            @paused = false
            @dm.play()

    seekTo: (time) ->
        if @dm and @dm.ready
            @dm.seek(time)

    setVolume: (volume) ->
        if @dm and @dm.ready
            @dm.setVolume(volume)

    getTime: (cb) ->
        if @dm and @dm.ready
            cb(@dm.currentTime)
        else
            cb(0)

    getVolume: (cb) ->
        if @dm and @dm.ready
            if @dm.muted
                cb(0)
            else
                volume = @dm.volume
                # There was once a bug in Dailymotion where it sometimes gave back
                # volumes in the wrong range.  Not sure if this is still a necessary
                # check.
                if volume > 1
                    volume /= 100
                cb(volume)
        else
            cb(VOLUME)

    mapQuality: (quality) ->
        switch String(quality)
            when '240', '480', '720', '1080' then String(quality)
            when '360' then '380'
            when 'best' then '1080'
            else 'auto'
