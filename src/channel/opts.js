var ChannelModule = require("./module");
var Config = require("../config");
var Utilities = require("../utilities");
var url = require("url");

function OptionsModule(channel) {
    ChannelModule.apply(this, arguments);
    this.opts = {
        allow_voteskip: true,      // Allow users to voteskip
        voteskip_ratio: 0.5,       // Ratio of skip votes:non-afk users needed to skip the video
        afk_timeout: 600,          // Number of seconds before a user is automatically marked afk
        pagetitle: this.channel.name, // Title of the browser tab
        maxlength: 0,              // Maximum length (in seconds) of a video queued
        externalcss: "",           // Link to external stylesheet
        externaljs: "",            // Link to external script
        chat_antiflood: false,     // Throttle chat messages
        chat_antiflood_params: {
            burst: 4,              // Number of messages to allow with no throttling
            sustained: 1,          // Throttle rate (messages/second)
            cooldown: 4            // Number of seconds with no messages before burst is reset
        },
        show_public: false,        // List the channel on the index page
        enable_link_regex: true,   // Use the built-in link filter
        password: false,           // Channel password (false -> no password required for entry)
        allow_dupes: false,        // Allow duplicate videos on the playlist
        torbanned: false,          // Block connections from Tor exit nodes
        allow_ascii_control: false,// Allow ASCII control characters (\x00-\x1f)
        playlist_max_per_user: 0   // Maximum number of playlist items per user
    };
}

OptionsModule.prototype = Object.create(ChannelModule.prototype);

OptionsModule.prototype.load = function (data) {
    if ("opts" in data) {
        for (var key in this.opts) {
            if (key in data.opts) {
                this.opts[key] = data.opts[key];
            }
        }
    }

    this.opts.chat_antiflood_params.burst = Math.min(20,
            this.opts.chat_antiflood_params.burst);
    this.opts.chat_antiflood_params.sustained = Math.min(10,
            this.opts.chat_antiflood_params.sustained);
};

OptionsModule.prototype.save = function (data) {
    data.opts = this.opts;
};

OptionsModule.prototype.packInfo = function (data, isAdmin) {
    data.pagetitle = this.opts.pagetitle;
    data.public = this.opts.show_public;
    if (isAdmin) {
        data.hasPassword = this.opts.password !== false;
    }
};

OptionsModule.prototype.get = function (key) {
    return this.opts[key];
};

OptionsModule.prototype.set = function (key, value) {
    this.opts[key] = value;
};

OptionsModule.prototype.onUserPostJoin = function (user) {
    user.socket.on("setOptions", this.handleSetOptions.bind(this, user));

    this.sendOpts([user]);
};

OptionsModule.prototype.sendOpts = function (users) {
    var opts = this.opts;

    if (users === this.channel.users) {
        this.channel.broadcastAll("channelOpts", opts);
    } else {
        users.forEach(function (user) {
            user.socket.emit("channelOpts", opts);
        });
    }
};

OptionsModule.prototype.getPermissions = function () {
    return this.channel.modules.permissions;
};

OptionsModule.prototype.handleSetOptions = function (user, data) {
    if (typeof data !== "object") {
        return;
    }

    if (!this.getPermissions().canSetOptions(user)) {
        user.kick("Attempted setOptions as a non-moderator");
        return;
    }

    if ("allow_voteskip" in data) {
        this.opts.allow_voteskip = Boolean(data.allow_voteskip);
    }

    if ("voteskip_ratio" in data) {
        var ratio = parseFloat(data.voteskip_ratio);
        if (isNaN(ratio) || ratio < 0) {
            ratio = 0;
        }
        this.opts.voteskip_ratio = ratio;
    }

    if ("afk_timeout" in data) {
        var tm = parseInt(data.afk_timeout);
        if (isNaN(tm) || tm < 0) {
            tm = 0;
        }

        var same = tm === this.opts.afk_timeout;
        this.opts.afk_timeout = tm;
        if (!same) {
            this.channel.users.forEach(function (u) {
                u.autoAFK();
            });
        }
    }

    if ("pagetitle" in data && user.account.effectiveRank >= 3) {
        var title = (""+data.pagetitle).substring(0, 100);
        if (!title.trim().match(Config.get("reserved-names.pagetitles"))) {
            this.opts.pagetitle = (""+data.pagetitle).substring(0, 100);
        } else {
            user.socket.emit("errorMsg", {
                msg: "That pagetitle is reserved",
                alert: true
            });
        }
    }

    if ("maxlength" in data) {
        var ml = 0;
        if (typeof data.maxlength !== "number") {
           ml = Utilities.parseTime(data.maxlength);
        } else {
            ml = parseInt(data.maxlength);
        }

        if (isNaN(ml) || ml < 0) {
            ml = 0;
        }
        this.opts.maxlength = ml;
    }

    if ("externalcss" in data && user.account.effectiveRank >= 3) {
        var link = (""+data.externalcss).substring(0, 255);
        if (!link) {
            this.opts.externalcss = "";
        } else {
            try {
                var data = url.parse(link);
                if (!data.protocol || !data.protocol.match(/^(https?|ftp):/)) {
                    throw "Unacceptable protocol " + data.protocol;
                } else if (!data.host) {
                    throw "URL is missing host";
                } else {
                    link = data.href;
                }
            } catch (e) {
                user.socket.emit("errorMsg", {
                    msg: "Invalid URL for external CSS: " + e,
                    alert: true
                });
                return;
            }

            this.opts.externalcss = link;
        }
    }

    if ("externaljs" in data && user.account.effectiveRank >= 3) {
        var link = (""+data.externaljs).substring(0, 255);
        if (!link) {
            this.opts.externaljs = "";
        } else {

            try {
                var data = url.parse(link);
                if (!data.protocol || !data.protocol.match(/^(https?|ftp):/)) {
                    throw "Unacceptable protocol " + data.protocol;
                } else if (!data.host) {
                    throw "URL is missing host";
                } else {
                    link = data.href;
                }
            } catch (e) {
                user.socket.emit("errorMsg", {
                    msg: "Invalid URL for external JS: " + e,
                    alert: true
                });
                return;
            }

            this.opts.externaljs = link;
        }
    }

    if ("chat_antiflood" in data) {
        this.opts.chat_antiflood = Boolean(data.chat_antiflood);
    }

    if ("chat_antiflood_params" in data) {
        if (typeof data.chat_antiflood_params !== "object") {
            data.chat_antiflood_params = {
                burst: 4,
                sustained: 1
            };
        }

        var b = parseInt(data.chat_antiflood_params.burst);
        if (isNaN(b) || b < 0) {
            b = 1;
        }

        b = Math.min(20, b);

        var s = parseFloat(data.chat_antiflood_params.sustained);
        if (isNaN(s) || s <= 0) {
            s = 1;
        }

        s = Math.min(10, s);

        var c = b / s;
        this.opts.chat_antiflood_params = {
            burst: b,
            sustained: s,
            cooldown: c
        };
    }

    if ("show_public" in data && user.account.effectiveRank >= 3) {
        this.opts.show_public = Boolean(data.show_public);
    }

    if ("enable_link_regex" in data) {
        this.opts.enable_link_regex = Boolean(data.enable_link_regex);
    }

    if ("password" in data && user.account.effectiveRank >= 3) {
        var pw = data.password + "";
        pw = pw === "" ? false : pw.substring(0, 100);
        this.opts.password = pw;
    }

    if ("allow_dupes" in data) {
        this.opts.allow_dupes = Boolean(data.allow_dupes);
    }

    if ("torbanned" in data && user.account.effectiveRank >= 3) {
        this.opts.torbanned = Boolean(data.torbanned);
    }

    if ("allow_ascii_control" in data && user.account.effectiveRank >= 3) {
        this.opts.allow_ascii_control = Boolean(data.allow_ascii_control);
    }

    if ("playlist_max_per_user" in data && user.account.effectiveRank >= 3) {
        var max = parseInt(data.playlist_max_per_user);
        if (!isNaN(max) && max >= 0) {
            this.opts.playlist_max_per_user = max;
        }
    }

    this.channel.logger.log("[mod] " + user.getName() + " updated channel options");
    this.sendOpts(this.channel.users);
};

module.exports = OptionsModule;
