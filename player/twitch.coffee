window.TWITCH_PARAMS_ERROR = 'The Twitch embed player now uses parameters which only
work if the following requirements are met: (1) The embedding website uses
HTTPS; (2) The embedding website uses the default port (443) and is accessed
via https://example.com instead of https://example.com:port.  I have no
control over this -- see <a href="https://discuss.dev.twitch.tv/t/twitch-embedded-player-migration-timeline-update/25588" rel="noopener noreferrer" target="_blank">this Twitch post</a>
for details'

window.TwitchPlayer = class TwitchPlayer extends Player
    constructor: (data) ->
        if not (this instanceof TwitchPlayer)
            return new TwitchPlayer(data)

        @setMediaProperties(data)
        waitUntilDefined(window, 'Twitch', =>
            waitUntilDefined(Twitch, 'Player', =>
                @init(data)
            )
        )

    init: (data) ->
        removeOld()

        if location.hostname != location.host or location.protocol != 'https:'
            alert = makeAlert(
                'Twitch API Parameters',
                window.TWITCH_PARAMS_ERROR,
                'alert-danger'
            ).removeClass('col-md-12')
            removeOld(alert)
            @twitch = null
            return

        options =
            parent: [location.hostname]
            width: $('#ytapiplayer').width()
            height: $('#ytapiplayer').height()

        if data.type is 'tv'
            # VOD
            options.video = data.id
        else
            # Livestream
            options.channel = data.id

        @twitch = new Twitch.Player('ytapiplayer', options)
        @twitch.addEventListener(Twitch.Player.READY, =>
            @setVolume(VOLUME)
            @twitch.setQuality(@mapQuality(USEROPTS.default_quality))
            @twitch.addEventListener(Twitch.Player.PLAY, =>
                @paused = false
                if CLIENT.leader
                    sendVideoUpdate()
            )
            @twitch.addEventListener(Twitch.Player.PAUSE, =>
                @paused = true
                if CLIENT.leader
                    sendVideoUpdate()
            )
            @twitch.addEventListener(Twitch.Player.ENDED, =>
                if CLIENT.leader
                    socket.emit('playNext')
            )
        )

    load: (data) ->
        @setMediaProperties(data)
        try
            if data.type is 'tv'
                # VOD
                @twitch.setVideo(data.id)
            else
                # Livestream
                @twitch.setChannel(data.id)
        catch error
            console.error(error)

    pause: ->
        try
            @twitch.pause()
            @paused = true
        catch error
            console.error(error)

    play: ->
        try
            @twitch.play()
            @paused = false
        catch error
            console.error(error)

    seekTo: (time) ->
        try
            @twitch.seek(time)
        catch error
            console.error(error)

    getTime: (cb) ->
        try
            cb(@twitch.getCurrentTime())
        catch error
            console.error(error)

    setVolume: (volume) ->
        try
            @twitch.setVolume(volume)
            if volume > 0
                @twitch.setMuted(false)
        catch error
            console.error(error)

    getVolume: (cb) ->
        try
            if @twitch.isPaused()
                cb(0)
            else
                cb(@twitch.getVolume())
        catch error
            console.error(error)

    mapQuality: (quality) ->
        switch String(quality)
            when '1080' then 'chunked'
            when '720' then 'high'
            when '480' then 'medium'
            when '360' then 'low'
            when '240' then 'mobile'
            when 'best' then 'chunked'
            else ''
