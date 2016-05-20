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

function fixRedirectIfNeeded(urldata, redirect) {
    if (!/^https?:/.test(redirect)) {
        redirect = urldata.protocol + "//" + urldata.host + redirect;
    }

    return redirect;
}

function translateStatusCode(statusCode) {
    switch (statusCode) {
        case 400:
            return "The request for the audio/video link was rejected as invalid.  " +
                "Contact support for troubleshooting assistance.";
        case 401:
        case 403:
            return "Access to the link was denied.  Contact the owner of the " +
                "website hosting the audio/video file to grant permission for " +
                "the file to be downloaded.";
        case 404:
            return "The requested link could not be found (404).";
        case 500:
        case 503:
            return "The website hosting the audio/video link encountered an error " +
                "and was unable to process the request.  Try again in a few minutes, " +
                "and if the issue persists, contact the owner of the website hosting " +
                "the link.";
        default:
            return "An unknown issue occurred when requesting the audio/video link.  " +
                "Contact support for troubleshooting assistance.";
    }
}

function testUrl(url, cb, redirCount) {
    if (!redirCount) redirCount = 0;
    var data = urlparse.parse(url);
    if (!/https?:/.test(data.protocol)) {
        return cb("Only links starting with 'http://' or 'https://' are supported " +
                  "for raw audio/video support");
    }

    if (!data.hostname) {
        return cb("The link to the file is missing the website address and can't " +
                  "be processed.");
    }

    var transport = (data.protocol === "https:") ? https : http;
    data.method = "HEAD";
    var req = transport.request(data, function (res) {
        req.abort();

        if (res.statusCode === 301 || res.statusCode === 302) {
            if (redirCount > 2) {
                return cb("The request for the audio/video file has been redirected " +
                          "more than twice.  This could indicate a misconfiguration " +
                          "on the website hosting the link.  For best results, use " +
                          "a direct link.  See https://git.io/vrE75 for details.");
            }
            return testUrl(fixRedirectIfNeeded(data, res.headers["location"]), cb,
                    redirCount + 1);
        }

        if (res.statusCode !== 200) {
            return cb(translateStatusCode(res.statusCode));
        }

        if (!/^audio|^video/.test(res.headers["content-type"])) {
            return cb("Expected a content-type starting with 'audio' or 'video', but " +
                      "got '" + res.headers["content-type"] + "'.  Only direct links " +
                      "to video and audio files are accepted, and the website hosting " +
                      "the file must be configured to send the correct MIME type.  " +
                      "See https://git.io/vrE75 for details.");
        }

        cb();
    });

    req.on("error", function (err) {
        cb("An unexpected error occurred while trying to process the link.  " +
           "Try again, and contact support for further troubleshooting if the " +
           "problem continues." + (!!err.code ? (" Error code: " + err.code) : ""));
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

function isAlternateDisposition(stream) {
    if (!stream.disposition) {
        return false;
    }

    for (var key in stream) {
        if (key !== "default" && stream.disposition[key]) {
            return true;
        }
    }

    return false;
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

    var isVideo = false;
    var audio = null;
    for (var i = 0; i < data.streams.length; i++) {
        const stream = data.streams[i];

        // Trash streams with alternate dispositions, e.g. `attached_pic` for
        // embedded album art on MP3s (not a real video stream)
        if (isAlternateDisposition(stream)) {
            continue;
        }

        if (stream.codec_type === "video" &&
                !audioOnlyContainers.hasOwnProperty(container)) {
            isVideo = true;
            if (acceptedCodecs.hasOwnProperty(container + "/" + stream.codec_name)) {
                reformatted.vcodec = stream.codec_name;
                reformatted.medium = "video";
                reformatted.type = [container, reformatted.vcodec].join("/");

                if (stream.tags && stream.tags.title) {
                    reformatted.title = stream.tags.title;
                }

                return reformatted;
            }
        } else if (stream.codec_type === "audio" && !audio &&
                acceptedAudioCodecs.hasOwnProperty(stream.codec_name)) {
            audio = {
                acodec: stream.codec_name,
                medium: "audio"
            };

            if (stream.tags && stream.tags.title) {
                audio.title = stream.tags.title;
            }
        }
    }

    // Override to make sure video files with no valid video streams but some
    // acceptable audio stream are rejected.
    if (isVideo) {
        return reformatted;
    }

    if (audio) {
        for (var key in audio) {
            reformatted[key] = audio[key];
        }
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
                             " seconds.  To avoid this issue, encode your videos " +
                             "using the 'faststart' option: " +
                             "https://trac.ffmpeg.org/wiki/Encode/H.264#faststartforwebvideo");
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
            childErr = new Error("The connection was closed unexpectedly.  " +
                                 "If the problem continues, contact support " +
                                 "for troubleshooting assistance.");
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
                  "or HTTPS.  Ensure that the link begins with 'http://' or 'https://'");
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
                                  "version of ffmpeg.  Some older versions of " +
                                  "ffprobe/avprobe do not support HTTPS.");

                    if (err.message.match(/exceeded time limit/) ||
                        err.message.match(/closed unexpectedly/i)) {
                        return cb(err.message);
                    }

                    // Ignore ffprobe error messages, they are common and most often
                    // indicate a problem with the remote file, not with this code.
                    if (!/(av|ff)probe/.test(String(err)))
                        Logger.errlog.log(err.stack || err);
                    return cb("An unexpected error occurred while trying to process " +
                              "the link.  Contact support for troubleshooting " +
                              "assistance.");
                } else {
                    if (!/(av|ff)probe/.test(String(err)))
                        Logger.errlog.log(err.stack || err);
                    return cb("An unexpected error occurred while trying to process " +
                              "the link.  Contact support for troubleshooting " +
                              "assistance.");
                }
            }

            try {
                data = reformatData(data);
            } catch (e) {
                Logger.errlog.log(e.stack || e);
                return cb("An unexpected error occurred while trying to process " +
                          "the link.  Contact support for troubleshooting " +
                          "assistance.");
            }

            if (data.medium === "video") {
                data = {
                    title: data.title || "Raw Video",
                    duration: data.duration,
                    bitrate: data.bitrate,
                    codec: data.type
                };

                cb(null, data);
            } else if (data.medium === "audio") {
                data = {
                    title: data.title || "Raw Audio",
                    duration: data.duration,
                    bitrate: data.bitrate,
                    codec: data.acodec
                };

                cb(null, data);
            } else {
                return cb("File did not contain an acceptable codec.  See " +
                          "https://git.io/vrE75 for details.");
            }
        });
    });
};
