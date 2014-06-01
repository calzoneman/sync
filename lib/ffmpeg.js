var Logger = require("./logger");
var Config = require("./config");
var Metadata;
var enabled = false;

function init() {
    if (Config.get("ffmpeg.enabled")) {
        try {
            Metadata = require("fluent-ffmpeg").Metadata;
            Logger.syslog.log("Enabling raw file support with fluent-ffmpeg");
            enabled = true;
        } catch (e) {   
            Logger.errlog.log("Failed to load fluent-ffmpeg.  Did you remember to " +
                              "execute `npm install fluent-ffmpeg` ?");
        }
    }
}

var acceptedCodecs = {
    "mov/h264": true,
    "matroska/vp8": true
};

exports.query = function (filename, cb) {
    if (!Metadata) {
        init();
    }

    if (!enabled) {
        return cb("Raw file playback is not enabled on this server");
    }

    new Metadata(filename, function (meta, err) {
        if (err) {
            return cb(err);
        }

        var video = meta.video;
        if (!video) {
            return cb("File has no video stream");
        }

        var codec = video.container + "/" + video.codec;

        if (!(codec in acceptedCodecs)) {
            return cb("Unsupported codec " + codec);
        }

        var data = {
            title: meta.title || "Raw Video",
            duration: meta.durationsec,
            bitrate: video.bitrate,
            codec: codec
        };

        cb(null, data);
    });
};
