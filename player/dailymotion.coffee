window.DailymotionPlayer = class DailymotionPlayer extends Player
    constructor: (data) ->
        if not (this instanceof DailymotionPlayer)
            return new DailymotionPlayer(data)

        @setMediaProperties(data)
        @initialVolumeSet = false
        @playbackReadyCb = null
        @dm = null
        @dmReady = false

        waitUntilDefined(window, 'dailymotion', =>
            # createPlayer is attached asynchronously after the library finishes
            # bootstrapping; onScriptLoaded is a user callback hook, not a Promise API.
            waitUntilDefined(dailymotion, 'createPlayer', =>
                removeOld()

                dailymotion.createPlayer('ytapiplayer', {
                    video: data.id
                    params:
                        autoplay: true
                }).then((player) =>
                    @dm = player
                    @dmReady = true
                    @bindDmEvents()

                    quality = @mapQuality(USEROPTS.default_quality)
                    if quality isnt 'default' and typeof @dm.setQuality is 'function'
                        @dm.setQuality(quality)

                    if not @initialVolumeSet
                        @setVolume(VOLUME)
                        @initialVolumeSet = true

                    if @playbackReadyCb
                        cb = @playbackReadyCb
                        @playbackReadyCb = null
                        cb()
                ).catch((err) ->
                    console.error('Dailymotion createPlayer failed:', err)
                )
            )
        )

    bindDmEvents: ->
        if not @dm
            return

        @dm.on(dailymotion.events.VIDEO_END, =>
            # After a video ends the player can briefly reject load/seek until
            # the next critical-path-ready signal.  Mirror the previous workaround.
            @dmReady = false
            if CLIENT.leader
                socket.emit('playNext')
        )

        @dm.on(dailymotion.events.VIDEO_PAUSE, =>
            @paused = true
            if CLIENT.leader
                sendVideoUpdate()
        )

        @dm.on(dailymotion.events.VIDEO_PLAYING, =>
            @paused = false
            if CLIENT.leader
                sendVideoUpdate()

            if not @initialVolumeSet
                @setVolume(VOLUME)
                @initialVolumeSet = true
        )

        @dm.on(dailymotion.events.PLAYER_CRITICALPATHREADY, =>
            @dmReady = true
            if @playbackReadyCb
                cb = @playbackReadyCb
                @playbackReadyCb = null
                cb()
        )

        # Gear-menu speed changes (and API setPlaybackSpeed) — sync for leaders (#941)
        if dailymotion.events.PLAYER_PLAYBACKSPEEDCHANGE
            @dm.on(dailymotion.events.PLAYER_PLAYBACKSPEEDCHANGE, =>
                if CLIENT.leader
                    sendVideoUpdateThrottled()
            )

    load: (data) ->
        @setMediaProperties(data)
        if @dm and @dmReady
            seekTo = data.currentTime
            @dm.loadContent({ video: data.id })
            if seekTo > 0
                @dm.on(dailymotion.events.PLAYER_CRITICALPATHREADY, =>
                    @dm.seek(seekTo)
                , { once: true })
        else if @dm
            console.log('Warning: load() called before Dailymotion is ready, queueing callback')
            @playbackReadyCb = =>
                @load(data)
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

    supportsPlaybackRate: ->
        true

    # Dailymotion Web SDK: setPlaybackSpeed([0.25..2]); values above that clamp in-SDK.
    # Speed persists across loadContent() videos — always re-apply on media change.
    setPlaybackRate: (rate) ->
        @playbackRate = rate
        if @dm and @dmReady and typeof @dm.setPlaybackSpeed == 'function'
            @dm.setPlaybackSpeed(rate)

    getPlaybackRate: (cb) ->
        if @dm and @dmReady
            @dm.getState().then((state) ->
                cb(state.playerPlaybackSpeed ? 1)
            ).catch(=>
                cb(@playbackRate or 1)
            )
        else
            cb(@playbackRate or 1)

    getTime: (cb) ->
        if @dm and @dmReady
            @dm.getState().then((state) ->
                cb(state.videoTime or 0)
            ).catch(->
                cb(0)
            )
        else
            cb(0)

    getVolume: (cb) ->
        if @dm and @dmReady
            @dm.getState().then((state) ->
                if state.playerIsMuted
                    cb(0)
                else
                    volume = state.playerVolume
                    # Guard against historically wrong volume ranges
                    if volume > 1
                        volume /= 100
                    cb(volume ? VOLUME)
            ).catch(->
                cb(VOLUME)
            )
        else
            cb(VOLUME)

    mapQuality: (quality) ->
        switch String(quality)
            when '240', '480', '720', '1080' then String(quality)
            when '360' then '380'
            when 'best' then '1080'
            else 'default'

    destroy: ->
        if @dm
            try
                if typeof @dm.destroy is 'function'
                    @dm.destroy()
                else if typeof dailymotion isnt 'undefined' and typeof dailymotion.destroy is 'function'
                    dailymotion.destroy('ytapiplayer')
            catch e
                console.error e
            @dm = null
            @dmReady = false
