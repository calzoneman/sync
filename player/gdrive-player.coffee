window.GoogleDrivePlayer = class GoogleDrivePlayer extends VideoJSPlayer
    constructor: (data) ->
        if not (this instanceof GoogleDrivePlayer)
            return new GoogleDrivePlayer(data)

        super(data)
