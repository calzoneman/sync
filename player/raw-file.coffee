guessMimeTypeBecauseBrowsersAreDumb = (link) ->
    m = /.*\.([a-zA-Z0-9]+)[^.]*$/.exec(link)
    if m
        return m[1]
    else
        # Couldn't guess mime type; give up and hope flash can play it
        return 'flv'

window.FilePlayer = class FilePlayer extends VideoJSPlayer
    constructor: (data) ->
        if not (this instanceof FilePlayer)
            return new FilePlayer(data)

        data.meta.direct =
            480: [{
                contentType: guessMimeTypeBecauseBrowsersAreDumb(data.id)
                link: data.id
            }]
        super(data)

    load: (data) ->
        data.meta.direct =
            480: [{
                contentType: guessMimeTypeBecauseBrowsersAreDumb(data.id)
                link: data.id
            }]
        super(data)
