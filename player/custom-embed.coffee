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

        link = document.createElement('a')
        link.href = embedSrc
        link.target = '_blank'
        link.rel = 'noopener noreferer'

        strong = document.createElement('strong')
        strong.textContent = embedSrc
        link.appendChild(strong)

        # TODO: Ideally makeAlert() would allow optionally providing a DOM
        # element instead of requiring HTML text
        alert = makeAlert('Untrusted Content', CUSTOM_EMBED_WARNING.replace('%link%', link.outerHTML),
            'alert-warning')
            .removeClass('col-md-12')
        $('<button/>').addClass('btn btn-default')
            .text('Embed')
            .on('click', =>
                super(data)
            )
            .appendTo(alert.find('.alert'))
        removeOld(alert)
