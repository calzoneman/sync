class Player
    constructor: (data) ->
        @load(data)
        @paused = false

    load: (data) ->
        @mediaId = data.id
        @mediaType = data.type

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

window.Player = Player

window.removeOld = (replace) ->
    $('#sc_volume').remove()
    replace ?= $('<div/>').addClass('embed-responsive-item')
    old = $('#ytapiplayer')
    replace.insertBefore(old)
    old.remove()
    replace.attr('id', 'ytapiplayer')
