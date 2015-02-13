var ChannelModule = require("./module");
var Config = require("../config");
var InfoGetter = require("../get-info");
var Logger = require("../logger");

function MediaRefresherModule(channel) {
    ChannelModule.apply(this, arguments);
    this._interval = false;
    this._media = null;
}

MediaRefresherModule.prototype = Object.create(ChannelModule.prototype);

MediaRefresherModule.prototype.onPreMediaChange = function (data, cb) {
    if (this._interval) clearInterval(this._interval);

    this._media = data;

    switch (data.type) {
        case "gd":
            return this.initGoogleDocs(data, function () {
                cb(null, ChannelModule.PASSTHROUGH);
            });
        case "gp":
            return this.initGooglePlus(data, function () {
                cb(null, ChannelModule.PASSTHROUGH);
            });
        case "vi":
            return this.initVimeo(data, function () {
                cb(null, ChannelModule.PASSTHROUGH);
            });
        default:
            return cb(null, ChannelModule.PASSTHROUGH);
    }
};

MediaRefresherModule.prototype.initGoogleDocs = function (data, cb) {
    var self = this;
    self.refreshGoogleDocs(data, cb);

    /*
     * Refresh every 55 minutes.
     * The expiration is 1 hour, but refresh 5 minutes early to be safe
     */
    self._interval = setInterval(function () {
        self.refreshGoogleDocs(data);
    }, 55 * 60 * 1000);
};

MediaRefresherModule.prototype.initVimeo = function (data, cb) {
    if (!Config.get("vimeo-workaround")) {
        if (cb) cb();
        return;
    }

    var self = this;
    self.channel.activeLock.lock();
    InfoGetter.vimeoWorkaround(data.id, function (hack) {
        if (self.dead || self.channel.dead) {
            return;
        }

        if (self._media === data) {
            self.channel.logger.log("[mediarefresher] Refreshed vimeo video with ID " +
                data.id);
            data.meta.direct = hack;
        }
        self.channel.activeLock.release();

        if (cb) cb();
    });
};

MediaRefresherModule.prototype.refreshGoogleDocs = function (media, cb) {
    var self = this;

    if (self.dead || self.channel.dead) {
        return;
    }

    self.channel.activeLock.lock();
    InfoGetter.getMedia(media.id, "gd", function (err, data) {
        if (self.dead || self.channel.dead) {
            return;
        }

        switch (err) {
            case "HTTP 302":
            case "Video not found":
            case "Private video":
            case "Google Docs error: Video has exceeded quota":
            case "There is currently a bug with Google Drive which prevents playback of videos 1 hour long or longer.":
                self.channel.logger.log("[mediarefresher] Google Docs refresh failed: " +
                    err);
                self.channel.activeLock.release();
                if (cb) cb();
                return;
            default:
                if (err) {
                    self.channel.logger.log("[mediarefresher] Google Docs refresh failed: " +
                        err);
                    Logger.errlog.log("Google Docs refresh failed for ID " + media.id +
                        ": " + err);
                    self.channel.activeLock.release();
                    if (cb) cb();
                    return;
                }
        }

        if (media !== self._media) {
            self.channel.activeLock.release();
            if (cb) cb();
            return;
        }

        self.channel.logger.log("[mediarefresher] Refreshed Google Docs video with ID " +
            media.id);
        media.meta = data.meta;
        self.channel.activeLock.release();
        if (cb) cb();
    });
};

MediaRefresherModule.prototype.initGooglePlus = function (media, cb) {
    var self = this;

    if (self.dead || self.channel.dead) {
        return;
    }

    self.channel.activeLock.lock();
    InfoGetter.getMedia(media.id, "gp", function (err, data) {
        if (self.dead || self.channel.dead) {
            return;
        }

        switch (err) {
            case "HTTP 302":
            case "Video not found":
            case "Private video":
            case "The video is still being processed.":
            case "A processing error has occured and the video should be deleted.":
            case "The video has been processed but still needs a thumbnail.":
            case "Unable to retreive duration from Google+.  This might be because the video is still processing.":
                self.channel.logger.log("[mediarefresher] Google+ refresh failed: " +
                    err);
                self.channel.activeLock.release();
                if (cb) cb();
                return;
            default:
                if (err) {
                    self.channel.logger.log("[mediarefresher] Google+ refresh failed: " +
                        err);
                    Logger.errlog.log("Google+ refresh failed for ID " + media.id +
                        ": " + err);
                    self.channel.activeLock.release();
                    if (cb) cb();
                    return;
                }
        }

        if (media !== self._media) {
            self.channel.activeLock.release();
            if (cb) cb();
            return;
        }

        self.channel.logger.log("[mediarefresher] Refreshed Google+ video with ID " +
            media.id);
        media.meta = data.meta;
        self.channel.activeLock.release();
        if (cb) cb();
    });
};

module.exports = MediaRefresherModule;
