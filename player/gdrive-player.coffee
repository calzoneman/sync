window.GoogleDrivePlayer = class GoogleDrivePlayer extends VideoJSPlayer
    constructor: (data) ->
        if not (this instanceof GoogleDrivePlayer)
            return new GoogleDrivePlayer(data)

        super(data)

    load: (data) ->
        window.maybePromptToUpgradeUserscript()
        if typeof window.getGoogleDriveMetadata is 'function'
            window.getGoogleDriveMetadata(data.id, (error, metadata) =>
                if error
                    console.error(error)
                    alertBox = window.document.createElement('div')
                    alertBox.className = 'alert alert-danger'
                    alertBox.textContent = error
                    document.getElementById('ytapiplayer').appendChild(alertBox)
                else
                    data.meta.direct = metadata.videoMap
                    super(data)
            )
        else
            super(data)
