function Channel(name) {
    MakeEmitter(this);
    var self = this;

    Logger.syslog.log("[LOAD] " + name);

    self.flags = 0;
    self.name = name;
    self.uniqueName = name.toLowerCase();
    self.users = [];
    self.modules = {};

    self.initModules();
    self.loadDump();
}

Channel.READY      = 1 << 0;
Channel.REGISTERED = 1 << 1;

Channel.prototype.initModules = function () {
    var modules = {
        "permissions": "./channel/permissions",
        "opts": "./channel/opts",
        "accesscontrol": "./channel/accesscontrol"
    };

    for (var key in modules) {
        this.modules[key] = require(modules[key])(this);
    }
};
