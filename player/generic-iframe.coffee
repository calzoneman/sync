DEFAULT_WARNING = 'You are currently connected via HTTPS but the embedded video
    link uses non-secure plain HTTP.  Your browser may therefore block it from
    loading due to mixed content policy.  To fix this, embed the video using a
    secure link if available (https://...), or load this page over plain HTTP by
    replacing "https://" with "http://" in the address bar (your websocket will
    still be secured using HTTPS, but this will permit non-secure content to load).'

window.GenericIframePlayer = class GenericIframePlayer extends Player
    constructor: (data, iframeSrc, customMixedContentWarning) ->
        if not (this instanceof GenericIframePlayer)
            return new GenericIframePlayer(data, iframeSrc, customMixedContentWarning)

    load: (data, iframeSrc, customMixedContentWarning) ->
        @setMediaProperties(data)

        @player = $('<iframe/>').attr(
            src: iframeSrc
            frameborder: '0'
        )
        removeOld(@player)

        if iframeSrc.indexOf('http:') == 0
            if customMixedContentWarning
                warning = customMixedContentWarning
            else
                warning = DEFAULT_WARNING

            makeAlert('Mixed Content Warning', warning).appendTo($('#videowrap'))
