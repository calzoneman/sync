var Logger = require("./logger");
var Server = require("./server");
var util = require("./utilities");
var MakeEmitter = require("./emitter");
var db = require("./database");
var InfoGetter = require("./get-info");
var Config = require("./config");
var ACP = require("./acp");
var Account = require("./account");
var Flags = require("./flags");

function User(socket) {
    var self = this;
    MakeEmitter(self);
    self.flags = 0;
    self.socket = socket;
    self.realip = socket._realip;
    self.displayip = socket._displayip;
    self.hostmask = socket._hostmask;
    self.account = Account.default(self.realip);
    self.channel = null;
    self.queueLimiter = util.newRateLimiter();
    self.chatLimiter = util.newRateLimiter();
    self.awaytimer = false;

    var announcement = Server.getServer().announcement;
    if (announcement != null) {
        self.socket.emit("announcement", announcement);
    }

    self.socket.once("joinChannel", function (data) {
        if (typeof data !== "object" || typeof data.name !== "string") {
            return;
        }

        if (self.inChannel()) {
            return;
        }

        if (!util.isValidChannelName(data.name)) {
            self.socket.emit("errorMsg", {
                msg: "Invalid channel name.  Channel names may consist of 1-30 " +
                     "characters in the set a-z, A-Z, 0-9, -, and _"
            });
            self.kick("Invalid channel name");
            return;
        }

        data.name = data.name.toLowerCase();
        if (data.name in Config.get("channel-blacklist")) {
            self.kick("This channel is blacklisted.");
            return;
        }

        self.waitFlag(Flags.U_READY, function () {
            var chan = Server.getServer().getChannel(data.name);
            chan.joinUser(self, data);
        });
    });

    self.socket.once("initACP", function () {
        self.waitFlag(Flags.U_LOGGED_IN, function () {
            if (self.account.globalRank >= 255) {
                ACP.init(self);
            } else {
                self.kick("Attempted initACP from non privileged user.  This incident " +
                          "will be reported.");
                Logger.eventlog.log("[acp] Attempted initACP from socket client " +
                                    self.getName() + "@" + self.realip);
            }
        });
    });

    self.socket.on("login", function (data) {
        data = (typeof data === "object") ? data : {};

        var name = data.name;
        if (typeof name !== "string") {
            return;
        }

        var pw = data.pw || "";
        if (typeof pw !== "string") {
            pw = "";
        }

        if (self.is(Flags.U_LOGGING_IN) || self.is(Flags.U_LOGGED_IN)) {
            return;
        }

        if (!pw) {
            self.guestLogin(name);
        } else {
            self.login(name, pw);
        }
    });

    self.on("login", function (account) {
        if (account.globalRank >= 255) {
            self.initAdminCallbacks();
        }
    });
}

User.prototype.die = function () {
    for (var key in this.socket._events) {
        delete this.socket._events[key];
    }

    delete this.socket.typecheckedOn;
    delete this.socket.typecheckedOnce;

    for (var key in this.__evHandlers) {
        delete this.__evHandlers[key];
    }

    if (this.awaytimer) {
        clearTimeout(this.awaytimer);
    }

    this.dead = true;
};

User.prototype.is = function (flag) {
    return Boolean(this.flags & flag);
};

User.prototype.setFlag = function (flag) {
    this.flags |= flag;
    this.emit("setFlag", flag);
};

User.prototype.clearFlag = function (flag) {
    this.flags &= ~flag;
    this.emit("clearFlag", flag);
};

User.prototype.waitFlag = function (flag, cb) {
    var self = this;
    if (self.is(flag)) {
        cb();
    } else {
        var wait = function (f) {
            if (f === flag) {
                self.unbind("setFlag", wait);
                cb();
            }
        };
        self.on("setFlag", wait);
    }
};

User.prototype.getName = function () {
    return this.account.name;
};

User.prototype.getLowerName = function () {
    return this.account.lowername;
};

User.prototype.inChannel = function () {
    return this.channel != null && !this.channel.dead;
};

/* Called when a user's AFK status changes */
User.prototype.setAFK = function (afk) {
    if (!this.inChannel()) {
        return;
    }

    /* No change in AFK status, don't need to change anything */
    if (this.is(Flags.U_AFK) === afk) {
        this.autoAFK();
        return;
    }

    if (afk) {
        this.setFlag(Flags.U_AFK);
        if (this.channel.modules.voteskip) {
            this.channel.modules.voteskip.unvote(this.realip);
        }
    } else {
        this.clearFlag(Flags.U_AFK);
        this.autoAFK();
    }

    /* Number of AFK users changed, voteskip state changes */
    if (this.channel.modules.voteskip) {
        this.channel.modules.voteskip.update();
    }

    this.channel.broadcastAll("setAFK", {
        name: this.getName(),
        afk: afk
    });
};

/* Automatically tag a user as AFK after a period of inactivity */
User.prototype.autoAFK = function () {
    var self = this;
    if (self.awaytimer) {
        clearTimeout(self.awaytimer);
    }

    if (!self.inChannel() || !self.channel.modules.options) {
        return;
    }

    /* Don't set a timer if the duration is invalid */
    var timeout = parseFloat(self.channel.modules.options.get("afk_timeout"));
    if (isNaN(timeout) || timeout <= 0) {
        return;
    }

    self.awaytimer = setTimeout(function () {
        self.setAFK(true);
    }, timeout * 1000);
};

User.prototype.kick = function (reason) {
    this.socket.emit("kick", { reason: reason });
    this.socket.disconnect();
};

User.prototype.initAdminCallbacks = function () {
    var self = this;
    self.socket.on("borrow-rank", function (rank) {
        if (self.inChannel()) {
            if (typeof rank !== "number") {
                return;
            }

            if (rank > self.account.globalRank) {
                return;
            }

            if (rank === 255 && self.account.globalRank > 255) {
                rank = self.account.globalRank;
            }

            self.account.channelRank = rank;
            self.account.effectiveRank = rank;
            self.socket.emit("rank", rank);
            self.channel.broadcastAll("setUserRank", {
                name: self.getName(),
                rank: rank
            });
        }
    });
};

User.prototype.login = function (name, pw) {
    var self = this;
    self.setFlag(Flags.U_LOGGING_IN);

    db.users.verifyLogin(name, pw, function (err, user) {
        if (err) {
            if (err === "Invalid username/password combination") {
                Logger.eventlog.log("[loginfail] Login failed (bad password): " + name
                                  + "@" + self.realip);
            }

            self.socket.emit("login", {
                success: false,
                error: err
            });
            self.clearFlag(Flags.U_LOGGING_IN);
            return;
        }

        var opts = { name: user.name };
        if (self.inChannel()) {
            opts.channel = self.channel.name;
        }
        self.setFlag(Flags.U_REGISTERED);
        self.refreshAccount(opts, function (err, account) {
            if (err) {
                Logger.errlog.log("[SEVERE] getAccount failed for user " + user.name);
                Logger.errlog.log(err);
                self.clearFlag(Flags.U_REGISTERED);
                self.clearFlag(Flags.U_LOGGING_IN);
                return;
            }
            self.socket.emit("login", {
                success: true,
                name: user.name
            });
            db.recordVisit(self.realip, self.getName());
            self.socket.emit("rank", self.account.effectiveRank);
            Logger.syslog.log(self.realip + " logged in as " + user.name);
            self.setFlag(Flags.U_LOGGED_IN);
            self.clearFlag(Flags.U_LOGGING_IN);
            self.emit("login", self.account);
        });
    });
};

var lastguestlogin = {};
User.prototype.guestLogin = function (name) {
    var self = this;

    if (self.realip in lastguestlogin) {
        var diff = (Date.now() - lastguestlogin[self.realip]) / 1000;
        if (diff < Config.get("guest-login-delay")) {
            self.socket.emit("login", {
                success: false,
                error: "Guest logins are restricted to one per IP address per " +
                       Config.get("guest-login-delay") + " seconds."
            });
            return;
        }
    }

    if (!util.isValidUserName(name)) {
        self.socket.emit("login", {
            success: false,
            error: "Invalid username.  Usernames must be 1-20 characters long and " +
                   "consist only of characters a-z, A-Z, 0-9, -, or _."
        });
        return;
    }

    // Prevent duplicate logins
    self.setFlag(Flags.U_LOGGING_IN);
    db.users.isUsernameTaken(name, function (err, taken) {
        self.clearFlag(Flags.U_LOGGING_IN);
        if (err) {
            self.socket.emit("login", {
                success: false,
                error: err
            });
            return;
        }

        if (taken) {
            self.socket.emit("login", {
                success: false,
                error: "That username is registered."
            });
            return;
        }

        if (self.inChannel()) {
            var nameLower = name.toLowerCase();
            for (var i = 0; i < self.channel.users.length; i++) {
                if (self.channel.users[i].getLowerName() === nameLower) {
                    self.socket.emit("login", {
                        success: false,
                        error: "That name is already in use on this channel."
                    });
                    return;
                }
            }
        }

        // Login succeeded
        lastguestlogin[self.realip] = Date.now();

        var opts = { name: name };
        if (self.inChannel()) {
            opts.channel = self.channel.name;
        }
        self.refreshAccount(opts, function (err, account) {
            if (err) {
                Logger.errlog.log("[SEVERE] getAccount failed for guest login " + name);
                Logger.errlog.log(err);
                return;
            }

            self.socket.emit("login", {
                success: true,
                name: name,
                guest: true
            });
            db.recordVisit(self.realip, self.getName());
            self.socket.emit("rank", 0);
            Logger.syslog.log(self.realip + " signed in as " + name);
            self.setFlag(Flags.U_LOGGED_IN);
            self.emit("login", self.account);
        });
    });
};

/* Clean out old login throttlers to save memory */
setInterval(function () {
    var delay = Config.get("guest-login-delay");
    for (var ip in lastguestlogin) {
        var diff = (Date.now() - lastguestlogin[ip]) / 1000;
        if (diff > delay) {
            delete lastguestlogin[ip];
        }
    }

    if (Config.get("aggressive-gc") && global && global.gc) {
        global.gc();
    }
}, 5 * 60 * 1000);

User.prototype.refreshAccount = function (opts, cb) {
    if (!cb) {
        cb = opts;
        opts = {};
    }

    var different = false;
    for (var key in opts) {
        if (opts[key] !== this.account[key]) {
            different = true;
            break;
        }
    }

    if (!different) {
        return;
    }

    var name = ("name" in opts) ? opts.name : this.account.name;
    opts.registered = this.is(Flags.U_REGISTERED);
    var self = this;
    var old = this.account;
    Account.getAccount(name, this.realip, opts, function (err, account) {
        if (!err) {
            /* Update account if anything changed in the meantime */
            for (var key in old) {
                if (self.account[key] !== old[key]) {
                    account[key] = self.account[key];
                }
            }
            self.account = account;
        }
        cb(err, account);
    });
};

module.exports = User;
