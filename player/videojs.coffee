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
                if source.contentType == 'flv'
                    flv.push(source)
                else
                    nonflv.push(source)
            )
            sourceOrder = sourceOrder.concat(nonflv)
            flvOrder = flvOrder.concat(flv)

    return sourceOrder.concat(flvOrder).map((source) ->
        type: "video/#{source.contentType}"
        src: source.link
        quality: source.quality
    )

window.VideoJSPlayer = class VideoJSPlayer extends Player
    constructor: (data) ->
        if not (this instanceof VideoJSPlayer)
            return new VideoJSPlayer(data)

        @setMediaProperties(data)

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
            )
        )

    load: (data) ->
        @setMediaProperties(data)
        if @player
            @player.src(sortSources(data.meta.direct))
        else
            console.log('VideoJSPlayer::load() called but @player is undefined')

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
        if @player and @player.readyState() > 0
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
