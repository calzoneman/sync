var ChannelModule = require("./module");
var Config = require("../config");
var Utilities = require("../utilities");
var url = require("url");

function realTypeOf(thing) {
    return thing === null ? 'null' : typeof thing;
}

function OptionsModule(_channel) {
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
        block_anonymous_users: false, //Only allow connections from registered users.
        allow_ascii_control: false,// Allow ASCII control characters (\x00-\x1f)
        playlist_max_per_user: 0,  // Maximum number of playlist items per user
        new_user_chat_delay: 0,      // Minimum account/IP age to chat
        new_user_chat_link_delay: 0, // Minimum account/IP age to post links
        playlist_max_duration_per_user: 0 // Maximum total playlist time per user
    };

    this.supportsDirtyCheck = true;
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

    this.opts.pagetitle = unzalgo(this.opts.pagetitle);
    this.opts.chat_antiflood_params.burst = Math.min(
        20,
        this.opts.chat_antiflood_params.burst
    );
    this.opts.chat_antiflood_params.sustained = Math.min(
        10,
        this.opts.chat_antiflood_params.sustained
    );
    this.opts.afk_timeout = Math.min(86400 /* one day */, this.opts.afk_timeout);
    this.dirty = false;
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
            user.socket.emit("validationError", {
                target: "#cs-voteskip_ratio",
                message: `Input must be a number 0 or greater, not "${data.voteskip_ratio}"`
            });
        } else {
            this.opts.voteskip_ratio = ratio;
            sendUpdate = true;
            user.socket.emit("validationPassed", {
                target: "#cs-voteskip_ratio"
            });
        }
    }

    if ("afk_timeout" in data) {
        var tm = parseInt(data.afk_timeout);
        if (isNaN(tm) || tm < 0 || tm > 86400 /* one day */) {
            tm = 0;
            user.socket.emit("validationError", {
                target: "#cs-afk_timeout",
                message: "AFK timeout must be between 1 and 86400 seconds (or 0 to disable)"
            });
        } else {
            user.socket.emit("validationPassed", {
                target: "#cs-afk_timeout",
            });

            var same = tm === this.opts.afk_timeout;
            this.opts.afk_timeout = tm;
            if (!same) {
                this.channel.users.forEach(function (u) {
                    u.autoAFK();
                });
            }
            sendUpdate = true;
        }
    }

    if ("pagetitle" in data && user.account.effectiveRank >= 3) {
        var title = unzalgo((""+data.pagetitle).substring(0, 100));
        if (!title.trim().match(Config.get("reserved-names.pagetitles"))) {
            this.opts.pagetitle = title;
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

    if ("playlist_max_duration_per_user" in data) {
        const max = data.playlist_max_duration_per_user;
        if (typeof max !== "number" || isNaN(max) || max < 0) {
            user.socket.emit("errorMsg", {
                msg: `Expected number for playlist_max_duration_per_user, not "${max}"`
            });
        } else {
            this.opts.playlist_max_duration_per_user = max;
            sendUpdate = true;
        }
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
            var urldata = url.parse(link);
            if (!urldata.protocol || urldata.protocol !== 'https:') {
                user.socket.emit("validationError", {
                    target: "#cs-externalcss",
                    message: prefix + " URL must begin with 'https://'"
                });
            } else if (!urldata.host) {
                user.socket.emit("validationError", {
                    target: "#cs-externalcss",
                    message: prefix + "missing hostname"
                });
            } else {
                user.socket.emit("validationPassed", {
                    target: "#cs-externalcss"
                });
                this.opts.externalcss = urldata.href;
                sendUpdate = true;
            }
        }
    }

    if ("externaljs" in data && user.account.effectiveRank >= 3) {
        const prefix = "Invalid URL for external JS: ";
        if (typeof data.externaljs !== "string") {
            user.socket.emit("validationError", {
                target: "#cs-externaljs",
                message: prefix + "URL must be a string, not "
                        + realTypeOf(data.externaljs)
            });
        }

        const link = data.externaljs.substring(0, 255).trim();
        if (!link) {
            sendUpdate = (this.opts.externaljs !== "");
            this.opts.externaljs = "";
            user.socket.emit("validationPassed", {
                target: "#cs-externaljs"
            });
        } else {
            const urldata = url.parse(link);
            if (!urldata.protocol || urldata.protocol !== 'https:') {
                user.socket.emit("validationError", {
                    target: "#cs-externaljs",
                    message: prefix + " URL must begin with 'https://'"
                });
            } else if (!urldata.host) {
                user.socket.emit("validationError", {
                    target: "#cs-externaljs",
                    message: prefix + "missing hostname"
                });
            } else {
                user.socket.emit("validationPassed", {
                    target: "#cs-externaljs"
                });
                this.opts.externaljs = urldata.href;
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

    if("block_anonymous_users" in data && user.account.effectiveRank >=3){
        this.opts.block_anonymous_users = Boolean(data.block_anonymous_users);
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
        const delay = data.new_user_chat_delay;
        if (!isNaN(delay) && delay >= 0) {
            this.opts.new_user_chat_delay = delay;
            sendUpdate = true;
        }
    }

    if ("new_user_chat_link_delay" in data) {
        const delay = data.new_user_chat_link_delay;
        if (!isNaN(delay) && delay >= 0) {
            this.opts.new_user_chat_link_delay = delay;
            sendUpdate = true;
        }
    }

    this.channel.logger.log("[mod] " + user.getName() + " updated channel options");
    if (sendUpdate) {
        this.dirty = true;
        this.sendOpts(this.channel.users);
    }
};

// Forgive me
const combiners = /[\u0300-\u036f\u0483-\u0487\u0591-\u05bd\u05bf-\u05bf\u05c1-\u05c2\u05c4-\u05c5\u05c7-\u05c7\u0610-\u061a\u064b-\u065f\u0670-\u0670\u06d6-\u06dc\u06df-\u06e4\u06e7-\u06e8\u06ea-\u06ed\u0711-\u0711\u0730-\u074a\u07a6-\u07b0\u07eb-\u07f3\u0816-\u0819\u081b-\u0823\u0825-\u0827\u0829-\u082d\u0859-\u085b\u08e4-\u0902\u093a-\u093a\u093c-\u093c\u0941-\u0948\u094d-\u094d\u0951-\u0957\u0962-\u0963\u0981-\u0981\u09bc-\u09bc\u09c1-\u09c4\u09cd-\u09cd\u09e2-\u09e3\u0a01-\u0a02\u0a3c-\u0a3c\u0a41-\u0a42\u0a47-\u0a48\u0a4b-\u0a4d\u0a51-\u0a51\u0a70-\u0a71\u0a75-\u0a75\u0a81-\u0a82\u0abc-\u0abc\u0ac1-\u0ac5\u0ac7-\u0ac8\u0acd-\u0acd\u0ae2-\u0ae3\u0b01-\u0b01\u0b3c-\u0b3c\u0b3f-\u0b3f\u0b41-\u0b44\u0b4d-\u0b4d\u0b56-\u0b56\u0b62-\u0b63\u0b82-\u0b82\u0bc0-\u0bc0\u0bcd-\u0bcd\u0c00-\u0c00\u0c3e-\u0c40\u0c46-\u0c48\u0c4a-\u0c4d\u0c55-\u0c56\u0c62-\u0c63\u0c81-\u0c81\u0cbc-\u0cbc\u0cbf-\u0cbf\u0cc6-\u0cc6\u0ccc-\u0ccd\u0ce2-\u0ce3\u0d01-\u0d01\u0d41-\u0d44\u0d4d-\u0d4d\u0d62-\u0d63\u0dca-\u0dca\u0dd2-\u0dd4\u0dd6-\u0dd6\u0e31-\u0e31\u0e34-\u0e3a\u0e47-\u0e4e\u0eb1-\u0eb1\u0eb4-\u0eb9\u0ebb-\u0ebc\u0ec8-\u0ecd\u0f18-\u0f19\u0f35-\u0f35\u0f37-\u0f37\u0f39-\u0f39\u0f71-\u0f7e\u0f80-\u0f84\u0f86-\u0f87\u0f8d-\u0f97\u0f99-\u0fbc\u0fc6-\u0fc6\u102d-\u1030\u1032-\u1037\u1039-\u103a\u103d-\u103e\u1058-\u1059\u105e-\u1060\u1071-\u1074\u1082-\u1082\u1085-\u1086\u108d-\u108d\u109d-\u109d\u135d-\u135f\u1712-\u1714\u1732-\u1734\u1752-\u1753\u1772-\u1773\u17b4-\u17b5\u17b7-\u17bd\u17c6-\u17c6\u17c9-\u17d3\u17dd-\u17dd\u180b-\u180d\u18a9-\u18a9\u1920-\u1922\u1927-\u1928\u1932-\u1932\u1939-\u193b\u1a17-\u1a18\u1a1b-\u1a1b\u1a56-\u1a56\u1a58-\u1a5e\u1a60-\u1a60\u1a62-\u1a62\u1a65-\u1a6c\u1a73-\u1a7c\u1a7f-\u1a7f\u1ab0-\u1abd\u1b00-\u1b03\u1b34-\u1b34\u1b36-\u1b3a\u1b3c-\u1b3c\u1b42-\u1b42\u1b6b-\u1b73\u1b80-\u1b81\u1ba2-\u1ba5\u1ba8-\u1ba9\u1bab-\u1bad\u1be6-\u1be6\u1be8-\u1be9\u1bed-\u1bed\u1bef-\u1bf1\u1c2c-\u1c33\u1c36-\u1c37\u1cd0-\u1cd2\u1cd4-\u1ce0\u1ce2-\u1ce8\u1ced-\u1ced\u1cf4-\u1cf4\u1cf8-\u1cf9\u1dc0-\u1df5\u1dfc-\u1dff\u20d0-\u20dc\u20e1-\u20e1\u20e5-\u20f0\u2cef-\u2cf1\u2d7f-\u2d7f\u2de0-\u2dff\u302a-\u302d\u3099-\u309a\ua66f-\ua66f\ua674-\ua67d\ua69f-\ua69f\ua6f0-\ua6f1\ua802-\ua802\ua806-\ua806\ua80b-\ua80b\ua825-\ua826\ua8c4-\ua8c4\ua8e0-\ua8f1\ua926-\ua92d\ua947-\ua951\ua980-\ua982\ua9b3-\ua9b3\ua9b6-\ua9b9\ua9bc-\ua9bc\ua9e5-\ua9e5\uaa29-\uaa2e\uaa31-\uaa32\uaa35-\uaa36\uaa43-\uaa43\uaa4c-\uaa4c\uaa7c-\uaa7c\uaab0-\uaab0\uaab2-\uaab4\uaab7-\uaab8\uaabe-\uaabf\uaac1-\uaac1\uaaec-\uaaed\uaaf6-\uaaf6\uabe5-\uabe5\uabe8-\uabe8\uabed-\uabed\ufb1e-\ufb1e\ufe00-\ufe0f\ufe20-\ufe2d]/g;

function unzalgo(text) {
    // TODO: consider only removing stacked combiners so that legitimate
    // single combining characters can be used.

    return text.replace(combiners, '');
}

module.exports = OptionsModule;
