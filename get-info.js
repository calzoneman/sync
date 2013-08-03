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

module.exports = function (Server) {
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

    var Getters = {
        /* youtube.com */
        yt: function (id, callback) {
            if(Server.cfg["ytapikey"]) {
                Getters["ytv3"](id, callback);
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

        /* youtube.com API v3 (requires API key) */
        ytv3: function (id, callback) {
            var params = [
                "part=" + encodeURIComponent("id,snippet,contentDetails"),
                "id=" + id,
                "key=" + Server.cfg["ytapikey"]
            ].join("&");
            var options = {
                host: "www.googleapis.com",
                port: 443,
                path: "/youtube/v3/videos?" + params,
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
                    // I am a bit disappointed that the API v3 just doesn't
                    // return anything in any error case
                    if(data.pageInfo.totalResults !== 1) {
                        callback(true, null);
                        return;
                    }

                    var vid = data.items[0];
                    var title = vid.snippet.title;
                    // No, it's not possible to get a number representing
                    // the video length.  Instead, I get a time of the format
                    // PT#M#S which represents
                    // "Period of Time" # Minutes, # Seconds
                    var m = vid.contentDetails.duration.match(/PT(\d+)M(\d+)S/);
                    var seconds = parseInt(m[1]) * 60 + parseInt(m[2]);
                    var media = new Media(id, title, seconds, "yt");
                    callback(false, media);
                } catch(e) {
                    callback(true, media);
                }
            });
        },

        /* youtube.com playlists */
        yp: function (id, callback, url) {
            var path = "/feeds/api/playlists/" + id + "?v=2&alt=json";
            // YouTube only returns 25 at a time, so I have to keep asking
            // for more with the URL they give me
            if(url !== undefined) {
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

            urlRetrieve(https, options, function (status, data) {
                if(status === 404) {
                    callback("Playlist not found", null);
                    return;
                } else if(status === 403) {
                    callback("Playlist is private", null);
                    return;
                } else if(status !== 200) {
                    callback(true, null);
                }

                try {
                    data = JSON.parse(data);
                    var vids = [];
                    for(var i in data.feed.entry) {
                        try {
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
                    for(var i in links) {
                        if(links[i].rel === "next")
                            Getters["yp"](id, callback, links[i].href);
                    }
                } catch(e) {
                    callback(true, null);
                }

            });
        },

        /* youtube.com search */
        ytSearch: function (terms, callback) {
            for(var i in terms)
                terms[i] = encodeURIComponent(terms[i]);
            var query = terms.join("+");

            var options = {
                host: "gdata.youtube.com",
                port: 443,
                path: "/feeds/api/videos/?q=" + query + "&v=2&alt=json",
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
                    var vids = [];
                    for(var i in data.feed.entry) {
                        try {
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
                    callback(true, null);
                }
            });
        },

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
    };

    return {
        Getters: Getters,
        getMedia: function (id, type, callback) {
            if(type in this.Getters) {
                this.Getters[type](id, callback);
            }
        }
    };
}
