var MakeEmitter = require("../emitter");
var Logger = require("../logger");
var ChannelModule = require("./module");
var path = require("path");

function Channel(name) {
    MakeEmitter(this);
    this.name = name;
    this.uniqueName = name.toLowerCase();
    this.modules = {};
    this.logger = new Logger.Logger(path.join(__dirname, "..", "..", "chanlogs",
                                              this.uniqueName));
    this.users = [];

    this.initModules();
    this.loadState();
}

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
};

Channel.prototype.saveState = function () {
    var self = this;
    Object.keys(this.modules).forEach(function (m) {
        self.modules[m].save({});
    });
};

Channel.prototype.joinUser = function (user, data) {
    /* TODO Wait for ready flag on the channel */
    var keys = Object.keys(modules);
    var self = this;
    var next = function (err, result) {
        if (result !== ChannelModule.PASSTHROUGH) {
            /* Either an error occured, or the module denied the user access */
            return;
        }

        var m = keys.shift();
        if (m === undefined) {
            /* No more modules to check */
            self.acceptUser(user);
            return;
        }

        var module = self.modules[m];
        module.onUserPreJoin(user, data, next);
    };

    next();
};

Channel.prototype.acceptUser = function (user) {
    this.logger.log("[login] Accepted connection from " + user.ip);
    if (user.is(User.LOGGED_IN)) {
        this.logger.log("[login] " + user.ip + " authenticated as " + user.getName());
    }

    this.users.push(user);

    user.socket.on("disconnect", this.partUser.bind(this, user));
    var self = this;
    Object.keys(this.modules).forEach(function (m) {
        self.modules[m].onPostUserJoin(user);
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
