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
            sliderHolder = $('<div/>').attr('id', 'soundcloud-volume-holder')
                .insertAfter(widget)
            $('<span/>').attr('id', 'soundcloud-volume-label')
                .addClass('label label-default')
                .text('Volume')
                .appendTo(sliderHolder)
            volumeSlider = $('<div/>').attr('id', 'soundcloud-volume')
                .appendTo(sliderHolder)
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
            @soundcloud.bind(SC.Widget.Events.READY, =>
                @setVolume(VOLUME)
            )
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
        if @soundcloud and @soundcloud.ready
            @soundcloud.setVolume(volume * 100)

    getTime: (cb) ->
        if @soundcloud and @soundcloud.ready
            # Returned time is in milliseconds; CyTube expects seconds
            @soundcloud.getPosition((time) -> cb(time / 1000))
        else
            cb(0)

    getVolume: (cb) ->
        if @soundcloud and @soundcloud.ready
            @soundcloud.getVolume((vol) -> cb(vol / 100))
        else
            cb(VOLUME)
