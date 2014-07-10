var ChannelModule = require("./module");
var Config = require("../config");
var InfoGetter = require("../get-info");

function MediaRefresherModule(channel) {
    ChannelModule.apply(this, arguments);
    this._interval = false;
    this._media = null;
}

MediaRefresherModule.prototype = Object.create(ChannelModule.prototype);

MediaRefresherModule.prototype.onMediaChange = function (data) {
    if (this._interval) clearInterval(this._interval);

    this._media = data;

    switch (data.type) {
        case "gd":
            return this.initGoogleDocs(data);
        case "vi":
            return this.initVimeo(data);
    }
};

MediaRefresherModule.prototype.initGoogleDocs = function (data) {
    var self = this;
    self.refreshGoogleDocs(data, true);

    /*
     * Refresh every 55 minutes.
     * The expiration is 1 hour, but refresh 5 minutes early to be safe
     */
    self._interval = setInterval(function () {
        self.refreshGoogleDocs(data, false);
    }, 55 * 60 * 1000);
};

MediaRefresherModule.prototype.initVimeo = function (data) {
    if (!Config.get("vimeo-workaround")) {
        return;
    }

    var self = this;
    self.channel.activeLock.lock();
    InfoGetter.vimeoWorkaround(data.id, function (hack) {
        if (self._media === data) {
            self.channel.logger.log("[mediarefresher] Refreshed vimeo video with ID " +
                data.id);
            data.meta.direct = hack;
            self.channel.broadcastAll("changeMedia", data.getFullUpdate());
        }
        self.channel.activeLock.release();
    });
};

MediaRefresherModule.prototype.refreshGoogleDocs = function (media, update) {
    var self = this;

    if (self.dead || self.channel.dead) {
        return;
    }

    self.channel.activeLock.lock();
    InfoGetter.getMedia(media.id, "gd", function (err, data) {
        switch (err) {
            case "HTTP 302":
            case "Video not found":
            case "Private video":
                return;
            default:
                if (err) {
                    Logger.errlog.log("Google Docs refresh failed for ID " + media.id +
                        ": " + err);
                    return self.channel.activeLock.release();
                }
        }

        if (media !== self._media) {
            return self.channel.activeLock.release();
        }

        self.channel.logger.log("[mediarefresher] Refreshed Google Docs video with ID " +
            media.id);
        media.meta = data.meta;
        if (update) {
            self.channel.broadcastAll("changeMedia", data.getFullUpdate());
        }
        self.channel.activeLock.release();
    });
};

module.exports = MediaRefresherModule;
