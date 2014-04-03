var MakeEmitter = require("../emitter");
var Logger = require("../logger");
var ChannelModule = require("./module");
var Flags = require("../flags");
var Account = require("../account");
var fs = require("fs");
var path = require("path");

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
        "./permissions": "permissions",
        "./chat": "chat",
        "./filters": "filters",
        "./emotes": "emotes",
        "./customization": "customization",
        "./opts": "options"
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
    fs.writeFile(file, json, function (err) {
        if (err) {
            Logger.errlog.log("Saving channel state failed! " + self.uniqueName);
        }
    });
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

Channel.prototype.joinUser = function (user, data) {
    var self = this;

    var oldAccount = user.account;
    user.refreshAccount({ channel: self.name }, function (err, account) {
        if (err) {
            Logger.errlog.log("user.refreshAccount failed at Channel.joinUser");
            return;
        }
        self.checkModules("onUserPreJoin", [user, data], function (err, result) {
            if (result === ChannelModule.PASSTHROUGH) {
                self.acceptUser(user);
            } else {
                user.account = oldAccount;
            }
        });
    });
};

Channel.prototype.acceptUser = function (user) {
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

    if (this.users.length === 0) {
        this.emit("empty");
    }
};

module.exports = Channel;
