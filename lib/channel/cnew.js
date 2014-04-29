var MakeEmitter = require("../emitter");
var Logger = require("../logger");
var ChannelModule = require("./module");
var Flags = require("../flags");
var Account = require("../account");
var util = require("../utilities");
var fs = require("fs");
var path = require("path");
var sio = require("socket.io");

function Channel(name) {
    MakeEmitter(this);
    this.name = name;
    this.uniqueName = name.toLowerCase();
    this.modules = {};
    this.logger = new Logger.Logger(path.join(__dirname, "..", "..", "chanlogs",
                                              this.uniqueName));
    this.users = [];
    this.flags = 0;
    /* TODO load from DB */
    this.setFlag(Flags.C_REGISTERED);

    this.initModules();
    this.loadState();
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
        var wait = function () {
            if (self.is(flag)) {
                self.unbind("setFlag", wait);
                cb();
            }
        };
        self.on("setFlag", wait);
    }
};

Channel.prototype.initModules = function () {
    const modules = {
        "./permissions"   : "permissions",
        "./chat"          : "chat",
        "./filters"       : "filters",
        "./emotes"        : "emotes",
        "./customization" : "customization",
        "./opts"          : "options",
        "./playlist"      : "playlist",
        "./poll"          : "poll",
        "./kickban"       : "kickban"
    };

    var self = this;
    Object.keys(modules).forEach(function (m) {
        self.logger.log("[init] Initializing module " + modules[m]);
        var ctor = require(m);
        var module = new ctor(self);
        self.modules[modules[m]] = module;
    });
};

Channel.prototype.loadState = function () {
    var self = this;
    var file = path.join(__dirname, "..", "..", "chandump", self.uniqueName);

    /* Don't load from disk if not registered */
    if (!self.is(Flags.C_REGISTERED)) {
        /* TODO set unregistered permissions */
        return;
    }

    var errorLoad = function (msg) {
        if (self.modules.customization) {
            self.modules.customization.load({
                motd: {
                    motd: msg,
                    html: msg
                }
            });
        }

        self.setFlag(Flags.C_ERROR);
    };

    fs.stat(file, function (err, stats) {
        if (!err) {
            var mb = stats.size / 1048576;
            mb = Math.floor(mb * 100) / 100;
            if (mb > 1) {
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
};

Channel.prototype.checkModules = function (fn, args, cb) {
    var self = this;
    this.waitFlag(Flags.C_READY, function () {
        var keys = Object.keys(self.modules);
        args.push(cb);
        var next = function (err, result) {
            if (result !== ChannelModule.PASSTHROUGH) {
                /* Either an error occured, or the module denied the user access */
                cb(err, result);
                return;
            }

            var m = keys.shift();
            if (m === undefined) {
                /* No more modules to check */
                cb(null, ChannelModule.PASSTHROUGH);
                return;
            }

            var module = self.modules[m];
            module[fn].apply(module, args);
        };

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

    user.refreshAccount({ channel: self.name }, function (err, account) {
        if (err) {
            Logger.errlog.log("user.refreshAccount failed at Channel.joinUser");
            Logger.errlog.log(err.stack);
            return;
        }
        self.checkModules("onUserPreJoin", [user, data], function (err, result) {
            if (result === ChannelModule.PASSTHROUGH) {
                self.acceptUser(user);
            } else {
                user.account.channelRank = 0;
                user.account.effectiveRank = user.account.globalRank;
            }
        });
    });
};

Channel.prototype.acceptUser = function (user) {
    user.channel = this;
    user.setFlag(Flags.U_IN_CHANNEL);
    user.socket.join(this.name);
    Logger.syslog.log(user.ip + " joined " + this.name);
    this.logger.log("[login] Accepted connection from " + user.ip);
    if (user.is(Flags.U_LOGGED_IN)) {
        this.logger.log("[login] " + user.ip + " authenticated as " + user.getName());
    }

    this.users.push(user);

    user.socket.on("disconnect", this.partUser.bind(this, user));
    var self = this;
    Object.keys(this.modules).forEach(function (m) {
        self.modules[m].onUserPostJoin(user);
    });

    this.sendUserlist([user]);
    this.sendUsercount(this.users);
    user.waitFlag(Flags.U_LOGGED_IN, function () {
        self.sendUserJoin(self.users, user);
    });
};

Channel.prototype.partUser = function (user) {
    this.logger.log("[login] " + user.ip + " (" + user.getName() + ") " +
                    "disconnected.");
    user.channel = null;
    /* Should be unnecessary because partUser only occurs if the socket dies */
    user.clearFlag(Flags.U_IN_CHANNEL);

    if (user.is(Flags.U_LOGGED_IN)) {
        this.users.forEach(function (u) {
            u.socket.emit("userLeave", { name: user.getName() });
        });
    }

    var idx = this.users.indexOf(user);
    if (idx >= 0) {
        this.users.splice(idx, 1);
    }

    var self = this;
    Object.keys(this.modules).forEach(function (m) {
        self.modules[m].onUserPart(user);
    });
    this.sendUserLeave(this.users, user);
    this.sendUsercount(this.users);

    if (this.users.length === 0) {
        this.emit("empty");
    }
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
            ip: util.maskIP(user.ip)
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
            ip: user.ip
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
    self.users.filter(function (u) {
        return typeof minrank !== "number" || u.rank > minrank
    }).forEach(function (u) {
        if (u.rank >= 255)  {
            u.socket.emit("setUserMeta", {
                name: user.getName(),
                meta: userdata.sadmin.meta
            });
        } else if (u.rank >= 2) {
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
        if (u.name === "") {
            continue;
        }

        var data = self.packUserData(self.users[i]);
        base.push(data.base);
        mod.push(data.mod);
        sadmin.push(data.sadmin);
    }

    toUsers.forEach(function (u) {
        if (u.global_rank >= 255) {
            u.socket.emit("userlist", sadmin);
        } else if (u.rank >= 2) {
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
        if (u.global_rank >= 255) {
            u.socket.emit("addUser", data.sadmin);
        } else if (u.rank >= 2) {
            u.socket.emit("addUser", data.mod);
        } else {
            u.socket.emit("addUser", data.base);
        }
    });

    self.modules.chat.sendModMessage(user.getName() + " joined (aliases: " +
                                     user.account.aliases.join(",") + ")", 2);
};

Channel.prototype.sendUserLeave = function (users, user) {
    var data = {
        name: user.getName()
    };

    users.forEach(function (u) {
        u.socket.emit("userLeave", data);
    });
};

Channel.prototype._broadcast = function (msg, data, ns) {
    sio.ioServers.forEach(function (io) {
        io.sockets.in(ns).emit(msg, data);
    });
};

Channel.prototype.broadcastAll = function (msg, data) {
    this._broadcast(msg, data, this.name);
};

module.exports = Channel;
