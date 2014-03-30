var MakeEmitter = require("../emitter");
var Logger = require("../logger");
var ChannelModule = require("./module");
var path = require("path");
var Flags = require("../flags");
var Account = require("../account");

function Channel(name) {
    MakeEmitter(this);
    this.name = name;
    this.uniqueName = name.toLowerCase();
    this.modules = {};
    this.logger = new Logger.Logger(path.join(__dirname, "..", "..", "chanlogs",
                                              this.uniqueName));
    this.users = [];
    this.flags = 0;

    this.initModules();
    this.loadState();
}

Channel.prototype.is = function (flag) {
    console.log(this.flags, this.flags & flag, Boolean(this.flags & flag));
    return Boolean(this.flags & flag);
};

Channel.prototype.setFlag = function (flag) {
    this.flags |= flag;
    this.emit("setFlag", flag);
    console.log('emitting setflag', flag);
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
            console.log('setflag cb');
            if (self.is(flag)) {
                self.unbind("setFlag", wait);
                cb();
            }
        };
        console.log('waiting');
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
    Object.keys(this.modules).forEach(function (m) {
        self.modules[m].load({});
    });

    console.log('setting c_ready');

    this.setFlag(Flags.C_READY);
};

Channel.prototype.saveState = function () {
    var self = this;
    Object.keys(this.modules).forEach(function (m) {
        self.modules[m].save({});
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
            console.log(m);
            module[fn].apply(module, args);
        };

        next(null, ChannelModule.PASSTHROUGH);
    });
};

Channel.prototype.joinUser = function (user, data) {
    var self = this;
    self.checkModules("onUserPreJoin", [user, data], function (err, result) {
        if (result === ChannelModule.PASSTHROUGH) {
            self.acceptUser(user);
        }
    });
};

Channel.prototype.acceptUser = function (user) {
    Logger.syslog.log(user.ip + " joined " + this.name);
    this.logger.log("[login] Accepted connection from " + user.ip);
    if (user.is(Flags.U_LOGGED_IN)) {
        this.logger.log("[login] " + user.ip + " authenticated as " + user.getName());
        Account.getAccount(user.getName(), user.ip, { channel: this.name },
                           function (err, account) {
            if (!err) {
                user.account = account;
            }
        });
    }

    this.users.push(user);

    user.socket.on("disconnect", this.partUser.bind(this, user));
    var self = this;
    Object.keys(this.modules).forEach(function (m) {
        console.log('onuserpostjoin', m);
        self.modules[m].onUserPostJoin(user);
    });
};

Channel.prototype.partUser = function (user) {
    this.logger.log("[login] " + user.ip + " (" + user.getName() + ") " +
                    "disconnected.");
    user.channel = null;
    user.clearFlag(User.IN_CHANNEL);

    if (user.is(User.LOGGED_IN)) {
        this.users.forEach(function (u) {
            u.socket.emit("userLeave", { name: user.name });
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
