/*
The MIT License (MIT)
Copyright (c) 2013 Calvin Montgomery

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
*/
var http = require("http");
var https = require("https");
var domain = require("domain");
var Logger = require("./logger.js");
var Media = require("./media");
var CustomEmbedFilter = require("./customembed").filter;
var Server = require("./server");
var Config = require("./config");
var ffmpeg = require("./ffmpeg");

var urlRetrieve = function (transport, options, callback) {
    // Catch any errors that crop up along the way of the request
    // in order to prevent them from reaching the global handler.
    // This should cut down on needing to restart the server
    var d = domain.create();
    d.on("error", function (err) {
        Logger.errlog.log(err.stack);
        Logger.errlog.log("urlRetrieve failed: " + err);
        Logger.errlog.log("Request was: " + options.host + options.path);
    });
    d.run(function () {
        var req = transport.request(options, function (res) {
            var buffer = "";
            res.setEncoding("utf-8");
            res.on("data", function (chunk) {
                buffer += chunk;
            });
            res.on("end", function () {
                callback(res.statusCode, buffer);
            });
        });

        req.end();
    });
};

var Getters = {
    /* youtube.com */
    yt: function (id, callback) {
        var sv = Server.getServer();

        var m = id.match(/([\w-]{11})/);
        if (m) {
            id = m[1];
        } else {
            callback("Invalid ID", null);
            return;
        }

        var options = {
            host: "gdata.youtube.com",
            port: 443,
            path: "/feeds/api/videos/" + id + "?v=2&alt=json",
            method: "GET",
            dataType: "jsonp",
            timeout: 1000
        };

        if (Config.get("youtube-v2-key")) {
            options.headers = {
                "X-Gdata-Key": "key=" + Config.get("youtube-v2-key")
            };
        }

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

            var buffer = data;
            try {
                data = JSON.parse(data);
                /* Check for embedding restrictions */
                if (data.entry.yt$accessControl) {
                    var ac = data.entry.yt$accessControl;
                    for (var i = 0; i < ac.length; i++) {
                        if (ac[i].action === "embed") {
                            if (ac[i].permission === "denied") {
                                callback("Embedding disabled", null);
                                return;
                            }
                            break;
                        }
                    }
                }

                var seconds = data.entry.media$group.yt$duration.seconds;
                var title = data.entry.title.$t;
                var meta = {};
                /* Check for country restrictions */
                if (data.entry.media$group.media$restriction) {
                    var rest = data.entry.media$group.media$restriction;
                    if (rest.length > 0) {
                        if (rest[0].relationship === "deny") {
                            meta.restricted = rest[0].$t;
                        }
                    }
                }
                var media = new Media(id, title, seconds, "yt", meta);
                callback(false, media);
            } catch (e) {
                // Gdata version 2 has the rather silly habit of
                // returning error codes in XML when I explicitly asked
                // for JSON
                var m = buffer.match(/<internalReason>([^<]+)<\/internalReason>/);
                if (m === null)
                    m = buffer.match(/<code>([^<]+)<\/code>/);

                var err = e;
                if (m) {
                    if(m[1] === "too_many_recent_calls") {
                        err = "YouTube is throttling the server right "+
                               "now for making too many requests.  "+
                               "Please try again in a moment.";
                    } else {
                        err = m[1];
                    }
                }

                callback(err, null);
            }
        });
    },

    /* youtube.com playlists */
    yp: function (id, callback, url) {
        /**
         * NOTE: callback may be called multiple times, once for each <= 25 video
         * batch of videos in the list.  It will be called in order.
         */
        var m = id.match(/([\w-]+)/);
        if (m) {
            id = m[1];
        } else {
            callback("Invalid ID", null);
            return;
        }
        var path = "/feeds/api/playlists/" + id + "?v=2&alt=json";
        /**
         * NOTE: the third parameter, url, is used to chain this retriever
         * multiple times to get all the videos from a playlist, as each
         * request only returns 25 videos.
         */
        if (url !== undefined) {
            path = "/" + url.split("gdata.youtube.com")[1];
        }

        var options = {
            host: "gdata.youtube.com",
            port: 443,
            path: path,
            method: "GET",
            dataType: "jsonp",
            timeout: 1000
        };

        if (Config.get("youtube-v2-key")) {
            options.headers = {
                "X-Gdata-Key": "key=" + Config.get("youtube-v2-key")
            };
        }

        urlRetrieve(https, options, function (status, data) {
            switch (status) {
                case 200:
                    break; /* Request is OK, skip to handling data */
                case 400:
                    return callback("Invalid request", null);
                case 403:
                    return callback("Private playlist", null);
                case 404:
                    return callback("Playlist not found", null);
                case 500:
                case 503:
                    return callback("Service unavailable", null);
                default:
                    return callback("HTTP " + status, null);
            }

            try {
                data = JSON.parse(data);
                var vids = [];
                for(var i in data.feed.entry) {
                    try {
                        /**
                         * FIXME: This should probably check for embed restrictions
                         * and country restrictions on each video in the list
                         */
                        var item = data.feed.entry[i];
                        var id = item.media$group.yt$videoid.$t;
                        var title = item.title.$t;
                        var seconds = item.media$group.yt$duration.seconds;
                        var media = new Media(id, title, seconds, "yt");
                        vids.push(media);
                    } catch(e) {
                    }
                }

                callback(false, vids);

                var links = data.feed.link;
                for (var i in links) {
                    if (links[i].rel === "next") {
                        /* Look up the next batch of videos from the list */
                        Getters["yp"](id, callback, links[i].href);
                    }
                }
            } catch (e) {
                callback(e, null);
            }

        });
    },

    /* youtube.com search */
    ytSearch: function (terms, callback) {
        /**
         * terms is a list of words from the search query.  Each word must be
         * encoded properly for use in the request URI
         */
        for (var i in terms) {
            terms[i] = encodeURIComponent(terms[i]);
        }
        var query = terms.join("+");

        var options = {
            host: "gdata.youtube.com",
            port: 443,
            path: "/feeds/api/videos/?q=" + query + "&v=2&alt=json",
            method: "GET",
            dataType: "jsonp",
            timeout: 1000
        };

        if (Config.get("youtube-v2-key")) {
            options.headers = {
                "X-Gdata-Key": "key=" + Config.get("youtube-v2-key")
            };
        }

        urlRetrieve(https, options, function (status, data) {
            if (status !== 200) {
                callback("YouTube search: HTTP " + status, null);
                return;
            }

            try {
                data = JSON.parse(data);
                var vids = [];
                for(var i in data.feed.entry) {
                    try {
                        /**
                         * FIXME: This should probably check for embed restrictions
                         * and country restrictions on each video in the list
                         */
                        var item = data.feed.entry[i];
                        var id = item.media$group.yt$videoid.$t;
                        var title = item.title.$t;
                        var seconds = item.media$group.yt$duration.seconds;
                        var media = new Media(id, title, seconds, "yt");
                        media.thumb = item.media$group.media$thumbnail[0];
                        vids.push(media);
                    } catch(e) {
                    }
                }

                callback(false, vids);
            } catch(e) {
                callback(e, null);
            }
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
            id = m[1];
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
                    var media = new Media(id, title, seconds, "sc");
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

    /* justin.tv */
    jt: function (id, callback) {
        var m = id.match(/([\w-]+)/);
        if (m) {
            id = m[1];
        } else {
            callback("Invalid ID", null);
            return;
        }
        var title = "Justin.tv - " + id;
        var media = new Media(id, title, "--:--", "jt");
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
            var m = data.match(/cid":([0-9]+)/);
            if(m) {
                var title = "Ustream.tv - " + id;
                var media = new Media(m[1], title, "--:--", "us");
                callback(false, media);
            } else {
                callback(true, null);
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
        id = CustomEmbedFilter(id);
        var media = new Media(id, "Custom Media", "--:--", "cu");
        callback(false, media);
    },

    /* google docs */
    gd: function (id, callback) {
        /* WARNING: hacks inbound */
        var options = {
            host: "docs.google.com",
            path: "/file/d/" + id + "/view?sle=true",
            port: 443
        };

        urlRetrieve(https, options, function (status, res) {
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

            /*
             * Match [[anything]] and ignore whitespace
             * Fix 2014-08-07: [^] matches \r\n, . doesn't.
             */
            var m = res.match(/\[(\[\s*\[[^\[][^]*?\]\s*\])/);
            try {
                var propertyList = JSON.parse(m[1]);
                var data = {};
                propertyList.forEach(function (kv) {
                    data[kv[0]] = kv[1];
                });

                var title = data.title;
                var seconds = parseInt(data.length_seconds);

                var videos = {};
                data.fmt_stream_map.split(",").forEach(function (stream) {
                    var parts = stream.split("|");
                    videos[parts[0]] = parts[1];
                });

                /*
                 * Preference map of quality => youtube formats.
                 * see https://en.wikipedia.org/wiki/Youtube#Quality_and_codecs
                 */
                const preference = {
                    "hd1080": [46, 37],
                    "hd720": [22, 45],
                    "large": [44, 35],
                    "medium": [43, 18],
                    "small": [5]
                };

                var direct = {};

                for (var key in preference) {
                    for (var i = 0; i < preference[key].length; i++) {
                        var format = preference[key][i];

                        if (format in videos) {
                            direct[key] = videos[format];
                            break;
                        }
                    }
                }

                callback(null, new Media(id, title, seconds, "gd", { gpdirect: direct }));
            } catch (e) {
                return callback("Failed to parse Google Docs output", null);
            }
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

    /*
     * Google+ videos
     *
     * This is quite possibly the hackiest video metadata retrieval function
     * in CyTube.
     */
    gp: function (id, cb) {
        var idparts = id.split("_");
        if (idparts.length !== 3) {
            return cb("Invalid Google+ video ID");
        }

        var options = {
            host: "plus.google.com",
            path: "/photos/" + idparts[0] + "/albums/" + idparts[1] + "/" + idparts[2],
            port: 443
        };

        urlRetrieve(https, options, function (status, res) {
            switch (status) {
                case 200:
                    break; /* Request is OK, skip to handling data */
                case 400:
                    return cb("Invalid request", null);
                case 403:
                    return cb("Private video", null);
                case 404:
                    return cb("Video not found", null);
                case 500:
                case 503:
                    return cb("Service unavailable", null);
                default:
                    return cb("HTTP " + status, null);
            }

            try {
                var videos = {};
                var duration;
                var title;
                var startReading = false;
                var startReadingSentinel = new RegExp('"' + idparts[2] + '"');
                res.split("\n").filter(function (line) {
                    /* Once the duration has been set, no more lines are relevant */
                    if (duration) {
                        return false;
                    }

                    var m = line.match(/"og:image" content="([^"]+)"/);
                    if (m) {
                        var parts = m[1].replace(/%25/g, "%")
                                        .replace(/%2B/ig, "%20").split("/");
                        title = decodeURIComponent(parts[parts.length - 1]);
                    }

                    /* Hack for only reading relevant video data */
                    if (line.match(startReadingSentinel)) {
                        startReading = true;
                    }

                    if (!startReading) {
                        return false;
                    }

                    m = line.match(/,(\d+),,"https:\/\/video\.googleusercontent/);
                    if (m) {
                        duration = parseInt(parseInt(m[1]) / 1000);
                    }

                    return line.match(/videoplayback/);
                }).map(function (line) {
                    var parts = line.match(/\[(\d+),(\d+),(\d+),("http:\/\/redirector.*?")\]/);
                    return {
                        format: parseInt(parts[1]),
                        width: parseInt(parts[2]),
                        height: parseInt(parts[3]),
                        link: JSON.parse(parts[4])
                    };
                }).forEach(function (video) {
                    videos[video.format] = video;
                });

                /*
                 * Preference map of quality => youtube formats.
                 * see https://en.wikipedia.org/wiki/Youtube#Quality_and_codecs
                 */
                const preference = {
                    "hd1080": [46, 37],
                    "hd720": [22, 45],
                    "large": [44, 35],
                    "medium": [43, 18],
                    "small": [5]
                };

                var direct = {};

                for (var key in preference) {
                    for (var i = 0; i < preference[key].length; i++) {
                        var format = preference[key][i];

                        if (format in videos) {
                            direct[key] = videos[format].link;
                            break;
                        }
                    }
                }

                if (Object.keys(direct).length === 0) {
                    return cb("Unable to retrieve video data from Google+.  Check that " +
                              "the album exists and is shared publicly.");
                } else if (!title) {
                    return cb("Unable to retrieve title from Google+.  Check that " +
                              "the album exists and is shared publicly.");
                } else if (!duration) {
                    return cb("Unable to retreive duration from Google+.  This might be " +
                              "because the video is still processing.");
                }

                var media = new Media(id, title, duration, "gp", { gpdirect: direct });
                cb(null, media);
            } catch (e) {
                cb("Unknown error");
                Logger.errlog.log("Unknown error for Google+ ID " + id + ": " + e.stack);
            }
        });
    }
};

/**
 * Function to workaround Vimeo being a dick and blocking my domain from embeds.
 * Retrieves the player page and extracts the direct links to the MP4 encoded videos.
 */
function vimeoWorkaround(id, cb) {
    if (typeof cb !== "function") {
        return;
    }

    var failcount = 0;

    var inner = function () {
        var options = {
            host: "player.vimeo.com",
            path: "/video/" + id,
            headers: {
                "User-Agent": "Mozilla/5.0 (X11; Linux x86_64; rv:29.0) Gecko/20100101 Firefox/29.0",
                "Referrer": "player.vimeo.com"
            }
        };

        var parse = function (data) {
            var i = data.indexOf("{\"cdn_url\"");
            if (i === -1) {
                setImmediate(function () {
                    cb({});
                });
                return;
            }
            var j = data.indexOf("};", i);
            var json = data.substring(i, j+1);
            try {
                json = JSON.parse(json);
                if (!json.request.files) {
                    setImmediate(function () {
                        cb({});
                    });
                    return;
                }
                var codec = json.request.files.codecs[0];
                var files = json.request.files[codec];
                setImmediate(function () {
                    cb(files);
                });
            } catch (e) {
                // This shouldn't happen due to the user-agent, but just in case
                if (data.indexOf("crawler") !== -1) {
                    Logger.syslog.log("Warning: vimdeoWorkaround got crawler response");
                    failcount++;
                    if (failcount > 4) {
                        Logger.errlog.log("vimeoWorkaround got bad response 5 times!"+
                                          "  Giving up.");
                        setImmediate(function () {
                            cb({});
                        });
                    } else {
                        setImmediate(function () {
                            inner();
                        });
                    }
                    return;
                } else if (data.indexOf("This video does not exist.") !== -1) {
                    cb({});
                    return;
                } else if (data.indexOf("Because of its privacy settings, this video cannot be played here.") !== -1) {
                    cb({});
                }
                Logger.errlog.log("Vimeo workaround error: ");
                Logger.errlog.log(e);
                Logger.errlog.log("http://vimeo.com/" + id);
                setImmediate(function () {
                    cb({});
                });
            }
        };

        http.get(options, function (res) {
            res.setEncoding("utf-8");
            var buffer = "";

            res.on("data", function (data) {
                buffer += data;
            });

            res.on("end", function () {
                parse(buffer);
            });
        });
    };

    inner();
}

module.exports = {
    Getters: Getters,
    getMedia: function (id, type, callback) {
        if(type in this.Getters) {
            this.Getters[type](id, callback);
        } else {
            callback("Unknown media type '" + type + "'", null);
        }
    },

    vimeoWorkaround: vimeoWorkaround
};
