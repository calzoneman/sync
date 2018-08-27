window.MixerPlayer = class MixerPlayer extends EmbedPlayer
    constructor: (data) ->
        if not (this instanceof MixerPlayer)
            return new MixerPlayer(data)

        @load(data)

    load: (data) ->
        data.meta.embed =
            src: "https://mixer.com/embed/player/#{data.meta.mixer.channelToken}"
            tag: 'iframe'
        super(data)
