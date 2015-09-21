var http = require("http");
var https = require("https");
var cheerio = require('cheerio');
var Logger = require("./logger.js");
var Media = require("./media");
var CustomEmbedFilter = require("./customembed").filter;
var Server = require("./server");
var Config = require("./config");
var ffmpeg = require("./ffmpeg");
var mediaquery = require("cytube-mediaquery");
var YouTube = require("cytube-mediaquery/lib/provider/youtube");

/*
 * Preference map of quality => youtube formats.
 * see https://en.wikipedia.org/wiki/Youtube#Quality_and_codecs
 *
 * Prefer WebM over MP4, ignore other codecs (e.g. FLV)
 */
const GOOGLE_PREFERENCE = {
    "hd1080": [37, 46],
    "hd720": [22, 45],
    "large": [59, 44],
    "medium": [18, 43, 34] // 34 is 360p FLV as a last-ditch
};

const CONTENT_TYPES = {
    43: "webm",
    44: "webm",
    45: "webm",
    46: "webm",
    18: "mp4",
    22: "mp4",
    37: "mp4",
    59: "mp4",
    34: "flv"
};

var urlRetrieve = function (transport, options, callback) {
    var req = transport.request(options, function (res) {
        res.on("error", function (err) {
            Logger.errlog.log("HTTP response " + options.host + options.path + " failed: "+
                err);
            callback(503, "");
        });

        var buffer = "";
        res.setEncoding("utf-8");
        res.on("data", function (chunk) {
            buffer += chunk;
        });
        res.on("end", function () {
            callback(res.statusCode, buffer);
        });
    });

    req.on("error", function (err) {
        Logger.errlog.log("HTTP request " + options.host + options.path + " failed: " +
            err);
        callback(503, "");
    });

    req.end();
};

var mediaTypeMap = {
    "youtube": "yt",
    "googledrive": "gd",
    "google+": "gp"
};

function convertMedia(media) {
    return new Media(media.id, media.title, media.duration, mediaTypeMap[media.type],
            media.meta);
}

var Getters = {
    /* youtube.com */
    yt: function (id, callback) {
        if (!Config.get("youtube-v3-key")) {
            return callback("The YouTube API now requires an API key.  Please see the " +
                            "documentation for youtube-v3-key in config.template.yaml");
        }


        YouTube.lookup(id).then(function (video) {
            var meta = {};
            if (video.meta.blocked) {
                meta.restricted = video.meta.blocked;
            }

            var media = new Media(video.id, video.title, video.duration, "yt", meta);
            callback(false, media);
        }).catch(function (err) {
            callback(err.message || err, null);
        });
    },

    /* youtube.com playlists */
    yp: function (id, callback) {
        if (!Config.get("youtube-v3-key")) {
            return callback("The YouTube API now requires an API key.  Please see the " +
                            "documentation for youtube-v3-key in config.template.yaml");
        }

        YouTube.lookupPlaylist(id).then(function (videos) {
            videos = videos.map(function (video) {
                var meta = {};
                if (video.meta.blocked) {
                    meta.restricted = video.meta.blocked;
                }

                return new Media(video.id, video.title, video.duration, "yt", meta);
            });

            callback(null, videos);
        }).catch(function (err) {
            callback(err.message || err, null);
        });
    },

    /* youtube.com search */
    ytSearch: function (query, callback) {
        if (!Config.get("youtube-v3-key")) {
            return callback("The YouTube API now requires an API key.  Please see the " +
                            "documentation for youtube-v3-key in config.template.yaml");
        }

        YouTube.search(query).then(function (res) {
            var videos = res.results;
            videos = videos.map(function (video) {
                var meta = {};
                if (video.meta.blocked) {
                    meta.restricted = video.meta.blocked;
                }

                var media = new Media(video.id, video.title, video.duration, "yt", meta);
                media.thumb = { url: video.meta.thumbnail };
                return media;
            });

            callback(null, videos);
        }).catch(function (err) {
            callback(err.message || err, null);
        });
    },

    /* vimeo.com */
    vi: function (id, callback) {
        var m = id.match(/([\w-]+)/);
        if (m) {
            id = m[1];
        } else {
            callback("Invalid ID", null);
            return;
        }

        if (Config.get("vimeo-oauth.enabled")) {
            return Getters.vi_oauth(id, callback);
        }

        var options = {
            host: "vimeo.com",
            port: 443,
            path: "/api/v2/video/" + id + ".json",
            method: "GET",
            dataType: "jsonp",
            timeout: 1000
        };

        urlRetrieve(https, options, function (status, data) {
            switch (status) {
                case 200:
                    break; /* Request is OK, skip to handling data */
                case 400:
                    return callback("Invalid request", null);
                case 403:
                    return callback("Private video", null);
                case 404:
                    return callback("Video not found", null);
                case 500:
                case 503:
                    return callback("Service unavailable", null);
                default:
                    return callback("HTTP " + status, null);
            }

            try {
                data = JSON.parse(data);
                data = data[0];
                var seconds = data.duration;
                var title = data.title;
                var media = new Media(id, title, seconds, "vi");
                callback(false, media);
            } catch(e) {
                var err = e;
                /**
                 * This should no longer be necessary as the outer handler
                 * checks for HTTP 404
                 */
                if (buffer.match(/not found/))
                    err = "Video not found";

                callback(err, null);
            }
        });
    },

    vi_oauth: function (id, callback) {
        var OAuth = require("oauth");
        var oa = new OAuth.OAuth(
            "https://vimeo.com/oauth/request_token",
            "https://vimeo.com/oauth/access_token",
            Config.get("vimeo-oauth.consumer-key"),
            Config.get("vimeo-oauth.secret"),
            "1.0",
            null,
            "HMAC-SHA1"
        );

        oa.get("https://vimeo.com/api/rest/v2?format=json" +
               "&method=vimeo.videos.getInfo&video_id=" + id,
            null,
            null,
        function (err, data, res) {
            if (err) {
                return callback(err, null);
            }

            try {
                data = JSON.parse(data);

                if (data.stat !== "ok") {
                    return callback(data.err.msg, null);
                }

                var video = data.video[0];

                if (video.embed_privacy !== "anywhere") {
                    return callback("Embedding disabled", null);
                }

                var id = video.id;
                var seconds = parseInt(video.duration);
                var title = video.title;
                callback(null, new Media(id, title, seconds, "vi"));
            } catch (e) {
                callback("Error handling Vimeo response", null);
            }
        });
    },

    /* dailymotion.com */
    dm: function (id, callback) {
        var m = id.match(/([\w-]+)/);
        if (m) {
            id = m[1].split("_")[0];
        } else {
            callback("Invalid ID", null);
            return;
        }
        var options = {
            host: "api.dailymotion.com",
            port: 443,
            path: "/video/" + id + "?fields=duration,title",
            method: "GET",
            dataType: "jsonp",
            timeout: 1000
        };

        urlRetrieve(https, options, function (status, data) {
            switch (status) {
                case 200:
                    break; /* Request is OK, skip to handling data */
                case 400:
                    return callback("Invalid request", null);
                case 403:
                    return callback("Private video", null);
                case 404:
                    return callback("Video not found", null);
                case 500:
                case 503:
                    return callback("Service unavailable", null);
                default:
                    return callback("HTTP " + status, null);
            }

            try {
                data = JSON.parse(data);
                var title = data.title;
                var seconds = data.duration;
                /**
                 * This is a rather hacky way to indicate that a video has
                 * been deleted...
                 */
                if (title === "Deleted video" && seconds === 10) {
                    callback("Video not found", null);
                    return;
                }
                var media = new Media(id, title, seconds, "dm");
                callback(false, media);
            } catch(e) {
                callback(e, null);
            }
        });
    },

    /* soundcloud.com */
    sc: function (id, callback) {
        /* TODO: require server owners to register their own API key, put in config */
        const SC_CLIENT = "2e0c82ab5a020f3a7509318146128abd";

        var m = id.match(/([\w-\/\.:]+)/);
        if (m) {
            id = m[1];
        } else {
            callback("Invalid ID", null);
            return;
        }

        var options = {
            host: "api.soundcloud.com",
            port: 443,
            path: "/resolve.json?url=" + id + "&client_id=" + SC_CLIENT,
            method: "GET",
            dataType: "jsonp",
            timeout: 1000
        };

        urlRetrieve(https, options, function (status, data) {
            switch (status) {
                case 200:
                case 302:
                    break; /* Request is OK, skip to handling data */
                case 400:
                    return callback("Invalid request", null);
                case 403:
                    return callback("Private sound", null);
                case 404:
                    return callback("Sound not found", null);
                case 500:
                case 503:
                    return callback("Service unavailable", null);
                default:
                    return callback("HTTP " + status, null);
            }

            var track = null;
            try {
                data = JSON.parse(data);
                track = data.location;
            } catch(e) {
                callback(e, null);
                return;
            }

            var options2 = {
                host: "api.soundcloud.com",
                port: 443,
                path: track,
                method: "GET",
                dataType: "jsonp",
                timeout: 1000
            };

            /**
             * There has got to be a way to directly get the data I want without
             * making two requests to Soundcloud...right?
             * ...right?
             */
            urlRetrieve(https, options2, function (status, data) {
                switch (status) {
                    case 200:
                        break; /* Request is OK, skip to handling data */
                    case 400:
                        return callback("Invalid request", null);
                    case 403:
                        return callback("Private sound", null);
                    case 404:
                        return callback("Sound not found", null);
                    case 500:
                    case 503:
                        return callback("Service unavailable", null);
                    default:
                        return callback("HTTP " + status, null);
                }

                try {
                    data = JSON.parse(data);
                    var seconds = data.duration / 1000;
                    var title = data.title;
                    var meta = {};
                    if (data.sharing === "private" && data.embeddable_by === "all") {
                        meta.scuri = data.uri;
                    }
                    var media = new Media(id, title, seconds, "sc", meta);
                    callback(false, media);
                } catch(e) {
                    callback(e, null);
                }
            });

        });
    },

    /* livestream.com */
    li: function (id, callback) {
        var m = id.match(/([\w-]+)/);
        if (m) {
            id = m[1];
        } else {
            callback("Invalid ID", null);
            return;
        }
        var title = "Livestream.com - " + id;
        var media = new Media(id, title, "--:--", "li");
        callback(false, media);
    },

    /* twitch.tv */
    tw: function (id, callback) {
        var m = id.match(/([\w-]+)/);
        if (m) {
            id = m[1];
        } else {
            callback("Invalid ID", null);
            return;
        }
        var title = "Twitch.tv - " + id;
        var media = new Media(id, title, "--:--", "tw");
        callback(false, media);
    },

    /* ustream.tv */
    us: function (id, callback) {
        /**
         *2013-09-17
         * They couldn't fucking decide whether channels should
         * be at http://www.ustream.tv/channel/foo or just
         * http://www.ustream.tv/foo so they do both.
         * [](/cleese)
         */
        var m = id.match(/([^\?&#]+)|(channel\/[^\?&#]+)/);
        if (m) {
            id = m[1];
        } else {
            callback("Invalid ID", null);
            return;
        }

        var options = {
            host: "www.ustream.tv",
            port: 80,
            path: "/" + id,
            method: "GET",
            timeout: 1000
        };

        urlRetrieve(http, options, function (status, data) {
            if(status !== 200) {
                callback("Ustream HTTP " + status, null);
                return;
            }

            /**
             * Regexing the ID out of the HTML because
             * Ustream's API is so horribly documented
             * I literally could not figure out how to retrieve
             * this information.
             *
             * [](/eatadick)
             */
            var m = data.match(/https:\/\/www\.ustream\.tv\/embed\/(\d+)/);
            if (m) {
                var title = "Ustream.tv - " + id;
                var media = new Media(m[1], title, "--:--", "us");
                callback(false, media);
            } else {
                callback("Channel ID not found", null);
            }
        });
    },

    /* JWPlayer */
    jw: function (id, callback) {
        var title = "JWPlayer - " + id;
        var media = new Media(id, title, "--:--", "jw");
        callback(false, media);
    },

    /* rtmp stream */
    rt: function (id, callback) {
        var title = "Livestream";
        var media = new Media(id, title, "--:--", "rt");
        callback(false, media);
    },

    /* imgur.com albums */
    im: function (id, callback) {
        /**
         * TODO: Consider deprecating this in favor of custom embeds
         */
        var m = id.match(/([\w-]+)/);
        if (m) {
            id = m[1];
        } else {
            callback("Invalid ID", null);
            return;
        }
        var title = "Imgur Album - " + id;
        var media = new Media(id, title, "--:--", "im");
        callback(false, media);
    },

    /* custom embed */
    cu: function (id, callback) {
        var media;
        try {
            media = CustomEmbedFilter(id);
        } catch (e) {
            if (/invalid embed/i.test(e.message)) {
                return callback(e.message);
            } else {
                Logger.errlog.log(e.stack);
                return callback("Unknown error processing embed");
            }
        }
        callback(false, media);
    },

    /* google docs */
    gd: function (id, callback) {
        var data = {
            type: "googledrive",
            kind: "single",
            id: id
        };

        mediaquery.lookup(data).then(function (video) {
            callback(null, convertMedia(video));
        }).catch(function (err) {
            callback(err.message || err);
        });
    },

    /* Google+ videos */
    gp: function (id, callback) {
        var data = {
            type: "google+",
            kind: "single",
            id: id
        };

        mediaquery.lookup(data).then(function (video) {
            callback(null, convertMedia(video));
        }).catch(function (err) {
            callback(err.message || err);
        });
    },

    /* ffmpeg for raw files */
    fi: function (id, cb) {
        ffmpeg.query(id, function (err, data) {
            if (err) {
                return cb(err);
            }

            var m = new Media(id, data.title, data.duration, "fi", {
                bitrate: data.bitrate,
                codec: data.codec
            });
            cb(null, m);
        });
    },

    /* hitbox.tv */
    hb: function (id, callback) {
        var m = id.match(/([\w-]+)/);
        if (m) {
            id = m[1];
        } else {
            callback("Invalid ID", null);
            return;
        }
        var title = "Hitbox.tv - " + id;
        var media = new Media(id, title, "--:--", "hb");
        callback(false, media);
    },
};

module.exports = {
    Getters: Getters,
    getMedia: function (id, type, callback) {
        if(type in this.Getters) {
            this.Getters[type](id, callback);
        } else {
            callback("Unknown media type '" + type + "'", null);
        }
    }
};
