sortSources = (sources) ->
    if not sources
        console.error('sortSources() called with null source list')
        return []

    qualities = ['2160', '1440', '1080', '720', '540', '480', '360', '240']
    pref = String(USEROPTS.default_quality)
    if USEROPTS.default_quality == 'best'
        pref = '2160'
    idx = qualities.indexOf(pref)
    if idx < 0
        idx = 5 # 480p

    qualityOrder = qualities.slice(idx).concat(qualities.slice(0, idx).reverse())
    qualityOrder.unshift('auto')
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
        res: source.quality
        label: getSourceLabel(source)
    )

getSourceLabel = (source) ->
    if source.res is 'auto'
        return 'auto'
    else
        return "#{source.quality}p #{source.contentType.split('/')[1]}"

waitUntilDefined(window, 'videojs', =>
    videojs.options.flash.swf = '/video-js.swf'
)

hasAnyTextTracks = (data) ->
    ntracks = data?.meta?.textTracks?.length ? 0
    return ntracks > 0

window.VideoJSPlayer = class VideoJSPlayer extends Player
    constructor: (data) ->
        if not (this instanceof VideoJSPlayer)
            return new VideoJSPlayer(data)

        @load(data)

    loadPlayer: (data) ->
        waitUntilDefined(window, 'videojs', =>
            attrs =
                width: '100%'
                height: '100%'

            if @mediaType == 'cm' and hasAnyTextTracks(data)
                attrs.crossorigin = 'anonymous'

            video = $('<video/>')
                .addClass('video-js vjs-default-skin embed-responsive-item')
                .attr(attrs)
            removeOld(video)

            @sources = sortSources(data.meta.direct)
            if @sources.length == 0
                console.error('VideoJSPlayer::constructor(): data.meta.direct
                               has no sources!')
                @mediaType = null
                return

            @sourceIdx = 0

            # TODO: Refactor VideoJSPlayer to use a preLoad()/load()/postLoad() pattern
            # VideoJSPlayer should provide the core functionality and logic for specific
            # dependent player types (gdrive) should be an extension
            if data.meta.gdrive_subtitles
                data.meta.gdrive_subtitles.available.forEach((subt) ->
                    label = subt.lang_original
                    if subt.name
                        label += " (#{subt.name})"
                    $('<track/>').attr(
                        src: "/gdvtt/#{data.id}/#{subt.lang}/#{subt.name}.vtt?\
                                vid=#{data.meta.gdrive_subtitles.vid}"
                        kind: 'subtitles'
                        srclang: subt.lang
                        label: label
                    ).appendTo(video)
                )

            if data.meta.textTracks
                data.meta.textTracks.forEach((track) ->
                    label = track.name
                    attrs =
                        src: track.url
                        kind: 'subtitles'
                        type: track.type
                        label: label

                    if track.default? and track.default
                        attrs.default = ''

                    $('<track/>').attr(attrs).appendTo(video)
                )

            @player = videojs(video[0],
                    # https://github.com/Dash-Industry-Forum/dash.js/issues/2184
                    autoplay: @sources[0].type != 'application/dash+xml',
                    controls: true,
                    plugins:
                        videoJsResolutionSwitcher:
                            default: @sources[0].res
            )
            @player.ready(=>
                # Have to use updateSrc instead of <source> tags
                # see: https://github.com/videojs/video.js/issues/3428
                @player.updateSrc(@sources)
                @player.on('error', =>
                    err = @player.error()
                    if err and err.code == 4
                        console.error('Caught error, trying next source')
                        # Does this really need to be done manually?
                        @sourceIdx++
                        if @sourceIdx < @sources.length
                            @player.src(@sources[@sourceIdx])
                        else
                            console.error('Out of sources, video will not play')
                            if @mediaType is 'gd'
                                if not window.hasDriveUserscript
                                    window.promptToInstallDriveUserscript()
                                else
                                    window.tellUserNotToContactMeAboutThingsThatAreNotSupported()
                )
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

                # Workaround for Chrome-- it seems that the click bindings for
                # the subtitle menu aren't quite set up until after the ready
                # event finishes, so set a timeout for 1ms to force this code
                # not to run until the ready() function returns.
                setTimeout(->
                    $('#ytapiplayer .vjs-subtitles-button .vjs-menu-item').each((i, elem) ->
                        textNode = elem.childNodes[0]
                        if textNode.textContent == localStorage.lastSubtitle
                            elem.click()

                        elem.onclick = ->
                            if elem.attributes['aria-checked'].value == 'true'
                                localStorage.lastSubtitle = textNode.textContent
                    )
                , 1)
            )
        )

    load: (data) ->
        @setMediaProperties(data)
        # Note: VideoJS does have facilities for loading new videos into the
        # existing player object, however it appears to be pretty glitchy when
        # a video can't be played (either previous or next video).  It's safer
        # to just reset the entire thing.
        @destroy()
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

    destroy: ->
        removeOld()
        if @player
            @player.dispose()
