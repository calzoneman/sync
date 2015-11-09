window.rtmpEventHandler = (id, event, data) ->
    if event == 'volumechange'
        PLAYER.volume = if data.muted then 0 else data.volume

window.RTMPPlayer = class RTMPPlayer extends VideoJSPlayer
    constructor: (data) ->
        if not (this instanceof RTMPPlayer)
            return new RTMPPlayer(data)

        data.meta.direct =
            # Quality is required for data.meta.direct processing but doesn't
            # matter here because it's dictated by the stream.  Arbitrarily
            # choose 480.
            480: [
                {
                    link: data.id
                }
            ]

        super(data)
