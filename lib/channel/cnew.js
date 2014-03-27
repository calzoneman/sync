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
                                              this.uniquename));

    this.initModules();
    this.loadState();
}

Channel.prototype.initModules = function () {
    const modules = {
        "./test": "test"
    };

    var self = this;
    Object.keys(modules).forEach(function (m) {
        self.logger.log("[init] Initializing module " + modules[m]);
        var ctor = require(m);
        var module = new ctor(this);
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

module.exports = Channel;
