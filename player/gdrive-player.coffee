window.GoogleDrivePlayer = class GoogleDrivePlayer extends VideoJSPlayer
    constructor: (data) ->
        if not (this instanceof GoogleDrivePlayer)
            return new GoogleDrivePlayer(data)

        super(data)

    load: (data) ->
        if not window.hasDriveUserscript
            window.promptToInstallDriveUserscript()
        else if window.hasDriveUserscript
            window.maybePromptToUpgradeUserscript()
        if typeof window.getGoogleDriveMetadata is 'function'
            setTimeout(=>
                backoffRetry((cb) ->
                    window.getGoogleDriveMetadata(data.id, cb)
                , (error, metadata) =>
                    if error
                        console.error(error)
                        alertBox = window.document.createElement('div')
                        alertBox.className = 'alert alert-danger'
                        alertBox.textContent = error
                        document.getElementById('ytapiplayer').appendChild(alertBox)
                    else
                        data.meta.direct = metadata.videoMap
                        super(data)
                , {
                    maxTries: 3
                    delay: 1000
                    factor: 1.2
                    jitter: 500
                })
            , Math.random() * 1000)
