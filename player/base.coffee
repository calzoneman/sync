class Player
    constructor: (data) ->
        @setMediaProperties(data)
        @paused = false

    load: (data) ->
        @setMediaProperties(data)

    setMediaProperties: (data) ->
        @mediaId = data.id
        @mediaType = data.type
        @mediaLength = data.seconds

    play: ->
        @paused = false

    pause: ->
        @paused = true

    seekTo: (time) ->

    setVolume: (volume) ->

    getTime: (cb) ->
        cb(0)

    isPaused: (cb) ->
        cb(@paused)

    getVolume: (cb) ->
        cb(VOLUME)

window.Player = Player

window.removeOld = (replace) ->
    $('#sc_volume').remove()
    replace ?= $('<div/>').addClass('embed-responsive-item')
    old = $('#ytapiplayer')
    replace.insertBefore(old)
    old.remove()
    replace.attr('id', 'ytapiplayer')
    return replace

TYPE_MAP =
    yt: 'YouTubePlayer'

window.loadMediaPlayer = (data) ->
    if data.type of TYPE_MAP
        ctor = window[TYPE_MAP[data.type]]
        window.PLAYER = new ctor(data)

window.handleMediaUpdate = (data) ->
    PLAYER = window.PLAYER

    # Do not update if the current time is past the end of the video, unless
    # the video has length 0 (which is a special case for livestreams)
    if typeof PLAYER.mediaLength is 'number' and
            PLAYER.mediaLength > 0 and
            data.currentTime > PLAYER.mediaLength
        return

    # Negative currentTime indicates a lead-in for clients to load the video,
    # but not play it yet (helps with initial buffering)
    waiting = data.currentTime < 0

    # Load a new video in the same player if the ID changed
    if data.id and data.id != PLAYER.mediaId
        if data.currentTime < 0
            data.currentTime = 0
        PLAYER.load(data)
        PLAYER.play()

    if waiting
        console.log('waiting')
        # YouTube player has a race condition that crashes the player if
        # play(), seek(0), and pause() are called quickly without waiting
        # for events to fire.  Setting a flag variable that is checked in the
        # event handler mitigates this.
        if PLAYER.type is 'yt'
            PLAYER.pauseSeekRaceCondition = true
        else
            PLAYER.seekTo(0)
            PLAYER.pause()
    else if PLAYER.type is 'yt'
        PLAYER.pauseSeekRaceCondition = false

    if CLIENT.leader or not USEROPTS.synch
        return

    if data.paused and not PLAYER.paused
        PLAYER.seekTo(data.currentTime)
        PLAYER.pause()
    else if PLAYER.paused
        PLAYER.play()

    PLAYER.getTime((seconds) ->
        time = data.currentTime
        diff = (time - seconds) or time
        accuracy = USEROPTS.sync_accuracy

        # Dailymotion can't seek very accurately in Flash due to keyframe
        # placement.  Accuracy should not be set lower than 5 or the video
        # may be very choppy.
        if PLAYER.type is 'dm'
            accuracy = Math.max(accuracy, 5)


        if diff > accuracy
            # The player is behind the correct time
            PLAYER.seekTo(time)
        else if diff < -accuracy
            # The player is ahead of the correct time
            # Don't seek all the way back, to account for possible buffering.
            # However, do seek all the way back for Dailymotion due to the
            # keyframe issue mentioned above.
            if PLAYER.type isnt 'dm'
                time += 1
            PLAYER.seekTo(time)
    )
