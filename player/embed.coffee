DEFAULT_ERROR = 'You are currently connected via HTTPS but the embedded content
    uses non-secure plain HTTP.  Your browser therefore blocks it from
    loading due to mixed content policy.  To fix this, embed the video using a
    secure link if available (https://...), or find another source for the content.'

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

        @player = @loadIframe(embed)

        removeOld(@player)

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
                allow: 'autoplay'
                allowfullscreen: '1'
            )

            return iframe
