window.IframeChild = class IframeChild extends PlayerJSPlayer
    constructor: (data) ->
        if not (this instanceof IframeChild)
            return new IframeChild(data)

        super(data)

    load: (data) ->
        @setMediaProperties(data)
        @ready = false

        waitUntilDefined(window, 'playerjs', =>
            iframe = $('<iframe/>')
                    .attr(
                        src: '/iframe'
                        allow: 'autoplay; fullscreen'
                    )

            removeOld(iframe)
            @setupFrame(iframe[0], data)
            @setupPlayer(iframe[0])
        )

    setupFrame: (iframe, data) ->
        iframe.addEventListener('load', =>
            iframe.contentWindow.VOLUME = VOLUME;
            iframe.contentWindow.loadMediaPlayer(Object.assign({}, data, { type: 'cm' } ))
            iframe.contentWindow.document.querySelector('#ytapiplayer').classList.add('vjs-16-9')
            adapter = iframe.contentWindow.playerjs.VideoJSAdapter(iframe.contentWindow.PLAYER.player)
            adapter.ready()
            typeof data?.meta?.thumbnail == 'string' and iframe.contentWindow.PLAYER.player.poster(data.meta.thumbnail)
        )
