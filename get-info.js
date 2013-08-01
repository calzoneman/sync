/*
The MIT License (MIT)
Copyright (c) 2013 Calvin Montgomery

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
*/

var http = require("http");
var https = require("https");
var Logger = require("./logger.js");
var Media = require("./media.js").Media;

function urlRetrieve(transport, options, callback) {
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
}

// Helper function for making an HTTP request and getting the result
// as JSON
function getJSONInternal(transport, options, callback) {
    var req = transport.request(options, function(res) {
        var buffer = "";
        res.setEncoding("utf8");
        res.on("data", function (chunk) {
            buffer += chunk;
        });
        res.on("end", function() {
            try {
                var data = JSON.parse(buffer);
            }
            catch(e) {
                var m = buffer.match(/<internalReason>([^<]+)<\/internalReason>/);
                if(m === null)
                    m = buffer.match(/<code>([^<]+)<\/code>/);
                if(m === null)
                    m = buffer.match(/([0-9]+ not found)/);
                Logger.errlog.log("Media request failed: "+options.host+options.path);
                if(m) {
                    if(m[1] === "too_many_recent_calls") {
                        m[1] = "YouTube is throttling the server right "+
                               "now for making too many requests.  "+
                               "Please try again in a moment.";
                    }
                    Logger.errlog.log("Reason: " + m[1]);
                    callback(m[1], res.statusCode, null);
                }
                else {
                    callback(true, res.statusCode, null);
                }
                return;
            }
            callback(false, res.statusCode, data);
        });
    });

    req.end();
};

function getJSON(options, callback) {
    getJSONInternal(http, options, callback);
}

function getJSONHTTPS(options, callback) {
    getJSONInternal(https, options, callback);
}

var Getters = {
    /* youtube.com */
    yt: function (id, callback) {
        var options = {
            host: "gdata.youtube.com",
            port: 443,
            path: "/feeds/api/videos/" + id + "?v=2&alt=json",
            method: "GET",
            dataType: "jsonp",
            timeout: 1000
        };

        urlRetrieve(https, options, function (status, data) {
            if(status === 404) {
                callback("Video not found", null);
                return;
            } else if(status === 403) {
                callbacK("Private video", null);
                return;
            } else if(status !== 200) {
                callback(true, null);
                return;
            }

            try {
                data = JSON.parse(data);
                var seconds = data.entry.media$group.yt$duration.seconds;
                var title = data.entry.title.$t;
                var media = new Media(id, title, seconds, "yt");
                callback(false, media);
            } catch(e) {
                // Gdata version 2 has the rather silly habit of
                // returning error codes in XML when I explicitly asked
                // for JSON
                var m = buffer.match(/<internalReason>([^<]+)<\/internalReason>/);
                if(m === null)
                    m = buffer.match(/<code>([^<]+)<\/code>/);

                var err = true;
                if(m) {
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

    // TODO Add youtube playlists

    /* vimeo.com */
    vi: function (id, callback) {
        var options = {
            host: "vimeo.com",
            port: 443,
            path: "/api/v2/video/" + id + ".json",
            method: "GET",
            dataType: "jsonp",
            timeout: 1000
        };

        urlRetrieve(https, options, function (status, data) {
            if(status === 404) {
                callback("Video not found", null);
                return;
            } else if(status === 403) {
                callbacK("Private video", null);
                return;
            } else if(status !== 200) {
                callback(true, null);
                return;
            }

            try {
                data = JSON.parse(data);
                data = data[0];
                var seconds = data.duration;
                var title = data.title;
                var media = new Media(id, title, seconds, "vi");
                callback(false, media);
            } catch(e) {
                var err = true;
                if(buffer.match(/not found/))
                    err = "Video not found";

                callback(err, null);
            }
        });
    },

    /* dailymotion.com */
    dm: function (id, callback) {
        // Dailymotion's API is an example of an API done right
        // - Supports SSL
        // - I can ask for exactly which fields I want
        // - URL is simple
        // - Field names are sensible
        // Other media providers take notes, please
        var options = {
            host: "api.dailymotion.com",
            port: 443,
            path: "/video/" + id + "?fields=duration,title",
            method: "GET",
            dataType: "jsonp",
            timeout: 1000
        };

        urlRetrieve(https, options, function (status, data) {
            if(status !== 200) {
                callback(true, null);
                return;
            }

            try {
                data = JSON.parse(data);
                var title = data.title;
                var seconds = data.duration;
                if(title === "Deleted video" && seconds === 10) {
                    callback("Video not found", null);
                    return;
                }
                var media = new Media(id, title, seconds, "dm");
                callback(false, media);
            } catch(e) {
                callback(err, null);
            }
        });
    },

    /* soundcloud.com */
    sc: function (id, callback) {
        // Soundcloud's API is badly designed and badly documented
        // In order to lookup track data from a URL, I have to first
        // make a call to /resolve to get the track id, then make a second
        // call to /tracks/{track.id} to actally get useful data
        // This is a waste of bandwidth and a pain in the ass

        const SC_CLIENT = "2e0c82ab5a020f3a7509318146128abd";

        var options = {
            host: "api.soundcloud.com",
            port: 443,
            path: "/resolve.json?url=" + id + "&client_id=" + SC_CLIENT,
            method: "GET",
            dataType: "jsonp",
            timeout: 1000
        };

        urlRetrieve(https, options, function (status, data) {
            if(status === 404) {
                callback("Sound not found", null);
                return;
            } else if(status !== 302) {
                callback(true, null);
                return;
            }

            var track = null;
            try {
                data = JSON.parse(data);
                track = data.location;
            } catch(e) {
                callback(true, null);
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

            // I want to get off async's wild ride
            urlRetrieve(https, options2, function (status, data) {
                if(status !== 200) {
                    callback(true, null);
                    return;
                }

                try {
                    data = JSON.parse(data);
                    // Duration is in ms, but I want s
                    var seconds = data.duration / 1000;
                    var title = data.title;
                    var media = new Media(id, title, seconds, "sc");
                    callback(false, media);
                } catch(e) {
                    callback(true, null);
                }
            });

        });
    },

    /* livestream.com */
    li: function (id, callback) {
        var title = "Livestream.com - " + id;
        var media = new Media(id, title, "--:--", "li");
        callback(false, media);
    },

    /* twitch.tv */
    tw: function (id, callback) {
        var title = "Twitch.tv - " + id;
        var media = new Media(id, title, "--:--", "tw");
        callback(false, media);
    },

    /* justin.tv */
    jt: function (id, callback) {
        var title = "Justin.tv - " + id;
        var media = new Media(id, title, "--:--", "jt");
        callback(false, media);
    },

    /* ustream.tv */
    us: function (id, callback) {
        var options = {
            host: "www.ustream.tv",
            port: 80,
            path: "/" + id,
            method: "GET",
            timeout: 1000
        };

        urlRetrieve(http, options, function (status, data) {
            if(status !== 200) {
                callback(true, null);
                return;
            }

            // Regexing the ID out of the HTML because
            // Ustream's API is so horribly documented
            // I literally could not figure out how to retrieve
            // this information.
            //
            // [](/eatadick)
            var m = data.match(/cid":([0-9]+)/);
            if(m) {
                var title = "Ustream.tv - " + id;
                var media = new Media(m[1], title, "--:--", "us");
                callback(false, media);
            }

            callback(true, null);
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
        var title = "Imgur Album - " + id;
        var media = new Media(id, title, "--:--", "im");
        callback(false, media);
    }
}

exports.Getters = Getters;

// Look up YouTube metadata
// Fairly straightforward
exports.getYTInfo = function(id, callback) {
    getJSON({
        host: "gdata.youtube.com",
        port: 80,
        path: "/feeds/api/videos/" + id + "?v=2&alt=json",
        method: "GET",
        dataType: "jsonp",
        timeout: 1000}, callback);
}

// Look up a YouTube playlist
exports.getYTPlaylist = function(id, callback, url) {
    var path = "/feeds/api/playlists/" + id + "?v=2&alt=json";
    if(url) {
        path = "/" + url.split("gdata.youtube.com")[1];
    }
    getJSON({
        host: "gdata.youtube.com",
        port: 80,
        path: path,
        method: "GET",
        dataType: "jsonp",
        timeout: 1000}, callback);
}

// Search YouTube
exports.searchYT = function(terms, callback) {
    // I really miss Python's list comprehensions
    for(var i = 0; i < terms.length; i++) {
        terms[i] = escape(terms[i]);
    }
    var query = terms.join("+");
    getJSON({
        host: "gdata.youtube.com",
        port: 80,
        path: "/feeds/api/videos/?q=" + query + "&v=2&alt=json",
        method: "GET",
        dataType: "jsonp",
        timeout: 1000}, callback);
}

exports.getYTSearchResults = function(query, callback) {
    var cback = function(err, res, data) {
        if(err || res != 200) {
            callback(true, null);
            return;
        }

        var vids = [];
        try {
            if(data.feed.entry.length === undefined) {
                return;
            }
            for(var i = 0; i < data.feed.entry.length; i++) {
                try {
                    var item = data.feed.entry[i];

                    var id = item.media$group.yt$videoid.$t;
                    var title = item.title.$t;
                    var seconds = item.media$group.yt$duration.seconds;
                    var media = new Media(id, title, seconds, "yt");
                    media.thumb = item.media$group.media$thumbnail[0];
                    vids.push(media);
                }
                catch(e) {
                    Logger.errlog.log("getYTSearchResults failed: ");
                    Logger.errlog.log(e);
                }
            }

        }
        catch(e) {
            Logger.errlog.log("getYTSearchResults failed: ");
            Logger.errlog.log(e);
        }
        callback(false, vids);
    }

    exports.searchYT(query.split(" "), cback);
}

// Look up Soundcloud metadata
exports.getSCInfo = function(url, callback) {
    const SC_CLIENT = "2e0c82ab5a020f3a7509318146128abd";
    getJSON({
        host: "api.soundcloud.com",
        port: 80,
        path: "/resolve.json?url="+url+"&client_id=" + SC_CLIENT,
        method: "GET",
        dataType: "jsonp",
        timeout: 1000}, function(err, status, data) {
            // This time we can ACTUALLY get the data we want
            getJSON({
            host: "api.soundcloud.com",
            port: 80,
            path: data.location,
            method: "GET",
            dataType: "jsonp",
            timeout: 1000}, callback);
        });
}

// Look up Vimeo metadata.  Fairly straightforward
exports.getVIInfo = function(id, callback) {
    getJSON({
        host: "vimeo.com",
        port: 80,
        path: "/api/v2/video/" + id + ".json",
        method: "GET",
        dataType: "jsonp",
        timeout: 1000}, callback);
}

// Look up Dailymotion info
exports.getDMInfo = function(id, callback) {
    var fields = "duration,title"
    getJSONHTTPS({
        host: "api.dailymotion.com",
        port: 443,
        path: "/video/" + id + "?fields=" + fields,
        method: "GET",
        dataType: "jsonp",
        timeout: 1000}, callback);
}

// Ustream requires a developer key for their API, and on top of that
// I couldn't figure out how to use it.
// I'm regexing the stream ID out of the HTML
// So sue me
exports.getUstream = function(name, callback) {
    var opts = {
        host: "www.ustream.tv",
        port: 80,
        path: "/" + name
    };
    http.get(opts, function(res) {
        var html = "";
        res.on("data", function(cnk) {
            html += cnk;
        });
        res.on("end", function() {
            if(res.statusCode != 200) {
                callback(true, null);
                return;
            }
            var lines = html.split("\n");
            const re = /cid":([0-9]+)/;
            var m = html.match(re);
            if(m) {
                callback(false, m[1]);
            }
            else {
                callback(true, null);
            }
            return;
            for(var i = 0; i < lines.length; i++) {
                var m = lines[i].match(re);
                if(m) {
                    callback(m[1]);
                    return;
                }
            }
        });
    }).on("error", function(err) {
        Logger.errlog.log(err.message);
    });
}

exports.getMedia = function(id, type, callback) {
    switch(type) {
        case "yt":
            exports.getYTInfo(id, function(err, res, data) {
                if(err || res != 200) {
                    callback(err || true, null);
                    return;
                }

                try {
                    // Whoever named this should be fired
                    var seconds = data.entry.media$group.yt$duration.seconds;
                    var title = data.entry.title.$t;
                    var media = new Media(id, title, seconds, "yt");
                    callback(false, media);
                }
                catch(e) {
                    Logger.errlog.log("getMedia failed: ");
                    Logger.errlog.log(e.stack);
                    callback(true, null);
                }
            });
            break;
        case "vi":
            exports.getVIInfo(id, function(err, res, data) {
                if(err || res != 200) {
                    callback(err || true, null);
                    return;
                }

                try {
                    data = data[0];
                    var seconds = data.duration;
                    var title = data.title;
                    var media = new Media(id, title, seconds, "vi");
                    callback(false, media);
                }
                catch(e) {
                    Logger.errlog.log("getMedia failed: ");
                    Logger.errlog.log(e);
                    callback(true, null);
                }
            });
            break;
        case "dm":
            exports.getDMInfo(id, function(err, res, data) {
                if(err || res != 200) {
                    callback(true, null);
                    return;
                }

                try {
                    var seconds = data.duration;
                    var title = data.title;
                    var media = new Media(id, title, seconds, "dm");
                    callback(false, media);
                }
                catch(e) {
                    Logger.errlog.log("getMedia failed: ");
                    Logger.errlog.log(e);
                    callback(true, null);
                }
            });
            break;
        case "sc":
            exports.getSCInfo(id, function(err, res, data) {
                if(err || res != 200) {
                    callback(true, null);
                    return;
                }

                try {
                    // Soundcloud's durations are in ms
                    var seconds = data.duration / 1000;
                    var title = data.title;
                    var media = new Media(id, title, seconds, "sc");
                    callback(false, media);
                }
                catch(e) {
                    Logger.errlog.log("getMedia failed: ");
                    Logger.errlog.log(e);
                    callback(true, null);
                }
            });
            break;
        case "yp":
            var cback = function(err, res, data) {
                if(err || res != 200) {
                    callback(true, null);
                    return;
                }

                try {
                    var vids = [];
                    for(var i = 0; i < data.feed.entry.length; i++) {
                        try {
                            var item = data.feed.entry[i];

                            var id = item.media$group.yt$videoid.$t;
                            var title = item.title.$t;
                            var seconds = item.media$group.yt$duration.seconds;
                            var media = new Media(id, title, seconds, "yt");
                            vids.push(media);
                        }
                        catch(e) {
                            Logger.errlog.log("getMedia failed: ");
                            Logger.errlog.log(e);
                        }
                    }
                    callback(false, vids);


                    var links = data.feed.link;
                    for(var i = 0; i < links.length; i++) {
                        if(links[i].rel == "next") {
                            exports.getYTPlaylist(id, cback, links[i].href);
                        }
                    }
                }
                catch(e) {
                    Logger.errlog.log("getMedia failed: ");
                    Logger.errlog.log(e);
                    callback(true, null);
                }
            }
            exports.getYTPlaylist(id, cback);
            break;
        case "li":
        case "tw":
        case "jt":
        case "jw":
            const prefix = {
                "li": "Livestream.com - ",
                "tw": "Twitch.tv - ",
                "jt": "Justin.tv - ",
                "jw": "JWPlayer Stream - "
            };
            var media = new Media(id, prefix[type] + id, "--:--", type);
            callback(false, media);
            break;
        case "us":
            exports.getUstream(id, function(err, data) {
                if(err) {
                    callback(true, null);
                    return;
                }

                var media = new Media(data, "Ustream.tv - " + id, "--:--", "us");
                callback(false, media);
            });
            break;
        case "rt":
        case "im":
            const names = {
                "rt": "Livestream",
                "im": "Imgur Album"
            };
            var media = new Media(id, names[type], "--:--", type);
            callback(false, media);
            break;
        default:
            break;
    }
}
