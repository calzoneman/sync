window.Player = class Player
    constructor: (data) ->
        if not (this instanceof Player)
            return new Player(data)

        @setMediaProperties(data)
        @paused = false
        @playbackRate = 1

    load: (data) ->
        @setMediaProperties(data)

    setMediaProperties: (data) ->
        @mediaId = data.id
        @mediaType = data.type
        @mediaLength = data.seconds

    play: ->
        @paused = false

    pause: ->
        @paused = true

    seekTo: (time) ->

    setVolume: (volume) ->

    # Override in players whose embed API exposes rate control (#941).
    supportsPlaybackRate: ->
        false

    setPlaybackRate: (rate) ->
        @playbackRate = rate

    getPlaybackRate: (cb) ->
        cb(@playbackRate or 1)

    getTime: (cb) ->
        cb(0)

    isPaused: (cb) ->
        cb(@paused)

    getVolume: (cb) ->
        cb(VOLUME)

    destroy: ->
