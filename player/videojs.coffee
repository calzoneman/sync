class VideoJSPlayer extends Player
    constructor: (data) ->

    load: (data) ->
        video = $('<video/>')
            .addClass('video-js vjs-default-skin embed-responsive-item')
