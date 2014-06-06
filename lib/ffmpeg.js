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
    "flv/h264": true,
    "matroska/vp8": true,
    "matroska/vp9": true,
    "ogg/theora": true,
};

var acceptedAudioCodecs = {
    "mp3": true,
    "vorbis": true
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

        if (isVideo(meta)) {
            var video = meta.video;
            var codec = video.container + "/" + video.codec;

            if (!(codec in acceptedCodecs)) {
                return cb("Unsupported video codec " + codec);
            }

            var data = {
                title: meta.title || "Raw Video",
                duration: meta.durationsec,
                bitrate: video.bitrate,
                codec: codec
            };

            cb(null, data);
        } else if (isAudio(meta)) {
            var audio = meta.audio;
            var codec = audio.codec;

            if (!(codec in acceptedAudioCodecs)) {
                return cb("Unsupported audio codec " + codec);
            }

            var data = {
                title: meta.title || "Raw Audio",
                duration: meta.durationsec,
                bitrate: audio.bitrate,
                codec: codec
            };

            cb(null, data);
        } else {
            return cb("Parsed metadata did not contain a valid video or audio stream.  " +
                      "Either the file is invalid or it has a format unsupported by " + 
                      "this server's version of ffmpeg.");
        }
    });
};

function isVideo(meta) {
    return meta.video && meta.video.bitrate > 0 && meta.video.container && meta.video.codec;
}

function isAudio(meta) {
    return meta.audio && meta.audio.bitrate > 0 && meta.audio.codec;
}
