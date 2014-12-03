var Logger = require("./logger");
var Config = require("./config");
var spawn = require("child_process").spawn;

var acceptedCodecs = {
    "mov/h264": true,
    "flv/h264": true,
    "matroska/vp8": true,
    "matroska/vp9": true,
    "ogg/theora": true
};

var acceptedAudioCodecs = {
    "mp3": true,
    "vorbis": true
};

var audioOnlyContainers = {
    "mp3": true
};

exports.query = function (filename, cb) {
    if (!Config.get("ffmpeg.enabled")) {
        return cb("Raw file playback is not enabled on this server");
    }

    if (!filename.match(/^https?:\/\//)) {
        return cb("Raw file playback is only supported for links accessible via HTTP " +
                  "or HTTPS");
    }

    ffprobe(filename, function (err, meta) {
        if (err) {
            if (meta.stderr && meta.stderr.match(/Protocol not found/)) {
                return cb("Link uses a protocol unsupported by this server's ffmpeg");
            } else {
                return cb("Unable to query file data with ffmpeg");
            }
        }

        meta = parse(meta);
        if (meta == null) {
            return cb("Unknown error");
        }

        if (isVideo(meta)) {
            var codec = meta.container + "/" + meta.vcodec;

            if (!(codec in acceptedCodecs)) {
                return cb("Unsupported video codec " + codec);
            }

            var data = {
                title: meta.title || "Raw Video",
                duration: Math.ceil(meta.seconds) || "--:--",
                bitrate: meta.bitrate,
                codec: codec
            };

            cb(null, data);
        } else if (isAudio(meta)) {
            var codec = meta.acodec;

            if (!(codec in acceptedAudioCodecs)) {
                return cb("Unsupported audio codec " + codec);
            }

            var data = {
                title: meta.title || "Raw Audio",
                duration: Math.ceil(meta.seconds) || "--:--",
                bitrate: meta.bitrate,
                codec: codec
            };

            cb(null, data);
        } else if (data.ffmpegErr.match(/Protocol not found/)) {
            return cb("This server is unable to load videos over the " +
                      filename.split(":")[0] + " protocol.");
        } else {
            return cb("Parsed metadata did not contain a valid video or audio stream.  " +
                      "Either the file is invalid or it has a format unsupported by " +
                      "this server's version of ffmpeg.");
        }
    });
};

function isVideo(meta) {
    return meta.vcodec && !(meta.container in audioOnlyContainers);
}

function isAudio(meta) {
    return meta.acodec;
}

function parse(meta) {
    if (meta == null) {
        return null;
    }

    if (!meta.format) {
        return null;
    }

    var data = {};
    meta.streams.forEach(function (s) {
        if (s.codec_type === "video") {
            data.vcodec = s.codec_name;
        } else if (s.codec_type === "audio") {
            data.acodec = s.codec_name;
        }
    });

    data.container = meta.format.format_name.split(",")[0];
    data.bitrate = parseInt(meta.format.bit_rate) / 1000;
    if (meta.format.tags) {
        data.title = meta.format.tags.title;
    }
    data.seconds = Math.ceil(parseFloat(meta.format.duration));
    return data;
}

function ffprobe(filename, cb) {
    var ff = spawn("ffprobe", ["-show_streams", "-show_format", filename]);

    var outbuf = "";
    var errbuf = "";
    ff.stdout.on("data", function (data) {
        outbuf += data;
    });
    ff.stderr.on("data", function (data) {
        errbuf += data;
    });

    ff.on("close", function (code) {
        if (code !== 0) {
            return cb("ffprobe exited with nonzero exit code", { stderr: errbuf });
        }

        var lines = outbuf.split("\n");
        var streams = [];
        var format = {};
        var data = {};
        lines.forEach(function (line) {
            if (line.match(/\[stream\]|\[format\]/i)) {
                return;
            } else if (line.match(/\[\/stream\]/i)) {
                streams.push(data);
                data = {};
            } else if (line.match(/\[\/format\]/i)) {
                format = data;
                data = {};
            } else {
                var kv = line.split("=");
                data[kv[0]] = kv[1];
            }
        });

        cb(null, {
            streams: streams,
            format: format
        });
    });
}
