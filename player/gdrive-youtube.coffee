window.GoogleDriveYouTubePlayer = class GoogleDriveYouTubePlayer extends Player
    constructor: (data) ->
        if not (this instanceof GoogleDriveYouTubePlayer)
            return new GoogleDriveYouTubePlayer(data)

        @setMediaProperties(data)
        @init(data)

    init: (data) ->
        embed = $('<embed />').attr(
            type: 'application/x-shockwave-flash'
            src: "https://www.youtube.com/get_player?docid=#{data.id}&ps=docs\
                  &partnerid=30&enablejsapi=1&cc_load_policy=1\
                  &auth_timeout=86400000000"
            flashvars: 'autoplay=1&playerapiid=uniquePlayerId'
            wmode: 'opaque'
            allowscriptaccess: 'always'
        )
        removeOld(embed)

        window.onYouTubePlayerReady = =>
            if PLAYER != this
                return

            @yt = embed[0]
            window.gdriveStateChange = @onStateChange.bind(this)
            @yt.addEventListener('onStateChange', 'gdriveStateChange')
            @onReady()

    load: (data) ->
        @setMediaProperties(data)
        @init(data)

    onReady: ->
        @yt.ready = true
        @setVolume(VOLUME)
        @setQuality(USEROPTS.default_quality)

    onStateChange: (ev) ->
        if PLAYER != this
            return

        if (ev == YT.PlayerState.PAUSED and not @paused) or
                (ev == YT.PlayerState.PLAYING and @paused)
            @paused = (ev == YT.PlayerState.PAUSED)
            if CLIENT.leader
                sendVideoUpdate()

        if ev == YT.PlayerState.ENDED and CLIENT.leader
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
