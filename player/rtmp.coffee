window.rtmpEventHandler = (id, event, data) ->
    if event == 'volumechange'
        PLAYER.volume = if data.muted then 0 else data.volume

window.RTMPPlayer = class RTMPPlayer extends EmbedPlayer
    constructor: (data) ->
        if not (this instanceof RTMPPlayer)
            return new RTMPPlayer(data)

        @volume = VOLUME
        @load(data)

    load: (data) ->
        data.meta.embed =
            tag: 'object'
            src: 'https://fpdownload.adobe.com/strobe/FlashMediaPlayback_101.swf'
            params:
                flashvars: "src=#{data.id}&\
                    streamType=live&\
                    javascriptCallbackFunction=rtmpEventHandler&\
                    autoPlay=true&\
                    volume=#{VOLUME}"
        super(data)

    getVolume: (cb) ->
        cb(@volume)
