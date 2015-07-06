window.Player = class Player
    constructor: (data) ->
        if not (this instanceof Player)
            return new Player(data)

        @setMediaProperties(data)
        @paused = false

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

    getTime: (cb) ->
        cb(0)

    isPaused: (cb) ->
        cb(@paused)

    getVolume: (cb) ->
        cb(VOLUME)
