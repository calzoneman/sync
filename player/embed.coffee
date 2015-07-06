DEFAULT_ERROR = 'You are currently connected via HTTPS but the embedded content
    uses non-secure plain HTTP.  Your browser therefore blocks it from
    loading due to mixed content policy.  To fix this, embed the video using a
    secure link if available (https://...), or load this page over plain HTTP by
    replacing "https://" with "http://" in the address bar (your websocket will
    still be secured using HTTPS, but this will permit non-secure content to load).'

genParam = (name, value) ->
    $('<param/>').attr(
        name: name
        value: value
    )

window.EmbedPlayer = class EmbedPlayer extends Player
    constructor: (data) ->
        if not (this instanceof EmbedPlayer)
            return new EmbedPlayer(data)

        @load(data)

    load: (data) ->
        @setMediaProperties(data)

        embed = data.meta.embed
        if not embed?
            console.error('EmbedPlayer::load(): missing meta.embed')
            return

        if embed.tag == 'object'
            @player = @loadObject(embed)
        else
            @player = @loadIframe(embed)

        removeOld(@player)

    loadObject: (embed) ->
        object = $('<object/>').attr(
            type: 'application/x-shockwave-flash'
            data: embed.src
        )
        genParam('allowfullscreen', 'true').appendTo(object)
        genParam('allowscriptaccess', 'always').appendTo(object)

        for key, value of embed.params
            genParam(key, value).appendTo(object)

        return object

    loadIframe: (embed) ->
        if embed.src.indexOf('http:') == 0 and location.protocol == 'https:'
            if @__proto__.mixedContentError?
                error = @__proto__.mixedContentError
            else
                error = DEFAULT_ERROR
            alert = makeAlert('Mixed Content Error', error, 'alert-danger')
                .removeClass('col-md-12')
            alert.find('.close').remove()
            return alert
        else
            iframe = $('<iframe/>').attr(
                src: embed.src
                frameborder: '0'
            )

            return iframe
