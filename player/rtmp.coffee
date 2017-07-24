window.RTMPPlayer = class RTMPPlayer extends VideoJSPlayer
    constructor: (data) ->
        if not (this instanceof RTMPPlayer)
            return new RTMPPlayer(data)

        @setupMeta(data)
        super(data)

    load: (data) ->
        @setupMeta(data)
        super(data)

    setupMeta: (data) ->
        data.meta.direct =
            # Quality is required for data.meta.direct processing but doesn't
            # matter here because it's dictated by the stream.  Arbitrarily
            # choose 480.
            480: [
                {
                    link: data.id
                    contentType: 'rtmp/flv'
                }
            ]
