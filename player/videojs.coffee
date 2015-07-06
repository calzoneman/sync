sortSources = (sources) ->
    if not sources
        console.error('sortSources() called with null source list')
        return []

    qualities = ['1080', '720', '480', '360', '240']
    pref = String(USEROPTS.default_quality)
    idx = qualities.indexOf(pref)
    if idx < 0
        pref = '480'

    qualityOrder = qualities.slice(idx).concat(qualities.slice(0, idx))
    sourceOrder = []
    flvOrder = []
    for quality in qualityOrder
        if quality of sources
            flv = []
            nonflv = []
            sources[quality].forEach((source) ->
                source.quality = quality
                if source.contentType == 'video/flv'
                    flv.push(source)
                else
                    nonflv.push(source)
            )
            sourceOrder = sourceOrder.concat(nonflv)
            flvOrder = flvOrder.concat(flv)

    return sourceOrder.concat(flvOrder).map((source) ->
        type: source.contentType
        src: source.link
        quality: source.quality
    )

waitUntilDefined(window, 'videojs', =>
    videojs.options.flash.swf = '/video-js.swf'
)

window.VideoJSPlayer = class VideoJSPlayer extends Player
    constructor: (data) ->
        if not (this instanceof VideoJSPlayer)
            return new VideoJSPlayer(data)

        @setMediaProperties(data)
        @loadPlayer(data)

    loadPlayer: (data) ->
        waitUntilDefined(window, 'videojs', =>
            video = $('<video/>')
                .addClass('video-js vjs-default-skin embed-responsive-item')
                .attr(width: '100%', height: '100%')
            removeOld(video)

            sources = sortSources(data.meta.direct)
            if sources.length == 0
                console.error('VideoJSPlayer::constructor(): data.meta.direct
                               has no sources!')
                @mediaType = null
                return

            sources.forEach((source) ->
                $('<source/>').attr(
                    src: source.src
                    type: source.type
                    'data-quality': source.quality
                ).appendTo(video)
            )

            @player = videojs(video[0], autoplay: true, controls: true)
            @player.ready(=>
                @setVolume(VOLUME)
                @player.on('ended', ->
                    if CLIENT.leader
                        socket.emit('playNext')
                )

                @player.on('pause', =>
                    @paused = true
                    if CLIENT.leader
                        sendVideoUpdate()
                )

                @player.on('play', =>
                    @paused = false
                    if CLIENT.leader
                        sendVideoUpdate()
                )

                # Workaround for IE-- even after seeking completes, the loading
                # spinner remains.
                @player.on('seeked', =>
                    $('.vjs-waiting').removeClass('vjs-waiting')
                )
            )
        )

    load: (data) ->
        @setMediaProperties(data)
        # Note: VideoJS does have facilities for loading new videos into the
        # existing player object, however it appears to be pretty glitchy when
        # a video can't be played (either previous or next video).  It's safer
        # to just reset the entire thing.
        @loadPlayer(data)

    play: ->
        @paused = false
        if @player and @player.readyState() > 0
            @player.play()

    pause: ->
        @paused = true
        if @player and @player.readyState() > 0
            @player.pause()

    seekTo: (time) ->
        if @player and @player.readyState() > 0
            @player.currentTime(time)

    setVolume: (volume) ->
        if @player
            @player.volume(volume)

    getTime: (cb) ->
        if @player and @player.readyState() > 0
            cb(@player.currentTime())
        else
            cb(0)

    getVolume: (cb) ->
        if @player and @player.readyState() > 0
            if @player.muted()
                cb(0)
            else
                cb(@player.volume())
        else
            cb(VOLUME)
