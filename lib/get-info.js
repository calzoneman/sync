var http = require("http");
var https = require("https");
var cheerio = require('cheerio');
var Logger = require("./logger.js");
var Media = require("./media");
var CustomEmbedFilter = require("./customembed").filter;
var Server = require("./server");
var Config = require("./config");
var ffmpeg = require("./ffmpeg");
require("cytube-mediaquery"); // Initialize sourcemaps
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

var Getters = {
    /* youtube.com */
    yt: function (id, callback) {
        if (!Config.get("youtube-v3-key")) {
            return Getters.yt2(id, callback);
        }


        YouTube.lookup(id).then(function (video) {
            var meta = {};
            if (video.meta.blocked) {
                meta.restricted = video.meta.blocked;
            }

            var media = new Media(video.id, video.title, video.duration, "yt", meta);
            callback(false, media);
        }).catch(function (err) {
            callback(err.message, null);
        });
    },

    /* youtube.com playlists */
    yp: function (id, callback) {
        if (!Config.get("youtube-v3-key")) {
            return Getters.yp2(id, callback);
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
            callback(err.message, null);
        });
    },

    /* youtube.com search */
    ytSearch: function (query, callback) {
        if (!Config.get("youtube-v3-key")) {
            return Getters.ytSearch2(query.split(" "), callback);
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
            callback(err.message, null);
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
        id = CustomEmbedFilter(id);
        var media = new Media(id, "Custom Media", "--:--", "cu");
        callback(false, media);
    },

    /* google docs */
    gd: function (id, callback) {
        /* WARNING: hacks inbound */
        var options = {
            host: "docs.google.com",
            path: "/file/d/" + id + "/get_video_info?sle=true",
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

            try {

                var data = {};
                res.split("&").forEach(function (urlparam) {
                    var pair = urlparam.split("=").map(decodeURIComponent).map(
                            function (s) { return s.replace(/\+/g, ' '); });
                    data[pair[0]] = pair[1];
                });

                if (data.hasOwnProperty("reason")) {
                    var reason = data.reason;
                    if (reason.indexOf("Unable to play this video at this time.") === 0) {
                        reason = "There is currently a bug with Google Drive which prevents playback " +
                                 "of videos 1 hour long or longer.";
                    } else if (reason.indexOf(
                            "You must be signed in to access this video") >= 0) {
                        reason = "This video is not shared properly";
                    }


                    return callback(reason);
                }

                if (!data.hasOwnProperty("title")) {
                    return callback("Returned HTML is missing the video title.  Are you " +
                              "sure the video is done processing?");
                }

                if (!data.hasOwnProperty("length_seconds")) {
                    return callback("Returned HTML is missing the video duration.  Are you " +
                              "sure the video is done processing?");
                }

                var title = data.title;
                var seconds = parseInt(data.length_seconds);

                var videos = {};
                data.fmt_stream_map.split(",").forEach(function (stream) {
                    var parts = stream.split("|");
                    videos[parts[0]] = parts[1];
                });

                var direct = {};

                for (var key in GOOGLE_PREFERENCE) {
                    for (var i = 0; i < GOOGLE_PREFERENCE[key].length; i++) {
                        var format = GOOGLE_PREFERENCE[key][i];

                        if (format in videos) {
                            direct[key] = {
                                url: videos[format],
                                contentType: CONTENT_TYPES[format]
                            };
                            break;
                        }
                    }
                }

                if (Object.keys(direct).length === 0) {
                    return callback("No valid links could be extracted", null);
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
     * Also known as Picasa Web Albums.
     *
     */
    gp: function (id, cb) {
        var idparts = id.split("_");
        if (idparts.length !== 3) {
            return cb("Invalid Google+ video ID");
        }

        var options = {
            host: "picasaweb.google.com",
            path: '/data/feed/api/user/'+idparts[0]+'/albumid/'+idparts[1]+'/photoid/'+idparts[2]+'?kind=tag',
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
                var $ = cheerio.load(res, { xmlMode: true });
                switch ($("gphoto\\:videostatus").text()) {
                    case "final":
                        break; /* Incoming Fun. */
                    case "pending":
                        return cb("The video is still being processed.", null);
                    case "failed":
                        return cb("A processing error has occured and the video should be deleted.", null);
                    case "ready":
                        return cb("The video has been processed but still needs a thumbnail.", null);
                }
                var duration = parseInt($("gphoto\\:originalvideo").attr("duration"),10);
                var title = $("media\\:title").text();
                var videos = {};
                $('media\\:content[medium="video"]').each(function(index, element){
                    var url = $(this).attr("url");
                    var match = url.match(/itag=(\d+)/)
                    if (!match) {
                        match = url.match(/googleusercontent.*=m(\d+)$/);
                    }

                    if (match && match[1]) {
                        var type = match[1];
                        videos[type] = {
                            format: type,
                            link: url
                        };
                    }
                });
                $ = null;

                var direct = {};

                for (var key in GOOGLE_PREFERENCE) {
                    for (var i = 0; i < GOOGLE_PREFERENCE[key].length; i++) {
                        var format = GOOGLE_PREFERENCE[key][i];

                        if (format in videos) {
                            direct[key] = {
                                url: videos[format].link,
                                contentType: CONTENT_TYPES[format]
                            };
                            break;
                        }
                    }
                }

                if (Object.keys(direct).length === 0) {
                    return cb("Unable to retrieve video data from Google+.  The videos " +
                              "may have not finished processing yet.");
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

    /* youtube.com - old v2 API */
    yt2: function (id, callback) {
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

    /* youtube.com playlists - old v2 api */
    yp2: function (id, callback, url) {
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
                        Getters["yp2"](id, callback, links[i].href);
                    }
                }
            } catch (e) {
                callback(e, null);
            }

        });
    },

    /* youtube.com search - old v2 api */
    ytSearch2: function (terms, callback) {
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

        urlRetrieve(http, options, function (status, buffer) {
            if (status !== 200) {
                setImmediate(function () {
                    cb({});
                });
                return;
            }

            parse(buffer);
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
