var Logger = require("./logger");
var Config = require("./config");
var spawn = require("child_process").spawn;
var https = require("https");
var http = require("http");
var urlparse = require("url");
var path = require("path");

import { callOnce } from './util/call-once';

const CYTUBE_VERSION = require('../package.json').version;

const LOGGER = require('@calzoneman/jsli')('ffmpeg');
const ECODE_MESSAGES = {
    ENOTFOUND: e => (
        `Unknown host "${e.hostname}".  ` +
        'Please check that the link is correct.'
    ),
    EPROTO: _e => 'The remote server does not support HTTPS.',
    ECONNRESET: _e => 'The remote server unexpectedly closed the connection.',
    ECONNREFUSED: _e => (
        'The remote server refused the connection.  ' +
        'Please check that the link is correct and the server is running.'
    ),
    ETIMEDOUT: _e => (
        'The connection to the remote server timed out.  ' +
        'Please check that the link is correct.'
    ),
    ENETUNREACH: _e => (
        "The remote server's network is unreachable from this server.  " +
        "Please contact an administrator for assistance."
    ),
    EHOSTUNREACH: _e => (
        "The remote server is unreachable from this server.  " +
        "Please contact the video server's administrator for assistance."
    ),
    ENOMEM: _e => (
        "An out of memory error caused the request to fail.  Please contact an " +
        "administrator for assistance."
    ),

    DEPTH_ZERO_SELF_SIGNED_CERT: _e => (
        'The remote server provided an invalid ' +
        '(self-signed) SSL certificate.  Raw file support requires a ' +
        'trusted certificate.  See https://letsencrypt.org/ to get ' +
        'a free, trusted certificate.'
    ),
    SELF_SIGNED_CERT_IN_CHAIN: _e => (
        'The remote server provided an invalid ' +
        '(self-signed) SSL certificate.  Raw file support requires a ' +
        'trusted certificate.  See https://letsencrypt.org/ to get ' +
        'a free, trusted certificate.'
    ),
    UNABLE_TO_VERIFY_LEAF_SIGNATURE: _e => (
        "The remote server's SSL certificate chain could not be validated.  " +
        "Please contact the administrator of the server to correct their " +
        "SSL certificate configuration."
    ),
    CERT_HAS_EXPIRED: _e => (
        "The remote server's SSL certificate has expired.  Please contact " +
        "the administrator of the server to renew the certificate."
    ),
    ERR_TLS_CERT_ALTNAME_INVALID: _e => (
        "The remote server's SSL connection is misconfigured and has served " +
        "a certificate invalid for the given link."
    ),

    // node's http parser barfs when careless servers ignore RFC 2616 and send a
    // response body in reply to a HEAD request
    HPE_INVALID_CONSTANT: _e => (
        "The remote server for this link is misconfigured."
    )
};

var USE_JSON = true;
var TIMEOUT = 30000;

var acceptedCodecs = {
    "mov/h264": true,
    "flv/h264": true,
    "matroska/vp8": true,
    "matroska/vp9": true,
    "ogg/theora": true,
    "mov/av1": true,
    "matroska/av1": true
};

var acceptedAudioCodecs = {
    "mp3": true,
    "vorbis": true,
    "aac": true,
    "opus": true
};

var audioOnlyContainers = {
    "mp3": true
};

function fflog() { }

/* eslint no-func-assign: off */
function initFFLog() {
    if (fflog.initialized) return;
    var logger = new Logger.Logger(path.resolve(__dirname, "..", "ffmpeg.log"));
    fflog = function () {
        logger.log.apply(logger, arguments);
    };
    fflog.initialized = true;
}

function fixRedirectIfNeeded(urldata, redirect) {
    let parsedRedirect = urlparse.parse(redirect);
    if (parsedRedirect.host === null) {
        // Relative path, munge it to absolute
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
        case 405:
            return "The website hosting the link does not support HEAD requests, " +
                   "so the link could not be retrieved.";
        case 410:
            return "The requested link does not exist (410 Gone).";
        case 501:
            return "The requested link could not be retrieved because the server " +
                   "hosting it does not support CyTube's request.";
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

function getCookie(res) {
    if (!res.headers['set-cookie']) {
        return '';
    }

    return res.headers['set-cookie'].map(c => c.split(';')[0]).join(';') + ';';
}

function testUrl(url, cb, params = { redirCount: 0, cookie: '' }) {
    const { redirCount, cookie } = params;
    var data = urlparse.parse(url);
    if (!/https:/.test(data.protocol)) {
        if (redirCount > 0) {
            // If the original URL redirected, the user is probably not aware
            // that the link they entered (which was HTTPS) is redirecting to a
            // non-HTTPS endpoint
            return cb(`Unexpected redirect to a non-HTTPS link: ${url}`);
        }

        return cb("Only links starting with 'https://' are supported " +
                  "for raw audio/video support");
    }

    if (!data.hostname) {
        return cb("The link to the file is missing the website address and can't " +
                  "be processed.");
    }

    var transport = (data.protocol === "https:") ? https : http;
    data.method = "HEAD";
    data.headers = {
        'User-Agent': `CyTube/${CYTUBE_VERSION}`
    };
    if (cookie) {
        data.headers['Cookie'] = cookie;
    }

    try {
        var req = transport.request(data, function (res) {
            req.abort();

            if (res.statusCode === 301 || res.statusCode === 302) {
                if (redirCount > 2) {
                    return cb("The request for the audio/video file has been redirected " +
                              "more than twice.  This could indicate a misconfiguration " +
                              "on the website hosting the link.  For best results, use " +
                              "a direct link.  See https://git.io/vrE75 for details.");
                }

                const nextParams = {
                    redirCount: redirCount + 1,
                    cookie: cookie + getCookie(res)
                };
                return testUrl(fixRedirectIfNeeded(data, res.headers["location"]), cb,
                        nextParams);
            }

            if (res.statusCode !== 200) {
                return cb(translateStatusCode(res.statusCode));
            }

            if (!/^audio|^video/.test(res.headers["content-type"])) {
                cb("Could not detect a supported audio/video type.  See " +
                   "https://git.io/fjtOK for a list of supported providers.  " +
                   "(Content-Type was: '" + res.headers["content-type"] + "')");
                return;
            }

            cb();
        });

        req.on("error", function (err) {
            if (/hostname\/ip doesn't match/i.test(err.message)) {
                cb("The remote server provided an invalid SSL certificate.  Details: "
                        + err.reason);
                return;
            } else if (ECODE_MESSAGES.hasOwnProperty(err.code)) {
                cb(`${ECODE_MESSAGES[err.code](err)} (error code: ${err.code})`);
                return;
            }

            LOGGER.error(
                "Error sending preflight request: %s (code=%s) (link: %s)",
                err.message,
                err.code,
                url
            );

            cb("An unexpected error occurred while trying to process the link.  " +
               "If this link is hosted on a server you own, it is likely " +
               "misconfigured and you can join community support for assistance.  " +
               "If you are attempting to add links from third party websites, the " +
               "developers do not provide support for this." +
               (err.code ? (" Error code: " + err.code) : ""));
        });

        req.end();
    } catch (error) {
        LOGGER.error('Unable to make raw file probe request: %s', error.stack);
        cb("An unexpected error occurred while trying to process the link.  " +
           "Try again, and contact support for further troubleshooting if the " +
           "problem continues.");
    }
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
    let child;
    try {
        child = spawn(Config.get("ffmpeg.ffprobe-exec"), args);
    } catch (error) {
        LOGGER.error("Unable to spawn() ffprobe process: %s", error.stack);
        cb(error);
        return;
    }
    var stdout = "";
    var stderr = "";
    var timer = setTimeout(function () {
        LOGGER.warn("Timed out when probing " + filename);
        fflog("Killing ffprobe for " + filename + " after " + (TIMEOUT/1000) + " seconds");
        childErr = new Error(
                "File query exceeded time limit of " + (TIMEOUT/1000) +
                " seconds.  This can be caused if the remote server is far " +
                "away or if you did not encode the video " +
                "using the 'faststart' option: " +
                "https://trac.ffmpeg.org/wiki/Encode/H.264#faststartforwebvideo"
        );
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
                LOGGER.warn("ffprobe does not support -of json.  " +
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
};

exports.query = function (filename, cb) {
    if (Config.get("ffmpeg.log") && !fflog.initialized) {
        initFFLog();
    }

    if (!Config.get("ffmpeg.enabled")) {
        return cb("Raw file playback is not enabled on this server");
    }

    if (!filename.match(/^https:\/\//)) {
        return cb("Raw file playback is only supported for links accessible via HTTPS. " +
                  "Ensure that the link begins with 'https://'.");
    }

    testUrl(filename, callOnce(function (err) {
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
                        LOGGER.error(err.stack || err);
                    return cb("An unexpected error occurred while trying to process " +
                              "the link.  Contact support for troubleshooting " +
                              "assistance.");
                } else {
                    if (!/(av|ff)probe/.test(String(err)))
                        LOGGER.error(err.stack || err);
                    return cb("An unexpected error occurred while trying to process " +
                              "the link.  Contact support for troubleshooting " +
                              "assistance.");
                }
            }

            try {
                data = reformatData(data);
            } catch (e) {
                LOGGER.error(e.stack || e);
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
    }));
};
