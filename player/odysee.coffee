window.OdyseePlayer = class OdyseePlayer extends PlayerJSPlayer
    constructor: (data) ->
        if not (this instanceof OdyseePlayer)
            return new OdyseePlayer(data)

        super(data)

    load: (data) ->
        @ready = false
        @setMediaProperties(data)

        waitUntilDefined(window, 'playerjs', =>
            iframe = $('<iframe/>')
                    .attr(
                        src: data.meta.embed.src
                        allow: 'autoplay; fullscreen'
                    )

            removeOld(iframe)
            @setupPlayer(iframe[0], data)
        )
