var ChannelModule = require("./module");
var Config = require("../config");
var Utilities = require("../utilities");
var url = require("url");

function realTypeOf(thing) {
    return thing === null ? 'null' : typeof thing;
}

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
        playlist_max_per_user: 0,  // Maximum number of playlist items per user
        new_user_chat_delay: 0,      // Minimum account/IP age to chat
        new_user_chat_link_delay: 0  // Minimum account/IP age to post links
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

    var sendUpdate = false;

    if ("allow_voteskip" in data) {
        this.opts.allow_voteskip = Boolean(data.allow_voteskip);
        sendUpdate = true;
    }

    if ("voteskip_ratio" in data) {
        var ratio = parseFloat(data.voteskip_ratio);
        if (isNaN(ratio) || ratio < 0) {
            ratio = 0;
        }
        this.opts.voteskip_ratio = ratio;
        sendUpdate = true;
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
        sendUpdate = true;
    }

    if ("pagetitle" in data && user.account.effectiveRank >= 3) {
        var title = (""+data.pagetitle).substring(0, 100);
        if (!title.trim().match(Config.get("reserved-names.pagetitles"))) {
            this.opts.pagetitle = (""+data.pagetitle).substring(0, 100);
            sendUpdate = true;
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
        sendUpdate = true;
    }

    if ("externalcss" in data && user.account.effectiveRank >= 3) {
        var prefix = "Invalid URL for external CSS: ";
        if (typeof data.externalcss !== "string") {
            user.socket.emit("validationError", {
                target: "#cs-externalcss",
                message: prefix + "URL must be a string, not "
                        + realTypeOf(data.externalcss)
            });
        }

        var link = data.externalcss.substring(0, 255).trim();
        if (!link) {
            sendUpdate = (this.opts.externalcss !== "");
            this.opts.externalcss = "";
            user.socket.emit("validationPassed", {
                target: "#cs-externalcss"
            });
        } else {
            var data = url.parse(link);
            if (!data.protocol || data.protocol !== 'https:') {
                user.socket.emit("validationError", {
                    target: "#cs-externalcss",
                    message: prefix + " URL must begin with 'https://'"
                });
            } else if (!data.host) {
                user.socket.emit("validationError", {
                    target: "#cs-externalcss",
                    message: prefix + "missing hostname"
                });
            } else {
                user.socket.emit("validationPassed", {
                    target: "#cs-externalcss"
                });
                this.opts.externalcss = data.href;
                sendUpdate = true;
            }
        }
    }

    if ("externaljs" in data && user.account.effectiveRank >= 3) {
        var prefix = "Invalid URL for external JS: ";
        if (typeof data.externaljs !== "string") {
            user.socket.emit("validationError", {
                target: "#cs-externaljs",
                message: prefix + "URL must be a string, not "
                        + realTypeOf(data.externaljs)
            });
        }

        var link = data.externaljs.substring(0, 255).trim();
        if (!link) {
            sendUpdate = (this.opts.externaljs !== "");
            this.opts.externaljs = "";
            user.socket.emit("validationPassed", {
                target: "#cs-externaljs"
            });
        } else {
            var data = url.parse(link);
            if (!data.protocol || data.protocol !== 'https:') {
                user.socket.emit("validationError", {
                    target: "#cs-externaljs",
                    message: prefix + " URL must begin with 'https://'"
                });
            } else if (!data.host) {
                user.socket.emit("validationError", {
                    target: "#cs-externaljs",
                    message: prefix + "missing hostname"
                });
            } else {
                user.socket.emit("validationPassed", {
                    target: "#cs-externaljs"
                });
                this.opts.externaljs = data.href;
                sendUpdate = true;
            }
        }
    }

    if ("chat_antiflood" in data) {
        this.opts.chat_antiflood = Boolean(data.chat_antiflood);
        sendUpdate = true;
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
        sendUpdate = true;
    }

    if ("show_public" in data && user.account.effectiveRank >= 3) {
        this.opts.show_public = Boolean(data.show_public);
        sendUpdate = true;
    }

    if ("enable_link_regex" in data) {
        this.opts.enable_link_regex = Boolean(data.enable_link_regex);
        sendUpdate = true;
    }

    if ("password" in data && user.account.effectiveRank >= 3) {
        var pw = data.password + "";
        pw = pw === "" ? false : pw.substring(0, 100);
        this.opts.password = pw;
        sendUpdate = true;
    }

    if ("allow_dupes" in data) {
        this.opts.allow_dupes = Boolean(data.allow_dupes);
        sendUpdate = true;
    }

    if ("torbanned" in data && user.account.effectiveRank >= 3) {
        this.opts.torbanned = Boolean(data.torbanned);
        sendUpdate = true;
    }

    if ("allow_ascii_control" in data && user.account.effectiveRank >= 3) {
        this.opts.allow_ascii_control = Boolean(data.allow_ascii_control);
        sendUpdate = true;
    }

    if ("playlist_max_per_user" in data && user.account.effectiveRank >= 3) {
        var max = parseInt(data.playlist_max_per_user);
        if (!isNaN(max) && max >= 0) {
            this.opts.playlist_max_per_user = max;
            sendUpdate = true;
        }
    }

    if ("new_user_chat_delay" in data) {
        var delay = data.new_user_chat_delay;
        if (!isNaN(delay) && delay >= 0) {
            this.opts.new_user_chat_delay = delay;
            sendUpdate = true;
        }
    }

    if ("new_user_chat_link_delay" in data) {
        var delay = data.new_user_chat_link_delay;
        if (!isNaN(delay) && delay >= 0) {
            this.opts.new_user_chat_link_delay = delay;
            sendUpdate = true;
        }
    }

    this.channel.logger.log("[mod] " + user.getName() + " updated channel options");
    if (sendUpdate) {
        this.sendOpts(this.channel.users);
    }
};

module.exports = OptionsModule;
