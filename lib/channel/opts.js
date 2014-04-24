var ChannelModule = require("./module");

function OptionsModule(channel) {
    ChannelModule.apply(this, arguments);
    this.opts = {
        allow_voteskip: true,    // Allow users to voteskip
        voteskip_ratio: 0.5,     // Ratio of skip votes:non-afk users needed to skip the video
        afk_timeout: 600,        // Number of seconds before a user is automatically marked afk
        pagetitle: this.channel.name, // Title of the browser tab
        maxlength: 0,            // Maximum length (in seconds) of a video queued
        externalcss: "",         // Link to external stylesheet
        externaljs: "",          // Link to external script
        chat_antiflood: false,   // Throttle chat messages
        chat_antiflood_params: {
            burst: 4,            // Number of messages to allow with no throttling
            sustained: 1,        // Throttle rate (messages/second)
            cooldown: 4          // Number of seconds with no messages before burst is reset
        },
        show_public: false,      // List the channel on the index page
        enable_link_regex: true, // Use the built-in link filter
        password: false          // Channel password (false -> no password required for entry)
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
};

OptionsModule.prototype.save = function (data) {
    data.opts = this.opts;
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

    if ("pagetitle" in data && user.rank >= 3) {
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
        var ml = parseInt(data.maxlength);
        if (isNaN(ml) || ml < 0) {
            ml = 0;
        }
        this.opts.maxlength = ml;
    }

    if ("externalcss" in data && user.rank >= 3) {
        this.opts.externalcss = (""+data.externalcss).substring(0, 255);
    }

    if ("externaljs" in data && user.rank >= 3) {
        this.opts.externaljs = (""+data.externaljs).substring(0, 255);
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

        var s = parseInt(data.chat_antiflood_params.sustained);
        if (isNaN(s) || s <= 0) {
            s = 1;
        }

        var c = b / s;
        this.opts.chat_antiflood_params = {
            burst: b,
            sustained: s,
            cooldown: c
        };
    }

    if ("show_public" in data && user.rank >= 3) {
        this.opts.show_public = Boolean(data.show_public);
    }

    if ("enable_link_regex" in data) {
        this.opts.enable_link_regex = Boolean(data.enable_link_regex);
    }

    if ("password" in data && user.rank >= 3) {
        var pw = data.password + "";
        pw = pw === "" ? false : pw.substring(0, 100);
        this.opts.password = pw;
    }

    this.channel.logger.log("[mod] " + user.name + " updated channel options");
    this.sendOpts(this.channel.users);
};

module.exports = OptionsModule;
