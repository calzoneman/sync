class YouTubePlayer extends Player
    constructor: (data) ->
        super()
        waitUntilDefined(window, 'YT', =>
            removeOld()

            wmode = if USEROPTS.wmode_transparent then 'transparent' else 'opaque'
            @yt = new YT.Player('ytapiplayer',
                videoId: data.id
                playerVars:
                    autohide: 1
                    autoplay: 1
                    controls: 1
                    iv_load_policy: 3
                    rel: 0
                    wmode: wmode
                events:
                    onReady: @onReady.bind(this)
                    onStateChange: @onStateChange.bind(this)
            )
        )

    onReady: ->
        @yt.setVolume(VOLUME)

    onStateChange: (ev) ->

