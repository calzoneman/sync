window.YouTubePlayer = class YouTubePlayer extends Player
    constructor: (data) ->
        if not (this instanceof YouTubePlayer)
            return new YouTubePlayer(data)

        @setMediaProperties(data)
        @qualityRaceCondition = true
        @pauseSeekRaceCondition = false

        waitUntilDefined(window, 'YT', =>
            # Even after window.YT is defined, YT.Player may not be, which causes a
            # 'YT.Player is not a constructor' error occasionally
            waitUntilDefined(YT, 'Player', =>
                removeOld()

                wmode = if USEROPTS.wmode_transparent then 'transparent' else 'opaque'
                @yt = new YT.Player('ytapiplayer',
                    videoId: data.id
                    playerVars:
                        autohide: 1
                        autoplay: 1
                        controls: 1
                        iv_load_policy: 3 # iv_load_policy 3 indicates no annotations
                        rel: 0
                        wmode: wmode
                    events:
                        onReady: @onReady.bind(this)
                        onStateChange: @onStateChange.bind(this)
                )
            )
        )

    load: (data) ->
        @setMediaProperties(data)
        if @yt and @yt.ready
            @yt.loadVideoById(data.id, data.currentTime)
            @qualityRaceCondition = true
            if USEROPTS.default_quality
                @setQuality(USEROPTS.default_quality)
        else
            console.error('WTF?  YouTubePlayer::load() called but yt is not ready')

    onReady: ->
        @yt.ready = true
        @setVolume(VOLUME)

    onStateChange: (ev) ->
        # For some reason setting the quality doesn't work
        # until the first event has fired.
        if @qualityRaceCondition
            @qualityRaceCondition = false
            if USEROPTS.default_quality
                @setQuality(USEROPTS.default_quality)

        # Similar to above, if you pause the video before the first PLAYING
        # event is emitted, weird things happen.
        if ev.data == YT.PlayerState.PLAYING and @pauseSeekRaceCondition
            @pause()
            @pauseSeekRaceCondition = false

        if (ev.data == YT.PlayerState.PAUSED and not @paused) or
                (ev.data == YT.PlayerState.PLAYING and @paused)
            @paused = (ev.data == YT.PlayerState.PAUSED)
            if CLIENT.leader
                sendVideoUpdate()

        if ev.data == YT.PlayerState.ENDED and CLIENT.leader
            socket.emit('playNext')

    play: ->
        @paused = false
        if @yt and @yt.ready
            @yt.playVideo()

    pause: ->
        @paused = true
        if @yt and @yt.ready
            @yt.pauseVideo()

    seekTo: (time) ->
        if @yt and @yt.ready
            @yt.seekTo(time, true)

    setVolume: (volume) ->
        if @yt and @yt.ready
            if volume > 0
                # If the player is muted, even if the volume is set,
                # the player remains muted
                @yt.unMute()
            @yt.setVolume(volume * 100)

    setQuality: (quality) ->
        if not @yt or not @yt.ready
            return

        ytQuality = switch String(quality)
            when '240' then 'small'
            when '360' then 'medium'
            when '480' then 'large'
            when '720' then 'hd720'
            when '1080' then 'hd1080'
            when 'best' then 'highres'
            else 'auto'

        if ytQuality != 'auto'
            @yt.setPlaybackQuality(ytQuality)

    getTime: (cb) ->
        if @yt and @yt.ready
            cb(@yt.getCurrentTime())
        else
            cb(0)

    getVolume: (cb) ->
        if @yt and @yt.ready
            if @yt.isMuted()
                cb(0)
            else
                cb(@yt.getVolume() / 100)
        else
            cb(VOLUME)
