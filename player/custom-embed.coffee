genParam = (name, value) ->
    $('<param/>').attr(
        name: name
        value: value
    )

window.CustomEmbedPlayer = class CustomEmbedPlayer extends Player
    constructor: (data) ->
        if not (this instanceof CustomEmbedPlayer)
            return new CustomEmbedPlayer(data)

        @load(data)

    load: (data) ->
        embed = data.meta.embed
        if not embed?
            console.error('CustomEmbedPlayer::load(): missing meta.embed')
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
        iframe = $('<iframe/>').attr(
            src: embed.src
            frameborder: '0'
        )

        return iframe
