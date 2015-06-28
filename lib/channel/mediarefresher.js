var Vimeo = require("cytube-mediaquery/lib/provider/vimeo");
var ChannelModule = require("./module");
var Config = require("../config");
var InfoGetter = require("../get-info");
var Logger = require("../logger");

function MediaRefresherModule(channel) {
    ChannelModule.apply(this, arguments);
    this._interval = false;
    this._media = null;
    this._playlist = channel.modules.playlist;
}

MediaRefresherModule.prototype = Object.create(ChannelModule.prototype);

MediaRefresherModule.prototype.onPreMediaChange = function (data, cb) {
    if (this._interval) clearInterval(this._interval);

    this._media = data;
    var pl = this._playlist;

    switch (data.type) {
        case "gd":
            pl._refreshing = true;
            return this.initGoogleDocs(data, function () {

                pl._refreshing = false;
                cb(null, ChannelModule.PASSTHROUGH);
            });
        case "gp":
            pl._refreshing = true;
            return this.initGooglePlus(data, function () {
                pl._refreshing = false;
                cb(null, ChannelModule.PASSTHROUGH);
            });
        case "vi":
            pl._refreshing = true;
            return this.initVimeo(data, function () {
                pl._refreshing = false;
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
    Vimeo.extract(data.id).then(function (direct) {
        if (self.dead || self.channel.dead)
            return;

        if (self._media === data) {
            data.meta.direct = direct;
            self.channel.logger.log("[mediarefresher] Refreshed vimeo video with ID " +
                data.id);
        }
        self.channel.activeLock.release();

        if (cb) cb();
    }).catch(function (err) {
        Logger.errlog.log("Unexpected vimeo::extract() fail: " + err.stack);
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
