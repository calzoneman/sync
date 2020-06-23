window.TwitchClipPlayer = class TwitchClipPlayer extends EmbedPlayer
    constructor: (data) ->
        if not (this instanceof TwitchClipPlayer)
            return new TwitchClipPlayer(data)

        @load(data)

    load: (data) ->
        if location.hostname != location.host or location.protocol != 'https:'
            alert = makeAlert(
                'Twitch API Parameters',
                window.TWITCH_PARAMS_ERROR,
                'alert-danger'
            ).removeClass('col-md-12')
            removeOld(alert)
            return

        data.meta.embed =
            tag: 'iframe'
            src: "https://clips.twitch.tv/embed?clip=#{data.id}&parent=#{location.host}"
        super(data)
