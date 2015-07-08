USTREAM_ERROR = 'Ustream.tv\'s embed player only works over plain HTTP, but you are
    viewing this page over secure HTTPS.  Your browser therefore blocks the
    ustream embed due to mixed content policy.  In order to view ustream, you must
    view this page over plain HTTP (change "https://" to "http://" in the address
    bar)-- your websocket will still be connecting using secure HTTPS.  This is
    something that ustream needs to fix.'

window.UstreamPlayer = class UstreamPlayer extends EmbedPlayer
    constructor: (data) ->
        if not (this instanceof UstreamPlayer)
            return new UstreamPlayer(data)

        @load(data)

    load: (data) ->
        data.meta.embed =
            tag: 'iframe'
            src: "http://www.ustream.tv/embed/#{data.id}?v=3&wmode=direct&autoplay=1"
        super(data)

    mixedContentError: USTREAM_ERROR
