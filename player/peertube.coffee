PEERTUBE_EMBED_WARNING = 'This channel is embedding PeerTube content from %link%.
    PeerTube instances may use P2P technology that will expose your IP address to third parties, including but not
    limited to other users in this channel. It is also conceivable that if the content in question is in violation of
    copyright laws your IP address could be potentially be observed by legal authorities monitoring the tracker of
    this PeerTube instance. The operators of %site% are not responsible for the data sent by the embedded player to
    third parties on your behalf.<br><br> If you understand the risks, wish to assume all liability, and continue to
    the content, click "Embed" below to allow the content to be embedded.<hr>'

PEERTUBE_RISK = false

window.PeerPlayer = class PeerPlayer extends Player
    constructor: (data) ->
        if not (this instanceof PeerPlayer)
            return new PeerPlayer(data)

        @warn(data)

    warn: (data) ->
        if USEROPTS.peertube_risk or PEERTUBE_RISK
            return @load(data)

        site = new URL(document.URL).hostname
        embedSrc = data.meta.embed.domain
        link = "<a href=\"http://#{embedSrc}\" target=\"_blank\"><strong>#{embedSrc}</strong></a>"
        alert = makeAlert('Privacy Advisory', PEERTUBE_EMBED_WARNING.replace('%link%', link).replace('%site%', site),
            'alert-warning')
            .removeClass('col-md-12')
        $('<button/>').addClass('btn btn-default')
            .text('Embed')
            .on('click', =>
                @load(data)
            )
            .appendTo(alert.find('.alert'))
        $('<button/>').addClass('btn btn-default pull-right')
            .text('Embed and dont ask again for this session')
            .on('click', =>
                PEERTUBE_RISK = true
                @load(data)
            )
            .appendTo(alert.find('.alert'))
        removeOld(alert)

    load: (data) ->
        @setMediaProperties(data)

        waitUntilDefined(window, 'PeerTubePlayer', =>
            video = $('<iframe/>')
            removeOld(video)
            video.attr(
                src: "https://#{data.meta.embed.domain}/videos/embed/#{data.meta.embed.uuid}?api=1"
                allow: 'autoplay; fullscreen'
            )

            @peertube = new PeerTubePlayer(video[0])

            @peertube.addEventListener('playbackStatusChange', (status) =>
                @paused = status == 'paused'
                if CLIENT.leader
                    sendVideoUpdate()
            )

            @peertube.addEventListener('playbackStatusUpdate', (status) =>
                @peertube.currentTime = status.position

                if status.playbackState == "ended" and CLIENT.leader
                    socket.emit('playNext')
            )

            @peertube.addEventListener('volumeChange', (volume) =>
                VOLUME = volume
                setOpt("volume", VOLUME)
            )

            @play()
            @setVolume(VOLUME)
        )

    play: ->
        @paused = false
        if @peertube and @peertube.ready
            @peertube.play().catch((error) ->
                console.error('PeerTube::play():', error)
            )

    pause: ->
        @paused = true
        if @peertube and @peertube.ready
            @peertube.pause().catch((error) ->
                console.error('PeerTube::pause():', error)
            )

    seekTo: (time) ->
        if @peertube and @peertube.ready
            @peertube.seek(time)

    getVolume: (cb) ->
        if @peertube and @peertube.ready
            @peertube.getVolume().then((volume) ->
                cb(parseFloat(volume))
            ).catch((error) ->
                console.error('PeerTube::getVolume():', error)
            )
        else
            cb(VOLUME)

    setVolume: (volume) ->
        if @peertube and @peertube.ready
            @peertube.setVolume(volume).catch((error) ->
                console.error('PeerTube::setVolume():', error)
            )

    getTime: (cb) ->
        if @peertube and @peertube.ready
            cb(@peertube.currentTime)
        else
            cb(0)

    setQuality: (quality) ->
        # USEROPTS.default_quality
        # @peertube.getResolutions()
        # @peertube.setResolution(resolutionId : number)

