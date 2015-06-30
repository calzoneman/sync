CUSTOM_EMBED_WARNING = 'This channel is embedding custom content from %link%.
    Since this content is not trusted, you must click "Embed" below to allow
    the content to be embedded.<hr>'

window.CustomEmbedPlayer = class CustomEmbedPlayer extends EmbedPlayer
    constructor: (data) ->
        if not (this instanceof CustomEmbedPlayer)
            return new CustomEmbedPlayer(data)

        @load(data)

    load: (data) ->
        if not data.meta.embed?
            console.error('CustomEmbedPlayer::load(): missing meta.embed')
            return

        embedSrc = data.meta.embed.src
        link = "<a href=\"#{embedSrc}\" target=\"_blank\"><strong>#{embedSrc}</strong></a>"
        alert = makeAlert('Untrusted Content', CUSTOM_EMBED_WARNING.replace('%link%', link),
            'alert-warning')
            .removeClass('col-md-12')
        $('<button/>').addClass('btn btn-default')
            .text('Embed')
            .click(=>
                super(data)
            )
            .appendTo(alert.find('.alert'))
        removeOld(alert)
