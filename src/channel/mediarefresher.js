var Vimeo = require("@cytube/mediaquery/lib/provider/vimeo");
var ChannelModule = require("./module");
var Config = require("../config");

const LOGGER = require('@calzoneman/jsli')('mediarefresher');

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

MediaRefresherModule.prototype.unload = function () {
    try {
        clearInterval(this._interval);
        this._interval = null;
    } catch (error) {
        LOGGER.error(error.stack);
    }
};

MediaRefresherModule.prototype.initVimeo = function (data, cb) {
    if (!Config.get("vimeo-workaround")) {
        if (cb) cb();
        return;
    }

    const self = this;
    self.channel.refCounter.ref("MediaRefresherModule::initVimeo");
    Vimeo.extract(data.id).then(function (direct) {
        if (self.dead || self.channel.dead) {
            self.unload();
            return;
        }

        if (self._media === data) {
            data.meta.direct = direct;
            self.channel.logger.log("[mediarefresher] Refreshed vimeo video with ID " +
                data.id);
        }

        if (cb) cb();
    }).catch(function (err) {
        LOGGER.error("Unexpected vimeo::extract() fail: " + err.stack);
        if (cb) cb();
    }).finally(() => {
        self.channel.refCounter.unref("MediaRefresherModule::initVimeo");
    });
};

module.exports = MediaRefresherModule;
