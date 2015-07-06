window.SoundCloudPlayer = class SoundCloudPlayer extends Player
    constructor: (data) ->
        if not (this instanceof SoundCloudPlayer)
            return new SoundCloudPlayer(data)

        @setMediaProperties(data)

        waitUntilDefined(window, 'SC', =>
            removeOld()

            # For tracks that are private, but embeddable, the API returns a
            # special URL to load into the player.
            # TODO: rename scuri?
            if data.meta.scuri
                soundUrl = data.meta.scuri
            else
                soundUrl = data.id

            widget = $('<iframe/>').appendTo($('#ytapiplayer'))
            widget.attr(
                id: 'scplayer'
                src: "https://w.soundcloud.com/player/?url=#{soundUrl}"
            )

            # Soundcloud embed widget doesn't have a volume control.
            volumeSlider = $('<div/>').attr('id', 'widget-volume')
                .css('top', '170px')
                .insertAfter(widget)
                .slider(
                    range: 'min'
                    value: VOLUME * 100
                    stop: (event, ui) =>
                        @setVolume(ui.value / 100)
                )

            @soundcloud = SC.Widget(widget[0])
            @soundcloud.bind(SC.Widget.Events.READY, =>
                @soundcloud.ready = true
                @setVolume(VOLUME)
                @play()

                @soundcloud.bind(SC.Widget.Events.PAUSE, =>
                    @paused = true
                    if CLIENT.leader
                        sendVideoUpdate()
                )
                @soundcloud.bind(SC.Widget.Events.PLAY, =>
                    @paused = false
                    if CLIENT.leader
                        sendVideoUpdate()
                )
                @soundcloud.bind(SC.Widget.Events.FINISH, =>
                    if CLIENT.leader
                        socket.emit('playNext')
                )
            )
        )

    load: (data) ->
        @setMediaProperties(data)
        if @soundcloud and @soundcloud.ready
            if data.meta.scuri
                soundUrl = data.meta.scuri
            else
                soundUrl = data.id
            @soundcloud.load(soundUrl, auto_play: true)
        else
            console.error('SoundCloudPlayer::load() called but soundcloud is not ready')

    play: ->
        @paused = false
        if @soundcloud and @soundcloud.ready
            @soundcloud.play()

    pause: ->
        @paused = true
        if @soundcloud and @soundcloud.ready
            @soundcloud.pause()

    seekTo: (time) ->
        if @soundcloud and @soundcloud.ready
            # SoundCloud measures time in milliseconds while CyTube uses seconds.
            @soundcloud.seekTo(time * 1000)

    setVolume: (volume) ->
        # NOTE: SoundCloud's documentation claims that setVolume() accepts
        # volumes in the range [0, 100], however it *actually* accepts volumes
        # in the range [0, 1] (anything larger than 1 is treated as 1).  I
        # emailed them about this 2 years ago and they still haven't fixed
        # their documentation.
        if @soundcloud and @soundcloud.ready
            @soundcloud.setVolume(volume)

    getTime: (cb) ->
        if @soundcloud and @soundcloud.ready
            # Returned time is in milliseconds; CyTube expects seconds
            @soundcloud.getPosition((time) -> cb(time / 1000))
        else
            cb(0)

    getVolume: (cb) ->
        if @soundcloud and @soundcloud.ready
            @soundcloud.getVolume(cb)
        else
            cb(VOLUME)
