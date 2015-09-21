var MakeEmitter = require("../emitter");
var Logger = require("../logger");
var ChannelModule = require("./module");
var Flags = require("../flags");
var Account = require("../account");
var util = require("../utilities");
var fs = require("graceful-fs");
var path = require("path");
var sio = require("socket.io");
var db = require("../database");

const SIZE_LIMIT = 1048576;

/**
 * Previously, async channel functions were riddled with race conditions due to
 * an event causing the channel to be unloaded while a pending callback still
 * needed to reference it.
 *
 * This solution should be better than constantly checking whether the channel
 * has been unloaded in nested callbacks.  The channel won't be unloaded until
 * nothing needs it anymore.  Conceptually similar to a reference count.
 */
function ActiveLock(channel) {
    this.channel = channel;
    this.count = 0;
}

ActiveLock.prototype = {
    lock: function () {
        this.count++;
    },

    release: function () {
        this.count--;
        if (this.count === 0) {
            /* sanity check */
            if (this.channel.users.length > 0) {
                Logger.errlog.log("Warning: ActiveLock count=0 but users.length > 0 (" +
                                  "channel: " + this.channel.name + ")");
                this.count = this.channel.users.length;
            } else {
                this.channel.emit("empty");
            }
        }
    }
};

function Channel(name) {
    MakeEmitter(this);
    this.name = name;
    this.uniqueName = name.toLowerCase();
    this.modules = {};
    this.logger = new Logger.Logger(path.join(__dirname, "..", "..", "chanlogs",
                                              this.uniqueName + ".log"));
    this.users = [];
    this.activeLock = new ActiveLock(this);
    this.flags = 0;
    var self = this;
    db.channels.load(this, function (err) {
        if (err && err !== "Channel is not registered") {
            return;
        } else {
            self.initModules();
            self.loadState();
        }
    });
}

Channel.prototype.is = function (flag) {
    return Boolean(this.flags & flag);
};

Channel.prototype.setFlag = function (flag) {
    this.flags |= flag;
    this.emit("setFlag", flag);
};

Channel.prototype.clearFlag = function (flag) {
    this.flags &= ~flag;
    this.emit("clearFlag", flag);
};

Channel.prototype.waitFlag = function (flag, cb) {
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

Channel.prototype.moderators = function () {
    return this.users.filter(function (u) {
        return u.account.effectiveRank >= 2;
    });
};

Channel.prototype.initModules = function () {
    const modules = {
        "./permissions"   : "permissions",
        "./emotes"        : "emotes",
        "./chat"          : "chat",
        "./drink"         : "drink",
        "./filters"       : "filters",
        "./customization" : "customization",
        "./opts"          : "options",
        "./library"       : "library",
        "./playlist"      : "playlist",
        "./mediarefresher": "mediarefresher",
        "./voteskip"      : "voteskip",
        "./poll"          : "poll",
        "./kickban"       : "kickban",
        "./ranks"         : "rank",
        "./accesscontrol" : "password"
    };

    var self = this;
    var inited = [];
    Object.keys(modules).forEach(function (m) {
        var ctor = require(m);
        var module = new ctor(self);
        self.modules[modules[m]] = module;
        inited.push(modules[m]);
    });

    self.logger.log("[init] Loaded modules: " + inited.join(", "));
};

Channel.prototype.getDiskSize = function (cb) {
    if (this._getDiskSizeTimeout > Date.now()) {
        return cb(null, this._cachedDiskSize);
    }

    var self = this;
    var file = path.join(__dirname, "..", "..", "chandump", self.uniqueName);
    fs.stat(file, function (err, stats) {
        if (err) {
            return cb(err);
        }

        self._cachedDiskSize = stats.size;
        cb(null, self._cachedDiskSize);
    });
};

Channel.prototype.loadState = function () {
    var self = this;
    var file = path.join(__dirname, "..", "..", "chandump", self.uniqueName);

    /* Don't load from disk if not registered */
    if (!self.is(Flags.C_REGISTERED)) {
        self.modules.permissions.loadUnregistered();
        self.setFlag(Flags.C_READY);
        return;
    }

    var errorLoad = function (msg) {
        if (self.modules.customization) {
            self.modules.customization.load({
                motd: msg
            });
        }

        self.setFlag(Flags.C_READY | Flags.C_ERROR);
    };

    fs.stat(file, function (err, stats) {
        if (!err) {
            var mb = stats.size / 1048576;
            mb = Math.floor(mb * 100) / 100;
            if (mb > SIZE_LIMIT / 1048576) {
                Logger.errlog.log("Large chandump detected: " + self.uniqueName +
                                  " (" + mb + " MiB)");
                var msg = "This channel's state size has exceeded the memory limit " +
                          "enforced by this server.  Please contact an administrator " +
                          "for assistance.";
                errorLoad(msg);
                return;
            }
        }
        continueLoad();
    });

    var continueLoad = function () {
        fs.readFile(file, function (err, data) {
            if (err) {
                /* ENOENT means the file didn't exist.  This is normal for new channels */
                if (err.code === "ENOENT") {
                    self.setFlag(Flags.C_READY);
                    Object.keys(self.modules).forEach(function (m) {
                        self.modules[m].load({});
                    });
                } else {
                    Logger.errlog.log("Failed to open channel dump " + self.uniqueName);
                    Logger.errlog.log(err);
                    errorLoad("Unknown error occurred when loading channel state.  " +
                              "Contact an administrator for assistance.");
                }
                return;
            }

            self.logger.log("[init] Loading channel state from disk");
            try {
                data = JSON.parse(data);
                Object.keys(self.modules).forEach(function (m) {
                    self.modules[m].load(data);
                });
                self.setFlag(Flags.C_READY);
            } catch (e) {
                Logger.errlog.log("Channel dump for " + self.uniqueName + " is not " +
                                  "valid");
                Logger.errlog.log(e);
                errorLoad("Unknown error occurred when loading channel state.  Contact " +
                          "an administrator for assistance.");
            }
        });
    };
};

Channel.prototype.saveState = function () {
    var self = this;
    var file = path.join(__dirname, "..", "..", "chandump", self.uniqueName);

    /**
     * Don't overwrite saved state data if the current state is dirty,
     * or if this channel is unregistered
     */
    if (self.is(Flags.C_ERROR) || !self.is(Flags.C_REGISTERED)) {
        return;
    }

    self.logger.log("[init] Saving channel state to disk");
    var data = {};
    Object.keys(this.modules).forEach(function (m) {
        self.modules[m].save(data);
    });

    var json = JSON.stringify(data);
    /**
     * Synchronous on purpose.
     * When the server is shutting down, saveState() is called on all channels and
     * then the process terminates.  Async writeFile causes a race condition that wipes
     * channels.
     */
    var err = fs.writeFileSync(file, json);

    // Check for large chandump and warn moderators/admins
    self.getDiskSize(function (err, size) {
        if (!err && size > SIZE_LIMIT && self.users) {
            self.users.forEach(function (u) {
                if (u.account.effectiveRank >= 2) {
                    u.socket.emit("warnLargeChandump", {
                        limit: SIZE_LIMIT,
                        actual: size
                    });
                }
            });
        }
    });
};

Channel.prototype.checkModules = function (fn, args, cb) {
    var self = this;
    this.waitFlag(Flags.C_READY, function () {
        self.activeLock.lock();
        var keys = Object.keys(self.modules);
        var next = function (err, result) {
            if (result !== ChannelModule.PASSTHROUGH) {
                /* Either an error occured, or the module denied the user access */
                cb(err, result);
                self.activeLock.release();
                return;
            }

            var m = keys.shift();
            if (m === undefined) {
                /* No more modules to check */
                cb(null, ChannelModule.PASSTHROUGH);
                self.activeLock.release();
                return;
            }

            var module = self.modules[m];
            module[fn].apply(module, args);
        };

        args.push(next);
        next(null, ChannelModule.PASSTHROUGH);
    });
};

Channel.prototype.notifyModules = function (fn, args) {
    var self = this;
    this.waitFlag(Flags.C_READY, function () {
        var keys = Object.keys(self.modules);
        keys.forEach(function (k) {
            self.modules[k][fn].apply(self.modules[k], args);
        });
    });
};

Channel.prototype.joinUser = function (user, data) {
    var self = this;

    self.activeLock.lock();
    self.waitFlag(Flags.C_READY, function () {
        /* User closed the connection before the channel finished loading */
        if (user.socket.disconnected) {
            self.activeLock.release();
            return;
        }

        if (self.is(Flags.C_REGISTERED)) {
            user.refreshAccount({ channel: self.name }, function (err, account) {
                if (err) {
                    Logger.errlog.log("user.refreshAccount failed at Channel.joinUser");
                    Logger.errlog.log(err.stack);
                    self.activeLock.release();
                    return;
                }

                afterAccount();
            });
        } else {
            afterAccount();
        }

        function afterAccount() {
            if (self.dead || user.socket.disconnected) {
                if (self.activeLock) self.activeLock.release();
                return;
            }

            self.checkModules("onUserPreJoin", [user, data], function (err, result) {
                if (result === ChannelModule.PASSTHROUGH) {
                    if (user.account.channelRank !== user.account.globalRank) {
                        user.socket.emit("rank", user.account.effectiveRank);
                    }
                    self.acceptUser(user);
                } else {
                    user.account.channelRank = 0;
                    user.account.effectiveRank = user.account.globalRank;
                    self.activeLock.release();
                }
            });
        }
    });
};

Channel.prototype.acceptUser = function (user) {
    user.channel = this;
    user.setFlag(Flags.U_IN_CHANNEL);
    user.socket.join(this.name);
    user.autoAFK();
    user.socket.on("readChanLog", this.handleReadLog.bind(this, user));

    Logger.syslog.log(user.realip + " joined " + this.name);
    if (user.socket._isUsingTor) {
        if (this.modules.options && this.modules.options.get("torbanned")) {
            user.kick("This channel has banned connections from Tor.");
            this.logger.log("[login] Blocked connection from Tor exit at " +
                            user.displayip);
            return;
        }

        this.logger.log("[login] Accepted connection from Tor exit at " +
                        user.displayip);
    } else {
        this.logger.log("[login] Accepted connection from " + user.displayip);
    }

    var self = this;
    user.waitFlag(Flags.U_LOGGED_IN, function () {
        for (var i = 0; i < self.users.length; i++) {
            if (self.users[i] !== user &&
                self.users[i].getLowerName() === user.getLowerName()) {
                self.users[i].kick("Duplicate login");
            }
        }

        var loginStr = "[login] " + user.displayip + " logged in as " + user.getName();
        if (user.account.globalRank === 0) loginStr += " (guest)";
        loginStr += " (aliases: " + user.account.aliases.join(",") + ")";
        self.logger.log(loginStr);

        self.sendUserJoin(self.users, user);
    });

    this.users.push(user);

    user.socket.on("disconnect", this.partUser.bind(this, user));
    Object.keys(this.modules).forEach(function (m) {
        if (user.dead) return;
        self.modules[m].onUserPostJoin(user);
    });

    this.sendUserlist([user]);
    this.sendUsercount(this.users);
    if (!this.is(Flags.C_REGISTERED)) {
        user.socket.emit("channelNotRegistered");
    }
};

Channel.prototype.partUser = function (user) {
    if (!this.logger) {
        Logger.errlog.log("partUser called on dead channel");
        return;
    }

    this.logger.log("[login] " + user.displayip + " (" + user.getName() + ") " +
                    "disconnected.");
    user.channel = null;
    /* Should be unnecessary because partUser only occurs if the socket dies */
    user.clearFlag(Flags.U_IN_CHANNEL);

    if (user.is(Flags.U_LOGGED_IN)) {
        this.broadcastAll("userLeave", { name: user.getName() });
    }

    var idx = this.users.indexOf(user);
    if (idx >= 0) {
        this.users.splice(idx, 1);
    }

    var self = this;
    Object.keys(this.modules).forEach(function (m) {
        self.modules[m].onUserPart(user);
    });
    this.sendUsercount(this.users);

    this.activeLock.release();
    user.die();
};

Channel.prototype.packUserData = function (user) {
    var base = {
        name: user.getName(),
        rank: user.account.effectiveRank,
        profile: user.account.profile,
        meta: {
            afk: user.is(Flags.U_AFK),
            muted: user.is(Flags.U_MUTED) && !user.is(Flags.U_SMUTED)
        }
    };

    var mod = {
        name: user.getName(),
        rank: user.account.effectiveRank,
        profile: user.account.profile,
        meta: {
            afk: user.is(Flags.U_AFK),
            muted: user.is(Flags.U_MUTED),
            smuted: user.is(Flags.U_SMUTED),
            aliases: user.account.aliases,
            ip: user.displayip
        }
    };

    var sadmin = {
        name: user.getName(),
        rank: user.account.effectiveRank,
        profile: user.account.profile,
        meta: {
            afk: user.is(Flags.U_AFK),
            muted: user.is(Flags.U_MUTED),
            smuted: user.is(Flags.U_SMUTED),
            aliases: user.account.aliases,
            ip: user.realip
        }
    };

    return {
        base: base,
        mod: mod,
        sadmin: sadmin
    };
};

Channel.prototype.sendUserMeta = function (users, user, minrank) {
    var self = this;
    var userdata = self.packUserData(user);
    users.filter(function (u) {
        return typeof minrank !== "number" || u.account.effectiveRank > minrank
    }).forEach(function (u) {
        if (u.account.globalRank >= 255)  {
            u.socket.emit("setUserMeta", {
                name: user.getName(),
                meta: userdata.sadmin.meta
            });
        } else if (u.account.effectiveRank >= 2) {
            u.socket.emit("setUserMeta", {
                name: user.getName(),
                meta: userdata.mod.meta
            });
        } else {
            u.socket.emit("setUserMeta", {
                name: user.getName(),
                meta: userdata.base.meta
            });
        }
    });
};

Channel.prototype.sendUserProfile = function (users, user) {
    var packet = {
        name: user.getName(),
        profile: user.account.profile
    };

    users.forEach(function (u) {
        u.socket.emit("setUserProfile", packet);
    });
};

Channel.prototype.sendUserlist = function (toUsers) {
    var self = this;
    var base = [];
    var mod = [];
    var sadmin = [];

    for (var i = 0; i < self.users.length; i++) {
        var u = self.users[i];
        if (u.getName() === "") {
            continue;
        }

        var data = self.packUserData(self.users[i]);
        base.push(data.base);
        mod.push(data.mod);
        sadmin.push(data.sadmin);
    }

    toUsers.forEach(function (u) {
        if (u.account.globalRank >= 255) {
            u.socket.emit("userlist", sadmin);
        } else if (u.account.effectiveRank >= 2) {
            u.socket.emit("userlist", mod);
        } else {
            u.socket.emit("userlist", base);
        }

        if (self.leader != null) {
            u.socket.emit("setLeader", self.leader.name);
        }
    });
};

Channel.prototype.sendUsercount = function (users) {
    var self = this;
    users.forEach(function (u) {
        u.socket.emit("usercount", self.users.length);
    });
};

Channel.prototype.sendUserJoin = function (users, user) {
    var self = this;
    if (user.account.aliases.length === 0) {
        user.account.aliases.push(user.getName());
    }

    var data = self.packUserData(user);

    users.forEach(function (u) {
        if (u.account.globalRank >= 255) {
            u.socket.emit("addUser", data.sadmin);
        } else if (u.account.effectiveRank >= 2) {
            u.socket.emit("addUser", data.mod);
        } else {
            u.socket.emit("addUser", data.base);
        }
    });

    self.modules.chat.sendModMessage(user.getName() + " joined (aliases: " +
                                     user.account.aliases.join(",") + ")", 2);
};

Channel.prototype.readLog = function (cb) {
    var maxLen = 102400;
    var file = this.logger.filename;
    this.activeLock.lock();
    var self = this;
    fs.stat(file, function (err, data) {
        if (err) {
            self.activeLock.release();
            return cb(err, null);
        }

        var start = Math.max(data.size - maxLen, 0);
        var end = data.size - 1;

        var read = fs.createReadStream(file, {
            start: start,
            end: end
        });

        var buffer = "";
        read.on("data", function (data) {
            buffer += data;
        });
        read.on("end", function () {
            cb(null, buffer);
            self.activeLock.release();
        });
    });
};

Channel.prototype.handleReadLog = function (user) {
    if (user.account.effectiveRank < 3) {
        user.kick("Attempted readChanLog with insufficient permission");
        return;
    }

    if (!this.is(Flags.C_REGISTERED)) {
        user.socket.emit("readChanLog", {
            success: false,
            data: "Channel log is only available to registered channels."
        });
        return;
    }

    var shouldMaskIP = user.account.globalRank < 255;
    this.readLog(function (err, data) {
        if (err) {
            user.socket.emit("readChanLog", {
                success: false,
                data: "Error reading channel log"
            });
        } else {
            user.socket.emit("readChanLog", {
                success: true,
                data: data
            });
        }
    });
};

Channel.prototype._broadcast = function (msg, data, ns) {
    sio.instance.in(ns).emit(msg, data);
};

Channel.prototype.broadcastAll = function (msg, data) {
    this._broadcast(msg, data, this.name);
};

Channel.prototype.packInfo = function (isAdmin) {
    var data = {
        name: this.name,
        usercount: this.users.length,
        users: [],
        registered: this.is(Flags.C_REGISTERED)
    };

    for (var i = 0; i < this.users.length; i++) {
        if (this.users[i].name !== "") {
            var name = this.users[i].getName();
            var rank = this.users[i].account.effectiveRank;
            if (rank >= 255) {
                name = "!" + name;
            } else if (rank >= 4) {
                name = "~" + name;
            } else if (rank >= 3) {
                name = "&" + name;
            } else if (rank >= 2) {
                name = "@" + name;
            }
            data.users.push(name);
        }
    }

    if (isAdmin) {
        data.activeLockCount = this.activeLock.count;
    }

    var self = this;
    var keys = Object.keys(this.modules);
    keys.forEach(function (k) {
        self.modules[k].packInfo(data, isAdmin);
    });

    return data;
};

module.exports = Channel;
