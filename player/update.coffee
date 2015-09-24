TYPE_MAP =
    yt: YouTubePlayer
    vi: VimeoPlayer
    dm: DailymotionPlayer
    gd: GoogleDriveYouTubePlayer
    gp: VideoJSPlayer
    fi: FilePlayer
    jw: FilePlayer
    sc: SoundCloudPlayer
    li: LivestreamPlayer
    tw: TwitchPlayer
    cu: CustomEmbedPlayer
    rt: RTMPPlayer
    hb: HitboxPlayer
    us: UstreamPlayer
    im: ImgurPlayer

window.loadMediaPlayer = (data) ->
    if data.meta.direct and data.type != 'gd'
        try
            window.PLAYER = new VideoJSPlayer(data)
        catch e
            console.error e
    else if data.type of TYPE_MAP
        try
            window.PLAYER = TYPE_MAP[data.type](data)
        catch e
            console.error e

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
        PLAYER.seekTo(0)
        # YouTube player has a race condition that crashes the player if
        # play(), seek(0), and pause() are called quickly without waiting
        # for events to fire.  Setting a flag variable that is checked in the
        # event handler mitigates this.
        if PLAYER instanceof YouTubePlayer
            PLAYER.pauseSeekRaceCondition = true
        else
            PLAYER.pause()
        return
    else if PLAYER instanceof YouTubePlayer
        PLAYER.pauseSeekRaceCondition = false

    if CLIENT.leader or not USEROPTS.synch
        return

    if data.paused and not PLAYER.paused
        PLAYER.seekTo(data.currentTime)
        PLAYER.pause()
    else if PLAYER.paused and not data.paused
        PLAYER.play()

    PLAYER.getTime((seconds) ->
        time = data.currentTime
        diff = (time - seconds) or time
        accuracy = USEROPTS.sync_accuracy

        # Dailymotion can't seek very accurately in Flash due to keyframe
        # placement.  Accuracy should not be set lower than 5 or the video
        # may be very choppy.
        if PLAYER instanceof DailymotionPlayer
            accuracy = Math.max(accuracy, 5)

        if diff > accuracy
            # The player is behind the correct time
            PLAYER.seekTo(time)
        else if diff < -accuracy
            # The player is ahead of the correct time
            # Don't seek all the way back, to account for possible buffering.
            # However, do seek all the way back for Dailymotion due to the
            # keyframe issue mentioned above.
            if not (PLAYER instanceof DailymotionPlayer)
                time += 1
            PLAYER.seekTo(time)
    )

window.removeOld = (replace) ->
    $('#sc_volume').remove()
    replace ?= $('<div/>').addClass('embed-responsive-item')
    old = $('#ytapiplayer')
    replace.insertBefore(old)
    old.remove()
    replace.attr('id', 'ytapiplayer')
    return replace
