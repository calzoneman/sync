window.DailymotionPlayer = class DailymotionPlayer extends Player
    constructor: (data) ->
        if not (this instanceof DailymotionPlayer)
            return new DailymotionPlayer(data)

        @setMediaProperties(data)
        @initialVolumeSet = false
        @playbackReadyCb = null

        waitUntilDefined(window, 'DM', =>
            removeOld()

            params =
                autoplay: 1
                logo: 0

            quality = @mapQuality(USEROPTS.default_quality)
            if quality != 'auto'
                params.quality = quality

            @element = DM.$('ytapiplayer')
            if not @element or @element.nodeType != Node.ELEMENT_NODE
                throw new Error("Invalid player element in DailymotionPlayer(), requires an existing HTML element: " + @element)
            if DM.Player._INSTANCES[@element.id] != undefined
                @element = DM.Player.destroy(@element.id)
            @dm = DM.Player.create(@element,
                video: data.id
                width: parseInt(VWIDTH, 10)
                height: parseInt(VHEIGHT, 10)
                params: params
            )

            @dm.addEventListener('apiready', =>
                @dmReady = true
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

                # Once the video stops, the internal state of the player
                # becomes unusable and attempting to load() will corrupt it and
                # crash the player with an error.  As a short–medium term
                # workaround, mark the player as "not ready" until the next
                # playback_ready event
                @dm.addEventListener('video_end', =>
                    @dmReady = false
                )
                @dm.addEventListener('playback_ready', =>
                    @dmReady = true
                    if @playbackReadyCb
                        @playbackReadyCb()
                        @playbackReadyCb = null
                )
            )
        )

    load: (data) ->
        @setMediaProperties(data)
        if @dm and @dmReady
            @dm.load(data.id)
            @dm.seek(data.currentTime)
        else if @dm
            # TODO: Player::load() needs to be made asynchronous in the future
            console.log('Warning: load() called before DM is ready, queueing callback')
            @playbackReadyCb = () =>
                @dm.load(data.id)
                @dm.seek(data.currentTime)
        else
            console.error('WTF?  DailymotionPlayer::load() called but @dm is undefined')

    pause: ->
        if @dm and @dmReady
            @paused = true
            @dm.pause()

    play: ->
        if @dm and @dmReady
            @paused = false
            @dm.play()

    seekTo: (time) ->
        if @dm and @dmReady
            @dm.seek(time)

    setVolume: (volume) ->
        if @dm and @dmReady
            @dm.setVolume(volume)

    getTime: (cb) ->
        if @dm and @dmReady
            cb(@dm.currentTime)
        else
            cb(0)

    getVolume: (cb) ->
        if @dm and @dmReady
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

    destroy: ->
        if @dm
            @dm.destroy('ytapiplayer')
