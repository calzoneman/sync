window.YouTubePlayer = class YouTubePlayer extends Player
    constructor: (data) ->
        if not (this instanceof YouTubePlayer)
            return new YouTubePlayer(data)

        @setMediaProperties(data)
        @qualityRaceCondition = true
        @pauseSeekRaceCondition = false

        waitUntilDefined(window, 'YT', =>
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

    load: (data) ->
        @setMediaProperties(data)
        if @yt
            @yt.loadVideoById(data.id, data.currentTime)
            @qualityRaceCondition = true
            if USEROPTS.default_quality
                @yt.setPlaybackQuality(USEROPTS.default_quality)

    onReady: ->
        @setVolume(VOLUME)

    onStateChange: (ev) ->
        # For some reason setting the quality doesn't work
        # until the first event has fired.
        if @qualityRaceCondition
            @qualityRaceCondition = false
            if USEROPTS.default_quality
                @yt.setPlaybackQuality(USEROPTS.default_quality)

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
        if @yt
            @yt.playVideo()

    pause: ->
        @paused = true
        if @yt
            @yt.pauseVideo()

    seekTo: (time) ->
        if @yt
            @yt.seekTo(time, true)

    setVolume: (volume) ->
        if @yt
            if volume > 0
                # If the player is muted, even if the volume is set,
                # the player remains muted
                @yt.unMute()
            @yt.setVolume(volume * 100)

    getTime: (cb) ->
        if @yt
            cb(@yt.getCurrentTime())
        else
            cb(0)

    getVolume: (cb) ->
        if @yt
            if @yt.isMuted()
                cb(0)
            else
                cb(@yt.getVolume() / 100)
        else
            cb(VOLUME)
