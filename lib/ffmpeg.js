var Logger = require("./logger");
var Config = require("./config");
var spawn = require("child_process").spawn;
var https = require("https");
var http = require("http");
var urlparse = require("url");
var path = require("path");
require("status-message-polyfill");

var USE_JSON = true;
var TIMEOUT = 30000;

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

function fflog() { }

function initFFLog() {
    if (fflog.initialized) return;
    var logger = new Logger.Logger(path.resolve(__dirname, "..", "ffmpeg.log"));
    fflog = function () {
        logger.log.apply(logger, arguments);
    };
    fflog.initialized = true;
}

function testUrl(url, cb, redirCount) {
    if (!redirCount) redirCount = 0;
    var data = urlparse.parse(url);
    if (!/https?:/.test(data.protocol)) {
        return cb("Video links must start with http:// or https://");
    }

    if (!data.hostname) {
        return cb("Invalid link");
    }

    var transport = (data.protocol === "https:") ? https : http;
    data.method = "HEAD";
    var req = transport.request(data, function (res) {
        req.abort();

        if (res.statusCode === 301 || res.statusCode === 302) {
            if (redirCount > 2) {
                return cb("Too many redirects.  Please provide a direct link to the " +
                          "file");
            }
            return testUrl(res.headers["location"], cb, redirCount + 1);
        }

        if (res.statusCode !== 200) {
            var message = res.statusMessage;
            if (!message) message = "";
            return cb("HTTP " + res.statusCode + " " + message);
        }

        if (!/^audio|^video/.test(res.headers["content-type"])) {
            return cb("Server did not return an audio or video file, or sent the " +
                      "wrong Content-Type");
        }

        cb();
    });

    req.on("error", function (err) {
        cb(err);
    });

    req.end();
}

function readOldFormat(buf) {
    var lines = buf.split("\n");
    var tmp = { tags: {} };
    var data = {
        streams: []
    };

    lines.forEach(function (line) {
        if (line.match(/\[stream\]|\[format\]/i)) {
            return;
        } else if (line.match(/\[\/stream\]/i)) {
            data.streams.push(tmp);
            tmp = { tags: {} };
        } else if (line.match(/\[\/format\]/i)) {
            data.format = tmp;
            tmp = { tags: {} };
        } else {
            var kv = line.split("=");
            var key = kv[0].toLowerCase();
            if (key.indexOf("tag:") === 0) {
                tmp.tags[key.split(":")[1]] = kv[1];
            } else {
                tmp[key] = kv[1];
            }
        }
    });

    return data;
}

function reformatData(data) {
    var reformatted = {};

    var duration = parseInt(data.format.duration, 10);
    if (isNaN(duration)) duration = "--:--";
    reformatted.duration = Math.ceil(duration);

    var bitrate = parseInt(data.format.bit_rate, 10) / 1000;
    if (isNaN(bitrate)) bitrate = 0;
    reformatted.bitrate = bitrate;

    reformatted.title = data.format.tags ? data.format.tags.title : null;
    var container = data.format.format_name.split(",")[0];

    data.streams.forEach(function (stream) {
        if (stream.codec_type === "video") {
            reformatted.vcodec = stream.codec_name;
            if (!reformatted.title && stream.tags) {
                reformatted.title = stream.tags.title;
            }
        } else if (stream.codec_type === "audio") {
            reformatted.acodec = stream.codec_name;
        }
    });

    if (reformatted.vcodec && !(audioOnlyContainers.hasOwnProperty(container))) {
        reformatted.type = [container, reformatted.vcodec].join("/");
        reformatted.medium = "video";
    } else if (reformatted.acodec) {
        reformatted.type = [container, reformatted.acodec].join("/");
        reformatted.medium = "audio";
    }

    return reformatted;
}

exports.ffprobe = function ffprobe(filename, cb) {
    fflog("Spawning ffprobe for " + filename);
    var childErr;
    var args = ["-show_streams", "-show_format", filename];
    if (USE_JSON) args = ["-of", "json"].concat(args);
    var child = spawn(Config.get("ffmpeg.ffprobe-exec"), args);
    var stdout = "";
    var stderr = "";
    var timer = setTimeout(function () {
        Logger.errlog.log("Possible runaway ffprobe process for file " + filename);
        fflog("Killing ffprobe for " + filename + " after " + (TIMEOUT/1000) + " seconds");
        childErr = new Error("File query exceeded time limit of " + (TIMEOUT/1000) +
                             " seconds");
        child.kill("SIGKILL");
    }, TIMEOUT);

    child.on("error", function (err) {
        childErr = err;
    });

    child.stdout.on("data", function (data) {
        stdout += data;
    });

    child.stderr.on("data", function (data) {
        stderr += data;
        if (stderr.match(/the tls connection was non-properly terminated/i)) {
            fflog("Killing ffprobe for " + filename + " due to TLS error");
            childErr = new Error("Remote server closed connection unexpectedly");
            child.kill("SIGKILL");
        }
    });

    child.on("close", function (code) {
        clearTimeout(timer);
        fflog("ffprobe exited with code " + code + " for file " + filename);
        if (code !== 0) {
            if (stderr.match(/unrecognized option|json/i) && USE_JSON) {
                Logger.errlog.log("Warning: ffprobe does not support -of json.  " +
                                  "Assuming it will have old output format.");
                USE_JSON = false;
                return ffprobe(filename, cb);
            }

            if (!childErr) childErr = new Error(stderr);
            return cb(childErr);
        }

        var result;
        if (USE_JSON) {
            try {
                result = JSON.parse(stdout);
            } catch (e) {
                return cb(new Error("Unable to parse ffprobe output: " + e.message));
            }
        } else {
            try {
                result = readOldFormat(stdout);
            } catch (e) {
                return cb(new Error("Unable to parse ffprobe output: " + e.message));
            }
        }

        return cb(null, result);
    });
}

exports.query = function (filename, cb) {
    if (Config.get("ffmpeg.log") && !fflog.initialized) {
        initFFLog();
    }

    if (!Config.get("ffmpeg.enabled")) {
        return cb("Raw file playback is not enabled on this server");
    }

    if (!filename.match(/^https?:\/\//)) {
        return cb("Raw file playback is only supported for links accessible via HTTP " +
                  "or HTTPS");
    }

    testUrl(filename, function (err) {
        if (err) {
            return cb(err);
        }

        exports.ffprobe(filename, function (err, data) {
            if (err) {
                if (err.code && err.code === "ENOENT") {
                    return cb("Failed to execute `ffprobe`.  Set ffmpeg.ffprobe-exec " +
                              "to the correct name of the executable in config.yaml.  " +
                              "If you are using Debian or Ubuntu, it is probably " +
                              "avprobe.");
                } else if (err.message) {
                    if (err.message.match(/protocol not found/i))
                        return cb("Link uses a protocol unsupported by this server's " +
                                  "version of ffmpeg");

                    if (err.message.match(/exceeded time limit/) ||
                        err.message.match(/remote server closed/i)) {
                        return cb(err.message);
                    }

                    // Ignore ffprobe error messages, they are common and most often
                    // indicate a problem with the remote file, not with this code.
                    if (!/(av|ff)probe/.test(String(err)))
                        Logger.errlog.log(err.stack || err);
                    return cb("Unable to query file data with ffmpeg");
                } else {
                    if (!/(av|ff)probe/.test(String(err)))
                        Logger.errlog.log(err.stack || err);
                    return cb("Unable to query file data with ffmpeg");
                }
            }

            try {
                data = reformatData(data);
            } catch (e) {
                Logger.errlog.log(e.stack || e);
                return cb("Unable to query file data with ffmpeg");
            }

            if (data.medium === "video") {
                if (!acceptedCodecs.hasOwnProperty(data.type)) {
                    return cb("Unsupported video codec " + data.type);
                }

                data = {
                    title: data.title || "Raw Video",
                    duration: data.duration,
                    bitrate: data.bitrate,
                    codec: data.type
                };

                cb(null, data);
            } else if (data.medium === "audio") {
                if (!acceptedAudioCodecs.hasOwnProperty(data.acodec)) {
                    return cb("Unsupported audio codec " + data.acodec);
                }

                data = {
                    title: data.title || "Raw Audio",
                    duration: data.duration,
                    bitrate: data.bitrate,
                    codec: data.acodec
                };

                cb(null, data);
            } else {
                return cb("Parsed metadata did not contain a valid video or audio " +
                          "stream.  Either the file is invalid or it has a format " +
                          "unsupported by this server's version of ffmpeg.");
            }
        });
    });
};
