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

        if (typeof err === "string") {
            err = err.replace(/Google Drive lookup failed: /, "");
            err = err.replace(/Forbidden/, "Access Denied");
            err = err.replace(/You don't have permission to access this video\./,
                    "Access Denied");
        }

        switch (err) {
            case "Moved Temporarily":
                self.channel.logger.log("[mediarefresher] Google Docs refresh failed " +
                        "(likely redirect to login page-- make sure it is shared " +
                        "correctly)");
                self.channel.activeLock.release();
                if (cb) cb();
                return;
            case "Access Denied":
            case "Not Found":
            case "Internal Server Error":
            case "Service Unavailable":
            case "Google Drive does not permit videos longer than 1 hour to be played":
            case "Google Drive videos must be shared publicly":
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

        if (typeof err === "string") {
            err = err.replace(/Forbidden/, "Access Denied");
        }

        switch (err) {
            case "Access Denied":
            case "Not Found":
            case "Internal Server Error":
            case "Service Unavailable":
            case "The video is still being processed":
            case "A processing error has occured":
            case "The video has been processed but is not yet accessible":
            case ("Unable to retreive video information.  Check that the video exists " +
                    "and is shared publicly"):
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
