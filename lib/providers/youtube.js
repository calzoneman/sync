var Config = require("../config");
var https = require("https");
var getJSON = require("./util").getJSON;

module.exports = {
    parseLink: function (link) {

    },

    getInfo: function (id, cb) {
        var m = id.match(/([\w-]+)/);
        if (m) {
            id = m[1];
        } else {
            return cb("Invalid video ID", null);
        }

        var options = {
            host: "gdata.youtube.com",
            port: 443,
            path: "/feeds/api/videos/" + id + "?v=2&alt=json",
            method: "GET",
            dataType: "json",
            timeout: 1000
        };

        getJSON(https, options, function (status, data) {
            switch (status) {
                case 200:
                    break;
                case 400:
                    return cb("Invalid request", null);
                case 403:
                    return cb("Private video", null);
                case 404:
                    return cb("Video not found", null);
                case 500:
                    return cb("Internal error", null);
                case 503:
                    return cb("Service unavailable", null);
                default:
                    return cb("Unknown error (HTTP " + status + ")", null);
            }

            try {
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
            } catch (e) {
                cb("Internal error", null);
            }
        });

    }
};
