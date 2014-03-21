var url = require("url");

module.exports = {
    provider_name: "YouTube",

    parseLink: function (link) {
        var data;
        try {
            data = url.parse(link);
        } catch (e) {
            return null;
        }

        var host = data.hostname.replace(/^www\./, "").toLowerCase();
        if (host === "youtu.be") {
            return {
                id: data.pathname.substring(1),
                type: "yt"
            };
        } else if (host === "youtube.com") {
            if (data.pathname === "/watch") {
                return {
                    id: data.query.v,
                    type: "yt"
                };
            }
        }

        return null;
    },

    lookupData: function (id, cb) {
        var m = id.match(/([\w-]+)/);
        if (m) {
            id = m[1];
        } else {
            cb("Invalid ID", null);
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

        if(Config.get("youtube-v2-key")) {
            options.headers = {
                "X-Gdata-Key": "key=" + Config.get("youtube-v2-key")
            };
        }

        urlRetrieve(https, options, function (status, data) {
            if(status === 404) {
                cb("Video not found", null);
                return;
            } else if(status === 403) {
                cb("Private video", null);
                return;
            } else if(status === 400) {
                cb("Invalid video", null);
                return;
            } else if(status === 503) {
                cb("API failure", null);
                return;
            } else if(status !== 200) {
                cb("HTTP " + status, null);
                return;
            }

            var buffer = data;
            try {
                data = JSON.parse(data);
                if (data.entry.yt$accessControl) {
                    var ac = data.entry.yt$accessControl;
                    for (var i = 0; i < ac.length; i++) {
                        if (ac[i].action === "embed") {
                            if (ac[i].permission === "denied") {
                                cb("Embedding disabled", null);
                                return;
                            }
                            break;
                        }
                    }
                }

                var seconds = data.entry.media$group.yt$duration.seconds;
                var title = data.entry.title.$t;
                var media = new Media(id, title, seconds, "yt");
                if (data.entry.media$group.media$restriction) {
                    var rest = data.entry.media$group.media$restriction;
                    if (rest.length > 0) {
                        if (rest[0].relationship === "deny") {
                            media.restricted = rest[0].$t;
                        }
                    }
                }
                cb(false, media);
            } catch(e) {
                // Gdata version 2 has the rather silly habit of
                // returning error codes in XML when I explicitly asked
                // for JSON
                var m = buffer.match(/<internalReason>([^<]+)<\/internalReason>/);
                if (m === null) {
                    m = buffer.match(/<code>([^<]+)<\/code>/);
                }

                var err = e;
                if (m) {
                    if (m[1] === "too_many_recent_calls") {
                        err = "YouTube is throttling the server right "+
                               "now for making too many requests.  "+
                               "Please try again in a moment.";
                    } else {
                        err = m[1];
                    }
                }

                cb(err, null);
            }
        });
    },

    setup: function (cb) {
        cb();
    }
};
